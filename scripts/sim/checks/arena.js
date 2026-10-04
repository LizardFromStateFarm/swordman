// Scenario checks — docs/systems/combat.md → "A6-3b: the Arena". Rings lock by realm, rosters fill (4 + a champion) with
// duelists kept outside the world registry, the entry fee starts a run, a win fills the purse (prize × streak × renown ×
// blood) and raises the streak, each duelist once per run, the champion answers only after ARENA_CHAMP_AFTER wins and
// grants the title, walking away pays the purse, a loss pays half and ends the run, a lost blood match kills you (cause
// arena_blood), a coward refuses blood, humbling in the arena gives renown (and never cows the clan), sect fame from wins,
// a grudge call-out (accept → a grudge match with no fee · decline → −renown), a debtor's gift, the purse breakdown sums,
// migration. Run: npm run checks · node scripts/sim/checks/arena.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

async function setup(seed, stage = 5, stones = 1e5) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100; s.spiritStones = stones; s.karma = 50
  gs._recalc()
  return { sim, gs, s, K: n => sim.ev(n) }
}
// Win (or lose) the current bout on moves (fight-helpers.js); a won bout then takes `end` (default raise / finish).
// Wounds carry between bouts (1.14a); a won bout here heals you back to full so each check starts the next bout fresh.
function bout(sim, gs, how, end = null) {
  let r = playFight(gs, how)
  const fi = gs.get().family.fight
  if (fi?.over === 'won') { r = gs.personFightFinish(end || (fi.lethal ? 'finish' : 'raise')); gs.get().health = 100 }
  return r
}
const iron = gs => gs.arenaInfo().rings.find(r => r.id === 'iron')

