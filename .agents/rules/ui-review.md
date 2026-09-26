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
| **6** | Decent: consistent with the rest of the game, readable, nothing wrong, nothing special |
| **8** | Polished and atmospheric: would pass in a released, well-reviewed indie game; the xianxia mood comes through |
| **10** | Super impressive: *"I can't believe this is CSS and ASCII art"* |

Half points are fine. Reviewers should be stingy: an 8 has to be earned, and a 9+ is rare.

---

## How to run a review

1. **Get real pixels.** Screenshot the change in the real app with a smoke scenario (`scripts/smoke/cdp.js` +
   `shot()`), in **every layout mode it appears in** (Overlay, Expanded, Desktop, Banner, and the narrow iOS
   width if relevant). Include the states that matter: empty, full, disabled/locked, hover/active if it can be
   captured, and a late-game save with lots of content (dev presets).
2. **Spawn a fresh reviewer agent** (Agent tool, a new general-purpose agent, never the author grading itself).
   Give it the prompt below, the screenshot paths, and the relevant HTML/CSS. It reads the images with the Read tool.
3. **Gate** (below). Record the result in `docs/systems/ui-review.md` and put a `/* UI review: X.X (YYYY-MM-DD) */`
   comment at the top of the CSS section for that component.

## Review prompt

```
You are a demanding visual/UX design reviewer for "Cultivator Idle", a wuxia/xianxia cultivation idle game. It is
built only from HTML/CSS and colored ASCII art on canvas. Style target: ethereal, dark, parchment-gold, like a
xianxia novel translation brought to life. It runs as a small always-on-top desktop window and on iOS.
Design tokens: --bg rgba(8,4,14,.93) · --bg2 · --text #E8D8B0 · --dim #8A7A60 · --gold #EDD050 · --red #C83030 ·
--jade #30B878 · --purple #9070C8 · --border #2A1A10 · monospace font (Courier New).

Review: [WHAT CHANGED, one paragraph: what the player uses it for]
Screenshots (open each with the Read tool): [PATHS, with the mode/state of each]
Relevant markup/CSS: [PATHS or excerpts]

Score each criterion 0–10 on this anchored scale:
  0 garbage/broken · 2 works but ugly · 4 plain developer UI · 6 decent, consistent, nothing special ·
  8 polished + atmospheric, would pass in a released indie game · 10 "can't believe this is CSS and ASCII art"
Be stingy: an 8 is earned, a 9+ is rare.

Criteria:
1. Aesthetic & atmosphere — does it feel ethereal/xianxia and match the game, or like a generic web form?
2. Visual hierarchy & readability — the eye lands on the important thing first; text size/contrast is comfortable
3. Information clarity — the player can see state, costs, odds, and WHY something is locked (CLAUDE.md UX Pass)
4. Interaction & ergonomics — obvious what's clickable, adequate target sizes, few clicks, clear feedback
5. Consistency — uses the design tokens and existing component patterns; no one-off styles
6. Layout fit — no clipping, overflow, awkward empty space or cramming, in every mode shown
Automatic cap: any emoji visible in the screenshots caps criteria 1 and 5 at 5/10 (no-emoji rule, CLAUDE.md).

Required output:
  Per criterion: N/10 + one sentence why
  Overall average: X.X / 10
  PASS (average ≥ 8.0 and no criterion below 6) or FAIL
  Top 3 concrete fixes, most impactful first (specific: which element, what change, e.g. "raise row meta
  text from 9px to 10px and --dim → --text for costs you can afford")
```

## Gate

| Result | Action |
|---|---|
| Average ≥ 8.0 and no criterion < 6 | Done. Record the score + CSS comment |
| Otherwise | Apply the reviewer's fixes, re-screenshot, re-review with a **fresh** agent |
| 3 cycles, still failing | Show the user the latest screenshots + scores and let them decide |

A task with player-visible changes is **not done** until its review has passed (or the user has accepted it after
3 cycles). Mention the final score in START_HERE's Last Session.
