# START HERE — Cultivator Idle

**Read this first. Every session. Every agent.**

This is a desktop idle game where a wuxia cultivator lives on the side of the user's screen.
Built with Electron + vanilla HTML/Canvas. ASCII art animated sprites. No frameworks.

---

## Current Build State

| Thing | Status |
|-------|--------|
| Electron overlay window (transparent, always-on-top, draggable) | ✅ Done |
| Character select screen (3 save slots, delete/continue) | ✅ Done |
| Core idle loop (Qi accumulation, breakthroughs, techniques) | ✅ Done |
| 23 cultivation stages across 6 realms | ✅ Done |
| Animated ASCII sprite system with particle effects | ✅ Done |
| Random cultivation events (8 types) | ✅ Done |
| Auto-save per slot + offline Qi catch-up | ✅ Done |
| Windows portable build → `dist/Cultivator Idle-win32-x64/` | ✅ Done |
| Expedition / Combat / Crafting | ✅ Phase 2 |
| Breakthrough Integrity + Spiritual Beasts | ✅ Phase 3 |
| Sect system — join existing (5 sects, ranks, missions) | ✅ Phase 4 |
| Found own sect (buildings, disciples, income) | ✅ Phase 5A |
| Sect wars + alliances | ✅ Phase 5B |
| Member wars (joined sects go to war, you get pulled in) | ⬜ Phase 5C |
| QA sim harness (`npm run sim` → bot playtest report) | ✅ Tooling |
| Animation + Visual Overhaul (incl. window/layout modes) | ⬜ Phase 6 |
| Dao Paths, Reincarnation, Tribulation | ⬜ Phase 7–8 |
| Desktop notifications, tray, time-of-day | ⬜ Phase 9 |
| Birth Origin & Character Foundation | ⬜ Phase 12 |
| Alignment / Good vs Evil system | ⬜ Phase 13 |
| Body Constitution & Physical Tempering | ⬜ Phase 14 |
| NPC World Simulation (personalities, sects) | ⬜ Phase 15 |
| Marriage & Family system | ⬜ Phase 16 |
| Secret Realm Dungeons (ASCII map grid) | ⬜ Phase 17 |
| Lineage & Heir Inheritance | ⬜ Phase 18 |
| World Epochs & Spiritual Tides | ⬜ Phase 19 |
| Challenge Modes + Permadeath + Settings | ⬜ Phase 20 |
| Backpack & Inventory Tab (unified item/currency view) | ⬜ Phase 21 |
| Active / Idle Mode Toggle + Mid-Late Automation | ⬜ Phase 22 |

---

## Last Session — UPDATE THIS EVERY SESSION

