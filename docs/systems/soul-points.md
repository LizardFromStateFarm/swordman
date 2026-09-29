# Soul Points, the Immortal Ascension & the Finish Screen — Reference
_Covers: assets/data/soul.js · game-state.js (soul API, _recalc term, attemptAscension hooks) · main.js +
preload.js + platform-storage.js (cross-save soul file) · renderer/game/soul-view.js · renderer/engine/ink-renderer.js
(bare figure mode) · renderer/engine/ascension-cinematic.js · renderer/game/immortal-view.js · game.js (death card line, cinematic hand-off) · Phase: 40 · Updated: 2026-09-28 · Status: **built** (40a Soul Points core, 40b cinematic + finish screen)_

> **Player-facing copy (user 2026-09-28, 40b):** the finish screen never mentions a version. It says "Congratulations …
> You Have Become Immortal · You have finished your race to immortality." There is no "Immortal Realms open in v2" note.
> "v1" survives only in internal names (`v1Finished`, `SOUL_V1_GRANT`, soul kind `'v1'`) and in PLAN.md release planning.

Specced 2026-09-28 at the user's request: "a simple meta progression like soul points when you fail to become immortal
and a screen that says congratulations on hitting immortal, you have finished v1 of the game, which should give more
cross-save soul points which give buffs to qi gathering. Should also have a sick animation for hitting immortality."
User decisions (2026-09-28): points come **only** from failed Ascensions + Immortality (not ordinary deaths); they buy
**Qi gathering only** (one track); after the v1 screen **play continues** (the Ascended Ancestor flow, unchanged).

**Pillar exception (recorded):** pillar 3 says meta progression is "mostly unlocks, only modest flat multipliers".
Soul Resonance is a multiplier on purpose. It stays modest (capped) and sits beside Ancestral Merit, which remains
the unlock-style, per-clan meta. Soul Points are per **install** (every save slot shares them); Merit is per **clan**.

## State — the soul record (one per install, NOT in any slot save)
```
soul: {
  v: 1,
  points:          number  — unspent Soul Points
  earned:          number  — lifetime total (never decreases)
  resonance:       number  — Soul Resonance rank, 0..SOUL_RESONANCE_MAX
  failedAscensions:number  — every slot, every life
  immortals:       number  — successful Ascensions, every slot
  v1Finished:      null | { at: ms, name, clan, generation, slot }   — first Immortality ever (the v1 screen)
  log:             [{ at, kind: 'fail'|'immortal'|'spend', pts, who, chance? }]   — newest first, cap 30
  seen:            bool    — the Soul screen was opened (clears the discovery dot)
}
```
Stored in `userData/soul.json` (Electron) / localStorage `ci_soul` (Capacitor/browser). game-state holds a copy in
`this._soul` (not `_s`), loads it on boot and after a slot loads, and writes it on every change. `_newGame()` is
untouched; a missing/corrupt file → a blank record (never throws).

## API (game-state.js — all soul mutations live here, Rule 1)
- `getSoul()` → the record (read-only copy for the UI)
- `soulQiMult()` → `1 + SOUL_RESONANCE_QPS × resonance`, feeds `_recalc()` as a breakdown part "Soul Resonance"
- `soulRankCost(rank)` → `round(SOUL_RANK_BASE × SOUL_RANK_GROWTH^rank)`
- `spendSoul()` → `{ ok, rank, cost } | { ok:false, reason:'max'|'points' }`: one rank per click (player choice)
- `_grantSoul(kind, pts, meta)` — private; called from `attemptAscension()` only
- `markSoulSeen()`

## Earning (assets/data/soul.js, data only)
| Source | Points | Notes |
|---|---|---|
| Failed Ascension | `SOUL_FAIL_BASE + round(SOUL_FAIL_PER_PCT × chance×100)` → 20 + 0.5/pct ≈ **20–67** | chance = the odds shown on the trial card; a well-prepared failure pays more (rewards prep, not luck) |
| First Immortality ever (v1 finish) | **SOUL_V1_GRANT = 500** | once per install; triggers the v1 screen |
| Each later Immortality (any slot) | **SOUL_IMMORTAL_GRANT = 150** | short card instead of the v1 screen |

