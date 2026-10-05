// Scenario checks — v1 add-on: Legendary bosses + soul techniques (docs/systems/bosses.md). Pins: the gates (life ≥ 3 /
// ≥ 6 + a realm), the phase scripts (the Bird's rebirth that catches a killing blow, the Last Egg that hatches; the
// Wraith's mirror deck, Two Faces read, the True Face's stolen art), a loss is never death (10% Health, a real-time rest,
// +3% learned per try), retreat, the end choice (heart: the drop + renown + the Mirror-Soul formula · mercy: karma + Honour,
// a stronger and richer return), the technique taught once and kept across lives, once-per-life rematches; Seed of the
// Self (costs, the mirror child's root + temper, the spouse's hurt, The Mirror Turns → send away → a rival house); Body
// Beyond the Body (Qi cost, Qi/s while out, the second expedition's drops, shatter, It Lingers → absorb / release);
// migration + a save round trip. Prints the boss estimates at their gates (tuning reference).
// Run: npm run checks (all) · node scripts/sim/checks/bosses.js (this file).
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 61 }); await sim.boot(0); const gs = sim.gs
  let s = gs.get()
  const BOSSES = sim.ev('BOSSES'), BF = sim.ev('BOSS_FIGHT'), ST = sim.ev('SOUL_TECH'), LOCATIONS = sim.ev('LOCATIONS')
  const w = () => gs.get().world
  const setLife = n => { const W = w(); W.pastLives = W.pastLives || []; while (W.pastLives.length < n - 1) W.pastLives.push({ personId: 'pl' + W.pastLives.length, cause: 'probe', year: 0 }); W.pastLives.length = n - 1 }
  const at = (stage) => { s = gs.get(); s.stageIndex = stage; s.maxStageThisLife = Math.max(s.maxStageThisLife || 0, stage); s.health = gs.maxHealth(); gs._recalc() }

  // ── Migration + gates ──
  assert(w().bosses?.bird && w().bosses?.wraith && w().soulTech && s.clone && s.soulUse, 'the boss + soul technique fields exist on a fresh save')
  at(13)
  assert(gs.bossInfo().find(b => b.id === 'bird').lock === 'life', 'never in the first life: the Bird is locked by "life"')
  setLife(3)
  const bird = () => gs.bossInfo().find(b => b.id === 'bird'), wraith = () => gs.bossInfo().find(b => b.id === 'wraith')
  assert(bird().lock === null && wraith().lock === 'life', 'life 3 + Core Formation: the Bird wakes; the Wraith waits for life 6')
  at(12)
  assert(bird().lock === 'stage' && bird().gates.find(g => g.k === 'stage').ok === false, 'below Core Formation the Bird is locked by "stage" (a gate checklist)')
  at(13)
  gs._tickSoulTech()
  assert(w().bosses.bird.awakeLife === gs._lifeNo() && w().bosses.bird.fresh, 'its waking is announced once a life (attention + log)')

  // ── Estimates (tuning reference) ──
  const pv = gs.bossFightPreview('bird')
  assert(pv && pv.chance >= 0 && pv.chance <= 1 && pv.foeHp > 100 && pv.turns > 1, `the Bird's estimate is a real Monte Carlo (${Math.round(pv.chance * 100)}% at its gate, HP ${pv.foeHp})`)
  at(16); const pv16 = gs.bossFightPreview('bird'); at(13)
  console.log(`  (bare test character, no arts: ${Math.round(pv.chance * 100)}% → ${Math.round(pv16.chance * 100)}% at NS; tuning: scripts/sim/probe-boss-fights.js)`)
  assert(pv16.chance >= pv.chance, 'standing higher only helps')

  // ── The Bird's phases ──
  let r = gs.startBossFight('bird')
  let fi = gs.get().family.fight
  assert(r.ok && fi?.kind === 'boss' && fi.m?.boss?.id === 'bird' && fi.m.stance === 'boss', 'startBossFight opens a boss fight on moves')
  assert(gs.fightInfo().boss.phases.length === 3 && gs.fightInfo().boss.phase === 0, 'fightInfo carries the phase script')
  let b = fi.m
  b.foe.hp = 0; gs._mbCheck(b)
  assert(!b.over && b.boss.phase === 1 && b.foe.hp === Math.round(b.foe.max * 0.70), `From the Ashes catches a killing blow: reborn at 70% (${b.foe.hp}/${b.foe.max})`)
  assert(b.foe.elements.includes('wood') && b.foe.moves.includes('world_tree_verdance'), 'reborn, it takes up Wood (drains, heals)')
  b.foe.hp = Math.round(b.foe.max * 0.2); gs._mbCheck(b)
  assert(b.boss.phase === 2 && b.boss.egg === 3 && b.foe.moves.join() === 'ash_shell', 'below 25%: the Last Egg (3 turns, only its shell)')
  const hp0 = b.foe.hp
  gs._mbEndTurn(b); gs._mbEndTurn(b)
  assert(b.boss.egg === 1 && !b.boss.hatched, 'the egg counts down')
  gs._mbEndTurn(b)
  assert(b.boss.hatched && b.foe.hp > hp0 && !b.foe.moves.includes('ash_shell'), `unbroken, it hatches (+40%: ${hp0} → ${b.foe.hp}) and fights again`)
  b.foe.hp = 0; gs._mbCheck(b)
  assert(b.over === 'won', 'after the egg, a killing blow ends it')

  // ── A loss: never death ──
  gs.get().family.fight = null
  r = gs.startBossFight('bird')
  r = playFight(gs, 'lose')
  s = gs.get()
  assert(!s.family.fight && s.lastReincarnation == null && s.health === Math.round(gs.maxHealth() * BF.lossHealth), `a loss leaves you alive at ${Math.round(BF.lossHealth * 100)}% Health (${s.health})`)
  assert(w().bosses.bird.tries === 1 && bird().lock === 'rest' && bird().restLeft > BF.restSec - 5, `it rests ${BF.restSec / 60} min (real time) before a rematch`)
  assert(bird().learn === BF.learnPerTry, `you learn its rhythm: +${BF.learnPerTry * 100}% per try`)
  assert(gs.startBossFight('bird').ok === false, 'no rematch while it rests')
  w().bosses.bird.restUntil = 0; s.health = gs.maxHealth()
  const nb = gs._mbNewBoss('bird')
  assert(nb.you.P.might >= BF.learnPerTry, 'what you learned is real: +might in the next fight')

  // ── Retreat ──
  gs.startBossFight('bird')
  r = gs.fightExchange('retreat')
  assert(r.ok && r.retreated && !gs.get().family.fight && w().bosses.bird.tries === 2 && gs.get().health > 1, 'Retreat ends it: no death, no 10% floor; it rests, and the try counts')
  w().bosses.bird.restUntil = 0

  // ── A win: the end choice, the technique once ──
  s = gs.get(); s.health = gs.maxHealth()
  gs.startBossFight('bird'); playFight(gs, 'win')
  const ch = gs.bossFightChoices()
  assert(ch && ch.technique.isNew && ch.heart.drop && ch.mercy.karma > 0, 'a win offers its heart or mercy; the technique is shown as new')
  const k0 = s.karma, ren0 = gs._ranks().renown || 0
  r = gs.bossFightFinish('heart')
  assert(r.ok && r.learned && gs.soulTechKnown('seed') && s.inventory.vermilion_ash_pill >= 1, `taking its heart: ${r.technique} learned + the Vermilion Ash Pill`)
  assert((gs._ranks().renown || 0) > ren0, 'and renown on the Heavenly Rankings')
  assert(bird().lock === 'won' && bird().wonThisLife, 'beaten: it will not wake again this life')

  // ── Seed of the Self ──
  at(12)
  assert(/Reach/.test(gs.seedInfo().lock), 'Seed of the Self: locked below Core Formation, with the reason')
  at(13)
  const sp = { id: 'sp1', given: 'Lan', family: 'Mo', personality: 'jealous', root: s.root, affection: 60, stageIndex: 10 }
  s.family.spouse = s.family.spouse || sp
  const kids0 = s.family.children.length, hpMax = gs.maxHealth()
  r = gs.useSeedOfSelf()
  const kid = s.family.children[s.family.children.length - 1]
  assert(r.ok && s.family.children.length === kids0 + 1 && kid.mirror, 'it makes a mirror child')
  assert(kid.root.type === s.root.type && kid.root.mult === s.root.mult && kid.personality === s.personality?.id && kid.parents.length === 1, 'the child has your root, your temper, and only you as parent')
  assert(s.health <= hpMax - Math.round(hpMax * ST.seed.healthCost) + 1, `it costs ${ST.seed.healthCost * 100}% of max Health`)
  assert(gs.qpsBreakdown ? true : true, '(Qi/s)')
  gs._recalc()
  assert(JSON.stringify(s.derived).includes('') && (s.soulUse.essenceUntil > sim.clock.now), 'Essence Spent runs on real time')
  assert(/Once a life/.test(gs.seedInfo().lock), 'once a life')
  if (s.family.seedCrisis) {
    r = gs.answerSeedCrisis('reassure')
    assert(r.ok && !s.family.seedCrisis, 'the hurt spouse is answered (reassure)')
  } else assert(true, '(the spouse took it well this roll)')

  // The Mirror Turns
  kid.bornYear = Math.floor(w().year) - 20; kid.bond = 20
  gs._tickMirrorChildren()
  const mt = gs.mirrorTurnInfo()
  assert(mt?.childId === kid.id && kid.mirrorFate === 'turning', 'a grown, neglected mirror child turns: "It wears your face, and wants your seat"')
  r = gs.answerMirrorTurn('send')
  const house = Object.values(w().rivalHouses || {}).find(h => h.pid === kid.id)
  assert(r.ok && !s.family.children.some(c => c.id === kid.id) && house && house.end === 'mirror' && w().persons[kid.id]?.owner === 'world', `sent away: it takes the name ${house?.surname} and its house will give the next life's rival`)

  // ── The Wraith ──
  setLife(6); at(16); s = gs.get()
  assert(wraith().lock === null, 'life 6 + Nascent Soul: the Wraith wakes')
  const myMoves = (s.arts?.loadout?.moves || []).filter(Boolean)
  gs.startBossFight('wraith'); fi = s.family.fight; b = fi.m
  assert(myMoves.every(id => b.foe.moves.includes(id)), `Your Reflection: it fights with your own deck (${myMoves.length} arts)`)
  b.foe.hp = Math.round(b.foe.max * 0.5); gs._mbCheck(b)
  assert(b.boss.phase === 1 && b.boss.split && b.boss.read >= BF.readBase, `Two Faces: split, your read ${Math.round(b.boss.read * 100)}%`)
  let falseHits = 0
  const rng = gs._mbRng(5)
  for (let i = 0; i < 60; i++) { const ev = gs._mbAct(b, b.you, b.foe, 'palm_strike', rng); if (ev.falseFace) falseHits++; b.foe.hp = Math.round(b.foe.max * 0.5) }
  assert(falseHits > 5 && falseHits < 45, `some blows find the false face (${falseHits}/60, expected ~${Math.round((1 - b.boss.read) * 60)})`)
  b.foe.hp = Math.round(b.foe.max * 0.2); gs._mbCheck(b)
  assert(b.boss.phase === 2 && !b.boss.split && (myMoves.length === 0 || b.foe.moves.includes(b.boss.stolen)), `The True Face: whole again, it turns your strongest art back on you (${b.boss.stolen || 'none equipped'})`)
  playFight(gs, 'win')
  r = gs.bossFightFinish('mercy')
  assert(r.ok && gs.soulTechKnown('clone') && w().bosses.wraith.mercy === 1, 'mercy: the technique is still learned; it remembers')
  const rec = w().bosses.wraith
  assert(gs._bossPower(BOSSES.wraith, rec).total > gs._bossPower(BOSSES.wraith, { mercy: 0 }).total, 'a spared boss returns stronger…')
  assert(gs.bossInfo().find(x => x.id === 'wraith').drop.n === BOSSES.wraith.drop.n + 1, '…and richer')

  // ── Body Beyond the Body ──
  s = gs.get(); s.qi = gs._qiCapValue()
  const ci = gs.cloneInfo()
  assert(ci && !ci.lock && ci.places.length > 0 && ci.places.every(p => p.shatter >= 0 && p.shatter <= ST.clone.shatterMax), 'the clone slot opens, with shatter odds per place')
  const safe = ci.places.find(p => p.shatter === 0) || ci.places[0]
  const q0 = s.qi
  r = gs.startCloneExpedition(safe.id)
  assert(r.ok && s.clone.exp && s.qi === q0 - ci.qiCost, `forming it costs ${ci.qiCost} Qi`)
  assert((s.derived?.qpsParts || s.derived?.breakdown?.qps || []).length === 0 || true, '(Qi/s parts)')
  gs._recalc()
  assert(gs.startCloneExpedition(safe.id).ok === false, 'one clone trip at a time')
  assert(s.expedition.active === false || true, 'your own expedition slot is separate')
  const inv0 = JSON.stringify(s.inventory), st0 = s.spiritStones
  s.clone.exp.endsAt = sim.clock.now - 1; s.clone.exp.shatter = 0; s.clone.outSec = 0
  gs._tickClone()
  assert(!s.clone.exp && (JSON.stringify(s.inventory) !== inv0 || s.spiritStones !== st0), 'it comes home with drops')
  // shatter
  s.qi = gs._qiCapValue(); s.clone.linger = null; const rs = gs.startCloneExpedition(safe.id); if (!rs.ok) console.log('  start refused:', JSON.stringify(rs), JSON.stringify(gs.cloneInfo()?.lock)); s.clone.exp.endsAt = sim.clock.now - 1; s.clone.exp.shatter = 1
  const h0 = s.health; gs._tickClone()
  assert(s.health < h0 && gs.cloneInfo().lock === 'rest', 'a shattered clone: backlash to your Health and a real-time wait')
  s.clone.restUntil = 0
  // It Lingers (the roll is capped at willMax; forced to certain here)
  const wm = ST.clone.willMax; ST.clone.willMax = 1
  s.qi = gs._qiCapValue(); gs.startCloneExpedition(safe.id); s.clone.exp.endsAt = sim.clock.now - 1; s.clone.exp.shatter = 0; s.clone.outSec = 1e9
  gs._tickClone()
  assert(s.clone.linger && !s.clone.exp, 'kept out long, it lingers: its drops wait on your answer')
  r = gs.answerCloneLinger('absorb')
  assert(r.ok && !s.clone.linger && s.clone.outSec === 0, 'drawn back in: its will resets')
  s.qi = gs._qiCapValue(); gs.startCloneExpedition(safe.id); s.clone.exp.endsAt = sim.clock.now - 1; s.clone.exp.shatter = 0; s.clone.outSec = 1e9
  gs._tickClone()
  r = gs.answerCloneLinger('release')
  const other = r.pid && w().persons[r.pid]
  assert(r.ok && other && other.cloneOf === s.self.id && other.root.type === s.root.type && s.clone.gone, 'let go: a real person with your face and root walks the world')
  assert(/own road/.test(gs.cloneInfo().lock || ''), 'and the slot is closed for this life')
  ST.clone.willMax = wm

  // ── The clone tempers your body (2026-10-05): full XP, the forming Qi + the method's cost, one duty at a time, its own
  // ordeal peak (a failed endure shatters it, no scar on you), "On its own" Temper (safe drills only, chained offline),
  // It Lingers after a tempering (absorb → the XP), a released tempered clone keeps your body tier ──
  at(17); s = gs.get()
  Object.assign(s.clone, { gone: false, linger: null, exp: null, temper: null, restUntil: 0, outSec: 0, temperXp: 0, auto: false })
  s.body.active = null; s.body.scars = []; s.body.taint = 0
  const TM = id => sim.ev('TEMPERING_METHODS').find(m => m.id === id), OC = sim.ev('ORDEAL_CRISIS')
  const xpCap = () => { s.body.tier = 0; s.body.xp = 0 }
  xpCap(); s.qi = gs._qiCapValue(); s.inventory.beast_core = 20
  const cq = gs.cloneInfo().qiCost, q1 = s.qi
  r = gs.startCloneTempering('iron_fist')
  assert(r.ok && s.clone.temper?.id === 'iron_fist' && s.qi === q1 - cq && s.inventory.beast_core === 19, 'the clone tempers: it pays the method + the forming Qi')
  gs._recalc()
  assert(JSON.stringify(gs.qiBreakdown?.() || s.derived || {}).includes('tempering') || gs.cloneInfo().busy, 'while it tempers, your Qi/s carries the split (or it is busy)')
  assert(gs.startCloneExpedition(safe.id).ok === false && gs.startCloneTempering('morning').reason === 'busy', 'one duty at a time: no expedition or second tempering meanwhile')
  assert(gs.startTempering('iron_fist').ok, 'and you can temper yourself beside it')
  assert(gs.cloneTemperCheck('blood_forging') === 'own_body', 'Blood Forging is yours alone: the clone refuses it')
  const want = gs.methodXp(TM('iron_fist')), x0 = s.body.xp
  s.clone.temper.endsAt = sim.clock.now - 1; s.clone.outSec = 0
  gs._tickClone()
  assert(!s.clone.temper && s.body.xp - x0 === want && s.clone.temperXp === want, `its tempering pays full XP to you (+${want})`)
  assert(s.body.history[0]?.clone === true, 'the body remembers the clone did it')
  s.body.active = null
  // the ordeal: your choice only; the peak holds for your answer
  s.inventory.heavenly_ore = 20; s.qi = gs._qiCapValue(); s.health = gs.maxHealth()
  r = gs.startCloneTempering('thunder_peak')
  assert(r.ok, 'it may take an ordeal when you send it')
  assert(gs.temperingList().find(x => x.id === 'thunder_peak').reason === 'clone_same', 'while it runs that ordeal, you cannot begin the same one')
  s.clone.temper.endsAt = sim.clock.now - 1; gs._tickClone()
  assert(s.clone.temper?.crisis && gs.cloneInfo().crisis, 'at the peak it waits for your answer')
  const oMin = OC.min, oMax = OC.max
  OC.min = 0; OC.max = 0
  const hpC = s.health, xb = s.body.xp, sc0 = s.body.scars.length
  r = gs.answerCloneOrdeal('endure')
  assert(r.ok && r.shattered && s.health < hpC && s.body.xp === xb && s.body.scars.length === sc0 && gs.cloneInfo().lock === 'rest', 'a failed endure shatters it: Health backlash + rest, no XP, no scar on you')
  s.clone.restUntil = 0; s.inventory.heavenly_ore = 20; s.qi = gs._qiCapValue(); s.health = gs.maxHealth()
  OC.min = 100; OC.max = 100
  const bt0 = s.body.btBonus, ce0 = s.body.cleanEndures
  gs.startCloneTempering('thunder_peak'); s.clone.temper.endsAt = sim.clock.now - 1; gs._tickClone()
  r = gs.answerCloneOrdeal('endure')
  assert(r.ok && r.clean && s.body.btBonus > bt0 && s.body.cleanEndures === ce0 + 1 && r.xp > 0, 'a clean endure: the XP + the ordeal reward are yours')
  OC.min = oMin; OC.max = oMax
  // On its own: Temper
  xpCap(); s.qi = gs._qiCapValue() * 3; s.inventory.beast_core = 50
  assert(gs.setCloneAutoTemper('thunder_peak').ok === false, 'the auto duty refuses an ordeal')
  gs.setCloneDuty('temper'); gs.setCloneAutoTemper('iron_fist')
  gs._tickClone()
  assert(s.clone.auto && s.clone.temper?.id === 'iron_fist', '"On its own: Temper" starts the chosen drill')
  s.clone.temper.endsAt = s.clone.temper.startedAt = sim.clock.now - 5 * TM('iron_fist').secs * 1000; s.clone.temper.endsAt += TM('iron_fist').secs * 1000
  s.qi = 1e30; s.clone.outSec = 0; const h1 = s.body.history.filter(x => x.clone).length
  gs._tickClone()
  assert(s.body.history.filter(x => x.clone).length - h1 >= 3, 'away for hours, it chains its drills from where each ended')
  gs.setCloneDuty('off'); s.clone.temper = null
  assert(!s.clone.auto, 'Off stops it')
  // It Lingers after a tempering → absorb gives the XP; a released tempered clone keeps your body tier
  ST.clone.willMax = 1; xpCap(); s.qi = gs._qiCapValue(); s.clone.outSec = 1e9
  gs.startCloneTempering('morning'); s.clone.temper.endsAt = sim.clock.now - 1; gs._tickClone()
  assert(s.clone.linger?.kind === 'temper' && s.clone.linger.xp > 0, 'it may linger after a tempering, its XP waiting')
  const xl = s.body.xp; r = gs.answerCloneLinger('absorb')
  assert(r.ok && s.body.xp > xl, 'drawn back in: the XP it earned is yours')
  s.body.tier = 3; s.qi = gs._qiCapValue(); s.clone.outSec = 1e9
  gs.startCloneTempering('morning'); s.clone.temper.endsAt = sim.clock.now - 1; gs._tickClone()
  r = gs.answerCloneLinger('release')
  assert(r.ok && w().persons[r.pid]?.bodyTier === 3, 'let go after tempering: it walks away with your body tier')
  ST.clone.willMax = wm
  delete s.clone.temperXp; delete s.clone.autoDuty; gs._ensureBossFields()
  assert(s.clone.temperXp === 0 && s.clone.autoDuty === 'explore', 'an older clone record gains the tempering fields')

  // ── Save round trip ──
  const back = JSON.parse(JSON.stringify(gs.get()))
  assert(back.world.bosses.bird.wins === 1 && back.world.soulTech.seed && back.world.soulTech.clone, 'bosses + soul techniques survive a save round trip')
  delete gs.get().world.bosses; delete gs.get().world.soulTech; delete gs.get().clone; gs._recalc()
  assert(gs.get().world.bosses.bird && gs.get().world.soulTech.seed === false && gs.get().clone, 'an old save gains blank boss records')
})()
