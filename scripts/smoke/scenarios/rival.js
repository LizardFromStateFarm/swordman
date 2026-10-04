// Real-app smoke scenario — Phase 28 / task 4.10b (docs/systems/living-world.md → "4.10b as built"): Your Rival. A
// founder's world whose rival has history (meetings, wins and losses, beats, a house carried from a past life) and is
// waiting on the road. In each layout: the attention item, World → Rival (the face-off, the heat meter with both ends, the
// record, "waiting on the road" + Answer, the deeds, the history), Answer → Roam → Explore with the rival's card open (the
// heat line, the Rival tag, a locked duel to the death with its reason), a refusal moving the heat and the next visit
// shown in real open time, the person card's rival chip, World → People → Rivals, and a blood feud (the meter in the red,
// the duel unlocked). Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/rival-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/rival.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // A rivalry with a past: four meetings, a house from a past life, the rival a stage ahead and waiting on the road.
  const setup = heat => `(() => { const s = gameState.get(), w = s.world
    s.spiritStones = 99999; s.health = s.derived?.healthMax || 100
    const r = gameState._rivalRec() || gameState._pickRival(), p = w.persons[r.pid]
    for (const c of [...s.road.cards]) gameState._roadClose(c, null); s.road.waiting = []; s.family.encounters = []; p.roadCard = null
    p.alive = true; p.stageIndex = s.stageIndex + 2; p.actAt = 0; p.sworn = null
    r.end = null; r.heat = ${heat}; r.meets = 4; r.wins = 2; r.losses = 1; r.lead = -1; r.beats = []; r.seq = 0; r.seen = 0
    r.inherited = { fromLife: 1, fromName: 'Chen Xianyu', heat: -60, end: 'slain' }; r.house = p.family
    const B = (k, v, o) => gameState._rivalBeat(r, k, v, o)
    B('inherited', { house: p.family, from: 'Chen Xianyu' })
    B('won', { place: 'the Mistwood' }, { meet: false, tone: 'jade' }); B('drink', { place: 'the Red Ford' }, { tone: 'jade' })
    B('rose', { realm: 'Foundation Building' }, { tone: 'gold' }); B('lost', { place: 'the Ashen Gorge' }, { tone: 'red' })
    B('passed', { realm: 'Qi Condensation 9', theirs: 'Foundation Building 2' }, { tone: 'red' }); B('declined', { place: 'the gate' }, { tone: 'red' })
    w.rivalHint = false
    gameState._roadCard(p, 'rivalDuel', 'rival', null, 'the mountain road', false, { rival: true })
    window.__rv = { pid: p.id }
    gameState._recalc(); gameState._notify() })()`

  const noHScroll = async sel => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return true; if (el.scrollWidth <= el.clientWidth + 1) return true; const R = el.getBoundingClientRect().right; return [...el.querySelectorAll("*")].filter(x => x.getBoundingClientRect().right > R + 1).map(x => x.tagName + "." + x.className).slice(0, 4).join(" | ") })()`); if (r !== true) console.log('  overflow:', r); return r === true }
  const openRival = async () => { await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="rival"]'); await sleep(350) }

  const pass = async tag => {
    await ev(setup(-45)); await sleep(250)
    assert(await ev('[...document.querySelectorAll("#attention *")].some(e => /Your rival .* seeks you/.test(e.textContent))'), `${tag}: attention says your rival seeks you`)
    await openRival()
    assert(await ev('!!document.querySelector("#tab-rival .rv-face") && document.querySelectorAll("#tab-rival .rv-side").length === 2'), `${tag}: you and your rival side by side`)
    assert(await ev('/They lead by 2 stages/.test(document.querySelector("#tab-rival .rv-lead").textContent)'), `${tag}: who leads, in words`)
    assert(await ev('!!document.querySelector("#tab-rival .rv-bar .rv-mark") && /−45/.test(document.querySelector("#tab-rival .rv-heat-v").textContent) && /Bitter rival/.test(document.querySelector("#tab-rival .rv-heat-w").textContent)'), `${tag}: the heat meter (−45, Bitter rival)`)
    assert(await ev('document.querySelectorAll("#tab-rival .rv-ends > span").length === 2'), `${tag}: both ends of the meter say what they open`)
    assert(await ev('/4 meetings/.test(document.querySelector("#tab-rival .rv-rec").textContent) && /2 wins/.test(document.querySelector("#tab-rival .rv-rec").textContent)'), `${tag}: the record`)
    assert(await ev('!!document.querySelector("#tab-rival .rv-next.now [data-rv-go=explore]")'), `${tag}: "waiting on the road" with Answer`)
    assert(await ev('document.querySelectorAll("#tab-rival .rv-acts .pc-actb").length === 3'), `${tag}: the deeds you can start (spar, duel, gift)`)
    assert(await ev('/heat −70/.test(document.querySelector("#tab-rival .rv-acts [data-pc-act=duel]").textContent)'), `${tag}: the duel says it waits for a blood feud`)
    assert(await ev('document.querySelectorAll("#tab-rival .rv-beat").length >= 7 && !!document.querySelector("#tab-rival .rv-house")'), `${tag}: the history + the house from a past life`)
    assert(await ev('!!document.querySelector("#tab-rival .rv-hint")'), `${tag}: the first-time hint`)
    assert(await noHScroll('#tab-rival'), `${tag}: no sideways scroll`)
    await ev('document.getElementById("tab-rival").scrollTop = 0'); await sleep(100)
    await shot(`rival-${tag}`)
    await ev('document.querySelector("#tab-rival .rv-beats")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`rival-${tag}-history`)

    // Answer them → the card on the road
    await click('#tab-rival [data-rv-go="explore"]'); await sleep(400)
    assert(await ev('!!document.querySelector(".er-card.open .er-heat") && /heat/.test(document.querySelector(".er-card.open .er-heat").textContent)'), `${tag}: the road card names the rivalry and its heat`)
    assert(await ev('/Rival/.test(document.querySelector(".er-card.open .er-tag").textContent)'), `${tag}: the Rival tag`)
    assert(await ev('/blood feud/.test(document.querySelector(".er-card.open [data-er-ans=blood]").textContent) && document.querySelector(".er-card.open [data-er-ans=blood]").disabled'), `${tag}: the duel to the death is locked, with its reason`)
    await ev('document.querySelector(".er-card.open")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`rival-${tag}-card`)
    const h0 = await ev('gameState._rivalRec().heat')
    await click('.er-card.open [data-er-ans="decline"]'); await sleep(250)
    assert(await ev(`gameState._rivalRec().heat < ${h0}`), `${tag}: refusing them cools the heat`)

    await openRival()
    assert(await ev('/seek you out again in/.test(document.querySelector("#tab-rival .rv-next").textContent) && /min|moments|any moment/.test(document.querySelector("#tab-rival .rv-next b").textContent) && !/year/.test(document.querySelector("#tab-rival .rv-next").textContent)'), `${tag}: the next visit in real open time, never game years`)
    // the person card
    await click('#tab-rival .rv-side.them .pc-link'); await sleep(250)
    assert(await ev('/Your rival ·/.test(document.querySelector("#person-overlay .pc-pop").textContent)'), `${tag}: the person card marks your rival`)
    await ev('PersonCard.close()'); await sleep(100)
    // People → Rivals
    await click('[data-tab="people"]'); await sleep(300)
    await ev('PeopleView.open = null; PeopleView.filter = "rival"; PeopleView._body(true)'); await sleep(200)
    assert(await ev('[...document.querySelectorAll("#tab-people .pp-row")].some(r => /Your rival/.test(r.textContent))'), `${tag}: World → People → Rivals lists them`)
    await ev('PeopleView.filter = "all"; PeopleView._body(true)')

    // A blood feud: the meter in the red, the duel open
    await ev(setup(-82)); await sleep(200)
    await openRival()
    assert(await ev('document.querySelector("#tab-rival .rv-heat").classList.contains("blood") && document.querySelector("#tab-rival .rv-ends > span").classList.contains("on")'), `${tag}: a blood feud lights the cold end`)
    assert(await ev('!document.querySelector("#tab-rival .rv-acts [data-pc-act=duel]").disabled'), `${tag}: the duel to the death opens`)
    if (tag === 'overlay' || tag === 'desktop') { await ev('document.getElementById("tab-rival").scrollTop = 0'); await sleep(100); await shot(`rival-${tag}-blood`) }
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
