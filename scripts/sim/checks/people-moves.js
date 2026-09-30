// Scenario checks — docs/systems/arts.md → "42c part 1 as built" (task 1.14a): fights with people on the move engine.
// A person's arts (p.arts) are seeded (same person + realm → same arts, never Math.random), of their root's elements or
// neutral, within their realm, sized by stage, re-rolled when they cross a realm; an Arena champion carries their ring's
// signature art; tempers lean to their kind of art; scouting (the arts they use on you are remembered); stances ('yield'
// never below 1, beaten at the threshold · 'slay' can kill you); wounds carry out of a fight; Yield (blocked mid-parry,
// refused / accepted); the estimate is deterministic and near a long Monte Carlo; a grudge hits harder; the old
// Press/Guard/Feint call is gone; an old-engine save restarts the fight on moves.
// Run: npm run checks · node scripts/sim/checks/people-moves.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

async function setup(seed, stage = 8) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100; s.spiritStones = 1e6; s.karma = 50; gs._recalc()
  return { sim, gs, s, K: n => sim.ev(n) }
}
const stranger = (gs, stage, personality = 'stoic') => {
  const p = gs._genPerson({ family: 'Test', bornYear: 0, stage, role: 'duelist' }); p.personality = personality; return p
}
// a road fight with a stranger (lethal) — the simplest person fight to start
function roadFight(gs, p) {
  const s = gs.get(); s.family.encounters.push({ person: p, place: 'X', text: 't', year: 1 })
  return gs.slaughterEncounter(s.family.encounters.length - 1)
}

