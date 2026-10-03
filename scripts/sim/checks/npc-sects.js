// Scenario checks — Phase 43b Living Sects: the world's sect registry + growth sim + world-sect events
// (docs/systems/npc-sects.md). Pins the rules: the seed (5 joinable sects, the late one strongest; rivals that may
// hold high halls; RNG-free + deterministic); migration (an old save gains the registry; old seceded factions become
// splinter sects); growth never passes a sect's own caps, joinable sects never break apart, births refill the rivals;
// the sim runs only on the game-year tick; a world event waits on you (never expires, never answered for you), its
// choices charge/lock/roll/remember exactly as shown; wars bind a real sect (sworn allies never) and it remembers;
// joining/leaving moves stance; a seceding branch becomes a splinter sect with a grudge; the ledger ranks by Might.
// 43c: war odds read the bound sect's Might (shown = rolled, own + member), wins burn a hall, losses raise one within caps.
// Run: npm run checks (all) · node scripts/sim/checks/npc-sects.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 43 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get()
  const WS = sim.ev('WORLD_SECTS')
  const EVENTS = sim.ev('WORLD_SECT_EVENTS')
  const might = r => sim.ev('worldSectMight')(r)
  const W = () => s.world.sects
  const rec = defId => W().list.find(r => r.defId === defId)

  // ── Seed ──
  assert(W() && Array.isArray(W().list), 'a new save has s.world.sects')
  const joinable = W().list.filter(r => r.kind === 'joinable')
  assert(joinable.length === 5, `the five joinable sects are records (${joinable.length})`)
  assert(W().list.filter(r => r.kind === 'rival').length === 3, 'three rival sects are seeded')
  const hd = rec('heaven_defying')
  assert(joinable.every(r => r === hd || might(r) < might(hd)), 'the late joinable sect (Heaven Defying) is the strongest joinable one')
  assert(['azure_sword', 'myriad_herb'].every(id => might(rec(id)) < 80), 'the early joinable sects are weakish (Might < 80)')
  assert(W().list.some(r => r.kind === 'rival' && Object.values(r.buildings).some(v => v >= 3)), 'a rival may hold a level-3 hall')
  assert(new Set(W().list.map(r => r.maxBuildingLevel)).size > 1, 'max building levels vary between sects')
  const a = JSON.stringify(gs._seedWorldSects(s.world)), b = JSON.stringify(gs._seedWorldSects(s.world))
  assert(a === b, 'seeding is deterministic (hash-seeded, no Math.random)')

  // ── Migration ──
  delete s.world.sects
  s.world.enemies = [{ kind: 'sect', name: 'the Lin Wei faction', why: 'left your sect in anger', year: 3 }]
  gs._recalc()
  const spl = W().list.find(r => r.kind === 'splinter')
  assert(W().list.length === 9 && spl, 'an old save gains the registry, and an old seceded faction becomes a splinter sect')
  assert(spl && spl.leader === 'Lin Wei' && spl.stance <= -60, 'the splinter is led by the head who left, and is a sworn foe')
  s.world.enemies = []

  // ── Growth sim: within caps, joinables never fall, births refill ──
  for (let i = 0; i < 600; i++) gs._tickWorldSects()
  const live = W().list.filter(r => r.alive)
  assert(live.every(r => Object.values(r.buildings).every(v => v >= 1 && v <= r.maxBuildingLevel) && r.hallLevel <= r.maxHall),
    'after 600 years no sect is past its own caps')
  assert(live.filter(r => r.kind === 'joinable').length === 5, 'the joinable sects never break apart')
  assert(live.filter(r => r.kind !== 'joinable').length >= WS.rivalsTarget - 1, `births keep the rivals near the target (${live.filter(r => r.kind !== 'joinable').length})`)
  assert(W().chronicle.length > 0 && W().chronicle.length <= WS.chronicleMax, 'the world keeps a capped chronicle')
  assert(live.some(r => r.lastRaisedYear > 0), 'sects raise halls over time')
  assert(live.every(r => r.disciples <= WS.discipleCaps[r.hallLevel - 1] + 1), 'disciple counts stay under their Sect Hall\'s cap')

  // ── Only the game-year tick runs the sim ──
  s.world.year = Math.floor(s.world.year) + 0.1
  const snap = JSON.stringify(W().list)
  gs.tick(0.5)
  assert(JSON.stringify(W().list) === snap, 'a tick that does not cross a game year leaves the world alone')

  // ── A world event waits on you ──
  const az = rec('azure_sword')
  az.stance = 0
  W().event = { id: 'envoy', sectId: az.id, year: Math.floor(s.world.year) }
  for (let i = 0; i < 50; i++) gs._tickWorldSects()
  assert(W().event?.id === 'envoy', 'a waiting event never expires and is never answered for you (50 years on)')
  const info = gs.worldSectEventInfo()
  assert(info && info.choices.length === 3 && info.title.includes(az.name), 'the event names its sect and offers three choices')
  assert(info.choices[1].odds > 0 && info.choices[1].odds < 1 && info.choices[1].vsMight, 'a "Demand tribute" choice shows its real odds (your Might against theirs)')
  const st0 = s.spiritStones, stance0 = az.stance
  const r0 = gs.answerWorldSectEvent(0)
  assert(r0.ok && s.spiritStones === st0 + 25 * az.tier, 'receiving the envoys pays their gift (25 × tier)')
  assert(az.stance === stance0 + 20 || az.stance === stance0 + 15, `their stance warms by the choice's amount (${az.stance - stance0})`)
  assert(az.deeds.at(-1)?.text.includes('receive them as friends'), 'the sect remembers what you chose')
  assert(W().event === null && gs.worldSectEventInfo() === null, 'the event is cleared once answered')

  // a choice you cannot afford is locked, and refused without charge
  const tp = rec('thunder_palace'); tp.stance = 0
  W().event = { id: 'hall_raised', sectId: tp.id, year: 1, buildingId: 'training_ground' }
  s.spiritStones = 5
  const giftInfo = gs.worldSectEventInfo().choices[0]
  assert(giftInfo.cost === 20 * tp.tier && giftInfo.lock, 'a gift you cannot afford shows its cost and a lock reason')
  assert(gs.answerWorldSectEvent(0).reason === 'stones' && s.spiritStones === 5 && W().event, 'it is refused without charge, and the event still waits')
  // a failed spy: caught, hurt, a sworn grudge — and you never die of it
  s.health = 5
  const M = sim.ev('Math'), seeded = M.random
  M.random = () => 0.999
  const spy = gs.answerWorldSectEvent(1)
  M.random = seeded
  assert(spy.ok && !spy.success && tp.stance < 0 && s.health >= 1, `a failed spy turns them hostile and costs health, never your life (stance ${tp.stance}, health ${s.health})`)
  s.health = 100; s.spiritStones = 1e5

  // stance gates which events can come: an insult only from a hostile sect, an alliance only from a friendly one
  const insult = EVENTS.find(e => e.id === 'insult'), alliance = EVENTS.find(e => e.id === 'alliance')
  az.stance = 50
  assert(!gs._wsEligible(insult, 1).includes(az), 'a cordial sect does not insult you')
  assert(gs._wsEligible(alliance, 1).includes(az), 'a friendly sect may propose an alliance')
  az.stance = -50
  assert(gs._wsEligible(insult, 1).includes(az) && !gs._wsEligible(alliance, 1).includes(az), 'a hostile sect may insult you, never ally')

  // ── Wars bind a real sect; sworn allies never come ──
  for (const r of W().list) r.sworn = true
  const foe = W().list.find(r => r.kind === 'rival'); foe.sworn = false
  s.stageIndex = 20; s.ownSect.founded = true; s.ownSect.name = 'Test Peak'; s.sect.id = null
  gs._recalc()
  const w = s.sectWar
  w.side = 'own'; w.phase = 'none'; w.nextWarAt = sim.ev('Date.now()') - 1000
  const fs0 = foe.stance
  gs._advanceSectWarStep()
  assert(w.phase === 'scouting' && w.enemyId === foe.id && w.enemyName === foe.name, 'a declared war binds a real sect record (the only one not sworn to you)')
  assert(foe.stance === fs0 + WS.stanceWarDeclared && foe.deeds.at(-1).text.includes('marched'), 'the sect that marches on you remembers it')
  const d0 = foe.disciples
  M.random = () => 0.0001
  gs._resolveSectWar()
  M.random = seeded
  assert(foe.deeds.at(-1).text.includes('lost a war') && foe.disciples < d0, 'a war it loses to you costs it disciples, and it remembers')
  for (const r of W().list) r.sworn = false

  // ── Ledger: ranked by Might, your founded sect among them ──
  const L = gs.worldSectsInfo()
  assert(L.rows.some(r => r.own && r.name === 'Test Peak'), 'a founder sees their own sect in the ledger')
  assert(L.rows.every((r, i) => i === 0 || L.rows[i - 1].might >= r.might), 'the ledger is ranked by Might')
  assert(L.rows.every(r => r.band && (r.own || r.stanceLabel)), 'every row names its strength band (and stance)')

  // ── A seceding branch becomes a splinter sect ──
  s.ownSect.disciples = [{ id: 'h1', name: 'Gao Ren', talent: 3, level: 2, xp: 0 }, { id: 'h2', name: 'Su Yan', talent: 2, level: 1, xp: 0 }]
  gs._recalc()
  const br = gs.appointBranchHead('h1').branch
  s.ownSect.disciples.find(d => d.id === 'h2').branchId = br.id
  gs._branchSecede(br, 'you wronged me')
  const gao = W().list.find(r => r.leader === 'Gao Ren')
  assert(gao && gao.kind === 'splinter' && gao.stance === WS.stanceSeceded && gao.disciples === 2, 'the seceded branch is now a splinter sect, led by its head, with a grudge')
  assert(s.world.enemies.some(e => e.name === `the ${gao.name}`), 'your enemies list names the splinter sect')
  assert(gs._wsEligible(EVENTS.find(e => e.id === 'splinter_lure'), 1).includes(gao), 'a splinter sect may try to lure your disciples away')

  // ── Joining / leaving moves stance ──
  s.ownSect.founded = false; s.ownSect.disciples = []; s.ownSect.branches = []
  gs._recalc()
  const my = rec('myriad_herb'); my.stance = 0
  gs.joinSect('myriad_herb')
  assert(my.stance === WS.stanceJoin, 'the sect that takes you in warms to you')
  assert(gs.worldSectsInfo().rows.find(r => r.id === my.id).mine, 'the ledger marks your own sect')
  assert(!gs._wsEligible(EVENTS.find(e => e.id === 'envoy'), 1).includes(my), 'your own sect sends you no envoys')
  gs.leaveSect()
  assert(my.stance === WS.stanceJoin + WS.stanceLeave && my.deeds.at(-1).text === 'you left them', 'leaving cools it, and it remembers')
})()

