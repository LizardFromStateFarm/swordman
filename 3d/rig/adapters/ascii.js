// ASCII sprite adapter — turns the app's CULTIVATOR_SPRITES char grids into a coarse 2D RigSource
// (spec: 3d/RIG-FORMAT.md §7). Pure data, no DOM. Used by: rig/source.js, checks/ascii.js.
//
// ASCII art is a char grid, not parts, so rigging it is deliberately coarse: the frame is cut into N
// horizontal REGIONS (default 3 = head / torso / legs) and each region is bound to one bone. No sub-part
// detail — this exists so the classic sprite style can be placed/posed alongside the ink and voxel ones.
'use strict'

const CANVAS = [300, 172]                 // the app's ASCII canvas
const CELL = { w: 8.4, h: 16 }            // ≈ 14px Courier New advance / line height (a preview approximation)

// Does a code point occupy two cells (CJK / wide symbols / emoji)? The app renders CJK at ~2× advance.
function isWide (cp) {
  return (cp >= 0x1100 && cp <= 0x115F) || cp === 0x2329 || cp === 0x232A ||
    (cp >= 0x2E80 && cp <= 0xA4CF && cp !== 0x303F) || (cp >= 0xAC00 && cp <= 0xD7A3) ||
    (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x1F300 && cp <= 0x1FAFF)
}
function rowWidth (row) { let n = 0; for (const ch of row) n += isWide(ch.codePointAt(0)) ? 2 : 1; return n }

const r2 = n => Math.round(n * 100) / 100

function asciiSource (art, { state = 'meditating', regions = 3 } = {}) {
  const table = art.CULTIVATOR_SPRITES
  if (!table) throw new Error('no CULTIVATOR_SPRITES in loaded art (wrong --source?)')
  const sp = table[state]
  if (!sp) throw new Error(`CULTIVATOR_SPRITES has no state "${state}" (have: ${Object.keys(table).join(', ')})`)

  const rows = (sp.frames && sp.frames[0]) || []
  if (!rows.length) throw new Error(`sprite "${state}" has no frames`)
  const cols = Math.max(1, ...rows.map(rowWidth))
  const [cw, ch] = CANVAS
  const gridW = cols * CELL.w, gridH = rows.length * CELL.h
  const ox = Math.round((cw - gridW) / 2), oy = Math.round((ch - gridH) / 2)

  const n = Math.max(1, regions | 0)
  const bandH = gridH / n
  const bandIds = n === 1 ? ['sprite'] : Array.from({ length: n }, (_, i) => 'band' + i)
  const regionsList = bandIds.map((id, i) => ({ id, box: { x0: ox, y0: r2(oy + i * bandH), x1: ox + gridW, y1: r2(oy + (i + 1) * bandH) } }))

  return {
    kind: 'ascii', space: '2d', state,
    scene: CANVAS, cell: CELL,
    grid: { cols, rows: rows.length, ox, oy, w: r2(gridW), h: r2(gridH) },
    regions: regionsList, bandIds,
    frames: sp.frames, colors: sp.colors || {}, defaultColor: sp.defaultColor, fps: sp.fps,
    bboxOf: a => { const p = regionsList.find(q => q.id === a.part); return p ? p.box : null },
    checks: {
      coverage (rig) {
        const fails = []
        const claimed = new Set((rig.attachments || []).filter(a => a.part).map(a => a.part))
        for (const p of regionsList) if (!claimed.has(p.id)) fails.push(`unbound region "${p.id}"`)
        return fails
      },
      bounds (rig) {
        const fails = []
        const [W, H] = CANVAS
        for (const p of regionsList) {
          const b = p.box
          if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) fails.push(`region "${p.id}" is outside the canvas (${W}×${H})`)
        }
        return fails
      },
    },
  }
}

module.exports = { asciiSource, isWide, rowWidth, CELL, CANVAS }
