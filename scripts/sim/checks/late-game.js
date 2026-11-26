// Scenario checks — Phase 51 "The Long Climb" (docs/systems/core-loop.md).
// Pins the smoothed Qi curve (no stage balloons) and the late-realm content coverage (every stage 16–21
// hands out an art; techniques exist past stage 10; a stage-21 expedition exists; drops are real items).
// Run: npm run checks (all) · node scripts/sim/checks/late-game.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 })
  const stages = sim.data.CULTIVATION_STAGES
  const arts = sim.data.ARTS_LIST
  const techs = sim.data.TECHNIQUES
  const locs = sim.data.LOCATIONS
  const items = sim.data.ITEMS
  const rings = sim.ev('ARENA_RINGS')

  // ── Qi curve: the cap : baseQps ratio is monotonic and capped (1.5× within a realm, 2× across) ──
  const ratios = stages.map(s => s.qiCap === Infinity ? null : s.qiCap / s.baseQps)
  const realms = [...new Set(stages.filter((s, i) => i >= 10).map(s => s.realm))]
  for (const realm of realms) {
    const idx = stages.map((s, i) => ({ s, i })).filter(x => x.s.realm === realm && x.s.qiCap !== Infinity).map(x => x.i)
    for (let k = 1; k < idx.length; k++) {
      const a = ratios[idx[k - 1]], b = ratios[idx[k]]
      assert(b >= a - 1e-6, `${stages[idx[k]].id}: fill time does not shrink (${Math.round(a)}s → ${Math.round(b)}s)`)
      assert(b / a <= 1.5005, `${stages[idx[k]].id}: within-realm growth ≤1.5× (${(b / a).toFixed(3)}×)`)
    }
  }
  const firstOfRealm = realms.map(r => stages.findIndex(s => s.realm === r && s.qiCap !== Infinity)).filter(i => i >= 10)
  for (let k = 1; k < firstOfRealm.length; k++) {
    const a = ratios[firstOfRealm[k] - 1], b = ratios[firstOfRealm[k]]
    assert(b / a <= 2.0005, `${stages[firstOfRealm[k]].realm}: realm-boundary growth ≤2× (${(b / a).toFixed(3)}×)`)
  }
  assert(Math.max(...ratios.filter(Boolean)) / 3600 <= 130, `the slowest stage is ≤ ~130 h raw (is ${(Math.max(...ratios.filter(Boolean)) / 3600).toFixed(0)} h)`)

  // ── Late content: every stage 16–21 has an art; techniques past 10; a stage-21 expedition ──
  for (let st = 16; st <= 21; st++) {
    assert(arts.some(a => a.minStage === st), `stage ${st} has at least one art`)
  }
  assert(Math.max(...techs.map(t => t.minStage)) >= 20, 'techniques exist past stage 10 (up to 20+)')
  assert(locs.some(l => l.minStage >= 21), 'a stage-21 expedition location exists')
  assert(Math.max(...locs.map(l => l.minStage)) >= 21, 'the expedition ladders past stage 19')
  assert(Math.max(...rings.map(r => r.champ)) >= 21, 'the Arena still has a stage-21 champion')

  // ── Data integrity for the new content ──
  const artIds = arts.map(a => a.id), techIds = techs.map(t => t.id)
  assert(new Set(artIds).size === artIds.length, 'art ids are unique')
  assert(new Set(techIds).size === techIds.length, 'technique ids are unique')
  for (const l of locs) {
    for (const d of l.dropTable) assert(!!items[d.itemId], `${l.id} drops a real item (${d.itemId})`)
  }
  for (const a of arts) {
    assert(a.kind === 'move' || a.kind === 'passive', `${a.id}: a valid kind`)
    if (a.kind === 'move') assert(a.move && a.move.type && a.move.cost >= 0, `${a.id}: a valid move`)
    else assert(a.passive && a.passive.stat, `${a.id}: a valid passive`)
  }
  assert(arts.filter(a => a.minStage >= 18).every(a => a.name && a.lore), 'the late arts are authored (name + lore)')
})()
