// Real-app smoke scenario — task 1.14b (docs/systems/arts.md → "42c part 2 as built"): study desks by realm on Path →
// Arts (busy desks with countdowns, a free desk, the locked desk naming its realm), Sect → Library (grades opened by rank,
// Contribution price, a sealed grade, buying a manual), Kin → Hall → Clan library (the shelf, writing an art in, studying
// from it at half time), and a rival's counter + the raise/finish art lines on the battle page (and the taught art on the
// result card). Giving manuals to the sect (user 2026-09-30): the member's "Give a manual" list + "Given to the library"
// shelf, a Pack row's "Give to the sect", the attention nudge, a founder's own Library (study from the shelf).
// Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/lib-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/libraries.js
module.exports = async (ctx) => {
  const { ev, click, wait, assert, sleep, shot, emulate, clearEmulation } = ctx
  const F = require('../fight-ui.js')(ctx)
  const pick = async mode => {
    await ev('combatView.isOpen() && (combatView.step = "result", combatView.close())')
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700)
  }
  const go = async (group, tab) => { await click(`#tabs [data-group="${group}"]`); await sleep(200); await click(`[data-tab="${tab}"]`); await sleep(400) }
  const fits = id => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const p = document.getElementById("${id}").getBoundingClientRect(); return [...document.querySelectorAll("#${id} button, #${id} .sv-card, #${id} .lib-row")].every(n => n.getBoundingClientRect().right <= p.right + 1.5) })()`)

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  // Foundation (2 desks), a joined sect with Contribution, manuals in the pack, two arts on desks
  await ev(`(() => { const gs = gameState, s = gs.get()
    s.stageIndex = 11; s.maxStageThisLife = Math.max(s.maxStageThisLife, 11); s.sectWar.nextWarAt = Date.now() + 3600e3; s.spiritStones = Math.max(s.spiritStones, 5000)
    if (!s.sect?.id) { s.ownSect = { ...s.ownSect, founded: false }; gs.joinSect('azure_sword') }
    s.sect.rank = 2; s.sect.contribution = 300
    s.inventory.manual_autumn_blade_qi = 1; s.inventory.manual_iron_needle_rain = 1; s.inventory.manual_edge_seeking_thrust = 1
    s.inventory.manual_heart_flame_fist = 2; s.arts.known.heart_flame_fist ||= { mastery: 2, xp: 0, uses: 0 }; s.inventory.manual_quaking_stomp = 1; s.sect.shelf = [{ artId: 'ember_scatter', by: s.name, year: Math.floor(s.world.year) - 3 }]
    s.arts.studies = []; gs._recalc(); gs.studyArt('iron_needle_rain'); gs._notify() })()`)

  // ── Study desks ──
  await go('cultivate', 'arts')
  assert(await ev('gameState.studySlots() === 2 && document.querySelectorAll("#tab-arts .art-study.on").length === 1 && !!document.querySelector("#tab-arts .art-study:not(.on):not(.locked) [data-study]")'), 'Foundation: one desk busy, one free with manuals ready')
  assert(await ev('/Another desk opens at/.test(document.querySelector("#tab-arts .art-study.locked")?.textContent || "")'), 'the locked third desk names the realm that opens it')
  await ev('document.querySelector("#tab-arts .art-study:not(.on):not(.locked) [data-study]").click()'); await sleep(300)
  assert(await ev('gameState.get().arts.studies.length === 2 && document.querySelectorAll("#tab-arts .art-study.on").length === 2'), 'a second manual on the second desk: two countdowns')

  // ── Sect → Library ──
  await go('sect', 'sect-library')
  assert(await ev('document.querySelectorAll("#tab-sect-library .sv-art").length > 5 && !!document.querySelector("#tab-sect-library .sv-sealed")'), 'the library: manuals by grade, a higher grade sealed to a higher rank')
  assert(await ev('/Core Disciple|Elder/.test(document.querySelector("#tab-sect-library .sv-sealed")?.textContent || "")'), 'the sealed grade names the rank that opens it')
  // giving a spare manual
  assert(await ev('!!document.querySelector("#tab-sect-library .sv-give [data-sa=donate-art]") && document.querySelectorAll("#tab-sect-library .sv-shelf .lib-row").length === 1'), 'the Library: "Give a manual" + the shelf of what was given')
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "sect-donate" && i.view === "sect-library")'), 'a spare manual you know: an attention nudge to the Library')
  const cg = await ev('gameState.get().sect.contribution')
  await ev('document.querySelector("#tab-sect-library .sv-give [data-sa=donate-art][data-id=heart_flame_fist]").click()'); await sleep(300)
  assert(await ev(`gameState.get().sect.contribution > ${cg} && gameState.get().sect.shelf.some(x => x.artId === "heart_flame_fist") && document.querySelectorAll("#tab-sect-library .sv-shelf .lib-row").length === 2`), 'Give: Contribution paid, the art joins the shelf')
  assert(await ev('/Arts you gave/.test(JSON.stringify(gameState.sectWarOdds()?.parts || []))'), 'the war odds count the shelf')

  // ── Kin → Hall → Clan library ──
  const hasClan = await ev('!!gameState._playerClan()')
  assert(hasClan, 'the dev life has a clan')
  if (hasClan) {
    await ev(`(() => { const gs = gameState, s = gs.get(), clan = gs._playerClan()
      clan.library = [{ artId: 'frost_lotus_palm', by: 'Lin Yu', gen: 1, year: 12 }, { artId: 'thousand_roots_prison', by: 'Lin Bo', gen: 2, year: 90 }]
      s.arts.known.armour_rending_slash = { mastery: 2, xp: 0, uses: 0 }; delete s.arts.known.frost_lotus_palm; gs._notify() })()`)
  }

  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await go('cultivate', 'arts')
    assert(await fits('tab-arts'), `${mode}: the desks fit`)
    await ev('document.querySelector("#tab-arts .art-desks")?.scrollIntoView({ block: "start" })'); await sleep(150); await shot(`lib-desks-${mode}`)
    await go('sect', 'sect-library')
    assert(await fits('tab-sect-library'), `${mode}: the sect library fits`)
    await shot(`lib-sect-${mode}`)
    if (hasClan) {
      await go('kin', 'hall')
      assert(await ev('document.querySelectorAll("#tab-hall .clan-lib .lib-row").length >= 2'), `${mode}: the clan library shelf`)
      await ev('document.querySelector("#tab-hall .clan-lib")?.scrollIntoView({ block: "start" })'); await sleep(150); await shot(`lib-clan-${mode}`)
    }
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }

  // the Pack row offers the same gift
  await go('pack', 'pack'); await sleep(200)
  await ev('(() => { const r = [...document.querySelectorAll("#tab-pack .pack-item-row")].find(n => /Quaking Stomp/.test(n.textContent) && !n.classList.contains("expanded")); r?.querySelector(".pack-item-main")?.click() })()'); await sleep(300)
  assert(await ev('!!document.querySelector("#tab-pack [data-giveart=quaking_stomp]")'), 'Pack: a manual row offers "Give to the sect"')

  // buy a manual, then study one from the clan library
  await pick('expanded')
  await go('sect', 'sect-library')
  const c0 = await ev('gameState.get().sect.contribution')
  await ev('document.querySelector("#tab-sect-library [data-sa=buyart]:not([disabled])").click()'); await sleep(300)
  assert(await ev(`gameState.get().sect.contribution < ${c0}`), 'buying a manual spends Contribution')
  if (hasClan) {
    await go('kin', 'hall')
    await ev('(() => { gameState.get().arts.studies = []; gameState._notify() })()'); await sleep(200)
    await ev('document.querySelector("#tab-hall [data-libstudy]")?.click()'); await sleep(300)
    assert(await ev('gameState.get().arts.studies.some(d => d.src === "clan")'), 'Study from the clan library: a desk, no manual')
    await ev('document.querySelector("#tab-hall .lib-write > summary")?.click()'); await sleep(200)
    await ev('document.querySelector("#tab-hall .clan-lib")?.scrollIntoView({ block: "start" })'); await sleep(150); await shot('lib-clan-write-expanded')
    await ev('document.querySelector("#tab-hall [data-libwrite]:not([disabled])")?.click()'); await sleep(300)
    await ev('document.getElementById("confirm-yes")?.click()'); await sleep(300)
    assert(await ev('gameState._playerClan().library.length === 3'), 'writing an art in (after the confirm) adds it to the shelf')
  }

  // ── A founder's own library: the shelf, study from it ──
  await ev(`(() => { const gs = gameState, s = gs.get()
    s.sect = { id: null, rank: 0, contribution: 0, activeMissions: [] }
    s.ownSect = { ...gs._blankOwnSect(), founded: true, name: 'Cloud Peak', foundedAt: Date.now(), hallLevel: 2, buildings: {}, disciples: [],
      library: [{ artId: 'withering_blight', by: s.name, year: 3 }, { artId: 'severing_crescent', by: 'Lin Yu', year: 1 }] }
    s.sectWar = gs._blankSectWar('own'); s.sectWar.nextWarAt = Date.now() + 3600e3
    delete s.arts.known.withering_blight; s.arts.studies = []; s.inventory.manual_stone_fist = 1; gs._recalc(); gs._notify() })()`)
  await sleep(300)
  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await go('sect', 'sect-halls')
    assert(await ev('document.querySelectorAll("#tab-sect-halls .sv-shelf .lib-row").length === 2 && !!document.querySelector("#tab-sect-halls [data-sa=sectstudy]")'), `${mode}: a founder's library (in Halls) — the shelf, Study for an art you don't know`)
    assert(await fits('tab-sect-halls'), `${mode}: the founder's library fits`)
    assert(await ev('(() => { const r = document.getElementById("subtabs"); return !r || r.scrollWidth <= r.clientWidth + 1 })()'), `${mode}: the founder's Sect sub-tabs still fit (no 5th tab)`)
    await ev('document.getElementById("sv-ownlib")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`lib-own-${mode}`)
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }
  await pick('desktop'); await go('sect', 'sect-halls')
  await ev('document.querySelector("#tab-sect-halls [data-sa=sectstudy]").click()'); await sleep(300)
  assert(await ev('gameState.get().arts.studies.some(d => d.src === "sect" && d.artId === "withering_blight")'), 'Study from your sect library: a desk, no manual')

  // ── A rival's counter on the battle page + the raise line that teaches ──
  await pick('desktop')
  await ev(`(() => { const gs = gameState, s = gs.get(), w = s.world
    const p = gs._genPerson({ family: 'Guo', bornYear: Math.floor(w.year) - 30, stage: s.stageIndex, role: 'duelist' }); p.given = 'Ren'; p.personality = 'arrogant'
    w.persons[p.id] = p; p.feud = 'grudge'; p.vsYou = { ...gs.personRecord(p), fought: 2, theyWon: 0, youWon: 2, els: { metal: 5 } }; gs._rivalTrain(p)
    globalThis.__rival = p.id; s.family.fight = null; s.health = 100
    gs._startFight('challenge', p, false); combatView.resume() })()`)
  await sleep(500)
  assert(await ev('/(trained in Fire|honed) against your Metal/.test(document.querySelector("#combat-panel .cb-scout")?.textContent || "")'), 'the rival trained in Fire against your Metal: "What you know" says so')
  await ev('combatView.scene.freeze(0)'); await shot('lib-rival-desktop')
  await click('#combat-panel .cb-why'); await sleep(400)
  assert(await ev('/trained against your Metal/.test(document.querySelector(".bd-pop")?.textContent || "")'), 'the why card names the counter')
  await shot('lib-rival-why-desktop')
  await ev('document.querySelector("[data-bd-close]")?.click()'); await sleep(150)
  await ev('combatView.scene.start()')
  // a stoic who will owe you: the raise card promises an art, the result card names it
  await ev(`(() => { const gs = gameState, s = gs.get(), w = s.world
    s.family.fight = null
    const p = gs._genPerson({ family: 'Shen', bornYear: Math.floor(w.year) - 30, stage: s.stageIndex - 1, role: 'duelist' }); p.given = 'Qiu'; p.personality = 'stoic'; w.persons[p.id] = p
    gs._startFight('challenge', p, false); combatView.resume() })()`)
  await sleep(400)
  await F.win()
  assert(await ev('/teach you one of their arts/.test(document.querySelector("#combat-panel .cb-end.raise")?.textContent || "")'), 'the raise card: in thanks, they teach you one of their arts')
  await ev('combatView.scene.freeze(0, null, { foe: "down" })'); await shot('lib-raise-desktop')
  await ev('combatView.scene.start()')
  await click('#combat-panel .cb-end.raise'); await sleep(400)
  assert(await ev('/writes out/.test(document.querySelector("#combat-panel .cb-res-t")?.textContent || "")'), 'the result card names the art they taught')
  await ev('combatView.scene.freeze(0.5, { type: "spare" }, { foe: "down" })'); await shot('lib-taught-desktop')
  await ev('combatView.step = "result"; combatView.close()')
}
