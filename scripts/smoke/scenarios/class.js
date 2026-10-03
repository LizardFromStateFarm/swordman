// Real-app smoke scenario — Phase 28 / task 4.3 (docs/systems/living-world.md §6): World → Class and the person card's
// life fields. A founder's world is run ~70 game years on the light sim (so the class has risen, wed, been wounded and
// fallen), then: the attention item for fallen classmates, World → Class (you placed among them, Chosen marked, the
// fallen with their causes), a living Chosen classmate's card (span, chips, "Your classmate"), a fallen one's card, the
// news cleared once seen. Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/class-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/class.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // Seventy years of the world (quiet), then one told year so the log + the class news have something to say.
  await ev(`(() => { const s = gameState.get(), w = s.world, y0 = Math.floor(w.year)
    for (let y = y0 + 1; y <= y0 + 70; y++) { w.year = y + 0.01; s.age += 1; gameState._tickWorldSects(); gameState._lifeStep(y, true) }
    w.livesYear = y0 + 70
    const c = w.cohorts[gameState._lifeNo()], alive = c.ids.map(id => w.persons[id]).filter(p => p.alive !== false)
    const p = alive.find(x => !x.chosen) || alive[0]
    gameState._npcDies(p, y0 + 70, 'feud'); gameState._tellLives([{ k: 'died', p, cause: 'feud' }], gameState._lifeNo(), new Set())
    const inj = alive.find(x => x !== p && x.alive !== false && !x.chosen); if (inj) inj.injuredUntil = y0 + 80
    gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  assert(await ev('gameState.classNews() > 0'), 'a fallen classmate is news')
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "class-news" && i.view === "class")'), 'the attention list points at World → Class')

  const cardOpen = () => ev('!document.getElementById("person-overlay").classList.contains("hidden") && !!document.querySelector("#person-overlay .pc-pop")')
  const inWindow = () => ev(`(() => { const p = document.querySelector('#person-overlay .pc-pop'); if (!p) return false
    const r = p.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 })()`)
  const noHScroll = () => ev('(() => { const el = document.getElementById("tab-class"); return el.scrollWidth <= el.clientWidth + 1 })()')

  const pass = async tag => {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="class"]'); await sleep(350)
    assert(await ev('!!document.querySelector("#tab-class .cls-title")'), `${tag}: World → Class draws`)
    assert(await ev('!!document.querySelector("#tab-class .cls-row.you")'), `${tag}: you are placed among your class`)
    assert(await ev('document.querySelectorAll("#tab-class .cls-row.chosen").length >= 1'), `${tag}: Heaven's Chosen are marked`)
    assert(await ev('document.querySelectorAll("#tab-class .cls-row.dead").length >= 1 && /feud|road|beast|backlash/i.test(document.querySelector("#tab-class .cls-fallen").textContent)'), `${tag}: the fallen are listed with how they died`)
    assert(await noHScroll(), `${tag}: no sideways scroll`)
    assert(await ev('gameState.classNews() === 0'), `${tag}: seeing the class clears the news`)
    await shot(`class-${tag}-list`)
    await ev('document.querySelector("#tab-class .cls-fallen")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`class-${tag}-fallen`)
    await ev('document.getElementById("tab-class").scrollTop = 0'); await sleep(100)
    await click('#tab-class .cls-row.chosen:not(.dead) .pc-link'); await sleep(250)
    assert(await cardOpen(), `${tag}: a classmate's name opens their card`)
    assert(await ev('/Your classmate/.test(document.querySelector(".pc-pop .pc-sub").textContent) && /of ~\\d+/.test(document.querySelector(".pc-pop").textContent) && /Heaven’s Chosen/.test(document.querySelector(".pc-pop").textContent)'),
      `${tag}: the card says classmate, their span, Heaven's Chosen`)
    assert(await inWindow(), `${tag}: the card stays inside the window`)
    await shot(`class-${tag}-card`)
    await ev('PersonCard.close()'); await sleep(100)
    await click('#tab-class .cls-fallen .cls-row.dead .pc-link'); await sleep(250)
    assert(await cardOpen() && /Passed on/.test(await ev('document.querySelector(".pc-pop").textContent')), `${tag}: a fallen classmate's card says how and when`)
    if (tag === 'desktop') await shot(`class-${tag}-dead-card`)
    await ev('PersonCard.close()'); await sleep(100)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  // the event log names the death + cause
  await click('[data-tab="events"]'); await sleep(250)
  assert(await ev('/Your classmate .* is dead\\. Killed in a feud/.test(document.getElementById("tab-events").textContent)'), 'the event log tells the death and its cause')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
