// Real-app smoke scenario — 1.8b-2 Character view + breakdowns (docs/systems/ui-layout.md → "Breakdowns"): every
// [data-bd] number opens its "why" card (HUD + Character tiles), Esc / outside click closes it, the catch-up chip
// shows during ancestral catch-up, bloodline appears from Spirit Severing, and screenshots in every layout mode for
// the Visual Review Gate. Screenshots: scripts/smoke/out/char-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/character.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const open = () => ev('!document.getElementById("breakdown-overlay").classList.contains("hidden")')
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700)
  }
  const load = async preset => {
    await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('${preset}')) })()`)
    await ev('location.reload()'); await sleep(1500)
    await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
    await click('.cs-btn-play[data-slot="0"]')
    await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
    await sleep(400)
    await ev('document.getElementById("layout-tip")?.click()')
    await ev('(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3 })()')
  }

  // ── Mid-game: the Sect Elder, damaged + in catch-up so every row has something to say ──
  await load('member_elder')
  await ev(`(() => { const gs = gameState, s = gs.get(); s.realmIntegrity = 62; s.health = 71; s.karma = 38
    const c = gs._playerClan(); if (c) c.bestStageIndex = s.stageIndex + 3; s.qi = s.derived.qiCap * 0.95; gs._recalc(); gs._notify() })()`)
  await sleep(300)
  await click('[data-tab="stats"]'); await sleep(200)
  assert(await ev('document.querySelectorAll("#tab-stats [data-bd]").length') >= 6, 'Character view: ≥ 6 tappable tiles')
  assert(await ev('!document.getElementById("catchup-chip").classList.contains("hidden")'), 'catch-up chip shows on the HUD')
  await shot('char-overlay')

  for (const kind of ['qps', 'cap', 'bt', 'integrity', 'health', 'karma']) {
    await click(`#tab-stats [data-bd="${kind}"]`); await sleep(350)   // past the 0.14s bdIn fade
    const r = await ev('(() => { const p = document.querySelector(".bd-pop"); const b = p?.getBoundingClientRect(); return p ? { rows: p.querySelectorAll(".bd-row").length, total: p.querySelector(".bd-total-v")?.textContent, inside: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight + 1 } : null })()')
    assert(await open() && r && r.rows > 0 && r.total, `${kind}: card opens with ${r?.rows} rows, total ${r?.total}`)
    assert(r?.inside, `${kind}: card fits inside the window`)
    if (['qps', 'bt', 'health'].includes(kind)) await shot(`char-overlay-bd-${kind}`)
    await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await sleep(100)
    assert(!(await open()), `${kind}: Esc closes it`)
  }
  // HUD entry points
  for (const sel of ['#qi-rate', '#qi-numbers', '#integrity-block', '#health-block', '#bt-why', '#stones-block']) {
    await click(sel); await sleep(150)
    assert(await open(), `HUD ${sel} opens a breakdown`)
    await click('#breakdown-overlay'); await sleep(100)   // outside the card
    assert(!(await open()), `HUD ${sel}: outside click closes it`)
  }
  await click('#bt-why'); await sleep(350); await shot('char-overlay-hud-bt'); await click('#breakdown-overlay')
  // User 2026-09-27: stones card, no raw Integrity/Health numbers on the HUD, the ? is a segment of the Breakthrough card
  await sleep(100); await click('#stones-block'); await sleep(350)
  assert(/Spirit Stones/.test(await ev('document.querySelector("#breakdown-overlay .bd-tt")?.textContent || ""')), 'Stones readout opens the Spirit Stones card')
  await shot('char-overlay-hud-stones'); await click('#breakdown-overlay'); await sleep(100)
  assert(await ev('getComputedStyle(document.getElementById("integrity-numbers")).display === "none" && getComputedStyle(document.getElementById("health-numbers")).display === "none"'), 'HUD hides the Integrity/Health numbers')
  assert(await ev('(() => { const a = document.getElementById("btn-breakthrough").getBoundingClientRect(), b = document.getElementById("bt-why").getBoundingClientRect(); return Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1 && Math.abs(a.right - b.left) < 2 })()'), 'the ? sits flush inside the Breakthrough card (same height, no gap)')
  assert(await ev('(() => { const n = document.querySelector("#btn-breakthrough .act-name"); return n.scrollWidth <= n.clientWidth })()'), 'the Breakthrough label is not truncated beside the ?')
  await shot('char-overlay-hud-actions', { x: 0, y: 150, width: 300, height: 220 })

  await pick('expanded')
  await click('[data-tab="stats"]'); await sleep(200); await shot('char-expanded')
  await click('#tab-stats [data-bd="bt"]'); await sleep(350); await shot('char-expanded-bd-bt'); await click('#breakdown-overlay')
  await pick('desktop')
  await click('[data-tab="stats"]'); await sleep(200); await shot('char-desktop')
  await click('#tab-stats [data-bd="qps"]'); await sleep(350); await shot('char-desktop-bd-qps'); await click('#breakdown-overlay')
  await pick('banner'); await sleep(300)
  await click('#qi-rate'); await sleep(900)
  assert(await open(), 'banner: tapping the Qi rate opens the card (window peeks)')
  await shot('char-banner-bd')
  await click('#breakdown-overlay'); await sleep(900)
  await pick('overlay')

  // ── Late game: bloodline + the Ascension Trial card ──
  await load('pre_ascension')
  await click('[data-tab="stats"]'); await sleep(200)
  assert(await ev('!!document.querySelector("#tab-stats [data-bd=bloodline]")'), 'Spirit Severing+: bloodline tile shown')
  await shot('char-overlay-late')
  assert(await ev('[...document.querySelectorAll("#btn-breakthrough .act-name, #btn-breakthrough .act-sub")].every(n => n.scrollWidth <= n.clientWidth + 0.5)'), `late HUD: "${await ev('document.querySelector("#btn-breakthrough .act-name").textContent')}" label + sub-line not cut off`)
  await ev(`(() => { const s = gameState.get(); s.stageIndex = CULTIVATION_STAGES.length - 2; gameState._recalc(); gameState._notify() })()`)
  await click('#tab-stats [data-bd="bt"]'); await sleep(200)
  assert(/Ascension/.test(await ev('document.querySelector(".bd-pop .bd-title").textContent')), 'last mortal stage: BT card is the Ascension Trial')
  await shot('char-overlay-bd-ascension'); await click('#breakdown-overlay')
  await click('#tab-stats [data-bd="bloodline"]'); await sleep(350); await shot('char-overlay-bd-bloodline'); await click('#breakdown-overlay')
}
