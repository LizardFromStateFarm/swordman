---
trigger: always_on
---

# General Agent Rules — Cultivator Idle

Always design for ease of future change. Separate concerns into their own files
(data in `assets/data/`, sprites in `assets/sprites/`, engine in `renderer/engine/`,
game logic in `renderer/game/`). Never duplicate — extract shared helpers instead.

## Pre-task assessment — required before any work

Before any tool call, file read, or code change, output:

```
TASK ASSESSMENT
───────────────────────────────────────
What:       [one sentence]
Touches:    [files/systems]
New files:  [if any]
Complexity: Low | Medium | High | Very High
Model rec:  Haiku | Sonnet | Opus
Reason:     [one line]
───────────────────────────────────────
```

Low = doc/config/CSS tweak → Haiku
Medium = single-system feature, 1–3 files → Sonnet
High = new Phase, 5+ files, new state+UI+logic → Sonnet
Very High = cross-system architecture, deep bugs, planning → Opus

If you assess High or Very High and are not on Sonnet/Opus, say so before proceeding.

---

## Project identity
Desktop idle game. Wuxia cultivation theme. Electron + vanilla HTML/Canvas.
ASCII art rendered via colored characters on canvas (no image files).
Read `CLAUDE.md` before touching any file. Read `START_HERE.md` for session context.
Read `docs/index.md` to find the system doc for whatever you're modifying.

## Visual assets
All new or modified sprites MUST pass the two-agent Asset Pipeline in `.agents/rules/assets.md`.
Minimum review score: 8.0 / 10. No exceptions.

## Code style
- Vanilla ES6+ only — no frameworks, no bundlers, no transpilers.
- Name things clearly; skip comments that just restate what the code does.
- Prefer editing existing files over creating new ones.
- No error handling for things that can't happen. Trust internal invariants.

## Electron security
- `nodeIntegration: false` — never change this.
- All Node access goes through `preload.js` contextBridge only.
- Do not add `unsafe-inline` to the Content Security Policy.

## Fast-forward testing
To test new stages/mechanics quickly: temporarily set `qiCap: 50` on the mortal
stage in `assets/data/stages.js`, verify, then restore before committing.

## Documentation — what's required and when

See `CLAUDE.md` for the full rules. Quick reference:

| When | What to update |
|------|---------------|
| Every task | START_HERE.md "Last Session" block |
| Every task that changes a phase | PLAN.md phase status |
| Touched an existing system | docs/systems/<system>.md |
| Created a new system | Create docs/systems/<name>.md from template in docs/index.md |
| Added/removed/renamed files | CLAUDE.md Project Structure |
| Created a new data file | Top-of-file comment (contents + dependents) |

An agent that skips documentation is leaving a trap for the next agent.
