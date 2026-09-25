# iOS Port — Reference
_Covers: capacitor.config.json · scripts/build-ios-web.js · renderer/engine/platform-storage.js · Updated: 2026-09-24_

## What this is

Adds a second native shell (Capacitor, targeting iOS) around the *same* `renderer/` + `assets/`
game code that Electron already uses. Electron/PC is completely untouched — this is additive only.
See the last START_HERE.md session block and the chat conversation this was set up in for the full
reasoning (why Capacitor, why full-screen instead of the desktop overlay, why TestFlight over
sideloading via Google Drive).

## State

No game state changes. This only adds a platform layer.

## API

`window.electron` — same 6-method surface `game.js` / `game-state.js` already call
(`loadAllSlots`, `loadSlot`, `saveSlot`, `deleteSlot`, `quit`, `toggleAlwaysOnTop`).
Electron's `preload.js` still provides the real one via contextBridge; on any other shell
(Capacitor iOS, or a plain browser) `renderer/engine/platform-storage.js` installs a fallback
backed by `localStorage`, only when `window.electron` isn't already present. **Never call
`window.electron` methods before this fallback has had a chance to load** — its `<script>` tag
must stay before `engine/game-state.js` in `renderer/index.html`.

## Data Shape

None — `platform-storage.js` just JSON-stringifies whatever `game-state.js` already passes to
`saveSlot`, same as Electron's `main.js` does to disk.

## Wiring

- `assets/` lives as a sibling of `renderer/` (Electron's on-disk layout: `renderer/index.html`
  references it via `../assets/…`). Capacitor bundles only its `webDir`'s contents into the native
  app, so a combined self-contained folder is needed — `npm run build:web`
  (`scripts/build-ios-web.js`) copies `renderer/*` and `assets/*` into `www/` and rewrites that one
  `../assets/` path in the copied `index.html` to `assets/`. **`www/` is 100% generated — never
  hand-edit it, it's wiped and rebuilt every run, and it's gitignored.**
- `capacitor.config.json` → `webDir: "www"`, `appId: "com.cultivator.idle"` (matches the Electron
  build's `appId` in `package.json`).
- `npm run cap:sync` = `build:web` + `npx cap sync ios` (copies `www/` into the native Xcode
  project). `npm run ios:open` also opens Xcode afterward.
- The desktop-only concept of an always-on-top transparent overlay window has no iOS equivalent —
  the iOS build is a normal full-screen app you open, not a persistent screen companion.
  `toggleAlwaysOnTop`/`quit` are no-ops there.

## Gotchas / Not Done Yet

- **UI is not responsive.** `renderer/styles.css` hard-codes `width: 300px` (sized for the desktop
  overlay window) and uses `-webkit-app-region: drag` (Electron-only, harmless no-op elsewhere).
  On an iPhone screen this currently renders as a small fixed-size box, not full-screen. Needs a
  real responsive/mobile-layout pass — deliberately deferred, not part of this initial plumbing.
- **Capacitor packages aren't installed in this repo yet** (`@capacitor/core`, `@capacitor/cli`,
  `@capacitor/ios`) — this sandbox has no package-registry network access, so that install and
  `npx cap add ios` (which generates the `ios/` Xcode project) both need to be run from a terminal
  that has real internet access. Commands:
  ```bash
  npm install @capacitor/core @capacitor/cli @capacitor/ios --save-dev
  npx cap init "Cultivator Idle" com.cultivator.idle --web-dir=www
  npm run build:web
  npx cap add ios
  ```
  (`cap init` may prompt/overwrite `capacitor.config.json` — the values above already match what
  it would generate, so accepting its output is safe.)
- **No CI/TestFlight pipeline yet.** Building the actual `.ipa` needs Xcode (macOS), which this
  Windows box doesn't have. Once the Apple Developer account is active: a cloud macOS CI
  (Codemagic free tier fits) builds `ios/` and pushes to TestFlight. Not set up yet — waiting on
  the paid Apple Developer enrollment.
- Storage is `localStorage`-backed for now (simplest, zero extra native deps, works in any
  browser for quick testing too). `@capacitor/preferences` is a drop-in upgrade later if wanted —
  only `platform-storage.js`'s internals change, not any call site.
