// Art bake-off renderers (roadmap A2). Prototype only: not loaded by the game. Three ways to draw the SAME seated
// cultivator in a 300×150 logical scene: drawA (grid ASCII), drawB (layered glyph compositor), drawC (shape-to-glyph
// + ink-wash). Everything is a pure function of time t, so screenshots are repeatable: window.bake.freeze(t, mode).
// No emoji anywhere (CLAUDE.md rule): only text glyphs, box/block/braille characters and CJK.

const DPR = +(new URLSearchParams(location.search).get('dpr') || 3)
const LW = 300, LH = 150
const FONT = '"Courier New", "Segoe UI Symbol", "Noto Sans Symbols 2", monospace'
const PAL = {
  bg: '#08040E', qi: '#87CEEB', gold: '#EDD050', robe: '#DCD4C4', robeShade: '#6E6C8C', robeDeep: '#3E3C5C',
  trim: '#EDD050', sash: '#B8433A', skin: '#E8C9A0', skinShade: '#A88460', hair: '#262A40', hairHi: '#5C6690',
  steel: '#CFD8E8', hilt: '#EDD050', tassel: '#C83030', eye: '#3A2A30', lip: '#B8645A', lotus: '#E48AA8',
  mountFar: '#221C38', mountNear: '#2E2848', mist: '#8A86A8',
}
const state = { t: 0, mode: 'idle', paused: false }

