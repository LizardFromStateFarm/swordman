// Real-app visual baseline (roadmap 1.8c, docs/systems/ui-review.md → "Baseline"): screenshots EVERY screen, layout
// mode, popup and art piece for the Visual Review Gate reviewers. Output: scripts/smoke/out/vb-<group>-*.png, groups:
//   1 charselect / settings / layout picker · 2 Overlay HUD + all tabs (top + scrolled) · 3 Expanded + Desktop tabs ·
//   5 popups (proposal, family event, heir, hall, ascension, tournament, death → interlude) · 6 cultivator sprite
//   states (3 moments each, magnified) · 7 beast sprites (encounter cards, magnified)
// (Group 4 = the banner, see banner-menus.js.) Rerun after 1.8b / A4 for before/after comparisons.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/visual-baseline.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const TABS = ['techniques', 'stats', 'explore', 'beasts', 'family', 'clan', 'sect', 'pack', 'craft', 'events', 'banter']   // 1.8b-1 views
  const visible = id => ev(`!document.getElementById(${JSON.stringify(id)}).classList.contains('hidden')`)
  const rect = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: r.height } : null })()`)
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700)
  }

  // ── Group 1: character select, settings, layout picker ──────────────────────
  await shot('vb-1-charselect-empty')
  await ev(`(async () => {
    await window.electron.saveSlot(0, gameState.buildDevSave('founder'))
    await window.electron.saveSlot(1, gameState.buildDevSave('member_elder'))
  })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await shot('vb-1-charselect-slots')
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await shot('vb-1-first-launch-tip')
  await ev('document.getElementById("layout-tip")?.click()')
  await ev(`(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3 })()`)

  // Family + clan content so Stats / popups have something to show (Founder = first-life clan head).
  await ev(`(() => { const gs = gameState, s = gs.get(); s.age = Math.max(s.age, 30); s.maxStageThisLife = Math.max(s.maxStageThisLife || 0, s.stageIndex); s.family.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs._notify() })()`)
  await sleep(500)
  if (await visible('proposal-overlay')) {
    await shot('vb-5-proposal')
    await click('#proposal-suitors [data-suitor]')
  }
  await ev(`(() => {
    const gs = gameState, f = gs.get().family
    if (!f.spouse) return
    f.nextEventYear = 1e9; f.nextChildEventYear = 1e9
    for (let i = 0; i < 5; i++) { const c = gs._makeChild(f.spouse); c.bornYear -= 18 + i * 9; c.stageIndex = 3 + i * 2 }
    gs._recalc(); gs._notify()
  })()`)

  await click('#btn-settings'); await sleep(250); await shot('vb-1-settings'); await click('#settings-close')
  await click('#btn-layout'); await sleep(250); await shot('vb-1-layout-picker')
  await ev('document.getElementById("layout-picker").classList.add("hidden")')

  // ── Group 2: Overlay (default) — HUD + every tab, top and scrolled ─────────
  for (const t of TABS) {
    await click(`[data-tab="${t}"]`); await sleep(250)
    await shot(`vb-2-overlay-${t}`)
    const h = await ev(`(() => { const p = document.getElementById('tab-${t}'); return [p.scrollHeight, p.clientHeight] })()`)
    if (h[0] > h[1] * 1.6) {
      await ev(`document.getElementById('tab-${t}').scrollTop = ${Math.round(h[0] / 2 - h[1] / 2)}`); await sleep(150)
      await shot(`vb-2-overlay-${t}-mid`)
      await ev(`document.getElementById('tab-${t}').scrollTop = 1e6`); await sleep(150)
      await shot(`vb-2-overlay-${t}-end`)
      await ev(`document.getElementById('tab-${t}').scrollTop = 0`)
    }
  }

  // ── Group 3: Expanded + Desktop ────────────────────────────────────────────
  await pick('expanded')
  for (const t of ['stats', 'sect', 'explore', 'craft', 'pack']) {
    await click(`[data-tab="${t}"]`); await sleep(250); await shot(`vb-3-expanded-${t}`)
  }
  await pick('desktop')
  for (const t of ['techniques', 'stats', 'sect']) {
    await click(`[data-tab="${t}"]`); await sleep(250); await shot(`vb-3-desktop-${t}`)
  }
  await pick('overlay')

  // ── Group 5: popups ────────────────────────────────────────────────────────
  await ev(`(() => { const gs = gameState, s = gs.get(); if (!s.family.spouse) return; s.family.nextEventYear = s.world.year; gs._tickFamily(); gs._notify() })()`)
  await sleep(500)
  if (await visible('family-overlay')) { await shot('vb-5-family-event'); await click('#family-choices [data-choice]:not([disabled])') }

  await click('[data-tab="family"]'); await sleep(200)
  if (await ev('!!document.getElementById("_choose-heir") && !document.getElementById("_choose-heir").disabled')) {
    await click('#_choose-heir'); await sleep(250); await shot('vb-5-heir'); await click('#heir-close')
  }
  await click('[data-tab="clan"]'); await sleep(200)
  await click('[data-tab="hall"]'); await sleep(300); await shot('vb-5-hall')   // 1.8b-4: Kin → Hall view
  await ev('for (let n = document.getElementById("tab-hall"); n; n = n.parentElement) n.scrollTop = 1e6'); await sleep(150); await shot('vb-5-hall-end')
  await click('[data-tab="clan"]')

  await click('[data-tab="family"]'); await sleep(200)
  if (await ev('!!document.getElementById("_tournament") && !document.getElementById("_tournament").disabled')) {
    await click('#_tournament'); await sleep(250)
    if (await visible('confirm-overlay')) { await shot('vb-5-confirm-dialog'); await click('#confirm-yes'); await sleep(300) }
    if (await visible('tournament-overlay')) {
      await shot('vb-5-tournament')
      await click('#tournament-cancel'); await sleep(200)
      if (await visible('confirm-overlay')) await click('#confirm-yes')
      await ev('document.getElementById("tournament-overlay").classList.add("hidden")')
    }
  }

  // Ascension Trial card: last mortal stage with a full Qi bar and the full bloodline (Phase 47)
  await ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = CULTIVATION_STAGES.length - 2; s.bloodlineQuality = ASCENSION_MIN_BLOODLINE; gs._recalc(); s.qi = gs.get().derived.qiCap; gs._recalc(); gs._notify() })()`)
  await sleep(300)
  await click('#btn-breakthrough'); await sleep(400)
  if (await visible('ascension-overlay')) { await shot('vb-5-ascension'); await click('#ascend-wait') }

  // Death → interlude → birth card
  await ev('gameState.passTheMantle()')
  await wait('!document.getElementById("death-overlay").classList.contains("hidden")')
  for (let i = 0; i < 6 && await visible('death-overlay'); i++) {
    await sleep(300); await shot(`vb-5-death-${i}`)
    const next = await ev(`(() => { for (const sel of ['#interlude-choices [data-bet]', '#interlude-choices [data-rebirth="clan"]', '#interlude-choices button', '#death-ok:not(.hidden)']) { const b = document.querySelector(sel); if (b) { b.click(); return sel } } return null })()`)
    if (!next) break
  }
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // NOTE (1.8c finding): the breakthrough sprite is overwritten by the same-frame state notify (updateSprite), so
  // these 'breakthrough' shots show the stage sprite until that bug is fixed.
  // ── Group 6: cultivator sprites (one stage per sprite state, 3 moments each, 3× magnified) ──
  // first stage of each sprite state (stages.js); banter muted so no speech bubble covers the canvas
  const spriteStages = { idle: 0, meditating: 1, meditating_deep: 10, levitating: 13, transcending: 16 }
  await ev('gameState.setSetting("banterFreq", "off"); document.getElementById("banter-bubble").classList.add("hidden")')
  const wrap = await rect('#sprite-wrap')
  for (const [state, idx] of Object.entries(spriteStages)) {
    await ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = ${idx}; s.qi = 0; gs._recalc(); gs._notify() })()`)
    await sleep(900)
    for (let k = 0; k < 3; k++) { await shot(`vb-6-sprite-${state}-${k}`, { ...wrap, scale: 3 }); await sleep(420) }
  }
  await ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = 16; gs._recalc(); s.qi = gs.get().derived.qiCap; gs._recalc(); gs._notify() })()`)
  await sleep(300)
  await click('#btn-breakthrough')
  for (let k = 0; k < 3; k++) { await sleep(180); await shot(`vb-6-sprite-breakthrough-${k}`, { ...wrap, scale: 3 }) }
  await sleep(600)
  await shot('vb-6-hud-after-breakthrough')

  // ── Group 7: beast sprites (encounter cards on Explore), 2× ────────────────
  await ev(`(() => { const gs = gameState, s = gs.get(); s.stageIndex = Math.max(s.stageIndex, 10); s.beastEncounters = Object.keys(BEAST_SPRITES).map((t, i) => ({ id: 'vb' + i, typeId: t, traits: [], seenAt: Date.now() })); gs._recalc(); gs._notify() })()`)
  await pick('expanded')
  await click('[data-tab="explore"]'); await sleep(300)
  await ev(`(() => { const el = document.querySelector('.beast-encounter-row'); el?.scrollIntoView({ block: 'start' }) })()`)
  await sleep(200)
  const enc = await ev(`(() => { const rows = [...document.querySelectorAll('.beast-encounter-row')]; if (!rows.length) return null; const a = rows[0].getBoundingClientRect(), b = rows[rows.length - 1].getBoundingClientRect(); return { x: a.left, y: a.top, width: a.width, height: Math.min(b.bottom, innerHeight) - a.top } })()`)
  if (enc) await shot('vb-7-beasts', { ...enc, scale: 2 })
  await shot('vb-7-explore-expanded')
  await pick('overlay')
  assert(true, 'visual baseline captured')
}
