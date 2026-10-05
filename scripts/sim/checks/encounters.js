// Scenario checks — Phase 28 task 4.9 (docs/systems/living-world.md → "4.9 as built"): encounters. The world's people
// meet you on expeditions, sect missions and at a founder's gate; the NPC picks their intent, you answer a queued card.
// Pins: rolls make cards for real registry people (known-first, a fresh face is minted and kept); intents read temper,
// morality and rel; the queue holds ≤ 6 (with the old lover/formula strangers), an ordinary overflow is a brush and a
// notable one waits; a card never expires and the stance only pre-selects; every answer moves rel + leaves a mem line;
// robbing makes them swear a feud and the avenger comes back as an ambush; road fights (win / lose / to the death)
// settle the card; killing someone sends their kin after you; a person who dies on a card takes it with them; a person
// on a card skips their own goals; youth invite / point; the stats counters.
// Run: npm run checks (all) · node scripts/sim/checks/encounters.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 49 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
  const E = sim.ev('NPC_ENC'), Persons = sim.ev('Persons'), LOCATIONS = sim.ev('LOCATIONS')
  s.stageIndex = 9; s.maxStageThisLife = 9; s.spiritStones = 5000; s.health = 100; gs._recalc()
  const loc = LOCATIONS.filter(l => l.minStage <= s.stageIndex).slice(-1)[0]
  const R = () => s.road
  const used = new Set()
  const fresh = () => {   // a world person free to meet you (each one once)
    const clan = gs._clanIdSet()
    const p = Object.values(w.persons).find(p => gs._heavyEligible(p, clan) && !used.has(p.id) && !p.roadCard && !p.sectRole && !p.feud)
    if (p) used.add(p.id)
    return p
  }
  const clear = () => { for (const c of [...R().cards]) gs._roadClose(c, null); R().waiting = []; s.family.encounters = [] }

  assert(s.road && Array.isArray(s.road.cards) && s.road.cards.length === 0, 'a new life starts with an empty road')
  assert(gs.roadStance() === E.stanceDefault, `the default bearing is ${E.stanceDefault}`)

  // ── Rolling ──
  E.chance.expedition = 1; E.perHour = 99
  const made = []
  for (let i = 0; i < 40 && made.length < 6; i++) { const c = gs._roadRoll('expedition', loc); if (c?.id) made.push(c); else if (c) break }
  assert(made.length >= 4, `forced rolls make cards (${made.length}: ${made.map(c => c.kind).join(', ')})`)
  assert(made.every(c => w.persons[c.pid] && w.persons[c.pid].roadCard === c.id), 'every card is a real registry person, marked as on the card')
  assert(made.every(c => c.why && c.text && c.title !== undefined || c.why), 'every card says why they came')
  assert(R().cards.length <= E.queueMax, `the queue holds ≤ ${E.queueMax} (${R().cards.length})`)
  const before = w.roadStats.brushes
  for (let i = 0; i < 10; i++) gs._roadRoll('expedition', loc)
  assert(R().cards.length === E.queueMax && w.roadStats.brushes > before, `a full queue turns ordinary meetings into brushes (${w.roadStats.brushes - before})`)
  clear(); E.chance.expedition = 0.18; E.perHour = 4

  // ── Intents read who they are ──
  const kinds = {}
  const saint = fresh(); saint.personality = 'niceguy'; saint.morality = 80; saint.rel = 50
  for (let i = 0; i < 200; i++) { const k = gs._roadIntent(saint, 'expedition'); kinds[k] = (kinds[k] || 0) + 1 }
  assert(!kinds.ambush, `a righteous, warm niceguy never ambushes you (${JSON.stringify(kinds)})`)
  const brute = fresh(); brute.personality = 'psycho'; brute.morality = -70; brute.rel = -50
  let amb = 0; for (let i = 0; i < 200; i++) if (gs._roadIntent(brute, 'expedition') === 'ambush') amb++
  assert(amb > 70, `a ruthless psycho who hates you mostly ambushes (${amb}/200)`)
  let gateBad = 0; for (let i = 0; i < 100; i++) if (['rescue', 'contest', 'teamup'].includes(gs._roadIntent(brute, 'gate'))) gateBad++
  assert(gateBad === 0, 'no rescue / contest / team-up at your gate')

  // ── A card never expires; the stance only pre-selects ──
  const p1 = fresh(), c1 = gs._roadCard(p1, 'rescue', 'expedition', loc, loc.name, false)
  for (const st of ['wary', 'courteous', 'bold', 'ruthless']) {
    gs.setRoadStance(st)
    assert(gs.roadCardInfo(c1.id).pre === E.preselect.rescue[st], `stance ${st} pre-selects "${E.preselect.rescue[st]}" on a rescue`)
  }
  const y0 = w.year
  for (let y = 1; y <= 60; y++) { w.year = y0 + y; gs._tickWorldLives(); gs._tickSeasons() }
  assert(R().cards.some(c => c.id === c1.id) || p1.alive === false, '60 years pass and the card still waits (never answered for you)')
  assert(w.roadStats.answered === 0, 'nothing was answered for you')
  gs.setRoadStance('courteous')

  // ── Answers: rel + memory ──
  if (p1.alive !== false) {
    const k0 = s.karma, r0 = p1.rel || 0, h0 = s.health
    const res = gs.answerRoadCard(c1.id, 'rob')
    assert(res.ok && (p1.rel || 0) < r0 && s.karma < k0, `robbing a wounded stranger: rel ${r0} → ${p1.rel}, karma ${k0} → ${s.karma}`)
    assert(/robbed/.test(p1.mem.slice(-1)[0]?.text), `they keep the line: "${p1.mem.slice(-1)[0]?.text}"`)
    assert(p1.feud?.pid === s.self.id, `they swear to repay it: "${p1.feud?.why}"`)
    assert(!R().cards.some(c => c.id === c1.id) && !p1.roadCard, 'the card is gone once answered')
    assert(s.health === h0, 'robbing costs no Health')
    // the avenger comes back as an ambush
    E.avengerChance = 1; p1.roadY = -99
    const back = gs._roadRoll('expedition', loc)
    assert(back?.kind === 'ambush' && back.pid === p1.id && back.avenger && back.lethal, 'the one you robbed comes back for your life (a lethal ambush)')
    assert(/sworn against you/.test(back.why), `the card says why: "${back.why}"`)
    const info = gs.roadCardInfo(back.id)
    assert(info.answers.find(a => a.id === 'yield').lock, 'stones won\'t buy off someone who came for your life')
    assert(info.urgent, 'an ambush is urgent')
    E.avengerChance = 0.35
    // fight it and win, then spare them
    s.health = 100
    const f = gs.answerRoadCard(back.id, 'fight')
    assert(f.ok && f.fight && s.family.fight?.kind === 'road' && s.family.fight.lethal, 'Fight opens a lethal road fight on the battle page')
    playFight(gs, 'win')
    const ch = gs.personFightChoices()
    assert(ch?.ids.includes('spare') && ch.karma.finish === 0, 'killing an ambusher in self-defence costs no karma')
    const rel1 = p1.rel
    gs.personFightFinish('spare')
    assert(p1.alive !== false && p1.rel > rel1 && /spared/.test(p1.mem.slice(-1)[0].text), `sparing them: rel ${rel1} → ${p1.rel}`)
    assert(typeof p1.feud !== 'string', 'a registry person never gets the string feud of the old fights')
  }

  // ── The blood price (final QA, user 2026-10-04): an avenger's lethal ambush can be bought off ──
  {
    clear()
    const REP = sim.ev('NPC_REP')
    const mk = (pers) => {
      for (const o of Object.values(w.persons)) if (o.feud?.pid === s.self.id) delete o.feud   // only this one is sworn against you
      const p = fresh(); p.personality = pers; p.feud = { pid: s.self.id, why: 'you robbed them', y: Math.floor(w.year) }; p.roadY = -99
      R().avN = 0; E.avengerChance = 1; const c = gs._roadRoll('expedition', loc); E.avengerChance = 0.35
      return { p, c }
    }
    const { p, c } = mk('stoic')
    assert(c?.kind === 'ambush' && c.avenger && c.lethal, 'an avenger comes back (setup)')
    const info = gs.roadCardInfo(c.id), price = info.answers.find(a => a.id === 'price')
    const want = Math.round(E.bloodPrice.stones * ((p.stageIndex || 0) + 1) / 4 * (1 + Math.max(0, (p.stageIndex || 0) - s.stageIndex) * E.bloodPrice.perGap))
    assert(price && !price.lock && new RegExp(`^${want} Spirit Stones`).test(price.note), `a lethal avenger card offers "Pay the blood price" (${price?.note})`)
    gs.setRoadStance('wary')
    assert(gs.roadCardInfo(c.id).pre === 'price', `Wary pre-selects the blood price, never Fight (${gs.roadCardInfo(c.id).pre})`)
    gs.setRoadStance('courteous')
    assert(gs.roadCardInfo(c.id).pre === 'price', 'Courteous pre-selects the blood price too')
    gs.setRoadStance('bold')
    assert(gs.roadCardInfo(c.id).pre === 'fight', 'Bold still meets them head on')
    const st0 = s.spiritStones; s.spiritStones = want - 1
    assert(/do not have/.test(gs.roadCardInfo(c.id).answers.find(a => a.id === 'price').lock || ''), 'too poor to pay: the answer is locked with the reason')
    s.spiritStones = st0
    gs._rep().h = 2
    const r0 = p.rel || 0, res = gs.answerRoadCard(c.id, 'price')
    assert(res.ok && !res.fight && s.spiritStones === st0 - want, `paying costs ${want} stones and starts no fight`)
    assert(!p.feud && p.alive !== false && p.rel > r0, `the feud ends, they live, and they think better of you (rel ${r0} → ${p.rel})`)
    assert(/blood price/.test(p.mem.slice(-1)[0]?.text || ''), `they keep the line: "${p.mem.slice(-1)[0]?.text}"`)
    assert(gs._rep().h === 0, `it costs Honour, never below 0 (${gs._rep().h}; deed ${REP.deeds.bloodPaid.h})`)
    const q = mk('psycho')
    const qa = q.c && gs.roadCardInfo(q.c.id).answers.find(a => a.id === 'price')
    assert(qa?.lock && /blood/.test(qa.lock), `a psycho will not take silver (locked: "${qa?.lock}")`)
    assert(gs.answerRoadCard(q.c.id, 'price').ok === false && q.p.feud, 'a locked price cannot be forced')
    clear()
    const plain = fresh(); plain.rel = -70; E.avengerChance = 0; E.chance.expedition = 1
    let pc = null; for (let i = 0; i < 60 && !pc; i++) { const x = gs._roadRoll('expedition', loc); if (x?.kind === 'ambush' && !x.avenger) pc = x; else if (x?.id) gs._roadClose(x, null) }
    E.avengerChance = 0.35
    if (pc) assert(!gs.roadCardInfo(pc.id).answers.some(a => a.id === 'price'), 'a stranger\'s ambush (no feud) has no blood price')
    clear()
  }

  // ── Every kind's answers resolve ──
  clear()
  const tried = []
  for (const [kind, ans] of [['contest', 'split'], ['contest', 'yield'], ['teamup', 'accept'], ['teamup', 'betray'], ['teamup', 'decline'],
                             ['rescue', 'help'], ['rescue', 'walk'], ['challenge', 'decline'], ['oldface', 'talk'], ['oldface', 'favour'],
                             ['youth', 'point'], ['youth', 'pass'], ['ambush', 'yield']]) {
    const p = fresh(); if (!p) continue
    const c = gs._roadCard(p, kind, 'expedition', loc, loc.name, false)
    if (kind === 'ambush') c.lethal = false
    const m0 = (p.mem || []).length, st0 = s.spiritStones
    const r = gs.answerRoadCard(c.id, ans)
    tried.push(`${kind}:${ans}`)
    assert(r.ok && !R().cards.some(x => x.id === c.id), `${kind} → ${ans}: "${r.text}"`)
    if (ans !== 'pass') assert((p.mem || []).length > m0 || ans === 'pass', `  ${kind} → ${ans} leaves a memory`)
    if (kind === 'ambush') assert(s.spiritStones < st0, '  handing over stones costs stones')
    if (ans === 'point') assert(p.sectId && p.sectRole === 'disciple', '  the youth takes the oath at a sect')
  }
  assert(w.roadStats.answered >= tried.length, `answered counter (${w.roadStats.answered})`)

  // ── Youth: invite needs a sect of your own ──
  const yp = fresh(); yp.sectId = null
  const yc = gs._roadCard(yp, 'youth', 'expedition', loc, loc.name, false)
  const inv = gs.roadCardInfo(yc.id).answers.find(a => a.id === 'invite')
  assert(!s.ownSect.founded ? !!inv.lock : true, `invite is locked without a sect of your own ("${inv.lock}")`)
  s.ownSect.founded = true; s.ownSect.name = 'Test Sect'; gs._recalc()
  const ok = gs.answerRoadCard(yc.id, 'invite')
  assert(ok.ok && s.ownSect.disciples.some(d => d.pid === yp.id) && yp.sectId === 'own', 'invited: the youth IS that disciple (pid kept)')

  // ── A spar lost; a duel won to the death sends their kin after you ──
  clear()
  const sp = fresh(), sc = gs._roadCard(sp, 'challenge', 'expedition', loc, loc.name, false)
  s.health = 100; gs.answerRoadCard(sc.id, 'spar'); playFight(gs, 'lose')
  assert(!s.family.fight && sp.alive !== false && /beat you/.test(sp.mem.slice(-1)[0]?.text || ''), 'a lost spar: they remember beating you')
  assert(!s.interlude, 'a lost spar never kills you')
  const clan = gs._clanIdSet()
  const parent = Object.values(w.persons).find(p => gs._heavyEligible(p, clan) && !p.roadCard && !p.sectRole && Object.values(w.persons).some(c => (c.parents || []).includes(p.id) && gs._heavyEligible(c, clan)))
  if (parent) {
    const kc = gs._roadCard(parent, 'challenge', 'expedition', loc, loc.name, false)
    s.health = 100; gs.answerRoadCard(kc.id, 'blood'); playFight(gs, 'win'); gs.personFightFinish('finish')
    const av = Object.values(w.persons).filter(p => p.feud?.pid === s.self.id && p.alive !== false && (p.parents || []).includes(parent.id))
    assert(parent.alive === false && parent.cause === 'road', `you kill ${Persons.fullName(parent)} on the road`)
    assert(av.length >= 1, `their child swears to avenge them: "${av[0]?.feud?.why}"`)
  } else console.log('skip  no parent in the registry for the kin check')

  // ── Someone who dies on a card takes it with them; a waiting notable fills the slot ──
  clear()
  const d1 = fresh(), dc = gs._roadCard(d1, 'teamup', 'expedition', loc, loc.name, false)
  gs._npcDies(d1, Math.floor(w.year), 'bt_backlash')
  assert(!R().cards.some(c => c.id === dc.id) && w.roadStats.gone >= 1, 'a person who dies before you answer: the card goes, the log says why')
  assert(/will not keep the meeting/.test(s.events[0]?.text || ''), `"${s.events[0]?.text}"`)
  for (let i = 0; i < E.queueMax; i++) { const p = fresh(); gs._roadCard(p, 'oldface', 'expedition', loc, loc.name, false) }
  const nb = fresh(); nb.rel = 80
  const wres = gs._roadMeet(nb, 'teamup', 'expedition', loc, loc.name, false)
  assert(wres.waited && R().waiting.length === 1, 'a full queue: someone who matters to you (|rel| ≥ 60) waits instead of passing by')
  gs.answerRoadCard(R().cards[0].id, 'talk')
  assert(R().cards.some(c => c.pid === nb.id) && !R().waiting.length, 'answering a card lets the waiting one in')

  // ── On a card, they wait: no goals of their own ──
  const held = R().cards[0], hp = w.persons[held.pid], act0 = JSON.stringify(hp.act || null)
  const si = Math.floor(w.year * 4)
  for (let k = 1; k <= 8; k++) gs._heavyStep(si + k, true)
  assert(JSON.stringify(hp.act || null) === act0, 'a person on your card skips their seasonal goals')

  // ── The card's person is real everywhere ──
  const pi = gs.personInfo(held.pid)
  assert(pi.go.some(g => g.view === 'explore'), 'their person card points at Roam → Explore')

  // ── Save round trip ──
  const back2 = JSON.parse(JSON.stringify(s))
  assert(Array.isArray(back2.road.cards) && back2.road.cards.length === R().cards.length, 'the road survives a save round trip')
  delete s.road; gs._ensurePhase28Fields()
  assert(Array.isArray(s.road?.cards), 'an old save gets an empty road')
  console.log('stats', JSON.stringify(gs.roadStats()))
})()
