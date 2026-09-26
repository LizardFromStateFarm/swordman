# UI Review — Score History
_Covers: visual design review results for every screen, component and asset · Rules: `.agents/rules/ui-review.md` · Updated: 2026-09-26_

## What this is
The scoreboard for the visual review gate (CLAUDE.md → "VISUAL REVIEW GATE"). Every UI change and visual asset is
scored 0–10 by a fresh reviewer agent from real screenshots: 0 = garbage, 6 = decent, 8 = polished + atmospheric
(the pass line), 10 = "can't believe this is CSS and ASCII art". Record every review here, newest first per item.

## Baseline of what already exists
Not reviewed yet. Roadmap task **1.8c** reviews every existing screen, mode and sprite and fills the table below.
Low scorers become fix items for 1.8b.

## Scores

| Date | Item | Modes / states shown | Score | Cycle | Top fixes (or "passed") |
|---|---|---|---|---|---|
| 2026-09-26 | Banner quick actions (1.7b) | banner strip + all 4 dropdowns, busy strip + toast | **6.2** FAIL | 3 | Learn descriptions overflowed the panel (fixed after the review: minmax grid + own desc line); make lock/shortage states consistent (fixed: 封 "Need 1 Beast Core" / "Need 石 N more"); strip itself still flat, dead space right of Learn (reserved for 1.8b attention strip). **Went to the user after 3 cycles → user accepted as-is (2026-09-26).** |
| 2026-09-26 | Banner quick actions (1.7b) | same | 6.3 FAIL | 2 | meta text too dim/small, orphaned wraps, craft have/need ambiguous, no drops on Explore, flat panel, emoji on strip → all addressed in cycle 3 |
| 2026-09-26 | Banner quick actions (1.7b) | same | 6.2 FAIL | 1 | toast covered strip controls; CN names / chips wrapping; locked rows at opacity .55 unreadable; hard-coded colors (→ new tokens --btn-bg/--panel/--scroll/--red-text); mixed emoji vs glyph icons |
