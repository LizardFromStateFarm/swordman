# Cultivator Idle — Game Design Document

> **2026-10-10 — direction change: an ACTIVE cultivation game with idle support.**
> The game is no longer idle-first. You advance mainly by **playing** — actively cultivating and
> choosing your way up the path — and you send **expeditions and missions out while you're away** to
> gather materials (the small idle layer). See PLAN.md → "The Active Rework" (Phases 48–51) and
> `docs/systems/active-cultivation.md`.

## Concept

An active wuxia cultivation game that lives on the edge of your screen.
Your cultivator climbs the path of immortality by **cultivating — actively gathering qi**, fighting,
exploring and tempering the body — while **expeditions and missions run in the background** and bring
materials home whether you're watching or not. When you're present, you play: draw qi, hunt, duel,
delve, breakthrough. When you step away, the world keeps gathering a slow trickle and your sent
jobs finish. Nothing is lost by leaving — but a present player climbs far faster.

Art style: Colored ASCII / ink art on a dark transparent canvas. Wuxia aesthetic.

---

## Design Pillars (decided 2026-09-25, **revised 2026-10-10 — active-first** — every system must fit these)

This is a single-player game made for the love of the game, not a monetized live-service idle game.

0. **You advance by playing** (added 2026-10-10). The main loop is **active**: gathering qi, fighting,
   exploring, tempering, choosing. There is no "wait for the bar to fill" as the primary verb — when you are
   present there is always something to *do*, and doing it is clearly faster (target **~4–8×** over idling).
   Idle is a **support** layer, not the game.
1. **A mortal life is a run.** One character's mortal life should take roughly **20–40 hours of open play**
   (casual profile) before it ends: by a failed tribulation, a failed Ascension, a successful one, a violent
   death, or the player choosing to Pass the Mantle. **Age never ends a life** (user decision 2026-09-26): the
   player shouldn't have to worry about it — age is just a stat.
   Nobody should spend 100+ hours on one mortal character. Long play belongs to the **Immortal era**, where
   progression changes.
2. **Death is part of the fun, not a fail state.** Dying hands the clan to your heir (an NPC who rules in your place);
   you're reborn a generation later as an unknowing descendant — or an orphan (see docs/systems/clan-succession.md). A save slot is
   a **family line (clan)**: you pick an heir, the Bloodline carries on, and the Ancestral Hall remembers.
3. **Meta progression across generations.** Each life earns the clan something permanent: mostly **unlocks and
   options** (heirlooms, family manuals, clan legacies, new origins), with only modest flat multipliers.
   Later generations replay the early realms faster, so the early game never becomes a grind.
   *Exception (user 2026-09-28, Phase 40):* **Soul Points** are a cross-save (every slot) Qi/s multiplier earned
   from failed Ascension Trials and Immortality: modest and capped (+100% max). See docs/systems/soul-points.md.
4. **Never punish the player for being away** (**reframed 2026-10-10 for active-first**: absence still
   progresses, just slowly). There are no daily logins, no real-calendar events or seasons, no
   time-of-day bonuses, no windows you miss while the game is closed, no streaks and no FOMO. While away you
   keep a **slow passive qi trickle** and your **expeditions/missions finish** — so nothing is lost by leaving,
   but active play is much faster. Anything that needs a decision while you're away uses a **standing order**
   you set in advance. Notifications are opt-in conveniences.
5. **Two clocks.** Idle jobs (expeditions, missions, crafting, study) use wall-clock timers and finish while
   the game is closed. **Age and world history use game time**, which passes **only while the game
   is open** (see Phase 30 in PLAN.md). Nothing is tied to the real calendar or the time of day. Those can
   only appear as cosmetic flavor, never as bonuses.
6. **No store logic.** There are no premium or "hard" currencies, no leaderboards and no online requirement.
   Rare materials are just rare materials.
7. **Systems talk to each other** (user, 2026-09-26). Every mechanic has state that changes over time, choices
   whose outcomes depend on who you are (personality, stage, karma, relationships), and consequences that spill
   into other systems — including dramatic failure (betrayal, rivalry, loss). The minimal version is never the
   whole design; see the Design Depth Pass in CLAUDE.md.

---

## Cultivation Path

```
Mortal (凡人)
  └─ Qi Condensation (聚气期)  ×9 layers
       └─ Foundation Building (筑基期)  Early / Middle / Late
            └─ Core Formation (结丹期)   Early / Middle / Late
                 └─ Nascent Soul (元婴期)  Early / Middle / Late
                      └─ Spirit Severing (化神期)  Early / Middle / Late
                           └─ Ascension (飞升)  — endgame
```

Each "stage" in the code is one row of `CULTIVATION_STAGES` in `assets/data/stages.js`.
Total stages: 23 (Mortal → Qi Condensation ×9 → Foundation → Core → Nascent Soul → Spirit Severing ×3 → an Ascension stub).

### The Mortal Phase (added 2026-10-10, Phase 49)
Every life **begins a mortal** — `stageIndex 0`, `mortal / Unawakened`. **Qi does not flow yet**: you cannot
cultivate until you **open your meridians**, which takes a **trained body**. To **Awaken** (enter Qi Condensation)
you must temper your body to the **Hardened tier (D, 1000 XP)** through the mortal loop — **Explore** and
**Body tempering** are the only verbs at first (plus hunting a first beast). This makes the opening a real,
active arc instead of a 1–4 minute formality, and it teaches the two core verbs before the rest of the game
unlocks. See `docs/systems/mortal-phase.md`.

---

## Resources

