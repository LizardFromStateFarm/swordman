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

## Roster, tiers, variants, Might (2026-09-28)
10 types in `BEAST_TYPES` (assets/data/beasts.js), each with a `tier` (`BEAST_TIERS`: common · uncommon · rare · epic ·
legendary) and one rare colour `variants[0]`:
| Tier | Beasts (realm gate) | Might |
|---|---|---|
| Common | Spirit Fox (0), Blood Python (3) | ×1.0 |
| Uncommon | Thunder Eagle (6), Spectral Bear (10) | ×1.2 |
| Rare | White Tiger (13), Qilin (14) | ×1.45 |
| Epic | Void Hound (15), Black Tortoise (16) | ×1.7 |
| Legendary | Azure Dragon (19), Golden Dragon (20, `might: 2.3`, rarest) | ×2.0 |
- **Sighting** (resolveExpedition): type weighted by `encounterChance`; each of 3 trait rolls draws from the type's
  `favoredTraits` with the tier's `favored` chance; `BEAST_VARIANT_CHANCE` (12%) → `enc.variant`. A legendary sighting logs
  its own line and leads the attention strip ("A legendary … watches you"). Emits `beast_sighted` { name, tier, variant }.
- **Might** = tier (or type override) × `BEAST_VARIANT_MIGHT` (1.15) for a variant. It multiplies Soul Bond / Qi Devour, half
  of it applies to Heavenly Instinct's BT bonus and to beast-expedition loot. `baseExpPower` is display-only (unused).
- `gameState.beastProfile(rec)` → { type, tier, variant, might, name, art, lore } for any encounter or companion; the UI
  (cards, details page, attention) reads it. Records without `variant` (old saves) are the plain beast; no migration needed.
- Checks: scripts/sim/checks/beasts.js.

## Beast details (A4-2, 2026-09-28)
Click a beast's portrait (a VIEW tag + zoom cursor) or name in Roam → Beasts → `BeastDetail` (renderer/game/beast-detail.js,
`#beast-overlay` in index.html): a large animated ink portrait (one InkRenderer, width capped by 45% of window height),
name, `lore` (BEAST_TYPES; falls back to `desc`), stat tiles (companion Level/XP · Realm gate · Rarity = tier (+ rare colour) · Might · Growth `xpPerExp` · Now =
expedition), traits with their
effect text, and for a wild beast Tame + talisman count + the lock reason. Re-renders on state notify while open (game.js
renderAll); closes on ✕ / Esc / backdrop, or by itself when the record is gone (tamed → reopens as the companion).
Smoke: scenarios/ink-beasts.js (`out/beast-detail-{enc,beast}-{expanded,overlay,phone}.png`).

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
