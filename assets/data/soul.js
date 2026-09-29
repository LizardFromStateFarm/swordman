// Soul Points + Soul Resonance tuning (Phase 40, docs/systems/soul-points.md). Data only.
// Used by renderer/engine/game-state.js (soul record, _recalc term), renderer/game/soul-view.js, scripts/sim (loader, bot, checks/soul.js).

const SOUL_FAIL_BASE      = 20     // Soul Points for any failed Ascension Trial
const SOUL_FAIL_PER_PCT   = 0.5    // + this per % of the odds shown on the trial card (a prepared failure pays more)
const SOUL_V1_GRANT       = 500    // the first Immortality ever on this install (the v1 finish)
const SOUL_IMMORTAL_GRANT = 150    // every later Immortality, any slot

const SOUL_RESONANCE_QPS  = 0.05   // +5% Qi/s per rank, additive
const SOUL_RESONANCE_MAX  = 20     // +100% at full resonance
const SOUL_RANK_BASE      = 25     // cost of rank 1
const SOUL_RANK_GROWTH    = 1.35   // cost × this per rank already held

const SOUL_LOG_MAX        = 30
