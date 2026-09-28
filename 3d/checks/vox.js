// Scenario checks for the voxel pipeline: .vox write→parse round-trip, the voxel source, nearest-bone
// auto-rig, and the linter on a 3D rig. Run via `npm test` (tools/cli.js test). Spec: 3d/RIG-FORMAT.md.
'use strict'

const { writeVox, parseVox } = require('../rig/lib/vox')
const { voxelSource } = require('../rig/adapters/voxel')
const { autoRig } = require('../rig/autobind')
const { lintRig } = require('../rig/lint')

// A simple humanoid voxel blob: two legs, a torso, a head, and two arms (10×6×20).
function syntheticModel () {
  const [sx, sy, sz] = [10, 6, 20]
  const v = []
  const put = (x, y, z, c) => { if (x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz) v.push([x, y, z, c]) }
  for (let z = 0; z < 10; z++) for (let y = 1; y <= 4; y++) { put(3, y, z, 3); put(6, y, z, 3) }          // legs
  for (let z = 10; z < 16; z++) for (let x = 3; x <= 6; x++) for (let y = 1; y <= 4; y++) put(x, y, z, 2)  // torso
  for (let z = 16; z < 20; z++) for (let x = 3; x <= 6; x++) for (let y = 1; y <= 4; y++) put(x, y, z, 1)  // head
  for (let z = 11; z < 16; z++) for (let y = 1; y <= 4; y++) { put(1, y, z, 6); put(8, y, z, 6) }          // arms
  return { size: [sx, sy, sz], voxels: v }
}

function run () {
  const out = []
  const ok = (c, m) => out.push({ ok: !!c, msg: m })

  const palette = Array.from({ length: 256 }, (_, i) => [i, 0, 255 - i, 255])
  const model = syntheticModel()

  // .vox round-trip
  const buf = writeVox(model.size, model.voxels, palette)
  const parsed = parseVox(buf)
  ok(parsed.size.join(',') === '10,6,20', `parse: size 10,6,20 (got ${parsed.size.join(',')})`)
  ok(parsed.voxels.length === model.voxels.length, `parse: ${model.voxels.length} voxels (got ${parsed.voxels.length})`)
  ok(parsed.palette[5][0] === 5 && parsed.palette[5][1] === 0, 'parse: RGBA palette round-trips')
  ok(parsed.voxels[0].join(',') === model.voxels[0].join(','), 'parse: first voxel matches')

  // source + auto-rig + lint
  const src = voxelSource(buf, { model: 'synthetic.vox' })
  ok(src.space === '3d', 'source: space is 3d')
  const rig = autoRig(src)
  ok(rig.space === '3d', 'auto-rig: produced a 3D rig')
  ok(Object.keys(rig.skeleton).length > 0, `auto-rig: skeleton has ${Object.keys(rig.skeleton).length} bones`)
  ok(rig.attachments.length > 0, `auto-rig: ${rig.attachments.length} group attachments`)
  const total = rig.attachments.reduce((n, a) => n + a.count, 0)
  ok(total === src.voxels.length, `auto-rig: groups cover all ${src.voxels.length} voxels (got ${total})`)
  ok(rig.attachments.every(a => a.pivot.length === 3), 'auto-rig: pivots are 3D')

  const res = lintRig(rig, src)
  for (const r of res.results) ok(r.ok, 'lint: ' + r.msg)

  return out
}

module.exports = { run }
