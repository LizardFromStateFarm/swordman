// Scenario checks — docs/systems/combat.md (Phase 35 / A6-1) + arts.md "Move combat" (Phase 42b, 1.13a): beast battles on
// moves. The estimate vs real play, Qi (no cooldowns, Circulate), the parry QTE (0 damage + Qi, Off, the rate), elements,
// mastery through use, locks (busy / wounded), wounds per stance (Slay can kill → cause beast_hunt, Drive
// never below 1), the won-battle end choice (finish → loot + karma by nature + cub; spare → a grateful/vengeful return on
// the next sighting; bind → Lv.2 companion for a talisman), retreat, habits learned after one fight, save migration, and
// the shared one-fight gate. Run: npm run checks · node scripts/sim/checks/combat.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

async function setup(seed, stage, typeId, extra = {}) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  globalThis.__MC = sim.ev('MOVE_COMBAT')
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100
  s.root = { ...s.root, mult: 1 }; s.personality = { ...(s.personality || {}), id: 'stoic', name: 'Stoic' }
  s.beastEncounters = [{ id: 'e1', typeId, traits: ['soul_bond', 'qi_devour', 'spirit_nose'], seenAt: 0, ...extra }]
  gs._recalc()
  return { sim, gs, s }
}
// Play a battle out on moves (Phase 42b): 'win' makes it one blow from falling, 'lose' makes it overwhelming. Parrying off.
function fight(sim, gs, how) {
  const s = gs.get(), m = s.family.fight.m
  s.arts.parryMode = 'off'
  if (how === 'win') { m.foe.hp = 1; m.foe.P.parryChance = 0 } else { m.foe.power = 99999; m.foe.hp = 9999; m.foe.max = 9999 }
  let r
  for (let i = 0; i < 40; i++) {
    r = gs.beastMove(how === 'win' ? 'palm_strike' : 'circulate')
    if (!r.ok || r.done || r.over) break
  }
  return r
}

