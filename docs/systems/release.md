# Release Pipeline — Reference
_Covers: scripts/release.js · scripts/release-android.js · codemagic.yaml · package.json (dist/release scripts) · Updated: 2026-09-29_

## What this is

One command — `npm run release` — that builds the game for every platform and publishes a new version.
Everything that can be built on this Windows box is built here; only the iOS compile is delegated (to
Codemagic's free macOS runners), because an `.ipa` cannot be produced without macOS.

`npm run release` **never commits or pushes your code.**

## Steps

| # | Step | Where | Publishes to | Needs |
|---|------|-------|--------------|-------|
| 1 | `npm test` + `npm run checks` | local | — | — |
| 2 | Windows portable build + zip | local | GitHub Release asset | — |
| 3 | Android `.aab` (delegates to `scripts/release-android.js`) | local | Google Play **internal** track | `PLAY_SERVICE_ACCOUNT_JSON` |
| 4 | `cap:sync` for iOS | local | — | — |
| 4b | iOS `.ipa` via the `ios-workflow` | **Codemagic (free macOS M2)** | **TestFlight** | `CODEMAGIC_API_TOKEN` + `CODEMAGIC_APP_ID` |
| 5 | `git`-less GitHub Release `v<version>` + Windows zip | local → GitHub API | GitHub Releases | `GITHUB_TOKEN` |

A step whose credential is missing prints a labeled `SKIPPED` and the pipeline continues — a local build
always succeeds on a machine that isn't set up for a store yet. The **preflight** block at the top lists
which steps will actually publish *before* any of the slow work starts.

### Flags

| Flag | Effect |
|---|---|
| `--only=win,android` | Run just those steps (valid: `checks,win,android,ios,github`) |
| `--skip-checks` | Skip step 1 |
| `--version=0.2.0` | Release a version other than `package.json`'s — used for the tag, Android `versionName` and iOS `MARKETING_VERSION` |
| `--notes="…"` | GitHub Release body (default `Release v<version>`) |

Partial runs that skip the pipeline entirely: `npm run dist` (Windows only), `npm run release:android`
(Android only, same script as step 3), `npm run cap:sync` (iOS web bundle only).

## Versioning

`package.json` → `version` is the single source of truth. Bump it, commit, then `npm run release`.
Override for a one-off with `--version=`, which propagates to all three targets so they can't disagree:

- **GitHub** — tag `v<version>`.
- **Android** — `versionName` from the version, `versionCode` auto-incremented (Play rejects a reused one).
- **iOS** — `codemagic.yaml` stamps `MARKETING_VERSION` (= version) and `CURRENT_PROJECT_VERSION`
  (= a UTC timestamp, which TestFlight requires to never go backwards and which doesn't depend on git history).

## Bundle ID — `com.cultivator.idle`

One string for both stores, already wired in `capacitor.config.json`, `package.json` (`build.appId`),
`android/app/build.gradle` (`namespace` + `applicationId`) and `codemagic.yaml`. **Both stores lock it
permanently at the first publish** — don't change it. In the Apple Developer portal, create an App ID
under Identifiers with this exact string, then the App Store Connect record with the same Bundle ID.

## Credentials

Only a human can create these; after that the pipeline runs unattended.

| Variable | What it is |
|---|---|
| `GITHUB_TOKEN` | Classic PAT with the `repo` scope (or fine-grained with **Contents: read & write**). Create at GitHub → Settings → Developer settings → Personal access tokens. |
| `PLAY_SERVICE_ACCOUNT_JSON` | Path to a Play Console service-account key JSON with **"Release to testing tracks"**. |
| `CODEMAGIC_API_TOKEN` / `CODEMAGIC_APP_ID` | From Codemagic → Team settings → Integrations → Codemagic API, and the app's ID in its Codemagic URL. |
| `GITHUB_REPO` / `RELEASE_TARGET` | Optional overrides; the repo is auto-detected from `origin`, the release target defaults to `origin/main`. |

Set them for the current PowerShell session and ship — one copy-pasteable line:

```powershell
$env:GITHUB_TOKEN="ghp_REPLACE"; $env:PLAY_SERVICE_ACCOUNT_JSON="$PWD\google-play-service-account.json"; $env:CODEMAGIC_API_TOKEN="REPLACE"; $env:CODEMAGIC_APP_ID="REPLACE"; npm run release
```

Use `setx NAME "value"` instead of `$env:NAME` to persist across sessions (it only affects **new** shells).

For the Codemagic side one-time setup (account, App Store Connect integration, TestFlight record), see the
header comment in `codemagic.yaml` — it's the checklist.

## Gotchas

- **A running `Cultivator Idle.exe` locks `dist/`** and the Windows build fails. Closing the window only
  hides the app to the tray, so quit it from the tray. The preflight warns when it sees one running.
- **The GitHub Release is tagged at `origin/main`, never at local HEAD** — a tag has to point at a commit
  the remote already has. Because of that a dirty tree is allowed (it's normal here, several agents share
  this working copy), but the preflight says so, and the artifact then doesn't correspond to any commit.
  Commit + push first when that matters.
- **Re-running with a version already released fails on purpose.** Delete the GitHub Release or pass a new
  `--version=`; silently re-tagging a published version is worse.
- **iOS version stamping runs *after* `cap sync ios`** in `codemagic.yaml`, in case the sync rewrites
  `project.pbxproj`. Don't move that step above the sync.
- `dist/` is build output and gitignored, so release zips never get committed.
