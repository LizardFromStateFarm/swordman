# Asset Creation Rules — ASCII Sprite Pipeline

All visual assets must pass a two-step create → review gate, and the review is done by a separate agent (never
the creator), on the anchored 0–10 scale shared with UI reviews (`.agents/rules/ui-review.md`).
This file is the detailed reference; the summary lives in `CLAUDE.md`.

---

## Sprite format reference

Every entry in `CULTIVATOR_SPRITES` follows this shape:

```js
spriteName: {
  fps: Number,          // animation speed (0.4 = slow, 4 = fast)
  defaultColor: String, // fallback hex for unmapped characters
  colors: {             // character → CSS hex color
    'char': '#RRGGBB',
  },
  frames: [             // array of animation frames
    [                   // frame = array of equal-length strings
      "row 0 text",
      "row 1 text",
      // ...
    ],
  ],
}
```

Key characters and their semantic roles:
| Char | Meaning        | Typical color |
|------|----------------|---------------|
| `☯`  | Yin-yang / Dao | `#FFD700` gold |
| `卍`  | Swastika (spiritual) | `#FF6B6B` red |
| `⚡` | Lightning / tribulation | `#FFFFFF` white |
| `★✦✧`| Qi particles   | `#FFD700` or `#9B59B6` |
| `◉◕` | Eyes           | `#87CEEB` sky blue |
| `◆`  | Dantian / core | `#9B59B6` purple |
| `║╥` | Meridians      | Stage-specific color |
| `∿≋≈`| Qi waves       | Stage-specific color |

---

## Step 1 — Creation prompt

```
Create an ASCII sprite for: [SPRITE_NAME]

Game context:
  - Wuxia cultivation idle game
  - Renders at 14px Courier New on a 300×172px dark canvas (#08040E background)
  - Glow effect applied via canvas shadowBlur to any character in the colors map
  - Variable-width chars (CJK = ~2× width) are handled by the renderer

Hard constraints:
  - Width: 8–14 visible characters per row
  - Height: 7–10 rows per frame
  - Frames: minimum 2, maximum 6
  - The sprite must visually represent: [WHAT IT REPRESENTS]
  - Must feel different from existing sprites: idle, meditating, meditating_deep, levitating, transcending, breakthrough

Soft goals:
  - Evoke [EMOTIONAL/NARRATIVE QUALITY]
  - Use characters from the semantic table where appropriate
  - Each frame should differ enough that animation is perceptible

Output exactly: a JS object with fps, defaultColor, colors, frames — no surrounding code.
```

---

## Step 2 — Review prompt

```
Rate this ASCII art sprite for a wuxia cultivation idle game.
Score each criterion 0–10 on this anchored scale, then compute the average:
  0 garbage/broken · 2 works but ugly · 4 plain/forgettable · 6 decent, nothing special ·
  8 polished + atmospheric, would pass in a released indie game · 10 "can't believe this is ASCII art"
Be stingy: an 8 is earned, a 9+ is rare. (Same scale as .agents/rules/ui-review.md.)
Always review from a screenshot of the sprite running in the real app, not only the text.

Criteria:
1. Visual clarity      — at 14px monospace, the sprite reads as a recognizable figure
2. Wuxia aesthetic     — colors, characters, and shapes evoke cultivation/martial arts
3. Animation quality   — frames differ meaningfully; perceived motion is smooth
4. Color harmony       — palette complements dark bg (#08040E) and parchment text (#E0CFA8)
5. Uniqueness          — memorable silhouette, not a clone of the existing sprites

Sprite under review:
[PASTE FULL SPRITE OBJECT HERE]

Required output:
  Score breakdown (criterion: N/10)
  Overall average: X.X / 10
  PASS (≥8.0) or FAIL (< 8.0)
  If FAIL: specific issues per criterion and a revised asset
```

---

## Step 3 — Gate

| Result | Action |
|--------|--------|
| Average ≥ 8.0 | Add to `assets/sprites/cultivator-sprites.js` with a comment: `// Review score: X.X` |
| Average < 8.0 | Apply reviewer's suggested revisions, re-run Step 2 |
| 3 cycles, still < 8.0 | Present both versions to user for decision |

---

## Existing sprite states (do not duplicate their visual style)

