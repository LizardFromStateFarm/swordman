// Real-app smoke scenario — Phase 28 / task 4.7 (docs/systems/living-world.md → "4.7 as built"): World → People and the
// tappable names in the Events log. A founder's world runs ~70 game years on the light sim; one classmate is pinned and
// has fresh news, one holds a grudge and has sworn vengeance on you, and a log line names a classmate. Then, in each
// layout: the attention item for news of the pinned, World → People (chips, rows, the fresh dot, the pin count),
// Grudges, search (focus kept across a state change), a row opens the card inline (beside the list when wide, in place
// with "All people" when narrow), a name inside it steps through + Back, the star pins/unpins, and a log name opens the
// popover card. Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/people-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/people.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  await ev(`(() => { const s = gameState.get(), w = s.world, y0 = Math.floor(w.year)
    for (let y = y0 + 1; y <= y0 + 70; y++) { w.year = y + 0.01; s.age += 1; gameState._tickWorldSects(); gameState._lifeStep(y, true) }
    w.livesYear = y0 + 70
    gameState.notePeopleSeen()
    const c = w.cohorts[gameState._lifeNo()], alive = c.ids.map(id => w.persons[id]).filter(p => p.alive !== false)
    const fol = alive.find(p => p.chosen) || alive[0], foe = alive.find(p => p !== fol && !p.chosen) || alive[1], named = alive.find(p => p !== fol && p !== foe)
    gameState.togglePin(fol.id)
    gameState._chron({ k: 'rise', t: gameState._chronText('rise', fol), p: [fol.id], n: true })
    foe.rel = -55; foe.feud = { pid: s.self.id, why: 'their brother', y: y0 + 69 }
    gameState.addEvent({ type: 'neutral', text: 'On the road you passed ' + require_name(named) + ', who bowed and went on.' })
    function require_name(p) { return Persons.fullName(p) }
    window.__pp = { fol: fol.id, foe: foe.id, named: named.id, folName: Persons.fullName(fol), foeName: Persons.fullName(foe) }
    gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  assert(await ev('gameState.peopleNews() > 0'), 'news of a pinned person counts')
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "people-news" && i.view === "people")'), 'the attention list points at World → People')

  const tab = () => ev('document.getElementById("tab-people")')
  const noHScroll = async () => { const r = await ev('(() => { const el = document.getElementById("tab-people"); if (el.scrollWidth <= el.clientWidth + 1) return true; const R = el.getBoundingClientRect().right; return [...el.querySelectorAll("*")].filter(x => x.getBoundingClientRect().right > R + 1).map(x => x.tagName + "." + x.className + ":" + Math.round(x.getBoundingClientRect().right - R)).slice(0, 5).join(" | ") })()'); if (r !== true) console.log("  overflow:", r); return r === true }
  const wide = () => ev('!!document.querySelector("#tab-people .pp-body.wide")')

  const pass = async tag => {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="people"]'); await sleep(350)
    await ev('(() => { PeopleView.open = null; PeopleView.trail = []; PeopleView.filter = "all"; PeopleView.q = ""; const i = document.querySelector("[data-pp-q]"); if (i) i.value = ""; PeopleView._body(true) })()'); await sleep(150)
    assert(await ev('!!document.querySelector("#tab-people .pp-view .cls-title")'), `${tag}: World → People draws`)
    assert(await ev('document.querySelectorAll("#tab-people .pp-row").length >= 10'), `${tag}: the people you know are listed`)
    assert(await ev('!!document.querySelector("#tab-people .pp-row.pinned .pp-pin.on")'), `${tag}: the pinned person carries a lit star`)
    if (tag === 'overlay') assert(await ev('!!document.querySelector("#tab-people .pp-dot")'), `${tag}: fresh news of the pinned is marked`)
    assert(await ev('gameState.peopleNews() === 0'), `${tag}: opening People clears the news`)
    assert(await ev('/Pinned 1 of 12/.test(document.querySelector("#tab-people .pp-foot").textContent)'), `${tag}: the pin count is shown`)
    assert(await noHScroll(), `${tag}: no sideways scroll`)
    await shot(`people-${tag}-list`)

    await click('#tab-people [data-pp-f="grudge"]'); await sleep(200)
    assert(await ev('(() => { const r = document.querySelectorAll("#tab-people .pp-row"); return r.length >= 1 && /Sworn against you|Hunts you/.test(r[0].textContent) && /Cold|Hateful/.test(r[0].textContent) })()'), `${tag}: Grudges lists who hunts you, and how they feel`)
    await click('#tab-people [data-pp-f="all"]'); await sleep(150)

    // search: type part of the foe's name; a state change must not drop the box's focus
    await ev(`(() => { const i = document.querySelector('[data-pp-q]'); i.focus(); i.value = window.__pp.foeName.split(' ')[1]; i.dispatchEvent(new Event('input', { bubbles: true })) })()`); await sleep(150)
    await ev('gameState._notify()'); await sleep(150)
    assert(await ev('document.activeElement?.matches("[data-pp-q]") && document.querySelectorAll("#tab-people .pp-row").length >= 1 && [...document.querySelectorAll("#tab-people .pp-name")].some(n => n.textContent === window.__pp.foeName)'), `${tag}: search finds them and keeps focus through a redraw`)
    if (tag === 'expanded') await shot(`people-${tag}-search`)
    await ev(`(() => { const i = document.querySelector('[data-pp-q]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur() })()`); await sleep(150)

    // a row opens the card inline
    await ev(`document.querySelector('#tab-people [data-pp-open="' + window.__pp.fol + '"]').click()`); await sleep(250)
    assert(await ev('!!document.querySelector("#tab-people .pc-inline .pc-name")') && await ev('document.getElementById("person-overlay").classList.contains("hidden")'), `${tag}: a row opens the card inline (no popover)`)
    if (await wide()) assert(await ev('!!document.querySelector("#tab-people .pp-listcol .pp-row.on")'), `${tag}: wide: the list stays beside the card, the row marked`)
    else assert(await ev('!document.querySelector("#tab-people .pp-row") && /All people/.test(document.querySelector("#tab-people .pp-back").textContent)'), `${tag}: narrow: the card replaces the list with "All people"`)
    assert(await noHScroll(), `${tag}: no sideways scroll with the card`)
    await shot(`people-${tag}-card`)
    // a name inside the card steps through inline, and Back returns
    const inner = await ev('document.querySelector("#tab-people .pc-inline [data-pid]")?.dataset.pid || null')
    if (inner) {
      await click('#tab-people .pc-inline [data-pid]'); await sleep(200)
      assert(await ev('PeopleView.open === ' + JSON.stringify(inner) + ' && /Back/.test(document.querySelector("#tab-people .pp-back").textContent)'), `${tag}: a name in the card opens theirs in place, with Back`)
      await click('#tab-people [data-pp-back]'); await sleep(200)
      assert(await ev('PeopleView.open === window.__pp.fol'), `${tag}: Back returns`)
    }
    // the card's star unpins, and pins again
    await click('#tab-people .pc-inline [data-pc-pin]'); await sleep(200)
    assert(await ev('!gameState.get().world.persons[window.__pp.fol].pin && !document.querySelector("#tab-people .pc-inline .pc-pin.on")'), `${tag}: the card's star unpins`)
    await click('#tab-people .pc-inline [data-pc-pin]'); await sleep(200)
    assert(await ev('!!gameState.get().world.persons[window.__pp.fol].pin'), `${tag}: and pins again`)
    await ev('PeopleView.open = null; PeopleView._body(true)'); await sleep(150)

    // the Events log: the named classmate opens the popover card
    await click('[data-tab="events"]'); await sleep(250)
    assert(await ev('!!document.querySelector(`#tab-events .pc-link[data-pid="${window.__pp.named}"]`)'), `${tag}: a name in the Events log is tappable`)
    await ev('document.querySelector(`#tab-events .pc-link[data-pid="${window.__pp.named}"]`).click()'); await sleep(250)
    assert(await ev('!!document.querySelector("#person-overlay .pc-pop .pc-pin")'), `${tag}: it opens their card, star included`)
    await shot(`people-${tag}-logcard`)
    await ev('PersonCard.close()'); await sleep(100)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
