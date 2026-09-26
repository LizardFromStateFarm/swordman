// PERSONALITIES — the 14 cultivator personalities (Phase 29) + banter engine tuning constants.
// Used by game-state.js (roll on new game / migration), renderer/game/banter.js, game.js (Stats, charselect), scripts/sim.
// Line pools live in banter-lines.js. Writing brief: docs/systems/banter-writing-guide.md.

const PERSONALITIES = [
  { id: 'arrogant',  name: 'Arrogant Young Master', nameCN: '傲慢少主',  blurb: 'Face above all. Humbled by leaves.' },
  { id: 'coward',    name: 'Shameless Coward',      nameCN: '厚颜胆小鬼', blurb: 'Fleeing is also a Dao.' },
  { id: 'hotblood',  name: 'Hot-Blooded Idiot',     nameCN: '热血笨蛋',  blurb: 'LOUD. No plan. Will punch the sky.' },
  { id: 'miser',     name: 'Iron Rooster Miser',    nameCN: '铁公鸡',    blurb: 'Haggles with Heaven itself.' },
  { id: 'glutton',   name: 'Bottomless Glutton',    nameCN: '吃货',      blurb: 'Every Dao is a recipe.' },
  { id: 'poet',      name: 'Melodramatic Poet',     nameCN: '多愁诗人',  blurb: 'Weeps verse over mild inconvenience.' },
  { id: 'stoic',     name: 'Deadpan Stoic',         nameCN: '面瘫',      blurb: 'Feels nothing. Eyebrows on fire.' },
  { id: 'demonking', name: 'Self-Proclaimed Demon King', nameCN: '中二魔尊', blurb: 'Kneel, insects. (No one kneels.)' },
  { id: 'paranoid',  name: 'Paranoid Schemer',      nameCN: '阴谋家',    blurb: 'The crane is a spy.' },
  { id: 'grumpy',    name: 'Grumpy Old Soul',       nameCN: '倔老头',    blurb: 'Back in my day, we had no roots.' },
  { id: 'lazy',      name: 'Lazy Genius',           nameCN: '懒散天才',  blurb: 'Napping is a cultivation technique.' },
  { id: 'niceguy',   name: 'Genuinely Nice Guy',    nameCN: '老好人',    blurb: 'Wholesome in a genre built on murder.' },
  { id: 'psycho',    name: 'Unhinged Psycho',       nameCN: '疯魔',      blurb: 'Smiling. Remembering your face. Hehe.' },
  { id: 'gremlin',   name: 'Nonsense Gremlin',      nameCN: '胡言乱语',  blurb: 'Borgin. Gorgin. The Dao is beans.' },
]

// Every personality (and the generic pool) needs lines for each of these.
const BANTER_TRIGGERS = ['idle', 'bt_success', 'bt_fail', 'bt_fail_streak', 'rare_drop', 'expedition_return',
  'low_health', 'war_call', 'war_won', 'war_lost', 'reborn', 'ascension_trial', 'welcome_back', 'morning', 'night']
const BANTER_MIN_LINES = { idle: 25, other: 4, genericIdle: 20, genericOther: 2 }

// Idle chatter interval (seconds, min–max) per banterFreq setting. 'off' = silent (no contextual lines either).
const BANTER_FREQ = { rare: [600, 1500], normal: [240, 720], chatty: [90, 240] }
const BANTER_CONTEXT_DELAY    = 1.5   // s after an event before its line shows (lands after the toast)
const BANTER_BUBBLE_SECONDS   = 6
const BANTER_RECENT_MAX       = 20    // no-repeat buffer
const BANTER_LOG_MAX          = 50
const BANTER_LOW_HEALTH       = 30
const BANTER_FAIL_STREAK      = 3
const BANTER_RARE_WEIGHT_FRAC = 0.15  // drop-table weight share at or below which a drop counts as "rare"
const BANTER_WELCOME_HOURS    = 1     // min hours away for a welcome_back line
