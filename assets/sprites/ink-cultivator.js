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
    halo: null,                                                // no halo yet: it first appears at Foundation (user 2026-09-27)
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

// ── Realm variants (A4-1): each sprite state `extends` another and overrides only what its realm changes
// (renderer/engine/ink-renderer.js `InkRenderer.resolve`). User direction (2026-09-27): the realms must look WILDLY
// different, and the high realms must be something players look forward to. Each realm adds a tier of spectacle:
//   idle            Mortal            a shirtless peasant in hemp trousers: no robe, no Qi, no effects at all
//   meditating      Qi Condensation   the robe, rings and the Qi pearl (the base figure above), no halo yet
//   meditating_deep Foundation        the halo appears; a formation array turns on the ground
//   levitating      Core Formation    floats; the golden core; a jade crown; one baby Qi dragon circles
//   transcending    Nascent Soul      two young Qi dragons, a double halo, a lotus of light, celestial ribbons
//   severing        Spirit Severing   two grown dragons chasing pearls, a fan of flying swords, a sun-disk halo
//   ascended        Ascension         three golden dragons, eleven swords, a celestial robe, heaven's pillar, a gold sky
// The robe / hair / weapon / aura slots stay the player's choice (A5); a variant only sets that realm's default look.
// Dragons are Qi spirits, not beasts: { cx cy rx ry tilt (orbit) speed phase arc (length) size wave bob tier color? }

INK_ART.idle = {
  extends: 'meditating', id: 'cultivator_mortal',
  aura: false,                                            // no Qi to shape: the aura slot has nothing to show yet
  slots: { robe: 'hemp', hair: 'rag', weapon: 'none' },
  palette: { skin: '#E0B890', skinShade: '#94694A' },     // sun-browned from field work
  halo: null, qiPearl: null, rings: [], glyphs: [],
  body: { breathe: 0.045 },
  motes: { count: 4, btCount: 26, x0: 100, x1: 200, speed: 0.05 },
  background: { glow: { x: 150, y: 70, r: 70 } },
  // bare chest and arms, hemp trousers, a rope belt (the lap is the trousers: `robe` takes the hemp palette)
  parts: [
    INK_ART.meditating.parts[0],
    { id: 'waist', layer: 'body', mat: 'robe', d: ['M', 131, 85, 'L', 169, 85, 'L', 175, 97, 'L', 125, 97, 'Z'] },
    { id: 'torso', layer: 'body', mat: 'skin',
      d: ['M', 145, 46, 'Q', 133, 47, 127.5, 52.5, 'Q', 129, 61, 131.5, 70, 'Q', 133.5, 79, 133, 88, 'L', 167, 88,
          'Q', 166.5, 79, 168.5, 70, 'Q', 171, 61, 172.5, 52.5, 'Q', 167, 47, 155, 46, 'Z'] },
    { id: 'belt', layer: 'body', mat: 'sash', d: ['M', 131.4, 85.2, 'L', 168.6, 85.2, 'L', 169.2, 88.4, 'L', 130.8, 88.4, 'Z'] },
    { id: 'armL', layer: 'body', mat: 'skin',
      d: ['M', 128, 51, 'Q', 120, 54, 117.5, 66, 'Q', 115.5, 77, 118, 86, 'Q', 121, 90, 125, 89, 'Q', 127, 77, 131, 63, 'Z'] },
    { id: 'armR', layer: 'body', mat: 'skin',
      d: ['M', 172, 51, 'Q', 180, 54, 182.5, 66, 'Q', 184.5, 77, 182, 86, 'Q', 179, 90, 175, 89, 'Q', 173, 77, 169, 63, 'Z'] },
    { id: 'foreL', layer: 'body', mat: 'skin',
      d: ['M', 117.5, 83, 'Q', 121, 91.5, 135, 91.5, 'L', 146, 90, 'L', 146, 94.5, 'Q', 132, 97, 121, 93.5, 'Q', 116.5, 90, 117.5, 83, 'Z'] },
    { id: 'foreR', layer: 'body', mat: 'skin',
      d: ['M', 182.5, 83, 'Q', 179, 91.5, 165, 91.5, 'L', 154, 90, 'L', 154, 94.5, 'Q', 168, 97, 179, 93.5, 'Q', 183.5, 90, 182.5, 83, 'Z'] },
    { id: 'neck', layer: 'body', mat: 'skin', d: ['M', 146, 40, 'L', 154, 40, 'L', 154.6, 48, 'L', 145.4, 48, 'Z'] },
    { id: 'hands', layer: 'body', mat: 'skin', d: ['E', 150, 91.5, 7.5, 4.3] },
    INK_ART.meditating.parts.find(p => p.id === 'face'),
  ],
  // only the trouser folds (the robe's sleeve / sash strokes have no cloth to sit on)
  strokes: INK_ART.meditating.strokes.filter(s => s.after === 'lap'),
  // anatomy in dots: collarbones, chest, sternum, the line of the belly; knuckles on the resting hands
  dotFeatures: [
    { part: 'torso', color: 'skinShade', w: 0.6, pts: [[139.75, 53.04], [146, 53.04]] },
    { part: 'torso', color: 'skinShade', w: 0.6, pts: [[154, 53.04], [160.25, 53.04]] },
    { part: 'torso', color: 'skinShade', w: 0.6, pts: [[135.6, 65.17], [140.8, 66.69], [147.4, 65.17]] },
    { part: 'torso', color: 'skinShade', w: 0.6, pts: [[152.6, 65.17], [159.2, 66.69], [164.4, 65.17]] },
    { part: 'torso', color: 'skinShade', w: 0.6, pts: [[150, 57.58], [150, 62.13]] },
    { part: 'torso', color: 'skinShade', w: 0.6, pts: [[150, 71.22], [150, 80.32]] },
    { part: 'hands', color: 'skinShade', w: 0.6, pts: [[145.6, 90.95], [154.4, 90.95]] },
  ],
}

