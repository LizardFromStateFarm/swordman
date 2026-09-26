// Scenario checks runner (`npm run checks`, or `npm run checks -- tournament` to run files whose name matches).
// Each file in this folder drives the real game logic through scripts/sim/loader.js, forces a specific situation
// (a crisis, a duel, a migration, a tournament bracket…) and prints `ok   …` / `FAIL …` lines. The sim (`npm run sim`)
// only sees what the bot happens to do; these pin down exact rules. See docs/systems/qa-sim.md → "Scenario checks".
const { execFileSync } = require('child_process')
const fs = require('fs'), path = require('path')

const filter = process.argv[2] || ''
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'run-all.js' && f.includes(filter)).sort()
let ok = 0, failed = 0, crashed = 0
for (const f of files) {
  const t0 = Date.now()
  let out = '', crash = null
  try { out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000 }) }
  catch (e) { out = String(e.stdout || ''); crash = String(e.stderr || e.message).split('\n').slice(0, 4).join('\n') }
  const lines = out.split('\n')
  const nOk = lines.filter(l => l.startsWith('ok')).length, fails = lines.filter(l => l.startsWith('FAIL'))
  ok += nOk; failed += fails.length
  const crashedHere = crash && !fails.length
  if (crashedHere) crashed++
  console.log(`${fails.length || crashedHere ? '✗' : '✓'} ${f.padEnd(22)} ${String(nOk).padStart(3)} ok${fails.length ? `, ${fails.length} FAIL` : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  for (const l of fails) console.log(`    ${l}`)
  if (crashedHere) console.log(`    CRASHED: ${crash}`)
}
console.log(`\n${ok} ok, ${failed} failed, ${crashed} crashed across ${files.length} file(s)`)
process.exitCode = failed || crashed ? 1 : 0
