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
npm run checks         # scenario checks: exact rules, ~5s (see "Scenario checks" below)
npm run checks -- tournament   # only files whose name matches
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
- **Family (Phase 16-lite, M2 task 2.5):** every profile runs `Bot.family()` second in the `checkIn` chain (after
  nothing — `twilight()` was removed with old age on 2026-09-26): a pending proposal → `acceptSuitor()` of the highest powerScore (stage×100 + root mult×10). Never declines.
  **Family depth (family.md):** a pending duel → fight at ≥ 60% odds, else flee; a marriage event → `active` picks the choice its
  spouse likes most, `casual`/`afk` pick randomly (exercises the crisis pool); crises → forgive / beg; lover encounters →
  seduce 25%, else leave; never ends an affair.
- **Children (2.6b):** the bot sets Family Planning once per life (active 'some', casual/afk 'many'; was once per
  *run* until 2.6d — later lives silently fell back to 'many') and answers child events
  (active: the choice that child likes most, always fetches a runaway; casual/afk: random via `this.rand()`). A
  "Children" report table follows Family (born, strongest child's stage, mean bond/morality, events, runaways).
- **Succession (2.6c):** a running tournament is fought strongest-vs-weakest; 'active' hosts one per life (6+ adult
  children, from Nascent Soul); otherwise every profile names the strongest adult child heir. "Succession" report
  table: heirs named (chosen · tournament), heir stage, heirs forged in blood, tournament deaths, mean BQ heir term.
- **Between lives (2.6d):** `run.js` calls `bot.interlude()` right after any step that ends a life (the interlude
  pauses the game, so it is resolved in the same step). Bet: 'active' bets on the strongest candidate, casual/afk
  guess at random. Rebirth: 'casual' picks orphan 10% of the time, everyone else a clan birth. Upbringing event:
  'active' picks what its own personality likes, casual/afk random. "Between lives" report table: deaths, died as
  head, bets (won), who got the seat (named · tournament · clan · regency), the new head's style, rebirth position
  (eldest · younger · branch · rival · orphan), sect fortunes, extinct clans.
- **Clan Politics (2.6e):** headed first in `family()`, ahead of everything else — an NPC challenge against you
  (`resolveHeadChallenge`) decides lethal only when `active` and clearly favored, else a coin flip; a step-down
  offer (`answerStepDown`) is joined by `active` whenever eligible, by casual/afk about half the time. Initiating a
  challenge yourself (`challengeHead`) is opportunistic: `active` always tries when favored, casual/afk only 1% of
  checks (tuned down from an early 5% that made challenge deaths dominate casual's Life Loop table — see Gotchas).
  "Clan Politics" report table (right after Succession): challenges (won/lost), step-downs joined (won).
- **Branch wars + secession (2.6f):** checked right after the challenge-head check in `family()`. A branch head
  (`canDeclareBranchWar().ok`) declares when `active` and `branchWarPreview()` favors them, else a small flat
  chance every profile shares (rare enough that not every branch life turns into a war); non-`active` profiles
  also occasionally secede outright instead. A branch member (`canPushBranchWar().ok`) pushes rarely. Same
  "Clan Politics" report table gains two columns: branch wars (won), secessions.
- **Legacies (2.7c):** `bot.legacies()`, checked right after `family()` in the main action chain — spends
  Ancestral Merit greedily in life-loop.md §7's priority order (`ancestral_stipend → refined_meridians →
  family_manual → heirloom → beast_lineage`), then, once `family_manual` is bought, picks the clan's highest-
  `minStage`-within-tier known technique for `setFamilyManual()`. `buy_legacy` is a `FEATURES` "never used" entry.
- **Bot randomness is seeded** (fixed 2026-09-26, 2.6a): any bot coin flip must use `this.rand()` (its own
  `mulberry32` stream), never `Math.random()` — Node's global is unseeded, which silently made runs unreproducible.

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
  ended a casual life by old age (removed 2026-09-26 — lives now end at the Ascension Trial, so casual's median
  life rose to ~29.5h; see life-loop.md §15), so a casual mortal life needed to clear these realms much faster.
- **Life Loop pacing (Phase 30/M2 task 2.4)**: median per-life open-hours per profile (from the "Life Loop"
  section) vs `LIFE_TARGETS_H` in profiles.js (`casual.gen1 [20,40]` — widened from [10,20] when old age was removed, 2026-09-26 — `active.gen1 [5,15]`) — flags if a
  profile's median life falls outside its band. `later` (post-catch-up generations), `FIRST_ASCENSION_H`
  and `GENERATIONS_TO_ASCEND` are defined but **not yet checked** — they need tasks 2.5–2.8's ancestral
  catch-up/generation continuity to mean anything (every death today is a fresh soul, no carry-over).
  A **Family** table (family.md) follows it: marriage events / crises, spouses lost, duels won/lost/fled, affairs +
  discoveries, reaction mix, children born/lost per life (from `lastReincarnation.familyTally`).
  **M2 task 2.5** added three family columns to the same table (share of lives married, mean children per life, share
  of lives with ≥1 adult child at death — from `lastReincarnation.married/children/adultChildren`) and a casual flag
  when fewer than half of lives end with an adult child (2.5's done-when: an heir should usually exist).
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
health ∉ [0,100] · bloodlineQuality ∉ [0, BLOODLINE_CAP] · generation < 1 · `settings_invalid` (any `s.settings` value not valid for its `SETTINGS_DEFS` entry) · `personality_invalid` · `banter_buffer_over_cap` · `banter_pool_holes` (content check once per run: every personality × trigger meets `BANTER_MIN_LINES`) · `war_orders_invalid` (Phase 32: any `s.warOrders` value not one of its `WAR_ORDER_*_OPTIONS`, or a negative `chestStones`/`reinforceKeep`) · `war_chest_over_cap` (Phase 32: `sectWar.chestStones` exceeds `MEMBER_WAR_CHEST_BASE + rank × MEMBER_WAR_CHEST_PER_RANK`, whether an order, a manual click, or both filled it — proves no double-charge) · `war_pills_over_cap` · `item_category_invalid` (Phase 21: every `ITEMS[id].category` must be one of `currency|mat|pill|equip|rare|key`, checked once per run) · `family_children_over_cap` / `family_spouse_dead` / `family_proposal_invalid` (M2 2.5, life-loop.md §7 invariant 5: children ≤ `CHILD_CAP`, spouse null or alive, proposal only when unmarried and past `PROPOSAL_MIN_STAGE`) · `family_affection_range` / `family_pending_unmarried` / `family_child_parents` / `family_encounters_over_cap` / `family_lover_is_spouse` (family.md; `family_children_over_cap` was retired with the child cap) · `world_invalid` / `world_self_duplicated` / `world_player_clan_missing` / `world_player_not_on_roster` / `world_past_lives_mismatch` + a world save round-trip check (clan-succession.md 2.6a) · `family_planning_invalid` / `child_bond_range` / `morality_range` / `child_stage_over_parent` / `child_event_orphaned` (2.6b) · `heir_invalid` / `tournament_too_many_deaths` / `tournament_pool_invalid` (2.6c) · `interlude_stuck` / `clan_head_invalid` (a non-extinct clan whose head is missing or dead) / `clan_too_many_branches` / `birth_position_invalid` / `birth_clan_mismatch` / `head_bond_range` (2.6d) · `head_challenge_orphaned` (a pending challenge whose challenger died/left) / `stepdown_offer_invalid` (a pending step-down offer whose head no longer matches, or fewer than 2 entrants) / `challenge_tally_mismatch` (2.6e) · `clan_relation_range` (every `clan.relations` value ∉ [-100,100]) / `branch_war_tally_mismatch` / `branch_war_cooldown_invalid` (2.6f) · `clan_merit_negative` / `clan_best_stage_range` / `clan_first_unknown` / `clan_first_invalid` (2.7a/b — clan-succession.md §2.7) · `age_below_awakening` (replaced `age_over_lifespan` when lifespan was removed, 2026-09-26) · `age_offline` (age/gameYear unchanged by offline catch-up). The sim also runs `BanterSystem` (source `banter`, 0 stones).

## Real-app smoke (`scripts/smoke/`)
`node scripts/smoke/cdp.js scripts/smoke/scenarios/<name>.js` launches the real Electron app against a throwaway
`--user-data-dir` (never your real slots), drives it over the Chrome DevTools Protocol (`ev` / `click` / `wait` /
`shot(name, clip?)` / `assert`; `clip {x,y,width,height}` crops a close-up), fails on any console error or uncaught exception, and writes screenshots to `scripts/smoke/out/`
(gitignored). Use it for UI changes the headless sim can't see. Scenarios:
| File | Covers |
|---|---|
| `scenarios/succession.js` | 2.6d — death card → heir bet → reign chronicle → clan birth → birth card; Stats clan rows + Clan Chronicle; upbringing card; a mid-interlude save resumed from the character select. Also 2.6e — the Challenge the Head button + confirm dialog, an NPC challenging you as head (family-overlay lethal/non-lethal card), a step-down mass tournament (family-overlay join/decline card). Also 2.6f — Stats branch strength preview, Declare War (a branch head), Push for War (a branch member), Secede (founds a new clan, the slot follows it) |
| `scenarios/layout-modes.js` | ui-layout.md → Layout modes (1.7) — each mode's real window size + data-layout, pin per mode, Desktop resize IPC, banner readouts, popup auto-peek + return, ⬡ / ↩ Back to the banner, the character select never a strip, Continue restores the banner |
| `scenarios/banner-menus.js` | ui-layout.md → Banner quick actions (1.7b) — Sect Elder in banner mode: each of the four dropdowns opens and grows the window, one real action per menu (mission, expedition, craft, learn), category chips, Esc shrinks back; writes the close-ups the Visual Review Gate reviewer reads |
| `scenarios/visual-baseline.js` | ui-review.md → Baseline (1.8c) — screenshots every screen/mode/popup/art piece in groups for the Visual Review Gate: vb-1 charselect/settings/picker · vb-2 Overlay HUD + all tabs (top/mid/end) · vb-3 Expanded/Desktop · vb-5 proposal, family event, heir, confirm, tournament, Hall, Ascension, death→interlude · vb-6 every cultivator sprite state ×3 moments at 3× · vb-7 beast encounter cards at 2×. Rerun after 1.8b / A4 for before/after |
| `scenarios/art-bakeoff.js` | ui-review.md → A2 art bake-off — opens scripts/art-bakeoff/index.html in the app and captures variants a/b/c at Overlay (3×) and Banner (4×) size, idle ×3 moments + breakthrough ×2, 1× shots, the (b) face swap and the side-by-side page (bake-*.png) |
| `scenarios/nav-attention.js` | ui-layout.md → Navigation + attention (1.8b-1) — Sect Founder: six groups + every view renders alone, no automation panel left in Explore/Sect, a group remembers its sub-view, forced war + beast → attention items, order, badges, +N unfold, item clicks navigate, Mode panel (4 automation rows, Idle/Active cards), rail in Expanded, cards with reasons, banner chip + "+N" peeks. Writes `out/nav-*.png` for the Visual Review Gate |
| `scenarios/character.js` | ui-layout.md → Breakdowns (1.8b-2) — Sect Elder (damaged, in catch-up) + Pre-Ascension: Character tiles, each breakdown kind opens with rows + total and fits the window, Esc / outside click close, every HUD entry point (Qi rate, Qi numbers, Integrity, Health, 詳), catch-up chip, banner peek, bloodline from Spirit Severing, Ascension card. Writes `out/char-*.png` for the Visual Review Gate |
| `scenarios/sect.js` | ui-layout.md → Sect views (1.8b-5) — founder, member and no-sect: the offered sub-tabs (and that they fit the row in every mode), every view in Overlay/Expanded/Desktop, founder Overlay ≤ 3 screens per view (prints them), war odds "why" card, take in a disciple, raise a building, give stones, set out on a mission (timer shows), answer the call, the attack attention item opens Sect → War, leaving falls back to Overview; also the Techniques/Explore/Craft grid shots. Writes `out/sect-*.png` + `out/grid-*.png` |
| `scenarios/ux-audit.js` | ui-layout.md → UX Audit (1.8a) — loads the Sect Elder + Sect Founder dev presets, screenshots every tab + ⚙/Hall overlays (`out/ux-*.png`) and prints chrome heights + per-tab content height / screens-of-scroll / control count / min font. Rerun after layout/UI work for before/after |
| `scenarios/icons.js` | icons.md (1.8d) — every icon draws something; the contact sheet (`out/icons-sheet.png`, 14/18/32/64px in palette colors); no CJK/emoji/box glyph left as text in the titlebar + HUD; the icon chrome in Overlay (+ ⋯ menu, Pack), each layout picker, Expanded, Desktop, Banner and a 390px phone (`out/icons-*.png`) for the Visual Review Gate |
| `scenarios/mobile.js` | ui-layout.md → Mobile / narrow layout (1.8e) — forces a 390×844 phone viewport + touch media via `emulate()`: `body[data-narrow]`, no horizontal overflow on charselect/in-game/every view, the tab bar at the bottom with ≥44px targets, the sprite canvas fitted to width, a settings overlay that fits, and a landscape phone returning to the two-column layout. Writes `out/mobile-*.png` for the Visual Review Gate |

## Scenario checks (`scripts/sim/checks/`, `npm run checks`)
The sim only sees what the bot happens to do. Scenario checks force a specific situation through the same
`loader.js` and assert the exact rule ("a lethal round never takes the field below 4", "an old save migrates").
`run-all.js` runs every file, prints per-file ok/FAIL counts and exits 1 on any failure. **Per CLAUDE.md, any useful
check script goes here (not in a temp folder) and is listed below in the same change.**

| File | Covers | Checks |
|---|---|---|
| `breakdowns.js` | core-loop.md / ui-layout.md → Breakdowns (1.8b-2) — the recorded Qi/s, Qi cap and BT parts rebuild the real totals at 5 stages with everything stacked (techniques, gear, beasts, sect, karma), catch-up is a named part, ascensionBreakdown() sums to ascensionChance(), btFailPreview() matches a forced real failure (Qi, Integrity, karma) and warns of demotion | 29 |
| `sect-view.js` | ui-layout.md → Sect views (1.8b-5) — sectWarOdds() matches a 4,000-war Monte Carlo of the real _resolveSectWar (bare + array/reinforced/ally) and _resolveMemberWar (answered + chest), odds parts rebuild the multiplier, what-ifs + shown costs are real; ownSectInfo() per-disciple Qi sums to derived.discipleQiFrac, stones/herbs per minute = what tickOwnSect(60) pays, fame terms sum; attention items land on sect-war / sect-disciples / sect-halls | 23 |
| `settings.js` | settings.md / notifications.md — Close button: default Quit, closeAction → closeButton migration, explicit tray kept, invalid reset | 5 |
| `world.js` | clan-succession.md 2.6a — world/life split, 2.5-era + pre-2.2 migrations, death keeps the world, orphan life | 13 |
| `family-marriage.js` | family.md A — affection, marriage + crisis events, duel win/lose/flee, sabotage, partner BQ term | 21 |
| `family-affairs.js` | family.md B — encounters, lovers, discovery, every spouse reaction, tolerant spouse | 19 |
| `children.js` | 2.6b — Family Planning, child growth + cap, child events, runaways, neglect drift, morality | 22 |
| `family-agency.js` | family.md 1.8b-3a — courtship (seek → court → meetings → propose, refusal → spurned → road encounter, withdraw), spouse actions + cooldowns + affection causes, dual cultivation gain/deviation, the ask plan (wishes, Not now, try, Cold refusal, expecting → birth), postpone, separation, raising actions (age locks, teach pulls morality, head-start xp), save migration (old default many → ask) | 44 |
| `family-fights.js` | family.md 1.8b-3b — cover tracks, confess vs caught (forgiveness rate), end it + scorn, ultimatum (one more season runs hot, marry = divorce + wed), marry a lover, the fight card (exchange odds reproduce the old match odds, habits → best read, wounds, yield refused/accepted), tournament spare | 21 |
| `tournament.js` | 2.6c — field-size rules, deaths, trauma, bonds, BQ heir term (now at rebirth), heir takes the seat + branches, heir rules | 32 |
| `succession.js` | 2.6d — named heir (no bet), the bet as a non-head, style roll, branches, sect fortunes + stipend, positions by bet, orphan + return, extinct clan, rival-family rebirth, interlude pause + save/load, upbringing, head-only heir naming, 30-generation chain. Also 2.6e — canChallengeHead gating, challengeHead (lethal/non-lethal win + loss, sect handoff, Bloodline bump, karma), resolveHeadChallenge (your call as head), the step-down mass tournament (join/decline/no-contest, branches founded), the natural schedule firing both. Also 2.6f — branch/head/member/cooldown/busy gating, a won and a lost branch war (survive + die), a refused and an accepted push (incl. "pushing never makes you head"), a full secession | 115 |

**Writing one:** `const { createSim } = require('../loader.js')`, build a sim (`await createSim({ seed })`,
`await sim.boot(0)`), set up state directly, call public/private `gs` methods, `assert(cond, msg)` printing
`ok   msg` / `FAIL msg`. Gotchas: game code runs in a VM with its own seeded `Math.random` — to force a roll,
override it inside the VM (`sim.ev('globalThis.__r = Math.random; Math.random = () => 0')`, restore after); never
force a constant around `resolveExpedition()` (its beast-trait loop then never ends). `sim.step(1)` advances one
real second (1/120 game year); for year-based logic, bump `s.world.year` and call `gs._tickFamily()` directly.

## Extending
- **New system/phase:** add bot behaviour in `bot.js` (new method + add to the `checkIn` chain), new
  milestones in `Recorder.slow()`, invariants in `checkInvariants()`, feature id in `report.js FEATURES`,
  and a scenario check file in `checks/` for the rules the bot won't reliably hit.
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
- **2.6e's first draft firing frequency was ~4× too high.** `GAME_YEARS_PER_OPEN_HOUR` (30) makes years pass fast
  relative to real check-in cadence — a 15–25 year check interval fires several times even in a short life. A first
  pass (`CHALLENGER_EVENT_YEARS`/`STEPDOWN_CHECK_YEARS` = [12–24]/[15–25], plus a 5% opportunistic challenge chance
  for casual/afk) pushed active's median life 8.7h → 3.2h and casual's 32.5h → 17.5h in a 200h/3-seed before/after
  sim run — both dropped outside life-loop.md's target bands, with `stepdown_tournament`/`challenge_lost` becoming
  the dominant death causes ahead of `ascension_failed`. Fixed by widening both intervals to [50–100] and adding an
  explicit `CHALLENGER_EVENT_CHANCE` (0.25) gate on top of the interval, plus dropping the opportunistic challenge
  chance to 1%; medians landed back at 8.1h/21.0h. **Any new probabilistic life-ending event needs a before/after
  full sim run against life-loop.md's target bands before it's considered tuned — the check interval alone is not
  enough of a throttle at this time scale.** This also exposed `joined_and_founded` (a pre-existing invariant) the
  first time anything besides founding could set `s.ownSect.founded` — `_installHead`'s clan-sect handoff now also
  requires `!s.sect.id` (you can't inherit a sect while a member of another one).
- **A death-flow snapshot must be captured on `s.interlude`, not on `clan.pendingSuccession` (2.7c).**
  `pendingSuccession` is deliberately transient — `_runSuccession()` `delete`s it as soon as it's done reading it,
  well before `_beginLife()` (which can run much later, after the player answers a bet/rebirth choice) ever needs
  anything from the dying life. A scripted check (succession.js #33) caught the Heirloom/Beast Lineage legacies
  reading it anyway and always getting `undefined` — fixed by adding `interlude.legacyCapture`, set in
  `_runSuccession()` right before the delete. **Any future feature that needs data from the life that just ended,
  read at `_beginLife()` time, belongs on `s.interlude`, which survives the whole flow.**
- **Fixing a long-standing dead zone can look like a pacing regression in the report — check which one it is.**
  2.7d ended the post-Ascension dead zone (attemptAscension() success now calls `_die()` instead of leaving the
  character idle at the stub stage); the immediate, correct effect was active's life count over 200h jumping
  ~10 → 163. The immediate SIDE effect was active's median life falling to 3.3h, under `LIFE_TARGETS_H.active`'s
  `[5,15]` band — expected, not a bug: the band was tuned (task 2.4) against a world where Ascension was a dead
  end. Deliberately left untuned for task 2.8, which owns exactly these knobs (Merit costs, catch-up strength).
- **Offline catch-up mutating `world.clans` breaks the save-round-trip check (2.7b).** `initSlot()`'s bounded
  replay loop can resolve a sect/member war while the app is closed and already sets `this._warLive = false` for
  exactly this reason (it gates the `war_won`/`war_lost` banter/event emit right next to `w.warVictories++`).
  Claiming the `war_won` clan first there too surfaced `save_roundtrip_world` the first time an offline-resolved
  win happened to also be a clan's first ever — `checkSaveRoundtrip()` asserts `world.clans` is byte-identical
  across a close→reopen, an assumption that held by coincidence until something offline-reachable started
  writing to a Clan object. **Any future Merit/first/legacy hook on a war-win (or on any other event offline
  catch-up can trigger) must gate on `this._warLive`, same as the existing banter/event emit.**
