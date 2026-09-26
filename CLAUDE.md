# Cultivator Idle — Agent Instructions

> **READ FIRST EVERY SESSION:**
> 1. `START_HERE.md` — what's built, what was done last, what to do next
> 2. `docs/index.md` — if you're touching an existing system, load its doc before reading source

Desktop wuxia cultivation idle game. Electron + vanilla HTML/Canvas.
ASCII cultivator lives on the edge of the screen, cultivating passively.

---

## ══ PRE-TASK ASSESSMENT (REQUIRED) ══

Before starting work on a task (any code change, or file reads/searches in service of that task) — output this block first then ask user to approve output (even on auto approve).

**Exempt:** orientation reads — `START_HERE.md`, `CLAUDE.md`, `PLAN.md`, `GAMEDESIGN.md`, `docs/**` — used to figure out what the next task is. Read these freely without an assessment. Once you've picked the next task from the docs, output the assessment and get approval **before** reading source or making changes for it.

```
TASK ASSESSMENT
───────────────────────────────────────
What:       [one sentence — what is actually being asked]
Touches:    [files/systems likely affected]
New files:  [any new files needed]
Complexity: Low | Medium | High | Very High
Model rec:  Haiku | Sonnet | Opus
Reason:     [one line]
Depth:      [gameplay tasks: the hooks + choice/consequence loops from the Design Depth Pass; else "n/a"]
───────────────────────────────────────
```

| Signal | Complexity | Model |
|--------|-----------|-------|
| Doc update, single-file tweak, CSS fix, config change | Low | Haiku |
| New feature in one existing system, 1–3 files, clear spec | Medium | Sonnet |
| New Phase / new system — state + logic + UI, 5+ files | High | Sonnet |
| Cross-system architecture change, deep multi-system bug, Phase planning | Very High | Opus |

If you assess High/Very High and you are not on Sonnet or Opus — say so before doing any work.

---

## ══ DESIGN DEPTH PASS (REQUIRED for any gameplay feature) ══

The user wants **deep, interconnected, choice-driven mechanics** — a living cultivation novel, not a checklist
of isolated features. The minimal version of a spec is a starting point, not the deliverable. Before speccing or
building any gameplay feature, write a **"Depth pass"** into the spec/plan and show it to the user:

1. **Memory** — what does the new thing remember and change over time? (affection, grudges, loyalty, reputation)
2. **Choices** — random events with 2–3 choices whose outcomes read existing data (PERSONALITIES, root, karma,
   stage, affection) so the same event plays differently for different characters.
3. **Hooks** — name ≥3 existing systems it reads from or writes to (breakthroughs, health/death, bloodline/heirs,
   family, sects/wars, expeditions, random events, banter, crafting, beasts).
4. **Drama** — the best and the worst thing that can happen. Include story-making failure (betrayal, rivalry,
   loss, revenge), not only bonuses.
5. **Feedback** — how does the player's past behavior change future events?

If the user asks for one mechanic, propose 2–3 connected ones alongside it. Example of the expected depth:
marriage (Phase 16-lite) → spouse affection, personality-driven marriage events, affairs, discovery reactions
ranging from acceptance to a duel to the death — see `docs/systems/family.md`.

---

## Project Structure

