// One-off generator for assets/icons/tray-icon.png (Phase 9A system tray icon). Run with
// `node scripts/gen-tray-icon.js` to regenerate. Writes a raw PNG by hand (no image deps, no
// python) — a 32x32 jade circle with a gold ring, echoing the --jade/--gold CSS tokens
// (ui-layout.md) so the tray icon reads as "this app" at a glance. Not run at app boot.
const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 32
const JADE  = [0x30, 0xB8, 0x78] // --jade
const GOLD  = [0xED, 0xD0, 0x50] // --gold
const DARK  = [0x08, 0x04, 0x0E] // --bg core, used for the glyph stroke

function pixel(x, y) {
  const cx = SIZE / 2 - 0.5, cy = SIZE / 2 - 0.5
  const dx = x - cx, dy = y - cy
  const r = Math.sqrt(dx * dx + dy * dy)
  const outerR = SIZE / 2 - 1
  const ringInner = outerR - 2.6
  if (r > outerR) return [0, 0, 0, 0]                 // transparent outside circle
  if (r > ringInner) return [...GOLD, 255]             // gold ring
  // Simple qi-swirl glyph: a dark comma/curl on jade fill, evokes 气 without needing real glyph rendering
  const angle = Math.atan2(dy, dx)
  const swirl = Math.sin(angle * 2 + r * 0.55) * 0.5 + 0.5
  if (r < outerR * 0.55 && swirl > 0.62) return [...DARK, 235]
  return [...JADE, 255]
}

const rowSize = 1 + SIZE * 4
const raw = Buffer.alloc(rowSize * SIZE)
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * rowSize
  raw[rowStart] = 0 // filter type: none
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y)
    const o = rowStart + 1 + x * 4
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// Standard CRC-32 (PNG spec)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8   // bit depth
ihdr[9] = 6   // color type: RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

const idat = zlib.deflateSync(raw)
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
])

const outDir = path.join(__dirname, '..', 'assets', 'icons')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'tray-icon.png')
fs.writeFileSync(outPath, png)
console.log('Wrote', outPath, png.length, 'bytes')