;(async () => {
  // ── The estimate (a Monte Carlo of the move fight) ──
  { const pct = async (stage, type, hp = 100) => { const { gs, s } = await setup(1, stage, type); s.health = hp; return gs.beastFightPreview('e1').chance }
    const fox0 = await pct(0, 'spirit_fox'), fox1 = await pct(2, 'spirit_fox')
    const gd20 = await pct(20, 'golden_dragon'), gd22 = await pct(22, 'golden_dragon')
    assert(fox1 >= fox0 && fox0 > 0.15, `Spirit Fox: ${(fox0 * 100).toFixed(0)}% at Mortal, ${(fox1 * 100).toFixed(0)}% two stages up`)
    assert(gd20 < 0.25 && gd22 > gd20, `Golden Dragon (starter arts): ${(gd20 * 100).toFixed(0)}% at stage 20, ${(gd22 * 100).toFixed(0)}% at 22`)
    const hurt = await pct(5, 'thunder_eagle', 30), whole = await pct(5, 'thunder_eagle', 100)
    assert(hurt < whole, `wounds weaken you: ${(whole * 100).toFixed(0)}% at full Health, ${(hurt * 100).toFixed(0)}% at 30`) }
  { const { gs, s } = await setup(2, 5, 'spirit_fox')
    const b = gs.beastFightPreview('e1')
    assert(b.it.parts.reduce((x, p) => x + p.value, 0) === b.it.total && b.you.parts.reduce((x, p) => x + p.value, 0) === b.you.total, 'breakdown parts add up to both powers')
    assert(b.element === 'fire' && b.stance.slay.foeHp > 0 && b.stance.slay.parryRate === MC().parryRateDefault, 'the preview names its element, its strength and the parry rate assumed')
    assert(gs.beastFightPreview('e1').stance.slay.chance === b.stance.slay.chance, 'the estimate is stable between renders (cached, own RNG)') }
  { const { gs } = await setup(3, 16, 'black_tortoise', { traits: ['iron_skin', 'swift', 'soul_bond'] })
    const { gs: g2 } = await setup(3, 16, 'black_tortoise')
    assert(gs.beastFightPreview('e1').it.total === g2.beastFightPreview('e1').it.total + BEAST_TRAIT_POWER_IRON(), 'Iron Skin makes it stronger') }
  { // Real play with the default policy (parrying off) wins about as often as the estimate says
    for (const [stage, type] of [[1, 'spirit_fox'], [6, 'thunder_eagle']]) {
      let wins = 0, shown = 0; const n = 150   // shown = the average estimate over the same seeds
      for (let i = 0; i < n; i++) {
        const { gs, s } = await setup(1000 + i, stage, type); s.arts.parryMode = 'off'
        shown += gs.beastFightPreview('e1').stance.drive.chance / n
        gs.startBeastFight('e1', 'drive')
        let r; for (let k = 0; k < 80; k++) { r = gs.beastMove(gs._mbPolicy(s.family.fight.m)); if (!r.ok || r.done || r.over) break }
        if (r.over === 'won') wins++
      }
      assert(Math.abs(wins / n - shown) < 0.12, `${type} at stage ${stage}: real play wins ${(wins / n * 100).toFixed(0)}% vs ${(shown * 100).toFixed(0)}% estimated (n=${n})`)
    } }

  // ── Locks ──
  { const { gs, s } = await setup(4, 5, 'spirit_fox')
    s.health = 10; assert(gs.beastFightPreview('e1').locked === 'wounded' && gs.startBeastFight('e1', 'slay').reason === 'wounded', 'too wounded to start below 15 Health')
    s.health = 100; assert(gs.startBeastFight('e1', 'nope').reason === 'bad_stance', 'stance must be slay or drive')
    assert(gs.startBeastFight('e1', 'slay').ok && gs.startBeastFight('e1', 'slay').reason === 'busy', 'one fight at a time')
    assert(gs.tameEncounteredBeast('e1').reason === 'fighting', 'cannot tame the beast you are fighting')
    const info = gs.fightInfo()
    assert(info.kind === 'beast' && info.m && info.habitsKnown === false && info.hint === null, 'first fight: its arts and habits are unknown')
    const deck0 = s.family.fight.m.you.slots.map(id => id || null)
    assert(gs.fightExchange('press').reason === 'moves', 'beasts fight on moves (no tactics)')
    assert(gs.setArtSlot('move', 0, null).ok, 'the loadout is not locked mid-fight (2026-09-30)')
    assert(gs.fightMoves().slots.map(x => x?.id || null).join() === deck0.join(), 'the battle keeps the deck it began with') }

  // ── Qi, no cooldowns, the parry QTE ──
  { const { gs, s } = await setup(40, 5, 'spirit_fox')
    s.arts.parryMode = 'normal'; gs.startBeastFight('e1', 'slay')
    const m = s.family.fight.m
    const mv = gs.beastMoves()
    assert(mv.slots.length === 4 && mv.circulate && mv.slots.filter(Boolean).every(x => x.cost >= 0 && x.type), 'four move slots + Circulate')
    const big = mv.slots.find(x => x && x.cost > 0)
    m.you.qi = big.cost - 1
    assert(gs.beastMove(big.id).reason === 'qi' && gs.beastMoves().slots.find(x => x?.id === big.id).lock === 'qi', 'a move you cannot pay for is refused (needs Qi)')
    m.you.qi = 100; m.foe.moves = ['beast_rake']; m.foe.P.parryChance = 0
    const q0 = m.you.qi
    let r = gs.beastMove(big.id)
    if (r.pending) {
      assert(r.pending.hits >= 1 && r.pending.windowMs >= MC().parryMinMs && r.pending.windowMs <= MC().parryMaxMs, `its attack opens a parry window (${r.pending.windowMs} ms)`)
      const hp = s.health, qi = m.you.qi
      r = gs.beastParry([true])
      assert(r.ok && s.health === hp && m.you.qi >= Math.min(m.you.pool, qi + MC().parryQi) - 0.001 - 0, 'a parried hit does no damage and gives Qi back')
      assert(s.arts.parryLog.slice(-1)[0] === 1 && s.arts.parryTaught, 'the parry is remembered (your rate)')
    } else assert(false, 'its attack should open a parry window')
    const again = gs.beastMove(big.id)
    assert(again.ok || again.pending, 'no cooldowns: the same move again next turn')
    if (again.pending) gs.beastParry([false])
    m.you.qi = 0
    const c = gs.beastMove('circulate')
    if (c.pending) gs.beastParry([false])
    assert(m.you.qi >= MC().circulateQi, `Circulate gathers ${MC().circulateQi} Qi`)
    s.arts.parryMode = 'off'
    const off = gs.beastMove('palm_strike')
    assert(!off.pending, 'parrying Off: no prompt, blows land') }
  { const { gs, s } = await setup(41, 5, 'spirit_fox')
    const Y = { element: 'water' }
    assert(gs._mbElementMult('water', { element: 'fire' }) === MC().elementOver && gs._mbElementMult('fire', { element: 'water' }) === MC().elementUnder && gs._mbElementMult('neutral', { element: 'fire' }) === 1, 'water overcomes fire, fire into water is resisted, neutral ×1')
    void Y
    const id = s.arts.loadout.moves.find(x => x && x !== 'palm_strike' && x !== 'qi_shield')
    const k = s.arts.known[id]; k.xp = 19
    gs._artUse(id)
    assert(k.mastery === 2 && k.uses === 1, 'using an art in battle deepens it (mastery 2 at 20 xp)') }

  // ── Wounds + death ──
  { const { sim, gs, s } = await setup(5, 20, 'golden_dragon')
    gs.startBeastFight('e1', 'drive'); s.health = 16
    const r = fight(sim, gs, 'lose')
    assert(r.done && r.outcome === 'lost' && s.health >= 1, `Drive off: thrown down, never below 1 Health (${s.health})`)
    assert(s.beastEncounters.some(e => e.id === 'e1'), 'a beast that beats you stays') }
  { const { sim, gs, s } = await setup(6, 20, 'golden_dragon')
    s.health = 40
    const pv = gs.beastFightPreview('e1')
    assert(pv.stance.slay.canDie && !pv.stance.drive.canDie, `Slay vs a Golden Dragon at 40 Health is shown as deadly (${Math.round(pv.stance.slay.died * 100)}% of fights)`)
    gs.startBeastFight('e1', 'slay')
    const r = fight(sim, gs, 'lose')
    assert(r.done && r.outcome === 'died' && gs.get().interlude && gs.get().lastReincarnation?.cause === 'beast_hunt', 'Slay: a legendary beast can kill you (cause beast_hunt)') }
  { const { gs, s } = await setup(7, 3, 'spirit_fox')
    gs.startBeastFight('e1', 'slay'); s.arts.parryMode = 'off'; gs.beastMove('palm_strike')
    const hp = s.health
    const r = gs.fightExchange('retreat')
    assert(r.done && r.retreated && s.health === hp - r.dmg && r.dmg > 0 && !s.family.fight && s.beastEncounters.length === 1, `retreat: a parting blow (−${r.dmg}), the beast stays`)
    assert(gs.bestiaryEntry('spirit_fox').habitsKnown, 'having traded blows, you know its habits') }
  { // an old-engine beast fight in a save restarts on moves
    const { gs, s } = await setup(42, 3, 'spirit_fox')
    gs.startBeastFight('e1', 'slay'); delete s.family.fight.m; gs._recalc()
    assert(s.family.fight?.m?.foe?.hp > 0, 'an old-engine battle in a save restarts on moves') }

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
    rng(sim, 0.1)                                   // Phase 41: force the bind roll to succeed (crude 40%)
    const f = gs.beastFightFinish('bind'); unrng(sim)
    assert(f.ok && f.beast.level === 2 && s.inventory.beast_taming_talisman === 1 && s.beasts.some(b => b.id === 'e1'), 'bind: it joins at Lv.2 for one talisman') }

  // ── Save migration ──
  { const { gs, s } = await setup(12, 5, 'spirit_fox')
    delete s.bestiary; gs._recalc()
    assert(s.bestiary && typeof s.bestiary === 'object', 'old save gains a bestiary')
    gs.startBeastFight('e1', 'slay'); s.family.fight.beast.typeId = 'no_such_beast'; gs._recalc()
    assert(!s.family.fight, 'a battle with an unknown beast is dropped on load')
    gs.startBeastFight('e1', 'slay'); const ff = JSON.parse(JSON.stringify(s.family.fight)); Object.assign(ff, { p: 0.5, to: 4, you: 1, them: 0 }); s.family.fight = ff
    gs._ensurePhase42Fields()
    assert(s.family.fight?.m && !('p' in s.family.fight) && !('you' in s.family.fight), 'the old Press/Guard/Feint race fields are dropped on load (1.14a)') }
  { const { gs, s } = await setup(13, 5, 'spirit_fox')
    s.beasts = [{ id: 'b1', typeId: 'thunder_eagle', name: 'x', level: 1, xp: 0, traits: [], expedition: null }]
    s.bestiary = {}; delete s.bestiarySeenVer; delete s.hunt; gs._recalc()
    assert(gs.bestiaryEntry('thunder_eagle').seen && gs.bestiaryEntry('spirit_fox').seen && !gs.bestiaryEntry('qilin').seen && s.hunt === null,
      'A6-2 migration: companions + waiting beasts count as seen; no hunt') }

  // ── 2026-09-30 (user): the Bestiary remembers the rare colour variants you have run into ──
  { const { sim, gs, s } = await setup(14, 5, 'spirit_fox', { variant: 'crimson' })
    gs._seeBeast({ typeId: 'spirit_fox', variant: 'crimson' })
    assert(gs.bestiaryEntry('spirit_fox').variants.crimson === true, 'meeting a rare colour records its variant in the bestiary')
    // a rare-colour sighting records it at the moment you meet it (the roll is random: force it)
    const BT = sim.ev('BEAST_TYPES').find(b => b.id === 'qilin')
    rng(sim, 0); const enc = gs._spawnBeastEncounter(BT); unrng(sim)
    assert(enc.variant === 'crimson' && gs.bestiaryEntry('qilin').variants.crimson === true, `a rare-colour sighting records the variant (${enc.variant})`)
    // a v1 save gains the variants its companions / waiting beasts still carry
    s.bestiary = {}; s.bestiarySeenVer = 1; gs._recalc()
    assert(s.bestiarySeenVer === 2 && gs.bestiaryEntry('spirit_fox').seen && gs.bestiaryEntry('spirit_fox').variants.crimson === true,
      'bestiary migration v2 backfills the variants still around') }

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
    s.inventory.beast_taming_talisman = 1
    rng(sim, 0.1); gs.tameEncounteredBeast(found.id); unrng(sim)   // Phase 41: force the tame roll to succeed
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

  // ── Parry pacing (user 2026-09-29: fewer prompts, harder blows) ──
  { const { sim, gs, s } = await setup(40, 14, 'white_tiger')
    const MCd = sim.ev('MOVE_COMBAT')
    gs.startBeastFight('e1', 'slay')
    const b = s.family.fight.m, art = id => gs._mbArt(id)
    const always = r => [0, 0.2, 0.5, 0.99].every(v => gs._mbTelegraphed(b, r, () => v))
    assert(always(art('severing_crescent')), 'its strongest art is always telegraphed')
    assert(!gs._mbTelegraphed(b, art('armour_rending_slash'), () => 0.99) && gs._mbTelegraphed(b, art('armour_rending_slash'), () => 0.01),
      `a lesser blow is telegraphed only by the roll (${Math.round(MCd.parryPromptChance * 100)}%)`)
    assert(always({ move: { type: 'finisher', power: 5 } }) && always({ move: { type: 'charge', power: 5 } }), 'charges and finishers are always telegraphed')
    assert(MCd.foeDmgMult > 1, `beasts hit harder to make up for fewer parries (×${MCd.foeDmgMult})`)
    // live: an untelegraphed blow lands with no prompt and the log says why; the decision is not re-rolled on resume
    b.foe.moves = ['severing_crescent', 'armour_rending_slash']; b.foe.P.parryChance = 0; s.arts.parryMode = 'normal'
    let prompts = 0, unwarned = 0, told = 0
    for (let i = 0; i < 12 && !s.family.fight?.over && s.family.fight; i++) {
      s.health = 100; b.you.hp = 100; b.foe.hp = b.foe.max
      const r = gs.beastMove('circulate')
      if (r.pending) { prompts++; const r2 = gs.beastParry([false]); (r2.events || []).forEach(e => { if (e.unwarned) unwarned++ }) }
      ;(r.events || []).forEach(e => { if (e.unwarned) unwarned++ })
      if ((r.lines || []).some(l => /Too quick to parry/.test(l.text))) told++
    }
    assert(prompts > 0 && unwarned > 0 && told === unwarned, `some blows prompt (${prompts}), others land unwarned (${unwarned}) and the log says so (${told})`) }

  // ── Beast end cards: the karma on the card is the karma you get (every nature, and at the 0 / 100 edges) ──
  { const bad = []
    for (const [type, nature] of [['spirit_fox', 'wild'], ['blood_python', 'fell'], ['qilin', 'benign']]) for (const choice of ['finish', 'spare']) for (const k0 of [50, 0, 100]) {
      const { sim, gs, s } = await setup(60, 14, type); s.karma = k0
      gs.startBeastFight('e1', 'slay'); fight(sim, gs, 'win')
      const ch = gs.beastFightChoices(), v = choice === 'finish' ? ch.finishKarma : ch.spareKarma
      const expect = Math.max(0, Math.min(100, k0 + v)) - k0
      rng(sim, 0.99); const r = gs.beastFightFinish(choice); unrng(sim)
      if (v !== BEAST_KARMA_(choice, nature) || r.karma !== expect || s.karma - k0 !== expect) bad.push(`${type} ${choice} @${k0}: card ${v}, got ${r.karma}`)
    }
    assert(!bad.length, `the card's karma matches the result for all natures (clamped at 0/100)${bad.length ? ' — ' + bad.join('; ') : ''}`) }
})()

function BEAST_TRAIT_POWER_IRON() { return 25 }
function BATTLE_TO_() { return 4 }
function MC() { return globalThis.__MC }
function BEAST_KARMA_(k, n) { return { finish: { benign: -6, wild: -1, fell: 3 }, spare: { benign: 2, wild: 1, fell: -1 } }[k][n] }
