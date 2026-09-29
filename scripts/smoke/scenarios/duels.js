// Real-app smoke scenario — A6-3a people on the battle page (docs/systems/combat.md → "A6-3a"): a spouse duel opens on the
// fight step against an ink duelist (mirrored, dressed by temper), an exchange lost and won, the lethal end choice
// (finish / spare with the reaction shown), the result card; defending the seat until one yields (raise / humble);
// the Challenge-the-Head tile's odds pill + the personfight "why" card; a step-down bracket that chains bouts through a
// "Face the next" result card. Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/duel-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/duels.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await ev('combatView.isOpen() && (combatView.step = "result", combatView.close())')
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800)
  }
  const rng = v => ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
  const unrng = () => ev('Math.random = globalThis.__r')
  const tac = async (t, n = 1) => { for (let i = 0; i < n && await ev('combatView.step === "fight"'); i++) { await ev('combatView.lockUntil = 0'); await click(`#combat-panel [data-tac="${t}"]`); await sleep(120) } }
  const clear = () => ev(`(() => { const f = gameState.get().family; f.fight = null; f.bracket = null; f.duel = null; f.headChallenge = null; f.stepDownOffer = null; gameState.get().health = 100; gameState._notify() })()`)

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const gs = gameState, s = gs.get(), f = s.family
    s.name = 'Lin Mei'; s.sectWar.nextWarAt = Date.now() + 3600e3; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9; f.nextProposalYear = 1e9; f.planning = 'none'
    gs.setSetting('artStyle', 'ink')
    if (!f.spouse) { const sp = gs._rollStranger('suitor'); sp.personality = 'psycho'; sp.given = 'Wei'; sp.stageIndex = Math.max(1, s.stageIndex - 1); gs._wed(sp, 40) }
    else { f.spouse.personality = 'psycho'; f.spouse.stageIndex = Math.max(1, s.stageIndex - 1) }
    gs._recalc(); gs._notify() })()`)
  await sleep(300)

  // ── The spouse duel, in every mode ──
  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await clear()
    await ev(`(() => { gameState.get().family.duel = { year: 1, reason: 'affair' }; gameState.resolveDuel('fight'); combatView.resume() })()`); await sleep(500)
    assert(await ev('combatView.isOpen() && combatView.mode === "person" && combatView.step === "fight"'), `${mode}: the duel opens on the fight step`)
    assert(await ev('combatView.scene.foe.person && combatView.scene.foe.flip && document.querySelector("#combat-panel .cb-retreat[data-tac=yield]") != null'), `${mode}: a mirrored duelist; Yield instead of Retreat`)
    assert(await ev('/A Duel to the Death/.test(document.getElementById("combat-title").textContent)'), `${mode}: the title names the fight`)
    await rng(0.999); await tac('press'); await unrng(); await sleep(250)
    assert(await ev('gameState.get().family.fight.them === 1 && !!document.querySelector("#combat-panel .cb-last.down")'), `${mode}: a lost exchange scores for them and says so`)
    await ev('combatView.scene.freeze(0.45, { type: "ex", you: "guard", them: "press", won: false, dmg: 4 })'); await shot(`duel-fight-${mode}`)
    await ev('combatView.scene.start()')
    await rng(0.0); await tac('feint', 4); await unrng(); await sleep(250)
    assert(await ev('combatView.step === "end" && document.querySelectorAll("#combat-panel .cb-end").length === 2'), `${mode}: a won duel offers finish / spare`)
    assert(await ev('/grudge/.test(document.querySelector("#combat-panel .cb-end.spare")?.textContent)'), `${mode}: sparing a psycho shows the grudge it leaves`)
    await ev('combatView.scene.freeze(0, null, { foe: "down" })'); await shot(`duel-end-${mode}`)
    if (mode === 'desktop') {
      await ev('combatView.scene.freeze(0.46, { type: "ex", you: "press", them: "feint", won: true })'); await shot('duel-strike-desktop')
      await ev('combatView.scene.start()')
      await click('#combat-panel .cb-end.spare'); await sleep(300)
      assert(await ev('combatView.step === "result" && !gameState.get().family.spouse && gameState.get().family.formerSpouses.at(-1).feud === "grudge"'), 'spare: your spouse leaves you, alive, with a grudge')
      await ev('combatView.scene.freeze(0.5, { type: "spare" }, { foe: "down" })'); await shot('duel-result-desktop')
      await ev(`(() => { const gs = gameState, s = gs.get(); const sp = gs._rollStranger('suitor'); sp.personality = 'psycho'; sp.given = 'Wei'; sp.stageIndex = Math.max(1, s.stageIndex - 1); gs._wed(sp, 40); gs._notify() })()`)
    }
    await ev('combatView.step = "result"; combatView.close()')
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }

  // ── The clan: challenge odds, defending the seat (until one yields), a step-down bracket ──
  await pick('expanded'); await clear()
  const hasClan = await ev('!!gameState._playerClan()')
  assert(hasClan, 'the dev life has a clan')
  if (hasClan) {
    // a sitting NPC head you can reach → the Challenge tile shows its odds + the why card
    await ev(`(() => { const gs = gameState, s = gs.get(), clan = gs._playerClan(), w = s.world
      let head = clan.headId && clan.headId !== s.self.id ? w.persons[clan.headId] : null
      if (!head) { head = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 60, stage: s.stageIndex, role: 'kin' }); w.persons[head.id] = head; clan.lines[0].memberIds.push(head.id); gs._installHead(clan, head.id) }
      head.stageIndex = s.stageIndex; head.personality = 'arrogant'; head.feud = 'grudge'; s.family.challengeCooldownYear = null
      gs._notify() })()`)
    await click('#tabs [data-group="kin"]'); await sleep(200); await click('[data-tab="clan"]'); await sleep(400)
    assert(await ev('!!document.querySelector("#_challenge-head .odds-in[data-bd^=personfight]")'), 'Challenge the Head shows its odds inline')
    assert(await ev('/grudge/.test(document.getElementById("_challenge-head")?.textContent)'), 'and the grudge the head holds')
    await ev('document.getElementById("_challenge-head")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot('duel-clan-tile-expanded')
    await click('#_challenge-head .odds-in'); await sleep(400)
    assert(await ev('!document.getElementById("breakdown-overlay").classList.contains("hidden") && /Fight odds/.test(document.querySelector(".bd-pop")?.textContent) && /grudge/.test(document.querySelector(".bd-pop")?.textContent)'), 'the why card lists both powers, the grudge included')
    await shot('duel-why-expanded')
    await ev('document.querySelector("[data-bd-close]")?.click()'); await sleep(150)

    // you hold the seat; a challenger — until one yields → raise / humble
    await pick('desktop')
    await ev(`(() => { const gs = gameState, s = gs.get(), clan = gs._playerClan(), w = s.world
      gs._installHead(clan, s.self.id)
      const ch = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: Math.max(1, s.stageIndex - 1), role: 'kin' })
      ch.personality = 'hotblood'; w.persons[ch.id] = ch; clan.lines[0].memberIds.push(ch.id)
      s.family.headChallenge = { challengerId: ch.id, year: Math.floor(w.year) }; gs.resolveHeadChallenge(false); combatView.resume() })()`)
    await sleep(500)
    assert(await ev('combatView.scene.foe.ink.slots().robe !== combatView.scene.you.ink.slots().robe'), 'a hot-blooded (crimson) rival never wears your robe')
    assert(await ev('combatView.isOpen() && /Defending/.test(document.getElementById("combat-title").textContent) && /Until one yields/.test(document.getElementById("combat-panel").textContent)'), 'defending the seat, until one yields')
    await rng(0.0); await tac('guard', 4); await unrng(); await sleep(250)
    assert(await ev('document.querySelectorAll("#combat-panel .cb-end.raise, #combat-panel .cb-end.humble").length === 2'), 'raise / humble offered')
    await ev('combatView.scene.freeze(0, null, { foe: "down" })'); await shot('duel-end-yield-desktop')
    await click('#combat-panel .cb-end.humble'); await sleep(300)
    assert(await ev('gameState.get().family.cowedUntilYear > gameState.get().world.year'), 'humble: the clan is cowed')
    await ev('combatView.step = "result"; combatView.close()')

    // a step-down bracket: three contenders + you → your first bout, won → "Face the next"
    await ev(`(() => { const gs = gameState, s = gs.get(), clan = gs._playerClan(), w = s.world
      const hd = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 70, stage: s.stageIndex, role: 'kin' }); w.persons[hd.id] = hd; clan.lines[0].memberIds.push(hd.id); gs._installHead(clan, hd.id)
      const ids = []
      for (const [p, st] of [['stoic', 1], ['gremlin', 2], ['niceguy', 1]]) { const m = gs._genPerson({ family: clan.name, bornYear: Math.floor(w.year) - 30, stage: Math.max(1, s.stageIndex - st), role: 'kin' }); m.personality = p; w.persons[m.id] = m; clan.lines[0].memberIds.push(m.id); ids.push(m.id) }
      s.family.stepDownOffer = { headId: hd.id, year: Math.floor(w.year), entrantIds: [...ids, s.self.id], eligible: true }
      gs._notify() })()`)
    await sleep(300)
    await ev(`(() => { const f = GameState.prototype; globalThis.__hdl = f._headDecidesLethal; f._headDecidesLethal = () => false })()`)
    await ev(`(() => { const r = gameState.answerStepDown(true); if (r.next) combatView.resume() })()`); await sleep(500)
    await ev(`(() => { GameState.prototype._headDecidesLethal = globalThis.__hdl })()`)
    assert(await ev('gameState.get().family.fight?.kind === "stepdown" && combatView.isOpen() && /Contest for the Head Seat · Round 1/.test(document.getElementById("combat-title").textContent)'), 'the step-down contest: your first bout, round 1')
    await ev('combatView.scene.freeze(0)'); await shot('duel-stepdown-desktop')
    await rng(0.0); await tac('press', 4); await unrng(); await sleep(250)
    await click('#combat-panel .cb-end.raise'); await sleep(300)
    const chained = await ev('!!document.querySelector("#combat-panel [data-nextbout]")')
    const settled = await ev('!gameState.get().family.bracket')
    assert(chained || settled, `after your bout: ${chained ? 'the next opponent waits' : 'the contest is settled'}`)
    await ev('combatView.scene.freeze(0.6, { type: "spare" }, { foe: "down" })'); await shot('duel-between-desktop')
    if (chained) {
      await click('#combat-panel [data-nextbout]'); await sleep(400)
      assert(await ev('combatView.step === "fight" && gameState.get().family.fight?.you === 0'), 'Face the next: a fresh bout')
    }
    await ev('combatView.step = "result"; combatView.close()')
  }

  // Perf with a person opponent
  await clear()
  await ev(`(() => { gameState.get().family.duel = { year: 1, reason: 'affair' }; gameState.resolveDuel('fight'); combatView.resume() })()`); await sleep(400)
  const ms = await ev('combatView.scene.perf(40)')
  console.log(`     duel scene frame ${ms.toFixed(2)} ms`)
  assert(ms < 12, `duel scene frame under 12 ms (${ms.toFixed(2)})`)
  await ev('combatView.step = "result"; combatView.close()'); await clear()
}