// ── helpers ─────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})` }
function mix(h1, h2, f) {
  const a = rgb(h1), b = rgb(h2)
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`
}
// Deterministic pseudo-random in [0,1) from an integer seed.
function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

function glyph(ctx, ch, x, y, size, color, o = {}) {
  ctx.save()
  ctx.translate(x, y)
  if (o.rot) ctx.rotate(o.rot)
  ctx.globalAlpha = o.alpha ?? 1
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (o.glow) { ctx.shadowColor = o.glowColor || color; ctx.shadowBlur = o.glow }
  ctx.fillStyle = color
  ctx.fillText(ch, 0, 0)
  ctx.restore()
}

// Shared base for all three: dark field + faint Qi glow behind the figure (what the current engine already has).
function drawBase(ctx, t, mode) {
  ctx.fillStyle = PAL.bg
  ctx.fillRect(0, 0, LW, LH)
  const bt = mode === 'breakthrough'
  const g = ctx.createRadialGradient(150, 70, 4, 150, 70, 150)
  g.addColorStop(0, rgba(bt ? PAL.gold : PAL.qi, bt ? 0.20 : 0.09 + 0.03 * Math.sin(t * 1.4)))
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, LW, LH)
}

// Rising Qi motes (the current engine's particle look), deterministic in t.
function drawMotes(ctx, t, mode, n = 26) {
  const bt = mode === 'breakthrough'
  const chars = ['·', '∘', '·', '气', '˙']
  for (let i = 0; i < n; i++) {
    const life = (t * (bt ? 0.5 : 0.18) + rnd(i)) % 1
    const x = 150 + (rnd(i + 50) - 0.5) * 170 + Math.sin(t * 0.7 + i) * 6
    const y = 140 - life * 130
    const a = Math.sin(life * Math.PI) * (bt ? 0.9 : 0.55)
    glyph(ctx, chars[i % chars.length], x, y, i % 5 === 3 ? 8 : 7, bt && i % 2 ? PAL.gold : PAL.qi, { alpha: a, glow: 6 })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// (a) GRID ASCII, pushed: one fixed-advance grid (no per-row centering jitter), bigger figure, 3 frames.
// ═══════════════════════════════════════════════════════════════════════════
const A_FRAMES = [
  [
    '            ●            ',
    '          ╭─┴─╮          ',
    '          │- -│          ',
    '          ╰╮‿╭╯          ',
    '      ╱▔▔▔▔╲∨╱▔▔▔▔╲      ',
    '     ╱  ╱ ╲ ║ ╱ ╲  ╲     ',
    '    ╱  ╱   ╲◇╱   ╲  ╲    ',
    '   (__╱ ═══╡◈╞═══ ╲__)   ',
    '  ◂━━━━━━━━━━━━━━━━┫▍━○  ',
    '  ╰~~~~~~~~───~~~~~~~~╯  ',
  ],
  [
    '            ●            ',
    '         ~╭─┴─╮          ',
    '          │- -│          ',
    '          ╰╮‿╭╯          ',
    '     ╱▔▔▔▔▔╲∨╱▔▔▔▔▔╲     ',
    '    ╱  ╱  ╲ ║ ╱  ╲  ╲    ',
    '    ╱  ╱   ╲◇╱   ╲  ╲    ',
    '   (__╱ ═══╡◈╞═══ ╲__)   ',
    '  ◂━━━━━━━━━━━━━━━━┫▍━○  ',
    '  ╰~~~~~~~~───~~~~~~~~╯  ',
  ],
  [
    '            ●            ',
    '          ╭─┴─╮~         ',
    '          │- -│          ',
    '          ╰╮‿╭╯          ',
    '      ╱▔▔▔▔╲∨╱▔▔▔▔╲      ',
    '     ╱  ╱ ╲ ║ ╱ ╲  ╲     ',
    '    ╱  ╱   ╲◇╱   ╲  ╲    ',
    '   (__╱ ═══╡◈╞═══ ╲__)   ',
    '  ◂━━━━━━━━━━━━━━━━┫▍━○  ',
    '  ╰~~~~~~~~───~~~~~~~~╯  ',
  ],
]
const A_CHAR = { '◇': PAL.qi, '◈': PAL.gold, '∨': PAL.trim, '║': PAL.trim, '═': PAL.sash, '╡': PAL.sash, '╞': PAL.sash,
  '┫': PAL.hilt, '▍': PAL.hilt, '○': PAL.tassel, '◂': PAL.steel, '━': PAL.steel, '-': PAL.eye, '‿': PAL.lip, '~': PAL.hairHi }
const A_ROW = [PAL.hairHi, PAL.hairHi, PAL.skin, PAL.skin, PAL.robe, PAL.robe, PAL.robe, PAL.robeShade, PAL.steel, PAL.robeShade]

function drawA(ctx, t, mode) {
  const bt = mode === 'breakthrough'
  drawBase(ctx, t, mode)
  const fs = 14, cw = 8.4, lh = 13.6
  const f = A_FRAMES[Math.floor(t * 1.2) % A_FRAMES.length]
  const ox = (LW - f[0].length * cw) / 2, oy = 6
  // aura: Qi wave glyphs in the empty cells either side (the grid's only way to show power)
  const aura = bt ? ['ϟ', '*', 'ϟ', '·'] : ['≋', '∿', '≋', '·']
  for (let r = 3; r <= 7; r++) for (const side of [-1, 1]) {
    const c = side < 0 ? 1 + (r % 2) : f[0].length - 2 - (r % 2)
    const a = 0.35 + 0.35 * Math.sin(t * 2 + r)
    glyph(ctx, aura[(r + Math.floor(t * 2)) % aura.length], ox + c * cw + cw / 2, oy + r * lh + lh / 2, fs, bt ? PAL.gold : PAL.qi, { alpha: a, glow: 6 })
  }
  f.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === ' ') return
    let col = A_CHAR[ch] || A_ROW[r]
    if (bt && (col === PAL.robe || col === PAL.robeShade)) col = mix(col, PAL.gold, 0.35)
    const special = col === PAL.qi || col === PAL.gold || col === PAL.trim || col === PAL.hilt
    glyph(ctx, ch, ox + c * cw + cw / 2, oy + r * lh + lh / 2, fs, col, { glow: special ? 8 : (bt ? 4 : 0) })
  }))
  drawMotes(ctx, t, mode)
}

// ═══════════════════════════════════════════════════════════════════════════
// (b) LAYERED GLYPH COMPOSITOR: small ASCII parts at their own size / position / rotation / glow.
// ═══════════════════════════════════════════════════════════════════════════
function part(ctx, lines, cx, cy, size, color, o = {}) {
  const adv = size * 0.6, lh = size * (o.lh || 1.0)
  const w = Math.max(...lines.map(l => [...l].length)) * adv, h = lines.length * lh
  ctx.save()
  ctx.translate(cx, cy)
  if (o.rot) ctx.rotate(o.rot)
  if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1)
  ctx.globalAlpha = o.alpha ?? 1
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, r) => [...line].forEach((ch, c) => {
    if (ch === ' ') return
    const col = (o.map && o.map[ch]) || color
    if (o.glow || (o.glowChars && o.glowChars.includes(ch))) { ctx.shadowColor = col; ctx.shadowBlur = o.glow || 8 } else ctx.shadowBlur = 0
    ctx.fillStyle = col
    ctx.fillText(ch, -w / 2 + c * adv + adv / 2, -h / 2 + r * lh + lh / 2)
  }))
  ctx.restore()
}

// Swappable face slot (customization hook): same frame, different expression.
const B_FACES = {
  serene: [' ,---. ', '/ - - \\', '\\  ‿  /', " `---' "],
  fierce: [' ,---. ', '/ ˋ ˊ \\', '\\  ⁀  /', " `---' "],
}
const B_PARTS = {
  cap:     ['.-~~~-.'],
  torso:   ['   ______   ', '  / ⢸  ⡇ \\  ', ' /  ⢸  ⡇  \\ ', '|   ⢸  ⡇   |', '|   ⢸  ⡇   |'],
  collar:  ['╲   ╱', ' ╲ ╱ ', '  V  '],
  sash:    ['═══╡◈╞═══'],
  sleeveL: ['   /|', '  / |', ' /  |', '(___/'],
  sleeveR: ['|\\   ', '| \\  ', '|  \\ ', '\\___)'],
  hands:   ['(◇)'],
  lap:     ['   _.-~~~~~~~~~~~~~~-._   ', " .'  ⣀⣀  ~~~~~~  ⣀⣀    '. ", '(   (⣿⣿)        (⣿⣿)     )', " '-.____..------..____.-' "],
  sword:   ['◂══════════════════════╡▐═○'],
  lotus:   ['‿⌒‿⌒‿⌒‿⌒‿⌒‿⌒‿'],
}

