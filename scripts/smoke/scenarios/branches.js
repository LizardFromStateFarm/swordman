// Real-app smoke scenario — Phase 45 sect branches (docs/systems/sect-branches.md): the Branches section in
// Sect → Disciples at the 4-branch cap (count chip, locked "branch" buttons with a reason), the Tournament of
// Branches tile, and a grown child's "Bring into the sect" row in Kin → Family — shot in Overlay, Expanded, Desktop
// and phone width, asserting no tournament / recruit button clips its text.
// Screenshots: scripts/smoke/out/branches-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/branches.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // Six disciples, appoint four heads through the engine → the cap
  await ev(`(() => { const s = gameState.get(); s.spiritStones = 1e6
    const n = ["Li Wei","Wang Fang","Zhao Lei","Chen Yu","Sun Mei","Zhou Ning"]
    s.ownSect.disciples = n.map((name, i) => ({ id: "bd" + i, name, talent: 2 + (i % 3), level: 2 + i, xp: 0 }))
    s.ownSect.branches = []; s.ownSect.tourneyAt = 0; gameState._recalc(); gameState._notify() })()`)
  const appointed = await ev('[0,1,2,3].map(i => gameState.appointBranchHead("bd" + i).ok).join(",")')
  assert(appointed === 'true,true,true,true', `four branches can be raised (${appointed})`)
  const fifth = await ev('JSON.stringify(gameState.appointBranchHead("bd4"))')
  assert(/max_branches/.test(fifth), `a fifth branch is refused at the cap: ${fifth}`)
  assert(await ev('gameState.get().ownSect.branches.length') === 4, 'the sect holds exactly 4 branches')

  // Clipping check: every visible tournament/recruit button shows its whole label
  const unclipped = sel => ev(`(() => { const els = [...document.querySelectorAll('${sel}')].filter(e => e.offsetParent)
    return els.length > 0 && els.every(e => [e, ...e.querySelectorAll('*')].every(x => x.scrollWidth <= x.clientWidth + 1 || getComputedStyle(x).overflow === 'visible')) })()`)

  const childSetup = `(() => { const s = gameState.get()
    s.family.children = [ { id:"kidS", given:"An", family:"Li", bornYear: s.world.year - 30, root:{type:"heavenly",name:"Heavenly Root",mult:3.0}, personality:"calm", alive:true, estranged:false, bond:60, morality:0, stageIndex:0, parents:[s.self.id] } ]
    gameState._recalc(); gameState._notify() })()`
  await ev(childSetup)

  const pass = async tag => {
    await click('#tabs [data-group="sect"]'); await sleep(200)
    await click('[data-tab="sect-disciples"]'); await sleep(300)
    assert(await ev('/4\\s*\\/\\s*4/.test(document.querySelector("#tab-sect-disciples .sv-branches")?.textContent || "")'), `${tag}: the Branches header reads 4 / 4`)
    assert(await ev('[...document.querySelectorAll("#tab-sect-disciples [data-sa=branch-appoint]")].every(b => b.disabled && b.title)'), `${tag}: "branch" buttons are locked with a reason at the cap`)
    await ev('document.querySelector("#tab-sect-disciples .sv-tourney")?.scrollIntoView({ block: "start" })'); await sleep(150)
    assert(await unclipped('#tab-sect-disciples .sv-tourney .sv-prize'), `${tag}: tournament prize buttons are not clipped`)
    assert(await ev(`(() => { const p = document.getElementById('tab-sect-disciples'), r = p.getBoundingClientRect()
      return [...p.querySelectorAll('.sv-branches *')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`), `${tag}: nothing in Branches spills past the pane`)
    await shot(`branches-${tag}-tourney`)
    await ev('document.querySelector("#tab-sect-disciples [data-sa=branch-appoint]")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`branches-${tag}-roster`)
    await click('#tabs [data-group="kin"]'); await sleep(200)
    await click('[data-tab="family"]'); await sleep(200)
    if (!(await ev('!!document.querySelector("#tab-family .kid-sect")'))) { await click('#tab-family .kid-head'); await sleep(200) }
    await ev("document.querySelector('#tab-family .kid-sect')?.scrollIntoView({ block: 'center' })"); await sleep(150)
    assert(await unclipped('#tab-family .kid-sect'), `${tag}: "Bring into the sect" is not clipped`)
    await shot(`branches-${tag}-child`)
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
  // The tournament on cooldown: the prizes lock and the note says why (Overlay)
  await pick('overlay')
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-disciples"]'); await sleep(250)
  await click('#tab-sect-disciples [data-sa="bt"][data-id="stones"]'); await sleep(300)
  assert(await ev('!!gameState.get().ownSect.lastTourney && [...document.querySelectorAll("#tab-sect-disciples .sv-prize")].every(b => b.disabled) && /again in/i.test(document.querySelector("#tab-sect-disciples .sv-tourney-n")?.textContent || "")'), 'after a tournament the prizes lock and the note gives the cooldown')
  await ev('document.querySelector("#tab-sect-disciples .sv-tourney")?.scrollIntoView({ block: "start" })'); await sleep(150)
  await shot('branches-overlay-cooldown')
}
