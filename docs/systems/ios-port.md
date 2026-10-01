# iOS Port — Reference
_Covers: capacitor.config.json · scripts/build-ios-web.js · scripts/release.js · scripts/check-syntax.js · codemagic.yaml · renderer/engine/platform-storage.js · ios/ · Updated: 2026-09-25_

## What this is

Adds a second native shell (Capacitor, targeting iOS) around the *same* `renderer/` + `assets/`
game code that Electron already uses. Electron/PC is completely untouched — this is additive only.
See the chat conversation this was set up in for the full reasoning (why Capacitor, why full-screen
instead of the desktop overlay, why TestFlight over sideloading via Google Drive, why porting the
plumbing now instead of after the game is "done").

> **Android has its own shell + Google Play pipeline** — `android/`, `scripts/release-android.js`,
> `npm run release:android`. See `docs/systems/android-port.md`. It reuses the same `www/` this doc builds.

## State

No game state changes. This only adds a platform layer.

## API

`window.electron` — same surface `game.js` / `game-state.js` already call: `loadAllSlots`,
`loadSlot`, `saveSlot`, `deleteSlot`, `isDev`, `quit`, `toggleAlwaysOnTop`, plus Phase 9A/B's
`hideToTray`, `updateTrayInfo`, `notify`, `onRequestSave` (system tray + opt-in notifications —
all four are no-ops on this shim, see docs/systems/notifications.md).
Electron's `preload.js` still provides the real one via contextBridge; on any other shell
(Capacitor iOS, or a plain browser) `renderer/engine/platform-storage.js` installs a fallback
backed by `localStorage`, only when `window.electron` isn't already present. **Never call
`window.electron` methods before this fallback has had a chance to load** — its `<script>` tag
must stay before `engine/game-state.js` in `renderer/index.html`.

**Rule for future work (also in CLAUDE.md Architecture Rule #7):** if you add or change a
`window.electron.*` method, update it in BOTH `preload.js`/`main.js` (real Electron impl) AND
`renderer/engine/platform-storage.js` (iOS/browser fallback) in the same change. `npm test` /
`npm run release` won't catch a mismatch here — there's no automated check that the two APIs stay
in sync, only the syntax checker. Keep them in sync by hand.

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
  project at `ios/App/App/public`, which is itself gitignored — same reason as `www/`, it's
  regenerated every sync). `npm run ios:open` also opens Xcode afterward (needs a Mac).
- `ios/` is a real Capacitor-generated Xcode project (Swift Package Manager, no CocoaPods needed
  for this Capacitor version) — committed to git, minus the gitignored `public/` folder. Don't
  hand-edit generated files under `ios/App/App.xcodeproj` or `ios/App/CapApp-SPM` unless you know
  what you're doing; native config changes (icons, permissions, `Info.plist`) go through Xcode or
  `capacitor.config.json`, not by hand-patching the generated project.
- The desktop-only concept of an always-on-top transparent overlay window has no iOS equivalent —
  the iOS build is a normal full-screen app you open, not a persistent screen companion.
  `toggleAlwaysOnTop`/`quit` are no-ops there.

## The release pipeline (`npm run release`)

`scripts/release.js` is the one command that builds + publishes every platform; **`docs/systems/release.md`
is its reference** (steps, flags, versioning, credentials, gotchas) — this doc only covers the iOS side.

For iOS it does two things:

1. `npm run cap:sync` — rebuilds `www/` and syncs it into `ios/`. Proves the iOS web bundle still
   assembles cleanly. (This box can't compile the actual `.ipa` — no Xcode/macOS here.)
2. Triggers the Codemagic `ios-workflow` via Codemagic's REST API — **only if `CODEMAGIC_API_TOKEN`
   and `CODEMAGIC_APP_ID` are set.** Without them the step is a clearly-labeled no-op; every other
   step still runs.

It does **not** commit or push (it used to; removed 2026-09-29).

## CI / TestFlight (`codemagic.yaml`) — free macOS runners

`codemagic.yaml` defines an `ios-workflow` that builds `ios/` on a **free** Codemagic macOS M2 runner and
publishes straight to TestFlight. Free tier: $0/month, **500 macOS M2 build minutes refilled monthly**,
1 parallel build, unlimited apps — comfortable for this project (~40 iOS builds/month). GitHub Actions
would *not* be cheaper here: this repo is private, and private-repo macOS minutes bill at 10×, so its free
allowance works out to ~200 effective macOS minutes.

It has **no automatic triggers on purpose** (no `triggering:` section) — it only starts via the API call
`scripts/release.js` makes, so macOS minutes are spent only on builds actually worth shipping.

The workflow also stamps the iOS version: `MARKETING_VERSION` from the released version (`RELEASE_VERSION`
from the release script, else `package.json`) and `CURRENT_PROJECT_VERSION` from a UTC timestamp — the
Xcode project hard-codes both, and TestFlight requires a build number that never goes backwards.

**One-time setup (a human, once):** the header comment in `codemagic.yaml` is the checklist — Apple
Developer Program membership, the App ID + TestFlight record for `com.cultivator.idle`, a Codemagic account
with this repo connected, the `idlekey` App Store Connect integration, and the API token + app
ID exported as environment variables (`docs/systems/release.md` → "Credentials"). After that,
`npm run release` ships iOS builds with no further code changes.

## Gotchas / Not Done Yet

- **Responsive/mobile layout — ADDRESSED (Phase 6E mobile pass, 2026-09-27).** The old problem was twofold: (1)
  `index.html` had no `<meta name="viewport">`, so a phone's WebView used a ~980px layout viewport and the whole app
  rendered as a **tiny box**; and (2) there were no safe-area/touch rules. Now: the viewport meta
  (`width=device-width, viewport-fit=cover`) is in `renderer/index.html`; `styles.css` has a "MOBILE / narrow + touch"
  section (full-bleed `#app`/`#charselect`, `100dvh`, safe-area insets, a **bottom tab bar**, 38–48px tap targets,
  `touch-action`/tap-highlight handling, a lifted text floor, screen-fitting overlays); and `renderer/game/layout.js`
  fits the sprite canvas to the HUD width on narrow screens. See `docs/systems/ui-layout.md` → "Mobile / narrow
  layout". **Still not verified on a real iPhone** (no Mac) — checked via CDP device metrics only. `-webkit-app-region:
  drag` stays in the CSS (Electron-only, a harmless no-op in a WebView).
- **This machine's `NODE_ENV` is set to `production` globally.** That makes `npm install` silently
  skip all `devDependencies` — which is where `electron`, `electron-builder`, AND all three
  `@capacitor/*` packages live. A plain `npm install` here will silently strip them back out of
  `node_modules` (it happened once already, mid-port). Always use
  `npm install --include=dev <pkg>` on this machine, or fix `NODE_ENV` at the shell-profile level.
- App icon/splash screen are still Capacitor's generic defaults (`ios/App/App/Assets.xcassets`) —
  cosmetic, low priority until there's a build to actually look at.
- Storage is `localStorage`-backed for now (simplest, zero extra native deps, works in any
  browser for quick testing too). `@capacitor/preferences` is a drop-in upgrade later if wanted —
  only `platform-storage.js`'s internals change, not any call site.
