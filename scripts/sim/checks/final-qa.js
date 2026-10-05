// Scenario checks — regressions found by the v1 final QA & Balance pass (2026-10-04; docs/final-qa-changelog.md,
// docs/systems/qa-sim.md → "Final QA pass"). Pins: a branch never names a head it does not hold (_repairLines — a stale
// branch head made a lost branch war kill the clan head: clan_head_invalid); no dead person keeps a world sect seat
// after the yearly sect tick (sect_master_dead); a dead stranger you never knew is pruned after
// NPC_LIVES.pruneStrangerAfter years, while anyone you knew keeps the old 200.
// Run: npm run checks (all) · node scripts/sim/checks/final-qa.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  // ── A stale branch head is repaired (and never dies for a branch it does not lead) ──
  { const sim = await createSim({ seed: 9101 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
    const clan = gs._playerClan()
    const head = gs._mintPerson({ stage: 12, role: 'head' }, Math.random), br = gs._mintPerson({ stage: 9, role: 'kin' }, Math.random)
    clan.lines = [{ name: 'Main Line', headId: head.id, memberIds: [head.id] }, { name: 'Eastern Branch', headId: head.id, memberIds: [br.id, s.self.id] }]
    clan.headId = head.id
    gs._repairLines(clan)
    assert(clan.lines[1].headId === br.id && clan.lines[0].headId === head.id, 'a branch naming the clan head (not its member) passes to its own strongest member')
    clan.lines[1].headId = head.id
    gs._ensurePhase46Fields()
    assert(clan.lines[1].headId === br.id, 'the load-time migration repairs it too')
    br.alive = false; gs._repairLines(clan)
    assert(clan.lines[1].headId === null, 'a branch with no living member (you aside) has no head')
  }

  // ── No dead person keeps a world sect seat past the yearly tick ──
  { const sim = await createSim({ seed: 9102 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
    const r = w.sects.list.find(x => x.alive); gs._wsEnsurePeople(r)
    const m = w.persons[r.leaderId], e = (r.elderIds || [])[0]
    m.alive = false; m.diedYear = Math.floor(w.year)   // died by a path that skipped _killPerson
    if (e) w.persons[e].alive = false
    w.year = Math.floor(w.year) + 1.01; gs._tickWorldSects()
    const now = w.persons[r.leaderId]
    assert(r.leaderId !== m.id && now && now.alive !== false, 'a dead master left in the seat is replaced by the yearly tick')
    assert(!e || !(r.elderIds || []).includes(e), 'a dead elder leaves the bench')
  }

  // ── Save size: a dead stranger goes after pruneStrangerAfter years; someone you knew keeps 200 ──
  { const sim = await createSim({ seed: 9103 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
    const L = sim.ev('NPC_LIVES'), yr = Math.floor(w.year) + 1000
    const a = gs._mintPerson({ stage: 3, role: 'wanderer' }, Math.random), b = gs._mintPerson({ stage: 3, role: 'wanderer' }, Math.random)
    for (const p of [a, b]) { p.alive = false; p.diedYear = yr - L.pruneStrangerAfter - 5; p.cohort = null; p.rel = 0; p.fam = 0; p.mem = [] }
    b.fam = 2   // you met them once
    gs._pruneDead(yr)
    assert(!w.persons[a.id], `a dead stranger is forgotten after ${L.pruneStrangerAfter} years`)
    assert(!!w.persons[b.id] && w.persons[b.id].act === undefined && w.persons[b.id].ties === undefined, 'someone you met is kept (200 years), compacted (no act / ties)')
  }
})().catch(e => { console.log('FAIL crashed (final-qa):', e.stack); process.exitCode = 1 })
