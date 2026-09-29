// Scenario checks — docs/systems/combat.md (Phase 35 / A6-1): beast battles. Odds from realm/Might/wounds, neutral play
// keeps the shown odds (Monte Carlo), locks (busy / wounded), wounds per stance (Slay can kill → cause beast_hunt, Drive
// never below 1), the won-battle end choice (finish → loot + karma by nature + cub; spare → a grateful/vengeful return on
// the next sighting; bind → Lv.2 companion for a talisman), retreat, habits learned after one fight, save migration, and
// the shared one-fight gate. Run: npm run checks · node scripts/sim/checks/combat.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

async function setup(seed, stage, typeId, extra = {}) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100
  s.root = { ...s.root, mult: 1 }; s.personality = { ...(s.personality || {}), id: 'stoic', name: 'Stoic' }
  s.beastEncounters = [{ id: 'e1', typeId, traits: ['soul_bond', 'qi_devour', 'spirit_nose'], seenAt: 0, ...extra }]
  gs._recalc()
  return { sim, gs, s }
}
// Play a battle out: 'win' forces every exchange won, 'lose' every one lost.
function fight(sim, gs, how) {
  rng(sim, how === 'win' ? 0 : 0.999)
  let r
  for (let i = 0; i < 20; i++) { r = gs.fightExchange('press'); if (!r.ok || r.done || r.over) break }
  unrng(sim)
  return r
}

