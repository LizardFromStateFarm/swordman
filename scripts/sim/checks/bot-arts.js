// Scenario checks — arts.md → "42d / task 1.15": the QA sim bot now plays the arts systems, so pin its policy.
// The bot's check-in runs `arts()` (bot.js): answer a breakthrough offer, work the free study desks, wear the best
// known loadout, buy a missing art from a joined sect's library, study/write the clan library, give a mastered spare
// to the sect, and sell what it can never use. Also pins the recorder's new arts invariants (desks over cap, an
// invalid loadout entry). Run: npm run checks · node scripts/sim/checks/bot-arts.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { Bot } = require('../bot.js')
const { Recorder } = require('../metrics.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 7 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const rec = new Recorder(sim.data, 3600)
  const bot = new Bot(sim, rec, { path: 'member', profile: 'active', actEverySec: 10 })
  const A = sim.ev('ARTS'), L = sim.ev('ARTS_LIST'), R = sim.ev('ART_RARITY_ORDER'), BASICS = sim.ev('ART_BASICS')
  const mk = id => (s.arts.known[id] = { mastery: 1, xp: 0, uses: 0 })

  // A realm with room, an empty pack, no pending fight.
  s.stageIndex = 11; s.maxStageThisLife = 11; s.health = 100; gs._recalc()
  s.arts.studies = []; s.arts.offers = []; s.family.fight = null

  // ── Answering a breakthrough offer: 'active' keeps the highest grade (its own element breaks a tie) ──
  const byRar = r => L.filter(a => !a.sig && !BASICS.includes(a.id) && a.rarity === r)[0]
  const options = [byRar('yellow').id, byRar('earth').id, byRar('heaven').id]
  s.arts.offers.push({ id: 'chk', realm: 'Core Formation', options })
  assert(bot.artOffers() === true && !s.arts.offers.length, 'the bot answers a waiting offer (and clears it)')
  assert(!!s.arts.known[byRar('heaven').id] && !s.arts.known[byRar('yellow').id], "it keeps the highest-grade art offered")

  // ── Study desks: 'active' studies the best manual it holds, on a free desk ──
  const prof = L.find(a => !a.sig && !BASICS.includes(a.id) && a.rarity === 'profound' && a.minStage <= 11 && !s.arts.known[a.id])
  const yell = L.find(a => !a.sig && !BASICS.includes(a.id) && a.rarity === 'yellow' && a.minStage <= 11 && !s.arts.known[a.id] && a.id !== prof.id)
  s.inventory['manual_' + yell.id] = 1; s.inventory['manual_' + prof.id] = 1
  assert(bot.studyManuals() === true && s.arts.studies.some(d => d.artId === prof.id), 'it puts the higher-grade manual on a free desk')
  assert(!s.inventory['manual_' + prof.id] && s.inventory['manual_' + yell.id] === 1, 'the studied manual is consumed; the other waits')
  s.arts.studies = []; s.inventory['manual_' + prof.id] = 1   // reset for later

  // ── Loadout: the best known moves (by power) go into the 4 slots; passives fill this realm's slots ──
  s.arts.known = { palm_strike: { mastery: 1, xp: 0, uses: 0 }, qi_shield: { mastery: 1, xp: 0, uses: 0 } }
  for (const id of ['drifting_step_palm', 'rising_qi_kick', 'echoing_fist', 'shattering_palm_seal']) mk(id)
  const passives = L.filter(a => a.kind === 'passive' && !a.sig && a.minStage <= 11).slice(0, 3)
  for (const a of passives) mk(a.id)
  s.arts.loadout.moves = [null, null, null, null]; s.arts.loadout.passives = [null, null, null, null, null]
  assert(bot.setLoadout() === true, 'the bot sets its loadout')
  assert(s.arts.loadout.moves.join() === 'shattering_palm_seal,echoing_fist,rising_qi_kick,drifting_step_palm',
    `strongest four moves equipped, strongest first (${s.arts.loadout.moves.join(', ')})`)
  const slots = gs.passiveSlots()
  assert(s.arts.loadout.passives.slice(0, slots).every(Boolean) && s.arts.loadout.passives.slice(slots).every(x => x === null),
    `${slots} passive slot(s) filled at this realm, the rest cleared`)
  assert(s.arts.loadout.moves.every(id => !id || (A[id] && A[id].kind === 'move' && s.arts.known[id])), 'every equipped move is a known move art')

  // ── Selling a mastered spare manual (and an outgrown piece of gear) ──
  const sold = 'shattering_palm_seal'
  s.arts.known[sold].mastery = sim.ev('ART_MASTERY_MAX')
  s.inventory['manual_' + sold] = 3
  const st0 = s.spiritStones, each = gs.itemValue('manual_' + sold)
  assert(bot.sellSurplus() === true, 'the bot sells a manual for an art already mastered')
  assert(!s.inventory['manual_' + sold] && s.spiritStones === st0 + each * 3, `all 3 copies sold for ${each * 3} stones`)

  // ── Buying an art from a joined sect's library ──
  s.sect.id = 'azure_sword'; s.sect.rank = 2; s.sect.contribution = 900; s.ownSect.founded = false
  const before = s.sect.contribution, nMan = () => Object.keys(s.inventory).filter(k => k.startsWith('manual_')).length
  const m0 = nMan()
  assert(bot.sectLibraryBuy() === true && s.sect.contribution < before && nMan() === m0 + 1, 'it buys a missing art from the sect library for Contribution')

  // ── The clan library: study an art a past life wrote in, then write one of its own in ──
  const clan = gs._playerClan()
  assert(!!clan, 'the life has a clan')
  const clanArt = L.find(a => !a.sig && !BASICS.includes(a.id) && a.minStage <= 11 && !s.arts.known[a.id])
  clan.library = [{ artId: clanArt.id, by: 'Ancestor', gen: 1, year: 5 }]
  s.arts.studies = []; s.arts.known = { palm_strike: { mastery: 1, xp: 0, uses: 0 }, qi_shield: { mastery: 1, xp: 0, uses: 0 } }
  for (const id of ['drifting_step_palm', 'rising_qi_kick', 'echoing_fist', 'shattering_palm_seal']) mk(id)
  assert(bot.clanArts() === true && s.arts.studies.some(d => d.src === 'clan' && d.artId === clanArt.id), 'it studies an art from the clan library (no manual)')
  const now = sim.ev('Date.now()')
  s.arts.studies = Array.from({ length: gs.studySlots() }, () => ({ artId: 'rising_qi_kick', startedAt: now, endsAt: now + 9e6, src: 'manual' }))  // every desk busy
  s.arts.known.drifting_step_palm.mastery = 2
  s.spiritStones = 5000
  const lib0 = clan.library.length, st1 = s.spiritStones
  assert(bot.clanArts() === true && clan.library.length === lib0 + 1 && s.spiritStones < st1, 'with every desk busy it writes a mastered art into the clan library')

  // ── Giving a spare manual to the sect ──
  const shelf0 = s.sect.shelf ? s.sect.shelf.length : 0
  s.inventory['manual_' + sold] = 2
  assert(bot.giveManuals() === true && s.inventory['manual_' + sold] === 1 && (s.sect.shelf || []).length === shelf0 + 1,
    'it gives a spare manual for a known art to the sect')

  // ── The recorder's arts invariants fire on a broken state ──
  const force = new Recorder(sim.data, 3600)
  s.arts.studies = [{}, {}]; s.stageIndex = 0                  // two desks at Mortal (cap 1)
  s.arts.loadout.moves[0] = 'not_an_art'
  force.checkInvariants(s)
  assert(force.violations.arts_studies_over_cap, 'an over-cap study list is flagged')
  assert(force.violations.arts_loadout_invalid, 'an invalid loadout entry is flagged')
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
