// Scenario checks — family.md → "1.8b-3b": affairs on your terms (cover tracks → lower discovery, confess, end it +
// scorn, ultimatum marry / let go / one more season, marry a lover), your own fights exchange by exchange (tactic
// edges, the odds match the old one-roll chance under neutral play, yield accepted / refused, outcomes), and sparing
// a Tournament of Heirs loser. Run: npm run checks · node scripts/sim/checks/family-fights.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')
// P(first to `to` exchanges) for a single-exchange chance p (A6-3a: people fight to DUEL_TO = 3)
const raceTo = (p, to) => { let sum = 0, c = 1; for (let k = 0; k < to; k++) { sum += c * Math.pow(p, to) * Math.pow(1 - p, k); c = c * (to + k) / (k + 1) } return sum }
async function married(seed, stage = 12) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.spiritStones = 1e6; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  return { sim, gs }
}
const addLover = (gs, personality) => {
  const p = gs._rollStranger('lover'); if (personality) p.personality = personality
  gs.get().family.lovers.push({ person: p, since: 1, nextChildYear: 1e9, endsYear: 1e9 }); return p
}

;(async () => {
  // ── Affairs ──
  { const { sim, gs } = await married(1); const f = gs.get().family
    const p = addLover(gs, 'niceguy')
    const r0 = gs.affairRisk(p.id).perYear
    const st = gs.get().spiritStones; gs.coverTracks(p.id)
    const r1 = gs.affairRisk(p.id)
    assert(r1.covered && Math.abs(r1.perYear - r0 * 0.3) < 1e-9 && gs.get().spiritStones === st - gs.coverCost(), `cover tracks: discovery ${(r0 * 100).toFixed(1)}% → ${(r1.perYear * 100).toFixed(1)}%/yr for ${gs.coverCost()} stones`)
    assert(gs.coverTracks(p.id).reason === 'covered', 'cannot cover twice while covered')
    f.tolerant = true; assert(gs.affairRisk(p.id).perYear === 0 && gs.coverTracks(p.id).reason === 'nothing_to_hide', 'a tolerant spouse: nothing to hide') }
  { // Confess vs discovered: the smaller blow, forgiveness likelier (200 trials each on the same spouse temper)
    let accConf = 0, accDisc = 0
    for (let i = 0; i < 200; i++) {
      for (const conf of [true, false]) {
        const { gs } = await married(100 + i); const f = gs.get().family; f.affection = 60; f.spouse.personality = 'stoic'; f.spouse.morality = 0
        const p = addLover(gs)
        if (conf) { gs.confessAffair(p.id); if (f.tolerant) accConf++ } else { gs._discoverAffair(f.lovers[0], false); if (f.tolerant) accDisc++ }
      }
    }
    assert(accConf > accDisc * 1.4, `confessing is forgiven more often (${accConf}/200 vs ${accDisc}/200 when caught)`)
    const { gs } = await married(9); const f = gs.get().family; f.affection = 60; const p = addLover(gs)
    gs.confessAffair(p.id)
    assert(!f.spouse || f.lastAff?.why === 'you confessed an affair' || f.formerSpouses.length, 'confession records its cause') }
  { // End it: a scorned lover goes to your spouse; a gentle one leaves quietly
    const { sim, gs } = await married(2); const f = gs.get().family
    const p = addLover(gs, 'psycho')
    rng(sim, 0.0); const r = gs.endAffair(p.id); unrng(sim)
    assert(r.scorned && r.told && f.tally.discovered === 1, 'a scorned lover tells your spouse')
    const { sim: sim2, gs: gs2 } = await married(3); const p2 = addLover(gs2, 'niceguy')
    rng(sim2, 0.5); const r2 = gs2.endAffair(p2.id); unrng(sim2)
    assert(!r2.scorned && gs2.get().family.tally.discovered === 0 && gs2.get().family.lovers.length === 0, 'a gentle lover goes quietly') }
  { // Ultimatum instead of a silent fade: one more season / marry
    const { gs } = await married(4); const f = gs.get().family
    const p = addLover(gs); f.lovers[0].endsYear = gs.get().world.year - 1
    gs.get().world.year += 1; gs._tickFamily()
    assert(f.lovers[0]?.ultimatum, 'at the end of an affair the lover asks you to choose')
    gs.answerLoverUltimatum(p.id, 'one_more')
    const risk = gs.affairRisk(p.id)
    assert(!f.lovers[0].ultimatum && risk.hot && risk.perYear > 0.02 * 2, `one more season: discovery runs hot (${(risk.perYear * 100).toFixed(1)}%/yr)`)
    f.lovers[0].ultimatum = { year: 1 }
    const oldSpouse = f.spouse.id
    const r = gs.answerLoverUltimatum(p.id, 'marry')
    assert(r.ok && f.spouse?.id === p.id && f.formerSpouses.at(-1).id === oldSpouse && f.formerSpouses.at(-1).endCause === 'divorced', 'marry the lover: your spouse is divorced, the lover is your spouse') }
  { const sim = await createSim({ seed: 5 }); await sim.boot(0); const gs = sim.gs
    const p = addLover(gs); const r = gs.marryLover(p.id)
    assert(r.ok && gs.get().family.spouse.id === p.id && gs.get().family.affection === 70 && !gs.get().family.lovers.length, 'unmarried: make it official') }

  // ── Your fights ──
  { const { sim, gs } = await married(6); const s = gs.get(), f = s.family
    f.duel = { year: 1, reason: 'test' }; s.stageIndex = f.spouse.stageIndex; gs._recalc()
    const start = gs.resolveDuel('fight')
    const info = gs.fightInfo()
    assert(start.fight && info && info.kind === 'duel' && info.lethal, 'a duel opens the fight card')
    // Neutral play keeps the old odds: a race to FIGHT_TO with p reproduces duelChance
    const p = info.base, race = raceTo(p, info.to)
    assert(Math.abs(race - start.chance) < 1e-6, `exchange odds ${(p * 100).toFixed(1)}% → match ${(race * 100).toFixed(1)}% = duelChance ${(start.chance * 100).toFixed(1)}%`)
    f.spouse.personality = 'hotblood'
    const t = gs.fightInfo().tactics
    assert(t.guard > t.press && t.guard > t.feint, `vs a hot-blooded spouse, Guard is the best read (${Object.entries(t).map(([k, v]) => k + ' ' + (v * 100).toFixed(0) + '%').join(', ')})`)
    const h0 = s.health; rng(sim, 0.999); gs.fightExchange('press'); unrng(sim)
    assert(f.fight.them === 1 && gs.get().health === Math.max(1, h0 - 4), 'a lost exchange scores for them and wounds you')
    rng(sim, 0.999); const y = gs.fightExchange('yield'); unrng(sim)
    assert(y.refused && f.fight, 'a lethal yield can be refused; the fight goes on')
    rng(sim, 0.0); const y2 = gs.fightExchange('yield'); unrng(sim)
    assert(y2.yielded && y2.outcome === 'fled' && !gs.get().family.spouse, 'an accepted yield: you live, your spouse leaves') }
  { const { sim, gs } = await married(7); const s = gs.get(), f = s.family
    f.duel = { year: 1, reason: 'test' }; gs.resolveDuel('fight')
    rng(sim, 0.0); let r; for (let i = 0; i < 6 && !gs.get().family.fight?.over; i++) r = gs.fightExchange('guard'); unrng(sim)
    assert(r.over === 'won' && gs.get().family.fight?.over === 'won' && gs.get().family.spouse, 'A6-3a: winning the exchanges waits for your end choice')
    const ch = gs.personFightChoices()
    assert(ch && ch.ids.join() === 'finish,spare', `a lethal win offers finish / spare (${ch?.ids})`)
    r = gs.personFightFinish('finish')
    assert(r.ok && r.outcome === 'won' && gs.get().family.formerSpouses.at(-1).endCause === 'duel', 'Finish them: the old duel outcome (your spouse dies)') }
  { const { sim, gs } = await married(9); const s = gs.get(), f = s.family
    f.duel = { year: 1, reason: 'test' }; f.spouse.personality = 'arrogant'; gs.resolveDuel('fight')
    const k0 = s.karma
    rng(sim, 0.0); for (let i = 0; i < 6 && !gs.get().family.fight?.over; i++) gs.fightExchange('guard'); unrng(sim)
    const sp = gs.get().family.spouse, r = gs.personFightFinish('spare'), former = gs.get().family.formerSpouses.at(-1)
    assert(r.ok && r.outcome === 'spared' && former.id === sp.id && former.alive !== false && former.endCause === 'left', 'Spare them: your spouse lives and leaves you')
    assert(r.feud === 'grudge' && former.feud === 'grudge' && gs.get().karma > k0, `an arrogant spouse spared holds a grudge (${r.feud}); karma +${gs.get().karma - k0}`)
    assert(gs.personRecord(former).youWon === 1 && gs.personRecord(former).spared === 1, 'the fight is on their record: won 1, spared 1') }

  // ── Tournament: spare a loser ──
  { const { sim, gs } = await married(8, 15); const s = gs.get(), f = s.family
    f.planning = 'none'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
    for (let i = 0; i < 6; i++) { const c = gs._makeChild(f.spouse); c.bornYear -= 20 + i; c.stageIndex = 5 + i; c.personality = 'stoic' }
    gs.startTournament()
    const info = gs.tournamentInfo(), pool = [...info.pool]
    const pairs = []; for (let i = 0; i < info.fights; i++) pairs.push([pool[2 * i], pool[2 * i + 1]])
    const res = gs.fightTournamentRound(pairs, pairs.map((_, i) => i))
    const losers = res.results.map(r => f.children.find(c => c.id === r.loser))
    assert(res.ok && losers.every(c => c.alive && c.estranged && c.spared), `all ${losers.length} losers spared: alive, estranged, marked spared`)
    assert(!f.children.some(c => c.trauma) && !f.tournament.lethalFought, 'no death this round: no trauma, not a lethal tournament (yet)')
    assert(res.results.every(r => /stay the killing blow/.test(r.text)), 'the log says you stayed the blow') }
})()
