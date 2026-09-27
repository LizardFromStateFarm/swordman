# Family — Reference & Build Spec
_Covers: assets/data/family.js · assets/data/lifespan.js (child timing) · game-state.js (`s.family`, `_tickFamily`) · renderer/game/family-view.js (1.8b-3a) ·
game.js (family overlay, Stats family section, Explore encounter cards) · scripts/sim/* · Phase: 16-lite+ (M2) ·
Updated: 2026-09-26_

Builds on M2 task 2.5 (proposals, spouse, children, partner BQ term — life-loop.md §14) and the "age never kills"
change (§15). User-requested 2026-09-26: no child cap, spouse **affection** + personality-driven **marriage events**,
**affairs** via expedition encounters, and personality-weighted **discovery reactions**. Built in two commits:
**A** = affection, marriage + crisis events, duel card, former spouses, uncapped children — **✅ built** (b30d10b). **B** = lovers,
encounters, discovery reactions — **✅ built**.

## Depth pass (CLAUDE.md)
- **Memory:** `affection` (0–100), `tolerant`, `formerSpouses` (+ why each ended), lovers, `tally` per life.
- **Choices:** marriage events (2–3 choices; affection delta depends on the *spouse's* personality), crisis events,
  seduce/leave encounters, end an affair, fight/flee a duel.
- **Hooks:** PERSONALITIES (likes/dislikes, reactions) · breakthroughs (Devoted +5%, sabotage −25%) · Health/death
  (duel → `_die('spouse_duel')`) · Bloodline (partner term, lover children are heirs in 2.6) · expeditions (encounters)
  · Spirit Stones/Qi/Karma/Health (event costs/effects) · sect/beasts/children (events gated on them).
- **Drama:** best = a Devoted spouse who tolerates everything and boosts your cultivation; worst = a discovered
  affair → murder-suicide taking your young children, or a duel you lose. Low affection → the spouse cheats or leaves.
- **Feedback:** every choice moves affection; affection shifts which events fire (crisis pool < 25) and how a
  discovery goes (accept weight × aff/50, violent weights × (100−aff)/50).

## State (`s.family`, reset per life; `_ensurePhase16Fields()` backfills)
```
spouse: Person|null  affection: 0–100 (spouse's)  tolerant: bool (spouse accepted affairs)
children: Person[] (no cap; alive:false kept for the tree)   formerSpouses: Person[] (+ endedYear, endCause)
marriedYear, nextChildYear, spouseStageYear, proposal, nextProposalYear          — as in task 2.5
event: {id, crisis, year}|null   nextEventYear: number|null   duel: {year, reason}|null   btSabotage: bool
lovers: [{person, since, nextChildYear, endsYear}]    encounters: [{person, place, year}] (≤ LOVER_ENCOUNTER_MAX)   [B]
tally: {events, crises, affairs, discovered, accept, sabotage, duel, suicide, murder_suicide, left, duelWon, duelLost, fled}
```
`endCause` ∈ `left` (spouse walked out / you fled a duel) · `divorced` · `suicide` · `murder_suicide` · `duel` (you won).

## Data (`assets/data/family.js`, data only)
- Affection: `AFFECTION_START` 60 (+10 same personality as you), drift 0.3/yr toward 50, `AFFECTION_DEVOTED` 75,
  `AFFECTION_CRISIS` 25, `DEVOTED_BT_BONUS` 0.05, `SABOTAGE_BT_MALUS` 0.25.
- Events: every `MARRIAGE_EVENT_YEARS` [10,25] while married; below `AFFECTION_CRISIS`, `CRISIS_EVENT_CHANCE` 0.6
  to draw from the crisis pool instead. `MARRIAGE_EVENTS` (~24) / `MARRIAGE_CRISIS_EVENTS` (`spouse_cheated`,
  `spouse_leaving`): `{ id, title, text, requires?: 'sect'|'beast'|'children'|'stones', choices: [{ label, result,
  aff: {default, <personalityId>…}, cost?: {stones}, effect?: {qiFrac, health, karma, integrity, contribution},
  outcome?: 'forgive'|'duel'|'divorce'|'beg'|'let_go' }] }`. Text tokens: `{spouse}`, `{name}`, `{child}`.
- Crisis outcomes: forgive → +`FORGIVE_AFFECTION` 15 · duel → duel card · divorce/let_go → spouse leaves ·
  beg → `BEG_STAY_CHANCE` 0.4 to stay at affection 35, else leaves.
- Duel: win = clamp(0.5 + 0.08 × (your stage − spouse stage), 0.1, 0.9). Win → spouse dies (`duel`), you lose
  `DUEL_WIN_HEALTH_COST` 30 Health (min 1). Lose → `_die('spouse_duel')`. Flee → spouse leaves.
- [B] Encounters: `LOVER_ENCOUNTER_CHANCE` 0.12 per expedition from `PROPOSAL_MIN_STAGE`, max 3 pending, never expire;
  `SEDUCE_CHANCE` 0.65. Affairs fade on their own after `AFFAIR_YEARS` [15,50] (added after the first sim: without it
  lovers piled up to ~60 children per life). Discovery (married, not tolerant): 0.02 per lover per game year; 0.40 when a lover's child
  is born. On discovery: affection −25 (−10 more if via a child); tolerant spouse: −5, no reaction.
- [B] `AFFAIR_REACTIONS[personalityId] = {accept, sabotage, duel, suicide, murder_suicide}` weights (table in the
  2026-09-26 session / data file), scaled by affection as above.
- Children (lifespan.js): `CHILD_CAP` removed. Each partner has their own timer: `FIRST_CHILD_YEARS` [8,20] then the
  Family Planning interval (`CHILD_INTERVAL_BY_PLAN`, 2.6b). Children growing up, bond, child events and morality:
  see clan-succession.md §2.6b.

## API (game-state.js) — see also "1.8b-3a → As built" below
- `resolveMarriageEvent(i)` → `{ok, affection, outcome}` · `{ok:false, reason:'no_event'|'bad_choice'|'cant_afford'}`
- `resolveDuel('fight'|'flee')` → `{ok, outcome:'won'|'lost'|'fled', chance}` · `{ok:false, reason:'no_duel'|'bad_choice'}`
- [B] `seduceEncounter(i)` → `{ok, success}` · `dismissEncounter(i)` → `{ok}` · `endAffair(personId)` → `{ok}`
- `affectionLabel()`-style tiers are UI-only: Devoted ≥75 · Warm ≥50 · Cool ≥25 · Cold <25.
- Emits: `marriage_event`, `spouse_left`, `spouse_died {cause}`, `duel`, [B] `lover_encounter`, `affair_discovered {reaction}`.
  No banter pools for these (tragic outcomes are not joked about).

## Wiring
- `tick()` → `_tickFamily()` on each game-year change: spouse stage-ups → affection drift → spouse child → [B] lover
  children + discovery rolls → marriage event scheduling (only with no pending event/duel) → proposals.
- `resolveExpedition()` → [B] encounter roll (after the beast roll, before the injury check).
- `_recalc()` → breakthrough bonus: +Devoted, −sabotage. `attemptBreakthrough()` clears `btSabotage` after any attempt.
- game.js: `#family-overlay` (events, crises, duel) auto-opens once per pending item per session, Stats has
  "A family matter awaits" to reopen; Stats family section (spouse + affection, former spouses, [B] lovers + End
  affair, children); [B] Explore encounter cards (Seduce / Leave). All overlays go in BanterSystem's `isBlocked`.

## Invariants (sim)
1. `affection ∈ [0,100]`; spouse null or alive; `event`/`duel` only while married.
2. Every living child's `parents` includes `self.id`; dead children keep `alive:false` + `diedYear`.
3. [B] `encounters.length ≤ LOVER_ENCOUNTER_MAX`; a lover is never the current spouse.

## Gotchas
- Nothing here runs offline — only `tick()` advances the family (pillar 4). Pending event/duel cards never expire.
- Murder-suicide kills only **minor** children shared with that spouse (`gameYear − bornYear < ADULT_AGE`).
- Log text for suicide/murder-suicide/duel deaths stays somber and non-graphic.
- A spouse who leaves stays in `formerSpouses`; the BQ partner term uses the current spouse, else the last former one.
- `familyCost()`/`familyText()`/`marriageEventDef()`/`duelChance()` are public because the UI and the bot read them.
- Event Qi effects are skipped while `qiCap` is Infinity (post-Ascension stub stage) — the first sim produced `qi=Infinity`.
- In the sim, forcing `Math.random` to a constant hangs `resolveExpedition()`'s beast-trait loop; scenario tests must
  override the VM's RNG (`sim.ev('Math.random = …')`) only around family calls.

## Sim evidence (2026-09-26, full `npm run sim`, 3 seeds, 200h; bot seduces 25%, fights at ≥ 60%)
0 errors / 0 violations. Casual median life 34.5h (in the 20–40h band), active 9.1h, afk 3.0h. Per 200h run totals —
casual: 172 events / 9 crises, 95 affairs → 48 discovered (reactions acc 6 / sab 23 / duel 10 / sui 6 / murder 3), 10
duels fled; active: 106 affairs → 47 discovered, duels 4 won / 4 lost / 11 fled (4 lives ended in a spouse duel).
**Open tuning question:** casual lives now average ~49 children (lives run ~1,100 game years with no cap). Stats shows
the 12 youngest; save size grows ~0.3 KB per child. A genre-flavored fix would be longer child intervals at higher
realms ("the higher the realm, the harder to conceive") — not done without the user's call.

## 1.8b-3a — Family agency + Family view (spec, 2026-09-27; user approved the split + "Ask me" default)
Depth Pass rule 6: nothing the player would decide about courtship, their spouse or their children is decided for
them. NPCs still act (a matchmaker's offer, a spouse's wish for a child, a spouse refusing when Cold). 1.8b-3b
(next) covers affairs on your terms (end/hide/confess, a lover's child as a choice) and a say in duel/tournament fights.

**Courtship (you choose who).** Unmarried, from `PROPOSAL_MIN_STAGE`: **Seek a match** (stones, `COURT_SEEK_COST`
scaled like event costs) shows `COURT_CANDIDATES` strangers. Pick one → `f.court.target`, `interest` starts at
`COURT_INTEREST_START` (+`COURT_SAME_PERSONALITY`). Each **meeting** (one per `COURT_BEAT_GAP_YEARS`) draws a
`COURT_BEATS` card, 3 choices, interest delta keyed by the *target's* personality. After `COURT_BEATS_TO_PROPOSE`
meetings you may **Propose**: chance = interest/100 + `COURT_STAGE_WEIGHT` × (your stage − theirs) + (karma − 50) ×
`COURT_KARMA_WEIGHT`, clamped to `COURT_PROPOSE_RANGE` (breakdown `data-bd="propose"`). Yes → wed, affection starts
at `AFFECTION_START + (interest − 50) × COURT_AFFECTION_CARRY`. No → they join `f.spurned` (≤ `SPURNED_MAX`), and
**Seek** cools down `COURT_SEEK_COOLDOWN_YEARS`. **Withdraw** any time (same cooldown). A spurned suitor can later
turn up as a road encounter (`SPURNED_ENCOUNTER_CHANCE` of encounters, "an old flame"). Matchmaker proposals stay.

**Spouse actions** (`SPOUSE_ACTIONS`, each on its own cooldown in `f.spouseCd`):
- 伴 **Spend time** — costs a slice of Qi (`qiFrac`), affection by personality.
- 禮 **Bring a gift** — stones (scaled), affection by personality (misers and gluttons love it).
- 合 **Dual cultivation** — gain Qi = `DUAL_QI_BASE + DUAL_QI_PER_STAGE × (spouse stage − yours)` (clamped
  `DUAL_QI_RANGE`) of the cap, +affection. Risk of a **qi deviation** = clamp((`DUAL_SAFE_AFFECTION` − affection)/100,
  `DUAL_RISK_RANGE`) → `DUAL_DEVIATION` (Health, Integrity, affection). Both numbers shown on the button.
- 嗣 **Try for a child** — if affection < `AFFECTION_CRISIS` the spouse refuses (says so in the log); else a child is
  expected in `PREGNANCY_YEARS`. Cooldown `CHILD_TRY_GAP_YEARS`.
- **Separate** — divorce by choice (confirm). Children shared with that spouse lose `SEPARATE_CHILD_BOND` bond.
Every affection change records its cause (`f.lastAff = {delta, why, year}`); `f.affTrail` samples affection each
game year (last `AFF_TRAIL_MAX`) for the trend arrow. Breakdown `data-bd="affection"`.

**Children: "Ask me" is the default plan.** `planning` ∈ `ask` (default) · none · some · many. Under `ask` a
partner's child timer raises a **wish** (`f.childWish = {partnerId, year}`, one at a time, never expires) — Yes →
expecting; Not now → affection `CHILD_WISH_DECLINE_AFF` (by personality) and the timer restarts. Some/Many are an
explicit delegation (births as before) and stay overridable: **Try for a child** always works, and **Not this time**
pushes the next delegated birth back one interval. Migration: saves on the old default `many` become `ask` (some/none
were explicit choices and are kept). `f.expecting = [{partnerId, dueYear}]` → born on the year tick.

**Raising a child** (`CHILD_ACTIONS`, per-child cooldowns `c.cd`, tallies `c.raised`):
- 伴 **Spend time** (any age) — Qi slice, bond by the child's personality.
- 授 **Teach your art** (from `TEACH_MIN_AGE`) — bigger Qi slice, xp (a head start banked before awakening), bond by
  personality, and morality pulled `TEACH_MORALITY_PULL` toward *your* morality (karma shapes your children).
- 資 **Give resources** (from `GIFT_MIN_AGE`) — stones, xp, bond; spoils some personalities (morality −).
Neglect drift, child events and runaways stay as in 2.6b; these actions are how you fight the drift.

**As built (2026-09-27):**
- API (game-state.js): `canSeekMatch()` · `seekMatch()` · `courtTarget(id)` · `canMeet()` · `meetTarget()` ·
  `courtBeatDef()` · `courtText()` · `resolveCourtBeat(i)` · `proposeChance()` → `{total, raw, parts, meetings, need}` ·
  `canPropose()` · `propose()` → `{accepted}` · `withdrawCourtship()` · `spouseActionPreview(kind)` / `spouseAction(kind)`
  (time · gift · dual) · `tryChildPreview()` / `tryForChild()` · `answerChildWish(yes)` · `postponeChild()` ·
  `separateFromSpouse()` · `childActionPreview(id, kind)` / `childAction(id, kind)` (time · teach · gift). Previews return
  `{ok, reason?, readyYear?, minAge?, qi?, stones?, aff?/bond?, xp?, morality?, qiGain?, risk?}`; reasons: cooldown ·
  qi · stones · young · gone · expecting · cold · stage · courting · meetings · pending · married.
- Internals: `_wed(person, affection)` (shared with `acceptSuitor`), `_birth(partnerId)` (every birth; lover-child
  discovery moved here), `_raiseChildWish`, `_conceive`, `_partnerById`, `_changeAffection(delta, why)`.
- New state: `planVer, childWish, expecting[], spouseCd{}, childTryYear, lastAff, affTrail[], court, seekCooldownYear,
  spurned[]` on `s.family`; `cd{}` + `raised{}` on each child. `court = {candidates[], target, interest, meetings,
  nextMeetYear, beat, lastBeatId, seen[]}`. Emits `child_wish`.
- Seek unlocks at `max(maxStageThisLife, stageIndex) ≥ PROPOSAL_MIN_STAGE` (dev presets leave maxStageThisLife at 0).
- Sim (60h × 3 profiles × 2 seeds, bot: casual keeps "Ask me" and says yes 75%, active delegates 'some', afk 'many'):
  0 errors, 0 invariant violations; casual median children per life 11 (was ~49 under the old 'many' default).
- Checks: `scripts/sim/checks/family-agency.js` (44). Smoke: `scripts/smoke/scenarios/family.js` (fam-*.png).

**Family view (Kin → Family)** — spouse card (or courtship card), wish card, children grid (all children, no
youngest-12 cap; Overlay = compact rows, tap to expand actions), lovers, former spouses (folded), heir row. Attention:
urgent 願 child wish; ready 約 courtship meeting; idle 冷 spouse Cool/Cold with an action ready.

## 1.8b-3b — Affairs on your terms + your own fights (spec, 2026-09-27; user approved as one task)
**Affairs.** The world still rolls discovery, but every player-side choice is explicit (lover cards, Family view):
- **Cover your tracks** (`coverTracks(id)`): stones (`COVER_TRACKS_COST`, scaled) → that lover's discovery chance
  × `COVER_DISCOVERY_MULT` for `COVER_YEARS`. `affairRisk(id)` returns the yearly chance and why (shown on the card).
- **Confess** (`confessAffair(id)`, married, spouse not tolerant): the discovery reaction runs with accept ×
  `CONFESS_ACCEPT_MULT`, violent × `CONFESS_VIOLENT_MULT`, and a smaller affection hit (`CONFESS_AFFECTION`).
- **End it** (`endAffair(id)`): the lover takes it by personality — `LOVER_SCORN` chance to go to your spouse
  (a discovery) or, when you're unmarried, to become a rival (`_noteEnemy`). Otherwise a quiet goodbye.
- **Make it official** (`marryLover(id)`, unmarried): wed the lover (`LOVER_WED_AFFECTION`).
- **Ultimatum** (NPC): when an affair reaches `endsYear` it no longer fades silently; the lover asks
  `lover.ultimatum` — `answerLoverUltimatum(id, 'marry'|'let_go'|'one_more')`: marry (divorces your spouse if you have
  one), let go (same scorn roll as End it), or one more season (`AFFAIR_EXTEND_YEARS`, discovery ×
  `AFFAIR_HOT_DISCOVERY_MULT` meanwhile). Never expires.
**Your fights** (spouse duel, challenging the head, defending the seat): `f.fight = {kind, oppId, lethal, you, them,
round, log}` — first to `FIGHT_TO` exchanges. `fightInfo()` gives each tactic's win chance this exchange;
`fightExchange('press'|'guard'|'feint'|'yield')`. Press beats Feint, Feint beats Guard, Guard beats Press
(± `FIGHT_EDGE`); the opponent's move is drawn from `FIGHT_STYLE[personality]` (shown as a temper hint). The base
exchange chance is derived from the old match odds (duelChance / expected fight power) so neutral play keeps the
old balance. Each lost exchange costs `FIGHT_WOUND` Health (never below 1 mid-fight). **Yield**: non-lethal → the
non-lethal loss at once; lethal → accepted with `YIELD_ACCEPT_BASE` + opponent morality/100 (+ bond for kin), else
the fight goes on. Outcomes are the old ones (death, deposed, spouse leaves, cooldown…).
**Tournament of Heirs:** `fightTournamentRound(pairs, spare)` — `spare` = indexes of pairs whose loser you spare in a
lethal round: they live but leave the house in disgrace (estranged, bond `TOURNAMENT_SPARE_BOND`). Trauma only lands
on a round where someone died; `lethalFought` only then.
**As built (2026-09-27):** as specced. Also: `canChallengeHead()`/`_branchWarBusy()` refuse while `f.fight` is set and
NPC head challenges wait; `familyPendingKey()` puts a fight first; the family overlay renders `renderFightCard()`
(game.js). The old one-roll `_resolveFight` is still used by NPC-only brackets (step-down tournament). Tests use
`fought(sim, gs, start, 'win'|'lose')` (checks/succession.js) to play a fight out under a forced RNG.
Checks: `scripts/sim/checks/family-fights.js` (21). Smoke: `scripts/smoke/scenarios/fights.js` (fight-*.png).
Sim (60h × 3 profiles × 2 seeds): 0 errors / violations; bot plays exchanges (active reads habits, yields hopeless
lethal fights), answers ultimatums, covers tracks (active), spares ~20% of tournament losers (casual).
