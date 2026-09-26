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
Date: 2026-09-25 (session 4)
Agent: Merge sim/pacing work to main + economy pass (Spirit Stones) — repo is in a clean HANDOFF state
What was done:
  - Sessions 2–3 (QA sim harness, Infinity fix, Qi pacing pass) merged to main. This session's economy pass
    is also on main. Nothing pushed to the remote — push when you're ready.
  - Harness: Spirit Stone ledger (every stone attributed to a source/sink, self-checked each run), Economy
    report section + flags (hoarding vs income, war-loss "tax", one-faucet economy). Bot buys war boosts only
    at ≥3× cost.
  - Economy findings: disciples were ~90% of all income (~1,100/h); war defeats (15% of bank) were ~80% of all
    outflow → two-speed economy with a wealth tax instead of player choices; afk players never founded a sect.
  - Numbers changed (all tagged "economy pass 2026-09-25" in the data files):
      sect-buildings.js  DISCIPLE_STONE_RATE 0.003→0.0004, DISCIPLE_HERB_RATE 0.0015→0.0002,
                         SECT_FOUNDING.minStage 18→19 (void crystals first drop at 19)
      sect-war.js        WAR_LOSS_RESOURCE_FRAC 0.15→0.08; reinforce fame×0.5→×2; ally 50+fame×0.3 → 100+fame×1
      sects.js           Escort / Subdue Demon / Retrieve Artifact now also pay Spirit Stones
      techniques.js      Celestial Orbit 150→600 (cheaper stones had pulled it earlier and broke FB pacing)
  - Result (casual, 200h): bank 31k→6k, stones spent by choice 12k→32k, war losses 137k→15k. Active bank 47k→4k.
    afk founds a sect at ~132h (never before). Qi pacing still inside every GAMEDESIGN band.
  - Docs: qa-sim.md, sects.md, sect-war.md, own-sect.md, PLAN.md.
  - Verified: npm test, npm run sim (healthy, 135 save round-trips, ledger balanced), build:web, dist.

CURRENT BASELINE (npm run sim, 200h medians — a regression if yours differ without a reason):
  Ascension: active ~11h · casual ~56h · afk ~140h.  Found sect: 6.7h · 33h · 132h.
  Casual income ~290 stones/h late game, bank ~6k.  Health: 0 errors, 0 violations.

READY FOR DEV WORK — how a new agent should start:
  1. Read START_HERE.md (this) + CLAUDE.md; load only the docs/systems/*.md for the system you touch.
  2. `npm test && npm run sim:quick` → both must pass before you change anything (≈5s total).
  3. For balance work, or any new system that touches Qi/stones: `npm run sim` before AND after, read only
     scripts/sim/out/report.md, try values with --set first. Teach scripts/sim/bot.js to use any new system
     (docs/systems/qa-sim.md → "Extending") or the sim can't see it.

Open design gaps the sim still flags (numbers can't fix these):
  - Nothing to do after Ascension → long dead zones for every profile (Phases 7–8).
  - Casual players see ~50% of sect wars and afk ~0% (15-min scout+prep window), so they rarely use the war-prep
    stone sink and still bank ~6k / ~3.5k. Fix via Phase 5C design, Phase 9 notifications, or a longer window.
  - weapon_soul_spear (expedition_power) / weapon_thunder_staff (enemy_hp_reduce): effects nothing reads.
Next recommended tasks (pick one):
  - Phase 5C Member Wars (PLAN.md) — user-requested; also the natural place to fix the war-window gap.
  - Phase 6 Animation & Visual Overhaul, or Phase 7 (post-Ascension content — biggest sim flag).
  - Optional: add `npm run sim:quick` as a gate in scripts/release.js (it's healthy now; ask the user first).
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
