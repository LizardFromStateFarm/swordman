// Scenario checks — Phase 43e: the sect master + taking the sect over (docs/systems/npc-sects.md → "43e").
// Pins the rules: joining mints the master (a world person named for the sect's leader, its temper, stage by tier);
// an old save mints lazily; only a Grand Elder may challenge, with NO realm gate; the master's regard is the sect's
// stance and service moves it; their lethal call reads temper + regard; a won fight hands you the sect (halls kept at
// Lv.1, Sect Hall Lv.1, the shelf as your library, seats filled, an old guard pending; the world record ends; s.sect
// clears; the war side is your own; the clan first); a spared master raises a splinter with a grudge; a slain one does
// not; a nonlethal loss demotes you to Elder with a cooldown and a colder regard; a lethal loss kills you; the petition
// (odds read regard + Might; a failure cools regard + a cooldown; success = a peaceful takeover with a smaller old
// guard); the old guard's three fates (win over → a branch at low loyalty, let go → some to the splinter, purge → karma).
// Run: npm run checks (all) · node scripts/sim/checks/sect-takeover.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
// each sim has its own Math (a vm context): force its rolls for the length of fn
const force = (sim, v, fn) => { const M = sim.ev('Math'), r = M.random; M.random = () => v; try { return fn() } finally { M.random = r } }
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

const fresh = async (seed, sectId = 'thunder_palace') => {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = 8; s.spiritStones = 1e6; s.health = 100
  gs.joinSect(sectId)
  return { sim, gs, s }
}

