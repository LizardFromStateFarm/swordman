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
// Retuned 2026-09-26 (M2 task 2.4, pacing compression) — Mortal/Qi Condensation are unchanged (§6.1:
// casual's 30-min check-in cadence already floors QC at ~4.5h regardless of cap). Foundation Building
// through Spirit Severing were tightened so a casual mortal LIFE (not just cumulative pacing) lands in
// the 10–20 open-hour band and reaches Spirit Severing / an Ascension attempt within that life (old-age
// death existed then; removed 2026-09-26, see life-loop.md §15). Old bands (pre-task-2.4): FB 20–45,
// CF 60–180, NS 180–480, SS 480–1200.
const PACING_TARGETS_MIN = {
  'Mortal':              [1, 4],
  'Qi Condensation':     [2, 15],
  'Foundation Building': [15, 30],
  'Core Formation':      [30, 60],
  'Nascent Soul':        [45, 90],
  'Spirit Severing':     [60, 300],   // widened 2026-09-26: Final Seclusion no longer boosts SS (life-loop.md §15)
}
const PACING_PROFILE = 'casual'   // flags are raised for this profile only (the representative idle player)

// life-loop.md §6.2/§6.4 — per-life open-hours targets (M2 task 2.4). Median life length per profile,
// checked against the "Life Loop" report section. Adjusted from life-loop.md's original draft numbers
// (casual gen1 [12,20], active gen1 [4,10]) to match the task's actual acceptance band ("casual 10-20h,
// active faster, >= ~5h") once sim measurement showed active's median life (bot plays to repeated
// Ascension attempts) lands a little above the draft's 10h upper end — still comfortably faster than
// casual and well clear of the 5h floor, so the target was widened rather than re-chasing the tighter
// draft band with knobs this task doesn't otherwise need to turn.
// `later` (post-catch-up generations) and FIRST_ASCENSION_H/GENERATIONS_TO_ASCEND are NOT checked yet:
// every death is still a fresh soul with no ancestral catch-up (tasks 2.5-2.8 build that), so there is
// no "later generation" or "generations to first Ascension" signal to check against yet. Kept here as
// the constants task 2.8's tuning pass expects to find, per life-loop.md §8's build-order table.
// Final QA (2026-10-04): re-banded to the accepted Immortality pace — ~37 casual lives in ~430 h is ~12 h a life (the
// 200 h baseline measured 11.5 h casual, 2.0 h active: road deaths, Pass the Mantle at the peak below BQ 100). Was
// casual [20, 40] (2026-09-26, one life per Ascension) and active [5, 15].
const LIFE_TARGETS_H = {
  casual: { gen1: [8, 20], later: [8, 16] },
  active:  { gen1: [1, 5] },
}
// Immortality pace — checked since the final QA pass (report.js "Immortality" line; flags casual only). The user accepted
// the measured pace on 2026-10-04: casual Immortality ≈ 37 lives / ~430–475 open hours (Phase 47's BQ-100 gate). Old
// targets (task 2.8 draft, before Phase 47): 40–80 h, 3–5 generations. Bands are ±~15% around the accepted numbers.
const FIRST_ASCENSION_H = { casual: [380, 540] }
const GENERATIONS_TO_ASCEND = [30, 45]

module.exports = { PROFILES, DEFAULT_PATH, THRESHOLDS, PACING_TARGETS_MIN, PACING_PROFILE,
                    LIFE_TARGETS_H, FIRST_ASCENSION_H, GENERATIONS_TO_ASCEND }
