# Asset Creation Rules — ASCII Sprite Pipeline

All visual assets must pass a two-step create → review gate.
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
Score each criterion 1–10, then compute the average.

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
