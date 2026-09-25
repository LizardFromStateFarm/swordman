# Expedition System — Reference
_Covers: expedition.js · game-state.js (startExpedition, resolveExpedition, _rollDrops) · locations.js · enemies.js · Phase: 2 · Updated: 2026-09-24_

## State
```
expedition: {
  active:     bool    — true while an expedition is running
  locationId: string  — id from LOCATIONS; null when idle
  endsAt:     ms      — Date.now() target; null when idle
}
inventory:  {}        — itemId → quantity (integer); spirit_stone is NOT stored here (goes to spiritStones)
equipped: {
  weapon:   string|null  — itemId of equipped weapon (must be item.type === 'weapon')
  artifact: string|null  — itemId of equipped artifact (must be item.type === 'artifact')
}
```

## API (game-state.js)
```
startExpedition(locationId) → { ok, loc } | { ok:false, reason: 'active'|'unknown'|'stage' }
resolveExpedition()         — rolls drops, adds to inventory/spiritStones, fires addEvent, resets expedition
```

## Data Shape

**LOCATIONS** each entry:
```
id, name, nameCN, desc
minStage     — stageIndex required to unlock
duration     — seconds until return
enemyTier    — 1–5; controls numDrops rolled (1 + rand(0..min(tier,3)))
dropTable[]  — { itemId, weight, minQty, maxQty }
```

**ITEMS** (relevant fields for expedition):
```
type: 'resource'   — goes to s.inventory[id]
type: 'currency'   — spirit_stone; goes to s.spiritStones instead
```

## Wiring
```
ExpeditionSystem.tick(dt)       — runs every frame in game.js rAF loop
  → checks Date.now() >= s.expedition.endsAt
  → calls gameState.resolveExpedition() once when expired
gameState.initSlot()            — auto-resolves expired expedition on load (offline catch-up)
game.js renderExplore(s)        — reads s.expedition and s.inventory for UI; called every frame when tab active
```

## Drop Resolution (_rollDrops)
1. `numDrops = 1 + floor(random * min(enemyTier, 3))` — tier 1 = 1 drop, tier 5 = up to 3 drops
2. Weighted random selection without replacement from dropTable
3. qty = round(uniform(minQty, maxQty) × lootMult); minimum 1
4. `lootMult` comes from `s.derived.lootMult` (1.5 if Void Blade equipped, else 1)
5. Items with `type === 'currency'` bypass inventory → add to `s.spiritStones`

## Invariants
1. Only one expedition can be active at a time — `startExpedition` returns `{ ok:false, reason:'active' }` if one is running
2. `resolveExpedition` is idempotent on `active: false` (early return guard)
3. After resolution, `expedition` is always reset to `{ active:false, locationId:null, endsAt:null }`
4. Expedition timer is checked in `ExpeditionSystem.tick`, NOT in `gameState.tick` — keep them separate

## Gotchas
- `hiddenLocations` (derived, true when Void Compass equipped) is used in `renderExplore` to skip the "show only next 2 locked locations" filter — it's not enforced in `startExpedition`; if you add minStage enforcement at start time, update both
- The Explore tab re-renders every frame when active (called from `updateHUD`); avoid DOM operations inside `renderExplore` that are expensive on repeat calls — the current implementation clears + rebuilds innerHTML which is fine at this scale
- Spirit Stone drops in the drop table use the item id `spirit_stone` but resolve to `s.spiritStones` — if you add a crafting recipe that needs `spirit_stone` as an ingredient, that design is currently unsupported (they're separate stores)
