// Real-app smoke scenario — Phase 40b (docs/systems/soul-points.md → cinematic + finish screen). A successful Ascension
// Trial plays the full-window Immortal Ascension cinematic (stills per phase, frame time ≤ 6 ms), then the finish
// screen ("You have finished your race to immortality", +500 Soul Points, no version talk); Spend opens the Soul screen on
// top; Continue hands over to the interlude card. The Soul screen's "Relive it" replays it with a Return button and
// changes nothing; a second Immortal gets the short card (+150); Reduced motion is a 2 s fade; Banner peeks open.
// Screenshots: scripts/smoke/out/immortal-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/immortal.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await click('#btn-layout')
    await wait('!document.getElementById("layout-picker").classList.contains("hidden")')
    await click(`.layout-opt[data-layout="${mode}"]`)
    await sleep(800)
  }
  const ovOpen = () => ev('!document.getElementById("immortal-overlay").classList.contains("hidden")')
  const finShown = () => ev('document.getElementById("finish-box").classList.contains("shown")')
  const readyTrial = () => ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = CULTIVATION_STAGES.length - 2; s.maxStageThisLife = s.stageIndex
    s.health = 100; s.realmIntegrity = 100; s.bloodlineQuality = ASCENSION_MIN_BLOODLINE; gs._recalc(); s.qi = s.derived.qiCap; gs._recalc(); gs._notify() })()`)
  const ascend = async () => {
    await readyTrial(); await sleep(300)
    await click('#btn-breakthrough')
    await wait('!document.getElementById("ascension-overlay").classList.contains("hidden")')
    await ev('window._rnd = Math.random; Math.random = () => 0'); await click('#ascend-now'); await ev('Math.random = window._rnd')
    await wait('!document.getElementById("immortal-overlay").classList.contains("hidden")', 4000)
  }
  const toEnd = async () => { await ev('(() => { const c = immortalView.cine; c.frozen = false; c.t = Math.max(c.t, c.length - 0.05); if (!c.running) c._start() })()'); await wait('document.getElementById("finish-box").classList.contains("shown")', 4000); await sleep(1300) }
  const walkInterlude = async () => {
    for (let i = 0; i < 12 && !(await ev('document.getElementById("death-overlay").classList.contains("hidden")')); i++) {
      await ev(`(() => { const ok = document.getElementById('death-ok'); if (ok && !ok.disabled && ok.offsetParent) ok.click()
        else document.querySelector('#interlude-choices button:not([disabled])')?.click() })()`); await sleep(400)
    }
  }
  const box = on => ev(`document.getElementById('finish-box').style.visibility = '${on ? '' : 'hidden'}'`)   // stills of earlier moments hide it
  const PHASES = [[0.9, 'gathering'], [2.12, 'bolt1'], [3.52, 'bolt3'], [4.4, 'charged'], [5.6, 'rising'], [6.9, 'gate'], [7.8, 'enter'], [8.6, 'flash'], [10.6, 'afterglow']]

  // ── First Immortal ever ──
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()'); await sleep(400)
  await ev('(() => { const gs = gameState; gs._grantSoul("fail", 44, { chance: 0.48 }); gs._grantSoul("fail", 57, { chance: 0.74 }) })()')   // two earlier falls
  await ascend()
  assert(await ev('gameState.getSoul().v1Finished && gameState.get().lastReincarnation.soul.kind === "v1"'), 'first Immortal: the finish grant fired')
  assert(await ev('document.getElementById("death-overlay").classList.contains("hidden")'), 'the interlude card waits behind the cinematic')
  await sleep(1700)
  assert(!(await ev('document.getElementById("immortal-skip").classList.contains("hidden")')), 'Skip appears after 1.5 s')
  for (const [t, name] of PHASES) { await ev(`immortalView.cine.freeze(${t})`); await sleep(120); await shot(`immortal-overlay-${name}`) }
  const ms = await ev('immortalView.cine.perf(60)')
  assert(ms <= 6, `cinematic frame ${ms.toFixed(2)} ms (budget 6 ms, Overlay)`)
  await toEnd()
  const text = await ev('document.getElementById("finish-box").textContent.replace(/\\s+/g, " ")')
  assert(/finished your race to immortality/i.test(text), 'finish screen: "You have finished your race to immortality"')
  assert(!/\bv[12]\b|version/i.test(text), 'finish screen never mentions a version')
  assert(/\+500 Soul Points/.test(text) && /2 falls before this one/.test(text), 'finish screen: +500 Soul Points and the two earlier falls')
  await shot('immortal-finish-overlay')

  // ── Spend opens the Soul screen on top; Continue → the interlude ──
  await click('#finish-box [data-fin="spend"]'); await sleep(500)
  assert(await ev('!document.getElementById("soul-overlay").classList.contains("hidden")'), 'Spend Soul Points opens the Soul screen over the finish screen')
  assert(await ev('!!document.querySelector("#soul-box .soul-relive")'), 'Soul screen: a "Your ascension" row to relive it')
  await shot('immortal-finish-spend')
  await click('#soul-box [data-soul="close"]'); await sleep(200)
  assert(await ovOpen(), 'closing the Soul screen returns to the finish screen')

  for (const mode of ['expanded', 'desktop']) {
    await pick(mode); await sleep(300)
    await box(false)
    for (const [t, name] of [[0.9, 'gathering'], [2.12, 'bolt1'], [5.6, 'rising'], [6.9, 'gate'], [7.8, 'enter']]) {
      await ev(`immortalView.cine.freeze(${t})`); await sleep(150); await shot(`immortal-${mode}-${name}`)
    }
    await box(true)
    await ev('immortalView.cine.freeze(10.6)'); await sleep(150); await shot(`immortal-finish-${mode}`)
    if (mode === 'desktop') { const d = await ev('immortalView.cine.perf(60)'); assert(d <= 6, `cinematic frame ${d.toFixed(2)} ms (Desktop)`) }
  }
  await emulate(390, 844); await pick('desktop'); await sleep(500)
  await box(false)
  for (const [t, name] of [[2.12, 'bolt1'], [5.6, 'rising'], [6.9, 'gate']]) { await ev(`immortalView.cine.freeze(${t})`); await sleep(150); await shot(`immortal-phone-${name}`) }
  await box(true)
  await ev('immortalView.cine.freeze(10.6)'); await sleep(150); await shot('immortal-finish-phone')
  await clearEmulation(); await pick('overlay'); await sleep(300)

  await click('#finish-box [data-fin="continue"]'); await sleep(500)
  assert(!(await ovOpen()), 'Continue closes the finish screen')
  assert(!(await ev('document.getElementById("death-overlay").classList.contains("hidden")')), 'Continue hands over to the interlude card')
  await walkInterlude()

  // ── Relive from the Soul screen: changes nothing ──
  const before = await ev('JSON.stringify(gameState.getSoul())')
  await click('.tab[data-group="kin"]'); await click('.subtab[data-tab="hall"]'); await sleep(300)
  await click('#tab-hall .soul-door'); await sleep(400)
  await click('#soul-box .soul-relive'); await sleep(300)
  assert(await ovOpen(), 'Relive it replays the cinematic')
  await toEnd()
  assert(await ev('!!document.querySelector("#finish-box [data-fin=continue]") && !document.querySelector("#finish-box [data-fin=spend]")'), 'relive: a single Return button')
  await click('#finish-box [data-fin="continue"]'); await sleep(300)
  assert(!(await ovOpen()) && (await ev('JSON.stringify(gameState.getSoul())')) === before, 'relive changes nothing')

  // ── A later Immortal: the short card ──
  await ascend()
  await toEnd()
  const card = await ev('document.getElementById("finish-box").textContent.replace(/\\s+/g, " ")')
  assert(/Another Immortal/.test(card) && /\+150 Soul Points/.test(card), 'later Immortal: the short card with +150')
  await shot('immortal-card-overlay')
  await click('#finish-box [data-fin="continue"]'); await sleep(400); await walkInterlude()

  // ── Reduced motion: a 2 s fade ──
  await ev('gameState.setSetting("reducedMotion", true)'); await sleep(300)
  await click('.tab[data-group="kin"]'); await click('.subtab[data-tab="hall"]'); await click('#tab-hall .soul-door'); await sleep(300)
  await click('#soul-box .soul-relive'); await sleep(900)
  await shot('immortal-calm-mid')
  await wait('document.getElementById("finish-box").classList.contains("shown")', 3500)
  assert(true, 'Reduced motion: the finish screen arrives within ~2 s')
  await click('#finish-box [data-fin="continue"]'); await sleep(200)
  await ev('gameState.setSetting("reducedMotion", false)')

  // ── Banner: the popup peeks the window open ──
  await pick('banner'); await sleep(400)
  await ev('document.querySelector("#tab-hall .soul-door")?.click()'); await sleep(300)
  await ev('document.querySelector("#soul-box .soul-relive")?.click()'); await sleep(900)
  assert(await ev('document.body.dataset.layout !== "banner"'), 'Banner: the cinematic peeks the window open')
  await shot('immortal-banner-peek')
  await toEnd(); await click('#finish-box [data-fin="continue"]'); await sleep(600)
}
