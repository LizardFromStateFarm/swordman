# The Mortal Phase (凡人) — Phase 49

> **Direction change 2026-10-10 (Phase 49a/c built early, inside the Phase 48 session).** Every life begins a
> mortal. **Qi does not flow** until the body is trained enough to **Awaken** — and the opening verbs are just
> **Explore** and **Body** (hunting a first beast comes with body E). This turns the old ~1–4-minute "Mortal"
> formality into a short, active arc, and teaches the two core verbs before the rest of the game unlocks.
> Plan: `~/.commandcode/plans/active-cultivation-rework.md`. Related: `docs/systems/active-cultivation.md`,
> `docs/systems/body-constitution.md`, `docs/systems/unlocks.md` (Phase 50).

## What is built (49a + 49c engine)

- **State:** `s.awakened` (bool) — added by `_ensurePhase49Fields()` (an old save past stage 0 migrates to `true`).
- **The gate:** `mortalMeridiansShut()` → `stageIndex === 0 && !s.awakened`.
  - `tick()` credits **0** Qi while shut; `initSlot()` offline catch-up also credits **0**.
  - `drawQi()` refuses with `reason:'mortal'`.
  - `attemptBreakthrough()` refuses with `reason:'awaken_required'`.
- **`BODY_AWAKEN_TIER = 'D'`** (`assets/data/tempering.js`) — the body tier a mortal must reach.
- **`awaken()`** — opens the meridians: `stageIndex 0 → 1` (Qi Condensation), `s.awakened = true`, and it carries
  the first realm change (a realm first + the 1-of-3 art insight offer, like a breakthrough). Below the gate it
  returns `{ ok:false, reason:'body_too_weak', need, have }` — no roll, no loss (mirrors Phase 47's bloodline gate).
  `canAwaken()` / `awakenInfo()` feed the UI.
- **Body XP is active.** Both mini-games are charge-free (Phase 48), so Strikes is the mortal's body-XP loop; the
  bot plays it at the mortal stage and banks XP toward tier D.

## UI

- The HUD **Cultivate** button becomes **Awaken** while a mortal (disabled until the body reaches D, sub-line
  `Body F / D`), and the Breakthrough button reads "Awaken first".
- A `collectAttention` nudge ("Temper your body") fires while mortal when Strikes is off cooldown.
- At the mortal stage, only the mortal verbs are meant to be reachable — see **Phase 50** (progressive disclosure).

## 49b — The mortal arc (the content of the opening)

> The gate (49a/49c) made a mortal unable to cultivate; 49b gives that mortal something to *do* and a story to
> live: **mortal-only beats** (a village life lived before the Dao), and an Explore that actually feeds the
> body work. It interlocks with 50 (the start's unlock set is the mortal set). Data: `assets/data/mortal.js`.

### Depth pass

1. **Memory.** `s.mortal` remembers the beats this life has answered (`done`), the choices it made (`deeds`),
   how many times the breath stirred (`spark`), and a **childhood rival** you made — a real person minted into
   the world registry, so you can meet them again as a grown classmate. The beats a life *gets* are drawn from
   the pool (weighted, no repeats), so each generation's childhood plays out differently.
2. **Choices.** 11 beats, 2–3 choices each. Choices read your **personality** (a `bond`-style delta like the
   upbringing event), your **spirit root** (`when.rootMult` gates a strong-root beat), your **body tier**, your
   **karma** and **Stones**, whether you were **born into a clan or an orphan**, and your **past beat choices**
   (`after`/`notAfter`), so the same event plays differently per character.
3. **Hooks (≥3).** Body XP + the body-tier ladder + the **Awakening** gate (every beat pays in *hours of your
   best tempering rate*, so the reward auto-scales with your realm); the **inventory** (drill materials —
   Beast Cores, herbs — from Explore forage + beat rewards); the **world registry** (the rival child, a minted
   person you meet again); **karma**; **attention**; **banter**.
4. **Drama.** The beast at the treeline can maul you (never lethal — Health floors at 1); the rival humiliates
   you; a pricey tonic or a dive can cost Stones/Health; the best outcome is a large body-XP chunk that pulls
   the Awakening forward. Helping the smith can pay off later; defying the rival can bring him back.
5. **Feedback.** The beats you answer open (or close) later beats: an unburned `spark` lets the "spark returns"
   capstone fire; a beaten rival returns grown; the elder's advice changes the first-breath text.
6. **Agency.** Every beat is an explicit player choice, **never simulated**. The beats fire on the game clock,
   but a pending beat *waits* for your answer (like the road cards / a father's hand) — nothing resolves itself.

### UX pass

1. **Surface.** The pending beat renders as a **card at the top of Roam → Explore** (above the expedition
   timer — a pending decision outranks the countdown), naming every choice's effect (`+1.5 h body · −12 Health`).
   Path → Body already shows the **Awaken** gate and the "You can lift …" chip; the HUD button reads **Awaken**.
2. **Interact.** Tap a choice on the card; the HUD **Awaken** button when ready; the attention item routes to
   Explore. Both fit the roomy layouts first (Expanded/Desktop) and degrade to Overlay (300px) / a phone.
3. **Discover.** An **attention item** ("A village matter" / "Something moves at the treeline") the moment a
   beat is pending, plus a first-beat toast; the Awakening runs a short **Awakening card** (below).
4. **Feel.** Xianxia-mortal voice ("the shock of cold water", "your hands are soft as a scholar's"); CSS tokens;
   a Qi-spark mote moment on the spark beats; readable at 300px; honors ⚙ text size + reduced motion.
5. **UX debt:** logged in START_HERE.md.

### The Awakening moment (49c follow-up)

`awaken()` already carries the first realm change + the art offer. 49b adds the **bespoke card**: a short
`#awaken-overlay` (title, 2–3 lines, Continue) that plays once the meridians open — a moment, not a cutscene.

### Explore forage (49b)

While `mortalMeridiansShut()`, an Explore return on top of its normal drops grants the drills' material: the
**`MORTAL_ARC.exploreDrop`** (a Beast Core) and one extra drop-table pick. `_rollDrops` stays untouched for
every other state — the bonus is applied in `resolveExpedition` only while mortal, so a Qi Condensation life
farming `mortal_forest` sees no change.

### Tuning (as built)

`MORTAL_ARC.exploreDrop` / `beatGapYears` / `maxBeats` and the beat `bodyHours` values set the arc's length.
Target **time-to-awaken (active) ≈ 7–30 open minutes** (`MORTAL_AWAKEN_H` in `scripts/sim/profiles.js`),
verified in `npm run sim` (report "Mortal arc" line). As built the arc is **Health-gated**, not XP-gated: the
mini-games bank body XP fast, but the two tier trials (F→E→D) each cost Health (the bitter way = 40% of max
Health) and regen is slow at low tiers, so the clock is the body recovering. Measured: **active ~10 min**,
**afk ~24.8 h wall (~45–90 open minutes** — its closed 8 h windows; the designed 5–9× slower ratio). An idle
player must play the body exercises in their open window to pass the gate (body training is active by design);
absence still progresses, just slowly (pillar 4).

### API (game-state.js)

- **`mortalInfo() → { isMortal, beat, done, spark, canAwaken, needTier, haveTier, needXp, haveXp }`** — the
  pending beat (title/text/choices with `ok`+`sub`+lock reason) and the arc state. Null-safe.
- **`resolveMortalBeat(choiceId) → { ok, bodyXp?, … }`** — apply a choice's effect (body XP from `bodyHours`,
  items, Stones, karma, Health, `spark`, a minted rival), record the deed, clear the card, log + notify.
- **`_tickMortal(yr)`** — called from `_tickFamily` (game-year change): while mortal, roll the next beat when
  the gap has passed and no beat is pending, until `maxBeats`.
- **`_mortalRival(p)`** — mint the rival child into the world (via `_mintPerson`, `role:'youth'`), remember
  their id, and write a memory line; `_beginLife` re-aims a feud if they later turn on you.

### Rules & invariants

1. A beat fires **only while `mortalMeridiansShut()`** — never after Awakening.
2. **One pending beat at a time**; answering it is the only way it clears (never auto-resolved).
3. A beat's body XP uses **hours of `_bestTemperRate()` × `temperXpMult()`**, so it never over- or under-pays
   as realms rise (same convention as the mini-games).
4. A beat effect **never kills** (`_applyFamilyEffect`-style Health floor at 1; a beat clamps Health ≥ 1).
5. `s.mortal` is a **per-life** field, reset in `_newGame`/`_beginLife` and backfilled by
   **`_ensurePhase49bFields()`** (an old save past stage 0 is not mortal, so no beat ever fires for it).

## 49d — QA (as built, 2026-10-14)

- **`scripts/sim/checks/mortal.js` (111 ok)** — the gate (no Qi on the tick — the offline credit uses the same
  `mortalMeridiansShut()` check; `drawQi` refused; no breakthrough), the Awakening (body D, once, no roll/loss
  below the gate), the arc (mortal-only, one at a time, no repeats, capped at `maxBeats`, the opening beat
  leads, the gap), every `when` gate, every choice effect (the body-XP scale, items/stones/karma/hint/spark,
  the Health floor at 1, the locked reason), the minted rival, the Explore forage (mortal-only — a Qi
  Condensation life on the same location gets ≤1 drop, as before), the migration + the per-life reset, and
  the data completeness of all 11 beats × their choices.
- **`scripts/smoke/scenarios/mortal.js`** — a fresh game: the HUD reads Awaken; the beat card leads Roam →
  Explore; the answers work through the real buttons; a locked choice is disabled with its reason; the card
  renders in Overlay / Expanded / Desktop / phone (no overflow); the Awakening (body D → the ready button →
  the `#awaken-overlay` card → Qi Condensation). **Zero console errors.**
- **`scripts/sim/bot.js`** — the bot answers its pending beat (`mortal()`); while mortal it takes the bitter
  trial at a 60% bar (a flat 0.9 and never lethal) and every profile plays the body exercises while the game
  is open (the gate is active by design).
- **`scripts/sim/profiles.js`** — `MORTAL_AWAKEN_H.active = [0.12, 0.5]`; the report gains a **"Mortal arc"**
  section (time to awaken · beats answered · temperings started) + the "Awakened (mortal)" milestone row.
- **Visual Review Gate:** the reviewer sub-agent is blocked in this environment (as recorded for 43f / 46 /
  45), so the author-reviewed screenshots (`scripts/smoke/out/mortal-{overlay-beat,overlay-locked,expanded,
  desktop,phone,awaken-ready,awaken}.png`) are **handed to the user for sign-off** (ui-review.md).

## Gotchas

- The mortal gate zeroes Qi in **both** the tick and offline catch-up — miss either and Qi silently accrues
  (this happened in the first sim pass: Qi sat at cap while the bot could not cultivate).
- `_ensurePhase49Fields` runs inside `_recalc`, so a save that is already past stage 0 never re-locks.
- Body tier **D** is 1000 cumulative XP; at the start's drill rates that is a real arc. If the sim says it drags,
  the fix is more active body XP (49b) or a lower gate — not slower timers.
- **49b:** `_tickMortal` runs from `_tickFamily` (the game-year change), so beats advance with the game clock
  (open only), never offline — consistent with every other story beat.
- **49b:** a beat's body XP is paid through `_gainBodyXp`, so it is **clamped by `_bodyXpCap()`** (next tier +
  half a step). Early beats can therefore fill the bar and cap — that is intended (the bar is the gate).
- **49b:** `_mortalRival` mints with `Math.random` (like the family events) and only once per life
  (`m.rivalId`); the minted person is a `role:'youth'` in the world registry (Meet again as a classmate).
- **49b:** `_ensurePhase49bFields` clears a pending beat for any save past stage 0 — so a *stale* beat can never
  render for an awakened life.
- **49b (bot):** the mortal bitter-trial bar and the "all profiles play the exercises while open" change are
  **bot** policy, not game rules — a real player may take the bitter way at any Health above its cost.

## QA 2026-11-26 — the mortal loop reads clearly (user feedback)

- **No Qi game before Awakening.** Meridian Flow (and Memorization) are **Qi** games and now unlock at
  `stage: 1`; they cannot pay Qi while `mortalMeridiansShut()` (a stale session is refused too). The HUD's Flow
  segment is hidden while mortal. The opening is explicitly **Body training + Explore → Awaken**.
- **Awakening is body-driven:** temper/practice the body to **Hardened (D)**; Qi is not the goal and does not flow
  yet. The Body view + HUD Awaken button show the F/D progress; the Awaken card explains it.
- **Tutorial:** `v_physique` now opens with "You begin a mortal. Qi will not flow until you Awaken…", a Practice
  step (Push-Ups are the fastest early body XP) and an Awaken step; `v_explore` notes the mortal forage. The intro
  is still one card and the HUD tour stays in the Guide.
