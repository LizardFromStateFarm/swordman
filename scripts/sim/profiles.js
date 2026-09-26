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
  hoardStones:       2000,    // Spirit Stones sitting unspent at end → "nothing to buy"
  minDecisionsPerHr: { active: 6, casual: 1, afk: 1 },  // fewer meaningful actions/hour → "boring stretch"
  unusedFeature:     true,    // flag systems a profile never touched in its longest run
}

// GAMEDESIGN.md "Progression pacing": idle minutes to fill the Qi cap, per stage, by realm.
// Mortal→Core Formation are from the design doc; Nascent Soul / Spirit Severing extrapolate its
// "many hours … rough doubling per realm tier" rule.
const PACING_TARGETS_MIN = {
  'Mortal':              [1, 4],
  'Qi Condensation':     [2, 15],
  'Foundation Building': [20, 45],
  'Core Formation':      [60, 180],
  'Nascent Soul':        [180, 480],
  'Spirit Severing':     [480, 1200],
}
const PACING_PROFILE = 'casual'   // flags are raised for this profile only (the representative idle player)

module.exports = { PROFILES, DEFAULT_PATH, THRESHOLDS, PACING_TARGETS_MIN, PACING_PROFILE }