## Spending: Soul Resonance (one track)
+`SOUL_RESONANCE_QPS` = **5% Qi/s per rank**, additive, max `SOUL_RESONANCE_MAX` = **20** (+100%). Cost `25 × 1.35^rank`
(25, 34, 46, 62, 83 …; ranks 0→20 ≈ 5,100 total). Expected feel (tuned in 2.8/QA): the 2–5 failures before a first
Immortality buy ~3–4 ranks (+15–20%), the v1 grant buys ~5 more. Applies to live **and** offline Qi (offline uses
`derived.qiPerSecond`). No respec (one track, nothing to regret).

## Depth pass
1. **Memory:** the soul record remembers every failed Ascension and Immortal across every slot; the log names who
   (`"Lin Wei of the Lin clan failed at 71% → +56"`).
2. **Choices:** attempting the Trial (already a choice, with its odds shown) now has a consolation that grows with
   preparation; spending is an explicit per-rank click. Nothing is auto-spent (agency rule).
3. **Hooks:** Ascension Trial (23C: earn on failure, scaled by `ascensionChance()`), `_die`/death card (the
   `"Your soul remembers: +N Soul Points"` line), `_recalc` + breakdowns (Qi/s popover names "Soul Resonance +x%"),
   banter (a `soul_remembers` trigger line per personality on the next life's first idle), the Ascended Ancestor
   ending (31F: the v1 grant + screen ride on it), the Ancestral Hall (a Soul card in Kin → Hall), charselect (the Soul
   button + total), the sim bot (spends on rank-ups).
4. **Drama:** worst: a failed Trial still kills (unchanged), but the loss now leaves an ember that speeds every future
   life. Best: first Immortality → the heavens split open (cinematic) → "You have finished v1" → a flood of points.
5. **Feedback:** each failure makes the next attempt, in any slot, arrive sooner; the log reads like a lineage of
   near misses.
6. **Agency:** the player decides to attempt, and decides every rank. The world decides only the Trial roll (as now).

## The Immortal Ascension cinematic (task 40b, asset gate ≥ 8.0)
Replaces the plain `triggerDeath('ascend')` for a **successful** Trial with a full-window scene on the ink engine
(~9 s, click/tap to skip after 1.5 s; Reduced motion → a 2 s gold crossfade):
1. **Gathering (0–2 s):** the realm scene dims, tribulation clouds (ink dots) roll in and swirl above the figure.
2. **Tribulation (2–4 s):** three forked bolts strike; the figure holds, cracks of light run through the robe dots.
3. **Rising (4–6.5 s):** the figure lifts, dots stream upward, the three golden dragons spiral the heaven's pillar.
4. **The Gate (6.5–8.5 s):** the clouds part into a dotted heavenly gate; light floods out; the figure enters.
5. **Flash (8.5–9 s):** white-gold bloom → the v1 screen (first time) or the short Immortal card fades in.
Needs an overlay canvas sized to the window (all layout modes; Banner peeks to Expanded like other popups; phone full
screen). Frame budget 6 ms. Smoke: `scenarios/immortal.js` stills per phase + a sheet for the reviewer.

## UX pass
- **Surface:** the death card of a failed Trial shows `+N Soul Points` with the reason (`failed at 71% odds`); the Qi/s
  breakdown lists "Soul Resonance (rank 4) ×1.20"; the Soul screen shows unspent / lifetime, current bonus, next rank
  cost + what it gives, and the log.
- **Interact:** Soul screen reachable from the charselect (a Soul button with the total, since it is cross-save) and
  from a Soul card in Kin → Hall; one click per rank ("Deepen Resonance: 46 pts → +5% Qi"). Disabled button says why
  ("need 12 more" / "fully resonant").
- **Discover:** first points ever → toast "Your soul remembers…" + a dot on the Hall sub-tab and the charselect Soul
  button until the screen is opened (`seen`).
- **Finish screen** (first Immortality): full window over the cinematic's afterglow, parchment-gold on ink: "Congratulations ·
  You Have Become Immortal · You have finished your race to immortality." Lines: who ascended (name + clan), generation,
  open time this life, earlier falls at the Trial across all slots; `+500 Soul Points` (shared by every save slot); a
  line on the clan's Ascended Ancestor (or, for an orphan, the wheel turning on); buttons **Spend Soul Points** (opens
  the Soul screen on top) and **Continue: your line goes on** (the Ascended Ancestor flow). Reachable again from the Soul
  screen ("Your ascension · Relive it", which replays the cinematic and changes nothing). No version is mentioned.
