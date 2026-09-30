// Probe — 1.14a people on moves (docs/systems/arts.md → "People on moves"): the move-fight estimate against people of
// each temper at a stage gap, how long one estimate takes, and what arts people carry. A tuning aid, not a check.
// Run: node scripts/sim/probe-person-fights.js [stage] [loadout: starter|kept]
const { createSim } = require('./loader.js')

;(async () => {
  const stage = +(process.argv[2] || 5), kept = (process.argv[3] || 'kept') === 'kept'
  const sim = await createSim({ seed: 11 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100; gs._recalc()
  if (kept) {                                            // a well-kept loadout: the best attacks of your element you could know
    const els = gs.rootElements(), ARTS_LIST = sim.ev('ARTS_LIST')
    const pool = ARTS_LIST.filter(a => a.kind === 'move' && !a.sig && a.minStage <= stage && (els.includes(a.element) || a.element === 'neutral') && a.move.power)
      .sort((a, b) => b.move.power * (b.move.hits || 1) - a.move.power * (a.move.hits || 1)).slice(0, 3)
    for (const a of pool) s.arts.known[a.id] = { mastery: 1, xp: 0, uses: 0 }
    s.arts.loadout.moves = [...pool.map(a => a.id), 'qi_shield']
  }
  console.log(`You: stage ${stage}, root ${s.root.name} (${gs.rootElements().join('/')}), moves ${s.arts.loadout.moves.filter(Boolean).join(', ')}`)
  const tempers = ['hotblood', 'stoic', 'coward', 'psycho', 'arrogant', 'niceguy']
  for (const gap of [-3, -1, 0, 1, 3]) {
    const row = []
    for (const t of tempers) {
      let sum = 0, n = 0, ms = 0
      for (let i = 0; i < 4; i++) {
        const p = gs._genPerson({ family: 'Probe', bornYear: 0, stage: Math.max(0, stage + gap), role: 'duelist' })
        p.personality = t; p.root = { ...s.root, elements: undefined }; delete p.arts
        const t0 = Date.now(); sum += gs.personFightOdds(p, 'arena', false).chance; ms += Date.now() - t0; n++
        if (gap === 0 && i === 0 && t === 'hotblood') console.log('  e.g. hotblood arts:', gs.personArts(p).moves.join(', '), '| passives:', gs.personArts(p).passives.join(', '))
      }
      row.push(`${t} ${Math.round(100 * sum / n)}% (${Math.round(ms / n)}ms)`)
    }
    console.log(`gap ${gap >= 0 ? '+' : ''}${gap} (them vs you): ${row.join(' · ')}`)
  }
})()
