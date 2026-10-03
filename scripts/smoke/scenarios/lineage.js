// Real-app smoke scenario — Phase 46 lineage sects (docs/systems/lineage-sect.md): when a founder dies, the sect
// passes to a branch head and lives on as a world sect; and at Core Formation it offers the next life a place,
// shown on Sect → Overview — shot in Overlay, Expanded, Desktop and phone width, asserting it fits the pane.
// Screenshots: scripts/smoke/out/lineage-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/lineage.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // Give the founder a sect with one branch head, then let the life end: the sect must pass to the head.
  await ev(`(() => { const s = gameState.get()
    s.ownSect.founded = true; s.ownSect.name = 'Azure Peak'; s.ownSect.hallLevel = 2; s.ownSect.buildings = { qi_library: 2 }
    s.ownSect.disciples = [
      { id:'x1', name:'Elder Gao', talent:3, level:6, xp:0, branchId:'bb1', role:'head', kin:false, personality:'stoic' },
      { id:'x2', name:'Lin', talent:2, level:3, xp:0, branchId:null, role:'disciple', kin:false, personality:'niceguy' } ]
    s.ownSect.branches = [ { id:'bb1', name:'Eastern Branch', headId:'x1', since:0, loyalty:90, rivalId:null, heat:0, wins:0, losses:0, tourneyWins:0 } ]
    gameState._recalc(); gameState._notify(); gameState.passTheMantle() })()`)
  await sleep(500)
  const rec = await ev(`JSON.stringify(gameState.get().world.sects.list.find(r => r.kind === 'lineage') || null)`)
  assert(/Azure Peak/.test(rec) && /Elder Gao/.test(rec), `the sect passed to the branch head as a world sect: ${rec}`)

  // Resolve the interlude (bet if one waits) and be reborn.
  await ev(`(() => { const gs = gameState; let g = 0
    while (gs.get().interlude && gs.get().interlude.step === 'bet' && g++ < 8) gs.placeBet(gs.get().interlude.candidates[0])
    if (gs.get().interlude) gs.chooseRebirth('orphan') })()`)
  await sleep(500)
  await ev(`document.getElementById('death-ok')?.click()`)   // dismiss any death card the hold already opened
  await sleep(200)
  assert(await ev('!gameState.get().interlude'), 'the interlude is resolved before the offer')

  // Reach Core Formation with no sect → the old sect sends for you.
  await ev(`(() => { const s = gameState.get()
    s.stageIndex = CULTIVATION_STAGES.findIndex(x => x.realm === 'Core Formation'); s.sect = { id: null, rank: 0, contribution: 0, activeMissions: [] }
    s.ownSect.founded = false; delete s.lineageOffer; gameState._recalc(); gameState._notify() })()`)
  await sleep(300)

  const pass = async tag => {
    await click('#tabs [data-group="sect"]'); await sleep(250)
    assert(await ev('!!document.querySelector("#tab-sect .sv-lineage")'), `${tag}: the recruitment card shows`)
    const ok = await ev(`(() => { const c = document.querySelector('#tab-sect .sv-lineage')
      if (!c) return false; const r = document.getElementById('tab-sect').getBoundingClientRect()
      return [...c.querySelectorAll('*')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
    assert(ok, `${tag}: the card does not spill past the pane`)
    assert(await ev('document.getElementById("death-overlay").classList.contains("hidden")'), `${tag}: no stale death card over the offer`)
    await ev(`document.getElementById('banter-bubble')?.classList.add('hidden')`)   // a reborn line must not cover the card
    await ev('document.querySelector("#tab-sect .sv-lineage")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`lineage-${tag}-offer`)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
  await pick('overlay')

  // Join the old sect.
  await click('#tabs [data-group="sect"]'); await sleep(250)
  await click('#tab-sect [data-sa="lineagejoin"]'); await sleep(500)
  assert(await ev('!!gameState.get().sect.id && gameState._sectDef()?.lineage === true'), 'joining the old sect gives a real membership')
  assert(await ev('!document.querySelector("#tab-sect .sv-lineage")'), 'the offer is consumed once answered')
  await shot('lineage-overlay-joined')
}