```
START_HERE.md           ← Session entry point — update at end of every session
CLAUDE.md               ← You are here — dev rules
PLAN.md                 ← Phase roadmap with implementation detail
GAMEDESIGN.md           ← Mechanics, pacing, lore style
docs/
  index.md              ← System doc index + new-doc template
  systems/
    core-loop.md        ← Qi, stages, roots, breakthroughs, techniques
    expedition.md       ← Expedition timer, inventory, drops (Phase 2)
    crafting.md         ← Recipes, equipment, pills, elixirs (Phase 2)
    sects.md            ← Sect join/rank/missions/bonuses (Phase 4)
    own-sect.md         ← Found a sect: buildings, disciples, income (Phase 5A)
    sect-war.md         ← Sect wars: own-sect (5B) + member wars for joined sects (5C)
    qa-sim.md           ← QA sim harness: flags, metrics, profiles, how to extend
    dev-presets.md      ← Dev-only late-game test characters (npm start charselect)
    bloodline.md        ← Health & Death, Bloodline Quality, Ascension Trial (Phase 23A-C)
    settings.md         ← ⚙ Settings panel, per-slot presentation prefs (Phase 20C)
    banter.md           ← Personalities + banter engine, bubble, log (Phase 29)
    banter-writing-guide.md ← Voice/tokens/triggers brief for writing banter lines
    ui-layout.md        ← Window layout, tab pattern, CSS vars
    notifications.md    ← System tray + opt-in desktop notifications (Phase 9A-B)
    life-loop.md        ← M2 build spec: lifespan, heirs, Ancestral Hall, clan legacies (Phases 30/31)
    family.md           ← Spouse affection, marriage/crisis events, duel, lovers + affair discovery (Phase 16-lite+)
    clan-succession.md  ← SPEC (M2 2.6a–f): world/life split, heirs as NPCs, rebirth as descendant, tournaments, branch wars
    backpack.md          ← Pack tab: item category field, filters/sort, Use/Equip/Discard (Phase 21)
    automation.md        ← Active/Idle Mode + staged automation unlocks, Active Mode bonuses (Phase 22)
.agents/rules/
  general.md            ← Always-on rules (code style, Electron security)
  assets.md             ← ASCII art pipeline (create → review → gate ≥8.0)
  game-design.md        ← Design rules (pacing, flavor text, event structure)

main.js                 ← Electron window, IPC, slot save/load, system tray + notifications (Phase 9A-B)
preload.js              ← contextBridge — only way renderer talks to Node
capacitor.config.json     ← Capacitor (iOS) config — webDir "www"
scripts/
  build-ios-web.js      ← Builds www/ (gitignored) from renderer/ + assets/ for Capacitor
  gen-tray-icon.js      ← One-off generator for assets/icons/tray-icon.png (Phase 9A, not run at boot)
  sim/                  ← QA sim harness (`npm run sim`) — bots play real game logic headless → report.md
    run.js · loader.js · bot.js · metrics.js · report.js · profiles.js · rng.js · USAGE.txt
    checks/             ← Scenario checks (`npm run checks`) — force exact situations, print ok/FAIL; run-all.js + one file per system
renderer/
  index.html            ← All HTML — charselect + app, 7 tabs
  styles.css            ← All CSS — CSS vars at top, add new components here
  game.js               ← Boot, tick loop, all UI wiring and render functions
  engine/
    platform-storage.js ← window.electron fallback (Capacitor/browser) — see docs/systems/ios-port.md
    persons.js          ← Persons — shared root/personality/name generators + Person record schema (Phase 30/31, M2 task 2.2)
    game-state.js       ← ALL state mutations — _newGame(), _recalc(), tick()
    ascii-renderer.js   ← Canvas renderer — sprites + particles + aura rings
  game/
    cultivation.js      ← Random event scheduler (fires every 30–120s)
    expedition.js       ← ExpeditionSystem — tick-based expedition resolution
    crafting.js         ← CraftingSystem — thin UI wrapper for craft/equip/pill/elixir
    sect.js             ← SectSystem — resolves timed sect missions (Phase 4)
    sect-war.js         ← SectWarSystem — advances the sect war state machine, own + member wars (Phase 5B/5C)
    settings.js         ← SettingsUI — ⚙ overlay rendered from SETTINGS_DEFS + applies prefs (Phase 20C, UI only)
    banter.js           ← BanterSystem — picks lines on game events + idle timer, DOM-free (Phase 29)
    notifications.js    ← NotificationSystem — opt-in desktop notification triggers + cooldowns, DOM-free (Phase 9A-B)
assets/
  icons/
    tray-icon.png       ← System tray icon (Phase 9A) — see scripts/gen-tray-icon.js
  data/
    stages.js           ← CULTIVATION_STAGES[23]
    techniques.js       ← TECHNIQUES
    events.js           ← RANDOM_EVENTS
    items.js            ← ITEMS — all collectable/craftable item types + Pack tab `category` (Phase 21)
    locations.js        ← LOCATIONS — expedition destinations + drop tables
    enemies.js          ← ENEMIES — tier definitions
    recipes.js          ← RECIPES — all crafting recipes
    sects.js            ← SECTS, SECT_RANKS, SECT_MISSIONS (Phase 4)
    sect-buildings.js   ← Own-sect founding cost, Sect Hall levels, buildings, disciple constants (Phase 5A)
    sect-war.js         ← War timers, rival name pools, own-sect prep + member-war commitment/spoils constants (Phase 5B/5C)
    bloodline.js        ← Health regen/damage, Bloodline Quality growth, Ascension survival curve (Phase 23A-C)
    lifespan.js         ← Game clock + family timing constants (Phase 30/16-lite; age is a stat only, no lifespan)
    family.js           ← Affection, MARRIAGE_EVENTS / crisis, duel + affairs, AFFAIR_REACTIONS, CHILD_EVENTS, PERSONALITY_MORALITY
    automation.js       ← Active/Idle mode default, automation unlock thresholds, Active Mode bonus constants (Phase 22)
    settings.js         ← SETTINGS_DEFS — ⚙ panel options, defaults, validation ranges (Phase 20C)
    personalities.js    ← PERSONALITIES (14) + banter triggers/tuning constants (Phase 29)
    banter-lines.js     ← BANTER_LINES — 1,695 lines, personality × trigger + generic pool (Phase 29)
    names.js            ← SURNAMES (60) + GIVEN_NAMES (205) — pinyin, gender-neutral (Phase 30/31, M2 task 2.2)
    dev-presets.js      ← DEV_PRESETS — late-game test characters, shown on charselect only in `npm start`
  sprites/
    cultivator-sprites.js ← CULTIVATOR_SPRITES — animated ASCII frames + colors
```

---

## Architecture Rules

