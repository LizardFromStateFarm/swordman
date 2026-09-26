const { app, BrowserWindow, screen, ipcMain, Tray, Menu, Notification, nativeImage } = require('electron')
const path = require('path')
const fs   = require('fs')

let win
let tray = null
// Set only by the app-wide quit path (before-quit) — distinguishes a real quit from the window's
// native close (taskbar "Close window", Alt+F4, etc.), which should hide to tray instead. See
// docs/systems/notifications.md.
let isQuitting = false
let trayInfo = { name: 'Unnamed Cultivator', stage: '' }

const trayIconPath = () => path.join(__dirname, 'assets', 'icons', 'tray-icon.png')

const userData    = () => app.getPath('userData')
const slotPath    = (i) => () => path.join(userData(), `slot_${i}.json`)
const CONFIG_PATH = ()  => path.join(userData(), 'window.json')

function readJSON(pathFn) {
  try { return JSON.parse(fs.readFileSync(pathFn(), 'utf8')) } catch { return null }
}

function writeJSON(pathFn, data) {
  fs.writeFileSync(pathFn(), JSON.stringify(data), 'utf8')
}

function deleteFile(pathFn) {
  try { fs.unlinkSync(pathFn()) } catch {}
}

// ── Layout modes (Phase 6E, roadmap 1.7 — docs/systems/ui-layout.md → "Layout modes") ─────────────────
// The mode is an app-wide window preference (window.json), not per save slot: the character select needs a window
// before any slot is loaded. Each mode remembers its own position (and Desktop its size). The renderer sets
// body[data-layout] and does everything else in CSS; this file only owns the window geometry.
const LAYOUT_MODES = ['overlay', 'expanded', 'desktop', 'banner']
const BANNER_H = 56
const DESKTOP_MIN = { w: 640, h: 520 }

function layoutCfg() {
  const cfg = readJSON(CONFIG_PATH) || {}
  return {
    mode:       LAYOUT_MODES.includes(cfg.layoutMode) ? cfg.layoutMode : 'overlay',
    bannerEdge: cfg.bannerEdge === 'bottom' ? 'bottom' : 'top',
  }
}

// The work area of whichever display the window is on (or the primary one before it exists).
function workArea() {
  return (win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()).workArea
}

function clampToArea(b, wa) {
  const width  = Math.min(b.width, wa.width)
  const height = Math.min(b.height, wa.height)
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - width)
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height)
  return { x, y, width, height }
}

// Bounds for a mode: its remembered spot if any (pos.<mode>, and size.desktop), else a sensible default.
function boundsFor(mode, edge) {
  const wa  = workArea()
  const cfg = readJSON(CONFIG_PATH) || {}
  const pos = (cfg.pos || {})[mode] || (mode === 'overlay' && cfg.x != null ? { x: cfg.x, y: cfg.y } : null)
  if (mode === 'banner') {
    return { x: wa.x, y: edge === 'bottom' ? wa.y + wa.height - BANNER_H : wa.y, width: wa.width, height: BANNER_H }
  }
  let width, height
  if (mode === 'overlay')  { width = 300; height = Math.min(700, wa.height - 40) }
  if (mode === 'expanded') { width = 640; height = Math.min(720, wa.height - 40) }
  if (mode === 'desktop') {
    const sz = (cfg.size || {}).desktop
    width  = Math.max(DESKTOP_MIN.w, sz?.w || 1000)
    height = Math.max(DESKTOP_MIN.h, sz?.h || Math.min(760, wa.height - 40))
  }
  const def = mode === 'desktop'
    ? { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2) }
    : { x: wa.x + wa.width - width - 20, y: wa.y + 20 }
  return clampToArea({ ...(pos || def), width, height }, wa)
}

let applyingLayout = false
function applyLayout(mode, edge) {
  if (!win) return
  applyingLayout = true
  const onTop = mode !== 'desktop'
  win.setMovable(mode !== 'banner')
  win.setMinimumSize(mode === 'desktop' ? DESKTOP_MIN.w : 1, mode === 'desktop' ? DESKTOP_MIN.h : 1)
  win.setBounds(boundsFor(mode, edge))
  win.setAlwaysOnTop(onTop, 'screen-saver')   // see createWindow(): must be the 'screen-saver' level
  win.setSkipTaskbar(mode === 'banner')
  currentMode = mode
  setTimeout(() => { applyingLayout = false }, 300)
}
let currentMode = 'overlay'

