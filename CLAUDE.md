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
UX:         [player-facing tasks: where it's surfaced, where it's interacted with, how it's discovered,
             layout modes checked, UX debt found — from the UX Pass; else "n/a"]
Review:     [visible change? → "visual review gate: <what gets screenshotted, which modes>"; else "n/a"]
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
6. **Agency: the player's own decisions are never simulated** (user rule, 2026-09-26). NPCs and the world may act on
   timers and rolls (a spouse's reaction, a head's verdict, an heir's reign), but anything that is *the player's*
   choice (who to court, whether to have a child, how to raise one, ending an affair, what to do in a fight) must
   be an explicit choice the player makes, never a timer, a drift, or a hidden roll deciding for them. A coarse
   setting (like None/Some/Many) may stand in only for chores the player explicitly delegated, and it must stay
   overridable per case. List every player decision the feature makes on its own and turn each into a choice.

If the user asks for one mechanic, propose 2–3 connected ones alongside it. Example of the expected depth:
marriage (Phase 16-lite) → spouse affection, personality-driven marriage events, affairs, discovery reactions
ranging from acceptance to a duel to the death — see `docs/systems/family.md`.

---

## ══ UX PASS (REQUIRED for any player-facing task) ══

UI and player experience are a **first-class deliverable, not a wrapper around the mechanic** (user rule,
2026-09-26). A deep system the player can't see, understand, or reach is a failed feature. The game already has
many systems whose state the player can barely read or act on. Every task must leave the UI better, not just
add more to it. Before building, write a **"UX pass"** into the spec/plan and show it to the user:

1. **Surface.** Where does the player *see* this system's state: numbers, odds, timers, relationships, and
   **why** something happened? Hidden state gets a visible explanation: a tooltip, a breakdown ("BT chance 62% =
   base 50 + root 8 + pill 4"), or a log line that names the cause. No silent mechanics.
2. **Interact.** Where does the player *act* on it, and in how many clicks? Don't cram new controls into the small
   bottom tab strip of Overlay mode. Design for the roomier layouts (Expanded/Desktop, Phase 6E) first, then make
   sure it degrades cleanly to Overlay (300px) and to a phone (Rule 7).
3. **Discover.** How does the player learn it exists or needs attention? Options: a first-time hint, a toast, a
   badge or dot on the tab, a highlighted button. A choice the player never notices is not a choice.
4. **Feel.** Keep the ethereal, xianxia-novel style: use the CSS tokens (`--gold`, `--jade`, `--purple`…), write
   flavorful labels, and animate meaningful moments. Readability beats density. Honor the ⚙ text-size and
   color-blind settings.
5. **UX debt.** List any existing UX gaps you noticed in systems you touched (e.g. "no UI to pick the Family
   Manual"). Fix them if they're small; otherwise add them to START_HERE.md → "UX Debt" so they aren't lost.

For UI work, **launch the app and look at it** (`npm start`, or a CDP screenshot) before calling it done. Check
every layout mode the change affects. Reference: `docs/systems/ui-layout.md`.

---

## ══ VISUAL REVIEW GATE (MANDATORY for UI changes and assets) ══

Every **UI change** (screens, tabs, panels, overlays, menus, layout modes, components, any CSS the player would
see) and every **visual asset** (sprites, animations, palettes, color tokens) is scored **0–10 by a separate
reviewer agent** from real screenshots. The author never grades their own work (user rule, 2026-09-26).

- **Scale (reference class = mobile indie idle games — this game's genre, not AAA or a generic web app):**
  0 = garbage/broken · 2 = works but ugly · 4 = plain developer UI · 6 = below par ·
  **7.5 = average for a mobile indie idle game — the UI pass bar** · **8 = above average** ·
  **9 = extremely good, better than most/all indie idle games** · **10 = perfect, better than any idle game's UI**.
- **How:** screenshot the change in the real app in every layout mode it appears in (smoke scenario + `shot()`), spawn
  **one fresh** reviewer agent per cycle (sequentially, never several at once) with the prompt **plus the Reviewer
  brief verbatim** from `.agents/rules/ui-review.md`, and apply its **blockers**.
- **Label issues `[blocker]` / `[polish]`.** Only `[blocker]` fails a review (broken, unreadable, unusable,
  overlapping, regressed, a missing lock reason); `[polish]` is logged as UX debt. Reviewers get the brief (art
  direction + a "settled / do not re-raise" list) and the previous cycle's result, so they don't contradict each other.
- **Gate (UI):** average **≥ 7.5, no criterion below 6, and no open `[blocker]`** → done; record it in
  `docs/systems/ui-review.md` and put a `/* UI review: X.X (date) */` comment on the CSS section. Otherwise fix →
  re-screenshot → re-review with a fresh agent. After 3 cycles, show the user the screenshots + scores and let them decide.
- Sprites and other assets use the Asset Pipeline below, on this **same scale but their own gate: ≥ 8.0**.

---

## Project Structure

```
START_HERE.md           ← Session entry point — update at end of every session
CLAUDE.md               ← You are here — dev rules
PLAN.md                 ← Phase roadmap with implementation detail
GAMEDESIGN.md           ← Mechanics, pacing, lore style
docs/
  index.md              ← System doc index + new-doc template
  commands.html         ← Human quick reference: npm dev/test/sim-bot/smoke/build/Android commands (keep in sync with package.json scripts)
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
    art-engine.md       ← Hybrid ink art engine (A3-1): InkRenderer + SpriteRenderer switch, INK_ART format, Sprite art setting
    icons.md            ← UI icon set (1.8d): Icon() helper, icon list, emoji/chrome-CJK replacement status
    ui-layout.md        ← Window layout + layout modes (6E), tab pattern, CSS vars, UX Audit (1.8a)
    ui-review.md        ← Visual Review Gate score history (every UI change + asset, 0–10; UI passes ≥ 7.5, assets ≥ 8.0)
    notifications.md    ← System tray + opt-in desktop notifications (Phase 9A-B)
    life-loop.md        ← M2 build spec: lifespan, heirs, Ancestral Hall, clan legacies (Phases 30/31)
    family.md           ← Spouse affection, marriage/crisis events, duel, lovers + affair discovery (Phase 16-lite+), family agency: courtship, spouse/child actions, "Ask me" wishes (1.8b-3a)
    clan-succession.md  ← SPEC (M2 2.6a–f): world/life split, heirs as NPCs, rebirth as descendant, tournaments, branch wars
    backpack.md         ← Pack tab: item category field, filters/sort, Use/Equip/Discard (Phase 21)
    automation.md       ← Active/Idle Mode + staged automation unlocks, Active Mode bonuses (Phase 22)
    combat.md           ← SPEC (Phase 35): battle page, fight card generalized to beasts/duelists/arena/bosses
    auction.md          ← SPEC (Phase 36): themed crates, beast/person quality rolls, person `gender`
    scene-art.md        ← SPEC (Phase 38): large-area sect-base + island scenes (view-only, grow as you build)
    soul-points.md      ← Phase 40 (v1 finish): cross-save Soul Points + Soul Resonance + Soul screen (40a) · Immortal Ascension cinematic + finish screen (40b)
    android-port.md     ← Capacitor Android shell + `npm run release:android` → Google Play internal testing
.agents/rules/
  general.md            ← Always-on rules (code style, Electron security)
  assets.md             ← ASCII art pipeline (create → review → gate ≥8.0)
  game-design.md        ← Design rules (pacing, flavor text, event structure)
  ui-review.md          ← Visual Review Gate: 0–10 scale, Reviewer brief (art direction + settled list), reviewer prompt, [blocker]/[polish] labels, gate (UI ≥ 7.5; assets ≥ 8.0)

main.js                 ← Electron window, IPC, slot save/load, cross-save soul.json (Phase 40), system tray + notifications (Phase 9A-B), layout-mode geometry (6E)
preload.js              ← contextBridge — only way renderer talks to Node
capacitor.config.json     ← Capacitor (iOS + Android) config — webDir "www"
ios/                    ← Capacitor iOS Xcode project — committed (minus generated public/); see ios-port.md
android/                ← Capacitor Android Gradle project — committed (minus generated output); see android-port.md
scripts/
  build-ios-web.js      ← Builds www/ (gitignored) from renderer/ + assets/ for Capacitor (both platforms)
  release-android.js    ← `npm run release:android` → build .aab + push to Google Play (see android-port.md)
  gen-tray-icon.js      ← One-off generator for assets/icons/tray-icon.png (Phase 9A, not run at boot)
  art-bakeoff/          ← A2 art-direction prototype page (3 renderers, same cultivator) — not part of the game
  art/ink-shapes.js     ← Ink art authoring helper: limb centreline / tapering Bezier / `sym` half → part `d` polygon (paste into assets/sprites/ink-*.js)
  art/ink-bake.js       ← Bake a source picture → editable dot map PNG (1 px = 1 dot, background removed): `npx electron scripts/art/ink-bake.js [id]`
  art/ink-bake.json     ← Bake specs per beast (src, crop, width, background-removal knobs, erase/keep polygons)
  check-no-emoji.js     ← Emoji inventory (file:line); --strict in npm test (sprites included since A4-4) — no-emoji rule
  check-no-chrome-cjk.js ← Chrome-CJK lint for renderer/ (allow: nav marks, `cjk-ok` flavour lines); --strict runs in npm test (1.8d-2)
  sim/                  ← QA sim harness (`npm run sim`) — bots play real game logic headless → report.md
    run.js · loader.js · bot.js · metrics.js · report.js · profiles.js · rng.js · USAGE.txt
    checks/             ← Scenario checks (`npm run checks`) — force exact situations, print ok/FAIL; run-all.js + one file per system
  smoke/                ← Real-app smoke tests over CDP: cdp.js driver + scenarios/*.js (screenshots → smoke/out/, gitignored)
example_art/            ← The user's own source art for the bake pipeline (reference + bake input; not loaded by the game)
renderer/
  index.html            ← All HTML — charselect + app, 7 tabs
  styles.css            ← All CSS — CSS vars at top, add new components here
  game.js               ← Boot, tick loop, all UI wiring and render functions
  engine/
    platform-storage.js ← window.electron fallback (Capacitor/browser) — see docs/systems/ios-port.md
    persons.js          ← Persons — shared root/personality/name generators + Person record schema (Phase 30/31, M2 task 2.2)
    game-state.js       ← ALL state mutations — _newGame(), _recalc(), tick()
    ascii-renderer.js   ← Canvas renderer — sprites + particles + aura rings (classic grid ASCII)
    ink-renderer.js     ← InkRenderer — hybrid ink art engine (A3-1): cached ink-dot layers + brush strokes + clean effects; `bare` = figure only (40b)
    ascension-cinematic.js ← AscensionCinematic — the ~9 s full-window Immortal Ascension (storm, bolts, rise, heavenly gate, flash) (Phase 40b)
    sprite-renderer.js  ← SpriteRenderer — picks Classic ASCII or Ink per the Sprite art setting + available INK_ART
    scene-renderer.js   ← SPEC (Phase 38): large-area scene layer (sect base / island) on the hybrid engine
  game/
    cultivation.js      ← Random event scheduler (fires every 30–120s)
    expedition.js       ← ExpeditionSystem — tick-based expedition resolution
    crafting.js         ← CraftingSystem — thin UI wrapper for craft/equip/pill/elixir
    sect.js             ← SectSystem — resolves timed sect missions (Phase 4)
    sect-war.js         ← SectWarSystem — advances the sect war state machine, own + member wars (Phase 5B/5C)
    settings.js         ← SettingsUI — ⚙ overlay rendered from SETTINGS_DEFS + applies prefs (Phase 20C, UI only)
    banter.js           ← BanterSystem — picks lines on game events + idle timer, DOM-free (Phase 29)
    notifications.js    ← NotificationSystem — opt-in desktop notification triggers + cooldowns, DOM-free (Phase 9A-B)
    layout.js           ← LayoutUI — window layout modes: layout picker, body[data-layout], canvas sizing, banner peek (Phase 6E)
    banner-menus.js     ← BannerMenus — banner strip quick-action dropdowns: missions/explore/craft/learn (1.7b)
    nav.js              ← NavUI + NAV_GROUPS — six nav groups → sub-tab views, badges, automation chip (1.8b-1)
    attention.js        ← collectAttention() (DOM-free) + AttentionUI — the "needs you" strip/cards (1.8b-1)
    breakdowns.js       ← buildBreakdown() (DOM-free) + BreakdownUI — "why" popovers for any [data-bd] number, stageShortName() (1.8b-2)
    beast-portrait.js   ← BeastPortraits — pooled animated ink beast portraits for Roam → Beasts (ASCII fallback on Classic) (A4-2)
    beast-detail.js     ← BeastDetail — beast details page: click a portrait/name → large portrait, lore, stats, traits, Tame (A4-2)
    family-view.js      ← FamilyView — Kin → Family: spouse/courtship card, child wishes, children + raising actions, heir (1.8b-3a)
    clan-view.js        ← ClanView + HallView — Kin → Clan (lines, head, relations, clan actions) and Kin → Hall (Merit, firsts, legacies, Family Manual picker) (1.8b-4)
    soul-view.js        ← SoulView — the cross-save Soul screen overlay (charselect button, Kin → Hall door, attention item, Relive) (Phase 40a)
    immortal-view.js    ← ImmortalView — plays the cinematic, then the finish screen ("your race to immortality") / later-Immortal card (Phase 40b)
    sect-view.js        ← SectView — 宗 Sect sub-views: Overview · Missions · War (joined) / Overview · Halls · Disciples · War (founded) / join list + founding (none) (1.8b-5)
    icons.js            ← Icon(name) → inline SVG from assets/icons/ui-icons.js; Icon.g() for glyph slots; [data-icon] auto-filled (1.8d)
    combat.js           ← SPEC (Phase 35): the battle page UI (animated exchanges) over the fight card
    base-view.js        ← SPEC (Phase 38A): Sect Base view — the large sect-compound scene
assets/
  icons/
    tray-icon.png       ← System tray icon (Phase 9A) — see scripts/gen-tray-icon.js
    ui-icons.js         ← UI_ICONS — the custom UI icon set (1.8d): monochrome `currentColor` line-art SVG bodies (replaces emoji + chrome CJK)
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
    family.js           ← Affection, MARRIAGE_EVENTS / crisis, duel + affairs, AFFAIR_REACTIONS, CHILD_EVENTS, PERSONALITY_MORALITY, COURT_BEATS + spouse/child actions (1.8b-3a)
    succession.js       ← M2 2.6d: parenting styles, heir bet, reign/rebirth weights, rival rebirth, chronicle text, UPBRINGING_EVENTS
    automation.js       ← Active/Idle mode default, automation unlock thresholds, Active Mode bonus constants (Phase 22)
    settings.js         ← SETTINGS_DEFS — ⚙ panel options, defaults, validation ranges (Phase 20C)
    personalities.js    ← PERSONALITIES (14) + banter triggers/tuning constants (Phase 29)
    banter-lines.js     ← BANTER_LINES — 1,753 lines, personality × trigger + generic pool (Phase 29)
    names.js            ← SURNAMES (60) + GIVEN_NAMES (205) — pinyin, gender-neutral (Phase 30/31, M2 task 2.2)
    soul.js             ← SOUL_* — Soul Points grants + Soul Resonance rank cost/bonus/cap (Phase 40a)
    dev-presets.js      ← DEV_PRESETS — late-game test characters, shown on charselect only in `npm start`
    crates.js           ← SPEC (Phase 36): CRATES — themed crate costs + weighted contents (item/beast/person)
    arena.js            ← SPEC (Phase 35): arena ladder tiers, stakes, duelist pools
  sprites/
    cultivator-sprites.js ← CULTIVATOR_SPRITES — animated ASCII frames + colors
    ink-cultivator.js   ← INK_ART — hybrid ink art base figure (body parts, strokes, effects, default slots); Qi Condensation so far
    ink-parts.js        ← INK_PARTS — ink part slots: face / hair / robe / weapon / aura options (A3-2; Phase 10 cosmetics hook)
    ink-beasts.js       ← INK_BEASTS — spirit beasts (fox / eagle / hound): `raster` dot maps + motion regions + effects (A4-2)
    beasts/             ← Baked dot maps (<id>.png, 1 px = 1 dot) from scripts/art/ink-bake.js — hand-editable in a pixel editor
  scenes/
    sect-base-scene.js   ← SPEC (Phase 38A): sect-compound building parts + layout (data only)
    island-scene.js      ← SPEC (Phase 38B): island landmass + building tiles (data only)
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

**Covered:** new sprite states, color palettes, UI color tokens, multi-frame animations. Scored on the
anchored 0–10 scale of the Visual Review Gate above (0 garbage … 10 "can't believe it's ASCII art"), by a separate
reviewer agent, never the creator.

**Step 1 — Create** using the prompt template in `.agents/rules/assets.md`.

**Step 2 — Review** immediately after creation using the review prompt in `.agents/rules/assets.md`.

**Step 3 — Gate**
- Average ≥ 8.0 → add to file with comment `// Review score: X.X`
- Average < 8.0 → revise failing criteria, re-run Step 2
- 3 cycles at < 8.0 → present both versions to user

---

## Game Design Rules

- Numbers should feel satisfying to watch grow — use `fmt()` to keep them readable
- **No emoji, ever** (user rule, 2026-09-26): not in UI, sprites, canvas art, data, or log text. Emoji render as
  full-color platform images that break the ink-and-glyph look (Chromium even draws ⚡ ☯ as color emoji on the
  canvas). If a symbol has an emoji-default presentation, don't use it.
- **UI icons come from the custom SVG icon set**, not from CJK or box/line characters (user rule, 2026-09-27 — this
  is a US App Store release, and scattered Chinese glyphs read as clutter). Draw icons from
  `assets/icons/ui-icons.js` via `Icon()` in `renderer/game/icons.js`; the set is monochrome `currentColor` line-art
  in the ink/gold palette. **CJK is reserved for exactly two things: the six nav group marks (修 歷 家 宗 囊 錄) and
  deliberate in-world flavour** (a cultivation term, a sect's `nameCN` shown as content) — never as UI chrome.
  (1.8d built the set and purged chrome CJK; `npm test` runs `check-no-chrome-cjk.js --strict`. Deliberate flavour in
  renderer/ code needs a `cjk-ok` comment on its line.)
- **Sect base & Immortal Island scenes are view-only art** (user rule, 2026-09-27): the large landscape diorama
  (Phase 38A) and top-down island map (38B) reflect your buildings and visibly upgrade as you build, but
  building/upgrading still happens in the existing rows — the scene never becomes a placement UI. Scene parts and
  the whole composite follow the Visual Review Gate (≥ 8.0).
- Every cultivation stage must have a matching `spriteState` in `CULTIVATOR_SPRITES`
- Breakthrough chance must never exceed 0.98
- New `RANDOM_EVENTS` must have both positive and negative variants
- Flavor text should read like a xianxia novel translation
- Balance tuning happens in the **QA & Balance task** at the end of a feature (see Documentation Rules), not
  in every task. When a task *is* a balance change, run `npm run sim` before AND after, read only
  `scripts/sim/out/report.md`, and try values with `--set` first. The sim bot learns new systems during that
  feature's QA & Balance task (see `docs/systems/qa-sim.md`).

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

You don't have to write a new check for **every** task (see below). The heavy check-writing happens in the
feature's QA & Balance task. The rule above is about *not throwing away* a useful script once you've written one.

### A task is NOT done until (lightweight bar, user rule 2026-09-26)

Per-task testing is kept light on purpose. Spend the time on the feature and its UX instead.
- The code works: you ran it. For UI work, you launched the app and looked at it in each affected layout mode.
- `npm test` (syntax) and `npm run checks` (existing scenario checks, ~6s) pass. These are cheap guards against
  save/state breakage, not a request for new tests.
- `START_HERE.md` is updated
- `PLAN.md` reflects the new state
- Relevant system doc is current
- The UX Pass was done for player-facing work, and any leftover UX debt is logged in START_HERE.md
- Visible changes passed the **Visual Review Gate** (UI: average ≥ 7.5, no criterion < 6, no `[blocker]`, from a fresh
  reviewer agent, recorded in `docs/systems/ui-review.md`; assets: ≥ 8.0), or the user accepted them after 3 cycles

**Not required per task** (these move to QA & Balance): `npm run sim`, `npm run dist`, `npm run build:web`, CDP
smoke scenarios, writing new scenario checks, teaching the sim bot, balance tuning. Do run one of them anyway
when your change clearly risks exactly that thing: `build:web` after touching `platform-storage.js`/`main.js`
IPC, `dist` after touching packaging, the sim after touching save migration or offline catch-up.

### QA & Balance task: one per large feature / milestone

When a large feature or group of tasks is complete (e.g. a whole roadmap task like 2.6 or 2.7, the UI overhaul,
or a milestone), PLAN.md gets a dedicated **QA & Balance** task, done as its own session:
- Full `npm run sim` (multi-seed) with before/after comparison, and a tuning pass against the doc's targets
- Scenario checks written for the feature's rules and edge cases (`scripts/sim/checks/`); teach the sim bot the
  new systems; add sim invariants
- `npm run dist` + `npm run build:web` succeed; CDP smoke scenario for the new UI (zero console errors)
- A **UX walkthrough**: play the feature in every layout mode. Is every state visible and explained, every
  action reachable, every choice noticeable? Fix it or log it as UX debt.
- Update the system docs' "as-built / verified" notes
M2 task 2.8 is the model for this.

---

## Running Locally

```bash
npm install
npm start       # dev run
npm run dist    # build Windows portable → dist/
```

Window: right side of screen, always-on-top. Drag titlebar to reposition.
Save files: `%APPDATA%\Roaming\Cultivator Idle\` (Windows)
