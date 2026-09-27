#!/usr/bin/env node
// npm run release:android — build the Android App Bundle and push it to Google Play.
//
//   1. npm test                     — syntax-checks every first-party .js file
//   2. build:web + cap sync android — rebuilds www/ and copies it into the native project
//   3. gradle bundleRelease         — signed .aab (skipped with a clear message when no Android SDK
//                                     is present on this machine, e.g. no ANDROID_HOME/local.properties)
//   4. Upload to Play               — ONLY if PLAY_SERVICE_ACCOUNT_JSON is set; otherwise a labeled
//                                     no-op (same pattern as scripts/release.js's Codemagic step)
//
// Unlike scripts/release.js, this does NOT commit/push or trigger CI — it only produces and (optionally)
// uploads the bundle, so it is safe to run alongside other work in the tree.
//
// See docs/systems/android-port.md for the one-time Play Console + service-account setup, and the env
// vars (PLAY_SERVICE_ACCOUNT_JSON, PLAY_PACKAGE, PLAY_TRACK, PLAY_RELEASE_STATUS, PLAY_VERSION_CODE).
//
// Zero extra dependencies: auth is a hand-signed JWT (crypto) exchanged for an access token, and the
// Play Developer API (androidpublisher v3) is called over plain https — the same style as release.js.

const { execSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const https = require('https')
const path = require('path')

const root = path.join(__dirname, '..')
const androidDir = path.join(root, 'android')
const AAB = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
const GRADLE_FILE = path.join(androidDir, 'app', 'build.gradle')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

// Best-effort local toolchain discovery (Windows dev boxes): point Gradle at the Android SDK and a JDK
// when the environment doesn't already. An explicit ANDROID_HOME / JAVA_HOME always wins.
function detectAndroidEnv() {
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
    const sdk = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
      process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk'),
      'C:\\Android\\Sdk',
    ]
      .filter(Boolean)
      .find((p) => fs.existsSync(p))
    if (sdk) {
      process.env.ANDROID_HOME = sdk
      process.env.ANDROID_SDK_ROOT = sdk
      console.log(`Detected Android SDK: ${sdk}`)
    }
  }
  if (!process.env.JAVA_HOME) {
    // Gradle 8.x supports up to Java 24; Android Studio's bundled JBR can be newer (e.g. Java 25),
    // which fails with "Unsupported class file major version". Prefer an installed JDK in [17, 24].
    const jdk = findCompatibleJdk()
    if (jdk) {
      process.env.JAVA_HOME = jdk.dir
      console.log(`Detected JDK ${jdk.major}: ${jdk.dir}`)
    } else {
      console.log('No compatible JDK (Java 17–24) found — Gradle will use whatever `java` is on PATH.')
    }
  }
}

function findCompatibleJdk() {
  const parents = [
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Amazon Corretto',
  ]
  const found = []
  for (const parent of parents) {
    if (!fs.existsSync(parent)) continue
    for (const name of fs.readdirSync(parent)) {
      const m = name.match(/(\d+)/)
      if (!m) continue
      const dir = path.join(parent, name)
      if (fs.existsSync(path.join(dir, 'bin', 'javac.exe'))) found.push({ dir, major: Number(m[1]) })
    }
  }
  return found.filter((c) => c.major >= 17 && c.major <= 24).sort((a, b) => b.major - a.major)[0]
}

detectAndroidEnv()

const run = (cmd, opts = {}) => {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts })
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

// ── 1. Syntax gate ────────────────────────────────────────────────────────────
step('1/4 — Syntax check (npm test)', () => run('npm test'))

// ── 2. Web bundle + native sync ───────────────────────────────────────────────
step('2/4 — Web bundle + Android sync (build:web + cap sync android)', () => {
  run('npm run build:web')
  run('npx cap sync android')
})

