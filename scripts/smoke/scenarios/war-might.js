// Real-app smoke scenario — Phase 43c wars read Might (docs/systems/npc-sects.md → "43c"): a founder at war with the
// strongest real sect — Sect → War shows the foe's Might band in the header, the odds card's Might line, the
// "Their mountain" card (both Mights, the foe's halls with pips, master + stance), and the "why" card's Might row —
// in Overlay / Expanded / Desktop / phone; then a won war (forced) shows the burned hall + the odds on the Last war
// card, and a member's war shows their sect's Might against the foe's. Asserts nothing spills past the pane.
// Screenshots: scripts/smoke/out/war-might-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/war-might.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // Bind the strongest living sect as the foe, mid-preparation, with a little history between you
  const bind = `(() => { const s = gameState.get(), w = s.sectWar, M = worldSectMight
    for (let i = 0; i < 60; i++) gameState._tickWorldSects()
    const foe = s.world.sects.list.filter(r => r.alive && !r.sworn).sort((a, b) => M(b) - M(a))[0]
    if (!foe.deeds.length) gameState._wsDeed(foe, -10, 'marched on your mountain')
    w.phase = 'preparing'; w.enemyId = foe.id; w.enemyName = foe.name; w.enemyTier = foe.tier
    w.scoutEndsAt = Date.now() - 1000; w.prepEndsAt = Date.now() + 3600e3; w.reinforced = false; w.allyId = null
    s.spiritStones = Math.max(s.spiritStones, 5000); gameState._recalc(); gameState._notify(); return foe.id })()`
  const foeId = await ev(bind)
  assert(await ev(`gameState.sectWarOdds().vs.foe?.id === "${foeId}"`), 'the odds read the bound sect')

  const inPane = sel => ev(`(() => { const p = document.getElementById('tab-sect-war'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('${sel} *')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const open = async () => { await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-war"]'); await sleep(300) }
  const pass = async tag => {
    await open()
    assert(await ev('!!document.querySelector("#tab-sect-war .sv-foe-band")'), `${tag}: the header names the foe's Might band`)
    assert(await ev('/Their Might/.test(document.querySelector("#tab-sect-war .sv-odds")?.textContent || "")'), `${tag}: the odds card explains the Might match-up`)
    assert(await ev('document.querySelectorAll("#tab-sect-war .sv-foe .sv-vs-row").length === 2 && !!document.querySelector("#tab-sect-war .sv-foe .ws-pips")'), `${tag}: "Their mountain" shows both Mights and the foe's halls`)
    assert(await inPane('.sv-foe'), `${tag}: nothing in "Their mountain" spills past the pane`)
    assert(await inPane('.sv-odds'), `${tag}: nothing in the odds card spills past the pane`)
    assert(await ev(`!!document.querySelector('#tab-sect-war [data-sa="ally"]') && ![...document.querySelectorAll('#tab-sect-war [data-sa="ally"]')].some(b => b.dataset.id === gameState._wsWarEnemy()?.defId)`), `${tag}: the ally tile never offers the sect you fight`)
    await shot(`war-might-${tag}-top`)
    await ev('document.querySelector("#tab-sect-war .sv-foe")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`war-might-${tag}-mountain`)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  // The "why" card carries the Might row
  await click('#tab-sect-war [data-bd="sectwar"]'); await sleep(300)
  assert(await ev('/Might/.test(document.querySelector(".bd-pop")?.textContent || "")'), 'desktop: the "why" card names the Might match-up')
  await shot('war-might-desktop-why')
  await click('#breakdown-overlay'); await sleep(200)
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()

  // A won war: the Last war card shows the burned hall and the odds you went in with
  await pick('expanded')
  await ev(`(() => { const M = Math.random; Math.random = () => 0; try { gameState._resolveSectWar() } finally { Math.random = M } })()`)
  await ev(bind); await sleep(200)
  await open()
  assert(await ev('/burned/.test(document.querySelector("#tab-sect-war .sv-last")?.textContent || "")'), 'the Last war card shows the hall that burned')
  assert(await ev('/odds were/.test(document.querySelector("#tab-sect-war .sv-last")?.textContent || "")'), 'the Last war card shows the odds you went in with')
  await ev('document.querySelector("#tab-sect-war .sv-last")?.scrollIntoView({ block: "start" })'); await sleep(150)
  await shot('war-might-expanded-lastwar')

  // A member's war: their sect's Might against the foe's
  await ev(`(() => { const s = gameState.get(); gameState.disbandOwnSect?.(); s.stageIndex = Math.max(s.stageIndex, 16); gameState._recalc(); gameState.joinSect("thunder_palace"); gameState._recalc(); gameState._notify() })()`)
  await sleep(200)
  await ev(bind); await sleep(200)
  await open()
  assert(await ev(`(() => { const o = gameState.sectWarOdds(); return o.side === 'member' && o.vs.us === worldSectMight(gameState._wsMine()) })()`), 'member: your side is your sect\'s Might')
  assert(await ev('/your sect’s/.test(document.querySelector("#tab-sect-war .sv-odds")?.textContent || "")'), 'member: the odds card names your sect\'s Might')
  await shot('war-might-expanded-member')
}
