// Real-app smoke scenario — Phase 28 / task 4.8 (docs/systems/living-world.md → "4.8 Heavenly Rankings"): the
// Heavenly Rankings. A founder's world after two publications (so ▲▼ show) with you high on Heaven + Rising Dragon. In each
// layout: the attention item, World → Rankings opening on Your Class (your standing, the Class duel on the one above you,
// the fallen apart), Rising Dragon (its formula, the honour roll) and Under Heaven (top 20, gap, your neighbours), the rank
// power "why" popover, Veil your name (the board drops you and says why), a challenger's and a genius hunter's road cards
// (Ranked / Hunter tags, the crown line, the answers), the person card's rank chip, the rival view's rankings line.
// Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/rankings-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/rankings.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // Two publications: a modest place, then a climb into the top ten (▲, a title, a log line), the hint showing.
  const setup = () => `(() => { const s = gameState.get(), w = s.world, K = NPC_RANK
    K.challenge.chance = 0; K.hunter.chance = 0; K.invite.chance = 0
    s.spiritStones = 99999; s.health = s.derived?.healthMax || 100
    for (const c of [...s.road.cards]) gameState._roadClose(c, null); s.road.waiting = []; s.family.encounters = []
    w.ranks = null; const R = gameState._ranks()
    const st0 = s.stageIndex
    s.stageIndex = Math.max(1, st0 - 3); gameState._recalc()
    const y = Math.floor(w.year); gameState._tickRanks(y - 1)
    s.stageIndex = st0; gameState._recalc(); gameState._tickRanks(y)
    R.renown = 30; R.hint = false; RankingsView.board = "class"
    gameState._rankNews('Lin Xue is the first of your class to reach Core Formation.', '', { log: false })
    R.honour.push({ pid: R.boards.dragon[3]?.pid, name: 'Qiao Mingyue', place: 4, y: y - 40, you: false })
    gameState._recalc(); gameState._notify() })()`

  const noHScroll = async sel => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return true; if (el.scrollWidth <= el.clientWidth + 1) return true; const R = el.getBoundingClientRect().right; return [...el.querySelectorAll("*")].filter(x => x.getBoundingClientRect().right > R + 1).map(x => x.tagName + "." + x.className).slice(0, 4).join(" | ") })()`); if (r !== true) console.log('  overflow:', r); return r === true }
  const openRanks = async () => { await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="rankings"]'); await sleep(350) }
  const board = async b => { await click(`#tab-rankings [data-rk-board="${b}"]`); await sleep(250) }

  const pass = async tag => {
    await ev(setup()); await sleep(250)
    assert(await ev('gameState.ranksNews() > 0'), `${tag}: a publication left news for you`)
    assert(await ev('[...document.querySelectorAll("#attention *")].some(e => /rankings are published/i.test(e.textContent))'), `${tag}: attention says the rankings are published`)
    await openRanks()
    assert(await ev('document.querySelectorAll("#tab-rankings .rk-tab").length === 3 && document.querySelector("#tab-rankings .rk-tab.on").dataset.rkBoard === "class"'), `${tag}: three boards, opening on Your Class`)
    assert(await ev('!!document.querySelector("#tab-rankings .rk-hint")'), `${tag}: the first-time hint`)
    assert(await ev('!!document.querySelector("#tab-rankings .rk-you .rk-you-n") && /#\\d+/.test(document.querySelector("#tab-rankings .rk-you-n").textContent)'), `${tag}: your place, large`)
    assert(await ev('!!document.querySelector("#tab-rankings .rk-row.you")'), `${tag}: your row on the board`)
    assert(await ev('/\\d+:\\d\\d|any moment/.test(document.querySelector("#tab-rankings .rk-pub b").textContent) && !/year/.test(document.querySelector("#tab-rankings .rk-pub").textContent)'), `${tag}: the next publication in real time (m:ss)`)
    assert(await ev('!!document.querySelector("#tab-rankings .rk-veil [data-rk-veil=on]")'), `${tag}: the Veil switch with its trade-offs`)
    assert(await ev('gameState.ranksNews() === 0'), `${tag}: opening the view clears the news`)
    assert(await noHScroll('#tab-rankings'), `${tag}: no sideways scroll (class)`)
    await ev('document.getElementById("tab-rankings").scrollTop = 0'); await sleep(100)
    await shot(`rankings-${tag}-class`)
    await ev('gameState.noteRanksHint()'); await sleep(200)
    await ev('document.querySelector("#tab-rankings .rk-tabs")?.scrollIntoView({ block: "start" })'); await sleep(120)
    await shot(`rankings-${tag}-class-board`)
    if (await ev('!!document.querySelector("#tab-rankings .rk-duel")')) {
      assert(await ev('!!document.querySelector("#tab-rankings .rk-duel [data-rk-duel]")'), `${tag}: the Class duel on the one just above you`)
      await ev('document.querySelector("#tab-rankings .rk-duel")?.scrollIntoView({ block: "center" })'); await sleep(150)
      await shot(`rankings-${tag}-duel`)
    }

    await board('dragon')
    assert(await ev('/power ×/.test(document.querySelector("#tab-rankings .rk-lede").textContent)'), `${tag}: Rising Dragon explains its formula`)
    assert(await ev('[...document.querySelectorAll("#tab-rankings summary")].some(s => /honour roll/.test(s.textContent))'), `${tag}: the honour roll`)
    assert(await noHScroll('#tab-rankings'), `${tag}: no sideways scroll (dragon)`)
    await ev('document.querySelector("#tab-rankings .rk-tabs")?.scrollIntoView({ block: "start" })'); await sleep(120)
    await shot(`rankings-${tag}-dragon`)

    await board('heaven')
    assert(await ev('document.querySelectorAll("#tab-rankings .rk-row").length >= 20 && document.querySelector("#tab-rankings .rk-row .rk-n").textContent.trim() === "1"'), `${tag}: Under Heaven, the top 20 from #1`)
    assert(await ev('!!document.querySelector("#tab-rankings .rk-mv.up, #tab-rankings .rk-mv.down, #tab-rankings .rk-mv.new")'), `${tag}: ▲▼ since the last publication`)
    assert(await ev('document.querySelectorAll("#tab-rankings .rk-row .pc-link").length >= 10'), `${tag}: names open the person card`)
    assert(await ev('document.querySelectorAll("#tab-rankings .rk-title-chip").length >= 1'), `${tag}: your titles`)
    assert(await noHScroll('#tab-rankings'), `${tag}: no sideways scroll (heaven)`)
    await ev('document.querySelector("#tab-rankings .rk-tabs")?.scrollIntoView({ block: "start" })'); await sleep(120)
    await shot(`rankings-${tag}-heaven`)

    // the why
    await click('#tab-rankings .rk-power'); await sleep(250)
    assert(await ev('/Rank power/.test(document.querySelector(".bd-pop, #bd-pop, .bd-popover")?.textContent || "")'), `${tag}: rank power has a why`)
    if (tag === 'overlay' || tag === 'desktop') await shot(`rankings-${tag}-why`)
    await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); document.querySelector(".bd-pop .bd-x, .bd-close")?.click()'); await sleep(150)

    // the person card's rank chip
    await ev('document.querySelector("#tab-rankings .rk-row .pc-link")?.click()'); await sleep(250)
    assert(await ev('/under Heaven/.test(document.querySelector("#person-overlay .pc-pop")?.textContent || "")'), `${tag}: the person card shows their place`)
    await ev('PersonCard.close()'); await sleep(100)

    // Veil your name
    await click('#tab-rankings [data-rk-veil="on"]'); await sleep(200)
    await ev('gameState._tickRanks(Math.floor(gameState.get().world.year) + 1)'); await sleep(200)
    assert(await ev('!document.querySelector("#tab-rankings .rk-row.you") && /veiled/i.test(document.querySelector("#tab-rankings .rk-off")?.textContent || "")'), `${tag}: veiled, the board drops you and says why`)
    if (tag === 'overlay' || tag === 'phone') { await ev('document.getElementById("tab-rankings").scrollTop = 0'); await sleep(100); await shot(`rankings-${tag}-veiled`) }
    await click('#tab-rankings [data-rk-veil="off"]'); await sleep(150)

    // the road cards: a challenger and a genius hunter
    await ev(`(() => { const s = gameState.get(), w = s.world, R = gameState._ranks()
      for (const c of [...s.road.cards]) gameState._roadClose(c, null)
      const mine = R.you.heaven || 5, below = R.boards.heaven.slice(mine, mine + 6).map(e => w.persons[e.pid]).find(p => p && !p.roadCard)
      if (below) gameState._rankMeet(below, 'rankChallenge', { board: 'heaven', theirs: mine + 1, yours: mine })
      gameState._rankMeet(gameState._rankHunter(s.stageIndex, Math.random), 'hunter', { board: 'dragon', yours: 4 })
      gameState._notify() })()`); await sleep(250)
    assert(await ev('[...document.querySelectorAll("#attention *")].some(e => /upon you|genius hunter/i.test(e.textContent))'), `${tag}: the hunter is urgent in attention`)
    await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="explore"]'); await sleep(400)
    assert(await ev('[...document.querySelectorAll(".er-tag")].some(t => /Hunter/.test(t.textContent)) && [...document.querySelectorAll(".er-tag")].some(t => /Ranked/.test(t.textContent))'), `${tag}: Ranked + Hunter tags`)
    assert(await ev('!!document.querySelector(".er-card.open .er-rank")'), `${tag}: the open card's crown line`)
    await ev('document.querySelector(".er-card.open")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`rankings-${tag}-card`)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
