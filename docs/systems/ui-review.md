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

**User art notes on the hybrid (2026-09-26), binding for A3/A4:**
- Remove the inward-spiralling Qi stream ("hurricane"); combined with the ring it is too much.
- Keep (b)'s thin rotating mote circle and make it the signature effect: **several rings at different tilts**
  (orbits around the figure).
- Use (b)'s straight-rising motes for ambient Qi.
- Effects must be **sleek and clean, never dirty**: deliberate lines and glow, no noisy dot clutter.
- Clean up the dark spots on the figure (dark fold lines, gaps where shapes meet).
- Overall: "much, much stronger" than the current art.
Each variant's weakness is the other's strength: (b) lacks mass/cloth, which (c) produces; (c) lacks line work,
accents and per-part motion, which (b) produces.

## Scores

| Date | Item | Modes / states shown | Score | Cycle | Top fixes (or "passed") |
|---|---|---|---|---|---|
| 2026-09-27 | Clan + Hall views + scrollbar (1.8b-4) | clan-*.png (scenarios/clan.js): Overlay Clan top/mid/end + branch-odds card, Overlay Hall top/mid/manual/end; Expanded Clan + Hall; Desktop Clan + Hall + Hall end | **7.5** accepted | 5 | 7.3 → 7.2 → 7.5 → 7.5 → 7.5 (**accepted by the user 2026-09-27**) (user asked for extra rounds; never a criterion < 6; plateau). Cycles 4–5 added: stacked hero Merit, nowrap stat labels, a real odds pill (22px) + "Your odds to win" total label, red edge on grave actions (Pass the Mantle, War), head card moved right to balance Desktop, seal copy "Needs the clan first: …". After cycle 5 (unreviewed): branches indented under a ◆ main line, "Past successions: …", "Buy · N Merit" lighter chip, two-up minor stats, claimed firsts more readable, brighter idle scrollbar thumb. Remaining cycle-5 asks: fewer nested boxes in Overlay, section-wide fold toggles, a marker per ancestor row. Cycle 1: numbers orphaned in narrow tiles (short labels, nowrap, stacked branch meter), manual rows stacked, odds colored by value, affordable vs short buy states, 本 dropped from the tree; **found + fixed a BreakdownUI bug**: every HUD tick rebuilt the card and restarted its fade, so live-number cards flickered/stayed invisible; attention strip now re-renders when an item's reason text changes. Cycle 2: legacy Now/Next full width + footer buy, red only on the stakes words, › on action tiles, ceremonial clan/Hall header, gold chronicle years, locked manual rows collapsed to one line, epitaph age falls back to the life's end year. Cycle 3: War/Push odds as an inline pill (one tile = one action), Challenge shows your bond, Merit as the hero stat, "N short" + progress bar instead of a dead button, "Ancestors", two-line clan summary, spaced glyph markers. |
| 2026-09-27 | Family view (1.8b-3a) | same | **7.5** accepted | 3 | 7.0 → 7.2 → 7.5 (never a criterion < 6: aesthetic 8, clarity 8, consistency 8, hierarchy 7, ergonomics 7, layout 7). **Accepted by the user (2026-09-27): "the family tab gets a pass".** Fixed after the review: "Try for a child" says "They already ask: answer above" while that spouse's wish is pending. Remaining asks: too many gold-framed boxes (only the pending decision + one action should be gold; ordinary tiles --border until hover); Expanded gives the pane ~250px (collapse the rail to icons at 640px); meta/segmented control ≥ 11px and 26px tall; last-meeting result as a small block with the interest chip on the title line; Propose and odds as two separate buttons; Teach's cost on its own line. |
| 2026-09-27 | Family view + courtship + popovers (1.8b-3a) | fam-*.png (scenarios/family.js): Overlay alone / candidates / meeting / courting + propose card / married + affection card / open child; Expanded; Desktop + affection card; Banner | 7.2 FAIL | 2 | Meeting choices were bare rectangles → approach seals + "who likes it" hints (COURT_WAYS) and the last meeting's result + interest change on the card; 10 font sizes → 10.5 / 11.5 / 13 (+14/17 glyphs); flavor lines lighter at 11.5px; pink courtship accent → --purple; wish buttons one line in Overlay; child bond = word + bar + number inline; every withdraw/separate is one quiet-button pattern; Family Planning moved to the left column ("Children to come") to balance Desktop; smoke's fake affection history used negative years. |
| 2026-09-27 | Family view (1.8b-3a) | same | 7.0 FAIL | 1 | Popover titles ellipsized → "Affection" / "Proposal odds"; spouse tiles wrapped mid-phrase in Expanded → auto-fit grid (1 column under ~265px); Separate as a red-edged quiet button; Overlay candidates as compact rows, Court beside the name; meeting card scrolls into view, interest meter compact while it's open; Propose + a 56px odds button (45.7%, same number as the card); sublines 10.5px, 封 reasons in purple; fmt trims "210.00M" → "210M"; plurals; "morality ±N" instead of kinder/harder; local surface vars (--fam-ink/-ember/-sunk) instead of ad-hoc rgba(); gold corner mark on available tiles; heir buttons as tiles. |
| 2026-09-26 | Character view + breakdown popovers (1.8b-2) | char-*.png (scenarios/character.js): Overlay view + qps/bt/health cards + HUD 詳 card, Expanded view + bt card, Desktop view + qps card, Banner peek card, late save view + Ascension + Bloodline cards | **7.3** accepted | 3 | 6.5 → 7.0 → 7.3 (never a criterion < 6). Cycle 1 fixes: Overlay numbers-first (identity card last, catch-up banner hidden since the HUD chip shows it), popover max-height set before measuring (banner overflow), running subtotals in multiplier chains, one-decimal %, 24px 詳 badge + 42px hit area, 詳 corner mark on every tile, ink-violet tile surface shared with the popover, duplicate CSS removed, "Root root" label. Cycle 2 fixes: title ellipsis span, "Bloodline" title, no-break durations, fail line incl. karma, tile hover lift + gold corner accent, list cards, bigger HUD hit areas, brighter subtotals, smoke waits past the fade. After cycle 3 (unreviewed): 詳 badge inside the Breakthrough button, 30px ✕, flat terms say "flat" in the value column, injury rows "(N% chance) −dmg", BT card shows progress + ETA, tile sub-lines 11px lighter, identity meta "歲 Age · 年 Year · 代 Gen", name wraps outside Overlay. Remaining cycle-3 asks: popover caret/anchor tick, one value-color rule (gold/jade/cream mixed), Desktop empty space under the lists, tiles still fairly plain boxes. **Accepted by the user** (2026-09-27) after trying it; their one change: less plain CJK text (keep the colored glyph markers, drop CJK beside English names: root/personality tags, stage line, popover subtitles, section suffixes, fail-cost line). |
| 2026-09-26 | Navigation + attention + Mode panel (1.8b-1) | nav-*.png (scenarios/nav-attention.js): Overlay strip closed/open, every group, Mode idle/active, Expanded family/sect/mode, Desktop clan, Banner | **7.3** accepted | 7 | 6.7 → 6.8 → 7.3 → (user: "another round or two") → 7.2 → 7.5 → (user: "2 more rounds then it should be good") → 7.5 → 7.3 (never a criterion < 6; plateau, and reviewers began reversing each other's asks, e.g. one-line vs. two-line strip item). Fixed along the way: counts split by kind (decision/chance/nudge), +N colored by severity, group context on one-view rows, content column capped + ink wash in wide modes, 25px titlebar buttons, 11px group labels, Active orange → `--ember` token, compact unselected Mode card + "Runs:" line, two-line Overlay strip (timer · reason), rail Mode foot + selected glow, compact 自 chip, Mode scroll fade; after cycle 3 (unreviewed): automation On = jade fill, selected Off = neutral (was gold), chip says on/off. Cycle-3 remaining asks: titlebar mode as a labeled state chip distinct from 設/頂, Overlay nav ~34px, rail dead gap, Idle card height at 640px. Out of scope (view content, sprite) noted by all three. **Went to the user after 3 cycles**; the user asked for 1–2 more. Rounds 4–5 added: mode as a labeled state chip (閒 Idle / 動 Active), pin = lit underline, 歸/窗 replace ◀/▣, 34px Overlay nav, rail ink stroke 道 + Mode foot, top-aligned Mode cards, full top item (2-line title + reason) with per-kind dots on +N, scrim under the unfolded list, 28px On/Off + 26px 自 chip. After round 5 (unreviewed): attention header wraps cleanly at 640px, selected Off = pressed look, unselected = borderless dim, slimmer +N, badges in the tab corner. Remaining round-5 asks: Overlay titlebar crowding (move 歸/窗 into an overflow so the name keeps ~12 chars), Overlay strip height vs. the action buttons. **With the user again after round 5.** Rounds 6–7 added: Overlay ⋯ menu (歸 + 窗 folded; name keeps ~11 chars), shorter attention titles, two-segment On/Off switch (jade / neutral fill), 68px rail rows with 70% --text labels, reason up to 2 lines, 32px +N target, clean unfolded edge, sect context wins over the 自 chip. **Accepted by the user after round 7.** Leftover asks logged in START_HERE → UX Debt. |
| 2026-09-26 | Banner quick actions (1.7b) | banner strip + all 4 dropdowns, busy strip + toast | **6.2** FAIL | 3 | Learn descriptions overflowed the panel (fixed after the review: minmax grid + own desc line); make lock/shortage states consistent (fixed: 封 "Need 1 Beast Core" / "Need 石 N more"); strip itself still flat, dead space right of Learn (reserved for 1.8b attention strip). **Went to the user after 3 cycles → user accepted as-is (2026-09-26).** |
| 2026-09-26 | Banner quick actions (1.7b) | same | 6.3 FAIL | 2 | meta text too dim/small, orphaned wraps, craft have/need ambiguous, no drops on Explore, flat panel, emoji on strip → all addressed in cycle 3 |
| 2026-09-26 | Banner quick actions (1.7b) | same | 6.2 FAIL | 1 | toast covered strip controls; CN names / chips wrapping; locked rows at opacity .55 unreadable; hard-coded colors (→ new tokens --btn-bg/--panel/--scroll/--red-text); mixed emoji vs glyph icons |
