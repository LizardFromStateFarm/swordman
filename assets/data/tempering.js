// Phase 14 (docs/systems/body-constitution.md): body tiers, tempering methods, the ordeal crisis, the tier trial, scars,
// Blood Forging and the two mini-games (Tempering Strikes for body XP, Meridian Flow for Qi). Data only.
// Used by: game-state.js (s.body, s.minigames, maxHealth/regen, breakthrough Qi kept), body-view.js, minigames.js,
// breakdowns.js, attention.js, scripts/sim/bot.js + checks/body.js.

// ── Tiers ── everyone starts every life at F (user 2026-10-03). xp = cumulative XP to reach the tier.
// maxHealth replaces the old fixed 100; regenSec = seconds per +1 Health; btKeep = extra share of Qi kept on a failed
// breakthrough (added to the 50% base); power = person fight power (A6-3a _personPowerParts) per the body.
const BODY_TIERS = [
  { id: 'F', name: 'Frail Body',         xp: 0,      maxHealth: 100, regenSec: 45, btKeep: 0,    power: 0 },
  { id: 'E', name: 'Mortal Body',        xp: 200,    maxHealth: 120, regenSec: 40, btKeep: 0.05, power: 10 },
  { id: 'D', name: 'Hardened Body',      xp: 1000,   maxHealth: 150, regenSec: 34, btKeep: 0.10, power: 25 },
  { id: 'C', name: 'Steel Body',         xp: 5000,   maxHealth: 190, regenSec: 28, btKeep: 0.15, power: 45 },
  { id: 'B', name: 'Diamond Body',       xp: 20000,  maxHealth: 240, regenSec: 22, btKeep: 0.20, power: 70 },
  { id: 'A', name: 'Immortal Body',      xp: 80000,  maxHealth: 300, regenSec: 17, btKeep: 0.25, power: 100 },
  { id: 'S', name: 'Heaven-Forged Body', xp: 250000, maxHealth: 400, regenSec: 12, btKeep: 0.30, power: 140 },
]
// XP past the next tier's mark banks toward the trial, up to this share of the step after it (or of the last step).
const BODY_BANK_FRAC = 0.5

