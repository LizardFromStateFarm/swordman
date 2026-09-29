// Scenario checks — clan-succession.md 2.6d: death → heir bet → the heir's reign + chronicle → rebirth. Named heir (no
// bet), the bet as a non-head, bet validation, parenting-style roll (bond/personality/trauma), branch founding, sect
// fortunes + stipend, rebirth positions (bet won/lost weights), orphan birth + returning to the last clan, extinct
// clan, the rare rival-family rebirth, interlude pauses the clock + survives save/load, upbringing event, head-only
// heir naming, and a long multi-generation chain (invariants hold, registry stays bounded).
// Run: npm run checks (all) · node scripts/sim/checks/succession.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
// 1.8b-3b: your fights are played exchange by exchange. Plays one out with the best (want 'win') or worst tactic.
// A6-3a: a won fight waits for the end choice — `end` picks it (default: finish a lethal fight, raise a non-lethal one,
// which reproduce the old outcomes). A step-down bracket chains bouts until it is settled.
const fought = (sim, gs, start, want = 'win', end = null) => { let r = null
  sim.ev(`globalThis.__fr = Math.random; Math.random = () => ${want === 'win' ? 0.001 : 0.999}`)   // decide it, not luck
  for (let i = 0; i < 60 && gs.get().family?.fight; i++) {
    const fi = gs.get().family.fight
    if (fi.over === 'won') { r = gs.personFightFinish(end || (fi.lethal ? 'finish' : 'raise')); continue }
    const t = Object.entries(gs.fightInfo().tactics).sort((a, b) => want === 'win' ? b[1] - a[1] : a[1] - b[1])[0][0]
    r = gs.fightExchange(t) }
  sim.ev('Math.random = globalThis.__fr')
  return { ...start, outcome: r?.outcome } }

// A first-life head (stage 18) married with `nKids` adult children (stages 5…), optional named heir.
async function headWithKids(seed, nKids, opts = {}) {
  const sim = await createSim({ seed, overrides: opts.overrides || [] }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.name = 'Lin Mei'; s.stageIndex = 18; s.maxStageThisLife = 18; s.spiritStones = 1e6; s.karma = 50; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  const f = gs.get().family; f.planning = 'none'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
  const kids = []
  for (let i = 0; i < nKids; i++) {
    const c = gs._makeChild(f.spouse); c.bornYear -= 40; c.stageIndex = 5 + i; c.maxStage = c.stageIndex
    c.personality = opts.pers || 'stoic'; c.bond = opts.bond ?? 60; kids.push(c)
  }
  return { sim, gs, f, kids }
}
const clanOf = gs => { const w = gs.get().world; return w.clans[w.playerClanId] }

// 2.6e helpers: a second life as a non-head member of the same clan (an NPC now leads it), and a synthetic
// clan member (a cousin/branch relative — your OWN current-life children never sit in clan.lines.memberIds
// until a death carries them into the world registry, so challengers/step-down entrants need their own).
async function nonHeadLife(seed, nKids = 3, opts = {}) {
  const r = await headWithKids(seed, nKids, opts)
  r.gs.chooseHeir(r.kids[0].id)
  r.gs.passTheMantle(); r.gs.finishInterlude('clan')
  return r
}
function addMember(gs, { stage = 5, personality = null, bond = 50 } = {}) {
  const s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
  const p = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage, role: 'kin' })
  if (personality) p.personality = personality
  p.bond = bond
  w.persons[p.id] = p
  clan.lines[0].memberIds.push(p.id)
  return p
}

// 2.6f helper: reshapes a non-head life into a BRANCH life — either as that branch's own head, or a plain
// member serving under a synthetic NPC branch head — by pulling you out of whichever line the birth lottery
// landed you on (nonHeadLife doesn't guarantee main-line) and putting you on a freshly declared branch line.
async function branchLife(seed, { asHead = true, nKids = 2, overrides = [] } = {}) {
  const r = await nonHeadLife(seed, nKids, { overrides })
  const { gs } = r, s = gs.get(), clan = clanOf(gs), w = s.world
  for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id !== s.self.id)
  let headId = s.self.id, memberIds = [s.self.id]
  if (!asHead) {
    const head = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: 5, role: 'branch_head' })
    w.persons[head.id] = head
    headId = head.id; memberIds = [head.id, s.self.id]
  }
  const line = { id: `${clan.id}-btest`, name: 'Eastern Branch', headId, memberIds, foundedYear: Math.floor(w.year) }
  clan.lines.push(line)
  return { ...r, clan, line }
}

