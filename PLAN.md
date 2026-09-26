# Cultivator Idle — Feature Roadmap

**→ Always check START_HERE.md first for current build state and last session summary.**

## Design pillars (decided 2026-09-25, full text in GAMEDESIGN.md)

This is a single-player game made for the love of the game, not a live-service cash grab. Every phase below must fit:

1. **A mortal life is a run of ~20–40h of open play** (was 10–20h; widened 2026-09-26 when old age was removed).
   Long play belongs to the Immortal era.
2. **Death is part of the fun.** A save slot is a **world** with your clan in it. Death hands the clan to an heir
   (an NPC); you're reborn a generation later as a descendant — or an orphan (clan-succession.md, 2026-09-26).
3. **Meta progression across generations**, mostly unlocks rather than multipliers. Later lives replay the early
   realms faster.
4. **Never punish absence.** No real-calendar/time-of-day bonuses, no daily logins, no windows you can miss
   while the game is closed. Use **standing orders** instead. Notifications are opt-in.
5. **Two clocks.** Idle jobs use wall-clock timers. **Age and world history use game time**, which only passes
   while the game is open (Phase 30). Age never kills (2026-09-26).
6. **No store logic.** No premium currencies, no leaderboards, no online requirement.
7. **Systems talk to each other** (user, 2026-09-26). Every mechanic has state that changes over time, choices
   whose outcomes depend on who you are (personality, stage, karma, relationships), and consequences that spill
   into other systems — including dramatic failure. Specs must include the Design Depth Pass (CLAUDE.md).

When an older design section below conflicts with these, the pillars win. The sections carry
"**Changed 2026-09-25 (pillars)**" notes where they were converted.

## How this plan is organized (read once)

- **Phase numbers are stable IDs, not build order.** Code comments, `docs/systems/*.md`, save-migration methods
  (`_ensurePhase23Fields`…) and git history all cite them ("Phase 5C", "23A"), so they are never renumbered.
- **Build order is the Development Roadmap below.** Work goes by milestone (M1 → M8). Inside a milestone, tasks are
  listed in dependency order, and each task is sized to be one agent session / one commit.
- **Milestone and task numbers are NOT stable.** They were renumbered 2026-09-25 (session 12) when the Life Loop
  became M2. START_HERE history entries before that date use the old numbers (old M2 = new M3, …, old M7 = new M8).
  Cite phase numbers in code and docs, never task numbers.
- **The design sections after the roadmap are grouped by milestone in the same order.** Built phases are in the
  M0 archive.
- **New ideas** get a new phase number (next free: **33**) and are then *placed* into a milestone. A slot is never
  renumbered.

**Definition of done (every task, from CLAUDE.md):**
- the system doc is written *before* code (Rule 6)
- `npm test` + `npm run sim:quick` pass
- balance-affecting work runs `npm run sim` before/after
- the sim bot is taught the new system
- `npm run dist` + `npm run build:web` pass
- START_HERE.md, this plan and the system doc are updated

---

## Phase Index

| Phase | Name | Status | Milestone |
|---|---|---|---|
| 1 | Core idle loop (Qi, stages, techniques, events, slots, renderer) | ✅ | M0 |
| 2 | Explore / Combat / Resources / Crafting | ✅ | M0 |
| 3 | Breakthrough Integrity + Spiritual Beasts | ✅ | M0 |
| 4 | Sect System — join existing | ✅ | M0 |
| 5 | Own Sect (5A) + Sect Wars (5B) + Member Wars (5C) | ✅ | M0 |
| — | Tooling: QA Sim Harness, Dev presets | ✅ | M0 |
| 23A–C | Health & Death, Bloodline Quality, Ascension Trial | ✅ | M0 (section lives in M7) |
| 29 | Character Personality & Banter | ✅ (29A/B/D; 29C later) | M1 |
| 20C | Settings tab + accessibility | ✅ | M1 |
| 9A–B | Tray + opt-in desktop notifications | ✅ | M1 |
| 21 | Backpack & Inventory tab | ✅ | M1 |
| 22 | Active / Idle toggle + automation | ✅ | M1 |
| 32 | War Standing Orders (absence never punished) | ✅ | M1 |
| 6E | Window & layout modes | ⬜ | M1 (optional) |
| 30 | Lifespan & Game Time (寿元 · 岁月) | ◐ (game clock + lifespan, Final Seclusion/Pass the Mantle — task 2.3; pacing compression — task 2.4) | M2 |
| 31 | Ancestral Hall & Clan Legacies (祖祠) — meta progression; absorbs 8 and 18B | ⬜ | M2 |
| 16 (lite) | Marriage & children, lite version (spouse/child as person records) | ⬜ | M2 |
| 18C | Heir selection at death | ⬜ | M2 |
| 8 | Ascension & Reincarnation (New Game+) | ↪ superseded by 23 + 31 (Dao Seeds cut) | M2 |
| 12 | Birth Origin | ⬜ | M3 |
| 13 | Alignment & Karmic Path | ⬜ | M3 |
| 14 | Body Constitution & Tempering (supersedes 7B) | ⬜ | M3 |
| 7A, 7C | Dao Paths, Heavenly Tribulation | ⬜ | M3 |
| 28 | Persistent Living World (supersedes 15 and 11A) | ⬜ | M4 |
| 15 | NPC World Simulation | ↪ superseded by 28 (kept as design input) | M4 |
| 27 | Deep Sect Management | ⬜ | M5 |
| 16 (full) | Courtship & family with living-world persons | ⬜ | M6 |
| 18A, 18D–E | Lineage tree view, Family Technique, Ancestral Visions | ⬜ | M6 |
| 23D | Immortal Realms | ⬜ | M7 |
| 24 | Immortal Paths (Tyrant / Devourer / Deity / Executioner) | ⬜ | M7 |
| 26 | Immortal Island + ascension petitions | ⬜ | M7 |
| 25 | Doctrine | ⬜ | M7 |
| 23E | Secret Arts | ⬜ | M7 |
| 19 | World Epochs & Spiritual Tides (game time, change between generations) | ⬜ | M8 |
| 17 | Secret Realm Dungeons | ⬜ | M8 |
| 6A–D | Animation & visual overhaul | ⬜ | M8 |
| 10 | Cosmetics (titles, pet, cave) | ⬜ | M8 |
| 11B–C | Heaven's Will, Scripture Lore | ⬜ | M8 |
| 20A–B | Permadeath, Challenge modes | ⬜ | M8 |
| 9C–D | Day/night + seasons, **cosmetic ambience only** (no bonuses) | ⬜ | M8 |

---

## Development Roadmap

**Why this order (revised 2026-09-25, session 12):**
- **M1** is independent, low-risk and improves play today. It now also removes the one existing "punish absence"
  mechanic: war call windows (Phase 32).
- **M2 (the Life Loop) is the heart of the game** and is built next: lifespan, heirs, the Ancestral Hall and
  pacing compressed to ~10–20h lives. It also fixes the post-Ascension dead zone. A successful Ascension becomes
  an "Ascended Ancestor" ending, and play continues with the heir until M7 makes the Immortal playable.
- **M3** adds the character rolls (origin, alignment, constitution, Dao). Every new generation rolls them again,
  which gives each life a distinct start. They're built as shared generators so **M4** can reuse them for NPCs.
- **M4's persons are the foundation for everything after it:** sect disciples (M5), real spouses and children in
  the world (M6), and the beings an Immortal blesses, enslaves or devours (M7).
- **M2's spouse and child are minimal person records** using the same schema M4 extends. They are *upgraded* in
  M6, not rebuilt. This is the lesson from the Phase 27 reorder: don't build persons twice.
- **M8** is flavor that gets richer the more systems exist.

### M1 — Quality of life & charm (no dependencies)

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 1.1 ✅ | Settings tab shell (⚙) + accessibility options | 20C | — | Settings persist per slot; later tasks add their toggles here |
| 1.2 ✅ | Banter engine + 12 personalities, speech bubble, banter log, frequency setting | 29 | 1.1 | Every personality × trigger has lines (sim invariant); bubble fits 300 px + iOS |
| 1.3 ✅ | System tray + **opt-in** desktop notifications (per-type toggles in ⚙; BT ready, expedition back, war news, death) | 9A–B | 1.1 | Both platforms: Electron real, iOS shim no-op (Rule 7). Nothing in the game *requires* notifications |
| 1.4 ✅ | War Standing Orders: calls are answered by a preset order, and being present only adds optional choices | 32 | — | Sim: afk/casual war outcomes within ~10% of active; the "missed war window" flags are retired |
| 1.5 ✅ | Backpack tab + item `category` field | 21 | — | All items visible with filters; stones delta indicator |
| 1.6 ✅ | Active / Idle toggle + staged automation unlocks | 22 | 1.1 | Bot uses automation; sim shows afk/casual actions/h up |
| 1.7 | *(optional)* Window & layout modes | 6E | 1.1 | 4 modes CSS-only off `data-layout` |

> The old optional task "Immortal ladder filled by Qi (23D-lite)" was cut. The M2 Ascended-Ancestor ending
> (task 2.7) fixes the dead zone in a way that fits the pillars.

### M2 — The Life Loop (lifespan, heirs, meta progression)

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 2.1 | `docs/systems/life-loop.md`: game clock, lifespan table, heir flow, Ancestral Hall unlocks, pacing targets. **Review with the user before code** | 30, 31 | — | User signs off on lifespan numbers + the legacy list |
| 2.2 ✅ | **Shared generators + `powerScore()` + minimal person record** (the schema 28A later extends): root, personality, name, stage, age | 28A/28J prep | 2.1 | Player creation uses them; sim numbers unchanged |
| 2.3 ✅ | Game clock + **lifespan (寿元)**: age passes only while open, per-realm lifespan, old-age warning (seclusion scene), death by old age | 30 | 2.2 | Sim metrics: life length, deaths by cause; age never advances in offline catch-up (invariant) |
| 2.4 ✅ | **Pacing compression**: retune the realm caps/costs so a casual mortal life is 10–20h. Rewrite `PACING_TARGETS_MIN` | 30 | 2.3 | `npm run sim`: casual life median within 10–20h, active ≥ ~5h, afk not trivial (check offline Qi vs no aging) |
| 2.5 ✅ | **Marriage & children (lite)**: a proposal choice event from Foundation Building, spouse = person record, children born in game years, partner term in bloodline growth | 16 lite, 23 family hooks | 2.3 | Children exist before the typical death; family `carry 1.0` path works in sim |
| 2.6 | **Clan succession** — REDESIGNED 2026-09-26 by the user, see `docs/systems/clan-succession.md`: you don't play as your heir; the heir (NPC) rules, the world sims their reign, you're reborn as a descendant (or an orphan). Split into 2.6a–f below | 16, 18C, 31 | 2.5 | see 2.6a–f |
| 2.6a ✅ | World vs life save split (`s.world`: clans, persons, world clock), orphan-capable life | — | 2.5 | old saves migrate; save round-trip holds |
| 2.6b ✅ | Family planning (None/Some/Many), children cultivate, child bond + child events, morality field | 16 | 2.6a | children reach stages in sim |
| 2.6c ✅ | Choose heir / Tournament of Heirs (you pick matchups; lethal to Top 4), heir-strength Bloodline term, sect to head | 18C | 2.6b | tournament paths verified |
| 2.6d | Heir parenting styles, reign sim + chronicle, rebirth position (eldest / younger / branch), heir bet, orphan option | 18C | 2.6c | 500h sim spans ≥3 generations |
| 2.6e | Challenge the head (head decides lethality), challenges when you're head, step-down mass tournament | — | 2.6d | all paths reachable in sim |
| 2.6f | Branch wars, secession → new clan, clan relations (rival/ally) | — | 2.6e | seceded clan persists in the world |
| 2.7 | **Ancestral Hall + Clan Legacies**: family tree view, Ancestral Merit earned per life, unlocks (heirlooms, family manual, clan legacies), **ancestral catch-up** (realms below the family best go faster). **Ascended Ancestor** ending for a successful Ascension. Cuts Phase 8's Dao Seeds | 31, 8, 18B | 2.6 | Gen 2+ reaches the family best faster; the sim's post-Ascension dead zone is gone; bot spends Merit |
| 2.8 | Tuning pass: generations to first Ascension ~3–5, meta progression feels meaningful, Merit sinks | 30, 31 | 2.7 | `npm run sim` 500h+ horizon: first Ascension ≈ 40–80h casual |

### M3 — Character foundation (the rolls every generation and NPCs reuse)

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 3.1 | Birth Origin: regions, family types, special constitutions. An heir's origin comes from the clan | 12 | 2.2, 2.6 | Regions become the world map for M4 |
| 3.2 | Alignment meter, tiers, shift sources, gating table | 13 | 2.2 | Choice events shift alignment; gates enforced |
| 3.3 | Body Constitution & tempering | 14 | 3.1 | Parallel track, one tempering at a time |
| 3.4 | Dao Paths | 7A | 3.2 | Path chosen at Foundation Building |
| 3.5 | Heavenly Tribulation (+ wire it as a 23A health-damage source) | 7C | — | Tribulation animation passes Asset Pipeline; bot faces it |

### M4 — The Living World (foundation for M5–M7)

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 4.1 | `docs/systems/living-world.md` + data files (names, personalities, population targets) | 28 | M3 | Doc reviewed with user before code |
| 4.2 | Extend the 2.2 person record + world store + **per-slot world save file** (IPC on both platforms) + migration of 5A disciples / `SECTS` / rival pools / M2 spouses & children | 28A, 28G | 4.1 | Old saves load with a generated world; save ≤ budget |
| 4.3 | Light sim step (aging on game time, progress, lifespan death, NPC Ascension) + **starting cohort** + pre-existing population | 28B–C, 28H | 4.2 | Cohort grows alongside the player in sim |
| 4.4 | Heavy sim: utility AI, activities, NPC sects rise/split/war (15B logic) | 28D | 4.3 | NPC sects form without the player |
| 4.5 | Tier promotion/demotion, **familiarity, known-first casting, new-name throttle** | 28B | 4.4 | Distinct-names-per-open-hour metric within target |
| 4.6 | **Replacement controller** (births, awakening waves, wanderers, hidden masters, succession) + Chronicle | 28H | 4.3 | Band populations flat over 500h sim, no extinction/explosion |
| 4.7 | World tab: person inspector, Known People (★ pins), Chronicle, clickable names in the log | 28F | 4.2 | Fits 300 px overlay + iOS |
| 4.8 | **Heavenly Rankings** (in-world, not an online leaderboard): Heaven Ranking + Rising Dragon (young cultivators, by game-time age) + **Your Class board**, published each game year | 28J | 4.3, 2.2 | Player row always visible; Class board keeps fallen/ascended; your heirs appear on it |
| 4.9 | **Encounters** on expeditions + sect missions, stance setting, choice cards | 28I | 4.4, 4.5 | Bot has a stance; encounters/h by type in report |
| 4.10 | Memory & reputation + 15C direct interactions (gift, duel, mentor, recruit…). Grudges and debts can pass to heirs | 28E, 15C | 4.9 | Memories change NPC behavior toward the player |
| 4.11 | Perf pass: Heavy tick ≤ 2 ms, batched Light step, capped offline catch-up | 28B | all M4 | Sim perf section within budget on desktop; spot-check iOS build |

### M5 — Deep Sect Management

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 5.1 | Offices + personality fit | 27A | M4 | Bot appoints offices |
| 5.2 | Recruiter + Recruitment Policy filters | 27B | 5.1 | Candidates match policy; strictness trades volume for quality |
| 5.3 | Manual recruitment methods + **Sect Tier** candidate-quality table | 27C | 5.2 | Tier visibly changes candidate mix |
| 5.4 | Disciple lifecycle: loyalty, ranks, defection, sect policies, tournaments (cohort encounters). **Clan sect succession**: your heir inherits the sect | 27D, 31 | 5.3 | Defections/succession appear in Chronicle |
| 5.5 | Sect-war upgrade: wars against real NPC sects with named champions (replaces rival name pools). Standing orders still apply | 5B/5C + 28D + 32 | 5.4 | Old war invariants still hold |

### M6 — Family depth (upgrades M2's lite family to living-world persons)

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 6.1 | Courtship with living-world persons (relationship, proposals, rejection), with the spouse as a full person | 16A–B | M4, 2.5 | M2 lite marriages migrate cleanly |
| 6.2 | Children as world persons: they grow, cultivate, join sects, and can become rivals or allies. Adopted heirs, sworn siblings | 16C | 6.1 | Heirs have a history when you take them over |
| 6.3 | Family Technique + Ancestral Visions | 18D–E | 2.7 | — |
| 6.4 | Cross-slot **Hall of the Fallen** (tombstones of lines that ended) | 18A, 20A | 2.7 | IPC on both platforms (Rule 7) |

### M7 — The Immortal Era (where long play belongs)

| # | Task | Phase | Needs | Done when |
|---|---|---|---|---|
| 7.1 | Immortal realm ladder + sprites (Asset Pipeline) + ascended-NPC population you meet again. An Ascended Ancestor (2.7) becomes playable; resolve Phase 23 open Q2 (how the mortal line continues beside it) first | 23D, 28C | M4, 2.7 | Immortal era pacing in sim; the mortal line still works |
| 7.2 | Immortal Essence, **Path Mastery + Point of No Return**, Fall / Redemption | 24A | 7.1, 3.2 | Lock at mastery 60 with warning at 45 |
| 7.3 | Devourer (impurity, corruption, heart-demon rampage) | 24C | 7.2 | Per-path bot policy |
| 7.4 | Celestial Deity (believers, faith, blessings, returns, saints, prayers) | 24D | 7.2 | — |
| 7.5 | Tyrant (capture, fear/resentment, assignments, revolts, crusades) | 24B | 7.2 | — |
| 7.6 | Heaven's Executioner (bounty board, investigate, merit) | 24E | 7.3 | — |
| 7.7 | Immortal Island: tiers, plot grid, core ~10 buildings | 26A–B | 7.2 | — |
| 7.8 | Island residents, offices at scale, Lower Sect link, **ascension petitions** (including your own descendants) | 26C, 26E–F | 7.7, M5 | Ascending disciples petition |
| 7.9 | Remaining ~20 buildings + island wars / crusades / rival deities | 26B, 26D | 7.8 | — |
| 7.10 | Doctrine: tenets, spread, schisms, scriptures | 25 | 7.8 | — |
| 7.11 | Secret Arts (boss stand-in first; family library passes Arts to heirs) | 23E | 2.7 | — |
| 7.12 | Immortal Ranking (仙榜) | 28J | 7.1 | — |

### M8 — World flavor & polish

| # | Task | Phase | Needs |
|---|---|---|---|
| 8.1 | World Epochs & Spiritual Tides on **game time**. An epoch shifts between generations ("the age your heir is born into") | 19 | M4, 2.3 |
| 8.2 | Secret Realm Dungeons (+ NPC parties as encounters) | 17 | 4.9 |
| 8.3 | Animation & visual overhaul | 6A–D | — |
| 8.4 | Cosmetics: titles, spirit pet, cultivation cave | 10 | — |
| 8.5 | Heaven's Will, Scripture Lore | 11B–C | — |
| 8.6 | Permadeath + challenge modes (per clan, chosen at founding) | 20A–B | 2.7 |
| 8.7 | Day/night + seasonal **canvas ambience** from the game clock or local time: cosmetic only, no bonuses | 9C–D | 8.3 |

---

# M0 — Built (archive)

> Finished phases, kept for reference. Their live docs are in `docs/systems/`. 23A–C are also built; see the Phase 23 section under M7.

---

## Phase 2 — Explore, Combat, Resources & Crafting

### 2A — Expedition System

The cultivator sends expeditions to locations while continuing to meditate.
Expeditions run in real-time and return with resources.

**Locations** (unlock by cultivation stageIndex):
| Location | minStage | Duration | Enemy Tier | Primary Drops |
|----------|----------|----------|------------|---------------|
| Mortal Forest (凡人森林) | 0 | 60s | Beast rank 1 | Spirit Herbs, Beast Cores |
| Spirit Stone Quarry (灵石矿场) | 3 | 90s | Puppet rank 1 | Spirit Stones, Iron Ore |
| Demon Marsh (妖魔沼泽) | 6 | 120s | Demon rank 2 | Demon Essence, Poison Herbs |
| Ancient Ruins (古代遗迹) | 10 | 180s | Undead rank 3 | Artifact Fragments, Ancient Scripts |
| Heavenly Peak (天峰) | 15 | 300s | Immortal rank 4 | Celestial Herbs, Heavenly Ore |
| Void Rift (虚空裂缝) | 19 | 600s | Void rank 5 | Void Crystals, Chaos Essence |

**New files:**
- `assets/data/items.js` — `ITEMS` map: all item types, stackable flag, display info
- `assets/data/locations.js` — `LOCATIONS` array with dropTables
- `assets/data/enemies.js` — `ENEMIES` array with rank/hp/drops/asciiArt

**State additions:**
```js
expedition: { active: false, locationId: null, endsAt: null },
inventory: {},   // itemId → quantity
```

**UI:** New tab "Explore" — shows unlocked locations, active expedition timer, log of last return

### 2B — Crafting System

New tab "Craft" with sub-tabs: Pills · Elixirs · Weapons · Artifacts.

**Pills** (consumed on breakthrough attempt — stackable in inventory):
| Pill | Recipe | Effect |
|------|--------|--------|
| Qi Refining Pill (聚气丹) | 2× Spirit Herb | +10% BT chance (1 use) |
| Foundation Pill (筑基丹) | 5× Spirit Herb + 1× Beast Core | +20% BT chance |
| Heart Calming Pill (定心丹) | 3× Spirit Herb + 1× Demon Essence | -50% Qi lost on failure |
| Golden Core Pill (金丹) | 10× Celestial Herb + 2× Heavenly Ore | +30% BT, -80% Qi loss |
| Heaven Defying Pill (逆天丹) | 20× Void Crystal + 5× Chaos Essence | BT always succeeds |

**Elixirs** (spiritual root reroll — consumed immediately):
| Elixir | Recipe | Root outcome |
|--------|--------|--------------|
| Muddy Root Elixir (浊根液) | 3× Spirit Herb | Mixed guaranteed |
| Cleansing Root Elixir (洗筋液) | 5× Spirit Herb + 2× Beast Core | 50% Dual, 50% Mixed |
| Pure Root Elixir (纯根丹) | 10× Celestial Herb + 3× Void Crystal | 60% Pure, 35% Dual, 5% Heavenly |
| Heavenly Root Elixir (天根丹) | 20× Chaos Essence + 5× Ancient Script | 40% Pure, 40% Heavenly, 20% Dual |

