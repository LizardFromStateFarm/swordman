// Real-app smoke scenario (fast art loop): renders only the ink beast sheet, every INK_BEASTS entry (skipping `_base`;
// variants included) into scripts/smoke/out/ink-beasts-sheet.png. No save/game needed. Use this while authoring beast
// art (docs/systems/art-engine.md → "Raster beasts"); the full UI check is scenarios/ink-beasts.js.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-beasts-sheet.js
//   env BEASTS=fox,eagle filters by key · MOMENTS=2 adds a second moment per beast (motion) · SCALE=8 (default 5)
const fs = require('fs'), path = require('path')
const OUT = path.join(__dirname, '..', 'out')

module.exports = async ({ ev, wait, assert }) => {
  await wait('typeof InkRenderer === "function" && typeof INK_BEASTS === "object"', 20000)
  // raster beasts: wait for their dot maps to load (the engine loads them async)
  await ev(`Promise.all(Object.values(INK_BEASTS).flatMap(a => [].concat(a.raster || [])).filter(R => R.map).map(R => new Promise(res => InkRenderer.image(InkRenderer.assetUrl(R.map), res) && res())))`)
  const opt = { only: (process.env.BEASTS || '').split(',').filter(Boolean), moments: +(process.env.MOMENTS || 1), scale: +(process.env.SCALE || 5) }
  const sheet = await ev(`(() => {
    const { only, moments, scale } = ${JSON.stringify(opt)}
    const keys = Object.keys(INK_BEASTS).filter(k => k[0] !== '_' && (!only.length || only.some(o => k.includes(o))))
    const W = 108 * scale, H = 78 * scale, perRow = Math.min(moments > 1 ? 2 : 4, keys.length), rows = Math.ceil(keys.length / perRow)
    const cv = document.createElement('canvas'); cv.width = W * perRow * moments; cv.height = (H + 40) * rows
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    g.font = '24px Georgia, serif'; g.fillStyle = '#E8D9B0'; g.textAlign = 'center'
    keys.forEach((t, i) => {
      const r = new InkRenderer(document.createElement('canvas'), { table: INK_BEASTS })
      r.setStageColor(INK_BEASTS[t].glow); r.base = InkRenderer.resolve(t, INK_BEASTS); r.art = r._effective()
      const col = (i % perRow) * moments, row = Math.floor(i / perRow)
      for (let k = 0; k < moments; k++) {
        g.drawImage(r.stillCanvas(108, 78, scale, 2.3 + i * 0.4 + k * 1.1, {}), (col + k) * W, row * (H + 40) + 40)
        g.fillText(t + (k ? ' (later)' : ''), (col + k) * W + W / 2, row * (H + 40) + 30)
      }
    })
    return keys.length ? cv.toDataURL('image/png') : ''
  })()`)
  assert(!!sheet, 'rendered at least one beast')
  if (!sheet) return
  const f = path.join(OUT, 'ink-beasts-sheet.png')
  fs.writeFileSync(f, Buffer.from(sheet.split(',')[1], 'base64'))
  console.log('     sheet', f)
}
