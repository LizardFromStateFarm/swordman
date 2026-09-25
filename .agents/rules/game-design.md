# Game Design Rules — Cultivator Idle

## Core philosophy

The game should feel like a living cultivation novel playing out on the edge of the screen.
Numbers grow. Breakthroughs feel momentous. Failure stings but doesn't devastate.

---

## Idle loop invariants

- **Qi always accumulates** while the window is open (even if minimized or background)
- **Offline progress** is applied on load (capped at 8 hours); show it to the player
- **Breakthrough is always a choice** — never automatic; the player chooses when to risk it
- **Meditation is a limited active boost** — not passive, requires the player to remember it

---

## Progression pacing

| Realm | Expected idle time to fill Qi cap | Notes |
|-------|----------------------------------|-------|
| Mortal | ~2 minutes | Tutorial feel |
| Qi Condensation 1–9 | 2–15 min each | Should feel like steady levelling |
| Foundation Building | 20–45 min each | First "major" hurdle |
| Core Formation | 1–3 hours each | Game shifts to overnight sessions |
| Nascent Soul+ | Many hours | Background idle territory |

If adding new stages, maintain this rough doubling of time per realm tier.

---

## Breakthrough rules

- Chance starts high (95% mortal) and decreases with each major realm
- Karma (0–100) adds up to +10% bonus at karma=100
- Failure must always be possible at higher realms (cap chance at 98%)
- Failed breakthrough: lose 50% Qi, lose 8 Karma — painful but recoverable

## Techniques

- Early techniques should be cheap (0–10 stones) and have clear, immediate value
- Later techniques should have multiplicative effects (×2, ×3) that compound nicely
- Never add a technique that just grants flat Qi/s — use multipliers to keep the
  progression feeling exponential rather than additive

## Random events

- Every 30–120 seconds an event triggers
- Events must have both positive (Qi bonus, Karma, stones) and negative (Qi loss, disruption) outcomes
- Special events (gold/white border) should be rare and feel magical
- Event text should read like a xianxia novel: dramatic, poetic, slightly formal

## Flavor text style guide

Good: "A fragment of heavenly dao brushes your divine sense."
Bad:  "You got a karma bonus."

Good: "The demon beast retreats, its roar fading into the valley mist."
Bad:  "A demon attacked and you lost qi."

---

## Adding content checklist

### New cultivation stage
- [ ] Entry in `assets/data/stages.js` with `spriteState` pointing to an existing or new sprite
- [ ] If new `spriteState`, run the Asset Pipeline from `CLAUDE.md`
- [ ] Verify `qiCap` follows the pacing table above
- [ ] Verify `breakthroughChance` is lower than the previous stage

### New technique
- [ ] Entry in `assets/data/techniques.js`
- [ ] Effect type is one of: `qps_mult`, `qi_cap_mult`, `breakthrough_bonus`, `karma_gain`
- [ ] `minStage` is set so it unlocks at a meaningful moment in progression
- [ ] Flavor quote is included and sounds like xianxia

### New random event
- [ ] Entry in `assets/data/events.js`
- [ ] Has both a positive and negative possible outcome, OR is tagged clearly as one-sided
  with a lower weight
- [ ] Text passes the flavor guide above
