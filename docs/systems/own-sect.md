# Own Sect (Found a Sect) — Reference
_Covers: assets/data/sect-buildings.js · game-state.js · game.js (renderOwnSect) · index.html · styles.css · Phase: 5A · Updated: 2026-09-25_

Phase 5B (Sect Wars) is now built — see [sect-war.md](sect-war.md). It reads `derived.warDefense`/`sectFame`
computed here, and can zero out Defensive Array's `war_defense` contribution via `sectWar.arrayDamagedUntil`.

> **Sect library (user 2026-09-30):** `ownSect.library` — manuals you give your own sect. Each adds war strength
> (`sectShelfWar`, ×(1 + Σ by grade, cap 25%) in `_resolveSectWar`), and you study a shelved art at half time without a manual
> (`studyFromSect`). Shown at the bottom of Sect → Halls. arts.md → "Giving manuals to your sect".

## State
- `ownSect: { founded, name, foundedAt, hallLevel, buildings, disciples, recruitPool, poolRefreshAt, _incomeAcc }`
  - `founded: bool` · `name: string` (≤20 chars) · `hallLevel: 1–3` (Sect Hall; each level = +5 disciple cap, Lv1 = 5)
  - `buildings: { [buildingId]: level }` — non-hall buildings, **levelled since Phase 43** (`0`/absent = not built, `1..3`;
    see npc-sects.md). An old save's `true` migrates to `1`, and level 1 is exactly the old effect.
  - `disciples: [{ id, name, talent(1–5), level(1–10), xp }]` — max `discipleCap` (5/10/15/20)
  - `recruitPool: [{ id, name, talent }]` — 3 candidates; regenerated when `Date.now() ≥ poolRefreshAt` or on paid reroll
  - `_incomeAcc: { spirit_stone, spirit_herb }` — fractional income carried between ticks (internal)

## API (game-state.js)
- `foundOwnSect(name)` → `{ ok, reason? }` — reasons: `stage`(<19, Spirit Severing — where void_crystal first drops), `in_sect`, `founded`, `stones`, `crystals`. Costs 500 stones + 50 void crystals; builds Sect Hall Lv1.
- `buildSectBuilding(id)` → `{ ok, building?, reason? }` — reasons: `no_sect`, `unknown`, `built`, `stones`, `items`
- `upgradeSectHall()` → `{ ok, level?, reason? }` — reasons: `no_sect`, `max_level`, `stones`
- `upgradeSectBuilding(id)` → `{ ok, level?, reason? }` — Phase 43: deepen a raised hall; reasons `no_sect`, `unknown`,
  `not_built`, `max_level`, `stones`. `sectBuildingUpgradeCost(id)` → the next level's stones (or `null`).
- `recruitDisciple(candidateId)` → `{ ok, disciple?, reason? }` — reasons: `no_sect`, `not_found`, `full`, `stones`. Cost `DISCIPLE_RECRUIT_COST × talent²`.
- `rerollRecruitPool()` → `{ ok, reason? }` — costs `RECRUIT_REROLL_COST` stones
- `dismissDisciple(id)` → `{ ok }` — free, no refund
- `disbandOwnSect()` → `{ ok }` — wipes `ownSect`, karma −10; buildings/disciples are lost
- `ownSectInfo()` → UI read helper (1.8b-5, no state change): per-disciple `{ d, qi, stonesMin, herbsMin, max, xpFrac, eta, fame }`,
  candidates `{ c, cost, qi, stonesMin, herbsMin, ok, reason }`, buildings `{ b, built, stonesShort, missing, ok }`, `totals`,
  `hall { level, cap, nextCap, cost, ok }`, `fame` terms. Mirrors _recalc/tickOwnSect exactly (checks/sect-view.js).
- `tickOwnSect(dt)` → void — internal; called from `tick(dt)` and from offline catch-up in `initSlot`

## Data Shape (assets/data/sect-buildings.js)
- `SECT_FOUNDING`: `{ minStage, stones, items: {itemId: qty}, maxNameLen }`
- `SECT_HALL_LEVELS[]`: `{ cap, upgradeStones }` (index = hallLevel−1; `upgradeStones` = cost to reach the NEXT level)
- `SECT_BUILDINGS[]`: `{ id, name, nameCN, desc, stones, items, effects }`
  - effects keys: `disciple_qi_mult`, `craft_double_chance`, `beast_slots`, `disciple_xp_mult`, `war_defense`, `income_mult`
