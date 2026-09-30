// Scenario checks — docs/systems/arts.md → "42c part 2 as built" (task 1.14b): study desks by realm (1 · Foundation 2 ·
// Nascent Soul 3; an old single study migrates), rival counters (a person remembers your blows' elements; a grudge-holder
// trains against your favourite: fights as the element that overcomes it, carries an art of it, the log says so; no
// grudge / too few blows → no counter), raise → taught one of their arts (a debt), finish → their manual (a chance, never
// a signature), the sect library (grades by rank, Contribution price, rank kept, only a joined sect), the clan library
// (write for stones, study at half time without a manual, only arts you don't know, kept by the clan); giving manuals to
// your sect (user 2026-09-30): Contribution by grade (joined), one copy per shelf, war strength by grade (capped) in the shown
// odds AND the real war roll (Monte Carlo, member + founded), a founder studies the shelf at half time, the shelf stays with
// the sect when you leave.
// Run: npm run checks · node scripts/sim/checks/rivals-libraries.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const rng = (sim, v) => sim.ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
const unrng = sim => sim.ev('Math.random = globalThis.__r')

async function setup(seed, stage = 8) {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = stage; s.maxStageThisLife = stage; s.health = 100; s.spiritStones = 1e6; s.karma = 50; gs._recalc()
  return { sim, gs, s, K: n => sim.ev(n) }
}
const stranger = (gs, stage, personality = 'stoic') => {
  const p = gs._genPerson({ family: 'Test', bornYear: 0, stage, role: 'duelist' }); p.personality = personality
  gs.get().world.persons[p.id] = p; return p
}
const manualsOf = s => Object.keys(s.inventory).filter(k => k.startsWith('manual_') && s.inventory[k] > 0).map(k => k.slice(7))

