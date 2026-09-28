// INK_ART — hybrid ink-art data for the cultivator (roadmap A3-1/A3-2, Phase 34): the seated Qi-Condensation BASE
// figure (lap, robe, hands, face shape) as vector parts drawn by renderer/engine/ink-renderer.js, brush strokes, the
// effect settings (halo, tilted orbit rings, rising motes, background) and the default `slots`. Face features, hair,
// robe colour, weapon and aura come from INK_PARTS (assets/sprites/ink-parts.js). Data only, no logic.
// Used by renderer/engine/ink-renderer.js (+ sprite-renderer.js picks it per sprite state). See docs/systems/art-engine.md.
//
// Coordinates: a 300×150 logical scene, figure centred on x = 150. Shape paths are flat command arrays:
//   'M', x, y · 'L', x, y · 'Q', cx, cy, x, y · 'C', c1x, c1y, c2x, c2y, x, y · 'E', cx, cy, rx, ry (ellipse) · 'Z'
// Parts are listed back → front. `layer` says which motion group a part rides with:
//   lap  = still · body = breathes (vertical scale about body.anchorY) · head = rides on top of the breathing body.
// Materials: everything is ink dots (tone from the light model + folds) EXCEPT objects: metal / steel / grip = solid
// fills (user 2026-09-27: only objects like the sword and hairpin are solid; a solid face or halo reads as clip art).
// Colours are palette keys (see `palette`), never literals in the parts.

