# Progressive Disclosure (循序) — Phase 50

_Last updated: 2026-11-26 · Roadmap: PLAN.md → M0.5 · Related: `docs/systems/active-cultivation.md`,
`docs/systems/mortal-phase.md`, `docs/systems/tutorial.md`._

The game no longer starts with every tab. A new life opens with **Explore and Body only** — the mortal
verbs — and hands the player one system at a time as they climb. This keeps the first hour quiet (no
dump of nav tabs, popups or tips) and lets each mechanic arrive when it can be used.

## Where it lives

| Piece | File | Role |
|---|---|---|
| The schedule | `assets/data/unlocks.js` | `UNLOCK_GROUPS`, `UNLOCK_VIEWS`, `UNLOCK_RULES` — data only. |
| The evaluator | `renderer/game/unlocks.js` | `viewUnlocked`, `availableViews`, `unlockReason`, `lockedGroups` — DOM-free. |
| Nav gating | `renderer/game/nav.js` | `setAvailable` hides a whole group when none of its views are offered; falls back to the first open group. |
| Wiring | `renderer/game.js` (`updateHUD`) | `availableViews(s)` feeds `nav.setAvailable`; attention items for locked views are filtered out. |
| Lessons | `renderer/game/tutorial.js` | No lesson plays for a locked view; a `guideOnly` lesson (the HUD tour) never auto-plays. |
| The "still locked" list | `renderer/game/tutorial.js` (Guide) | `lockedGroups()` → the Guide in ⚙ Settings names each closed group and why. |

Loaded in `renderer/index.html` (data after `tutorial.js`, evaluator after `nav.js`) and by
`scripts/sim/loader.js`. `scripts/sim/checks/unlocks.js` pins the rules (`npm run checks`).

## The schedule (as built)

| Gate | Views opened |
|---|---|
| **From the start (mortal)** | `explore` (Roam), `physique` (Path → Body) |
| **Awakening** (Qi Condensation 1) | `stats`, `techniques`, `pack`, `events`, `banter`, `beasts` |
| **Qi Condensation 2** | `arts`, `hunt`, `sect`, `sect-missions`, `sect-library`, `arena` |
| **Qi Condensation 3** | `bestiary`, `craft` |
| **Qi Condensation 4** | `world`, `people` |
| **Qi Condensation 5** | `chronicle`, `class` |
| **Qi Condensation 6** | `rankings` |
| **Qi Condensation 7** | `rival` |
| **Foundation Building (or a family exists)** | `family`, `tree`, `clan`, `hall` |
| **Your own sect's deep pages** | `sect-halls`, `sect-base`, `sect-disciples`, `sect-war` — once you are in or lead a sect (any stage) |

Thresholds match the systems' own requirements (sects' lowest `minStage` is 2; marriage is Foundation
Building). A view opened once is **never closed again** within a life — the schedule is monotonic (checked).

## Rule semantics

A rule matches when **any** of its conditions passes (OR), so existing state always re-opens a gate for an
old save or a scripted scenario:

```js
{ always: true }        // from the first frame
{ awaken: true }        // s.awakened
{ stage: n }            // s.stageIndex >= n
{ anySect: true }       // (s.sect && s.sect.id) || (s.ownSect && s.ownSect.founded)
{ founded: true }       // s.ownSect && s.ownSect.founded
{ family: true }        // a proposal, spouse, lover or child exists
```

This means a migrated save past Qi Condensation 1 already has everything its stage implies, and a save that
somehow has a sect/family at a low stage can still open those views.

## Opening trim (50b)

- The intro ink scroll was **5 cards → 1** (`assets/data/tutorial.js`, `intro`).
- The 10-step HUD tour is now **`guideOnly`** — it no longer auto-plays at the start; it is replayable in
  ⚙ Settings → Guide.
- A new game sees at most: the 1-card intro, the first view's own lesson, and the mortal beat card.
- Every lesson is gated: `onView` refuses a locked view, and `el`-triggered lessons only fire when their
  target is actually visible.

## Attention / hint noise (50c)

`collectAttention` still gathers everything the save says is waiting, but `game.js` filters the list to
`nav._offered(item.view)` before it reaches the strip, badges or banner. A locked system can no longer
send an urgent nudge the player cannot answer. (The older per-system first-time hints logged in
START_HERE.md → UX Debt are folded into `TUTORIAL_LESSONS` gradually; the coach-mark layer is gated now.)

## Adding a view

1. Add it to `NAV_GROUPS` (`renderer/game/nav.js`) as usual.
2. Add a `UNLOCK_VIEWS` entry and a `UNLOCK_RULES` entry in `assets/data/unlocks.js`.
3. `scripts/sim/checks/unlocks.js` asserts the two tables agree and every view has a reason.

## Gotchas

- `availableViews` does not read `NAV_GROUPS` (that file needs the DOM/`Icon`); the schedule carries its own
  ordered view list. Keep it in sync with nav when adding views — the check catches a missing rule, not a
  missing nav entry.
- `nav.go(view)` stays permissive (programmatic navigation, smoke tests) — only clicks and attention are gated.
- A veteran save (stage ≥ 1) lands on Character, not Body; a fresh mortal falls back to Body when the saved
  nav view (`stats`) is still closed.
