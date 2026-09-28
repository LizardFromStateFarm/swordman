// Rig model — the 3D project's rig format plus pure helpers (3d/RIG-FORMAT.md). No DOM, no I/O.
// Boxes are { x0, y0, x1, y1 } (2D, sheet space) or { x0, y0, z0, x1, y1, z1 } (3D, voxel space).
// Skeleton `pos` is a PARENT-RELATIVE offset, 2 or 3 components; world = the sum along the parent chain.
// Used by: rig/adapters/*, rig/autobind.js, rig/lint.js, tools/*.
'use strict'

// Slot merge order — mirrors renderer/engine/ink-renderer.js `InkRenderer.SLOT_KINDS`.
const SLOT_KINDS = ['robe', 'hair', 'weapon', 'face', 'aura']

// ── 2D path command helpers (ink art) ──
function cmdPoints (d) {
  const pts = []
  let i = 0
  while (i < d.length) {
    const c = d[i]
    if (c === 'M' || c === 'L') { pts.push([d[i + 1], d[i + 2]]); i += 3 }
    else if (c === 'Q') { pts.push([d[i + 1], d[i + 2]], [d[i + 3], d[i + 4]]); i += 5 }
    else if (c === 'C') { pts.push([d[i + 1], d[i + 2]], [d[i + 3], d[i + 4]], [d[i + 5], d[i + 6]]); i += 7 }
    else if (c === 'E') {
      const cx = d[i + 1], cy = d[i + 2], rx = d[i + 3], ry = d[i + 4]
      pts.push([cx - rx, cy - ry], [cx + rx, cy + ry], [cx, cy]); i += 5
    } else i += 1
  }
  return pts
}

function cmdBBox (d) {
  const pts = cmdPoints(d)
  if (!pts.length) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1 }
}

function partBBox (part) { return cmdBBox(part.d) }

// ── boxes (2D or 3D) ──
function is3D (box) { return box && box.z0 != null }

function unionBoxes (boxes) {
  const b = (boxes || []).filter(Boolean)
  if (!b.length) return null
  const three = b.some(is3D)
  const out = {
    x0: Math.min(...b.map(x => x.x0)), y0: Math.min(...b.map(x => x.y0)),
    x1: Math.max(...b.map(x => x.x1)), y1: Math.max(...b.map(x => x.y1)),
  }
  if (three) {
    out.z0 = Math.min(...b.map(x => (x.z0 != null ? x.z0 : 0)))
    out.z1 = Math.max(...b.map(x => (x.z1 != null ? x.z1 : 0)))
  }
  return out
}

function boxCenter (box) {
  const c = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2]
  if (is3D(box)) c.push((box.z0 + box.z1) / 2)
  return c
}

function insideBox (pt, box, eps = 0.01) {
  if (!box) return false
  if (pt[0] < box.x0 - eps || pt[0] > box.x1 + eps) return false
  if (pt[1] < box.y0 - eps || pt[1] > box.y1 + eps) return false
  if (is3D(box) && (pt[2] < box.z0 - eps || pt[2] > box.z1 + eps)) return false
  return true
}

// ── ink art resolution ──
function resolveArt (INK_ART, state) {
  const chain = []
  const seen = new Set()
  let cur = state
  while (cur && INK_ART[cur] && !seen.has(cur)) { seen.add(cur); chain.unshift(cur); cur = INK_ART[cur].extends }
  if (!chain.length) return null
  let out = null
  for (const s of chain) {
    const V = INK_ART[s]
    if (!out) { out = { ...V }; continue }
    const B = out
    out = { ...B, ...V }
    for (const k of ['palette', 'background', 'slots', 'halo', 'qiPearl', 'body']) {
      if (V[k] && B[k]) out[k] = { ...B[k], ...V[k] }
    }
  }
  return out
}

// ── skeleton ──
// World position of a bone at rest: sum of parent-relative offsets. Length = 2 (2D rigs) or 3 (3D rigs).
function boneWorld (rig, name) {
  const chain = []
  let n = name
  while (n) { const b = rig.skeleton[n]; if (!b) break; chain.unshift(b); n = b.parent }
  const dims = Math.max(2, ...chain.map(b => b.pos.length))
  const out = new Array(dims).fill(0)
  for (const b of chain) for (let i = 0; i < dims; i++) out[i] += (b.pos[i] || 0)
  return out
}

// ── mirror opt-in (renderer/engine/ink-renderer.js `inkMirrorAll` / `inkMirrorD`) ──
const MIRROR_N = { M: 2, L: 2, Q: 4, C: 6, E: 4, Z: 0 }
function mirrorCmd (d, cx) {
  const out = []
  for (let i = 0; i < d.length;) {
    const c = d[i++]; out.push(c)
    for (let k = 0; k < MIRROR_N[c]; k++) out.push((k % 2 === 0 && !(c === 'E' && k === 2)) ? 2 * cx - d[i + k] : d[i + k])
    i += MIRROR_N[c]
  }
  return out
}
function mirrorEntries (list, cx) {
  const out = []
  for (const e of list || []) {
    out.push(e)
    if (!e.mirror) continue
    const m = { ...e, mirror: false, id: e.id && e.id + '_m', layer: e.mirrorLayer || e.layer }
    if (e.d) m.d = mirrorCmd(e.d, cx)
    if (e.pts) m.pts = e.pts.map(([x, y]) => [2 * cx - x, y])
    if (e.after) m.after = e.after + '_m'
    out.push(m)
  }
  return out
}

module.exports = {
  SLOT_KINDS, cmdPoints, cmdBBox, partBBox, unionBoxes, boxCenter, insideBox, resolveArt, boneWorld,
  mirrorCmd, mirrorEntries, is3D,
}
