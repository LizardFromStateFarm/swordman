// Scenario checks — Phase 28 task 4.10b (docs/systems/living-world.md → "4.10b as built", PLAN 28K): Your Rival.
// Pins: one rival per life from your class (a Chosen, never kin), named in the log with a first beat; the rival never
// comes as an ordinary road face or avenger, only on their own schedule (_tickRival: first visit after awakening, then
// every 15–25 game years) and first in line when the queue is full; the four card kinds and every answer (odds, locks
// with reasons, heat on the note); heat moves with every memory (× relToHeat) and both ways; blood duels only at heat
// ≤ −70, brotherhood / courtship only at ≥ +70; a blood feud can go after your kin (pay, intercept, or let them face
// it: they may die); fights write wins / losses / meetings and a kill ends the rivalry; their breakthrough is a headline
// (+ banter); passing them is a beat; their death ends it; they lead the enemy in a war (the foe's Might ×); a strong
// rivalry becomes a house whose heir is the next life's rival (heat carried at half, a cold start), and the rare
// rival-family rebirth uses their line; the person card, People → Rivals, rivalInfo (real-time next visit, deeds), news.
// Run: npm run checks (all) · node scripts/sim/checks/rival.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 410 }); await sim.boot(0); const gs = sim.gs
  let s = gs.get(), w = s.world
  const R = sim.ev('NPC_RIVAL'), E = sim.ev('NPC_ENC'), Persons = sim.ev('Persons'), LOCATIONS = sim.ev('LOCATIONS')
  const rand = v => sim.ev(`globalThis.__mr = Math.random; Math.random = () => ${v}`), unrand = () => sim.ev('Math.random = globalThis.__mr')
  s.stageIndex = 9; s.maxStageThisLife = 9; s.spiritStones = 50000; s.health = 100; gs._recalc()
  const clearRoad = () => { for (const c of [...s.road.cards]) gs._roadClose(c, null); s.road.waiting = []; s.family.encounters = [] }

  // ── Who ──
  let rec = gs._rivalRec(), rv = rec && w.persons[rec.pid]
  assert(!!rec && !!rv, `a rival is named for this life (${rec?.name})`)
  const cohort = w.cohorts[gs._lifeNo()].ids
  assert(cohort.includes(rv.id) && rv.cohort === gs._lifeNo(), 'they are of your class')
  assert(rv.chosen, 'one of Heaven\'s Chosen')
  assert(!gs._isYourKin(rv) && rv.family !== s.self.family, 'never your kin')
  assert(rv.rivalOf === s.self.id, 'their record marks them (rivalOf = you)')
  assert(rec.beats[0]?.k === 'chosen' && rec.heat === 0, 'the first beat: you awaken in the same year; heat starts at 0')
  assert((s.events || []).some(e => /will not let you out of their sight/.test(e.text)), 'the log names them, and says where to look')
  assert(gs._pickRival() === rec && w.rivals.filter(r => r.life === gs._lifeNo()).length === 1, 'one per life (picking again changes nothing)')

  // ── Not an ordinary face ──
  rv.feud = { pid: s.self.id, why: 'test', y: Math.floor(w.year) }; rv.roadY = null
  assert(gs._roadAvenger()?.id !== rv.id, 'never cast as an ordinary avenger')
  delete rv.feud
  E.chance.expedition = 1; E.perHour = 99
  const loc = LOCATIONS.filter(l => l.minStage <= s.stageIndex).slice(-1)[0]
  let cast = 0
  for (let i = 0; i < 30; i++) { const c = gs._roadRoll('expedition', loc); if (c?.pid === rv.id) cast++ }
  assert(cast === 0, 'never cast as an ordinary road face')
  clearRoad()

  // ── Their schedule ──
  const yr0 = Math.floor(w.year)
  rec.nextY = yr0 + 5
  gs._tickRival(yr0)
  assert(!s.road.cards.some(c => c.rival), 'not before their time')
  gs._tickRival(yr0 + 5)
  let card = s.road.cards.find(c => c.rival)
  assert(!!card && card.pid === rv.id && rv.roadCard === card.id, `on their time they seek you out (${card?.kind})`)
  assert(rec.nextY - (yr0 + 5) >= R.meetEvery[0] && rec.nextY - (yr0 + 5) <= R.meetEvery[1], `the next visit is ${R.meetEvery.join('–')} game years on (${rec.nextY - yr0 - 5})`)
  const ri = gs.rivalInfo()
  assert(ri.onRoad === card.id && ri.nextSecs == null, 'rivalInfo: waiting on the road, no countdown while they wait')
  clearRoad()

  // queue full → first in line
  for (let i = 0; i < E.queueMax; i++) s.family.encounters.push({ id: 'x' + i, kind: 'lover', person: { given: 'X' } })
  s.road.waiting = [{ pid: 'nobody', kind: 'ambush', source: 'expedition', place: 'x' }]
  rec.nextY = Math.floor(w.year)
  gs._tickRival(Math.floor(w.year))
  assert(s.road.waiting[0]?.pid === rv.id && s.road.waiting[0].rival && rv.roadCard === 'wait', 'when your hands are full they wait, first in line')
  s.family.encounters = []; s.road.waiting = s.road.waiting.filter(x => x.pid === rv.id); gs._roadPromote()
  card = s.road.cards.find(c => c.rival)
  assert(!!card && card.pid === rv.id, 'and come the moment a place frees')
  const ns = gs.rivalInfo()
  assert(ns.has && typeof ns.word === 'string' && ns.acts && ns.acts.list.some(a => a.id === 'spar'), 'rivalInfo: the heat word and the deeds you can start')
  clearRoad()

  const open = kind => { clearRoad(); rv.roadCard = null; const c = gs._roadCard(rv, kind, 'rival', loc, loc.name, false, { rival: true, kin: kind === 'rivalKin' ? gs._rivalKinTarget() : null }); return gs.roadCardInfo(c.id) }
  const ans = (info, id) => info.answers.find(a => a.id === id)

  // ── A challenge ──
  rec.heat = 0
  let info = open('rivalDuel')
  assert(info.title && info.why && info.urgent === false, `a challenge card: "${info.title}" — ${info.why}`)
  assert(/blood feud/.test(ans(info, 'blood').lock || ''), `no duel to the death outside a blood feud ("${ans(info, 'blood').lock}")`)
  assert(/heat/.test(ans(info, 'decline').note), `the decline says what it does to the heat ("${ans(info, 'decline').note}")`)
  const m0 = rec.meets
  gs.answerRoadCard(info.id, 'decline')
  assert(rec.heat < 0 && rec.meets === m0 + 1 && rec.beats.slice(-1)[0].k === 'declined', `refusing them cools it (heat ${rec.heat}) and is a meeting`)
  // spar won / lost
  info = open('rivalDuel'); s.health = 100
  const w0 = rec.wins, h0 = rec.heat
  gs.answerRoadCard(info.id, 'spar'); playFight(gs, 'win'); gs.personFightFinish('raise')
  assert(rec.wins === w0 + 1 && rec.heat > h0 && rec.beats.slice(-1)[0].k === 'won', `a spar won and a hand up: a win, and the heat warms (${h0} → ${rec.heat})`)
  info = open('rivalDuel'); s.health = 100
  const l0 = rec.losses
  gs.answerRoadCard(info.id, 'spar'); playFight(gs, 'lose')
  assert(rec.losses === l0 + 1 && !s.interlude && rec.beats.slice(-1)[0].k === 'lost', 'a spar lost: a loss, and you live')
  // humbled
  info = open('rivalDuel'); s.health = 100
  const h1 = rec.heat
  gs.answerRoadCard(info.id, 'spar'); playFight(gs, 'win'); gs.personFightFinish('humble')
  assert(rec.heat < h1 && rec.beats.slice(-1)[0].k === 'humbled', `shaming them in the dust cools it (${h1} → ${rec.heat})`)

  // ── Heat from any memory ──
  const h2 = rec.heat
  gs._remember(rv, 'gift', 10, 'test gift')
  assert(rec.heat === Math.max(-100, Math.min(100, h2 + Math.round(10 * R.relToHeat))), `every memory moves the heat × ${R.relToHeat} (${h2} → ${rec.heat})`)

  // ── A cup of wine; brotherhood and courtship at the warm end ──
  rec.heat = 40
  info = open('rivalTalk')
  assert(/Needs heat/.test(ans(info, 'swear').lock || '') && /Needs heat/.test(ans(info, 'court').lock || ''), 'brotherhood and courtship wait for heat +70')
  gs.answerRoadCard(info.id, 'drink')
  assert(rec.heat > 40 && rec.beats.slice(-1)[0].k === 'drink', `a shared jar warms it (${rec.heat})`)
  rec.heat = 80
  info = open('rivalTalk')
  assert(!ans(info, 'swear').lock && ans(info, 'swear').chance >= 60, `at heat +80 they may swear (${ans(info, 'swear').chance}%)`)
  rand(0); gs.answerRoadCard(info.id, 'swear'); unrand()
  assert(rv.sworn === s.self.id && rec.beats.slice(-1)[0].k === 'sworn', 'sworn brotherhood: rivals still')
  rv.sworn = null

  // ── Cornered ──
  rec.heat = 0; s.health = 100
  info = open('rivalTrouble')
  const k0 = s.karma, hp0 = s.health
  gs.answerRoadCard(info.id, 'help')
  assert(rec.heat > 15 && s.health < hp0 && s.karma > k0 && rec.beats.slice(-1)[0].k === 'helped', `helping them costs Health, raises karma and the heat (${rec.heat})`)
  rec.heat = 0; rv.npcXp = 0.5
  info = open('rivalTrouble')
  rand(0); gs.answerRoadCard(info.id, 'sabotage'); unrand()
  assert(rv.npcXp === 0 && rv.injuredUntil > w.year && rec.heat < -20 && /know it was you/.test(rec.beats.slice(-1)[0].text), `sabotage found out: their progress gone, heat ${rec.heat}`)
  rec.heat = 0
  info = open('rivalTrouble')
  rand(0.99); gs.answerRoadCard(info.id, 'sabotage'); unrand()
  assert(rec.heat === 0, 'sabotage unseen: they never learn (the heat holds)')

  // ── A blood feud: the duel to the death, and your kin ──
  rec.heat = -80
  info = open('rivalDuel')
  assert(info.blood && info.urgent && !ans(info, 'blood').lock, 'at heat −80 the challenge is to the death (urgent)')
  clearRoad()
  // a grown heir for them to go after
  const f = s.family
  const kid = sim.ev('Persons').make({ id: gs._newPersonId(), given: 'Lan', family: s.self.family, bornYear: Math.floor(w.year) - 20, role: 'child', alive: true, parents: [s.self.id] })
  kid.stageIndex = 2; f.children.push(kid); f.heirId = kid.id
  const tgt = gs._rivalKinTarget()
  assert(tgt?.id === kid.id && tgt.word === 'your heir', 'their target is your heir')
  info = open('rivalKin')
  assert(info.urgent && /Stand between/.test(ans(info, 'intercept').label) && /Spirit Stones/.test(ans(info, 'pay').note) && /lives/.test(ans(info, 'leave').note),
    `the kin card: intercept · pay (${ans(info, 'pay').note}) · let them face it (${ans(info, 'leave').note})`)
  const st0 = s.spiritStones
  gs.answerRoadCard(info.id, 'pay')
  assert(s.spiritStones < st0 && kid.alive && rec.beats.slice(-1)[0].k === 'kinPaid', 'the blood price buys your heir, this time')
  info = open('rivalKin')
  rand(0.999); gs.answerRoadCard(info.id, 'leave'); unrand()
  assert(kid.alive === false && kid.cause === 'rival' && f.heirId !== kid.id && rec.beats.slice(-1)[0].k === 'kinKilled', 'left to face them alone, your heir can die')
  // intercept, and win to the death
  rec.heat = -80
  const kid2 = sim.ev('Persons').make({ id: gs._newPersonId(), given: 'Mei', family: s.self.family, bornYear: Math.floor(w.year) - 18, role: 'child', alive: true, parents: [s.self.id] })
  f.children.push(kid2)
  info = open('rivalKin'); s.health = 100
  gs.answerRoadCard(info.id, 'intercept')
  assert(s.family.fight?.lethal && s.family.fight.road?.kind === 'rivalKin', 'standing between them is a fight to the death')
  playFight(gs, 'win'); gs.personFightFinish('finish')
  assert(rv.alive === false && rec.end?.k === 'slain' && rec.beats.some(b => b.k === 'kinSaved') && kid2.alive, `you kill your rival, and ${kid2.given} lives`)
  assert(gs.rivalInfo().end?.k === 'slain' && gs.rivalInfo().nextSecs == null, 'the rivalry has ended (no next visit)')

  // ── House → the next life's rival ──
  assert(gs.knownPeople({ filter: 'rival' }).rows.some(r => r.pid === rv.id), 'World → People → Rivals lists them (the fallen too)')
  const surname = rv.family, oldId = rv.id, oldName = Persons.fullName(rv)
  gs.passTheMantle(); gs.finishInterlude('orphan')
  s = gs.get(); w = s.world
  const house = w.rivalHouses[surname]
  assert(house && house.heat <= -60 && house.end === 'slain' && house.fromName === oldName, `a slain rival's line hates yours (house heat ${house?.heat})`)
  assert(w.enemies.some(e => e.kind === 'rival' && e.personId === oldId), 'a bitter house is an enemy the rare rival-family rebirth can use')
  const rec2 = gs._rivalRec(), rv2 = rec2 && w.persons[rec2.pid]
  assert(!!rec2 && rec2.life === 2 && rv2?.family === surname && rv2.rivalHouse === surname, `the next life's rival is the house's heir (${rec2?.name})`)
  assert(rec2.inherited?.fromName === oldName && rec2.heat === Math.round(house.heat * R.carryHeat) && rv2.rel <= R.houseRel, `inherited: heat ${rec2.heat}, a cold start (rel ${rv2.rel})`)
  assert(rec2.beats[0]?.k === 'inherited' && /stood against yours/.test(gs._rivalWhy({ kind: 'rivalDuel' }, rec2)), 'the card and the history say why')
  assert(gs.rivalInfo().past.some(x => x.pid === oldId && x.end === 'slain'), 'the past life\'s rival is kept in the record')
  assert(gs.personInfo(rv2.id).rival?.heat === rec2.heat && gs.personInfo(oldId).rival?.word === 'Rival of a past life', 'the person card marks this life\'s rival and a past one')
  assert(gs._tieToYou(rv2, gs._peopleCtx()).word === 'Your rival', 'World → People ties them to you')

  // ── Headlines, passes, their death ──
  s.stageIndex = 9; gs._recalc()
  rv2.stageIndex = 5; rec2.lead = 1
  const evN = (s.events || []).length
  gs._tellLives([{ k: 'up', p: rv2 }], gs._lifeNo(), new Set())
  assert((s.events || []).slice(0, (s.events || []).length - evN + 1).some(e => /Your rival .* has broken into/.test(e.text)) || (s.events || []).some(e => /Your rival .* has broken into/.test(e.text)), 'their breakthrough is a headline')
  assert(rec2.beats.slice(-1)[0].k === 'rose', 'and a beat')
  rv2.stageIndex = 12; gs._rivalLead(rec2, rv2)
  assert(rec2.lead === -1 && rec2.beats.slice(-1)[0].k === 'passed', 'they pass you: a beat')
  rv2.stageIndex = 3; const hp = rec2.heat; gs._rivalLead(rec2, rv2)
  assert(rec2.lead === 1 && rec2.beats.slice(-1)[0].k === 'overtook' && rec2.heat !== hp, `you pass them back: a beat, and it stings (${hp} → ${rec2.heat})`)
  const news = gs.rivalNews()
  assert(news > 0, `the World tab carries news of your rival (${news})`)
  gs.noteRivalSeen()
  assert(gs.rivalNews() === 0, 'opening World → Rival clears it')

  // ── A war they lead ──
  const foe = gs._wsAll().find(r => r.alive)
  if (foe) {
    s.sectWar = s.sectWar || {}; const saved = { ...s.sectWar }
    s.sectWar.phase = 'preparing'; s.sectWar.enemyId = foe.id; s.sectWar.enemyName = foe.name
    rv2.sectId = null; const base = gs._warMightRatio(false)
    rv2.sectId = foe.id; const led = gs._warMightRatio(false)
    assert(led.rival?.pid === rv2.id && (led.ratio > base.ratio || led.ratio === sim.ev('WORLD_SECTS').war.ratioMax), `your rival leads the ${foe.name}: their Might × ${led.rival?.mult.toFixed(2)}`)
    const h3 = rec2.heat
    gs._wsWarResult(true, false)
    assert(rec2.beats.slice(-1)[0].k === 'war' && rec2.heat === h3 + R.heat.warLed, 'the war is a beat, and it cools the heat')
    Object.assign(s.sectWar, saved); rv2.sectId = null
  } else console.log('skip  no world sect for the war check')

  // ── Their death ──
  gs._killPerson(rv2.id, Math.floor(w.year), 'bt_backlash')
  assert(rec2.end?.k === 'fell' && rec2.beats.slice(-1)[0].k === 'fell' && (s.events || []).some(e => /Your rival .* has fallen/.test(e.text)), 'their death ends the rivalry, and the log says how')

  // ── The rival-family rebirth uses their line ──
  const p3 = Object.values(w.persons).find(p => p.alive !== false && gs._heavyEligible(p, gs._clanIdSet()) && !p.roadCard)
  assert(gs._rivalLineHead(p3.id) === p3, 'a living past rival heads their own house')
  const child = Object.values(w.persons).find(c => c.alive !== false && (c.parents || []).length && w.persons[c.parents[0]]?.alive === false && gs._heavyEligible(c, gs._clanIdSet()))
  if (child) assert(gs._rivalLineHead(child.parents[0]) != null, 'a dead one\'s child heads it in their place')

  // ── Save roundtrip ──
  const back = JSON.parse(JSON.stringify(w.rivals))
  assert(back.length === w.rivals.length && back[1].beats.length === w.rivals[1].beats.length, 'the records survive a save')
})()
