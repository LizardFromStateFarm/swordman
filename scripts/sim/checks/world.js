// Scenario checks — clan-succession.md 2.6a: world vs life save split. Fresh world + founding clan, migration of
// 2.5-era and pre-2.2 saves, a death keeping the world/family roster/clock, and a full orphan (clanless) life.
// Run: npm run checks (all) · node scripts/sim/checks/world.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const years = (sim, n) => { for (let i = 0; i < n * 120 + 5; i++) sim.step(1) }
;(async () => {
  // 1. Fresh world
  { const sim = await createSim({ seed: 1 }); await sim.boot(0); const s = sim.gs.get(), w = s.world
    const clan = w.clans[w.playerClanId]
    assert(w.year === 1 && clan && clan.headId === s.self.id && clan.lines[0].memberIds.includes(s.self.id) && s.self.id === 'p1', 'fresh slot: world + founding clan led by p1')
    assert(!('clan' in s) && !('gameYear' in s), 'no legacy clan/gameYear fields')
  }
  // 2. Migrate a task-2.5-era save (s.clan skeleton + per-life gameYear, no world)
  { const sim = await createSim({ seed: 2 }); await sim.boot(0)
    const old = JSON.parse(JSON.stringify(sim.gs.get()))
    delete old.world; old.clan = { name: 'Lin', nextId: 7 }; old.gameYear = 123.5; old.self.id = 'p6'
    sim.saves[0] = JSON.stringify(old); await sim.gs.initSlot(0)
    const s = sim.gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    assert(w.year === 123.5 && w.nextId === 7 && clan.name === 'Lin' && clan.headId === 'p6', `2.5-era save migrated (year ${w.year}, nextId ${w.nextId}, clan ${clan.name}, head ${clan.headId})`)
    assert(!('clan' in s) && !('gameYear' in s), 'legacy fields dropped after migration')
  }
  // 3. Migrate a pre-2.2 save (no clan, no self, no age)
  { const sim = await createSim({ seed: 3 }); await sim.boot(0)
    const old = JSON.parse(JSON.stringify(sim.gs.get()))
    delete old.world; delete old.self; delete old.age; delete old.family; old.name = 'Wang Lei'; old.stats.timePlayed = 7200
    sim.saves[0] = JSON.stringify(old); await sim.gs.initSlot(0)
    const s = sim.gs.get(), clan = s.world.clans[s.world.playerClanId]
    assert(s.self.given === 'Lei' && clan.headId === s.self.id && s.age === 16 + 2 * 30 && s.world.year === 61, `pre-2.2 save migrated (self ${s.self.given}, age ${s.age}, year ${s.world.year})`)
  }
  // 4. Death: the world persists, family goes on the roster, clock keeps running
  { const sim = await createSim({ seed: 4 }); await sim.boot(0); const gs = sim.gs
    let s = gs.get(); s.stageIndex = 12; s.maxStageThisLife = 12; gs._recalc()
    s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
    for (let i = 0; i < 3; i++) { gs.get().family.nextChildYear = gs.get().world.year - 1; gs._tickFamily() }
    years(sim, 10); s = gs.get()
    const me = s.self.id, spouse = s.family.spouse.id, kids = s.family.children.map(c => c.id), yearAtDeath = s.world.year
    gs.passTheMantle(); s = gs.get()
    const w = s.world, clan = w.clans[w.playerClanId], roster = clan.lines[0].memberIds
    assert(w.persons[me]?.role === 'ancestor' && w.persons[me].alive === false && w.persons[me].maxStage === 12 && w.persons[me].root, 'past self snapshotted with root/stage into the registry')
    assert(kids.every(id => w.persons[id] && roster.includes(id)) && roster.includes(spouse), `spouse + ${kids.length} children kept on the clan roster`)
    assert(w.pastLives.length === 1 && w.pastLives[0].personId === me && w.pastLives[0].cause === 'passed_mantle', 'pastLives entry written')
    assert(Math.abs(w.year - yearAtDeath) < 1e-9 && s.age === 16, `world clock continues (${yearAtDeath.toFixed(2)} → ${w.year.toFixed(2)}); new life age 16`)
    assert(clan.headId === s.self.id && s.self.id !== me && !w.persons[s.self.id], 'new life leads the clan (placeholder until 2.6d), not duplicated in registry')
    assert(s.family.children.length === 0 && s.generation === 2, 'life state reset (family, generation 2)')
  }
  // 5. Orphan life: no clan anywhere — must not throw through marriage, children, lovers, events, death
  { const sim = await createSim({ seed: 5 }); await sim.boot(0); const gs = sim.gs
    let s = gs.get(); s.world.playerClanId = null; s.world.playerLineId = null
    s.stageIndex = 12; s.maxStageThisLife = 12; s.spiritStones = 1e6; gs._recalc()
    s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
    gs.get().family.nextChildYear = gs.get().world.year - 1; gs._tickFamily()
    years(sim, 60)
    assert(gs.get().family.children.length >= 1 && gs.get().family.children[0].family === '', 'orphan: children born, no clan surname')
    gs.passTheMantle(); s = gs.get()
    assert(s.world.playerClanId === null && s.world.pastLives[0].clanId === null && Object.keys(s.world.clans).length === 1, 'orphan death: no clan joined; old clan still exists in the world')
  }
})()
