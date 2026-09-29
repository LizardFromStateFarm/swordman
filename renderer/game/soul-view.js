// SoulView — the Soul screen (Phase 40a, docs/systems/soul-points.md). Cross-save, so it is an overlay reachable from
// both the character select (Soul button) and Kin → Hall (the Soul card): unspent + lifetime Soul Points, the Soul
// Resonance bonus as pips, one "Deepen Resonance" click per rank (or why it's sealed), how points are earned, and
// the log of every failed Trial / Immortal / rank bought across all slots. Opening it clears the discovery dot.
// Reads only gameState.soulInfo(); spends through gameState.spendSoul() (Rule 1). Styles: styles.css → "Soul screen".
// h: { esc, fmt, flash, onChange, relive }

class SoulView {
  constructor(gameState, h) {
    this.gs = gameState
    this.h = h
    this.ov = document.getElementById('soul-overlay')
    this.box = document.getElementById('soul-box')
    this.ov.addEventListener('click', e => {
      if (e.target === this.ov) return this.close()
      const b = e.target.closest('[data-soul]')
      if (!b || b.disabled) return
      if (b.dataset.soul === 'close') this.close()
      if (b.dataset.soul === 'buy') this._buy()
      if (b.dataset.soul === 'relive') this.h.relive?.()   // 40b: replay the first Immortality
    })
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen()) this.close() })
  }

  isOpen() { return !this.ov.classList.contains('hidden') }

  open() {
    this.gs.markSoulSeen()
    this.box.style.zoom = (this.gs.getSettings().fontSize || 13) / 13   // Settings text size (same as #tab-body)
    this.render()
    this.ov.classList.remove('hidden')
    ;(this.box.querySelector('.soul-buy.ready') || this.box).focus()   // no ring on Close by default
    this.h.onChange?.()
  }

  close() {
    this.ov.classList.add('hidden')
    this.h.onChange?.()
  }

  _buy() {
    const r = this.gs.spendSoul()
    if (r.ok) {
      this._justBought = r.rank
      this.h.flash(`Soul Resonance deepens to rank ${r.rank}: +${Math.round(this.gs.soulInfo().perRank * r.rank * 100)}% Qi gathering, in every life.`, 'special')
    }
    this.render()
    ;(this.box.querySelector('.soul-buy.ready') || this.box).focus()   // no ring on Close by default
    this.h.onChange?.()
  }

  _ago(ts) {
    const m = Math.floor((Date.now() - ts) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`
    return `${Math.floor(m / 1440)}d ago`
  }

  _logRow(e) {
    const esc = this.h.esc
    let text, cls = e.kind
    if (e.kind === 'fail')          text = `${esc(e.who || 'A cultivator')} fell at the Trial, ${Math.round((e.chance || 0) * 100)}% odds`
    else if (e.kind === 'v1')       text = `${esc(e.who || 'A cultivator')} became Immortal, the first of all`
    else if (e.kind === 'immortal') text = `${esc(e.who || 'A cultivator')} became Immortal`
    else                            text = `Deepened to rank ${e.rank}`
    const pts = e.kind === 'spend' ? `−${e.pts}` : `+${e.pts}`
    return `<div class="sl ${cls}"><span class="sl-g">${Icon(e.kind === 'spend' ? 'rise' : e.kind === 'fail' ? 'skull' : 'cloud')}</span>
      <span class="sl-t">${text}<span class="sl-a">${this._ago(e.at)}</span></span><span class="sl-p">${pts}</span></div>`
  }

  render() {
    const i = this.gs.soulInfo(), fmt = this.h.fmt
    const pct = Math.round(i.perRank * i.resonance * 100)
    const pips = Array.from({ length: i.maxRank }, (_, k) =>
      `<i class="${k < i.resonance ? 'on' : ''}${k + 1 === this._justBought ? ' new' : ''}"></i>`).join('')
    this._justBought = null
    let buy
    if (i.max) buy = `<button class="soul-buy done" data-soul="buy" disabled><span class="sb-n">Fully resonant</span><span class="sb-e">+${pct}% Qi gathering, the most a soul can hold</span></button>`
    else if (!i.canSpend) buy = `<button class="soul-buy" data-soul="buy" disabled><span class="sb-n">Deepen Resonance</span>
        <span class="sb-e"><span class="soul-prog"><i data-w="${Math.round(100 * i.points / i.cost)}"></i></span>${i.cost} Soul Points · need ${i.need} more</span></button>`
    else buy = `<button class="soul-buy ready" data-soul="buy"><span class="sb-n">Deepen Resonance</span>
        <span class="sb-e"><b>${i.cost}</b> Soul Points → rank ${i.resonance + 1}: +${pct + Math.round(i.perRank * 100)}% Qi gathering</span></button>`

    const firstGrant = i.v1Finished ? `Each Immortality after the first` : `Your first Immortality, on any slot`
    const firstPts = i.v1Finished ? `+${SOUL_IMMORTAL_GRANT}` : `+${SOUL_V1_GRANT}`
    const log = i.log.length ? i.log.map(e => this._logRow(e)).join('')
      : '<div class="soul-empty">Nothing yet. At the peak of the mortal realms, attempt the Ascension Trial: whether you rise or fall, the soul keeps something.</div>'

    this.box.innerHTML = `
      <div class="soul-head">
        <span class="soul-orb">${Icon('soul')}</span>
        <div class="soul-id"><div class="soul-title" id="soul-title">The Soul Remembers</div>
          <div class="soul-sub">Carried by every save slot, every life</div></div>
        <button class="tb-btn soul-x" data-soul="close" title="Close" aria-label="Close">${Icon('close')}</button>
      </div>
      <div class="soul-hero">
        <div class="sh-pts"><span class="sh-k">Soul Points</span><span class="sh-v">${fmt(i.points)}</span><span class="sh-s">${fmt(i.earned)} remembered in all</span></div>
        <div class="sh-res"><span class="sh-k">Soul Resonance</span><span class="sh-v ${pct ? 'jade' : 'zero'}">+${pct}%</span><span class="sh-s">Qi gathering · rank ${i.resonance} of ${i.maxRank}</span></div>
      </div>
      <div class="soul-pips" role="img" aria-label="Resonance rank ${i.resonance} of ${i.maxRank}">${pips}</div>
      ${buy}
      <div class="soul-sec">
        <div class="soul-sec-t"><span>How the soul remembers</span></div>
        <div class="soul-rule"><span>A failed Ascension Trial</span><b>+${SOUL_FAIL_BASE}, and ½ more per % of its odds</b></div>
        <div class="soul-rule"><span>${firstGrant}</span><b>${firstPts} Soul Points</b></div>
        <div class="soul-note">An ordinary death leaves nothing behind. The better prepared the fall, the more remains.</div>
      </div>
      ${i.v1Finished ? `<div class="soul-sec"><div class="soul-sec-t"><span>Your ascension</span></div>
        <button class="soul-relive" data-soul="relive"><span class="sr-g">${Icon('cloud')}</span>
          <span class="sr-t"><span class="sr-n">${this.h.esc(i.v1Finished.who || i.v1Finished.name || 'A cultivator')} became Immortal</span><span class="sl-a">generation ${i.v1Finished.generation || 1} · ${this._ago(i.v1Finished.at)}</span></span>
          <span class="sr-go">Relive it</span></button></div>` : ''}
      <div class="soul-sec">
        <div class="soul-sec-t"><span>Remembered</span><span class="soul-count">${i.failedAscensions} fallen · ${i.immortals} immortal</span></div>
        <div class="soul-log">${log}</div>
      </div>`
    this.box.querySelectorAll('[data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
  }
}
