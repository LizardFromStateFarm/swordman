// Scenario checks — a bad father's hand (family.md → "A father's hand"; assets/data/family-events.js). Pins:
// who counts as a "bad father" (cruel style / cruel personality / his own trauma / a cold bond), that the beating
// only fires while you are young and with a bad father, that the -20 Health hit floors at 1 (never lethal), the
// scar at BEATING_SCAR_AT hits, the defiance memory, the grown-up reckoning gate (defiant + grown + outranking him),
// and the old-save migration (_ensureBeatingFields).
// Run: npm run checks · node scripts/sim/checks/family-beating.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs
  const s = gs.get(), f = s.family
  const BEAT_CHANCE = sim.ev('BEATING_CHANCE'), MAX_Y = sim.ev('BEATING_MAX_YEARS'), RECK_DEF = sim.ev('BEATING_RECKONING_DEFIANCE')
  const AWK = sim.ev('AWAKENING_AGE'), BEAT_HP = sim.ev('BEATING_EVENT')

  // Quiet the other family timers so only the beating can fire
  f.nextProposalYear = 1e9; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9; f.planning = 'none'
  s.upbringing = null

  // A father in the world (the head who raised you) → s.birth.headId
  const head = gs._genPerson({ family: 'Test', bornYear: Math.floor(s.world.year) - 40, stage: 8, role: 'kin' })
  s.world.persons[head.id] = head
  head.alive = true; head.parentingStyle = 'ruthless'; head.personality = 'stoic'; head.trauma = false
  s.birth = { headId: head.id, headStyle: 'ruthless', headBond: 20 }
  s.age = AWK + 2
  assert(gs._father()?.id === head.id, 'the father is the head who raised you (s.birth.headId)')
  assert(gs.isBadFather(), 'a ruthless parenting style counts as a bad father')

  // Any ONE of the four signals is enough
  head.parentingStyle = 'nurturing'; s.birth.headBond = 70
  assert(!gs.isBadFather(), 'a warm, kind head is not a bad father')
  head.personality = 'psycho'; assert(gs.isBadFather(), 'a cruel personality alone counts')
  head.personality = 'stoic'; head.trauma = true; assert(gs.isBadFather(), 'his own trauma alone counts')
  head.trauma = false; s.birth.headBond = 20; assert(gs.isBadFather(), 'a cold bond alone counts')
  s.birth.headBond = 70
  s.birth.headId = null; assert(!gs.isBadFather(), 'an orphan / first life has no father to fear')
  s.birth.headId = head.id

  // The roll: young + bad father only, and rare (≈ BEATING_CHANCE), never certain. (The sim runs in a vm with its
  // own RNG, so the only way to drive the roll is to reset nextCheck and call the tick.)
  const yr = Math.floor(s.world.year)
  const roll = n => { let fire = 0; for (let i = 0; i < n; i++) { s.abuse.nextCheck = yr; gs._tickFamily(); if (s.abuse.event) { fire++; s.abuse.event = null } } return fire }
  head.parentingStyle = 'ruthless'; s.birth.headBond = 20
  s.age = AWK + MAX_Y + 5
  assert(roll(400) === 0, `an adult (${AWK + MAX_Y + 5}) is never beaten — the window closes at ${AWK + MAX_Y}`)
  s.age = AWK + 2; head.parentingStyle = 'nurturing'; head.personality = 'stoic'; head.trauma = false; s.birth.headBond = 70
  assert(roll(400) === 0, 'a warm, kind father never beats you')
  head.parentingStyle = 'ruthless'; s.birth.headBond = 20
  const fires = roll(400)
  assert(fires > 0, `with a bad father and a young child the beatings happen (${fires}/400)`)
  assert(fires / 400 > 0.15 && fires / 400 < 0.45, `…and are rare, near BEATING_CHANCE (${(fires / 400).toFixed(2)} vs ${BEAT_CHANCE})`)

  let guard = 0
  while (!s.abuse.event && guard++ < 500) { s.abuse.nextCheck = yr; gs._tickFamily() }
  assert(!!s.abuse.event, 'a beating is waiting to be answered')
  assert(/ruthless|mood|drinking|stranger|tournament/i.test(gs.beatingWhy()), `the card says WHY (${gs.beatingWhy()})`)
  assert(gs.beatingInfo()?.choices.length === 3 && BEAT_HP.choices.length === 3, 'three answers: endure / run / strike back')

  // Endure: -20 Health, memory recorded
  s.health = 100
  gs.resolveBeating(0)
  assert(s.health === 80, `enduring costs 20 Health (100 → ${s.health})`)
  assert(s.abuse.hits === 1 && s.abuse.defiance === 1, 'the beating is remembered (hits 1, defiance 1)')

  // Never lethal: Health floors at 1 even when already badly hurt
  s.health = 10; s.abuse.event = { year: yr, headId: head.id }
  gs.resolveBeating(2)   // strike back: -20 → would reach -10
  assert(s.health === 1, `a childhood beating never kills (Health floored at ${s.health})`)
  assert(s.abuse.hits === 2 && s.self.trauma === true, `the second beating leaves a scar (trauma)`)
  assert(gs.beatingInfo() === null, 'answering clears the pending beating')

  // The grown-up reckoning: defiant + grown + outranking him
  assert(!gs.reckoningInfo(), 'not grown yet — no reckoning')
  s.age = 40; s.stageIndex = 4; head.stageIndex = 8; s.abuse.defiance = RECK_DEF
  assert(!gs.reckoningInfo(), 'still below him — no reckoning')
  s.stageIndex = 12
  assert(!!gs.reckoningInfo() && gs.reckoningInfo().headName === head.given, `grown and above him → the reckoning is available (${gs.reckoningInfo()?.headName})`)
  s.stageIndex = 12; const k0 = s.karma
  gs.resolveReckoning('forgive')
  assert(s.karma > k0 && s.abuse.avenged && !s.abuse.reckon, 'forgiving him raises karma and ends the beatings for good')
  assert(!gs.reckoningInfo(), 'a settled reckoning never returns')

  // ── The mirror: you may lay a hand on your own child (family-events.js) ─────────────────────
  {
    const st = gs.get(), yr2 = Math.floor(st.world.year)
    st.stageIndex = 5; st.health = 100
    const kid = { id: 'kid1', given: 'Bao', family: 'Test', alive: true, bond: 80, personality: 'stoic',
                  stageIndex: 12, bornYear: yr2 - 20, parents: [st.self.id], morality: 0 }
    const young = { id: 'kid0', given: 'Tiny', alive: true, bond: 80, personality: 'lazy', stageIndex: 0, bornYear: yr2 - 2, parents: [st.self.id] }
    st.family.children.push(kid, young)

    assert(!gs.abuseChildPreview(young.id).ok && gs.abuseChildPreview(young.id).reason === 'young', 'a child under 4 cannot be struck')
    const pv = gs.abuseChildPreview(kid.id)
    assert(pv.ok && pv.bond === sim.ev('CHILD_ABUSE_BOND').stoic, `the preview reads the CHILD's own reaction (stoic ${pv.bond})`)

    const k0 = st.karma, b0 = kid.bond, r1 = gs.abuseChild(kid.id)
    assert(r1.ok && kid.bond === b0 + r1.delta && st.karma === k0 - Math.abs(sim.ev('CHILD_ABUSE_KARMA')), `striking costs bond (${b0} → ${kid.bond}) and karma (${k0} → ${st.karma})`)
    assert(!gs.abuseChildPreview(kid.id).ok, 'the same child cannot be struck again immediately (a cooldown)')

    kid.cd.harsh = 0; gs.abuseChild(kid.id)
    assert(kid.abuse.hits === 2 && kid.trauma === true, 'a second beating scars the child (trauma → the heir Bloodline term)')
    kid.cd.harsh = 0; gs.abuseChild(kid.id)
    assert(kid.abuse.hits === 3 && kid.abuse.grudge > 0, `the beatings accumulate (hits ${kid.abuse.hits}, grudge ${kid.abuse.grudge})`)

    assert(gs.childReckoningInfo()?.id === kid.id, 'a grown, beaten child comes back for you')
    const bBefore = kid.bond
    gs.resolveChildReckoning(kid.id, 'accept')
    assert(st.health === 80, `letting them strike costs 20 Health (100 → ${st.health}) and never kills`)
    assert(kid.bond === bBefore + 15 && kid.abuse.grudge === 0, 'it eases something between you')
    assert(!gs.childReckoningInfo(), 'a settled child reckoning never returns')
  }

  // Migration: an old save has no abuse record
  const save = JSON.parse(JSON.stringify(s)); delete save.abuse
  gs._s = save; gs._ensureBeatingFields()
  assert(gs.get().abuse && gs.get().abuse.hits === 0 && gs.get().abuse.avenged === false, 'an old save gains an empty abuse record')
})()
