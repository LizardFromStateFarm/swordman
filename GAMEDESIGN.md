# Cultivator Idle — Game Design Document

## Concept

A desktop idle game that lives permanently on the edge of your screen.
Your cultivator sits in lotus position, silently absorbing the qi of heaven and earth
while you go about your day. Check in occasionally to trigger a breakthrough,
learn a new technique, or read what the world has sent your way.

Art style: Colored ASCII art on a dark transparent canvas. Wuxia aesthetic.

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

---

## Future Features (not yet implemented)

- Sect affiliation (bonus based on cultivation element)
- Tribulation Lightning (boss event at each major realm transition)
- Disciple system (mentor another cultivator for passive bonus)
- Dao Companion (familiar that generates secondary resource)
- Ascension New Game+ (restart with permanent multiplier)
- Leaderboard (optional, community fastest-ascension)
