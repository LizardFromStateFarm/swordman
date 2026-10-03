// Real-app smoke scenario — docs/systems/crafting.md → "Phase 44": healing pills + discovery-gated recipes.
// The Craft tab lists the known healing formulas and a locked "Unknown formula" card for the rest; a road encounter on
// Roam → Explore offers to teach a formula (Help / Rob / Leave); a healing pill is used from the Pack. Screens in
// Overlay / Expanded / Desktop / phone.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/recipes.js
module.exports = async ({ ev, click, wait, assert, sleep, shot, emulate, clearEmulation }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')

  // materials + a healing pill, and a wounded cultivator
  await ev(`(() => { const s = gameState.get(); s.inventory.spirit_herb = 40; s.inventory.beast_core = 20
    s.inventory.demon_essence = 10; s.inventory.pill_blood_nourish = 2; s.health = 35; gameState._notify() })()`)

  const openTab = async (group, tab) => {
    await click(`#tabs [data-group="${group}"]`); await sleep(200); await click(`[data-tab="${tab}"]`); await sleep(300)
  }
  const openCraft = async (sub) => {
    await openTab('pack', 'craft')
    if (sub) { await ev(`[...document.querySelectorAll("#tab-craft .craft-subtab")].find(b => b.textContent.includes(${JSON.stringify(sub)}))?.click()`); await sleep(250) }
  }

  await openCraft('Pills')
  assert(await ev('!!document.querySelector("#tab-craft .craft-note")'), 'Craft → Pills shows the formulas-known note')
  assert(await ev('document.querySelectorAll("#tab-craft .recipe-row.recipe-unknown").length >= 3'), 'locked "Unknown formula" cards for undiscovered pills')
  assert(await ev('/Blood-Nourishing Pill/.test(document.querySelector("#tab-craft").textContent)'), 'a known healing formula is listed')
  await shot('recipes-craft-overlay')

  for (const mode of ['expanded', 'desktop']) {
    await ev('document.getElementById("btn-layout").click()'); await sleep(150)
    await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700)
    await openCraft('Pills')
    await shot(`recipes-craft-${mode}`)
  }

  // back to Overlay (the primary mode) for the encounter + pack shots
  await ev('document.getElementById("btn-layout").click()'); await sleep(150)
  await ev(`document.querySelector('.layout-opt[data-layout="overlay"]').click()`); await sleep(700)

  // a road encounter carrying a formula — it renders above the Locations list, so the attention route lands on it
  await ev(`(() => { const s = gameState.get()
    s.family.encounters.push({ kind: 'recipe', recipeId: RECIPE_DISCOVERY.encounter[0], person: gameState._rollStranger('stranger'),
      place: 'Mortal Forest', text: 'sits by a dead fire nursing a burned arm, a pill-furnace at their side', year: Math.floor(s.world.year) })
    gameState._notify() })()`)
  await openTab('adventure', 'explore')
  assert(await ev('!!document.querySelector("#tab-explore [data-learnrecipe]") && !!document.querySelector("#tab-explore [data-robrecipe]")'), 'Explore: a formula encounter offers Help / Rob / Leave')
  assert(await ev('(() => { const b = document.querySelector("#tab-explore [data-learnrecipe]"); if (!b) return false; const r = b.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight })()'), 'Explore: the Help / Rob / Leave row is on screen without scrolling')
  await shot('recipes-encounter')
  await ev('document.querySelector("#tab-explore [data-learnrecipe]").click()'); await sleep(300)
  assert(await ev('gameState.recipeKnown(RECIPE_DISCOVERY.encounter[0])'), 'helping the stranger teaches the formula')

  // heal from the Pack
  await openTab('pack', 'pack')
  await ev(`[...document.querySelectorAll("#tab-pack .pack-item-row")].find(r => r.textContent.includes("Blood-Nourishing Pill") && !r.classList.contains("expanded"))?.querySelector(".pack-item-main").click()`)
  await sleep(300)
  assert(await ev('!!document.querySelector("#tab-pack [data-useheal]")'), 'Pack: a healing pill shows a Use button')
  await ev('document.querySelector("#tab-pack .pack-item-row.expanded")?.scrollIntoView({ block: "center" })'); await sleep(250)
  assert(await ev('(() => { const b = document.querySelector("#tab-pack [data-useheal]"); if (!b) return false; const r = b.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight })()'), 'Pack: the Use button is on screen')
  const hp0 = await ev('gameState.get().health')
  await ev('document.querySelector("#tab-pack [data-useheal]").click()'); await sleep(300)
  assert(await ev(`gameState.get().health > ${hp0}`), 'using the pill restores Health')
  await shot('recipes-pack-heal')

  await emulate(390, 844); await sleep(600)
  await openCraft('Pills')
  assert(await ev('document.documentElement.scrollWidth <= innerWidth'), 'phone: no horizontal overflow')
  await shot('recipes-phone')
  await clearEmulation()
}
