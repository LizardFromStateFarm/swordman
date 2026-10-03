# Scene Art (Sect Base) — Reference
_Covers: assets/scenes/sect-base-scene.js · renderer/engine/scene-renderer.js · renderer/game/base-view.js · Phase: 38A (A7) · Updated: 2026-10-02_

A **large, view-only** ink diorama of your founded sect's compound in a new **Sect → Base** sub-tab. It grows with
live state (buildings raised, Sect Hall level, disciples, fame, a damaged Defensive Array) and is animated by time.
Building and upgrading still happen in the existing rows (Sect → Halls) — the scene only ever *reflects* state
(user rule 2026-09-27). Phase 38B (the Immortal Island map) will reuse the same scene layer after Phase 26.

## State
Reads (never writes):
- `s.ownSect.{founded, name, hallLevel, buildings, disciples}` — the compound's structures and their count.
- `s.derived.{sectFame, arrayDamaged}` — banners and the ward's dim/bright state (`arrayDamaged` mirrors
  `sectWar.arrayDamagedUntil > now`, the same term `_recalc` uses to drop the Defensive Array's war bonus).
- `s.derived.stage.color` — tints the scene's sky glow (the compound sits in your realm).
The scene owns **no state**. `buildSectScene()` is a pure read.

## API
- `SceneRenderer.buildSectScene(s) → { background, sig }` (static, DOM-free) — turns live state into the scene
  descriptor `{ scenery[], ambience[], ... }` plus a `sig` string that changes whenever anything visible changes.
- `new SceneRenderer(canvas, { skipHidden })` — extends `InkRenderer`; draws a scene, not a figure.
- `setScene(desc)` — swap the descriptor, invalidate the baked cache, start the rAF loop.
- `triggerGrow(x, y)` — play the ~2.2 s build-growth burst at a point.
- inherited: `setSize(w, h)`, `setStageColor(hex)`, `setReducedMotion(on)`, `stop()`, `stillCanvas(...)`, `perf()`.
- `_dpr()` is overridden to force a **≥2× backing store** — on a 1-DPR monitor a 1× render made the ink dots sub-pixel
  (a grey smear). The browser down-scales it, so the dots stay fine and crisp.

