# QA Sim Harness — Reference
_Covers: scripts/sim/* · package.json (`sim`, `sim:quick`) · Phase: tooling (+5C member-war metrics) · Updated: 2026-09-25_

Bots play the **real** game logic (no copies, no mocks of game code) at thousands× speed and write a short
report on pacing, fun/engagement signals, health (errors + invariants) and performance.

## Agent quick use (low context)
```bash
npm run sim            # full suite: active,casual,afk × 50,100,200h × 3 seeds  (~15s on 16 cores)
npm run sim:quick      # smoke: active,afk × 24h × 1 seed (~1s)
npm run sim -- --profiles=casual --hours=100 --seeds=5 --set="WAR_MIN_INTERVAL_HOURS=1"
npm run sim -- --help  # all flags (scripts/sim/USAGE.txt)
```
Read **only** `scripts/sim/out/report.md` (~60 lines). Open `report.json` only to dig into one run
(`runs[i].stageTimes`, `.milestones`, `.actions`, `.economy`, `.health`). Exit code 0 = healthy, 1 = errors or
invariant violations, 2 = harness crashed / bad `--set`.

**Balance loop:** run → read flags → try a change with `--set` (no file edits) → re-run → only then edit
`assets/data/*`. Same seed ⇒ byte-identical results, so before/after diffs reflect the change, not luck.

## Files
| File | Role |
|---|---|
| `run.js` | CLI, session model (open/close/reopen), per-run loop, parallel worker pool (`--jobs`, default cores−1) |
| `loader.js` | Loads data + `game-state.js` + `game/*.js` into a `vm` context with fake `Date`, seeded `Math.random`, in-memory `window.electron` (saves are JSON strings → every load is a real round-trip). Includes `NotificationSystem` (Phase 9B) — its default `isWindowActive => true` means it always gates closed here, so this is a load/no-throw check, not a behavior test (docs/systems/notifications.md) |
| `bot.js` | Greedy rule-based player; only calls public `gameState` methods |
| `metrics.js` | `Recorder`: timeline, milestones, fun signals, invariants, errors → plain-JSON result |
| `report.js` | Aggregates seeds (median + min–max), generates ⚠ flags, renders markdown |
| `profiles.js` | **Tuning knobs**: player profiles, flag thresholds, pacing targets |
| `rng.js` | mulberry32 seeded PRNG |

## Profiles (profiles.js)
- `active` — overlay always open, acts every 10s (min-maxer; upper bound on pace)
- `casual` — overlay always open, acts every 30 min (the realistic "idle on the side of the screen" player)
- `afk` — opens 15 min, closed 8h → exercises `initSlot()` offline catch-up, 8h cap, war fast-forward
- `--path=founder|member` — founder leaves its sect to found one as soon as it can; member never founds.
  Founder bots usually found before their first call (~10h after joining at rank 0).
- **War Standing Orders (Phase 32):** every bot sets orders once, on its very first `checkIn()` (`Bot.warOrders()`):
  answer always, chest 50 stones/war, lend the strongest idle beast, reinforce if it keeps ≥300 banked, cheapest
  ally. Values are deliberately modest ("reasonable, not optimal" — see Gotchas below), not maxed, so they don't
  starve `founder`'s stone-for-founding budget. `memberWar()`/`war()` (the old manual click logic) only run for
  `profile === 'active'` now — `casual`/`afk` rely entirely on the orders they set, by design, so the sim actually
  exercises the "never punish absence" path instead of a bot that manually clicks every button regardless of
  profile. `active` still clicks manually on top of its own orders (proving the no-double-charge guarantee).

## Report sections / metrics
- **Summary** per horizon×profile: final stage, breakthrough success, worst fail streak, longest dead zone,
  meaningful actions per open hour (meditate excluded), % time Qi sat at cap, stones at end, own-sect wars W/L
  (present %) — "present" (formerly "seen") is a descriptive stat only since Phase 32; it no longer implies
  the war's reward/penalty was gated on it.
- **Time to reach**: realm entries + key milestones (median hours; `k/n` if only some seeds got there).
- **Pacing vs GAMEDESIGN.md**: per realm, unboosted idle minutes to fill the Qi cap (qiCap ÷ the stage's
  time-averaged Qi/s) vs `PACING_TARGETS_MIN` in profiles.js. Flag only for `PACING_PROFILE` (casual), and
  only when >2× outside the band. Tuning recipe used 2026-09-25: newCap = cap × target ÷ measured fill,
  via `--set`, 2–3 iterations to converge (multipliers shift as later stages arrive at different times).
  **Retuned 2026-09-26 (M2 task 2.4, life-loop.md §6):** bands tightened for FB/CF/NS/SS (FB 15–30m,
  CF 30–60m, NS 45–90m, SS 60–120m — was 20–45/60–180/180–480/480–1200) now that the Phase 30 game clock
  ends a casual life by old age, so a casual mortal life needs to clear these realms much faster to stay
  in the 10–20h life-length band instead of dying of old age around Core Formation. See life-loop.md §13.
- **Life Loop pacing (Phase 30/M2 task 2.4)**: median per-life open-hours per profile (from the "Life Loop"
  section) vs `LIFE_TARGETS_H` in profiles.js (`casual.gen1 [10,20]`, `active.gen1 [5,15]`) — flags if a
  profile's median life falls outside its band. `later` (post-catch-up generations), `FIRST_ASCENSION_H`
  and `GENERATIONS_TO_ASCEND` are defined but **not yet checked** — they need tasks 2.5–2.8's ancestral
  catch-up/generation continuity to mean anything (every death today is a fresh soul, no carry-over).
- **Member Wars** (Phase 5C, updated by Phase 32): joined-sect wars per profile — count, W/L, "present for" (% of
  calls the bot's own check-in cadence overlapped an open war phase — a presence stat, not a reward gate), ignored
  (present, but left uncommitted — usually an explicit `stay_out` order), unseen (resolved while the game was
  closed — a count only, no longer a penalty case), contribution net. Tallied per side by `Recorder.trackWars()`
  (diffs `sectWar` counters each tick, so a founder's pre-founding member wars aren't mixed into its own-sect wars).
  `runs[i].wars` = own side, `runs[i].memberWars` = member side.
- **Afk/casual-vs-active war parity (Phase 32):** a dedicated check (not per-profile-group like the flags above)
  compares each non-active profile's member-war win rate and contribution/war against `active`'s, in the longest
  horizon, and flags a `>10` point win-rate gap or `>10%` contribution/war gap — this is the sim's actual test of
  "standing orders get afk/casual a comparable outcome to active", replacing the old presence-based flags (below).
  No-ops when `active` has zero member wars in that run (e.g. `founder` path, where active founds its own sect
  almost immediately and never sees a member war to compare against — use `--path=member` to exercise this check).
- **Ascension & Bloodline** (Phase 23A–C): ascension attempts (cumulative `actions.ascend`, not the per-life
  `s.stats.ascensionAttempts`), whether it ever succeeded, generations, lifetime deaths, end-of-run Bloodline
  Quality, deaths by cause. `runs[i].lineage`. See `docs/systems/bloodline.md` gotchas — the dead-zone/stage-wall
  metrics are NOT generation-aware, so a mid-run reincarnation can produce a misleading "stuck at stage N" flag.
- **Slowest stage-ups**: top 3 stage transitions per profile.
- **⚠ Flags** (thresholds in `THRESHOLDS`): dead zone, difficulty wall (stage ≥4× previous and ≥1h; afk ignores
  waits ≤1.5 sessions), progression stalls, content exhausted, qi-capped %, frustration (fail streak),
  demotions, integrity waiting, hoarding, low engagement, member wars ignored, never-used features, afk/casual
  member-war parity vs active (Phase 32, see above).
  **Retired 2026-09-26 (Phase 32):** "own/member wars mostly resolve unseen: player checked in during only X%" —
  presence no longer gates a war's outcome (own-side never did; member-side doesn't since this phase), so a low
  "present %" isn't a problem to flag any more. The stat itself stays in the tables. The "member wars ignored"
  flag's wording changed to reflect the new cause (a `stay_out` order or genuinely zero commitment while present),
  not the old removed mission-slot friction.
- **Health**: exceptions (deduped, with stack) + invariant violations + save→load round-trip count.
- **Economy — Spirit Stones**: a ledger attributes every stone gained/lost to a source (disciples, expeditions,
  beast_expeditions, sect_missions, events, war_spoils, war_losses, offline_catchup) or a bot purchase
  (learn_technique, build, war_ally, …). Self-checked: start + Σ ledger must equal end, else a
  `stone_ledger_mismatch` violation. Flags: hoarding (bank > `hoardStones` AND > `hoardBankHours` of end-game
  income), economy-is-a-tax (war losses > `involuntarySinkPct` of outflow), one-faucet (a source > `singleSourcePct`).
- **Performance**: avg/worst `gameState.tick()+systems` µs vs 16.7ms frame budget; sim speed. Includes the
  ledger's own bookkeeping (~+6µs), so treat it as an upper bound. Use `--jobs=1` for clean numbers.

## Invariants checked (every sim minute + every reopen)
Non-finite numbers anywhere in state (except `derived.qiCap` at Ascension) · qi <0 or > cap · stones <0 ·
inventory counts not positive integers · integrity ∉ [0,100] · karma ∉ [0,100] · breakthrough chance >0.98 ·
stageIndex out of range · beasts > maxBeasts · disciples > cap · invalid war phase · sect rank out of range ·
joined AND founded · war side ≠ joined/founded state · war-committed mission slot over cap or not released after
the war · beast stuck at war · save round-trip changes stage/techniques/equipped/root/beasts/sect · offline lowers qi ·
health ∉ [0,100] · bloodlineQuality ∉ [0, BLOODLINE_CAP] · generation < 1 · `settings_invalid` (any `s.settings` value not valid for its `SETTINGS_DEFS` entry) · `personality_invalid` · `banter_buffer_over_cap` · `banter_pool_holes` (content check once per run: every personality × trigger meets `BANTER_MIN_LINES`) · `war_orders_invalid` (Phase 32: any `s.warOrders` value not one of its `WAR_ORDER_*_OPTIONS`, or a negative `chestStones`/`reinforceKeep`) · `war_chest_over_cap` (Phase 32: `sectWar.chestStones` exceeds `MEMBER_WAR_CHEST_BASE + rank × MEMBER_WAR_CHEST_PER_RANK`, whether an order, a manual click, or both filled it — proves no double-charge) · `war_pills_over_cap` · `item_category_invalid` (Phase 21: every `ITEMS[id].category` must be one of `currency|mat|pill|equip|rare|key`, checked once per run). The sim also runs `BanterSystem` (source `banter`, 0 stones).

## Extending
- **New system/phase:** add bot behaviour in `bot.js` (new method + add to the `checkIn` chain), new
  milestones in `Recorder.slow()`, invariants in `checkInvariants()`, feature id in `report.js FEATURES`.
- **New data file:** add it to `DATA_FILES` in `loader.js` (same order as `renderer/index.html`).
- **New logic file in renderer/game/:** add to `LOGIC_FILES` and to the `systems` array (tick order = game.js).

## Gotchas
- **`OFFLINE_QI_MULT` (lifespan.js) left at 1.0 (M2 task 2.4).** The "is afk trivially easy" check is NOT
  afk's open-hours vs casual's open-hours (afk's bottleneck is one breakthrough per 15-min reopen window,
  so it's insensitive to this multiplier well before Qi-cap fill time matters) — it's afk's **wall-clock**
  hours (which `rec.t` counts through closures too) vs casual's **open** hours to the same milestone. Measured
  107.3h wall (afk) vs ~19.5h open (casual) to a first Ascension attempt — afk is far slower in real time, so
  no throttle was applied. The multiplier is wired into `initSlot()`'s offline Qi credit either way, as a
  documented no-op, for a future task to turn without another code change. See life-loop.md §13.
- Bot quality bounds the insight: "never used X" can mean the bot doesn't know X — check `bot.js` first.
  The bot is deliberately *reasonable*, not optimal (e.g. refuses breakthroughs at ≤20 integrity without a pill).
- `loader.js` rewrites top-level `const` → `var` in **data files only** so `--set` can reassign constants.
- Game code must keep using `Date.now()` / `Math.random()` (not `performance.now()`, `crypto`) or the sim
  loses determinism/time control. `game.js` (UI) is never loaded — UI-wiring bugs need a Playwright pass.
- dt defaults to 1s (real game caps frame dt at 2s). Random-event and integrity timers are dt-accumulated.
- A system that resets `this._s` mid-run (Phase 23's `_die()` reincarnation) needs its own dedupe in
  `Recorder.sample()` (a timestamp diff, see `_lastDeathTs`/`deathsByCause`) — `stageReached`/`maxStage` don't
  reset on it, so existing progress-timeline metrics silently stop reflecting reality after a reset (see
  `docs/systems/bloodline.md` gotchas). Any future full-state-reset feature should read that pattern first.
