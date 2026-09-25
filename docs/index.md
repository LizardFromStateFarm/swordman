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
| [sect-war.md](systems/sect-war.md) | Sect war timer, scouting/preparation phases, auto-resolve, reinforcement, alliances, array damage | sect-war.js · game-state.js (war API, _recalc, tickSectWar) · renderer/game/sect-war.js · game.js (renderSectWarPanel) |
| [ui-layout.md](systems/ui-layout.md) | Window structure, tab pattern, CSS vars, render helpers | game.js · index.html · styles.css |
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
