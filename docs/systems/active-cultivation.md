# Active Cultivation (勤修) — Phase 48

> **Direction change 2026-10-10.** The game is no longer idle-first. Qi is earned mainly by **playing** —
> the **Cultivate** action — and only a slow trickle gathers while you're away. Expeditions, missions,
> tempering and study remain the **idle layer**: send them out, come back for materials.
> Full plan: `~/.commandcode/plans/active-cultivation-rework.md`. Roadmap: PLAN.md → **M0.5**.

System doc index: `docs/index.md`. Related: `docs/systems/automation.md` (the modes), `docs/systems/core-loop.md`
(Qi/stages/breakthrough), `docs/systems/tempering.md`→`body-constitution.md`, `docs/systems/expedition.md` (the idle layer).

---

## The economy in one picture

```
              ┌───────────────── the "full cultivation rate" ─────────────────┐
              │  derived.qiPerSecond = stage.baseQps × root × techniques × …  │
              └───────────────────────────────┬───────────────────────────────┘
                                              │
      ACTIVE (playing)                        │                    PASSIVE (away)
   drawQi() / Meridian Flow                    │              tick() + initSlot()
   paid per interaction                        │              credits PASSIVE_QI_SHARE (12%)
   ≈ 1.0–1.5× the rate                         │              → ~8× slower
```

Both rates are derived from the **same** `qiPerSecond` figure, so every existing multiplier (root, techniques,
beasts, sect, legacies, bloodline, soul, body) still scales everything. `qiPerSecond` stays the number the
events/data use (`events.js` bonuses are "N seconds of the full rate"); only the **accrual** is split.

### Constants — `assets/data/cultivation.js`
| Constant | Value | Meaning |
|---|---|---|
| `PASSIVE_QI_SHARE` | 0.12 | The tick + offline credit this share of the full rate |
| `CULTIVATE_DRAW_SECONDS` | 4 | Seconds of full rate a Draw Qi hit awards (before combo) |
| `CULTIVATE_DRAW_COOLDOWN` | 4 | Seconds between Draw Qi hits |
| `CULTIVATE_DRAW_PERFECT_MULT` | 2 | A perfectly-timed hit pays ×2 |
| `CULTIVATE_COMBO_STEP` / `_MAX` / `_MAX_STEPS` | 0.05 / 1.5 / 10 | Combo lift per hit, cap |
| `CULTIVATE_COMBO_DECAY_MS` | 6000 | No hit for this long → the combo lapses |
| `CULTIVATE_FLOW_COOLDOWN` | 20 | Min real seconds between Meridian Flow solves |

`body.js`: `BODY_AWAKEN_TIER = 'D'` (Phase 49) — the tier a mortal must reach to Awaken.

---

## State

`s.cultivate = { cdUntil, combo, lastAt }` — the Draw Qi cooldown + combo (Phase 48). `s.stats.cultivateDraws`
counts hits. Both are added by `_ensurePhase48Fields()` for old saves.

`s.derived` gains:
| Field | Meaning |
|---|---|
| `qiPerSecond` | The full rate (unchanged meaning) |
| `qiPerSecondBoosted` | = `qiPerSecond` (the 3× Meditate burst is retired; field kept for readers) |
| `qiPerSecondPassive` | `qiPerSecond × PASSIVE_QI_SHARE` — what the tick/offline credit |
| `cultivateYield` | `qiPerSecond × CULTIVATE_DRAW_SECONDS` — Qi per Draw Qi hit, before combo |

---

## API (game-state.js)

- **`drawQi({ perfect }) → { ok, gained, full, perfect, combo, comboMult }`** — one Draw Qi hit. Refuses during the
  cooldown (`reason:'cooldown'`) and while the meridians are shut (`reason:'mortal'`, Phase 49). Clamps to the cap;
  returns the Qi actually gained (0 when already full). Advances the combo, sets the cooldown, bumps the stat.
- **`mortalMeridiansShut() → bool`** — true at `stageIndex 0` before Awakening (Phase 49).
- **`awaken() / canAwaken() / awakenInfo()`** — Phase 49 (see `mortal-phase.md`).

