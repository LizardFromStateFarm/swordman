# UI Review — Score History
_Covers: visual design review results for every screen, component and asset · Rules: `.agents/rules/ui-review.md` · Updated: 2026-09-26_

## What this is
The scoreboard for the visual review gate (CLAUDE.md → "VISUAL REVIEW GATE"). Every UI change and visual asset is
scored 0–10 by a fresh reviewer agent from real screenshots: 0 = garbage, 6 = decent, 8 = polished + atmospheric
(the pass line), 10 = "can't believe this is CSS and ASCII art". Record every review here, newest first per item.

## Baseline of what already exists (1.8c, 2026-09-26)
One fresh reviewer per group, one cycle, no fixing. Screenshots: `scripts/smoke/scenarios/visual-baseline.js` →
`scripts/smoke/out/vb-*.png` (group 4 = banner, `banner-menus.js`). Rerun both after 1.8b / A4 for before/after.

| # | Group | Score | Weakest criteria | Headline problems |
|---|---|---|---|---|
| 1 | Character select, first-launch tip, ⚙ Settings, layout picker | **5.7** | Aesthetic 5 (emoji cap), Consistency 5 | Emoji in titlebar (📌 💤); plain slot cards, "— Empty —" copy, ~190px dead space; 8–9px meta text; toasts land on Settings/picker; DEV controls off-palette |
| 2 | Overlay (300×700): HUD + all 7 tabs | **4.7** | Consistency 4, Layout 4 | Emoji everywhere (🧘 ⚡ 💰 💎 📌 ⚖ ⚗); Stats rows collide (Own Sect / Spouse / Child); automation checkbox + ON/OFF duplicated and shown in 2 tabs; 5 button styles; toasts cover tab bottoms; titlebar name wraps 3 lines; Log repeats "Year 1:". Per tab: Tech 5 · Stats 4 · Explore 5 · Craft 5 · Pack 5 · Sect 5 · Log 5 |
| 3 | Expanded + Desktop | **4.5** | Layout 3, Consistency 4 | Left column ~55% empty; 300px content just stretched (label↔value 650px apart on Desktop); no grids/cards; automation contradiction (green check + "OFF") |
| 4 | Banner strip + quick menus | **6.2** | Layout, Aesthetic | Scored in 1.7b (3 cycles, user accepted) — strip itself flat |
| 5 | Story popups (proposal, marriage event, heir, tournament, confirm, Hall, Ascension, death → interlude) | **5.3** | Aesthetic 5, Hierarchy 5, Consistency 5, Layout 5 | Great writing, generic modals: death/ascension/marriage look like "Decline All"; ~9px body, tiny titles; title/border colors drift (jade/red/gold); person strings wrap; no hover/selected states; disabled "Fight!" gives no reason. Per popup: proposal 6 · marriage 5 · heir 5 · tournament 5 · confirm 6 · Hall 5 · Ascension 6 · death 5 |
| 6 | Cultivator sprites (5 stage states; breakthrough from source) | **4.0** | Animation 3, Detail 3 | Reads as a robot / lunar lander (box torso, tent legs, kaomoji face, no arms/robes/hair); rows jump sideways between frames (per-row centering); power = more stamped symbols, not grander silhouettes; red ⊕ clashes; ⚡ draws as orange color emoji. Per state: idle 3 · meditating 4 · deep 4 · levitating 4 · transcending 4 · breakthrough 3 (source). (An earlier 3.7 pass was discarded: capture bug) |
| 7 | Beast sprites (encounter cards) | **3.1** | Animation 2, every criterion < 6 | None reads as its animal (fox/hound share a template, eagle = "goblet with lightning"); only frame 0 ever rendered (9px HTML); ⚡ emoji breaks eagle alignment; cards empty on the right, identical; the file's "Review score 8.2–8.6" comments are inflated |

**Average across groups ≈ 4.8 / 10. Nothing passes.** The strongest assets: the writing (popups, chronicle), the
dark parchment-gold palette, the HUD, the particles/glow effects.

### Bugs found by the baseline (fix in 1.8b unless noted)
- **Breakthrough sprite never shows**: game.js sets `renderer.setState('breakthrough')` on click, but the same frame's
  state notify → `updateSprite()` immediately sets the stage sprite back. (Art track A3/A4, or a small fix in 1.8b.)
- **Banter bubble covers popups**: seen over the Ascension card and over "This Life Ends" on the death card (its
  `isBlocked` check prevents new lines, but a bubble already showing stays on top).
- **Toasts cover content**: bottom ~50px of every tab, Settings rows and the layout picker.
- **Stats row collisions** (Own Sect wraps; Spouse value overprints its label; "Child[DEV] …" has no gap).
- **Automation rows** show a checkbox AND ON/OFF (contradictory states possible), and the block renders in 2 tabs.
- **Ancestral Hall** doesn't fully cover the window (titlebar + sprite top show through above it).
- Beast sprites: only `frames[0]` is ever rendered.

### Emoji inventory (for A1)
`node scripts/check-no-emoji.js` → **110 emoji on 74 lines**: ⚡×38 ☯×25 ⚔×10 ⚙×8 ⛰×4 ⚒×4 📜×4 ♥×3 💎×2 💤×2 🧘×2
🪨 ⚗ ✅ 🔒 ⏸ 💰 📌 ⚖ ×1. By file: cultivator-sprites.js 30 lines · game.js 17 · index.html 12 · beast-sprites.js 7 ·
banner-menus.js 2 (comments) · game-state.js 2 · styles.css / settings.js / layout.js / data settings.js 1 each.
Reviewers saw on screen: 🧘 ⚡ 💰 💎 📌 💤 ⚖ ⚗ (and ☯ ⚔ at risk of emoji fallback).

