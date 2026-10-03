# Crafting System — Reference
_Covers: crafting.js · game-state.js (craftItem, equipItem, unequipItem, setActivePill, useElixir, useHealPill) · recipes.js · items.js · Phase: 2 + 44 · Updated: 2026-10-02_

## State
```
inventory:  {}              — itemId → quantity; includes all crafted consumables and unequipped equipment
equipped: {
  weapon:   string|null     — currently equipped weapon id
  artifact: string|null     — currently equipped artifact id
}
activePill: string|null     — pill itemId queued for next breakthrough attempt; consumed by attemptBreakthrough
recipes:    { known: { [recipeId]: { how, at } } }  — Phase 44: which formulas the player knows (hidden ones are found)
```

## API (game-state.js)
```
craftItem(recipeId)     → { ok, item } | { ok:false, reason: 'unknown'|'ingredients' }
equipItem(itemId)       → { ok } | { ok:false, reason: 'unknown'|'not_equippable'|'not_owned' }
unequipItem(slot)       → { ok } | { ok:false, reason: 'empty' }   slot = 'weapon'|'artifact'
setActivePill(itemId|null) → { ok } | { ok:false, reason: 'not_pill'|'not_bt_pill'|'not_owned' }   (a `heal` pill → 'not_bt_pill')
useElixir(itemId)       → { ok, oldRoot, newRoot } | { ok:false, reason: 'not_elixir'|'not_owned' }
useHealPill(itemId)     → { ok, health, integrity, healed, integrityHealed } | { ok:false, reason: 'not_heal'|'not_owned'|'full' }
```

## Item Types and Their Behavior
```
'resource'   — stored in inventory; used as recipe ingredients; never equipped or consumed at BT
'currency'   — spirit_stone only; routed to s.spiritStones on expedition return, not inventory
'pill'       — stored in inventory; queued via setActivePill; consumed in attemptBreakthrough
               (a `heal` pill is instead consumed by useHealPill — it restores Health/Integrity now)
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

---

## Phase 44 — Healing pills & discovered recipes (2026-10-02)

A healing consumable set + more weapons/artifacts, with some **formulas discovered** rather than known from the start.

**State** (`_newGame` + `_ensurePhase44Fields`): `s.recipes = { known: { [recipeId]: { how, at } } }`. `_blankRecipes()`
seeds every non-`hidden` recipe as `{ how: 'basic' }`, so a new life (and an old save via migration) knows exactly the
guaranteed formulas; `hidden` ones sit as locked "Unknown formula" cards until found.

**Data** (`recipes.js`): a `hidden: true` entry is unknown until found. `RECIPE_DISCOVERY` maps how:
- `encounter[]` — a stranger met on the road (Roam → Explore) teaches it (help) or it is lost (rob)
- `arena{ringId}` — a ring champion guards it; beating them for the **ring's title** teaches it (the *best* formulas)
- plus `encounterChance / arenaWinChance / robStones / robKarma`; `RECIPE_ENCOUNTER_TEXT` is the road flavour.
`items.js`: the `heal` pill effect (`{ type: 'heal', health, integrity }`) — Mending +30 HP, Blood-Nourishing +60,
Spirit-Settling +45 Integrity, Soul-Anchoring +45/+25, Golden Marrow +80/+30, Nine-Turn = full. New weapons/artifacts
reuse the **already-wired** `_recalc` effects (`qps_mult`, `qi_cap_mult`, `bt_bonus`, `void_blade`).

**API** (game-state.js): `recipeKnown(id)` · `recipeSource(id)` · `recipeHint(id)` · `_learnRecipe(id, how)` ·
`_rollHiddenRecipe(source)` · `_grantManual`-style `_learnRecipe` from the arena · `learnEncounterRecipe(i)` /
`robEncounterRecipe(i)` · `useHealPill(id)` · `healLock(effect)`.

**Wiring:** `craftItem` / `setAutoCraftRecipe` refuse a hidden recipe you don't know (`reason: 'locked'`); a heal pill
is **used**, never queued (`setActivePill` → `'not_bt_pill'`), and is refused at full Health/Integrity (`'full'`).
`resolveExpedition` may push a `{ kind: 'recipe', recipeId, … }` encounter onto `s.family.encounters`;
`_arenaBoutEnd` grants the ring's recipe on a first title (+ a small chance on any win); `combat.js` names it on the
Arena result. UI: Craft shows the note + locked cards + a jade heal Use; the Explore encounter card leads the view;
Pack's heal pill shows Use. `scripts/sim/checks/recipes.js` pins it; `scenarios/recipes.js` is the smoke.

**Depth pass.** Memory: known formulas persist for the life (a future clan Recipe Book legacy could carry them).
Choices: help or rob the stranger (the formula vs stones + karma); fight on for the ring title or walk. Hooks: Health &
Death (healing), Arena (champion formulas), expeditions/road encounters, crafting, the pack. Drama: the best formulas
are behind ring champions; a road formula can be lost. Feedback: knowing a formula changes what you can craft and
heal after wounds. Agency: every find is the player's choice (help/rob, fight/walk) — the world only rolls whether a
stranger appears.

**UX pass.** Surface: Craft names the count + each locked card's route; Pack/Craft name the heal amount. Interact:
1–2 clicks (Help; Use). Discover: the Explore encounter card + attention item ("One carries a formula…"); a toast on
learning. Feel: xianxia pill names, jade = Health, dashed "sealed" cards + lock icon. Debt: the Overlay's ~227px
content window still needs scrolling to reach the recipe grid (known, general).