function drawB(ctx, t, mode, face = 'serene') {
  const bt = mode === 'breakthrough'
  drawBase(ctx, t, mode)
  const breath = Math.sin(t * 1.3), sway = Math.sin(t * 0.9), bob = breath * 0.8
  const glowK = bt ? 2 : 1
  // aura layer: faint 氣 behind, a rotating ring of motes, a halo behind the head
  glyph(ctx, '氣', 150, 66, 118, bt ? PAL.gold : PAL.qi, { alpha: bt ? 0.16 : 0.06, glow: 20 })
  glyph(ctx, '◯', 150, 30 + bob, 44 + (bt ? 8 * Math.abs(Math.sin(t * 3)) : 0), bt ? PAL.gold : PAL.qi, { alpha: bt ? 0.5 : 0.22, glow: 14 })
  const ringR = bt ? 66 + 6 * Math.sin(t * 4) : 62
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2 + t * 0.25
    glyph(ctx, i % 4 ? '·' : '∘', 150 + Math.cos(a) * ringR * 1.25, 72 + Math.sin(a) * ringR * 0.62, 7,
      bt ? PAL.gold : PAL.qi, { alpha: 0.25 + 0.35 * Math.sin(a * 3 + t * 2) ** 2, glow: 6 })
  }
  // figure layers, back to front, each animating on its own
  part(ctx, B_PARTS.lotus, 150, 124 + bob * 0.3, 9, PAL.lotus, { alpha: bt ? 0.95 : 0.6, glow: 6 })
  part(ctx, B_PARTS.lap, 150, 101 + bob * 0.4, 8, PAL.robe, { map: { '⣀': PAL.robeShade, '⣿': PAL.robeShade, '~': PAL.robeShade, '.': PAL.robeShade, '-': PAL.robeShade } })
  part(ctx, B_PARTS.torso, 150, 63 + bob, 8, PAL.robe, { sy: 1 + breath * 0.025, map: { '⢸': PAL.robeShade, '⡇': PAL.robeShade, '/': PAL.robeShade, '\\': PAL.robeShade, '|': PAL.robeShade } })
  part(ctx, B_PARTS.sleeveL, 124 - sway * 0.8, 71 + bob, 9, PAL.robe, { rot: 0.05 + sway * 0.04, map: { '(': PAL.robeShade, '_': PAL.robeShade } })
  part(ctx, B_PARTS.sleeveR, 176 - sway * 0.8, 71 + bob, 9, PAL.robe, { rot: -0.05 + sway * 0.04, map: { ')': PAL.robeShade, '_': PAL.robeShade } })
  part(ctx, B_PARTS.collar, 150, 50 + bob, 6, PAL.trim, { glow: 6 * glowK })
  part(ctx, B_PARTS.sash, 150, 81 + bob, 8, PAL.sash, { map: { '◈': PAL.gold }, glowChars: '◈' })
  part(ctx, B_PARTS.hands, 150, 88 + bob, 8, PAL.skin, { map: { '◇': bt ? PAL.gold : PAL.qi }, glowChars: '◇' })
  part(ctx, B_PARTS.sword, 150, 113 + bob * 0.4, 7, PAL.steel, { rot: -0.035, map: { '╡': PAL.hilt, '▐': PAL.hilt, '○': PAL.tassel }, glow: bt ? 8 : 3 })
  // head group
  part(ctx, B_FACES[face], 150, 32 + bob, 8, PAL.skin, { map: { '-': PAL.eye, 'ˋ': PAL.eye, 'ˊ': PAL.eye, '‿': PAL.lip, '⁀': PAL.lip, ',': PAL.skinShade, '`': PAL.skinShade, "'": PAL.skinShade } })
  part(ctx, B_PARTS.cap, 150, 20 + bob, 8, PAL.hairHi)
  glyph(ctx, '●', 150, 11 + bob, 13, PAL.hairHi)
  glyph(ctx, '◠', 150, 7 + bob, 9, PAL.hair)
  glyph(ctx, '━╾', 161, 9 + bob, 7, PAL.gold, { rot: -0.3, glow: 5 })
  for (const s of [-1, 1]) glyph(ctx, '∫', 150 + s * 15 + sway * 1.2, 38 + bob, 12, PAL.hairHi, { rot: s * 0.1 + sway * 0.05 })
  if (bt) for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + t * 0.8
    glyph(ctx, 'ϟ', 150 + Math.cos(a) * 58, 64 + Math.sin(a) * 44, 13 + 4 * rnd(Math.floor(t * 8) + i), PAL.gold,
      { rot: a, alpha: 0.4 + 0.6 * rnd(Math.floor(t * 10) + i * 3), glow: 12 })
  }
  drawMotes(ctx, t, mode, 18)
}

