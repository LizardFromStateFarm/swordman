# Mini-games (练功 · Practice) — Phases 14 + 52

The **optional** active training games you open from Path → Body ("Practice") and the HUD. They are a **bonus**
beside the wall-clock tempering methods (`tempering.js`) — never required, and a bad run only pays **less**.

Related: `docs/systems/body-constitution.md` (tiers/methods), `docs/systems/active-cultivation.md` (the active Qi
loop), `docs/systems/art-engine.md` (the ink scene layer the exercise animation reuses), `docs/systems/banter.md`.

## Phase 52 status

- **52a ✅ built** — the **registry** (`assets/data/minigames.js`): every game's metadata drives the engine + UI.
  `Tempering Strikes` was **retired**; its timing bar is now **Push-Ups**. **Meridian Flow** is kept.
- **52b ✅ built** — the **animated figure** (`renderer/engine/exercise-scene.js`, `ExerciseScene`): Push-Ups plays on
  a live dot-silhouette that presses in step with the timing bar. Asset gate **8.1 PASS** (cycle 1 6.4 FAIL → 8.4 →
  8.1; docs/systems/ui-review.md).
- **52c ✅ built** — **Running** (a `stride` timing mode: tap the due foot on the beat) + **Lift** (a `hold` mode:
  press, let go inside the gold) on the same scene, the `LIFT_ITEMS` ladder art + the Path → Body chip. Asset gate
  **8.2 PASS** (the silhouettes + the ladder) and UI **7.7 PASS**; the `run`/`lift` icons took 3 cycles → **8.2 PASS**.
- **52d ✅ built** — **Memorization** (`family:'puzzle'`, mode-less): the **Acupoint Sequence**. A 3×3 grid lights a
  seeded order (3 → 8 acupoints over the realms); the player repeats it. The engine re-derives the sequences from the
  session seed (`MemoryPuzzle.generate`) and counts the rounds held, so a forged answer earns nothing. **UI 7.6 → 7.8 PASS**
  (a watch dim, a red miss + gold "due" cue, the 1–9 hint, and a result card that leads with the score).
- **Re-rig (2026-10-11)** — the figure rebuilt on a bone rig (see "The animated figure" below); asset gate 7.5 → 7.8 → 7.7, handed to the user.
- **52e ⬜ planned** — the Practice picker's unlocks, the HUD Train segment, banter, and the remaining art gates. Full
  plan: `~/.commandcode/plans/minigames-practice.md`.

## The registry — `assets/data/minigames.js`

```js
MINIGAMES = [ { id, family, mode?, name, glyph, reward, cooldownSecs, unlock, blurb, scene?, timing, …tuning }, … ]
LIFT_ITEMS = ['a river stone','a boulder','a great boulder','a boulder the size of an ox', … 'a boulder the size of a hill']
TIMING = { pushups: {…}, run: {…}, lift: {…} }
EXERCISE_BODY = { head, neck, torso, upperArm, foreArm, palm, thigh, shin, ankle, foot, depth }
EXERCISE_POSES = { pushups: { kind:'keys', ease:'sine', keys:[…] }, run: { kind:'cycle', leg, foot, arm, … }, lift: { kind:'keys', prop:'lift', keys:[…], far } }
```

- **`family`**: `'timing'` (a bar/tap sequence → **body XP**) · `'puzzle'` (a seeded puzzle → **Qi**).
- **`mode`** (timing only): `'beat'` (a marker crosses a gold seal — Push-Ups) · `'stride'` (tap the foot that is due —
  Running) · `'hold'` (press-and-hold, let go inside the gold — Lift). Defaults to `'beat'`.
- **`reward`**: `'body'` | `'qi'`.
- **`unlock`**: `{ bodyTier }` (0 = F) and/or `{ stage }` (stage index) — the Practice list's lock.
- **`cooldownSecs`**: real-time gap between runs (charge-free, Phase 48).
- **`scene`**: the `ExerciseScene` exercise id an animated timing game draws (its pose set is `EXERCISE_POSES[id]`).
- **`timing`**: the scoring config, shared by the reward formula and the engine's verification — `reps` (or
  `repsByTier`, index = body tier: Lift lifts fewer/heavier reps early, more at high tiers) · `sweepMs` · `perfectPts` /
  `goodPts` · `xpHours` · `minXp` · `minSecs` (the anti-script floor) · `cutMax` / `cutPerPoint`.

