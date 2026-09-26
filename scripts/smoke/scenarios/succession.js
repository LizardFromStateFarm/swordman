// Real-app smoke scenario — clan-succession.md 2.6d: death card → heir bet → reign chronicle → clan birth → birth card,
// Stats clan rows + Clan Chronicle overlay, the upbringing event in the family overlay, and resuming a mid-interlude
// save from the character select. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/succession.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  // A first-life clan head with a spouse and three adult children, no heir named → the clan must pick (bet).
  await ev(`(() => {
    const gs = gameState, s = gs.get()
    s.name = 'Lin Mei'; s.stageIndex = 18; s.maxStageThisLife = 18; s.spiritStones = 1e6; gs._recalc()
    s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
    const f = gs.get().family; f.planning = 'none'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
    for (let i = 0; i < 3; i++) { const c = gs._makeChild(f.spouse); c.bornYear -= 40; c.stageIndex = 6 + i }
    gs._recalc(); gs._notify()
  })()`)
  await ev('gameState.passTheMantle()')
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")')
  const bets = await ev('document.querySelectorAll("#interlude-choices [data-bet]").length')
  assert(bets === 3, `death card shows the heir bet (${bets} candidates)`)
  await shot('2.6d-1-bet')
  await click('#interlude-choices [data-bet]')
  const chron = await ev('document.querySelectorAll("#interlude-body .chron-line").length')
  const head = await ev('document.getElementById("interlude-head").textContent')
  assert(chron >= 5 && head.startsWith('The Reign of'), `chronicle card: "${head}" · ${chron} lines`)
  assert(await ev('!!document.querySelector("#interlude-body .chron-bet")'), 'bet result shown')
  assert(await ev('document.querySelectorAll("#interlude-choices [data-rebirth]").length === 2'), 'clan / orphan choice offered')
  await shot('2.6d-2-chronicle')
  await click('#interlude-choices [data-rebirth="clan"]')
  assert(await ev('!document.getElementById("death-ok").classList.contains("hidden") && !gameState.get().interlude'), 'birth card, life begun')
  await shot('2.6d-3-birth')
  await click('#death-ok')
  assert(await ev('document.getElementById("death-overlay").classList.contains("hidden")'), 'birth card closes')

  // Stats: clan rows + chronicle
  await click('.tab[data-tab="stats"]')
  const stats = await ev('document.getElementById("tab-stats").innerText')
  assert(/Standing/i.test(stats) && /Clan Head/i.test(stats) && /Bond/i.test(stats), 'Stats: Standing · Clan Head · bond-with-head rows')
  assert(!/Name an Heir/i.test(stats), 'no heir buttons for a non-head')
  await shot('2.6d-4-stats')
  await click('#_chronicle')
  const hist = await ev('document.querySelectorAll("#chronicle-lines .chron-line").length')
  assert(hist >= 6, `Clan Chronicle overlay: ${hist} lines`)
  await shot('2.6d-5-chronicle-overlay')
  await click('#chronicle-close')

  // Upbringing event → family overlay
  await ev(`(() => { const s = gameState.get(); s.upbringing.due = s.world.year; gameState._tickFamily(); gameState._notify() })()`)
  await wait('!document.getElementById("family-overlay").classList.contains("hidden")')
  const upTitle = await ev('document.getElementById("family-title").textContent')
  assert(await ev('document.querySelectorAll("#family-choices [data-uchoice]").length >= 2'), `upbringing card: ${upTitle}`)
  await shot('2.6d-6-upbringing')
  const bond0 = await ev('gameState.get().birth.headBond')
  await click('#family-choices [data-uchoice]')
  assert(await ev('!gameState.get().upbringing.event'), `upbringing resolved (bond ${bond0} → ${await ev('gameState.get().birth.headBond')})`)

  // Die again mid-life, save during the bet, go back to the character select and Continue → the card resumes.
  await ev('gameState.passTheMantle()')
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")')
  const step = await ev('gameState.get().interlude?.step')
  await ev('gameState.forceSave()')
  await ev('location.reload()')
  await sleep(1500)
  await wait('document.querySelector(".cs-btn-play[data-slot=\\"0\\"]")', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")')
  assert(await ev(`gameState.get().interlude?.step === ${JSON.stringify(step)}`), `mid-interlude save resumes on Continue (step ${step})`)
  await ev('gameState.finishInterlude()')
  await click('#death-ok')
  assert(await ev('!gameState.get().interlude && gameState.get().generation === 3'), 'third life begins')
}
