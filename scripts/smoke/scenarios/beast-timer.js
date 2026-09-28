// Real-app smoke scenario — a beast on expedition counts down live in Roam > Beasts (no re-render needed) and on its
// details page. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/beast-timer.js
module.exports = async ({ ev, click, wait, assert, sleep }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3
    s.beasts = [{ id: 'tb0', typeId: 'spirit_fox', name: 'Ember', level: 3, xp: 10, traits: [], expedition: { locationId: LOCATIONS[0].id, endsAt: Date.now() + 200e3 } }]
    s.derived.maxBeasts = 3; gameState._notify() })()`)
  await click('#tabs [data-group="adventure"]'); await click('[data-tab="beasts"]'); await sleep(500)
  const t = () => ev('document.querySelector("#tab-beasts [data-beast-left]")?.textContent')
  const a = await t(); await sleep(3200); const b = await t()
  assert(a && b && a !== b, `beast list timer ticks live (${a} -> ${b})`)
  await ev('document.querySelector("#tab-beasts .bdx-open")?.click()'); await sleep(500)
  const c = await ev('document.querySelector(".bdx-v [data-beast-left]")?.textContent'); await sleep(3200)
  const d = await ev('document.querySelector(".bdx-v [data-beast-left]")?.textContent')
  assert(c && d && c !== d, `details page timer ticks live (${c} -> ${d})`)
}
