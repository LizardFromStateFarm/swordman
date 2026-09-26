// Scenario checks — family.md commit B: lover encounters (seduce / leave / fade), lover children, affair discovery,
// every spouse reaction branch (accept / sabotage / duel / suicide / murder-suicide), tolerant spouse, unmarried lovers.
// Run: npm run checks (all) · node scripts/sim/checks/family-affairs.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
async function setup(seed) {
  const sim = await createSim({ seed }); await sim.boot(0)
  const gs = sim.gs; const s = gs.get()
  s.stageIndex = 12; s.maxStageThisLife = 12; s.spiritStones = 1e6; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily()
  gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  return { sim, gs }
}
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')
;(async () => {
  // Encounter via a real expedition resolve
  { const { sim, gs } = await setup(1); const s = gs.get()
    for (let i = 0; i < 200 && !gs.get().family.encounters.length; i++) { const st = gs.get(); st.health = 100; st.stageIndex = 12; st.expedition = { active: true, locationId: sim.data.LOCATIONS[0].id, endsAt: 0 }; gs.resolveExpedition() }
    assert(gs.get().family.encounters.length === 1, `expedition produced an encounter: ${gs.get().family.encounters[0]?.person.given} at ${gs.get().family.encounters[0]?.place}`)
    rng(sim, 0.99); const fail = gs.seduceEncounter(0); unrng(sim)
    assert(fail.ok && !fail.success && gs.get().family.lovers.length === 0 && gs.get().family.encounters.length === 0, 'failed seduction consumes the encounter')
    s.family.encounters.push({ person: gs._rollStranger('stranger'), place: 'X', text: 't', year: 1 })
    rng(sim, 0.0); const ok = gs.seduceEncounter(0); unrng(sim)
    assert(ok.success && gs.get().family.lovers.length === 1 && gs.get().family.tally.affairs === 1, 'seduction → lover')
    const lover = gs.get().family.lovers[0]
    lover.nextChildYear = gs.get().world.year - 1
    rng(sim, 0.99); gs._tickFamily(); unrng(sim)   // 0.99 → no discovery
    const kid = gs.get().family.children.at(-1)
    assert(kid && kid.parents.includes(lover.person.id), 'lover child born with lover as parent')
    lover.endsYear = gs.get().world.year - 1; gs._tickFamily()
    assert(gs.get().family.lovers.length === 0, 'affair fades after AFFAIR_YEARS')
    s.family.encounters.push({ person: gs._rollStranger('stranger'), place: 'X', text: 't', year: 1 })
    assert(gs.dismissEncounter(0).ok && gs.get().family.encounters.length === 0, 'dismiss encounter')
  }
  // Each reaction, forced via personality + RNG
  const cases = [['lazy', 0.0, 'accept'], ['miser', 0.6, 'sabotage'], ['hotblood', 0.5, 'duel'], ['poet', 0.75, 'suicide'], ['psycho', 0.999, 'murder_suicide']]
  for (const [pers, r, want] of cases) {
    const { sim, gs } = await setup(40); const s = gs.get(), f = s.family
    f.spouse.personality = pers; f.affection = 90
    // one minor + one adult child with the spouse
    const minor = gs._makeChild(f.spouse); const adult = gs._makeChild(f.spouse); adult.bornYear -= 40
    f.lovers.push({ person: gs._rollStranger('lover'), since: 1, nextChildYear: 1e9, endsYear: 1e9 })
    rng(sim, r); gs._discoverAffair(f.lovers[0], false); unrng(sim)
    const g = gs.get().family
    assert(g.tally[want] === 1, `${pers} → ${want} (tally ${JSON.stringify({a:g.tally.accept,s:g.tally.sabotage,d:g.tally.duel,su:g.tally.suicide,m:g.tally.murder_suicide})})`)
    if (want === 'accept') assert(g.tolerant && g.spouse, '  tolerant, still married')
    if (want === 'sabotage') assert(g.btSabotage && g.spouse, '  next breakthrough sabotaged')
    if (want === 'duel') assert(!!g.duel && g.spouse, '  duel pending')
    if (want === 'suicide') assert(!g.spouse && g.formerSpouses.at(-1).endCause === 'suicide' && !g.formerSpouses.at(-1).alive && minor.alive, '  spouse dead, children unharmed')
    if (want === 'murder_suicide') assert(!g.spouse && !minor.alive && adult.alive && minor.cause === 'murder_suicide', '  spouse + minor child dead, adult child survives')
  }
  // Tolerant spouse: lover child only costs affection
  { const { sim, gs } = await setup(50); const f = gs.get().family
    f.tolerant = true; f.affection = 60
    f.lovers.push({ person: gs._rollStranger('lover'), since: 1, nextChildYear: gs.get().world.year - 1, endsYear: 1e9 })
    rng(sim, 0.0); gs._tickFamily(); unrng(sim)
    assert(gs.get().family.tally.discovered === 0 && Math.round(gs.get().family.affection) === 55, `tolerant spouse: no reaction, affection −5 (${gs.get().family.affection.toFixed(1)})`)
  }
  // Discovery via child: −35 total before the reaction
  { const { sim, gs } = await setup(60); const f = gs.get().family
    f.spouse.personality = 'lazy'; f.affection = 80
    f.lovers.push({ person: gs._rollStranger('lover'), since: 1, nextChildYear: gs.get().world.year - 1, endsYear: 1e9 })
    rng(sim, 0.0); gs._tickFamily(); unrng(sim)
    const g = gs.get().family
    assert(g.tally.discovered === 1 && Math.abs(g.affection - 45) < 1, `discovered via lover's child, affection 80 → ${g.affection.toFixed(1)} (−35, then drift)`)
  }
  // Unmarried: lovers have children, no discovery
  { const sim = await createSim({ seed: 70 }); await sim.boot(0); const gs = sim.gs, f = gs.get().family
    gs.get().maxStageThisLife = 12
    f.lovers.push({ person: gs._rollStranger('lover'), since: 1, nextChildYear: gs.get().world.year - 1, endsYear: 1e9 })
    rng(sim, 0.0); gs._tickFamily(); unrng(sim)
    assert(gs.get().family.children.length === 1 && gs.get().family.tally.discovered === 0, 'unmarried: lover child, nobody to discover')
  }
})()
