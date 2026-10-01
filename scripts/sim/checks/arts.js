// Scenario checks — arts.md (Phase 42, task 1.12): the combat-arts library (shape, unique ids, signatures for every beast
// type + Arena ring, a starter per element), manuals as items (one per non-basic art, sellable by grade), root elements
// (pure = named, heavenly = all, deterministic), a new life's starters + loadout, study (gates, timer, Comprehension, cancel,
// mastery from a duplicate), passive slots by realm, loadout rules (kind, swap, locked slot, not mid-fight), breakthrough
// offers (a new realm → 3 unknown arts, one of your element, pick one), layer grants, drops (expedition / beast / arena
// title), old-save migration.
// Run: npm run checks · node scripts/sim/checks/arts.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 11 }); await sim.boot(0); const gs = sim.gs
  let s = gs.get()
  const D = sim.ev('({ L: ARTS_LIST, R: ART_RARITY, E: ART_ELEMENTS, B: BEAST_TYPES.map(b => b.id), RINGS: ARENA_RINGS.map(r => r.id), BASICS: ART_BASICS, ITEMS, GRANTS: ART_STAGE_GRANTS, SLOTS: ART_PASSIVE_SLOTS, OW: ART_OFFER_WEIGHTS })')

  // ── library ──
  assert(D.L.length >= 72, `at least 72 combat arts (${D.L.length})`)
  assert(new Set(D.L.map(a => a.id)).size === D.L.length, 'art ids are unique')
  assert(D.L.every(a => D.R[a.rarity] && D.E[a.element] && ['move', 'passive'].includes(a.kind) && (a.kind === 'move' ? a.move?.type && a.move.cost >= 0 : a.passive?.stat)), 'every art has a grade, element, kind and body')
  assert(D.L.every(a => a.lore && (a.move?.desc || a.passive?.desc)), 'every art has lore and a plain-words effect')
  assert(D.B.every(b => D.L.some(a => a.sig === 'beast:' + b)), 'every beast type has a signature art')
  assert(D.RINGS.every(r => D.L.some(a => a.sig === 'arena:' + r)), 'every Arena ring has a champion art')
  assert(['metal', 'wood', 'water', 'fire', 'earth'].every(e => D.L.filter(a => a.starter && a.element === e && a.rarity === 'yellow' && a.kind === 'move').length === 1), 'one Yellow starter move per element')
  assert(D.L.filter(a => !D.BASICS.includes(a.id)).every(a => D.ITEMS['manual_' + a.id]?.category === 'manual'), 'every non-basic art has a manual item')
  assert(!D.ITEMS.manual_palm_strike, 'the basics have no manual')
  assert(gs.itemValue('manual_autumn_blade_qi') === D.R.yellow.sellValue && gs.itemValue('manual_heaven_severing_intent') === D.R.immortal.sellValue, 'manuals sell by grade')

  // ── root elements ──
  const P = sim.ev('Persons')
  assert(P.rootElements({ type: 'pure', name: 'Pure fire Root' }).join() === 'fire', 'a pure root is its named element')
  assert(P.rootElements({ type: 'heavenly', name: 'Heavenly Root' }).length === 5, 'a heavenly root is all five')
  const d1 = P.rootElements({ type: 'dual', name: 'Dual Root' }, 'x'), d2 = P.rootElements({ type: 'dual', name: 'Dual Root' }, 'x')
  assert(d1.length === 2 && d1.join() === d2.join(), 'a dual root has two elements, the same every time')
  assert(P.rootElements({ type: 'mixed', name: 'Mixed Root' }, 'y').length === 3, 'a mixed root has three')

  // ── a new life ──
  const els = s.root.elements
  assert(Array.isArray(els) && els.length >= 1, `your root has elements (${els})`)
  const known = Object.keys(s.arts.known)
  assert(D.BASICS.every(id => known.includes(id)), 'you start knowing Palm Strike + Qi Shield')
  const starter = D.L.find(a => a.starter && a.element === els[0])
  assert(known.includes(starter.id), `…and your root's starter (${starter.name})`)
  assert(s.arts.loadout.moves.filter(Boolean).length === 3 && s.arts.loadout.moves.length === 4, 'three moves equipped, one slot free')

  // ── study ──
  const pick = D.L.find(a => a.kind === 'move' && a.rarity === 'yellow' && !a.sig && !known.includes(a.id) && a.minStage === 0)
  assert(gs.studyArt(pick.id).reason === 'no_manual', 'no manual: cannot study')
  s.inventory['manual_' + pick.id] = 2
  const high = D.L.find(a => a.minStage >= 10 && !a.sig)
  s.inventory['manual_' + high.id] = 1
  assert(gs.studyArt(high.id).reason === 'stage', 'a manual above your realm is too profound')
  s.comprehension = 0
  let r = gs.studyArt(pick.id)
  assert(r.ok && r.seconds === D.R.yellow.studySeconds && s.inventory['manual_' + pick.id] === 1, `studying takes the manual and ${r.seconds}s`)
  assert(gs.studyArt(pick.id).reason === 'studying', 'the same art cannot sit on two desks')
  const other = D.L.find(a => a.kind === 'move' && a.rarity === 'yellow' && !a.sig && !known.includes(a.id) && a.minStage === 0 && a.id !== pick.id)
  s.inventory['manual_' + other.id] = 1
  assert(gs.studySlots() === 1 && gs.studyArt(other.id).reason === 'busy', 'one desk below Foundation: a second manual waits (1.14b)')
  gs.cancelStudy()
  assert(!s.arts.studies.length && s.inventory['manual_' + pick.id] === 2, 'cancelling returns the manual')
  s.comprehension = 10
  r = gs.studyArt(pick.id)
  assert(r.seconds === Math.round(D.R.yellow.studySeconds / 1.5), `Comprehension 10 studies faster (${r.seconds}s)`)
  s.arts.studies[0].endsAt = sim.ev('Date.now()') - 1; gs.tick(0.1)
  assert(s.arts.known[pick.id]?.mastery === 1 && !s.arts.studies.length, 'the timer ends → the art is learned')
  gs.studyArt(pick.id); s.arts.studies[0].endsAt = sim.ev('Date.now()') - 1; gs.tick(0.1)
  assert(s.arts.known[pick.id].mastery === 2, 'a duplicate manual deepens it: mastery 2')
  const st1 = gs.artStats(pick.id)
  assert(st1.power === Math.round(pick.move.power * 1.08) && st1.cost === Math.max(0, pick.move.cost - 1), 'mastery raises power, lowers cost')

  // ── loadout ──
  assert(gs.setArtSlot('move', 3, pick.id).ok && s.arts.loadout.moves[3] === pick.id, 'equip a learned move in the free slot')
  const first = s.arts.loadout.moves[0]
  gs.setArtSlot('move', 0, pick.id)
  assert(s.arts.loadout.moves[0] === pick.id && s.arts.loadout.moves[3] === first, 'equipping an art from another slot swaps them')
  assert(gs.setArtSlot('move', 1, high.id).reason === 'unknown', 'an unknown art cannot be equipped')
  const pas = D.L.find(a => a.kind === 'passive' && a.minStage === 1 && !a.sig)
  s.arts.known[pas.id] = { mastery: 1, xp: 0, uses: 0 }
  assert(gs.setArtSlot('move', 1, pas.id).reason === 'wrong_kind', 'a passive cannot go in a move slot')
  assert(gs.passiveSlots(0) === 1 && gs.passiveSlots(10) === 2 && gs.passiveSlots(13) === 3 && gs.passiveSlots(16) === 4 && gs.passiveSlots(19) === 5, 'passive slots 1 · 2 · 3 · 4 · 5 by realm')
  assert(gs.setArtSlot('passive', 0, pas.id).ok && gs.setArtSlot('passive', 1, pas.id).reason === 'locked', 'the second passive slot is locked at Mortal')
  // (user 2026-09-30) The loadout is never locked: a battle runs on the deck it began with (`you.slots`), so changing your
  // arts mid-fight is allowed and never alters the fight already underway.
  const foeRec = { typeId: D.B[0], traits: [], mood: 'wild' }
  const b0 = gs._mbNew(foeRec, 'slay')
  assert(Array.isArray(b0.you.slots) && b0.you.slots.length === 4, 'a battle snapshots your 4 move slots')
  s.family.fight = { kind: 'beast', beast: { encId: 'x', ...foeRec }, stance: 'slay', round: 1, log: [], m: b0, over: null }
  const deck0 = b0.you.slots.map(id => id || null)
  assert(gs.setArtSlot('move', 2, null).ok, 'the loadout is not refused mid-fight (2026-09-30)')
  assert(gs.fightMoves().slots.map(x => x?.id || null).join() === deck0.join(), 'the battle grid stays on the deck it began with')
  s.family.fight = null

  // ── saved loadouts (user 2026-10-01): 4 free decks; the active one is what fights ──
  assert(Array.isArray(s.arts.loadouts) && s.arts.loadouts.length === 4, 'four saved loadouts')
  assert(s.arts.loadout === s.arts.loadouts[s.arts.activeLoadout], 's.arts.loadout is the live pointer to the active deck')
  assert(s.arts.loadouts[1].moves.every(id => id === null), 'the spare decks start empty')
  assert(gs.setActiveLoadout(2).ok && s.arts.activeLoadout === 2 && s.arts.loadout === s.arts.loadouts[2], 'switching to loadout 3 moves the pointer')
  gs.setArtSlot('move', 3, pick.id)
  assert(s.arts.loadouts[2].moves[3] === pick.id, 'an edit lands on the active deck')
  gs.setActiveLoadout(0)
  assert(s.arts.loadout.moves[3] === first && s.arts.loadouts[2].moves[3] === pick.id, 'decks are independent: the first keeps its own moves')
  assert(gs.setActiveLoadout(99).reason === 'bad_loadout', 'an unknown loadout index is refused')

  // ── breakthrough offers + grants ──
  s.qi = s.derived.qiCap; s.stageIndex = 0
  const origRandom = Math.random; Math.random = () => 0.0001   // force the breakthrough (and pick the lightest weights)
  gs.attemptBreakthrough(); Math.random = origRandom
  const off = s.arts.offers[0]
  assert(s.stageIndex === 1 && off && off.options.length === 3 && off.realm === 'Qi Condensation', 'entering Qi Condensation offers 3 arts')
  assert(off.options.every(id => !s.arts.known[id] && !D.L.find(a => a.id === id).sig), '…none known, none signature')
  assert(off.options.some(id => s.root.elements.includes(D.L.find(a => a.id === id).element)), '…one of your root\'s element')
  assert(gs.chooseArtOffer(off.id, 'palm_strike').reason === 'bad_choice', 'only an offered art can be chosen')
  assert(gs.chooseArtOffer(off.id, off.options[1]).ok && s.arts.known[off.options[1]] && !s.arts.offers.length, 'choosing learns it and clears the offer')
  s.stageIndex = 3; s.qi = s.derived.qiCap; gs._recalc(); s.qi = s.derived.qiCap
  Math.random = () => 0.0001; gs.attemptBreakthrough(); Math.random = origRandom
  assert(s.stageIndex === 4 && s.arts.known[D.GRANTS[4]] && !s.arts.offers.length, `Layer 4 grants ${D.GRANTS[4]} (no offer inside a realm)`)

  // ── drops ──
  const inv = () => Object.keys(s.inventory).filter(k => k.startsWith('manual_')).reduce((t, k) => t + s.inventory[k], 0)
  let n0 = inv()
  gs._grantManual('iron_needle_rain', 'on a test')
  assert(inv() === n0 + 1 && /martial art manual on a test: Iron Needle Rain/.test(s.events[0].text), 'a found manual lands in the pack with a log line')
  const bw = {}; for (let i = 0; i < 400; i++) { const id = gs._rollArt({ yellow: 1 }, 'fire'); bw[id] = 1 }
  assert(Object.keys(bw).every(id => { const a = D.L.find(x => x.id === id); return a.element === 'fire' && a.rarity === 'yellow' && !a.sig }), 'element + grade rolls stay in their pool, no signatures')
  // arena title → the champion's art
  s.stageIndex = 1; gs._recalc()
  const A = s.arena
  n0 = s.inventory.manual_dust_ring_haymaker || 0
  gs._grantManual(D.L.find(a => a.sig === 'arena:dust').id, "from the Dust Ring's champion")
  assert((s.inventory.manual_dust_ring_haymaker || 0) === n0 + 1, 'the Dust Ring champion\'s art is Dust Ring Haymaker')

  // ── migration: an old save with no arts ──
  delete s.arts; delete s.root.elements; gs._recalc()
  assert(s.arts && s.root.elements?.length && s.arts.loadout.moves.filter(Boolean).length >= 2, 'an old save gets root elements, starters and a loadout')
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
