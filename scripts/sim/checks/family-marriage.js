// Scenario checks — family.md commit A: spouse affection, marriage + crisis events (forgive / duel / divorce / beg /
// let go), duel win / lose / flee, Devoted bonus + sabotage, uncapped children, partner Bloodline term.
// Run: npm run checks (all) · node scripts/sim/checks/family-marriage.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
async function married(seed) {
  const sim = await createSim({ seed }); await sim.boot(0)
  const gs = sim.gs; let s = gs.get()
  s.stageIndex = 12; s.maxStageThisLife = 12; s.spiritStones = 1e6; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily()
  const r = gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  gs.setFamilyPlanning('many')   // timer births are an explicit delegation since 1.8b-3a
  return { sim, gs, s: gs.get(), r }
}
const years = (sim, n) => { for (let i = 0; i < n * 120 + 5; i++) sim.step(1) }
;(async () => {
  let { sim, gs, s, r } = await married(3)
  assert(r.ok && s.family.affection >= 60, `married, affection starts ${s.family.affection}`)
  // Force an event and answer it
  s.family.nextEventYear = s.world.year - 1; gs._tickFamily(); s = gs.get()
  assert(!!s.family.event && !s.family.event.crisis, `normal event fired: ${s.family.event?.id}`)
  const def = gs.marriageEventDef(s.family.event), a0 = s.family.affection
  const ch = def.choices[0], expect = ch.aff[s.family.spouse.personality] ?? ch.aff.default
  const cost = gs.familyCost(ch), stones0 = s.spiritStones
  const res = gs.resolveMarriageEvent(0); s = gs.get()
  assert(res.ok && Math.abs((s.family.affection - a0) - Math.max(-a0, Math.min(100 - a0, expect))) < 1e-9, `affection moved by spouse-personality delta (${expect})`)
  assert(s.spiritStones === stones0 - cost, `stone cost scaled by stage (${cost})`)
  assert(!s.family.event && s.family.tally.events === 1, 'event cleared + tallied')
  // Children uncapped: force many births
  for (let i = 0; i < 8; i++) { s.family.nextChildYear = s.world.year - 1; gs._tickFamily() }
  assert(gs.get().family.children.length >= 8, `no child cap (${gs.get().family.children.length} children)`)
  // Devoted bonus + sabotage
  s = gs.get(); s.family.affection = 50; gs._recalc(); const base = s.derived.breakthroughChance
  s.family.affection = 90; gs._recalc(); const dev = s.derived.breakthroughChance
  assert(dev > base || base >= 0.98, `devoted bonus ${base.toFixed(3)} → ${dev.toFixed(3)}`)
  s.family.affection = 50; s.family.btSabotage = true; gs._recalc()
  assert(s.derived.breakthroughChance < base, `sabotage lowers BT chance → ${s.derived.breakthroughChance.toFixed(3)}`)
  s.qi = s.derived.qiCap; gs._recalc(); gs.attemptBreakthrough()
  assert(gs.get().family.btSabotage === false, 'sabotage cleared after one attempt')
  // Crisis: affection low → crisis pool eventually
  s = gs.get(); let crisis = null
  for (let i = 0; i < 40 && !crisis; i++) { s.family.event = null; s.family.affection = 5; s.family.nextEventYear = s.world.year - 1; gs._tickFamily(); if (s.family.event?.crisis) crisis = s.family.event }
  assert(!!crisis, `crisis event fires at low affection (${crisis?.id})`)
  // Forgive
  s.family.event = { id: 'spouse_cheated', crisis: true, year: 1 }; s.family.affection = 10
  gs.resolveMarriageEvent(0); assert(gs.get().family.affection === 25 && gs.get().family.spouse, 'forgive: +15, spouse stays')
  // Confront → duel → flee
  s = gs.get(); s.family.event = { id: 'spouse_cheated', crisis: true, year: 1 }
  gs.resolveMarriageEvent(1); assert(!!gs.get().family.duel, 'confront → duel pending')
  const fl = gs.resolveDuel('flee'); s = gs.get()
  assert(fl.outcome === 'fled' && !s.family.spouse && s.family.formerSpouses.at(-1).endCause === 'left' && s.family.nextProposalYear > s.world.year, 'flee → spouse leaves, proposals resume later')
  const kidsBefore = s.family.children.length
  assert(s.family.children.every(c => c.alive) && kidsBefore >= 8, 'children stay with you')
  // Duel win and lose (new marriages)
  for (const [seed, want] of [[11, 'won'], [12, 'lost']]) {
    const m = await married(seed); const g = m.gs, st = g.get()
    st.family.duel = { year: 1, reason: 'test' }
    st.stageIndex = want === 'won' ? 21 : 1; st.family.spouse.stageIndex = want === 'won' ? 1 : 21; g._recalc()
    m.sim.ev('globalThis.__r = Math.random; Math.random = () => ' + (want === 'won' ? 0.0 : 0.99))
    let d = g.resolveDuel('fight')   // 1.8b-3b: exchange by exchange, under the forced RNG
    for (let i = 0; i < 8 && g.get().family?.fight; i++)   // A6-3a: a won duel waits for the end choice — Finish (the old outcome)
      d = { ...(g.get().family.fight.over ? g.personFightFinish('finish') : g.fightExchange('press')), chance: d.chance }
    m.sim.ev('Math.random = globalThis.__r')
    const after = g.get()
    if (want === 'won') assert(d.outcome === 'won' && after.family.formerSpouses.at(-1).alive === false && after.family.formerSpouses.at(-1).endCause === 'duel' && after.health >= 1, `duel won (chance ${d.chance}) → spouse dead, you wounded`)
    else assert(d.outcome === 'lost' && after.lastReincarnation?.cause === 'spouse_duel' && after.generation === 2, `duel lost (chance ${d.chance}) → life ends (spouse_duel)`)
  }
  // Beg / let go / divorce
  { const m = await married(21); const g = m.gs, st = g.get()
    st.family.event = { id: 'spouse_leaving', crisis: true, year: 1 }
    m.sim.ev('globalThis.__r = Math.random; Math.random = () => 0'); g.resolveMarriageEvent(0); m.sim.ev('Math.random = globalThis.__r')
    assert(g.get().family.spouse && g.get().family.affection === 35, 'beg (lucky) → stays at 35')
    g.get().family.event = { id: 'spouse_leaving', crisis: true, year: 1 }; g.resolveMarriageEvent(1)
    assert(!g.get().family.spouse && g.get().family.formerSpouses.at(-1).endCause === 'left', 'let go → left') }
  { const m = await married(22); const g = m.gs, st = g.get()
    st.family.event = { id: 'spouse_cheated', crisis: true, year: 1 }; g.resolveMarriageEvent(2)
    assert(!g.get().family.spouse && g.get().family.formerSpouses.at(-1).endCause === 'divorced', 'divorce → divorced')
    const lr0 = g.get(); const spMax = lr0.family.formerSpouses.at(-1).maxStage
    g.passTheMantle(); assert(g.get().lastReincarnation.spouseMaxStage === spMax, 'partner term uses last former spouse') }
  // Unaffordable choice rejected
  { const m = await married(31); const g = m.gs, st = g.get()
    st.family.event = { id: 'anniversary', crisis: false, year: 1 }; st.spiritStones = 0
    assert(g.resolveMarriageEvent(0).reason === 'cant_afford', 'unaffordable choice rejected') }
})()
