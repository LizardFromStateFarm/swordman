// Scenario checks — Phase 49b The Mortal Arc (docs/systems/mortal-phase.md → "49b"). Pins: a new life is a mortal
// (stage 0, meridians shut — no Qi on the tick or offline, drawQi refused, no breakthrough); the Awakening gate
// (body tier D opens Qi Condensation once, below the gate refuses with no roll and no loss); the arc fires mortal-only
// beats on the game clock, one at a time, no repeats, capped at maxBeats, never after Awakening; a beat's `when` gates
// read the body, root, birth and spark; every choice's effect (body XP from HOURS of the best temper rate, items,
// stones, karma — personality-keyed, health floored at 1, spark, hint, a minted rival); the Explore forage only while
// mortal; and the save migration + the per-life reset.
// Run: npm run checks · node scripts/sim/checks/mortal.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

const setup = async (seed = 1) => {
  const sim = await createSim({ seed }); await sim.boot(0)
  const gs = sim.gs, s = gs.get()
  const D = sim.ev('({ MORTAL_BEATS, MORTAL_ARC, BODY_TIERS, BODY_AWAKEN_TIER })')
  return { sim, gs, s, D, yr: () => Math.floor(s.world.year) }
}
const openGate = (sim, gs, s, D) => { s.body.tier = D.BODY_TIERS.findIndex(t => t.id === D.BODY_AWAKEN_TIER); gs._recalc() }
// Fire the next beat now (bypass the gap): set nextYear into the past and tick the mortal arc.
const fireBeat = (sim, gs, s) => { s.mortal.nextYear = -1e9; gs._tickMortal(Math.floor(s.world.year) + 1); return gs.mortalInfo().beat }
const beatDef = (D, id) => D.MORTAL_BEATS.find(b => b.id === id)

