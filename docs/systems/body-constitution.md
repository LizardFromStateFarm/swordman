# Body Constitution & Tempering (Phase 14, task 3.3) — Spec
_Covers: assets/data/tempering.js (new) · game-state.js (`s.body`, `s.minigames`, max Health / regen) · renderer/game/body-view.js (new) · renderer/game/minigames.js (new) · breakdowns.js · attention.js · nav.js · Phase: 14 · Updated: 2026-10-03 · **Status: BUILT 2026-10-03** (see "As built" at the end)_

**What it is.** The body is a second path that runs beside Qi. Every life starts in a **Frail Body (F)** and trains it up to a
**Heaven-Forged Body (S)** through tempering on real-time timers (idle-friendly, like expeditions). A stronger body
raises **max Health** and **Health regen**, softens failed breakthroughs, and carries you further in fights. Two optional
**mini-games** speed things up: **Tempering Strikes** (a timing game, for body XP) and **Meridian Flow** (a path puzzle,
for a chunk of Qi).

User decisions (2026-10-03): everyone starts at F and must train (no roll, no inheritance, Phase 12 regions not
needed); real-time tempering; the tier raises max Health and regen; mini-games for body and Qi.

**Changed from PLAN.md Phase 14:**
- **"Qi Cap Mult" is dropped.** In this game `qiCap` is the breakthrough threshold, so a bigger cap would *slow* you.
  The body raises max Health and regen instead.
- **"Expedition HP"** becomes the real `maxHealth` used everywhere.
- **The alignment interaction (14C) waits for Phase 13.** Karma stands in: Blood Forging costs karma.
- **Tier 4 (Tribulation) waits for 7C.** The data row is kept but locked.
- The items the old spec invented (Ice Crystals, Fire Cores, Thunder Stones) are swapped for existing items.

---

## Depth pass

1. **Memory.**
   - `s.body` keeps the tier, XP, ordeals done this life, **scars** (lasting marks from a failed ordeal), the Blood
     Forging count, and the best Tempering Strikes score.
   - The body remembers abuse. Each Blood Forging adds **taint**, which makes later ordeals riskier until it is cleansed
     (a Mending pill or one quiet tempering).
   - A tier gained through an ordeal is logged with its cause ("Steel Body, forged under the Icy Waterfall, year 34").
2. **Choices.** All of these are the player's.
   - **What to temper.** Safe drills, Spirit Tempering (Qi −50% while it runs), or a dangerous ordeal.
   - **The ordeal's crisis.** Every Tier 3 ordeal stops at its peak with a choice card:
     - **Endure:** full XP plus the ordeal's bonus, with an injury roll. The odds read Health, tier, taint, and
       personality (stoic and hotblood fare better, coward and lazy worse).
     - **Ease off:** half the XP, no risk.
     - **Draw on Qi:** spend 10% of the current stage's Qi to make it safe and keep the full XP.

     The card **waits** for you; it is never decided by a timer.
   - **The tier trial.** When the XP bar fills, the tier does not rise by itself. You choose how to break through:
     - **Temper the marrow:** costs stones and items, with a success chance (failure keeps 70% of the XP and costs
       −15 Health).
     - **The bitter way:** costs Health instead of items, at higher odds; it can leave a scar.
     - **Wait:** keep training. Extra XP banks toward the trial, up to a cap.
   - **Blood Forging (demonic).** Unlocked once your karma is low, or after one bad choice. It gives ×2 XP and costs
     karma, Health and taint.
3. **Hooks** (≥ 3; these are the ones built).
   - **Health / death (23A):** max Health and the regen rate come from the tier. An ordeal can never kill you (Health
     floors at 1), but you start the next fight wounded. Healing pills heal a share of the bigger max.
   - **Breakthroughs:** a failed breakthrough keeps more Qi as the tier rises. Thunder Peak Endurance gives +2%
     breakthrough chance per completion, to a cap.
   - **Combat (Phase 35/42):** the battle page's HP pool *is* max Health, so a Diamond Body survives twice the beating.
     Beast and Arena fights already read Health, so they scale with it.
   - **Beasts / Roam:** Beast Cores and Iron Ore pay for tempering, which gives a reason to keep hunting. **Spar with your
     beast** is a method that turns a tamed beast's power into XP.
   - **Sect (5A / 43d):** a founder's Training Ground adds tempering XP per level. A joined sect's blessing carries it at
     the sect's factor.
   - **Family / heirs:** a child's raising row gets **Temper their body**. It never sets their starting tier (everyone
     starts at F), but it grants a one-time **XP head start** to an heir you later play, so it pays forward.
   - **Banter (29):** `body_tier_up`, `ordeal_endure`, `ordeal_scar`, `minigame_perfect` lines.
   - **Rankings (28J, later):** the body tier is part of the shared `powerScore`.
