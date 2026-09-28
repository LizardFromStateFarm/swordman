#!/usr/bin/env node
// 3D project agent CLI — rig tooling. Run from 3d/ via package.json scripts, e.g.
//   npm run rig:auto  -- --source ink --state meditating --out rigs/cultivator_meditating.js
//   npm run rig:check -- rigs/cultivator_meditating.js
//   npm run rig:slots -- rigs/cultivator_meditating.js
//   npm run rig:edit  -- rigs/cultivator_meditating.js      (the human correction UI)
//   npm run rig:render -- rigs/cultivator_meditating.js     (PNG moments via the tool host)
//   npm test
// auto/check/slots are pure Node (no DOM), so they are fast and deterministic for agents. See 3d/RIG-FORMAT.md.
'use strict'

const fs = require('fs')
const path = require('path')

const { ART_FILES } = require('../rig/loader')
const { boneWorld } = require('../rig/model')
const { sourceFor, sourceForRig } = require('../rig/source')
const { loadRig, serializeRig } = require('../rig/file')
const { autoRig } = require('../rig/autobind')
const { lintRig } = require('../rig/lint')

const ROOT = path.resolve(__dirname, '..')

// ── tiny arg parsing: --key=value | --key value | --flag | positional ──
function parseArgs (argv) {
  const flags = {}, pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1)
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i]
      else flags[a.slice(2)] = true
    } else pos.push(a)
  }
  return { flags, pos }
}

const parseSlots = s => !s || s === true ? {}
  : Object.fromEntries(String(s).split(',').filter(Boolean).map(p => { const [k, v] = p.split(':'); return [k.trim(), v && v.trim()] }))

const electronPath = () => { try { const p = require('electron'); return typeof p === 'string' ? p : null } catch { return null } }

function resolveRigPath (f) {
  if (path.isAbsolute(f)) return f
  const fromCwd = path.resolve(process.cwd(), f)
  return fs.existsSync(fromCwd) ? fromCwd : path.join(ROOT, f)   // so "rigs/x.js" works from the repo root
}

