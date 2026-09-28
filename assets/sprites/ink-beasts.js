// INK_BEASTS: hybrid ink art for the spirit beasts (roadmap A4-2, Phase 34): Spirit Fox, Thunder Eagle, Void Hound, in
// the same part / stroke / dot-feature format as INK_ART (assets/sprites/ink-cultivator.js), drawn by
// renderer/engine/ink-renderer.js (an InkRenderer given `{ table: INK_BEASTS }`) as animated portraits by
// renderer/game/beast-portrait.js in Roam → Beasts. Keyed by BEAST_TYPES[].spriteState (assets/data/beasts.js).
// Data only, no logic. See docs/systems/art-engine.md → "Beasts".
//
// Each beast `extends: '_base'` (shared palette + background). Coordinates: the 300×150 scene, beast centred on x = 150;
// `view` frames the portrait. Materials follow the cultivator rules (user 2026-09-27: only objects are solid, so
// beasts are all ink dots): `robe` = the main coat (tonal, with folds), `hair` = the darker coat / feathers,
// `trim` = pale fur or bright feathers, `skin` = the face (the only part that takes dot features: eyes, marks),
// `cuff` = deep shadow (inner ears, mouths). Extra motion layers (`layerOrder`, `motion`): tails sway, wings beat.
// Dot grid for features: columns at x = 150 ± 1.75k on even rows, 150 ± 0.875 ± 1.75k on odd rows; rows y = row × 1.5155.

