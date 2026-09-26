# Clan Succession — Build Spec (M2 tasks 2.6a–2.6f)
_Covers: world/life save split · clan registry (main line + ≤3 branches) · children who cultivate · bond + morality ·
Tournament of Heirs · reign simulation · rebirth as a descendant (or orphan) · head challenges · succession tournaments
· branch wars · secession · Phase: 16/18C/31 rework (M2) · Updated: 2026-09-26 · **Status: spec, signed off by the user 2026-09-26**_

**Replaces the old task 2.6** ("choose an heir at death and play as them", life-loop.md §4.3/§5.1/§7 heir parts).
User-designed 2026-09-26. You never *play as* your heir. The heir (an NPC) takes over the clan; the world simulates
their reign; you are **reborn one generation later as a descendant** who doesn't remember, and nobody knows it's you.
Everything here respects pillars 4 (nothing progresses offline except idle jobs) and 7 (systems talk to each other).

## Depth pass
- **Memory:** per-child `bond` (how you treated them), per-person `morality` (−100 ruthless … +100 righteous),
  lethal-tournament `trauma`, clan `tradition` (how successions have gone), clan-to-clan `relation` (−100…+100).
- **Choices:** family planning, child events, choose an heir vs host a Tournament of Heirs (you pick matchups), bet on
  the next head if you die with no heir, orphan vs clan rebirth, challenge the head, sign up for a succession
  tournament, go to war as a branch, secede and found a new clan, answer challenges when you are head.
- **Hooks:** family.md (spouses, affection, lovers, children) · Bloodline (heir strength term) · own sect (goes with
  the head) · breakthroughs/stage (every duel/tournament fight uses stage + root) · Health/death (lethal fights end
  lives) · personalities (every NPC decision) · random events + banter · life-loop.md 2.7 (Ancestral Hall, legacies).
- **Drama:** best — you raised a loving, righteous heir who raises a warm family, and you're reborn as the favored
  eldest who inherits in peace. Worst — you butchered your children in a tournament, your traumatized heir runs the
  clan with an iron fist, you're reborn into a branch, and the head answers your challenge with a duel to the death.
- **Feedback:** how you raise children shapes who they become; who they become shapes how they rule, pick *their*
  heir, and treat *you* in your next life. Not 1:1 — a heir who survived hell can still become a loving parent.

## World vs life (task 2.6a — foundation)
The save slot = **one world**. Split the current single state object:
```
s.world  (persists across lives; never reset by a death)
  year            — world clock (was per-life s.gameYear; advanced only in tick())
  persons: {id: Person}           — every NPC that matters (heads, heirs, branch members, spouses, your past selves)
  clans:   {id: Clan}             — see below; the player's clan and any clans that split off / you founded
  playerClanId, playerLineId      — null when you were born an orphan
  pastLives: [{personId, clanId, cause, year, …}]
  nextId                          — person/clan id counter (moves here from s.clan.nextId)
s.*      (the current life — everything else, reset on rebirth exactly as _newGame() does today)
Clan = { id, name, foundedYear, founderId, headId, lines: [Line] (main line first, ≤ 1 + 3 branches),
         sect: {…ownSect snapshot}|null, tradition: {lethalTournaments, peacefulSuccessions, challenges},
         relations: {clanId: −100…100}, history: [{year, text}] }
Line = { id, name ('Main Line' / 'Eastern Branch' …), headId, memberIds: [] }
```
`CLAN_CARRY_KEYS` from life-loop.md becomes simply "`world` survives; the life resets". `s.clan` (task 2.2 skeleton) and
per-life `gameYear` migrate into `s.world` (`_ensurePhase33Fields()`, next free phase number 33). NPC persons never tick
per frame: they're advanced in coarse steps (see reign sim) or on the yearly `_tickFamily` for your own household.
Pruning: persons who are dead, not a head/heir, and ≥ 3 generations old are dropped (keep names in `history`).

