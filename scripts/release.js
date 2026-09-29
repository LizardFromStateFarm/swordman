#!/usr/bin/env node
// npm run release — build the game for every platform and publish a new version, in one command.
//
// Steps (any of them can be skipped — see FLAGS below):
//   1. checks  — `npm test` (syntax) + `npm run checks` (scenario checks). A failure stops everything.
//   2. win     — `npm run dist` → the Windows portable build, zipped as the GitHub Release asset.
//   3. android — `scripts/release-android.js`: signed .aab → the Google Play internal testing track.
//   4. ios     — `npm run cap:sync` (proves www/ + ios/ assemble locally), then triggers the Codemagic
//                `ios-workflow`, which builds on a FREE macOS M2 runner and publishes to TestFlight.
//                A Mac can't be avoided for iOS — that's what Codemagic is for. docs/systems/release.md
//   5. github  — creates GitHub Release `v<version>` and attaches the Windows zip.
//
// **This script never commits or pushes your code.** Publishing a build from a working tree that has
// uncommitted changes is allowed — that's normal here, several agents share this tree at once — but it
// says so loudly, and the GitHub Release is always tagged at `origin/main`, never at a local-only commit.
//
// Full reference, credentials and environment variables: docs/systems/release.md
//
// FLAGS
//   --only=win,android    run just these steps (valid: checks,win,android,ios,github)
//   --skip-checks         skip step 1
//   --version=0.2.0       release a version other than package.json's (used for the tag + native builds)
//   --notes="…"           GitHub Release body (default: "Release v<version>")

const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const https = require('https')
const path = require('path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

// ── Flags ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(`--${name}`)
const flagValue = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const ALL_STEPS = ['checks', 'win', 'android', 'ios', 'github']
const only = flagValue('only', null)
const steps = (only ? only.split(',').map((s) => s.trim()) : ALL_STEPS).filter(
  (s) => ALL_STEPS.includes(s) && !(s === 'checks' && hasFlag('skip-checks'))
)
const wants = (step) => steps.includes(step)

const VERSION = flagValue('version', pkg.version)
const NOTES = flagValue('notes', `Release v${VERSION}`)
const TAG = `v${VERSION}`

// Publishing is credential-gated: a missing credential is a labeled no-op, never a crash, so a local
// build still succeeds on a machine that hasn't been set up for a store yet.
const hasGitHubToken = Boolean(process.env.GITHUB_TOKEN)
const hasPlayKey = Boolean(process.env.PLAY_SERVICE_ACCOUNT_JSON)
const hasCodemagic = Boolean(process.env.CODEMAGIC_API_TOKEN && process.env.CODEMAGIC_APP_ID)

const artifacts = {}

// ── Shell helpers ─────────────────────────────────────────────────────────────
function run(cmd) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function step(name, fn) {
  console.log(`\n━━━ ${name} ━━━`)
  try {
    fn()
  } catch (err) {
    console.error(`\n✗ FAILED: ${name}`)
    console.error(err && err.message ? err.message : err)
    process.exit(1)
  }
}

async function astep(name, fn) {
  console.log(`\n━━━ ${name} ━━━`)
  try {
    await fn()
  } catch (err) {
    console.error(`\n✗ FAILED: ${name}`)
    console.error(err && err.message ? err.message : err)
    process.exit(1)
  }
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: root }).toString().trim()
  } catch {
    return ''
  }
}

function runningCultivatorProcesses() {
  if (process.platform !== 'win32') return []
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Cultivator Idle.exe" /NH', { cwd: root }).toString()
    return out.split('\n').filter((line) => line.includes('Cultivator Idle.exe'))
  } catch {
    return []
  }
}

