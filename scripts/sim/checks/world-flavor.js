// Scenario checks — M8 World flavor (docs/systems/world-flavor.md).
// World epochs + spiritual tides, the Secret Realm dungeon (enter / press / rest / leave / clear, stage lock),
// and cosmetic titles. Run: npm run checks · node scripts/sim/checks/world-flavor.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()

  // ── World epochs ──
  assert(gs.epochInfo().id === 'dawn', 'a fresh world is in the Dawning Age')
  const q0 = gs.get().derived.qiPerSecond
  s.world.epoch = { id: 'dawn', since: 0 }; s.world.year = 500; gs._tickEpoch(500)
  assert(s.world.epoch.id === 'tide', 'an epoch turns when its span elapses')
  gs._recalc()
  const q1 = gs.get().derived.qiPerSecond
  assert(Math.abs(q1 / q0 - 1.12) < 0.02, `the Rising Tide raises Qi/s ~12% (${q0.toFixed(2)} → ${q1.toFixed(2)})`)
  assert(gs.epochInfo().yearsLeft > 0, 'the epoch reports its remaining years')

  // ── Secret Realm dungeon ──
  s.stageIndex = 10; s.awakened = true; s.spiritStones = 500; s.health = 100; gs._recalc()
  assert(gs.secretRealmInfo().list.length === 3, 'three secret realms are listed')
  const stones0 = s.spiritStones
  assert(gs.enterSecretRealm('mist_cave').ok, 'a realm can be entered')
  assert(s.secretRealm.active && s.spiritStones === stones0 - 20, 'entering costs its stones and starts the run')
  const r1 = gs.secretRealmStep('advance')
  assert(r1.ok && s.health <= 100 && s.health >= 1, 'pressing deeper costs Health but never kills')
  let guard = 0, done = false
  while (s.secretRealm.active && guard++ < 10) { const r = gs.secretRealmStep('advance'); if (r.done) done = true }
  assert(done && !s.secretRealm.active, 'clearing the last room finishes the run')
  assert((s.inventory.artifact_fragment || 0) >= 1, 'the final chamber grants its reward')

  gs.enterSecretRealm('mist_cave')
  assert(gs.secretRealmStep('leave').left && !s.secretRealm.active, 'leaving ends the run')
  s.stageIndex = 0
  assert(gs.enterSecretRealm('heaven_tomb').reason === 'stage', 'a realm above your realm is refused')

  // ── Cosmetic titles ──
  s.stageIndex = 10; gs._recalc()
  assert(gs.titleInfo().unlocked.some(t => t.id === 'none'), 'the None title is always available')
  assert(gs.setTitle('founder').reason === 'locked', 'a title you have not earned is locked')
  s.ownSect = { ...gs._blankOwnSect(), founded: true, name: 'T', hallLevel: 2 }
  gs._recalc()
  assert(gs.titleInfo().unlocked.some(t => t.id === 'founder'), 'founding a sect unlocks the Founder title')
  assert(gs.setTitle('founder').ok && s.title === 'founder', 'an unlocked title can be worn')

  // ── Migration ──
  delete s.secretRealm; delete s.title; delete s.world.epoch
  gs._ensureSecretRealmFields(); gs._ensurePhase19Fields()
  assert(s.secretRealm && s.secretRealm.active === false && s.title === null && s.world.epoch?.id, 'migration fills the M8 fields')
})()