// ── Tempering methods ── one at a time, real time (runs while the game is closed, like an expedition).
// group: drill | spirit | ordeal | demonic | tribulation. minStage = CULTIVATION_STAGES index. cost: items (+ stones).
// qiMult: Qi/s multiplier while it runs. Ordeals stop at their crisis (the player answers it). onEndure: the bonus a
// clean Endure (or Draw on Qi) grants. once: once per life.
const TEMPERING_METHODS = [
  { id: 'morning',    group: 'drill',  name: 'Morning Exercise',         minStage: 0,  secs: 300,    cost: {},                                     xp: 5,
    desc: 'Stretch, breathe and run the hills before the sun clears them.' },
  { id: 'iron_fist',  group: 'drill',  name: 'Iron Fist Training',       minStage: 0,  secs: 1800,   cost: { beast_core: 1 },                      xp: 40,
    desc: 'Strike a post wrapped in a beast core’s ground hide until the knuckles stop bleeding.' },
  { id: 'boulder',    group: 'drill',  name: 'Boulder Carrying',         minStage: 1,  secs: 7200,   cost: { beast_core: 3 },                      xp: 200,
    desc: 'Carry a boulder up the mountain stair, set it down, and carry it up again.' },
  { id: 'beast_spar', group: 'drill',  name: 'Spar with your beast',     minStage: 0,  secs: 3600,   cost: {},                                     xp: 'beast', needsBeast: true,
    desc: 'Your strongest spirit beast does not hold back. Neither may you.' },
  { id: 'spirit_forge', group: 'spirit', name: 'Spirit Forge',           minStage: 3,  secs: 14400,  cost: { beast_core: 5, iron_ore: 2 },         xp: 600,  qiMult: 0.5,
    desc: 'Drive Qi through the flesh like a smith drives heat through iron. Cultivation slows while the body burns.' },
  { id: 'ten_thousand', group: 'spirit', name: 'Ten-Thousand Strikes',   minStage: 6,  secs: 28800,  cost: { iron_ore: 10 },                       xp: 1500, qiMult: 0.5,
    desc: 'Ten thousand blows against iron, each one fed with Qi. Cultivation slows while the body burns.' },
  { id: 'icy_waterfall', group: 'ordeal', name: 'Icy Waterfall Meditation', minStage: 10, secs: 43200, cost: { celestial_herb: 6 },                xp: 4000,
    onEndure: { rootBoost: { element: 'water', mult: 1.4, secs: 7200 } },
    desc: 'Sit beneath a glacier’s fall until the cold stops being pain. A Water root drinks the cold for hours after.' },
  { id: 'volcanic',   group: 'ordeal', name: 'Volcanic Immersion',       minStage: 11, secs: 43200,  cost: { demon_essence: 6 },                   xp: 4000,
    onEndure: { rootBoost: { element: 'fire', mult: 1.4, secs: 7200 } },
    desc: 'Lower yourself into a caldera’s lake of fire. A Fire root burns brighter for hours after.' },
  { id: 'thunder_peak', group: 'ordeal', name: 'Thunder Peak Endurance', minStage: 16, secs: 86400,  cost: { heavenly_ore: 8 },                    xp: 15000,
    onEndure: { btBonus: 0.02 },
    desc: 'Stand on the peak where the storm lives and let it strike. The body that endures it breaks through more surely.' },
  { id: 'void_pressure', group: 'ordeal', name: 'Void Pressure Chamber', minStage: 19, secs: 172800, cost: { void_crystal: 4, chaos_essence: 2 }, xp: 60000, once: true,
    onEndure: { first: 'void_body' },
    desc: 'A sealed chamber where the void presses from every side. Once in a life is all a body can bear.' },
  { id: 'blood_forging', group: 'demonic', name: 'Blood Forging',        minStage: 1,  secs: 21600,  cost: {},                                     xp: 'blood',
    desc: 'Temper the flesh in your own blood and the blood of beasts. Fast, forbidden, and the body does not forget it.' },
  { id: 'tribulation', group: 'tribulation', name: 'Absorb Tribulation Lightning', minStage: 99, secs: 1800, cost: {},                    xp: 25000, locked: 'Waits for the Heavenly Tribulation',
    desc: 'Channel the lightning of a survived Tribulation back into the body.' },
]
const TEMPERING_GROUPS = {
  drill:       { name: 'Drills',            note: 'safe' },
  spirit:      { name: 'Spirit Tempering',  note: 'Qi/s halved meanwhile' },
  ordeal:      { name: 'Ordeals',           note: 'each waits for you at its peak' },
  demonic:     { name: 'Forbidden',         note: 'fast, and it costs you' },
  tribulation: { name: 'Tribulation',       note: '' },
}
const TEMPERING_BEAST_XP = { base: 20, perLevelMight: 15 }   // Spar: base + perLevelMight × the beast's level × its might
// Multipliers on every tempering's XP
const TEMPERING_XP_TRAINING_GROUND = 0.10   // + per Training Ground level (a founder's own sect)
const TEMPERING_XP_ACTIVE          = 0.15   // Active Mode (22C)
const TEMPERING_CANCEL_REFUND      = 0      // items are spent when you begin (said on the button)

// ── The ordeal crisis ── at 100% the ordeal holds until you answer. Clean-endure odds (%):
// base + Health% × perHealth + tier × perTier + temper + perEndure × clean endures (to endureCap) − taint × perTaint.
const ORDEAL_CRISIS = {
  base: 60, perHealth: 15, perTier: 3, perEndure: 3, endureCap: 15, perTaint: 6, min: 15, max: 95,
  temper: { stoic: 6, hotblood: 4, demonking: 4, arrogant: 2, coward: -8, lazy: -5, glutton: -2 },
  hurt: [20, 40],          // Health lost on a bad roll (floors at 1 — an ordeal never kills)
  scarChance: 0.25,        // …and the chance it leaves a scar (grave when tainted ≥ graveTaint)
  graveTaint: 2,
  easeXp: 0.5,             // Ease off: this share of the XP, no bonus, no risk
  qiFrac: 0.10,            // Draw on Qi: spend this share of the stage's Qi cap — full XP + the bonus, safe
  btBonusCap: 0.06,        // Thunder Peak's breakthrough edge caps here per life
}

