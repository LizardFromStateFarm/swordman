// Real-app smoke scenario — 1.8b-3b (docs/systems/family.md → "1.8b-3b"): a lover's ultimatum + lover card (cover /
// confess / end it), the fight card of a spouse duel (odds per tactic, an exchange played, the score), and a Tournament
// of Heirs round with the spare-the-loser toggle; Overlay + Desktop. Screenshots: scripts/smoke/out/fight-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/fights.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  const top = async () => { await ev(`(() => { for (let n = document.getElementById('tab-family'); n; n = n.parentElement) n.scrollTop = 0 })()`); await sleep(150) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const gs = gameState, s = gs.get(), f = s.family
    s.name = 'Lin Mei'; s.world.year += 40; s.sectWar.nextWarAt = Date.now() + 3600e3; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9; f.nextProposalYear = 1e9; f.planning = 'none'
    s.spiritStones = Math.max(s.spiritStones, 5000)
    const sp = gs._rollStranger('suitor'); sp.personality = 'hotblood'; sp.stageIndex = s.stageIndex - 1; gs._wed(sp, 55)
    const lover = gs._rollStranger('lover'); lover.personality = 'psycho'
    f.lovers.push({ person: lover, since: Math.floor(s.world.year) - 12, nextChildYear: 1e9, endsYear: 1e9, ultimatum: { year: Math.floor(s.world.year) } })
    const l2 = gs._rollStranger('lover'); l2.personality = 'niceguy'
    f.lovers.push({ person: l2, since: Math.floor(s.world.year) - 3, nextChildYear: 1e9, endsYear: 1e9 })
    gs._recalc(); gs._notify() })()`)
  await sleep(300)

  // ── Lovers ──
  await click('[data-tab="family"]'); await sleep(250); await top()
  assert(await ev('!!document.querySelector("#tab-family .fam-wish.ult")'), 'the ultimatum leads the Family view')
  assert(await ev('[...document.querySelectorAll("#attention [data-att]")].some(b => b.dataset.att === "ultimatum")'), 'attention: the ultimatum is urgent')
  await shot('fight-overlay-ultimatum')
  await ev(`document.querySelectorAll('#tab-family .fam-card.lover')[1]?.scrollIntoView({ block: 'center' })`); await sleep(150)
  assert(await ev('document.querySelectorAll("#tab-family .fam-card.lover").length') === 2, 'a card per lover')
  await shot('fight-overlay-lover')
  const r0 = await ev('gameState.affairRisk(gameState.get().family.lovers[1].person.id).perYear')
  await click('#tab-family .fam-card.lover:nth-of-type(n) [data-fa="lv-cover"]'); await sleep(200)
  assert(await ev('gameState.get().family.lovers.some(l => l.coverUntil)'), 'covering tracks takes effect')
  await ev(`(() => { const f = gameState.get().family; const id = f.lovers[0].person.id; gameState.answerLoverUltimatum(id, 'one_more') })()`)

  // ── The duel: fight card ──
  await ev(`(() => { gameState.get().family.duel = { year: 1, reason: 'affair' }; gameState._notify() })()`); await sleep(250)
  await click('#attention [data-att="duel"]'); await sleep(300)
  await click('#family-choices [data-duel="fight"]'); await sleep(300)
  assert(await ev('!!gameState.get().family.fight && document.querySelectorAll("#family-choices [data-tactic]").length === 4'), 'the fight card: three tactics + yield')
  await shot('fight-overlay-card')
  await click('#family-choices [data-tactic="guard"]'); await sleep(300)
  assert(await ev('gameState.get().family.fight ? gameState.get().family.fight.log.length === 1 : true'), 'an exchange is played and logged')
  await shot('fight-overlay-exchange')
  await pick('desktop'); await ev('document.getElementById("family-overlay").classList.contains("hidden") || true'); await sleep(200)
  if (await ev('!!gameState.get().family.fight')) { await click('#attention [data-att="fight"]'); await sleep(300); await shot('fight-desktop-card') }
  await ev(`(() => { const gs = gameState; gs.get().family.fight = null; gs.get().family.duel = null; gs._notify() })()`)
  await ev('document.getElementById("family-overlay").classList.add("hidden")')
  await click('[data-tab="family"]'); await sleep(250); await top(); await shot('fight-desktop-family')

  // ── Tournament of Heirs: spare a loser ──
  await ev(`(() => { const gs = gameState, s = gs.get(), f = s.family
    for (let i = 0; i < 6; i++) { const c = gs._makeChild(f.spouse); c.bornYear -= 20 + i; c.stageIndex = 6 + i }
    gs._recalc(); gs.startTournament(); gs._notify() })()`)
  await sleep(250)
  await click('#attention [data-att="tournament"]'); await sleep(300)
  await click('#tournament-auto'); await sleep(200)
  await click('#tournament-pairs [data-spare="0"][data-v="1"]'); await sleep(200)
  assert(await ev('!!document.querySelector("#tournament-pairs .t-switch .on.mercy")'), 'a pairing can be set to spare the loser')
  await shot('fight-desktop-tournament')
  await click('#tournament-fight'); await sleep(300)
  assert(await ev('gameState.get().family.children.some(c => c.spared && c.alive && c.estranged)'), 'the spared loser lives, estranged')
  await shot('fight-desktop-tournament-after')
  await click('#tournament-close'); await sleep(150)
  await pick('overlay')
}