| Resource       | How gained                        | How spent                  |
|----------------|-----------------------------------|----------------------------|
| **Qi (气)**     | **Actively cultivated** (the main action) + a slow passive trickle while away | Consumed on breakthrough attempt |
| **Spirit Stones (灵石)** | Random events, world drops | Buy techniques |
| **Karma (因果)** | Breakthroughs, special events     | Bonus to breakthrough chance |
| **Comprehension** | Rare events                    | Future use (reserved)      |

---

## Mechanics

### Active Cultivation (the main loop)
Qi has two rates, both off the same `qiPerSecond` figure (the "full cultivation rate"):

`qiPerSecond = stage.baseQps × spiritualRoot.mult × (technique multipliers)`

- **Playing (active).** The **Cultivate** action — **Draw Qi** (a quick repeatable timing tap) and
  **Meridian Flow** (a puzzle for a bigger burst) — awards qi per interaction, scaled by `qiPerSecond`.
  A present player climbs at roughly **4–8×** the idle rate. See `docs/systems/active-cultivation.md`.
- **Away (passive).** The tick and offline catch-up credit only a **slow trickle** — a fraction of the full
  rate (`PASSIVE_QI_SHARE`). Expedition and mission materials are the other thing you gain while away.

Tuning lives in `assets/data/cultivation.js` (Phase 48). The Qi/s "why" card shows both rates.

Spiritual root is randomly assigned at game start:
- Heavenly Root (1% chance): ×3.0 — the chosen cultivator
- Pure Root (4%): ×1.8 — single element mastery
- Dual Root (20%): ×1.4 — two elements
- Mixed Root (75%): ×1.0 — common talent

### Cultivate
The main action. **Draw Qi** is a quick, repeatable timing tap that awards a qi chunk and builds a combo;
**Meridian Flow** is a puzzle that awards a bigger chunk (with soft diminishing returns after several solves
per hour). Always available while you're cultivating (qi flows from Qi Condensation on — before Awakening, your
meridians are shut; see the Mortal Phase below).

### Breakthrough
When Qi ≥ 90% of cap, the Breakthrough button becomes available.
Rolling `Math.random() > breakthroughChance` → success; otherwise failure.

- Success: advance stage, reset Qi, +10 Karma
- Failure: lose 50% Qi, -8 Karma

### Techniques
Buy with Spirit Stones. Each technique has a minimum required stage.
Effects: `qps_mult` (multiply Qi/s), `qi_cap_mult` (multiply cap),
`breakthrough_bonus` (flat % chance added), `karma_gain` (Karma/s).

### Random Events
Fire every 30–120 seconds. Cover the full range of wuxia tropes:
spirit springs, demon disturbances, passing seniors, heavenly insight,
inner demons, auspicious clouds, stray lightning.

---

## Offline Progress

On load: `min(elapsed_seconds, 8_hours) × qiPerSecond × PASSIVE_QI_SHARE` Qi is credited — the **passive
trickle only** (active play is not simulated; you're away). Your running **expeditions and missions also
finish** while the game is closed, so coming back means materials + a small pile of qi. Shown in the events log.

**Game time (age) does not pass offline** (pillar 5). Offline catch-up gives resources, not years.

---

## Pacing Targets (life loop)

| Measure (casual profile) | Target | Actual (sim, 2026-09-26, task 2.4) |
|---|---|---|
| One mortal life (birth → end) | 20–40h of open play (was 10–20h; widened 2026-09-26 when old age was removed) | ✅ median 29.5h (active 9.9h — faster, ≥5h floor) |
| Generations before the first successful Ascension | ~3–5 (≈ 40–80h total) | not yet measurable — needs ancestral catch-up (tasks 2.5–2.8); every death is still a fresh soul |
| Early realms in a later generation | noticeably faster than in generation 1 (**Bloodline Quality → Qi/s**) | ✅ built 2026-10-03 (Phase 46: `BLOODLINE_QI_COEF`, up to +40% Qi/s at BQ 100 — the ancestral catch-up was removed in favour of this) |
| Immortal era | open-ended; long play is fine here | unchanged (M7) |

> **2026-09-26: old-age death was removed** (age is a stat only, no lifespan/twilight/Final Seclusion). With it
> gone, casual lives only end at the Ascension Trial, so the casual median life rose from 16.8h to ~29.5h — see
> life-loop.md §15. **The user accepted this** (2026-09-26): the target band is now 20–40h and the Spirit Severing
> pacing band 60–300m; no stage retune.

**Task 2.4 (pacing compression) is done.** Foundation Building–Spirit Severing `qiCap`s were retuned (see
`docs/systems/life-loop.md` §13 for the full before/after) so a casual mortal life now reaches Spirit Severing
and often an Ascension attempt within the 10–20h life, instead of dying of old age around Core Formation
(the state task 2.3's game clock/lifespan produced before this pass). `PACING_TARGETS_MIN` and the new
`LIFE_TARGETS_H` live in `scripts/sim/profiles.js`. Generation-level targets (row 2 above) wait on tasks 2.5–2.8
(marriage/heirs/Ancestral Hall/catch-up) — there is no clan continuity across deaths yet for them to measure.

---

## Future Features (not yet implemented)

- Sect affiliation (bonus based on cultivation element)
- Tribulation Lightning (boss event at each major realm transition)
- Disciple system (mentor another cultivator for passive bonus)
- Dao Companion (familiar that generates secondary resource)
- Generational play: heirs, Ancestral Hall, clan legacies (PLAN.md M2, "The Life Loop")
