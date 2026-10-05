# Technical Docs — Index

Concise system references for agents. **Load only the doc for the system you are actively modifying.**
Never load all docs at session start — that defeats the purpose.

## Available docs

**Command reference for humans:** [commands.html](commands.html) — every npm dev / test / sim-bot / smoke / build / Android release command on one page (open in a browser).

| Doc | What it covers | Load when you touch… |
|-----|---------------|----------------------|
| [core-loop.md](systems/core-loop.md) | Qi accumulation, stages, roots, breakthroughs, techniques, meditation | game-state.js · stages.js · techniques.js |
| [expedition.md](systems/expedition.md) | Expedition timer, inventory, drop resolution, offline catch-up | expedition.js · locations.js · enemies.js · items.js (expedition side) |
| [crafting.md](systems/crafting.md) | Recipes, equipping, pills, elixirs, root rerolls, **healing pills + discovery-gated recipes (Phase 44)** | crafting.js · recipes.js · items.js (craft side) · game-state.js (craftItem, equipItem, useHealPill, recipeKnown, etc.) |
| [integrity.md](systems/integrity.md) | Realm Integrity bar, demotion, Spiritual Beasts (tame/level/expedition; Phase 41 graded tame talismans) | game-state.js · beasts.js · talismans.js (data) · beast-sprites.js · game.js (renderBeasts) · beast-detail.js (details page) |
| [sects.md](systems/sects.md) | Sect joining, ranks, contribution, missions, per-sect bonuses | sects.js · renderer/game/sect.js · game-state.js (sect API, _recalc) · game.js (renderSect) |
| [own-sect.md](systems/own-sect.md) | Founding your own sect, buildings, disciples, recruit pool, income, beast slots, war-defense/fame | sect-buildings.js · game-state.js (own-sect API, _recalc, tickOwnSect) · game.js (renderOwnSect) |
| [sect-war.md](systems/sect-war.md) | Sect wars: own-sect (5B: scouting/prep, reinforcement, alliances, array damage) + member wars for joined sects (5C) | sect-war.js · game-state.js (war API, _recalc, tickSectWar) · renderer/game/sect-war.js · game.js (renderSectWarPanel) |
| [body-constitution.md](systems/body-constitution.md) | **Phase 14 (built 2026-10-03):** every life starts in a Frail Body (F) and trains to S on real-time tempering; the tier sets max Health, regen, failed-breakthrough Qi kept and fight power; ordeals stop at a crisis you answer; the tier only rises through a trial you choose; scars, taint, Blood Forging, Auto-Temper; the Tempering Strikes + Meridian Flow mini-games; Temper their body (children) | tempering.js · game-state.js · body-view.js · minigames.js · breakdowns.js · attention.js · family-view.js · combat.js |
| [bloodline.md](systems/bloodline.md) | Health & Death, hidden Bloodline Quality, chance-based Ascension Trial, reincarnation (Phase 23A–C) | bloodline.js · game-state.js (health/ascension/death) · events.js (inner_demon) · cultivation.js · game.js (ascension/death overlays) |
| [settings.md](systems/settings.md) | ⚙ Settings panel: per-slot presentation prefs (numbers, text size, color-blind palette, background opacity, animation), data-driven from SETTINGS_DEFS (Phase 20C) | settings.js (data + renderer/game) · game-state.js (setSetting) · fmt() · ascii-renderer.js speed/motion |
| [banter.md](systems/banter.md) | Personalities + banter engine: triggers, speech bubble, Banter log, no-repeat buffer, profanity mask (Phase 29). Writers: [banter-writing-guide.md](systems/banter-writing-guide.md) | personalities.js · banter-lines.js · renderer/game/banter.js · game-state.js (onGameEvent, recordBanter) · game.js (bubble) |
| [ui-layout.md](systems/ui-layout.md) | Window structure, layout modes, tab pattern, CSS vars, render helpers, UX Audit | game.js · index.html · styles.css · game/layout.js · main.js |
| [art-engine.md](systems/art-engine.md) | Hybrid ink art engine (A3-1, Phase 34): InkRenderer + SpriteRenderer switch, INK_ART data format, layers/motion/effects, LOD, Sprite art setting | ink-renderer.js · sprite-renderer.js · assets/sprites/ink-cultivator.js · layout.js (canvas size) |
| [scene-art.md](systems/scene-art.md) | Sect Base scene (A7, Phase 38A): the large view-only compound diorama — SceneRenderer (an InkRenderer subclass), the SECT_SCENE layout, the build-growth burst, the Base view | scene-renderer.js · assets/scenes/sect-base-scene.js · base-view.js |
| [living-world.md](systems/living-world.md) | **Phase 28 (spec approved 2026-10-03; 4.8 built: the Heavenly Rankings (World → Rankings: Class / Rising Dragon / Heaven, rank power, Veil, challengers, genius hunters, invitations, the Class duel); 4.10b built: Your Rival (World → Rival, rival cards, heat, blood feud, houses across lives); 4.10 built: memory, Honour/Infamy, rumours, grudges to heirs, the person card's 8 deeds; 4.9 built: encounters + the Met on the road queue; 4.2 built: the registry + person card; 4.3 built: the light world sim + World → Class; 4.6 built: the replacement controller + World → Chronicle; 4.4/4.5 built: the heavy tier, NPC goals, known-first casting; 4.7 built: World → People, pins, tappable log names):** one registry of persons (family, sects, arena, strangers), heavy/light lives on game time, old age as a backstop, ~60 classmates per life, queued encounter cards with NPC intent, memory/reputation, Your Rival, storage budget, build order 4.2→4.8 | game-state.js (world/persons) · persons.js · world-population.js · npc-lives.js · person-card.js · class-view.js · chronicle-view.js · people-view.js · encounter-view.js · rival-view.js · rankings-view.js |
| [npc-sects.md](systems/npc-sects.md) | **Phase 43 (43a–43e + 43h built):** levelled sect buildings (yours and the world's), the NPC sect registry + growth sim, wars against real rivals, a joined blessing that scales with the sect (fund its halls, the levy, the court), burning one to the ground, and taking a sect over as a Grand Elder | sect-buildings.js · npc-sects.js · game-state.js (own-sect/sect-war) · sect-view.js · scene-renderer.js |
| [sect-branches.md](systems/sect-branches.md) | **Phase 45 (built):** sub-leaders (分舵) — appoint a disciple as a Branch Head who gathers disciples of their own; branch rivalry + promotion; the **Tournament of Branches**; inviting your grown children into the sect for free; loyalty only sours on a direct wrong | sect-branches.js · game-state.js (branch API, `_tickBranches`, `_recalc`, `tickOwnSect`) · sect-view.js · family-view.js |
| [bosses.md](systems/bosses.md) | **v1 add-on (built 2026-10-04):** two legendary Hunt bosses with phase scripts (life ≥ 3 / ≥ 6), never lethal, teaching soul-kept techniques: **Seed of the Self** (a mirror heir, The Mirror Turns) and **Body Beyond the Body** (a clone = a second expedition, shatter, It Lingers) | bosses.js · game-state.js (boss section) · hunt-view.js · combat.js · family-view.js · game.js (clone panel) · attention.js · bot.js |
| [tutorial.md](systems/tutorial.md) | **Task 1.23 (built 2026-10-04):** skippable coach marks: a spotlight on the real control + a short card, played on a new cultivator (the HUD tour), the first open of every view, unlocks on screen and the first battle; seen-state across all saves (soul record); the Guide in ⚙ Settings (replay, tips on/off, show every tip again) | tutorial.js (data) · renderer/game/tutorial.js · game-state.js (soul: tutorialInfo…) · settings.js (guide hook) · game.js · cdp.js (smoke hold) |
| [lineage-sect.md](systems/lineage-sect.md) | **Phase 46 (built):** a player-owned sect is inherited by a branch head on death and lives on as a world sect; ancestral catch-up removed, **Bloodline Quality → Qi/s** instead; the next life is recruited back into the old sect at Core Formation; the world sim ages/kills sect leaders and churns members | bloodline.js · clan-legacies.js · npc-sects.js · succession.js · game-state.js · sect-view.js · attention.js · breakdowns.js |
| [icons.md](systems/icons.md) | Custom UI icon set (1.8d): `Icon()` helper, icon list, what replaced emoji/chrome CJK, the no-emoji / CJK-only-for-nav-marks rules | assets/icons/ui-icons.js · renderer/game/icons.js · styles.css (.ic) |
| [ui-review.md](systems/ui-review.md) | Visual Review Gate score history (0–10 vs mobile indie idle games; UI passes ≥ 7.5, assets ≥ 8.0) | .agents/rules/ui-review.md |
| [backpack.md](systems/backpack.md) | Pack tab: item `category` field, filter chips, sort, Use/Equip/Discard, currency delta indicator (Phase 21) | items.js (category) · game-state.js (discardItem) · renderer/game/crafting.js (discard) · game.js (renderPack) |
| [automation.md](systems/automation.md) | Active/Idle Mode toggle, staged automation unlocks (Auto-Explore/Missions/Craft/Breakthrough), Active Mode bonuses (Push Harder, breakthrough focus, Master's Touch) (Phase 22) | automation.js · game-state.js (mode + automation dispatch) · game.js (mode button, Automation panel) |
| [notifications.md](systems/notifications.md) | System tray + opt-in desktop notifications: per-type toggles, cooldowns, close-to-tray (Phase 9A–B) | main.js (Tray/Notification) · preload.js · platform-storage.js · renderer/game/notifications.js · game-state.js (beast_tamed/death emits) |
| [life-loop.md](systems/life-loop.md) | **Build spec for M2 (2.2–2.5 built: shared generators + person record; game clock (age is a stat only — no lifespan since 2026-09-26) + Pass the Mantle; pacing; marriage & children lite. 2.6–2.8 not built yet):** end-of-life flow, heirs, Ancestral Hall, clan legacies, pacing compression (Phases 30/31, 16-lite, 18C) | persons.js · names.js · lifespan.js · clan-legacies.js (planned) · game-state.js · renderer/game/life-loop.js (planned) |
| [clan-succession.md](systems/clan-succession.md) | **2.6a–f built; 2.7 (Ancestral Hall + Clan Legacies) built:** world/life save split, children who cultivate, bond + morality, Tournament of Heirs, reign sim, rebirth as a descendant/orphan, head challenges, branch wars, secession, Ancestral Merit/legacies/catch-up, Ascended Ancestor ending | game-state.js (`s.world`, `s.interlude`, `s.birth`) · family.js · succession.js · clan-legacies.js |
| [family.md](systems/family.md) | **Family depth (Phase 16-lite+):** spouse affection, personality-driven marriage + crisis events, duel to the death, former spouses, uncapped children (commit A built); lovers via expedition encounters, affair discovery + personality reactions (commit B) | family.js · lifespan.js · game-state.js (`s.family`) · game.js (family overlay, Stats, Explore) |
| [combat.md](systems/combat.md) | **Phase 35 (A6-1 + A6-2 built):** beast battles from Roam → Beasts on a full-window battle page — stance odds, Press/Guard/Feint exchanges with real wounds, finish/spare/bind, bestiary, returning beasts; the fight engine generalized beyond family fights. A6-2: Roam → Hunt (hunting grounds, track a beast), Roam → Bestiary view, slayer reputation, battle banter, sim bot hunts. A6-3a: spouse duels, head challenges, defending the seat and your step-down bouts on the battle page vs ink duelists; finish/spare · raise/humble; debts + grudges. A6-3b: the Arena (Roam → Arena: six rings, push-your-luck purse, streak, renown, blood matches, titles, grudge call-outs). **Phase 41:** four graded tame talismans (40–90%), a failed tame that fights or flees, and the bind roll. A6-3c bosses spec | game-state.js (f.fight, beast battles, s.hunt) · beasts.js (BEAST_FIGHT_*, HUNT_GROUNDS) · talismans.js (grades) · renderer/game/combat.js · renderer/game/hunt-view.js · renderer/engine/battle-scene.js · breakdowns.js (beastfight) |
| [arts.md](systems/arts.md) | **Phase 42 — 1.11 sell ✅ · 1.12 arts core ✅ · 1.13a/b beasts on moves + effects ✅ · 1.14a people on moves ✅ · 1.14b rivals, sect + clan libraries, study desks by realm ✅; next 1.15 QA & Balance:** Arts & Move Combat: 72 combat arts (5 grades, Five Elements) learned by studying manuals; breakthrough pick-1-of-3 + drops from expeditions / beasts / Arena / duelists / sect + clan libraries; 4 move slots + passives by realm (Path → Arts); a Pokemon-like engine (HP = Health, combat Qi with no cooldowns, parry QTE, statuses, temper AI) replacing Press/Guard/Feint; Sell in Pack | assets/data/arts.js · game-state.js · arts-view.js · combat.js · battle-scene.js (planned) |
| [soul-points.md](systems/soul-points.md) | **Phase 40 (v1 finish) — built (40a + 40b):** cross-save Soul Points from failed Ascension Trials, Soul Resonance (+Qi/s), the Immortal Ascension cinematic, the finish screen ("your race to immortality") | soul.js · game-state.js (soul API) · main.js/preload.js/platform-storage.js (soul file) · soul-view.js · immortal-view.js · ascension-cinematic.js · ink-renderer.js (bare) |
| [dev-presets.md](systems/dev-presets.md) | Dev-only late-game test characters on charselect (npm start only) | dev-presets.js · game-state.js (buildDevSave) · charselect in game.js · isDev IPC |
| [qa-sim.md](systems/qa-sim.md) | Headless bot harness: `npm run sim` → pacing/fun/health/perf report for balancing | scripts/sim/* · any balance change · adding a new system (bot + invariants) |
| [release.md](systems/release.md) | **`npm run release`** — the one build+publish pipeline: steps, flags, versioning, `com.cultivator.idle`, credentials, gotchas | scripts/release.js · codemagic.yaml · package.json (dist/release) |
| [ios-port.md](systems/ios-port.md) | Capacitor iOS shell, platform storage shim, www/ build | capacitor.config.json · scripts/build-ios-web.js · renderer/engine/platform-storage.js |
| [android-port.md](systems/android-port.md) | Capacitor Android shell, Gradle signing, Play upload, `release:android` | android/ · scripts/release-android.js · capacitor.config.json |

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
