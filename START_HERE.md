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
| Window & layout modes (Overlay 300×700 · Expanded · Desktop · Banner strip) | ✅ Phase 6E (M1 1.7) |
| **UI/UX overhaul — in progress** (1.8b split into 1.8b-1…6) | ◐ Phase 33 — 1.8b-1 nav + attention + Mode panel ✅ (accepted at 7.3–7.5); 1.8b-2 Character + breakdowns ✅ (7.3, accepted); 1.8b-3a Family ✅ (7.5, accepted); 1.8b-4 Clan + Hall ✅ (7.5, accepted); 1.8b-5 Sect ✅ (7.0, accepted); **1.8b-6 re-review ✅ — all six groups pass the 7.5 bar (7.6–7.8)**; next 1.9 QA & Balance |
| **Custom UI icon set** (`Icon()`, 36 icons, emoji + chrome CJK purge) | ✅ 1.8d-1 + 1.8d-2 (2026-09-27): 78 icons, 0 chrome CJK (lint in npm test); gates 7.2 / 7.2 accepted by the user |
| **Mobile / narrow layout** (viewport meta + bottom tab bar + safe areas + touch targets) | ◐ Phase 6E task 1.8e (2026-09-27) — built + smoke-verified; Visual Review Gate **7.6 PASS** (1.8b-6 cycle 2) |
| Android shell + Google Play beta pipeline (`npm run release:android`) | ◐ (2026-09-27) — pipeline built + verified (builds a real `.aab`); signing needs `android/keystore.properties`; Play Console side is the user's |
| Hybrid ink art engine (A3) | ◐ A3-1 ✅ 2026-09-27 (Qi Condensation, Settings → Sprite art = Ink; accepted by the user); A3-2 part slots next |
| Animation + Visual Overhaul | ⬜ Phase 6A–D |
| Dao Paths, Tribulation | ⬜ Phase 7 (Phase 8 superseded by 23 + 31) |
| Tray + opt-in desktop notifications (time-of-day = cosmetic only, M8) | ✅ Phase 9A-B (M1 1.3) |
| War Standing Orders (absence never punished) | ✅ Phase 32 (M1 1.4) |
| Game Time & Age (age passes only while open; **age never kills** since 2026-09-26) | ◐ Phase 30 (M2) — game clock + age stat + Pass the Mantle; lifespan/twilight/Final Seclusion removed; pacing (2.4) done. Remaining: heirs/legacies/tuning (2.6-2.8) |
| Ancestral Hall & Clan Legacies (meta progression, heirs, Ascended Ancestor) | ✅ Phase 31 (M2) — 2.6a–f (world/clan registry, children, heirs + tournament, reign + rebirth, challenge/step-down, branch wars + secession) and 2.7a–f (Ancestral Merit, legacies, Ascended Ancestor ending fixes the post-Ascension dead zone, ancestral catch-up, Hall UI) all built. Family Manual picker in Kin → Hall (1.8b-4). Next: 2.8 tuning |
| Birth Origin & Character Foundation | ⬜ Phase 12 |
| Alignment / Good vs Evil system | ⬜ Phase 13 |
| Body Constitution & Physical Tempering | ⬜ Phase 14 |
| NPC World Simulation (personalities, sects) | ⬜ Phase 15 → superseded by Phase 28 (M4) |
| Marriage & Family system | ◐ Phase 16 — lite+ built: proposals, spouse affection + marriage/crisis events, duels, lovers + affair discovery, uncapped children (family.md); full in M6 |
| Secret Realm Dungeons (ASCII map grid) | ⬜ Phase 17 |
| Lineage & Heir Inheritance | ⬜ Phase 18 |
| World Epochs & Spiritual Tides | ⬜ Phase 19 |
| Challenge Modes + Permadeath + Settings | ⬜ Phase 20 |
| Backpack & Inventory Tab (unified item/currency view) | ✅ Phase 21 (M1 1.5) |
| Active / Idle Mode Toggle + Mid-Late Automation | ✅ Phase 22 (M1 1.6) |
| Immortal Realms content + Secret Arts (post-Ascension endgame) | ⬜ Phase 23D–E |
| Immortal Paths: Tyrant / Devourer / Celestial Deity / Heaven's Executioner | ⬜ Phase 24 (planned) |
| Doctrine (道统) | ⬜ Phase 25 (planned) |
| Immortal Island (仙岛) + ascension petitions | ⬜ Phase 26 (planned) |
| Deep Sect Management (offices, Recruiter, manual recruiting) | ⬜ Phase 27 (planned) |
| Persistent Living World (every NPC tracked, cohort, encounters, rankings) | ⬜ Phase 28 (planned) |

> **Testing is lightweight per task** (user rule 2026-09-26): `npm test` + `npm run checks` + look at it in the app.
> Sim/dist/build:web/smoke/new checks are batched into each feature's **QA & Balance** task (CLAUDE.md).
> **UI/UX is first-class:** every player-facing task does the UX Pass (CLAUDE.md) and logs gaps under "UX Debt" below.

> **Tools:** `npm test` (syntax) · `npm run checks` (152 scenario checks, ~6s) · `npm run sim` (bot playtest) ·
> `node scripts/smoke/cdp.js scripts/smoke/scenarios/<name>.js` (real-app smoke over CDP, throwaway profile). Any
> useful check script you write goes in `scripts/sim/checks/` and gets documented — never left in a temp folder
> (CLAUDE.md → "Test scripts are project assets").

> **Build order lives in PLAN.md → "Development Roadmap" (milestones M1–M8).** The table above is by feature,
> not by order. **Design pillars** (GAMEDESIGN.md, top of PLAN.md) override older design text: single-player,
> ~10–20h mortal lives, death → heir → meta progression, never punish absence, no store logic.

---

## UX Debt — known gaps in what the player can see / do (add here; remove when fixed)

- **Overlay tab body shrank 305 → 236px** (1.8b-1: group row + sub-tabs + attention strip). Views are shorter now
  (Explore 1.4 screens, Craft 2.6), but the founder's Sect is 5.7 screens until 1.8b-5 splits it. Candidates: a 34px nav
  row, hide the strip when calm.
- **1.8b-2 review leftovers** (7.3 after 3 cycles; ui-review.md): popover has no caret pointing at its source; value
  colors have no single rule (Qi/s + Health jade, cap/Integrity gold/cream); Desktop leaves empty space under the
  Character lists; tiles are still fairly plain boxes. Breakdown cards are not zoomed by the ⚙ text-size setting.
- **1.8b-1 review leftovers** (7 rounds, plateau 7.3–7.5; ui-review.md): Overlay strip height vs. the action row
  (reviewers split on 1- vs 2-line top item); badges ~14px w/ dark ring; the rail's 道 gap could hold an attention
  summary; "自 off" chip → pill-styled "自動 Off"; +N border neutral/gold; Mode cards unbalanced at 640px; attention
  cards are flat (no depth). Revisit with the 1.8b-6 re-review.
- **HUD fixes polish** (7.8 pass): the Stones popover has no caret back to its readout; the disabled Breakthrough
  sub-line sits near the readability floor.
- **HUD fixes polish** (7.8 pass): the Stones popover has no caret back to its readout; the disabled Breakthrough
  sub-line sits near the readability floor.
- **1.8b-6 re-review polish** (all [polish], 2026-09-27; ui-review.md): Overlay Sect sub-tab row cramped + an
  unlabeled trailing icon; Family card heading ellipsizes at 640px (should wrap); HUD "Integrity100" value butts the
  label; BT tile "Fails: … −8 Karma" strands a word; Ascension button's ? crowds "Attempt to transcend" in Overlay;
  phone portrait HUD still ~60% of the screen (hide stage desc + shrink canvas like landscape does); landscape rail's
  Idle label below the fold; phone Breakthrough ? straddles the card border; tournament Fight! dimmed with no "pair two
  heirs first" hint; Expanded courtship Yes/Not-now buttons cramped; Overlay Yield icon reads like "P"; legacy cards
  have no visible buy button; clan head sharing the player's name needs a relation marker; claimed Clan Firsts look
  locked (dimmed); Explore drop chips not top-aligned when lore is short.
- **Inline styles in game.js** (~57 `style="…"`): blocked by CSP, re-applied by a shim since 1.8b-1. Convert to classes
  as each screen is rebuilt (1.8b-2..5).
- **Mobile/narrow layout (1.8e):** now built (viewport meta + a "mobile" CSS layer + narrow canvas sizing) and
  smoke-verified (`scenarios/mobile.js`, 19 checks). Still open: the on-phone **content window is short** (~236px of
  an 844px screen — candidate: make `#app` the scroller with a sticky bottom tab bar); the **character select** got no
  touch pass; the Visual Review Gate passed at **7.6** (1.8b-6). Not
  verified on a real iPhone/Android device (no Mac; no device here).
- ~~Main interaction area is the smallest part of the window~~ — 1.7: Overlay tab body 105 → 305px, Expanded/Desktop
  656–696px. Still open: 7 tabs at 9px in Overlay, banner has no attention strip yet — 1.8b
- **Art (→ Phase 34 art track, A1–A5):** plain grid ASCII rarely clears the 8/10 gate. 116 emoji in the game (63 inside
  the sprites: ⚡ ×38, ☯ ×25 render as color emoji on canvas). Plan: 1.8c art audit → A1 emoji purge + lint → A2
  bake-off (grid ASCII vs layered glyph compositor vs shape-to-glyph + ink-wash effects; user picks) → A3 engine with
  swappable parts → A4 re-art. **No-emoji rule** is in CLAUDE.md now.
- **Family agency:** done (1.8b-3a + 3b, 2026-09-27). What the world still rolls on its own (by design): discovery,
  a lover's ultimatum, a scorned lover's revenge, a spouse's reaction. **Still simulated:** your own bouts inside a
  step-down mass tournament (the whole bracket resolves at once) — they should use the fight card too.
- **Fights + affairs leftovers (1.8b-3b, 7.3 accepted):** tournament pool list repeats the versus tiles (collapse
  paired fighters); Overlay tournament panel unreviewed; pool-row metadata is small/dim.
- **Clan + Hall leftovers (1.8b-4, 7.5 accepted):** Overlay nests boxes three deep (drop inner borders on small
  panes); fold toggles only on the far-right caret (make the whole header the target); ancestor rows need a leading
  "gen N · realm" marker; Desktop columns still uneven with a long chronicle.
- **Sect views leftovers (1.8b-5, 7.0):** every card is the same box (no sect-ledger ornament/texture); Overlay HUD
  leaves ~200px so each view opens on a cut-off card; buildings
  have no levels, so a founder with all six raised has nothing to do in Halls but the Sect Hall; Explore/Craft grid
  cards keep the old flat row style; standing-order war-chest note is still a paragraph (could be a 詳 card).
- **Family view leftovers (1.8b-3a):** no hint of what each temper *likes* beyond the blurb and the meeting-choice
  approach hints (a "likes/dislikes" line per personality would need data); lovers are still a plain list (3b);
  Overlay tab pane is small, so the married view is ~3 screens.
- **1.8c baseline bugs** (ui-review.md → "Bugs found by the baseline"): beasts show frame 0 only. (The breakthrough
  sprite never displaying was fixed in A3-2 by SpriteRenderer's moment hold.) (Fixed in 1.8b-1: banter bubble over popups, toasts over content,
  Stats row collisions, duplicated automation, Hall see-through, titlebar name wrap.)
- **Full itemized list: `docs/systems/ui-layout.md` → "UX Audit"** (1.8a, 2026-09-26): 7 structural findings + a
  per-system gap table. Headline items: tab body is only ~105px of the 600px window; own-sect Sect tab = 15 screens
  of scroll; Stats is a junk drawer holding every family/clan decision; automation panel duplicated at the top of
  3 views; ancestral catch-up, clan relations and morality have zero UI; no breakdowns for BT chance / Qi/s

---

## Last Session — UPDATE THIS EVERY SESSION

