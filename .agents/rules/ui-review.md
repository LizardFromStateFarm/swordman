# UI Review Rules: the visual design gate (user rule, 2026-09-26)

Every UI change and every visual asset is scored **0–10 by a separate reviewer agent** before it's done.
This file holds the scale, the review prompt and the gate. The summary lives in `CLAUDE.md` → "VISUAL REVIEW GATE".
The score history lives in `docs/systems/ui-review.md`.

---

## What's covered

- **UI:** any new or changed screen, tab, panel, overlay, popup, menu, layout mode, component, HUD element, or
  CSS that changes how something looks. If the player would see a difference, it's covered.
- **Assets:** sprites, animations, palettes and color tokens. They still use `.agents/rules/assets.md` for creation
  and its own criteria, **on the same anchored 0–10 scale below**.
- Not covered: pure logic, data balance, or text-only log lines (text still follows the xianxia flavor rules).

## The scale (anchored; use it the same way every time)

| Score | Means |
|---|---|
| **0** | Garbage: broken, unreadable, overlapping, clearly unfinished |
| **2** | Works, but ugly: raw browser defaults, misaligned, cramped |
| **4** | Plain developer UI: functional, forgettable, no atmosphere |
| **6** | Below par: readable and consistent, but weaker than an average mobile indie idle game |
| **7.5** | **Average for a mobile indie idle game** — the UI **pass bar**. What a competent, shipped idle game's UI looks like |
| **8** | **Above average** — clearly better than a typical mobile indie idle game |
| **9** | **Extremely good** — better than most, or all, indie idle games |
| **10** | **Perfect** — better than any idle game's UI |

The reference class is **mobile indie idle games** — this game's genre and market — **not AAA and not a generic web
app**. Half points are fine. 7.5 is the pass bar: "as good as the average shipped idle game." Score **relative to
that class**: an 8 means above the pack, so don't hold a screen at 7.x just because a different taste would have done
it differently — that is the failure mode that pins reviews (see "Reviewer brief" below).

---

## Reviewer brief (include VERBATIM in every review prompt)

Every cycle must judge against **this game's intent**, not a generic web-app rubric — otherwise each fresh agent
invents its own standard and they contradict each other. Paste this block into the prompt every time:

> **Cultivator Idle** is a single-player wuxia/xianxia **idle** game (Electron desktop + iOS/Android). The look is
> **dark ink and parchment-gold** — an ethereal xianxia-novel translation, not a SaaS dashboard. These are deliberate
> and are **not** defects: monospace (Courier New) everywhere; monochrome line-art SVG icons (the custom set, `Icon()`) as marks; a narrow
> ~300px Overlay mode by design; the six nav group marks (修 歷 家 宗 囊 錄); glyph art on a canvas. **Readability
> beats density** — a calm, legible screen beats a busy one. Judge consistency against the rest of the game and
> against `GAMEDESIGN.md`, `docs/systems/ui-layout.md` (incl. "UX direction") and `docs/systems/ui-review.md`
> (history + what is already known/accepted).

**Do NOT raise (settled or out of scope — raising them is not a finding):**
- the monospace font, the ~300px Overlay width, or the CJK nav group marks;
- the **canvas sprite** (its ⚡ ☯ emoji and the art itself belong to the Phase 34 art track, A1–A4) — UI emoji are
  gone since 1.8d and a lint keeps them out, so any emoji **outside the sprite** is a real `[blocker]`;
- anything already listed as a known leftover in `docs/systems/ui-review.md` or `START_HERE.md` → "UX Debt"
  (say "still open" at most);
- a preference a previous cycle already settled (the history is handed to you).

**Label every issue `[blocker]` or `[polish]`.** `[blocker]` = broken, unreadable, unusable, overlapping, regressed,
or a missing "why is this locked" — it stops the pass. `[polish]` = taste / spacing / wording — logged as UX debt,
does **not** stop the pass. Give at most **3** issues (blockers first, then "…and N more").

## How to run a review

**One reviewer per cycle, run sequentially.** A cycle is: review → apply the blockers → re-screenshot → a **new**
reviewer. Maximum **3 cycles**, then the user decides. Never spawn several reviewers for one change at once (the only
multi-reviewer run was the 1.8c baseline — one reviewer *per group*). **Combined re-reviews** (user 2026-09-27, 1.8b-6):
one reviewer may cover up to ~3 screen groups (~30–35 screenshots) in a cycle, scoring **each group separately** (own
criteria, average, issues, PASS/FAIL); a group that passes drops out of later cycles.

