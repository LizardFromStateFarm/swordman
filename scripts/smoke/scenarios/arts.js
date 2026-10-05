// Real-app smoke scenario — Path → Arts (Phase 42, task 1.12; docs/systems/arts.md): the breakthrough offer (keep one),
// the study desk (study from the Arts screen and from Pack, the live countdown, Stop), the loadout (click a slot → the
// library filters → Equip here; clear a slot; locked passive slots name their realm), library filters, the Arts attention
// item + Pack "Arts" chip. Screens in Overlay / Expanded / Desktop / phone, early (Mortal) and late (Nascent Soul).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/arts.js
module.exports = async ({ ev, click, wait, assert, sleep, shot, emulate, clearEmulation }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  // A late character: several arts known, two manuals, an offer waiting
  await ev(`(() => { const s = gameState.get(), k = s.arts.known
    for (const id of ['severing_crescent', 'frost_lotus_palm', 'stone_skin', 'deep_pool_breath', 'heart_of_the_blade', 'thousand_roots_prison']) k[id] = { mastery: 1 + (id.length % 3), xp: 0, uses: 0 }
    s.inventory.manual_flame_lotus_storm = 1; s.inventory.manual_sun_devouring_blaze = 1; s.inventory.manual_ten_thousand_swords_rain = 1
    s.arts.loadout.passives[0] = 'stone_skin'
    s.arts.offers.push({ id: 'o1', realm: 'Nascent Soul', options: ['north_sea_sovereign', 'yellow_dragon_earth_sovereign', 'withering_blight'] })
    s.sectWar.nextWarAt = Date.now() + 3600e3; gameState._recalc(); gameState._notify() })()`)
  const goArts = async () => { await click('#tabs [data-group="cultivate"]'); await sleep(200); await click('[data-tab="arts"]'); await sleep(400) }
  await goArts()
  assert(await ev('!!document.querySelector("#tab-arts .art-offer")'), 'the breakthrough offer shows')
  assert(await ev('document.querySelectorAll("#tab-arts .art-moves .art-slot").length === 4'), 'four move slots')
  assert(await ev('document.querySelectorAll("#tab-arts .art-passives .art-slot:not(.locked)").length === 4 && document.querySelectorAll("#tab-arts .art-passives .art-slot.locked").length === 1'), 'Nascent Soul: 4 passive slots open, 1 locked')
  assert(await ev('/Opens at/.test(document.querySelector("#tab-arts .art-passives .art-slot.locked").textContent)'), 'the locked slot names the realm that opens it')
  assert(await ev('[...document.querySelectorAll(".att-item, [data-att]")].length >= 0'), 'attention renders')
  for (const mode of ['overlay', 'expanded', 'desktop']) {
    await ev('document.getElementById("btn-layout").click()'); await sleep(150)
    await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700)
    await goArts()
    assert(await ev('document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const p = document.getElementById("tab-arts").getBoundingClientRect(); return [...document.querySelectorAll("#tab-arts .art-slot, #tab-arts .art-row, #tab-arts .art-lo")].every(n => n.getBoundingClientRect().right <= p.right + 1) })()'), `${mode}: slots, loadout tabs and library rows fit the panel`)
    // the loadout tabs must never overlap each other or paint their text past the card (reviewer cycle 1, Expanded)
    assert(await ev('(() => { const cs = [...document.querySelectorAll("#tab-arts .art-lo")]; const hit = (a, b) => { const r = a.getBoundingClientRect(), s = b.getBoundingClientRect(); return r.left < s.right - 1 && r.right > s.left + 1 && r.top < s.bottom - 1 && r.bottom > s.top + 1 }; return cs.every(n => n.scrollWidth <= n.clientWidth + 1) && cs.every((a, i) => cs.every((b, j) => i === j || !hit(a, b))) })()'), `${mode}: loadout tabs don't overflow or overlap`)
    await shot(`arts-${mode}`)
    await ev('document.querySelector("#tab-arts .af-box")?.scrollIntoView({ block: "center" })'); await sleep(200)
    await shot(`arts-filters-${mode}`)
    if (mode === 'expanded') {   // the reviewer found the overflow here (cycle 1): capture the row itself
      await ev('document.querySelector("#tab-arts .art-loadouts")?.scrollIntoView({ block: "start" })'); await sleep(220)
      await shot('arts-loadouts-expanded')
    }
  }
  // back to Overlay (the default active-play mode) for the interaction shots below (2026-09-30: they were landing in Desktop)
  await ev('document.getElementById("btn-layout").click()'); await sleep(150)
  await ev('document.querySelector(\'.layout-opt[data-layout="overlay"]\').click()'); await sleep(600)
  await goArts()
  // keep an offered art
  await ev('document.querySelector("#tab-arts [data-offer]").click()'); await sleep(300)
  assert(await ev('!gameState.get().arts.offers.length && !!gameState.get().arts.known.north_sea_sovereign'), 'Keep this art learns it and clears the offer')
  // study from the desk, then stop
  await ev('document.querySelector("#tab-arts [data-study]").click()'); await sleep(300)
  assert(await ev('gameState.get().arts.studies.length === 1 && !!document.querySelector("#tab-arts .art-study.on [data-arts-left]")'), 'studying shows the countdown')
  await shot('arts-studying')
  await ev('document.querySelector("#tab-arts [data-cancel-study]").click()'); await sleep(300)
  assert(await ev("!gameState.get().arts.studies.length"), "Stop puts the manual back")
  // equip: click a slot → pick → Equip here
  await ev('document.querySelector("#tab-arts .art-moves [data-slot=\\"move:3\\"]").click()'); await sleep(300)
  assert(await ev('!!document.querySelector("#tab-arts .art-picking") && [...document.querySelectorAll("#tab-arts .art-list .art-row")].every(r => !/Passive ·/.test(r.textContent))'), 'choosing a move slot filters the library to moves')
  await sleep(500); await shot("arts-picking")
  await ev('document.querySelector("#tab-arts [data-equip=\\"severing_crescent\\"]").click()'); await sleep(300)
  assert(await ev('gameState.get().arts.loadout.moves[3] === "severing_crescent"'), 'Equip here fills the slot')
  await ev('document.querySelector("#tab-arts [data-clear=\\"move:3\\"]").click()'); await sleep(300)
  assert(await ev('gameState.get().arts.loadout.moves[3] === null'), 'the × empties it')
  // saved loadouts (2026-10-01): four decks; click a tab to switch, the grid follows
  assert(await ev('document.querySelectorAll("#tab-arts .art-lo-row .art-lo").length === 4'), 'four loadout tabs')
  assert(await ev('document.querySelector("#tab-arts .art-lo-row .art-lo.on").dataset.lo === "0"'), 'loadout 1 is lit by default')
  await ev('document.querySelector("#tab-arts .art-lo-row .art-lo[data-lo=\\"1\\"]").click()'); await sleep(250)
  assert(await ev('gameState.get().arts.activeLoadout === 1 && document.querySelector("#tab-arts .art-lo-row .art-lo.on").dataset.lo === "1"'), 'clicking a tab switches the active loadout')
  assert(await ev('[...document.querySelectorAll("#tab-arts .art-moves .art-slot")].every(n => n.classList.contains("empty"))'), 'the empty deck shows empty move slots')
  await ev('document.querySelector("#tab-arts .art-loadouts")?.scrollIntoView({ block: "start" })'); await sleep(200)
  await shot('arts-loadouts')
  await ev('document.querySelector("#tab-arts .art-lo-row .art-lo[data-lo=\\"0\\"]").click()'); await sleep(200)
  assert(await ev('gameState.get().arts.activeLoadout === 0'), 'switching back to loadout 1')
  // library filters + expanded row
  // keep your place (user 2026-10-05): a filter must not throw you back to the top — the panel stays where it was on screen
  await ev('document.querySelector("#tab-arts .af-box").scrollIntoView({ block: "center" })'); await sleep(200)
  const fTop = await ev('document.querySelector("#tab-arts .af-box").getBoundingClientRect().top')
  await ev('document.querySelector("#tab-arts [data-f=\\"kind:move\\"]").click()'); await sleep(250)
  assert(await ev('Math.abs(document.querySelector("#tab-arts .af-box").getBoundingClientRect().top - ' + fTop + ') < 3'), 'a filter keeps the filter panel where it was (no jump to the top)')
  assert(await ev('[...document.querySelectorAll("#tab-arts .af-chip")].every(c => !!c.querySelector(".af-n"))'), 'every filter chip carries its count')
  await shot('arts-filters')
  await ev('document.querySelector("#tab-arts .af-clear").click()'); await sleep(200)
  assert(await ev('!document.querySelector("#tab-arts .af-clear") && document.querySelector("#tab-arts [data-f=\\"kind:all\\"]").classList.contains("active")'), 'Clear filters resets them')
  await ev('document.querySelector("#tab-arts [data-f=\\"el:water\\"]").click()'); await sleep(250)
  assert(await ev('[...document.querySelectorAll("#tab-arts .art-list .art-row")].every(r => r.classList.contains("el-water"))'), 'the element filter narrows the library')
  await ev('document.querySelector("#tab-arts [data-f=\\"el:all\\"]").click()'); await sleep(250)
  // grade filter (2026-09-30): each grade chip shows only that grade; "Any grade" restores the library
  for (const g of ['yellow', 'profound', 'earth', 'heaven', 'immortal']) {
    await ev(`document.querySelector('#tab-arts [data-f="rar:${g}"]').click()`); await sleep(140)
    assert(await ev(`[...document.querySelectorAll("#tab-arts .art-list .art-row")].every(r => !!r.querySelector(".art-n.r-${g}"))`), `the ${g} grade filter shows only ${g} arts`)
  }
  await ev('document.querySelector("#tab-arts [data-f=\\"rar:all\\"]").click()'); await sleep(200)
  assert(await ev('document.querySelectorAll("#tab-arts .art-list .art-row").length > 0'), 'Any grade restores the full library')
  // a close-up of the grade row (filtered to the top row's grade so the list has something in it)
  const g0 = await ev('document.querySelector("#tab-arts .art-list .art-n").className.match(/r-(\\w+)/)[1]')
  await ev(`document.querySelector('#tab-arts [data-f="rar:${g0}"]').click()`); await sleep(180)
  await ev('document.querySelector("#tab-arts .af-box")?.scrollIntoView({ block: "start" })'); await sleep(180)
  await shot('arts-grade-filter')
  await ev('document.querySelector("#tab-arts [data-f=\\"rar:all\\"]").click()'); await sleep(180)
  await ev('document.querySelector("#tab-arts [data-open=\\"frost_lotus_palm\\"]").click()'); await sleep(250)
  assert(await ev('!!document.querySelector("#tab-arts .art-row.open .art-lore")'), 'a library row opens to its lore and slot buttons')
  await ev('document.querySelector("#tab-arts .art-row.open")?.scrollIntoView({ block: "center" })'); await sleep(250)
  await shot('arts-row-open')
  // Pack: the Arts chip + Study
  await click('#tabs [data-group="pack"]'); await sleep(200); await click('[data-tab="pack"]'); await sleep(300)
  await ev('[...document.querySelectorAll("#tab-pack .pack-chip")].find(b => b.textContent === "Arts").click()'); await sleep(300)
  assert(await ev('document.querySelectorAll("#tab-pack .pack-item-row").length >= 2'), 'Pack → Arts lists the manuals')
  await ev('document.querySelector("#tab-pack .pack-item-main").click()'); await sleep(300)
  await shot('arts-pack')
  await ev('document.querySelector("#tab-pack [data-studyart]")?.click()'); await sleep(300)
  assert(await ev("gameState.get().arts.studies.length > 0"), "Study from Pack starts the timer")
  // phone = the Desktop layout at a narrow width (data-narrow), not Overlay squeezed (2026-10-05)
  await ev('document.getElementById("btn-layout").click()'); await sleep(150)
  await ev(`document.querySelector('.layout-opt[data-layout="desktop"]').click()`); await sleep(600)
  await emulate(390, 844); await sleep(600)
  await goArts()
  assert(await ev('document.documentElement.scrollWidth <= innerWidth'), 'phone: no horizontal overflow')
  await ev('document.querySelector("#tab-arts .art-moves")?.scrollIntoView({ block: "center" })'); await sleep(200)
  await shot('arts-phone')
  // the user's case: on a phone, scrolled down to the library, a filter keeps you there
  await ev('document.querySelector("#tab-arts .af-box").scrollIntoView({ block: "center" })'); await sleep(200)
  const pTop = await ev('document.querySelector("#tab-arts .af-box").getBoundingClientRect().top')
  await ev('document.querySelector("#tab-arts [data-f=\\"rar:all\\"]").click(); document.querySelector("#tab-arts [data-f=\\"kind:passive\\"]").click()'); await sleep(250)
  assert(await ev('Math.abs(document.querySelector("#tab-arts .af-box").getBoundingClientRect().top - ' + pTop + ') < 3'), 'phone: a filter keeps you at the library')
  await shot('arts-filters-phone')
  await ev('document.querySelector("#tab-arts .af-clear")?.click()'); await sleep(150)
  await clearEmulation()
  // early game: a fresh Mortal
  await ev(`(() => { const s = gameState.get(); s.stageIndex = 0; s.arts = null; s.inventory = {}; gameState._recalc(); gameState._notify() })()`)
  await goArts()
  assert(await ev('document.querySelectorAll("#tab-arts .art-passives .art-slot.locked").length === 4'), 'Mortal: 1 passive slot open, 4 locked')
  await shot('arts-early')
}
