// Scenario checks — clan-succession.md 2.6e/2.6f, the second half of succession.js (split 2026-10-05 so npm run checks runs
// both halves in parallel): head challenges, step-down tournaments, branch pushes / declarations / secessions, branch wars,
// bequests. All the code lives in succession.js; this only selects part b.
// Run: npm run checks (all) · node scripts/sim/checks/succession-2.js (this half).
process.env.SUCC_PART = "b"
require("./succession.js")