```
Date: 2026-09-27 (user present) — part 31
Agent: **Dev docs: `docs/commands.html`** — one-page HTML reference (for human devs) of every npm command: dev run,
  test/checks, QA sim bot + flags, CDP smoke, desktop builds, release, Android (`release:android` + env vars + signing/Java/Play
  setup), iOS. Linked from docs/index.md + CLAUDE.md tree. Keep it in sync when package.json scripts change. No code touched.
  - Committed all pending part-30/31 work (1f522cd). **User deferred 1.9 QA & Balance** ("UI is in a good spot"; full
    QA/balancing once more systems exist).
  - **A3-1 hybrid ink art engine** (user approved the A3-1 / A3-2 split). As-built: docs/systems/art-engine.md. New
    renderer/engine/ink-renderer.js (InkRenderer) + sprite-renderer.js (SpriteRenderer: Classic/Ink switch, ASCII fallback)
    + assets/sprites/ink-cultivator.js (Qi Condensation cultivator as vector parts/strokes/glyph parts/effects) + Settings →
    Motion → **Sprite art** (default Classic). Follows the user's A2 notes: no spiral stream, tilted thin orbit rings,
    straight-rising motes behind the figure, no dark fold lines, face as its own detailed layer, banner LOD. Frame 0.6 ms.
    layout.js: phone canvas now spans the full HUD width (was capped at 280). New smoke scenarios/ink-art.js.
  - Tests: npm test · npm run checks (373) · smoke ink-art / mobile / layout-modes / character pass, zero console errors.
  - **Engine accepted by the user** ("looks good") and committed (447701d). Art-piece feedback then fixed (uncommitted,
    with the user): face = ink portrait (jaw, side light, shadows, faint grain, thin features, no smile/blush); sword =
    solid vector parts (blade, guard, wrapped grip, pommel, tassel strands); strokes can paint `after` a part; `still()`
    crops; smoke writes ink-still-face.png / ink-still-hilt.png close-ups. User then asked for face options; 4 smooth styles were **rejected** ("like clip art"). **User rule: only objects
    (sword, hairpin) are solid; everything else is ink dots** → face/hands/neck/collar/locks/halo back to pixelated dots
    (dotFeatures for eyes/brows/mouth, grid centred on x=150), face slot kept with one style (dotted). **Accepted** ("much better"), committed. Reviewed from scripts/smoke/out/ink-still-*.png + ink-{mode}-{idle,bt}.png; logged in ui-review.md.
  - **A3-2** (same session, user: "commit and continue"): part slots — assets/sprites/ink-parts.js (INK_PARTS: face calm/
    stern/youthful, hair bun/loose/crown, robe moon/azure/crimson/ink, weapon sword/flute/none, aura orbit/still/tempest),
    `setSlots` / `_effective()` merge, expression frames (eyes lit on breakthrough, strain on failure), `triggerFailure`
    (halo cracks / shatters on demotion, rings stutter, figure shudders) wired from game.js, and a SpriteRenderer moment
    hold that fixes the 1.8c "breakthrough sprite never displays" bug. Authoring template: .agents/rules/assets.md → Ink
    art. Smoke: ink-slots-sheet.png, ink-still-fail/demote/face-bt/face-strain.png. **Accepted by the user** ("it looks fine"), committed.
  - **Plan update** (user, same session; answers: the path anchors the alignment meter; one costly Dao Reversal per
    life): new **Phase 39 Cultivation Path & Appearance** in PLAN.md — M3 tasks 3.2b (Virtuous / Neutral / Demonic chosen
    at Core Formation: arts, sects, look, alignment pull) + 3.2c (Dao Reversal); art track A5 rewritten (appearance at
    every creation + rebirth, Wardrobe), new A8 (effects unlocked by realm / Arts / path), A9 (robes from family/clan
    head, sect leader, sect ranks, in-world ranking Top 10 / #1), A10 (inspect a person → ink portrait). Cross-links in
    Phases 10, 13, 4.8. Docs only.
  Next: user look at A3-2 → A4 re-art every stage in ink (Mortal, Foundation, Core…) so Ink can become the default; A5 (Phase 10) lets the player pick slots.

Date: 2026-09-27 (user present) — part 30
Agent: **1.8b-6 emoji lint on + re-review of every reworked screen** (user approved; user asked to combine groups per reviewer).
  - `npm test` now runs `check-no-emoji.js --strict`; the sprite file is exempt until art track A1 (`--sprites` includes it;
    strict mode prints only failing lines). Reviewer brief in .agents/rules/ui-review.md updated (1.8d done: icons are the
    marks; emoji outside the sprite = blocker) + a "combined re-reviews" rule (≤3 groups per reviewer, scored separately).
  - Review: 2 combined reviewers × 2 cycles. PASS all six: nav 7.6 · Character 7.8 · Family+fights 7.7 · Clan+Hall 7.8 ·
    mobile 7.4 → 7.6 · Sect+grids 7.4 → 7.7. No blockers, no criterion < 6.
  - Fixes: **fmt() rounding bug** (999,960 → "1000.0K"; now "1.00M") in game.js + fmtQi in game-state.js/events.js;
    Explore locations = mission-style .sv-card (drop chips, Set out/Underway/lock tile); Technique/Recipe cards share the
    card surface + chip effect; no-sect "What a founder holds"; landscape phone (no rail scrollbar, no 道, slim titlebar,
    70% canvas via layout.js); Pack value alignment + bigger chips; Craft category row 10.5px + scrolls on phones;
    dashed disabled Craft; BT card "Now <1%".
  - Tests: npm test (190 + both lints) · npm run checks (373) · smoke nav-attention/character/family/fights/clan/sect/mobile/
    icons/layout-modes/banner-menus all pass, zero console errors. sect.js smoke now also shoots grid-overlay-* and asserts
    Set out → Underway.
  - Not committed (the user's own pending rule edits are in the same tree).
  - **Then, same session — user-requested HUD/nav fixes** (assessment approved): nav badges are a small gold dot unless
    a decision waits (red count; no green circles) — sub-tab + attention "ready" tier gold too (nav.js + styles.css);
    the Breakthrough "?" is a segment of a split control `#bt-split` (was a floating circle); the HUD Spirit Stones
    readout opens a new `stones` breakdown card (breakdowns.js: sources, what they buy, next technique cost, founding
    cost, disciples' stones/min); Integrity/Health numbers hidden on the HUD (values in their cards). Gate: 7.6 → 7.6 →
    **7.8 PASS** (two blockers fixed: label ran into the divider; "Ascension T…" truncated → labels wrap). character.js
    smoke asserts the stones card, hidden numbers, flush ? segment, untruncated labels (both states).
    **Then (user, emphatic): every tab badge is the plain gold dot — no numbers anywhere, war calls included**; sub-tab
    marks gold too. nav-attention.js smoke forces 2 items on Roam + a war decision on Sect and asserts no badge has a
    number, a circle, or green.
  - **User rule (2026-09-27): no more bot reviewer agents for now — the user reviews UI themselves** (screenshot every
    affected mode, then hand it to the user). The user said the HUD fixes "look great".
  - **Then, same session — user-requested HUD/nav fixes** (assessment approved): nav badges are a small gold dot unless
    a decision waits (red count; no green circles) — sub-tab + attention "ready" tier gold too (nav.js + styles.css);
    the Breakthrough "?" is a segment of a split control `#bt-split` (was a floating circle); the HUD Spirit Stones
    readout opens a new `stones` breakdown card (breakdowns.js: sources, what they buy, next technique cost, founding
    cost, disciples' stones/min); Integrity/Health numbers hidden on the HUD (values in their cards). Gate: 7.6 → 7.6 →
    **7.8 PASS** (two blockers fixed: label ran into the divider; "Ascension T…" truncated → labels wrap). character.js
    smoke asserts the stones card, hidden numbers, flush ? segment, untruncated labels (both states).
  Next: **1.9 QA & Balance: layout modes + UI overhaul** (smoke every mode, UX walkthrough, dist + build:web); polish list
    from this review is in UX Debt.

Date: 2026-09-27 (user present) — part 29
Agent: **1.8d-2 icon set part 2 + chrome-CJK purge + lint** (user approved). As-built: docs/systems/icons.md.
  - Icon set 36 → 78 (people/clan/sect/war icons) + redraws. Icon.g(x) for glyph slots; a MutationObserver auto-fills
    any [data-icon] node, so HTML strings just write data-icon="…". COURT_WAYS / FIGHT_TACTICS .glyph now hold icon names.
  - Every chrome CJK mark → icon: attention items, breakdown cards (cn subtitles removed), Family/Clan/Hall/Sect tiles +
    tags + card heads, Character tiles/tags (meta is plain "Age · Year · Gen"), fight tactics, tournament results, Mode
    cards, banner menu headings/rows, CSS content glyphs (詳 → dot, 封 → lock icon, 得 → check icon).
  - New scripts/check-no-chrome-cjk.js; `npm test` now runs it --strict (allow: nav marks, 道, `cjk-ok` lines).
  - Tests: npm test (190 + lint clean) · npm run checks (373) · smoke icons/family/clan/sect/character/fights/succession/
    war-orders/nav-attention/layout-modes/banner-menus/mobile all pass, zero console errors.
  - Visual Review Gate: FAIL after 3 cycles (asset 7.0 → 7.4 → 7.0, in-context 6.7 → 7.5 → 7.2, never < 6) → **accepted by
    the user** with 3 culture fixes (gate = paifang, mantle = robe, tea = gaiwan) + one icon size scale (14/16/18px).
  - User asks, same session: Path opens on Character (before Techniques), Pack on Craft (before Items); the HUD realm +
    stage lines are English only (no realmCN/layerCN).
  Next: **1.8b-6** (emoji lint on + fresh re-review of every screen, incl. the mobile pass; ui-review.md has the icon asks).

Date: 2026-09-27 (user present) — part 28
Agent: **1.8d-1 custom UI icon set, part 1** (user approved; 1.8d split into -1 / -2). First committed the pending
  part-27 mobile + Android work (9c3fe07). As-built: docs/systems/icons.md.
  - New assets/icons/ui-icons.js (UI_ICONS, 36 line-art SVG bodies, currentColor, 1.6 stroke) + renderer/game/icons.js
    (Icon(name), Icon.hydrate() for [data-icon] in static HTML, Icon.names()). Diverged from the plan: a JS table, not an
    .svg sprite (external <use>/fetch are blocked on file:// in Electron). .ic in styles.css = 1em, so ⚙ text size scales it.
  - Converted: titlebar (back/window/strip/Idle-moon/Active-flame chip/settings/pin/close/more), HUD labels (qi, integrity,
    health, stone, age, lineage catch-up chip), Meditate/Breakthrough/why, layout picker rows + tip, overlay titles (CN
    subtitles dropped), banner readouts + quick buttons, rail + auto chips, attention header + expedition/missions/technique
    nudges, 封 lock marks → lock icon (Techniques/Explore/automation/banner), Pack currency/equip/Auto chips, charselect
    title. check-no-emoji: 0 emoji outside the sprite files.
  - Tests: npm test (189) · npm run checks (373) · new smoke scenarios/icons.js (contact sheet + no leftover glyph text in
    titlebar/HUD); layout-modes/nav-attention assertions switched from glyph text to icon classes; layout-modes,
    banner-menus, nav-attention, mobile, character, sect all pass, zero console errors.
  - **Visual Review Gate: FAIL after 3 cycles** (asset 6.6 → 7.0 → 6.8, in-context 6.75 → 6.8 → 7.2, never < 6) →
    **accepted by the user** (remaining redraws — lineage, token, scroll, integrity, stone pebble, one fill rule — folded
    into 1.8d-2's review of the whole set; asks in ui-review.md).
  Next: user decides on the gate → commit → **1.8d-2** (attention/family/clan/sect/breakdown marks + chrome-CJK lint) → 1.8b-6.

Date: 2026-09-27 (user present) — part 27
Agent: two user-requested tasks (tooling + UI), while another agent finished 1.8b-5.
  1) **Android + Google Play pipeline** (build/release tooling; not a game phase). `android/` Capacitor project added;
     `npm run release:android` = `scripts/release-android.js`: `npm test` → `build:web` → `cap sync android` → Gradle
     `bundleRelease` (versionCode auto-bumped) → upload to a Play track via the androidpublisher v3 API (dependency-free:
     hand-signed JWT + plain https, Edits insert/upload/track/commit). It **does not** commit/push or trigger CI. Skips
     Gradle cleanly with no Android SDK, and the upload cleanly with no `PLAY_SERVICE_ACCOUNT_JSON`. Auto-detects the
     SDK and a **Java 17–24 JDK** — Android Studio's bundled JBR is Java 25 and fails Gradle 8 with "class file major
     version 69" (the real gotcha; this box uses `C:\Program Files\Java\jdk-21.0.11`). Signing reads
     `android/keystore.properties` (gitignored; copy the `.example`). Verified: `npm run release:android` builds a real
     `app-release.aab` (unsigned until the keystore password is filled in; `jarsigner -verify` confirms). Docs:
     `docs/systems/android-port.md` (+ ios-port cross-ref). Play Console app + upload-key SHA-256 registered by the user.
  2) **Mobile / narrow layout pass** — roadmap task **1.8e** (Phase 6E); PLAN.md + CLAUDE.md updated. Root cause found:
     `renderer/index.html` had **no viewport meta**, so a phone's WebView used a ~980px layout viewport and the app
     rendered as a tiny box. Fix: the viewport meta (+ `viewport-fit=cover`); a new "MOBILE / narrow + touch" section in
     `renderer/styles.css` (bottom tab bar for thumb reach, full-bleed `#app`/`#charselect`, `100dvh`, safe-area insets,
     ≥38px tap targets — `!important`, since the mode-scoped size rules out-specify them — a lifted text floor, and
     screen-fitting overlays); `renderer/game/layout.js` fits the sprite canvas to the HUD width and sets
     `body[data-narrow]`; a `max-height:520px` rule tightens the tab rail in landscape; `#btn-pin` is hidden on shells
     with no window management. New `scripts/smoke/scenarios/mobile.js` (CDP device metrics + touch emulation via a new
     `emulate()` in cdp.js) — 19 checks: no horizontal overflow on 9 screens, tab bar at the bottom, tap sizes, canvas
     fit, landscape. All pass, zero console errors. `npm test` (186) · `npm run checks` (373).
     **Visual Review Gate cycle 1 = 5.5 FAIL** (ui-review.md): the reviewer's image tool glitched, so it audited rendered
     DOM geometry — it confirmed the layout is sound (0 overflow, bottom bar, safe areas) but the score is capped by
     **colour emoji still in Pack/Craft, which is task 1.8d**, not this pass. Cycle-1 fixes applied; **a cycle-2
     re-review is required after 1.8d**. Still open: the content window is short on a phone (candidate: make `#app` the
     scroller with a sticky bottom bar); the character select got no touch pass.
  Next: **1.8d (custom icon set)** → 1.8b-6 (emoji lint + re-review, which also re-scores the mobile pass). Note
    `renderer/` is shared with the other agent — coordinate before touching UI files.

Date: 2026-09-27 (user present) — part 26
Agent: **1.8b-5 Sect sub-views + card grids** (user approved the assessment). As-built: ui-layout.md → "Sect views".
  - 宗 Sect is now sub-tabs by standing: none → Overview (join list with blessings in words + founding card with
    have/need); joined → Overview · Missions · War; founded → Overview · Halls · Disciples · War. New
    renderer/game/sect-view.js (SectView); the old renderSect/renderOwnSect/…War panels in game.js are gone.
  - NavUI: setAvailable(views) (sub-tabs only for what applies; falls back if withdrawn), sub-tab attention dots,
    #subtabs is a size container (pills never ellipsize; fits Expanded's ~275px column).
  - game-state read helpers: sectWarOdds() (exact odds of the real roll, what-ifs, costs; the old UI's
    power/(power+1) was slightly off) and ownSectInfo() (per-disciple yields, candidates, buildings, hall, fame terms).
    Breakdown kind 'sectwar'. Attention: war → sect-war, missions → sect-missions, new nudges 徒 recruit / 殿 build.
  - Founder Sect: every view ≤ 3 Overlay screens (was 14.8). Techniques/Explore/Craft are card grids in
    Expanded/Desktop. Defensive Array desc de-dev-speaked. Tech cost 🪨 → 石.
  - Tests: new checks/sect-view.js (23: odds = 4,000-war Monte Carlo of the real resolvers, yields = real ticks);
    new smoke scenarios/sect.js; nav-attention + war-orders updated (Sect → War). npm test (87) · npm run checks
    (373) · smoke sect/nav-attention/war-orders/layout-modes/banner-menus: zero console errors.
  - **Visual Review Gate: 6.7 → 7.0 → 7.0 over 3 cycles (no criterion < 6 after cycle 1) → accepted by the user**
    (agreed more passes weren't worth it: the rest is ornament/icons, which 1.8d + the art track redo, and 1.8b-6
    re-reviews every screen). Cycle-3 fixes + Overlay Disciples roster-first applied after the last review.
    Committed as f9df4ae (+ this doc fix).
  Next: 1.8d custom icon set, then 1.8b-6.

Date: 2026-09-27 (user present) — part 25
Agent: **Quick changes (user, no review gate requested):** Spirit Stones in the HUD vitals row (石 · number, beside
  Age; Stones/Age labels shortened to glyphs + tooltips so the 300px column fits), and every Explore location lists
  its possible drops with quantity range + chance per run (`gameState.dropPreview(locId)`, exact: mirrors _rollDrops,
  verified against 20k simulated rolls; Push Harder's extra roll not included). Also: a "not enough stones" lock in the Family view now says the cost and
  what you hold ("Costs 石 285 · you have 12"). (Committed by the user in 7d698f4.)

Date: 2026-09-27 (user present) — part 24
Agent: **1.8b-3b Family agency part 2** (user approved as one task). As-built: family.md → "1.8b-3b".
  - Affairs: cover your tracks (discovery ×0.3 for 20 yrs), confess (forgiven more often), end it (LOVER_SCORN by the
    lover's temper: they tell your spouse / become an enemy), make it official; affairs no longer fade silently — the
    lover's **ultimatum** (marry / let go / one more season, discovery ×2.5). Lover cards + an ultimatum card in Family.
  - **Your fights are played on a fight card**, exchange by exchange (spouse duel, challenging the head, defending the
    seat): Press > Feint > Guard > Press, opponent habits by temper (FIGHT_STYLE), odds per tactic, yield (lethal:
    may be refused). Exchange odds derived from the old one-roll odds, so neutral play keeps the balance.
    resolveDuel('fight') / challengeHead() / resolveHeadChallenge() now START a fight (`{fight:true}`).
  - Tournament of Heirs: per pairing "To the death | Spare the loser" (alive, estranged); trauma only after a death.
  - Checks: new family-fights.js (21); succession.js/family-marriage.js/family-affairs.js play fights out
    (`fought(sim, gs, start, 'win'|'lose')`). npm run checks 350 ok. Sim 60h × 3 × 2: 0 errors/violations.
    Smoke: new scenarios/fights.js; succession.js now plays the challenge fights out. All zero console errors.
  - Visual Review Gate: 6.2 → 7.3 → 7.3 over 3 cycles (no criterion < 6) → accepted by the user.
  Next: 1.8b-5 Sect sub-views.

Date: 2026-09-27 (user present) — part 23
Agent: **Quick fix (user): war chest row** in Sect → Standing Orders. Native number spin arrows hidden app-wide;
  numRow() got themed −/+ steppers (+ optional presets/max); the war chest row has None/Half/Full, ±10% steps and a
  caption with the player's numbers (what the tithe buys, when it's paid, the cap). New smoke scenarios/war-orders.js.
  Visual Review Gate 6.8 → 7.0 → 7.3, accepted by the user. Next: 1.8b-3b.

Date: 2026-09-27 (user present) — part 22
Agent: **1.8b-4 Clan view + Hall** (user approved; asked for the Clan tab to be easier to read, the Hall to get
  help, the Overlay "Best Realm Reached" spacing bug fixed, and a themed scrollbar). As-built: ui-layout.md → "Clan +
  Hall views". Family work (1.8b-3a) committed first as f48f432.
  - New renderer/game/clan-view.js (ClanView + HallView). **The Hall is now Kin → Hall** (was a pop-over;
    #hall-overlay markup + CSS removed; openHallOverlay() now navigates). Family Manual picker built (UX debt since 2.7).
  - game-state read helpers: meritPreview(), familyManualOptions(), clanRelations(); branchWarPreview() adds chance.
    Breakdown card 'branch' (+ optional totalLabel for the "=" row). Attention: ready 挑 challenge, idle 祠 Merit.
  - One global themed scrollbar (styles.css top); per-element scrollbar rules removed. Stat rows no longer collapse
    a long value into a one-word column.
  - **Bugs found + fixed:** BreakdownUI rebuilt the card every HUD tick (live-number cards flickered / stayed
    invisible); attention strip ignored changes in an item's reason text (stale "75 Merit"); epitaph age blank when
    a person had no diedYear (falls back to the life's end year).
  - Smoke: new scenarios/clan.js; succession/visual-baseline/ux-audit updated to the Hall tab. All pass, zero console
    errors; npm test (81), npm run checks (329).
  - **Visual Review Gate: 7.3 → 7.2 → 7.5 → 7.5 → 7.5 over 5 cycles (no criterion < 6) → accepted by the user.**
  Next: 1.8b-3b (affairs, duel/tournament say) or 1.8b-5 (Sect).

Date: 2026-09-27 (user present) — part 21
Agent: **1.8b-3a Family view + family agency, part 1** (user approved the split into 3a/3b and "Ask me" as the
  default plan). As-built: family.md → "1.8b-3a", ui-layout.md → "Family view".
  - Courtship you choose: seek a match (stones) → 3 candidates → meetings (COURT_BEATS, each choice has an approach
    seal + hint, COURT_WAYS) → propose with shown odds (data-bd="propose"). Refusal → f.spurned → can return as a road
    encounter. Matchmaker proposals unchanged.
  - Spouse actions (time · gift · dual cultivation w/ deviation risk · try for a child · separate), per-action cooldowns;
    affection records its cause (f.lastAff) + yearly trail (trend arrow) + data-bd="affection" card.
  - FAMILY_PLAN_DEFAULT 'ask': partner timers raise a wish (f.childWish, urgent 願 attention item); Yes → f.expecting →
    born next year. Few/Many = explicit delegation + "Not this time". Migration: old 'many' → 'ask' (planVer).
  - Raising: per-child time · teach (morality pulled toward yours, head-start xp before awakening) · resources.
  - New renderer/game/family-view.js; old renderFamilyRows removed; all children listed. ♥ replaced by words
    (emoji lint). ⚙ Reduce motion now also sets :root[data-motion] for CSS pulses.
  - Tests: new checks/family-agency.js (44); 4 older checks now set 'many' explicitly; new smoke scenarios/family.js.
    npm test (79) · npm run checks (329) · smoke zero console errors · sim 60h × 3 profiles × 2 seeds: 0 errors/violations.
  - **Visual Review Gate: 7.0 → 7.2 → 7.5 over 3 cycles (no criterion < 6) → accepted by the user** ("the family tab
    gets a pass"). Remaining asks in ui-review.md. User asked next for: Clan tab (hard to read), Ancestral Hall,
    Overlay spacing bugs ("beast realm reach and other things"), and a themed scrollbar instead of the Windows one.
  Next: **1.8b-4 Clan view + Hall** (+ scrollbar, Overlay spacing), then 1.8b-3b.

Date: 2026-09-26 (day session, user present) — part 20
Agent: **1.8b-2 Character view + breakdowns** (user approved the assessment). As-built: ui-layout.md → "Breakdowns +
  Character view", core-loop.md → "Breakdowns".
  - game-state.js _recalc() now RECORDS each Qi/s, Qi cap and BT term as it applies it (qMul/bAdd/cMul →
    s.derived.breakdown), so explanations are the real math. New read-only helpers ascensionBreakdown(),
    btFailPreview(), vitalsInfo(); derived.catchUpUntil. **New modifiers must go through qMul/bAdd/cMul.**
  - New renderer/game/breakdowns.js: buildBreakdown() (DOM-free) + BreakdownUI popover for any [data-bd] element;
    stageShortName() replaces "Stage N+" locks (Techniques, Explore, Sect join/found).
  - HUD: dotted Qi rate / Qi numbers, Integrity + Health blocks, 詳 badge on the Breakthrough button, 承 catch-up
    chip. Character view rebuilt: tiles (Qi/s, cap + ETA, BT + fail cost / Ascension, Integrity, Health, Karma,
    Bloodline sealed until Spirit Severing), identity card, lists. Overlay orders it numbers-first.
  - New check scripts/sim/checks/breakdowns.js (29: parts rebuild totals at 5 stages, fail preview = real failure);
    new smoke scenarios/character.js (every kind + HUD entry, Esc/outside close, fits window, all 4 modes).
    Verified: npm test (76), npm run checks (284), smoke character.js zero console errors.
  - **Visual Review Gate: 6.5 → 7.0 → 7.3 over 3 cycles (no criterion < 6)**; cycle-3 fixes applied after the last
    review. **User tried it and accepted**, asking for less CJK text: colored glyph markers stay, plain CJK beside
    English goes (root/personality tags via game.js latinOnly(), stage line, popover subtitles, section suffixes,
    fail-cost line). Rule for all rebuilt screens. Leftovers in UX Debt.
  Next: commit (user to confirm), then **1.8b-3 Family view + family agency**.

Date: 2026-09-26 (day session, user present) — part 19
Agent: **Close button bug** (user: "clicking close doesn't close the instances"). Cause: Phase 9A's ✕ always hid to
  the tray, and there was no single-instance lock, so every relaunch added another invisible copy. User chose
  **✕ = Quit by default**.
  - Setting renamed closeAction (default tray) → **closeButton (default quit)** so every save gets the new default;
    Hide to tray stays as an option. Native closes (Alt+F4, taskbar) follow it via new IPC setCloseToTray
    (preload + main + iOS shim no-op, Rule 7).
  - main.js: **single-instance lock** (packaged builds only): a relaunch shows the running window.
  - New check scripts/sim/checks/settings.js (5). Verified: npm test, npm run checks (253), build:web, and a real
    packaged build in scratch (2nd launch exits, no new processes; in-game ✕ → 0 processes). dist/ itself NOT
    rebuilt: the user's old copies still lock it; quit them from the tray, then npm run dist.
  Next: commit 1.8b-1 + this fix (user to confirm), then **1.8b-2 Character view + breakdowns**.

Date: 2026-09-26 (day session, user present) — part 18
Agent: **1.8b-1 Navigation + attention layer** (user approved the split of 1.8b into 1.8b-1…6 and this task; user
  change: "Craft and Pack together"). As-built: ui-layout.md → "Navigation", "Attention layer", "Mode panel".
  - Six groups 修 Path (Techniques · Character) · 歷 Roam (Explore · Beasts) · 家 Kin (Family · Clan) · 宗 Sect ·
    囊 Pack (Items · Craft) · 錄 Log (Events · Banter), sub-tabs, badges; a rail in Expanded/Desktop. New
    renderer/game/nav.js (NAV_GROUPS, NavUI) + renderer/game/attention.js (collectAttention DOM-free + AttentionUI).
    Group names shortened to Path/Roam so six fit in 300px.
  - Stats split: Character (stats) / Family / Clan (+ Hall, Pass the Mantle) / Banter; Beasts split out of Explore;
    Explore's duplicate inventory dropped. Clan actions show "封 why" when locked (lockedAction helper).
  - Mode panel (titlebar 閒/動, rail foot, 自 chip): Idle/Active cards listing what each gives + all automation rows;
    removed from Explore + both Sect views. Titlebar/HUD emoji → 閒 動 設 頂 坐 破 基 血 根 性.
  - Fixed: toasts now on the sprite scene; banter bubble hidden under any popup; Hall opaque; Stats rows; title wrap.
  - **Found + fixed: CSP (style-src 'self') silently dropped all ~57 inline style="…" in game.js** — shim re-applies
    them via CSSOM (colors/widths now show as originally written).
  - New smoke scenario nav-attention.js; layout-modes/succession/ux-audit/visual-baseline updated to the new views.
    Verified: npm test (72), npm run checks (248), build:web, smoke nav-attention + layout-modes + banner-menus +
    ux-audit + succession (zero console errors; succession's "overwhelming branch wins" assert is a pre-existing
    random flake — failed once, also fails on the old code, passed twice after).
  - **Visual Review Gate: 6.7 → 6.8 → 7.3 → 7.2 → 7.5 → 7.5 → 7.3** over 7 rounds (user asked for 2 + 2 extra); never a
    criterion < 6; **accepted by the user** ("2 more rounds then it should be good"). Details ui-review.md.
    Titlebar: 歸 窗 [閒 Idle] 設 頂 ✕ (Overlay folds 歸 + 窗 into ⋯).
  - **Stale-build gotcha (user saw no UI changes):** closing the window only hides the app to the tray, and the old
    dist exe kept running from dist/ (2 copies, 8 processes), locking the folder — so npm run dist could not replace
    it and the always-on-top old window sat over the npm start one. Quit every copy from the tray before rebuilding.
  Next: user decision on the gate, then **1.8b-2 Character view + breakdowns**.

Date: 2026-09-26 (day session, user present) — part 17
Agent: **A2 art bake-off** (user approved; user reordered A2 before A1). Standalone prototype
  `scripts/art-bakeoff/` renders the same seated cultivator 3 ways; `scripts/smoke/scenarios/art-bakeoff.js` captures
  bake-*.png. One self-check polish pass each, one fresh reviewer each: (a) grid 4.3 (ceiling ~6) · (b) layered
  compositor 5.2 (ceiling 8) · (c) shape-to-glyph + ink-wash 4.2 (ceiling 7.5). Details: ui-review.md → "A2 art bake-off".
  - **Round 2** (user asked for b vs c vs hybrid, liking c's background/person/halo + b's sword/ring): b 4.2 · c 4.7 ·
    **hybrid 5.7, ceiling 8.5** → **user chose the HYBRID**. 6 engine requirements recorded for A3 (ui-review.md).
  - User art notes for A3 (ui-review.md): drop the spiral Qi stream; multiple tilted thin rings (b's circle); straight-
    rising motes; sleek/clean effects; clean the figure's dark spots. **A1 folded into 1.8b** (user asked whether the
    purge was still needed: the 30 sprite lines die with the redraw; the 44 UI lines get fixed as 1.8b rebuilds each screen).
  Next: **1.8b** (UI overhaul + family agency + UI emoji) → 1.9 → A3 hybrid engine → A4.

Date: 2026-09-26 (day session, user present) — part 16
Agent: **1.8c visual baseline + art audit** (user approved). No game code changed.
  - New `scripts/smoke/scenarios/visual-baseline.js` screenshots every screen/mode/popup/art piece (vb-1…7), and
    `scripts/check-no-emoji.js` inventories emoji (110 on 74 lines; `--strict` becomes the A1 lint). cdp.js
    `shot(name, clip)` now accepts `clip.scale` for magnified close-ups.
  - 6 fresh reviewers (+ a re-run for sprites after a capture bug): charselect/settings **5.7** · Overlay tabs **4.7** ·
    Expanded/Desktop **4.5** · banner **6.2** (1.7b) · popups **5.3** · cultivator sprites **4.0** · beasts **3.1**.
    Average ≈ 4.8; nothing passes. Full table, bugs, emoji inventory and art input: docs/systems/ui-review.md.
  - Both art reviews: the grid is the ceiling (≈4 max); recommend **(b) layered glyph compositor** for A2.
  - Real bugs found (logged in UX Debt): breakthrough sprite never shows; banter bubble over death/ascension cards;
    toasts over content; Stats row collisions; duplicated automation controls; Hall not covering the titlebar.
  Next: **A2 art bake-off** (user picks), then **A1 UI-only emoji purge + lint** (user reordered: the sprite emoji die
    with the old art in A4), then 1.8b.

Date: 2026-09-26 (day session, user present) — part 15
Agent: two user requests.
  1) **New rule: Visual Review Gate** (CLAUDE.md section + .agents/rules/ui-review.md + docs/systems/ui-review.md
     scoreboard). Every UI change and every asset is scored 0–10 by a FRESH reviewer agent from real screenshots
     (0 garbage … 8 polished indie … 10 "can't believe it's CSS and ASCII art"); pass = avg ≥ 8.0 and no criterion
     < 6; 3 failing cycles → the user decides. Asset Pipeline now uses the same anchored scale. Assessment block
     gained a `Review:` line. PLAN: new **1.8c** = baseline review of everything that already exists (feeds 1.8b).
  2) **1.7b Banner quick actions**: 任 Missions · 歷 Explore · 煉 Craft · 功 Learn dropdowns on the banner strip; the
     window grows 380px while one is open (main.js banner-menu IPC). New renderer/game/banner-menus.js; the four
     actions were pulled out of the tab handlers into game.js `quickActions` so tabs and menus share them. Menus
     show reward amounts, drop chances per location, have/need materials, 封 "sealed" lock reasons. New CSS tokens
     --btn-bg/--panel/--scroll/--dim-hi/--red-text. smoke: scenarios/banner-menus.js (10 checks, one real action
     per menu); cdp.js shot(name, clip) for close-ups.
  - **Review result: 6.2 → 6.3 → 6.2 over 3 cycles (FAIL)**; each cycle's fixes applied (see ui-review.md). After
    cycle 3 the one real bug it found (Learn text overflowing the panel) and the lock inconsistency were fixed.
    Per the gate, **the user decides**: accept, or keep iterating. Strongest remaining critique: the strip itself
    (from 1.7) is a flat dark bar; the empty space right of Learn is reserved for 1.8b's attention strip.
  - Verified: npm test (65), npm run checks (248), build:web, layout-modes + banner-menus smoke (zero console errors).
  - **User accepted the banner menus as-is** after the 3 cycles (the strip gets polished in 1.8b).
  Next: 1.8c (baseline visual review of everything) → 1.8b.

Date: 2026-09-26 (day session, user present) — part 14
Agent: built **1.7 Window & layout modes** (Phase 6E; user approved the assessment incl. banner 56px, themed titlebar
  in Desktop, ⬡ peek). As-built: ui-layout.md → "Layout modes".
  - Four modes off body[data-layout], CSS-only: **Overlay** (default, now 300×700 = the active-play mode, compacted
    top: 150px canvas, one-line stage desc, Integrity/Health/Age on one row, 2-line action buttons), **Expanded**
    (640×720, cultivator column + tabs), **Desktop** (resizable via a ◢ grip, not pinned, one column under 600px =
    also the iOS/browser layout), **Banner** (full-width 56px strip at the top/bottom edge, like a taskbar).
  - main.js owns geometry (boundsFor/applyLayout, per-mode remembered positions, Desktop size) + IPC get-layout /
    set-layout / resize-window; preload + iOS shim updated (Rule 7). New renderer/game/layout.js (LayoutUI: ▣ picker,
    canvas sizing via new renderer.setSize(w,h,scale), banner readouts, one-time tip). index.html wraps #hud/#main-pane.
  - **Deviation from the 6E spec (deliberate):** the mode is app-wide in window.json, not a per-slot setting — the
    character select needs a window before any slot loads. The character select never shows as a strip.
  - Banner UX: ⬡ "peeks" to the full window (picker then offers ↩ Back to the banner); any popup (death card,
    family matter, proposal) opening in banner mode auto-peeks and drops back when closed, so a banner never hides
    a decision.
  - Measured (ux-audit.js rerun): Overlay tab body **105 → 305px**; screens-of-scroll roughly ÷3 everywhere
    (founder Sect 14.8 → 4.9, Stats 7.6 → 2.5, Explore 8.6 → 2.9).
  - Bug caught by the smoke run: Windows ignores setSize on a non-resizable window → the grip uses setBounds.
  - New: scripts/smoke/scenarios/layout-modes.js (18 checks). Verified: npm test (63 files), npm run checks (248),
    npm run build:web, layout-modes + ux-audit smoke (zero console errors). Not run (per the new rules, → 1.9):
    dist, sim. No new art (glyph icons + a scaled existing sprite), so no Asset Pipeline pass.
  - Not verified: the iOS/narrow single-column layout on a real phone (no Mac).
  Next: **1.8b UI overhaul** (all 4 approved priorities): nav regroup + attention strip + tab badges (automation to
    one Mode panel), Stats → Character / Family / Clan, click-to-open breakdowns, UX-debt fixes. Expanded's empty
    space under the actions and the banner's empty right side are reserved for the attention strip.

Date: 2026-09-26 (day session, user present) — part 13
Agent: **1.8a UX audit** (user approved the assessment). No game code changed.
  - Read every render function in game.js and cross-checked the gameState API + derived fields against what the UI
    reads. The UI can reach almost every action; the problem is space, grouping, discoverability and unexplained
    numbers, not missing wiring (exceptions: setFamilyManual, clan.relations, derived.catchUp, morality).
  - New smoke scenario `scripts/smoke/scenarios/ux-audit.js` (documented in qa-sim.md): dev presets → screenshots of
    every tab/overlay + layout metrics. Key numbers: window is really 300×600 (docs said 540, fixed); the always-
    visible chrome takes ~488px, leaving a **101–112px tab body**; founder Sect tab = 1498px = 14.8 screens.
  - Wrote the audit into `docs/systems/ui-layout.md` → "UX Audit": measurements, 7 structural findings, a per-system
    gap table (severity + proposed home per layout mode), and proposed 1.8b priorities. START_HERE UX Debt points to it.
  - Note for 1.7: PLAN.md's 6E spec lists Overlay as 300×700 but the real window is 300×600. Decide in 1.7.
  - Tests: none needed (docs + a smoke scenario; the scenario itself ran green, zero console errors).
  - **User decisions (recorded in ui-layout.md + PLAN 6E):** all 4 priorities approved for 1.8b. Overlay (default)
    = the active-play mode, grown to 300×700 with a compacted top section. Banner = the "while gaming" mode, a
    taskbar-like strip at the top of the screen.
  Next: **1.7 layout modes** (Overlay 300×700 + compact top, Expanded, Desktop, Banner top-strip), then 1.8b.

Date: 2026-09-26 (day session, user present) — part 12
Agent: **process + roadmap change, no code** (user request, approved). The user wants UI/UX to be a much bigger
  focus and per-task testing relaxed.
  - CLAUDE.md: new **UX PASS** section (surface / interact / discover / feel / UX debt), required for every
    player-facing task; the assessment block gains a `UX:` line. The "task is NOT done until" bar is now
    lightweight (`npm test` + `npm run checks` + looking at it in the app); sim/dist/build:web/smoke/new checks/
    bot teaching move into a new **QA & Balance** task per large feature/milestone. Balance rule updated to match.
  - .agents/rules/general.md: assessment block + a pointer to both rules.
  - PLAN.md: 6E promoted out of "optional"; new Phase 33 (UI/UX Overhaul); roadmap tasks 1.7 (now urgent), 1.8a
    (UX audit), 1.8b (overhaul), 1.9 (QA & Balance for them); 2.8 relabeled as M2's QA & Balance task.
    **Order: 1.8a → 1.7 → 1.8b → 1.9 → 2.8.**
  - ui-layout.md: the 300×540 invariant now applies to Overlay mode only; added a "UX direction" note.
  - START_HERE: new "UX Debt" list (above).
  Next: **1.8a UX audit.** Go through every system (the docs/systems list + the live UI) and fill a "UX Audit"
    table in ui-layout.md: what the player can't see or understand, what they can't act on, and severity. Review
    it with the user, then do 1.7 layout modes designed around it. 2.8 waits until 1.9 is done.

Date: 2026-09-26 (day session, user present) — part 11
Agent: committed part 10's uncommitted 2.6f work first (user confirmed), then built **M2 task 2.7 — Ancestral
  Hall & Clan Legacies** end to end (sub-tasks 2.7a–f; user approved the reconciliation plan + per-clan Merit
  decision before any code). life-loop.md's original §2.7 draft assumed the PRE-2.6-redesign single-`s.clan`
  model; before writing code, reconciled it against the real `s.world`/`Clan`/`Person` architecture and wrote the
  result as `docs/systems/clan-succession.md` §2.7 (life-loop.md now points to it; its own numbers/tables stand).
  - **2.7a state:** Merit/legacies/firsts/manualTechId/techniquesEver/bestStageIndex/ascendedAncestors/
    blessingStacks added to the real per-world Clan object (`_foundClan()` + new `_ensurePhase34Fields()`
    migration); new `assets/data/clan-legacies.js` (Merit/catch-up/blessing constants, `CLAN_FIRSTS`, 5
    `CLAN_LEGACIES` — `sect_continuity`/`longevity_blood` both cut, already superseded — `EPITAPHS`).
  - **2.7b Merit:** `_claimFirst(id)` wired into breakthroughs (realm firsts), Ascension, joining/founding a
    sect, taming a beast, war wins, marriage, first child; credited once at death in `_recordLifeInWorld()`
    (stage term + this life's firsts + capped deeds).
  - **2.7c Legacies:** `buyLegacy`/`setFamilyManual`/`legacyLevel`, applied at rebirth (`_applyLegacies`) —
    stipend, heirloom items, a beast-lineage offspring, a free Family Manual technique.
  - **2.7d Ascended Ancestor ending — the big one:** `attemptAscension()` success used to just set
    `stageIndex=22` and leave the character playing at an unreachable stub stage (**confirmed**: this was still
    the post-Ascension dead zone bloodline.md/life-loop.md had flagged since task 2.4, never actually fixed).
    Now it claims the Ascended Ancestor first/blessing stack and calls `_die('ascended')` — the exact same
    interlude/rebirth flow as any other death. **Measured effect:** a 200h/3-seed sim's `active` life count
    went **~10 → 163** — every Ascension now genuinely starts the next generation.
  - **2.7e catch-up:** below `clan.bestStageIndex`, Qi/s ×2.5 + breakthrough chance +10%; a small addition to
    `_tickAutomation()` auto-breakthroughs there in BOTH Active and Idle Mode (a base mechanic, unlike Phase
    22's opt-in automations right below it in the same method).
  - **2.7f Ancestral Hall UI:** the old "Clan Chronicle" overlay is now the Ancestral Hall (records, family
    tree from `world.pastLives`/`persons`, buyable legacies, the unchanged chronicle below).
  - **Real bug caught by a scenario check before it ever shipped:** Heirloom/Beast Lineage read
    `clan.pendingSuccession` for their capture, but that field is deleted mid-interlude, well before rebirth —
    the carry would always have been silently empty. Fixed by moving the capture onto `interlude.legacyCapture`
    (survives the whole flow). See qa-sim.md Gotchas — a lesson for any future death-flow capture.
  - Also found/fixed along the way: offline-resolved war wins must not claim the `war_won` clan first (gated on
    the existing `_warLive` flag) or the save-round-trip invariant breaks; four stale `Cultivator Idle.exe`
    processes from an earlier session were locking `dist/` (closed after confirming with the user).
  - New: `scripts/sim/checks/succession.js` (+26 → 248 total, incl. the pendingSuccession-bug check),
    `scripts/smoke/scenarios/succession.js` extended (also fixed two stale `#chronicle-*` ids from the rename).
  - Verified: npm test (60 files), npm run checks (248, was 222), full npm run sim --hours=200 --seeds=3 (0
    errors/0 violations, 75 save round-trips), npm run build:web, npm run dist, real-app smoke (zero console
    errors).
  - **Known/expected fallout, deliberately NOT tuned here (2.8's job):** active's median life fell to 3.3h,
    below life-loop.md's [5,15] band — a direct, expected consequence of catch-up + repeatable Ascension now
    cycling much faster than the band assumed when it was tuned against a world where Ascension was a dead end.
  - **Known gap:** no in-game UI yet to choose the Family Manual technique (only the sim bot uses
    `setFamilyManual()`) — flagged, not blocking.
  Next: M2 task 2.8 (tuning pass — Merit costs, catch-up strength, lifespans, BQ constants; target: 3–5
    generations to first Ascension, gen 2+ life ≥ 8h, active's median life back inside its band). This is the
    LAST M2 task — M2 is fully done once 2.8 lands. Read clan-succession.md §2.7's "Pacing fallout" note first.

Date: 2026-09-26 (day session, user present) — part 10
Agent: built **M2 2.6f** (clan-succession.md §2.6f as-built; user approved the assessment + depth pass). This
  finishes task 2.6 end to end (2.6a–f all built) — the last gap flagged by 2.6e: branch members had no way to
  push for war or leave, and a step-down tournament could only ever install a head from the clan's own roster.
  - **Branch wars**: a branch MEMBER can *push* their branch head to war on the main line — the head decides for
    themselves (personality + how the numbers look + a bloody clan tradition, same shape as 2.6e's
    `_headDecidesLethal`); a branch HEAD can *declare* outright, no persuasion needed. War strength is the sum of
    every living adult's fight-power on each line (you included); an uninvolved third branch may pick a side and
    lend half its own strength. Win → your branch becomes the new main line (the old one is just relabeled, never
    removed); lose → your side's head is deposed, or — a flat roll, worse if the clan's tradition already runs
    bloody — killed outright (yours: `_die('branch_war')`; an NPC's: killed and replaced from within that line).
    Pushing and winning never makes the pushing MEMBER head — their branch head leads the win, exactly as the
    spec's "you become head if you lead it" implies.
  - **Secession**: a branch head can leave outright with their WHOLE branch (no fight) and found a new clan —
    the slot follows it. The old clan lives on; the relation between the two (`clan.relations`, both directions,
    already-existing 2.6a schema) reads how warm you were with the head you left and your own live morality —
    a fond, righteous exit reads very differently from a cold, ruthless one.
  - New shared machinery: `_branchInfo`, `_lineStrength`, `_branchAllies`, `_branchHeadWarWill`, `_branchWarBusy`,
    `_resolveBranchWar` (the one instant-resolution core both push and declare call), `_selfMorality` (a live
    version of the formula `_recordLifeInWorld` already snapshots at death).
  - UI: inside the existing Stats "not head" clan block, only when your line isn't the main line — a Branch
    Strength preview (yours vs. the main line's), then Push for War / Declare War + Secede depending on whether
    you lead your own branch. No new overlay — every outcome resolves at once (confirm dialog → addEvent log
    lines + a flashMessage toast), same as a 2.6e challenge.
  - New: `family.tally.branchWars/branchWarsWon/secessions` (flow into `lastReincarnation`/the sim report
    automatically, no new plumbing), `scripts/sim/checks/succession.js` (+33 → 222 total), sim invariants
    `clan_relation_range`/`branch_war_tally_mismatch`/`branch_war_cooldown_invalid`.
  - Verified: npm test (59 files), npm run checks (222, was 189), full npm run sim --hours=200 --seeds=2 AND a
    broader --hours=300 --seeds=3 pass — 0 errors/0 violations throughout, 111+50 save round-trips; branch wars
    fired for real (unforced) in every profile across both runs. Secession never fired naturally in ~1,500
    sim-hours (intentionally rare — a branch head choice, not something the bot chases hard) but is fully
    covered by a scripted check. build:web, dist both succeeded. Real-app smoke: extended
    scripts/smoke/scenarios/succession.js with a 2.6f section (branch strength preview, Declare War as a branch
    head that wins outright, Push for War as a plain member, Secede founding a new clan the slot follows) —
    zero console errors. Also fixed a latent gap in that same script found along the way: the pre-existing 2.6e
    NPC-challenge step never checked for a possible lethal loss, so a real (unseeded) death there could leave a
    stale death-overlay under later screenshots; added the same finishInterlude()+#death-ok recovery already
    used elsewhere in the file.
  Next: M2 task 2.7 — Ancestral Hall + Clan Legacies (family tree view, Ancestral Merit per life, ancestral
    catch-up, Ascended Ancestor ending; cuts Phase 8's Dao Seeds). Read life-loop.md's 2.7 section +
    PLAN.md Phase 31 first. Needs its own assessment + Depth pass line.

Date: 2026-09-26 (day session, user present) — part 9
Agent: built **M2 2.6e** (clan-succession.md §2.6e as-built; user approved the assessment + depth pass). Headship
  can now change mid-life, not only at death — the first mechanic where that's true.
  - **Challenge the head** (Stats button, gated to within CHALLENGE_STAGE_GAP=3 stages, off cooldown): the head
    decides lethal/non-lethal from style+bond+morality+personality+"is this clan's tradition bloody" (reuses the
    same test succession scoring already had). One fight (Tournament of Heirs' own power formula). Win lethal →
    the old head dies, you take the seat AND the clan's founded sect (if you don't already have one), forged in
    blood (immediate Bloodline bump, not just at a future rebirth). Lose lethal → your life ends
    (`challenge_lost`). Non-lethal either way → the loser survives (elder / cooldown+bond hit).
  - **Challenged as head**: an NPC from the roster calls you out every so often; unlike the reverse direction,
    lethality is YOUR call, presented in the existing family-overlay card queue (right after a duel).
  - **Step-down mass tournament**: while an NPC leads, they occasionally step back; every adult in the clan
    (branches + you, if eligible) may join. One lethality decision for the whole bracket (the retiring head's
    call), then the exact 2.6c shape (lethal above 4 remain, non-lethal Top-4 finale) generalized to the whole
    clan with random pairing (nobody picks matchups here). A losing player is only marked mid-bracket — `_die()`
    runs last, once the new head/branches are already committed, so death lands in an already-consistent clan.
  - New shared machinery: `_headDecidesLethal`, `_resolveFight`, `_applyLethalTrauma`, `_selfAsPerson`,
    `_installHead`, `_runBracket`. `clan.tradition.challenges` (a 2.6a schema field, unused until now) finally
    gets incremented.
  - **Found and fixed along the way:** the first tuning pass (check intervals [12–24]/[15–25] years, casual/afk
    5% opportunistic challenge chance) fired ~4× too often for how fast game years pass here
    (GAME_YEARS_PER_OPEN_HOUR=30) — a 200h/3-seed before/after sim run showed active's median life 8.7h→3.2h and
    casual's 32.5h→17.5h, both falling outside life-loop.md's target bands, with the new death causes dominating
    ascension_failed. Fixed by widening both intervals to [50–100] + an explicit 25% chance gate on top, and
    cutting the opportunistic challenge chance to 1%; medians landed back at 8.1h/21.0h. Also surfaced (and fixed)
    a real bug: winning a challenge could set `s.ownSect.founded` while still a member of another sect
    (`joined_and_founded` invariant) — the sect handoff now also requires `!s.sect.id`.
  - **Also fixed (found via smoke-testing this feature):** the generic confirm dialog (`showConfirm`) always
    said "Delete" regardless of the action — true for Pass the Mantle, Host a Tournament of Heirs, End the
    Affair, Discard, and now Challenge too. Added an optional label argument and fixed every call site.
  - New: `scripts/sim/checks/succession.js` (+37 → 82 for this file), `scripts/smoke/scenarios/succession.js`
    (+1 section, both the button + both family-overlay cards).
  - Verified: npm test (59 files), npm run checks (189, was 152), full npm run sim before/after tuning (0/0,
    Life Loop medians restored to target bands), build:web, dist, real-app smoke (zero console errors, incl.
    screenshots of both new family-overlay cards and the fixed confirm-dialog label).
  Next: 2.6f — branch wars, secession → new clan, clan relations (rival/ally). Read clan-succession.md §2.6f +
    its "as built" sections for 2.6a–e first. Assessment + Depth line first.

Date: 2026-09-26 (day session, user present) — part 8
Agent: built **M2 2.6d** (clan-succession.md §2.6d as-built; user approved the plan + both extras + a tiny rival twist):
  - Death is two-phase: the next life is created UNBORN in s.interlude (clock/offline/events paused, survives
    save/load). Heir bet (when the clan must pick) → the new head's parenting style (bond/morality/personality/trauma
    → nurturing/strict/neglectful/ruthless; trauma = "never again" or "the cycle continues") → reign sim + 5–8 line
    chronicle (marriage, children, branches, sect fortune, one story) → "born into the clan" or "born an orphan".
  - One generation per death: if you weren't head, the NPC head steps down and their children succeed. Positions
    eldest/younger/branch weighted by the bet + style; clan stipend from the clan sect; upbringing event from the
    head's style (bond keyed by YOUR personality). Orphan deaths return to the last clan. Extinct clans → orphan.
  - User add: a very small chance (RIVAL_REBIRTH_CHANCE 2%) to be born into a rival's family — for now any known
    enemy (a spouse who dueled you, a sect you warred with / that took the clan sect). **PLAN.md Phase 28K "Your
    Rival (宿敌)" + roadmap 4.10b** added for the real same-generation recurring rival (user request).
  - Only the head names heirs / hosts tournaments now. Heir Bloodline term = whoever took the seat.
  - New: assets/data/succession.js, scripts/sim/checks/succession.js (45), scripts/smoke/cdp.js + scenarios/succession.js.
  - Sim fixes: Family Planning was set once per RUN; deaths inside a bot check-in now resolved first; stipend in ledger.
  - Verified: npm test, 152 checks, full sim + 500h × 2 seeds (0/0), build:web, dist, real-app smoke (zero errors).
    Pacing vs pre-2.6d (10 seeds, 200h): median life unchanged; casual reaches Ascension a bit more often (7/10 vs 5/10).
  Note: the user committed mid-session as d27471c "succesions"; the finishing commit sits on top of it.
  Next: 2.6e — challenge the head (head decides lethality; reads s.birth.headBond + the head's style), challenges
    when you're head, step-down mass succession tournament. Assessment + Depth line first.

Date: 2026-09-26 (day session, user present) — part 7 (wrap-up before a fresh context)
Agent: moved the session's 106 scenario checks from the temp scratchpad into the repo: scripts/sim/checks/
  (world, family-marriage, family-affairs, children, tournament) + run-all.js → `npm run checks` (all pass, ~5s).
  User rule added to CLAUDE.md: useful test scripts are project assets — save under scripts/, document in
  qa-sim.md "Scenario checks", extend them when changing a system; `npm run checks` is in the done-list.
  Next: 2.6d in a NEW conversation ("read START_HERE and continue with 2.6d") — see part 6 below for scope.

Date: 2026-09-26 (day session, user present) — part 6
Agent: built **M2 2.6c** (clan-succession.md §2.6c as-built):
  - Name an heir (Stats) or host a Tournament of Heirs: you pair every fight; lethal while > 4 remain (never below
    4), then non-lethal to one winner = heir; places 2–4 = future branch founders. Cowards may yield; deaths cost
    karma and spouse affection; every survivor of a lethal round is scarred (trauma, bond −30).
  - Bloodline: + heir strength term + flat trauma-heir bonus. clan.pendingSuccession + clan.sect recorded at death.
  - Verified: npm test, full sim (0/0), 31 new + 75 prior scenario checks, build:web, dist, real-app tournament.
  Next: 2.6d — heir parenting styles, reign sim + chronicle, rebirth position (eldest / younger / branch), heir
    bet if none named, orphan option. This replaces the placeholder where the new life leads the clan.

Date: 2026-09-26 (day session, user present) — part 5
Agent: built **M2 2.6b** (clan-succession.md §2.6b as-built):
  - Family Planning None/Some/Many (Stats selector; gates spouse + lover births). Children cultivate from 16, capped
    at your stage. Per-child bond + 12 child events (bond keyed by the child's personality; morality/train/favor),
    runaway crisis at low bond (fetch / let go → estranged, off the clan roster). Morality on every person;
    affair reactions read the spouse's morality.
  - Design addition (flag to user): big households spread you thin — past 4 kids at home, bonds drift down (floor
    15). Without it bonds never moved and runaways never happened.
  - Verified: npm test, sim:quick, full sim (0/0; strongest child stage 21; casual mean bond 16, ~7 runaways/life;
    casual life 30.5h), 22 new + 53 prior scenario checks, build:web, dist, real-app smoke test (zero errors).
  Next: 2.6c — choose an heir / Tournament of Heirs (you pick matchups; lethal until Top 4, then non-lethal),
    heir-strength + trauma-heir Bloodline terms, sect goes to the head. Assessment + Depth line first.

Date: 2026-09-26 (day session, user present) — part 4
Agent: ee8b77f spec: user redesigned succession → docs/systems/clan-succession.md (2.6a–f; heir is an NPC, you're
  reborn as a descendant or orphan; tournaments, challenges, branch wars, secession; trauma-heir BQ bonus).
  Then built **2.6a — world vs life save split** (this commit):
  - `s.world` {year, nextId, nextClanId, persons, clans, playerClanId, playerLineId, pastLives} survives death;
    `s.clan`/`s.gameYear` migrated away (`_ensurePhase33Fields`). World clock no longer resets per life.
  - `_die()` → `_recordLifeInWorld()`: past self + spouse(s) + children into the registry, living family stays on
    the clan roster. New life still takes the head seat (placeholder until 2.6d). Orphan lives are null-safe.
  - Stats: Clan / World Year rows. Sim: 5 world invariants + world save round-trip.
  - **Fixed a sim bug from Family B:** bot coin flips used unseeded Math.random → runs weren't reproducible; bot now
    has its own seeded stream. Old-vs-new identical over 6h (no deaths); new-vs-new identical.
  - Verified: npm test, sim:quick, full sim (0/0, 135 round-trips), 13 world + 40 family scenario checks, build:web,
    dist, real app migrated an old-format save on Continue (zero console errors).
  Next: 2.6b (family planning None/Some/Many, children cultivate, child bond + child events, morality). Read
    clan-succession.md (incl. §2.6a as-built) + family.md first. Needs its own assessment + Depth line.

Date: 2026-09-26 (day session, user present) — part 3
Agent: User asked for deeper family mechanics + guidance so agents design interconnected systems by default.
  - e204d39 Docs: CLAUDE.md now has a required DESIGN DEPTH PASS (memory, choices, ≥3 hooks, drama, feedback) + a
    `Depth:` line in the task assessment; pillar 7 "Systems talk to each other" in PLAN/GAMEDESIGN; rules file too.
    **Every future gameplay task must include the Depth pass.**
  - b30d10b Family A: spouse affection (0-100, drifts to 50), 23 marriage events in new assets/data/family.js (affection
    delta keyed by the SPOUSE's personality; costs/effects touch stones/Qi/Health/Karma/sect/items), crisis events
    below 25 (spouse cheats: forgive/duel/divorce; spouse leaving: beg/let go), duel to the death (lose → your life
    ends, cause spouse_duel), Devoted +5% BT, former spouses kept, child cap removed.
  - Family B (this commit): lovers from expedition encounters (Explore tab, seduce 65%), affairs fade after 15-50 yrs,
    lover children are full heirs, discovery (2%/lover/yr, 40% on a lover child) → reaction from AFFAIR_REACTIONS
    by personality, scaled by affection: accept / sabotage next BT / duel / suicide / murder-suicide (minor shared
    children). Somber, non-graphic text, no banter on these. Spec: docs/systems/family.md (incl. its Depth pass).
  - Fixed along the way: event Qi effect → qi=Infinity after Ascension (sim caught it); lovers piling up to ~60
    children/life (added AFFAIR_YEARS).
  - Verified: npm test, sim:quick, full npm run sim (0 errors / 0 violations; casual median life 34.5h), 21 + 19
    scripted scenario checks (every event outcome, duel win/lose/flee, every reaction branch, murder-suicide only
    takes minors, tolerant spouse, unmarried lovers), build:web, dist, CDP smoke test (event → affection, crisis →
    duel card → Stats reopen → flee, Explore encounter → seduce, Stats lover → End affair; zero console errors).
  Open for the user: casual lives average ~49 children (no cap over ~1,100-year lives) — tune intervals by realm?
  Next: M2 task 2.6 was REDESIGNED by the user → docs/systems/clan-succession.md (2.6a–f). Spec signed off
    2026-09-26 (incl. a trauma-heir Bloodline bonus); build 2.6a (world vs life save split) first.

Date: 2026-09-26 (day session, user present) — part 2
Agent: User decision: "the user shouldn't have to worry about age. Have an age stat but age shouldn't kill
  anyone." User picked: remove twilight AND Final Seclusion entirely; commit 2.5 first (done: 23886dc).
  - Removed lifespan, old-age death (player + spouse), twilight card/banter trigger (58 lines), Final Seclusion,
    mourning/pastSpouses, suitor-age cap, age bar (HUD now shows a plain "歲 Age N"). Pass the Mantle stays in
    Stats. Old-save leftovers deleted on load. Sim: bot twilight() gone, age_over_lifespan → age_below_awakening,
    twilight report column gone. Full list in life-loop.md §15 (+ a superseded-notice at the top of the spec).
  - Docs: life-loop.md §15, GAMEDESIGN pillars 1+5, PLAN Phase 30 note, qa-sim, banter, index, CLAUDE.md tree,
    stages.js/profiles.js comments.
  - Verified: npm test, sim:quick, full npm run sim (0 errors / 0 violations), build:web, dist, CDP smoke test.
  - **Pacing impact — accepted by the user:** casual median life 16.8h → 29.5h (lives now only end at the
    Ascension Trial); casual Spirit Severing fill 4.2h. Targets updated instead of retuning stages:
    LIFE_TARGETS_H.casual.gen1 [20,40], SS PACING_TARGETS_MIN [60,300], GAMEDESIGN pillar 1 → 20–40h.
    Active 9.9h, afk 2.8h — basically unchanged.
  Next: M2 task 2.6 (heir selection). §15 lists
    what 2.6-2.8 no longer need (old_age cause, twilight step, longevity_blood, full_life/seclusion_bt firsts).

Date: 2026-09-26 (day session, user present)
Agent: M2 task 2.5 — Marriage & children lite (Phase 16-lite). Picked up from an overnight agent that ran out of
  usage mid-task: it had only edited 3 data files (BLOODLINE_G_PARTNER, married/child_born triggers, 116 banter
  lines) and **pasted all 15 banter blocks into the `generic` pool** (duplicate keys → 14 personalities had zero
  lines; baseline sim showed banter_pool_holes ×756). Moved each block into its own personality pool first.
  - game-state.js: `s.family` (+ `_blankFamily()`, shape-only `_ensurePhase16Fields()`), `_tickFamily()` on each
    game-year change (spouse stage-ups/old-age death/mourning, child births with blended roots, proposals),
    public `acceptSuitor(id)` / `declineProposal()`, partner term in `_die()` growth, family summary on
    `lastReincarnation`. New emits: `married`, `child_born`, `spouse_died`, `proposal`. `Persons.fullName()`.
  - UI: `#proposal-overlay` (suitor cards, Accept / Decide Later / Decline All), Stats Spouse/Child rows +
    "A matchmaker awaits" reopen button; banter `{spouse}`/`{child}` tokens filled.
  - Sim: `Bot.family()`, family columns + casual adult-child flag in the Life Loop table, 3 family invariants.
  - Divergences (life-loop.md §14): added `family.pastSpouses` + `spouseStageYear`; suitor age capped at 80% of
    their realm lifespan; overlay lives in game.js (life-loop.js comes with 2.6).
  - Verified: npm test (48 files); sim:quick 0/0; full npm run sim before (worktree baseline) and after — 0 errors,
    0 violations; **100% of casual lives end with ≥1 adult child** (4 children/life), casual median life still
    16.8h. Afk sect-founding dip checked with 8 seeds (1/8 both) = noise. Scripted scenario check of the whole
    family flow incl. exact partner-term growth and old-save migration (20/20 ok). build:web, dist OK. CDP smoke
    test on a scratch --user-data-dir: overlay shows 3 suitors at 300px, Decide Later → Stats reopen → Accept →
    child born → Stats rows + child_born banter line, zero console errors; scratch processes killed, real save
    dir untouched.
  Not done / known gaps: family resets on death (heirs = task 2.6). `spouse_died`/`proposal` have no banter pools
    (not in spec). No banter-line quality pass on the 116 new lines beyond a skim. Suitor/child names use
    `_clanSurname()` fallback until 2.6 gives clans a surname. iOS touch not checked on a device.
  Still open for the user (from 2.3): "open" for aging = app running incl. system tray, not only visible.
  Next: M2 task 2.6 (heir selection + succession flow — `_endLife`/`_beginNewLife`/`chooseHeir`,
    CLAN_CARRY_KEYS, ending → Hall → heir overlays, lifeOver() guards, bot succession()). Read life-loop.md §2.2-2.3,
    §4.3-4.4, §5.1, §7, §10, §14 first.

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 2.4 — Roadmap M2 task 2.4, Phase 30 pacing compression. Ran unattended
  (pre-approved: the user pre-authorized all of M2 with life-loop.md's draft values); user was asleep. Picks
  up right after the 2.3 (game clock + lifespan) session below — that session's own "Next" pointed straight
  here: casual was dying of old age around Core Formation/Nascent Soul before ever reaching Spirit Severing.
  - **Method** (life-loop.md §6.3): baseline full `npm run sim` first (saved a copy of report.md), then
    iterated entirely with `npm run sim -- --set="..."` (no file edits) on `--profiles=casual --hours=100`
    runs, per CLAUDE.md's balance-change rule. Applied §6.3's starting factors (FB ×0.6, CF ×0.45, NS ×0.2,
    SS ×0.16) to the pre-2.4 `qiCap`s in one round — already landed casual inside the target band. One
    correction round scaled Spirit Severing down an extra ×0.87 (its fill sat ~15% over the new band's top).
    Verified at `--hours=200 --seeds=5` (all 3 profiles), then wrote the converged numbers into `stages.js`
    and ran the full default suite once more to confirm nothing was lost in translation.
  - `assets/data/stages.js`: Foundation Building–Spirit Severing `qiCap`s retuned (Mortal/QC unchanged — the
    30-min casual cadence already floors QC regardless of cap). `baseQps`/`breakthroughChance` untouched on
    every stage, so the "≤0.98" game-design rule was never at risk. Full old→new table + reasoning in
    `docs/systems/life-loop.md` §13.
  - `scripts/sim/profiles.js`: `PACING_TARGETS_MIN` tightened for FB/CF/NS/SS (FB 15–30m, CF 30–60m,
    NS 45–90m, SS 60–120m — was 20–45/60–180/180–480/480–1200) per life-loop.md §6.2. New `LIFE_TARGETS_H`
    (`casual.gen1 [10,20]`, `active.gen1 [5,15]` — widened from life-loop.md's original draft `[12,20]`/
    `[4,10]` once sim-measured active's median (12.6h) sat a touch above the draft's 10h ceiling; matches
    the task's own coarser acceptance band instead). `FIRST_ASCENSION_H`/`GENERATIONS_TO_ASCEND` written per
    §8's build-order table for task 2.8 to find, but deliberately **not** wired into any report flag yet —
    every death is still a fresh soul with zero ancestral catch-up (tasks 2.5-2.8), so there's no
    generation-level signal to check.
  - `scripts/sim/report.js`: new flag comparing each profile's median life (Life Loop section) against
    `LIFE_TARGETS_H.gen1`.
  - `renderer/engine/game-state.js`: `initSlot()`'s offline Qi credit now actually multiplies by
    `OFFLINE_QI_MULT` (declared in `lifespan.js` since task 2.3 but never consumed anywhere until now).
  - **`OFFLINE_QI_MULT` decision: left at 1.0 (no throttle).** The task's own "is afk trivially easy" check
    is *wall-clock* hours for afk vs *open* hours for casual to the same milestone (not open-vs-open, which
    looked alarming in isolation — afk hit its first Ascension attempt in only ~3.3-4 open-hours at every
    multiplier tried, because afk's bottleneck is "one breakthrough per 15-min reopen window", not Qi-cap
    fill time). Measured: afk's first-ascension-attempt milestone lands at **107.3h wall** (the sim's `rec.t`
    counts closed time too) vs casual's **~19.5h open** — afk is far slower in real time, so no punishment is
    needed and none was applied. Swept 1.0/0.5/0.3/0.15 anyway to confirm the insensitivity (median life
    stayed 3.3-4.0h across the whole sweep). The multiplier hook is wired in regardless (a documented no-op),
    so a future task can tune it without another code change.
  - **Sim results** (full `npm run sim`, `path=founder`, 3 seeds, 200h horizon, before via a saved baseline /
    after on this code): **casual** median life 12.8h→**16.8h** (now mostly `passed_mantle`/`old_age` near
    Spirit Severing's lifespan instead of `old_age` at Core Formation's; 1× life even reached
    `ascension_failed`); casual now reaches Spirit Severing at all (cumulative, whole run: ✗ before → 27.3h
    after) and attempts Ascension (✗ → 21.0h, 1/3 seeds). **active** median life 19.3h→**12.6h** — now
    faster than casual as intended, repeatedly attempting (and once surviving, at 200h) Ascension instead of
    mostly passing the mantle near age 594. **afk** median life 5.0h→3.3h open-hours (see `OFFLINE_QI_MULT`
    note for why this isn't a red flag). Pacing table (casual): FB 32m→22m, CF 1.5h→50m, NS 2.2h→1.2h,
    SS —(never reached)→2.2h — all four now sit inside the new, tighter `PACING_TARGETS_MIN` bands. Flag
    count went 12→8 (the four that disappeared were old-band pacing/member-war-parity noise; **no new
    flags appeared**). 0 errors / 0 invariant violations before and after.
  - Docs written per Rule 6: `docs/systems/life-loop.md` (marked task 2.4 built, new §13 with the full
    qiCap table, the `LIFE_TARGETS_H`/`OFFLINE_QI_MULT` decisions, and before/after sim evidence),
    `GAMEDESIGN.md` (Pacing Targets table gained an Actual column), `docs/systems/qa-sim.md` (new pacing
    bands, new `LIFE_TARGETS_H` flag, `OFFLINE_QI_MULT` gotcha), `PLAN.md` (roadmap 2.4 ✅, Phase 30 status
    note).
  - **Verified:** `npm test` (48 files, unchanged). `npm run sim:quick` (0 exceptions/violations). Full
    `npm run sim` before (`git stash` of the tracked changes) and after (see Sim results above), both
    healthy. `npm run build:web`, `npm run dist` (portable build succeeded). Did **not** re-run the CDP/live
    Electron smoke-test pass this task — nothing changed except data-file constants, a single multiply in an
    already-existing offline-Qi line, and sim-only files (`profiles.js`/`report.js`); no new UI, state shape,
    or public method exists for a live pass to exercise beyond what the sim's own 135 save round-trip checks
    already cover.
  Not done / known gaps (out of 2.4's scope, per its own task boundary): generation-aware pacing metrics
    (`later` in `LIFE_TARGETS_H`, `FIRST_ASCENSION_H`, `GENERATIONS_TO_ASCEND`) aren't checked by any flag yet
    — waits on tasks 2.5-2.8's ancestral catch-up/generation continuity, since every death today is still a
    fresh soul with no carry-over. The post-Ascension dead zone (active reaches Ascension ~31h into a run
    then has nothing left for the rest of a 200h horizon) is unchanged — task 2.7's job, not touched here.
    Technique prices (life-loop.md's own "re-check `celestial_orbit`" note) were reviewed against the economy
    table and left unchanged — no pacing-driven price issue was found (no hoarding flag; `learn_technique`
    a healthy ~34-36% of casual spend both before and after).
  Next: M2 task 2.5 (Marriage & children lite — `_ensurePhase16Fields`, `_tickFamily`, proposal overlay,
    `acceptSuitor`/`declineProposal`, partner term in `_die` growth, `married`/`child_born` banter lines, bot
    `family()`). Read life-loop.md §2.1/§3.1/§4.3/§5.3/§7 first. Now that casual reliably reaches Spirit
    Severing within a life, marriage/children need `PROPOSAL_MIN_STAGE` (Foundation Building Early) to
    actually fire well before a typical death — worth a quick sanity check once 2.5 lands that proposals
    aren't crowded out by how fast casual now blows through Foundation Building (22m fill × 3 sub-stages).

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 2.3 — Roadmap M2 task 2.3, Phase 30 game clock + lifespan. Ran
  unattended (pre-approved: the user pre-authorized all of M2 with life-loop.md's draft values); user was
  asleep. Picks up right after the 2.2 (shared generators + person record) session below.
  - New `assets/data/lifespan.js`: the full life-loop.md §3.1 constants table (game clock, per-realm
    lifespan, Final Seclusion, plus the task-2.5 marriage/children timing constants written now since the
    spec listed them in the same file) — only the game-clock/lifespan/Final-Seclusion constants are
    consumed by code yet.
  - `game-state.js`: `_newGame()` gains `age` (starts `AWAKENING_AGE`=16), `gameYear` (starts 1),
    `finalSeclusion`, `twilightNoticed`. New `_baseLifespan(maxStage)` (realm of `maxStageThisLife` →
    `LIFESPAN_BY_REALM`). `_ensurePhase30Fields()` now also backfills the 4 new fields for old saves (a
    migrated age is capped at 0.8× lifespan so an old save can't load straight into twilight or an instant
    death). `_recalc()` adds `derived.lifespan`/`.inTwilight`/`.ageFrac` and applies Final Seclusion's Qi/s
    ×1.5 + breakthrough +10% (before the 0.98 cap). `tick()` advances `age`/`gameYear` (ONLY there — never
    `initSlot()`/offline catch-up, pillar 4), fires `_die('old_age')` at the lifespan, and logs + emits a
    one-shot `twilight` event on crossing into the last 10%. `attemptBreakthrough()` auto-ends Final
    Seclusion if a new realm's lifespan lifts the character back out of twilight. New public
    `enterFinalSeclusion()`/`dismissTwilight()`/`passTheMantle()` (the last just calls `_die('passed_mantle')`
    for now — task 2.6 replaces it with the real heir-selection flow). `startExpedition`/`startSectMission`/
    `answerWarCall` now return `{ok:false, reason:'final_seclusion'}` while secluded (beast expeditions still
    work). `_die()`'s `lastReincarnation` summary gained `openHours`/`ageAtDeath`/`lifespan` (additive, for
    the sim's life-length metrics).
  - UI: new age bar in the HUD (under Health, pulses amber in twilight) and a `#twilight-overlay` card
    (Final Seclusion / Pass the Mantle / Not Yet), wired in `game.js`. Stats tab gained an Age/Clan Year row
    and a "Pass the Mantle" button (confirm dialog, reuses the existing generic confirm overlay). Death
    overlay's `DEATH_CAUSE_TEXT` gained `old_age`/`passed_mantle`. Banter's `isBlocked` selector gained
    `#twilight-overlay`.
  - Banter: new `twilight` trigger added to `BANTER_TRIGGERS` (`personalities.js`) + 58 new lines written
    in-voice (2 generic + 4 × 14 personalities) in `banter-lines.js`, following banter-writing-guide.md.
  - Sim: `loader.js` (`lifespan` added to `DATA_FILES`; the 6 consumed constants exposed to `sim.data`).
    `bot.js` gained `twilight()` (first in the `checkIn` chain — Final Seclusion if there's plausibly enough
    time left to fill the stage's Qi cap at boosted Qi/s, else Pass the Mantle). `metrics.js` gained
    `lifeLengths` tracking + `age_over_lifespan`/`age_offline` invariants. `report.js` gained a "Life Loop"
    section (life length/age-at-death/twilight-choice/deaths-by-cause per profile); the older "Ascension &
    Bloodline" section was kept (relabeled "cumulative across the whole run") rather than replaced — see
    life-loop.md §12 for why.
  - **Verification:** `npm test` (48 files, was 47). `npm run sim:quick` + full `npm run sim`
    (50/100/200h × active/casual/afk × 3 seeds): **0 errors, 0 invariant violations**. Confirms the spec's
    own prediction: **casual** gen-1 now dies of old age (34× at 200h) around age ~400 (Core Formation's
    lifespan) — i.e. before reaching Nascent Soul/Spirit Severing, exactly as expected *before* task 2.4's
    pacing compression. **active** mostly ends life via a bot-chosen Pass the Mantle (29× at 200h) around
    age 594 (= 0.9 × 660, the Spirit Severing/Ascension lifespan — confirms the twilight-threshold math is
    exact). `npm run build:web` (confirmed `lifespan.js` lands in `www/`), `npm run dist` (portable build
    succeeded). CDP smoke test against a fresh `--user-data-dir` scratch profile (never the user's real
    slots — confirmed the 3 real `slot_*.json` mtimes were byte-identical before/after): created a new
    cultivator, confirmed age/year advance live over real ticks, confirmed the HUD age bar and Stats rows
    render, force-set age to 95% of lifespan (a state field, not a public API — the only way to reach
    twilight in under a minute of real time) and confirmed the twilight card auto-opened with the amber
    pulse; clicked Final Seclusion (Qi/s multiplied, `startExpedition()` correctly blocked); used the new
    Stats "Pass the Mantle" button → confirm → full reincarnation (`generation` 1→2, `deaths` 0→1, age reset
    to 16, death overlay showed "You laid down the path"); zero console errors throughout. Killed all 4
    scratch Electron processes afterward (confirmed via `Get-CimInstance Win32_Process`, all matched the
    scratch `--user-data-dir` before killing).
  - **Please confirm (flagged in life-loop.md §10):** "the game is open" for aging/lifespan purposes already
    meant "the process is running, tray included" since Phase 9A (task 1.3) added the tray fallback ticker —
    NOT "visible on screen". A cultivator left running in the system tray for hours still ages and can still
    die of old age there. This matches the letter of pillar 4 (age never passes while the app isn't running
    at all) but is a bigger "open" window than "visible" would be — worth a quick gut-check that this is the
    intended reading before task 2.4 tunes pacing around it.
  Not done / known gaps (out of 2.3's scope): pacing compression (task 2.4 — casual dying of old age before
    NS/SS is the expected, called-out state right now); marriage/children/heir-selection/legacies/catch-up
    (tasks 2.5-2.7) — `family`, `lifeMerit`, `inheritedManual`, `succession`, `clan.bestStageIndex`/`tree`/
    `firsts`/`merit`/`legacies` are all still absent or task-2.2 skeleton; `gameYear` still resets to 1 each
    new life (not yet clan-persistent — waits on task 2.6's `CLAN_CARRY_KEYS`, same known gap `clan` itself
    has had since task 2.2).
  Next: M2 task 2.4 (pacing compression — retune `stages.js` FB-SS `qiCap` values, `PACING_TARGETS_MIN`,
    `LIFE_TARGETS_H`, check `OFFLINE_QI_MULT`) so a casual mortal life lands in the 10-20h band instead of
    dying of old age mid-Qi-Condensation/Core-Formation. Read life-loop.md §6 first.

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 2.2 — Roadmap M2 task 2.2, shared generators + minimal person record.
  Ran unattended (pre-approved: the user pre-authorized all of M2 with life-loop.md's draft values); user
  was asleep. Picks up right after the 1.6 (Active/Idle Mode) session below — M1 is done except optional 1.7.
  - New `renderer/engine/persons.js` (global `Persons`, DOM-free, loaded before game-state.js): `rollRoot()`/
    `specificRoot(type)`/`rollPersonality()` (moved verbatim from `GameState._rollRoot`/`_rollSpecificRoot`/
    `_rollPersonality`, which are now one-line delegates — identical draws, same call order, so no existing
    caller changed behavior), `blendRoot(a,b)` (2.5+, unused for now), `rollGiven()`/`rollSurname()`, `make(fields)`
    (fills every Person schema key from life-loop.md §2.4 with a safe default), `powerScore(p)`.
  - New `assets/data/names.js`: `SURNAMES` (60) + `GIVEN_NAMES` (205), pinyin only, gender-neutral (M2 has no
    gender field). Reused by M4's living-world names later.
  - `game-state.js`: `_newGame()` now builds a `clan` skeleton (`{name:'', nextId:1}`) and `s.self` (a
    Person record for the player, built via `Persons.make()`) as locals before the return object — neither
    consumes `Math.random()`, so `_rollRoot()`/`_rollPersonality()`'s draw order inside `_newGame()` is
    unchanged (verified, see below). New `_ensurePhase31Fields()` (clan skeleton only — bestStageIndex/tree/
    firsts/merit/legacies are 2.6/2.7) and `_ensurePhase30Fields()` (self only — age/gameYear/family are 2.3+)
    added to the `_recalc()` ensure chain, in that order (self needs `s.clan` for its `family`/id). New
    `_newPersonId(clan)` helper (`'p' + clan.nextId++`, deterministic, no RNG).
  - Per life-loop.md §2.1's note, `s.self` deliberately does NOT duplicate `root`/`personality`/`stageIndex`/
    `maxStage` (those stay live on `s.root`/`s.personality`/`s.stageIndex`) — `Persons.make()` defaults those
    four keys to `null`/`0`/`0` when a caller doesn't pass them, which only `self` does today. Every other
    role (spouse/child/cousin/ancestor, from task 2.5 on) is expected to pass real values.
  - Sim: `scripts/sim/loader.js` DATA_FILES/LOGIC_FILES updated (names.js, persons.js — persons.js loads
    right before game-state.js, matching index.html). New node check at sim-boot time: asserts
    `Persons.make({})` has all 15 Person schema keys, throws pointing at life-loop.md §2.4 if not — runs
    automatically on every `npm run sim`/`sim:quick`, no separate npm script needed.
  - **Critical verification (the task's own done-when):** ran a full `npm run sim` BEFORE this change (saved
    report.md/report.json to scratch) and AFTER. The reports are **identical** except `wallSec`/`avgTickUs`/
    `maxTickUs`/`simHoursPerWallSec`/timestamps — confirmed with a script that strips exactly those keys from
    both `report.json`s and diffs the rest (equal). This proves the shared-generator refactor didn't perturb
    `Math.random()`'s draw order anywhere the sim exercises.
  - Docs written per Rule 6: `docs/systems/life-loop.md` (marked task 2.2 built, new §11 documenting every
    place the spec was ambiguous and what was picked — read it before touching 2.3), `docs/index.md`,
    `PLAN.md` (roadmap 2.2 ✅ + a note under the M2 design section), CLAUDE.md tree (persons.js, names.js).
  - Verified: `npm test` (47 files, was 45), `npm run sim:quick` (0 exceptions/violations), full `npm run sim`
    before/after (identical, see above), `npm run build:web` (confirmed persons.js/names.js land in `www/`),
    `npm run dist` (portable build succeeded). CDP smoke test against a fresh `--user-data-dir` scratch
    profile (never the user's real slots — confirmed `%APPDATA%\Cultivator Idle` still doesn't exist
    afterward): clicked "New Cultivator" for real, read back `gameState.get()` — `clan:{name:'',nextId:2}`,
    `self:{v:1,id:'p1',given:'',family:'',...,role:'self'}` (id `p1` consumed by self, `nextId` advanced to
    2 correctly), `Persons.make({})` has all 15 keys, `powerScore()`/`rollGiven()`/`rollSurname()` all work,
    zero console errors. Killed all 4 scratch Electron processes afterward (confirmed via
    `Get-CimInstance Win32_Process`, all matched the scratch `--user-data-dir` before killing).
  Not done / known gaps (all correctly out of 2.2's scope, see life-loop.md §11 for why): no age/gameYear/
    family/succession fields yet (2.3+); `clan.name` stays `''` (no random surname at creation yet — that's
    2.6/2.7); `_die()` still resets `clan`/`self` to a blank skeleton on every reincarnation, unchanged from
    before — clan persistence across lives is explicitly `CLAN_CARRY_KEYS` work in task 2.6, not this one.
  Next: M2 task 2.3 (game clock + lifespan — `lifespan.js`, age/gameYear in `tick()`, old-age death, twilight
    card, Final Seclusion/Pass the Mantle, HUD age bar). Read life-loop.md §3.1/§4.4/§6/§10 gotchas first —
    especially "only tick() advances age" and "open means rendering, not the process running".

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 1.6 — Roadmap M1 task 1.6, Phase 22: Active/Idle Mode Toggle + Mid-Late
  Automation. Ran unattended (pre-approved assessment/scope); user was asleep. Picks up right after the 1.5
  (Backpack tab) session below.
  - New titlebar button `#btn-mode` (between ◀ and ⚙): toggles `s.playMode` ('idle'|'active', its own field —
    NOT `s.settings`, since it changes balance and settings.md's invariant #2 requires settings stay
    presentation-only). New `s.automation` object (4 on/off toggles + per-location/per-recipe sub-toggles +
    breakthrough threshold). Both in `_newGame()` + new `_ensurePhase22Fields()` migration, carried across
    reincarnation in `_die()` like `s.settings`/`s.warOrders`. New data file `assets/data/automation.js`
    (`AUTOMATION_UNLOCKS`, `ACTIVE_*` bonus constants) — top-of-file comment per Rule 5.
  - Unlock stageIndex values are the REAL current `stages.js` indices for each named realm (Core Formation
    Early=13, Nascent Soul Early=16, Spirit Severing Early=19), not the PLAN.md Phase 22 draft's numbers
    (12/18/19), which predate a later pacing-tuning pass and drifted from the actual stage list — documented
    in automation.md and PLAN.md's Phase 22 status note so nobody "fixes" it back to the wrong numbers.
  - Automation dispatch lives entirely in game-state.js (Rule 1: only mutator), calling the exact same public
    methods a manual click would (`startExpedition`/`startSectMission`/`craftItem`/`attemptBreakthrough`) —
    no duplicated logic. Auto-Explore relaunches on `resolveExpedition()`; Auto-Sect-Missions re-queues on
    `resolveSectMission()`; Auto-Craft (per-recipe toggle) and Auto-Breakthrough are ticked every frame in a
    new `_tickAutomation(dt)`. Every fire adds a `[Auto] …` event-log line and emits `auto_fire` (onGameEvent)
    for the sim. Auto-Breakthrough deliberately excludes the Ascension Trial (last mortal stage) — that stays
    a manual, permanent-death decision with its own confirm overlay (Phase 23C).
  - Offline catch-up: only Auto-Explore fast-forwards through the whole gap — `initSlot()` now loops
    (bounded, 50 max) chaining a relaunch's `endsAt` off the just-missed cycle (not real "now"), same trick
    `tickSectWar` already used. Auto-Sect-Missions/-Craft/-Breakthrough are live-only, documented with the
    honest reasons why (sect missions never fast-forwarded offline before this phase either; crafting/
    breakthroughs have no existing offline-simulation hook to attach to without much bigger changes).
  - Active Mode (22C): `_activeTimeMult()` cuts expedition/sect-mission timers (-35%/-25%) at start time;
    `attemptBreakthrough(opts)` gained optional `minQiFrac` (auto-breakthrough's slider, manual clicks keep
    the old 0.90 default) and `focusBonus` (+5%, one attempt only); `craftItem(recipeId, opts)` gained
    `watched` → independent 10% Master's Touch double-output roll. Push Harder (`pushExpedition()`, one extra
    drop-table roll for 10 stones, last-20%-of-timer window) and the breakthrough focus click-window (3s pulse
    on the button, tracked client-side in game.js, no new persisted state) are both new and fully wired.
  - UI: shared `renderAutomationPanel(s, el)` (22D) in Explore tab, both branches of Sect tab — lists all 4
    automations (✅ ON/OFF via reused `.set-row`/`.set-seg`/`.set-opt` CSS, 🔒 unlock hint), shows an inert
    notice in Active Mode. Per-location Auto-Explore pause chip (Explore), per-recipe Auto-Craft chip (Craft),
    both reuse `.pack-chip` — zero new CSS classes needed for any of that. New CSS: `.tb-btn.mode-active`
    (orange) and `.act-btn.bt-focus` (fast pulse), ~20 lines total.
  - Side-fix (task's own item, flagged by the 1.4 Phase 32 session): `initSlot()`'s offline catch-up now
    resolves pending Phase 4 sect missions *before* `tickOwnSect`/`tickSectWar(false)`, so a Standing Orders
    `chestStones` donation sees an accurate balance instead of one stale-by-one-mission. Removed the old
    "known gap" note from sect-war.md, replaced with a "fixed" note (the sim's afk/casual-vs-active member-war
    gap narrowed but didn't fully close — see below).
  - Sim: `scripts/sim/bot.js` — new `automationSetup()`/`automation()` (idle profiles turn on automations the
    moment they unlock, enable a modest Auto-Craft recipe set mirroring `craftAndEquip()`'s own pill-stocking
    preference; 'active' sets Active Mode instead and never touches automation), `pushExpedition()`,
    `tryBreakthrough()` passes `focusBonus` for 'active', craft calls pass `watched` for 'active'.
    `scripts/sim/run.js` wires `onGameEvent('auto_fire', …)` → `rec.act()` so automation's own progress counts
    toward "meaningful actions/hour" (it isn't bot-initiated, so it wouldn't otherwise be counted — this is
    what actually makes the metric move for afk/casual). New invariants `play_mode_invalid`/
    `automation_invalid` (shape/bounds only — deliberately NOT a state spot-check of "enabled flag vs. live
    unlock condition", since a founder bot leaving its joined sect to found one legitimately re-locks
    `autoSectMissions` without ever having fired out of turn; a first attempt at that spot-check produced 831
    false-positive violations and was reverted — see automation.md Gotchas).
  - **Sim results** (full `npm run sim`, founder + member paths, 200h, before via `git stash` of the tracked
    changes / after on this code, same seed base):
    - **Founder, actions/h (median, 200h):** casual 11.3→22.3 (~2×), afk 96→296 (~3×), active 239→265. This is
      the headline goal and it landed clearly.
    - **New flag:** casual now hits "Hoarding" (47.6k unspent stones) at 200h, which it didn't before.
      Diagnosed, not blindly retuned: automation makes casual reach "nothing left to buy" (all techniques,
      all buildings) much faster than before, so it now runs into the *pre-existing* late-game stone-sink gap
      (already flagged in the QA Sim Harness section's history) sooner, rather than automation creating a new
      problem. Left as a known follow-up (M2/M7 give late-game sinks; not this task's scope to invent one).
    - **Member path, war parity (Phase 32):** the afk/casual-vs-active win-rate gap that prompted the side-fix
      narrowed after it, but didn't fully close, and a contribution/war gap remains. Active Mode's own new
      stochastic bonuses (Master's Touch, Push Harder rolls) consume `Math.random()` at different points than
      before, which shifts the ENTIRE downstream random sequence for the 'active' profile specifically (same
      seed, different draws) — so part of the before/after delta here is RNG-stream noise, not signal. Not
      chased further given only 3 seeds and the project's own documented Ascension-metric noise at this
      sample size.
    - 0 errors / 0 invariant violations in every run (founder + member, all horizons) both before and after.
  - Verified: `npm test` (45 files), `npm run sim:quick` (0/0), full `npm run sim --path=founder` and
    `--path=member` before (via `git stash`) and after, `npm run build:web`, `npm run dist` (portable build
    succeeded). Drove the real Electron app over CDP four times (`--user-data-dir` → a scratch temp folder,
    confirmed `%APPDATA%\Roaming\Cultivator Idle\` still doesn't exist on this machine afterward): fresh
    "New Cultivator" (mode button toggles, Automation panel shows all 4 locked with correct unlock hints at
    stage 0, Active Mode shows the inert notice, `setAutomation` correctly rejects 'locked' then accepts once
    unlocked), and the `founder` DEV preset (all 4 automations correctly read as unlocked at stage 19/rank 3;
    per-location and per-recipe toggle chips render and set state; Push Harder appears only in the last 20% of
    an expedition timer in Active Mode, clicking it sets `pushed:true` and charges 10 stones; the breakthrough
    focus pulse (`bt-focus` class) appears the instant `canBreakthrough` flips true in Active Mode).
    Screenshotted the 300px layout (5 titlebar buttons + Automation panel all fit). Zero console errors across
    all four runs. Killed every scratch `electron.exe` afterward (`taskkill`, confirmed via `tasklist`).
  Not done / known gaps: the Craft-tab Master's Touch roll and the breakthrough focus window were verified by
    directly forcing state over CDP (qi=cap, near-end timer), not by literally timing a physical click within
    the 3s/60s windows — the underlying logic is the same either way, but a human playtester should confirm
    the *feel* of the windows (3s might be tight, 60s might be generous — both are first-pass numbers, not
    sim-tuned since neither affects the sim's balance metrics). Didn't attempt to close the remaining
    member-war contribution/war gap (see Sim results above) — would need either a larger-seed rerun to
    separate signal from RNG noise, or decoupling the RNG streams active-mode bonuses consume from the rest of
    the sim (a bigger change than this task's scope). iOS/touch not checked on a real device (same caveat as
    every prior UI session).
  Next: M1 task 1.7 (optional — window/layout modes) — or M2 2.1 (Life Loop) if the user wants that first, per
    PLAN.md's Development Roadmap. M1 is now fully done except the optional 1.7.

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 1.5 — Roadmap M1 task 1.5, Phase 21: Backpack & Inventory Tab. Ran
  unattended (pre-approved assessment/scope); user was asleep. Picks up right after the 1.4 (War Standing
  Orders) session below.
  - New "Pack" tab (between Craft and Sect; 7 tabs now, `.tab` font-size 10px→9px so the row still fits at
    300px — verified by eye via CDP screenshot). No new persisted state at all: item `category` lives in
    `assets/data/items.js` (data only, Rule 2), and filter/sort/expanded-row selection + the currency delta
    indicator are render-layer closures in game.js, matching PLAN.md's own Phase 21 implementation notes.
  - `ITEMS[id].category`: `'currency'|'mat'|'pill'|'equip'|'rare'|'key'` on every entry (top-of-file comment
    updated per Rule 5's data-file cousin). Pills filter shows both `pill`- and `elixir`-type items per spec.
    `rare` = `void_crystal`/`chaos_essence`/`ancient_script` (a static tag, not a live qty<10 filter — would
    make items hop tabs as you spend them). `key` = `beast_taming_talisman` only (Realm Keys/Celestial
    Calendar from the spec's example don't exist yet). This is a second, independent enum from
    `RECIPES[i].category` — documented in backpack.md so a future agent doesn't conflate the two.
  - New game-state.js method `discardItem(itemId, n=1) → {ok, reason?}` (reasons: unknown/currency/
    invalid_qty/not_owned) — only game-state.js mutates state (Rule 1); mirrors the existing `useElixir`/
    `offerWarPill` decrement pattern, clears `activePill` if the discarded stack hit 0. `renderer/game/
    crafting.js` got a thin `discard()` wrapper, same as its existing equip/unequip/useElixir wrappers — no
    logic duplicated. Use/Equip in the Pack tab call the exact same `craftSys` methods the Craft tab already
    uses.
  - `#confirm-overlay` generalized from a hardcoded "delete save slot" flow into `showConfirm(msg, sub,
    onYes)` (game.js) so Discard could reuse the existing overlay/CSS instead of building a second one;
    charselect's delete button now calls it too, behavior unchanged (re-verified via CDP).
  - Currency row: Spirit Stones (fmt()) with a +N/−N delta indicator that floats up and fades over 3s,
    computed as inline `opacity`/`transform` from elapsed `Date.now()` each rAF tick rather than a CSS
    `@keyframes` animation (the tab already fully rebuilds on every real inventory/stones change, so no
    "restart the animation" trick is needed) — tracked via `_packLastStones`/`_packDelta` closures in game.js,
    per PLAN.md's own note that this belongs in the render layer, not game-state. Void Crystals shown below,
    labeled "(rare)", explicitly not a premium currency (pillar 6 / GAMEDESIGN.md).
  - Item rows: real `inventory` entries plus a synthetic row for any equipped weapon/artifact that has no
    unequipped copy sitting in inventory (equipping moves an item OUT of inventory — see crafting.md).
    Equipped rows show a ◆ badge and no Discard button (hint: "Unequip in the Craft tab to discard").
  - Divergence: **dropped "Recently Acquired" sort**, per the task's own escape hatch. It would need a new
    acquisition-order/timestamp map, and there's no single choke point for inventory gains today — expedition
    drops, crafting output, sect mission rewards, war spoils and disciple income each mutate `s.inventory`
    directly at ~6+ separate sites in game-state.js. Adding a `_gainItem()` helper to create one is a
    reasonable small follow-up, flagged in backpack.md and PLAN.md, but was out of scope to do unattended.
    Sort is Name A–Z / Qty (high→low) only.
  - Sim: new invariant `item_category_invalid` (every `ITEMS[id].category` must be one of the 6 valid values,
    checked once per run like the existing `banter_pool_holes` content check) — passed clean on `sim:quick`.
    No bot behavior change needed (Pack is presentation-only, per the task); the full `npm run sim` was
    skipped by design (no balance impact), matching the settings.md/banter.md precedent for UI-only phases.
  - Docs written first per Rule 6: `docs/systems/backpack.md` (new), `docs/index.md`, `ui-layout.md` (tab
    count/font-size, generic confirm overlay note), `qa-sim.md` (new invariant), CLAUDE.md tree (items.js
    line, docs/systems list, "7 tabs"), PLAN.md (roadmap 1.5 ✅, Phase Index, Phase 21 status/divergences note).
  - Verified: `npm test` (44 files), `npm run sim:quick` (0 exceptions, 0 invariant violations — same
    pre-existing flags as before, none new), `npm run build:web`, `npm run dist` (portable build succeeded,
    no locked-exe issue this time). Drove the real Electron app over CDP twice with `--user-data-dir` pointed
    at a scratch temp folder (never the user's real slots — confirmed `%APPDATA%\Roaming\Cultivator Idle\`
    doesn't even exist on this machine, so there was nothing to touch): once with a fresh "New Cultivator"
    (empty pack renders cleanly, no console errors), once with the `member_elder` DEV preset (10 rows,
    correct A–Z sort, equipped Soul Ring/Spirit Sword show ◆ + no discard, Rare/Keys/Pills chips filter
    correctly, queuing a pill toggles to "★ Queued (clear)", discarding a Spirit Herb popped the confirm
    overlay with the right message, confirming dropped qty ×60→×59 and fired the flash toast). Zero console
    errors/exceptions in either run. Screenshotted both states (300×540 layout holds, 7-tab row legible).
    Killed all scratch electron.exe processes afterward (confirmed via `Get-CimInstance Win32_Process`, none
    touched the user's real save data).
  Not done / known gaps: "Recently Acquired" sort (see divergence above). The `key` filter only ever shows
    one item today (documented, not a bug). iOS/touch wasn't checked on an actual device — the CDP click-based
    test exercises the same DOM/tap-target code path Capacitor uses, and there are no hover-only interactions
    in the new CSS, but a real-device pass would be the only way to fully confirm touch feel.
  Next: M1 task 1.6 (Active/Idle toggle + automation) or 1.7 (window/layout modes) — or M2 2.1 (Life Loop) if
    the user wants that first. If task 1.6 builds Auto-Craft/Auto-Breakthrough automation, the Pack tab's
    Use/Equip buttons are a natural second call site alongside Craft's — reuse `craftSys`, don't duplicate.

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 1.4 — Roadmap M1 task 1.4, Phase 32: War Standing Orders. Ran unattended
  (pre-approved assessment/scope); user was asleep. Picks up right after the 1.3 (tray/notifications) session below.
  - New per-slot `s.warOrders = { answer, chestStones, lendBeast, reinforce, reinforceKeep, ally }` (game-state.js
    `_newGame()` + new `_ensurePhase32Fields()` migration, carried across reincarnation in `_die()` like
    `s.settings`). Defaults match the design exactly: Answer=Always (free), everything that costs stones off/never.
    API: `getWarOrders()` / `setWarOrder(key, value)` (validated like `setSetting`). Constants + defaults in
    `assets/data/sect-war.js` (data only): `WAR_ORDER_*_OPTIONS`, `WAR_ORDERS_DEFAULT`.
  - Orders apply the instant a war phase opens (`_applyWarOrders()`, called from `_advanceSectWarStep()` at both
    the scouting-open and preparing-open transitions), identically live or during `tickSectWar(false)` offline
    catch-up. It calls the exact same public commit methods a present player's buttons call (`answerWarCall()`,
    `donateWarChest()`, `sendBeastToWar()`, `requestWarAlly()`, `reinforceForWar()`) — every one of them already
    self-guards (`already`, room, affordability), so a manual click on top of an order can't double-charge; only
    added two tiny internal helpers (`_warReinforceCost()`/`_warAllyCost()`) so the "if affordable, keeps ≥N
    banked" order check doesn't re-derive its own copy of those formulas.
  - Real behavior change, not just presentation: `_resolveMemberWar()`'s loss-contribution penalty used to be
    skipped entirely when the war was unseen; it now always applies — `seen` only changes the log wording
    ("Your standing orders acted in your stead."). The "ignored" penalty (present, zero commitment) still only
    fires when actually present, since that's the one deliberate "you chose not to help" cost pillar 4 keeps.
  - Divergences (both documented, not bugs): "Only defensive wars" behaves like "Always" (no Phase 15 NPC-sect
    sim yet, so there's no attacker/defender distinction to hook to); "Cheapest"/"Best" ally also behave
    identically today (ally cost/bonus doesn't vary by which `SECTS` entry is asked). Both kept as separate enum
    values for forward-compat, not dropped.
  - UI: new "Standing Orders" section (`renderWarOrdersPanel()` in game.js) in both the member Sect view and the
    own-sect view, reusing the ⚙ Settings panel's `.set-row`/`.set-seg`/`.set-opt` CSS (no new stylesheet) plus a
    small `.warord-input` number field.
  - Sim: bot sets modest orders once on its first check-in (chest 50/war, strongest beast, reinforce if it keeps
    ≥300, cheapest ally — deliberately not maxed, so they don't starve a founder bot's 500-stone founding budget).
    `casual`/`afk` now rely on orders alone for wars (manual war clicks gated to `profile === 'active'`), so the
    sim actually exercises the standing-order path instead of masking it with a bot that still clicks every war
    button regardless of profile. Retired the "own/member wars mostly resolve unseen" flags (presence no longer
    gates outcome); reworded the "member wars ignored" flag; added a dedicated afk/casual-vs-active member-war
    parity check (>10pt win-rate or >10% contribution/war gap) replacing them. New invariants: `war_orders_invalid`,
    `war_chest_over_cap` (proves no double-charge across order + manual), `war_pills_over_cap`.
  - Docs written first per Rule 6: `docs/systems/sect-war.md` (new "Phase 32" section + updated Member War Outcome
    + Gotchas), `docs/systems/qa-sim.md` (bot behavior, retired/new flags, new invariants), PLAN.md (roadmap 1.4 ✅,
    Phase Index, Phase 32 status/divergences note).
  - Verified: `npm test` (44 files), `npm run sim:quick` (0 exceptions, 0 violations), full `npm run sim` before AND
    after on both `--path=founder` (default) and `--path=member`, read only report.md. Key numbers (`--path=member`,
    200h, after): active member wars 20/7 (74% win, 2.0k contrib net, ~73/war) · casual 23/8 (74%, 2.3k, ~77/war —
    within the 10% band) · afk 12/8 (60%, 967, ~48/war — flagged, see known gap below). Founder path: afk now
    founds a sect at ~140h (2/3 seeds, was ✗ before retuning the bot's order sizes down from an initial too-greedy
    500-stone/war default that was starving its founding budget) and reaches Ascension in 1/3 seeds. 0 errors/
    invariant violations in every run. Also drove the real Electron app over CDP (`--user-data-dir` = a scratch
    temp folder, never the user's real slots) with both the `founder` and `member_elder` dev presets: Standing
    Orders panel renders with the right rows per side, `setWarOrder()`/re-render/invalid-value rejection all work,
    zero console errors. Killed all scratch Electron processes afterward (confirmed via `Get-CimInstance
    Win32_Process`, none touched the user's real save data). `npm run build:web` and `npm run dist` also verified.
  Known gap (found by the sim, not fixed this session): `afk` still trails `active`/`casual` on member-war win
    rate/contribution by more than the 10% band, even with identical orders. Root cause: `tickSectWar(false)`
    (and its `_applyWarOrders()`) runs during `initSlot()`'s offline catch-up *before* pending Sect missions
    resolve — those only resolve on the next live tick — so an afk `chestStones` order can see a thinner balance
    than income that's about to land. `casual` never closes, so it's unaffected. Fixing this needs restructuring
    `initSlot()`'s offline income ordering (resolve missions before `tickSectWar`), which is a broader change than
    this task's scope — flagged in sect-war.md Gotchas and PLAN.md's Phase 32 status note for a future session.
  Next: M1 task 1.5 (Backpack tab) or 1.6 (Active/Idle toggle) — or M2 2.1 (Life Loop) if the user wants that
    first. The offline-income-ordering gap above would be a good small follow-up before or alongside 1.6
    (automation), since auto-breakthrough/auto-craft will hit the same "offline order sees a stale balance" shape.

Date: 2026-09-26 overnight
Agent: overnight autonomous run, task 1.3 — Roadmap M1 task 1.3, Phase 9A-B: system tray + opt-in
  desktop notifications. Ran unattended (pre-approved assessment/scope); user was asleep.
  - Tray (main.js): Tray built from a new static icon `assets/icons/tray-icon.png` (32x32, hand-written
    PNG via `scripts/gen-tray-icon.js` — no image deps, no python; jade fill/gold ring/dark qi-swirl,
    self-reviewed 8.6/10, full two-agent Asset Pipeline judged overkill for one tray glyph per the
    task's own carve-out). Tooltip + a disabled menu line show "<name> — <stage label>", kept live via
    a new `updateTrayInfo` IPC call the renderer sends only when name/stage actually change (in
    `updateHUD`). Menu: label, separator, Open, Quit. Left-click/double-click both toggle show/hide.
  - Close-to-tray: new setting `closeAction` (tray default / quit) in SETTINGS_DEFS — the ✕ button now
    branches on it (`forceSave()` always runs first either way). `main.js` also intercepts the
    window's native `close` event as a backstop (hide instead, unless a real quit is already in
    flight via a new `isQuitting` flag set from `before-quit`) so "quit only via tray Quit" holds
    even outside the in-app button. `before-quit` also asks the renderer to flush a save
    (`request-save` IPC, ~200ms grace) before a tray-triggered quit, since that path has no
    button-click round-trip to piggyback a `forceSave()` on.
  - Notifications: new `renderer/game/notifications.js` (`NotificationSystem`, DOM-free like
    `BanterSystem` — the sim loads it). 5 opt-in types, ALL OFF by default: breakthrough ready (edge-
    triggers off the existing `s.derived.canBreakthrough`, no new state), expedition returned, war
    news (reuses the existing `war_call`/`war_won`/`war_lost` onGameEvent emits — no new "15 min
    warning" timer built, see PLAN.md Phase 9 status note for why), beast tamed (new `beast_tamed`
    emit in `tameEncounteredBeast()`), life ended (new `death` emit at the top of `_die()`, fired
    before state resets — `reborn` still fires after, unchanged, for banter). Per-type cooldown
    (10-300s) lives in-memory in the system, not the save. Only fires while the window is
    hidden/minimized/unfocused (`!document.hidden && document.hasFocus()`). Clicking a notification
    shows+focuses the window (main.js). 6 new SETTINGS_DEFS entries needed **zero** new migration
    code — `_ensurePhase20CFields()` already generically fills/validates anything in SETTINGS_DEFS.
  - Rule 7 (both platforms): `hideToTray`, `updateTrayInfo`, `notify`, `onRequestSave` added to
    preload.js/main.js (real) AND platform-storage.js (iOS/browser no-ops) in the same change.
  - Sim: `notifications.js` added to `scripts/sim/loader.js` LOGIC_FILES + systems array (tick order
    matches game.js) so a throw/syntax regression there fails `sim:quick`. No new invariant/bot
    behavior — there's no player action to teach the bot and no new state to bound-check (the
    system never mutates `s`); the sim's default `isWindowActive => true` means it always gates
    closed there, so this is a load/no-throw check only, documented as such in qa-sim.md.
  - Docs written first per Rule 6: `docs/systems/notifications.md` (new), + updated docs/index.md,
    settings.md, banter.md (onGameEvent types list), ios-port.md (window.electron surface),
    qa-sim.md, CLAUDE.md tree, PLAN.md (Phase Index, roadmap 1.3, Phase 9 status/divergences note).
  - Verified: `npm test` (44 files), `npm run sim:quick` (0 exceptions, 0 invariant violations — same
    pre-existing flags as before, not new), `npm run build:web` (notifications.js + tray-icon.png
    both land in `www/`), `npm run dist` (portable build succeeds). Smoke-tested the real Electron
    app via its CDP remote-debugging port with `--user-data-dir` pointed at a scratch temp folder
    (never the user's real slots): 0 console errors/warnings, all new `window.electron.*` methods
    present, `NotificationSystem`/new `SETTINGS_DEFS` entries load; called `updateTrayInfo`,
    `hideToTray`, `notify` directly — no throw, and the app process stayed alive after
    `hideToTray()` (confirms hide-not-quit). Killed the scratch process afterward, no leftovers.
  Not done / known gaps: didn't verify the tray icon's on-screen appearance in the Windows system
    tray by eye (no interactive desktop session in this environment — only CDP-driven, and Tray()
    itself constructing without throwing was the only signal available). Didn't verify actual OS
    toast notifications appear (`Notification.isSupported()` + construction didn't throw, but no
    visual confirmation). Didn't add a per-type "deep link to a tab" on notification click — always
    just shows+focuses the window. charselect's own quit button (✕ on the character-select screen)
    still always does a real quit — left alone since there's no settings context there yet and no
    task guidance either way. 9C/9D (day/night, seasons) untouched, still parked in M8.
  Next: M1 task 1.4 (War Standing Orders) or 1.5 (Backpack tab) — or M2 2.1 (Life Loop) if the user
    wants that first; see the session-12 entry below for the open life-loop review still pending.

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
