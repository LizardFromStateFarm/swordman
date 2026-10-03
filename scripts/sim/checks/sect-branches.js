// Scenario checks — Phase 45 Sect branches (分舵) + the Tournament of Branches (docs/systems/sect-branches.md).
// Pins the rules: appointing a head is free and ungated; a branch's members live in the branch's own seats (the Hall
// cap seats only your own hall); branch output is a share (yield × loyalty); loyalty never decays on its own, only a
// direct wrong drops it, and a wrong that spends the last of it makes the head secede with the branch; the Tournament
// of Branches pays the chosen prize and is a wrong to the branches it overlooks; a grown child joins for free.
// Run: npm run checks (all) · node scripts/sim/checks/sect-branches.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 21 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get()
  const AWAK = sim.ev('AWAKENING_AGE')
  const S = sim.ev('SECT_BRANCH')

  // ── Appoint (free, no gate) ──
  s.stageIndex = 19
  s.ownSect.founded = true; s.ownSect.name = 'Test Peak'; s.ownSect.hallLevel = 2
  s.ownSect.disciples = [
    { id: 'd1', name: 'Li Wei', talent: 4, level: 3, xp: 0 },
    { id: 'd2', name: 'Wang Fang', talent: 2, level: 2, xp: 0 },
    { id: 'd3', name: 'Zhao Lei', talent: 5, level: 5, xp: 0 },
  ]
  gs._recalc()
  assert(gs.appointBranchHead('nope').reason === 'not_found', 'an unknown disciple is refused')
  const b1 = gs.appointBranchHead('d1')
  assert(b1.ok && s.ownSect.branches.length === 1, 'appointing a disciple raises a branch (free, no gate)')
  const head = s.ownSect.disciples.find(x => x.id === 'd1')
  assert(head.role === 'head' && head.branchId === b1.branch.id, 'the appointed disciple leads it')
  assert(gs.appointBranchHead('d1').reason === 'already_head', 'a sitting head cannot be appointed again')
  assert(gs.ownSectInfo().branchCount === 1, 'ownSectInfo reports the branch')

  // ── The Hall cap seats your own hall only; branch members live in the branch ──
  gs._recalc()
  const cap = s.derived.discipleCap
  assert(gs._mainRoster().length === 2, `the branch head no longer counts against the Hall's seats (${gs._mainRoster().length} in your hall)`)
  s.ownSect.disciples.push(...Array.from({ length: cap - 2 }, (_, i) => ({ id: 'm' + i, name: 'M' + i, talent: 1, level: 1, xp: 0 })))
  gs._recalc()
  assert(gs._mainRoster().length === cap, `the Hall fills up with unbranched disciples (${cap})`)
  s.ownSect.recruitPool = [{ id: 'c1', name: 'Hu Ming', talent: 3 }]
  assert(gs.recruitDisciple('c1').reason === 'full', 'the Hall refuses a recruit when its own seats are full, branch or no branch')
  const total0 = s.ownSect.disciples.length
  s.ownSect.disciples.push({ id: 'bm1', name: 'Branch One', talent: 3, level: 1, xp: 0, branchId: b1.branch.id, role: 'disciple', kin: false, personality: 'calm' })
  gs._recalc()
  assert(gs._mainRoster().length === cap && s.ownSect.disciples.length === total0 + 1, 'a branch member lives outside the Hall cap')

  // ── Branch yield is a share; loyalty does not decay on its own ──
  const ymMain = gs._discipleYieldMult(s.ownSect.disciples.find(x => x.id === 'd2'))
  const ymBranch = gs._discipleYieldMult(head)
  assert(ymMain === 1, 'a disciple in your own hall yields in full')
  assert(ymBranch > 0 && ymBranch < 1, `a branch member yields a share (×${ymBranch.toFixed(2)})`)
  assert(b1.branch.loyalty === S.loyaltyStart, 'loyalty starts where the data says')
  for (let i = 0; i < 5; i++) { gs._tickBranches(); gs._recalc() }
  assert(b1.branch.loyalty === S.loyaltyStart, 'loyalty never decays on its own (no relationship maintenance)')

  // ── A direct wrong drops loyalty (promote/poach a member up into your hall) ──
  s.ownSect.disciples = s.ownSect.disciples.filter(d => d.id !== 'm0'); gs._recalc()
  const before = b1.branch.loyalty
  const pr = gs.promoteBranchMember('bm1')
  assert(pr.ok, 'a branch member can be brought up into your own hall')
  assert(b1.branch.loyalty === before - S.wrong.poach, `promotion is a direct wrong (loyalty ${before} → ${b1.branch.loyalty})`)
  assert(!s.ownSect.disciples.find(x => x.id === 'bm1').branchId, 'the promoted member now lives in your hall')

  // ── Secession: dissolving a branch whose head is out of loyalty makes them leave ──
  b1.branch.loyalty = S.secedeAt + 1
  const enemies0 = (s.world.enemies || []).length
  const sc = gs.dismissBranch(b1.branch.id)
  assert(sc.ok && sc.seceded, 'dissolving a branch whose head is out of loyalty makes them secede')
  assert(!s.ownSect.branches.length && !s.ownSect.disciples.find(x => x.id === 'd1'), 'the seceding head and branch are gone from your sect')
  assert((s.world.enemies || []).length > enemies0, 'a seceding head is remembered as an enemy')

  // ── Tournament of Branches ──
  s.ownSect.disciples.push({ id: 'e1', name: 'Qin Bo', talent: 3, level: 3, xp: 0 }, { id: 'e2', name: 'Sun Qi', talent: 2, level: 2, xp: 0 })
  gs._recalc()
  assert(gs.holdBranchTournament('qi').reason === 'no_branches', 'a tournament needs two branches')
  assert(gs.appointBranchHead('e1').ok && gs.appointBranchHead('e2').ok && s.ownSect.branches.length === 2, 'two branches stand for the tournament')
  s.spiritStones = 1e6; s.stats.timePlayed = 0; s.qi = 0; gs._recalc()
  const cost = gs._branchTourneyCost()
  const q0 = s.qi
  const rt = gs.holdBranchTournament('qi')
  assert(rt.ok && rt.winner && s.qi > q0, `the Qi prize infuses the winner's branch (Qi ${q0.toFixed(0)} → ${s.qi.toFixed(0)})`)
  assert(s.spiritStones === 1e6 - cost, `holding the tournament costs ${cost} stones`)
  const winner = s.ownSect.branches.find(x => x.id === rt.winner.id)
  const loser = s.ownSect.branches.find(x => x.id !== rt.winner.id)
  assert(winner.loyalty > S.loyaltyStart && loser.loyalty === S.loyaltyStart + S.tourney.loseLoyalty, 'the winner is honoured, the overlooked branch resents it')
  assert(gs.holdBranchTournament('qi').reason === 'cooldown', 'a tournament cannot be held again at once')
  s.stats.timePlayed = S.tourney.cooldownSecs + 1
  assert(gs.holdBranchTournament('art').ok, 'the art prize hands out a manual')
  s.ownSect.tourneyAt = 0
  const s0 = s.spiritStones
  const rs = gs.holdBranchTournament('stones')
  assert(rs.ok && s.spiritStones > s0, `the stones prize pays out (${s0} → ${s.spiritStones})`)
  s.spiritStones = 0; s.ownSect.tourneyAt = 0
  assert(gs.holdBranchTournament('qi').reason === 'stones', 'a tournament you cannot afford changes nothing')

  // ── Recruiting your children — free and instant ──
  s.ownSect.disciples = []; s.ownSect.branches = []; gs._recalc()
  const kid = { id: 'kid1', given: 'An', family: 'Li', bornYear: s.world.year, root: { type: 'heavenly', name: 'Heavenly Root', mult: 3.0 },
                personality: 'calm', alive: true, estranged: false, bond: 50, morality: 0, stageIndex: 0, parents: [s.self.id] }
  s.family.children = [kid]
  assert(gs.recruitChild('kid1').reason === 'young', `a child below ${AWAK} cannot be taken in yet`)
  kid.bornYear = s.world.year - AWAK
  assert(gs.childRecruitPreview('kid1').ok, 'a grown child can be brought in')
  const stones0 = s.spiritStones
  const rc = gs.recruitChild('kid1')
  assert(rc.ok && s.spiritStones === stones0, 'taking a child in is free (no stones)')
  assert(rc.disciple.talent === 5 && rc.disciple.kin, `a heavenly-root child joins at talent ${rc.disciple.talent} and is marked kin`)
  assert(gs.recruitChild('kid1').reason === 'joined', 'the same child cannot join twice')
  assert(gs.recruitableChildren().length === 0, 'a child already in the sect is no longer recruitable')

  // ── Migration: an old save gains the fields; a vanished head dissolves its branch ──
  const sim2 = await createSim({ seed: 22 }); await sim2.boot(0); const gs2 = sim2.gs, s2 = gs2.get()
  s2.ownSect.founded = true
  s2.ownSect.disciples = [{ id: 'x1', name: 'Old Disciple', talent: 2, level: 1, xp: 0 }]
  delete s2.ownSect.branches
  gs2._recalc()
  assert(Array.isArray(s2.ownSect.branches) && s2.ownSect.branches.length === 0, 'an old save gains an empty branch list')
  assert(s2.ownSect.disciples[0].branchId === null && s2.ownSect.disciples[0].role === 'disciple', 'its disciples gain branch fields')
  assert(typeof s2.ownSect.disciples[0].personality === 'string' && s2.ownSect.disciples[0].personality.length > 0, 'a disciple gains a personality (a hash of its id, no RNG)')
  s2.ownSect.branches = [{ id: 'bkX', name: 'Ghost Branch', headId: 'gone', loyalty: 70 }]
  gs2._recalc()
  assert(s2.ownSect.branches.length === 0, 'a branch whose head is gone dissolves')

  // ── The cap: a sect holds at most SECT_BRANCH.maxBranches (4) branches at once ──
  s2.ownSect.disciples = Array.from({ length: 6 }, (_, i) => ({ id: 'k' + i, name: 'K' + i, talent: 2, level: 1, xp: 0 }))
  gs2._recalc()
  assert(S.maxBranches === 4, `the branch cap is 4 (${S.maxBranches})`)
  for (let i = 0; i < 4; i++) gs2.appointBranchHead('k' + i)
  assert(s2.ownSect.branches.length === 4 && gs2.branchInfo().full, 'four branches stand and branchInfo reports the sect full')
  assert(gs2.appointBranchHead('k4').reason === 'max_branches' && s2.ownSect.branches.length === 4, 'a fifth branch is refused (max_branches)')
  gs2.dismissBranch(s2.ownSect.branches[0].id)
  assert(gs2.appointBranchHead('k4').ok && s2.ownSect.branches.length === 4, 'dissolving one frees a place for another')
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
