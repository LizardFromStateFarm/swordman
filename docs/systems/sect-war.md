# Sect Wars — Reference
_Covers: sect-war.js (data) · renderer/game/sect-war.js · game-state.js (own-sect + war API, _recalc) · game.js (renderSectWarPanel) · index.html · styles.css · Phase: 5B · Updated: 2026-09-25_

## State
- `sectWar: { phase, nextWarAt, scoutEndsAt, prepEndsAt, enemyName, enemyTier, allyId, reinforced, arrayDamagedUntil, warVictories, warDefeats, lastResult }`
  - `phase: 'none' | 'scouting' | 'preparing'` — `'none'` is idle, waiting for `nextWarAt`
  - `nextWarAt/scoutEndsAt/prepEndsAt`: absolute epoch ms for the next phase transition (only the one matching current `phase` is live)
  - `enemyName/enemyTier`: rolled when scouting begins — flavor only, `enemyTier` is 1–5 stars scaled to `sectFame`
  - `allyId: string|null` — a `SECTS` id requested as war ally this cycle (`WAR_ALLY_POWER_BONUS` to player power)
  - `reinforced: bool` — one-time `WAR_REINFORCE_POWER_BONUS` purchase during `preparing`
  - `arrayDamagedUntil: ms` — while `Date.now() < this`, Defensive Array's `war_defense` effect is excluded from `_recalc()`
  - `lastResult: { win, enemyName, spoils?|spoilsLost, arrayHit?, ts }` — shown in the Sect tab until the next war resolves

## API (game-state.js)
- `tickSectWar()` → void — called every `tick(dt)` and once from offline catch-up in `initSlot()`. Loops `_advanceSectWarStep()` (capped at 50 iterations) so multiple missed war cycles fast-forward correctly while offline.
- `reinforceForWar()` → `{ ok, cost?, reason? }` — reasons: `no_sect`, `no_war` (not `preparing`), `already`, `stones`. Cost = `max(20, sectFame × WAR_REINFORCE_COST_PER_FAME)`.
- `requestWarAlly(sectId)` → `{ ok, cost?, ally?, reason? }` — reasons: `no_sect`, `no_war` (not `scouting`/`preparing`), `already`, `unknown`, `stones`. Cost = `WAR_ALLY_COST_BASE + sectFame × WAR_ALLY_COST_PER_FAME`.
- Internal: `_scheduleNextWar(baseTs?)`, `_advanceSectWarStep()` (one phase transition, returns bool), `_resolveSectWar()` (auto-resolve + spoils/penalty + reschedule).

## Data Shape (assets/data/sect-war.js)
- Interval scaling: `WAR_MIN_INTERVAL_HOURS`(2)–`WAR_MAX_INTERVAL_HOURS`(6), linearly interpolated by `min(1, sectFame / WAR_FAME_SOFTCAP)` — higher fame = more frequent wars.
- Phase durations: `WAR_SCOUT_SECONDS`(300), `WAR_PREP_SECONDS`(600).
- Cost/bonus constants for reinforcement, alliance, spoils, and loss fraction (see file comments).
- `RIVAL_SECT_PREFIXES` / `RIVAL_SECT_SUFFIXES` — combined for a flavor rival sect name each war (no persistent NPC sect state — Phase 15 territory).

## Wiring
- `game-state.js foundOwnSect()` resets + schedules `sectWar` via `_scheduleNextWar()`; `disbandOwnSect()` wipes it.
- `_recalc()` adds `fame += 5 × warVictories` and computes `derived.arrayDamaged`; `renderer/game/sect-war.js SectWarSystem.tick()` just calls `gameState.tickSectWar()` every frame.
- `game.js renderOwnSect()` calls `renderSectWarPanel(s, el)` right after the sect header; `updateSectTimersInPlace()` refreshes `#_war_timer` in place each tick.

## Invariants
1. `phase` only advances forward (`none → scouting → preparing → none`); resolution always returns to `none` and reschedules.
2. `allyId`/`reinforced` are cleared when a new war's scouting phase begins, never mid-war.
3. Alliance and reinforcement can only be purchased once each per war cycle.
4. `arrayDamagedUntil` is only set on defeat, and only if `defensive_array` is built.
5. War outcome is probabilistic: `playerPower / (playerPower + enemyPower)`, never a guaranteed win or loss.

## Gotchas
- Wars only run for founded sects today (`tickSectWar()` early-returns otherwise). Phase 5C (PLAN.md) plans member wars for *joined* sects — generalise this state with a `side` field rather than duplicating it.
- No real NPC sects exist yet (Phase 15 is unbuilt) — rival sects and allies are flavor/mechanic only; alliance is bought from the existing Phase 4 `SECTS` roster, not a relationship system.
- Offline catch-up relies on `tickSectWar()` being timestamp-based (`Date.now()` comparisons, no `dt` accumulation), so it fast-forwards correctly across any number of missed cycles in one `initSlot()` call — unlike phase durations that would need to be recomputed from "now" if scheduling were dt-based instead.
- Reinforcement/alliance costs and win-probability formula are first-pass balance — not playtested.
