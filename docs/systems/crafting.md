# Crafting System — Reference
_Covers: crafting.js · game-state.js (craftItem, equipItem, unequipItem, setActivePill, useElixir) · recipes.js · items.js · Phase: 2 · Updated: 2026-09-24_

## State
```
inventory:  {}              — itemId → quantity; includes all crafted consumables and unequipped equipment
equipped: {
  weapon:   string|null     — currently equipped weapon id
  artifact: string|null     — currently equipped artifact id
}
activePill: string|null     — pill itemId queued for next breakthrough attempt; consumed by attemptBreakthrough
```

## API (game-state.js)
```
craftItem(recipeId)     → { ok, item } | { ok:false, reason: 'unknown'|'ingredients' }
equipItem(itemId)       → { ok } | { ok:false, reason: 'unknown'|'not_equippable'|'not_owned' }
unequipItem(slot)       → { ok } | { ok:false, reason: 'empty' }   slot = 'weapon'|'artifact'
setActivePill(itemId|null) → { ok } | { ok:false, reason: 'not_pill'|'not_owned' }
useElixir(itemId)       → { ok, oldRoot, newRoot } | { ok:false, reason: 'not_elixir'|'not_owned' }
```

## Item Types and Their Behavior
```
'resource'   — stored in inventory; used as recipe ingredients; never equipped or consumed at BT
'currency'   — spirit_stone only; routed to s.spiritStones on expedition return, not inventory
'pill'       — stored in inventory; queued via setActivePill; consumed in attemptBreakthrough
'elixir'     — stored in inventory; consumed immediately by useElixir (root reroll)
'weapon'     — stored in inventory until equipped; equipping moves it from inventory to s.equipped.weapon
'artifact'   — same pattern as weapon; slot is s.equipped.artifact
```

## Data Shape

**RECIPES** each entry:
```
id, category ('pills'|'elixirs'|'weapons'|'artifacts'), productId
ingredients[]  — [{ itemId, qty }]
```

**ITEMS** effect field shapes:
```
pill:    { type: 'bt_bonus', value: 0.N }
         { type: 'qi_loss_reduce', value: 0.N }
         { type: 'bt_bonus', value: 0.N, qi_loss_reduce: 0.N }  ← Golden Core: both
         { type: 'bt_guarantee' }
elixir:  { type: 'root_reroll', outcomes: [{ type: 'mixed'|'dual'|'pure'|'heavenly', weight: N }] }
weapon:  { type: 'qps_mult', value: N }
         { type: 'expedition_power', value: N }    ← not yet used in _recalc
         { type: 'enemy_hp_reduce', value: N }     ← not yet used in _recalc
         { type: 'void_blade', loot_mult: N, bt_bonus: N }
artifact:{ type: 'qps_mult', value: N }
         { type: 'qi_cap_mult', value: N }
         { type: 'bt_bonus', value: N }
         { type: 'hidden_locations' }
```

## Wiring
```
CraftingSystem (crafting.js)    — thin wrapper; all mutations delegate to gameState methods
game.js renderCraft(s)          — reads s.inventory, s.equipped, s.activePill
  → wires [data-recipe], [data-equip], [data-queue], [data-clearqueue], [data-useelixir] buttons
_recalc() in game-state.js      — applies equipped weapon/artifact bonuses every tick
attemptBreakthrough()           — reads + consumes s.activePill
```

## Equip Mechanics
- `equipItem`: deducts from inventory, adds old equipped item back to inventory, sets equipped slot
- `unequipItem`: adds to inventory, clears slot
- Equipping same item already equipped: no-op (early return `{ ok:true }`)
- stackable=false items can still have qty>1 in inventory (crafted multiple before equipping)

## Pill Mechanics
- Only one pill can be queued at a time (`activePill`)
- Queue shows in BT button label via `breakthroughChanceDisplay` (preview bonus, not baked into base chance)
- Pill is consumed in `attemptBreakthrough` before the roll — even if BT is blocked by stage cap, the pill is consumed if `canBreakthrough` was true
- qi_loss_reduce math: normal failure loses 50% → keep fraction = `0.5 + 0.5 * reduce_value`

## Invariants
1. `craftItem` removes ingredients atomically — partial crafts cannot happen (all-or-nothing check first)
2. Items with `qty <= 0` are deleted from inventory after any consumption
3. `activePill` is set to null in `attemptBreakthrough` regardless of outcome (consume or clear invalid ref)
4. Weapon/artifact bonuses are applied in `_recalc` on every tick — no need to recompute on equip

## Gotchas
- `expedition_power` and `enemy_hp_reduce` weapon effects are defined in ITEMS but **not yet wired in `_recalc`** — they're reserved for Phase 3 when expedition combat gets deeper
- Root reroll via elixir calls `_rollSpecificRoot(type)` — this does NOT check stage; you can reroll to a worse root at any point. There is no confirmation prompt — add one in the UI if needed
- `useElixir` consumes the item before the roll; the outcome is disclosed in the return value — the UI should display `res.oldRoot → res.newRoot` to the player
