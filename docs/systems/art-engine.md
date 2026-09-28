# Art Engine (hybrid ink) — Reference
_Covers: renderer/engine/ink-renderer.js · renderer/engine/sprite-renderer.js · assets/sprites/ink-cultivator.js ·
assets/data/settings.js (artStyle) · renderer/game/settings.js · renderer/game/layout.js (canvas sizing) ·
scripts/smoke/scenarios/ink-art.js · Phase: 34 (roadmap A3-1) · Updated: 2026-09-27_

The HYBRID direction the user picked in A2 (ui-review.md → "A2 art bake-off"): (c)'s ink figure/scene/halo + (b)'s
glyph parts and thin rotating mote rings. A3-1 = the engine core + ONE cultivator (Qi Condensation, idle +
breakthrough) in the real game behind **Settings → Motion → Sprite art = Ink** (default Classic). A4-1 (below) gave every other sprite
state its ink art (realm variants). A3-2 (done 2026-09-27): part slots, expression frames, the failure/demotion
moment, authoring template in `.agents/rules/assets.md` → "Ink art".

## Realm variants (A4-1, 2026-09-27; revised the same day on user feedback)
User direction: the realms must look **wildly different**, and the high realms must be something players look forward
to. The Mortal has no robe (a shirtless peasant); the halo first appears at Foundation; an infant-soul figure was
tried for Nascent Soul and **rejected as ugly**. It was replaced by Qi dragons (spirits of Qi, not beasts) that rank up with the realm.
Seven sprite states now (stages.js: Spirit Severing = `severing`, Ascension = `ascended`; the classic sprite aliases
both to `transcending` in cultivator-sprites.js). Each variant `extends` the previous realm; `InkRenderer.resolve(state)`
merges it once (palette / background / slots / halo / qiPearl / body key by key, everything else replaces).

| State | Realm | What the realm adds |
|---|---|---|
| `idle` | Mortal | own `parts`: bare torso + arms (skin dots, anatomy dotFeatures), hemp trousers, rope belt; hair `rag`; no Qi effects (`aura: false`) |
| `meditating` | Qi Condensation | robe, rings, Qi pearl, **no halo** |
| `meditating_deep` | Foundation | the halo appears; `formation` array on the ground |
| `levitating` | Core Formation | `float` + ground shadow, golden core pearl, azure robe + jade crown, 1 baby dragon (tier 1) |
| `transcending` | Nascent Soul | 2 young dragons (tier 2: mane, fins), double halo, `lotus` of light, jade `ribbons`, crimson robe |
| `severing` | Spirit Severing | 2 grown dragons (tier 3: antlers, claws, chased pearls), `swords` fan ×9, sun-disk halo (`halo.rays`), sovereign-black robe, crimson sky |
| `ascended` | Ascension | 3 golden dragons (tier 4), ×11 swords, celestial white-gold robe, heaven's `pillar`, gold dawn sky |

Engine painters: `_dragons` (spine sampled along a tilted orbit, undulating; batched body/scale fills; back/front half
split by orbit side), `_swordFan` (solid objects), `_lotus` (back + front petal rows), `_ribbons` (grid-snapped dot
bands that fray at the tip), `_pillar`, halo `rays`, `_formation`, `_groundShadow`, `view` zoom. Heaviest realm
(Ascension) ~3.9 ms per frame at Overlay size (budget 6 ms).

**Accepted by the user** after cycle 2 (2026-09-27: "that is perfect it looks great").

## Beasts (A4-2, 2026-09-28)
`INK_BEASTS` (assets/sprites/ink-beasts.js), keyed by `BEAST_TYPES[].spriteState`: Spirit Fox (seated, two plumed tails
curling up at the sides, spirit-blue eyes, foxfire motes), Thunder Eagle (wings raised on a crag and beating, white head,
gold beak/talons, lightning `bolts`), Void Hound (wolf head, smoke hackles, glowing void cracks, stepping out of a rift =
`formation` with `core: true`). Each `extends: '_base'` in its own table and sets `glow` (its Qi colour).
Engine support added: per-instance art table (`new InkRenderer(cv, { table: INK_BEASTS, skipHidden: true })`,
`InkRenderer.has/resolve(state, table)`), extra motion layers (`layerOrder` + `motion[layer] = { pivot, amp, speed,
phase, scaleY }`: tails sway, wings beat), `body.headY`, `motes.color / y0 / rise`, `bolts`, the rift core, LOD judged
against the framed `view`, `skipHidden` (no drawing while the canvas is off screen).
UI: `BeastPortraits` (renderer/game/beast-portrait.js) fills `.beast-portrait` placeholders in Roam → Beasts (encounter
and companion cards) with pooled canvases (one per encounter/beast id; a re-render moves the canvas, no cache rebuild;
unused ones are stopped and dropped). Sprite art = Classic → the ASCII sprite with all its frames cycling (fixes the 1.8c
"beasts show frame 0 only" bug). Portrait frame ~0.2 ms. The beast names no longer carry CJK subtitles.

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
