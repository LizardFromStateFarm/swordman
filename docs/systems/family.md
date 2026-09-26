# Family — Reference & Build Spec
_Covers: assets/data/family.js · assets/data/lifespan.js (child timing) · game-state.js (`s.family`, `_tickFamily`) ·
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
- Children (lifespan.js): `CHILD_CAP` removed. Each partner has their own timer: `FIRST_CHILD_YEARS` [8,20] then
  `CHILD_INTERVAL_YEARS` [15,30].

## API (game-state.js)
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
