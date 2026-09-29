// Real-app smoke scenario — clan-succession.md 2.6d: death card → heir bet → reign chronicle → clan birth → birth card,
// Stats clan rows + Clan Chronicle overlay, the upbringing event in the family overlay, and resuming a mid-interlude
// save from the character select. Also 2.6e: the Challenge the Head button + confirm dialog, an NPC challenging you
// as head (family-overlay lethal/non-lethal card), and a step-down mass tournament (family-overlay join/decline
// card). Also 2.6f: Stats branch strength preview + Declare War (a branch head) + Push for War (a branch member,
// an NPC head decides) + Secede (founds a new clan, the slot follows it).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/succession.js
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
  await click('[data-tab="clan"]')
  const stats = await ev('document.getElementById("tab-clan").innerText')
  assert(/Lines/i.test(stats) && (/Clan Head/i.test(stats) || /Head of|You lead/i.test(stats)), 'Clan view: lines + who heads the clan (1.8b-4)')
  await click('[data-tab="family"]')
  assert(!/Name an Heir/i.test(await ev('document.getElementById("tab-family").innerText')), 'no heir buttons for a non-head')
  await click('[data-tab="clan"]')
  await shot('2.6d-4-stats')
  await click('[data-tab="hall"]'); await sleep(200)   // 1.8b-4: the Hall is Kin → Hall (was a pop-over)
  const hist = await ev('document.querySelectorAll("#tab-hall .hall-fold .chron-line").length')
  assert(hist >= 6, `Ancestral Hall chronicle section: ${hist} lines`)
  await shot('2.6d-5-hall-overlay')
  await click('[data-tab="clan"]')

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
  await click('[data-tab="clan"]')
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
  // A6-3a: the challenge is fought on the battle page, exchange by exchange; a win waits for the end choice
  const playOut = async t => {
    for (let i = 0; i < 12 && await ev('combatView.step === "fight" || combatView.step === "end"'); i++) {
      if (await ev('combatView.step === "end"')) { await click('#combat-panel .cb-end'); await sleep(200); continue }
      await ev('combatView.lockUntil = 0'); await click(`#combat-panel [data-tac="${t}"]`); await sleep(150)
    }
    await ev('combatView.isOpen() && combatView.step !== "died" && (combatView.step = "result", combatView.close())')
    if (await ev('combatView.step === "died"')) await sleep(3200)
  }
  assert(await ev('!!gameState.get().family.fight && combatView.isOpen() && combatView.mode === "person"'), 'the challenge opens the battle page')
  await shot('2.6e-2-fight-card')
  await playOut('guard')
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
  await click('#family-choices [data-hc="1"]'); await sleep(300)
  await playOut('press')
  assert(await ev('!gameState.get().family.headChallenge && !gameState.get().family.fight'), 'challenge fought out (you decided lethal)')
  if (await ev('!!gameState.get().interlude')) { await ev('gameState.finishInterlude()'); await click('#death-ok') }   // walked back if you lost lethally

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
  await click('#family-choices [data-sd="1"]'); await sleep(300)
  for (let b = 0; b < 4 && await ev('!!gameState.get().family.bracket'); b++) {   // A6-3a: your bouts are played
    if (!await ev('combatView.isOpen()')) await ev('combatView.resume()')
    await ev('Math.__r = Math.random; Math.random = () => 0')
    for (let i = 0; i < 12 && await ev('combatView.step === "fight" || combatView.step === "end"'); i++) {
      if (await ev('combatView.step === "end"')) { await click('#combat-panel .cb-end'); await sleep(200); continue }
      await ev('combatView.lockUntil = 0'); await click('#combat-panel [data-tac="press"]'); await sleep(150)
    }
    await ev('Math.random = Math.__r')
    if (await ev('!!document.querySelector("#combat-panel [data-nextbout]")')) { await click('#combat-panel [data-nextbout]'); await sleep(300) }
  }
  await ev('combatView.isOpen() && (combatView.step = "result", combatView.close())')
  assert(await ev('!gameState.get().family.stepDownOffer && !gameState.get().family.bracket'), 'step-down tournament resolved')
  const stats2 = await ev('document.getElementById("tab-clan").innerText')
  assert(await ev('gameState.isClanHead()'), 'you dominated the tournament and now lead the clan')
  await shot('2.6e-5-after-stepdown')

  // ── 2.6f (clan-succession.md): branch wars + secession ────────────────────────────────────────────────
  // You already lead the clan from the step-down win above, so every setup below must first hand the main
  // line to a fresh (weak) NPC head before putting you on your own branch — a clan only ever has one headId.
  // Force yourself onto a freshly declared branch line, as its head, overwhelmingly stronger than the main
  // line — an easy, deterministic win (the win/lose logic itself is covered by scripts/sim/checks/succession.js).
  await ev(`(() => {
    const gs = gameState, s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id !== s.self.id)
    const mainHead = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 60, stage: 3, role: 'head' })
    w.persons[mainHead.id] = mainHead
    clan.headId = mainHead.id; clan.lines[0].headId = mainHead.id; clan.lines[0].memberIds.push(mainHead.id)
    clan.lines.push({ id: clan.id + '-smoke-branch', name: 'Southern Branch', headId: s.self.id, memberIds: [s.self.id], foundedYear: Math.floor(w.year) })
    w.playerLineId = clan.id + '-smoke-branch'
    s.stageIndex = 200; s.maxStageThisLife = 200; s.family.branchWarCooldownYear = null
    gs._recalc(); gs._notify()
  })()`)
  await click('[data-tab="clan"]')
  const stats3 = await ev('document.getElementById("tab-clan").innerText')
  assert(/Your branch vs the main line/i.test(stats3) && /War on the Main Line/i.test(stats3) && /Secede/i.test(stats3), 'Clan view: branch strength + War on the Main Line / Secede for a branch head (1.8b-4)')
  await shot('2.6f-1-branch-stats')
  await click('#_declare-branch-war')
  await wait('!document.getElementById("confirm-overlay").classList.contains("hidden")')
  await shot('2.6f-2-declare-confirm')
  await click('#confirm-yes')
  await sleep(300)
  assert(await ev('gameState.get().world.clans[gameState.get().world.playerClanId].headId === gameState.get().self.id'), 'overwhelming branch wins outright — you now lead the clan')
  await shot('2.6f-3-after-declare')

  // Push for war as a plain branch MEMBER (an NPC leads the new branch) — the head decides, not you.
  await ev(`(() => {
    const gs = gameState, s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id !== s.self.id)
    const mainHead = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 60, stage: 3, role: 'head' })
    w.persons[mainHead.id] = mainHead
    clan.headId = mainHead.id; clan.lines[0].headId = mainHead.id; clan.lines[0].memberIds.push(mainHead.id)
    const head = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: 5, role: 'branch_head' })
    head.personality = 'hotblood'   // a willing head, deterministic enough for a smoke pass
    w.persons[head.id] = head
    clan.lines.push({ id: clan.id + '-smoke-branch-2', name: 'Northern Branch', headId: head.id, memberIds: [head.id, s.self.id], foundedYear: Math.floor(w.year) })
    w.playerLineId = clan.id + '-smoke-branch-2'
    s.stageIndex = 0; s.maxStageThisLife = 0   // a weak pusher — win/lose doesn't matter here, only that it fires
    s.family.branchWarCooldownYear = null
    gs._recalc(); gs._notify()
  })()`)
  const pw = await ev('gameState.canPushBranchWar()')
  assert(pw.ok, `canPushBranchWar: ${JSON.stringify(pw)}`)
  await click('#_push-branch-war')
  await wait('!document.getElementById("confirm-overlay").classList.contains("hidden")')
  await shot('2.6f-4-push-confirm')
  await click('#confirm-yes')
  await sleep(300)
  if (await ev('!!gameState.get().interlude')) { await ev('gameState.finishInterlude()'); await click('#death-ok') }   // walked back if the war killed you
  await shot('2.6f-5-after-push')

  // Secede — a branch head leaves outright with their whole branch and founds a new clan; the slot follows it.
  await ev(`(() => {
    const gs = gameState, s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id !== s.self.id)
    if (clan.headId === s.self.id) {
      const mainHead = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 60, stage: 3, role: 'head' })
      w.persons[mainHead.id] = mainHead
      clan.headId = mainHead.id; clan.lines[0].headId = mainHead.id; clan.lines[0].memberIds.push(mainHead.id)
    }
    clan.lines.push({ id: clan.id + '-smoke-branch-3', name: 'Western Branch', headId: s.self.id, memberIds: [s.self.id], foundedYear: Math.floor(w.year) })
    w.playerLineId = clan.id + '-smoke-branch-3'
    gs._recalc(); gs._notify()
  })()`)
  const oldClanId = await ev('gameState.get().world.playerClanId')
  await click('[data-tab="clan"]')
  await click('#_secede')
  await wait('!document.getElementById("confirm-overlay").classList.contains("hidden")')
  await shot('2.6f-6-secede-confirm')
  await click('#confirm-yes')
  await sleep(300)
  const newClanId = await ev('gameState.get().world.playerClanId')
  assert(newClanId !== oldClanId, `secession founds a new clan and the slot follows it (${oldClanId} → ${newClanId})`)
  await shot('2.6f-7-after-secede')

  // ── Phase 31 (M2 task 2.7f, clan-succession.md §2.7): Ancestral Hall — records/tree/legacies, and a
  // successful Ascension now ending the life (fixes the post-Ascension dead zone) instead of leaving the
  // character idling at an unreachable stub stage.
  await ev(`(() => { const w = gameState.get().world, clan = w.clans[w.playerClanId]; clan.merit = 500; gameState._recalc(); gameState._notify() })()`)
  await click('[data-tab="clan"]')
  await click('[data-tab="hall"]')
  await wait('!!document.querySelector("#tab-hall .hall-tiles")')
  const records = await ev('document.querySelector("#tab-hall .hall-tiles").innerText')
  assert(/Merit/i.test(records), `Hall records show Ancestral Merit: "${records.slice(0, 80)}"`)
  const legacyBtns = await ev('document.querySelectorAll("#tab-hall [data-buy]:not(:disabled)").length')
  assert(legacyBtns > 0, `at least one legacy is buyable (${legacyBtns})`)
  await shot('2.7f-1-hall-legacies')
  const meritBefore = await ev('gameState.get().world.clans[gameState.get().world.playerClanId].merit')
  await click('#tab-hall [data-buy]:not(:disabled)')
  const meritAfter = await ev('gameState.get().world.clans[gameState.get().world.playerClanId].merit')
  assert(meritAfter < meritBefore, `buying a legacy from the Hall spends Merit (${meritBefore} → ${meritAfter})`)
  await shot('2.7f-2-legacy-bought')
  await click('[data-tab="clan"]')

  // Force Qi to cap at the last mortal stage, then click through the real Ascension Trial button/overlay.
  const ascendingClanId = await ev('gameState.get().world.playerClanId')
  await ev(`(() => {
    const gs = gameState, s = gs.get(), lastMortal = CULTIVATION_STAGES.length - 2
    s.stageIndex = lastMortal; s.maxStageThisLife = lastMortal
    gs._recalc(); s.qi = gs.get().derived.qiCap; gs._recalc(); gs._notify()
  })()`)
  await click('#btn-breakthrough')
  await wait('!document.getElementById("ascension-overlay").classList.contains("hidden")')
  await shot('2.7f-3-ascension-trial')
  await ev('window.__savedRandom = Math.random; Math.random = () => 0')   // force the ascension roll to succeed
  await click('#ascend-now')
  await ev('Math.random = window.__savedRandom')
  // 40b: a successful Trial plays the Immortal Ascension cinematic + finish screen first; skip to its end, Continue
  if (await ev('typeof immortalView !== "undefined" && immortalView.isOpen()')) {
    await ev('(() => { const c = immortalView.cine; c.frozen = false; c.t = Math.max(c.t, c.length - 0.05); if (!c.running) c._start() })()')
    await wait('document.getElementById("finish-box").classList.contains("shown")', 4000); await sleep(1300)
    await click('#finish-box [data-fin="continue"]'); await sleep(500)
  }
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")')
  const cause = await ev('document.getElementById("death-cause").textContent')
  assert(/Ascended Ancestor|Immortal Realms/i.test(cause), `Ascension now ends the life instead of leaving it idle: "${cause}"`)
  await shot('2.7f-4-ascended-death-card')
  await ev('gameState.finishInterlude()')
  await click('#death-ok')   // finishInterlude() bypasses the UI's own re-render (same as every other checks/*-style call above)
  // Checked against the clan you ASCENDED in, not necessarily the one you're reborn into — rebirth may
  // land you an orphan if that clan had no other living candidates, which is a separate, unrelated outcome.
  assert(await ev(`gameState.get().world.clans[${JSON.stringify(ascendingClanId)}]?.ascendedAncestors >= 1`), 'the clan records the Ascended Ancestor')
  await shot('2.7f-5-after-ascension')
}