**Weapons** (equip slot — passive):
| Weapon | Recipe | Bonus |
|--------|--------|-------|
| Spirit Sword (灵剑) | 3× Iron Ore | +15% Qi/s |
| Soul Spear (魂枪) | 5× Iron Ore + 2× Beast Core | +25% expedition power |
| Thunder Staff (雷杖) | 3× Heavenly Ore | Enemies -20% HP |
| Void Blade (虚刃) | 5× Heavenly Ore + 3× Void Crystal | +50% loot, +20% BT |

**Artifacts** (equip slot — passive):
| Artifact | Recipe | Bonus |
|----------|--------|-------|
| Jade Pendant (玉佩) | 2× Spirit Herb + 1× Iron Ore | Qi cap ×1.2 |
| Soul Ring (魂环) | 3× Beast Core + 2× Iron Ore | Qi/s ×1.3 |
| Heaven Talisman (天符) | 5× Ancient Script | BT chance +8% permanent |
| Void Compass (虚空罗盘) | 3× Void Crystal | Unlocks hidden locations |

**New files:** `assets/data/recipes.js`, `renderer/game/crafting.js`
**State additions:** `equipped: { weapon: null, artifact: null }`, `pills: {}` (inventory of usable pills)

### 2 — Implementation order
1. `assets/data/items.js`
2. `assets/data/locations.js` + `assets/data/enemies.js`
3. `assets/data/recipes.js`
4. Add `expedition` + `inventory` + `equipped` + `pills` to `game-state.js` `_newGame()`
5. `renderer/game/expedition.js`
6. `renderer/game/crafting.js`
7. Add Explore + Craft tabs to `renderer/index.html` + `styles.css`
8. Wire everything in `renderer/game.js`
9. Update START_HERE.md + PLAN.md phase status + rebuild

---

## Phase 3 — Breakthrough Integrity & Spiritual Beasts

### 3A — Realm Integrity

Add a second bar: **Realm Integrity (0–100)**, starts at 100.

- Failed breakthrough: −20 Integrity (on top of −50% Qi)
- Integrity = 0: **Realm Demotion** (stageIndex −1), Integrity resets to 60
- Passive regeneration: +1 Integrity per 30s (very slow — recovery takes time)
- Heart Calming Pill restores +30 Integrity; Heaven Defying Pill bypasses Integrity check
- UI: indigo→red bar below Qi bar; shake animation on demotion

**State additions:** `realmIntegrity: 100`

### 3B — Spiritual Beasts

Tameable creatures encountered during expeditions.

- Encounter chance per expedition: scales with location tier
- Taming requires: Beast Taming Talisman (crafted) + sufficient stageIndex
- Max 3 active beasts
- Each beast has 3 random traits from pool: Swift, Iron Skin, Spirit Nose, Heavenly Instinct, Qi Devour, Soul Bond
- Beast XP gained per expedition → level up every 100 XP (max 10) → +10% per trait per level
- Send beasts on solo expeditions while cultivator meditates

**New files:** `assets/data/beasts.js`, `renderer/game/beasts.js`
All beast sprites must pass the Asset Pipeline (≥8.0).

---

## Phase 4 — Sect System (Join Existing) ✅

> **Status: implemented 2026-09-25.** See `docs/systems/sects.md`. Divergences: Myriad Herb Hall "Crafting ×2" is a 35% double-output chance; Azure Sword weapon buff = ×1.15 Qi/s with a weapon equipped; Heaven Defying artifact bonus = ×1.2 Qi/s with an artifact equipped. Missions run max 2 at once; ranks unlock missions and raise reward multipliers; rank-up is a manual button; donate 10 Stones = 5 Contribution; leaving forfeits rank/contribution (−5 karma).

**Available sects:**
| Sect | minStage | Specialty |
|------|----------|-----------|
| Azure Sword Sect (碧剑宗) | 3 | Weapon buffs, BT chance |
| Myriad Herb Hall (万草堂) | 2 | Crafting ×2, herb drops |
| Thunder Palace (雷宫) | 6 | Qi/s +40%, expedition power |
| Void Moon Pavilion (虚月阁) | 10 | Hidden locations, Integrity regen |
| Heaven Defying Sect (逆天门) | 15 | BT floor 50%, artifact bonus |

**Sect ranks:** Outer Disciple → Inner Disciple → Core Disciple → Elder → Peak Elder → Grand Elder
Rank up via Sect Contribution Points earned through missions and donations.

**Sect missions** (real-time, auto-complete):
| Mission | Duration | Reward |
|---------|----------|--------|
| Herb Gathering | 5 min | Herbs + Contribution |
| Patrol | 10 min | Stones + Contribution |
| Escort | 20 min | Contribution + Beast XP |
| Subdue Demon | 30 min | Demon Essence + large Contribution |
| Retrieve Artifact | 60 min | Fragment + large Contribution |

**New files:** `assets/data/sects.js`, `renderer/game/sect.js`
**State additions:** `sect: { id: null, rank: 0, contribution: 0, activeMissions: [] }`

---

## Phase 5 — Build Your Own Sect + Sect Wars

### 5A — Found a Sect ✅

> **Status: implemented 2026-09-25.** See `docs/systems/own-sect.md`. Divergences: crafting is instant, so Pill Hall = +40% double-output chance instead of "craft speed ×2"; Sect Hall is upgradeable Lv1–3 (100/250/500 stones, +5 cap each; Lv1 cap 5, max 20); recruiting picks from a refreshing 3-candidate pool (15×talent² stones, reroll 10); Spirit Beast Pen raises beast cap 3→5; Defensive Array's war defense is computed but unused until 5B. Founding requires not being in a Phase 4 sect. Fame (`derived.sectFame`) is computed for 5B scaling.
Unlocks at Nascent Soul (stageIndex ≥ 18). Cost: 500 Spirit Stones + 50 Void Crystals.

**Buildings:**
| Building | Cost | Bonus |
|----------|------|-------|
| Sect Hall (宗殿) | Required | +5 disciple cap, unlocks recruitment |
| Qi Library (气功馆) | 50 Stones | Disciples +20% Qi contribution |
| Pill Hall (炼丹殿) | 100 Stones + 20 Herbs | Craft speed ×2 |
| Spirit Beast Pen (灵兽栏) | 80 Stones | +2 beast slots |
| Training Ground (修炼场) | 60 Stones | Disciple levels +30% faster |
| Defensive Array (防御阵) | 200 Stones + 5 Void Crystals | War defense +40% |
| Treasury (宝库) | 150 Stones | Resource income +30% |

**Disciples:** recruit up to 20 NPCs with 1–5 star talent. Higher talent = more resources generated.

> **Planned expansion (2026-09-25):** Phase 27 (Deep Sect Management) deepens this: offices, a Recruiter with
> your requirements, manual recruitment methods, and sect-tier-scaled candidate quality. Phase 26 later scales
> it up into the Immortal Island.

### 5B — Sect Wars ✅

> **Status: implemented 2026-09-25.** See `docs/systems/sect-war.md`. Divergences: no NPC-sect
> simulation exists yet (Phase 15), so "enemy contribution loss" became a probabilistic
> win/loss roll (`playerPower / (playerPower+enemyPower)`, powers scaled from `sectFame` +
> `warDefense`/reinforcement/alliance bonuses) with resource spoils on win, a Spirit Stone
> penalty + temporary Defensive Array disable on loss; alliances are bought from the existing
> Phase 4 `SECTS` roster (one-war power bonus) rather than a full NPC relationship system.
Trigger every 2–6 hours (real time), scaled by sect fame.
Phases: Scouting (5 min) → Preparation (10 min) → Auto-resolve.
Win = spoils + enemy contribution loss. Lose = resource penalty + array damage.
Alliance system: ally with other sects for defensive help.

### 5C — Member Wars (sect wars for non-leaders) ✅

> **Status: implemented 2026-09-25.** See `docs/systems/sect-war.md` ("Member War Outcome"). Built as planned —
> one `sectWar` state with `side: 'own' | 'member'`, same Date.now()-chained phase machine, rank-scaled 4–10h interval.
> Divergences / decisions: the member war window is **2h** (30m Call to Arms + 90m Muster) instead of 15 min, which
> is the fix for the sim's "wars resolve unseen" flag (casual now answers 100% of member calls; own-sect wars keep
> 15 min). Commitments: answer (free — no mission-slot cost, changed 2026-09-25 per user feedback that it was
> unwelcome friction), war chest (stones, capped per rank, also earns contribution), up to 3 pills, one beast
> (`beast.expedition = { war: true }`, returns with XP).
> Contribution penalties are flat × rank multiplier, not %, since contribution keeps growing past max rank.
> A war that starts *and* ends while the game is closed is "unseen": no reward, no ignore penalty — afk players
> aren't punished for calls they could never see (`tickSectWar(live=false)` in offline catch-up). Sect tier = its
> position in `SECTS` (scales enemy stars + spoils). No rare-item table of its own: demon essence / artifact fragment.
> Sim: bot answers/lends/donates; report gained a Member Wars section + 4 invariants. Afk still answers only
> ~15–25% of calls (opens 15 min per 8h) — needs Phase 9 notifications, not a longer window.

> **Requested 2026-09-25.** Today wars only exist once you *found* a sect (`tickSectWar()` early-returns
> unless `ownSect.founded`). Sects you merely *join* should also go to war, pulling you in as a member.

- **Trigger:** while `sect.id` is set, the joined sect periodically goes to war with a rival (reuse
  `RIVAL_SECT_*` pools, or another `SECTS` entry for flavor). Interval scales by sect rank, not fame
  (suggested 4–10h; lower ranks get called less often).
- **Same phase machine:** scouting → preparing → auto-resolve, reusing the Date.now()-chained 5B pattern so
  offline catch-up keeps working. Generalise `sectWar` state with a `side: 'own' | 'member'` field rather than
  duplicating it (keep `_ensurePhase5BFields` migration safe).
- **Member actions during a war (the "pulled in" feel):** answer the call (free — commits nothing else), donate
  stones/pills to the war chest, or send a beast. Each adds to sect power. Ignoring the call is allowed but costs
  contribution/karma.
- **Outcome:** sect power = f(sect tier, your rank, your commitments) vs rival. Win → contribution + rank-scaled
  spoils (maybe a rare item). Loss → contribution loss, sect buff (`effects`) suppressed for a few hours.
  Never demotes rank on its own.
- **Leaving mid-war:** allowed, but a karma + contribution penalty ("deserter").
- **QA sim:** add member-war behaviour to `scripts/sim/bot.js` (member path), war metrics for `--path=member`
  (engaged %, W/L, contribution delta) — see `docs/systems/qa-sim.md` → Extending.
