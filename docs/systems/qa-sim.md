# QA Sim Harness — Reference
_Covers: scripts/sim/* · package.json (`sim`, `sim:quick`) · Phase: tooling (+5C member-war metrics, +Phase 42 arts) · Updated: 2026-09-30_

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
| `loader.js` | Loads data + `game-state.js` + `game/*.js` into a `vm` context with fake `Date`, seeded `Math.random`, in-memory `window.electron` (saves are JSON strings → every load is a real round-trip). Includes `NotificationSystem` (Phase 9B) — its default `isWindowActive => true` means it always gates closed here, so this is a load/no-throw check, not a behavior test (docs/systems/notifications.md). `sim.data` also carries the Phase 42 arts tables (`ARTS`, `ARTS_LIST`, `ART_RARITY`, `ART_PASSIVE_SLOTS`, `ART_STUDY_SLOTS`, …) so the bot can read them |
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
- **Arts & Move Combat (Phase 42, task 1.15):** `bot.arts()` runs early in the `checkIn` chain and plays every arts
  system, so the sim exercises the feature a real player would: it answers a waiting breakthrough offer (`artOffers`),
  gives a spare manual to the sect (`giveManuals`), works its free study desks on its best manual (`studyManuals`),
  wears its strongest known loadout (`setLoadout` — best moves by power × mastery × root affinity, best-grade
  passives), buys a missing art from a joined sect's library for Contribution (`sectLibraryBuy`), studies/writes the
  clan library (`clanArts`), and sells what it can never use (a mastered manual, outgrown gear) (`sellSurplus`).
  'active' picks the best on every choice; casual/afk act at random or not at all (the established split). The arts
  data (`ARTS`, `ARTS_LIST`, `ART_*`) is on `sim.data` (loader.js) for the bot to read.
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
- **Fight length (arts.md target 4–8 turns)**: the mean turns a battle ran, from the live battle's own counter at the
  move that ends it (a win or a loss; a retreat / yield isn't counted). `runs[i].fightTurns.beast|person`. Shown per
  profile as "Turns (avg)" in the Beast battles table and the People fights table. The old beast **Exchanges** column
  went dead when 42b replaced the exchange loop with moves — this replaces it.
- **Arts — Phase 42 (task 1.15)**: per profile — arts known / mastered L5 at the run's end (a final snapshot,
  per-life since arts reset on rebirth), offers kept, studies, loadouts set, manuals sold + the stones selling
  earned, sect-library arts bought, clan-library arts written · studied.
- **People fights — duels, challenges, the Arena**: the bot's own move-engine person fights (person moves, mean turns,
  parries, head challenges, Arena bouts) and the end choices taken (finish · spare · raise · humble).
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
health ∉ [0,100] · bloodlineQuality ∉ [0, BLOODLINE_CAP] · generation < 1 · `settings_invalid` (any `s.settings` value not valid for its `SETTINGS_DEFS` entry) · `personality_invalid` · `banter_buffer_over_cap` · `banter_pool_holes` (content check once per run: every personality × trigger meets `BANTER_MIN_LINES`) · `war_orders_invalid` (Phase 32: any `s.warOrders` value not one of its `WAR_ORDER_*_OPTIONS`, or a negative `chestStones`/`reinforceKeep`) · `war_chest_over_cap` (Phase 32: `sectWar.chestStones` exceeds `MEMBER_WAR_CHEST_BASE + rank × MEMBER_WAR_CHEST_PER_RANK`, whether an order, a manual click, or both filled it — proves no double-charge) · `war_pills_over_cap` · `item_category_invalid` (Phase 21: every `ITEMS[id].category` must be one of `currency|mat|pill|equip|rare|key`, checked once per run) · `family_children_over_cap` / `family_spouse_dead` / `family_proposal_invalid` (M2 2.5, life-loop.md §7 invariant 5: children ≤ `CHILD_CAP`, spouse null or alive, proposal only when unmarried and past `PROPOSAL_MIN_STAGE`) · `family_affection_range` / `family_pending_unmarried` / `family_child_parents` / `family_encounters_over_cap` / `family_lover_is_spouse` (family.md; `family_children_over_cap` was retired with the child cap) · `world_invalid` / `world_self_duplicated` / `world_player_clan_missing` / `world_player_not_on_roster` / `world_past_lives_mismatch` + a world save round-trip check (clan-succession.md 2.6a) · `family_planning_invalid` / `child_bond_range` / `morality_range` / `child_stage_over_parent` / `child_event_orphaned` (2.6b) · `heir_invalid` / `tournament_too_many_deaths` / `tournament_pool_invalid` (2.6c) · `interlude_stuck` / `clan_head_invalid` (a non-extinct clan whose head is missing or dead) / `clan_too_many_branches` / `birth_position_invalid` / `birth_clan_mismatch` / `head_bond_range` (2.6d) · `head_challenge_orphaned` (a pending challenge whose challenger died/left) / `stepdown_offer_invalid` (a pending step-down offer whose head no longer matches, or fewer than 2 entrants) / `challenge_tally_mismatch` (2.6e) · `clan_relation_range` (every `clan.relations` value ∉ [-100,100]) / `branch_war_tally_mismatch` / `branch_war_cooldown_invalid` (2.6f) · `clan_merit_negative` / `clan_best_stage_range` / `clan_first_unknown` / `clan_first_invalid` (2.7a/b — clan-succession.md §2.7) · `age_below_awakening` (replaced `age_over_lifespan` when lifespan was removed, 2026-09-26) · `age_offline` (age/gameYear unchanged by offline catch-up) · `arts_studies_over_cap` / `arts_known_invalid` /
`arts_loadout_invalid` / `arts_manual_invalid` (Phase 42, task 1.15: study desks ≤ the realm's allowance; every known
art exists; a move/passive slot never holds a wrong-kind or unknown art; every `manual_<id>` names a real art). The
sim also runs `BanterSystem` (source `banter`, 0 stones).

## Real-app smoke (`scripts/smoke/`)
`node scripts/smoke/cdp.js scripts/smoke/scenarios/<name>.js` launches the real Electron app against a throwaway
`--user-data-dir` (never your real slots), drives it over the Chrome DevTools Protocol (`ev` / `click` / `wait` /
`shot(name, clip?)` / `assert`; `clip {x,y,width,height}` crops a close-up), fails on any console error or uncaught exception, and writes screenshots to `scripts/smoke/out/`
(gitignored). Use it for UI changes the headless sim can't see. **The window opens off your primary monitor** — the harness
sets `CULTIVATOR_SMOKE=1` and `main.js` places it on the first *secondary* display (showing without stealing your focus),
so a run never blocks your work; set `CULTIVATOR_SMOKE_DISPLAY=<n>` (1-based, e.g. `2` = your second monitor) to pin a
different one. `npm start` / a real build are unaffected (the flag is unset there). Scenarios:
| File | Covers |
|---|---|
| `scenarios/immortal.js` | soul-points.md (Phase 40b) — forced successful Trial: the finish grant, the interlude card waits, Skip after 1.5 s, frame ≤ 6 ms (Overlay + Desktop), stills per phase (`immortal-<mode>-<phase>.png`) in Overlay/Expanded/Desktop/phone, the finish screen copy ("your race to immortality", no version), Spend opens the Soul screen on top, Continue → interlude, Relive changes nothing, a later Immortal's +150 card, Reduced motion 2 s fade, Banner peek |
| `scenarios/arena.js` | combat.md (A6-3b) — Roam → Arena in Overlay / Expanded / Desktop / phone: six rings (the highest open first, locked ones), rosters with odds + Fight / Blood, a bout on the battle page, raise, the result's Fight on / Walk away, the run panel + the purse why card, walking away pays + the gates rest with a countdown; a grudge call-out card + urgent attention → a grudge match; an early player's first-visit hint. Writes `out/arena-*.png` |
| `scenarios/duels.js` | combat.md (A6-3a) — the spouse duel on the battle page in Overlay / Expanded / Desktop / phone (mirrored ink duelist, Yield, a lost + won exchange, finish / spare with the reaction shown, spare → spouse leaves with a grudge), the Challenge-the-Head odds pill + the personfight why card, defending the seat until one yields (raise / humble → the clan is cowed), a step-down bracket chaining bouts ("Face the next"), frame time. Writes `out/duel-*.png` |
| `scenarios/hunt.js` | combat.md (A6-2) — Roam → Hunt: five grounds, lock reasons, Track a beast → countdown → found card (Fight it opens the battle page); Roam → Bestiary: ten kinds, unseen silhouettes, seen cards with habits + record, the **rare-colour footer** (met variants named + the lede's "rare colours M of 10 met"); an early player (four grounds locked, empty bestiary); Overlay / Expanded / Desktop / phone. Writes `out/hunt-*.png`, `out/bestiary-*.png` |
| `scenarios/combat.js` | combat.md (Phase 35 / A6-1) — the Fight button on a Roam → Beasts card opens the prepare step (nothing committed), a Slay battle loses then wins exchanges, the end choice (finish / spare / bind), the result card, the beastfight breakdown card, Step back + the attention item + resume, retreat, a deadly Golden Dragon loss (page closes, the death card names the hunt), scene frame time; Overlay / Expanded / Desktop / phone. Writes `out/combat-*.png` for the Visual Review Gate |
| `scenarios/battle-fx.js` | arts.md "42b part 2" (task 1.13b): a real turn hands the scene an `fx` for both sides (the beast Rake as claws); live statuses reach the scene as auras; composes `out/battle-fx-sheet-1..5.png` (every element × flight / impact / later / parried / ward, overcomes + telling blow, resisted, multi-hit with a parry, drain, heal, buff, Circulate, gathering a charge, hex, every status aura, the parry wind-up early / now, the press flashes); a busy effects frame < 12 ms; per mode (Overlay / Expanded / Desktop / phone) a mid-effect shot (`battle-fx-<mode>.png`) and a live parry prompt with the ring on the field (`battle-fx-parry-<mode>.png`), a press on the mark flashes the ward, the ring leaves once answered |
| `scenarios/soul.js` | soul-points.md (Phase 40a) — no Soul button on a fresh install; the Trial card's "Should you fall" row; a forced failed Trial writes the death-card soul line; attention item + fresh Hall door; the Soul screen (one click = one rank, Qi/s +5%, breakdown part, Escape closes) in Overlay/Expanded/Desktop/phone; the charselect Soul button opens it; the record survives a reload and a slot delete. Writes `out/soul-*.png` for the Visual Review Gate |
| `scenarios/succession.js` | 2.6d — death card → heir bet → reign chronicle → clan birth → birth card; Stats clan rows + Clan Chronicle; upbringing card; a mid-interlude save resumed from the character select. Also 2.6e — the Challenge the Head button + confirm dialog, an NPC challenging you as head (family-overlay lethal/non-lethal card), a step-down mass tournament (family-overlay join/decline card). Also 2.6f — Stats branch strength preview, Declare War (a branch head), Push for War (a branch member), Secede (founds a new clan, the slot follows it) |
| `scenarios/layout-modes.js` | ui-layout.md → Layout modes (1.7) — each mode's real window size + data-layout, pin per mode, Desktop resize IPC, banner readouts, popup auto-peek + return, ⬡ / ↩ Back to the banner, the character select never a strip, Continue restores the banner |
| `scenarios/banner-menus.js` | ui-layout.md → Banner quick actions (1.7b) — Sect Elder in banner mode: each of the four dropdowns opens and grows the window, one real action per menu (mission, expedition, craft, learn), category chips, Esc shrinks back; writes the close-ups the Visual Review Gate reviewer reads |
| `scenarios/visual-baseline.js` | ui-review.md → Baseline (1.8c) — screenshots every screen/mode/popup/art piece in groups for the Visual Review Gate: vb-1 charselect/settings/picker · vb-2 Overlay HUD + all tabs (top/mid/end) · vb-3 Expanded/Desktop · vb-5 proposal, family event, heir, confirm, tournament, Hall, Ascension, death→interlude · vb-6 every cultivator sprite state ×3 moments at 3× · vb-7 beast encounter cards at 2×. Rerun after 1.8b / A4 for before/after |
| `scenarios/art-bakeoff.js` | ui-review.md → A2 art bake-off — opens scripts/art-bakeoff/index.html in the app and captures variants a/b/c at Overlay (3×) and Banner (4×) size, idle ×3 moments + breakthrough ×2, 1× shots, the (b) face swap and the side-by-side page (bake-*.png) |
| `scenarios/nav-attention.js` | ui-layout.md → Navigation + attention (1.8b-1) — Sect Founder: six groups + every view renders alone, no automation panel left in Explore/Sect, a group remembers its sub-view, forced war + beast → attention items, order, badges, +N unfold, item clicks navigate, Mode panel (4 automation rows, Idle/Active cards), rail in Expanded, cards with reasons, banner chip + "+N" peeks. Writes `out/nav-*.png` for the Visual Review Gate |
| `scenarios/character.js` | ui-layout.md → Breakdowns (1.8b-2) — Sect Elder (damaged, in catch-up) + Pre-Ascension: Character tiles, each breakdown kind opens with rows + total and fits the window, Esc / outside click close, every HUD entry point (Qi rate, Qi numbers, Integrity, Health, 詳), catch-up chip, banner peek, bloodline from Spirit Severing, Ascension card. Writes `out/char-*.png` for the Visual Review Gate |
| `scenarios/sect.js` | ui-layout.md → Sect views (1.8b-5) — founder, member and no-sect: the offered sub-tabs (and that they fit the row in every mode), every view in Overlay/Expanded/Desktop, founder Overlay ≤ 3 screens per view (prints them), war odds "why" card, take in a disciple, raise a building, give stones, set out on a mission (timer shows), answer the call, the attack attention item opens Sect → War, leaving falls back to Overview; also the Techniques/Explore/Craft grid shots. Writes `out/sect-*.png` + `out/grid-*.png` |
| `scenarios/ux-audit.js` | ui-layout.md → UX Audit (1.8a) — loads the Sect Elder + Sect Founder dev presets, screenshots every tab + ⚙/Hall overlays (`out/ux-*.png`) and prints chrome heights + per-tab content height / screens-of-scroll / control count / min font. Rerun after layout/UI work for before/after |
| `scenarios/icons.js` | icons.md (1.8d) — every icon draws something; the contact sheet (`out/icons-sheet.png`, 14/18/32/64px in palette colors); no CJK/emoji/box glyph left as text in the titlebar + HUD (the repo-wide rule is `npm test` → check-no-chrome-cjk.js); the icon chrome in Overlay (+ ⋯ menu, Pack), each layout picker, Expanded, Desktop, Banner and a 390px phone (`out/icons-*.png`) for the Visual Review Gate |
| `scenarios/ink-beasts.js` | art-engine.md → "Beasts" (A4-2) — one encounter + one companion per beast type in Roam → Beasts: every card gets an ink portrait, a re-render reuses the pooled canvas, pool = visible portraits, portrait frame < 3 ms, captures Overlay / Expanded / phone (`out/ink-beasts-*.png`) + an 8× sheet (`out/ink-beasts-sheet.png`), Classic falls back to the ASCII sprite (all frames) and drops the pool |
| `checks/beasts.js` | integrity.md → roster/tiers/variants/Might — 10 types with art + variants, tiers rise with the gate, dragons legendary (golden rarest + strongest), beastProfile, sighting variant/favored-trait rates, legendary log line, tame keeps the variant, old-save encounter, Might ×2.3 on Qi Devour |
| `scenarios/ink-beasts-sheet.js` | art-engine.md → "Beasts" — fast art loop: renders only the 8× beast sheet (every INK_BEASTS entry, two moments) to `out/ink-beasts-sheet.png`, no save needed; `BEASTS=fox,eagle` env filters by key |
| `scenarios/ink-art.js` | art-engine.md (A3-1) — Sprite art Classic → Ink swaps Qi Condensation to the ink engine (backing store = CSS × dpr), cache build + per-frame cost, idle + breakthrough at one frozen moment in Overlay/Expanded/Desktop/Banner/phone (`out/ink-*.png`), 4× engine stills (`out/ink-still-*.png`), fallback to classic on a stage without ink art, Classic switches back; A3-2: every slot option (`out/ink-slots-sheet.png`), failure / demotion / expression-frame stills, the breakthrough moment surviving a same-frame stage notify, the failure moment fading out |
| `scenarios/ink-default.js` | art-engine.md / settings.md (A4-4) — a new character opens on Ink in Overlay/Expanded/Desktop/Banner/phone (`out/ink-default-*.png`), an old save on Classic loads on Ink + logs how to switch back + is saved at once, Classic switches back, Classic sprites hold no emoji (Chromium ICU; ★ is text), Classic sprite stills after the ϟ / ◎ swap |
| `scenarios/mobile.js` | ui-layout.md → Mobile / narrow layout (1.8e) — forces a 390×844 phone viewport + touch media via `emulate()`: `body[data-narrow]`, no horizontal overflow on charselect/in-game/every view, the tab bar at the bottom with ≥44px targets, the sprite canvas fitted to width, a settings overlay that fits, and a landscape phone returning to the two-column layout. Writes `out/mobile-*.png` for the Visual Review Gate |

## Scenario checks (`scripts/sim/checks/`, `npm run checks`)
The sim only sees what the bot happens to do. Scenario checks force a specific situation through the same
`loader.js` and assert the exact rule ("a lethal round never takes the field below 4", "an old save migrates").
`run-all.js` runs every file, prints per-file ok/FAIL counts and exits 1 on any failure. **Per CLAUDE.md, any useful
check script goes here (not in a temp folder) and is listed below in the same change.**

**Fight helpers (1.14a):** `scripts/sim/fight-helpers.js` → `playFight(gs, 'win' | 'lose')` forces a move fight to its end
(their HP to 1 and no parry / your Health to 2 and they only Palm Strike) — every check that needs "win this fight" uses it
(duels, arena, family-fights/-marriage/-affairs, succession, people-moves). The smoke twin is `scripts/smoke/fight-ui.js`
(clicks the real move buttons, parrying off meanwhile). **Probes (1.15 tuning aids, not checks):**
`node scripts/sim/probe-person-fights.js [stage] [kept|starter]` prints the estimate vs people of six tempers at
−3 … +3 stages; `node scripts/sim/probe-beast-fights.js [kept|starter]` prints the estimate's win chance **and mean
turns** vs every beast at its gate realm and one realm up (the per-beast breakdown behind the sim's `fightTurns`
whole-run average).

| File | Covers | Checks |
|---|---|---|
| `breakdowns.js` | core-loop.md / ui-layout.md → Breakdowns (1.8b-2) — the recorded Qi/s, Qi cap and BT parts rebuild the real totals at 5 stages with everything stacked (techniques, gear, beasts, sect, karma), catch-up is a named part, ascensionBreakdown() sums to ascensionChance(), btFailPreview() matches a forced real failure (Qi, Integrity, karma) and warns of demotion | 29 |
| `sect-view.js` | ui-layout.md → Sect views (1.8b-5) — sectWarOdds() matches a 4,000-war Monte Carlo of the real _resolveSectWar (bare + array/reinforced/ally) and _resolveMemberWar (answered + chest), odds parts rebuild the multiplier, what-ifs + shown costs are real; ownSectInfo() per-disciple Qi sums to derived.discipleQiFrac, stones/herbs per minute = what tickOwnSect(60) pays, fame terms sum; attention items land on sect-war / sect-disciples / sect-halls | 23 |
| `settings.js` | settings.md / notifications.md — Close button: default Quit, closeAction → closeButton migration, explicit tray kept, invalid reset; A4-4: Sprite art defaults to Ink, an old save on Classic moves once + logs, a later Classic pick sticks | 10 |
| `combat.js` | combat.md (Phase 35 / A6-1 + A6-2: hunts (locks, odds sum to 1, cost, one at a time, resolves in tick + after the game was closed, never above your realm, a found beast holds the hunt until dealt with), bestiary seen + migration, the slayer reputation turning a return vengeful, battle banter pools ≥ 4 per personality) — beast battle odds at realm gates (fox / tiger / golden dragon), wounds weaken you, breakdown parts sum to both powers, Iron Skin adds power, neutral play wins at the shown odds (Monte Carlo), locks (wounded / busy / bad stance / taming the beast you fight), habits unknown on a first fight, Drive never below 1, a Slay loss can kill (cause beast_hunt), retreat, finish → loot + karma by nature + cub, spare → a grateful return on the next sighting (tames free), bind → Lv.2 for a talisman, migration (bestiary, unknown-type battle dropped, fight without `to`) | 51 |
| `arena.js` | combat.md → A6-3b — rings lock by realm, rosters (4 + a champion) kept outside the world registry and stable, the fee starts a run, the bout survives a recalc, a win fills the purse (prize × streak × renown), each duelist once per run, walk away pays + the Arena rests (and reopens), the champion after N wins + the title, a loss pays half, blood ×3 / a coward refuses / finishing costs karma + the dead are replaced / a lost blood match kills (arena_blood), humbling = renown (no cowed clan), sect fame, call-outs (a psycho demands blood, the grudge-match purse, accept = no fee, decline = −renown), a debtor's gift, the purse multiplier, migration | 34 |
| `sell.js` | backpack.md → "Selling" — every non-currency item has a price; no recipe sells for more than its ingredients; sellItem pays value × n, logs, removes the stack at 0, clears a queued pill; refuses currency / unknown / bad qty / more than owned / equipped-only | 13 |
| `combat.js` (1.13a) | beast battles rewritten for move combat: the estimate within ±12% of real play (default policy), Qi + no cooldowns + Circulate, the parry window (0 damage + Qi, rate logged, Off = no prompt), element multipliers, mastery through use, Drive (never below 1) / Slay (death), retreat, an old-engine fight restarts on moves | — |
| `arts.js` | arts.md → "42a as built" — the library (≥ 72, unique, signatures for every beast + ring, starters), manuals as items priced by grade, root elements (pure/heavenly/deterministic), new-life starters + loadout, study (gates, timer, Comprehension, cancel, duplicate → mastery), loadout rules, passive slots by realm, breakthrough offers + layer grants, drops, old-save migration | 44 |
| `automation.js` | automation.md → "Queued targets" — Auto-Missions picks (≤ SECT_MAX_MISSIONS, fill free slots, swap on return without cancelling, [] = re-take what finished, rests in Active Mode, tick refills); beast Auto-Expedition (locked below Lv.5, last trip vs pick, pick changed mid-trip swaps on return, Active Mode stays home, off stays home, old-save migration); Auto-Explore's queued location swaps in on return | 26 |
| `qi-edge.js` | clan-succession.md → "NPC growth: your Qi edge" — PLAYER_QI_EDGE = 1.1; at every NPC stage and several roots, on the world / spouse / child paces, you are ≥ 1.1× an NPC with the same root and stage (and `_npcStageRate` = min(flat, yours ÷ 1.1)); a better-rooted NPC can still outpace you; `_advancePersons` over 600 years follows the per-stage pace and is idempotent; spouse + child growth are capped | 9 |
| `duels.js` | combat.md → A6-3a (on moves since 1.14a: a head challenge is a move fight, the estimate is a real contest, a grudge lowers it for the same person) —  a won fight waits for the end choice (finish / spare · raise / humble), reactions by temper (debt / grudge), the record on the person, karma for mercy, feud feedback (a debtor never challenges you, a grudge-holder likelier + `FEUD_POWER` stronger + yield ±`FEUD_YIELD`, cowed clan = only grudge-holders), the step-down bracket pausing on your bouts (saveable, nothing else starts meanwhile, win them all → the seat; a bloodless loss → eliminated, the rest settles; a lethal loss → the seat settles, then cause stepdown_tournament), migration | 29 |
| `rivals-libraries.js` | arts.md → "42c part 2 as built" (1.14b) — study desks 1 / 2 / 3 by realm (three at once at Nascent Soul, a fourth waits, each finishes on its own, stopping one returns only its manual, never cut short, an old single study migrates); rival counters (too few blows / no grudge → none; a grudge-holder you burned trains in Water, carries a Water art, defends as Water so Fire is resisted, scouting names it; landed blows are counted in a real fight); raise a stoic → taught an art (a new manual, theirs, never a signature), a psycho raised teaches nothing; finish → their manual (chance shown); the sect library (elements, rank-sealed grades, Contribution price, rank kept, refusals); the clan library (write cost, no basics, once, known → nothing to study, half time without a manual, stopping keeps the shelf); giving manuals to your sect (Contribution by grade, one copy per shelf, war strength by grade + cap, never "taking part", member + own odds match a 4,000-war Monte Carlo of the real roll, founder studies the shelf, leaving) | 49 |
| `bot-arts.js` | arts.md → "42d / task 1.15" — the sim bot's own arts policy: it answers a waiting offer (keeps the top grade), studies the best manual on a free desk, equips the strongest known moves + this realm's passives (never a wrong-kind/unknown art), sells a mastered manual, buys a missing sect-library art for Contribution, studies from the clan library and writes a mastered art in (with every desk busy), and gives a spare manual to the sect; the recorder's new invariants fire on an over-cap study list and an invalid loadout entry | 17 |
| `people-moves.js` | arts.md → "42c part 1 as built" (1.14a) — a person's arts are seeded (same person + realm → same arts, no Math.random), of their root / neutral, within their realm, never a signature, sized by stage, re-rolled at a new realm; the Arena champion's ring signature; stoics reach for wards far more than hotheads; scouting (arts seen stay seen, habits once fought); stances (until one yields: never below 1, they yield at 30% · to the death: 0 kills you); wounds carry; Yield (blocked mid-parry, refused into the log, accepted); the estimate is deterministic, near a 2,000-run MC, lower realm easier, a grudge lowers it; an old-engine fight restarts on moves | 29 |
| `soul.js` | soul-points.md (Phase 40a) — a failed Trial grants 20 + ½/% of the shown odds once (interlude refuses a second), the record sits outside the slot save and survives slot delete + reload + a second slot, rank cost 25 × 1.35^rank, one rank per spend, Qi/s ×1.05 per rank as a named breakdown part, refused when short (says how many more) and at the cap, v1 grant +500 once then +150 per later Immortal, dev lives never write the file (flag carries across death), a corrupt file is clamped | 26 |
| `world.js` | clan-succession.md 2.6a — world/life split, 2.5-era + pre-2.2 migrations, death keeps the world, orphan life | 13 |
| `family-marriage.js` | family.md A — affection, marriage + crisis events, duel win/lose/flee, sabotage, partner BQ term | 21 |
| `family-affairs.js` | family.md B — encounters, lovers, discovery, every spouse reaction, tolerant spouse | 19 |
| `children.js` | 2.6b — Family Planning, child growth + cap, child events, runaways, neglect drift, morality | 22 |
| `family-agency.js` | family.md 1.8b-3a — courtship (seek → court → meetings → propose, refusal → spurned → road encounter, withdraw), spouse actions + cooldowns + affection causes, dual cultivation gain/deviation, the ask plan (wishes, Not now, try, Cold refusal, expecting → birth), postpone, separation, raising actions (age locks, teach pulls morality, head-start xp), save migration (old default many → ask) | 44 |
| `family-fights.js` | family.md 1.8b-3b — cover tracks, confess vs caught (forgiveness rate), end it + scorn, ultimatum (one more season runs hot, marry = divorce + wed), marry a lover, the fight card (exchange odds reproduce the old match odds, habits → best read, wounds, yield refused/accepted), tournament spare | 21 |
| `family-beating.js` | family.md "A father's hand" — who counts as a bad father (cruel style / personality / his trauma / a cold bond, and no father at all for an orphan), the rare roll fires only while young + with a bad father (≈ BEATING_CHANCE 0.30), the −20 Health endure floors at 1 (never lethal), the scar (trauma) at 2 hits + the defiance memory, the reckoning gate (defiant + grown + outranking him), forgive/break, and the old-save migration | 25 |
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