function createWindow() {
  const lay = layoutCfg()
  // The character select always opens in a full-height mode: a banner can't show it. The renderer switches to
  // the saved banner mode once a slot is playing (set-layout), see renderer/game/layout.js.
  currentMode = lay.mode === 'banner' ? 'overlay' : lay.mode
  const b = boundsFor(currentMode, lay.bannerEdge)

  win = new BrowserWindow({
    width:   b.width,
    height:  b.height,
    x:       b.x,
    y:       b.y,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    resizable:   false,
    skipTaskbar: false,
    hasShadow:   true,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      // Phase 9A: keep ticking while hidden to the tray (game.js has a 1s fallback timer for when rAF stops).
      backgroundThrottling: false,
    },
  })

  // 'screen-saver' is the highest always-on-top level Electron exposes — plain
  // alwaysOnTop:true uses a lower level that Windows drops behind an exclusive-
  // fullscreen game as soon as the game regains focus (e.g. after clicking the
  // overlay). This level is what lets the window survive on top of a fullscreen game.
  win.setAlwaysOnTop(currentMode !== 'desktop', 'screen-saver')
  if (currentMode === 'desktop') win.setMinimumSize(DESKTOP_MIN.w, DESKTOP_MIN.h)

  win.loadFile('renderer/index.html')
  win.once('ready-to-show', () => win.show())

  // Each mode remembers where it was dragged (the banner is pinned to an edge and never moves).
  win.on('moved', () => {
    if (applyingLayout || currentMode === 'banner') return
    const [x, y] = win.getPosition()
    const cfg = readJSON(CONFIG_PATH) || {}
    writeJSON(CONFIG_PATH, { ...cfg, pos: { ...(cfg.pos || {}), [currentMode]: { x, y } } })
  })

  win.on('closed', () => { win = null })

  // Phase 9A: close button (or any other native close — taskbar "Close window", Alt+F4) hides to
  // tray instead of quitting, unless a real quit is already in flight (before-quit sets isQuitting
  // for every quit path: tray "Quit", window.electron.quit(), app.quit()). The renderer's ✕ button
  // still has its own choice (closeAction setting) between hideToTray() and quit() — this handler
  // is the backstop that makes "quit only via tray Quit" hold even if something else tries to close
  // the window directly. See docs/systems/notifications.md.
  win.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); win.hide() }
  })
}

function showWindow() {
  if (!win) return
  win.show()
  win.focus()
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `${trayInfo.name} — ${trayInfo.stage}`, enabled: false },
    { type: 'separator' },
    { label: 'Open', click: showWindow },
    { label: 'Quit', click: () => app.quit() },
  ])
}

function createTray() {
  const icon = nativeImage.createFromPath(trayIconPath())
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }))
  tray.setToolTip(`${trayInfo.name} — ${trayInfo.stage}`)
  tray.setContextMenu(buildTrayMenu())
  // Left-click and double-click both toggle: hide if visible+focused, otherwise show+focus.
  const toggle = () => {
    if (!win) return
    if (win.isVisible() && win.isFocused()) win.hide()
    else showWindow()
  }
  tray.on('click', toggle)
  tray.on('double-click', toggle)
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  app.on('activate', () => { if (!win) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Give the renderer a brief moment to flush an autosave before a real quit actually happens —
// covers the tray's "Quit" item and any quit path that doesn't already forceSave() itself
// (window.electron.quit() from the ✕ button already calls forceSave() first; this is the backstop
// for the tray path, which has no renderer round-trip otherwise). Runs once per quit attempt: the
// second app.quit() call re-enters this handler with isQuitting already true and just proceeds.
app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  if (win && !win.isDestroyed()) {
    e.preventDefault()
    win.webContents.send('request-save')
    setTimeout(() => app.quit(), 200)
  }
})

// ── Slot-based save/load ──────────────────────────────────────────────────

ipcMain.handle('load-all-slots', () => {
  return [0, 1, 2].map(i => readJSON(slotPath(i)))
})

ipcMain.handle('load-slot', (_e, i) => readJSON(slotPath(i)))