- **Layouts:** Expanded/Desktop first; Overlay 300px stacks lines; phone full screen with safe areas; ⚙ text size +
  color-blind honored. Icons from `Icon()`; no emoji; CJK only as a flavour title (`cjk-ok`).

## As-built (40a, 2026-09-28)
- **Engine** (game-state.js → "Phase 40: Soul Points"): `this._soul` (constructor → blank), `loadSoul()` (charselect boot +
  every `initSlot()`; a shell with no soul storage keeps the in-memory record), `_normSoul()` clamps a corrupt/hand-edited
  file, `_saveSoul()` (skipped for `s.devSave` lives: `buildDevSave()` sets it, `_die()` carries it), `getSoul()`,
  `soulInfo()` (record + max/cost/need/canSpend/mult for the UI), `soulQiMult()`, `soulRankCost()`, `spendSoul()`,
  `markSoulSeen()`, `_grantSoul(kind, pts, meta)` and `_grantImmortalSoul()` (v1 grant once, then +150). Log entries:
  `{ at, kind: fail|v1|immortal|spend, pts, who, chance?|rank? }`; `who` = "Name of the X clan" / "Name the orphan".
- **Grant timing:** `attemptAscension()` grants before `_die()` (so `who` is the one who tried), writes
  `lastReincarnation.soul = { kind, pts, first, chance? }` onto the new life, then `_save()`s the slot at once (invariant 3).
  The v1 Immortality grant is already live in 40a; 40b adds its screen, keyed on `lastReincarnation.soul.kind === 'v1'`.
- **Qi term:** `_recalc()` → `qMul("Soul Resonance (rank N)", soulQiMult())` after the Ancestor Blessing, so offline Qi
  (derived.qiPerSecond) gets it too and the Qi/s popover lists it.
- **UI** (renderer/game/soul-view.js → `SoulView`, overlay `#soul-overlay`, z 320 so toasts/banter sit under it): opened
  from the charselect `#cs-soul` button (hidden until `earned > 0`; gold dot while unseen or a rank is affordable), the
  Kin → Hall "The Soul Remembers" door (`HallView._soul()`, also on the orphan Hall; dot while unseen) and the attention
  item `soul` (idle tier, `open: 'soul'`). Escape / backdrop / Close shut it; opening marks it seen. Honors the text-size
  setting (zoom) and Reduced motion. Accent token `--soul` #B8A4F0 (violet-white) beside gold points and jade bonus.
- **Death card:** `#death-soul` line ("Your soul remembers: +N Soul Points · fell at X% odds · shared by every save slot").
  **Trial card:** `#asc-soul` row "Should you fall +N Soul Points" (same formula). Closing the death card: first-ever points
  → toast pointing to Kin → Hall; every grant → banter `soul_remembers` (4 lines per personality + 2 generic).
- **Sim:** loader stubs `loadSoul/saveSoul` in memory (`sim.saves.soul`); `Bot.soul()` buys a rank whenever affordable.
  Report metrics for soul points are left to 2.8 (QA & Balance).
- **Tests:** `scripts/sim/checks/soul.js` (26 checks), smoke `scripts/smoke/scenarios/soul.js` (16 checks, screenshots).

