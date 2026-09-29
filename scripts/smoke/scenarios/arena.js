// Real-app smoke scenario — A6-3b the Arena (docs/systems/combat.md → "A6-3b"): Roam → Arena (rings, locks, rosters with
// odds + Fight / Blood), a run (the fee, a bout on the battle page, raise / humble, the result card's Fight on / Walk away,
// the run panel with the purse + the "why" card), walking away (the gates rest with a countdown), a grudge call-out card
// and a grudge match, in Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/arena-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/arena.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await ev('combatView.isOpen() && (combatView.step = "result", combatView.close())')
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800)
  }
  const rng = v => ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
  const unrng = () => ev('Math.random = globalThis.__r')
  const openArena = async () => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="arena"]'); await sleep(400) }
  const top = () => ev(`(() => { for (let n = document.getElementById('tab-arena'); n; n = n.parentElement) n.scrollTop = 0 })()`)
  const reset = () => ev(`(() => { const gs = gameState, s = gs.get(); s.family.fight = null; s.health = 100; s.spiritStones = Math.max(s.spiritStones, 5000)
    s.arena = gs._blankArena(); s.stageIndex = 13; s.maxStageThisLife = Math.max(s.maxStageThisLife, 13); gs._recalc(); gs._notify() })()`)
  const winBout = async (end = 'raise') => {
    await rng(0)
    for (let i = 0; i < 6 && await ev('combatView.step === "fight"'); i++) { await ev('combatView.lockUntil = 0'); await click('#combat-panel [data-tac="guard"]'); await sleep(120) }
    await unrng(); await sleep(200)
    if (await ev('combatView.step === "end"')) { await click(`#combat-panel .cb-end.${end}`); await sleep(300) }
  }

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const s = gameState.get(); s.name = "Lin Mei"; s.sectWar.nextWarAt = Date.now() + 3600e3; gameState.setSetting("artStyle", "ink") })()')

  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await reset(); await openArena(); await top()
    assert(await ev('document.querySelectorAll("#tab-arena .ar-card").length === 6'), `${mode}: six rings`)
    assert(await ev('document.querySelectorAll("#tab-arena .ar-card.locked").length === 2'), `${mode}: two locked above your realm (Core Formation)`)
    assert(await ev('document.querySelectorAll("#tab-arena .ar-row").length === 20'), `${mode}: four open rings × (4 duelists + a champion)`)
    await shot(`arena-view-${mode}`)

    // a bout: the Jade Terrace (second card: the highest open ring leads), the first duelist
    assert(await ev('/Golden Core Pit/.test(document.querySelector("#tab-arena .ar-card .ar-name")?.textContent)'), `${mode}: the highest open ring leads`)
    await click('#tab-arena .ar-card:nth-child(2) [data-ar-fight]'); await sleep(500)
    assert(await ev('combatView.isOpen() && gameState.get().family.fight?.kind === "arena" && /Jade Terrace/.test(document.getElementById("combat-title").textContent)'), `${mode}: Fight opens a bout on the battle page`)
    assert(await ev('/Purse/.test(document.getElementById("combat-panel").textContent)'), `${mode}: the panel shows the purse`)
    if (mode === 'desktop' || mode === 'overlay') { await ev('combatView.scene.freeze(0.45, { type: "ex", you: "press", them: "guard", won: true })'); await shot(`arena-bout-${mode}`); await ev('combatView.scene.start()') }
    await winBout('raise')
    assert(await ev('combatView.step === "result" && !!document.querySelector("#combat-panel [data-ar-walk]") && !!document.querySelector("#combat-panel [data-ar-next]")'), `${mode}: after a win: Walk away / Fight on`)
    await ev('combatView.scene.freeze(0.6, { type: "spare" }, { foe: "down" })'); await shot(`arena-result-${mode}`)
    await click('#combat-panel [data-ar-next]'); await sleep(500)
    assert(await ev('!combatView.isOpen() && !!document.querySelector("#tab-arena .ar-run")'), `${mode}: Fight on returns to the Arena with the run panel`)
    await top(); await shot(`arena-run-${mode}`)
    if (mode === 'expanded') {
      await click('#tab-arena .ar-run .cb-why'); await sleep(400)
      assert(await ev('/The purse/.test(document.querySelector(".bd-pop")?.textContent || "")'), 'the purse "why" card')
      await shot('arena-why-expanded')
      await ev('document.querySelector("[data-bd-close]")?.click()'); await sleep(150)
    }
    const purse = await ev('gameState.get().arena.run.purse'), st = await ev('gameState.get().spiritStones')
    await click('#tab-arena [data-ar-walk]'); await sleep(400)
    assert(await ev(`gameState.get().spiritStones === ${st} + ${purse} && !gameState.get().arena.run`), `${mode}: walk away pays the purse (${purse})`)
    assert(await ev('!!document.querySelector("#tab-arena .ar-rest [data-ar-rest]")'), `${mode}: the gates rest, with a countdown`)
    if (mode === 'desktop') { await top(); await shot('arena-rest-desktop') }
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }

  // A grudge call-out → the card, a grudge match
  await pick('expanded'); await reset(); await openArena()
  await ev(`(() => { const gs = gameState, A = gs.get().arena, id = A.rings.jade.roster[1], p = A.duelists[id]
    p.feud = 'grudge'; p.personality = 'psycho'; A.callout = { id, ringId: 'jade', year: Math.floor(gs.get().world.year), blood: true }; gs._notify() })()`)
  await sleep(300); await top()
  assert(await ev('!!document.querySelector("#tab-arena .ar-callout") && collectAttention(gameState.get(), gameState).some(i => i.id === "arena-callout" && i.tier === "urgent")'), 'a call-out: the card + an urgent attention item')
  await shot('arena-callout-expanded')
  await click('#tab-arena [data-ar-callout="1"]'); await sleep(500)
  assert(await ev('combatView.isOpen() && gameState.get().family.fight?.lethal && /Grudge Match/.test(document.getElementById("combat-title").textContent)'), 'answering: a grudge match, to the death')
  await ev('combatView.scene.freeze(0)'); await shot('arena-grudge-expanded')
  await ev('combatView.step = "result"; combatView.close()'); await reset()

  // An early player: only the Dust Ring (and the first-visit hint)
  await ev('(() => { const s = gameState.get(); s.stageIndex = 1; gameState._recalc(); gameState._notify() })()'); await sleep(300); await top()
  assert(await ev('document.querySelectorAll("#tab-arena .ar-card.locked").length === ARENA_RINGS.filter(r => r.minStage > gameState.get().stageIndex).length && !!document.querySelector("#tab-arena .view-lede")'), 'an early player: the higher rings locked, the first-visit hint')
  await shot('arena-early-expanded')
}
