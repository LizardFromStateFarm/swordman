# NPC Sects & Sect Takeover (Phase 43) — Reference
_Covers: assets/data/sect-buildings.js · assets/data/npc-sects.js · assets/data/sects.js · assets/data/sect-war.js · game-state.js · sect-view.js · attention.js · scene-renderer.js · Phase: 43 · Updated: 2026-10-03_

**Status: 43a built (levelled buildings) · 43b built (the world's sect registry, growth sim, world-sect events, the ledger) · 43c built (wars read the real rival's Might) · 43d built (the blessing scales with the sect; fund its halls, the levy, the court) · 43e built (the sect master: challenge / petition, the takeover, the old guard) · 43h built (sect relations: a sect page, declare war, diplomacy, pressure, trade, member visits) · 43f built (raze an enemy sect: the vow, the world reacts, dread, the remnant returns). 43g (QA & Balance) next.** The plan lives in
`~/.commandcode/plans/npc-sect-simulation.md`; this doc is the source of truth as each part lands.

Phase 43 gives the world's sects a body: buildings they own, a sim that grows them, wars against *real* rivals you can
burn to the ground, and a Grand Elder's road to taking a sect over. It is the "Phase 15 NPC sect sim" the war code's
`'defensive'` order and the ally `'cheapest'/'best'` picks have been stubbing out since Phase 5B.

## State (43a)
- `ownSect.buildings: { [buildingId]: level }` — **Phase 43 made this levelled.** `0`/absent = not built, `1..SECT_BUILDING_MAX_LEVEL`.
  An old save stored `true`; `_ensurePhase43Fields()` rewrites it to `1` (and drops falsy entries), including the
  `clan.sect` snapshot a legacy inheritance copies in.
- Nothing else changed shape: `hallLevel`, `disciples`, `recruitPool`, `_incomeAcc` are as in own-sect.md.
- 43b: `s.world.sects` — see "43b — the world's sects" below.

## API (43a)
- `buildSectBuilding(id)` → sets the building to **level 1** (unchanged cost/items).
- `upgradeSectBuilding(id)` → `{ ok, level?, reason? }` — reasons `no_sect`, `unknown`, `not_built`, `max_level`, `stones`.
  Charges `sectBuildingUpgradeCost(id)`.
- `sectBuildingUpgradeCost(id)` (method) → stones for the next level, or `null` when unbuilt / at the cap.
- `sectBuildingEffects(id, level)` (module-scope, shared with the UI) → the building's effects at that level.
- `ownSectInfo()` now returns `builtN`, `totalLevels`, and per building `{ level, built, maxed, upgradeCost, upShort, canUpgrade }`.

## Data Shape (43a)
- `SECT_BUILDINGS[].effects` are unchanged (the **level-1** values) — nothing had to be re-balanced.
- `SECT_BUILDING_MAX_LEVEL = 3` · `SECT_BUILDING_LEVEL_STEP = 0.5` · `SECT_BUILDING_UPGRADE_MULT = 1.8`.
- **The scaling rule:** `effect(level) = base × (1 + STEP × (level − 1))`; `beast_slots` stays a whole number.
  So Lv1 ×1, Lv2 ×1.5, Lv3 ×2, and **level 1 is exactly what the building always was** — an existing save is untouched.
- **Upgrade cost:** `round(stones × 1.8^(level − 1))` → Lv1→2 = 1.8× the build cost, Lv2→3 = 3.24×.

## Wiring (43a)
- `_recalc` (game-state.js) reads each building's level, scales its effects, and pays fame by **total depth** (`10 × Σ levels`),
  so reaching level 1 on all six halls gives the same fame as before.
- `_halls` (sect-view.js) shows `Lv.N` per card, an arrow preview of the next level's value, and a **Deepen** tile;
  the header reads "N of 6 halls raised · M levels". The Overview's Halls tile carries the level count too.
- The Sect → Base diorama (`scene-renderer.buildSectScene`) grows a hall with its level and re-bakes on a level change
  (the `sig` carries levels, not just ids).

## Invariants (43a)
1. `ownSect.buildings[id]` is a level ≥ 1, or absent. Never `true`/`false` after a `_recalc`.
2. Level 1 ⇒ the same effect as the pre-43 building (so migration can never re-balance a live save).
3. `upgradeSectBuilding` never charges on a refusal.
4. `sectBuildingUpgradeCost` returns `null` exactly when the building is unbuilt or at `SECT_BUILDING_MAX_LEVEL`.

## Gotchas
- The sim's bot deepens the cheapest affordable hall **after** every hall is raised (so the sim exercises the path);
  its `wantFor`/`reserved` still only reserve materials for *unbuilt* buildings — upgrades are stones-only.
- `_ensurePhase43Fields()` is called **before** `_ensurePhase5BFields()` in the `_recalc` chain, and after
  `_ensurePhase5Fields()` (which seeds `ownSect` at all).
- ❌ **Depth pass:** 43a is the mechanical foundation (no new player choice beyond "deepen or save"); the Depth pass
  for the phase is in the plan's §5 and lands with the takeover (43e) and razing (43f).

## Player-owned sects always reach the global cap (user rule, 2026-10-02)
> *"make sure that when a player owns a sect their sect buildings can hit the highest level possible."* User pick:
> **reach the global cap** (not a higher player-only ceiling).

