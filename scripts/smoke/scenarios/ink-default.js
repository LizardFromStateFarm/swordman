// Real-app smoke scenario — A4-4 (docs/systems/art-engine.md, settings.md): Ink is the default Sprite art. A brand-new
// character starts on the ink engine in every layout mode (+ phone); an old save still on the Classic default moves to
// Ink once on load with a log line naming how to switch back; Classic still works and its sprites carry no emoji
// (the lightning / taiji emoji became ϟ / ◎). Screenshots: scripts/smoke/out/ink-default-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/ink-default.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await click('#btn-layout')
    await wait('!document.getElementById("layout-picker").classList.contains("hidden")')
    await click(`.layout-opt[data-layout="${mode}"]`)
    await sleep(800)
  }
  const canvasClip = async (scale = 3) => ({ ...(await ev('(() => { const b = document.getElementById("sprite-canvas").getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height } })()')), scale })

  // ── A brand-new character ────────────────────────────────────────────────────────────────
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(600)
  await ev('document.getElementById("layout-tip")?.click()')
  assert(await ev('gameState.getSettings().artStyle === "ink"'), 'new character: Sprite art setting = Ink')
  assert(await ev('spriteRenderer.isInk()'), 'new character: the ink engine draws the cultivator')
  await shot('ink-default-overlay')
  await pick('expanded'); await shot('ink-default-expanded')
  await pick('desktop');  await shot('ink-default-desktop')
  await pick('banner');   await shot('ink-default-banner')
  await pick('overlay')

  // ── An old save on the Classic default ───────────────────────────────────────────────────
  await ev(`(async () => { const s = JSON.parse(JSON.stringify(gameState.get())); delete s.inkDefaultMigrated
    s.settings.artStyle = 'classic'; s.events = []; await window.electron.saveSlot(0, s) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(600)
  assert(await ev('gameState.getSettings().artStyle === "ink" && spriteRenderer.isInk()'), 'old save on Classic loads on Ink')
  assert(await ev('(gameState.get().events || []).some(e => /Sprite art/.test(e.text))'), 'the move logs how to switch back')
  const saved = await ev('(async () => (await window.electron.loadSlot(0))?.inkDefaultMigrated === true)()')
  assert(saved, 'the migration is saved at once (not redone next load)')

  // ── Classic still works, emoji-free ──────────────────────────────────────────────────────
  await ev('gameState.setSetting("artStyle", "classic")'); await sleep(400)
  assert(await ev('!spriteRenderer.isInk()'), 'Sprite art = Classic switches back to the ASCII sprite')
  // ★ ▪ ◀ ▶ ↩ are Extended_Pictographic in Chromium's ICU but have no emoji presentation (text glyphs; lint ALLOW list)
  const emoji = await ev('(JSON.stringify([CULTIVATOR_SPRITES, BEAST_SPRITES]).match(new RegExp(String.fromCharCode(92) + "p{Extended_Pictographic}", "gu")) || []).filter(c => !"↩▪◀▶★".includes(c)).length')
  assert(emoji === 0, `Classic sprites hold no emoji (${emoji})`)
  // game.js re-sends the stage's sprite state on every notify, so put the life at the stage that owns each sprite
  const atStage = i => ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = ${i}; gs._recalc(); gs._notify() })()`)
  for (const [st, i] of [['meditating_deep', 10], ['levitating', 13], ['transcending', 16]]) {
    await atStage(i); await sleep(500)
    await shot(`ink-default-classic-${st}`, await canvasClip(3))
  }
  await ev('spriteRenderer.setState("breakthrough")'); await sleep(500)   // held 2.4 s against the per-notify resend
  await shot('ink-default-classic-breakthrough', await canvasClip(3))
  await atStage(0); await sleep(300)
  await ev('gameState.setSetting("artStyle", "ink")'); await sleep(300)

  // ── Phone ────────────────────────────────────────────────────────────────────────────────
  await emulate(390, 844); await pick('desktop'); await sleep(600)
  assert(await ev('spriteRenderer.isInk()'), 'phone: the ink engine draws the cultivator')
  await shot('ink-default-phone')
  await clearEmulation()
}
