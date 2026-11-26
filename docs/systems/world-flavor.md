# World Flavor & Polish — M8 (Phases 19 · 17 · 6A–D · 10 · 11B–C · 20A–B · 9C–D)

_Last updated: 2026-11-26 · Data: `world-epochs.js`, `dungeons.js` · Engine: `game-state.js` · UI: Character, Roam → Explore._

The world now has **ages** that shift the spiritual tide, **secret realm dungeons**, **cosmetic titles**, and a
**day/night ambience**. This pass covers 8.1, 8.2, 8.3 (via the art engine), 8.4's titles and 8.7's day/night;
the remaining flavor tasks are listed at the bottom.

## 8.1 World Epochs & Spiritual Tides (`assets/data/world-epochs.js`)

- `WORLD_EPOCHS` — Dawning Age (×1.00), Rising Tide (×1.12), Withering (×0.92), Age of Chaos (×1.20), each 400 game years.
- State: `s.world.epoch = { id, since }` (migrated by `_ensurePhase19Fields`).
- `_tickEpoch(yr)` runs in the game-year job queue; when the span elapses it advances the cycle, logs a world event
  and emits `epoch`.
- `epochInfo()` → `{ id, name, desc, qi, since, yearsLeft }`; `_recalc` applies `qMul('Spiritual age', qi)`.
- Shown in the Character header meta line (`Age · Year · Gen · <age name>`).

## 8.2 Secret Realm Dungeons (`assets/data/dungeons.js`)

A short push-your-luck run, entered from **Roam → Explore**.

- `SECRET_REALMS` — Mist Cave (stage 3), Buried Palace (stage 10), Heaven Tomb (stage 19); each has rooms, an
  entry cost, per-room loot and damage ranges, and a final reward.
- State: `s.secretRealm = { active, id, room, maxRooms, log }`.
- API: `secretRealmInfo()` (available list + the active run), `enterSecretRealm(id)`, `secretRealmStep('advance'|'rest'|'leave')`.
  Advancing pays loot and costs Health (**floored at 1**); resting heals 10%; the last room clears the run and pays
  its final reward; leaving ends it.
- UI: a Secret Realms block at the top of Explore with entry cards, or the active room + Press/Rest/Leave buttons and
  a short log.
- **Progress lock + theme (QA 2026-11-26):** the whole block is **hidden until the first realm's gate** (stage 3)
  unless a run is already open; each realm still shows its own lock reason. It is styled as a themed ink/gold/violet
  panel (`.secret-*`) rather than the generic location cards.

## 8.3 Animation & visual overhaul

Satisfied by the art engine track (Phases 34 / A3–A4: the hybrid ink renderer, realm scenery, death moment). No new
work this pass.

## 8.4 Cosmetics (titles — partial)

`s.title` + `titleInfo()` / `setTitle(id)`. Titles unlock from state (None, Founder, Sect Master, Teacher of Many,
Heir of a Line) and are chosen from the Character view's Belongings list. **Spirit pet and cultivation cave are not
built yet.**

## 8.7 Day/night ambience (partial)

`document.body[data-tod]` is set from local time (night/dawn/day/dusk) and applies a subtle cosmetic filter. **No
bonuses** (per the design rules). Seasons are not built.

## Rules & invariants

1. Epochs are on the **game clock**; they change between generations too.
2. A dungeon step **never kills** in v1 (Health floors at 1) — the full risk version can come later.
3. Titles and day/night are **cosmetic only** — no combat or Qi effect.
4. Dungeons consume `Math.random` only when actually played, so the seeded sim draw order is unchanged.

## Not built (cleanup/QA backlog)

- **8.5 Heaven's Will / Scripture Lore** — no lore codex yet.
- **8.6 Permadeath + challenge modes** — not built.
- **8.4** spirit pet and cultivation cave.
- **8.7** seasons (day/night is in).
- Dungeon art (rooms are text), a brace/endure choice, and no-permadeath risk.