```
Date: 2026-09-25 (session 2)
Agent: QA Sim Harness (tooling) + planned Phase 5C (Member Wars)
What was done:
  - Built scripts/sim/ — headless bot playtesting harness. `npm run sim` (full: active/casual/afk profiles ×
    50/100/200h × 3 seeds, ~16s on 16 cores, parallel worker processes) / `npm run sim:quick` (~1s).
    Loads the REAL game logic (data + game-state.js + game/*.js) into a Node vm with fake Date, seeded
    Math.random (deterministic: same seed = identical result) and in-memory window.electron. Bots only call
    public gameState methods. afk profile closes/reopens the game through the real save → initSlot() path.
  - Output: scripts/sim/out/report.md (~60 lines, AI-friendly) + report.json. Metrics: time to each realm
    and milestone, slowest stage-ups, dead zones, difficulty walls, fail streaks, hoarding, actions/hour,
    qi-capped %, wars W/L + % seen, unused features, invariants, exceptions, save round-trips, tick µs.
    `--set="CONST=value"` tries balance changes without editing data files. Exit 1 on health failures.
  - Docs: docs/systems/qa-sim.md (new), docs/index.md, CLAUDE.md (tree + balance rule), PLAN.md (Tooling
    entry + new Phase 5C "Member Wars" plan, per user request), package.json scripts, .gitignore (sim out/).
  - Verified: npm test (syntax) passes; full suite runs; determinism checked; --set, --path=member,
    bad-override error path all checked.
FIRST FINDINGS from the harness (nothing below has been fixed — balance/bug work for next session):
  - BUG: assets/data/events.js:74 'heavenly_lightning' does `qi + qiCap*0.25`; at Ascension qiCap=Infinity
    → s.qi = Infinity. This is why `npm run sim` currently exits 1 (non_finite_number violation).
  - Pacing is far too fast: active player reaches Ascension in ~2h, casual (checks every 30m) ~24h,
    afk ~58h; after that nothing new for the rest of the run (content-exhausted + huge dead-zone flags).
    Technique multipliers stack to ~19× (×3 meditating) vs. stage caps from Foundation Building on.
  - Economy: active hoards ~47k Spirit Stones by 200h, casual ~28k — nothing to spend on late game.
  - afk players never found a sect in 200h: stone income ~2.5/h and they sit just under the 500 cost.
  - Founding needs stage 18 but void_crystal only drops at void_rift (stage 19) → founding really gated at 19.
  - Beast taming talisman needs beast_core (only early zones) → late players must backtrack to tame.
  - Casual players see only ~50% of sect wars (15-min scouting+prep window vs 30-min check-ins).
  - weapon_soul_spear (expedition_power) / weapon_thunder_staff (enemy_hp_reduce) effects aren't read by any
    logic — dead items. artifact_void_compass only reveals locked locations in the Explore UI (game.js:779).
What was NOT finished / left for next session:
  - None of the balance findings above are fixed. This session's harness + doc changes are uncommitted (ask before committing).
  - sim:quick is NOT wired into `npm run release` yet (it would fail until the Infinity bug is fixed).
  - No Playwright UI-level pass, no LLM-driven bot policy tier (both documented as next tiers in qa-sim.md).
  - npm run dist / build:web not re-run: no renderer/ or assets/ files changed this session.
Next recommended task:
  - Fix events.js:74 (clamp when qiCap is Infinity), then a pacing pass driven by `npm run sim` (use --set
    first; target e.g. casual Ascension ≫ 24h, no dead zone > 3h for casual).
  - Then Phase 5C Member Wars (PLAN.md) — add member-war behaviour to the sim bot at the same time.
```

**When you finish a session, update this block** — date, what you did, what's next.
This is the only way the next agent knows where to pick up.

---

## Navigation — Where Is Everything

