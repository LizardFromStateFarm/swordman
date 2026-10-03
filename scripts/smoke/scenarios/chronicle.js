// Real-app smoke scenario — Phase 28 / task 4.6 (docs/systems/living-world.md → "4.6 as built"): 世 World → Chronicle,
// the merged world feed, and "The world by realm". A founder's world is run ~150 game years on the light sim + the
// replacement controller, then an old monster is forced to wake (so there is notable news), and: the attention item,
// World → Chronicle (year groups, the band strip with its target ticks, filter chips), a name in a line opens the person
// card, the Notable + Sects filters, the Sects ledger's "The world's chronicle" link landing on the Sects filter, the news
// cleared once seen. Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/chronicle-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/chronicle.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // A century and a half of the world, then an old monster wakes and takes a seat (notable news).
  await ev(`(() => { const s = gameState.get(), w = s.world, y0 = Math.floor(w.year)
    for (let y = y0 + 1; y <= y0 + 150; y++) { w.year = y + 0.01; s.age += 1; gameState._tickWorldSects(); gameState._lifeStep(y, true) }
    w.livesYear = y0 + 150
    gameState.noteChronicleSeen()
    const keep = NPC_WORLD.hiddenFates; NPC_WORLD.hiddenFates = { seize: 1 }
    const band = gameState.worldBandsInfo().find(b => b.id === 'ss')
    gameState._hiddenMaster(band, y0 + 150, wsRng('smoke|hidden'))
    NPC_WORLD.hiddenFates = keep
    gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  assert(await ev('gameState.chronicleNews() > 0'), 'an old monster waking is notable news')
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "chronicle-news" && i.view === "chronicle")'), 'the attention list points at World → Chronicle')
  assert(await ev('document.querySelector(\'#tabs [data-group="log"] .tab-badge\').classList.contains("dot")'), 'the 世 World tab shows its dot')

  const cardOpen = () => ev('!document.getElementById("person-overlay").classList.contains("hidden") && !!document.querySelector("#person-overlay .pc-pop")')
  const noHScroll = () => ev('(() => { const el = document.getElementById("tab-chronicle"); return el.scrollWidth <= el.clientWidth + 1 })()')

  const pass = async tag => {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="chronicle"]'); await sleep(350)
    await ev('ChronicleView.show("all"); ChronicleView.render(gameState.get())'); await sleep(150)
    assert(await ev('!!document.querySelector("#tab-chronicle .cls-title") && document.querySelectorAll("#tab-chronicle .chr-year").length >= 3'), `${tag}: World → Chronicle draws, grouped by year`)
    assert(await ev('document.querySelectorAll("#tab-chronicle .chr-band").length === NPC_WORLD.bands.length && document.querySelectorAll("#tab-chronicle .chr-tick").length === NPC_WORLD.bands.length'), `${tag}: the world by realm, a target tick per band`)
    assert(await ev('document.querySelectorAll("#tab-chronicle .chr-row.notable").length >= 1 && /breaks seclusion/.test(document.getElementById("tab-chronicle").textContent)'), `${tag}: the waking is a notable line`)
    assert(await ev('gameState.chronicleNews() === 0'), `${tag}: seeing the chronicle clears the news`)
    assert(await noHScroll(), `${tag}: no sideways scroll`)
    await shot(`chronicle-${tag}-all`)
    if (tag !== 'desktop') { await ev('document.querySelector("#tab-chronicle .chr-feed").scrollIntoView({ block: "start" })'); await sleep(150); await shot(`chronicle-${tag}-feed`); await ev('document.getElementById("tab-chronicle").scrollTop = 0'); await sleep(100) }
    await click('#tab-chronicle .chr-row.k-hidden .pc-link'); await sleep(250)
    assert(await cardOpen() && /Old monster|Sect master/.test(await ev('document.querySelector(".pc-pop").textContent')), `${tag}: a name in a line opens that person's card`)
    await ev('PersonCard.close()'); await sleep(100)
    await click('#tab-chronicle [data-chr-f="notable"]'); await sleep(200)
    assert(await ev('[...document.querySelectorAll("#tab-chronicle .chr-row")].every(r => r.classList.contains("notable"))'), `${tag}: the Notable filter shows only notable lines`)
    if (tag === 'desktop' || tag === 'overlay') await shot(`chronicle-${tag}-notable`)
    await click('#tab-chronicle [data-chr-f="all"]'); await sleep(150)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  // The Sects ledger links into the Chronicle on its Sects filter
  await click('[data-tab="world"]'); await sleep(300)
  assert(await ev('!!document.querySelector("#tab-world .ws-chron-link")'), 'the Sects ledger shows the latest chronicle line as a link')
  await shot('chronicle-desktop-ledger-link')
  await click('#tab-world .ws-chron-link'); await sleep(350)
  assert(await ev('document.getElementById("tab-chronicle").offsetParent !== null && ChronicleView.filter === "sects" && document.querySelector("#tab-chronicle .chr-chip.on").dataset.chrF === "sects"'), 'the link lands on World → Chronicle, Sects filter')
  assert(await ev('[...document.querySelectorAll("#tab-chronicle .chr-row")].every(r => r.classList.contains("k-sect"))'), 'only sect lines under Sects')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
