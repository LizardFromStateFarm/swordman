# Agent Development System — Reusable Template
<!--
  PORTABLE TEMPLATE — copy to a new project and rename to CLAUDE.md (or include it).
  Replace every [BRACKETED] section with project-specific content.
  Delete this comment block when you're done.
-->

---

## How agents use this project

> **READ FIRST EVERY SESSION:**
> 1. `START_HERE.md` — what's built, what was done last, what to do next
> 2. `docs/index.md` — if touching an existing system, load its doc before reading source files

[ONE PARAGRAPH: what the project is, stack, key constraints]

---

## ══ PRE-TASK ASSESSMENT (REQUIRED) ══

Before writing any code, reading any file, or making any tool call — output this block then ask user to approve out put(even on auto approve).
It takes 10 seconds and prevents the wrong model from attempting a task it'll struggle with.

```
TASK ASSESSMENT
───────────────────────────────────────
What:       [one sentence — what is actually being asked]
Touches:    [files/systems likely affected]
New files:  [any new files that will need to be created]
Complexity: Low | Medium | High
Model rec:  Haiku | Sonnet | Opus
Reason:     [one line — why that model]
───────────────────────────────────────
Proceed? If the wrong model is running this, stop and say so.
```

### Complexity guide

| Signal | Complexity | Model |
|--------|-----------|-------|
| Doc update, single-file tweak, config change, CSS fix | Low | Haiku |
| New feature in one existing system, 1–3 files, clear spec | Medium | Sonnet |
| New Phase / new system (state + logic + UI), 5+ files | High | Sonnet |
| Cross-system architectural change, subtle multi-system bug, anything requiring deep reasoning about interactions | Very High | Opus |
| Planning session, design decisions, no code | Any | Sonnet |
| Complex game asset | Very High | Opus |

**When to hard-stop:** If you assess the task as High/Very High and you are not running on Opus or Sonnet — say so explicitly before doing any work. Example: *"This task is High complexity. If you're running Haiku, switch to Sonnet before continuing."*

The assessment is not bureaucracy. It's a forcing function to think before acting.

---

## Project Structure

```
START_HERE.md      ← Session entry point — updated every session, every agent
CLAUDE.md          ← Dev rules (this file)
PLAN.md            ← Feature roadmap with phase-by-phase implementation detail
docs/
  index.md         ← System doc index + new-doc template
  systems/
    [system].md    ← One doc per implemented system; created when Phase lands
.agents/rules/     ← Optional: always-on rule files loaded by agent harness
  general.md
  assets.md        ← If the project has a visual asset review gate

[REST OF FILE TREE]
```

---

## Architecture Rules

[LIST YOUR NON-NEGOTIABLE ARCHITECTURE RULES — examples below:]

1. **State lives in one place.** [Which file/class.] Never mutate it from outside.
2. **Data files are data only.** No logic in data files.
3. **[Framework/security constraint].** [Why.]
4. **New systems → new system doc first.** Create `docs/systems/<name>.md` before writing code.

---

## ══ ASSET PIPELINE (MANDATORY) ══
<!--
  Use this section if your project has visual/audio/AI-generated assets that need
  quality control. Adapt the criteria to your asset type.
  Delete this section if not applicable.
-->

All [ASSET TYPE — ASCII sprites / UI mockups / generated images / etc.] must pass a
two-step create → review gate before being committed to any file.

### Pipeline steps

**Step 1 — Create**
Generate the asset using this prompt:

```
Create a [ASSET TYPE] for: [ASSET NAME]
Context: [PROJECT CONTEXT — where it renders, what it looks like, technical constraints]
Requirements:
  - [SPECIFIC REQUIREMENT 1]
  - [SPECIFIC REQUIREMENT 2]
Format: [EXACT OUTPUT FORMAT]
```

**Step 2 — Review**
Immediately after creation, rate it with this prompt:

