// Real-app smoke scenario: A4-2 ink beasts (docs/systems/art-engine.md → "Beasts"). Puts one encounter + one companion
// of every beast type in Roam → Beasts, checks that Sprite art = Ink gives each an animated ink portrait (pooled: a
// re-render reuses the canvas), that Classic falls back to the ASCII sprite with every frame, and captures the view in
// Overlay / Expanded / phone plus a beast sheet (idle + breakthrough glow) for review.
// Screenshots: scripts/smoke/out/ink-beasts-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-beasts.js
const fs = require('fs'), path = require('path')
const OUT = path.join(__dirname, '..', 'out')

module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800)
  }
  const savePng = (name, dataUrl) => {
    const f = path.join(OUT, `${name}.png`)
    fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('     still', f)
  }

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  const types = await ev('BEAST_TYPES.map(b => b.id)')
  await ev(`(() => { const gs = gameState, s = gs.get(); s.sectWar.nextWarAt = Date.now() + 3600e3
    s.beastEncounters = ${JSON.stringify(types)}.map((t, i) => ({ id: 'smoke_enc_' + i, typeId: t, traits: Object.keys(BEAST_TRAITS).slice(i, i + 2), seenAt: Date.now() }))
    s.beasts = ${JSON.stringify(types)}.map((t, i) => ({ id: 'smoke_beast_' + i, typeId: t, name: ['Ember', 'Stormcall', 'Nightfang'][i], level: 2 + i * 3, xp: 40, traits: Object.keys(BEAST_TRAITS).slice(i + 1, i + 3), expedition: null }))
    s.derived.maxBeasts = Math.max(3, s.derived.maxBeasts || 3)
    gs.setSetting('artStyle', 'ink'); gs._notify() })()`)
  await sleep(300)
  await click('#tabs [data-group="adventure"]'); await sleep(250)
  await click('[data-tab="beasts"]')
  await sleep(600)

  const n = await ev('document.querySelectorAll("#tab-beasts .beast-portrait canvas.bp-canvas").length')
  assert(n === types.length * 2, `every encounter + companion has an ink portrait (${n} / ${types.length * 2})`)
  const first = await ev('(window._bp0 = document.querySelector("#tab-beasts .beast-portrait canvas"), !!window._bp0)')
  await ev('gameState._notify()'); await sleep(200)
  assert(await ev('document.querySelector("#tab-beasts .beast-portrait canvas") === window._bp0'), 'a re-render reuses the pooled canvas (no cache rebuild)')
  assert(await ev('BeastPortraits.pool.size') === types.length * 2, 'pool holds exactly the visible portraits')
  const perf = await ev('Math.max(...[...BeastPortraits.pool.values()].map(p => p.ink.perf(30)))')
  console.log(`     portrait frame ${perf.toFixed(2)} ms`)
  assert(perf < 3, `a portrait frame draws in < 3 ms (${perf.toFixed(2)} ms)`)

  // freeze every portrait on one moment for the screenshots
  await ev('[...BeastPortraits.pool.values()].forEach((p, i) => p.ink.freeze(2.3 + i * 0.37, 0))')
  await shot('ink-beasts-overlay')
  await pick('expanded'); await ev('[...BeastPortraits.pool.values()].forEach((p, i) => p.ink.freeze(2.3 + i * 0.37, 0))'); await sleep(200)
  await shot('ink-beasts-expanded')
  await pick('overlay')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500)
  await ev('[...BeastPortraits.pool.values()].forEach((p, i) => p.ink.freeze(2.3 + i * 0.37, 0))'); await sleep(200)
  await shot('ink-beasts-phone')
  await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(300)

  // Beast sheet: each beast at 8× from the engine, at two moments of its idle motion
  const sheet = await ev(`(() => {
    const types = ${JSON.stringify(types)}, W = 864, H = 624
    const cv = document.createElement('canvas'); cv.width = W * types.length; cv.height = (H + 40) * 2
    const g = cv.getContext('2d'); g.fillStyle = '#0A0612'; g.fillRect(0, 0, cv.width, cv.height)
    g.font = '26px Georgia, serif'; g.fillStyle = '#E8D9B0'; g.textAlign = 'center'
    types.forEach((t, i) => {
      const r = new InkRenderer(document.createElement('canvas'), { table: INK_BEASTS })
      r.setStageColor(INK_BEASTS[t].glow); r.base = InkRenderer.resolve(t, INK_BEASTS); r.art = r._effective()
      for (const k of [0, 1]) {                                 // two moments: the motion (tail / wings / lightning) differs
        g.drawImage(r.stillCanvas(108, 78, 8, 2.3 + i * 0.4 + k * 1.1, {}), i * W, k * (H + 40) + 40)
        g.fillText(BEAST_TYPES.find(b => b.spriteState === t).name + (k ? ' (a moment later)' : ''), i * W + W / 2, k * (H + 40) + 30)
      }
    })
    return cv.toDataURL('image/png')
  })()`)
  savePng('ink-beasts-sheet', sheet)

  // Classic art: ASCII sprites with every frame, no canvases left running
  await ev('[...BeastPortraits.pool.values()].forEach(p => p.ink.resume()); gameState.setSetting("artStyle", "classic")'); await sleep(400)
  assert(await ev('document.querySelectorAll("#tab-beasts .beast-portrait canvas").length === 0 && document.querySelectorAll("#tab-beasts .beast-portrait .bp-frame").length > 0'),
    'Sprite art = Classic shows the ASCII sprites (all frames)')
  assert(await ev('BeastPortraits.pool.size === 0'), 'Classic stops and drops every ink portrait')
  await shot('ink-beasts-classic')
}
