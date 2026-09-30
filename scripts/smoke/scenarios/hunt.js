// Real-app smoke scenario — Roam → Hunt + Roam → Bestiary (Phase 35 / A6-2, docs/systems/combat.md → "the Hunt"): the new
// sub-tabs exist, grounds show locks + odds, Track a beast starts a search with a live countdown, a finished search shows
// what it found (Fight it opens the battle page), and the Bestiary shows unseen silhouettes, seen kinds with learned
// habits + record, in Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/hunt-*.png, bestiary-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/hunt.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800) }
  const view = async v => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click(`[data-tab="${v}"]`); await sleep(500) }
  const set = code => ev(`(() => { const gs = gameState, s = gs.get(); ${code}; gs._recalc(); gs._notify() })()`)

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3; gameState.setSetting("artStyle", "ink") })()')
  // a mid-game hunter: stage 14, some kinds met (the fox fought + slain, the eagle bound, the tiger seen), others unseen
  const base = `s.stageIndex = 14; s.health = 100; s.spiritStones = 120; s.hunt = null; s.beastEncounters = []; s.family.fight = null
    s.bestiary = { spirit_fox: { seen: true, fought: 4, won: 3, lost: 1, slain: 2, spared: 1, habitsKnown: true, returning: 'grateful', variants: { crimson: true } },
      thunder_eagle: { seen: true, fought: 1, won: 1, bound: 1, habitsKnown: true, variants: { violet: true } }, white_tiger: { seen: true }, blood_python: { seen: true, fought: 1, lost: 1, habitsKnown: true } }`

  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await set(base)
    await view('hunt')
    assert(await ev('document.querySelectorAll("#tab-hunt .hunt-card").length === 5'), `${mode}: five hunting grounds`)
    assert(await ev('!!document.querySelector("#tab-hunt .hunt-card.locked .hunt-lock")'), `${mode}: a ground above your realm says when it opens`)
    await shot(`hunt-idle-${mode}`)
    await click('#tab-hunt [data-hunt-start="western_wilds"]'); await sleep(400)
    assert(await ev('gameState.get().hunt?.groundId === "western_wilds" && !!document.querySelector("#tab-hunt [data-hunt-left]")'), `${mode}: Track a beast starts a search with a countdown`)
    await shot(`hunt-tracking-${mode}`)
    await set('s.hunt.endsAt = Date.now() - 1'); await ev('gameState.tick(0.01)'); await sleep(600)
    assert(await ev('!!gameState.get().hunt?.found && !!document.querySelector("#tab-hunt .hunt-now.found [data-hunt-fight]")'), `${mode}: the search ends with a beast found`)
    await ev('document.querySelectorAll("#tab-hunt canvas.bp-canvas").forEach(() => {}); for (const P of BeastPortraits.pool.values()) P.ink.freeze(4)')
    await shot(`hunt-found-${mode}`)
    if (mode === 'desktop') {
      await click('#tab-hunt [data-hunt-fight]'); await sleep(500)
      assert(await ev('combatView.isOpen() && combatView.step === "prepare"'), 'Fight it opens the battle page')
      await ev('combatView.close()')
    }
    await set(base)   // re-apply the fixture: the hunt may have found a rare colour and shifted the counts
    await view('bestiary')
    assert(await ev('document.querySelectorAll("#tab-bestiary .bst-card").length === 10 && [5, 6].includes(document.querySelectorAll("#tab-bestiary .bst-card.unseen").length)'), `${mode}: ten kinds, the unmet ones unseen`)
    assert(await ev('document.querySelectorAll("#tab-bestiary .bst-var.met").length === 2 && document.querySelectorAll("#tab-bestiary .bst-var").length === 4'), `${mode}: the rare colours you met are named; the seen kinds without one say not yet seen`)
    assert(await ev('document.querySelector("#tab-bestiary .view-lede").textContent.includes("rare colours 2 of 10 met")'), `${mode}: the lede counts the rare colours met`)
    await sleep(300); await ev('for (const P of BeastPortraits.pool.values()) P.ink.freeze(4)')
    await shot(`bestiary-${mode}`)
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }

  // an early hunter: most grounds locked; an empty bestiary
  await pick('expanded')
  await set(`s.stageIndex = 2; s.spiritStones = 0; s.hunt = null; s.beastEncounters = []; s.beasts = []; s.bestiary = {}`)
  await view('hunt'); await shot('hunt-early-expanded')
  assert(await ev('document.querySelectorAll("#tab-hunt .hunt-card.locked").length === 4 && !document.querySelector("#tab-hunt [data-hunt-start=misty_foothills]").disabled'), 'stage 2: only the foothills are open (and free)')
  await view('bestiary'); await shot('bestiary-empty-expanded')
  assert(await ev('document.querySelectorAll("#tab-bestiary .bst-card.unseen").length === 10'), 'an empty bestiary: all silhouettes')
}
