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
Agent: iOS port — initial plumbing (Capacitor shell)
What was done:
  - Set up the Electron+Capacitor dual-shell split (Electron/PC untouched, Capacitor added alongside):
      · Created renderer/engine/platform-storage.js — window.electron fallback shim (localStorage-backed)
        that activates only when Electron's real contextBridge one isn't present. game.js / game-state.js
        call window.electron.* exactly as before; no changes needed there.
      · Wired it into renderer/index.html (script tag right before engine/game-state.js).
      · Created capacitor.config.json (appId com.cultivator.idle, webDir "www").
      · Created scripts/build-ios-web.js + npm run build:web — assembles www/ (gitignored, fully
        generated) from renderer/ + assets/, rewriting the "../assets/" sibling-dir path (Electron's
        on-disk layout) to "assets/" (required for a Capacitor webDir, which only bundles one folder).
        Verified it runs and produces a correct www/ tree.
      · Added npm scripts: build:web, cap:sync (build:web + cap sync ios), ios:open (+ cap open ios).
      · Created docs/systems/ios-port.md (full reference — read this before touching anything
        iOS/Capacitor-related) and added it to docs/index.md.
  - Confirmed via grep that window.electron is called from exactly 6 methods across game.js /
    game-state.js — all covered by the shim, nothing else Electron-specific in the renderer.
  - Did NOT touch main.js, preload.js, or anything under renderer/ or assets/ other than the one
    index.html script-tag insertion — PC/Electron build path is unaffected.
What was NOT finished / left for next session:
  - @capacitor/core, @capacitor/cli, @capacitor/ios are not installed in this repo yet, and the
    ios/ native Xcode project hasn't been generated — this dev sandbox has no package-registry
    network access. Needs to be run from a terminal with real internet access:
      npm install @capacitor/core @capacitor/cli @capacitor/ios --save-dev
      npx cap init "Cultivator Idle" com.cultivator.idle --web-dir=www
      npm run build:web
      npx cap add ios
  - renderer/styles.css is hard-coded to the 300px desktop-overlay width (-webkit-app-region: drag
    etc.) — iOS will currently render as a small fixed box, not full-screen. A real responsive/
    mobile-layout pass is needed but was deliberately deferred (separate from this plumbing work).
  - No CI/TestFlight pipeline yet — blocked on the Apple Developer account (in progress). Once
    that's active: cloud macOS CI (Codemagic free tier) building ios/ and pushing to TestFlight.
  - This repo's origin (github.com/LizardFromStateFarm/swordman) wasn't pushed to from this session
    — the dev sandbox this ran in has no network access to GitHub either. Local commit only; push
    needs to happen from a terminal with network access.
Next recommended task:
  - Run the capacitor install + cap add ios commands above (needs real internet access)
  - Then npm run ios:open to check it actually launches in Xcode/Simulator on a Mac
  - After that: either start the mobile-responsive CSS pass, or continue Phase 4 (Sect System) on
    PC and revisit iOS again in a few phases — see chat history for the reasoning on that tradeoff
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
- [ ] Update PLAN.md phase status (mark items done)
- [ ] Update START_HERE.md "Last Session" block
- [ ] Rebuild: `npm run dist`
