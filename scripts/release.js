#!/usr/bin/env node
// npm run release — the one command an agent (or you) runs to ship a change:
//
//   1. npm test           — syntax-checks every first-party .js file
//   2. npm run dist        — builds the Windows portable build (proves the PC build still works)
//   3. npm run cap:sync    — rebuilds www/ and syncs it into ios/ (proves the iOS web bundle still
//                            assembles cleanly — this box can't compile the actual .ipa, no Xcode)
//   4. git commit + push   — only if something changed and steps 1-3 all passed
//   5. Trigger the iOS CI build on Codemagic (TestFlight) — ONLY if CODEMAGIC_API_TOKEN and
//      CODEMAGIC_APP_ID are set in the environment. Until the Apple Developer account is approved
//      and Codemagic is wired up, this step is a clearly-labeled no-op — everything else in this
//      script still runs and still ships the PC build + pushes the code.
//
// Any step failing stops the script before anything is committed/pushed/triggered. See
// docs/systems/ios-port.md for what CODEMAGIC_API_TOKEN / CODEMAGIC_APP_ID are and how to get them.

const { execSync } = require('child_process')
const https = require('https')
const path = require('path')

const root = path.join(__dirname, '..')
const run = (cmd) => {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function step(name, fn) {
  console.log(`\n━━━ ${name} ━━━`)
  try {
    fn()
  } catch (err) {
    console.error(`\n✗ FAILED: ${name}`)
    process.exit(1)
  }
}

step('1/5 — Syntax check (npm test)', () => run('npm test'))
step('2/5 — Windows build (npm run dist)', () => run('npm run dist'))
step('3/5 — iOS web bundle sync (npm run cap:sync)', () => run('npm run cap:sync'))

let pushed = false
step('4/5 — Commit + push', () => {
  const status = execSync('git status --porcelain', { cwd: root }).toString().trim()
  if (!status) {
    console.log('Nothing to commit — working tree clean.')
    return
  }
  const msg = process.env.RELEASE_MESSAGE || `Release ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  run('git add -A')
  run(`git commit -m ${JSON.stringify(msg)}`)
  try {
    run('git push')
    pushed = true
  } catch {
    console.warn(
      '\n⚠ Commit succeeded locally but `git push` failed (no network from this shell?). ' +
      'Push manually, or re-run this from a shell with network access (or ask the agent to ' +
      'push via the GitKraken tools instead).'
    )
  }
})

step('5/5 — Trigger iOS CI build (Codemagic → TestFlight)', () => {
  const token = process.env.CODEMAGIC_API_TOKEN
  const appId = process.env.CODEMAGIC_APP_ID
  const workflowId = process.env.CODEMAGIC_WORKFLOW_ID || 'ios-workflow'

  if (!token || !appId) {
    console.log(
      'CODEMAGIC_API_TOKEN / CODEMAGIC_APP_ID not set — skipping. This is expected until the ' +
      'Apple Developer account is approved and Codemagic is connected. See docs/systems/ios-port.md.'
    )
    return
  }
  if (!pushed) {
    console.log('Nothing new was pushed — skipping CI trigger (nothing for it to build).')
    return
  }

  const body = JSON.stringify({ appId, workflowId, branch: 'main' })
  const req = https.request(
    {
      hostname: 'api.codemagic.io',
      path: '/builds',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token,
        'Content-Length': Buffer.byteLength(body),
      },
    },
    (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✓ Codemagic build triggered (status ${res.statusCode}).`)
          console.log(data)
        } else {
          console.error(`✗ Codemagic build trigger failed (status ${res.statusCode}): ${data}`)
          process.exitCode = 1
        }
      })
    }
  )
  req.on('error', (err) => {
    console.error(`✗ Codemagic build trigger failed: ${err.message}`)
    process.exitCode = 1
  })
  req.write(body)
  req.end()
})

console.log('\n✓ Release pipeline complete.')