A sect the **player owns** — founded (Phase 5A) or taken over (43e) — can always raise + deepen **every** hall to the
global caps: `SECT_BUILDING_MAX_LEVEL` (3) per building and the player's own `SECT_HALL_LEVELS.length` (4) for the
Sect Hall. **NPC per-entity caps do not apply to the player.** 43b gives each NPC sect its own `maxBuildingLevel`
(varied, so the world doesn't homogenize at its ceiling — user taste) — that cap is for **NPC-controlled** sects only.
When a sect passes to the player (a takeover in 43e, or a founded sect), it upgrades to the global cap regardless of
what its NPC cap was. Pinned by `scripts/sim/checks/sect-view.js` ("every hall of a player-owned sect reaches the
global cap", "the player's Sect Hall reaches its own max").

---

## 43b — the world's sects (built 2026-10-02)

> User picks (2026-10-02): build 43b **with a surface and depth** (not the invisible engine-only slice); the ledger
> lives **inside Sect → Overview** (no 6th sub-tab); and all four depth additions — **sect relations memory**, **your
> sect's own record**, **world-sect events with choices**, and **a seceded branch becomes a real sect**.

### Depth pass
1. **Memory** — every sect record carries a `stance` toward you (−100..100) and `deeds` (the last 5 things you did to
   it, dated, with the stance change). Growth, falls and births go into a world `chronicle`. A sworn alliance is kept (`sworn`).
2. **Choices** — six world events (`WORLD_SECT_EVENTS`), one waiting at a time, never expiring, three answers each.
   Outcomes read: the sect's **temper** (its master's personality shades the stance change), **your personality** and
   **your realm vs its tier** (spy / fist-fight odds), **your Might vs its Might** (tribute, apology, threats), your
   **stones**, and **your sect** (refugees, lures). Events: envoys · a hall raised · an insult · a refugee · a
   splinter's lure · an alliance.
3. **Hooks** — sect wars (a war binds a real sect, weighted by hostility; sworn allies never march; the result is
   remembered and costs the loser disciples) · Phase 45 branches (a seceding branch becomes a splinter sect that lures
   your disciples) · own-sect disciples · joining/leaving a sect · karma + health · attention · `world.enemies`.
   43c/43d will read `Might` for war odds and the blessing.
4. **Drama** — best: a sworn alliance with a Towering sect; tribute wrung from a proud master. Worst: a spy caught,
   a wronged branch growing into a sect that bleeds your disciples, a Towering rival that hates you and keeps coming.
5. **Feedback** — stance decides which events come (envoys/alliances from the friendly, insults from the hostile)
   and **who comes to war with you**.
6. **Agency** — every player decision is an explicit choice. The world acts on its own (growth, decline, clashes,
   births, falls; stance moving from your deeds; a war picking its attacker). Nothing is chosen for you, nothing expires.

### UX pass
- **Surface** — Sect → Overview in every standing: the **"Sects of the world"** ledger ranks every sect by Might (bar,
  band, number; tooltip = the formula), stance chip with its number, a summary line; a row opens to its master + temper,
  each hall with level pips **to the sect's own cap** (with a key), "Sect Hall Lv.N of M", a growth note, and "What
  they remember of you". The chronicle folds below. The join list shows band · Might, stance, size. A founder's sect is a gold row.
- **Interact** — the event card at the top of Overview: three wide tiles with cost, the **real odds** (Might shown for
  Might rolls), gains, and the stance change on success and on failure; unaffordable = "Needs N stones". One click.
- **Discover** — an urgent attention item while an event waits; a log line "Word comes from …".
- **Feel** — a gold-edged letter card; novel-voice flavour; stance tones red / dim / jade / gold.

### State (43b)
```js
s.world.sects = {
  list: [{ id: 'ws1', name, defId /* SECTS id or null */, kind: 'joinable'|'rival'|'splinter', origin: 'seed'|'born'|'seceded',
           tier: 1..5, temper /* PERSONALITIES id */, leader, buildings: { [buildingId]: level },
           hallLevel, maxBuildingLevel, maxHall, disciples, stance, deeds: [{ year, text, delta }], sworn,
           bornYear, lastRaisedYear, alive }],
  nextId, born, fallen, chronicle: [{ year, text, sectId }], event: null | { id, sectId, year, buildingId? },
  lastRaised: null | { sectId, buildingId, year } }
s.sectWar.enemyId   // the record a war is bound to (null on old wars / hand-set test wars)
```
Seed (`_seedWorldSects`, RNG-free: hash-seeded mulberry32): the five `SECTS` as `joinable` records (Azure Sword /
Myriad Herb weak, Heaven Defying tier 5 with high halls) + three rivals (one with level-3 halls). Migration
(`_ensurePhase43bFields`, in `_recalc` after `_ensurePhase30Fields`): seeds an old save; your current sect starts at
+25; an old `"the X faction"` secession in `world.enemies` becomes a splinter record.

### API (43b)
- `worldSectsInfo()` → `{ rows (by Might; a founder's own sect as an `own` row), chronicle, born, fallen, playerMight, event }`
- `worldSectEventInfo()` → the waiting event, every choice's `cost / odds / gain / stance / failStance / lock / glyph`
- `answerWorldSectEvent(i)` → `{ ok, success, text, odds, parts }` · reasons `no_event`, `gone`, `bad_choice`, `stones`
- `playerMight()` — founder: max(realm, their sect's Might with disciples ×10); member: max(realm, 0.6 × their sect's);
  wanderer: `10 + 6 × stage`
- Module: `worldSectMight(r)` = 8·Σlevels + 12·(hall−1) + 10·tier + 4·√disciples; `wsRng`, `wsLeaderName`, `wsRivalName`

### The sim (`_tickWorldSects`, once per game year — only while the game is open)
Each sect rolls `growChance + growPerTier × tier` to raise one hall level or its Sect Hall, **never past its own
caps**; disciples drift toward the NPC Sect Hall cap; a small setback roll loses a level. Then maybe one clash (the
weaker by Might, with a roll, loses a level + 12% disciples); a rival with no halls and < 6 disciples breaks apart
(joinable sects never do); births top the rivals up to 4; and, if none waits, maybe a world event.

### Wiring (43b)
- `tick()` game-year branch → `_tickWorldSects()`.
- `_advanceSectWarStep` (scouting) → `_wsWarFoe(member)` (weight `1 + max(0,−stance)/20`, rivals ×2, sworn never,
  your joined sect never, none left → a rival is born) → `w.enemyId/enemyName`, stance −10 (member −5).
- `_resolveSectWar` / `_resolveMemberWar` → `_wsWarResult(win, member)` (a loss for them: −10% disciples + a deed).
- `joinSect` +25 · `leaveSect` −20 (deserting −40) · `_branchSecede` → `_wsSplinter` (−70, led by the head).
- UI: `SectView._worldEvent` + `_ledger` (fold state `wsOpen/wsMore/wsChron`), `.ws-joinline`; attention `world-sect`.
- Sim bot answers events (`world_sect_event`). Checks: `scripts/sim/checks/npc-sects.js`. Smoke: `scenarios/npc-sects.js`.

### Invariants (43b)
1. No NPC sect is ever past its own `maxBuildingLevel` / `maxHall` (the check runs 600 years).
2. The five joinable sects never break apart.
3. Seeding draws no `Math.random`.
4. A waiting event never expires and is never answered for the player; a refused choice charges nothing.
5. A world event never kills (a failure floors Health at 1).
6. A sworn ally is never a war's attacker.

### Gotchas (43b)
- The sim runs only on the game-year tick (`world.year` never advances offline) — pillar 4. Wars still resolve
  offline and still update stance/deeds.
- 43b changes **no war odds** — Might is shown; the war rolls are untouched until 43c.
- Stone gifts scale with the sect's tier, not your realm: early on a tier-5 envoy is a big gift (sim:quick 'afk':
  41% of a tiny early income). Tune in 43g.