1. **State lives in `game-state.js` only.** Never mutate `_s` from outside it.
2. **Data files are data only.** No logic in `assets/data/`.
3. **No Node in renderer.** All Node access via `preload.js` contextBridge.
4. **New sprites → Asset Pipeline first.** Minimum score 8.0/10. See `.agents/rules/assets.md`.
5. **New state fields** → add to `_newGame()` AND to `_ensurePhase2Fields()` (or add a new `_ensurePhaseNFields()` method) for save-migration safety.
6. **New Phase → new system doc** → create `docs/systems/<system>.md` before writing code.
7. **PC + iOS share one renderer.** `renderer/` and `assets/` are the single source of truth for
   BOTH platforms (Electron desktop + Capacitor iOS) — see `docs/systems/ios-port.md` before
   touching anything platform-related. Concretely:
   - If you add/change a `window.electron.*` method, update it in BOTH `preload.js`/`main.js`
     (the real Electron implementation) AND `renderer/engine/platform-storage.js` (the iOS/browser
     fallback) in the same change. Never call Node/Electron APIs from renderer code any other way —
     rule #3 already requires this, and it's now also what makes the iOS shim work at all.
   - Don't add new hard-coded desktop-window assumptions (fixed pixel sizes, `-webkit-app-region`,
     hover-only interactions) without a thought for how it'll look full-screen on a phone. The
     existing 300px-width CSS is a known, tracked exception (see `docs/systems/ios-port.md`), not a
     pattern to extend.

---

## ══ ASSET PIPELINE (MANDATORY) ══

All visual assets must pass a two-agent create → review gate before being committed.

**Covered:** new sprite states, color palettes, UI color tokens, multi-frame animations.

**Step 1 — Create** using the prompt template in `.agents/rules/assets.md`.

**Step 2 — Review** immediately after creation using the review prompt in `.agents/rules/assets.md`.

**Step 3 — Gate**
- Average ≥ 8.0 → add to file with comment `// Review score: X.X`
- Average < 8.0 → revise failing criteria, re-run Step 2
- 3 cycles at < 8.0 → present both versions to user

---

## Game Design Rules

- Numbers should feel satisfying to watch grow — use `fmt()` to keep them readable
- Every cultivation stage must have a matching `spriteState` in `CULTIVATOR_SPRITES`
- Breakthrough chance must never exceed 0.98
- New `RANDOM_EVENTS` must have both positive and negative variants
- Flavor text should read like a xianxia novel translation
- Balance changes: run `npm run sim` before AND after, read only `scripts/sim/out/report.md`; try values
  with `--set` first. New systems must teach the sim bot to use them (see `docs/systems/qa-sim.md`).

---

## ══ DOCUMENTATION RULES (NON-NEGOTIABLE) ══

Documentation is part of implementation. "I'll update it after" means it never gets updated.

### After every task

**Always required:**
1. **`START_HERE.md` "Last Session" block** — date, what changed, what's next, what's incomplete.
2. **`PLAN.md` phase status** — mark completed items ✅; note if implementation diverged from plan.

**Required when you touched a system:**
3. **`docs/systems/<system>.md`** — update state shape, API, wiring, gotchas to match current reality.
   If no doc exists for a system you just created, create it now using the template in `docs/index.md`.

**Required only when files are added/removed/renamed:**
4. **`CLAUDE.md` Project Structure section** — keep the file tree accurate.

**Required for every new data file:**
5. **Top-of-file comment** — one line: what it contains and which files depend on it.

### Test scripts are project assets, not scratch (user rule, 2026-09-26)

Any check/test script you write that would be useful for future work — scenario checks that force a specific
situation, migration tests, regression repros, before/after comparison harnesses — goes in the repo, **not** the
session's temp/scratchpad folder (that folder is deleted with the session and the next agent never sees it):
1. Save it under `scripts/sim/checks/<system>.js` (scenario checks: require `../loader.js`, print `ok …` / `FAIL …`
   lines, set `process.exitCode = 1` on failure) or another fitting `scripts/` folder for other tools.
2. Give it a top-of-file comment: what it covers, which system doc, how to run it.
3. Document it in the same change: add it to `docs/systems/qa-sim.md` → "Scenario checks" (and the system's own doc if
   it pins down that system's rules). `npm run checks` picks up new files in `scripts/sim/checks/` automatically.
4. When you change a system, extend its check file instead of writing a new throwaway script.
Truly one-off probes (a single debug print) can stay in scratch. When unsure, keep it.

### A task is NOT done until

- The code works
- `START_HERE.md` is updated
- `PLAN.md` reflects the new state
- Relevant system doc is current
- `npm run dist` produces a working build (for any user-facing changes)
- `npm run checks` passes (all scenario checks, ~5s) — and any new check you wrote is saved in the repo (below)
- If `renderer/` or `assets/` changed: `npm run build:web` (or `npm run cap:sync`) still succeeds —
  confirms the iOS web bundle still assembles cleanly, even though there's no Mac to build the
  actual `.ipa` yet. See `docs/systems/ios-port.md`.

---

## Running Locally

```bash
npm install
npm start       # dev run
npm run dist    # build Windows portable → dist/
```

Window: right side of screen, always-on-top. Drag titlebar to reposition.
Save files: `%APPDATA%\Roaming\Cultivator Idle\` (Windows)
