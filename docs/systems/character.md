# Character Foundation — Birth Origin · Alignment · Dao Path · Tribulation (M3 / Phases 12 · 13 · 39A–B · 7A · 7C)

_Last updated: 2026-11-26 · Data: `assets/data/character.js` · Engine: `renderer/engine/game-state.js` · UI: Path → Character._

Every life is rolled (or inherited) a **birth origin**, carries an **alignment**, and — at its first Core
Formation breakthrough — chooses a **Dao path**. Crossing into a new realm calls down a **Heavenly
Tribulation**. All of it is a player-facing decision where it matters; nothing about your own path is
simulated for you.

## State

| Field | Meaning |
|---|---|
| `s.origin = { id, region, family, constitution }` | Phase 12. Picked deterministically from the life id (not `Math.random`, so seeded sim/tests keep their draw order); an heir reuses `clan.originId`. |
| `s.alignment` (−100…100) | Phase 13. Drifts each game year toward `(karma − 50) × 1.6` plus the Dao path's pull (±20). |
| `s.daoPath` | Phase 39A/7A: `null` = Basic Method, then `'virtuous' | 'neutral' | 'demonic'`. |
| `s.pathOffer` | `{ year, at }` while the Core Formation choice waits on the player. |
| `s.daoReversalUsed` | Phase 39B: one reversal per life. |
| `s.daoSealed` | The old path's arts are sealed after a successful reversal. |
| `s.tribulations` | Count of realm crossings that called a tribulation. |

Old saves gain all of these through **`_ensurePhase12Fields()`** (called at the top of every `_recalc`), and
the clan it is born into records `originId` so its heirs inherit the province/family.

## Data (`assets/data/character.js`)

- **`BIRTH_ORIGINS`** — six provinces/families (`rice_village`, `river_town`, `mountain_hold`,
  `scholar_manor`, `sect_ward`, `orphan_streets`), each with a weighted `constitutions` pool, small
  `qps`/`bt`/`cap` effects and starting `stones`/`karma`.
- **`CONSTITUTIONS`** — `plain`, `spirit`, `iron`, `frost`, `sword`, `hollow` (qps / bt / cap modifiers).
- **`ALIGNMENT_TIERS`** — Demonic ≤ −40 · Wayward < −15 · Neutral −15…15 · Decent 15…40 · Righteous ≥ 40.
- **`DAO_PATHS`** — Basic / Virtuous / Neutral / Demonic. Effects: qps, breakthrough add, alignment pull,
  and an alignment gate (`virtuous` needs ≥ 15; `demonic` needs ≤ −15; `neutral` is always open).
- **`TRIBULATION`** — damage by stage (10/13/16/19), reduced by body tier and Integrity, floored at 1 Health.
- **`DAO_REVERSAL`** — once per life, base 55% success, a failure costs 40% max Health.

## API & triggers

- `chooseDaoPath(id)` — only at `stageIndex ≥ 13`, once, and only if the path's alignment gate passes.
  Clears `pathOffer`, shifts alignment/karma, logs, recalcs.
- `revertDaoPath(id)` — once per life; success switches + seals, failure maims (never kills).
- `pathOfferInfo()` / `daoPathInfo()` / `alignmentInfo()` / `originInfo()` — read-only for the UI.
- `_crossRealmM3(prevRealm, newRealm)` — called from `attemptBreakthrough()` on a realm change: applies the
  tribulation damage and, at Core Formation, sets `pathOffer`.
- `_tickAlignment()` — in the game-year job queue.

## UI

Path → Character shows the origin, constitution, alignment tier and Dao path as tags/rows; when the offer is
pending it draws the **"The Dao forks before you"** card with each path's description, trade-off and lock
reason; a once-per-life **Turn your Dao** row appears after a path is chosen. The attention strip carries an
urgent "The Dao forks before you" item while `pathOffer` waits. The sim bot answers the offer (Neutral for
`active`; any open path for casual/afk).

## Rules & invariants

1. **The path is a player choice, never rolled** (agency rule). The offer waits forever.
2. Origin rolls are **deterministic from the life id** so they never perturb the seeded sim/tests.
3. A tribulation in v1 **floors at 1 Health** — it is a scar, not a death, until 7C's full version lands.
4. Alignment moves only by drift + explicit path actions; nothing else silently rewrites it.
5. The Qi-cap safety rail in `_recalc` keeps `s.qi ≤ derived.qiCap` by construction (sim `qi_over_cap`).

## Gotchas

- `_ensurePhase12Fields` runs every `_recalc`; keep it O(1) (it reads the player clan, no scans).
- `_crossRealmM3` calls `addEvent` (which notifies) *before* `attemptBreakthrough`'s own `_recalc`; the final
  recalc is still authoritative.
- A "Dao path" is not the same as the **Techniques** list or the Arts element — it only scales derived numbers
  and gates future content (v2 Immortal Paths).
- Phase 7C's animation/choices are still open; this build is the engine + damage + UI moment.

## Not yet built (final QA pass)

- The tribulation is damage + a log line only (no dedicated animation, no brace/endure choices).
- Alignment has no gates on sects/events/arts yet (the tier is shown and drives path locks only).
- Origins are flavour + small numbers; their `region` is not yet a world-map dimension for M4.
