// Scenario checks runner (`npm run checks`, or `npm run checks -- tournament` to run files whose name matches).
// Each file in this folder drives the real game logic through scripts/sim/loader.js, forces a specific situation
// (a crisis, a duel, a migration, a tournament bracket…) and prints `ok   …` / `FAIL …` lines. The sim (`npm run sim`)
// only sees what the bot happens to do; these pin down exact rules. See docs/systems/qa-sim.md → "Scenario checks".
// Files run in parallel (a pool of CPU cores − 1, max 12; CHECKS_JOBS=n to override, CHECKS_JOBS=1 = serial), the
// known-slow ones first; results print in file order once all are done (2026-10-05: ~40 s serial → ~10 s).
const { execFile } = require('child_process')
const fs = require('fs'), path = require('path'), os = require('os')

const filter = process.argv[2] || ''
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'run-all.js' && f.includes(filter)).sort()
const jobs = Math.max(1, +process.env.CHECKS_JOBS || Math.min(12, os.cpus().length - 1))
// The long poles start first so they don't finish last alone (seconds measured 2026-10-05; unknown files go after these)
const SLOW = ['succession.js', 'succession-2.js', 'combat-2.js', 'combat.js', 'living-world.js', 'heavy.js', 'rankings.js', 'encounters.js', 'body.js', 'bosses.js', 'npc-sects.js']
const order = [...files].sort((a, b) => (SLOW.indexOf(a) + 1 || 99) - (SLOW.indexOf(b) + 1 || 99))

const run = f => new Promise(res => {
  const t0 = Date.now()
  execFile(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
    const out = String(stdout || ''), crash = err ? String(stderr || err.message).split('\n').slice(0, 4).join('\n') : null
    res({ f, out, crash, secs: (Date.now() - t0) / 1000 })
  })
})

;(async () => {
  const t0 = Date.now(), results = {}, queue = [...order]
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) { const f = queue.shift(); results[f] = await run(f) }
  }))
  let ok = 0, failed = 0, crashed = 0
  for (const f of files) {
    const { out, crash, secs } = results[f]
    const lines = out.split('\n')
    const nOk = lines.filter(l => l.startsWith('ok')).length, fails = lines.filter(l => l.startsWith('FAIL'))
    ok += nOk; failed += fails.length
    const crashedHere = crash && !fails.length
    if (crashedHere) crashed++
    console.log(`${fails.length || crashedHere ? '✗' : '✓'} ${f.padEnd(22)} ${String(nOk).padStart(3)} ok${fails.length ? `, ${fails.length} FAIL` : ''}  (${secs.toFixed(1)}s)`)
    for (const l of fails) console.log(`    ${l}`)
    if (crashedHere) console.log(`    CRASHED: ${crash}`)
  }
  console.log(`\n${ok} ok, ${failed} failed, ${crashed} crashed across ${files.length} file(s) · ${((Date.now() - t0) / 1000).toFixed(1)}s on ${jobs} jobs`)
  process.exitCode = failed || crashed ? 1 : 0
})()
