// Scenario checks — M6 Family depth (docs/systems/family-depth.md).
// Ancestral Visions (the offer, the choose-one boon, the Qi/s effect, validation) + the cross-save Hall of the
// Fallen (a death records a tombstone; the soul normalises it). Run: npm run checks · node scripts/sim/checks/family-depth.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()

  // ── Ancestral Visions ──
  s.visionOffer = { at: Date.now(), options: ['body', 'integrity', 'stones', 'qi'] }
  gs._recalc()
  const off = gs.visionOfferInfo()
  assert(off && off.options.length === 4, 'a vision offer presents its options')
  assert(gs.chooseVision('nope').reason === 'unknown', 'an unknown vision is refused')

  const stones0 = s.spiritStones
  assert(gs.chooseVision('stones').ok && s.spiritStones === stones0 + 300, 'the Hidden Purse grants its stones once')
  assert(s.visionOffer === null && s.vision === 'stones', 'choosing clears the offer and records the vision')
  assert(gs.chooseVision('qi').reason === 'none', 'a vision is chosen once')

  // Qi vision effect
  s.vision = null; gs._recalc(); const q0 = gs.get().derived.qiPerSecond
  s.vision = 'qi'; gs._recalc(); const q1 = gs.get().derived.qiPerSecond
  assert(q1 > q0 && Math.abs(q1 / q0 - 1.10) < 0.01, `the Ancestors Breathe raises Qi/s 10% (${q0.toFixed(2)} → ${q1.toFixed(2)})`)

  // Vision options are deterministic per life id
  assert(JSON.stringify(gs._visionOptions()) === JSON.stringify(gs._visionOptions()), 'vision options are deterministic (no RNG)')
  assert(gs._visionOptions().length === 3, 'three options are offered')

  // ── Hall of the Fallen (cross-save) ──
  const diedName = s.name
  gs._die('road')
  const fallen = gs.fallenInfo()
  assert(fallen.length === 1 && fallen[0].name === diedName && fallen[0].cause === 'road', 'a death records a tombstone in the soul')
  assert(typeof fallen[0].realm === 'string' && fallen[0].year >= 0, 'the tombstone names the realm and year')

  const norm = gs._normSoul({ fallen: [{ name: 'Old One', clan: 'Li', gen: 3, realm: 'Core Formation', cause: 'duel', year: 12 }, null, { nope: 1 }] })
  assert(norm.fallen.length === 1 && norm.fallen[0].name === 'Old One', 'the soul normaliser keeps only real tombstones')

  // ── Migration ──
  const sim2 = await createSim({ seed: 2 }); await sim2.boot(0); const s2 = sim2.gs.get()
  delete s2.vision; delete s2.visionOffer
  sim2.gs._ensurePhase18Fields()
  assert(s2.vision === null && s2.visionOffer === null, 'migration fills the vision fields')
})()
