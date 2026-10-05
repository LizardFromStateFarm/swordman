// Legendary bosses + the soul techniques they teach (v1 add-on, user 2026-10-04; docs/systems/bosses.md). Data only.
// Used by renderer/engine/game-state.js (fight kind 'boss', _mbFoeBoss, _mbBossPhase, bossInfo, Seed of the Self, the clone),
// renderer/game/hunt-view.js (the Legendary section), renderer/game/combat.js (boss mode), scripts/sim (bot + checks).
// Stage indices: 13 = Core Formation Early, 16 = Nascent Soul Early (assets/data/stages.js).

// A boss's own moves (looked up by _mbArtMake beside ARTS). Same shape as an art's `move`.
const BOSS_MOVES = {
  ash_shell:   { id: 'ash_shell', name: 'Shell of Ash', element: 'fire', kind: 'move', move: { type: 'ward', ward: 0.6, power: 0, cost: 0, desc: 'Curled in its egg, it hardens the shell.' } },
  cinder_rake: { id: 'cinder_rake', name: 'Cinder Talon', element: 'fire', kind: 'move', move: { type: 'strike', power: 30, cost: 0, desc: 'Talons wreathed in embers.' } },
  mirror_palm: { id: 'mirror_palm', name: 'Hollow Palm', element: 'water', kind: 'move', move: { type: 'strike', power: 26, cost: 0, desc: 'Your own palm, turned against you.' } },
}

const BOSSES = {
  bird: {
    id: 'bird', name: 'Self-Born Vermilion Bird', short: 'Vermilion Bird', technique: 'seed',
    gates: { life: 3, stage: 13 },
    art: 'vermilion_bird', glow: '#ff5a2a',   // ink-beasts.js placeholder (the eagle in vermilion) until the user's picture is baked (bosses.md → Art)
    element: 'fire', hpMult: 2.0, power: 0, swift: 55, parryChance: 0.08,   // tuned (probe-boss-fights.js): ~30% at its gate, ~85% three stages up
    lore: 'It has died a thousand times, and each time it hatched itself again from its own ashes. It needs no mate, and no one.',
    phases: [
      { at: 1.0,  name: 'Wings of Cinder', text: 'Fire and embers: it burns what it strikes.',
        moves: ['ember_scatter', 'heart_flame_fist', 'flame_lotus_storm', 'phoenix_rebirth_blaze', 'cinder_rake'] },
      { at: 0.55, name: 'From the Ashes', text: 'At 55% it burns to ash and is reborn once (to 70%), and takes up Wood: it drains and heals.',
        heal: 0.70, element: 'fire', elements: ['fire', 'wood'],
        moves: ['ember_scatter', 'flame_lotus_storm', 'life_stealing_thorn', 'withering_blight', 'world_tree_verdance', 'cinder_rake'],
        line: 'The bird burns. From the ash, it rises again, greener at the edges.' },
      { at: 0.25, name: 'The Last Egg', text: 'Below 25% it curls into an egg that hatches in 3 turns (it heals 40%). Break it first.',
        egg: 3, hatchHeal: 0.40, moves: ['ash_shell'],
        line: 'It folds into itself: an egg of ash and fire. Something stirs inside.' },
    ],
    hatchLine: 'The egg cracks. It hatches again, smaller, and furious.',
    drop: { item: 'vermilion_ash_pill', n: 1 }, renown: 30,
    lines: {
      first: 'A firebird circles the summit. The old ones say it has never once died for good.',
      again: 'The Vermilion Bird remembers you. The {n} of your line to climb this peak.',
      mercy: 'It remembers that you let it go. It has grown since.',
    },
  },
  wraith: {
    id: 'wraith', name: 'Thousand-Face Mirror Wraith', short: 'Mirror Wraith', technique: 'clone',
    gates: { life: 6, stage: 16 },
    element: 'water', hpMult: 2.4, power: 0, swift: 60, parryChance: 0.12,   // tuned: ~30% at its gate, ~83% three stages up
    lore: 'It has no face of its own. It wears yours, and fights as you would, only colder.',
    phases: [
      { at: 1.0,  name: 'Your Reflection', text: 'It fights with a copy of the arts you bring.', mirror: true, moves: ['mirror_palm'] },
      { at: 0.60, name: 'Two Faces', text: 'At 60% it splits in two. Only one face is real: each blow finds it as often as you read it true.',
        split: true, moves: ['mirror_lake_mist', 'abyssal_current', 'tide_turning_current', 'mirror_palm'],
        line: 'It steps apart from itself. Two of you stand there now, and only one of them breathes.' },
      { at: 0.25, name: 'The True Face', text: 'Below 25% the false face breaks, and it turns your strongest art back on you.',
        unsplit: true, steal: true, dmgMult: 1.15, moves: ['abyssal_current', 'mirror_palm'],
        line: 'The false face shatters. What is left wears no face at all, and it has learned your best blow.' },
    ],
    drop: { item: 'mirror_shard', n: 1 }, renown: 40,
    lines: {
      first: 'There is a thing in the Star Rift that wears the faces of those who come looking for it.',
      again: 'The Mirror Wraith wears your face again. The {n} time it has seen it.',
      mercy: 'It remembers that you let it go. It has learned more of you since.',
    },
  },
}
const BOSS_ORDER = ['bird', 'wraith']