// ── Preflight ─────────────────────────────────────────────────────────────────
// Say up front exactly what will and won't happen, so a missing credential or a dirty tree is visible
// before a ten-minute build rather than after it.
function preflight() {
  console.log(`\n━━━ Preflight ━━━`)
  console.log(`  version         ${VERSION}${VERSION === pkg.version ? '' : ` (package.json says ${pkg.version})`}`)
  console.log(`  steps           ${steps.join(' → ') || '(none)'}`)

  const head = git('rev-parse --short HEAD')
  const branch = git('rev-parse --abbrev-ref HEAD')
  const originMain = git('rev-parse --short origin/main')
  console.log(`  commit          ${branch} @ ${head} · origin/main @ ${originMain || '(unknown)'}`)

  const dirty = git('status --porcelain')
  const dirtyFiles = dirty ? dirty.split('\n').filter(Boolean) : []
  if (dirtyFiles.length) {
    console.log(`  working tree    DIRTY — ${dirtyFiles.length} file(s) not committed`)
    console.log(`                  the build is made from your working tree, but the GitHub Release is`)
    console.log(`                  tagged at origin/main (${originMain || '?'}); commit + push first if that matters.`)
  } else {
    console.log(`  working tree    clean`)
  }

  if (wants('win') && process.platform !== 'win32') {
    console.log(`  ⚠ the Windows build is a win32-only step and this is ${process.platform}.`)
  }
  if (wants('win') && process.platform === 'win32') {
    const running = runningCultivatorProcesses()
    if (running.length) {
      console.log(`  ⚠ ${running.length} "Cultivator Idle.exe" process(es) are running — they lock dist/ and will`)
      console.log(`    make the Windows build fail. Quit them from the tray first (this is the known gotcha).`)
    }
  }

  console.log(`  publishing`)
  console.log(`    Play (internal)      ${hasPlayKey ? 'enabled' : 'SKIPPED — set PLAY_SERVICE_ACCOUNT_JSON'}`)
  console.log(`    Codemagic→TestFlight ${hasCodemagic ? 'enabled' : 'SKIPPED — set CODEMAGIC_API_TOKEN + CODEMAGIC_APP_ID'}`)
  console.log(
    `    GitHub Release ${TAG}  ${
      hasGitHubToken ? `enabled — tagged at origin/main (${originMain || '?'})` : 'SKIPPED — set GITHUB_TOKEN'
    }`
  )
  console.log('')
}

