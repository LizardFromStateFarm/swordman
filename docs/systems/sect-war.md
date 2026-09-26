# Sect Wars — Reference
_Covers: sect-war.js (data) · renderer/game/sect-war.js · game-state.js (own-sect + member war API, _recalc) · game.js (renderSectWarPanel, renderMemberWarPanel, renderWarOrdersPanel) · styles.css · Phase: 5B + 5C + 32 · Updated: 2026-09-26_

One `sectWar` state machine serves both sides: **own** (you lead a founded sect — 5B) and **member** (you belong to a
Phase 4 sect that goes to war and calls on you — 5C). The two can't coexist: founding requires leaving any joined sect.
**Phase 32 (War Standing Orders, roadmap M1 1.4)** adds a per-slot `warOrders` object applied automatically the
moment each war phase opens — see its own section below. It replaces the old "did you check in during the window"
framing: `seen` is now presentation-only.

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
  - Member-only, reset when each new call to arms begins: `answered` (call answered — free, no mission slot cost),
    `chestStones`, `pillsGiven`, `beastId` (beast lent to the war), `seen` (the game was open while this war was active).
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
  - `answerWarCall()` → `{ ok, reason? }` — free (doesn't touch mission slots), pledges +`MEMBER_WAR_ANSWER_BONUS` to sect power. Reasons: `already`, `no_war`.
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

## Member War Outcome (5C, updated by Phase 32)
- `power = 1 + bonus × SECT_RANKS[rank].rewardMult` vs enemy `0.6 + rand × 0.8`; win if `rand < power / (power + enemy)`.
  `bonus` = answer (0.3) + chest (0–0.3, linear to full) + pills (0.05 each, max 3) + beast (0.05 + 0.02 × level, max 0.25).
  → ~50% with no help, ~65–80% fully committed depending on rank.
- **Win, engaged** (any commitment — from standing orders, a manual click, or both): `MEMBER_WAR_WIN_CONTRIB × rewardMult`
  contribution, stones scaled by sect tier × rewardMult, `MEMBER_WAR_RARE_CHANCE` of a rare item. **Win, not engaged:**
  nothing for you.
- **Loss:** sect `effects` suppressed `MEMBER_WAR_BUFF_SUPPRESS_HOURS`; **always** lose `MEMBER_WAR_LOSS_CONTRIB ×
  rewardMult` contribution (flat, since contribution keeps growing past max rank) — **changed by Phase 32**: this
  used to be skipped entirely when the war was unseen (`if (w.seen) …`), which meant an offline loss cost nothing.
  Now the penalty always applies; `seen` only changes the event-log wording (see Gotchas).
- **Ignored** (`seen`, zero commitments — i.e. you were present and your orders still left you uncommitted, most often
  an explicit `answer: 'stay_out'`): extra −`MEMBER_WAR_IGNORE_CONTRIB × rewardMult` contribution and
  −`MEMBER_WAR_IGNORE_KARMA` karma. This is the *only* penalty that still depends on `seen` — it is the deliberate
  "you were there and chose not to help" cost pillar 4 still allows.
- **Unseen** (`!w.seen`): no longer a distinct reward/penalty case. `warsUnseen` still increments as a descriptive
  count ("how many wars did I sleep through"), but the outcome — win/loss, engaged/not, reward/penalty — is identical
  to a watched war. The event log adds "Your standing orders acted in your stead." when unseen-but-engaged.
- Rank is never demoted. Contribution may drop below the current rank's threshold; the rank stays.
- **Deserting** (`leaveSect()` while a war is active): an extra −`MEMBER_WAR_DESERT_KARMA` karma on top of the normal leave cost.
- A lent beast always comes home with `MEMBER_WAR_BEAST_XP` XP, win or lose.

## Wiring
- `_ensurePhase5BFields()` keeps `sectWar.side` in sync with `_warSide()`; `joinSect()` / `leaveSect()` / `foundOwnSect()` /
  `disbandOwnSect()` rely on it (join then schedules the first call on the next tick).
- `_recalc()` adds `fame += 5 × warVictories` (own side only) and computes `derived.arrayDamaged`,
  `derived.sectBuffSuppressed` (member side).
- `renderer/game/sect-war.js SectWarSystem.tick()` just calls `gameState.tickSectWar()` every frame.
- `renderer/game/beasts.js` skips beasts with `expedition.war`; `resolveBeastExpedition()` ignores them (the war returns them).
- `game.js renderOwnSect()` calls `renderSectWarPanel(s, el)` right after the sect header; the member view of `renderSect()`
  calls `renderMemberWarPanel(s, el)` after the rank header. `updateSectTimersInPlace()` refreshes `#_war_timer` in place each tick.

## Phase 32 — War Standing Orders (roadmap M1 1.4)

Pillar 4 ("never punish absence"): standing orders let a player pre-commit to a war's response so the outcome
no longer depends on whether they were watching. See `PLAN.md` Phase 32 for the original design; this section is
the as-built reference.

### State
- `s.warOrders: { answer, chestStones, lendBeast, reinforce, reinforceKeep, ally }` — one object per slot, applies
  to both sides (only the fields relevant to your current side are read/shown).
  - `answer: 'always' | 'defensive' | 'stay_out'` — member side. Default `'always'`.
  - `chestStones: number ≥ 0` — member side, stones to auto-donate to the war chest per war. Default `0` (off).
  - `lendBeast: 'never' | 'strongest'` — member side. Default `'never'`.
  - `reinforce: 'never' | 'if_affordable'` — own side. Default `'never'`.
  - `reinforceKeep: number ≥ 0` — own side, only reinforce if this many stones remain banked afterward. Default `200`.
  - `ally: 'never' | 'cheapest' | 'best'` — own side. Default `'never'`.
  - **Defaults match the PLAN.md table exactly**: `answer` is the only order that doesn't cost stones, so it
    defaults on; every stone-costing order defaults off/never. A new player is never charged for a war they didn't
    explicitly opt into.
- Carried across reincarnation (`_die()`), same as `s.settings` — standing orders belong to the player, not the life.
- Constants (`WAR_ORDER_*_OPTIONS`, `WAR_ORDERS_DEFAULT`) live in `assets/data/sect-war.js` (data only, per Rule 2).
- Migration: `_ensurePhase32Fields()` (called from `_recalc()`), same fill/reset-invalid pattern as `_ensurePhase20CFields()`.

### API (game-state.js)
- `getWarOrders()` → the current `s.warOrders` (or a fresh default object if no game is loaded).
- `setWarOrder(key, value)` → `{ ok, reason? }`. Reasons: `unknown` (bad key), `invalid` (bad enum value, or a
  negative/non-finite number for `chestStones`/`reinforceKeep`), `no_state`.

### Applying orders
- `_applyWarOrders()` runs from inside `_advanceSectWarStep()`, right after a war enters `'scouting'` **and** again
  right after it enters `'preparing'` — identically whether the tick is live or offline (`tickSectWar(false)` in
  `initSlot()`'s catch-up). It calls the exact same public commit methods a present player's buttons call
  (`answerWarCall()`, `donateWarChest()`, `sendBeastToWar()`, `requestWarAlly()`, `reinforceForWar()`) — no cost
  formula or mutation is duplicated. Two new internal helpers, `_warReinforceCost()`/`_warAllyCost()`, are shared
  by those public methods and by `_applyWarOrders()`'s own "if affordable" pre-checks, so there's exactly one copy
  of each formula.
- Because every commit method already guards its own precondition (`already`, room left, affordability), calling
  them from both `_applyWarOrders()` and a later manual click can never double-charge — the second call just gets
  `{ ok: false, reason: 'already' }` or a smaller/zero remaining room. This is *not* a new guard added for Phase 32;
  it's the existing 5C guards doing exactly what they always did, just now also invoked automatically.
- `chestStones` order: donates `min(order amount, chest room left, current Spirit Stones)` — it spends up to the
  order's cap, never more than you can afford, same semantics as a manual donation.
- `lendBeast: 'strongest'`: picks the highest-level idle (non-expedition) beast, if any.
- `ally`/`reinforce` (own side only, i.e. `ownSect.founded`): `ally` fires once per war cycle if not already allied
  and affordable; `reinforce` fires once during `'preparing'` if the cost can be paid *and* `reinforceKeep` stones
  would remain afterward.
- **Divergences from the PLAN.md table** (documented up front, not discovered later):
  - `answer: 'defensive'` behaves identically to `'always'` today. Phase 15 (NPC sect simulation) doesn't exist,
    so every member war is already "your sect being attacked" — there's no offensive/defensive distinction in the
    current model to hook a different behavior to. Kept as a separate enum value (not dropped) so a real
    attacker/defender concept (Phase 15, or the 5.5 sect-war upgrade) can give it distinct behavior later without
    a save-migration.
  - `ally: 'cheapest'` vs `'best'` also produce the same result today: `WAR_ALLY_COST_BASE`/`WAR_ALLY_POWER_BONUS`
    don't vary by which `SECTS` entry is asked. `'cheapest'` picks `SECTS[0]`, `'best'` picks the last entry —
    flavor only until sects have distinct power/cost (same Phase 15 dependency as above).

### UI
- `renderWarOrdersPanel(s, el, side)` in `game.js` — a "Standing Orders" section reusing the ⚙ Settings panel's
  `.set-row`/`.set-label`/`.set-seg`/`.set-opt` CSS (no new stylesheet needed) plus a small `.warord-input` number
  field. Shown in the member view (`renderSect()`, after `renderMemberWarPanel()`) with the member-side rows, and
  in the own-sect view (`renderOwnSect()`, after `renderSectWarPanel()`) with the own-side rows. Every control
  writes through `gameState.setWarOrder()`; the panel re-renders on the next `_notify()` like the rest of the tab.

### Invariants (Phase 32-specific; see the general list below for the rest)
- `s.warOrders` values are always one of the valid enum options (or a non-negative finite number for the two
  numeric fields) — `_ensurePhase32Fields()` resets anything else to default, same as settings.
- `sectWar.chestStones` never exceeds `MEMBER_WAR_CHEST_BASE + rank × MEMBER_WAR_CHEST_PER_RANK`, regardless of how
  many times an order or a manual click contributed to it.
- Resolution reward/penalty no longer depends on `seen` (only the `ignored` case does — see Member War Outcome
  above). `seen`/`warsUnseen` remain in state purely for UI wording and QA-sim reporting.

## Invariants
1. `phase` only advances forward (`none → scouting → preparing → none`); resolution always returns to `none` and reschedules.
2. Per-war fields (`allyId`, `reinforced`, `answered`, `chestStones`, `pillsGiven`, `beastId`, `seen`) are cleared when a new
   war's scouting phase begins, never mid-war.
3. Alliance and reinforcement can only be purchased once each per war cycle; answering and sending a beast only once each.
4. `arrayDamagedUntil` is only set on an own-side defeat, and only if `defensive_array` is built.
5. `side === 'own'` ⇔ `ownSect.founded`; `side === 'member'` ⇔ `sect.id` (checked by the QA sim).
6. War outcome is probabilistic: never a guaranteed win or loss.

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
- Answering the call is free (no mission-slot cost) by design — the user found the slot cost unwelcome friction on a
  system that's already time-gated by the 2h window; sect-mission scheduling stays independent of member wars.
- No real NPC sects exist yet (Phase 15 is unbuilt) — rival sects and allies are flavor/mechanic only; alliance is bought from the existing Phase 4 `SECTS` roster, not a relationship system.
- Offline catch-up relies on `tickSectWar()` being timestamp-based (`Date.now()` comparisons, no `dt` accumulation), so it fast-forwards correctly across any number of missed cycles in one `initSlot()` call.
- Member war numbers are first-pass (sim-checked for health and engagement, not hand-playtested).
- **Phase 32 known gap (found by the QA sim, not fixed this session):** an `afk` profile's member-war win rate and
  contribution/war still trail `active`/`casual` by more than the sim's 10% comparison band (see qa-sim.md), even
  with identical standing orders. Root cause: `tickSectWar(false)` (and its `_applyWarOrders()` call) runs inside
  `initSlot()`'s offline catch-up *before* pending Sect missions are resolved — those only resolve on the next live
  tick once `SectSystem.tick()` runs again. So a `chestStones` order fired during a long offline gap can see a
  thinner Spirit Stone balance than the player will have moments later, once mission income catches up. `casual`
  never closes the game, so it never hits this ordering gap. Fixing it would mean resolving pending sect missions
  during offline catch-up too (a broader change to `initSlot()`'s income ordering) — out of scope for this task.
- The event-log line for a resolved-while-away-but-engaged war ("Your standing orders acted in your stead.") only
  appears when `engaged` is true; an unseen loss with zero commitment still reads like a normal defeat line (no
  "acted in your stead", since nothing did) — see `_resolveMemberWar()`'s `awayNote`.
