// Scenario checks — Phase 46 Lineage Sects, Reincarnation Continuity & Bloodline Qi (docs/systems/lineage-sect.md).
// Pins the rules: ancestral catch-up is gone and Bloodline Quality raises Qi/s; a founded sect is inherited by a
// branch head on death and lives on as a world sect (`kind: 'lineage'`, global caps, never auto-dissolves, ≥1 hall);
// the world sim ages leaders out; and at Core Formation the old sect offers you a place (join / decline, once a life).
// Run: npm run checks (all) · node scripts/sim/checks/lineage.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

const mk = async (seed) => { const sim = await createSim({ seed }); await sim.boot(0); return sim }

;(async () => {
  const sim0 = await mk(46)
  const CF = sim0.ev("CULTIVATION_STAGES.findIndex(x => x.realm === 'Core Formation')")
  const CAP = sim0.ev('SECT_BUILDING_MAX_LEVEL')
  const HALLS = sim0.ev('SECT_HALL_LEVELS.length')

  const mkLineage = (gs, opts = {}) => {   // a lineage record, as 46b would mint
    const W = gs.get().world.sects
    const rec = { id: 'ws' + (W.nextId++), defId: null, kind: 'lineage', origin: 'inherited', name: opts.name || 'Azure Peak',
      tier: 3, temper: 'stoic', leader: opts.leader || 'Elder Gao', buildings: opts.buildings || { qi_library: 2 },
      hallLevel: opts.hallLevel || 2, maxBuildingLevel: CAP, maxHall: HALLS, disciples: opts.disciples ?? 12,
      stance: 70, deeds: [], sworn: false, bornYear: opts.bornYear || 40, lastRaisedYear: 0, alive: true,
      lineageOf: 'p1', founderName: opts.founderName || 'Lin', leaderSince: opts.leaderSince || 40, lastLost: null }
    W.list.push(rec); return rec
  }

  // ── 1.20a: no catch-up; Bloodline Quality raises Qi/s ──
  { const gs = sim0.gs, s = gs.get()
    s.bloodlineQuality = 0; gs._recalc(); const low = gs.get().derived.qiPerSecond
    s.bloodlineQuality = 100; gs._recalc()
    const coef = sim0.ev('BLOODLINE_QI_COEF')
    assert(Math.abs(gs.get().derived.qiPerSecond / low - (1 + 100 * coef)) < 1e-6, `BQ 100 scales Qi/s by 1 + 100×coef (×${(gs.get().derived.qiPerSecond / low).toFixed(4)})`)
    assert(gs.get().derived.catchUp === undefined && gs.get().derived.catchUpUntil === undefined, 'no catch-up keys on derived')
    s.bloodlineQuality = 0
  }

  // ── 1.20b: a founded sect is inherited by a branch head as a world sect ──
  {
    const sim = await mk(461); const gs = sim.gs, s = gs.get(), o = s.ownSect
    o.founded = true; o.name = 'Azure Peak'; o.hallLevel = 2
    o.buildings = { qi_library: 2, training_ground: 1 }
    o.disciples = [
      { id: 'd1', name: 'Elder Gao', talent: 3, level: 6, xp: 0, branchId: 'b1', role: 'head', kin: false, personality: 'stoic' },
      { id: 'd2', name: 'Elder Yun', talent: 4, level: 5, xp: 0, branchId: 'b2', role: 'head', kin: false, personality: 'arrogant' },
      { id: 'd3', name: 'Lin', talent: 2, level: 3, xp: 0, branchId: 'b1', role: 'disciple', kin: false, personality: 'niceguy' },
    ]
    o.branches = [
      { id: 'b1', name: 'Eastern Branch', headId: 'd1', since: 0, loyalty: 90, rivalId: 'b2', heat: 0, wins: 0, losses: 0, tourneyWins: 0 },
      { id: 'b2', name: 'Western Branch', headId: 'd2', since: 0, loyalty: 55, rivalId: 'b1', heat: 0, wins: 0, losses: 0, tourneyWins: 0 },
    ]
    const inh = gs._lineageInheritor(o)
    assert(inh && inh.name === 'Elder Gao', `the highest-loyalty branch head inherits (${inh?.name}, loyalty 90 vs 55)`)
    const before = s.world.sects.list.length
    gs.passTheMantle()
    const w = gs.get().world, rec = w.sects.list.find(r => r.kind === 'lineage')
    assert(rec && rec.name === 'Azure Peak', `the founded sect lives on as a lineage record (${rec?.name})`)
    assert(w.sects.list.length === before + 1, 'exactly one record was minted')
    assert(rec.leader === 'Elder Gao' && rec.temper === 'stoic', `the branch head takes the seat (${rec.leader}, ${rec.temper})`)
    assert(rec.hallLevel === 2 && rec.buildings.qi_library === 2 && rec.buildings.training_ground === 1, 'its halls carry over intact')
    assert(rec.kind === 'lineage' && rec.origin === 'inherited' && rec.defId === null, 'it is a lineage record with no SECTS def')
    assert(rec.stance >= 60, `it still remembers your line founded it (stance ${rec.stance})`)
    assert(rec.maxBuildingLevel === CAP && rec.maxHall === HALLS, 'a player-founded line sect reaches the global caps')
    assert(w.persons[rec.lineageOf] === undefined || w.persons[rec.lineageOf], 'it records who founded it')
    const clan = w.clans[w.playerClanId]
    if (clan?.sect) assert(clan.sect.worldSectId === rec.id, 'the clan claim points at the world record')
  }

  // ── 1.20b: an orphan founder's sect is kept too ──
  {
    const sim = await mk(462); const gs = sim.gs, s = gs.get()
    s.world.playerClanId = null; s.world.playerLineId = null   // an orphan life
    s.ownSect.founded = true; s.ownSect.name = 'Nameless Peak'; s.ownSect.hallLevel = 1
    gs.passTheMantle()
    const rec = gs.get().world.sects.list.find(r => r.kind === 'lineage')
    assert(rec && rec.name === 'Nameless Peak', 'an orphan founder’s sect still lives on (no clan needed)')
  }

  // ── 1.20b: a lineage sect never auto-dissolves and keeps ≥1 hall ──
  {
    const sim = await mk(463); const gs = sim.gs
    const rec = mkLineage(gs, { buildings: { qi_library: 1 }, hallLevel: 1, disciples: 0 })
    gs.get().world.sects.dissolveBelow = 6
    assert(gs._wsSetback(rec) === null, 'a setback never takes its last hall')
    for (let i = 0; i < 400; i++) gs._tickWorldSects()
    assert(rec.alive, 'a lineage sect never breaks apart on its own (400 years)')
    assert(gs._wsLevels(rec) >= 1, 'it still holds at least one hall')
  }

  // ── 1.20c: the world buries its masters over the years ──
  {
    const sim = await mk(464); const gs = sim.gs
    const rec = mkLineage(gs, { leader: 'Old Master', leaderSince: Math.floor(gs.get().world.year) - 200 })
    const before = rec.leader
    sim.ev('globalThis.__r = Math.random; Math.random = () => 0')
    const next = gs._wsCheckSuccession(rec, Math.floor(gs.get().world.year))
    sim.ev('Math.random = globalThis.__r')
    assert(next && next !== before && rec.leader === next, `a long-seated master is succeeded (${before} → ${rec.leader})`)
    assert(rec.leaderSince === Math.floor(gs.get().world.year), 'the successor’s tenure starts now')
    // Phase 28 (4.2): the old master dies in the seat or retires (a hash decides); the senior elder takes it.
    assert(gs.get().world.sects.chronicle.some(c => c.sectId === rec.id && /buries its master|retires into seclusion/.test(c.text)), 'the world chronicle records it')
    const np = gs.get().world.persons[rec.leaderId]
    assert(np && np.alive !== false && sim.ev('Persons').fullName(np) === rec.leader && np.sectRole === 'master', 'the new master is a real person of the sect (Phase 28)')
  }

  // ── 1.20c: migration — a pre-46 dormant clan sect becomes a living record ──
  {
    const sim = await mk(465); const gs = sim.gs, s = gs.get()
    const clan = s.world.clans[s.world.playerClanId]
    clan.sect = { name: 'Old Peak', hallLevel: 2, buildings: { qi_library: 1 }, disciples: [{ id: 'x' }], inheritedYear: 10 }
    gs._recalc()
    const rec = s.world.sects.list.find(r => r.kind === 'lineage' && r.name === 'Old Peak')
    assert(rec && rec.alive, 'a pre-46 clan sect is migrated into a living world sect')
    assert(clan.sect.worldSectId === rec.id, 'the migration is guarded (runs once)')
    const n = s.world.sects.list.length
    gs._recalc()
    assert(s.world.sects.list.length === n, 'a second recalc does not mint a duplicate')
  }

  // ── 1.20d: the old sect recruits you at Core Formation ──
  {
    const sim = await mk(466); const gs = sim.gs, s = gs.get()
    const rec = mkLineage(gs, { name: 'Azure Peak', leader: 'Elder Gao' })
    s.stageIndex = CF - 1; s.sect.id = null; s.ownSect.founded = false
    delete s.lineageOffer; gs._recalc()
    assert(gs.lineageRecruitInfo() === null, 'no offer before Core Formation')
    s.stageIndex = CF; gs._recalc()
    const info = gs.lineageRecruitInfo()
    assert(info && info.name === 'Azure Peak' && info.leader === 'Elder Gao', `the offer names the sect + its current master (${info?.name} / ${info?.leader})`)
    assert(info.rank === sim.ev('SECT_RANKS')[0].name, 'the offer is for the lowest rank')
    const j = gs.answerLineageRecruit(true)
    assert(j.ok && j.joined, 'joining succeeds')
    assert(s.sect.id === rec.id && s.sect.rank === 0, 'you enter the old sect as an Outer Disciple')
    assert(gs._wsMine() === rec, 'the membership resolves to the lineage record (by id, no defId)')
    const def = gs._sectDef()
    assert(def && def.name === 'Azure Peak' && def.lineage, `a SECTS-shaped def is synthesised (${def?.name})`)
    assert(gs.sectBlessing() && gs.sectBlessing().recId === rec.id, 'the blessing system works for a lineage membership')
    assert(gs.lineageRecruitInfo() === null, 'the offer is consumed once answered')
  }

  // ── 1.20d: declining costs nothing and is remembered for the life ──
  {
    const sim = await mk(467); const gs = sim.gs, s = gs.get()
    mkLineage(gs, { name: 'Azure Peak' })
    s.stageIndex = CF; gs._recalc()
    assert(gs.lineageRecruitInfo(), 'the offer waits')
    const d = gs.answerLineageRecruit(false)
    assert(d.ok && !d.joined && !s.sect.id, 'declining leaves you sect-less')
    assert(gs.lineageRecruitInfo() === null, 'and the offer will not come again this life')
    // a new life may be asked again (the offer state is per-life)
    s.lineageOffer = undefined; s.stageIndex = CF; gs._recalc()
    assert(gs.lineageRecruitInfo() !== null, 'a later life can be asked again')
  }

  // ── 1.20d: no offer if you already belong to (or founded) a sect ──
  {
    const sim = await mk(468); const gs = sim.gs, s = gs.get()
    mkLineage(gs, {})
    s.stageIndex = CF; s.sect.id = sim.ev('SECTS')[0].id; gs._recalc()
    assert(gs.lineageRecruitInfo() === null, 'no offer while you belong to another sect')
  }
})()
