// Auto-rig — builds a first-pass rig from a RigSource (spec: 3d/RIG-FORMAT.md "Auto-rig algorithm").
// Pure data. 2D (ink): a seated-cultivator template skeleton + semantic part bindings.
// 3D (voxel): a humanoid template skeleton + nearest-bone voxel partition. Used by: tools/cli.js.
'use strict'

const { partBBox, boneWorld } = require('./model')

const r2 = n => Math.round(n * 100) / 100

// ── 2D: ink ────────────────────────────────────────────────────────────────
// Seated-cultivator skeleton. `pos` = parent-relative offset. No leg bones (the base figure sits in lotus).
const SKELETON_2D = {
  root:   { parent: null,     pos: [150, 120] },
  hips:   { parent: 'root',   pos: [0, -22] },
  spine:  { parent: 'hips',   pos: [0, -18] },
  chest:  { parent: 'spine',  pos: [0, -14] },
  neck:   { parent: 'chest',  pos: [0, -10] },
  head:   { parent: 'neck',   pos: [0, -8] },
  armL_u: { parent: 'chest',  pos: [-13, -2] },
  armL_f: { parent: 'armL_u', pos: [-9, 12] },
  armR_u: { parent: 'chest',  pos: [13, -2] },
  armR_f: { parent: 'armR_u', pos: [9, 12] },
}

// Which bone drives a base part — by id first, then by motion layer. Mirrored twins (`<id>_m`) flip sides.
function boneForPart (part) {
  const mirrored = /_m$/.test(part.id)
  const id = mirrored ? part.id.slice(0, -2) : part.id
  const side = () => {
    const b = id.includes('L') ? 'L' : (id.includes('R') ? 'R' : null)
    return b ? (mirrored ? (b === 'L' ? 'R' : 'L') : b) : null
  }
  if (id === 'neck') return 'neck'
  if (id === 'face' || part.layer === 'head') return 'head'
  if (id === 'lap' || id === 'sash' || id === 'belt' || id === 'waist') return 'hips'
  if (id.startsWith('sleeve') || id.startsWith('arm')) return side() === 'L' ? 'armL_u' : 'armR_u'
  if (id.startsWith('fore') || id.startsWith('cuff')) return side() === 'L' ? 'armL_f' : 'armR_f'
  if (id === 'hands') return 'chest'
  if (id === 'torso') return 'spine'
  if (id.startsWith('lapel')) return 'chest'
  if (part.layer === 'lap') return 'hips'
  if (part.layer === 'body') return 'spine'
  if (part.layer === 'head') return 'head'
  return 'chest'
}

// Rotation origin inside the part's own bbox: head parts at the neck (bottom-centre), limbs at the shoulder
// (top-centre), everything else at its centre.
function pivotForPart (part) {
  const bb = partBBox(part)
  const cx = r2((bb.x0 + bb.x1) / 2)
  if (part.layer === 'head') return [cx, r2(bb.y1)]
  if (/^(sleeve|arm|fore|cuff)/.test(part.id)) return [cx, r2(bb.y0)]
  return [cx, r2((bb.y0 + bb.y1) / 2)]
}

const KIND_BONE_2D = { hair: 'head', weapon: 'chest' }
const KIND_PIVOT_2D = { hair: [150, 45], weapon: [150, 116] }
const kindContributes = (source, kind) => Object.values(source.slotOptions[kind] || {}).some(o => (o.parts || []).length > 0)

function seedTracks2D () {
  const k = (t, pose) => ({ t, pose })
  return {
    idle: { loop: true, rate: 1, feels: {
      spine: [k(0, [0, 0]), k(1.2, [0.02, 0, 1.01]), k(2.4, [0, 0])],
      head: [k(0, [0, 0]), k(1.6, [0.03, 0]), k(3.2, [0, 0])],
    } },
    breakthrough: { loop: false, rate: 1, overlay: 'bt', feels: {
      chest: [k(0, [0, 0]), k(0.8, [0, -4]), k(2.0, [0, -4])],
      armL_u: [k(0, [0, 0]), k(0.8, [-0.5, 0])],
      armR_u: [k(0, [0, 0]), k(0.8, [0.5, 0])],
    } },
    fail: { loop: false, rate: 1, overlay: 'strain', feels: {
      spine: [k(0, [0, 0]), k(0.25, [-0.08, 2]), k(0.9, [0, 0])],
      head: [k(0, [0, 0]), k(0.25, [-0.06, 1]), k(0.9, [0, 0])],
    } },
  }
}