function printLint (label, res) {
  for (const r of res.results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.msg}`)
  console.log(`${res.ok ? 'PASS' : 'FAIL'} — ${label} (${res.results.filter(r => r.ok).length} ok, ${res.results.filter(r => !r.ok).length} fail)`)
}

function walkJs (dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'out', '.artcache', '.git'].includes(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkJs(full, out)
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full)
  }
  return out
}

function rigFiles (flags) {
  if (!flags.all) return []
  const dir = path.join(ROOT, 'rigs')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
}

// Rig overlay geometry: bone world positions + attachment pivots (drawn over the art by the render page).
function buildOverlay (rig) {
  const bones = Object.entries(rig.skeleton).map(([name, b]) => ({ name, parent: b.parent || null, world: boneWorld(rig, name) }))
  const pivots = (rig.attachments || []).filter(a => a.pivot).map(a => ({ label: a.part || ('kind:' + a.kind), pivot: a.pivot }))
  return { bones, pivots }
}

// ── commands ──
function cmdAuto (flags) {
  const kind = flags.source || 'ink'
  const state = flags.state || 'meditating'
  const slots = parseSlots(flags.slots)
  const modelAbs = flags.model == null ? null : path.resolve(process.cwd(), String(flags.model))
  const regions = flags.regions == null ? undefined : Number(flags.regions)
  const { source } = sourceFor(kind, { state, slots, model: modelAbs || undefined, regions, appRoot: flags['app-root'] })
  const rig = autoRig(source, { slots })
  if (kind === 'voxel' && modelAbs) rig.source.model = modelAbs.startsWith(ROOT) ? path.relative(ROOT, modelAbs).replace(/\\/g, '/') : modelAbs
  if (kind === 'ascii') rig.source.regions = source.regions.length
  const slug = kind === 'voxel'
    ? `voxel_${path.basename(String(flags.model || 'model')).replace(/\.vox$/i, '')}`
    : `${kind}_${state}`
  const out = flags.out || path.join('rigs', `${slug}.js`)
  const file = path.isAbsolute(out) ? out : path.join(ROOT, out)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, serializeRig(rig))
  console.log(`wrote ${path.relative(ROOT, file)}`)
  console.log(`  ${rig.attachments.length} attachments · ${Object.keys(rig.skeleton).length} bones · ${Object.keys(rig.tracks).length} tracks`)
  const res = lintRig(rig, source)
  printLint(path.relative(ROOT, file), res)
  if (!res.ok) process.exitCode = 1
}

function cmdCheck (flags, pos) {
  const files = flags.all ? rigFiles(flags) : pos
  if (!files.length) {
    if (flags.all) { console.log('no rigs in rigs/ yet — generate one: npm run rig:auto -- --state meditating'); return }
    console.error('usage: cli check <rig-file…> | --all'); process.exitCode = 2; return
  }
  let bad = 0
  for (const f of files) {
    const file = resolveRigPath(f)
    const rig = loadRig(file)
    const { source } = sourceForRig(rig, { appRoot: flags['app-root'] })
    const res = lintRig(rig, source)
    printLint(path.relative(ROOT, file), res)
    if (!res.ok) bad++
  }
  if (bad) process.exitCode = 1
}

function cmdSlots (flags, pos) {
  const f = pos[0]
  if (!f) { console.error('usage: cli slots <rig-file>'); process.exitCode = 2; return }
  const file = resolveRigPath(f)
  const rig = loadRig(file)
  if (rig.source.kind !== 'ink') { console.error('slots: ink-only (a voxel rig has no slots)'); process.exitCode = 2; return }
  const { source } = sourceForRig(rig, { appRoot: flags['app-root'] })
  const kindCovered = new Set(rig.attachments.filter(a => a.kind).map(a => a.kind))
  const idCovered = new Set(rig.attachments.filter(a => a.part).map(a => a.part))
  console.log(`slot coverage for ${path.relative(ROOT, file)} (${rig.source.kind} · ${rig.source.state})`)
  let holes = 0
  for (const kind of source.slotKinds) {
    const opts = Object.entries(source.slotOptions[kind] || {})
    const withParts = opts.filter(([, o]) => (o.parts || []).length)
    if (!withParts.length) { console.log(`  ${kind.padEnd(7)} — palette/effects only, no geometry to bind`); continue }
    for (const [opt, o] of withParts) {
      const parts = (o.parts || []).map(p => p.id)
      const misses = parts.filter(id => !idCovered.has(id))
      const covered = kindCovered.has(kind) || !misses.length
      if (!covered) holes++
      console.log(`  ${kind.padEnd(7)} ${opt.padEnd(9)} ${covered ? 'covered' : 'MISSING'}${covered ? '' : ' → ' + misses.join(', ')}`)
    }
  }
  console.log(holes ? `${holes} option(s) not covered` : 'all slot options covered')
  if (holes) process.exitCode = 1
}

function runHost (args) {
  const exe = electronPath()
  if (!exe) { console.error('electron not found — run `npm install` at the repo root'); process.exitCode = 2; return }
  const r = require('child_process').spawnSync(exe, [path.join(ROOT, 'tools', 'host.js'), ...args], { stdio: 'inherit', cwd: ROOT })
  if (r.error) { console.error('failed to launch electron: ' + r.error.message); process.exitCode = 1; return }
  process.exitCode = r.status == null ? 1 : r.status
}

function cmdRender (flags, pos) {
  const f = pos[0]
  if (!f) { console.error('usage: cli render <rig-file> [--slots k:v,…] [--dpr N] [--out DIR] [--no-overlay]'); process.exitCode = 2; return }
  const file = resolveRigPath(f)
  const rig = loadRig(file)
  const outDir = path.resolve(ROOT, flags.out || 'out')
  const jobFile = path.join(ROOT, 'out', 'render-job.json')
  fs.mkdirSync(path.dirname(jobFile), { recursive: true })

  let job
  if (rig.source.kind === 'voxel') {
    const { source } = sourceForRig(rig, { appRoot: flags['app-root'] })
    job = {
      kind: 'voxel',
      name: path.basename(file).replace(/\.js$/, '') + '-iso',
      model: { size: source.size, palette: source.palette, voxels: source.voxels },
      overlay: flags['no-overlay'] ? null : buildOverlay(rig),
      dpr: Number(flags.dpr || 1), out: outDir,
    }
  } else if (rig.source.kind === 'ascii') {
    const { source } = sourceForRig(rig, { appRoot: flags['app-root'] })
    job = {
      kind: 'ascii',
      name: path.basename(file).replace(/\.js$/, '') + '-ascii',
      canvas: source.scene, grid: source.grid, cell: source.cell, regions: source.regions,
      rows: source.frames[0], colors: source.colors, defaultColor: source.defaultColor,
      overlay: flags['no-overlay'] ? null : buildOverlay(rig),
      dpr: Number(flags.dpr || 2), out: outDir,
    }
  } else {
    if (flags.track) console.error('note: --track playback needs the sheet poser (P3) — rendering state moments instead')
    const slots = { ...rig.source.slots, ...parseSlots(flags.slots) }
    const { art } = sourceFor(rig.source.kind, { state: rig.source.state, slots, appRoot: flags['app-root'] })
    job = {
      kind: 'ink',
      appRoot: art.root,
      scripts: [...ART_FILES[rig.source.kind], 'renderer/engine/ink-renderer.js'],
      state: rig.source.state,
      slots,
      dpr: Number(flags.dpr || 4),
      out: outDir,
      overlay: flags['no-overlay'] ? null : buildOverlay(rig),
      moments: [
        { name: `${rig.source.state}-idle`, t: 0.6 },
        { name: `${rig.source.state}-bt`, t: 0.9, bt: 1 },
        { name: `${rig.source.state}-fail`, t: 0.3, fail: 1 },
      ],
    }
  }
  fs.writeFileSync(jobFile, JSON.stringify(job))
  runHost(['--job', jobFile])
}

function cmdEdit (flags, pos) {
  const f = pos[0]
  if (!f) { console.error('usage: cli edit <rig-file> [--app-root PATH]'); process.exitCode = 2; return }
  const file = resolveRigPath(f)
  if (!fs.existsSync(file)) { console.error('no such rig: ' + file); process.exitCode = 2; return }
  const args = ['--edit', file]
  if (flags['app-root']) args.push('--app-root', String(flags['app-root']))
  if (flags.smoke) args.push('--smoke')     // headless self-test of the editor (used by `npm test`)
  runHost(args)
}

// Scenario checks (checks/*.js) — each exports run() → [{ ok, msg }]. Same shape as the app's scripts/sim/checks.
function runChecks () {
  const dir = path.join(ROOT, 'checks')
  if (!fs.existsSync(dir)) return 0
  let bad = 0
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js')).sort()) {
    const res = require(path.join(dir, f)).run()
    for (const r of res) console.log(`${r.ok ? 'ok  ' : 'FAIL'} [${f}] ${r.msg}`)
    const fails = res.filter(r => !r.ok).length
    console.log(`${fails ? 'FAIL' : 'PASS'} — checks/${f} (${res.length - fails} ok, ${fails} fail)`)
    if (fails) bad++
  }
  return bad
}

function cmdTest (flags) {
  const files = walkJs(ROOT)
  let bad = 0
  for (const f of files) {
    try { require('child_process').execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }) }
    catch (e) { bad++; console.error(`✗ ${path.relative(ROOT, f)}\n${e.stderr?.toString() || e.message}`) }
  }
  console.log(`${bad ? 'FAIL' : 'ok  '} ${files.length} files pass node --check`)
  for (const f of rigFiles({ all: true })) {
    const rig = loadRig(f)
    const { source } = sourceForRig(rig, { appRoot: flags['app-root'] })
    const res = lintRig(rig, source)
    printLint(path.relative(ROOT, f), res)
    if (!res.ok) bad++
  }
  bad += runChecks()
  if (bad) process.exitCode = 1
}

function usage () {
  console.log(`usage: cli <command> [options]
  auto   --source ink --state <state> [--slots k:v,…] [--out rigs/x.js] [--app-root PATH]
  auto   --source voxel --model <file.vox> [--out rigs/x.js]
  auto   --source ascii --state <state> [--regions N] [--out rigs/x.js]
  check  <rig-file…> | --all
  slots  <rig-file>                          (ink only)
  edit   <rig-file> [--app-root PATH]        (opens the rig editor — ink rigs)
  render <rig-file> [--slots k:v,…] [--dpr N] [--out DIR] [--no-overlay]
  test`)
}

const [cmd, ...rest] = process.argv.slice(2)
const { flags, pos } = parseArgs(rest)
switch (cmd) {
  case 'auto': cmdAuto(flags); break
  case 'check': case 'lint': cmdCheck(flags, pos); break
  case 'slots': cmdSlots(flags, pos); break
  case 'edit': cmdEdit(flags, pos); break
  case 'render': cmdRender(flags, pos); break
  case 'test': cmdTest(flags); break
  case undefined: case '--help': case '-h': usage(); break
  default: console.error(`unknown command "${cmd}"`); usage(); process.exitCode = 2
}
