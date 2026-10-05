// Probe — v1 add-on (docs/systems/bosses.md → "Tuning"): the legendary bosses' move-fight estimate with a "kept" loadout
// (the strongest 3 attacks of your root's elements that realm can know + Qi Shield, mastery as given), at the boss's gate,
// +1 and +3 stages, after 0 / 3 / 5 failed tries, and with the body tier given. Also the strongest beast at that gate for
// comparison. Prints win %, mean turns and Health lost. A tuning aid, not a check.
// Run: node scripts/sim/probe-boss-fights.js [mastery=2] [bodyTier=2] [root=pure]
const { createSim } = require('./loader.js')

;(async () => {
  const mastery = +(process.argv[2] || 2), bodyTier = +(process.argv[3] || 2), rootType = process.argv[4] || 'pure'
  const sim = await createSim({ seed: 5 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const ARTS_LIST = sim.ev('ARTS_LIST'), BOSSES = sim.ev('BOSSES'), BOSS_ORDER = sim.ev('BOSS_ORDER'), BEASTS = sim.ev('BEAST_TYPES')
  s.root = gs._rollSpecificRoot(rootType) || s.root
  const els = gs.rootElements()
  const kit = stage => ARTS_LIST.filter(a => a.kind === 'move' && !a.sig && a.minStage <= stage &&
      (els.includes(a.element) || a.element === 'neutral') && a.move && a.move.power && a.move.type !== 'heal')
    .sort((a, b) => (b.move.power * (b.move.hits || 1)) - (a.move.power * (a.move.hits || 1))).slice(0, 3).map(a => a.id)
  const W = s.world; W.pastLives = Array.from({ length: 6 }, (_, i) => ({ personId: 'p' + i, cause: 'probe', year: 0 }))
  console.log(`You: root ${s.root.name} (${els.join('/')}), kept loadout, mastery ${mastery}, body tier ${bodyTier}`)
  const set = stage => {
    s.stageIndex = stage; s.maxStageThisLife = stage; s.body.tier = bodyTier; gs._recalc(); s.health = gs.maxHealth()
    s.arts.known = { palm_strike: { mastery, xp: 0, uses: 0 }, qi_shield: { mastery, xp: 0, uses: 0 } }
    for (const id of kit(stage)) s.arts.known[id] = { mastery, xp: 0, uses: 0 }
    s.arts.loadout.moves = [...kit(stage), 'qi_shield'].slice(0, 4)
    s.arts.parry = { tries: 0, hits: 0 }
    gs._recalc(); s.health = gs.maxHealth()
  }
  for (const id of BOSS_ORDER) {
    const def = BOSSES[id]
    for (const up of [0, 1, 3]) for (const tries of [0, 3, 5]) {
      if (up && tries) continue
      set(def.gates.stage + up)
      Object.assign(W.bosses[id], { tries, restUntil: 0, wonLife: 0, mercy: 0 })
      const pv = gs.bossFightPreview(id)
      console.log(`${def.short.padEnd(16)} stage ${def.gates.stage}${up ? '+' + up : '  '} tries ${tries}  win ${(pv.chance * 100).toFixed(0).padStart(3)}%  turns ${pv.turns.toFixed(1)}  hurt ${pv.hurt}  (its HP ${pv.foeHp}, power ${pv.power.total})`)
    }
    set(def.gates.stage)
    const beast = BEASTS.filter(b => b.minStage <= def.gates.stage).sort((a, b) => b.minStage - a.minStage)[0]
    s.beastEncounters = [{ id: 'e1', typeId: beast.id, traits: [], seenAt: 0 }]
    const bv = gs.beastFightPreview('e1')
    console.log(`  (for scale: ${beast.id} at the same stage: win ${(bv.stance.slay.chance * 100).toFixed(0)}%, turns ${bv.stance.slay.turns.toFixed(1)})`)
  }
})().catch(e => { console.error(e); process.exitCode = 1 })
