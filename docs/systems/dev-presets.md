# Dev Presets (late-game test characters) — Reference
_Covers: assets/data/dev-presets.js · game-state.js (buildDevSave) · game.js (charselect) · main.js/preload.js/platform-storage.js (isDev) · styles.css (.cs-dev) · Phase: tooling · Updated: 2026-09-25_

## What it is
When running unpackaged (`npm start`), every **empty** slot on the character select screen shows a purple preset
picker + **DEV** button. Clicking it writes a ready-made late-game save to that slot and starts it. The packaged
`npm run dist` build (`app.isPackaged`) and the iOS/browser shim (`isDev: async () => false`) never show it.

## Presets (assets/data/dev-presets.js → DEV_PRESETS)
| id | Character | Good for testing |
|---|---|---|
| `member_elder` | Nascent Soul Middle, Heaven Defying Sect Elder (rank 3), 2 beasts, pills | Member wars (call to arms in 1 min), sect missions, ranks |
| `founder` | Spirit Severing Early, own sect w/ all buildings, Hall Lv3, 12 disciples, 3 beasts | Own-sect wars (war in 1 min), disciples, recruiting |
| `pre_ascension` | Spirit Severing Late, Qi at 95% of cap, 2 Heaven Defying pills, full sect | Ascension breakthrough + post-Ascension state |

Fields: `stageIndex, qiFrac, stones, karma, root, techniques ('all' = every one unlocked at that stage), inventory,
equipped, beasts[{typeId, level, traits}], sect{id, rank, contribution} | ownSect{name, hallLevel, buildings:'all'|ids,
disciples:[talent…], discipleLevel}, warInMinutes`.

## API
- `gameState.buildDevSave(presetId)` → save object | null — builds from `_newGame()`, doesn't touch the live state.
  Runs `_recalc()` against the new save (temporarily swapping `_s`) so `qiFrac` is a fraction of the *effective* cap.
- `window.electron.isDev()` → Promise<bool> — `ipcMain.handle('is-dev', () => !app.isPackaged)`; false on iOS/browser.

## Gotchas
- Saves are named `[DEV] …` so they're obvious in the slot list; delete them like any other save.
- Only empty slots offer presets — it never overwrites an existing save.
- Adding a preset: data only. Use real ids (items/beasts/sects/buildings); a quick check is loading the preset through
  `scripts/sim/loader.js` + `buildDevSave()` + a few `sim.step()` calls (done for the three shipped presets).
- New state fields added by future phases come from `_newGame()` automatically; only add preset fields for things
  that should start non-default.