| id | family · mode | reward | unlocks at | state |
|---|---|---|---|---|
| `pushups` | timing · beat | body XP | body F (the start) | ✅ 52b: the animated figure + the timing bar |
| `flow` | puzzle | Qi | any (stage 0) | ✅ |
| `run` | timing · stride | body XP | body E | ✅ **52c** |
| `lift` | timing · hold | body XP | body D | ✅ **52c** |
| `memory` | puzzle | Qi | Qi Condensation 1 | ✅ **52d**: the acupoint sequence (engine re-derives + counts rounds held) |

## The animated figure — `ExerciseScene` (52b/52c; re-rigged 2026-10-11)

The baked `INK_ART` cultivator has no rig, so each exercise draws a **purpose-built side-view cultivator** on its own
small canvas inside the overlay (the `BattleScene` / `AscensionCinematic` pattern), above the timing bar. The first
version (two lerped joint sets, capsule limbs) read as a stick figure; on 2026-10-11 it was rebuilt as a rig:

- **A bone rig, posed from data.** `EXERCISE_BODY` (assets/data/minigames.js) holds fixed bone lengths (head, neck,
  torso, upper arm, forearm, palm, thigh, shin, foot) + the far side's `depth` offset, so a limb never stretches.
  `EXERCISE_POSES[id]` is one of two kinds:
  - **`kind:'keys'`** (Push-Ups, Lift): keyframes along the press (`at` 0 → 1, smoothstepped between) — each gives the
    hip, the torso + head angles (degrees from straight up, + = forward) and the limbs as **two-bone IK targets**
    (`{ ik:[x,y], hint:[dx,dy] }` — the hint is the side the elbow/knee bends toward), a planted `toe`, a flat foot, a
    `palm` angle. The far arm/leg copy the near side offset by `depth` unless `far.leg` gives a split stance. Push-Ups
    is a rigid plank pivoting on the toes (`ease:'sine'` dwells at the top + bottom; the arms lock straight at the top);
    Lift is **squat → up through the chest → locked out overhead**.
  - **`kind:'cycle'`** (Running): a gait — `leg` `[phase, thigh°, knee°]`, `foot` `[phase, toe-point°]`, `arm`
    `[phase, upper°, elbow°]` tables; the far leg/arm read phase + 0.5. The hip is **grounded on the lowest foot** each
    frame and lifted by `flight` in the two airborne windows; the ground slides `scroll` units per stride so the planted
    foot doesn't skate. Limb angles are degrees from straight **down**, + = swung forward.
- **The press drives it.** `MinigameUI` calls `scene.setPress(...)` every frame: the marker (Push-Ups), the strain
  (Lift), or — for a `cycle` — the marker's **travel** becomes stride phase (a there-and-back = one stride = two steps).
  The shown pose springs toward the press (a lift drops faster than it rises). A landed rep calls `scene.kick(hit)`:
  dust at the foot / hands / the load's landing, a colour pulse + **rising Qi motes** on a clean rep, a **slump** on a
  miss (the plank's belly sags, the runner pitches forward, the lifter's back rounds). A heavy lift trembles and
  shakes the frame a hair.
- **The silhouette → ink.** Each frame the body is filled as **volumes** (circles swept along each bone with a radius
  profile: a chest that tapers to the waist, shoulders, calves, fists, a head with a jaw + topknot, a tunic hem) into a
  small **mask canvas, one colour channel per depth layer** (R far limbs · G body · B near arm) plus an accent mask
  (the sash band + tails, the hair ribbon + pin). `_ink` then walks a **hex grid of dots** over the mask: each dot takes
  its layer's ink, lit by its distance to that layer's **up-left edge** (a warm rim, 4 levels), **back-lit** in the stage
  colour on the down-right edge, and darkened along the line where the near arm lies over the body. Dots are batched
  into one `Path2D` per colour (a few fills per frame). Draw order: far limbs → the load → body → near arm.
