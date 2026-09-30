// Scenario checks — docs/systems/combat.md → "A6-3a: people on the battle page". Person fights are fought on moves (1.14a,
// fight-helpers.js wins / loses them), a won fight waits for your end choice (finish / spare · raise / humble), the reaction each choice
// leaves by temper (debt / grudge), the record on the person, feud feedback (a debtor never challenges you, a grudge-holder
// is likelier + stronger + less willing to accept your yield, humbling cows the clan), the step-down bracket pausing on
// your bouts (saved mid-bracket, a loss or a death still settles the seat), and the stale-bout migration.
// Run: npm run checks · node scripts/sim/checks/duels.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')


// A first-life clan head (stage 18), married, with `nKids` adult children.
async function head(seed, nKids = 3, opts = {}) {
  const sim = await createSim({ seed, overrides: opts.overrides || [] }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.name = 'Lin Mei'; s.stageIndex = 18; s.maxStageThisLife = 18; s.spiritStones = 1e6; s.karma = 50; s.health = 100; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  const f = gs.get().family; f.planning = 'none'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
  const kids = []
  for (let i = 0; i < nKids; i++) {
    const c = gs._makeChild(f.spouse); c.bornYear -= 40; c.stageIndex = 17; c.maxStage = 17; c.personality = 'stoic'; c.bond = 60; kids.push(c)
  }
  return { sim, gs, f, kids }
}
async function nonHead(seed, nKids = 3, opts = {}) {
  const r = await head(seed, nKids, opts)
  r.gs.chooseHeir(r.kids[0].id); r.gs.passTheMantle(); r.gs.finishInterlude('clan')
  return r
}
const clanOf = gs => { const w = gs.get().world; return w.clans[w.playerClanId] }
function addMember(gs, { stage = 5, personality = 'stoic' } = {}) {
  const s = gs.get(), w = s.world, clan = clanOf(gs)
  const p = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage, role: 'kin' })
  p.personality = personality; w.persons[p.id] = p; clan.lines[0].memberIds.push(p.id)
  return p
}
// Win (or lose) the current fight on moves until it is over or waits for the end choice.
const play = (sim, gs, how) => playFight(gs, how)

