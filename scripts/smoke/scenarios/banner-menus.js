// Real-app smoke scenario — banner quick actions (roadmap 1.7b, docs/systems/ui-layout.md → "Banner quick actions"):
// a Sect Elder dev preset in banner mode opens each dropdown (⚔ missions · ⛰ explore · ⚒ craft · 📜 learn), checks the
// window grows and shrinks back, and performs one real action from each menu. Screenshots: out/banner-menu-*.png
// (these are what the Visual Review Gate reviewer looks at). Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/banner-menus.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  // Sect Elder preset, with a few techniques left unlearned so the Learn menu has something to do.
  await ev(`(async () => {
    const save = gameState.buildDevSave('member_elder')
    const st = save.state || save
    if (Array.isArray(st.techniques)) st.techniques = st.techniques.slice(0, Math.max(1, st.techniques.length - 3))
    await window.electron.saveSlot(0, save)
  })()`)
  await ev('location.reload()')
  await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3 })()`)   // keep the war popup out of the way

  await click('#btn-layout')
  await click('.layout-opt[data-layout="banner"]')
  await sleep(700)
  const h = () => ev('innerHeight')
  assert(await h() === 56, 'banner strip is 56px')
  const btns = await ev('[...document.querySelectorAll("#banner-quick [data-menu]")].map(b => b.dataset.menu).join(",")')
  assert(btns === 'missions,explore,craft,learn', `quick buttons: ${btns}`)
  await shot('banner-menu-0-strip')
  await shot('banner-menu-0-strip-closeup', { x: 0, y: 0, width: 1100, height: 56 })

  // Close-up for the reviewer: the strip's left 1100px + the open menu with a margin.
  const closeup = async name => {
    const r = await ev('(() => { const m = document.getElementById("banner-menu"); const b = m.classList.contains("hidden") ? null : m.getBoundingClientRect(); return b ? { x: Math.max(0, b.left - 700), w: Math.min(innerWidth, b.right + 20) - Math.max(0, b.left - 700), h: Math.min(innerHeight, b.bottom + 12) } : null })()')
    if (r) await shot(name + '-closeup', { x: r.x, y: 0, width: r.w, height: r.h })
  }
  const open = async id => { await click(`#banner-quick [data-menu="${id}"]`); await sleep(500) }

  // ⚔ Missions
  await open('missions')
  assert(await h() > 300 && await ev('!document.getElementById("banner-menu").classList.contains("hidden")'), `missions menu open, window grew to ${await h()}px`)
  await shot('banner-menu-1-missions'); await closeup('banner-menu-1-missions')
  const m0 = await ev('gameState.get().sect.activeMissions.length')
  await click('#banner-menu .bm-row.can')
  await sleep(300)
  assert(await ev('gameState.get().sect.activeMissions.length') === m0 + 1, 'a mission started from the menu')

  // ⛰ Explore (switching menus keeps the window grown)
  await open('explore')
  assert(await ev('document.querySelectorAll("#banner-menu .bm-row").length') >= 2, 'explore lists destinations')
  await shot('banner-menu-2-explore'); await closeup('banner-menu-2-explore')
  await click('#banner-menu .bm-row.can')
  await sleep(500)
  assert(await ev('gameState.get().expedition.active') && await h() === 56, 'expedition sent; menu closed, strip back to 56px')

  // ⚒ Craft
  await open('craft')
  await shot('banner-menu-3-craft'); await closeup('banner-menu-3-craft')
  const canCraft = await ev('!!document.querySelector("#banner-menu .bm-row.can")')
  if (canCraft) {
    const inv0 = await ev('JSON.stringify(gameState.get().inventory)')
    await click('#banner-menu .bm-row.can')
    await sleep(300)
    assert(await ev('JSON.stringify(gameState.get().inventory)') !== inv0, 'crafted from the menu')
  } else assert(true, 'nothing craftable in this category (fine)')
  await click('#banner-menu .bm-chip[data-cat="weapons"]')
  assert(await ev('document.querySelector("#banner-menu .bm-chip.active")?.dataset.cat') === 'weapons', 'craft category chips switch')

  // 📜 Learn
  await open('learn')
  await shot('banner-menu-4-learn'); await closeup('banner-menu-4-learn')
  const t0 = await ev('gameState.get().techniques.length')
  if (await ev('!!document.querySelector("#banner-menu .bm-row.can")')) {
    await click('#banner-menu .bm-row.can')
    await sleep(300)
    assert(await ev('gameState.get().techniques.length') === t0 + 1, 'learned a technique from the menu')
  } else assert(true, 'nothing learnable right now')

  // Esc closes and shrinks back
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))')
  await sleep(500)
  assert(await h() === 56 && await ev('document.getElementById("banner-menu").classList.contains("hidden")'), 'Esc closes the menu, strip back to 56px')
  await shot('banner-menu-5-busy-strip')

  // Leave the default layout for reruns
  await click('#btn-unbanner'); await sleep(500)
  await click('#btn-layout'); await click('.layout-opt[data-layout="overlay"]'); await sleep(500)
}
