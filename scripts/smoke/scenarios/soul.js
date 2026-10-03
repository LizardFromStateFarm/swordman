// Real-app smoke scenario — Phase 40a Soul Points (docs/systems/soul-points.md). A fresh install shows no Soul button;
// the Ascension Trial card names what a fall would leave behind; a failed Trial writes "+N Soul Points" on the death
// card; the attention strip + Hall door point at the new points; the Soul screen spends one rank per click and the
// Qi/s breakdown names the term; the record is shared by the charselect, survives a reload and a slot delete.
// Screenshots: scripts/smoke/out/soul-*.png (every layout mode + phone).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/soul.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await click('#btn-layout')
    await wait('!document.getElementById("layout-picker").classList.contains("hidden")')
    await click(`.layout-opt[data-layout="${mode}"]`)
    await sleep(800)
  }
  const soulOpen = () => ev('!document.getElementById("soul-overlay").classList.contains("hidden")')
  const toHall = async () => { await click('.tab[data-group="kin"]'); await click('.subtab[data-tab="hall"]'); await sleep(300) }

  // ── Fresh install ──
  assert(await ev('document.getElementById("cs-soul").classList.contains("hidden")'), 'fresh install: no Soul button on the charselect')
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()'); await sleep(400)

  // ── The Trial card, then a failed Trial ──
  await ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = CULTIVATION_STAGES.length - 2; s.maxStageThisLife = s.stageIndex
    gs._recalc(); s.qi = s.derived.qiCap; gs._recalc(); gs._notify() })()`); await sleep(400)
  await click('#btn-breakthrough')
  await wait('!document.getElementById("ascension-overlay").classList.contains("hidden")')
  // Phase 47: below the full bloodline the Trial is locked — no chance shown, the button refused.
  assert(await ev('document.getElementById("ascend-now").disabled && !document.getElementById("asc-lock").classList.contains("hidden")'), 'Trial locked below Bloodline 100')
  assert((await ev('document.getElementById("asc-chance").textContent')) === 'Locked', 'Trial card: Survival Chance reads Locked')
  await shot('soul-trial-locked')
  for (const mode of ['expanded', 'desktop']) { await pick(mode); await shot(`soul-trial-locked-${mode}`) }
  await emulate(390, 844); await pick('desktop'); await sleep(400); await shot('soul-trial-locked-phone')
  await clearEmulation(); await pick('overlay'); await sleep(300)
  await click('#ascend-wait')
  await ev('(() => { const s = gameState.get(); s.bloodlineQuality = ASCENSION_MIN_BLOODLINE; gameState._recalc(); gameState._notify() })()'); await sleep(300)
  await click('#btn-breakthrough')
  await wait('!document.getElementById("ascension-overlay").classList.contains("hidden")')
  const want = await ev('Math.round(SOUL_FAIL_BASE + SOUL_FAIL_PER_PCT * Math.round(gameState.ascensionChance() * 100))')
  assert((await ev('document.getElementById("asc-soul").textContent')) === `+${want} Soul Points`, `Trial card: "Should you fall +${want} Soul Points"`)
  await shot('soul-trial-card')
  await ev('window._rnd = Math.random; Math.random = () => 0.999999')
  await click('#ascend-now')
  await ev('Math.random = window._rnd')
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")', 8000); await sleep(1000)
  assert(await ev('gameState.getSoul().points') === want, `the fall granted ${want} Soul Points`)
  const line = await ev('document.getElementById("death-soul").textContent.replace(/\\s+/g, " ")')
  assert(/Your soul remembers: \+\d+ Soul Points/.test(line) && /odds/.test(line), `death card: "${line.trim()}"`)
  await shot('soul-death-card')
  for (let i = 0; i < 12 && !(await ev('document.getElementById("death-overlay").classList.contains("hidden")')); i++) {
    await ev(`(() => { const ok = document.getElementById('death-ok'); if (ok && !ok.disabled && ok.offsetParent) ok.click()
      else document.querySelector('#interlude-choices button:not([disabled])')?.click() })()`); await sleep(400)
  }

  // ── Discovery: attention item + Hall door with its dot ──
  assert(await ev('collectAttention(gameState.get(), gameState).some(i => i.id === "soul")'), 'attention: "Your soul remembers" is listed')
  await toHall()
  assert(await ev('!!document.querySelector("#tab-hall .soul-door.fresh")'), 'Hall: the Soul door carries the fresh dot')
  await shot('soul-hall-overlay')

  // A few more lives' worth of history for the screens
  await ev(`(() => { const gs = gameState; gs._grantSoul('fail', 48, { chance: 0.56 }); gs._grantSoul('fail', 61, { chance: 0.82 }) })()`)
  await click('#tab-hall .soul-door'); await sleep(500)
  assert(await soulOpen(), 'the Hall door opens the Soul screen')
  assert(await ev('gameState.getSoul().seen'), 'opening it clears the discovery dot')
  await shot('soul-screen-overlay')

  // ── Spend one rank ──
  const q0 = await ev('gameState.get().derived.qiPerSecond')
  await click('#soul-box .soul-buy.ready'); await sleep(300)
  assert(await ev('gameState.getSoul().resonance') === 1, 'one click = one rank')
  const q1 = await ev('gameState.get().derived.qiPerSecond')
  assert(Math.abs(q1 / q0 - 1.05) < 1e-6, 'Qi/s rose 5%')
  assert(await ev('gameState.get().derived.breakdown.qps.some(p => p.label === "Soul Resonance (rank 1)")'), 'Qi/s breakdown names Soul Resonance (rank 1)')
  await click('#soul-box .soul-buy.ready'); await click('#soul-box .soul-buy.ready'); await sleep(200)
  await shot('soul-screen-overlay-spent')
  await ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))'); await sleep(200)
  assert(!(await soulOpen()), 'Escape closes the Soul screen')

  for (const mode of ['expanded', 'desktop']) {
    await pick(mode); await toHall(); await shot(`soul-hall-${mode}`)
    await click('#tab-hall .soul-door'); await sleep(500); await shot(`soul-screen-${mode}`)
    await click('#soul-box [data-soul="close"]'); await sleep(200)
  }
  await pick('banner'); await sleep(300)
  await ev('document.querySelector(".att-row, .att-item, [data-att]")?.click()'); await sleep(300)
  await pick('overlay')

  // ── Phone ──
  await emulate(390, 844); await pick('desktop'); await sleep(600)
  await toHall(); await click('#tab-hall .soul-door'); await sleep(500)
  await shot('soul-screen-phone')
  await click('#soul-box [data-soul="close"]')
  await clearEmulation(); await pick('overlay')

  // ── Charselect door, reload, slot delete ──
  await click('#btn-back'); await sleep(600)
  assert(await ev('!document.getElementById("cs-soul").classList.contains("hidden")'), 'charselect: the Soul button shows once points exist')
  await shot('soul-charselect')
  await click('#cs-soul'); await sleep(500)
  assert(await soulOpen(), 'charselect: the button opens the Soul screen')
  await shot('soul-screen-charselect')
  await click('#soul-box [data-soul="close"]')
  const before = await ev('gameState.getSoul()')
  await ev('location.reload()'); await sleep(1500)
  await wait('document.getElementById("cs-slots")?.children.length', 10000)
  assert(await ev('gameState.getSoul().resonance') === before.resonance && await ev('gameState.getSoul().points') === before.points, 'the record survives a reload')
  await ev('(async () => { await window.electron.deleteSlot(0) })()')
  await ev('location.reload()'); await sleep(1500)
  await wait('document.getElementById("cs-slots")?.children.length', 10000)
  assert(await ev('gameState.getSoul().earned') === before.earned, 'deleting the slot leaves the soul untouched')
}
