// Scenario checks — Phase 43d: the joined blessing scales with the sect (docs/systems/npc-sects.md → "43d").
// Pins the rules: factor = base + perLevel·levels + perHall·(hall−1), clamped; k = factor × your rank's share; _recalc
// applies SECTS[].effects scaled by k (multipliers scale their bonus part, the BT floor is capped, on/off stays on);
// a founder never draws a joined blessing (no double-apply); funding a hall of your sect charges, grows it within its
// caps, pays Contribution, warms its stance and raises the blessing (refused without charge at the cap / short / below
// Elder for the Sect Hall); your sect losing a hall is logged with the new blessing and calls a levy (pay → rebuilt,
// refuse → Contribution + stance lost); a lost member war raids your sect; a richer friendly sect courts you (defect
// moves you one rank down and your old sect remembers; locked during a war; leverage reads your sect's regard).
// Run: npm run checks (all) · node scripts/sim/checks/sect-blessing.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e

;(async () => {
  const sim = await createSim({ seed: 434 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const B = sim.ev('SECT_BLESSING'), SECTS = sim.ev('SECTS'), RANKS = sim.ev('SECT_RANKS')
  const factor = r => sim.ev('wsBlessingFactor')(r).factor
  const scale = (fx, k) => sim.ev('sectBlessingEffects')(fx, k)
  const W = () => s.world.sects
  const rec = id => W().list.find(r => r.defId === id)
  const M = sim.ev('Math'), rnd = M.random

  // ── The factor ──
  const az = rec('azure_sword'), hd = rec('heaven_defying')
  const lv = r => Object.values(r.buildings).reduce((a, v) => a + v, 0)
  assert(near(factor(az), Math.round((B.base + B.perLevel * lv(az) + B.perHall * (az.hallLevel - 1)) * 100) / 100), `the factor follows the formula (Azure Sword ×${factor(az)})`)
  assert(factor(hd) === B.max, `the late sect starts at the cap (Heaven Defying ×${factor(hd)})`)
  assert(factor({ buildings: {}, hallLevel: 1 }) === B.min || B.base >= B.min, 'a sect with no halls never drops below the floor')
  assert(['azure_sword', 'myriad_herb'].every(id => factor(rec(id)) < 1), 'the early sects bless less than their full blessing')

  // ── Scaling ──
  const sc = scale({ qps_mult: 1.4, bt_bonus: 0.05, bt_floor: 0.5, hidden_locations: true }, 0.5)
  assert(near(sc.qps_mult, 1.2) && near(sc.bt_bonus, 0.025) && near(sc.bt_floor, 0.25) && sc.hidden_locations === true, 'a ×1.4 at k 0.5 is ×1.2; flat bonuses halve; on/off stays on')
  assert(scale({ bt_floor: 0.5 }, 3).bt_floor === B.btFloorMax, 'a scaled breakthrough floor never passes its cap')
  assert(scale({ herb_mult: 1.5 }, 0).herb_mult === 1, 'a multiplier never drops below ×1')

  // ── Applied in _recalc ──
  s.stageIndex = 16; s.spiritStones = 1e7
  gs.joinSect('thunder_palace')
  const tp = rec('thunder_palace'), bl = gs.sectBlessing()
  assert(bl && near(bl.share, B.rankShare[0]) && near(bl.k, Math.round(factor(tp) * B.rankShare[0] * 100) / 100), `an Outer Disciple draws factor × ${B.rankShare[0]} (k ${bl.k})`)
  const qpsPart = s.derived.breakdown.qps.find(p => /Thunder Palace/.test(p.label))
  assert(qpsPart && near(qpsPart.value, 1 + 0.4 * bl.k), `Qi/s carries the scaled blessing (×${qpsPart?.value.toFixed(3)}) and names it`)
  assert(near(s.derived.lootMult, 1 + 0.15 * bl.k), 'loot carries the scaled blessing')
  s.sect.rank = 5; gs._recalc()
  assert(gs.sectBlessing().k > bl.k && near(gs.sectBlessing().share, B.rankShare[5]), 'a Grand Elder draws more of the same blessing')
  s.sect.rank = 0; gs._recalc()

  // ── Funding a hall ──
  const info = gs.sectBlessingInfo()
  const open = info.halls.find(h => h.id !== 'hall' && h.cost != null)
  const c0 = s.sect.contribution, st0 = tp.stance, k0 = gs.sectBlessing().k, stones0 = s.spiritStones, lvl0 = tp.buildings[open.id] || 0
  const f = gs.fundSectHall(open.id)
  assert(f.ok && s.spiritStones === stones0 - open.cost && tp.buildings[open.id] === lvl0 + 1, `funding the ${open.name} charges ${open.cost} and raises it a level`)
  assert(s.sect.contribution === c0 + open.contrib && tp.stance === st0 + B.fund.stance, 'it pays Contribution and warms the sect')
  assert(gs.sectBlessing().k >= k0 && near(gs.sectBlessing().k, open.after), `the blessing grows as shown (×${k0} → ×${gs.sectBlessing().k})`)
  const capId = open.id; tp.buildings[capId] = tp.maxBuildingLevel
  const s1 = s.spiritStones
  assert(gs.fundSectHall(capId).reason === 'max_level' && s.spiritStones === s1, 'a hall at the sect\'s own cap is refused without charge')
  tp.hallLevel = 1
  assert(gs.fundSectHall('hall').reason === 'rank', 'only an Elder may fund the Sect Hall')
  s.sect.rank = B.fund.hallMinRank
  assert(gs.fundSectHall('hall').ok && tp.hallLevel === 2, 'an Elder funds the Sect Hall')
  s.sect.rank = 0
  const other = gs.sectBlessingInfo().halls.find(h => h.cost != null && h.id !== 'hall')
  s.spiritStones = other.cost - 1
  assert(gs.fundSectHall(other.id).reason === 'stones' && s.spiritStones === other.cost - 1, 'too few stones: refused without charge')
  s.spiritStones = 1e7

  // ── Your sect loses a hall → the levy ──
  W().event = null
  if (!Object.values(tp.buildings).some(v => v > 0) || lv(tp) <= 1) tp.buildings.training_ground = 2
  const lost = gs._wsSetback(tp, 'Fire on the mountain')
  assert(lost && tp.lastLost?.buildingId === lost, 'a lost hall is remembered')
  assert(W().event?.id === 'levy' && W().event.sectId === tp.id && W().event.buildingId === lost, 'your sect calls a levy for it')
  const logTxt = JSON.stringify((s.events || []).slice(0, 4))   // newest first
  assert(/blessing on you thins/.test(logTxt) && /Fire on the mountain/.test(logTxt), 'the log names the cause and the new blessing')
  const lev = gs.worldSectEventInfo()
  assert(lev && lev.choices[0].restore && lev.choices[0].contrib > 0 && lev.choices[2].contrib < 0, 'the levy card shows rebuild + Contribution, and the refusal\'s cost')
  const lvLost = tp.buildings[lost] || 0, cc = s.sect.contribution
  const pay = gs.answerWorldSectEvent(0)
  assert(pay.ok && tp.buildings[lost] === lvLost + 1 && !tp.lastLost && s.sect.contribution === cc + lev.choices[0].contrib, 'paying the levy rebuilds the hall and pays Contribution')
  gs._wsSetback(tp, 'test'); W().event = { id: 'levy', sectId: tp.id, year: Math.floor(s.world.year), buildingId: tp.lastLost.buildingId }
  const cr = s.sect.contribution, str = tp.stance, lvr = lv(tp)
  gs.answerWorldSectEvent(2)
  assert(s.sect.contribution < cr && tp.stance < str && lv(tp) === lvr, 'refusing costs Contribution and stance, and the hall stays down')
  // funding the lost hall directly settles the levy
  const lostId = gs._wsSetback(tp, 'test') || tp.lastLost?.buildingId
  W().event = { id: 'levy', sectId: tp.id, year: Math.floor(s.world.year), buildingId: lostId }
  if (gs._fundCost(tp, lostId) != null) { gs.fundSectHall(lostId); assert(W().event === null && !tp.lastLost, 'funding the lost hall settles the levy') }

  // ── A lost member war raids your sect ──
  W().event = null; tp.buildings.training_ground = 2; tp.buildings.qi_library = 2; tp.lastLost = null
  const foe = W().list.find(r => r.alive && r !== tp && !r.sworn)
  const w = s.sectWar
  Object.assign(w, { phase: 'preparing', enemyId: foe.id, enemyName: foe.name, answered: false })
  const before = lv(tp)
  M.random = () => 0.999; gs._resolveMemberWar(); M.random = rnd
  assert(lv(tp) === before - 1 && tp.lastLost && W().event?.id === 'levy', 'a lost member war raids your sect (a hall falls, the levy comes)')

  // ── A richer sect courts you ──
  const sim2 = await createSim({ seed: 435 }); await sim2.boot(0); const g2 = sim2.gs, m = g2.get()
  m.stageIndex = 16; m.spiritStones = 1e5
  g2.joinSect('azure_sword'); m.sect.rank = 3; m.sect.contribution = 1000; g2._recalc()
  const W2 = m.world.sects, myAz = W2.list.find(r => r.defId === 'azure_sword'), rich = W2.list.find(r => r.defId === 'heaven_defying')
  const courtDef = sim2.ev('WORLD_SECT_EVENTS').find(d => d.id === 'courted')
  rich.stance = 10
  assert(!g2._wsEligible(courtDef, 1).includes(rich), 'a sect that does not like you does not court you')
  rich.stance = 30
  assert(g2._wsEligible(courtDef, 1).includes(rich), 'a richer sect that likes you may court you')
  assert(!g2._wsEligible(courtDef, 1).includes(myAz), 'your own sect never courts you')
  W2.event = { id: 'courted', sectId: rich.id, year: 1 }
  const ci = g2.worldSectEventInfo()
  assert(ci.choices[0].defect && ci.choices[0].defect.rank === RANKS[2].name && ci.choices[0].defect.k > ci.choices[0].defect.nowK, 'the card shows the rank you would hold there and the richer blessing')
  Object.assign(m.sectWar, { side: 'member', phase: 'preparing' })
  assert(g2.worldSectEventInfo().choices[0].lock && g2.answerWorldSectEvent(0).reason === 'war' && m.sect.id === 'azure_sword', 'you cannot go over while your sect is at war')
  m.sectWar.phase = 'none'
  // leverage reads your own sect's regard
  myAz.stance = 100; const hi = g2.worldSectEventInfo().choices[1].odds
  myAz.stance = -100; const lo = g2.worldSectEventInfo().choices[1].odds
  assert(hi > lo, `showing the letter works better when your sect regards you (${Math.round(lo * 100)}% → ${Math.round(hi * 100)}%)`)
  myAz.stance = 25
  const azSt = myAz.stance
  const d = g2.answerWorldSectEvent(0)
  assert(d.ok && m.sect.id === 'heaven_defying' && m.sect.rank === 2 && m.sect.contribution === RANKS[2].minContribution, 'going over: you join them one rank lower')
  assert(myAz.stance === azSt + sim2.ev('SECT_BLESSING').stanceDefected && myAz.deeds.some(x => /went over/.test(x.text)), 'your old sect remembers the turncoat')
  assert(g2.sectBlessing().recId === rich.id, 'the blessing now comes from the new sect')

  // ── A founder never draws a joined blessing ──
  const sim3 = await createSim({ seed: 436 }); await sim3.boot(0); const g3 = sim3.gs, f3 = g3.get()
  f3.stageIndex = 20; f3.ownSect.founded = true; f3.ownSect.name = 'Test Peak'; g3._recalc()
  assert(g3.sectBlessing() === null && f3.derived.sectBlessingK === null && g3.sectBlessingInfo() === null, 'a founder holds no joined blessing (no double-apply)')
})().catch(e => { console.log('FAIL crashed (43d):', e.stack); process.exitCode = 1 })
