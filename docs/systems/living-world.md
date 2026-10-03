# Living World (Phase 28) — Reference
_Covers (planned): renderer/engine/game-state.js (world persons, sim, encounters, rival) · renderer/engine/persons.js ·
assets/data/world-population.js (new) · assets/data/npc-lives.js (new: lifespans, goals, encounter + memory tables) ·
renderer/game/world-people.js (new: World → People + the person card) · renderer/game/encounter-view.js (new) ·
scripts/sim/checks/living-world.js (new) · renderer/game/chronicle-view.js (4.6) · Phase: 28 (M4 tasks 4.1–4.7, 4.9–4.11, 4.10b) · Updated: 2026-10-03_

**Status: 4.2 + 4.3 + 4.6 built (2026-10-03).** Spec reviewed and approved by the user on 2026-10-03 (§13). 4.2 = the one
registry + the person card (see "4.2 as built"). 4.3 = the light world sim: lives, deaths, the pre-existing world, your
class and World → Class (see "4.3 as built"). 4.6 = the replacement controller + the merged World → Chronicle (see
"4.6 as built"). Next: 4.4 + 4.5 heavy AI + tiers.
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
