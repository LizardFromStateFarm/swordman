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
| Health & Death, Bloodline Quality, chance-based Ascension Trial | ✅ Phase 23A–C |
| ⚙ Settings panel (numbers, text size, color-blind, background opacity, animation) | ✅ Phase 20C (M1 1.1) |
| Personalities (14) + banter: speech bubble, Banter log, frequency + swearing settings | ✅ Phase 29 (M1 1.2) |
| Animation + Visual Overhaul (incl. window/layout modes) | ⬜ Phase 6 |
| Dao Paths, Tribulation | ⬜ Phase 7 (Phase 8 superseded by 23 + 31) |
| Tray + opt-in desktop notifications (time-of-day = cosmetic only, M8) | ⬜ Phase 9 |
| War Standing Orders (absence never punished) | ⬜ Phase 32 (M1) |
| Lifespan & Game Time (age passes only while open) | ⬜ Phase 30 (M2) |
| Ancestral Hall & Clan Legacies (meta progression, heirs, Ascended Ancestor) | ⬜ Phase 31 (M2) |
| Birth Origin & Character Foundation | ⬜ Phase 12 |
| Alignment / Good vs Evil system | ⬜ Phase 13 |
| Body Constitution & Physical Tempering | ⬜ Phase 14 |
| NPC World Simulation (personalities, sects) | ⬜ Phase 15 → superseded by Phase 28 (M4) |
| Marriage & Family system | ⬜ Phase 16 (lite in M2, full in M6) |
| Secret Realm Dungeons (ASCII map grid) | ⬜ Phase 17 |
| Lineage & Heir Inheritance | ⬜ Phase 18 |
| World Epochs & Spiritual Tides | ⬜ Phase 19 |
| Challenge Modes + Permadeath + Settings | ⬜ Phase 20 |
| Backpack & Inventory Tab (unified item/currency view) | ⬜ Phase 21 |
| Active / Idle Mode Toggle + Mid-Late Automation | ⬜ Phase 22 |
| Immortal Realms content + Secret Arts (post-Ascension endgame) | ⬜ Phase 23D–E |
| Immortal Paths: Tyrant / Devourer / Celestial Deity / Heaven's Executioner | ⬜ Phase 24 (planned) |
| Doctrine (道统) | ⬜ Phase 25 (planned) |
| Immortal Island (仙岛) + ascension petitions | ⬜ Phase 26 (planned) |
| Deep Sect Management (offices, Recruiter, manual recruiting) | ⬜ Phase 27 (planned) |
| Persistent Living World (every NPC tracked, cohort, encounters, rankings) | ⬜ Phase 28 (planned) |

> **Build order lives in PLAN.md → "Development Roadmap" (milestones M1–M8).** The table above is by feature,
> not by order. **Design pillars** (GAMEDESIGN.md, top of PLAN.md) override older design text: single-player,
> ~10–20h mortal lives, death → heir → meta progression, never punish absence, no store logic.

---

## Last Session — UPDATE THIS EVERY SESSION

