// Player profiles + report flag thresholds for the QA sim harness. Tune here, not in the bot.
// Used by: scripts/sim/run.js, scripts/sim/bot.js, scripts/sim/report.js. See docs/systems/qa-sim.md.

// Session model: game is open for `openSec`, then closed for `closedSec` (0 = never closed).
// While open, the bot looks at the game every `actEverySec` and does everything it wants to.
// Closing → real save; reopening → real initSlot() offline catch-up (8h cap, war fast-forward, etc).
const PROFILES = {
  active: { desc: 'Overlay always open, player acts every 10s (min-maxer)',
            openSec: Infinity, closedSec: 0, actEverySec: 10 },
  casual: { desc: 'Overlay always open, player glances at it every 30 min',
            openSec: Infinity, closedSec: 0, actEverySec: 1800 },
  afk:    { desc: 'Opens game 15 min, closes it 8h (offline catch-up path)',
            openSec: 900, closedSec: 8 * 3600, actEverySec: 60 },
}

// Sect path the bot follows: 'founder' leaves its sect to found one when able; 'member' never founds.
const DEFAULT_PATH = 'founder'

const THRESHOLDS = {
  deadZoneHours:     { active: 1.5, casual: 3, afk: 12 },  // longest gap with no new stage/milestone
  stageWallRatio:    4,       // stage takes ≥ this × the previous stage's time → "difficulty wall"
  stageWallMinHours: 1,       // …and at least this long (ignore ratios on 30-second stages)
  qiCappedPct:       40,      // % of open-time Qi sat at cap (wasted generation) → "cap too punishing"
  failStreak:        5,       // consecutive failed breakthroughs → "frustration spike"
  hoardStones:       2000,    // Spirit Stones unspent at end… (both this AND hoardBankHours must trip)
  hoardBankHours:    12,      // …and the bank is worth more than this many hours of end-game income
  involuntarySinkPct: 50,     // war losses > this % of all stones leaving the economy → "tax, not choices"
  singleSourcePct:   80,      // one income source > this % of all stones earned → "one faucet economy"
  minDecisionsPerHr: { active: 6, casual: 1, afk: 1 },  // fewer meaningful actions/hour → "boring stretch"
  unusedFeature:     true,    // flag systems a profile never touched in its longest run
}

// GAMEDESIGN.md / life-loop.md §6.2 "Pacing plan": idle minutes to fill the Qi cap, per stage, by realm.
// **Re-based 2026-11-26 for the ACTIVE game (Phase 48 flipped the loop).** The representative player is now
// `active` (acts every 10 s while open), not the old 30-min casual glance; the numbers below are the active
// profile's effective fill times with its real multipliers. The old idle bands (FB 15–30, CF 30–60, NS 45–90,
// SS 60–300) were measured on the old idle economy and flag every active run — stale, per 48e.
const PACING_TARGETS_MIN = {
  'Mortal':              [1, 3],
  'Qi Condensation':     [2, 12],
  'Foundation Building': [4, 10],
  'Core Formation':      [6, 14],
  'Nascent Soul':        [6, 16],
  'Spirit Severing':     [8, 22],
}
const PACING_PROFILE = 'active'   // flags are raised for the representative profile (the active game)

// Median life length per profile (the "Life Loop" report). Active is short by design (the bot dies and cycles
// lives); casual is the away/glance layer and may be long. Active-first since 2026-11-26.
const LIFE_TARGETS_H = {
  casual: { gen1: [8, 24], later: [8, 20] },
  active: { gen1: [1, 5] },
}
// Immortality pace — ACTIVE-FIRST and shorter (user 2026-11-26: "an active game now … push to a shorter completion
// time"). The old casual 380–540h target was measured on the idle economy and is stale. These are the bands the
// simulator flags; casual is looser because it acts only every 30 min.
const FIRST_ASCENSION_H = { active: [180, 300], casual: [320, 520] }
const GENERATIONS_TO_ASCEND = [12, 24]
// Phase 49b (docs/systems/mortal-phase.md): the mortal arc's length — the opening must be a short ACTIVE arc, not a
// wall-clock grind. Target = open hours from a life's start to its Awakening (the bot's 'awaken' milestone). It is
// Health-gated (the bitter trial's cost + regen), ~9–12 min for a mini-game-spamming min-maxer and longer for a
// normal player. Checked on 'active'; casual's 30-min check-in cadence makes its number noisy.
const MORTAL_AWAKEN_H = { active: [0.12, 0.5] }

module.exports = { PROFILES, DEFAULT_PATH, THRESHOLDS, PACING_TARGETS_MIN, PACING_PROFILE,
                    LIFE_TARGETS_H, FIRST_ASCENSION_H, GENERATIONS_TO_ASCEND, MORTAL_AWAKEN_H }