// Review: pending (A4-2, 2026-09-27; the user reviews art directly, see docs/systems/ui-review.md)
const INK_BEASTS = {
  _base: {
    scene: [300, 150],
    dot: { pitch: 1.75 },
    light: { x: 140, spread: 50 },
    halo: null, qiPearl: null, rings: [], glyphs: [], strokes: [], dotFeatures: [], slots: {},
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
  },

  // ── SPIRIT FOX: seated, facing you; three plumed tails fanned behind; foxfire rising; spirit-blue eyes ──
  spirit_fox: {
    extends: '_base', id: 'beast_spirit_fox', glow: '#8FD8FF',     // glow = the Qi colour of its effects
    view: [84, 20, 216, 124],
    figureBox: [100, 22, 200, 124],
    body: { anchorY: 118, headY: 60, breathe: 0.03 },
    layerOrder: ['tail', 'lap', 'body', 'head'],
    motion: { tail: { pivot: [150, 112], amp: 0.07, speed: 1.3 } },
    palette: {
      robe: '#E89A4C', robeShade: '#9A5424', robeDeep: '#4E2410', rim: '#FFE2B8',
      hair: '#5A2A14', hairMid: '#7A3A1A', hairHi: '#B0642E',
      trim: '#F6EEE0', trimShade: '#B8AE9E', cuff: '#2A1410', sash: '#E89A4C', sashShade: '#9A5424',
      skin: '#EDA258', skinShade: '#9A5424', fire: '#8FD8FF',
    },
    parts: [
      // tails: two plumes sweeping out along the ground and curling up at the sides, tapering to white points
      { id: 'tailR', layer: 'tail', mat: 'robe', fold: { k: 0.45, ang: -0.9, warp: 1.4, amp: 0.2 },
        d: ['M', 150, 118, 'C', 176, 123, 204, 116, 208, 94, 'C', 210, 80, 202, 68, 190, 64, 'C', 196, 76, 194, 92, 180, 100,
            'C', 170, 106, 160, 108, 150, 108, 'Z'] },
      { id: 'tipR', layer: 'tail', mat: 'trim', d: ['M', 208, 94, 'C', 210, 80, 202, 68, 190, 64, 'C', 196, 72, 197, 82, 200, 96, 'Z'] },
      { id: 'tailL', layer: 'tail', mat: 'robe', fold: { k: 0.45, ang: 0.9, warp: 1.4, amp: 0.2 },
        d: ['M', 150, 118, 'C', 124, 123, 96, 116, 92, 94, 'C', 90, 80, 98, 68, 110, 64, 'C', 104, 76, 106, 92, 120, 100,
            'C', 130, 106, 140, 108, 150, 108, 'Z'] },
      { id: 'tipL', layer: 'tail', mat: 'trim', d: ['M', 92, 94, 'C', 90, 80, 98, 68, 110, 64, 'C', 104, 72, 103, 82, 100, 96, 'Z'] },
      // haunches + front legs (still)
      { id: 'haunch', layer: 'lap', mat: 'robe', fold: { k: 0.4, ang: 1.3, warp: 1.2, amp: 0.2 }, d: ['E', 150, 111, 19, 9.5] },
      { id: 'legL', layer: 'lap', mat: 'hair', d: ['M', 139.5, 96, 'L', 146, 96, 'L', 146.2, 119, 'L', 139, 119, 'Z'] },
      { id: 'legR', layer: 'lap', mat: 'hair', d: ['M', 154, 96, 'L', 160.5, 96, 'L', 161, 119, 'L', 153.8, 119, 'Z'] },
      { id: 'pawL', layer: 'lap', mat: 'hair', d: ['E', 142.6, 119.5, 4.4, 2] },
      { id: 'pawR', layer: 'lap', mat: 'hair', d: ['E', 157.4, 119.5, 4.4, 2] },
      // chest + white ruff (breathes)
      { id: 'chest', layer: 'body', mat: 'robe', fold: { k: 0.5, ang: 0.2, warp: 1, amp: 0.15 },
        d: ['M', 138, 112, 'Q', 135, 92, 142, 78, 'Q', 150, 72, 158, 78, 'Q', 165, 92, 162, 112, 'Z'] },
      { id: 'ruff', layer: 'body', mat: 'trim',
        d: ['M', 143, 78, 'Q', 150, 74, 157, 78, 'Q', 159, 88, 155, 96, 'L', 152.5, 93, 'L', 150, 99, 'L', 147.5, 93, 'L', 145, 96, 'Q', 141, 88, 143, 78, 'Z'] },
      // head: a wedge, wide at the cheeks, pointed at the muzzle; tall ears set wide
      { id: 'earL', layer: 'head', mat: 'robe', d: ['M', 135.5, 54, 'L', 130, 28, 'L', 146, 46, 'Z'] },
      { id: 'earR', layer: 'head', mat: 'robe', d: ['M', 164.5, 54, 'L', 170, 28, 'L', 154, 46, 'Z'] },
      { id: 'earInL', layer: 'head', mat: 'cuff', d: ['M', 136.6, 49, 'L', 132.6, 33.5, 'L', 142.6, 45.5, 'Z'] },
      { id: 'earInR', layer: 'head', mat: 'cuff', d: ['M', 163.4, 49, 'L', 167.4, 33.5, 'L', 157.4, 45.5, 'Z'] },
      { id: 'face', layer: 'head', mat: 'skin',
        d: ['M', 133, 55, 'Q', 137, 44, 150, 44, 'Q', 163, 44, 167, 55, 'Q', 165, 61, 158, 64, 'L', 152, 76, 'Q', 150, 78, 148, 76,
            'L', 142, 64, 'Q', 135, 61, 133, 55, 'Z'] },
      { id: 'cheekL', layer: 'head', mat: 'trim', d: ['M', 133, 55, 'Q', 135, 61, 142, 64, 'L', 143.5, 67, 'Q', 135, 64, 133, 55, 'Z'] },
      { id: 'cheekR', layer: 'head', mat: 'trim', d: ['M', 167, 55, 'Q', 165, 61, 158, 64, 'L', 156.5, 67, 'Q', 165, 64, 167, 55, 'Z'] },
      { id: 'muzzle', layer: 'head', mat: 'trim', d: ['M', 144.5, 63, 'Q', 150, 61, 155.5, 63, 'L', 151.4, 75.6, 'Q', 150, 77, 148.6, 75.6, 'Z'] },
      { id: 'nose', layer: 'head', mat: 'cuff', d: ['E', 150, 75.6, 1.7, 1.2] },
    ],
    dotFeatures: [
      // slanted spirit-blue eyes, a gold mark on the brow
      { part: 'face', color: 'eyeGlow', w: 0.6, pts: [[141.25, 54.56], [144.75, 53.04]] },
      { part: 'face', color: 'eyeGlow', w: 0.6, pts: [[155.25, 53.04], [158.75, 54.56]] },
      { part: 'face', color: 'gold', w: 0.6, pts: [[150, 47.98]] },
      { part: 'face', color: 'skinShade', w: 0.6, pts: [[150, 50.01], [150, 51.53]] },
    ],
    // foxfire: pale blue wisps drifting up from the tail tips
    motes: { count: 10, btCount: 20, x0: 104, x1: 196, speed: 0.12, color: 'fire', y0: 70, rise: 50 },
  },

  // ── THUNDER EAGLE: wings raised on a crag, beating slowly; white head, gold beak and talons; lightning crackles ──
  thunder_eagle: {
    extends: '_base', id: 'beast_thunder_eagle', glow: '#A8C8FF',
    view: [78, 16, 222, 124],
    figureBox: [84, 22, 216, 124],
    body: { anchorY: 110, headY: 50, breathe: 0.025 },
    layerOrder: ['lap', 'wingL', 'wingR', 'body', 'head'],
    motion: {
      wingL: { pivot: [141, 68], amp: 0.12, speed: 1.5 },
      wingR: { pivot: [159, 68], amp: -0.12, speed: 1.5 },
    },
    palette: {
      robe: '#8A9AC0', robeShade: '#4A5678', robeDeep: '#232A40', rim: '#DDE8FF',
      hair: '#3A4460', hairMid: '#56648A', hairHi: '#A8B8E0',
      trim: '#F2C84A', trimShade: '#9A7418', cuff: '#1A1E2C', sash: '#3A4460', sashShade: '#232A40',
      skin: '#EEF2FA', skinShade: '#8A96B4', bolt: '#CFE6FF', eyeGlow: '#FFF3B0',
    },
    parts: [
      // the crag it grips, and the tail fan
      { id: 'crag', layer: 'lap', mat: 'cuff', d: ['M', 118, 124, 'Q', 124, 112, 138, 110, 'L', 164, 110, 'Q', 178, 112, 184, 124, 'Z'] },
      { id: 'tail', layer: 'lap', mat: 'hair', d: ['M', 143, 100, 'L', 137, 121, 'L', 150, 117, 'L', 163, 121, 'L', 157, 100, 'Z'] },
      { id: 'legL', layer: 'lap', mat: 'trim', d: ['M', 143, 100, 'L', 147, 100, 'L', 146.5, 111, 'L', 142.5, 111, 'Z'] },
      { id: 'legR', layer: 'lap', mat: 'trim', d: ['M', 153, 100, 'L', 157, 100, 'L', 157.5, 111, 'L', 153.5, 111, 'Z'] },
      // wings: raised, primaries fingered at the tips
      { id: 'wingL', layer: 'wingL', mat: 'hair', fold: { k: 0.55, ang: 0.6, warp: 1.8, amp: 0.25 },
        d: ['M', 142, 64, 'Q', 124, 50, 90, 36, 'L', 96, 44, 'L', 88, 46, 'L', 98, 52, 'L', 90, 56, 'L', 102, 60, 'L', 96, 66,
            'L', 110, 68, 'L', 106, 75, 'Q', 124, 80, 141, 86, 'Z'] },
      { id: 'wingR', layer: 'wingR', mat: 'hair', fold: { k: 0.55, ang: -0.6, warp: 1.8, amp: 0.25 },
        d: ['M', 158, 64, 'Q', 176, 50, 210, 36, 'L', 204, 44, 'L', 212, 46, 'L', 202, 52, 'L', 210, 56, 'L', 198, 60, 'L', 204, 66,
            'L', 190, 68, 'L', 194, 75, 'Q', 176, 80, 159, 86, 'Z'] },
      { id: 'covertL', layer: 'wingL', mat: 'robe', d: ['M', 142, 64, 'Q', 126, 55, 106, 50, 'Q', 120, 62, 141, 74, 'Z'] },
      { id: 'covertR', layer: 'wingR', mat: 'robe', d: ['M', 158, 64, 'Q', 174, 55, 194, 50, 'Q', 180, 62, 159, 74, 'Z'] },
      // body
      { id: 'breast', layer: 'body', mat: 'robe', fold: { k: 0.6, ang: 1.4, warp: 1.2, amp: 0.22 },
        d: ['M', 140, 60, 'Q', 150, 52, 160, 60, 'Q', 166, 82, 158, 104, 'L', 142, 104, 'Q', 134, 82, 140, 60, 'Z'] },
      // head: white, a hooked gold beak
      { id: 'face', layer: 'head', mat: 'skin', d: ['E', 150, 49, 9.2, 10] },
      { id: 'beak', layer: 'head', mat: 'trim', d: ['M', 146.2, 51.5, 'L', 153.8, 51.5, 'Q', 153, 58, 150, 61, 'Q', 147, 58, 146.2, 51.5, 'Z'] },
    ],
    strokes: [
      { layer: 'body', color: 'robeShade', alpha: 0.5, w: 0.8, pts: [[144, 70], [147, 78], [150, 80], [153, 78], [156, 70]] },
      { layer: 'body', color: 'robeShade', alpha: 0.45, w: 0.8, pts: [[144, 84], [147, 91], [150, 93], [153, 91], [156, 84]] },
    ],
    dotFeatures: [
      { part: 'face', color: 'eyeGlow', w: 0.6, pts: [[144.75, 46.98], [146.5, 46.98]] },
      { part: 'face', color: 'eyeGlow', w: 0.6, pts: [[153.5, 46.98], [155.25, 46.98]] },
      { part: 'face', color: 'skinShade', w: 0.6, pts: [[143.875, 45.47], [147.375, 45.47]] },
      { part: 'face', color: 'skinShade', w: 0.6, pts: [[152.625, 45.47], [156.125, 45.47]] },
    ],
    bolts: { n: 3, area: [92, 28, 208, 96], color: 'bolt', every: 2.2 },
    motes: { count: 8, btCount: 16, x0: 96, x1: 204, speed: 0.16, color: 'bolt', y0: 120, rise: 90 },
  },

  // ── VOID HOUND: head low, hackles up, stepping out of a rift in space; violet eyes; a smoke tail ──
  void_hound: {
    extends: '_base', id: 'beast_void_hound', glow: '#A868F8',
    view: [84, 16, 216, 124],
    figureBox: [100, 20, 200, 124],
    body: { anchorY: 118, headY: 62, breathe: 0.035 },
    layerOrder: ['tail', 'lap', 'body', 'head'],
    motion: { tail: { pivot: [168, 96], amp: 0.12, speed: 1.1 } },
    palette: {
      robe: '#5A4A7A', robeShade: '#2E2448', robeDeep: '#140E22', rim: '#C8A8FF',
      hair: '#1C1428', hairMid: '#34264E', hairHi: '#8A6AC8',
      trim: '#9A7ACC', trimShade: '#4A3670', cuff: '#08050E', sash: '#5A4A7A', sashShade: '#2E2448',
      skin: '#3E3258', skinShade: '#1C1428', eyeGlow: '#E0A0FF', void: '#B070FF',
    },
    parts: [
      { id: 'tail', layer: 'tail', mat: 'hair', d: ['M', 162, 100, 'C', 180, 98, 192, 84, 192, 66, 'C', 192, 56, 186, 50, 180, 50, 'C', 184, 60, 182, 70, 176, 80, 'C', 172, 88, 166, 92, 160, 94, 'Z'] },
      { id: 'tailTip', layer: 'tail', mat: 'trim', d: ['M', 192, 66, 'C', 192, 56, 186, 50, 180, 50, 'C', 184, 56, 185, 62, 184, 70, 'Z'] },
      // legs: braced wide
      { id: 'legL', layer: 'lap', mat: 'hair', d: ['M', 132, 96, 'L', 141, 98, 'L', 140, 121, 'L', 130.5, 121, 'Z'] },
      { id: 'legR', layer: 'lap', mat: 'hair', d: ['M', 159, 98, 'L', 168, 96, 'L', 169.5, 121, 'L', 160, 121, 'Z'] },
      { id: 'pawL', layer: 'lap', mat: 'hair', d: ['E', 135.4, 121.4, 5.6, 2.2] },
      { id: 'pawR', layer: 'lap', mat: 'hair', d: ['E', 164.6, 121.4, 5.6, 2.2] },
      // hackles: soft tufts of void-smoke raised around the neck
      { id: 'mane', layer: 'body', mat: 'hair',
        d: ['M', 126, 82, 'Q', 120, 72, 127, 67, 'Q', 124, 58, 134, 59, 'Q', 137, 50, 146, 53, 'Q', 150, 47, 154, 53,
            'Q', 163, 50, 166, 59, 'Q', 176, 58, 173, 67, 'Q', 180, 72, 174, 82, 'Z'] },
      { id: 'chest', layer: 'body', mat: 'robe', fold: { k: 0.55, ang: 0.3, warp: 1.4, amp: 0.2 },
        d: ['M', 129, 80, 'Q', 150, 70, 171, 80, 'Q', 175, 98, 167, 112, 'L', 133, 112, 'Q', 125, 98, 129, 80, 'Z'] },
      // head: a wolf's wedge, ears up, long muzzle
      { id: 'earL', layer: 'head', mat: 'hair', d: ['M', 138, 58, 'L', 133, 36, 'L', 147, 51, 'Z'] },
      { id: 'earR', layer: 'head', mat: 'hair', d: ['M', 162, 58, 'L', 167, 36, 'L', 153, 51, 'Z'] },
      { id: 'earInL', layer: 'head', mat: 'cuff', d: ['M', 139, 54, 'L', 135.4, 41, 'L', 144, 51.5, 'Z'] },
      { id: 'earInR', layer: 'head', mat: 'cuff', d: ['M', 161, 54, 'L', 164.6, 41, 'L', 156, 51.5, 'Z'] },
      { id: 'face', layer: 'head', mat: 'skin',
        d: ['M', 135, 60, 'Q', 139, 50, 150, 50, 'Q', 161, 50, 165, 60, 'Q', 165, 67, 158, 71, 'L', 154.5, 83, 'Q', 150, 86, 145.5, 83,
            'L', 142, 71, 'Q', 135, 67, 135, 60, 'Z'] },
      { id: 'jaw', layer: 'head', mat: 'cuff', d: ['M', 146, 80, 'Q', 150, 82, 154, 80, 'L', 153, 85, 'Q', 150, 87, 147, 85, 'Z'] },
      { id: 'nose', layer: 'head', mat: 'cuff', d: ['E', 150, 82.6, 2.2, 1.4] },
    ],
    // void cracks glowing through the coat
    strokes: [
      { layer: 'body', color: 'void', alpha: 0.85, w: 0.7, glow: 3, pts: [[140, 84], [143, 90], [140.5, 95], [144, 102]] },
      { layer: 'body', color: 'void', alpha: 0.85, w: 0.7, glow: 3, pts: [[161, 86], [158, 92], [161, 98]] },
    ],
    dotFeatures: [
      { part: 'face', color: 'eyeGlow', w: 0.6, pts: [[141.25, 60.62], [145.625, 62.13]] },
      { part: 'face', color: 'eyeGlow', w: 0.6, pts: [[154.375, 62.13], [158.75, 60.62]] },
      { part: 'face', color: 'hairMid', w: 0.6, pts: [[150, 56.08], [150, 68.2]] },
      { part: 'face', color: 'void', w: 0.6, pts: [[150, 53.04]] },
    ],
    // the rift it steps out of: a turning ring with darkness at its heart
    formation: { cx: 150, cy: 76, rx: 54, ry: 46, speed: 0.16, alpha: 1, core: true },
    motes: { count: 12, btCount: 22, x0: 100, x1: 200, speed: 0.1, color: 'void', y0: 124, rise: 100 },
  },
}