INK_ART.meditating_deep = {
  extends: 'meditating', id: 'cultivator_foundation',
  halo: { x: 150, y: 32, r: 25 },                         // the halo: Foundation is where it first appears
  formation: { cx: 150, cy: 124, rx: 86, ry: 12.5, speed: 0.07, alpha: 0.9 },
  motes: { count: 16, btCount: 34, x0: 60, x1: 240, speed: 0.12 },
  background: { glow: { x: 150, y: 56, r: 140 } },
}

INK_ART.levitating = {
  extends: 'meditating_deep', id: 'cultivator_core',
  formation: null,
  slots: { robe: 'azure', hair: 'crown' },
  float: { y: -8, bob: 1.6, shadow: { x: 150, y: 133, rx: 50, ry: 5.5 } },
  view: [-14, -14, 328, 164],                             // zoomed out a little: headroom for the lifted halo
  figureBox: [84, -10, 220, 128],
  halo: { r: 24 },
  qiPearl: { r: 2.5, color: 'gold', glow: 1.8 },          // the golden core, formed
  dragons: [
    { cx: 150, cy: 70, rx: 86, ry: 30, tilt: -0.22, speed: 0.42, phase: 0.6, arc: 1.4, size: 3.2, wave: 1.5, bob: 6, tier: 1 },
  ],
  motes: { count: 18, btCount: 36, x0: 56, x1: 244, speed: 0.13 },
  background: { glow: { x: 150, y: 52, r: 145 } },
}

INK_ART.transcending = {
  extends: 'levitating', id: 'cultivator_nascent',
  slots: { robe: 'crimson', hair: 'crown' },
  palette: { ribbon: '#8FE0C4' },                         // jade ribbons against the gold dragons
  float: { y: -9, bob: 1.8, shadow: { x: 150, y: 133, rx: 58, ry: 5.5 } },
  view: [-26, -26, 352, 176],
  figureBox: [60, -14, 240, 132],
  halo: { r: 23, outer: 1.18 },
  lotus: { x: 150, y: 124, w: 130, h: 26, n: 9 },
  ribbons: [
    { color: 'ribbon', w: 2.5, wave: 3.5, pts: [[134, 52], [122, 43], [106, 40], [92, 47], [85, 62], [78, 79], [65, 92], [48, 99]] },
    { color: 'ribbon', w: 2.5, wave: 3.5, pts: [[166, 52], [178, 43], [194, 40], [208, 47], [215, 62], [222, 79], [235, 92], [252, 99]] },
  ],
  rings: [
    { cx: 150, cy: 76, rx: 84, ry: 15, tilt: -0.16, speed: 0.32, motes: 5, alpha: 0.8 },
    { cx: 150, cy: 82, rx: 100, ry: 9, tilt: 0.06, speed: 0.18, motes: 3, alpha: 0.55 },
  ],
  dragons: [
    { cx: 150, cy: 66, rx: 100, ry: 34, tilt: -0.2, speed: 0.36, phase: 0.4, arc: 1.7, size: 4.2, wave: 2, bob: 7, tier: 2 },
    { cx: 150, cy: 74, rx: 92, ry: 26, tilt: 0.24, speed: 0.36, phase: 3.5, arc: 1.7, size: 4.2, wave: 2, bob: 7, tier: 2 },
  ],
  motes: { count: 22, btCount: 42, x0: 40, x1: 260, speed: 0.15 },
  background: { glow: { x: 150, y: 50, r: 160 } },
}

