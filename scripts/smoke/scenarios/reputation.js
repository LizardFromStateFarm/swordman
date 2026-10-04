// Real-app smoke scenario — Phase 28 / task 4.10 (docs/systems/living-world.md → "4.10 as built"): memory, reputation
// and the person card's deeds. A founder's world: one classmate who loves you (memories with their +/−, one from a past
// life), one who hates you, a pupil 3+ stages below. Then, in each layout: the person card's "What you can do" (open
// deeds first, locked ones with their reasons, the first-time hint), the "Why" list behind their feeling, a gift (the
// toast, the real-time countdown), swearing brotherhood (the Sworn chip, World → People → Friends), the duel's confirm,
// the Character tab's "Your name" tile and its breakdown card. Overlay / Expanded / Desktop / phone.
// Screenshots: scripts/smoke/out/rep-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/reputation.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  const setup = `(() => { const s = gameState.get(), w = s.world, life = gameState._lifeNo()
    s.spiritStones = 99999; s.health = s.derived?.healthMax || 100; s.qi = s.derived.qiCap
    const c = w.cohorts[life], alive = c.ids.map(id => w.persons[id]).filter(p => p.alive !== false && !p.sectRole)
    const friend = alive[0], foe = alive[1], pupil = alive[2]
    friend.rel = 84; friend.morality = 40; friend.spouseIds = []; friend.sworn = null; friend.actAt = 0
    friend.mem = [{ y: 1, k: 'talked', text: 'We shared a pot of tea in the snow.', d: 10, life: life - 1 },
      { y: 2, k: 'helped', text: 'You pulled me out of the Ashen Gorge when I was dying.', d: 40, life },
      { y: 3, k: 'teamup', text: 'We cleared the Mistwood together.', d: 20, life }]
    foe.rel = -62; foe.actAt = 0; foe.personality = 'arrogant'
    foe.mem = [{ y: 4, k: 'robbed', text: 'You robbed me as I lay bleeding at the Red Ford.', d: -70, life }]
    foe.feud = { pid: s.self.id, why: 'you robbed them as they lay bleeding', y: Math.floor(w.year) }
    pupil.stageIndex = Math.max(0, s.stageIndex - 5); pupil.rel = 35; pupil.actAt = 0
    w.actHint = false; PersonCard.whyOpen = {}
    w.rep.h = 34; w.rep.i = 9
    w.rep.log = [{ y: 3, k: 'helped', h: 6, i: 0, pid: friend.id, n: Persons.fullName(friend) }, { y: 4, k: 'robbed', h: 0, i: 8, pid: foe.id, n: Persons.fullName(foe) }]
    window.__rp = { friend: friend.id, foe: foe.id, pupil: pupil.id }
    gameState._recalc(); gameState._notify() })()`

  const noHScroll = async sel => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return true; if (el.scrollWidth <= el.clientWidth + 1) return true; const R = el.getBoundingClientRect().right; return [...el.querySelectorAll("*")].filter(x => x.getBoundingClientRect().right > R + 1).map(x => x.tagName + "." + x.className).slice(0, 4).join(" | ") })()`); if (r !== true) console.log('  overflow:', r); return r === true }
  const openPeople = async pid => {
    await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="people"]'); await sleep(350)
    await ev(`PeopleView.trail = []; PeopleView.filter = "all"; PeopleView.show(${JSON.stringify(pid)})`); await sleep(250)
  }

  const pass = async tag => {
    await ev(setup); await sleep(200)
    await openPeople(await ev('window.__rp.friend'))
    assert(await ev('!!document.querySelector("#tab-people .pc-inline .pc-acts")'), `${tag}: the card has "What you can do"`)
    assert(await ev('document.querySelectorAll("#tab-people .pc-inline .pc-act-grid:not(.pc-locked) .pc-actb").length >= 4'), `${tag}: open deeds come first`)
    assert(await ev('[...document.querySelectorAll("#tab-people .pc-inline .pc-locked .pc-actb")].every(b => b.querySelector(".fa-e").textContent.length > 4)'), `${tag}: every locked deed says why`)
    assert(await ev('!!document.querySelector("#tab-people .pc-inline .pc-act-hint")'), `${tag}: the first-time hint shows`)
    await click('#tab-people .pc-inline [data-pc-why]'); await sleep(200)
    assert(await ev('document.querySelectorAll("#tab-people .pc-inline .pc-why-r").length >= 4 && /past life/i.test(document.querySelector("#tab-people .pc-inline .pc-why-list").textContent)'), `${tag}: "Why" lists each memory with its +/−, a past life's marked`)
    assert(await noHScroll('#tab-people'), `${tag}: no sideways scroll with the deeds`)
    await ev('document.querySelector("#tab-people .pc-inline .pc-acts")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`rep-${tag}-card`)
    // swear brotherhood (forced accept)
    await ev('globalThis.__mr = Math.random; Math.random = () => 0')
    await click('#tab-people .pc-inline [data-pc-act="swear"]'); await sleep(250)
    await ev('Math.random = globalThis.__mr')
    assert(await ev('gameState.get().world.persons[window.__rp.friend].sworn === gameState.get().self.id'), `${tag}: they swear brotherhood`)
    assert(await ev('!!document.querySelector("#tab-people .pc-inline .pc-cd b") && /\\d:\\d\\d/.test(document.querySelector("#tab-people .pc-inline .pc-cd b").textContent)'), `${tag}: a real-time countdown (m:ss), never game years`)
    assert(await ev('/Sworn sibling/.test(document.querySelector("#tab-people .pc-inline").textContent)'), `${tag}: the Sworn sibling chip`)
    await shot(`rep-${tag}-sworn`)
    await ev('PeopleView.open = null; PeopleView.filter = "friend"; PeopleView._body(true)'); await sleep(200)
    assert(await ev('[...document.querySelectorAll("#tab-people .pp-row")].some(r => /Sworn sibling/.test(r.textContent))'), `${tag}: World → People → Friends lists them`)

    // the foe: the duel asks first
    await ev(`PeopleView.filter = "all"; PeopleView.show(window.__rp.foe)`); await sleep(250)
    assert(await ev('!document.querySelector("#tab-people .pc-inline [data-pc-act=duel]").disabled'), `${tag}: a duel to the death is open against someone who hates you`)
    await click('#tab-people .pc-inline [data-pc-act="duel"]'); await sleep(200)
    assert(await ev('!document.getElementById("confirm-overlay").classList.contains("hidden") && /to the death/.test(document.getElementById("confirm-msg").textContent)'), `${tag}: the duel asks first`)
    if (tag === 'overlay' || tag === 'desktop') await shot(`rep-${tag}-duel-confirm`)
    await click('#confirm-no'); await sleep(150)

    // the pupil: a gift from the popover card
    await ev('PeopleView.open = null; PeopleView._body(true)'); await sleep(100)
    await click('[data-tab="events"]'); await sleep(200)
    await ev(`(() => { const a = document.createElement('button'); a.dataset.pid = window.__rp.pupil; a.id = '__rp_a'; a.textContent = 'x'; document.getElementById('tab-events').prepend(a) })()`)
    await click('#__rp_a'); await sleep(250)
    assert(await ev('!!document.querySelector("#person-overlay .pc-pop .pc-acts")'), `${tag}: the popover card has the deeds too`)
    const st0 = await ev('gameState.get().spiritStones')
    await click('#person-overlay [data-pc-act="gift"]'); await sleep(250)
    assert(await ev(`gameState.get().spiritStones < ${st0} && gameState.get().world.persons[window.__rp.pupil].rel > 35`), `${tag}: a gift costs stones and warms them`)
    assert(await ev('!!document.querySelector("#person-overlay .pc-cd")'), `${tag}: the popover shows the wait`)
    await shot(`rep-${tag}-popover`)
    await ev('PersonCard.close(); document.getElementById("__rp_a")?.remove()'); await sleep(100)

    // Character: Your name + its breakdown
    await click('#tabs [data-group="cultivate"]'); await sleep(200); await click('[data-tab="stats"]'); await sleep(300)
    assert(await ev('!!document.querySelector(".ch-tile[data-bd=repute]") && /Honour \\d+ · Infamy \\d+/.test(document.querySelector(".ch-tile[data-bd=repute]").textContent)'), `${tag}: Character shows "Your name" (Honour · Infamy)`)
    await click('.ch-tile[data-bd="repute"]'); await sleep(300)
    assert(await ev('/What it changes/.test(document.body.textContent) && /What they say of you/.test(document.body.textContent)'), `${tag}: its card says what the name changes and the deeds behind it`)
    await shot(`rep-${tag}-name`)
    await ev('document.querySelector("[data-bd-close], .bd-x")?.click()'); await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await sleep(150)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
