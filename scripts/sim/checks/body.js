// Scenario checks — Phase 14 Body Constitution & Tempering (docs/systems/body-constitution.md). Pins: every life starts
// at F (a new game, and after a death) while the mini-game charges carry; tier effects (max Health / regen / failed-BT Qi
// kept / fight power) and every Health cap reads maxHealth (pills, regen, the battle page); old saves migrate; the method
// locks (stage, items, busy, beast, once, the Blood Forging gate); a drill pays out on real time (closed too) and cleanses
// taint; an ordeal holds at its crisis offline and its three answers (Endure clean / hurt + scar, Ease off, Draw on Qi);
// the crisis odds match a Monte Carlo; the bank cap; the tier trial (never automatic; marrow + bitter way; failure keeps
// 70%); scars lower max Health and mend with a Golden Marrow Pill; Thunder Peak's edge caps; Blood Forging's costs;
// Auto-Temper repeats only safe drills; the mini-games (charges refill offline + cap; Strikes rewards are clamped and a
// too-fast run scores nothing; the cut option; Meridian Flow puzzles are always solvable and the engine rejects a wrong
// answer; Flow Qi never crosses the cap); the child's Temper their body.
// Run: npm run checks · node scripts/sim/checks/body.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const force = (sim, v, fn) => { const M = sim.ev('Math'), r = M.random; M.random = () => v; try { return fn() } finally { M.random = r } }

const setup = async (seed = 1, stage = 10) => {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100; s.spiritStones = 100000
  s.inventory = { beast_core: 50, iron_ore: 50, celestial_herb: 20, demon_essence: 20, heavenly_ore: 200, void_crystal: 10, chaos_essence: 10, pill_golden_marrow: 2 }
  gs._recalc()
  return { sim, gs, s, D: sim.ev('({ BODY_TIERS, TEMPERING_METHODS, ORDEAL_CRISIS, TIER_TRIAL, BODY_SCARS, BLOOD_FORGING, MINIGAME_CHARGES, STRIKES, FLOW, CHILD_BODY, TEMPERING_XP_ACTIVE, BODY_BANK_FRAC })') }
}
const pass = (sim, secs) => { sim.clock.now += secs * 1000 }

