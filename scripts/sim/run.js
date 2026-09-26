#!/usr/bin/env node
// QA sim harness entry point — `npm run sim` (see docs/systems/qa-sim.md for flags + how to read the report).
// Runs bot profiles × horizons × seeds through the real game logic at max speed (in parallel processes),
// then writes scripts/sim/out/report.md (short, for AI/humans) + report.json (full detail).
// Exit: 0 healthy, 1 errors/invariant violations, 2 harness crashed.

const fs   = require('fs')
const path = require('path')
const os   = require('os')
const { fork } = require('child_process')
const { createSim } = require('./loader')
const { Bot }       = require('./bot')
const { Recorder }  = require('./metrics')
const { PROFILES, DEFAULT_PATH } = require('./profiles')
const { buildReport } = require('./report')

function parseArgs(argv) {
  const a = { profiles: Object.keys(PROFILES), hours: [50, 100, 200], seeds: 3, seedBase: 1, path: DEFAULT_PATH,
              dt: 1, set: [], out: path.join(__dirname, 'out'), quiet: false, jobs: Math.max(1, os.cpus().length - 1) }
  for (const arg of argv) {
    const [k, ...rest] = arg.replace(/^--/, '').split('=')
    const v = rest.join('=')
    if (k === 'profiles') a.profiles = v.split(',')
    else if (k === 'hours') a.hours = v.split(',').map(Number)
    else if (k === 'seeds') a.seeds = +v
    else if (k === 'seed') a.seedBase = +v
    else if (k === 'path') a.path = v
    else if (k === 'dt') a.dt = +v
    else if (k === 'set') a.set.push(v)
    else if (k === 'out') a.out = path.resolve(v)
    else if (k === 'jobs') a.jobs = Math.max(1, +v)
    else if (k === 'quiet') a.quiet = true
    else if (k === 'help' || k === 'h') { console.log(fs.readFileSync(path.join(__dirname, 'USAGE.txt'), 'utf8')); process.exit(0) }
    else throw new Error(`Unknown flag: ${arg} (try --help)`)
  }
  for (const p of a.profiles) if (!PROFILES[p]) throw new Error(`Unknown profile "${p}" — have: ${Object.keys(PROFILES).join(', ')}`)
  if (!['founder', 'member'].includes(a.path)) throw new Error(`--path must be founder or member`)
  return a
}

async function runOne({ profile, hours, seed, path: sectPath, dt, set }) {
  const prof = PROFILES[profile]
  const wall0 = process.hrtime.bigint()
  const sim = createSim({ seed, overrides: set })
  const rec = new Recorder(sim.data)
  const bot = new Bot(sim, rec, { path: sectPath, actEverySec: prof.actEverySec })
  const guard = (fn, where) => { try { return fn() } catch (e) { rec.error(e, where) } }

  await sim.boot(0)
  const endSec = hours * 3600
  let ticks = 0, slowAcc = 60, actAcc = prof.actEverySec, openAcc = 0, maxTickUs = 0

  while (rec.t < endSec) {
    // Session model: close the game, skip real time, reopen through the real save/load path.
    if (openAcc >= prof.openSec && prof.closedSec > 0) {
      guard(() => sim.gs.forceSave(), 'forceSave')
      const before = JSON.parse(JSON.stringify(sim.gs.get()))
      const skip = Math.min(prof.closedSec, endSec - rec.t)
      sim.clock.now += skip * 1000
      rec.t += skip
      try { await sim.boot(0) } catch (e) { rec.error(e, 'initSlot') }
      rec.checkSaveRoundtrip(before, sim.gs.get())
      openAcc = 0; actAcc = prof.actEverySec   // player acts right after opening
      if (rec.t >= endSec) break
    }

    const t0 = process.hrtime.bigint()
    guard(() => sim.step(dt), 'tick')
    const us = Number(process.hrtime.bigint() - t0) / 1000
    if (us > maxTickUs) maxTickUs = us
    ticks++
    rec.sample(sim.gs.get(), dt, true)
    openAcc += dt

    if ((actAcc += dt) >= prof.actEverySec) { actAcc = 0; guard(() => bot.checkIn(), 'bot') }
    if ((slowAcc += dt) >= 60) { slowAcc = 0; guard(() => rec.slow(sim.gs.get()), 'invariants') }
  }

  const wallMs = Number(process.hrtime.bigint() - wall0) / 1e6
  return rec.finish(sim.gs.get(), {
    profile, hours, seed, path: sectPath,
    perf: { wallMs: Math.round(wallMs), ticks, avgTickUs: +(wallMs * 1000 / Math.max(1, ticks)).toFixed(2),
            maxTickUs: Math.round(maxTickUs), simHoursPerWallSec: Math.round(hours / (wallMs / 1000)) },
  })
}

// Runs are independent → fan out across CPU cores (each run is its own process + vm, no shared state).
function runPool(jobs, n, onDone) {
  const results = new Array(jobs.length)
  let next = 0, done = 0
  return new Promise((resolve, reject) => {
    const spawn = () => {
      if (next >= jobs.length) return
      const idx = next++
      const child = fork(__filename, ['--worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
      child.on('message', r => {
        results[idx] = r
        onDone(++done, jobs.length)
        child.kill()
        if (done === jobs.length) resolve(results); else spawn()
      })
      child.on('exit', code => { if (results[idx] === undefined) reject(new Error(`worker for job ${idx} exited with ${code}`)) })
      child.send(jobs[idx])
    }
    for (let i = 0; i < Math.min(n, jobs.length); i++) spawn()
  })
}

async function main() {
  if (process.argv[2] === '--worker') {
    process.once('message', async job => process.send(await runOne(job)))
    return
  }
  const args = parseArgs(process.argv.slice(2))
  try { createSim({ overrides: args.set }) }   // fail fast on a bad --set before spawning workers
  catch (e) { console.error(`Bad --set override: ${e.message}`); process.exit(2) }
  const jobs = []
  for (const hours of args.hours) for (const profile of args.profiles) for (let i = 0; i < args.seeds; i++)
    jobs.push({ profile, hours, seed: args.seedBase + i, path: args.path, dt: args.dt, set: args.set })

  const progress = (d, t) => { if (!args.quiet) process.stderr.write(`\r[sim] ${d}/${t} runs done   `) }
  const t0 = Date.now()
  let runs
  if (args.jobs > 1 && jobs.length > 1) runs = await runPool(jobs, args.jobs, progress)
  else { runs = []; for (const j of jobs) { runs.push(await runOne(j)); progress(runs.length, jobs.length) } }
  if (!args.quiet) process.stderr.write('\n')
  args.wallSec = +((Date.now() - t0) / 1000).toFixed(1)

  const { md, summary } = buildReport(runs, args)
  fs.mkdirSync(args.out, { recursive: true })
  fs.writeFileSync(path.join(args.out, 'report.md'), md)
  fs.writeFileSync(path.join(args.out, 'report.json'), JSON.stringify({ args, summary, runs }, null, 1))
  console.log(md)
  console.log(`\n(full detail: ${path.relative(process.cwd(), path.join(args.out, 'report.json'))})`)
  process.exitCode = summary.healthy ? 0 : 1
}

main().catch(e => { console.error(e); process.exit(2) })
