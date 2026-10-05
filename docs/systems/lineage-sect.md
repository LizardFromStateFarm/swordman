# Lineage Sects, Reincarnation Continuity & Bloodline Qi (Phase 46) — Spec + Reference
_Covers: assets/data/{bloodline,clan-legacies,npc-sects,succession}.js · renderer/engine/game-state.js ·
renderer/game/{sect-view,world-view,sect-detail,attention,breakdowns,clan-view}.js · renderer/game.js ·
Phase: 46 · Updated: 2026-10-03 · **Status: built (46a–46e) — Visual Review Gate 7.6 PASS, checks/lineage.js (36), smoke scenarios/lineage.js**_

Three linked changes to the reincarnation ↔ sect ↔ bloodline loop, requested by the user 2026-10-03:

1. **A player-owned sect outlives the player.** On death, a **branch head inherits** the sect (else the strongest
   disciple) and it becomes a **living world sect** (`s.world.sects`, `kind: 'lineage'`) that grows and changes like
   any other — it is no longer a `clan.sect` snapshot the reign sim can quietly lose.
2. **Ancestral catch-up is removed.** No more Qi/s ×2.5, no +10% breakthrough chance, no catch-up auto-breakthrough.
   Instead, **Bloodline Quality gives extra Qi/s** (`BLOODLINE_QI_COEF` = 0.004 → up to +40% at BQ 100 when 46 shipped;
   **Phase 47 (2026-10-03) raised it to 0.01 → ×2 at BQ 100**, and made the full bloodline a hard requirement for the
   Trial — see bloodline.md → "Phase 47") — a stronger bloodline is the head start, not a special "catch-up" function.
3. **You can be recruited back into your old sect.** When the next life reaches **Core Formation**, that lineage sect
   sends an offer to join as an Outer Disciple (or decline). The world sim now also **ages and kills NPC sect
   leaders and churns their members** over the years — so by the time you return, the branch member who inherited
   your sect may be long dead and someone else may hold it.

## User picks (2026-10-03)
- Sect inheritance: **living world sect** (a branch head inherits; it keeps living in `s.world.sects`).
- Re-entry: **they recruit you** (an offer at Core Formation; join or decline).
- Bloodline → Qi: **moderate, +0.4%/point** (linear, max +40% at BQ 100) — **Phase 47 (2026-10-03) later raised this
  to +1%/point (×2 at BQ 100)** and gated the Ascension Trial on the full bloodline (bloodline.md → "Phase 47").
- NPC sim: **leaders + members churn** (leaders age, die and are replaced; rosters churn).

## Depth pass (CLAUDE.md)
1. **Memory** — the inherited sect joins the world's memory: its `deeds`, `stance` toward you, its own growth and
   `chronicle`; it remembers it was founded by your line (`lineageOf` / `founderName`). Bloodline Quality carries
   as a visible Qi/s multiplier every life after the first.
2. **Choices** — **join or decline** the Core-Formation recruitment offer; (implicit) everything you do to the world
   sect afterward is the existing 43h relation set. The inheritance itself is the world's/section's, not a forced
   player roll.
3. **Hooks (≥3)** — succession/rebirth (`_recordLifeInWorld` → `_beginInterlude` → `_beginLife`) · the world-sect
   registry + sim (`_tickWorldSects`, `_wsGrow`, `_wsSetback`, wars, razing) · bloodline (the Qi/s term replaces
   catch-up) · clan legacies + the stipend (`clan.sect`) · the join flow (`_sectDef`, `joinSect`, `_wsMine`) · the
   bequest + clan legacies (unrelated but adjacent in the interlude).
4. **Drama** — best: three generations on, your old sect is a Towering power led by the branch head's successor, and
   it takes you back as a nameless Outer Disciple you founded once. Worst: the sell you founded was razed by a rival
   two generations ago; nobody comes for you at Core Formation, because there is no sect left to come.
5. **Feedback** — how well you built the sect and how loyal your branch heads were shapes whether it survives, who
   leads it, and how it treats you when you return (stance, rank welcome). Bloodline Quality from your rearing
   compounds into every later life's Qi.
