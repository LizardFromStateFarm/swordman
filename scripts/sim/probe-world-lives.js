// Tuning probe (not a check): runs the Phase 28 light world sim (4.3) for N game years on a fresh slot and prints the
// living count by realm band, deaths by cause (old age must stay < 25%), births/marriages/ascensions, how the player's
// class fares, and the save size. 4.6: the realm bands against the replacement controller's targets (NPC_WORLD) +
// waves / wanderers / hidden masters, and each band's mean over the run (the ±15% goal). Every 120 years it seeds a new class (a stand-in for a new life).
// living-world.md §6, §12. Run: node scripts/sim/probe-world-lives.js [years=600] [seed=1]
const { createSim } = require('./loader.js')
;(async () => {
  const years = +(process.argv[2] || 600), seed = +(process.argv[3] || 1)
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs
  const s = gs.get(), w = s.world, ST = sim.ev('CULTIVATION_STAGES'), Persons = sim.ev('Persons')
  const y0 = Math.floor(w.year)
  const band = p => ST[p.stageIndex || 0].realm
  const report = y => {
    const live = Object.values(w.persons).filter(p => p.alive !== false)
    const by = {}
    for (const p of live) by[band(p)] = (by[band(p)] || 0) + 1
    const d = w.lifeStats?.deaths || {}, tot = Object.values(d).reduce((a, b) => a + b, 0)
    const sz = gs.worldSizeInfo()
    console.log(`year +${y - y0}: living ${live.length} / ${sz.persons} · ` + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') +
      ` · slot ${Math.round(sz.slotBytes / 1024)} KB`)
    console.log(`   deaths ${tot}: ` + Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${Math.round(v / tot * 100)}%)`).join(', ') +
      `
   bands ` + gs.worldBandsInfo().map(b => `${b.short} ${b.count}/${b.target}${b.state === 'ok' ? '' : ' ' + b.state}`).join(' · ') +
      ` · waves ${w.lifeStats?.waves || 0} (${w.lifeStats?.awakened || 0}) · wanderers ${w.lifeStats?.wanderers || 0} · hidden ${w.lifeStats?.hidden || 0} (seized ${w.lifeStats?.seized || 0}, founded ${w.lifeStats?.founded || 0}) · chron ${(w.chron || []).length}` +
      ` · births ${w.lifeStats?.births || 0} · weddings ${w.lifeStats?.marriages || 0} · ascended ${w.lifeStats?.ascended || 0}`)
  }
  const sums = {}; let samples = 0
  const t0 = Date.now()
  for (let y = y0 + 1; y <= y0 + years; y++) {
    w.year = y + 0.01; s.age = (s.age || 16) + 1
    gs._tickWorldSects(); gs._tickWorldLives()
    if ((y - y0) % 120 === 0) {   // a new "life": the old class lives on, a new one awakens
      w.pastLives.push({ personId: 'probe' + y, cause: 'probe', year: y }); s.age = 16; gs._seedCohort()
    }
    if (y - y0 > 100) { samples++; for (const b of gs.worldBandsInfo()) sums[b.id] = (sums[b.id] || 0) + b.count }
    if ((y - y0) % 150 === 0) report(y)
  }
  const ms = Date.now() - t0
  console.log('band means (after year 100): ' + gs.worldBandsInfo().map(b => { const m = sums[b.id] / samples; return `${b.short} ${m.toFixed(1)}/${b.target} (${Math.round((m / b.target - 1) * 100)}%)` }).join(' · '))
  console.log(`${years} years in ${ms} ms (${(ms / years).toFixed(2)} ms/year)`)
  for (const [life, c] of Object.entries(w.cohorts || {})) {
    const m = c.ids.map(id => w.persons[id]).filter(Boolean), alive = m.filter(p => p.alive !== false)
    const top = [...m].sort((a, b) => (b.maxStage || 0) - (a.maxStage || 0))[0]
    console.log(`class ${life}: ${alive.length}/${m.length} living · best ${top ? Persons.fullName(top) + ' ' + ST[top.maxStage || 0].id : '-'} · chosen ${m.filter(p => p.chosen).map(p => ST[p.maxStage || 0].id + (p.alive === false ? '†' : '')).join(' ')}`)
  }
})()