- `DISCIPLE_*` constants: recruit cost, reroll cost, pool size/refresh, per-second income/Qi/XP rates, `DISCIPLE_MAX_LEVEL`
- `DISCIPLE_SURNAMES` / `DISCIPLE_GIVEN` — name pools (move to `npc-names.js` in Phase 15)

## Wiring
- `_newGame()` seeds `ownSect`; `_ensurePhase5Fields()` migrates old saves (called from `_recalc`).
- `_recalc()`: Σ disciples → `qps *= 1 + discQiFrac`; building effects → `derived.maxBeasts`, `sectCraftDouble`,
  `warDefense`, `discipleCap`, `sectFame`, `ownSectIncomeMult`.
- `tick(dt)` → `tickOwnSect(dt)`: income (stones/herbs), disciple XP/levels, recruit-pool refresh.
- `initSlot()` offline catch-up applies `tickOwnSect(elapsed)` (elapsed capped at 8h like Qi).
- UI: `renderer/game/sect-view.js` (1.8b-5) — Sect → Overview · Halls · Disciples · War for a founder; the no-sect
  Overview holds the founding card. See ui-layout.md → "Sect views".
- **Sect → Base scene (A7 / Phase 38A):** a founder's 5th sub-tab draws the compound as a large view-only ink diorama
  (`renderer/game/base-view.js` + `renderer/engine/scene-renderer.js` + `assets/scenes/sect-base-scene.js`), reading
  `ownSect.hallLevel` / `buildings` / `disciples` and `derived.sectFame` / `derived.arrayDamaged`. It never writes
  state and exposes no build control. See [scene-art.md](scene-art.md).

## Invariants
1. `ownSect.founded` ⇒ `sect.id === null` (can't be in both; `joinSect` rejects `own_sect`).
2. `disciples.length ≤ derived.discipleCap`; `level ∈ [1,10]`; `talent ∈ [1,5]`.
3. `beasts.length ≤ derived.maxBeasts` (3, or 5 with Spirit Beast Pen). Releasing/disbanding never removes beasts.
4. Sect Hall exists whenever `founded` is true (it is not in `buildings`; `hallLevel` ≥ 1).
5. Income only credits whole units; the fractional remainder stays in `_incomeAcc`.

## Gotchas
- Divergences from PLAN.md: crafting is instant in this game, so Pill Hall "Craft speed ×2" is implemented as +40% double-output chance
  (stacks additively with Phase 4 Myriad Herb Hall, capped at 100%). Sect Hall is upgradeable (Lv1–3) to reach the 20-disciple cap.
  Recruiting picks from a 3-candidate pool instead of a blind roll.
- Disbanding is destructive and asks for a double-click confirm in the UI.
- Beast cap was hard-coded `3` in game.js (Explore/Stats) and game-state.js (`tameEncounteredBeast`); all now read `derived.maxBeasts`.
- Re-rendering the Sect tab on any state change used to wipe the founding name input; since 1.8b-5 SectView keeps the
  typed name in `foundName` and restores it after each render.
- Defensive Array's desc was dev-speak ("used by sect wars, Phase 5B"); reworded 1.8b-5.
- ~~Buildings have no levels: once all six are raised the Halls view has nothing left to do but the Sect Hall.~~
  **Fixed in Phase 43** — every hall is levelled (1→3) and can be deepened for a stronger effect.

## Phase 28 (4.5): recruits at the gate are people of the world (2026-10-03)
`_refreshRecruitPool` → `_genRecruit(exclude, true)` offers an unsworn youth of the world (a wave's child, a classmate without
a sect) about 75% of the time: the entry carries `pid`, stars come from their root (heavenly 5 · pure 4 · dual 3 · else 2), and
`recruitDisciple` keeps the pid, so the disciple IS that person. Other `_genRecruit` callers (branch recruits, poach rosters,
dev presets) never cast. Their names are tappable, with the "known face" pill.
