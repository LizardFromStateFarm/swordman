// Real-app smoke scenario — Pack → Items selling (task 1.11, backpack.md → "Selling"): each row shows its per-unit price,
// the expanded row has Sell 1 / Sell 10 / All but 1 / Sell all with the stones each pays, a cheap sell is instant, a
// precious one asks first, an equipped item says "Unequip it first". Screens in Overlay / Expanded / Desktop / phone.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/sell.js
module.exports = async ({ ev, click, wait, assert, sleep, shot, emulate, clearEmulation }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.inventory.spirit_herb = 42; s.inventory.void_crystal = 5
    s.inventory.weapon_spirit_sword = 1; gameState.equipItem('weapon_spirit_sword'); gameState._notify() })()`)
  const openPack = async (item) => {
    await click('#tabs [data-group="pack"]'); await sleep(200); await click('[data-tab="pack"]'); await sleep(300)
    await ev(`[...document.querySelectorAll("#tab-pack .pack-item-row")].find(r => r.textContent.includes(${JSON.stringify(item)}) && !r.classList.contains("expanded"))?.querySelector(".pack-item-main").click()`)
    await sleep(300)
  }
  await openPack('Spirit Herb')
  assert(await ev('document.querySelectorAll("#tab-pack .pack-item-val").length >= 3'), 'rows show a per-unit price')
  const labels = await ev('[...document.querySelectorAll("#tab-pack .pack-btn-sell")].map(b => b.textContent.trim())')
  assert(labels.length === 4, `42 herbs: Sell 1 / Sell 10 / All but 1 / Sell all (${labels.join(' | ')})`)
  for (const mode of ['overlay', 'expanded', 'desktop']) {
    await ev('document.getElementById("btn-layout").click()'); await sleep(150)
    await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700)
    await openPack('Spirit Herb')
    assert(await ev('(() => { const p = document.getElementById("tab-pack").getBoundingClientRect(); const bs = [...document.querySelectorAll("#tab-pack .pack-btn-sell")]; return bs.length > 0 && bs.every(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= p.right + 0.5 }) })()'), `${mode}: the sell buttons fit`)
    await ev(`document.querySelector("#tab-pack .pack-item-row.expanded")?.scrollIntoView({ block: "center" })`); await sleep(200)
    await shot(`sell-${mode}`)
  }
  const st0 = await ev('gameState.get().spiritStones')
  await ev('document.querySelector("#tab-pack .pack-btn-sell[data-n=\\"10\\"]").click()'); await sleep(300)
  assert(await ev(`gameState.get().inventory.spirit_herb === 32 && gameState.get().spiritStones === ${st0} + 10 * gameState.itemValue("spirit_herb")`), 'Sell 10 herbs pays at once (cheap: no confirm)')
  await openPack('Void Crystal')
  await ev('document.querySelector("#tab-pack .pack-btn-sell[data-n=\\"1\\"]").click()'); await sleep(300)
  assert(await ev('!document.getElementById("confirm-overlay").classList.contains("hidden")'), 'selling a rare item asks first')
  await shot('sell-confirm')
  await click('#confirm-yes'); await sleep(300)
  assert(await ev('gameState.get().inventory.void_crystal === 4'), 'confirming sells it')
  await ev('(() => { const s = gameState.get(); delete s.inventory.weapon_spirit_sword; s.equipped.weapon = "weapon_spirit_sword"; gameState._notify() })()'); await sleep(200)
  await openPack('Spirit Sword')
  assert(await ev('/Unequip it in the Craft tab to discard or sell/.test(document.querySelector("#tab-pack .pack-item-row.expanded")?.textContent || "")'), 'an equipped item says Unequip it first')
  await shot('sell-equipped')
  await emulate(390, 844); await sleep(600)
  await openPack('Spirit Herb')
  assert(await ev('document.documentElement.scrollWidth <= innerWidth'), 'phone: no horizontal overflow')
  await ev(`document.querySelector("#tab-pack .pack-item-row.expanded")?.scrollIntoView({ block: "center" })`); await sleep(200)
  await shot("sell-phone")
  await clearEmulation()
}