const BOSS_FIGHT = {
  restSec: 1800,           // after a loss or a retreat, the boss rests this long (real time) before a rematch
  lossHealth: 0.10,        // a loss leaves you at this share of max Health (never dead)
  learnPerTry: 0.03,       // each failed attempt: +3% to your estimate ("You know its rhythm now")
  learnMax: 0.15,
  readBase: 0.60,          // the Wraith's Two Faces: your blows find the true face this often…
  readPerTry: 0.03,        // … + this per past attempt
  readMax: 0.85,
  mercyRealm: 100,         // a boss you spared returns this much stronger (one realm stage of power) per mercy…
  mercyHp: 0.15,           // … and +15% HP per mercy (max 3 counted)
  mercyMax: 3,
  mercyDropBonus: 1,       // … and one more of its drop per mercy
  stageScale: 0.06,        // its HP grows +6% per stage you stand above its gate (it meets you where you are)
  mercyKarma: 4, mercyHonour: 3,
}

// The soul techniques (kept by the save across lives once learned).
const SOUL_TECH = {
  seed: {
    id: 'seed', name: 'Seed of the Self', boss: 'bird', minStage: 13, minHealthFrac: 0.6,
    healthCost: 0.40, essenceSec: 2700, essenceQiMult: 0.75,   // −40% max Health; Qi/s ×0.75 for 45:00 real time
    bond: 65,
    desc: 'Plant a seed of your own essence and raise an heir with your root and your heart. Once a life.',
    turnBond: 40,          // a grown mirror child with bond below this (or wronged) turns: "It wears your face, and wants your seat"
    allyBond: 75,          // a grown mirror child with bond at or above this: "Two hearts, one path"
    allyWarBonus: 0.06,
  },
  clone: {
    id: 'clone', name: 'Body Beyond the Body', boss: 'wraith', minStage: 16,
    desc: 'Split off a second self that walks its own expedition while you walk yours. It costs Qi, and it may not come back the same.',
    qiCost: 0.20,          // forming it costs this share of your Qi cap
    qiMult: 0.85,          // your Qi/s while it is out
    shatterPerStage: 0.07, shatterMax: 0.35,   // a place above your realm: +7% per stage over, up to 35%
    shatterHealth: 0.20, restSec: 1200,         // a shattered clone: −20% max Health, 20:00 before you can form it again
    willPerHour: 0.04, willMax: 0.5,            // per return: chance it lingers = out-hours this life × this (max)
    willWords: [{ min: 0.3, w: 'its own' }, { min: 0.12, w: 'stirring' }, { min: 0, w: 'faint' }],
  },
}

if (typeof module !== 'undefined') module.exports = { BOSS_MOVES, BOSSES, BOSS_ORDER, BOSS_FIGHT, SOUL_TECH }
