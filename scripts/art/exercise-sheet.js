// Exercise figure CONTACT SHEET (art pipeline, Phase 52 ExerciseScene): renders every exercise pose (Push-Ups top /
// mid / bottom, the Running stride phases, the Lift squat → chest → drive → overhead, and every LIFT_ITEMS load
// overhead) frozen side by side, at 2× zoom, to one PNG — for iterating on the rig/pose data and for asset reviews.
// Doc: docs/systems/minigames.md → "The ExerciseScene". Uses scripts/art/exercise-sheet.html.
// Run: npx electron scripts/art/exercise-sheet.js [out.png] [#stageColour]   (default out: scripts/art/out/exercise-sheet.png)
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path')
const out = path.resolve(process.argv.find(a => a.endsWith('.png')) || path.join(__dirname, 'out', 'exercise-sheet.png'))
const color = process.argv.find(a => /^#[0-9a-f]{6}$/i.test(a)) || '#E8C46A'
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1312, height: 1500, webPreferences: { zoomFactor: 2, offscreen: true } })
  await win.loadFile(path.join(__dirname, 'exercise-sheet.html'), { query: { color } })
  win.webContents.setZoomFactor(1)
  await new Promise(r => setTimeout(r, 400))
  const err = await win.webContents.executeJavaScript('document.title')
  if (err !== 'ready') console.error('sheet did not finish:', err)
  const h = await win.webContents.executeJavaScript('document.body.scrollHeight')
  win.setContentSize(1312, h)
  await new Promise(r => setTimeout(r, 300))
  const img = await win.webContents.capturePage()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, img.toPNG())
  console.log('wrote', out)
  app.quit()
})
