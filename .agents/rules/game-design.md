# Game Design Rules — Cultivator Idle

## Core philosophy

The game should feel like a living cultivation novel playing out on the edge of the screen.
Numbers grow. Breakthroughs feel momentous. Failure stings but doesn't devastate.

**Systems talk to each other.** Every gameplay feature gets a Design Depth Pass (CLAUDE.md): what it remembers
over time, choices whose outcomes depend on personality/stage/karma/relationships, ≥3 hooks into existing
systems, the best and worst dramatic outcomes, and how past behavior shapes future events. Don't ship the
minimal version of a mechanic when a connected one is within reach — propose it to the user.

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
- **Qi gains/losses are "N seconds of Qi/s", never a % of current Qi or of qiCap.** % losses every
  30–120s create an equilibrium below the 90% breakthrough threshold once a stage takes >~30 min to
  fill (players get stuck forever); % of qiCap breaks at Ascension (qiCap = Infinity).
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
- [ ] Verify `qiCap` follows the pacing table above — `npm run sim` measures this directly
      ("Pacing vs GAMEDESIGN.md" section; targets live in `scripts/sim/profiles.js`)
- [ ] Verify `breakthroughChance` is lower than the previous stage

### New technique
- [ ] Entry in `assets/data/techniques.js`
- [ ] New Qi/s multipliers shift every later stage's fill time — re-run `npm run sim` and check pacing
- [ ] Effect type is one of: `qps_mult`, `qi_cap_mult`, `breakthrough_bonus`, `karma_gain`
- [ ] `minStage` is set so it unlocks at a meaningful moment in progression
- [ ] Flavor quote is included and sounds like xianxia

### New random event
- [ ] Entry in `assets/data/events.js`
- [ ] Has both a positive and negative possible outcome, OR is tagged clearly as one-sided
  with a lower weight
- [ ] Text passes the flavor guide above
