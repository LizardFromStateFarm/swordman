# Clan Succession — Build Spec (M2 tasks 2.6a–2.6f, 2.7 plan)
_Covers: world/life save split · clan registry (main line + ≤3 branches) · children who cultivate · bond + morality ·
Tournament of Heirs · reign simulation · rebirth as a descendant (or orphan) · head challenges · succession tournaments
· branch wars · secession · Ancestral Hall + Clan Legacies (plan) · Phase: 16/18C/31 rework (M2) · Updated:
2026-09-26 · **Status: 2.6a–f built; 2.7 is a reconciled plan, not yet built**_

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
| 2.6d ✅ | Parenting styles, reign sim + chronicle, rebirth position, heir bet, orphan option | 500h sim spans ≥3 generations; positions + styles distributed sensibly |
| 2.6e ✅ | Challenge head (head decides lethality), challenged-as-head events, step-down mass tournament | all paths reachable in sim; no life ends without a cause |
| 2.6f ✅ | Branch wars, secession → new clan, clan relations | a seceded clan persists as rival/ally; slot follows the new clan |
Then life-loop.md 2.7 (Ancestral Hall, legacies — Sect Continuity legacy is superseded by 2.6c) and 2.8 (tuning).

## Open questions (decide during the relevant task, flag to the user)
- ~~Challenge gap/cooldown, step-down rate~~ — decided during 2.6e's build: `assets/data/succession.js`, retuned
  once against a full sim run (see qa-sim.md Gotchas — the first draft fired ~4× too often). (Bet/rebirth weights +
  `REIGN_YEARS`: decided in 2.6d, same file.)
- Orphan lives: can an orphan later marry into / be adopted by a clan? (Decided 2026-09-26: no adoption in M2 — an
  orphan's death returns to the last clan's succession, or you can stay an orphan.)
- ~~How the heir's chronicle is shown~~ — decided 2026-09-26: one overlay card (5–8 lines), also saved to
  `clan.history` and readable from Stats → Clan Chronicle.

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

## 2.6d — as built (2026-09-26)
Data: `assets/data/succession.js` (styles, weights, chronicle text, upbringing events). Code: `game-state.js` "2.6d" block.
- **Death is now two-phase.** `_die()` records the life (2.6a), then builds the next life **unborn** (`_newGame(world, true)`
  — joins no clan) and opens `s.interlude`. While it's set, `tick()` returns early (no clock, no Qi), offline catch-up
  is skipped, sect wars / random events / banter are silent, and `_ensurePhase30Fields` never puts the unborn self on
  a roster. It survives save/load. Steps: **bet** (only if needed) → **chronicle** (+ clan/orphan choice) → `_beginLife()`.
- **Who takes over** (`_beginInterlude` → `_runSuccession`): the outgoing head is **you if you led the clan, else the
  NPC head who reigned through your life** — one generation passes per death either way. Candidates
  (`_successionCandidates`): the outgoing head's living adult children on the roster → else their minor children
  (regency) → else any living adult of the clan → else anyone → else the clan is **extinct** (orphan only). Your named
  heir (head only) takes the seat with no bet. Otherwise, with ≥ 2 candidates, you **bet** (`placeBet`, top
  `BET_MAX_CANDIDATES` 8 shown by stage/personality/bond, not odds); the clan then picks with
  `exp((score − best)/SUCCESSION_SPREAD)`, score = stage×100 (×1.3 if the tradition is bloody) + root×10 + bond×2.
  The old NPC head steps down into seclusion (role `elder`, alive). Non-tournament successions bump
  `tradition.peacefulSuccessions`.
- **Branches:** a tournament's places 2–4 found branches; otherwise the strongest other adult main-line sibling founds
  one — while fewer than 3 exist. Branch names from `BRANCH_NAMES`. A successor from a branch moves to the main line.
- **Parenting style** (`_rollStyle`): base 25 each; nurturing + (bond−50)×0.8 + max(0,morality)×0.3, neglectful +
  max(0,50−bond)×0.5, ruthless + max(0,−morality)×0.4, + `STYLE_PERSONALITY_BIAS`. Trauma: 50/50 "never again"
  (nurturing +50) or "the cycle continues" (ruthless +50, strict +25) — shown in the chronicle.
- **Reign** (`REIGN_YEARS` 40–80): the head marries (generated spouse, joins the main line) and has
  `HEIR_CHILDREN[style]` children; the clan sect's fortune rolls from `SECT_FORTUNE[style]` (grow Hall+1 / hold /
  decline Hall−1 + a disciple leaves / **lost** → `clan.sect = null` and the taking sect becomes a world enemy); one
  flavor event per style. 5–8 chronicle lines, saved to `clan.history` (cap 200).
- **Rebirth** (`chooseRebirth('clan'|'orphan')` → `_beginLife`): world year = death year + reign; every living NPC grows
  coarsely (`_advancePersons`: `root.mult / 12` stages per year past 16, cap 21, `grownYear` marker). The head's
  household is generated either way (children ~6–12 years apart, bonds from the style). Position weights
  `POSITION_BASE` 20/50/30 × bet won (2.0/1.3/0.5) or lost (0.4/0.8/2.5) × `POSITION_STYLE`; branch needs a living
  branch head; "younger" needs ≥ 2 children. A branch birth generates that branch's household. You get a rolled given
  name, the clan surname, parents, `blendRoot` of their roots, `s.birth` = {position, clanId, lineId, headId,
  headStyle, headBond (style range + eldest +10 / branch −10), betWon, rival, stipend…}. **Stipend:** 60 × sect Hall ×
  style mult × position mult (eldest 1, younger ½, branch ¼) — the clan sect's support, if the reign kept it.
  **Orphan:** no clan, no upbringing; `world.lastClanId` remembers where you came from, and an orphan's death runs
  that clan's succession (you can go back, or stay an orphan).
