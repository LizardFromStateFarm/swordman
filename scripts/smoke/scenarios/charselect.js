// Real-app smoke — character select / tutorial / delete (mobile playtest 2026-11-26).
// On a fresh profile: the intro must appear on a new game; leaving to the menu must close the intro/coach-mark
// layers (they live on <body> at a high z-index) so the menu stays clickable; deleting a slot must leave an
// interactive menu with an empty slot. Screenshots: scripts/smoke/out/charselect-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/charselect.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  await ev('localStorage.removeItem("ci:smoke-no-tips")')   // the smoke driver holds tips by default
  await wait('!document.getElementById("charselect").classList.contains("hidden")')
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app").classList.contains("hidden")')
  await ev('document.getElementById("layout-tip")?.remove()')   // first-launch tip blocks coach marks
  await sleep(400)

  // The intro (or a coach mark) must open on a fresh game.
  await wait('(!document.getElementById("intro-overlay").classList.contains("hidden")) || (!document.getElementById("tut-overlay").classList.contains("hidden"))', 6000)
  const introOpen = await ev('!document.getElementById("intro-overlay").classList.contains("hidden")')
  assert(introOpen, 'the intro scroll opens on a new game (not just a coach mark)')
  await shot('charselect-intro')

  // Dismiss whatever opened, then leave to the menu.
  if (introOpen) await click('.intro-skip')
  else await click('#tut-overlay [data-tut-act="skip"]')
  await sleep(300)
  await click('#btn-back')
  await wait('!document.getElementById("charselect").classList.contains("hidden")')
  await sleep(400)

  assert(await ev('document.getElementById("intro-overlay").classList.contains("hidden")'), 'the intro layer is closed when leaving to the menu')
  assert(await ev('document.getElementById("tut-overlay").classList.contains("hidden")'), 'the coach-mark layer is closed when leaving to the menu')
  assert(await ev(`(() => { const o = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!o && !!o.closest('#charselect') })()`), 'the menu centre is clickable (no overlay on top)')

  // Delete the slot; the menu and the empty slot must stay interactive.
  await click('.cs-btn-del[data-slot="0"]')
  await wait('!document.getElementById("confirm-overlay").classList.contains("hidden")')
  await click('#confirm-yes')
  await wait(`!!document.querySelector('.cs-btn-new[data-slot="0"]')`)
  assert(await ev('document.getElementById("confirm-overlay").classList.contains("hidden")'), 'the confirm overlay closes after deleting')
  assert(await ev(`(() => { const b = document.querySelector('.cs-btn-new[data-slot="0"]'); if (!b) return false; const r = b.getBoundingClientRect(); const o = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!o && (o === b || b.contains(o)) })()`), 'the new-slot button is clickable after a delete')
  await shot('charselect-after-delete')
}
