// Real-app smoke scenario — the battle page (Phase 35 / A6-1, docs/systems/combat.md): the Fight button on a Roam → Beasts
// encounter opens the prepare step (odds per stance, nothing committed), a Slay battle plays exchange by exchange on the
// ink field, a won battle offers finish / spare / bind, the result card, the "why these odds" card, a deadly loss that
// hands over to the death moment, and the page in Overlay / Expanded / Desktop / phone. Frame time of the scene.
// Screenshots: scripts/smoke/out/combat-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/combat.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await ev('combatView.isOpen() && (combatView.step = "result", combatView.close())')
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800)
  }
  const rng = v => ev(`globalThis.__r = globalThis.__r || Math.random; Math.random = () => ${v}`)
  const unrng = () => ev('Math.random = globalThis.__r')
  // a fresh encounter (the tiger at its gate, a rare colour) + full health, then Roam → Beasts
  const fresh = async (type = 'white_tiger', extra = {}) => {
    await ev(`(() => { const gs = gameState, s = gs.get(); s.family.fight = null; s.health = 100; s.stageIndex = 14; s.bestiary = {}
      s.inventory.beast_taming_talisman = 2
      s.beastEncounters = [{ id: 'smoke_enc', typeId: '${type}', traits: ['iron_skin', 'soul_bond', 'swift'], seenAt: Date.now(), ...${JSON.stringify(extra)} }]
      gs._recalc(); gs._notify() })()`)
    await sleep(200)
  }
  const openBeasts = async () => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="beasts"]'); await sleep(400) }

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3; gameState.setSetting("artStyle", "ink") })()')

  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await fresh()
    await openBeasts()
    assert(await ev('!!document.querySelector("#tab-beasts .beast-fight-btn[data-fight=smoke_enc]:not([disabled])")'), `${mode}: the encounter card has a Fight button`)
    if (mode === 'overlay' || mode === 'phone') await shot(`combat-card-${mode}`)

    // prepare: nothing committed yet
    await click('#tab-beasts .beast-fight-btn[data-fight=smoke_enc]'); await sleep(500)
    assert(await ev('combatView.isOpen() && combatView.step === "prepare" && !gameState.get().family.fight'), `${mode}: Fight opens the prepare step, no battle yet`)
    assert(await ev('document.querySelectorAll("#combat-panel .cb-stance").length === 2'), `${mode}: two stances with odds`)
    await ev('combatView.scene.freeze(0)'); await shot(`combat-prepare-${mode}`)

    // the battle: lose one exchange, then win it out (Press every time)
    await click('#combat-panel .cb-stance.slay'); await sleep(300)
    assert(await ev('gameState.get().family.fight?.kind === "beast" && combatView.step === "fight"'), `${mode}: Slay starts the battle`)
    await rng(0.999); await ev('combatView.lockUntil = 0'); await click('#combat-panel [data-tac="press"]'); await unrng()
    await sleep(300)
    assert(await ev('gameState.get().health < 100 && document.querySelector("#combat-panel .cb-last.down") != null'), `${mode}: a lost exchange costs Health and says so`)
    await ev('combatView.scene.freeze(0.5, { type: "ex", you: "press", them: "press", won: false, dmg: 7 })'); await shot(`combat-hit-${mode}`)
    await ev('combatView.scene.start()'); await rng(0.0)
    for (let i = 0; i < 4; i++) { await ev('combatView.lockUntil = 0'); await click('#combat-panel [data-tac="feint"]'); await sleep(120) }
    await unrng()
    await ev('combatView.scene.freeze(0.46, { type: "ex", you: "feint", them: "guard", won: true })'); await shot(`combat-fight-${mode}`)
    assert(await ev('combatView.step === "end" && document.querySelectorAll("#combat-panel .cb-end").length === 3'), `${mode}: a won battle offers finish / spare / bind`)
    await ev('combatView.scene.freeze(0, null, { foe: "down" })'); await shot(`combat-end-${mode}`)

    // why these odds (the breakdown card) — from a fresh prepare in desktop only
    if (mode === 'desktop') {
      await click('#combat-panel .cb-end.finish'); await sleep(300)
      assert(await ev('combatView.step === "result" && !!document.querySelector("#combat-panel .cb-loot")'), 'finish: the result card lists the spoils')
      await ev('combatView.scene.freeze(0.4, { type: "finish" }, { foe: "down" })'); await shot('combat-finish-desktop')
      await ev('combatView.step = "result"; combatView.close()')
      await fresh('golden_dragon'); await openBeasts()
      await click('#tab-beasts .beast-fight-btn[data-fight=smoke_enc]'); await sleep(400)
      await click('#combat-panel .cb-why'); await sleep(400)
      assert(await ev('!document.getElementById("breakdown-overlay").classList.contains("hidden") && /Battle odds/.test(document.querySelector(".bd-pop")?.textContent)'), 'Why these odds opens the battle breakdown card')
      await ev('combatView.scene.freeze(0)'); await shot('combat-why-desktop')
      await ev('document.querySelector("[data-bd-close]")?.click()')
    } else {
      await rng(0.1)                              // Phase 41: force the bind roll to succeed (crude 40%)
      await click('#combat-panel .cb-end.bind'); await unrng(); await sleep(300)
      assert(await ev('combatView.step === "result" && gameState.get().beasts.some(b => b.id === "smoke_enc" && b.level === 2)'), `${mode}: bind: the beast joins at Lv.2`)
      await ev('combatView.scene.freeze(0.5, { type: "bind" }, { foe: "down" })'); await shot(`combat-bind-${mode}`)
      await ev('gameState.get().beasts = gameState.get().beasts.filter(b => b.id !== "smoke_enc")')
    }
    await ev('combatView.step = "result"; combatView.close()')
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }

  // Phase 41: the tame grade picker on the encounter card + both failure outcomes
  await pick('expanded'); await fresh('spirit_fox')
  await ev('(() => { const s = gameState.get(); s.inventory = { beast_taming_talisman: 1, beast_taming_talisman_fine: 2 }; gameState._recalc(); gameState._notify() })()')
  await openBeasts()
  assert(await ev('document.querySelectorAll("#tab-beasts .tame-grades [data-tamegrade]").length === 2'), 'holding two grades shows a chip per grade')
  assert(await ev('/Tame · Fine \\(55%\\)/.test(document.querySelector("#tab-beasts .beast-tame-btn").textContent)'), 'the Tame button names the best grade and its chance')
  await click('#tab-beasts .tame-grades [data-tamegrade="crude"]'); await sleep(200)
  assert(await ev('/Tame · Crude \\(40%\\)/.test(document.querySelector("#tab-beasts .beast-tame-btn").textContent)'), 'picking another chip changes the shown chance')
  await rng(0.999); await click('#tab-beasts .beast-tame-btn'); await unrng(); await sleep(300)
  assert(await ev('gameState.get().beastEncounters.length === 0'), 'a failed tame can lose the beast (it escapes)')
  await fresh('blood_python')   // fell: the failure turns on you
  await ev('gameState.get().inventory.beast_taming_talisman = 1; gameState._recalc(); gameState._notify()')
  await openBeasts()
  await rng(0.6); await click('#tab-beasts .beast-tame-btn'); await unrng(); await sleep(400)
  assert(await ev('combatView.isOpen() && combatView.step === "fight" && gameState.get().family.fight?.beast?.encId === "smoke_enc"'), 'a failed tame can turn it hostile → the battle page opens')
  await ev('combatView.step = "result"; combatView.close()')

  // Step back mid-fight: the battle waits; the attention strip brings it back
  await pick('expanded'); await fresh('spirit_fox'); await openBeasts()
  await click('#tab-beasts .beast-fight-btn[data-fight=smoke_enc]'); await sleep(300)
  await click('#combat-panel .cb-stance.drive'); await sleep(200)
  await click('#combat-close'); await sleep(300)
  assert(await ev('!combatView.isOpen() && gameState.get().family.fight?.kind === "beast"'), 'Step back leaves the battle waiting')
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "fight" && i.open === "combat")'), 'an attention item reopens it')
  await ev('combatView.resume()'); await sleep(300)
  assert(await ev('combatView.isOpen() && combatView.step === "fight"'), 'resume returns to the fight')
  await click('#combat-panel [data-tac="retreat"]'); await sleep(300)
  assert(await ev('!gameState.get().family.fight && combatView.step === "result" && gameState.get().beastEncounters.length === 1'), 'retreat ends it; the beast stays')
  await ev('combatView.step = "result"; combatView.close()')

  // Perf
  await fresh(); await openBeasts(); await click('#tab-beasts .beast-fight-btn[data-fight=smoke_enc]'); await sleep(500)
  const ms = await ev('combatView.scene.perf(40)')
  console.log(`     battle scene frame ${ms.toFixed(2)} ms`)
  assert(ms < 12, `battle scene frame under 12 ms (${ms.toFixed(2)})`)
  await ev('combatView.step = "result"; combatView.close()')

  // A deadly loss: Slay a Golden Dragon while wounded → you fall, the page closes, the death card follows the moment
  await fresh('golden_dragon'); await ev('gameState.get().stageIndex = 20; gameState.get().health = 40; gameState._recalc()')
  await openBeasts(); await click('#tab-beasts .beast-fight-btn[data-fight=smoke_enc]'); await sleep(400)
  assert(await ev('!!document.querySelector("#combat-panel .cb-stance.slay.deadly")'), 'Slay is marked deadly when a loss could kill you')
  await click('#combat-panel .cb-stance.slay'); await sleep(200)
  await rng(0.999)
  for (let i = 0; i < 6 && await ev('combatView.step === "fight"'); i++) { await ev('combatView.lockUntil = 0'); await click('#combat-panel [data-tac="guard"]'); await sleep(100) }
  await unrng()
  assert(await ev('combatView.step === "died" && gameState.get().lastReincarnation?.cause === "beast_hunt"'), 'you die to the dragon (cause beast_hunt)')
  await sleep(1900); await shot('combat-died')
  await sleep(1700)
  assert(await ev('!combatView.isOpen()'), 'the battle page closes after the fall')
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")', 4000)
  assert(await ev('/beast you went to slay/.test(document.getElementById("death-cause").textContent)'), 'the death card names the beast hunt')
}