function autoRigInk (source, { slots = {} } = {}) {
  const attachments = []
  for (const part of source.parts) {
    if (source.origin[part.id] !== 'base') continue
    attachments.push({ part: part.id, bone: boneForPart(part), layer: part.layer, pivot: pivotForPart(part) })
  }
  for (const kind of source.slotKinds) {
    if (!KIND_BONE_2D[kind] || !kindContributes(source, kind)) continue
    const a = { kind, bone: KIND_BONE_2D[kind], pivot: KIND_PIVOT_2D[kind].slice() }
    if (kind === 'hair') a.sway = { amp: 3, lag: 0.18 }
    attachments.push(a)
  }
  return {
    v: 1, space: '2d',
    source: { kind: source.kind, artId: source.artId, state: source.state, slots: { ...source.slots, ...slots } },
    canvas: source.scene,
    skeleton: SKELETON_2D,
    attachments,
    ik: [],
    tracks: seedTracks2D(),
    meta: { autoRig: true, humanTouched: [], review: null, generator: 'autobind@1' },
  }
}

// ── 3D: voxel ──────────────────────────────────────────────────────────────
// Humanoid skeleton, z-up (MagicaVoxel axes), scaled to the model box. Feet at z≈0, head near the top.
function voxelSkeleton (size) {
  const [sx, sy, sz] = size
  const cx = sx / 2, cy = sy / 2, H = sz
  return {
    root:  { parent: null,       pos: [cx, cy, 0.02 * H] },
    hips:  { parent: 'root',     pos: [0, 0, 0.44 * H] },
    spine: { parent: 'hips',     pos: [0, 0, 0.14 * H] },
    chest: { parent: 'spine',    pos: [0, 0, 0.12 * H] },
    neck:  { parent: 'chest',    pos: [0, 0, 0.08 * H] },
    head:  { parent: 'neck',     pos: [0, 0, 0.09 * H] },
    armL:  { parent: 'chest',    pos: [-0.22 * sx, 0, -0.02 * H] },
    handL: { parent: 'armL',     pos: [-0.06 * sx, 0, -0.22 * H] },
    armR:  { parent: 'chest',    pos: [0.22 * sx, 0, -0.02 * H] },
    handR: { parent: 'armR',     pos: [0.06 * sx, 0, -0.22 * H] },
    legL:  { parent: 'hips',     pos: [-0.10 * sx, 0, -0.22 * H] },
    footL: { parent: 'legL',     pos: [0, 0, -0.22 * H] },
    legR:  { parent: 'hips',     pos: [0.10 * sx, 0, -0.22 * H] },
    footR: { parent: 'legR',     pos: [0, 0, -0.22 * H] },
  }
}

function seedTracks3D (has) {
  const k = (t, pose) => ({ t, pose })
  const t = {}
  const body = has('spine') ? 'spine' : (has('chest') ? 'chest' : null)
  if (body) t.idle = { loop: true, rate: 1, feels: { [body]: [k(0, [0, 0, 0, 0]), k(1.2, [0, 0, 0, 0.5]), k(2.4, [0, 0, 0, 0])] } }
  const walk = {}
  if (has('legL')) walk.legL = [k(0, [0, 0, 0, 0]), k(0.5, [0, 0, 0, 1.2]), k(1.0, [0, 0, 0, 0])]
  if (has('legR')) walk.legR = [k(0, [0, 0, 0, 1.2]), k(0.5, [0, 0, 0, 0]), k(1.0, [0, 0, 0, 1.2])]
  if (has('armL')) walk.armL = [k(0, [0, 0, 0, 0]), k(0.5, [0, 0, 0, -0.6]), k(1.0, [0, 0, 0, 0])]
  if (has('armR')) walk.armR = [k(0, [0, 0, 0, -0.6]), k(0.5, [0, 0, 0, 0]), k(1.0, [0, 0, 0, -0.6])]
  if (Object.keys(walk).length) t.walk = { loop: true, rate: 1, feels: walk }
  return t
}

