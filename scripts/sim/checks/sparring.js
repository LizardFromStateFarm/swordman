// Scenario checks — Sparring (docs/systems/body-constitution.md → "Sparring", user 2026-11-26).
// No-Qi, non-lethal body training: available from the first life, pays body XP win or lose, costs a little Health,
// never kills, respects the tier lock + cooldown, and never touches cultivation Qi.
// Run: npm run checks · node scripts/sim/checks/sparring.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const force = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unforce = sim => sim.ev('Math.random = globalThis.__r')

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()

  const info = gs.sparringInfo()
  assert(info.list.length === 4 && info.list.find(o => o.id === 'village').ok, 'village sparring is open from the first life')
  assert(!info.list.find(o => o.id === 'hunter').ok && /Train to/.test(info.list.find(o => o.id === 'hunter').lock), 'a tougher opponent is tier-locked')
  const h0 = s.health, q0 = s.qi
  const villages0 = info.list.find(o => o.id === 'village').chance

  // Win
  force(sim, 0)
  const w = gs.spar('village'); unforce(sim)
  assert(w.ok && w.win && w.xp > 0 && w.damage >= 0, `a win pays body XP (${w.xp}) and bruises (${w.damage})`)
  assert(s.health < h0 && s.health >= 1, 'sparring costs a little Health but never kills')
  assert(s.qi === q0, 'sparring grants no cultivation Qi')
  assert(gs.sparringInfo().cdIn > 0 && s.sparring.wins === 1, 'a bout sets the cooldown and the record')
  assert(gs.spar('village').reason === 'cooldown', 'you cannot spar again until you catch your breath')

  // Loss still trains
  s.sparring.cdUntil = 0
  const xpBefore = s.body.xp
  force(sim, 0.999)
  const l = gs.spar('village'); unforce(sim)
  assert(l.ok && !l.win && l.xp > 0 && s.body.xp >= xpBefore, 'a loss still pays body XP (you learn)')

  // Never kills, even at the floor
  s.sparring.cdUntil = 0; s.health = 8
  force(sim, 0.999)
  const near = gs.spar('village'); unforce(sim)
  assert(near.ok && s.health >= 1 && near.damage >= 0, 'a spar floors Health at 1')

  // Tier unlock (restore Health first so the too-hurt lock does not mask it) + too-hurt lock
  s.body.tier = 1; s.health = 100; s.sparring.cdUntil = 0; gs._recalc()
  assert(gs.sparringInfo().list.find(o => o.id === 'hunter').ok, 'a higher body tier unlocks the tougher opponent')
  s.health = gs.sparringInfo().healthCost; s.sparring.cdUntil = 0
  assert(gs.spar('village').reason === 'hurt', 'a badly hurt body cannot spar')

  // Migration
  delete s.sparring
  gs._ensureSparringFields()
  assert(s.sparring && s.sparring.wins === 0 && s.sparring.cdUntil === 0, 'migration fills the sparring record')
})()