;(async () => {
  // ── The fight itself: on moves (1.14a) ──
  { const { sim, gs } = await nonHead(1)
    const hd = gs.person(clanOf(gs).headId); gs.get().stageIndex = hd.stageIndex
    const start = gs.challengeHead(), info = gs.fightInfo()
    assert(start.fight && info.m && info.m.foe.person && info.m.foe.moves.includes('palm_strike') && info.m.stance === (info.lethal ? 'slay' : 'yield'), `a head challenge is fought on moves (${info.m?.foe.moves.join(', ')})`)
    const o = gs.personFightOdds(hd, 'challenge')
    assert(o.chance > 0.05 && o.chance < 0.95 && o.est && o.you.parts.length >= 2, `even realms: the estimate is a real contest (${(o.chance * 100).toFixed(0)}%), with the power parts`)
    assert(info.record.fought === 0 && info.scout && info.scout.seen === 0 && !info.habitsKnown, 'a first fight: an empty record, no arts seen, habits unknown') }

  // ── Lethal win → finish / spare ──
  { const { sim, gs } = await head(2, 1)
    const ch = addMember(gs, { stage: 12, personality: 'arrogant' }), s = gs.get()
    s.family.headChallenge = { challengerId: ch.id, year: Math.floor(s.world.year) }
    gs.resolveHeadChallenge(true)
    const r = play(sim, gs, 'win')
    assert(r.over === 'won' && s.family.fight?.over === 'won' && ch.alive !== false, 'a won lethal fight waits: they are down, not dead')
    assert(gs.fightExchange('press').reason === 'decide', 'no more exchanges once it is won')
    const c = gs.personFightChoices()
    assert(c.ids.join() === 'finish,spare' && c.reaction.spare === 'grudge', `finish / spare offered; an arrogant temper takes mercy as a grudge (${c.reaction.spare})`)
    const k0 = s.karma, done = gs.personFightFinish('spare')
    assert(done.ok && done.outcome === 'won_nonlethal' && ch.alive !== false && clanOf(gs).headId === s.self.id, `Spare: they live, your seat holds (${done.outcome})`)
    assert(ch.feud === 'grudge' && gs.personRecord(ch).youWon === 1 && gs.personRecord(ch).spared === 1 && s.karma === k0 + sim.ev('SPARE_KARMA'), 'their record: won 1, spared 1, grudge; karma for mercy')
    assert(!s.family.fight && gs.personFightFinish('finish').reason === 'no_choice', 'the fight is over') }
  { const { sim, gs } = await head(3, 1)
    const ch = addMember(gs, { stage: 12 }), s = gs.get()
    s.family.headChallenge = { challengerId: ch.id, year: Math.floor(s.world.year) }
    gs.resolveHeadChallenge(true); play(sim, gs, 'win')
    const done = gs.personFightFinish('finish')
    assert(done.outcome === 'won_lethal' && ch.alive === false && !ch.feud, 'Finish: the old lethal outcome (they die)') }

  // ── Non-lethal win → raise / humble ──
  { const { sim, gs } = await head(4, 1)
    const ch = addMember(gs, { stage: 12, personality: 'stoic' }), s = gs.get()
    s.family.headChallenge = { challengerId: ch.id, year: Math.floor(s.world.year) }
    gs.resolveHeadChallenge(false); play(sim, gs, 'win')
    assert(gs.personFightChoices().ids.join() === 'raise,humble', 'a non-lethal win offers raise / humble')
    gs.personFightFinish('raise')
    assert(ch.feud === 'debt' && gs.personRecord(ch).raised === 1 && s.family.cowedUntilYear == null, 'Raise them up: they owe you, the clan is not cowed') }
  { const { sim, gs } = await head(5, 1)
    const ch = addMember(gs, { stage: 12, personality: 'stoic' }), s = gs.get()
    s.family.headChallenge = { challengerId: ch.id, year: Math.floor(s.world.year) }
    gs.resolveHeadChallenge(false); play(sim, gs, 'win'); gs.personFightFinish('humble')
    const y = s.world.year, [lo, hi] = sim.ev('HUMBLE_QUIET_YEARS')
    assert(ch.feud === 'grudge' && s.family.cowedUntilYear >= y + lo - 1 && s.family.cowedUntilYear <= y + hi + 1, `Humble them: a grudge, and the clan is cowed until year ${s.family.cowedUntilYear}`) }

  // ── Feud feedback ──
  { const { sim, gs } = await head(6, 0)
    const clan = clanOf(gs)
    const kids = [addMember(gs, { stage: 17 }), addMember(gs, { stage: 17 }), addMember(gs, { stage: 17 })]   // three rivals within reach
    kids[0].feud = 'debt'; kids[1].feud = 'grudge'
    let picks = { debt: 0, grudge: 0, none: 0 }
    for (let i = 0; i < 600; i++) { const p = gs._pickChallenger(clan); picks[p?.feud || 'none']++ }
    assert(picks.debt === 0, 'a debtor never calls you out')
    assert(picks.grudge > picks.none * 2, `a grudge-holder is likelier (grudge ${picks.grudge} vs the plain one ${picks.none} of 600)`)
    let cowed = new Set(); for (let i = 0; i < 100; i++) cowed.add(gs._pickChallenger(clan, true)?.id)
    assert(cowed.size === 1 && cowed.has(kids[1].id), 'while the clan is cowed only the grudge-holder dares')
    const hate = gs.personFightOdds(kids[1], 'defend'); kids[1].feud = null
    const plain = gs.personFightOdds(kids[1], 'defend'); kids[1].feud = 'grudge'
    assert(hate.chance < plain.chance && hate.them.parts.some(p => /grudge/.test(p.label) && p.value === sim.ev('FEUD_POWER')), `a grudge fights harder (${(plain.chance * 100).toFixed(0)}% → ${(hate.chance * 100).toFixed(0)}% for you)`)
    const s = gs.get()
    const who = kids[2]; who.morality = 0                              // the same person, three ways
    s.family.headChallenge = { challengerId: who.id, year: Math.floor(s.world.year) }; gs.resolveHeadChallenge(true)
    const yPlain = gs.fightInfo().yieldAccept
    who.feud = 'grudge'; const yGrudge = gs.fightInfo().yieldAccept
    who.feud = 'debt'; const yDebt = gs.fightInfo().yieldAccept
    const F = sim.ev('FEUD_YIELD')
    assert(Math.abs(yDebt - yPlain - F) < 1e-9 && Math.abs(yPlain - yGrudge - F) < 1e-9, `yield: owed ${(yDebt * 100).toFixed(0)}% · plain ${(yPlain * 100).toFixed(0)}% · grudge ${(yGrudge * 100).toFixed(0)}%`) }

  // ── Step-down bracket: your bouts are played ──
  { const { sim, gs } = await nonHead(7, 3, { overrides: ['TOURNAMENT_LUCK = 0'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId
    const m = [addMember(gs, { stage: 3 }), addMember(gs, { stage: 3 }), addMember(gs, { stage: 3 })]
    s.stageIndex = 40; s.maxStageThisLife = 40
    s.family.stepDownOffer = { headId, year: Math.floor(s.world.year), entrantIds: [...m.map(p => p.id), s.self.id], eligible: true }
    const res = gs.answerStepDown(true)
    assert(res.ok && res.joined && res.next && s.family.fight?.kind === 'stepdown' && s.family.bracket, 'joining pauses the bracket on your first bout')
    const saved = JSON.parse(JSON.stringify(s.family.bracket))
    assert(saved.pool.includes(s.self.id) && saved.round === 1, 'the paused bracket is plain, saveable data')
    assert(gs._branchWarBusy() && !gs.canChallengeHead().ok, 'nothing else starts while the bracket runs')
    let bouts = 0, r
    for (let i = 0; i < 10 && s.family.fight; i++) { bouts++; play(sim, gs, 'win'); r = gs.personFightFinish(s.family.fight.lethal ? 'spare' : 'raise') }
    assert(r.outcome === 'won' && !s.family.bracket && clanOf(gs).headId === s.self.id, `you win ${bouts} bouts and take the seat (${r.outcome})`)
    assert(m.filter(p => p.feud).length >= 1, 'the ones you beat remember it') }
  { const { sim, gs } = await nonHead(8, 3, { overrides: ['TOURNAMENT_LUCK = 0'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId, meId = s.self.id
    const strong = addMember(gs, { stage: 60 }), m2 = addMember(gs, { stage: 3 })
    s.family.stepDownOffer = { headId, year: Math.floor(s.world.year), entrantIds: [strong.id, m2.id, meId], eligible: true }
    gs.get().family.stepDownOffer = s.family.stepDownOffer
    sim.ev('globalThis.__hd = GameState.prototype._headDecidesLethal; GameState.prototype._headDecidesLethal = () => false')
    let res = gs.answerStepDown(true)
    let r = null
    for (let i = 0; i < 10 && s.family.fight; i++) {
      if (s.family.fight.oppId === strong.id) { r = play(sim, gs, 'lose'); break }
      play(sim, gs, 'win'); r = gs.personFightFinish('raise')
    }
    sim.ev('GameState.prototype._headDecidesLethal = globalThis.__hd')
    assert(!s.family.bracket && !s.family.fight && s.self.id === meId && !s.interlude, `beaten in a bloodless contest: you live, the bracket settles (${r?.outcome || res.outcome})`)
    assert(clanOf(gs).headId === strong.id, 'the strongest takes the seat') }
  { const { sim, gs } = await nonHead(9, 3, { overrides: ['TOURNAMENT_LUCK = 0', 'TOURNAMENT_TOP = 1'] })
    const s = gs.get(), clan = clanOf(gs), headId = clan.headId
    const strong = addMember(gs, { stage: 60 })
    s.family.stepDownOffer = { headId, year: Math.floor(s.world.year), entrantIds: [strong.id, s.self.id], eligible: true }
    sim.ev('globalThis.__hd = GameState.prototype._headDecidesLethal; GameState.prototype._headDecidesLethal = () => true')
    gs.answerStepDown(true)
    sim.ev('GameState.prototype._headDecidesLethal = globalThis.__hd')
    assert(s.family.fight?.lethal, 'a bout to the death')
    const r = play(sim, gs, 'lose')
    const after = gs.get()
    assert(r.outcome === 'died' && after.interlude && after.lastReincarnation?.cause === 'stepdown_tournament', `you fall to the death: ${r.outcome}, cause ${after.lastReincarnation?.cause}`)
    assert(clanOf(gs).headId === strong.id, 'the seat is settled before you die') }

  // ── Migration ──
  { const { gs } = await head(10, 1)
    const s = gs.get()
    delete s.family.bracket; delete s.family.cowedUntilYear
    s.family.fight = { kind: 'stepdown', oppId: 'x', lethal: false, round: 1, log: [], year: 1 }
    gs._ensurePhase35Fields()
    assert(s.family.bracket === null && s.family.cowedUntilYear === null && s.family.fight === null, 'old saves get the new fields; a step-down bout without its bracket is dropped') }
})()
