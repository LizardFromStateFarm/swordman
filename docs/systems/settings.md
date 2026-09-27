# Settings — Reference
_Covers: assets/data/settings.js · renderer/game/settings.js · game-state.js (settings API) · game.js (⚙ wiring, fmt) · ascii-renderer.js (speed/motion) · styles.css (tokens) · Phase: 20C (roadmap M1 task 1.1) · Updated: 2026-09-25_

## State
- `s.settings: object`. Stored **per slot** and carried across death/reincarnation (`_die()` copies it).
  One key per entry in `SETTINGS_DEFS`. Missing keys are filled with defaults by `_ensurePhase20CFields()`,
  and unknown or invalid values are reset to the default there too.
- Charselect runs before a slot loads, so it always uses the defaults (no settings are applied there).

## API (game-state.js)
- `setSetting(id, value) → { ok, reason? }` validates the value against `SETTINGS_DEFS`
  (`choice`: must be one of the option values; `range`: number, clamped to min/max, snapped to step),
  writes it, then saves and notifies. Reasons: `unknown`, `invalid`.
- `getSettings() → object` returns the current settings, or the defaults when no game is loaded.
- `defaultSettings()` builds a fresh object from `SETTINGS_DEFS`.

## Data Shape (assets/data/settings.js)
`SETTINGS_DEFS = [{ id, label, group, type:'choice'|'range', options?:[{value,label}], min?, max?, step?, default, hint? }]`
- Order in the array = order in the panel. `group` = the section heading in the panel.
- **Later tasks add a toggle by appending one entry here** and reading `s.settings.<id>` wherever it matters.
  No other plumbing is needed: the panel renders from the defs, and migration fills the default.

| id | type | values | default | Applied by |
|----|------|--------|---------|-----------|
| displayNumbers | choice | raw / formatted / scientific | formatted | `fmt()` in game.js |
| banterFreq | choice | off / rare / normal / chatty | normal | `BanterSystem` idle interval (`BANTER_FREQ`); off = silent |
| profanity | choice | uncensored / masked | uncensored | `BanterSystem.mask()` at display time (bubble + log) |
| animSpeed | choice | 0.5 / 1 / 2 | 1 | `renderer.setSpeed()`: scales dt → particles, rings, sprite fps |
| reducedMotion | choice | false / true | false | `renderer.setReducedMotion()`: no particles/rings, sprite only |
| colorblind | choice | off / deuteranopia / protanopia | off | `<html data-cb>` → CSS overrides `--red`/`--jade` |
| fontSize | choice | 11 / 13 / 15 | 13 | `#tab-body` `zoom` = value/13 (scales panel text only) |
| canvasBrightness | choice | 0.7 / 1 / 1.3 | 1 | `#sprite-canvas` `filter: brightness()` |
| bgOpacity | range | 0.2–1.0, step 0.05 | 1 | `--bg-opacity` CSS var multiplies window background alphas |
| closeButton | choice | quit / tray | quit | `#btn-quit` (game.js) + native closes via `setCloseToTray` (main.js): real quit vs hide to tray. Renamed from `closeAction` (default tray) in 1.8b-1 so old saves get the new default; the old key is dropped by the unknown-key cleanup (notifications.md) |
| notifyBreakthrough / notifyExpedition / notifyWar / notifyBeastTamed / notifyDeath | choice | false/true | false (all) | `NotificationSystem` per-type gate (Phase 9B, notifications.md) — opt-in, all off by default |

## Wiring
- ⚙ `#btn-settings` (titlebar) → `settingsUI.open()` → `#settings-overlay`, rendered from `SETTINGS_DEFS`.
- A control change calls `gameState.setSetting()`; the `subscribe()` in `bootGame()` then calls `settingsUI.apply(s.settings)` on every notify. `apply` diffs against the last applied values, so it's cheap to run every time.
- `settingsUI.palette()` → `{ red:[r,g,b], jade:[r,g,b] }` read from the computed CSS vars. The health-bar lerp and the toast colors use it, so color-blind mode reaches those inline-styled elements too.
- The sim loads `assets/data/settings.js` (for migration defaults) but not `renderer/game/settings.js` (UI only).

## Invariants
1. Every `s.settings` key is in `SETTINGS_DEFS`, and every value is valid for its def (sim invariant `settings_invalid`).
2. Settings never affect game logic or balance, only presentation. Keep game-changing modes (20A permadeath, 20B challenge) in a separate `s.challenge` object when those are built, not in here.
3. Color-blind palettes are UI color tokens, so they go through the Asset Pipeline (`// Review score:` comment in styles.css).

## Gotchas
- `--bg-opacity` only scales the translucent *window chrome* backgrounds (`--bg`, the titlebar, the `#app` shadow). Buttons, cards and overlays keep their own alpha so text stays readable. At 0.2 the desktop shows through strongly, which is intended.
- Event-log text that was already written (e.g. "Absorbed 1.2K Qi") was formatted with `fmtQi()` in game-state.js at the time. It does not reformat when `displayNumbers` changes. Only live HUD/tab numbers do.
- `zoom` on `#tab-body` scales layout as well as text. At 15px some panels scroll more, which is expected. Don't apply it to the whole window: the canvas is sized per layout mode by LayoutUI (ui-layout.md → Layout modes). The window layout itself is NOT a ⚙ setting: it's app-wide in window.json, chosen from the titlebar ▣ picker.
- `displayNumbers: 'raw'` prints full digits (`26,340,613,447`). Fine at 300 px up to ~1e12 on the Qi bar. Past that, `raw` can crowd the Qi row. `scientific` switches over at ≥ 1e4.
- Color-blind palettes (styles.css, Review score 8.0): Deutan `--red #E4572E`/`--jade #4BD2C2`, Protan `#F0502A`/`#45C8E8`. Sky-blue "jade" was rejected because it collides with `--purple` under deutan simulation (ΔE≈8). Keep any new jade substitute teal/cyan.
- UI check without touching real saves: `npx electron . --user-data-dir=<scratch> --remote-debugging-port=9333`, then drive it over CDP.
- Reduced motion also stops the breakthrough burst particles. The sprite frame animation still runs (slowed by `animSpeed`).