```
Date: 2026-09-25 (session 12) — PLANNING ONLY, no code changed
Agent: User redirected the design: "just an enjoyable single player game … not the profit". Part of the fun is
  dying, making a new character, continuing the family and meta progression. Nobody should spend 100+ h on one
  character unless they reach the late-game Immortal era, where progression changes.
  User decisions: mortal life ≈ 10–20h (casual); age passes ONLY while the game is open (offline still gives Qi);
  the life loop moves up to M2; real-time features are converted to game time, not cut.
  - GAMEDESIGN.md: new Design Pillars (6) + Pacing Targets (life loop). Leaderboard / NG+ multiplier removed.
  - PLAN.md: pillars summary at the top. Roadmap rewritten and milestones RENUMBERED (M1–M8; old M2 = new M3 …
    old M7 = new M8; START_HERE history before this entry uses the old numbers). New phases:
      30 Lifespan & Game Time (1 game yr / open minute, lifespan per realm, Twilight: Final Seclusion or Pass
         the Mantle, one unified end-of-life flow)
      31 Ancestral Hall & Clan Legacies (slot = clan; Ancestral Merit mostly from clan firsts; legacies are mostly
         unlocks; ancestral catch-up below the clan best; Ascended Ancestor ending fixes the dead zone;
         absorbs Phase 8 — Dao Seeds CUT — and 18B)
      32 War Standing Orders (replaces war call windows; absence never punished) — M1 task 1.4
    + "M2 family (lite)": proposal event, spouse/children as minimal person records (the schema M4 extends),
      heir selection with a distant-cousin fallback. Next free phase number: 33.
  - "Changed 2026-09-25 (pillars)" notes on 7, 8, 9B–D (time-of-day/seasons → cosmetic only), 14, 16, 18, 19
    (epochs on game time, shifting between generations), 20B, 21 (Void Crystals ≠ hard currency), 23, 28
    (throttle/rankings on game time), and the open questions.
  Not done: all numbers in 30/31 are starting values. Task 2.1 must write docs/systems/life-loop.md and REVIEW the
    lifespan table + legacy list with the user before any code.
  Next: M1 1.3 (tray + opt-in notifications) — the assessment from this session still applies, minus the
    "afk war-window flag" goal (moved to 1.4 Standing Orders). Or jump to M2 2.1 if the user wants the life loop
    first.

Date: 2026-09-25 (session 11, part 2)
Agent: Roadmap M1 task 1.2, Phase 29 Personality & Banter. Committed 1.1 first (8b0b568). User asked for parallel
  writing agents with short personality guides, plus a nonsense one ("borgin and gorgin"), a nice guy and a psychotic
  one, all funny and not afraid to curse.
  - 14 personalities (assets/data/personalities.js): the 11 from the plan + Unhinged Psycho, Nonsense Gremlin, Genuinely
    Nice Guy (replaces Naive Optimist). Rolled at new game and on migration (saved immediately so it can't re-roll),
    re-rolled on reincarnation (new soul). Shown in the Stats badge + on charselect cards.
  - Content: docs/systems/banter-writing-guide.md is the brief. 4 parallel agents wrote ~100 lines per personality, and I
    added a swearing pass (the agents under-swore: 0–8 lines each). Total 1,579 lines in assets/data/banter-lines.js,
    zero holes, zero dups, all ≤ 140 chars. The merge script lived in scratchpad (not committed). Edit
    banter-lines.js directly from now on.
  - Engine: renderer/game/banter.js BanterSystem (DOM-free, the sim runs it). game-state.js got onGameEvent() emits
    (bt_success/bt_fail{streak}/expedition_return{rareItem}/war_call/won/lost (live + seen only)/reborn/welcome_back)
    + recordBanter() + markTimeOfDay(). Low health, morning/night and ascension_trial are handled engine/UI-side.
    Rare drop = drop-table weight ≤ 15%.
  - UI: #banter-bubble (fixed, z 210 above overlays, tap to dismiss, fades after 6s; Asset Pipeline 8.1 on the first
    pass). Banter log (last 50) at the bottom of Stats. New settings: Chatter Off/Rare/Norm/Chatty + Swearing
    Uncut/F*** (mask at display time).
  - Sim: new invariants personality_invalid, banter_buffer_over_cap, banter_pool_holes. sim:quick healthy. The full
    sim was skipped (cosmetic, no balance impact).
  - Verified: npm test, sim:quick, a trigger-by-trigger script (low health, war, rare drop, welcome back incl. the real
    initSlot path, fail streak, reborn, mask, Off = silent), build:web, dist, and the real app over CDP on a scratch
    profile (bubble, Stats badge, settings rows, charselect label). Fixed 2 bugs found that way: the bubble capped at
    150px wide, and a migrated personality re-rolled on reload.
  Not done: 29C (≤2% stat flavor skipped by design; dark/holy variants need 13/24). The line quality was
    spot-checked, not read line-by-line (1,579 lines), so the user should flag duds. The iOS layout wasn't checked by eye.
  Next: M1 task 1.3 (tray + desktop notifications) or 1.4 (Backpack tab).

Date: 2026-09-25 (session 11)
Agent: Roadmap M1 task 1.1 — Phase 20C Settings (⚙). User approved the assessment and asked to add adjustable
  background opacity. Also clarified CLAUDE.md's pre-task rule: orientation reads (START_HERE/CLAUDE/PLAN/GAMEDESIGN/
  docs/**) need no assessment, and the assessment is required once a task is picked, before source reads or changes.
  - ⚙ titlebar button → #settings-overlay (overlay, not a 7th tab). Rows render from SETTINGS_DEFS
    (assets/data/settings.js): Numbers raw/1.2K/1.2e3 · Panel text S/M/L (zoom on #tab-body) · Color vision
    off/deutan/protan · Background opacity 20–100% slider (live preview while dragging, saves on release) · Animation
    0.5/1/2× · Reduce motion · Sprite glow 70/100/130%.
  - State: s.settings (per slot) in _newGame + _ensurePhase20CFields (fills defaults, resets invalid values, drops
    unknown keys). Carried across _die() reincarnation. API: setSetting(id,v) / getSettings() / defaultSettings().
  - renderer/game/settings.js SettingsUI.apply() diffs and applies on every non-tick notify. The renderer got
    setSpeed()/setReducedMotion(). The health-bar lerp + toast now follow --red/--jade (palette-aware).
    Charselect resets to default presentation.
  - Color-blind palette through the Asset Pipeline: rev1 7.8 FAIL, rev2 7.8 FAIL, rev3 8.0 PASS (deutan 8.2 /
    protan 7.8). Key finding: the sky-blue "jade" in rev1/2 collided with --purple under deutan simulation (ΔE≈8),
    which the reviewers missed. Rev3 was picked by a computed Machado-sim + ΔE search (scratch script, not committed).
    Deutan #E4572E/#4BD2C2, Protan #F0502A/#45C8E8.
  - Sim: loads settings.js, new invariant settings_invalid. No balance impact (presentation only), so the full
    `npm run sim` was skipped by design; sim:quick is healthy.
  - Verified: npm test, sim:quick, direct API/migration/death-carry script, npm run build:web, npm run dist, and
    drove the real Electron app over CDP with --user-data-dir pointed at a scratch folder (the user's real slots are
    never touched; that's a reusable trick for future UI checks). Screenshotted the panel and HUD with deutan + 30%
    opacity + raw numbers + large text.
  Not verified: the look at 20% opacity over a real desktop (CDP screenshots composite transparency onto grey), and
    the iOS layout by eye.
  Next: roadmap M1 task 1.2 (banter engine; add its frequency setting by appending to SETTINGS_DEFS).

Date: 2026-09-25 (session 10) — PLANNING ONLY, no code changed
Agent: User asked to reorder PLAN.md so it reflects the real development order, plus new decisions/systems.
  - PLAN.md restructured, and NO phase was renumbered: phase numbers are stable IDs cited by code/docs/git.
    The new top of the file has:
      - "How this plan is organized"
      - a Phase Index (phase → status → milestone)
      - a **Development Roadmap**: milestones M0 (built) → M1 QoL & banter → M2 character foundation →
        M3 Living World → M4 Deep Sect Mgmt → M5 Family & Lineage → M6 Immortal Era → M7 polish. Each is a
        table of session-sized tasks with Needs / Done-when.
    The design sections below were moved into the same milestone order (text unchanged except the edits
    listed below). Next free phase number: 30.
  - **Changed the session-9 recommendation:** Phase 27 (sect mgmt) now comes AFTER 28 core (M3 → M4), since
    disciples/recruiters are persons and building recruitment on anonymous 5A disciples would mean building
    it twice. A new task 2.1 extracts the shared roll generators + one `powerScore()` before M3.
  - User decisions recorded:
      - Paths are not locked at first. A Point of No Return comes at Path Mastery 60 in one method (warning
        at 45), and after that the same-side method stays usable as a secondary at 50% (24A).
      - Enslaving/devouring your own ascended disciples is allowed (26F).
      - The living world is a heavy+light sim mix built so names recur (28B).
  - New design in Phase 28 (now "supersedes 15 and 11A"):
      - 28B familiar-faces rules: familiarity counter, known-first casting ~75%, new-name throttle
      - 28H starting cohort: ~40–60 NPCs start with you, including 3–5 "Heaven's Chosen" rivals (the 11A
        rival is folded in here)
      - 28H natural replacement: band population controller, births, awakening waves, wanderers, hidden
        masters, role succession, no recycled names; ascended NPCs move to an Immortal population you meet
        again
      - 28I encounters on expeditions/missions/realms/wars, with a stance setting and choice cards
      - 28J Heaven Ranking (strongest) + Rising Dragon Ranking (fastest-growing newcomers), both using one
        shared powerScore()
  - The open-questions section was rewritten: resolved items are marked ✅, and 6 questions are still open
    (e.g. player lifespan, Rising Dragon age limit).
  Follow-up (same session, user decisions):
  - Rising Dragon Ranking limit is 30 real days, and a new soul restarts eligibility.
  - New 3rd board "Your Class" (同届榜): your starting cohort, alive/fallen/ascended, never ages out, and the
    default Rankings view. Past-life classes are archived.
  - ≥ 40% of the Heavy-sim budget is reserved for your starting wave, and the cohort was raised from ~40–60 to
    ~80–120 (28B/28H/28J, roadmap 3.8, open questions updated).
  Next: start at roadmap M1 task 1.1 (Settings tab shell) → 1.2 (banter). Optional 1.7 (23D-lite) if the
  post-Ascension dead zone needs fixing before M6.

Date: 2026-09-25 (session 9) — PLANNING ONLY, no code changed
Agent: User asked for the Immortal-era gameplay design to be added to PLAN.md. Wrote a new PLAN.md section
  "Phases 24–29" (after Phase 23) and cross-linked the older phases:
  - 24 Immortal Paths: after Ascension, Immortal stages fill with Immortal Essence (passive Qi only ~5–10%),
    earned by a Path. Evil paths: Tyrant (enslave people as labor/soldiers/"essence cattle", Fear vs
    Resentment, revolts, Infamy → crusades) and Devourer (absorb anyone; Impurity refine timer, Corruption,
    heart-demon rampages). Good paths: Celestial Deity (believers give Faith + gifts, you bless specific NPCs,
    and their breakthroughs/ascensions pay you back; Saints; prayers) and Heaven's Executioner (devour ONLY
    evil beings, with a bounty board and Investigate to catch disguised demons / framed innocents). Falling
    is fast, redemption is slow (Heart Tribulation).
  - 25 Doctrine: tenet slots by realm, Virtue/Demon/Neutral tenets, regional spread, NPC sects adopt it,
    acting against your tenets → schism → heretic sect.
  - 26 Immortal Island: 5 tiers (6×6 → 18×18 plot grid), ~30 buildings in 8 groups (path-locked Faith vs
    Dominion buildings), island wars, Lower Sect link, and 26F Ascension Petitions (your ascended disciples
    and blessed followers ask to join: accept / decline / enslave-or-devour if demonic).
  - 27 Deep Sect Management: 10 offices with personality fit, a Recruiter that follows your requirement
    filters (root/alignment/personality/age/stage/region/cost), 6 manual recruit methods, 6 sect tiers that
    set candidate quality, and a full disciple lifecycle. Idle-first: everything can run on policy.
  - 28 Persistent Living World (SUPERSEDES Phase 15): full Person record (roots, personality axes,
    morality alignment + disposition, memories, relations, lifespan), Near/Known/Background sim tiers
    with "materialize on observation" so every NPC you meet is permanent, a Chronicle for the dead, a
    per-slot world save file (needs a new window.electron method on BOTH platforms), and a perf budget.
  - 29 Character Personality & Banter: 12 random personalities with sample lines, idle + contextual
    speech bubbles, a banter log, a frequency setting, and alignment/Path variants of each voice.
  - Cross-refs added: Phase status block, 5A (→27), 13D gating table (→24), 15 (superseded note),
    23D (Qi loop → Essence), and the file-structure list.
  - Recommended build order: 29 → 27A–C → 28 → 23D → 24 → 26 → 25.
  - Six open questions for the user are listed at the end of the Phases 24–29 section. Ask them before
    building each phase.
  Not done (not needed for a plan-only change): no system docs created yet (Rule 6 says create each one
  BEFORE that phase's code), no sim/dist runs (nothing executable changed).
  Next: pick up the recommended order. Phase 29 (banter) is the cheapest and most self-contained start;
  Phase 23D is still the fix for the post-Ascension dead zone.

Date: 2026-09-25/26 (session 8)
Agent: Phase 23A+B+C — Health & Death, Bloodline Quality, chance-based Ascension Trial. User picked this
  from START_HERE's recommendations, then chose scope "23A+23B+23C" (not just 23A) and confirmed the
  proposed survival curve, parking lifespan, and "keep playing the Immortal" (informs future 23D) via
  AskUserQuestion before any code. Replaces the old "reach the top stage → auto-ascend" ending: the last
  mortal stage (Spirit Severing Late) is now a real gamble.
  - New: `health` (0-100, regen +1/45s, mirrors realmIntegrity's pattern incl. offline catch-up), hidden
    `bloodlineQuality` (0-100, revealed only after this life's first Ascension attempt), `generation`,
    `deaths`, `lastReincarnation` (drives the death overlay). All in `_ensurePhase23Fields()`.
  - `attemptBreakthrough()` now refuses at the last mortal stage (`reason:'ascension_required'`) — that
    transition is `attemptAscension()`: survival = base 7% + up to +60% at BQ100 + small full-Health/
    Integrity prep bonus, capped 95%. Fail → `_die()`: grows bloodlineQuality from this life's max stage
    reached (squared term, no partner yet), resets to a fresh `_newGame()` carrying only
    bloodlineQuality/generation/deaths forward (always "new soul" carry 0.25 — no family system to
    reincarnate into yet). Success just flips `ascended=true` and continues at the existing `ascension`
    stage stub (Immortal Realms content is 23D, NOT built this session — documented as the accepted scope
    boundary, not a bug).
  - Other death sources (23A, minor): outclassed expedition zones, sect-war losses you fought in (own war,
    or member war only if `engaged`), and the `inner_demon` event at Nascent Soul+. All end with
    `if (health<=0) this._die(cause) else recalc/notify` — never mutate `s`/`w` locals after calling
    `_die()`, it reassigns `this._s`. `cultivation.js` calls the new public `checkDeath()` after every
    event since events.js can't call `_die()` itself.
  - UI: health bar (mirrors integrity bar), breakthrough button relabels to "Ascension Trial" at the last
    mortal stage and opens a new overlay (reveals BQ + chance, Ascend Now / Keep Cultivating) instead of
    attacking attemptBreakthrough directly. A `subscribe()` watcher diffs `s.lastReincarnation.ts` and pops
    a death/reincarnation overlay on ANY cause (not just from the Ascend button) — see bloodline.md Wiring.
    Stats tab: Health always shown, Bloodline Quality/Ascensions only after first attempt (matches "hidden"
    design), Deaths only once >0.
  - Sim: bot redirects to `tryAscension()` at the last mortal stage (attempts as soon as ready — no in-life
    lever to wait for, matches the bot's existing "greedy not optimal" philosophy); new invariants (health/
    bloodlineQuality/generation bounds); death detection in `Recorder.sample()` (dedupes via
    `lastReincarnation.ts`, same pattern death itself uses in the UI); new report section "Ascension &
    Bloodline" (attempts, survived, generations, deaths, BQ, deaths-by-cause).
  - Files: assets/data/bloodline.js (new), events.js (inner_demon), cultivation.js, game-state.js (health/
    ascension/death + all 3 war/expedition resolvers), game.js, index.html, styles.css, scripts/sim/
    {loader,bot,metrics,report}.js. Docs: docs/systems/bloodline.md (new), docs/index.md, core-loop.md,
    qa-sim.md, PLAN.md (Phase 23 section + Phase 8 superseded note + open questions), CLAUDE.md tree.
  - Verified: npm test, npm run sim:quick, full `npm run sim` (27 runs, 0 errors, 0 violations — see
    baseline below), npm run dist, npm run build:web. Also drove the real Electron app via its CDP
    remote-debugging port (no Playwright dep needed — Node's native WebSocket) and screenshotted the
    health bar, Ascension Trial button, Ascension overlay and death overlay with sample data — found and
    fixed one bug this way: the "飞升劫" title wrapped mid-glyph at 14px, fixed by dropping to 12px +
    nowrap. Did NOT drive it through the real charselect DEV-preset click flow — all 3 save slots on this
    machine are occupied by the user's own real characters, and I didn't want to load/tick/risk-autosaving
    over them. If you need to test the actual charselect → DEV preset → in-game click path end to end, free
    a slot first (or ask the user) — the underlying attemptAscension()/attemptBreakthrough()/_die() logic
    itself is already exercised thousands of times by `npm run sim`, just not through game.js's DOM wiring.
  - Known gap flagged in bloodline.md: the sim's dead-zone/stage-wall metrics aren't generation-aware, so a
    mid-run reincarnation can produce a misleading "stuck at stage N" flag — check `lineage.generation`.
  - Open tuning question for the user: is the pacing fun or too punishing? A failed Ascension attempt means
    a full mortal-realm replay (often 30-90h) before the next attempt; `npm run sim` shows 2-5
    reincarnations per long run at the proposed curve. Re-tune `ASCENSION_BASE_CHANCE`/`ASCENSION_BQ_COEF`/
    `BLOODLINE_G_SELF` in assets/data/bloodline.js with `--set` if it should be more/less forgiving.

Date: 2026-09-25 (session 7)
Agent: Overlay fullscreen fix (user report): "pin" wasn't surviving over fullscreen games and clicking it could
  strand the window behind one with no way back. Root cause: `alwaysOnTop: true` in main.js uses Electron's
  default z-order level, which Windows drops behind an exclusive-fullscreen game as soon as the game regains
  focus. Fixed both `createWindow()` and the `toggle-always-on-top` IPC handler to call
  `win.setAlwaysOnTop(true, 'screen-saver')` — the highest level Electron exposes, same trick overlay apps like
  OBS/RTSS use. Also changed default spawn position from vertically-centered to top-right (`y: 20`) per request.
  Kept the pin toggle (user chose "keep toggle, but make it safe" over removing it). Files: main.js only.
  Docs: docs/systems/ui-layout.md Gotchas. NOT a fix for true legacy DirectX exclusive-fullscreen games that
  refuse ALL overlays at the OS level (rare now; most games use Windows Fullscreen Optimizations / borderless) —
  that would need in-process hooking like Discord/Steam overlays, out of scope. Verified: npm start launches,
  window still shows top-right, pin button still toggles. NOT verified against an actual fullscreen game by the
  agent (no test game available in this environment) — user should confirm in their own fullscreen game.
Follow-up (same session): pin button now shows state visually (gold glow via `.pinned` class + title text) so
  it's obvious whether the window is pinned on top, since toggling it off is easy to do by accident. Changed
  `toggle-always-on-top` from `ipcMain.on`/`send` to `ipcMain.handle`/`invoke` so it returns the new state;
  `game.js` click handler awaits it and updates the button. Updated the iOS shim (`platform-storage.js`) to match
  (no-op that resolves `true`) per CLAUDE.md rule 7. Files: main.js, preload.js, renderer/game.js,
  renderer/index.html, renderer/styles.css, renderer/engine/platform-storage.js. Docs: ui-layout.md. Verified:
  npm test, npm run build:web.
Agent: Phase 5C Member Wars (1ef39a9) + dev late-game test characters (d0ead45) + answering a war call is now free.
Dev presets (user request, after 5C): `npm start` → any EMPTY slot on charselect shows a purple preset picker + DEV
  button → writes a late-game save and starts it. Presets: Sect Elder (member war in 1 min), Sect Founder (own war in
  1 min), Pre-Ascension (one breakthrough from Ascension). Hidden in dist (app.isPackaged) and on iOS. See
  docs/systems/dev-presets.md. Verified: all 3 presets load + tick in the sim engine, Ascension BT works, test,
  sim:quick, build:web, dist. Not verified by eye in the running app.
Follow-up (user feedback, session 6): "Answer the Call" no longer commits a sect-mission slot — it's now free and
  always available while a war is active (still worth +MEMBER_WAR_ANSWER_BONUS to sect power). Removed
  `_warSlot()`/`derived.warSlot` and the slot check from `startSectMission`/`answerWarCall`; mission count UI back to
  plain "n/2 active". Updated bot.js, metrics.js invariants (dropped `war_slot_over_cap`, kept
  `war_answered_not_reset`), sect-war.md, sects.md, PLAN.md. Verified: test, sim:quick, full sim founder +
  --path=member (both healthy, 0 violations), build:web, dist, re-ran the scripted member-war scenario test.
What was done (session 5, Phase 5C):
  - One sectWar state for both sides: side 'own' (founded, 5B) | 'member' (joined, 5C). _ensurePhase5BFields()
    keeps side in sync with ownSect.founded / sect.id and migrates pre-5C saves (own-sect wars untouched).
  - Member war: rank-scaled 4–10h interval, 2h window (30m Call to Arms + 90m Muster — the war-window-gap fix).
    Commitments: Answer the Call (free, see session 6 above), war chest (stones, capped by rank, earns
    contribution), up to 3 pills, one beast (beast.expedition = { war:true }, comes home with XP).
    Win (engaged) → contribution + stones + 15% rare item. Loss → sect buffs suppressed 3h, −contribution (flat × rank).
    Seen-but-ignored → −contribution −2 karma. Wars resolved entirely while closed = unseen, no penalty.
    Leaving mid-war = deserter (−5 extra karma). Rank is never demoted.
  - Files: assets/data/sect-war.js (MEMBER_WAR_* constants), game-state.js (war section for both sides, member API,
    _recalc suppression), game/beasts.js (skip war beasts), game.js (renderMemberWarPanel, 'At war' beast status),
    styles.css (.war-warn).
  - Bug found by the sim and fixed before landing: answered wasn't cleared at resolution → mission slot stayed locked
    (moot now that answering doesn't touch slots, but `answered` still must reset — kept as an invariant).
  - Sim: bot memberWar() (answer → beast → chest at ≥3× → pills after Ascension); per-side war tally
    (Recorder.trackWars), Member Wars report section, invariants, 3 new FEATURES.
  - Docs: sect-war.md (full 5C section), sects.md, qa-sim.md, PLAN.md, CLAUDE.md tree.
  - NOT verified: the new Sect-tab war panel by eye (the sim doesn't load game.js). Easiest check now: npm start →
    DEV preset "Sect Elder" → a call to arms starts within a minute.

CURRENT BASELINE (npm run sim, 200h medians; Ascension is noisy — 8 seeds on old code gave casual 71h, not 56h):
  Founder path — Ascension: active ~11h · casual ~76h · afk ~140h.  Found sect: 6.7h · 36h · ~135h.
  Member path (--path=member) — Ascension: active ~19–41h across reruns (noisy) · casual ~41–60h · afk ~50h.
  Member wars: active/casual answer 100% of ~32 calls, win ~60–75%, contribution net +0.5k–2.4k; afk answers
  ~15–25% (opens 15 min per 8h). Health: 0 errors, 0 violations on both paths.
  Phase 23A-C (session 8, founder path, 200h): ascension attempts 5/2/1 (active/casual/afk), survived to
  Immortal 1/0/0, generations 5/3/2, lifetime deaths 4/2/1, end Bloodline Quality ~8-11, all deaths from
  failed Ascension (expedition/war/event injuries never killed anyone at these constants — health regen
  outpaces them). Health: 0 errors, 0 violations.

READY FOR DEV WORK — how a new agent should start:
  1. Read START_HERE.md (this) + CLAUDE.md; load only the docs/systems/*.md for the system you touch.
  2. `npm test && npm run sim:quick` → both must pass before you change anything (≈5s total).
  3. For balance work, or any new system that touches Qi/stones: `npm run sim` before AND after, read only
     scripts/sim/out/report.md, try values with --set first. Teach scripts/sim/bot.js to use any new system
     (docs/systems/qa-sim.md → "Extending") or the sim can't see it.

Open design gaps the sim still flags (numbers can't fix these):
  - Nothing to do AFTER a successful Ascension → still a dead zone on `active` past ~70h (Phase 23D, not
    built this session — see docs/systems/bloodline.md). This is now a rarer, later dead zone than before
    (most runs spend their time in the pre-Ascension gamble/reincarnation loop instead), but it's still open.
  - OWN-sect wars still use the 15-min window: casual sees ~50%, afk ~0%, casual still banks ~4–8k. Member wars
    (2h window) fixed this for joined sects. Option: give own-sect wars a longer window too (try --set
    WAR_SCOUT_SECONDS / WAR_PREP_SECONDS) — a 5B balance change, ask the user. Afk needs Phase 9 notifications.
  - Member-path bot donates everything above 300 stones to its sect, which is why member Ascension (active ~39h)
    lags founder (~11h). It's the bot's policy, not a game wall — worth a smarter bot before tuning from it.
  - weapon_soul_spear (expedition_power) / weapon_thunder_staff (enemy_hp_reduce): effects nothing reads.
  - Sim's dead-zone/stage-wall metrics aren't generation-aware (see bloodline.md gotchas) — a mid-run
    reincarnation can misreport as "stuck", check `lineage.generation` before trusting those flags now.
Next recommended tasks — SUPERSEDED by the PLAN.md Development Roadmap (session 10); list kept for history:
  - Phase 23D Immortal Realms — the natural follow-up: gives a successful Ascension somewhere to go instead
    of the old dead-end stub. Needs the "keep playing the Immortal" direction from session 8 fleshed out
    (new realm ladder + sprites via Asset Pipeline, watch-over-family passive once Phase 16 exists).
  - Tune the Phase 23A-C curve first if the pacing (30-90h mortal-realm replay per failed Ascension) feels
    too punishing after playing it — see the open tuning question in session 8's notes above.
  - Phase 6 Animation & Visual Overhaul, or Phase 7 (Dao Paths/Tribulation — note Tribulation is one of
    23A's planned damage sources, currently not wired since 7C doesn't exist yet).
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
    bloodline.md       ← Health & Death, Bloodline Quality, Ascension Trial (Phase 23A-C)
    settings.md        ← ⚙ Settings panel, per-slot presentation prefs (Phase 20C)
    banter.md          ← Personalities + banter engine (Phase 29) · banter-writing-guide.md = writers' brief
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
    settings.js        ← SettingsUI — ⚙ overlay + applies prefs (Phase 20C)
    banter.js          ← BanterSystem — what the cultivator says and when (Phase 29)
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
    bloodline.js       ← Health regen/damage, Bloodline Quality growth, Ascension survival curve (Phase 23A-C)
    settings.js        ← SETTINGS_DEFS — ⚙ panel options (Phase 20C)
    personalities.js   ← PERSONALITIES + banter constants (Phase 29)
    banter-lines.js    ← BANTER_LINES (Phase 29)
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