;(async () => {
  // ── The master ──
  let { sim, gs, s } = await fresh(4351)
  const RANKS = sim.ev('SECT_RANKS'), M = sim.ev('SECT_MASTER')
  const rec = gs._wsMine(), p = gs.person(s.sect.masterId)
  assert(p && p.role === 'sect_master' && p.personality === rec.temper, 'joining mints the master, with the sect\'s temper')
  assert(sim.ev('Persons').fullName(p) === rec.leader, 'the master is the sect\'s leader by name')
  assert(p.stageIndex >= M.stageBase + M.stagePerTier * rec.tier && p.stageIndex < sim.ev('CULTIVATION_STAGES').length - 1, `their realm follows the sect's tier (stage ${p.stageIndex})`)
  s.sect.masterId = null
  assert(gs._sectMaster() && s.sect.masterId, 'an old save without a master mints one lazily')

  // ── The gate: Grand Elder only, no realm gate ──
  assert(gs.canChallengeSectMaster().reason === 'rank' && gs.canPetitionSectMaster().reason === 'rank', 'below Grand Elder: no challenge, no petition')
  s.sect.rank = RANKS.length - 1; s.stageIndex = 1
  assert(gs.canChallengeSectMaster().ok, 'a Grand Elder may challenge at any realm (no realm gate)')
  const info = gs.sectMasterInfo()
  assert(info && info.grand && info.challenge.odds >= 0 && info.challenge.lethalPct > 0 && info.petition.odds > 0, 'the card shows the odds, their lethal call and the petition odds')

  // ── Regard: service moves it, and it shades their lethal call ──
  const r0 = rec.stance
  s.sect.activeMissions.push({ uid: 'x1', missionId: 'patrol', endsAt: 0 }); gs.resolveSectMission('x1')
  assert(rec.stance === r0 + M.regardMission, 'a finished mission warms their regard')
  const master = gs._sectMaster()
  rec.stance = 90; const kind = gs._masterLethalPct(master, 90)
  rec.stance = -60; const cruel = gs._masterLethalPct(master, -60)
  assert(cruel > kind, `low regard makes a fight to the death likelier (${kind}% → ${cruel}%)`)
  rec.stance = 30

  // ── Lose (spared): demoted, cooldown, colder ──
  s.stageIndex = 8
  force(sim, 0.999, () => gs.challengeSectMaster())      // 0.999 > any lethal % → until one yields
  assert(s.family.fight?.kind === 'sectmaster' && !s.family.fight.lethal, 'the challenge starts a sectmaster fight')
  const st0 = rec.stance
  playFight(gs, 'lose')
  assert(s.sect.id && s.sect.rank === M.lossRank && rec.stance === st0 + M.lossStance, 'a spared loss demotes you to Elder and cools their regard')
  s.sect.rank = RANKS.length - 1
  assert(gs.canChallengeSectMaster().reason === 'cooldown', 'and you must heal before you try again')
  s.sect.challengeReadyYear = 0

  // ── Win (spare): the sect is yours; the exiled master raises a splinter ──
  s.health = 100
  const shelfArt = Object.keys(sim.ev('ARTS'))[0]
  s.sect.shelf = [{ artId: shelfArt, by: 'x', year: 1 }]
  const halls = Object.entries(rec.buildings).filter(([, v]) => v > 0).map(([k]) => k)
  const recName = rec.name, recId = rec.id, mName = sim.ev('Persons').fullName(master)
  force(sim, 0.999, () => gs.challengeSectMaster())
  playFight(gs, 'win')
  const fin = gs.personFightFinish('raise')
  const o = s.ownSect
  assert(fin.ok && o.founded && o.name === recName && !s.sect.id, 'a won challenge makes the sect yours and clears your membership')
  assert(halls.every(k => o.buildings[k] === 1) && Object.keys(o.buildings).length === halls.length && o.hallLevel === 1, 'every hall it had is kept, at Lv.1, and the Sect Hall is Lv.1')
  assert(o.library.some(x => x.artId === shelfArt), 'the manuals on its shelf are your library')
  assert(o.disciples.length > 0 && o.oldGuard?.n > 0 && o.oldGuard.members.length === o.oldGuard.n, 'disciples kneel at once, and an old guard waits on your word')
  assert(!s.world.sects.list.some(r => r.id === recId), 'its world record ends (you lead it now)')
  assert(s.sectWar.side === 'own' && gs.sectBlessing() === null, 'the war side is your own; no joined blessing remains')
  const sp = s.world.sects.list.find(r => r.origin === 'exiled' && r.leader === mName)
  assert(sp && sp.kind === 'splinter' && sp.stance === (M.exile[master.feud] ?? M.exile.default), `the spared master raises the ${sp?.name} (stance ${sp?.stance})`)
  assert(gs._s.world.persons[master.id]?.role === 'exile', 'the master lives, in exile')

  // ── The old guard: let go → some walk to the exile's splinter ──
  const n = o.oldGuard.n, d0 = sp.disciples
  const og = gs.answerOldGuard('go')
  assert(og.ok && og.kept + og.gone === n && !o.oldGuard, 'letting the old guard go: some stay, the rest leave')
  assert(sp.disciples === d0 + og.gone, 'those who leave join the exiled master')

  // ── Win (finish): no splinter; win over → a branch at low loyalty ──
  ;({ sim, gs, s } = await fresh(4352, 'azure_sword'))
  s.sect.rank = RANKS.length - 1; s.stageIndex = 8
  const born0 = s.world.sects.born
  force(sim, 0.999, () => gs.challengeSectMaster())
  s.family.fight.lethal = true
  playFight(gs, 'win')
  const k0 = s.karma, mid = s.family.fight.oppId
  gs.personFightFinish('finish')
  assert(s.ownSect.founded && s.world.persons[mid].alive === false && s.world.sects.born === born0, 'a slain master leaves no splinter behind')
  const g2 = gs.oldGuardInfo(), cost = g2.choices[0].cost
  const st = s.spiritStones
  const w2 = gs.answerOldGuard('win')
  assert(w2.ok && s.spiritStones === st - cost && w2.branch && w2.branch.loyalty === M.takeover.winOverLoyalty, 'winning the old guard over costs stones and makes them a branch, at low loyalty')

  // ── Purge ──
  ;({ sim, gs, s } = await fresh(4353, 'myriad_herb'))
  s.sect.rank = RANKS.length - 1
  gs._takeOverSect('slain', gs._sectMaster(), null)
  const kp = s.karma
  const pu = gs.answerOldGuard('purge')
  assert(pu.ok && pu.kept === 0 && s.karma === Math.max(0, kp + M.takeover.purgeKarma), 'a purge keeps no one and costs karma')

  // ── Lose (lethal): you die ──
  ;({ sim, gs, s } = await fresh(4354))
  s.sect.rank = RANKS.length - 1
  force(sim, 0, () => gs.challengeSectMaster())     // 0 < any lethal % → to the death
  assert(s.family.fight?.lethal, 'a master may make it a fight to the death')
  const dl = playFight(gs, 'lose')
  assert(dl?.outcome === 'lost_lethal' && (s.health ?? 0) <= 0, 'a lethal loss ends your life')

  // ── The petition ──
  ;({ sim, gs, s } = await fresh(4355))
  s.sect.rank = RANKS.length - 1
  const r5 = gs._wsMine()
  r5.stance = 100; const hiOdds = gs.sectMasterInfo().petition.odds
  r5.stance = 0;   const loOdds = gs.sectMasterInfo().petition.odds
  assert(hiOdds > loOdds, `their regard lifts the petition's odds (${Math.round(loOdds * 100)}% → ${Math.round(hiOdds * 100)}%)`)
  const pf = force(sim, 0.999, () => gs.petitionSectMaster())
  assert(pf.ok && !pf.success && r5.stance === M.petition.failStance && gs.canPetitionSectMaster().reason === 'cooldown', 'a refused petition cools their regard, and you must wait')
  s.sect.petitionReadyYear = 0
  const ps = force(sim, 0, () => gs.petitionSectMaster())
  const T = M.takeover
  assert(ps.success && s.ownSect.founded && s.ownSect.takenOver.how === 'peaceful' && s.ownSect.oldGuard.n <= T.oldGuardPeaceful[1], 'a granted petition: a peaceful takeover, a smaller old guard')
  assert(!s.world.sects.list.some(r => r.origin === 'exiled'), 'a peaceful master raises no splinter')

  // ── Final QA (user 2026-10-04: "it should definitely come back"): a sect you used to own always comes back ──
  const takenDef = s.ownSect.takenOver.defId, W = s.world.sects
  assert(!gs._wsByDef(takenDef) && gs._wsKeepGates().length === 0, 'while it is yours, the gate keeps no other record')
  // (a) the life ends holding it: the lineage record keeps its gate, and the next life joins that very record
  const lrec = gs._wsFromOwnSect(s.ownSect, s.world)
  assert(lrec && lrec.kind === 'lineage' && lrec.defId === takenDef && gs._wsByDef(takenDef) === lrec, 'dying with a taken sect: the lineage record keeps its gate')
  s.ownSect = gs._blankOwnSect(); s.sect = { id: null, rank: 0, contribution: 0, activeMissions: [] }
  assert(gs.joinSect(takenDef).ok && gs._wsMine() === lrec, 'joining its gate later joins the sect you left behind')
  let bi = null, threw = null
  try { bi = gs.sectBlessingInfo() } catch (e) { threw = e.message }
  assert(!threw && bi && bi.halls.length > 0, `its blessing card draws, with halls to fund${threw ? ': ' + threw : ''}`)
  // (b) a save from before the fix: the lineage record lost its gate → the migration hands it back by name
  lrec.defId = null
  gs._ensurePhase46Fields()
  assert(lrec.defId === takenDef && gs._wsMine() === lrec, 'migration: a lineage record that lost its gate gets it back')
  assert(gs._wsKeepGates().length === 0, 'keeping the gates is idempotent')
  // (c) no record at all (lost before the fix): the gate raises a fresh one, with no Math.random
  lrec.alive = false; W.list = W.list.filter(r => r.alive)
  const M2 = sim.ev('Math'), rnd0 = M2.random; let draws = 0; M2.random = () => { draws++; return rnd0() }
  const back = gs._wsKeepGates(); M2.random = rnd0
  assert(back.length === 1 && back[0].defId === takenDef && back[0].kind === 'joinable' && gs._wsMine() === back[0] && draws === 0, 'a lost gate rises again as a joinable sect (no Math.random)')
  // (d) a burned gate-holder always returns from its ashes, whatever its kind
  const g = gs._wsMine(); g.kind = 'lineage'
  gs.leaveSect()
  W.ashes = [{ name: g.name, defId: g.defId, kind: 'lineage', tier: 1, temper: g.temper, leader: g.leader, maxBuildingLevel: 2, maxHall: 2,
               year: 1, survivors: 0, provoked: false, state: 'smoking', returnYear: 0, rebornId: null }]
  g.alive = false; W.list = W.list.filter(r => r.alive)
  assert(gs.sectInAshes(takenDef) && gs._wsKeepGates().length === 0, 'smoking ashes: the gate waits (no early rebirth)')
  force(sim, 0.999, () => gs._tickAshes(Math.floor(s.world.year)))
  assert(gs._wsByDef(takenDef) && W.ashes[0].state === 'reborn', 'a burned lineage sect that held a gate always rises again')
  // (e) disbanding a sect you took over: its gate opens again without you
  ;({ sim, gs, s } = await fresh(4357))
  s.sect.rank = RANKS.length - 1
  force(sim, 0, () => gs.petitionSectMaster())
  const dDef = s.ownSect.takenOver.defId
  assert(gs.disbandOwnSect().ok && gs._wsByDef(dDef), 'disbanding a taken sect: its gate opens again under a new master')

  // ── Final QA: a death by your hand (a duel, a deed, the road → _killPerson) frees the sect seat at once ──
  ;({ sim, gs, s } = await fresh(4359))
  const ws = s.world.sects.list.find(r => r.alive && r.kind === 'joinable'); gs._wsEnsurePeople(ws)
  const oldM = ws.leaderId, el = (ws.elderIds || [])[0], yrK = Math.floor(s.world.year)
  gs._killPerson(oldM, yrK, 'duel')
  const newM = s.world.persons[ws.leaderId]
  assert(ws.leaderId !== oldM && newM && newM.alive !== false && newM.sectRole === 'master', 'a slain master: the senior elder (or someone new) takes the seat at once')
  const el2 = (ws.elderIds || []).find(id => id !== ws.leaderId) || el
  if (el2 && s.world.persons[el2]?.alive !== false) { gs._killPerson(el2, yrK, 'road'); assert(!(ws.elderIds || []).includes(el2), 'a slain elder leaves the bench') }
})().catch(e => { console.log('FAIL crashed (43e):', e.stack); process.exitCode = 1 })