- Needs its own section in `docs/systems/sect-war.md` before code (Rule #6).

---

## Tooling — Dev Late-Game Test Characters ✅

> **Implemented 2026-09-25.** `npm start` only: empty charselect slots offer DEV presets (Sect Elder / Sect Founder /
> Pre-Ascension) built by `gameState.buildDevSave()` from `assets/data/dev-presets.js`. Gated by `window.electron.isDev()`
> (`!app.isPackaged`; always false on iOS). See `docs/systems/dev-presets.md`.

---

## Tooling — QA Sim Harness ✅

> **Implemented 2026-09-25.** `npm run sim` / `npm run sim:quick` — headless bots (active / casual / afk
> profiles, founder / member sect paths) play the real game logic at ~20+ game-hours per real second per core
> and write `scripts/sim/out/report.md`: pacing (time to each realm/milestone), fun signals (dead zones,
> difficulty walls, fail streaks, hoarding, actions/hour, qi-capped %, unused features), health (exceptions,
> invariants, save round-trips) and tick performance. See `docs/systems/qa-sim.md`.
> **First pacing pass 2026-09-25:** Foundation Building+ `qiCap`s retuned to the GAMEDESIGN.md table
> (casual player now reaches Ascension ~72h, was ~24h; active ~10h, was ~2h); random-event Qi losses made
> time-based (the old % losses capped Qi below the breakthrough threshold on long stages). Still open from
> the sim: late-game stone hoarding (no sinks), nothing to do after Ascension (Phases 7–8), afk players
> can't afford founding, casual/afk miss most war windows (Phase 9 notifications / 5C).
> **Economy pass 2026-09-25:** sim now keeps a Spirit Stone ledger (sources/sinks). Found disciples = ~90% of
> all income (~1,100/h) and war defeats (15% of bank) = ~80% of all outflow, so a two-speed economy with a wealth
> tax instead of choices. Fixed with numbers only: disciple stone/herb rates ÷7, war loss 8%, war ally/reinforce
> costs ×2–4 (the repeatable late sink), long sect missions pay stones (afk faucet), Celestial Orbit 150→600
> (kept Qi pacing on target), founding minStage 18→19 (void crystals drop at 19). Result: casual bank 31k→6k,
> active 47k→4k, war losses now a minority of outflow, afk founds a sect at ~132h (never before).
> Remaining flags are design gaps, not numbers: nothing after Ascension (Phases 7–8), casual/afk rarely see
> the 15-min war window (Phase 9 notifications / 5C), hence can't use the war sink and still bank ~6k/3.5k.
> Not yet: Playwright UI-level pass (would need a swappable clock seam in game.js); an LLM-driven policy
> tier for qualitative "does this feel good" feedback; wiring `sim:quick` into `npm run release` (blocked
> until the current health failure — see START_HERE — is fixed, or it would block every release).

---

# M1 — Quality of life & charm

> Roadmap tasks 1.1–1.7. The Phase 20 section also holds 20A–B (permadeath, challenge modes); those are built in M8 (task 8.6), and only 20C is M1. Phase 32 (War Standing Orders) follows Phase 22.

---

## Phase 29 — Character Personality & Banter (性格 · 碎碎念)

The player's cultivator gets a **random personality** at character creation, shown on charselect and the Stats
tab. The cultivator then **randomly says goofy, funny things in that personality's voice**, written in the
cheesy-web-novel-translation xianxia tone. The system is independent of everything else, cheap, and a big
charm win, which is why it's first in the build order.

> **Status: ✅ 29A/29B/29D implemented 2026-09-25 (roadmap 1.2).** See `docs/systems/banter.md` and
> `docs/systems/banter-writing-guide.md`. Divergences: **14 personalities**. At the user's request, added
> **Unhinged Psycho**, **Nonsense Gremlin** ("borgin and gorgin") and **Genuinely Nice Guy**, which replaces Naive
> Optimist. Swearing is in the voice by design, with a **Swearing: Uncut / F\*\*\*** setting next to banter frequency.
> 1,579 lines (~100 per personality + 66 generic), written by 4 parallel agents from the guide, then edited. The bubble
> is a fixed element above overlays (so reborn/Ascension lines show over them), and tapping dismisses it. 29C is not
> built: the ≤2% stat flavor was skipped (stays purely cosmetic), and dark/holy variants wait for Phases 13/24. Tokens
> `{rival}` and NPC names wait for Phase 28. `{enemy}` is the war's enemy sect.

### 29A — Personalities (launch set, ~12)

| Personality | Voice | Sample lines |
|---|---|---|
| Arrogant Young Master (傲慢少主) | Haughty, face-obsessed | "Hmph. This Qi is barely worthy of being absorbed by me." / "Who dares disturb this young master's meditation?! …Oh. A leaf." |
| Shameless Coward (厚颜胆小鬼) | Proud of running away | "A true genius knows when to flee. I am a true genius." / "Retreat is also a kind of Dao. My kind." |
| Hot-Blooded Idiot (热血笨蛋) | Loud, zero plan | "I WILL PUNCH THE HEAVENS! …After lunch." / "Tribulation lightning? Finally, a worthy opponent!" |
| Iron Rooster Miser (铁公鸡) | Money-obsessed | "Three spirit stones for ONE pill? Daylight robbery under the Nine Heavens!" |
| Bottomless Glutton (吃货) | Everything is food | "Is eating spirit beast meat technically cultivation? I'm counting it." |
| Melodramatic Poet (多愁诗人) | Tragic about nothing | "The wind weeps. The moon weeps. I, too, weep. My leg has fallen asleep." |
| Deadpan Stoic (面瘫) | Flat, understated | "Breakthrough successful. I feel nothing. Also, my eyebrows are on fire." |
| Self-Proclaimed Demon King (中二魔尊) | Grandiose, cringe | "Kneel, insects! …That was addressed to the ants. They did not kneel." |
| Paranoid Schemer (阴谋家) | Suspects everything | "That crane has watched me for three incense sticks. Spy. Definitely a spy." |
| Naive Optimist (天真) | Everything is lovely | "Heavenly lightning is just the sky saying hello!" |
| Grumpy Old Soul (倔老头) | Back-in-my-day | "In my day we cultivated uphill. Both ways. In the snow. Without roots." |
| Lazy Genius (懒散天才) | Minimum effort | "If I meditate lying down, it still counts. Heaven said so. Probably." |

### 29B — Banter engine

- **Idle chatter** fires at random every ~4–12 min (tuneable), and never while an overlay is open.
- **Contextual triggers:** breakthrough success/fail, BT streaks, loot/rare drop, expedition return, low health,
  war call and outcome, death/reincarnation, Ascension Trial, returning after being away ("You were gone 9 hours.
  I counted every one. …I did not count them."), time of day, and later Path acts (devour / bless / slave revolt).
- **Line pools:** personality × trigger. Templates take tokens: `{name}`, `{rival}`, `{sect}`, `{item}`,
  `{stage}`, `{hours}`, plus a named NPC from 28 once it exists.
  - A no-repeat buffer keeps the last ~20 lines from repeating.
  - A small **generic pool** is shared by all personalities as a fallback.
- **UI:**
  - An ASCII **speech bubble** above or beside the sprite fades after ~6 s.
  - A **Banter log** keeps the last ~50 lines on the Stats tab.
  - The bubble must work at the 300 px overlay width *and* full-screen iOS (Rule 7). No hover-only interaction.
- **Settings (Phase 20C):** banter frequency Off / Rare / Normal / Chatty.

### 29C — Personality over time

- **Mostly cosmetic by design.** Optional micro-flavor is allowed but capped at ≤ 2% on any stat, so no
  personality becomes "the correct pick".
- Alignment (13) and Path (24) unlock **dark/holy variants** of the same personality's lines. An Arrogant Young
  Master on the Devourer Path gets smug lines about "snacks".
- The same line engine is later reused for NPC banter in the World tab person inspector (28F).

### 29D — Content bar

- Launch: ≥ 25 idle lines per personality, ≥ 4 lines per personality per contextual trigger, plus a ~40-line
  generic pool.
- Lines follow `.agents/rules/game-design.md` flavor rules: xianxia-translation cadence, with the comedy in the
  contrast.
- The speech-bubble style / color token goes through the **Asset Pipeline** (UI color tokens are covered).
- State: `personality: { id }` and `banter: { lastAt, recent: [] }` in `_newGame()` + a new
  `_ensurePhase29Fields()` (old saves roll a random personality on load).
- New files: `assets/data/personalities.js`, `assets/data/banter-lines.js`, `renderer/game/banter.js`,
  `docs/systems/banter.md`.
- Sim: no balance impact. Add an invariant that every personality has lines for every trigger, so the pools
  can't ship with holes.

---

## Phase 20 — Optional Settings & Challenge Modes

All modes are selected at character creation per slot. They cannot be changed after the first tick.
The Settings tab (⚙ icon added to titlebar) also holds per-session accessibility options that
*can* be changed at any time.

### 20A — Permadeath (永恒逝世)

> Phase 23A adds normal-mode death (Health 0 → reincarnate). Permadeath differs only in that death ends the
> line with a tombstone instead of reincarnating.

When enabled:
- If Realm Integrity reaches 0 and a Realm Demotion would push the character below Qi Condensation L1
  (back to Mortal), the character is **permanently destroyed** instead of demoting
- The save slot is cleared
- A **Tombstone entry** is written to `tombstones.json` (persists forever):
  - Cultivator name, region of birth, highest stage reached, total hours played, death cause, epoch at death
- Tombstones are displayed on the character select screen in a "Fallen Cultivators" section below the 3 active slots
- Permadeath characters still contribute a full generation to Lineage (their tombstone = an ancestor record)

**Permadeath achievement (cross-slot, permanent):** If a permadeath character reaches 5 generations before
dying, all new characters on that install gain +5 starting Spirit Stones. Displayed as "Iron Bloodline" legacy.

### 20B — Challenge Modes (pick zero or one)

| Mode | Name | Restriction | Reward on Ascension |
|------|------|-------------|---------------------|
| Starved Root (枯根) | Root always Mixed; cannot reroll; BT chance cap 0.60 | Ancestral Merit ×1.5 for this life; "Starved Root Ascendant" title |
| Hermit Path (隐士道) | Cannot join any existing sect (can still found own); no NPC ally tier above Acquaintance | Hermit-exclusive techniques unlock; baseline Qi/s +20% |
| One With Heaven (天人合一) | Tribulations have +1 extra wave; BT failures deal −30 Integrity | "Heaven's Chosen" title; Ancestral Merit ×1.5 for this life (Dao Seeds cut, Phase 31) |
| Hungry Ghost (饿鬼道) | Qi cap is fixed at the mortal value for first 3 realms — techniques are the only cap expansion | Unique "Ghost Ascendant" title; breakthrough Qi cost refunded on success |

Challenge mode badge shown on the character select slot card next to the character name.

### 20C — Accessibility Options (changeable any time)

> **Status: ✅ implemented 2026-09-25 (roadmap 1.1).** See `docs/systems/settings.md`. Divergences: the ⚙ opens an
> overlay, not a 7th tab (keeps the tab row readable at 300 px). Added **Background opacity** (20–100% slider, user
> request). Settings live in `s.settings` and hold presentation prefs only. 20A/20B's `permadeath`/`challengeMode`
> should go in a separate `s.challenge` object when M7 builds them. Font size scales the tab panels only (`zoom`),
> not the whole window. Options are data-driven (`assets/data/settings.js`), so later tasks just append an entry.

| Option | Values | Default |
|--------|--------|---------|
| Number display | Raw / Formatted (K/M/B) / Scientific | Formatted |
| Animation speed | 0.5× / 1× / 2× | 1× (affects particle speed + sprite fps) |
| Color blind mode | Off / Deuteranopia / Protanopia | Off |
| Reduced motion | Off / On | Off (disables particles + aura rings; renders sprite only) |
| Font size | 11px / 13px / 15px | 13px |
| Canvas brightness | 70% / 100% / 130% | 100% |

**State additions:**
```js
settings: {
  permadeath: false,
  challengeMode: null,          // null | 'starved_root' | 'hermit' | 'one_with_heaven' | 'hungry_ghost'
  displayNumbers: 'formatted',
  animSpeed: 1,
  colorblind: 'off',
  reducedMotion: false,
  fontSize: 13,
  canvasBrightness: 1,
}
```

**New files:** `assets/data/challenge-modes.js`, `renderer/game/settings.js`

---

## Phase 9 — Desktop Integration

> **Status 2026-09-26 (task 1.3, overnight):** 9A/9B built. See `docs/systems/notifications.md` for
> the full reference. Divergences from the design text below:
> - Tray icon is one static glyph (jade/gold circle, self-reviewed 8.6/10 — full two-agent Asset
>   Pipeline judged overkill for a single tray glyph, per the task's own carve-out), **not**
>   per-stage icons — out of scope, noted as a possible future refinement.
> - "Realm Demotion (urgent)" notification was dropped per the 2026-09-25 pillars note below (never
>   punish absence); demotion isn't a notification type. "Sect War incoming (15 min warning)" became
>   "War news" using the *existing* `war_call`/`war_won`/`war_lost` onGameEvent emits (declared +
>   resolved, both sides) rather than a new pre-war timer — simpler, and matches "news, not a
>   summons" better than a countdown would.
> - Added "a life has ended" (death) as its own opt-in type, per the note below — it did **not**
>   need Phase 30 (game-time lifespan); it just reuses the existing Phase 23 death flow
>   (`_die()` now also emits `death` before resetting state).
> - Close button now defaults to **hide to tray** (own setting `closeAction`, tray/quit) rather than
>   always quitting — this was implied by "system tray" but made an explicit user-facing choice
>   since some players will still want ✕ to fully quit.
> - Per-type cooldowns + the "only while hidden/minimized/unfocused" gate live in a new
>   `renderer/game/notifications.js` (`NotificationSystem`), not in `main.js` — main.js only knows
>   *how* to show a native notification/tray, not *when*; the decision logic lives with the rest of
>   the DOM-free game systems (same split as `BanterSystem`) so the sim can load it too.

### 9A — System Tray
- App minimizes to system tray (not taskbar close)
- Tray icon updates with cultivation stage (mortal, qi condensation, foundation, etc.) — built as a
  live-updating **tooltip + menu label**, not a redrawn icon image (see status note above)
- Right-click menu: "Wei Longshan — Qi Condensation L3", "Open", "Quit"

### 9B — Desktop Notifications

> **Changed 2026-09-25 (pillars):** opt-in, with a per-type toggle in ⚙, and nothing in the game depends on them. War decisions use
> standing orders (Phase 32), so a war notification is news, not a summons. The "Realm Demotion (urgent — user
> should log in)" framing is dropped. Add "a life has ended" as a type (only possible while open, Phase 30).

Push notifications (Windows/Mac native) for:
- Breakthrough ready (Qi at 90%+ of cap)
- Expedition returned
- Sect War incoming (15 min warning) — built as war declared/resolved instead, see status note above
- ~~Realm Demotion occurred (urgent — user should log in)~~ — dropped, see status note above
- Beast tamed
- A life has ended (death) — added per the pillars note above, built this session

### 9C — Time-of-Day Bonuses

> **Changed 2026-09-25 (pillars):** **no bonuses.** Real clock bonuses reward checking in at set hours (pillar 4). 9C/9D survive only as
> cosmetic canvas ambience (night sky, dawn light, seasonal particles), driven by the game clock or local time,
> in M8 task 8.7. The tables below are kept only as mood references.

Real-world local time affects cultivation:
| Time | Effect |
|------|--------|
| Midnight–4am | Moonlight meditation: Qi/s ×1.3 |
| 4am–8am | Dawn enlightenment: BT chance +5% |
| Noon–2pm | Solar peak: Fire Dao Qi/s ×1.5 |
| Dusk 6–8pm | Evening reflection: Karma +1 |

### 9D — Seasonal Cultivation
Real calendar month affects passive bonuses:
- Spring (Mar–May): Herb drops ×1.5, wood/life cultivation +10%
- Summer (Jun–Aug): Fire expedition drops ×1.5, Qi/s ×1.1
- Autumn (Sep–Nov): Metal refinement ×1.5, weapon crafting cheaper
- Winter (Dec–Feb): Water cultivation +10%, meditation duration +50%

---

## Phase 21 — Backpack & Inventory Tab

> **Status: ✅ implemented 2026-09-26 (roadmap 1.5, overnight autonomous run).** See `docs/systems/backpack.md`
> for the full reference. Built essentially as designed below, with documented divergences:
> - **"Recently Acquired" sort was dropped**, per this section's own escape hatch ("otherwise drop it and
>   document"). It would need a new acquisition-order/timestamp map, and there's no single choke point for
>   inventory gains today — expedition drops, crafting output, sect mission rewards, war spoils and disciple
>   income each mutate `s.inventory` directly (at least 6 separate sites in `game-state.js`). Adding a `_gainItem()`
>   helper to create one is a reasonable follow-up, but out of scope for an unattended session. Sort is Name A–Z
>   / Qty (high→low) only.
> - **"Rare" is a static `category` tag, not a live "qty < 10" filter.** A qty-based tag would make items hop
>   between Rare and Mats as you spend/gain them. `void_crystal`, `chaos_essence` and `ancient_script` are
>   permanently `category: 'rare'` instead (matches pillar 6 — Void Crystals are a rare material, and the other
>   two are the next-lowest drop-weight, highest-tier resources per `locations.js`).
> - **"Keys" only ever holds one item** (`beast_taming_talisman`, tagged `category: 'key'`) — the spec's example
>   items ("Realm Keys", "Celestial Calendar") don't exist in `ITEMS` yet.
> - `#confirm-overlay` was generalized from a hardcoded "delete slot" flow into `showConfirm(msg, sub, onYes)` so
>   Discard could reuse it without duplicating overlay markup or wiring.
> - `.tab` font-size dropped 10px → 9px so all 7 tabs (added Pack) still fit at 300px.
> - No new persisted state at all: `category` lives in `items.js` (data), filter/sort/expanded-row state is a
>   render-layer closure in `game.js` (not saved, matches the PLAN.md implementation notes below), and the
>   currency delta indicator is computed per-frame from elapsed time rather than a CSS animation.

Right now items live inside the Explore and Craft tabs with no unified view. The Backpack tab gives the player one place to see everything they own, including spirit stones as a first-class currency display.

### 21A — Backpack Tab

New tab "Pack" (袋) added between Craft and Sect in the tab row.

**Layout:**

```
┌──────────────────────────────┐
│ 💰 Spirit Stones: 1,240      │  ← always at top, large
│ 💎 Void Crystals: 3          │  ← rare material, shown for convenience
├──────────────────────────────┤
│ [ All ] [ Mats ] [ Pills ]   │  ← filter tabs
│ [ Equip ] [ Rare ] [ Keys ]  │
├──────────────────────────────┤
│ ▸ Spirit Herb        ×14     │
│   Iron Ore           ×7      │
│   Beast Core         ×2      │
│   …                          │
├──────────────────────────────┤
│ Sort: [Name ▾] [Qty] [Type]  │
└──────────────────────────────┘
```

**Currency row** (always visible, not filterable):
- Spirit Stones — the main soft currency; show with `,` formatting and a ± delta indicator that fades after 3s when it changes.
- Void Crystals — a rare late-game material (founding sects, late recipes), shown below Stones. It is *not* a premium currency (pillar 6).

**Item categories (filter tabs):**
| Tab | Shows |
|-----|-------|
| All | Every item in inventory |
| Mats | Herbs, ores, essences, cores — crafting ingredients |
| Pills | Consumable pills and elixirs |
| Equip | Weapons and artifacts (currently equipped items highlighted) |
| Rare | Void Crystals, Chaos Essence, Realm Keys, Ancient Scripts — items with qty < 10 that are hard to obtain |
| Keys | Realm Keys + Celestial Calendar — items that unlock content |

**Item row:**
- Item name + quantity right-aligned.
- Tap/click a row to expand: shows description, "Use" button (pills/elixirs), "Equip" button (weapons/artifacts), "Discard ×1" button (with confirmation prompt).
- Currently equipped gear shows a ◆ badge on its row.

**Sort options:** Name A–Z, Quantity (high→low), Recently Acquired.

**Spirit Stones delta indicator:** When stones change by any amount, show a small `+N` / `-N` in green/red that floats up and fades — makes the currency feel alive without requiring a separate event log entry.

**Implementation notes:**
- Spirit Stones and Void Crystals live in `_s.spiritStones` and `_s.inventory['void_crystal']` today; the display just needs to surface them prominently. No new state shape required.
- The delta indicator needs a `_lastStonesSnapshot` in the render layer (not in game-state), tracked in `game.js`.
- Item metadata (descriptions, categories) comes from `ITEMS` in `assets/data/items.js` — add a `category` field to each item definition (`'mat' | 'pill' | 'equip' | 'rare' | 'key'`).

**State additions:** none (inventory already exists; only items.js needs `category` field added to each entry).

**New files:** none — tab HTML in `renderer/index.html`, styles in `renderer/styles.css`, render + wiring in `renderer/game.js`.

---

## Phase 22 — Active / Idle Mode Toggle + Mid-Late Automation

> **Status: ✅ implemented 2026-09-26 (roadmap 1.6, overnight autonomous run).** See `docs/systems/automation.md`
> for the full reference. Built close to the design below, with these divergences:
> - **Unlock `stageIndex` values don't match this section's original draft numbers.** They were written before
>   the pacing pass that tuned `stages.js`'s realm boundaries; `AUTOMATION_UNLOCKS` in `assets/data/automation.js`
>   uses the *actual* current indices for the named realms (Core Formation Early = 13, Nascent Soul Early = 16,
>   Spirit Severing Early = 19) — see that file's top comment.
> - **`playMode` is its own state field, not `s.settings`** — it changes balance (timers, bonuses, automation),
>   and `settings.md`'s invariant #2 requires `s.settings` stay presentation-only. Carried across reincarnation
>   like `s.warOrders`.
> - **Auto-Breakthrough excludes the Ascension Trial** (the last mortal stage) by design — that's a permanent-death
>   gamble with its own manual confirmation overlay (Phase 23C); automating it would remove the game's one
>   deliberate life-ending checkpoint.
> - **Offline catch-up**: only Auto-Explore fast-forwards through the whole offline gap (chained `endsAt`, bounded
>   loop, same trick `tickSectWar` uses). Auto-Sect-Missions/Auto-Craft/Auto-Breakthrough are live-only — sect
>   missions have never fast-forwarded offline at all (pre-existing, not new), and crafting/breakthroughs have no
>   natural offline-chaining hook without a much larger simulate-the-whole-queue change. See automation.md's
>   "Offline Catch-Up" section for the full reasoning per automation.
> - **Side-fix (same task, flagged by Phase 32):** `initSlot()` now resolves pending Phase 4 sect missions before
>   `tickOwnSect`/`tickSectWar(false)`, fixing the stale-balance bug in `sect-war.md`'s Standing Orders gotcha.
> - Sim: `npm run sim` before/after (founder + member paths, 200h). Casual/afk meaningful actions/hour roughly
>   doubled-to-tripled (casual 11.3→22.3/h, afk 96→296/h at 200h) — the headline goal. New flag: casual now hits
>   a "Hoarding" flag (47.6k unspent stones) it didn't before — automation accelerates casual into the
>   pre-existing late-game stone-sink gap (nothing left to buy) sooner than it used to reach it, not a new
>   problem this phase introduced. The afk/casual-vs-active member-war parity gap (Phase 32) narrowed but didn't
>   fully close — active mode's own new stochastic bonuses (Master's Touch, Push Harder) shift the RNG stream
>   for every run, so some of the before/after difference is noise rather than a clean signal; not chased further
>   this session. 0 errors/invariant violations in every run.

Two fundamentally different ways to play — the player can toggle between them freely at any time from the HUD. One prioritizes hands-off progression; the other rewards attention and clicking.

### 22A — The Toggle

A mode button lives in the titlebar next to the layout mode icon:

```
[⚙ Layout] [⚡ Active | 💤 Idle]
```

Switching is immediate and affects the next tick. Persists across sessions.

**State additions:**
```js
settings.playMode: 'idle',   // 'idle' | 'active'
```

---

### 22B — Idle Mode

The default. Everything works exactly as it does today, plus automation unlocks progressively through cultivation.

**Automation unlocks (Idle Mode only):**

| Feature | Unlock Stage | Behavior |
|---------|-------------|---------|
| Auto-Explore | Core Formation L1 (stageIndex 12) | Automatically relaunches the last used expedition when it returns. Can be paused per-location with a toggle in the Explore tab. |
| Auto-Sect Missions | Elder rank (rank 4) in any sect, or own sect Sect Hall Lv2 | Automatically re-queues completed missions of the same type if a slot is open. |
| Auto-Craft | Spirit Severing L1 (stageIndex 19) | Repeats the last crafted recipe as long as materials are available. Toggle per recipe in Craft tab. |
| Auto-Breakthrough | Nascent Soul L1 (stageIndex 18) | Automatically triggers a breakthrough attempt when Qi reaches the configured threshold (slider: 80%–100% of cap). Respects active pills. |

Each automation has an on/off toggle visible in its respective tab. Toggling one in Idle Mode does not affect Active Mode state.

Auto tasks emit a brief event-log line when they fire: `"[Auto] Expedition to Demon Marsh launched."` — same style as manual entries but prefixed `[Auto]`.

---

### 22C — Active Mode

No automation whatsoever — every expedition launch, mission queue, breakthrough attempt, and craft must be manually clicked. In exchange:

**Active Mode bonuses:**
- All expedition timers −35% (faster returns).
- Sect mission timers −25%.
- Crafting time −20% (where crafting has a time cost in future phases).
- Breakthrough attempt Qi loss on failure −10% extra (you're paying attention, you can course-correct sooner).

**Active Mode interaction bonuses (rewards actually clicking):**
- **Expedition push:** a "Push Harder" button appears for the last 20% of any expedition timer. Clicking it spends 10 Spirit Stones to add one extra roll on the drop table. Can only be used once per expedition.
- **Breakthrough focus:** during a breakthrough attempt a small 3s click-window appears (pulsing ring around the Qi bar). Clicking within the window adds +5% success chance for that attempt only. Missing the window has no penalty.
- **Craft attentiveness:** in Active Mode, each craft has a 10% chance to proc "Master's Touch" — doubles the output of that craft. Requires the player to have clicked the Craft tab within the last 60 seconds (i.e., you're watching).

**Active Mode constraints:**
- All automation toggles are greyed out and inert.
- Auto-Explore, Auto-Missions, Auto-Craft, and Auto-Breakthrough do nothing even if they were turned on in Idle Mode.
- The mode badge on the titlebar turns orange to make the state unmistakable.

---

### 22D — Mid/Late Automation Unlock Display

In Idle Mode, the Explore and Sect tabs show a small "Automation" section near the top listing what's unlocked and what unlocks next:

```
Automation
  ✅ Auto-Explore (Core Formation) — [ON] [OFF]
  ✅ Auto-Missions (Elder rank)   — [ON] [OFF]
  🔒 Auto-Craft — unlocks at Spirit Severing L1
  🔒 Auto-Breakthrough — unlocks at Nascent Soul L1
```

This gives mid-game players a concrete automation roadmap to look forward to.

**New files:** none — logic in `renderer/engine/game-state.js` (mode flag), automation dispatch in `renderer/game/expedition.js`, `renderer/game/sect.js`, `renderer/game/crafting.js`; UI wiring and Active Mode interaction windows in `renderer/game.js`.

---

## Phase 32 — War Standing Orders (军令) — *pillar 4: never punish absence*

> **Added 2026-09-25 (session 12).** Today a member-war call is a 2h window and an own-sect war is a 15-min window.
> Wars that resolve while you're away are "unseen": no penalty, but no reward either, so absent players miss
> out on the war sink. That's check-in pressure. This phase replaces those windows with orders you set in
> advance. The existing state machine (`tickSectWar`, `docs/systems/sect-war.md`) stays; only the commitment
> step changes.

**Standing orders** (Sect tab, a per-slot setting that applies to every future war):

| Side | Order | Options |
|---|---|---|
| Member (5C) | Answer calls | Always / Only defensive wars / Stay out |
| Member | War chest | Donate up to N stones per war (0 = off) |
| Member | Lend beast | Never / Strongest idle beast |
| Own sect (5B) | Reinforce | Never / If affordable and it keeps ≥ N stones banked |
| Own sect | Request ally | Never / Cheapest available / Best available |

- The orders are applied **at the moment each phase opens**, the same in live play and in offline catch-up
  (`tickSectWar(false)`). Resolution then gives the normal rewards/penalties whether you watched or not.
  The `seen` flag becomes presentation-only (log wording).
- **Being present adds optional choices, never necessary ones.** For example, you can override the order for this
  war, or take a flavor choice card ("Lead the vanguard yourself: small extra contribution, small health risk").
- **"Stay out"** is an explicit choice, so it keeps the small ignore cost (karma/contribution). It's never
  applied to a player who simply wasn't there, because the default order is "Always".
- Defaults: Answer = Always, chest = 0, lend beast = Never, Reinforce = Never, Ally = Never. New players are
  never charged stones they didn't agree to.
- Sim: retire the "wars resolving unseen" and "member wars ignored" flags. Add a check that afk/casual war W/L and
  contribution stay within ~10% of the active profile with the same orders. Teach the bot to set orders.
- Notifications (9B) may *announce* a war, but they're opt-in and nothing depends on them.

> **Status: ✅ implemented 2026-09-26 (roadmap 1.4, overnight autonomous run).** See `docs/systems/sect-war.md`
> ("Phase 32 — War Standing Orders") for the full reference. Built essentially as designed above, with two
> documented divergences:
> - **"Only defensive wars" behaves identically to "Always"** — Phase 15 (NPC sect simulation) doesn't exist, so
>   there's no attacker/defender distinction in the current member-war model to hook different behavior to (every
>   member war is already "your sect being attacked"). Kept as a separate enum value, not dropped, so it's ready to
>   diverge once Phase 15 or the 5.5 sect-war upgrade gives wars a real side.
> - **"Cheapest" vs "Best" ally also behave identically** for the same reason: `WAR_ALLY_COST_BASE`/
>   `WAR_ALLY_POWER_BONUS` don't vary by which `SECTS` entry is asked yet. `'cheapest'` picks `SECTS[0]`, `'best'`
>   the roster's last entry — flavor only until sects have distinct power/cost.
> - The "Reinforce"/"Request ally" orders only apply once `ownSect.founded` (there's no own-side war before that).
> - Orders are applied via the exact same public commit methods a present player's buttons call
>   (`answerWarCall()`, `donateWarChest()`, …), refactoring only the shared cost formulas
>   (`_warReinforceCost()`/`_warAllyCost()`) into internal helpers — no mutation logic is duplicated, and every
>   commit method's existing guards (`already`, room, affordability) already prevent a manual click on top of an
>   order from double-charging.
> - **Loss-contribution behavior changed**, not just presentation: a member-war defeat used to skip the
>   contribution penalty entirely when `seen` was false; it now always applies (seen only changes the log
>   wording). This is required by the pillar-4 design above ("resolution gives normal rewards/penalties whether
>   seen or not") but is a real balance change worth knowing about if re-reading old `sect-war.md` history.
> - Sim: bot sets modest (not maxed) orders once, on its first check-in; `casual`/`afk` rely on orders alone
>   (manual war clicks are `active`-only now, to actually exercise the standing-order path). The "wars mostly
>   resolve unseen" flags are retired; a new afk/casual-vs-active member-war parity check replaces them (>10pt
>   win-rate or >10% contribution/war gap). New invariants: `war_orders_invalid`, `war_chest_over_cap` (proves no
>   double-charge), `war_pills_over_cap`.
> - **Known gap, not fixed this session:** `afk` still trails `active`/`casual` on member-war win rate (~60% vs
>   ~74% in a `--path=member` 200h run) and contribution/war (~48 vs ~73), because `tickSectWar(false)` runs during
>   offline catch-up *before* pending Sect missions resolve (those only resolve on the next live tick), so an afk
>   `chestStones` order can see a thinner balance than what mission income is about to credit. See sect-war.md
>   Gotchas. `casual` (never closes) is unaffected and lands within the 10% band.

---

# M2 — The Life Loop

> Roadmap tasks 2.1–2.8. **Added 2026-09-25 (session 12)** after the user set the design pillars: a mortal life is
> a ~10–20h run, death hands the game to an heir, and the clan grows through meta progression. This milestone
> contains Phase 30 (lifespan + game time), Phase 31 (Ancestral Hall + clan legacies, which absorbs Phase 8 and 18B),
> and the lite versions of 16 (marriage/children) and 18C (heir selection). Write `docs/systems/life-loop.md` first
> (task 2.1) and review the numbers with the user before any code.
>
> **Task 2.2 built 2026-09-26 (overnight):** shared root/personality/name generators moved to
> `renderer/engine/persons.js`, `assets/data/names.js` added, `s.self`/`s.clan` skeleton added to
> `_newGame()` + migrations. No divergence from the doc's own decisions — see life-loop.md §11 for the
> handful of ambiguous calls it made (all consistent with 2.3–2.7). `npm run sim` verified byte-identical
> to a pre-change baseline (perf fields excluded).

---

## Phase 30 — Lifespan & Game Time (寿元 · 岁月)

> **Changed 2026-09-26 (user): age never kills.** "The user shouldn't have to worry about age." Age stays as a
> stat on the game clock, but lifespan, old-age death, twilight and Final Seclusion (30B–30C below) were removed —
> for the player and for spouses. A life ends by the Ascension Trial, a violent death, or Pass the Mantle (any time,
> from Stats). Lifespan extenders (e.g. 2.7's Longevity Blood legacy) are cut. Casual lives now run ~30h; the
> user accepted that and the life target became 20–40h (GAMEDESIGN pillar 1). See life-loop.md §15.

> **Built overnight 2026-09-26 (task 2.3, then pacing compression task 2.4) — see `docs/systems/life-loop.md`
> §12 (2.3) and §13 (2.4) for what actually landed.** Task 2.4 retuned `stages.js`'s Foundation Building–Spirit
> Severing `qiCap`s so a casual mortal life reaches Spirit Severing / an Ascension attempt within the 10–20h
> life instead of dying of old age around Core Formation (30D's "afk check" was also run: `OFFLINE_QI_MULT`
> was left at 1.0 — afk is far slower than casual in wall-clock terms to the same milestone, so no throttle).
> The draft numbers below predate life-loop.md's task 2.1 review pass and were superseded before code was
> written: `GAME_YEARS_PER_OPEN_HOUR` shipped as **30**, not 60 (at 60, a casual player dies of old age inside
> Qi Condensation — the cadence-floor math in life-loop.md §6.1), and the per-realm lifespan table shipped as
> Mortal 70 / QC 250 / FB 300 / CF 400 / NS 520 / SS 660 (life-loop.md §3.1), not the table in 30B below. State
> field names also differ slightly from this draft: `s.age`/`s.gameYear` exist as drafted, but `s.lifespan` is
> **not stored** — it's `derived.lifespan`, recomputed every `_recalc()` from `maxStageThisLife` (so future
> legacy purchases can't desync it). Treat life-loop.md as the source of truth for exact values from here on;
> this section is kept for the original design reasoning (twilight choices, extenders concept).

### 30A — The game clock

- **Game time passes only while the game is open** (user decision 2026-09-25). `tick(dt)` advances it in live
  play. `initSlot()` offline catch-up **never** does. Offline time still gives Qi/resources (8h cap as today).
- Starting rate: **1 game year per minute of open play** (`GAME_YEARS_PER_OPEN_HOUR = 60`, in a new data file
  `assets/data/lifespan.js`). This is tuned in task 2.4.
- State: `s.age` (years, float), `s.lifespan` (years), `s.gameYear` (clan calendar, for the Chronicle and Hall
  dates: "Year 212 of the Lin Clan").
- Display: Stats shows `Age 47 / 120`, and the age bar turns amber in the last 10%.
- All former "real day" timers in the plan (family, rankings, epochs) are expressed in game years.

### 30B — Lifespan by realm

Lifespan is set by the highest realm reached (classic xianxia: breaking through buys you time). Starting values,
to be tuned together with pacing in 2.4:

| Realm reached | Lifespan (years) | ≈ open hours at 1 yr/min |
|---|---|---|
| Mortal | 70 | 1.2h |
| Qi Condensation | 120 | 2h |
| Foundation Building | 200 | 3.3h |
| Core Formation | 400 | 6.7h |
| Nascent Soul | 800 | 13h |
| Spirit Severing | 1,200 | 20h |

- A life starts at age 16 (awakening). A character who keeps breaking through naturally lands in the 10–20h
  band. One who stalls in a realm dies of old age there. That's the natural end of a run, and it's what gives
  stalling a cost without a hard fail screen.
- **Lifespan extenders** (small, diminishing): longevity pills (a new recipe, once per realm), 14's constitution
  (M3), 23E's Tortoise Breath Art, and a clan legacy (31). Each source is capped, so a life can't become endless.

### 30C — Twilight and the end of a life

- **Twilight years** (last 10% of lifespan): a log + banter trigger, and the age bar pulses. The player can choose:
  - **Final Seclusion (死关):** for the rest of the life, BT chance +10% and Qi/s ×1.5, but no expeditions/missions.
    It's a last push for one more realm.
  - **Pass the Mantle (传位):** end the life now, peacefully. It counts as a full life for bloodline growth and Merit
    (31). This lets a player who is done with a character move on without waiting.
- **Death by old age** only ever happens while the game is open (a consequence of 30A), so there's a proper death
  scene, never a surprise on login.
- Every way a life ends (old age, health 0, failed tribulation, failed Ascension, Pass the Mantle, successful
  Ascension) goes through one flow: **death/ending scene → Ancestral Hall (Merit, legacies) → heir selection → new life.**

### 30D — Sim

- Metrics: life length (open hours) by cause, age at death, realm at death, lives per 100h, Twilight choice.
- Invariants: `age` never increases during offline catch-up; `age ≤ lifespan` except inside the death flow;
  lifespan extenders stay within their caps.
- Bot policy: take Final Seclusion when the next BT is within reach, otherwise Pass the Mantle.
- **Afk check:** with no aging offline, the afk profile gets lots of Qi per open hour. If afk lives are trivially
  easy, lower the offline Qi rate (for example ×0.5), don't make age pass offline.

---

## Phase 31 — Ancestral Hall & Clan Legacies (祖祠) — *absorbs Phase 8 and 18B*

### 31A — A save slot is a clan

- At slot creation you name the **clan** (a surname). Migrated saves take the surname from the character's name.
- Everything the family keeps lives **in the slot save**: Bloodline Quality (already there, 23B), the tree,
  Merit, legacies. There's **no new cross-slot file**, so no new IPC (Rule 7 stays simple). The cross-slot Hall
  of the Fallen is optional polish in M6 (task 6.4).
- Charselect cards show the clan name, generation and current heir.

### 31B — The Ancestral Hall

An overlay (like ⚙) that opens after every life ends, and from a button in Stats at any time.
- **Family tree:** each generation's name, spouse, highest realm, cause of death, age, titles and a generated
  epitaph line ("Lin Qiu, who broke Core Formation at 212 and died laughing at the heavens.").
- **Clan records:** best realm reached, firsts, total generations, Ascended Ancestors.
- **Bloodline Quality** is revealed here after the clan's first Ascension attempt (23B rule unchanged).

### 31C — Ancestral Merit (祖荫)

Earned once, at the end of each life:
- **Stage term:** `MERIT_STAGE × (maxStage/22)²`, the same shape as bloodline growth, so early deaths give little.
- **Clan firsts (the big source):** the first time anyone in the clan reaches a realm, founds a sect, tames a beast
  tier, wins a war, attempts or survives Ascension… Each first pays once per clan. That rewards trying new
  things over replaying the same life.
- **Deeds:** smaller repeatable amounts (wars won, rare drops, disciples trained), capped per life.

### 31D — Clan Legacies (spent in the Hall between lives)

Mostly **unlocks and options** (pillar 3). Starting list, to be finalized with the user in task 2.1:

| Group | Legacy | Effect |
|---|---|---|
| Heritage | Family Manual | The heir starts knowing one technique of the clan's choice (tier grows with levels) |
| Heritage | Heirloom | One equipped item passes to the heir (more slots with levels) |
| Heritage | Ancestral Stipend | Starting spirit stones |
| Heritage | Beast Lineage | The offspring of your strongest tamed beast joins the heir |
| Heritage | Clan Estate | A small herb garden that yields materials over time |
| Knowledge | Clan Recipe Book | Recipes the clan has crafted stay known |
| Knowledge | Sect Continuity | Your founded sect survives. The heir starts as its Young Master (full version in 5.4) |
| Knowledge | New origins / challenge modes | Unlock birth origins (M3) and challenge modes (M8) for future heirs |
| Blood | Longevity Blood | +lifespan % (capped) |
| Blood | Refined Meridians | Small Qi/s % (capped, deliberately modest) |

### 31E — Ancestral catch-up (祖荫加持)

Realms **below the clan's best-reached stage** cultivate much faster (starting value: Qi/s ×2.5 and BT chance +10%
below the clan best, normal at/above it). Generation 5 blows through the realms their great-grandmother already
walked and spends the life on new ground. This is what keeps short lives from turning into a grind.

### 31F — The Ascended Ancestor ending (fixes the post-Ascension dead zone)

- A **successful Ascension** ends the mortal life with its own scene. The character joins the Hall as an
  **Ascended Ancestor**: a large Merit award, the permanent clan blessing "Watched Over by an Immortal" (small,
  capped), and play continues with the heir.
- M7 (23D) makes Ascended Ancestors **playable** in the Immortal realms. How that sits beside the continuing
  mortal line is Phase 23 open question 2 (the user's lean: keep playing the Immortal, who watches over the heir).
- Until then, the `ascension` stage stub is no longer reachable as a place to idle.

### 31G — What this replaces

- **Phase 8 (Dao Seeds, Ascension Hall, Sect Legacy):** Dao Seeds are **cut**; they were pure multipliers. The
  Ascension Hall becomes the Ancestral Hall. Sect Legacy becomes the Sect Continuity legacy.
- **Phase 18B (Legacy Passives):** folded into Merit + Legacies (achievement → currency → choice, rather than
  automatic stacking bonuses). The 18B rows are design input for the legacy list.

### 31H — State, files, sim

- State: `s.clan = { name, merit, legacies: {id: level}, tree: [ancestor summary], bestStageIndex, firsts: {},
  ascendedAncestors }`. `generation`/`bloodlineQuality` stay where 23B put them. Add `_ensurePhase30Fields()` /
  `_ensurePhase31Fields()` (Rule 5). Existing saves become generation-N clans with a one-ancestor tree.
- New data: `assets/data/lifespan.js`, `assets/data/clan-legacies.js`. New logic: `renderer/game/life-loop.js`
  (death flow + Hall UI glue, DOM-free where the sim needs it).
- Sim: runs continue across generations (500h+ horizon). Metrics: Merit per life, legacies bought, time to reach the
  clan best per generation (should fall), generations to first Ascension. The bot needs a Merit spending policy.
  **Fix the known gotcha** in `docs/systems/bloodline.md`: dead-zone and stage-wall metrics must become
  generation-aware.

---

## M2 family (lite) — Phase 16 lite + 18C

The minimum family needed for heirs, built on the 2.2 person record so M6 upgrades it rather than replacing it.

> **Marriage & children built 2026-09-26 (M2 task 2.5) — see `docs/systems/life-loop.md` §14.** Proposals, spouse
> aging/death, mourning, children with blended roots and the 23B partner term all shipped as specced. Divergences:
> `family.pastSpouses`/`spouseStageYear` were added to the state shape; no Solitary Lineage Art/adoption yet (heir
> fallback is 2.6's distant cousin). Heir selection (18C, below) is still task 2.6.
>
> **Family depth built 2026-09-26 (user request) — `docs/systems/family.md`.** No child cap (per-partner intervals),
> spouse affection + 23 personality-driven marriage events, crisis events (spouse cheats / leaves), a duel to the
> death, lovers from expedition encounters, and affair discovery with personality-weighted reactions (accept,
> sabotage, duel, suicide, murder-suicide). Lover children are full heirs (for 2.6).

- **Marriage:** from Foundation Building, a rare **proposal choice event** offers 1–3 generated suitors (person
  records: name, root, stage, personality). Accept, decline, or wait. A Solitary Lineage Art (23E) or adoption
  covers players who never marry.
- **Spouse:** cultivates on a simple curve. Their highest stage feeds the 23B partner term. Banter/log flavor
  lines. They can die (and remarry becomes possible after a mourning period in game years).
- **Children:** born every ~15–30 game years while married (15–30 min of open play), up to a cap. Roots blend
  from both parents (16C rule). They age on the game clock and reach adulthood at 16.
- **Heir selection (18C):** at the end of a life, pick any adult child (full `carry`) or a new soul (weak carry).
  With no adult child, the options are new soul or a **distant cousin** (half carry, always available). That way
  one bad life never wipes out the clan's progress.
- The heir starts at 16 as a Mortal, with inherited root, clan legacies and ancestral catch-up. The spouse and the
  other children stay as person records in the tree (M4 turns them into living-world persons).

---

# M3 — Character foundation

> Roadmap tasks 3.1–3.5. Every new generation rolls these again, so they make each life start differently. Phase 6E (layout modes, optional task 1.7) lives in the Phase 6 section under M8.

---

## Phase 12 — Birth Origin & Character Foundation

Fires at the very start of a new game, between the name-entry screen and the first cultivation tick.
The player picks a **starting region**; the **family type** is then rolled randomly based on that region's
social-tier weights. This is purely narrative and mechanical setup — no grinding required.

### 12A — Starting Regions

| Region | Flavor | Root Bias | Constitution Bias | Spirit Stone Start |
|--------|--------|-----------|-------------------|--------------------|
| Imperial Capital (帝都) | Intrigue, politics | Pure/Dual weighted | Average | 25 |
| Frontier Wilderness (边疆荒野) | Harsh nature, beasts | Earth/Metal | Strong, high variance | 8 |
| Ancient Sect Territory (古宗领地) | Discipleship culture | Fire/Wind | Average | 15 |
| Demon Lands (魔域) | Corruption, ambition | Shadow/Blood (evil-inclined) | Hardy | 10 |
| Hidden Valley (隐秘山谷) | Hermits, mystery | Rare — Void/Heavenly slightly more likely | Frail but special constitution chance × 2 | 5 |
| Mortal Village (凡人村) | Common folk | Completely random | Random | 10 |

Region is displayed on the Stats tab and referenced in relevant random events.

### 12B — Family Types

Rolled per region's weights; some types are region-exclusive.

| Family Type | Regions Available | Starting Bonus | Trait |
|-------------|-------------------|----------------|-------|
| Noble Family (贵族) | Capital, Sect Territory | +15 Spirit Stones, +1 spiritual root quality tier | Events: political intrigue, arranged-marriage pressure |
| Cultivator Lineage (修士之家) | Sect Territory, Hidden Valley | 1 technique pre-learned (qi_breathing unlocked free) | Family elder NPC generated |
| Merchant Clan (商贾) | Capital, Mortal Village | +10 Spirit Stones, 3 random crafting recipes known | Discounts on bought techniques |
| Mortal Farmer (农户) | Mortal Village, Frontier | Standard; Karma starts at 55 instead of 50 | No special perk |
| Frontier Warrior (边疆武士) | Frontier, Demon Lands | Body constitution floor D (never rolls F/E) | Combat events fire 30% more often |
| Orphan (孤儿) | Any (weighted higher in Demon Lands, Mortal Village) | −5 Spirit Stones | **Indomitable Will** perk: BT failure Qi loss −25%, Integrity loss −10 |

**State additions:**
```js
origin: {
  region: 'mortal_village',     // region id
  family: 'mortal_farmer',      // family type id
  familyNpcId: null,            // if a family NPC was generated
}
```

**New files:** `assets/data/origins.js` — regions and family type tables with weights

### 12C — Special Constitutions (rare, rolled at character creation)

1 in 50 chance to roll a special constitution instead of the standard tier (F–S):

| Constitution | Chinese | Probability | Effect |
|--------------|---------|-------------|--------|
| Phoenix Body (凤凰之体) | 1 / 50 | Fire Qi/s ×2; auto-survive one BT failure per game year (Phase 30 clock; was "per day, resets midnight") | |
| Jade Dragon Body (玉龙之体) | 1 / 80 | Qi cap ×1.5; each realm transition adds +10% cap permanently | |
| Void Devourer (虚空吞噬体) | 1 / 100 | Expedition enemies drop Qi directly (bonus Qi equal to 5× enemy tier) | |
| Undying Flesh (不死之躯) | 1 / 200 | Realm Demotion impossible; Realm Integrity never drops below 10 | |

Special constitution shown on Stats tab with golden border. No tempering needed — this is a gift from heaven.

---

## Phase 13 — Alignment & Karmic Path (Good vs Evil)

Not all power is the same. Some spiritual roots carry a heavenly mandate; others carry a demonic hunger.
Alignment is a second moral axis orthogonal to Karma — it shifts based on *how* you cultivate, not just *how much*.

### 13A — Root Alignment Inclinations

Every spiritual root type is categorized at game start:

| Root Type | Alignment Inclination | Starting Alignment |
|-----------|----------------------|--------------------|
| Heavenly (天灵根) | Pure Light | +60 |
| Pure single root (纯灵根) | Light | +30 |
| Dual root (双灵根) | Neutral | 0 |
| Mixed root (杂灵根) | Neutral | 0 |
| Shadow/Void root | Dark | −30 |
| Blood/Death root (Demon Lands exclusive) | Dark | −50 |

### 13B — Alignment Meter

Range: −100 (Demonic) to +100 (Celestial). Starts at root inclination value.

Named tiers:
| Range | Name | Effects |
|-------|------|---------|
| 70–100 | Celestial (天道) | Heaven's Favor events, righteous NPCs approach you, sects with evil alignment refuse you |
| 30–70 | Righteous (正道) | Standard positive event pool, karma gains ×1.2 |
| −30–30 | Neutral (中立) | No penalty or bonus |
| −30 to −70 | Sinister (邪道) | Dark event pool unlocked, demonic techniques available, righteous sects refuse you |
| −70 to −100 | Demonic (魔道) | Demon Lord events, assassination from righteous sects, ×2 Qi/s but constant Integrity drain |

### 13C — Actions That Shift Alignment

Every choice that matters records its alignment weight.

**Increases alignment (toward Celestial):**
- Help NPC event choice: +5
- Donate to Mortal Village (event): +8
- Defend sect in war (not aggressor): +3 per war
- Choose Heaven Dao path: +20 one-time
- Earn "Heaven's Favorite" title: +5 one-time
- Spare enemy during expedition (choice event): +10

**Decreases alignment (toward Demonic):**
- Rob NPC: −15
- Kill surrendering enemy (choice event): −20
- Choose Devil Dao path: −30 one-time
- Attack another sect unprovoked: −5 per war you start
- Use Blood cultivation technique: −8 per use
- Demonic inner demon event resolved badly: −10

### 13D — Alignment-Locked Content

| Feature | Requires |
|---------|---------|
| Heaven Dao path | Alignment ≥ 0 |
| Sect: Void Moon Pavilion join | Alignment > −20 |
| Righteous NPC will court player (marriage) | Alignment > 10 |
| Blood cultivation techniques | Alignment < −30 |
| Devil Dao path | Any alignment (but pushes you toward Demonic) |
| Demonic Sect (魔教) join | Alignment < −50 |
| Demon Lord encounter event | Alignment < −70 |
| Celestial Mandate event (auto-advance 1 layer) | Alignment > 80 |
| Immortal Paths — Tyrant / Devourer (Phase 24) | Alignment ≤ −30 (or Neutral) |
| Immortal Paths — Celestial Deity (Phase 24) | Alignment ≥ +30 (or Neutral) |
| Immortal Paths — Heaven's Executioner (Phase 24) | Alignment ≥ 0 |

**State additions:**
```js
alignment: 0,            // −100 to 100
alignmentLabel: '',      // computed in _recalc
```

---

## Phase 14 — Body Constitution & Physical Tempering (Deep)

*Supersedes the simpler Body Cultivation sketched in Phase 7B — Phase 7B is now expanded into this.*

The body is a second cultivation path running in parallel to Qi cultivation.
You were born into a constitution tier; you can forge it higher through discipline.

### 14A — Constitution Tiers

| Tier | Name | Qi Cap Mult | BT Failure Qi Loss Reduction | Expedition HP |
|------|------|-------------|------------------------------|---------------|
| F | Frail Body (体弱) | ×1.0 | 0% | 50 |
| E | Mortal Body (凡躯) | ×1.05 | 5% | 75 |
| D | Hardened Body (强躯) | ×1.1 | 10% | 100 |
| C | Steel Body (铁躯) | ×1.2 | 20% | 150 |
| B | Diamond Body (金刚体) | ×1.35 | 30% | 200 |
| A | Immortal Body (不朽体) | ×1.5 | 40% | 300 |
| S | Heaven-Forged Body (天锻体) | ×1.75 | 55% | 500 |

Starting tier is rolled at character creation per region:
- Hidden Valley: rolls D–A
- Frontier, Demon Lands: rolls D–C
- Others: rolls F–C

XP required to advance one tier (cumulative):
`F→E: 200 | E→D: 1000 | D→C: 5000 | C→B: 20000 | B→A: 80000 | A→S: 250000`

### 14B — Physical Tempering Methods

All tempering runs in real-time; only one can be active at a time.

**Tier 1 — Basic Training**

| Method | Duration | Cost | Constitution XP | Cooldown |
|--------|----------|------|-----------------|----------|
| Morning Exercise (朝练) | 5 min | Free | 5 | None |
| Iron Fist Training (铁拳修炼) | 30 min | 1 Beast Core | 40 | 1 hour |
| Boulder Carrying (负重) | 2 hr | 3 Beast Cores | 200 | 4 hours |

**Tier 2 — Spirit Tempering** *(unlocks at Qi Condensation L3)*

| Method | Duration | Cost | Constitution XP | Side Effect |
|--------|----------|------|-----------------|-------------|
| Spirit Forge (灵力淬体) | 4 hr | 5 Beast Cores + 2 Iron Ore | 600 | Qi gain −50% during tempering |
| Ten-Thousand Strikes (万拳) | 8 hr | 10 Iron Ore | 1500 | Same |

**Tier 3 — Extreme Ordeals** *(unlock per stage requirement)*

| Method | Unlock Stage | Duration | Cost | Constitution XP | Bonus Effect |
|--------|-------------|----------|------|-----------------|--------------|
| Icy Waterfall Meditation (冰瀑禅修) | Foundation L1 | 12 hr | 10 Ice Crystals | 4000 | Water root Qi/s ×1.4 for 48h |
| Volcanic Immersion (火山淬体) | Foundation L2 | 12 hr | 10 Fire Cores | 4000 | Fire root Qi/s ×1.4 for 48h; unlocks fire-aligned events |
| Thunder Peak Endurance (雷峰忍耐) | Nascent Soul L1 | 24 hr | 30 Thunder Stones | 15000 | BT chance +5% permanently after each completion |
| Void Pressure Chamber (虚空压力) | Spirit Severing L1 | 48 hr | 20 Void Crystals + 5 Chaos Essence | 60000 | Grants a clan first (Ancestral Merit, Phase 31) on completion; only completable once per life (Dao Seeds cut) |

**Tier 4 — Tribulation Tempering** *(post-Tribulation only)*

After surviving a Heavenly Tribulation (Phase 7C), the tribulation lightning can be channeled back into the body:

| Method | Requirement | Duration | Constitution XP | Effect |
|--------|-------------|----------|-----------------|--------|
| Absorb Tribulation Lightning (渡劫炼体) | Just survived a Tribulation | 30 min | 25000 | Body tier +1 if < A; caps at A unless special constitution |

### 14C — Constitution & Alignment Interaction

High alignment (Celestial) cultivators purify their body differently from low alignment ones:

- Celestial alignment: all tempering XP ×1.25; extreme ordeals have a 5% chance to auto-raise one tier
- Demonic alignment: Volcanic Immersion XP ×2; gains a demonic variant (Blood Forging) that deals alignment damage for faster XP

**State additions:**
```js
body: {
  tier: 'F',              // F E D C B A S or special id
  constitutionXp: 0,
  specialConstitution: null,  // null or special constitution id
  activeTemperingId: null,
  temperingEndsAt: null,
}
```

**New files:** `assets/data/tempering.js` — tempering method definitions + tier thresholds

**UI:** New sub-tab inside "Stats" tab → "Body" panel. Shows tier badge, XP bar, list of available tempering methods with timers.

---

## Phase 7 — Dao Paths, Body Cultivation & Heavenly Tribulation

### 7A — Dao Path System
At Foundation Building (stageIndex 10), the cultivator must choose a Dao Path.
This is a permanent choice per save (reroll costs a Heavenly Root Elixir).

| Dao Path | Bonus | Unique Technique Unlock |
|----------|-------|------------------------|
| Sword Dao (剑道) | Weapon bonuses ×1.5, BT chance +5% | Sword Intent: AOE expedition damage |
| Flame Dao (炎道) | Qi/s ×1.4 | Heart Flame Sutra (enhanced) |
| Void Dao (虚道) | Hidden locations always accessible | Phase Step: skip one failed BT per hour |
| Life Dao (生道) | Realm Integrity regen ×3, herb drops ×2 | Undying Roots: never demote below current realm |
| Heaven Dao (天道) | All bonuses ×1.2, BT always ≥ 30% | Heavenly Will: once per realm, auto-advance one layer (was "1/day", converted to fit pillar 4) |
| Devil Dao (魔道) | Qi/s ×2.5, BT chance −15%, Karma slowly drains | Demonic Possession: temporarily ×5 Qi/s |

Devil Dao adds the "Qi Deviation" event pool (higher damage negative events).

### 7B — Body Cultivation
A parallel track alongside Qi cultivation. Levels from Mortal Body → Bronze → Iron → Diamond → Immortal.
Each level requires physical tempering (uses Beast Cores + Iron Ore).
Body level provides: damage reduction in expeditions, Realm Integrity starting value increases.

**State additions:** `bodyLevel: 0, bodyXp: 0`

### 7C — Heavenly Tribulation
At three specific transitions (Foundation Building, Nascent Soul, Spirit Severing), a Heavenly Tribulation
is required before you can break through. Not auto-triggered — you must choose to "Face the Tribulation."

Three waves of increasingly powerful lightning strikes. Each wave: survive or lose significant Qi/Integrity.
Surviving all 3 waves grants the breakthrough and a permanent "Tribulation Veteran" title.
Failing mid-tribulation: large Qi loss but can retry after a 10-minute cooldown.

The tribulation plays as a special multi-frame ASCII animation (lightning, storm, enduring figure).
This is a major event — the most dramatic animation in the game.

---

# M4 — The Living World

> Roadmap tasks 4.1–4.11. Phase 28 is the build spec. Phases 15 and 11 follow as superseded / partly-folded design input.

---

## Phase 28 — Persistent Living World (活世界) — *supersedes Phase 15 and 11A*

Every NPC is a **persistent person** with a whole life, not a flavor name. Phase 15's trait pool, sect-decision
logic and relationship tiers carry over as the starting design. Phase 11A's single rival becomes the top genius
of your starting cohort (28H).

**Design goal (user, 2026-09-25):** mix **heavy** and **light** simulation so that players *start recognising
names*. The same people keep showing up on missions, on the rankings, in wars and in the Chronicle, and they grow,
rise, fall, die or ascend alongside you.

### 28A — The Person record

```js
{
  id, name, gender, surnameClan, birthTs, lifespan, alive, deathTs, deathCause,
  origin: { region, family },                       // 12
  root: { type, elements, quality }, constitution, bloodlineQuality,   // same rolls as the player
  stageIndex, stageProgress, immortalStage, power,  // power = shared powerScore() (28J)
  personality: { traits: ['ambitious','greedy'],    // 15 trait pool, 2–3 traits
                 axes: { courage, greed, compassion, pride, loyalty, ambition, curiosity } },  // −100..100
  morality: { alignment,                             // −100..100 (13)
              disposition: 'principled'|'pragmatic'|'opportunist'|'zealot'|'hedonist' },
  status: 'free'|'disciple'|'elder'|'slave'|'believer'|'saint'|'resident'|'devoured'|'ascended',
  activity: { type: 'secluded'|'expedition'|'mission'|'traveling'|'war'|'realm', locationId, until },  // 28I
  sectId, rank, familyIds: [], relations: { [personId]: -100..100 },
  memories: [{ ts, type, withId, weight }],          // capped ring buffer; decays by weight
  goals: [],                                         // current utility-AI goals
  cohort: null | 'start' | waveId,                   // 28H
  familiarity: 0,                                    // how often the PLAYER has seen this name (28B)
  simTier: 'heavy' | 'light',
}
```

- **Morality disposition** is separate from alignment. It decides *how* they act on it: a Principled righteous NPC
  never lies, while a Pragmatic one will.
- The player's own record uses the same shape where it makes sense, so NPCs (and the rankings) can reason about you.

### 28B — Heavy + light simulation, and "familiar faces"

| Tier | Who | Sim rate | Budget |
|---|---|---|---|
| **Heavy** | **Your starting cohort (reserved ≥ 40% share, see below)**, your sect/island, family, slaves, saints, rivals/enemies, top rankers, anyone with high **familiarity** | Full utility-AI decisions + activities every sim-hour | ≈ 150–300 |
| **Light** | Everyone else who is a *named person*: all cohort members, NPC-sect leaders & elders, ranked people, anyone you've met | Coarse step once per sim-day: progress, age, big life events only | ≈ 1,500–3,000 |
| **Background** | Unnamed regional populations as *statistics* (counts by realm band/alignment) | Aggregate; only feeds 28H replacement + materialization | n/a |

- **Promotion and demotion between tiers is automatic.** A **relevance score** (familiarity + relation strength +
  rank + role near you) is recomputed every game year (Phase 30 clock). It promotes a person to Heavy when you start to care about them and
  demotes them to Light when you haven't crossed paths in a while. **Nobody named is ever deleted** while alive.
- **Cohort reservation (user, 2026-09-25):** at least **40%** of the Heavy budget (≈ 60–120 slots) is reserved for
  your starting cohort (28H).
  - The whole cohort starts Heavy.
  - A cohort member is demoted to Light only after a long stretch with no contact *and* only while the cohort
    still fills its reserved share.
  - When cohort members die or ascend, freed reserved slots go to the next most-relevant living classmates first.
  - Unused reserved slots (late game, few classmates left) fall back to the general pool.
  - This way a large part of the people you see "live" are the people you started with.
- **Familiar-faces rules.** These are what make names recur on purpose:
  - **Familiarity** rises every time the player *sees* a name: event log, encounter, ranking change, war, Chronicle.
  - **Known-first casting:** when any system needs "an NPC" (encounter, war champion, prayer, recruit, bounty,
    event text), it picks an **already-named person ~75% of the time**, weighted by familiarity. It rolls a fresh
    one only ~25% of the time.
  - **New-name throttle:** at most ~5 brand-new named people are introduced per open hour (was "per real day", converted to game time) in the early game, rising
    later, so the player isn't flooded with names they can't track.
- **Materialize on observation:** when a system needs someone who doesn't exist yet, one is rolled from the
  Background statistics for that region/realm band, and **from then on is permanent**.
- **The dead** are compacted into a **Chronicle** entry (name, life summary, cause of death, links) and leave the
  live sim.
- **Determinism:** each person has a seeded RNG stream, so offline catch-up and the QA sim reproduce the same
  results.
- **Performance budget (target):** Heavy-tier tick ≤ 2 ms per game tick; Light tier stepped in batches (spread
  across ticks); offline catch-up in coarse day-chunks, capped; world save ≤ ~3 MB. iOS battery matters (Rule 7).

### 28C — Lives

- Each step, a person:
  - ages
  - cultivates (root/constitution/sect/blessings/doctrine affect speed; the same pacing curve as the player)
  - breaks through or fails
  - gets injured and heals
- They also marry and **have children** (who inherit roots and bloodline, the same rules as 16/23B).
- They **die** of age (NPC lifespan 寿元 by realm is always on, even though the player's lifespan is parked,
  23A), war, duels, encounters, being devoured, or failed Ascension.
- **NPCs run their own Ascension Trials** with 23C's formula. Survivors move to the **Immortal Realm population**
  (status `ascended`), not deleted. When *you* ascend, you meet the names you knew as mortals again, and they can
  petition you (26F).

### 28D — Decisions (utility AI)

- Each goal is scored by traits × morality × situation. Goals include: cultivate (secluded), go on expeditions,
  take sect missions, join/leave/found a sect, betray, marry, duel, explore a secret realm, pray (to you or a rival
  deity), fall to demonic arts, seek revenge, challenge a ranker.
- **Phase 15B's sect logic is one part of this.**
- NPC sects rise, split, merge and go to war with each other *without the player*.
- Chosen goals set the person's **`activity`**, which is what makes encounters (28I) possible.

### 28E — Memory & reputation

- Every meaningful act involving you writes a memory into the people involved. Examples: devoured their master,
  blessed their child, recruited them from poverty, abandoned them in a war, split loot fairly in a ruin.
- Memories spread through relations as **reputation**, and they drive later behavior: vengeance, loyalty,
  refusing a recruiter, petitioning (26F).

### 28F — UI

- The **World tab** (from 15C) contains:
  - a **person inspector**: portrait glyph, stats, traits, relations, memories about you, life log
  - **Rankings** (28J)
  - a **Chronicle feed** of notable world events
  - **Known People** with search, filters and ★ pins (pinning forces Heavy tier)
- Phase 15C's direct interactions (gift, duel, mentor, recruit, alliance, denounce) are kept.
- Names in the event log are **clickable**: clicking one opens the inspector. This is the main way familiarity is
  built.

### 28G — Storage & migration

- The world is too big for the slot JSON, so it gets its own per-slot world file. That needs a new
  `window.electron.*` load/save pair in **both** `preload.js`/`main.js` and `platform-storage.js` (Rule 7).
- On migration, existing 5A disciples, the Phase 4 `SECTS` roster and the 5B rival pools become persons and sects.
  An old save (already mid-game) gets a generated world at matching world-age (cohort at comparable stages).

### 28H — The Starting Cohort & natural replacement (同辈 · 新陈代谢) *(user request)*

**Starting cohort ("the same-generation", 同辈):**
- At new game, a **wave of ~80–120 NPCs starts cultivating at the same moment you do** (Mortal / Qi Condensation L1).
  It is sized to fill the reserved Heavy share (28B) with room for attrition.
  They're spread across regions, with origins rolled like the player's (12).
- **Talent spread** (tuned with the sim):
  - Most are slower than a median player.
  - About a third are comparable.
  - **3–5 "Heaven's Chosen" geniuses** out-pace an active player early. They are your natural rivals, and the one
    from your own region is the old Phase 11A rival.
- Cohort members start **Heavy** and keep the reserved Heavy share (28B). Those outside it stay at least
  **Light** while alive. They are the core "familiar faces":
  - The **Rising Dragon Ranking (28J)** is largely them while they are young (cultivation age ≤ the Rising Dragon limit in game years).
  - The **Your Class board (28J)** tracks them for the rest of your life.
- **Pre-existing world:** a few hundred established people at varied stages (sect masters, elders, old monsters,
  a few near-Ascension figures) so the **Heaven Ranking** top isn't empty on day one.

**Natural replacement when NPCs die or ascend:**
- **Population targets** per (region × realm band) live in a data file (carrying capacity). A gentle controller
  keeps each band within about ±15% of target. It is never an instant respawn: vacancies fill over *sim-days*.
- **Most of the ladder refills itself.** People from the band below break through into the gap, so replacement
  mostly only needs *injection at the bottom* plus a rare top-up at the top:

| Source | Fills | Feels like |
|---|---|---|
| **Births** (28C children) | Mortal band, ages up | Families continuing |
| **Awakening waves (觉醒)** | Mortal/Qi band — small batches of youths whose roots awaken every ~7 sim-days per region | "A new generation" — each wave is a mini-cohort with its own Rising Stars |
| **Promotion from below** | Every middle band | Nobody appears from nowhere |
| **Wandering cultivators (游历者)** | Mid bands of an under-populated region | Migration from beyond the map |
| **Hidden masters (老怪出关)** | Top bands after many high-realm deaths/ascensions (rare event) | "An old monster breaks seclusion" |
| **Materialization** (28B) | Any band on demand | The person was always there, you just hadn't met them |

- **Roles are succeeded, not respawned.** A dead sect master is followed by their Grand Elder or heir disciple.
  An empty ranking slot is simply taken by the next person. Each succession is a Chronicle line ("Mourning bells
  toll at Azure Sword Sect…").
- **Names are never recycled for new people.** Descendants may be named after ancestors ("grandson of the late
  Elder Mo"), which makes the replacement *read* as continuity.
- **Sim tuning:** per-band population over 500h should be flat-ish (no extinction, no explosion), and the cohort
  should thin out naturally (deaths, stalls) instead of all ascending together.

### 28I — Encounters: meeting NPCs in the world *(user request)*

People who share an **activity + location** with you can cross paths with you.
- **Where:** expeditions (2A), sect missions (4), secret realms (17), sect/island wars (5B/5C/26D), tournaments
  (27D), travel/scouting tours (27C).
- **Chance:** a base ~15–25% per expedition/mission (capped per hour). Candidates are persons whose `activity`
  matches the location and whose power fits the zone, cast with **known-first** weighting (28B).
- **The same person can't appear twice within a few hours**, except rivals/enemies, who seek you out on purpose.

| Encounter | What happens | Hooks |
|---|---|---|
| **Treasure contest** | You both reach the same herb/relic — power check or negotiate a split | Loot, relation ± |
| **Team up** | Clear the zone together — bonus loot, both +relation | Friendship → alliances, courtship (16) |
| **Rescue** | NPC is injured/cornered — help, ignore, or *rob* | Alignment (13), big memory |
| **Ambush / robbery** | Evil NPC (or genius hunter targeting Rising Stars) attacks | Health (23A), loot loss, vengeance |
| **Duel challenge** | A ranker or proud cohort member challenges you | Ranking moves (28J), fame |
| **Promising youth** | Meet a talented mortal — invite them to your sect | Manual recruit path (27C) |
| **Old friend / cohort reunion** | Someone from your cohort, now changed | Pure familiarity + flavor |
| **Path targets** *(Immortal era)* | Capture / devour / bless / bounty on the spot | 24B–E |

- **Idle-first resolution:**
  - An **encounter stance** setting (Friendly / Cautious / Opportunist / Ruthless) auto-resolves most encounters,
    combined with alignment and the NPC's personality.
  - **Notable** people (rivals, rankers, cohort geniuses, sworn allies/enemies) and **Active Mode** (22C) raise a
    choice card when the expedition returns. It is never a blocking popup, and an unanswered card expires to the
    stance default.
- **NPCs also come to you:** challengers, petitioners, suitors (16), spies and envoys visit your sect.
- **NPC ↔ NPC encounters** happen off-screen in the sim and reach the Chronicle only if notable (a ranker dies in
  a duel, two cohort members become sworn siblings).

### 28J — Heavenly Rankings (天榜 · 潜龙榜 · 同届榜) *(user request)*

Three boards over everyone the world tracks (Heavy + Light persons + the player):

| Ranking | Who | Metric |
|---|---|---|
| **Heaven Ranking (天榜)** — the strongest | Every living person in the mortal world (incl. old monsters) | `powerScore` |
| **Rising Dragon Ranking (潜龙榜)** — fastest-growing newcomers | Anyone whose *cultivation age* is **≤ ~60 game years** (was "30 real days", user 2026-09-25, converted to the Phase 30 clock in session 12; each heir is a new newcomer) — your cohort + awakening waves | Growth: progress gained over a trailing window (~3 sim-days), blended with average progress/day since starting |
| **Your Class (同届榜)** — you vs. the people you started with | Your starting cohort (28H), **alive, fallen and ascended**; never ages out | `powerScore`, with a 7-day ▲▼ movement column |

**Your Class board (user, 2026-09-25)** is a private board, not a public ranking, so you can *always* see how you
compare to your wave, long after Rising Dragon eligibility ends.
- **Header line:** "You: #6 of 97 · 12 fallen · 2 ascended · 1 enslaved". The counts include Immortal-era fates
  (24), since a classmate can end up as your slave or your meal.
- **Rows:** name, current stage, sect, status, and relation to you.
  - The fallen and ascended stay listed (greyed, with cause/date), so the board reads as your generation's story.
  - Ascended classmates reappear as live rows once you reach the Immortal Realm (28C).
- **Always shown:** your row, the class top 3, your ±2 neighbours and any ★-pinned classmates.
- **Milestone events:** "You are the first of your class to reach Core Formation!", "Only 20 of your class still
  live.", "Your classmate Lin Xue has ascended."
- **Reincarnation:** the old class is archived as "Class of <past life>" (viewable in the lineage/Ascension Hall),
  and the new life gets a fresh cohort.

- **One shared `powerScore(person)`** function in the engine (stage + stage progress + body tier + techniques +
  gear) is used for the player and NPCs alike, so the comparison is fair. It also replaces ad-hoc power formulas
  in 5B/17D/28I where sensible.
- **Updates:**
  - Positions are recomputed hourly.
  - A yearly (game-year) **"the rankings are published"** event lists notable moves ("Lin Xue rises to #7 on the Rising Dragon
    Ranking!").
  - Aging out of the Rising Dragon Ranking (game-year limit) moves you to its honor roll.
  - After a reincarnation, a new soul is eligible for the Rising Dragon Ranking again: its cultivation age restarts.
- **Consequences of being ranked:**
  - +fame, which feeds sect tier (27C) and recruiter pulls.
  - Duel challenges from people just below you.
  - **Genius hunters** (evil NPCs who target Rising Stars).
  - Sect invitations (on the member path).
  - More believers (on the Deity path).
- **UI:** a Rankings sub-tab in the World tab with three toggles (天榜 / 潜龙榜 / 同届). It opens on **Your Class** by
  default. It shows the top 20, **your row and ±2 neighbours** (always visible), and ▲▼ movement arrows. Clicking
  a name opens the inspector. It must fit the 300 px overlay.
- **Later:** an **Immortal Ranking (仙榜)** for the Immortal Realm population (after 23D), and a Sect Ranking.

- New files: `assets/data/npc-names.js`, `assets/data/npc-personalities.js` (both already planned in 15),
  `assets/data/world-population.js` (band targets, cohort size, wave cadence, encounter rates),
  `renderer/game/world-sim.js` (replaces planned `npc-world.js`), `docs/systems/living-world.md`.
- **Sim (required):**
  - Run the world sim inside `npm run sim`, and teach the bot an encounter stance.
  - Metrics: population per band over time, births/deaths/ascensions per sim-day, cohort survival curve, **player
    rank on all three boards over time** (key fun signals: does a casual player ever crack the Rising Dragon top 10?
    where in the class does each profile land at 50/200/500h?), cohort share of the Heavy tier,
    encounters/h by type, distinct names seen per open hour, **tick cost ms**, world save size.
  - Invariants: no dead person in an active role or on the Heaven/Rising Dragon boards (the Class board keeps them
    by design), cohort Heavy share ≥ 40% while enough classmates live, Heavy-tier count ≤ budget, each band within its
    controller bounds, no name reused for a new person.

---

## Phase 15 — NPC World Simulation

> **Superseded by Phase 28 (Persistent Living World), 2026-09-25.** The trait pool, sect-decision logic and
> player interactions below are kept as Phase 28's starting design. Phase 28 makes every NPC a persistent,
> aging person with morality, memories and simulation detail tiers. Build Phase 28, not this.

The world breathes without you. Other cultivators are rising or falling while you meditate.
Their personalities drive behavior — not scripts, but trait-weighted decision tables.

### 15A — NPC Generation

On new game start, 5–8 NPCs are generated in your starting region, plus 2–3 in distant regions.
More spawn as you reach new cultivation milestones (world grows with your power).

Each NPC has:
- **Name** — generated from region-appropriate name tables (`assets/data/npc-names.js`)
- **Spiritual Root** — rolled same as player, includes alignment inclination
- **2–3 Personality Traits** — drawn from the trait pool
- **Starting Stage** — rolls within ±3 stages of player at generation time
- **Relationship to Player** — starts at 0 (neutral)

**Personality Trait Pool:**

| Trait | Behavioral Rules |
|-------|-----------------|
| Ambitious (野心勃勃) | Seeks most powerful sect available. Will found own sect at Core Formation if not in one. May betray weaker sects for stronger ones. |
| Loyal (忠义) | Stays with first sect joined. Fights for sect even at disadvantage. Never betrays, cannot be bribed. |
| Greedy (贪婪) | Can always be bribed with spirit stones. Prioritizes resource gain. May steal from sects. |
| Righteous (正义) | Only joins positive-alignment sects. Helps players/NPCs in need. Cannot be bribed. Actively opposes Demonic cultivators. |
| Cowardly (怯懦) | Avoids conflict. Flees from wars. Won't duel. Easy to bully but remembers slights. |
| Vengeful (复仇) | Never forgets harm done to them. Waits for power advantage before retaliating. Events reference past wrongs. |
| Curious (好奇心) | Explores ruins and new locations frequently. Shares rare information with allies. May get in trouble. |
| Serene (淡泊) | Cultivates steadily. Not interested in sects unless invited. Makes a calm, reliable ally. |
| Ruthless (冷酷) | Attacks rivals at advantage. Purges weak disciples from sects they control. Highly effective in wars. |
| Compassionate (慈悲) | Heals injured cultivators in events (including enemies). Low alignment change possible even on bad acts. |
| Proud (傲慢) | Refuses to join sects they see as beneath them. Will duel anyone who disrespects them. |
| Humble (谦逊) | Accepts mentorship. Improves faster when in a sect. Good disciple material. |

### 15B — NPC-Sect Decision Logic

Every 4–8 hours (real-time), each unaffiliated NPC runs a sect evaluation pass:

1. List all available sects in their region
2. Filter by alignment compatibility (Righteous trait won't join evil-aligned sects)
3. Score each sect: fame score + personality match score
4. If best score > 60: join that sect
5. If Ambitious and stageIndex ≥ 12 (Core Formation) and no sect has score > 40: spawn **new NPC-founded sect**

NPC-founded sects:
- Automatically named from name tables (Founder's surname + Hall/Pavilion/Sect)
- Start with founder as Sect Master
- Other NPCs can then evaluate and join this sect
- These sects can go to war with player's sect and other NPC sects

### 15C — Player-NPC Interaction

Interactions happen through event choices and a new "World" tab (visible from Foundation Building onward).

**World tab shows:** known NPCs, their current sect, stage, relationship value, last interaction.

**Direct interaction options (cost AP — Action Points, 1 per hour passive regen):**
| Action | AP Cost | Effect |
|--------|---------|--------|
| Send Gift | 1 | +10 Relationship; greedy NPCs get +20 |
| Challenge to Duel | 2 | Combat minigame; winner +prestige, loser −10 Relationship |
| Offer Mentorship | 3 | If relationship > 30 and your stage ≥ their stage+3: +20 Relationship, they advance faster |
| Recruit to Sect | 2 | If relationship > 50 and you have a sect: they evaluate joining |
| Negotiate Alliance | 3 | Requires relationship > 70; sects become allies for wars |
| Denounce Rival (public) | 1 | Target −15 Relationship with all NPCs; you −5 alignment |

**Relationship tiers:**
| Value | Label | Passive Effect |
|-------|-------|----------------|
| > 80 | Sworn Ally (盟友) | Fights in your wars; occasional spirit stone gifts |
| 50–80 | Friend (朋友) | Discounted sect missions; shares event intel |
| 10–50 | Acquaintance (相识) | No passive effect |
| −10–10 | Neutral | No effect |
| −10 to −50 | Rival (对手) | Competes with you in breakthrough events; may recruit against you |
| < −50 | Enemy (仇敌) | Assassination events; sect war ally against you |

**State additions:**
```js
world: {
  npcs: [],           // array of NPC objects
  activeSects: [],    // NPC-founded sects
  actionPoints: 5,    // max 10; +1/hr
  lastApRegen: null,
}
```

**New files:**
- `assets/data/npc-names.js` — region-appropriate name tables (surname + given name pools)
- `assets/data/npc-personalities.js` — trait definitions and decision weights
- `renderer/game/npc-world.js` — NPC simulation tick, sect logic, world tab rendering

---

## Phase 11 — Rival Cultivator & NPC World

### 11A — NPC Rival

> **Folded into Phase 28H (2026-09-25):** the rival is the "Heaven's Chosen" genius from your own region in
> the starting cohort. It is a real persistent person, not a separate system. 11B and 11C are unaffected.

A rival cultivator is procedurally generated at new game start (random name, root, Dao Path).
Their stage advances at ~80% of your own pace.
Events reference them: "Chen Xianyu has broken into Core Formation — the heavens tremble."
Overtaking them: +5% Karma bonus. Being overtaken by them: −5 Karma.

### 11B — Heaven's Will
A hidden Favor meter (0–100, starts at 50). Separate from Karma.
High Favor (70+): event pool weighted toward positive, BT always at least 25%.
Low Favor (<30): Heavenly Tribulation arrives at the next BT, extra lightning wave.
Building Favor: meditate during dawn, win sect wars, help NPCs in events.
Draining Favor: Devil Dao techniques, repeated BT failures, inner demon events.

### 11C — Ancient Scripture Lore
Collectible fragments found in Ancient Ruins expeditions. 12 total.
Each fragment is a short poetic passage about the cultivation world.
Displayed in a Lore tab once collected (hidden tab until first fragment found).
Collecting all 12 grants a unique title and a permanent BT bonus.

---

# M5 — Deep Sect Management

> Roadmap tasks 5.1–5.5.

---

## Phase 27 — Deep Sect Management (宗门管理)

> **Build after 28A–C (roadmap M3).** Disciples, recruiters and candidates are all Phase 28 persons. Building
> recruitment on today's anonymous 5A disciples first would mean building it twice. (This changes the
> 2026-09-25 session-9 suggestion of "27A–C before 28".)

This extends 5A (and later works at Island scale in 26C). The goal is deep, but **idle-first**: every system has
a policy or automation, so manual control is optional depth, not a chore. Today's 5A 3-candidate pool
(15×talent² stones) becomes the "Open Entrance Exam" baseline in 27C.

### 27A — Offices (职位)

Appoint disciples to offices. An office's efficiency = the holder's stage/talent + **personality fit** (28).
A bad fit has consequences: a Greedy Treasurer embezzles, and a Ruthless Discipline Elder raises output but
lowers loyalty.

| Office | Does |
|---|---|
| **Recruiter (招募长老)** | Runs recruitment to your requirements (27B) |
| Grand Elder (大长老) | Runs the sect while you're away/ascended; succession candidate |
| Discipline Elder (执法长老) | Loyalty/order vs. satisfaction trade-off; handles betrayers |
| Treasurer (账房) | Income efficiency; stipends |
| Pill Master (丹师) | Pill Hall output |
| Beast Keeper (御兽师) | Beast Pen / beast XP |
| War Marshal (战堂主) | Sect war power (5B), commands disciples in war |
| Instructor (传功长老) | Disciple progress speed; teaches your doctrine (25) |
| Librarian (藏经阁主) | Technique/Art study speed for disciples |
| Envoy (外交使) | NPC-sect relations, alliances, poaching |

### 27B — The Recruiter & Recruitment Policy *(user request)*

You set **requirements**, and the Recruiter goes out and finds candidates that match:

- **Filters:**
  - minimum root quality and allowed elements
  - alignment range and morality disposition (28A)
  - personality whitelist and blacklist (e.g. "no Greedy, no Cowardly")
  - age range, minimum stage and minimum constitution tier (14)
  - origin region (12)
  - maximum signing cost
- **Throughput and quality:**
  - The Recruiter scouts every N hours (N shrinks with skill and office level).
  - Candidates found per trip = f(recruiter skill, **sect tier** 27C, region population, **policy strictness**).
    A stricter policy finds fewer candidates, but each one is a better match.
- **Admission mode:** auto-admit matches, or queue them for your approval. A notification is sent when a rare
  candidate appears (9B).
- **The recruiter is a person:**
  - A Greedy recruiter can take bribes and slip in off-policy candidates.
  - A Proud one refuses to recruit from Mortal Villages.
  - A Righteous one refuses demonic candidates even if your policy allows them.

### 27C — Manual recruitment & candidate quality *(user request)*

**Sect Tier** (from Fame + Sect Hall level + doctrine/affiliation + war record + region) decides the quality
distribution of *every* recruitment source:

| Sect tier | Name | Candidate root mix | Talent stars | Special constitution |
|---|---|---|---|---|
| 1 | Backwater Hall | Mostly mixed | 1–2 | ~0 |
| 2 | Minor Sect | Mixed/dual | 1–3 | 0.2% |
| 3 | Established Sect | Dual common, pure rare | 2–4 | 0.5% |
| 4 | Renowned Sect | Pure common | 2–5 | 1% |
| 5 | Great Sect | Pure/Heavenly | 3–5 | 2% |
| 6 | Holy Land (圣地) | Heavenly possible | 4–5 | 4% |

| Manual method | Cost / time | Result |
|---|---|---|
| **Open Entrance Exam (开山收徒)** | Cheap, periodic | Many candidates, tier-average quality |
| **Scouting Tour (游历寻徒)** | You leave for hours (like an expedition) | Few candidates, chance of hidden gems above tier |
| **Personal Invitation** | Relationship with a specific living-world NPC (28) | Exactly who you want, if they accept |
| **Rescue / Adopt Orphan** | From events | Low talent roll but very high loyalty |
| **Poach** | Stones + Envoy; relation − with their sect | Take a named disciple from a rival sect |
| **Abduct (掳人)** *(demonic)* | Infamy +, alignment − | Forced disciple (low loyalty) or slave (24B) |

### 27D — Disciple lifecycle (needs 28)

- **Every disciple is a persistent person.** Each has:
  - stage progress, **loyalty**, **satisfaction**, needs (stipend, resources, mentorship)
  - relationships and factions inside the sect
- **Rank ladder:** Outer → Inner → Core → Elder → Successor. Promotions go through **sect trials and
  tournaments**.
- **Life events:** disciples can **defect**, **betray** (stealing from the Vault), marry, die, found splinter
  sects or **ascend** (→ 26F petition).
- **Sect Policies** set the rules: stipend level, discipline strictness, resource allocation (core-favoring vs.
  equal), closed-door cultivation, visitor rules.
- **Succession:** when you ascend, the Grand Elder or a chosen Successor runs the Lower Sect.
- **Capacity:** raise the 5A disciple cap well past 20 at higher Sect Hall levels. The UI needs filters and sorting.

- New files: `assets/data/sect-offices.js`, `assets/data/recruitment.js`, `renderer/game/sect-management.js`;
  extend `docs/systems/own-sect.md` (or split out `docs/systems/sect-management.md`).
- **Sim:** bot sets a sane recruitment policy and appoints offices; metrics: candidates/h by source & tier,
  average disciple quality, defections, office fit.

---

# M6 — Family depth

> Roadmap tasks 6.1–6.4. The **lite** parts of Phases 16 and 18 (marriage via a proposal event, children, heir selection, legacy passives) are built early in **M2** (Phases 30/31 above). This milestone upgrades them to living-world persons. Phase 8 is superseded by 23 + 31.

---

## Phase 16 — Marriage & Family

> **Changed 2026-09-25 (pillars):** a **lite** version (proposal event, spouse/children as minimal person records, heir selection)
> is built in **M2** (see "M2 family (lite)"). This section is the full M6 version on living-world persons. Every
> "real day/week" timer below is converted to **game years** on the Phase 30 clock (e.g. child every ~15–30
> years, adult at 16, remarry after a mourning period in years). "Daily event pool" becomes a normal event-pool
> weight. Timed buffs ("for 7/30 days") become "for N game years".


The cultivation path is lonely by necessity — but it does not have to be walked alone.

### 16A — Courtship

Courtship becomes available once you have an NPC with relationship ≥ 60 and you are both at
Foundation Building or above. Same-alignment proximity is required (can't marry Celestial + Demonic).

**Courtship actions** (all cost AP):
| Action | AP Cost | Romance Gain | Notes |
|--------|---------|--------------|-------|
| Send Spirit Flower (灵花) | 1 | +8 | Costs 3 Spirit Herbs from inventory |
| Share Technique Fragment | 2 | +15 | Gives them a technique scroll (crafted item) |
| Invite to Co-Cultivate | 2 | +12 | +1 stage for them; Qi/s ×1.1 for 1 hour for you |
| Declare Intent (表白) | 3 | Requires Romance ≥ 80 — triggers proposal event | One chance; rejection possible if personality mismatch |

**Proposal can be rejected if:**
- Proud NPC and player stage < their stage
- Righteous NPC and player alignment < 20
- NPC already has a marriage event queued with another NPC

### 16B — Marriage Bonuses

Active while spouse is alive and relationship ≥ 0:

- Spouse's cultivation stage affects your Qi/s: each stage above Foundation Building adds +0.5% Qi/s (max +10%)
- If spouse is in your sect: their resource contribution ×1.5, morale boost for all disciples
- Daily event pool: spouse-flavored positive events (rare technique fragments, crafted gifts)
- Harmony Bonus: when both player and spouse advance a stage in the same week: +10% Qi/s for 7 days

**Complications:**
- Spouse being attacked by an enemy NPC triggers "Protect Spouse" event (combat)
- If spouse is killed in sect war: deep Karma penalty −30, alignment shift −10, but "Grief-Born Resolve" perk: BT chance +8% for 30 days
- Divorce (choice event) costs −20 Karma, ends bonuses; can remarry after 7 real days

### 16C — Children

After marriage, a "Child Event" fires ~once every 14 real days (random roll each day at midnight).

**Child trait inheritance:**
- Spiritual root: weighted blend of both parents' root types. 40% each parent, 20% random mutation
- Constitution: average of both parents' tiers ± 1 (capped at either parent's tier + 1)
- Personality: 1 trait from each parent, 1 completely random
- Alignment inclination: averaged from parents

**Child lifecycle:**
- Infant (0–3 real days): No effect; flavor events ("Your child takes their first steps")
- Young (3–10 real days): Small Karma bonus from family events
- Adult (10+ real days): Can be recruited to sect. Shows in World tab as a named NPC.

**Adult child bonuses (if recruited to your sect):**
- Disciple contribution ×2 vs random disciple (family loyalty)
- May inherit sect mastery after you ascend (Reincarnation): sect "Founding Legacy" title added, buildings stay intact

**Bloodline (Phase 23B):** reincarnating into an adult child carries the family's Bloodline Quality in full,
and the spouse's highest stage feeds bloodline growth. Children are the main way to build the line.

**Orphan player interaction:**
Players born as Orphans (Phase 12) gain a special event chain when they reach relationship ≥ 70 with
any NPC: "Sworn Sibling Bond" (结义). This creates a pseudo-family relationship with all the loyalty
benefits of a Cultivator Lineage family. Orphan players may also adopt a child NPC found in events
(rather than through marriage), at the cost of 20 AP and 30 Spirit Stones.

**State additions:**
```js
marriage: {
  spouseNpcId: null,
  romanceMeter: 0,       // 0–100; only one courtship at a time
  marriedAt: null,       // timestamp
  harmonyStreak: 0,      // days both cultivated
},
children: [],            // array of child NPC ids (subset of world.npcs)
```

**New files:** `renderer/game/family.js` — courtship tick, marriage events, child generation

---

## Phase 18 — Lineage & Heir Inheritance (Family Trees, Legacy Passives)

> **Changed 2026-09-25 (pillars):** the lineage lives **in the slot save** (a slot = a clan, Phase 31A), not in a cross-slot
> `lineage.json`. **18B Legacy Passives are folded into Phase 31** (Ancestral Merit → Clan Legacies). **18C heir
> selection is built in M2** (task 2.6, including the "distant cousin" fallback). 18D–E stay in M6. References to
> "Ascension Hall (Phase 8)" mean the Ancestral Hall (31B).


Each reincarnation (Phase 8) adds a generation to a persistent family tree. The sins and
glories of your ancestors accumulate as passive bonuses — or burdens — on the current cultivator.

### 18A — The Lineage Record

Stored in a separate `lineage.json` file (not per-slot). Survives all reincarnations.

Each generation entry records:
- Cultivator name, spiritual root type, Dao Path chosen, highest stage reached
- Whether they married and had children
- Constitution tier at death/ascension
- Titles earned, special constitution (if any)
- Whether permadeath ended the line

Displayed in the Ascension Hall (Phase 8) as an ASCII tree:

```
  洛明 ─── 洛晨 ─── 洛天
  (Core)    (Nascent)  (YOU)
```

### 18B — Legacy Passives

Computed at new game start from the full lineage record. Applied before the first tick.

| Ancestor Achievement | Passive Granted (stacks, listed caps) |
|----------------------|---------------------------------------|
| Reached Nascent Soul | +0.5% base Qi/s (max +10% from 20 ancestors) |
| Founded a sect | +1% breakthrough chance (max +10%) |
| Earned Tribulation Veteran title | Realm Integrity starting value +5 (max +25) |
| Married and had children | +2 starting Spirit Stones (uncapped) |
| Had a special constitution | 5% chance current cultivator inherits that constitution |
| Chose Devil Dao | +2% Qi/s but −2 starting alignment (stacks) |
| Died in permadeath | "Iron Will" ancestry: BT failure Qi loss −1% per permadeath death (max −15%) |

### 18C — Heir Selection at Reincarnation

> See Phase 23D: heir selection also sets the Bloodline Quality carried forward (family = full, new soul ≈ 25%),
> and a Solitary Lineage Art heir (23E) counts as family.

When you Ascend (Phase 8), before the new game begins, the heir screen fires:

| Option | Condition | Starting Bonus |
|--------|-----------|----------------|
| One of your adult children (Phase 16) | Must exist | Inherits blended root, constitution avg, 1 personality trait from each parent |
| New soul (random) | Always available | No lineage bonus; full spiritual root re-roll |
| Child of a sworn ally NPC | Relationship ≥ 80 with an NPC who has a child | Ally NPC starts at relationship 80 with new character; alliance pre-formed |

### 18D — Family Technique (Bloodline Exclusive)

After 5 complete generations (5 reincarnations with recorded lineage), a "Family Technique" is unlocked.
This technique is unique to your bloodline and cannot be learned by NPCs.

Its properties are generated from the accumulated roots of all ancestors:
- If ≥ 3 fire root ancestors: technique adds Flame Cultivation bonus
- If ≥ 3 sword Dao ancestors: technique adds Sword Intent passive
- If mixed roots dominate: technique grants +15% Qi cap (adaptive root bonus)

The technique grows stronger with each new generation that learns it (not capped).

### 18E — Ancestral Visions

After 3+ generations, deceased ancestors can appear during deep meditation:
- "Ancestral Guidance" (positive): ancestor with highest stage grants +20% Qi/s for 24h
- "Ancestor's Warning" (protective): blocks the next negative random event
- "Blood Debt" (negative if a permadeath ancestor was murdered by an NPC): that NPC becomes a
  hereditary enemy of the lineage, auto-hostile to every future generation

**State additions (lineage.json, outside slot saves):**
```js
lineage: {
  generations: [],            // array of ancestor summary objects
  familyTechniqueId: null,    // generated after gen 5
  legacyPassives: {},         // computed at game load
  bloodDebts: [],             // NPC ids that are hereditary enemies
}
```

**New files:** `assets/data/legacy-passives.js`, `renderer/game/lineage.js`

---

## Phase 8 — Ascension & Reincarnation (New Game+)

> **Changed 2026-09-25 (pillars):** **superseded by Phase 23 + Phase 31.** Dao Seeds are cut (pure multipliers, pillar 3). The Ascension
> Hall becomes the Ancestral Hall (31B), and Sect Legacy becomes the Sect Continuity legacy (31D). The note below is
> kept for history.


> ⚠ **Superseded in part by Phase 23 (23A–C built 2026-09-25):** Ascension is now a chance-based trial driven by
> hidden Bloodline Quality (`attemptAscension()` in game-state.js) — success moves to the `ascension` stage stub
> (Immortal Realms content is 23D, not built yet), failure/death reincarnates as a new soul (no Dao Seeds granted:
> this section's Dao Seeds / Ascension Hall / Sect Legacy mechanics are NOT wired into the new death/reincarnation
> flow yet). Whichever gets built next (Phase 8's cross-save Dao Seeds vs. Phase 23D's Immortal Realms) should
> reconcile the two "what happens after Ascension" ideas rather than building both independently.

When you reach Ascension (stageIndex 22), the game doesn't end — you **Reincarnate**.

**Reincarnation grants Dao Seeds** — permanent, cross-save multipliers:
- Each reincarnation: +1 Dao Seed (max 10)
- Dao Seeds apply on new game start: each seed = ×1.2 to base Qi/s
- Retained across reincarnations: Dao Path choice, any techniques learned above Foundation Building
- NOT retained: stage, spirit stones, equipment, sect rank, beasts

**Ascension Hall** — a new persistent tab visible after first ascension.
Shows: total reincarnations, cumulative stats, Dao Seed count, personal bests.

**Sect Legacy** — the sect you founded persists across reincarnations. Buildings and disciples survive.
Disciples slowly cultivate on their own between sessions.

---

# M7 — The Immortal Era

> Roadmap tasks 7.1–7.12. Phase 23 (A–C built, D–E planned) opens this milestone.

---

## Phase 23 — Immortal Progression: Bloodline, Mortal Peril & Secret Arts

> **Requested 2026-09-25.** Replaces the "Ascension = automatic reincarnation" loop of Phase 8 with a
> *chance-based* Ascension, a post-Ascension Immortal progression, death + reincarnation, and a hidden
> **Bloodline Quality** stat carried down a family line. Also adds studyable **Secret Arts** (rare drops).
> Also answers the QA sim's #1 flag: every profile currently hits a long dead zone after Ascension
> (`npm run sim`). Cross-refs: Phase 8 (superseded parts), 16C (children), 18 (lineage tree / heirs),
> 20A (permadeath), 17 (bosses).
>
> **23A + 23B + 23C built 2026-09-25** (this covers new-soul reincarnation only — no family system exists
> yet, so `carry` is always `BLOODLINE_CARRY_NEW_SOUL`; partner growth term is always 0). See
> `docs/systems/bloodline.md` for state/API/invariants/gotchas. **Not built:** 23D (Immortal Realms content
> — successful Ascension still lands on the old single `ascension` stage stub), 23E (Secret Arts), and the
> "Family hooks" step below. `npm run sim` (2026-09-25, healthy, 0 violations) shows the mechanic working as
> designed — most Ascension attempts fail at low Bloodline Quality, driving 2–5 reincarnations per long run
> — but whether that pacing (often a 30–90h mortal-realm replay per failed attempt) is fun or too punishing
> is an open tuning question — **answered by the pillars (session 12): a life should be 10–20h, see Phase 30 + task 2.4**; re-run the sim with `--set` before changing `ASCENSION_BASE_CHANCE`/
> `ASCENSION_BQ_COEF`/`BLOODLINE_G_SELF` in `assets/data/bloodline.js`.

### 23A — Health & Death (生死)

A body can die. Realm Integrity stays what it is (the stability of your *cultivation*); Health is the body.

- **`health` (0–100)**, displayed as a bar under Integrity. Regenerates slowly (faster while meditating,
  with healing pills, or with a future Art).
- **Damage sources** (first pass): expeditions into zones whose enemy tier outclasses you, failed Heavenly
  Tribulation waves (Phase 7C), inner-demon style events at high realms, sect-war defeats you fought in (5C),
  failed Ascension (23C).
- **Health 0 → death.** A death screen shows the life summary, then **reincarnation** (23D). Normal mode never
  deletes the save line; **Permadeath (20A)** still ends the line with a tombstone.
- **Early death barely grows the bloodline** — growth scales with the highest stage reached (23B), so dying
  as a Qi Condensation disciple is a restart, not a shortcut.
- ~~Optional later~~ **Now core — Phase 30 (session 12):** **lifespan (寿元)** per realm (classic xianxia: if you don't break through before your
  lifespan runs out, you die of old age). Park until the base health loop feels right in the sim.

### 23B — Bloodline Quality (血脉品质)

A **hidden** number (0–100, soft cap) that belongs to the family line, not the save slot. It's stored in the
Phase 18 lineage record.

- **Hidden during play.** It's revealed only on the Ascension decision screen, and in the Ascension Hall /
  lineage tree after the first Ascension attempt. Before that, it only shows through flavor ("Your blood
  stirs faintly…" / "Heaven-blessed blood").
- **Effects:**
  - The main input to **Ascension survival chance** (23C).
  - A **mild Qi/s bonus**: +0.2% per point → up to +20% at 100. It stacks multiplicatively with the others,
    so re-run the sim pacing check after adding it.
- **A brand-new character** (new save / "new soul") starts at **0**.
- **Growth happens only at the end of a life** (death, failed Ascension, or successful Ascension then passing
  on the line). The next generation's value:
  ```
  heirBQ = parentBQ × carry + growth
  growth = G_base + G_self × (yourMaxStage/22)² + G_partner × (partnerMaxStage/22)²
  ```
  - **Reincarnate into your family** (a child from 16C, or an heir from the Solitary Lineage Art, 23E):
    `carry = 1.0` plus a small flat "family" bonus each generation. This is the intended best path.
  - **No family, new soul:** `carry ≈ 0.25`. You keep a sliver ("the Dao remembers you faintly"), but it's
    much weaker, as requested.
  - The squared stage terms make early deaths grow the line very little and late-game lives grow it a lot.
  - The partner term uses **how far your spouse cultivated** (16B NPC stage), so marrying a strong cultivator
    matters. With no partner that term is 0, unless the Solitary Lineage Art applies (23E).
  - Starting values to tune with the sim: `G_base 1`, `G_self 8`, `G_partner 5`, family flat bonus `+1`,
    soft cap 100.

### 23C — The Ascension Trial (飞升劫)

Reaching the peak of Spirit Severing no longer ascends automatically.
- **The Ascension screen** shows the revealed Bloodline Quality, the **survival chance**, and its
  breakdown. The player chooses **Ascend now** or **Keep cultivating**, to wait for more pills or Arts,
  or to secure an heir first.
- **Survival chance** = `base + BQ term + prep`, capped at 0.95 (never certain, like breakthroughs):
  - `base` about 5–10%, so a Bloodline 0 first-generation cultivator almost always fails. That makes the
    first life a "founding ancestor" and gives the multi-generation loop its purpose.
  - `BQ term` goes up to about +60% at BQ 100.
  - `prep` is a smaller slice from preparation: Tribulation Veteran title, full Integrity/Health,
    ascension-grade pills, specific Arts (23E).
- **Success:** you enter the **Immortal Realms** (23D). The mortal line continues through your heir later if
  you choose.
- **Failure:** the body dies (health → 0). You reincarnate (23D rules), and the line's BQ grows from this life.

### 23D — Reincarnation & the Immortal Realms

**Reincarnation screen** (extends 18C Heir Selection):

| Option | Condition | Bloodline carried |
|---|---|---|
| Reincarnate into your family | An adult child (16C) or a Solitary-Lineage heir (23E) exists | Full (`carry 1.0` + family bonus) |
| New soul | Always | Weak (`carry ≈ 0.25`) |

What carries over otherwise follows **Phase 31** (Ancestral Merit, Clan Legacies, ancestral catch-up; Dao Seeds cut), which will need rebalancing
alongside this.

**Immortal Realms (post-Ascension progression)** give the endgame instead of an empty Ascension:
- New realm ladder, e.g. Earth Immortal (地仙) → Heavenly Immortal (天仙) → Golden Immortal (金仙) →
  Taiyi Golden Immortal (太乙金仙) → Daluo Golden Immortal (大罗金仙). Each has 3 layers, its own Qi cap
  scale, and its own art/sprite states. New sprite states go through the Asset Pipeline.
- ~~Uses the same Qi loop~~ **Changed 2026-09-25:** Immortal stages fill with **Immortal Essence**. Passive Qi
  only trickles in (~5–10%). Real growth comes from the chosen **Immortal Path** (Phase 24: enslave / devour /
  faith / righteous devouring). The Bloodline bonus still applies. Immortal breakthroughs can carry small health
  risk, so dying and reincarnating stays possible at every level.
- An Immortal can **watch over the family line**: small passive boosts to the current generation. This gives
  a reason to keep the old immortal save meaningful.
- Pacing target: the Immortal era is where long play belongs (pillar 1), so pace it by Immortal Path activity rather than raw idle days. Add the new realms to
  `PACING_TARGETS_MIN` in `scripts/sim/profiles.js` when built.

### 23E — Secret Arts (秘术)

A second kind of learnable power, separate from Techniques (which are bought with stones). You **find**
Arts and **study** them.
- **Sources:**
  - Rare drops from high-tier expedition enemies (e.g. about 0.5–2% per expedition at enemy tier ≥ 3, on a
    new `rareDrops` entry in `LOCATIONS`).
  - Guaranteed/likely drops from **bosses**. The full version needs Phase 17 realm bosses, but a small
    earlier stand-in could be a rare "Boss appears" event on Heavenly Peak / Void Rift expeditions.
- **Studying:** one Art at a time on a real-time study timer (hours to days). It's sped up by
  **Comprehension**: `s.comprehension` already exists in state (Heavenly Insight events raise it) and is
  otherwise unused today. Arts have mastery levels 1–5 (re-study to deepen).
- **Inheritance:** a studied Art can be written into the **family library**. Heirs who reincarnate into the
  family can re-study it faster; new souls can't.
- **Launch set (examples, all rare):**

| Art | Effect |
|---|---|
| **Solitary Lineage Art (孤脉血嗣诀)** | Lets you **produce an heir from your own essence, with no partner**, to continue the family bloodline. The heir counts as family (full `carry`), and the partner growth term is replaced by ~50% of your own stage term: better than no family, weaker than a strong spouse. |
| Tortoise Breath Art (龟息功) | Health regen ×2; once per life, survive a lethal blow at 1 health |
| Heaven-Evading Art (避天诀) | +Ascension survival chance (by mastery) |
| Blood Refinement Art (炼血诀) | +bloodline growth for this life (by mastery) |
| Ten Thousand Swords Art (万剑诀) | Lets you safely fight one enemy tier higher on expeditions (less health damage) |

### 23 — Build order, state, sim

Suggested sub-phase order:
1. **23A** (Health & Death).
2. **23B + 23C + new-soul reincarnation.** This is playable without any family system. Do it right after
   Phase 7 (it needs Tribulation) or even before, since it fixes the post-Ascension dead zone.
3. **23D** (Immortal Realms).
4. **23E** (Secret Arts; the boss stand-in first).
5. **Family hooks** (reincarnate-into-child, partner term) once Phase 16 exists.

**State (sketch):**
- **Slot state:** `health`, `_healthRegenAcc`, `arts: { known: {id: mastery}, studying: {id, endsAt} }`,
  `immortalStage` (or extend `stageIndex` past 22).
- **Lineage record (18A, cross-slot):** `bloodlineQuality`, `generation`, `familyLibrary: [artId]`,
  `heirs: [...]`.
- Add a new `_ensurePhase23Fields()` for save migration (Rule 5).
- The cross-slot lineage file needs a new `window.electron.*` method in **both** `preload.js`/`main.js` and
  `renderer/engine/platform-storage.js` (Rule 7 / iOS).

**New files (expected):**
- `assets/data/arts.js`
- `assets/data/immortal-realms.js` (or rows appended to `stages.js`)
- `assets/data/bloodline.js` (growth/survival constants)
- `renderer/game/arts.js` (study timer)
- `renderer/game/ascension.js` (trial + reincarnation flow)
- `docs/systems/bloodline.md` (write it **before** code, Rule 6)

**QA sim (required, same change):**
- Teach `scripts/sim/bot.js` to decide Ascend-vs-wait (e.g. ascend when survival ≥ a threshold, otherwise
  keep farming prep) and to study Arts.
- Handle death/reincarnation as a run *continuing across generations*. Runs will need longer horizons (500h+).
- Add metrics: ascension attempts & survival rate, deaths by cause, generations per run, BQ per generation,
  time-to-first-Immortal.
- Add invariants: BQ within 0–cap, never lower after a family reincarnation, health within 0–100,
  survival chance ≤ 0.95.

**Open questions — resolved 2026-09-25 for 23A–C:**
1. ✅ Survival chance curve/cap: proposed formula used as-is (base 7% + up to +60% at BQ100, cap 95%) —
   pending a re-tune pass with `npm run sim` (see build note above).
4. ✅ Lifespan (寿元): parked in 23A–C. **Now Phase 30 (M2), with age passing only while the game is open.**

**Still open — needed before 23D/23E:**
2. *(M2 interim: a successful Ascension becomes an **Ascended Ancestor** and play continues with the heir, Phase 31F.)* Should successful Immortals also be able to have heirs? Should players keep playing the Immortal while the
   heir plays, or switch between them? — user's initial lean (2026-09-25): keep playing the same Immortal
   character, with the Immortal optionally supporting/watching over an heir, rather than switching control.
3. How long should studying an Art take (hours vs days)? Should Arts be lost on a new-soul reincarnation?
5. Does the Solitary Lineage Art need a cost or drawback (e.g. health/lifespan, or a lower-quality heir)?

---

## Phase 24 — Immortal Paths: Virtue & Demon Dao (仙道 · 魔道)

Needs: 23D (Immortal realm ladder), 28 (the beings you bless, enslave or devour are real tracked NPCs),
13 (alignment gates the paths).

### 24A — Immortal Essence (仙元) & choosing a Path

- **Immortal Essence** replaces Qi as what fills an Immortal stage (Earth Immortal L1 → … → Daluo Golden
  Immortal, per 23D). Passive Qi still trickles in and converts to Essence, but only about **5–10%** of the
  pace a Path gives. An idle Immortal is never frozen, but real growth comes from playing a Path.
- **Path choice** happens on the first Immortal breakthrough screen. Which Paths are offered depends on alignment:

| Path | Alignment needed | Core loop | Playstyle |
|---|---|---|---|
| **Tyrant (魔君 · 奴役)** | ≤ −30 | Capture beings as slaves who produce Essence and labor | Managerial, empire of fear |
| **Devourer (噬道 · 吞噬)** | ≤ −30 | Absorb lesser mortals/cultivators/immortals, good *or* evil | Burst growth, high risk |
| **Celestial Deity (神道 · 信仰)** | ≥ +30 | Followers donate faith & gifts; you bless them; their progress pays you back | Patient, network growth |
| **Heaven's Executioner (诛魔 · 净噬)** | ≥ 0 | Devour *only* evil beings; Heaven purifies the corruption | Hunter, bounty-board |

- **Neutral (−30…+30)** can pick any Path. Each Path then pulls alignment toward itself over time.
- **Paths are not locked at first. The lock comes from use** *(decided by user, 2026-09-25)*:
  - Each method has its own **Path Mastery (0–100)**, earned only by *using* it (enslaving, devouring, blessing,
    executing). Early on you can dabble in any method your alignment allows, and switch freely.
  - **Point of No Return (道心已定 — "the Dao Heart sets"):** the first method to reach mastery **60** (tunable)
    becomes your **locked primary Path for the rest of this life**.
    - A warning event fires at **45** ("Your Dao heart begins to harden…").
    - A confirmation card appears just before crossing 60. It is the only irreversible choice besides Ascension
      itself.
  - **After the lock:**
    - The other method on the *same side* stays usable as a **secondary** at about 50% efficiency. Examples: a
      Tyrant can "harvest" (devour) its slaves; a Deity can execute demons.
    - Methods from the *opposite* side are sealed.
    - Only death/reincarnation (23A/23D) resets the lock.
- **Changing sides before the lock:**
  - **Falling** (virtue → demon) is fast. One devouring of an innocent, or alignment crossing −30, triggers it.
    Most faith followers abandon you, and a few zealots turn Vengeful (28).
  - **Redemption** (demon → virtue) is slow. It needs a **Heart Tribulation** trial (health risk, 23A), freeing
    or releasing all slaves, and a long stretch of penance. Freed slaves remember you (28E memories).
  - Mastery earned on the side you left **decays** over time, so you can't sit at 59 in two opposite methods.

### 24B — Tyrant: Enslavement (奴役)

- **Capture targets** come from the living world (28): mortals, cultivators and lesser Immortals. You find them
  by raiding regions and NPC sects, by conquering enemies in sect/island wars, or by buying them from slavers.
- **Capture chance** = f(your power ÷ target power, target *courage/willpower* traits, **Soul-Binding Seals**
  crafted item).
- **Each slave is still a tracked person**, with two extra meters:
  - **Fear (畏)**, raised by Soul Seal buildings, punishments and your realm gap.
  - **Resentment (怨)**, raised by hard assignments, deaths of their kin, and time.
- **Assignments:**
  - **Labor:** island building upkeep, mines, herb fields.
  - **Soldiers:** war power.
  - **Essence Cattle:** they are drained for Essence, which is fast. It also damages their health, and they can
    die from it.
- **Risks:**
  - **Revolt** when Resentment > Fear. It can be a local uprising or an island-wide one.
  - **Escapes:** escaped slaves become Vengeful NPCs.
  - **Infamy (恶名):** it rises with slave count and triggers **Righteous Crusades**, where NPC sects and virtuous
    Immortals (28) attack you.
  - **Retaliation:** the victims' kin and sect-mates remember what you did.

### 24C — Devourer: Absorption (吞噬)

- **Devour a being** to gain a one-time Essence burst. The amount is `E_realm[target realm] × quality(root,
  bloodline, constitution)`. Absorbing an Immortal is worth orders of magnitude more than a mortal.
- **Impurity (杂质):** each absorption leaves impurity that must be refined on a real-time timer before the next
  one is fully efficient. This stops "farm 10,000 mortals" from being optimal and pushes you toward risky big
  targets.
- **Corruption (魔染, 0–100):**
  - It scales Essence gain up.
  - It drains Integrity (3A).
  - At high values, **Heart Demon Rampage** events can make you lose control, for example devouring a disciple
    or smashing a building.
- **Stolen gifts:** absorbing a strong root gives a temporary affinity (fire-root Immortal → fire Essence bonus).
  Absorbing someone who knows a Secret Art (23E) gives a chance to learn a fragment of it.
- **Heavenly Retribution:** Infamy also attracts **Immortal hunters** (Executioner-path NPCs, 24E, who hunt *you*)
  and extra tribulation lightning.

### 24D — Celestial Deity: Faith (神道)

- **Believers:** you gain them through shrines, answered prayers and miracles, and through blessed NPCs spreading
  your name.
  - **Notable believers** are real tracked people (28).
  - The **mass of mortal worshippers** is a per-region *count*, not individuals. Tracking millions of mortals
    would be impossible, so this is the one place the world is statistical. See 28B.
- **Faith (信仰力):** believers produce Faith per hour × **Devotion**. Faith converts to Essence and pays for
  blessings. **Gifts / offerings:** stones, herbs and items are donated at shrines, in amounts that scale with
  believer wealth.
- **Blessings** are spent on a specific tracked NPC or on a region:

| Blessing | Target | Effect |
|---|---|---|
| Bless Cultivation | NPC | Their stage progress ×1.5–3 for N days |
| Bless Breakthrough | NPC | +BT chance on their next breakthrough |
| Guardian Ward | NPC / sect | Protects in wars/duels; can save them from death once |
| Bless Harvest / Fortune | Region | More believers, more gifts |
| Miracle | Region | Big Devotion spike, spreads worship to a new region |

- **Return on blessings:** when a **blessed follower progresses** (breakthrough, founds a sect, wins a war, reaches
  a realm, **ascends**), you receive a reward: a Faith burst, a tithe gift, and your worship spreading through
  their sect and relations.
  - A follower you blessed many times can become a **Saint (圣徒)**, who preaches and grows believers on their own.
  - Blessed followers who ascend petition to join your Island as **Divine Attendants** (26F).
- **Prayers:** small request events ("A farmer in the Frontier prays for rain"). Answering one grows Devotion;
  ignoring it slowly erodes Devotion. It stays idle-friendly because Doctrine (25) can set **auto-answer rules**.
- **Risks:**
  - Followers die or are harmed while under your protection (−Devotion).
  - **Rival deities** (virtuous NPC Immortals, 28) compete for regions.
  - Demonic Immortals raid your believers.

### 24E — Heaven's Executioner: Righteous Devouring (诛魔)

- Uses the same devour mechanic as 24C, but only on beings with alignment ≤ −30. Devouring anyone else counts as a
  **Fall** (24A).
- **Corruption decays by itself** (Heaven purifies it), and each kill earns **Heavenly Merit (功德)**. Merit gives a
  BT bonus, Tribulation protection and Faith if you also run the Deity Path.
- **Bounty Board:** demonic NPCs, demonic Immortals and slaver sects from the living world are listed with a
  reward. The targets fight back, with real health risk (23A).
- **Investigate (查):** some targets are disguised demons, and some are *framed* innocents. Investigating costs
  time and reveals true alignment. Devouring a framed innocent by mistake still counts as a Fall. This is what
  makes the Path a moral puzzle and not just a filter.

### 24F — State sketch & sim

```js
immortal: {
  path: null,               // 'tyrant' | 'devourer' | 'deity' | 'executioner'
  secondaryPath: null,
  essence: 0,
  corruption: 0, impurity: 0, infamy: 0, merit: 0,
  faith: 0, devotion: 0, believers: { [regionId]: count }, saints: [personId],
  slaves: [personId],        // person records live in the world store (28), not duplicated here
  blessings: [{ personId, type, endsAt }],
}
```
- New files: `assets/data/immortal-paths.js`, `renderer/game/immortal-path.js`, `docs/systems/immortal-paths.md`.
- **Sim:** one bot policy per Path (`--path=tyrant|devourer|deity|executioner`); metrics: Essence/h by source,
  revolts, crusades, falls, faith per believer, blessed-NPC progress; invariants: meters within 0–100, no devour
  of alignment > −30 on Executioner without a Fall being recorded, slaves ⊆ living persons.

---

## Phase 26 — Immortal Island (仙岛)

The own-sect system (5A) at Immortal scale. You claim a floating island in the Immortal Realm and build it up
from a single peak into a domain. It unlocks at Earth Immortal. Your mortal sect keeps running below as the
island's **Lower Sect (下宗)**, which feeds it talent.

### 26A — Island tiers & map

| Tier | Name | Plot grid | Resident cap | Unlock |
|---|---|---|---|---|
| 1 | Islet (仙屿) | 6×6 | 10 | Earth Immortal |
| 2 | Floating Isle (浮岛) | 8×8 | 30 | Heavenly Immortal + Island Core Lv2 |
| 3 | Archipelago (群岛) | 11×11 | 80 | Golden Immortal |
| 4 | Celestial Fragment (天陆残片) | 14×14 | 200 | Taiyi Golden Immortal |
| 5 | Immortal Domain (仙域) | 18×18 | 500 | Daluo Golden Immortal |

- The island is shown as an **ASCII plot grid** in the Island tab (reuse the grid approach planned for 17A).
  Buildings occupy plots.
- **Adjacency bonuses** (e.g. Herb Terrace next to Spirit Spring) give the layout meaning. Keep them simple:
  one bonus rule per building.
- Every building levels 1–5.

### 26B — Buildings (~30, grouped)

| Group | Buildings |
|---|---|
| **Core** | Island Core (岛心 — tier gate), Immortal Palace (仙宫 — your seat, Essence +), Warehouse Vault, Grand Array (护岛大阵 — island defense) |
| **Cultivation** | Spirit Spring, Dao Contemplation Peak, Tribulation Platform (safer Immortal BTs), Secret Arts Pavilion (23E study speed), Closed-Door Caves (resident cultivation) |
| **Production** | Immortal Herb Terrace, Star-Iron Mine, Artifact Forge, Grand Alchemy Furnace, Beast Sanctuary (beast cap +, beast realms), Spirit Tree Orchard |
| **Knowledge / Doctrine** | Scripture Library (25 scriptures), Doctrine Hall (tenet slot +1 at Lv5), Observatory (sees world events early — 19 epochs) |
| **Faith (virtue)** | Grand Temple (Faith ×), Prayer Bell Tower (auto-answer capacity), Saint's Hall (saint cap), Pilgrim Gate (believers visit → gifts) |
| **Dominion (demon)** | Soul-Binding Pagoda (slave Fear cap), Slave Pits (labor cap), Essence Refinery (cattle yield, kills faster), Blood Pool (Impurity refine speed), Devouring Altar |
| **Military** | Immortal Barracks, War Beast Roost, Sky-Ship Dock (raids / island wars), Watchtowers |
| **Residences** | Immortal Pavilions (resident cap), Attendant Quarters, Guest Pavilion (envoys, alliances) |
| **Wonders (1 each)** | Heaven-Touching Pillar, Nine-Dragon Pagoda, Mirror of Samsara (see a past life — lineage 18) |

- Virtue-only and demon-only buildings lock by Path (24). Buildings from the other side can't be built, or run at a
  penalty for a secondary Path.

### 26C — Residents & management

- **Residents** are tracked persons (28): ascended disciples, recruited or allied Immortals, Divine Attendants
  (24D), slaves (24B) and mortal servants (count).
- **Island offices** use the Phase 27 office system at island scale: Steward, Envoy, Grand Marshal, Master
  Alchemist, High Priest (Deity) or Overseer (Tyrant).

### 26D — Island conflict

- **Other Immortals' islands** exist in the living world (28).
- **Island Wars** use the same phase-machine pattern as 5B/5C but last longer. Raids come by Sky-Ship.
- **Crusades** (24B Infamy) and **Rival Deities** (24D) arrive as war triggers.
- **Alliances and vassal islands** are handled through the Guest Pavilion.

### 26E — Lower Sect link

Your 5A/27 sect is the island's talent pipeline. Promising disciples get a "Called to the Island" track, and
island buildings boost the Lower Sect.

### 26F — Ascension Petitions (飞升投奔) *(user request)*

When anyone connected to you **ascends**, they send a petition to join you. That includes your own sect's
disciples, a friendly or allied NPC, and a follower you blessed. NPC Ascension Trials are simulated by 28C.

| Choice | Result |
|---|---|
| **Accept** | Joins as a resident Immortal; loyalty seeded from how you treated them as a disciple/ally (28E memories) |
| **Decline** | They wander the Immortal Realm; relationship − |
| **Enslave / Devour** *(demonic — confirmed allowed by user 2026-09-25)* | Big Essence/labor gain; huge betrayal memory spread to their friends & your sect (loyalty crash) |

- Petitions that arrive **before you have an island** wait in a Petitioners queue, or serve as personal retainers
  with a small bonus.
- A disciple who was treated badly may **refuse to petition**, or ascend and join a rival.

- New files: `assets/data/island-buildings.js`, `renderer/game/island.js`, `docs/systems/immortal-island.md`.
- Sprites: island map tiles, building glyphs, Immortal sprite states → **Asset Pipeline** (≥ 8.0).

---

## Phase 25 — Doctrine (道统)

An Immortal's teaching, written by the player. It spreads across the world and shapes everyone who follows it.
It unlocks at the first Immortal stage and is the long-term "tech tree" of the Immortal era.

- **Doctrine = a name + Tenets.** Tenet slots grow with realm: 2 at Earth Immortal, up to 7 at Daluo. Each tenet
  comes from a pool, is tagged **Virtue / Demon / Neutral** plus a domain (Cultivation, Faith, Dominion, War,
  Knowledge, Harmony), and levels up 1–3 using **Enlightenment (悟道点)**. Enlightenment is earned from Path
  actions and `s.comprehension`.
- **Who a doctrine affects:** you, your Island residents, your sect's disciples, believers, and **NPC sects that
  adopt it** (28).
- **Spread:** each region tracks Doctrine Influence. NPCs adopt or resist a doctrine based on how well it fits
  their personality and morality. Righteous NPCs resist demonic tenets. Enough influence in an NPC sect makes it
  an **affiliated sect** (it pays tribute and sends recruits).
- **Doctrine Integrity & schism:** acting against your own tenets lowers Doctrine Integrity. Examples: a "Mercy"
  tenet while devouring, or a "Freedom" tenet while keeping slaves. At a low value, a **schism event** fires:
  some followers break off and found a **heretic sect** led by a real tracked NPC, which becomes a rival.
- **Scriptures:** craft scripture items (Library building, 26) that teach the doctrine faster in a region.
- **Orthodoxies:** specific tenet combinations unlock a named Orthodoxy with a bonus. Example: Mercy + Harvest +
  Communion → "Way of the Thousand Hands".

| Example tenet | Tag | Effect |
|---|---|---|
| Mercy (慈悲) | Virtue | +Devotion; blessings cost −20%; conflicts with Devour |
| Heaven's Order (天序) | Virtue | Believers auto-answer small prayers; −Infamy decay |
| Diligence (勤修) | Neutral | Followers' cultivation +15% |
| Strength Is Truth (强者为尊) | Demon | Slave Fear +20; soldiers +power; −Devotion |
| Eternal Hunger (永饥) | Demon | Devour Essence +25%; Impurity refines faster; Corruption +more |
| Hidden Blade (藏锋) | Neutral | Infamy grows 30% slower |
| Open Gates (广纳) | Neutral | Recruiter candidate volume +, quality − (27) |
| Communion (同心) | Virtue | Saints generate believers faster |
| Chains of Heaven (天锁) | Demon | Revolt threshold +15 |
| Scholar's Path (问道) | Neutral | +Enlightenment; Library output + |

- New files: `assets/data/doctrine.js`, `renderer/game/doctrine.js`, `docs/systems/doctrine.md`.

---

# M8 — World flavor & polish

> Roadmap tasks 8.1–8.7.

---

## Phase 19 — World Epochs & Spiritual Tides (Dynamic Global Modifiers)

> **Changed 2026-09-25 (pillars):** **game time, not the real calendar.** Tides rotate on the Phase 30 clock (e.g. one tide per ~10 game
> years), and **epochs change between generations**. The heir screen announces "the age your heir is born into",
> so each life has its own weather, and a long-lived character may see one shift mid-life. Durations below written
> as "days" read as game-year spans. "Fire daily" becomes "fire often". Offline catch-up notes about epochs are
> dropped, since game time doesn't pass offline.


The cultivation world breathes on grand cycles. A 7-day elemental tide rotates daily.
World Epochs — longer cataclysmic periods — reshape the strategic landscape for days at a time.
Both apply globally: to you, to NPCs, to sects.

### 19A — Spiritual Tides (7-Day Cycle)

One element dominates each day (cycle repeats):

| Day | Tide | Cultivator Bonus | World Effect |
|-----|------|-----------------|--------------|
| 1 | Fire (炎) | Fire root Qi/s ×1.5; Volcanic Immersion XP ×2 | Fire enemies stronger (+30% HP), drop more |
| 2 | Water (水) | Icy Waterfall bonus; water-aligned events more common | Rain visual on canvas background |
| 3 | Metal (金) | Iron Ore drops ×2; weapon craft speed ×1.5 | Frontier region expedition yield ×1.5 |
| 4 | Wood (木) | Herb drops ×2; Life Dao bonuses | Constitution tempering XP ×1.3 |
| 5 | Earth (土) | Qi cap ×1.1 (earth root); sect building costs −20% | NPC sects build faster |
| 6 | Lightning (雷) | BT chance +5% all; Tribulations +1 wave | Tribulation weather: storms on canvas |
| 7 | Void (虚) | Rare — ~once per 14 days instead of every 7. All hidden locations accessible; Void Devourer ×3 | NPC sect wars more likely during Void tide |

Tide shown in Stats tab with a glyph indicator and time remaining until shift.

**Celestial Calendar** (crafted item from Ancient Scripts): shows the next 3 upcoming tides —
makes timing breakthroughs around Lightning Tide a meaningful strategy.

### 19B — World Epochs (30-Day Rotation)

Longer periods that reshape global conditions. Sequence is deterministic per save seed but varied
enough to feel organic. Announced via event log header: bold, gold-colored.

| Epoch | Duration | Global Effect |
|-------|----------|---------------|
| Age of Strife (乱世) | 7 days | Sect wars 2× more frequent; resource drops +30%; BT chance −5% |
| Golden Age (盛世) | 14 days | All Qi/s ×1.2; NPC relationship gains +50%; no sect wars trigger |
| Demon Tide (魔潮) | 5 days | Expedition enemies +50% stronger; demon drops ×3; all cultivators lose −2 alignment/day |
| Heavenly Opening (天门开启) | 3 days | BT chance +15%; ascension attempts can trigger one stage early; all tempering XP ×2 |
| Spiritual Drought (灵气枯竭) | 7 days | Qi/s ×0.7; spirit stone costs +50%; constitution tempering XP halved |
| Ancestor's Return (先祖归来) | 4 days | All lineage passives doubled; ancestral vision events fire daily |
| The Silence (虚寂) | 2 days | No events fire; no sect wars; Qi/s ×0.5. Rare — but constitution tempering XP ×5 |

Epoch transitions fire a special full-width event log message in gold. Players who are offline when
an epoch begins receive a catch-up note in the offline re-entry event ("You returned during the
Heavenly Opening — the heavens granted X bonus Qi").

### 19C — Strategic Interaction

Tides and Epochs stack. A Lightning Tide during a Heavenly Opening means BT chance +20% — the
highest possible natural window for a breakthrough. A Spiritual Drought + Void Tide creates a
paradox of low Qi but high accessibility — ideal for tempering rather than cultivation.

NPCs respond to epochs: during Golden Age, ambitious NPCs pause sect-founding plans. During Demon
Tide, evil-alignment NPCs gain confidence (relationship aggression increases).

**State additions:**
```js
worldState: {
  currentEpoch: null,
  epochEndsAt: null,
  currentTide: 'fire',
  tideChangesAt: null,
  celestialCalendarOwned: false,
}
```

**New files:** `assets/data/epochs.js` — epoch and tide definitions; `renderer/game/world-state.js` — epoch tick, tide rotation, canvas overlay effects

---

## Phase 17 — Secret Realm Dungeons (ASCII Map Grid Exploration, Timed Events)

Secret Realms are unstable dimensional pockets that tear open near regions of dense Qi.
Unlike expeditions (which are idle timers), entering a realm replaces the main canvas with a
navigable ASCII grid — the most active, real-time gameplay in the game.

### 17A — Realm Map

The canvas view switches to a grid layout when a realm is entered. Map is rendered as ASCII characters:

```
  ░░░░░░░░░░░░░░░
  ░ ? ─── T   E ░
  ░ │         │ ░
  ░ S ─── P ─── B ░
  ░     │       ░
  ░ E ─── ?     ░
  ░░░░░░░░░░░░░░░
```

Cell legend (revealed as player explores; `?` = fog of war):
| Symbol | Room Type |
|--------|-----------|
| `P` | Player position |
| `·` | Empty corridor |
| `T` | Treasure room |
| `E` | Enemy room |
| `S` | Spirit shrine (restores Qi/HP) |
| `B` | Boss room (one per realm) |
| `!` | Trap room |
| `∆` | Puzzle room |
| `─ │` | Corridor connections |
| `?` | Unexplored (fog of war) |

Navigation: four directional buttons rendered below the canvas (or keyboard N/S/E/W arrows).
The cultivator's sprite is replaced by the map while inside; particles still run in the background.

### 17B — Realm Tiers

| Realm | Min Stage | Grid | Timer | Boss |
|-------|-----------|------|-------|------|
| Ancient Ruins (古遗迹) | Qi Condensation L3 | 6×4 | 15 min | Ruin Guardian (rank 2) |
| Demon Cavern (妖魔窟) | Foundation Building L1 | 8×5 | 20 min | Demon Lord Fragment (rank 3) |
| Celestial Grotto (仙人府) | Core Formation L1 | 10×6 | 25 min | Fallen Celestial (rank 4) |
| Void Tear (虚空裂缝) | Nascent Soul L1 | 12×8 | 30 min | Void Sovereign (rank 5) |

Realms are discovered through:
- Expedition drops (a "Realm Key" consumable item)
- Rare random event ("A rift tears open nearby — enter now or it closes forever")
- Crafting: Void Compass artifact (Phase 2) passively reveals hidden realms

### 17C — Timed Events Inside Realms

Dynamic events fire mid-run to keep the player engaged:

| Event | Trigger | Effect |
|-------|---------|--------|
| Collapse Warning | 50% cells explored | "The realm destabilizes — escape in 2 minutes!" Urgency timer overlay |
| Spirit Beast Pursuer | Random at 30% explored | A pursuer `X` moves toward player each turn; reach B or S to shake it |
| Formation Flare | Random, once per realm | All fog-of-war revealed for 60 seconds |
| Qi Surge | Near a Shrine | Adjacent rooms' loot quality upgraded for this visit |
| Ancestor Echo | If player has 3+ lineage generations | A ghostly `A` appears and opens a sealed room |

### 17D — Room Outcomes

**Enemy Room:** Auto-resolve using `playerPower = stageIndex × 10 + bodyTier + weapon bonus`.
If power > enemyHP: win, drop loot. If power < enemyHP: lose 20% Qi, can retry or flee (flee costs 5 min from timer).

**Puzzle Room:** 3-option riddle drawn from `realm-puzzles.js`.
- Correct: bonus loot + 3 min added to timer
- Wrong: trap fires (−15% Qi) + 1 min removed

**Boss Room:** Special animation plays (boss ASCII sprite on canvas, aura rings). Win = realm cleared bonus. Defeat = ejected from realm, keep all loot collected so far.

**State additions:**
```js
secretRealm: {
  active: false,
  realmId: null,
  mapGrid: null,     // 2D array of cell objects
  playerPos: [0, 0],
  endsAt: null,
  loot: [],
  pursuerPos: null,
}
```

**New files:**
- `assets/data/realm-maps.js` — realm tier definitions, loot tables, puzzle pool
- `renderer/game/secret-realm.js` — grid renderer, navigation logic, timed event scheduler

---

## Phase 6 — Animation Overhaul

### 6A — Particle System Enhancements
- Bezier-curved Qi streams flowing toward cultivator
- Realm-specific particles: fire sparks, water droplets, lightning arcs, void static
- Aura rings with ripple timing tied to sprite fps

### 6B — Sprite Enhancements
Expand all sprites to 4+ frames. Add per-sprite micro-movements:
- Breathing sway (±1 char left/right per cycle)
- Eye blink frame (injected every 3–5 seconds by renderer)
- Hair/robe ripple frame
- Stage transition: dissolve/wipe between sprite states
All new frames must pass the Asset Pipeline (≥8.0).

### 6C — Event Animations
- BT success: flash → burst → ring cascade → color shift to new stage color
- BT failure: red flash → particle implosion → Integrity bar shake
- Realm Demotion: screen tremor + downward spiral particle

### 6D — Background Ambience
| Realm | Canvas background behavior |
|-------|---------------------------|
| Mortal | Faint dust motes |
| Qi Condensation | Blue Qi wisps drifting upward |
| Foundation Building | Misty rolling tendrils |
| Core Formation | Slow golden rotating halo |
| Nascent Soul | Stars drifting outward |
| Spirit Severing+ | Void rifts — animated cracks in the background |

### 6E — Window & Layout Modes

The player can choose how the game sits on their screen. Mode is stored in `settings` (persists across sessions) and can be changed any time from the titlebar.

**Four modes:**

| Mode | Description | Window Size | Always-on-top |
|------|-------------|-------------|---------------|
| Overlay (default) | Narrow side-panel, current behavior | 300 × 700 px | Yes |
| Expanded | Wider panel; two-column tab layout, more content visible at once | 480 × 800 px | Yes |
| Desktop | Full resizable window, standard OS chrome, taskbar presence | 700 × 900 px min | No |
| Banner | Horizontal strip pinned to top or bottom of screen; sprite left, key stats right, no tabs — just the essentials at a glance | Full screen width × 120 px | Yes |

**Banner mode specifics:**
- Shows: sprite (40×80 canvas), cultivation stage label, Qi bar, Qi/s, spirit stones, active expedition timer (if running), breakthrough button when ready.
- A small ⬡ icon on the right edge opens the full window (Overlay mode) as a floating popup for tab access without switching modes.
- Spirit stone and Qi values auto-format via `fmt()` to stay readable at small size.

**Expanded mode specifics:**
- Two-column layout: left column = canvas + stats, right column = active tab content.
- Tabs become a compact icon row at the top of the right column instead of the full-width tab bar.
- All existing tab content reflows; no content is hidden that isn't hidden in Overlay.

**Implementation notes:**
- Mode switching resizes the Electron window via `window.electron.setWindowSize(w, h)` IPC call — add to `preload.js` + `main.js` and the iOS shim in `platform-storage.js` (shim = no-op since iOS is always full-screen).
- CSS: add a `data-layout` attribute on `<body>` (`overlay` / `expanded` / `desktop` / `banner`). All layout variants are CSS-only off that attribute — no JS branching in render functions.
- Banner mode hides `#app` tabs and renders a `#banner-strip` element instead. The canvas is resized to 40×80 for banner; full-size for all other modes.
- Existing 300px-wide styles stay as the `[data-layout="overlay"]` baseline; don't delete or break them.

**State additions:**
```js
settings.layoutMode: 'overlay',   // 'overlay' | 'expanded' | 'desktop' | 'banner'
settings.bannerEdge: 'top',        // 'top' | 'bottom' — only used in banner mode
```

**New files:** none — changes live in `renderer/styles.css` (layout CSS variants), `renderer/game.js` (mode switch wiring), `main.js` / `preload.js` (IPC resize), `renderer/engine/platform-storage.js` (shim).

---

## Phase 10 — Cosmetic & Personalization

### 10A — Title System
Earn titles displayed under the cultivator's name in the UI.
Some titles have small gameplay effects; most are cosmetic.

| Title | Earned by | Effect |
|-------|-----------|--------|
| First Soul (初心) | First Qi Condensation | None |
| Tribulation Veteran (历劫) | Survive 5 Tribulations | +3% BT chance |
| Demon Slayer (伏魔) | 50 demon expedition kills | Expedition power +10% |
| Azure Disciple | Inner Disciple rank in Azure Sword Sect | Sword Dao BT +5% |
| Heaven's Favorite (天之骄子) | Roll a Heavenly Root | Qi/s ×1.1 |
| Ascendant (飞升者) | First ascension | Qi/s ×1.05 per reincarnation |

### 10B — Spirit Pet Companion
A tiny companion sprite rendered beside the cultivator (position: lower-left of canvas).
Cosmetic only — the pet reflects your Dao Path element.
| Dao Path | Pet |
|----------|-----|
| Sword | Sword-spirit sprite (floating blade) |
| Flame | Fire fox kit |
| Void | Shadow cat |
| Life | Jade turtle |
| Heaven | Mini crane |
| Devil | Phantom wolf cub |

Pets all pass the Asset Pipeline (≥8.0).

### 10C — Cultivation Cave (Home Environment)
After reaching Foundation Building, unlock a persistent background scene for the sprite area.
Options earned through gameplay, each gives a small passive bonus:
- Ancient Mountain Hermitage (+Karma regen)
- Bamboo Forest (+Life Dao Qi/s)
- Thunder Peak (+Flame/Sword Dao)
- Void Star Field (+Void Dao)

---

# Reference

---

## Open questions — Immortal era, sect depth & living world

**Resolved 2026-09-25 (user):**
- ✅ **Path lock:** not locked at first. A Point of No Return comes at Path Mastery 60 in one method (24A).
- ✅ **Enslaving/devouring your own ascended disciples:** allowed (26F), with the betrayal fallout as designed.
- ✅ **Living world scale:** a mix of heavy and light simulation, designed so players recognise recurring names
  (28B familiar-faces rules). Budget targets are Heavy ~150–300 and Light ~1.5–3k, confirmed by the sim when built.
- ✅ **New systems requested:** starting cohort + natural replacement (28H), encounters on missions/exploration
  (28I), and two rankings, strongest overall + fastest-growing newcomers (28J).
- ✅ **Rising Dragon limit:** 30 real days → converted to **~60 game years** in session 12 (pillar 5). A **Your Class board** always compares you with your starting wave, and
  a new soul restarts Rising Dragon eligibility (28J).
- ✅ **Cohort in the Heavy sim:** ≥ 40% of the Heavy budget is reserved for your starting wave, and the cohort was
  raised to ~80–120 (28B/28H).

**Still open — ask before building the relevant milestone:**
1. **24D:** Is the per-region *count* of mass mortal worshippers OK (only notable believers are individual
   people), or should every believer be an individual?
2. **26:** Is plot-grid placement with adjacency the right depth, or should it be a simpler slot list like 5A?
3. **29:** Is the personality purely random with no reroll, or is there one free reroll at creation? Should it
   ever change during a life (e.g. after a Fall)?
4. ✅ *(resolved session 12: yes, Phase 30; age passes only while the game is open)* **28C:** NPCs age and die of lifespan (寿元). Should the *player* get a lifespan too (parked in 23A), so the
   player and the cohort live under the same rule?
5. **28I:** How often is "often enough" for encounters? The proposed ~15–25% per expedition gets tuned by the
   distinct-names-per-day sim metric.

---

## Complete File Structure (after all phases)

```
START_HERE.md          ← Agent entry point (update every session)
CLAUDE.md              ← Dev rules
PLAN.md                ← This file
GAMEDESIGN.md          ← Game mechanics doc

main.js / preload.js
renderer/
  index.html / styles.css / game.js
  engine/
    game-state.js       ✅
    ascii-renderer.js   ✅
  game/
    cultivation.js      ✅
    expedition.js       ✅ Phase 2
    crafting.js         ✅ Phase 2
    beasts.js           ✅ Phase 3  (renderer/game/beasts.js)
    sect.js             ✅ Phase 4  (renderer/game/sect.js — 5B war logic → renderer/game/sect-war.js)
    dao.js              ← Phase 7
    tribulation.js      ← Phase 7
    life-loop.js        ← Phase 30/31 (death flow, heir selection, Ancestral Hall; replaces Phase 8 reincarnation.js)
    notifications.js    ✅ Phase 9A-B (NotificationSystem — opt-in desktop notifications, DOM-free)
    world-sim.js        ← Phase 28 (replaces planned Phase 15 npc-world.js)
    immortal-path.js    ← Phase 24
    doctrine.js         ← Phase 25
    island.js           ← Phase 26
    sect-management.js  ← Phase 27
    banter.js           ← Phase 29
    family.js           ← Phase 16
    secret-realm.js     ← Phase 17
    lineage.js          ← Phase 18
    world-state.js      ← Phase 19
    settings.js         ← Phase 20
    active-mode.js      ← Phase 22 (Active Mode interaction windows)

assets/
  data/
    stages.js           ✅
    techniques.js       ✅
    events.js           ✅
    items.js            ✅ Phase 2+3 (beast_taming_talisman, pill_heart_calming integrity_restore)
    recipes.js          ✅ Phase 2+3 (talisman recipe)
    locations.js        ✅ Phase 2
    enemies.js          ✅ Phase 2
    beasts.js           ✅ Phase 3
    sects.js            ✅ Phase 4
    dao-paths.js        ← Phase 7
    tempering.js        ← Phase 14
    titles.js           ← Phase 10
    lore.js             ← Phase 11
    origins.js          ← Phase 12
    npc-names.js        ← Phase 15
    npc-personalities.js ← Phase 15 → 28
    world-population.js ← Phase 28 (band targets, cohort size, awakening waves, encounter rates)
    immortal-paths.js   ← Phase 24
    doctrine.js         ← Phase 25
    island-buildings.js ← Phase 26
    sect-offices.js     ← Phase 27
    recruitment.js      ← Phase 27
    personalities.js    ← Phase 29
    banter-lines.js     ← Phase 29
    realm-maps.js       ← Phase 17
    lifespan.js         ← Phase 30
    clan-legacies.js    ← Phase 31 (absorbs Phase 18B legacy-passives.js)
    epochs.js           ← Phase 19
    challenge-modes.js  ← Phase 20
    war-orders          ← Phase 32 (constants go in the existing sect-war.js)
  sprites/
    cultivator-sprites.js  ✅
    enemy-sprites.js        ← Phase 2 (Asset Pipeline)
    beast-sprites.js        ✅ Phase 3 (Asset Pipeline — min score 8.0)
    pet-sprites.js          ← Phase 10 (Asset Pipeline)
    environment-sprites.js  ← Phase 10 (Asset Pipeline)
    tribulation-sprites.js  ← Phase 7 (Asset Pipeline)
```

---

## Build

```bash
npm run dist      # Windows portable .exe → dist/Cultivator Idle-win32-x64/
npm run dist:mac  # Mac .dmg → dist/
```

Build after every completed phase. Tag releases `v0.2.0`, `v0.3.0`, etc.
