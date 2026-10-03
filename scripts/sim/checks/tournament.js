// Scenario checks — clan-succession.md 2.6c: heirs + Tournament of Heirs. Field-size rules (never below the Top 4),
// deaths, trauma for every survivor, bonds, karma, spouse affection, Bloodline heir term, pending succession, sect
// snapshot, coward yield, validation, call-off, heir eligibility.
// Run: npm run checks (all) · node scripts/sim/checks/tournament.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')
async function family(seed, nKids, opts = {}) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = 18; s.maxStageThisLife = 18; s.spiritStones = 1e6; s.karma = 50; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  const f = gs.get().family; f.planning = 'none'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
  const kids = []
  for (let i = 0; i < nKids; i++) { const c = gs._makeChild(f.spouse); c.bornYear -= 40; c.stageIndex = 5 + i; c.maxStage = c.stageIndex; c.personality = opts.pers || 'stoic'; c.bond = 60; kids.push(c) }
  return { sim, gs, f, kids }
}
const pairUp = (gs, strongestVsWeakest = true) => {
  const info = gs.tournamentInfo(), f = gs.get().family
  const pool = info.pool.map(id => f.children.find(c => c.id === id)).sort((a, b) => b.stageIndex - a.stageIndex)
  const pairs = []; while (pairs.length < info.fights) pairs.push([pool.shift().id, pool.pop().id])
  return pairs
}
;(async () => {
  // Field sizes: lethal fights never take the field below 4
  for (const [n, want] of [[7, [3]], [6, [2]], [5, [1]], [9, [4, 1]], [10, [5, 1]]]) {
    const { gs } = await family(n, n)
    gs.startTournament()
    const lethalFights = []
    while (gs.tournamentInfo()?.lethal) { lethalFights.push(gs.tournamentInfo().fights); gs.fightTournamentRound(pairUp(gs)) }
    const info = gs.tournamentInfo()
    assert(JSON.stringify(lethalFights) === JSON.stringify(want) && info.n === 4 && !info.lethal, `n=${n}: lethal rounds ${JSON.stringify(lethalFights)} → Top 4 non-lethal`)
  }
  // Full run from 7: exactly 3 deaths (unless a coward yields), non-lethal Top 4, heir + 3 branch founders, trauma + bonds
  { const { sim, gs, f, kids } = await family(21, 7)
    const aff0 = f.affection
    gs.startTournament()
    assert(gs.chooseHeir(kids[0].id).reason === 'tournament', 'cannot name an heir mid-tournament')
    while (gs.tournamentInfo()) gs.fightTournamentRound(pairUp(gs))
    const dead = kids.filter(c => !c.alive)
    assert(dead.length === 3 && dead.every(c => c.cause === 'tournament'), '7 entrants → 3 die (cause tournament)')
    const heir = kids.find(c => c.id === f.heirId)
    assert(heir && heir.alive && heir.trauma, `winner ${heir?.given} is heir, forged in blood`)
    assert(f.lastTournament.ranking.length === 4 && f.lastTournament.deaths === 3 && f.lastTournament.lethal, 'ranking of 4 recorded')
    assert(kids.filter(c => c.alive).every(c => c.trauma && c.bond === 30), 'every survivor scarred, bond 60 → 30')
    assert(Math.round(aff0 - f.affection) === 45, `spouse affection −15 per child of theirs killed (${aff0} → ${f.affection})`)
    assert(gs.get().karma === 41, `karma −3 per death (${gs.get().karma})`)
    const clan = gs.get().world.clans[gs.get().world.playerClanId]
    assert(clan.tradition.lethalTournaments === 1, 'clan tradition records a lethal tournament')
    // BQ term + pending succession + sect snapshot at death
    const s = gs.get(); s.ownSect.founded = true; s.ownSect.name = 'Azure Peak'
    const heirStage = heir.stageIndex
    const clanId = gs.get().world.playerClanId
    gs.passTheMantle()
    // 2.6d: a named heir needs no bet — the interlude goes straight to the chronicle
    const info = gs.interludeInfo(), c2 = gs.get().world.clans[clanId]
    assert(info.step === 'chronicle' && info.successor?.id === heir.id && info.heirKind === 'tournament', 'named heir takes the seat, no bet (2.6d)')
    assert(c2.headId === heir.id && c2.lines.length === 4 && c2.lines.slice(1).every(l => l.headId && gs.get().world.persons[l.headId].alive), 'places 2–4 found the 3 branches')
    const fate = gs.get().interlude.sectFate
    assert(fate === 'lost' ? !c2.sect : (c2.sect?.name === 'Azure Peak' && c2.sect.heirId === heir.id), `founded sect went to the heir (reign fate: ${fate})`)
    gs.finishInterlude('clan')
    const lr = gs.get().lastReincarnation
    const heirNow = gs.get().world.persons[heir.id]
    const G_HEIR = sim.ev('BLOODLINE_G_HEIR'), G_TRAUMA = sim.ev('BLOODLINE_G_TRAUMA_HEIR')
    const expectTerm = G_HEIR * (heirNow.stageIndex / 22) ** 2 + G_TRAUMA
    assert(Math.abs(lr.heirTerm - expectTerm) < 1e-9 && lr.heirKind === 'tournament' && lr.heirTrauma, `BQ heir term ${lr.heirTerm.toFixed(3)} = ${G_HEIR}×(${heirNow.stageIndex}/22)² + ${G_TRAUMA} (trauma; heir grew ${heirStage} → ${heirNow.stageIndex} before the seat)`) }
  // Coward yields in a lethal round
  { const { sim, gs, kids } = await family(31, 5, { pers: 'coward' })
    gs.startTournament()
    rng(sim, 0.01); const r = gs.fightTournamentRound(pairUp(gs)); unrng(sim)
    assert(r.results[0].yielded && !r.results[0].died && kids.every(c => c.alive), 'a coward yields: loses, lives') }
  // Ruthless survivors don't lose bond
  { const { gs, kids } = await family(41, 5, { pers: 'psycho' })
    gs.startTournament(); gs.fightTournamentRound(pairUp(gs))
    assert(kids.filter(c => c.alive).every(c => c.bond === 65), 'psycho survivors: bond +5, not −30') }
  // Validation + cancel
  { const { gs, kids } = await family(51, 6)
    assert(gs.fightTournamentRound([]).reason === 'no_tournament', 'no tournament → rejected')
    gs.startTournament()
    assert(gs.startTournament().reason === 'already', 'second start rejected')
    assert(gs.fightTournamentRound([[kids[0].id, kids[1].id]]).reason === 'bad_pairs', 'wrong number of pairs rejected')
    assert(gs.fightTournamentRound([[kids[0].id, kids[0].id], [kids[2].id, kids[3].id]]).reason === 'bad_pairs', 'self-pair rejected')
    assert(gs.fightTournamentRound([[kids[0].id, kids[1].id], [kids[1].id, kids[2].id]]).reason === 'bad_pairs', 'fighter twice rejected')
    assert(gs.cancelTournament().ok && !gs.get().family.tournament, 'call off before the first fight')
    gs.startTournament(); gs.fightTournamentRound(pairUp(gs))
    assert(gs.cancelTournament().reason === 'begun', 'cannot call off once blood is spilled') }
  // Too few / heir rules
  { const { sim, gs, kids } = await family(61, 1)
    assert(gs.startTournament().reason === 'too_few', 'one adult child → no tournament')
    const minor = gs._makeChild(gs.get().family.spouse)
    assert(gs.chooseHeir(minor.id).reason === 'not_eligible', 'a minor cannot be heir')
    assert(gs.chooseHeir(kids[0].id).ok && gs.get().family.heirId === kids[0].id, 'name an adult heir')
    kids[0].estranged = true; gs._recalc()
    assert(gs.get().family.heirId === null, 'a runaway heir is cleared')
    gs.passTheMantle(); gs.finishInterlude('clan')
    const lr = gs.get().lastReincarnation, reg = gs.get().world.persons[minor.id]
    const G_HEIR = sim.ev('BLOODLINE_G_HEIR')
    assert(lr.heirKind === 'regency' && Math.abs(lr.heirTerm - G_HEIR * (reg.stageIndex / 22) ** 2) < 1e-9, `no adult heir → the minor takes the seat under regency (grew to stage ${reg.stageIndex} over the reign; term ${lr.heirTerm.toFixed(3)})`) }
  // A tournament whose field shrinks to one ends with that child
  { const { gs, kids } = await family(71, 2)
    gs.startTournament(); kids[1].estranged = true; gs._recalc(); gs.get().world.year += 1; gs._tickFamily()
    assert(!gs.get().family.tournament && gs.get().family.heirId === kids[0].id, 'field of one → that child wins by default') }
})()
