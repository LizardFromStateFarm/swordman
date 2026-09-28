#!/usr/bin/env node
// npm test — recursively `node --check`s every first-party .js file (main.js, preload.js,
// renderer/, assets/, scripts/). Skips node_modules/dist/out/www/ios/3d (vendored, generated, or the
// separate 3D project — which has its own `npm test`).
// This is intentionally lightweight — there's no unit-test framework in this project (see
// CLAUDE.md); this is the "does everything at least parse" gate that scripts/release.js and the
// "task is NOT done until" checklist both depend on.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'www', 'ios', '.git', '3d'])

function findJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findJsFiles(full, out)
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

const files = findJsFiles(root)
let failed = false

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (err) {
    failed = true
    console.error(`✗ ${path.relative(root, file)}`)
    console.error(err.stderr?.toString() || err.message)
  }
}

if (failed) {
  console.error(`\nSyntax check FAILED.`)
  process.exit(1)
} else {
  console.log(`✓ ${files.length} files pass node --check`)
}
