// Phase 30 game clock + Phase 16-lite family timing. Used by: game-state.js, scripts/sim/*.
// Age is a harmless stat (user decision 2026-09-26): there is NO lifespan, old-age death, twilight or Final
// Seclusion — a life ends only by Ascension, combat/event death, or Pass the Mantle. The clock still drives
// age, the clan calendar, proposals and children. (File name kept from task 2.3 to avoid churn.)
// ADULT_AGE is only read by _die()'s summary + the sim so far; heir selection (task 2.6) is its real consumer.

// ── Game clock (task 2.3) ────────────────────────────────────────────────────
const GAME_YEARS_PER_OPEN_HOUR = 30    // 1 year per 2 open minutes. Age/gameYear advance ONLY in tick().
const AWAKENING_AGE            = 16    // every life (incl. heirs) starts here
const OFFLINE_QI_MULT          = 1.0   // multiplies initSlot() offline Qi gain (afk lever, task 2.4)

// ── Marriage & children timing (task 2.5, lite) ──────────────────────────────
const PROPOSAL_MIN_STAGE          = 10          // Foundation Building Early
const PROPOSAL_FIRST_DELAY_YEARS  = [5, 20]     // after first reaching PROPOSAL_MIN_STAGE
const PROPOSAL_RETRY_YEARS        = [20, 40]    // after a decline
const PROPOSAL_SUITORS            = [1, 3]
const SUITOR_STAGE_OFFSET         = [-3, 1]     // vs player stage, clamped to >= 1
const SUITOR_AGE_OFFSET_YEARS     = [-20, 20]   // vs player age, min 18
const SPOUSE_YEARS_PER_STAGE      = 25          // spouse gains 1 stage per this many married years...
const SPOUSE_STAGE_CAP            = 21          // ...never ascends. Spouses never die of age either.
const FIRST_CHILD_YEARS           = [8, 20]     // after marriage
const CHILD_INTERVAL_YEARS        = [15, 30]
const CHILD_CAP                   = 4
const ADULT_AGE                   = 16          // heir-eligible
