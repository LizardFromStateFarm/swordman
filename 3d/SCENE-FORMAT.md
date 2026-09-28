# Scene format — terrain, modular kits, and building grammar

_Purpose: let an agent (and a human) build 3D worlds by editing **data**, never by modeling. A scene is a
terrain op-stack + placed kit instances. Everything is declarative; the runtime lives in `engine3d/world/`._

This extends the pattern already in the 2D game: `assets/scenes/sect-base-scene.js` and `island-scene.js` are
data-only scene descriptions ("building parts + layout"). We lift that one dimension up.

## Three layers of a scene

1. **Terrain** — a heightfield produced by a small stack of operations (noise + stamps + flatten + path).
   Agents tune numbers; nobody sculpts vertices.
2. **Kits** — a library of modular 3D pieces (wall, roof, gate, terrace, bridge…) authored as simple
   extrusions in the ink material. Ship once, reuse everywhere.
3. **Grammar** — composition rules that assemble kits into buildings and settlements ("house = walls + hip
   roof + door + 2 windows"). Agents place a *grammar*, not individual bricks.

## Terrain

```js
const TERRAIN = {
  size: [512, 512],                 // world units
  layers: [                         // applied top to bottom; order matters
    { op: 'base',    height: 0 },
    { op: 'noise',   type: 'fbm', scale: 90, amp: 18, octaves: 4, seed: 11 },
    { op: 'stamp',   asset: 'hill_round', at: [180, 240], scale: 60, falloff: 0.5 },
    { op: 'flatten', at: [256, 256], radius: 90, to: 0 },        // village plateau
    { op: 'path',    pts: [[256,300],[210,220],[150,180]], width: 12, smooth: 6,
                     surface: 'dirt' },
  ],
  materials: [
    { id: 'grass', rgb: [ 63,  96,  72], shader: 'ink_ground', dot: 0.7 },
    { id: 'rock',  rgb: [ 60,  58,  54], shader: 'ink_ground', dot: 0.9 },
    { id: 'dirt',  rgb: [108,  88,  62], shader: 'ink_ground', dot: 0.6 },
  ],
  regions: [ { id: 'village', mask: { op: 'circle', at: [256, 256], r: 90 }, material: 'grass' } ],
};
```

- **Ops** are pure functions `(heightfield, params) → heightfield`. `fbm` reuses the same noise family as the
  2D ink background's ridge sums — shared code, shared feel.
- **Materials** reference a shader + palette + a `dot` density. `ink_ground` is the dot-quantizing terrain
  shader (same pass as the figures), so ground and figures read as one medium.
- **Regions** tag an area for the grammar (grass plateau, path corridor) and for nav cost.

## Kits — modular pieces

```js
const KITS = {
  wall_3:    { kind: 'wall',    size: [3, 2.6, 0.3], mat: 'plaster', solid: true,
               sockets: { door: 'wall_door', window: 'wall_win' } },
  wall_door: { kind: 'door',    size: [1.1, 2.1],     mat: 'wood' },
  wall_win:  { kind: 'window',  size: [0.9, 0.9],     mat: 'lattice' },
  roof_hip:  { kind: 'roof',    span: 3.4, pitch: 0.6, overhang: 0.5, mat: 'tile' },
  gate_pai:  { kind: 'gate',    size: [2.2, 3.2],     mat: 'wood', ornament: 'paifang' },
  terrace:   { kind: 'terrace', size: [6, 6, 0.5],    mat: 'stone' },
  bridge:    { kind: 'bridge',  span: 6,             mat: 'wood', rails: true },
};
```

- Kits come in two families. **`structure`** kits (walls, roofs, gates, terraces) are solid and **enterable** —
  real geometry you walk into through openings, not flat props. **`dressing`** kits (lanterns, shrines, banners)
  are view-only and may be a billboard.
- Structures are solid geometry (rule "only objects are solid") with socket points where sub-pieces attach, and
  they declare an `interior` (see below). Dressing has no interior.
- `family`, `mat`, `sockets`, `opening`, `interior` drive both the render pass and the linter.
- Kits are the 3D analogue of `INK_PARTS` slots — the reusable vocabulary an agent composes from. A kit's mesh
  source is swappable: hand-authored extrusion now, a MagicaVoxel `.vox` later, same kit either way.

## Grammar — assembly rules

```js
const GRAMMAR = {
  house: { footprint: [3, 4], room: 'house', build: ['wall_3 ×4', 'roof_hip', 'wall_door', 'wall_win ×2'],
           rules: ['door faces the path', 'roof.pitch in [0.5, 0.7]', '≥1 window per street face'] },
  hall:  { footprint: [7, 5], room: 'hall', build: ['terrace', 'wall_3 ×8', 'roof_hip ×2', 'gate_pai at front'],
           rules: ['centred on the path axis', 'faces the gate'] },
  wall:  { build: ['wall_3 ×N along boundary'], rules: ['encloses the village region'] },
  village: { anchors: ['gate_pai', 'bridge'],
             build: ['house × 6', 'hall × 1', 'wall'],
             layout: 'cluster on the plateau, doors toward the path' },
};
```

Grammar is intentionally shallow: compositions with constraints, not a scripting language. It gives an agent
enough structure to lay out a believable settlement while a linter enforces the hard rules.

## Interiors — structures are enterable

A structure is a shell you walk into, not a facade. The grammar builds a shell plus rooms; the shell's only
passable seam is a **portal opening**:

```js
const ROOMS = {
  house: { floor: 'wood',  ceiling: 2.4, cells: [[3, 4]],
           door: { at: 'front', w: 1.1, h: 2.1, portal: true } },
  hall:  { floor: 'stone', ceiling: 3.2, cells: [[7, 5]], partition: [[7, [0.42, 0.58]]],
           door: { at: 'front', w: 1.6, h: 2.4, portal: true } },
};
```

- `cells` subdivide a footprint into rooms; `partition` splits a cell with an inner wall (the hall's columns).
- `door.portal: true` punches a **real opening** — the only walkable seam and a culling portal. A door is never
  a decal on a solid wall.
- Interiors are added to the navmesh, and the roof is a solid shell the renderer **fades when the camera is
  inside** (or the structure occludes the player) — never a sprite, always geometry.
- Grammar attaches a room to a structure (`room: 'house'`); dressing kits have none.

## Scene assembly

```js
const SCENE = {
  id: 'sect_base_lineage_01',
  terrain: TERRAIN,
  place: [
    { ref: 'village', origin: [256, 256], rotate: 0.15, seed: 7 },
    { ref: 'gate_pai', at: [256, 320], facing: 'path' },
    { ref: 'bridge',   at: [150, 180] },
  ],
  props: [ { kit: 'lantern', at: [250, 300] }, { kit: 'shrine', at: [270, 245] } ],
  spawn: { at: [256, 300], facing: [0, -1] },
  nav:   { agentRadius: 0.8, maxSlope: 0.5, cost: { grass: 1, dirt: 0.8, rock: 3 } },
  lods:  [ { d: 0 }, { d: 60, terrainRes: 0.5 }, { d: 150, terrainRes: 0.25, props: 'billboard' } ],
  meta:  { autoBuilt: true, review: null },
};
```

## Scene linter (`npm run check-scene`)

Fails on: a kit/grammar ref that doesn't exist; a kit instance overlapping another (AABB test); a **structure
with no interior** or a `dressing` kit used where a structure is required (and vice versa); a **room not
reachable** — navmesh not connected from `spawn` to every room and every door; a door opening blocked by
geometry or **too narrow for `nav.agentRadius`**; an interior missing a floor or ceiling; a door that doesn't
open onto walkable ground; a slope exceeding `nav.maxSlope`; a prop outside terrain bounds or below ground; a
grammar rule violated (door not on path side, roof pitch out of range); a region mask that covers no terrain;
LOD `terrainRes` reducing detail where a door is. Like the rig linter, every failure names the offending
instance and rule so an agent can fix it unattended, and the whole scene is rendered from fixed cameras →
Visual Review Gate (≥ 8.0).

## Invariants

1. Scenes are pure data — terrain is an op-stack, never baked vertices in the file.
2. Kits are the only source of geometry; the grammar never emits raw meshes.
3. A scene must lint clean, including a connected navmesh, before the game loads it.
4. **Structures are enterable; dressing is not.** In the full 3D game a structure is real geometry you walk
   into through a portal opening. Only `dressing` (props, distant hills) is view-only. When a scene appears
   inside the *idle game* context, its dressing stays view-only (user rule, 2026-09-27) — building still happens
   in the existing rows.
5. LODs must never remove something gameplay-relevant (doors, spawn, path, rooms).
6. A structure without a reachable interior is not a structure — the linter fails it.
