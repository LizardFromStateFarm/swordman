# Living World (Phase 28) — Reference
_Covers (planned): renderer/engine/game-state.js (world persons, sim, encounters, rival) · renderer/engine/persons.js ·
assets/data/world-population.js (new) · assets/data/npc-lives.js (new: lifespans, goals, encounter + memory tables) ·
renderer/game/world-people.js (new: World → People + the person card) · renderer/game/encounter-view.js (new) ·
scripts/sim/checks/living-world.js (new) · renderer/game/chronicle-view.js (4.6) · Phase: 28 (M4 tasks 4.1–4.11, 4.10b) · renderer/game/rankings-view.js (4.8) · Updated: 2026-10-04_

**Status: 4.2 + 4.3 + 4.6 + 4.4/4.5 + 4.7 + 4.9 + 4.10 built (2026-10-03).** Spec reviewed and approved by the user on 2026-10-03 (§13). 4.2 = the one
registry + the person card (see "4.2 as built"). 4.3 = the light world sim: lives, deaths, the pre-existing world, your
class and World → Class (see "4.3 as built"). 4.6 = the replacement controller + the merged World → Chronicle (see
"4.6 as built"). 4.4 + 4.5 = the heavy tier, NPC goals and known-first casting (see "4.4 + 4.5 as built"). 4.7 = World → People, pins
and tappable log names (see "4.7 as built"). 4.9 = encounters and the "Met on the road" queue (see "4.9 as built"). 4.10 = memory, reputation, rumours and the person card's deeds (see "4.10 as built"). 4.10b = Your Rival (see "4.10b as built"). 4.8 = the Heavenly Rankings (built 2026-10-04 ahead of 4.11 by the user's call; see "4.8 Heavenly Rankings" + "4.8 as built"). 4.11 = the perf pass (see "4.11 as built"). Next: the final QA & Balance pass.
PLAN.md → Phase 28 is the original design (2026-09-25). This doc is the build spec. It updates Phase 28 for what
was built since: Phase 30's clock, the world sects of Phase 43, the lineage sects of Phase 46, the game ending at
Immortality (Phase 47), Phase 14 bodies, Phase 42 arts, and the person fights on the battle page (A6-3a).

---

## 0. User decisions (2026-10-03)

1. **Old age kills NPCs, but forgivingly.** It is a backstop for people who never die in a fight, a failed
   breakthrough or an Ascension attempt. It is not the main way people die. The player still never dies of age.
2. **The game ends at Immortality.** NPC Ascension is a world event: a Chronicle line, a ranking honour, a Class
   board count. Nothing from the Immortal era (petitions, devouring, slaves) is in scope.
3. **Integrate, don't run in parallel.** The existing sect system (`s.world.sects`, own-sect disciples, branches,
   the sect master) and family system (spouse, lovers, children, clan registry) become part of the one world of
   persons.
4. **No separate world save file unless we need one.** The world stays in the slot JSON under a measured size budget
   (§9). The split is a fallback only.
5. **Every NPC encounter with the player is told to the player, and NPCs have their own agency.** An NPC who means
   to attack attacks: their intent is decided by them, not by the player. The player's *response* is a
   **queued card**, answered whenever the player gets to it. There is no forced popup and no timer that answers for
   them.

---

## 1. What exists today (the starting point)

Named people live in **six separate stores**, and most of them never meet each other:

| Store | Who | Shape | Notes |
|---|---|---|---|
| `s.world.persons` | past lives, clan kin, heads, branch heads, spouses of heads | `Persons.make()` + morality, npcXp | **Already the registry.** Grows on the yearly tick via `_advancePersons` (stage only, cap 21, no death) |
| `s.family` | spouse, lovers, children, suitors, courtship candidates, `encounters` strangers | full person **copies** inside family objects | ~175 refs to `f.spouse`; snapshotted into the registry at `_endLife` |
| `s.arena.duelists` | ring rosters + champions | `_genPerson` persons | separate map; dead are deleted |
| `s.ownSect.disciples` / branches | your disciples, branch heads | `{ id:'d…', name, talent, level, loyalty… }` | **not persons**: no root, age or stage |
| `s.world.sects.list[].leader` | every world sect's master | **a name string** | `_wsCheckSuccession` swaps the string; `_sectMaster()` mints a person on demand |
| road strangers (`_rollStranger`) | lover + recipe encounters, slaughter foes | throwaway persons | not in the registry |

Clock: `GAME_YEARS_PER_OPEN_HOUR = 30` (1 game year ≈ 2 open minutes). **`world.year` never advances offline**
(life-loop pillar 4), so the world sim has **no offline catch-up at all**. That retires most of 28B's perf worry.
A life is roughly 4 open hours, about 120 game years.

---

## 2. Depth pass

1. **Memory.** Every person keeps `rel` (−100…100 toward the player) and a capped list of `mem` entries naming what
   happened ("spared me on the Ashen Road, year 212"). They also keep relations to *other* NPCs (kin, master,
   sworn, enemy). Memories toward you also land on your **clan** (`clanRel`), so a grudge outlives your life and
   meets your heir. A rivalry record (§8) holds heat, meetings, wins/losses and the beats.
2. **Choices.** Every encounter is a queued card with 2–3 answers. The answers read the NPC's personality
   (PERSONALITIES), morality, their memory of you, your karma, power gap, body tier, sect and stance: the same
   rescue reads differently with a coward than with a zealot. Interactions you start from the person card: gift,
   spar, duel, mentor, recruit, court, swear brotherhood, denounce, seek out.
3. **Hooks (≥ 3; this system is a hub):**
   - **Sects (43/45/46):** world sect masters and elders become real persons. Successions pick a real elder.
     A seceding branch head, a takeover master and an exiled master are persons with memories. Recruit pools draw
     on real youths.
   - **Family (16-lite, 2.6):** suitors, courtship candidates and lovers are cast from the registry (you can marry a
     classmate). Children are registry persons. Clan grudges pass to heirs.
   - **Combat (A6-3a, 42):** encounters and challenges fight on the existing battle page. NPC arts, temper and body
     come from their record. Arena duelists are registry persons.
   - **Breakthroughs:** a rival breaking through is news. Overtaking them moves karma (old 11A rule). The cohort
     race feeds the Class board.
   - **Bloodline / reincarnation (23, 46, 47):** old classmates live on as old monsters. Your next life can meet
     the grandchildren of people you wronged.
   - **Banter (29):** `{rival}`, `{classmate}` and `{enemy}` tokens with real names. New triggers: `rival_seen`,
   `classmate_fell`, `ambushed`.
   - **Karma:** mercy, robbery, betrayal and rescue move karma. Karma tilts who approaches you.
   - **Rankings (28J, task 4.8, the next step):** read `powerScore` across the registry.
4. **Drama.** Best: a classmate you saved three times swears brotherhood and dies holding the pass in your sect's
   war. Your rival, at +80 respect, kneels at your funeral, and their grandson becomes your next life's master.
   Worst: an ambusher you spared returns as a sect master and razes your branch. Your rival kills your heir in a
   blood match, and you are reborn into the rival's family (2.6d already has the hook). A lover's jilted spouse
   hunts you. The son of the man you killed comes of age.
5. **Feedback.** Your deeds become **reputation**: rumours spread through relations, `honour` / `infamy`. That tilts
   future casting: robbers target a soft mark, the righteous hunt the infamous, desperate people seek a merciful
   cultivator, suitors and recruits refuse a butcher. The world remembers across lives through `clanRel`.
