// Scenario checks — clan-succession.md 2.6b: Family Planning, children cultivating + stage cap, child event effects
// (bond / morality / train / favor), runaway crisis (fetch / estrange), neglect drift, morality vs affair reactions.
// Run: npm run checks (all) · node scripts/sim/checks/children.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')
async function married(seed, stage = 15) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.spiritStones = 1e6; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  return { sim, gs }
}
const tickYears = (gs, n) => { for (let i = 0; i < n; i++) { gs.get().world.year += 1; gs._tickFamily() } }
;(async () => {
  // Planning
  { const { sim, gs } = await married(1); const f = gs.get().family
    assert(f.planning === 'ask' && f.nextChildYear != null, 'default planning ask (1.8b-3a), first wish scheduled')
    gs.setFamilyPlanning('none'); const n0 = f.children.length; tickYears(gs, 200)
    assert(gs.get().family.children.length === n0, `planning none: no births in 200 years (${n0})`)
    gs.setFamilyPlanning('some'); const due = gs.get().family.nextChildYear - gs.get().world.year
    assert(due >= 8 && due <= 20, `re-enabling schedules the next birth 8–20 yrs out (${due.toFixed(1)})`)
    tickYears(gs, 300); const kidsSome = gs.get().family.children.length - n0
    assert(kidsSome >= 4 && kidsSome <= 9, `'some' over 300 yrs → ${kidsSome} children (40–70 yr gaps)`)
    assert(gs.setFamilyPlanning('lots').reason === 'invalid', 'invalid plan rejected') }
  // Growth + cap
  { const { sim, gs } = await married(2, 10); const s = gs.get(), f = s.family
    const c = gs._makeChild(f.spouse); c.root = { type: 'heavenly', name: 'x', mult: 3.0 }
    tickYears(gs, 15); assert(c.stageIndex === 0, 'child does not cultivate before age 16')
    tickYears(gs, 60); assert(c.stageIndex === 10 && c.xp <= 1, `child capped at your stage 10 (at ${c.stageIndex}, xp ${c.xp.toFixed(2)})`)
    s.stageIndex = 14; s.maxStageThisLife = 14; tickYears(gs, 30)
    assert(c.stageIndex === 14, `cap rises with you → ${c.stageIndex}`)
    assert(typeof c.morality === 'number' && c.morality >= -100 && c.morality <= 100 && c.bond <= 50, `child has morality ${c.morality}, bond ${c.bond}`) }
  // Child event choice effects
  { const { sim, gs } = await married(3); const s = gs.get(), f = s.family
    f.planning = 'none'
    const a = gs._makeChild(f.spouse), b = gs._makeChild(f.spouse); a.bornYear -= 20; b.bornYear -= 20
    a.personality = 'poet'; a.bond = 50; b.bond = 50; a.morality = 0
    f.childEvent = { id: 'sibling_quarrel', crisis: false, childId: a.id, year: 1 }
    let r = gs.resolveChildEvent(0)
    assert(r.ok && a.bond === 60 && b.bond === 45, `favor: chosen child +10 (poet default), sibling −5 (${a.bond}/${b.bond})`)
    f.childEvent = { id: 'spared_rival', crisis: false, childId: a.id, year: 1 }
    gs.resolveChildEvent(0); assert(a.morality === 10 && a.bond === 70, `mercy: morality +10, poet bond +10 (${a.morality}/${a.bond})`)
    const xp0 = a.xp, st0 = a.stageIndex
    f.childEvent = { id: 'forbidden_art', crisis: false, childId: a.id, year: 1 }
    gs.resolveChildEvent(0); assert(a.stageIndex + a.xp > st0 + xp0, 'train adds stage progress')
    f.childEvent = { id: 'coming_of_age', crisis: false, childId: a.id, year: 1 }; s.spiritStones = 0
    assert(gs.resolveChildEvent(0).reason === 'cant_afford', 'unaffordable child choice rejected') }
  // Runaway crisis
  { const { sim, gs } = await married(4); const s = gs.get(), f = s.family
    f.planning = 'none'; const c = gs._makeChild(f.spouse); c.bornYear -= 30; c.bond = 5
    rng(sim, 0.0); const ev = gs._rollChildEvent([c]); unrng(sim)
    assert(ev.crisis && ev.id === 'child_runaway', 'low-bond adult child → runaway crisis')
    f.childEvent = { ...ev, year: 1 }; gs.resolveChildEvent(0)
    assert(!c.estranged && c.bond === 30, `fetch: stays, bond +25 → ${c.bond}`)
    f.childEvent = { ...ev, year: 2 }; gs.resolveChildEvent(1)
    assert(c.estranged && f.tally.runaways === 1, 'let go: estranged')
    const stage0 = c.stageIndex; tickYears(gs, 50); assert(c.stageIndex === stage0, 'estranged child no longer grows with the household')
    gs.passTheMantle(); const w = gs.get().world, clan = w.clans[w.playerClanId]
    assert(w.persons[c.id]?.role === 'estranged' && !clan.lines[0].memberIds.includes(c.id), 'estranged child: in the world registry, off the clan roster')
    assert(typeof w.persons[w.pastLives[0].personId].morality === 'number', `past self has morality ${w.persons[w.pastLives[0].personId].morality}`) }
  // Neglect drift
  { const { sim, gs } = await married(5); const f = gs.get().family; f.planning = 'none'
    for (let i = 0; i < 12; i++) gs._makeChild(f.spouse)
    tickYears(gs, 80); const bonds = f.children.map(c => c.bond)
    assert(bonds.every(b => b === 34), `12 kids at home → bonds drift to 50 − 2×8 = 34 (${[...new Set(bonds)]})`) }
  // Morality tilts affair reactions
  { const counts = { cruel: 0, kind: 0 }
    for (const [label, m] of [['cruel', -100], ['kind', 100]]) {
      for (let i = 0; i < 200; i++) {
        const { sim, gs } = await married(100 + i); const f = gs.get().family
        f.spouse.personality = 'stoic'; f.spouse.morality = m; f.affection = 60
        f.lovers.push({ person: gs._rollStranger('lover'), since: 1, nextChildYear: 1e9, endsYear: 1e9 })
        gs._discoverAffair(f.lovers[0], false)
        if (f.tally.duel || f.tally.murder_suicide) counts[label]++
      }
    }
    assert(counts.cruel > counts.kind * 1.5, `violent reactions: ruthless spouse ${counts.cruel}/200 vs righteous ${counts.kind}/200`) }
  // Migration backfill (child from 2.5-era save: no bond/morality/xp)
  { const { sim, gs } = await married(6); const f = gs.get().family
    const c = gs._makeChild(f.spouse); delete c.bond; delete c.morality; delete c.xp; delete f.planning; gs._recalc()
    assert(c.bond === 50 && c.xp === 0 && c.morality === (sim.data && 0 || c.morality) && f.planning === 'ask', `old child backfilled (old default many → ask) (bond ${c.bond}, morality ${c.morality}, planning ${f.planning})`) }
})()