- **Secondary motion.** The sash tails, the hair ribbon and the hem are small **verlet chains** (gravity + the
  pose's `wind` + a gust), anchored to the body each frame — they stream behind the runner and hang in the plank.
  `_settle()` relaxes them for a still (freeze / Reduced motion).
- **The load (Lift).** `prop:'lift'` draws **one boulder that grows with the body tier** (user 2026-10-11, replacing a
  jar → pillar → gate → pagoda → peak → island ladder whose objects read oddly): `_loadSize(tier)` sets its size, `_load`
  inks it as dot-masses (body, a far-side lump, a lit top facet) with a few cracks that **glow in the stage colour from
  tier B** (spirit veins); `LIFT_ITEMS[tier]` names it ("a river stone" → "a boulder the size of a hill"). It is gripped at the hands: at the squat the hands hold its near edge on the ground, then it rides up
  to centre overhead. **The camera pulls back as the load rises** (`g.near` framing for the squat → the whole lift), so
  the squat is big and the overhead reveal shows the full, ridiculous load.
- **Fit:** `_layout` frames each exercise from its pose set's **sampled extent** (+ the load) — centred, the ground near
  the bottom. The canvas is 160px tall (124 in Overlay, 144 on a phone).
- **Reduced motion:** `play({ reducedMotion })` sets `calm` — no rAF loop, no tremble/breath/streaks; the figure only
  redraws when the game moves it.
- **Perf:** under the art-engine's 6 ms budget (asserted in the smoke via `scene.perf(40)`).
- **Contact sheet:** `npx electron scripts/art/exercise-sheet.js` renders every pose (Push-Ups top/mid/bottom, six
  stride phases, the lift's four beats, every load overhead) to `scripts/art/out/exercise-sheet.png` — the fast loop for
  editing the pose data.
- **Absent in the sim:** `exercise-scene.js` is app-only (like `battle-scene.js`); `MinigameUI._startScene` guards
  `typeof ExerciseScene !== 'undefined'`, so the engine checks still load `renderer/game/minigames.js` headless.

## Memorization — the Acupoint Sequence (52d)

A `puzzle`-family game (`id:'memory'`, no `mode`, no `scene` — it is a DOM grid, not a canvas figure). Data lives in
`MEMORY` (`assets/data/minigames.js`): `grid` (9 → 3×3) · `sizes` (a stage row → `rounds` + each round's `lens`, so the
sequence grows 3 → 8 lights over a life) · `paceMs`/`gapMs` (how long each acupoint lights and the beat between) ·
`qiFrac`/`hourFull`/`hourMult` (the reward and its soft DR) · `minSecsPerLight` (the anti-script floor).

- **The play:** a 3×3 board of acupoint tiles lights `lens[r]` acupoints one at a time, then it is the player's turn to
  tap them back. While the order plays the board is dimmed and inert (`.mg-acu.watching`). A correct tap lights the tile;
  a full round advances to the next. A **wrong tap marks the tapped tile red and outlines the acupoint that was due gold**
  (`.mg-acu-t.miss` / `.due-hint`, "The order breaks"), holds ~1.2 s, then resolves — **the rounds already held still pay**.
- **Deterministic + engine-verified:** `MemoryPuzzle.generate(seed, lens)` (in `renderer/game/minigames.js`, DOM-free like
  `FlowPuzzle`) derives the sequences from the session seed; it never lights the same cell twice in a row. The session
  freezes the shape (`{ seed, grid, lens, startedAt }`), and `finishMinigame('memory', { answers })` re-derives the
  sequences and counts the rounds whose answer matches exactly — the UI never writes a reward.
- **Reward:** `memoryQi(frac)` = `round(stageQiCap × MEMORY.qiFrac × cleared/total)`, softer after `hourFull` clears an
  hour, clamped to `min(gain, cap − qi)`. A full clear pays the whole share. A run shorter than
  `sum(lens) × paceMs × minSecsPerLight` is scored as a miss (it was not watched).
- **Keys:** `1–9` map to the nine acupoints (the call line says "tap or 1–9"); `Esc` abandons (a sequence is
  timing-sensitive, so it does **not** wait — unlike Flow's set-aside).

## State & API (game-state.js)

`s.minigames` is built from the registry — `{ [kind]: { cdUntil, best, plays, hour, session } }` (no charges).
`_ensurePhase14Fields()` fills/normalises it and migrates a pre-52 save's `strikes` entry into `pushups`. A timing
session stores `{ seed, relaxed, reps, startedAt }` — the reps are frozen at start (Lift varies them by body tier). A
memory session stores `{ seed, grid, lens, startedAt }` — the shape is frozen at start (it grows by stage).

| Method | Role |
|---|---|
| `minigameInfo()` | `{ canCut, cutMax, cutTarget, list:[…], pushups:{…}, flow:{…}, memory:{…} }` — the per-game UI read model (each body row also carries `mode`, `reps`, `perfectXp`; memory carries `rounds`/`lens`/`grid`/`qi`) |
| `minigameUnlocked(id)` / `minigameLock(id)` | the registry unlock gate + its reason |
| `_timingReps(def)` / `_timingCfg(def, reps?)` | the reps for the current body + the merged timing config (the reward formula and the verification share it) |
| `startMinigame(kind)` | cooldown + unlock check; mints the seeded session (a Flow puzzle set aside resumes) |
| `finishMinigame(kind, result)` | **engine-verified** reward: timing games recompute points from `hits` (with an anti-script time floor); Flow re-runs `FlowPuzzle.check(seed)`; memory re-derives `MemoryPuzzle.generate(seed, lens)` and counts the rounds held. The UI never writes a reward. |
| `exerciseXp(kind, points)` / `_exerciseXp(def, points)` | the body-XP formula (per-game `xpHours`, × the best temper rate × the tempering XP mult) |
| `liftItemInfo()` | `{ tier, name }` — the rung of `LIFT_ITEMS` your body can lift (the chip + the Lift's label) |
| `flowQi()` / `memoryQi(frac)` | the Qi rewards (each a share of the stage cap, soft DR past its own `hourFull`/hour; memory scales by the fraction of rounds held) |

Rewards clamp: body via `_gainBodyXp` (to `_bodyXpCap()`), Qi via `min(gain, qiCap − qi)`. A timing game also
offers **`use: 'xp' | 'cut'`** — spend the score on body XP, or cut the remaining time of a running tempering.

## UI (renderer/game/minigames.js)

`MinigameUI` is the overlay (`#mg-overlay`), **DOM** (not canvas) with the `mg-*` styles. `open(kind)` →
`startMinigame` → dispatch: `_startFlow` (flow) · `_startMemory` (memory) · `_startTiming(kind, session)` (the exercises,
which dispatch on the registry `mode` to `_startBeat` / `_startStride` / `_startHold`) → `finishMinigame`. `FlowPuzzle`
and `MemoryPuzzle` stay DOM-free + seeded so the sim loader can drive them; the timing games are too (the UI reports
`hits`, the engine scores them). A kind's button is any element with `[data-mg-open="<kind>"]` (delegated in `game.js`).

- **beat** (Push-Ups): a marker ping-pongs a bar; press when it crosses the gold seal.
- **stride** (Running): the same bar, two foot buttons; the due side alternates and the marker quickens; a wrong foot or
  an off-beat tap is a stumble.
- **hold** (Lift): hold a button (or Space); the strain meter rises to the top then slips back — release inside the gold.
- **memory** (Memorization): a 3×3 acupoint grid lights a seeded order, then the player taps it back (or `1–9`). The
  board is dimmed/inert while the order plays; a wrong tap marks the tile red and the due acupoint gold, then resolves
  (the rounds held still pay). A `puzzle` with no set-aside — `Esc` abandons.
- **Input:** timing games score on **pointerdown** at the event's `timeStamp` (a touch `click` fires on finger-up, too
  late). Keyboard: Space (Push-Ups / Lift), ←/→ or A/D (Running), Esc quits. Lift holds on keydown, releases on keyup.

## Tests

- `scripts/sim/checks/body.js` — the mini-game block: cooldown, an anti-script run scores 0, a forged result is
  clamped, the `cut` option, Flow solvable/rejected/capped/set-aside, migration; **52c:** the Running/Lift unlock
  ladder, per-tier Lift reps, the too-fast floor, and the reward/cut for both; **52d:** every Memorization sequence
  stays on the grid (no back-to-back cell), the shape is frozen, the too-fast floor scores 0, a full clear / partial
  clear / forged answers are scored from the seed, Qi never crosses the cap, the soft DR, and the stage-1 lock.
- `scripts/smoke/scenarios/body.js` — plays Push-Ups + Running + Lift + Flow + Memorization through the real overlay in
  every layout (Overlay/Expanded/Desktop/phone, each opening asserted); the figures (`MinigameUI.scene` exists, the
  canvas has drawn pixels, `scene.perf(40) < 6` ms, magnified stills of the runner and of the whole `LIFT_ITEMS` ladder),
  the Reduced-motion still pose, and (52d) a full memory clear, a miss (its red/gold cues), and the result card.
- `scripts/smoke/scenarios/icons.js` — the icon contact sheet, plus (52c) a focused 14/18/28/44px sheet of the Practice
  glyphs (`icons-practice.png`) for the asset gate.

## Adding a mini-game (checklist)

1. A `MINIGAMES` entry (id/family/mode/reward/cooldown/unlock/blurb + its `timing` block), plus `scene` if it is an animated timing game.
2. A reward branch in `finishMinigame` (only if a new family) + a reward calculator if body/qi.
3. `MinigameUI` `_start<Kind>` (or a new `mode`) + its `data-mg` actions; a DOM-free deterministic generator if it is a puzzle.
4. An `EXERCISE_POSES` set (`kind:'keys'` keyframes or a `kind:'cycle'` gait) if it draws the figure — plus `prop:'lift'` if it holds a load. Check it on the contact sheet (`scripts/art/exercise-sheet.js`; add its poses to `exercise-sheet.html`).
5. `mg-<kind>` CSS; a launch button; an `attention.js` nudge.
6. A banter trigger (`BANTER_TRIGGERS` + `BANTER_MIN_LINES` + every personality pool).
7. The bot (`scripts/sim/bot.js` `minigames()`) + `report.js` labels; checks + smoke; docs.

## Gotchas

- **Every new game needs a cooldown** (`cooldownSecs`) — the charge system is gone; without it a game is infinite.
- **Verify server-side.** Any puzzle must store its seed/sequence in the session and re-derive the answer in
  `finishMinigame`; a timing game's reps/points/floor live in its `timing` block (read via `_timingCfg`), never trusting the UI.
- **Don't tighten the windows.** Difficulty grows by content (larger weights, longer sequences), never by a
  smaller timing window — the games are meant to be fun, and a miss only pays less.
- **The figure is one connected rig.** `ExerciseScene._figure` must draw every joint segment — a pose that leaves a
  joint unconnected draws a **floating limb** (the 52b cycle-1 blocker was a detached head from omitting the neck
  segments). Adding a joint means adding its limb(s) too — including the far side (`*2` joints must be paired with the
  near ones or the stride breaks).
- **The canvas is app-only.** `exercise-scene.js` is not loaded by the sim loader; guard any `ExerciseScene` use with
  `typeof ExerciseScene !== 'undefined'` so `renderer/game/minigames.js` still loads headless.
- **Keep the frame under the art-engine budget** (< 6 ms). The dot capsule in `_limb` fills a hex grid per limb — pitch
  is clamped so dot count stays small; re-check `scene.perf()` in the smoke if you add joints.
- **The load is anchored at the hands, clamped to the ground** (`cy = min(handY, ground − half)`) so a tall rung rests
  on the dotted ground at press 0 instead of sinking through it.
- **A Practice button bakes its `disabled` at render.** Setting `cdUntil = 0` alone does not re-enable it in the DOM —
  a scenario must re-render (`gameState._notify()`) before clicking, and **assert the overlay opened** (52d found the
  Expanded/phone shots had silently captured the Body view instead of the overlay, hiding the gap).
- **Memorization does not set aside.** Unlike Flow (whose puzzle waits with your turns), a memory session is
  timing-sensitive: `startMinigame('memory')` never resumes a lingering session, and quitting abandons it
  (`finishMinigame('memory', { abandon: true })`). Only Flow's `setAside` branch is special-cased.