// ── Phase 43c: wars read the bound sect's Might (npc-sects.md → "43c") ──
// The shown odds equal a Monte Carlo of the real resolvers with a bound foe; a stronger foe means worse odds; no foe
// (or at peace) = an even match (the pre-43c roll); a won war burns one of their halls a level, a lost one raises one
// (never past the sect's caps); a member war reads your joined sect's own Might; the Last war card's data is filled.
;(async () => {
  const sim = await createSim({ seed: 431 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get(), W = () => s.world.sects, WS = sim.ev('WORLD_SECTS')
  const might = r => sim.ev('worldSectMight')(r)
  const montecarlo = (resolve, reset, n = 4000) => {
    let wins = 0
    for (let i = 0; i < n; i++) { reset(); const v = s.sectWar.warVictories; resolve(); if (s.sectWar.warVictories > v) wins++ }
    return wins / n
  }
  s.stageIndex = 10; s.spiritStones = 1e7
  s.ownSect.founded = true; s.ownSect.name = 'Might Peak'; s.sect.id = null
  gs._recalc()
  const w = s.sectWar
  const strong = W().list.filter(r => r.alive).sort((a, b) => might(b) - might(a))[0]
  const weak = W().list.filter(r => r.alive).sort((a, b) => might(a) - might(b))[0]
  const bind = r => { w.phase = 'preparing'; w.enemyId = r.id; w.enemyName = r.name; w.reinforced = false; w.allyId = null }
  const snap = r => JSON.stringify({ b: r.buildings, h: r.hallLevel, d: r.disciples, st: r.stance, de: r.deeds })
  const restore = (r, j) => { const o = JSON.parse(j); r.buildings = o.b; r.hallLevel = o.h; r.disciples = o.d; r.stance = o.st; r.deeds = o.de; r.alive = true }

  // Even match without a foe, or at peace
  w.phase = 'preparing'; w.enemyId = null; w.enemyName = 'No Such Sect'
  let o = gs.sectWarOdds()
  assert(o.vs.ratio === 1 && !o.vs.foe, 'no bound sect → an even match (ratio 1, the pre-43c roll)')
  bind(strong); w.phase = 'none'
  assert(gs.sectWarOdds().vs.ratio === 1, 'at peace the odds read no foe (the next attacker is not known yet)')

  // A stronger foe is visibly stronger, and the shown odds are the rolled odds
  bind(strong); const oS = gs.sectWarOdds()
  bind(weak);   const oW = gs.sectWarOdds()
  assert(oS.vs.foe?.id === strong.id && oS.vs.them === might(strong) && oS.vs.us === gs.playerMight(), `the odds name the bound foe and both Mights (${oS.vs.them} vs ${oS.vs.us})`)
  assert(oS.chance < oW.chance, `a stronger foe means worse odds (${(oS.chance * 100).toFixed(1)}% vs ${(oW.chance * 100).toFixed(1)}%)`)
  assert(oS.vs.ratio <= WS.war.ratioMax && oW.vs.ratio >= WS.war.ratioMin, 'the Might ratio stays inside its clamp')
  for (const [r, label] of [[strong, 'strong'], [weak, 'weak']]) {
    const j = snap(r)
    const reset = () => { restore(r, j); bind(r); s.spiritStones = 1e7; s.health = 100; w.arrayDamagedUntil = 0 }
    reset(); const shown = gs.sectWarOdds().chance
    const mc = montecarlo(() => gs._resolveSectWar(), reset)
    assert(Math.abs(mc - shown) < 0.03, `own war vs the ${label} foe: shown ${(shown * 100).toFixed(1)}% vs rolled ${(mc * 100).toFixed(1)}%`)
    restore(r, j)
  }

  // Outcomes change their mountain
  const M = sim.ctx.Math, rnd = M.random   // the sandbox's own Math (breakdowns.js does the same)
  const foe = W().list.find(r => r.alive && r.kind === 'rival' && sim.ev('SECT_BUILDINGS').some(b => (r.buildings[b.id] || 0) > 0 && (r.buildings[b.id] || 0) < r.maxBuildingLevel)) || strong
  const j0 = snap(foe)
  bind(foe); s.health = 100
  let lv0 = gs._wsLevels(foe); const m0 = might(foe)
  M.random = () => 0          // win every roll
  gs._resolveSectWar()
  M.random = rnd
  assert(w.lastResult.win && gs._wsLevels(foe) === lv0 - 1 && w.lastResult.foeHall?.burned, `a won war burns one of their halls a level (${lv0} → ${gs._wsLevels(foe)} levels)`)
  assert(w.lastResult.odds > 0 && w.lastResult.foeMight === m0, 'the Last war card keeps the odds and the Might of the foe you fought')
  assert(/burned/.test(foe.deeds.at(-1).text), 'they remember the hall that burned')
  restore(foe, j0); bind(foe); s.health = 100; s.spiritStones = 1e7
  lv0 = gs._wsLevels(foe) + foe.hallLevel
  const st0 = foe.stance
  M.random = () => 0.999      // lose every roll
  gs._resolveSectWar()
  M.random = rnd
  assert(!w.lastResult.win && gs._wsLevels(foe) + foe.hallLevel === lv0 + 1 && w.lastResult.foeHall?.raised, 'a lost war lets them raise a hall on your spoils')
  assert(foe.stance === Math.max(-100, st0 + WS.stanceWarBeatYou), 'a foe that beat you holds you cheaper')
  // At its caps, a victory raises nothing
  for (const b of sim.ev('SECT_BUILDINGS')) foe.buildings[b.id] = foe.maxBuildingLevel
  foe.hallLevel = foe.maxHall
  bind(foe); s.health = 100; s.spiritStones = 1e7
  M.random = () => 0.999; gs._resolveSectWar(); M.random = rnd
  assert(sim.ev('SECT_BUILDINGS').every(b => foe.buildings[b.id] <= foe.maxBuildingLevel) && foe.hallLevel <= foe.maxHall && !w.lastResult.foeHall, 'a victorious foe never grows past its own caps')
  restore(foe, j0)

  // A member war reads your joined sect's own Might
  const sim2 = await createSim({ seed: 432 }); await sim2.boot(0); const gs2 = sim2.gs, m = gs2.get()
  m.stageIndex = 20; m.spiritStones = 1e7
  gs2.joinSect('azure_sword'); m.sect.rank = 2; gs2._recalc()
  const mw = m.sectWar, mine = gs2._wsMine()
  const foe2 = m.world.sects.list.filter(r => r.alive && r !== mine).sort((a, b) => sim2.ev('worldSectMight')(b) - sim2.ev('worldSectMight')(a))[0]
  const j2 = JSON.stringify({ b: foe2.buildings, h: foe2.hallLevel, d: foe2.disciples, st: foe2.stance, de: foe2.deeds })
  const jm = JSON.stringify(mine.buildings)   // 43d: a lost member war raids your own sect — restore it each round
  const mreset = () => { const q = JSON.parse(j2); mine.buildings = JSON.parse(jm); mine.lastLost = null; m.world.sects.event = null; Object.assign(foe2, { buildings: q.b, hallLevel: q.h, disciples: q.d, stance: q.st, deeds: q.de, alive: true })
    m.spiritStones = 1e7; m.health = 100; mw.phase = 'preparing'; mw.enemyId = foe2.id; mw.enemyName = foe2.name; mw.answered = true; mw.chestStones = 0; mw.pillsGiven = 0; mw.beastId = null; mw.buffSuppressedUntil = 0 }
  mreset()
  const mo = gs2.sectWarOdds()
  assert(mo.vs.us === sim2.ev('worldSectMight')(mine) && mo.vs.them === sim2.ev('worldSectMight')(foe2), `member: your side is your sect's Might (${mo.vs.us}) against theirs (${mo.vs.them})`)
  let mw2 = 0; for (let i = 0; i < 4000; i++) { mreset(); const v = mw.warVictories; gs2._resolveMemberWar(); if (mw.warVictories > v) mw2++ }
  assert(Math.abs(mw2 / 4000 - mo.chance) < 0.03, `member war vs a real sect: shown ${(mo.chance * 100).toFixed(1)}% vs rolled ${(mw2 / 40).toFixed(1)}%`)
})().catch(e => { console.log('FAIL crashed (43c):', e.stack); process.exitCode = 1 })
