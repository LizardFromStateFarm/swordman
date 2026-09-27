// LayoutUI — window layout modes (Phase 6E, roadmap 1.7): the layout picker, body[data-layout], sprite-canvas sizing,
// the banner strip's extra readouts, "peeking" out of banner mode, and Desktop mode's resize grip. UI only (not
// loaded by the sim). main.js owns the window geometry; styles.css owns the look. See docs/systems/ui-layout.md →
// "Layout modes".

const LAYOUT_OPTIONS = [
  { id: 'overlay',  icon: 'layout-overlay', name: 'Overlay',  desc: 'Tall side panel, always on top. The default for playing.' },
  { id: 'expanded', icon: 'layout-expanded', name: 'Expanded', desc: 'Wider, always on top. Cultivator left, tabs right.' },
  { id: 'desktop',  icon: 'layout-desktop', name: 'Desktop',  desc: 'A normal window you can resize. Not pinned on top.' },
  { id: 'banner',   icon: 'strip', name: 'Banner',   desc: 'A slim strip along the screen edge, for while you game or work.' },
]

// Sprite canvas per mode: [width, height, scale]. Banner draws the whole scene as a ~0.36× miniature.
const LAYOUT_CANVAS = {
  overlay:  [300, 150, 1],
  expanded: [300, 150, 1],
  desktop:  [320, 160, 1],
  banner:   [80, 56, 0.36],
}

const LAYOUT_TIP_KEY = 'cultivator-idle:layoutTipSeen'