// ═══════════════════════════════════════════════════════════════════════════
// (c) SHAPE-TO-GLYPH + INK-WASH: vector shapes rasterized into a glyph grid (braille edges, fabric folds, density
// shading) over braille ink mountains, mist and Qi streams.
// ═══════════════════════════════════════════════════════════════════════════
const hitCtx = document.createElement('canvas').getContext('2d')
const C_FS = 6, C_CW = 3.6, C_LH = 5.2
const C_COLS = Math.ceil(LW / C_CW), C_ROWS = Math.ceil(LH / C_LH)
const DOTS = [[0.25, 0.125, 0], [0.25, 0.375, 1], [0.25, 0.625, 2], [0.75, 0.125, 3], [0.75, 0.375, 4], [0.75, 0.625, 5], [0.25, 0.875, 6], [0.75, 0.875, 7]]

function ellipse(cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, a0, a1); p.closePath(); return p }

function cShapes(t, mode) {
  const breath = Math.sin(t * 1.3), sway = Math.sin(t * 0.9), b = breath * 0.8
  const S = []
  const add = (id, path, color, shade, mat, box) => S.push({ id, path, color, shade, mat, box })
  const bt = mode === 'breakthrough'
  // halo ring behind the head
  const hr = bt ? 27 + 3 * Math.sin(t * 5) : 25
  const halo = new Path2D(); halo.arc(150, 32 + b, hr, 0, Math.PI * 2); halo.arc(150, 32 + b, hr - 1.8, 0, Math.PI * 2, true)
  add('halo', halo, bt ? PAL.gold : PAL.qi, bt ? PAL.gold : PAL.qi, 'glow', [120, 2, 180, 62])
  add('lap', ellipse(150, 106 + b * 0.4, 63, 15), PAL.robe, PAL.robeDeep, 'robe', [86, 90, 214, 122])
  const sl = new Path2D(); sl.moveTo(129, 51 + b); sl.quadraticCurveTo(106 + sway, 70 + b, 107 + sway * 1.5, 96 + b); sl.lineTo(137, 95 + b); sl.quadraticCurveTo(136, 72 + b, 138, 60 + b); sl.closePath()
  const sr = new Path2D(); sr.moveTo(171, 51 + b); sr.quadraticCurveTo(194 + sway, 70 + b, 193 + sway * 1.5, 96 + b); sr.lineTo(163, 95 + b); sr.quadraticCurveTo(164, 72 + b, 162, 60 + b); sr.closePath()
  const tw = 1 + breath * 0.02
  const to = new Path2D(); to.moveTo(150 - 20 * tw, 50 + b); to.lineTo(150 + 20 * tw, 50 + b); to.quadraticCurveTo(150 + 27 * tw, 72 + b, 150 + 26 * tw, 95 + b); to.lineTo(150 - 26 * tw, 95 + b); to.quadraticCurveTo(150 - 27 * tw, 72 + b, 150 - 20 * tw, 50 + b); to.closePath()
  add('torso', to, PAL.robe, PAL.robeShade, 'robe', [118, 48, 182, 96])
  add('sleeveL', sl, PAL.robe, PAL.robeShade, 'robe', [100, 48, 140, 98])
  add('sleeveR', sr, PAL.robe, PAL.robeShade, 'robe', [160, 48, 200, 98])
  const sash = new Path2D(); sash.rect(126, 85 + b, 48, 4.5)
  add('sash', sash, PAL.sash, '#7A2A26', 'solid', [125, 84, 175, 91])
  add('hands', ellipse(150, 89 + b, 7.5, 5), PAL.skin, PAL.skinShade, 'skin', [141, 83, 159, 95])
  const col = new Path2D(); col.moveTo(141, 50 + b); col.lineTo(150, 67 + b); col.lineTo(159, 50 + b); col.lineTo(155.5, 50 + b); col.lineTo(150, 61 + b); col.lineTo(144.5, 50 + b); col.closePath()
  add('collar', col, PAL.trim, '#9A8030', 'glow', [140, 49, 160, 68])
  const neck = new Path2D(); neck.rect(146, 42 + b, 8, 9)
  add('neck', neck, PAL.skin, PAL.skinShade, 'skin', [145, 41, 155, 52])
  add('hairBack', ellipse(150, 30 + b, 12.8, 13.5), PAL.hair, '#12141F', 'hair', [136, 15, 164, 45])
  add('head', ellipse(150, 33 + b, 10, 12), PAL.skin, PAL.skinShade, 'skin', [139, 20, 161, 46])
  add('cap', ellipse(150, 27 + b, 11.2, 8.5, Math.PI, Math.PI * 2), PAL.hair, '#12141F', 'hair', [138, 17, 162, 28])
  add('bun', ellipse(150, 13 + b, 6.5, 5.5), PAL.hair, '#12141F', 'hair', [142, 6, 158, 20])
  for (const s of [-1, 1]) {
    const lk = new Path2D(); const x0 = 150 + s * 11.5
    lk.moveTo(x0, 28 + b); lk.quadraticCurveTo(x0 + s * 3 + sway * 1.5, 42 + b, x0 + s * 1 + sway * 2.5, 54 + b); lk.lineTo(x0 + s * 2.6 + sway * 2.5, 54 + b); lk.quadraticCurveTo(x0 + s * 4.6 + sway * 1.5, 42 + b, x0 + s * 1.6, 28 + b); lk.closePath()
    add('lock' + s, lk, PAL.hair, '#12141F', 'hair', [x0 - 6, 27, x0 + 7, 56])
  }
  const pin = new Path2D(); pin.moveTo(152, 12 + b); pin.lineTo(167, 7 + b); pin.lineTo(167.4, 8.6 + b); pin.lineTo(152.4, 13.6 + b); pin.closePath()
  add('pin', pin, PAL.gold, '#9A8030', 'glow', [151, 6, 168, 15])
  const sw = new Path2D(); sw.moveTo(80, 117 + b * 0.4); sw.lineTo(212, 111.5 + b * 0.4); sw.lineTo(212, 114.3 + b * 0.4); sw.lineTo(80, 118.6 + b * 0.4); sw.closePath()
  add('blade', sw, PAL.steel, '#7C88A0', 'steel', [78, 109, 214, 121])
  const hilt = new Path2D(); hilt.rect(212, 110 + b * 0.4, 14, 4.8); hilt.rect(211, 107.5 + b * 0.4, 2.4, 10)
  add('hilt', hilt, PAL.hilt, '#9A8030', 'glow', [210, 106, 227, 119])
  add('tassel', ellipse(229.5, 115 + b * 0.4, 2.2, 3.2), PAL.tassel, '#801818', 'solid', [226, 111, 233, 119])
  return S
}

