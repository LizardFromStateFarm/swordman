# iOS Port — Reference
_Covers: capacitor.config.json · scripts/build-ios-web.js · scripts/release.js · scripts/check-syntax.js · codemagic.yaml · renderer/engine/platform-storage.js · ios/ · Updated: 2026-09-25_

## What this is

Adds a second native shell (Capacitor, targeting iOS) around the *same* `renderer/` + `assets/`
game code that Electron already uses. Electron/PC is completely untouched — this is additive only.
See the chat conversation this was set up in for the full reasoning (why Capacitor, why full-screen
instead of the desktop overlay, why TestFlight over sideloading via Google Drive, why porting the
plumbing now instead of after the game is "done").

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

## The release pipeline (`npm run release` / `scripts/release.js`)

One command, meant to be what an agent runs instead of manually chaining build steps:

1. `npm test` (`scripts/check-syntax.js`) — `node --check`s every first-party `.js` file. There's
   no unit-test framework in this project; this is the "does everything parse" gate.
2. `npm run dist` — Windows portable build. Proves the PC build isn't broken.
3. `npm run cap:sync` — rebuilds `www/` and syncs it into `ios/`. Proves the iOS web bundle still
   assembles cleanly. (Can't compile the actual `.ipa` here — no Xcode/macOS on this box.)
4. If (and only if) 1-3 all passed and something actually changed: `git add -A`, commit, `git push`.
   If the push fails (e.g. run from a sandbox with no network), the script says so clearly and
   leaves the commit local rather than failing silently.
5. If a new commit was actually pushed: trigger the iOS CI build on Codemagic via its REST API —
   **only if `CODEMAGIC_API_TOKEN` and `CODEMAGIC_APP_ID` are set in the environment.** Until then
   this step is a clearly-labeled no-op; everything else in the pipeline still runs.

Run it with `npm run release`. Override the commit message with `RELEASE_MESSAGE="..." npm run release`.

## CI / TestFlight (`codemagic.yaml`) — template, not active yet

`codemagic.yaml` defines an `ios-workflow` that builds `ios/` on a macOS runner and publishes
straight to TestFlight. It has **no automatic triggers on purpose** (no `triggering:` section) —
it only starts via the Codemagic API call `scripts/release.js` makes, so CI minutes aren't spent on
every push, only ones that passed the local Windows build + syntax check.

**Still needed before this does anything** (blocked on the Apple Developer account, currently
pending approval):
1. Apple Developer Program enrollment to finish processing.
2. In App Store Connect: register the app under bundle ID `com.cultivator.idle`, create a
   TestFlight record, and create an API key (Users and Access → Keys) with the "App Manager" role.
3. A Codemagic account (free tier is enough) with this GitHub repo connected.
4. In Codemagic → Team settings → Integrations → App Store Connect: add an integration named
   `cultivator_idle_asc` using that API key (or edit the name in `codemagic.yaml` to match
   whatever you name it).
5. A Codemagic API token (Team settings → Integrations → Codemagic API) and this app's Codemagic
   App ID (visible in the app's Codemagic URL once the repo is added). Set these as environment
   variables wherever `npm run release` runs: `CODEMAGIC_API_TOKEN`, `CODEMAGIC_APP_ID`.

Once those five things exist, `npm run release` starts actually shipping iOS builds to your phone
via TestFlight with no further code changes — the script and the workflow are already wired to
each other, just waiting on credentials/accounts that only a human can create.

## Gotchas / Not Done Yet

- **UI is not responsive.** `renderer/styles.css` hard-codes `width: 300px` (sized for the desktop
  overlay window) and uses `-webkit-app-region: drag` (Electron-only, harmless no-op elsewhere).
  On an iPhone screen this currently renders as a small fixed-size box, not full-screen. Needs a
  real responsive/mobile-layout pass — deliberately deferred, not part of this plumbing work. This
  is the single biggest remaining chunk of actual "port" work.
  **Partly addressed by Phase 6E (2026-09-26):** `#app` now fills the viewport (100vw × 100vh) and the shim's
  `getLayout()` answers `desktop`, whose CSS drops to one column under 600px wide. Not yet checked on a real
  phone (no Mac); overlays and tab contents are still tuned for ~300px.
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
