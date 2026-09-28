# Rig Editor — the human's last 1%

_Purpose: the AI auto-rigs a figure ~99% of the way; this tool shows the model with **little dots** the
human drags to make it perfect. One editing surface, tiny scope, reuses the engine._

## Why this exists

Auto-rigging gets the skeleton and bindings almost right because the ink art is semantic (named parts, kinds,
layers). The failure modes are always the same handful: a pivot a few pixels off the joint, a hair lock swaying
from the wrong point, a hem that should follow the hips but folds with the spine, a hand that doesn't meet the
sword grip. Those are exactly the things a human resolves in seconds by dragging a dot — and exactly the things
an agent can't reliably judge from data alone. So: **agent pre-fills, human nudges dots, linter + review gate
close it out.**

## As built (P3)

Opened by the 3D project's own Electron host: `npm run rig:edit -- rigs/<name>.js` (`node tools/cli.js edit <rig>`).
The page is `tools/rig-editor/` (`index.html` + `editor.js` + `editor.css`); the host exposes lint/save over a
`tools/preload.js` contextBridge. The app's `InkRenderer` is injected read-only, so the art is WYSIWYG.

**Works now**
- Renders the art (real ink material) and overlays: **gold** bone dots + links, **teal** attachment pivots, and an
  optional geometry-box layer (part bboxes solid, kind unions dashed).
- **Drag a bone dot** → moves that bone's rest position; its children follow. **Drag a pivot dot** → moves the
  attachment pivot, snapping to the geometry's bbox edges/centre and clamped inside it.
- Select a bone or attachment → inspector: bone parent (RO), bone world x/y, attachment bone (dropdown),
  pivot x/y, `soft`, `sway amp`, `solid` toggle, and the geometry bbox readout.
- **Slot strip** (re-renders the art per selection), **moment** selector (idle / breakthrough / failure),
  overlay toggles, **undo/redo** (Ctrl+Z / Ctrl+Y, 80 deep), **check**, **save** (Ctrl+S).
- **Save** writes the rig file (via the host), records `meta.humanTouched`, and re-runs the linter; failures are
  shown in red. Edits are written even when the lint fails, so nothing is lost — red is the "fix before use" gate.
- Headless self-test: `node tools/cli.js edit <rig> --smoke` boots the page, moves a pivot, lints and saves.

**Not yet (deliberate)**
- **The art does not deform while posing** — it is drawn at the rest pose. Live paper-doll deformation needs the
  engine's sheet poser (`engine3d/figure/`); this tool's job is aligning the skeleton/bindings to the art.
- IK targets and the ground line are not editable yet (IK is empty for the seated figure); `z` is carried in the
  data but has no handle yet.

## What it shows

- The live **paper-doll** of the current figure (posed by the rig), rendered with the real ink material — not a
  wireframe, so you judge it as it will look in game.
- A **bone overlay** on top (toggleable), plus handles. Optional x-ray/rest-pose ghost to compare.
- A **slot strip** (face / hair / robe / weapon / aura) so you can verify a binding against every option at once.
- A **track scrubber** (idle / walk / attack / breakthrough / fail) so a pivot can be judged mid-animation, not
  just at rest.

## The dots (handles)

| Handle | Drag it to… |
|---|---|
| Bone origin (root, hips, spine…) | move a joint's rest position |
| Joint pivot | set a part's rotation origin (shoulder, elbow, hem, tip) |
| IK target | place a hand/foot goal (and its pole hint) |
| Sway / soft weight | set where secondary motion pivots and how much (`sway.amp`, `soft`) |
| Z handle (0…1) | tune paint depth so layers sit right (skirt over legs, sword over lap) |
| Ground line | set the foot plant for `feetPlant` tracks |

Interactions: **drag with snapping** to the part's bounding-box edge / centre-line / another bone (so it's
precise, not fiddly); **live re-pose** while you drag; **undo/redo**; **scrub** a track to check the drag in
motion; **`solid`** toggle on a binding (with a guard — only allowed on object kinds, per rule 2).

## Save-back

- Writes the edited rig **straight back to its data file** (same declarative format — see `RIG-FORMAT.md`).
- Records **what the human touched** in `meta.humanTouched` (e.g. `bindings.robe_lap.pivot`,
  `bindings.hair.sway.amp`) so the diff is auditable and the auto-rig can learn from the pattern later.
- Re-runs the **rig linter** on save; a red row is a hard stop.
- Bumps `meta.review` when a fresh reviewer scores the posed figure (Visual Review Gate, ≥ 8.0), rendered from
  fixed camera angles — the same capture path used for game assets.

## Implementation (small by design)

- A **standalone HTML page** under `engine3d/tools/rig-editor/`, opened by the Electron app — exactly the
  precedent of `scripts/art-bakeoff/index.html` (a self-contained prototype page, not shipped in the game).
- It reuses the real modules: `engine3d/figure/` (skeleton eval, track sampling) + `engine3d/ink/` (the dot
  material) + the same rig loader the game uses. No parallel renderer — if the editor and the game can disagree,
  the editor is wrong.
- Handle overlay is plain DOM/SVG dots on top of the WebGL canvas (cheap hit-testing, easy snapping guides).
- No persistence beyond the rig data file; no unit system; no import/export — it edits one rig and writes it back.

## Workflow

1. Agent runs the auto-rig → rig data file with `meta.autoRig: true`.
2. Agent runs the rig linter → fixes anything mechanical it can.
3. Human opens the Rig Editor → drags the handful of dots that need eyes → saves.
4. Linter re-runs → reviewer scores the posed figure → `meta.review` set → rig is done.

## Non-goals

- Not a general modeling tool; geometry comes from the ink art, not this editor.
- Not a place to author animation from scratch — tracks are templates + data; this tool only nudges bindings,
  pivots, sway and z-order.
- Not shipped to players.
