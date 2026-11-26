// File: assets/data/minigames.js (Phase 52 — docs/systems/minigames.md). The practice mini-game registry:
// every game's metadata (name, glyph, reward kind, cooldown, unlock, its timing config) so the engine/UI are
// data-driven, plus the Lift exercise's item ladder and the animated exercises' pose sets (EXERCISE_POSES below).
// Used by: game-state.js (s.minigames, minigameInfo/start/finish), minigames.js (MinigameUI), exercise-scene.js
// (ExerciseScene), body-view.js, game.js, attention.js, scripts/sim/*.
// Data only.

// family: 'timing' (a bar/tap sequence → body XP) | 'puzzle' (a seeded puzzle → Qi).
// mode (timing only): 'beat' (a marker crosses a gold seal) | 'stride' (alternating left/right taps) | 'hold'
//   (press-and-hold, let go in the top zone). Defaults to 'beat'.
// unlock: the body-tier index (0 = F) and/or stage index that opens it (the Practice list's lock).
// cooldownSecs: the real-time gap between runs (charge-free since Phase 48).
// scene: the ExerciseScene exercise id an animated timing game draws (its pose set is EXERCISE_POSES[id]).
// A puzzle game (flow · memory) has no `timing`; its tuning is a top-level block (FLOW in tempering.js, MEMORY below),
// and its session (seed + the frozen shape) is verified engine-side in game-state.js finishMinigame.
// timing: the scoring config — how many reps, how long one takes, what a rep is worth and how a run pays
//   (shared by the engine's verification and the reward formula: game-state.js _timingCfg/_exerciseXp).
//   reps | repsByTier (index = body tier; Lift lifts fewer, heavier reps at low tiers, more at high) ·
//   sweepMs (one pass of the marker / one nominal rep) · perfectPts / goodPts · xpHours (a perfect run's worth,
//   in hours of your best tempering rate) · minXp · minSecs (an anti-script floor: a run faster than this scores
//   nothing) · cutMax / cutPerPoint (spend the score to shorten a running tempering instead of XP).
const TIMING = {
  pushups: { reps: 6,  sweepMs: 1400, perfectPts: 3, goodPts: 1, xpHours: 0.5,  minXp: 5, minSecs: 2.1,
             cutMax: 0.24, cutPerPoint: 0.24 / 18 },
  run:     { reps: 10, sweepMs: 520,  perfectPts: 3, goodPts: 1, xpHours: 0.55, minXp: 5, minSecs: 2.0,
             cutMax: 0.28, cutPerPoint: 0.28 / 30 },
  lift:    { repsByTier: [1, 1, 1, 2, 2, 3, 3], sweepMs: 2400, perfectPts: 3, goodPts: 1, xpHours: 1.0, minXp: 8, minSecs: 1.2,
             cutMax: 0.35, cutPerPoint: 0.35 / 9 },
}

const MINIGAMES = [
  { id: 'pushups', family: 'timing', mode: 'beat', name: 'Push-Ups', glyph: 'duel', reward: 'body', cooldownSecs: 30,
    scene: 'pushups', unlock: { bodyTier: 0 }, timing: TIMING.pushups,
    blurb: 'Tap on the beat: a clean rep presses you up, a mistimed one is half.' },
  { id: 'run', family: 'timing', mode: 'stride', name: 'Running', glyph: 'run', reward: 'body', cooldownSecs: 40,
    scene: 'run', unlock: { bodyTier: 1 }, timing: TIMING.run,
    blurb: 'Tap left foot, then right, keeping the stride on the beat. A stumble only slows you.' },
  { id: 'lift', family: 'timing', mode: 'hold', name: 'Lift', glyph: 'lift', reward: 'body', cooldownSecs: 60,
    scene: 'lift', unlock: { bodyTier: 2 }, timing: TIMING.lift,
    blurb: 'Hold, and let go inside the gold: the load you can raise grows more ridiculous with every tier.' },
  // QA 2026-11-26: Meridian Flow is a QI game, so it unlocks AFTER the Awakening (stage 1). While a mortal there
  // is no Qi to flow — the opening loop is Body training + Explore, and the Awakening is body-tier D.
  { id: 'flow', family: 'puzzle', name: 'Meridian Flow', glyph: 'vein', reward: 'qi', cooldownSecs: 20,
    unlock: { stage: 1 }, blurb: 'Turn the channels until Qi reaches every acupoint.' },
  { id: 'memory', family: 'puzzle', name: 'Memorization', glyph: 'dantian', reward: 'qi', cooldownSecs: 25,
    unlock: { stage: 1 }, blurb: 'Acupoints light in a seeded order — repeat the sequence back. It grows with your realm.' },
]

