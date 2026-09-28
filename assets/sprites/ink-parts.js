// INK_PARTS — the swappable part library for the hybrid ink cultivator (roadmap A3-2, Phase 34): face / hair / robe /
// weapon / aura slots, each option = data merged onto the base figure (assets/sprites/ink-cultivator.js) by
// renderer/engine/ink-renderer.js `_effective()`. The hook for Phase 10 cosmetics + heirs inheriting a look (A5).
// Data only, no logic. See docs/systems/art-engine.md → "Slots" and .agents/rules/assets.md → "Ink art".
//
// An option may carry:
//   parts    — extra shapes (same format as INK_ART parts), placed `before` / `after` a part id, else appended
//   strokes  — brush strokes / live (swaying, dotted) strokes; always give `layer`
//   features — dot features `{ id, part, color, w, pts }`: the dots of that part within `w` of the polyline take the colour
//   frames   — expression frames by moment (`bt` breakthrough, `strain` failed breakthrough): features overriding by `id`
//   palette  — colour overrides for the whole figure
//   effects  — `halo` / `rings` / `motes` overrides (aura)
// RULE (user 2026-09-27): only objects (weapons, hairpins, crowns) may use the solid mats metal / steel / grip / jade.
// Everything else is ink dots. Dot grid for features: a column on x = 150, rows at y = row × 1.5155 (even rows have a
// dot on x = 150, odd rows at 150 ± 0.875); face rows: brows 20 (30.31), eyes 22 (33.34), nose 24 (36.37),
// cheeks 25 (37.89), mouth 26/27 (39.40 / 40.92). Keep `w` = 0.6 so a feature is exactly one dot tall.