- Growth was halved after the first smoke (rivals maxed in ~4 open hours): `growChance 0.03 + 0.008 × tier`. 43g tunes it.
- Checks hand-set `w.enemyName` without `enemyId`; `_wsWarResult` falls back to the name, else does nothing.

---

## 43c — wars read the bound sect's Might (built 2026-10-02)

> User picks (2026-10-02): the plan's slice (Might replaces the flat roll; the war panel shows the foe's halls) **plus**
> "outcomes change halls" and "a member war uses your sect's Might". Pre-war choices (sue for peace / spy / call a
> sworn ally) were offered and **not** picked. They are candidates for later.

### Depth pass
1. **Memory**: the foe's deeds name the hall that burned or rose ("lost a war against you; their Qi Library burned").
   A foe that beat you holds you cheaper (`stanceWarBeatYou` −5), which makes it likelier to come again (43b hostility weighting).
2. **Choices**: none new. Reinforce / ally / standing orders are unchanged, but they now buy odds against a known foe.
3. **Hooks**: sect wars (both resolvers), the world-sect registry (halls, disciples, Might), stance + deeds, the world
   chronicle, the ally system (never the foe), the war attention items, the 43b ledger (Might moves with every war).
4. **Drama**: best, you break a Towering sect and watch its tallest halls burn a step at a time over several wars.
   Worst, a rival keeps beating you, raises a hall on every plunder, and grows out of reach.
5. **Feedback**: every war reshapes the world (winners grow, losers shrink), and the next war's odds read the result.
6. **Agency**: nothing new is decided for the player. The war's attacker and its roll belong to the world.

### UX pass
- **Surface**: the War header chip "Towering · Might 319". The odds card: "Their Might 319 against yours 156: they fight at
  ×1.54 of an even match, rolling ×0.6 to ×1.4 of that". **Their mountain**: both Mights as bars, master/temper/stance/
  memory, halls with pips, Sect Hall + disciples, "Win, and one of their halls burns…". A Might row on the why popover.
  The Last war card: "their Training Ground burned to Lv.1" · "odds were 52.3%" · "Might 245 vs 156". A log line names
  the hall and the new Might.
- **Interact**: unchanged (Reinforce / Ask an ally / orders), now showing odds against the real foe.
- **Discover**: the existing war attention items. **UX debt**: see START_HERE.

### Math
`_warMightRatio(member)` → `{ ratio, foe, them, us }`. During a war (scouting/preparing) with a bound record:
`ratio = clamp((them / us)^0.6, 0.4, 2.5)` (`WORLD_SECTS.war`). Own war: `us = playerMight()`. Member war:
`us = worldSectMight(your joined sect's record)`. With no record, or at peace, `ratio = 1` (exactly the pre-43c roll).
Enemy strength: own `(fame+20) × ratio × U(0.6,1.4)`, member `ratio × U(0.6,1.4)`.
`sectWarOdds()` = `(m/(0.8r))·ln((m+1.4r)/(m+0.6r))`, plus `vs`.

### API / wiring (43c)
- `_wsWarEnemy()`: the bound record (by id, else by name). `_warMightRatio(member)`. `_wsWarResult(win, member)` now
  returns `{ burned|raised, name, level, sect, might }` (a win runs `_wsSetback`, a loss `_wsGrow`, never past caps) and logs it.
- Both resolvers store `odds` (read before the roll), `foeMight`, `ourMight` and `foeHall` on the last result.
- War declaration: `w.enemyTier = foe.tier` (it was random). Allies: `requestWarAlly` refuses the foe (`is_foe`); the
  `cheapest`/`best` order and the ally tile skip it.
- UI: `SectView._foeMountain`, `_pips`, the `_lastWar` bits, the `_stakes` copy; the breakdowns.js `sectwar` Might row;
  CSS "Phase 43c: their mountain".
- Checks: checks/npc-sects.js (43c block, +15). Smoke: scenarios/war-might.js (4 modes, zero console errors).

### Invariants (43c)
1. With a bound foe, the shown odds = the rolled odds (Monte Carlo: own war vs a strong and a weak foe; member war).
2. ratio = 1 with no bound record, or at peace.
3. A war never raises a sect past its own `maxBuildingLevel` / `maxHall`.
4. The ally is never the foe.

