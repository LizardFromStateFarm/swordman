# Bloodline & Ascension — Reference
_Covers: bloodline.js · game-state.js (health/ascension/death) · events.js (inner_demon) · cultivation.js · Phase: 23A–C · Updated: 2026-09-25_

Replaces the old "reach the last stage → ascend automatically" ending with a body that can die, a hidden
family stat that grows across lives, and a real gamble at the top of the mortal ladder. Scope this pass:
**23A (Health & Death) + 23B (Bloodline Quality) + 23C (Ascension Trial)** only. 23D (Immortal Realms
content) and 23E (Secret Arts) are NOT built — a successful Ascension still lands on the same single
`ascension` stage stub as before (infinite Qi cap, nothing to spend it on). Family reincarnation (23D's
"reincarnate into your child") needs Phase 16/18 and isn't built either — every death today is a "new soul"
(`BLOODLINE_CARRY_NEW_SOUL`).

## State
```
health:            number  — 0–100, the body (separate from realmIntegrity, which is the cultivation)
_healthRegenAcc:   number  — regen accumulator, +HEALTH_REGEN_AMOUNT every HEALTH_REGEN_SECONDS
maxStageThisLife:  number  — highest stageIndex reached in the current life; feeds bloodline growth on death
bloodlineQuality:  number  — 0–100 soft cap; HIDDEN from the player until stats.ascensionAttempts > 0 this life
generation:        number  — 1-based; +1 each reincarnation
deaths:            number  — lifetime count across all reincarnations in this save
ascended:          bool    — true once stageIndex reaches the top ('ascension' stage)
lastReincarnation: object|null — { cause, maxStageReached, generation, parentBloodlineQuality,
                                    newBloodlineQuality, ts } — set by _die(), used by the UI's death overlay
stats.ascensionAttempts: number — PER LIFE (resets to 0 on reincarnation) — gates the BQ reveal in Stats tab
stats.ascensions:        number — PER LIFE — count of successful Ascension Trials this life (0 or 1 in practice)
```

## API (game-state.js)
```
ascensionChance()     → number, 0–0.95 — base + bloodlineQuality×coef + prep (full Integrity/Health bonus)
attemptAscension()    → { success, chance, newStage } | { success:false, reason, chance? }
                         reasons: 'not_ready' (wrong stage), 'insufficient_qi', 'died'
checkDeath(cause?)    → bool — PUBLIC. Call after anything that may have set health ≤ 0 outside this
                         file (currently: events.js via cultivation.js). Triggers _die() if health ≤ 0.
```
`attemptBreakthrough()` now returns `{ success:false, reason:'ascension_required' }` at the last mortal
stage (`CULTIVATION_STAGES.length - 2`) instead of rolling — callers must use `attemptAscension()` there.

## Data Shape (bloodline.js)
All constants, no logic. Grouped by sub-phase (23A health/damage, 23B bloodline growth, 23C ascension
curve) — see the file's own comments for current values and what each one tunes.

## Wiring
- `game-state.js` `tick()` / `initSlot()` offline catch-up: passive health regen (mirrors realmIntegrity).
- `resolveExpedition()`, `_resolveSectWar()`, `_resolveMemberWar()`: roll a chance of injury (health
  damage) on an outclassed zone or a war loss you personally fought in (`engaged` for member wars); each
  ends with `if (health ≤ 0) this._die(cause) else this._recalc(); this._notify()` — **never** call
  `_die()` and then keep mutating the old `s`/`w` locals, they're stale after `_die()` reassigns `this._s`.
- `events.js` `inner_demon` (Nascent Soul+): damages health inline; `cultivation.js` `_trigger()` calls
  `this.gs.checkDeath('event')` after every event (cheap no-op if health > 0).
- `game.js`: breakthrough button relabels to "Ascension Trial" at the last mortal stage and opens
  `#ascension-overlay` instead of calling `attemptBreakthrough()` directly. A `subscribe()` watcher
  diffs `s.lastReincarnation.ts` every notify and pops `#death-overlay` on change — this is how death from
  ANY cause (expedition/war/event/ascension, sync or via offline catch-up) reaches the UI, not a return
  value from one call site.

## Invariants
1. `health` always 0–100; `bloodlineQuality` always 0–`BLOODLINE_CAP`; `generation` never < 1.
2. `_die()` is the only place `this._s` is reassigned mid-life — every caller that might trigger it must
   either check-and-return immediately after (see Wiring) or not touch `s`/local destructures afterward.
3. Bloodline growth only happens in `_die()` (on any death, including a failed Ascension). A **successful**
   Ascension does NOT grow bloodline or reincarnate — the save just continues at the `ascension` stage
   (23D's "passing on the line" choice needs an heir mechanism that doesn't exist yet).
4. `stats.ascensionAttempts`/`stats.ascensions` are per-life (reset by `_newGame()` on reincarnation) — the
   Stats tab BQ reveal and the sim's report both intentionally read them differently: the UI reads current
   life's count (gates the "was BQ ever revealed this life" flavor), the sim report sums `actions.ascend`
   across the whole run for a cumulative attempts count.

## Gotchas
- The sim's dead-zone / stage-wall / "progression stalls" metrics are **not generation-aware**:
  `Recorder.stageReached`/`maxStage` are monotonic across the whole run, so a bot that dies and re-climbs
  from stage 0 in generation 2 doesn't register as "new progress" until it passes generation 1's old max
  stage. Expect false-looking "stuck at stage N" / long dead-zone flags on any profile that reincarnates
  mid-run — check `runs[i].lineage.generation` before concluding the bot is actually stalled.
- First-pass tuning (proposed by the user, not yet re-balanced): `ASCENSION_BASE_CHANCE=0.07`,
  `ASCENSION_BQ_COEF=0.006` (cap +60% at BQ100), cap 0.95. `npm run sim` (2026-09-25) shows this makes
  Ascension a real gamble — most attempts fail at low BQ, driving 2–5 reincarnations before survival on
  longer horizons. Whether that pacing (often a full mortal-realm replay, 30–90h, per failed attempt) is
  fun or too punishing is an open call — re-run the sim with `--set` before changing the curve.
- A successful Ascension still dead-ends into the old `ascension` stage stub (infinite qiCap, nothing to
  do) — this is the accepted, documented scope boundary for this pass, not a bug. The sim's "Content
  exhausted" flag past ~70h+ on `active` is expected until Phase 23D is built.
- No new sprite states were added — 'ascension' stage already had `spriteState:'transcending'`.
