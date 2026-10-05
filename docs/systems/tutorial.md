# Tutorial: Coach Marks + the Guide (Reference)
_Covers: assets/data/tutorial.js · renderer/game/tutorial.js · game-state.js (tutorial seen-state, in the soul section) ·
game.js (wiring) · settings.js (the Guide hook) · styles.css ("1.23 Tutorial") · Task: 1.23 (v1 wrap-up step 5) ·
Updated: 2026-10-04 · Status: **built**_

## What it is
These are skippable **coach marks**. The first time you meet a system, the screen dims except for a gold ring around the
real control, and a short card beside it explains it in one or two sentences. Each lesson plays once per install. The
**Guide**, at the top of ⚙ Settings, replays any lesson, turns tips on and off, and can restart them all.

User decisions (2026-10-04): **neutral guide text** (no mentor voice) · a **spotlight that a tap dismisses**, playing only
when nothing else is open · seen-state **across all saves** (the soul record) · the Guide **inside ⚙ Settings**.

## Lessons (assets/data/tutorial.js, data only)
`TUTORIAL_LESSONS = [{ id, group, title, trigger, needs?, opens?, inBattle?, steps:[{ at:[css…], title?, text }] }]`,
`TUTORIAL_GROUPS` = Basics + the six nav groups (Guide order).

| Trigger | When it plays | Lessons |
|---|---|---|
| `{ start: true }` | the first time a game is on screen | `hud`: the 10-step tour (you, Qi, the "why" numbers, Meditate, Breakthrough, Integrity + Health, Stones, attention, the six places, the Guide) |
| `{ view }` | the first time that sub-view opens; replay opens it first | one per view, **every** NAV_GROUPS view (30) |
| `{ el }` | the first time that element is on screen | `breakthrough` (the button enabled), `attention` (a first item), `flow` (Meridian Flow button), `mode` (the automation chip), `battle` (the move grid, `inBattle`) |

- `at`: selectors are tried in order and the first visible one gets the spotlight. If none is visible, the card sits in the
  middle with no cutout. Text ≤ 200 chars (checked).
- `needs`: the Guide's lock reason while the view isn't offered to you (the six joined/founded-only sect views).
- `opens`: the Guide's short line for an unlock lesson that hasn't happened yet ("When your Qi first fills").

## State (cross-save soul record, NOT in any slot save)
```
soul.tut: { seen: { [lessonId]: ms }, off: bool, init: bool }
```
`_blankSoul` / `_normSoul` (a pre-1.23 soul file gets a blank record; non-numeric times are dropped). Dev preset lives
never write the soul file (existing rule), so a dev session's tips are in memory only.

## API (game-state.js, soul section)
- `tutorialInfo()` → `{ off, init, seen }` (copy)
- `markTutorialSeen(id)` → true the first time only
- `setTutorialsOff(bool)`
- `resetTutorials()` forgets every lesson and turns tips back on (`init` stays true)
- `initTutorials(markIds)` runs once per install: marks the given ids seen and sets `init`

## UI (renderer/game/tutorial.js: TutorialUI)
- **Layer:** `#tut-overlay` (z 450, appended to body). Its id ends in `-overlay`, so banter and the auto-opened cards treat a
  tip as an open popup. `.tut-hole` is the ring, and its 200vmax box-shadow is the scrim. `.tut-card` holds the title, the
  `n / N` count, the text, "Turn tips off", Back, and Next or "Got it" (on the last step), plus an X that skips the lesson.
  A tap off the card = Next. While a tip is up it owns the keyboard (capture phase): Esc skips, ← goes back,
  Enter / Space / → go forward, and every other key is swallowed, so 1–4 / Space never reach a fight.
- **Placement** (`_place`, every frame while up; DOM writes only when the rect changes): below the target if the card
  fits, else above, else beside a tall target (the nav rail), narrowed down to 220px to fit, else the far edge. Width is
  min(320, window − 16). The first spotlight of a lesson snaps into place, and later steps slide (0.22s; none under
  Reduced motion).
- **When** (`tick`, 4×/s): nothing plays while held (below), while the game isn't on screen, in Banner mode, while the
  first-launch `#layout-tip` shows, or while any `body > [id$=-overlay]` is open. The one exception is an `inBattle` lesson
  when the battle page is the only one open. Order: the HUD tour → the open view's queued lesson (dropped if you've left
  that view; it re-queues next time) → an unlock on screen. A lesson is **marked seen when it starts**, so closing the
  window never replays it. Each tip waits 450ms after a view opens and 700ms after the last tip.
- **First run** (`_init`, once per install with this build): an established save (stage ≥ 3 or generation > 1) marks
  every lesson seen and shows one toast ("New: tips for every system. Replay any of them in Settings → Guide."). A new
  player gets the tour.