- **Rival-family rebirth (user, 2026-09-26):** `RIVAL_REBIRTH_CHANCE` 2%, only on a clan birth and only if
  `world.enemies` has an entry (recorded when a spouse declares a duel — betrayal or affair — when a sect war is
  declared, or when a sect takes the clan sect). You're born into that enemy's house: a new clan named for their
  surname (a sect enemy gets a rolled one), reused if it already exists, relation −60 both ways, `rivalOf` set.
  The slot now follows that clan. Phase 28K later turns this into your named same-generation rival's line.
- **Bloodline:** the heir term (2.6c formula) is now added at rebirth for **whoever took the seat**, using their stage
  after the reign's growth — not only a named heir. `lastReincarnation.birth` records position/style/bet/sect fate.
- **Upbringing:** 1–4 years into a clan life, one event from `UPBRINGING_EVENTS[head's style]` (8 total); the bond
  change is keyed by **your** personality; effects share `_applyFamilyEffect`. Shown in the family overlay after
  duel/marriage/child matters. `resolveUpbringingEvent(i)`.
- **Head-only:** `chooseHeir` / `startTournament` return `not_head` unless you lead the clan (only the first life, until
  2.6e adds challenges). An unnamed founding clan takes your surname at your first death.
- **Registry pruning:** dead persons older than `WORLD_PRUNE_YEARS` (400) that aren't a past life, founder or head are
  dropped (30-generation check: ≤ ~150 persons).
- **UI:** the death card walks the interlude — bet buttons (name · age · stage · personality · bond · scarred), then
  "The Reign of X · Style" with the chronicle and your bet result, then "Be born into the X clan" / "Be born an orphan",
  then a birth card. Stats: Clan (members · branches), Standing (line · position), Clan Head (stage · style), Your
  Bond, **Clan Chronicle** button (`#chronicle-overlay`, newest first). Heir/Tournament rows only for the head.
- **Sim:** see qa-sim.md (bot bets/rebirths, "Between lives" table, 2.6d invariants). Scenario checks:
  `scripts/sim/checks/succession.js` (45).
- **Evidence:** full `npm run sim` (27 runs) and a 500h × 3 profiles × 2 seeds run: 0 errors / 0 violations
  (135 + 122 save round-trips). 500h: active 10 deaths → 7 bets (4 won), styles spread over all four, rebirths
  eldest 1 · younger 5 · branch 3 · **rival 1**, sect fates grow/hold/decline/lost all seen; every profile spans ≥ 3
  generations. 152 scenario checks (45 new in succession.js). Real app: `scripts/smoke/scenarios/succession.js` —
  bet → chronicle → clan birth → Stats rows → Clan Chronicle → upbringing → mid-interlude save resumed; zero console
  errors. **Pacing:** 10-seed 200h vs the pre-2.6d commit — median life unchanged (casual 31.5h vs 30.5h, active 9.7h
  vs 10.6h); casual runs that reach Ascension 7/10 vs 5/10 (the heir Bloodline term now always applies — mild).
- **Sim fixes along the way:** the bot set Family Planning once per *run* (later lives fell back to 'many'); deaths
  inside a bot check-in (Ascension) now resolve the interlude before the bot acts again; the clan stipend is
  attributed in the stone ledger ('clan_stipend').

