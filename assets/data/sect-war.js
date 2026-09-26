// Sect Wars data (Phase 5B own-sect wars + Phase 5C member wars): timers, rival name pools, prep/commitment bonuses, spoils, penalties.
// Depends on: items.js (MEMBER_WAR_RARE_ITEMS ids). Used by: game-state.js (sect-war logic, _recalc), renderer/game/sect-war.js, game.js (Sect tab war panels), scripts/sim.

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

// ── Member Wars (Phase 5C) — your joined Phase 4 sect goes to war and calls on you ──────────────────────────
// Window is 2h (not 15 min) so players who glance at the overlay every ~30 min can still answer the call.
const MEMBER_WAR_MIN_INTERVAL_HOURS = 4     // Grand Elder is called this often…
const MEMBER_WAR_MAX_INTERVAL_HOURS = 10    // …an Outer Disciple this rarely (linear in rank / 5)
const MEMBER_WAR_SCOUT_SECONDS      = 1800  // 30 min — Call to Arms
const MEMBER_WAR_PREP_SECONDS       = 5400  // 90 min — Muster (battle when it ends)

// Commitment bonuses (summed, then × SECT_RANKS[rank].rewardMult). Sect power = 1 + bonus vs enemy 0.6–1.4.
const MEMBER_WAR_ANSWER_BONUS     = 0.3    // answer the call — commits one sect-mission slot until the war ends
const MEMBER_WAR_CHEST_MAX_BONUS  = 0.3    // war chest bonus at full, linear below that
const MEMBER_WAR_CHEST_BASE       = 150    // Spirit Stones to fill the chest = this + rank × MEMBER_WAR_CHEST_PER_RANK
const MEMBER_WAR_CHEST_PER_RANK   = 100
const MEMBER_WAR_PILL_BONUS       = 0.05   // per pill offered
const MEMBER_WAR_MAX_PILLS        = 3
const MEMBER_WAR_PILL_CONTRIB     = 15     // contribution per pill offered
const MEMBER_WAR_BEAST_BASE_BONUS = 0.05   // + level × MEMBER_WAR_BEAST_LVL_BONUS, capped at MEMBER_WAR_BEAST_MAX_BONUS
const MEMBER_WAR_BEAST_LVL_BONUS  = 0.02
const MEMBER_WAR_BEAST_MAX_BONUS  = 0.25
const MEMBER_WAR_BEAST_XP         = 25     // XP the lent beast brings home, win or lose

// Outcome
const MEMBER_WAR_WIN_CONTRIB        = 60    // × rewardMult, engaged members only
const MEMBER_WAR_SPOILS_STONE_BASE  = 20    // (+ sect tier × PER_TIER) × rewardMult × 0.7–1.3, engaged members only
const MEMBER_WAR_SPOILS_STONE_PER_TIER = 12
const MEMBER_WAR_RARE_CHANCE        = 0.15  // engaged win → one rare item from MEMBER_WAR_RARE_ITEMS
const MEMBER_WAR_RARE_ITEMS         = ['demon_essence', 'artifact_fragment']
const MEMBER_WAR_BUFF_SUPPRESS_HOURS = 3    // defeat: the sect's bonuses are suppressed this long
const MEMBER_WAR_LOSS_CONTRIB       = 30   // defeat (war was seen): lose this × rewardMult contribution (flat — contribution keeps growing past max rank)
const MEMBER_WAR_IGNORE_CONTRIB     = 40   // saw the call, committed nothing: lose this × rewardMult too…
const MEMBER_WAR_IGNORE_KARMA        = 2    // …and this much karma
const MEMBER_WAR_DESERT_KARMA        = 5    // leaving the sect mid-war, on top of the normal −5 leave cost
