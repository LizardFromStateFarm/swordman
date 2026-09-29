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

  // High-res stills for review (not screen captures: rendered at 4× straight from the engine)
  for (const [name, w, h, bt] of [['ink-still-idle', 300, 150, 0], ['ink-still-bt', 300, 150, 1], ['ink-still-banner-idle', 80, 56, 0], ['ink-still-banner-bt', 80, 56, 1]]) {
    savePng(name, await ev(`spriteRenderer.ink.still(${w}, ${h}, 4, ${T}, { bt: ${bt} })`))
  }
  // Close-ups: the face and the sword hilt at 12× (what the eye reads first; the user reviews these)
  savePng('ink-still-face', await ev(`spriteRenderer.ink.still(300, 150, 12, ${T}, { crop: [128, 4, 44, 44] })`))
  savePng('ink-still-hilt', await ev(`spriteRenderer.ink.still(300, 150, 12, ${T}, { crop: [190, 100, 44, 26] })`))
  // The failure moment (A3-2): cracked halo + strained face, and the demotion (halo shatters and falls)
  savePng('ink-still-fail', await ev(`spriteRenderer.ink.still(300, 150, 4, ${T}, { fail: 0.75 })`))
  savePng('ink-still-demote', await ev(`spriteRenderer.ink.still(300, 150, 4, ${T}, { fail: 0.45, demote: true })`))
  savePng('ink-still-face-bt', await ev(`spriteRenderer.ink.still(300, 150, 12, ${T}, { bt: 1, crop: [128, 4, 44, 44] })`))
  savePng('ink-still-face-strain', await ev(`spriteRenderer.ink.still(300, 150, 12, ${T}, { fail: 0.8, crop: [128, 4, 44, 44] })`))

  // Part slots (A3-2): every option of every slot on the default figure (ink-slots-sheet.png, one row per slot)
  const kinds = ['face', 'hair', 'robe', 'weapon', 'aura']
  const options = await ev(`(() => { const o = {}; for (const k of ${JSON.stringify(kinds)}) o[k] = InkRenderer.slotOptions(k); return o })()`)
  for (const k of kinds) assert(options[k].length >= 3, `slot ${k}: ${options[k].length} options (${options[k].join(', ')})`)
  const sheet = await ev(`(() => {
    const ink = spriteRenderer.ink, kinds = ${JSON.stringify(kinds)}, options = ${JSON.stringify(options)}
    const crops = { face: [128, 4, 44, 44], hair: [118, 0, 64, 72], robe: [84, 20, 136, 108], weapon: [80, 92, 156, 36], aura: [30, 0, 240, 150] }
    const CW = 480, CH = 300, cols = Math.max(...kinds.map(k => options[k].length))
    const cv = document.createElement('canvas'); cv.width = 140 + CW * cols; cv.height = kinds.length * (CH + 44)
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    g.font = '20px Georgia, serif'; g.fillStyle = '#E8D9B0'
    kinds.forEach((k, r) => {
      const y0 = r * (CH + 44)
      g.textAlign = 'left'; g.fillText(k, 16, y0 + 44 + CH / 2)
      options[k].forEach((opt, c) => {
        const cr = crops[k], sc = Math.min(CW / cr[2], CH / cr[3])
        const im = ink.stillCanvas(300, 150, sc, ${T}, { crop: cr, slots: { [k]: opt } })
        const x = 140 + c * CW + (CW - im.width) / 2
        g.drawImage(im, x, y0 + 40 + (CH - im.height) / 2)
        g.textAlign = 'center'; g.fillText(INK_PARTS[k][opt].label, 140 + c * CW + CW / 2, y0 + 28)
      })
    })
    return cv.toDataURL('image/png')
  })()`)
  savePng('ink-slots-sheet', sheet)

  // The breakthrough moment is held against the per-notify stage state (the 1.8c "breakthrough never displays" bug)
  await ev('spriteRenderer.ink.resume(); spriteRenderer.setState("breakthrough"); spriteRenderer.setState("meditating")')
  assert(await ev('spriteRenderer.ink.btTarget === 1'), 'a stage-state notify right after a breakthrough does not cancel the moment')
  await ev('spriteRenderer.triggerFailure(false)')
  assert(await ev('spriteRenderer.ink.fail > 0.9 && spriteRenderer.ink.btTarget === 0'), 'triggerFailure starts the collapse and drops the breakthrough glow')
  await sleep(2200)
  assert(await ev('spriteRenderer.ink.fail === 0'), 'the failure moment fades out by itself (~1.8 s)')

  // A4-1: every cultivation stage has ink art now (realm variants) — walk them all in the real app
  const nStages = await ev('CULTIVATION_STAGES.length')
  const missing = []
  for (let i = 0; i < nStages; i++) {
    await ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = ${i}; gs._recalc(); gs._notify() })()`); await sleep(120)
    if (!(await ev('spriteRenderer.isInk()'))) missing.push(i)
  }
  assert(missing.length === 0, `every stage (${nStages}) renders in ink${missing.length ? ' — missing: ' + missing.join(', ') : ''}`)
  // one in-app capture per realm art (Overlay), at the frozen moment
  const firstOf = st => ev(`CULTIVATION_STAGES.findIndex(s => s.spriteState === '${st}')`)
  for (const [name, idx] of [['mortal', 0], ['foundation', await firstOf('meditating_deep')], ['core', await firstOf('levitating')], ['nascent', await firstOf('transcending')], ['severing', await firstOf('severing')], ['ascension', nStages - 1]]) {
    await ev(`(() => { spriteRenderer.holdUntil = 0; const gs = gameState, s = gs.get(); s.automation.autoBreakthrough = false; s.qi = 0; s.stageIndex = ${idx}; gs._recalc(); gs._notify() })()`); await sleep(250)
    await ev(`spriteRenderer.ink.freeze(${T}, 0)`); await sleep(120); await shot(`ink-realm-${name}`, await canvasClip(3))
  }
  const fr = await ev('(() => { const i = spriteRenderer.ink; i._buildCache(i.w, i.h, i._dpr()); return i.perf(90) })()')
  assert(fr < 6, `the heaviest realm (Ascension: 3 dragons, 11 swords, lotus, ribbons) draws in < 6 ms (${fr.toFixed(2)} ms)`)

  // Realm sheet: every realm variant rendered straight from the engine at 3×, idle row + breakthrough row
  // the first stage of each sprite state (one per realm)
  const realms = await ev('(() => { const out = [], seen = new Set(); CULTIVATION_STAGES.forEach((s, i) => { if (!seen.has(s.spriteState)) { seen.add(s.spriteState); out.push([s.spriteState, i]) } }); return out })()')
  const realmSheet = await ev(`(() => {
    const realms = ${JSON.stringify(realms)}, W = 900, H = 450
    const cv = document.createElement('canvas'); cv.width = W * 3; cv.height = (H + 40) * 2 * Math.ceil(realms.length / 3)
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    g.font = '24px Georgia, serif'; g.fillStyle = '#E8D9B0'; g.textAlign = 'center'
    realms.forEach(([state, idx], n) => {
      const r = new InkRenderer(document.createElement('canvas')), st = CULTIVATION_STAGES[idx]
      r.setStageColor(st.color); r.base = InkRenderer.resolve(state); r.art = r._effective()
      const col = n % 3, row = Math.floor(n / 3) * 2
      for (const bt of [0, 1]) {
        const im = r.stillCanvas(300, 150, 3, ${T}, { bt })
        g.drawImage(im, col * W, (row + bt) * (H + 40) + 40)
        g.fillText(st.realm + ' · ' + st.layer + (bt ? ' — breakthrough' : ''), col * W + W / 2, (row + bt) * (H + 40) + 30)
      }
    })
    return cv.toDataURL('image/png')
  })()`)
  savePng('ink-realms-sheet', realmSheet)

  // A4-3 motion sheet: the moving backgrounds at three moments each (falling water, drifting clouds + birds, the turning
  // earth, flaring stars) — stills cannot show motion, so this is what a reviewer looks at for it
  const motionSheet = await ev(`(() => {
    const rows = [['meditating', [2.1, 2.5, 2.9]], ['meditating_deep', [2.1, 2.5, 2.9]], ['levitating', [0, 4, 8]], ['transcending', [0, 5, 10]], ['severing', [0, 40, 80]], ['ascended', [0.6, 1.4, 3.3]]]
    const W = 600, H = 300
    const cv = document.createElement('canvas'); cv.width = W * 3; cv.height = (H + 32) * rows.length
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    g.font = '18px Georgia, serif'; g.fillStyle = '#E8D9B0'; g.textAlign = 'center'
    rows.forEach(([state, ts], ri) => {
      const st = CULTIVATION_STAGES.find(s => s.spriteState === state), r = new InkRenderer(document.createElement('canvas'))
      r.setStageColor(st.color); r.base = InkRenderer.resolve(state); r.art = r._effective()
      ts.forEach((tt, ci) => {
        g.drawImage(r.stillCanvas(300, 150, 2, tt), ci * W, ri * (H + 32) + 32)
        g.fillText(st.realm + ' — t = ' + tt + ' s', ci * W + W / 2, ri * (H + 32) + 24)
      })
    })
    return cv.toDataURL('image/png')
  })()`)
  savePng('ink-motion-sheet', motionSheet)

  // A4-3 death moment: 'fall' (ash on the wind) at Qi Condensation + Nascent Soul, 'ascend' (gold light) at Ascension,
  // each at four points of the moment; plus a live check that triggerDeath runs to 1 and clearDeath brings the figure back
  const deathSheet = await ev(`(() => {
    const rows = [['meditating', 3, 'fall'], ['transcending', CULTIVATION_STAGES.findIndex(s => s.spriteState === 'transcending'), 'fall'], ['ascended', CULTIVATION_STAGES.length - 1, 'ascend']]
    const ds = [0.15, 0.4, 0.65, 1], W = 600, H = 300
    const cv = document.createElement('canvas'); cv.width = W * ds.length; cv.height = (H + 36) * rows.length
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    g.font = '18px Georgia, serif'; g.fillStyle = '#E8D9B0'; g.textAlign = 'center'
    rows.forEach(([state, idx, kind], ri) => {
      const r = new InkRenderer(document.createElement('canvas')), st = CULTIVATION_STAGES[idx]
      r.setStageColor(st.color); r.base = InkRenderer.resolve(state); r.art = r._effective(); r.deathKind = kind
      ds.forEach((d, ci) => {
        g.drawImage(r.stillCanvas(300, 150, 2, ${T}, { death: d, deathKind: kind, bt: kind === 'ascend' ? d : 0 }), ci * W, ri * (H + 36) + 36)
        g.fillText(st.realm + ' — ' + kind + ' ' + Math.round(d * 100) + '%', ci * W + W / 2, ri * (H + 36) + 26)
      })
    })
    return cv.toDataURL('image/png')
  })()`)
  savePng('ink-death-sheet', deathSheet)
  await ev('spriteRenderer.ink.resume(); spriteRenderer.ink.triggerDeath("fall")'); await sleep(3800)
  assert(await ev('spriteRenderer.ink.death === 1'), 'triggerDeath plays to the end in real time')
  await ev('spriteRenderer.clearDeath()')
  assert(await ev('spriteRenderer.ink.death === 0'), 'clearDeath brings the figure back')

  await ev('(() => { const gs = gameState, s = gs.get(); s.stageIndex = 3; gs._recalc(); gs._notify() })()'); await sleep(300)
  assert(await ev('spriteRenderer.isInk()'), 'back at Qi Condensation → ink again')
  await ev('spriteRenderer.ink.resume()')
  await ev('gameState.setSetting("artStyle", "classic")'); await sleep(300)
  assert(!(await ev('spriteRenderer.isInk()')), 'Sprite art = Classic switches back')
}
