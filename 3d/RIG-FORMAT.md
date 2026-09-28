# Rig format — 2D ink art bound to a skeleton

_Purpose: turn an existing hybrid-ink drawing into a posable, animatable paper-doll that the 3D engine can
place, turn and light. A rig is **data only**; the runtime that evaluates it lives in `engine3d/figure/`, and
the tooling that produces/validates it is `3d/rig/*` + `3d/tools/cli.js` (see `3d/README.md`)._

The ink art is already a rig in disguise: `INK_ART` / `INK_PARTS` (`assets/sprites/ink-cultivator.js`,
`ink-parts.js`) are named `parts[]` on three layers (`lap|body|head`), plus `strokes[]`, `dotFeatures[]`,
`glyphs[]` and `effects`. A rig adds a **skeleton** and an **attachment table** that says which part follows
which bone, then plays **tracks** over them. No redrawing — the same art, now boned.

## Coordinate model

- **Sheet plane (x, y):** the 2D art's own space. `INK_ART` is a 300×150 scene, figure centred on x=150.
  Pivots are in sheet pixels.
- **Skeleton `pos` is a PARENT-RELATIVE offset** — a bone's world position is the sum of the offsets along
  its parent chain (root's `pos` is its world position). The poser and the editor both use this convention.
- **z (0…1):** paint depth / parallax **within the sheet** — not world space. Lets a skirt sit in front of the
  legs, a sword in front of the lap folds.
- **Placement in 3D** is the engine's job (billboard pivot at the feet, plane orientation, scale). The rig
  never knows about the world; it only knows how to pose the sheet.

## Format

```js
const RIG = {
  v: 1,
  source: { kind: 'ink', artId: 'cultivator_qc', state: 'meditating',
            slots: { face: 'calm', hair: 'bun', robe: 'moon', weapon: 'sword', aura: 'orbit' } },
  canvas: [300, 150],                 // must match the INK_ART scene it binds
  skeleton: {
    // name: { parent, pos: [dx, dy] offset from the parent (root = world), z? }
    root:   { parent: null,    pos: [150, 120] },
    hips:   { parent: 'root',  pos: [0, -22] },
    spine:  { parent: 'hips',  pos: [0, -18] },
    chest:  { parent: 'spine', pos: [0, -14] },
    neck:   { parent: 'chest', pos: [0, -10] },
    head:   { parent: 'neck',  pos: [0, -8] },
    armL_u: { parent: 'chest', pos: [-13, -2] },
    armL_f: { parent: 'armL_u', pos: [-9, 12] },
    /* …right arm… */
  },
  attachments: [
    // By PART ID for specific geometry…
    { part: 'lap',   bone: 'hips',  layer: 'lap',  pivot: [150, 109] },
    { part: 'face',  bone: 'head',  layer: 'head', pivot: [150, 45.4] },
    // …or by SLOT KIND so every option of the kind inherits (new hair/robe options need no re-rig):
    { kind: 'hair',   bone: 'head',  pivot: [150, 45], sway: { amp: 3, lag: 0.18 } },
    { kind: 'weapon', bone: 'chest', pivot: [150, 116] },
  ],
  ik: [],
  tracks: { /* named animations — see below */ },
  meta: { autoRig: true, humanTouched: [], review: null, generator: 'autobind@1' },
};
```

### Attachment fields

| Field | Meaning |
|---|---|
| `part` / `kind` | Target one specific part id **or** a whole slot kind. `kind` attachments are inherited by every option of that kind (so a new robe/hair option never breaks the rig). |
| `bone` | Which bone drives the geometry. |
| `pivot` | Rotation origin in sheet space — must lie **inside** the geometry's bbox. |
| `layer` (optional) | The part's motion group (informational). |
| `soft` (0…1) | Blend factor for deformable geometry (skirt, sleeve). 0 = rigid. |
| `sway` | Passive secondary motion on idle (hair locks, tassels): `{ amp, lag }`. |
| `solid` | Per the "only objects are solid" rule: render as clean geometry, never dot-quantized. |
| `attach` / `after` / `z` (optional) | Held-object grip bone / paint-after anchor / sheet depth. |

### Tracks (animations) — declarative keyframes

```js
tracks: {
  idle: { loop: true, rate: 1.0, feels: {
    // pose delta per bone, additive over the rest pose: [rotation(rad), lift(x,y), scale?]
    spine: [ { t: 0.0, pose: [0.00, 0] }, { t: 1.2, pose: [0.02, 0, 1.01] }, { t: 2.4, pose: [0.00, 0] } ],
    head:  [ { t: 0.0, pose: [0, 0] }, { t: 1.6, pose: [0.03, 0] }, { t: 3.2, pose: [0, 0] } ],
  } },
  breakthrough: { loop: false, rate: 1.0, overlay: 'bt', feels: { /* arms spread, rise */ } },
  fail:         { loop: false, rate: 1.0, overlay: 'strain', feels: { /* recoil, shudder */ } },
}
```

- **Pose delta** is additive over the rest pose, so tracks compose (an `attack` can layer a breath on the spine).
- **`events`** — timed hooks the engine reads (land a hit, dust puff, flash a face frame).
- **`overlay`** — points at a face **expression frame** (`bt` / `strain`, already in `INK_PARTS`).
- **`feetPlant: true`** — the linter checks the planted foot stays on the ground line across the loop.
- **`rate`** — the engine scales by sim speed / the Reduce-motion setting.

## 3D (voxel) rigs

The same rig shape covers voxel models, with `space: '3d'`:

- **Skeleton** — a 3D humanoid template (z-up, MagicaVoxel axes), `pos` = parent-relative `[x, y, z]`.
- **Attachments** — one per **group**: `{ group, bone, count, box, pivot }`, where `box` is the group's voxel AABB
  (`{x0,y0,z0,x1,y1,z1}`) and `pivot` is its voxel centroid. `group` is the partition name (today = its bone).
- **Partition** — `autobind` assigns every voxel to its **nearest bone** at the rest pose, so moving a bone
  re-partitions the model (that is the editable knob). Leaf bones that own no voxels are dropped.
- **Source** — `{ kind: 'voxel', model: '<rel|abs>.vox', space: '3d' }`. The linter's `bboxOf` reads
  `attachment.box`; coverage asserts the groups cover every voxel exactly once.

Rendering a voxel rig is an **isometric voxel painter** (canvas 2D, back-to-front) — `rig:render` writes
`out/<name>-iso.png`. Interactive 3D editing (drag handles / orbit viewport) is not built yet, so `rig:edit`
refuses a 3D rig for now.

## ASCII sprite rigs (coarse)

`CULTIVATOR_SPRITES` is a char grid, not parts, so its rigs are deliberately coarse (`space: '2d'`,
`source: { kind: 'ascii', state, regions: N }`):

- The frame is cut into **N horizontal regions** (`--regions`, default 3 = head / torso / legs, or 1 = the whole
  sprite). Each region is a `part: 'band<i>'` attachment with a rectangle bbox in the 300×172 canvas.
- `autobind` builds a vertical bone chain (bottom → top; `hips/spine/head` for N=3, else `b0…`), one bone per
  region, plus a `root` at the sprite's feet.
- Coverage = every region bound; bounds = regions inside the canvas. There are no slots and no per-part detail —
  this exists so the classic style can be placed/posed alongside ink and voxel.
- `rig:render` draws the glyph grid (the app's font/colours/glow) with the region boxes and bone overlay →
  `out/<name>-ascii.png`. `rig:edit` is ink-only, so it refuses an ASCII rig too.

## Auto-rig algorithm (`3d/rig/autobind.js`)

Input: an ink `RigSource` (resolved art + merged slot options). Output: a first-pass rig.

1. **Skeleton seed** — a template skeleton (seated cultivator: root→hips→spine→chest→neck→head + two arms),
   placed on the figure.
2. **Bind base parts by id** — a heuristic maps each part to a bone (`neck`→neck, `face`/head-layer→head,
   `lap`/`sash`→hips, `sleeve`/`arm`→upper arm, `cuff`/`fore`→forearm, `torso`→spine, `lapel`→chest, …).
3. **Bind slot kinds** — `hair`→head (with `sway`), `weapon`→chest. This is where the "AI gets 99%" comes from:
   the slot semantics already exist, so every option is covered by construction.
4. **Pivot guess** — inside the part's own bbox: head parts at the neck (bottom-centre), limbs at the
   shoulder (top-centre), everything else at its centre.
5. **Track templates** — instantiate `idle` / `breakthrough` / `fail` from the built-in templates.
6. **Emit + lint** — write the rig data file with `meta.autoRig:true`; run the linter; hand to the human in the
   Rig Editor for the last 1%.

## Rig linter (`3d/rig/lint.js`; run via `npm run rig:check`)

Prints one `ok` line per rule group, plus every `FAIL`. Fails on: `rig.v ≠ 1` · empty skeleton · a bone whose
`parent` is missing or forms a cycle · an attachment bound to an unknown bone · an attachment whose geometry
isn't found · a `pivot` outside its bbox · `soft` outside 0…1 · `sway.amp` invalid · a part claimed by two
attachments · an **orphan bone** (no children, no attachment) · a track naming an unknown bone, with
non-increasing key times, or a `loop` that doesn't start at t=0 / whose first pose ≠ last · an **unbound base
part** · a slot option not covered by any attachment · geometry outside the canvas by more than 40px. Every
failure names the exact field.

## Invariants

1. A rig binds **by kind** wherever possible so new art options don't need re-rigging.
2. `solid:true` is only ever used on objects (rule 2). Organic parts are never solid.
3. Rigs are pure data — no logic, no timers, no randomness.
4. The sheet's z-order must reproduce the art's existing back-to-front order when all tracks are at rest.
5. Every rig passes the linter and carries a review score before the game uses it.
