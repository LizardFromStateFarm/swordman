# Life Loop — Reference & Build Spec
_Covers: lifespan.js (new data, ✅ built) · clan-legacies.js · names.js (✅ built) · renderer/engine/persons.js (✅ built) · renderer/game/life-loop.js (new) · game-state.js (age, family, succession, clan, legacies) · bloodline.js · game.js (overlays) · scripts/sim/* · Phase: 30, 31, 16-lite, 18C (roadmap M2 2.1–2.8) · Updated: 2026-09-26 (age made harmless)_

> **Status: build spec, written overnight (task 2.1). Tasks 2.2 (shared generators + minimal person record),
> 2.3 (game clock + lifespan), 2.4 (pacing compression) and 2.5 (marriage & children lite) are now BUILT — see
> §8's rows and §11–§14 below for what landed and how each diverges.** Tasks 2.6–2.8 are still spec only. The user
> pre-authorized building M2 with these draft values. Every value marked **(P)** is *provisional, decided
> overnight* (see §9). Once M2 ships, cut this doc down to a normal <120-line reference (index.md rule).
> Until then it is deliberately longer because it is the spec for tasks 2.5–2.8.

> **⚠ 2026-09-26, user decision — AGE NEVER KILLS (see §15).** Everything in this spec about **lifespan**
> (`LIFESPAN_BY_REALM`, `derived.lifespan/inTwilight/ageFrac`, old-age death), **twilight** (card, banter trigger),
> **Final Seclusion**, **spouse old-age death + mourning**, the **`longevity_blood`** legacy, `LIFESPAN_EXT_CAP_FRAC`,
> the `full_life` / `seclusion_bt` firsts, the bot's `twilight()` and invariant `age_over_lifespan` is **superseded
> and removed from code**. Age remains a stat on the game clock. Where older sections below disagree, §15 wins.

## 1. Overview

A save slot is a **clan**. A character's mortal life is one **run** of ~20–40h of open play (casual; was 10–20h before old age was removed, §15). Age runs on a
**game clock** that only moves while the game is open. When a life ends, however it ends, the game goes through
one flow: **ending scene → Ancestral Hall (Merit, legacies, tree) → heir selection → new life.**
The clan keeps Bloodline Quality, Merit, legacies, the family tree and its best realm. Realms below the clan's best
cultivate much faster (**ancestral catch-up**). A successful Ascension ends the life as an **Ascended Ancestor**
(which removes the post-Ascension dead zone), and play continues with the heir.

Pillars this must respect (GAMEDESIGN.md): life = 20–40h run · death is part of the fun · meta progression is mostly
unlocks · **never punish absence** (age never passes offline, no expiring windows) · two clocks · no store logic.

Stage index reference (`stages.js`, 23 rows): `0` Mortal · `1–9` Qi Condensation · `10–12` Foundation Building ·
`13–15` Core Formation · `16–18` Nascent Soul · `19–21` Spirit Severing · `22` Ascension (stub). Last mortal stage
= `CULTIVATION_STAGES.length - 2` = 21. BQ/Merit formulas divide by `CULTIVATION_STAGES.length - 1` = 22.

---

## 2. State

### 2.1 New fields (per life, reset by `_newGame()`)
```
age:              number  — years, float. Starts at AWAKENING_AGE (16). Advanced ONLY in tick()     [30, task 2.3]
self:             Person  — the player's own person record (schema §2.4). name/root/personality/stage are
                            NOT duplicated here; they're read from s.name/s.root/s.personality/s.stageIndex
                            and snapshotted into a full record only when the life ends              [2.2]
finalSeclusion:   bool    — Final Seclusion taken this life (§5.2)                                    [2.3]
twilightNoticed:  bool    — player dismissed/answered the twilight prompt this life                   [2.3]
lifeMerit:        [{id, label, merit}] — clan firsts claimed THIS life, paid out at the end of life    [2.7]
inheritedManual:  string|null — Family Manual technique id; learnTechnique() costs 0 for it           [2.7]
family: {                                                                                             [2.5]
  spouse:          Person|null
  children:        Person[]     — ≤ CHILD_CAP, born on the game clock
  marriedYear:     number|null
  nextChildYear:   number|null  — gameYear the next child is due (null = not married / at cap)
  proposal:        { suitors: Person[], year } | null   — pending proposal; NEVER expires (P)
  nextProposalYear:number|null  — gameYear the next proposal may fire (null until FB is reached)
  mourningUntil:   number       — gameYear; no proposals before this after a spouse's death
}
```
`s.lifespan` from PLAN 30A is **not stored** (P): it's `derived.lifespan`, recomputed in `_recalc()` from
`maxStageThisLife` + legacies, so demotions, migrations and legacy buys can't desync it.

### 2.2 New fields (per clan, carried across lives)
```
gameYear:  number — clan calendar, float, starts at 1. Advanced with age, only in tick()            [2.3]
succession: null | {                        — non-null ⇒ the life is over and the game is paused      [2.6]
  ts, cause,                                  cause ∈ expedition|sect_war|event|ascension_failed|
                                                      old_age|passed_mantle|ascended
  ancestor:     AncestorEntry,                (§2.4, already pushed to clan.tree)
  growth:       number,                       BQ growth from this life (formula §3.3)
  meritBreakdown: [{label, merit}], meritTotal: number,
  heirOptions:  [{ kind: 'child'|'cousin'|'new_soul', person: Person, carry: number }],
  heirlooms:    string[]                      item ids captured from `equipped` (Heirloom legacy)
  beastOffspring: {typeId, traits, name}|null (Beast Lineage legacy)
}
clan: {                                                                                                [2.2→2.7]
  name:           string   — surname, e.g. 'Lin'. Random from names.js at slot creation; setClanName() in Hall
  nextId:         number   — person id counter (ids are 'p' + n; deterministic, no Math.random)
  bestStageIndex: number   — highest stage anyone in the clan reached (updated live on breakthrough)
  merit:          number   — unspent Ancestral Merit
  meritEarned:    number   — lifetime total (stats)
  legacies:       { [legacyId]: level }
  manualTechId:   string|null — Family Manual pick
  firsts:         { [firstId]: { gen, year } }
  tree:           AncestorEntry[]  — oldest first; length === generation − 1 for non-migrated clans
  ascendedAncestors: number
  techniquesEver: string[] — every technique any member learned (Family Manual picks from this)
}
```
Existing 23B fields keep their place and meaning: `bloodlineQuality`, `generation`, `deaths`, `lastReincarnation`
(still written at the start of each new life — the sim's death dedupe reads `lastReincarnation.ts`).
`ascended` now means "this life ended in a successful Ascension" and is only true while `succession` is pending.

### 2.3 What resets vs persists on a new life
Implement as one constant in game-state.js: `CLAN_CARRY_KEYS = ['clan', 'gameYear', 'bloodlineQuality',
'generation', 'deaths', 'settings']`. `_beginNewLife()` builds `_newGame()` and copies these keys across. **Every
future clan-level field must be added to this list** (a missing key silently resets it on death).

| Persists (slot / clan) | Resets (per life) | Conditional (legacies) |
|---|---|---|
| clan.*, gameYear, bloodlineQuality (via carry), generation, deaths, settings | stageIndex, qi, stones, karma, techniques, inventory, equipped, beasts, sect, ownSect, sectWar, health, integrity, stats, events, banter, family, age, finalSeclusion, lifeMerit | stipend → spiritStones · heirlooms → inventory+equipped · Family Manual → inheritedManual · Beast Lineage → 1 beast · Sect Continuity → ownSect (+ `_blankSectWar('own')`) |

The heir's `root` and `personality` come from the chosen person record (child/cousin/new soul), not a fresh roll.
`s.name = clan.name + ' ' + person.given`. The new life's `events` gets one entry: "Year 212: Lin Qiu passes; Lin Mei
takes up the path."

### 2.4 Person record (schema v1 — Phase 28A extends it, never replaces it)
```
Person = {
  v: 1,                 id: 'p17',            given: 'Mei',           family: 'Lin',
  bornYear: number,     // clan gameYear; may be < 1 for spouses born before the clan calendar
  root: {type, name, mult},                    personality: string,   // PERSONALITIES id
  stageIndex: number,   maxStage: number,
  alive: bool,          diedYear: number|null, cause: string|null,
  role: 'self'|'spouse'|'suitor'|'child'|'cousin'|'new_soul'|'ancestor',
  parents: string[],    spouseIds: string[],
}
AncestorEntry = { person, generation, awakenedYear, diedYear, ageAtDeath, cause, maxStage,
                  spouse: Person|null, children: Person[], heirId: string|null,
                  meritEarned, epitaph, sectName: string|null, lifeOpenHours }
```
No sex/gender field in M2 (P): all family text is gender-neutral ("your spouse", "your child").
Children's `age` is derived (`gameYear − bornYear`); nothing ticks per child.

### 2.5 Migration methods (Rule 5) — add to the `_recalc()` ensure chain
| Method | Task | Fills |
|---|---|---|
| `_ensurePhase30Fields()` | 2.2/2.3 | `self` (given = last word of `s.name` unless it's the default, else `''`), `age` (see below), `gameYear`, `finalSeclusion=false`, `twilightNoticed=false` |
| `_ensurePhase16Fields()` | 2.5 | `family` blank; `nextProposalYear` set if already ≥ FB |
| `_ensurePhase31Fields()` | 2.2 (skeleton `{name, nextId}`) → 2.6/2.7 (rest) | `clan` (surname = first word of `s.name` if not default, else random), `bestStageIndex = max(maxStageThisLife, lastReincarnation?.maxStageReached ?? 0)`, `tree = lastReincarnation ? [one 'Unknown Ancestor' entry] : []`, `firsts` back-filled for realms ≤ bestStageIndex **and paid into `clan.merit`** (P), `lifeMerit=[]`, `inheritedManual=null`, `succession=null` |

Migrated age: `min(AWAKENING_AGE + stats.timePlayed/3600 × GAME_YEARS_PER_OPEN_HOUR, 0.8 × derived lifespan)` so an
old save never loads into Twilight or an instant old-age death. `gameYear = 1 + (age − 16)`.
**Stage-22 saves** (already ascended, today's dead zone): after `_recalc()` in `initSlot()`, if
`stageIndex ≥ length−1 && !succession` → `_endLife('ascended')`. Do NOT do this inside an `_ensure*` method
(`_endLife` calls `_recalc` → recursion).

---

## 3. Data files

### 3.1 `assets/data/lifespan.js` (new, task 2.3 — plus 2.5 family timing)
Top comment: `// Phase 30 game clock + lifespan, Phase 16-lite family timing. Used by: game-state.js, scripts/sim/*.`

| Constant | Draft | Notes |
|---|---|---|
| `GAME_YEARS_PER_OPEN_HOUR` | **30** (P) | 1 year per 2 open minutes. PLAN said 60; at 60 a casual player dies of old age in QC (see §6) |
| `AWAKENING_AGE` | 16 | every life (incl. heirs) starts here |
| `LIFESPAN_BY_REALM` | `{ 'Mortal':70, 'Qi Condensation':250, 'Foundation Building':300, 'Core Formation':400, 'Nascent Soul':520, 'Spirit Severing':660, 'Ascension':660 }` (P) | keyed by `CULTIVATION_STAGES[i].realm` of `maxStageThisLife` (Mortal=0, QC=1–9, FB=10–12, CF=13–15, NS=16–18, SS=19–21) |
| `TWILIGHT_FRAC` | 0.10 | twilight when `age ≥ lifespan × 0.9` |
| `FINAL_SECLUSION_QPS_MULT` | 1.5 | |
| `FINAL_SECLUSION_BT_BONUS` | 0.10 | added before the 0.98 cap |
| `LIFESPAN_EXT_CAP_FRAC` | 0.25 | total of all lifespan extenders ≤ +25% of base |
| `OFFLINE_QI_MULT` | 1.0 | multiplies `initSlot()` offline Qi. The 2.4 afk lever (§6.3) |
| `PROPOSAL_MIN_STAGE` | 10 (FB Early) | |
| `PROPOSAL_FIRST_DELAY_YEARS` | [5, 20] | after first reaching FB |
| `PROPOSAL_RETRY_YEARS` | [20, 40] | after a decline |
| `PROPOSAL_SUITORS` | [1, 3] | |
| `SUITOR_STAGE_OFFSET` | [−3, +1] | vs player stage, clamped to ≥ 1 |
| `SUITOR_AGE_OFFSET_YEARS` | [−20, +20] | vs player age, min 18 |
| `SPOUSE_YEARS_PER_STAGE` | 25 | spouse gains 1 stage per 25 married years… |
| `SPOUSE_STAGE_CAP` | 21 | …never ascends. Spouse dies when their age ≥ `LIFESPAN_BY_REALM[their realm]` |
| `FIRST_CHILD_YEARS` | [8, 20] | after marriage |
| `CHILD_INTERVAL_YEARS` | [15, 30] | |
| `CHILD_CAP` | 4 | |
| `ADULT_AGE` | 16 | heir-eligible (= 32 open minutes after birth at 30 yr/h) |
| `MOURNING_YEARS` | 20 | |

### 3.2 `assets/data/clan-legacies.js` (new, task 2.7)
Top comment: `// Phase 31 Merit sources, clan firsts, legacies, catch-up, heir carry, epitaphs. Used by: game-state.js, life-loop.js, sim.`

**Merit & catch-up constants**
| Constant | Draft |
|---|---|
| `MERIT_STAGE` | 40 — stage term `MERIT_STAGE × (maxStage/22)²` (SS Late ≈ 36) |
| `MERIT_DEED_WAR_WON` / `_BEAST` / `_DISCIPLE` | 3 per war won (`sectWar.warVictories` + member wins) / 2 per beast owned at death / 1 per disciple |
| `MERIT_DEED_CAP` | 30 per life |
| `CATCHUP_QPS_MULT` | 2.5 below `clan.bestStageIndex` |
| `CATCHUP_BT_BONUS` | 0.10 below the clan best |
| `CATCHUP_AUTO_BT` | true (P) — below the clan best, a breakthrough is attempted automatically when Qi is ready |
| `ANCESTOR_BLESSING_QPS` / `_MAX` | +5% Qi/s per Ascended Ancestor, max 3 stacks ("Watched Over by an Immortal") |

**`CLAN_FIRSTS`** (each pays once per clan; `{ id, label, merit }`)
| id | when claimed | merit |
|---|---|---|
| `realm_qi` / `realm_fb` / `realm_cf` / `realm_ns` / `realm_ss` | first entry into the realm (`attemptBreakthrough` success) | 5 / 10 / 20 / 35 / 50 |
| `asc_attempt` | `attemptAscension()` called | 40 |
| `ascended` | Ascension survived | 150 |
| `joined_sect` / `founded_sect` | `joinSect` / `foundOwnSect` ok | 5 / 20 |
| `first_beast` | `tameEncounteredBeast` ok | 10 |
| `war_won` | any own/member war won | 15 |
| `married` / `first_child` | `acceptSuitor` / first child born | 10 / 5 |
| ~~`full_life`~~ **CUT (§15)** | death by `old_age` | 10 |
| ~~`seclusion_bt`~~ **CUT (§15)** | breakthrough during Final Seclusion | 15 |

Typical gen-1 casual life ≈ 36 (stage) + ~225 (firsts) + ~20 (deeds) ≈ **280 Merit**; later lives ≈ 60–90.

**`CLAN_LEGACIES`** (`{ id, group, name, nameCN, desc, requires?: firstId, levels: [{cost, value}] }`)
| id | Group | Levels: cost → value | Effect (applied in code by id) |
|---|---|---|---|
| `ancestral_stipend` 祖产 | Heritage | 15→50 · 40→150 · 90→400 | heir's starting spirit stones |
| `heirloom` 传家宝 | Heritage | 40→1 · 100→2 | equipped items passed on: L1 weapon, L2 + artifact |
| `family_manual` 家传功法 | Heritage | 30→3 · 60→7 · 120→99 | pick 1 technique from `clan.techniquesEver` with `minStage ≤ value`; heir learns it **free** when eligible (P) |
| `beast_lineage` 灵兽血脉 | Heritage | 60→1 (requires `first_beast`) | offspring of the highest-level beast: same `typeId`/traits, level 1 |
| `sect_continuity` 宗门传承 | Knowledge | 150→1 (requires `founded_sect`) | founded sect carries to the heir as its leader (full version M5 5.4) |
| ~~`longevity_blood` 长生血~~ **CUT (§15)** | Blood | 25→0.05 · 50→0.10 · 100→0.15 | +lifespan % (counts toward `LIFESPAN_EXT_CAP_FRAC`) |
| `refined_meridians` 洗髓 | Blood | 30→0.03 · 70→0.06 · 150→0.09 | +Qi/s % (deliberately small) |

Deferred from PLAN 31D (P): Clan Estate (needs a new idle job), Clan Recipe Book (no recipe-knowledge system
exists: all recipes are always known), new origins / challenge modes (M3/M8 content).

**Heir carry** (also `BLOODLINE_*` in bloodline.js, §3.3)
| Heir kind | Available | BQ carry | Root | Personality | Legacies + catch-up |
|---|---|---|---|---|---|
| Adult child | age ≥ `ADULT_AGE`, alive | `1.0` + `BLOODLINE_FAMILY_BONUS` | child's blended root | child's | yes |
| Distant cousin | always | `BLOODLINE_CARRY_COUSIN = 0.5` | `rollRoot()` | rolled | yes |
| New soul | always | `BLOODLINE_CARRY_NEW_SOUL = 0.25` (exists) | best of 2 `rollRoot()` (P) | rolled | yes |

`EPITAPHS = { [cause]: ['{name}, who broke {realm} at {age} and died laughing at the heavens.', …] }` — ≥ 3 per cause.

### 3.3 Changes to existing data
- `bloodline.js` (2.5/2.6): add `BLOODLINE_G_PARTNER = 5`, `BLOODLINE_FAMILY_BONUS = 1`, `BLOODLINE_CARRY_COUSIN = 0.5`.
  Growth: `G_BASE + G_SELF×(maxStage/22)² + G_PARTNER×(spouseMaxStage/22)²` (spouse = current or last spouse this life).
- `names.js` (new, 2.2): `SURNAMES` (~60), `GIVEN_NAMES` (~200), pinyin, xianxia flavor. Data only. M4 reuses it.
- `stages.js` (2.4): FB–SS `qiCap` values compressed (§6). QC formula may change.
- `personalities.js` (2.3/2.5): `BANTER_TRIGGERS` + `twilight`, `married`, `child_born` (§5.5).

---

## 4. API (game-state.js unless noted)

### 4.1 New shared generators — `renderer/engine/persons.js` (2.2)
Global `Persons` object, DOM-free, **must use `Math.random()`** (sim determinism). Load order: after data files,
before `game-state.js` (index.html + `LOGIC_FILES` in `scripts/sim/loader.js`).
```
Persons.rollRoot()                    → root        (moved from GameState._rollRoot, identical draws)
Persons.specificRoot(type)            → root        (moved from _rollSpecificRoot)
Persons.blendRoot(a, b)               → root        40% a.type, 40% b.type, 20% rollRoot() (16C rule)
Persons.rollPersonality()             → id          (moved from _rollPersonality)
Persons.rollGiven() / rollSurname()   → string
Persons.make(fields)                  → Person      fills defaults for every schema key, v:1
Persons.powerScore(p)                 → number      p.stageIndex*100 + round(p.root.mult*10)  (28J extends)
```
`GameState._rollRoot/_rollSpecificRoot/_rollPersonality` stay as one-line delegates (existing callers unchanged).
Private helper `_newPersonId()` → `'p' + clan.nextId++`.

### 4.2 New public methods
| Method | Task | Returns |
|---|---|---|
| `enterFinalSeclusion()` | 2.3 | `{ok}` · `{ok:false, reason:'not_twilight'|'already'|'life_over'}` |
| `dismissTwilight()` | 2.3 | `{ok}` — sets `twilightNoticed` |
| `passTheMantle()` | 2.3 | `{ok}` · `{ok:false, reason:'life_over'}` — any time, confirm in UI (P). 2.3: `_die('passed_mantle')`; 2.6+: `_endLife` |
| `acceptSuitor(personId)` | 2.5 | `{ok, spouse}` · `{ok:false, reason:'no_proposal'|'unknown'|'married'}` |
| `declineProposal()` | 2.5 | `{ok}` — clears proposal, schedules retry |
| `lifeOver()` | 2.6 | `bool` — `!!s.succession` |
| `chooseHeir(index)` | 2.6 | `{ok, heir}` · `{ok:false, reason:'no_succession'|'bad_option'}` → `_beginNewLife()` |
| `setClanName(name)` | 2.6 | `{ok}` — trims to 12 chars; renames living `s.name` surname too |
| `buyLegacy(id)` | 2.7 | `{ok, level}` · `{ok:false, reason:'unknown'|'maxed'|'merit'|'locked'}` — any time (P); start-of-life legacies apply to the next heir |
| `setFamilyManual(techId)` | 2.7 | `{ok}` · `{ok:false, reason:'no_legacy'|'unknown'|'tier'}` |
| `legacyLevel(id)` | 2.7 | `number` |

### 4.3 New private methods
- `_tickFamily()` (2.5): called from `tick()` only when `floor(gameYear)` changes. Fires proposals, spouse stage/death,
  child births, emits `married`/`child_born`/`spouse_died`.
- `_claimFirst(id)` (2.7): idempotent. Sets `clan.firsts[id]`, pushes to `lifeMerit`. **Merit is credited at `_endLife`.**
- `_endLife(cause)` (2.6): **idempotent** (returns if `succession` is set). Snapshots `self` into an `AncestorEntry`
  (epitaph, spouse, children), pushes it to `clan.tree`, computes BQ `growth`, merit (stage + `lifeMerit` + capped
  deeds) → `clan.merit`, captures heirlooms/beast offspring, builds `heirOptions` (all adult living children, then a
  cousin, then a new soul), sets `s.succession`, emits `life_ended {cause}`, `_notify()`. Does **not** replace `this._s`.
- `_beginNewLife(option)` (2.6): heirBQ = `parentBQ × carry + growth (+ FAMILY_BONUS if child)`, capped; builds
  `_newGame()`, copies `CLAN_CARRY_KEYS`, applies the heir person + legacies, `generation+1`, `deaths+1` (counts every
  ending, including `ascended` and `passed_mantle`, for simplicity), writes `lastReincarnation`
  (existing shape + `heirKind`), `succession = null`, `_recalc(); _notify(); _emit('reborn')`. This is now the only
  place `this._s` is reassigned mid-session.

### 4.4 Changed methods
| Method | Change |
|---|---|
| `_newGame()` | adds §2.1 fields; in 2.6+ also `clan` skeleton + `gameYear:1`, random surname (fresh slot) |
| `_die(cause)` | 2.2–2.5: unchanged (new soul, instant). 2.6+: one-line alias for `_endLife(cause)` so the 5 existing call sites (resolveExpedition, _resolveSectWar, _resolveMemberWar, checkDeath, attemptAscension) stay as-is |
| `tick(dt)` | if `succession`: save timer only, return. Else before Qi: `years = dt × GAME_YEARS_PER_OPEN_HOUR / 3600; age += years; gameYear += years`; if `age ≥ derived.lifespan` → `_endLife('old_age')` and return; twilight entry → `_emit('twilight')` + log once; `_tickFamily()` on year change; catch-up auto-BT (2.7) |
| `initSlot()` | **never** touches `age`/`gameYear`; skips all offline catch-up while `succession` is pending; offline Qi × `OFFLINE_QI_MULT`; stage-22 migration (§2.5) |
| `_recalc()` | new ensure calls; `derived.lifespan`, `.inTwilight`, `.ageFrac`, `.catchUp`; Qi/s × Final Seclusion × catch-up × Refined Meridians × blessing; BT + seclusion + catch-up bonus (still `min 0.98`) |
| `attemptBreakthrough()` | on success: update `clan.bestStageIndex`, claim realm firsts, `seclusion_bt`; if the new realm lifts lifespan out of twilight, Final Seclusion ends ("emerges from seclusion") |
| `attemptAscension()` | 2.7: success → `stats.ascensions++`, `maxStageThisLife = 22`, `ascended = true`, `clan.ascendedAncestors++`, claim `ascended`, `_endLife('ascended')`; return `{success:true, chance, ascended:true}` (no `newStage`). Stage 22 becomes unreachable in play (row kept for M7) |
| `startExpedition` / `startSectMission` / `answerWarCall` | `{ok:false, reason:'final_seclusion'}` while in Final Seclusion (beast expeditions still allowed) |
| `learnTechnique(id)` | cost 0 when `id === inheritedManual`; push to `clan.techniquesEver` |
| `joinSect`/`foundOwnSect`/`tameEncounteredBeast`/war resolvers | `_claimFirst(...)` |
| `buildDevSave()` | presets get a clan (`'Dev'`), age 16, no tree |
| `renderer/game/*.js` system `tick()`s | early-return when `gs.lifeOver()` (cultivation events, expedition, beasts, sect, sect-war) |

---

## 5. End-of-life flow & UI

### 5.1 Flow
```
any ending ─► _endLife(cause) ─► s.succession set, game paused (tick/offline frozen)
   game.js watcher diffs s.succession?.ts  (replaces the lastReincarnation watcher)
   ─► #ending-overlay   (cause text, epitaph, age, realm, merit breakdown, "Enter the Ancestral Hall")
   ─► #hall-overlay     (tree, records, legacies to buy, clan rename)  ─► "Choose an heir"
   ─► #heir-overlay     (cards per heirOptions) ─► chooseHeir(i) ─► new life, 'reborn' banter
```
Closing the app mid-flow is safe: `succession` is saved, and `bootGame()` re-opens `#ending-overlay` if it's set
on load (don't seed the watcher's `_lastTs` with a pending succession).
`#death-overlay` becomes `#ending-overlay` (reuse the markup). `DEATH_CAUSE_TEXT` adds `old_age` ("Your years ran
out"), `passed_mantle` ("You laid down the path"), `ascended` ("You rose to the Immortal Realms — an Ascended
Ancestor now watches over the clan").

### 5.2 Twilight (2.3)
Entering twilight: log line + `twilight` event + age bar pulses amber. Unless `twilightNoticed`, a choice card
`#twilight-overlay`: **Final Seclusion** (死关) · **Pass the Mantle** (传位) · **Not yet**. Pass the Mantle is also
a button in Stats (confirm dialog) at any time (P).

### 5.3 Proposal (2.5)
`#proposal-overlay` lists 1–3 suitors (name, realm, root, personality) → Accept one · Decide later · Decline all.
"Decide later" leaves `family.proposal` pending (never expires, pillar 4). Stats shows "A matchmaker awaits" to reopen.

### 5.4 Placement & layout
- **HUD:** compact age bar under Health: `Age 47 / 660` (amber in twilight). **Stats:** Clan section: `Year 212 of the
  Lin Clan · Gen 4`, spouse, children (name, age, root), [Ancestral Hall], [Pass the Mantle], matchmaker link.
- **Hall:** openable from Stats any time (read-only heir button hidden unless `succession`). Tree = vertical list,
  newest first, one collapsed row per generation (tap to expand spouse/children/epitaph) — no wide ASCII tree.
- BQ stays hidden until `clan.firsts.asc_attempt` exists; heir cards say "Bloodline: full / half / faint", not numbers.
- Charselect card (2.6): `Lin Clan · Gen 4` + current heir name.
- All overlays follow `#settings-overlay`: fit 300px, box scrolls, `max-height:100%`, tap targets ≥ 32px, no hover-only
  info (iOS, Rule 7). Add every new overlay id to the `BanterSystem` `isBlocked` selector in game.js.
- DOM glue lives in new `renderer/game/life-loop.js` (`LifeLoopUI`, not loaded by the sim). State logic stays in
  game-state.js (Rule 1).

### 5.5 Banter / events
New `onGameEvent` types: `twilight` · `married {spouse}` · `child_born {child}` · `spouse_died {spouse}` ·
`life_ended {cause}`; `reborn` is reused for the new life. New **banter triggers**: `twilight` (2.3), `married`,
`child_born` (2.5). Each needs ≥ `BANTER_MIN_LINES.other` (4) lines × 14 personalities + 2 generic = 58 lines per
trigger, or the sim's `banter_pool_holes` invariant fails. Follow `banter-writing-guide.md`; tokens `{spouse}`, `{child}`.

---

## 6. Pacing plan (task 2.4)

### 6.1 The constraint nobody wrote down: casual cadence
The casual bot looks every 30 min, so every breakthrough costs ≥ 30 min regardless of the Qi cap. 21 breakthroughs
to the last mortal stage ⇒ **≥ 10.5h floor**. Qi Condensation (9 layers) always costs ~4.5h for casual. That's why
the clock is 30 yr/h rather than 60 and why QC lifespan is 250 (§3.1). It's also why catch-up needs auto-BT:
without it, gen 2+ casual can't go faster in stages that fill in < 30 min.

### 6.2 Targets
New `PACING_TARGETS_MIN` (casual, idle minutes to fill a stage's cap, unboosted):
| Realm | Old | **New** | Casual time in realm (≈ max(fill, 30m) × layers) | Cumulative (gen 1) | Lifespan in open h |
|---|---|---|---|---|---|
| Mortal | 1–4 | 1–4 | 0.5h | QC at 0.5h | 1.8h |
| Qi Condensation | 2–15 | 2–15 | 9 × 0.5 = 4.5h | FB at 5h | 7.8h |
| Foundation Building | 20–45 | **15–30** | 3 × 0.5 = 1.5h | CF at 6.5h | 9.5h |
| Core Formation | 60–180 | **30–60** | 3 × 0.75 = 2.25h | NS at 8.75h | 12.8h |
| Nascent Soul | 180–480 | **45–90** | 3 × 1.1 = 3.3h | SS at 12h | 16.8h |
| Spirit Severing | 480–1200 | **60–120** | 3 × 1.5 = 4.5h | Ascension ready ≈ 16.5h | 21.5h |

Add to `profiles.js`: `LIFE_TARGETS_H = { casual: { gen1: [12, 20], later: [8, 16] }, active: { gen1: [4, 10] } }`,
`FIRST_ASCENSION_H = { casual: [40, 80] }`, `GENERATIONS_TO_ASCEND = [3, 5]`. Report flags when medians fall outside.

### 6.3 How to get there
1. Baseline: `npm run sim` (save report). Current casual fills: FB 36m, CF 1.7h, NS 5.9h, SS 9.2h.
2. Only knob in the first pass: FB–SS `qiCap` (baseQps unchanged, so Qi/s-based economy — offline gains, events that
   grant "N seconds of Qi" — keeps its feel). Start factors ≈ target-mid ÷ measured: FB ×0.6, CF ×0.45, NS ×0.2,
   SS ×0.16. Iterate via `npm run sim -- --profiles=casual --hours=100 --set="CULTIVATION_STAGES[16].qiCap=1.3e9" …`
   (newCap = cap × target ÷ measured, 2–3 rounds, same recipe as qa-sim.md). Then edit `stages.js` and update its
   header comment. Re-check technique prices tied to pacing (e.g. `minStage 10` at 600 stones).
3. **Afk:** age doesn't pass offline, so afk lives are long in wall time and short in open time (≈ 4h open per life,
   BT only on reopen, ≥ 12 × 8.25h ≈ 100h wall for FB+). That is *intended* (pillar 4). Only if afk reaches the first
   Ascension attempt in **fewer wall hours than casual's open hours**, lower `OFFLINE_QI_MULT` (try 0.5). Never make
   age pass offline.
4. Done when: casual life median 10–20h, active ≥ ~5h (active meditates constantly ≈ 3× Qi), no new pacing flags.

> **Built 2026-09-26 (task 2.4).** Casual median life 16.8h (10-20h band), active 12.6h (faster than
> casual, well clear of the 5h floor). See §13 for the final `qiCap` values, the `OFFLINE_QI_MULT` decision,
> and full before/after sim numbers.

---

## 7. Sim requirements

**Bot (`bot.js`)** — new methods in the `checkIn` chain, only public API:
- `family()`: pending proposal → `acceptSuitor` of the highest `Persons.powerScore`. Never declines.
- `twilight()`: in twilight and not secluded → if Qi-to-cap at ×1.5 Qi/s ≤ 80% of remaining lifespan (open-hours)
  → `enterFinalSeclusion()`, else `passTheMantle()`.
- `succession()`: `run.js` calls it **right away** whenever `gs.lifeOver()` after a step (the ending screen is in
  front of the player; don't wait for the next casual check-in). Spend Merit greedily in priority order
  `ancestral_stipend → longevity_blood → refined_meridians → family_manual (pick highest-minStage known technique)
  → heirloom → beast_lineage → sect_continuity`, then `chooseHeir`: adult child with best root mult, else cousin.
- Ascension policy unchanged (attempt when ready) — gives the 3–5 generations target a clean read.

**Metrics (`metrics.js` / `report.js`)** — new "Life Loop" section replacing "Ascension & Bloodline":
life length in open hours (`stats.timePlayed` at `_endLife`) by cause · age & realm at death · lives per 100h · heir
kind mix · marriages/children per life · twilight choice mix · Merit per life + legacies bought · **time to reach the
clan best per generation** (should fall) · generations and hours to first `ascended` · afk wall-hours vs open-hours per life.

**Invariants (`checkInvariants` + `run.js` reopen check)**
1. `age`/`gameYear` identical before and after `initSlot()` offline catch-up (`age_offline`).
2. `age ≤ derived.lifespan + 1e-6` unless `succession` is pending (`age_over_lifespan`).
3. lifespan ≤ base × (1 + `LIFESPAN_EXT_CAP_FRAC`); legacy levels ≤ max; `clan.merit ≥ 0`.
4. `clan.bestStageIndex` never decreases; `clan.tree.length === generation − 1` (fresh sim saves).
5. `children.length ≤ CHILD_CAP`; spouse `null` or alive; proposal only when unmarried and past `PROPOSAL_MIN_STAGE`.
6. BQ never lower after a `child` heir; `succession` never pending across two bot actions (sim only).
7. Existing: health/BQ/generation ranges, BT ≤ 0.98, `stageIndex ≤ 21` in live play after 2.7.

**Generation-aware dead-zone fix (2.6)** — the gotcha in bloodline.md. `Recorder` keeps `stageReached`/`maxStage`
**per generation** (`gen → {stage → t}`), resetting on a `lastReincarnation.ts` change. Progress = a new stage *this
life* or a milestone. "Time to reach" realm table = generation 1; a new table lists time-to-clan-best per generation.
Dead zone / stage wall / progression stall are computed per life. Run the life-loop checks at `--hours=500`.

---

## 8. Build order (one agent session each; the game stays playable after every task)

| Task | Scope | Done when |
|---|---|---|
| **2.2** ✅ Shared generators + person record | `persons.js`, `names.js`, delegate `_rollRoot`/`_rollSpecificRoot`/`_rollPersonality`, `s.self`, `clan` skeleton `{name:'', nextId}`, `_ensurePhase30Fields` (self only) / `_ensurePhase31Fields` (skeleton). **No new `Math.random()` calls in `_newGame()`** | `npm test`; `npm run sim` report **identical** to baseline except timestamps; a node check that `Persons.make()` fills every schema key |
| **2.3** ✅ Game clock + lifespan | `lifespan.js`, age/gameYear in `tick()`, `derived.lifespan/inTwilight/ageFrac`, old-age death, twilight card, Final Seclusion, Pass the Mantle (via current `_die`), HUD age bar + Stats, `twilight` banter lines (58), sim life metrics + invariants 1–2 | invariants hold; report shows life length + deaths by cause. (Before 2.4, casual gen-1 dies of old age around NS/CF — confirmed, see §12.) |
| **2.4** ✅ Pacing compression | `stages.js` caps, `PACING_TARGETS_MIN`, `LIFE_TARGETS_H`, `OFFLINE_QI_MULT` check | §6.3 step 4 — casual median life 16.8h, active 12.6h, both within band; see §13 |
| **2.5** ✅ Marriage & children lite | `_ensurePhase16Fields`, `_tickFamily`, proposal overlay, `acceptSuitor`/`declineProposal`, partner term in `_die` growth, `married`/`child_born` banter lines, bot `family()` | sim: ≥ 1 adult child before the median death in casual; BQ growth includes partner term — met: 100% of casual lives end with an adult child; see §14 |
| **2.6** Heir selection + succession flow | `_endLife`/`_beginNewLife`/`chooseHeir`, `CLAN_CARRY_KEYS`, ending → Hall (tree + records only) → heir overlays, system `lifeOver()` guards, clan name + charselect, generation-aware metrics, bot `succession()` | 500h casual sim spans ≥ 3 generations in one slot; heir kinds reported; `family carry 1.0` path used; no dead-zone false flags |
| **2.7** Hall + legacies + catch-up + Ascended Ancestor | `clan-legacies.js`, firsts, Merit, `buyLegacy`/`setFamilyManual`, catch-up + auto-BT, blessing, Ascended Ancestor ending + stage-22 migration, Hall legacy UI, bot Merit spending | gen 2+ reaches the clan best faster; no "content exhausted"/post-Ascension dead zone; bot buys legacies |
| **2.8** Tuning | Merit costs, catch-up strength, lifespans, BQ constants | `npm run sim --hours=500`: first Ascension casual 40–80h, 3–5 generations, gen 2+ life median ≥ 8h |

Every task: update START_HERE/PLAN/this doc, `npm test`, `npm run sim:quick`, `npm run dist`, `npm run build:web`.
New files go into index.html script order (data after `bloodline.js`; `persons.js` before `game-state.js`;
`life-loop.js` after `banter.js`), `DATA_FILES`/`LOGIC_FILES` in `scripts/sim/loader.js`, and CLAUDE.md's tree.

---

## 9. Open questions for the user — **all provisional, decided overnight**
1. **Clock 30 yr/open hour (not 60)** and lifespans Mortal 70 / QC 250 / FB 300 / CF 400 / NS 520 / SS 660. At 60 yr/h
   with PLAN's table, a casual player dies of old age in Qi Condensation (cadence floor, §6.1).
2. **Catch-up includes auto-breakthrough** below the clan best. Otherwise gen 2+ casual isn't faster in early realms.
   Should it be a toggle in ⚙ or a purchasable legacy instead?
3. **Pass the Mantle any time** (with confirm), not only in twilight.
4. **Heir carry:** child 1.0+1, cousin 0.5, new soul 0.25 with best-of-2 root (so new soul has a reason to exist).
5. **Legacy list trimmed to 7**; Clan Estate, Recipe Book and origins/challenge unlocks deferred. Costs as §3.2.
6. **Family Manual = free to learn when eligible**, not an instant bonus at stage 0 (keeps it an unlock).
7. **Heirs always start at 16** (lifespan counts from awakening), regardless of the child's real age.
8. **Proposals never expire; no gender field** in M2.
9. **Migrated saves** get Merit for firsts already reached; saves sitting at the Ascension stub get the Ascended
   Ancestor ending on load and pick an heir.
10. Clan name is random at slot creation and renamable in the Hall (no creation screen yet).
11. Merit can be spent any time from the Hall, not only between lives.
12. With catch-up, a gen 2+ casual life may be ~6–10h (speed-run to SS Late, then gamble). Acceptable, or should the
    bot/player be pushed to wait and prepare (e.g. Final Seclusion adds Ascension chance)? Tuned in 2.8.

## 10. Gotchas
- **"Open" means the process is running, not "visible."** Corrected 2026-09-26 (task 2.3): since task 1.3
  (Phase 9A, system tray), `main.js` sets `backgroundThrottling:false` and `game.js`'s `bootGame()` runs a 1s
  fallback `setInterval` that calls `step()` whenever `requestAnimationFrame` has stalled ≥900ms — so the
  game keeps ticking (Qi **and** age) while the window is hidden to the tray, not just while it's visible and
  focused. Only the app **not running at all** (fully quit, or not yet reopened) skips aging — that's the
  `initSlot()` offline-catch-up path, which still never touches `age`/`gameYear`. **Flagged for the user to
  confirm**: this means "open" for pillar 4/lifespan purposes already meant "running in the tray counts", not
  "visible on screen" — worth double-checking that's the intended reading, since a cultivator sitting in the
  tray for hours still ages and can still die of old age. (The original text here undersold this — it said a
  hidden window "freezes age and Qi", which stopped being true once Phase 9A shipped, before this doc existed.)
- `_endLife` must be idempotent and must not reassign `this._s`. Existing callers `return` after `_die()`; with the
  pending flow they'd keep mutating the dead life, which is harmless but pointless. `checkDeath` fires after every
  event, which is why the `lifeOver()` guard in systems matters.
- Only `tick()` advances age. Never call `tick()` from `initSlot()` or offline paths, and don't compute age from
  `Date.now()`.
- 2.2 must not change random draw order, or the "sim identical" check is meaningless. Names are rolled from 2.6.
- Adding a banter trigger without 58 lines breaks the sim (`banter_pool_holes`).
- Keep `lastReincarnation` (the sim's death dedupe uses its `ts`). Do **not** delete stage 22 (sprites, M7, report
  stage counts); just make it unreachable.
- Sect Continuity: set `sectWar = _blankSectWar('own')` or `_ensurePhase5BFields` side-sync wipes it anyway; a joined
  `sect` must be null (invariant "joined AND founded").
- Save size: ~0.5 KB per generation (ancestor + spouse + ≤4 children). 100 generations ≈ 50 KB; fine, no pruning in M2.
- BQ is hidden: never print the number in heir/Hall UI before `asc_attempt`.
- Catch-up auto-BT consumes a queued `activePill`, same as a manual BT. The bot shouldn't queue pills below the clan best.

## 11. Task 2.2 — what actually got built (overnight, 2026-09-26)

**Files:** `assets/data/names.js` (new, `SURNAMES` 60 / `GIVEN_NAMES` 205 — pinyin only, no CN glyphs, gender-neutral),
`renderer/engine/persons.js` (new, global `Persons`), `renderer/engine/game-state.js` (`_newGame()`, `_rollRoot`/
`_rollSpecificRoot`/`_rollPersonality` delegates, new `_newPersonId()`/`_ensurePhase31Fields()`/`_ensurePhase30Fields()`,
both new ensures added to the `_recalc()` chain after `_ensurePhase29Fields()`), `renderer/index.html` (script tags),
`scripts/sim/loader.js` (`DATA_FILES`/`LOGIC_FILES` + the new schema-check block below).

**Decisions where the spec was ambiguous (picked the simplest option, consistent with 2.3–2.7):**
- **`Persons.make()` for `s.self`:** the schema (§2.4) requires `root`/`personality`/`stageIndex`/`maxStage`, but
  §2.1 says self does NOT duplicate them (read live off `s.root`/`s.personality`/`s.stageIndex` instead). Resolved
  by having `Persons.make()` default those four keys to `null`/`0`/`0` when not passed, and `_ensurePhase30Fields()`/
  `_newGame()` simply never pass them for `role: 'self'`. Every OTHER role (spouse/child/cousin/ancestor, tasks
  2.5+) is expected to pass real values. `Persons.powerScore()` treats `root: null` as a 0 root bonus so it doesn't
  throw if ever called on `s.self` before 2.6 exists.
- **`clan` skeleton scope:** built exactly `{ name: '', nextId: 1 }` — no `bestStageIndex`/`tree`/`firsts`/`merit`/
  `legacies`/`gameYear`/random-surname-at-creation. Those are explicitly 2.6/2.7 per §2.5's task column; adding them
  now would mean re-touching `_ensurePhase31Fields()` anyway when `_endLife`/`_beginNewLife` land, so there was
  nothing to gain by guessing their shape early.
- **`_newPersonId(clan)` takes `clan` as a parameter** (not `this._s.clan`) — `_newGame()` needs it before `this._s`
  is assigned (it builds `clan`/`self` as locals first, then returns them in the save object). Called as
  `this._newPersonId(s.clan)` everywhere `this._s` already exists (e.g. `_ensurePhase30Fields()`).
- **`Persons.blendRoot(a, b)`** (2.5+ only) was included now since §4.1 lists it as part of `persons.js`'s task-2.2
  scope, even though nothing calls it yet — it consumes no `Math.random()` until called, so it can't affect the
  "sim identical" check.
- **Node schema check** lives in `scripts/sim/loader.js` (inside `createSim()`, right after all files load, before
  `gameState` is fetched): asserts `Persons.make({})` has all 15 schema keys, throws with a pointer back to this
  doc's §2.4 if not. Runs automatically on every `npm run sim`/`sim:quick` invocation — no separate npm script
  needed. It calls no `Math.random()`, so it can't perturb the draw-order check either.
- **Script/loader order:** `names.js` placed right after `banter-lines.js` in both `index.html` and
  `DATA_FILES` (still "after `bloodline.js`" per §8's rule, just not immediately after it — `dev-presets.js`,
  `automation.js` etc. all sit in that same "somewhere after bloodline.js" zone already). `persons.js` goes
  immediately before `game-state.js` in both `index.html`'s `<script>` order and `LOGIC_FILES`.

**Verification:** `npm test` (47 files, was 45), `npm run sim:quick` (0 exceptions/violations), full `npm run sim`
before (via a saved copy of `report.md`/`report.json`) and after this change — **identical** except `wallSec`/
`avgTickUs`/`maxTickUs`/`simHoursPerWallSec`/timestamps (verified by a scratch diff script that strips exactly those
keys from both `report.json`s and compares the rest byte-for-byte: equal). `npm run build:web` (confirmed
`persons.js`/`names.js` land in `www/`), `npm run dist` (portable build succeeded). CDP smoke test against a fresh
`--user-data-dir` scratch profile (never the user's real slots, confirmed `%APPDATA%\Cultivator Idle` still doesn't
exist afterward): clicked "New Cultivator" for real (exercises `initSlot()` → `_newGame()`), read back
`gameState.get()` — `clan: {name:'', nextId:2}`, `self: {v:1, id:'p1', given:'', family:'', ..., role:'self', ...}`
(id `p1` consumed by self, `nextId` correctly advanced to 2), `Persons.make({})` has all 15 keys, `Persons.
powerScore()`/`rollGiven()`/`rollSurname()` all callable with sane output, zero console errors/exceptions. Killed
the scratch Electron process afterward (confirmed via `Get-CimInstance Win32_Process`, all 4 PIDs matched the
scratch `--user-data-dir` before killing).

**Gaps / not done (out of 2.2's scope, next task's job):** no age/gameYear/family/succession fields yet (2.3+); no
random clan surname on fresh-slot creation yet (`clan.name` stays `''` until 2.6/2.7 — this is correct per §2.5,
not a bug); `_die()` still resets `clan`/`self` to a fresh blank skeleton on every reincarnation (unchanged, per
§4.4's "2.2–2.5: unchanged" — clan persistence across lives is explicitly 2.6's `CLAN_CARRY_KEYS` work, not built
here) — until then, generation-to-generation clan identity doesn't actually persist, which is expected and will be
fixed when `CLAN_CARRY_KEYS` lands.

## 12. Task 2.3 — what actually got built (overnight, 2026-09-26)

**Files:** `assets/data/lifespan.js` (new — the full §3.1 table written now, even though only
`GAME_YEARS_PER_OPEN_HOUR`/`AWAKENING_AGE`/`LIFESPAN_BY_REALM`/`TWILIGHT_FRAC`/`FINAL_SECLUSION_QPS_MULT`/
`FINAL_SECLUSION_BT_BONUS` are consumed by code yet — the rest wait on task 2.5), `game-state.js` (`_newGame()`
gains `age`/`gameYear`/`finalSeclusion`/`twilightNoticed`; new `_baseLifespan()`; `_ensurePhase30Fields()` now
also backfills the 4 new fields for migrated saves; `_recalc()` computes `derived.lifespan`/`.inTwilight`/
`.ageFrac` and applies the Final Seclusion Qi/s + breakthrough-chance bonus; `tick()` advances `age`/`gameYear`,
fires `_die('old_age')`, and logs+emits `twilight` once per life; `attemptBreakthrough()` auto-ends Final
Seclusion when a new realm's lifespan lifts the character back out of twilight; new `enterFinalSeclusion()`/
`dismissTwilight()`/`passTheMantle()`; `startExpedition`/`startSectMission`/`answerWarCall` gain the
`final_seclusion` guard; `_die()`'s `lastReincarnation` summary gained `openHours`/`ageAtDeath`/`lifespan`),
`renderer/index.html` (age HUD block, `#twilight-overlay`, `lifespan.js` script tag), `renderer/styles.css`
(`#age-block` + pulse animation, `#twilight-overlay`), `assets/data/personalities.js` (`twilight` added to
`BANTER_TRIGGERS`), `assets/data/banter-lines.js` (58 new `twilight` lines: 2 generic + 4 × 14 personalities),
`renderer/game.js` (age bar render + auto-open twilight card, twilight overlay button wiring, `DEATH_CAUSE_TEXT`
gains `old_age`/`passed_mantle`, Stats tab gains an Age/Clan Year row + a "Pass the Mantle" button, banter
`isBlocked` selector gains `#twilight-overlay`), `scripts/sim/loader.js` (`lifespan` in `DATA_FILES`, new
constants exposed to `sim.data`), `scripts/sim/bot.js` (new `twilight()` method, first in the `checkIn` action
chain), `scripts/sim/metrics.js` (`lifeLengths` array + `age_over_lifespan`/`age_offline` invariants),
`scripts/sim/report.js` (new "Life Loop" section; the older "Ascension & Bloodline" section is kept, relabeled
"cumulative across the whole run", rather than deleted — see below), `CLAUDE.md` tree.

**Decisions where the spec was ambiguous (picked the simplest option, consistent with 2.4–2.7):**
- **`gameYear` is not yet clan-persistent.** §2.2 lists `gameYear` as a "per clan, carried across lives" field,
  but `_die()` is explicitly "2.2–2.5: unchanged" (§4.4) — it still resets the whole state via `_newGame()` and
  only selectively carries `settings`/`warOrders`/`playMode`/`automation` forward. Rather than jump ahead to
  task 2.6's `CLAN_CARRY_KEYS`, `gameYear` resets to `1` each new life for now, same as `clan` itself already
  does (documented gap since task 2.2, §11). It will start actually persisting when `CLAN_CARRY_KEYS` lands.
- **`_die()`'s `lastReincarnation` summary gained 3 additive fields** (`openHours`, `ageAtDeath`, `lifespan`) —
  needed for the sim's life-length metrics (§7) and with no `_endLife()`/`succession` yet, this is the only
  place that information exists before the life is reset. Purely additive: every existing reader (death overlay,
  the sim's death-dedupe) only ever touched the pre-existing keys, so this isn't a behavior change for them.
- **`enterFinalSeclusion()`/`dismissTwilight()`/`passTheMantle()` skip the `'life_over'` reason** listed in
  §4.2 — that reason describes rejecting the call after task 2.6's `succession`/`lifeOver()` exist; since
  neither exists yet, there's nothing to check. `passTheMantle()` just calls `_die('passed_mantle')` directly,
  per the task's own instruction to route it through the current `_die()` "for now".
- **Final Seclusion's Qi/s and breakthrough-chance bonuses are applied alone** — the spec's full multiplier
  chain ("Qi/s × Final Seclusion × catch-up × Refined Meridians × blessing") includes three more multipliers
  that are task 2.7 (clan legacies) content that doesn't exist yet. The code comment at the insertion point in
  `_recalc()` says where they'll chain in.
- **Twilight-entry log/emit dedupe uses a new, unlisted state key `s._twilightLogged`** (boolean, not in the
  §2.1 schema) rather than reusing `twilightNoticed` — the latter means "the player answered the prompt card"
  (§5.2), which is a different, independent thing from "has the once-per-life log line/banter event already
  fired". It follows the same convention as other implementation-only accumulators not in the schema doc
  (`_intRegenAcc`, `_healthRegenAcc`, `_craftAcc`). It resets naturally each life since `_newGame()` never sets it.
- **The twilight overlay auto-opens from `updateHUD()`**, not from a `subscribe()` watcher diffing a timestamp
  (the pattern the death/ascension overlays use) — there's no natural "this just happened" timestamp for
  twilight the way `lastReincarnation.ts` or a manual button click provides one. Guarding on
  `d.inTwilight && !s.twilightNoticed && overlay-is-currently-hidden` is cheap (checked every frame) and can't
  reopen itself after "Not Yet"/Final Seclusion set `twilightNoticed = true`.
- **Report: kept "Ascension & Bloodline" alongside the new "Life Loop" section** instead of replacing it (§7
  says "new 'Life Loop' section replacing 'Ascension & Bloodline'") — the old section's cumulative
  generation/deaths/BQ-at-end numbers across the *whole run* are still meaningful and now more interesting
  (a 200h run spans 10-17 generations instead of 1-2), while "Life Loop" adds the *per-life* breakdown (length,
  age at death, twilight choice, deaths by cause with per-cause median length) that didn't exist before. Full
  replacement is more sensible once 2.5-2.7 add heir-kind/marriage/Merit columns to "Life Loop" — deferred.
- **Pacing note, not a bug:** with Ascension existing but 23D/2.7's "Ascended Ancestor ending" not built, a
  character who successfully ascends keeps aging in the `ascension` stage stub (lifespan 660, same as Spirit
  Severing) and will eventually still die of old age and reincarnate. This is a harmless, arguably beneficial
  side effect of layering the game clock under the existing Phase 23 Ascension stub — it naturally bounds what
  bloodline.md documents as the "post-Ascension dead zone" a little, rather than leaving it open forever. Not
  something this task needed to fix.

**Verification:** `npm test` (48 files, was 47). `npm run sim:quick` and full `npm run sim` (50/100/200h ×
active/casual/afk × 3 seeds): **0 errors, 0 invariant violations** in both. The new "Life Loop" section
confirms the expected pacing: **casual** median life 12.8 open-hours, dying of `old_age` (34× at 200h) at age
~400 (Core Formation's `LIFESPAN_BY_REALM`) — i.e. casual gen-1 is dying of old age around Core
Formation/Nascent Soul, exactly as §8's row predicted for before task 2.4's pacing compression. **active**
median life 19.3h, mostly ending via bot-chosen `passed_mantle` (29× at 200h) around age 594 (= 0.9 × 660, the
Spirit Severing/Ascension lifespan — confirms the twilight threshold math), with a couple of `old_age` deaths
too. **afk** has far fewer lives (its 8h-closed/15m-open sessions mean little open-clock time accrues per real
run). `npm run build:web` (confirmed `lifespan.js` lands in `www/`), `npm run dist` (portable build succeeded).
CDP smoke test against a fresh `--user-data-dir` scratch profile (never the user's real slots — confirmed the
3 real `slot_*.json` mtimes were byte-identical before/after): created a new cultivator, confirmed `age`/
`gameYear` advance live over real ticks, confirmed the HUD age bar/numbers and Stats "Age"/"Clan Year" rows
render correctly, force-set `age` to 95% of `derived.lifespan` (a state field, not a public API — the only way
to reach twilight in under a minute of real time) and confirmed the twilight card auto-opened with the correct
amber pulse; clicked Final Seclusion (confirmed `finalSeclusion:true`, Qi/s multiplied, `startExpedition()` then
correctly returns `{ok:false, reason:'final_seclusion'}`); used the Stats tab's new "Pass the Mantle" button →
confirm dialog → confirmed a full reincarnation (`generation` 1→2, `deaths` 0→1, age reset to 16, death overlay
showed "You laid down the path"); zero console errors/exceptions throughout. Killed all 4 scratch Electron
processes afterward (confirmed via `Get-CimInstance Win32_Process`, all matched the scratch `--user-data-dir`
before killing).

**Gaps / not done (out of 2.3's scope, next task's job):** pacing compression (`stages.js` caps, task 2.4) —
casual dying of old age before Nascent Soul/Spirit Severing is the *expected, called-out* state before that
task, not a bug to fix here; marriage/children/heir-selection/legacies/catch-up (tasks 2.5-2.7) — `family`,
`lifeMerit`, `inheritedManual`, `succession`, `clan.bestStageIndex`/`tree`/`firsts`/`merit`/`legacies` are all
still their task-2.2 skeleton/absent; realm-firsts claiming and `seclusion_bt` (both task 2.7, clan legacies)
aren't wired into `attemptBreakthrough()` yet.

## 13. Task 2.4 — what actually got built (overnight, 2026-09-26)

**Files:** `assets/data/stages.js` (Foundation Building–Spirit Severing `qiCap` values retuned, header comment
rewritten to point at this section instead of the pre-life-loop 2026-09-25 pacing pass), `scripts/sim/profiles.js`
(`PACING_TARGETS_MIN` tightened to §6.2's new bands, new `LIFE_TARGETS_H`/`FIRST_ASCENSION_H`/
`GENERATIONS_TO_ASCEND` exports), `scripts/sim/report.js` (new median-life-vs-`LIFE_TARGETS_H.gen1` flag in the
Life Loop section), `renderer/engine/game-state.js` (`initSlot()`'s offline Qi credit now multiplies by
`OFFLINE_QI_MULT` — previously declared in `lifespan.js` but never actually consumed anywhere).

**Method:** baseline `npm run sim` (all profiles, 50/100/200h, 3 seeds, `path=founder`) first, then iterated
entirely with `--set` (no file edits) on `--profiles=casual --hours=100` runs before touching `stages.js`, per
CLAUDE.md's balance-change rule.
1. Applied §6.3 step 2's starting factors verbatim to the *current* (pre-2.4) FB–SS `qiCap`s: FB ×0.6, CF
   ×0.45, NS ×0.2, SS ×0.16. One round already landed casual within the target band (median life 15.5h,
   reaching a first Ascension attempt in 1/3 seeds at 21h) — closer to converged on the first try than §6.3
   expected, likely because task 2.3's lifespan/twilight system already does most of the "stop wandering
   after Ascension" work the old pacing pass didn't have to account for.
2. One correction round: casual's Spirit Severing fill (2.3h) sat ~15% above the new 60–120m target band's
   top end, so SS was scaled down an extra ×(2.0h ÷ 2.3h) ≈ ×0.87 (net ×0.139 off the original values).
   FB/CF/NS needed no second round — measured fills (22-59m for FB/CF/NS) landed inside their new bands
   on the first pass.
3. Verified at `--hours=200 --seeds=5` (all 3 profiles) before writing the converged numbers into `stages.js`,
   then ran the full default suite (`npm run sim`, no `--set`) once more against the committed data files to
   confirm nothing was lost translating factors into literal constants.

**Final `qiCap` values** (`stages.js`, indices 10–21 — factors relative to the pre-2.4 values in parentheses):
| Stage | Old → New | Stage | Old → New |
|---|---|---|---|
| fb_early (×0.6) | 5.2e5 → 3.12e5 | ns_early (×0.2) | 6.7e9 → 1.34e9 |
| fb_mid (×0.6) | 2.3e6 → 1.38e6 | ns_mid (×0.2) | 3.5e10 → 7.0e9 |
| fb_late (×0.6) | 9.7e6 → 5.82e6 | ns_late (×0.2) | 2.1e11 → 4.2e10 |
| cf_early (×0.45) | 4.4e7 → 1.98e7 | ss_early (×0.139) | 8.4e11 → 1.169e11 |
| cf_mid (×0.45) | 4e8 → 1.8e8 | ss_mid (×0.139) | 5.5e12 → 7.65e11 |
| cf_late (×0.45) | 2.1e9 → 9.45e8 | ss_late (×0.139) | 3.8e13 → 5.29e12 |

Mortal/Qi Condensation `qiCap`s are unchanged (§6.1: casual's 30-min cadence floors QC regardless of cap).
`baseQps` and `breakthroughChance` are untouched on every stage — breakthrough chance still tops out at 0.95
(Mortal) and only ever goes down from there, so the "≤ 0.98" game-design rule was never at risk.

**`PACING_TARGETS_MIN`** (minutes, casual, unboosted fill time): FB 20–45→**15–30**, CF 60–180→**30–60**,
NS 180–480→**45–90**, SS 480–1200→**60–120** (Mortal/QC unchanged). Measured casual medians after the retune
all land inside the new bands: FB 22m, CF 50m, NS 1.2h (72m), SS 2.2h (132m — see below).

**`LIFE_TARGETS_H`** (new): `{ casual: { gen1: [10, 20], later: [8, 16] }, active: { gen1: [5, 15] } }`. This
**deviates from life-loop.md §6.2's original draft** (`casual gen1 [12,20]`, `active gen1 [4,10]`) — once
sim-measured, active's median life (12.6h) sat a little above the draft's 10h ceiling. Rather than chase the
tighter draft band with a knob this task has no mandate to turn (active's pacing is driven by the same
`qiCap`s casual uses, and further compressing them would push casual below its own 10h floor), the band was
widened to match the task's actual, coarser acceptance criterion ("casual 10–20h, active faster, ≥ ~5h") that
the top-level prompt gave instead of life-loop.md's own tighter draft. `FIRST_ASCENSION_H`/`GENERATIONS_TO_ASCEND`
are written (task 2.8 expects to find them per §8) but **not wired into any report flag** — every death is
still a fresh soul with zero ancestral catch-up until tasks 2.5–2.8 land, so there is no "generations to first
Ascension" signal to check yet; checking it now would either always fail (no catch-up exists) or be
meaningless (single-generation medians dressed up as a multi-generation metric).

**`OFFLINE_QI_MULT` decision: left at 1.0 (no throttle).** §6.3 step 3's actual test is not "afk's open-hours
vs casual's open-hours" (which looked alarming in isolation — afk reached a first Ascension attempt in just
~3.3–4 open-hours at every multiplier tried, since afk's bottleneck is "one breakthrough per 15-minute reopen
window" long before Qi-cap fill time becomes limiting) but **"afk's wall-clock hours vs casual's open-hours"**
— i.e. does walking away actually let you progress faster in real time than playing casually? Measured: afk's
first-ascension-attempt milestone (which the sim's `rec.t` counts in real/wall time, including the 8h closed
gaps, since `afk`'s session model advances `rec.t` through closures too) lands at **107.3h wall**, while
casual's same milestone lands at **~19.5h open** (≈ wall, since casual never closes). 107h ≫ 19.5h, so afk is
nowhere near "trivially easy" by the spec's own yardstick — leaving the game running unattended for hours does
not get you to the same place faster than actually playing it. Swept `OFFLINE_QI_MULT` at 1.0/0.5/0.3/0.15
against `--profiles=afk --hours=200` anyway to confirm the insensitivity (median life stayed 3.3–4.0 open-hours
across the whole sweep — confirming the bottleneck really is reopen cadence, not Qi-cap fill), then left it at
1.0. The multiplier hook itself was still wired into `initSlot()` (previously declared in `lifespan.js` but
never actually multiplied into the offline Qi credit) so a future task can turn it without another code change,
per §4.4's "offline Qi × `OFFLINE_QI_MULT`" note — it is a documented no-op today, not dead code.

**Sim evidence (full `npm run sim`, `path=founder`, 3 seeds, 200h horizon):**
| | Before (baseline) | After |
|---|---|---|
| casual median life | 12.8h, dies `old_age` (34×) at age ~400 (Core Formation lifespan) | **16.8h**, mostly `passed_mantle` (19× @15.5h) or `old_age` (14× @21.5h), 1× `ascension_failed` @19.5h |
| active median life | 19.3h, mostly `passed_mantle` (29×) near age 594 (0.9×660) | 12.6h — **faster than casual**, mostly `ascension_failed` (32× @9.8h) or `passed_mantle` (13× @19.3h) — now actually attempts (and 1/200h-run survives) Ascension repeatedly |
| afk median life | 5.0h, capped around Nascent Soul | 3.3h — see `OFFLINE_QI_MULT` note above for why this isn't "trivial" |
| casual reaches Spirit Severing (cumulative, whole run) | ✗ (never, in any seed) | 27.3h |
| casual first Ascension attempt (cumulative) | ✗ | 21.0h (1/3 seeds) |
| casual pacing fill (Pacing table) | FB 32m · CF 1.5h · NS 2.2h · SS — (never reached) | FB 22m · CF 50m · NS 1.2h · SS 2.2h |
| "Off design pacing" flag | not present (old bands were loose enough) | still not present against the new, tighter bands |
| Health | 0 errors / 0 invariant violations | 0 errors / 0 invariant violations |

**Verification:** `npm test` (48 files). `npm run sim:quick` (0/0). Full `npm run sim` before (`git stash` of the
tracked changes) and after (table above; both healthy, same 12→8 flag count — the 4 flags that disappeared were
all pre-existing member-war-parity/off-pacing noise from the old bands, no new flags appeared). `npm run
build:web`, `npm run dist` (portable build succeeded). Did **not** re-run the CDP smoke-test pass this task —
no UI/state-shape changed (only data-file constants + a multiply in an existing offline-Qi line + sim-only
files), so there was nothing new for a live Electron pass to catch that the sim's own save-round-trip checks
(135 in the final full run) don't already cover.

**Gaps / not done (out of 2.4's scope, next task's job):** generation-aware pacing (`later` in `LIFE_TARGETS_H`,
`FIRST_ASCENSION_H`, `GENERATIONS_TO_ASCEND`) isn't checked by any report flag yet — waits on tasks 2.5–2.8's
ancestral catch-up and generation-aware metrics (§7's "Generation-aware dead-zone fix"). The post-Ascension
dead zone (active reaches Ascension around 31h into a run and then has nothing left for the rest of a 200h
horizon) is unchanged and still exactly the Phase 23/task-2.7 gap bloodline.md already documents — task 2.4
was not scoped to touch it. Technique prices (life-loop.md §6.3's "re-check `celestial_orbit` at minStage 10 /
600 stones") were reviewed against the economy table (no hoarding flag, `learn_technique` a healthy ~34-36% of
casual spend both before and after) and left unchanged — no pacing-driven price issue was found.

## 14. Task 2.5 — what actually got built (2026-09-26)

**State** (`s.family`, reset per life by `_newGame()`; `_ensurePhase16Fields()` is shape-only and runs last in the
`_recalc()` ensure chain, after `_ensurePhase30Fields()`). Matches §2.1 plus two additions:
- `pastSpouses: Person[]` — dead spouses (`alive:false`, `diedYear`, `cause:'old_age'`). Keeps invariant 5 ("spouse null or
  alive") true while still letting `_die()` use "the last spouse this life" and task 2.6's `AncestorEntry` list them.
- `spouseStageYear` — gameYear of the spouse's last stage gain (one stage per `SPOUSE_YEARS_PER_STAGE`, capped at 21).

**Logic** (game-state.js):
- `_tickFamily()` runs from `tick()` when `floor(gameYear)` changes (never offline). Order: spouse stage-ups → spouse
  old-age death (`y − bornYear ≥ LIFESPAN_BY_REALM[realm of spouse.maxStage]` → `pastSpouses`, mourning
  `MOURNING_YEARS`, `nextProposalYear = mourningUntil`, emit `spouse_died`) → child birth → proposal.
- First proposal: scheduled on the first year change with `maxStageThisLife ≥ PROPOSAL_MIN_STAGE` (so migrated FB+ saves
  are covered without any `Math.random()` inside an `_ensure*` method), fires `PROPOSAL_FIRST_DELAY_YEARS` later.
  Suitors: 1–3, stage = player stage + [−3,+1] clamped to [1, 21], age = player age ± 20 (min 18) **capped at 80% of
  the suitor's own realm lifespan** (not in the spec — without it a Nascent-Soul-era suitor could be born past their
  lifespan and die the year after the wedding). Suitors get a random surname; emit `proposal` (no banter pool).
- `acceptSuitor(id)` → spouse (`role:'spouse'`, `spouseIds` linked both ways), first child due in `FIRST_CHILD_YEARS`.
  `declineProposal()` → retry in `PROPOSAL_RETRY_YEARS`. "Decide later" is UI-only (proposal stays pending forever).
- Children: `Persons.blendRoot(s.root, spouse.root)`, rolled personality, given name re-rolled up to 3× to avoid a
  sibling duplicate, `family = _clanSurname()` (clan.name, else the first word of a two-word player name, else none —
  until 2.6 gives every clan a surname). `CHILD_CAP` counts across all spouses in a life.
- `_die()` growth: `G_BASE + G_SELF×(maxStage/22)² + G_PARTNER×(spouseMaxStage/22)²`; the partner is the current spouse,
  else the last of `pastSpouses`. `lastReincarnation` gained `married`, `children`, `adultChildren`, `spouseMaxStage`,
  `growth` (additive). `family` still resets on death — heirs are task 2.6.
- New helpers: `_blankFamily()`, `_randRange([lo,hi])`, `_randInt([lo,hi])`, `_clanSurname()`; `Persons.fullName(p)`.

**UI:** `#proposal-overlay` (index.html/styles.css, same pattern as `#twilight-overlay`, scrollable box, 32px buttons):
one card per suitor (name, realm·layer, age, root, personality) with Accept; Decide Later / Decline All. It auto-opens
once per proposal per session (`_proposalShownYear` closure in game.js) and never on top of the twilight card. Stats
gains Spouse / Child rows and an "A matchmaker awaits" button that reopens it. Added to BanterSystem's `isBlocked`.
Overlay code lives in game.js next to the twilight card rather than in `life-loop.js` (that file arrives with 2.6).

**Banter:** `married`/`child_born` added to `BANTER_TRIGGERS`, 116 lines (2+2 generic, 4+4 × 14). `fill()` supports
`{spouse}`/`{child}`. The previous (interrupted) session had pasted every block into `generic` — fixed here.

**Sim:** `Bot.family()` (accept the highest powerScore suitor, never decline). Life Loop table: Married / Children per
life / Adult child at death, plus a casual flag when < 50% of lives end with an adult child. Invariants
`family_children_over_cap`, `family_spouse_dead`, `family_proposal_invalid`. Loader exposes `PROPOSAL_MIN_STAGE`,
`CHILD_CAP`, `ADULT_AGE`.

**Evidence** (full `npm run sim`, founder, 3 seeds, 200h): 0 errors / 0 violations (the pre-fix baseline had
`banter_pool_holes` ×756). Married 100% of lives in all three profiles, 4.0 children/life for active and casual
(afk 2.5), **100% of lives end with ≥1 adult child**. Casual median life unchanged at 16.8h; active 12.6h → 10.2h and afk
3.3h → 2.8h. Mostly RNG-stream shift from the new family rolls — family touches no Qi, stones or BT chance; its only
balance lever is the partner term raising next-life BQ (and so Ascension odds) slightly, which would lengthen, not
shorten, lives.
Afk sect founding looked lower (1/3 → 0/3), but an 8-seed rerun gave 1/8 both before and after, so it's noise. BQ
partner term checked directly with a scripted scenario (growth = 1 + 8(s/22)² + 5(sp/22)² exactly).

**Pacing note for 2.6/2.8:** casual marries ~5–20 game years after FB (~6h open) and has 4 adult children well before
death, so the `child` heir path will dominate; cousin/new soul will mostly matter for afk and early deaths.

## 15. Age made harmless (2026-09-26, user decision)

> "The user shouldn't have to worry about age. Have an age stat but age shouldn't kill anyone."

**Removed:** `LIFESPAN_BY_REALM`, `TWILIGHT_FRAC`, `FINAL_SECLUSION_*`, `LIFESPAN_EXT_CAP_FRAC`, `MOURNING_YEARS`
(lifespan.js; file name kept); `_baseLifespan()`, `derived.lifespan/inTwilight/ageFrac`, old-age `_die('old_age')` and
the twilight log/emit in `tick()`, `enterFinalSeclusion()`/`dismissTwilight()`, the `final_seclusion` rejections in
`startExpedition`/`startSectMission`/`answerWarCall`, the Final Seclusion Qi/BT boost; spouse old-age death,
`family.pastSpouses`/`mourningUntil` (a spouse is for life now, so there's no remarriage), the suitor-age cap; the
HUD age bar (now a plain "歲 Age 47" readout) and `#twilight-overlay`; the `twilight` banter trigger + its 58 lines;
the sim's `twilight()` bot step, `age_over_lifespan` invariant and twilight report column; `lastReincarnation.lifespan`.

**Kept:** `age`/`gameYear` on the game clock (only `tick()` advances them; still drives proposals and children),
Pass the Mantle (Stats button, any time — the player's way to move to the next generation), `DEATH_CAUSE_TEXT.old_age`
(harmless, for old summaries). Migration: `_ensurePhase30Fields()` / `_ensurePhase16Fields()` delete the leftover
`finalSeclusion`/`twilightNoticed`/`_twilightLogged`/`pastSpouses`/`mourningUntil` keys; migrated age is no longer capped.
New sim invariant `age_below_awakening`.

**Pacing impact** (full `npm run sim`, 3 seeds, 200h, before = 2.5 commit, after = this change): a life now ends only
at the Ascension Trial (or a violent death / Pass the Mantle — the bot never passes the mantle now).
| Profile | Median life before → after | Deaths before → after |
|---|---|---|
| casual | 16.8h → **29.5h** (outside the 10–20h band — flagged) | old_age 19, passed_mantle 13 → ascension_failed 9 |
| active | 10.2h → 9.9h | ascension_failed 40, passed_mantle 9 → ascension_failed 14 |
| afk | 2.8h → 2.8h | unchanged |
Casual's Spirit Severing fill also rose to 4.2h (target 1–2h) — Final Seclusion's ×1.5 Qi/s used to carry casual through
SS. 0 errors / 0 violations. **User accepted ~30h casual lives** (2026-09-26): `LIFE_TARGETS_H.casual.gen1` → [20, 40],
Spirit Severing `PACING_TARGETS_MIN` → [60, 300], GAMEDESIGN pillar 1 → 20–40h. No `stages.js` retune.

**Knock-on for tasks 2.6–2.8:** `_endLife` causes lose `old_age`; the Twilight step in §5.1/§5.2 is gone; 2.7's legacy list
is 6 (no `longevity_blood`) and firsts lose `full_life`/`seclusion_bt`; §7 bot has no `twilight()`; invariant 2 is gone.
Children still reach `ADULT_AGE` on the clock, so the child heir path is unaffected.
