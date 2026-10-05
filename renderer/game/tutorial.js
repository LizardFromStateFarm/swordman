// TutorialUI — the coach marks (task 1.23): a spotlight on a real control + a short card (Next / Back / Skip / Tips off),
// played the first time a view opens, an unlock appears on screen, or a game first starts (the HUD tour). Also draws
// the Guide section of Settings (replay any lesson, tips on/off, show every tip again). UI only — the seen-state lives
// in the cross-save soul record via gameState (tutorialInfo / markTutorialSeen / setTutorialsOff / resetTutorials /
// initTutorials). Lessons: assets/data/tutorial.js. See docs/systems/tutorial.md.

class TutorialUI {
  // nav: NavUI (go/view/_offered) · layout: LayoutUI (mode, peek) · flash(msg, kind) · closeSettings()
  constructor({ gameState, nav, layout, flash, closeSettings, intro }) {
    this.gs = gameState
    this.intro = intro || null   // IntroUI (renderer/game/intro.js): plays the lesson marked intro: true
    this.nav = nav
    this.layout = layout
    this.flash = flash
    this.closeSettings = closeSettings
    this.cur = null          // { lesson, i, replay }
    this.queue = []          // view lessons waiting for a quiet moment (only while their view stays open)
    this.readyAt = 0         // nothing plays before this (lets a view render / a game settle first)
    this.nextCheck = 0
    this.guideOpen = false   // the Guide's lesson list in Settings (folded by default)
    this._rect = ''
    this._build()
  }

