// Real-app smoke scenario — Phase 28 / task 4.9 (docs/systems/living-world.md → "4.9 as built"): Met on the road.
// A founder's world with four road cards waiting (an avenger's lethal ambush, a rescue, a youth, a team-up) plus one old
// lover stranger. In each layout: the urgent attention item, the Roam badge, Roam → Explore leads with "Met on the road"
// (count, the bearing picker, the first-time hint), the ambush opens first with why they came, the odds and the lock on
// "Hand over stones"; the bearing marks a different answer; a row opens/closes; answering the team-up takes it off the
// queue and a line lands in their memory; Fight on the ambush opens the battle page titled for the road. Overlay /
// Expanded / Desktop / phone. Screenshots: scripts/smoke/out/encounters-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/encounters.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // Seed the road: four real people from the registry, one of them sworn against you.
  const seed = `(() => { const s = gameState.get(), w = s.world, gs = gameState
    for (const c of [...(s.road?.cards || [])]) gs._roadClose(c, null)
    s.road.hintSeen = false; w.roadHint = false; s.family.encounters = []; s.health = 100
    const loc = LOCATIONS.filter(l => l.minStage <= s.stageIndex).slice(-1)[0]
    const clan = gs._clanIdSet(), used = new Set()
    const free = () => { const p = Object.values(w.persons).find(p => gs._heavyEligible(p, clan) && !used.has(p.id) && !p.roadCard && !p.sectRole && p.stageIndex <= s.stageIndex + 1); used.add(p.id); return p }
    const av = free(); av.rel = -70; av.feud = { pid: s.self.id, why: 'you robbed them as they lay bleeding', y: Math.floor(w.year) - 4 }
    av.mem = [{ y: Math.floor(w.year) - 4, k: 'robbed', text: 'You robbed me as I lay bleeding at ' + loc.name + '.' }]
    const amb = gs._roadCard(av, 'ambush', 'expedition', loc, loc.name, true)
    const res = free(); gs._roadCard(res, 'rescue', 'expedition', loc, loc.name, false)
    const yo = free(); yo.sectId = null; gs._roadCard(yo, 'youth', 'gate', null, 'the gate of ' + s.ownSect.name, false)
    const tm = free(); tm.rel = 35; tm.mem = [{ y: Math.floor(w.year) - 9, k: 'teamup', text: 'We cleared ' + loc.name + ' together.' }]
    const team = gs._roadCard(tm, 'teamup', 'expedition', loc, loc.name, false)
    s.family.encounters.push({ person: gs._rollStranger('stranger'), place: loc.name, text: 'shares your fire for a night and laughs at your jokes', year: Math.floor(w.year) })
    gs.setRoadStance('courteous'); EncounterView.open = null
    window.__er = { amb: amb.id, team: team.id, teamPid: tm.id }
    gs._recalc(); gs._notify() })()`
  await ev(seed); await sleep(300)
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "met-road" && i.tier === "urgent" && i.view === "explore")'), 'an ambush is an urgent attention item pointing at Roam → Explore')

  const noHScroll = async () => { const r = await ev('(() => { const el = document.getElementById("tab-explore"); if (el.scrollWidth <= el.clientWidth + 1) return true; const R = el.getBoundingClientRect().right; return [...el.querySelectorAll("*")].filter(x => x.getBoundingClientRect().right > R + 1).map(x => x.tagName + "." + x.className + ":" + Math.round(x.getBoundingClientRect().right - R)).slice(0, 5).join(" | ") })()'); if (r !== true) console.log("  overflow:", r); return r === true }

  const pass = async tag => {
    await ev(seed); await sleep(200)
    assert(await ev('!!document.querySelector(\'#tabs [data-group="adventure"] .tab-badge.dot\')'), `${tag}: the Roam tab carries the dot`)
    await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="explore"]'); await sleep(350)
    assert(await ev('document.querySelector("#tab-explore > *")?.classList.contains("er-road")'), `${tag}: Met on the road leads Explore`)
    assert(await ev('/5\\/6/.test(document.querySelector("#tab-explore .er-count").textContent)'), `${tag}: the count includes the old stranger (5/6)`)
    assert(await ev('document.querySelectorAll("#tab-explore .er-list > .er-card").length === 4 && document.querySelectorAll("#tab-explore .er-list > .suitor-card").length === 1'), `${tag}: four road cards + the lover stranger in one list`)
    assert(await ev('!!document.querySelector("#tab-explore .er-hint")'), `${tag}: the first-time hint shows`)
    assert(await ev('document.querySelector("#tab-explore .er-card.open")?.classList.contains("urgent")'), `${tag}: the ambush opens first`)
    assert(await ev('/sworn against you/.test(document.querySelector("#tab-explore .er-card.open .er-why").textContent)'), `${tag}: it says why they came`)
    assert(await ev('document.querySelector(\'#tab-explore .er-card.open [data-er-ans="yield"]\').disabled && /not your purse/.test(document.querySelector(\'#tab-explore .er-card.open [data-er-ans="yield"]\').textContent)'), `${tag}: stones won't buy off an avenger (the lock says why)`)
    assert(await ev('/% to win/.test(document.querySelector(\'#tab-explore .er-card.open [data-er-ans="fight"]\').textContent)'), `${tag}: the fight shows its odds`)
    // (final QA: since the avenger blood price, Courteous marks "Pay the blood price" first and Flee only when it's locked)
    assert(await ev('(() => { const c = document.querySelector("#tab-explore .er-card.open"), pr = c.querySelector(\'[data-er-ans="price"]\'); return (pr && !pr.disabled ? pr : c.querySelector(\'[data-er-ans="flee"]\')).classList.contains("pre") })()'), `${tag}: a courteous bearing marks the blood price (else Flee)`)
    assert(await ev('!!document.querySelector("#tab-explore .er-card.open [data-pid]")'), `${tag}: their name opens their card`)
    assert(await noHScroll(), `${tag}: no sideways scroll`)
    await shot(`encounters-${tag}-ambush`)

    await click('#tab-explore [data-er-stance="bold"]'); await sleep(200)
    assert(await ev('document.querySelector(\'#tab-explore .er-card.open [data-er-ans="fight"]\').classList.contains("pre")'), `${tag}: a bold bearing marks Fight instead (nothing answered)`)
    assert(await ev('gameState.get().road.cards.length === 4'), `${tag}: changing the bearing answers nothing`)

    await ev(`document.querySelector('#tab-explore [data-er-open="' + window.__er.team + '"]').click()`); await sleep(200)
    assert(await ev(`document.querySelector('#tab-explore .er-card.open [data-er-ans="accept"]') !== null`), `${tag}: a row opens its card in place`)
    assert(await ev('/We cleared/.test(document.querySelector("#tab-explore .er-card.open .er-why").textContent) && /Warm/.test(document.querySelector("#tab-explore .er-card.open .er-feel").textContent)'), `${tag}: a warm acquaintance: why + feeling`)
    assert(await noHScroll(), `${tag}: no sideways scroll (team-up)`)
    await shot(`encounters-${tag}-teamup`)
    await click('#tab-explore .er-card.open [data-er-ans="accept"]'); await sleep(250)
    assert(await ev('!gameState.get().road.cards.some(c => c.id === window.__er.team) && gameState.get().world.persons[window.__er.teamPid].mem.length >= 2'), `${tag}: answering takes it off the road and they remember it`)

    await click('#tab-explore [data-er-hint]'); await sleep(150)
    assert(await ev('!document.querySelector("#tab-explore .er-hint")'), `${tag}: "Got it" dismisses the hint`)

    await ev(`document.querySelector('#tab-explore [data-er-open="' + window.__er.amb + '"]')?.click()`); await sleep(150)
    if (!(await ev(`!!document.querySelector('#tab-explore .er-card.open [data-er-ans="fight"]')`))) { await ev(`document.querySelector('#tab-explore [data-er-open="' + window.__er.amb + '"]')?.click()`); await sleep(150) }
    await click('#tab-explore .er-card.open [data-er-ans="fight"]'); await sleep(900)
    assert(await ev('gameState.get().family.fight?.kind === "road"'), `${tag}: Fight opens a road fight`)
    assert(await ev('/Ambush on the Road/.test(document.getElementById("combat-overlay")?.textContent || document.body.textContent)'), `${tag}: the battle page is titled for the road`)
    await shot(`encounters-${tag}-battle`)
    await ev('(() => { const s = gameState.get(); s.family.fight = null; combatView.close?.(); document.getElementById("combat-overlay")?.classList.add("hidden"); gameState._notify() })()'); await sleep(300)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
