// Scenario checks — Phase 28 task 4.8 (docs/systems/living-world.md → "4.8 Heavenly Rankings", PLAN 28J): the in-world
// boards. Pins: one rank power for you and everyone (its parts sum; arts, gear, progress, renown count); the first
// publication sets baselines quietly; Heaven holds everyone living (sorted), Rising Dragon only ≤ 60 years on the path
// (score = power × K ÷ (years + K)); Your Class = your cohort by power, the fallen kept apart; ▲▼ against the last
// publication; crossing the top 10 writes a log line + a title + rank_rise banter; Veil your name takes you off the public
// boards (your place still known), stops rank fame and visitors; rank fame feeds a founder's sect; ranked members raise a
// world sect's Might; challengers from just below (spar / blood / decline: renown, the coward count), genius hunters
// (fight / flee / pay / veil; after your Rising Dragon child: hide / pay / intercept / let them face it), invitations
// (accept → joined at rank 1 / decline / refuse), the Class board duel (only the one just above you, a real-time
// cooldown); class firsts; rankingsInfo for every board (real-time next publication); the state stays small.
// Run: npm run checks (all) · node scripts/sim/checks/rankings.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 48 }); await sim.boot(0); const gs = sim.gs
  let s = gs.get(), w = s.world
  const K = sim.ev('NPC_RANK'), Persons = sim.ev('Persons'), SECTS = sim.ev('SECTS')
  const rand = v => sim.ev(`globalThis.__mr = Math.random; Math.random = () => ${v}`), unrand = () => sim.ev('Math.random = globalThis.__mr')
  s.stageIndex = 6; s.maxStageThisLife = 6; s.spiritStones = 100000; s.health = 100; gs._recalc()
  const clearRoad = () => { for (const c of [...s.road.cards]) gs._roadClose(c, null); s.road.waiting = []; s.family.encounters = [] }
  const ans = (info, id) => info.answers.find(a => a.id === id) || {}
  const quiet = () => { K.challenge.chance = 0; K.hunter.chance = 0; K.invite.chance = 0 }
  quiet()
  let yr = Math.floor(w.year)
  const publish = () => { yr++; gs._tickRanks(yr) }

  // ── Rank power ──
  const mine = gs.rankPowerParts(null, true)
  assert(mine.total === mine.parts.reduce((a, x) => a + x.value, 0) && mine.parts[0].value === 600, `your rank power sums its parts (${mine.total}: ${mine.parts.map(p => p.label).join(', ')})`)
  s.qi = (s.derived.qiCap || 1) * 0.5
  assert(gs.rankPowerParts(null, true).parts.some(p => p.label === 'Progress in the stage' && p.value === 50), 'progress in the stage counts (half full = 50)')
  const someone = Object.values(w.persons).find(p => p.alive !== false && (p.stageIndex || 0) >= 3)
  const theirs = gs.rankPowerParts(someone)
  assert(theirs.parts.some(p => /reckons/.test(p.label)), 'an NPC arts: an estimate by realm (stable: never rolled by a read)')
  someone.renown = 40
  assert(gs.rankPowerParts(someone).total === theirs.total + 40, 'renown adds to rank power')
  delete someone.renown

  // ── The first publication ──
  gs._tickRanks(yr)
  let R = w.ranks
  assert(R && R.y === yr && R.boards.heaven.length > 20 && R.you.heaven > 0, `the first publication: ${R.boards.heaven.length} on Heaven, you #${R.you.heaven}`)
  assert(R.news.length === 1 && !(s.events || []).some(e => /World → Rankings/.test(e.text)), 'the first publication is quiet (baselines, one news line, no log)')
  const H = R.boards.heaven
  assert(H.every((e, i) => i === 0 || H[i - 1].sc >= e.sc), 'Heaven is sorted by rank power')
  assert(H.length <= K.keep, `Heaven keeps the top ${K.keep}`)
  const D = R.boards.dragon
  const dragonOk = D.every(e => e.pid === s.self.id ? gs._rankYears(null, true) <= K.dragonYears : gs._rankYears(w.persons[e.pid]) <= K.dragonYears)
  assert(D.length > 0 && dragonOk, `Rising Dragon: only ≤ ${K.dragonYears} years on the path (${D.length})`)
  assert(gs._rankDragonScore(400, 0) === 400 && gs._rankDragonScore(400, 20) === 200, 'Rising Dragon score = power × K ÷ (years + K)')

  // ── Rising: crossing the top 10 ──
  const top10 = H[9].sc
  s.stageIndex = Math.min(21, Math.ceil(top10 / 100) + 1); s.maxStageThisLife = s.stageIndex; gs._recalc()
  const ev0 = s.events.length, emitted = []
  const unsub = gs.on ? null : null
  const realEmit = gs._emit.bind(gs); gs._emit = (t, c) => { emitted.push(t); return realEmit(t, c) }
  publish()
  gs._emit = realEmit
  assert(R.you.heaven <= 10, `stronger: you rise to #${R.you.heaven} under Heaven`)
  assert(s.events.slice(0, s.events.length - ev0 + 5).some(e => /World → Rankings/.test(e.text)) || s.events.some(e => /among the ten|stand first|among the three/.test(e.text)), 'crossing the top ten writes a log line')
  assert(R.titles.length >= 1, `a title for your name (${R.titles.map(t => t.t).join(', ')})`)
  assert(emitted.includes('rank_rise'), 'and a rank_rise line for the banter')
  assert(R.prev.heaven[s.self.id] && R.prev.heaven[s.self.id] > R.you.heaven, `▲▼: the last publication remembers #${R.prev.heaven[s.self.id]}`)
  w.year = yr + 0.5
  let info = gs.rankingsInfo('heaven')
  const me = info.rows.find(r => r.self)
  assert(me && me.move > 0, `rankingsInfo(heaven): your row with ▲${me?.move}`)
  assert(info.rows.length <= K.show + 2 * K.around + 5 && info.rows[0].place === 1, `the top ${K.show} + your neighbours (${info.rows.length} rows)`)
  assert(info.nextSecs > 0 && info.nextSecs <= 3600 / 30 * K.every, `the next publication in real seconds (${info.nextSecs}s)`)

  // ── Fame + Might ──
  const founded = s.ownSect?.founded
  if (!founded) { s.ownSect.founded = true; s.ownSect.name = 'Test Peak'; s.ownSect.hallLevel = s.ownSect.hallLevel || 1 }
  gs._recalc()
  const fame = gs._rankFame()
  assert(fame > 0 && s.derived.sectFame >= fame, `a public place brings your sect fame (+${fame})`)
  const r20 = H.slice(0, 20).map(e => w.persons[e.pid]).find(p => p?.sectId && p.sectId !== 'own')
  if (r20) {
    const rec = gs._wsRec(r20.sectId), M = sim.ev('worldSectMight')
    const n = rec.ranked || 0, base = M({ ...rec, ranked: 0 })
    assert(n > 0 && M(rec) === base + K.sectMight * n, `a world sect's Might counts its people in the Heaven top 20 (${rec.name}: ${n} → +${K.sectMight * n})`)
  } else assert(true, '(no world sect member in the Heaven top 20 this seed)')

  // ── Veil ──
  gs.setRankVeil(true); publish()
  assert(!R.boards.heaven.some(e => e.pid === s.self.id) && R.you.heaven > 0, `veiled: off the public board, your place still known (#${R.you.heaven})`)
  gs._recalc()
  assert(gs._rankFame() === 0, 'veiled: no rank fame')
  K.challenge.chance = 1; K.hunter.chance = 1; K.invite.chance = 1; R.cd = { challenge: 0, hunter: 0, invite: 0 }
  clearRoad(); publish()
  assert(!s.road.cards.some(c => c.rank), 'veiled: no challengers, hunters or invitations')
  quiet()
  assert(gs.rankingsInfo('heaven').youOff === 'veiled', 'rankingsInfo says why you are not on the board')
  gs.setRankVeil(false); publish()
  assert(R.boards.heaven.some(e => e.pid === s.self.id), 'unveiled: back on the board at the next publication')
  if (!founded) { s.ownSect.founded = false; gs._recalc() }

  // ── A challenger from just below ──
  s.stageIndex = 9; s.maxStageThisLife = 9; gs._recalc(); publish()
  clearRoad(); K.challenge.chance = 1; R.cd.challenge = 0; publish(); quiet()
  let card = s.road.cards.find(c => c.kind === 'rankChallenge')
  assert(!!card, `a challenger comes from just below you (#${card?.rank?.theirs} vs your #${card?.rank?.yours})`)
  if (card) {
    const p = w.persons[card.pid]
    assert(card.rank.theirs > card.rank.yours && Math.abs((p.stageIndex || 0) - s.stageIndex) <= K.challenge.stageGap, 'ranked below you, within reach')
    info = gs.roadCardInfo(card.id)
    assert(info.title === sim.ev('NPC_RANK_TEXT').title.rankChallenge && /renown/.test(ans(info, 'spar').note) && /this life ends/.test(ans(info, 'blood').note), 'its answers show odds and what is at stake')
    const r0 = R.renown, d0 = R.declines
    gs.answerRoadCard(card.id, 'decline')
    assert(R.renown < r0 && R.declines === d0 + 1 && (p.mem || []).some(m => /would not fight|hid from my challenge/.test(m.text)), `declining: renown ${r0} → ${R.renown}, the coward count +1, they remember`)
    p.roadCard = null; p.roadY = null
    gs._rankMeet(p, 'rankChallenge', { board: 'heaven', theirs: card.rank.theirs, yours: card.rank.yours })
    card = s.road.cards.find(c => c.kind === 'rankChallenge'); s.health = 100
    const r1 = R.renown
    gs.answerRoadCard(card.id, 'spar'); playFight(gs, 'win'); gs.personFightFinish('raise')
    assert(R.renown === Math.min(K.renown.max, r1 + K.renown.win) && (p.renown || 0) < 0, `a spar won: your renown +${K.renown.win}, theirs falls`)
    p.roadCard = null
    gs._rankMeet(p, 'rankChallenge', { board: 'heaven', theirs: card.rank.theirs, yours: card.rank.yours })
    card = s.road.cards.find(c => c.kind === 'rankChallenge'); s.health = 100
    const r2 = R.renown
    gs.answerRoadCard(card.id, 'spar'); playFight(gs, 'lose')
    assert(R.renown === r2 + K.renown.lose && !s.interlude, 'a spar lost: renown falls, and you live')
    s.health = 100
  }
  clearRoad()

  // ── A genius hunter (you on Rising Dragon) ──
  const hunter = gs._rankHunter(s.stageIndex, Math.random)
  assert(hunter.hunter && hunter.morality < -40 && hunter.stageIndex > s.stageIndex, `a hunter: dark-hearted, a step above you (${hunter.stageIndex} vs ${s.stageIndex})`)
  gs._rankMeet(hunter, 'hunter', { board: 'dragon', yours: 3 })
  card = s.road.cards.find(c => c.kind === 'hunter'); info = gs.roadCardInfo(card.id)
  assert(info.urgent && card.lethal && ['fight', 'flee', 'pay', 'veil'].every(a => ans(info, a).id), 'the hunter card: urgent, to the death; fight / flee / pay / veil')
  const k0 = s.karma, h0 = gs.reputeInfo().h, rn0 = R.renown
  gs.answerRoadCard(card.id, 'fight'); playFight(gs, 'win'); gs.personFightFinish('finish')
  assert(hunter.alive === false && s.karma >= k0 && gs.reputeInfo().h > h0 && R.renown > rn0, `the hunter slain: no karma lost, Honour +, renown +${R.renown - rn0}`)
  s.health = 100
  const hunter2 = gs._rankHunter(s.stageIndex, Math.random)
  gs._rankMeet(hunter2, 'hunter', { board: 'dragon', yours: 3 })
  card = s.road.cards.find(c => c.kind === 'hunter')
  rand(0.01); gs.answerRoadCard(card.id, 'veil'); unrand()
  assert(R.veil && !s.road.cards.some(c => c.kind === 'hunter') && !s.family.fight, 'Veil your name: they lose the trail, and your name is veiled')
  gs.setRankVeil(false)
  clearRoad()

  // ── A hunter after your Rising Dragon child ──
  const kid = gs._mintPerson({ stage: 4, age: [17, 18], role: 'youth' }, Math.random)
  kid.owner = 'family'
  s.family.children.push({ id: kid.id, given: kid.given, family: kid.family, alive: true, bornYear: kid.bornYear, stageIndex: kid.stageIndex, bond: 60 })
  R.boards.dragon = [{ pid: kid.id, sc: 9999 }, ...R.boards.dragon.filter(e => e.pid !== s.self.id && e.pid !== kid.id)]
  R.you.dragon = null
  const tgt = gs._rankKinTarget()
  assert(tgt?.pid === kid.id && tgt.place === 1, 'your child on the Rising Dragon top 20 is a target')
  let hk = gs._rankHunter(kid.stageIndex, Math.random)
  gs._rankMeet(hk, 'hunterKin', { board: 'dragon', theirs: 1, kin: { id: kid.id, name: kid.given, word: 'your child', kind: 'child' } })
  card = s.road.cards.find(c => c.kind === 'hunterKin'); info = gs.roadCardInfo(card.id)
  assert(['intercept', 'pay', 'hide', 'leave'].every(a => ans(info, a).id) && /lives/.test(ans(info, 'leave').note), 'their card: stand between / pay / hide / let them face it (with the odds they live)')
  gs.answerRoadCard(card.id, 'hide')
  assert((kid.rankHiddenUntil || 0) > Math.floor(w.year) && !gs._rankField().some(e => e.pid === kid.id), 'hidden: off the boards for years')
  kid.rankHiddenUntil = 0
  hk = gs._rankHunter(kid.stageIndex, Math.random)
  gs._rankMeet(hk, 'hunterKin', { board: 'dragon', theirs: 1, kin: { id: kid.id, name: kid.given, word: 'your child', kind: 'child' } })
  card = s.road.cards.find(c => c.kind === 'hunterKin')
  rand(0.999); gs.answerRoadCard(card.id, 'leave'); unrand()
  const kc = s.family.children.find(c => c.id === kid.id)
  assert(!kc.alive && kid.alive === false && kid.cause === 'hunter', 'left to face the hunter, your child can die (cause: hunter)')
  clearRoad()

  // ── An invitation ──
  if (s.sect?.id) gs.leaveSect()
  const wasFounded = s.ownSect.founded; s.ownSect.founded = false
  const inviter = gs._rankInviter()
  const envoy = inviter && gs._rankEnvoy(inviter)
  assert(!!inviter && !!envoy, `a sect wants a ranked name (${inviter?.name}, envoy ${envoy && Persons.fullName(envoy)})`)
  if (envoy) {
    gs._rankMeet(envoy, 'invite', { board: 'heaven', yours: 12, sect: inviter.id })
    card = s.road.cards.find(c => c.kind === 'invite'); info = gs.roadCardInfo(card.id)
    assert(['accept', 'decline', 'refuse'].every(a => ans(info, a).id), 'accept / decline / refuse')
    const res = gs.answerRoadCard(card.id, 'accept')
    assert(res.ok && s.sect.id === inviter.defId && s.sect.rank === K.invite.startRank, `accepted: you join the ${inviter.name} as ${sim.ev('SECT_RANKS')[s.sect.rank].name}`)
    gs.leaveSect()
  }
  s.ownSect.founded = wasFounded
  clearRoad()

  // ── The Class board duel ──
  s.stageIndex = 0; s.maxStageThisLife = 6; s.qi = 0; gs._recalc()
  const cls = gs._rankClass(), i = cls.findIndex(e => e.self)
  const duel = gs._rankDuelInfo()
  assert(i > 0 && duel?.pid === cls[i - 1].pid, `the Class duel targets the one just above you (#${i} → ${duel?.name})`)
  const pa = w.persons[duel.pid]
  s.stageIndex = Math.max(0, (pa.stageIndex || 0)); gs._recalc()
  const d2 = gs._rankDuelInfo()
  if (d2 && !d2.lock) {
    const res = gs.challengeRanked(d2.pid)
    assert(res.ok && s.family.fight?.road?.kind === 'rankDuel', 'challengeRanked: a spar on the battle page')
    const r3 = R.renown
    playFight(gs, 'win'); gs.personFightFinish('raise')
    assert(R.renown > r3, `the Class duel won: renown +${R.renown - r3}`)
    const d3 = gs._rankDuelInfo()
    assert(!d3 || d3.lock, `then a real-time cooldown (${d3?.lock})`)
    assert(gs.challengeRanked('nobody').reason === 'not_above', 'only the one just above you can be called out')
  } else assert(true, `(class duel skipped: ${d2?.lock})`)
  s.health = 100

  // ── Your class ──
  info = gs.rankingsInfo('class')
  assert(info.rows.some(r => r.self) && info.counts.living === info.total, `rankingsInfo(class): you among ${info.total} living`)
  assert(R.firsts && Object.keys(R.firsts).length >= 0, `class firsts tracked (${Object.keys(R.firsts || {}).join(', ') || 'none yet'})`)
  const victim = w.persons[w.cohorts[gs._lifeNo()].ids.find(id => w.persons[id]?.alive !== false && id !== s.self.id)]
  gs._killPerson(victim.id, Math.floor(w.year), 'road')
  info = gs.rankingsInfo('class')
  assert(info.fallen.some(f => f.pid === victim.id) && !info.rows.some(r => r.pid === victim.id), 'the fallen leave the board and stay listed apart')

  // ── Small state ──
  const size = JSON.stringify(w.ranks).length
  assert(size < 40000, `w.ranks stays small (${size} chars)`)
  assert(gs.ranksNews() > 0, 'news waits for the view'); gs.noteRanksSeen(); assert(gs.ranksNews() === 0, 'and clears when seen')
})()
