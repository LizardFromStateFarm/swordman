// Real-app smoke scenario — task 1.23 (docs/systems/tutorial.md): the coach marks. A brand-new cultivator gets the HUD
// tour (spotlight on each control, Back / Next / Got it), then the first open of Roam → Explore plays its lesson; the
// first battle plays "Fighting" over the battle page (and the keyboard can't reach the fight); "Turn tips off" stops
// them and says where to turn them back on; Settings → Guide lists every lesson (seen / new / when it appears / lock
// reason for the sect views), replays one (opening its view), and "Show every tip again" restarts them. The HUD tour in
// Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/tutorial-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/tutorial.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  const tipUp = () => wait('!document.getElementById("tut-overlay").classList.contains("hidden")', 6000)
  const tipTitle = () => ev('document.querySelector("#tut-overlay .tut-title").textContent')
  const next = async () => { await click('#tut-overlay [data-tut-act="next"]'); await sleep(320) }
  const cardInView = () => ev(`(() => { const r = document.querySelector('#tut-overlay .tut-card').getBoundingClientRect()
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 })()`)
  // The card never covers the spotlit control
  const noCover = () => ev(`(() => { const h = document.querySelector('#tut-overlay .tut-hole'); if (h.classList.contains('none')) return true
    const a = h.getBoundingClientRect(), b = document.querySelector('#tut-overlay .tut-card').getBoundingClientRect()
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return ix <= 2 || iy <= 2 || (a.width * a.height > innerWidth * innerHeight * 0.3) })()`)

  await ev('localStorage.removeItem("ci:smoke-no-tips")')
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-new[data-slot="0"]\')', 10000)
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(500)
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'the first-launch layout tip goes before any coach mark')
  await ev('document.getElementById("layout-tip")?.click()')
  await pick('overlay')

  // ── The intro scroll comes first (2026-10-05; its own scenario: intro.js); skip it here ──
  await wait('!document.getElementById("intro-overlay").classList.contains("hidden")', 6000)
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'the intro plays before the HUD tour (no coach mark over it)')
  await click('#intro-overlay [data-intro="skip"]'); await sleep(300)

  // ── The HUD tour (Overlay) ──
  await tipUp()
  assert(await tipTitle() === 'Your cultivator', 'a new cultivator gets the HUD tour')
  assert(await ev('gameState.tutorialInfo().init && !!gameState.tutorialInfo().seen.hud'), 'the tour is marked seen as it starts')
  assert(await ev('document.querySelector("#tut-overlay [data-tut-act=back]").classList.contains("hidden")'), 'no Back on the first step')
  assert(await cardInView() && await noCover(), 'overlay: card inside the window, off the control')
  await shot('tutorial-overlay-1')
  const n = await ev('TUTORIAL_LESSONS.find(l => l.id === "hud").steps.length')
  let allIn = true, allClear = true
  for (let i = 1; i < n; i++) {
    await next()
    allIn = allIn && await cardInView(); allClear = allClear && await noCover()
    if (i === 5) await shot('tutorial-overlay-vitals')
  }
  assert(allIn && allClear, `overlay: all ${n} steps keep the card in the window and off the spotlit control`)
  assert(await ev('document.querySelector("#tut-overlay .tut-next").textContent') === 'Got it', 'the last step says Got it')
  assert(await ev('!document.querySelector("#tut-overlay .tut-hole").classList.contains("none")'), 'the last step spotlights the Settings button')
  await shot('tutorial-overlay-last')
  await click('#tut-overlay [data-tut-act="back"]'); await sleep(250)
  assert(await ev('document.querySelector("#tut-overlay .tut-count").textContent') === `${n - 1} / ${n}`, 'Back goes one step back')
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))'); await sleep(250)
  assert(await ev('document.querySelector("#tut-overlay .tut-count").textContent') === `${n} / ${n}`, 'the arrow key steps forward')
  await next()
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'Got it closes the tour')

  // ── A view lesson: the first open of Roam → Explore ──
  await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="explore"]')
  await tipUp()
  assert(await tipTitle() === 'Set out', 'the first open of Explore plays its lesson')
  await shot('tutorial-overlay-explore')
  await click('#tut-overlay [data-tut-act="skip"]'); await sleep(300)
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden") && !!gameState.tutorialInfo().seen.v_explore'), 'the close button ends a lesson (still marked seen)')
  await ev('tutorialUI.cur && tutorialUI._end()')
  await click('[data-tab="beasts"]'); await sleep(200); await click('[data-tab="explore"]'); await sleep(1200)
  assert(await ev('!tutorialUI.cur || tutorialUI.cur.lesson.id !== "v_explore"'), 'a seen lesson never plays again by itself')
  await ev('tutorialUI.cur && tutorialUI._end()')

  // ── Turn tips off from the card ──
  await click('[data-tab="hunt"]')
  await tipUp()
  await click('#tut-overlay [data-tut-act="off"]'); await sleep(300)
  assert(await ev('gameState.tutorialInfo().off'), 'Turn tips off switches them off')
  assert(await ev('/Settings → Guide/.test(document.getElementById("flash")?.textContent || document.body.innerText)'), 'and says where to turn them back on')
  await click('[data-tab="bestiary"]'); await sleep(1200)
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden") && !gameState.tutorialInfo().seen.v_bestiary'), 'with tips off a new view stays quiet')

  // ── The Guide (Settings) ──
  await click('#btn-settings'); await sleep(250)
  assert(await ev('!!document.querySelector("#settings-body .tut-guide-wrap") && document.querySelector("#settings-body .set-group").textContent === "Guide"'), 'Settings opens on the Guide')
  await click('#settings-body [data-tut-set="on"]'); await sleep(150)
  assert(await ev('!gameState.tutorialInfo().off'), 'the Guide turns tips back on')
  await shot('tutorial-overlay-guide-closed')
  await click('#settings-body [data-tut-set="fold"]'); await sleep(200)
  assert(await ev('document.querySelectorAll("#settings-body .tut-row").length === TUTORIAL_LESSONS.length'), 'All lessons lists every lesson')
  assert(await ev('[...document.querySelectorAll("#settings-body .tut-row.locked")].every(r => r.disabled && /sect first/.test(r.textContent))'), 'sect lessons you cannot open are locked with the reason')
  assert(await ev('/Seen/.test(document.querySelector("#settings-body [data-tut-play=hud]").textContent)'), 'a seen lesson says Seen')
  assert(await ev('/At your first battle/.test(document.querySelector("#settings-body [data-tut-play=battle]").textContent)'), 'an unmet unlock says when it appears')
  await shot('tutorial-overlay-guide')
  await ev('document.querySelector("#settings-body [data-tut-play=v_hall]").scrollIntoView({ block: "center" })'); await sleep(120)
  await shot('tutorial-overlay-guide-2')
  await click('#settings-body [data-tut-play="v_arts"]')
  await tipUp()
  assert(await ev('document.getElementById("settings-overlay").classList.contains("hidden") && nav.view === "arts"'.replace('nav.view', 'document.querySelector(".subtab.active").dataset.tab')), 'replay closes Settings and opens the lesson\'s view')
  assert(await tipTitle() === 'Four moves and a passive', 'and plays the lesson')
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))'); await sleep(250)
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'Escape skips')

  // ── The battle lesson over the battle page ──
  await ev(`(() => { const s = gameState.get(); s.health = 100; s.stageIndex = 14; s.inventory.beast_taming_talisman = 1
    s.beastEncounters = [{ id: 'tut_enc', typeId: 'white_tiger', traits: [], seenAt: Date.now() }]; gameState._recalc(); gameState._notify() })()`)
  await click('[data-tab="beasts"]'); await sleep(1500)
  if (!(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'))) await click('#tut-overlay [data-tut-act="skip"]')
  await click('#tab-beasts .beast-fight-btn[data-fight=tut_enc]'); await sleep(500)
  await click('#combat-panel .cb-stance.slay'); await sleep(400)
  await tipUp()
  assert(await tipTitle() === 'Your arts', 'the first battle plays Fighting over the battle page')
  const turn0 = await ev('gameState.get().family.fight?.turn ?? JSON.stringify(gameState.get().family.fight?.log?.length)')
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }))'); await sleep(300)
  assert(await ev('gameState.get().family.fight?.turn ?? JSON.stringify(gameState.get().family.fight?.log?.length)') === turn0, 'a key press under the card never plays a move')
  await ev('combatView.scene?.freeze?.(0)'); await shot('tutorial-overlay-battle')
  await next(); await next(); await next()
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'the battle lesson ends; the fight is yours')
  await ev('(() => { const s = gameState.get(); s.family.fight = null; combatView.step = "result"; combatView.close(); gameState._notify() })()'); await sleep(300)

  // ── The HUD tour in every layout ──
  for (const mode of ['expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await click('#tabs [data-group="cultivate"]'); await sleep(150); await click('[data-tab="stats"]'); await sleep(200)
    await ev('gameState.resetTutorials(); gameState.markTutorialSeen("v_stats"); gameState.markTutorialSeen("intro"); tutorialUI.cur && tutorialUI._end(); tutorialUI.readyAt = 0')
    await wait('tutorialUI.cur?.lesson.id === "hud"', 6000); await sleep(350)
    assert(await tipTitle() === 'Your cultivator', `${mode}: show every tip again restarts the tour`)
    assert(await cardInView() && await noCover(), `${mode}: card inside the window, off the control`)
    await shot(`tutorial-${mode}-1`)
    const bad = []
    for (let i = 1; i < n; i++) {
      await next()
      if (!(await cardInView() && await noCover())) bad.push(i + 1)
      if (i === 5) await shot(`tutorial-${mode}-vitals`)
      if (i === n - 2) await shot(`tutorial-${mode}-nav`)
    }
    assert(!bad.length, `${mode}: every step keeps the card in the window and off the control${bad.length ? ' — not step ' + bad : ''}`)
    await next()
    await click('#btn-settings'); await sleep(200)
    if (!(await ev('!!document.querySelector("#settings-body .tut-guide")'))) await click('#settings-body [data-tut-set="fold"]')
    await sleep(200); await shot(`tutorial-${mode}-guide`)
    await click('#settings-close'); await sleep(150)
  }
  await clearEmulation()
  await ev('localStorage.setItem("ci:smoke-no-tips", "1")')
}
