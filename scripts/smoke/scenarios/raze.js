// Real-app smoke scenario — Phase 43f razing (docs/systems/npc-sects.md → "43f"): a founder at war with a real sect —
// Sect → War shows the "Vow to raze" tile (treasury, manual odds, karma, who recoils, dread, the remnant's odds), the vow
// is sworn through the real button (the tile turns to "Vowed", "Their mountain" says so), the standing order row is
// there; a won war burns them (the Last war card says "razed"); World → Sects shows the dread line and "Ashes you made";
// a remnant rises with a feud tag, and its letter from the ashes waits on Sect → Overview. Overlay / Expanded / Desktop /
// phone; asserts nothing spills past the pane. Screenshots: scripts/smoke/out/raze-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/raze.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // A war you declared on a rival, mid-preparation
  const bind = `(() => { const s = gameState.get(), w = s.sectWar
    const foe = s.world.sects.list.find(r => r.alive && !r.sworn && r.kind === 'rival')
    gameState._openWarOn(foe, false, true)
    w.phase = 'preparing'; w.scoutEndsAt = Date.now() - 1000; w.prepEndsAt = Date.now() + 3600e3
    s.spiritStones = Math.max(s.spiritStones, 5000); gameState._recalc(); gameState._notify(); return foe.id })()`
  const foeId = await ev(bind)
  const inPane = (pane, sel) => ev(`(() => { const p = document.getElementById('${pane}'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('${sel} *')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const openWar = async () => { await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-war"]'); await sleep(300) }
  const pass = async tag => {
    await openWar()
    assert(await ev('!!document.querySelector("#tab-sect-war .sv-raze")'), `${tag}: the vow tile is on the War panel`)
    assert(await ev('/karma/.test(document.querySelector("#tab-sect-war .sv-raze-chips")?.textContent || "") && /dread/.test(document.querySelector("#tab-sect-war .sv-raze-chips")?.textContent || "")'), `${tag}: the chips name the karma and the dread`)
    assert(await inPane('tab-sect-war', '.sv-raze-grid') && await inPane('tab-sect-war', '.sv-raze-chips'), `${tag}: nothing in the vow tile spills past the pane`)
    assert(await ev('[...document.querySelectorAll("#tab-sect-war .set-label")].some(l => /Raze if we win/.test(l.textContent))'), `${tag}: the standing order row is there`)
    await ev('document.querySelector("#tab-sect-war .sv-raze")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`raze-${tag}-vow`)
  }
  await pass('overlay')
  // Swear it through the real button
  await click('#tab-sect-war .sv-raze'); await sleep(300)
  assert(await ev('gameState.get().sectWar.razeVow && gameState.get().sectWar.razeSet'), 'the button swears the vow')
  assert(await ev('!!document.querySelector("#tab-sect-war .sv-raze.vowed")'), 'the tile turns to "Vowed"')
  assert(await ev('/vowed it/.test(document.querySelector("#tab-sect-war .sv-foe")?.textContent || "")'), '"Their mountain" says the vow is sworn')
  await ev('document.querySelector("#tab-sect-war .sv-raze")?.scrollIntoView({ block: "center" })'); await sleep(150)
  await shot('raze-overlay-vowed')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()

  // The war is won: the mountain burns
  await pick('expanded')
  await ev(`(() => { const M = Math.random; Math.random = () => 0; try { gameState._resolveSectWar() } finally { Math.random = M } })()`)
  await sleep(200); await openWar()
  assert(await ev(`!gameState.get().world.sects.list.some(r => r.id === "${foeId}")`), 'the razed sect is gone from the world')
  assert(await ev('!!document.querySelector("#tab-sect-war .sv-last.razed") && /to the ground/.test(document.querySelector("#tab-sect-war .sv-last")?.textContent || "")'), 'the Last war card says it burned')
  await ev('document.querySelector("#tab-sect-war .sv-last")?.scrollIntoView({ block: "start" })'); await sleep(150)
  await shot('raze-expanded-lastwar')

  // A remnant rises; World → Sects shows the dread, the ashes, the feud
  await ev(`(() => { const W = gameState.get().world.sects; const a = W.ashes[W.ashes.length - 1]; a.returnYear = 0
    const M = Math.random; Math.random = () => 0; try { gameState._tickAshes(Math.floor(gameState.get().world.year)) } finally { Math.random = M }
    const r = W.list.find(x => x.id === a.rebornId); W.event = { id: 'vengeance', sectId: r.id, year: Math.floor(gameState.get().world.year) }
    gameState.get().sectWar.phase = 'none'; gameState._notify() })()`)
  const world = async tag => {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(300)
    assert(await ev('!!document.querySelector("#tab-world .ws-dread")'), `${tag}: the dread line shows`)
    assert(await ev('!!document.querySelector("#tab-world .ws-ashes")'), `${tag}: "Ashes you made" is in the ledger`)
    assert(await ev('/feud/.test(document.querySelector("#tab-world .ws-ledger")?.textContent || "")'), `${tag}: the remnant wears its feud`)
    assert(await inPane('tab-world', '.ws-ledger'), `${tag}: nothing in the ledger spills past the pane`)
    await ev('document.querySelector("#tab-world .ws-ashes")?.setAttribute("open", "")'); await sleep(100)
    await ev('document.querySelector("#tab-world .ws-foot")?.scrollIntoView({ block: "end" })'); await sleep(150)
    await shot(`raze-${tag}-world`)
  }
  await world('expanded')
  // The letter from the ashes on Sect → Overview
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(300)
  assert(await ev('/letter from the ashes/i.test(document.querySelector("#tab-sect .ws-event")?.textContent || "")'), 'the heir\'s letter waits on Sect → Overview')
  assert(await ev('/feud is set down/.test(document.querySelector("#tab-sect .ws-event")?.textContent || "")'), 'its choices say what they do')
  await shot('raze-expanded-vengeance')
  await pick('overlay'); await world('overlay')
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(300)
  assert(await inPane('tab-sect', '.ws-event'), 'overlay: the letter fits the pane')
  await shot('raze-overlay-vengeance')
  await pick('desktop'); await world('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await world('phone')
  await clearEmulation()
}
