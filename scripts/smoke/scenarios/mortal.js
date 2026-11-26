// Real-app smoke scenario — Phase 49b The Mortal Arc (docs/systems/mortal-phase.md → "49b"). A fresh game is a mortal:
// the HUD reads AWAKEN; a pending beat leads Roam → Explore (title, choices, the Awaken goal), answers through the real
// buttons (a locked, unaffordable choice is disabled with its reason); the beat card across Overlay / Expanded / Desktop
// / phone (no overflow); then the Awakening — body D makes the button ready, it opens the Awakening card, Continue
// closes it and Qi Condensation begins. Screenshots: scripts/smoke/out/mortal-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/mortal.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(500)

  const openExplore = async () => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="explore"]'); await sleep(350) }
  const noOverflow = async tag => assert(await ev('document.documentElement.scrollWidth <= innerWidth + 1'), `${tag}: no horizontal overflow`)
  const layout = async mode => { await ev('document.getElementById("btn-layout").click()'); await sleep(150); await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700) }
  const fireBeat = id => ev(`(() => { const s = gameState.get(); s.mortal.beat = { id: ${JSON.stringify(id)}, year: 1 }; gameState._notify() })()`)

  // ── The HUD reads Awaken while mortal ──
  assert(await ev('document.querySelector("#btn-cultivate .act-name").textContent === "Awaken"'), 'the HUD Cultivate button reads Awaken while mortal')
  assert(await ev('document.querySelector("#btn-breakthrough .act-sub").textContent === "Awaken first"'), 'the Breakthrough button waits for the Awakening')

  // ── A pending beat leads Roam → Explore ──
  await fireBeat('first_breath')
  assert(await ev('collectAttention(gameState.get(), gameState).some(x => x.id === "mortal-beat")'), 'attention: a mortal beat waits on you')
  await openExplore()
  assert(await ev('!!document.querySelector("#tab-explore .mortal-card .mc-title") && /First Breath/.test(document.querySelector(".mortal-card .mc-title").textContent)'), 'Explore: the beat card leads the view')
  assert(await ev('document.querySelectorAll("#tab-explore .mc-choice").length === 3'), 'the beat offers its three answers')
  assert(await ev('/Awaken/.test(document.querySelector("#tab-explore .mc-goal").textContent)'), 'the card names the Awaken goal')
  await shot('mortal-overlay-beat')

  // Answer through the real button
  await ev('document.querySelectorAll("#tab-explore .mc-choice")[0].click()'); await sleep(400)
  assert(await ev('!gameState.get().mortal.beat'), 'answering the beat clears it')
  assert(await ev('!document.querySelector("#tab-explore .mortal-card .mc-title")'), 'the card is gone from Explore')

  // A locked choice shows its reason and cannot be answered
  await ev(`(() => { const s = gameState.get(); s.spiritStones = 0; s.mortal.beat = { id: 'the_smith', year: 1 }; gameState._notify() })()`)
  await sleep(300)
  assert(await ev('(() => { const b = [...document.querySelectorAll("#tab-explore .mc-choice")].find(x => /beast core/i.test(x.textContent)); return !!b && b.disabled && /Needs/.test(b.textContent) })()'), 'an unaffordable choice is shown locked with its reason')
  await shot('mortal-overlay-locked')

  // ── The beat card in the roomier layouts + a phone (no overflow) ──
  for (const mode of ['expanded', 'desktop']) {
    await layout(mode)
    await fireBeat('the_river')
    await openExplore()
    assert(await ev('!!document.querySelector("#tab-explore .mortal-card .mc-title")'), `${mode}: the beat card renders`)
    await shot(`mortal-${mode}`)
    await noOverflow(mode)
  }
  await layout('overlay')
  await emulate(390, 844); await sleep(600)
  await layout('desktop')
  await fireBeat('the_pedlar')
  await openExplore()
  assert(await ev('!!document.querySelector("#tab-explore .mortal-card .mc-title")'), 'phone: the beat card renders')
  await shot('mortal-phone')
  await noOverflow('phone')
  await clearEmulation()
  await layout('overlay')

  // ── The Awakening: body D makes the button ready, the card opens, Continue begins Qi Condensation ──
  await ev('gameState.get().mortal.beat = null; gameState.get().spiritStones = 15')
  await ev(`(() => { const s = gameState.get(); s.body.tier = BODY_TIERS.findIndex(t => t.id === BODY_AWAKEN_TIER); gameState._recalc(); gameState._notify() })()`)
  await sleep(300)
  assert(await ev('!document.querySelector("#btn-cultivate").disabled && /Open your meridians/.test(document.querySelector("#btn-cultivate .act-sub").textContent)'), 'at body D the Awaken button is ready')
  await shot('mortal-awaken-ready')
  await ev('document.getElementById("btn-cultivate").click()'); await sleep(400)
  assert(await ev('!document.getElementById("awaken-overlay").classList.contains("hidden")'), 'the Awakening card opens')
  assert(await ev('/Qi Condensation/.test(document.getElementById("awaken-text").textContent)'), 'the card tells you what opened')
  await shot('mortal-awaken')
  await click('#awaken-ok'); await sleep(300)
  assert(await ev('document.getElementById("awaken-overlay").classList.contains("hidden")'), 'Continue closes the Awakening card')
  assert(await ev('gameState.get().awakened && gameState.get().stageIndex === 1 && !gameState.mortalMeridiansShut()'), 'the Awakening opened Qi Condensation')
  assert(await ev('document.querySelector("#btn-cultivate .act-name").textContent === "Cultivate"'), 'the HUD returns to Cultivate after the Awakening')
  await noOverflow('Overlay')
}