4. **Drama.**
   - **Best:** you endure the Thunder Peak at 3 Health and rise into a Diamond Body. Late in a life you reach the
     **Heaven-Forged Body**: 400 Health, a regen you can watch tick, and a +6% breakthrough edge.
   - **Worst:** you Endure once too often, tainted by Blood Forging, and come out with **Shattered Meridians**. That is a
     scar: −10% max Health and −15% regen for the rest of the life. Only a Golden Marrow pill or the bitter way can
     mend it.
5. **Feedback.** The way you treat your body changes later events:
   - Taint and scars raise every later ordeal's risk.
   - Each clean ordeal you endure gives +3% to the next one's odds ("the body remembers it can endure").
   - Blood Forging unlocks a darker banter set and makes righteous sects in the world ledger cooler (−2 stance per
     forging, a deed).
6. **Agency.**
   - Starting a tempering, every ordeal crisis, every tier trial and Blood Forging are explicit choices.
   - Nothing about your body is rolled for you without a card or a shown odds number.
   - The one delegated chore is **Auto-Temper**, an automation unlock (22D): it repeats your last *safe* method.
     It never starts an ordeal and never answers a crisis or trial, and you can switch it off at any time.

## UX pass

1. **Surface.**
   - A new **Path → Body** sub-tab (Path becomes Character · Techniques · Arts · Body).
   - The hero card shows the tier badge (seal, letter, name; for example "C · Steel Body"), the XP bar to the next tier,
     and effect chips: **Max Health 190 · Regen 1 per 23s · Failed-BT Qi kept +15%**.
   - Every number is a `[data-bd]` breakdown, for example "Max Health 190 = base 100 + Steel Body +90 − scar 0".
   - The Health tile on Character and the HUD read `hp / max` (today they assume 100).
   - Scars and taint are listed with how to mend them.
   - Ordeal odds are shown before you start: "Endure: 72% clean = base 60 + Health 8 + tier 6 + stoic 4 − taint 6".
2. **Interact.**
   - Built for Expanded/Desktop first: two columns (hero + active tempering on the left, method cards on the right).
   - One click starts a method. The running card shows a countdown and a quiet Cancel (no refund of items, said up front).
   - Mini-games open as a centred overlay. Tap / click / Space to play.
   - **Overlay (300px):** one column, method cards compact (name · time · cost · XP on two lines).
   - **Phone:** the overlay is full-screen with large hit areas (the strike button is ≥ 64px).
3. **Discover.**
   - **First time:** a one-time hint on the Path tab ("Your body can be tempered too") the first time you open Path after
     this ships.
   - **Attention items:**
     - "Your body rests" (a nudge, when no tempering is running and one is affordable).
     - "The ordeal's crisis" (a decision).
     - "Ready for the tier trial" (a decision).
     - "Mini-games ready" (a nudge, only when all charges are full, so it never nags).
   - The Path tab gets a badge.
4. **Feel.**
   - Ink and gold. The tier seal glows `--ember` when a trial is ready.
   - Strikes flash `--gold` on a perfect hit; Meridian Flow lights the connected channels in `--jade` as Qi flows through.
   - Reduced motion: no sweep animation; the strike game becomes a pulsing ring with the same timing window.
   - Colour-blind mode: perfect / good / miss also differ by shape and label, not only colour.
   - Text size is honoured.
