// Scenario checks — docs/systems/crafting.md → "Phase 44" (healing pills + discovery-gated recipes).
// The three basic healing formulas are known from the start; a `hidden: true` recipe is locked until it is found
// (a road encounter in Roam → Explore, or an Arena ring champion) — it cannot be crafted or auto-crafted before then.
// Healing pills restore Health / Realm Integrity on use (clamped at 100) and are never queued for a breakthrough.
// Migration: an old save with no s.recipes gains exactly the non-hidden formulas.
// Run: npm run checks · node scripts/sim/checks/recipes.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 7 }); await sim.boot(0)
  const gs = sim.gs, s = gs.get()
  const RECIPES = sim.ev('RECIPES'), ITEMS = sim.ev('ITEMS'), DISC = sim.ev('RECIPE_DISCOVERY')

  // ── the guaranteed healing formulas are known from the start ──
  for (const id of ['recipe_pill_mending', 'recipe_pill_blood_nourish', 'recipe_pill_spirit_stabilize'])
    assert(gs.recipeKnown(id), `known from the start: ${id}`)
  for (const id of ['recipe_weapon_spirit_sword', 'recipe_pill_qi_refining'])
    assert(gs.recipeKnown(id), `an existing recipe stays known: ${id}`)

  // ── hidden formulas are locked at the start ──
  const hidden = RECIPES.filter(r => r.hidden).map(r => r.id)
  assert(hidden.length === 10, `10 discovery-gated formulas (${hidden.length})`)
  assert(hidden.every(id => !gs.recipeKnown(id)), 'no hidden formula is known before it is found')

  // every hidden recipe has a finder, and every finder id is a real hidden recipe
  const sourced = [...DISC.encounter, ...Object.values(DISC.arena)]
  assert(sourced.length === hidden.length && sourced.every(id => hidden.includes(id)), 'every hidden formula is reachable (encounter or arena)')
  assert(gs.recipeSource(DISC.arena.heaven) === 'arena' && gs.recipeSource(DISC.encounter[0]) === 'encounter', 'recipeSource names where a formula comes from')

  // ── a locked formula can't be crafted / auto-crafted, even with the materials ──
  const locked = DISC.arena.heaven
  for (const ing of RECIPES.find(r => r.id === locked).ingredients) s.inventory[ing.itemId] = (s.inventory[ing.itemId] || 0) + ing.qty
  assert(gs.craftItem(locked).reason === 'locked', 'a locked formula cannot be crafted')
  assert(gs.setAutoCraftRecipe(locked, true).reason === 'locked', 'a locked formula cannot be auto-crafted')

  // ── learning it (as the Arena champion would) unlocks crafting ──
  assert(gs._learnRecipe(locked, 'arena') === true && gs.recipeKnown(locked), 'learning a formula unlocks it')
  assert(gs._learnRecipe(locked, 'arena') === false, 'learning the same formula again is a no-op')
  const productId = RECIPES.find(x => x.id === locked).productId
  const cr = gs.craftItem(locked)
  assert(cr.ok && s.inventory[productId] === 1, 'the unlocked formula now crafts')
  assert(gs.setAutoCraftRecipe(locked, true).ok, 'the unlocked formula can be auto-crafted')

  // ── healing pills: use restores, clamps at 100, is not a BT pill ──
  s.health = 40; s.realmIntegrity = 70
  s.inventory.pill_blood_nourish = 2
  let h = gs.useHealPill('pill_blood_nourish')
  assert(h.ok && s.health === 100 && h.healed === 60 && s.inventory.pill_blood_nourish === 1, 'Blood-Nourishing Pill: 40 → 100, one copy left')
  s.health = 90; s.realmIntegrity = 200
  assert(gs.useHealPill('pill_blood_nourish').ok && s.health === 100 && s.realmIntegrity === 100, 'a heal clamps at 100')
  assert(!('pill_blood_nourish' in s.inventory), 'the last copy is consumed')
  s.inventory.pill_spirit_stabilize = 1; s.realmIntegrity = 20
  h = gs.useHealPill('pill_spirit_stabilize')
  assert(h.ok && h.integrityHealed === 45 && s.realmIntegrity === 65, 'Spirit-Settling Pill: +45 Integrity')
  s.inventory.pill_nine_turn = 1; s.health = 10; s.realmIntegrity = 15
  h = gs.useHealPill('pill_nine_turn')
  assert(h.ok && s.health === 100 && s.realmIntegrity === 100, 'Nine-Turn Pill fills Health and Integrity')
  assert(gs.useHealPill('pill_qi_refining').reason === 'not_heal', 'useHealPill refuses a breakthrough pill')
  s.inventory.pill_mending = 1; s.inventory.pill_qi_refining = 1
  assert(gs.useHealPill('pill_mending').reason === 'full' && s.inventory.pill_mending === 1, 'a healing pill is refused when nothing is wounded (no silent waste)')
  assert(gs.setActivePill('pill_mending').reason === 'not_bt_pill', 'a healing pill cannot be queued for a breakthrough')
  assert(gs.setActivePill('pill_qi_refining').ok, 'a breakthrough pill still queues')

  // ── the road encounter: help → learn, rob → stones + karma ──
  s.family.encounters.push({ kind: 'recipe', recipeId: DISC.encounter[0], person: { given: 'Test', family: 'Qi', stageIndex: 1 }, place: 'Mortal Forest', text: 'waits' })
  const k0 = s.karma, st0 = s.spiritStones
  const rr = gs.robEncounterRecipe(s.family.encounters.length - 1)
  assert(rr.ok && s.spiritStones === st0 + DISC.robStones && s.karma === Math.max(0, k0 + DISC.robKarma), `robbing pays ${DISC.robStones} stones, ${DISC.robKarma} karma`)
  assert(!s.family.encounters.some(e => e.kind === 'recipe'), 'robbing consumes the encounter')
  const second = DISC.encounter[1]
  s.family.encounters.push({ kind: 'recipe', recipeId: second, person: { given: 'Test', family: 'Qi', stageIndex: 1 }, place: 'Mortal Forest', text: 'waits' })
  const lr = gs.learnEncounterRecipe(s.family.encounters.length - 1)
  assert(lr.ok && gs.recipeKnown(second), 'helping the stranger teaches the formula')
  assert(!gs.recipeKnown(DISC.arena.lotus), 'a road encounter never grants an Arena-only formula')

  // ── migration: an old save (no s.recipes) gains exactly the non-hidden formulas ──
  const sim2 = await createSim({ seed: 8 }); await sim2.boot(0)
  const s2 = sim2.gs.get(); delete s2.recipes
  sim2.gs._ensurePhase44Fields()
  const known2 = Object.keys(s2.recipes.known)
  assert(known2.length === RECIPES.filter(r => !r.hidden).length && !known2.some(id => RECIPES.find(r => r.id === id).hidden), 'an old save gains the non-hidden formulas only')
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