Meridian Flow is the **existing** minigame (`FlowPuzzle` in `renderer/game/minigames.js`); its reward
(`FLOW.qiFrac` of the stage cap) and soft DR (`FLOW.hourFull/hourMult`) are unchanged.

**Both mini-games are charge-free** — Strikes/Push-Ups and Flow are gated by a short real-time cooldown
(per game, `assets/data/minigames.js`) instead of the old `MINIGAME_CHARGES` (3 charges, one back every 30 min).
This makes the **timing exercises the active body-XP loop**, which the Mortal phase (Phase 49) depends on.
The full mini-game registry + framework is `docs/systems/minigames.md` (Phase 52; Strikes was retired → Push-Ups).

## The Mortal gate (Phase 49, built here for coherence)
`mortalMeridiansShut()` is true at `stageIndex 0` before Awakening: **no Qi flows** (the tick and offline catch-up
both credit 0) and `drawQi()` refuses with `reason:'mortal'`. `awaken()` opens Qi Condensation once the body reaches
`BODY_AWAKEN_TIER` ('D'); it carries the first realm-change (a realm first + the 1-of-3 art insight offer). The HUD
Cultivate button becomes **Awaken** while mortal. See `docs/systems/mortal-phase.md`.

## Wiring

- `tick()` credits `qiPerSecondPassive × dt` (was `qiPerSecondBoosted`).
- `initSlot()` offline catch-up credits `qiPerSecondPassive` (was `qiPerSecond`).
- `breakdowns.js` "qps" card shows **Cultivating (active)** and **While away (idle trickle ×0.12)**; the cap/bt
  ETAs use the active rate.
- `renderer/game/cultivate.js` (48b) drives the HUD action and calls `drawQi`.
- `assets/data/cultivation.js` is loaded in `renderer/index.html` and `scripts/sim/loader.js`.

## Rules & invariants

1. **Qi/`qiPerSecond` still means the full rate** — never re-scale the multipliers for the passive share; the share
   lives only in `qiPerSecondPassive`.
2. **Active ≥ ~4× passive per open-hour.** Verified in `npm run sim` (profiles: active presses cultivate).
3. **Absence never stalls:** the trickle + the finished jobs are always ≥ 0 but the player is never *blocked* by being away.
4. The combo is a smooth boost (≤ ×1.5), never a wall — missing a beat never costs Qi.

## Gotchas

- `scripts/sim/metrics.js` still reads `s.derived.qiPerSecond` for its QPS checkpoints — that is the *rate*, not the
  accrual. Re-point to the actual accrual (or press cultivate) in 48e when re-basing targets.
- `events.js` bonuses (`qiPerSecond × N`) are now a bigger relative lump vs the passive trickle — intended (an event
  is a real gift), but watch it in 48e tuning.
- `OFFLINE_QI_MULT` (lifespan.js) is still 1.0 and now multiplies the *passive* share; nothing else changed.

## Depth pass (Phase 48)
- **Memory:** the combo remembers your last hit; letting it lapse resets it. `cultivateDraws` accumulates.
- **Choices:** Draw Qi (fast, low) vs Meridian Flow (puzzle, big) — a tempo choice; and *when* to cultivate vs
  explore/hunt instead.
- **Hooks:** Qi cap/breakthrough (core-loop), tempering (`qiMult` halves Qi/s while spirit-tempering → an active
  choice), events (`qiPerSecond`-scaled), the idle layer (expeditions/missions), sim/bot.
- **Drama:** none of its own (the economy is the substrate) — the failure case is only *slow* progress, never loss.
- **Feedback:** the Qi/s breakdown names both rates; the HUD shows the active rate.

## UX pass (Phase 48b)
- **Surface:** the HUD Cultivate button + a live rate readout; the Qi/s "why" card shows both rates.
- **Interact:** one tap on the HUD action (roomy layouts first; degrades to Overlay/phone).
- **Discover:** a coach mark on first unlock (Phase 50 gates it); attention nudge when the cap is near.
- **Feel:** a Qi pop + combo meter on a hit; tabular, calm, no emoji.
