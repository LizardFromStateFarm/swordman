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
Date: 2026-09-24
Agent: Phase 3 implementation
What was done:
  - Implemented Phase 3A (Realm Integrity) and Phase 3B (Spiritual Beasts) in full
  - Created docs/systems/integrity.md — system reference doc
  - Created assets/data/beasts.js — BEAST_TYPES (3 types) + BEAST_TRAITS (6 traits)
  - Created assets/sprites/beast-sprites.js — 3 beast sprites (Spirit Fox 8.2, Thunder Eagle 8.4, Void Hound 8.6) — all pass Asset Pipeline
  - Updated assets/data/items.js — added beast_taming_talisman; updated pill_heart_calming to include integrity_restore: 30
  - Updated assets/data/recipes.js — added talisman recipe (category: talismans)
  - Updated renderer/engine/game-state.js:
      · _newGame(): added realmIntegrity, _intRegenAcc, beasts, beastEncounters fields
      · _ensurePhase3Fields(): save migration safety
      · _recalc(): beast passive bonuses (soul_bond, qi_devour, heavenly_instinct); integrity in derived
      · tick(): +1 integrity per 30s via _intRegenAcc accumulator; offline catch-up on init
      · attemptBreakthrough(): −20 integrity on fail; demotion at 0; Heart Calming Pill restores +30 integrity; returns demoted: bool
      · resolveExpedition(): beast encounter roll (8–14% chance scaled by tier; queues beastEncounters)
      · New methods: tameEncounteredBeast, sendBeastExpedition, resolveBeastExpedition, dismissBeast
      · _rollDrops(): accepts optional lootMultOverride for beast expeditions
  - Created renderer/game/beasts.js — BeastSystem (ticks beast expedition timers)
  - Updated renderer/game.js:
      · BeastSystem wired into bootGame loop
      · updateHUD: integrity bar fill + color + offline regen
      · Breakthrough fail handler: shake animation + demotion message
      · renderExplore: Beast Encounters section + Active Beasts section with expedition picker
      · renderStats: shows Realm Integrity + Beasts count
      · renderCraft: Talismans sub-tab added (5th category)
      · Inventory groups: added talisman type
      · renderBeastSpriteHTML helper
  - Updated renderer/index.html — integrity bar block added; 2 new script tags (beasts.js, beast-sprites.js)
  - Updated renderer/styles.css — integrity bar, shake animation, full beast UI styles
  - All files pass node --check; Electron launches without errors
What was NOT finished / left for next session:
  - npm run dist not yet run (user-facing changes made)
  - Phase 4 (Sect System) is the next implementation target
Next recommended task:
  - Run npm run dist to produce a new portable build
  - Start Phase 4: create assets/data/sects.js, sect join UI, contribution system
  - See PLAN.md §Phase 4 for full spec
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