```
START_HERE.md          ← You are here. Update at end of every session.
CLAUDE.md              ← Dev rules: architecture, asset pipeline, doc rules
PLAN.md                ← Full feature roadmap with implementation detail
GAMEDESIGN.md          ← Game design doc (mechanics, pacing, lore style)
AGENT_DEV_SYSTEM.md    ← Portable dev system template (copy to new projects)
docs/
  index.md             ← System doc index + new-doc template
  systems/
    core-loop.md       ← Qi, stages, roots, breakthroughs, techniques
    expedition.md      ← Expedition timer, inventory, drops (Phase 2)
    crafting.md        ← Recipes, equipment, pills, elixirs (Phase 2)
    integrity.md       ← Realm Integrity, Spiritual Beasts (Phase 3)
    sects.md           ← Sect join/rank/missions/bonuses (Phase 4)
    own-sect.md        ← Found a sect: buildings, disciples, income (Phase 5A)
    sect-war.md        ← Sect wars (Phase 5B; 5C Member Wars planned)
    qa-sim.md          ← QA sim harness — `npm run sim`, report flags, extending the bot
    ui-layout.md       ← Window layout, tab pattern, CSS vars
.agents/rules/
  general.md           ← Always-on rules (docs, style, Electron security)
  assets.md            ← ASCII art pipeline (create → review → gate ≥8.0)
  game-design.md       ← Design rules (pacing, flavor text, event structure)

scripts/sim/           ← QA sim harness (bots play real logic headless → scripts/sim/out/report.md)
main.js                ← Electron window, IPC handlers, slot save/load
preload.js             ← contextBridge — only way renderer talks to Node
renderer/
  index.html           ← All HTML. #charselect shown first, #app hidden until slot picked
  styles.css           ← All CSS. CSS vars at top. Add new UI components here.
  game.js              ← Boot: charselect → slot select → game loop + all UI wiring
  engine/
    game-state.js      ← ALL state mutations go here. _newGame(), _recalc(), tick()
    ascii-renderer.js  ← Canvas renderer: sprites + particle system + aura rings
  game/
    cultivation.js     ← Random event scheduler (fires every 30–120s)
    expedition.js      ← ExpeditionSystem — tick-based expedition resolution
    crafting.js        ← CraftingSystem — thin wrapper for craft/equip/pill/elixir
    beasts.js          ← BeastSystem — tick-based beast expedition resolution (Phase 3)
    sect.js            ← SectSystem — sect mission timers (Phase 4)
assets/
  data/
    stages.js          ← CULTIVATION_STAGES[23] — every layer of the cultivation path
    techniques.js      ← TECHNIQUES — learnable martial arts
    events.js          ← RANDOM_EVENTS — world event pool
    items.js           ← ITEMS — all collectable/craftable item types (incl. Phase 3 talisman)
    locations.js       ← LOCATIONS — expedition destinations + drop tables
    enemies.js         ← ENEMIES — tier definitions
    recipes.js         ← RECIPES — all crafting recipes (incl. Phase 3 talisman recipe)
    beasts.js          ← BEAST_TYPES + BEAST_TRAITS — spiritual beast definitions (Phase 3)
    sects.js           ← SECTS + SECT_RANKS + SECT_MISSIONS (Phase 4)
    sect-buildings.js  ← Own-sect founding/buildings/disciple constants (Phase 5A)
  sprites/
    cultivator-sprites.js  ← CULTIVATOR_SPRITES — all animated ASCII frames
    beast-sprites.js       ← BEAST_SPRITES — spirit fox, thunder eagle, void hound (Phase 3)
```

---

## How to Run

```bash
npm install          # first time only
npm start            # launch the overlay window
npm run dist         # build Windows portable .exe → dist/
```

Window opens on the right side of screen. Drag title bar to reposition.
Save files: `%APPDATA%\Roaming\cultivator-idle\` (Windows)

---

## Key Architecture Rules (quick ref — full rules in CLAUDE.md)

1. **State lives in `game-state.js` only.** Never mutate `_s` from outside it.
2. **Data files are data only.** No logic in `assets/data/`.
3. **No Node in renderer.** All Node access via `preload.js` contextBridge.
4. **New sprites → Asset Pipeline first.** Minimum score 8.0/10. See `.agents/rules/assets.md`.
5. **New state fields** → add to `_newGame()` AND handle in `_recalc()`.
6. **Documentation is implementation.** Update START_HERE.md, PLAN.md phase status,
   and relevant data file comments as part of every task — not after.

---

## Adding a New System — Checklist

- [ ] Read the relevant Phase section in `PLAN.md`
- [ ] Add data to `assets/data/<system>.js` (new file if needed)
- [ ] Add state fields to `game-state.js` → `_newGame()` + `_recalc()`
- [ ] Add logic to `renderer/game/<system>.js` (new file if needed)
- [ ] Wire into `renderer/game.js` boot + tick
- [ ] Add UI to `renderer/index.html` + `renderer/styles.css`
- [ ] If new sprites needed: run Asset Pipeline (`.agents/rules/assets.md`)
- [ ] If you touched `window.electron.*`: update BOTH `preload.js`/`main.js` and
      `renderer/engine/platform-storage.js` (see `docs/systems/ios-port.md`)
- [ ] Update PLAN.md phase status (mark items done)
- [ ] Update START_HERE.md "Last Session" block
- [ ] Rebuild: `npm run dist` (PC) and `npm run build:web` (confirms iOS web bundle still assembles)
- [ ] Or just run `npm run release` — does the syntax check, `npm run dist`, `npm run build:web` +
      `cap sync`, and commits/pushes in one go once everything passes. See `scripts/release.js`.