INK_ART.severing = {
  extends: 'transcending', id: 'cultivator_severing',
  slots: { robe: 'sovereign', hair: 'crown' },
  palette: {
    sky0: '#10050B', sky1: '#23091A', moon: '#F0B0A0', mountFar: '#2E1224', mountNear: '#3C1830', mist: '#A8707E',
    bleed: '#080308', ribbon: '#E8C070', swordGlow: '#FF9A7A',
  },
  view: [-34, -34, 368, 184],
  figureBox: [50, -24, 250, 132],
  halo: { r: 23, outer: 1.18, rays: 24, rayLen: 9 },     // the sun-disk
  swords: { cx: 150, cy: 82, r: 74, n: 9, spread: 2.5, len: 24 },
  dragons: [
    { cx: 150, cy: 64, rx: 118, ry: 38, tilt: -0.18, speed: 0.3, phase: 0.2, arc: 2.0, size: 5.2, wave: 2.4, bob: 8, tier: 3 },
    { cx: 150, cy: 74, rx: 108, ry: 30, tilt: 0.22, speed: 0.3, phase: 3.3, arc: 2.0, size: 5.2, wave: 2.4, bob: 8, tier: 3, color: 'gold' },
  ],
  motes: { count: 28, btCount: 50, x0: 20, x1: 280, speed: 0.17 },
  background: { glow: { x: 150, y: 48, r: 175 } },
}

INK_ART.ascended = {
  extends: 'severing', id: 'cultivator_ascended',
  slots: { robe: 'celestial', hair: 'crown' },
  palette: {
    sky0: '#1C1020', sky1: '#4A2C1E', moon: '#FFE8A8', mountFar: '#46302E', mountNear: '#5A3C2C', mist: '#F0D090',
    bleed: '#1A0E0C', ribbon: '#FFF2C8', swordGlow: '#FFE08A', dragonPale: '#FFF6DA',
  },
  view: [-40, -40, 380, 190],
  figureBox: [40, -30, 260, 132],
  pillar: { x: 150, y: 130, w: 52, alpha: 0.14, color: 'gold' },
  halo: { r: 23, outer: 1.2, rays: 32, rayLen: 13 },
  swords: { cx: 150, cy: 82, r: 80, n: 11, spread: 2.8, len: 26 },
  dragons: [
    { cx: 150, cy: 62, rx: 126, ry: 40, tilt: -0.16, speed: 0.28, phase: 0.2, arc: 2.1, size: 5.6, wave: 2.6, bob: 9, tier: 4, color: 'gold' },
    { cx: 150, cy: 72, rx: 116, ry: 32, tilt: 0.2, speed: 0.28, phase: 2.3, arc: 2.1, size: 5.6, wave: 2.6, bob: 9, tier: 4, color: 'gold' },
    { cx: 150, cy: 56, rx: 104, ry: 46, tilt: 0.05, speed: -0.24, phase: 4.4, arc: 1.9, size: 5.0, wave: 2.4, bob: 7, tier: 4, color: 'dragonPale' },
  ],
  motes: { count: 34, btCount: 60, x0: 10, x1: 290, speed: 0.2 },
  background: { glow: { x: 150, y: 46, r: 190 }, moon: { x: 250, y: 20, r: 12 } },
}
