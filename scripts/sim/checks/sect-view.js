// Scenario checks — 1.8b-5 Sect views (ui-layout.md → "Sect views", sect-war.md → "sectWarOdds").
// The Sect → War view shows win odds from gameState.sectWarOdds(), and the Disciples/Overview views show what each
// disciple adds from ownSectInfo(). This pins both to the real game rolls/ticks so the UI can't drift from them:
// odds match a Monte Carlo of the real _resolveSectWar/_resolveMemberWar, the odds parts rebuild the multiplier,
// per-disciple yields sum to derived.discipleQiFrac and to what tickOwnSect() actually pays, and the attention items
// point at the new sub-views.
// Run: npm run checks (all) · node scripts/sim/checks/sect-view.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { collectAttention } = require('../../../renderer/game/attention.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

function rebuild(parts) {
  let v = 0
  for (const p of parts) v = p.op === 'base' ? p.value : p.op === 'x' ? v * p.value : v + p.value
  return v
}

// Resolve the same war N times from the same state; the share of victories vs the shown odds.
function montecarlo(gs, resolve, reset, n = 4000) {
  const w = gs.get().sectWar
  let wins = 0
  for (let i = 0; i < n; i++) {
    reset()
    const before = w.warVictories
    resolve()
    if (w.warVictories > before) wins++
  }
  return wins / n
}

