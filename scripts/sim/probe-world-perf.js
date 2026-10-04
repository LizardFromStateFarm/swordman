// Perf probe (not a check) — Phase 28 task 4.11 (living-world.md §6.2, §10): matures a world (W years of the light +
// heavy sim, a new class every 120 years), then times each piece of the game-year turn and the autosave serialization
// over N more years: _tickWorldSects, _tickWorldLives (the light step), one heavy season (_heavyStep), _tickRepute,
// _tickRival, _tickRanks, _syncPersons, JSON.stringify of the slot, and the generation jump between lives (_worldYears). Prints mean / p95 / max in ms per call and the
// registry size. Budgets: a heavy season ≤ 2 ms, the save stringify ≤ 15 ms (desktop).
// Run: node scripts/sim/probe-world-perf.js [matureYears=400] [measureYears=120] [seed=1]
const { createSim } = require('./loader.js')
const { performance } = require('perf_hooks')
;(async () => {
  const W = +(process.argv[2] || 400), N = +(process.argv[3] || 120), seed = +(process.argv[4] || 1)
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs
  const s = gs.get(), w = s.world, H = sim.ev('NPC_HEAVY')
  s.stageIndex = 9; s.maxStageThisLife = 9; gs._recalc()
  const y0 = Math.floor(w.year)
  const yearOf = y => { w.year = y + 0.01; s.age = (s.age || 16) + 1 }
  const t0 = performance.now()
  for (let y = y0 + 1; y <= y0 + W; y++) {
    yearOf(y)
    gs._tickWorldSects(); gs._tickWorldLives()
    for (let k = 0; k < H.seasons; k++) gs._heavyStep(y * H.seasons + k, true)
    gs._tickRepute(y); gs._tickRival(y); gs._tickRanks(y); gs._syncPersons()
    if ((y - y0) % 120 === 0) { w.pastLives.push({ personId: 'probe' + y, cause: 'probe', year: y }); s.age = 16; gs._seedCohort() }
  }
  console.log(`matured ${W} years in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  const T = {}
  const time = (k, fn) => { const a = performance.now(); fn(); (T[k] ||= []).push(performance.now() - a) }
  const y1 = Math.floor(w.year)
  for (let y = y1 + 1; y <= y1 + N; y++) {
    yearOf(y)
    time('worldSects (yearly)', () => gs._tickWorldSects())
    time('worldLives / light step (yearly)', () => gs._tickWorldLives())
    for (let k = 0; k < H.seasons; k++) time('heavy season', () => gs._heavyStep(y * H.seasons + k, true))
    time('repute (yearly)', () => gs._tickRepute(y))
    time('rival (yearly)', () => gs._tickRival(y))
    time('ranks publication (yearly)', () => gs._tickRanks(y))
    time('syncPersons (yearly)', () => gs._syncPersons())
    if (y % 10 === 0) time('save stringify', () => JSON.stringify(s))
    if (y % 10 === 0) time('rankingsInfo(heaven) (UI read)', () => gs.rankingsInfo('heaven'))
    if (y % 10 === 0) time('knownPeople (UI read)', () => gs.knownPeople({}))
  }
  // The generation jump between lives (_worldYears, quiet): one call over J years.
  for (const J of [20, 40, 80]) { const y = Math.floor(w.year); time(`generation jump ${J} yrs`, () => gs._worldYears(y, y + J)); w.year = y + J + 0.01 }
  const live = Object.values(w.persons).filter(p => p.alive !== false)
  console.log(`registry ${Object.keys(w.persons).length} (${live.length} living, ${live.filter(p => p.tier === 'heavy').length} heavy) · slot ${Math.round(JSON.stringify(s).length / 1024)} KB`)
  const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))] }
  console.log('piece'.padEnd(36) + 'calls   mean ms   p95 ms   max ms')
  for (const [k, a] of Object.entries(T)) {
    const m = a.reduce((x, y) => x + y, 0) / a.length
    console.log(k.padEnd(36) + String(a.length).padStart(5) + m.toFixed(2).padStart(10) + q(a, 0.95).toFixed(2).padStart(9) + Math.max(...a).toFixed(2).padStart(9))
  }
})()
