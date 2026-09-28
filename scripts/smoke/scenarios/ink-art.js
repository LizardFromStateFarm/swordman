// Real-app smoke scenario — A3-1 hybrid ink art engine (docs/systems/art-engine.md): the ⚙ Sprite art = Ink setting
// swaps the sprite canvas to InkRenderer for Qi Condensation and falls back to the classic sprite elsewhere; captures
// idle + breakthrough at one frozen moment in every layout mode (+ phone), high-res stills for review, and a
// per-frame cost check. Screenshots: scripts/smoke/out/ink-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-art.js
const fs = require('fs'), path = require('path')
const OUT = path.join(__dirname, '..', 'out')

module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800)
  }
  const canvasClip = async (scale = 2) => {
    const r = await ev('(() => { const b = document.getElementById("sprite-canvas").getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height } })()')
    return { ...r, scale }
  }
  const T = 2.1   // the frozen moment: rings mid-orbit, a mote rising past the shoulder
  const both = async (name, scale) => {
    await ev(`spriteRenderer.ink.freeze(${T}, 0)`); await sleep(120); await shot(`ink-${name}-idle`, await canvasClip(scale))
    await ev(`spriteRenderer.ink.freeze(${T}, 1)`); await sleep(120); await shot(`ink-${name}-bt`, await canvasClip(scale))
    await ev(`spriteRenderer.ink.freeze(${T}, 0)`)
  }
  const savePng = (name, dataUrl) => {
    const f = path.join(OUT, `${name}.png`)
    fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('     still', f)
  }

  // A mid-game save, put back at Qi Condensation layer 3
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const gs = gameState, s = gs.get(); s.stageIndex = 3; s.sectWar.nextWarAt = Date.now() + 3600e3; gs._recalc(); gs._notify() })()')
  await sleep(300)

  assert(!(await ev('spriteRenderer.isInk()')), 'default Sprite art = Classic (ASCII renderer active)')
  await ev('gameState.setSetting("artStyle", "ink")'); await sleep(400)
  assert(await ev('spriteRenderer.isInk()'), 'Sprite art = Ink switches Qi Condensation to the ink engine')
  assert(await ev('document.getElementById("sprite-canvas").width === Math.round(parseFloat(getComputedStyle(document.getElementById("sprite-canvas")).width) * Math.min(3, Math.max(1, devicePixelRatio)))'),
    'canvas backing store = CSS size × devicePixelRatio')

  // Speed: cache build (once per size) and per-frame cost
  const build = await ev('(() => { const i = spriteRenderer.ink, t0 = performance.now(); i._buildCache(i.w, i.h, i._dpr()); return performance.now() - t0 })()')
  console.log(`     cache build ${build.toFixed(1)} ms`)
  assert(build < 400, `layer cache builds in < 400 ms (${build.toFixed(0)} ms)`)
  const frame = await ev('spriteRenderer.ink.perf(90)')
  console.log(`     frame ${frame.toFixed(2)} ms`)
  assert(frame < 6, `a frame draws in < 6 ms (${frame.toFixed(2)} ms)`)

  // Every layout mode
  await both('overlay', 3)
  await shot('ink-overlay-window')
  await pick('expanded'); await both('expanded', 3)
  await pick('desktop'); await both('desktop', 3); await shot('ink-desktop-window')
  await pick('banner'); await both('banner', 4); await shot('ink-banner-window')
  await ev('document.getElementById("btn-unbanner")?.click()'); await sleep(300)
  await pick('overlay')

  // Phone portrait
  await emulate(390, 844)
  await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500)
  await both('phone', 2); await shot('ink-phone-window')
  await clearEmulation()
  await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400)

  // High-res stills for review (not screen captures: rendered at 3× straight from the engine)
  for (const [name, w, h, bt] of [['ink-still-idle', 300, 150, 0], ['ink-still-bt', 300, 150, 1], ['ink-still-banner-idle', 80, 56, 0], ['ink-still-banner-bt', 80, 56, 1]]) {
    savePng(name, await ev(`spriteRenderer.ink.still(${w}, ${h}, 4, ${T}, ${bt})`))
  }
  // Close-ups: the face and the sword hilt at 12× (what the eye reads first; the user reviews these)
  savePng('ink-still-face', await ev(`spriteRenderer.ink.still(300, 150, 12, ${T}, 0, [128, 4, 44, 44])`))
  savePng('ink-still-hilt', await ev(`spriteRenderer.ink.still(300, 150, 12, ${T}, 0, [190, 100, 44, 26])`))

  // Face slot options side by side (ink-faces-sheet.png): per style a 12× face close-up, the head + shoulders at 4×,
  // and the whole figure at real Overlay size (1×, enlarged without smoothing so the pixels are honest)
  const styles = await ev('spriteRenderer.ink.faceStyles()')
  assert(styles.length >= 1, `the art has ${styles.length} face styles (${styles.join(', ')})`)
  const sheet = await ev(`(async () => {
    const ink = spriteRenderer.ink, styles = ${JSON.stringify(styles)}
    const COL = 560, cv = document.createElement('canvas'); cv.width = COL * styles.length; cv.height = 40 + 528 + 20 + 360 + 20 + 300
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    for (const [i, st] of styles.entries()) {
      const x = i * COL + (COL - 528) / 2
      g.fillStyle = '#E8D9B0'; g.font = '22px Georgia, serif'; g.textAlign = 'center'
      g.fillText(ink.base.faces[st].label, i * COL + COL / 2, 28)
      g.drawImage(ink.stillCanvas(300, 150, 12, ${T}, 0, [128, 4, 44, 44], st), x, 40, 528, 528)
      g.drawImage(ink.stillCanvas(300, 150, 4, ${T}, 0, [105, 0, 90, 60], st), i * COL + 10, 588, 540, 360)
      g.imageSmoothingEnabled = false
      g.drawImage(ink.stillCanvas(300, 150, 1, ${T}, 0, null, st), i * COL + (COL - 600) / 2 + 20, 968, 520, 260)
      g.imageSmoothingEnabled = true
    }
    return cv.toDataURL('image/png')
  })()`)
  savePng('ink-faces-sheet', sheet)

  // Stages without ink art fall back to the classic sprite; Classic turns it off
  await ev('(() => { const gs = gameState, s = gs.get(); s.stageIndex = 12; gs._recalc(); gs._notify() })()'); await sleep(300)
  assert(!(await ev('spriteRenderer.isInk()')), 'a stage without ink art falls back to the classic sprite')
  await ev('(() => { const gs = gameState, s = gs.get(); s.stageIndex = 3; gs._recalc(); gs._notify() })()'); await sleep(300)
  assert(await ev('spriteRenderer.isInk()'), 'back at Qi Condensation → ink again')
  await ev('spriteRenderer.ink.resume()')
  await ev('gameState.setSetting("artStyle", "classic")'); await sleep(300)
  assert(!(await ev('spriteRenderer.isInk()')), 'Sprite art = Classic switches back')
}
