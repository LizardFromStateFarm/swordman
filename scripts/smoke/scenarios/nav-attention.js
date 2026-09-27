// Real-app smoke scenario — 1.8b-1 navigation + attention layer (docs/systems/ui-layout.md → "Navigation +
// attention"): six group buttons + sub-tabs (every view renders), attention strip items + group badges, clicking an
// item navigates / opens its popup, the Mode panel (Idle/Active + all automation; no automation panel left in
// Explore/Sect), and screenshots in every layout mode for the Visual Review Gate.
// Screenshots: scripts/smoke/out/nav-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/nav-attention.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const VIEWS = ['techniques', 'stats', 'explore', 'beasts', 'family', 'clan', 'sect', 'pack', 'craft', 'events', 'banter']
  const visible = id => ev(`!document.getElementById(${JSON.stringify(id)}).classList.contains('hidden')`)
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700)
  }

  // Founder dev preset: own sect, clan head — plenty of views with content
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3 })()`)

  // ── Structure ──
  assert(await ev('document.querySelectorAll("#tabs .tab").length') === 6, 'six group buttons')
  assert(await ev('[...document.querySelectorAll("#tabs .tab-glyph")].map(g => g.textContent).join("")') === '修歷家宗囊錄', 'group glyphs 修歷家宗囊錄')
  for (const v of VIEWS) {
    await click(`[data-tab="${v}"]`); await sleep(120)
    const r = await ev(`(() => { const p = document.getElementById('tab-${v}'); return { active: p.classList.contains('active'), n: p.innerText.trim().length, others: document.querySelectorAll('#tab-body .panel.active').length } })()`)
    assert(r.active && r.others === 1 && r.n > 0, `view ${v}: shown alone, ${r.n} chars`)
  }
  assert(await ev('!/Automation/i.test(document.getElementById("tab-sect").innerText)'), 'no automation panel in Sect')
  await click('[data-tab="explore"]')
  assert(await ev('!/Automation/i.test(document.getElementById("tab-explore").innerText)'), 'no automation panel in Explore')
  assert(await ev('!/Inventory/i.test(document.getElementById("tab-explore").innerText)'), 'Explore no longer duplicates the Pack inventory')
  await click('#tabs [data-group="kin"]'); await click('#tabs [data-group="pack"]'); await click('#tabs [data-group="kin"]')
  assert(await ev('document.querySelector("#subtabs .subtab.active").dataset.tab') === 'clan', 'a group remembers its last sub-view (Kin → Clan)')

  // ── Attention: force a decision, an opportunity and a nudge ──
  await ev(`(() => { const gs = gameState, s = gs.get(); s.age = Math.max(s.age, 30); s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs._notify() })()`)
  await sleep(400)
  if (await visible('proposal-overlay')) await click('#proposal-later')
  // (the Founder is usually married already, so also force an own-sect war: a decision with a countdown)
  await ev(`(() => { const s = gameState.get(); s.beastEncounters = [{ id: 'smoke_b', typeId: BEAST_TYPES[0].id, traits: [] }]; if (s.expedition) s.expedition.active = false
    Object.assign(s.sectWar, { phase: 'preparing', prepEndsAt: Date.now() + 300e3, enemyName: 'Blood Lotus Sect', enemyTier: 2 }); gameState._notify() })()`)
  await sleep(300)
  const items = await ev('[...document.querySelectorAll("#attention [data-att]")].map(b => b.dataset.att)')
  const hasProposal = items.includes('proposal')
  assert(items.includes('own-war') && items.includes('beasts'), `attention lists the war + beasts: ${items.join(', ')}`)
  assert(['own-war', 'proposal'].includes(items[0]), 'a decision comes first')
  assert(await ev('document.querySelector("#tabs [data-group=sect] .tab-badge").classList.contains("urgent")'), 'Sect badge is urgent')
  assert(await ev('document.querySelector("#tabs [data-group=adventure] .tab-badge").classList.contains("ready")'), 'Roam badge shows the beast')
  await click('[data-tab="techniques"]')
  await shot('nav-overlay-strip')
  await click('#attention [data-att-more]'); await sleep(150)
  assert(await ev('document.querySelector("#attention .att-list").classList.contains("open")'), 'the +N button unfolds the list')
  await shot('nav-overlay-strip-open')
  await click('#attention [data-att="beasts"]'); await sleep(200)
  assert(await ev('document.getElementById("tab-beasts").classList.contains("active")'), 'clicking the beast item opens Roam → Beasts')
  await shot('nav-overlay-beasts')
  if (hasProposal) {
    await click('#attention [data-att="proposal"]'); await sleep(200)
    assert(await visible('proposal-overlay'), 'clicking the proposal item opens the matchmaker')
    await click('#proposal-later')
  }
  await click('#attention [data-att-more]'); await click('#attention [data-att="own-war"]'); await sleep(200)
  assert(await ev('document.getElementById("tab-sect-war").classList.contains("active")'), 'clicking the war item opens Sect → War (1.8b-5)')

  for (const g of ['cultivate', 'kin', 'sect', 'pack']) { await click(`#tabs [data-group="${g}"]`); await sleep(150); await shot(`nav-overlay-${g}`) }
  await click('[data-tab="clan"]'); await sleep(150); await shot('nav-overlay-clan')

  // ── Mode panel ──
  await click('#btn-mode'); await sleep(200)
  assert(await visible('mode-overlay'), 'titlebar 閒 opens the Mode panel')
  assert(await ev('document.querySelectorAll("#mode-auto .auto-row").length') === 4, 'Mode panel lists all 4 automations')
  await shot('nav-mode-idle')
  await click('.mode-card[data-mode="active"]'); await sleep(200)
  assert(await ev('gameState.get().playMode') === 'active' && await ev('document.getElementById("btn-mode").textContent') === 'Active' && await ev('!!document.querySelector("#btn-mode .ic-active")'), 'Active card switches mode; titlebar shows the Active flame')
  await shot('nav-mode-active')
  await click('.mode-card[data-mode="idle"]'); await click('#mode-close')

  // ── Overlay titlebar ⋯ menu (歸 + 窗 folded in) ──
  assert(await ev('getComputedStyle(document.getElementById("btn-back")).display === "none" && getComputedStyle(document.getElementById("btn-more")).display !== "none"'), 'Overlay: 歸/窗 fold into ⋯')
  await click('#btn-more'); await sleep(150)
  await shot('nav-overlay-more-menu')
  await click('#tb-menu [data-tbm="layout"]'); await sleep(200)
  assert(await ev('!document.getElementById("layout-picker").classList.contains("hidden")'), '⋯ → Window layout opens the picker')
  await ev('document.getElementById("layout-picker").classList.add("hidden")')

  // ── Wide modes ──
  await pick('expanded')
  await click('[data-tab="family"]'); await sleep(200); await shot('nav-expanded-family')
  await click('[data-tab="sect"]'); await sleep(200); await shot('nav-expanded-sect')
  assert(await ev('getComputedStyle(document.getElementById("tabs")).flexDirection') === 'column', 'Expanded: groups are a vertical rail')
  assert(await ev('document.querySelectorAll("#attention .att-item .att-why").length > 0 && getComputedStyle(document.querySelector("#attention .att-why")).display !== "none"'), 'Expanded: attention cards show their reasons')
  await click('#btn-mode'); await sleep(200); await shot('nav-expanded-mode'); await click('#mode-close')
  await pick('desktop')
  await ev('window.electron.resizeWindow(900, 640)'); await sleep(400)
  await click('[data-tab="clan"]'); await sleep(200); await shot('nav-desktop-clan')
  // (the phone / narrow single-column layout can't be reached here: main.js clamps Desktop to ≥ 640px wide)
  await pick('banner'); await sleep(300)
  assert(await ev('getComputedStyle(document.getElementById("attention")).display') !== 'none', 'Banner shows the attention summary')
  await shot('nav-banner')
  await click('#attention [data-att-more]'); await sleep(700)
  assert(await ev('document.body.dataset.layout') === 'overlay', 'Banner +N opens the full window')
  await pick('overlay')
}
