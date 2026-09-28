# Architecture — custom WebGL2 engine

_Status: design. Scope: rendering, world, runtime, tooling. Does not cover gameplay design._

## What we build vs. what we get free

We are deliberately **not** using three.js/Babylon. We own the stack. That means building:

- **math + scene graph** — transforms, matrices, frustum culling, spatial hash. ~1k lines, solved problem.
- **WebGL2 wrapper** — programs, VAOs, buffers, framebuffers, texture atlas. Thin, no framework.
- **asset loaders** — rigs, scenes, kits, ink art (all declarative data — see the format docs).
- **the ink pass** — the one piece nobody else has.
- **world runtime** — terrain mesh, navmesh, collision.
- **tooling** — rig editor, world editor, route recorder, all sharing the runtime's math/loaders.

What we give up by not using three.js: free loaders, shadows, PBR, post-processing graphs, culling. Most of
that we don't want (the art style is non-photoreal by design); the rest is the ~1k lines above.

## Module layout (proposed)

```
engine3d/
  gl/         WebGL2 wrapper: shader, program, buffer, vao, framebuffer, textureAtlas
  math/       vec/mat/quat, aabb, ray, noise (fbm/noise reuse the ink ridge sums)
  scene/      Node (transform), Scene, camera, culling, sorting
  render/     Renderer + passes (see below)
  ink/        dot-quantize + wash material; palette; the "solid vs dotted" rule
  figure/     Rig runtime: skeleton eval, IK, track sampling → posed 2D sheet → 3D billboard/plane
  world/      terrain (heightfield from ops), navmesh, prop placement, collision
  sim/        ← REUSED: renderer/engine/game-state.js + assets/data/* (+ systems)
  tools/      rig-editor/, world-editor/, route-recorder/ (Electron pages, not shipped)
  routes/     named scripted play sessions (see tooling)
```

## Render pipeline (per frame)

1. **Sim tick** — `game-state.js` advances exactly as today. Its `derived` + state are the single source of
   truth. The engine never mutates state; it only reads and submits input actions.
2. **Scene opaque prepass** — terrain + **solid, enterable structure geometry** (floors, walls, roofs, gates)
   into the color + depth targets. Structures are real 3D you can walk inside; interiors are portal-culled and
   the roof/upper walls fade when the camera is inside. Only *dressing* (lanterns, banners, distant hills) may
   be a billboard.
3. **Figures** — every character/beast: eval its rig track → pose the 2D sheet → upload as a texture →
   draw a **camera-facing quad** (billboard) or a **flat plane** (player/main cast, so it can rotate in
   depth). Sorted back-to-front, depth-tested against the terrain.
4. **Ink post-process** — sample color + depth/normals; quantize the scene to the hex-staggered dot grid;
   apply the ink-wash tonal bands. This is what makes 3D geometry read as the same ink as the 2D game.
   Baked/cached aggressively (the 2D engine already caches dot layers; same budget discipline).
5. **UI** — the existing DOM HUD/tabs over the canvas, unchanged. (In the idle-game context the canvas is
   one region; in the full 3D game the DOM UI becomes a thin overlay.)

## Solid, enterable structures

Buildings are geometry, not sprites. A structure is a **shell with an interior** — floors, walls, a roof, and
**door openings that are real holes** (portals) — so you walk in and the space is walkable, lit, and part of the
navmesh. What the engine has to handle:
- **Portal-based interior culling** — a room draws only when visible through a doorway.
- **Roof / upper-wall fade** when the camera is indoors or the structure occludes the player (the Doom /
  isometric convention), so you never lose your own figure behind a roof.
- **Collision on every structure face**, with openings the only passable seams.
- **Interiors join the navmesh** — the scene linter proves every room is reachable from `spawn`.

Characters, by contrast, are deliberately *not* solid — they are rotated 2D planes, so nothing about them
blocks the world.

## Future: voxel kits

MagicaVoxel is a candidate art *source*, not a different pipeline. A `.vox` model becomes a **kit mesh** the
same way a hand-authored extrusion does: the kit keeps its `family`, `mat`, `sockets`/`opening`, interior and
linter rules, and only its mesh source changes. Neither the scene nor the rig format assumes how a kit's
geometry was authored, so adopting voxel later is purely additive.

Mobile (Capacitor iOS/Android) shares this whole stack — WebGL2 only, never WebGPU, and the ink pass gets a
lower-quality LOD on small canvases, mirroring the current banner LOD.

## Sim reuse — the crown jewel

`renderer/engine/game-state.js`, `assets/data/*`, `renderer/game/*.js` (systems) and the whole `scripts/sim/`
harness are **renderer-agnostic**. They already run headless in a `vm` with a fake `Date` and seeded
`Math.random`. The 3D engine is a *view + input* layer over them. This means:

- Balance/logic regression testing keeps working with zero rewrite (`npm run sim` equivalent).
- New 3D-only state (camera, navmesh position) lives in the engine, **never** in `game-state.js`, so the sim
  never has to know about the 3D world.
- A "walk to the market" is an engine action that eventually calls a public `gameState` method, exactly like
  a button click does today.

## Input & control (full 3D mode)

Keyboard/mouse + gamepad. Movement is engine-side (navmesh steering). Anything that changes *game* state
(a fight resolved, an expedition started, an item bought) routes through public `gameState` methods — Rule 1
("state lives in one place") still holds. Combat is a state machine that reads `derived` combat numbers and
writes back only via public methods.

## Determinism, routes, and the review loop

- Seeded RNG + `Date.now()` give reproducible runs (the sim already enforces this; the engine must too).
- **Named routes**: scripted play sessions (`routes/reach-core-formation.js`, `routes/market-walk.js`) that
  drive both the headless sim and, over CDP, the real app — screenshot → Visual Review Gate. A route recorder
  turns one manual playthrough into a replayable route.
- Rigs and scenes are assets: each gets a linter pass (see their format docs) and a review score (≥ 8.0),
  rendered from fixed camera angles.

## Open decisions

- **Billboard vs. flat-plane** split: which figures are yaw-billboards (cheap, distant) vs. rotatable planes
  (player, named cast).
- **Physics**: custom sphere/capsule vs. an off-the-shelf tiny lib. Custom preferred to keep determinism.
- **Terrain mesh resolution** vs. the dot-quantization cost on low-end phones.
- **Text format**: `.js` consts (matches this repo) vs. `.json`/custom DSL for rigs/scenes once the shape is
  stable and diffs matter more.