// Memorization (Qi) — the Acupoint Sequence (Phase 52d). A 3×3 grid of acupoints lights a seeded order; the player
// repeats it. The `sizes` row for the current stage gives the round count + each round's length (3 → 8 lights over a
// life). A mistake ends the run but keeps every round already cleared. No clock; the reward is a share of the stage's
// Qi cap (proportional to rounds cleared, never above the cap), smaller after hourFull clears an hour. Data only;
// read by game-state.js (session/verify/reward) and minigames.js (MemoryPuzzle + the overlay).
const MEMORY = {
  grid: 9,                                  // a 3×3 grid of acupoints (indices 0..8)
  sizes: [ { stage: 1,  rounds: 2, lens: [3, 4] },
           { stage: 8,  rounds: 3, lens: [4, 5, 6] },
           { stage: 14, rounds: 3, lens: [5, 6, 8] } ],
  paceMs: 620, gapMs: 240,                  // how long each acupoint lights, and the beat between lights
  qiFrac: 0.08,                             // a full clear pays this share of the stage Qi cap
  hourFull: 2, hourMult: 0.7,               // the third+ clear in an hour pays less (soft DR, like FLOW)
  minSecsPerLight: 0.35,                    // anti-script: a run must last at least this long per light shown
}

// The boulder a body of each tier can lift — the Lift exercise's load (one boulder, drawn larger every tier; the
// cracks glow with spirit veins from tier B) and the Path → Body chip. Index = body tier (0 = F Frail … 6 = S Heaven-Forged).
// (User 2026-10-11: one growing boulder instead of a ladder of different objects.)
const LIFT_ITEMS = ['a river stone', 'a boulder', 'a great boulder', 'a boulder the size of an ox', 'a boulder the size of a house',
  'a boulder the size of a hall', 'a boulder the size of a hill']

// The mini-game glyphs MinigameUI falls back to when a kind has no explicit glyph.
const MINIGAME_DEFAULT_GLYPH = 'duel'

// Phase 52b/52c (re-rigged 2026-10-11): the ExerciseScene figure (renderer/engine/exercise-scene.js). A side-view
// cultivator built on a small bone rig: fixed bone lengths, so a limb never stretches between poses. Figure units:
// x → the way the figure faces, y → down, the ground at y = 1, a standing figure ~1 tall.
// Angles are degrees. A limb's angle is measured from straight DOWN, + = swung forward (the facing side); the torso
// and head are measured from straight UP, + = leaning forward.
// EXERCISE_BODY: bone lengths + the far side's depth offset (the far arm/leg sit a touch behind and up, in cooler ink).
const EXERCISE_BODY = {
  head: 0.058, neck: 0.045, torso: 0.29, upperArm: 0.165, foreArm: 0.15, palm: 0.045,
  thigh: 0.245, shin: 0.235, ankle: 0.035, foot: 0.095, depth: [0.024, -0.018],
}

