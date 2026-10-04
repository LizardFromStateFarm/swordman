// Real-app smoke scenario — Phase 28 tasks 4.4 + 4.5 (docs/systems/living-world.md → "4.4 + 4.5 as built"): the
// person card's "Their life now" (activity, a feud, ties) and the "known face" marker where the world casts people to
// you: the matchmaker's suitors, the arena rosters and the recruits at your gate. A founder's world runs ~120 game years
// with the heavy tier, a feud is forced on a classmate, a classmate is offered as a suitor, then: World → Class → the
// classmate's card; the proposal overlay; Roam → Arena; Sect → Disciples. Overlay / Expanded / Desktop / phone.
// Screenshots: scripts/smoke/out/heavy-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/heavy.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // 120 years of the world with the heavy tier; then a classmate carries a feud and is busy; another is offered as a suitor.
  const setup = await ev(`(() => { const s = gameState.get(), w = s.world, y0 = Math.floor(w.year)
    for (let y = y0 + 1; y <= y0 + 120; y++) { w.year = y + 0.01; s.age += 1; gameState._tickWorldSects(); gameState._lifeStep(y, true); for (let k = 0; k < 4; k++) gameState._heavyStep(y * 4 + k, true) }
    w.livesYear = y0 + 120; w.seasonAt = (y0 + 120) * 4 + 3
    const life = gameState._lifeNo(), mates = w.cohorts[life].ids.map(id => w.persons[id]).filter(p => p.alive !== false && (!p.owner || p.owner === 'world'))
    const a = mates[0], foe = Object.values(w.persons).find(p => p.alive !== false && p !== a && (!p.owner || p.owner === 'world') && !p.cohort)
    a.feud = { pid: foe.id, why: 'their sibling ' + Persons.fullName(foe) .split(' ')[0] + ' Yun', y: y0 + 100 }
    a.ties = { ...(a.ties || {}), [foe.id]: -90 }
    const friend = mates[1]; a.ties[friend.id] = 100; friend.ties = { ...(friend.ties || {}), [a.id]: 100 }
    a.tier = 'heavy'; a.act = { k: 'roam', loc: LOCATIONS[2].id, until: Math.floor(w.year * 4) + 3 }
    const b = mates.find(p => p !== a && p !== friend && !(p.spouseIds || []).length) || mates[2]
    b.fam = 4
    s.family.proposal = { suitors: [gameState._castCopy(b, 'suitor'), gameState._rollStranger('suitor', [b.id])], year: Math.floor(w.year) }
    gameState._recalc(); gameState._notify()
    return { a: a.id, b: b.id } })()`)
  await sleep(500)
  assert(!!setup?.a, 'a classmate carries a feud and a sworn tie')

  // The proposal overlay opens on its own: the classmate is marked
  await sleep(300)
  assert(await ev('!document.getElementById("proposal-overlay").classList.contains("hidden")'), 'the matchmaker\'s offer opens')
  assert(await ev('/Your classmate/.test(document.getElementById("proposal-suitors").textContent) && !!document.querySelector("#proposal-suitors .pc-known")'), 'the suitor who is your classmate is marked')
  await shot('heavy-overlay-proposal')
  await ev('document.getElementById("proposal-overlay").classList.add("hidden")'); await sleep(150)

  const cardOpen = () => ev('!document.getElementById("person-overlay").classList.contains("hidden") && !!document.querySelector("#person-overlay .pc-pop")')
  const inWindow = () => ev(`(() => { const p = document.querySelector('#person-overlay .pc-pop'); if (!p) return false
    const r = p.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 })()`)

  const pass = async tag => {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="class"]'); await sleep(350)
    await ev(`PersonCard.open(${JSON.stringify(setup.a)}, document.querySelector('#tab-class .cls-title'))`); await sleep(300)
    assert(await cardOpen(), `${tag}: the classmate's card opens`)
    assert(await ev('/Their life now/.test(document.querySelector(".pc-pop").textContent) && /Roaming the/.test(document.querySelector(".pc-pop .pc-act").textContent)'), `${tag}: "Their life now" says what they are doing`)
    assert(await ev('/Sworn to avenge/.test(document.querySelector(".pc-pop .pc-feud").textContent) && !!document.querySelector(".pc-pop .pc-feud .pc-link")'), `${tag}: the feud names who and why, tappable`)
    assert(await ev('document.querySelectorAll(".pc-pop .pc-tie").length >= 2 && /Sworn/.test(document.querySelector(".pc-pop .pc-ties").textContent)'), `${tag}: ties (sworn, blood feud) listed`)
    assert(await inWindow(), `${tag}: the card stays inside the window`)
    await shot(`heavy-${tag}-card`)
    await ev('PersonCard.close()'); await sleep(100)
    // the arena: known faces in the rings
    await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="arena"]'); await sleep(400)
    const known = await ev('document.querySelectorAll("#tab-arena .pc-known").length')
    assert(await ev('document.querySelectorAll("#tab-arena .ar-row").length > 0'), `${tag}: the arena draws (${known} known faces marked)`)
    if (known) { await ev('document.querySelector("#tab-arena .pc-known").scrollIntoView({ block: "center" })'); await sleep(150) }
    await shot(`heavy-${tag}-arena`)
    // the gate's recruits
    await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-disciples"]'); await sleep(400)
    assert(await ev('document.querySelectorAll("#tab-sect-disciples .sv-cand").length > 0'), `${tag}: recruits wait at the gate`)
    const rk = await ev('document.querySelectorAll("#tab-sect-disciples .sv-cand .pc-link").length')
    assert(rk > 0, `${tag}: recruits drawn from the world have tappable names (${rk})`)
    assert(await ev('/Your classmate/.test(document.querySelector("#tab-sect-disciples .sv-cand .pc-known")?.textContent || "")'), `${tag}: a classmate at the gate carries the pill`)
    await ev('document.querySelector("#tab-sect-disciples .sv-cand")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`heavy-${tag}-recruits`)
  }
  // a fresh gate drawn from the world (the founder preset's pool predates 4.5)
  await ev('gameState._refreshRecruitPool(); gameState._notify()')
  // and one of them a classmate without a sect (the gate's known-face pill)
  await ev(`(() => { const s = gameState.get(), w = s.world, mate = w.cohorts[gameState._lifeNo()].ids.map(id => w.persons[id]).find(p => p.alive !== false && (!p.owner || p.owner === 'world') && p.id !== ${JSON.stringify(setup.a)} && p.id !== ${JSON.stringify(setup.b)})
    mate.sectId = null; mate.sectRole = null; mate.role = 'wanderer'
    s.ownSect.recruitPool[0] = { id: 'dsmoke1', pid: mate.id, name: Persons.fullName(mate), talent: 3 }; gameState._notify() })()`)
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
