// Probe — 1.15 QA (docs/systems/arts.md → "Move combat"): the move-fight estimate against every beast, at its own gate
// realm and one realm up, with a "kept" loadout (the best attacks of your root's elements that realm can know) or the
// starter three. Prints the win chance and the mean turns per beast — the fight-length tuning aid behind the sim's
// `fightTurns` metric (a whole-run average; this breaks it down per beast). A tuning aid, not a check.
// Run: node scripts/sim/probe-beast-fights.js [kept|starter]   (default kept)
const { createSim } = require('./loader.js')

;(async () => {
  const kept = (process.argv[2] || 'kept') === 'kept'
  const sim = await createSim({ seed: 5 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const BEASTS = sim.ev('BEAST_TYPES'), ARTS_LIST = sim.ev('ARTS_LIST'), els = gs.rootElements()
  const kit = stage => !kept ? [] : ARTS_LIST.filter(a => a.kind === 'move' && !a.sig && a.minStage <= stage &&
      (els.includes(a.element) || a.element === 'neutral') && a.move && a.move.power && a.move.type !== 'heal')
    .sort((a, b) => (b.move.power * (b.move.hits || 1)) - (a.move.power * (a.move.hits || 1))).slice(0, 3).map(a => a.id)
  console.log(`You: root ${s.root.name} (${els.join('/')}), loadout ${kept ? 'kept' : 'starter'}`)
  const rows = []
  for (const b of BEASTS) {
    for (const up of [0, 2]) {                       // them at their gate, and one realm stronger
      const stage = b.minStage + up
      s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100
      s.personality = { ...(s.personality || {}), id: 'stoic' }
      if (kept) {                                    // a well-kept loadout: the strongest 3 attacks this realm can know
        s.arts.known = { palm_strike: { mastery: 1, xp: 0, uses: 0 }, qi_shield: { mastery: 1, xp: 0, uses: 0 } }
        for (const id of kit(stage)) s.arts.known[id] = { mastery: 1, xp: 0, uses: 0 }
        s.arts.loadout.moves = [...kit(stage), null].slice(0, 4)
      }
      s.arts.parry = { tries: 0, hits: 0 }
      s.beastEncounters = [{ id: 'e1', typeId: b.id, traits: [], seenAt: 0 }]
      gs._recalc()
      const pv = gs.beastFightPreview('e1')
      rows.push({ id: b.id, gate: b.minStage, up, chance: pv.stance.slay.chance, turns: pv.stance.slay.turns })
    }
  }
  for (const r of rows)
    console.log(`${r.id.padEnd(15)} gate ${String(r.gate).padStart(2)} ${r.up ? '+2' : '  '}  win ${(r.chance * 100).toFixed(0).padStart(3)}%  turns ${r.turns.toFixed(1)}`)
  const even = rows.filter(r => !r.up).map(r => r.turns)
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length
  console.log(`\ngate-realm turns: avg ${avg(even).toFixed(1)} (min ${Math.min(...even).toFixed(1)} max ${Math.max(...even).toFixed(1)}) — arts.md target 4–8`)
})().catch(e => { console.error(e); process.exitCode = 1 })
