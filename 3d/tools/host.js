// 3D project tool host — its OWN Electron main process (never the app's main.js/renderer).
// Two modes:
//   render: electron tools/host.js --job <job.json>      headless; renders rig moments to PNGs, then exits.
//   editor: electron tools/host.js --edit <rig.js> [--app-root PATH]   the interactive rig editor.
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const { loadRig, serializeRig } = require('../rig/file')
const { sourceForRig } = require('../rig/source')
const { lintRig } = require('../rig/lint')
const { boneWorld, partBBox, unionBoxes } = require('../rig/model')
const { ART_FILES } = require('../rig/loader')

const argOf = name => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null }

// ── shared: read the app's art sources read-only for the page to inject ──
function readSources (appRoot, kind) {
  return [...ART_FILES[kind], 'renderer/engine/ink-renderer.js'].map(rel => fs.readFileSync(path.join(appRoot, rel), 'utf8'))
}

// ── mode: render ──
async function runRender (jobPath) {
  const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'))
  if (job.scripts) job.sources = job.scripts.map(rel => fs.readFileSync(path.join(job.appRoot, rel), 'utf8'))
  const win = new BrowserWindow({ show: false, width: 1200, height: 700, webPreferences: { contextIsolation: true, nodeIntegration: false } })
  try {
    await win.loadFile(path.join(__dirname, 'render', 'index.html'))
    if (job.sources) await win.webContents.executeJavaScript(`window.__sources__(${JSON.stringify(job.sources)})`, true)
    const results = await win.webContents.executeJavaScript(`window.renderJob(${JSON.stringify(job)})`, true)
    fs.mkdirSync(job.out, { recursive: true })
    for (const r of results) {
      fs.writeFileSync(path.join(job.out, r.name + '.png'), Buffer.from(String(r.dataUrl).split(',')[1], 'base64'))
      console.log('wrote', path.relative(process.cwd(), path.join(job.out, r.name + '.png')))
    }
    console.log(`rendered ${results.length} frame(s) → ${job.out}`)
    app.exit(0)
  } catch (e) {
    console.error('host: render failed\n' + ((e && e.stack) || e))
    app.exit(1)
  }
}

// ── mode: editor ──
function buildGeometry (source) {
  const parts = {}, kinds = {}
  for (const p of source.parts) parts[p.id] = partBBox(p)
  for (const kind of source.slotKinds) {
    const boxes = []
    for (const O of Object.values(source.slotOptions[kind] || {})) for (const p of O.parts || []) boxes.push(partBBox(p))
    const u = unionBoxes(boxes); if (u) kinds[kind] = u
  }
  return { parts, kinds, canvas: source.scene }
}

function runEditor (rigPath, appRoot) {
  const opts = appRoot ? { appRoot } : {}
  const rig = loadRig(rigPath)
  if (rig.space === '3d' || (rig.source && rig.source.kind !== 'ink')) {
    console.error(`editor: the browser editor is ink-only for now (this rig is "${rig.source.kind}")`)
    app.exit(2); return
  }
  const { art, source } = sourceForRig(rig, opts)
  const job = {
    appRoot: art.root, rigPath,
    sources: readSources(art.root, rig.source.kind),
    state: rig.source.state,
    slotKinds: source.slotKinds,
    slotOptions: Object.fromEntries(source.slotKinds.map(k => [k, Object.keys(source.slotOptions[k] || {})])),
    geometry: buildGeometry(source),
    bones: Object.entries(rig.skeleton).map(([name, b]) => ({ name, parent: b.parent || null, world: boneWorld(rig, name) })),
    rig,
  }

  ipcMain.handle('editor:job', () => job)
  ipcMain.handle('editor:lint', (_e, r) => lintRig(r, sourceForRig(r, opts).source))
  const smoke = process.argv.includes('--smoke')
  // --smoke is a non-destructive self-test: it writes to a throwaway copy, never the given rig.
  const savePath = smoke ? path.join(__dirname, '..', 'out', path.basename(rigPath)) : rigPath

  ipcMain.handle('editor:save', (_e, r) => {
    const res = lintRig(r, sourceForRig(r, opts).source)
    fs.mkdirSync(path.dirname(savePath), { recursive: true })
    fs.writeFileSync(savePath, serializeRig(r, `${r.source.kind} · ${r.source.state} · edited in the rig editor`))
    return res
  })

  const win = new BrowserWindow({
    show: !smoke, width: 1200, height: 760, backgroundColor: '#0B0716',
    title: '3D Rig Editor — ' + path.basename(rigPath),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) console.error('page error:', msg) })
  win.loadFile(path.join(__dirname, 'rig-editor', 'index.html'))
  win.on('closed', () => app.quit())

  if (smoke) smokeEditor(win)
}

// --smoke: wait for the page to boot, run the editor's data-path probe, print, exit.
async function smokeEditor (win) {
  try {
    const ready = await (async () => {
      for (let i = 0; i < 120; i++) {
        const ok = await win.webContents.executeJavaScript('!!window.__editor', true).catch(() => false)
        if (ok) return true
        await new Promise(r => setTimeout(r, 100))
      }
      return false
    })()
    if (!ready) throw new Error('editor did not boot (window.__editor never appeared)')
    console.log('editor state:', JSON.stringify(await win.webContents.executeJavaScript('window.__editor.state()', true)))
    const pr = await win.webContents.executeJavaScript('window.__editor.probe()', true)
    console.log('editor probe:', JSON.stringify(pr))
    app.exit(pr.lintOk && pr.saveOk ? 0 : 1)
  } catch (e) {
    console.error('editor smoke failed\n' + ((e && e.stack) || e))
    app.exit(1)
  }
}

app.on('window-all-closed', () => app.quit())

app.whenReady().then(() => {
  const jobPath = argOf('--job')
  const editPath = argOf('--edit')
  try {
    if (editPath) runEditor(editPath, argOf('--app-root'))
    else if (jobPath && fs.existsSync(jobPath)) runRender(jobPath)
    else { console.error('host: pass --job <file> or --edit <rig-file>'); app.exit(2) }
  } catch (e) {
    console.error('host: ' + ((e && e.stack) || e))
    app.exit(1)
  }
})
