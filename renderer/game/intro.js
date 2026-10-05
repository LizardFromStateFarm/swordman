// IntroUI — the intro "ink scroll" (2026-10-05): five full-window cards that set up the world and the goal (Qi → realms →
// Immortality, with sect + family along the way), over a drifting ink-dot backdrop (a dotted mountain ridge, rising motes,
// a tint per card). Played by TutorialUI for the lesson with `intro: true` (assets/data/tutorial.js): first on a new
// game, before the HUD tour; replayable from Settings → Guide. Skip / Back / Next (Begin on the last), a tap anywhere
// steps on, keys (Esc skips, ← → Enter Space). Reduced motion: no drift, no fades. UI only; seen-state is the
// tutorial's (soul record). See docs/systems/tutorial.md → "The intro".

class IntroUI {
  constructor() {
    this.open_ = false
    this.lesson = null
    this.i = 0
    this.onDone = null
    this.raf = 0
    this.t0 = 0
    this.dots = null
    this._build()
  }

  // Per card: the backdrop's accent (mote colour) — earth, a first spark, Qi gold, kin violet, the heavenly gate.
  static TINTS = ['#8A7A60', '#30B878', '#EDD050', '#9070C8', '#F6E6A0']

  _build() {
    const el = document.createElement('div')
    el.id = 'intro-overlay'   // ends in -overlay: the rest of the UI (tips, banter, popups) waits while it is up
    el.className = 'hidden'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    el.setAttribute('aria-labelledby', 'intro-title')
    el.innerHTML = `<canvas class="intro-bg" aria-hidden="true"></canvas>
      <button class="intro-skip" data-intro="skip">Skip</button>
      <div class="intro-col">
        <div class="intro-orn" aria-hidden="true"><i></i><b></b><i></i></div>
        <h2 class="intro-title" id="intro-title"></h2>
        <p class="intro-text"></p>
        <div class="intro-pips" aria-hidden="true"></div>
        <div class="intro-btns">
          <button class="intro-btn" data-intro="back">Back</button>
          <span class="intro-count"></span>
          <button class="intro-btn intro-next" data-intro="next">Next</button>
        </div>
      </div>`
    document.body.appendChild(el)
    this.el = el
    this.cv = el.querySelector('.intro-bg')
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-intro]')
      if (b) return this._act(b.dataset.intro)
      this._act('next')   // a tap anywhere else steps on, like turning a page
    })
    window.addEventListener('keydown', e => {
      if (!this.open_) return
      e.stopPropagation(); e.preventDefault()
      if (e.key === 'Escape') this._act('skip')
      else if (e.key === 'ArrowLeft') this._act('back')
      else if (['Enter', ' ', 'ArrowRight'].includes(e.key)) this._act('next')
    }, true)
    window.addEventListener('resize', () => { if (this.open_) this._size() })
  }

  get isOpen() { return this.open_ }
  _calm() { return document.documentElement.dataset.motion === 'reduced' }

  open(lesson, onDone) {
    this.lesson = lesson
    this.onDone = onDone || null
    this.i = 0
    this.open_ = true
    this.el.classList.remove('hidden')
    // Text size (Settings): the same zoom the panels get (settings.js sets it on #tab-body)
    this.el.querySelector('.intro-col').style.zoom = document.getElementById('tab-body')?.style.zoom || ''
    this._size()
    this._card(true)
    this.t0 = performance.now()
    cancelAnimationFrame(this.raf)
    const loop = t => { if (!this.open_) return; this._draw(t); if (!this._calm()) this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
    this.el.querySelector('.intro-next').focus({ preventScroll: true })
  }

  close() {
    if (!this.open_) return
    this.open_ = false
    cancelAnimationFrame(this.raf)
    this.el.classList.add('hidden')
    const cb = this.onDone; this.onDone = null
    cb?.()
  }

  _act(a) {
    if (!this.open_) return
    const n = this.lesson.steps.length
    if (a === 'skip') return this.close()
    if (a === 'back') { if (this.i > 0) { this.i--; this._card() } return }
    if (a === 'next') { if (this.i < n - 1) { this.i++; this._card() } else this.close() }
  }

  _card(first = false) {
    const st = this.lesson.steps[this.i], n = this.lesson.steps.length, el = this.el
    const col = el.querySelector('.intro-col')
    el.querySelector('.intro-title').textContent = st.title || this.lesson.title
    el.querySelector('.intro-text').textContent = st.text
    el.querySelector('.intro-count').textContent = `${this.i + 1} / ${n}`
    el.querySelector('.intro-pips').innerHTML = Array.from({ length: n }, (_, k) => `<span class="${k === this.i ? 'on' : k < this.i ? 'past' : ''}"></span>`).join('')
    el.querySelector('[data-intro="back"]').classList.toggle('hidden', this.i === 0)
    el.querySelector('.intro-next').textContent = this.i === n - 1 ? 'Begin' : 'Next'
    el.querySelector('.intro-skip').classList.toggle('hidden', this.i === n - 1)
    el.style.setProperty('--intro-tint', IntroUI.TINTS[this.i % IntroUI.TINTS.length])
    if (!this._calm()) { col.classList.remove('intro-in'); void col.offsetWidth; col.classList.add('intro-in') }
    if (this._calm() || first) this._draw(performance.now())
  }

  // ── The backdrop: dots only (ink-art rule: no fills behind the dots) ──
  _size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr)
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'
    this.dpr = dpr
    // Seeded so the scene is the same each time (a fixed scroll, not noise)
    let s = 7
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
    const ridge = []
    for (let x = 0; x <= w; x += 3) {
      const u = x / w
      const y = h * (0.80 - 0.16 * Math.exp(-Math.pow((u - 0.62) / 0.13, 2)) - 0.09 * Math.exp(-Math.pow((u - 0.25) / 0.18, 2)) - 0.02 * Math.sin(u * 23))
      for (let k = 0; k < 4; k++) if (rnd() < 0.55) ridge.push({ x: x + rnd() * 3, y: y + k * 5 + rnd() * 4, a: 0.55 - k * 0.12 })
    }
    const motes = Array.from({ length: Math.round(Math.min(90, w * h / 9000)) }, () => ({ x: rnd() * w, y: rnd() * h, r: 0.6 + rnd() * 1.3, v: 6 + rnd() * 14, p: rnd() * 6.28 }))
    const stars = Array.from({ length: Math.round(w * h / 5000) }, () => ({ x: rnd() * w, y: rnd() * h * 0.6, a: 0.15 + rnd() * 0.35 }))
    this.dots = { ridge, motes, stars, w, h }
  }

  _draw(t) {
    const c = this.cv.getContext('2d'), d = this.dots
    if (!d) return
    const { w, h } = d, sec = this._calm() ? 0 : (t - this.t0) / 1000
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.clearRect(0, 0, w, h)
    c.fillStyle = '#E8D8B0'
    for (const s of d.stars) { c.globalAlpha = s.a * (this._calm() ? 1 : 0.75 + 0.25 * Math.sin(sec * 0.8 + s.x)); c.fillRect(s.x, s.y, 1, 1) }
    c.fillStyle = '#8A7A60'
    for (const p of d.ridge) { c.globalAlpha = p.a; c.fillRect(p.x, p.y, 1.4, 1.4) }
    const tint = IntroUI.TINTS[this.i % IntroUI.TINTS.length]
    c.fillStyle = tint
    for (const m of d.motes) {
      const y = ((m.y - sec * m.v) % h + h) % h, x = m.x + Math.sin(sec * 0.5 + m.p) * 6
      c.globalAlpha = 0.25 + 0.35 * (1 - y / h)
      c.beginPath(); c.arc(x, y, m.r, 0, 6.283); c.fill()
    }
    c.globalAlpha = 1
  }
}
