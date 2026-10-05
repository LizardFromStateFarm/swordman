// Real-app smoke scenario — the intro ink scroll (docs/systems/tutorial.md → "The intro", 2026-10-05): a brand-new
// cultivator on a fresh install gets the five cards before the HUD tour (Back hidden on card 1, Next / tap / → step on,
// ← steps back, the last says Begin and hides Skip, Begin closes it and the HUD tour follows); Esc skips; replay from
// Settings → Guide reopens it; a veteran install never gets it forced. Every card in Overlay / Expanded / Desktop /
// phone stays inside the window with nothing clipped. Screenshots: out/intro-<mode>-<n>.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/intro.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  const up = () => ev('!document.getElementById("intro-overlay").classList.contains("hidden")')
  const title = () => ev('document.querySelector("#intro-overlay .intro-title").textContent')
  const next = async () => { await click('#intro-overlay [data-intro="next"]'); await sleep(500) }
  // Nothing clipped: the column, its text and buttons sit inside the window; no element of the column overflows it
  const fits = () => ev(`(() => { const c = document.querySelector('#intro-overlay .intro-col').getBoundingClientRect()
    const ok = c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5
    const kids = [...document.querySelectorAll('#intro-overlay .intro-col *, #intro-overlay .intro-skip')].filter(n => n.getClientRects().length)
    return ok && kids.every(n => { const r = n.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && n.scrollWidth <= n.clientWidth + 1 }) })()`)

  await ev('localStorage.removeItem("ci:smoke-no-tips")')
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-new[data-slot="0"]\')', 10000)
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await pick('overlay')

  // ── First play: before the HUD tour ──
  await wait('!document.getElementById("intro-overlay").classList.contains("hidden")', 6000)
  assert(await title() === 'The Nine Provinces' && await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'a new cultivator gets the intro first, with no coach mark over it')
  assert(await ev('gameState.tutorialInfo().seen.intro != null'), 'the intro is marked seen as it starts')
  assert(await ev('document.querySelector("#intro-overlay [data-intro=back]").classList.contains("hidden")'), 'no Back on the first card')
  await click('#intro-overlay .intro-text'); await sleep(500)
  assert(await title() === 'An awakening', 'a tap on the page steps on')
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))'); await sleep(400)
  assert(await title() === 'The Nine Provinces', '← steps back')
  for (let i = 0; i < 4; i++) await next()
  assert(await title() === 'The peak' && await ev('document.querySelector("#intro-overlay .intro-next").textContent') === 'Begin', 'the last card says Begin')
  assert(await ev('document.querySelector("#intro-overlay .intro-skip").classList.contains("hidden")'), 'no Skip on the last card')
  await next()
  assert(!await up(), 'Begin closes the intro')
  await wait('!document.getElementById("tut-overlay").classList.contains("hidden")', 6000)
  assert(await ev('document.querySelector("#tut-overlay .tut-title").textContent') === 'Your cultivator', 'the HUD tour follows')
  await click('#tut-overlay [data-tut-act="skip"]'); await sleep(300)

  // ── Every card in every mode (replayed through the Guide's API) ──
  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await ev('tutorialUI.play("intro", true)'); await sleep(500)
    let allFit = true
    for (let n = 1; n <= 5; n++) {
      allFit = allFit && await fits()
      await shot(`intro-${mode}-${n}`)
      if (n < 5) await next()
    }
    assert(allFit, `${mode}: every card fits the window, nothing clipped`)
    await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))'); await sleep(300)
    assert(!await up(), `${mode}: Esc closes it`)
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(300) }
  }

  // ── The Guide lists it ──
  await pick('expanded')
  await click('#btn-settings'); await sleep(400)
  await click('.tut-guide-toggle'); await sleep(300)
  assert(await ev('!!document.querySelector(\'.tut-row[data-tut-play="intro"]\')'), 'Settings → Guide lists the intro to replay')
  await shot('intro-guide')
  await click('.tut-row[data-tut-play="intro"]'); await sleep(600)
  assert(await up() && await title() === 'The Nine Provinces', 'replay from the Guide opens it at the first card')
  await click('#intro-overlay [data-intro="skip"]'); await sleep(300)
}