;(async () => {
  // ── A person's arts ──
  { const { sim, gs, K } = await setup(1)
    const ARTS = K('ARTS'), ARTS_LIST = K('ARTS_LIST')
    const p = stranger(gs, 0); p.stageIndex = 8; p.id = 'fixed-id'; p.root.elements = undefined
    sim.ev('globalThis.__r = Math.random; Math.random = () => { throw new Error("Math.random used") }')
    let threw = null, a1, a2
    try { delete p.arts; a1 = JSON.stringify(gs.personArts(p)); delete p.arts; a2 = JSON.stringify(gs.personArts(p)) } catch (e) { threw = e.message }
    sim.ev('Math.random = globalThis.__r')
    assert(!threw && a1 === a2, `seeded: the same person + realm rolls the same arts, without Math.random (${threw || 'ok'})`)
    const els = gs._personElements(p), A = gs.personArts(p)
    assert(A.moves.every(id => ARTS[id].kind === 'move' && (els.includes(ARTS[id].element) || ARTS[id].element === 'neutral') && ARTS[id].minStage <= 8 && !ARTS[id].sig),
      `their moves are of their root (${els.join('/')}) or neutral, within their realm, never a signature (${A.moves.join(', ')})`)
    assert(A.moves.length === 3 && A.passives.length === Math.ceil(gs.passiveSlots(8) * K('PERSON_PASSIVE_SHARE')), `stage 8: 3 moves, ${A.passives.length} passive(s)`)
    assert(A.moves.includes(ARTS_LIST.find(a => a.starter && a.element === els[0]).id), 'they know the starter art of their first element')
    const m = gs._mbFoePerson(p)
    assert(m.moves.at(-1) === 'palm_strike' && m.person && m.element === els[0], 'in a fight they also have Palm Strike; their element is their root\'s first')
    const before = A.moves.join()
    p.stageIndex = 13
    const B = gs.personArts(p)
    assert(B.realm !== A.realm && B.moves.length === 4 && B.moves.some(id => ARTS[id].minStage > 8 || !A.moves.includes(id)), `a new realm re-rolls them (${before} → ${B.moves.join(', ')})`)
    // tempers lean to their kind of art
    const count = (temper, types) => { let n = 0; for (let i = 0; i < 150; i++) { const q = stranger(gs, 14, temper); n += gs.personArts(q).moves.filter(id => types.includes(ARTS[id].move.type)).length } return n }
    const stoicW = count('stoic', ['ward', 'counter']), hotW = count('hotblood', ['ward', 'counter'])
    assert(stoicW > hotW * 1.5, `a stoic reaches for wards and counters far more than a hothead (${stoicW} vs ${hotW} in 150 each)`) }

  // ── Arena champions carry their ring's signature art ──
  { const { gs, s, K } = await setup(2, 5)
    gs.arenaInfo()
    const ring = s.arena.rings.iron, champ = s.arena.duelists[ring.championId], sig = K('ARTS_LIST').find(a => a.sig === 'arena:iron')
    assert(sig && gs.personArts(champ).moves[0] === sig.id, `the Iron Ring champion fights with ${sig?.name}`)
    const plain = s.arena.duelists[ring.roster[0]]
    assert(!gs.personArts(plain).moves.some(id => K('ARTS')[id].sig), 'a plain duelist has no signature art') }

  // ── Scouting ──
  { const { gs, s } = await setup(3)
    const p = stranger(gs, 8, 'hotblood')
    roadFight(gs, p)
    const info = gs.fightInfo()
    assert(info.scout && info.scout.seen === 0 && info.scout.total === gs.personArts(p).moves.length && !info.habitsKnown, 'at first you know their root, none of their arts, not their habits')
    const m = s.family.fight.m
    m.foe.moves = [gs.personArts(p).moves[0]]; m.foe.qi = 100
    let r = gs.fightMove('qi_shield'); while (r.ok && r.pending) r = gs.fightParry([false])
    assert(gs.personRecord(p).movesSeen.includes(gs.personArts(p).moves[0]) && gs.fightInfo().scout.seen === 1, `an art they use on you is remembered (${gs.personArts(p).moves[0]})`)
    playFight(gs, 'win'); gs.personFightFinish('spare')
    const again = gs.personScouting(p)
    assert(again.habitsKnown && again.seen >= 1 && /parr/.test(again.parryWord), `after the fight: seen stays, habits known (${again.hint}; ${again.parryWord})`) }

  // ── Stances: until one yields (never below 1) · to the death ──
  { const { gs, s, sim } = await setup(4)
    const p = stranger(gs, 8); s.world.persons[p.id] = p
    gs._startFight('challenge', p, false)
    const m = s.family.fight.m
    assert(m.stance === 'yield' && m.foe.max === 100, 'a fight until one yields: stance yield, their HP 100 like yours')
    s.health = 33; m.foe.moves = ['palm_strike']
    rng(sim, 0.5)
    let r = gs.fightMove('circulate'); while (r.ok && r.pending) r = gs.fightParry([false])
    unrng(sim)
    assert(s.health >= 1 && (!!s.family.fight || s.health <= 33), `never below 1 Health; at ${sim.ev('PERSON_FIGHT.yieldThrownHp')} you are beaten (${Math.round(s.health)})`)
    s.family.fight = null
    gs._startFight('challenge', p, false); const m2 = s.family.fight.m; m2.foe.hp = Math.round(m2.foe.max * sim.ev('PERSON_FIGHT.yieldFoeFrac')) + 1; m2.foe.P.parryChance = 0; m2.foe.ward = 0
    const r2 = gs.fightMove('palm_strike')
    assert(r2.over === 'won' && s.family.fight?.over === 'won', 'they yield at their threshold (not at 0): the fight waits for raise / humble')
    s.family.fight = null }
  { const { gs, s, sim } = await setup(5)
    const p = stranger(gs, 8)
    gs._startFight('stepdown', p, false)
    s.health = 2; s.family.fight.m.foe.moves = ['palm_strike']
    rng(sim, 0.5); let r = gs.fightMove('circulate'); while (r.ok && r.pending) r = gs.fightParry([false]); unrng(sim)
    assert(s.health >= 1 && s.interlude == null, 'beaten until one yields: you live') }
  { const { gs, s } = await setup(6)
    const p = stranger(gs, 8)
    roadFight(gs, p)
    assert(s.family.fight.m.stance === 'slay', 'a road fight is to the death')
    const r = playFight(gs, 'lose')
    assert(['died', 'lost_lethal'].includes(r.outcome) && gs.get().lastReincarnation?.cause === 'slaughter', `to the death: 0 Health kills you (${r.outcome}, ${gs.get().lastReincarnation?.cause})`) }

  // ── Wounds carry out of a fight ──
  { const { gs, s, sim } = await setup(7)
    const p = stranger(gs, 8)
    roadFight(gs, p)
    const m = s.family.fight.m
    m.foe.moves = ['palm_strike']
    rng(sim, 0.5); let r = gs.fightMove('circulate'); while (r.ok && r.pending) r = gs.fightParry([false]); unrng(sim)
    const hurt = s.health
    playFight(gs, 'win'); gs.personFightFinish('spare')
    assert(hurt < 100 && s.health <= hurt + 1 && !s.family.fight, `the wounds of the fight stay with you (Health ${hurt} after the blow, ${Math.round(s.health)} after)`) }

  // ── Yield ──
  { const { gs, s, sim } = await setup(8)
    const p = stranger(gs, 8)
    roadFight(gs, p)
    const m = s.family.fight.m
    m.pending = { id: 'palm_strike', name: 'Palm Strike', hits: 1, windowMs: 300 }
    assert(gs.fightExchange('yield').reason === 'parry', 'you cannot yield mid-parry')
    m.pending = null
    assert(gs.fightExchange('press').reason === 'moves', 'Press / Guard / Feint is gone: fights are on moves')
    rng(sim, 0.999); const y = gs.fightExchange('yield'); unrng(sim)
    assert(y.refused && s.family.fight && s.family.fight.m.lines.some(l => /refuses/.test(l.text)), 'a lethal yield can be refused; the refusal is in the turn log')
    rng(sim, 0.0); const y2 = gs.fightExchange('yield'); unrng(sim)
    assert(y2.yielded && !s.family.fight && s.interlude == null, 'an accepted yield ends the fight; you live') }

  // ── The estimate ──
  { const { sim, gs } = await setup(9)
    const p = stranger(gs, 8, 'arrogant')
    sim.ev('globalThis.__r = Math.random; Math.random = () => { throw new Error("Math.random used") }')
    let threw = null, o1, o2
    try { o1 = gs.personFightOdds(p, 'arena', false); gs._mbCache.clear(); o2 = gs.personFightOdds(p, 'arena', false) } catch (e) { threw = e.message }
    sim.ev('Math.random = globalThis.__r')
    assert(!threw && o1.chance === o2.chance, `the estimate is deterministic and never touches Math.random (${threw || (o1.chance * 100).toFixed(0) + '%'})`)
    const b = gs._mbNewPerson(p, false); b.you.hp = Math.max(1, Math.round(b.you.hp / 5) * 5)
    const long = gs._mbEstimate(b, 2000)
    assert(Math.abs(long.chance - o1.chance) < 0.08, `near a 2,000-run Monte Carlo (${(o1.chance * 100).toFixed(0)}% vs ${(long.chance * 100).toFixed(0)}%)`)
    const low = stranger(gs, 5), high = stranger(gs, 11)
    assert(gs.personFightOdds(low, 'arena').chance > gs.personFightOdds(high, 'arena').chance, 'a lower realm is easier than a higher one')
    const hate = gs.personFightOdds(p, 'arena', false).chance; p.feud = 'grudge'; gs._mbCache.clear()
    const g = gs.personFightOdds(p, 'arena', false).chance
    assert(g < hate, `a grudge hits harder (${(hate * 100).toFixed(0)}% → ${(g * 100).toFixed(0)}%)`) }

  // ── Migration: a person fight saved on the old engine restarts on moves ──
  { const { gs, s } = await setup(10)
    const p = stranger(gs, 8)
    roadFight(gs, p)
    const ff = JSON.parse(JSON.stringify(s.family.fight)); delete ff.m; Object.assign(ff, { p: 0.5, to: 3, you: 1, them: 1 }); s.family.fight = ff
    gs._ensurePhase42Fields()
    const fi = s.family.fight
    assert(fi && fi.m && fi.m.stance === 'slay' && fi.m.turn === 1 && !('p' in fi) && !('them' in fi), 'an old-engine road fight restarts on moves (the race fields dropped)')
    assert(gs.fightMove('palm_strike').ok, 'and can be fought on') }
})()

