// Real-app smoke scenario — Sect → Base (A7 / Phase 38A; docs/systems/scene-art.md): the founder's Base sub-tab
// offers a large canvas, the scene actually paints (not blank), it fits its panel in Overlay / Expanded / Desktop /
// phone, it redraws when state changes (raise a hall → the picture changes), the legend reads the state, and the
// build/growth burst runs. Screenshots: scripts/smoke/out/scene-*.png (incl. 3× `scene-zoom-*` crops of the hall,
// the left/right halls and the gate+ward, for the art review gate).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/scene.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  const load = async preset => {
    await ev(`(async () => { await window.electron.saveSlot(0, ${preset ? `gameState.buildDevSave('${preset}')` : 'null'}) })()`)
    await ev('location.reload()'); await sleep(1500)
    await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\') || document.querySelector(\'.cs-btn-new[data-slot="0"]\')', 10000)
    await click('.cs-btn-play[data-slot="0"]')
    await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
    await sleep(400)
    await ev('document.getElementById("layout-tip")?.click()')
  }
  const goBase = async () => { await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-base"]'); await sleep(500) }
  const painted = () => ev(`(() => { const c = document.getElementById('scene-canvas'); if (!c) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 8) n++; return n > 5 })()`)
  const canvasClip = async (name, scale = 2) => {
    const r = await ev('(() => { const b = document.getElementById("scene-canvas").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })()')
    await shot(name, { ...r, scale })
  }
  // A magnified crop of one region of the scene in logical units (for the art review gate; 3× by default).
  const sceneCrop = async (name, box, scale = 3) => {
    const r = await ev(`(() => { const c = document.getElementById('scene-canvas'), b = c.getBoundingClientRect()
      const S = b.width / 420, oy = (b.height - 236 * S) / 2
      return { x: b.x + ${box[0]} * S, y: b.y + oy + ${box[1]} * S, width: ${box[2]} * S, height: ${box[3]} * S } })()`)
    await shot(name, { ...r, scale })
  }
  const fits = () => ev(`(() => { const p = document.getElementById('tab-sect-base'), c = document.getElementById('scene-canvas')
    if (!c) return false; const pr = p.getBoundingClientRect(), cr = c.getBoundingClientRect()
    return c.width > 0 && c.height > 0 && cr.right <= pr.right + 1 && cr.left >= pr.left - 1 && document.documentElement.scrollWidth <= innerWidth + 1 })()`)

  await load('founder')
  await click('#tabs [data-group="sect"]'); await sleep(250)
  assert(await ev('[...document.querySelectorAll("#subtabs .subtab[data-in=sect]:not(.hidden)")].map(b => b.dataset.tab).join(",") === "sect,sect-halls,sect-base,sect-disciples,sect-war"'),
    'a founder is offered the Base sub-tab')

  // every layout mode: the scene is there, painted, and fits
  for (const mode of ['overlay', 'expanded', 'desktop']) {
    await pick(mode); await goBase()
    assert(await ev('!!document.querySelector("#scene-canvas")'), `${mode}: the scene canvas is present`)
    assert(await fits(), `${mode}: the scene fits its panel with no horizontal overflow`)
    await sleep(500)
    assert(await painted(), `${mode}: the scene has painted (not blank)`)
    assert(await ev('!!document.querySelector("#scene-legend .scene-chip.gold")'), `${mode}: the legend names the Sect Hall`)
    if (mode === 'overlay') {   // the whole legend must land on first paint, not below the fold (review cycle 1)
      const vis = await ev(`(() => { const p = document.getElementById('tab-sect-base'), chip = document.querySelector('#scene-legend .scene-chip')
        const pr = p.getBoundingClientRect(), cr = chip.getBoundingClientRect()
        return { overflow: Math.round(p.scrollHeight - p.clientHeight), chipTop: Math.round(cr.top - pr.top), paneH: p.clientHeight } })()`)
      console.log('  Overlay legend:', JSON.stringify(vis))
      assert(vis.chipTop < vis.paneH, 'overlay: the legend is on screen without scrolling')
    }
    await shot(`scene-${mode}`)
    if (mode === 'desktop') await canvasClip('scene-canvas-desktop', 2)
  }
  await pick('desktop')   // the full-compound shots below belong in the roomiest mode

  // state → picture: raise a hall and the hall grows; the legend follows
  await goBase()
  const sig0 = await ev('document.getElementById("scene-canvas").width + "x" + document.getElementById("scene-canvas").height')
  await ev(`(() => { const s = gameState.get(); s.ownSect.buildings.qi_library = true; s.ownSect.hallLevel = 4
    s.ownSect.disciples = [{ id: 'a', name: 'Li Wei', talent: 3, level: 2, xp: 0 }, { id: 'b', name: 'Wang Fang', talent: 2, level: 1, xp: 0 }]
    gameState._recalc(); gameState._notify() })()`)
  await sleep(600)
  assert(await ev('!!document.querySelector("#scene-legend .scene-chip.gold") && /Lv\\.4/.test(document.getElementById("scene-legend").textContent)'), 'raising the Sect Hall shows in the legend')
  assert(await ev('[...document.querySelectorAll("#scene-legend .scene-chip")].some(n => /Qi Library/.test(n.textContent))'), 'a raised hall is named in the legend')
  assert(await painted(), 'the scene repaints after a state change')
  await shot('scene-raised')
  await canvasClip('scene-canvas-raised', 2)

  // 3× crops of the compound's parts, for the art review gate (building detail + contrast against the background)
  await sceneCrop('scene-zoom-hall', [110, 80, 130, 90])
  await sceneCrop('scene-zoom-left', [10, 118, 130, 80])      // pill hall + beast pen
  await sceneCrop('scene-zoom-right', [250, 130, 160, 62])    // vault + training yard + pagoda
  await sceneCrop('scene-zoom-center', [150, 148, 120, 60])   // ward + gate

  // a damaged array dims the ward (never removes it)
  await ev('(() => { const s = gameState.get(); s.sectWar.arrayDamagedUntil = Date.now() + 36e5; gameState._recalc(); gameState._notify() })()')
  await sleep(500)
  assert(await ev('[...document.querySelectorAll("#scene-legend .scene-chip")].some(n => /array damaged/i.test(n.textContent))'), 'a damaged array is called out in the legend')
  await shot('scene-array-damaged')

  // phone: the canvas still fits the narrow panel
  await emulate(390, 844)
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-base"]'); await sleep(600)
  assert(await ev('!!document.querySelector("#scene-canvas") && document.getElementById("scene-canvas").clientWidth > 100'), 'phone: the scene canvas is sized')
  assert(await ev('document.documentElement.scrollWidth <= innerWidth + 1'), 'phone: no horizontal overflow')
  assert(await painted(), 'phone: the scene has painted')
  await shot('scene-phone')
  await clearEmulation()
}
