// Real-app smoke scenario — A4-3 death moment (docs/systems/art-engine.md → "Realm scenery + death moment"): with Sprite
// art = Ink, a life's end first plays on the sprite (the figure dissolves), the death card opens only after it, and
// closing the card brings the new life's figure back. With Classic art the card opens at once (no moment).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/death-moment.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3 })()')
  await ev('gameState.setSetting("artStyle", "ink")'); await sleep(500)
  assert(await ev('spriteRenderer.isInk()'), 'ink art is on')

  const hidden = () => ev('document.getElementById("death-overlay").classList.contains("hidden")')
  // die at Core Formation: the moment must draw THAT figure, not the Mortal heir the state already holds
  await ev("(() => { const gs = gameState, s = gs.get(); s.stageIndex = CULTIVATION_STAGES.findIndex(x => x.spriteState === 'levitating'); gs._recalc(); gs._notify() })()"); await sleep(400)
  await ev('gameState._die("event")')
  await wait('spriteRenderer.ink.death > 0.3', 3000)
  assert(await ev('spriteRenderer.ink.art.id') === 'cultivator_core', 'the dying figure is the one who died (Core), not the heir')
  assert(await hidden(), 'the death card waits while the moment plays')
  await shot('death-moment-mid')
  await wait('spriteRenderer.ink.death > 0.6', 3000); await shot('death-moment-late')
  await sleep(2600)
  assert(!(await hidden()), 'the death card opens after the moment')
  assert(await ev('spriteRenderer.ink.death === 1'), 'the moment played to the end')

  // walk the interlude to its end (heir choices etc.), then close the card
  for (let i = 0; i < 12 && !(await hidden()); i++) {
    await ev(`(() => { const ok = document.getElementById('death-ok'); if (ok && !ok.disabled && ok.offsetParent) ok.click()
      else document.querySelector('#interlude-choices button:not([disabled])')?.click() })()`); await sleep(400)
  }
  assert(await hidden(), 'the death card closes')
  assert(await ev('spriteRenderer.ink.death === 0'), 'closing the card clears the moment (the new life is drawn)')

  await ev('gameState.setSetting("artStyle", "classic")'); await sleep(400)
  await ev('gameState._die("event")'); await sleep(400)
  assert(!(await hidden()), 'Classic art: the death card opens at once')
}
