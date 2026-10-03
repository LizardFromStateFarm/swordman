// Tunable constants for Phase 23A (Health & Death), 23B (Bloodline Quality) and 23C (Ascension Trial).
// Used by: game-state.js (health regen/damage, ascensionChance, attemptAscension, _die), events.js (inner_demon).
// Phase 16-lite (M2 task 2.5) added BLOODLINE_G_PARTNER — the spouse term in _die()'s growth formula.
// clan-succession.md 2.6c added BLOODLINE_G_HEIR (heir strength) + BLOODLINE_G_TRAUMA_HEIR (heir forged in a lethal
// tournament or duel). Rebirth carry for a descendant is task 2.6d.

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
const BLOODLINE_G_SELF         = 8
const BLOODLINE_G_PARTNER      = 2.5     // Phase 16-lite (M2 task 2.5): spouse's maxStage this life (current or last)
const BLOODLINE_G_HEIR         = 2.5     // 2.6c: × (heir stage / 22)² — the heir who takes over the clan
const BLOODLINE_G_TRAUMA_HEIR  = 1       // 2.6c: flat, if that heir won their place through trauma (user, 2026-09-26)
// Phase 47 (1.21): the bloodline barely thins between lives, so it can climb toward the 100 the Trial now demands
// — but each life adds less (the growth above is small and shrinks as BQ nears the cap), so it takes ~15 lives, not ~4.
const BLOODLINE_CARRY_NEW_SOUL = 0.95
const BLOODLINE_QI_COEF        = 0.01    // Phase 47: +1% Qi/s per point, up to +100% (×2) at BQ 100 — the inherited
                                         // head start that replaced ancestral catch-up (lineage-sect.md)

// ── 23C: Ascension Trial ─────────────────────────────────────────────────────
const ASCENSION_BASE_CHANCE    = 0.07
const ASCENSION_BQ_COEF        = 0.006   // +60% at Bloodline Quality 100
const ASCENSION_PREP_INTEGRITY = 0.03    // Realm Integrity at 100 when the trial is attempted
const ASCENSION_PREP_HEALTH    = 0.03    // Health at 100 when the trial is attempted
const ASCENSION_CHANCE_CAP     = 0.95
const ASCENSION_MIN_BLOODLINE  = 100     // Phase 47 (1.21): the Trial may only be attempted at the full bloodline