;(async () => {
  const sim = await createSim({ seed: 11 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get()

  // ── Own sect ──
  s.stageIndex = 19
  s.ownSect.founded = true; s.ownSect.name = 'Test Peak'; s.ownSect.hallLevel = 2
  s.ownSect.disciples = [
    { id: 'd1', name: 'Li Wei', talent: 3, level: 4, xp: 100 },
    { id: 'd2', name: 'Wang Fang', talent: 5, level: 10, xp: 0 },
    { id: 'd3', name: 'Zhao Lei', talent: 1, level: 1, xp: 0 },
  ]
  gs._recalc()
  const w = s.sectWar
  assert(w.side === 'own', 'founding flips the war state to the own side')

  const ownReset = () => { s.spiritStones = 1e6; s.health = 100; w.phase = 'preparing'; w.enemyName = 'Iron Fang Sect'; w.enemyTier = 2 }
  ownReset()
  let o = gs.sectWarOdds()
  assert(Math.abs(rebuild(o.parts) - o.mult) < 1e-9, `own: odds parts rebuild the multiplier ×${o.mult.toFixed(2)}`)
  let mc = montecarlo(gs, () => gs._resolveSectWar(), ownReset)
  assert(Math.abs(mc - o.chance) < 0.03, `own, bare: shown ${(o.chance * 100).toFixed(1)}% vs rolled ${(mc * 100).toFixed(1)}%`)

  s.ownSect.buildings = { defensive_array: true, qi_library: true, treasury: true }
  w.arrayDamagedUntil = 0
  gs._recalc()
  const withArray = () => { ownReset(); w.reinforced = true; w.allyId = 'thunder_palace'; w.arrayDamagedUntil = 0; gs._recalc() }
  withArray()
  o = gs.sectWarOdds()
  assert(o.parts.length === 4 && Math.abs(rebuild(o.parts) - o.mult) < 1e-9, `own, array + reinforced + ally: parts rebuild ×${o.mult.toFixed(3)}`)
  assert(o.ifReinforced == null && o.ifAllied == null, 'own: no "what if" once reinforced and allied')
  mc = montecarlo(gs, () => gs._resolveSectWar(), withArray)
  assert(Math.abs(mc - o.chance) < 0.03, `own, stacked: shown ${(o.chance * 100).toFixed(1)}% vs rolled ${(mc * 100).toFixed(1)}%`)
  withArray(); w.reinforced = false; w.allyId = null
  o = gs.sectWarOdds()
  assert(o.ifReinforced > o.chance && o.ifAllied > o.chance, 'own: reinforcing / an ally preview better odds')
  assert(o.reinforceCost === gs._warReinforceCost() && o.allyCost === gs._warAllyCost(), 'own: shown costs are the real costs')

  // ownSectInfo: yields add up to the derived Qi fraction and to what a minute of tickOwnSect pays
  gs._recalc()
  const info = gs.ownSectInfo()
  const qiSum = info.disciples.reduce((a, x) => a + x.qi, 0)
  assert(Math.abs(qiSum - s.derived.discipleQiFrac) < 1e-12, `disciple Qi shares sum to derived (+${(qiSum * 100).toFixed(2)}% Qi/s)`)
  assert(info.fame.disciples + info.fame.buildings + info.fame.hall + info.fame.wins === s.derived.sectFame, `fame terms sum to ${s.derived.sectFame}`)
  s.ownSect._incomeAcc = { spirit_stone: 0, spirit_herb: 0 }
  s.ownSect.poolRefreshAt = Date.now() + 1e9
  const stones0 = s.spiritStones, herbs0 = s.inventory.spirit_herb || 0
  const lv = s.ownSect.disciples.map(d => d.level)
  gs.tickOwnSect(60)
  const paid = s.spiritStones - stones0 + s.ownSect._incomeAcc.spirit_stone
  const herbs = (s.inventory.spirit_herb || 0) - herbs0 + s.ownSect._incomeAcc.spirit_herb
  assert(s.ownSect.disciples.every((d, i) => d.level === lv[i]), 'test rig: no disciple levelled during the minute')
  assert(Math.abs(paid - info.totals.stonesMin) < 1e-9, `stones/min shown ${info.totals.stonesMin.toFixed(3)} = paid ${paid.toFixed(3)}`)
  assert(Math.abs(herbs - info.totals.herbsMin) < 1e-9, `herbs/min shown ${info.totals.herbsMin.toFixed(3)} = paid ${herbs.toFixed(3)}`)
  const max = info.disciples.find(x => x.d.id === 'd2')
  assert(max.max && max.eta === 0 && max.xpFrac === 1, 'a max-level disciple shows as fully grown')

  // Attention: an open seat you can afford → Disciples; a building you can afford → Buildings; the war → War
  s.spiritStones = 1e6
  s.ownSect.recruitPool = [{ id: 'c1', name: 'Hu Ming', talent: 2 }]
  w.phase = 'scouting'; w.scoutEndsAt = Date.now() + 60000
  let att = collectAttention(s, gs)
  assert(att.find(i => i.id === 'recruit')?.view === 'sect-disciples', 'attention: open seat leads to Sect → Disciples')
  assert(att.find(i => i.id === 'build')?.view === 'sect-halls', 'attention: affordable building leads to Sect → Buildings')
  assert(att.find(i => i.id === 'own-war')?.view === 'sect-war', 'attention: an attack leads to Sect → War')
  s.ownSect.disciples = s.ownSect.disciples.concat(Array.from({ length: 7 }, (_, i) => ({ id: 'f' + i, name: 'F' + i, talent: 1, level: 1, xp: 0 })))
  gs._recalc()
  att = collectAttention(s, gs)
  assert(!att.find(i => i.id === 'recruit'), `attention: no recruit nudge when all ${s.derived.discipleCap} seats are taken`)

  // ── Member side ──
  const sim2 = await createSim({ seed: 12 }); await sim2.boot(0); const gs2 = sim2.gs
  const m = gs2.get()
  m.stageIndex = 8
  gs2.joinSect('thunder_palace')
  m.sect.rank = 2
  gs2._recalc()
  const mw = m.sectWar
  assert(mw.side === 'member', 'joining flips the war state to the member side')
  mw.phase = 'scouting'; mw.enemyName = 'Black Talon Sect'; mw.enemyTier = 3; mw.scoutEndsAt = Date.now() + 60000
  let mo = gs2.sectWarOdds()
  assert(mo.ifAnswered > mo.chance, `member: answering previews better odds (${(mo.chance * 100).toFixed(1)}% → ${(mo.ifAnswered * 100).toFixed(1)}%)`)
  att = collectAttention(m, gs2)
  assert(att.find(i => i.id === 'war-call')?.view === 'sect-war', 'attention: a call to arms leads to Sect → War')
  m.spiritStones = 1e6
  gs2.answerWarCall(); gs2.donateWarChest(200)
  mo = gs2.sectWarOdds()
  assert(Math.abs(rebuild(mo.parts) - mo.mult) < 1e-9 && Math.abs(mo.mult - gs2.memberWarPower().power) < 1e-9, `member: parts rebuild the war power ×${mo.mult.toFixed(3)}`)
  const chest = mw.chestStones
  const memReset = () => { m.spiritStones = 1e6; m.health = 100; mw.phase = 'preparing'; mw.answered = true; mw.chestStones = chest; mw.pillsGiven = 0; mw.beastId = null; mw.buffSuppressedUntil = 0 }
  mc = montecarlo(gs2, () => gs2._resolveMemberWar(), memReset)
  assert(Math.abs(mc - mo.chance) < 0.03, `member, answered + chest: shown ${(mo.chance * 100).toFixed(1)}% vs rolled ${(mc * 100).toFixed(1)}%`)
  // (The open-mission-slot nudge reads SECT_MAX_MISSIONS, a browser global the Node sandbox does not expose; covered by smoke.)
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
