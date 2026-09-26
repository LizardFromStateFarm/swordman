// Sect Wars (Phase 5B) data: war timer scaling, rival sect name pools, reinforcement/alliance/spoils constants.
// Depends on: nothing. Used by: game-state.js (sect-war logic, _recalc), renderer/game/sect-war.js, game.js (Sect tab war panel).

const WAR_MIN_INTERVAL_HOURS = 2
const WAR_MAX_INTERVAL_HOURS = 6
const WAR_FAME_SOFTCAP       = 500    // sectFame at/above this shortens the interval to the minimum

const WAR_SCOUT_SECONDS = 300   // 5 min — scouting phase
const WAR_PREP_SECONDS  = 600   // 10 min — preparation phase

// War prep is the main repeatable late-game stone sink — costs scale with fame so it stays a real choice.
const WAR_REINFORCE_COST_PER_FAME = 2      // Spirit Stones = max(20, sectFame × this)  (was 0.5) // economy pass 2026-09-25 (npm run sim)
const WAR_REINFORCE_POWER_BONUS   = 0.25   // +25% player power this war if reinforced

const WAR_ALLY_COST_BASE          = 100    // Spirit Stones = this + sectFame × WAR_ALLY_COST_PER_FAME
const WAR_ALLY_COST_PER_FAME      = 1      // (was 50 + fame × 0.3) // economy pass 2026-09-25 (npm run sim)
const WAR_ALLY_POWER_BONUS        = 0.2    // +20% player power this war if allied

const WAR_ARRAY_DAMAGE_HOURS   = 3     // Defensive Array's war_defense effect is disabled this long after a loss
const WAR_LOSS_RESOURCE_FRAC   = 0.08  // lose this fraction of current Spirit Stones on defeat (was 0.15 — acted as a wealth tax, ~80% of all stone outflow) // economy pass 2026-09-25 (npm run sim)

const WAR_SPOILS_STONE_BASE  = 15
const WAR_SPOILS_STONE_FRAC  = 0.4    // + sectFame × this, randomized ×0.7–1.3
const WAR_SPOILS_HERB_BASE   = 3
const WAR_SPOILS_HERB_FRAC   = 0.05

const RIVAL_SECT_PREFIXES = ['Black','Crimson','Iron','Shadow','Golden','Silver','Jade','Thunder','Frost','Blood','Nine Heavens','Vermillion','Obsidian','Ember','Coiling']
const RIVAL_SECT_SUFFIXES = ['Fang Sect','Blade Hall','Serpent Pavilion','Fist Clan','Talon Sect','Storm Hall','Shadow League','Dragon Sect','Wolf Pack','Reaper Hall']
