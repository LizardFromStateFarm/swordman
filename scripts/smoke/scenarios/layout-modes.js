// Real-app smoke scenario — Phase 6E layout modes (roadmap 1.7, docs/systems/ui-layout.md → "Layout modes"):
// picks every mode from the ▣ picker and checks the real window size + body[data-layout] + tab-body height,
// the banner strip's readouts, a popup auto-"peeking" out of banner and dropping back when closed, the ⬡ / ▭
// buttons, Desktop's resize IPC, and that going back to the character select never leaves a 56px banner.
// Screenshots: scripts/smoke/out/layout-*.png. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/layout-modes.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const size = () => ev('({ w: innerWidth, h: innerHeight, layout: document.body.dataset.layout, tabBody: Math.round(document.getElementById("tab-body").getBoundingClientRect().height), hud: Math.round(document.getElementById("hud").getBoundingClientRect().height) })')
  const pick = async mode => {
    await click('#btn-layout')
    await wait('!document.getElementById("layout-picker").classList.contains("hidden")')
    await click(`.layout-opt[data-layout="${mode}"]`)
    await sleep(600)
  }

  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  assert(await ev('!!document.getElementById("layout-tip")'), 'first launch shows the one-time ▣ tip')

  let z = await size()
  assert(z.layout === 'overlay' && z.w === 300 && z.h >= 600, `overlay default: ${z.w}×${z.h}, tab body ${z.tabBody}px, hud ${z.hud}px`)
  await shot('layout-overlay')

  await pick('expanded')
  assert(await ev('!document.getElementById("layout-tip")'), 'opening the picker dismisses the tip')
  z = await size()
  assert(z.layout === 'expanded' && z.w === 640, `expanded: ${z.w}×${z.h}, tab body ${z.tabBody}px`)
  await click('[data-tab="stats"]')
  await shot('layout-expanded')

  await pick('desktop')
  z = await size()
  assert(z.layout === 'desktop' && z.w >= 640, `desktop: ${z.w}×${z.h}, tab body ${z.tabBody}px`)
  assert(await ev('!document.getElementById("btn-pin").classList.contains("pinned")'), 'desktop is not pinned on top')
  await ev('window.electron.resizeWindow(820, 600)')
  await sleep(400)
  z = await size()
  assert(z.w === 820 && z.h === 600, `desktop resize IPC → ${z.w}×${z.h}`)
  await shot('layout-desktop')

  await pick('banner')
  z = await size()
  assert(z.layout === 'banner' && z.h === 56 && z.w > 600, `banner: ${z.w}×${z.h}`)
  assert(await ev('document.getElementById("btn-pin").classList.contains("pinned")'), 'banner is pinned on top')
  assert(await ev('!!document.querySelector("#banner-stones .ic-stone") && !!document.querySelector("#banner-exp .ic-explore") && /expedition/i.test(document.getElementById("banner-exp").textContent)'), 'banner shows stones + expedition')
  await shot('layout-banner')

  // A popup opening in banner mode opens the full window, and closing it drops back to the strip.
  await ev('document.getElementById("confirm-overlay").classList.remove("hidden")')
  await sleep(600)
  z = await size()
  assert(z.layout === 'overlay' && z.h > 300, `popup peeks out of banner: ${z.layout} ${z.w}×${z.h}`)
  await ev('document.getElementById("confirm-overlay").classList.add("hidden")')
  await sleep(600)
  z = await size()
  assert(z.layout === 'banner' && z.h === 56, `closing the popup returns to the banner: ${z.layout}`)

  // ⬡ opens the full window by hand; ▭ (the titlebar layout button while peeking) returns.
  await click('#btn-unbanner')
  await sleep(600)
  z = await size()
  assert(z.layout === 'overlay' && await ev('!!document.querySelector("#btn-layout .ic-strip")'), 'expand peeks; titlebar shows the back-to-strip icon')
  await shot('layout-banner-peek')
  await click('#btn-layout')
  assert(await ev('!!document.getElementById("layout-back")'), 'picker offers Back to the banner while peeking')
  await shot('layout-picker-peek')
  await click('#layout-back')
  await sleep(600)
  assert((await size()).layout === 'banner', 'Back to the banner returns to the strip')

  // Back to the character select: never a 56px strip. Continue → banner again (the saved preference).
  await ev('gameState.forceSave()')
  await click('#btn-unbanner'); await sleep(500)
  await click('#btn-back'); await sleep(700)
  z = await size()
  assert(z.h >= 600 && !(await ev('document.getElementById("charselect").classList.contains("hidden")')), `character select is full height (${z.w}×${z.h})`)
  await click('.cs-btn-play[data-slot="0"]'); await sleep(700)
  assert((await size()).layout === 'banner', 'continuing a slot restores the saved banner mode')

  // Leave it in the default so a rerun starts clean (the throwaway profile is deleted anyway).
  await click('#btn-unbanner'); await sleep(500)
  await pick('overlay')
  z = await size()
  assert(z.layout === 'overlay' && z.w === 300, `back to overlay ${z.w}×${z.h}`)
}
