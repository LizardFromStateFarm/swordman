// Scenario checks — docs/systems/combat.md (Phase 41): tame talisman grades + tame attempts. The four grades and
// their escalating chances, item/recipe wiring, the tame roll (success consumes one of the CHOSEN grade), a failed
// direct tame turning into a fight or a clean escape (nature-weighted, never forced on the wounded), the grateful
// free tame, and the post-battle bind roll (a failure = it escapes). Run: npm run checks · node scripts/sim/checks/talismans.js.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
// Force a fixed SEQUENCE of Math.random draws (the tame roll, then the fight/flee roll) for determinism.
const rseq = (sim, vals) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; globalThis.__seq = ${JSON.stringify(vals)}; globalThis.__i = 0; Math.random = () => globalThis.__seq[globalThis.__i < globalThis.__seq.length ? globalThis.__i++ : globalThis.__seq.length - 1]`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

async function setup(seed, stage, typeId, extra = {}) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100
  s.beastEncounters = [{ id: 'e1', typeId, traits: ['soul_bond', 'qi_devour', 'spirit_nose'], seenAt: 0, ...extra }]
  s.beasts = []; s.inventory = {}
  gs._recalc()
  return { sim, gs, s }
}
// Win the e1 fight outright (every exchange won).
function winFight(sim, gs) {
  rseq(sim, [0])
  for (let i = 0; i < 20; i++) { const r = gs.fightExchange('press'); if (!r.ok || r.done || r.over) break }
  unrng(sim)
}

;(async () => {
  // ── The grade table + item/recipe wiring ──
  { const { sim } = await setup(1, 5, 'spirit_fox')
    const D = sim.data, G = D.TALISMAN_GRADES, O = D.TALISMAN_GRADE_ORDER
    assert(O.length === 4 && O.join() === 'crude,fine,superior,pristine', `four grades, in order (${O.join(', ')})`)
    assert(Math.abs(G.crude.tameChance - 0.40) < 1e-9 && Math.abs(G.pristine.tameChance - 0.90) < 1e-9
      && O.every((g, i) => i === 0 || G[g].tameChance > G[O[i - 1]].tameChance), 'higher grades tame likelier (40 → 90%)')
    const holes = []
    for (const g of O) {
      const it = D.ITEMS[G[g].itemId]
      if (!it) holes.push(`${g}: no item`)
      else if (it.effect?.type !== 'tame_beast' || it.effect.grade !== g || it.category !== 'key') holes.push(`${g}: bad item`)
      if (!D.RECIPES.some(r => r.productId === G[g].itemId && r.category === 'talismans')) holes.push(`${g}: no recipe`)
    }
    assert(!holes.length, `every grade has a key item + a talismans recipe${holes.length ? ' — ' + holes.join(', ') : ''}`)
    assert(G.crude.itemId === 'beast_taming_talisman', 'the crude grade keeps the original item id (old saves still tame)') }

  // ── tameInfo: best grade held + counts + shown chance ──
  { const { gs, s } = await setup(2, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman: 1, beast_taming_talisman_fine: 2 }
    const ti = gs.tameInfo('e1')
    assert(ti.best === 'fine' && ti.chance === 0.55 && ti.grades.find(g => g.id === 'crude').count === 1 && ti.grades.find(g => g.id === 'pristine').count === 0,
      `tameInfo: best held = fine (55%), counts read from the pack`)
    s.inventory = {}
    assert(gs.tameInfo('e1').canTame === false && gs.tameInfo('e1').why === 'no_talisman' && gs.tameEncounteredBeast('e1').reason === 'no_talisman',
      'no talisman → no_talisman, and tameInfo says why') }

  // ── The tame roll: success consumes one of the CHOSEN grade, leaves the rest ──
  { const { sim, gs, s } = await setup(3, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman: 1, beast_taming_talisman_fine: 2 }
    rseq(sim, [0.10]); const r = gs.tameEncounteredBeast('e1', 'crude'); unrng(sim)
    assert(r.ok && r.grade === 'crude' && r.chance === 0.40, 'a low roll tames')
    assert(!s.inventory.beast_taming_talisman && s.inventory.beast_taming_talisman_fine === 2, 'it consumes the grade you used, not the others')
    assert(s.beasts.length === 1 && s.beasts[0].level === 1 && !s.beastEncounters.some(e => e.id === 'e1'), 'the beast joins at Lv.1 and the sighting is gone') }

  // ── The boundary: below the grade's chance tames, at/above it fails ──
  { const { sim, gs, s } = await setup(4, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman: 1 }
    rseq(sim, [0.39]); const a = gs.tameEncounteredBeast('e1', 'crude'); unrng(sim)
    assert(a.ok, 'crude at a 0.39 roll tames')
    const { sim: sim2, gs: g2, s: s2 } = await setup(5, 5, 'spirit_fox')
    s2.inventory = { beast_taming_talisman: 1 }
    rseq(sim2, [0.41, 0.99]); const b = g2.tameEncounteredBeast('e1', 'crude'); unrng(sim2)
    assert(b.reason === 'tame_failed' && b.outcome === 'flee', 'crude at a 0.41 roll fails') }

  // ── A failed tame fails into a fight or a clean escape ──
  { const { sim, gs, s } = await setup(6, 5, 'spirit_fox')   // wild → fight chance 0.5
    s.inventory = { beast_taming_talisman: 1 }
    rseq(sim, [0.99, 0.99]); const flee = gs.tameEncounteredBeast('e1', 'crude'); unrng(sim)
    assert(flee.outcome === 'flee' && !s.beastEncounters.some(e => e.id === 'e1'), 'a failed tame can bolt: the sighting is gone') }
  { const { sim, gs, s } = await setup(7, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman: 1 }
    rseq(sim, [0.99, 0.0]); const f = gs.tameEncounteredBeast('e1', 'crude'); unrng(sim)
    assert(f.outcome === 'fight' && s.beastEncounters.some(e => e.id === 'e1'), 'a failed tame can turn it hostile: the sighting stays')
    assert(s.family.fight && s.family.fight.kind === 'beast' && s.family.fight.stance === 'slay' && s.family.fight.beast.encId === 'e1', 'it starts a real battle against it (Slay stance)')
    assert(gs.tameEncounteredBeast('e1').reason === 'fighting', 'you cannot tame it while fighting it') }
  { const { sim, gs, s } = await setup(8, 5, 'spirit_fox')   // too wounded to be forced into a lethal fight
    s.inventory = { beast_taming_talisman: 1 }; s.health = 10
    rseq(sim, [0.99, 0.0]); const r = gs.tameEncounteredBeast('e1', 'crude'); unrng(sim)
    assert(r.outcome === 'flee' && !s.family.fight && !s.beastEncounters.some(e => e.id === 'e1'), 'near death it flees rather than force a fight you might die in') }

  // ── Nature weights the fight/flee split ──
  { const { gs } = await setup(9, 5, 'spirit_fox')
    const fell = gs._tameFightChance('fell', null), wild = gs._tameFightChance('wild', null), benign = gs._tameFightChance('benign', null)
    assert(fell > wild && wild > benign && benign >= 0.2 && fell <= 0.9, `a man-eater turns on you more than a guardian (fell ${fell} > wild ${wild} > benign ${benign})`) }

  // ── An unheld grade falls back to the best you carry; the grateful free tame never rolls ──
  { const { sim, gs, s } = await setup(10, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman_pristine: 1 }
    rseq(sim, [0.10]); const r = gs.tameEncounteredBeast('e1', 'crude'); unrng(sim)
    assert(r.grade === 'pristine', 'asking for a grade you do not hold uses the best you carry') }
  { const { sim, gs, s } = await setup(11, 5, 'spirit_fox', { mood: 'grateful' })
    s.inventory = {}
    rseq(sim, [0.999]); const r = gs.tameEncounteredBeast('e1'); unrng(sim)
    assert(r.ok && r.chance === 1 && s.beasts.length === 1, 'a grateful beast comes freely, no talisman and no roll') }

  // ── The post-battle bind also rolls: success joins at Lv.2, a failure escapes ──
  { const { sim, gs, s } = await setup(12, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman: 2 }
    gs.startBeastFight('e1', 'slay'); winFight(sim, gs)
    const ch = gs.beastFightChoices()
    rseq(sim, [0.10]); const f = gs.beastFightFinish('bind', 'crude'); unrng(sim)
    assert(ch.bindGrade === 'crude' && ch.bindChance === 0.40, 'the bind card shows the best grade + its chance')
    assert(f.ok && f.beast.level === 2 && s.inventory.beast_taming_talisman === 1, 'bind: joins at Lv.2 for one talisman') }
  { const { sim, gs, s } = await setup(13, 5, 'spirit_fox')
    s.inventory = { beast_taming_talisman_pristine: 1 }
    gs.startBeastFight('e1', 'slay'); winFight(sim, gs)
    rseq(sim, [0.99]); const f = gs.beastFightFinish('bind', 'pristine'); unrng(sim)
    assert(f.ok && f.bindFailed && f.outcome === 'bind_failed' && s.beasts.length === 0, 'a failed bind: the beast escapes (no companion)')
    assert(!s.inventory.beast_taming_talisman_pristine, 'the talisman is spent even on a failed bind') }
  { const { sim, gs, s } = await setup(14, 5, 'spirit_fox')
    gs.startBeastFight('e1', 'slay'); winFight(sim, gs)
    assert(gs.beastFightChoices().bindLock === 'no_talisman' && gs.beastFightFinish('bind').reason === 'no_talisman', 'bind is locked without a talisman')
    assert(s.family.fight, 'a locked bind leaves the choice open') }
})()
