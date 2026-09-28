// Scenario checks — family.md → "1.8b-3a": courtship (seek → court → meetings → propose / refusal → spurned →
// road encounter), spouse actions (time / gift / dual cultivation + deviation, cooldowns, affection causes), the
// 'ask' plan (wishes, yes/no, try for a child, a Cold spouse refuses, expecting → birth), delegated-plan override
// (postpone), separation, raising a child (age locks, teach pulls morality, head-start xp), and save migration.
// Run: npm run checks (all) · node scripts/sim/checks/family-agency.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')
async function single(seed, stage = 12) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.spiritStones = 1e6; gs._recalc()
  s.qi = s.derived.qiCap * 0.5
  return { sim, gs }
}
async function married(seed, stage = 12) {
  const r = await single(seed, stage), gs = r.gs, s = gs.get()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  return r
}
const tickYears = (gs, n) => { for (let i = 0; i < n; i++) { gs.get().world.year += 1; gs._tickFamily() } }

;(async () => {
  // ── Courtship ──
  { const { sim, gs } = await single(1, 5)
    assert(gs.canSeekMatch().reason === 'stage', 'seek match locked below Foundation Building')
    const s = gs.get(); s.stageIndex = 12; s.maxStageThisLife = 12; gs._recalc()
    const stones = s.spiritStones, r = gs.seekMatch(), f = gs.get().family
    assert(r.ok && f.court.candidates.length === 3 && gs.get().spiritStones === stones - gs.courtCost(), `seek: 3 candidates for ${gs.courtCost()} stones`)
    assert(gs.canSeekMatch().reason === 'courting', 'cannot seek twice')
    const t = f.court.candidates[1]
    gs.courtTarget(t.id)
    assert(f.court.target.id === t.id && f.court.candidates.length === 0 && f.court.interest >= 40, `courting ${t.given}, interest ${f.court.interest}`)
    assert(gs.canPropose().reason === 'meetings', 'cannot propose before 2 meetings')
    assert(gs.meetTarget().ok && gs.canMeet().reason === 'pending', 'meeting drawn, waits for an answer')
    const before = f.court.interest, res = gs.resolveCourtBeat(0)
    assert(res.ok && f.court.meetings === 1 && f.court.interest === Math.max(0, Math.min(100, before + res.delta)), `meeting answered (interest ${before} → ${f.court.interest})`)
    assert(gs.canMeet().reason === 'cooldown', 'next meeting waits out its timer')
    gs.get().stats.timePlayed += 1000; gs.meetTarget(); gs.resolveCourtBeat(1)   // real-time timer, not game years
    const pc = gs.proposeChance()
    assert(gs.canPropose().ok && Math.abs(pc.parts.reduce((a, p) => a + p.value, 0) - pc.raw) < 1e-9 && pc.total >= 0.05 && pc.total <= 0.95, `propose chance ${(pc.total * 100).toFixed(1)}% = sum of its parts`)
    // Refusal → spurned, cooldown
    rng(sim, 0.999); const no = gs.propose(); unrng(sim)
    assert(no.ok && !no.accepted && !gs.get().family.court && gs.get().family.spurned.length === 1, 'refused: courtship ends, suitor remembered')
    assert(gs.canSeekMatch().reason === 'cooldown', `seek cools down (${gs.canSeekMatch().secsLeft}s left)`)
    // A spurned suitor comes back on the road
    // (natural RNG: a constant Math.random hangs resolveExpedition's beast-trait loop — family.md gotcha)
    let back = null
    for (let i = 0; i < 600 && !back; i++) {
      gs.get().family.encounters = []; gs.get().expedition = { active: true, locationId: 'mortal_forest', endsAt: 0 }
      gs.resolveExpedition(); back = gs.get().family.encounters.find(e => e.spurned)
    }
    assert(back && back.person.id === t.id && gs.get().family.spurned.length === 0, 'the suitor who refused you turns up on the road') }
  { const { sim, gs } = await single(2)
    gs.seekMatch(); const f = gs.get().family; gs.courtTarget(f.court.candidates[0].id)
    f.court.meetings = 2; f.court.interest = 90
    rng(sim, 0.0); const yes = gs.propose(); unrng(sim)
    assert(yes.accepted && f.spouse && !f.court && f.affection === Math.round(60 + (90 - 50) * 0.5), `accepted: wed, affection ${f.affection} carries interest`)
    assert(gs.canSeekMatch().reason === 'married', 'no courting while married') }
  { const { gs } = await single(3)
    gs.seekMatch(); gs.courtTarget(gs.get().family.court.candidates[0].id); gs.withdrawCourtship()
    assert(!gs.get().family.court && gs.canSeekMatch().reason === 'cooldown', 'withdraw: courtship ends, seek cools down') }

  // ── Spouse actions ──
  { const { sim, gs } = await married(4); const s = gs.get(), f = s.family
    f.affection = 50
    const p = gs.spouseActionPreview('time'), qi0 = s.qi
    const r = gs.spouseAction('time')
    assert(r.ok && Math.abs(s.qi - (qi0 - p.qi)) < 1e-6 && f.affection === 50 + p.aff, `time: −${Math.round(p.qi)} Qi, affection +${p.aff}`)
    assert(f.lastAff?.why === 'time spent together' && f.lastAff.delta === p.aff, 'affection records its cause')
    assert(gs.spouseAction('time').reason === 'cooldown', 'time is on cooldown')
    const st0 = s.spiritStones, g = gs.spouseActionPreview('gift'); gs.spouseAction('gift')
    assert(s.spiritStones === st0 - g.stones, `gift costs ${g.stones} stones`)
    // Dual cultivation: safe at high affection gains Qi; a Cold spouse is risky
    f.affection = 90; const dp = gs.spouseActionPreview('dual')
    assert(dp.risk === 0.03, `dual risk floors at 3% when Devoted (${dp.risk})`)
    const q1 = s.qi; rng(sim, 0.5); const ok = gs.spouseAction('dual'); unrng(sim)
    assert(ok.ok && !ok.deviation && s.qi > q1, `dual: +${Math.round(dp.qiGainFrac * 100)}% of cap`)
    f.spouseCd.dual = 0; f.affection = 20; const risky = gs.spouseActionPreview('dual')
    assert(Math.abs(risky.risk - 0.4) < 1e-9, `dual risk at affection 20 = 40% (${risky.risk})`)
    const h0 = s.health; rng(sim, 0.0); const bad = gs.spouseAction('dual'); unrng(sim)
    assert(bad.deviation && s.health === Math.max(1, h0 - 15), `deviation: Health ${h0} → ${s.health}`) }

  // ── Children: ask plan, wishes, try, cold refusal ──
  { const { sim, gs } = await married(5); const s = gs.get(), f = s.family
    assert(f.planning === 'ask', 'new marriages default to ask')
    f.nextChildYear = s.world.year - 1; f.affection = 60; tickYears(gs, 1)
    assert(f.childWish?.partnerId === f.spouse.id && f.children.length === 0, 'spouse raises a wish; no child without your answer')
    tickYears(gs, 30); assert(f.children.length === 0 && f.childWish, 'wish waits (30 yrs, no births)')
    const a0 = f.affection; gs.answerChildWish(false)
    assert(!f.childWish && f.affection < a0 && f.lastAff.why.includes('not now'), `not now: affection ${Math.round(f.affection - a0)}, timer restarts`)
    assert(gs.tryForChild().ok && f.expecting.length === 1, 'try for a child: expecting')
    assert(gs.tryChildPreview().reason === 'expecting', 'cannot try again while expecting')
    tickYears(gs, 1); assert(f.children.length === 1 && f.expecting.length === 0, 'born the next year')
    f.childTryAt = 0; f.affection = 10
    assert(gs.tryForChild().reason === 'cold' && f.expecting.length === 0, 'a Cold spouse refuses')
    f.affection = 10; f.childWish = null; f.nextChildYear = s.world.year - 1; tickYears(gs, 1)
    assert(!f.childWish, 'a Cold spouse does not wish for a child') }
  { const { gs } = await married(6); const s = gs.get(), f = s.family
    gs.setFamilyPlanning('many'); f.nextChildYear = s.world.year + 5
    const r = gs.postponeChild()
    assert(r.ok && f.nextChildYear > s.world.year + 5 + 14, `delegated plan: postpone pushes the birth to yr ${r.nextYear}`)
    gs.setFamilyPlanning('ask'); assert(gs.postponeChild().reason === 'nothing_scheduled', 'postpone only for delegated plans') }

  // ── Separation ──
  { const { gs } = await married(7); const f = gs.get().family
    const c = gs._makeChild(f.spouse); c.bond = 50
    assert(gs.separateFromSpouse().ok && !f.spouse && f.formerSpouses.at(-1).endCause === 'divorced' && c.bond === 40, 'separate: divorced, shared child bond −10') }

  // ── Raising a child ──
  { const { gs } = await married(8); const s = gs.get(), f = s.family
    const c = gs._makeChild(f.spouse)
    assert(gs.childActionPreview(c.id, 'teach').reason === 'young' && gs.childActionPreview(c.id, 'teach').minAge === 12, 'teach locked until 12')
    const b0 = c.bond, t = gs.childActionPreview(c.id, 'time'); gs.childAction(c.id, 'time')
    assert(c.bond === b0 + t.bond && c.raised.time === 1 && gs.childActionPreview(c.id, 'time').reason === 'cooldown', `time: bond +${t.bond}, then cooldown`)
    c.bornYear -= 12; c.morality = -60; s.karma = 100
    const tp = gs.childActionPreview(c.id, 'teach'); gs.childAction(c.id, 'teach')
    assert(tp.morality > 0 && c.morality === -60 + tp.morality, `teach pulls morality toward yours (${tp.morality > 0 ? '+' : ''}${tp.morality})`)
    assert(c.stageIndex === 0 && c.xp > 0 && c.xp <= 1, `before awakening, teaching banks a head start (xp ${c.xp.toFixed(2)})`)
    c.bornYear -= 10; c.xp = 0.8; gs.childAction(c.id, 'gift')
    assert(c.stageIndex === 1, `after awakening, resources push a stage (stage ${c.stageIndex})`)
    c.estranged = true; assert(gs.childActionPreview(c.id, 'time').reason === 'gone', 'no actions for a child who left') }

  // ── Save migration ──
  { const { gs } = await married(9); const f = gs.get().family
    delete f.planVer; f.planning = 'many'; delete f.expecting; delete f.spouseCd; delete f.court; gs._recalc()
    assert(f.planning === 'ask' && f.planVer === 1 && Array.isArray(f.expecting) && f.spouseCd && f.court === null, 'old save: default many → ask, new fields backfilled')
    f.planning = 'many'; gs._recalc(); assert(f.planning === 'many', 'a many chosen after 1.8b-3a is kept')
    delete f.planVer; f.planning = 'some'; gs._recalc(); assert(f.planning === 'some', 'an old explicit some is kept') }
})()
