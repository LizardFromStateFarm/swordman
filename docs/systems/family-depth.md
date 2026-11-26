# Family Depth — M6 (Phases 16 full · 18A · 18D–E)

_Last updated: 2026-11-26 · Data: `assets/data/family-depth.js` · Engine: `renderer/engine/game-state.js` · UI: Kin → Hall._

Most of M6 was already standing on the living-world and family systems. This pass adds the two pieces that
were missing — **Ancestral Visions** and the **cross-save Hall of the Fallen** — and records that courtship,
children as world persons and the **Family Technique** ride existing systems.

## What already covered the milestone

| Task | Where it lives |
|---|---|
| 6.1 Courtship with living-world persons | `family-view.js` seek-a-match → candidates → meetings → propose with odds; refusal remembered (1.8b-3a). |
| 6.2 Children as world persons | `s.family.children` are person records that grow/cultivate (2.6b); the living world lets them become allies/classmates (4.x); sworn siblings (4.10). |
| 6.3 Family Technique | `clan.manualTechId` + `s.inheritedManual` — every heir learns that technique free (2.7c; Hall's Family Manual picker). |
| 6.4 lineage tree | Kin → Tree (family-tree.js). |

## Ancestral Visions (18E)

An heir born into a clan that has earned any Merit (or has an Ascended Ancestor) may receive **one ancestor's
vision**: a choose-one boon for the life. It is never rolled for you.

- **State:** `s.vision` (chosen id) and `s.visionOffer` (`{ at, options }`).
- **Data:** `FAMILY_VISIONS` — `qi` (+10% Qi/s), `body` (1,200 body XP), `integrity` (+20), `stones` (+300);
  `FAMILY_VISION_COUNT` = 3 options.
- **API:** `visionOfferInfo()`, `chooseVision(id)`, `_visionOptions()` (a **deterministic** per-life subset —
  no `Math.random`, so seeded sims keep their draw order).
- **Derived:** a `qi` vision adds `qMul('Ancestral vision', 1.10)`; the others apply once when chosen.
- **UI:** a card at the top of Kin → Hall with the options; an attention item ("An ancestral vision") while it waits.
- **Offer trigger:** `_beginLife` sets the offer when the clan has `meritEarned > 0` or `ascendedAncestors > 0`.

## Hall of the Fallen (18A)

Every life that ends on this install is recorded in the **cross-save soul** (soul.json), shared by every slot.

- **State:** `soul.fallen` — `[{ name, clan, gen, stage, realm, cause, year, ts }]`, capped at 60, newest first.
- **Recorded in `_die()`** while the dying life still exists; `_saveSoul()` persists it (skipped for dev presets).
- **API:** `fallenInfo()`.
- **UI:** Kin → Hall (and the orphan's empty Hall) lists the tombstones — name · clan · generation · realm ·
  cause · year.
- **Normaliser:** `_normSoul` keeps only records with a string name (a hand-edited file cannot break the view).

## Rules & invariants

1. **The vision is a player choice**, never simulated; the offer waits.
2. Vision options are deterministic from the life id (no RNG draw).
3. The Hall of the Fallen is per install, not per slot; it survives death and reloads.
4. A dev-preset life never writes the real soul (invariant 5).

## Not built / polish

- Adopted heirs and a dedicated "children join a sect / become rivals" event are not added; the living world and
  family systems already let children drift into those roles.
- The Hall of the Fallen is text only (no portrait or grave art).
- Ancestral Visions are four flat boons; no vision chains or ancestor-specific wording yet.
