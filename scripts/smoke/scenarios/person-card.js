// Real-app smoke scenario — Phase 28 / task 4.2 (docs/systems/living-world.md §3): the person card. A founder taps a world
// sect master's name on the sect's page (World → Sects), an elder, a disciple in Sect → Disciples, an arena duelist and
// their own child (the kin link steps to a parent, Back returns). Overlay / Expanded / Desktop / phone. Asserts the card
// opens, stays inside the window, names the sect + "what they think of you", and the "go" button lands on the sect page.
// Screenshots: scripts/smoke/out/person-card-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/person-card.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  // A married founder with a grown child, so the card has kin to step through.
  await ev(`(() => { const s = gameState.get(), f = s.family
    if (!f.spouse) gameState._wed(gameState._rollStranger('suitor'), 60)
    if (f.spouse && !f.children.length) { const c = gameState._makeChild(f.spouse); c.bornYear -= 30; c.stageIndex = 9 }
    gameState._syncPersons(); gameState._recalc(); gameState._notify() })()`)

  const inWindow = () => ev(`(() => { const p = document.querySelector('#person-overlay .pc-pop'); if (!p) return false
    const r = p.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 })()`)
  const cardOpen = () => ev('!document.getElementById("person-overlay").classList.contains("hidden") && !!document.querySelector("#person-overlay .pc-pop")')
  const close = async () => { await ev('PersonCard.close()'); await sleep(100) }

  const pass = async tag => {
    // World → Sects → a sect's page → its master's name
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(250)
    if (await ev('!!document.querySelector("#tab-world [data-back]")')) { await click('#tab-world [data-back]'); await sleep(200) }
    await ev(`WorldView.show(gameState.get().world.sects.list.find(r => r.kind === 'joinable' && r.tier >= 3)?.id || gameState.get().world.sects.list[0].id); WorldView.render(gameState.get())`); await sleep(250)
    assert(await ev('!!document.querySelector("#tab-world .sdx-hero .pc-link[data-pid]")'), `${tag}: the sect page's master is a tappable name`)
    assert(await ev('document.querySelectorAll("#tab-world .pc-people .pc-link").length >= 1'), `${tag}: the sect page lists its elders by name`)
    await click('#tab-world .sdx-hero .fc-sub .pc-link'); await sleep(250)
    assert(await cardOpen(), `${tag}: tapping the master opens their card`)
    assert(await ev('/Sect master/i.test(document.querySelector(".pc-pop .pc-sub").textContent) && /What they think of you/i.test(document.querySelector(".pc-pop").textContent)'), `${tag}: the card names their role + sect and what they think of you`)
    assert(await inWindow(), `${tag}: the card stays inside the window`)
    await shot(`person-card-${tag}-master`)
    await close()
    // an elder
    await click('#tab-world .pc-people .pc-link'); await sleep(200)
    assert(await cardOpen() && /Sect elder/i.test(await ev('document.querySelector(".pc-pop .pc-sub").textContent')), `${tag}: an elder's card`)
    await close()
    // a disciple in Sect → Disciples
    await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-disciples"]'); await sleep(300)
    if (await ev('!!document.querySelector("#tab-sect-disciples .sv-disc-n .pc-link")')) {
      await click('#tab-sect-disciples .sv-disc-n .pc-link'); await sleep(250)
      assert(await cardOpen() && /Disciple/i.test(await ev('document.querySelector(".pc-pop .pc-sub").textContent')), `${tag}: a disciple's card`)
      assert(await inWindow(), `${tag}: the disciple card stays inside the window`)
      await shot(`person-card-${tag}-disciple`)
      await close()
    } else assert(false, `${tag}: Sect → Disciples shows tappable disciple names`)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')

  // The child's card: who they are to you, kin to step through, Back, and the way to Kin → Family
  const kid = await ev('gameState.get().family.children[0]?.id || null')
  if (kid) {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(200)
    await ev(`(() => { const b = document.createElement('button'); b.className = 'pc-link'; b.dataset.pid = '${kid}'; b.id = 'smoke-kid'; b.textContent = 'kid'; document.getElementById('tab-world').prepend(b) })()`)
    await click('#smoke-kid'); await sleep(250)
    assert(/Your child/.test(await ev('document.querySelector(".pc-pop").textContent')), 'desktop: a child\'s card says who they are to you')
    await shot('person-card-desktop-child')
    const kinLinks = await ev('document.querySelectorAll(".pc-pop .pc-kin .pc-link").length')
    if (kinLinks) {
      await click('.pc-pop .pc-kin .pc-link'); await sleep(200)
      assert(await ev('!!document.querySelector(".pc-pop [data-pc-back]")'), 'desktop: stepping to kin offers Back')
      await click('.pc-pop [data-pc-back]'); await sleep(200)
      assert(/Your child/.test(await ev('document.querySelector(".pc-pop").textContent')), 'desktop: Back returns to the child')
    }
    await click('.pc-pop [data-pc-go]'); await sleep(300)
    assert(await ev('document.getElementById("person-overlay").classList.contains("hidden") && !document.getElementById("tab-family").classList.contains("hidden")'), 'desktop: the go button lands on Kin → Family')
  } else assert(false, 'the founder has a child to open')

  // Arena duelist names
  await ev('gameState.get().stageIndex = Math.max(gameState.get().stageIndex, 14); gameState._recalc(); gameState._notify()')
  await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="arena"]'); await sleep(300)
  if (await ev('!!document.querySelector("#tab-arena .ar-pn .pc-link")')) {
    await click('#tab-arena .ar-pn .pc-link'); await sleep(250)
    assert(await cardOpen() && /duelist/i.test(await ev('document.querySelector(".pc-pop .pc-sub").textContent')), 'desktop: an arena duelist\'s card')
    await shot('person-card-desktop-duelist')
    await close()
  } else assert(false, 'Roam → Arena shows tappable duelist names')

  // Phone
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  // the go button: a sect master's card → the sect's page
  await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="world"]'); await sleep(250)
  await click('#tab-world .sdx-hero .fc-sub .pc-link'); await sleep(250)
  await click('.pc-pop [data-pc-go]'); await sleep(300)
  assert(await ev('!!document.querySelector("#tab-world .sdx-hero")'), 'phone: the card\'s sect button opens the sect\'s page')
  await clearEmulation()
}