// Cell glyph for an interior (all 8 dots inside one shape).
function cInterior(sh, x, y, light, t) {
  if (sh.mat === 'robe') {
    const fold = Math.sin(x * 0.42 + Math.sin(y * 0.09 + 1.3) * 2.2)
    if (Math.abs(fold) < 0.22) return ['⡇', mix(sh.shade, sh.color, 0.35)]
    return ['⣿', mix(sh.shade, sh.color, light)]
  }
  if (sh.mat === 'hair') return [rnd(Math.floor(x * 7 + y * 13)) > 0.7 ? '⢕' : '⣿', mix(PAL.hair, PAL.hairHi, 0.35 + light * 0.65)]
  return ['⣿', mix(sh.shade, sh.color, light)]
}

function drawC(ctx, t, mode) {
  const bt = mode === 'breakthrough'
  // ink-wash sky
  const sky = ctx.createLinearGradient(0, 0, 0, LH)
  sky.addColorStop(0, '#0C0718'); sky.addColorStop(1, '#130B20')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, LW, LH)
  const g = ctx.createRadialGradient(150, 40, 2, 150, 40, 120)
  g.addColorStop(0, rgba(bt ? PAL.gold : PAL.qi, bt ? 0.22 : 0.10)); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH)

  ctx.font = `${C_FS}px ${FONT}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const ridgeFar = x => 78 + 10 * Math.sin(x * 0.021 + 1) + 6 * Math.sin(x * 0.057 + 2) + 3 * Math.sin(x * 0.13)
  const ridgeNear = x => 96 + 8 * Math.sin(x * 0.03 + 4) + 4 * Math.sin(x * 0.09 + 1)
  const shapes = cShapes(t, mode)
  for (let r = 0; r < C_ROWS; r++) for (let c = 0; c < C_COLS; c++) {
    const x0 = c * C_CW, y0 = r * C_LH
    const hits = new Array(8)
    const count = {}
    for (const [dx, dy, bit] of DOTS) {
      const px = x0 + dx * C_CW, py = y0 + dy * C_LH
      let id = null
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i], bx = s.box
        if (px < bx[0] || px > bx[2] || py < bx[1] - 2 || py > bx[3] + 2) continue
        if (hitCtx.isPointInPath(s.path, px, py)) { id = i; break }
      }
      hits[bit] = id
      if (id != null) count[id] = (count[id] || 0) + 1
    }
    const cx = x0 + C_CW / 2, cy = y0 + C_LH / 2
    const ids = Object.keys(count)
    if (!ids.length) {
      // background: braille ink mountains (exact ridge per dot), then drifting mist
      let bits = 0, near = false
      for (const [dx, dy, bit] of DOTS) {
        const px = x0 + dx * C_CW, py = y0 + dy * C_LH
        const dn = py - ridgeNear(px), df = py - ridgeFar(px)
        // a band under each ridge whose dots thin out with depth (dithered by a hash), like ink soaking into paper
        if (dn > 0 && rnd(Math.floor(px * 13 + py * 7)) > dn / 16) { bits |= 1 << bit; near = true }
        else if (df > 0 && dn <= 0 && rnd(Math.floor(px * 11 + py * 5)) > df / 12) bits |= 1 << bit
      }
      if (bits) {
        ctx.shadowBlur = 0
        ctx.fillStyle = near ? PAL.mountNear : PAL.mountFar
        ctx.fillText(String.fromCharCode(0x2800 + bits), cx, cy)
      }
      const mist = Math.sin(cx * 0.05 - t * 0.35 + Math.sin(cy * 0.2)) * Math.exp(-((cy - 92) ** 2) / 90)
      if (mist > 0.45) {
        ctx.globalAlpha = (mist - 0.45) * 0.9
        ctx.fillStyle = PAL.mist
        ctx.fillText(mist > 0.75 ? '⠶' : '⠒', cx, cy)
        ctx.globalAlpha = 1
      }
      continue
    }
    let dom = ids[0]
    for (const id of ids) if (count[id] > count[dom]) dom = id
    const sh = shapes[dom]
    const bx = sh.box
    const light = clamp(0.95 - 0.55 * ((cy - bx[1]) / (bx[3] - bx[1])) + 0.25 * ((150 - cx) / 60), 0.15, 1)
    let ch, color
    if (count[dom] === 8) [ch, color] = cInterior(sh, cx, cy, light, t)
    else {
      let bits = 0
      for (let bit = 0; bit < 8; bit++) if (hits[bit] == dom) bits |= 1 << bit
      ch = String.fromCharCode(0x2800 + bits)
      color = mix(sh.shade, sh.color, Math.min(1, light + 0.1))
    }
    if (bt && sh.mat === 'robe') color = mix(color.startsWith('#') ? color : '#DCD4C4', PAL.gold, 0.25)
    const glow = sh.mat === 'glow' || (bt && sh.mat === 'robe')
    ctx.shadowColor = sh.mat === 'glow' ? sh.color : PAL.gold
    ctx.shadowBlur = glow ? (sh.mat === 'glow' ? 7 : 3) : 0
    ctx.fillStyle = color
    ctx.fillText(ch, cx, cy)
  }
  ctx.shadowBlur = 0
  // fine face detail on top of the raster: closed eyes, mouth
  const b = Math.sin(t * 1.3) * 0.8
  glyph(ctx, '⠤', 146, 34 + b, 6, PAL.eye); glyph(ctx, '⠤', 154, 34 + b, 6, PAL.eye); glyph(ctx, '⠒', 150, 39.5 + b, 5, PAL.lip)
  // hand seal glow
  glyph(ctx, '◇', 150, 88.5 + b, 6, bt ? PAL.gold : PAL.qi, { glow: 10 })
  // Qi streams: motes spiralling inward to the dantian
  for (let i = 0; i < 44; i++) {
    const life = (t * (bt ? 0.45 : 0.16) + rnd(i + 9)) % 1
    const ang = rnd(i) * Math.PI * 2 + life * 4.5
    const rad = (1 - life) * (70 + 30 * rnd(i + 3))
    const x = 150 + Math.cos(ang) * rad * 1.35, y = 80 + Math.sin(ang) * rad * 0.55
    glyph(ctx, i % 7 === 0 ? '气' : (i % 3 ? '·' : '∘'), x, y, i % 7 === 0 ? 7 : 6, bt && i % 2 ? PAL.gold : PAL.qi,
      { alpha: Math.sin(life * Math.PI) * 0.85, glow: 6 })
  }
  if (bt) {
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + t * 0.3
      ctx.save(); ctx.globalAlpha = 0.18 + 0.2 * rnd(Math.floor(t * 9) + i)
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1; ctx.shadowColor = PAL.gold; ctx.shadowBlur = 10
      ctx.beginPath(); ctx.moveTo(150 + Math.cos(a) * 30, 60 + Math.sin(a) * 22); ctx.lineTo(150 + Math.cos(a) * 140, 60 + Math.sin(a) * 90); ctx.stroke(); ctx.restore()
    }
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + t
      glyph(ctx, 'ϟ', 150 + Math.cos(a) * 60, 62 + Math.sin(a) * 42, 12, PAL.gold, { rot: a, alpha: 0.5 + 0.5 * rnd(Math.floor(t * 12) + i), glow: 12 })
    }
  }
}

// ── page wiring ─────────────────────────────────────────────────────────────
const VARIANTS = { a: drawA, b: drawB, c: drawC }
const targets = []
for (const v of Object.keys(VARIANTS)) {
  for (const [kind, w, h] of [['over', 300, 150], ['ban', 80, 56]]) {
    const cv = document.getElementById(`${v}-${kind}`)
    cv.width = w * DPR; cv.height = h * DPR; cv.style.width = w + 'px'; cv.style.height = h + 'px'
    targets.push({ v, ctx: cv.getContext('2d'), w, h })
  }
}
function renderAll() {
  for (const { v, ctx, w, h } of targets) {
    const k = h / LH
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w * DPR, h * DPR)
    ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * (w - LW * k) / 2, 0)
    VARIANTS[v](ctx, state.t, state.mode)
  }
}
function loop(now) {
  if (!state.paused) { state.t = now / 1000; renderAll() }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
document.querySelectorAll('.ctl [data-mode]').forEach(b => b.addEventListener('click', () => {
  state.mode = b.dataset.mode
  document.querySelectorAll('.ctl [data-mode]').forEach(x => x.classList.toggle('on', x === b))
}))
// Screenshot control (scripts/smoke/scenarios/art-bakeoff.js)
window.bake = {
  freeze(t, mode) { state.paused = true; state.t = t; if (mode) state.mode = mode; renderAll(); return true },
  resume() { state.paused = false },
  face(name) { B_DEFAULT_FACE = name },
}
let B_DEFAULT_FACE = 'serene'
VARIANTS.b = (ctx, t, mode) => drawB(ctx, t, mode, B_DEFAULT_FACE)
