# Ascendant (working title) — 3D successor project

This directory is the **planning root** for a separate, full 3D cultivation game built on top of
Cultivator Idle's simulation core. Nothing here is wired into the 2D game yet — it is design and
data-format seed material. It can be promoted to its own git repo / worktree once the shape is agreed.

> Not a renderer swap. A standalone game that **reuses** this repo's biggest asset — the
> renderer-agnostic simulation (`renderer/engine/game-state.js` + `assets/data/*` + `scripts/sim/`) —
> and replaces everything above the canvas with a custom WebGL2 engine.

## The one decision that makes this tractable

Characters stay **2D ink art placed in a 3D world** (a "really advanced Doom" / Last-Hero-of-Nostalgia
look: a flat ink figure that walks, turns, and fights inside real 3D geometry). This deletes the single
most expensive part of a 3D game — modeling and rigging a real mesh for every stage, robe, weapon and
animation. The ink art is already a **2D rig**; it just needs bones.

## The look (settled for now)

- **Characters are rotated 2D images.** The player and main cast are flat ink planes that turn to face
  movement; crowds, background NPCs and beasts are yaw-only billboards. No 3D character meshes.
- **Buildings and the world are solid and enterable.** Structures are real 3D geometry you walk into through
  door openings — Doom-style solid, **not** flat static props in the Don't Starve style. A building is a place
  you enter, not a picture of a place.
- **Voxel is a future option, not a fork.** If we later author art in MagicaVoxel, a `.vox` just becomes
  another *source* for a kit piece (see `SCENE-FORMAT.md`); the formats treat a kit's mesh as swappable, so
  nothing here has to be redone to adopt it.

## Why a custom engine

The user's call: own it end-to-end for deep control. Concretely, that buys us:
- the ink **dot-quantization post-process** as a first-class pass, not a bolt-on,
- batched billboard rendering tuned for thousands of 2D figures,
- the **rig editor** and **world editor** living in the same codebase as the runtime (shared math, shared
  asset loaders), so agent tooling and the game never drift,
- deterministic, seeded time/RNG so the **route harness** can replay runs.

Cost: we build the scene graph, math, loaders and culling that three.js gives free. Bounded, well-understood work.

## Documents

| File | Covers |
|---|---|
| `ARCHITECTURE.md` | Custom WebGL2 engine: modules, render passes, sim reuse, mobile, determinism |
| `RIG-FORMAT.md` | The rig data format: skeleton, part bindings, IK, animation tracks, auto-rig, linter |
| `SCENE-FORMAT.md` | World build: terrain ops, ink materials, modular kits, building grammar, linter |
| `RIG-EDITOR.md` | The human fine-tune tool: AI rigs it 99%, you drag dots to finish |
| `examples/rig.cultivator.js` | A concrete rig for the existing hybrid ink cultivator |
| `examples/scene-village.js` | A concrete terrain + kit + grammar scene |

## Design rules carried over from the 2D game

1. **Data files are data only.** Rigs and scenes are declarative (`.js` consts here, `.json`/`.tscn`-like
   later). No logic in them. Agents edit data, not engine code.
2. **Only objects are solid** (user rule, 2026-09-27). Swords, hairpins, doors render as clean
   geometry; everything organic is dot-quantized ink.
3. **Agents author, linters catch, humans finish.** Every rig and scene ships with a linter check and a
   review score; the AI gets ~99% there, the human nudges the last 1% in a dot-based editor.
4. **View-only art is still view-only** where it applies — large scene dressing (sect base, island) never
   becomes a placement UI when it appears inside the idle game.
5. **Determinism is load-bearing.** Seeded RNG, `Date.now()` time, so a scripted route reproduces exactly.

## Tooling — rig agent CLI (P0/P1 built)

A self-contained Node project: its own `package.json`, its own `npm test`. It reads the app's art
**read-only** (loads `assets/sprites/*.js` in a vm, like `scripts/sim/loader.js`) and never writes to it.