function autoRigVoxel (source) {
  const skeleton = voxelSkeleton(source.size)
  const worlds = {}
  const tmp = { skeleton }
  for (const n of Object.keys(skeleton)) worlds[n] = boneWorld(tmp, n)

  // Partition every voxel to its nearest bone (rest pose). Deterministic.
  const groups = {}
  for (const v of source.voxels) {
    const c = [v[0] + 0.5, v[1] + 0.5, v[2] + 0.5]
    let best = null, bd = Infinity
    for (const n of Object.keys(skeleton)) {
      const w = worlds[n]
      const d = (c[0] - w[0]) ** 2 + (c[1] - w[1]) ** 2 + (c[2] - w[2]) ** 2
      if (d < bd) { bd = d; best = n }
    }
    if (!groups[best]) groups[best] = { count: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], sum: [0, 0, 0] }
    const g = groups[best]; g.count++
    for (let i = 0; i < 3; i++) { g.min[i] = Math.min(g.min[i], v[i]); g.max[i] = Math.max(g.max[i], v[i]); g.sum[i] += v[i] }
  }

  // Drop leaf bones that own no voxels (a hand/foot the model doesn't reach); repeat for the new leaves.
  let pruned = true
  while (pruned) {
    pruned = false
    const childCount = {}
    for (const [n, b] of Object.entries(skeleton)) if (b.parent) childCount[b.parent] = (childCount[b.parent] || 0) + 1
    for (const n of Object.keys(skeleton)) if (!childCount[n] && !groups[n]) { delete skeleton[n]; pruned = true }
  }

  const attachments = Object.keys(skeleton).filter(n => groups[n]).map(n => {
    const g = groups[n]
    return {
      group: n, bone: n, count: g.count,
      box: { x0: g.min[0], y0: g.min[1], z0: g.min[2], x1: g.max[0] + 1, y1: g.max[1] + 1, z1: g.max[2] + 1 },
      pivot: [r2(g.sum[0] / g.count + 0.5), r2(g.sum[1] / g.count + 0.5), r2(g.sum[2] / g.count + 0.5)],
    }
  })

  const has = n => !!skeleton[n]
  return {
    v: 1, space: '3d',
    source: { kind: source.kind, model: source.model, space: '3d' },
    canvas: source.size,
    skeleton,
    attachments,
    ik: [],
    tracks: seedTracks3D(has),
    meta: { autoRig: true, humanTouched: [], review: null, generator: 'autobind-voxel@1' },
  }
}

// ── 2D coarse: ASCII sprite ────────────────────────────────────────────────
// A vertical chain of N bones (bottom → top), one per horizontal region of the frame.
function autoRigAscii (source) {
  const parts = source.regions || []
  const n = parts.length
  const topToBottom = n === 3 ? ['head', 'spine', 'hips'] : parts.map((_, i) => 'b' + i)
  const bottomToTop = [...topToBottom].reverse()
  const gx = source.grid.ox + source.grid.w / 2
  const bandH = source.grid.h / n
  const world = { root: [gx, source.grid.oy + source.grid.h] }
  for (let i = 0; i < n; i++) world[topToBottom[i]] = [gx, r2(source.grid.oy + (i + 0.5) * bandH)]

  const skeleton = { root: { parent: null, pos: [r2(gx), r2(world.root[1])] } }
  let parent = 'root'
  for (const name of bottomToTop) {
    skeleton[name] = { parent, pos: [r2(world[name][0] - world[parent][0]), r2(world[name][1] - world[parent][1])] }
    parent = name
  }
  const attachments = parts.map((p, i) => ({
    part: p.id, bone: topToBottom[i], layer: 'region',
    pivot: [r2(gx), r2((p.box.y0 + p.box.y1) / 2)],
  }))

  const has = nm => !!skeleton[nm]
  const k = (t, pose) => ({ t, pose })
  const tracks = {}
  const body = has('spine') ? 'spine' : bottomToTop[bottomToTop.length - 1]
  if (body) {
    const feels = { [body]: [k(0, [0, 0]), k(1.4, [0, -0.6]), k(2.8, [0, 0])] }
    if (has('head')) feels.head = [k(0, [0, 0]), k(1.8, [0.03, 0]), k(3.6, [0, 0])]
    tracks.idle = { loop: true, rate: 1, feels }
  }
  return {
    v: 1, space: '2d',
    source: { kind: 'ascii', state: source.state },
    canvas: source.scene,
    skeleton, attachments, ik: [], tracks,
    meta: { autoRig: true, humanTouched: [], review: null, generator: 'autobind-ascii@1' },
  }
}

function autoRig (source, opts = {}) {
  if (source.space === '3d') return autoRigVoxel(source)
  if (source.kind === 'ascii') return autoRigAscii(source)
  return autoRigInk(source, opts)
}

module.exports = { autoRig, SKELETON_2D, boneForPart, pivotForPart, voxelSkeleton }