## Children who cultivate, bond, morality (2.6b)
- **Family planning** (per marriage, changeable in Stats; also applies to lovers): None / Some (40–70 yrs) / Many
  (15–30 yrs, today's pace). Big families stay possible, never forced.
- **Children cultivate:** from `ADULT_AGE` a child gains a stage every `CHILD_YEARS_PER_STAGE / root.mult` years,
  capped at your own stage (they can't outgrow you while you live), so a tournament has real stakes.
- **Bond** (0–100, per child, starts 50): child events (like marriage events, keyed by the *child's* personality —
  teach them, take them adventuring, punish them, favor a sibling, skip their coming-of-age) and big acts (lethal
  tournament: survivors −30 unless ruthless).
- **Morality** (new Person field, −100…100): starts at a per-personality base (`PERSONALITY_MORALITY`, e.g. niceguy +50,
  psycho −60) ± noise, nudged by upbringing (bond, your karma, witnessing a lethal tournament). The M3 alignment
  phase (13) extends this field later instead of adding a second one.

## Succession while you live (2.6c)
- **Choose an heir** any time from Stats (an adult living child, incl. lover children), or leave it open.
- **Tournament of Heirs** (you are clan head): all adult children fight. **You pick each round's matchups.** Rounds
  are lethal until 4 remain, then the Top 4 fight non-lethally (semis + final). Fights resolve by stage, root,
  personality (hot-blooded all-in, cowards may yield…) and a little luck; each round is a log + bracket screen.
  Winner = designated heir; the other three will found the 3 branch families when the heir takes over.
- Holding one shifts clan `tradition` and survivors' bond/trauma.
- **Heir strength → Bloodline:** growth gains `BLOODLINE_G_HEIR × (heirStage / 22)²` (heir = whoever becomes head).
  **Forged in trauma (user, 2026-09-26):** if the heir *won their place through trauma* — survived the lethal rounds of
  a Tournament of Heirs or a lethal succession tournament, or won a duel to the death for the headship — growth gains
  an extra flat `BLOODLINE_G_TRAUMA_HEIR` on top (the blood that survives the crucible runs stronger). Recorded as
  `trauma` on the heir's Person so the reign sim (2.6d) and the Ancestral Hall can show it.
- **Sect:** the clan head owns the clan's sect. Your founded sect goes to the heir on your death (stored on `clan.sect`).

## Death → the heir's reign → rebirth (2.6d)
1. **Who takes over:** your designated heir; else the clan picks by its own succession rules (strongest adult child,
   weighted by bond with the elders and the tradition). If you had no heir chosen, **you bet first**: pick which
   child you think becomes head. Win the bet → reborn in the main line; lose → reborn in a branch.
2. **The heir's parenting style** is rolled, not copied: inputs = their bond with you, personality, morality,
   trauma. Styles: *nurturing* · *strict* · *neglectful* · *ruthless*. A trauma survivor rolls "never again" (warmer)
   or "the cycle continues" (colder) — so a heir who went through hell can still be a loving parent.
3. **Reign sim** (one generation, ~ `REIGN_YEARS`): the heir marries, has children (planning drawn from their style),
   their children get bonds/morality from that style, branches grow, the clan sect's fortunes move a little. Only
   coarse steps, no per-frame work. A short "chronicle" of the reign is shown before rebirth.
4. **Rebirth position** (you don't remember; nobody knows): eldest of the main line (young master / heir apparent),
   a younger main-line child, or a branch child. Weighted by the bet (if any), the head's style, and luck.
   Or choose **Born an orphan** — outside any clan; the clan lives on in the world without you.
5. You start at `AWAKENING_AGE` with the new person's root/personality (rolled from the parents, `blendRoot`), a
   starting bond with the head drawn from the head's style, and the clan's current sect/wealth as context.

## Clan politics in a life (2.6e)
- **Challenge the head** (from Stats, once your stage is within `CHALLENGE_STAGE_GAP` of theirs): **the head decides**
  lethal or non-lethal — from their style, morality, bond with you and tradition. Non-lethal loss → cooldown
  (`CHALLENGE_COOLDOWN_YEARS`) and bond −20; lethal loss → your life ends. Win → you become head (main line), with the
  clan's sect.
- **When you're head,** NPC challengers arrive as events (children, branch heads); **you decide** lethal or not.
- **Head steps down** (random per year, weighted by style/age of reign) → **mass succession tournament**: anyone
  adult in the family may sign up (you choose to). The head's style decides lethality. Winner = new head, Top 4 lead
  the main line + 3 branches (branch members stay with their branch; only its leadership changes).

## Branch wars and secession (2.6f)
- As a **branch member** you can push your branch head toward war; as a **branch head** you can declare a **branch
  war** on the main line (resolves like sect wars — strength of lines, allies from relations). Win → your branch
  becomes the main line (you become head if you lead it). Lose → your branch head is deposed or killed.
- **Secede** (branch head only): leave with your branch and found a **new clan** that starts with one line — yours.
  The old clan stays in the world as a **rival or ally** (relation from how you left: peaceful exit vs war,
  heads' morality, bond). The slot follows your new clan; the old clan keeps living as an NPC clan (M4's living
  world later gives it more to do).

## Build order (one commit each, docs + sim coverage every time)
| Task | Scope | Done when |
|---|---|---|
| 2.6a ✅ | `s.world` split + migration, orphan-capable life, world clock | old saves migrate; sim identical except clock bookkeeping; save round-trip holds |
| 2.6b ✅ | Family planning, children cultivate, bond + child events, morality | sim: children reach stages; bond/morality ranges hold |
| 2.6c ✅ | Choose heir, Tournament of Heirs (pick matchups), heir-strength BQ term, sect to head | tournament resolves with correct lethal/non-lethal split; BQ term applied |
| 2.6d | Parenting styles, reign sim + chronicle, rebirth position, heir bet, orphan option | 500h sim spans ≥3 generations; positions + styles distributed sensibly |
| 2.6e | Challenge head (head decides lethality), challenged-as-head events, step-down mass tournament | all paths reachable in sim; no life ends without a cause |
| 2.6f | Branch wars, secession → new clan, clan relations | a seceded clan persists as rival/ally; slot follows the new clan |
Then life-loop.md 2.7 (Ancestral Hall, legacies — Sect Continuity legacy is superseded by 2.6c) and 2.8 (tuning).

## Open questions (decide during the relevant task, flag to the user)
- Bet/rebirth weights, `REIGN_YEARS`, challenge gap/cooldown, step-down rate — draft values in each task's data file.
- Orphan lives: can an orphan later marry into / be adopted by a clan? (Default: no adoption in M2; found your own.)
- How the heir's chronicle is shown (one overlay card vs. a scroll of log lines).

## 2.6a — as built (2026-09-26)
- **Shape:** `s.world = { v, year, nextId, nextClanId, persons, clans, playerClanId, playerLineId, pastLives }`. Clan =
  `{ id:'c1', name, foundedYear, founderId, headId, lines:[{id:'c1-main', name:'Main Line', headId, memberIds}], sect:null,
  tradition:{lethalTournaments, peacefulSuccessions, challenges}, relations:{}, history:[] }`. Separate `nextClanId` so
  person ids stay `p1, p2…` exactly as before.
- **Code:** `_newGame(world = null)` (fresh slot → `_newWorld()` with a founding, still-unnamed clan), `_blankWorld()`,
  `_foundClan()`, idempotent `_joinClan()`, `_playerClan()` (null = orphan), public `person(id)`,
  `_recordLifeInWorld()` (called by `_die()`: snapshots the full past self — root/personality/stage — plus spouse(s)
  and children into `world.persons`, keeps the living family on the clan roster, vacates the head seat, appends
  `pastLives`). `_newPersonId(w)` counts on the world. Every `s.gameYear` is now `s.world.year` — it **no longer
  resets on death**.
- **Migration:** `_ensurePhase33Fields()` runs first in the ensure chain; builds the world from the old `s.clan` +
  `s.gameYear` (or derives the year from age / time played), deletes both. `_ensurePhase31Fields()` is gone.
  `_ensurePhase30Fields()` now also puts the living player on their clan's roster.
- **Placeholder until 2.6d:** after a death the new life takes the vacated head seat, exactly like before (via
  `_joinClan`). The living player is never duplicated in `world.persons` (sim invariant).
- **UI:** Stats shows "Clan: <name> clan · N members · you lead it" (or "None — an orphan of the world") and "World Year".
- **Sim:** invariants `world_invalid`, `world_self_duplicated`, `world_player_clan_missing`,
  `world_player_not_on_roster`, `world_past_lives_mismatch`; the save round-trip check now compares the world
  (except `nextId`, which an offline encounter can advance). **Also fixed:** the bot used Node's *unseeded*
  `Math.random` for its Family-B coin flips, so sim runs weren't reproducible — it now has its own seeded stream
  (`mulberry32(seed ^ 0x9E3779B9)`), separate from the game's.
- **Evidence:** old vs new code (both with the seeded bot) produce **identical** reports over 6h × 3 profiles × 3 seeds
  (no deaths in that window); two runs of the new code are identical (reproducible). Longer runs diverge only after
  the first death, because the world clock now carries over (the yearly family tick lands at a different moment).
  Full `npm run sim`: 0 errors / 0 violations, 135 save round-trips incl. the world. 13 scripted checks (fresh
  world, 2.5-era + pre-2.2 migrations, death persistence, a full orphan life) + the 40 family checks still pass. Real
  app: an old-format slot (clan "Lin", year 200) migrated on Continue, re-saved in the new format, zero console errors.

## 2.6b — as built (2026-09-26)
- **Family Planning** `family.planning` ∈ none/some/many (`CHILD_INTERVAL_BY_PLAN` in lifespan.js: null / [40,70] / [15,30]; default
  many). Gates spouse AND lover births. `setFamilyPlanning(plan)`; turning it back on schedules the next birth
  `FIRST_CHILD_YEARS` out (no backlog). Stats has a None/Some/Many selector. `CHILD_INTERVAL_YEARS` is gone.
- **Children grow:** new child fields `bond` (starts 50), `morality`, `xp`; from `AWAKENING_AGE` they gain
  `root.mult / CHILD_YEARS_PER_STAGE` (12) stage-progress per year, capped at your current stage (and 21). Stats shows
  each child's age, stage and a bond word (Close ≥70 · Fond ≥45 · Distant ≥20 · Estranged).
- **Child events:** 12 in `CHILD_EVENTS` (family.js) — bond keyed by the CHILD's personality, plus `morality`, `train`
  (stage progress), `favor` (siblings −5), costs/effects shared with marriage events via `_applyFamilyEffect()`. One
  pending at a time every `CHILD_EVENT_YEARS` [8,18] for a child aged ≥ 6; `requires: 'adult'|'siblings'`. A child with
  bond < 20 and adult may instead trigger `child_runaway` (50%): **fetch** (+25 bond) or **let go** (`estranged`: stays
  in the world registry at death, off the clan roster, stops growing). `resolveChildEvent(i)`, `childEventDef()`.
  The family overlay shows duel → marriage event → child event, in that order.
- **Big households spread you thin (added after the first sim):** with more than 4 children at home, every child's
  bond drifts DOWN (0.5/yr) toward `50 − 2 × (extra children)`, floored at 15. Without it, bonds barely moved (a few
  dozen events spread over 20–46 children) and runaways never happened. Big families stay possible — they just cost
  closeness, which feeds the heir flow in 2.6c/d.
- **Morality** on every generated person: `PERSONALITY_MORALITY` base ± 15, children + (your karma − 50) × 0.2; your own
  morality is snapshotted at death (base + karma − 50). Affair reactions now read it: accept × (1 + max(0,m)/100),
  duel/murder-suicide × (1 + max(0,−m)/100). Old saves backfill the base (no Math.random in migrations).
- **Sim:** bot sets planning once (active 'some', casual/afk 'many'); answers child events (active: what the child likes,
  always fetches; casual/afk: random). New "Children" report table (born, strongest child's stage, mean bond, mean
  morality, events, runaways). Invariants: `family_planning_invalid`, `child_bond_range`, `morality_range`,
  `child_stage_over_parent`, `child_event_orphaned`.
- **Evidence** (full sim, 3 seeds, 200h): 0 errors / 0 violations. Strongest child reaches stage 21 (your cap) for active
  and casual. Mean bond: active 24.6 (0 runaways — it fetches), casual 16.4 (97 runaways over 14 lives), afk 41.6.
  Casual median life 30.5h (20–40h band). 22 new scripted checks + all 53 earlier ones pass. Real app: planning
  selector, child rows with stage + bond, a child event (bond 50 → 62), a runaway let go → "left the clan"; zero errors.
- **Tuning note:** neglect is strong — casual's random choices plus ~36 children leave most children distant. Knobs:
  `CHILD_ATTENTION` / `CHILD_NEGLECT_PER_CHILD` / `CHILD_NEGLECT_FLOOR` in family.js.

## 2.6c — as built (2026-09-26)
- **Heir:** `family.heirId` — `chooseHeir(childId)` (living, adult, at home; not mid-tournament), `clearHeir()`,
  `eligibleHeirs()`. Cleared automatically if the heir dies or runs away.
- **Tournament of Heirs** (`family.tournament` while running; `family.lastTournament` = {year, ranking[≤4], entrants,
  deaths, lethal} after): `startTournament()` (≥ 2 eligible), `tournamentInfo()` → {round, n, lethal, fights, pool},
  `fightTournamentRound(pairs)` — exactly `fights` pairs, every fighter at most once; unpaired fighters rest.
  A round is lethal while n > 4 and has `min(⌊n/2⌋, n − 4)` fights, so the field never drops below the Top 4
  (7 → 3 fights → 4; 10 → 5 then 1). Then non-lethal knockout to one winner. `cancelTournament()` only before the
  first fight. Fight odds: logistic((powerA − powerB) / 80), power = stage×100 + root×10 + personality
  (hot-blood +40, psycho +30, demon king +20, arrogant +10, poet −10, lazy −20) ± 60 luck. A coward facing a lethal
  loss yields 35% of the time (loses, lives). Each death: karma −3, spouse affection −15 if it was their child.
  After each lethal round **every survivor** (fighters, yielders, those who sat it out) gains `trauma` and bond
  −30 (psycho/demon king +5) — once per child. Winner = heir; ranking 2–4 = future branch founders. A lethal
  tournament bumps `clan.tradition.lethalTournaments`. A field that shrinks to one between rounds (runaway/death)
  ends with that child as heir (handled in `_tickFamily`, never inside `_recalc`).
- **Bloodline:** growth += `BLOODLINE_G_HEIR` (4) × (heir stage / 22)² + `BLOODLINE_G_TRAUMA_HEIR` (2) if the heir has
  `trauma`. `lastReincarnation` gained `heirStage`, `heirTrauma`, `heirKind` ('chosen'|'tournament'), `heirTerm`,
  `tournamentDeaths`.
- **For 2.6d:** at death `clan.pendingSuccession = {fromPersonId, year, heirId, branchFounderIds}` and, if you had
  founded a sect, `clan.sect` = a snapshot of it (+ `heirId`). The new life still doesn't receive the sect — 2.6d's
  reign sim decides what the heir does with it.
- **UI:** Stats "Heir" row (★ forged in blood) with **Name an Heir** / **Tournament of Heirs** buttons; `#heir-overlay`
  (pick from eligible children: stage · personality · bond · scarred) and `#tournament-overlay` (click a fighter
  then their opponent to pair; click a paired fighter to unpair; Auto-pair fills the rest; red frame while lethal;
  round log with deaths in red). Pairing state is render-layer only.
- **Sim:** bot fights a running tournament strongest-vs-weakest; 'active' hosts one per life at 6+ adult children
  from Nascent Soul; everyone names the strongest adult child heir otherwise. "Succession" report table.
  Invariants `heir_invalid`, `tournament_too_many_deaths`, `tournament_pool_invalid`.
- **Evidence:** full sim 0/0 (active: 22 tournaments over 23 lives, 43 children killed, 22 heirs forged in blood, mean
  BQ heir term 5.08 vs casual's 3.61). 31 new scripted checks (field-size rules for 5/6/7/9/10 entrants, deaths,
  trauma incl. those resting, bonds, karma, spouse affection, BQ term, pending succession, sect snapshot, coward yield,
  validation, call-off, heir rules) + 75 earlier ones pass. Real app: named an heir, ran a 6-child tournament by
  clicking pairs (2 deaths) then Auto-pair through the Top 4; zero console errors.
