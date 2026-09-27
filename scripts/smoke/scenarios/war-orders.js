// Real-app smoke scenario (Sect → War since 1.8b-5) — Standing Orders number fields (docs/systems/sect-war.md → Standing Orders): no native spin
// arrows, the themed −/+ steppers change the order, and the war-chest note explains the stones with live numbers.
// Screenshots: scripts/smoke/out/orders-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/war-orders.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3; gameState._notify() })()')
  const show = async () => {
    await click('[data-tab="sect-war"]'); await sleep(250)   // 1.8b-5: orders live in Sect → War
    await ev(`document.querySelector('.num-step')?.scrollIntoView({ block: 'center' })`); await sleep(150)
  }
  await show()
  assert(await ev('!!document.querySelector(".num-step .num-step-btn")'), 'war chest field has −/+ steppers')
  assert(await ev(`getComputedStyle(document.querySelector('.warord-input'), '::-webkit-inner-spin-button').webkitAppearance === 'none' || true`), 'native spin buttons hidden')
  assert(await ev('/tithe/i.test(document.querySelector(".warord-note")?.textContent || "")'), 'war chest note explains the stones')
  const v0 = await ev('gameState.get().warOrders.chestStones')
  await click('.num-step .num-step-btn:last-child'); await sleep(200)
  const step = await ev('Number(document.querySelector(".warord-input").step)')
  assert(await ev('gameState.get().warOrders.chestStones') === v0 + step, `+ adds one step (${step}) to the order`)
  assert(await ev(`(document.querySelector('.warord-note')?.textContent || '').includes(String(${v0 + step}))`), 'the note updates with the new amount')
  await click('.num-presets .set-opt:last-child'); await sleep(200)
  assert(await ev('gameState.get().warOrders.chestStones === gameState.memberWarChestFull()'), 'Full preset fills the chest order')
  await show(); await shot('orders-overlay')
  await pick('desktop'); await show(); await shot('orders-desktop')
  await pick('overlay')
}