6. **Agency** — joining/declining is an explicit choice. The inheritance pick and the world's aging are the world's
   (a dead player cannot choose), shown in the chronicle. No player decision is simulated.

## UX pass (CLAUDE.md)
1. **Surface** — the Qi/s "why" popover gains a **Bloodline Quality** row (visible once BQ > 0, i.e. from the 2nd
   life); the Stats Bloodline tile shows both its Ascension and Qi/s effects; World → Sects shows a lineage sect with
   a "founded by <your line>" tag and its current (possibly changed) leader; the death/interlude chronicle names who
   inherited the sect.
2. **Interact** — one click to **join** or **decline** on the Core-Formation offer card; nothing else is new (the
   world sect is managed with the existing 43h relation actions).
3. **Discover** — the recruitment offer raises a **urgent attention item** and a log line ("Riders from the <name>
   come…"); the Qi/s breakdown explains the bloodline bonus; a lineage leader change logs a line.
4. **Feel** — xianxia wording ("your ancestor's sect", "the gate you raised"), `--gold` for the lineage tag, the
   existing letter/event card vocabulary; honour text size / colour-blind setting.
5. **UX debt** — the no-sect sect view gains one more card (watch the Overlay ≤3-screen bar); leader churn could get
   noisy in the world chronicle (cap it).

## 46a — Bloodline Quality replaces ancestral catch-up
- **Data:** `bloodline.js` gains `BLOODLINE_QI_COEF = 0.004`. `clan-legacies.js` drops `CATCHUP_QPS_MULT`,
  `CATCHUP_BT_BONUS`, `CATCHUP_AUTO_BT`. (`REFINED_MERIDIANS`, `ANCESTOR_BLESSING_QPS*` stay — permanent legacy
  bonuses, not catch-up.)
- **Engine `_recalc`:** remove `inCatchUp`, the ×2.5 Qi/s term, the `+0.10` BT term, `derived.catchUp` and
  `derived.catchUpUntil`. Add `qMul('Bloodline Quality', 1 + bq * BLOODLINE_QI_COEF)` (only when `bq > 0`).
  `clan.bestStageIndex` stays (Hall Records display only).
- **Engine `_tickAutomation`:** remove the catch-up auto-breakthrough block entirely.
- **UI:** `game.js` drops the catch-up HUD chip + the Character catch-up button; the Bloodline tile shows the Qi/s
  effect; `breakdowns.js` drops the catch-up note, updates the Bloodline card, and shows the tile from BQ > 0.
- **Checks:** `checks/breakdowns.js` (drop the `catchUpUntil` assert; assert the BQ Qi term), `checks/succession.js`
  (replace the catch-up asserts with "BQ > 0 ⇒ Qi/s up, and no catch-up keys on `derived`").

## 46b — A player-owned sect is inherited on death
- **Data:** `npc-sects.js` gains `WORLD_SECT_LINEAGE` (the inheritor pick weights, the lineage record's stance,
  caps, and the "no leader, a steward" fallback).
- **Engine:** `_wsFromOwnSect(o, w)` creates the `kind: 'lineage'` record from `s.ownSect` — name, `defId`
  (kept if it was a taken-over joinable sect), `buildings` (levels), `hallLevel`, `disciples` count, `leader` =
  the inheriting branch head (highest loyalty; tie → strongest branch) else the strongest disciple else a steward,
  `temper`, global caps (`SECT_BUILDING_MAX_LEVEL` / `SECT_HALL_LEVELS.length`), `stance` high (it remembers you
  founded it), a founding deed, `lineageOf` = the dead player's person id, `founderName`, `bornYear`, `leaderSince`.
  Called from `_recordLifeInWorld` where the founded-sect snapshot is built today. `clan.sect` stays as a light
  `{ name, hallLevel, worldSectId, heirId }` pointer for the stipend + the "a sect took the clan's" enemy note.
- **Reign sim:** for a `worldSectId`-linked clan sect, skip the grow/decline/**lost** fortune roll (the world sim
  owns its fate); the chronicle names the sect and its current leader instead.
- **World sim:** a `lineage` record never auto-dissolves and keeps ≥1 hall (joinable-style floor) so it continues to
  exist; it can still be burned in a war / razed like any sect.
- **`_wsMine` / `_wsById`:** joining or relating to a lineage sect works by record id (no `defId` needed).
- **UI:** `_wsRow` carries `kind`/`lineage`/`founderName`; World → Sects + the sect page show the lineage tag and
  its current leader; `ownSect` is cleared for the new life (the sect is the world's now, not `clan.sect`'s).

## 46c — NPC sect leaders age and die; members churn
- **Data:** `npc-sects.js` gains `WORLD_SECT_LEADERS` (a seat tenure curve: a per-year change chance rising with
  years in the seat, capped; a new leader's temper may shift).
- **Engine `_tickWorldSects`:** each record with a `leaderSince` too old rolls a succession → a new `leader`,
  maybe a new `temper`, a chronicle line, and (for the player's lineage sect) a player log line. Members churn a
  little beyond the existing drift (an occasional leave/join line). Applies to every record including lineage.
- **`_ensurePhase43bFields`:** default `leaderSince` / new lineage fields on old saves.

## 46d — Recruited into your old sect at Core Formation
- **Trigger:** in `_recalc` / on breakthrough, when the life first reaches **Core Formation** (stage index 13), an
  **alive lineage record** exists, the player is in no sect and founded none, and this life has not offered yet →
  `s.lineageOffer = { recId, year, done: false }` (most recent lineage record first).
- **API:** `lineageRecruitInfo()` (the card) · `answerLineageRecruit('join'|'decline')`. Join sets
  `s.sect = { id: rec.id, rank: 0, contribution: 0, activeMissions: [], lineage: true }`, deeds the record
  (+stance), logs it; decline marks the offer done for this life.
- **Def synthesis:** `_sectDef()` falls back to `_lineageSectDef(id)` (built from the record: name, `minStage` 13,
  neutral effects), so rank, missions, the blessing and the master systems all keep working for a lineage membership.
- **UI:** an offer card on the sect view (no-sect / founder Overview) + an attention item + a log line. Reads the
  record's stance and its current leader (who may not be the branch head you left).

## 46e — QA & Balance (own session)
- Multi-seed `npm run sim` before/after; teach the sim bot the recruitment offer.
- Scenario checks: a new `scripts/sim/checks/lineage.js` (inheritance record shape + inheritor pick; the offer fires
  at Core Formation and not before; join/decline; a lineage sect can be razed; leader churn; BQ Qi/s) + updates to
  `succession.js` / `npc-sects.js` / `sect-view.js` / `breakdowns.js`.
- New smoke `scripts/smoke/scenarios/lineage.js` (die with a sect → the record exists; the offer at Core Formation;
  the join; a leader change) across Overlay / Expanded / Desktop / phone, zero console errors.
- `npm run dist` + `npm run build:web`; Visual Review Gate on the offer card + the lineage tags; UX debt logged.

## Invariants
1. A lineage record is a real world sect: it grows, churns, can be warred and razed, and never silently vanishes.
2. Bloodline Quality > 0 ⇒ Qi/s strictly higher than the same life at BQ 0; no `derived.catchUp`/`catchUpUntil`.
3. The recruitment offer fires **once** per life, at or after Core Formation, only with an alive lineage sect and no
   other sect; joining never overwrites an existing sect.
4. No `Math.random()` in migrations; a dead player's inheritance pick is deterministic (loyalty, then strength).
5. `clan.sect` (stipend/enemy snapshot) and its world record never disagree on `hallLevel` after `_beginLife`.

## Gotchas
- `ownSect` stores no `defId`; a lineage sect synthesizes its def from the record (name + neutral effects). A taken-over
  sect's gate is `ownSect.takenOver.defId` — since the final QA pass (2026-10-04) `_wsFromOwnSect` really keeps it on the
  record (it was documented but never built), and `_wsKeepGates()` restores any gate left without a record (npc-sects.md → 43e gotchas).
- `_wsByDef` is used by `_wsMine`; a lineage membership must resolve by record id, so `_wsMine` gains an id fallback.
- Removing catch-up speeds the re-climb only through BQ → 2.8-style tuning lives in the QA pass (46e).
- The interlude is already busy (bet, bequest, chronicle); the inheritance is a **log line in the chronicle**, not a
  new picker — the player cannot make a choice while dead (agency rule).

## As built (2026-10-03)
- **Divergence from the spec:** the inheritor is **automatic**, not a player picker — the branch head with the highest
  loyalty (tie: the larger branch, then name order), else the strongest disciple, else a nameless steward
  (`_lineageInheritor`). The spec allowed a picker; the interlude is already busy and the user's phrasing was "one of
  the branch members", so a deterministic pick was kept (the drop is named in the world chronicle).
- **46a:** `BLOODLINE_QI_COEF = 0.004` (bloodline.js); `qMul('Bloodline Quality', 1 + bq × coef)` in `_recalc` only
  when `bq > 0`. `CATCHUP_QPS_MULT` / `CATCHUP_BT_BONUS` / `CATCHUP_AUTO_BT` deleted from clan-legacies.js;
  `derived.catchUp` / `catchUpUntil` and the `_tickAutomation` catch-up block removed. The Stats Bloodline tile /
  breakdown now show the Qi/s effect and reveal from BQ > 0; the HUD catch-up chip and the Character catch-up button
  (and their CSS) are gone. `clan.bestStageIndex` stays (Ancestral Hall Records only).
- **46b:** `_wsFromOwnSect(o, w)` / `_lineageRecord(w, …)` / `_wsFromClanSect(cs, clan, w)`; `_wsFromOwnSect` runs in
  `_recordLifeInWorld` **outside** the clan block (an orphan founder keeps their sect too). The record is
  `kind:'lineage'`, global caps, `stance: 70`, a founding deed, `lineageOf`/`founderName`, `leaderSince`. It never
  auto-dissolves and keeps ≥1 hall (`_wsSetback` / the dissolve loop). `clan.sect` stays a light claim with
  `worldSectId`; the reign sim skips its fortune roll for a linked sect (chronicle names the sect + its current
  leader); `_installHead` no longer hands a living sect over. `_ensurePhase46Fields` migrates a pre-46 dormant
  `clan.sect` into a record once.
- **46c:** `_wsCheckSuccession(r, yr)` in `_tickWorldSects` — a per-year change chance rising with tenure
  (`WORLD_SECT_LEADERS`), a new leader name, maybe a new temper, a chronicle line (and a player log line for a
  lineage sect). A flavour "hopefuls take the oath" line rides the disciple drift.
- **46d:** `_maybeLineageRecruit()` (called at the end of `_recalc`), `lineageRecruitInfo()`,
  `answerLineageRecruit(join)`; `_sectDef()` falls back to `_lineageSectDef(id)` and `_wsMine()` resolves by id, so
  rank / missions / blessing / the master systems work for a lineage membership. UI: `_lineageRecruit` card on the
  sect Overview + an attention item (`lineage-recruit`).
- **Bug the review caught (fixed):** the deferred death card in `renderer/game.js`
  (`setTimeout(showDeathOverlay, hold)`) was unguarded, so a life resolved before the hold fired (a scripted/auto
  rebirth) popped the stale card over the new life. It is now guarded by `s.interlude`.
- **Tests:** `scripts/sim/checks/lineage.js` (36) · `scripts/smoke/scenarios/lineage.js` (4 modes + join) ·
  `checks/succession.js` updated for the new sect fate + the no-handover rule · `checks/breakdowns.js` +
  `checks/succession.js` assert BQ → Qi/s and no catch-up keys. `npm run checks` 1209 ok · `sim:quick` healthy.
  Visual Review Gate **7.2 FAIL → 7.6 PASS**.
