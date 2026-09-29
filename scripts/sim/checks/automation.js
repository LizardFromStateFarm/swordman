// Scenario checks — automation.md (Phase 22 + 2026-09-29 follow-ups): Auto-Missions keeps your *picked* missions running
// (at most one per slot; [] = re-take whatever finished), changing picks mid-mission swaps what runs next without cutting
// the running one short; per-beast Auto-Expedition opens at BEAST_AUTO_EXPEDITION_LEVEL, relaunches on return to the
// picked place (or its last trip), a pick changed while it is out applies on return; Auto-Explore's queued next location
// swaps in when the run returns; everything rests in Active Mode; old saves migrate.
// Run: npm run checks · node scripts/sim/checks/automation.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 3 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const MAX = sim.ev('SECT_MAX_MISSIONS'), LV = sim.ev('BEAST_AUTO_EXPEDITION_LEVEL')
  const MISSIONS = sim.data.SECT_MISSIONS || sim.ev('SECT_MISSIONS'), LOCS = sim.data.LOCATIONS || sim.ev('LOCATIONS')
  s.stageIndex = 16; s.playMode = 'idle'
  const joined = gs.joinSect(sim.ev('SECTS').find(d => d.minStage <= 16).id)
  assert(joined.ok, 'joined a sect')
  s.sect.rank = 3
  const open = MISSIONS.filter(m => m.minRank <= 3)
  assert(open.length >= 3, `${open.length} missions open at Elder (need 3 to test swapping)`)
  const [A, B, C] = open

  // ── Auto-Missions: picks ─────────────────────────────────────────────────────
  assert(gs.setAutomation('autoSectMissions', true).ok, 'Auto-Missions unlocks at Elder')
  assert(s.automation.autoSectMissionIds.length === 0, 'no picks by default (re-take whatever finished)')
  assert(gs.setAutoSectMission(A.id, true).ok && gs.setAutoSectMission(B.id, true).ok, 'pick two missions')
  assert(s.sect.activeMissions.length === 2 && [A.id, B.id].every(id => s.sect.activeMissions.some(a => a.missionId === id)), 'picking fills the free slots at once')
  assert(gs.setAutoSectMission(C.id, true).reason === 'full', `a third pick is refused (max ${MAX})`)
  // swap B → C while both run: nothing is cancelled, C starts when B's slot frees
  gs.setAutoSectMission(B.id, false); gs.setAutoSectMission(C.id, true)
  assert(s.sect.activeMissions.some(a => a.missionId === B.id), 'unpicking B does not cancel the running B')
  const bUid = s.sect.activeMissions.find(a => a.missionId === B.id).uid
  gs.resolveSectMission(bUid)
  assert(s.sect.activeMissions.some(a => a.missionId === C.id) && !s.sect.activeMissions.some(a => a.missionId === B.id), 'when B returns, the picked C takes its slot')
  // A returns → A again (still picked, slot free)
  gs.resolveSectMission(s.sect.activeMissions.find(a => a.missionId === A.id).uid)
  assert(s.sect.activeMissions.some(a => a.missionId === A.id), 'a picked mission re-takes itself on return')
  // no picks → legacy: re-take whatever finished
  gs.setAutoSectMission(A.id, false); gs.setAutoSectMission(C.id, false)
  gs.resolveSectMission(s.sect.activeMissions.find(a => a.missionId === C.id).uid)
  assert(s.sect.activeMissions.some(a => a.missionId === C.id), 'with no picks, the finished mission re-queues (old behaviour)')
  // Active Mode rests
  s.sect.activeMissions = []; gs.setAutoSectMission(A.id, true); s.sect.activeMissions = []
  s.playMode = 'active'; gs._tickAutomation(10)
  assert(s.sect.activeMissions.length === 0, 'Active Mode: picks do not fire')
  s.playMode = 'idle'; gs._tickAutomation(10)
  assert(s.sect.activeMissions.some(a => a.missionId === A.id), 'back in Idle: the tick fills the free slot with the pick')

  // ── Beast Auto-Expedition ────────────────────────────────────────────────────
  const [L1, L2] = LOCS.filter(l => l.minStage <= 16)
  s.beasts = [{ id: 'bx1', typeId: sim.ev('BEAST_TYPES')[0].id, name: 'Test Fox', level: LV - 1, xp: 0, traits: [], expedition: null }]
  gs._ensurePhase22Fields()
  const bx = s.beasts[0]
  assert(bx.autoExp === false && bx.autoExpLocId === null, 'old-save beast migrates (autoExp off)')
  assert(gs.setBeastAuto('bx1', true).reason === 'locked', `below Lv.${LV}: Auto-Expedition is locked`)
  bx.level = LV
  assert(gs.setBeastAuto('bx1', true).ok, `Lv.${LV}: Auto-Expedition turns on`)
  assert(!bx.expedition, 'no trip yet and no pick: it waits (nowhere to go)')
  gs.sendBeastExpedition('bx1', L1.id)
  assert(bx.lastExpLocId === L1.id, 'a trip records its last location')
  gs.resolveBeastExpedition('bx1')
  assert(bx.expedition?.locationId === L1.id, 'on return it sets out again for its last trip')
  gs.setBeastAutoLocation('bx1', L2.id)
  assert(bx.expedition.locationId === L1.id, 'changing the pick mid-trip does not cut the trip short')
  gs.resolveBeastExpedition('bx1')
  assert(bx.expedition?.locationId === L2.id, 'on return it swaps to the new pick')
  s.playMode = 'active'; gs.resolveBeastExpedition('bx1')
  assert(!bx.expedition, 'Active Mode: it stays home')
  s.playMode = 'idle'; gs._tickAutomation(10)
  assert(bx.expedition?.locationId === L2.id, 'back in Idle: the tick sends it out')
  gs.setBeastAuto('bx1', false); gs.resolveBeastExpedition('bx1')
  assert(!bx.expedition, 'turned off: it comes home and stays')

  // ── Auto-Explore: the queued next location swaps in on return ───────────────
  s.health = 100
  gs.setAutomation('autoExplore', true)
  gs.startExpedition(L1.id)
  gs.setAutoExploreLocation(L2.id)
  assert(s.expedition.locationId === L1.id, 'queuing a new Auto-Explore target keeps the running expedition')
  s.expedition.endsAt = Date.now() - 1
  gs.resolveExpedition()
  assert(s.expedition.active && s.expedition.locationId === L2.id, 'when it returns, Auto-Explore sets out for the queued location')
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
