# Sect Wars — Reference
_Covers: sect-war.js (data) · renderer/game/sect-war.js · game-state.js (own-sect + member war API, _recalc) · game.js (renderSectWarPanel, renderMemberWarPanel) · styles.css · Phase: 5B + 5C · Updated: 2026-09-25_

One `sectWar` state machine serves both sides: **own** (you lead a founded sect — 5B) and **member** (you belong to a
Phase 4 sect that goes to war and calls on you — 5C). The two can't coexist: founding requires leaving any joined sect.

## State
- `sectWar: { side, phase, nextWarAt, scoutEndsAt, prepEndsAt, enemyName, enemyTier, allyId, reinforced, arrayDamagedUntil,
              warVictories, warDefeats, lastResult,
              answered, chestStones, pillsGiven, beastId, seen, buffSuppressedUntil, warsIgnored, warsUnseen, contribNet }`
  - `side: 'own' | 'member' | null` — derived from `ownSect.founded` / `sect.id`. `_ensurePhase5BFields()` replaces the
    war state with a blank one for the new side whenever it no longer matches (join / leave / found / disband / old saves).
  - `phase: 'none' | 'scouting' | 'preparing'` — `'none'` is idle, waiting for `nextWarAt`.
    Member side shows these as "Call to Arms" (scouting) and "Muster" (preparing).
  - `nextWarAt/scoutEndsAt/prepEndsAt`: absolute epoch ms for the next phase transition (only the one matching current `phase` is live)
  - `enemyName/enemyTier`: rolled when scouting begins — flavor only. Own: `enemyTier` 1–5 scaled to `sectFame`; member: to the joined sect's tier.
  - `allyId: string|null` — own side: a `SECTS` id requested as war ally this cycle (`WAR_ALLY_POWER_BONUS` to player power)
  - `reinforced: bool` — own side: one-time `WAR_REINFORCE_POWER_BONUS` purchase during `preparing`
  - `arrayDamagedUntil: ms` — own side: while `Date.now() < this`, Defensive Array's `war_defense` effect is excluded from `_recalc()`
  - `lastResult` — shown in the Sect tab until the next war resolves.
    Own: `{ win, enemyName, spoils?|spoilsLost, arrayHit?, ts }`.
    Member: `{ side:'member', win, enemyName, engaged, seen, contribDelta, stones?, rareItem?, suppressed?, ts }`.
  - Member-only, reset when each new call to arms begins: `answered` (one sect-mission slot committed), `chestStones`,
    `pillsGiven`, `beastId` (beast lent to the war), `seen` (the game was open while this war was active).
  - `buffSuppressedUntil: ms` — member side: after a defeat, `_recalc()` ignores the joined sect's `effects` until then.
  - `warsIgnored` / `warsUnseen` / `contribNet` — lifetime member-war record for this membership (UI + QA sim metrics).

## API (game-state.js)
- `tickSectWar(live = true)` → void — called every `tick(dt)` (and by `SectWarSystem`), and once from offline catch-up in
  `initSlot()` with `live = false`. Loops `_advanceSectWarStep()` (capped at 50 iterations) so multiple missed war cycles
  fast-forward correctly while offline. A live call during an active war sets `seen`.
- Own side (5B):
  - `reinforceForWar()` → `{ ok, cost?, reason? }` — reasons: `no_sect`, `no_war` (not `preparing`), `already`, `stones`. Cost = `max(20, sectFame × WAR_REINFORCE_COST_PER_FAME)`.
  - `requestWarAlly(sectId)` → `{ ok, cost?, ally?, reason? }` — reasons: `no_sect`, `no_war` (not `scouting`/`preparing`), `already`, `unknown`, `stones`. Cost = `WAR_ALLY_COST_BASE + sectFame × WAR_ALLY_COST_PER_FAME`.
- Member side (5C) — every call rejects with `no_war` unless `side === 'member'` and a war is scouting/preparing:
  - `answerWarCall()` → `{ ok, reason? }` — commits one sect-mission slot until the war resolves (`startSectMission` counts it). Reasons: `already`, `full`.
  - `donateWarChest(stones)` → `{ ok, given, gained, reason? }` — stones into the war chest, clamped to what's left of
    `memberWarChestFull()`; also earns `SECT_DONATE_RATE` contribution. Reasons: `invalid`, `stones`, `full`.
  - `offerWarPill(itemId)` → `{ ok, gained, reason? }` — consumes one `type:'pill'` item (max `MEMBER_WAR_MAX_PILLS`). Reasons: `not_pill`, `none`, `full`.
  - `sendBeastToWar(beastId)` → `{ ok, beast, reason? }` — one idle beast per war. Reasons: `already`, `not_found`, `busy`.
  - `memberWarPower()` → `{ bonus, power, rankMult }` — current commitment bonus (UI and resolution share it).
  - `memberWarChestFull()` → Spirit Stones that max the chest bonus at your rank.
- Internal: `_scheduleNextWar(baseTs?)` (own: fame-scaled; member: rank-scaled), `_advanceSectWarStep()` (one phase
  transition, returns bool), `_resolveSectWar()` (own) / `_resolveMemberWar()` (member), `_releaseWarBeast(xp)`, `_warSide()`, `_warEndsAt()`.

