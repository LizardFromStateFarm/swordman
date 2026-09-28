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
  // a legendary, a rare-colour variant and a common wild; three companions across the tiers
  const encs = [['golden_dragon'], ['qilin', 'crimson'], ['spirit_fox']], comps = [['thunder_eagle', null, 'Stormcall'], ['white_tiger', 'golden', 'Aurum'], ['void_hound', null, 'Nightfang']]
  const types = encs.map(e => e[0])
  await ev(`(() => { const gs = gameState, s = gs.get(); s.sectWar.nextWarAt = Date.now() + 3600e3
    s.beastEncounters = ${JSON.stringify(encs)}.map(([t, v], i) => ({ id: 'smoke_enc_' + i, typeId: t, ...(v ? { variant: v } : {}), traits: Object.keys(BEAST_TRAITS).slice(i, i + 2), seenAt: Date.now() }))
    s.beasts = ${JSON.stringify(comps)}.map(([t, v, name], i) => ({ id: 'smoke_beast_' + i, typeId: t, ...(v ? { variant: v } : {}), name, level: 2 + i * 3, xp: 40, traits: Object.keys(BEAST_TRAITS).slice(i + 1, i + 3), expedition: null }))
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

  // Beast details page: a portrait / name opens it (large ink portrait, lore, stats, traits, Tame + lock reason)
  await ev('[...BeastPortraits.pool.values()].forEach(p => p.ink.resume())')
  const openDetail = async key => {
    await ev(`document.querySelector('#tab-beasts .beast-portrait[data-bp-key="${key}"]').click()`); await sleep(500)
    await ev('BeastDetail.ink && BeastDetail.ink.freeze(2.6, 0)'); await sleep(150)
  }
  for (const [mode, phone] of [['expanded', false], ['overlay', false], ['overlay', true]]) {
    await pick(mode)
    if (phone) { await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    const tag = phone ? 'phone' : mode
    await openDetail('enc:smoke_enc_0')   // the legendary golden dragon
    assert(await ev('!document.getElementById("beast-overlay").classList.contains("hidden") && !!document.querySelector("#beast-body .bdx-canvas")'),
      `${tag}: clicking an encounter portrait opens the details page with a large ink portrait`)
    assert(await ev('!!document.querySelector("#beast-body .bdx-tame") && !!document.querySelector("#beast-body .bdx-why")'), `${tag}: Tame shows its lock reason`)
    assert(await ev('document.getElementById("beast-box").dataset.tier === "legendary" && /Legendary/.test(document.getElementById("beast-body").textContent)'), `${tag}: a legendary shows its tier`)
    await shot(`beast-detail-enc-${tag}`)
    await ev('document.getElementById("beast-close").click()'); await sleep(200)
    await openDetail('beast:smoke_beast_1')
    assert(await ev('/Lv\\.\\d/.test(document.getElementById("beast-body").textContent)'), `${tag}: a companion's page shows its level`)
    await shot(`beast-detail-beast-${tag}`)
    await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await sleep(200)
    assert(await ev('document.getElementById("beast-overlay").classList.contains("hidden") && !BeastDetail.ink'), `${tag}: Esc closes it and stops the portrait`)
    if (phone) { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(300) }
  }
  await ev('[...BeastPortraits.pool.values()].forEach((p, i) => p.ink.freeze(2.3 + i * 0.37, 0))')

  // Classic art: beasts with a classic ASCII sprite show it (every frame); newer beasts without one keep their ink portrait
  await ev('[...BeastPortraits.pool.values()].forEach(p => p.ink.resume()); gameState.setSetting("artStyle", "classic")'); await sleep(400)
  assert(await ev('!!document.querySelector("#tab-beasts .beast-portrait[data-bp-key=\'enc:smoke_enc_2\'] .bp-frame") && !document.querySelector("#tab-beasts .beast-portrait[data-bp-key=\'enc:smoke_enc_2\'] canvas")'),
    'Sprite art = Classic shows the ASCII sprite for a beast that has one (Spirit Fox)')
  assert(await ev('!!document.querySelector("#tab-beasts .beast-portrait[data-bp-key=\'enc:smoke_enc_0\'] canvas")'), 'a beast with no ASCII sprite keeps its ink portrait under Classic')
  await shot('ink-beasts-classic')
}
