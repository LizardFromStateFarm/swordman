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
| Sect system | ⬜ Phase 4–5 |
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

---

## Last Session — UPDATE THIS EVERY SESSION

```
Date: 2026-09-25
Agent: iOS port — process/docs update + release pipeline scaffolding
What was done:
  - Updated house rules so future agents don't accidentally break the iOS shim while adding
    game features:
      · CLAUDE.md — new Architecture Rule #7: window.electron.* changes must update BOTH
        preload.js/main.js AND renderer/engine/platform-storage.js together; warns against adding
        new desktop-window-only CSS assumptions. Also added an iOS-web-bundle check to the
        "A task is NOT done until" list.
      · START_HERE.md "Adding a New System" checklist — added the same platform-storage.js
        reminder, plus points at `npm run release` as the one-command way to validate + ship.
      · Rewrote docs/systems/ios-port.md — now documents the actual state (ios/ exists, Capacitor
        packages really installed), the release pipeline, and the CI setup checklist.
  - Built the release pipeline an agent can just run:
      · scripts/check-syntax.js (npm test) — node --check over every first-party .js file
        (skips node_modules/dist/out/www/ios). 23 files, passing.
      · scripts/release.js (npm run release) — chains: npm test -> npm run dist (Windows build)
        -> npm run cap:sync (iOS web bundle sync) -> git commit+push (only if something changed
        and everything above passed; pushes gracefully degrade to "commit succeeded, push it
        yourself" if run somewhere without network) -> triggers the Codemagic iOS build via its
        REST API, but ONLY if CODEMAGIC_API_TOKEN + CODEMAGIC_APP_ID are set — a clean no-op until
        then, not an error.
      · codemagic.yaml — the actual CI workflow definition (macOS runner, builds ios/, publishes
        to TestFlight via App Store Connect integration "cultivator_idle_asc"). Deliberately has no
        automatic push-triggers — only scripts/release.js's API call starts it, so CI minutes
        aren't spent on every commit. NOT ACTIVE — see "what's left" below.
  - Recap of last session's actual iOS scaffolding (already pushed): ios/ Xcode project exists
    (Capacitor 8, Swift Package Manager, no CocoaPods), @capacitor/core+cli+ios are real installed
    devDependencies. Also documented: this machine's NODE_ENV=production silently makes npm skip
    devDependencies (bit us once already — always `npm install --include=dev` here).
What was NOT finished / left for next session:
  - Apple Developer Program enrollment still pending Apple's approval — this blocks literally
    everything CI/TestFlight-related below. Nothing to do here but wait.
  - Once approved: register the app in App Store Connect (bundle ID com.cultivator.idle), create
    an App Store Connect API key, set up a Codemagic account + connect this repo + add the
    App Store Connect integration (name it "cultivator_idle_asc" or edit codemagic.yaml to match),
    and set CODEMAGIC_API_TOKEN / CODEMAGIC_APP_ID env vars wherever `npm run release` runs. Full
    step list in docs/systems/ios-port.md's "CI / TestFlight" section.
  - codemagic.yaml is a template — never actually run yet (no Codemagic account exists), so treat
    the first real run as a debugging pass, not a sure thing.
  - The responsive/mobile CSS pass (300px-fixed layout) is still not started — still the biggest
    real remaining port work, independent of the CI blocker.
Next recommended task:
  - Nothing iOS-side can move until the Apple Developer account clears — go back to Phase 4
    (Sect System) on PC in the meantime; docs/systems/ios-port.md + CLAUDE.md Rule #7 mean that
    work is safe to do without derailing the iOS port
  - When the Apple account clears: work through the CI checklist above, then try `npm run release`
    for real and see what breaks
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
    ui-layout.md       ← Window layout, tab pattern, CSS vars
.agents/rules/
  general.md           ← Always-on rules (docs, style, Electron security)
  assets.md            ← ASCII art pipeline (create → review → gate ≥8.0)
  game-design.md       ← Design rules (pacing, flavor text, event structure)

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
