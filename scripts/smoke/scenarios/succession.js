// Real-app smoke scenario — clan-succession.md 2.6d: death card → heir bet → reign chronicle → clan birth → birth card,
// Stats clan rows + Clan Chronicle overlay, the upbringing event in the family overlay, and resuming a mid-interlude
// save from the character select. Also 2.6e: the Challenge the Head button + confirm dialog, an NPC challenging you
// as head (family-overlay lethal/non-lethal card), and a step-down mass tournament (family-overlay join/decline
// card). Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/succession.js
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

  // ── 2.6e (clan-succession.md): challenge the head, be challenged as head, step-down tournament ──────
  await click('.tab[data-tab="stats"]')
  // Tie your stage with the head so the button is always enabled (outcome may go either way — the point
  // here is the UI wiring, not the fight; scripted checks cover the win/lose logic deterministically).
  await ev('(() => { const gs = gameState, s = gs.get(); s.stageIndex = gs.person(s.world.clans[s.world.playerClanId].headId).stageIndex; gs._recalc(); gs._notify() })()')
  const cc = await ev('gameState.canChallengeHead()')
  assert(cc.ok, `canChallengeHead: ${JSON.stringify(cc)}`)
  await click('#_challenge-head')
  await wait('!document.getElementById("confirm-overlay").classList.contains("hidden")')
  await shot('2.6e-1-challenge-confirm')
  await click('#confirm-yes')
  await sleep(300)
  await shot('2.6e-2-after-challenge')
  if (await ev('!!gameState.get().interlude')) { await ev('gameState.finishInterlude()'); await click('#death-ok') }   // walked back to a live game if you lost lethally

  // An NPC challenges you as head (forced state) → the family overlay's lethal/non-lethal choice is yours.
  await ev(`(() => {
    const gs = gameState, s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    clan.headId = s.self.id; clan.lines[0].headId = s.self.id
    const p = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: 1, role: 'kin' })
    w.persons[p.id] = p; clan.lines[0].memberIds.push(p.id)
    s.family.headChallenge = { challengerId: p.id, year: Math.floor(w.year) }
    gs._recalc(); gs._notify()
  })()`)
  await wait('!document.getElementById("family-overlay").classList.contains("hidden")')
  const hcTitle = await ev('document.getElementById("family-title").textContent')
  assert(hcTitle.includes('Challenged'), `head-challenge card: "${hcTitle}"`)
  await shot('2.6e-3-head-challenge-card')
  await click('#family-choices [data-hc="1"]')
  assert(await ev('!gameState.get().family.headChallenge'), 'challenge resolved (you decided lethal)')

  // The sitting (NPC) head steps back — a mass succession tournament, joinable, resolved instantly.
  await ev(`(() => {
    const gs = gameState, s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    const otherHead = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 60, stage: 15, role: 'head' })
    w.persons[otherHead.id] = otherHead
    clan.headId = otherHead.id; clan.lines[0].headId = otherHead.id
    if (!clan.lines[0].memberIds.includes(otherHead.id)) clan.lines[0].memberIds.push(otherHead.id)
    const m1 = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: 2, role: 'kin' })
    const m2 = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: 2, role: 'kin' })
    w.persons[m1.id] = m1; w.persons[m2.id] = m2
    clan.lines[0].memberIds.push(m1.id, m2.id)
    s.stageIndex = 30   // by far the strongest possible entrant, so joining wins deterministically in practice
    s.family.stepDownOffer = { headId: otherHead.id, year: Math.floor(w.year), entrantIds: [m1.id, m2.id, s.self.id], eligible: true }
    gs._recalc(); gs._notify()
  })()`)
  await wait('!document.getElementById("family-overlay").classList.contains("hidden")')
  const sdTitle = await ev('document.getElementById("family-title").textContent')
  assert(sdTitle.includes('Open'), `step-down card: "${sdTitle}"`)
  await shot('2.6e-4-stepdown-card')
  await click('#family-choices [data-sd="1"]')
  assert(await ev('!gameState.get().family.stepDownOffer'), 'step-down tournament resolved')
  const stats2 = await ev('document.getElementById("tab-stats").innerText')
  assert(/You lead the clan/i.test(stats2), 'you dominated the tournament and now lead the clan')
  await shot('2.6e-5-after-stepdown')
}
