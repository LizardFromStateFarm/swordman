// Phase 30 game clock + lifespan, Phase 16-lite family timing. Used by: game-state.js, scripts/sim/*.
// Values are provisional (life-loop.md §9) — the user pre-authorized building M2 with these drafts.
// Everything here is consumed by code as of task 2.5 except LIFESPAN_EXT_CAP_FRAC (legacies, task 2.7).
// ADULT_AGE is only read by _die()'s summary + the sim so far; heir selection (task 2.6) is its real consumer.

// ── Game clock (task 2.3) ────────────────────────────────────────────────────
const GAME_YEARS_PER_OPEN_HOUR = 30    // 1 year per 2 open minutes. Age/gameYear advance ONLY in tick().
const AWAKENING_AGE            = 16    // every life (incl. heirs) starts here

// Lifespan (years) by the realm of maxStageThisLife (Mortal=0, QC=1-9, FB=10-12, CF=13-15, NS=16-18, SS=19-21)
const LIFESPAN_BY_REALM = {
  'Mortal':              70,
  'Qi Condensation':      250,
  'Foundation Building':  300,
  'Core Formation':       400,
  'Nascent Soul':         520,
  'Spirit Severing':      660,
  'Ascension':            660,
}

const TWILIGHT_FRAC              = 0.10   // twilight when age >= lifespan * (1 - TWILIGHT_FRAC), i.e. *0.9
const FINAL_SECLUSION_QPS_MULT   = 1.5
const FINAL_SECLUSION_BT_BONUS   = 0.10   // added to breakthrough chance before the 0.98 cap
const LIFESPAN_EXT_CAP_FRAC      = 0.25   // total of all lifespan extenders (legacies, task 2.7) <= +25% of base
const OFFLINE_QI_MULT            = 1.0    // multiplies initSlot() offline Qi gain (afk lever, task 2.4)

// ── Marriage & children timing (task 2.5, lite) ──────────────────────────────
const PROPOSAL_MIN_STAGE          = 10          // Foundation Building Early
const PROPOSAL_FIRST_DELAY_YEARS  = [5, 20]     // after first reaching PROPOSAL_MIN_STAGE
const PROPOSAL_RETRY_YEARS        = [20, 40]    // after a decline
const PROPOSAL_SUITORS            = [1, 3]
const SUITOR_STAGE_OFFSET         = [-3, 1]     // vs player stage, clamped to >= 1
const SUITOR_AGE_OFFSET_YEARS     = [-20, 20]   // vs player age, min 18
const SPOUSE_YEARS_PER_STAGE      = 25          // spouse gains 1 stage per this many married years...
const SPOUSE_STAGE_CAP            = 21          // ...never ascends. Spouse dies at LIFESPAN_BY_REALM[their realm]
const FIRST_CHILD_YEARS           = [8, 20]     // after marriage
const CHILD_INTERVAL_YEARS        = [15, 30]
const CHILD_CAP                   = 4
const ADULT_AGE                   = 16          // heir-eligible
const MOURNING_YEARS               = 20
