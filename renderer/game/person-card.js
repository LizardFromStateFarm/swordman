// PersonCard — the person card (Phase 28 / task 4.2, docs/systems/living-world.md §3). One card for anyone in the world's
// registry: who they are (age, realm, root, temper, character, body), what they are to you and what they think of you,
// their kin, and where to act on them today. Any element with data-pid="<person id>" opens it (PersonCard.link() writes
// one); a name inside the card opens that person in place, with a back step. A popover beside the name on wide layouts,
// clamped inside the window on Overlay / phone. Data: gameState.personInfo(pid); familiarity: gameState.notePersonSeen.

const PersonCard = {
  gs: null,
  h: null,             // { esc, stageLabel(i), latinOnly(s), go(view, opts) }
  el: null,
  pid: null,
  trail: [],           // the people you stepped through (back)
  anchor: null,

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    this.el = document.getElementById('person-overlay')
    document.addEventListener('click', e => {
      const t = e.target.closest?.('[data-pid]')
      if (t && t.dataset.pid) {
        e.stopPropagation(); e.preventDefault()
        const inCard = !!t.closest('.pc-pop')
        if (inCard && this.pid) this.trail.push(this.pid); else this.trail = []
        return this.open(t.dataset.pid, inCard ? this.anchor : t)
      }
      if (this.isOpen() && e.target.closest('[data-pc-back]')) { e.stopPropagation(); return this.open(this.trail.pop(), this.anchor) }
      if (this.isOpen() && e.target.closest('[data-pc-go]')) { e.stopPropagation(); return this._go(e.target.closest('[data-pc-go]')) }
      if (this.isOpen() && (e.target.closest('[data-pc-close]') || !e.target.closest('.pc-pop'))) { e.stopPropagation(); this.close() }
    }, true)
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close() })
    window.addEventListener('resize', () => this._place())
    return this
  },

  // A name you can tap. Plain text when there is no person behind it (yet).
  link(pid, name) {
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return pid ? `<button type="button" class="pc-link" data-pid="${esc(pid)}" title="See ${esc(name)}">${esc(name)}</button>` : esc(name)
  },

  isOpen() { return !!this.el && !this.el.classList.contains('hidden') },

  open(pid, anchor) {
    const info = this.gs.personInfo(pid)
    if (!info) return this.close()
    this.pid = info.pid; this.anchor = anchor || this.anchor
    if (this.trail[this.trail.length - 1] !== info.pid) this.gs.notePersonSeen(info.pid)
    this.el.innerHTML = `<div class="bd-pop pc-pop${info.alive ? '' : ' dead'}" role="dialog" aria-label="${this.h.esc(info.name)}">${this._html(info)}</div>`
    this.el.classList.remove('hidden')
    requestAnimationFrame(() => this._place())
  },

  close() {
    if (!this.isOpen()) return
    this.el.classList.add('hidden')
    this.el.innerHTML = ''
    this.pid = null; this.trail = []; this.anchor = null
  },

  _html(p) {
    const h = this.h, esc = h.esc
    const role = p.toYou ? '' : p.role
    const sub = p.sect ? (p.sect.own ? [role, esc(p.sect.name)].filter(Boolean).join(' · ') : `${role ? role + ' of' : 'Of'} the ${esc(p.sect.name)}`) : role
    const row = (k, v, tone = '') => `<div class="bd-row ${tone}"><span class="bd-l">${k}</span><span class="bd-v">${v}</span></div>`
    // 4.3: the span of years they can hope for (by the realm they reached) and the beats of a life near its end.
    const span = p.span ? ` <span class="bd-run" title="Their realm grants about ${p.span} years. Past it, old age can take them any year.">of ~${p.span}</span>` : ''
    const state = [
      p.chosen ? `<span class="pc-chip gold" title="Born with a rare root and a talent that out-paces most of their year">Heaven’s Chosen</span>` : '',
      p.twilight ? `<span class="pc-chip dim" title="Within a few years of their span: their hair has gone white">Final seclusion</span>` : '',
      p.injured ? `<span class="pc-chip red" title="A failed breakthrough wounded them; they cultivate slowly while it heals">Healing a backlash · ${p.injured}y</span>` : '',
    ].filter(Boolean).join('')
    const rows = [
      p.alive ? row('Age', `${p.age} years${span}`)
        : p.ascended ? row('Ascended', `year ${p.diedYear ?? '?'} · left the mortal world`, 'gold')
        : row('Passed on', `year ${p.diedYear ?? '?'}${p.cause ? ` · ${esc(p.cause)}` : ''}`, 'dim'),
      row(p.alive ? 'Realm' : 'Reached', esc(h.stageLabel(p.alive ? p.stage : p.maxStage))),
      p.rootName ? row('Spirit root', `${esc(h.latinOnly(p.rootName))}${p.rootMult ? ` <span class="bd-run" title="Cultivates ×${p.rootMult} as fast as a common root">×${p.rootMult} speed</span>` : ''}`) : '',
      p.temper ? row('Temper', esc(p.temper)) : '',
      p.morality ? row('Character', `<span class="pc-tone-${p.morality.tone || 'dim'}">${esc(p.morality.word)}</span>`) : '',
      p.bodyKnown ? row('Body', `Grade ${esc(p.body)}`) : '',   // NPC bodies are only simulated from 4.3: no fake "F" until then
    ].join('')
    // What they think of you. Family already keeps it (bond / affection, 0–100); for everyone else it is the world's rel
    // (−100..100), whose deeds arrive with encounters + memory (4.9/4.10). Until then, honest silence, never a fake number.
    const fv = p.feel ? p.feel.v : null
    const r = fv != null ? Math.round((fv - 50) * 2) : p.relScore, tone = r >= 30 ? 'jade' : r <= -30 ? 'red' : ''
    const quiet = r === 0 && !p.memories.length && fv == null
    const word = r >= 60 ? 'Devoted' : r >= 30 ? 'Warm' : r > -30 ? (quiet ? (p.toYou ? 'Nothing between you yet' : 'A stranger to you') : 'Indifferent') : r > -60 ? 'Cold' : 'Hateful'
    const num = p.feel ? ` <b>${esc(p.feel.label.toLowerCase())} ${fv}</b>` : r ? ` <b>${r > 0 ? '+' : ''}${r}</b>` : ''
    const mems = p.memories.map(m => `<div class="pc-mem">"${esc(m.text || m.k)}"</div>`).join('')
    const think = `<div class="bd-sec-title">What they think of you</div>
      <div class="pc-think"><span class="pc-rel ${tone ? 'pc-tone-' + tone : ''}">${esc(word)}${num}</span>
        ${mems || `<div class="pc-mem dim">${p.feel ? 'It moves with how you treat them on Kin → Family.' : 'No deeds pass between you yet. What you do to them will be remembered here.'}</div>`}</div>`
    const kin = p.kin.length ? `<div class="bd-sec-title">Kin</div><div class="pc-kin">${p.kin.map(k =>
      `<span class="pc-kin-i"><span class="pc-kin-r">${esc(k.rel)}</span>${k.name === 'You' ? '<b>You</b>' : this.link(k.pid, k.name)}</span>`).join('')}</div>` : ''
    const go = p.go.length ? `<div class="pc-go">${p.go.map((g, i) =>
      `<button type="button" class="fa-btn pc-go-b" data-pc-go="${i}"><span class="fa-g">${Icon.g(g.view === 'family' ? 'heart' : g.view === 'arena' ? 'duel' : g.view === 'explore' ? 'explore' : g.view === 'sect-disciples' ? 'disciple' : 'gate')}</span><span class="fa-t"><span class="fa-n">${esc(g.label)}</span><span class="fa-e">${g.view === 'world' ? 'their sect’s page' : 'deal with them there'}</span></span></button>`).join('')}</div>` : ''
    const back = this.trail.length ? `<button type="button" class="bd-x pc-back" data-pc-back title="Back">${Icon('back')}</button>` : ''
    return `<div class="bd-head">${back}<span class="bd-glyph">${Icon.g(p.alive ? 'person' : 'lineage')}</span>
        <span class="bd-title"><span class="bd-tt pc-name">${esc(p.name)}</span><span class="pc-sub">${[p.toYou ? `<b class="pc-you">${esc(p.toYou)}</b>` : p.classmate ? `<b class="pc-you">${esc(p.classmate)}</b>` : '', sub].filter(Boolean).join(' · ')}</span>${state ? `<span class="pc-chips">${state}</span>` : ''}</span>
        <button type="button" class="bd-x" data-pc-close title="Close (Esc)">${Icon('close')}</button></div>
      <div class="bd-rows">${rows}</div>${think}${kin}${go}`
  },

  _go(btn) {
    const info = this.gs.personInfo(this.pid), g = info?.go?.[+btn.dataset.pcGo]
    this.close()
    if (g) this.h.go(g.view, g)
  },

  // Beside the tapped name (below it, else above), clamped inside the window — the breakdown popover's placement.
  _place() {
    const pop = this.el?.querySelector('.pc-pop')
    if (!pop) return
    const W = window.innerWidth, H = window.innerHeight, pad = 8
    const w = Math.min(320, W - pad * 2)
    pop.style.width = w + 'px'
    pop.style.maxHeight = (H - pad * 2) + 'px'
    const r = this.anchor?.isConnected ? this.anchor.getBoundingClientRect() : null
    const ph = pop.offsetHeight
    let left = (W - w) / 2, top = (H - ph) / 2
    if (r && r.width) {
      left = Math.max(pad, Math.min(W - w - pad, r.left + r.width / 2 - w / 2))
      if (r.bottom > 0 && r.top < H) top = r.bottom + 6 + ph <= H - pad ? r.bottom + 6 : r.top - 6 - ph >= pad ? r.top - 6 - ph : H - ph - pad
    }
    pop.style.left = left + 'px'
    pop.style.top = Math.max(pad, Math.min(top, H - ph - pad)) + 'px'
  },
}
