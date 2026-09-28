// Voxel adapter — turns a MagicaVoxel .vox model into a 3D RigSource (spec: 3d/RIG-FORMAT.md §7).
// The model's voxels are partitioned into per-bone groups by autobind (nearest-bone), so `bboxOf` reads the
// group box stored on the attachment. Pure data, no DOM. Used by: rig/source.js, checks/vox.js.
'use strict'

const { parseVox } = require('../lib/vox')

function voxelSource (buf, { model } = {}) {
  const m = parseVox(buf)
  const src = {
    kind: 'voxel', space: '3d', model,
    version: m.version, size: m.size, palette: m.palette, voxels: m.voxels,
    unit: 'voxel',
    bboxOf: a => a.box || null,
    checks: {
      // Every voxel belongs to exactly one group, and every group maps to a bone.
      coverage (rig) {
        const fails = []
        const total = (rig.attachments || []).reduce((n, a) => n + (a.count || 0), 0)
        if (total !== src.voxels.length) fails.push(`voxel groups cover ${total} of ${src.voxels.length} voxels`)
        const seen = new Set()
        for (const a of rig.attachments || []) {
          if (!a.count) fails.push(`group "${a.group}" has no voxels`)
          if (seen.has(a.group)) fails.push(`group "${a.group}" appears twice`)
          seen.add(a.group)
        }
        return fails
      },
      bounds (rig) {
        const fails = []
        const [sx, sy, sz] = src.size
        for (const a of rig.attachments || []) {
          const b = a.box
          if (!b) continue
          if (b.x0 < 0 || b.y0 < 0 || b.z0 < 0 || b.x1 > sx || b.y1 > sy || b.z1 > sz)
            fails.push(`group "${a.group}" box is outside the model (${sx}×${sy}×${sz})`)
        }
        return fails
      },
    },
  }
  return src
}

module.exports = { voxelSource }
