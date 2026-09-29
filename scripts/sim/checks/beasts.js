// Scenario checks — integrity.md "Spiritual Beasts" (roster of 10, tiers, variants, Might; 2026-09-28): every beast
// type has ink art for itself and its variant; tiers rise with the realm gate and the two dragons are legendary (the
// Golden Dragon the mightiest and rarest); beastProfile (tier, variant name, art, Might); a sighting rolls a variant
// and favored traits; a legendary sighting names itself; taming keeps the variant; Might scales the Qi a beast gives;
// an old save's encounter with no `variant` still works.
// Run: npm run checks (all) · node scripts/sim/checks/beasts.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

;(async () => {
  const sim = await createSim({ seed: 7 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const D = sim.ev('({ T: BEAST_TYPES, TI: BEAST_TIERS, ORD: BEAST_TIER_ORDER, ART: Object.keys(typeof INK_BEASTS !== "undefined" ? INK_BEASTS : {}) })')

  // roster + data
  assert(D.T.length >= 10, `at least 10 beast types (${D.T.length})`)
  assert(D.T.every(t => D.TI[t.tier]), 'every type has a known tier')
  assert(D.T.every(t => (t.variants || []).length >= 1), 'every type has a rare colour variant')
  if (D.ART.length) {
    assert(D.T.every(t => D.ART.includes(t.spriteState)), 'every type has ink art')
    assert(D.T.every(t => t.variants.every(v => D.ART.includes(v.art))), 'every variant has ink art')
  }
  const rank = t => D.ORD.indexOf(t.tier)
  const byGate = [...D.T].sort((a, b) => a.minStage - b.minStage)
  assert(byGate.every((t, i) => !i || rank(t) >= rank(byGate[i - 1])), 'tiers never drop as the realm gate rises')
  const dragons = D.T.filter(t => /dragon/.test(t.id))
  assert(dragons.length === 2 && dragons.every(t => t.tier === 'legendary'), 'both dragons are legendary')
  const gold = D.T.find(t => t.id === 'golden_dragon')
  assert(D.T.every(t => t === gold || (t.encounterChance > gold.encounterChance && t.baseExpPower < gold.baseExpPower)), 'the Golden Dragon is the rarest and strongest')

  // profile + Might
  const pf = gs.beastProfile({ typeId: 'spirit_fox' }), pg = gs.beastProfile({ typeId: 'golden_dragon' })
  const pv = gs.beastProfile({ typeId: 'spirit_fox', variant: 'crimson' })
  assert(pf.might === 1 && pg.might > 2, `Might: fox ${pf.might}, golden dragon ${pg.might}`)
  assert(pv.name === 'Crimson Nine-Tail' && pv.art === 'spirit_fox__crimson' && pv.might > pf.might, 'a variant has its own name, art and a Might edge')
  assert(gs.beastProfile({ typeId: 'nope' }).tier.id === 'common', 'an unknown type falls back safely')

  // sightings: force an encounter every expedition; check variant + favored traits + legendary text
  s.stageIndex = 22; s.maxStageThisLife = 22; gs._recalc()
  const loc = sim.ev('LOCATIONS').filter(l => l.minStage <= 22).sort((a, b) => b.enemyTier - a.enemyTier)[0]
  let variants = 0, legend = 0, favoredHits = 0, n = 0
  for (let i = 0; i < 300; i++) {
    s.beastEncounters = []; s.expedition = { active: true, locationId: loc.id, endsAt: Date.now() }
    gs.resolveExpedition()
    const enc = s.beastEncounters[0]
    if (!enc) continue
    n++
    const t = D.T.find(x => x.id === enc.typeId)
    if (enc.variant) variants++
    if (enc.traits.some(tr => (t.favoredTraits || []).includes(tr))) favoredHits++
    if (t.tier === 'legendary') legend++
  }
  assert(n > 10, `sightings happened (${n} in 300 expeditions)`)
  assert(variants > 0 && variants < n * 0.4, `rare colours roll sometimes (${variants} of ${n})`)
  assert(favoredHits / n > 0.6, `traits lean toward the beast's nature (${favoredHits} of ${n} have a favored trait)`)

  // a legendary sighting names itself in the log
  const events = () => JSON.stringify(gs.get().eventLog || gs.get().log || gs.get().events || [])
  s.beastEncounters = []
  sim.ev('BEAST_TYPES.forEach(t => { t.__c = t.encounterChance; t.encounterChance = t.id === "golden_dragon" ? 1 : 0 })')
  for (let i = 0; i < 80 && !s.beastEncounters.length; i++) { s.expedition = { active: true, locationId: loc.id, endsAt: Date.now() }; gs.resolveExpedition() }
  sim.ev('BEAST_TYPES.forEach(t => { t.encounterChance = t.__c; delete t.__c })')
  assert(s.beastEncounters[0]?.typeId === 'golden_dragon', 'a golden dragon can be sighted at Spirit Severing')
  assert(/legendary beast/.test(events()), 'a legendary sighting gets its own log line')

  // taming keeps the variant; old-save encounters (no variant) still tame
  s.inventory.beast_taming_talisman = 5; s.beasts = []; gs._recalc()
  s.beastEncounters = [{ id: 'v1', typeId: 'qilin', variant: 'crimson', traits: ['soul_bond', 'swift', 'iron_skin'], seenAt: Date.now() },
                       { id: 'o1', typeId: 'thunder_eagle', traits: ['swift', 'iron_skin', 'spirit_nose'], seenAt: Date.now() }]
  rng(sim, 0.1)   // Phase 41: force the tame rolls to succeed (crude 40%)
  const r1 = gs.tameEncounteredBeast('v1'), r2 = gs.tameEncounteredBeast('o1')
  unrng(sim)
  assert(r1.ok && r1.beast.variant === 'crimson' && r1.beast.name === 'Crimson Qilin', 'taming a rare colour keeps it (Crimson Qilin)')
  assert(r2.ok && !r2.beast.variant && r2.beast.name === 'Thunder Eagle', 'an old-save encounter without a variant tames as the plain beast')

  // Might scales what traits give: the same Qi Devour on a fox vs a golden dragon
  const qiFrom = typeId => { s.beasts = [{ id: 'b', typeId, name: 'x', level: 5, xp: 0, traits: ['qi_devour'], expedition: null }]; gs._recalc(); const a = gs.get().derived.qiPerSecond
    s.beasts = []; gs._recalc(); return a - gs.get().derived.qiPerSecond }
  const qf = qiFrom('spirit_fox'), qd = qiFrom('golden_dragon')
  assert(qf > 0 && Math.abs(qd / qf - pg.might) < 0.3, `Qi Devour: fox +${qf.toFixed(2)}/s, golden dragon +${qd.toFixed(2)}/s (×${(qd / qf).toFixed(2)})`)
})()
