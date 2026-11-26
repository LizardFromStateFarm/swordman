// File: assets/data/cultivation.js (Phase 48, the Active Rework — docs/systems/active-cultivation.md).
// The active/passive Qi economy: how much of the "full cultivation rate" (derived.qiPerSecond) the tick and offline
// catch-up credit while you're away, and what the Cultivate action (Draw Qi / Meridian Flow) pays per interaction.
// Used by: game-state.js (_recalc/tick/initSlot/drawQi), breakdowns.js, cultivate.js, game.js, scripts/sim/*.
// Data only.

// The tick and offline catch-up credit this share of the full rate. Small on purpose: a present player cultivates.
const PASSIVE_QI_SHARE = 0.12

// ── Cultivate → Draw Qi (the always-available active action) ──────────────────────────────────────────────
// A hit awards this many seconds of the full rate (÷ the cooldown ≈ the active rate). First pass: 4s / 4s ≈ 1.0×
// the full rate, roughly 8× the passive trickle; a full combo (×1.5) reaches ~1.5×. Tune in 48e/51a against the sim.
const CULTIVATE_DRAW_SECONDS   = 4     // seconds of full rate per good hit
const CULTIVATE_DRAW_COOLDOWN  = 4     // seconds between hits (the pacing of the loop)
const CULTIVATE_DRAW_PERFECT_MULT = 2  // a perfectly-timed hit pays ×2 the base draw
// A combo builds with each hit and lifts the draw; it lapses if you stop.
const CULTIVATE_COMBO_STEP     = 0.05  // +5% per combo step…
const CULTIVATE_COMBO_MAX      = 1.5   // …up to ×1.5
const CULTIVATE_COMBO_MAX_STEPS = 10   // combo steps cap here (10 × 0.05 = 0.5 → ×1.5)
const CULTIVATE_COMBO_DECAY_MS = 6000  // no hit for this long → the combo resets

// ── Cultivate → Meridian Flow (the deeper puzzle) ─────────────────────────────────────────────────────────
// The puzzle's reward stays FLOW.qiFrac of the stage's Qi cap (tempering.js); the hard charge cap is removed so
// active play is never walled — only the soft diminishing returns (FLOW.hourFull/hourMult) remain, plus this
// minimum real-time gap so it can't be scripted into infinite Qi.
const CULTIVATE_FLOW_COOLDOWN  = 20    // seconds between Flow solves (on top of the puzzle itself)

// Tempering Strikes (body XP) is likewise charge-free now (Phase 48/49): the active body loop — you temper by
// striking, and the mortal phase is gated on body tier, so waiting on charges would make it a pure wall-clock wall.
const CULTIVATE_STRIKES_COOLDOWN = 30  // seconds between Strikes runs
