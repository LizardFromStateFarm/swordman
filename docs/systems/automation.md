# Active / Idle Mode + Automation — Reference
_Covers: automation.js (data) · game-state.js (mode + automation dispatch, `_tickAutomation`, `attemptBreakthrough`/`craftItem` opts) · renderer/game/crafting.js (watched flag) · game.js (mode button, Automation panel, Push Harder, breakthrough focus window, Master's Touch) · Phase: 22 · Updated: 2026-09-26_

Pillar 4 (never punish absence): **Idle Mode is the default, first-class way to play.** Automation unlocks
progressively as you cultivate, so an idle/afk player's progress compounds without any manual attention.
**Active Mode is an optional bonus for attentive players, not a requirement** — it trades all automation for
modest timer reductions and click-timed bonuses. Nothing in Active Mode is stronger than idle+automation over
the same wall-clock time; it only front-loads progress for players who are actually watching.

## State
```
playMode: 'idle' | 'active'     — per slot, persists across sessions and reincarnation (own field, NOT
                                   s.settings — it changes game balance, and settings.md invariant #2 says
                                   settings must never do that).
automation: {
  autoExplore:        bool            — relaunches the last manually-chosen expedition location on return
  autoExplorePaused:  { [locId]: true } — per-location opt-out (Explore tab toggle)
  lastExploreLocationId: string|null  — set by every startExpedition() call, manual or automated
  autoSectMissions:   bool            — re-queues the same mission type when a slot frees up
  autoCraft:          bool            — master switch; per-recipe toggle below gates which recipes repeat
  autoCraftRecipes:   { [recipeId]: true } — recipes flagged to auto-repeat whenever materials allow
  autoBreakthrough:   bool            — attempts a breakthrough once Qi crosses the threshold below
  breakthroughThreshold: number       — 0.80–1.00 fraction of qiCap (slider, Automation panel)
  _craftAcc: number                   — internal throttle accumulator (not player-facing)
}
```
`s.expedition.pushed: bool` (new field) — Active Mode's one-time Push Harder purchase for the current expedition.

## API (game-state.js)
```
setPlayMode(mode) → { ok, reason? }                       reason: invalid
setAutomation(key, value) → { ok, reason? }                keys: autoExplore/autoSectMissions/autoCraft/
                                                            autoBreakthrough (bool) or breakthroughThreshold
                                                            (number). reason: unknown/invalid/locked
setAutoExplorePaused(locationId, paused) → { ok }
setAutoCraftRecipe(recipeId, enabled) → { ok }
automationUnlocked(key) → bool                             checked against AUTOMATION_UNLOCKS + live state
pushExpedition() → { ok, reason? }                          reason: not_active/no_expedition/already/too_early/stones
attemptBreakthrough({ minQiFrac?, focusBonus? } = {})       minQiFrac defaults 0.90 (unchanged manual behavior);
                                                            focusBonus adds ACTIVE_BT_FOCUS_BONUS for one roll
craftItem(recipeId, { watched? } = {})                     watched + Active Mode + roll → Master's Touch double
```

## Data Shape (assets/data/automation.js)
`AUTOMATION_UNLOCKS`: `{ autoExplore: {stageIndex, label}, autoSectMissions: {sectRank, hallLevel, label},
autoCraft: {stageIndex, label}, autoBreakthrough: {stageIndex, label} }`. `stageIndex` values are the actual
indices into `CULTIVATION_STAGES` for the named realm/layer today (Core Formation Early = 13, Nascent Soul
Early = 16, Spirit Severing Early = 19) — **not** the raw numbers in PLAN.md's Phase 22 draft table, which
predate the realm's current `qiCap` tuning pass and drifted from the actual stage list. `sectRank: 3` = Elder
(`SECT_RANKS[3]`, matches the spec's "rank 4" 1-based count). Retune all of these here when M2 task 2.4
compresses mortal-life pacing — nothing else hardcodes a stage index for automation.

`ACTIVE_*` constants: expedition/sect-mission time multipliers, breakthrough Qi-loss-on-fail bonus, Push
Harder cost/window, breakthrough focus window/bonus, craft Master's Touch chance/window.

## Wiring
- Mode button `#btn-mode` (titlebar, between ◀ and ⚙) → `gameState.setPlayMode()`. Orange `.mode-active`
  class in Active Mode (spec requirement — "unmistakable").
- `renderAutomationPanel(s, el)` (game.js) — shared by `renderExplore()`, and both branches of `renderSect()`
  (joined-sect view + `renderOwnSect()`). Lists all 4 automations: unlocked → ON/OFF (`.set-seg`/`.set-opt`,
  reused from settings.md/sect-war.md's Standing Orders panel, zero new CSS); locked → unlock hint. Shows the
  breakthrough-threshold slider inline once Auto-Breakthrough is ON. In Active Mode shows an inert notice
  instead (automation toggles do nothing there, per spec).
- Per-location pause toggle: Explore tab location rows (`.pack-chip`, reused). Per-recipe auto toggle: Craft
  tab recipe rows (`.pack-chip`, reused).
- Auto-Explore fires from `resolveExpedition()` (`_maybeAutoExplore()`), live AND during `initSlot()` offline
  catch-up (see Offline Catch-Up below). Auto-Sect-Missions fires from `resolveSectMission()`
  (`_maybeAutoSectMission()`), **live only**. Auto-Craft and Auto-Breakthrough are ticked every frame inside
  `tick(dt)` → `_tickAutomation(dt)` (throttled to `AUTO_CRAFT_CHECK_SECONDS` for craft), **live only**.
- Every automation-driven action calls the same public method a manual click would (`startExpedition`,
  `startSectMission`, `craftItem`, `attemptBreakthrough`) — no duplicated logic (Rule: game-state is the only
  mutator) — then adds a `[Auto] …` prefixed `s.events` line and emits `this._emit('auto_fire', { system })`
  for the sim's Recorder (see qa-sim.md).

## Offline Catch-Up (pillar 4 implications)

- **Injury guard (orchestrator review fix):** Auto-Explore will not relaunch into a zone that outclasses you (injury risk, 23A) while health < `AUTO_EXPLORE_MIN_HEALTH_OUTCLASSED` (60). Without it, the offline chain (up to 50 cycles) could walk a wounded cultivator to death while the game was closed. When it trips, Auto-Explore stops until the player launches manually.

- **Auto-Explore**: fast-forwards through the whole offline gap. `initSlot()` now loops (bounded, 50 max,
  mirroring `tickSectWar`'s own bounded loop) while the expedition is active and past its `endsAt`, resolving
  and — if auto-explore is on — relaunching, **chaining the new `endsAt` off the just-missed one** (`prevEndsAt
  + duration`) rather than off `Date.now()`. Without this chaining trick a relaunch's timer would anchor to
  real "now" and only ever resolve once per login, same as expeditions already worked pre-Phase-22. When
  auto-explore is off, the loop body runs exactly once, identical to the old behavior.
- **Auto-Sect-Missions is live-only.** Sect missions (Phase 4) have never fast-forwarded during offline
  catch-up at all — `SectSystem.tick()` only runs in the live rAF loop — so a mission that completes while
  the game is closed just sits until the next live tick, automation or not. This is a pre-existing gap, not
  one Phase 22 introduces; fixing it (simulating the whole mission queue offline) is out of this task's scope.
  Practically: an afk player's missions still queue up and pay out promptly on next login; they just don't
  literally re-queue *during* the closed period.
- **Auto-Craft and Auto-Breakthrough are live-only.** Crafting has no time cost and depends on materials that
  themselves aren't bulk-simulated offline (only a single expedition/mission resolves at login); breakthroughs
  change `qiCap`/`qps`, and the game has never simulated stage advancement during offline catch-up (only a
  flat Qi gain, capped at 8h) — building either would be a much larger change than this task. Neither is a
  new absence-punishing gap: today, offline play already only ever grants Qi, not stage-ups, automation or not.

## Active Mode (22C)
- Timers: `startExpedition`/`startSectMission` apply `_activeTimeMult('expedition'|'sect_mission')` — ×0.65 /
  ×0.75 respectively, only when `playMode === 'active'`.
- Breakthrough Qi-loss-on-fail: an extra `ACTIVE_BT_QI_LOSS_BONUS` (0.10) is added to the kept fraction in
  Active Mode, on top of any pill's `qi_loss_reduce`.
- **Push Harder**: button appears in the Explore tab's expedition status block once the timer is within the
  last `ACTIVE_PUSH_HARDER_WINDOW_FRAC` (20%) of its duration, Active Mode only, once per expedition. Spends
  `ACTIVE_PUSH_HARDER_COST` (10) stones, sets `s.expedition.pushed = true`; `resolveExpedition()` rolls the
  drop table a second time and merges it in.
- **Breakthrough focus window**: game.js tracks (client-side only, not persisted) the moment
  `derived.canBreakthrough` flips to true while in Active Mode; the Breakthrough button pulses (`.bt-focus`)
  for `ACTIVE_BT_FOCUS_WINDOW_SECONDS` (3s). Clicking within that window passes `{ focusBonus: true }` to
  `attemptBreakthrough()`, adding `ACTIVE_BT_FOCUS_BONUS` (0.05) to that one roll only. Missing the window: no
  penalty, just no bonus — matches spec exactly.
- **Master's Touch (craft)**: game.js tracks the last time the Craft tab was rendered/clicked
  (`_craftTabViewedAt`, client-side). A craft click within `ACTIVE_CRAFT_TOUCH_WINDOW_SECONDS` (60s) of that
  passes `{ watched: true }`; in Active Mode this rolls an independent `ACTIVE_CRAFT_TOUCH_CHANCE` (10%) chance
  to double output (skipped if the sect's own double-craft chance already procced, so a craft is never tripled).
- Automation toggles are visually inert (Automation panel shows a notice) and functionally inert — every
  dispatch point checks `s.playMode === 'idle'` before firing, so flipping to Active Mode with automation
  switches still "on" from before does nothing until you flip back.

## Invariants
1. `s.playMode` is always `'idle'` or `'active'` (`_ensurePhase22Fields`, sim invariant `play_mode_invalid`).
2. `s.automation.breakthroughThreshold` is always within `[AUTO_BREAKTHROUGH_THRESHOLD_MIN,
   AUTO_BREAKTHROUGH_THRESHOLD_MAX]`; the four boolean toggles are always booleans.
3. `setAutomation(key, true)` refuses (`reason: 'locked'`) unless `automationUnlocked(key)` — a toggle can
   never be switched ON before its unlock condition. Every dispatch point (`_maybeAutoExplore`,
   `_maybeAutoSectMission`, `_tickAutomation`) independently re-checks `automationUnlocked()` again right
   before acting, so an automation can never actually *fire* while locked — see the Gotcha below about why
   the enabled flag itself can still read true after re-locking.
4. No automation dispatch point ever mutates state directly — each calls the same public method a manual
   click uses, so every existing invariant on that method (ingredient checks, stage checks, caps) still holds.
5. Only one of `s.expedition.pushed` can be true per expedition; it resets to `false` on every
   `startExpedition()` call (manual or auto-relaunched).

## Gotchas
- **Re-locking isn't retroactively enforced.** `setAutomation` blocks turning something on before it's
  unlocked, but nothing turns a toggle back off if you later lose the unlock condition (a realm demotion
  below an auto-craft/-breakthrough/-explore stage threshold, or — observed constantly in the sim's
  `founder` path — leaving a joined sect to found your own, which zeroes `sect.rank` and starts
  `ownSect.hallLevel` at 1, re-locking `autoSectMissions` even though it had unlocked via rank earlier).
  This is harmless: every dispatch point re-checks `automationUnlocked()` at fire time, so a "locked but
  still flagged on" toggle just sits inert until the condition is met again. Because this is a normal,
  frequent state transition (not a bug), the sim does **not** carry a runtime invariant comparing the
  enabled flag against the live unlock condition — it would false-positive on exactly this case. The real
  guarantee (never fires while locked) is enforced entirely in code, at both `setAutomation()` and every
  dispatch point; see Invariant 3 above.
- **PLAN.md's Phase 22 draft table stage numbers don't match the current `stages.js`.** See Data Shape above —
  use `AUTOMATION_UNLOCKS` as the source of truth, not the original design text.
- Auto-Breakthrough deliberately **excludes the Ascension Trial** (the last mortal stage). That transition is
  a permanent-death gamble with its own confirmation overlay (`attemptAscension()`, Phase 23C) — automating it
  would remove the one deliberate manual checkpoint the game already has for a life-ending decision. `_tickAutomation`
  explicitly skips the last-mortal `stageIndex`.
- The Automation panel is duplicated in both Explore and Sect tabs (and `renderOwnSect()`) by design, per the
  22D spec — it's meant to be a visible roadmap wherever a player might be looking, not a single settings page.
- `craftItem`'s new `opts` param is additive/optional — every existing call site (Craft tab, Pack tab, bot.js,
  automation dispatch) that doesn't pass `{ watched: true }` behaves exactly as before Phase 22.
- `attemptBreakthrough`'s new `opts.minQiFrac` defaults to 0.90, identical to the pre-Phase-22 hardcoded
  `derived.canBreakthrough` gate — manual breakthrough clicks are unaffected. Only the internal
  auto-breakthrough dispatch passes a different value (the slider's `breakthroughThreshold`), which is why the
  slider's 80–100% range does something even though the manual UI button stays disabled below 90%.
- **Side-fix (same task):** `initSlot()`'s offline catch-up now resolves any pending Phase 4 sect missions
  *before* `tickOwnSect`/`tickSectWar(false)`, fixing the gap flagged in sect-war.md/PLAN.md where a Standing
  Orders `chestStones` donation during offline catch-up could see a stale Spirit Stone balance (missions used
  to only resolve on the next live tick, after the war fast-forward already ran). See sect-war.md.