## Data Shape (assets/data/sect-war.js)
- Own-sect interval: `WAR_MIN_INTERVAL_HOURS`(2)–`WAR_MAX_INTERVAL_HOURS`(6), linearly interpolated by `min(1, sectFame / WAR_FAME_SOFTCAP)` — higher fame = more frequent wars.
- Own-sect phase durations: `WAR_SCOUT_SECONDS`(300), `WAR_PREP_SECONDS`(600).
- Cost/bonus constants for reinforcement, alliance, spoils, and loss fraction (see file comments).
- Member wars: `MEMBER_WAR_MIN/MAX_INTERVAL_HOURS` (4–10, interpolated by `rank / 5` — higher rank = called more often),
  `MEMBER_WAR_SCOUT_SECONDS` (30m call) + `MEMBER_WAR_PREP_SECONDS` (90m muster) = a 2h window; commitment bonuses
  (`MEMBER_WAR_ANSWER_BONUS`, `MEMBER_WAR_CHEST_*`, `MEMBER_WAR_PILL_*`, `MEMBER_WAR_BEAST_*`), spoils, penalties.
- `RIVAL_SECT_PREFIXES` / `RIVAL_SECT_SUFFIXES` — combined for a flavor rival sect name each war (no persistent NPC sect state — Phase 15 territory).

## Member War Outcome (5C)
- `power = 1 + bonus × SECT_RANKS[rank].rewardMult` vs enemy `0.6 + rand × 0.8`; win if `rand < power / (power + enemy)`.
  `bonus` = answer (0.3) + chest (0–0.3, linear to full) + pills (0.05 each, max 3) + beast (0.05 + 0.02 × level, max 0.25).
  → ~50% with no help, ~65–80% fully committed depending on rank.
- **Win, engaged** (any commitment): `MEMBER_WAR_WIN_CONTRIB × rewardMult` contribution, stones scaled by sect tier ×
  rewardMult, `MEMBER_WAR_RARE_CHANCE` of a rare item. **Win, not engaged:** nothing for you.
- **Loss:** sect `effects` suppressed `MEMBER_WAR_BUFF_SUPPRESS_HOURS`; if the war was `seen`, lose `MEMBER_WAR_LOSS_CONTRIB × rewardMult` contribution (flat, since contribution keeps growing past max rank).
- **Ignored** (`seen`, zero commitments): extra −`MEMBER_WAR_IGNORE_CONTRIB × rewardMult` contribution and −`MEMBER_WAR_IGNORE_KARMA` karma.
- **Unseen** (the whole war resolved while the game was closed): no personal reward or penalty — "the sect fought without you".
- Rank is never demoted. Contribution may drop below the current rank's threshold; the rank stays.
- **Deserting** (`leaveSect()` while a war is active): an extra −`MEMBER_WAR_DESERT_KARMA` karma on top of the normal leave cost.
- A lent beast always comes home with `MEMBER_WAR_BEAST_XP` XP, win or lose.

## Wiring
- `_ensurePhase5BFields()` keeps `sectWar.side` in sync with `_warSide()`; `joinSect()` / `leaveSect()` / `foundOwnSect()` /
  `disbandOwnSect()` rely on it (join then schedules the first call on the next tick).
- `_recalc()` adds `fame += 5 × warVictories` (own side only) and computes `derived.arrayDamaged`,
  `derived.sectBuffSuppressed` (member side), `derived.warSlot` (1 while a mission slot is committed).
- `renderer/game/sect-war.js SectWarSystem.tick()` just calls `gameState.tickSectWar()` every frame.
- `renderer/game/beasts.js` skips beasts with `expedition.war`; `resolveBeastExpedition()` ignores them (the war returns them).
- `game.js renderOwnSect()` calls `renderSectWarPanel(s, el)` right after the sect header; the member view of `renderSect()`
  calls `renderMemberWarPanel(s, el)` after the rank header. `updateSectTimersInPlace()` refreshes `#_war_timer` in place each tick.

## Invariants
1. `phase` only advances forward (`none → scouting → preparing → none`); resolution always returns to `none` and reschedules.
2. Per-war fields (`allyId`, `reinforced`, `answered`, `chestStones`, `pillsGiven`, `beastId`, `seen`) are cleared when a new
   war's scouting phase begins, never mid-war.
3. Alliance and reinforcement can only be purchased once each per war cycle; answering and sending a beast only once each.
4. `arrayDamagedUntil` is only set on an own-side defeat, and only if `defensive_array` is built.
5. Member side: `activeMissions.length + (answered ? 1 : 0) ≤ SECT_MAX_MISSIONS`.
6. `side === 'own'` ⇔ `ownSect.founded`; `side === 'member'` ⇔ `sect.id` (checked by the QA sim).
7. War outcome is probabilistic: never a guaranteed win or loss.

## Gotchas
- Reinforce/ally costs are deliberately steep (fame × 2 / 100 + fame × 1) — war prep is the game's main
  repeatable late-game Spirit Stone sink; defeat takes 8% of the bank (was 15%, which made war losses ~80% of
  all stone outflow). Tuned with `npm run sim` (Economy section) — re-run it after touching these.
- `tickSectWar(live)`: `initSlot()` passes `false`, so a war that starts *and* ends while the game is closed is "unseen"
  (no ignore penalty) — afk players aren't punished for a call they could never have answered.
- A beast lent to a war has `expedition = { war: true, endsAt }`, so every "is this beast busy?" check (UI, bot, Escort
  XP) already treats it as away. Dismissing it mid-war is allowed; resolution just skips a missing beast.
- The member war window is 2h (vs 15 min for own-sect wars) because the 15-min window was the sim's main "wars resolve
  unseen" flag — casual players checking in every 30 min missed half of them.
- No real NPC sects exist yet (Phase 15 is unbuilt) — rival sects and allies are flavor/mechanic only; alliance is bought from the existing Phase 4 `SECTS` roster, not a relationship system.
- Offline catch-up relies on `tickSectWar()` being timestamp-based (`Date.now()` comparisons, no `dt` accumulation), so it fast-forwards correctly across any number of missed cycles in one `initSlot()` call.
- Member war numbers are first-pass (sim-checked for health and engagement, not hand-playtested).
