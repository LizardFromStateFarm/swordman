# Cultivator Idle — Feature Roadmap

**→ Always check START_HERE.md first for current build state and last session summary.**

---

## Phase Status

```
Phase 1  ✅  Core idle loop (Qi, stages, techniques, events, slots, particle renderer)
Phase 2  ✅  Explore / Combat / Resources / Crafting
Phase 3  ✅  Breakthrough Integrity + Spiritual Beasts
Phase 4  ✅  Sect System — join existing sects
Phase 5  ✅  Build Your Own Sect (5A ✅) + Sect Wars (5B ✅) + Member Wars (5C ✅ — wars for joined sects)
Tooling  ✅  QA Sim Harness (`npm run sim`) — bot playtesting + balance/fun report
Phase 6  ⬜  Animation & Visual Overhaul (incl. 6E window/layout modes)
Phase 7  ⬜  Dao Paths + Body Cultivation + Heavenly Tribulation
Phase 8  ⬜  Ascension & Reincarnation (New Game+)
Phase 9  ⬜  Desktop Integration (tray, notifications, time-of-day)
Phase 10 ⬜  Cosmetic & Personalization
Phase 11 ⬜  Rival NPC + Heaven's Will + Lore Fragments
Phase 12 ⬜  Birth Origin & Character Foundation
Phase 13 ⬜  Alignment & Karmic Path (Good vs Evil)
Phase 14 ⬜  Body Constitution & Physical Tempering (deep)
Phase 15 ⬜  NPC World Simulation (personalities, sects, relationships)
Phase 16 ⬜  Marriage & Family
Phase 17 ⬜  Secret Realm Dungeons (ASCII Map Grid Exploration, Timed Events)
Phase 18 ⬜  Lineage & Heir Inheritance (Family Trees, Legacy Passives)
Phase 19 ⬜  World Epochs & Spiritual Tides (Dynamic Global Modifiers)
Phase 20 ⬜  Optional Settings & Challenge Modes (Permadeath, Accessibility)
Phase 21 ⬜  Backpack & Inventory Tab (unified item/currency view)
Phase 22 ⬜  Active / Idle Mode Toggle + Mid-Late Automation
Phase 23 ⬜  Immortal Progression — Bloodline Quality, Ascension Trial, Health/Death, Immortal Realms, Secret Arts
```

---

## Phase 2 — Explore, Combat, Resources & Crafting

### 2A — Expedition System

The cultivator sends expeditions to locations while continuing to meditate.
Expeditions run in real-time and return with resources.

**Locations** (unlock by cultivation stageIndex):
| Location | minStage | Duration | Enemy Tier | Primary Drops |
|----------|----------|----------|------------|---------------|
| Mortal Forest (凡人森林) | 0 | 60s | Beast rank 1 | Spirit Herbs, Beast Cores |
| Spirit Stone Quarry (灵石矿场) | 3 | 90s | Puppet rank 1 | Spirit Stones, Iron Ore |
| Demon Marsh (妖魔沼泽) | 6 | 120s | Demon rank 2 | Demon Essence, Poison Herbs |
| Ancient Ruins (古代遗迹) | 10 | 180s | Undead rank 3 | Artifact Fragments, Ancient Scripts |
| Heavenly Peak (天峰) | 15 | 300s | Immortal rank 4 | Celestial Herbs, Heavenly Ore |
| Void Rift (虚空裂缝) | 19 | 600s | Void rank 5 | Void Crystals, Chaos Essence |

**New files:**
- `assets/data/items.js` — `ITEMS` map: all item types, stackable flag, display info
- `assets/data/locations.js` — `LOCATIONS` array with dropTables
- `assets/data/enemies.js` — `ENEMIES` array with rank/hp/drops/asciiArt

**State additions:**
```js
expedition: { active: false, locationId: null, endsAt: null },
inventory: {},   // itemId → quantity
```

**UI:** New tab "Explore" — shows unlocked locations, active expedition timer, log of last return

### 2B — Crafting System

New tab "Craft" with sub-tabs: Pills · Elixirs · Weapons · Artifacts.

**Pills** (consumed on breakthrough attempt — stackable in inventory):
| Pill | Recipe | Effect |
|------|--------|--------|
| Qi Refining Pill (聚气丹) | 2× Spirit Herb | +10% BT chance (1 use) |
| Foundation Pill (筑基丹) | 5× Spirit Herb + 1× Beast Core | +20% BT chance |
| Heart Calming Pill (定心丹) | 3× Spirit Herb + 1× Demon Essence | -50% Qi lost on failure |
| Golden Core Pill (金丹) | 10× Celestial Herb + 2× Heavenly Ore | +30% BT, -80% Qi loss |
| Heaven Defying Pill (逆天丹) | 20× Void Crystal + 5× Chaos Essence | BT always succeeds |

**Elixirs** (spiritual root reroll — consumed immediately):
| Elixir | Recipe | Root outcome |
|--------|--------|--------------|
| Muddy Root Elixir (浊根液) | 3× Spirit Herb | Mixed guaranteed |
| Cleansing Root Elixir (洗筋液) | 5× Spirit Herb + 2× Beast Core | 50% Dual, 50% Mixed |
| Pure Root Elixir (纯根丹) | 10× Celestial Herb + 3× Void Crystal | 60% Pure, 35% Dual, 5% Heavenly |
| Heavenly Root Elixir (天根丹) | 20× Chaos Essence + 5× Ancient Script | 40% Pure, 40% Heavenly, 20% Dual |

**Weapons** (equip slot — passive):
| Weapon | Recipe | Bonus |
|--------|--------|-------|
| Spirit Sword (灵剑) | 3× Iron Ore | +15% Qi/s |
| Soul Spear (魂枪) | 5× Iron Ore + 2× Beast Core | +25% expedition power |
| Thunder Staff (雷杖) | 3× Heavenly Ore | Enemies -20% HP |
| Void Blade (虚刃) | 5× Heavenly Ore + 3× Void Crystal | +50% loot, +20% BT |

**Artifacts** (equip slot — passive):
| Artifact | Recipe | Bonus |
|----------|--------|-------|
| Jade Pendant (玉佩) | 2× Spirit Herb + 1× Iron Ore | Qi cap ×1.2 |
| Soul Ring (魂环) | 3× Beast Core + 2× Iron Ore | Qi/s ×1.3 |
| Heaven Talisman (天符) | 5× Ancient Script | BT chance +8% permanent |
| Void Compass (虚空罗盘) | 3× Void Crystal | Unlocks hidden locations |

**New files:** `assets/data/recipes.js`, `renderer/game/crafting.js`
**State additions:** `equipped: { weapon: null, artifact: null }`, `pills: {}` (inventory of usable pills)

### 2 — Implementation order
1. `assets/data/items.js`
2. `assets/data/locations.js` + `assets/data/enemies.js`
3. `assets/data/recipes.js`
4. Add `expedition` + `inventory` + `equipped` + `pills` to `game-state.js` `_newGame()`
5. `renderer/game/expedition.js`
6. `renderer/game/crafting.js`
7. Add Explore + Craft tabs to `renderer/index.html` + `styles.css`
8. Wire everything in `renderer/game.js`
9. Update START_HERE.md + PLAN.md phase status + rebuild

---

## Phase 3 — Breakthrough Integrity & Spiritual Beasts

### 3A — Realm Integrity

Add a second bar: **Realm Integrity (0–100)**, starts at 100.

- Failed breakthrough: −20 Integrity (on top of −50% Qi)
- Integrity = 0: **Realm Demotion** (stageIndex −1), Integrity resets to 60
- Passive regeneration: +1 Integrity per 30s (very slow — recovery takes time)
- Heart Calming Pill restores +30 Integrity; Heaven Defying Pill bypasses Integrity check
- UI: indigo→red bar below Qi bar; shake animation on demotion

**State additions:** `realmIntegrity: 100`

### 3B — Spiritual Beasts

Tameable creatures encountered during expeditions.

- Encounter chance per expedition: scales with location tier
- Taming requires: Beast Taming Talisman (crafted) + sufficient stageIndex
- Max 3 active beasts
- Each beast has 3 random traits from pool: Swift, Iron Skin, Spirit Nose, Heavenly Instinct, Qi Devour, Soul Bond
- Beast XP gained per expedition → level up every 100 XP (max 10) → +10% per trait per level
- Send beasts on solo expeditions while cultivator meditates

**New files:** `assets/data/beasts.js`, `renderer/game/beasts.js`
All beast sprites must pass the Asset Pipeline (≥8.0).

---

## Phase 4 — Sect System (Join Existing) ✅

> **Status: implemented 2026-09-25.** See `docs/systems/sects.md`. Divergences: Myriad Herb Hall "Crafting ×2" is a 35% double-output chance; Azure Sword weapon buff = ×1.15 Qi/s with a weapon equipped; Heaven Defying artifact bonus = ×1.2 Qi/s with an artifact equipped. Missions run max 2 at once; ranks unlock missions and raise reward multipliers; rank-up is a manual button; donate 10 Stones = 5 Contribution; leaving forfeits rank/contribution (−5 karma).

**Available sects:**
| Sect | minStage | Specialty |
|------|----------|-----------|
| Azure Sword Sect (碧剑宗) | 3 | Weapon buffs, BT chance |
| Myriad Herb Hall (万草堂) | 2 | Crafting ×2, herb drops |
| Thunder Palace (雷宫) | 6 | Qi/s +40%, expedition power |
| Void Moon Pavilion (虚月阁) | 10 | Hidden locations, Integrity regen |
| Heaven Defying Sect (逆天门) | 15 | BT floor 50%, artifact bonus |

**Sect ranks:** Outer Disciple → Inner Disciple → Core Disciple → Elder → Peak Elder → Grand Elder
Rank up via Sect Contribution Points earned through missions and donations.

**Sect missions** (real-time, auto-complete):
| Mission | Duration | Reward |
|---------|----------|--------|
| Herb Gathering | 5 min | Herbs + Contribution |
| Patrol | 10 min | Stones + Contribution |
| Escort | 20 min | Contribution + Beast XP |
| Subdue Demon | 30 min | Demon Essence + large Contribution |
| Retrieve Artifact | 60 min | Fragment + large Contribution |

**New files:** `assets/data/sects.js`, `renderer/game/sect.js`
**State additions:** `sect: { id: null, rank: 0, contribution: 0, activeMissions: [] }`

---

## Phase 5 — Build Your Own Sect + Sect Wars

### 5A — Found a Sect ✅