| State | Used for | Visual character |
|-------|----------|-----------------|
| `idle` | Mortal pre-cultivation | Simple standing figure, muted colors |
| `meditating` | Qi Condensation + Foundation Building | Cross-legged, soft blue Qi waves |
| `meditating_deep` | Foundation Building late + Core Formation | Deeper blue/purple glow, lotus symbols |
| `levitating` | Core Formation + Nascent Soul | Figure hovering, purple energy tether |
| `transcending` | Nascent Soul+ | Gold everywhere, lightning accents |
| `breakthrough` | Breakthrough attempt animation | Fast-fps, white/gold flashes |

---

## Ink art (hybrid engine) — authoring template (A3-2, 2026-09-27)

New art is authored for the hybrid ink engine (`renderer/engine/ink-renderer.js`, doc: `docs/systems/art-engine.md`),
not as grid ASCII. **Review:** the user reviews art directly (screenshots from `scripts/smoke/scenarios/ink-art.js`),
no reviewer agents for now.

**Binding rules (user):**
1. Only OBJECTS may be solid fills (mats `metal steel grip jade`: weapons, hairpins, crowns, instruments). Everything
   else (skin, face, hands, hair, robe, trim, halo) is ink dots. Solid faces/halos were rejected as "clip art".
2. Faces are pixelated dot faces: features are `features` (dot runs), one dot tall (`w: 0.6`) on an exact grid row,
   symmetric about x = 150. Grid: a column on x = 150, rows at y = row × 1.5155 (odd rows offset ±0.875).
3. Effects stay sleek and clean: thin tilted orbit rings, straight-rising motes behind the figure, no spiral streams,
   no dark fold lines or spots on the figure. No emoji anywhere.

**A new base figure** (`INK_ART[spriteState]`, `assets/sprites/ink-*.js`): 300×150 scene, figure centred on x = 150;
`parts` back → front (`{ id, layer: lap|body|head, mat, d, fold? }`, `d` = flat `M L Q C E Z` command array);
`body.anchorY` for breathing; `palette` keys only (no literals in parts); `slots` = the default option per slot;
`halo`, `rings`, `motes`, `qiPearl`, `background`, `figureBox` (banner framing).

**A new slot option** (`INK_PARTS[kind][id]` in `assets/sprites/ink-parts.js`; kinds face / hair / robe / weapon / aura):
```js
myOption: { label: 'Shown name',
  parts:    [{ id, before: 'face' | after: 'lap', layer, mat, d }],   // hair / weapon shapes
  strokes:  [{ layer, color, alpha, w, pts, after?, live? }],          // object details; live = swaying dotted strand
  features: [{ id, part: 'face', color, w: 0.6, pts }],               // face: dot features
  frames:   { bt: [{ id, color: 'eyeGlow' }], strain: [{ id, pts }] }, // face: expression frames by id
  palette:  { robe: '#…', … },                                        // robe colours
  effects:  { rings: [...], motes: {...} } },                         // aura
```
**A realm variant** (A4-1; one per sprite state in `assets/sprites/ink-cultivator.js`): `INK_ART.<state> = { extends:
'meditating', … }` overrides only what the realm changes (palette / background / slots / halo / qiPearl / body merge key
by key; the rest replaces). Realm effects: `aura: false` (ignore the aura slot), `halo: null` / `qiPearl: null`,
`halo.outer` (second ring, ratio), `qiPearl.color` (palette key, e.g. the golden core), `formation {cx cy rx ry speed
alpha}`, `float {y bob shadow}`, `view` (zoom-out box for headroom), `dragons [{cx cy rx ry tilt speed phase arc size wave bob tier color}]`
(Qi dragons, tier 1 baby → 4 golden), `swords {cx cy r n spread len}`, `lotus {x y w h n}`, `ribbons [{pts color w wave}]`,
`pillar {x y w alpha color}`, `halo.rays` / `rayLen`. A variant may replace `parts` / `strokes` / `dotFeatures` wholesale (the Mortal). `out/ink-realms-sheet.png` shows every realm, idle + breakthrough.

**Check it:** `node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-art.js` → `out/ink-slots-sheet.png` (every option),
`ink-still-*.png` (4×/12× stills incl. fail / demote / face-bt / face-strain), in-app captures per layout mode. Hand the
screenshots to the user.
