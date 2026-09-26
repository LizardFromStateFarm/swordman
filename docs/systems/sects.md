# Sect System (Join Existing) — Reference
_Covers: sects.js (data) · renderer/game/sect.js · game-state.js · game.js (renderSect) · index.html · styles.css · Phase: 4 · Updated: 2026-09-25_

## State
- `sect: { id, rank, contribution, activeMissions }`
  - `id: string|null` — joined sect id (null = no sect)
  - `rank: 0–5` — index into `SECT_RANKS`
  - `contribution: number` — Sect Contribution Points (spent on nothing; only gate rank-ups)
  - `activeMissions: [{ uid, missionId, endsAt }]` — max `SECT_MAX_MISSIONS` (2) at once

## API (game-state.js)
- `joinSect(sectId)` → `{ ok, sect?, reason? }` — reasons: `unknown`, `in_sect`, `stage`
- `leaveSect()` → `{ ok, reason? }` — wipes rank/contribution/missions, karma −5
- `donateToSect(stones)` → `{ ok, gained?, reason? }` — `SECT_DONATE_RATE` contribution per stone
- `rankUpSect()` → `{ ok, rank?, reason? }` — needs contribution ≥ next rank's `minContribution`; manual
- `startSectMission(missionId)` → `{ ok, mission?, reason? }` — reasons: `no_sect`, `unknown`, `rank`, `busy`, `full`
- `resolveSectMission(uid)` → void — called by SectSystem when `endsAt` passes

## Data Shape (assets/data/sects.js)
- `SECTS[]`: `{ id, name, nameCN, desc, minStage, specialty, effects }`
  - `effects` keys (all optional, read in `_recalc()` / craftItem / resolveExpedition):
    `qps_mult`, `bt_bonus`, `bt_floor`, `weapon_qps_mult`, `artifact_qps_mult`, `loot_mult`,
    `herb_mult`, `craft_double_chance`, `hidden_locations`, `integrity_regen_mult`
- `SECT_RANKS[]`: `{ name, nameCN, minContribution, rewardMult }` (index = rank)
- `SECT_MISSIONS[]`: `{ id, name, nameCN, desc, duration(s), minRank, contribution, rewards[], beastXp }`
  - `rewards`: `{ itemId, minQty, maxQty }` (spirit_stone credits `spiritStones`)

## Wiring
- `game-state.js _newGame()` seeds `sect`; `_ensurePhase4Fields()` migrates old saves (called from `_recalc`).
- `_recalc()` folds sect `effects` into qps/BT and exposes `derived.sect*` fields.
- `renderer/game/sect.js SectSystem.tick()` → resolves missions whose `endsAt` has passed.
- `game.js bootGame()` adds `sectSys.tick(dt)`; `renderSect(s)` drives the Sect tab; timers update in place.

## Invariants
1. `sect.id` null ⇒ `rank === 0`, `contribution === 0`, `activeMissions === []`.
2. `activeMissions.length ≤ 2`.
3. Breakthrough chance still capped at 0.98 (`bt_floor` only raises the lower bound to 0.5).
4. Mission rewards/contribution are multiplied by `SECT_RANKS[rank].rewardMult`.
5. Rank only increases via `rankUpSect()`; it never skips levels.

## Gotchas
- Escort / Subdue Demon / Retrieve Artifact pay Spirit Stones (economy pass 2026-09-25): long missions finish
  while the player is offline, so they're the low-engagement (afk) player's main stone faucet. Re-run `npm run sim`.
- Phase 5A (`own-sect.md`): founding your own sect requires leaving any joined sect, and `joinSect` rejects `own_sect` while you lead one.
- Divergences from PLAN.md: logic file is `sect.js` (as planned), data `sects.js`; Myriad Herb Hall
  "Crafting ×2" is implemented as a 35% chance to double output; Azure Sword weapon buff is a Qi/s multiplier
  when a weapon is equipped; Heaven Defying "artifact bonus" is a Qi/s multiplier when an artifact is equipped.
- Beast expeditions use `lootMultOverride`, so sect `loot_mult` only affects the cultivator's own expeditions.
- Leaving a sect and rejoining starts at Outer Disciple with 0 contribution (deliberate cost).
- Escort mission gives XP to every beast not currently on expedition, via `_addBeastXp()`.