const INK_PARTS = {
  // ── Face: features as dots; frames swap them for the breakthrough / failure moments ──
  face: {
    calm: { label: 'Calm',
      features: [
        { id: 'browL', part: 'face', color: 'brow', w: 0.6, pts: [[143, 30.31], [146.5, 30.31]] },
        { id: 'browR', part: 'face', color: 'brow', w: 0.6, pts: [[153.5, 30.31], [157, 30.31]] },
        { id: 'eyeL', part: 'face', color: 'eyeInk', w: 0.6, pts: [[144.75, 33.34], [146.5, 33.34]] },
        { id: 'eyeR', part: 'face', color: 'eyeInk', w: 0.6, pts: [[153.5, 33.34], [155.25, 33.34]] },
        { id: 'nose', part: 'face', color: 'skinShade', w: 0.6, pts: [[150, 36.37]] },
        { id: 'mouth', part: 'face', color: 'lip', w: 0.6, pts: [[149.125, 40.92], [150.875, 40.92]] },
      ],
      frames: {
        bt: [                                                      // the eyes open, lit from within
          { id: 'eyeL', color: 'eyeGlow' }, { id: 'eyeR', color: 'eyeGlow' },
        ],
        strain: [                                                  // brows pulled in and down, lips pressed thin
          { id: 'browL', pts: [[143.875, 31.83], [147.375, 31.83]] },
          { id: 'browR', pts: [[152.625, 31.83], [156.125, 31.83]] },
          { id: 'mouth', color: 'mouthInk', pts: [[147.375, 40.92], [152.625, 40.92]] },
        ],
      } },
    stern: { label: 'Stern',
      features: [
        { id: 'browL', part: 'face', color: 'brow', w: 0.6, pts: [[141.25, 30.31], [146.5, 30.31]] },
        { id: 'browR', part: 'face', color: 'brow', w: 0.6, pts: [[153.5, 30.31], [158.75, 30.31]] },
        { id: 'eyeL', part: 'face', color: 'eyeInk', w: 0.6, pts: [[143, 33.34], [146.5, 33.34]] },
        { id: 'eyeR', part: 'face', color: 'eyeInk', w: 0.6, pts: [[153.5, 33.34], [157, 33.34]] },
        { id: 'nose', part: 'face', color: 'skinShade', w: 0.6, pts: [[150, 36.37]] },
        { id: 'mouth', part: 'face', color: 'mouthInk', w: 0.6, pts: [[147.375, 40.92], [152.625, 40.92]] },
      ],
      frames: {
        bt: [{ id: 'eyeL', color: 'eyeGlow' }, { id: 'eyeR', color: 'eyeGlow' }],
        strain: [
          { id: 'browL', pts: [[143.875, 31.83], [147.375, 31.83]] },
          { id: 'browR', pts: [[152.625, 31.83], [156.125, 31.83]] },
        ],
      } },
    youthful: { label: 'Youthful',
      features: [
        { id: 'browL', part: 'face', color: 'hairMid', w: 0.6, pts: [[144.75, 30.31], [146.5, 30.31]] },
        { id: 'browR', part: 'face', color: 'hairMid', w: 0.6, pts: [[153.5, 30.31], [155.25, 30.31]] },
        { id: 'eyeL', part: 'face', color: 'eyeInk', w: 0.6, pts: [[144.75, 33.34], [146.5, 33.34]] },
        { id: 'eyeR', part: 'face', color: 'eyeInk', w: 0.6, pts: [[153.5, 33.34], [155.25, 33.34]] },
        { id: 'cheekL', part: 'face', color: 'blush', w: 0.6, pts: [[143.875, 37.89]] },
        { id: 'cheekR', part: 'face', color: 'blush', w: 0.6, pts: [[156.125, 37.89]] },
        { id: 'mouth', part: 'face', color: 'lip', w: 0.6, pts: [[150, 39.4]] },
      ],
      frames: {
        bt: [{ id: 'eyeL', color: 'eyeGlow' }, { id: 'eyeR', color: 'eyeGlow' }],
        strain: [
          { id: 'browL', pts: [[145.625, 31.83], [147.375, 31.83]] },
          { id: 'browR', pts: [[152.625, 31.83], [154.375, 31.83]] },
          { id: 'mouth', color: 'mouthInk', pts: [[149.125, 40.92], [150.875, 40.92]] },
        ],
      } },
  },

  // ── Hair: the head silhouette. Hairpins and crowns are objects (solid) ──
  hair: {
    bun: { label: 'Topknot bun',
      parts: [
        { id: 'hairBack', before: 'face', layer: 'head', mat: 'hair', d: ['E', 150, 30, 13, 14] },
        { id: 'cap', layer: 'head', mat: 'hair',
          d: ['M', 138.6, 32, 'Q', 138, 18, 150, 17.5, 'Q', 162, 18, 161.4, 32, 'Q', 158, 25, 153, 27,
              'Q', 150, 24.5, 147, 27, 'Q', 142, 25, 138.6, 32, 'Z'] },
        { id: 'bun', layer: 'head', mat: 'hair', d: ['E', 150, 12, 6.8, 5.6] },
        { id: 'pin', layer: 'head', mat: 'metal', d: ['M', 151, 11.8, 'L', 166.6, 6.6, 'L', 166.9, 7.8, 'L', 151.3, 13, 'Z'] },
        { id: 'pinBead', layer: 'head', mat: 'metal', d: ['E', 167.4, 7, 1.4, 1.4] },
      ],
      strokes: [
        { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[138.2, 27], [135.6, 38], [136.4, 47], [138.4, 56]] },
        { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[161.8, 27], [164.4, 38], [163.6, 47], [161.6, 56]] },
      ] },
    loose: { label: 'Long and loose',
      parts: [
        // the fall of hair behind the shoulders rides with the body
        { id: 'hairFall', before: 'torso', layer: 'body', mat: 'hair',
          d: ['M', 137, 26, 'Q', 131, 44, 130, 66, 'Q', 140, 70, 150, 69, 'Q', 160, 70, 170, 66, 'Q', 169, 44, 163, 26, 'Z'] },
        { id: 'hairBack', before: 'face', layer: 'head', mat: 'hair', d: ['E', 150, 29, 12.6, 13] },
        { id: 'cap', layer: 'head', mat: 'hair',
          d: ['M', 138.8, 33, 'Q', 138, 17.5, 150, 17, 'Q', 162, 17.5, 161.2, 33, 'Q', 157, 24, 150, 25.5,
              'Q', 143, 24, 138.8, 33, 'Z'] },
      ],
      strokes: [
        { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[138.4, 28], [135.4, 42], [135.2, 55], [136.6, 66]] },
        { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[161.6, 28], [164.6, 42], [164.8, 55], [163.4, 66]] },
      ] },
    crown: { label: 'Jade crown',
      parts: [
        { id: 'hairBack', before: 'face', layer: 'head', mat: 'hair', d: ['E', 150, 30, 13, 14] },
        { id: 'cap', layer: 'head', mat: 'hair',
          d: ['M', 138.6, 32, 'Q', 138, 18, 150, 17.5, 'Q', 162, 18, 161.4, 32, 'Q', 158, 25, 153, 27,
              'Q', 150, 24.5, 147, 27, 'Q', 142, 25, 138.6, 32, 'Z'] },
        { id: 'bun', layer: 'head', mat: 'hair', d: ['E', 150, 13, 5.4, 4.8] },
        // a small guan crown over the bun, pinned through (objects: solid)
        { id: 'crown', layer: 'head', mat: 'jade',
          d: ['M', 144.6, 13.5, 'L', 145.4, 7, 'L', 148, 9.4, 'L', 150, 5, 'L', 152, 9.4, 'L', 154.6, 7, 'L', 155.4, 13.5, 'Z'] },
        { id: 'crownPin', layer: 'head', mat: 'metal', d: ['M', 139.5, 10.6, 'L', 160.5, 10.6, 'L', 160.5, 11.6, 'L', 139.5, 11.6, 'Z'] },
      ],
      strokes: [
        { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[138.2, 27], [135.6, 38], [136.4, 47], [138.4, 56]] },
        { layer: 'head', live: true, color: 'hairMid', alpha: 1, w: 2.2, pts: [[161.8, 27], [164.4, 38], [163.6, 47], [161.6, 56]] },
      ] },
  },

  // ── Robe: palette only (the cut is the base figure) ──
  robe: {
    moon: { label: 'Moon-white', palette: {} },
    // the Mortal's plain hemp (A4-1): undyed cloth, a cord sash, no gold on the collar
    hemp: { label: 'Plain hemp', palette: {
      robe: '#C4B69A', robeShade: '#6E6450', robeDeep: '#39332A', rim: '#EFE6D0', cuff: '#463E31',
      sash: '#7A6444', sashShade: '#3C3022', trim: '#A6977A', trimShade: '#5A513F' } },
    azure: { label: 'Azure', palette: {
      robe: '#BCD2E8', robeShade: '#4E6C90', robeDeep: '#26405E', rim: '#EAF6FF', cuff: '#2C4868',
      sash: '#D8B04A', sashShade: '#7A5E1E' } },
    crimson: { label: 'Crimson', palette: {
      robe: '#DA8E86', robeShade: '#8C3C3C', robeDeep: '#4A1C24', rim: '#FFE4DA', cuff: '#5A2228',
      sash: '#3A3048', sashShade: '#1C1624', trim: '#E4C070' } },
    ink: { label: 'Ink-black', palette: {
      robe: '#6E6A7C', robeShade: '#34303F', robeDeep: '#1A1822', rim: '#C4BED6', cuff: '#1E1C26',
      sash: '#9A3030', sashShade: '#4E1818' } },
  },

  // ── Weapon: objects across the knees (solid) ──
  weapon: {
    sword: { label: 'Sword',
      parts: [
        { id: 'blade', after: 'lap', layer: 'lap', mat: 'steel',
          d: ['M', 85.5, 116.4, 'L', 92, 114.8, 'L', 204, 110.85, 'L', 204, 113.4, 'L', 92, 117.35, 'Z'] },
        { id: 'guard', after: 'blade', layer: 'lap', mat: 'metal',
          d: ['M', 203.6, 108.6, 'Q', 205.6, 107.9, 207.6, 108.4, 'L', 207.6, 115.6, 'Q', 205.6, 116.1, 203.6, 115.6, 'Z'] },
        { id: 'grip', after: 'guard', layer: 'lap', mat: 'grip',
          d: ['M', 207.6, 110.35, 'L', 221, 109.9, 'L', 221, 112.85, 'L', 207.6, 113.35, 'Z'] },
        { id: 'pommel', after: 'grip', layer: 'lap', mat: 'metal', d: ['E', 222.5, 111.35, 1.5, 1.75] },
      ],
      strokes: [
        { layer: 'lap', color: 'rim', alpha: 0.6, w: 0.45, pts: [[93, 115.35], [150, 113.35], [202, 111.55]] },
        { layer: 'lap', color: 'steelShade', alpha: 0.55, w: 0.4, pts: [[97, 116.35], [150, 114.5], [199, 112.8]] },
        { layer: 'lap', color: 'gripHi', alpha: 0.7, w: 0.45, pts: [[209, 110.25], [210.3, 112.85]] },
        { layer: 'lap', color: 'gripHi', alpha: 0.7, w: 0.45, pts: [[211.6, 110.16], [212.9, 112.76]] },
        { layer: 'lap', color: 'gripHi', alpha: 0.7, w: 0.45, pts: [[214.2, 110.07], [215.5, 112.67]] },
        { layer: 'lap', color: 'gripHi', alpha: 0.7, w: 0.45, pts: [[216.8, 109.98], [218.1, 112.58]] },
        { layer: 'lap', color: 'gripHi', alpha: 0.7, w: 0.45, pts: [[219.4, 109.89], [220.7, 112.49]] },
        { layer: 'lap', color: 'tassel', alpha: 0.95, w: 0.55, pts: [[224, 111.6], [226, 113.6], [226.9, 116.4]] },
        { layer: 'lap', color: 'gold', alpha: 0.9, w: 0.9, pts: [[226.6, 116.3], [227, 116.8], [227.4, 117.3]] },
        { layer: 'lap', color: 'tassel', alpha: 0.9, w: 0.5, pts: [[226.7, 117], [226.2, 119.8], [225.9, 122.6]] },
        { layer: 'lap', color: 'tassel', alpha: 0.95, w: 0.5, pts: [[227, 117.1], [227.1, 120], [227.2, 123]] },
        { layer: 'lap', color: 'tassel', alpha: 0.9, w: 0.5, pts: [[227.3, 117], [227.9, 119.8], [228.5, 122.5]] },
      ] },
    flute: { label: 'Jade flute',
      parts: [
        { id: 'flute', after: 'lap', layer: 'lap', mat: 'jade',
          d: ['M', 104, 115.9, 'L', 196, 112.7, 'Q', 197.6, 113.8, 196, 114.9, 'L', 104, 118.1, 'Q', 102.4, 117, 104, 115.9, 'Z'] },
        { id: 'fluteBand', after: 'flute', layer: 'lap', mat: 'metal', d: ['M', 187, 112.9, 'L', 189, 112.85, 'L', 189, 115.1, 'L', 187, 115.15, 'Z'] },
      ],
      strokes: [
        { layer: 'lap', color: 'rim', alpha: 0.5, w: 0.4, pts: [[108, 116.3], [150, 114.85], [192, 113.4]] },
        { layer: 'lap', color: 'jadeShade', alpha: 0.95, w: 0.8, pts: [[118, 116.4], [118.6, 116.38]] },
        { layer: 'lap', color: 'jadeShade', alpha: 0.95, w: 0.8, pts: [[150, 115.3], [150.6, 115.28]] },
        { layer: 'lap', color: 'jadeShade', alpha: 0.95, w: 0.8, pts: [[156, 115.1], [156.6, 115.08]] },
        { layer: 'lap', color: 'jadeShade', alpha: 0.95, w: 0.8, pts: [[162, 114.9], [162.6, 114.88]] },
        { layer: 'lap', color: 'jadeShade', alpha: 0.95, w: 0.8, pts: [[168, 114.7], [168.6, 114.68]] },
        { layer: 'lap', color: 'tassel', alpha: 0.95, w: 0.5, pts: [[197, 113.8], [198.4, 116.4], [198.6, 119]] },
        { layer: 'lap', color: 'tassel', alpha: 0.9, w: 0.5, pts: [[198.4, 118.6], [198, 121.4], [197.8, 124]] },
        { layer: 'lap', color: 'tassel', alpha: 0.9, w: 0.5, pts: [[198.8, 118.6], [199.4, 121.4], [199.8, 123.8]] },
      ] },
    none: { label: 'Empty hands' },
  },

  // ── Aura: the effect layer's character (colour always follows the stage colour / gold on breakthrough) ──
  aura: {
    orbit: { label: 'Orbiting rings', effects: {} },
    still: { label: 'Still water', effects: {
      rings: [{ cx: 150, cy: 80, rx: 88, ry: 8, tilt: 0, speed: 0.06, motes: 2, alpha: 0.55 }],
      motes: { count: 6, btCount: 18, x0: 80, x1: 220, speed: 0.06 } } },
    tempest: { label: 'Tempest', effects: {
      rings: [
        { cx: 150, cy: 76, rx: 80, ry: 15, tilt: -0.16, speed: 0.55, motes: 6, alpha: 0.95 },
        { cx: 150, cy: 70, rx: 70, ry: 22, tilt: 0.3, speed: -0.45, motes: 5, alpha: 0.8 },
        { cx: 150, cy: 82, rx: 96, ry: 9, tilt: 0.06, speed: 0.35, motes: 4, alpha: 0.7 },
        { cx: 150, cy: 64, rx: 58, ry: 30, tilt: -0.55, speed: 0.6, motes: 3, alpha: 0.6 },
      ],
      motes: { count: 22, btCount: 40, x0: 60, x1: 240, speed: 0.2 } } },
  },
}
