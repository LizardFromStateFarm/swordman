// Scenario checks — backpack.md → "Selling" (task 1.11, Phase 42-0): every non-currency item has a price; crafted items
// sell for SELL_CRAFTED_FRACTION of their ingredients, so no recipe turns a profit when crafted and sold; sellItem pays
// value × n, removes the copies, logs a line, clears a queued pill, refuses currency / equipped / more than owned / bad qty.
// Run: npm run checks · node scripts/sim/checks/sell.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 5 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  const ITEMS = sim.ev('ITEMS'), RECIPES = sim.ev('RECIPES'), FRAC = sim.ev('SELL_CRAFTED_FRACTION')

  // prices
  const ids = Object.keys(ITEMS)
  assert(gs.itemValue('spirit_stone') === 0, 'currency has no price (cannot be sold)')
  const unpriced = ids.filter(id => ITEMS[id].type !== 'currency' && !(gs.itemValue(id) >= 1))
  assert(!unpriced.length, `every other item sells for at least 1 stone${unpriced.length ? ' — ' + unpriced.join(', ') : ''}`)
  const profit = RECIPES.filter(r => gs.itemValue(r.productId) > r.ingredients.reduce((a, i) => a + i.qty * gs.itemValue(i.itemId), 0))
  assert(!profit.length, `no recipe sells for more than its ingredients (${RECIPES.length} recipes, product = ${FRAC}× inputs)${profit.length ? ' — ' + profit.map(r => r.productId).join(', ') : ''}`)
  assert(gs.itemValue('void_crystal') > gs.itemValue('iron_ore') && gs.itemValue('iron_ore') > gs.itemValue('spirit_herb') - 1, 'higher-tier materials are worth more')

  // selling
  s.inventory.spirit_herb = 25; const st0 = s.spiritStones
  let r = gs.sellItem('spirit_herb', 10)
  assert(r.ok && r.stones === 10 * gs.itemValue('spirit_herb') && s.spiritStones === st0 + r.stones && s.inventory.spirit_herb === 15, `sell 10 herbs: +${r.stones} stones, 15 left`)
  assert(/Sold 10× Spirit Herb/.test(s.events[0]?.text || ''), 'a log line names what was sold and for how much')
  assert(gs.sellItem('spirit_herb', 16).reason === 'not_owned', 'cannot sell more than you hold')
  assert(gs.sellItem('spirit_herb', 0).reason === 'invalid_qty' && gs.sellItem('spirit_herb', 1.5).reason === 'invalid_qty', 'bad quantities are refused')
  gs.sellItem('spirit_herb', 15)
  assert(!('spirit_herb' in s.inventory), 'selling the last copy removes the stack')
  assert(gs.sellItem('spirit_stone', 1).reason === 'unsellable', 'currency is refused')
  assert(gs.sellItem('no_such_item', 1).reason === 'unknown', 'unknown item is refused')

  // equipped gear
  s.inventory.weapon_spirit_sword = 1; gs.equipItem('weapon_spirit_sword')
  assert(s.equipped.weapon === 'weapon_spirit_sword' && gs.sellItem('weapon_spirit_sword', 1).reason === 'equipped', 'an equipped weapon cannot be sold (unequip first)')

  // a queued pill
  s.inventory.pill_qi_refining = 1; s.activePill = 'pill_qi_refining'
  gs.sellItem('pill_qi_refining', 1)
  assert(s.activePill === null, 'selling the last queued pill clears the queue')
})().catch(e => { console.log('FAIL crashed:', e.stack); process.exitCode = 1 })
