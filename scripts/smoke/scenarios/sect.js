// Real-app smoke scenario — 1.8b-5 Sect sub-views (docs/systems/ui-layout.md → "Sect views"): the sub-tabs each
// standing offers (none / joined / founded), every view renders in Overlay + Expanded + Desktop, the founder's
// longest view stays within 3 Overlay screens, the war odds card opens its "why" popover, actions work (give
// stones, set out on a mission, raise a building, take in a disciple), and the attention items land on the right
// sub-view. Also shoots the Techniques / Explore / Craft card grids.
// Screenshots: scripts/smoke/out/sect-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/sect.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  const load = async preset => {
    await ev(`(async () => { await window.electron.saveSlot(0, ${preset ? `gameState.buildDevSave('${preset}')` : 'null'}) })()`)
    await ev('location.reload()'); await sleep(1500)
    await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\') || document.querySelector(\'.cs-btn-new[data-slot="0"]\')', 10000)
    await click('.cs-btn-play[data-slot="0"]')
    await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
    await sleep(400)
    await ev('document.getElementById("layout-tip")?.click()')
  }
  const subs = () => ev('[...document.querySelectorAll("#subtabs .subtab[data-in=sect]")].filter(b => !b.classList.contains("hidden")).map(b => b.dataset.tab).join(",")')
  const screens = view => ev(`(() => { const p = document.getElementById('tab-${view}'); return +(p.scrollHeight / p.clientHeight).toFixed(2) })()`)
  const war = () => ev('(() => { const s = gameState.get(), w = s.sectWar; w.phase = "preparing"; w.enemyName = "Crimson Talon Sect"; w.enemyTier = 3; w.prepEndsAt = Date.now() + 400e3; w.scoutEndsAt = Date.now(); gameState._recalc(); gameState._notify() })()')
  // Every offered sub-tab (and the automation chip) sits fully inside the row, untruncated (review 1: War hid in Expanded)
  const tabsFit = tag => ev(`(() => { const row = document.getElementById('subtabs').getBoundingClientRect()
    const els = [...document.querySelectorAll('#subtabs .subtab[data-in=sect]:not(.hidden), #auto-chip:not(.hidden)')]
    const sub = document.getElementById('subtabs'); return sub.scrollWidth <= sub.clientWidth && els.every(b => { const r = b.getBoundingClientRect(); return r.right <= row.right + 0.5 && r.left >= row.left - 0.5 && (b.id === 'auto-chip' || getComputedStyle(b).flexShrink === '0') }) })()`).then(ok => assert(ok, `${tag}: every sect sub-tab fits the row`))
  const allViews = async (tag, views) => {
    await tabsFit(tag)
    for (const v of views) {
      await click(`[data-tab="${v}"]`); await sleep(250)
      assert(await ev(`document.getElementById('tab-${v}').classList.contains('active') && document.getElementById('tab-${v}').children.length > 0`), `${tag}: ${v} renders`)
      await shot(`sect-${tag}-${v}`)
    }
  }

  // ── Founder ──
  await load('founder')
  await click('#tabs [data-group="sect"]'); await sleep(250)
  assert(await subs() === 'sect,sect-halls,sect-disciples,sect-war', `founder sub-tabs: ${await subs()}`)
  await war()
  const founderViews = ['sect', 'sect-halls', 'sect-disciples', 'sect-war']
  await allViews('founder-overlay', founderViews)
  let worst = 0
  const tall = {}
  for (const v of founderViews) { await click(`[data-tab="${v}"]`); await sleep(200); tall[v] = await screens(v); worst = Math.max(worst, tall[v]) }
  console.log('  Overlay screens per view:', JSON.stringify(tall), await ev('document.getElementById("tab-sect").clientHeight') + 'px pane')
  assert(worst <= 3, `founder: longest Overlay view is ${worst} screens (≤ 3; was 14.8 as one list)`)
  // the odds card explains itself
  await click('[data-tab="sect-war"]'); await sleep(200)
  await click('#tab-sect-war [data-bd="sectwar"]'); await sleep(300)
  assert(await ev('!document.getElementById("breakdown-overlay").classList.contains("hidden") && /war odds/i.test(document.querySelector(".bd-pop")?.textContent || "")'), 'war odds open a "why" card')
  await shot('sect-founder-overlay-odds')
  await click('#breakdown-overlay'); await sleep(150)
  // actions: take in a disciple, raise a building
  await ev('(() => { const s = gameState.get(); s.spiritStones = 1e6; s.ownSect.disciples = s.ownSect.disciples.slice(0, 2); gameState._recalc(); gameState._notify() })()')
  await click('[data-tab="sect-disciples"]'); await sleep(200)
  const n0 = await ev('gameState.get().ownSect.disciples.length')
  await click('#tab-sect-disciples [data-sa="recruit"]:not([disabled])'); await sleep(200)
  assert(await ev('gameState.get().ownSect.disciples.length') === n0 + 1, 'Take them in: a disciple joins')
  await click('[data-tab="sect-halls"]'); await sleep(200)
  const b0 = await ev('Object.keys(gameState.get().ownSect.buildings).length')
  const hasBuild = await ev('!!document.querySelector("#tab-sect-halls [data-sa=build]:not([disabled])")')
  if (hasBuild) { await click('#tab-sect-halls [data-sa="build"]:not([disabled])'); await sleep(200)
    assert(await ev('Object.keys(gameState.get().ownSect.buildings).length') === b0 + 1, 'Build: a building is raised') }
  // attention → right sub-view
  await click('#tabs [data-group="cultivate"]'); await sleep(200)
  await ev('document.querySelector(\'#attention [data-att="own-war"]\')?.click()'); await sleep(250)
  assert(await ev('document.getElementById("tab-sect-war").classList.contains("active")'), 'the attack attention item opens Sect → War')
  await pick('expanded'); await war(); await allViews('founder-expanded', founderViews)
  await pick('desktop'); await allViews('founder-desktop', founderViews)
  for (const g of [['cultivate', 'techniques'], ['adventure', 'explore'], ['pack', 'craft']]) {
    await click(`[data-tab="${g[1]}"]`); await sleep(250); await shot(`grid-desktop-${g[1]}`)
  }
  await pick('overlay')
  // 1.8b-6: the grids in Overlay too (Explore = mission-style cards), and "Set out" really sends an expedition
  for (const g of ['techniques', 'explore', 'craft']) { await click(`[data-tab="${g}"]`); await sleep(250); await shot(`grid-overlay-${g}`) }
  await click('[data-tab="explore"]'); await sleep(150)
  await click('.loc-card .loc-btn[data-locid]:not([disabled])'); await sleep(250)
  assert(await ev('gameState.get().expedition.active'), 'Explore card "Set out" starts an expedition')
  assert(await ev('!!document.querySelector(".loc-card.active .loc-btn[disabled]")'), 'the running location card shows Underway')
  await shot('grid-overlay-explore-underway')

  // ── Joined sect ──
  await load('member_elder')
  await click('#tabs [data-group="sect"]'); await sleep(250)
  assert(await subs() === 'sect,sect-missions,sect-war', `member sub-tabs: ${await subs()}`)
  await ev('(() => { const s = gameState.get(), w = s.sectWar; w.phase = "scouting"; w.answered = false; w.enemyName = "Iron Serpent Pavilion"; w.enemyTier = 2; w.scoutEndsAt = Date.now() + 600e3; gameState._notify() })()')
  const memberViews = ['sect', 'sect-missions', 'sect-war']
  await allViews('member-overlay', memberViews)
  await ev('(() => { const s = gameState.get(); s.spiritStones = 5000; s.automation.autoSectMissions = false; s.sect.activeMissions = []; gameState._notify() })()')
  await click('[data-tab="sect"]'); await sleep(200)
  const c0 = await ev('gameState.get().sect.contribution')
  await click('#tab-sect [data-sa="donate"][data-n="10"]'); await sleep(200)
  assert(await ev('gameState.get().sect.contribution') > c0, 'Give 10 stones raises Contribution')
  await click('[data-tab="sect-missions"]'); await sleep(200)
  await click('#tab-sect-missions [data-sa="mission"]:not([disabled])'); await sleep(250)
  assert(await ev('gameState.get().sect.activeMissions.length') === 1, 'Set out starts a mission')
  assert(await ev('!!document.querySelector("#tab-sect-missions .sect-mission-timer")'), 'the mission card shows its timer')
  await shot('sect-member-overlay-mission-started')
  await click('[data-tab="sect-war"]'); await sleep(200)
  await click('#tab-sect-war [data-sa="answer"]'); await sleep(200)
  assert(await ev('gameState.get().sectWar.answered === true'), 'Answer the call works')
  await shot('sect-member-overlay-war-answered')
  await pick('expanded'); await allViews('member-expanded', memberViews)
  await pick('desktop'); await allViews('member-desktop', memberViews)
  await pick('overlay')

  // ── Leave the sect: the sub-tabs fall back to the single Overview (list of sects) ──
  await ev('gameState.leaveSect()'); await sleep(300)
  assert(await subs() === 'sect', `no sect: one view (${await subs()})`)
  assert(await ev('document.getElementById("tab-sect").classList.contains("active")'), 'leaving while on War falls back to Overview')
  await shot('sect-none-overlay')
  await pick('desktop'); await click('[data-tab="sect"]'); await sleep(250); await shot('sect-none-desktop')
  await pick('overlay')
}
