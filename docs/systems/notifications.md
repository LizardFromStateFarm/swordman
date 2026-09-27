# Notifications & Tray — Reference
_Covers: main.js (Tray/Notification/IPC) · preload.js · renderer/engine/platform-storage.js · renderer/game/notifications.js · game-state.js (beast_tamed/death emits) · assets/data/settings.js (per-type toggles + close-button choice) · assets/icons/tray-icon.png · Phase: 9A–B (roadmap M1 task 1.3) · Updated: 2026-09-26_

## What this is
Electron system tray (9A) + opt-in native OS notifications (9B). Pillar 4 ("never punish absence,
notifications are opt-in"): every notification type defaults **off**, and nothing in the game
requires them — they are convenience, not a summons. War notifications are phrased as news, not
"log in now" (Standing Orders, Phase 32, own that call — a war notification never implies a window
will be missed if ignored).

## State
- No new required state fields. Notification triggers piggyback on the existing `onGameEvent`
  listener list (Phase 29) plus two new emit sites (below); per-type cooldowns live in-memory inside
  `NotificationSystem`, not in the save (a fresh cooldown table each launch is fine — it only exists
  to stop a burst of the same type spamming the OS notification tray in one sitting).
- `s.settings` (SETTINGS_DEFS, settings.md) gained 6 entries, all under the generic settings
  migration (`_ensurePhase20CFields()` already fills/validates *any* entry in `SETTINGS_DEFS` —
  no new `_ensurePhaseNFields()` was needed):
  | id | type | values | default |
  |----|------|--------|---------|
  | `closeButton` (was `closeAction` until 1.8b-1) | choice | `quit` / `tray` | `quit` (user 2026-09-26; was `tray`) |
  | `notifyBreakthrough` | choice | `false`/`true` | `false` |
  | `notifyExpedition` | choice | `false`/`true` | `false` |
  | `notifyWar` | choice | `false`/`true` | `false` |
  | `notifyBeastTamed` | choice | `false`/`true` | `false` |
  | `notifyDeath` | choice | `false`/`true` | `false` |

## API
- `game-state.js` `_emit('beast_tamed', { name })` — new, fired at the end of
  `tameEncounteredBeast()` on success.
- `game-state.js` `_emit('death', { cause, maxStage })` — new, fired at the top of `_die(cause)`
  *before* `this._s` is replaced (so it can still read the dying life's stage). `reborn` still
  fires afterward, unchanged, for banter.
- Reused emits (no change): `expedition_return`, `war_call` (declared/started), `war_won` /
  `war_lost` (resolved) — see banter.md for the full list.
- "Breakthrough ready" has **no emit**: `NotificationSystem.tick()` edge-detects
  `s.derived.canBreakthrough` (false→true) itself, the same value the Breakthrough/Ascension
  button already reads — diffing existing derived state instead of adding a new mutation path.
- `window.electron.notify(title, body)` — fire native OS notification (main process). No-op on iOS/browser.
- `window.electron.hideToTray()` — hides the window (stays running, tray icon remains). No-op elsewhere.
- `window.electron.updateTrayInfo(name, stageLabel)` — updates tray tooltip + the disabled menu label. No-op elsewhere.
- `window.electron.onRequestSave(cb)` — main process asks the renderer to flush an autosave before
  a real quit; `game.js` wires `cb = () => gameState.forceSave()`. No-op elsewhere (nothing ever
  sends the event on those platforms since there's no tray/quit flow to protect).

## Engine (renderer/game/notifications.js → NotificationSystem, DOM-free, loaded by the sim)
- Constructor `(state, isWindowActive = () => true, fire = (title, body) => {})` — mirrors
  `BanterSystem`'s `(state, isBlocked)` shape. Subscribes to `onGameEvent` immediately.
- `_send(kind, settingId, title, body)` gates on, in order: the per-type setting (off by default),
  `!isWindowActive()` (news only fires while the player isn't looking — hidden, minimized, tray, or
  simply unfocused), then a per-`kind` cooldown (`NOTIFY_COOLDOWN_S`, 10–300s depending on type) so a
  burst of the same event type can't spam the OS tray.
- `tick()` is the only method that needs calling every frame; it does the `canBreakthrough` edge
  check. Event-driven types fire straight from the `onGameEvent` callback, no tick needed for those.
- Flavor text is short, xianxia-flavored, and deliberately not urgent ("Qi gathered — a breakthrough
  awaits", not "COME BACK NOW").

## Wiring
- `game.js`: `const notifSys = new NotificationSystem(gameState, () => !document.hidden && document.hasFocus(), (title, body) => window.electron.notify(title, body))`, ticked once per frame like the other systems.
- `game.js` also diffs `s.name` + the stage label once per HUD update and calls
  `window.electron.updateTrayInfo(name, stageLabel)` only when either changed (cheap IPC, not every frame).
- `#btn-quit` click handler branches on `gameState.getSettings().closeButton`: `'quit'` (default since 1.8b-1)
  calls `forceSave()` then `quit()`; `'tray'` calls `forceSave()` then `hideToTray()`. `SettingsUI.apply` sends the
  choice to main.js (`window.electron.setCloseToTray(bool)`, IPC `set-close-to-tray`; no-op in the iOS shim) so
  native closes (Alt+F4, taskbar "Close window") follow it too.
- **Why the default changed (1.8b-1, user report):** with always-hide, ✕ never ended the app, and with no
  single-instance lock every relaunch started another full copy. The user ended up with 2 invisible copies
  (8 processes) that locked `dist/`, so `npm run dist` silently kept the stale build.
- **Single instance (packaged builds only):** `app.requestSingleInstanceLock()`; a second launch quits at once
  and the running copy's `second-instance` handler shows + focuses its window. Not applied to `npm start`, so dev
  can run beside an installed copy. Verified on a packaged build: 2nd launch exits 0 with no new processes, and
  in-game ✕ leaves 0 processes.
- `main.js`: `Tray` built from `assets/icons/tray-icon.png` (nativeImage), tooltip + a disabled
  `"<name> — <stage>"` menu line + `Open` + `Quit`. `click`/`double-click` both toggle
  show/hide+focus. `win.on('close', …)` is intercepted **only when `closeToTray` is set**: unless a real quit is in flight
  (`isQuitting`, set by the app-wide `before-quit` handler — covers the tray's Quit item *and*
  `window.electron.quit()`), it calls `e.preventDefault(); win.hide()` instead of closing — this is
  what makes "close = hide to tray" hold even if something calls the window's native close outside
  the ✕ button (e.g. right-click the taskbar entry → Close window). `before-quit` also
  `webContents.send('request-save')` and gives the renderer ~200ms to flush before actually quitting.

## Data Shape
- `assets/icons/tray-icon.png` — 32×32 RGBA, hand-written PNG (no image deps — `zlib.deflateSync`
  + a hand-rolled CRC32; see `scripts/gen-tray-icon.js`, not run at boot). Jade fill (`--jade`),
  gold ring (`--gold`), dark qi-swirl glyph. Self-reviewed against the Asset Pipeline criteria
  (thematic fit, legibility at tray size, contrast, distinctiveness) — average **8.6/10** (see
  `scripts/gen-tray-icon.js` header comment); full two-agent pipeline was judged overkill for a
  single static tray glyph per the task's own carve-out.

## Invariants
1. Every notification type defaults to **off**; `_ensurePhase20CFields()`'s generic validator keeps
   any invalid/unknown value pinned to a valid `SETTINGS_DEFS` option, same as every other setting.
2. Notifications never fire while the window is visible/focused — they're for when the player
   *isn't* looking, not a duplicate of the in-app toast.
3. Nothing in the game logic depends on a notification having fired. Turning them all off (the
   default) must be indistinguishable from removing this file, gameplay-wise.
4. `NotificationSystem` never mutates `s` — no new required state, so nothing here needs a new
   `_ensurePhaseNFields()` (rule 5's fallback path wasn't needed; the generic settings migration
   already covers new `SETTINGS_DEFS` entries).

## Gotchas
- The sim loads `notifications.js` (added to `LOGIC_FILES`/`systems` in `scripts/sim/loader.js`) so
  a syntax/throw regression here fails `npm run sim:quick` — but the sim's default
  `isWindowActive = () => true` means `_send()` always gates closed there, so it's a load/no-throw
  check only, not a behavior test. No sim invariant or bot behavior was added — there is no player
  action to teach the bot, and no state field to bound-check.
- `win.hide()` also removes the taskbar entry on Windows (that's normal `hide()` behavior, not
  something this feature adds) — the tray icon is the only way back once hidden.
- `Notification.isSupported()` is checked in `main.js` before constructing one; some sandboxed/CI
  environments have no notification backend, and this must stay silent there, not throw.
- Clicking a notification always shows+focuses the window regardless of which type fired it — there
  is no per-type "go to this tab" deep link (out of scope for this task).
- 9C/9D (day/night, seasons) are unrelated cosmetic-only work parked in M8 — not touched here.
