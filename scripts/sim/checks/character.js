// Scenario checks — M3 character foundation (docs/systems/character.md).
// Birth origin (+ constitution, heir inheritance), the alignment tiers, the Core Formation Dao-path offer
// (locked options, one choice, derived effects), the once-per-life Dao Reversal (success + failure), and the
// Heavenly Tribulation damage. Run: npm run checks (all) · node scripts/sim/checks/character.js.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const force = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unforce = sim => sim.ev('Math.random = globalThis.__r')

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()

  // ── Origin + constitution ──
  const o = gs.originInfo()
  assert(o && o.id && o.region && o.family && o.origin.name, 'a fresh life has a birth origin')
  assert(o.constitution && o.constitution.name, 'the origin carries a constitution')
  const ids = sim.ev('BIRTH_ORIGINS.map(o => o.id)')
  assert(new Set(ids).size === ids.length, 'origin ids are unique')
  assert(sim.ev('BIRTH_ORIGINS.every(o => Object.keys(o.constitutions).length)'), 'every origin has a constitution pool')

  // heir inheritance: the clan remembers its origin
  const inherited = gs._rollOrigin({ originId: 'river_town' })
  assert(inherited.id === 'river_town', 'an heir inherits the clan origin')

  // ── Alignment tiers ──
  s.alignment = 55; assert(gs.alignmentInfo().tier.id === 'righteous', 'alignment 55 reads Righteous')
  s.alignment = -55; assert(gs.alignmentInfo().tier.id === 'demonic', 'alignment -55 reads Demonic')
  s.alignment = 0; assert(gs.alignmentInfo().tier.id === 'neutral', 'alignment 0 reads Neutral')

  // ── The Dao path offer ──
  s.stageIndex = 12; s.daoPath = null; s.pathOffer = null; s.alignment = 0
  assert(gs.chooseDaoPath('neutral').reason === 'stage', 'no path before Core Formation')
  s.stageIndex = 13
  s.pathOffer = { year: 0, at: Date.now() }; s.alignment = 0
  const off = gs.pathOfferInfo()
  assert(off && off.options.length === 3, 'the offer presents all three paths')
  assert(!off.options.find(x => x.id === 'neutral').lock, 'Neutral is open at alignment 0')
  assert(off.options.find(x => x.id === 'virtuous').lock, 'Virtuous is locked below alignment 15')
  assert(off.options.find(x => x.id === 'demonic').lock, 'Demonic is locked above alignment -15')
  assert(gs.chooseDaoPath('virtuous').ok === false, 'a locked path cannot be chosen')
  const r = gs.chooseDaoPath('neutral')
  assert(r.ok && s.daoPath === 'neutral' && s.pathOffer === null, 'choosing sets the path and clears the offer')
  assert(gs.chooseDaoPath('demonic').reason === 'already', 'the path is chosen once')

  // derived effects: Neutral is +5% Qi/s over Basic
  s.stageIndex = 13; s.awakened = true; s.daoPath = null; gs._recalc(); const baseQps = gs.get().derived.qiPerSecond
  s.daoPath = 'neutral'; gs._recalc(); const neuQps = gs.get().derived.qiPerSecond
  assert(neuQps > baseQps * 1.03 && neuQps < baseQps * 1.07, `Neutral raises Qi/s ~5% (${baseQps.toFixed(3)} → ${neuQps.toFixed(3)})`)

  // ── Dao Reversal: once per life, success then refusal ──
  s.stageIndex = 13; s.daoPath = 'neutral'; s.daoReversalUsed = false; s.alignment = 20; s.health = 100
  force(sim, 0.01)   // force success
  const rv = gs.revertDaoPath('virtuous')
  unforce(sim)
  assert(rv.ok && s.daoPath === 'virtuous' && s.daoReversalUsed === true && s.daoSealed === true, 'a successful reversal switches the path, seals the old arts, spends the once')
  assert(gs.revertDaoPath('neutral').reason === 'once', 'a reversal is once per life')

  // failure maims but does not kill, keeps the path, spends the once
  s.daoPath = 'neutral'; s.daoReversalUsed = false; s.alignment = 0; s.health = 100; gs._recalc()
  force(sim, 0.999)
  const rf = gs.revertDaoPath('demonic')   // locked at align 0 → refused before the roll
  unforce(sim)
  assert(rf.ok === false && rf.reason === 'alignment', 'a reversal still respects the target path lock')
  s.alignment = -30   // now demonic is open
  force(sim, 0.999)
  const rf2 = gs.revertDaoPath('demonic')
  unforce(sim)
  assert(rf2.ok === false && rf2.reason === 'failed' && s.daoPath === 'neutral' && s.daoReversalUsed === true, 'a failed reversal keeps the path and spends the once')
  assert(s.health > 0 && s.health < 100, 'a failed reversal costs Health but never kills')

  // ── Tribulation ──
  const sim2 = await createSim({ seed: 2 }); await sim2.boot(0); const s2 = sim2.gs.get()
  s2.stageIndex = 13; s2.health = 100; s2.daoPath = null; s2.pathOffer = null; s2.daoPath = null
  const before = s2.health
  sim2.gs._crossRealmM3('Foundation Building', 'Core Formation')
  assert(s2.health < before && s2.health >= 1, `a tribulation damages Health (${before} → ${s2.health})`)
  assert((s2.tribulations || 0) === 1, 'the tribulation is counted')
  assert(!!s2.pathOffer, 'reaching Core Formation sets the Dao-path offer')

  // ── Migration: an old save gains the fields ──
  const sim3 = await createSim({ seed: 3 }); await sim3.boot(0); const s3 = sim3.gs.get()
  delete s3.origin; delete s3.alignment; delete s3.daoPath; delete s3.pathOffer; delete s3.daoReversalUsed; delete s3.tribulations
  sim3.gs._ensurePhase12Fields()
  assert(s3.origin && s3.origin.id, 'migration fills a birth origin')
  assert(s3.alignment === 0 && s3.daoPath === null && s3.pathOffer === null && s3.daoReversalUsed === false && s3.tribulations === 0, 'migration fills alignment / path / tribulation defaults')
})()