// Two kinds of pose set:
//  · keys  — keyframes along the press (0 → 1), eased between: each key gives the hip, torso + head angles and the
//            limbs as IK targets ({ ik:[x,y], hint:[dx,dy] } — the hint is the side the elbow/knee bends toward) or a
//            planted toe. `arm2`/`leg2` give the far side its own target; otherwise it copies the near side, offset by
//            the depth. `ease:'sine'` dwells at the ends (the push-up's top + bottom).
//  · cycle — a gait (Running): `phase` 0 → 1 is a full stride (two steps); the near leg reads the tables at `phase`,
//            the far leg at phase + 0.5. leg: [phase, thigh°, knee bend°] · foot: [phase, toe-point°] · arm:
//            [phase, upper°, elbow bend°]. The hip is grounded on the lowest foot each frame, lifted by `flight` in the
//            two airborne windows; `scroll` = figure units the ground slides per stride (matched to the planted foot).
// `prop:'lift'` draws the body tier's LIFT_ITEMS load gripped at the hands; `wind` blows the sash + ribbon.
const EXERCISE_POSES = {
  // Push-Ups: a rigid plank pivoting on the toes; the chest dips to a fist above the ground, elbows folding back.
  pushups: {
    kind: 'keys', ease: 'sine', wind: [0, 0],
    keys: [
      { at: 0, hip: [-0.204, 0.762], torso: 72, head: 64,
        arm: { ik: [0.075, 0.985], hint: [-1, -0.2], palm: 90 }, leg: { ik: [-0.66, 0.925], hint: [0, 1], toe: [-0.598, 0.996] } },
      { at: 0.55, hip: [-0.19, 0.842], torso: 80, head: 70,
        arm: { ik: [0.08, 0.972], hint: [-1, -0.5], palm: 90 }, leg: { ik: [-0.66, 0.925], hint: [0, 1], toe: [-0.598, 0.996] } },
      { at: 1, hip: [-0.181, 0.893], torso: 86, head: 74,
        arm: { ik: [0.08, 0.972], hint: [-1, -0.7], palm: 90 }, leg: { ik: [-0.66, 0.925], hint: [0, 1], toe: [-0.598, 0.996] } },
    ],
  },
  // Running: a forward-leaning stride, arms pumping against the legs, a short flight between steps.
  run: {
    kind: 'cycle', torso: 22, head: 2, flight: 0.032, scroll: 1.7, wind: [-2.4, -0.2],
    stance: [0, 0.32],
    leg:  [[0, 30, 10], [0.1, 16, 32], [0.24, -16, 16], [0.34, -34, 46], [0.5, -18, 112], [0.68, 32, 112], [0.85, 52, 46], [1, 30, 10]],
    foot: [[0, -6], [0.18, 0], [0.3, 30], [0.42, 42], [0.6, 18], [0.85, -6], [1, -6]],
    arm:  [[0, -44, 80], [0.25, -4, 100], [0.5, 40, 122], [0.75, -4, 100], [1, -44, 80]],
  },
  // Lift: squat under the load (back flat, knees clear of it) → hold it before the face (forearms up, elbows forward)
  // → drive it past the crown → lock it out overhead with a slight lean back (the gold zone is overhead).
  lift: {
    kind: 'keys', prop: 'lift', wind: [0, 0],
    keys: [
      { at: 0, hip: [-0.26, 0.76], torso: 66, head: 34,
        arm: { ik: [0.14, 0.935], hint: [0.2, 1] }, leg: { ik: [-0.04, 0.965], hint: [1, -0.3], flat: true } },
      { at: 0.45, hip: [-0.08, 0.51], torso: 4, head: 2,
        arm: { ik: [0.085, 0.30], hint: [0.6, 1] }, leg: { ik: [-0.03, 0.965], hint: [1, 0], flat: true } },
      { at: 0.72, hip: [-0.07, 0.525], torso: 0, head: -4,
        arm: { ik: [0.02, 0.0], hint: [1, 0.4] }, leg: { ik: [-0.03, 0.965], hint: [1, 0], flat: true } },
      { at: 1, hip: [-0.07, 0.50], torso: -6, head: -6,
        arm: { ik: [0.03, -0.105], hint: [1, 0] }, leg: { ik: [-0.03, 0.965], hint: [1, 0], flat: true } },
    ],
    // a wide stance: the far foot set back; the far hand grips a little behind the near one (a two-handed press)
    far: { leg: [-0.16, 0.965], arm: [-0.12, 0.02] },
  },
}
