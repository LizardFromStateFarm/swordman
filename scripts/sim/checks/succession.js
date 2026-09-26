// Scenario checks — clan-succession.md 2.6d: death → heir bet → the heir's reign + chronicle → rebirth. Named heir (no
// bet), the bet as a non-head, bet validation, parenting-style roll (bond/personality/trauma), branch founding, sect
// fortunes + stipend, rebirth positions (bet won/lost weights), orphan birth + returning to the last clan, extinct
// clan, the rare rival-family rebirth, interlude pauses the clock + survives save/load, upbringing event, head-only
// heir naming, and a long multi-generation chain (invariants hold, registry stays bounded).
// Run: npm run checks (all) · node scripts/sim/checks/succession.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

// A first-life head (stage 18) married with `nKids` adult children (stages 5…), optional named heir.
async function headWithKids(seed, nKids, opts = {}) {
  const sim = await createSim({ seed, overrides: opts.overrides || [] }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.name = 'Lin Mei'; s.stageIndex = 18; s.maxStageThisLife = 18; s.spiritStones = 1e6; s.karma = 50; gs._recalc()
  s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
  const f = gs.get().family; f.planning = 'none'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
  const kids = []
  for (let i = 0; i < nKids; i++) {
    const c = gs._makeChild(f.spouse); c.bornYear -= 40; c.stageIndex = 5 + i; c.maxStage = c.stageIndex
    c.personality = opts.pers || 'stoic'; c.bond = opts.bond ?? 60; kids.push(c)
  }
  return { sim, gs, f, kids }
}
const clanOf = gs => { const w = gs.get().world; return w.clans[w.playerClanId] }

;(async () => {
  // 1. Head dies with a named heir → no bet; the heir takes the seat; a sibling founds a branch; chronicle written.
  { const { gs, kids } = await headWithKids(1, 4)
    gs.chooseHeir(kids[1].id)
    const clanId = gs.get().world.playerClanId, yr = Math.floor(gs.get().world.year)
    gs.passTheMantle()
    const s = gs.get(), info = gs.interludeInfo(), clan = s.world.clans[clanId]
    assert(s.interlude && info.step === 'chronicle' && info.successor.id === kids[1].id && info.heirKind === 'chosen', 'named heir → no bet, straight to the chronicle')
    assert(clan.name === 'Lin', `an unnamed founding clan takes your surname at death (${clan.name})`)
    assert(clan.headId === kids[1].id && s.world.persons[kids[1].id].role === 'head' && s.world.persons[kids[1].id].parentingStyle in { nurturing: 1, strict: 1, neglectful: 1, ruthless: 1 }, `heir is head with a style (${s.world.persons[kids[1].id].parentingStyle})`)
    assert(clan.lines.length === 2 && clan.lines[1].headId === kids[3].id && !clan.lines[0].memberIds.includes(kids[3].id), 'the strongest other adult sibling founds a branch (and leaves the main line)')
    assert(info.chronicle.length >= 4 && clan.history.some(h => h.year === yr), `chronicle ${info.chronicle.length} lines, saved to clan.history`)
    assert(!clan.pendingSuccession, 'pendingSuccession consumed')
    const age0 = s.age, y0 = s.world.year
    gs.tick(60)
    assert(gs.get().world.year === y0 && gs.get().age === age0, 'interlude: the clock does not move')
    assert(gs.chooseRebirth('nope').reason === 'bad_choice' && gs.placeBet(kids[0].id).reason === 'no_bet', 'bad rebirth choice / late bet rejected')
    const r = gs.chooseRebirth('clan'), s2 = gs.get()
    assert(r.ok && !s2.interlude && s2.birth && ['eldest', 'younger', 'branch', 'rival'].includes(s2.birth.position), `reborn: ${s2.birth.position}`)
    assert(s2.world.year - yr === s2.interlude?.reignYears || (s2.world.year - yr >= 40 && s2.world.year - yr <= 80), `world jumps a generation (${yr} → ${s2.world.year})`)
    assert(s2.self.family === 'Lin' && s2.name.startsWith('Lin ') && s2.self.parents.length === 2 && s2.self.bornYear === s2.world.year - 16, `you are ${s2.name}, born ${s2.self.bornYear}, with two parents`)
    const c2 = clanOf(gs)
    assert(c2.headId !== s2.self.id && c2.lines.some(l => l.id === s2.world.playerLineId && l.memberIds.includes(s2.self.id)) && !s2.world.persons[s2.self.id], 'on the roster, not head, not in the registry')
    assert(s2.birth.headBond >= 0 && s2.birth.headBond <= 100 && s2.upbringing?.due > s2.world.year, `bond with the head ${s2.birth.headBond}; upbringing due`)
    assert(gs.chooseHeir(kids[0].id).reason === 'not_head' && gs.startTournament().reason === 'not_head', 'only the clan head names an heir / hosts a tournament')
  }

  // 2. Second death as a non-head → the old head steps down; you bet on their children.
  { const { gs } = await headWithKids(2, 5)
    gs.passTheMantle(); gs.finishInterlude('clan')
    const clan = clanOf(gs), oldHead = clan.headId
    gs.passTheMantle()
    const info = gs.interludeInfo()
    assert(info.step === 'bet' && info.candidates.length >= 2 && info.candidates.every(p => p.parents.includes(oldHead)), `non-head death: bet among the head's ${info.candidates.length} children`)
    assert(gs.placeBet('p999999').reason === 'bad_candidate', 'bet on a stranger rejected')
    const pick = info.candidates[info.candidates.length - 1].id
    const r = gs.placeBet(pick), after = gs.interludeInfo()
    assert(r.ok && after.step === 'chronicle' && after.betWon === (after.successor.id === pick), `bet ${r.won ? 'won' : 'lost'} — recorded consistently`)
    assert(gs.get().world.persons[oldHead].role === 'elder' && gs.get().world.persons[oldHead].alive !== false, 'old head steps down into seclusion (alive — nobody dies of age)')
    gs.chooseRebirth('clan')
    assert(gs.get().lastReincarnation.birth.betWon === r.won && gs.get().lastReincarnation.heirKind === 'clan', 'bet + clan pick recorded on lastReincarnation')
  }

  // 3. Parenting style roll: the inputs push the odds the right way.
  { const { gs } = await headWithKids(3, 1)
    const roll = (p, n = 400) => { const c = {}; for (let i = 0; i < n; i++) { const st = gs._rollStyle(p).style; c[st] = (c[st] || 0) + 1 } return c }
    const warm = roll({ bond: 95, morality: 60, personality: 'niceguy' }), cold = roll({ bond: 5, morality: -80, personality: 'psycho' })
    assert(warm.nurturing > 200 && (cold.ruthless || 0) > 200, `loved niceguy → nurturing ${warm.nurturing}/400; neglected psycho → ruthless ${cold.ruthless}/400`)
    const paths = {}; for (let i = 0; i < 400; i++) { const r = gs._rollStyle({ bond: 50, morality: 0, personality: 'stoic', trauma: true }); paths[r.traumaPath] = (paths[r.traumaPath] || 0) + 1 }
    assert(paths.never_again > 150 && paths.cycle > 150, `trauma: never again ${paths.never_again} · the cycle continues ${paths.cycle}`)
  }

  // 4. Tournament heir → 3 branches; clan sect snapshot → fortunes + stipend.
  { const { gs, kids } = await headWithKids(4, 6)
    const s = gs.get(); s.ownSect.founded = true; s.ownSect.name = 'Azure Peak'; s.ownSect.hallLevel = 3
    gs.startTournament(); while (gs.get().family.tournament) {
      const info = gs.tournamentInfo(), pool = [...info.pool]; const pairs = []; while (pairs.length < info.fights) pairs.push([pool.shift(), pool.pop()])
      gs.fightTournamentRound(pairs)
    }
    const clanId = gs.get().world.playerClanId
    gs.passTheMantle()
    const it = gs.get().interlude, clan = gs.get().world.clans[clanId]
    assert(it.heirKind === 'tournament' && clan.lines.length === 4, `tournament heir; places 2–4 found ${clan.lines.length - 1} branches`)
    assert(['grow', 'hold', 'decline', 'lost'].includes(it.sectFate), `sect fate rolled: ${it.sectFate}`)
    const hall = clan.sect?.hallLevel
    gs.chooseRebirth('clan')
    const b = gs.get().birth
    assert(it.sectFate === 'lost' ? b.stipend === 0 && gs.get().world.enemies.some(e => e.why.includes('Azure Peak'))
      : b.stipend === Math.round(STIPEND(gs, hall, b)), `stipend ${b.stipend} for a ${b.position} (sect ${it.sectFate})`)
  }

  // 5. Positions: bet won favors the main line, bet lost favors a branch (many rebirths, same setup).
  { const tally = { won: {}, lost: {} }
    for (let seed = 100; seed < 160; seed++) {
      const { gs, kids } = await headWithKids(seed, 5)
      gs.chooseHeir(kids[4].id)
      gs.passTheMantle(); gs.finishInterlude('clan')          // life 2: the heir reigns, one branch exists
      gs.passTheMantle()                                      // life 2 dies → bet
      const info = gs.interludeInfo(); if (info.step !== 'bet') continue
      gs.placeBet(info.candidates[0].id)
      const won = gs.get().interlude.betWon; gs.chooseRebirth('clan')
      const pos = gs.get().birth.position, t = won ? tally.won : tally.lost; t[pos] = (t[pos] || 0) + 1
    }
    const share = (t, k) => (t[k] || 0) / Math.max(1, Object.values(t).reduce((a, b) => a + b, 0))
    assert(share(tally.won, 'eldest') > share(tally.lost, 'eldest') && share(tally.lost, 'branch') > share(tally.won, 'branch'),
      `bet won → eldest ${(share(tally.won, 'eldest') * 100).toFixed(0)}% / branch ${(share(tally.won, 'branch') * 100).toFixed(0)}%; lost → eldest ${(share(tally.lost, 'eldest') * 100).toFixed(0)}% / branch ${(share(tally.lost, 'branch') * 100).toFixed(0)}%`)
  }

  // 6. Orphan: no clan, the clan lives on; an orphan death returns to that clan's succession.
  { const { gs } = await headWithKids(6, 3)
    const clanId = gs.get().world.playerClanId
    gs.passTheMantle(); gs.finishInterlude('orphan')
    let s = gs.get()
    assert(s.world.playerClanId === null && s.world.lastClanId === clanId && s.birth.position === 'orphan' && s.self.family === '' && !s.upbringing, 'orphan: no clan, no upbringing; the last clan is remembered')
    assert(s.world.clans[clanId].headId && !s.world.clans[clanId].extinct, 'the clan lives on without you')
    gs.passTheMantle(); const info = gs.interludeInfo()
    assert(info.chronicle[0].includes('no clan mourns you') && info.canJoinClan !== false, 'orphan death: mourned by none, yet the old clan still turns its wheel')
    gs.finishInterlude('clan'); s = gs.get()
    assert(s.world.playerClanId === clanId || s.birth.rival, `orphan → reborn into the old clan again (${s.birth.position})`)
  }

  // 7. Extinct clan: nobody left → orphan only.
  { const { gs } = await headWithKids(7, 0)
    const clan = clanOf(gs); for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id === gs.get().self.id)
    gs.get().family.spouse = null; gs.get().family.affection = null
    gs.passTheMantle()
    const info = gs.interludeInfo()
    assert(info.extinct && !info.canJoinClan && info.chronicle.some(l => l.includes('passes into history')), 'no one left → the clan is extinct')
    assert(gs.chooseRebirth('clan').reason === 'no_clan' && gs.chooseRebirth('orphan').ok && gs.get().world.playerClanId === null, 'extinct → orphan only')
  }

  // 8. The rare rival-family rebirth (forced to 100% here): a spouse who dueled you → born into their family.
  { const { gs } = await headWithKids(8, 2, { overrides: ['RIVAL_REBIRTH_CHANCE = 1'] })
    const f = gs.get().family, spName = Persons_fullName(f.spouse), surname = f.spouse.family
    gs._noteEnemy({ kind: 'person', personId: f.spouse.id, name: spName, surname, why: 'betrayed you' })
    const home = gs.get().world.playerClanId
    gs.passTheMantle(); gs.finishInterlude('clan')
    const s = gs.get(), rc = s.world.clans[s.world.playerClanId]
    assert(s.birth.position === 'rival' && s.birth.rival && rc.id !== home && rc.name === surname, `reborn into the ${rc.name} family — ${spName}'s house`)
    assert(rc.relations[home] === -60 && s.world.clans[home].relations[rc.id] === -60, 'the two clans are rivals (relation −60)')
    assert(rc.headId && rc.lines[0].memberIds.includes(s.self.id) && s.self.family === surname, 'on the rival roster with their surname')
    assert(s.lastReincarnation.birth.chronicle.slice(-1)[0].includes(spName), 'the chronicle names whose house it is')
  }
  { const { gs } = await headWithKids(9, 2)   // default chance, no enemies → never
    gs.passTheMantle(); gs.finishInterlude('clan'); assert(!gs.get().birth.rival, 'no known enemy → no rival rebirth') }

  // 9. Save/load mid-interlude: the unborn life persists, gains nothing offline, and resumes.
  { const { sim, gs } = await headWithKids(10, 3)
    gs.passTheMantle(); const it0 = JSON.stringify(gs.get().interlude)
    gs.forceSave(); sim.clock.now += 4 * 3600e3; await sim.boot(0)
    const s = gs.get()
    assert(JSON.stringify(s.interlude) === it0 && s.qi === 0, 'interlude survives save/load; no offline Qi for an unborn life')
    assert(!s.world.clans[s.world.playerClanId].lines.some(l => l.memberIds.includes(s.self.id)), 'unborn self never joins a roster on load')
    assert(gs.finishInterlude('clan').ok && !gs.get().interlude, 'resumed and finished after load')
  }

  // 10. Upbringing: fires a few years in, bond with the head moves by YOUR personality.
  { const { gs } = await headWithKids(11, 3)
    gs.passTheMantle(); gs.finishInterlude('clan')
    const s = gs.get(); s.personality.id = 'psycho'; s.upbringing.style = 'ruthless'; s.upbringing.due = s.world.year
    gs._tickFamily()
    assert(s.upbringing.event && gs.upbringingEventDef(s.upbringing.event), `upbringing event fired: ${s.upbringing.event?.id}`)
    s.upbringing.event = { id: 'up_spar', style: 'ruthless', year: 1 }
    const b0 = s.birth.headBond
    gs.resolveUpbringingEvent(1)
    assert(gs.get().birth.headBond === Math.min(100, b0 + 16) && !gs.get().upbringing.event && gs.get().upbringing.done === 'up_spar', `psycho finishes the spar as the head wants: bond ${b0} → ${gs.get().birth.headBond}`)
    assert(gs.resolveUpbringingEvent(0).reason === 'no_event', 'only once')
  }

  // 11. Many generations in one world: invariants hold, the registry stays bounded, heads stay alive.
  { const { gs } = await headWithKids(12, 4)
    let bad = 0, maxPersons = 0
    for (let g = 0; g < 30; g++) {
      const s = gs.get(); s.stageIndex = 10 + (g % 8); s.maxStageThisLife = s.stageIndex
      gs.passTheMantle(); gs.finishInterlude(g % 7 === 3 ? 'orphan' : null)
      const w = gs.get().world
      for (const c of Object.values(w.clans)) {
        const h = c.headId === gs.get().self.id ? gs.get().self : w.persons[c.headId]
        if ((!c.extinct && (!h || h.alive === false)) || c.lines.length > 4) bad++
      }
      if (w.persons[gs.get().self.id] || gs.get().interlude) bad++
      maxPersons = Math.max(maxPersons, Object.keys(w.persons).length)
    }
    const w = gs.get().world
    assert(bad === 0 && w.pastLives.length === 30, `30 lives: every clan has a living head, ≤ 3 branches, no duplicated self (${bad} problems)`)
    assert(maxPersons < 1500, `registry stays bounded (${maxPersons} persons at most)`)
    assert(gs.get().generation === 31 && w.year > 30 * 40, `generation ${gs.get().generation}, world year ${w.year}`)
  }
})()

// Mirrors _beginLife's stipend formula (kept here so a formula change shows up as a failing check).
function STIPEND(gs, hall, b) {
  const st = gs.get().world.persons[b.headId]?.parentingStyle
  const styleMult = { nurturing: 1.2, strict: 1.0, neglectful: 0.6, ruthless: 0.8 }[st] || 1
  const posMult = { eldest: 1.0, younger: 0.5, branch: 0.25, rival: 0, orphan: 0 }[b.position] ?? 0
  return 60 * (hall || 1) * styleMult * posMult
}
function Persons_fullName(p) { return p.family ? `${p.family} ${p.given}` : p.given }
