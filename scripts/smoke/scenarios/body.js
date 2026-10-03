// Real-app smoke scenario — Phase 14 Body Constitution (docs/systems/body-constitution.md). Path → Body in Overlay /
// Expanded / Desktop / phone: the hero card (tier seal, XP bar + trial mark, effect chips), the method list by group
// (costs, locks), a tempering begun through the real button (the running card + countdown), an ordeal's crisis card
// (Endure / Ease off / Draw on Qi + the odds "why"), the tier trial card, scars + taint, the Character view's Health
// "n / max" + Body tile + Meridian Flow button, and both mini-games played through the real overlay (Tempering Strikes
// to its result; Meridian Flow solved). Asserts no horizontal overflow. Screenshots: scripts/smoke/out/body-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/body.js
module.exports = async ({ ev, click, wait, assert, sleep, shot, emulate, clearEmulation }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')

  const layout = async mode => {
    await ev('document.getElementById("btn-layout").click()'); await sleep(150)
    await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700)
  }
  const openBody = async () => { await click('#tabs [data-group="cultivate"]'); await sleep(200); await click('[data-tab="physique"]'); await sleep(350) }
  const noOverflow = async tag => assert(await ev('document.documentElement.scrollWidth <= innerWidth + 1'), `${tag}: no horizontal overflow`)

  // A cultivator with materials, a little XP, a scar + taint (so every card has something to show)
  await ev(`(() => { const s = gameState.get(); Object.assign(s.inventory, { beast_core: 30, iron_ore: 20, celestial_herb: 8, demon_essence: 8, pill_golden_marrow: 1 })
    s.spiritStones = Math.max(s.spiritStones, 2000); s.body.xp = 120; s.body.tier = 0; s.health = 70; gameState._recalc(); gameState._notify() })()`)

  await openBody()
  assert(await ev('!!document.querySelector("#tab-physique .bd-hero .bd-seal")'), 'Body: the hero card shows the tier seal')
  assert(await ev('document.querySelectorAll("#tab-physique .bd-method").length >= 8'), 'Body: the tempering methods are listed')
  assert(await ev('/Max Health/.test(document.querySelector("#tab-physique .bd-chips").textContent)'), 'Body: the effect chips name Max Health')
  await shot('body-overlay-top')

  // Begin a drill through the real button → the running card with a countdown
  await ev('document.querySelector(\'#tab-physique [data-bd-act="begin"][data-id="iron_fist"]\').click()'); await sleep(300)
  assert(await ev('gameState.get().body.active?.id === "iron_fist"'), 'Begin: Iron Fist Training is underway')
  assert(await ev('!!document.querySelector("#tab-physique .bd-active [data-bd-left]")'), 'the running card shows a live countdown')
  await ev('document.querySelector("#tab-physique .bd-active")?.scrollIntoView({ block: "center" })'); await sleep(200)
  assert(await ev('(() => { const a = document.querySelector("#tab-physique .bd-active"), d = document.querySelector("#tab-physique .bd-group"); return a.getBoundingClientRect().top < d.getBoundingClientRect().top })()'), 'Overlay: the running tempering sits above the method lists')
  await shot('body-overlay-active')

  // Finish it (time passes), then force an ordeal to its peak → the crisis card
  await ev(`(() => { const s = gameState.get(); s.body.active.endsAt = Date.now() - 1; gameState._tickBody()
    s.stageIndex = Math.max(s.stageIndex, 10); s.body.active = { id: 'icy_waterfall', startedAt: Date.now() - 43200e3, endsAt: Date.now() - 1, xp: 4000, crisis: false }
    gameState._tickBody(); gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  assert(await ev('gameState.get().body.xp >= 160'), 'a finished drill paid its XP')
  assert(await ev('document.querySelectorAll("#tab-physique .bd-crisis [data-bd-act]").length === 3'), 'the ordeal crisis offers Endure / Ease off / Draw on Qi')
  assert(await ev('!!document.querySelector("#tab-physique .bd-crisis .bd-why[data-bd=ordeal]")'), 'the crisis explains its odds (a why link, not inside a button)')
  assert(await ev('collectAttention(gameState.get(), gameState).some(x => x.id === "ordeal")'), 'attention: the ordeal waits on you')
  await shot('body-overlay-crisis')
  await ev('document.querySelector("#tab-physique .bd-crisis")?.scrollIntoView({ block: "start" })'); await sleep(200)
  await shot('body-overlay-crisis-card')
  await ev('document.querySelector(\'#tab-physique .bd-crisis [data-bd-act="ease"]\').click()'); await sleep(300)
  assert(await ev('!gameState.get().body.active'), 'Ease off resolves the ordeal')

  // The trial is ready (the XP passed E's mark) + a scar and taint
  await ev(`(() => { const s = gameState.get(); s.body.xp = Math.max(s.body.xp, 260); s.body.scars = [{ id: 'torn_sinews', cause: 'Volcanic Immersion', year: 30 }]; s.body.taint = 2
    gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  assert(await ev('document.querySelectorAll("#tab-physique .bd-trial [data-bd-act]").length === 2'), 'the tier trial offers the marrow / the bitter way')
  assert(await ev('!!document.querySelector("#tab-physique .bd-marks .bd-scar")'), 'scars are listed with a Mend button')
  await shot('body-overlay-trial')
  await ev('document.querySelector("#tab-physique .bd-trial")?.scrollIntoView({ block: "start" })'); await sleep(200)
  await shot('body-overlay-trial-card')
  await noOverflow('Overlay')

  // Mini-game: Tempering Strikes through the real overlay
  await ev('document.querySelector(\'#tab-physique [data-mg-open="strikes"]\').click()'); await sleep(400)
  assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden") && !!document.querySelector(".mg-bar")'), 'Strikes: the overlay opens with the bar')
  await shot('body-strikes-play')
  // strike on the seal (a real timing read, like a player): wait for the marker to cross the seal centre, then tap
  for (let i = 0, N = await ev('STRIKES.strikes'); i < N; i++) {
    await ev(`new Promise(res => { const M = MinigameUI, t0 = performance.now(); const go = () => { const p = M._pos(performance.now()), w = M._sealW()
      if (Math.abs(p - M.st.center) < w * (${i % 3 === 2 ? 0.4 : 0.1}) || performance.now() - t0 > 4000) { document.querySelector('.mg-strike').click(); res(1) } else requestAnimationFrame(go) }; go() })`)
    await sleep(120)
  }
  assert(await ev('!!document.querySelector(".mg-result .mg-score")'), 'Strikes: every strike reaches the result')
  await shot('body-strikes-result')
  await ev('document.querySelector(\'.mg-pick [data-mg="take-xp"]\').click()'); await sleep(300)
  assert(await ev('document.getElementById("mg-overlay").classList.contains("hidden")'), 'Strikes: taking the reward closes the overlay')

  // Mini-game: Meridian Flow, solved by turning the real tiles
  await ev('document.querySelector(\'#tab-physique [data-mg-open="flow"]\').click()'); await sleep(400)
  assert(await ev('document.querySelectorAll(".mg-grid .mg-tile").length >= 16'), 'Flow: the channel grid is dealt')
  await shot('body-flow-play')
  await ev(`(() => { const st = MinigameUI.st, p = st.p
    p.shown.forEach((m, i) => { const t = [0,1,2,3].find(k => FlowPuzzle.rot(m, k) === p.solved[i]); for (let k = 0; k < t; k++) document.querySelector('.mg-tile[data-i="' + i + '"]').click() }) })()`)
  await sleep(400)
  assert(await ev('/channels open/.test(document.querySelector(".mg-foot").textContent)'), 'Flow: solving it opens the channels (+Qi)')
  await shot('body-flow-solved')
  await ev('document.querySelector(\'.mg-foot [data-mg="close"]\')?.click()'); await sleep(200)

  // Character view: Health n / max, the Body tile, the Meridian Flow button
  await click('[data-tab="stats"]'); await sleep(350)
  assert(await ev('!!document.querySelector(\'#tab-stats [data-bd="body"]\') && !!document.querySelector(\'#tab-stats [data-mg-open="flow"]\')'), 'Character: a Body tile + the Meridian Flow button')
  await shot('body-overlay-character')

  for (const mode of ['expanded', 'desktop']) {
    await layout(mode)
    await openBody()
    await ev('document.querySelector("#tab-physique")?.scrollTo?.(0, 0)')
    await shot(`body-${mode}`)
    await noOverflow(mode)
    await ev('document.querySelector(\'#tab-physique [data-mg-open="strikes"]\')?.click()'); await sleep(400)
    await shot(`body-${mode}-strikes`)
    await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
  }
  await layout('overlay')

  await emulate(390, 844); await sleep(600)
  await layout('desktop')
  await openBody()
  await shot('body-phone')
  await noOverflow('phone')
  await ev('gameState.get().minigames.flow.charges = 3')
  await ev('document.querySelector(\'#tab-physique [data-mg-open="flow"]\')?.click()'); await sleep(400)
  await shot('body-phone-flow')
  await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
  await clearEmulation()
  await layout('overlay')
}
