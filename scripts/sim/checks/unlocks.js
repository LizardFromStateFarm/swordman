// Scenario checks — Phase 50 progressive disclosure (docs/systems/unlocks.md).
// Pins the opening (Explore + Body only), the unlock thresholds, existing-state re-opening (a sect / a
// family always opens its gate for an old save), the group rollup, and monotonic growth.
// Run: npm run checks (all) · node scripts/sim/checks/unlocks.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0)
  const s = sim.gs.get()
  const avail = () => new Set(sim.ev('availableViews(gameState.get())'))
  const setStage = n => { s.stageIndex = n; s.awakened = n >= 1 }
  const has = (set, v) => set.has(v)
  const ex = (set, v) => !set.has(v)

  // ── The mortal opening: exactly Explore + Body ──
  setStage(0)
  let a = avail()
  assert(a.size === 2 && has(a, 'explore') && has(a, 'physique'), 'mortal: only Explore + Body are offered')
  assert(ex(a, 'stats') && ex(a, 'pack') && ex(a, 'beasts'), 'mortal: the rest of Path/Roam/Pack is closed')
  const lk = sim.ev('lockedGroups(gameState.get())')
  assert(lk.some(g => g.group === 'kin') && lk.some(g => g.group === 'sect') && lk.some(g => g.group === 'pack') && lk.some(g => g.group === 'log'), 'mortal: Kin/Sect/Pack/World report as locked')
  assert(!lk.some(g => g.group === 'cultivate' || g.group === 'adventure'), 'mortal: Path and Roam stay open (Body / Explore)')
  assert(lk.every(g => typeof g.reason === 'string' && g.reason.length), 'every locked group carries a reason')

  // ── Awakening opens the core verbs ──
  setStage(1)
  a = avail()
  for (const v of ['stats', 'techniques', 'pack', 'events', 'banter', 'beasts']) assert(has(a, v), `awakened: ${v} is offered`)
  for (const v of ['arts', 'hunt', 'sect', 'craft', 'world', 'family']) assert(ex(a, v), `awakened: ${v} still closed`)

  // ── The staged schedule ──
  const gates = {
    2: ['arts', 'hunt', 'sect', 'sect-missions', 'sect-library', 'arena'],
    3: ['bestiary', 'craft'],
    4: ['world', 'people'],
    5: ['chronicle', 'class'],
    6: ['rankings'],
    7: ['rival'],
    10: ['family', 'tree', 'clan', 'hall'],
  }
  for (const [n, views] of Object.entries(gates)) {
    setStage(+n)
    a = avail()
    for (const v of views) assert(has(a, v), `stage ${n}: ${v} is offered`)
  }

  // ── Monotonic: a later stage never withdraws an earlier view ──
  let prev = null
  for (let n = 0; n <= 12; n++) {
    setStage(n)
    a = avail()
    if (prev) assert([...prev].every(v => a.has(v)), `stage ${n} keeps every view stage ${n - 1} offered`)
    prev = a
  }

  // ── Existing state re-opens a gate (old saves / scripted play) ──
  setStage(1)
  s.family.spouse = { id: 'p_fam', given: 'Lan' }
  a = avail()
  for (const v of ['family', 'tree', 'clan', 'hall']) assert(has(a, v), `a spouse at stage 1 opens ${v}`)
  s.family.spouse = null
  setStage(1)
  s.sect = { id: 'sect_herb' }
  a = avail()
  for (const v of ['sect-halls', 'sect-base', 'sect-disciples', 'sect-war']) assert(has(a, v), `being in a sect at stage 1 opens ${v}`)

  // ── Every declared view has a rule and a reason ──
  const views = sim.ev('UNLOCK_VIEWS.map(v => v.view)')
  for (const v of views) {
    assert(sim.ev(`!!(UNLOCK_RULES[${JSON.stringify(v)}])`), `${v} has an unlock rule`)
    assert(sim.ev(`unlockReason(${JSON.stringify(v)}).length > 0`), `${v} has a reason text`)
  }
  assert(views.length === sim.ev('Object.keys(UNLOCK_RULES).length'), 'the view table and the rule table agree')
})()
