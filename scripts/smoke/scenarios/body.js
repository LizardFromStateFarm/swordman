// Real-app smoke scenario — Phase 14 Body Constitution (docs/systems/body-constitution.md). Path → Body in Overlay /
// Expanded / Desktop / phone: the hero card (tier seal, XP bar + trial mark, effect chips), the method list by group
// (costs, locks), a tempering begun through the real button (the running card + countdown), an ordeal's crisis card
// (Endure / Ease off / Draw on Qi + the odds "why"), the tier trial card, scars + taint, the Character view's Health
// "n / max" + Body tile + Meridian Flow button, and the mini-games played through the real overlay: Push-Ups (its
// animated ExerciseScene figure — drawn + under the perf budget + a still pose under Reduced motion — to its result),
// Running (the stride: two foot buttons, the animated runner, taps on the beat) and Lift (the strain meter + the
// body tier's load, Phase 52c), Meridian Flow solved, and Memorization (the acupoint grid, cleared through the real
// tiles, Phase 52d). Asserts no horizontal overflow.
// Screenshots: scripts/smoke/out/body-*.png.
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

  // Mini-game: Push-Ups through the real overlay
  await ev('gameState.get().minigames.pushups.cdUntil = 0')
  await ev('document.querySelector(\'#tab-physique [data-mg-open="pushups"]\').click()'); await sleep(400)
  assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden") && !!document.querySelector(".mg-bar")'), 'Push-Ups: the overlay opens with the bar')
  await shot('body-pushups-play')
  // Phase 52b: the animated ExerciseScene figure — drawn on its own canvas, under the art-engine perf budget
  assert(await ev('!!document.querySelector("#mg-overlay .mg-ex") && !!MinigameUI.scene'), 'Push-Ups: the exercise figure canvas is shown')
  assert(await ev('(() => { const c = document.querySelector("#mg-overlay .mg-ex"); if (!c) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 12) { n++; if (n > 200) return true } return false })()'), 'Push-Ups: the figure is drawn on the canvas')
  assert(await ev('MinigameUI.scene.perf(40) < 6'), 'Push-Ups: the figure frame stays under the 6 ms budget')
  // clean stills for the asset gate: the top and the bottom of the press, magnified
  const figClip = await ev('(() => { const b = document.querySelector("#mg-overlay .mg-ex").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, scale: 3 } })()')
  await ev('MinigameUI.scene.freeze(0); MinigameUI.scene._draw()'); await sleep(70)
  await shot('body-pushups-figure', figClip)
  await ev('MinigameUI.scene.freeze(1); MinigameUI.scene.kick("perfect"); MinigameUI.scene._draw()'); await sleep(70)
  await shot('body-pushups-figure-low', figClip)
  await ev('MinigameUI.scene.start()')
  // strike on the seal (a real timing read, like a player): wait for the marker to cross the seal centre, then tap
  for (let i = 0, N = await ev('STRIKES.strikes'); i < N; i++) {
    await ev(`new Promise(res => { const M = MinigameUI, t0 = performance.now(); const go = () => { const p = M._pos(performance.now()), w = M._sealW()
      if (Math.abs(p - M.st.center) < w * (${i % 3 === 2 ? 0.4 : 0.1}) || performance.now() - t0 > 4000) { document.querySelector('.mg-strike').click(); res(1) } else requestAnimationFrame(go) }; go() })`)
    await sleep(120)
  }
  assert(await ev('!!document.querySelector(".mg-result .mg-score")'), 'Push-Ups: every rep reaches the result')
  await shot('body-pushups-result')
  await ev('document.querySelector(\'.mg-pick [data-mg="take-xp"]\').click()'); await sleep(300)
  assert(await ev('document.getElementById("mg-overlay").classList.contains("hidden")'), 'Push-Ups: taking the reward closes the overlay')

  // Phase 52b: Reduced motion holds a still pose (no rAF loop)
  await ev('gameState.get().settings.reducedMotion = true; gameState.get().minigames.pushups.cdUntil = 0; gameState._notify()'); await sleep(200)
  await ev('document.querySelector(\'#tab-physique [data-mg-open="pushups"]\').click()'); await sleep(300)
  assert(await ev('!!MinigameUI.scene && MinigameUI.scene.calm === true && MinigameUI.scene.running === false'), 'Push-Ups: Reduced motion holds a still pose (no loop)')
  await shot('body-pushups-calm')
  await ev('document.querySelector(\'[data-mg="quit"]\').click()'); await sleep(150)
  await ev('gameState.get().settings.reducedMotion = false')

  // Phase 52c: Running + Lift through the real overlay — a body high enough to have unlocked them
  await ev('(() => { const s = gameState.get(); s.body.tier = 3; s.minigames.run.cdUntil = 0; s.minigames.lift.cdUntil = 0; gameState._recalc(); gameState._notify() })()')
  await openBody(); await sleep(250)
  assert(await ev('!!document.querySelector(\'#tab-physique .bd-chips .ic-lift\')'), 'Body: the hero names the load you can lift')

  // Running — stride taps on the beat, alternating left/right feet
  await ev('document.querySelector(\'#tab-physique [data-mg-open="run"]\').click()'); await sleep(400)
  assert(await ev('!!document.querySelector(".mg-feet .mg-foot[data-side=L]") && !!document.querySelector(".mg-feet .mg-foot[data-side=R]") && !!document.querySelector(".mg-bar")'), 'Running: the overlay shows a bar + two foot buttons')
  assert(await ev('!!MinigameUI.scene && MinigameUI.scene.ex === "run" && document.querySelector("#mg-overlay .mg-ex")'), 'Running: the stride figure is drawn')
  await shot('body-run-play')
  const runClip = await ev('(() => { const b = document.querySelector("#mg-overlay .mg-ex").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, scale: 3 } })()')
  // the stride at three phases (contact · push-off · the other foot's contact), magnified
  for (const [ph, tag] of [[0, ''], [0.3, '-push'], [0.62, '-swing']]) {
    await ev(`MinigameUI.scene.freeze(${ph}); MinigameUI.scene._draw()`); await sleep(70)
    await shot('body-run-figure' + tag, runClip)
  }
  await ev('MinigameUI.scene.start()')
  for (let i = 0, N = await ev('MinigameUI.st.reps'); i < N; i++) {
    await ev(`new Promise(res => { const M = MinigameUI, t0 = performance.now(); const go = () => { const p = M._pos(performance.now()), w = M._sealW(), due = M.st.sides[M.st.i]
      if (Math.abs(p - M.st.center) < w * 0.1 || performance.now() - t0 > 4000) { document.querySelector('.mg-foot[data-side="' + due + '"]').click(); res(1) } else requestAnimationFrame(go) }; go() })`)
    await sleep(90)
  }
  assert(await ev('!!document.querySelector(".mg-result .mg-score")'), 'Running: the stride reaches the result')
  await shot('body-run-result')
  await ev('document.querySelector(\'.mg-pick [data-mg="take-xp"]\').click()'); await sleep(300)
  assert(await ev('document.getElementById("mg-overlay").classList.contains("hidden")'), 'Running: taking the reward closes the overlay')

  // Lift — hold, and let go near the top of the strain
  await ev('document.querySelector(\'#tab-physique [data-mg-open="lift"]\').click()'); await sleep(400)
  assert(await ev('!!document.querySelector(".mg-strain .mg-gold") && !!document.querySelector(".mg-foot .mg-lift")'), 'Lift: the overlay shows the strain meter with its gold zone')
  assert(await ev('!!MinigameUI.scene && MinigameUI.scene.ex === "lift" && MinigameUI.scene.liftTier === 3'), 'Lift: the figure holds the body tier’s load')
  await shot('body-lift-play')
  const liftClip = await ev('(() => { const b = document.querySelector("#mg-overlay .mg-ex").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, scale: 3 } })()')
  // the lift's three beats: the squat under the load · up through the chest · locked out overhead
  for (const [p, tag] of [[0, ''], [0.45, '-chest'], [1, '-overhead']]) {
    await ev(`MinigameUI.scene.freeze(${p}); MinigameUI.scene._draw()`); await sleep(70)
    await shot('body-lift-figure' + tag, liftClip)
  }
  // Asset-gate evidence: the whole LIFT_ITEMS ladder — the load drawn at every rung
  for (let i = 0, n = await ev('LIFT_ITEMS.length'); i < n; i++) {
    await ev(`MinigameUI.scene.liftTier = ${i}; MinigameUI.scene.freeze(1); MinigameUI.scene._draw()`); await sleep(60)
    await shot(`body-lift-item-${i}`, liftClip)
  }
  await ev('MinigameUI.scene.liftTier = 3; MinigameUI.scene.start()')
  for (let i = 0, N = await ev('MinigameUI.st.reps'); i < N; i++) {
    await ev(`new Promise(res => { const M = MinigameUI; M._holdDown(); const t0 = performance.now(); const go = () => { const t = (performance.now() - M.st.held0) / 1000
      if (t >= HOLD.riseSecs * 0.94 || performance.now() - t0 > 4000) { M._holdUp(); res(1) } else requestAnimationFrame(go) }; go() })`)
    await sleep(460)
  }
  assert(await ev('!!document.querySelector(".mg-result .mg-score")'), 'Lift: the reps reach the result')
  await shot('body-lift-result')
  await ev('document.querySelector(\'.mg-pick [data-mg="take-xp"]\').click()'); await sleep(300)

  // Mini-game: Meridian Flow, solved by turning the real tiles
  await ev('gameState.get().minigames.flow.cdUntil = 0')
  await ev('document.querySelector(\'#tab-physique [data-mg-open="flow"]\').click()'); await sleep(400)
  assert(await ev('document.querySelectorAll(".mg-grid .mg-tile").length >= 16'), 'Flow: the channel grid is dealt')
  await shot('body-flow-play')
  await ev(`(() => { const st = MinigameUI.st, p = st.p
    p.shown.forEach((m, i) => { const t = [0,1,2,3].find(k => FlowPuzzle.rot(m, k) === p.solved[i]); for (let k = 0; k < t; k++) document.querySelector('.mg-tile[data-i="' + i + '"]').click() }) })()`)
  await sleep(400)
  assert(await ev('/channels open/.test(document.querySelector(".mg-foot").textContent)'), 'Flow: solving it opens the channels (+Qi)')
  await shot('body-flow-solved')
  await ev('document.querySelector(\'.mg-foot [data-mg="close"]\')?.click()'); await sleep(200)

  // Phase 52d: Memorization — the acupoint sequence, played through the real tiles (a full clear)
  await ev('gameState.get().minigames.memory.cdUntil = 0')
  await ev('document.querySelector(\'#tab-physique [data-mg-open="memory"]\').click()'); await sleep(400)
  assert(await ev('document.querySelectorAll("#mg-overlay .mg-acu .mg-acu-t").length === 9 && Array.isArray(MinigameUI.st.plan)'), 'Memorization: a 3×3 acupoint grid is dealt')
  await ev('MinigameUI._acuLit(4)'); await sleep(90)
  await shot('body-memory-play')
  // Drive the sequence: skip the watch timers, take the turn, tap the seeded cells through the real tiles.
  // Wind the session clock back first so the anti-script floor (the lights must have had time to play) is satisfied.
  await ev('gameState.get().minigames.memory.session.startedAt -= 8000')
  await ev(`(async () => { const M = MinigameUI, nap = ms => new Promise(r => setTimeout(r, ms))
    for (let r = 0; r < M.st.plan.length && !M.st.done; r++) { M._clearTimers(); M._memoryTurn(); M.st.plan[r].forEach(c => M._acu(c)); await nap(30) } })()`)
  await sleep(400)
  assert(await ev('!!document.querySelector("#mg-overlay .mg-result .mg-score") && /Every sequence held/.test(document.querySelector("#mg-overlay .mg-sub")?.textContent || "")'), 'Memorization: a full clear reaches the result')
  await shot('body-memory-result')
  await ev('document.querySelector(\'.mg-pick [data-mg="close"]\')?.click()'); await sleep(300)
  assert(await ev('document.getElementById("mg-overlay").classList.contains("hidden")'), 'Memorization: taking the Qi closes the overlay')

  // A miss: the wrong tap is marked and the acupoint that was due is shown; the run still resolves
  await ev('gameState.get().minigames.memory.cdUntil = 0; gameState._notify()'); await sleep(200)
  await ev('document.querySelector(\'#tab-physique [data-mg-open="memory"]\').click()'); await sleep(300)
  await ev('MinigameUI._clearTimers(); MinigameUI._memoryTurn()')
  await ev('(() => { const M = MinigameUI, seq = M.st.plan[0], wrong = [0,1,2,3,4,5,6,7,8].find(c => c !== seq[0]); M._acu(wrong) })()')
  assert(await ev('!!document.querySelector(".mg-acu-t.miss") && !!document.querySelector(".mg-acu-t.due-hint")'), 'Memorization: a wrong tap marks the tile and the acupoint that was due')
  await sleep(200)
  await shot('body-memory-miss')
  await sleep(1400)
  assert(await ev('!!document.querySelector("#mg-overlay .mg-result .mg-score")'), 'Memorization: a miss still reaches a result')
  await ev('document.querySelector(\'.mg-pick [data-mg="close"]\')?.click()'); await sleep(200)

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
    // Clear every Practice cooldown and re-render — the buttons bake `disabled` at render, so cdUntil=0 alone races.
    await ev('(() => { const s = gameState.get(); s.minigames.pushups.cdUntil = 0; s.minigames.lift.cdUntil = 0; s.minigames.memory.cdUntil = 0; gameState._notify() })()'); await sleep(250)
    await ev('document.querySelector(\'#tab-physique [data-mg-open="pushups"]\')?.click()'); await sleep(400)
    assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden")'), `${mode}: the Push-Ups overlay opens`)
    await shot(`body-${mode}-pushups`)
    await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
    // Phase 52c: the Lift strain in the roomier layouts
    await ev('document.querySelector(\'#tab-physique [data-mg-open="lift"]\')?.click()'); await sleep(400)
    assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden")'), `${mode}: the Lift overlay opens`)
    await shot(`body-${mode}-lift`)
    await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
    // Phase 52d: the acupoint grid in the roomier layouts
    await ev('document.querySelector(\'#tab-physique [data-mg-open="memory"]\')?.click()'); await sleep(400)
    assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden")'), `${mode}: the Memorization overlay opens`)
    await ev('MinigameUI._acuLit(2)'); await sleep(90)
    await shot(`body-${mode}-memory`)
    await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
  }
  await layout('overlay')

  await emulate(390, 844); await sleep(600)
  await layout('desktop')
  await openBody()
  await shot('body-phone')
  await noOverflow('phone')
  await ev('(() => { const s = gameState.get(); s.minigames.flow.cdUntil = 0; s.minigames.run.cdUntil = 0; s.minigames.memory.cdUntil = 0; gameState._notify() })()'); await sleep(300)
  await ev('document.querySelector(\'#tab-physique [data-mg-open="flow"]\')?.click()'); await sleep(400)
  assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden")'), 'phone: the Flow overlay opens')
  await shot('body-phone-flow')
  await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
  await ev('document.querySelector(\'#tab-physique [data-mg-open="run"]\')?.click()'); await sleep(400)
  assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden")'), 'phone: the Running overlay opens')
  await shot('body-phone-run')
  await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
  await ev('document.querySelector(\'#tab-physique [data-mg-open="memory"]\')?.click()'); await sleep(400)
  assert(await ev('!document.getElementById("mg-overlay").classList.contains("hidden")'), 'phone: the Memorization overlay opens')
  await ev('MinigameUI._acuLit(6)'); await sleep(90)
  await shot('body-phone-memory')
  await ev('document.querySelector(\'[data-mg="quit"]\')?.click()'); await sleep(200)
  await clearEmulation()
  await layout('overlay')
}
