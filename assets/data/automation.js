// Active/Idle Mode + automation unlock thresholds + Active Mode bonus constants (Phase 22, roadmap M1 1.6).
// Depends on: nothing (pure data — stageIndex/sectRank values reference stages.js/sects.js by number, see
// docs/systems/automation.md for why they don't match PLAN.md's original draft table).
// Used by: game-state.js (mode + automation dispatch, _tickAutomation, attemptBreakthrough/craftItem opts),
// game.js (mode button, Automation panel, Push Harder, breakthrough focus window, Master's Touch),
// scripts/sim/bot.js (idle profiles enable automation; active profile uses Active Mode).

const PLAY_MODE_DEFAULT = 'idle'   // 'idle' | 'active' — idle is the default, first-class way to play (pillar 4)

// Unlock thresholds. stageIndex values are the actual CULTIVATION_STAGES indices for the named realm/layer
// today: Core Formation Early = 13, Nascent Soul Early = 16, Spirit Severing Early = 19. sectRank 3 = Elder
// (SECT_RANKS[3]). Retune here (not by hunting magic numbers elsewhere) when M2 task 2.4 compresses pacing.
const AUTOMATION_UNLOCKS = {
  autoExplore:      { stageIndex: 13, label: 'Core Formation' },
  autoSectMissions: { sectRank: 3, hallLevel: 2, label: 'Elder rank or Sect Hall Lv.2' },
  autoCraft:        { stageIndex: 19, label: 'Spirit Severing' },
  autoBreakthrough: { stageIndex: 16, label: 'Nascent Soul' },
}

const AUTO_BREAKTHROUGH_THRESHOLD_DEFAULT = 0.95
const AUTO_BREAKTHROUGH_THRESHOLD_MIN     = 0.80
const AUTO_BREAKTHROUGH_THRESHOLD_MAX     = 1.00
const AUTO_BREAKTHROUGH_THRESHOLD_STEP    = 0.01

// Auto-Explore never relaunches into a zone that outclasses you (injury risk) while health is below this —
// keeps offline catch-up from walking a wounded cultivator into death while the game is closed (pillar 4).
const AUTO_EXPLORE_MIN_HEALTH_OUTCLASSED = 60

const AUTO_CRAFT_CHECK_SECONDS = 3   // throttle: how often the auto-craft list is re-checked (crafting is instant)

// ── Active Mode (22C) — modest bonuses for attentive players; never required (pillar 4) ───────────────────
const ACTIVE_EXPEDITION_TIME_MULT    = 0.65   // -35% expedition duration
const ACTIVE_SECT_MISSION_TIME_MULT  = 0.75   // -25% sect mission duration
const ACTIVE_BT_QI_LOSS_BONUS        = 0.10   // extra Qi kept (on top of any pill) on a failed breakthrough

const ACTIVE_PUSH_HARDER_COST         = 10     // Spirit Stones, once per expedition
const ACTIVE_PUSH_HARDER_WINDOW_FRAC  = 0.20   // available during the last 20% of the expedition timer

const ACTIVE_BT_FOCUS_WINDOW_SECONDS  = 3      // click-window length after canBreakthrough flips true
const ACTIVE_BT_FOCUS_BONUS           = 0.05   // one-attempt-only success chance bonus

const ACTIVE_CRAFT_TOUCH_CHANCE        = 0.10   // "Master's Touch" double-output chance per craft
const ACTIVE_CRAFT_TOUCH_WINDOW_SECONDS = 60    // must have viewed the Craft tab within this long
