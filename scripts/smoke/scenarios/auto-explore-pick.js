// Real-app smoke scenario — Auto-Explore's location is chosen in the Mode panel (Idle button, top right), the Explore
// card only shows an inert "Auto" tag; and a companion's details page can Send on Expedition / Release.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/auto-explore-pick.js
module.exports = async ({ ev, click, wait, assert, sleep, shot }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3; s.automation.autoExplore = true
    s.beasts = [{ id: 'tb0', typeId: 'spirit_fox', name: 'Ember', level: 3, xp: 10, traits: [] }]
    s.derived.maxBeasts = 3; gameState._notify() })()`)
  await ev('document.getElementById("btn-mode").click()'); await sleep(400)
  const chips = await ev('document.querySelectorAll("#mode-auto .auto-loc-chips .pack-chip").length')
  assert(chips >= 2, `Mode panel lists a location picker (${chips} chips)`)
  await shot('auto-pick-mode')
  await ev('document.querySelectorAll("#mode-auto .auto-loc-chips .pack-chip")[1].click()'); await sleep(300)
  const id = await ev('gameState.get().automation.autoExploreLocationId')
  assert(!!id, "picking a chip stores the location")
  await ev('document.querySelector("#mode-overlay .overlay-close, #mode-close")?.click()')
  await click('#tabs [data-group="adventure"]'); await click('[data-tab="explore"]'); await sleep(400)
  const tags = await ev('document.querySelectorAll("#tab-explore .loc-auto").length')
  const btns = await ev('document.querySelectorAll("#tab-explore button.loc-auto").length')
  assert(tags === 1 && btns === 0, `exactly one inert Auto tag on Explore (${tags} tags, ${btns} buttons)`)
  await shot('auto-pick-explore')
  // 2026-09-29: the Auto-Explore switch lives in the expedition panel; the Roam sub-tab strip has no chip any more
  assert(await ev('document.getElementById("auto-chip").classList.contains("hidden")'), 'no automation chip in the Roam sub-tab strip')
  assert(await ev('!!document.querySelector("#tab-explore .exp-status .exp-auto .set-opt.is-on.active")'), 'the expedition panel shows Auto-Explore: On')
  await click('#tab-explore .exp-auto [data-exp-auto="0"]'); await sleep(300)
  assert(await ev('gameState.get().automation.autoExplore === false && !!document.querySelector("#tab-explore .exp-auto [data-exp-auto=\\"0\\"].active")'), 'Off in the panel turns Auto-Explore off')
  for (const mode of ['overlay', 'expanded', 'desktop']) {
    await ev('document.getElementById("btn-layout").click()'); await sleep(150)
    await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700)
    await click('#tabs [data-group="adventure"]'); await click('[data-tab="explore"]'); await sleep(300)
    assert(await ev('(() => { const r = document.querySelector("#tab-explore .exp-auto")?.getBoundingClientRect(), p = document.getElementById("tab-explore").getBoundingClientRect(); return !!r && r.right <= p.right + 0.5 && r.width > 0 })()'), `${mode}: the Auto-Explore switch fits the panel`)
    await shot(`auto-panel-${mode}`)
  }
  await click('#tab-explore .exp-auto [data-exp-auto="1"]'); await sleep(300)
  assert(await ev('gameState.get().automation.autoExplore === true'), 'On in the panel turns it back on')
  await click('#tab-explore .exp-auto [data-exp-where]'); await sleep(400)
  assert(await ev('!document.getElementById("mode-overlay").classList.contains("hidden")'), '"change where" opens the Mode panel (the location picker)')
  await ev('document.querySelector("#mode-overlay .overlay-close, #mode-close")?.click()'); await sleep(200)
  await click('[data-tab="beasts"]'); await sleep(400)
  await ev('document.querySelector("#tab-beasts .bdx-open")?.click()'); await sleep(500)
  await shot('auto-pick-beast-page')
  await ev('document.querySelector(".bdx-loc")?.click()'); await sleep(300)
  assert(await ev('!!gameState.get().beasts[0].expedition'), 'Send from the details page starts the beast expedition')
  assert(await ev('document.querySelector(".bdx-loc")?.disabled === true'), 'location buttons lock while it is away')
  await ev('document.querySelector(".bdx-release").click()'); await sleep(200)
  await ev('document.getElementById("confirm-yes").click()'); await sleep(300)
  assert(await ev('gameState.get().beasts.length === 0'), 'Release (confirmed) removes the beast and closes the page')

  // ── 2026-09-29: queue the next Auto-Explore run while one is out ("Go next") ────────────────────────
  await ev(`(() => { const s = gameState.get(); s.health = 100; s.automation.autoExploreLocationId = null
    if (!s.expedition.active) gameState.startExpedition(LOCATIONS.filter(l => s.stageIndex >= l.minStage)[0].id) })()`)
  await click('#tabs [data-group="adventure"]'); await click('[data-tab="explore"]'); await sleep(400)
  const q = await ev('document.querySelectorAll("#tab-explore .loc-btn[data-queue]:not(:disabled)").length')
  assert(q >= 1, `while out, other cards offer Go next (${q})`)
  await ev('document.querySelector("#tab-explore .loc-btn[data-queue]:not(:disabled)").click()'); await sleep(300)
  assert(await ev('(() => { const s = gameState.get(); return !!s.automation.autoExploreLocationId && s.automation.autoExploreLocationId !== s.expedition.locationId })()'), 'Go next queues that location without cancelling the run')
  assert(await ev('!!document.querySelector("#tab-explore .exp-auto .exp-auto-next")'), 'the Auto-Explore row names the queued next location')
  await shot('auto-queue-explore')

  // ── Auto-Missions: row + Keep chips in Sect → Missions; picker in the Mode panel ────────────────────
  await ev(`(() => { const s = gameState.get(); s.automation.autoSectMissions = false; s.automation.autoSectMissionIds = []; s.sect.activeMissions = []; gameState._notify() })()`)
  await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-missions"]'); await sleep(400)
  assert(await ev('!!document.querySelector("#tab-sect-missions .sv-auto [data-sa=auto]")'), 'Missions view has the Auto-Missions switch')
  await click('#tab-sect-missions .sv-auto [data-on="1"]'); await sleep(300)
  assert(await ev('gameState.get().automation.autoSectMissions === true'), 'On turns Auto-Missions on')
  const keeps = await ev('document.querySelectorAll("#tab-sect-missions .sv-keep").length')
  assert(keeps >= 2, `each open mission card has a Keep chip (${keeps})`)
  await ev('document.querySelectorAll("#tab-sect-missions .sv-keep")[0].click()'); await sleep(300)
  assert(await ev('gameState.get().automation.autoSectMissionIds.length === 1 && gameState.get().sect.activeMissions.length >= 1'), 'Keep picks the mission and starts it in a free slot')
  for (const mode of ['overlay', 'expanded', 'desktop']) {
    await ev('document.getElementById("btn-layout").click()'); await sleep(150)
    await ev(`document.querySelector('.layout-opt[data-layout="${mode}"]').click()`); await sleep(700)
    await click('#tabs [data-group="sect"]'); await sleep(200); await click('[data-tab="sect-missions"]'); await sleep(300)
    assert(await ev('(() => { const r = document.querySelector("#tab-sect-missions .sv-auto")?.getBoundingClientRect(), p = document.getElementById("tab-sect-missions").getBoundingClientRect(); return !!r && r.right <= p.right + 0.5 && r.width > 0 })()'), `${mode}: the Auto-Missions row fits`)
    await shot(`auto-missions-${mode}`)
  }
  await ev('document.getElementById("btn-mode").click()'); await sleep(400)
  assert(await ev('[...document.querySelectorAll("#mode-auto .auto-loc-h")].some(h => /Keep running/.test(h.textContent))'), 'Mode panel shows the Keep running mission picker')
  assert(await ev('[...document.querySelectorAll("#mode-auto .auto-name")].some(n => /Beast Auto-Expedition/.test(n.textContent))'), 'Mode panel lists Beast Auto-Expedition')
  await shot('auto-missions-mode')
  await ev('document.querySelector("#mode-overlay .overlay-close, #mode-close")?.click()'); await sleep(200)

  // ── Beast Auto-Expedition: locked below the level, switch on the card, picker on the details page ───
  await ev(`(() => { const s = gameState.get(); const L = BEAST_AUTO_EXPEDITION_LEVEL
    s.beasts = [{ id: 'tb1', typeId: 'spirit_fox', name: 'Ember', level: L, xp: 10, traits: [] }, { id: 'tb2', typeId: 'spirit_fox', name: 'Ash', level: L - 2, xp: 0, traits: [] }]
    gameState._ensurePhase22Fields(); gameState._notify() })()`)
  await click('#tabs [data-group="adventure"]'); await click('[data-tab="beasts"]'); await sleep(400)
  assert(await ev('document.querySelectorAll("#tab-beasts .beast-auto.locked").length === 1 && document.querySelectorAll("#tab-beasts .beast-auto [data-bauto]").length === 2'), 'Lv.5 beast has the switch, the young one shows when it unlocks')
  await ev('document.querySelector(".beast-loc-pick-btn.avail[data-beastid=tb1]").click()'); await sleep(200)
  await ev('document.querySelector("#tab-beasts [data-bauto=tb1][data-on=\\"1\\"]").click()'); await sleep(300)
  assert(await ev('gameState.get().beasts[0].autoExp === true'), 'the card switch turns Auto-Expedition on')
  await shot('auto-beast-card')
  await ev('document.querySelector("#tab-beasts .beast-auto .exp-auto-where").click()'); await sleep(500)
  const picks = await ev('document.querySelectorAll(".bdx-auto-picks .pack-chip").length')
  assert(picks >= 2, `details page lists where it goes next (${picks} chips)`)
  await ev('document.querySelectorAll(".bdx-auto-picks .pack-chip")[1].click()'); await sleep(300)
  assert(await ev('gameState.get().beasts[0].autoExpLocId !== null && !!gameState.get().beasts[0].expedition'), 'picking a place while it is out keeps the trip and sets the next')
  await ev('document.querySelector(".bdx-auto-picks").scrollIntoView({ block: "center" })'); await sleep(200)
  await shot('auto-beast-page')
  await ev('document.getElementById("beast-close").click()'); await sleep(200)
}
