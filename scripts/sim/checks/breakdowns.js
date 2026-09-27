// Scenario checks — 1.8b-2 Character view breakdowns (ui-layout.md → "Breakdowns", core-loop.md → "Breakdowns").
// _recalc() records each Qi/s, Qi cap and breakthrough term as it applies it (s.derived.breakdown); the UI popovers
// only display those parts. This pins that the parts always rebuild the real totals, across stages and with every
// kind of modifier stacked, so an explanation can never drift from the formula. Also: ascensionBreakdown() sums to
// ascensionChance(), btFailPreview() matches a real failed attempt.
// Run: npm run checks (all) · node scripts/sim/checks/breakdowns.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

function rebuild(parts) {
  let v = 0
  for (const p of parts) v = p.op === 'base' ? p.value : p.op === 'x' ? v * p.value : v + p.value
  return v
}
function sumParts(parts) { return parts.reduce((a, p) => a + p.value, 0) }

;(async () => {
  const sim = await createSim({ seed: 3 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get()
  const { ITEMS, TECHNIQUES } = sim.data

  // Stack everything: all techniques, a weapon + an artifact, beasts with all three traits, a sect, karma, catch-up
  s.techniques = TECHNIQUES.map(t => t.id)
  s.equipped.weapon   = Object.keys(ITEMS).find(k => ITEMS[k].type === 'weapon' && ITEMS[k].effect?.type === 'qps_mult') || null
  s.equipped.artifact = Object.keys(ITEMS).find(k => ITEMS[k].type === 'artifact' && ITEMS[k].effect?.type === 'qi_cap_mult') || null
  assert(s.equipped.weapon && s.equipped.artifact, 'test rig: found a Qi/s weapon and a Qi-cap artifact')
  s.beasts = [{ id: 'b1', traits: ['soul_bond', 'qi_devour', 'heavenly_instinct'], level: 3 }]
  s.sect.id = 'azure_sword'
  s.karma = 47

  for (const idx of [0, 4, 11, 16, 20]) {
    s.stageIndex = idx
    gs._recalc()
    const d = s.derived, b = d.breakdown
    assert(near(rebuild(b.qps), d.qiPerSecond), `stage ${idx}: Qi/s parts rebuild ${d.qiPerSecond.toFixed(4)}`)
    assert(near(rebuild(b.cap), d.qiCap), `stage ${idx}: Qi cap parts rebuild ${d.qiCap}`)
    const bt = Math.min(0.98, Math.max(b.btFloor, rebuild(b.bt)))
    assert(near(bt, d.breakthroughChance), `stage ${idx}: BT parts rebuild ${(d.breakthroughChance * 100).toFixed(2)}% (cap/floor applied)`)
    assert(near(rebuild(b.bt), b.btRaw), `stage ${idx}: BT raw sum matches`)
  }

  // Catch-up: below the clan's best stage the ×2.5 and +10% show up as named parts
  const clan = gs._playerClan()
  if (clan) {
    s.stageIndex = 4; clan.bestStageIndex = 12; gs._recalc()
    const b = s.derived.breakdown
    assert(b.qps.some(p => p.label === 'Ancestral catch-up') && b.bt.some(p => p.label === 'Ancestral catch-up'), 'catch-up is named in both Qi/s and BT breakdowns')
    assert(s.derived.catchUpUntil === 12, 'derived.catchUpUntil = clan best stage')
    assert(near(rebuild(b.qps), s.derived.qiPerSecond), 'catch-up: Qi/s parts still rebuild')
    clan.bestStageIndex = 0; gs._recalc()
  } else console.log('ok   (no clan on this boot — catch-up part skipped)')

  // Ascension Trial parts
  s.bloodlineQuality = 37; s.realmIntegrity = 100; s.health = 80
  const ab = gs.ascensionBreakdown()
  assert(near(Math.min(ab.cap, sumParts(ab.parts)), gs.ascensionChance()), 'Ascension parts sum to ascensionChance()')
  assert(ab.parts.find(p => p.label === 'Health at 100').value === 0, 'Ascension: Health below 100 contributes 0 (shown as missed)')

  // Failure preview vs. a real failure
  s.stageIndex = 5; s.techniques = []; s.equipped.weapon = null; s.equipped.artifact = null; s.beasts = []
  s.activePill = null; s.playMode = 'idle'; s.realmIntegrity = 70; s.karma = 20
  gs._recalc(); s.qi = s.derived.qiCap
  const pv = gs.btFailPreview()
  const qi0 = s.qi
  const M = sim.ctx.Math, origRandom = M.random; M.random = () => 0.99999
  let res; try { res = gs.attemptBreakthrough() } finally { M.random = origRandom }
  if (res.reason === 'failed') {
    assert(near(1 - s.qi / qi0, pv.qiLossFrac), `fail preview: Qi loss ${Math.round(pv.qiLossFrac * 100)}% matches`)
    assert(s.realmIntegrity === pv.integrityAfter, `fail preview: Integrity 70 → ${pv.integrityAfter} matches`)
    assert(s.karma === 20 - pv.karmaLoss, 'fail preview: karma loss matches')
  } else assert(false, `forced failure did not fail (${res.reason})`)
  s.realmIntegrity = 15; s.stageIndex = 5
  assert(gs.btFailPreview().demotes === true, 'fail preview: Integrity 15 → warns of demotion')

  const vi = gs.vitalsInfo()
  assert(vi.health.regenSeconds > 0 && vi.integrity.regenSeconds > 0, 'vitalsInfo: regen rates present')
})()
