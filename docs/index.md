# Technical Docs — Index

Concise system references for agents. **Load only the doc for the system you are actively modifying.**
Never load all docs at session start — that defeats the purpose.

## Available docs

| Doc | What it covers | Load when you touch… |
|-----|---------------|----------------------|
| [core-loop.md](systems/core-loop.md) | Qi accumulation, stages, roots, breakthroughs, techniques, meditation | game-state.js · stages.js · techniques.js |
| [expedition.md](systems/expedition.md) | Expedition timer, inventory, drop resolution, offline catch-up | expedition.js · locations.js · enemies.js · items.js (expedition side) |
| [crafting.md](systems/crafting.md) | Recipes, equipping, pills, elixirs, root rerolls | crafting.js · recipes.js · items.js (craft side) · game-state.js (craftItem, equipItem, etc.) |
| [integrity.md](systems/integrity.md) | Realm Integrity bar, demotion, Spiritual Beasts (tame/level/expedition) | game-state.js · beasts.js (data) · beast-sprites.js · game.js (renderExplore) |
| [sects.md](systems/sects.md) | Sect joining, ranks, contribution, missions, per-sect bonuses | sects.js · renderer/game/sect.js · game-state.js (sect API, _recalc) · game.js (renderSect) |
| [own-sect.md](systems/own-sect.md) | Founding your own sect, buildings, disciples, recruit pool, income, beast slots, war-defense/fame | sect-buildings.js · game-state.js (own-sect API, _recalc, tickOwnSect) · game.js (renderOwnSect) |
| [sect-war.md](systems/sect-war.md) | Sect wars: own-sect (5B: scouting/prep, reinforcement, alliances, array damage) + member wars for joined sects (5C) | sect-war.js · game-state.js (war API, _recalc, tickSectWar) · renderer/game/sect-war.js · game.js (renderSectWarPanel) |
| [bloodline.md](systems/bloodline.md) | Health & Death, hidden Bloodline Quality, chance-based Ascension Trial, reincarnation (Phase 23A–C) | bloodline.js · game-state.js (health/ascension/death) · events.js (inner_demon) · cultivation.js · game.js (ascension/death overlays) |
| [settings.md](systems/settings.md) | ⚙ Settings panel: per-slot presentation prefs (numbers, text size, color-blind palette, background opacity, animation), data-driven from SETTINGS_DEFS (Phase 20C) | settings.js (data + renderer/game) · game-state.js (setSetting) · fmt() · ascii-renderer.js speed/motion |
| [banter.md](systems/banter.md) | Personalities + banter engine: triggers, speech bubble, Banter log, no-repeat buffer, profanity mask (Phase 29). Writers: [banter-writing-guide.md](systems/banter-writing-guide.md) | personalities.js · banter-lines.js · renderer/game/banter.js · game-state.js (onGameEvent, recordBanter) · game.js (bubble) |
| [ui-layout.md](systems/ui-layout.md) | Window structure, layout modes, tab pattern, CSS vars, render helpers, UX Audit | game.js · index.html · styles.css · game/layout.js · main.js |
| [icons.md](systems/icons.md) | Custom UI icon set (1.8d): `Icon()` helper, icon list, what replaced emoji/chrome CJK, the no-emoji / CJK-only-for-nav-marks rules | assets/icons/ui-icons.js · renderer/game/icons.js · styles.css (.ic) |
| [ui-review.md](systems/ui-review.md) | Visual Review Gate score history (0–10 vs mobile indie idle games; UI passes ≥ 7.5, assets ≥ 8.0) | .agents/rules/ui-review.md |
| [backpack.md](systems/backpack.md) | Pack tab: item `category` field, filter chips, sort, Use/Equip/Discard, currency delta indicator (Phase 21) | items.js (category) · game-state.js (discardItem) · renderer/game/crafting.js (discard) · game.js (renderPack) |
| [automation.md](systems/automation.md) | Active/Idle Mode toggle, staged automation unlocks (Auto-Explore/Missions/Craft/Breakthrough), Active Mode bonuses (Push Harder, breakthrough focus, Master's Touch) (Phase 22) | automation.js · game-state.js (mode + automation dispatch) · game.js (mode button, Automation panel) |
| [notifications.md](systems/notifications.md) | System tray + opt-in desktop notifications: per-type toggles, cooldowns, close-to-tray (Phase 9A–B) | main.js (Tray/Notification) · preload.js · platform-storage.js · renderer/game/notifications.js · game-state.js (beast_tamed/death emits) |
| [life-loop.md](systems/life-loop.md) | **Build spec for M2 (2.2–2.5 built: shared generators + person record; game clock (age is a stat only — no lifespan since 2026-09-26) + Pass the Mantle; pacing; marriage & children lite. 2.6–2.8 not built yet):** end-of-life flow, heirs, Ancestral Hall, clan legacies, pacing compression (Phases 30/31, 16-lite, 18C) | persons.js · names.js · lifespan.js · clan-legacies.js (planned) · game-state.js · renderer/game/life-loop.js (planned) |
| [clan-succession.md](systems/clan-succession.md) | **2.6a–f built; 2.7 (Ancestral Hall + Clan Legacies) built:** world/life save split, children who cultivate, bond + morality, Tournament of Heirs, reign sim, rebirth as a descendant/orphan, head challenges, branch wars, secession, Ancestral Merit/legacies/catch-up, Ascended Ancestor ending | game-state.js (`s.world`, `s.interlude`, `s.birth`) · family.js · succession.js · clan-legacies.js |
| [family.md](systems/family.md) | **Family depth (Phase 16-lite+):** spouse affection, personality-driven marriage + crisis events, duel to the death, former spouses, uncapped children (commit A built); lovers via expedition encounters, affair discovery + personality reactions (commit B) | family.js · lifespan.js · game-state.js (`s.family`) · game.js (family overlay, Stats, Explore) |
| [dev-presets.md](systems/dev-presets.md) | Dev-only late-game test characters on charselect (npm start only) | dev-presets.js · game-state.js (buildDevSave) · charselect in game.js · isDev IPC |
| [qa-sim.md](systems/qa-sim.md) | Headless bot harness: `npm run sim` → pacing/fun/health/perf report for balancing | scripts/sim/* · any balance change · adding a new system (bot + invariants) |
| [ios-port.md](systems/ios-port.md) | Capacitor iOS shell, platform storage shim, www/ build | capacitor.config.json · scripts/build-ios-web.js · renderer/engine/platform-storage.js |

## Rules for agents

1. **Before modifying a system:** check if its doc exists here. If yes, read it instead of cold-reading all source files.
2. **After modifying a system:** update the relevant doc — state shape, API, constraints — to match the new reality.
3. **When adding a new system (new Phase):** create `docs/systems/<system>.md` using the template below BEFORE writing code. The doc is the plan made concrete.
4. **One-liner fixes** (typo, off-by-one, CSS tweak): no doc update needed.

## New system doc template

Copy this to `docs/systems/<name>.md` when starting a new phase:

```markdown
# [System Name] — Reference
_Covers: [file list] · Phase: N · Updated: YYYY-MM-DD_

## State
<!-- All state fields this system owns or reads. field: type — one-line description -->

## API
<!-- Public methods exposed via game-state.js. methodName(args) → return — one line each -->

## Data Shape
<!-- Non-obvious fields in data files. Skip anything self-explanatory. -->

## Wiring
<!-- file → what it calls → when. Keep to 3–5 lines. -->

## Invariants
<!-- Rules that must always hold. Numbered list. -->

## Gotchas
<!-- Things that will burn a future agent if they don't know them. -->
```

Keep each doc under 120 lines. No prose explanations of obvious code. If the code already shows it, the doc doesn't need to repeat it.
