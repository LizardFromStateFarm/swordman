// Real-app smoke scenario — the Spiritual Root coach marks (docs/systems/tutorial.md, 2026-10-05): Path → Character's
// lesson spotlights the root chip (what a root does, then "brew a root elixir in Pack → Craft → Elixirs"), and the Craft
// lesson spotlights the Elixirs tab. Replayed from the Guide API in Overlay / Expanded / Desktop / phone; asserts the
// spotlight lands on the right control and the card stays in the window, off it. Screenshots: out/tutorial-root-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/tutorial-root.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  const tipUp = () => wait('!document.getElementById("tut-overlay").classList.contains("hidden")', 6000)
  const title = () => ev('document.querySelector("#tut-overlay .tut-title").textContent')
  const next = async () => { await click('#tut-overlay [data-tut-act="next"]'); await sleep(350) }
  const holeOn = sel => ev(`(() => { const h = document.querySelector('#tut-overlay .tut-hole'), t = document.querySelector('${sel}')
    if (!t || h.classList.contains('none')) return false
    const a = h.getBoundingClientRect(), b = t.getBoundingClientRect()
    return a.left <= b.left + 1 && a.top <= b.top + 1 && a.right >= b.right - 1 && a.bottom >= b.bottom - 1 })()`)
  const cardOk = () => ev(`(() => { const c = document.querySelector('#tut-overlay .tut-card').getBoundingClientRect(), h = document.querySelector('#tut-overlay .tut-hole').getBoundingClientRect()
    const inWin = c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5
    const ix = Math.min(c.right, h.right) - Math.max(c.left, h.left), iy = Math.min(c.bottom, h.bottom) - Math.max(c.top, h.top)
    return inWin && (ix <= 2 || iy <= 2) })()`)

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')

  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    // Path → Character: step 2 = the root, step 3 = where to make it better
    await ev('tutorialUI.play("v_stats", true)'); await tipUp(); await sleep(200)
    await next()
    assert(await title() === 'Your Spiritual Root' && await holeOn('#tab-stats .ch-tag.root') && await cardOk(), `${mode}: the root chip is spotlit and explained`)
    await shot(`tutorial-root-${mode}-root`)
    await next()
    assert(await title() === 'A better root' && /Pack → Craft → Elixirs/.test(await ev('document.querySelector("#tut-overlay .tut-text").textContent')), `${mode}: it says where to brew a better root`)
    await shot(`tutorial-root-${mode}-better`)
    await next()
    // Pack → Craft: the Elixirs tab
    await ev('tutorialUI.play("v_craft", true)'); await tipUp(); await sleep(200)
    await next()
    assert(await title() === 'Root elixirs' && await holeOn('#tab-craft .craft-subtab[data-sub="elixirs"]') && await cardOk(), `${mode}: the Elixirs tab is spotlit`)
    await shot(`tutorial-root-${mode}-elixirs`)
    await next()
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(300) }
  }
}