;(async () => {
  // ── Odds ──
  { const pct = async (stage, type) => { const { gs } = await setup(1, stage, type); return gs.beastFightPreview('e1').chance }
    const fox0 = await pct(0, 'spirit_fox'), fox1 = await pct(1, 'spirit_fox')
    const tig13 = await pct(13, 'white_tiger'), tig14 = await pct(14, 'white_tiger')
    const gd20 = await pct(20, 'golden_dragon'), gd22 = await pct(22, 'golden_dragon')
    assert(fox0 > 0.35 && fox0 < 0.55 && fox1 > 0.62, `Spirit Fox: ${(fox0 * 100).toFixed(0)}% at Mortal, ${(fox1 * 100).toFixed(0)}% one stage up`)
    assert(tig13 < 0.35 && tig14 > 0.5, `White Tiger: ${(tig13 * 100).toFixed(0)}% at its gate, ${(tig14 * 100).toFixed(0)}% one stage up`)
    assert(gd20 < 0.15 && gd22 > 0.35, `Golden Dragon: ${(gd20 * 100).toFixed(0)}% at stage 20, ${(gd22 * 100).toFixed(0)}% at 22`) }
  { const { gs, s } = await setup(2, 5, 'spirit_fox')
    const a = gs.beastFightPreview('e1').chance; s.health = 20
    const b = gs.beastFightPreview('e1')
    assert(b.chance < a && b.you.parts.some(p => /Wounded/.test(p.label)), `wounds weaken you (${(a * 100).toFixed(0)}% → ${(b.chance * 100).toFixed(0)}% at Health 20)`)
    const sum = b.it.parts.reduce((x, p) => x + p.value, 0)
    assert(sum === b.it.total && b.you.parts.reduce((x, p) => x + p.value, 0) === b.you.total, 'breakdown parts add up to both powers') }
  { const { gs } = await setup(3, 16, 'black_tortoise', { traits: ['iron_skin', 'swift', 'soul_bond'] })
    const { gs: g2 } = await setup(3, 16, 'black_tortoise')
    assert(gs.beastFightPreview('e1').it.total === g2.beastFightPreview('e1').it.total + BEAST_TRAIT_POWER_IRON(), 'Iron Skin makes it stronger') }
  { // Neutral play (a random tactic each exchange) keeps the shown match odds
    for (const [stage, type] of [[1, 'spirit_fox'], [13, 'white_tiger']]) {
      let wins = 0, shown = 0; const n = 400
      for (let i = 0; i < n; i++) {
        const { sim, gs } = await setup(1000 + i, stage, type); shown = gs.beastFightPreview('e1').chance
        gs.startBeastFight('e1', 'drive')
        let r; for (let k = 0; k < 20; k++) { r = gs.fightExchange(['press', 'guard', 'feint'][Math.floor(Math.random() * 3)]); if (r.done || r.over) break }
        if (r.over === 'won') wins++
      }
      const rate = wins / n
      assert(Math.abs(rate - shown) < 0.07, `${type} at stage ${stage}: neutral play wins ${(rate * 100).toFixed(0)}% vs ${(shown * 100).toFixed(0)}% shown (n=${n})`)
    } }

  // ── Locks ──
  { const { gs, s } = await setup(4, 5, 'spirit_fox')
    s.health = 10; assert(gs.beastFightPreview('e1').locked === 'wounded' && gs.startBeastFight('e1', 'slay').reason === 'wounded', 'too wounded to start below 15 Health')
    s.health = 100; assert(gs.startBeastFight('e1', 'nope').reason === 'bad_stance', 'stance must be slay or drive')
    assert(gs.startBeastFight('e1', 'slay').ok && gs.startBeastFight('e1', 'slay').reason === 'busy', 'one fight at a time')
    assert(gs.tameEncounteredBeast('e1').reason === 'fighting', 'cannot tame the beast you are fighting')
    const info = gs.fightInfo()
    assert(info.kind === 'beast' && info.to === BATTLE_TO_() && info.habitsKnown === false && info.habits === null && info.hint === null, 'first fight: habits unknown, odds against even habits') }

  // ── Wounds + death ──
  { const { sim, gs, s } = await setup(5, 20, 'golden_dragon')
    gs.startBeastFight('e1', 'drive'); s.health = 16
    const r = fight(sim, gs, 'lose')
    assert(r.done && r.outcome === 'lost' && s.health === 1, `Drive off: a lost battle never takes you below 1 Health (${s.health})`)
    assert(s.beastEncounters.some(e => e.id === 'e1'), 'a beast that beats you stays') }
  { const { sim, gs, s } = await setup(6, 20, 'golden_dragon')
    const pv = gs.beastFightPreview('e1')
    s.health = 40; assert(gs.beastFightPreview('e1').stance.slay.canDie && !gs.beastFightPreview('e1').stance.drive.canDie, `Slay vs a Golden Dragon at 40 Health is shown as deadly (worst −${pv.stance.slay.worst})`)
    gs.startBeastFight('e1', 'slay')
    const r = fight(sim, gs, 'lose')
    assert(r.done && r.outcome === 'died' && gs.get().interlude && gs.get().lastReincarnation?.cause === 'beast_hunt', 'Slay: a legendary beast can kill you (cause beast_hunt)') }
  { const { sim, gs, s } = await setup(7, 3, 'spirit_fox')
    gs.startBeastFight('e1', 'slay'); rng(sim, 0.999); gs.fightExchange('guard'); unrng(sim)
    const hp = s.health, w = gs.fightInfo().wound
    const r = gs.fightExchange('retreat')
    assert(r.done && r.retreated && s.health === hp - w && !s.family.fight && s.beastEncounters.length === 1, `retreat: a parting blow (−${w}), the beast stays`)
    assert(gs.bestiaryEntry('spirit_fox').habitsKnown, 'having traded blows, you know its habits') }

  // ── Winning + the end choice ──
  { const { sim, gs, s } = await setup(8, 14, 'qilin')
    gs.startBeastFight('e1', 'slay')
    const r = fight(sim, gs, 'win')
    assert(r.over === 'won' && s.family.fight?.over === 'won' && gs.fightExchange('press').reason === 'decide', 'a won battle waits for your choice')
    const ch = gs.beastFightChoices()
    assert(ch.ids.join() === 'finish,spare,bind' && ch.nature === 'benign', 'Slay win: finish / spare / bind')
    const k0 = s.karma, st0 = s.spiritStones, core0 = s.inventory.beast_core || 0
    rng(sim, 0.99); const f = gs.beastFightFinish('finish'); unrng(sim)
    assert(f.ok && s.karma === Math.max(0, k0 + BEAST_KARMA_('finish', 'benign')) && !s.family.fight && !s.beastEncounters.some(e => e.id === 'e1'), `slaying a qilin costs karma (${f.karma})`)
    assert(s.spiritStones > st0 && (s.inventory.beast_core || 0) > core0, `loot: ${JSON.stringify(f.loot)}`)
    const b = gs.bestiaryEntry('qilin'); assert(b.fought === 1 && b.won === 1 && b.slain === 1 && b.habitsKnown, 'bestiary records the kill') }
  { const { sim, gs, s } = await setup(9, 3, 'blood_python')
    gs.startBeastFight('e1', 'slay'); fight(sim, gs, 'win')
    const k0 = s.karma
    rng(sim, 0.0); const f = gs.beastFightFinish('finish'); unrng(sim)
    assert(s.karma === Math.min(100, k0 + 3) && f.cub && s.beastEncounters.some(e => e.mood === 'cub'), 'slaying a man-eater earns karma, and may leave a cub')
    const cubPv = gs.beastFightPreview(s.beastEncounters.find(e => e.mood === 'cub').id)
    assert(cubPv.it.parts.some(p => /cub/.test(p.label)), 'the cub is weaker') }
  { const { sim, gs, s } = await setup(10, 5, 'spirit_fox')
    s.karma = 80
    gs.startBeastFight('e1', 'drive'); fight(sim, gs, 'win')
    assert(gs.beastFightChoices().ids.join() === 'flee,bind', 'Drive win: let it flee / bind')
    rng(sim, 0.0); const f = gs.beastFightFinish('flee'); unrng(sim)
    assert(f.returning === 'grateful' && gs.bestiaryEntry('spirit_fox').returning === 'grateful', 'with good karma a spared beast returns grateful')
    // next sighting of its kind carries the mood
    s.stageIndex = 2                                        // only the fox can be sighted below stage 3
    const loc = sim.data.LOCATIONS[0]
    for (let i = 0; i < 400 && !s.beastEncounters.some(e => e.mood); i++) {
      s.beastEncounters = []
      s.expedition = { active: true, locationId: loc.id, endsAt: Date.now() - 1, pushed: false }
      gs.resolveExpedition()
    }
    const back = s.beastEncounters.find(e => e.mood)
    assert(back && back.mood === 'grateful' && gs.bestiaryEntry('spirit_fox').returning === null, 'the next sighting is the grateful one')
    if (back) {
      s.inventory.beast_taming_talisman = 0
      const t = gs.tameEncounteredBeast(back.id)
      assert(t.ok, 'a grateful beast comes without a talisman')
    } }
  { const { sim, gs, s } = await setup(11, 5, 'spirit_fox')
    gs.startBeastFight('e1', 'slay'); fight(sim, gs, 'win')
    s.inventory.beast_taming_talisman = 0
    assert(gs.beastFightChoices().bindLock === 'no_talisman' && gs.beastFightFinish('bind').reason === 'no_talisman' && s.family.fight, 'bind needs a talisman (and the choice stays open)')
    s.inventory.beast_taming_talisman = 2
    const f = gs.beastFightFinish('bind')
    assert(f.ok && f.beast.level === 2 && s.inventory.beast_taming_talisman === 1 && s.beasts.some(b => b.id === 'e1'), 'bind: it joins at Lv.2 for one talisman') }

  // ── Save migration ──
  { const { gs, s } = await setup(12, 5, 'spirit_fox')
    delete s.bestiary; gs._recalc()
    assert(s.bestiary && typeof s.bestiary === 'object', 'old save gains a bestiary')
    gs.startBeastFight('e1', 'slay'); s.family.fight.beast.typeId = 'no_such_beast'; gs._recalc()
    assert(!s.family.fight, 'a battle with an unknown beast is dropped on load')
    gs.startBeastFight('e1', 'slay'); const ff = JSON.parse(JSON.stringify(s.family.fight)); delete ff.to; s.family.fight = ff
    assert(gs.fightInfo().to === 2, 'a fight saved without `to` reads FIGHT_TO') }
  { const { gs, s } = await setup(13, 5, 'spirit_fox')
    s.beasts = [{ id: 'b1', typeId: 'thunder_eagle', name: 'x', level: 1, xp: 0, traits: [], expedition: null }]
    s.bestiary = {}; delete s.bestiarySeenVer; delete s.hunt; gs._recalc()
    assert(gs.bestiaryEntry('thunder_eagle').seen && gs.bestiaryEntry('spirit_fox').seen && !gs.bestiaryEntry('qilin').seen && s.hunt === null,
      'A6-2 migration: companions + waiting beasts count as seen; no hunt') }

  // ── A6-2: the Hunt ──
  { const { sim, gs, s } = await setup(20, 3, 'spirit_fox')
    s.beastEncounters = []; s.spiritStones = 3
    const info = gs.huntInfo()
    const foot = info.grounds.find(g => g.id === 'misty_foothills'), crags = info.grounds.find(g => g.id === 'thunder_crags')
    assert(!foot.lock && crags.lock === 'stage', 'the foothills are open at stage 3; the crags wait for their realm gate')
    const odds = foot.table.filter(r => r.open).reduce((a, r) => a + r.chance, 0)
    assert(Math.abs(odds - 1) < 1e-9 && foot.table.every(r => r.open), `the ground's odds sum to 100% over the kinds you can meet`)
    s.stageIndex = 6; gs._recalc()
    assert(gs.startHunt('thunder_crags').reason === 'stones', 'a hunt you cannot pay for is refused')
    s.spiritStones = 50
    assert(gs.startHunt('thunder_crags').ok && s.spiritStones === 45 && s.hunt?.groundId === 'thunder_crags', 'starting a hunt pays its cost')
    assert(gs.startHunt('misty_foothills').reason === 'busy', 'one hunt at a time')
    sim.step(30); assert(!s.hunt.found, 'the search takes its time')
    sim.step(100)
    const found = s.beastEncounters.find(e => e.id === s.hunt?.found)
    assert(found && found.hunted === 'thunder_crags' && ['thunder_eagle', 'spectral_bear', 'blood_python'].includes(found.typeId) && gs.bestiaryEntry(found.typeId).seen,
      `the hunt finds a beast of its ground (${found?.typeId}), seen in the bestiary`)
    assert(gs.startHunt('misty_foothills').reason === 'busy', 'a found beast holds the hunt until it is dealt with')
    s.inventory.beast_taming_talisman = 1; gs.tameEncounteredBeast(found.id)
    assert(gs.startHunt('misty_foothills').ok, 'once the found beast is tamed, you can hunt again')
    gs.cancelHunt(); assert(s.hunt === null, 'call off a hunt')
    s.beastEncounters = [1, 2, 3].map(i => ({ id: 'x' + i, typeId: 'spirit_fox', traits: [], seenAt: 0 }))
    assert(gs.startHunt('misty_foothills').reason === 'crowded', 'three beasts waiting: no room to hunt') }
  { // The hunt resolves after the game was closed (initSlot → tick picks it up)
    const { sim, gs, s } = await setup(21, 3, 'spirit_fox')
    s.beastEncounters = []; gs.startHunt('misty_foothills'); await gs.forceSave?.()
    sim.clock.now += 3600e3; sim.step(1)
    assert(s.hunt?.found && s.beastEncounters.length === 1, 'a search that ended while you were away has found its beast') }
  { // Only kinds at or below your realm: a stage-19 hunter on the summit never meets a Golden Dragon (stage 20)
    const { sim, gs, s } = await setup(22, 19, 'spirit_fox')
    const seen = new Set()
    for (let i = 0; i < 60; i++) { s.beastEncounters = []; s.hunt = null; s.spiritStones = 999; gs.startHunt('cloud_sea_summit'); sim.step(301); const e = s.beastEncounters[0]; if (e) seen.add(e.typeId) }
    assert(!seen.has('golden_dragon') && seen.has('azure_dragon'), `summit at stage 19 yields ${[...seen].join(', ')}`) }

  // ── A6-2: a slayer's reputation ──
  { let gv = 0, gs0 = 0
    for (let i = 0; i < 1; i++) {
      for (const slayer of [false, true]) {
        const { sim, gs, s } = await setup(500 + i, 5, 'spirit_fox'); s.karma = 50
        if (slayer) s.bestiary = { blood_python: { seen: true, slain: 20 } }
        gs.startBeastFight('e1', 'drive'); fight(sim, gs, 'win')
        rng(sim, 0.4); gs.beastFightFinish('flee'); unrng(sim)
        const back = gs.bestiaryEntry('spirit_fox').returning
        if (back === 'grateful') { if (slayer) gv++; else gs0++ }
      }
    }
    assert(gs0 === 1 && gv === 0, 'the same roll (0.4): at neutral karma a spared beast returns grateful (0.51); after 20 kills, vengeful (0.31)') }

  // ── A6-2: battle banter pools ──
  { const { sim } = await setup(30, 5, 'spirit_fox')
    const D = sim.data, holes = []
    for (const t of ['beast_slain', 'beast_spared', 'battle_lost']) {
      if (!D.BANTER_TRIGGERS.includes(t)) holes.push('trigger ' + t)
      if ((D.BANTER_LINES.generic[t] || []).length < 2) holes.push('generic ' + t)
      for (const p of D.PERSONALITIES) if ((D.BANTER_LINES[p.id]?.[t] || []).length < 4) holes.push(p.id + ' ' + t)
    }
    assert(!holes.length, `battle banter: every personality has ≥4 lines per trigger${holes.length ? ' — missing ' + holes.join(', ') : ''}`) }
})()

function BEAST_TRAIT_POWER_IRON() { return 25 }
function BATTLE_TO_() { return 4 }
function BEAST_KARMA_(k, n) { return { finish: { benign: -6, wild: -1, fell: 3 }, spare: { benign: 2, wild: 1, fell: -1 } }[k][n] }
