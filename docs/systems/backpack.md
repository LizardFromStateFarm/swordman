# Backpack & Inventory Tab — Reference
_Covers: items.js (category field) · game-state.js (discardItem) · renderer/game/crafting.js (discard wrapper) ·
game.js (renderPack, generic confirm overlay) · index.html · styles.css · Phase: 21 · Updated: 2026-09-26_

## State
No new persisted state. Reuses what already exists:
```
spiritStones: number        — currency, shown at the top of the Pack tab
inventory:    {}            — itemId → qty; the Pack list body (currency ids never appear here)
equipped:     { weapon, artifact }  — drives the ◆ badge + synthetic equipped-only rows
activePill:   string|null   — drives the pill row's Queue/Queued state (same as Craft tab)
```
Render-layer-only (not saved, not in game-state.js — per the Phase 21 implementation notes in PLAN.md):
```
_packFilter    — 'all'|'mat'|'pill'|'equip'|'rare'|'key', closure var in game.js bootGame()
_packSort      — 'name'|'qty'
_packExpanded  — itemId of the one expanded row, or null
_packLastStones / _packDelta — currency delta-indicator tracking (see Wiring)
```

## API
```
discardItem(itemId, n = 1) → { ok } | { ok:false, reason: 'unknown'|'currency'|'invalid_qty'|'not_owned' }
```
Game-state method (Rule #1: only game-state.js mutates `_s`). Mirrors the existing `useElixir`/`offerWarPill`
decrement pattern: clears the activePill ref if the discarded stack hit 0. `renderer/game/crafting.js` exposes a
thin `discard(itemId, n)` wrapper, same as its `equip`/`unequip`/`useElixir` wrappers — no logic is duplicated.

## Data Shape
`ITEMS[id].category` — one of:
| Value | Meaning | Assigned to |
|---|---|---|
| `currency` | Not shown in the Pack list body, only the currency row | `spirit_stone` |
| `mat` | Crafting ingredient | all `resource`-type items except the 3 below |
| `pill` | Consumable (Pills filter shows **both** pills and elixirs, per the Phase 21 spec) | all `pill` + `elixir` items |
| `equip` | Weapons and artifacts | all `weapon` + `artifact` items |
| `rare` | Scarce, hard-to-obtain material | `void_crystal`, `chaos_essence`, `ancient_script` |
| `key` | Unlocks a capability rather than being consumed for a stat | `beast_taming_talisman` |

`category` is a second, independent enum from `RECIPES[i].category` (`'pills'|'elixirs'|'weapons'|'artifacts'|'talismans'`,
used for the Craft tab's sub-tabs) — same word, different data structure, don't confuse the two when editing either file.

## Wiring
```
game.js renderPack(s)              — full rebuild of #tab-pack: currency row, filter chips, sort buttons, item rows
game.js updatePackDeltaInPlace(s)  — called every rAF tick (like updateExpeditionTimerInPlace); only touches the
                                     currency delta span's opacity/transform (computed from elapsed ms, no CSS
                                     keyframes needed since the tab already rebuilds on every real state change)
game.js showConfirm(msg, sub, onYes) — #confirm-overlay generalized from a hardcoded "delete slot" flow into a
                                     one-shot pending-callback pattern; Discard reuses it, charselect's delete
                                     button now calls it too (behavior unchanged)
craftSys.discard(id, n)            — thin wrapper → gameState.discardItem
```

## Item Row Logic
- Display rows = every `inventory[id] > 0` entry, **plus** a synthetic row for `equipped.weapon`/`equipped.artifact`
  if that id has no (or a lower) unequipped stack in `inventory` — otherwise the existing row is just flagged
  `equipped: true`. This matches the Craft tab's existing convention that "owned" qty is the *unequipped* count only.
- Currently-equipped rows show a ◆ badge and no Discard button (must Unequip first — reuses the Craft tab's
  `unequipItem`, not duplicated here).
- Expand shows: description, **Use** (pill → queues via `setActivePill`, same Queue/★ Queued toggle as Craft;
  elixir → `useElixir` immediately, same as Craft — no new confirmation, matching existing behavior), **Equip**
  (weapon/artifact not already equipped), **Discard ×1** (confirm via `showConfirm`, then `craftSys.discard(id,1)`).

## Invariants
1. Every `ITEMS[id].category` is one of `currency|mat|pill|equip|rare|key` (sim invariant `item_category_invalid`,
   checked once per run in `scripts/sim/metrics.js`, same pattern as the `banter_pool_holes` content check).
2. `discardItem` never removes more than is owned, and deletes the inventory key at qty 0 (matches every other
   consumption site in game-state.js).
3. Currency items (`type === 'currency'`) never appear in the Pack list body — they're presented only in the
   currency row at the top.

## Gotchas
- **"Recently Acquired" sort was dropped**, not built. The spec's PLAN.md text allows this ("if it needs new state,
  add it properly … otherwise drop it and document"). Tracking acquisition order/timestamp would mean touching
  every inventory-gain call site in game-state.js (expedition drops, crafting output, sect mission rewards, war
  spoils, disciple income — at least 6 separate `s.inventory[id] = (s.inventory[id]||0)+qty` sites, no single
  choke point exists today) — a broader refactor than this task's scope, and risky to do unattended. Sort is
  Name A–Z / Qty (high→low) only. A future task could add a `_gainItem()` helper choke point and revisit this.
- **"Rare" is a static category, not the spec's literal "qty < 10" dynamic filter.** A qty-based tag would make
  items jump between the Rare and Mats tabs as you spend/gain them, which is worse UX than a stable tab. `void_crystal`/
  `chaos_essence`/`ancient_script` are tagged `rare` permanently instead (matches design pillar 6: Void Crystals are
  a rare material, not a premium currency — and Chaos Essence/Ancient Script are the other two lowest-drop-weight,
  highest-tier resources per `locations.js`).
- **"Keys" only ever holds one item today** (`beast_taming_talisman`). The spec's example items ("Realm Keys",
  "Celestial Calendar") don't exist in `ITEMS` yet — they'd get `category: 'key'` whenever a future phase adds them.
- The currency delta indicator is computed as inline `opacity`/`transform` from elapsed time inside
  `updatePackDeltaInPlace`, not a CSS `@keyframes` animation — simpler given the tab already fully rebuilds on
  every real inventory/stones change (see ui-layout.md's "rendering every frame is intentional" gotcha), and it
  avoids the "restart a CSS animation on the same element" trick entirely.
- `#confirm-overlay` is now generic (`showConfirm(msg, sub, onYes)`), used by both charselect's delete-slot flow
  and Pack's Discard. If you add a third caller, don't hardcode a new sentinel — reuse `showConfirm`.
- 7 tabs now fit at 300px with `.tab` font-size dropped 10px→9px (`styles.css`); if an 8th tab is ever added,
  check the tab row by eye again first (ui-layout.md → "Adding a New Tab" step 6).