> **Status: implemented 2026-09-25.** See `docs/systems/own-sect.md`. Divergences: crafting is instant, so Pill Hall = +40% double-output chance instead of "craft speed ×2"; Sect Hall is upgradeable Lv1–3 (100/250/500 stones, +5 cap each; Lv1 cap 5, max 20); recruiting picks from a refreshing 3-candidate pool (15×talent² stones, reroll 10); Spirit Beast Pen raises beast cap 3→5; Defensive Array's war defense is computed but unused until 5B. Founding requires not being in a Phase 4 sect. Fame (`derived.sectFame`) is computed for 5B scaling.
Unlocks at Nascent Soul (stageIndex ≥ 18). Cost: 500 Spirit Stones + 50 Void Crystals.

**Buildings:**
| Building | Cost | Bonus |
|----------|------|-------|
| Sect Hall (宗殿) | Required | +5 disciple cap, unlocks recruitment |
| Qi Library (气功馆) | 50 Stones | Disciples +20% Qi contribution |
| Pill Hall (炼丹殿) | 100 Stones + 20 Herbs | Craft speed ×2 |
| Spirit Beast Pen (灵兽栏) | 80 Stones | +2 beast slots |
| Training Ground (修炼场) | 60 Stones | Disciple levels +30% faster |
| Defensive Array (防御阵) | 200 Stones + 5 Void Crystals | War defense +40% |
| Treasury (宝库) | 150 Stones | Resource income +30% |

**Disciples:** recruit up to 20 NPCs with 1–5 star talent. Higher talent = more resources generated.

### 5B — Sect Wars ✅

> **Status: implemented 2026-09-25.** See `docs/systems/sect-war.md`. Divergences: no NPC-sect
> simulation exists yet (Phase 15), so "enemy contribution loss" became a probabilistic
> win/loss roll (`playerPower / (playerPower+enemyPower)`, powers scaled from `sectFame` +
> `warDefense`/reinforcement/alliance bonuses) with resource spoils on win, a Spirit Stone
> penalty + temporary Defensive Array disable on loss; alliances are bought from the existing
> Phase 4 `SECTS` roster (one-war power bonus) rather than a full NPC relationship system.
Trigger every 2–6 hours (real time), scaled by sect fame.
Phases: Scouting (5 min) → Preparation (10 min) → Auto-resolve.
Win = spoils + enemy contribution loss. Lose = resource penalty + array damage.
Alliance system: ally with other sects for defensive help.

### 5C — Member Wars (sect wars for non-leaders) ✅

> **Status: implemented 2026-09-25.** See `docs/systems/sect-war.md` ("Member War Outcome"). Built as planned —
> one `sectWar` state with `side: 'own' | 'member'`, same Date.now()-chained phase machine, rank-scaled 4–10h interval.
> Divergences / decisions: the member war window is **2h** (30m Call to Arms + 90m Muster) instead of 15 min, which
> is the fix for the sim's "wars resolve unseen" flag (casual now answers 100% of member calls; own-sect wars keep
> 15 min). Commitments: answer (free — no mission-slot cost, changed 2026-09-25 per user feedback that it was
> unwelcome friction), war chest (stones, capped per rank, also earns contribution), up to 3 pills, one beast
> (`beast.expedition = { war: true }`, returns with XP).
> Contribution penalties are flat × rank multiplier, not %, since contribution keeps growing past max rank.
> A war that starts *and* ends while the game is closed is "unseen": no reward, no ignore penalty — afk players
> aren't punished for calls they could never see (`tickSectWar(live=false)` in offline catch-up). Sect tier = its
> position in `SECTS` (scales enemy stars + spoils). No rare-item table of its own: demon essence / artifact fragment.
> Sim: bot answers/lends/donates; report gained a Member Wars section + 4 invariants. Afk still answers only
> ~15–25% of calls (opens 15 min per 8h) — needs Phase 9 notifications, not a longer window.

> **Requested 2026-09-25.** Today wars only exist once you *found* a sect (`tickSectWar()` early-returns
> unless `ownSect.founded`). Sects you merely *join* should also go to war, pulling you in as a member.

- **Trigger:** while `sect.id` is set, the joined sect periodically goes to war with a rival (reuse
  `RIVAL_SECT_*` pools, or another `SECTS` entry for flavor). Interval scales by sect rank, not fame
  (suggested 4–10h; lower ranks get called less often).
- **Same phase machine:** scouting → preparing → auto-resolve, reusing the Date.now()-chained 5B pattern so
  offline catch-up keeps working. Generalise `sectWar` state with a `side: 'own' | 'member'` field rather than
  duplicating it (keep `_ensurePhase5BFields` migration safe).
- **Member actions during a war (the "pulled in" feel):** answer the call (free — commits nothing else), donate
  stones/pills to the war chest, or send a beast. Each adds to sect power. Ignoring the call is allowed but costs
  contribution/karma.
- **Outcome:** sect power = f(sect tier, your rank, your commitments) vs rival. Win → contribution + rank-scaled
  spoils (maybe a rare item). Loss → contribution loss, sect buff (`effects`) suppressed for a few hours.
  Never demotes rank on its own.
- **Leaving mid-war:** allowed, but a karma + contribution penalty ("deserter").
- **QA sim:** add member-war behaviour to `scripts/sim/bot.js` (member path), war metrics for `--path=member`
  (engaged %, W/L, contribution delta) — see `docs/systems/qa-sim.md` → Extending.
