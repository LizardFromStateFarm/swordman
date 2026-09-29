# Android Port & Google Play Beta — Reference
_Covers: android/ · package.json (android scripts) · scripts/release-android.js · capacitor.config.json · scripts/build-ios-web.js · Updated: 2026-09-27_

## What this is

A second native shell (Capacitor, targeting Android) around the *same* `renderer/` + `assets/` game code the
Electron desktop app and the iOS shell already use. Purely additive — the desktop and iOS builds are untouched.

Goal: one local command (`npm run release:android`) that builds a signed **App Bundle (.aab)** and pushes it to a
Google Play **internal testing track**, so friends install the beta from a Play opt-in link and get auto-updates.
It mirrors `scripts/release.js` (iOS → TestFlight) rather than inventing a new pattern; see `ios-port.md`.

**Ship everything at once with `npm run release`** — it runs this same Android script as its step 3, alongside the
Windows build, the iOS TestFlight trigger and the GitHub Release. `docs/systems/release.md` is the reference.

## State

No game state changes. This is a platform/build layer only. The Android shell uses the same
`renderer/engine/platform-storage.js` fallback (localStorage) as iOS/browser, so saves work unchanged.

## API / commands

- `npm run cap:sync:android` — `build:web` (rebuilds `www/` generically) + `npx cap sync android` (copies `www/`
  into `android/app/src/main/assets/public`, regenerated each time).
- `npm run android:open` — sync + open the project in Android Studio.
- `npm run android:bundle` — `cd android && gradlew.bat bundleRelease` (Windows; use `./gradlew bundleRelease` on
  macOS/Linux). Produces `android/app/build/outputs/bundle/release/app-release.aab`.
- `npm run release:android` — `scripts/release-android.js`: `npm test` → `build:web` + `cap sync android` → Gradle
  bundle (skipped cleanly with no Android SDK) → upload to Play (skipped cleanly with no service-account key).
  **It does not commit or push** — so it's safe to run alongside other work.

### Environment variables

| Var | Default | Meaning |
|---|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | *(unset)* | Path to the Play service-account key JSON. Unset → the upload step is a labeled no-op. |
| `PLAY_PACKAGE` | `com.cultivator.idle` | Application id (must match `capacitor.config.json` / `namespace`). |
| `PLAY_TRACK` | `internal` | Play track: `internal`, `alpha` (closed), `beta` (open). |
| `PLAY_RELEASE_STATUS` | `completed` | `completed` releases at once; `draft` uploads without releasing. |
| `PLAY_VERSION_CODE` | auto (+1) | Override the monotonic versionCode bump. |

## Wiring

- `capacitor.config.json` → `webDir: "www"`, `appId: "com.cultivator.idle"` (unchanged; Android reads the same file).
- `android/` is a real Capacitor-generated Gradle project, **committed to git** (like `ios/`) minus its generated
  output. `android/.gitignore` already ignores `build/`, `.gradle/`, `local.properties`, `app/src/main/assets/public`
  and the generated `capacitor.config.json`; the root `.gitignore` adds the signing/credential files
  (`*.jks`, `*.keystore`, `google-play-service-account.json`).
- `scripts/release-android.js` sets `versionCode` (previous + 1, or `PLAY_VERSION_CODE`) and `versionName` (from
  `package.json`) in `android/app/build.gradle` before Gradle runs — Play rejects a reused versionCode.
- Play upload is **dependency-free**: a JWT is signed with `crypto` (RS256) and exchanged at
  `oauth2.googleapis.com/token`, then the `androidpublisher` v3 Edits API is called over plain `https`:
  `edits.insert` → `bundles.upload` (`uploadType=media`, raw `.aab`) → `tracks.update` → `edits.commit`. Same
  hand-rolled-https style as `release.js`'s Codemagic call, so no new npm dependency.
- Gradle detection: the bundle step runs only if `ANDROID_HOME`/`ANDROID_SDK_ROOT` is set or
  `android/local.properties` exists; otherwise it prints a clear "no Android SDK — skipping" message and continues.
- **Signing:** `android/app/build.gradle` reads `android/keystore.properties` (gitignored; copy the values from
  `android/keystore.properties.example`). Without it the release `.aab` builds **unsigned** (verified with
  `jarsigner -verify`), which Play rejects. `storeFile` is resolved relative to `android/`, so
  `../upload-keystore.jks` is the keystore in the repo root.
- **Java version matters:** Gradle 8.x runs on Java 17–24. Android Studio's bundled JBR can be newer (this machine's
  is **Java 25**, which fails with `Unsupported class file major version 69`). `scripts/release-android.js`
  auto-picks an installed JDK in [17,24] (this machine: `C:\Program Files\Java\jdk-21.0.11`) and only falls back to
  PATH if none is found — do **not** point Gradle at Android Studio's `jbr`.

## One-time human setup (Play Console — only a human can do these)

1. Create the app under package `com.cultivator.idle`; enable **Play App Signing** (Google holds the app-signing
   key; you sign uploads with your own **upload keystore**, kept out of git).
2. Complete **App content** declarations (data safety, content rating, target audience) — a track can't go live
   without them.
3. Create an **internal testing** track and add tester emails.
4. Play Console → **API access**: create/link a Google Cloud service account, grant it **"Release to testing
   tracks"**, and download its JSON key (→ `PLAY_SERVICE_ACCOUNT_JSON`).
5. Do the **first upload manually** — Play blocks API uploads for a brand-new app until a bundle exists once.
6. Configure release signing in `android/app/build.gradle` (a `signingConfigs.release` pointing at the upload
   keystore, e.g. via `android/keystore.properties`, which is gitignored).

## Gotchas / Not Done Yet

- **The UI is not responsive.** `renderer/styles.css` hard-codes a 300px width, so on a phone the beta renders as a
  small fixed box (same caveat the iOS doc calls out). A mobile-layout pass is tracked separately — worth doing
  before inviting friends to a beta.
- **`NODE_ENV=production` on the dev machine** makes `npm install` skip devDependencies (including all
  `@capacitor/*`). Install with `npm install --include=dev <pkg>`.
- **No Android SDK is confirmed on this machine** — `npm run release:android` therefore exercises everything up to
  (and including) `cap sync android` and cleanly skips Gradle + upload. Set up Android Studio or build on CI to run
  the full path.
- **Manifest/config changes** (app name, icons, splash, permissions, `Info.plist`-equivalents) go through
  `capacitor.config.json` + `npx cap sync`, or Android Studio — don't hand-patch generated Gradle files except
  `versionCode`/`versionName`/signing, which the release script owns.
- **CI (optional, not built):** Codemagic supports Android, so an `android-workflow` could mirror the iOS one
  (build the `.aab` on a runner, publish with the service-account key stored as a secret). Local was requested
  first; this is a documented follow-up.