  // ── The layer ──────────────────────────────────────────────────────────────
  // id ends in -overlay so the rest of the UI (banter, auto-opened cards) treats a coach mark as an open popup.
  _build() {
    const el = document.createElement('div')
    el.id = 'tut-overlay'
    el.className = 'hidden'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    el.setAttribute('aria-labelledby', 'tut-title')
    el.innerHTML = `<div class="tut-hole"></div>
      <div class="tut-card" tabindex="-1">
        <div class="tut-head"><span class="tut-title" id="tut-title"></span><span class="tut-count"></span></div>
        <div class="tut-text"></div>
        <div class="tut-btns">
          <button class="tut-off" data-tut-act="off">Turn tips off</button>
          <span class="tut-sp"></span>
          <button class="tut-btn" data-tut-act="back">Back</button>
          <button class="tut-btn tut-next" data-tut-act="next">Next</button>
        </div>
        <button class="tut-skip" data-tut-act="skip" title="Skip this tip" aria-label="Skip this tip">${Icon('close')}</button>
      </div>`
    document.body.appendChild(el)
    this.el = el
    this.hole = el.querySelector('.tut-hole')
    this.card = el.querySelector('.tut-card')
    // A tap anywhere off the card = Next (the spotlit control is shown, not pressed).
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-tut-act]')
      if (b) return this._act(b.dataset.tutAct)
      if (!e.target.closest('.tut-card')) this._act('next')
    })
    // While a tip is up it owns the keyboard (so Space / 1–4 never reach a fight underneath).
    window.addEventListener('keydown', e => {
      if (!this.cur) return
      e.stopPropagation()
      e.preventDefault()
      if (e.key === 'Escape') this._act('skip')
      else if (e.key === 'ArrowLeft') this._act('back')
      else if (['Enter', ' ', 'ArrowRight'].includes(e.key)) this._act('next')
    }, true)
    window.addEventListener('resize', () => { this._rect = ''; if (this.cur) this._place() })
  }

  _lesson(id) { return TUTORIAL_LESSONS.find(l => l.id === id) }

  // ── Triggers ───────────────────────────────────────────────────────────────

  // NavUI.onShow → a view opened. Its lesson queues and plays once the view has drawn (if it's still open then).
  onView(view) {
    const info = this.gs.tutorialInfo()
    if (info.off) return
    const l = TUTORIAL_LESSONS.find(x => x.trigger.view === view)
    if (!l || info.seen[l.id] || this.queue.includes(l.id) || this.cur?.lesson.id === l.id) return
    this.queue.push(l.id)
    this.readyAt = Math.max(this.readyAt, Date.now() + 450)
  }

  // Every frame from game.js. A tip on screen follows its target; otherwise ~4×/s look for the next one to play.
  tick() {
    if (this.cur) return this._place()
    const now = Date.now()
    if (now < this.nextCheck || now < this.readyAt) return
    this.nextCheck = now + 250
    if (!this.gs.get() || this._held()) return
    const info = this.gs.tutorialInfo()
    if (!info.init) return this._init()
    if (info.off) { this.queue.length = 0; return }
    const inBattle = this._busy() === 'battle'
    if (this._busy() && !inBattle) return
    // 1) the HUD tour, 2) a view lesson for the view that's open, 3) an unlock on screen. One at a time.
    const pick = () => {
      if (inBattle) return TUTORIAL_LESSONS.find(l => l.inBattle && !info.seen[l.id] && this._visible(l.trigger.el))
      const start = TUTORIAL_LESSONS.find(l => l.trigger.start && !info.seen[l.id])
      if (start) return start
      this.queue = this.queue.filter(id => !info.seen[id] && this._lesson(id).trigger.view === this.nav.view)
      if (this.queue.length) return this._lesson(this.queue.shift())
      return TUTORIAL_LESSONS.find(l => l.trigger.el && !l.inBattle && !info.seen[l.id] && this._visible(l.trigger.el))
    }
    const l = pick()
    if (l) this.play(l.id)
  }

  // First run with this build: an established player is not walked through basics (everything marked seen, one toast);
  // a new player gets the HUD tour, and the view they land on queues its own lesson.
  _init() {
    const s = this.gs.get()
    const veteran = (s.stageIndex || 0) >= 3 || (s.generation || 1) > 1
    this.gs.initTutorials(veteran ? TUTORIAL_LESSONS.map(l => l.id) : [])
    if (veteran) this.flash('New: tips for every system. Replay any of them in Settings → Guide.', 'special')
    else this.onView(this.nav.view)
    this.readyAt = Date.now() + 900
  }

  // The smoke driver (scripts/smoke/cdp.js) holds every tip so they never sit over a scenario's clicks; the Guide's
  // replay still works. Not a player setting.
  _held() { try { return localStorage.getItem('ci:smoke-no-tips') === '1' } catch { return false } }

  // 'battle' = only the battle page is up; true = some other popup, the banner strip, or the window is away.
  _busy() {
    if (document.hidden || document.getElementById('app')?.classList.contains('hidden')) return true
    if (this.layout.mode === 'banner') return true
    if (this._visible('#layout-tip')) return true   // the first-launch layout tip goes first
    const open = [...document.querySelectorAll('body > [id$="-overlay"]:not(.hidden)')].filter(o => o !== this.el)
    if (!open.length) return false
    return open.length === 1 && open[0].id === 'combat-overlay' ? 'battle' : true
  }

  _visible(sel) {
    if (!sel) return null
    let el
    try { el = document.querySelector(sel) } catch { return null }
    if (!el || !el.getClientRects().length) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? el : null
  }

  // ── Playing ────────────────────────────────────────────────────────────────

  // replay = from the Guide: opens the lesson's view first. Marked seen as soon as it starts (a closed window never
  // replays it at you); "Skip" just ends it.
  play(id, replay = false) {
    const l = this._lesson(id)
    if (!l) return
    if (l.intro) {   // the intro scroll: full window, not a coach mark
      if (!this.intro) return
      if (replay) { this.closeSettings?.(); if (this.layout.mode === 'banner') this.layout.peek(false) }
      this.gs.markTutorialSeen(l.id)
      this.queue = this.queue.filter(q => q !== id)
      return this.intro.open(l, () => { this.readyAt = Date.now() + 700 })
    }
    if (replay) {
      this.closeSettings?.()
      if (this.layout.mode === 'banner') this.layout.peek(false)
      if (l.trigger.view) {
        if (!this.nav._offered(l.trigger.view)) return this.flash(l.needs || 'Not open to you yet', 'negative')
        this.nav.go(l.trigger.view)
      }
      this.queue = this.queue.filter(q => q !== id)
      return setTimeout(() => this._start(l, true), 320)   // let the view draw before measuring targets
    }
    this._start(l, false)
  }

  _start(l, replay) {
    this.gs.markTutorialSeen(l.id)
    this.cur = { lesson: l, i: 0, replay }
    this.el.classList.remove('hidden')
    this.hole.classList.add('snap')   // a new lesson's first spotlight appears in place (no slide from the last one)
    this._step()
    requestAnimationFrame(() => requestAnimationFrame(() => this.hole.classList.remove('snap')))
    this.card.focus({ preventScroll: true })
  }

  _step() {
    const { lesson, i } = this.cur, st = lesson.steps[i], n = lesson.steps.length
    this.card.querySelector('.tut-title').textContent = st.title || lesson.title
    this.card.querySelector('.tut-count').textContent = n > 1 ? `${i + 1} / ${n}` : ''
    this.card.querySelector('.tut-text').textContent = st.text
    this.card.querySelector('[data-tut-act="back"]').classList.toggle('hidden', i === 0)
    this.card.querySelector('.tut-next').textContent = i === n - 1 ? 'Got it' : 'Next'
    this.target = null
    for (const sel of st.at || []) { const t = this._visible(sel); if (t) { this.target = t; break } }
    // Bring it into view inside its own scroller (never the whole window) before measuring.
    if (this.target) this.target.scrollIntoView({ block: 'center', inline: 'nearest' })   // (centre, not nearest: a target at a pane's edge left the spotlight clipped — 2026-10-05)
    this.card.classList.remove('tut-in'); void this.card.offsetWidth; this.card.classList.add('tut-in')
    this._rect = ''
    this._place()
  }

  _act(a) {
    if (!this.cur) return
    const n = this.cur.lesson.steps.length
    if (a === 'next') { if (this.cur.i < n - 1) { this.cur.i++; return this._step() } return this._end() }
    if (a === 'back') { if (this.cur.i > 0) { this.cur.i--; this._step() } return }
    if (a === 'skip') return this._end()
    if (a === 'off') {
      this.gs.setTutorialsOff(true)
      this.queue.length = 0
      this._end()
      this.flash('Tips are off. Turn them back on in Settings → Guide.', 'special')
    }
  }

  _end() {
    this.cur = null
    this.target = null
    this.el.classList.add('hidden')
    this.readyAt = Date.now() + 700   // a breath before the next tip
  }

  // Spotlight the target (or nothing) and dock the card beside it: below if it fits, else above, else the side of the
  // window away from it. Narrow windows (Overlay, phone) get a full-width card.
  _place() {
    const vw = window.innerWidth, vh = window.innerHeight, M = 8
    let r = null
    if (this.target) {
      if (!this.target.isConnected || !this.target.getClientRects().length) {   // re-rendered: find it again
        this.target = null
        for (const sel of this.cur.lesson.steps[this.cur.i].at || []) { const t = this._visible(sel); if (t) { this.target = t; break } }
      }
      if (this.target) r = this.target.getBoundingClientRect()
    }
    const sig = r ? `${r.left|0},${r.top|0},${r.width|0},${r.height|0},${vw},${vh}` : `none,${vw},${vh}`
    if (sig === this._rect) return
    this._rect = sig
    const pad = 4
    if (r) {
      const x = Math.max(2, r.left - pad), y = Math.max(2, r.top - pad)
      const w = Math.min(vw - 4, r.right + pad) - x, h = Math.min(vh - 4, r.bottom + pad) - y
      Object.assign(this.hole.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' })
      this.hole.classList.remove('none')
    } else this.hole.classList.add('none')
    const cw = Math.min(320, vw - 2 * M)
    this.card.style.width = cw + 'px'
    const ch = this.card.offsetHeight
    let left, top
    if (!r) { left = (vw - cw) / 2; top = (vh - ch) / 2 }
    else {
      const below = vh - r.bottom - pad - M, above = r.top - pad - M
      const right = vw - r.right - pad - M, leftRoom = r.left - pad - M
      left = Math.min(Math.max(M, r.left + r.width / 2 - cw / 2), vw - cw - M)
      if (below >= ch + 6) top = r.bottom + pad + 8
      else if (above >= ch + 6) top = r.top - pad - 8 - ch
      else if (Math.max(right, leftRoom) >= 226) {   // a tall target (the nav rail): beside it, narrowed to fit, level with its middle
        const onRight = right >= leftRoom, w = Math.min(cw, (onRight ? right : leftRoom) - 6)
        this.card.style.width = w + 'px'
        const h = this.card.offsetHeight
        left = onRight ? r.right + pad + 8 : r.left - pad - 8 - w
        top = (r.top + r.bottom) / 2 - h / 2
        this.card.style.left = Math.round(left) + 'px'
        this.card.style.top = Math.round(Math.max(M, Math.min(top, vh - h - M))) + 'px'
        return
      } else top = (r.top + r.bottom) / 2 > vh / 2 ? M : vh - ch - M   // no room anywhere: the far edge
    }
    this.card.style.left = Math.round(left) + 'px'
    this.card.style.top = Math.round(Math.max(M, Math.min(top, vh - ch - M))) + 'px'
  }

  // ── The Guide (Settings) ─────────────────────────────────────────────────

  _status(l, info) {
    if (l.trigger.view && !this.nav._offered(l.trigger.view)) return { cls: 'locked', text: l.needs || 'Not open yet' }
    if (info.seen[l.id]) return { cls: 'seen', text: 'Seen' }
    if (l.opens && !this._visible(l.trigger.el)) return { cls: 'later', text: l.opens }
    return { cls: 'new', text: 'New' }
  }

  renderGuide(el) {
    const info = this.gs.tutorialInfo()
    const seenN = TUTORIAL_LESSONS.filter(l => info.seen[l.id]).length
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    let html = `<div class="set-group">Guide</div>
      <div class="set-row"><div class="set-label">Tips</div><div class="set-seg">
        <button class="set-opt${info.off ? '' : ' active'}" data-tut-set="on">On</button>
        <button class="set-opt${info.off ? ' active' : ''}" data-tut-set="off">Off</button></div></div>
      <div class="set-hint">A short tip the first time you meet each system</div>
      <button class="tut-guide-toggle" data-tut-set="fold" aria-expanded="${this.guideOpen}">
        <span>${this.guideOpen ? 'Hide lessons' : 'All lessons'}</span><span class="tut-g-n">${seenN} / ${TUTORIAL_LESSONS.length} seen</span>
        <span class="tut-g-caret">${this.guideOpen ? '▴' : '▾'}</span></button>`
    if (this.guideOpen) {
      html += '<div class="tut-guide">'
      for (const g of TUTORIAL_GROUPS) {
        const ls = TUTORIAL_LESSONS.filter(l => l.group === g.id)
        if (!ls.length) continue
        html += `<div class="tut-g-h">${esc(g.name)}</div>`
        for (const l of ls) {
          const st = this._status(l, info), locked = st.cls === 'locked'
          html += `<button class="tut-row ${st.cls}" data-tut-play="${l.id}"${locked ? ' disabled' : ''} title="${esc(locked ? st.text : 'Show this tip')}">
            <span class="tut-r-dot"></span><span class="tut-r-t">${esc(l.title)}</span><span class="tut-r-s">${esc(st.text)}</span>
            ${locked ? Icon('lock') : '<span class="tut-r-go">›</span>'}</button>`
        }
      }
      html += `<button class="tut-reset" data-tut-set="reset">Show every tip again</button></div>`
    }
    const wrap = document.createElement('div')
    wrap.className = 'tut-guide-wrap'
    wrap.innerHTML = html
    wrap.addEventListener('click', e => {
      const p = e.target.closest('[data-tut-play]')
      if (p) return this.play(p.dataset.tutPlay, true)
      const b = e.target.closest('[data-tut-set]')
      if (!b) return
      const a = b.dataset.tutSet
      if (a === 'on') this.gs.setTutorialsOff(false)
      if (a === 'off') { this.gs.setTutorialsOff(true); this.queue.length = 0 }
      if (a === 'fold') this.guideOpen = !this.guideOpen
      if (a === 'reset') { this.gs.resetTutorials(); this.flash('Every tip will show again as you go.', 'special') }
      const fresh = document.createElement('div')
      this.renderGuide(fresh)
      wrap.replaceWith(fresh.firstElementChild)
    })
    el.appendChild(wrap)
  }
}