// ── The tier trial ── the bar is full; the tier rises only when you choose how.
// marrow: stones = stonesBase × stonesGrowth^tierIndex + Beast Cores (coresPerTier × (tier+1)); chance = base + Health% × perHealth.
// bitter: costs a share of max Health; higher odds; may scar. A failure keeps keepXp of the progress past the old mark.
const TIER_TRIAL = {
  marrow: { stonesBase: 40, stonesGrowth: 3, coresPerTier: 2, base: 0.75, perHealth: 0.2, max: 0.95 },
  bitter: { healthFrac: 0.4, chance: 0.9, scarChance: 0.2 },
  failKeepXp: 0.7, failHealth: 15,
}

// ── Scars and taint ──
const BODY_SCARS = {
  torn_sinews:         { name: 'Torn Sinews',         maxHealth: -0.05, regen: 0,     grave: false,
                         desc: 'A sinew that healed short. The body remembers the ordeal it failed.' },
  shattered_meridians: { name: 'Shattered Meridians', maxHealth: -0.10, regen: -0.15, grave: true,
                         desc: 'Channels cracked under strain. Health comes back slower and stops shorter.' },
}
const SCAR_MEND_ITEM  = 'pill_golden_marrow'   // a Golden Marrow Pill mends one scar (Path → Body)
const TAINT_MAX       = 5
const TAINT_CLEANSE_PER_DRILL = 1              // a finished safe drill cleanses this much taint
const BLOOD_FORGING = {
  unlockKarma: 30,         // available while karma ≤ this (or once you have ever forged)
  health: 15, karma: -5, taint: 1,
  xpMult: 2,               // × the best method you have unlocked, per hour, × its 6 hours
  sectStance: -2,          // each righteous sect (master morality > 0) hears of it
}

// ── Mini-games ── both on charges that refill on real time (closed too), so absence never costs anything.
const MINIGAME_CHARGES = { max: 3, refillSecs: 1800 }
// Tempering Strikes (body): 6 strikes (user 2026-10-03: 8 → 6, a bit shorter); a marker sweeps the bar, strike when it crosses the seal. Points: perfect 3,
// good 1. The seal narrows each strike. XP = points / maxPoints × xpHours × the best unlocked method's XP per hour
// (at least minXp). Or, while a tempering runs, each point cuts cutPerPoint of its remaining time (to cutMax).
const STRIKES = {
  strikes: 6, perfect: 3, good: 1,
  sweepMs: 1400,                         // one pass of the marker across the bar
  seal: 0.16, sealShrink: 0.012, sealMin: 0.08,   // the good zone (share of the bar); the perfect zone is perfectFrac of it
  perfectFrac: 0.35, relaxedMult: 1.6,
  xpHours: 0.5, minXp: 5,
  cutPerPoint: 0.24 / 18, cutMax: 0.24,   // a perfect run (6 × 3 points) still cuts the full 24%
}
// Meridian Flow (Qi): rotate tiles so Qi flows from the dantian to every acupoint. Grid size by stage; reward is a
// share of the stage's Qi cap (never above the cap), smaller after hourFull solves an hour. No clock (user 2026-10-03):
// solve it at your own pace and get the full Qi; a puzzle set aside waits (its charge already spent) until you finish it.
const FLOW = {
  sizes: [{ stage: 0, n: 4, points: 2 }, { stage: 10, n: 5, points: 3 }, { stage: 16, n: 6, points: 4 }],
  qiFrac: 0.06,
  hourFull: 3, hourMult: 0.7,
}

// Banter (Phase 29): the triggers this system emits
const BODY_BANTER_TRIGGERS = ['body_tier_up', 'ordeal_endure', 'ordeal_scar', 'minigame_perfect']