;(async () => {
  // ── Rings + rosters ──
  { const { gs, s, K } = await setup(1, 5)
    const info = gs.arenaInfo()
    assert(info.rings.length === 6 && info.rings.filter(r => r.open).map(r => r.id).join() === 'dust,iron', `stage 5: Dust + Iron open (${info.rings.filter(r => r.open).map(r => r.id)})`)
    const R = iron(gs)
    assert(R.rows.length === K('ARENA_ROSTER') + 1 && R.rows.filter(r => r.champion).length === 1, `a roster of ${K('ARENA_ROSTER')} + a champion`)
    assert(R.rows.every(r => s.arena.duelists[r.id] && (!s.world.persons[r.id] || s.world.persons[r.id].id === r.id)), 'duelists live in s.arena (4.5: a known face cast into a ring keeps their registry id)')
    assert(R.rows.find(r => r.champion).lock === 'champion', 'the champion waits for wins in a run')
    assert(info.rings.find(r => r.id === 'jade').rows.length === 0, 'a locked ring has no roster yet')
    const again = gs.arenaInfo(); assert(iron(gs).rows.map(r => r.id).join() === R.rows.map(r => r.id).join(), 'rosters are stable between looks') }

  // ── A run: fee, purse, streak, walk away ──
  { const { sim, gs, s, K } = await setup(2, 8)
    const R = iron(gs), foes = R.rows.filter(r => !r.champion), st0 = s.spiritStones
    const p1 = foes[0].prize
    const r0 = gs.startArenaBout('iron', foes[0].id)
    assert(r0.ok && s.spiritStones === st0 - 4 && s.arena.run && s.family.fight?.kind === 'arena' && !s.family.fight.lethal, 'the fee starts a run; the bout is until one yields')
    gs._recalc()
    assert(s.family.fight?.kind === 'arena', 'the bout survives a recalc (the family load guard knows arena duelists)')
    const r1 = bout(sim, gs, 'win')
    assert(r1.outcome === 'arena_won' && s.arena.run.purse === p1 && s.arena.run.streak === 1, `a win fills the purse (+${p1})`)
    assert(gs.startArenaBout('iron', foes[0].id).reason === 'beaten', 'each duelist once per run')
    const p2 = iron(gs).rows.find(r => r.id === foes[1].id).prize
    assert(p2 === Math.round(8 * (1 + K('ARENA_STREAK_STEP')) * gs.arenaInfo().mult.renown), `the streak raises the next purse (${p2})`)
    gs.startArenaBout('iron', foes[1].id); bout(sim, gs, 'win')
    const purse = s.arena.run.purse, st1 = s.spiritStones
    const w = gs.arenaWalkAway()
    assert(w.ok && s.spiritStones === st1 + purse && !s.arena.run && s.arena.best === 2, `walk away: +${purse}, best streak 2`)
    assert(s.arena.renown === 2 * K('ARENA_RENOWN').win, `renown ${s.arena.renown}`)
    const rest = gs.arenaInfo().restUntil, now = sim.ev('Date.now()')
    assert(gs.startArenaBout('iron', foes[2].id).reason === 'resting' && rest > now, `after a run the Arena rests (${Math.round((rest - now) / 1000)} s)`)
    s.arena.restUntil = 0
    assert(gs.startArenaBout('iron', foes[2].id).ok, 'once raked, the gates open again') }

  // ── Champion + title; loss pays half ──
  { const { sim, gs, s, K } = await setup(3, 12)
    const R = iron(gs), foes = R.rows.filter(r => !r.champion), champ = R.rows.find(r => r.champion)
    for (let i = 0; i < K('ARENA_CHAMP_AFTER'); i++) { gs.startArenaBout('iron', foes[i].id); bout(sim, gs, 'win') }
    assert(!iron(gs).rows.find(r => r.champion).lock, 'the champion answers after enough wins')
    gs.startArenaBout('iron', champ.id); bout(sim, gs, 'win')
    assert(s.arena.titles.includes('iron') && gs.arenaInfo().titles[0] === 'Master of the Iron Bell', 'beating the champion: the title')
    const purse = s.arena.run.purse, st = s.spiritStones
    gs.startArenaBout('iron', foes[3].id); const r = bout(sim, gs, 'lose')
    assert(r.outcome === 'arena_lost' && !s.arena.run && s.spiritStones === st + Math.floor(purse * 0.5) && s.health >= 1, `a loss ends the run, pays half (${Math.floor(purse * 0.5)}), you live`) }

  // ── Blood: ×3, a coward refuses, finishing costs karma, losing kills ──
  { const { sim, gs, s, K } = await setup(4, 8)
    const R = iron(gs), foe = R.rows.find(r => !r.champion)
    const cow = s.arena.duelists[R.rows.find(r => !r.champion && r.id !== foe.id).id]; cow.personality = 'coward'
    assert(iron(gs).rows.find(r => r.id === cow.id).bloodLock === 'no_blood', 'a coward refuses a blood match')
    assert(iron(gs).rows.find(r => r.id === foe.id).bloodPrize === foe.prize * 3, 'a blood match pays ×3')
    gs.startArenaBout('iron', foe.id, true)
    assert(s.family.fight.lethal, 'blood: to the death')
    const k0 = s.karma; bout(sim, gs, 'win', 'finish')
    assert(s.arena.duelists[foe.id]?.alive === false && s.karma === k0 + K('ARENA_KILL_KARMA') && s.arena.record.kills === 1, 'finishing a duelist: they die, karma pays')
    gs.arenaWalkAway(); const fresh = iron(gs).rows.filter(r => !r.champion)
    assert(fresh.length === K('ARENA_ROSTER') && !fresh.some(r => r.id === foe.id), 'the dead are replaced in the roster after the run') }
  { const { sim, gs, s } = await setup(5, 8)
    const foe = iron(gs).rows.find(r => !r.champion)
    gs.startArenaBout('iron', foe.id, true); const r = bout(sim, gs, 'lose')
    assert(r.outcome === 'died' && gs.get().interlude && gs.get().lastReincarnation?.cause === 'arena_blood', `a lost blood match kills you (cause ${gs.get().lastReincarnation?.cause})`) }

  // ── Humble: renown, not a cowed clan; sect fame ──
  { const { sim, gs, s, K } = await setup(6, 8)
    s.ownSect.founded = true; gs._recalc(); const fame0 = s.derived.sectFame
    const foe = iron(gs).rows.find(r => !r.champion)
    gs.startArenaBout('iron', foe.id); bout(sim, gs, 'win', 'humble')
    assert(s.arena.duelists[foe.id].feud && s.family.cowedUntilYear == null && s.arena.renown === K('ARENA_RENOWN').win + K('ARENA_RENOWN').humble, 'humbling in the arena: renown, a feud, the clan is not cowed')
    gs._recalc(); assert(s.derived.sectFame === fame0 + 4, `a founder's sect gains fame from the win (${fame0} → ${s.derived.sectFame})`) }

  // ── Call-outs + gifts ──
  { const { sim, gs, s, K } = await setup(7, 8, 0)
    const foe = iron(gs).rows.find(r => !r.champion), p = s.arena.duelists[foe.id]
    p.feud = 'grudge'; p.personality = 'psycho'
    rng(sim, 0); gs._tickArena(); unrng(sim)
    assert(s.arena.callout?.id === p.id && s.arena.callout.blood, 'a psycho grudge-holder calls you out, to the death')
    assert(gs.arenaInfo().callout.prize === Math.round(8 * K('ARENA_CALLOUT_MULT') * 3 * gs.arenaInfo().mult.renown), 'a grudge match pays double the ring prize (×3 blood)')
    const r = gs.answerArenaCallout(true)
    assert(r.fight && s.family.fight?.kind === 'arena' && s.family.fight.lethal && s.spiritStones === 0, 'accepting: their stakes, no fee')
    s.family.fight = null; s.arena.run = null
    p.feud = 'grudge'; rng(sim, 0); gs._tickArena(); unrng(sim)
    const rn = s.arena.renown; gs.answerArenaCallout(false)
    assert(s.arena.renown === rn + K('ARENA_RENOWN').declined && p.feud === 'grudge' && !s.arena.callout, 'declining: −renown, the grudge stays')
    p.feud = 'debt'; const st = s.spiritStones
    rng(sim, 0); gs._tickArena(); unrng(sim)
    assert(s.spiritStones === st + 8 && p.feud === null, 'a debtor sends a gift; the debt is paid') }

  // ── The purse card + migration ──
  { const { sim, gs, s } = await setup(8, 8)
    s.arena.renown = 40; const foe = iron(gs).rows.find(r => !r.champion)
    gs.startArenaBout('iron', foe.id); bout(sim, gs, 'win')
    const m = gs.arenaInfo().run.mult
    assert(Math.abs(m.total - m.streak * m.renown) < 1e-9 && Math.abs(m.renown - (1 + 41 * 0.005)) < 1e-9, `purse multiplier = streak × renown (${m.streak} × ${m.renown}; renown 40 + the win)`) }
  { const { gs } = await setup(9, 3)
    const s = gs.get(); delete s.arena; gs._ensurePhase35Fields()
    assert(s.arena && s.arena.run === null && Array.isArray(s.arena.titles) && s.arena.record.bouts === 0, 'an old save gets a blank Arena')
    s.family.fight = { kind: 'arena', oppId: 'nobody', lethal: false, p: 0.5, to: 3, you: 0, them: 0, round: 1, log: [], year: 1 }
    gs._ensurePhase35Fields()
    assert(s.family.fight === null, 'an arena bout whose duelist is gone is dropped') }
})()