## 2.6e — as built (2026-09-26)
Data: `assets/data/succession.js` "Clan politics in a life" block. Code: `game-state.js` "2.6e" block.
Headship can now change **mid-life**, not only at death — the first way any of this happens outside the
death→interlude flow.
- **Challenge the head** (`canChallengeHead()`/`challengeHead()`, Stats — only when not head, within
  `CHALLENGE_STAGE_GAP` (3) of the sitting head, and off cooldown): the head decides lethal or not
  (`_headDecidesLethal` — style + how little they're liked (bond, defaulting to 50 unless they're still your
  birth head) + morality + personality + a bloody clan tradition, same "bloody" test succession scoring already
  uses), then one fight resolves at once (`_resolveFight`, the same power formula/logistic/coward-yield the
  Tournament of Heirs uses). Win lethal → the head dies, you take the seat **and the clan's founded sect**
  (`clan.sect`, only if you don't already run or belong to one — `!s.ownSect.founded && !s.sect.id`), forged in
  blood (`trauma = true` + an immediate `+BLOODLINE_G_TRAUMA_HEIR` to your own Bloodline Quality — a live version
  of 2.6c/d's heir term, since you're the one who was tempered in the fight, not a future rebirth). Win non-lethal
  → same seat, the old head lives on as an `elder`. Lose lethal → `_die('challenge_lost')`. Lose non-lethal →
  `CHALLENGE_COOLDOWN_YEARS` cooldown + `CHALLENGE_BOND_LOSS` off your bond with the head.
- **Challenged as head** (`resolveHeadChallenge(lethal)` — the family-overlay's highest-priority card, right after
  a duel): an NPC from the clan roster within `CHALLENGER_STAGE_GAP_MAX` of your stage calls you out
  (`_pickChallenger`, scheduled by `_tickFamily` every `CHALLENGER_EVENT_YEARS` at `CHALLENGER_EVENT_CHANCE` odds);
  **lethality is your own choice**, not algorithmic. Same fight/outcomes as above, mirrored: you win lethal → the
  challenger dies; you win non-lethal → they live; you lose lethal → `_die('challenged')`; you lose non-lethal →
  you step down, they take the seat, your life goes on.
- **Step-down mass tournament** (`answerStepDown(join)` — the family-overlay's second-highest card): while an NPC
  leads (not you), `_tickFamily` rolls a chance every `STEPDOWN_CHECK_YEARS` (`STEPDOWN_CHANCE[style]` +
  `STEPDOWN_REIGN_YEARS_MULT` × years already reigned) that they step back; `_stepDownEntrants` gathers every
  adult clan member (any line, **you included** if adult) except the stepping-down head. If you're not eligible
  the tournament resolves itself immediately (`answerStepDown(false)`, no card shown) — only your own eligibility
  earns you a say. The whole event is ONE lethality decision by the retiring head (`_headDecidesLethal` again,
  policy for the whole bracket, not per-round), then `_runBracket` — the exact 2.6c shape (lethal while more than
  `TOURNAMENT_TOP` remain, non-lethal after, so the Top 4 always survive to lead the main line + up to 3 branches)
  generalized to any mix of world persons and the living player, with **random pairing each round** (nobody picks
  matchups here, unlike your own Tournament of Heirs). A losing player is only marked (`selfOut`), never killed
  inside the bracket — the caller finishes with `_die('stepdown_tournament')` only after the new head and branches
  (`_foundBranchesFrom`) are already committed, so your own death lands in an already-consistent clan. Lethal →
  `clan.tradition.lethalTournaments++`; non-lethal → `peacefulSuccessions++` (both feed the "bloody clan" bias
  everywhere else already reads it). 1v1 challenges (both directions) bump `clan.tradition.challenges` — a field
  the 2.6a schema already had, unused until now.
- **Shared machinery:** `_isBloody(clan)`, `_headDecidesLethal(head, clan, bond)`, `_resolveFight(fA, fB, lethal)`
  (a cowardly loser may still yield, `TOURNAMENT_COWARD_YIELD`), `_applyLethalTrauma(res, lethal)` (anyone who
  lives through a lethal fight is scarred — winners included — same rule 2.6c uses, generalized to you or any world
  person), `_selfAsPerson()` (you, shaped like a fight participant: live stage/root/personality over the stored
  `s.self`), `_installHead(clan, personId)` (moves the seat, demotes the outgoing head to `elder` if they're still
  alive, rolls a parenting style for a new NPC head who doesn't have one yet, or hands you the sect).
- **UI:** Stats gains a "Challenge the Head" button (non-head only, hidden past the stage gap; a dimmed cooldown
  note otherwise) reusing the generic confirm dialog (`showConfirm`, now takes an optional 4th `label` argument —
  every prior call site silently said "Delete" regardless of the actual action; fixed in the same change: "Begin"
  for the Tournament of Heirs, "End It" for ending an affair, "Pass the Mantle", "Discard", and now "Challenge").
  Both new decisions (an NPC's challenge, a step-down offer) reuse `#family-overlay`/`familyPendingKey` exactly
  like a duel or marriage event — no new overlay markup.
- **Sim:** see qa-sim.md "Clan Politics (2.6e)" + Gotchas (the first tuning pass fired ~4× too often and dominated
  every profile's deaths — fixed by widening the check intervals and adding an explicit chance gate on top).
  Scenario checks: `scripts/sim/checks/succession.js` (+37, using `overrides` to force `TOURNAMENT_LUCK = 0` and a
  stage gap for deterministic fights, and `LETHAL_CHANCE_RANGE = [0,0]`/`[100,100]` to force the head's decision).
  Real app: `scripts/smoke/scenarios/succession.js` (+1 section) — the Challenge button + confirm dialog, an NPC
  challenge card, a step-down card, all resolved live.
- **Evidence:** `npm test` (59 files), `npm run checks` (189, was 152), full `npm run sim --hours=200 --seeds=3`
  before/after tuning — 0 errors/0 violations throughout; Life Loop medians restored to target bands (active 8.1h,
  casual 21.0h, both within life-loop.md's [5,15]/[20,40]; afk 3.3h, unaffected — it rarely checks in). New "Clan
  Politics" report table: active 10 challenges (4W/6L) + 19 step-downs (1 won) per 200h; casual 8 (1W/7L) + 29 (0
  won) — casual mostly loses challenges it opportunistically tries and rarely wins a step-down bracket against a
  field it didn't optimize for, which is the intended flavor (a savvy `active` player seeks the seat; a casual one
  mostly doesn't). `npm run build:web`, `npm run dist`. Real-app smoke: zero console errors.
- **Known gaps (2.6f's job, not this one):** branch members can't yet push their branch to war or secede; a
  step-down tournament can only ever install a NEW head from the CURRENT clan's own roster, never spin off a
  rival branch the way 2.6f's secession will.

## 2.6f — as built (2026-09-26)
Data: `assets/data/succession.js` "Branch wars & secession" block. Code: `game-state.js` "2.6f" block.
Only the living player ever starts any of this — pushing a branch head to war, declaring war as a branch head,
or seceding outright. No NPC branch acts on its own (that stays M4's living-world job); the player's own line
is always the one in motion, and always the attacker in a war (never the defending main line).
- **War strength:** `_lineStrength(clan, line)` sums `_fightPower` (the same stage×100 + root×10 + personality
  + luck formula every fight in 2.6c–e uses) over a line's living, non-estranged adults — you included, via
  `_selfAsPerson()`. Any OTHER line (a third branch, uninvolved in the war) rolls a side — 1/3 attacker · 1/3
  defender · 1/3 stays out — and lends `BRANCH_WAR_ALLY_LINE_SHARE` (half) of its own strength if it picks one;
  a log line names who backed whom. Win odds are the same logistic every fight uses, just over aggregate power
  and a wider spread (`BRANCH_WAR_SPREAD` 260 vs. a 1v1 fight's `TOURNAMENT_SPREAD` 80).
- **The losing side's head** (never the player when the defending main line loses — the player is only ever the
  attacker) is deposed unless a flat roll (`BRANCH_WAR_DEATH_CHANCE` 0.35, + a bonus if the clan's own tradition
  already runs bloody) kills them instead. Deposed-but-alive → `role: 'elder'`. Either way the line needs a new
  head: the strongest other living adult in that same line takes it over (`role: 'branch_head'` — the loser's
  line is, by definition, never the one that ends up leading the clan, even a demoted old main line), mirroring
  `_installHead`'s own branch-demotion pattern. If the loser is the PLAYER's own declared war and they die,
  `_die('branch_war')` runs last, once every other consequence (new line heads, the swap below) is already
  committed — same ordering discipline 2.6e's step-down tournament uses.
- **Win → your branch becomes the new main line:** `clan.lines[0]` is swapped with your line; the OLD main line
  is simply relabeled (a fresh `BRANCH_NAMES` pick) rather than removed — no new line is ever created by a war,
  only by secession. `clan.headId` moves to your line's head. A war death (either side) bumps
  `clan.tradition.lethalTournaments`; a bloodless one bumps `peacefulSuccessions` — the same fields 2.6c/e
  already read for the "bloody clan" bias, so a clan that has fought and lost bloody branch wars runs hotter
  everywhere else too (lethality rolls, step-down chance).
- **Push vs. declare:** a branch MEMBER (not its head) can only *push* — `_branchHeadWarWill(head, clan, atk,
  def)` is the NPC branch head's own call (personality base weight + how the numbers look, clamped to ±1 ×
  `BRANCH_WAR_WILL_STRENGTH_MULT` + a bloody-tradition bonus), so a head who thinks they'd lose usually declines
  (cooldown, no war fought, no tally). A branch HEAD can *declare* outright — it's their own decision, no NPC
  will-check. **Either way, "you become head if you lead it"**: winning as a mere pusher never makes YOU head —
  your NPC branch head leads the win and keeps the seat; only declaring (you already ARE that line's head)
  puts you in the clan headship on a win.
- **Secede** (branch head only, no fight, no cooldown): `_foundClan` makes a brand-new clan from a rolled
  surname (distinct from the old one); your whole branch LINE (not just you) moves over as its new main line.
  The relation between old and new clan (`clan.relations`, both directions) reads `SECESSION_RELATION_BASE` (a
  little goodwill even on a flat parting) + `(bond with the head you left − 50) × SECESSION_RELATION_BOND_MULT`
  + `_selfMorality() × SECESSION_RELATION_MORALITY_MULT` — a fond, righteous exit reads very differently from a
  cold, ruthless one. `world.playerClanId`/`playerLineId` move to the new clan (the slot follows it); the old
  clan keeps living in the world, unaffected otherwise. Deliberately does **not** feed `world.enemies` (the rare
  rival-rebirth mechanic) — that mechanism rolls a fresh surname-based rival clan on its own and would produce
  a second, disconnected clan rather than reusing the one you actually just split from; `clan.relations` is the
  correct, already-built mechanism the spec calls for here.
- **Shared machinery:** `_branchInfo()` (your line, whether it's the main line, whether you head it),
  `_lineStrength`, `_branchAllies`, `_branchHeadWarWill`, `_branchWarBusy()` (a running Tournament of Heirs /
  pending challenge / pending step-down offer blocks all three — same "busy" gate `chooseHeir` uses), and
  `_resolveBranchWar(clan, attackerLine)` — the one instant-resolution core both `pushBranchWar()` (after the
  NPC head agrees) and `declareBranchWar()` call. `_selfMorality()` is new too (the live version of the formula
  `_recordLifeInWorld` already snapshots at death).
- **UI:** Stats, inside the existing "not head" clan block — only when your line isn't the main line: a
  "Branch Strength" preview row (`branchWarPreview()`: your line's power vs. the main line's), then either
  "Push for War" (member) or "Declare War on the Main Line" + "Secede — Found a New Clan" (branch head), each
  behind the existing generic confirm dialog. No new overlay markup — every outcome resolves at once and shows
  up as `addEvent` log lines + a `flashMessage` toast, exactly like a challenge.
- **Known gap:** a player deposed from their own branch's headship (a lost declared war, survived) has no
  built path back to reclaiming it — there's no "branch step-down" equivalent. Left for a later pass if it
  turns out to matter; the player can still push wars for *someone else's* headship as a plain member instead.
- **Sim:** `scripts/sim/bot.js` — 'active' plays a branch head aggressively (declares once favored by
  `branchWarPreview()`, secedes occasionally otherwise as casual/afk do too); a branch member pushes rarely,
  every profile exercising both paths without every branch life turning into a war. New `family.tally` fields
  `branchWars`/`branchWarsWon`/`secessions` (flow into the "Clan Politics" report table and
  `lastReincarnation.familyTally` automatically, no new plumbing). Invariants: `clan_relation_range` (every
  `clan.relations` value stays −100…100), `branch_war_tally_mismatch`, `branch_war_cooldown_invalid`. Scenario
  checks: `scripts/sim/checks/succession.js` (+33: gating for main-line/member/head/cooldown/busy, a won and a
  lost branch war with survival, a lost branch war with death, a refused and an accepted push — including the
  "pushing never makes YOU head" case — and a full secession).
- **Evidence:** `npm test` (59 files), `npm run checks` (222, was 189). Full `npm run sim --hours=200 --seeds=2`:
  0 errors/0 violations, 50 save round-trips; branch wars fired for real in every profile (active declared once;
  afk pushed once) without being forced. `npm run build:web`, `npm run dist`.

## 2.7 — Ancestral Hall & Clan Legacies (plan, reconciles life-loop.md's pre-2.6-redesign draft)

`life-loop.md` §2.1/§2.2/§3.2/§4.2–4.4/§5.1/§7/§31A–H were written **before** the 2.6 redesign above existed —
they assume a single `s.clan` with `merit`/`legacies`/`tree`/`firsts`/`bestStageIndex` living directly on it, and a
death flow (`_endLife`/`_beginNewLife`) that no longer exists (`_die` → `_recordLifeInWorld` → the interlude →
`_beginLife`, this doc's 2.6a/2.6d). This section is the authoritative plan for task 2.7, written against the real
`s.world`/`Clan`/`Person`/interlude architecture 2.6a–f actually built. **life-loop.md keeps its numbers** (§3.1/§3.2's
constant tables — `MERIT_STAGE`, `CATCHUP_QPS_MULT`, the legacy cost/value table, etc.) — only the **state shape and
hooks** below supersede it. Not yet built; sign-off needed before code (same as 2.1's own "review before code" rule).

### Depth pass
- **Memory:** `clan.merit`/`meritEarned`/`firsts`/`legacies`/`bestStageIndex`/`ascendedAncestors` persist on the
  **Clan object** across every life lived in that clan; `lifeMerit`/`inheritedManual` are per-life.
- **Choices:** which legacies to buy and when (any time, per life-loop.md §4.2), which known technique becomes the
  Family Manual, whether to grind a cleared realm manually instead of letting catch-up auto-breakthrough carry you
  through it (no toggle needed — pillar 3, unlocks not automation-only).
- **Hooks (≥3):** Bloodline (bloodline.md's growth formula sits beside the new Merit/catch-up formulas, both keyed
  by `maxStage`) · succession/clan (this doc's `tradition`/`relations`/`pendingSuccession` — Merit/firsts attach to
  the SAME Clan object those already mutate) · sect (own-sect fortune is already decided in the 2.6d reign sim —
  the `sect_continuity` legacy is cut, not duplicated) · random events/banter (a new `ascended_ancestor` trigger) ·
  automation (catch-up auto-BT reuses `_tickAutomation()`'s dispatch shape but is a base mechanic, not one of Phase
  22's opt-in unlocks).
- **Drama:** best — five generations deep, a clan with a stacked Family Manual + Heirloom + an Ascended Ancestor
  blessing breezes to the frontier stage in under an hour and reaches for a genuinely new first. Worst — Merit
  hoarded on the wrong legacy for a clan that then secedes or goes extinct and the ledger resets to zero, or an
  Ascended Ancestor who — for the first time in M2 — simply cannot act anymore: a real ending, not a dead zone
  wearing a costume.
- **Feedback:** what you claim as firsts and how you spend Merit shapes how fast every FUTURE life in that same
  clan clears realms you already broke.

### State — extends the real `Clan`/per-life shapes from 2.6a, not the old `s.clan`
Add to `Clan` (in `_foundClan()`'s object, plus a new `_ensurePhase34Fields()` migration that back-fills every clan
already in `w.clans` for old saves — next free `_ensurePhaseN` number after 33):
```
merit:            number                    — unspent Ancestral Merit
meritEarned:      number                    — lifetime total (UI/stats only)
firsts:           { [firstId]: {gen, year} } — claimed once per CLAN (see "per-clan" note)
legacies:         { [legacyId]: level }
manualTechId:     string|null               — Family Manual pick, from `techniquesEver`
techniquesEver:   string[]                  — every technique any member of this clan has learned
bestStageIndex:   number                    — highest stage anyone in this clan has ever reached (catch-up gate)
ascendedAncestors: number                   — successful Ascensions from this clan
blessingStacks:   number                    — ≤ ANCESTOR_BLESSING_QPS_MAX, one per Ascended Ancestor (31F)
```
Add to per-life state (`_newGame()` + `_ensurePhase34Fields()`):
```
lifeMerit:        [{id, label, merit}]      — firsts/deeds claimed THIS life; credited to clan.merit at death
inheritedManual:  string|null               — Family Manual technique id inherited from the clan; free to learn
```
**No new `clan.tree` array.** The family tree reads data 2.6a already writes: `world.pastLives` (filtered to the
clan/line chain the slot has belonged to, across secession/rival-rebirth) joined against `world.persons[personId]`
for name/root/personality/spouse/children/epitaph. A second copy of the same data would just be a sync bug waiting
to happen.

**Per-clan, not per-world (flag to confirm before 2.7a):** `firsts`/`merit`/`legacies`/`bestStageIndex` all live on
the Clan object, so a branch that secedes (2.6f) or the rare rival-rebirth into an enemy's house starts that new
clan's ledger at zero — no carry-over of catch-up or unlocked legacies into a different clan. This costs nothing to
build (it's just where the fields live) and reads thematically fine (a new lineage, a new legacy), but is a real
behavior change worth confirming.

### API / hooks
- `_claimFirst(id)`: idempotent, operates on `this._playerClan()` — the CURRENT clan, so a mid-life secession claims
  firsts on the NEW clan from then on. Pushes `{id, label, merit}` to `s.lifeMerit`. Wired into: `attemptBreakthrough()`
  (realm firsts, on entering a NEW realm, not every stage), `attemptAscension()` (`asc_attempt` always, `ascended` on
  success), `joinSect`/`foundOwnSect`, `tameEncounteredBeast`, own + member war win resolvers, `acceptSuitor`
  (`married`), first child born in `_tickFamily()`.
- Merit credit moves into `_recordLifeInWorld()` (the real place a life's outcome gets written into the world, née
  `_endLife`): `MERIT_STAGE × (maxStage/22)² + sum(lifeMerit) + capped deeds` → `clan.merit +=`, `clan.meritEarned +=`.
  `clan.bestStageIndex = max(clan.bestStageIndex, maxStage)` updates here AND live in `attemptBreakthrough()` (so
  catch-up kicks in for a still-living sibling immediately, not only at the next death).
- `buyLegacy(id)` / `setFamilyManual(techId)` / `legacyLevel(id)`: as life-loop.md §4.2 drafted, but read/write
  `this._playerClan()` instead of the old `s.clan`.
- Legacies apply at `_beginLife()` (2.6d's rebirth — where the heir/branch/orphan life is actually built):
  `ancestral_stipend` → starting `spiritStones`; `heirloom`/`beast_lineage` → captured from the DYING life's
  `equipped`/best beast at `_recordLifeInWorld()` time (a small snapshot field, same pattern as the existing sect
  snapshot on `clan.pendingSuccession`), applied to the new life's `inventory`/`equipped`/`beasts` at `_beginLife()`;
  `family_manual` → `inheritedManual = clan.manualTechId`, free once the new life reaches its `minStage` (checked in
  `attemptBreakthrough()` too, matching life-loop.md's "free once eligible" decision). ~~`sect_continuity`~~ **cut**
  — already free and unconditional via `clan.sect` + the 2.6d reign sim (noted in 2.6f's build-order table already).
- **Ascended Ancestor ending (31F — fixes the post-Ascension dead zone):** `attemptAscension()` success currently
  just sets `stageIndex = 22, ascended = true` and keeps playing at an unreachable stub stage — confirmed still the
  case (`renderer/engine/game-state.js` attemptAscension()). Change: on success, claim `ascended` (large Merit),
  `clan.ascendedAncestors++`, `clan.blessingStacks = min(+1, ANCESTOR_BLESSING_QPS_MAX)`, mark the dying person's
  record `ascendedAncestor: true` (a ★ in the Hall's tree + its own epitaph flavor), then `_die('ascended')` — routes
  through the **already-built** interlude/rebirth flow exactly like any other death, instead of leaving the
  character alive at a stage with nothing left to do. `_recalc()` applies `clan.blessingStacks × ANCESTOR_BLESSING_QPS`
  to Qi/s unconditionally (a permanent clan-wide blessing, not gated by catch-up).
- **Ancestral catch-up (31E):** in `_recalc()`, while `stageIndex < clan.bestStageIndex`: Qi/s `× CATCHUP_QPS_MULT`,
  breakthrough chance `+ CATCHUP_BT_BONUS` (still capped at 0.98). Catch-up auto-BT is a small addition to
  `_tickAutomation()`'s existing dispatch shape — attempt `attemptBreakthrough()` the instant Qi is ready, same
  Ascension-Trial exclusion (`stageIndex === length − 2`) Auto-Breakthrough already has — but NOT gated behind Phase
  22's per-stage automation unlocks; it's a base catch-up mechanic, always on below the clan's best.

### UI — the Ancestral Hall
Expands the existing `#chronicle-overlay` (2.6d, today just `clan.history`) into `#hall-overlay`, opened from the
same Stats button (relabeled "Ancestral Hall 祖祠"), with the chronicle as one section among several:
1. **Records** — clan name, generation, best realm reached, lifetime Merit, Ascended Ancestors, unspent Merit.
2. **Family tree** — built from `world.pastLives` (newest first, per life-loop.md §5.4) joined against
   `world.persons[personId]` for name/root/spouse/children/epitaph (`EPITAPHS[cause]`, new in `clan-legacies.js`),
   with a ★ mark for `ascendedAncestor`.
3. **Legacies** — buy buttons per `CLAN_LEGACIES` (life-loop.md §3.2's list, minus `sect_continuity` (cut here) and
   `longevity_blood` (already cut, §15) → 5 entries),
   Family Manual technique picker gated by `clan.techniquesEver`.
4. **Chronicle** — unchanged, `clan.history`.
Same 300px-fits / scrollable / ≥32px tap targets / `BanterSystem.isBlocked` selector rule as every other overlay.

### New data file
`assets/data/clan-legacies.js` — `MERIT_STAGE` / `MERIT_DEED_*` / `CATCHUP_*` / `ANCESTOR_BLESSING_*` /
`CLAN_FIRSTS` / `CLAN_LEGACIES` (5 — `sect_continuity` and `longevity_blood` both cut) / `EPITAPHS`. Top comment per Rule 5.

### Build order (2.7 sub-tasks — one commit each, same discipline as 2.6a–f)
| Sub-task | Scope |
|---|---|
| 2.7a ✅ | State: Clan fields + `_ensurePhase34Fields()` migration, `clan-legacies.js` data file |
| 2.7b ✅ | Merit: `_claimFirst` wired into every hook, credited in `_recordLifeInWorld()`, `bestStageIndex` live-updated |
| 2.7c ✅ | Legacies: `buyLegacy`/`setFamilyManual`/`legacyLevel`, applied at `_beginLife()`, heirloom/beast-lineage capture at death |
| 2.7d ✅ | Ascended Ancestor ending: `attemptAscension()` routes to `_die('ascended')`, blessing stacks, dead-zone gone |
| 2.7e ✅ | Ancestral catch-up: Qi/s + BT bonus below clan best, catch-up auto-BT in `_tickAutomation()` |
| 2.7f ✅ | Ancestral Hall UI: `#hall-overlay` (records/tree/legacies/chronicle), Stats button rename |
Sim + docs + scenario checks every sub-task per CLAUDE.md's rules; full evidence (npm test/checks/sim/dist/build:web/
smoke) at minimum once at the end of 2.7, npm test + checks + sim:quick after each sub-task.

### Open questions (decide during the relevant sub-task, flag to the user)
1. **Per-clan Merit/legacies/firsts/bestStageIndex** (default above) — a secession or rival-rebirth starts a fresh
   ledger in the new clan. Confirm before 2.7a.
2. Heirloom/Beast Lineage capture-at-death timing: piggybacks on `_recordLifeInWorld()`'s existing sect-snapshot
   pattern — needs its own small snapshot field. Decide during 2.7c.
3. Does the Ascended Ancestor ending get its own death-overlay text/epitaph flavor beyond the plain `ascended` cause
   (life-loop.md §31F implies yes — "a large Merit award... play continues with the heir" should read differently
   from an ordinary death)? Decide during 2.7d.

Then 2.8 (tuning): Merit costs, catch-up strength, per PLAN.md's roadmap.

### 2.7a/2.7b — as built (2026-09-26)
- **State:** `_foundClan()` now seeds every new Clan with `merit/meritEarned/firsts/legacies/manualTechId/
  techniquesEver/bestStageIndex/ascendedAncestors/blessingStacks`; `_ensurePhase34Fields()` (new, runs right after
  `_ensurePhase33Fields()` in the `_recalc()` chain) backfills those onto every clan already in an old save's
  `w.clans`, seeds `bestStageIndex` from what the save already knows (`maxStageThisLife`/`stageIndex`/
  `lastReincarnation.maxStageReached`) so an existing clan's catch-up threshold never regresses to 0, and adds
  the per-life `lifeMerit`/`inheritedManual` fields. New `assets/data/clan-legacies.js` (`MERIT_STAGE`, deed/
  catch-up/blessing constants, `REALM_FIRST_ID`, `CLAN_FIRSTS`, `CLAN_LEGACIES` — 5 entries, `sect_continuity` and
  `longevity_blood` both cut — and `EPITAPHS`), wired into `index.html` + `scripts/sim/loader.js`.
- **Merit hooks:** `_claimFirst(id)` (idempotent per clan, queues onto `s.lifeMerit`) wired into `attemptBreakthrough()`
  (realm firsts, on a realm change — also updates `clan.bestStageIndex` live), `attemptAscension()` (`asc_attempt`
  every call, `ascended` on success), `joinSect`, `foundOwnSect`, `tameEncounteredBeast`, both war-win resolvers
  (`_resolveSectWar`/`_resolveMemberWar` — gated by `this._warLive`, see gotcha below), `acceptSuitor` (`married`),
  and the child-birth helper (`first_child`). `learnTechnique()` now also appends to `clan.techniquesEver` (the
  pool 2.7c's Family Manual picks from). Merit itself (`clan.merit`/`meritEarned`) is credited once, in
  `_recordLifeInWorld()`: `MERIT_STAGE × (maxStage/22)² + sum(lifeMerit) + capped deeds` (deeds = war wins this
  life × `MERIT_DEED_WAR_WON` + beasts owned × `MERIT_DEED_BEAST` + disciples × `MERIT_DEED_DISCIPLE`, capped at
  `MERIT_DEED_CAP`) — matching where the rest of a life's outcome already gets written into the world.
- **Gotcha found and fixed:** offline catch-up (`initSlot()`'s bounded replay loop) can resolve a sect/member war
  while the app is closed, and that loop already sets `this._warLive = false` for exactly this reason (it already
  gated `war_won`/`war_lost` banter/events on it). Claiming `war_won` unconditionally broke the save-round-trip
  invariant the first time an offline-resolved win was *also* a clan's very first war win ever (`world.clans`
  changed between a snapshot taken before close and the state after reopening, which the round-trip check treats
  as a violation — same category of assumption the pre-existing "an offline expedition can mint a person id" note
  already carves an exception for). Fixed by gating both `_claimFirst('war_won')` calls behind `this._warLive`,
  same as the banter/event emit right next to them — an offline-only win still counts toward `warVictories` and
  spoils as before, it just doesn't claim the *first* until a live win does.
- **Sim:** new invariants `clan_merit_negative`, `clan_best_stage_range`, `clan_first_unknown`/`clan_first_invalid`
  (added to the existing 2.6f clan loop in `checkInvariants`). `CLAN_FIRSTS`/`CLAN_LEGACIES`/`MERIT_*`/`CATCHUP_*`
  exposed via `scripts/sim/loader.js`'s `sim.data` for 2.7c–e for use in bot/check code.
- **Evidence:** `npm test` (60 files, was 59), `npm run checks` (222, unchanged — no player-facing behavior yet).
  Full `npm run sim --hours=200 --seeds=2`: 0 errors/0 violations, 50 save round-trips, across 26 lives spanning
  every profile. No new pacing/dead-zone flags beyond the already-known, still-unfixed post-Ascension dead zone
  (2.7d's job).

### 2.7c–2.7f — as built (2026-09-26)
- **2.7c Legacies:** `_legacyValue(clan, id)`, `buyLegacy(id)` (`{ok,level}` / `{ok:false, reason:'unknown'|'locked'|
  'maxed'|'merit'}`), `setFamilyManual(techId)` (`{ok:false, reason:'no_legacy'|'unknown'|'tier'}` — tier = the
  bought level's `family_manual` value, the max technique `minStage` it can pick), `legacyLevel(id)`. Applied at
  `_beginLife()` via `_applyLegacies(clan, capture)`: `ancestral_stipend` → starting stones; `heirloom` → equipped
  weapon/artifact (1-2 slots by level); `beast_lineage` → a level-1 offspring of the best beast owned at death;
  `manualTechId` → `s.inheritedManual` (free in `learnTechnique()` once eligible — one `free` flag added there).
  `learnTechnique()` also appends every learned id to `clan.techniquesEver` (the Family Manual's own pool).
  - **Bug found by the new scenario checks, fixed before it ever reached a real save:** heirloom/beast-lineage
    carry read `clan.pendingSuccession` at `_beginLife()` time — but `_runSuccession()` (called earlier in the
    SAME interlude, right after death) already deletes `clan.pendingSuccession` once it's done with it, long
    before `_beginLife()` ever runs. The capture would have silently been `undefined` in every real game, not
    just the check. Fixed by carrying `{equipped, bestBeast}` forward onto `interlude.legacyCapture` (set right
    before that delete, read by `_applyLegacies` instead of the now-gone `pendingSuccession`) — `s.interlude`
    itself survives the whole flow, unlike the transient `pendingSuccession`.
  - **Known gap:** there's no Hall UI to choose which known technique becomes the Family Manual pick — only the
    sim bot exercises `setFamilyManual()` (highest-minStage known technique within tier). A human player who buys
    the legacy has no in-game way to set `manualTechId` yet. Left as a follow-up; the mechanism itself works.
- **2.7d Ascended Ancestor ending:** `attemptAscension()` success no longer sets `stageIndex=22` and keeps playing
  at an unreachable stub — confirmed via code read that this was still the case going into 2.7. On success:
  claims `ascended` (after `asc_attempt`, claimed on every call), `clan.ascendedAncestors++`,
  `clan.blessingStacks = min(+1, ANCESTOR_BLESSING_QPS_MAX)`, then `_die('ascended')` — the exact same
  interlude/rebirth flow as any other death. `_recordLifeInWorld()` marks the dying person's record
  `ascendedAncestor: cause==='ascended'` (a star in the Hall's tree + its own `EPITAPHS.ascended` flavor lines).
  `DEATH_CAUSE_TEXT.ascended` added to the death overlay; the `ascend-now` click handler no longer manually
  flashes success text that would fight with the interlude card opening right behind it via the existing
  `lastReincarnation` watcher (same pattern `passTheMantle()`'s button already used).
- **2.7e Ancestral catch-up:** in `_recalc()`, `legacyClan = this._playerClan()`; while `stageIndex <
  legacyClan.bestStageIndex`: Qi/s `× CATCHUP_QPS_MULT`, breakthrough chance `+ CATCHUP_BT_BONUS` (still capped
  0.98) — plus `refined_meridians`'s Qi/s % and `blessingStacks × ANCESTOR_BLESSING_QPS` apply unconditionally
  (not catch-up-gated). New `derived.catchUp` (bool). Catch-up auto-BT lives at the TOP of `_tickAutomation()`,
  **before** its `if (s.playMode !== 'idle') return` — a deliberate difference from Phase 22's opt-in automations
  right below it, since life-loop.md specifies catch-up auto-BT as a base mechanic that fires in both Active and
  Idle Mode, with the same Ascension-Trial exclusion the existing Auto-Breakthrough uses.
- **2.7f Ancestral Hall UI:** the old `#chronicle-overlay` (2.6d, just `clan.history`) is renamed `#hall-overlay`
  and gains three sections above the unchanged chronicle: **Records** (generation, best realm, Merit
  unspent/lifetime, Ascended Ancestors), **Family Tree** (`world.pastLives` filtered to the current clan, newest
  first, joined against `world.persons` for name/spouse/epitaph — deterministically hashed into `EPITAPHS[cause]`,
  no `Math.random()`, so re-opening the Hall never shows a different line), **Legacies** (buy buttons per
  `CLAN_LEGACIES`, disabled when locked/maxed/unaffordable). The Stats button is relabeled "Ancestral Hall 祖祠".
  `#hall-overlay` added to `BanterSystem`'s `isBlocked` selector — `#chronicle-overlay` had never been in it,
  a small pre-existing gap fixed in passing.
- **Sim:** `scripts/sim/bot.js` gained `legacies()` (spends Merit in life-loop.md §7's priority order, then picks
  the clan's highest-eligible-tier known technique for Family Manual), wired into the main action chain; new
  `buy_legacy` `FEATURES` entry in `report.js`. `scripts/sim/checks/succession.js` +26 (checks 29-35: `_claimFirst`
  idempotency, the exact Merit-at-death formula, every `buyLegacy`/`setFamilyManual` rejection reason, heirloom +
  beast-lineage carry — the check that caught the `pendingSuccession` bug above — the Ascended Ancestor ending
  end-to-end, and catch-up's Qi/s + BT bonus + Active-Mode auto-BT). `scripts/smoke/scenarios/succession.js`
  extended (Hall records/legacies + a live, button-driven Ascension Trial ending the life) — also fixed two now-
  stale `#chronicle-*` id references left over from the 2.7f rename.
- **Evidence:** `npm test` (60 files), `npm run checks` (248, was 222). Full `npm run sim --hours=200 --seeds=3`:
  0 errors/0 violations, 75 save round-trips. **The dead-zone fix is dramatic and directly measurable:** active's
  life count over the same 200h window went from ~10 (one life stuck at the Ascension stub for the back half of
  every run) to **163** — every Ascension now genuinely ends a life and starts the next generation, and catch-up
  visibly fires (the bot's own `legacies()` bought legacies in every profile that earned any Merit at all).
  `npm run build:web`, `npm run dist` (after closing four stale `Cultivator Idle.exe` copies left running from an
  earlier session that were locking `dist/`). Real-app smoke (`succession.js`, extended): Hall records/legacies
  (bought one, Merit visibly spent), a real Ascension Trial click-through ending the life with the new death-card
  text, the clan's `ascendedAncestors` counter confirmed — zero console errors.
- **Pacing fallout (expected, not a bug — 2.8's job):** with the dead zone gone, active's median life in that
  same 200h/3-seed run fell to **3.3h**, below life-loop.md's `LIFE_TARGETS_H.active` band `[5,15]` — a direct
  consequence of catch-up + repeated Ascension cycling much faster than the band assumed when it was tuned
  (task 2.4) against a world where Ascension was a dead end, not a repeatable loop. Left untuned deliberately:
  2.8 is explicitly "Merit costs, catch-up strength, lifespans, BQ constants" — the same knobs this fallout points
  at — and re-tuning them now, one task early, would mean re-tuning them again once 2.8's own acceptance criteria
  (3-5 generations to first Ascension, gen 2+ life ≥ 8h) are actually measured against.
