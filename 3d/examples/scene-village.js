// Example 3D scene — DATA ONLY (3D project seed): terrain op-stack + modular kits + grammar + assembly.
// Depends: engine3d/world/ (not built yet). Spec: 3d/SCENE-FORMAT.md. Nothing in the 2D game loads this.
const SCENE_VILLAGE = {
  id: 'village_lineage_01',

  terrain: {
    size: [512, 512],
    layers: [
      { op: 'base',    height: 0 },
      { op: 'noise',   type: 'fbm', scale: 90, amp: 18, octaves: 4, seed: 11 },
      { op: 'stamp',   asset: 'hill_round', at: [180, 240], scale: 60, falloff: 0.5 },
      { op: 'flatten', at: [256, 256], radius: 90, to: 0 },
      { op: 'path',    pts: [[256, 300], [210, 220], [150, 180]], width: 12, smooth: 6, surface: 'dirt' },
    ],
    materials: [
      { id: 'grass', rgb: [63, 96, 72],   shader: 'ink_ground', dot: 0.7 },
      { id: 'rock',  rgb: [60, 58, 54],   shader: 'ink_ground', dot: 0.9 },
      { id: 'dirt',  rgb: [108, 88, 62],  shader: 'ink_ground', dot: 0.6 },
    ],
    regions: [
      { id: 'village', mask: { op: 'circle', at: [256, 256], r: 90 }, material: 'grass' },
    ],
  },

  kits: {
    // Structures — solid and enterable (walk in through the opening).
    wall_3:    { family: 'structure', kind: 'wall',  size: [3, 2.6, 0.3], mat: 'plaster', solid: true,
                 sockets: { door: 'wall_door', window: 'wall_win' } },
    wall_door: { family: 'structure', kind: 'door',  size: [1.1, 2.1],    mat: 'wood',
                 opening: { portal: true } },                 // a real hole, not a decal
    wall_win:  { family: 'structure', kind: 'window', size: [0.9, 0.9],   mat: 'lattice' },
    roof_hip:  { family: 'structure', kind: 'roof',  span: 3.4, pitch: 0.6, overhang: 0.5, mat: 'tile' },
    gate_pai:  { family: 'structure', kind: 'gate',  size: [2.2, 3.2],    mat: 'wood', ornament: 'paifang',
                 opening: { portal: true } },
    terrace:   { family: 'structure', kind: 'terrace', size: [6, 6, 0.5], mat: 'stone' },
    bridge:    { family: 'structure', kind: 'bridge', span: 6,            mat: 'wood', rails: true },

    // Dressing — view-only, billboard-ok.
    lantern:   { family: 'dressing', kind: 'prop', size: [0.4, 1.6], mat: 'wood' },
    shrine:    { family: 'dressing', kind: 'prop', size: [1.4, 1.8], mat: 'stone' },
  },

  grammar: {
    house: {
      footprint: [3, 4], room: 'house',
      build: ['wall_3 x4', 'roof_hip', 'wall_door', 'wall_win x2'],
      rules: ['door faces the path', 'roof.pitch in [0.5, 0.7]', '>=1 window per street face'],
    },
    hall: {
      footprint: [7, 5], room: 'hall',
      build: ['terrace', 'wall_3 x8', 'roof_hip x2', 'gate_pai at front'],
      rules: ['centred on the path axis', 'faces the gate'],
    },
    wall: {
      build: ['wall_3 xN along boundary'],
      rules: ['encloses the village region'],
    },
    village: {
      anchors: ['gate_pai', 'bridge'],
      build: ['house x6', 'hall x1', 'wall'],
      layout: 'cluster on the plateau, doors toward the path',
    },
  },

  // Structures are enterable: a shell plus rooms, walked into through a portal opening.
  rooms: {
    house: { floor: 'wood',  ceiling: 2.4, cells: [[3, 4]],
             door: { at: 'front', w: 1.1, h: 2.1, portal: true } },
    hall:  { floor: 'stone', ceiling: 3.2, cells: [[7, 5]], partition: [[7, [0.42, 0.58]]],
             door: { at: 'front', w: 1.6, h: 2.4, portal: true } },
  },

  place: [
    { ref: 'village', origin: [256, 256], rotate: 0.15, seed: 7 },
    { ref: 'gate_pai', at: [256, 320], facing: 'path' },
    { ref: 'bridge',   at: [150, 180] },
  ],

  props: [
    { kit: 'lantern', at: [250, 300] },
    { kit: 'lantern', at: [262, 300] },
    { kit: 'shrine',  at: [270, 245] },
  ],

  spawn: { at: [256, 300], facing: [0, -1] },
  nav:   { agentRadius: 0.8, maxSlope: 0.5, cost: { grass: 1, dirt: 0.8, rock: 3 } },
  lods:  [ { d: 0 }, { d: 60, terrainRes: 0.5 }, { d: 150, terrainRes: 0.25, props: 'billboard' } ],

  meta: { autoBuilt: true, review: null },
};
