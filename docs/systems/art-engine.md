# Art Engine (hybrid ink) — Reference
_Covers: renderer/engine/ink-renderer.js · renderer/engine/sprite-renderer.js · assets/sprites/ink-cultivator.js ·
assets/data/settings.js (artStyle) · renderer/game/settings.js · renderer/game/layout.js (canvas sizing) ·
scripts/smoke/scenarios/ink-art.js · death-moment.js · Phase: 34 (roadmap A3-1 … A4-3) · Updated: 2026-09-28_

The HYBRID direction the user picked in A2 (ui-review.md → "A2 art bake-off"): (c)'s ink figure/scene/halo + (b)'s
glyph parts and thin rotating mote rings. A3-1 = the engine core + ONE cultivator (Qi Condensation, idle +
breakthrough) in the real game behind **Settings → Motion → Sprite art = Ink** (the default since A4-4; old saves on the old Classic default move once, `inkDefaultMigrated`). A4-1 (below) gave every other sprite
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
`INK_BEASTS` (assets/sprites/ink-beasts.js), keyed by `BEAST_TYPES[].spriteState`: Spirit Fox (seated facing you, four flame tails fanned behind, burning into foxfire), Thunder Eagle (perched on a crag facing you, wings raised in a V of feather blades, white crested head, cyan eyes, gold beak/talons, lightning `bolts`), Void Hound (a wolf seated facing you before a rift = `formation` with `core: true`, collar of jagged hackles, fangs, smoke tail). Redrawn 2026-09-28: dots only, angular, front-facing (side profiles rejected). Each `extends: '_base'` in its own table and sets `glow` (its Qi colour).
Engine support added: per-instance art table (`new InkRenderer(cv, { table: INK_BEASTS, skipHidden: true })`,
`InkRenderer.has/resolve(state, table)`), extra motion layers (`layerOrder` + `motion[layer] = { pivot, amp, speed,
phase, scaleY }`: tails sway, wings beat), `body.headY`, `motes.color / y0 / rise`, `bolts`, the rift core, LOD judged
against the framed `view`, `skipHidden` (no drawing while the canvas is off screen).
UI: `BeastPortraits` (renderer/game/beast-portrait.js) fills `.beast-portrait` placeholders in Roam → Beasts (encounter
and companion cards) with pooled canvases (one per encounter/beast id; a re-render moves the canvas, no cache rebuild;
unused ones are stopped and dropped). Sprite art = Classic → the ASCII sprite with all its frames cycling (fixes the 1.8c
"beasts show frame 0 only" bug). Portrait frame ~0.2 ms. The beast names no longer carry CJK subtitles.

## Raster beasts: the bake pipeline (2026-09-28)
Hand-typed polygon beasts read as "awkward and childish" (user); beasts are now made from **the user's own art**.
1. **Source image** → `example_art/<name>.png` (or anywhere). The user's own work (they generate it; commercial use OK).
   Best: the beast alone on black or a plain backdrop, head large in frame, any pose, ~1536 px wide.
2. **Bake** → `npx electron scripts/art/ink-bake.js [id]` with a spec in `scripts/art/ink-bake.json`:
   `{ id, src, crop: [x0 y0 x1 y1] (source px, aim for ~1.37:1), width: 200 (dots across), detail: 0.028, lift: 0.12,
   minL, close, minArea, erase: [[poly]], keep: [[poly]] }` (polygons in map px). Background removal = texture detail
   (fur/feathers are textured, a painted glow backdrop is smooth) + brightness above the local backdrop, then close
   gaps, fill holes, drop specks. Writes **the dot map** `assets/sprites/beasts/<id>.png` (1 px = 1 dot, alpha 0 = no
   dot; rows are stretched 1/0.866 for the hex grid) and a cut-out preview `scripts/art/out/<id>.mask.png`.
3. **Edit (optional)** the dot map in any pixel editor (Paint.NET, Aseprite, Photoshop): erase stray dots (alpha 0),
   recolour, brighten eyes. Re-baking overwrites hand edits, so either fix the bake with `erase` / `keep` polygons or
   stop re-baking that beast once you edit by hand.
