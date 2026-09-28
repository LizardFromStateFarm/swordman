# Art Engine (hybrid ink) — Reference
_Covers: renderer/engine/ink-renderer.js · renderer/engine/sprite-renderer.js · assets/sprites/ink-cultivator.js ·
assets/data/settings.js (artStyle) · renderer/game/settings.js · renderer/game/layout.js (canvas sizing) ·
scripts/smoke/scenarios/ink-art.js · Phase: 34 (roadmap A3-1) · Updated: 2026-09-27_

The HYBRID direction the user picked in A2 (ui-review.md → "A2 art bake-off"): (c)'s ink figure/scene/halo + (b)'s
glyph parts and thin rotating mote rings. A3-1 = the engine core + ONE cultivator (Qi Condensation, idle +
breakthrough) in the real game behind **Settings → Motion → Sprite art = Ink** (default Classic). A4-1 (below) gave every other sprite
state its ink art (realm variants). A3-2 (done 2026-09-27): part slots, expression frames, the failure/demotion
moment, authoring template in `.agents/rules/assets.md` → "Ink art".

## Realm variants (A4-1, 2026-09-27)
Every sprite state now has ink art, so Sprite art = Ink covers all 23 stages. Each variant `extends: 'meditating'` (or
another variant) and overrides only what changes; `InkRenderer.resolve(state)` merges it once (palette / background /
slots / halo / qiPearl / body key by key, everything else replaces) and caches the result.

| State | Stages | What the realm adds |
|---|---|---|
| `idle` | Mortal | plain hemp robe (`robe: 'hemp'`), empty hands, `aura: false`, no halo / rings / pearl / knot glyph, 5 faint motes |
| `meditating` | Qi Condensation | the base figure |
| `meditating_deep` | Foundation | `formation`: a ground array of two counter-turning dotted rings with travelling gaps + rune ticks; halo r 26 |
| `levitating` | Core Formation | `float` (lifted 9, bobbing) + a ground shadow; `qiPearl.color: 'gold'` (the golden core); `view` zoomed out for headroom |
| `transcending` | Nascent Soul → Immortal | double halo (`halo.outer`), a 4th ring, and `avatar`: the infant soul (big head via `headScale`) seated on a cloud of light above the crown, re-sampled on the figure's own dot pitch; `view` zoomed out more (figure ~25% smaller) |

Engine support: `view` (fit box instead of the scene; LOD still frames `figureBox`), `float`, `_groundShadow`,
`_formation`, `_avatar` / `_paintAvatar` (cached per size), `halo: null`, `qiPearl: null`, `halo.outer`. The whole
figure (lap included) now shudders on failure. Heaviest realm still draws in ~0.65 ms.

## Planned (PLAN.md Phase 39, user 2026-09-27)
- A5: the player picks face / hair / robe at every creation and rebirth (live ink preview); robe + effect changeable
  in a Wardrobe. A8: effects unlocked by realm, Arts and cultivation path. A9: robes unlocked by family/clan head, sect
  leader, sect ranks and in-world ranking placings. A10: inspect any person → their ink portrait (random look, highest
  unlocked effect). 3.2b: a `path` accent layer (Virtuous / Neutral / Demonic) over the robe, changing halo + motes.

## State
No game state. One presentation setting: `settings.artStyle` — `'classic'` | `'ink'` (per slot, SETTINGS_DEFS).

## API
- `SpriteRenderer(canvas)` (what game.js creates; `window.spriteRenderer` for smoke tests): same calls as the old
  `ASCIIRenderer` — `setState, setStageColor, setSize(w,h,scale), setSpeed, setReducedMotion,
  triggerBreakthroughBurst, stop` — plus `setArtStyle(style)`, `isInk()`. Routes to `.ink` when the style is Ink AND
  the last non-breakthrough state has `INK_ART[state]`; otherwise `.ascii`. Only the active engine runs its loop.
- `InkRenderer` — same API + `triggerFailure(demoted)`, `setSlots`. Test hooks: `freeze(t, bt, fail, demote)` / `resume()`,
  `still(w,h,dpr,t,{bt, crop, slots, fail, demote})` / `stillCanvas(...)` → PNG
  data URL at any size without touching the canvas, `perf(n)` → avg ms per frame.

## Data Shape (`INK_ART[spriteState]`, assets/sprites/ink-cultivator.js)
- 300×150 logical scene, figure centred on x=150. `figureBox` = what the small (banner) LOD frames.
- `parts[]` back → front: `{ id, layer: lap|body|head, mat, d, fold? }`. `d` = flat command array
  (`M L Q C` + `E cx cy rx ry` ellipse + `Z`). Materials: `robe cuff sash hair` → ink dots; `skin trim` → smooth fills.
  `fold {k, ang, warp, amp}` = soft tonal bands (never dark lines — user note).
- `strokes[]` = tapered brush strokes `{ layer, color, alpha, w, pts, after? }`; `after: <part id>` paints it right after
  that part (so later parts, e.g. the sword over the lap folds, cover it); `live: true` ones sway per frame (hair locks).
- **Only objects are solid** (user 2026-09-27, binding): `InkRenderer.SOLID` = mats `metal steel grip` (sword, hairpin,
  guard, pommel). Everything else (face, hands, neck, collar trim, hair, locks, halo) is ink dots. Smooth-filled faces
  (a portrait and abstract/gothic/sumi-e variants) were tried and rejected as "clip art".
