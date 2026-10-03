// Scenario checks — scene-art.md (A7 / Phase 38A): the Sect Base scene descriptor, SceneRenderer.buildSectScene.
// Covers: the always-on compound (ground, hall, gate, dressing), a structure drawn iff it is built, the Sect Hall
// growing with its level, a damaged Defensive Array dimming its ward (never removing it), disciples/fame adding
// figures and banners, the signature tracking the picture, and a deterministic, total builder. No DOM — it calls the
// pure builder through the headless harness.
// Run: npm run checks · node scripts/sim/checks/scene.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 21 }); await sim.boot(0)
  const KIND = sim.ev('SECT_SCENE.slots.reduce((o, s) => (o[s.id] = s.kind, o), {})')   // id → kind
  const own = (o = {}) => ({ founded: true, name: 'Azure Peak', hallLevel: 1, buildings: {}, disciples: [], ...o })
  const state = (o, d) => ({ ownSect: own(o), derived: { sectFame: 0, arrayDamaged: false, ...d } })
  const build = s => sim.ev(`SceneRenderer.buildSectScene(${JSON.stringify(s)})`)
  const kinds = d => d.background.scenery.map(e => e.kind)
  const amb = d => d.background.ambience.map(e => e.kind)
  const find = (d, kind) => d.background.scenery.find(e => e.kind === kind)
  const ambOf = (d, kind) => d.background.ambience.find(e => e.kind === kind)

  // ── the bare compound ──
  const bare = build(state())
  for (const k of ['compoundGround', 'hall', 'gate', 'lanterns']) assert(kinds(bare).includes(k), `a bare compound draws ${k}`)
  assert(!kinds(bare).includes('pines'), 'no pines: the sect sits on a peak, only the night sky behind it')
  assert(amb(bare).includes('stars'), 'the black sky carries stars')
  for (const k of ['pagoda', 'pillHall', 'pen', 'yard', 'vault', 'ward']) assert(!kinds(bare).includes(k), `…and nothing of the ${k} before it is built`)
  assert(kinds(bare).filter(k => k === 'hall').length === 1 && kinds(bare).filter(k => k === 'gate').length === 1, 'the gate and the Sect Hall appear exactly once')

  // ── a structure is drawn iff it is built ──
  const all = { qi_library: true, pill_hall: true, beast_pen: true, training_ground: true, treasury: true, defensive_array: true }
  const full = build(state({ hallLevel: 4, buildings: all }))
  for (const id of Object.keys(all)) assert(kinds(full).includes(KIND[id]), `${id} built ⇒ its ${KIND[id]} is drawn`)

  // ── the hall grows with the Sect Hall level ──
  const h1 = find(build(state()), 'hall'), h4 = find(build(state({ hallLevel: 4 })), 'hall')
  assert(h1.level === 1 && h4.level === 4 && h4.scale > h1.scale, `the hall grows with its level (${h1.scale} → ${h4.scale})`)

  // ── the array: dimmed while damaged, never absent ──
  const wardOn = build(state({ buildings: { defensive_array: true } }))
  const wardDim = build(state({ buildings: { defensive_array: true } }, { arrayDamaged: true }))
  assert(!!find(wardOn, 'ward') && !find(wardOn, 'ward').dim, 'a raised array is bright')
  assert(!!find(wardDim, 'ward') && find(wardDim, 'ward').dim === true, 'a damaged array is dimmed, not removed')

  // ── disciples + fame ──
  assert(ambOf(build(state({ disciples: [{}, {}, {}] })), 'disciples')?.n === 3, 'three disciples ⇒ three figures')
  assert(!amb(bare).includes('disciples'), 'no disciples ⇒ no figures')
  assert(!amb(build(state({}, { sectFame: 30 }))).includes('banners'), 'fame under 40 raises no banner')
  assert(ambOf(build(state({}, { sectFame: 100 })), 'banners')?.n === 2, 'fame 100 raises two banners')
  assert(ambOf(build(state({}, { sectFame: 99999 })), 'banners')?.n === 6, 'banners are capped at six')
  assert(amb(build(state({ buildings: { pill_hall: true } }))).includes('smoke'), 'the Pill Hall smokes')
  assert(amb(build(state({ buildings: { beast_pen: true } }))).includes('beastPace'), 'the pen paces a beast')

  // ── signature + determinism + totality ──
  const s1 = build(state()).sig
  assert(s1 === build(state()).sig, 'an unchanged compound keeps its signature')
  assert(s1 !== build(state({ hallLevel: 2 })).sig, 'raising the Sect Hall changes the signature')
  assert(s1 !== build(state({ buildings: { treasury: true } })).sig, 'raising a hall changes the signature')
  assert(JSON.stringify(build(state())) === JSON.stringify(build(state())), 'the builder is deterministic (no Math.random)')
  const empty = build({ ownSect: null, derived: null })
  assert(!!empty.background && kinds(empty).includes('compoundGround'), 'a missing state still yields a usable scene (never throws)')

  // ── the real game state builds one too ──
  const live = sim.ev('SceneRenderer.buildSectScene(gameState.get())')
  assert(!!live.background && Array.isArray(live.background.scenery), 'a live game state builds a scene descriptor')
})()