class LayoutUI {
  // fmt / fmtTime are game.js's number + duration formatters (so the banner follows the Numbers setting).
  constructor(renderer, { fmt, fmtTime }) {
    this.renderer  = renderer
    this.fmt       = fmt
    this.fmtTime   = fmtTime
    this.mode      = document.body.dataset.layout || 'overlay'   // what the window shows right now
    this.saved     = 'overlay'                                    // the player's chosen mode (window.json)
    this.edge      = 'top'
    this.supported = true
    this.inGame    = false
    this.peeking   = false   // temporarily Overlay while the saved mode is banner
    this.autoPeek  = false   // …and the peek was opened by a popup (death, family matter), not the player
    this.onModeChange = null // game.js: closes the banner's quick-action menus when leaving banner mode

    this.picker = document.getElementById('layout-picker')
    document.getElementById('btn-layout').addEventListener('click', () => this.open())
    document.getElementById('btn-unbanner').addEventListener('click', () => this.peek(false))
    this.picker.addEventListener('click', e => { if (e.target === this.picker) this.close() })
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !this.picker.classList.contains('hidden')) this.close() })
    this._wireGrip()
    this._watchPopups()

    // Mobile pass (Phase 6E): a narrow screen is a refinement of the 'desktop' layout phones already report.
    // Mirror the width query onto body[data-narrow] so JS/tests share one signal, and re-fit the sprite canvas.
    this._narrow = window.matchMedia('(max-width: 599px)')
    const onNarrow = () => {
      document.body.dataset.narrow = this._narrow.matches ? '1' : '0'
      this._sizeCanvas()
    }
    this._narrow.addEventListener?.('change', onNarrow)
    window.addEventListener('resize', onNarrow)
    window.addEventListener('orientationchange', onNarrow)
    document.body.dataset.narrow = this._narrow.matches ? '1' : '0'
  }

  // Sprite canvas sizing: the fixed per-mode size, except on a narrow screen where it fits the HUD width.
  _sizeCanvas() {
    const wrap = document.getElementById('sprite-wrap')
    if (this._narrow && this._narrow.matches) {
      const hud = document.getElementById('hud')
      const w = Math.max(180, Math.min(Math.round(hud ? hud.clientWidth : window.innerWidth), 280))
      const h = Math.round(w * 0.5)
      this.renderer.setSize(w, h, 1)
      if (wrap) wrap.style.height = h + 'px'
    } else {
      const [w, h, k] = LAYOUT_CANVAS[this.mode] || LAYOUT_CANVAS.overlay
      this.renderer.setSize(w, h, k)
      if (wrap) wrap.style.height = ''
    }
  }

  async init() {
    const l = await window.electron.getLayout()
    this.supported = l.supported !== false
    this.saved = l.mode
    this.edge  = l.bannerEdge || 'top'
    document.getElementById('btn-layout').classList.toggle('hidden', !this.supported)
    document.getElementById('btn-pin').classList.toggle('hidden', !this.supported)
    document.querySelector('.tbm-item[data-tbm="layout"]')?.classList.toggle('hidden', !this.supported)   // no always-on-top on iOS/Android
    this._apply(l.current || l.mode)
    if (l.pinned != null) this._syncPin(l.pinned)
  }

  // Called by game.js when a slot starts playing / when going back to the character select. The character select
  // can't live in a 56px strip, so banner mode only applies in game.
  enterGame() {
    this.inGame = true
    if (this.saved === 'banner') this._set('banner', false)
    this._maybeTip()
    requestAnimationFrame(() => this._sizeCanvas())   // #app is visible now, so the HUD has a real width
  }

  leaveGame() {
    this.inGame = false
    this.peeking = this.autoPeek = false
    this.close()
    if (this.mode === 'banner' || this.saved === 'banner') this._set('overlay', false)
  }

  open()  { this._dismissTip(); this.render(); this.picker.classList.remove('hidden') }
  close() { this.picker.classList.add('hidden') }

  choose(mode) {
    this.peeking = this.autoPeek = false
    this.close()
    return this._set(mode, true)
  }

  peek(auto) {
    if (this.mode !== 'banner') return
    this.peeking = true
    this.autoPeek = !!auto
    this._set('overlay', false)
  }

  returnToBanner() {
    this.peeking = this.autoPeek = false
    this._set('banner', false)
  }

  // Per-frame banner readouts (spirit stones + expedition). Cheap no-op in the other modes.
  update(s) {
    if (this.mode !== 'banner' || !s) return
    document.getElementById('banner-stones').innerHTML = `<span class="bm-stone">${Icon('stone')}</span> ${this.fmt(s.spiritStones)}`
    const exp = document.getElementById('banner-exp')
    const e = s.expedition
    if (e?.active) {
      const loc = LOCATIONS.find(l => l.id === e.locationId)
      exp.innerHTML = `${Icon('explore')} ${loc?.name || 'Expedition'} · ${this.fmtTime(Math.max(0, Math.ceil((e.endsAt - Date.now()) / 1000)))}`
      exp.classList.add('active')
    } else {
      exp.innerHTML = `${Icon('explore')} No expedition`
      exp.classList.remove('active')
    }
  }

  render() {
    const list = document.getElementById('layout-list')
    list.innerHTML = ''
    if (this.peeking) {
      const back = document.createElement('button')
      back.id = 'layout-back'
      back.className = 'layout-opt active'
      back.innerHTML = `<span class="layout-opt-icon">${Icon('strip-back')}</span><span class="layout-opt-name">Back to the banner</span><span class="layout-opt-desc">You opened the full window from the banner.</span>`
      back.addEventListener('click', () => { this.close(); this.returnToBanner() })
      list.appendChild(back)
    }
    for (const o of LAYOUT_OPTIONS) {
      const b = document.createElement('button')
      b.className = 'layout-opt' + (o.id === this.saved && !this.peeking ? ' active' : '')
      b.dataset.layout = o.id
      b.innerHTML = `<span class="layout-opt-icon">${Icon(o.icon)}</span><span class="layout-opt-name">${o.name}</span><span class="layout-opt-desc">${o.desc}</span>`
      b.addEventListener('click', () => this.choose(o.id))
      list.appendChild(b)
    }
    // Banner edge (top by default: "like a taskbar")
    const edge = document.getElementById('layout-edge')
    edge.innerHTML = ''
    const row = document.createElement('div')
    row.className = 'set-row'
    const lab = document.createElement('div')
    lab.className = 'set-label'
    lab.textContent = 'Banner edge'
    const seg = document.createElement('div')
    seg.className = 'set-seg'
    for (const [v, l] of [['top', 'Top'], ['bottom', 'Bottom']]) {
      const b = document.createElement('button')
      b.className = 'set-opt' + (this.edge === v ? ' active' : '')
      b.textContent = l
      b.addEventListener('click', async () => {
        const persistMode = this.mode === 'banner'
        const r = await window.electron.setLayout(persistMode ? 'banner' : this.mode, { persist: persistMode, bannerEdge: v })
        this.edge = r.bannerEdge
        document.body.dataset.edge = this.edge
        this.render()
      })
      seg.appendChild(b)
    }
    row.append(lab, seg)
    edge.appendChild(row)
  }

  async _set(mode, persist) {
    const r = await window.electron.setLayout(mode, { persist })
    if (persist) this.saved = r.mode
    this.edge = r.bannerEdge || this.edge
    this._apply(r.mode)
    this._syncPin(r.pinned)
    return r
  }

  _apply(mode) {
    this.mode = mode
    document.body.dataset.layout = mode
    document.body.dataset.edge = this.edge
    this.onModeChange?.(mode)
    this._sizeCanvas()
    const btn = document.getElementById('btn-layout')
    btn.classList.toggle('peek', this.peeking)
    btn.innerHTML = Icon(this.peeking ? 'strip-back' : 'window')   // strip = back to the banner (1.8d icons)
    btn.title = this.peeking ? 'Window layout (peeking out of the banner)' : 'Window layout'
  }

  _syncPin(pinned) {
    const btn = document.getElementById('btn-pin')
    btn.classList.toggle('pinned', !!pinned)
    btn.title = pinned ? 'Pinned on top (click to unpin)' : 'Not pinned (click to pin on top)'
  }

  // A popup (death card, family matter, proposal…) opening while in banner mode can't be seen in a 56px strip:
  // open the full window for it, and drop back to the banner once every popup is closed again.
  _watchPopups() {
    const popups = [...document.querySelectorAll('body > [id$="-overlay"]')]
    const anyOpen = () => popups.some(p => !p.classList.contains('hidden'))
    const obs = new MutationObserver(() => {
      if (!this.inGame) return
      if (this.mode === 'banner' && anyOpen()) this.peek(true)
      else if (this.autoPeek && this.mode === 'overlay' && !anyOpen()) this.returnToBanner()
    })
    for (const p of popups) obs.observe(p, { attributes: true, attributeFilter: ['class'] })
  }

  _wireGrip() {
    const grip = document.getElementById('resize-grip')
    let start = null, pending = null
    grip.addEventListener('pointerdown', e => {
      start = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight }
      grip.setPointerCapture(e.pointerId)
    })
    grip.addEventListener('pointermove', e => {
      if (!start) return
      const size = [start.w + e.screenX - start.x, start.h + e.screenY - start.y]
      if (!pending) requestAnimationFrame(() => { window.electron.resizeWindow(...pending); pending = null })
      pending = size
    })
    const end = () => { start = null }
    grip.addEventListener('pointerup', end)
    grip.addEventListener('pointercancel', end)
  }

  // One-time pointer at the Window layout button, so the modes are discoverable.
  _maybeTip() {
    if (!this.supported) return
    let seen = false
    try { seen = !!localStorage.getItem(LAYOUT_TIP_KEY) } catch {}
    if (seen || document.getElementById('layout-tip')) return
    const tip = document.createElement('div')
    tip.id = 'layout-tip'
    tip.innerHTML = `New: ${Icon('window')} Window layouts${this.mode === 'overlay' ? ` (under ${Icon('more')} in the titlebar)` : ''}: a wider two-column view, a resizable desktop window, or a slim banner across the top of your screen while you game.`
    tip.addEventListener('click', () => this._dismissTip())
    document.body.appendChild(tip)
  }

  _dismissTip() {
    document.getElementById('layout-tip')?.remove()
    try { localStorage.setItem(LAYOUT_TIP_KEY, '1') } catch {}
  }
}