## Data Shape
- `SECT_SCENE.box = [0,0,420,236]` (logical scene units; ratio ≈ 1.78, close to the canvas the view fits) · `ground`/`front` = the terrace plateau's back edge / front lip.
- `SECT_SCENE.palette` — palette keys (colours never appear as literals in the renderer). Includes `sky0`/`sky1` (a
  near-black night), `shadow` (the dark contact strip under each structure), `wall`/`wallHi` (the warm wall mass and
  its lit top edge), `roof`/`roofHi`/`roofDeep` (roof body / lit ridge / shadowed under-eave), `stoneDeep` (the rock
  face below the terrace) and `slope` (the training yard's swept-earth floor).
- `SECT_SCENE.background` — the night sky: `ridges: false` (the sect sits on a peak — **no hills or landscape**),
  `mistA: 0`, no cloud banks or birds, a clear `moon`, and an `ambience` of `stars` (with `fade`) + `bigStars` +
  `fireflies`. The palette block is shared with `INK_ART[*].background` (see art-engine.md).
- `SECT_SCENE.slots[]` — `{ id, kind, x, y, scale }` for each structure. `kind` names a painter in `scene-renderer.js`;
  `id` gates it (`built[id]`, or `hall`/`gate`/`defensive_array`). The 6 hall ids match `SECT_BUILDINGS[].id`.
- `SECT_SCENE.dressing` — lanterns along the path.

## Wiring
- `base-view.js` builds the `#scene-canvas`, owns one `SceneRenderer`, and re-`setScene`s when the state signature
  changes (detecting a newly-raised hall to `triggerGrow` it).
- `nav.js` (`NAV_GROUPS.sect.views`) + `sect-view.js` (`VIEWS`/`viewsFor`) offer `sect-base` for a founder;
  `game.js` renders it through `VIEW_RENDER['sect-base']` (a dedicated view, like Hunt/Arena/Arts — it owns a canvas,
  so it must not go through `SectView.render`'s `innerHTML`).
- `layout.js` does not size it: `base-view.js` fits the canvas to its frame (window resize + `ResizeObserver`).
- The renderer is loaded by `scripts/sim/loader.js` (with `ink-renderer.js`) only so the sim proves the module loads
  without throwing (same treatment as `settings.js`/`banter.js`); the sim never draws it.

## Invariants
1. View-only: the scene never mutates state and exposes no build/upgrade control.
2. A structure appears **iff** its condition holds (`hall`/`gate` always; the 6 halls only when `ownSect.buildings[id]`).
3. `arrayDamaged` ⇒ the ward is dim, never absent.
4. `buildSectScene` is deterministic for a given state (no `Math.random`).
5. `sig` covers every input that changes the picture (hall level, built set, disciple count, fame bucket, array state).

## Art pass — building detail & contrast (2026-10-02)
The user's brief: the buildings read flat and "blend into the background". The pass (still view-only) makes every
structure read as a lit building against the darker hills:
- **Shared motifs** (`scene-renderer.js`) — `_win` (a lit window/doorway + halo), `_beams` (vertical timber posts),
  `_wallTop` (a lit top edge), `_seat` (a dark contact strip), applied to the hall, pagoda, pill hall, vault,
  training yard and beast pen. `_roof` gained a deeper `roofDeep` under-eave, a brighter ridge with upturned lit
  eave tips, and a running warm eave line + glow.
- **The gate now paints** — a `gate` case (paifang: two stone piers on bright plinths, a red lintel, a gold name
  plaque, hanging lanterns, a tiled roof) was missing, so the always-present `gate` slot used to draw nothing.
- **Palette** — `wall` brightened and `slope` darkened (value separation), `shadow` added; the terrace paving alpha
  raised and the lantern pools widened so the ground carries the compound's light.
- The hall keeps only its two outer pillars red (the inner posts are quiet wood) so the lit wall, not a red stripe
  grid, is the read.
- The `scene.js` smoke now writes 3× `scene-zoom-{hall,left,right,center}.png` crops for the art gate.

### Mountaintop — only the black starry night behind (2026-10-02, follow-up)
The user's next brief: the hills "are kinda ugly" — put the sect on a mountain top with **only the black starry night**
behind it, no landscape or objects. So the scene now carries no background terrain at all:
- `background.ridges: false` (no ridges), `mistA: 0`, the two `cloudBank`s and the `birds` removed, `dressing.pines`
  removed; `compoundGround` no longer draws a hillside band (just a faint lit lip at the summit edge), and the rock
  face below the front lip is lifted a step above the sky so the summit reads as rock, not void.
- `buildSectScene` clones the ambience and masks a column out of `stars`/`bigStars` around the Sect Hall's spire
  (`clear`), so the star band keeps a **fixed** floor — raising the hall never thins the sky — while no star lands on
  a roof. The `stars` kind gained `clear` + `fade` (thin toward its floor) options in `ink-renderer.js`.
- The near `foreRocks` are now lit rock (`stoneDeep` + a warm `bannerGold` rim) rather than black lumps.

## Gotchas
- `SceneRenderer` **subclasses `InkRenderer`** to reuse `_dotPoly`/`_ridge`/`_paintBackground`/`_scenery`/`_ambience`
  and the bake cache — per the plan, do **not** write a second rasteriser. It sets `layerOrder: []` so `_buildCache`
  skips the figure layers, and overrides only `_drawTo` (background + mist + ambience + the grow burst).
- New scenery/ambience kinds go in the subclass and **fall through to `super`** for the realm kinds (`pines`, `birds`…).
- The terrain spans the *visible* span `x0..x1` (wide canvases are common), so the compound stays centred on any width.
- In Banner mode `#main-pane` is hidden; `skipHidden` stops the loop drawing while the canvas has no `offsetParent`.
- The caption line carries the view's only action ("Raise a hall"); the legend is a chip row that scrolls sideways in
  Overlay/phone so it can never push the action below the fold (review cycle 1).
- `foreRocks` draws lit near-rock outcrops at the frame's edges (depth); the terrain spans the visible `x0..x1` so the
  compound stays centred on a wide Desktop canvas, and the box ratio matches the fitted canvas so it does not letterbox.
- **Visual Review Gate:** build 2026-10-01 — UI 7.5 PASS · scene asset 8.0 PASS. Art pass 2026-10-02 — UI 8.1→8.3, asset 8.4→8.6. Black sky 2026-10-02 — UI 8.3 · asset 8.7. Mountaintop 2026-10-02 — UI 8.2 · asset 8.6. All PASS, no blockers (see ui-review.md); the last cycle's 3 `[polish]` (star band, rock face, near rocks) were applied after the pass and screenshot-verified.
- ❌ **Depth pass:** N/A — view-only art. It reads buildings/hall/war/disciples/fame; it makes no player decision on
  the player's behalf and simulates nothing.