5. **UX debt to fix in the same change (small).**
   - Health assumes a max of 100 in about 50 places (game-state, HUD, battle page, the Trial's "Health at 100" line).
     All of them move to `maxHealth`, and "Health at 100" becomes "Health full".

---

## Rules (data: `assets/data/tempering.js`)

### Tiers

| Tier | Name | XP to reach (cumulative) | Max Health | Regen (+1 Health every) | Failed-BT Qi kept |
|---|---|---|---|---|---|
| F | Frail Body | 0 | 100 | 45 s | +0% |
| E | Mortal Body | 200 | 120 | 40 s | +5% |
| D | Hardened Body | 1,000 | 150 | 34 s | +10% |
| C | Steel Body | 5,000 | 190 | 28 s | +15% |
| B | Diamond Body | 20,000 | 240 | 22 s | +20% |
| A | Immortal Body | 80,000 | 300 | 17 s | +25% |
| S | Heaven-Forged Body | 250,000 | 400 | 12 s | +30% |

- The tier resets to F each life (a new body). XP thresholds are tuned in the QA pass so a casual 10–20h life reaches
  about B and an active life with mini-games reaches A–S.
- Every existing damage source stays absolute (an expedition still does −9), so a bigger max Health is a real cushion.
  Absolute floors like `BEAST_FIGHT_MIN_HEALTH` stay absolute.

### Methods (one at a time, real-time)

| Group | Method | Unlock | Time | Cost | XP | Note |
|---|---|---|---|---|---|---|
| Drills | Morning Exercise | — | 5 min | free | 5 | — |
| Drills | Iron Fist Training | — | 30 min | 1 Beast Core | 40 | — |
| Drills | Boulder Carrying | QC L1 | 2 h | 3 Beast Cores | 200 | — |
| Drills | Spar with your beast | a tamed beast | 1 h | — | 30 + beast power | the beast is busy (can't hunt) |
| Spirit | Spirit Forge | QC L3 | 4 h | 5 Beast Cores + 2 Iron Ore | 600 | Qi/s −50% while it runs |
| Spirit | Ten-Thousand Strikes | QC L6 | 8 h | 10 Iron Ore | 1,500 | Qi/s −50% while it runs |
| Ordeal | Icy Waterfall Meditation | FB early | 12 h | 6 Celestial Herbs | 4,000 | Endure: Water-root Qi/s ×1.4 for 2 h (real time) |
| Ordeal | Volcanic Immersion | FB mid | 12 h | 6 Demon Essence | 4,000 | Endure: Fire-root Qi/s ×1.4 for 2 h (real time) |
| Ordeal | Thunder Peak Endurance | NS early | 24 h | 8 Heavenly Ore | 15,000 | Endure: +2% BT chance, permanent this life (cap +6%) |
| Ordeal | Void Pressure Chamber | SS early | 48 h | 4 Void Crystals + 2 Chaos Essence | 60,000 | Endure: clan first (Merit); once per life |
| Demonic | Blood Forging | karma ≤ 30 | 6 h | 15 Health + 5 karma | 2× the best method you have unlocked | + taint |
| Tribulation | Absorb Tribulation Lightning | after 7C | — | — | — | locked until Tribulation exists |

- **XP multipliers:** Training Ground (+10% per level), joined sect blessing, Active Mode (+15%, like other Active
  bonuses), a "Temper their body" head start.
- **Ordeal crisis:** at 100% of its timer the ordeal holds; nothing is lost while it waits.
  - Endure clean odds = base 60 + Health% × 0.15 + tier × 3 + temper modifier + 3 × clean endures − taint × 6, clamped 15–95.
  - A bad roll costs −20..−40 Health (floor 1) and a 25% chance of a scar.
- **Tier trial:**
  - Temper the marrow: stones 50 × 4^tierIndex + items, success 75% + Health% × 0.2.
  - The bitter way: −40% of max Health, success 90%, scar 20%.

### Mini-games (`s.minigames`)

Both run on **charges**: 3 max, +1 every 30 real minutes, and they keep refilling while the game is closed, so absence
is never punished. Each play spends one charge. Neither is ever required.

**Tempering Strikes (body).**
- A marker sweeps a brush-stroke bar; tap / click / Space when it crosses the gold seal. **6 strikes** (user 2026-10-03: 8 → 6,
  a bit shorter); the seal narrows each hit. The cut is rescaled (`cutPerPoint` 0.24 / 18) so a perfect run still cuts 24%.
- Perfect = 3, good = 1, miss = 0 points. The reward is points × (tier XP step ÷ 120) XP, so it stays meaningful at
  every tier, about 15–25% of a running drill's value.
- If a tempering is running, you can instead apply the strikes to it: each point cuts 1⅓% off its remaining time
  (max 24%).
- A perfect run gives a small banter line and a gold flash.

**Meridian Flow (Qi).**
- A pipe-style puzzle: rotate meridian tiles so Qi flows from the dantian to the open acupoints.
  - Grid 4×4 (Mortal/QC), 5×5 (FB–CF), 6×6 (NS+), on a seeded generator that guarantees a solution.
  - Every tile is ≥ 48px on a phone.
- **No clock** (user 2026-10-03: "dont time limit the qi minigame, if you finish you get the qi"): the reward is a flat **6%**
  of the current stage's Qi cap (the old 4% + the old swift bonus), × (0.7 if you have already solved 3 this hour). No timer,
  no par time. Closing the puzzle (✕ / Esc) **sets it aside** with your turns (`finishMinigame('flow', { setAside, turns })`);
  reopening resumes it for no new charge (`startMinigame` returns `resumed`). The buttons read "resume" meanwhile. Capped below the breakthrough threshold, so it can't skip a breakthrough check.
- Also offered on **Path → Character** next to the Qi readout, and **on the main HUD** (user 2026-10-03): a slim segment on
  the Meditate button (`#med-split` > `#btn-flow`, the same split card as Breakthrough + ?) — the vein icon + charges, a play glyph,
  gold-bordered, while a puzzle waits.

**Accessibility.** A ⚙ setting, "Relaxed timing" (seal ×1.6 wide), and keyboard play for both games.

---

## State (`_ensurePhase14Fields`)

```js
s.body = { tier: 0 /* F */, xp: 0, banked: 0, active: null /* { methodId, startedAt, endsAt, crisis: false } */,
           scars: [], taint: 0, cleanEndures: 0, ordealsDone: {}, btBonus: 0, bloodForgings: 0, history: [] }
s.minigames = { strikes: { charges: 3, nextAt: null, best: 0 }, flow: { charges: 3, nextAt: null, hourCount: 0, hourStart: 0 } }
derived.maxHealth, derived.healthRegenSeconds, derived.btQiKeepBody
```

- Migration: an old save gets F / 0 XP and full charges, and `health` is clamped to the new max.
- Reset on rebirth in `_die()`, except `minigames` charges, which belong to the player.
- The heir XP head start lives on the child record (`bodyHeadStart`).

## API

`bodyInfo()` · `temperingList()` · `startTempering(id)` · `cancelTempering()` · `answerOrdeal('endure'|'ease'|'qi')` ·
`tierTrialInfo()` · `attemptTierTrial('marrow'|'bitter')` · `minigameInfo()` · `startMinigame(kind)` → a seed ·
`finishMinigame(kind, result)` (the engine validates and clamps the score; the UI never writes rewards directly) ·
`maxHealth()`.

## Files

- **New:** `assets/data/tempering.js`, `renderer/game/body-view.js` (BodyView), `renderer/game/minigames.js`
  (StrikesGame + FlowGame + their DOM-free generators / scorers), `scripts/sim/checks/body.js`,
  `scripts/smoke/scenarios/body.js`.
- **Touched:** game-state.js, nav.js, game.js, index.html, styles.css, breakdowns.js, attention.js, combat.js (HP max),
  family-view.js (Temper their body), personalities/banter-lines (triggers), settings.js (Relaxed timing),
  automation.js (Auto-Temper), sim bot (tempers; plays mini-games at a profile skill), CLAUDE.md tree, docs.

## Checks (`scripts/sim/checks/body.js`, 62)

- Tier thresholds and effects.
- Max Health clamps everywhere (no `> maxHealth`).
- Migration.
- An ordeal holds at its crisis offline.
- The crisis and trial outcomes match the shown odds (Monte Carlo).
- Charges refill offline and cap at 3.
- Mini-game rewards are clamped (a forged score can't exceed the max).
- Flow puzzles are always solvable.
- Qi from Flow never crosses the breakthrough threshold.
- Auto-Temper never starts an ordeal.

## Decisions (user, 2026-10-03)

1. **The body resets to F every life** (a new body; the child head start is the only carry).
2. **Blood Forging stays** (karma cost, taint, righteous sects cool).
3. **Strikes: the player picks each time** — flat XP, or (while a tempering runs) cut its remaining time.
4. Spec approved as written → build.

---

## As built (2026-10-03)

**Where it differs from the spec above:**
- **The view id is `physique`** (`#tab-physique`, `[data-tab="physique"]`); the label is "Body". `#tab-body` is already the
  panels' container in index.html, so a `tab-body` panel would collide (it did, on the first smoke run).
- **The child hook changed.** A rebirth is a *newborn* descendant, not one of the children you raised, so "an XP head start for
  a played heir" could not work. Instead **Temper their body** (Kin → Family, a 5th raising action: 1 Beast Core, from age 8,
  bond by the child's temper) raises the child's own `bodyTier` every `CHILD_BODY.perTier` (3) sessions, up to A
  (`CHILD_BODY.maxTier` = 5). The tier adds `BODY_TIERS[t].power` to the child's fight power
  (`_personPowerParts`) — tournaments, head challenges, duels. `Persons.make` gained `bodyTier: 0` and `powerScore` counts it
  (ready for Phase 28's rankings).
- **XP multipliers:** a founder's Training Ground (+10%/level) and Active Mode (+15%) only. A joined sect's blessing is not used
  (no sect def carries a training effect yet).
- Tribulation tempering is a locked row ("Waits for the Heavenly Tribulation").
- **Banter:** four new triggers in `BANTER_TRIGGERS` (`body_tier_up`, `ordeal_endure`, `ordeal_scar`, `minigame_perfect`), 4 lines
  per personality + 2 generic each (230 lines). `ordeal_crisis` is also emitted (no lines; free for later).
- **Clan firsts:** `void_body` (30 Merit, endure the Void Pressure Chamber) and `body_s` (25 Merit, a Heaven-Forged Body).
- **Settings:** `relaxedTiming` (Motion group) widens the Strikes seal ×1.6.
- **Automation:** `AUTOMATION_UNLOCKS.autoTemper` (Foundation Building), `automation.autoTemper` + `autoTemperId` (a drill or
  spirit method; an ordeal id is refused). Idle Mode only, like every automation; chains from where the last run ended
  (offline catch-up, guard 60). Toggle on Path → Body and in the Mode panel.

### Wiring
- `_newGame`: `body` + `minigames`. `_ensurePhase14Fields` (from `_recalc`, after 23) fills both and clamps Health to the max.
- `_die`: the body resets with the new life; `minigames` is carried (sessions cleared).
- `_recalc`: a running spirit tempering's `qiMult`, an endured ordeal's `rootBoost` (only if your root has that element),
  Thunder Peak's `btBonus`; `derived.maxHealth`, `healthRegenSeconds`, `btKeepBody`, `bodyTier`.
- `tick`: `_tickBody()` (charges, payouts, the crisis hold, Auto-Temper) and regen at `healthRegenSeconds()` up to `maxHealth()`.
  `initSlot`'s offline catch-up uses the same rate + calls `_tickBody()`.
- Every former "max Health 100" (≈ 12 sites: event effects, battle hp sync, pills, the Trial's "Health full", vitalsInfo,
  the HUD bar, the Character tile, the battle plate) reads `maxHealth()`. Absolute floors (`BEAST_FIGHT_MIN_HEALTH`, …) stay.
- `attemptBreakthrough` / `btFailPreview`: + `BODY_TIERS[tier].btKeep` to the Qi kept.
- `_selfFightPower` / `_personPowerParts`: + the body's power.
- UI: `renderer/game/body-view.js` (BodyView, `tickInPlace` returns true when a timer hits 0 so game.js re-renders),
  `renderer/game/minigames.js` (FlowPuzzle DOM-free + MinigameUI overlay; any `[data-mg-open]` button opens one — a global
  listener in game.js), breakdown kinds `body` + `ordeal` (and `health` reads the max), attention items `ordeal` (urgent),
  `body-trial` (ready), `temper` + `minigames` (idle; the latter only when every charge is full and after 5 open minutes).

### Gotchas
- **XP past the bank cap is lost.** An ordeal taken at a low tier can waste most of its XP (the hero card says so). Tuning
  may want a softer rule (QA pass).
- `finishMinigame('flow')` re-generates the seeded puzzle and checks the player's rotations (`FlowPuzzle.check`) — the UI never
  writes a reward. `FlowPuzzle` lives in minigames.js, which the sim loader now loads (it is DOM-free at load).
- A Strikes run faster than `strikes × sweepMs × 0.25` scores 0 (anti-script); a result array longer than 8 is clamped.
- Starting a mini-game spends its charge; giving up (✕ / Esc) keeps it spent (said on the ✕ title).
- The sim bot tempers, answers the crisis + tier trials, uses Auto-Temper (idle profiles) and plays both mini-games (active + casual) since the final QA pass (bot.js `body()` / `minigames()`).
- Smoke: `scripts/smoke/scenarios/body.js` (4 modes, both games played through the real overlay).