;(async () => {
  // ── Study desks by realm ──
  { const { gs, s, K, sim } = await setup(1, 5)
    assert(gs.studySlots(5) === 1 && gs.studySlots(10) === 2 && gs.studySlots(15) === 2 && gs.studySlots(16) === 3 && gs.studySlots(22) === 3, 'desks: 1 · Foundation 2 · Nascent Soul 3 (the user\'s slower curve)')
    const L = K('ARTS_LIST').filter(a => a.kind === 'move' && !a.sig && a.minStage === 0 && !s.arts.known[a.id] && !K('ART_BASICS').includes(a.id)).slice(0, 4)
    for (const a of L) s.inventory['manual_' + a.id] = 1
    s.stageIndex = 16; gs._recalc()
    assert(L.slice(0, 3).every(a => gs.studyArt(a.id).ok) && s.arts.studies.length === 3, 'Nascent Soul: three manuals at once')
    assert(gs.studyArt(L[3].id).reason === 'busy', 'a fourth waits for a free desk')
    s.arts.studies[1].endsAt = sim.ev("Date.now()") - 1; gs.tick(0.1)
    assert(s.arts.studies.length === 2 && s.arts.known[L[1].id], 'each desk finishes on its own time')
    assert(gs.cancelStudy(L[2].id).ok && s.inventory['manual_' + L[2].id] === 1 && s.arts.studies.length === 1, 'stopping one desk returns only its manual')
    s.stageIndex = 5; gs._recalc()
    assert(gs.artsInfo().studySlots === 1 && s.arts.studies.length === 1, 'a desk already running is never cut short')
    // migration: an old single study becomes the first desk
    s.arts.study = { artId: L[3].id, startedAt: 1, endsAt: sim.ev("Date.now()") + 5000 }; delete s.arts.studies
    gs._ensurePhase42Fields()
    assert(Array.isArray(s.arts.studies) && s.arts.studies[0]?.artId === L[3].id && !('study' in s.arts), 'an old save\'s study moves onto the first desk') }

  // ── Rival counters ──
  { const { gs, s, K, sim } = await setup(2)
    const p = stranger(gs, 8, 'arrogant')
    p.vsYou = { ...gs.personRecord(p), els: { fire: 2 } }; p.feud = 'grudge'
    gs._rivalTrain(p)
    assert(!p.counter, 'too few blows of one element: no counter yet')
    p.vsYou.els.fire = 4; p.feud = null; gs._rivalTrain(p)
    assert(!p.counter, 'no grudge: they do not train against you')
    p.feud = 'grudge'; const n0 = s.events.length; gs._rivalTrain(p)
    assert(p.counter?.vs === 'fire' && p.counter.el === 'water' && s.events.length > n0 && /trains in Water/.test(s.events[0]?.text || JSON.stringify(s.events.slice(-2))), `a grudge-holder you burned trains in Water against your Fire (${p.counter?.el})`)
    const A = gs.personArts(p)
    assert(A.counterEl === 'water' && A.counterArt && K('ARTS')[A.counterArt].element === 'water' && A.moves.includes(A.counterArt), `they carry a Water art (${A.counterArt})`)
    const m = gs._mbFoePerson(p)
    assert(m.element === 'water', 'in a fight they defend as Water')
    const fire = K('ARTS_LIST').find(a => a.element === 'fire' && a.kind === 'move' && a.move.power)
    assert(gs._mbElementMult('fire', m) < 1, `your Fire arts are resisted (×${gs._mbElementMult('fire', m)})`)
    const sc = gs.personScouting(p)
    assert(sc.counter?.vs === 'fire' && sc.moves.find(x => x.id === A.counterArt)?.seen, 'scouting names the counter; word of their new art has reached you')
    // the blows are counted in a real fight
    const q = stranger(gs, 8, 'hotblood')
    gs._startFight('challenge', q, false)
    const b = s.family.fight.m; b.foe.P.parryChance = 0; b.foe.moves = ['sutra_of_stillness']; b.foe.hp = 100
    s.arts.known[fire.id] = { mastery: 1, xp: 0, uses: 0 }; s.arts.loadout.moves[3] = fire.id; b.you.moves = s.arts.loadout.moves.filter(Boolean); b.you.qi = 100
    rng(sim, 0.5); let r = gs.fightMove(fire.id); while (r.ok && r.pending) r = gs.fightParry([false]); unrng(sim)
    assert((gs.personRecord(q).els.fire || 0) >= 1, `your landed Fire blow is remembered (${JSON.stringify(gs.personRecord(q).els)})`)
    s.family.fight = null }

  // ── Raise → taught · finish → their manual ──
  { const { gs, s, K } = await setup(3)
    const p = stranger(gs, 8, 'stoic')
    gs._startFight('challenge', p, false); playFight(gs, 'win')
    const ch = gs.personFightChoices()
    assert(ch.reaction.raise === 'debt' && ch.teach, 'raising a stoic: they will owe you and can teach you an art')
    const before = manualsOf(s)
    const r = gs.personFightFinish('raise')
    assert(r.art && !before.includes(r.art) && s.inventory['manual_' + r.art] === 1 && !K('ARTS')[r.art].sig && gs.personArts(p).moves.concat(gs.personArts(p).passives).includes(r.art), `they write out one of their arts for you (${r.art})`) }
  { const { gs, s, K, sim } = await setup(4)
    const p = stranger(gs, 8, 'psycho')
    gs._startFight('challenge', p, false); playFight(gs, 'win')
    assert(!gs.personFightChoices().teach && gs.personFightChoices().reaction.raise === 'grudge', 'a psycho raised holds a grudge: nothing is taught')
    gs.personFightFinish('raise')
    const q = stranger(gs, 8, 'stoic'); s.world.persons[q.id] = q
    s.family.encounters.push({ person: q, place: 'X', text: 't', year: 1 }); gs.slaughterEncounter(s.family.encounters.length - 1)
    playFight(gs, 'win')
    assert(gs.personFightChoices().finishManual === K('PERSON_FINISH_MANUAL'), `finishing shows the manual chance (${K('PERSON_FINISH_MANUAL') * 100}%)`)
    rng(sim, 0.01); const f = gs.personFightFinish('finish'); unrng(sim)
    assert(f.art && s.inventory['manual_' + f.art] >= 1 && !K('ARTS')[f.art].sig, `their manual is on their body (${f.art})`) }

  // ── The sect library ──
  { const { gs, s, K } = await setup(5, 8)
    assert(gs.sectLibrary() === null && gs.buySectArt('autumn_blade_qi').reason === 'no_sect', 'no sect, no library')
    gs.joinSect('azure_sword'); s.sect.contribution = 1000
    const lib = gs.sectLibrary()
    assert(lib.arts.length > 5 && lib.arts.every(x => ['metal', 'neutral'].includes(K('ARTS')[x.id].element) && !K('ARTS')[x.id].sig), 'the Azure Sword library: Metal + neutral arts, no signatures')
    const y = lib.arts.find(x => K('ARTS')[x.id].rarity === 'yellow' && !x.known), pr = lib.arts.find(x => K('ARTS')[x.id].rarity === 'profound')
    assert(pr.lock === 'rank' && pr.needRank === 1, 'an Outer Disciple sees Profound arts locked to Inner Disciple')
    const r = gs.buySectArt(y.id)
    assert(r.ok && s.sect.contribution === 1000 - K('SECT_LIBRARY_PRICE').yellow && s.inventory['manual_' + y.id] === 1, `a Yellow manual for ${K('SECT_LIBRARY_PRICE').yellow} Contribution`)
    s.sect.rank = 1; const rank = s.sect.rank
    assert(gs.buySectArt(pr.id).ok && s.sect.rank === rank, 'as Inner Disciple, a Profound one; spending Contribution keeps your rank')
    s.sect.contribution = 1
    assert(gs.buySectArt(y.id).reason === 'contribution', 'too little Contribution: refused') }

  // ── The clan library ──
  { const { gs, s, K } = await setup(6, 8)
    const info0 = gs.clanLibraryInfo()
    if (!info0) { assert(true, 'no clan in this seed: the clan library needs a clan (skipped)'); return }
    const mine = K('ARTS_LIST').find(a => a.kind === 'move' && a.rarity === 'profound' && !a.sig && a.minStage <= 8)
    s.arts.known[mine.id] = { mastery: 1, xp: 0, uses: 0 }
    const row = gs.clanLibraryInfo().writable.find(x => x.id === mine.id)
    assert(row && row.cost === K('CLAN_LIBRARY_WRITE_COST').profound, `writing a Profound art costs ${row?.cost} stones`)
    assert(!gs.clanLibraryInfo().writable.some(x => K('ART_BASICS').includes(x.id)), 'the basics everyone knows are not written down')
    const st0 = s.spiritStones, w = gs.writeClanArt(mine.id)
    assert(w.ok && s.spiritStones === st0 - row.cost && info0.clan.library.some(x => x.artId === mine.id && x.by === s.name), 'written into the library, by your name')
    assert(gs.writeClanArt(mine.id).reason === 'already', 'once is enough')
    assert(gs.studyFromClan(mine.id).reason === 'known', 'you know it already: nothing to study')
    delete s.arts.known[mine.id]                                  // as an heir who never learned it
    const secs = gs.clanLibraryInfo().shelf.find(x => x.artId === mine.id).seconds
    const r = gs.studyFromClan(mine.id)
    assert(r.ok && secs === Math.round(gs.artStudySeconds(mine.id) * K('CLAN_LIBRARY_STUDY_FRAC')) && s.arts.studies.some(d => d.artId === mine.id && d.src === 'clan') && !s.inventory['manual_' + mine.id], `studied from the library at half the time (${secs}s), no manual`)
    gs.cancelStudy(mine.id)
    assert(!s.inventory['manual_' + mine.id] && info0.clan.library.some(x => x.artId === mine.id), 'stopping it leaves the library\'s copy where it is') }

  // ── Giving manuals to your sect ──
  const montecarlo = (gs, resolve, reset, n = 4000) => { const w = gs.get().sectWar; let wins = 0
    for (let i = 0; i < n; i++) { reset(); const b = w.warVictories; resolve(); if (w.warVictories > b) wins++ } return wins / n }
  const rebuild = parts => parts.reduce((v, p) => p.op === 'base' ? p.value : p.op === 'x' ? v * p.value : v + p.value, 0)
  { const { gs, s, K } = await setup(7, 8)
    assert(gs.sectDonateInfo() === null && gs.donateManualToSect('autumn_blade_qi').reason === 'no_sect', 'no sect: nothing to give to')
    gs.joinSect('thunder_palace'); s.sect.rank = 2; const c0 = s.sect.contribution
    const ids = ['iron_needle_rain', 'edge_seeking_thrust', 'armour_rending_slash']
    for (const id of ids) s.inventory['manual_' + id] = 2
    const row = gs.sectDonateInfo().manuals.find(x => x.id === ids[0])
    assert(row.contribution === K('SECT_DONATE_CONTRIB').yellow && row.war === K('SECT_SHELF_WAR').yellow, `a Yellow manual pays ${row.contribution} Contribution and +${row.war * 100}% war strength`)
    const r = gs.donateManualToSect(ids[0])
    assert(r.ok && s.sect.contribution === c0 + row.contribution && s.inventory['manual_' + ids[0]] === 1 && s.sect.shelf.some(x => x.artId === ids[0] && x.by === s.name), 'given: Contribution paid, one manual gone, on the shelf by your name')
    assert(gs.donateManualToSect(ids[0]).reason === 'shelved', 'the shelf takes one copy of an art')
    gs.donateManualToSect(ids[1]); gs.donateManualToSect(ids[2])
    const want = K('SECT_SHELF_WAR').yellow * 2 + K('SECT_SHELF_WAR').profound
    assert(Math.abs(gs.sectShelfWar() - want) < 1e-9 && Math.abs(gs.memberWarPower().shelf - want) < 1e-9, `war strength = the shelf by grade (+${(want * 100).toFixed(0)}%)`)
    s.sect.shelf = K('ARTS_LIST').filter(a => a.rarity === 'heaven').slice(0, 8).map(a => ({ artId: a.id, by: 'x', year: 1 }))
    assert(gs.sectShelfWar() === K('SECT_SHELF_WAR_CAP'), `capped at +${K('SECT_SHELF_WAR_CAP') * 100}%`)
    s.sect.shelf = s.sect.shelf.slice(0, 2)
    assert(gs.memberWarPower().bonus === 0 && gs.sectDonateInfo().shelf.every(x => x.lock === 'member'), 'the shelf alone is not taking part in a war; a member cannot take a book back down')
    const w = s.sectWar
    const memReset = () => { s.spiritStones = 1e6; s.health = 100; w.phase = 'preparing'; w.answered = true; w.chestStones = 0; w.pillsGiven = 0; w.beastId = null; w.buffSuppressedUntil = 0 }
    memReset(); const o = gs.sectWarOdds()
    assert(o.parts.some(p => /Arts you gave/.test(p.label)) && Math.abs(rebuild(o.parts) - o.mult) < 1e-9, `member odds show the shelf (parts rebuild ×${o.mult.toFixed(3)})`)
    const mc = montecarlo(gs, () => gs._resolveMemberWar(), memReset)
    assert(Math.abs(mc - o.chance) < 0.03, `member, with a shelf: shown ${(o.chance * 100).toFixed(1)}% vs rolled ${(mc * 100).toFixed(1)}%`)
    gs.leaveSect()
    assert(!s.sect.shelf?.length && s.events.slice(0, 3).some(e => /stay on the/.test(e.text)), 'leaving: the manuals you gave stay with the sect (said in the log)') }
  { const { gs, s, K } = await setup(8, 19)
    s.ownSect.founded = true; s.ownSect.name = 'Test Peak'; s.ownSect.hallLevel = 2; s.ownSect.disciples = []; gs._recalc()
    const id = 'withering_blight'; s.inventory['manual_' + id] = 1; delete s.arts.known[id]
    const row = gs.sectDonateInfo().manuals.find(x => x.id === id)
    assert(gs.sectDonateInfo().own && row.contribution === 0 && row.war > 0, 'your own sect: no Contribution, the war strength only')
    gs.donateManualToSect(id)
    assert(s.ownSect.library.length === 1 && !s.inventory['manual_' + id], 'it goes onto your sect library')
    const shelfRow = gs.sectDonateInfo().shelf[0]
    const r = gs.studyFromSect(id)
    assert(r.ok && r.seconds === Math.round(gs.artStudySeconds(id) * K('SECT_SHELF_STUDY_FRAC')) && s.arts.studies.some(d => d.src === 'sect'), `a founder studies it from the shelf at half time (${shelfRow.seconds}s)`)
    s.arts.studies.at(-1).endsAt = 0; s.arts.studies = s.arts.studies.map(d => d.src === 'sect' ? { ...d, endsAt: 1 } : d); gs.tick(0.1)
    assert(s.arts.known[id] && s.arts.known[id].how === 'sect', 'learned from the sect library')
    const w = s.sectWar
    const ownReset = () => { s.spiritStones = 1e6; s.health = 100; w.phase = 'preparing'; w.enemyName = 'Iron Fang Sect'; w.enemyTier = 2; w.reinforced = false; w.allyId = null }
    ownReset(); const o = gs.sectWarOdds()
    assert(o.parts.some(p => /sect library/.test(p.label)) && Math.abs(rebuild(o.parts) - o.mult) < 1e-9, `own odds show the library (×${o.mult.toFixed(3)})`)
    const mc = montecarlo(gs, () => gs._resolveSectWar(), ownReset)
    assert(Math.abs(mc - o.chance) < 0.03, `own, with a library: shown ${(o.chance * 100).toFixed(1)}% vs rolled ${(mc * 100).toFixed(1)}%`) }
})()
