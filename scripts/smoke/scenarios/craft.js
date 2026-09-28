// Real-app smoke scenario — Pack > Craft category sub-tabs (Pills/Elixirs/Weapons/Artifacts/Talismans) in Overlay and
// Expanded, with a late-game dev preset so every category has recipes. Screenshots: scripts/smoke/out/craft-*.png.
// Also checks that the sub-tab row doesn't overflow its box. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/craft.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()')
  await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3 })()`)
  const pick = async mode => { await click('#btn-layout'); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  for (const mode of ['overlay', 'expanded']) {
    if (mode !== 'overlay') await pick(mode)
    await ev(`document.querySelector('[data-tab="craft"]')?.click()`); await sleep(400)
    for (const cat of ['Pills', 'Elixirs', 'Weapons', 'Artifacts', 'Talismans']) {
      await ev(`[...document.querySelectorAll('.craft-subtab')].find(b => b.textContent.trim() === '${cat}')?.click()`); await sleep(300)
      const over = await ev(`(() => { const bar = document.querySelector('.craft-subtabs'); return bar ? bar.scrollWidth - bar.clientWidth : -1 })()`)
      assert(over <= 1, `${mode}/${cat}: sub-tab row fits (${over}px over)`)
      await shot(`craft-${mode}-${cat.toLowerCase()}`)
    }
  }
}