;(async () => {
  // 1. Head dies with a named heir → no bet; the heir takes the seat; a sibling founds a branch; chronicle written.
  { const { gs, kids } = await headWithKids(1, 4)
    gs.chooseHeir(kids[1].id)
    const clanId = gs.get().world.playerClanId, yr = Math.floor(gs.get().world.year)
    gs.passTheMantle()
    const s = gs.get(), info = gs.interludeInfo(), clan = s.world.clans[clanId]
    assert(s.interlude && info.step === 'chronicle' && info.successor.id === kids[1].id && info.heirKind === 'chosen', 'named heir → no bet, straight to the chronicle')
    assert(clan.name === 'Lin', `an unnamed founding clan takes your surname at death (${clan.name})`)
    assert(clan.headId === kids[1].id && s.world.persons[kids[1].id].role === 'head' && s.world.persons[kids[1].id].parentingStyle in { nurturing: 1, strict: 1, neglectful: 1, ruthless: 1 }, `heir is head with a style (${s.world.persons[kids[1].id].parentingStyle})`)
    assert(clan.lines.length === 2 && clan.lines[1].headId === kids[3].id && !clan.lines[0].memberIds.includes(kids[3].id), 'the strongest other adult sibling founds a branch (and leaves the main line)')
    assert(info.chronicle.length >= 4 && clan.history.some(h => h.year === yr), `chronicle ${info.chronicle.length} lines, saved to clan.history`)
    assert(!clan.pendingSuccession, 'pendingSuccession consumed')
    const age0 = s.age, y0 = s.world.year
    gs.tick(60)
    assert(gs.get().world.year === y0 && gs.get().age === age0, 'interlude: the clock does not move')
    assert(gs.chooseRebirth('nope').reason === 'bad_choice' && gs.placeBet(kids[0].id).reason === 'no_bet', 'bad rebirth choice / late bet rejected')
    const r = gs.chooseRebirth('clan'), s2 = gs.get()
    assert(r.ok && !s2.interlude && s2.birth && ['eldest', 'younger', 'branch', 'rival'].includes(s2.birth.position), `reborn: ${s2.birth.position}`)
    assert(s2.world.year - yr === s2.interlude?.reignYears || (s2.world.year - yr >= 40 && s2.world.year - yr <= 80), `world jumps a generation (${yr} → ${s2.world.year})`)
    assert(s2.self.family === 'Lin' && s2.name.startsWith('Lin ') && s2.self.parents.length === 2 && s2.self.bornYear === s2.world.year - 16, `you are ${s2.name}, born ${s2.self.bornYear}, with two parents`)
    const c2 = clanOf(gs)
    assert(c2.headId !== s2.self.id && c2.lines.some(l => l.id === s2.world.playerLineId && l.memberIds.includes(s2.self.id)) && !s2.world.persons[s2.self.id], 'on the roster, not head, not in the registry')
    assert(s2.birth.headBond >= 0 && s2.birth.headBond <= 100 && s2.upbringing?.due > s2.world.year, `bond with the head ${s2.birth.headBond}; upbringing due`)
    assert(gs.chooseHeir(kids[0].id).reason === 'not_head' && gs.startTournament().reason === 'not_head', 'only the clan head names an heir / hosts a tournament')
  }

  // 2. Second death as a non-head → the old head steps down; you bet on their children.
  { const { gs } = await headWithKids(2, 5)
    gs.passTheMantle(); gs.finishInterlude('clan')
    const clan = clanOf(gs), oldHead = clan.headId
    gs.passTheMantle()
    const info = gs.interludeInfo()
    assert(info.step === 'bet' && info.candidates.length >= 2 && info.candidates.every(p => p.parents.includes(oldHead)), `non-head death: bet among the head's ${info.candidates.length} children`)
    assert(gs.placeBet('p999999').reason === 'bad_candidate', 'bet on a stranger rejected')
    const pick = info.candidates[info.candidates.length - 1].id
    const r = gs.placeBet(pick), after = gs.interludeInfo()
    assert(r.ok && after.step === 'chronicle' && after.betWon === (after.successor.id === pick), `bet ${r.won ? 'won' : 'lost'} — recorded consistently`)
    assert(gs.get().world.persons[oldHead].role === 'elder' && gs.get().world.persons[oldHead].alive !== false, 'old head steps down into seclusion (alive — nobody dies of age)')
    gs.chooseRebirth('clan')
    assert(gs.get().lastReincarnation.birth.betWon === r.won && gs.get().lastReincarnation.heirKind === 'clan', 'bet + clan pick recorded on lastReincarnation')
  }

  // 3. Parenting style roll: the inputs push the odds the right way.
  { const { gs } = await headWithKids(3, 1)
    const roll = (p, n = 400) => { const c = {}; for (let i = 0; i < n; i++) { const st = gs._rollStyle(p).style; c[st] = (c[st] || 0) + 1 } return c }
    const warm = roll({ bond: 95, morality: 60, personality: 'niceguy' }), cold = roll({ bond: 5, morality: -80, personality: 'psycho' })
    assert(warm.nurturing > 200 && (cold.ruthless || 0) > 200, `loved niceguy → nurturing ${warm.nurturing}/400; neglected psycho → ruthless ${cold.ruthless}/400`)
    const paths = {}; for (let i = 0; i < 400; i++) { const r = gs._rollStyle({ bond: 50, morality: 0, personality: 'stoic', trauma: true }); paths[r.traumaPath] = (paths[r.traumaPath] || 0) + 1 }
    assert(paths.never_again > 150 && paths.cycle > 150, `trauma: never again ${paths.never_again} · the cycle continues ${paths.cycle}`)
  }

  // 4. Tournament heir → 3 branches; clan sect snapshot → fortunes + stipend.
  { const { gs, kids } = await headWithKids(4, 6)
    const s = gs.get(); s.ownSect.founded = true; s.ownSect.name = 'Azure Peak'; s.ownSect.hallLevel = 3
    gs.startTournament(); while (gs.get().family.tournament) {
      const info = gs.tournamentInfo(), pool = [...info.pool]; const pairs = []; while (pairs.length < info.fights) pairs.push([pool.shift(), pool.pop()])
      gs.fightTournamentRound(pairs)
    }
    const clanId = gs.get().world.playerClanId
    gs.passTheMantle()
    const it = gs.get().interlude, clan = gs.get().world.clans[clanId]
    assert(it.heirKind === 'tournament' && clan.lines.length === 4, `tournament heir; places 2–4 found ${clan.lines.length - 1} branches`)
    assert(['grow', 'hold', 'decline', 'lost'].includes(it.sectFate), `sect fate rolled: ${it.sectFate}`)
    const hall = clan.sect?.hallLevel
    gs.chooseRebirth('clan')
    const b = gs.get().birth
    assert(it.sectFate === 'lost' ? b.stipend === 0 && gs.get().world.enemies.some(e => e.why.includes('Azure Peak'))
      : b.stipend === Math.round(STIPEND(gs, hall, b)), `stipend ${b.stipend} for a ${b.position} (sect ${it.sectFate})`)
  }

  // 5. Positions: bet won favors the main line, bet lost favors a branch (many rebirths, same setup).
  { const tally = { won: {}, lost: {} }
    for (let seed = 100; seed < 160; seed++) {
      const { gs, kids } = await headWithKids(seed, 5)
      gs.chooseHeir(kids[4].id)
      gs.passTheMantle(); gs.finishInterlude('clan')          // life 2: the heir reigns, one branch exists
      gs.passTheMantle()                                      // life 2 dies → bet
      const info = gs.interludeInfo(); if (info.step !== 'bet') continue
      gs.placeBet(info.candidates[0].id)
      const won = gs.get().interlude.betWon; gs.chooseRebirth('clan')
      const pos = gs.get().birth.position, t = won ? tally.won : tally.lost; t[pos] = (t[pos] || 0) + 1
    }
    const share = (t, k) => (t[k] || 0) / Math.max(1, Object.values(t).reduce((a, b) => a + b, 0))
    assert(share(tally.won, 'eldest') > share(tally.lost, 'eldest') && share(tally.lost, 'branch') > share(tally.won, 'branch'),
      `bet won → eldest ${(share(tally.won, 'eldest') * 100).toFixed(0)}% / branch ${(share(tally.won, 'branch') * 100).toFixed(0)}%; lost → eldest ${(share(tally.lost, 'eldest') * 100).toFixed(0)}% / branch ${(share(tally.lost, 'branch') * 100).toFixed(0)}%`)
  }

  // 6. Orphan: no clan, the clan lives on; an orphan death returns to that clan's succession.
  { const { gs } = await headWithKids(6, 3)
    const clanId = gs.get().world.playerClanId
    gs.passTheMantle(); gs.finishInterlude('orphan')
    let s = gs.get()
    assert(s.world.playerClanId === null && s.world.lastClanId === clanId && s.birth.position === 'orphan' && s.self.family === '' && !s.upbringing, 'orphan: no clan, no upbringing; the last clan is remembered')
    assert(s.world.clans[clanId].headId && !s.world.clans[clanId].extinct, 'the clan lives on without you')
    gs.passTheMantle(); const info = gs.interludeInfo()
    assert(info.chronicle[0].includes('no clan mourns you') && info.canJoinClan !== false, 'orphan death: mourned by none, yet the old clan still turns its wheel')
    gs.finishInterlude('clan'); s = gs.get()
    assert(s.world.playerClanId === clanId || s.birth.rival, `orphan → reborn into the old clan again (${s.birth.position})`)
  }

  // 7. Extinct clan: nobody left → orphan only.
  { const { gs } = await headWithKids(7, 0)
    const clan = clanOf(gs); for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id === gs.get().self.id)
    gs.get().family.spouse = null; gs.get().family.affection = null
    gs.passTheMantle()
    const info = gs.interludeInfo()
    assert(info.extinct && !info.canJoinClan && info.chronicle.some(l => l.includes('passes into history')), 'no one left → the clan is extinct')
    assert(gs.chooseRebirth('clan').reason === 'no_clan' && gs.chooseRebirth('orphan').ok && gs.get().world.playerClanId === null, 'extinct → orphan only')
  }

  // 8. The rare rival-family rebirth (forced to 100% here): a spouse who dueled you → born into their family.
  { const { gs } = await headWithKids(8, 2, { overrides: ['RIVAL_REBIRTH_CHANCE = 1'] })
    const f = gs.get().family, spName = Persons_fullName(f.spouse), surname = f.spouse.family
    gs._noteEnemy({ kind: 'person', personId: f.spouse.id, name: spName, surname, why: 'betrayed you' })
    const home = gs.get().world.playerClanId
    gs.passTheMantle(); gs.finishInterlude('clan')
    const s = gs.get(), rc = s.world.clans[s.world.playerClanId]
    assert(s.birth.position === 'rival' && s.birth.rival && rc.id !== home && rc.name === surname, `reborn into the ${rc.name} family — ${spName}'s house`)
    assert(rc.relations[home] === -60 && s.world.clans[home].relations[rc.id] === -60, 'the two clans are rivals (relation −60)')
    assert(rc.headId && rc.lines[0].memberIds.includes(s.self.id) && s.self.family === surname, 'on the rival roster with their surname')
    assert(s.lastReincarnation.birth.chronicle.slice(-1)[0].includes(spName), 'the chronicle names whose house it is')
  }
  { const { gs } = await headWithKids(9, 2)   // default chance, no enemies → never
    gs.passTheMantle(); gs.finishInterlude('clan'); assert(!gs.get().birth.rival, 'no known enemy → no rival rebirth') }

  // 9. Save/load mid-interlude: the unborn life persists, gains nothing offline, and resumes.
  { const { sim, gs } = await headWithKids(10, 3)
    gs.passTheMantle(); const it0 = JSON.stringify(gs.get().interlude)
    gs.forceSave(); sim.clock.now += 4 * 3600e3; await sim.boot(0)
    const s = gs.get()
    assert(JSON.stringify(s.interlude) === it0 && s.qi === 0, 'interlude survives save/load; no offline Qi for an unborn life')
    assert(!s.world.clans[s.world.playerClanId].lines.some(l => l.memberIds.includes(s.self.id)), 'unborn self never joins a roster on load')
    assert(gs.finishInterlude('clan').ok && !gs.get().interlude, 'resumed and finished after load')
  }

  // 10. Upbringing: fires a few years in, bond with the head moves by YOUR personality.
  { const { gs } = await headWithKids(11, 3)
    gs.passTheMantle(); gs.finishInterlude('clan')
    const s = gs.get(); s.personality.id = 'psycho'; s.upbringing.style = 'ruthless'; s.upbringing.due = s.world.year
    gs._tickFamily()
    assert(s.upbringing.event && gs.upbringingEventDef(s.upbringing.event), `upbringing event fired: ${s.upbringing.event?.id}`)
    s.upbringing.event = { id: 'up_spar', style: 'ruthless', year: 1 }
    const b0 = s.birth.headBond
    gs.resolveUpbringingEvent(1)
    assert(gs.get().birth.headBond === Math.min(100, b0 + 16) && !gs.get().upbringing.event && gs.get().upbringing.done === 'up_spar', `psycho finishes the spar as the head wants: bond ${b0} → ${gs.get().birth.headBond}`)
    assert(gs.resolveUpbringingEvent(0).reason === 'no_event', 'only once')
  }

  // 11. Many generations in one world: invariants hold, the registry stays bounded, heads stay alive.
  { const { gs } = await headWithKids(12, 4)
    let bad = 0, maxPersons = 0
    for (let g = 0; g < 30; g++) {
      const s = gs.get(); s.stageIndex = 10 + (g % 8); s.maxStageThisLife = s.stageIndex
      gs.passTheMantle(); gs.finishInterlude(g % 7 === 3 ? 'orphan' : null)
      const w = gs.get().world
      for (const c of Object.values(w.clans)) {
        const h = c.headId === gs.get().self.id ? gs.get().self : w.persons[c.headId]
        if ((!c.extinct && (!h || h.alive === false)) || c.lines.length > 4) bad++
      }
      if (w.persons[gs.get().self.id] || gs.get().interlude) bad++
      maxPersons = Math.max(maxPersons, Object.keys(w.persons).length)
    }
    const w = gs.get().world
    assert(bad === 0 && w.pastLives.length === 30, `30 lives: every clan has a living head, ≤ 3 branches, no duplicated self (${bad} problems)`)
    assert(maxPersons < 1500, `registry stays bounded (${maxPersons} persons at most)`)
    assert(gs.get().generation === 31 && w.year > 30 * 40, `generation ${gs.get().generation}, world year ${w.year}`)
  }

  // ── 2.6e (clan-succession.md): challenge the head, be challenged as head, step-down tournaments ──────

  // 12. canChallengeHead: is_head / stage_gap / cooldown / ok / no_clan.
  { const { gs } = await headWithKids(20, 2)
    assert(gs.canChallengeHead().reason === 'is_head', 'the sitting head cannot challenge themselves')
    const { sim, gs: gs2 } = await nonHeadLife(21)
    const GAP = sim.ev('CHALLENGE_STAGE_GAP')
    const s = gs2.get(), clan = clanOf(gs2), head = gs2.person(clan.headId)
    s.stageIndex = head.stageIndex + GAP + 1
    assert(gs2.canChallengeHead().reason === 'stage_gap', 'too far above the head → stage_gap')
    s.stageIndex = head.stageIndex
    const ok = gs2.canChallengeHead()
    assert(ok.ok && ok.head.id === head.id, 'within the gap → ok, names the head')
    s.family.challengeCooldownYear = s.world.year + 50
    const cd = gs2.canChallengeHead()
    assert(cd.reason === 'cooldown' && cd.readyYear === s.family.challengeCooldownYear, 'on cooldown → cooldown, with a ready year')
    s.family.challengeCooldownYear = null
    gs2.passTheMantle(); gs2.finishInterlude('orphan')
    assert(gs2.canChallengeHead().reason === 'no_clan', 'an orphan life has no head to challenge')
  }

  // 13. challengeHead — lethal win: the old head dies, you take the seat + the clan's sect, forged in blood.
  { const { sim, gs } = await nonHeadLife(30, 3, { overrides: ['CHALLENGE_STAGE_GAP = 50', 'TOURNAMENT_LUCK = 0', 'LETHAL_CHANCE_RANGE = [100, 100]'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId
    s.stageIndex = gs.person(headId).stageIndex + 20; s.maxStageThisLife = s.stageIndex
    clan.sect = { name: 'Azure Peak', hallLevel: 2, founded: true, foundedAt: 0, buildings: {}, disciples: [], recruitPool: [], poolRefreshAt: 0, _incomeAcc: { spirit_stone: 0, spirit_herb: 0 } }
    const bqBefore = s.bloodlineQuality, karmaBefore = s.karma
    const res = fought(sim, gs, gs.challengeHead(), 'win'); const s2 = gs.get()
    assert(res.ok && res.outcome === 'won_lethal' && res.lethal, `lethal win: ${res.outcome}`)
    assert(s2.world.persons[headId].alive === false && s2.world.persons[headId].cause === 'challenge', 'the old head is dead')
    assert(clanOf(gs).headId === s2.self.id && s2.self.trauma === true, 'you take the seat, forged in blood')
    assert(s2.bloodlineQuality > bqBefore && s2.karma < karmaBefore, `Bloodline grows (${bqBefore.toFixed(1)} → ${s2.bloodlineQuality.toFixed(1)}), karma costs the kill (${karmaBefore} → ${s2.karma})`)
    assert(s2.ownSect.founded && s2.ownSect.name === 'Azure Peak' && clanOf(gs).sect === null, 'the clan sect passes to you')
    assert(clanOf(gs).tradition.challenges === 1, 'clan tradition tracks the challenge')
  }

  // 14. challengeHead — non-lethal win: the old head lives on as an elder, no trauma, no Bloodline change.
  { const { sim, gs } = await nonHeadLife(31, 3, { overrides: ['CHALLENGE_STAGE_GAP = 50', 'TOURNAMENT_LUCK = 0', 'LETHAL_CHANCE_RANGE = [0, 0]'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId
    s.stageIndex = gs.person(headId).stageIndex + 20; s.maxStageThisLife = s.stageIndex
    const bqBefore = s.bloodlineQuality
    const res = fought(sim, gs, gs.challengeHead(), 'win'); const s2 = gs.get()
    assert(res.ok && res.outcome === 'won_nonlethal' && !res.lethal, `non-lethal win: ${res.outcome}`)
    assert(s2.world.persons[headId].alive !== false && s2.world.persons[headId].role === 'elder', 'the old head lives on as an elder')
    assert(clanOf(gs).headId === s2.self.id && !s2.self.trauma && s2.bloodlineQuality === bqBefore, 'you take the seat, unscarred, Bloodline unchanged')
  }

  // 15. challengeHead — lethal loss: your challenge ends your life.
  { const { sim, gs } = await nonHeadLife(32, 3, { overrides: ['CHALLENGE_STAGE_GAP = 50', 'TOURNAMENT_LUCK = 0', 'LETHAL_CHANCE_RANGE = [100, 100]'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId
    s.stageIndex = Math.max(0, gs.person(headId).stageIndex - 20); s.maxStageThisLife = s.stageIndex
    gs.person(headId).stageIndex = Math.max(gs.person(headId).stageIndex, s.stageIndex + 20)   // a real gap (1.8b-3b: odds, not luck=0)
    const res = fought(sim, gs, gs.challengeHead(), 'lose')
    assert(res.ok && res.outcome === 'lost_lethal' && res.lethal, `lethal loss: ${res.outcome}`)
    assert(gs.get().interlude && gs.get().lastReincarnation.cause === 'challenge_lost', 'your life ends; the clan you challenged carries on')
    assert(gs.get().world.clans[clan.id].headId === headId, 'the head you failed to topple keeps the seat')
  }

  // 16. challengeHead — non-lethal loss: cooldown, bond hit, you stay put — the head keeps the seat.
  { const { sim, gs } = await nonHeadLife(33, 3, { overrides: ['CHALLENGE_STAGE_GAP = 50', 'TOURNAMENT_LUCK = 0', 'LETHAL_CHANCE_RANGE = [0, 0]'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId
    s.stageIndex = Math.max(0, gs.person(headId).stageIndex - 20); s.maxStageThisLife = s.stageIndex
    gs.person(headId).stageIndex = Math.max(gs.person(headId).stageIndex, s.stageIndex + 20)   // a real gap (1.8b-3b: odds, not luck=0)
    const bondBefore = s.birth.headBond, bondLoss = sim.ev('CHALLENGE_BOND_LOSS')
    const st0 = gs.challengeHead()
    const res = fought(sim, gs, st0, 'lose'); const s2 = gs.get()
    assert(res.ok && res.outcome === 'lost_nonlethal' && !res.lethal, `non-lethal loss: ${res.outcome}`)
    assert(s2.family.challengeCooldownYear > s2.world.year, 'a cooldown before you may try again')
    assert(s2.birth.headId === headId ? s2.birth.headBond === Math.max(0, bondBefore - bondLoss) : true, `bond with the head drops (${bondBefore} → ${s2.birth.headBond})`)
    assert(clanOf(gs).headId === headId && !s2.interlude, 'the head keeps the seat; you live on')
  }

  // 17. resolveHeadChallenge — an NPC calls you out while you hold the seat; YOUR call on lethality.
  { const { sim, gs } = await headWithKids(40, 2, { overrides: ['TOURNAMENT_LUCK = 0'] })   // you are head from birth here
    const s = gs.get(), clan = clanOf(gs)
    const weak = addMember(gs, { stage: 1 })
    s.family.headChallenge = { challengerId: weak.id, year: Math.floor(s.world.year) }
    const res = fought(sim, gs, gs.resolveHeadChallenge(true), 'win')
    assert(res.ok && res.outcome === 'won_lethal', `you crush a weak challenger: ${res.outcome}`)
    assert(gs.get().world.persons[weak.id].alive === false, 'the challenger is dead')
    assert(clanOf(gs).headId === s.self.id && clanOf(gs).tradition.challenges === 1, 'your seat is secure; the challenge is recorded')
  }
  { const { sim, gs } = await headWithKids(41, 2, { overrides: ['TOURNAMENT_LUCK = 0'] })
    const s = gs.get()
    const strong = addMember(gs, { stage: 40 })
    s.family.headChallenge = { challengerId: strong.id, year: Math.floor(s.world.year) }
    const res = fought(sim, gs, gs.resolveHeadChallenge(false), 'lose')
    assert(res.ok && res.outcome === 'lost_nonlethal', `overpowered, you choose non-lethal for yourself and lose: ${res.outcome}`)
    assert(clanOf(gs).headId === strong.id && !gs.get().interlude, 'you step down; they take the seat; your life goes on')
  }
  { const { sim, gs } = await headWithKids(42, 2, { overrides: ['TOURNAMENT_LUCK = 0'] })
    const s = gs.get()
    const strong = addMember(gs, { stage: 40 })
    s.family.headChallenge = { challengerId: strong.id, year: Math.floor(s.world.year) }
    const res = fought(sim, gs, gs.resolveHeadChallenge(true), 'lose')
    assert(res.ok && res.outcome === 'lost_lethal', `you gamble lethal and lose: ${res.outcome}`)
    assert(gs.get().interlude && gs.get().lastReincarnation.cause === 'challenged', 'defending the seat to the death costs your life')
  }

  // 18. Step-down mass tournament: join and dominate → you take the seat + branches; decline → resolved without
  // you; too few entrants without you → no contest.
  { const { sim, gs } = await nonHeadLife(50, 3, { overrides: ['TOURNAMENT_LUCK = 0'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId, linesBefore = clan.lines.length
    const m1 = addMember(gs, { stage: 3 }), m2 = addMember(gs, { stage: 3 })
    s.stageIndex = 40; s.maxStageThisLife = 40
    s.family.stepDownOffer = { headId, year: Math.floor(s.world.year), entrantIds: [m1.id, m2.id, s.self.id], eligible: true }
    const res = fought(sim, gs, gs.answerStepDown(true))   // A6-3a: your bouts are played (fought) on the battle page
    assert(res.ok && res.joined && res.outcome === 'won', `join + dominate → ${res.outcome}`)
    assert(clanOf(gs).headId === s.self.id, 'you take the seat')
    assert(clanOf(gs).lines.length > linesBefore, `places 2–4 found new branches (${linesBefore} → ${clanOf(gs).lines.length} lines)`)
  }
  { const { gs } = await nonHeadLife(51, 3, { overrides: ['TOURNAMENT_LUCK = 0'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId, meId = s.self.id
    const m1 = addMember(gs, { stage: 3 }), m2 = addMember(gs, { stage: 8 })
    s.family.stepDownOffer = { headId, year: Math.floor(s.world.year), entrantIds: [m1.id, m2.id, meId], eligible: true }
    const res = gs.answerStepDown(false)
    assert(res.ok && !res.joined, `declined: ${res.outcome}`)
    assert(clanOf(gs).headId === m2.id, 'the strongest of the rest takes the seat without you')
    assert(gs.get().self.id === meId && !gs.get().interlude, 'you are unaffected, alive, uninvolved')
  }
  { const { gs } = await nonHeadLife(52, 3)
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId, meId = s.self.id
    s.family.stepDownOffer = { headId, year: Math.floor(s.world.year), entrantIds: [meId], eligible: true }
    const res = gs.answerStepDown(false)
    assert(res.ok && res.outcome === 'no_contest' && clanOf(gs).headId === headId, 'too few entrants without you → no contest, the head keeps the seat')
  }

  // 19. The natural schedule actually fires a challenger / a step-down offer (forced to certain via overrides).
  { const { gs } = await headWithKids(60, 2, { overrides: ['CHALLENGER_EVENT_YEARS = [0, 0]', 'CHALLENGER_EVENT_CHANCE = 1'] })
    const s = gs.get()
    addMember(gs, { stage: s.stageIndex })
    gs._tickFamily(); gs._tickFamily()
    assert(s.family.headChallenge && s.family.headChallenge.challengerId, `a challenger appears on schedule: ${s.family.headChallenge?.challengerId}`)
  }
  { const { gs } = await nonHeadLife(61, 3, { overrides: ['STEPDOWN_CHECK_YEARS = [0, 0]', 'STEPDOWN_CHANCE = {nurturing:1,strict:1,neglectful:1,ruthless:1}'] })
    const s = gs.get()
    addMember(gs, { stage: 3 }); addMember(gs, { stage: 3 })
    gs._tickFamily(); gs._tickFamily()
    assert(s.family.stepDownOffer && s.family.stepDownOffer.entrantIds.length >= 2, `the head considers stepping down on schedule: ${JSON.stringify(s.family.stepDownOffer)}`)
  }

  // ── 2.6f (clan-succession.md): branch wars + secession ───────────────────────────────────────────────

  // 20. Gating: a main-line member has no branch to push, declare for, or secede with.
  { const { gs } = await nonHeadLife(70, 2)
    assert(gs.canPushBranchWar().reason === 'main_line', 'a main-line member cannot push a branch war')
    assert(gs.canDeclareBranchWar().reason === 'main_line', 'a main-line member cannot declare one either')
    assert(gs.canSecede().reason === 'main_line', 'nor secede — only a branch head can')
  }

  // 21. Gating: a branch member may push (not declare/secede); a branch head may declare/secede (not push).
  { const { gs } = await branchLife(71, { asHead: false })
    const pw = gs.canPushBranchWar()
    assert(pw.ok, `a branch member may push their head to war: ${JSON.stringify(pw)}`)
    assert(gs.canDeclareBranchWar().reason === 'not_head', 'but may not declare it directly')
    assert(gs.canSecede().reason === 'not_head', 'nor secede')
  }
  { const { gs } = await branchLife(72, { asHead: true })
    assert(gs.canPushBranchWar().reason === 'is_head', 'a branch head has no one above them to push')
    assert(gs.canDeclareBranchWar().ok, 'but may declare war directly')
    assert(gs.canSecede().ok, 'or secede outright')
  }

  // 22. Cooldown and a busy family matter (a running Tournament of Heirs) both block a declaration.
  { const { gs } = await branchLife(73, { asHead: true })
    const s = gs.get()
    s.family.branchWarCooldownYear = s.world.year + 50
    const cd = gs.canDeclareBranchWar()
    assert(cd.reason === 'cooldown' && cd.readyYear === s.family.branchWarCooldownYear, 'a cooldown blocks another declaration')
    s.family.branchWarCooldownYear = null
    s.family.tournament = { year: 0, round: 1, pool: [], eliminated: [], lethalFought: false, fightsDone: 0 }
    assert(gs.canDeclareBranchWar().reason === 'busy', 'a running Tournament of Heirs blocks it too')
  }

  // 23. declareBranchWar — an overwhelming branch wins and survives: it becomes the new main line, the old
  // main line is demoted + relabeled, its deposed head survives as an elder, its successor is a "branch_head".
  { const { gs, clan, line } = await branchLife(74, { asHead: true, overrides: ['TOURNAMENT_LUCK = 0', 'BRANCH_WAR_DEATH_CHANCE = 0'] })
    const s = gs.get(), oldHeadId = clan.headId, oldMainId = clan.lines[0].id, linesBefore = clan.lines.length
    s.stageIndex = 200; s.maxStageThisLife = 200
    const res = gs.declareBranchWar(), clan2 = clanOf(gs)
    assert(res.ok && res.won && !res.died, `overwhelming branch wins, survives: ${JSON.stringify(res)}`)
    assert(clan2.headId === s.self.id && clan2.lines[0].id === line.id, 'your branch becomes the main line; you lead the clan')
    const demoted = clan2.lines.find(l => l.id === oldMainId)
    assert(demoted && demoted.name !== 'Main Line' && demoted.headId !== oldHeadId, `the old main line is demoted, relabeled, and re-headed (${demoted?.name})`)
    assert(gs.person(oldHeadId).alive !== false && gs.person(oldHeadId).role === 'elder', 'the deposed old head survives as an elder')
    assert(clan2.lines.length === linesBefore, 'no new line is created — the old main line is only relabeled')
    assert(s.family.branchWarCooldownYear > s.world.year && s.family.tally.branchWars === 1 && s.family.tally.branchWarsWon === 1, 'cooldown set; tally records a win')
  }

  // 24. declareBranchWar — an overmatched branch loses and survives (DEATH_CHANCE forced to 0): you are
  // deposed from your own branch's headship, but your life goes on; the main line is untouched.
  { const { gs, clan, line } = await branchLife(75, { asHead: true, overrides: ['TOURNAMENT_LUCK = 0', 'BRANCH_WAR_DEATH_CHANCE = 0'] })
    const s = gs.get(), meId = s.self.id, oldHeadId = clan.headId
    s.stageIndex = 0; s.maxStageThisLife = 0
    const res = gs.declareBranchWar()
    assert(res.ok && !res.won && !res.died, `overmatched branch loses, you survive: ${JSON.stringify(res)}`)
    assert(clanOf(gs).headId === oldHeadId && !gs.get().interlude, 'the main line is untouched; your life goes on')
    assert(clanOf(gs).lines.find(l => l.id === line.id).headId !== meId, 'you are deposed from your own branch')
  }

  // 25. declareBranchWar — an overmatched branch loses and its head dies (DEATH_CHANCE forced to 1): your
  // own declaration, lost, ends your life.
  { const { gs } = await branchLife(76, { asHead: true, overrides: ['TOURNAMENT_LUCK = 0', 'BRANCH_WAR_DEATH_CHANCE = 1'] })
    const s = gs.get()
    s.stageIndex = 0; s.maxStageThisLife = 0
    const res = gs.declareBranchWar()
    assert(res.ok && !res.won && res.died, `overmatched branch loses, its head falls: ${JSON.stringify(res)}`)
    assert(gs.get().interlude && gs.get().lastReincarnation.cause === 'branch_war', 'losing the war you declared ends your life')
  }

  // 26. pushBranchWar — a head who never agrees (WILL_RANGE forced to 0) refuses; cooldown set, no war fought.
  { const { gs } = await branchLife(80, { asHead: false, overrides: ['BRANCH_WAR_WILL_RANGE = [0, 0]'] })
    const s = gs.get()
    const res = gs.pushBranchWar()
    assert(res.ok && res.declared === false, `a reluctant head refuses: ${JSON.stringify(res)}`)
    assert(s.family.branchWarCooldownYear > s.world.year && s.family.tally.branchWars === 0, 'cooldown set; no war actually fought')
  }

  // 27. pushBranchWar — a head who always agrees (WILL_RANGE forced to 100) marches; the war resolves at once,
  // but even winning never makes the PUSHING member the head — their branch head leads it.
  { const { gs, clan, line } = await branchLife(81, { asHead: false, overrides: ['TOURNAMENT_LUCK = 0', 'BRANCH_WAR_WILL_RANGE = [100, 100]', 'BRANCH_WAR_DEATH_CHANCE = 0'] })
    const s = gs.get(), meId = s.self.id, headId = line.headId
    gs.person(headId).stageIndex = 200
    const res = gs.pushBranchWar()
    assert(res.ok && res.declared && res.won, `a willing head marches and wins: ${JSON.stringify(res)}`)
    assert(clanOf(gs).headId === headId && clanOf(gs).headId !== meId, "the branch head leads the win — pushing never makes YOU head")
    assert(s.family.tally.branchWars === 1 && s.family.tally.branchWarsWon === 1, 'tally records the fought, won war')
  }

  // 28. secede — a branch head leaves outright with their whole branch: a new clan is founded, the slot
  // follows it, the old clan keeps living, and the relation is set both ways.
  { const { gs, clan, line } = await branchLife(90, { asHead: true })
    const s = gs.get(), oldClanId = clan.id, memberIds = [...line.memberIds]
    const res = gs.secede(), s2 = gs.get(), newClan = s2.world.clans[res.clanId]
    assert(res.ok && newClan && newClan.id !== oldClanId, `a new clan is founded: ${newClan?.name}`)
    assert(s2.world.playerClanId === newClan.id && newClan.headId === s.self.id, 'the slot follows your new clan; you lead it')
    assert(newClan.lines.length === 1 && memberIds.every(id => newClan.lines[0].memberIds.includes(id)), 'your whole branch comes with you')
    assert(!s2.world.clans[oldClanId].lines.some(l => l.id === line.id), 'the old clan no longer carries your line')
    assert(newClan.relations[oldClanId] === res.relation && s2.world.clans[oldClanId].relations[newClan.id] === res.relation, `relation is set both ways (${res.relation})`)
    assert(s2.family.tally.secessions === 1, 'tally records the secession')
  }

  // ── Phase 31 (M2 task 2.7, clan-succession.md §2.7): Ancestral Merit, legacies, Ascended Ancestor, catch-up ──

  // 29. _claimFirst pays Ancestral Merit once per clan; a second identical first is a no-op.
  { const sim = await createSim({ seed: 200 }); await sim.boot(0); const gs = sim.gs
    const clan = clanOf(gs)
    const first = gs._claimFirst('married'), again = gs._claimFirst('married')
    assert(first === true && again === false, 'first claim pays; a repeat claim is a no-op')
    assert(clan.firsts.married && gs.get().lifeMerit.length === 1, 'clan.firsts recorded; queued onto lifeMerit')
  }

  // 30. Merit credited at death = stage term + this life's claimed firsts + capped deeds.
  { const { gs } = await headWithKids(201, 0)
    const s = gs.get()
    s.stageIndex = 18; s.maxStageThisLife = 18
    s.lifeMerit = [{ id: 'x', label: 'x', merit: 10 }]
    s.sectWar.warVictories = 2; s.beasts = [{ level: 1 }, { level: 1 }]   // deeds: 2×3 (war) + 2×2 (beast) = 10
    gs.passTheMantle()
    const clan = clanOf(gs)
    const stageTerm = 40 * Math.pow(18 / 22, 2), deeds = Math.min(30, 2 * 3 + 2 * 2)
    const expected = Math.round(stageTerm + 10 + deeds)
    assert(clan.merit === expected, `merit = stage(${stageTerm.toFixed(1)}) + firsts(10) + deeds(${deeds}) = ${expected}, got ${clan.merit}`)
    assert(clan.bestStageIndex >= 18, 'bestStageIndex updates at death too (belt-and-suspenders vs. the live update in attemptBreakthrough)')
  }

  // 31. buyLegacy: unknown id, locked (missing its required first), not enough merit, a successful buy deducts
  // merit and bumps the level, and it refuses once maxed.
  { const sim = await createSim({ seed: 202 }); await sim.boot(0); const gs = sim.gs
    const clan = clanOf(gs)
    assert(gs.buyLegacy('nope').reason === 'unknown', 'unknown legacy id rejected')
    assert(gs.buyLegacy('beast_lineage').reason === 'locked', 'beast_lineage needs first_beast claimed first')
    clan.merit = 0
    assert(gs.buyLegacy('ancestral_stipend').reason === 'merit', 'not enough merit rejected')
    clan.merit = 100
    const res = gs.buyLegacy('ancestral_stipend')
    assert(res.ok && res.level === 1 && clan.legacies.ancestral_stipend === 1, `level 1 bought: ${JSON.stringify(res)}`)
    assert(clan.merit === 85, `cost (15) deducted, merit now ${clan.merit}`)
    clan.merit = 1000
    gs.buyLegacy('ancestral_stipend'); gs.buyLegacy('ancestral_stipend')
    assert(clan.legacies.ancestral_stipend === 3 && gs.buyLegacy('ancestral_stipend').reason === 'maxed', 'refuses once maxed (3 levels)')
  }

  // 32. setFamilyManual: needs the legacy bought, a technique the clan actually knows, and within the bought
  // level's tier (level 1's CLAN_LEGACIES.family_manual value is minStage ≤ 3).
  { const sim = await createSim({ seed: 203 }); await sim.boot(0); const gs = sim.gs
    const clan = clanOf(gs)
    assert(gs.setFamilyManual('qi_breathing').reason === 'no_legacy', 'no legacy bought yet')
    clan.merit = 1000; gs.buyLegacy('family_manual')
    assert(gs.setFamilyManual('not_a_real_technique').reason === 'unknown', 'unknown technique id rejected')
    const highTier = sim.data.TECHNIQUES.find(t => t.minStage > 3)
    if (highTier) {
      clan.techniquesEver = [highTier.id]
      assert(gs.setFamilyManual(highTier.id).reason === 'tier', `above level 1's tier rejected (minStage ${highTier.minStage})`)
    }
    const lowTier = sim.data.TECHNIQUES.find(t => t.minStage <= 3)
    clan.techniquesEver = [lowTier.id]
    const res = gs.setFamilyManual(lowTier.id)
    assert(res.ok && clan.manualTechId === lowTier.id, `low-tier technique picked (${lowTier.id})`)
  }

  // 33. Heirloom + Beast Lineage legacies carry equipped items / a beast offspring into the next life.
  { const { sim, gs, kids } = await headWithKids(204, 1)
    const s = gs.get(), clan = clanOf(gs)
    const weaponId   = Object.keys(sim.data.ITEMS).find(id => sim.data.ITEMS[id].type === 'weapon')
    const artifactId = Object.keys(sim.data.ITEMS).find(id => sim.data.ITEMS[id].type === 'artifact')
    const beastTypeId = sim.data.BEAST_TYPES[0].id
    s.equipped = { weapon: weaponId, artifact: artifactId }
    s.beasts = [{ id: 'b1', typeId: beastTypeId, name: 'Test Beast', level: 5, xp: 0, traits: ['swift'], expedition: null }]
    clan.merit = 1000
    gs.buyLegacy('heirloom'); gs.buyLegacy('heirloom')   // level 2 = weapon + artifact
    gs._claimFirst('first_beast'); gs.buyLegacy('beast_lineage')
    gs.chooseHeir(kids[0].id)
    gs.passTheMantle(); gs.finishInterlude('clan')
    const s2 = gs.get()
    assert(s2.equipped.weapon === weaponId && s2.equipped.artifact === artifactId, `heirloom carried: ${JSON.stringify(s2.equipped)}`)
    assert(s2.beasts.length === 1 && s2.beasts[0].level === 1 && s2.beasts[0].traits.includes('swift'), `beast lineage offspring at level 1: ${JSON.stringify(s2.beasts)}`)
  }

  // 34. A successful Ascension now ENDS the life (fixes the post-Ascension dead zone): the clan records the
  // Ascended Ancestor + a blessing stack, the ancestor is marked, and it goes through the normal interlude —
  // exactly like any other death — instead of leaving the character idling at an unreachable stub stage.
  { const sim = await createSim({ seed: 205 }); await sim.boot(0); const gs = sim.gs
    const s = gs.get(), lastMortal = sim.data.CULTIVATION_STAGES.length - 2
    s.stageIndex = lastMortal; s.maxStageThisLife = lastMortal
    gs._recalc(); s.qi = gs.get().derived.qiCap; gs._recalc()
    sim.ev('globalThis.__savedRandom = Math.random; Math.random = () => 0')   // force the ascension roll to succeed
    const res = gs.attemptAscension()
    sim.ev('Math.random = globalThis.__savedRandom')
    const s2 = gs.get(), clan = clanOf(gs)
    assert(res.success && res.ascended, `attemptAscension reports success + ascended: ${JSON.stringify(res)}`)
    assert(!!s2.interlude && s2.lastReincarnation.cause === 'ascended', `the life ended via the interlude, cause 'ascended' (${s2.lastReincarnation?.cause})`)
    assert(clan.ascendedAncestors === 1 && clan.blessingStacks === 1, `clan records the Ascended Ancestor + a blessing stack (${clan.ascendedAncestors}, ${clan.blessingStacks})`)
    const w = s2.world, rec = w.pastLives[w.pastLives.length - 1]
    assert(w.persons[rec.personId]?.ascendedAncestor === true, 'the ancestor record is marked ascendedAncestor')
    assert(clan.firsts.ascended && clan.firsts.asc_attempt, 'both the attempt and the survival firsts are claimed')
  }

  // 35. Ancestral catch-up: below clan.bestStageIndex, Qi/s and breakthrough chance both get a bonus that
  // disappears once you reach the clan's best — and the auto-BT it drives fires in Active Mode too (a base
  // mechanic, unlike Phase 22's opt-in automations, which are Idle-Mode only).
  { const sim = await createSim({ seed: 206 }); await sim.boot(0); const gs = sim.gs
    const s = gs.get(), clan = clanOf(gs)
    s.stageIndex = 1; s.maxStageThisLife = 1
    clan.bestStageIndex = 5
    gs._recalc()
    const inCatchUp = gs.get().derived
    assert(inCatchUp.catchUp === true, 'derived.catchUp true below the clan best')
    clan.bestStageIndex = 0
    gs._recalc()
    const atBest = gs.get().derived
    assert(atBest.catchUp === false, 'derived.catchUp false at/above the clan best')
    assert(inCatchUp.qiPerSecond > atBest.qiPerSecond, `catch-up Qi/s (${inCatchUp.qiPerSecond.toFixed(2)}) beats normal (${atBest.qiPerSecond.toFixed(2)})`)
    assert(inCatchUp.breakthroughChance > atBest.breakthroughChance, 'catch-up breakthrough chance is higher too')
    clan.bestStageIndex = 5; s.stageIndex = 1; gs.setPlayMode('active'); gs._recalc()
    s.qi = gs.get().derived.qiCap; gs._recalc()
    sim.ev('globalThis.__savedRandom = Math.random; Math.random = () => 0')
    gs._tickAutomation(1)
    sim.ev('Math.random = globalThis.__savedRandom')
    assert(gs.get().stageIndex === 2, `catch-up auto-BT fired even in Active Mode (stage now ${gs.get().stageIndex})`)
  }
})()

// Mirrors _beginLife's stipend formula (kept here so a formula change shows up as a failing check).
function STIPEND(gs, hall, b) {
  const st = gs.get().world.persons[b.headId]?.parentingStyle
  const styleMult = { nurturing: 1.2, strict: 1.0, neglectful: 0.6, ruthless: 0.8 }[st] || 1
  const posMult = { eldest: 1.0, younger: 0.5, branch: 0.25, rival: 0, orphan: 0 }[b.position] ?? 0
  return 60 * (hall || 1) * styleMult * posMult
}
function Persons_fullName(p) { return p.family ? `${p.family} ${p.given}` : p.given }
