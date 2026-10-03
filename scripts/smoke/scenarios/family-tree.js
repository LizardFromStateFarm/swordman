// Real-app smoke scenario — the family tree + the Meridian Flow HUD button (user 2026-10-03).
// HUD: the Flow segment beside Meditate shows its charges and opens the puzzle (no timer on the overlay); closing it sets
// the puzzle aside (the segment reads "resume") and reopening costs no charge. Kin → Family: the "Family tree" door is on
// top, and the unwed card names your parents + siblings (no "walk the path alone"). Kin → Tree: generations of nodes
// with drawn lines, tap a child → their card → "Raise them" opens them on Family. Overlay / Expanded / Desktop / phone;
// asserts nothing spills past the pane edge except inside the tree's own sideways scroller.
// Screenshots: scripts/smoke/out/ftree-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/family-tree.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // ── The Flow segment on the HUD ──
  assert(await ev('!!document.querySelector("#med-split #btn-flow")'), 'the Meridian Flow button sits beside Meditate')
  const c0 = await ev('gameState.get().minigames.flow.charges')
  await click('#btn-flow'); await sleep(400)
  assert(await ev('!document.getElementById("mg-overlay")?.classList.contains("hidden") && !!document.querySelector(".mg-grid")'), 'it opens the Meridian Flow puzzle')
  assert(await ev('!document.querySelector(".mg-timer") && !/swift|Under \\d+s/.test(document.querySelector("#mg-overlay")?.textContent || "")'), 'no timer and no par time on the puzzle')
  await shot('ftree-flow-overlay')
  await click('#mg-overlay .mg-x'); await sleep(300)
  assert(await ev('!!gameState.get().minigames.flow.session && document.getElementById("btn-flow").classList.contains("waiting")'), 'closing sets it aside; the button reads resume')
  await click('#btn-flow'); await sleep(300)
  assert(await ev(`gameState.get().minigames.flow.charges === ${c0} - 1`), 'reopening resumes it for no new charge')
  await ev('document.querySelector("#mg-overlay .mg-x")?.click()'); await sleep(200)

  // ── A family: parents, siblings, a spouse, children, a grandchild, a past life up the line ──
  await ev(`(() => { const gs = gameState, s = gs.get(), w = s.world, yr = Math.floor(w.year)
    const mk = (role, born, parents = [], extra = {}) => { const p = gs._genPerson({ family: s.self.family || 'Lin', bornYear: born, stage: 6, role, parents }); Object.assign(p, extra); w.persons[p.id] = p; return p }
    const gp1 = mk('ancestor', yr - 95, [], { alive: false, diedYear: yr - 30, cause: 'old_age' }), gp2 = mk('kin', yr - 92, [], { alive: false, diedYear: yr - 12 })
    const gp3 = mk('kin', yr - 90), gp4 = mk('kin', yr - 89)
    w.pastLives.push({ personId: gp1.id, clanId: w.playerClanId, lineId: w.playerLineId, cause: 'old_age', year: yr - 30, maxStage: 11, generation: 1 })
    const pa = mk('kin', yr - 60, [gp1.id, gp2.id]), pb = mk('kin', yr - 58, [gp3.id, gp4.id])
    s.self.parents = [pa.id, pb.id]; s.self.bornYear = yr - 34
    mk('kin', yr - 38, [pa.id, pb.id]); mk('kin', yr - 30, [pa.id, pb.id]); mk('kin', yr - 26, [pa.id, pb.id])
    s.family.spouse = null; s.family.children = []
    gs._recalc(); gs._notify() })()`)

  const inPane = pane => ev(`(() => { const p = document.getElementById('${pane}'), r = p.getBoundingClientRect()
    return [...p.querySelectorAll('*')].filter(e => e.offsetParent && !e.closest('.ft-scroll')).every(e => e.getBoundingClientRect().right <= r.right + 1) })()`)
  const toFamily = async () => { await click('#tabs [data-group="kin"]'); await sleep(200); await click('[data-tab="family"]'); await sleep(300) }
  await toFamily()
  assert(await ev('!!document.querySelector("#tab-family .fam-tree-link")'), 'Family: the family tree door is on top')
  assert(await ev('!/walk the path alone/i.test(document.getElementById("tab-family").textContent) && /your parents and 3 siblings/.test(document.getElementById("tab-family").textContent)'), 'Family: the unwed card names your parents and siblings')
  await shot('ftree-overlay-family')

  // Now married with children and a grandchild
  await ev(`(() => { const gs = gameState, s = gs.get(), w = s.world, yr = Math.floor(w.year)
    const mk = (role, born, parents = [], extra = {}) => { const p = gs._genPerson({ family: s.self.family || 'Lin', bornYear: born, stage: 4, role, parents }); Object.assign(p, extra); w.persons[p.id] = p; return p }
    const sp = mk('spouse', yr - 32); s.family.spouse = sp; s.family.affection = 72
    const k1 = mk('child', yr - 14, [s.self.id, sp.id], { bond: 66 }), k2 = mk('child', yr - 9, [s.self.id, sp.id], { bond: 41 }), k3 = mk('child', yr - 5, [s.self.id, sp.id], { alive: false, diedYear: yr - 1 })
    const il = mk('spouse', yr - 15); k1.spouseIds = [il.id]; mk('kin', yr - 1, [k1.id, il.id])
    s.family.children = [k1, k2, k3]; s.family.heirId = k1.id
    gs._recalc(); gs._notify() })()`)
  const tree = async tag => {
    await toFamily()
    await click('#tab-family .fam-tree-link'); await sleep(500)
    assert(await ev('document.querySelector("#tab-tree")?.offsetParent && document.querySelectorAll("#tab-tree .ft-node").length >= 12'), `${tag}: the tree opens with every kin`)
    assert(await ev('document.querySelectorAll("#tab-tree .ft-row").length === 5'), `${tag}: five generations, grandparents to grandchildren`)
    assert(await ev('document.querySelectorAll("#tab-tree .ft-lines path").length >= 4'), `${tag}: the lines are drawn`)
    assert(await ev('!!document.querySelector("#tab-tree .ft-node.life") && !!document.querySelector("#tab-tree .ft-node.dead")'), `${tag}: a past life and the dead are marked`)
    assert(await inPane('tab-tree'), `${tag}: nothing spills past the pane (the tree scrolls inside its own frame)`)
    await shot(`ftree-${tag}-tree`)
  }
  await tree('overlay')
  // Tap a child → their card → Raise them → Family with that child open
  await ev('[...document.querySelectorAll("#tab-tree .ft-node")].find(n => /Child/.test(n.textContent) && !n.classList.contains("dead"))?.click()'); await sleep(300)
  assert(await ev('/Raise them/.test(document.querySelector("#tab-tree .ft-card")?.textContent || "")'), "a child's card offers to raise them")
  await shot('ftree-overlay-child')
  await click('#tab-tree .ft-go'); await sleep(400)
  assert(await ev('document.querySelector("#tab-family")?.offsetParent && !!document.querySelector("#tab-family .kid.open")'), 'Raise them opens that child on Family')
  await pick('expanded'); await tree('expanded')
  await pick('desktop'); await tree('desktop')
  await shot('ftree-desktop-hud')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await tree('phone')
  await clearEmulation()
}