- Needs its own section in `docs/systems/sect-war.md` before code (Rule #6).

---

## Tooling — Dev Late-Game Test Characters ✅

> **Implemented 2026-09-25.** `npm start` only: empty charselect slots offer DEV presets (Sect Elder / Sect Founder /
> Pre-Ascension) built by `gameState.buildDevSave()` from `assets/data/dev-presets.js`. Gated by `window.electron.isDev()`
> (`!app.isPackaged`; always false on iOS). See `docs/systems/dev-presets.md`.

---

## Tooling — QA Sim Harness ✅

> **Implemented 2026-09-25.** `npm run sim` / `npm run sim:quick` — headless bots (active / casual / afk
> profiles, founder / member sect paths) play the real game logic at ~20+ game-hours per real second per core
> and write `scripts/sim/out/report.md`: pacing (time to each realm/milestone), fun signals (dead zones,
> difficulty walls, fail streaks, hoarding, actions/hour, qi-capped %, unused features), health (exceptions,
> invariants, save round-trips) and tick performance. See `docs/systems/qa-sim.md`.
> **First pacing pass 2026-09-25:** Foundation Building+ `qiCap`s retuned to the GAMEDESIGN.md table
> (casual player now reaches Ascension ~72h, was ~24h; active ~10h, was ~2h); random-event Qi losses made
> time-based (the old % losses capped Qi below the breakthrough threshold on long stages). Still open from
> the sim: late-game stone hoarding (no sinks), nothing to do after Ascension (Phases 7–8), afk players
> can't afford founding, casual/afk miss most war windows (Phase 9 notifications / 5C).
> **Economy pass 2026-09-25:** sim now keeps a Spirit Stone ledger (sources/sinks). Found disciples = ~90% of
> all income (~1,100/h) and war defeats (15% of bank) = ~80% of all outflow, so a two-speed economy with a wealth
> tax instead of choices. Fixed with numbers only: disciple stone/herb rates ÷7, war loss 8%, war ally/reinforce
> costs ×2–4 (the repeatable late sink), long sect missions pay stones (afk faucet), Celestial Orbit 150→600
> (kept Qi pacing on target), founding minStage 18→19 (void crystals drop at 19). Result: casual bank 31k→6k,
> active 47k→4k, war losses now a minority of outflow, afk founds a sect at ~132h (never before).
> Remaining flags are design gaps, not numbers: nothing after Ascension (Phases 7–8), casual/afk rarely see
> the 15-min war window (Phase 9 notifications / 5C), hence can't use the war sink and still bank ~6k/3.5k.
> Not yet: Playwright UI-level pass (would need a swappable clock seam in game.js); an LLM-driven policy
> tier for qualitative "does this feel good" feedback; wiring `sim:quick` into `npm run release` (blocked
> until the current health failure — see START_HERE — is fixed, or it would block every release).

---

## Phase 6 — Animation Overhaul

### 6A — Particle System Enhancements
- Bezier-curved Qi streams flowing toward cultivator
- Realm-specific particles: fire sparks, water droplets, lightning arcs, void static
- Aura rings with ripple timing tied to sprite fps

### 6B — Sprite Enhancements
Expand all sprites to 4+ frames. Add per-sprite micro-movements:
- Breathing sway (±1 char left/right per cycle)
- Eye blink frame (injected every 3–5 seconds by renderer)
- Hair/robe ripple frame
- Stage transition: dissolve/wipe between sprite states
All new frames must pass the Asset Pipeline (≥8.0).

### 6C — Event Animations
- BT success: flash → burst → ring cascade → color shift to new stage color
- BT failure: red flash → particle implosion → Integrity bar shake
- Realm Demotion: screen tremor + downward spiral particle

### 6D — Background Ambience
| Realm | Canvas background behavior |
|-------|---------------------------|
| Mortal | Faint dust motes |
| Qi Condensation | Blue Qi wisps drifting upward |
| Foundation Building | Misty rolling tendrils |
| Core Formation | Slow golden rotating halo |
| Nascent Soul | Stars drifting outward |
| Spirit Severing+ | Void rifts — animated cracks in the background |

### 6E — Window & Layout Modes

The player can choose how the game sits on their screen. Mode is stored in `settings` (persists across sessions) and can be changed any time from the titlebar.

**Four modes:**

| Mode | Description | Window Size | Always-on-top |
|------|-------------|-------------|---------------|
| Overlay (default) | Narrow side-panel, current behavior | 300 × 700 px | Yes |
| Expanded | Wider panel; two-column tab layout, more content visible at once | 480 × 800 px | Yes |
| Desktop | Full resizable window, standard OS chrome, taskbar presence | 700 × 900 px min | No |
| Banner | Horizontal strip pinned to top or bottom of screen; sprite left, key stats right, no tabs — just the essentials at a glance | Full screen width × 120 px | Yes |

**Banner mode specifics:**
- Shows: sprite (40×80 canvas), cultivation stage label, Qi bar, Qi/s, spirit stones, active expedition timer (if running), breakthrough button when ready.
- A small ⬡ icon on the right edge opens the full window (Overlay mode) as a floating popup for tab access without switching modes.
- Spirit stone and Qi values auto-format via `fmt()` to stay readable at small size.

**Expanded mode specifics:**
- Two-column layout: left column = canvas + stats, right column = active tab content.
- Tabs become a compact icon row at the top of the right column instead of the full-width tab bar.
- All existing tab content reflows; no content is hidden that isn't hidden in Overlay.

**Implementation notes:**
- Mode switching resizes the Electron window via `window.electron.setWindowSize(w, h)` IPC call — add to `preload.js` + `main.js` and the iOS shim in `platform-storage.js` (shim = no-op since iOS is always full-screen).
- CSS: add a `data-layout` attribute on `<body>` (`overlay` / `expanded` / `desktop` / `banner`). All layout variants are CSS-only off that attribute — no JS branching in render functions.
- Banner mode hides `#app` tabs and renders a `#banner-strip` element instead. The canvas is resized to 40×80 for banner; full-size for all other modes.
- Existing 300px-wide styles stay as the `[data-layout="overlay"]` baseline; don't delete or break them.

**State additions:**
```js
settings.layoutMode: 'overlay',   // 'overlay' | 'expanded' | 'desktop' | 'banner'
settings.bannerEdge: 'top',        // 'top' | 'bottom' — only used in banner mode
```

**New files:** none — changes live in `renderer/styles.css` (layout CSS variants), `renderer/game.js` (mode switch wiring), `main.js` / `preload.js` (IPC resize), `renderer/engine/platform-storage.js` (shim).

---

## Phase 7 — Dao Paths, Body Cultivation & Heavenly Tribulation

### 7A — Dao Path System
At Foundation Building (stageIndex 10), the cultivator must choose a Dao Path.
This is a permanent choice per save (reroll costs a Heavenly Root Elixir).

| Dao Path | Bonus | Unique Technique Unlock |
|----------|-------|------------------------|
| Sword Dao (剑道) | Weapon bonuses ×1.5, BT chance +5% | Sword Intent: AOE expedition damage |
| Flame Dao (炎道) | Qi/s ×1.4 | Heart Flame Sutra (enhanced) |
| Void Dao (虚道) | Hidden locations always accessible | Phase Step: skip one failed BT per hour |
| Life Dao (生道) | Realm Integrity regen ×3, herb drops ×2 | Undying Roots: never demote below current realm |
| Heaven Dao (天道) | All bonuses ×1.2, BT always ≥ 30% | Heavenly Will: 1/day auto-advance layer |
| Devil Dao (魔道) | Qi/s ×2.5, BT chance −15%, Karma slowly drains | Demonic Possession: temporarily ×5 Qi/s |

Devil Dao adds the "Qi Deviation" event pool (higher damage negative events).

### 7B — Body Cultivation
A parallel track alongside Qi cultivation. Levels from Mortal Body → Bronze → Iron → Diamond → Immortal.
Each level requires physical tempering (uses Beast Cores + Iron Ore).
Body level provides: damage reduction in expeditions, Realm Integrity starting value increases.

**State additions:** `bodyLevel: 0, bodyXp: 0`

### 7C — Heavenly Tribulation
At three specific transitions (Foundation Building, Nascent Soul, Spirit Severing), a Heavenly Tribulation
is required before you can break through. Not auto-triggered — you must choose to "Face the Tribulation."

Three waves of increasingly powerful lightning strikes. Each wave: survive or lose significant Qi/Integrity.
Surviving all 3 waves grants the breakthrough and a permanent "Tribulation Veteran" title.
Failing mid-tribulation: large Qi loss but can retry after a 10-minute cooldown.

The tribulation plays as a special multi-frame ASCII animation (lightning, storm, enduring figure).
This is a major event — the most dramatic animation in the game.

---

## Phase 8 — Ascension & Reincarnation (New Game+)

> ⚠ **Superseded in part by Phase 23 (2026-09-25):** Ascension is now a chance-based trial driven by hidden
> Bloodline Quality, success leads to the Immortal Realms and failure/death leads to reincarnation. Dao Seeds /
> Ascension Hall / Sect Legacy below still apply but must be rebalanced alongside Phase 23.

When you reach Ascension (stageIndex 22), the game doesn't end — you **Reincarnate**.

**Reincarnation grants Dao Seeds** — permanent, cross-save multipliers:
- Each reincarnation: +1 Dao Seed (max 10)
- Dao Seeds apply on new game start: each seed = ×1.2 to base Qi/s
- Retained across reincarnations: Dao Path choice, any techniques learned above Foundation Building
- NOT retained: stage, spirit stones, equipment, sect rank, beasts

**Ascension Hall** — a new persistent tab visible after first ascension.
Shows: total reincarnations, cumulative stats, Dao Seed count, personal bests.

**Sect Legacy** — the sect you founded persists across reincarnations. Buildings and disciples survive.
Disciples slowly cultivate on their own between sessions.

---

## Phase 9 — Desktop Integration

### 9A — System Tray
- App minimizes to system tray (not taskbar close)
- Tray icon updates with cultivation stage (mortal, qi condensation, foundation, etc.)
- Right-click menu: "Wei Longshan — Qi Condensation L3", "Open", "Quit"

### 9B — Desktop Notifications
Push notifications (Windows/Mac native) for:
- Breakthrough ready (Qi at 90%+ of cap)
- Expedition returned
- Sect War incoming (15 min warning)
- Realm Demotion occurred (urgent — user should log in)
- Beast tamed

### 9C — Time-of-Day Bonuses
Real-world local time affects cultivation:
| Time | Effect |
|------|--------|
| Midnight–4am | Moonlight meditation: Qi/s ×1.3 |
| 4am–8am | Dawn enlightenment: BT chance +5% |
| Noon–2pm | Solar peak: Fire Dao Qi/s ×1.5 |
| Dusk 6–8pm | Evening reflection: Karma +1 |

### 9D — Seasonal Cultivation
Real calendar month affects passive bonuses:
- Spring (Mar–May): Herb drops ×1.5, wood/life cultivation +10%
- Summer (Jun–Aug): Fire expedition drops ×1.5, Qi/s ×1.1
- Autumn (Sep–Nov): Metal refinement ×1.5, weapon crafting cheaper
- Winter (Dec–Feb): Water cultivation +10%, meditation duration +50%

---

## Phase 10 — Cosmetic & Personalization

### 10A — Title System
Earn titles displayed under the cultivator's name in the UI.
Some titles have small gameplay effects; most are cosmetic.

| Title | Earned by | Effect |
|-------|-----------|--------|
| First Soul (初心) | First Qi Condensation | None |
| Tribulation Veteran (历劫) | Survive 5 Tribulations | +3% BT chance |
| Demon Slayer (伏魔) | 50 demon expedition kills | Expedition power +10% |
| Azure Disciple | Inner Disciple rank in Azure Sword Sect | Sword Dao BT +5% |
| Heaven's Favorite (天之骄子) | Roll a Heavenly Root | Qi/s ×1.1 |
| Ascendant (飞升者) | First ascension | Qi/s ×1.05 per reincarnation |

### 10B — Spirit Pet Companion
A tiny companion sprite rendered beside the cultivator (position: lower-left of canvas).
Cosmetic only — the pet reflects your Dao Path element.
| Dao Path | Pet |
|----------|-----|
| Sword | Sword-spirit sprite (floating blade) |
| Flame | Fire fox kit |
| Void | Shadow cat |
| Life | Jade turtle |
| Heaven | Mini crane |
| Devil | Phantom wolf cub |

Pets all pass the Asset Pipeline (≥8.0).

### 10C — Cultivation Cave (Home Environment)
After reaching Foundation Building, unlock a persistent background scene for the sprite area.
Options earned through gameplay, each gives a small passive bonus:
- Ancient Mountain Hermitage (+Karma regen)
- Bamboo Forest (+Life Dao Qi/s)
- Thunder Peak (+Flame/Sword Dao)
- Void Star Field (+Void Dao)

---

## Phase 11 — Rival Cultivator & NPC World

### 11A — NPC Rival
A rival cultivator is procedurally generated at new game start (random name, root, Dao Path).
Their stage advances at ~80% of your own pace.
Events reference them: "Chen Xianyu has broken into Core Formation — the heavens tremble."
Overtaking them: +5% Karma bonus. Being overtaken by them: −5 Karma.

### 11B — Heaven's Will
A hidden Favor meter (0–100, starts at 50). Separate from Karma.
High Favor (70+): event pool weighted toward positive, BT always at least 25%.
Low Favor (<30): Heavenly Tribulation arrives at the next BT, extra lightning wave.
Building Favor: meditate during dawn, win sect wars, help NPCs in events.
Draining Favor: Devil Dao techniques, repeated BT failures, inner demon events.

### 11C — Ancient Scripture Lore
Collectible fragments found in Ancient Ruins expeditions. 12 total.
Each fragment is a short poetic passage about the cultivation world.
Displayed in a Lore tab once collected (hidden tab until first fragment found).
Collecting all 12 grants a unique title and a permanent BT bonus.

---

---

## Phase 12 — Birth Origin & Character Foundation

Fires at the very start of a new game, between the name-entry screen and the first cultivation tick.
The player picks a **starting region**; the **family type** is then rolled randomly based on that region's
social-tier weights. This is purely narrative and mechanical setup — no grinding required.

### 12A — Starting Regions

| Region | Flavor | Root Bias | Constitution Bias | Spirit Stone Start |
|--------|--------|-----------|-------------------|--------------------|
| Imperial Capital (帝都) | Intrigue, politics | Pure/Dual weighted | Average | 25 |
| Frontier Wilderness (边疆荒野) | Harsh nature, beasts | Earth/Metal | Strong, high variance | 8 |
| Ancient Sect Territory (古宗领地) | Discipleship culture | Fire/Wind | Average | 15 |
| Demon Lands (魔域) | Corruption, ambition | Shadow/Blood (evil-inclined) | Hardy | 10 |
| Hidden Valley (隐秘山谷) | Hermits, mystery | Rare — Void/Heavenly slightly more likely | Frail but special constitution chance × 2 | 5 |
| Mortal Village (凡人村) | Common folk | Completely random | Random | 10 |

Region is displayed on the Stats tab and referenced in relevant random events.

### 12B — Family Types

Rolled per region's weights; some types are region-exclusive.

| Family Type | Regions Available | Starting Bonus | Trait |
|-------------|-------------------|----------------|-------|
| Noble Family (贵族) | Capital, Sect Territory | +15 Spirit Stones, +1 spiritual root quality tier | Events: political intrigue, arranged-marriage pressure |
| Cultivator Lineage (修士之家) | Sect Territory, Hidden Valley | 1 technique pre-learned (qi_breathing unlocked free) | Family elder NPC generated |
| Merchant Clan (商贾) | Capital, Mortal Village | +10 Spirit Stones, 3 random crafting recipes known | Discounts on bought techniques |
| Mortal Farmer (农户) | Mortal Village, Frontier | Standard; Karma starts at 55 instead of 50 | No special perk |
| Frontier Warrior (边疆武士) | Frontier, Demon Lands | Body constitution floor D (never rolls F/E) | Combat events fire 30% more often |
| Orphan (孤儿) | Any (weighted higher in Demon Lands, Mortal Village) | −5 Spirit Stones | **Indomitable Will** perk: BT failure Qi loss −25%, Integrity loss −10 |

**State additions:**
```js
origin: {
  region: 'mortal_village',     // region id
  family: 'mortal_farmer',      // family type id
  familyNpcId: null,            // if a family NPC was generated
}
```

**New files:** `assets/data/origins.js` — regions and family type tables with weights

### 12C — Special Constitutions (rare, rolled at character creation)

1 in 50 chance to roll a special constitution instead of the standard tier (F–S):

| Constitution | Chinese | Probability | Effect |
|--------------|---------|-------------|--------|
| Phoenix Body (凤凰之体) | 1 / 50 | Fire Qi/s ×2; auto-survive one BT failure per day (resets midnight) | |
| Jade Dragon Body (玉龙之体) | 1 / 80 | Qi cap ×1.5; each realm transition adds +10% cap permanently | |
| Void Devourer (虚空吞噬体) | 1 / 100 | Expedition enemies drop Qi directly (bonus Qi equal to 5× enemy tier) | |
| Undying Flesh (不死之躯) | 1 / 200 | Realm Demotion impossible; Realm Integrity never drops below 10 | |

Special constitution shown on Stats tab with golden border. No tempering needed — this is a gift from heaven.

---

## Phase 13 — Alignment & Karmic Path (Good vs Evil)

Not all power is the same. Some spiritual roots carry a heavenly mandate; others carry a demonic hunger.
Alignment is a second moral axis orthogonal to Karma — it shifts based on *how* you cultivate, not just *how much*.

### 13A — Root Alignment Inclinations

Every spiritual root type is categorized at game start:

| Root Type | Alignment Inclination | Starting Alignment |
|-----------|----------------------|--------------------|
| Heavenly (天灵根) | Pure Light | +60 |
| Pure single root (纯灵根) | Light | +30 |
| Dual root (双灵根) | Neutral | 0 |
| Mixed root (杂灵根) | Neutral | 0 |
| Shadow/Void root | Dark | −30 |
| Blood/Death root (Demon Lands exclusive) | Dark | −50 |

### 13B — Alignment Meter

Range: −100 (Demonic) to +100 (Celestial). Starts at root inclination value.

Named tiers:
| Range | Name | Effects |
|-------|------|---------|
| 70–100 | Celestial (天道) | Heaven's Favor events, righteous NPCs approach you, sects with evil alignment refuse you |
| 30–70 | Righteous (正道) | Standard positive event pool, karma gains ×1.2 |
| −30–30 | Neutral (中立) | No penalty or bonus |
| −30 to −70 | Sinister (邪道) | Dark event pool unlocked, demonic techniques available, righteous sects refuse you |
| −70 to −100 | Demonic (魔道) | Demon Lord events, assassination from righteous sects, ×2 Qi/s but constant Integrity drain |

### 13C — Actions That Shift Alignment

Every choice that matters records its alignment weight.

**Increases alignment (toward Celestial):**
- Help NPC event choice: +5
- Donate to Mortal Village (event): +8
- Defend sect in war (not aggressor): +3 per war
- Choose Heaven Dao path: +20 one-time
- Earn "Heaven's Favorite" title: +5 one-time
- Spare enemy during expedition (choice event): +10

**Decreases alignment (toward Demonic):**
- Rob NPC: −15
- Kill surrendering enemy (choice event): −20
- Choose Devil Dao path: −30 one-time
- Attack another sect unprovoked: −5 per war you start
- Use Blood cultivation technique: −8 per use
- Demonic inner demon event resolved badly: −10

### 13D — Alignment-Locked Content

| Feature | Requires |
|---------|---------|
| Heaven Dao path | Alignment ≥ 0 |
| Sect: Void Moon Pavilion join | Alignment > −20 |
| Righteous NPC will court player (marriage) | Alignment > 10 |
| Blood cultivation techniques | Alignment < −30 |
| Devil Dao path | Any alignment (but pushes you toward Demonic) |
| Demonic Sect (魔教) join | Alignment < −50 |
| Demon Lord encounter event | Alignment < −70 |
| Celestial Mandate event (auto-advance 1 layer) | Alignment > 80 |

**State additions:**
```js
alignment: 0,            // −100 to 100
alignmentLabel: '',      // computed in _recalc
```

---

## Phase 14 — Body Constitution & Physical Tempering (Deep)

*Supersedes the simpler Body Cultivation sketched in Phase 7B — Phase 7B is now expanded into this.*

The body is a second cultivation path running in parallel to Qi cultivation.
You were born into a constitution tier; you can forge it higher through discipline.

### 14A — Constitution Tiers

| Tier | Name | Qi Cap Mult | BT Failure Qi Loss Reduction | Expedition HP |
|------|------|-------------|------------------------------|---------------|
| F | Frail Body (体弱) | ×1.0 | 0% | 50 |
| E | Mortal Body (凡躯) | ×1.05 | 5% | 75 |
| D | Hardened Body (强躯) | ×1.1 | 10% | 100 |
| C | Steel Body (铁躯) | ×1.2 | 20% | 150 |
| B | Diamond Body (金刚体) | ×1.35 | 30% | 200 |
| A | Immortal Body (不朽体) | ×1.5 | 40% | 300 |
| S | Heaven-Forged Body (天锻体) | ×1.75 | 55% | 500 |

Starting tier is rolled at character creation per region:
- Hidden Valley: rolls D–A
- Frontier, Demon Lands: rolls D–C
- Others: rolls F–C

XP required to advance one tier (cumulative):
`F→E: 200 | E→D: 1000 | D→C: 5000 | C→B: 20000 | B→A: 80000 | A→S: 250000`

### 14B — Physical Tempering Methods

All tempering runs in real-time; only one can be active at a time.

**Tier 1 — Basic Training**

| Method | Duration | Cost | Constitution XP | Cooldown |
|--------|----------|------|-----------------|----------|
| Morning Exercise (朝练) | 5 min | Free | 5 | None |
| Iron Fist Training (铁拳修炼) | 30 min | 1 Beast Core | 40 | 1 hour |
| Boulder Carrying (负重) | 2 hr | 3 Beast Cores | 200 | 4 hours |

**Tier 2 — Spirit Tempering** *(unlocks at Qi Condensation L3)*

| Method | Duration | Cost | Constitution XP | Side Effect |
|--------|----------|------|-----------------|-------------|
| Spirit Forge (灵力淬体) | 4 hr | 5 Beast Cores + 2 Iron Ore | 600 | Qi gain −50% during tempering |
| Ten-Thousand Strikes (万拳) | 8 hr | 10 Iron Ore | 1500 | Same |

**Tier 3 — Extreme Ordeals** *(unlock per stage requirement)*

| Method | Unlock Stage | Duration | Cost | Constitution XP | Bonus Effect |
|--------|-------------|----------|------|-----------------|--------------|
| Icy Waterfall Meditation (冰瀑禅修) | Foundation L1 | 12 hr | 10 Ice Crystals | 4000 | Water root Qi/s ×1.4 for 48h |
| Volcanic Immersion (火山淬体) | Foundation L2 | 12 hr | 10 Fire Cores | 4000 | Fire root Qi/s ×1.4 for 48h; unlocks fire-aligned events |
| Thunder Peak Endurance (雷峰忍耐) | Nascent Soul L1 | 24 hr | 30 Thunder Stones | 15000 | BT chance +5% permanently after each completion |
| Void Pressure Chamber (虚空压力) | Spirit Severing L1 | 48 hr | 20 Void Crystals + 5 Chaos Essence | 60000 | Grants +1 Dao Seed on completion; only completable once |

**Tier 4 — Tribulation Tempering** *(post-Tribulation only)*

After surviving a Heavenly Tribulation (Phase 7C), the tribulation lightning can be channeled back into the body:

| Method | Requirement | Duration | Constitution XP | Effect |
|--------|-------------|----------|-----------------|--------|
| Absorb Tribulation Lightning (渡劫炼体) | Just survived a Tribulation | 30 min | 25000 | Body tier +1 if < A; caps at A unless special constitution |

### 14C — Constitution & Alignment Interaction

High alignment (Celestial) cultivators purify their body differently from low alignment ones:

- Celestial alignment: all tempering XP ×1.25; extreme ordeals have a 5% chance to auto-raise one tier
- Demonic alignment: Volcanic Immersion XP ×2; gains a demonic variant (Blood Forging) that deals alignment damage for faster XP

**State additions:**
```js
body: {
  tier: 'F',              // F E D C B A S or special id
  constitutionXp: 0,
  specialConstitution: null,  // null or special constitution id
  activeTemperingId: null,
  temperingEndsAt: null,
}
```

**New files:** `assets/data/tempering.js` — tempering method definitions + tier thresholds

**UI:** New sub-tab inside "Stats" tab → "Body" panel. Shows tier badge, XP bar, list of available tempering methods with timers.

---

## Phase 15 — NPC World Simulation

The world breathes without you. Other cultivators are rising or falling while you meditate.
Their personalities drive behavior — not scripts, but trait-weighted decision tables.

### 15A — NPC Generation

On new game start, 5–8 NPCs are generated in your starting region, plus 2–3 in distant regions.
More spawn as you reach new cultivation milestones (world grows with your power).

Each NPC has:
- **Name** — generated from region-appropriate name tables (`assets/data/npc-names.js`)
- **Spiritual Root** — rolled same as player, includes alignment inclination
- **2–3 Personality Traits** — drawn from the trait pool
- **Starting Stage** — rolls within ±3 stages of player at generation time
- **Relationship to Player** — starts at 0 (neutral)

**Personality Trait Pool:**

| Trait | Behavioral Rules |
|-------|-----------------|
| Ambitious (野心勃勃) | Seeks most powerful sect available. Will found own sect at Core Formation if not in one. May betray weaker sects for stronger ones. |
| Loyal (忠义) | Stays with first sect joined. Fights for sect even at disadvantage. Never betrays, cannot be bribed. |
| Greedy (贪婪) | Can always be bribed with spirit stones. Prioritizes resource gain. May steal from sects. |
| Righteous (正义) | Only joins positive-alignment sects. Helps players/NPCs in need. Cannot be bribed. Actively opposes Demonic cultivators. |
| Cowardly (怯懦) | Avoids conflict. Flees from wars. Won't duel. Easy to bully but remembers slights. |
| Vengeful (复仇) | Never forgets harm done to them. Waits for power advantage before retaliating. Events reference past wrongs. |
| Curious (好奇心) | Explores ruins and new locations frequently. Shares rare information with allies. May get in trouble. |
| Serene (淡泊) | Cultivates steadily. Not interested in sects unless invited. Makes a calm, reliable ally. |
| Ruthless (冷酷) | Attacks rivals at advantage. Purges weak disciples from sects they control. Highly effective in wars. |
| Compassionate (慈悲) | Heals injured cultivators in events (including enemies). Low alignment change possible even on bad acts. |
| Proud (傲慢) | Refuses to join sects they see as beneath them. Will duel anyone who disrespects them. |
| Humble (谦逊) | Accepts mentorship. Improves faster when in a sect. Good disciple material. |

### 15B — NPC-Sect Decision Logic

Every 4–8 hours (real-time), each unaffiliated NPC runs a sect evaluation pass:

1. List all available sects in their region
2. Filter by alignment compatibility (Righteous trait won't join evil-aligned sects)
3. Score each sect: fame score + personality match score
4. If best score > 60: join that sect
5. If Ambitious and stageIndex ≥ 12 (Core Formation) and no sect has score > 40: spawn **new NPC-founded sect**

NPC-founded sects:
- Automatically named from name tables (Founder's surname + Hall/Pavilion/Sect)
- Start with founder as Sect Master
- Other NPCs can then evaluate and join this sect
- These sects can go to war with player's sect and other NPC sects

### 15C — Player-NPC Interaction

Interactions happen through event choices and a new "World" tab (visible from Foundation Building onward).

**World tab shows:** known NPCs, their current sect, stage, relationship value, last interaction.

**Direct interaction options (cost AP — Action Points, 1 per hour passive regen):**
| Action | AP Cost | Effect |
|--------|---------|--------|
| Send Gift | 1 | +10 Relationship; greedy NPCs get +20 |
| Challenge to Duel | 2 | Combat minigame; winner +prestige, loser −10 Relationship |
| Offer Mentorship | 3 | If relationship > 30 and your stage ≥ their stage+3: +20 Relationship, they advance faster |
| Recruit to Sect | 2 | If relationship > 50 and you have a sect: they evaluate joining |
| Negotiate Alliance | 3 | Requires relationship > 70; sects become allies for wars |
| Denounce Rival (public) | 1 | Target −15 Relationship with all NPCs; you −5 alignment |

**Relationship tiers:**
| Value | Label | Passive Effect |
|-------|-------|----------------|
| > 80 | Sworn Ally (盟友) | Fights in your wars; occasional spirit stone gifts |
| 50–80 | Friend (朋友) | Discounted sect missions; shares event intel |
| 10–50 | Acquaintance (相识) | No passive effect |
| −10–10 | Neutral | No effect |
| −10 to −50 | Rival (对手) | Competes with you in breakthrough events; may recruit against you |
| < −50 | Enemy (仇敌) | Assassination events; sect war ally against you |

**State additions:**
```js
world: {
  npcs: [],           // array of NPC objects
  activeSects: [],    // NPC-founded sects
  actionPoints: 5,    // max 10; +1/hr
  lastApRegen: null,
}
```

**New files:**
- `assets/data/npc-names.js` — region-appropriate name tables (surname + given name pools)
- `assets/data/npc-personalities.js` — trait definitions and decision weights
- `renderer/game/npc-world.js` — NPC simulation tick, sect logic, world tab rendering

---

## Phase 16 — Marriage & Family

The cultivation path is lonely by necessity — but it does not have to be walked alone.

### 16A — Courtship

Courtship becomes available once you have an NPC with relationship ≥ 60 and you are both at
Foundation Building or above. Same-alignment proximity is required (can't marry Celestial + Demonic).

**Courtship actions** (all cost AP):
| Action | AP Cost | Romance Gain | Notes |
|--------|---------|--------------|-------|
| Send Spirit Flower (灵花) | 1 | +8 | Costs 3 Spirit Herbs from inventory |
| Share Technique Fragment | 2 | +15 | Gives them a technique scroll (crafted item) |
| Invite to Co-Cultivate | 2 | +12 | +1 stage for them; Qi/s ×1.1 for 1 hour for you |
| Declare Intent (表白) | 3 | Requires Romance ≥ 80 — triggers proposal event | One chance; rejection possible if personality mismatch |

**Proposal can be rejected if:**
- Proud NPC and player stage < their stage
- Righteous NPC and player alignment < 20
- NPC already has a marriage event queued with another NPC

### 16B — Marriage Bonuses

Active while spouse is alive and relationship ≥ 0:

- Spouse's cultivation stage affects your Qi/s: each stage above Foundation Building adds +0.5% Qi/s (max +10%)
- If spouse is in your sect: their resource contribution ×1.5, morale boost for all disciples
- Daily event pool: spouse-flavored positive events (rare technique fragments, crafted gifts)
- Harmony Bonus: when both player and spouse advance a stage in the same week: +10% Qi/s for 7 days

**Complications:**
- Spouse being attacked by an enemy NPC triggers "Protect Spouse" event (combat)
- If spouse is killed in sect war: deep Karma penalty −30, alignment shift −10, but "Grief-Born Resolve" perk: BT chance +8% for 30 days
- Divorce (choice event) costs −20 Karma, ends bonuses; can remarry after 7 real days

### 16C — Children

After marriage, a "Child Event" fires ~once every 14 real days (random roll each day at midnight).

**Child trait inheritance:**
- Spiritual root: weighted blend of both parents' root types. 40% each parent, 20% random mutation
- Constitution: average of both parents' tiers ± 1 (capped at either parent's tier + 1)
- Personality: 1 trait from each parent, 1 completely random
- Alignment inclination: averaged from parents

**Child lifecycle:**
- Infant (0–3 real days): No effect; flavor events ("Your child takes their first steps")
- Young (3–10 real days): Small Karma bonus from family events
- Adult (10+ real days): Can be recruited to sect. Shows in World tab as a named NPC.

**Adult child bonuses (if recruited to your sect):**
- Disciple contribution ×2 vs random disciple (family loyalty)
- May inherit sect mastery after you ascend (Reincarnation): sect "Founding Legacy" title added, buildings stay intact

**Bloodline (Phase 23B):** reincarnating into an adult child carries the family's Bloodline Quality in full,
and the spouse's highest stage feeds bloodline growth. Children are the main way to build the line.

**Orphan player interaction:**
Players born as Orphans (Phase 12) gain a special event chain when they reach relationship ≥ 70 with
any NPC: "Sworn Sibling Bond" (结义). This creates a pseudo-family relationship with all the loyalty
benefits of a Cultivator Lineage family. Orphan players may also adopt a child NPC found in events
(rather than through marriage), at the cost of 20 AP and 30 Spirit Stones.

**State additions:**
```js
marriage: {
  spouseNpcId: null,
  romanceMeter: 0,       // 0–100; only one courtship at a time
  marriedAt: null,       // timestamp
  harmonyStreak: 0,      // days both cultivated
},
children: [],            // array of child NPC ids (subset of world.npcs)
```

**New files:** `renderer/game/family.js` — courtship tick, marriage events, child generation

---

---

## Phase 17 — Secret Realm Dungeons (ASCII Map Grid Exploration, Timed Events)

Secret Realms are unstable dimensional pockets that tear open near regions of dense Qi.
Unlike expeditions (which are idle timers), entering a realm replaces the main canvas with a
navigable ASCII grid — the most active, real-time gameplay in the game.

### 17A — Realm Map

The canvas view switches to a grid layout when a realm is entered. Map is rendered as ASCII characters:

```
  ░░░░░░░░░░░░░░░
  ░ ? ─── T   E ░
  ░ │         │ ░
  ░ S ─── P ─── B ░
  ░     │       ░
  ░ E ─── ?     ░
  ░░░░░░░░░░░░░░░
```

Cell legend (revealed as player explores; `?` = fog of war):
| Symbol | Room Type |
|--------|-----------|
| `P` | Player position |
| `·` | Empty corridor |
| `T` | Treasure room |
| `E` | Enemy room |
| `S` | Spirit shrine (restores Qi/HP) |
| `B` | Boss room (one per realm) |
| `!` | Trap room |
| `∆` | Puzzle room |
| `─ │` | Corridor connections |
| `?` | Unexplored (fog of war) |

Navigation: four directional buttons rendered below the canvas (or keyboard N/S/E/W arrows).
The cultivator's sprite is replaced by the map while inside; particles still run in the background.

### 17B — Realm Tiers

| Realm | Min Stage | Grid | Timer | Boss |
|-------|-----------|------|-------|------|
| Ancient Ruins (古遗迹) | Qi Condensation L3 | 6×4 | 15 min | Ruin Guardian (rank 2) |
| Demon Cavern (妖魔窟) | Foundation Building L1 | 8×5 | 20 min | Demon Lord Fragment (rank 3) |
| Celestial Grotto (仙人府) | Core Formation L1 | 10×6 | 25 min | Fallen Celestial (rank 4) |
| Void Tear (虚空裂缝) | Nascent Soul L1 | 12×8 | 30 min | Void Sovereign (rank 5) |

Realms are discovered through:
- Expedition drops (a "Realm Key" consumable item)
- Rare random event ("A rift tears open nearby — enter now or it closes forever")
- Crafting: Void Compass artifact (Phase 2) passively reveals hidden realms

### 17C — Timed Events Inside Realms

Dynamic events fire mid-run to keep the player engaged:

| Event | Trigger | Effect |
|-------|---------|--------|
| Collapse Warning | 50% cells explored | "The realm destabilizes — escape in 2 minutes!" Urgency timer overlay |
| Spirit Beast Pursuer | Random at 30% explored | A pursuer `X` moves toward player each turn; reach B or S to shake it |
| Formation Flare | Random, once per realm | All fog-of-war revealed for 60 seconds |
| Qi Surge | Near a Shrine | Adjacent rooms' loot quality upgraded for this visit |
| Ancestor Echo | If player has 3+ lineage generations | A ghostly `A` appears and opens a sealed room |

### 17D — Room Outcomes

**Enemy Room:** Auto-resolve using `playerPower = stageIndex × 10 + bodyTier + weapon bonus`.
If power > enemyHP: win, drop loot. If power < enemyHP: lose 20% Qi, can retry or flee (flee costs 5 min from timer).

**Puzzle Room:** 3-option riddle drawn from `realm-puzzles.js`.
- Correct: bonus loot + 3 min added to timer
- Wrong: trap fires (−15% Qi) + 1 min removed

**Boss Room:** Special animation plays (boss ASCII sprite on canvas, aura rings). Win = realm cleared bonus. Defeat = ejected from realm, keep all loot collected so far.

**State additions:**
```js
secretRealm: {
  active: false,
  realmId: null,
  mapGrid: null,     // 2D array of cell objects
  playerPos: [0, 0],
  endsAt: null,
  loot: [],
  pursuerPos: null,
}
```

**New files:**
- `assets/data/realm-maps.js` — realm tier definitions, loot tables, puzzle pool
- `renderer/game/secret-realm.js` — grid renderer, navigation logic, timed event scheduler

---

## Phase 18 — Lineage & Heir Inheritance (Family Trees, Legacy Passives)

Each reincarnation (Phase 8) adds a generation to a persistent family tree. The sins and
glories of your ancestors accumulate as passive bonuses — or burdens — on the current cultivator.

### 18A — The Lineage Record

Stored in a separate `lineage.json` file (not per-slot). Survives all reincarnations.

Each generation entry records:
- Cultivator name, spiritual root type, Dao Path chosen, highest stage reached
- Whether they married and had children
- Constitution tier at death/ascension
- Titles earned, special constitution (if any)
- Whether permadeath ended the line

Displayed in the Ascension Hall (Phase 8) as an ASCII tree:

```
  洛明 ─── 洛晨 ─── 洛天
  (Core)    (Nascent)  (YOU)
```

### 18B — Legacy Passives

Computed at new game start from the full lineage record. Applied before the first tick.

| Ancestor Achievement | Passive Granted (stacks, listed caps) |
|----------------------|---------------------------------------|
| Reached Nascent Soul | +0.5% base Qi/s (max +10% from 20 ancestors) |
| Founded a sect | +1% breakthrough chance (max +10%) |
| Earned Tribulation Veteran title | Realm Integrity starting value +5 (max +25) |
| Married and had children | +2 starting Spirit Stones (uncapped) |
| Had a special constitution | 5% chance current cultivator inherits that constitution |
| Chose Devil Dao | +2% Qi/s but −2 starting alignment (stacks) |
| Died in permadeath | "Iron Will" ancestry: BT failure Qi loss −1% per permadeath death (max −15%) |

### 18C — Heir Selection at Reincarnation

> See Phase 23D: heir selection also sets the Bloodline Quality carried forward (family = full, new soul ≈ 25%),
> and a Solitary Lineage Art heir (23E) counts as family.

When you Ascend (Phase 8), before the new game begins, the heir screen fires:

| Option | Condition | Starting Bonus |
|--------|-----------|----------------|
| One of your adult children (Phase 16) | Must exist | Inherits blended root, constitution avg, 1 personality trait from each parent |
| New soul (random) | Always available | No lineage bonus; full spiritual root re-roll |
| Child of a sworn ally NPC | Relationship ≥ 80 with an NPC who has a child | Ally NPC starts at relationship 80 with new character; alliance pre-formed |

### 18D — Family Technique (Bloodline Exclusive)

After 5 complete generations (5 reincarnations with recorded lineage), a "Family Technique" is unlocked.
This technique is unique to your bloodline and cannot be learned by NPCs.

Its properties are generated from the accumulated roots of all ancestors:
- If ≥ 3 fire root ancestors: technique adds Flame Cultivation bonus
- If ≥ 3 sword Dao ancestors: technique adds Sword Intent passive
- If mixed roots dominate: technique grants +15% Qi cap (adaptive root bonus)

The technique grows stronger with each new generation that learns it (not capped).

### 18E — Ancestral Visions

After 3+ generations, deceased ancestors can appear during deep meditation:
- "Ancestral Guidance" (positive): ancestor with highest stage grants +20% Qi/s for 24h
- "Ancestor's Warning" (protective): blocks the next negative random event
- "Blood Debt" (negative if a permadeath ancestor was murdered by an NPC): that NPC becomes a
  hereditary enemy of the lineage, auto-hostile to every future generation

**State additions (lineage.json, outside slot saves):**
```js
lineage: {
  generations: [],            // array of ancestor summary objects
  familyTechniqueId: null,    // generated after gen 5
  legacyPassives: {},         // computed at game load
  bloodDebts: [],             // NPC ids that are hereditary enemies
}
```

**New files:** `assets/data/legacy-passives.js`, `renderer/game/lineage.js`

---

## Phase 19 — World Epochs & Spiritual Tides (Dynamic Global Modifiers)

The cultivation world breathes on grand cycles. A 7-day elemental tide rotates daily.
World Epochs — longer cataclysmic periods — reshape the strategic landscape for days at a time.
Both apply globally: to you, to NPCs, to sects.

### 19A — Spiritual Tides (7-Day Cycle)

One element dominates each day (cycle repeats):

| Day | Tide | Cultivator Bonus | World Effect |
|-----|------|-----------------|--------------|
| 1 | Fire (炎) | Fire root Qi/s ×1.5; Volcanic Immersion XP ×2 | Fire enemies stronger (+30% HP), drop more |
| 2 | Water (水) | Icy Waterfall bonus; water-aligned events more common | Rain visual on canvas background |
| 3 | Metal (金) | Iron Ore drops ×2; weapon craft speed ×1.5 | Frontier region expedition yield ×1.5 |
| 4 | Wood (木) | Herb drops ×2; Life Dao bonuses | Constitution tempering XP ×1.3 |
| 5 | Earth (土) | Qi cap ×1.1 (earth root); sect building costs −20% | NPC sects build faster |
| 6 | Lightning (雷) | BT chance +5% all; Tribulations +1 wave | Tribulation weather: storms on canvas |
| 7 | Void (虚) | Rare — ~once per 14 days instead of every 7. All hidden locations accessible; Void Devourer ×3 | NPC sect wars more likely during Void tide |

Tide shown in Stats tab with a glyph indicator and time remaining until shift.

**Celestial Calendar** (crafted item from Ancient Scripts): shows the next 3 upcoming tides —
makes timing breakthroughs around Lightning Tide a meaningful strategy.

### 19B — World Epochs (30-Day Rotation)

Longer periods that reshape global conditions. Sequence is deterministic per save seed but varied
enough to feel organic. Announced via event log header: bold, gold-colored.

| Epoch | Duration | Global Effect |
|-------|----------|---------------|
| Age of Strife (乱世) | 7 days | Sect wars 2× more frequent; resource drops +30%; BT chance −5% |
| Golden Age (盛世) | 14 days | All Qi/s ×1.2; NPC relationship gains +50%; no sect wars trigger |
| Demon Tide (魔潮) | 5 days | Expedition enemies +50% stronger; demon drops ×3; all cultivators lose −2 alignment/day |
| Heavenly Opening (天门开启) | 3 days | BT chance +15%; ascension attempts can trigger one stage early; all tempering XP ×2 |
| Spiritual Drought (灵气枯竭) | 7 days | Qi/s ×0.7; spirit stone costs +50%; constitution tempering XP halved |
| Ancestor's Return (先祖归来) | 4 days | All lineage passives doubled; ancestral vision events fire daily |
| The Silence (虚寂) | 2 days | No events fire; no sect wars; Qi/s ×0.5. Rare — but constitution tempering XP ×5 |

Epoch transitions fire a special full-width event log message in gold. Players who are offline when
an epoch begins receive a catch-up note in the offline re-entry event ("You returned during the
Heavenly Opening — the heavens granted X bonus Qi").

### 19C — Strategic Interaction

Tides and Epochs stack. A Lightning Tide during a Heavenly Opening means BT chance +20% — the
highest possible natural window for a breakthrough. A Spiritual Drought + Void Tide creates a
paradox of low Qi but high accessibility — ideal for tempering rather than cultivation.

NPCs respond to epochs: during Golden Age, ambitious NPCs pause sect-founding plans. During Demon
Tide, evil-alignment NPCs gain confidence (relationship aggression increases).

**State additions:**
```js
worldState: {
  currentEpoch: null,
  epochEndsAt: null,
  currentTide: 'fire',
  tideChangesAt: null,
  celestialCalendarOwned: false,
}
```

**New files:** `assets/data/epochs.js` — epoch and tide definitions; `renderer/game/world-state.js` — epoch tick, tide rotation, canvas overlay effects

---

## Phase 20 — Optional Settings & Challenge Modes

All modes are selected at character creation per slot. They cannot be changed after the first tick.
The Settings tab (⚙ icon added to titlebar) also holds per-session accessibility options that
*can* be changed at any time.

### 20A — Permadeath (永恒逝世)

> Phase 23A adds normal-mode death (Health 0 → reincarnate). Permadeath differs only in that death ends the
> line with a tombstone instead of reincarnating.

When enabled:
- If Realm Integrity reaches 0 and a Realm Demotion would push the character below Qi Condensation L1
  (back to Mortal), the character is **permanently destroyed** instead of demoting
- The save slot is cleared
- A **Tombstone entry** is written to `tombstones.json` (persists forever):
  - Cultivator name, region of birth, highest stage reached, total hours played, death cause, epoch at death
- Tombstones are displayed on the character select screen in a "Fallen Cultivators" section below the 3 active slots
- Permadeath characters still contribute a full generation to Lineage (their tombstone = an ancestor record)

**Permadeath achievement (cross-slot, permanent):** If a permadeath character reaches 5 generations before
dying, all new characters on that install gain +5 starting Spirit Stones. Displayed as "Iron Bloodline" legacy.

### 20B — Challenge Modes (pick zero or one)

| Mode | Name | Restriction | Reward on Ascension |
|------|------|-------------|---------------------|
| Starved Root (枯根) | Root always Mixed; cannot reroll; BT chance cap 0.60 | +1 Dao Seed bonus; "Starved Root Ascendant" title |
| Hermit Path (隐士道) | Cannot join any existing sect (can still found own); no NPC ally tier above Acquaintance | Hermit-exclusive techniques unlock; baseline Qi/s +20% |
| One With Heaven (天人合一) | Tribulations have +1 extra wave; BT failures deal −30 Integrity; time-of-day bonuses disabled | "Heaven's Chosen" title; Dao Seed count ×1.5 on reincarnation |
| Hungry Ghost (饿鬼道) | Qi cap is fixed at the mortal value for first 3 realms — techniques are the only cap expansion | Unique "Ghost Ascendant" title; breakthrough Qi cost refunded on success |

Challenge mode badge shown on the character select slot card next to the character name.

### 20C — Accessibility Options (changeable any time)

| Option | Values | Default |
|--------|--------|---------|
| Number display | Raw / Formatted (K/M/B) / Scientific | Formatted |
| Animation speed | 0.5× / 1× / 2× | 1× (affects particle speed + sprite fps) |
| Color blind mode | Off / Deuteranopia / Protanopia | Off |
| Reduced motion | Off / On | Off (disables particles + aura rings; renders sprite only) |
| Font size | 11px / 13px / 15px | 13px |
| Canvas brightness | 70% / 100% / 130% | 100% |

**State additions:**
```js
settings: {
  permadeath: false,
  challengeMode: null,          // null | 'starved_root' | 'hermit' | 'one_with_heaven' | 'hungry_ghost'
  displayNumbers: 'formatted',
  animSpeed: 1,
  colorblind: 'off',
  reducedMotion: false,
  fontSize: 13,
  canvasBrightness: 1,
}
```

**New files:** `assets/data/challenge-modes.js`, `renderer/game/settings.js`

---

## Phase 21 — Backpack & Inventory Tab

Right now items live inside the Explore and Craft tabs with no unified view. The Backpack tab gives the player one place to see everything they own, including spirit stones as a first-class currency display.

### 21A — Backpack Tab

New tab "Pack" (袋) added between Craft and Sect in the tab row.

**Layout:**

```
┌──────────────────────────────┐
│ 💰 Spirit Stones: 1,240      │  ← always at top, large
│ 💎 Void Crystals: 3          │  ← secondary hard currency
├──────────────────────────────┤
│ [ All ] [ Mats ] [ Pills ]   │  ← filter tabs
│ [ Equip ] [ Rare ] [ Keys ]  │
├──────────────────────────────┤
│ ▸ Spirit Herb        ×14     │
│   Iron Ore           ×7      │
│   Beast Core         ×2      │
│   …                          │
├──────────────────────────────┤
│ Sort: [Name ▾] [Qty] [Type]  │
└──────────────────────────────┘
```

**Currency row** (always visible, not filterable):
- Spirit Stones — the main soft currency; show with `,` formatting and a ± delta indicator that fades after 3s when it changes.
- Void Crystals — hard currency for founding sects and late recipes; shown below Stones.

**Item categories (filter tabs):**
| Tab | Shows |
|-----|-------|
| All | Every item in inventory |
| Mats | Herbs, ores, essences, cores — crafting ingredients |
| Pills | Consumable pills and elixirs |
| Equip | Weapons and artifacts (currently equipped items highlighted) |
| Rare | Void Crystals, Chaos Essence, Realm Keys, Ancient Scripts — items with qty < 10 that are hard to obtain |
| Keys | Realm Keys + Celestial Calendar — items that unlock content |

**Item row:**
- Item name + quantity right-aligned.
- Tap/click a row to expand: shows description, "Use" button (pills/elixirs), "Equip" button (weapons/artifacts), "Discard ×1" button (with confirmation prompt).
- Currently equipped gear shows a ◆ badge on its row.

**Sort options:** Name A–Z, Quantity (high→low), Recently Acquired.

**Spirit Stones delta indicator:** When stones change by any amount, show a small `+N` / `-N` in green/red that floats up and fades — makes the currency feel alive without requiring a separate event log entry.

**Implementation notes:**
- Spirit Stones and Void Crystals live in `_s.spiritStones` and `_s.inventory['void_crystal']` today; the display just needs to surface them prominently. No new state shape required.
- The delta indicator needs a `_lastStonesSnapshot` in the render layer (not in game-state), tracked in `game.js`.
- Item metadata (descriptions, categories) comes from `ITEMS` in `assets/data/items.js` — add a `category` field to each item definition (`'mat' | 'pill' | 'equip' | 'rare' | 'key'`).

**State additions:** none (inventory already exists; only items.js needs `category` field added to each entry).

**New files:** none — tab HTML in `renderer/index.html`, styles in `renderer/styles.css`, render + wiring in `renderer/game.js`.

---

## Phase 22 — Active / Idle Mode Toggle + Mid-Late Automation

Two fundamentally different ways to play — the player can toggle between them freely at any time from the HUD. One prioritizes hands-off progression; the other rewards attention and clicking.

### 22A — The Toggle

A mode button lives in the titlebar next to the layout mode icon:

```
[⚙ Layout] [⚡ Active | 💤 Idle]
```

Switching is immediate and affects the next tick. Persists across sessions.

**State additions:**
```js
settings.playMode: 'idle',   // 'idle' | 'active'
```

---

### 22B — Idle Mode

The default. Everything works exactly as it does today, plus automation unlocks progressively through cultivation.

**Automation unlocks (Idle Mode only):**

| Feature | Unlock Stage | Behavior |
|---------|-------------|---------|
| Auto-Explore | Core Formation L1 (stageIndex 12) | Automatically relaunches the last used expedition when it returns. Can be paused per-location with a toggle in the Explore tab. |
| Auto-Sect Missions | Elder rank (rank 4) in any sect, or own sect Sect Hall Lv2 | Automatically re-queues completed missions of the same type if a slot is open. |
| Auto-Craft | Spirit Severing L1 (stageIndex 19) | Repeats the last crafted recipe as long as materials are available. Toggle per recipe in Craft tab. |
| Auto-Breakthrough | Nascent Soul L1 (stageIndex 18) | Automatically triggers a breakthrough attempt when Qi reaches the configured threshold (slider: 80%–100% of cap). Respects active pills. |

Each automation has an on/off toggle visible in its respective tab. Toggling one in Idle Mode does not affect Active Mode state.

Auto tasks emit a brief event-log line when they fire: `"[Auto] Expedition to Demon Marsh launched."` — same style as manual entries but prefixed `[Auto]`.

---

### 22C — Active Mode

No automation whatsoever — every expedition launch, mission queue, breakthrough attempt, and craft must be manually clicked. In exchange:

**Active Mode bonuses:**
- All expedition timers −35% (faster returns).
- Sect mission timers −25%.
- Crafting time −20% (where crafting has a time cost in future phases).
- Breakthrough attempt Qi loss on failure −10% extra (you're paying attention, you can course-correct sooner).

**Active Mode interaction bonuses (rewards actually clicking):**
- **Expedition push:** a "Push Harder" button appears for the last 20% of any expedition timer. Clicking it spends 10 Spirit Stones to add one extra roll on the drop table. Can only be used once per expedition.
- **Breakthrough focus:** during a breakthrough attempt a small 3s click-window appears (pulsing ring around the Qi bar). Clicking within the window adds +5% success chance for that attempt only. Missing the window has no penalty.
- **Craft attentiveness:** in Active Mode, each craft has a 10% chance to proc "Master's Touch" — doubles the output of that craft. Requires the player to have clicked the Craft tab within the last 60 seconds (i.e., you're watching).

**Active Mode constraints:**
- All automation toggles are greyed out and inert.
- Auto-Explore, Auto-Missions, Auto-Craft, and Auto-Breakthrough do nothing even if they were turned on in Idle Mode.
- The mode badge on the titlebar turns orange to make the state unmistakable.

---

### 22D — Mid/Late Automation Unlock Display

In Idle Mode, the Explore and Sect tabs show a small "Automation" section near the top listing what's unlocked and what unlocks next:

```
Automation
  ✅ Auto-Explore (Core Formation) — [ON] [OFF]
  ✅ Auto-Missions (Elder rank)   — [ON] [OFF]
  🔒 Auto-Craft — unlocks at Spirit Severing L1
  🔒 Auto-Breakthrough — unlocks at Nascent Soul L1
```

This gives mid-game players a concrete automation roadmap to look forward to.

**New files:** none — logic in `renderer/engine/game-state.js` (mode flag), automation dispatch in `renderer/game/expedition.js`, `renderer/game/sect.js`, `renderer/game/crafting.js`; UI wiring and Active Mode interaction windows in `renderer/game.js`.

---

## Phase 23 — Immortal Progression: Bloodline, Mortal Peril & Secret Arts

> **Requested 2026-09-25.** Replaces the "Ascension = automatic reincarnation" loop of Phase 8 with a
> *chance-based* Ascension, a post-Ascension Immortal progression, death + reincarnation, and a hidden
> **Bloodline Quality** stat carried down a family line. Also adds studyable **Secret Arts** (rare drops).
> Also answers the QA sim's #1 flag: every profile currently hits a long dead zone after Ascension
> (`npm run sim`). Cross-refs: Phase 8 (superseded parts), 16C (children), 18 (lineage tree / heirs),
> 20A (permadeath), 17 (bosses).

### 23A — Health & Death (生死)

A body can die. Realm Integrity stays what it is (the stability of your *cultivation*); Health is the body.

- **`health` (0–100)**, displayed as a bar under Integrity. Regenerates slowly (faster while meditating,
  with healing pills, or with a future Art).
- **Damage sources** (first pass): expeditions into zones whose enemy tier outclasses you, failed Heavenly
  Tribulation waves (Phase 7C), inner-demon style events at high realms, sect-war defeats you fought in (5C),
  failed Ascension (23C).
- **Health 0 → death.** A death screen shows the life summary, then **reincarnation** (23D). Normal mode never
  deletes the save line; **Permadeath (20A)** still ends the line with a tombstone.
- **Early death barely grows the bloodline** — growth scales with the highest stage reached (23B), so dying
  as a Qi Condensation disciple is a restart, not a shortcut.
- Optional later: **lifespan (寿元)** per realm (classic xianxia: if you don't break through before your
  lifespan runs out, you die of old age). Park until the base health loop feels right in the sim.

### 23B — Bloodline Quality (血脉品质)

A **hidden** number (0–100, soft cap) that belongs to the family line, not the save slot. It's stored in the
Phase 18 lineage record.

- **Hidden during play.** It's revealed only on the Ascension decision screen, and in the Ascension Hall /
  lineage tree after the first Ascension attempt. Before that, it only shows through flavor ("Your blood
  stirs faintly…" / "Heaven-blessed blood").
- **Effects:**
  - The main input to **Ascension survival chance** (23C).
  - A **mild Qi/s bonus**: +0.2% per point → up to +20% at 100. It stacks multiplicatively with the others,
    so re-run the sim pacing check after adding it.
- **A brand-new character** (new save / "new soul") starts at **0**.
- **Growth happens only at the end of a life** (death, failed Ascension, or successful Ascension then passing
  on the line). The next generation's value:
  ```
  heirBQ = parentBQ × carry + growth
  growth = G_base + G_self × (yourMaxStage/22)² + G_partner × (partnerMaxStage/22)²
  ```
  - **Reincarnate into your family** (a child from 16C, or an heir from the Solitary Lineage Art, 23E):
    `carry = 1.0` plus a small flat "family" bonus each generation. This is the intended best path.
  - **No family, new soul:** `carry ≈ 0.25`. You keep a sliver ("the Dao remembers you faintly"), but it's
    much weaker, as requested.
  - The squared stage terms make early deaths grow the line very little and late-game lives grow it a lot.
  - The partner term uses **how far your spouse cultivated** (16B NPC stage), so marrying a strong cultivator
    matters. With no partner that term is 0, unless the Solitary Lineage Art applies (23E).
  - Starting values to tune with the sim: `G_base 1`, `G_self 8`, `G_partner 5`, family flat bonus `+1`,
    soft cap 100.

### 23C — The Ascension Trial (飞升劫)

Reaching the peak of Spirit Severing no longer ascends automatically.
- **The Ascension screen** shows the revealed Bloodline Quality, the **survival chance**, and its
  breakdown. The player chooses **Ascend now** or **Keep cultivating**, to wait for more pills or Arts,
  or to secure an heir first.
- **Survival chance** = `base + BQ term + prep`, capped at 0.95 (never certain, like breakthroughs):
  - `base` about 5–10%, so a Bloodline 0 first-generation cultivator almost always fails. That makes the
    first life a "founding ancestor" and gives the multi-generation loop its purpose.
  - `BQ term` goes up to about +60% at BQ 100.
  - `prep` is a smaller slice from preparation: Tribulation Veteran title, full Integrity/Health,
    ascension-grade pills, specific Arts (23E).
- **Success:** you enter the **Immortal Realms** (23D). The mortal line continues through your heir later if
  you choose.
- **Failure:** the body dies (health → 0). You reincarnate (23D rules), and the line's BQ grows from this life.

### 23D — Reincarnation & the Immortal Realms

**Reincarnation screen** (extends 18C Heir Selection):

| Option | Condition | Bloodline carried |
|---|---|---|
| Reincarnate into your family | An adult child (16C) or a Solitary-Lineage heir (23E) exists | Full (`carry 1.0` + family bonus) |
| New soul | Always | Weak (`carry ≈ 0.25`) |

What carries over otherwise follows Phase 8 (Dao Seeds, sect legacy, etc.), which will need rebalancing
alongside this.

**Immortal Realms (post-Ascension progression)** give the endgame instead of an empty Ascension:
- New realm ladder, e.g. Earth Immortal (地仙) → Heavenly Immortal (天仙) → Golden Immortal (金仙) →
  Taiyi Golden Immortal (太乙金仙) → Daluo Golden Immortal (大罗金仙). Each has 3 layers, its own Qi cap
  scale, and its own art/sprite states. New sprite states go through the Asset Pipeline.
- Uses the same Qi loop with the Bloodline Qi bonus still applied. Immortal breakthroughs can carry small
  health risk, so dying and reincarnating stays possible at every level.
- An Immortal can **watch over the family line**: small passive boosts to the current generation. This gives
  a reason to keep the old immortal save meaningful.
- Pacing target: extend the GAMEDESIGN.md doubling curve (realms = days of idle). Add the new realms to
  `PACING_TARGETS_MIN` in `scripts/sim/profiles.js` when built.

### 23E — Secret Arts (秘术)

A second kind of learnable power, separate from Techniques (which are bought with stones). You **find**
Arts and **study** them.
- **Sources:**
  - Rare drops from high-tier expedition enemies (e.g. about 0.5–2% per expedition at enemy tier ≥ 3, on a
    new `rareDrops` entry in `LOCATIONS`).
  - Guaranteed/likely drops from **bosses**. The full version needs Phase 17 realm bosses, but a small
    earlier stand-in could be a rare "Boss appears" event on Heavenly Peak / Void Rift expeditions.
- **Studying:** one Art at a time on a real-time study timer (hours to days). It's sped up by
  **Comprehension**: `s.comprehension` already exists in state (Heavenly Insight events raise it) and is
  otherwise unused today. Arts have mastery levels 1–5 (re-study to deepen).
- **Inheritance:** a studied Art can be written into the **family library**. Heirs who reincarnate into the
  family can re-study it faster; new souls can't.
- **Launch set (examples, all rare):**

| Art | Effect |
|---|---|
| **Solitary Lineage Art (孤脉血嗣诀)** | Lets you **produce an heir from your own essence, with no partner**, to continue the family bloodline. The heir counts as family (full `carry`), and the partner growth term is replaced by ~50% of your own stage term: better than no family, weaker than a strong spouse. |
| Tortoise Breath Art (龟息功) | Health regen ×2; once per life, survive a lethal blow at 1 health |
| Heaven-Evading Art (避天诀) | +Ascension survival chance (by mastery) |
| Blood Refinement Art (炼血诀) | +bloodline growth for this life (by mastery) |
| Ten Thousand Swords Art (万剑诀) | Lets you safely fight one enemy tier higher on expeditions (less health damage) |

### 23 — Build order, state, sim

Suggested sub-phase order:
1. **23A** (Health & Death).
2. **23B + 23C + new-soul reincarnation.** This is playable without any family system. Do it right after
   Phase 7 (it needs Tribulation) or even before, since it fixes the post-Ascension dead zone.
3. **23D** (Immortal Realms).
4. **23E** (Secret Arts; the boss stand-in first).
5. **Family hooks** (reincarnate-into-child, partner term) once Phase 16 exists.

**State (sketch):**
- **Slot state:** `health`, `_healthRegenAcc`, `arts: { known: {id: mastery}, studying: {id, endsAt} }`,
  `immortalStage` (or extend `stageIndex` past 22).
- **Lineage record (18A, cross-slot):** `bloodlineQuality`, `generation`, `familyLibrary: [artId]`,
  `heirs: [...]`.
- Add a new `_ensurePhase23Fields()` for save migration (Rule 5).
- The cross-slot lineage file needs a new `window.electron.*` method in **both** `preload.js`/`main.js` and
  `renderer/engine/platform-storage.js` (Rule 7 / iOS).

**New files (expected):**
- `assets/data/arts.js`
- `assets/data/immortal-realms.js` (or rows appended to `stages.js`)
- `assets/data/bloodline.js` (growth/survival constants)
- `renderer/game/arts.js` (study timer)
- `renderer/game/ascension.js` (trial + reincarnation flow)
- `docs/systems/bloodline.md` (write it **before** code, Rule 6)

**QA sim (required, same change):**
- Teach `scripts/sim/bot.js` to decide Ascend-vs-wait (e.g. ascend when survival ≥ a threshold, otherwise
  keep farming prep) and to study Arts.
- Handle death/reincarnation as a run *continuing across generations*. Runs will need longer horizons (500h+).
- Add metrics: ascension attempts & survival rate, deaths by cause, generations per run, BQ per generation,
  time-to-first-Immortal.
- Add invariants: BQ within 0–cap, never lower after a family reincarnation, health within 0–100,
  survival chance ≤ 0.95.

**Open questions for the user before building:**
1. Survival chance: exact curve and cap (proposed max 95%)?
2. Should successful Immortals also be able to have heirs? Should players keep playing the Immortal while the
   heir plays, or switch between them?
3. How long should studying an Art take (hours vs days)? Should Arts be lost on a new-soul reincarnation?
4. Does lifespan (寿元) belong in v1 of Health or later?
5. Does the Solitary Lineage Art need a cost or drawback (e.g. health/lifespan, or a lower-quality heir)?

---

## Complete File Structure (after all phases)

```
START_HERE.md          ← Agent entry point (update every session)
CLAUDE.md              ← Dev rules
PLAN.md                ← This file
GAMEDESIGN.md          ← Game mechanics doc

main.js / preload.js
renderer/
  index.html / styles.css / game.js
  engine/
    game-state.js       ✅
    ascii-renderer.js   ✅
  game/
    cultivation.js      ✅
    expedition.js       ✅ Phase 2
    crafting.js         ✅ Phase 2
    beasts.js           ✅ Phase 3  (renderer/game/beasts.js)
    sect.js             ✅ Phase 4  (renderer/game/sect.js — 5B war logic → renderer/game/sect-war.js)
    dao.js              ← Phase 7
    tribulation.js      ← Phase 7
    reincarnation.js    ← Phase 8
    notifications.js    ← Phase 9
    npc-world.js        ← Phase 15
    family.js           ← Phase 16
    secret-realm.js     ← Phase 17
    lineage.js          ← Phase 18
    world-state.js      ← Phase 19
    settings.js         ← Phase 20
    active-mode.js      ← Phase 22 (Active Mode interaction windows)

assets/
  data/
    stages.js           ✅
    techniques.js       ✅
    events.js           ✅
    items.js            ✅ Phase 2+3 (beast_taming_talisman, pill_heart_calming integrity_restore)
    recipes.js          ✅ Phase 2+3 (talisman recipe)
    locations.js        ✅ Phase 2
    enemies.js          ✅ Phase 2
    beasts.js           ✅ Phase 3
    sects.js            ✅ Phase 4
    dao-paths.js        ← Phase 7
    tempering.js        ← Phase 14
    titles.js           ← Phase 10
    lore.js             ← Phase 11
    origins.js          ← Phase 12
    npc-names.js        ← Phase 15
    npc-personalities.js ← Phase 15
    realm-maps.js       ← Phase 17
    legacy-passives.js  ← Phase 18
    epochs.js           ← Phase 19
    challenge-modes.js  ← Phase 20
  sprites/
    cultivator-sprites.js  ✅
    enemy-sprites.js        ← Phase 2 (Asset Pipeline)
    beast-sprites.js        ✅ Phase 3 (Asset Pipeline — min score 8.0)
    pet-sprites.js          ← Phase 10 (Asset Pipeline)
    environment-sprites.js  ← Phase 10 (Asset Pipeline)
    tribulation-sprites.js  ← Phase 7 (Asset Pipeline)
```

---

## Build

```bash
npm run dist      # Windows portable .exe → dist/Cultivator Idle-win32-x64/
npm run dist:mac  # Mac .dmg → dist/
```

Build after every completed phase. Tag releases `v0.2.0`, `v0.3.0`, etc.