### Art direction input (for A2)
Both art reviewers put the ceiling on the **grid**, not the colors: at 11×8 cells a whole limb is one character, box
drawing can only make rectangles (the body is always a box, legs are always tents), and frame-swap animation moves
whole cells only. Particles + glow already carry most of the atmosphere. Both sprite reviews recommend
**(b) the layered glyph compositor**; the second: "(a) has already hit its ceiling in this review (~4)", and (c) "may
look prettier but trades away the ASCII identity and costs more" (free placement/scaling fixes silhouette and posture; layers animate
robe/aura/figure independently with sub-cell motion); (c) shape-to-glyph + ink-wash is "the most xianxia" but a
bigger build.

## A2 art bake-off (2026-09-26)
Prototype: `scripts/art-bakeoff/` (index.html + bakeoff.js; standalone, not in the game). Capture:
`scripts/smoke/scenarios/art-bakeoff.js` → `scripts/smoke/out/bake-*.png` (bake-page.png = side by side). Same subject
(seated Qi-Condensation cultivator: robes, bun, sword across knees, hand seal; idle + breakthrough), one self-check
polish pass each, then one fresh reviewer each.

| Variant | Score | Ceiling (reviewer's estimate with a full engine) | Strongest | Weakest |
|---|---|---|---|---|
| (a) Grid ASCII, pushed | 4.3 | **~6**: a cell grid can't make curves/overlap/sub-cell detail; "charming and readable" at best (Dwarf Fortress / Caves of Qud) | clean palette | rigid triangle + box head, breakthrough = recolor, mush when small |
| (b) Layered glyph compositor | **5.2** | **8**: per-part motion, glow, customization slots, strong breakthrough; robes from positioned glyphs need hand-tuned parts | atmosphere (big 氣, Qi rings), breakthrough, independent layers | line-art body reads as diagram; parts don't join into one body; idle motion too subtle |
| (c) Shape-to-glyph + ink-wash | 4.2 | **7.5**: smooth silhouettes + tonal gradients if it adds per-cell opacity, dot thinning and hand-authored line accents | best silhouette/mass, fading ink mountains | uniform dot density = LED-matrix/halftone look, facial/anatomical cues lost, no ink modulation |

All three prototypes land 4–5 (one pass each); none is close to 8. The ceilings are the decision input.

**Round 2** (user: "love c's background, person and halo; b's sword and the rotating ring"): b vs c vs **(h) hybrid** =
c's ink scene + figure + halo with b's glyph sword/sash and rotating mote ring (split behind/in front of the figure).
All three got reviewer fixes (c: ink dot-thinning, rim light, face/bangs/seal, stronger breathing, rim-light + halo-ripple
breakthrough; b: joined parts, visible motion).

| Variant | R1 | R2 | Ceiling (R2 reviewer) |
|---|---|---|---|
| **(h) Hybrid** | — | **5.7** | **8.5** ("the most flexible direction: true shading, silhouettes, scalable effects") |
| (c) Shape-to-glyph | 4.2 | 4.7 | 7 |
| (b) Compositor | 5.2 | 4.2 | 7 (same art ±1 between reviewers = noise) |

**Decision (user, 2026-09-26): the HYBRID.** Engine requirements from the reviews (→ A3):
1. Ink shading that reads: visible folds, stroke taper/weight, dots fading into paper (R2: "robe = even LED-sign dot field").
2. The face as its own high-detail layer (focal point; R2 still "goggle eyes").
3. A simplified LOD sprite for banner/1× sizes (fine braille turns to noise small).
4. Anatomy cues: readable arms + hand seal, visible bun, sword resting across the knees.
5. Background with brush feel: mist gradient, ink bleed, depth (not flat dot bands).
6. Per-part layers + glow from (b): sword/gear/aura as placed glyph layers; customization slots.
Each variant's weakness is the other's strength: (b) lacks mass/cloth, which (c) produces; (c) lacks line work,
accents and per-part motion, which (b) produces.

## Scores

| Date | Item | Modes / states shown | Score | Cycle | Top fixes (or "passed") |
|---|---|---|---|---|---|
| 2026-09-26 | Banner quick actions (1.7b) | banner strip + all 4 dropdowns, busy strip + toast | **6.2** FAIL | 3 | Learn descriptions overflowed the panel (fixed after the review: minmax grid + own desc line); make lock/shortage states consistent (fixed: 封 "Need 1 Beast Core" / "Need 石 N more"); strip itself still flat, dead space right of Learn (reserved for 1.8b attention strip). **Went to the user after 3 cycles → user accepted as-is (2026-09-26).** |
| 2026-09-26 | Banner quick actions (1.7b) | same | 6.3 FAIL | 2 | meta text too dim/small, orphaned wraps, craft have/need ambiguous, no drops on Explore, flat panel, emoji on strip → all addressed in cycle 3 |
| 2026-09-26 | Banner quick actions (1.7b) | same | 6.2 FAIL | 1 | toast covered strip controls; CN names / chips wrapping; locked rows at opacity .55 unreadable; hard-coded colors (→ new tokens --btn-bg/--panel/--scroll/--red-text); mixed emoji vs glyph icons |
