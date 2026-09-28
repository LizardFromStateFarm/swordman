// Rig for the hybrid ink cultivator — DATA ONLY (3D project seed / illustrative spec example).
// Binds the existing INK_ART / INK_PARTS figure (assets/sprites/ink-cultivator.js, ink-parts.js) to a skeleton.
// The CLI generates a real one with `npm run rig:auto`; this file is the hand-written shape reference.
// Spec: 3d/RIG-FORMAT.md. Nothing in the 2D game loads this file.
const RIG_CULTIVATOR = {
  v: 1,
  source: { kind: 'ink', artId: 'cultivator_qc', state: 'meditating',
            slots: { face: 'calm', hair: 'bun', robe: 'moon', weapon: 'sword', aura: 'orbit' } },
  canvas: [300, 150],

  // `pos` = parent-relative offset (root's pos is its world position).
  skeleton: {
    root:   { parent: null,     pos: [150, 120] },
    hips:   { parent: 'root',   pos: [0, -22] },
    spine:  { parent: 'hips',   pos: [0, -18] },
    chest:  { parent: 'spine',  pos: [0, -14] },
    neck:   { parent: 'chest',  pos: [0, -10] },
    head:   { parent: 'neck',   pos: [0, -8] },
    armL_u: { parent: 'chest',  pos: [-13, -2] },
    armL_f: { parent: 'armL_u', pos: [-9, 12] },
    armR_u: { parent: 'chest',  pos: [13, -2] },
    armR_f: { parent: 'armR_u', pos: [9, 12] },
  },

  attachments: [
    // By PART ID for specific geometry.
    { part: 'lap',   bone: 'hips',  layer: 'lap',  pivot: [150, 109] },
    { part: 'torso', bone: 'spine', layer: 'body', pivot: [150, 73] },
    { part: 'sash',  bone: 'hips',  layer: 'body', pivot: [150, 86], soft: 0.1 },
    { part: 'neck',  bone: 'neck',  layer: 'body', pivot: [150, 45.5] },
    { part: 'hands', bone: 'chest', layer: 'body', pivot: [150, 90] },
    { part: 'face',  bone: 'head',  layer: 'head', pivot: [150, 45.4] },
    // By SLOT KIND so every option of the kind inherits.
    { kind: 'hair',   bone: 'head',  pivot: [150, 45], sway: { amp: 3, lag: 0.18 } },
    { kind: 'weapon', bone: 'chest', pivot: [150, 116] },
  ],

  ik: [],

  tracks: {
    idle: {
      loop: true, rate: 1.0,
      feels: {
        spine: [ { t: 0.0, pose: [0.00, 0] }, { t: 1.2, pose: [0.02, 0, 1.01] }, { t: 2.4, pose: [0.00, 0] } ],
        head:  [ { t: 0.0, pose: [0.00, 0] }, { t: 1.6, pose: [0.03, 0] },        { t: 3.2, pose: [0.00, 0] } ],
      },
    },
    breakthrough: {
      loop: false, rate: 1.0, overlay: 'bt',
      feels: {
        chest:  [ { t: 0.0, pose: [0, 0] }, { t: 0.8, pose: [0, -4] }, { t: 2.0, pose: [0, -4] } ],
        armL_u: [ { t: 0.0, pose: [0, 0] }, { t: 0.8, pose: [-0.5, 0] } ],
        armR_u: [ { t: 0.0, pose: [0, 0] }, { t: 0.8, pose: [ 0.5, 0] } ],
      },
    },
    fail: {
      loop: false, rate: 1.0, overlay: 'strain',
      feels: {
        spine: [ { t: 0.0, pose: [0, 0] }, { t: 0.25, pose: [-0.08, 2] }, { t: 0.9, pose: [0, 0] } ],
        head:  [ { t: 0.0, pose: [0, 0] }, { t: 0.25, pose: [-0.06, 1] }, { t: 0.9, pose: [0, 0] } ],
      },
    },
  },

  meta: { autoRig: false, humanTouched: [], review: null, generator: 'hand@1' },
};
