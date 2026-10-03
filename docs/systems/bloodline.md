# Bloodline & Ascension — Reference
_Covers: bloodline.js · game-state.js (health/ascension/death) · events.js (inner_demon) · cultivation.js · Phase: 23A–C, 47 · Updated: 2026-10-03_

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
bloodlineQuality:  number  — 0–100 hard cap; shown once it is > 0 (from the 2nd life) or at Spirit Severing / after
                             an Ascension attempt. **Phase 46 (1.20a): it raises Qi/s** (`× (1 + BQ × BLOODLINE_QI_COEF)`,
                             **×2 at BQ 100** since Phase 47) as well as Ascension odds — the inherited head start that
                             replaced ancestral catch-up (see lineage-sect.md). **Phase 47 (1.21): it also gates the
                             Trial** — `attemptAscension()` is refused below `ASCENSION_MIN_BLOODLINE` (100), so
                             Immortality takes ~15 reincarnations, not ~4.
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
                         reasons: 'not_ready' (wrong stage), 'insufficient_qi',
                                  'bloodline_too_low' (Phase 47: BQ < ASCENSION_MIN_BLOODLINE — no roll, no death), 'died'
checkDeath(cause?)    → bool — PUBLIC. Call after anything that may have set health ≤ 0 outside this
                         file (currently: events.js via cultivation.js). Triggers _die() if health ≤ 0.
```
`attemptBreakthrough()` now returns `{ success:false, reason:'ascension_required' }` at the last mortal
stage (`CULTIVATION_STAGES.length - 2`) instead of rolling — callers must use `attemptAscension()` there.

## Phase 46 (1.20a) — Bloodline Quality raises Qi/s
Ancestral catch-up (`CATCHUP_QPS_MULT` / `CATCHUP_BT_BONUS` / the catch-up auto-breakthrough) was **removed**;
`BLOODLINE_QI_COEF` gives a named `Bloodline Quality` Qi/s term in `_recalc`, only when BQ > 0 (a first life shows
nothing). A stronger bloodline is the head start a reincarnated life carries, not a special catch-up function.

## Phase 47 (1.21) — the Trial requires the full bloodline; the long climb
Three linked changes (user 2026-10-03) turn the pre-Immortal game into a long bloodline climb (~15 reincarnations)
instead of a ~4-life gamble. There is **no post-Immortal content** — the game still ends at the first Immortality.
- **`ASCENSION_MIN_BLOODLINE = 100`** — `attemptAscension()` is refused below it (`reason: 'bloodline_too_low'`, no
  roll, no death). `ascensionBreakdown()` returns `req: { need, have, met }`, and the UI (the Character tile, the
  Trial overlay's lock note + refused button, the Ascension + Bloodline breakdown cards) explains the lock.
- **The bloodline can now reach the cap.** `BLOODLINE_CARRY_NEW_SOUL` 0.25 → **0.95**: a life keeps nearly all its
  bloodline, so it accumulates toward 100 instead of plateauing near ~19. The per-life growth terms were reduced
  (`BLOODLINE_G_PARTNER` 5 → 2.5, `BLOODLINE_G_HEIR` 4 → 2.5, `BLOODLINE_G_TRAUMA_HEIR` 2 → 1), so each life adds
  less and the increments shrink as BQ nears 100 — ~15 full lives for a clan player, ~18+ for an orphan (which has
  no spouse/heir term).
- **`BLOODLINE_QI_COEF` 0.004 → 0.01**: +1% Qi/s per point, **×2 at BQ 100** (was +0.4%, +40%).
The Ascension odds formula is unchanged, so at BQ 100 the Trial is a fixed ~73% (7% base + 60% bloodline + 6% prep):
the climb, not the roll, is now the cost. The sim bot **Passes the Mantle** at the last mortal stage while BQ < 100
(`bot.tryAscension()`), which is now the loop that grows the bloodline.

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
3. Bloodline growth only happens in `_die()` (on any death, including a failed Ascension). Since Phase 31 (2.7d) /
   Phase 40 a **successful** Ascension also ENDS the life (the Ascended Ancestor + the 40b finish screen), so it
   grows the bloodline exactly like any other death — it no longer leaves the character idling at the stub stage.
4. `stats.ascensionAttempts`/`stats.ascensions` are per-life (reset by `_newGame()` on reincarnation) — the
   Stats tab BQ reveal and the sim's report both intentionally read them differently: the UI reads current
   life's count (gates the "was BQ ever revealed this life" flavor), the sim report sums `actions.ascend`
   across the whole run for a cumulative attempts count.
5. Phase 47: `attemptAscension()` below `ASCENSION_MIN_BLOODLINE` returns `bloodline_too_low` **without** rolling,
   claiming any first, or ending the life — so the gate can never kill you.

## Gotchas
- The sim's dead-zone / stage-wall / "progression stalls" metrics are **not generation-aware**:
  `Recorder.stageReached`/`maxStage` are monotonic across the whole run, so a bot that dies and re-climbs
  from stage 0 in generation 2 doesn't register as "new progress" until it passes generation 1's old max
  stage. Expect false-looking "stuck at stage N" / long dead-zone flags on any profile that reincarnates
  mid-run — check `runs[i].lineage.generation` before concluding the bot is actually stalled.
- **Phase 47 supersedes the old "2–5 reincarnations" pacing.** The Trial is now gated on BQ 100, so the number of
  lives is set by the climb; the odds curve (`ASCENSION_BASE_CHANCE=0.07`, `ASCENSION_BQ_COEF=0.006` → a fixed ~73%
  at BQ 100, cap 0.95) only decides how often the final attempts fail. Every knob is single-source in bloodline.js —
  re-run `npm run sim` before changing the curve. The bot Passes the Mantle below 100 (it has no other way to grow
  BQ), so a short sim shows no `ascend` action and many `passed_mantle` lives — expected, not a stall.
- **A successful Ascension is the end of the game** (user 2026-10-03): the life ends, the 40b finish screen plays, and
  there is deliberately **no post-Immortal content** to build (the `ascension` stage stub is never really played).
  After the finish screen the existing rebirth / Soul-Points flow continues, but the "race to immortality" is over.
- No new sprite states were added — 'ascension' stage already had `spriteState:'transcending'`.
