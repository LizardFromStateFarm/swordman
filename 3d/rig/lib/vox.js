// MagicaVoxel .vox reader + a minimal writer. Dependency-free. Pure data, no DOM.
// Format: 'VOX ' + version, then chunks { id(4) + contentSize(i32) + childrenSize(i32) + content + children }.
// Handles SIZE / XYZI / RGBA inside MAIN; skips other chunks (MATL, nTRN, nGRP, nSHP, LAYR…). Single model only.
// Used by: rig/adapters/voxel.js, checks/vox.js.
'use strict'

function readChunks (buf, start, end, onChunk) {
  let off = start
  while (off + 12 <= end) {
    const id = buf.toString('ascii', off, off + 4)
    const contentSize = buf.readInt32LE(off + 4)
    const childrenSize = buf.readInt32LE(off + 8)
    const contentOff = off + 12
    onChunk(id, contentOff, contentSize)
    if (id === 'MAIN') { off = contentOff + contentSize; continue }   // descend into MAIN's children
    off = contentOff + contentSize + childrenSize
  }
}

// A generated fallback palette (index → hue ramp). Real files ship an RGBA chunk; this is only a safety net.
function defaultPalette () {
  const p = []
  for (let i = 0; i < 256; i++) {
    const h = (i * 137.5) % 360, s = 0.6, l = 0.35 + (i % 5) * 0.1
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
    let r = 0, g = 0, b = 0
    if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
    else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
    p.push([Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), 255])
  }
  return p
}

// → { version, size:[x,y,z], voxels:[[x,y,z,colorIndex],…], palette:[[r,g,b,a]×256] }
function parseVox (buf) {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'VOX ') throw new Error('not a MagicaVoxel .vox file')
  const version = buf.readInt32LE(4)
  let size = null, voxels = null, palette = null
  readChunks(buf, 8, buf.length, (id, off, len) => {
    if (id === 'SIZE') size = [buf.readInt32LE(off), buf.readInt32LE(off + 4), buf.readInt32LE(off + 8)]
    else if (id === 'XYZI' && !voxels) {
      const n = buf.readInt32LE(off)
      voxels = []
      for (let i = 0; i < n; i++) { const o = off + 4 + i * 4; voxels.push([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]) }
    } else if (id === 'RGBA' && !palette) {
      palette = []
      for (let i = 0; i < 256; i++) { const o = off + i * 4; palette.push([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]) }
    }
  })
  if (!size) throw new Error('.vox has no SIZE chunk')
  return { version, size, voxels: voxels || [], palette: palette || defaultPalette() }
}

const chunk = (id, content) => {
  const h = Buffer.alloc(12)
  h.write(id, 0, 'ascii'); h.writeInt32LE(content.length, 4); h.writeInt32LE(0, 8)
  return Buffer.concat([h, content])
}

// Minimal writer — single model, RGBA always present. Used by the checks to build a synthetic model.
function writeVox (size, voxels, palette) {
  const pal = palette || defaultPalette()
  const sizeB = Buffer.alloc(12)
  sizeB.writeInt32LE(size[0], 0); sizeB.writeInt32LE(size[1], 4); sizeB.writeInt32LE(size[2], 8)
  const xyzi = Buffer.alloc(4 + voxels.length * 4)
  xyzi.writeInt32LE(voxels.length, 0)
  voxels.forEach((v, i) => { const o = 4 + i * 4; xyzi[o] = v[0]; xyzi[o + 1] = v[1]; xyzi[o + 2] = v[2]; xyzi[o + 3] = v[3] })
  const rgba = Buffer.alloc(256 * 4)
  for (let i = 0; i < 256; i++) { const p = pal[i] || [0, 0, 0, 255]; const o = i * 4; rgba[o] = p[0]; rgba[o + 1] = p[1]; rgba[o + 2] = p[2]; rgba[o + 3] = p[3] }
  const children = Buffer.concat([chunk('SIZE', sizeB), chunk('XYZI', xyzi), chunk('RGBA', rgba)])
  const main = Buffer.alloc(12)
  main.write('MAIN', 0, 'ascii'); main.writeInt32LE(0, 4); main.writeInt32LE(children.length, 8)
  const header = Buffer.alloc(8)
  header.write('VOX ', 0, 'ascii'); header.writeInt32LE(150, 4)
  return Buffer.concat([header, main, children])
}

module.exports = { parseVox, writeVox, defaultPalette }