```
Rate this [ASSET TYPE] for [PROJECT], 1–10 per criterion:

1. [CRITERION 1] — [what it means]
2. [CRITERION 2] — [what it means]
3. [CRITERION 3] — [what it means]
4. [CRITERION 4] — [what it means]
5. [CRITERION 5] — [what it means]

Asset under review:
[PASTE ASSET HERE]

Output:
- Score per criterion
- Overall average (must be ≥ 8.0 to pass)
- Specific issues if any criterion < 8
- Revised asset if any criterion < 7
```

**Step 3 — Gate**
- Average ≥ 8.0 → accepted; add to codebase with comment `// Review score: X.X`
- Average < 8.0 → revise failing criteria, re-run Step 2
- 3 revision cycles with no ≥ 8.0 → present both versions to user for final decision

---

## ══ DOCUMENTATION RULES (NON-NEGOTIABLE) ══

Documentation is part of implementation. "I'll update it after" means it never gets updated.

### After every task

**Always required:**
1. **`START_HERE.md` "Last Session" block** — date, agent role, what changed, what's next, what's incomplete.
2. **`PLAN.md` phase/task status** — mark completed items; note if implementation diverged from plan.

**Required when you touched a system:**
3. **`docs/systems/<system>.md`** — update state, API, wiring, gotchas to reflect current reality.
   If no doc exists for a system you just created, create it now from the template in `docs/index.md`.

**Required only when files are added/removed/renamed:**
4. **Project Structure section in this file** — keep the file tree current.

**Required for every new data file:**
5. **Top-of-file comment** — one line: what it contains, which files depend on it.

### A task is NOT done until

- The code works
- `START_HERE.md` is updated
- `PLAN.md` reflects the new state
- Relevant system doc exists and is current
- Build/tests pass

---

## ══ TECHNICAL DOCS SYSTEM ══

This project uses a `docs/systems/` layer for per-system references. The purpose is
**context efficiency**: agents load only the doc for the system they're touching, rather
than cold-reading all source files or loading a single bloated CLAUDE.md.

### When to load a system doc
- Modifying state shape or public API of a system → read its doc first
- Debugging unexpected behavior → the Gotchas section is the first place to look
- Implementing a feature that touches multiple systems → read each relevant doc

### When NOT to load system docs
- First-time setup / new game (no systems yet implemented)
- Simple one-liner fixes that don't change API or state
- Purely additive new features in their own isolated file

### System doc format (copy from `docs/index.md`)

```markdown
# [System Name] — Reference
_Covers: [file list] · Phase: N · Updated: YYYY-MM-DD_

## State
[field: type — one-line description each]

## API
[method(args) → return — one line each]

## Data Shape
[non-obvious fields in data files only]

## Wiring
[file → what it calls → when; 3–5 lines max]

## Invariants
[numbered list of rules that must always hold]

## Gotchas
[things that will burn a future agent if they don't know them]
```

**Target length:** 60–120 lines. No prose. No obvious things. Just facts a new agent needs
to avoid breaking the system when modifying it.

---

## Code Quality Rules

These apply to all code in this project.

**Scope discipline**
- Add only what the task requires. A bug fix doesn't need surrounding cleanup.
- Three similar lines is better than a premature abstraction.
- No error handling for scenarios that can't happen. Trust internal invariants.

**Comments**
- Default to no comments. Add one only when the WHY is non-obvious.
- Never write multi-line comment blocks explaining what the code does.
- Don't reference the current task, issue number, or caller in comments — that belongs in commit messages.

**State and data**
- State lives in one place. Other modules call methods; they don't mutate state directly.
- Data files contain data only. No logic, no side effects, no imports.

**UI/frontend**
- Test the golden path and edge cases before reporting a feature done.
- Type checking and tests verify code correctness, not feature correctness.

---

## Running Locally

```bash
[HOW TO RUN THE PROJECT]
```

[WHERE DATA / SAVES ARE STORED]
