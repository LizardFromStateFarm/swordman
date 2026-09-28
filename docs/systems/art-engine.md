# Art Engine (hybrid ink) — Reference
_Covers: renderer/engine/ink-renderer.js · renderer/engine/sprite-renderer.js · assets/sprites/ink-cultivator.js ·
assets/data/settings.js (artStyle) · renderer/game/settings.js · renderer/game/layout.js (canvas sizing) ·
scripts/smoke/scenarios/ink-art.js · Phase: 34 (roadmap A3-1) · Updated: 2026-09-27_

The HYBRID direction the user picked in A2 (ui-review.md → "A2 art bake-off"): (c)'s ink figure/scene/halo + (b)'s
glyph parts and thin rotating mote rings. A3-1 = the engine core + ONE cultivator (Qi Condensation, idle +
breakthrough) in the real game behind **Settings → Motion → Sprite art = Ink** (default Classic). Every other sprite
state keeps the old grid ASCII until A4 re-arts it. A3-2 (next): part slots for customization, art-format docs,
`.agents/rules/assets.md` authoring template.

## State
No game state. One presentation setting: `settings.artStyle` — `'classic'` | `'ink'` (per slot, SETTINGS_DEFS).

## API
- `SpriteRenderer(canvas)` (what game.js creates; `window.spriteRenderer` for smoke tests): same calls as the old
  `ASCIIRenderer` — `setState, setStageColor, setSize(w,h,scale), setSpeed, setReducedMotion,
  triggerBreakthroughBurst, stop` — plus `setArtStyle(style)`, `isInk()`. Routes to `.ink` when the style is Ink AND
  the last non-breakthrough state has `INK_ART[state]`; otherwise `.ascii`. Only the active engine runs its loop.
- `InkRenderer` — same API. Test hooks: `freeze(t, bt)` / `resume()` (hold one moment), `still(w,h,dpr,t,bt,crop?)` → PNG
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
- **Face slot**: `faces.{dotted}` `{ label, features, palette?, d? }`, `setFaceStyle` / `faceStyles()`, merged by
  `_effective()`. Live strokes (hair locks) and the halo ring are drawn as grid-snapped dots each frame.
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
