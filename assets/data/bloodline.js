// Tunable constants for Phase 23A (Health & Death), 23B (Bloodline Quality) and 23C (Ascension Trial).
// Used by: game-state.js (health regen/damage, ascensionChance, attemptAscension, _die), events.js (inner_demon).
// No family system yet (Phase 16/18 not built) — every reincarnation is a "new soul" (BLOODLINE_CARRY_NEW_SOUL).

// ── 23A: Health ──────────────────────────────────────────────────────────────
const HEALTH_REGEN_SECONDS = 45          // +HEALTH_REGEN_AMOUNT every this many seconds
const HEALTH_REGEN_AMOUNT  = 1

const EXPEDITION_INJURY_CHANCE_PER_TIER = 0.12   // per enemy-tier the location outclasses the player
const EXPEDITION_INJURY_BASE            = 5
const EXPEDITION_INJURY_PER_TIER        = 4

const WAR_INJURY_CHANCE = 0.35           // chance of injury on a sect-war defeat you fought in
const WAR_INJURY_AMOUNT = 12

// ── 23B: Bloodline Quality ───────────────────────────────────────────────────
const BLOODLINE_CAP            = 100
const BLOODLINE_G_BASE         = 1
const BLOODLINE_G_SELF         = 8       // partner term (G_partner) waits on Phase 16 (family)
const BLOODLINE_CARRY_NEW_SOUL = 0.25    // family carry (1.0 + bonus) waits on Phase 16/18 heirs

// ── 23C: Ascension Trial ─────────────────────────────────────────────────────
const ASCENSION_BASE_CHANCE    = 0.07
const ASCENSION_BQ_COEF        = 0.006   // +60% at Bloodline Quality 100
const ASCENSION_PREP_INTEGRITY = 0.03    // Realm Integrity at 100 when the trial is attempted
const ASCENSION_PREP_HEALTH    = 0.03    // Health at 100 when the trial is attempted
const ASCENSION_CHANCE_CAP     = 0.95