// Review: accepted by the user 2026-09-27 (A3-1; user reviews art directly, see docs/systems/ui-review.md)
const INK_ART = {
  meditating: {
    id: 'cultivator_qc',
    scene: [300, 150],
    figureBox: [84, 2, 220, 128],          // what the small-size (banner) view frames
    light: { x: 150, spread: 60 },         // light comes from the upper left
    dot: { pitch: 1.75 },                  // ink-dot spacing in logical px (hex-staggered rows)
    body: { anchorY: 97, breathe: 0.035 }, // shoulders rise ~1.6px on the in-breath; the lap stays put
    // The default look: one option per slot from INK_PARTS (assets/sprites/ink-parts.js). A3-2; A5 lets the player choose.
    slots: { face: 'calm', hair: 'bun', robe: 'moon', weapon: 'sword', aura: 'orbit' },
    palette: {
      sky0: '#0B0716', sky1: '#140C22', moon: '#E8E2D0',
      mountFar: '#241D3A', mountNear: '#312A4C', mist: '#8C88AA', bleed: '#07040D',
      robe: '#E2DACA', robeShade: '#76739A', robeDeep: '#403D60', rim: '#FFF8EA',
      cuff: '#4A4670', sash: '#B8433A', sashShade: '#6A2522',
      trim: '#DCBC68', trimShade: '#8A6E30',
      skin: '#EED3AE', skinShade: '#B08C66', lip: '#A85A52', eye: '#2A1820', brow: '#262A40',
      hair: '#262B45', hairMid: '#3C4570', hairHi: '#8490C0',
      steel: '#D6DEEC', steelShade: '#6E7890', grip: '#4A3230', gripHi: '#9A7A58',
      tassel: '#C83030', gold: '#F0D060', eyeInk: '#3A2826', eyeGlow: '#D4F2FF', mouthInk: '#5A3030',
      blush: '#DE9C8C', jade: '#8FD0B4', jadeShade: '#2F6E58',
    },
    parts: [
      // ── lap: crossed legs in lotus, knees wide ──
      { id: 'lap', layer: 'lap', mat: 'robe',
        d: ['M', 88, 112, 'C', 85, 100, 104, 93, 124, 95, 'L', 176, 95, 'C', 196, 93, 215, 100, 212, 112,
            'C', 210, 121, 188, 125, 150, 125, 'C', 112, 125, 90, 121, 88, 112, 'Z'],
        fold: { k: 0.34, ang: 1.35, warp: 1.6, amp: 0.22 } },
      // ── body ──
      { id: 'torso', layer: 'body', mat: 'robe',
        d: ['M', 130, 50, 'L', 170, 50, 'Q', 177, 72, 176, 96, 'L', 124, 96, 'Q', 123, 72, 130, 50, 'Z'],
        fold: { k: 0.5, ang: 0.15, warp: 1.2, amp: 0.16 } },
      { id: 'sleeveL', layer: 'body', mat: 'robe',
        d: ['M', 131, 50, 'Q', 104, 66, 104, 98, 'Q', 120, 101, 139, 97, 'Q', 136, 74, 140, 58, 'Z'],
        fold: { k: 0.42, ang: 0.35, warp: 2.0, amp: 0.24 } },
      { id: 'sleeveR', layer: 'body', mat: 'robe',
        d: ['M', 169, 50, 'Q', 196, 66, 196, 98, 'Q', 180, 101, 161, 97, 'Q', 164, 74, 160, 58, 'Z'],
        fold: { k: 0.42, ang: -0.35, warp: 2.0, amp: 0.24 } },
      // inner sleeve openings: the forearms reaching in to the hand seal
      { id: 'cuffL', layer: 'body', mat: 'cuff',
        d: ['M', 126, 91, 'Q', 135, 86, 144, 86, 'L', 144, 93, 'Q', 135, 94, 127, 98, 'Z'] },
      { id: 'cuffR', layer: 'body', mat: 'cuff',
        d: ['M', 174, 91, 'Q', 165, 86, 156, 86, 'L', 156, 93, 'Q', 165, 94, 173, 98, 'Z'] },
      { id: 'sash', layer: 'body', mat: 'sash',
        d: ['M', 126, 83.5, 'L', 174, 83.5, 'L', 174.6, 89, 'L', 125.4, 89, 'Z'] },
      { id: 'neck', layer: 'body', mat: 'skin',
        d: ['M', 146, 40, 'L', 154, 40, 'L', 154.6, 51, 'L', 145.4, 51, 'Z'] },
      // cross collar (right lapel over left, the hanfu way)
      { id: 'lapelUnder', layer: 'body', mat: 'trim',
        d: ['M', 159, 49.5, 'L', 155.8, 49.5, 'L', 150, 58.8, 'L', 152, 60.8, 'Z'] },
      { id: 'lapelOver', layer: 'body', mat: 'trim',
        d: ['M', 141, 49.5, 'L', 144.8, 49.5, 'L', 159.8, 70.4, 'L', 157.2, 72.2, 'Z'] },
      { id: 'hands', layer: 'body', mat: 'skin', d: ['E', 150, 90, 8.8, 4.7] },
      // ── head (hair, hairpin / crown come from the hair slot) ──
      { id: 'face', layer: 'head', mat: 'skin',
        d: ['M', 140.4, 30, 'Q', 140, 21.5, 150, 21.3, 'Q', 160, 21.5, 159.6, 30, 'Q', 159.7, 38.2, 155.6, 42.6,
            'Q', 152.6, 45.4, 150, 45.4, 'Q', 147.4, 45.4, 144.4, 42.6, 'Q', 140.3, 38.2, 140.4, 30, 'Z'] },
    ],
    // Brush strokes (tapered at both ends): folds, contours and the face. `w` = max width in logical px.
    // `after: <part id>` paints a stroke right after that part (so later parts cover it); `live: true` strokes sway each frame, drawn as grid-snapped dots (hair locks); the rest are baked into their layer.
    strokes: [
      // lap: the upper shin crossing, and the hem
      { layer: 'lap', after: 'lap', color: 'robeDeep', alpha: 0.55, w: 1.3, pts: [[97, 111], [122, 103.5], [150, 102.5], [177, 104], [203, 111.5]] },
      { layer: 'lap', after: 'lap', color: 'robeShade', alpha: 0.5, w: 0.9, pts: [[100, 117], [126, 122.5], [150, 123.5], [174, 122.5], [200, 117]] },
      { layer: 'lap', after: 'lap', color: 'robeShade', alpha: 0.45, w: 0.8, pts: [[118, 97], [130, 101], [140, 107]] },
      { layer: 'lap', after: 'lap', color: 'robeShade', alpha: 0.45, w: 0.8, pts: [[182, 97], [170, 101], [160, 107]] },
      // sleeves: long folds falling from the shoulder
      { layer: 'body', after: 'sleeveR', color: 'robeShade', alpha: 0.55, w: 0.9, pts: [[128, 55], [117, 70], [112, 93]] },
      { layer: 'body', after: 'sleeveR', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[133, 62], [127, 78], [124, 90]] },
      { layer: 'body', after: 'sleeveR', color: 'robeShade', alpha: 0.55, w: 0.9, pts: [[172, 55], [183, 70], [188, 93]] },
      { layer: 'body', after: 'sleeveR', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[167, 62], [173, 78], [176, 90]] },
      // torso: the robe gathered under the sash
      { layer: 'body', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[141, 74], [143, 80], [144, 83]] },
      { layer: 'body', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[160, 76], [158, 80.5], [157, 83]] },
      // sash tassel hanging from the knot
      { layer: 'body', color: 'sash', alpha: 0.9, w: 1.0, pts: [[165, 88.5], [166.2, 94], [165.4, 100]] },
    ],
    // Dot features: the dots of a part that fall within `w` of the polyline take that colour (eyes, brows, mouth,
    // the hand seal) — the pixelated dot face the user chose (A2 hybrid look), no drawn lines on skin.
    dotFeatures: [
      { part: 'hands', color: 'skinShade', w: 0.7, pts: [[147.2, 88.2], [150, 86.8], [152.8, 88.2]] },
      { part: 'hands', color: 'skinShade', w: 0.6, pts: [[150, 89.6], [150, 93.2]] },
    ],
    // (b)'s glyph parts, placed on their motion layer: the sword across the knees, the sash knot
    glyphs: [
      { layer: 'body', text: '◈', x: 165, y: 86.3, size: 6, color: 'gold', glow: 4 },
    ],
    // Effects
    qiPearl: { x: 150, y: 84.6, r: 1.5 },                       // the mote held in the hand seal
    halo: { x: 150, y: 32, r: 25 },                            // behind the head (rides with it)
    rings: [                                                   // tilted orbits: the signature effect
      { cx: 150, cy: 76, rx: 80, ry: 15, tilt: -0.16, speed: 0.32, motes: 5, alpha: 0.9 },
      { cx: 150, cy: 70, rx: 70, ry: 22, tilt: 0.3, speed: -0.24, motes: 4, alpha: 0.75 },
      { cx: 150, cy: 82, rx: 96, ry: 9, tilt: 0.06, speed: 0.18, motes: 3, alpha: 0.6 },
    ],
    motes: { count: 12, btCount: 30, x0: 66, x1: 234, speed: 0.11 }, // straight-rising ambient Qi
    background: {
      glow: { x: 150, y: 48, r: 125 },
      moon: { x: 252, y: 26, r: 8 },
      ridgeFar: [78, 10, 0.021, 1, 6, 0.057, 2, 3, 0.13, 0],   // y + Σ amp·sin(x·freq + phase)
      ridgeNear: [98, 8, 0.03, 4, 4, 0.09, 1, 1.5, 0.21, 2],
      mistY: [92, 121],
    },
  },
}

