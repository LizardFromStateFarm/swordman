// Scenario checks — Phase 28 tasks 4.4 + 4.5 (docs/systems/living-world.md → "4.4 + 4.5 as built"): the heavy tier and
// its seasonal goals, NPC duels / revenge / betrayal / founding, known-first casting + the new-name throttle.
// Pins: tiers (≤ heavyMax, this life's class reserved, clan + family people never heavy); the season step draws no
// Math.random and runs only while open; goals change the world (roams, meetings → ties, weddings, joins, sworn, duels);
// a blood duel's killer is hunted by ONE avenger who carries the feud on their card; a betrayal seats the usurper (or
// splits the sect); the person card's "Their life now"; casting draws known people ~75% (suitors, courtship, road
// strangers, arena rosters, recruits) without duplicates or kin, throttles new names per open hour, and a cast recruit
// IS that person when taken in; 400 years with the heavy tier keep old age a backstop and no dead seat.
// Run: npm run checks (all) · node scripts/sim/checks/heavy-ai.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 44 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
  const H = sim.ev('NPC_HEAVY'), C = sim.ev('NPC_CAST'), Persons = sim.ev('Persons'), full = p => Persons.fullName(p)
  let yr = Math.floor(w.year)
  const years = (n, quiet = true) => { for (let y = yr + 1; y <= yr + n; y++) { w.year = y + 0.01; gs._tickWorldSects(); gs._lifeStep(y, quiet); for (let k = 0; k < 4; k++) gs._heavyStep(y * 4 + k, quiet) } w.livesYear = yr + n; w.seasonAt = (yr + n) * 4 + 3; yr += n }

  // ── Tiers ──
  gs._assignTiers(yr)
  const heavy = Object.values(w.persons).filter(p => p.tier === 'heavy')
  const cls = w.cohorts[gs._lifeNo()].ids.map(id => w.persons[id]).filter(p => p.alive !== false)
  assert(heavy.length > 0 && heavy.length <= H.heavyMax, `heavy tier within budget (${heavy.length}/${H.heavyMax})`)
  assert(cls.every(p => p.tier === 'heavy'), `this life's class is heavy (${cls.length} reserved)`)
  const clanIds = gs._clanIdSet()
  assert(heavy.every(p => (!p.owner || p.owner === 'world') && !clanIds.has(p.id)), 'clan and family people are never heavy (their own systems run them)')

  // ── The season step: seeded, and it changes the world ──
  sim.ev('globalThis.__n = 0; globalThis.__r = Math.random; Math.random = () => { globalThis.__n++; return globalThis.__r() }')
  const t0 = Date.now(); for (let k = 0; k < 4; k++) gs._heavyStep(yr * 4 + k, true); const ms = (Date.now() - t0) / 4
  const draws = sim.ev('globalThis.__n'); sim.ev('Math.random = globalThis.__r')
  assert(draws === 0, `a season of the heavy tier draws no Math.random (${draws})`)
  assert(ms < 20, `a season steps in ${ms.toFixed(2)} ms`)
  years(120)
  const d = w.lifeStats.deeds || {}
  assert((d.metFriendly || 0) > 0 && (d.wed || 0) > 0 && (d.join || 0) > 0 && (d.help || 0) + (d.sworn || 0) > 0, `120 years of goals: ${Object.entries(d).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  const tied = Object.values(w.persons).filter(p => p.alive !== false && Object.keys(p.ties || {}).length)
  assert(tied.length > 10 && tied.every(p => Object.keys(p.ties).length <= H.tiesMax && Object.values(p.ties).every(v => v >= -100 && v <= 100)), `people carry ties to each other (${tied.length}, ≤ ${H.tiesMax} each)`)
  assert(Object.values(w.persons).some(p => p.alive !== false && Object.values(p.ties || {}).includes(100)), 'some have sworn brotherhood (a tie of 100)')
  const tot = Object.values(w.lifeStats.deaths).reduce((a, b) => a + b, 0)
  assert((w.lifeStats.deaths.old_age || 0) / tot < 0.25, `old age stays a backstop with the heavy tier (${Math.round((w.lifeStats.deaths.old_age || 0) / tot * 100)}%)`)
  const violent = (w.lifeStats.deaths.duel || 0) + (w.lifeStats.deaths.feud || 0)
  assert(violent / tot < 0.5, `duels + feuds are under half of all deaths (${Math.round(violent / tot * 100)}%)`)
  assert(!w.sects.list.filter(r => r.alive).some(r => w.persons[r.leaderId]?.alive === false || (r.elderIds || []).some(id => w.persons[id]?.alive === false)), 'no dead master or elder holds a seat')

  // ── A blood duel: one avenger takes up the feud ──
  const live = () => Object.values(w.persons).filter(p => gs._heavyEligible(p, gs._clanIdSet()) && !p.sectRole)
  const victim = live().find(p => (p.parents || []).length === 2 && live().some(c => (c.parents || []).includes(p.id)))
    || live().find(p => live().some(c => (c.parents || []).includes(p.id)))
  if (victim) {
    const kids = live().filter(c => (c.parents || []).includes(victim.id))
    for (const k of kids) delete k.feud
    const killer = live().find(p => p !== victim && !kids.includes(p) && !(victim.parents || []).includes(p.id))
    gs._npcSlain(victim, killer, yr, 'duel')
    const av = live().filter(p => p.feud?.pid === killer.id)
    assert(victim.alive === false && victim.killedBy === killer.id, `${full(victim)} is slain by ${full(killer)}`)
    assert(av.length === 1 && kids.includes(av[0]) && /their parent/.test(av[0].feud.why), `one avenger (a child) swears the feud: "${av[0]?.feud?.why}"`)
    assert(kids.every(k => (k.ties?.[killer.id] || 0) <= H.feudTie), 'every child hates the killer')
    const info = gs.personInfo(av[0].id)
    assert(info.feud?.pid === killer.id && info.feud.name === full(killer), 'the avenger\'s card names the feud')
    assert(gs.personInfo(victim.id).killedBy?.pid === killer.id, 'the slain\'s card names their killer')
    // The avenger acts on it (forced): a revenge duel to the death.
    const before = av[0].alive !== false && killer.alive !== false
    gs._npcDuel(av[0], killer, true, yr, sim.ev('wsRng')('check|revenge'), { life: gs._lifeNo(), clan: new Set(), mine: null, quiet: true }, 'revenge')
    assert(before && (av[0].alive === false) !== (killer.alive === false), `the revenge ends with one of them dead (${killer.alive === false ? 'avenged' : 'the avenger fell'})`)
    if (killer.alive === false) assert(!av[0].feud, 'an avenged feud is laid down')
  } else assert(true, 'no parent with a child alive to test the feud (skipped)')

  // ── Betrayal ──
  const r = w.sects.list.find(x => x.alive && (x.elderIds || []).length && w.persons[x.leaderId])
  const elder = w.persons[r.elderIds[0]], master = w.persons[r.leaderId]
  const ctx = { life: gs._lifeNo(), clan: new Set(), mine: null, quiet: true }
  let won = 0, lost = 0, split = 0
  for (let i = 0; i < 12 && elder.alive !== false && elder.sectId === r.id && elder.sectRole === 'elder'; i++) {
    const m = w.persons[r.leaderId]
    gs._npcBetray(elder, m, r, yr, sim.ev('wsRng')(`check|betray|${i}`), ctx)
    if (r.leaderId === elder.id) won++
    else if (elder.alive === false) lost++
    else if (elder.sectId !== r.id) split++
  }
  assert(won + lost + split >= 1, `a betrayal ends in a seat taken (${won}), a death (${lost}) or a split (${split})`)
  if (won) assert(r.leader === full(elder) && master.alive === false && master.killedBy === elder.id, 'the usurper sits; the old master was slain by them')
  if (split) { const nr = w.sects.list.find(x => x.alive && x.leaderId === elder.id); assert(nr && nr.splitFrom === r.id && nr.origin === 'split', `the failed betrayer breaks away and raises the ${nr?.name}`) }

  // ── Person card: "Their life now" ──
  const actor = Object.values(w.persons).find(p => p.alive !== false && p.tier === 'heavy' && gs._actOn(p, Math.floor(w.year * 4)))
  if (actor) { const i = gs.personInfo(actor.id); assert(typeof i.now === 'string' && i.now.length > 3 && !/\{/.test(i.now), `the card says what they are doing: "${i.now}"`) }
  else assert(true, 'nobody busy this season (skipped)')

  // ── Known-first casting ──
  { const sim2 = await createSim({ seed: 45 }); await sim2.boot(0); const g = sim2.gs, s2 = g.get(), w2 = s2.world
    s2.stageIndex = 3; s2.maxStageThisLife = 12; g._recalc()
    const life = g._lifeNo()
    let known = 0, n = 0
    const seen = new Set()
    for (let i = 0; i < 40; i++) {
      const p = g._rollStranger('suitor')
      n++; if (w2.persons[p.id]) known++
      g._syncPersons()   // nobody holds this copy: the sync releases the person back to the world (as after a declined offer)
      seen.add(p.id)
    }
    assert(known / n > 0.5 && known / n < 0.98, `about three in four strangers are people the world has (${known}/${n})`)
    const kin = new Set([...(s2.self.parents || []), ...g._clanIdSet()])
    assert([...seen].every(id => !kin.has(id) && id !== s2.self.id), 'never your own kin')
    const cast = [...seen].map(id => w2.persons[id]).filter(Boolean)
    assert(cast.every(p => !(p.spouseIds || []).some(id => w2.persons[id]?.alive !== false) && p.sectRole !== 'master' && p.sectRole !== 'elder'), 'a cast suitor is single and holds no seat')
    const c = g._rollStranger('suitor'); assert(w2.persons[c.id] ? c !== w2.persons[c.id] && c.role === 'suitor' : true, 'the family gets a copy (the registry stays the one home)')
    // the proposal offers distinct people
    s2.family.nextProposalYear = w2.year - 1; s2.family.proposal = null; g._tickFamily()
    const ids = s2.family.proposal.suitors.map(x => x.id)
    assert(new Set(ids).size === ids.length, `a proposal offers ${ids.length} different people`)
    // a classmate can be offered, and is marked
    const mate = w2.cohorts[life].ids.map(id => w2.persons[id]).find(p => p.alive !== false)
    mate.fam = 30
    assert(g.knownFace(mate.id)?.label === 'Your classmate', 'a classmate cast to you is marked "Your classmate"')
    // throttle
    const cs = g._castStats(); cs.fresh = g._castCap()
    assert(g._castThrottled(), `the new-name throttle closes at ${g._castCap()} new names this open hour`)
    let k2 = 0; for (let i = 0; i < 40; i++) { if (w2.persons[g._rollStranger('stranger').id]) k2++; g._syncPersons() }
    assert(k2 > known * 0.95 || k2 >= 34, `throttled: nearly every stranger is someone known (${k2}/40)`)
    // recruits: a cast recruit IS that person when taken in
    s2.stageIndex = 19; s2.maxStageThisLife = 19; s2.spiritStones = 1e12; s2.inventory.void_crystal = 99; g._recalc()
    if (!s2.ownSect.founded) { const fr = g.foundOwnSect('Check Peak'); if (!fr.ok) console.log('  (found failed:', fr.reason + ')') }
    if (s2.ownSect.founded) {
      cs.fresh = 0
      let tries = 0; while (!s2.ownSect.recruitPool.some(x => x.pid) && tries++ < 20) g._refreshRecruitPool()
      const rc = s2.ownSect.recruitPool.find(x => x.pid)
      assert(!!rc && w2.persons[rc.pid] && !w2.persons[rc.pid].sectId && (w2.persons[rc.pid].stageIndex || 0) <= 9, `the gate offers a real youth of the world (${rc?.name})`)
      const pids = s2.ownSect.recruitPool.map(x => x.pid).filter(Boolean)
      assert(new Set(pids).size === pids.length, 'no youth is offered twice')
      if (rc) {
        const r2 = g.recruitDisciple(rc.id); g._syncPersons()
        const d2 = s2.ownSect.disciples.find(x => x.id === rc.id)
        assert(r2.ok && d2.pid === rc.pid && w2.persons[rc.pid].sectId === 'own' && w2.persons[rc.pid].owner === 'sect', 'taken in, they become your disciple — the same person')
      }
    } else assert(true, 'could not found a sect here (skipped)')
    // arena rosters
    g._arenaEnsureRosters()
    const dIds = Object.keys(s2.arena.duelists)
    assert(dIds.length > 0 && new Set(dIds).size === dIds.length && dIds.some(id => w2.persons[id]), `arena rings draw on the world's people (${dIds.filter(id => w2.persons[id]).length} of ${dIds.length} known)`)
    assert(w2.cast.knownTotal > 0 && w2.cast.freshTotal > 0, `casting is counted (${w2.cast.knownTotal} known · ${w2.cast.freshTotal} new)`)
  }

  // ── The seasons only run while open; the generation jump lives them quietly ──
  { const sim3 = await createSim({ seed: 46 }); await sim3.boot(0); const g = sim3.gs, w3 = g.get().world
    g._save(); const before = w3.seasonAt
    sim3.ev('globalThis.__now = Date.now; Date.now = () => globalThis.__now() + 5 * 3600 * 1000'); await sim3.boot(0); sim3.ev('Date.now = globalThis.__now')
    assert(sim3.gs.get().world.seasonAt === before, 'five hours closed: no season stepped')
    const sa = sim3.gs.get().world.seasonAt
    for (let i = 0; i < 200; i++) sim3.gs.tick(1)
    assert(sim3.gs.get().world.seasonAt > sa, `open play steps the seasons (${sa} → ${sim3.gs.get().world.seasonAt})`)
  }
})()