- **The Guide** (`renderGuide`, drawn first in ⚙ Settings via `settingsUI.guide`): Tips On / Off, an "All lessons" fold
  (`N / 36 seen`), rows by group (gold dot + "New" · jade "Seen" · the `opens` line · a lock icon + the `needs` reason,
  disabled), and "Show every tip again". A row replays the lesson: Settings closes, the view opens (the full window from
  Banner), and it plays after 320ms.
- **Smoke hold:** `localStorage['ci:smoke-no-tips'] = '1'` holds every tip (but not Guide replays). `scripts/smoke/cdp.js` sets
  it for every scenario, so coach marks never sit over a scenario's clicks. Only `scenarios/tutorial.js` removes it.

## Depth / UX pass (as agreed)
- Not a gameplay mechanic: no balance, and nothing touches `_s`. Memory = what this install has seen. Feedback = later
  lives and slots skip what you know, and an unlock lesson only plays once your life actually reaches it.
- Surface: the real control is lit, and the HUD tour points at the "why" numbers. Interact: one tap per step, with an X
  to skip. Discover: the tour's last step points at ⚙, and "Turn tips off" says where to turn them back on. Modes: Overlay,
  Expanded, Desktop and phone are all smoke-checked (the card stays in the window and off the control at every step).

## Checks
- `scripts/sim/checks/tutorial.js`: the seen-state (cross-slot, not in the slot save, once per id, off/on, reset, init
  once for veteran vs new, old/corrupt files) + the data (unique ids, groups, one trigger kind, every NAV view has
  exactly one lesson, sect lock reasons, battle-only `inBattle`).
- `scripts/smoke/scenarios/tutorial.js`: the tour (Back, arrow key, Got it), a view lesson, X skip, Turn tips off + the
  toast, the Guide (locked reasons, Seen, unlock lines, replay opens the view, Esc), the battle lesson (a key under the card
  plays no move), and the tour in all four layouts.

## The intro (2026-10-05, user request)
- **What:** five full-window cards (the user's own text, word for word) that set up the world and the goal: Qi → realms →
  Immortality, with sect and family along the way. Grand with a dry wink (user pick: "don't take itself too seriously, no
  forced comedy").
- **Data:** the first lesson in `TUTORIAL_LESSONS`: `{ id: 'intro', group: 'basics', trigger: { start: true }, intro: true,
  steps: [{ title, text }] }` (no `at`; ≤ 260 chars). Because it is a lesson, it inherits everything: plays first on a new
  game (start lessons in order: intro, then `hud`), a veteran install marks it seen, the Guide lists + replays it, seen-state
  in the soul record.
- **UI:** `renderer/game/intro.js` (`IntroUI`, `window.introUI`): `#intro-overlay` (an `-overlay`, so every tip and popup waits
  while it is up), an opaque dotted night on its own canvas (stars, a dotted mountain ridge, rising motes tinted per card;
  seeded, dots only), ornament + title + text + pips + Back / "n / 5" / Next → Begin, Skip (hidden on the last card). A tap
  anywhere steps on; Esc skips; ← → Enter Space. Reduced motion: one still frame, no fades. `TutorialUI.play` hands a lesson
  with `intro` to it (`new TutorialUI({ …, intro })`).
- **Tests:** checks/tutorial.js (two start lessons in order, 5 titled cards); smoke `scenarios/intro.js` (first play before
  the HUD tour, tap/keys/Back/Begin, Esc, all 5 cards fit in all 4 modes, the Guide replay); `scenarios/tutorial.js` now skips
  the intro first.

## The Spiritual Root (2026-10-05, user request)
- `v_stats` (Path → Character) has 3 steps: the view, **Your Spiritual Root** (spotlights `#tab-stats .ch-tag.root`: the four
  multipliers, elements shape arts) and **A better root** (brew a root elixir in Pack → Craft → Elixirs).
- `v_craft` has 2: the furnace and **Root elixirs** (spotlights `.craft-subtab[data-sub="elixirs"]`, a `data-sub` attribute
  game.js now sets on every craft sub-tab; what each elixir does).
- Coach marks scroll their target to the **centre** of its pane (was `nearest`, which left an Overlay target clipped).
- Smoke: `scenarios/tutorial-root.js` (all 4 modes, spotlight on the right control, card in the window + off it). UI 7.9 PASS.

## Gotchas
- A new view: add a `{ view }` lesson, or `checks/tutorial.js` fails ("every view has a lesson").
- Targets are CSS selectors into live markup. When a view's classes change, the step falls back to the next selector,
  then to the panel or a centred card. It never breaks, but re-check the lesson.
- The older per-system first-time hints (road, deeds, rival, rankings…) still exist alongside this. Folding them in is
  UX debt.
