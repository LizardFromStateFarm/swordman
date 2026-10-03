// Real-app smoke scenario — Phase 43h + follow-up (docs/systems/npc-sects.md → "43h"): the 世 World nav group (Sects ·
// Events · Banter); World → Sects lists every sect and draws a sect's page inline (back to the list); the page's actions
// (gift through the real button, a trade pick, a sworn ally's page); Sect → War → "Declare war" → pick a sect → confirm
// (the war starts against it); Sect → Disciples → "Poach recruits" → pick a sect → their named disciples → lure one; the
// page's Poach button leads into that flow. Then a member: World → a rival's page (spar + urge), War → "Urge war on a
// sect", the spar on the battle page. Overlay / Expanded / Desktop / phone; asserts nothing spills; zero console errors.
// Screenshots: scripts/smoke/out/rel-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/sect-relations.js
module.exports = async (ctx) => {
  const { ev, click, wait, shot, assert, sleep, emulate, clearEmulation } = ctx
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.spiritStones = 50000; s.sectWar.phase = 'none'; s.sectWar.nextWarAt = Date.now() + 9e8
    for (let i = 0; i < 60; i++) gameState._tickWorldSects()
    s.world.sects.event = null
    const W = s.world.sects.list, rival = W.find(r => r.kind === 'rival'); rival.stance = 5; gameState._wsDeed(rival, -10, 'clashed with your patrols')
    const ally = W.find(r => r.kind === 'joinable' && r !== rival); ally.sworn = true; ally.stance = 70
    const prey = W.find(r => r !== rival && r !== ally && r.disciples >= 6) || W.find(r => r !== rival && r !== ally)
    s.inventory.manual_drifting_step_palm = 1; s.inventory.manual_rising_qi_kick = 1
    s.ownSect.hallLevel = 4
    globalThis.__rival = rival.id; globalThis.__ally = ally.id; globalThis.__prey = prey.id
    gameState._recalc(); gameState._notify() })()`)
  const rival = await ev('globalThis.__rival'), ally = await ev('globalThis.__ally'), prey = await ev('globalThis.__prey')
  const inPane = id => ev(`(() => { const p = document.getElementById('${id}'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('*')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const toWorld = async () => { await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(300) }
  const toSect = async v => { await click('#tabs [data-group="sect"]'); await sleep(200); await click(`[data-tab="${v}"]`); await sleep(300) }
  const openSect = async id => { await toWorld()
    if (await ev('!!document.querySelector("#tab-world [data-back]")')) { await click('#tab-world [data-back]'); await sleep(250) }
    await ev(`document.querySelector('#tab-world [data-sa="wsopen"][data-id="' + ${JSON.stringify(id)} + '"]')?.scrollIntoView({ block: 'center' })`); await sleep(100)
    await click(`#tab-world [data-sa="wsopen"][data-id="${id}"]`); await sleep(300) }

  assert(await ev('[...document.querySelectorAll("#tabs .tab-glyph")].map(g => g.textContent).join("") === "修歷家宗囊世"'), 'the sixth nav group is 世')
  assert(await ev('/World/.test(document.querySelector("#tabs [data-group=log]").textContent)'), 'it is named World')
  assert(await ev('!document.querySelector("#tab-sect .ws-ledger")'), 'the Sect Overview no longer carries the list')

  const pass = async tag => {
    await toWorld()
    if (await ev('!!document.querySelector("#tab-world [data-back]")')) { await click('#tab-world [data-back]'); await sleep(250) }
    assert(await ev('document.querySelectorAll("#tab-world button.ws-row[data-sa=wsopen]").length >= 5'), `${tag}: World → Sects lists the sects`)
    assert(await inPane('tab-world'), `${tag}: nothing in the list spills past the pane`)
    await shot(`rel-${tag}-world`)
    await openSect(rival)
    assert(await ev('!!document.querySelector("#tab-world .sdx-hero") && ["gift","war","tribute","spy","trade","poach"].every(a => !!document.querySelector("#tab-world [data-act=" + a + "]"))'), `${tag}: a sect's page draws inline, with the leader's actions`)
    assert(await ev('/clashed with your patrols/.test(document.getElementById("tab-world").textContent)'), `${tag}: it lists what they remember of you`)
    assert(await inPane('tab-world'), `${tag}: nothing on the page spills past the pane`)
    await ev('document.getElementById("tab-world").scrollTop = 0'); await sleep(100)
    await shot(`rel-${tag}-page`)
    await ev('document.querySelector("#tab-world .sdx-group:last-of-type")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`rel-${tag}-page-mid`)
    await toSect('sect-war')
    if (!(await ev('!!document.querySelector("#tab-sect-war .sv-pick")'))) { await click('#tab-sect-war [data-sa="warpick"]'); await sleep(300) }
    assert(await ev('document.querySelectorAll("#tab-sect-war [data-sa=declare]").length >= 3'), `${tag}: War → Declare war lists the sects`)
    assert(await inPane('tab-sect-war'), `${tag}: nothing in the war picker spills past the pane`)
    await ev('document.querySelector("#tab-sect-war .sv-pick-sec")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`rel-${tag}-war-pick`)
    await toSect('sect-disciples')
    await ev('document.querySelector("#tab-sect-disciples [data-sa=poachclose]")?.click()'); await sleep(200)
    await ev('document.querySelector("#tab-sect-disciples [data-sa=poachopen]")?.scrollIntoView({ block: "center" })'); await sleep(100)
    await click('#tab-sect-disciples [data-sa="poachopen"]'); await sleep(300)
    assert(await ev('document.querySelectorAll("#tab-sect-disciples [data-sa=poachsect]").length >= 3'), `${tag}: Poach recruits lists the sects`)
    await shot(`rel-${tag}-poach-sects`)
    await click(`#tab-sect-disciples [data-sa="poachsect"][data-id="${prey}"]`); await sleep(300)
    assert(await ev('document.querySelectorAll("#tab-sect-disciples .sv-poach-card").length >= 1 && /% they come/.test(document.getElementById("tab-sect-disciples").textContent)'), `${tag}: a sect's named disciples, each with odds and a cost`)
    assert(await inPane('tab-sect-disciples'), `${tag}: nothing in the poach list spills past the pane`)
    await ev('document.querySelector("#tab-sect-disciples .sv-poach")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`rel-${tag}-poach-roster`)
    await click('#tab-sect-disciples [data-sa="poachclose"], #tab-sect-disciples [data-sa="poachback"]'); await sleep(200)
    await ev('document.querySelector("#tab-sect-disciples [data-sa=poachclose]")?.click()'); await sleep(200)
  }
  await pick('overlay'); await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400)

  // Gift + trade on the page, through the real buttons
  await pick('desktop'); await openSect(rival)
  const st0 = await ev(`gameState._wsRec(${JSON.stringify(rival)}).stance`)
  await click('#tab-world [data-act="gift"]'); await sleep(300)
  assert(await ev(`gameState._wsRec(${JSON.stringify(rival)}).stance > ${st0} && /sent them a gift/.test(document.getElementById("tab-world").textContent)`), 'a gift warms them, and the page lists it')
  if (await ev('!!document.querySelector("#tab-world [data-pick]:not([disabled])")')) {
    await click('#tab-world [data-pick]:not([disabled])'); await sleep(200)
    assert(await ev('!document.querySelector("#tab-world [data-act=trade]").disabled'), 'picking a manual unlocks the trade')
    await ev('document.querySelector("#tab-world [data-act=trade]")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot('rel-desktop-trade')
  }
  // The page's Poach leads into Disciples → Poach recruits, this sect picked
  await click('#tab-world [data-act="poach"]'); await sleep(400)
  assert(await ev(`!document.getElementById("tab-sect-disciples").classList.contains("hidden") && /disciples/.test(document.querySelector("#tab-sect-disciples .sv-poach")?.textContent || "")`), 'the page\'s Poach opens that sect\'s disciples in Sect → Disciples')
  // Lure one, through the real button
  const n0 = await ev('gameState.get().ownSect.disciples.length')
  await ev('globalThis.__r = Math.random; Math.random = () => 0')
  await click('#tab-sect-disciples .sv-poach-card [data-sa="poach"]'); await sleep(300)
  await ev('Math.random = globalThis.__r')
  assert(await ev(`gameState.get().ownSect.disciples.length === ${n0} + 1`), 'luring a chosen disciple brings them into your sect')
  await shot('rel-desktop-poached')
  await ev('document.querySelector("#tab-sect-disciples [data-sa=poachback]")?.click()'); await sleep(200)
  await ev('document.querySelector("#tab-sect-disciples [data-sa=poachclose]")?.click()'); await sleep(200)
  // Declare war from the War tab: pick → confirm
  await toSect('sect-war')
  if (!(await ev('!!document.querySelector("#tab-sect-war .sv-pick")'))) { await click('#tab-sect-war [data-sa="warpick"]'); await sleep(300) }
  await ev(`document.querySelector('#tab-sect-war [data-sa="declare"][data-id="' + ${JSON.stringify(rival)} + '"]')?.scrollIntoView({ block: 'center' })`)
  await click(`#tab-sect-war [data-sa="declare"][data-id="${rival}"]`); await sleep(200)
  await click('#confirm-yes'); await sleep(500)
  assert(await ev(`gameState.get().sectWar.phase === 'scouting' && gameState.get().sectWar.enemyId === ${JSON.stringify(rival)} && gameState.get().sectWar.declaredByYou`), 'War → Declare war → a sect → confirm starts the war')
  assert(await ev('!document.querySelector("#tab-sect-war [data-sa=warpick]")'), 'while at war the picker is gone')
  await shot('rel-desktop-war-declared')
  // A sworn ally's page
  await openSect(ally)
  assert(await ev('!!document.querySelector("#tab-world [data-act=breakAlliance]") && document.querySelector("#tab-world [data-act=war]").disabled'), 'a sworn ally: break the alliance; war is locked, with its reason')
  await ev('document.getElementById("tab-world").scrollTop = 0'); await shot('rel-desktop-ally')

  // A member: spar + urge on the page; War → Urge war on a sect
  await ev(`(() => { const s = gameState.get(); s.sectWar.phase = 'none'; gameState.disbandOwnSect?.(); s.stageIndex = 12; s.health = 100
    gameState.joinSect('thunder_palace'); s.sect.rank = 3; s.sectWar.nextWarAt = Date.now() + 9e8; gameState._recalc(); gameState._notify() })()`)
  await pick('expanded'); await openSect(rival)
  assert(await ev('!!document.querySelector("#tab-world [data-act=spar]") && !!document.querySelector("#tab-world [data-act=urge]") && !document.querySelector("#tab-world [data-act=war]")'), 'a member sees spar + urge, not the leader\'s actions')
  await shot('rel-expanded-member')
  await toSect('sect-war')
  if (!(await ev('!!document.querySelector("#tab-sect-war .sv-pick")'))) { await click('#tab-sect-war [data-sa="warpick"]'); await sleep(300) }
  assert(await ev('document.querySelectorAll("#tab-sect-war [data-sa=urgeon]").length >= 3 && /your master agrees/.test(document.getElementById("tab-sect-war").textContent)'), 'a member: War → Urge war on a sect, with the odds your master agrees')
  await shot('rel-expanded-urge-pick')
  await openSect(rival)
  await click('#tab-world [data-act="spar"]'); await sleep(600)
  assert(await ev('gameState.get().family.fight?.kind === "spar" && !document.getElementById("combat-overlay").classList.contains("hidden")'), 'a spar opens the battle page')
  await shot('rel-expanded-spar')
}