```
cd 3d
npm test                                             # node --check + lint every rig + scenario checks (checks/)
npm run rig:auto  -- --source ink --state meditating --out rigs/cultivator_meditating.js
npm run rig:auto  -- --source voxel --model models/hero.vox --out rigs/voxel_hero.js
npm run rig:auto  -- --source ascii --state meditating [--regions 3] --out rigs/ascii_meditating.js
npm run rig:check -- rigs/cultivator_meditating.js    # or -- --all
npm run rig:slots -- rigs/cultivator_meditating.js    # does every slot option stay covered? (ink)
npm run rig:edit  -- rigs/cultivator_meditating.js    # the human correction UI (drag bones + pivots; ink)
npm run rig:render -- rigs/cultivator_meditating.js   # → out/<state>-{idle,bt,fail}.png (Electron host)
npm run rig:render -- rigs/voxel_hero.js              # → out/voxel_hero-iso.png (isometric voxel)
npm run rig:render -- rigs/ascii_meditating.js        # → out/ascii_meditating-ascii.png (glyph sprite)
```

| File | Role |
|---|---|
| `rig/loader.js` | Loads the app's art read-only in a vm (`--app-root` / `CULTIVATOR_APP_ROOT` to relocate) |
| `rig/adapters/ink.js` | INK_ART / INK_PARTS → a 2D RigSource (mirrors `InkRenderer._effective()`, incl. `mirror:true`) |
| `rig/adapters/voxel.js` | A MagicaVoxel `.vox` → a 3D RigSource |
| `rig/adapters/ascii.js` | A `CULTIVATOR_SPRITES` char grid → a coarse 2D RigSource (N horizontal regions) |
| `rig/lib/vox.js` | Dependency-free `.vox` reader + minimal writer |
| `rig/autobind.js` | Auto-rig: 2D seated template (ink) / 3D humanoid + nearest-bone (voxel) / banded chain (ascii) |
| `rig/lint.js` | The rig linter — the agent's feedback loop; one `ok` per rule, every failure names the field |
| `rig/file.js` · `rig/source.js` | Rig file I/O + RigSource builders (shared by the CLI and the host) |
| `checks/` | Scenario checks (`checks/vox.js`, `checks/ascii.js`) run by `npm test` |
| `tools/cli.js` | The CLI: `auto · check · slots · edit · render · test` |
| `tools/host.js` | The 3D project's OWN Electron main (never the app's) — render + editor modes |
| `tools/render/` | Render page: ink via the app's `InkRenderer`; voxel via an isometric painter |
| `tools/rig-editor/` | The editor page: art + draggable bone/pivot dots, inspector, lint-on-save (2D rigs) |

**Isolation:** the app's `npm test` and `npm run dist` now exclude `3d/` (two approved edits in
`scripts/check-syntax.js` and `package.json`); the emoji/CJK lints and `build:web` never touched `3d/` anyway.

## Status

- [x] Planning root + format sketches
- [x] Rig agent CLI (P0/P1): loader, ink adapter, auto-bind, linter, `auto/check/slots` — the Qi Condensation
      cultivator rigs and lints clean
- [x] Tool host + `rig:render` previews (P2) — the app's `InkRenderer` loaded read-only, the rig overlay
      (bones + pivots) drawn on top, PNG captures written to `out/`
- [x] Rig Editor — the human correction UI (P3): `rig:edit` opens the art with draggable bone/pivot dots,
      an inspector, undo/redo, and lint-on-save; headless self-test via `edit <rig> --smoke`
- [x] Voxel source pipeline (P4a): `.vox` parser, 3D rig model + lint, nearest-bone auto-rig, `--source voxel`,
      `checks/vox.js`; plus an isometric preview in `rig:render` (P4b)
- [ ] Voxel **editing** in the rig editor (3D handles / orbit viewport) — deferred
- [x] ASCII adapter (P5): char-grid → N regions, banded bone chain, glyph render in `rig:render`,
      `checks/ascii.js`
- [ ] World/scene tooling (P6)
- [ ] Agree the scene format; prototype the ink post-process on one billboard figure in WebGL2
- [ ] Verify the sim core runs headless against the new engine unchanged