// ── Realm variants (A4-1): each sprite state `extends` the Qi Condensation figure and overrides only what its realm
// changes (renderer/engine/ink-renderer.js `InkRenderer.resolve`). The robe / hair / weapon / aura slots stay the
// player's (A5); a variant only sets the default look for that realm. Stage colour (stages.js) tints every effect.
//   idle            Mortal            no Qi yet: plain hemp, empty hands, no halo, rings or pearl; a few faint motes
//   meditating      Qi Condensation   the base figure above
//   meditating_deep Foundation        a formation array turns on the ground under the lap; brighter halo
//   levitating      Core Formation    the body lifts off the ground (shadow on the mist); the pearl is a golden core
//   transcending    Nascent Soul →    a double halo, a fourth ring, and the Nascent Soul itself: a smaller dotted
//                   Immortal          self seated above the crown (the view zooms out to make room)
INK_ART.idle = {
  extends: 'meditating', id: 'cultivator_mortal',
  aura: false,                                            // no Qi to shape: the aura slot has nothing to show yet
  slots: { robe: 'hemp', weapon: 'none' },
  halo: null, qiPearl: null, rings: [], glyphs: [],
  body: { breathe: 0.045 },                               // a mortal's breath is deeper and plainer
  motes: { count: 5, btCount: 26, x0: 96, x1: 204, speed: 0.05 },
  background: { glow: { x: 150, y: 70, r: 80 } },
}

INK_ART.meditating_deep = {
  extends: 'meditating', id: 'cultivator_foundation',
  formation: { cx: 150, cy: 124, rx: 86, ry: 12.5, speed: 0.07, alpha: 0.9 },
  halo: { r: 26 },
  motes: { count: 16, btCount: 34, x0: 60, x1: 240, speed: 0.12 },
  background: { glow: { x: 150, y: 56, r: 140 } },
}

INK_ART.levitating = {
  extends: 'meditating', id: 'cultivator_core',
  float: { y: -9, bob: 1.6, shadow: { x: 150, y: 133, rx: 50, ry: 5.5 } },
  view: [-12, -12, 324, 162],                             // zoomed out a little: headroom for the lifted halo
  figureBox: [84, -10, 220, 128],
  halo: { r: 23 },
  qiPearl: { r: 2.3, color: 'gold', glow: 1.6 },          // the golden core, formed
  motes: { count: 18, btCount: 36, x0: 56, x1: 244, speed: 0.13 },
  background: { glow: { x: 150, y: 52, r: 145 } },
}

INK_ART.transcending = {
  extends: 'levitating', id: 'cultivator_nascent',
  float: { y: -2, bob: 1.2, shadow: { x: 150, y: 132, rx: 54, ry: 4.5 } },
  view: [-52, -52, 404, 202],                             // room above the crown for the soul
  halo: { r: 20, outer: 1.1 },
  // the Nascent Soul: a small self (scale) with an infant's big head (headScale, about neckY) seated on a cloud of
  // light (cloud = glow radius) above the crown; its seat is at y + dy, re-sampled on the figure's own dot pitch
  avatar: { scale: 0.38, headScale: 1.75, neckY: 46, x: 150, y: 125, dy: -118, alpha: 0.95, cloud: 22 },
  rings: [
    { cx: 150, cy: 76, rx: 80, ry: 15, tilt: -0.16, speed: 0.32, motes: 5, alpha: 0.9 },
    { cx: 150, cy: 70, rx: 70, ry: 22, tilt: 0.3, speed: -0.24, motes: 4, alpha: 0.75 },
    { cx: 150, cy: 82, rx: 96, ry: 9, tilt: 0.06, speed: 0.18, motes: 3, alpha: 0.6 },
    { cx: 150, cy: 60, rx: 112, ry: 12, tilt: -0.08, speed: -0.12, motes: 4, alpha: 0.5 },
  ],
  motes: { count: 22, btCount: 42, x0: 40, x1: 260, speed: 0.15 },
  background: { glow: { x: 150, y: 50, r: 160 } },
}