6. **Agency audit.** The player's own answers are never rolled:
   - The encounter response is always a card. The **stance setting only pre-selects the button**, and the card never
     expires. (This replaces 28I's "expires to stance default".)
   - **NPC intent is the NPC's.** An ambusher attacks: the card opens as "Wei Lan is upon you". Your choices are
     fight, flee or yield the loot, not "avoid it". A hidden roll never decides what *you* do.
   - Courtship, recruitment, sworn brotherhood, sparing or killing are all explicit.
   - **Queue overflow (decision):** at the cap, new *ordinary* encounters become log-only "brushes" (a passing
     glance, no choice owed). Rivals and notable people wait for a free slot instead. Nothing is auto-answered.

## 3. UX pass

1. **Surface.**
   - The **person card** (one component, used everywhere) shows: name, age, realm, root, temper, morality word,
     sect/role, body tier, **"What they think of you"** (rel bar plus the top 3 memories in their words), kin and
     sworn/enemy links, a short life log, and the actions with their odds and costs.
   - **Clickable names** in the event log, Chronicle, sect pages, the family tree and rankings open that card.
   - The breakdown popover explains rel ("−35 = you robbed them −30, spared their brother +10, infamy −15").
2. **Interact.**
   - **世 World → People**: Known People with search, filters (classmates / rivals / kin / sect / grudges / pinned)
     and ★ pins.
   - **世 World → Chronicle**: the merged world feed (persons + sects).
   - Encounter cards go in a **"Met on the road"** queue in Roam → Explore. This extends today's `family.encounters`
     list, which is already where lover and recipe strangers wait.
   - Design for Expanded/Desktop first: the card opens inline in the page, like SectDetail. Overlay 300px uses a
     single column with the card replacing the list and a back link. Phone uses the same layout with ≥ 44px
     targets.
3. **Discover.**
   - An attention item and a Roam badge while a card waits ("2 met on the road").
   - Ambushes and rivals use the urgent style.
   - A first-time hint on the first encounter and the first clickable name.
   - Toasts are reserved for rival beats and classmate milestones.
4. **Feel.** Ink-letter cards like the world-sect events (§43b). Relation tones: red (enemy), dim (neutral), jade
   (friend), gold (sworn). Lines read like a novel translation ("Old Mo has broken seclusion. Three peaks shake.").
   Honors text size and colour-blind settings (tones also get an icon).
5. **UX debt found:**
   - There is no way to see any NPC today, except kin in the family tree.
   - Sect leaders are bare names.
   - The Events log and the Sects chronicle are two separate feeds.
   - The ring champion's name means nothing outside the arena.

---

## 4. The Person record (extends `Persons.make`, v: 2)

```js
{ v: 2, id, given, family, gender /* 'f'|'m' (36 needs it) */, bornYear, root, personality /* PERSONALITIES id */,
  morality /* −100..100, existing */, disposition /* 'principled'|'pragmatic'|'opportunist'|'zealot'|'hedonist' */,
  stageIndex, maxStage, npcXp, bodyTier, arts /* [artId] lazily via personArts */,
  alive, diedYear, cause, role, parents, spouseIds,
  // ── Phase 28 ──
  sectId /* world sect record id | 'own' | null */, sectRole /* 'master'|'elder'|'disciple'|null */,
  cohort /* lifeNo they awakened with the player | waveId | null */, chosen /* Heaven's Chosen flag */,
  tier /* 'heavy'|'light' */, fam /* familiarity: times the player saw the name */, pin,
  rel /* toward the player, −100..100 */, mem /* [{ y, k /* MEMORY_KINDS id */, w, by? }] ≤ 6 */,
  ties /* { [pid]: −100..100 } ≤ 8, kin implied by parents/spouseIds */,
  act /* { k: 'seclude'|'roam'|'mission'|'court'|'duel'|'war'|'travel', loc?, until } (heavy only) */,
  lifespan /* years, rolled from realm at each breakthrough (§6.3) */, owner /* 'world'|'family'|'arena'|'sect' */ }
```
- `Persons.make` fills every new key with a safe default, so every existing caller keeps working.
- **`owner`** says which system runs a person's *relationship* state (§5). The world sim runs life, death and
  growth for everyone **except** `owner:'family'` persons during your life, because family code already grows
  them.
- `Persons.powerScore` extends to include arts, gear and the realm gap. It is the single power function used by
  encounters, rankings (4.8) and casting.

## 5. Integration: one registry, owners keep their state

**Recommended design (the main architecture decision; approved, §13).** `s.world.persons` is the **only** home of a
person's identity and life (name, age, stage, alive, sect, rel, memories). Systems keep their *relationship*
fields and point at the person by `pid`:

| System | Today | After 4.2 |
|---|---|---|
| Family | `f.spouse = {…person, affection…}` | **unchanged object** + `pid`. Spouse/lover/child life fields are written through `_personSet(pid, patch)`, which updates both the registry and the family copy. All deaths go through `_killPerson` (it already exists). A sim invariant checks that the two copies are equal. **Not** a 175-site rewrite. |
| Arena | `s.arena.duelists[id]` persons | the roster holds pids. Duelists live in the registry (`owner:'arena'`) and are no longer deleted when dead (the Chronicle keeps them). A champion can be a classmate. |
| Own sect | disciples `{ id:'d…', name, talent }` | each disciple gets a `pid` → a registry person (`sectId:'own'`, `owner:'sect'`). Talent and level stay on the disciple. `name` is a cached display name. A dismissed disciple stays in the world (and may remember it). Branch heads, seceders and splinter leaders are the same people. |
| World sects | `leader` string | `leaderId` + 1–3 `elderIds` + up to 4 notable `memberIds` (persons). `r.disciples` stays as the **background count**. `_wsCheckSuccession` → the master dies (age, war or duel) or retires, and the **senior elder** takes the seat. A sect's founder is a real person. A rival sect can be *founded by an NPC goal* (§7). |
| Sect master (43e) | `_sectMaster()` mints on demand | reads `leaderId`. The challenge and petition fight that person. Exiled masters keep their memories. |
| Strangers | `_rollStranger` throwaways | cast **known-first** (§6.4). A fresh one is materialized into the registry and is permanent from then on. |
| Clan registry | already persons | gains the v2 fields. `_advancePersons` is folded into the light step. |

Migration `_ensurePhase28Fields` (in `_recalc`, after 46): stamps v2 defaults, mints persons for disciples, sect
leaders and elders, and moves arena duelists in. It seeds the pre-existing world (§6.1) and a starting cohort at
matching ages for a mid-game save (the cohort is placed near the player's stage with the talent spread). It runs
once and is idempotent, and the save round-trip check covers it.

## 6. Population & lives

### 6.1 Who exists
- **Pre-existing world** (seeded once per slot): about 120 people.
  - World sect masters and elders, at tier-appropriate stages.
  - A few "old monsters" near the top of the mortal ladder.
  - Wanderers.
  - Their kin, kept sparse.
- **Starting cohort, every life** (28H): about **60** youths awaken in the same year as you (§13). The talent
  spread is about 55% slower, about 35% comparable, and **3 Heaven's Chosen** who out-pace you early. One of the
  Chosen from outside your clan becomes **Your Rival** (§8). Some cohort members share your sect when you join one.
- **Earlier lives' cohorts live on.** Your old classmates keep cultivating, become elders or old monsters, and
  die. A later life meets the grandchildren of an earlier life's classmates. Reincarnation archives the old class
  as "Class of <past life>" (for 4.8).
- **Replacement (28H, kept):**
  - Births from NPC marriages.
  - **Awakening waves**: small batches of youths whose roots awaken, every ~10 game years.
  - Promotion from the band below.
  - Wanderers.
  - A rare **hidden master** breaking seclusion when the top bands are thin.
  - Materialization on demand.
  - Controller targets per **realm band** live in `world-population.js`, kept within ±15%, filled over years and
    never by instant respawn. (There are no regions yet; Phase 12 isn't built. Bands only.)

### 6.2 Tiers & cadence (game time; the world is frozen while closed)

| Tier | Who | Step | Budget |
|---|---|---|---|
| **Heavy** | the current cohort (≥ 40% reserve), your rival, family, your sect's named people, your sect's master/elders, pinned, high familiarity, anyone with a live card | goals + activity every **game season** (¼ year ≈ 30 open s), spread across ticks | ≤ 150 |
| **Light** | every other named living person | **once per game year**, batched (a slice per tick) | ≤ 1,100 living |
| **Background** | the unnamed count per band (incl. `r.disciples`) | yearly aggregate | n/a |

Relevance is recomputed every 5 game years and promotes or demotes a person (28B rules kept; nobody named is
deleted while alive). The dead are compacted to a Chronicle stub `{ id, name, years, peak, cause, sectId, notable }`
and pruned after `WORLD_PRUNE_YEARS`. Kept forever: past lives, clan heads/founders, your rival, anyone with
`rel` ≤ −50 or ≥ 50, and dead classmates (the Class board needs them).

### 6.3 A life (light and heavy alike)
- **Ages, cultivates and breaks through.** NPCs follow the same stage pacing curve as today's `_npcStageRate`
  (root, sect blessing tier, a talent multiplier). `NPC_STAGE_CAP` stays 21: stage 21 (Spirit Severing late) is already
  the last mortal stage, and 22 is Ascension (correction found in 4.3).
- **Breakthrough failure:** a small chance per attempt to be **injured** (slows them) or, at the high realms, to
  **die**. That is the main natural cause of death at the top.
- **Marries and has children.** Children inherit roots via `blendRoot` and the family name (names are never
  recycled, but descendants can be "grandson of the late Elder Mo").
- **Death causes:** a breakthrough backlash, a duel, an encounter, a sect clash or war (a named elder may fall), a
  rival's hand, a failed Ascension, **and old age as a backstop** (user Q1). `lifespan` by realm is generous
  (mortal ≈ 90, then roughly ×1.6 per realm; numbers live in `npc-lives.js`). Past the lifespan, a small yearly
  chance ramps up slowly. Players get warning beats ("Elder Mo's hair has gone white; he enters final seclusion").
  The sim checks that old age is **< 25%** of all NPC deaths.
- **NPC Ascension:** a stage-21 NPC with a high root and high age-in-stage can attempt the Trial (23C formula,
  shifted down so it stays rare). Survivors become `status:'ascended'` and leave the live sim. Chronicle line;
  the Class board counts them. No Immortal-era content (user Q2).

### 6.4 Known-first casting & the new-name throttle (28B, kept)
`_castPerson(spec)` serves every system that needs "someone": encounter, suitor, recruit, challenger, champion,
envoy. It picks an existing registry person **~75%** of the time (weighted by `fam`, stage fit and activity at the
location). Otherwise it materializes a new one. At most **~5 new names per open hour** early on, rising to about 10
later. Every time a name is shown in the log, a card, a Chronicle line or a ranking, that person's `fam` goes up by 1.

## 7. Decisions (utility AI, Heavy tier)
- **Each season**, a Heavy person scores their goals: seclude, roam (a location, which makes them eligible for
  encounters there), sect mission, court/marry, challenge someone (a ranker, a grudge), seek revenge, join/leave a
  sect, **found a sect** (→ `_wsNewRival` with them as master), betray (an ambitious elder plots against their
  master), help a friend.
- **Score** = base × personality weight (PERSONALITIES → `GOAL_WEIGHTS` in `npc-lives.js`) × morality/disposition
  × situation (an injured person secludes, the low-rel and strong seek you, the infamous attract hunters).
- **NPC↔NPC outcomes** resolve on the spot with the shared power function. They reach the Chronicle only if
  notable (a ranker dies, two classmates swear brotherhood, a master is overthrown).
- **Sects are folded in:** world-sect clashes name their champions (and may kill one). A master's death runs real
  succession. A betrayal can **split a sect** into a splinter led by a person. The 43b growth math is kept.

## 8. Your Rival (28K)
- **Who:** at awakening, the strongest Heaven's Chosen from outside your clan gets `rivalOf` set, with their own
  NPC clan in `world.clans`.
- **Record:** `s.rival = { pid, heat /* −100 bitter … +100 respect */, meets, wins, losses, beats: [{ y, place, k, outcome }] }`.
  The beats are structured so a later story mode can quote them.
- **Recurring:**
  - The rival bypasses the encounter throttle and seeks you out (an expedition, the arena, a sect tournament, your
    gate) about every 15–25 game years.
  - Their breakthroughs are headline log lines and banter (`{rival}`).
  - In sect wars, the rival leads the enemy side when their sect is the foe.
- **Choices:** accept or decline a duel; spare, humble or kill; help them in trouble or sabotage them; at
  heat ≥ 70, offer sworn brotherhood or courtship; at heat ≤ −70, a blood feud (lethal duels allowed).
- **Across lives:** when you die, the feud passes to your clan as a grudge (`clanRel`). The rival's descendant may
  become the next life's rival, and 2.6d's rival-family rebirth now uses this person's line.

## 9. Encounters (28I, with the user's queue rule)
- **Where:** expeditions (the location's roamers), sect missions (your sect's people), the arena (challengers),
  the sect gate (envoys, challengers, petitioners for a founder), breakthroughs (a rival's reaction).
- **Chance:** a base of ~15–20% per expedition/mission, capped per open hour. The same person can't appear twice
  within ~10 game years, except your rival and anyone with |rel| ≥ 60.
- **The NPC acts first.** `intent` is rolled from their personality, morality, rel, power gap and your infamy:
  rob, challenge, ask for help, trade, team up, court, recruit-me, warn, or just greet. The card is written from
  that intent.

| Card | NPC intent | Your answers (examples) | Hooks |
|---|---|---|---|
| Treasure contest | both reached the same herb/relic | split / fight for it / yield | loot, rel ± |
| Team up | offers to clear the zone together | accept (bonus loot) / decline | rel +, friendship → sworn, courtship |
| Rescue | they are cornered or wounded | help (risk Health) / walk on / rob them | karma, big memory |
| **Ambush** | attacks you (their choice) | fight on the battle page / flee (lose loot, odds shown) / yield | Health, loot, revenge |
| Challenge | a proud classmate or a ranker | accept (spar / blood) / decline (face −) | rankings 4.8, fame |
| Promising youth | talented mortal | invite to your sect / point them to a sect / pass | own-sect recruit, rel |
| Old face | a classmate or kin, changed | talk (rel +) / spar / ask a favour | familiarity, flavour |
| Lover / recipe stranger | existing 16-lite and Phase 44 cards | unchanged answers, but the person is now real | family, crafting |

- **Queue:** up to 6 cards in Roam → Explore "Met on the road". They never expire, and the stance only pre-selects
  an answer. Full queue → ordinary encounters become log-only brushes; rivals and |rel| ≥ 60 wait (§2.6).
- **NPCs come to you:** challengers at your gate, suitors (16), envoys (43b events), and the vengeful.

## 10. Storage & budget (user Q4)
- The world stays **inside the slot JSON**. Budget: **world ≤ 900 KB, whole slot ≤ 1.2 MB**. That's because the
  Capacitor/browser shim keeps all slots and soul.json in localStorage (about 5 MB per origin). Today's slots are
  37–77 KB.
- Estimate: 1,100 light × ~380 B + 150 heavy × ~900 B + 400 chronicle stubs × 120 B ≈ **0.6 MB**.
- `SAVE_INT` autosave serializes the whole slot. 4.11 measures `JSON.stringify` time (target ≤ 15 ms on desktop).
- **Fallback (only if a 500 h sim run breaks the budget):** the planned `loadWorld`/`saveWorld` IPC pair in
  `main.js`/`preload.js` **and** `platform-storage.js` (Rule 7), with the world written less often than the slot.

## 11. Build order (proposed; one PLAN task each, each with its own UI so nothing is hidden)
1. **4.2 Registry + integration:** v2 person, `owner`, `_personSet`, disciples/leaders/duelists/strangers into the
   registry, migration, the size meter in the sim. UI: names in sect pages and the arena become clickable person
   cards (a first card).
2. **4.3 Light sim + lives:** aging, breakthroughs, injuries, marriages/births, deaths incl. the old-age backstop,
   NPC Ascension, the pre-existing world, the per-life cohort.
3. **4.6 Replacement + Chronicle:** waves, wanderers, hidden masters, succession by persons, the merged
   **World → Chronicle**.
4. **4.4 + 4.5 Heavy AI + tiers:** goals, activities, sects rise and split by persons, relevance, familiarity,
   known-first casting, the throttle.
5. **4.7 World → People:** Known People, search, filters, pins, the full person card, clickable log names.
6. **4.9 Encounters:** intents, the card queue, stance, battle-page fights, gate visitors.
7. **4.10 Memory + reputation + interactions:** rel/mem, rumour spread, honour/infamy, clan grudges to heirs,
   person-card actions.
8. **4.10b Your Rival:** record, beats, seeking you out, choices, the feud across lives.
9. **4.11 Perf pass**, then **4.8 Heavenly Rankings** (wrap-up step 3), then the final QA & Balance.

Each step follows the per-task bar in CLAUDE.md (`npm test` + `npm run checks`, the Visual Review Gate for UI).
New scenario checks go in `scripts/sim/checks/living-world.js`.

## 12. Invariants (sim + checks)
1. No dead person holds an active role: sect master/elder, branch head, spouse, arena champion, live card.
2. Registry and owner copies agree on `alive`, `stageIndex` and `diedYear` (§5).
3. Heavy count ≤ budget; cohort ≥ 40% of Heavy while ≥ 40% of the cohort lives.
4. Each band's population stays within its controller bounds over 500 h; no extinction or explosion.
5. No name is reused for a new person; no person id is reused.
6. A card is never answered for the player and never expires; the queue is ≤ 6.
7. Old age < 25% of NPC deaths; the player never dies of age.
8. The world never advances while closed (`world.year` is unchanged across `initSlot`).
9. Slot ≤ 1.2 MB after 500 h; heavy step ≤ 2 ms; light slice ≤ 1 ms.

## 13. Spec decisions (user, 2026-10-03, answered on review)
1. **Integration depth:** owner objects keep a `pid` and **write through** to the registry (§5). The family code is
   not rewritten onto bare ids.
2. **Cohort:** about **60 per life** (3 Heaven's Chosen).
3. **Encounter rate:** about **1 card per 2–3 expeditions** early (15–20% per expedition/mission, capped per hour),
   with a queue of 6.
4. **Build order:** as §11.

---

## 4.2 as built (2026-10-03): one registry + the person card

**State.**
- Every person is `Persons.make` v2 (`persons.js`: `v2Defaults` / `stampV2`): `gender` (null until 36), `sectId`
  (a world-sect id, `'own'` or null), `sectRole`, `cohort`, `tier`, `fam`, `pin`, `rel`, `mem`, `ties`, `owner`.
- `w.peopleV` (1 once migrated) and `w.nextNpcId`: **world-minted people take their own id series `n1, n2…`**, so
  minting never shifts `w.nextId` (the family's ids) or the id-seeded NPC arts.
- A world sect gains `leaderId` and `elderIds`. `r.leader` stays the display string, and `_wsLeader(r)` only counts a
  living person whose full name equals it.
- A disciple gains `pid`. A recruited child's `pid` is the child's own id.
- Data: `assets/data/world-population.js`: `WORLD_PEOPLE` (budgets, elders by tier, age bands, `masterDiesShare`,
  disciple level → stage), `PERSON_LIFE_KEYS`, `PERSON_ROLE_TEXT`, `PERSON_CAUSE_TEXT`, `MORALITY_WORDS`,
  `BODY_TIER_LETTERS`.

**API (game-state.js).**
- `_regMerge(src, extra)`: an owner copy's life keys go into the registry.
- `_regKeep(src, extra)`: a whole object at the end of a life, keeping the world's fields.
- `_mintPerson(spec, rng)`: seeded rng only.
- `_disciplePerson(d)`.
- `_syncPersons()`: mirrors the family (spouse, former spouses, lovers, children, road encounters, suitors, court
  candidates, spurned), the arena duelists and the own-sect disciples. It also releases people whose owner let them
  go (owner → `world`; a dismissed disciple → `wanderer`) and clears a `sectId` whose sect is gone. It runs on every
  `_save()`, every game year, once per load, and from `personInfo` when the name isn't mirrored yet.
- Sect people: `_wsEnsurePeople(r)` (idempotent; seats a real master, fills elders by tier), `_wsSeat(r, p)`,
  `sectPeople(recId)`.
- `personInfo(pid)` / `notePersonSeen(pid)` / `worldSizeInfo()`.

**Rules.**
- Succession (`_wsCheckSuccession`): a hash of sect + year decides whether the old master dies (`old_age`) or retires
  (`retired_master`). The **senior elder** takes the seat and a new elder is minted. No extra Math.random draws; the
  temper-switch draw is kept.
- `_sectMaster()` returns the seated person (no more minting a namesake).
- A seceding branch head is seated as the splinter's master, and the branch members get its `sectId`.
- An exiled master leads their splinter as the same person.
- On death, `_wsFromOwnSect` seats the inheriting branch head (the same person), and the other branch heads become
  elders. All disciples move to the lineage record.
- `_advancePersons` skips persons with a non-world owner.

**UI.** `renderer/game/person-card.js` (`PersonCard`): any `[data-pid]` opens a `.bd-pop` card beside it. Names are
tappable in these places:
- sect-detail.js: "Led by", plus the ELDERS line
- sect-view.js: the master card, Their mountain, disciple rows (the row id resolves to its pid)
- arena-view.js: roster + call-out

Family members show bond/affection; everyone else shows "A stranger to you" until 4.9/4.10. Gate: **7.7 PASS**
(ui-review.md).

**Gotchas.**
- **Until 4.3, nobody met ever dies of age:** strangers, suitors, duelists and released disciples pile up, about 105
  people per life. sim:quick (24h active, 7 lives): 983 people / 736 living, slot 551 KB. That's inside the 1.2 MB
  budget but over `lightMax` (1,100 living) around life 10, so 4.3's lifespans + controller must land before release.
- NPC masters, elders and released people still grow on the old `_advancePersons` pace only at rebirth (nothing
  steps them yearly yet). That's 4.3's job.
- `fam` only grows when a card opens (log names aren't clickable yet: 4.7).
- The road-slaughter foe (`fi.foe`) and recruit-pool candidates are still not registry people (4.9).
- A sect master who wasn't seated (a legacy `r.leader` string change) is re-seated by name on the next
  `_wsEnsurePeople`, and the old person becomes `retired_master`.

## 4.3 as built (2026-10-03): the light world sim + your class

**Depth.** Memory: every person carries a life (peak stage, injuries, twilight, spouse, children, cause + year of death)
and every life's class is kept (`w.cohorts`). Hooks: world sects (a dying master seats the senior elder; elders fall and
the bench refills; classmates join sects, yours ×4 likelier), family (owner `family` people are never touched; your
parents and every clan/line head are exempt from old age while seated), breakthroughs (the class race; "now stands above
you"), banter (`classmate_fell`, `classmate_passed`, token `{classmate}`), rebirth (the generation skipped between lives
is lived year by year, quietly; old classes live on into later lives). Drama: a Heaven's Chosen classmate killed on the
road (a toast + "A bright star goes out"), a backlash that wounds or kills, an old monster's Ascension (a toast).
**Player choices: none in 4.3 by design** — every roll here is an NPC's own life; the player's answers arrive with
encounters (4.9) and interactions (4.10).

**Data** `assets/data/npc-lives.js` → `NPC_LIVES` (lifespans by realm of the peak stage ± 15%, twilight years, old-age
ramp; realm breakthrough success / death share / injury; the yearly hazard by role + the cause tables; marriage and birth
rates + the birth soft cap; NPC Ascension; the pre-existing seed; the class spread; prune + log thresholds) and
`NPC_LIFE_TEXT` (log lines). The new causes' words (`bt_backlash`, `road`, `feud`, `sect_clash`, `seat_struggle`) and
the roles `youth` / `old_monster` live in `world-population.js`. `masterDiesShare` 0.6 → 0.35.

**State (world).** `livesYear` (the last year stepped), `lifeStats { deaths: {cause: n}, births, marriages, ascended }`
(every `_killPerson` counts), `worldSeedV`, `peopleSeed` (a per-slot seed hashed from the slot's own first rolls, so two
slots never share a class and nothing draws Math.random), `cohorts { [lifeNo]: { year, born, ids } }`, `classTold { fell,
passed[] }` (the class news). Person (4.3 keys): `talent`, `chosen`, `injuredUntil`, `twilight` (the year final seclusion
began), `stageYear`, `ascended`. The kept dead are compacted (`_compactDead`).

**Rules.**
- `_tickWorldLives()` rides the game-year tick (after `_tickWorldSects`), catches up at most 5 missed years, never runs
  in the interlude. `_worldYears(from, to)` lives the generation jump in `_beginLife` quietly. Offline: nothing (pillar 4).
- `_lifeStep(yr, quiet)` for every living world-owned person (not `ancestor`, not the player):
  - grows them (`_growPerson`, which `_advancePersons` now shares); crossing into a new realm rolls the breakthrough:
    fail → injured (half a stage back, ×0.4 pace for 6–16 y) or killed (`bt_backlash`);
  - at stage 21 for 40+ years: the Trial (ascended or `ascension_failed`);
  - the yearly hazard by role (Core Formation+ ×0.6, Chosen ×0.5) with a cause drawn from the role's table;
  - old age past the span (warning first: `twilight` within 12 years), skipped for seated people;
  - classmates find sects; singles wed (seeker looks at 6 singles: age gap ≤ 45, stage gap ≤ 5, no kin); couples have
    children (≤ 3, blended root) while `room = 1 − living / (lightMax × 0.8)` > 0; every 10 years `_pruneDead`.
  - Clan members (any clan roster) grow without breakthrough rolls and take no hazard: the clan systems own their fates.
- `_npcDies` handles a seat: a master → `_wsSeatHeir` (the senior elder; the chronicle names the cause); an elder →
  off the bench + a chronicle line. `_wsCheckSuccession` keeps its tenure roll but its deaths are now `seat_struggle`.
- What the player hears (`_tellLives`, ≤ 5 lines a year): this life's classmates (realm breakthroughs from Foundation
  Building; deaths with the cause; weddings; "now stands above you" once per person), your clan's dead, people you have
  seen (fam > 0, not sect seats: those go to the chronicle), twilight + backlash wounds of classmates/known people, any
  Ascension. A Chosen's death and any Ascension also toast (`world_news`, game.js `showToast`).
- `_pruneDead`: the dead 200+ years are deleted unless a past life, a clan member, a sect seat, a parent/spouse of the
  living, a classmate (any life), pinned, |rel| ≥ 50, or ascended. Kept dead are compacted.
- `_mintPerson` never reuses a living or remembered full name (6 tries, then accepts).

**UI.** 世 World → **Class** (`renderer/game/class-view.js`, `ClassView`; pane `#tab-class`): your class (or an earlier
life's, via a chip row), counts (living / fallen / ascended / "stand above you"), "Where everyone stands" (you placed
among the living by realm; Chosen marked; Healing / Final seclusion chips; realm · age · sect), the fallen with cause +
year + realm reached. Two columns in Expanded/Desktop. The person card: "Your classmate" (or "Your classmate in life N"),
"Age n years of ~span", chips (Heaven's Chosen / Healing a backlash · n y / Final seclusion), an "Ascended" row. An idle
attention item "N classmates have fallen" → World → Class (cleared on view). API: `classInfo(life)`, `noteClassSeen()`,
`classNews()`, `personInfo` (+ `span`, `twilight`, `injured`, `ascended`, `chosen`, `classmate`).

**Tuning (measured).** `node scripts/sim/probe-world-lives.js 1800` (≈ 15 lives): ~250 living steady, old age 21% of
deaths (road 24, feud 15, beasts 14, seat struggle 10, duels 8, sect clashes 8, backlash 1), slot 682 KB, 1.7 ms per
game year (one step every ~2 open minutes). A class mostly dies within two lives; the strongest reach Core Formation.
`npm run sim:quick`: healthy, worst slot 493 KB (was 551 KB in 4.2: pruning + compaction), old age 19%.
`node scripts/sim/probe-npc-pace.js`: years to each realm by root × talent (the PLAYER_QI_EDGE cap makes NPCs slow: a
common root needs ~157 years to reach Foundation Building).

**Tests.** `checks/living-world.js` (32 → 68): seeding once + no Math.random + per-slot names; owners untouched;
breakthrough outcomes; a master's death seats the elder; 400 years: old age < 25%, causes, weddings + births, no dead
seat, nobody far past their span, pruning + compaction; classInfo + the class news + the card; Ascension; frozen while
closed; open play steps it; a new life brings a new class. Smoke `scenarios/class.js` (4 modes, zero console errors).
Sim invariants `sect_elder_dead`, `old_age_share`; the report's "World deaths" line.

**Gotchas.**
- High realms thin out: seeded masters die and nobody climbs back fast (NPC pace). 4.6's hidden masters + awakening
  waves refill the bands; until then the world drifts toward Qi Condensation over many lives.
- NPC bodies (`bodyTier`) are still not simulated; the card shows Body only when known.
- Classmates never meet you yet (encounters are 4.9); their names in the log are not clickable (4.7).
- Clan rosters are exempt from the hazard; a clan's NPCs only die of old age here (and in the clan's own systems).

## 4.6 as built (2026-10-03): the replacement controller + the merged Chronicle

**User picks (assessment):** a hidden master may **seize** a weaker sect's seat or **found** a sect (not news only);
the Chronicle **merges** the old Sects chronicle (the ledger links to it instead of folding its own).

**Depth.** Memory: `w.chron` is the world's memory (each line keeps its pids, sect id, year and notable flag) and outlives
every life. The bands are measured fresh each year, so a refill takes years. Hooks: world sects (a hidden master takes a
weaker master's seat, killing or retiring them; the sect's temper becomes theirs and its stance toward you halves; or
they found a tier 2–3 sect; the **elder draft** seats a living person on an empty bench), your class (a classmate drafted
as an elder is told to you), clan + class (Chronicle tags and filters), banter (`hidden_master`, token `{master}`),
attention + toasts. Drama: an old monster wakes and takes **your** sect (a negative log line + toast naming who fell); a
thin top realm empties and fills again over decades. **Player choices: none by design.** Every roll is the world's;
the player answers people in 4.9/4.10.

**Data** `npc-lives.js` → `NPC_WORLD`:
- Five realm bands: low 0–9 → 190, Foundation 10–12 → 30, Core 13–15 → 14, Nascent Soul 16–18 → 8, Spirit Severing
  19–21 → 4. Tolerance ±15% (thin / ok / crowded).
- Birth room (replaces 4.3's lightMax cap).
- Awakening waves: every 10 years, 45% of the low band's deficit, 2–14 youths.
- Wanderers: Foundation and Core bands, chance 0.7 × deficit a year, at most 1 per band.
- Promotion boost: pace × (1 + 0.8 × the deficit of the band above).
- Crowding: hazard × 1.8.
- Hidden masters: Nascent Soul and Spirit Severing bands, chance 0.45 × deficit a year, at least 8 years apart, sealed
  120–480 years. Fates seize 3 / found 2 / wander 4 (an ambitious temper doubles seize and found). They only seize from
  a master at least 2 stages below them; 45% of seizures kill.
- Draft pool: 3.
- Chronicle: cap 320; deaths and breakthroughs are chronicled from Core Formation and Notable from Nascent Soul.

`NPC_CHRON_TEXT` holds the Chronicle's lines. `NPC_LIFE_TEXT` gains `hidden`, `hiddenSeizedYours` and `draftedClassmate`.

**State (world).**
- `chron [{ i, y, k, t, p?, s?, n?, q? }]` (q = routine), `chronSeq`, `chronSeen`. These live in `_blankWorld`. A
  pre-4.6 save starts its Chronicle from `sects.chronicle` with nothing unseen (in `_ensurePhase28Fields`).
- `hiddenYear`.
- `lifeStats` gains `waves`, `awakened`, `wanderers`, `hidden`, `seized` and `founded`.
- Person: `wave` (the year they awakened in a wave) and `hidden` (years sealed).

**Rules.**
- `_lifeStep` reads `_worldBands(people)` at the start of the year. The band below a band short of target grows faster
  (`_growPerson` has a new `boost`), and a crowded band's hazard is multiplied by `crowdHazard`. Births follow the low
  band's room.
- After births, `_replenishWorld(yr, quiet)` runs:
  - a wave on wave years while the low band is short;
  - a wanderer per short Foundation or Core band (a seeded roll × the deficit);
  - a hidden master for the shortest top band (`_hiddenMaster`).
  All of it is seeded per slot + year (`wsRng`) with no Math.random (`_wsNewRival` takes an `rng`).
- The controller acts on **any** shortfall, scaled by the deficit. Acting only on "thin" (below −15%) left the bands
  parked at the edge (measured).
- `_hiddenMaster` mints the old monster (age fitted to at most 55% of their span), chronicles the waking as notable, then
  picks a fate.
  - It never seizes the sect of a pending world-sect event or your current war's foe.
  - A seizure of your sect or your line's sect is a negative log line + toast. Any other waking is a special log line +
    toast. Both always trigger the `hidden_master` banter.
  - In the generation jump (quiet years) it is only chronicled.
- **Elder draft** (`_wsEnsurePeople(r, true)` → `_wsDraftElder`) runs only from the yearly sect tick and successions,
  never from a UI read (`sectPeople`). Candidates are world-owned `wanderer`/`disciple` people of age, within
  `elderStageBelow` of the master. That sect's own disciples come first, then the unsworn, with a seeded pick among the
  top 3.
- **Chronicle** (`_chron`) records quiet years too, so the years between lives are written. It takes every `_wsChron`
  line (now with pids, notable and routine flags) and the `_chronLives` news:
  - deaths from Core Formation, plus deaths in your class or clan, of a Chosen, or of anyone you've seen;
  - breakthroughs from Core Formation, and your class's from Foundation;
  - Ascensions;
  - final seclusions from Nascent Soul;
  - your classmates' weddings.
- **Routine lines** (an elder drafted; "N hopefuls take the oath") are flagged `q`. They stay under the Sects filter and
  are left out of All; a note under All links to them (Visual Review polish 1).
- API: `worldChronicle({ filter, limit })` returns newest first with `who`, tags, counts (incl. routine), bands and
  stats. Also `chronicleNews()` (notable since last seen), `noteChronicleSeen()` and `worldBandsInfo()`.

**UI.** 世 World → **Chronicle** (`renderer/game/chronicle-view.js`, pane `#tab-chronicle`, between Class and Events):
- "The world by realm": count / target per band, a gold target tick, Settled / Thin / Crowded with a "why" tooltip, and
  a fold "How the world refills" (the paragraph + a fact list). It sits beside the feed when the pane is wide and wraps
  above it when narrow.
- The feed: filter chips with counts (Notable gets a gold dot while unseen); years newest first, with the lines in order
  within each year; a kind icon; notable lines gold-edged; names open the person card; tags (your sect / clan / class);
  "Earlier years" paging, 80 lines at a time.
- The Sects ledger's folded chronicle became one link card showing the latest line. It opens the Chronicle on its Sects
  filter (`[data-chronicle="sects"]`, handled in game.js).
- An idle attention item, "The world stirs", leads to the Chronicle.

**Tuning (measured).**
- `node scripts/sim/probe-world-lives.js 1200 {1,2,3}`:
  - every band's mean is within ±11% of target (low −6%, Foundation +6…11%, Core −7…−10%, Nascent −3…−11%, Severing
    −8…−11%);
  - old age is 12–13% of deaths;
  - about 1 hidden master per 25 years and 1 seizure per 70 years;
  - about 2.4 ms per game year;
  - 1,800 years → slot 703 KB.
- `npm run sim:quick`: healthy, worst slot 510 KB. Its band line reads low for the afk run because the world barely runs
  there (it is frozen while the game is closed).

**Tests.**
- `checks/living-world.js` grows from 68 to 98. The 4.6 block covers:
  - no Math.random;
  - band means within ±15% over 500 years, and no lower-band extinction;
  - the refill counts, old age and no dead seat;
  - a wave, wanderers, a seizure and a founding;
  - the draft vs a UI read;
  - the merged feed: both stores, the cap, order, filters, routine lines under Sects only, people, notable news +
    clearing, the pre-4.6 migration and quiet years being written.
- Smoke `scenarios/chronicle.js` (4 modes, zero console errors).
- Sim invariant `band_extinct`, plus the report's "World by realm" line.
- Visual Review Gate **7.8 PASS** (cycle 1).

**Gotchas.**
- The sects' short chronicle (`sects.chronicle`, cap 14) is still written, because the sect page and old checks read it.
  The merged feed is the one the player reads.
- A hidden master who founds a sect needs room under `WORLD_SECTS.maxAlive` (12). In a full world they seize or wander.
- Not yet built: clickable names in the Events log (4.7) and NPC goals (4.4/4.5). Today an old monster's whole agency is
  the moment of waking.

## 4.4 + 4.5 as built (2026-10-03): the heavy tier, NPC goals, known-first casting

**User picks (assessment):** the **full goal set** (NPCs may kill each other, betray, split and found sects on their own)
and known-first casting in **all four** systems (suitors + courtship, arena rosters, road strangers, own-sect recruits).

**Depth.**
- **Memory:** `p.ties` (≤ 8, −100..100: sworn 100, a blood feud ≤ −80), `p.feud { pid, why, y }` (one avenger per
  killing), `p.killedBy`, `p.act`.
- **Choices:** none for the player. Every goal is the NPC's own; you choose whether to court, recruit or fight whoever
  is cast, as before.
- **Hooks:**
  - Sects: joins and defections; a strong wanderer founds a sect; an elder betrays their master and takes the seat,
    dies, or splits the sect.
  - Family: suitors and courtship candidates can be classmates.
  - Arena: a classmate can hold a ring.
  - Own sect: a wave's youth or an unsworn classmate is offered at your gate and becomes that disciple.
  - The road: lover and recipe strangers are real people.
  - The Chronicle (deeds), the log (people you know), toasts (big deeds of your class and familiar faces).
- **Drama:** a classmate slain in a blood duel; their child swears the feud and dies trying, or avenges them; two
  Chosen swear brotherhood; an elder overthrows your sect's master (a negative log line + toast).

**Data** (`npc-lives.js`):
- `NPC_HEAVY`:
  - heavyMax 150, cohortReserve 0.4, relevance weights, 4 seasons a year;
  - 12 goals with bases + activity lengths, temper multipliers (`temperGoals`), ambitious tempers;
  - morality bends dark goals (duel, betray, revenge) and light ones (help, swear);
  - seclusion pace × 1.3, the roamers' meetings, blood-duel odds, the `bloodTie` −80, the high-realm duel damper,
    feud fading (50 y), betrayal odds and the split share.
- `NPC_CAST`: known chance 0.75 (0.95 once throttled), new names 5 + stage/4 (≤ 10) per open hour, weights, the
  recruit age.
- `NPC_DEED_TEXT` and `NPC_ACT_TEXT` hold the deed lines and the card's "Now:" lines.

**State.**
- World: `seasonAt`, `tiersYear`, `cast { hour, fresh, known, freshTotal, knownTotal, hours }`, `castSeq`, and
  `lifeStats.deeds`.
- Person: `tier`, `act`, `ties`, `feud`, `killedBy`.
- A recruit-pool entry may carry `pid`, and so may the disciple made from it.
- `_ensurePhase28Fields` sets `seasonAt` without any catch-up.

**Rules.**
- `_assignTiers(yr)` runs yearly in `_lifeStep`. Relevance = familiarity + |rel| + this life's class + Chosen + your
  sect + a seat + a feud + ties + a pin. This life's class takes its reserved share first. Clan rosters and
  family / arena / own-sect people are never heavy, and ties to the dead fade.
- `_tickSeasons()` runs on each new game season while open (catch-up ≤ 8 seasons). `_worldYears` lives 4 seasons a
  year quietly in the generation jump.
- `_heavyStep(si)`: every heavy person whose activity has run out picks a goal by `_weightedRng` (seeded
  `wsRng(id|season|goal)`):
  - seclude (pace × 1.3; injured × 2);
  - roam (one of the 3 highest places they may enter; roamers there meet: a gulf in morality or a psycho makes a
    grudge, else a friendship; a hot-head may duel on the spot);
  - mission (a little progress);
  - court (the closest-tied single who fits; 45% weds);
  - duel (the hated first, else someone of another sect within 2 stages; to the death on a deep hatred, 4%, or 40%
    for a psycho; × 0.3 urge from Nascent Soul);
  - revenge (to the death, or bide in seclusion if the target is 3+ stages above);
  - join (your sect × 3);
  - leave;
  - found (Core Formation+, room under maxAlive);
  - betray (an elder within a stage of their master: win → seated, the master slain; else die or split);
  - help (halves a friend's injury);
  - swear (a mutual tie ≥ 60 → 100).
- `_npcSlain(v, killer)`: v dies (`_npcDies`, seats handled) and every kin + sworn sibling hates the killer. **One**
  of them (the closest: a child, a spouse, a parent, a sibling, a sworn sibling) takes up `feud`. A first cut that
  spread the feud to all kin cascaded into a bloodbath (75% of deaths) and was replaced.
- `_deed()`: the Chronicle (k `deed`) when someone in it is known to you or it is notable; your log when you know them
  (a log line also raises familiarity: `addEvent` with a pid → `fam + 1`); a toast for big deeds of your class or a
  face you've seen 3+ times.
- **Casting** (`_castKnown(kind, { stage, age, exclude })`):
  - A seeded stream (`castSeq`), so casting never shifts Math.random.
  - Candidates are world-owned and living, not a clan's, not your kin or children, not busy anywhere else, not a
    master or elder. Suitors must be single; recruits unsworn and below Foundation.
  - Weighted by familiarity + class + Chosen.
  - `_castCopy` gives the owner a copy and marks the registry person's owner + role at once.
  - Call sites: `_rollStranger` (suitors, courtship, both road strangers; ids already offered are excluded),
    `_arenaEnsureRosters`, `_genRecruit(exclude, cast)` (only the gate's pool casts). `recruitDisciple` keeps the pid.
- `knownFace(pid)` returns "Your classmate" / "Old classmate" / "Known face" (fam ≥ 2) / null.
- `_weightedRng` now ignores missing / NaN / ≤ 0 weights. A hidden master's ambitious doubling of an absent "found"
  weight gave NaN and silently forced a founding (found by a check).

**UI.**
- The person card's **"Their life now"** (`personInfo` → `now`, `nowPid`, `nowName`, `ties`, `feud`, `killedBy`): the
  activity line (names tappable), the feud with who and why, the ties as toned words + tappable names, and "Slain by"
  on the dead.
- `PersonCard.known(pid)` is the eye pill, used on the proposal overlay, courtship candidates, road encounter cards
  (game.js), arena roster rows and the gate's recruits (now tappable names).
- Also fixed: the proposal + road encounter cards printed a root's CJK name (now `latinOnly`).

**Tuning (measured).**
- `probe-world-lives.js 1200` on 3 seeds (with the seasons):
  - every band within −13…+5%;
  - deaths: duel ~20%, feud ~18%, seat struggles ~16%, old age 5–6%;
  - per 1,200 years about 2,700 duels (440 to the death), 270–340 revenges, 115–165 betrayals, 1,900 sworn
    brotherhoods, 1,600 heavy weddings;
  - hidden-master seizures fall to ~1 per 50 years (`hiddenFates` seize 2 / found 2 / wander 6; `thinBoost` 1.5,
    `hiddenChance` 0.7, `hiddenGap` 5, since the strong now die in duels and betrayals too);
  - ~6.5 ms per game year in all, a season ≈ 1.3 ms.
- `sim:quick`: healthy; 150 heavy; 59% of casts are known faces; 7.8 new names per open hour (cap 5–10).

**Tests.**
- `checks/heavy-ai.js` (new, 35): tiers + the reservation, no Math.random, step cost, 120 years of goals, ties, sworn
  brotherhood, old age < 25%, duels + feuds < 50%, no dead seat; one avenger, cards for the feud and the killer, a
  revenge to the death; a betrayal; "Now"; casting share, no kin, single, copies, distinct suitors, the classmate
  marker, the throttle, a recruit who is that person, arena rosters, the counters; seasons frozen while closed.
- `living-world.js`: the lineage-disciple check rests the heavy tier (a disciple may now leave of their own accord);
  `arena.js` accepts cast duelists' registry ids.
- Smoke: `scenarios/heavy.js` (new: card + proposal + arena + recruits, 4 modes); `family.js` updated for Phase 14's
  fifth child action.
- The report's "Heavy tier + casting" line.

**Gotchas.**
- A cast duelist is arena-owned while on a roster: the world sim skips them there (they don't age or grow in the ring).
- NPC↔NPC kills by the heavy tier don't feed the class's "fallen" attention count (they reach your log + Chronicle as
  deeds).
- Not yet: any of this reaching **you** — NPCs never seek you out or remember you here (encounters 4.9, memory 4.10,
  rival 4.10b).

---

## 4.7 as built (2026-10-03): World → People, pins, tappable log names

**What the player gets.**
- **世 World → People** (`renderer/game/people-view.js`, pane `#tab-people`, the second World sub-tab): everyone you know.
  - A search box (names + sect names), a sort (Who matters most · Highest realm · Recently seen · Name), and filter
    chips with counts: All · Pinned · Classmates · Kin · Sect · Grudges · Fallen. Every filter but Pinned + Fallen
    lists the living; empty chips hide (All + Pinned always show).
  - A row: the pin star, the name, how they feel about you (only when `rel` ≠ 0, with a heart / broken icon so it
    isn't colour alone), tie chips (Your spouse / child / parent / clan, Sworn against you, Your disciple / branch
    head, Your sect master / elder / Fellow disciple, Your classmate, Classmate life N, Arena duelist, Known face;
    plus Sect master/elder, Chosen, Feud, Healing, Final seclusion), realm · age · sect (or cause · year for the
    fallen), and the latest line the world wrote of them (Chronicle first, then your log), with a gold dot when it's
    fresh news of someone pinned.
  - Tapping a row opens the **person card inline**: beside the list when the pane is ≥ 560px (Desktop; the row stays
    marked, a "Close" link), in place of the list with an "All people" link when narrow (Overlay, Expanded, phone).
    Names inside the inline card step through in place (`data-pc-inline` → `PersonCard.onInline`) with a Back
    link; its "go" buttons work as in the popover.
  - The shell (title, search, sort) is drawn once; a state change redraws only `.pp-body`, so typing keeps focus.
- **Pins (★).** The star on a row or in any person card's header (popover too). The player's own choice, capped at
  `WORLD_PEOPLE.pinMax` (12; a toast says why when full). A pinned person is **heavy at once** (the relevance weight
  `pin: 1000` already kept them heavy yearly), so their deeds reach your log + the Chronicle, and they are **never
  pruned** after death (`_pruneDead` already kept `p.pin`). Pins live on the registry person, so they carry across lives.
- **News of the pinned.** `peopleNews()` counts Chronicle lines naming a pinned person since `w.peopleSeen`; an idle
  attention item ("News of someone you follow", icon `star`) points at People. Entering the view (nav onShow →
  `PeopleView.enter()`) takes the mark once, so the rows' fresh dots stay while you look.
- **Tappable log names.** `addEvent` stores `ev.who = [{ pid, n }]` (≤ `logNamesMax` 3): the event's own pid first,
  then any registry person whose full name (two words) appears in the text. The Events log renders those names as
  `PersonCard.link` (longest name first, marks so links never nest). All 221 `addEvent` sites get it for free.
- **World → Class:** the whole row now opens the card (was only the name).
- New icons: `star` (filled via `.on`), `search`.

**State.** `p.seenY` (the year you last saw their name: card opened, log line, cast to you; drives "Recently seen") ·
`w.peopleSeen` (the People news mark; migrated to `w.chronSeq` in `_ensurePhase28Fields`, so an old save's history isn't
news) · `ev.who` on events. `p.pin` already existed (relevance + pruning) and now has its setter.

**API (game-state.js).** `knownPeople({ q, filter, sort, limit, since })` → `{ rows, counts, shown, matched, pins, pinMax,
year }` (~0.2 ms at 160 people) · `togglePin(pid)` → `{ ok, pinned }` or `{ ok: false, reason: 'full' | 'unknown' }` ·
`peopleNews()` · `notePeopleSeen()` (returns the previous mark) · internal `_namesIn`, `_tieToYou`, `_inPeople`,
`_peopleCtx`. Who is listed (`_inPeople`): pinned, any cohort, a familiar name (`fam` > 0), any `rel`, your clan, family
or arena owned, your own sect, your joined sect, anyone sworn against you, your parents. Never you, never a past life.

**Data.** `WORLD_PEOPLE.pinMax` 12 · `peoplePage` 60 (a "Show more" button pages) · `logNamesMax` 3.

**Tests.** `checks/living-world.js` +20 (98 → 118, see qa-sim.md). Smoke `scenarios/people.js` (new; Overlay / Expanded /
Desktop / phone: the attention item, list, fresh dot, pin count, Grudges, search keeps focus through a redraw, the
inline card wide + narrow, step-through + Back, unpin + pin from the card, a log name → popover card; no sideways
scroll) · `class.js`'s overflow helper now names the culprit.

**Gotchas.**
- (4.10b added the Rivals filter.) Grudges covers `rel` < 0 and anyone sworn against you.
- A log line names only people already in the registry when it's written (a child born that instant is mirrored on
  the next save, so its first line isn't tappable).
- The rel words appear only once `rel` moves, and `rel` toward you only moves from 4.10 (memory + interactions).

---

## 4.9 as built (2026-10-03): encounters — "Met on the road"

**User picks (assessment):** the full 4.9 as specced; answers **write rel + a memory line now** (4.10 adds rumours,
honour/infamy, clan grudges and card actions on top); the **stance lives on the queue itself** (not in ⚙).

**What the player gets.**
- **Roam → Explore → "Met on the road"** (`renderer/game/encounter-view.js`), at the top of Explore: a count (`n/6`,
  counting the old lover / formula strangers, which now sit in the same list), **Your bearing** (Wary · Courteous · Bold ·
  Ruthless, with a one-line hint and "it only marks an answer; you always choose"), compact rows (icon, title, name ·
  place · years ago, a kind tag; ambush / vengeance rows red), one row open into the full card: the name (tappable →
  person card) + known-face pill + how they feel about you (word + heart/broken icon), realm · temper · character, the
  scene, **why they came** ("They are sworn against you: you robbed them as they lay bleeding."), and the answers with
  odds, costs and lock reasons. The bearing's answer carries a gold "your bearing" mark. A one-time hint (once per slot)
  sits under the list. A line naming "N more are looking for you" when people wait.
- **Seven card kinds** (the NPC's intent): ambush (fight · flee · hand over stones), challenge (spar · to the death ·
  decline), rescue (help · walk on · rob them), contest a find (split · fight for it · let them have it), travel together
  (accept · accept then take their share · go alone), a promising youth (take into your sect · point to a sect · pass),
  an old face (talk · spar · ask a favour). At your gate (a founder, yearly): challenge, youth, old face, ambush.
- Fights open the **battle page** as fight kind `road`, titled by the card ("An Ambush on the Road", "A Fight for the
  Find"…); the end step's raise/humble/spare/finish text speaks of the road, and the result line is the card's ending.
- **Attention:** "X is upon you" (urgent, for an ambush / avenger) or "N met on the road"; the Roam tab's dot follows.
- **Banter:** a new trigger `ambushed` (`{enemy}`), 4 lines × 14 tempers + 3 generic. Other cards stay quiet so the
  expedition's own line isn't replaced.

**Rules (game-state.js).**
- `_roadRoll(source, loc, place)` from `resolveExpedition` (after the lover/formula rolls), `resolveSectMission` and the
  yearly tick (a founder's gate). Chance `NPC_ENC.chance` 18% / 15% / 10%, at most `perHour` 4 cards per open hour.
- **Avengers first:** a living person whose `feud.pid` is you (an `_npcSlain` avenger after you killed their kin, or
  someone you robbed / betrayed / shamed) finds you with `avengerChance` 35%, outside the hour cap but at most
  `avengersPerHour` 1, not again within `avengerCooldown` 8 years. Their card is a **lethal ambush**.
- **Who** (`_roadCast`): a heavy roamer at that place (`roamerShare` 60%), on a mission someone of your own sect, else
  known-first casting (`_castKnown`, 18% a youth for a recruit), else a fresh person minted into the registry. Never
  someone already on a card, a master, or a face seen within `cooldownYears` 10 (unless |rel| ≥ 60).
- **Intent** (`_roadIntent`): base × temper (`NPC_ENC.temper`) × reads: ambush only when morality < 20 or rel ≤ −30,
  × infamy (low karma) × hate × the power gap; warm rel doubles team-up / old face; the gate never rescues, contests or
  teams up. An ambush is lethal for an avenger, rel ≤ −60 or a psycho; a challenge offers blood when rel ≤ −40.
- **Queue:** `s.road.cards` (per life) + `family.encounters` ≤ `queueMax` 6. Full: a notable person (avenger or
  |rel| ≥ 60) **waits** (`s.road.waiting` ≤ 3, told in the log) and takes the next free slot; anyone else is a **brush**
  (a log line, no choice owed). Nothing is ever answered for you; nothing expires.
- **On a card** a person has `p.roadCard`: they skip their seasonal goals (`_heavyStep`), casting skips them, and if they
  die anyway (`_killPerson` → `_roadForget`) the card goes with a log line ("X will not keep the meeting: …").
- **Answers** (`answerRoadCard(id, answer)`): every one runs `_roadRemember(p, key, place)` → `p.rel` ± (`NPC_ENC.rel`)
  and a line in `p.mem` (≤ 6, their own words, shown on the person card). Robbing / betraying (and humbling a proud heart)
  sets `p.feud = { pid: you, why }` → they come back as an avenger. Rescue costs Health (more where the place outclasses
  you), karma +3, and may bring a gift (one of their arts, or stones). Youth invite = a free disciple who IS that person
  (`pid` kept, `owner:'sect'`); point = they join your sect (Contribution +15) or the strongest world sect.
- **Road fights** (`_roadFightOutcome`): a win to the death → `_npcSlain(opp, you)` (their kin swear vengeance on you),
  no karma for killing an ambusher, otherwise `CHALLENGE_KARMA_DEATH`; a win that lets them live → spared / raised /
  humbled memory; a contest won → the find. A loss: dead in a lethal fight (`_die('road')`), else beaten (an ambusher
  takes 25% of your stones). The old string `p.feud` reactions of A6-3a never touch a registry person
  (`fi.roadChoice` instead); a feud sworn against you reads as the battle page's "holds a grudge" (power + yield odds).

**State.** `s.road { cards, waiting, seq, hour, n, avN, hintSeen, last }` (per life; `_newGame` + `_ensurePhase28Fields`) ·
`w.roadStance` · `w.roadHint` · `w.roadStats { rolled, cards, brushes, waited, answered, gone, byKind, byAnswer, bySource }`
(across lives, for QA) · person `roadCard`, `roadY`, `rel`, `mem`, and `feud.pid` = your id.

**API.** `roadCards()` · `roadCardInfo(id)` (answers with odds / notes / locks, `pre` = the bearing's pick) ·
`answerRoadCard(id, answer)` · `setRoadStance(id)` · `roadStance()` · `noteRoadHint()` · `roadStats()`.

**Data.** `npc-lives.js` → `NPC_ENC` (chances, caps, temper weights, the answers' numbers, rel deltas, the bearing's
pre-selects) + `NPC_ENC_TEXT` (titles, scene lines, why lines, brush / wait / gone lines, memory lines, feud reasons).

**Tests.** `checks/encounters.js` (71). Smoke `scenarios/encounters.js` (Overlay / Expanded / Desktop / phone: the
attention item, the Roam dot, the section first, 5/6, the hint, the ambush open first with its why + odds + the locked
yield, the bearing marking a different answer without answering, a row opening, an answer leaving a memory, Fight →
the road battle page). `sim:quick`: healthy; 4.4 cards per open hour (contest 0.89 · ambush 0.85 · challenge 0.73 ·
team-up 0.73 · rescue 0.61 · old face 0.36 · youth 0.24); the bot keeps a bearing per profile (active bold, casual
courteous, afk wary, 1 in 10 ruthless). First cut without the avenger cap ran 5.8/h with ambushes 1.8/h (a kill →
kin → avenger cascade); capped. Visual Review Gate **7.7 PASS** (cycle 1).

**Gotchas.**
- A feud sworn against a past life is against that life's id: it does not follow you into the next life yet (clan
  grudges are 4.10).
- Cards are per life (`s.road`); a new life starts with an empty road.
- One life in 7 of the active bot ended on the road (a lethal ambush fought early in a life): watch in the QA pass.

---

## 4.10 as built (2026-10-03): memory, reputation, rumours, the person card's deeds

**User picks (assessment):** one deed per person at a time on a **real-time** cooldown shown as `m:ss` ("never N game
years" — the user's rule; no Action Points); all eight deeds (gift · spar · duel · teach · invite · swear · denounce ·
court); **strong grudges, half debts** across lives.

**What the player gets.**
- **The person card → "What you can do"** (`person-card.js` `_acts`, popover + World → People's inline card): the open
  deeds first (icon, name, cost / the odds they accept / fight odds), then the locked ones as quiet lines with the reason
  ("They must hold you dear (+80)", "Only against someone at odds with you"). After a deed: "They need time before another
  deed: ready again in 3:59" (a live countdown; every deed dims alike). A first-time hint (once per slot, `w.actHint`). Duel
  and Denounce ask first (`showConfirm`). A spar / duel opens the battle page (fight kind `road`, card kind `spar` / `duel`,
  titles "A Spar, at Your Invitation" / "A Duel to the Death").
- **"Why"** beside their feeling: every memory with what it moved (`+40`, `−70`, `×2` for a repeated deed), a past life's
  marked, "Older memories, rumours, a forebear's debts" for the remainder, and the total.
- **Sworn sibling** chip (card header, People rows), a **Friends** filter on World → People (rel ≥ 30 or sworn).
- **Path → Character → "Your name"** tile (Unknown · Well spoken of / Whispered about · Upright / Infamous · Renowned /
  Notorious · Feared and honoured) with "Honour N · Infamy N"; its breakdown (`breakdowns.js` kind `repute`) lists what the
  name changes and the latest deeds.
- **Log lines that name the cause:** a friend's gift of stones, an enemy's slander (+Infamy), a sworn sibling falling, a
  sworn sibling swearing to avenge you, "X came to fight at your side" in a won/lost own war, rumours as memory lines.

**Rules (game-state.js).**
- `_remember(p, key, d, text, { rumour, deed })` is the one writer: rel ± d, a `mem` line `{ y, k, text, d, life, n }`
  (the same deed again in the same life folds into one line ×n), `_repDeed` (NPC_REP.deeds → `w.rep.h` / `w.rep.i`, ≤ 100,
  a log of 12), and a **rumour** when |d| ≥ 8. `_roadRemember` (4.9) now goes through it.
- `_tickRepute(yr)` (yearly, beside `_tickWorldLives`): both scores fade 1.2%/year; each rumour reaches ≤ 4 of the
  person's parents / children / spouses / ties ≥ 40 as a "heard" memory at 40% of the delta (a hearer with morality ≤ −40
  shrugs off cruelty); heavy friends (rel ≥ 50) send stones 5%/year; heavy enemies (rel ≤ −50 or sworn against you)
  slander you 4%/year (Infamy +2, their friends' rel −6). Seeded per person + year (wsRng).
- **The road reads your name:** Infamy ≥ 40 lets the righteous (morality ≥ 40) ambush you, weighted × 1.6 × infamy/50,
  with their own "why" ("your name has become a byword for cruelty"); Honour raises rescue + team-up weights.
- **Deeds** (`personActions(pid)` → `{ acts, cd, hint, sworn }`, `personAct(pid, id)`): one per person per
  `NPC_ACTS.cooldownSecs` 240 s of open time (`p.actAt`, `_cdNow`). Accept odds = base + reads ± Honour × 0.002 ± Infamy ×
  0.003, clamped 5–95%, rolled on the NPC's side; your choice is never rolled. Gift (30 + 25 × their stage; a miser /
  glutton / gremlin +20, else +10; +4 once they hold you dear) · Spar (accept 55% + proud + rel) · Duel to the death (only
  rel ≤ −40 or sworn against you; a kill of someone not sworn against you = `murdered`, Infamy +6) · Teach (you ≥ 3 stages
  above, rel ≥ 30, 15% of your Qi cap: their npcXp +0.4 and ×1.6 pace for 10 years via `p.mentorUntil` in `_growPerson`) ·
  Invite (a founder with room, rel ≥ 20, not a master/elder/kin/duelist; from a world sect → its stance −6) · Swear
  (rel ≥ 80: `p.sworn = your id`; each sworn sibling +0.08 to your sect wars, ≤ 0.3, in `sectWarOdds` /
  `_resolveSectWar` / `memberWarPower`; they take up a feud on whoever kills you on the road) · Denounce (honest: karma −5,
  Infamy +5, rel −30, their ties toward them −15, their foes warm +8, a proud heart feuds; a villain (morality ≤ −40):
  Honour +3, no karma) · Court (single, ≥ 18, rel ≥ 10, you at Foundation Building, no spouse / courtship: `f.court` with
  them as the target, interest + rel × 0.25 − Infamy × 0.25). A wrong (rob / betray / denounce / duel-kill) to a sworn
  sibling is `betrayedSworn` (Infamy +15) and breaks the oath.
- **A new life** (`_inheritRepute(newYear)`, first thing in `_beginLife`, before the skipped years so feuds don't lapse):
  feuds against the last life re-aim at you (`feud.heir` = their name, the clock restarts; the card says "sworn against
  your line"), rel ≤ −50 stays whole, every other rel halves, oaths end, Honour / Infamy × 0.5. An inherited avenger
  waits until you reach Foundation Building (`NPC_REP.heirFeudStage` 10). This closes 4.9's "a feud against a past life
  doesn't follow you".

**State.** `w.rep { h, i, log }` + `w.rumours` (in `_blankWorld`, so old saves get them via the blank-fill) · `w.repStats`
· `w.actStats` · `w.actHint` · person `mem[].d/.life/.n`, `sworn`, `actAt`, `mentorUntil`, `feud.heir`.

**API.** `reputeInfo()` · `personActions(pid)` · `personAct(pid, id)` · internal `_remember`, `_repDeed`, `_tickRepute`,
`_inheritRepute`, `_swornWar`, `_takeIntoSect` (shared with the road's youth card), `_isYourKin`. `personInfo` adds
`relWhy { items, older }`, `sworn`, and `memories[].past`.

**Data.** `npc-lives.js` → `NPC_REP` (deed weights, fade, carry, words, road reads, accept reads, rumours, friends /
enemies, heirFeudStage), `NPC_ACTS` (cooldown + each deed's numbers), `NPC_ACTS_TEXT` (labels, icons, memory lines, rumour
verbs, gift / slander / sworn lines, the hint). `NPC_ENC_TEXT.why` + `feudHeir`, `hunter`.

**Tests.** `checks/reputation.js` (45). Smoke `scenarios/reputation.js` (Overlay / Expanded / Desktop / phone: the deeds,
locks with reasons, the hint, Why, swear → countdown + Sworn chip + Friends, the duel confirm, a gift from the popover,
Character → Your name + its card). `npm run checks` 1569 ok. Visual Review Gate **7.75 PASS** (cycle 1).

**Gotchas.**
- The sim bot does not use the card deeds yet (the QA pass teaches it).
- Family members (spouse / children / lovers / clan) keep their own bond on Kin → Family; the card's deeds lock for kin.
- A rumour names its subject by the victim's full name; a hearer who died before the year tick is skipped.
- Rel toward you is per person, not per life: `_inheritRepute` is what scales it at each rebirth.

---

## 4.10b as built (2026-10-04): Your Rival (宿敌)

**User picks (assessment):** a **World → Rival** sub-tab (plus a chip on the person card and a Rivals filter in People);
the spec's cadence (~15–25 game years between visits, shown to the player only as real open time); in a **blood feud**
duels to the death **and** visits that go after your kin (always as a card you answer, never a silent death); the
Heavenly Rankings "Your Class board" duel is **deferred to 4.8**.

**What the player gets.**
- **世 World → Rival** (`renderer/game/rival-view.js`, pane `#tab-rival`): you and your rival side by side (name →
  person card, realm, age, "They lead by 2 stages"), their temper · morality · root · sect + chips (Chosen, Sworn sibling,
  "The X line"), a red banner when their line carries a past life's rivalry, the **heat meter** (−100…+100, the −70 and
  +70 zones marked, each end saying what it opens and lit when reached, a "why it moves" line), the record (meetings ·
  wins · losses), a status line ("They are waiting for you on the road" + **Answer them** → Explore · "looking for you" ·
  "They will seek you out again in about N min of open time" with a live estimate · the ending), **Seek them out
  yourself** (spar · duel to the death · gift, the person card's own buttons and cooldown), the history as a timeline,
  a house that will send its heir into your next class, and a fold of past lives' rivals. A first-time hint.
- **Their cards** in Roam → Explore → "Met on the road" (gold "Rival" tag, "Blood feud" when bitter; a heat line +
  "The rivalry" link; every answer says what it does to the heat; locks say what they need):
  - *Your rival comes calling* (`rivalDuel`): spar · to the death (locked outside a blood feud: "heat −70 or colder; now
    −45") · decline (heat −8, a proud heart −14).
  - *Your rival, with a jar of wine* (`rivalTalk`, heat ≥ 40): drink · a friendly spar · swear brotherhood · court them
    (both need heat +70; court also has the person card's own locks).
  - *Your rival, cornered* (`rivalTrouble`; more often when they are wounded): help (Health, karma +3, heat up) ·
    sabotage (their progress gone + years healing, karma −6, found out 50%: heat way down + Infamy) · walk on.
  - *Your rival goes after your own* (`rivalKin`, only in a blood feud): stand between them (a lethal fight) · pay the
    blood price (160 × their stage + 1) · let your heir / child / spouse face them (odds shown; they can die).
- **Attention:** "Your rival X seeks you" (urgent when it is a blood duel or your kin), "News of your rival" (World dot).
- **Log + toast:** "Your rival X has broken into Core Formation. The heavens tremble." (+ banter `rival_rise`), passing
  each other, their fall or Ascension, a war they lead. The battle page titles: "Your Rival, Again", "Between Your Rival
  and Your Kin".
- **Sect wars:** when their sect is the foe, Sect → War → "Their mountain" names them: the foe's Might × (1.12 + 0.03 per
  stage they stand above you, ≤ 1.35); the war is a beat and cools the heat by 6.
- People: tie "Your rival" / "Rival of a past life", the **Rivals** filter (every life's rival, living or not; this
  closes the 4.7 "no Rivals filter yet" gap).

**Rules (game-state.js, section "Phase 28 task 4.10b").**
- **Who** (`_pickRival`, at the end of `_seedCohort`; a pre-4.10b save names one on load): of your class, alive, not
  in a clan, not your surname, not kin; a house heir first, then Heaven's Chosen, then stage and talent. `p.rivalOf` =
  your id. The log names them.
- **Heat:** every `_remember` on the rival moves heat by `relToHeat` 0.5 × its rel delta; extras: a refused challenge,
  being overtaken (proud −6, else +3), a war they led −6, paying the blood price +4, your kin killed −20, your kin saved +6.
- **Schedule** (`_tickRival`, yearly, live only): first visit 5–10 game years after you awaken, then every 15–25 (seeded per
  person + year). Kind: in a blood feud with kin to strike 35% `rivalKin`; else trouble 18% (60% when they are wounded);
  heat ≥ 40 → wine 60%; else a challenge (blood at ≤ −70). Their cards skip the hour cap and the face cooldown; when the
  queue is full they wait **first in line** (`unshift`). The rival is never an ordinary road face or avenger.
- **Fights** (`_roadFightOutcome` → `_rivalFought`): wins / losses / meetings + a beat; a kill ends it (`slain`, no karma
  in a kin defence, no "murder" Infamy in a blood-feud duel); losing a lethal one ends your life (`killedYou`); a lost kin
  defence lets them reach your kin.
- **The person card's duel** with your rival also opens at heat ≤ −70 (with the heat-worded lock otherwise).
- **Hazards:** the living rival takes the world's road and backlash perils at `hazardMult` 0.35 (the rivalry needs time).
- **Endings:** their death (`_killPerson` → `_rivalEnds`: fell / ascended), your kill, your death, or your life ending
  first (`_rivalLifeEnds` in `_recordLifeInWorld`).
- **Across lives:** at your death, |heat| ≥ 30 or a death between you (your kill, theirs, a kin killed) makes a **house**
  (`w.rivalHouses[surname]`; a slain founder → heat ≤ −60, other blood → ≤ −40). The next class's first Chosen is born
  into that line (`_rivalHouseHeir`: surname + the founder or a living child as parent, `rivalHouse`) and becomes the
  rival: heat × 0.5, rel ≤ −20 when bitter, beat "inherited", the card's "why" names the forebear. A bitter house is also
  noted as an enemy (`kind: 'rival'`) and the rare **rival-family rebirth** (2.6d) uses their line: the old rival, or a
  living child of theirs, heads the house you're born into (`_rivalLineHead`).

**Diverged from the spec:** the rival's "clan" is a house record (`w.rivalHouses`), not a `world.clans` entry, because
clan members are excluded from the heavy NPC tier (`_heavyEligible`) and the rival must keep living a heavy life.
Overtaking gives no karma (heat only). The Class board duel waits for 4.8.

**State.** `w.rivals [{ life, pid, name, heat, meets, wins, losses, beats [{ i, y, k, text, place, heat, tone }], seq, seen,
nextY, lead, end { y, k, text, cause? }, house, inherited { fromLife, fromName, heat, end } }]` · `w.rivalHouses` ·
`w.rivalHint` · person `rivalOf`, `rivalHouse` · road card `rival`, `kin`, `blood` · `PERSON_CAUSE_TEXT.rival`.

**API.** `rivalInfo()` · `noteRivalSeen()` · `rivalNews()` · `noteRivalHint()` · `rivalStats()` (QA) · internal
`_pickRival`, `_tickRival`, `_rivalMeet`, `_rivalCardOpen`, `_rivalAnswers`, `_rivalAnswer`, `_rivalKinStrike`,
`_rivalFought`, `_rivalEnds`, `_rivalLifeEnds`, `_rivalHouseHeir`, `_rivalLineHead`, `_rivalWar`, `_rivalWarBeat`,
`_rivalLead`, `_rivalRose`, `_courtPerson` (shared with the person card's Court).

**Data.** `npc-lives.js` → `NPC_RIVAL` (cadence, heat reads, thresholds, the answers' numbers, house carry, war, hazard,
words, the bearing's pre-selects) + `NPC_RIVAL_TEXT`. Banter trigger `rival_rise` (`{rival}`; 4 × 14 + 3 generic).

**Tests.** `checks/rival.js` (62). Smoke `scenarios/rival.js` (Overlay / Expanded / Desktop / phone; 84 ok, zero console
errors). `npm run checks` 1630 ok. `sim:quick`: rival cards ≈ 1 per open hour; active-bot lives (~1.8 h) met their
rival 0–7 times (median 1 before the hazard cut; the casual profile wasn't in quick), heat −20…+81, 5 house heirs.
Visual Review Gate **7.9 PASS** (cycle 1; 3 polish fixes applied: a container query stacks the face-off in narrow panes,
larger heat-card text, the "Indifferent" feel chip hidden on rival cards).

**Gotchas / for QA.**
- Watch meetings per **casual** life in the QA pass (target ≥ 3); tune `meetEvery` / `hazardMult` there.
- The sim bot answers rival cards by its bearing (`NPC_RIVAL.preselect`) but doesn't start deeds from World → Rival.
- `rivalKin` needs a grown child or a spouse; with neither, a blood feud only brings blood duels.

## 4.8 Heavenly Rankings (天榜 · 潜龙榜 · 同届榜) — spec (2026-10-04)

**User picks (assessment, 2026-10-04):** a new **World → Rankings** sub-tab (three boards, opens on Your Class; World →
Class keeps its realm view); **all four consequences** (challengers from below, genius hunters, fame + sect effects, Veil
your name); published **each game year**, every countdown shown in real open time (mm:ss), never game years.

**Depth pass.**
1. *Memory.* `w.ranks` keeps the last publication, the one before it (▲▼), your best place per board, titles earned
   (per life, for the v2 robes, A9), the Rising Dragon honour roll (who aged out and how high they rose), recent
   headlines, and how many challenges you refused. Each person keeps `rankBest` and `renown`.
2. *Choices.* A **challenger from just below** (spar / to the death / decline). A **genius hunter** after a Rising Dragon
   (you: fight / flee / pay / veil your name; your child: stand between them / pay / hide the child / let them face it).
   A **sect invitation** to a Rising Dragon or a Heaven ranker (accept → join as an Inner Disciple, leaving your sect if you
   have one / decline politely / refuse outright). The **Class board duel**: challenge the classmate just above you.
   **Veil your name**: off the public boards (fewer challengers, no hunters or invitations, no rank fame); your toggle.
3. *Hooks.* Power (realm, progress, root, body tier, arts, gear) · encounters (the road queue, the bearing) ·
   reputation (killing a hunter is Honour; killing a challenger is a challenge death: karma) · Your Rival (their place
   beside yours) · sects (rank fame for a founder; ranked members raise a world sect's Might; invitations) · family
   (your children on Rising Dragon draw hunters) · the Chronicle (a new #1 Under Heaven) · banter (`rank_rise`).
4. *Drama.* Best: #1 Under Heaven, titles, sects courting you. Worst: a hunter kills your prodigy child; a challenger
   you accepted kills you; your rival passes you on the board for all the world to see.
5. *Feedback.* Refusing challenges marks you a coward (more challengers come, renown bleeds); winning ranked duels
   builds renown (your place); a veiled name fades from the world's mind.
6. *Agency.* Every challenge, hunter and invitation is a card you answer (the bearing only pre-selects). The Veil is a
   toggle. Nothing resolves for you.

**Rules.**
- **Rank power** = realm (stage × 100) + progress in the stage (0–99) + spirit root + body tier + arts (rarity points of
  the worn loadout, mastery-scaled; an NPC's rolled arts, else an estimate by realm) + gear (your weapon / artifact) +
  renown. One function, `rankPowerParts(p, self)`, for you and everyone (the "why" breakdown shows its parts). Temper and
  grudges are fight factors, not rank. `Persons.powerScore` is unchanged (the heavy sim's duels keep it).
- **Heaven Ranking:** every living mortal in the registry (not ancestors, not the ascended) + you, by rank power.
- **Rising Dragon:** anyone ≤ 60 years on the path (game years since awakening at 16); score = power × 20 ÷ (years + 20),
  so youth counts. Aging out with a best place ≤ 20 writes the honour roll (and a title for you).
- **Your Class:** your cohort (alive, fallen, ascended), by power; the fallen and ascended stay listed below the living.
- **Publication** each game year (`_tickRanks`): boards recomputed (top 100 kept), ▲▼ against the last one, headlines for
  you (first listed, top 20 / 10 / 3 / #1, a best), a new #1 Under Heaven (chronicle), your rival's place passing yours,
  classmates' firsts ("first of your class to reach Core Formation"), class milestones ("only 20 of your class still
  live"). Only notable lines reach the log; the rest stay on the Rankings view.
- **Renown** (±): ranked duels move it (win +, lose −, refuse −), it fades 8% a year.
- **Consequences** (unveiled only): rank fame for a founded sect; a world sect's Might + per member in the Heaven top 20;
  a challenger roll each publication when you're on Heaven top 50 or Rising Dragon top 20 (more after refusals); a hunter
  roll when you or your child are on Rising Dragon top 20; an invitation roll when unaffiliated or in a weaker sect.
  Cooldowns between visits are internal; nothing is shown as game years.

**UX pass.** World → Rankings: board chips (Your Class · Rising Dragon · Under Heaven), your row pinned at the top with
your place, ▲▼ and a "why" (power breakdown), the top 20 + your ±2 neighbours, names open the person card, ★ pinned and
rival/kin chips, the next publication in real time, the Veil switch with its trade-offs, titles, the honour roll and the
last headlines. Cards arrive in Roam → Explore → "Met on the road" with a "why" and the odds. An attention item tells you
when a publication moved you. Overlay: one column; Expanded/Desktop: the board beside your standing + headlines.

## 4.8 as built (2026-10-04): the Heavenly Rankings

Built as the spec above, in full (the user's picks: a World → Rankings sub-tab, all four consequences, each game year).

**State.** `w.ranks` (built lazily by `_ranks()`; `_blankWorld` has `ranks: null`): `{ life, y, seq, seen, boards { heaven,
dragon: [{ pid, sc }] ≤ 100 }, prev { heaven, dragon, class, classNow: { pid: place } }, you, best, titles [{ t, life, y }],
honour [{ pid, name, place, y, you }], news [{ i, y, text, tone, log }] ≤ 24, veil, declines, cd { challenge, hunter,
invite } (game years, internal only), renown, firsts { realm: pid }, alive, duelAt (real time, `_cdNow`), stats, hint }`.
A new life resets the per-life fields (you, best, renown, declines, firsts, cooldowns); titles + the honour roll stay.
Person: `renown` (fades 8%/yr, dropped under 2), `rankBest { h, d }`, `rankHiddenUntil` (a hidden child), `hunter`.
World sect: `ranked` (members in the Heaven top 20). `PERSON_CAUSE_TEXT.hunter`; `NPC_REP.deeds.slewHunter` (Honour +4).
About 9 KB in a late save.

**Rules as built.**
- `rankPowerParts(p, self)`: realm × 100 + progress (yours: Qi ÷ cap; theirs: npcXp) + root × 10 + body tier + arts + gear
  (yours) + renown. **NPC arts are always the realm estimate** (`NPC_RANK.artEstimate` by `_personRealm`), never their rolled
  arts: `personFightOdds` rolls arts on first read, and reading them here reordered the board between two reads (the Class
  duel's "one above you" moved). Yours are your worn loadout × mastery.
- `_tickRanks(yr)` on the game-year tick (after `_tickRival`). The first publication on any save is quiet (baselines + one
  news line). Then: renown fades; Heaven / Rising Dragon / Class rebuilt; ▲▼ vs the last publication; best places; a world
  sect's `ranked`; your moves (`_rankYouMoved`: the log only on crossing 20 / 10 / 3 / 1, titles at 10 / 3 / 1, the
  `rank_rise` banter at the top 10); a new first under Heaven (chronicle); your rival passing you on a board; the honour roll;
  class firsts (each realm from Foundation Building) + "only N still live" (20 / 10 / 5 / 1); then `_rankVisitors` (unveiled only).
- Visitors (seeded `wsRng(self|rank|yr)`, never Math.random): a challenger (Heaven ≤ 50 or Dragon ≤ 20; chance 0.03 ×
  (1 + 0.25 × refusals, ≤ 4); 8-yr cooldown; someone 1–6 places below, ≤ 3 stages away, proud tempers first); a genius
  hunter (you on Dragon ≤ 20, else your child there; 0.02; 15-yr cooldown; a minted dark-hearted cultivator 1–2 stages
  above the prey, reused while alive); an invitation (no own sect; 0.03; 20-yr cooldown; the mightiest open sect mightier
  than yours, its elder or master as envoy). All go through the road queue (`_rankMeet` → `_roadCard(…, { rank })` →
  `_rankCardOpen`; first in line when the queue is full).
- Answers (`_rankAnswers` / `_rankAnswer`): challenge spar / blood / decline (renown −15, proud −25; they gain half);
  hunter fight / flee / pay (120 × (stage + 1)) / veil (75% they lose the trail, else the fight); a hunter after your child:
  intercept / pay / hide (off the boards 12 years, bond −5) / leave (the child lives 0.5 + 0.08 × stage gap, else dies:
  cause `hunter`); invite accept (leaves your sect first, joins at rank 1) / decline (stance −2) / refuse (stance −8). Fights
  end in `_rankFought` (renown +30 / −20; a hunter slain: renown +40, karma +2, Honour; killing a hunter costs no karma).
- The Class duel (`challengeRanked`): only the classmate one place above you, ≤ 3 stages away, a spar, a 5-minute
  real-time cooldown.
- `_rankFame()` joins a founder's fame (`ownSectInfo().fame.ranked`, Sect → Fame); `worldSectMight` + 6 per ranked member.

**UI.** `renderer/game/rankings-view.js` (pane `#tab-rankings`, the World sub-tab after Class): tabs Your Class / Rising
Dragon / Under Heaven; your standing (place, ▲▼, the Rank power pill → `data-bd="rankpower"` breakdown, renown, best, why
you're off a board); the real-time next publication; top 20 + your ±2 + pinned / rival / kin, a gap marker, a "scores as
published" caption; the Class duel row; the fallen; a side column (two columns at a ≥ 540px container): the Public | Veiled
toggle with its trade-offs, titles, headlines, the honour roll. Road cards: tags Ranked / Hunter / Invitation, a crown line
+ "The rankings" link. Attention: hunters are urgent; "The rankings are published" (idle) only for logged headlines
(`ranksNews`). Person card chips (#n under Heaven / Rising Dragon, Genius hunter); World → Rival's rankings line; Sect →
Fame row.

**API.** `rankPowerParts` · `rankingsInfo(board)` · `rankOf(pid)` · `setRankVeil(on)` · `challengeRanked(pid)` ·
`noteRanksSeen` / `ranksNews` / `ranksNewsLast` / `noteRanksHint` · `rankStats` (QA).

**Data.** `npc-lives.js` → `NPC_RANK` (cadence, board sizes, rank power points, renown, fame, Might, visitor chances +
cooldowns, the answers' numbers, titles, class milestones, the bearing's pre-selects) + `NPC_RANK_TEXT`. Banter trigger
`rank_rise` (`{board}` `{place}`; 4 × 14 + 3 generic).

**Tests.** `checks/rankings.js` (53) · `npm run checks` 1683 ok · smoke `scenarios/rankings.js` (4 modes, zero console
errors) · `sim:quick` healthy: rankings cards ≈ 1.5 per open hour after tuning (challenger 0.73 · invite 0.48 · hunter
0.24 · hunter-after-kin 0.04); the first pass (0.06 / 0.05 / 0.06) added 2.35 an hour. Visual Review Gate cycle 1 7.7 FAIL
(the veil button overflowed on Desktop) → cycle 2 **8.0 PASS**.

**Gotchas / for QA.**
- Total road cards ≈ 8 per open hour with the rival + rankings: watch the queue in the final QA pass.
- The sim bot answers by its bearing; `bold` / `ruthless` accepts every invitation (it sect-hops). Teach it in QA.
- `_rankHunter` mints with the publication's seeded rng; a check that calls it directly passes Math.random.
- The spec's ad-hoc power formulas (5B, 17D, 28I) still use their own math; `Persons.powerScore` is unchanged.

## 4.11 as built (2026-10-04): the perf pass

**Measured first** (`node scripts/sim/probe-world-perf.js 400 120`, a matured world: ~1,000 in the registry, ~230 living,
149 heavy, slot ~580 KB; Node, desktop): a heavy season 0.94 ms mean / 1.42 p95 / 2.1 max (budget ≤ 2 ms: met at p95) · the
light step 3.1 ms per year (4.8 max) · world sects 0.35 · repute 0.16 · rankings publication 1.06 · syncPersons 0.2 · the save
`JSON.stringify` 3.3 ms (5.6 max; budget ≤ 15 ms: met) · the UI reads (People 0.9 ms, Rankings 0.14 ms).
In the real app (`scripts/smoke/scenarios/perf-yearturn.js`, Desktop, a late founder save, 300 matured years) the frame that
turned a game year took **9–11 ms mean, 17–18 ms p95, 21.5 ms max** with World → Rankings / People open: every yearly job
ran in one `tick()` and fired 1.4–2 full UI re-renders.

**Changed (no gameplay change; same order, same results):**
- The year turn is a **job queue** (`_queueYear` / `_drainYear`): family, arena, branches, world sects, the light step,
  repute, rival, rankings, sync + the gate roll — and that turn's heavy season after them. A real frame (dt < 1 s) spends
  about `YEAR_FRAME_MS` (4 ms, lifespan.js) on it and the rest wait for the next frames; a tick of ≥ 1 s (the sim's dt 1,
  the checks, a stalled frame) drains everything at once, so sims and checks are unchanged.
- The jobs' full re-renders collapse into **one** `_notify()` when the queue empties (`_yearBatch` / `_yearDirty`).
- `flushYear()` runs anything left before every save (`_save`) and when a life ended mid-turn (tick, interlude).
- Not saved: closing mid-turn loses at most a few frames' jobs; the lives (≤ 5 years) and the rankings catch up next turn.

**After:** the worst frame of a year turn is **7–9 ms mean, ~10 ms p95, 11.6 ms max** (Rankings / People open), inside
the 16.7 ms frame. `npm run checks` 1683 ok; `sim:quick` healthy.

**Catch-up caps (already in place, verified):** the light step catches up ≤ 5 years (`_tickWorldLives`), the heavy tier
`NPC_HEAVY.catchUpSeasons`; the world is frozen while closed (no offline sim at all).
**Not changed, for the user:** the generation jump between lives (`_worldYears`, quiet) costs ~6.5 ms per skipped year
(20 years 133 ms, 40 years 277 ms, 80 years 508 ms) in one call when you choose the next life: a one-off pause at that
click. Capping or thinning the jumped years would change what the world lives through between lives (a balance call).
**Heavy season:** p95 is in budget; the max (2.1 ms) sits on it. The fixed cost is the per-season scan of the whole
registry (`Object.values(w.persons).filter(_heavyEligible)`); keeping a heavy list between tier assignments is the next
lever if the registry grows.
