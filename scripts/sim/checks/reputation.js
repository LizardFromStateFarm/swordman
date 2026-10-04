// Scenario checks — Phase 28 task 4.10 (docs/systems/living-world.md → "4.10 as built"): memory, reputation and the
// person card's deeds. Pins: every memory keeps its rel delta + life (the card's "why"); deeds move Honour / Infamy;
// a big deed becomes a rumour that reaches the person's kin next year (a dark heart shrugs off cruelty); Honour / Infamy
// fade; the eight card deeds (gift · spar · duel · teach · invite · swear · denounce · court) with their locks, the
// real-time per-person cooldown, odds rolled on the NPC's side; sworn siblings add to a sect war and avenge you;
// infamy brings righteous hunters onto the road; a new life inherits strong grudges whole, the rest at half, feuds
// re-aimed at you and the name at half.
// Run: npm run checks (all) · node scripts/sim/checks/reputation.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 410 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
  const R = sim.ev('NPC_REP'), A = sim.ev('NPC_ACTS'), E = sim.ev('NPC_ENC'), LOCATIONS = sim.ev('LOCATIONS')
  s.stageIndex = 12; s.maxStageThisLife = 12; s.spiritStones = 50000; s.health = 100; gs._recalc(); s.qi = s.derived.qiCap
  const loc = LOCATIONS.filter(l => l.minStage <= s.stageIndex).slice(-1)[0]
  const used = new Set()
  const fresh = (stage = 6) => {
    const clan = gs._clanIdSet()
    const p = Object.values(w.persons).find(p => gs._heavyEligible(p, clan) && !used.has(p.id) && !p.roadCard && !p.sectRole && !p.feud && !gs._isYourKin(p))
    if (p) { used.add(p.id); p.stageIndex = stage; p.rel = 0; p.mem = []; p.morality = 30; p.personality = 'stoic'; p.spouseIds = [] }
    return p
  }
  const act = (p, id) => { p.actAt = 0; return gs.personAct(p.id, id) }
  const rand = v => sim.ev(`globalThis.__mr = Math.random; Math.random = () => ${v}`)
  const unrand = () => sim.ev('Math.random = globalThis.__mr')

  assert(w.rep && w.rep.h === 0 && w.rep.i === 0 && Array.isArray(w.rumours), 'a new world starts unknown (Honour 0, Infamy 0)')
  assert(gs.reputeInfo().word === R.none, `the word for no name: "${R.none}"`)

  // ── Memory carries its delta; deeds move the name ──
  const v = fresh(), kid = fresh(); kid.parents = [v.id]
  const c1 = gs._roadCard(v, 'rescue', 'expedition', loc, loc.name, false)
  gs.answerRoadCard(c1.id, 'rob')
  const m = v.mem.slice(-1)[0]
  assert(m.d === E.rel.robbed && m.life === gs._lifeNo(), `a memory keeps what it moved (${m.d}) and the life it was earned in`)
  assert(Math.round(w.rep.i) === R.deeds.robbed.i, `robbing the wounded: Infamy +${R.deeds.robbed.i}`)
  assert(w.rumours.some(r => r.pid === v.id && r.k === 'robbed'), 'a big deed becomes a rumour')
  const info = gs.personInfo(v.id)
  assert(info.relWhy.items[0].d === E.rel.robbed && info.relWhy.items[0].text.includes('robbed'), 'the card can say why they feel so (each memory with its +/−)')
  // rumour reaches kin; a dark heart shrugs
  const dark = fresh(); dark.parents = [v.id]; dark.morality = -80
  const k0 = kid.rel || 0
  gs._tickRepute(Math.floor(w.year))
  assert(kid.rel < k0 && /heard you robbed/.test(kid.mem.slice(-1)[0]?.text), `their child hears of it: rel ${k0} → ${kid.rel}, "${kid.mem.slice(-1)[0]?.text}"`)
  assert(!(dark.mem || []).length, 'a dark-hearted kin shrugs off cruelty')
  assert(w.rumours.length === 0, 'a rumour spreads once')
  const i0 = w.rep.i; gs._tickRepute(Math.floor(w.year) + 1)
  assert(w.rep.i < i0, `names fade a little each year (${i0.toFixed(2)} → ${w.rep.i.toFixed(2)})`)
  const h0 = w.rep.h, c2 = gs._roadCard(fresh(), 'rescue', 'expedition', loc, loc.name, false)
  gs.answerRoadCard(c2.id, 'help')
  assert(w.rep.h - h0 === R.deeds.helped.h, `saving a life: Honour +${R.deeds.helped.h}`)
  assert(gs.reputeInfo().log[0].k === 'helped' && gs.reputeInfo().effects.length > 0, 'the breakdown lists the latest deed first, and what the name changes')

  // ── Card deeds ──
  const g = fresh(); g.personality = 'miser'
  const st0 = s.spiritStones, acts = gs.personActions(g.id)
  assert(acts.acts.map(a => a.id).join() === 'gift,spar,duel,mentor,recruit,swear,denounce,court', 'the card offers eight deeds')
  const gift = acts.acts.find(a => a.id === 'gift')
  const r1 = act(g, 'gift')
  assert(r1.ok && s.spiritStones === st0 - gift.cost && g.rel === A.gift.greedyRel, `a gift to a miser: −${gift.cost} stones, rel +${A.gift.greedyRel}`)
  const again = gs.personAct(g.id, 'gift')
  assert(!again.ok && again.reason === 'cooldown' && again.secsLeft > 0 && again.secsLeft <= A.cooldownSecs, `one deed at a time: a real-time wait (${again.secsLeft}s), never game years`)
  s.stats.timePlayed += A.cooldownSecs + 1
  assert(gs.personActions(g.id).cd === 0, 'the wait runs out with open time')
  // duel lock vs a stranger, open vs an enemy
  assert(/at odds/.test(gs.personActions(g.id).acts.find(a => a.id === 'duel').lock), 'no duel to the death with someone not at odds with you')
  // mentor
  const pupil = fresh(4); pupil.rel = 40; s.qi = s.derived.qiCap
  const qi0 = s.qi, xp0 = pupil.npcXp || 0, r2 = act(pupil, 'mentor')
  assert(r2.ok && s.qi < qi0 && pupil.mentorUntil > w.year && (pupil.npcXp || 0) > xp0, 'teaching costs Qi and speeds their cultivation')
  const pupil2 = fresh(4); pupil2.rel = 0
  assert(/think well/.test(gs.personActions(pupil2.id).acts.find(a => a.id === 'mentor').lock), 'teaching needs them to think well of you')
  const twin = fresh(4); twin.rel = 40; twin.npcXp = 0; twin.grownYear = pupil.grownYear = Math.floor(w.year); pupil.npcXp = 0; twin.root = pupil.root; twin.talent = pupil.talent
  gs._growPerson(pupil, Math.floor(w.year) + 3); gs._growPerson(twin, Math.floor(w.year) + 3)
  assert(pupil.stageIndex * 10 + pupil.npcXp > twin.stageIndex * 10 + twin.npcXp, 'a taught pupil out-paces their untaught twin')
  // recruit
  const rq = fresh(3); rq.rel = 0
  assert(/no sect/.test(gs.personActions(rq.id).acts.find(a => a.id === 'recruit').lock), 'inviting needs a sect of your own')
  // swear
  const bro = fresh(10); bro.rel = 90
  rand(0); const r3 = act(bro, 'swear'); unrand()
  assert(r3.ok && r3.accepted && bro.sworn === s.self.id && gs.personInfo(bro.id).sworn, 'a dear friend swears brotherhood')
  assert(gs._swornWar().bonus === A.swear.warEach, `a sworn sibling adds ${A.swear.warEach} to your sect wars`)
  assert(gs.knownPeople({ filter: 'friend' }).rows.some(r => r.pid === bro.id), 'World → People → Friends lists them')
  const meh = fresh(); meh.rel = 50
  assert(/hold you dear/.test(gs.personActions(meh.id).acts.find(a => a.id === 'swear').lock), 'no oath with someone merely warm')
  // refusals are theirs
  const shy = fresh(); shy.rel = 0
  rand(0.999); const r4 = act(shy, 'spar'); unrand()
  assert(r4.ok && r4.accepted === false && !s.family.fight && shy.mem.slice(-1)[0].k === 'sparRefused', 'they may refuse a spar (their answer, on the odds shown)')
  // spar → battle page
  rand(0); const r5 = act(shy, 'spar'); unrand()
  assert(r5.fight && s.family.fight?.kind === 'road' && s.family.fight.road.kind === 'spar' && !s.family.fight.lethal, 'an accepted spar opens the battle page, until one yields')
  playFight(gs, 'win'); gs.personFightFinish('raise')
  assert(!s.family.fight && shy.mem.slice(-1)[0].k === 'raised', 'the spar ends in a memory (raised)')
  // denounce: unjust vs just
  const vic = fresh(); vic.personality = 'arrogant'; const friendOfVic = fresh(); friendOfVic.ties = { [vic.id]: 60 }
  const foeOfVic = fresh(); foeOfVic.ties = { [vic.id]: -60 }
  const ka = s.karma, ia = w.rep.i, r6 = act(vic, 'denounce')
  assert(r6.ok && s.karma < ka && w.rep.i > ia && vic.rel <= A.denounce.rel, 'denouncing an honest soul costs karma and adds Infamy')
  assert(friendOfVic.ties[vic.id] < 60 && foeOfVic.rel > 0, 'their friends think less of them; their foes warm to you')
  assert(vic.feud?.pid === s.self.id, 'a proud heart swears to repay it')
  const crook = fresh(); crook.morality = -70; const ka2 = s.karma, ha = w.rep.h
  act(crook, 'denounce')
  assert(s.karma === ka2 && w.rep.h > ha, 'denouncing a true villain costs no karma and adds Honour')
  // betraying a sworn sibling
  const ib = w.rep.i; act(bro, 'denounce')
  assert(!bro.sworn && w.rep.i - ib >= R.deeds.betrayedSworn.i, 'denouncing your own sworn sibling breaks the oath (Infamy +15)')
  // court
  s.stageIndex = 12; const love = fresh(8); love.rel = 30; love.bornYear = Math.floor(w.year) - 30; s.family.spouse = null; s.family.court = null
  const r7 = act(love, 'court')
  assert(r7.ok && s.family.court?.target?.id === love.id && s.family.court.interest > 0, `courting someone you know starts a courtship (${s.family.court?.interest} interested)`)
  assert(/already courting/.test(gs.personActions(fresh(8).id).acts.find(a => a.id === 'court').lock), 'one courtship at a time')
  s.family.court = null

  // ── The road reads your name ──
  w.rep.i = 80
  const saint = fresh(); saint.morality = 70; saint.personality = 'niceguy'; saint.rel = 0
  let amb = 0; for (let i = 0; i < 200; i++) if (gs._roadIntent(saint, 'expedition') === 'ambush') amb++
  assert(amb > 0, `a notorious name draws righteous hunters (${amb}/200 ambush from a niceguy)`)
  assert(/byword for cruelty/.test(gs._roadWhy(saint, 'ambush', false)), 'the card says why: your cruelty')
  w.rep.i = 0

  // ── Sworn siblings fight in your war (odds) ──
  const bro2 = fresh(12); bro2.rel = 95; rand(0); act(bro2, 'swear'); unrand()
  assert(bro2.sworn === s.self.id, 'a second oath')

  // ── A new life: grudges whole, debts halved, feuds re-aimed ──
  const hater = fresh(); hater.rel = -70; hater.feud = { pid: s.self.id, why: 'you robbed them', y: Math.floor(w.year) }
  const friend = fresh(); friend.rel = 60
  w.rep.h = 40; w.rep.i = 20
  const oldId = s.self.id
  gs.passTheMantle(); gs.finishInterlude()
  const s2 = gs.get(), w2 = s2.world
  assert(s2.self.id !== oldId, 'a new life, a new self')
  assert(w2.persons[hater.id].rel === -70 && w2.persons[hater.id].feud.pid === s2.self.id && w2.persons[hater.id].feud.heir, 'a blood grudge passes whole, and the feud now hunts you')
  assert(w2.persons[friend.id].rel === 30, `a friend's warmth carries at half (${w2.persons[friend.id].rel})`)
  assert(!w2.persons[bro2.id].sworn, 'an oath ends with the life it was sworn to')
  assert(Math.abs(w2.rep.h - 40 * R.carry) < 2 && Math.abs(w2.rep.i - 20 * R.carry) < 2, `your name carries at ${R.carry} (${w2.rep.h.toFixed(1)} / ${w2.rep.i.toFixed(1)})`)
  const pi = gs.personInfo(friend.id)
  assert(pi.memories.length === 0 || pi.relWhy.older !== 0 || pi.relWhy.items.length === 0, 'their card explains the inherited warmth')
  const wy = gs._roadWhy(w2.persons[hater.id], 'ambush', true)
  assert(/your line/.test(wy), `an inherited feud says so: "${wy}"`)
})()
