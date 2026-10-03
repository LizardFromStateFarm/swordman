// Real-app smoke scenario — Phase 43d: the joined blessing scales with the sect (docs/systems/npc-sects.md → "43d").
// A member of the Thunder Palace in Overlay / Expanded / Desktop / phone: the blessing card ("You draw ×k", its halls'
// factor, the rank share, the scaled effects beside the full ones), the "why" popover (data-bd="blessing"), the
// "Raise their halls" list (cost, blessing after, Contribution, lock reasons, a burned hall first), funding a hall
// through the real button, the levy event card after a hall is lost, the court card from a richer sect, and the
// wanderer's join list with each sect's blessing. Asserts nothing spills past the pane; zero console errors.
// Screenshots: scripts/smoke/out/blessing-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/blessing.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // A wanderer first: the join list shows each sect's blessing and what you would draw
  await ev(`(() => { const s = gameState.get(); gameState.disbandOwnSect?.(); s.stageIndex = 16; s.spiritStones = 5000; gameState._recalc(); gameState._notify() })()`)
  await pick('expanded')
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(300)
  assert(await ev('[...document.querySelectorAll("#tab-sect .ws-joinline")].filter(e => /blessing ×/.test(e.textContent)).length >= 4'), 'the join list shows each sect\'s blessing')
  assert(await ev('document.querySelectorAll("#tab-sect .sv-fx-of").length > 0'), 'the join list shows the full blessing beside what you would draw')
  await shot('blessing-expanded-join')

  // Join the Thunder Palace and make a hall burn: the levy waits
  await ev(`(() => { const s = gameState.get(); gameState.joinSect('thunder_palace'); s.sect.rank = 1; s.sect.contribution = 150
    const r = gameState._wsMine(); r.buildings = { training_ground: 2, defensive_array: 1, qi_library: 1 }; r.hallLevel = 2
    s.world.sects.event = null; gameState._wsSetback(r, 'A clash with the Iron Fang Sect'); gameState._recalc(); gameState._notify() })()`)
  assert(await ev('gameState.get().world.sects.event?.id === "levy"'), 'a lost hall calls the levy')

  const inPane = sel => ev(`(() => { const p = document.getElementById('tab-sect'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('${sel} *')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const pass = async tag => {
    await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(300)
    assert(await ev('/You draw/.test(document.querySelector("#tab-sect .sv-bless")?.textContent || "")'), `${tag}: the blessing card shows what you draw`)
    assert(await ev('document.querySelectorAll("#tab-sect .ws-event [data-sa=wsev]").length === 3'), `${tag}: the levy card shows three choices`)
    assert(await ev('/Contribution/.test(document.querySelector("#tab-sect .ws-event").textContent)'), `${tag}: the levy names its Contribution`)
    assert(await inPane('.ws-event'), `${tag}: nothing in the levy card spills past the pane`)
    await ev('document.querySelector("#tab-sect .ws-event")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`blessing-${tag}-levy`)
    if (await ev('!!document.querySelector("#tab-sect .sv-fund:not([open])")')) { await click('#tab-sect .sv-fund > summary'); await sleep(200) }
    assert(await ev('document.querySelector("#tab-sect .sv-fund-row")?.classList.contains("lost")'), `${tag}: the burned hall leads the list`)
    assert(await ev('document.querySelectorAll("#tab-sect .sv-fund [data-sa=fund]").length >= 3'), `${tag}: halls carry a fund tile`)
    assert(await inPane('.sv-bless-sec'), `${tag}: nothing in the blessing section spills past the pane`)
    await ev('document.querySelector("#tab-sect .sv-bless-sec")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`blessing-${tag}-card`)
    await ev('document.querySelector("#tab-sect .sv-fund-list")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`blessing-${tag}-fund`)
  }
  await pick('overlay'); await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  // the why popover
  await click('#tab-sect .sv-bless'); await sleep(350)
  assert(await ev('/Your rank, /.test(document.body.innerText) && /Their halls can give/.test(document.body.innerText)'), 'desktop: the why popover opens with the sum')
  await shot('blessing-desktop-why')
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.body.click()'); await sleep(200)
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()

  // Fund the burned hall through the real button: the levy settles, the blessing grows
  await pick('expanded')
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(250)
  const k0 = await ev('gameState.sectBlessing().k')
  await click('#tab-sect .sv-fund-row.lost [data-sa="fund"]'); await sleep(300)
  assert(await ev(`gameState.sectBlessing().k > ${k0} && gameState.get().world.sects.event === null`), 'funding the burned hall raises the blessing and settles the levy')
  await shot('blessing-expanded-funded')

  // A richer friendly sect courts you
  await ev(`(() => { const s = gameState.get(), W = s.world.sects, hd = W.list.find(r => r.defId === 'heaven_defying'); hd.stance = 40
    W.event = { id: 'courted', sectId: hd.id, year: Math.floor(s.world.year) }; gameState._recalc(); gameState._notify() })()`)
  await click('[data-tab="sect"]'); await sleep(250)
  assert(await ev('/join as/.test(document.querySelector("#tab-sect .ws-event")?.textContent || "")'), 'the court card shows the rank and blessing you would have there')
  assert(await inPane('.ws-event'), 'expanded: nothing in the court card spills past the pane')
  await ev('document.querySelector("#tab-sect .ws-event")?.scrollIntoView({ block: "start" })'); await sleep(150)
  await shot('blessing-expanded-court')
  await pick('overlay'); await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(250)
  assert(await inPane('.ws-event'), 'overlay: nothing in the court card spills past the pane')
  await ev('document.querySelector("#tab-sect .ws-event")?.scrollIntoView({ block: "start" })'); await sleep(150)
  await shot('blessing-overlay-court')
}
