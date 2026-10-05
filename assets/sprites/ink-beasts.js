// INK_BEASTS: the spirit beasts' art (roadmap A4-2): 10 beasts + a rare colour variant each. Each beast is a baked DOT MAP
// (assets/sprites/beasts/<id>.png, made from the user's own art in example_art/ by scripts/art/ink-bake.js) drawn as ink
// dots by renderer/engine/ink-renderer.js (`raster`), with engine effects on top: edge glow, motion regions (tails,
// wings, heads), motes, bolts, glints. Drawn by renderer/game/beast-portrait.js (cards) and beast-detail.js (details page).
// Keyed by BEAST_TYPES[].spriteState / variants[].art (assets/data/beasts.js). Data only, no logic.
// Pipeline + field reference: docs/systems/art-engine.md → "Raster beasts: the bake pipeline".
//
// `regions` masks and `motion[layer].map` pivots are in DOT-MAP px (the map's own grid); the engine fits the map into
// `box` (scene units) and places them. A variant `extends` its beast and overrides `raster` keys (hue / tint recolour)
// and palette (glow colours) only. `hue` turns the colour wheel BACKWARDS in degrees (engine YIQ rotation): purple → red
// is about -90, gold → red about +40.

// Review: A4-2 roster of 10 (2026-09-28) — reviewer agent, then the user; see docs/systems/ui-review.md
const INK_BEASTS = {
  _base: {
    scene: [300, 150],
    dot: { pitch: 1.1 },
    underpaint: false,                                           // dots only, no colour wash behind them (user 2026-09-28)
    light: { x: 140, spread: 50 },
    halo: null, qiPearl: null, rings: [], glyphs: [], strokes: [], dotFeatures: [], slots: {}, parts: [],
    palette: {
      sky0: '#0B0716', sky1: '#161026', moon: '#E8E2D0', mountFar: '#241D3A', mountNear: '#312A4C', mist: '#8C88AA',
      bleed: '#07040D', gold: '#F0D060', eyeInk: '#1A1020', eyeGlow: '#BFF0FF', rim: '#FFF4E0',
    },
    background: {
      glow: { x: 150, y: 80, r: 90 },
      moon: { x: 205, y: 38, r: 6 },
      ridgeFar: [96, 8, 0.021, 1, 5, 0.057, 2, 3, 0.13, 0],
      ridgeNear: [112, 6, 0.03, 4, 3, 0.09, 1, 1.5, 0.21, 2],
      mistY: [108, 124],
    },
    view: [72, 8, 228, 122],
    figureBox: [72, 8, 228, 122],
    body: { anchorY: 121, headY: 30, breathe: 0.01 },
  },

  // ── COMMON ──
  spirit_fox: {
    extends: '_base', id: 'beast_spirit_fox', glow: '#B8C8FF', edgeGlow: 'fire',
    layerOrder: ['tail', 'body'],
    motion: { tail: { map: [118, 75], amp: 0.055, speed: 1.1 } },
    palette: { fire: '#D0DCFF' },
    raster: { map: 'sprites/beasts/spirit_fox.png', box: [72, 8, 228, 122], minL: 0.12, gain: 0.9,
      regions: [{ layer: 'tail', mask: [[0, 0], [120, 0], [126, 40], [118, 62], [110, 95], [104, 118], [113, 132], [113, 154], [0, 154]] }] },
    motes: { count: 18, btCount: 30, x0: 76, x1: 170, speed: 0.12, color: 'fire', y0: 110, rise: 80 },
  },
  spirit_fox__crimson: { extends: 'spirit_fox', glow: '#FF9A7A', palette: { fire: '#FFB89A' }, raster: { hue: -95, tint: '#E0281A', tintAmt: 0.65, sat: 1.5 } },

  blood_python: {
    extends: '_base', id: 'beast_blood_python', glow: '#FF4A4A', edgeGlow: 'blood',
    layerOrder: ['body', 'neck'],
    motion: { neck: { map: [70, 92], amp: 0.035, speed: 0.9 } },
    palette: { blood: '#FF6A5A' },
    raster: { map: 'sprites/beasts/blood_python.png', box: [72, 8, 228, 122], minL: 0.08, gain: 1,
      layer: 'body', regions: [{ layer: 'neck', mask: [[25, 0], [100, 0], [104, 30], [90, 58], [74, 72], [50, 64], [28, 40]] }] },
    motes: { count: 14, btCount: 24, x0: 100, x1: 200, speed: 0.1, color: 'blood', y0: 118, rise: 70 },
  },
  blood_python__jade: { extends: 'blood_python', glow: '#5AE0A0', palette: { blood: '#7AF0B8' }, raster: { hue: -165, sat: 0.7, tint: '#7AD8B8', tintAmt: 0.35 } },

  // ── UNCOMMON ──
  thunder_eagle: {
    extends: '_base', id: 'beast_thunder_eagle', glow: '#8FC8FF', edgeGlow: 'bolt',
    layerOrder: ['wingL', 'wingR', 'body'],
    motion: { wingL: { map: [96, 55], amp: 0.035, speed: 1.4 }, wingR: { map: [144, 55], amp: -0.035, speed: 1.4 } },
    palette: { bolt: '#BFE6FF' },
    raster: { map: 'sprites/beasts/thunder_eagle.png', box: [72, 8, 228, 122], minL: 0.1, gain: 1.1,
      regions: [
        { layer: 'wingL', mask: [[0, 0], [88, 0], [98, 40], [92, 62], [60, 85], [0, 95]] },
        { layer: 'wingR', mask: [[145, 0], [200, 0], [200, 125], [165, 105], [148, 70], [142, 40]] },
      ] },
    bolts: { n: 3, area: [76, 10, 226, 90], avoid: [150, 180], color: 'bolt', every: 2.1 },
    motes: { count: 10, btCount: 18, x0: 76, x1: 226, speed: 0.18, color: 'bolt', y0: 118, rise: 100 },
  },
  // Review score: 8.2 (2026-10-04, asset gate)
  // v1 add-on (bosses.md): the Self-Born Vermilion Bird, baked from the user's picture (example_art/vermabird.png; the
  // painted halo cut by the bake's `pale` + `erode` knobs). Wings beat from their roots, the long tail sways, embers rise.
  vermilion_bird: {
    extends: '_base', id: 'beast_vermilion_bird', glow: '#FF6A2A', edgeGlow: 'ember',
    layerOrder: ['tail', 'wingL', 'wingR', 'body'],
    motion: { wingL: { map: [68, 80], amp: -0.07, speed: 1.1 }, wingR: { map: [51, 82], amp: 0.07, speed: 1.1 },
      tail: { map: [63, 130], amp: 0.035, speed: 0.7 } },
    palette: { ember: '#FFB060' },
    raster: { map: 'sprites/beasts/vermilion_bird.png', box: [72, 8, 228, 122], minL: 0.06, gain: 1.3, sat: 1.2, tone: 0.8,
      regions: [
        { layer: 'wingL', mask: [[174, 0], [77, 0], [70, 36], [65, 68], [68, 87], [99, 116], [174, 123]] },
        { layer: 'wingR', mask: [[48, 22], [-1, 22], [-1, 126], [32, 118], [48, 97], [46, 60]] },
        { layer: 'tail', mask: [[150, 135], [-1, 135], [-1, 202], [150, 202]] },
      ] },
    motes: { count: 20, btCount: 32, x0: 90, x1: 210, speed: 0.16, color: 'ember', y0: 118, rise: 110 },
  },
  thunder_eagle__violet: { extends: 'thunder_eagle', glow: '#C09AFF', palette: { bolt: '#E0C8FF' }, raster: { hue: -60 } },

  spectral_bear: {
    extends: '_base', id: 'beast_spectral_bear', glow: '#6AE0FF', edgeGlow: 'ghost',
    body: { anchorY: 121, headY: 30, breathe: 0.016 },
    layerOrder: ['body'],
    palette: { ghost: '#9AF0FF' },
    raster: { map: 'sprites/beasts/spectral_bear.png', box: [72, 8, 228, 122], minL: 0.08, gain: 1.05 },
    motes: { count: 16, btCount: 26, x0: 90, x1: 210, speed: 0.1, color: 'ghost', y0: 116, rise: 90 },
  },
  spectral_bear__ember: { extends: 'spectral_bear', glow: '#FFA050', palette: { ghost: '#FFC080' }, raster: { hue: 180 } },

  // ── RARE ──
  white_tiger: {
    extends: '_base', id: 'beast_white_tiger', glow: '#C8E0FF', edgeGlow: 'frost',
    layerOrder: ['tail', 'body'],
    motion: { tail: { map: [46, 80], amp: 0.06, speed: 1 } },
    palette: { frost: '#E0F0FF' },
    raster: { map: 'sprites/beasts/white_tiger.png', box: [72, 8, 228, 122], minL: 0.1, gain: 1.05, tint: '#B8D8FF', tintAmt: 0.18,
      regions: [{ layer: 'tail', mask: [[0, 0], [50, 0], [54, 40], [48, 70], [40, 95], [0, 100]] }] },
    motes: { count: 14, btCount: 24, x0: 80, x1: 220, speed: 0.12, color: 'frost', y0: 116, rise: 80 },
  },
  white_tiger__golden: { extends: 'white_tiger', glow: '#FFD070', palette: { frost: '#FFE0A0' }, raster: { tint: '#E8A838', tintAmt: 0.55 } },

  qilin: {
    extends: '_base', id: 'beast_qilin', glow: '#9AF0B0', edgeGlow: 'jadefire',
    layerOrder: ['tail', 'body'],
    motion: { tail: { map: [60, 88], amp: 0.05, speed: 1 } },
    palette: { jadefire: '#C8FFB0' },
    raster: { map: 'sprites/beasts/qilin.png', box: [72, 8, 228, 122], minL: 0.1, gain: 1.2, sat: 1.7, gamma: 1.2,
      regions: [{ layer: 'tail', mask: [[56, 28], [97, 28], [97, 104], [74, 104], [62, 86]] }] },
    motes: { count: 16, btCount: 26, x0: 110, x1: 190, speed: 0.12, color: 'jadefire', y0: 116, rise: 90 },
  },
  qilin__crimson: { extends: 'qilin', glow: '#FF8A7A', palette: { jadefire: '#FFB0A0' }, raster: { hue: 75, tint: '#E82A1E', tintAmt: 0.6 } },

  // ── EPIC ──
  void_hound: {
    extends: '_base', id: 'beast_void_hound', glow: '#A868F8', edgeGlow: 'void',
    body: { anchorY: 121, headY: 30, breathe: 0.012 },
    layerOrder: ['tail', 'body'],
    motion: { tail: { map: [80, 65], amp: 0.04, speed: 1 } },
    palette: { void: '#C49AFF' },
    raster: { map: 'sprites/beasts/void_hound.png', box: [72, 8, 228, 122], minL: 0.06, gain: 1, tone: 0.62,
      regions: [{ layer: 'tail', mask: [[0, 15], [72, 15], [82, 50], [76, 80], [66, 110], [62, 154], [0, 154]] }] },
    motes: { count: 18, btCount: 28, x0: 76, x1: 150, speed: 0.1, color: 'void', y0: 110, rise: 80 },
  },
  void_hound__frost: { extends: 'void_hound', glow: '#7AD8FF', palette: { void: '#A8E8FF' }, raster: { hue: 80 } },

  black_tortoise: {
    extends: '_base', id: 'beast_black_tortoise', glow: '#8AA8FF', edgeGlow: 'star',
    layerOrder: ['body', 'serpent'],
    motion: { serpent: { map: [104, 62], amp: 0.05, speed: 0.8 } },
    palette: { star: '#B8C8FF' },
    raster: { map: 'sprites/beasts/black_tortoise.png', box: [72, 8, 228, 122], minL: 0.06, gain: 1.08, tone: 0.66,
      layer: 'body', regions: [{ layer: 'serpent', mask: [[88, 0], [140, 0], [140, 30], [120, 45], [110, 62], [96, 60], [88, 40]] }] },
    motes: { count: 14, btCount: 24, x0: 80, x1: 220, speed: 0.08, color: 'star', y0: 116, rise: 70 },
  },
  black_tortoise__flame: { extends: 'black_tortoise', glow: '#FFA060', palette: { star: '#FFC890' }, raster: { hue: 180 } },

  // ── LEGENDARY ──
  azure_dragon: {
    extends: '_base', id: 'beast_azure_dragon', glow: '#5AF0E0', edgeGlow: 'rain',
    layerOrder: ['tail', 'body', 'neck'],
    motion: { neck: { map: [40, 70], amp: 0.03, speed: 0.8 }, tail: { map: [65, 135], amp: 0.05, speed: 1 } },
    palette: { rain: '#A0FFF0' },
    raster: { map: 'sprites/beasts/azure_dragon.png', box: [72, 8, 228, 122], minL: 0.08, gain: 1,
      layer: 'body', regions: [
        { layer: 'neck', mask: [[0, 0], [60, 0], [62, 40], [50, 60], [30, 70], [0, 62]] },
        { layer: 'tail', mask: [[0, 130], [70, 128], [97, 140], [97, 168], [0, 168]] },
      ] },
    motes: { count: 22, btCount: 34, x0: 100, x1: 200, speed: 0.14, color: 'rain', y0: 118, rise: 110 },
  },
  azure_dragon__storm: { extends: 'azure_dragon', glow: '#B08AFF', palette: { rain: '#D8C0FF' }, raster: { hue: -95 } },

  golden_dragon: {
    extends: '_base', id: 'beast_golden_dragon', glow: '#FFD050', edgeGlow: 'sun',
    layerOrder: ['tail', 'body', 'neck'],
    motion: { neck: { map: [70, 72], amp: 0.03, speed: 0.8 }, tail: { map: [48, 110], amp: 0.05, speed: 1 } },
    palette: { sun: '#FFE890' },
    raster: { map: 'sprites/beasts/golden_dragon.png', box: [72, 8, 228, 122], minL: 0.1, gain: 0.95,
      layer: 'body', regions: [
        { layer: 'neck', mask: [[25, 0], [110, 0], [112, 40], [95, 62], [60, 66], [30, 50]] },
        { layer: 'tail', mask: [[0, 95], [45, 95], [60, 120], [50, 168], [0, 168]] },
      ] },
    motes: { count: 26, btCount: 40, x0: 90, x1: 210, speed: 0.16, color: 'sun', y0: 118, rise: 110 },
  },
  golden_dragon__crimson: { extends: 'golden_dragon', glow: '#FF7050', palette: { sun: '#FFA080' }, raster: { hue: 25, tint: '#D8200E', tintAmt: 0.7, sat: 1.6 } },
}
