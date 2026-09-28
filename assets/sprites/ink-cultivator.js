// INK_ART — hybrid ink-art data for the cultivator (roadmap A3-1, Phase 34): the seated Qi-Condensation figure as
// vector parts (drawn by renderer/engine/ink-renderer.js as ink dots or smooth fills), brush strokes, the glyph
// sword, and the effect settings (halo, tilted orbit rings, rising motes, background). Data only, no logic.
// Used by renderer/engine/ink-renderer.js (+ sprite-renderer.js picks it per sprite state). See docs/systems/art-engine.md.
//
// Coordinates: a 300×150 logical scene, figure centred on x = 150. Shape paths are flat command arrays:
//   'M', x, y · 'L', x, y · 'Q', cx, cy, x, y · 'C', c1x, c1y, c2x, c2y, x, y · 'E', cx, cy, rx, ry (ellipse) · 'Z'
// Parts are listed back → front. `layer` says which motion group a part rides with:
//   lap  = still · body = breathes (vertical scale about body.anchorY) · head = rides on top of the breathing body.
// Materials: robe / cuff / sash / hair = ink dots (tone from the light model + folds); skin / trim = smooth fills.
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
    palette: {
      sky0: '#0B0716', sky1: '#140C22', moon: '#E8E2D0',
      mountFar: '#241D3A', mountNear: '#312A4C', mist: '#8C88AA', bleed: '#07040D',
      robe: '#E2DACA', robeShade: '#76739A', robeDeep: '#403D60', rim: '#FFF8EA',
      cuff: '#4A4670', sash: '#B8433A', sashShade: '#6A2522',
      trim: '#DCBC68', trimShade: '#8A6E30',
      skin: '#EED3AE', skinShade: '#B08C66', lip: '#A85A52', eye: '#2A1820', brow: '#262A40',
      hair: '#262B45', hairMid: '#3C4570', hairHi: '#8490C0',
      steel: '#CFD8E8', hilt: '#EDD050', tassel: '#C83030', gold: '#F0D060',
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
      // ── head ──
      { id: 'hairBack', layer: 'head', mat: 'hair', d: ['E', 150, 30, 13, 14] },
      { id: 'face', layer: 'head', mat: 'skin', d: ['E', 150, 33, 10, 12] },
      { id: 'cap', layer: 'head', mat: 'hair',
        d: ['M', 138.6, 32, 'Q', 138, 18, 150, 17.5, 'Q', 162, 18, 161.4, 32, 'Q', 158, 25, 153, 27,
            'Q', 150, 24.5, 147, 27, 'Q', 142, 25, 138.6, 32, 'Z'] },
      { id: 'bun', layer: 'head', mat: 'hair', d: ['E', 150, 12, 6.8, 5.6] },
      { id: 'pin', layer: 'head', mat: 'trim',
        d: ['M', 151, 11.8, 'L', 166.6, 6.6, 'L', 166.9, 7.8, 'L', 151.3, 13, 'Z'] },
      { id: 'pinBead', layer: 'head', mat: 'trim', d: ['E', 167.4, 7, 1.4, 1.4] },
    ],
    // Brush strokes (tapered at both ends): folds, contours and the face. `w` = max width in logical px.
    // `live: true` strokes sway a little each frame (hair locks); the rest are baked into their layer.
    strokes: [
      // lap: the upper shin crossing, and the hem
      { layer: 'lap', color: 'robeDeep', alpha: 0.55, w: 1.3, pts: [[97, 111], [122, 103.5], [150, 102.5], [177, 104], [203, 111.5]] },
      { layer: 'lap', color: 'robeShade', alpha: 0.5, w: 0.9, pts: [[100, 117], [126, 122.5], [150, 123.5], [174, 122.5], [200, 117]] },
      { layer: 'lap', color: 'robeShade', alpha: 0.45, w: 0.8, pts: [[118, 97], [130, 101], [140, 107]] },
      { layer: 'lap', color: 'robeShade', alpha: 0.45, w: 0.8, pts: [[182, 97], [170, 101], [160, 107]] },
      // sleeves: long folds falling from the shoulder
      { layer: 'body', color: 'robeShade', alpha: 0.55, w: 0.9, pts: [[128, 55], [117, 70], [112, 93]] },
      { layer: 'body', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[133, 62], [127, 78], [124, 90]] },
      { layer: 'body', color: 'robeShade', alpha: 0.55, w: 0.9, pts: [[172, 55], [183, 70], [188, 93]] },
      { layer: 'body', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[167, 62], [173, 78], [176, 90]] },
      // torso: the robe gathered under the sash
      { layer: 'body', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[141, 74], [143, 80], [144, 83]] },
      { layer: 'body', color: 'robeShade', alpha: 0.4, w: 0.7, pts: [[160, 76], [158, 80.5], [157, 83]] },
      // sash tassel hanging from the knot
      { layer: 'body', color: 'sash', alpha: 0.9, w: 1.0, pts: [[165, 88.5], [166.2, 94], [165.4, 100]] },
      // the hand seal: thumbs touching over the palms
      { layer: 'body', color: 'skinShade', alpha: 0.85, w: 0.55, pts: [[147.2, 88.2], [150, 86.6], [152.8, 88.2]] },
      { layer: 'body', color: 'skinShade', alpha: 0.6, w: 0.45, pts: [[150, 90], [150, 93.4]] },
      { layer: 'body', color: 'skinShade', alpha: 0.5, w: 0.4, pts: [[142.5, 91.5], [145.5, 93.2], [148.5, 93.6]] },
      { layer: 'body', color: 'skinShade', alpha: 0.5, w: 0.4, pts: [[157.5, 91.5], [154.5, 93.2], [151.5, 93.6]] },
      // face: brows, closed eyes, nose, mouth
      { layer: 'head', color: 'brow', alpha: 0.95, w: 0.75, pts: [[143.6, 29.6], [145.8, 28.7], [148.1, 29.2]] },
      { layer: 'head', color: 'brow', alpha: 0.95, w: 0.75, pts: [[151.9, 29.2], [154.2, 28.7], [156.4, 29.6]] },
      { layer: 'head', color: 'eye', alpha: 0.95, w: 0.62, pts: [[143.7, 32.4], [145.7, 33.5], [147.8, 32.6]] },
      { layer: 'head', color: 'eye', alpha: 0.95, w: 0.62, pts: [[152.2, 32.6], [154.3, 33.5], [156.3, 32.4]] },
      { layer: 'head', color: 'skinShade', alpha: 0.7, w: 0.4, pts: [[150.2, 34.3], [150.6, 36.2], [149.6, 36.9]] },
      { layer: 'head', color: 'lip', alpha: 0.9, w: 0.5, pts: [[148.2, 39.4], [150, 40.1], [151.8, 39.4]] },
      // hair: sheen on the cap and the bun
      { layer: 'head', color: 'hairHi', alpha: 0.55, w: 0.6, pts: [[141, 27], [143.5, 21], [150, 18.8]] },
      { layer: 'head', color: 'hairHi', alpha: 0.5, w: 0.55, pts: [[145, 11], [148.5, 7.6], [153, 7.4]] },
      // hair locks framing the face (sway)
      { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[138.2, 27], [135.6, 38], [136.4, 47], [138.4, 56]] },
      { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[161.8, 27], [164.4, 38], [163.6, 47], [161.6, 56]] },
      { layer: 'head', live: true, color: 'hairHi', alpha: 0.45, w: 0.5, pts: [[137.8, 30], [136, 39], [136.8, 48]] },
      { layer: 'head', live: true, color: 'hairHi', alpha: 0.45, w: 0.5, pts: [[162.2, 30], [164, 39], [163.2, 48]] },
    ],
    // (b)'s glyph parts, placed on their motion layer: the sword across the knees, the sash knot
    glyphs: [
      { layer: 'lap', text: '◂══════════════════════╡▐═○', x: 150, y: 114, size: 8, rot: -0.035, color: 'steel', glow: 3,
        map: { '╡': 'hilt', '▐': 'hilt', '○': 'tassel' } },
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