// ── 3. Gradle release bundle ──────────────────────────────────────────────────
// Bump versionCode (monotonic — Play rejects a repeat) and versionName from package.json.
function bumpVersion() {
  let gradle = fs.readFileSync(GRADLE_FILE, 'utf8')
  const versionName = process.env.PLAY_VERSION_NAME || pkg.version
  const current = gradle.match(/versionCode\s+(\d+)/)
  const versionCode = process.env.PLAY_VERSION_CODE || (current ? Number(current[1]) + 1 : 1)
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`)
  fs.writeFileSync(GRADLE_FILE, gradle, 'utf8')
  console.log(`versionCode ${versionCode} · versionName ${versionName}`)
  return versionCode
}

function hasAndroidSdk() {
  return Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || fs.existsSync(path.join(androidDir, 'local.properties')))
}

step('3/4 — Gradle release bundle', () => {
  if (!hasAndroidSdk()) {
    console.log(
      'No Android SDK found (ANDROID_HOME / ANDROID_SDK_ROOT unset and android/local.properties absent).\n' +
        'Skipping the .aab build — install Android Studio (or set ANDROID_HOME) to build locally, or build on CI.\n' +
        'Everything up to here (web bundle + cap sync) still ran and passed.'
    )
    return
  }
  bumpVersion()
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
  run(`${gradlew} bundleRelease`, { cwd: androidDir })
  if (!fs.existsSync(AAB)) throw new Error(`Gradle finished but ${AAB} is missing`)
  console.log(`✓ Built ${path.relative(root, AAB)}`)
})

// ── 4. Upload to Google Play ──────────────────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString('base64url')

function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000)
  const signingInput =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(
      JSON.stringify({
        iss: key.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(key.private_key)
  const assertion = `${signingInput}.${b64url(signature)}`
  const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`
  return request('oauth2.googleapis.com', '/token', 'POST', null, body, 'application/x-www-form-urlencoded').then(
    (res) => {
      const json = parse(res)
      if (!json.access_token) throw new Error(`Token exchange failed (${res.status}): ${res.body.slice(0, 300)}`)
      return json.access_token
    }
  )
}

function request(host, urlPath, method, token, body, contentType) {
  return new Promise((resolve, reject) => {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (contentType) headers['Content-Type'] = contentType
    if (body != null) headers['Content-Length'] = Buffer.byteLength(body)
    const req = https.request({ hostname: host, path: urlPath, method, headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body != null) req.write(body)
    req.end()
  })
}

function parse(res) {
  try {
    return JSON.parse(res.body)
  } catch {
    return {}
  }
}

async function uploadToPlay() {
  const keyPath = process.env.PLAY_SERVICE_ACCOUNT_JSON
  const packageName = process.env.PLAY_PACKAGE || 'com.cultivator.idle'
  const track = process.env.PLAY_TRACK || 'internal'
  const status = process.env.PLAY_RELEASE_STATUS || 'completed'

  if (!keyPath) {
    console.log(
      'PLAY_SERVICE_ACCOUNT_JSON not set — skipping the Play upload. This is expected until the service\n' +
        'account key exists (Play Console → API access) and its path is exported. See docs/systems/android-port.md.'
    )
    return
  }
  if (!fs.existsSync(AAB)) {
    console.log('No .aab to upload (the Gradle step was skipped or failed) — skipping the Play upload.')
    return
  }

  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  const token = await getAccessToken(key)
  const base = `/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`

  const editRes = await request('androidpublisher.googleapis.com', `${base}/edits`, 'POST', token, '{}', 'application/json')
  const edit = parse(editRes)
  if (!edit.id) throw new Error(`Could not open a Play edit (${editRes.status}): ${editRes.body.slice(0, 300)}`)
  const editPath = `${base}/edits/${edit.id}`
  console.log(`Opened Play edit ${edit.id} for ${packageName}`)

  const aab = fs.readFileSync(AAB)
  const uploadRes = await request(
    'androidpublisher.googleapis.com',
    `${editPath}/bundles?uploadType=media`,
    'POST',
    token,
    aab,
    'application/octet-stream'
  )
  const uploaded = parse(uploadRes)
  if (!uploaded.versionCode) throw new Error(`Bundle upload failed (${uploadRes.status}): ${uploadRes.body.slice(0, 300)}`)
  console.log(`Uploaded bundle, versionCode ${uploaded.versionCode}`)

  const trackBody = JSON.stringify({ track, releases: [{ status, versionCodes: [String(uploaded.versionCode)] }] })
  const trackRes = await request(
    'androidpublisher.googleapis.com',
    `${editPath}/tracks/${encodeURIComponent(track)}`,
    'PUT',
    token,
    trackBody,
    'application/json'
  )
  if (trackRes.status < 200 || trackRes.status >= 300) {
    throw new Error(`Track update failed (${trackRes.status}): ${trackRes.body.slice(0, 300)}`)
  }
  console.log(`Assigned versionCode ${uploaded.versionCode} to the "${track}" track (status: ${status})`)

  const commitRes = await request('androidpublisher.googleapis.com', `${editPath}:commit`, 'POST', token, null, null)
  if (commitRes.status < 200 || commitRes.status >= 300) {
    throw new Error(`Edit commit failed (${commitRes.status}): ${commitRes.body.slice(0, 300)}`)
  }
  console.log(`✓ Committed. Testers on the "${track}" track get the opt-in link from Play Console → Testing.`)
}

console.log('\n━━━ 4/4 — Upload to Google Play ━━━')
uploadToPlay()
  .then(() => console.log('\n✓ Android release pipeline complete.'))
  .catch((err) => {
    console.error('\n✗ FAILED: 4/4 — Upload to Google Play')
    console.error(err && err.message ? err.message : err)
    process.exit(1)
  })
