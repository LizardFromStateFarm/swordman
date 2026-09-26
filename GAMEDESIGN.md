# Cultivator Idle — Game Design Document

## Concept

A desktop idle game that lives permanently on the edge of your screen.
Your cultivator sits in lotus position, silently absorbing the qi of heaven and earth
while you go about your day. Check in occasionally to trigger a breakthrough,
learn a new technique, or read what the world has sent your way.

Art style: Colored ASCII art on a dark transparent canvas. Wuxia aesthetic.

---

## Design Pillars (decided 2026-09-25 — every system must fit these)

This is a single-player game made for the love of the game, not a monetized live-service idle game.

1. **A mortal life is a run.** One character's mortal life should take roughly **10–20 hours of open play**
   (casual profile) before it ends: by old age, a failed tribulation, a failed Ascension, or a successful one.
   Nobody should spend 100+ hours on one mortal character. Long play belongs to the **Immortal era**, where
   progression changes.
2. **Death is part of the fun, not a fail state.** Dying hands the game to the next generation. A save slot is
   a **family line (clan)**: you pick an heir, the Bloodline carries on, and the Ancestral Hall remembers.
3. **Meta progression across generations.** Each life earns the clan something permanent: mostly **unlocks and
   options** (heirlooms, family manuals, clan legacies, new origins), with only modest flat multipliers.
   Later generations replay the early realms faster, so the early game never becomes a grind.
4. **Never punish the player for being away.** There are no daily logins, no real-calendar events or seasons, no
   time-of-day bonuses, no windows you miss while the game is closed, no streaks and no FOMO. Anything that
   needs a decision while you're away uses a **standing order** you set in advance. Notifications are opt-in
   conveniences.
5. **Two clocks.** Idle jobs (expeditions, missions, crafting, study) use wall-clock timers and finish while
   the game is closed. **Age, lifespan and world history use game time**, which passes **only while the game
   is open** (see Phase 30 in PLAN.md). Nothing is tied to the real calendar or the time of day. Those can
   only appear as cosmetic flavor, never as bonuses.
6. **No store logic.** There are no premium or "hard" currencies, no leaderboards and no online requirement.
   Rare materials are just rare materials.

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
Total stages: 25.

---

## Resources

| Resource       | How gained                        | How spent                  |
|----------------|-----------------------------------|----------------------------|
| **Qi (气)**     | Passive over time                 | Consumed on breakthrough attempt |
| **Spirit Stones (灵石)** | Random events, world drops | Buy techniques |
| **Karma (因果)** | Breakthroughs, special events     | Bonus to breakthrough chance |
| **Comprehension** | Rare events                    | Future use (reserved)      |

---

## Mechanics

### Idle Qi Generation
`qiPerSecond = stage.baseQps × spiritualRoot.mult × (technique multipliers)`

Spiritual root is randomly assigned at game start:
- Heavenly Root (1% chance): ×3.0 — the chosen cultivator
- Pure Root (4%): ×1.8 — single element mastery
- Dual Root (20%): ×1.4 — two elements
- Mixed Root (75%): ×1.0 — common talent

### Meditation
Click Meditate → 3× Qi gain for 30 seconds.
One session at a time. Used for burst progress before a breakthrough.

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

On load: `min(elapsed_seconds, 8_hours) × qiPerSecond` Qi is credited.
Shown in the events log on next session.

**Game time (age) does not pass offline** (pillar 5). Offline catch-up gives resources, not years. The life loop
(PLAN.md M2) must check with the sim that this doesn't make afk lives too cheap. If it does, the fix is the
offline Qi rate, not aging offline.

---

## Pacing Targets (life loop)

| Measure (casual profile) | Target |
|---|---|
| One mortal life (birth → end) | 10–20h of open play |
| Generations before the first successful Ascension | ~3–5 (≈ 40–80h total) |
| Early realms in a later generation | noticeably faster than in generation 1 (ancestral catch-up) |
| Immortal era | open-ended; long play is fine here |

Today (sim, 2026-09-25) the casual profile's first Ascension attempt comes at ~82h, so the mortal curve needs
roughly a 4–6× compression. That's roadmap task 2.4.

---

## Future Features (not yet implemented)

- Sect affiliation (bonus based on cultivation element)
- Tribulation Lightning (boss event at each major realm transition)
- Disciple system (mentor another cultivator for passive bonus)
- Dao Companion (familiar that generates secondary resource)
- Generational play: heirs, Ancestral Hall, clan legacies (PLAN.md M2, "The Life Loop")
