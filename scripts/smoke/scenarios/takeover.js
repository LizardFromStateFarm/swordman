// Real-app smoke scenario — Phase 43e: the sect master + taking the sect over (docs/systems/npc-sects.md → "43e").
// A Thunder Palace member: the master card below Grand Elder (locked, "no realm is too low") and as a Grand Elder at
// a LOW realm (the challenge + petition tiles with odds, the lethal call, the prize) in Overlay / Expanded / Desktop /
// phone; the attention item; the challenge through the real button + confirm onto the battle page; winning it through
// the real move buttons (fight-ui.js), sparing the master → the sect is yours (the founder Overview, "taken" line, the
// old guard card) and the exiled master's splinter in the ledger; answering the old guard through the real button.
// Screenshots: scripts/smoke/out/takeover-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/takeover.js
module.exports = async (ctx) => {
  const { ev, click, wait, shot, assert, sleep, emulate, clearEmulation } = ctx
  const F = require('../fight-ui.js')(ctx)
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  await ev(`(() => { const s = gameState.get(); gameState.disbandOwnSect?.(); s.stageIndex = 16; s.spiritStones = 50000; s.health = 100
    gameState.joinSect('thunder_palace'); s.sect.rank = 2; s.sect.contribution = 500; gameState._recalc(); gameState._notify() })()`)
  const inPane = sel => ev(`(() => { const p = document.getElementById('tab-sect'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('${sel} *')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const toSect = async () => { await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect"]'); await sleep(300) }

  await pick('expanded'); await toSect()
  assert(await ev('/Only a Grand Elder/.test(document.querySelector("#tab-sect .sv-master")?.textContent || "")'), 'below Grand Elder: the master card says who may challenge')
  assert(await ev('document.querySelectorAll("#tab-sect .sv-master [data-sa=mchallenge][disabled]").length === 1'), 'the challenge tile is locked, with its reason')
  await ev('document.querySelector("#tab-sect .sv-master")?.scrollIntoView({ block: "start" })'); await sleep(150)
  await shot('takeover-expanded-locked')

  // Grand Elder at a low realm: no realm gate
  await ev(`(() => { const s = gameState.get(); s.sect.rank = SECT_RANKS.length - 1; s.sect.contribution = 6000; s.stageIndex = 9; gameState._wsMine().stance = 45; gameState._recalc(); gameState._notify() })()`)
  assert(await ev('collectAttention(gameState.get(), gameState).some(a => a.id === "sect-master")'), 'a Grand Elder sees the master\'s seat in the attention list')
  const pass = async tag => {
    await toSect()
    assert(await ev('!document.querySelector("#tab-sect .sv-master [data-sa=mchallenge]").disabled && !document.querySelector("#tab-sect .sv-master [data-sa=mpetition]").disabled'), `${tag}: a Grand Elder at a low realm may challenge or petition`)
    assert(await ev('/to the death/.test(document.querySelector("#tab-sect .sv-master").textContent) && /The prize/.test(document.querySelector("#tab-sect .sv-master").textContent)'), `${tag}: the card shows their lethal call and the prize`)
    assert(await inPane('.sv-master'), `${tag}: nothing in the master card spills past the pane`)
    await ev('document.querySelector("#tab-sect .sv-master")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`takeover-${tag}-master`)
  }
  await pick('overlay'); await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400)

  // Challenge through the real button: not to the death (forced), onto the battle page
  await pick('desktop'); await toSect()
  await ev('globalThis.__r = Math.random; Math.random = () => 0.999')
  await click('#tab-sect .sv-master [data-sa="mchallenge"]'); await sleep(200)
  await click('#confirm-yes'); await sleep(600)
  await ev('Math.random = globalThis.__r')
  assert(await ev('gameState.get().family.fight?.kind === "sectmaster" && !document.getElementById("combat-overlay").classList.contains("hidden")'), 'the challenge opens the battle page')
  assert(await ev('/Master’s Seat/.test(document.getElementById("combat-overlay").textContent)'), 'the battle page names the fight')
  await shot('takeover-desktop-fight')
  await F.win()
  assert(await ev('combatView.step === "end" && document.querySelectorAll("#combat-panel .cb-end").length === 2'), 'a won challenge offers its end choices')
  await shot('takeover-desktop-end')
  await click('#combat-panel .cb-end.raise, #combat-panel .cb-end.spare'); await sleep(400)
  assert(await ev('gameState.get().ownSect.founded && gameState.get().ownSect.name === "Thunder Palace" && !gameState.get().sect.id'), 'the sect is yours')
  await shot('takeover-desktop-result')
  await ev('combatView.step = "result"; combatView.close()'); await sleep(300)

  // The founder Overview: the taken line + the old guard, in every mode
  const og = async tag => {
    await toSect()
    assert(await ev('/Taken from/.test(document.querySelector("#tab-sect").textContent) && document.querySelectorAll("#tab-sect .sv-oldguard [data-sa=oldguard]").length === 3'), `${tag}: the Overview names the takeover and the old guard waits`)
    assert(await inPane('.sv-oldguard'), `${tag}: nothing in the old guard card spills past the pane`)
    await ev('document.querySelector("#tab-sect .sv-oldguard")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`takeover-${tag}-oldguard`)
  }
  await og('desktop')
  await pick('overlay'); await og('overlay')
  await pick('expanded'); await og('expanded')
  assert(await ev('collectAttention(gameState.get(), gameState).some(a => a.id === "old-guard" && a.tier === "urgent")'), 'the old guard is an urgent attention item')
  assert(await ev('gameState.get().world.sects.list.some(r => r.origin === "exiled")'), 'the spared master raised a splinter sect')
  await click('#tab-sect .sv-oldguard [data-sa="oldguard"][data-id="win"]'); await sleep(300)
  assert(await ev('!gameState.get().ownSect.oldGuard && gameState.get().ownSect.branches.length >= 1'), 'winning the old guard over makes them a branch')
  await shot('takeover-expanded-after')
}
