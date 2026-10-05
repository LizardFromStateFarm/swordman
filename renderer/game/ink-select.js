// InkSelect — replaces every native <select> with an in-app picker (v1 mobile fix 2026-10-05: iOS drew the system wheel
// for World → People's sort, Path → Body's Auto-Temper drill and the clone's destination). The <select> stays in the DOM,
// hidden, as the source of truth: picking an option sets its value and fires a bubbling 'change', so every view's
// existing listener keeps working. Enhanced automatically (MutationObserver, like Icon.hydrate); opt out with data-native.
// Depends on: Icon (icons.js). Styles: styles.css → "InkSelect".

const InkSelect = {
  menu: null, src: null, btn: null,

  hydrate(root) {
    const list = root.matches?.('select') ? [root] : root.querySelectorAll?.('select') || []
    for (const sel of list) this._enhance(sel)
  },
  _enhance(sel) {
    if (sel.dataset.native != null || sel.dataset.inkSel != null || sel.multiple) return
    sel.dataset.inkSel = '1'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `ink-sel ${sel.className}`.trim()
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false')
    const lab = sel.getAttribute('aria-label'); if (lab) btn.setAttribute('aria-label', lab)
    btn.innerHTML = '<span class="ink-sel-v"></span><i class="ink-sel-caret" aria-hidden="true"></i>'
    btn._src = sel
    sel.classList.add('ink-sel-src'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true')
    sel.after(btn)
    this._label(btn)
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.menu && this.btn === btn ? this.close() : this.open(btn) })
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.open(btn) } })
    sel.addEventListener('change', () => this._label(btn))
  },
  _label(btn) {
    const o = btn._src.selectedOptions[0]
    btn.querySelector('.ink-sel-v').textContent = o ? o.textContent : ''
    btn.disabled = btn._src.disabled
  },

  open(btn) {
    this.close()
    const sel = btn._src
    this.btn = btn; this.src = sel
    const m = document.createElement('div')
    m.className = 'ink-sel-menu'; m.setAttribute('role', 'listbox')
    if (sel.getAttribute('aria-label')) m.setAttribute('aria-label', sel.getAttribute('aria-label'))
    m.innerHTML = [...sel.options].map((o, i) =>
      `<button type="button" role="option" class="ink-sel-opt${o.selected ? ' on' : ''}" data-i="${i}" aria-selected="${o.selected}"${o.disabled ? ' disabled' : ''}>
        <span class="ink-sel-tick">${o.selected ? Icon('check') : ''}</span><span class="ink-sel-t"></span></button>`).join('')
    ;[...m.querySelectorAll('.ink-sel-t')].forEach((t, i) => { t.textContent = sel.options[i].textContent })
    document.body.appendChild(m)
    this.menu = m
    btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open')
    this._place()
    m.addEventListener('click', e => {
      const o = e.target.closest('.ink-sel-opt'); if (!o || o.disabled) return
      this.pick(+o.dataset.i)
    })
    m.addEventListener('keydown', e => this._key(e))
    ;(m.querySelector('.ink-sel-opt.on') || m.querySelector('.ink-sel-opt:not([disabled])'))?.focus({ preventScroll: true })
    m.querySelector('.ink-sel-opt.on')?.scrollIntoView({ block: 'nearest' })
  },
  // Under the button (or above it when there's no room), at least as wide as it, kept inside the window
  _place() {
    const m = this.menu, r = this.btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pad = 8
    // the Settings text size zooms #tab-body; the menu lives on <body>, so it takes the button's effective zoom as a size var
    const z = this.btn.offsetHeight ? r.height / this.btn.offsetHeight : 1
    m.style.setProperty('--isz', Math.max(0.6, Math.min(2, z || 1)).toFixed(3))
    m.style.minWidth = Math.round(r.width) + 'px'
    m.style.maxHeight = ''
    const h = m.offsetHeight, w = Math.min(m.offsetWidth, vw - pad * 2)
    // a nav bar pinned below the button (the phone's bottom tabs) is the floor, so the menu never covers it
    const nav = document.getElementById('tabs')?.getBoundingClientRect(), floor = nav && nav.height && nav.top > r.bottom && nav.top < vh ? nav.top : vh
    const below = floor - r.bottom - pad, above = r.top - pad
    const down = h <= below || below >= above
    m.style.maxHeight = Math.max(120, (down ? below : above) - 4) + 'px'
    const mh = Math.min(h, parseFloat(m.style.maxHeight))
    m.style.top = Math.round(down ? r.bottom + 4 : r.top - 4 - mh) + 'px'
    m.style.left = Math.round(Math.max(pad, Math.min(r.left, vw - pad - w))) + 'px'
    m.classList.toggle('up', !down)
  },
  pick(i) {
    const sel = this.src, btn = this.btn
    this.close()
    if (!sel || sel.selectedIndex === i) { btn?.focus({ preventScroll: true }); return }
    sel.selectedIndex = i
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    if (btn?.isConnected) { this._label(btn); btn.focus({ preventScroll: true }) }
  },
  close() {
    if (!this.menu) return
    this.menu.remove(); this.menu = null
    if (this.btn) { this.btn.setAttribute('aria-expanded', 'false'); this.btn.classList.remove('open') }
    this.src = null
  },
  _key(e) {
    const opts = [...this.menu.querySelectorAll('.ink-sel-opt:not([disabled])')], at = opts.indexOf(document.activeElement)
    const go = j => { e.preventDefault(); opts[Math.max(0, Math.min(opts.length - 1, j))]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(opts.length - 1)
    else if (e.key === 'Tab') this.close()
  },
}

// Close on a tap outside, Esc (before any view's own Esc handler), resize, or a scroll outside the menu
document.addEventListener('pointerdown', e => {
  if (InkSelect.menu && !InkSelect.menu.contains(e.target) && !e.target.closest?.('.ink-sel.open')) InkSelect.close()
}, true)
document.addEventListener('keydown', e => {
  if (InkSelect.menu && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const b = InkSelect.btn; InkSelect.close(); b?.focus() }
}, true)
window.addEventListener('resize', () => InkSelect.close())
document.addEventListener('scroll', e => { if (InkSelect.menu && !InkSelect.menu.contains(e.target)) InkSelect.close() }, true)

// Views rebuild their HTML with innerHTML: enhance any new <select> before it paints (same pattern as Icon.hydrate);
// a removed button closes its open menu
new MutationObserver(recs => {
  for (const r of recs) {
    for (const n of r.addedNodes) if (n.nodeType === 1 && (n.tagName === 'SELECT' || n.querySelector?.('select'))) InkSelect.hydrate(n)
    if (InkSelect.btn && !InkSelect.btn.isConnected) InkSelect.close()
  }
}).observe(document.body, { childList: true, subtree: true })
InkSelect.hydrate(document.body)
