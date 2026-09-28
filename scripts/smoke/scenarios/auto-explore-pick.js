// Real-app smoke scenario — Auto-Explore's location is chosen in the Mode panel (Idle button, top right), the Explore
// card only shows an inert "Auto" tag; and a companion's details page can Send on Expedition / Release.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/auto-explore-pick.js
module.exports = async ({ ev, click, wait, assert, sleep, shot }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3; s.automation.autoExplore = true
    s.beasts = [{ id: 'tb0', typeId: 'spirit_fox', name: 'Ember', level: 3, xp: 10, traits: [] }]
    s.derived.maxBeasts = 3; gameState._notify() })()`)
  await ev('document.getElementById("btn-mode").click()'); await sleep(400)
  const chips = await ev('document.querySelectorAll("#mode-auto .auto-loc-chips .pack-chip").length')
  assert(chips >= 2, `Mode panel lists a location picker (${chips} chips)`)
  await shot('auto-pick-mode')
  await ev('document.querySelectorAll("#mode-auto .auto-loc-chips .pack-chip")[1].click()'); await sleep(300)
  const id = await ev('gameState.get().automation.autoExploreLocationId')
  assert(!!id, "picking a chip stores the location")
  await ev('document.querySelector("#mode-overlay .overlay-close, #mode-close")?.click()')
  await click('#tabs [data-group="adventure"]'); await click('[data-tab="explore"]'); await sleep(400)
  const tags = await ev('document.querySelectorAll("#tab-explore .loc-auto").length')
  const btns = await ev('document.querySelectorAll("#tab-explore button.loc-auto").length')
  assert(tags === 1 && btns === 0, `exactly one inert Auto tag on Explore (${tags} tags, ${btns} buttons)`)
  await shot('auto-pick-explore')
  await click('[data-tab="beasts"]'); await sleep(400)
  await ev('document.querySelector("#tab-beasts .bdx-open")?.click()'); await sleep(500)
  await shot('auto-pick-beast-page')
  await ev('document.querySelector(".bdx-loc")?.click()'); await sleep(300)
  assert(await ev('!!gameState.get().beasts[0].expedition'), 'Send from the details page starts the beast expedition')
  assert(await ev('document.querySelector(".bdx-loc")?.disabled === true'), 'location buttons lock while it is away')
  await ev('document.querySelector(".bdx-release").click()'); await sleep(200)
  await ev('document.getElementById("confirm-yes").click()'); await sleep(300)
  assert(await ev('gameState.get().beasts.length === 0'), 'Release (confirmed) removes the beast and closes the page')
}
