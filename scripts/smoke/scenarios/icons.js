// Real-app smoke scenario — the custom UI icon set (roadmap 1.8d; docs/systems/icons.md). Renders every icon in
// UI_ICONS as a contact sheet inside the real app (so fonts/CSS are the game's), at 14/18/32/64px in the palette
// colors, then screenshots the icon-bearing chrome (titlebar, HUD, Pack, layout picker, charselect) in each layout
// mode. Asserts: every icon renders a non-empty SVG, no chrome glyph is left as CJK/emoji text in the HUD+titlebar.
// Screenshots: scripts/smoke/out/icons-*.png — the input to the Visual Review Gate for the icon set.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/icons.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const names = await ev('Icon.names()')
  assert(names.length >= 25, `icon set has ${names.length} icons`)
  const empty = await ev(`Icon.names().filter(n => { const d = document.createElement('div'); d.innerHTML = Icon(n); document.body.appendChild(d);
    const b = d.querySelector('svg').getBBox(); d.remove(); return !(b.width > 2 || b.height > 2) })`)
  assert(empty.length === 0, `every icon draws something (${empty.join(', ') || 'all ok'})`)

  // ── Contact sheet ────────────────────────────────────────────────────────────────────────
  await emulate(1240, 1400)
  await ev(`(() => {
    const sheet = document.createElement('div'); sheet.id = 'icon-sheet'
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:#08040E;padding:14px;font-family:var(--font);color:var(--text)'
    const cols = ['var(--gold)', 'var(--text)', 'var(--jade)', 'var(--ember)', 'var(--purple)', 'var(--dim)']
    sheet.innerHTML = '<div style="color:var(--gold);font-size:13px;letter-spacing:1px;margin-bottom:10px">UI icon set · ' + Icon.names().length + ' icons · 14 / 18 / 32 / 48 px</div>' +
      '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">' + Icon.names().map((n, i) =>
        '<div style="border:1px solid var(--border);border-radius:4px;padding:8px;background:var(--bg2);display:flex;align-items:center;gap:10px;color:' + cols[i % cols.length] + '">' +
          '<span style="font-size:48px;line-height:0">' + Icon(n) + '</span>' +
          '<span style="display:flex;flex-direction:column;gap:6px"><span style="font-size:32px;line-height:0">' + Icon(n) + '</span>' +
          '<span style="display:flex;gap:6px;align-items:center"><span style="font-size:18px;line-height:0">' + Icon(n) + '</span><span style="font-size:14px;line-height:0">' + Icon(n) + '</span></span>' +
          '<span style="font-size:10px;color:var(--dim-hi)">' + n + '</span></span></div>').join('') + '</div>'
    document.body.appendChild(sheet)
  })()`)
  await sleep(300)
  await shot('icons-sheet')
  await ev(`document.getElementById('icon-sheet').remove()`)
  await clearEmulation()
  await sleep(300)

  // ── Charselect + in-game chrome ────────────────────────────────────────────────────────────
  await shot('icons-charselect')
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(600)
  const leftovers = await ev(`(() => {
    const re = /[\\u3400-\\u9FFF\\u2600-\\u27BF\\u2B00-\\u2BFF\\u25A0-\\u25FF\\u2190-\\u21FF\\u22EF\\u{1F300}-\\u{1FAFF}]/u
    const out = []
    for (const sel of ['#titlebar', '#meditate-badge', '#qi-labels', '#qi-rate-row', '#vitals', '#actions', '#banner-info', '#banner-btns', '#resize-grip', '#tb-menu', '#cs-titlebar']) {
      const el = document.querySelector(sel); if (!el) continue
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n; (n = w.nextNode());) if (re.test(n.nodeValue)) out.push(sel + ': ' + n.nodeValue.trim())
    }
    return out })()`)
  assert(leftovers.length === 0, `no CJK/emoji/symbol glyphs left in titlebar + HUD (${leftovers.join(' | ') || 'none'})`)

  const pick = async mode => {
    if (await ev('document.body.dataset.layout === "overlay"')) { await click('#btn-more'); await click('.tbm-item[data-tbm="layout"]') }
    else await click('#btn-layout')
    await wait('!document.getElementById("layout-picker").classList.contains("hidden")')
    await sleep(200)
    await shot(`icons-layout-picker-${await ev('document.body.dataset.layout')}`)
    await click(`.layout-opt[data-layout="${mode}"]`)
    await sleep(700)
  }

  await shot('icons-overlay')
  await click('#btn-more'); await sleep(200); await shot('icons-overlay-more-menu'); await click('#btn-more')
  await ev(`document.getElementById('btn-meditate').click()`); await sleep(300)
  await ev(`document.querySelector('[data-group="pack"]')?.click()`); await sleep(400)
  await shot('icons-overlay-pack')
  await pick('expanded'); await shot('icons-expanded')
  await pick('desktop');  await shot('icons-desktop')
  await pick('banner');   await shot('icons-banner')
  await click('#btn-unbanner'); await sleep(400); await pick('desktop')   // a phone reports the desktop layout
  await emulate(390, 844)
  await sleep(500)
  await shot('icons-mobile')
  await clearEmulation()
}
