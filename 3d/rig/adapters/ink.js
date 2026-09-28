// Ink art adapter — turns the app's INK_ART / INK_PARTS data into a 2D RigSource (spec: 3d/RIG-FORMAT.md §7).
// Pure data, no DOM. Used by: rig/source.js, tools/cli.js.
'use strict'

const { SLOT_KINDS, resolveArt, mirrorEntries, partBBox, unionBoxes } = require('../model')

// Faithful mirror of InkRenderer._effective() (renderer/engine/ink-renderer.js): mirror any opt-in
// `mirror:true` base entries, then merge the chosen slot options onto the base art. Kept here rather than
// loading the renderer so the CLI stays DOM-free. If the renderer's merge ever changes, update this — it is
// the one piece of logic shared by copy.
function mergeEffective (base, slotSel, INK_PARTS) {
  const sel = { ...(base.slots || {}), ...slotSel }
  const cx = (base.scene && base.scene[0] ? base.scene[0] : 300) / 2
  const A = {
    ...base, palette: { ...base.palette }, parts: mirrorEntries(base.parts, cx),
    strokes: mirrorEntries(base.strokes, cx), dotFeatures: mirrorEntries(base.dotFeatures || [], cx), frames: {}, slots: sel,
  }
  const origin = {}
  for (const p of A.parts) origin[p.id] = 'base'
  for (const kind of SLOT_KINDS) {
    const O = (INK_PARTS[kind] || {})[sel[kind]]
    if (!O || (kind === 'aura' && base.aura === false)) continue
    Object.assign(A.palette, O.palette || {})
    for (const part of O.parts || []) {
      const anchor = part.before || part.after
      const i = anchor ? A.parts.findIndex(q => q.id === anchor) : -1
      if (i < 0) A.parts.push(part); else A.parts.splice(part.before ? i : i + 1, 0, part)
      origin[part.id] = kind
    }
    A.strokes.push(...(O.strokes || []))
    A.dotFeatures.push(...(O.features || []))
    Object.assign(A.frames, O.frames || {})
    Object.assign(A, O.effects || {})
  }
  return { art: A, origin }
}

function inkSource (art, { state = 'meditating', slots = {} } = {}) {
  const { INK_ART, INK_PARTS } = art
  if (!INK_ART) throw new Error('no INK_ART in loaded art (wrong --source?)')
  const base = resolveArt(INK_ART, state)
  if (!base) throw new Error(`INK_ART has no state "${state}" (have: ${Object.keys(INK_ART).join(', ')})`)
  const { art: eff, origin } = mergeEffective(base, slots, INK_PARTS)
  const scene = eff.scene || [300, 150]

  // Geometry an attachment drives: by part id, or the union of a kind's parts across every option.
  function bboxOf (a) {
    if (a.part) { const p = eff.parts.find(q => q.id === a.part); return p ? partBBox(p) : null }
    if (a.kind) {
      const boxes = []
      for (const O of Object.values(INK_PARTS[a.kind] || {})) for (const p of O.parts || []) boxes.push(partBBox(p))
      return unionBoxes(boxes)
    }
    return null
  }

  return {
    kind: 'ink',
    space: '2d',
    state, artId: eff.id,
    scene,
    figureBox: eff.figureBox || [0, 0, scene[0], scene[1]],
    body: eff.body || {},
    slots: eff.slots,
    palette: eff.palette,
    parts: eff.parts,                     // draw order, back → front
    origin,                               // part id → 'base' | slot kind
    slotKinds: SLOT_KINDS,
    slotOptions: INK_PARTS,
    strokes: eff.strokes || [],
    dotFeatures: eff.dotFeatures || [],
    glyphs: eff.glyphs || [],
    bboxOf,
    checks: {
      coverage (rig) {
        const fails = []
        const claimed = new Set((rig.attachments || []).filter(a => a.part).map(a => a.part))
        for (const p of eff.parts) if (origin[p.id] === 'base' && !claimed.has(p.id)) fails.push(`unbound base part "${p.id}"`)
        for (const kind of SLOT_KINDS) {
          const covered = (rig.attachments || []).some(a => a.kind === kind)
          for (const [opt, O] of Object.entries(INK_PARTS[kind] || {})) {
            const parts = O.parts || []
            if (parts.length && !covered && !parts.every(p => claimed.has(p.id))) fails.push(`slot ${kind}:${opt} is not covered by any attachment`)
          }
        }
        return fails
      },
      bounds (rig) {
        const fails = []
        const [sw, sh] = (rig.canvas && rig.canvas.length === 2 ? rig.canvas : scene)
        const m = 40
        for (const part of eff.parts) {
          const bb = partBBox(part)
          if (bb.x0 < -m || bb.y0 < -m || bb.x1 > sw + m || bb.y1 > sh + m) fails.push(`part "${part.id}" is outside the canvas (${sw}×${sh}) by more than ${m}px`)
        }
        return fails
      },
    },
  }
}

module.exports = { inkSource, mergeEffective }
