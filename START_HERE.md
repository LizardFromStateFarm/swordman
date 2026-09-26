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
| Member wars (joined sects go to war, you get pulled in) | ✅ Phase 5C |
| QA sim harness (`npm run sim` → bot playtest report) | ✅ Tooling |
| Dev late-game test characters (charselect, `npm start` only) | ✅ Tooling |
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
| Immortal Progression (bloodline, ascension trial, health/death, immortal realms, secret arts) | ⬜ Phase 23 |

---

## Last Session — UPDATE THIS EVERY SESSION

```
Date: 2026-09-25 (session 5)
Agent: Phase 5C Member Wars (committed 1ef39a9) + dev late-game test characters.
Dev presets (user request, after 5C): `npm start` → any EMPTY slot on charselect shows a purple preset picker + DEV
  button → writes a late-game save and starts it. Presets: Sect Elder (member war in 1 min), Sect Founder (own war in
  1 min), Pre-Ascension (one breakthrough from Ascension). Hidden in dist (app.isPackaged) and on iOS. See
  docs/systems/dev-presets.md. Verified: all 3 presets load + tick in the sim engine, Ascension BT works, test,
  sim:quick, build:web, dist. Not verified by eye in the running app.
What was done:
  - One sectWar state for both sides: side 'own' (founded, 5B) | 'member' (joined, 5C). _ensurePhase5BFields()
    keeps side in sync with ownSect.founded / sect.id and migrates pre-5C saves (own-sect wars untouched).
  - Member war: rank-scaled 4–10h interval, 2h window (30m Call to Arms + 90m Muster — the war-window-gap fix).
    Commitments: Answer the Call (holds a mission slot until the war resolves), war chest (stones, capped by rank,
    earns contribution), up to 3 pills, one beast (beast.expedition = { war:true }, comes home with XP).
    Win (engaged) → contribution + stones + 15% rare item. Loss → sect buffs suppressed 3h, −contribution (flat × rank).
    Seen-but-ignored → −contribution −2 karma. Wars resolved entirely while closed = unseen, no penalty.
    Leaving mid-war = deserter (−5 extra karma). Rank is never demoted.
  - Files: assets/data/sect-war.js (MEMBER_WAR_* constants), game-state.js (war section rewritten for both sides,
    member API, _recalc suppression/warSlot, join/leave/startSectMission), game/beasts.js (skip war beasts),
    game.js (renderMemberWarPanel, war slot in mission count, 'At war' beast status), styles.css (.war-warn).
  - Bug found by the sim and fixed before landing: answered wasn't cleared at resolution → mission slot stayed locked.
  - Sim: bot memberWar() (answer → beast → chest at ≥3× → pills after Ascension); per-side war tally
    (Recorder.trackWars), Member Wars report section, 4 new invariants, 3 new FEATURES.
  - Docs: sect-war.md (full 5C section), sects.md, qa-sim.md, PLAN.md, CLAUDE.md tree.
  - Verified: npm test, sim:quick, full sim founder + --path=member (healthy, 0 violations), build:web, dist,
    scripted scenario test of every member-war flow incl. save round-trip mid-war and pre-5C save migration.
  - NOT verified: the new Sect-tab war panel by eye (the sim doesn't load game.js). Easiest check now: npm start →
    DEV preset "Sect Elder" → a call to arms starts within a minute.

CURRENT BASELINE (npm run sim, 200h medians; Ascension is noisy — 8 seeds on old code gave casual 71h, not 56h):
  Founder path — Ascension: active ~11h · casual ~76h · afk ~140h.  Found sect: 6.7h · 36h · ~135h.
  Member path (--path=member) — Ascension: active ~39h · casual ~60h (2/3 seeds). Member wars: active/casual
  answer 100% of ~32 calls, win ~70%, contribution +2k; afk answers ~15–25% (opens 15 min per 8h).
  Health: 0 errors, 0 violations.

READY FOR DEV WORK — how a new agent should start:
  1. Read START_HERE.md (this) + CLAUDE.md; load only the docs/systems/*.md for the system you touch.
  2. `npm test && npm run sim:quick` → both must pass before you change anything (≈5s total).
  3. For balance work, or any new system that touches Qi/stones: `npm run sim` before AND after, read only
     scripts/sim/out/report.md, try values with --set first. Teach scripts/sim/bot.js to use any new system
     (docs/systems/qa-sim.md → "Extending") or the sim can't see it.

Open design gaps the sim still flags (numbers can't fix these):
  - Nothing to do after Ascension → long dead zones for every profile (Phases 7–8).
  - OWN-sect wars still use the 15-min window: casual sees ~50%, afk ~0%, casual still banks ~4–8k. Member wars
    (2h window) fixed this for joined sects. Option: give own-sect wars a longer window too (try --set
    WAR_SCOUT_SECONDS / WAR_PREP_SECONDS) — a 5B balance change, ask the user. Afk needs Phase 9 notifications.
  - Member-path bot donates everything above 300 stones to its sect, which is why member Ascension (active ~39h)
    lags founder (~11h). It's the bot's policy, not a game wall — worth a smarter bot before tuning from it.
  - weapon_soul_spear (expedition_power) / weapon_thunder_staff (enemy_hp_reduce): effects nothing reads.
Next recommended tasks (pick one):
  - Phase 6 Animation & Visual Overhaul, or Phase 7 → Phase 23 (post-Ascension content — biggest sim flag).
    Phase 23 (added 2026-09-25) is the planned post-Ascension system: hidden Bloodline Quality, chance-based
    Ascension, Health/death → reincarnation, Immortal Realms, Secret Arts. Its 23A–C sub-phases work without
    the family system. Resolve its "Open questions" with the user before building.
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
    sect-war.md        ← Sect wars: own-sect (5B) + member wars for joined sects (5C)
    dev-presets.md     ← Dev-only late-game test characters (npm start charselect)
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
    dev-presets.js     ← DEV_PRESETS — late-game test characters (npm start only)
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
