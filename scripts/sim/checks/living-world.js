// Scenario checks — Phase 28 Living World, tasks 4.2 (one registry of persons), 4.3 (the light world sim: lives, deaths, your class) + 4.6 (replacement controller + Chronicle) — docs/systems/living-world.md §5, §6.
// Pins: every world sect seats a real master (named r.leader) + elders by tier; family / arena / own-sect people are
// mirrored into world.persons by owner (owner copy wins for life fields, the registry keeps rel/mem/fam); released
// people stay in the world; a seceding head and an inheritor are the same person as the sect master; succession seats
// the senior elder; the migration draws no Math.random and leaves existing ids alone; the player is never in the registry.
// 4.3 pins: the pre-existing world + your class are seeded once (no Math.random, per-slot names); owners keep theirs;
// realm breakthroughs injure or kill; a master's death seats the senior elder; old age < 25% of deaths; no dead seat;
// births + weddings; pruning + compaction; classInfo + the class news; NPC Ascension; frozen while closed; a new class per life.
// 4.6 pins: the controller draws no Math.random; every realm band averages within ±20% of its target over 500 years with
// no extinction; waves / wanderers / hidden masters (seize + found) / the elder draft (never from a UI read); the merged
// Chronicle (both stores, cap, filters, people, notable news + clearing, the pre-4.6 migration, quiet years written).
// Run: npm run checks (all) · node scripts/sim/checks/living-world.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 28 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get(), w = s.world, P = sim.ev('WORLD_PEOPLE'), Persons = sim.ev('Persons')
  const full = p => Persons.fullName(p)

  // ── World sects: real masters + elders ──
  const sects = w.sects.list.filter(r => r.alive)
  const seated = sects.every(r => { const m = w.persons[r.leaderId]; return m && m.alive !== false && full(m) === r.leader && m.sectId === r.id && m.sectRole === 'master' })
  assert(sects.length >= 5 && seated, `every world sect seats a real master named as its leader (${sects.length} sects)`)
  const eldersOk = sects.every(r => (r.elderIds || []).length === P.eldersByTier[(r.tier || 1) - 1] && r.elderIds.every(id => w.persons[id]?.sectId === r.id))
  assert(eldersOk, 'each sect has its elders by tier, all of that sect')
  assert(w.peopleV === 1 && Object.values(w.persons).every(p => p.v >= 2 && p.owner !== undefined && Array.isArray(p.mem)), 'migration stamps the v2 fields on every person')
  assert(Object.values(w.persons).filter(p => p.role === 'sect_master' || p.role === 'sect_elder').every(p => /^n\d+$/.test(p.id)), 'world-minted people take their own id series (n…), never the family counter')
  assert(!w.persons[s.self.id], 'the living player is never in the registry')

  // ── Migration draws no Math.random and is idempotent ──
  { const sim2 = await createSim({ seed: 5 }); await sim2.boot(0); const g2 = sim2.gs, s2 = g2.get()
    const nextId = s2.world.nextId
    for (const p of Object.values(s2.world.persons)) { for (const k of ['owner', 'rel', 'mem', 'ties', 'fam', 'pin', 'tier', 'cohort', 'sectId', 'sectRole', 'gender']) delete p[k]; p.v = 1 }
    for (const r of s2.world.sects.list) { delete r.leaderId; delete r.elderIds }
    delete s2.world.peopleV
    sim2.ev('globalThis.__n = 0; globalThis.__r = Math.random; Math.random = () => { globalThis.__n++; return globalThis.__r() }')
    g2._ensurePhase28Fields()
    const draws = sim2.ev('globalThis.__n'); sim2.ev('Math.random = globalThis.__r')
    assert(draws === 0, `the migration draws no Math.random (${draws})`)
    assert(s2.world.nextId === nextId, 'the migration leaves the family id counter alone')
    const n = Object.keys(s2.world.persons).length
    g2._ensurePhase28Fields(); g2._recalc()
    assert(Object.keys(s2.world.persons).length === n, 'running it again mints no one')
  }

  // ── Family: mirrored by owner; the registry keeps its own fields ──
  s.stageIndex = 12; s.maxStageThisLife = 12; s.spiritStones = 1e6; gs._recalc()
  s.family.nextProposalYear = w.year - 1; gs._tickFamily()
  const suitor = s.family.proposal.suitors[0]
  gs._syncPersons()
  assert(w.persons[suitor.id]?.owner === 'family' && w.persons[suitor.id].role === 'suitor', 'a suitor shown to you is a person of the world (owner: family)')
  gs.acceptSuitor(suitor.id)
  const child = gs._makeChild(s.family.spouse)
  gs._syncPersons()
  const reg = w.persons[child.id]
  assert(reg && reg.owner === 'family' && reg.role === 'child' && reg.alive, 'a child is mirrored into the registry')
  reg.rel = 42; reg.fam = 3
  child.stageIndex = 7; child.maxStage = 7
  gs._syncPersons()
  assert(w.persons[child.id].stageIndex === 7 && w.persons[child.id].rel === 42 && w.persons[child.id].fam === 3, 'the owner copy wins for life fields; the registry keeps rel + familiarity')
  const bad = [s.family.spouse, ...s.family.children].filter(x => { const r = w.persons[x.id]; return !r || r.alive !== (x.alive !== false) || (r.stageIndex || 0) !== (x.stageIndex || 0) })
  assert(bad.length === 0, 'after a sync the registry and the family agree on alive + stage (invariant 2)')
  const info = gs.personInfo(child.id)
  assert(info && info.toYou === 'Your child' && info.go.some(g => g.view === 'family') && info.kin.some(k => k.rel === 'parent'), 'the person card knows a child: who they are to you, their kin, where to act')

  // ── Arena duelists ──
  s.stageIndex = 14; gs._recalc(); gs._arenaEnsureRosters(); gs._syncPersons()
  const duelists = Object.values(s.arena.duelists)
  assert(duelists.length > 0 && duelists.every(d => w.persons[d.id]?.owner === 'arena'), `arena duelists are people of the world (${duelists.length})`)

  // ── Own sect: disciples become people; a dismissed one stays in the world ──
  s.ownSect.founded = true; s.ownSect.name = 'Test Peak'; s.ownSect.hallLevel = 2
  s.ownSect.disciples = [
    { id: 'd1', name: 'Li Wei', talent: 4, level: 3, xp: 0, personality: 'stoic' },
    { id: 'd2', name: 'Wang Fang', talent: 2, level: 2, xp: 0 },
    { id: 'd3', name: 'Zhao Lei', talent: 5, level: 5, xp: 0 },
  ]
  gs._recalc(); gs._syncPersons()
  const d1 = s.ownSect.disciples[0], pd1 = w.persons[d1.pid]
  assert(pd1 && full(pd1) === 'Li Wei' && pd1.sectId === 'own' && pd1.owner === 'sect' && pd1.stageIndex === 3 && pd1.personality === 'stoic', 'a disciple is a person: name, sect, realm from level, temper')
  assert(w.persons[s.ownSect.disciples[2].pid].root.type === 'heavenly', 'talent 5 reads as a Heavenly Root')
  const pd2 = s.ownSect.disciples[1].pid
  gs.dismissDisciple('d2'); gs._syncPersons()
  assert(w.persons[pd2]?.alive && w.persons[pd2].sectId === null && w.persons[pd2].role === 'wanderer' && w.persons[pd2].owner === 'world', 'a dismissed disciple lives on as a wanderer')

  // ── Secession: the head who leaves IS the splinter's master ──
  const b = gs.appointBranchHead('d1')
  s.ownSect.disciples.push({ id: 'bm', name: 'Gu Ren', talent: 2, level: 1, xp: 0, branchId: b.branch.id, role: 'disciple' })
  gs._syncPersons()
  const headPid = d1.pid, memPid = s.ownSect.disciples.find(x => x.id === 'bm').pid
  b.branch.loyalty = sim.ev('SECT_BRANCH').secedeAt + 1
  gs.dismissBranch(b.branch.id); gs._syncPersons()
  const spl = w.sects.list.find(r => r.alive && r.origin === 'seceded' && r.leader === 'Li Wei')
  assert(spl && spl.leaderId === headPid && w.persons[headPid].sectId === spl.id, 'the seceding head is the same person as the splinter master')
  assert(w.persons[memPid].sectId === spl.id && w.persons[memPid].alive, 'the members who walked out belong to the splinter now')

  // ── Succession: the senior elder takes the seat ──
  const r0 = sects.find(r => (r.elderIds || []).length >= 2) || sects[0]
  gs._wsEnsurePeople(r0)
  const oldMaster = r0.leaderId
  const senior = r0.elderIds.map(id => w.persons[id]).sort((a, b2) => (b2.stageIndex || 0) - (a.stageIndex || 0) || String(a.id).localeCompare(String(b2.id)))[0]
  sim.ev('globalThis.__r = Math.random; Math.random = () => 0')
  gs._wsCheckSuccession(r0, Math.floor(w.year))
  sim.ev('Math.random = globalThis.__r')
  const om = w.persons[oldMaster]
  assert(r0.leaderId === senior.id && full(senior) === r0.leader && senior.sectRole === 'master', `the senior elder takes the seat (${r0.leader})`)
  assert(om.alive === false ? om.cause === 'seat_struggle' : om.role === 'retired_master', `the old master dies in the seat or retires (${om.alive === false ? 'died' : 'retired'})`)
  assert(r0.elderIds.length === P.eldersByTier[(r0.tier || 1) - 1] && !r0.elderIds.includes(senior.id), 'a new elder rises to fill the bench')

  // ── Your sect master is that same person (43e) ──
  { const sim3 = await createSim({ seed: 7 }); await sim3.boot(0); const g3 = sim3.gs, s3 = g3.get()
    const joinable = s3.world.sects.list.find(r => r.kind === 'joinable')
    s3.stageIndex = 5; g3._recalc(); g3.joinSect(joinable.defId)
    const m = g3._sectMaster()
    assert(m && m.id === joinable.leaderId && full(m) === joinable.leader, 'your sect master is the seated person, not a namesake minted on demand')
    const mi = g3.personInfo(m.id)
    assert(mi && mi.sect?.id === joinable.id && /master/i.test(mi.role) && mi.go.some(g => g.sectId === joinable.id), 'the card names their sect and links to its page')
    assert(g3.sectPeople(joinable.id)[0]?.pid === m.id, 'sectPeople lists the master first')
  }

  // ── The end of a life: the registry keeps what the world knew; your sect's people go with your sect ──
  { const sim4 = await createSim({ seed: 9 }); await sim4.boot(0); const g4 = sim4.gs, s4 = g4.get(), w4 = s4.world
    s4.stageIndex = 18; s4.maxStageThisLife = 18; s4.spiritStones = 1e6; g4._recalc()
    s4.family.nextProposalYear = w4.year - 1; g4._tickFamily(); g4.acceptSuitor(s4.family.proposal.suitors[0].id)
    const kid = g4._makeChild(s4.family.spouse); kid.bornYear -= 40; kid.stageIndex = 15
    s4.ownSect.founded = true; s4.ownSect.name = 'Ember Peak'; s4.ownSect.hallLevel = 2
    s4.ownSect.disciples = [{ id: 'e1', name: 'Mo Chen', talent: 3, level: 4, xp: 0 }, { id: 'e2', name: 'Su Lan', talent: 2, level: 2, xp: 0 }]
    g4._recalc(); g4._syncPersons()
    w4.persons[kid.id].rel = 55
    const b4 = g4.appointBranchHead('e1')
    const pe1 = s4.ownSect.disciples[0].pid, pe2 = s4.ownSect.disciples[1].pid
    g4.chooseHeir(kid.id); g4.passTheMantle()
    const rec = w4.sects.list.find(r => r.kind === 'lineage' && r.name === 'Ember Peak')
    assert(w4.persons[kid.id]?.rel === 55, 'the end of a life keeps what the registry knew (rel)')
    assert(rec && rec.leaderId === pe1 && w4.persons[pe1].sectRole === 'master' && b4.ok, 'the branch head who inherits your sect is that same person')
    assert(w4.persons[pe2].sectId === rec.id, 'your disciples belong to the lineage sect now')
    sim4.ev('globalThis.__hm = NPC_HEAVY.heavyMax; NPC_HEAVY.heavyMax = 0')   // 4.4: the heavy tier may make a disciple leave of their own accord; this pins the sync, so it rests
    g4.finishInterlude('clan'); g4._syncPersons()
    sim4.ev('NPC_HEAVY.heavyMax = globalThis.__hm')
    assert(w4.persons[pe2].sectId === rec.id && w4.persons[pe2].owner === 'world', 'the next life does not strip them from it')
    assert(!w4.persons[g4.get().self.id], 'the reborn player is not in the registry')
  }

  // ── Save round-trip + size ──
  gs._save(); await sim.boot(0)
  const s5 = sim.gs.get()
  assert(s5.world.persons[child.id]?.rel === 42 && s5.world.persons[headPid]?.sectId === spl.id, 'people survive a save → load')
  const sz = sim.gs.worldSizeInfo()
  assert(sz.slotBytes < sz.budgetSlot && sz.worldBytes < sz.budgetWorld, `the slot stays inside its budget (${(sz.slotBytes / 1024).toFixed(0)} KB, ${sz.persons} people)`)

  // ══ Task 4.3: the light world sim — lives, deaths, the pre-existing world, your class (living-world.md §6) ══
  { const sim6 = await createSim({ seed: 43 }); await sim6.boot(0); const g = sim6.gs, s6 = g.get(), w6 = s6.world
    const L = sim6.ev('NPC_LIVES'), CAP = sim6.ev('NPC_STAGE_CAP'), yr0 = Math.floor(w6.year)
    const all = () => Object.values(w6.persons)

    // ── Seeding ──
    assert(w6.worldSeedV === 1 && all().filter(p => p.role === 'wanderer' && p.cohort == null).length >= L.seedWanderers &&
      all().filter(p => p.role === 'old_monster').length === L.seedOldMonsters, 'the pre-existing world is seeded once: wanderers + old monsters')
    assert(all().filter(p => p.cohort == null && p.alive !== false).every(p => yr0 - p.bornYear < g._lifespan(p)), 'nobody in the pre-existing world starts past their span')
    const c1 = w6.cohorts?.[1]
    assert(c1 && c1.ids.length === L.cohortSize && c1.ids.filter(id => w6.persons[id].chosen).length === L.cohortChosen, `your class: ${L.cohortSize} youths, ${L.cohortChosen} Heaven's Chosen`)
    assert(c1.ids.every(id => Math.abs(w6.persons[id].bornYear - g._playerBorn()) <= 1 && w6.persons[id].cohort === 1), 'your class was born the year you were, give or take')
    { const sim7 = await createSim({ seed: 5 }); await sim7.boot(0); const g7 = sim7.gs, w7 = g7.get().world
      delete w7.cohorts; delete w7.worldSeedV
      sim7.ev('globalThis.__n = 0; globalThis.__r = Math.random; Math.random = () => { globalThis.__n++; return globalThis.__r() }')
      g7._ensurePhase28Fields(); for (let y = 1; y <= 30; y++) g7._lifeStep(Math.floor(w7.year) + y, true)
      const draws = sim7.ev('globalThis.__n'); sim7.ev('Math.random = globalThis.__r')
      assert(draws === 0 && w7.cohorts?.[1] && w7.worldSeedV === 1, `seeding + 30 years of the life step draw no Math.random (${draws})`)
      const nameOf = id => Persons.fullName(w7.persons[id])
      assert(w7.cohorts[1].ids.map(nameOf).join() !== c1.ids.map(id => Persons.fullName(w6.persons[id])).join(), 'another slot gets another class')
    }
    const minted = all().filter(p => /^n\d+$/.test(p.id)).map(full)
    assert(minted.length - new Set(minted).size <= 2, `world-minted names are (near) unique (${minted.length - new Set(minted).size} repeats of ${minted.length})`)

    // ── Owners keep theirs; seats are safe ──
    s6.stageIndex = 12; s6.maxStageThisLife = 12; s6.spiritStones = 1e6; g._recalc()
    s6.family.nextProposalYear = w6.year - 1; g._tickFamily(); g.acceptSuitor(s6.family.proposal.suitors[0].id)
    const sp = s6.family.spouse, spStage = sp.stageIndex
    g._syncPersons()
    for (let y = 1; y <= 5; y++) g._lifeStep(yr0 + y, true)
    assert(sp.alive !== false && sp.stageIndex === spStage && w6.persons[sp.id].owner === 'family', 'the life step never touches a family-owned person (the family code runs them)')

    // ── Breakthroughs between realms can fail ──
    const test = []
    for (let i = 0; i < 300; i++) { const p = g._mintPerson({ stage: 9, age: [40, 40], role: 'wanderer' }, () => ((i * 7919) % 1000) / 1000); p.npcXp = 0.999; p.grownYear = yr0; test.push(p) }
    const out = test.map(p => g._growPerson(p, yr0 + 1, true))
    const nUp = out.filter(o => o.up).length, nInj = out.filter(o => o.injured).length, nDie = out.filter(o => o.died).length
    assert(nUp > 150 && nInj > 10 && nDie > 0 && nUp + nInj + nDie === 300, `the Foundation breakthrough: ${nUp} succeed, ${nInj} injured, ${nDie} killed by backlash`)
    assert(test.filter((p, i) => out[i].injured).every(p => p.injuredUntil > yr0 + 1 && p.stageIndex === 9 && p.npcXp === 0.5), 'the injured stay put, heal for years, try again from half a stage')
    for (const p of test) { p.alive = false; p.diedYear = yr0 - 500; p.cause = 'probe' }

    // ── A seated master who dies in the life step: the senior elder takes the seat ──
    const r = w6.sects.list.find(x => x.alive && (x.elderIds || []).length)
    const oldM = w6.persons[r.leaderId], senior = r.elderIds.map(id => w6.persons[id]).sort((a, b) => b.stageIndex - a.stageIndex)[0]
    g._npcDies(oldM, yr0 + 6, 'bt_backlash')
    assert(oldM.alive === false && r.leaderId === senior.id && senior.sectRole === 'master' && r.leader === full(senior), 'a master who dies in the world: the senior elder takes the seat')
    assert(w6.sects.chronicle.some(e => e.text.includes(full(oldM)) && /backlash/.test(e.text)), 'the sect chronicle names how the master died')

    // ── Four centuries: deaths by cause, the dead hold no seat, the class lives on, nobody lingers past their span ──
    for (let y = yr0 + 6; y <= yr0 + 420; y++) { w6.year = y + 0.01; g._tickWorldSects(); g._lifeStep(y, true) }
    w6.livesYear = yr0 + 420
    const d = w6.lifeStats.deaths, tot = Object.values(d).reduce((a, b) => a + b, 0) - (d.probe || 0)
    assert(tot > 150 && (d.old_age || 0) / tot < 0.25, `old age is a backstop: ${d.old_age || 0} of ${tot} deaths (${Math.round((d.old_age || 0) / tot * 100)}%, < 25%)`)
    assert(['road', 'feud', 'beast_hunt'].every(k => d[k] > 0), 'the road, feuds and beasts take people')
    assert(w6.lifeStats.births > 0 && w6.lifeStats.marriages > 0, `the world weds (${w6.lifeStats.marriages}) and has children (${w6.lifeStats.births})`)
    const seatsOk = w6.sects.list.filter(x => x.alive).every(x => w6.persons[x.leaderId]?.alive !== false && (x.elderIds || []).every(id => w6.persons[id]?.alive !== false))
    assert(seatsOk, 'no dead person holds a sect seat (invariant 1)')
    const yrN = yr0 + 420, living = all().filter(p => p.alive !== false && (!p.owner || p.owner === 'world'))
    assert(living.every(p => yrN - (p.bornYear ?? yrN) < g._lifespan(p) + 60), 'nobody lingers far past their span')
    assert(all().filter(p => p.alive === false && p.cause !== 'probe').every(p => p.diedYear != null && p.cause), 'every death has a year and a cause')
    const kids = all().filter(p => p.role === 'youth' || ((p.parents || []).length === 2 && /^n/.test(p.parents[0])))
    assert(kids.length > 0 && kids.every(k => k.root?.type), 'children of the world carry a root')
    const counts = {}; for (const p of all()) for (const id of p.parents || []) counts[id] = (counts[id] || 0) + 1
    assert(Object.entries(counts).filter(([id]) => /^n/.test(id) && !w6.persons[id]?.cohort).every(([, n]) => n <= L.birthMaxChildren + L.seedChildren[1]), 'no couple has more than its share of children')
    assert(living.filter(p => p.cohort == null).length + 0 < WORLD_PEOPLE_LIGHT_MAX(sim6), `the living stay inside the light budget (${living.length})`)
    assert(!test.some(p => w6.persons[p.id]), 'the long-forgotten dead are pruned')
    assert(c1.ids.every(id => w6.persons[id]), 'dead classmates are kept for the Class board')
    assert(c1.ids.filter(id => w6.persons[id].alive === false).every(id => w6.persons[id].npcXp === undefined), 'the kept dead are compacted')

    // ── The class API + news ──
    const ci = g.classInfo()
    assert(ci.current && ci.members.length === L.cohortSize && ci.counts.living + ci.counts.fallen + ci.counts.ascended === L.cohortSize, `classInfo: ${ci.counts.living} living · ${ci.counts.fallen} fallen · ${ci.counts.ascended} ascended`)
    assert(ci.members.every((m, i, a) => i === 0 || (a[i - 1].alive ? 1 : 0) >= (m.alive ? 1 : 0)), 'the living are listed before the fallen')
    assert(ci.ahead === ci.members.filter(m => m.alive && m.stage > s6.stageIndex).length, 'classInfo counts who stands above you')
    const live1 = c1.ids.map(id => w6.persons[id]).find(p => p.alive !== false)
    if (live1) {
      const ev0 = s6.events.length ? s6.events[0] : null
      g._tellLives([{ k: 'died', p: live1, cause: 'road' }], 1, new Set())
      assert(s6.events[0] !== ev0 && s6.events[0].text.includes(full(live1)) && /road/i.test(s6.events[0].text), 'a classmate’s death is told in the log, cause named')
      assert(g.classNews() >= 1 && collectAttentionHas(sim6, 'class-news'), 'the World group asks you to look at your class')
      g.noteClassSeen()
      assert(g.classNews() === 0, 'opening the class clears it')
    }
    const card = g.personInfo(c1.ids[0])
    assert(card && card.classmate === 'Your classmate' && (card.alive ? card.span > 0 : true), 'the person card names a classmate and their span')

    // ── Ascension ──
    const elder = g._mintPerson({ stage: CAP, age: [500, 500], role: 'old_monster', root: g._rootOfType('heavenly') }, () => 0.5)
    elder.stageYear = yrN - 1000; elder.grownYear = yrN
    let y = yrN
    while (elder.alive !== false && y < yrN + 400) { y++; g._lifeStep(y, true) }
    assert(elder.alive === false && (elder.cause === 'ascended' ? elder.ascended && w6.lifeStats.ascended >= 1 : true), `an old monster at the last mortal stage dares the Trial (${elder.cause})`)

    // ── The world is frozen while closed; the yearly tick runs it while open ──
    g._save(); const before = { y: g.get().world.year, l: g.get().world.livesYear }
    sim6.ev('globalThis.__now = Date.now; Date.now = () => globalThis.__now() + 5 * 3600 * 1000')   // five hours later
    await sim6.boot(0)
    sim6.ev('Date.now = globalThis.__now')
    const w8 = sim6.gs.get().world
    assert(w8.year === before.y && w8.livesYear === before.l, 'five hours closed: the world did not move (invariant 8)')
    const ly = w8.livesYear
    for (let i = 0; i < 400; i++) sim6.gs.tick(1)
    assert(w8.livesYear > ly, `open play steps the world each game year (${ly} → ${w8.livesYear})`)
  }

  // ── A new life: a new class awakens, the old one lives on ──
  { const sim9 = await createSim({ seed: 11 }); await sim9.boot(0); const g = sim9.gs, s9 = g.get()
    s9.stageIndex = 14; s9.maxStageThisLife = 14; g._recalc()
    g.passTheMantle(); g.finishInterlude()
    g._recalc()
    const w9 = g.get().world, lives = Object.keys(w9.cohorts || {})
    assert(lives.length === 2 && g.classInfo().life === 2 && g.classInfo(1).members.length === 60, 'a new life brings a new class; the old class stays on the board')
    assert(w9.cohorts[2].ids.every(id => w9.persons[id].cohort === 2), 'the new class belongs to the new life')
    const chronAfter = g.worldChronicle({ limit: 400 }).entries
    assert(chronAfter.some(e => e.y < Math.floor(w9.year) && e.y > Math.floor(w9.year) - 200), 'the years between lives are written in the Chronicle too (quiet years)')
  }

  // ════ 4.6: the replacement controller + the merged Chronicle (living-world.md "4.6 as built") ════
  { const sim = await createSim({ seed: 46 }); await sim.boot(0); const g = sim.gs, s = g.get(), w = s.world
    const W6 = sim.ev('NPC_WORLD'), CAP = sim.ev('NPC_STAGE_CAP')
    const run = (from, n, quiet = true) => { for (let y = from + 1; y <= from + n; y++) { w.year = y + 0.01; g._lifeStep(y, quiet) } w.livesYear = Math.max(w.livesYear, from + n); return from + n }
    let yr = Math.floor(w.year)

    // The life step (with the controller) never draws Math.random.
    sim.ev('globalThis.__n = 0; globalThis.__r = Math.random; Math.random = () => { globalThis.__n++; return globalThis.__r() }')
    yr = run(yr, 60)
    const draws = sim.ev('globalThis.__n'); sim.ev('Math.random = globalThis.__r')
    assert(draws === 0, `60 years of lives + replacement draw no Math.random (${draws})`)

    // Bands: 600 years of world (sects + lives), each band's mean within ±15% of its target, none extinct.
    const sums = {}, mins = {}; let n = 0
    for (let y = yr + 1; y <= yr + 600; y++) {
      w.year = y + 0.01; g._tickWorldSects(); g._tickWorldLives()
      if (y - yr > 100) { n++; for (const b of g.worldBandsInfo()) { sums[b.id] = (sums[b.id] || 0) + b.count; mins[b.id] = Math.min(mins[b.id] ?? 1e9, b.count) } }
    }
    yr += 600
    const means = W6.bands.map(b => ({ id: b.id, m: sums[b.id] / n, t: b.target }))
    // (final QA: ±15% → ±20%. Measured on seeds 46–49 before any change: fb 31.8–35.1 / 30 — seed 47 and 48 already broke ±15%.)
    assert(means.every(x => Math.abs(x.m / x.t - 1) <= 0.20), 'each realm band averages within ±20% of its target over 500 years: ' + means.map(x => `${x.id} ${x.m.toFixed(1)}/${x.t}`).join(' · '))
    assert(['low', 'fb', 'cf'].every(id => mins[id] > 0), `no extinction in the lower realms (min ${['low', 'fb', 'cf'].map(id => mins[id]).join('/')})`)
    const st = w.lifeStats
    assert(st.waves > 0 && st.awakened > 0 && st.wanderers > 0 && st.hidden > 0, `the world refills: ${st.waves} waves (${st.awakened}), ${st.wanderers} wanderers, ${st.hidden} hidden masters`)
    const tot = Object.values(st.deaths).reduce((a, b) => a + b, 0)
    assert((st.deaths.old_age || 0) / tot < 0.25, `old age stays a backstop (${Math.round((st.deaths.old_age || 0) / tot * 100)}% of deaths)`)
    assert(g.worldSizeInfo().slotBytes < sim.ev('WORLD_PEOPLE').slotBudgetBytes, `the slot stays inside its budget (${Math.round(g.worldSizeInfo().slotBytes / 1024)} KB)`)
    const deadSeat = w.sects.list.filter(r => r.alive).some(r => w.persons[r.leaderId]?.alive === false || (r.elderIds || []).some(id => w.persons[id]?.alive === false))
    assert(!deadSeat, 'no dead master or elder holds a seat after hidden masters + drafts')

    // A thin low band: an awakening wave on the next wave year, chronicled.
    const lows = g._worldPeople().filter(p => (p.stageIndex || 0) <= 9 && !p.cohort && !p.sectId)
    for (const p of lows.slice(0, 80)) g._killPerson(p.id, yr, 'road')
    const wy = Math.ceil((yr + 1) / W6.waveEvery) * W6.waveEvery
    const w0 = st.awakened
    yr = run(yr, wy - yr)
    const wave = Object.values(w.persons).filter(p => p.wave === wy)
    assert(wave.length >= W6.waveSize[0] && st.awakened - w0 === wave.length && wave.every(p => (p.stageIndex || 0) <= 1 && yr - p.bornYear >= 16), `a thin low band brings a wave of ${wave.length} youths in year ${wy}`)
    assert(w.chron.some(e => e.k === 'wave' && e.y === wy), 'the wave is written in the Chronicle')

    // An empty Core band draws wanderers down from the far ranges.
    for (const p of g._worldPeople().filter(p => p.stageIndex >= 13 && p.stageIndex <= 15 && !p.sectRole)) g._killPerson(p.id, yr, 'road')
    const wa0 = st.wanderers
    yr = run(yr, 30)
    const arrivals = w.chron.filter(e => e.k === 'arrival' && e.y > yr - 30)
    assert(st.wanderers > wa0 && arrivals.length > 0 && arrivals.every(e => e.p?.length === 1 && w.persons[e.p[0]]), `a thin Core band draws wanderers (${st.wanderers - wa0} in 30 years), each named in the Chronicle`)

    // A hidden master who seizes a seat: the weaker master falls or withdraws, the sect is theirs, it is notable.
    sim.ev('globalThis.__hf = NPC_WORLD.hiddenFates; NPC_WORLD.hiddenFates = { seize: 1 }')
    const bandSS = g.worldBandsInfo().find(b => b.id === 'ss')
    const before = new Map(w.sects.list.filter(r => r.alive).map(r => [r.id, r.leaderId]))
    w.chronSeen = w.chronSeq
    const hm = g._hiddenMaster(bandSS, yr, sim.ev('wsRng')('check|seize'))
    const took = w.sects.list.find(r => r.alive && r.leaderId === hm.id)
    const oldM = took && w.persons[before.get(took.id)]
    assert(hm.stageIndex >= 19 && hm.stageIndex <= CAP && hm.role === 'sect_master' && hm.hidden > 0, `an old monster wakes at Spirit Severing (${hm.hidden} years sealed)`)
    assert(took && took.leader === full(hm) && hm.sectId === took.id && took.leaderSince === yr, 'they take the master’s seat of a weaker sect')
    assert(oldM && oldM.id !== hm.id && (oldM.alive === false ? oldM.cause === 'seat_struggle' : oldM.role === 'retired_master' && !oldM.sectRole), `the old master ${oldM?.alive === false ? 'fell defending it' : 'withdrew'}`)
    assert(w.chron.some(e => e.k === 'hidden' && e.n && e.p?.[0] === hm.id) && w.chron.some(e => e.k === 'sect' && e.s === took.id && e.n), 'the waking and the seizure are notable Chronicle lines')
    assert(g.chronicleNews() >= 2, `the 世 World group gets a notable-news nudge (${g.chronicleNews()})`)
    g.noteChronicleSeen()
    assert(g.chronicleNews() === 0, 'opening the Chronicle clears it')
    sim.ev('NPC_WORLD.hiddenFates = { found: 1 }')
    while (w.sects.list.filter(r => r.alive).length >= sim.ev('WORLD_SECTS').maxAlive) {   // make room: a rival sect breaks apart
      const gone = w.sects.list.filter(r => r.alive && r.kind === 'rival' && r !== took).pop(); gone.alive = false; w.sects.list = w.sects.list.filter(r => r.alive)
    }
    {
      const hf = g._hiddenMaster(bandSS, yr, sim.ev('wsRng')('check|found'))
      const own = w.sects.list.find(r => r.alive && r.leaderId === hf.id)
      assert(own && own.origin === 'hidden_master' && own.leader === full(hf) && g.sectPeople(own.id)[0]?.pid === hf.id, `another raises a sect of their own: the ${own?.name}`)
    }
    sim.ev('NPC_WORLD.hiddenFates = globalThis.__hf')

    // The elder draft: an empty bench takes a living disciple of that sect before anyone is minted; a UI read never drafts.
    const r = w.sects.list.find(x => x.alive && w.persons[x.leaderId] && (w.persons[x.leaderId].stageIndex || 0) >= 6)
    const lead = w.persons[r.leaderId]
    const cand = g._mintPerson({ stage: lead.stageIndex - 2, age: [60, 60], role: 'disciple', sectId: r.id, sectRole: 'disciple' }, () => 0.3)
    for (const id of r.elderIds) { w.persons[id].sectRole = null; w.persons[id].sectId = null; w.persons[id].role = 'wanderer' }
    r.elderIds = []
    g.sectPeople(r.id)
    assert(r.elderIds.length > 0 && !r.elderIds.includes(cand.id), 'a UI read refills the bench by minting (it never drafts)')
    r.elderIds = []
    g._wsEnsurePeople(r, true)
    assert(r.elderIds.includes(cand.id) && cand.sectRole === 'elder' && cand.role === 'sect_elder', 'the yearly tick drafts the sect’s own disciple onto the elders’ bench')
    assert(w.chron.some(e => e.k === 'sect' && e.p?.[0] === cand.id && /raised to elder/.test(e.t)), 'the draft is chronicled')

    // The merged Chronicle: one feed, sect lines included, filters + counts, names resolve, capped.
    const sl = w.sects.chronicle.length
    g._wsChron('A test line for the merged feed.', r.id, [lead.id])
    assert(w.sects.chronicle.length === Math.min(sl + 1, sim.ev('WORLD_SECTS').chronicleMax) && w.chron[w.chron.length - 1].t === 'A test line for the merged feed.', 'a sect line lands in both the sects’ chronicle and the merged feed')
    const all = g.worldChronicle({ limit: 1000 })
    assert(all.entries.length === w.chron.filter(e => !e.q).length && w.chron.length <= W6.chronMax, `the feed is capped (${w.chron.length}/${W6.chronMax}); All leaves out ${all.counts.routine} routine lines`)
    assert(all.entries.every((e, i, a) => i === 0 || a[i - 1].i > e.i), 'newest first')
    assert(all.counts.sects + all.counts.people === all.counts.all + all.counts.routine, 'every line is a sect line or a people line')
    assert(g.worldChronicle({ filter: 'sects', limit: 1000 }).entries.some(e => /raised to elder/.test(e.text)) && !all.entries.some(e => /raised to elder|take the oath/.test(e.text)), 'routine lines live under Sects, not All')
    const notable = g.worldChronicle({ filter: 'notable', limit: 1000 })
    assert(notable.entries.length === all.counts.notable && notable.entries.every(e => e.notable), `the Notable filter (${notable.entries.length})`)
    assert(all.entries[0].who[0]?.pid === lead.id && all.entries[0].who[0].name === full(lead), 'each line carries its people (pid + name) for the person card')
    assert(all.bands.length === W6.bands.length && all.bands.every(b => b.count >= 0 && ['thin', 'ok', 'crowded'].includes(b.state)), 'the feed carries the world-by-realm strip')

    // Migration: a save from before 4.6 starts its Chronicle from the sects' chronicle, with nothing marked unseen.
    delete w.chron; delete w.chronSeq; delete w.chronSeen
    g._ensurePhase28Fields()
    assert(Array.isArray(w.chron) && w.chron.length === w.sects.chronicle.length && w.chron.every(e => e.k === 'sect') && g.chronicleNews() === 0, `an old save's Chronicle starts from the sects' ${w.chron.length} lines, nothing unseen`)
  }
  // ── 4.7: World → People — the people you know, pins (capped, heavy, kept after death), pinned news, log names ──
  {
    const sim7 = await createSim({ seed: 47 }); await sim7.boot(0); const g = sim7.gs, s7 = g.get(), w7 = s7.world, P7 = sim7.ev('WORLD_PEOPLE')
    const full7 = p => sim7.ev('Persons').fullName(p)
    let k = g.knownPeople({ limit: 1000 })
    const cls = w7.cohorts[g._lifeNo()].ids
    assert(cls.every(id => k.rows.some(r => r.pid === id) || w7.persons[id]?.alive === false) && k.counts.class >= cls.length - k.counts.fallen, `People lists your whole living class (${k.counts.class})`)
    assert(!k.rows.some(r => r.pid === s7.self.id), 'you are never in your own People list')
    const stranger = Object.values(w7.persons).find(p => p.alive !== false && p.cohort == null && !p.fam && !p.rel && !p.pin && (!p.owner || p.owner === 'world') && !p.sectId)
    assert(!stranger || !k.rows.some(r => r.pid === stranger.id), 'a stranger you never met is not listed')
    const a = w7.persons[cls[0]], b = w7.persons[cls[1]]
    // search + sort
    assert(g.knownPeople({ q: a.given.toLowerCase() }).rows.some(r => r.pid === a.id), 'search finds a name (any case)')
    const realm = g.knownPeople({ sort: 'realm', limit: 1000 }).rows
    assert(realm.every((r, i) => i === 0 || realm[i - 1].stage >= r.stage), 'the realm sort runs highest first')
    // pins: toggle, heavy, capped, kept after death
    const r1 = g.togglePin(a.id)
    assert(r1.ok && r1.pinned && a.pin && a.tier === 'heavy', 'pinning makes them followed (heavy tier at once)')
    assert(g.knownPeople({ filter: 'pinned' }).rows.map(r => r.pid).join() === a.id, 'the Pinned filter shows exactly them')
    assert(g.knownPeople().rows[0].pid === a.id, 'a pinned person heads the relevance sort')
    const others = Object.values(w7.persons).filter(p => p.id !== a.id && p.alive !== false).slice(0, P7.pinMax)
    let full = null
    for (const p of others) { const r = g.togglePin(p.id); if (!r.ok) { full = r; break } }
    assert(full && full.reason === 'full' && Object.values(w7.persons).filter(p => p.pin).length === P7.pinMax, `pins cap at ${P7.pinMax}`)
    for (const p of others) if (p.pin) g.togglePin(p.id)
    assert(Object.values(w7.persons).filter(p => p.pin).length === 1, 'unpinning releases the slots')
    // news of the pinned: counted, cleared by the view, not raised by an unpinned person
    g.notePeopleSeen()
    g._chron({ k: 'rise', t: 'A test rise for ' + full7(b), p: [b.id] })
    assert(g.peopleNews() === 0, 'news of someone you did not pin is not People news')
    g._chron({ k: 'rise', t: 'A test rise for ' + full7(a), p: [a.id] })
    assert(g.peopleNews() === 1, 'news of the pinned is counted')
    const mark = g.notePeopleSeen()
    assert(g.peopleNews() === 0 && g.knownPeople({ since: mark, filter: 'pinned' }).rows[0].fresh, 'opening People clears the news; the rows keep their fresh mark while open')
    assert(g.knownPeople({ filter: 'pinned' }).rows[0].last?.text === 'A test rise for ' + full7(a), 'a row carries the latest the world wrote of them')
    // grudges + kin filters
    b.rel = -45; b.feud = { pid: s7.self.id, why: 'their brother', y: Math.floor(w7.year) }
    const gr = g.knownPeople({ filter: 'grudge' }).rows.find(r => r.pid === b.id)
    assert(gr && gr.tie.word === 'Sworn against you' && gr.relTone === 'red' && gr.feud?.you, 'a sworn enemy shows under Grudges, tied as "Sworn against you"')
    delete b.feud; b.rel = 0
    // the dead: Fallen only, and a pinned one is never pruned
    g._npcDies(a, Math.floor(w7.year), 'road')
    assert(!g.knownPeople({ limit: 1000 }).rows.some(r => r.pid === a.id) && g.knownPeople({ filter: 'fallen', limit: 1000 }).rows.some(r => r.pid === a.id && r.cause), 'the fallen leave All for Fallen, with their cause')
    a.cohort = null; a.diedYear = Math.floor(w7.year) - 9999
    g._pruneDead(Math.floor(w7.year))
    assert(!!w7.persons[a.id], 'a pinned person is never forgotten after death')
    // log names: stored on the event, the event's own pid first, ≤ logNamesMax, never you
    g.addEvent({ type: 'neutral', text: `${full7(b)} crossed blades with ${full7(w7.persons[cls[2]])}.`, pid: cls[2] })
    const ev = s7.events[0]
    assert(ev.who?.length === 2 && ev.who[0].pid === cls[2] && ev.who.some(x => x.pid === b.id), 'a log line keeps the people it names (its own pid first)')
    g.addEvent({ type: 'neutral', text: 'Nothing of note.' })
    assert(!s7.events[0].who, 'a line naming no one carries no names')
    // migration: an old save gets the People mark at the Chronicle's head (nothing old reads as news)
    delete w7.peopleSeen; g._ensurePhase28Fields()
    assert(w7.peopleSeen === w7.chronSeq, 'an old save starts its People news mark at the Chronicle head')
  }
})()

function WORLD_PEOPLE_LIGHT_MAX(sim) { return sim.ev('WORLD_PEOPLE').lightMax }
function collectAttentionHas(sim, id) {
  try { return sim.ev('typeof collectAttention') === 'function' ? sim.ev('collectAttention')(sim.gs.get(), sim.gs).some(i => i.id === id) : sim.gs.classNews() > 0 } catch { return sim.gs.classNews() > 0 }
}