### Gotchas (43c)
- A joinable sect keeps one hall (`_wsSetback`'s floor), so a war can't burn it to nothing. Razing a sect is 43f (below): a razed record dies outright; the one-hall floor only applies to ordinary war losses.
- `playerMight()` for a founder counts disciples ×10 (43b), so a large sect lifts `us` quickly. Tune both in 43g.
- Early on, a Towering foe gives about 34% bare odds (check: Might 219 vs 70). Reinforcing or an ally lifts that to about 50%.

---

## 43d — the blessing scales with the sect (built 2026-10-02)

> The plan entry was thin (a hidden multiplier). The user picked all four depth adds: **build up your sect** (fund its
> halls), **rank share of the blessing**, **war damage → a levy event**, **a richer sect courts you**, and the factor
> shown on **both the ledger and the join list**.

### Depth pass
1. **Memory** — a sect remembers the hall it lost (`r.lastLost`), who paid to raise its halls (a deed, +6 stance), who
   paid / worked / refused the levy, and who went over to another sect (−35 and a deed on the old one).
2. **Choices** — fund any hall of your sect (which one, when, or save the stones); the levy (pay · lead the work crew,
   a roll that reads your personality and realm and costs Health · refuse); the court (go over · show the letter to
   your own master, a roll that reads **your sect's regard for you** · stay loyal). Rank-up stays your choice.
3. **Hooks** — the 43b world sim (growth raises your blessing, a fire/clash lowers it), 43c member wars (a lost war raids
   your sect's mountain → the levy), sect rank + Contribution, Spirit Stones, Health, karma, personality, the ledger
   + stance of every sect, the join list.
4. **Drama** — best: a Grand Elder in a fully-built sect (×1.65), or a rich sect sending for you. Worst: a lost war
   burns your sect's hall, the blessing thins, and the levy finds you broke; a failed work crew leaves you bleeding;
   your master catches you playing the court against him.
5. **Feedback** — refusing levies cools your sect, which makes leverage fail; envoys/gifts that warm other sects are
   what bring a court; defecting makes the old sect hostile (and likelier to come to war, 43b weighting).
6. **Agency** — every player decision is an explicit control. The world acts on its own (sects grow, fires, clashes,
   war raids, which sect courts you); nothing is chosen for you and the events never expire.

### UX pass
- **Surface** — Sect → Overview (member): the blessing card "You draw ×k of the full blessing" + a **why?** popover
  (`data-bd="blessing"`: base + levels + Sect Hall = factor, × rank share; the cap; what it could reach; the lost hall);
  each effect shows the scaled value beside a faint "of ×1.4". A burned hall gets a red warning line. Log lines name
  every change: "… the blessing on you thins to ×0.78" / "grows to ×0.86". The ledger + join list carry "blessing ×N"
  chips; the join list shows what a new Outer Disciple would draw. The rank-up tile names the next rank's share.
- **Interact** — "Fund their halls" fold: one tile per hall (cost · you draw ×a → ×b · +N Contribution, or the lock
  reason); the burned hall first. The levy/court reuse the event card (one click each).
- **Discover** — the levy fires the moment your sect loses a hall (urgent attention item + log line); the court
  arrives as a world event; the fold opens by default in the roomy layouts and when a hall is burned.
- **Debt** — see START_HERE → UX Debt (43d).

### Rules / math
- `wsBlessingFactor(r)` = clamp(0.6 + 0.1 × Σ hall levels + 0.08 × (Sect Hall − 1), 0.4, 1.5) (`SECT_BLESSING`).
  Seed: Azure 0.8 · Myriad Herb 0.7 · Thunder 0.98 · Void Moon 1.08 · Heaven Defying 1.5.
- k = factor × `rankShare[rank]` (0.8 Outer … 1.0 Peak Elder · 1.1 Grand Elder). `sectBlessingEffects(fx, k)`:
  a `*_mult` → 1 + (v−1)·k (never < 1); `bt_floor` → v·k capped 0.9; flat → v·k; booleans stay.
- `_recalc` applies it only for `s.sect.id` — a founder has no `s.sect`, so it never double-applies with `ownSect`.
- Fund cost = building stones × 1.8^level (Sect Hall: `SECT_HALL_LEVELS[lv−1].upgradeStones`) × (1 + 0.25·(tier−1));
  pays 0.75 Contribution per stone (gifts pay 0.5); the Sect Hall needs Elder; never past the sect's own caps.
- Levy: queued by `_wsMineLost` when your sect loses a hall (if no event waits), else eligible for `lostYears` (4).
  Court: a joinable sect ≠ yours, stance ≥ 20, your realm ≥ its minStage, its factor ≥ yours + 0.25; going over is
  locked during a member war, drops you one rank (Contribution = that rank's floor), drops active missions.

### API / wiring (43d)
- `sectBlessing()` → `{ factor, share, k, levels, hall, raw, recId }` | null · `sectBlessingInfo()` (the card) ·
  `fundSectHall(id | 'hall')` → reasons `no_sect` `unknown` `rank` `max_level` `stones` · `s.derived.sectBlessingK`.
- `_wsSetback(r, cause)` records `r.lastLost` and calls `_wsMineLost` for your sect; `_wsWarResult(lose, member)` raids
  your sect; `_tickWorldSects` logs your sect's growth and clears `lastLost` when the lost hall regrows.
- Event fields: `needs.mine/justLost/court`; choice `restore`, `contrib`/`failContrib`, `mineStance`/`failMineStance`,
  `defect`, `lockWar`, `health`, `odds.mineStanceDiv`; `{mine}` text token. `answerWorldSectEvent` → reason `war`.
- Checks: `scripts/sim/checks/sect-blessing.js` (36). Smoke: `scripts/smoke/scenarios/blessing.js` (4 modes).

### Gotchas (43d)
- This **re-balances live saves**: an early member's blessing drops (Myriad Herb Outer: k 0.56). Tune in 43g.
- The 43c member-war check resets your own sect each round now (a lost war raids it).
- The sim bot answers the new events (it may defect); since the final QA pass (2026-10-04) it also funds halls (bot.js `sectPolitics()`).

---

## 43e — the sect master + taking the sect over (built 2026-10-02)

> User picks: all four depth adds (**the master's regard**, **ask them to step down**, **the old guard's fate**,
> **the exiled master returns**) and halls **drop to Lv.1** on a takeover (the original ask). **No realm gate**.

### Depth pass
1. **Memory** — the master's regard *is* the sect record's stance (43b): missions (+1), answering a war call (+3),
   rising in rank (+2), levies/loyalty (43d) warm it; ignoring a call (−5), a refused petition (−12), a lost challenge
   (−15) cool it. The master keeps a `vsYou` fight record; an exiled master's splinter remembers you took their sect.
2. **Choices** — challenge (the battle page, your moves) · petition (no blood) · the end choice (finish → no splinter,
   karma; spare/raise/humble → exile, the splinter's stance by their feud: debt −10 · grudge −80 · else −50) · the old
   guard (win over for stones → a branch under their eldest at loyalty 35 · let them choose → about half stay, the rest
   join the exile · purge → none stay, −8 karma).
3. **Hooks** — combat (a new `sectmaster` fight kind: arts, parry, yield, end choices, manuals), the 43b registry (the
   record ends; an exile raises a splinter that lures your disciples and comes to war), 43d stance/levy/court, Phase 45
   branches (the old guard), the library (the shelf becomes yours), clan firsts (`took_sect`, 25 Merit), death
   (`_die('sect_master')` + an epitaph), karma, the founder systems (halls, the Base diorama, your own wars).
4. **Drama** — best: a Grand Elder at a low realm talks the master into handing over the seal, or beats them. Worst: the
   master makes it lethal and you die on their hall floor, or you spare them and their splinter bleeds you.
5. **Feedback** — years of service raise regard → better petition odds and a kinder lethal call; a cold sect makes the
   fight likelier to be to the death.
6. **Agency** — every player decision is a control; the master's lethal call and the petition's answer are theirs
   (shown as odds first).

### UX pass
- **Surface** — the master card on Sect → Overview (member): name + "sect master", realm, temper, regard chip (its tooltip
  lists what moves it), Might; the challenge tile (odds → the `personfight:<id>:sectmaster` popover, % they make it
  lethal, the loss), the petition tile (odds + why, the refusal cost); below Grand Elder both are locked ("Grand Elder
  only", "no realm is too low"); a Grand Elder also sees "The prize". After a takeover the sect card says "Taken from X in year N".
- **Interact** — one click + a confirm to challenge (opens the battle page); one click to petition; the old guard card
  (three tiles) at the top of the founder Overview.
- **Discover** — attention: "The master's seat" (ready: a Grand Elder who may act) · "The old guard of X" (urgent).
- **Debt** — Desktop leaves empty space under the master card's column; the battle page's lingering damage text.

### Rules
- Master stage = 10 + 3 × tier + 0–2 (never the last stage); temper = the sect's; name = the record's `leader`.
- Lethal % = 20 + `LETHAL_PERSONALITY_BONUS` + max(0, 40 − regard) × 0.5 + cruelty × `LETHAL_MORALITY_WEIGHT`, clamped 5–90.
- Petition = clamp(0.02 + 0.005 × max(0, regard) + 0.4 × yourMight / (yours + theirs), 0.03, 0.85); master Might = 10 + 6 × stage.
- Lose and live (or yield): rank → Elder, Contribution → its floor, cooldown 10–20 years, −15 regard. A refused petition: −12, cooldown 5–10.
- `_takeOverSect`: `ownSect` = { the sect's name, every hall it had at Lv.1, Sect Hall Lv.1, library = the shelf,
  3 disciples (60% of Hall Lv.1 seats), `oldGuard` of 3–6 Lv.3 veterans (peaceful 1–3), `takenOver` }; the world record is
  removed; `s.sect` cleared; `sectWar` = own; `took_sect`. Winning the old guard over costs 30 × tier × n stones.

### API / state (43e)
- State: `s.sect.masterId`, `challengeReadyYear`, `petitionReadyYear`, `challenges`; `ownSect.takenOver`, `ownSect.oldGuard`
  (`_blankOwnSect` + `_ensurePhase5Fields`); a person's `role: 'sect_master' | 'exile'` and `sectRecId`.
- `sectMasterInfo()` · `canChallengeSectMaster()` / `challengeSectMaster()` · `canPetitionSectMaster()` / `petitionSectMaster()` ·
  `oldGuardInfo()` / `answerOldGuard('win'|'go'|'purge')` · internal `_sectMaster(mint)`, `_sectmasterOutcome`, `_exileMaster`,
  `_takeOverSect`, `_masterLethalPct`, `_petitionOdds`.
- Data: `SECT_MASTER` (npc-sects.js), `DUELIST_ROLE_LOOK.sect_master`, `CLAN_FIRSTS.took_sect`, epitaphs `sect_master`.
- Checks: `scripts/sim/checks/sect-takeover.js` (31). Smoke: `scripts/smoke/scenarios/takeover.js` (4 modes; a real challenge won; the old guard).

### Gotchas (43e)
- A taken joinable sect's record is removed, so in a later life that sect can still be joined (`SECTS`) with the ×1
  blessing fallback (no record). 43f did **not** add this (it re-seeds only *razed* sects, via the ashes), so it is still open for 43g.
  **Fixed in the final QA pass (2026-10-04; user: "it should definitely come back for sects you used to own"):**
  - The cause: `_lineageRecord()` always minted `defId: null`, so a taken sect that lived on as a lineage sect lost its
    gate. `_wsFromOwnSect` now keeps `ownSect.takenOver.defId` on the record (unless another living record holds it).
  - **The world keeps its gates** — `_wsKeepGates()`: every SECTS gate has a living record unless it is yours right now
    or its ashes are smoking. A lineage record that lost its gate gets it back by name; otherwise the gate raises a fresh
    `joinable` record in its seed shape (origin `regated`, hash-seeded, no Math.random) + a chronicle line. Runs each
    world year (after `_tickAshes`), in `_ensurePhase46Fields` (old saves), in `joinSect` and after `disbandOwnSect`
    of a taken sect ("its gate opens again under a new master").
  - Ashes: any record that held a gate (a lineage sect too) always rises again (`_tickAshes`).
  - `sectBlessingInfo()` no longer throws on a missing record (×1, no halls). Checks: sect-takeover.js (+10).
- `canChallengeSectMaster()` mints a missing master (random draws); attention calls it only for a Grand Elder.
- The sim bot petitions (≥ 50%) or challenges (≥ 65%, rarely lethal) as a Grand Elder and answers the old guard since the final QA pass (bot.js `sectPolitics()`).

---

## 43f — raze an enemy sect (built 2026-10-02)

> User picks: **the world reacts + the remnant returns** (no sack choice, no change to the war odds); **own-sect wars
> only** (a member can't raze — their master leads the war). Built in part 80; docs written 2026-10-03.

### Depth pass
1. **Memory** — every living sect writes a deed ("you burned the X to the ground") into its stance; `world.sects.razed`
   counts them, `dread` remembers them (fading), `ashes` keeps the last 8 burnings, `ownSect.razed` feeds sect fame, and a
   remnant carries a `grudge` + an `ashOf` link. `_noteEnemy` records the survivors as enemies of your line.
2. **Choices** — the vow on the War panel (swear / lift, per war), the standing order **Raze if we win** (Never · Wars
   they start · Every war), and the remnant heir's **vengeance** event: pay a blood-price (80 × tier stones, clears the
   grudge) · face the heir alone (a duel roll read from your temper + the stage gap; win clears it, lose −20 Health) ·
   scorn them (they march on you at once).
3. **Hooks** — sect wars (the vow resolves on a won own-sect war; dread can stop a war before it starts), the 43b
   registry (the record dies; a remnant is a new rival record), 43h relations (every sect's stance moves), karma, sect
   fame, the library/arts (a manual from the ruins), the clan firsts (`razed_sect`, 20 Merit), the join list (a burned
   joinable gate is sealed), the Chronicle, health (the heir's duel).
4. **Drama** — best: you answer an invader by wiping it off the map, take its treasury and a manual, and your dread
   turns the next weak foe back at the border. Worst: righteous sects turn cold, the survivors rise again as **Reborn X**
   with twice the growth and twice the appetite for war, and the heir bleeds you on the old ashes.
5. **Feedback** — the more you raze, the more dread (fewer weak foes come) but the colder the righteous world; razing a
   sect that attacked you costs less karma and half the outrage; a remnant's feud ignores dread entirely.
6. **Agency** — the vow and the standing order are the player's; a vow set by hand on a war always beats the order. The
   remnant's return and the world's reaction are the world's rolls (odds shown on the vow tile first).

### UX pass
- **Surface** — the War panel's **Vow to raze** tile lists what it brings before you swear: treasury stones + herbs, the
  manual chance, karma (provoked or not), fame, + dread, how many sects recoil / respect it (and the worst one), and the
  remnant's odds. "Their mountain" notes the vow; the **Last war** card says "razed" with the haul. World → Sects: a
  **Dread** line in the ledger footer (the turn-back chance), an **Ashes you made** fold (smoking / scattered / reborn),
  a feud tag on a remnant's row and page; the join list shows **In ashes · Burned to the ground**.
- **Interact** — one click to vow or lift (War panel); the standing order is a segmented row in Standing Orders.
- **Discover** — the vow tile sits in the war's own actions; the vengeance letter is an attention item + a card on
  Sect → Overview; log lines name the cause (the burning, a foe turning back, the ashes stirring).
- **Debt** → START_HERE UX Debt: the order labels wrap in Expanded; long chips wrap boxy (split brings / costs); the
  Desktop ledger footer should give the Dread line its own line.

### Rules (SECT_RAZE in npc-sects.js)
- Treasury = 60 × tier + 40 × total hall levels stones; 3 × levels Spirit Herbs; a manual at 60% (graded by tier, from
  `SECT_RELATIONS.trade.offerWeights`). Karma −8 (you declared) / −3 (provoked: they declared, or a remnant's feud).
  Fame +15 per razed sect (`ownSect.razed`).
- Outrage per living sect = −(master's `PERSONALITY_MORALITY`) × 0.3, × 0.5 when provoked, capped ±20.
- Dread += the razed tier (max 12), −0.5 per game year. A war about to start against you is called off with chance
  min(0.6, dread × 0.08), only when the foe is **weaker** than your Might and has **no grudge**.
- Ashes: 3–6 years later a **joinable** sect always returns (same name, stance −50; its gate is sealed until then); a
  rival returns with chance clamp(0.35 + survivors/60 − 0.1 if provoked, 0.2, 0.85) as "Reborn X" (tier −1, stance −70,
  `grudge`: growth × 2, war weight × 2), else it scatters. Survivors = disciples × (1 − war loss) × 0.3.
- A lost war under the vow burns nothing (the normal 43c lost-war rules apply).

### API / state (43f)
- State: `sectWar.razeVow` / `razeSet` (reset each new war), `warOrders.raze` (`WAR_ORDER_RAZE_OPTIONS`, migrated in
  `_ensurePhase32Fields`), `world.sects.razed` / `dread` / `ashes[]`, `ownSect.razed[]`, a record's `grudge` / `ashOf` /
  `razedYear`.
- `razeInfo()` · `setRazeVow(on)` · `razeWorldInfo()` · `sectInAshes(defId)` · internal `_applyRazeOrder`, `_razeProvoked`,
  `_razeOutrage`, `_remnantChance`, `_wsRaze` (from `_wsWarResult` on a win under the vow), `_tickAshes` (yearly, from
  `_tickWorldSects`). `joinSect` refuses with `reason: 'ashes'`.
- Data: `SECT_RAZE` + the `vengeance` world-sect event (npc-sects.js), `WAR_ORDER_RAZE_OPTIONS` (sect-war.js),
  `CLAN_FIRSTS.razed_sect` (clan-legacies.js).
- Checks: `scripts/sim/checks/sect-raze.js` (41). Smoke: `scripts/smoke/scenarios/raze.js` (4 modes). UI review 7.7.

### Gotchas (43f)
- `_claimFirst('razed_sect')` only fires while the war resolves live (`_warLive`): offline catch-up must not change
  `world.clans` (the save round-trip check).
- The dread turn-back returns before `w.enemyId` is set and reschedules the next war; it never fires for a member war.
- A taken-over sect (43e) is still not re-seeded in a later life (see 43e's gotcha).
- The sim bot vows to raze since the final QA pass (active when provoked, casual 1 in 3; afk leaves it to the standing order).

---

## 43h — sect relations: see a sect, and act on it (built 2026-10-02)

> The user (2026-10-02): *"I am not seeing the way to view other sects or declare war with other sects or interact with
> them as a sect leader … a user needs to be able to interact with these systems."* It was an oversight: 43b–43e let the
> world act on you (wars on a timer, events) but gave the player no way to act first. User picks: a **sect detail page**
> (not a 6th sub-tab), **all four leader groups** (declare war · diplomacy · coercion · trade and people), and **a smaller
> member set**. Built before 43f (razing builds on "declare war").

### Depth pass
1. **Memory** — every action leaves a deed on the sect (stance ± with the reason) and a per-sect cooldown (`r.acted`).
   An unprovoked war or a broken oath cools every sect that thought well of you. The sect's offer of a manual is kept
   for the year (`r.offer`); its sparring disciple too (`r.sparFoe`).
2. **Choices** — all buttons. Leader: send a gift · propose an alliance (Cordial 40+) / break it · declare war · demand
   tribute · send a spy · trade manuals (pick yours) · poach a disciple. Member: gift · spar with one of their disciples ·
   urge your master to war on them. Only their reply rolls (alliance: temper + stance; tribute: Might; spy: realm gap,
   their Defensive Array, your personality; poach: Might; urge: your regard, whether they wronged you, your master's temper).
3. **Hooks** — sect wars (a declared war enters the same state machine against that record; a refused tribute / a caught
   spy can bring them marching), 43b stance + events + war weighting, 43c Might odds, 43e master regard (urging), arts
   (traded or stolen manuals), own-sect disciples (poaching), combat (the spar is a battle-page fight kind `spar`), karma, Health.
4. **Drama** — best: a sworn alliance with a Towering sect; a stolen Earth-grade manual. Worst: your spy is caught and
   the sect marches on you; you break an oath and every friend cools; tribute wrung from a proud master becomes a grudge.
5. **Feedback** — stance gates alliance (40+) and trade (−20+); wars you start make enemies; a sect you pressed comes to war more often (43b).
6. **Agency** — you start everything; nothing is chosen for you.

### UX pass
- **Surface** — the page (`#sect-overlay`, SectDetail): hero (name, leader + temper, band, disciples, stance, ties, blessing,
  Might bars vs yours, "in a war they would fight at ×N"), action groups (Diplomacy · War · Pressure · Trade and people ·
  A visit) with cost, real odds, green gains / red costs / dim facts and a lock reason, their halls, their memory of you.
  The border turns red at war, jade for a sworn ally; the title says so.
- **Interact** — Expanded/Desktop: tap a row in "Sects of the world" (moved up: under Duties for a member, under "Your
  mountain" for a founder). Overlay/phone: one "Sects of the world" tile → the full list in the modal → a sect, with an
  "All sects" back link. Declare war / break an alliance confirm. A spar opens the battle page; a war opens Sect → War.
- **Discover** — a hint line on the list; every result is a toast + a log line naming the cause; the list marks "at war".
- **Fixes 43b debt** — 4-line rows → 2 (1 in compact); the Overlay/phone list folded shut → a tile that opens it.

### Rules (SECT_RELATIONS in npc-sects.js)
| Action | Who | Cost / gate | Their reply | Cooldown |
|---|---|---|---|---|
| gift | any | 20 × tier stones | +10 stance (temper-shaded) | 3 |
| alliance | leader | stance ≥ 40 | 0.3 + 0.01/stance above 40 + temper → sworn, +15 · refused −5 | 5 |
| breakAlliance | leader | sworn | −40, −3 karma, others −4 | — |
| war | leader | not sworn, no war underway | none: the war starts (scouting); −25; unprovoked (stance > −20): −3 karma, others −3 | 6 |
| tribute | leader | not sworn | your Might/(yours+theirs): +60 × tier stones, −25 (temper) · refused −30, 30% they march | 5 |
| spy | leader | — | 0.45 + 0.03 × stage gap − 0.08 × their Array + you: stones (40 × tier) or a manual (50%), −2 karma · caught −35, Health −10, 50% they march | 4 |
| trade | leader | stance ≥ −20; a manual within 1 grade of theirs | accepted: theirs for yours, +5 | 3 |
| poach | leader | 25 × tier stones; a free seat | 0.5 + (Might gap)/400: a talent 2–4 Lv.2–3 disciple, −20 · failed −10 (stones lost) | 4 |
| spar | member | not in a fight | a nonlethal battle-page fight: win → +20 × your sect's tier Contribution, +3 | 2 |
| urge | member | no war underway | 0.2 + 0.005 × regard + 0.15 if they wronged you + master temper: your sect marches on them, +2 regard · refused −5 | 5 |

### API / state (43h)
- `sectRelationsInfo(recId)` → { sect (ledger row), role, isMine, warHere, myMight, ratio, actions: [{ id, label, glyph, group,
  cost, odds, bits[{t, tone}], lock, confirm, offer?, yours? }] } · `sectAct(recId, id, arg)` → { ok, success, text, fight? } ·
  internal `_openWarOn(r, member, byYou)`, `_relOffer`, `_relSparFoe`, `_relOdds`, `_relOthersCool`, `_sparOutcome`.
- State: record `acted` (per action: the year it may be used again), `offer`, `sparFoe`; `sectWar.declaredByYou`.
- UI: `renderer/game/sect-detail.js` (SectDetail: open(id) / openList()), `SectView._ledger(s, full)`, `#sect-overlay`.
- Checks `scripts/sim/checks/sect-relations.js` (25) · smoke `scripts/smoke/scenarios/sect-relations.js` (4 modes + the modal list,
  gift, trade pick, declare war, a sworn ally, a member's spar).

### Gotchas (43h)
- The spar foe lives on the fight (`fi.foe`), like a road stranger; `_ensure…` keeps a `spar` fight alive only with its foe.
- A spar / master fight that ends in "humble" no longer cows your clan (that rule is for clan fights).
- The founder Overview in Overlay drops the Fame breakdown and the chronicle to stay ≤ 3 screens (2.89).
- The sim bot uses relations since the final QA pass (bot.js `sectPolitics()`: trade, alliance, war, tribute, spy, poach, gift · spar, urge).

### Phase 46 — a player's sect outlives them + the world's leaders age out (built 2026-10-03)

> The user (2026-10-03): *"the players controlled sect should be inherited by one of the branch members and continue
> to exist when you reincarnate … the player should be able to be recruited into their previous lifes sect when they
> hit core formation. the npc world sim should sim people dying and things as the years pass."* Full spec:
> **`docs/systems/lineage-sect.md`**. This section is the world-sect half.

- **A new kind: `lineage`.** `_wsFromOwnSect(o, w)` mints a real world-sect record from a dying founder's `ownSect` —
  `kind:'lineage'`, `origin:'inherited'`, the same `buildings`/`hallLevel`, `disciples` = the roster size, the
  **global caps** (a player-founded sect reaches them), `stance: 70`, and `lineageOf`/`founderName`/`leaderSince`. Its
  leader is the **branch head with the highest loyalty** (`_lineageInheritor`; else the strongest disciple, else a
  steward) — deterministic, no `Math.random`. It runs in `_recordLifeInWorld` **outside** the clan block, so an
  orphan founder keeps their sect too.
- **It keeps living.** `_wsSetback` and the dissolve loop treat `lineage` like `joinable` (never auto-dissolves,
  keeps ≥1 hall); it grows, churns, is warred over and can be razed like any sect. `worldSectsInfo`/`_wsRow` carry
  `lineage`/`founderName`; the World → Sects ledger shows a "your line's sect" tag. `clan.sect` becomes a light claim
  (`{name, hallLevel, worldSectId, …}`) — the reign sim skips its fortune roll for a linked sect.
- **Membership by id.** `_wsById` + `_wsMine` (by `defId` **or** record id), and `_sectDef()`'s `_lineageSectDef`
  fallback, let the player belong to a lineage sect (joined at Core Formation — lineage-sect.md → 1.20d) with rank,
  missions, blessing and the master systems all working.
- **Leaders age out (`_wsCheckSuccession`).** A per-year chance rising with tenure (`WORLD_SECT_LEADERS`: base 0.05
  + 0.006/yr, capped 0.35) retires a leader or kills them in a struggle for the seat (`seat_struggle`, 35%; since Phase 28
  4.3 masters and elders also die in the world's own life step — age, backlash, the road — and the senior elder takes the
  seat, living-world.md → "4.3 as built") → a new `leader` name, maybe a new `temper`, a chronicle line (and
  a player log line for a lineage sect). A flavour "hopefuls take the oath" line rides the disciple drift.
- **Migration.** `_ensurePhase46Fields` turns a pre-46 dormant `clan.sect` (no `worldSectId`) into a record once;
  `_ensurePhase43bFields` defaults `leaderSince` and the lineage fields. `_installHead` no longer hands a living sect
  over with the clan seat.
- **Tests:** `scripts/sim/checks/lineage.js` (36) · `scripts/smoke/scenarios/lineage.js` (4 modes + join).
- **Gotchas:** a lineage def has **neutral effects** (a founded sect had no joined-sect blessing) — the reward is the
  connection + the road back to owning it; the report's "Between lives → Sect" column now reads zeros (the fate is
  `lineage`, not grow/hold/decline/lost).

## 43h follow-up — 世 World tab, War → Declare war, Disciples → Poach recruits (user 2026-10-02)
> *"i dont like it — lets make the log tab a world tab and have the sects of the world there; lets also make it so you
> can declare a war on a sect: a button on the war tab where you click it then select a sect; and a poach recruits button
> in recruits where you select a sect then it takes you to their disciple list to try to poach."* User picks: the mark
> **世 World** (replacing 錄; the group id stays `log` for saved nav state), the sect page **inline in World** (the popup
> is gone), and Declare war / Poach **in both places** (the sect page's buttons lead into the same flows).
- **World → Sects** (`renderer/game/world-view.js`, `#tab-world`): the ledger (`SectView._ledger`), a row → that
  sect's page inline (`SectDetail.html`), "All sects" back. Other views link via `WorldView.show(id)` + `nav.go('world')`.
  The Sect Overviews carry a "Sects of the world" tile into World instead of the list (`_worldLink`).
- **Sect → War → "Declare war"** (a member: "Urge war on a sect"), shown at peace: `_warPicker` lists every sect with
  the war action's bits + lock (ratio, stance cost, unprovoked karma / your master's odds) → confirm → `sectAct(id, 'war'|'urge')`.
- **Sect → Disciples → "Poach recruits"** (a button in the "At the gate" header): `_poach` — pick a sect
  (`poachTargets()`, each with its lock) → its named disciples (`poachRoster(id)`: talent, level, loyalty, cost, odds,
  stance) → "Lure them away" → `poachDisciple(id, discipleId)`. The sect page's Poach button calls
  `SectView.startPoach(id)` and opens Disciples with that sect picked.
- **Poach rules** (SECT_RELATIONS.poach): each sect keeps a roster of up to 6 named disciples, rolled once a game year
  (`r.roster`; talent leans on tier, level 1–4, loyalty 30–90). Cost = 25 × tier × (1 + 0.5 × (talent − 1)); odds =
  0.6 + (your Might − theirs)/400 − (loyalty − 50)/150 − 0.06 × (talent − 2), clamped 5–95%; success: they join as they
  are, −20 − 5 × (talent − 2) stance, the deed names them; failure: the stones are lost, −10, that disciple +10 loyalty.
  Cooldown 4 years per sect; needs a free seat.
- **Overlay ≤ 3 screens** (sect.js smoke): Overview 2.77, Disciples 3.00 — the Poach button lives in the gate's header;
  candidates' dim "at Lv.1" note hides in Overlay. The smoke clears a pending world event before measuring (it is transient).
- Smoke `scenarios/sect-relations.js` rewritten for the World tab + both pickers (4 modes); `npc-sects.js` follows the list
  to World; `nav-attention.js` expects 修歷家宗囊世.

## Phase 28 (4.6) touches (2026-10-03)
- `_wsChron(text, sectId, pids, notable, routine)` also writes the merged world Chronicle (`w.chron`, World → Chronicle);
  `sects.chronicle` (cap 14) is still kept. The ledger's folded chronicle is now a link card (latest line) → Chronicle,
  Sects filter. "N hopefuls take the oath" lines are routine (Sects filter only).
- A **hidden master** (an old monster out of seclusion, living-world.md "4.6 as built") can seize the seat of a sect whose
  master is ≥ 2 stages below them (the old master falls or withdraws, the sect's temper becomes theirs, its stance toward
  you halves) or found a tier 2–3 sect (`origin: 'hidden_master'`; `_wsNewRival` now takes an `rng`).
- An empty elder's seat is filled from the living first (`_wsEnsurePeople(r, true)` → `_wsDraftElder`).
