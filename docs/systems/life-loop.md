# Life Loop — Reference & Build Spec
_Covers: lifespan.js · clan-legacies.js · names.js (new data) · renderer/engine/persons.js · renderer/game/life-loop.js (new) · game-state.js (age, family, succession, clan, legacies) · bloodline.js · game.js (overlays) · scripts/sim/* · Phase: 30, 31, 16-lite, 18C (roadmap M2 2.1–2.8) · Updated: 2026-09-25_

> **Status: build spec, written overnight (task 2.1). No M2 code exists yet.** The user pre-authorized
> building M2 with these draft values. Every value marked **(P)** is *provisional, decided overnight*
> (see §9). Once M2 ships, cut this doc down to a normal <120-line reference (index.md rule). Until then it is
> deliberately longer because it is the spec for tasks 2.2–2.8.

## 1. Overview

A save slot is a **clan**. A character's mortal life is one **run** of ~10–20h of open play (casual). Age runs on a
**game clock** that only moves while the game is open. When a life ends, however it ends, the game goes through
one flow: **ending scene → Ancestral Hall (Merit, legacies, tree) → heir selection → new life.**
The clan keeps Bloodline Quality, Merit, legacies, the family tree and its best realm. Realms below the clan's best
cultivate much faster (**ancestral catch-up**). A successful Ascension ends the life as an **Ascended Ancestor**
(which removes the post-Ascension dead zone), and play continues with the heir.

Pillars this must respect (GAMEDESIGN.md): life = 10–20h run · death is part of the fun · meta progression is mostly
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
| `full_life` | death by `old_age` | 10 |
| `seclusion_bt` | breakthrough during Final Seclusion | 15 |

Typical gen-1 casual life ≈ 36 (stage) + ~225 (firsts) + ~20 (deeds) ≈ **280 Merit**; later lives ≈ 60–90.

**`CLAN_LEGACIES`** (`{ id, group, name, nameCN, desc, requires?: firstId, levels: [{cost, value}] }`)
| id | Group | Levels: cost → value | Effect (applied in code by id) |
|---|---|---|---|
| `ancestral_stipend` 祖产 | Heritage | 15→50 · 40→150 · 90→400 | heir's starting spirit stones |
| `heirloom` 传家宝 | Heritage | 40→1 · 100→2 | equipped items passed on: L1 weapon, L2 + artifact |
| `family_manual` 家传功法 | Heritage | 30→3 · 60→7 · 120→99 | pick 1 technique from `clan.techniquesEver` with `minStage ≤ value`; heir learns it **free** when eligible (P) |
| `beast_lineage` 灵兽血脉 | Heritage | 60→1 (requires `first_beast`) | offspring of the highest-level beast: same `typeId`/traits, level 1 |
| `sect_continuity` 宗门传承 | Knowledge | 150→1 (requires `founded_sect`) | founded sect carries to the heir as its leader (full version M5 5.4) |
| `longevity_blood` 长生血 | Blood | 25→0.05 · 50→0.10 · 100→0.15 | +lifespan % (counts toward `LIFESPAN_EXT_CAP_FRAC`) |
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
| **2.2** Shared generators + person record | `persons.js`, `names.js`, delegate `_rollRoot`/`_rollSpecificRoot`/`_rollPersonality`, `s.self`, `clan` skeleton `{name:'', nextId}`, `_ensurePhase30Fields` (self only) / `_ensurePhase31Fields` (skeleton). **No new `Math.random()` calls in `_newGame()`** | `npm test`; `npm run sim` report **identical** to baseline except timestamps; a node check that `Persons.make()` fills every schema key |
| **2.3** Game clock + lifespan | `lifespan.js`, age/gameYear in `tick()`, `derived.lifespan/inTwilight`, old-age death, twilight card, Final Seclusion, Pass the Mantle (via current `_die`), HUD age bar + Stats, `twilight` banter lines, sim life metrics + invariants 1–2 | invariants hold; report shows life length + deaths by cause. (Before 2.4, casual gen-1 dies of old age around NS — expected.) |
| **2.4** Pacing compression | `stages.js` caps, `PACING_TARGETS_MIN`, `LIFE_TARGETS_H`, `OFFLINE_QI_MULT` check | §6.3 step 4 |
| **2.5** Marriage & children lite | `_ensurePhase16Fields`, `_tickFamily`, proposal overlay, `acceptSuitor`/`declineProposal`, partner term in `_die` growth, `married`/`child_born` banter lines, bot `family()` | sim: ≥ 1 adult child before the median death in casual; BQ growth includes partner term |
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
- **"Open" means rendering.** The loop is `requestAnimationFrame` with `dt` capped at 2s, so a minimized/hidden
  window freezes age *and* Qi (no offline catch-up either, since nothing reloads). Pre-existing behavior; don't "fix"
  age alone.
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