;(async () => {
  // ── The gate: a new life is a mortal ──
  { const { sim, gs, s, D } = await setup(1)
    assert(s.stageIndex === 0 && s.awakened === false && gs.mortalMeridiansShut(), 'a new life is a mortal (stage 0, meridians shut)')
    assert(gs.awakenInfo().isMortal && !gs.canAwaken(), 'awakenInfo reports a mortal who is not yet ready')
    assert(s.derived.qiPerSecondPassive > 0, 'the passive rate exists — it is only the credit that is gated')
    s.qi = 0
    sim.clock.now += 10000; gs.tick(10)
    assert(s.qi === 0, 'no Qi accrues while the meridians are shut (the tick credits 0)')
    assert(gs.drawQi().reason === 'mortal', 'drawQi refuses while mortal')
    assert(!gs.minigameUnlocked('flow') && gs.minigameLock('flow') === 'Unlocks once you cultivate', 'Meridian Flow is locked while mortal — the opening is Body training, not Qi')
    assert(gs.attemptBreakthrough().reason === 'awaken_required', 'a mortal cannot break through — they must Awaken')
    const before = s.health
    const r = gs.awaken()
    assert(!r.ok && r.reason === 'body_too_weak' && r.need && r.have, 'awaken() below the gate names the tier you need and have')
    assert(s.stageIndex === 0 && !s.awakened && s.health === before, '…with no roll and no loss')
  }

  // ── Body D is the gate; Awakening opens Qi Condensation (once) ──
  { const { sim, gs, s, D } = await setup(2)
    openGate(sim, gs, s, D)
    assert(gs.canAwaken(), 'body tier D (Hardened) is the Awakening gate')
    const r = gs.awaken()
    assert(r.ok && s.awakened && s.stageIndex === 1, 'the Awakening opens Qi Condensation')
    assert(!gs.mortalMeridiansShut(), 'the meridians are open after the Awakening')
    assert(gs.awaken().reason === 'not_mortal', 'the Awakening happens once')
    sim.clock.now += 10000; gs.tick(10)
    assert(s.qi > 0, 'Qi flows after the Awakening')
    assert(gs.minigameUnlocked('flow'), 'Meridian Flow unlocks once the meridians open')
  }

  // ── The arc: mortal-only, one at a time, no repeats, capped, the opening beat leads ──
  { const { sim, gs, s, D } = await setup(3)
    const b1 = fireBeat(sim, gs, s)
    assert(!!b1 && b1.id === 'first_breath' && beatDef(D, b1.id).first, 'the first beat of a life is the opening beat (The First Breath)')
    const nBeats = s.mortal.beats
    s.mortal.nextYear = -1e9; gs._tickMortal(Math.floor(s.world.year) + 1)
    assert(s.mortal.beats === nBeats && gs.mortalInfo().beat.id === b1.id, 'only one beat waits at a time')
    gs.resolveMortalBeat(b1.choices[0].id)
    assert(!gs.mortalInfo().beat, 'answering the beat clears it')
    assert(s.mortal.done.includes('first_breath'), 'the answered beat is remembered (no repeats)')
    // run the arc to its cap
    for (let i = 0; i < D.MORTAL_ARC.maxBeats + 2; i++) { const b = fireBeat(sim, gs, s); if (b) gs.resolveMortalBeat(b.choices[0].id) }
    assert(s.mortal.beats === D.MORTAL_ARC.maxBeats, `the arc sees at most MORTAL_ARC.maxBeats beats (${D.MORTAL_ARC.maxBeats})`)
    assert(!fireBeat(sim, gs, s), 'no beat fires past the cap')
    assert(s.mortal.done.length === new Set(s.mortal.done).size, 'a beat is never answered twice')
    // never after Awakening
    openGate(sim, gs, s, D); gs.awaken()
    s.mortal.nextYear = -1e9
    gs._tickMortal(Math.floor(s.world.year) + 1)
    assert(!gs.mortalInfo().beat && !s.mortal.beat, 'no beat fires after the Awakening')
  }

  // ── The gap: beats fire on the game clock, not every tick ──
  { const { sim, gs, s, D } = await setup(4)
    gs._tickMortal(1)                       // first roll schedules nextYear
    assert(s.mortal.nextYear != null && s.mortal.nextYear > 1, 'the first beat is scheduled a gap after the life begins')
    const due = s.mortal.nextYear
    gs._tickMortal(due - 0.01 + 0)          // still before the gap
    assert(!s.mortal.beat, 'no beat before the gap elapses')
    gs._tickMortal(due)
    assert(!!s.mortal.beat, 'the beat fires once the gap elapses')
    assert(D.MORTAL_ARC.beatGapYears[0] > 0 && D.MORTAL_ARC.firstBeatYears[0] > 0, 'both gaps are positive')
  }

  // ── A beat's `when` gates the pool (body / root / birth / spark / after) ──
  { const { sim, gs, s, D } = await setup(5)
    const ok = id => gs._mortalBeatOk(beatDef(D, id))
    assert(ok('the_smith') && ok('the_river'), 'an ungated beat is always eligible')
    assert(!ok('the_beast') === (s.body.tier < D.BODY_TIERS.findIndex(t => t.id === 'E')), 'the beast needs body E')
    s.body.tier = D.BODY_TIERS.findIndex(t => t.id === 'E'); gs._recalc()
    assert(gs._mortalBeatOk(beatDef(D, 'the_beast')), 'the beast is eligible at body E')
    s.root = { type: 'mixed', name: 'Mixed Root', mult: 1.0 }
    assert(!gs._mortalBeatOk(beatDef(D, 'the_element_dream')), 'the element dream needs a strong root')
    s.root = { type: 'heavenly', name: 'Heavenly Root', mult: 3.0 }
    assert(gs._mortalBeatOk(beatDef(D, 'the_element_dream')), 'a strong root opens the element dream')
    s.birth = null
    assert(gs._mortalOrphan() && gs._mortalBeatOk(beatDef(D, 'the_empty_house')) && !gs._mortalBeatOk(beatDef(D, 'the_clan_word')), 'an orphan gets the empty-house beat, not the clan word')
    s.birth = { clanId: 'c1' }
    assert(!gs._mortalOrphan() && gs._mortalBeatOk(beatDef(D, 'the_clan_word')) && !gs._mortalBeatOk(beatDef(D, 'the_empty_house')), 'a clan birth gets the clan word, not the empty house')
    assert(!gs._mortalBeatOk(beatDef(D, 'the_spark_returns')), 'the capstone needs a spark')
    s.mortal.spark = 1
    assert(gs._mortalBeatOk(beatDef(D, 'the_spark_returns')), 'a spark opens the capstone')
    assert(!gs._mortalBeatOk({ id: 'x', when: { after: ['first_breath'] } }), 'an `after` gate waits for the named beat')
    s.mortal.done = ['first_breath']
    assert(gs._mortalBeatOk({ id: 'x', when: { after: ['first_breath'] } }), '…and opens once it is done')
    assert(!gs._mortalBeatOk({ id: 'y', when: { notAfter: ['first_breath'] } }), 'a `notAfter` gate closes on the named beat')
  }

  // ── A choice's effects ──
  { const { sim, gs, s, D } = await setup(6)
    const smith = beatDef(D, 'the_smith')
    // body XP: HOURS of the best temper rate × the Active/ground multiplier (the mini-game convention)
    s.body.xp = 0
    const rate = gs._bestTemperRate() * gs.temperXpMult().mult
    s.mortal.beat = { id: 'the_smith', year: 1 }
    const r = gs.resolveMortalBeat('work')
    assert(Math.abs(r.bodyXp - Math.round(1.2 * rate)) <= 1, 'a beat pays body XP in hours of the best temper rate')
    // items + stones
    s.mortal.beat = { id: 'the_river', year: 1 }; s.inventory = {}; s.spiritStones = 0; s.health = gs.maxHealth()
    gs.resolveMortalBeat('fish')
    assert((s.inventory.spirit_herb || 0) === 2, 'a choice can grant items')
    s.mortal.beat = { id: 'the_river', year: 1 }; s.spiritStones = 0; s.health = gs.maxHealth()
    gs.resolveMortalBeat('dive')
    assert(s.spiritStones === 3 && s.health === gs.maxHealth() - 8, 'a choice can grant stones and cost Health')
    // karma + hint
    s.mortal.beat = { id: 'first_breath', year: 1 }; s.karma = 50
    gs.resolveMortalBeat('ask')
    assert(s.karma === 52 && s.mortal.hints.elder === true, 'a choice moves karma and can set a hint')
    // spark
    s.mortal.beat = { id: 'first_breath', year: 1 }; s.mortal.spark = 0
    gs.resolveMortalBeat('chase')
    assert(s.mortal.spark === 1, 'a choice can bank a spark')
    // Health floors at 1 (never lethal)
    s.mortal.beat = { id: 'the_beast', year: 1 }; s.health = 3
    gs.resolveMortalBeat('drive')
    assert(s.health === 1, 'a beat never kills — Health floors at 1')
    // a locked choice is refused (not silently resolved)
    s.mortal.beat = { id: 'the_smith', year: 1 }; s.spiritStones = 0
    const info = gs.mortalInfo()
    assert(info.beat.choices.find(c => c.id === 'buy').ok === false, 'an unaffordable choice is shown locked')
    assert(gs.resolveMortalBeat('buy').reason === 'locked' && !!s.mortal.beat, 'a locked choice cannot be answered')
    // personality-keyed numbers: a hotblood gains karma for fighting
    s.mortal.beat = { id: 'the_rival', year: 1 }; s.karma = 50; s.personality = { id: 'hotblood' }
    const rr = gs.resolveMortalBeat('fight')
    assert(s.karma === 51, 'a choice reads your personality (a hotblood gains karma for the fight)')
    assert(rr.rival && s.mortal.rivalId && gs.person(s.mortal.rivalId)?.role === 'youth', 'the rival child becomes a real person of the world')
    assert(gs.person(s.mortal.rivalId).rel === D.MORTAL_ARC.rivalRel, '…with the arc’s starting feeling toward you')
    // resolving needs a pending beat
    assert(gs.resolveMortalBeat('nope').reason === 'no_beat', 'there is nothing to answer without a pending beat')
  }

  // ── The Explore forage: only while mortal ──
  { const { sim, gs, s, D } = await setup(7)
    const loc = sim.ev('LOCATIONS.find(l => l.id === "mortal_forest")')
    const d = {}; gs._mortalForage(d, loc)
    assert((d.beast_core || 0) >= D.MORTAL_ARC.exploreDrop.beast_core, 'while mortal, an Explore guaranteed the drills’ material')
    // integration: mortal_forest (tier 1) rolls exactly 1 item type normally; the forage adds the core + a pick
    s.inventory = {}; s.expedition = { active: true, locationId: 'mortal_forest', endsAt: Date.now() - 1 }
    gs.resolveExpedition()
    const kinds = Object.keys(s.inventory).length
    assert(kinds >= 2, 'while mortal, an Explore return brings back more than one kind (drops + forage)')
    // …but not for a Qi Condensation life
    openGate(sim, gs, s, D); gs.awaken(); s.inventory = {}
    s.expedition = { active: true, locationId: 'mortal_forest', endsAt: Date.now() - 1 }
    gs.resolveExpedition()
    assert(Object.keys(s.inventory).length <= 1, 'a non-mortal Explore on the same location gets no forage bonus (≤1 drop, as before)')
  }

  // ── Migration + the per-life reset ──
  { const { sim, gs, s, D } = await setup(8)
    const blank = sim.ev('JSON.stringify(gameState._blankMortal())')
    delete s.mortal; gs._recalc()
    assert(s.mortal && typeof s.mortal === 'object' && JSON.stringify(s.mortal) === blank, 'an old save gains a blank mortal arc on load')
    // a stale pending beat on a save already past the Mortal stage is dropped
    s.stageIndex = 3; s.mortal.beat = { id: 'first_breath', year: 1 }; gs._recalc()
    assert(!s.mortal.beat, 'a save past the Mortal stage drops any stale pending beat')
    assert(D.BODY_AWAKEN_TIER === 'D', 'BODY_AWAKEN_TIER is Hardened Body (D)')
    // every beat + choice is data-complete (id, title, text; choice id/label/sub/result)
    assert(D.MORTAL_BEATS.length >= 8, `the arc has a pool of beats (${D.MORTAL_BEATS.length})`)
    for (const b of D.MORTAL_BEATS) {
      assert(!!b.id && !!b.title && !!b.text, `beat ${b.id}: has an id, title and text`)
      assert(Array.isArray(b.choices) && b.choices.length >= 2 && b.choices.length <= 3, `beat ${b.id}: 2–3 choices`)
      for (const c of b.choices) assert(!!c.id && !!c.label && !!c.sub && !!c.result, `beat ${b.id} → ${c.id}: label, sub and result`)
    }
  }
})()
