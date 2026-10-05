// Runs every real-app smoke scenario (scripts/smoke/scenarios/*.js) one after another through cdp.js and prints a
// pass/fail table (+ writes scripts/smoke/out/run-all.txt). A scenario fails on a non-zero exit (a console error, an
// uncaught exception or a failed assert — see docs/systems/qa-sim.md → "Real-app smoke"). Used by the QA & Balance pass.
// Run: node scripts/smoke/run-all.js [name …]   (no names = all; skips the non-gate tools listed in SKIP)
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, 'scenarios')
const SKIP = new Set(['art-bakeoff', 'perf-yearturn', 'visual-baseline'])   // a prototype page, a timing probe, a baseline shooter
const want = process.argv.slice(2)
const names = fs.readdirSync(DIR).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))
  .filter(n => want.length ? want.includes(n) : !SKIP.has(n))

const rows = []
for (const n of names) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [path.join(__dirname, 'cdp.js'), path.join(DIR, n + '.js')], { encoding: 'utf8', timeout: 15 * 60 * 1000 })
  const out = (r.stdout || '') + (r.stderr || '')
  const fails = out.split('\n').filter(l => /FAIL|console error|Uncaught|Error:/i.test(l)).slice(0, 4)
  const ok = r.status === 0
  rows.push({ n, ok, secs: Math.round((Date.now() - t0) / 1000), fails })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(22)} ${String(rows.at(-1).secs).padStart(4)}s${ok ? '' : '  ' + (fails.join(' | ') || `exit ${r.status}${r.error ? ' ' + r.error.message : ''}`)}`)
}
const bad = rows.filter(r => !r.ok)
const summary = `${rows.length - bad.length}/${rows.length} smoke scenarios pass${bad.length ? ` · failing: ${bad.map(r => r.n).join(', ')}` : ''}`
console.log(summary)
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true })
fs.writeFileSync(path.join(__dirname, 'out', 'run-all.txt'), rows.map(r => `${r.ok ? 'ok  ' : 'FAIL'} ${r.n} ${r.secs}s ${r.fails.join(' | ')}`).join('\n') + '\n' + summary + '\n')
process.exitCode = bad.length ? 1 : 0
