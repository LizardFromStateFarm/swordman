// Scenario checks — combat.md, the slow half of combat.js (split 2026-10-05 so npm run checks runs both in parallel): real
// move fights with the default policy win about as often as the prepare-step estimate says (2 beasts x 150 seeds).
// All the code lives in combat.js; this only selects part b. Run: node scripts/sim/checks/combat-2.js
process.env.COMBAT_PART = "b"
require("./combat.js")