- `dotFeatures[]` `{ part, color, w, pts }`: dots of that part within `w` of the polyline take the colour (eyes, brows,
  mouth, hand seal) — the pixelated dot face. The grid is aligned so a column sits on x = 150 (`_gx0`), rows at
  y = row × 1.5155; put features exactly on a row with `w` 0.6 so they are one dot tall and symmetric.
- **Slots (A3-2)**: `INK_ART.slots` = default option per kind; `INK_PARTS[kind][option]` (assets/sprites/ink-parts.js):
  face (calm / stern / youthful), hair (bun / loose / crown), robe (moon / azure / crimson / ink), weapon (sword / flute /
  none), aura (orbit / still / tempest). `_effective()` merges them in order robe → hair → weapon → face → aura: parts
  go `before`/`after` an anchor id, strokes + features appended, palette overrides, aura `effects` replace
  halo/rings/motes. API: `setSlots({kind: option|null})`, `slots()`, `InkRenderer.slotOptions(kind)`; SpriteRenderer
  forwards `setSlots`. No player UI yet (A5 / Phase 10: pick at creation, heirs inherit).
- **Expression frames**: face options carry `frames.bt` / `frames.strain` (feature overrides by `id`); the cache holds
  a head-layer variant per frame; the frame picks strain while failing, bt while bt > 0.5. `eyeGlow` dots glow.
- **Failure moment**: `triggerFailure(demoted)` (game.js on a failed breakthrough): `fail` eases 1 → 0 over 1.8 s —
  glow reddens, rings wobble and stall, the pearl gutters, the figure shudders, the scene dims, the halo cracks (dots
  drop out); demoted = the halo shatters and its dots fall. Breakthrough glow drops fast.
- **Moment hold**: SpriteRenderer ignores the per-notify stage state for 2.4 s after `breakthrough` (1.4 s after a
  failure) — fixes the 1.8c bug where the same-frame notify overwrote the breakthrough sprite (both engines).
- Live strokes (hair locks) and the halo ring are drawn as grid-snapped dots each frame.
- Equipment may be solid (user): the sword is vector parts `blade guard grip pommel` (mats `steel`/`grip`/`trim`) +
  strokes (edge highlight, fuller, grip wrap, tassel strands). Box-drawing glyphs for hilts rendered broken — avoid.
- `glyphs[]` = (b)-style glyph runs (sword across the knees, sash knot) with per-char palette `map`.
- Effects: `qiPearl`, `halo`, `rings[]` (tilted orbits: `rx ry tilt speed motes alpha`), `motes` (straight-rising),
  `background` (glow, moon, two ridge sine sums, mist band y's). Colours are palette keys only.

## Wiring
- index.html loads `ink-cultivator.js` (after the sprites) and `ink-renderer.js` + `sprite-renderer.js` (after
  ascii-renderer.js). game.js `new SpriteRenderer(...)`; settings.js `apply()` → `setArtStyle(set.artStyle)`.
- layout.js `_sizeCanvas()` → `setSize(w, h, k)`. Ink ignores `k`: it sets the backing store to w×h × devicePixelRatio
  (max 3), CSS size w×h, and fits the scene itself. Narrow screens now get the **full HUD width** (was capped at
  280px; height still `min(w,280)/2`) — both engines centre the figure.
- Render: `_buildCache` (once per size / dpr / stage colour / art) rasterises background, mist band, and each motion
  layer (lap/body/head) + its breakthrough gold-rim variant into offscreen canvases. `_drawTo` per frame = drawImage
  the layers with their motion + draw the effects. Loop capped at 30 fps.
- Motion: lap still; body scales vertically about `body.anchorY` (breathing); head translates with the shoulders; hair
  locks sway. Layers share edges only where motion is continuous, so no gaps open between them.
- Breakthrough: `setState('breakthrough')` eases `bt` 0→1 (back to 0 on the next stage state): gold rim on the outer
  silhouette, rings grow/speed up/turn gold, halo ripples, a soft light column, more motes.

## Invariants
1. No emoji; canvas glyphs only from the (b) glyph parts. The engine file needs `cjk-ok` on any CJK line.
2. Effects stay "sleek and clean" (user A2 notes): no spiral Qi stream, no motes drawn over the figure, no dark
   fold lines/spots on the figure, rings = several thin tilted orbits.
3. Nothing in the frame loop allocates per-dot work: dots are baked in the cache. Frame < 6 ms (measured 0.6 ms).
4. Small canvases (min(w/300, h/150) < 0.5, i.e. the banner) use the LOD: smooth fills, one ring, 4 motes.

## Gotchas
- Helper functions are globals with an `ink` prefix (`inkRnd`, `inkMix`, `inkBrush`…) — classic scripts share one scope.
- `reducedMotion` freezes time (no breathing, orbits or motes) instead of hiding everything.
- The ASCII engine assumes a 1× backing store; SpriteRenderer calls `setSize` on the engine it switches to, which
  resets the canvas width for it.
- Dot sampling uses `isPointInPath` on a hex-staggered grid (pitch 1.75): ~20 ms per cache build at Overlay size.
- Visual review: per the user's rule (2026-09-27) the user reviews art themselves — capture with
  `node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-art.js` → `scripts/smoke/out/ink-*.png`
  (`ink-still-*.png` = 4× engine renders, `ink-still-face/hilt.png` = 12× close-ups; the rest are in-app captures per layout mode + phone).