1. **Get real pixels.** Screenshot the change in the real app with a smoke scenario (`scripts/smoke/cdp.js` +
   `shot()`), in **every layout mode it appears in** (Overlay, Expanded, Desktop, Banner, and the narrow phone width
   if relevant). Include the states that matter: empty, full, disabled/locked, active, and a late-game save with lots
   of content (dev presets).
2. **Spawn a fresh reviewer agent** (Agent tool, a new general-purpose agent, never the author grading itself). Give
   it the prompt below **plus the Reviewer brief above verbatim**, the screenshot paths, the relevant HTML/CSS, and
   the previous cycle's score + what was fixed/accepted. It reads the images with the Read tool.
3. **Gate** (below). Record the result in `docs/systems/ui-review.md` and, for a component, put a
   `/* UI review: X.X (YYYY-MM-DD) */` comment at the top of its CSS section.

## Review prompt

```
You are a demanding-but-fair visual/UX reviewer for "Cultivator Idle", a wuxia/xianxia cultivation idle game built
only from HTML/CSS and glyph art on canvas (Electron desktop + iOS/Android). Style target: dark ink and parchment-gold,
an ethereal xianxia-novel translation — not a SaaS dashboard.
Design tokens: --bg rgba(8,4,14,.93) · --bg2 · --text #E8D8B0 · --dim #8A7A60 · --gold #EDD050 · --red #C83030 ·
--jade #30B878 · --purple #9070C8 · --border #2A1A10 · monospace font (Courier New).

[PASTE THE "Reviewer brief" BLOCK ABOVE HERE, VERBATIM]

Review: [WHAT CHANGED — one paragraph: what the player uses it for]
Screenshots (open each with the Read tool): [PATHS, with the mode/state of each]
Relevant markup/CSS: [PATHS or excerpts]
Previous cycle (if any): [score + the fixes applied + anything the user accepted] — verify those fixes landed, and
raise only NEW issues.

Score each criterion 0–10 on the anchored scale in this file, against **mobile indie idle games** as the reference
class (6 below par · **7.5 average for a mobile indie idle game = the pass bar** · 8 above average · 9 extremely good,
better than most/all · 10 perfect). Judge against this genre, not AAA or a generic web app.

Criteria:
1. Aesthetic & atmosphere — ethereal/xianxia, matches the game (not a generic web form)
2. Visual hierarchy & readability — the eye lands on the right thing; text size/contrast comfortable
3. Information clarity — state, costs, odds, and WHY something is locked are visible (CLAUDE.md UX Pass)
4. Interaction & ergonomics — obvious what's clickable, adequate target sizes, few clicks, clear feedback
5. Consistency — uses the design tokens and existing component patterns; no one-off styles
6. Layout fit — no clipping, overflow, awkward empty space or cramming, in every mode shown
Emoji: any emoji outside the canvas sprite is a `[blocker]` (the sprite is out of scope: art track A1).

Required output:
  Per criterion: N/10 + one sentence why
  Overall average: X.X / 10
  Issues: at most 3, each labelled `[blocker]` or `[polish]`, most impactful first (specific: which element, what
  change, e.g. "raise row meta text 9px → 10px and --dim → --text for costs you can afford")
  PASS (average ≥ 7.5 AND no criterion < 6 AND no [blocker]) or FAIL
```

## Gate

| Result | Action |
|---|---|
| **UI: average ≥ 7.5 AND no criterion < 6 AND no open `[blocker]`** | Done. Record the score + CSS comment |
| Otherwise (a `[blocker]`, a criterion < 6, or average < 7.5) | Apply the reviewer's blockers, re-screenshot, re-review with a **fresh** agent |
| 3 cycles, still failing | Show the user the latest screenshots + scores and let them decide |

`[polish]` issues never fail a review — log them as UX debt. **Asset reviews keep their own gate of ≥ 8.0**
(`.agents/rules/assets.md`); the 0–10 scale is shared, the pass bar is not.

A task with player-visible changes is **not done** until its review has passed (or the user has accepted it after
3 cycles). Mention the final score in START_HERE's Last Session.
