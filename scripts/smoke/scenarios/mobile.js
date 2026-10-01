// Real-app smoke scenario — mobile / narrow layout pass (Phase 6E, task 1.8e; docs/systems/ui-layout.md →
// "Mobile / narrow layout"). Phones/native shells report the `desktop` layout (platform-storage shim), so the
// scenario switches the app to Desktop, forces a 390×844 phone viewport + touch media over CDP, and checks: the
// narrow layout engages (`data-narrow`), no view overflows horizontally, the tab bar moves to the bottom with
// ≥44px targets, the sprite canvas fits the width, an overlay fits the screen, and landscape returns the rail.
// Screenshots: scripts/smoke/out/mobile-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/mobile.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const overflowPx = () => ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  const rect = sel =>
    ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } })()`)
  const pick = async mode => {
    await click('#btn-layout')
    await wait('!document.getElementById("layout-picker").classList.contains("hidden")')
    await click(`.layout-opt[data-layout="${mode}"]`)
    await sleep(700)
  }

  await emulate(390, 844)
  assert(await ev('innerWidth === 390 && innerHeight === 844'), 'emulated phone viewport is 390×844')
  assert(await ev('matchMedia("(hover: none)").matches && matchMedia("(pointer: coarse)").matches'), 'touch media emulation is active')

  // ── Enter the game, then switch to the layout a phone/native shell reports ─────────────────
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(500)
  await pick('desktop')

  assert(await ev('document.body.dataset.layout === "desktop"'), 'shell is in the desktop layout (what a phone reports)')
  assert(await ev('document.body.dataset.narrow === "1"'), 'body[data-narrow="1"] on a narrow screen')
  assert((await overflowPx()) <= 1, `in-game: no horizontal overflow (${await overflowPx()}px)`)

  // ── Bottom tab bar + touch targets + canvas ────────────────────────────────────────────────
  const tabs = await rect('#tabs')
  assert(tabs && tabs.top > 844 / 2, `tab bar sits at the bottom (top ${tabs?.top})`)
  const tab = await rect('.tab')
  assert(tab && tab.h >= 44, `tabs are ≥44px tall (${tab?.h}px)`)
  const sub = await rect('.subtab:not(.hidden)')
  assert(sub && sub.h >= 30, `sub-tabs are tap-sized (${sub?.h}px)`)
  const canvas = await rect('#sprite-canvas')
  assert(canvas && canvas.w >= 180 && canvas.w <= 390, `sprite canvas fits the width (${canvas?.w}px)`)
  await shot('mobile-hud')

  // ── Attention center: minimized by default on a phone, expanded by the head caret (user 2026-10-01) ─────────
  assert(await ev('document.getElementById("attention").classList.contains("minimized")'), 'attention starts minimized on a phone')
  assert(await ev('!document.querySelector("#attention .att-rest") || getComputedStyle(document.querySelector("#attention .att-rest")).display === "none"'), 'the rest of the list is hidden while minimized')
  const caret = await rect('#attention .att-min')
  assert(caret && caret.h >= 30, `the attention caret is tap-sized (${caret?.h}px)`)
  const collapsedH = (await rect('#attention'))?.h
  await click('#attention [data-att-min]')
  await sleep(250)
  assert(await ev('!document.getElementById("attention").classList.contains("minimized")'), 'the caret expands the attention center')
  assert(await ev('localStorage.getItem("cultivator-idle:att-min") === "0"'), 'expanding is remembered per device (att-min=0)')
  const expandedH = (await rect('#attention'))?.h
  assert(expandedH >= collapsedH, `expanded is not shorter than collapsed (${collapsedH} → ${expandedH})`)
  await shot('mobile-attention-expanded')
  await click('#attention [data-att-min]')
  await sleep(200)
  assert(await ev('document.getElementById("attention").classList.contains("minimized")'), 'the caret minimizes it again')
  assert((await rect('#attention'))?.h <= collapsedH + 4, 'minimized returns to the compact height')
  await shot('mobile-attention-minimized')

  // ── The whole app scrolls as one surface; the tab bar stays put (user 2026-10-01) ──────────
  assert(await ev('getComputedStyle(document.getElementById("app")).overflowY === "auto"'), 'the app itself is the scroller on a phone')
  const scrolled = await ev('(() => { const a = document.getElementById("app"); a.scrollTop = 1e6; return a.scrollTop })()')
  await sleep(250)
  assert(scrolled > 0, `the whole app scrolls to the bottom (scrollTop ${scrolled})`)
  const tabsStuck = await rect('#tabs')
  assert(tabsStuck && tabsStuck.bottom >= 820 && tabsStuck.bottom <= 845, `the tab bar stays at the bottom when scrolled (bottom ${tabsStuck?.bottom})`)
  await shot('mobile-scrolled-bottom')
  await ev('document.getElementById("app").scrollTop = 0')
  await sleep(200)

  // ── iOS: fields are ≥16px and the viewport is locked so focusing one never zooms the WebView ─
  assert(await ev('parseFloat(getComputedStyle(document.getElementById("rename-input")).fontSize) >= 16'), 'the rename field is ≥16px on touch (no iOS focus-zoom)')
  assert(await ev('/maximum-scale=1/.test(document.querySelector(\'meta[name="viewport"]\').content)'), 'the viewport meta caps the zoom scale')

  // ── Every reachable view fits the width ────────────────────────────────────────────────────
  for (const v of ['stats', 'explore', 'pack', 'craft', 'events']) {
    await ev(`document.querySelector('[data-tab="${v}"]').click()`)
    await sleep(400)
    assert((await overflowPx()) <= 1, `${v}: no horizontal overflow (${await overflowPx()}px)`)
    await shot(`mobile-${v}`)
  }

  // ── An overlay fits inside the phone screen ────────────────────────────────────────────────
  await click('#btn-settings')
  await sleep(400)
  const box = await rect('#settings-box')
  assert(box && box.w <= 390 && box.h <= 844, `settings overlay fits the screen (${box?.w}×${box?.h})`)
  await shot('mobile-settings')
  await ev('document.getElementById("settings-overlay").classList.add("hidden")')

  // ── Landscape phone → back to the two-column layout (844 wide) ─────────────────────────────
  await emulate(844, 390)
  assert(await ev('document.body.dataset.narrow === "0"'), 'a landscape phone is not narrow (data-narrow="0")')
  assert(await ev('!document.getElementById("attention").classList.contains("minimized")'), 'a wide screen is never minimized')
  assert(await ev('getComputedStyle(document.querySelector("#attention .att-min")).display === "none"'), 'the minimize caret is phone-only')
  const tabL = await rect('#tabs')
  assert(tabL && tabL.top < 390 / 2, `landscape returns the tabs to the side rail (top ${tabL?.top})`)
  await shot('mobile-landscape')

  // ── Character select at phone size (desktop layout persists out of a game) ─────────────────
  await emulate(390, 844)
  await ev('gameState.forceSave()')
  await click('#btn-back')
  await sleep(800)
  assert(await ev('!document.getElementById("charselect").classList.contains("hidden")'), 'back at the character select')
  assert((await overflowPx()) <= 1, `character select: no horizontal overflow (${await overflowPx()}px)`)
  await shot('mobile-charselect')

  await clearEmulation()
}