ipcMain.handle('save-slot', (_e, i, data) => {
  writeJSON(slotPath(i), data)
})

ipcMain.handle('delete-slot', (_e, i) => {
  deleteFile(slotPath(i))
})

// Dev tools (charselect late-game presets) only when running unpackaged — npm start, never the dist build
ipcMain.handle('is-dev', () => !app.isPackaged)

ipcMain.on('quit-app', () => app.quit())

// ── Layout modes (Phase 6E) ───────────────────────────────────────────────
ipcMain.handle('get-layout', () => ({ ...layoutCfg(), current: currentMode, supported: true, pinned: win ? win.isAlwaysOnTop() : true }))

// persist:false = a temporary switch (the character select, or peeking out of banner mode) that leaves the saved
// preference alone.
ipcMain.handle('set-layout', (_e, mode, opts = {}) => {
  if (!LAYOUT_MODES.includes(mode)) mode = 'overlay'
  const cfg  = readJSON(CONFIG_PATH) || {}
  const edge = opts.bannerEdge === 'bottom' || opts.bannerEdge === 'top' ? opts.bannerEdge : layoutCfg().bannerEdge
  if (opts.persist !== false) writeJSON(CONFIG_PATH, { ...cfg, layoutMode: mode, bannerEdge: edge })
  else if (opts.bannerEdge) writeJSON(CONFIG_PATH, { ...cfg, bannerEdge: edge })
  applyLayout(mode, edge)
  return { mode, bannerEdge: edge, pinned: win ? win.isAlwaysOnTop() : true }
})

// Banner quick-action menus (1.7b): the 56px strip grows by `extra` px while a dropdown is open (downward from a
// top banner, upward from a bottom one) and shrinks back to the strip on 0.
ipcMain.on('banner-menu', (_e, extra) => {
  if (!win || currentMode !== 'banner') return
  const edge = layoutCfg().bannerEdge
  const b = boundsFor('banner', edge)
  const grow = Math.max(0, Math.min(Math.round(extra) || 0, workArea().height - BANNER_H))
  applyingLayout = true
  win.setBounds({ x: b.x, y: edge === 'bottom' ? b.y - grow : b.y, width: b.width, height: BANNER_H + grow })
  setTimeout(() => { applyingLayout = false }, 300)
})

// Desktop mode's resize grip (transparent frameless windows have no native resize border on Windows).
ipcMain.on('resize-window', (_e, w, h) => {
  if (!win || currentMode !== 'desktop') return
  const wa = workArea()
  const [x, y] = win.getPosition()
  const width  = Math.round(Math.min(Math.max(w, DESKTOP_MIN.w), wa.x + wa.width - x))
  const height = Math.round(Math.min(Math.max(h, DESKTOP_MIN.h), wa.y + wa.height - y))
  win.setBounds({ x, y, width, height })   // setSize is ignored on a non-resizable window on Windows
  clearTimeout(resizeSaveTimer)
  resizeSaveTimer = setTimeout(() => {
    const cfg = readJSON(CONFIG_PATH) || {}
    writeJSON(CONFIG_PATH, { ...cfg, size: { ...(cfg.size || {}), desktop: { w: width, h: height } } })
  }, 400)
})
let resizeSaveTimer = null

ipcMain.handle('toggle-always-on-top', () => {
  if (!win) return true
  // Reapply 'screen-saver' whenever turning back on, or it reverts to the
  // weaker default level that a fullscreen game can cover — see createWindow().
  win.setAlwaysOnTop(!win.isAlwaysOnTop(), 'screen-saver')
  return win.isAlwaysOnTop()
})

// ── Phase 9A/B: system tray + opt-in desktop notifications ────────────────

ipcMain.on('hide-to-tray', () => { if (win) win.hide() })

ipcMain.on('update-tray-info', (_e, name, stage) => {
  trayInfo = { name: name || trayInfo.name, stage: stage || trayInfo.stage }
  if (tray) {
    tray.setToolTip(`${trayInfo.name} — ${trayInfo.stage}`)
    tray.setContextMenu(buildTrayMenu())
  }
})

ipcMain.on('show-notification', (_e, title, body) => {
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({ title, body, icon: nativeImage.createFromPath(trayIconPath()) })
    n.on('click', showWindow)
    n.show()
  } catch {}
})
