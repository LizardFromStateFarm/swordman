const { app, BrowserWindow, screen, ipcMain } = require('electron')
const path = require('path')
const fs   = require('fs')

let win

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
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (!win) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
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
