// Scenario checks — M8 cleanup (docs/systems/world-flavor.md): challenge modes, cosmetics, the scripture codex.
// Run: npm run checks · node scripts/sim/checks/flavor.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()

  // ── Challenge modes ──
  assert(gs.challengeInfo().current.id === 'normal', 'a life starts on The Open Road')
  s.challenge = 'normal'; gs._recalc(); const q0 = gs.get().derived.qiPerSecond
  assert(gs.setChallenge('iron').ok && s.challenge === 'iron', 'a challenge can be chosen before awakening')
  gs._recalc(); const q1 = gs.get().derived.qiPerSecond
  assert(Math.abs(q1 / q0 - 0.80) < 0.02, `Iron Blood cuts Qi/s to 80% (${q0.toFixed(2)} → ${q1.toFixed(2)})`)
  s.awakened = true
  assert(gs.setChallenge('normal').reason === 'started', 'a challenge is fixed once the climb begins')

  // ── Cosmetics ──
  assert(gs.setPet('rabbit').ok && gs.cosmeticInfo().pets.find(p => p.id === 'rabbit').active, 'a spirit pet can be chosen')
  assert(gs.setCave('bamboo').ok && gs.cosmeticInfo().caves.find(c => c.id === 'bamboo').active, 'a cave can be chosen')
  assert(gs.setPet('nope').reason === 'unknown', 'an unknown cosmetic is refused')

  // ── Scripture codex ──
  s.lore = {}; s.stageIndex = 0; gs._checkLore()
  let lore = gs.loreInfo()
  assert(lore.find(x => x.id === 'breath').seen, 'the first scripture unlocks at the start')
  assert(!lore.find(x => x.id === 'core').seen, 'a later scripture is still sealed')
  s.stageIndex = 13; gs._checkLore()
  lore = gs.loreInfo()
  assert(lore.find(x => x.id === 'foundation').seen && lore.find(x => x.id === 'core').seen, 'reaching a realm unlocks its scripture')
  assert(lore.every(x => x.name && x.text), 'every scripture is authored')

  // ── Migration ──
  delete s.challenge; delete s.pet; delete s.cave; delete s.lore
  gs._ensureFlavorFields()
  assert(s.challenge === 'normal' && s.pet === null && s.cave === null && typeof s.lore === 'object', 'migration fills the flavor fields')
})()