// ── The pipeline ──────────────────────────────────────────────────────────────
async function main() {
  preflight()

  // 1. Checks ------------------------------------------------------------------
  if (wants('checks')) {
    step('1 — Checks (npm test + npm run checks)', () => {
      run('npm test')
      run('npm run checks')
    })
  }

  // 2. Windows build -----------------------------------------------------------
  if (wants('win')) {
    const WIN_DIR = path.join(root, 'dist', 'Cultivator Idle-win32-x64')

    step('2 — Windows build (npm run dist)', () => {
      run('npm run dist')
      if (!fs.existsSync(WIN_DIR)) throw new Error(`npm run dist finished but ${WIN_DIR} is missing`)
      console.log(`✓ Built ${path.relative(root, WIN_DIR)}`)
    })

    // GitHub Releases hosts files, not folders — package the portable build as one zip.
    step('2b — Zip the Windows build', () => {
      const zipPath = path.join(root, 'dist', `Cultivator-Idle-${VERSION}-win-x64.zip`)
      fs.rmSync(zipPath, { force: true })
      if (process.platform === 'win32') {
        execFileSync(
          'powershell',
          ['-NoProfile', '-Command', `Compress-Archive -Path '${WIN_DIR}\\*' -DestinationPath '${zipPath}' -Force`],
          { stdio: 'inherit' }
        )
      } else {
        execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: WIN_DIR, stdio: 'inherit' })
      }
      if (!fs.existsSync(zipPath)) throw new Error(`Zipping finished but ${zipPath} is missing`)
      artifacts.winZip = zipPath
      console.log(`✓ ${path.relative(root, zipPath)} (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`)
    })
  }

  // 3. Android -----------------------------------------------------------------
  // Delegated rather than duplicated: release-android.js already owns the Gradle/JDK/SDK detection, the
  // monotonic versionCode bump and the dependency-free Play upload. See docs/systems/android-port.md.
  if (wants('android')) {
    step('3 — Android .aab + Google Play (scripts/release-android.js)', () => {
      // PLAY_VERSION_NAME keeps Android's versionName on the same version as the iOS build and the
      // release tag when --version= overrides the (possibly not-yet-committed) package.json value.
      console.log(`\n$ node scripts/release-android.js  (PLAY_VERSION_NAME=${VERSION})`)
      execSync('node scripts/release-android.js', {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, PLAY_VERSION_NAME: VERSION },
      })
    })
  }

  // 4. iOS — local web bundle, then free macOS CI -------------------------------
  if (wants('ios')) {
    step('4 — iOS web bundle (npm run cap:sync)', () => {
      run('npm run cap:sync')
    })

    await astep('4b — iOS build on Codemagic → TestFlight', async () => {
      if (!hasCodemagic) {
        console.log(
          'CODEMAGIC_API_TOKEN / CODEMAGIC_APP_ID not set — skipping the iOS build.\n' +
            'iOS cannot be built on Windows; Codemagic builds it on a free macOS M2 runner (500 min/month).\n' +
            'See docs/systems/release.md → "Credentials".'
        )
        return
      }
      const res = await codemagicRequest()
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Codemagic build trigger failed (${res.status}): ${res.body.slice(0, 300)}`)
      }
      console.log(`✓ Codemagic build started (${res.status}) — it emails you when the TestFlight build lands.`)
      console.log(res.body.slice(0, 400))
    })
  }

  // 5. GitHub Release ----------------------------------------------------------
  if (wants('github')) {
    await astep(`5 — GitHub Release ${TAG}`, async () => {
      if (!hasGitHubToken) {
        console.log('GITHUB_TOKEN not set — skipping the GitHub Release. See docs/systems/release.md → "Credentials".')
        return
      }
      await publishGitHubRelease()
    })
  }

  // Summary --------------------------------------------------------------------
  console.log('\n━━━ Summary ━━━')
  console.log(`  version   ${VERSION}`)
  if (artifacts.winZip) console.log(`  windows   ${path.relative(root, artifacts.winZip)}`)
  if (wants('android')) console.log(`  android   android/app/build/outputs/bundle/release/app-release.aab`)
  if (wants('ios') && !hasCodemagic) console.log(`  ios       not triggered (no Codemagic credentials)`)
  if (wants('github') && !hasGitHubToken) console.log(`  github    not published (no GITHUB_TOKEN)`)
  console.log(`\n✓ Release pipeline complete.`)
}

// ══ Codemagic ════════════════════════════════════════════════════════════════
// Codemagic's REST API takes the same x-auth-token header the previous version of this script used.
// RELEASE_VERSION is passed so the macOS runner stamps the iOS build with the version being released
// even when package.json's bump is still uncommitted here.
function codemagicRequest() {
  const body = JSON.stringify({
    appId: process.env.CODEMAGIC_APP_ID,
    workflowId: process.env.CODEMAGIC_WORKFLOW_ID || 'ios-workflow',
    branch: process.env.CODEMAGIC_BRANCH || 'main',
    environment: { variables: { RELEASE_VERSION: { value: VERSION } } },
  })
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.codemagic.io',
        path: '/builds',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': process.env.CODEMAGIC_API_TOKEN,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ══ GitHub ═══════════════════════════════════════════════════════════════════
// Dependency-free (same style as release-android.js's Play upload): plain https calls, no @octokit.
// Create a classic PAT with the "repo" scope, or a fine-grained token with Contents: read & write.
async function publishGitHubRelease() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO || parseGitHubRepo(git('remote get-url origin'))
  if (!repo) throw new Error('Could not work out the GitHub repo — set GITHUB_REPO=owner/name')
  const target = process.env.RELEASE_TARGET || git('rev-parse origin/main')
  if (!target) throw new Error('Could not resolve origin/main — `git fetch` first, then re-run.')

  // A tag can only be created at a commit the remote already has, which is why the release is always
  // tagged at origin/main and never at local HEAD.
  const existing = await gh('GET', `/repos/${repo}/releases/tags/${TAG}`, token)
  if (existing.status === 200) {
    throw new Error(
      `GitHub Release ${TAG} already exists in ${repo}. Delete it (or use --version=…) and re-run — ` +
        `re-tagging a published version is worse than picking a new number.`
    )
  }

  const created = await gh('POST', `/repos/${repo}/releases`, token, {
    tag_name: TAG,
    target_commitish: target,
    name: `Cultivator Idle ${TAG}`,
    body: NOTES,
    draft: false,
    prerelease: false,
  })
  const release = JSON.parse(created.body || '{}')
  if (!release.id) throw new Error(`Could not create the release (${created.status}): ${created.body.slice(0, 300)}`)
  console.log(`✓ Created release ${TAG} at ${target.slice(0, 7)} — ${release.html_url}`)

  if (artifacts.winZip && fs.existsSync(artifacts.winZip)) {
    const name = path.basename(artifacts.winZip)
    const uploaded = await gh(
      'POST',
      `/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
      token,
      fs.readFileSync(artifacts.winZip),
      'application/zip',
      'uploads.github.com'
    )
    if (uploaded.status < 200 || uploaded.status >= 300) {
      throw new Error(`Attaching ${name} failed (${uploaded.status}): ${uploaded.body.slice(0, 300)}`)
    }
    console.log(`✓ Attached ${name}`)
  } else {
    console.log('No Windows zip to attach (the win step did not run) — release created with no assets.')
  }
}

function parseGitHubRepo(url) {
  const m = (url || '').match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

function gh(method, urlPath, token, body, contentType, host = 'api.github.com') {
  const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8')
  return new Promise((resolve, reject) => {
    const headers = {
      // GitHub rejects API requests with no User-Agent.
      'User-Agent': 'cultivator-idle-release',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    }
    if (contentType) headers['Content-Type'] = contentType
    if (payload) headers['Content-Length'] = payload.length
    const req = https.request({ hostname: host, path: urlPath, method, headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

main().catch((err) => {
  console.error(`\n✗ FAILED`)
  console.error(err && err.message ? err.message : err)
  process.exit(1)
})
