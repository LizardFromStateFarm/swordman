// Real-app capture for the art bake-off (roadmap A2, docs/systems/ui-review.md → "A2 bake-off"): opens
// scripts/art-bakeoff/index.html inside the Electron app and screenshots each variant (a/b/c) at Overlay size
// (300×150, 3× magnified hi-DPI) and Banner size (80×56, 4×), idle at 3 moments + breakthrough at 2, plus the
// whole comparison page and variant (b)'s swappable face. Output: scripts/smoke/out/bake-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/art-bakeoff.js
const path = require('path')
module.exports = async ({ ev, wait, shot, assert, sleep }) => {
  const url = 'file:///' + path.resolve(__dirname, '../../art-bakeoff/index.html').replace(/\\/g, '/') + '?dpr=3'
  await ev(`location.href = ${JSON.stringify(url)}`)
  await sleep(1200)
  await wait('typeof window.bake !== "undefined"', 10000)
  await ev('window.resizeTo && window.resizeTo(1100, 560)')
  const rect = id => ev(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`)
  const moments = { idle: [0.4, 1.7, 3.1], breakthrough: [5.2, 5.6] }
  for (const v of ['a', 'b', 'c']) {
    const over = await rect(`${v}-over`), ban = await rect(`${v}-ban`)
    for (const [mode, ts] of Object.entries(moments)) {
      for (let i = 0; i < ts.length; i++) {
        await ev(`bake.freeze(${ts[i]}, '${mode}')`)
        await sleep(120)
        await shot(`bake-${v}-${mode}-${i}`, { ...over, scale: 3 })
        if (i === 0) await shot(`bake-${v}-${mode}-banner`, { ...ban, scale: 4 })
      }
    }
    await ev('bake.freeze(0.4, "idle")')
    await shot(`bake-${v}-idle-1x`, { ...over, scale: 1 })
  }
  await ev('bake.face("fierce"); bake.freeze(0.4, "idle")')
  const bo = await rect('b-over')
  await shot('bake-b-face-swap', { ...bo, scale: 3 })
  await ev('bake.face("serene"); bake.freeze(1.7, "idle")')
  await shot('bake-page')
  assert(await ev('document.querySelectorAll("canvas").length') === 6, 'all six canvases rendered')
}
