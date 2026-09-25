# Phase 3 — Realm Integrity & Spiritual Beasts Reference
_Covers: game-state.js · beasts.js · beast-sprites.js · index.html · styles.css · Phase: 3 · Updated: 2026-09-24_

## State

### 3A — Realm Integrity
- `realmIntegrity: 100` — current integrity (0–100). Starts at 100 per new game.
- `_intRegenAcc: 0` — tick accumulator for passive regen. Internal; not displayed.

### 3B — Spiritual Beasts
- `beasts: []` — tamed beast objects (max `derived.maxBeasts`: 3, or 5 with the Phase 5A Spirit Beast Pen).
  - `{ id, typeId, name, level, xp, traits: [traitId, ...], expedition: null | { locationId, endsAt } }`
- `beastEncounters: []` — pending encounter events from expeditions (max 3 queued).
  - `{ id, typeId, traits: [traitId, ...], seenAt }`

## API

### Integrity
Passive regen: +1 per 30 s (accumulates in `_intRegenAcc` during tick).
`attemptBreakthrough()` on fail: −20 integrity; if integrity ≤ 0 → demotion (stageIndex −1, integrity → 60).
Heart Calming Pill adds `integrity_restore: 30` to its effect → applied on BT failure.
Heaven Defying Pill guarantees success → integrity block never reached.

### Beasts
- `tameEncounteredBeast(encounterId)` → `{ ok, beast? }` — consumes 1 Beast Taming Talisman
- `sendBeastExpedition(beastId, locationId)` → `{ ok, loc? }` — starts beast expedition
- `resolveBeastExpedition(beastId)` → void — called by BeastSystem on timer completion
- `dismissBeast(beastId)` → `{ ok }` — removes a tamed beast

## Data Shape

`BEAST_TRAITS` (beasts.js): `{ [id]: { id, name, nameCN, desc } }`
`BEAST_TYPES` (beasts.js): `[{ id, name, nameCN, desc, minStage, encounterChance, baseExpPower, xpPerExp, spriteState, favoredTraits }]`
`BEAST_SPRITES` (beast-sprites.js): same shape as CULTIVATOR_SPRITES, keyed by `spriteState`.

## Wiring

- `game-state.js tick()` → increments `_intRegenAcc`; applies integrity regen.
- `renderer/game/beasts.js BeastSystem.tick(dt)` → polls each beast.expedition timer; calls `resolveBeastExpedition`.
- `game.js bootGame()` → instantiates BeastSystem, adds to loop.
- `game.js renderExplore()` → beast encounters section + active beasts section rendered at bottom of Explore tab.
- `game.js updateHUD()` → updates integrity fill bar + color.

## Invariants

1. `realmIntegrity` stays in [0, 100].
2. `stageIndex` never goes below 0 on demotion.
3. `s.beasts.length ≤ derived.maxBeasts` (3 base, +2 Spirit Beast Pen) at all times.
4. `s.beastEncounters.length ≤ 3` at all times.
5. Beast `level` stays in [1, 10]; `xp` resets at each level-up.

## Gotchas

- Heaven Defying Pill bypasses integrity damage because it guarantees BT success; no extra bypass flag is needed.
- Beast expedition resolution uses `beastId` lookup (not array index) so reordering beasts is safe.
- `_rollDrops` accepts an optional second arg `lootMultOverride` (used by Spirit Nose beast trait: 1.25×).
- Shake animation on demotion: add/remove CSS class `shake` on `#app`.
- `_intRegenAcc` is saved in the slot file (underscore prefix is informational only, not stripped).
