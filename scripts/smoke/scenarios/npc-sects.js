// Real-app smoke scenario — Phase 43b Living Sects (docs/systems/npc-sects.md): the "Sects of the world" ledger (since the
// 43h follow-up: 世 World → Sects, a sect's page inline) and a world-sect event card on Sect → Overview — a founder in Overlay / Expanded / Desktop / phone (an opened ledger row
// with its hall pips + memory, the event's choices with cost/odds/stance), answering a choice through the real button
// (the event clears, the sect remembers), the attention item, then a wanderer's join list (each sect's Might) and a
// member's Overview. Asserts nothing in the ledger or the card spills past the pane.
// Screenshots: scripts/smoke/out/npc-sects-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/npc-sects.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // A lived-in world: 120 years of growth, a sect with a grudge, and an envoy waiting at the gate
  await ev(`(() => { const s = gameState.get(); s.spiritStones = 5000
    for (let i = 0; i < 120; i++) gameState._tickWorldSects()
    const W = s.world.sects, rival = W.list.find(r => r.kind === 'rival')
    gameState._wsDeed(rival, -30, 'marched on your mountain'); gameState._wsDeed(rival, -8, 'lost a war against you')
    rival.stance = 0
    W.event = { id: 'envoy', sectId: rival.id, year: Math.floor(s.world.year) }
    gameState._recalc(); gameState._notify() })()`)
  assert(await ev('!!gameState.worldSectEventInfo()'), 'an envoy event is waiting')
  assert(await ev('collectAttention(gameState.get(), gameState).some(a => a.id === "world-sect" && a.tier === "urgent")'), 'the waiting event is an urgent attention item')

  const inPane = sel => ev(`(() => { const p = document.getElementById('tab-sect'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('${sel} *')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const pass = async tag => {
    await click('#tabs [data-group="sect"]'); await sleep(200)
    await click('[data-tab="sect"]'); await sleep(300)
    assert(await ev('document.querySelectorAll("#tab-sect .ws-event [data-sa=wsev]").length === 3'), `${tag}: the event card shows three choices`)
    assert(await ev('/% to succeed/.test(document.querySelector("#tab-sect .ws-event").textContent)'), `${tag}: the tribute choice shows its odds`)
    assert(await inPane('.ws-event'), `${tag}: nothing in the event card spills past the pane`)
    await ev('document.querySelector("#tab-sect .ws-event")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`npc-sects-${tag}-event`)
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(300)   // 43h: 世 World → Sects
    if (await ev('!!document.querySelector("#tab-world [data-back]")')) { await click('#tab-world [data-back]'); await sleep(200) }
    assert(await ev('!!document.querySelector("#tab-world .ws-ledger")'), `${tag}: World → Sects shows the ledger`)
    await shot(`npc-sects-${tag}-ledger`)
    await click('#tab-world button.ws-row[data-sa="wsopen"]'); await sleep(250)
    assert(await ev('!!document.querySelector("#tab-world .ws-pips")'), `${tag}: a sect's page shows its halls`)
    await click('#tab-world [data-back]'); await sleep(150)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  // the rival's own row, opened, with its memory of you
  await ev("WorldView.show(gameState.get().world.sects.event.sectId)"); await click("#tabs [data-group=log]"); await sleep(200); await click("[data-tab=world]"); await sleep(250)
  assert(await ev('/marched on your mountain/.test(document.getElementById("tab-world").textContent)'), 'desktop: a sect\'s page lists what it remembers of you')
  await shot('npc-sects-desktop-memory')
  await click('#tab-world [data-back]'); await sleep(150)
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()

  // Answer through the real button: the event clears and the sect remembers
  await pick('expanded')
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(250)
  const id = await ev('gameState.get().world.sects.event.sectId')
  await click('#tab-sect .ws-event [data-sa="wsev"][data-n="0"]'); await sleep(300)
  assert(await ev('gameState.get().world.sects.event === null && !document.querySelector("#tab-sect .ws-event")'), 'answering clears the event card')
  assert(await ev(`/receive them as friends/.test(gameState.get().world.sects.list.find(r => r.id === "${id}").deeds.at(-1).text)`), 'the sect remembers your answer')
  await shot('npc-sects-expanded-answered')

  // A wanderer's join list shows each sect's Might; a member's Overview carries the ledger with "your sect"
  await ev(`(() => { const s = gameState.get(); gameState.disbandOwnSect?.(); s.stageIndex = Math.max(s.stageIndex, 16); gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(250)
  assert(await ev('document.querySelectorAll("#tab-sect .ws-joinline").length >= 4'), 'the join list shows each sect\'s Might and stance')
  await shot('npc-sects-expanded-join')
  await ev('gameState.joinSect("void_moon")'); await sleep(300)
  await click('[data-tab="sect"]'); await sleep(250)
  await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(250)
  assert(await ev('/your sect/.test(document.querySelector("#tab-world .ws-ledger")?.textContent || "")'), 'a member sees their sect marked in the ledger')
  await shot('npc-sects-expanded-member')
}
