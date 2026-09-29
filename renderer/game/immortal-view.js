// ImmortalView — a successful Ascension Trial (Phase 40b, docs/systems/soul-points.md): plays the AscensionCinematic
// (renderer/engine/ascension-cinematic.js) full-window, then opens the finish screen over its afterglow. The first
// Immortality on this install gets the full finish screen ("You have finished your race to immortality", +500 Soul
// Points, the stats); every later one a short card (+150). Continue hands back to the death/interlude card (the
// Ascended Ancestor flow); Spend Soul Points opens the Soul screen on top. Relive (from the Soul screen) replays the
// first one with a Close button and changes nothing. The player never sees a version number here (user 2026-09-28).
// h: { esc, fmt, openSoul, reducedMotion: () => bool }. Styles: styles.css → "Immortal Ascension + finish screen".

class ImmortalView {
  constructor(h) {
    this.h = h
    this.ov = document.getElementById('immortal-overlay')
    this.cv = document.getElementById('immortal-canvas')
    this.box = document.getElementById('finish-box')
    this.hint = document.getElementById('immortal-skip')
    this.cine = new AscensionCinematic(this.cv)
    this.onContinue = null
    this.cv.addEventListener('click', () => this.cine.skip())
    this.hint.addEventListener('click', () => this.cine.skip())
    this.box.addEventListener('click', e => {
      const b = e.target.closest('[data-fin]')
      if (!b) return
      if (b.dataset.fin === 'spend') this.h.openSoul()
      if (b.dataset.fin === 'continue') this.close()
    })
    document.addEventListener('keydown', e => {
      if (!this.isOpen()) return
      if ((e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') && !this.cine.done) { e.preventDefault(); this.cine.skip() }
    })
  }

  isOpen() { return !this.ov.classList.contains('hidden') }

  // info: { kind: 'v1' | 'immortal', pts, who, name, clan, generation, hours, failedBefore }
  play(info, { relive = false, color = null, onContinue = null } = {}) {
    this.info = info; this.relive = relive; this.onContinue = onContinue
    this.box.classList.add('hidden'); this.box.classList.remove('shown')
    this.hint.classList.add('hidden')
    this.ov.classList.remove('hidden')
    this.cine.play({ color: color || '#FFD700', reducedMotion: this.h.reducedMotion(), onDone: () => this._finish() })
    clearTimeout(this._hintT)
    this._hintT = setTimeout(() => { if (!this.cine.done && this.isOpen()) this.hint.classList.remove('hidden') },
      (this.h.reducedMotion() ? 0.3 : AscensionCinematic.SKIP_AFTER) * 1000)
  }

  close() {
    this.cine.stop()
    clearTimeout(this._hintT)
    this.ov.classList.add('hidden')
    const cb = this.onContinue; this.onContinue = null
    cb?.()
  }

  _finish() {
    this.hint.classList.add('hidden')
    this.box.style.zoom = this.h.zoom?.() || 1
    this.box.innerHTML = this.info.kind === 'v1' ? this._full(this.info) : this._card(this.info)
    this.box.classList.remove('hidden')
    requestAnimationFrame(() => this.box.classList.add('shown'))
    this.box.querySelector('[data-fin="continue"]')?.focus({ preventScroll: true })
  }

  _stat(k, v) { return `<div class="fin-stat"><span class="fin-k">${k}</span><span class="fin-v">${v}</span></div>` }

  _soulGrant(pts) {
    return `<div class="fin-soul"><span class="fin-soul-g">${Icon('soul')}</span><span class="fin-soul-t"><b>+${this.h.fmt(pts)} Soul Points</b>
      <span>The soul remembers this, in every save slot. Each rank of Soul Resonance quickens Qi in every life.</span></span></div>`
  }

  // Continue says what happens next: a clan's line carries on through an heir; an orphan is simply reborn
  _buttons() {
    if (this.relive) return `<div class="fin-btns"><button class="fin-go" data-fin="continue">Return</button></div>`
    return `<div class="fin-btns"><button class="fin-spend" data-fin="spend">${Icon('soul')}Spend Soul Points</button>
      <button class="fin-go" data-fin="continue">${this.info.clan ? 'Your line goes on' : 'Be reborn'}</button></div>`
  }

  _full(i) {
    const esc = this.h.esc
    const fell = i.failedBefore
      ? `${i.failedBefore} ${i.failedBefore === 1 ? 'fall' : 'falls'} before this one`
      : 'none: you rose on your first attempt'
    const legacy = i.clan
      ? `An Ascended Ancestor now watches over the ${esc(i.clan)} clan. Its heirs carry the line on.`
      : 'No clan remains to hold your name, but the wheel of rebirth turns on.'
    return `
      <div class="fin-cjk" aria-hidden="true">飛昇</div><!-- cjk-ok: flavour mark, "ascension" -->
      <div class="fin-kicker">Congratulations</div>
      <h1 class="fin-title" id="finish-title">You Have Become Immortal</h1>
      <p class="fin-lede">You have finished your race to immortality.</p>
      <div class="fin-rule"></div>
      <div class="fin-stats">
        ${this._stat('Ascended', esc(i.who || i.name || 'A cultivator'))}
        ${this._stat('Generation', i.generation || 1)}
        ${i.hours != null ? this._stat('This life', i.hours >= 1 ? `${i.hours} hours of cultivation` : (m => `${m} minute${m === 1 ? '' : 's'} of cultivation`)(Math.max(1, Math.round(i.hours * 60)))) : ''}
        ${this._stat('At the Trial', fell)}
      </div>
      ${this._soulGrant(i.pts)}
      <p class="fin-note">${legacy}</p>
      ${this._buttons()}`
  }

  _card(i) {
    const esc = this.h.esc
    return `
      <div class="fin-kicker">Another Immortal</div>
      <h1 class="fin-title small" id="finish-title">${esc(i.name || 'A cultivator')} Ascends</h1>
      <p class="fin-lede">The heavens open once more. ${esc(i.who || '')} passes through the gate.</p>
      ${this._soulGrant(i.pts)}
      ${this._buttons()}`
  }
}
