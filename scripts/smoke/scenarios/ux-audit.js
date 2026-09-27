// Real-app UX audit scenario (roadmap 1.8a, docs/systems/ui-layout.md → "UX Audit"): loads late-game characters
// (dev presets + a clan head with spouse/children), screenshots every tab and the main overlays, and prints layout
// metrics per tab: visible height, total content height, "screens" of scroll, button count and smallest font.
// Rerun it after layout/UI changes (1.7, 1.8b) to compare before/after: screenshots land in scripts/smoke/out/ux-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/ux-audit.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const TABS = ['techniques', 'stats', 'explore', 'beasts', 'family', 'clan', 'sect', 'pack', 'craft', 'events', 'banter']   // 1.8b-1 views
  const metrics = []

  const measureTabs = async label => {
    for (const t of TABS) {
      await click(`[data-tab="${t}"]`)
      await sleep(200)
      const m = await ev(`(() => {
        const p = document.getElementById('tab-${t}')
        const fonts = [...p.querySelectorAll('*')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
          .map(e => parseFloat(getComputedStyle(e).fontSize))
        return { view: p.clientHeight, content: p.scrollHeight, buttons: p.querySelectorAll('button, input, select').length,
                 minFont: fonts.length ? Math.min(...fonts) : 0, sections: p.querySelectorAll('.section-title').length }
      })()`)
      metrics.push({ label, tab: t, ...m, screens: +(m.content / Math.max(1, m.view)).toFixed(1) })
      await shot(`ux-${label}-${t}`)
    }
  }

  const loadPreset = async (slot, preset) => {
    await ev(`(async () => { const save = gameState.buildDevSave('${preset}'); await window.electron.saveSlot(${slot}, save) })()`)
    await ev('location.reload()')
    await sleep(1500)
    await wait(`document.querySelector('.cs-btn-play[data-slot="${slot}"]')`, 10000)
    await click(`.cs-btn-play[data-slot="${slot}"]`)
    await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
    await sleep(300)
  }

  // Fixed chrome: how much of the 540px window the always-visible blocks use vs. the tab body.
  await loadPreset(0, 'member_elder')
  const chrome = await ev(`(() => Object.fromEntries(['titlebar','sprite-wrap','stage-block','qi-block','integrity-block','health-block','age-block','actions','tabs','tab-body']
    .map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().height)])))()`)
  console.log('CHROME HEIGHTS', JSON.stringify(chrome), 'window', await ev('innerWidth + "x" + innerHeight'))
  await measureTabs('elder')

  await loadPreset(1, 'founder')
  await measureTabs('founder')

  // Clan head with spouse + children (the family/clan UI lives in Stats).
  await ev(`(() => {
    const gs = gameState, s = gs.get()
    if (!s.family.spouse) { s.family.nextProposalYear = s.world.year - 1; s.age = Math.max(s.age, 20); gs._tickFamily(); const pr = gs.get().family.proposal; if (pr) gs.acceptSuitor(pr.suitors[0].id) }
    const f = gs.get().family; if (!f.spouse) return; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
    for (let i = 0; i < 4; i++) { const c = gs._makeChild(f.spouse); c.bornYear -= 20 + i * 5; c.stageIndex = 4 + i }
    gs._recalc(); gs._notify()
  })()`)
  await click('[data-tab="family"]')
  await sleep(200)
  const st = await ev(`(() => { const p = document.getElementById('tab-family'); return { view: p.clientHeight, content: p.scrollHeight, buttons: p.querySelectorAll('button').length } })()`)
  metrics.push({ label: 'family', tab: 'family', ...st, screens: +(st.content / st.view).toFixed(1) })
  await shot('ux-family-stats')
  await ev('document.getElementById("tab-family").scrollTop = 99999')
  await shot('ux-family-stats-bottom')

  // Overlays
  await click('#btn-settings'); await sleep(200); await shot('ux-overlay-settings')
  const setH = await ev(`(() => { const b = document.getElementById('settings-body'); return b.scrollHeight + '/' + b.clientHeight })()`)
  console.log('SETTINGS content/visible', setH)
  await click('#settings-close')
  await click('[data-tab="clan"]')
  await click('[data-tab="hall"]'); await sleep(200); await shot('ux-overlay-hall')
  const hallH = await ev(`(() => { const b = document.getElementById('tab-body'); return b.scrollHeight + '/' + b.clientHeight })()`)
  console.log('HALL content/visible', hallH)
  await click('[data-tab="clan"]')

  console.log('\nTAB METRICS (view px · content px · screens · controls · sections · min font px)')
  for (const m of metrics) console.log(`  ${m.label.padEnd(8)} ${m.tab.padEnd(11)} ${String(m.view).padStart(4)} ${String(m.content).padStart(5)} ${String(m.screens).padStart(5)}× ${String(m.buttons).padStart(3)} ${String(m.sections ?? '').padStart(3)} ${m.minFont ?? ''}`)
  assert(metrics.length >= TABS.length * 2, `measured ${metrics.length} tab views`)
}
