// Scenario checks — soul-points.md (Phase 40a): the cross-save Soul record. A failed Ascension Trial grants
// 20 + 0.5/% of the shown odds exactly once; the record lives outside every slot save (survives slot delete + reload,
// shared by a second slot); Soul Resonance ranks cost 25 × 1.35^rank, one per call, capped at 20, and show up as a
// "Soul Resonance" term in the Qi/s breakdown; the first Immortality pays the v1 grant once, later ones pay less;
// dev preset lives never write the soul file; a corrupt file loads as a blank record.
// Run: npm run checks (all) · node scripts/sim/checks/soul.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const near = (a, b) => Math.abs(a - b) < 1e-9

// Put the live life at the last mortal stage with a full Qi bar and the full bloodline, ready for the Trial.
function readyTrial(sim) {
  const gs = sim.gs, s = gs.get(), N = sim.data.CULTIVATION_STAGES.length
  s.stageIndex = N - 2; s.maxStageThisLife = s.stageIndex
  s.bloodlineQuality = sim.data.ASCENSION_MIN_BLOODLINE   // Phase 47: the Trial is gated on the full bloodline
  gs._recalc(); s.qi = s.derived.qiCap; gs._recalc()
}

;(async () => {
  const sim = await createSim({ seed: 3 }); await sim.boot(0); const gs = sim.gs
  const C = sim.ev('({ SOUL_FAIL_BASE, SOUL_FAIL_PER_PCT, SOUL_V1_GRANT, SOUL_IMMORTAL_GRANT, SOUL_RESONANCE_QPS, SOUL_RESONANCE_MAX, SOUL_RANK_BASE, SOUL_RANK_GROWTH })')

  let so = gs.getSoul()
  assert(so.points === 0 && so.earned === 0 && so.resonance === 0 && !so.v1Finished, 'fresh install: blank soul record')
  assert(!('soul' in gs.get()) && !JSON.stringify(gs.get()).includes('failedAscensions'), 'soul state is not in the slot save')

  // ── Phase 47 (1.21): the Ascension Trial requires Bloodline Quality 100 ──
  {
    readyTrial(sim)
    const s = gs.get(), need = sim.data.ASCENSION_MIN_BLOODLINE
    assert(need === sim.data.BLOODLINE_CAP, `the Trial requires the full bloodline (BQ ${need})`)
    s.bloodlineQuality = need - 1; gs._recalc()
    const denied = gs.attemptAscension()
    assert(!denied.success && denied.reason === 'bloodline_too_low' && denied.need === need,
      `below the full bloodline the Trial is refused (${denied.reason})`)
    assert(!gs.get().interlude && gs.get().stats.ascensionAttempts === 0, 'a refused Trial neither ends the life nor counts as an attempt')
    const ab = gs.ascensionBreakdown()
    assert(ab.req && ab.req.need === need && !ab.req.met && ab.req.have === need - 1, 'ascensionBreakdown reports the unmet requirement')
    s.bloodlineQuality = need; gs._recalc()
    assert(gs.ascensionBreakdown().req.met, 'at the full bloodline the requirement is met')
  }
  await gs.initSlot(0)   // a clean slot for the failed-Trial section below

  // ── A failed Trial ──
  readyTrial(sim)
  const chance = gs.ascensionChance()
  sim.ctx.Math.random = () => 0.999999   // the roll fails
  const res = gs.attemptAscension()
  const want = Math.round(C.SOUL_FAIL_BASE + C.SOUL_FAIL_PER_PCT * Math.round(chance * 100))
  so = gs.getSoul()
  assert(!res.success && res.soul?.pts === want, `failed Trial at ${Math.round(chance * 100)}% grants ${want} (got ${res.soul?.pts})`)
  assert(so.points === want && so.earned === want && so.failedAscensions === 1, 'points, lifetime and failure count recorded')
  assert(res.soul.first === true && so.seen === false, 'first points ever: flagged first, discovery dot on (seen=false)')
  assert(gs.get().lastReincarnation?.soul?.pts === want && gs.get().lastReincarnation.cause === 'ascension_failed', 'death card summary carries the grant')
  assert(so.log[0]?.kind === 'fail' && near(so.log[0].chance, chance) && /clan|orphan/.test(so.log[0].who), 'log names who failed and at what odds')
  // No double grant: the dead life is in an interlude, another attempt is refused, a tick changes nothing
  const again = gs.attemptAscension()
  assert(!again.success && gs.getSoul().points === want, 'no second grant for the same Trial (interlude refuses)')

  // Scaling: better odds pay more
  const p10 = Math.round(C.SOUL_FAIL_BASE + C.SOUL_FAIL_PER_PCT * 10), p90 = Math.round(C.SOUL_FAIL_BASE + C.SOUL_FAIL_PER_PCT * 90)
  assert(p90 > p10 && p10 >= C.SOUL_FAIL_BASE, `a well-prepared failure pays more (${p10} at 10% vs ${p90} at 90%)`)

  // ── Survives slot delete + reload, shared across slots ──
  await gs.initSlot(0)
  delete sim.saves[0]
  await gs.initSlot(1)
  assert(gs.getSoul().points === want, 'record survives deleting the slot and is shared by another slot')

  // ── Resonance ──
  assert(gs.soulRankCost(0) === C.SOUL_RANK_BASE && gs.soulRankCost(3) === Math.round(C.SOUL_RANK_BASE * Math.pow(C.SOUL_RANK_GROWTH, 3)), 'rank cost = 25 × 1.35^rank')
  const q0 = gs.get().derived.qiPerSecond
  const sp = gs.spendSoul()
  so = gs.getSoul()
  assert(sp.ok && sp.rank === 1 && so.points === want - C.SOUL_RANK_BASE && so.resonance === 1, 'spendSoul buys exactly one rank')
  assert(so.earned === want, 'spending never lowers the lifetime total')
  const q1 = gs.get().derived.qiPerSecond
  assert(near(q1 / q0, 1 + C.SOUL_RESONANCE_QPS), `Qi/s ×${1 + C.SOUL_RESONANCE_QPS} after rank 1`)
  const part = gs.get().derived.breakdown.qps.find(p => /^Soul Resonance/.test(p.label))
  assert(part && part.op === 'x' && near(part.value, 1 + C.SOUL_RESONANCE_QPS) && /rank 1/.test(part.label), 'Qi/s breakdown names "Soul Resonance (rank 1)"')
  // Not enough points
  const poor = gs.spendSoul()
  assert(!poor.ok && poor.reason === 'points' && poor.need > 0 && gs.getSoul().resonance === 1, 'short of points: refused with how many more are needed')
  // Cap
  gs._soul.points = 1e9
  while (gs.spendSoul().ok) {}
  so = gs.getSoul()
  assert(so.resonance === C.SOUL_RESONANCE_MAX && gs.spendSoul().reason === 'max', `capped at rank ${C.SOUL_RESONANCE_MAX}`)
  assert(gs.soulInfo().max && gs.soulInfo().cost === null, 'soulInfo reports fully resonant')
  // Persisted: reload from the stored file
  await gs.initSlot(1)
  assert(gs.getSoul().resonance === C.SOUL_RESONANCE_MAX, 'ranks persist through a reload')

  // ── Immortality: the v1 grant fires once ──
  const sim2 = await createSim({ seed: 5 }); await sim2.boot(0); const g2 = sim2.gs
  readyTrial(sim2); sim2.ctx.Math.random = () => 0
  const win = g2.attemptAscension()
  assert(win.success && win.soul?.kind === 'v1' && win.soul.pts === C.SOUL_V1_GRANT, `first Immortality: v1 grant +${C.SOUL_V1_GRANT}`)
  const v1 = g2.getSoul().v1Finished
  assert(v1 && v1.generation >= 1 && g2.getSoul().immortals === 1, 'v1Finished recorded with the Immortal')
  // Next life: skip the interlude straight into a new ready life
  g2._s = g2._newGame(g2.get().world); g2._recalc()
  readyTrial(sim2)
  const win2 = g2.attemptAscension()
  assert(win2.success && win2.soul?.kind === 'immortal' && win2.soul.pts === C.SOUL_IMMORTAL_GRANT, `later Immortality: +${C.SOUL_IMMORTAL_GRANT}, not the v1 grant`)
  assert(g2.getSoul().v1Finished.at === v1.at && g2.getSoul().earned === C.SOUL_V1_GRANT + C.SOUL_IMMORTAL_GRANT, 'v1Finished unchanged, lifetime adds up')

  // ── Dev preset lives never write the soul file ──
  const sim3 = await createSim({ seed: 7 }); await sim3.boot(0); const g3 = sim3.gs
  g3.get().devSave = true
  readyTrial(sim3); sim3.ctx.Math.random = () => 0.999999
  g3.attemptAscension()
  assert(g3.getSoul().points > 0 && !sim3.saves.soul, 'dev life: grant kept in memory, soul file not written')
  assert(g3.get().devSave === true, 'the dev flag carries into the next life')

  // ── Corrupt / hand-edited file ──
  const sim4 = await createSim({ seed: 9 })
  sim4.saves.soul = JSON.stringify({ points: -50, earned: 'x', resonance: 999, log: 'nope' })
  await sim4.boot(0)
  so = sim4.gs.getSoul()
  assert(so.points === 0 && so.earned === 0 && so.resonance === C.SOUL_RESONANCE_MAX && Array.isArray(so.log), 'corrupt record is clamped (points ≥ 0, rank ≤ max)')

  // ── Phase 47 (1.21): the bloodline climbs to the cap over many lives, in shrinking steps ──
  // End a full-stage life at a time (orphan rebirth, so only the stage term counts) and watch BQ approach 100.
  {
    const sim5 = await createSim({ seed: 13 }); await sim5.boot(0); const g5 = sim5.gs
    const N = sim5.data.CULTIVATION_STAGES.length, cap = sim5.data.BLOODLINE_CAP
    const gains = []
    let last = g5.get().bloodlineQuality || 0
    for (let i = 0; i < 40 && (g5.get().bloodlineQuality || 0) < cap; i++) {
      const s = g5.get()
      s.stageIndex = N - 2; s.maxStageThisLife = s.stageIndex
      g5.passTheMantle()
      if (g5.get().interlude) g5.finishInterlude('orphan')
      const now = g5.get().bloodlineQuality || 0
      gains.push(+(now - last).toFixed(3)); last = now
    }
    assert(last >= cap, `the bloodline reaches the cap within 40 full lives (${gains.length} lives)`)
    assert(gains.length >= 8, `reaching the cap takes many reincarnations, not a handful (${gains.length} lives)`)
    assert(gains[0] > gains[gains.length - 1], `each life adds less as the bloodline thickens (${gains[0]} → ${gains[gains.length - 1]})`)
  }
})()