;(async () => {
  // ── Start at F; effects by tier; migration ──
  { const { sim, gs, s, D } = await setup()
    assert(s.body.tier === 0 && s.body.xp === 0, 'a new life starts in a Frail Body (F, 0 XP)')
    assert(D.BODY_TIERS.length === 7 && D.BODY_TIERS.map(t => t.id).join('') === 'FEDCBAS', 'seven tiers F → S')
    assert(D.BODY_TIERS.every((t, i) => !i || (t.maxHealth > D.BODY_TIERS[i - 1].maxHealth && t.regenSec < D.BODY_TIERS[i - 1].regenSec && t.xp > D.BODY_TIERS[i - 1].xp)),
      'every tier raises max Health, regenerates faster and needs more XP')
    s.body.tier = 3; gs._recalc()
    assert(gs.maxHealth() === 190 && s.derived.maxHealth === 190 && Math.abs(s.derived.healthRegenSeconds - 28) < 1e-9, 'Steel Body: 190 max Health, +1 every 28s')
    s.health = 180; pass(sim, 28.5); gs.tick(28.5)
    assert(s.health > 180, 'Health regenerates above 100 toward the body’s max')
    s.health = 189; for (let i = 0; i < 10; i++) { pass(sim, 30); gs.tick(30) }
    assert(s.health === 190, 'regen stops at the body’s max')
    s.health = 50; s.inventory.pill_golden_marrow = 3
    const r = gs.useHealPill('pill_golden_marrow')
    assert(r.ok && s.health === 130, 'a healing pill heals past 100, up to the body’s max')
    s.health = 170; gs.useHealPill('pill_golden_marrow')
    assert(s.health === 190, '…and never past it')
    assert(gs._selfFightPower().parts.some(p => /body/i.test(p.label) && p.value === D.BODY_TIERS[3].power), 'fight power counts the body tier')
    // breakthrough failure keeps more Qi with a stronger body
    const fp = gs.btFailPreview()
    assert(Math.abs(fp.qiLossFrac - (0.5 - D.BODY_TIERS[3].btKeep)) < 1e-9, `a failed breakthrough loses less Qi (${Math.round(fp.qiLossFrac * 100)}%)`)
    // migration: an old save with no body
    delete s.body; delete s.minigames; s.health = 100; gs._recalc()
    assert(s.body?.tier === 0 && s.minigames?.strikes?.charges === D.MINIGAME_CHARGES.max, 'an old save gains a Frail Body + full mini-game charges')
    s.body.tier = 4; s.health = 240; s.body.tier = 0; gs._recalc()
    assert(s.health === 100, 'Health above the body’s max is clamped on load')
  }

  // ── Locks + a drill on real time ──
  { const { sim, gs, s } = await setup(2, 2)
    const L = id => gs.temperingList().find(x => x.id === id)
    assert(L('spirit_forge').reason === 'stage' && L('tribulation').reason === 'locked', 'methods above your realm are locked; the Tribulation waits for 7C')
    assert(L('beast_spar').reason === 'no_beast', 'sparring needs a tamed beast')
    assert(!gs.temperingList().some(x => x.id === 'blood_forging'), 'Blood Forging is hidden while your karma is clean')
    s.inventory.beast_core = 0
    assert(L('iron_fist').reason === 'items' && gs.startTempering('iron_fist').reason === 'items', 'an unaffordable method cannot start')
    s.inventory.beast_core = 5; s.body.taint = 2
    const st = gs.startTempering('iron_fist')
    assert(st.ok && s.inventory.beast_core === 4, 'Iron Fist begins and spends its Beast Core')
    assert(L('morning').reason === 'busy', 'one tempering at a time')
    pass(sim, 1000); gs.tick(1)
    assert(s.body.active && s.body.xp === 0, 'nothing pays before its time')
    pass(sim, 900); gs.tick(1)
    assert(!s.body.active && s.body.xp === 40 && s.body.taint === 1, 'it pays 40 XP on real time and a drill draws out a little taint')
    // offline: a save closed mid-drill pays on load
    gs.startTempering('morning'); await gs._save?.()
    pass(sim, 3 * 3600)
    await sim.boot(0)
    const s2 = sim.gs.get()
    assert(!s2.body.active && s2.body.xp === 45, 'a drill that ended while the game was closed pays out on load')
  }

  // ── Ordeals: the crisis holds; three answers; odds; bank cap ──
  { const { sim, gs, s, D } = await setup(3, 16)
    s.body.tier = 4; s.body.xp = 20000; gs._recalc()
    assert(gs.startTempering('thunder_peak').ok, 'Thunder Peak begins')
    pass(sim, 86400 * 3); gs.tick(1)
    assert(s.body.active?.crisis === true && s.body.xp === 20000, 'the ordeal holds at its crisis; no XP until you answer')
    pass(sim, 86400); gs.tick(1)
    assert(s.body.active?.crisis === true, 'the crisis never expires on its own')
    const odds = gs.ordealOdds()
    const C = D.ORDEAL_CRISIS
    assert(odds.chance >= C.min / 100 && odds.chance <= C.max / 100 && Math.abs(odds.raw - odds.parts.reduce((a, x) => a + x.value, 0)) < 1e-9, 'the odds are the sum of their parts, clamped')
    s.body.taint = 5; const low = gs.ordealOdds().chance; s.body.taint = 0
    assert(low < gs.ordealOdds().chance, 'taint lowers the odds')
    const r = force(sim, 0, () => gs.answerOrdeal('endure'))
    assert(r.ok && r.clean && s.body.btBonus === 0.02 && s.body.cleanEndures === 1, 'Endure clean: full XP + Thunder Peak’s +2% breakthrough')
    s.body.btBonus = 0.06; gs.startTempering('thunder_peak'); pass(sim, 86401); gs.tick(1); force(sim, 0, () => gs.answerOrdeal('endure'))
    assert(s.body.btBonus === C.btBonusCap, 'Thunder Peak’s edge caps for the life')
    gs.startTempering('thunder_peak'); pass(sim, 86401); gs.tick(1)
    const hp0 = s.health
    const r2 = force(sim, 0.999, () => gs.answerOrdeal('endure'))
    assert(!r2.clean && s.health < hp0 && s.health >= 1, 'a bad roll costs Health and never kills')
    // Ease off pays half
    s.body.xp = 20000; gs.startTempering('thunder_peak'); pass(sim, 86401); gs.tick(1)
    const e = gs.answerOrdeal('ease')
    assert(e.ok && e.xp === Math.round(15000 * C.easeXp), 'Ease off pays half the XP')
    // Draw on Qi needs the Qi
    gs.startTempering('thunder_peak'); pass(sim, 86401); gs.tick(1); s.qi = 0
    assert(gs.answerOrdeal('qi').reason === 'qi', 'Draw on Qi needs 10% of the stage’s Qi')
    s.qi = s.derived.qiCap; const q = gs.answerOrdeal('qi')
    assert(q.ok && s.qi < s.derived.qiCap, 'Draw on Qi spends Qi and comes through safe')
    // Monte Carlo of the endure odds
    s.body.taint = 1; s.body.cleanEndures = 0; s.body.scars = []; s.health = gs.maxHealth() * 0.6
    const want = gs.ordealOdds().chance
    let clean = 0, N = 2000
    for (let i = 0; i < N; i++) { s.body.active = { id: 'icy_waterfall', startedAt: 0, endsAt: 0, xp: 1, crisis: true }; s.health = gs.maxHealth() * 0.6; s.body.scars = []; s.body.taint = 1; s.body.cleanEndures = 0
      if (gs.answerOrdeal('endure').clean) clean++ }
    assert(Math.abs(clean / N - want) < 0.04, `Endure’s clean rate matches the shown odds (${(clean / N * 100).toFixed(1)}% vs ${(want * 100).toFixed(1)}%)`)
    // the bank cap
    s.body.tier = 0; s.body.xp = 0; gs._gainBodyXp(1e9)
    assert(s.body.xp === gs._bodyXpCap() && s.body.xp === 200 + D.BODY_BANK_FRAC * 800, 'XP banks past the mark only to the cap')
  }

  // ── Grave scars ──
  { const { sim, gs, s } = await setup(4, 10)
    s.body.taint = 2; s.body.active = { id: 'icy_waterfall', startedAt: 0, endsAt: 0, xp: 100, crisis: true }
    let calls = 0; const M = sim.ev('Math'), rr = M.random; M.random = () => (++calls === 1 ? 0.999 : 0)
    let r; try { r = gs.answerOrdeal('endure') } finally { M.random = rr }
    assert(r.scar === 'shattered_meridians', 'tainted (≥ 2), a failed ordeal leaves a grave scar')
    gs._recalc()
    assert(gs.maxHealth() === 90 && gs.healthRegenSeconds() > 45, 'Shattered Meridians: −10% max Health, slower regen')
    assert(gs.mendScar(0).ok && gs.maxHealth() === 100 && s.inventory.pill_golden_marrow === 1, 'a Golden Marrow Pill mends it')
  }

  // ── The tier trial ──
  { const { sim, gs, s, D } = await setup(5, 10)
    s.body.xp = 600; pass(sim, 60); gs.tick(1)
    assert(s.body.tier === 0 && gs.tierTrialInfo().ready, 'a full bar never raises the tier on its own')
    s.spiritStones = 0
    assert(gs.attemptTierTrial('marrow').reason === 'cost', 'the marrow way needs its stones + Beast Cores')
    s.spiritStones = 1000
    const f = force(sim, 0.999, () => gs.attemptTierTrial('marrow'))
    assert(!f.win && s.body.xp === Math.round(D.TIER_TRIAL.failKeepXp * 600) && s.body.tier === 0, 'a failed trial keeps 70% of the progress')
    s.body.xp = 600; s.health = 100
    const w = force(sim, 0, () => gs.attemptTierTrial('marrow'))
    assert(w.win && s.body.tier === 1 && s.health === 120, 'a won trial raises the tier, and Health rises with the new max')
    s.body.xp = 3000; s.health = 120
    const b = force(sim, 0.5, () => gs.attemptTierTrial('bitter'))
    assert(b.ok && s.health <= 120 - Math.round(120 * D.TIER_TRIAL.bitter.healthFrac) + (b.win ? 30 : 0), 'the bitter way pays in Health')
  }

  // ── Blood Forging ──
  { const { sim, gs, s, D } = await setup(6, 10)
    s.karma = 20; gs._recalc()
    const row = gs.temperingList().find(x => x.id === 'blood_forging')
    assert(row?.ok, 'Blood Forging opens once karma falls low')
    const hp = s.health, k = s.karma
    gs.startTempering('blood_forging')
    assert(s.health === hp - D.BLOOD_FORGING.health && s.karma === k + D.BLOOD_FORGING.karma && s.body.taint === 1 && s.body.bloodForgings === 1, 'it costs Health, karma and adds taint')
    assert(row.xp > gs.methodXp(D.TEMPERING_METHODS.find(m => m.id === 'icy_waterfall')) / 2, 'it pays far more than its hours would elsewhere')
    s.karma = 90; gs.cancelTempering()
    assert(gs.temperingList().some(x => x.id === 'blood_forging'), 'once forged, it stays on the list')
  }

  // ── Auto-Temper ──
  { const { sim, gs, s } = await setup(7, 10)
    s.playMode = 'idle'; gs.setAutomation('autoTemper', true)
    gs.startTempering('iron_fist'); pass(sim, 1801); gs.tick(1)
    assert(s.body.active?.id === 'iron_fist', 'Auto-Temper repeats your last safe drill')
    assert(gs.setAutomation('autoTemperId', 'icy_waterfall').reason === 'invalid', 'Auto-Temper can never be pointed at an ordeal')
    s.body.active = null; s.body.last = 'iron_fist'; gs.startTempering('icy_waterfall'); pass(sim, 43201); gs.tick(1)
    assert(s.body.active?.crisis, 'an ordeal stops at its crisis even with Auto-Temper on (it never answers for you)')
  }

  // ── Mini-games ──
  { const { sim, gs, s, D } = await setup(8, 10)
    const M = s.minigames
    for (let i = 0; i < 3; i++) { const r = gs.startMinigame('strikes'); pass(sim, 10); gs.finishMinigame('strikes', { hits: Array(8).fill('good') }) }
    assert(M.strikes.charges === 0 && gs.startMinigame('strikes').reason === 'charges', 'three charges, then none')
    pass(sim, D.MINIGAME_CHARGES.refillSecs * 10); gs.tick(1)
    assert(M.strikes.charges === D.MINIGAME_CHARGES.max, 'charges refill on real time (closed too) and cap at 3')
    gs.startMinigame('strikes'); pass(sim, 0.5)
    const fast = gs.finishMinigame('strikes', { hits: Array(D.STRIKES.strikes).fill('perfect') })
    assert(fast.points === 0, 'a run faster than the marker can cross scores nothing')
    gs.startMinigame('strikes'); pass(sim, 10)
    const forged = gs.finishMinigame('strikes', { hits: Array(50).fill('perfect') })
    assert(forged.points === D.STRIKES.strikes * 3 && forged.xp <= gs.strikesXp(D.STRIKES.strikes * 3), 'a forged result is clamped to the strike count')
    gs.startTempering('boulder'); pass(sim, 10); gs.tick(1)
    const left0 = s.body.active.endsAt - sim.clock.now
    gs.startMinigame('strikes'); pass(sim, 10)
    gs.finishMinigame('strikes', { hits: Array(D.STRIKES.strikes).fill('perfect'), use: 'cut' })
    const left1 = s.body.active.endsAt - sim.clock.now
    assert(left1 < left0 * 0.8 && left1 >= (left0 - 10000) * (1 - D.STRIKES.cutMax) - 1000, 'the cut option shortens a running tempering (to 24%)')
    // Flow: always solvable; the engine checks the answer
    const FP = sim.ev('FlowPuzzle'); let ok = true
    for (let seed = 1; seed < 200; seed++) for (const n of [4, 5, 6]) {
      const p = FP.generate(seed, n)
      if (!FP.isSolved(p.solved, n, p.source) || FP.isSolved(p.shown, n, p.source)) ok = false
    }
    assert(ok, 'every Meridian Flow puzzle is solvable and never dealt already solved (600 puzzles)')
    const r = gs.startMinigame('flow'), p = FP.generate(r.session.seed, r.session.n)
    const turns = p.shown.map((m, i) => [0, 1, 2, 3].find(t => FP.rot(m, t) === p.solved[i]))
    s.qi = 0; pass(sim, 30)
    const bad = gs.finishMinigame('flow', { rotations: turns.map(() => 0) })
    assert(!bad.solved && s.qi === 0, 'the engine rejects an unsolved grid (no Qi)')
    const r2 = gs.startMinigame('flow'), p2 = FP.generate(r2.session.seed, r2.session.n)
    s.qi = s.derived.qiCap - 5; pass(sim, 30)
    const good = gs.finishMinigame('flow', { rotations: p2.shown.map((m, i) => [0, 1, 2, 3].find(t => FP.rot(m, t) === p2.solved[i])) })
    assert(good.solved && s.qi <= s.derived.qiCap && good.qi <= 5, 'Flow Qi never crosses the cap')
    // No clock (user 2026-10-03): set aside → resume with your turns, no new charge; the full reward however long it took
    s.minigames.flow.charges = 2; s.minigames.flow.hour = []
    const r3 = gs.startMinigame('flow'), p3 = FP.generate(r3.session.seed, r3.session.n)
    const sol3 = p3.shown.map((m, i) => [0, 1, 2, 3].find(t => FP.rot(m, t) === p3.solved[i]))
    assert(gs.finishMinigame('flow', { setAside: true, turns: [1, 2, 3] }).setAside && s.minigames.flow.session, 'closing a Flow puzzle sets it aside')
    const r4 = gs.startMinigame('flow')
    assert(r4.resumed && r4.session.seed === r3.session.seed && r4.session.turns[1] === 2 && s.minigames.flow.charges === 1, 'reopening resumes it, with your turns, for no new charge')
    s.qi = 0; pass(sim, 3600)
    const late = gs.finishMinigame('flow', { rotations: sol3 })
    assert(late.solved && late.qi === Math.round(s.derived.qiCap * D.FLOW.qiFrac), 'an hour later, a finished puzzle still pays the full Qi (no clock)')
  }

  // ── Death resets the body; the charges carry ──
  { const { sim, gs, s } = await setup(9, 10)
    s.body.tier = 5; s.body.xp = 90000; s.minigames.flow.charges = 1
    gs._die('test')
    assert(gs.get().body.tier === 0 && gs.get().body.xp === 0 && gs.get().minigames.flow.charges === 1, 'a new life starts in a Frail Body; mini-game charges are the player’s and carry')
  }

  // ── A child's body ──
  { const { sim, gs, s, D } = await setup(10, 10)
    const c = { id: 'kid1', given: 'Mei', alive: true, bond: 50, personality: 'stoic', bornYear: Math.floor(s.world.year) - 12, stageIndex: 2, xp: 0 }
    s.family.children = [c]
    const pr = gs.childActionPreview('kid1', 'temper')
    assert(pr.ok && pr.items?.[0]?.id === 'beast_core', 'Temper their body costs a Beast Core')
    for (let i = 0; i < D.CHILD_BODY.perTier; i++) { c.cd = {}; gs.childAction('kid1', 'temper') }
    assert(c.bodyTier === 1, `every ${D.CHILD_BODY.perTier} sessions raise the child’s body a tier`)
    const pp = gs._personPowerParts(c)
    assert(pp.parts.some(x => /body/i.test(x.label) && x.value === D.BODY_TIERS[1].power), 'a child’s body adds to their fight power')
    c.cd = {}; c.bornYear = Math.floor(s.world.year) - 3
    assert(gs.childActionPreview('kid1', 'temper').reason === 'young', 'too young to drill below age 8')
  }
})().catch(e => { console.log('FAIL crashed:', e.message); process.exitCode = 1 })