4. **Wire** in `INK_BEASTS` (assets/sprites/ink-beasts.js): `raster: { map: 'sprites/beasts/<id>.png', box: [x0 y0 x1 y1]
   (scene), regions: [{ layer, mask: [[mx, my], ...] }], minL, gain, sat, gamma }` + `layerOrder` / `motion` for the
   region layers (tails sway, wings beat), `edgeGlow`, `motes`, `bolts`, `formation`. Paths are relative to assets/
   (`InkRenderer.assetUrl` finds `../assets/` on desktop, `assets/` in the mobile web root).
5. **Look + review** → `node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-beasts-sheet.js` (sheet) and
   `scenarios/ink-beasts.js` (in-app, every layout), reviewer agent, then the user.

**Roster (2026-09-28):** 10 beasts in scripts/art/ink-bake.json, all from the user's transparent PNGs in example_art/
(cut out by alpha; the detector is the fallback for opaque sources). Maps are contain-fitted into the box (tall dragons
and the qilin keep the same dot size). Variants are INK_BEASTS entries `<id>__<variant>` that `extends` the beast and
set `raster.hue` (YIQ rotation; the wheel turns BACKWARDS: purple → red ≈ -90, gold → red ≈ +40) and/or `raster.tint` +
`tintAmt`, plus glow colours. Motion pivots and glints take `map: [mx, my]` (dot-map px). A layer may not be named
`head` (that name is the cultivator's head transform); use `neck`. Beasts with no Classic ASCII sprite keep their ink
portrait under Sprite art = Classic.

Engine (`_rasterGrid` / `_paintRaster`): each opaque map pixel → a dot at its hex position; brightness = ½ luma + ½
max channel (saturated blues/violets count as bright); per-beast **auto exposure** (92nd percentile → 0.92, × `gain`);
dot radius `P·(0.14 + 0.4·L^gamma)` and alpha grow with brightness, dim dots thin out at random (ink, not a photo);
silhouette dots take `edgeGlow`; `tone` (< 1) lifts a dark beast's shadows; art `glints: [{x, y, r, color}]` = pulsing eye/gem lights (scene units); region dots bordering the still body are drawn in **both** layers so a sway never opens
a seam; **occlusion**: with more than one layer, the figure composes on its own canvas (`C.fig`) and each
layer first erases (destination-out) what lies behind its solid silhouette mask (`_paintRasterMask`, discs of 0.62 dot
pitch), so a swaying tail / beating wing never shows through the body's dot gaps. Region masks must take in a WHOLE
moving part (the fox's lower tail curl included), or the part tears where it is split; breakthrough rim = gold on the silhouette. The dot grid is cached per map + box; the image loads async
(`InkRenderer.image`) and the cache rebuilds on load.

## Realm scenery + death moment (A4-3, 2026-09-28)
Each realm now stands in its own place (all dots, no wash; data in `INK_ART[state].background`).
User cycles 2-3 (2026-09-28): the realms are a **journey upward** (desert → grasslands → the foot of a mountain → the peaks → the clouds → above the earth → the stars) and **every background moves**. `peaks` ridgelines are a random walk with spurs.

| Realm | Scene | `scenery` (baked into C.bg) | `ambience` (per frame) |
|---|---|---|---|
| Mortal | dusk over the home paddies | `fields`, `hut`; `moon.sun` (a low sun); `ridges: true` | `fireflies` |
| Qi Condensation | moonlit grasslands (user cycle 3: Mortal reads as a desert) | gentle ridges, `tree` | `grass` (blades + wildflowers, a gust rolls across ~3 s), `cloudBank` wisps (`gap`), `fireflies`, `stars` |
| Foundation | the foot of a great mountain | `peaks` (`back`: a shouldered massif, crown off-centre, snow thinning down the slopes), a thin `bigFalls` down its face, foothill ridges + `pines` | `bigFalls`, mist `cloudBank`, cold `grass`, `birds`, `stars` |
| Core | the mountains: hovering over a summit | `peaks` far + near (lit left faces, snow) | `cloudBank`, `birds` (cranes), `stars` |
| Nascent Soul | in the clouds | `cloudSea` | 3 × `cloudBank` (depths), `birds`, `stars` |
| Spirit Severing | above the earth | `earthRim` (atmosphere) | `earth` (the planet turns), `stars` (`avoid` the disc) |
| Ascension | among the stars | `nebula` (galaxy band + clouds) | `stars`, `bigStars` (four dotted spikes flare), `shooting` |

Older kinds kept for later scenes: `cliff falls lake pads islands rays rainbow`, `lanterns petals lightning shimmer`.
Engine notes: `ridges: false` skips the mountain ridges; `mistA: 0` skips the mist; `float` without `shadow` casts none.
`cloudBank` pre-renders a seamless 600-wide strip per cache (`C.amb`) and tiles it with a drift. `earth`: a sphere sampled on
a dot grid once per cache, tilted (`tilt`, default 1.2 rad) so the band we see is low latitudes; land/cloud come from smooth
value-noise tables built once per app (`InkRenderer._earthTbl`, bilinear per dot); redrawn into its own canvas ~10×/s. Smoke
writes `out/ink-motion-sheet.png` (each moving realm at three moments).

- Background keys: `moon: { x, y, r, sun?, a? }` (`a` brightens, `null` = none), `mistA` (mist strength), `scenery[]`,
  `ambience[]`, ridge params per realm. **`background` merges key by key**, so every realm sets its own `scenery` +
  `ambience` (else it inherits the previous realm's). Palette keys: `pine field fieldWater roof wall lamp rock rockHi
  water cloud cloudHi lake lakeHi lantern pad bud petal bolt ridgeRim isleRock isleHall`.
- Engine: `_scenery(kind)`, `_ambience(kind)`, `_dotPoly(pts, col, pitch, rad, alpha, shade)` (hex dots inside a
  polygon, `shade(x,y)` → radius factor), `_ridge()`, `inkRnd2(x, y)` (2-D noise: a linear seed like `x*5+y*3` bands
  diagonally — used for every scenery texture). LOD (banner) skips scenery + ambience.
- **Death moment**: `InkRenderer.triggerDeath('fall' | 'ascend')` / `clearDeath()`; `death` eases 0 → 1 over
  `DEATH_SECONDS` (3.2 s, real time; Reduced motion = a 1.2 s plain fade). Everything in front of the scenery is drawn on
  `C.dth`; `_deathDots` samples the figure layers once (a 2.1-unit grid, colour per cell) and each dot lifts off at its
  `delay` (fall: head first, turns ash-grey, lifts then sinks on the wind, the scene dims; ascend: feet first, turns
  gold and rises in a column of light, bt rim on) leaving a hole behind it (destination-out) — the dissolve front.
  `SpriteRenderer.playDeath(kind)` returns how long game.js waits before the death card (0 on Classic art) and holds the
  dying figure's state until `clearDeath()` (called when the death card closes). `ascend` switches to the Ascension art
  first. game.js: the `lastReincarnation` watcher + `_deathHoldUntil` (the interlude card does not pop early). The state has
  already become the heir's when the watcher fires, so it passes the dying realm (`summary.stageAtDeath`, new in _die) and
  its colour to `playDeath(kind, spriteState, color)`; the stage colour is held too.
- Smoke gotcha: dev saves have Auto-Breakthrough on and plenty of Qi, so setting `stageIndex = 0` breaks through to Qi
  Condensation within a tick; zero `qi` and switch `automation.autoBreakthrough` off before capturing a realm.
- Smoke: `scenarios/ink-art.js` also writes `out/ink-death-sheet.png` (4 moments × fall/fall/ascend) and checks the live
  moment; `scenarios/death-moment.js` = the real flow (card waits, opens, closing it clears; Classic opens at once).
  Ascension frame ~3.9 ms (budget 6).

## Immortal Ascension cinematic (Phase 40b, 2026-09-28)
`renderer/engine/ascension-cinematic.js` → `AscensionCinematic`: a ~9 s full-window scene for a successful Ascension Trial
(storm gathers → three bolts → the figure rises up a pillar of light, dragons circling → the clouds part into a dotted
heavenly gate → it enters → white-gold flash → afterglow). It reuses the engine for the figure only: `new InkRenderer(canvas,
{ bare: true })`. **`bare`** skips the cached background, the mist, the realm ambience, the ground shadow and the
art's own `pillar` (which would be clipped by the figure canvas), so the figure + its effects (halo, rays, swords, dragons,
motes, rim light) composite cleanly over another scene. Everything else (clouds, gate, sea, bolts, flash) is drawn by the
cinematic in the same ink-dot language. Full details, timings and tests: docs/systems/soul-points.md → "As-built (40b)".

## Planned (PLAN.md Phase 39, user 2026-09-27)
- A5: the player picks face / hair / robe at every creation and rebirth (live ink preview); robe + effect changeable
  in a Wardrobe. A8: effects unlocked by realm, Arts and cultivation path. A9: robes unlocked by family/clan head, sect
  leader, sect ranks and in-world ranking placings. A10: inspect any person → their ink portrait (random look, highest
  unlocked effect). 3.2b: a `path` accent layer (Virtuous / Neutral / Demonic) over the robe, changing halo + motes.

## State
No game state. One presentation setting: `settings.artStyle` — `'ink'` (default since A4-4) | `'classic'` (per slot, SETTINGS_DEFS). A4-4 migration: a save without `inkDefaultMigrated` that sits on `'classic'` moves to `'ink'` once and logs "…Settings → Sprite art → Classic" (game-state `_ensurePhase20CFields`; new lives start with the flag set). The Classic sprites (`cultivator-sprites.js`, `beast-sprites.js`) are emoji-free since A4-4 (⚡ → ϟ, ☯ → ◎) and `npm test`'s emoji lint covers `assets/sprites/`.

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
- **Raster art (2026-09-28, prototype):** `raster: { src, crop, box, mask?, regions?: [{layer, mask}], minL, gain, sat, gamma }`
  samples a source picture onto the hex dot grid (`_rasterGrid` caches per src/crop/box/pitch; `InkRenderer.image()` loads
  async and rebuilds the cache on load). Brightness → dot size via `gamma` (mid-tones open gaps), dim dots thin out, silhouette
  edge takes `edgeGlow`; `regions` put e.g. the tails on a swaying layer. Demo: `scenarios/ink-raster-demo.js` (example_art/fox.png).
  Source images: transparent background, head large in frame, the user's own art.
- **Symmetry:** a part / stroke / dot feature with `mirror: true` gets a reflected copy across the scene centre
  (`inkMirrorAll` in `_effective`; id + '_m', layer = `mirrorLayer` if set). Bolts take `avoid: [x0, x1]` (never across the face).
  Parts: `dissolve: [x0 y0 x1 y1]` thins into loose dots; art `edgeGlow` lights the silhouette.
- **Dots only, no wash** (user 2026-09-28, standard for new art): art sets `underpaint: false` so no colour wash is drawn
  under the dots (the A3 cultivator still has it, grandfathered). Parts may set `lift` (tone offset, -1..1). Rules:
  .agents/rules/assets.md → Ink art.
- Dot sampling uses `isPointInPath` on a hex-staggered grid (pitch 1.75): ~20 ms per cache build at Overlay size.
- Visual review (user 2026-09-28): one fresh reviewer agent first (fix its blockers), then the user decides — capture with
  `node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-art.js` → `scripts/smoke/out/ink-*.png`
  (`ink-still-*.png` = 4× engine renders, `ink-still-face/hilt.png` = 12× close-ups; the rest are in-app captures per layout mode + phone).