## As-built (40b, 2026-09-28)
- **Cinematic** (renderer/engine/ascension-cinematic.js → `AscensionCinematic`): its own full-window canvas, own rAF
  loop; the figure is INK_ART.ascended from a private `InkRenderer({ bare: true })` (no scenery, no clipped pillar, no
  ground shadow), driven frame by frame (`ink.t/bt` set, `_draw()`), composited at its scene centre (150, 70). Layers per
  frame: sky (opaque at full dim) → light behind the gate → eye glow → cloud billows (a pre-rendered soft puff sprite per
  billow + clustered ink dots in 10 buckets, three spiral arms) → gate (a three-bay pailou in dots: double upswept eaves
  with flung corners, centre plaque, side roofs + posts, cloud plinth; reveal top-down) + a dotted doorway with a feathered
  glow → cloud sea below (four rows of billows + top-surface dots, a dark floor; settles slightly and stays, gold where the
  pillar meets it) → heaven's pillar (feathered glow + additive core) → three golden dragons climbing it (dotted helices,
  back half behind the figure, front half in front) → motes → figure → bolts (`POWER` 0.7/0.95/1.3 scales width, halo,
  flash, shake, crown bloom; 1/2/3 forks; a dotted afterimage; a gold impact ring) → a lavender strike flash → the
  white-gold flash. Tall windows (H > 1.4 W) anchor the gate, figure and sea lower. Cycle 3: the dragons have angular
  dotted heads (snout wedge, swept horns, white eye), bodies that swell behind the head and taper (three dot rows) and dorsal
  spines; the flash peaks white-gold at the gate, then `_afterglow()` lays a dark vignette, a bloom on the gate and gold
  motes rising through the lower half; sky and clouds stay violet (no khaki wash); the gate scales with the height (+4%
  headroom) and the figure waits lower until the doorway opens. Frame: 4.0 ms Overlay, 5.7 ms Desktop at the busiest
  phase (the user chose to keep it as is, 2026-09-28). Review: 7.7 → 7.8 (agents), accepted by the user. After the end: an afterglow at ~30 fps (one still with Reduced motion).
  Timings: `SECONDS` 9, `CALM_SECONDS` 2, `SKIP_AFTER` 1.5, `BOLTS` [2.1, 2.8, 3.5], `POWER` [0.7, 0.95, 1.3].
  Test hooks: `freeze(t)`, `perf(n)`. Geometry rebuilds on resize (banner peek, rotation).
- **Flow** (game.js): the lastReincarnation watcher sees `cause === 'ascended'` with `lr.soul` → `playDeath('ascend')` on the
  HUD sprite, `_deathHoldUntil = Infinity`, `immortalView.play(lr.soul, { onContinue })`; Continue → the interlude card.
  `attemptAscension()` now hands the grant to `_die(cause, soul)` so `lastReincarnation.soul` exists before subscribers run.
  The old "Welcome to the Immortal Realms" toast is gone. `soul_remembers` banter only follows a *failed* Trial.
- **Finish screen** (renderer/game/immortal-view.js → `ImmortalView`, `#immortal-overlay` z 305: over toasts, under the Soul
  screen): `kind 'v1'` → the full screen, `'immortal'` → the short card (+150). Data from the grant meta: `who, name, clan,
  generation, hours, failedBefore` (also stored in `v1Finished`). Skip: canvas click / Skip button / Esc / Space / Enter.
  Relive: Soul screen row → `relive` helper → `play(..., { relive: true })` with a single Return button.
- **Tests:** smoke `scripts/smoke/scenarios/immortal.js` (19 checks: grant, card waits, Skip timing, frame budget in two
  modes, copy has no version, Spend on top, Continue → interlude, Relive changes nothing, later card, Reduced motion,
  Banner peek; stills per phase in every mode).

## Wiring
main.js `load-soul` / `save-soul` IPC ↔ preload.js `loadSoul()/saveSoul()` ↔ platform-storage.js fallback (Rule 7,
same change) · game-state `initSlot()` → `_loadSoul()` · `attemptAscension()` → `_grantSoul()` · `_recalc()` →
`soulQiMult()` · game.js death card + v1 screen · soul-view.js (Soul screen, charselect + Hall entry) · sim loader stub.

## Invariants
1. Soul state never enters a slot save; deleting a slot never touches it.
2. `points ≥ 0`, `earned` never decreases, `resonance ≤ SOUL_RESONANCE_MAX`.
3. Points are granted exactly once per Trial outcome (no double grant on reload / offline catch-up).
4. The v1 grant fires once per install (`v1Finished` set atomically with the grant).
5. Dev presets and the sim never write the real soul file (sim uses an in-memory record).

## Build tasks (PLAN.md → v1 → Phase 40)
- **40a** Soul Points core: data, record + IPC both platforms, earn on failed Trial, Resonance + breakdown, Soul screen
  (charselect + Hall), discovery dot, checks `scripts/sim/checks/soul.js`, bot spends. Visual gate ≥ 7.5.
- **40b** Immortal Ascension cinematic + the v1 finish screen + later-Immortal card. Asset gate ≥ 8.0, UI gate ≥ 7.5.
- Balance of the numbers above → task 2.8 (QA & Balance).
