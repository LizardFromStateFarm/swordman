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

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const cfg = readJSON(CONFIG_PATH) || {}

  const W = 300
  const H = 600

  win = new BrowserWindow({
    width:   W,
    height:  H,
    x:       cfg.x ?? sw - W - 20,
    y:       cfg.y ?? 20,
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
  win.setAlwaysOnTop(true, 'screen-saver')

  win.loadFile('renderer/index.html')
  win.once('ready-to-show', () => win.show())

  win.on('moved', () => {
    const [x, y] = win.getPosition()
    const cfg = readJSON(CONFIG_PATH) || {}
    writeJSON(CONFIG_PATH, { ...cfg, x, y })
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
