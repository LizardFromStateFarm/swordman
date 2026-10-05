// Real-app smoke scenario — the clone tempers your body (2026-10-05; docs/systems/bosses.md → "The clone tempers").
// A Nascent Soul cultivator who knows Body Beyond the Body: Path → Body shows "Your other self" (free) + an "Other self"
// button on each method; sending it shows its tempering card (timer, XP, the will, "On its own" Off / Explore / Temper
// with the drill picker); an ordeal sent to it reaches its peak (the clone crisis card + the attention item); Roam →
// Explore's clone panel shows the tempering + the duty switch. Overlay / Expanded / phone (also the attention strip's
// boxless expand caret). Screenshots: scripts/smoke/out/clone-temper-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/clone-temper.js
module.exports = async ({ ev, click, wait, assert, sleep, shot, emulate, clearEmulation }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  const layout = async mode => { await ev('document.getElementById("btn-layout").click()'); await sleep(150); await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700) }
  const openBody = async () => { await click('#tabs [data-group="cultivate"]'); await sleep(200); await click('[data-tab="physique"]'); await sleep(350) }
  const openExplore = async () => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="explore"]'); await sleep(350) }
  const noOverflow = async tag => assert(await ev('document.documentElement.scrollWidth <= innerWidth + 1'), `${tag}: no horizontal overflow`)
  const reset = () => ev(`(() => { const s = gameState.get(); s.world.soulTech.clone = true; s.stageIndex = Math.max(s.stageIndex, 17)
    Object.assign(s.inventory, { beast_core: 40, iron_ore: 30, heavenly_ore: 20 }); s.qi = gameState._qiCapValue()
    Object.assign(s.clone, { gone: false, linger: null, exp: null, temper: null, restUntil: 0, outSec: 0, auto: false })
    s.body.active = null; gameState._recalc(); gameState._notify() })()`)

  const pass = async tag => {
    await reset(); await openBody()
    assert(await ev('/free/.test(document.querySelector("#tab-physique .bd-clone .fam-count")?.textContent || "")'), `${tag}: "Your other self" shows it is free`)
    assert(await ev('document.querySelectorAll("#tab-physique .bd-clone-go").length >= 4'), `${tag}: methods offer "Other self"`)
    await ev('document.querySelector("#tab-physique .bd-clone").scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`clone-temper-${tag}-free`)
    await ev('document.querySelector(\'#tab-physique .bd-clone-go[data-id="iron_fist"]\').scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`clone-temper-${tag}-methods`)
    await ev('document.querySelector(\'#tab-physique .bd-clone-go[data-id="iron_fist"]\').click()'); await sleep(350)
    assert(await ev('gameState.get().clone.temper?.id === "iron_fist" && !!document.querySelector("#tab-physique .bd-clone .bd-clone-prog")'), `${tag}: sending it shows its tempering card`)
    await ev('document.querySelector(\'#tab-physique .bd-clone [data-duty="temper"]\').click()'); await sleep(300)
    assert(await ev('gameState.get().clone.auto && gameState.get().clone.autoDuty === "temper" && !!document.querySelector("#tab-physique .bd-clone .ink-sel")'), `${tag}: "On its own: Temper" + its drill picker`)
    await ev('document.querySelector("#tab-physique .bd-clone").scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`clone-temper-${tag}-running`)
    await noOverflow(tag)
    // the ordeal peak
    await ev(`(() => { const s = gameState.get(); s.clone.temper = null; s.clone.auto = false; gameState.startCloneTempering('thunder_peak'); s.clone.temper.endsAt = Date.now() - 1; gameState._tickClone(); gameState._notify() })()`); await sleep(400)
    assert(await ev('!!document.querySelector("#tab-physique .bd-clone-crisis") && collectAttention(gameState.get(), gameState).some(i => i.id === "clone-crisis")'), `${tag}: its peak — the crisis card + the attention item`)
    await ev('document.querySelector("#tab-physique .bd-clone-crisis").scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`clone-temper-${tag}-crisis`)
    await ev('document.querySelector(\'#tab-physique [data-bd-act="clone-ease"]\').click()'); await sleep(300)
    assert(await ev('!gameState.get().clone.temper'), `${tag}: easing off answers it`)
    // Explore
    await ev(`(() => { gameState.get().qi = gameState._qiCapValue(); gameState.startCloneTempering('iron_fist') })()`); await sleep(200)
    await openExplore()
    assert(await ev('/Tempering your body/.test(document.querySelector("#tab-explore .exp-status.clone")?.textContent || "") && !!document.querySelector("#tab-explore .clone-duty .set-seg")'), `${tag}: Explore shows the clone tempering + the duty switch`)
    await ev('document.querySelector("#tab-explore .exp-status.clone").scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`clone-temper-${tag}-explore`)
  }
  await pass('overlay')
  await layout('expanded'); await pass('expanded')
  await layout('desktop')                      // the phone layout = Desktop at a narrow width (data-narrow)
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await ev('window.scrollTo(0, 0); document.querySelector("#attention")?.scrollIntoView({ block: "start" })'); await sleep(200)
  assert(await ev('(() => { const b = document.querySelector(".att-min"); return !!b && getComputedStyle(b).borderTopWidth === "0px" })()'), 'phone: the attention caret has no box')
  await shot('clone-temper-phone-attention')
  await clearEmulation()
}
