// PersonCard — the person card (Phase 28 / task 4.2, docs/systems/living-world.md §3). One card for anyone in the world's
// registry: who they are (age, realm, root, temper, character, body), what they are to you and what they think of you,
// their kin, and where to act on them today. Any element with data-pid="<person id>" opens it (PersonCard.link() writes
// one); a name inside the card opens that person in place, with a back step. A popover beside the name on wide layouts,
// clamped inside the window on Overlay / phone. Data: gameState.personInfo(pid); familiarity: gameState.notePersonSeen.
// 4.10: "What you can do" (gameState.personActions / personAct: gift, spar, duel, teach, invite, swear, denounce, court,
// each with its cost, their odds of accepting and its lock), the "Why" list behind their feeling (each memory's +/-),
// and a live real-time countdown while they need time before another deed.

const PersonCard = {
  gs: null,
  h: null,             // { esc, stageLabel(i), latinOnly(s), go(view, opts), flash(msg, type) }
  onInline: null,      // 4.7: World → People draws the card in its own pane; names inside it (data-pc-inline) go there
  el: null,
  pid: null,
  trail: [],           // the people you stepped through (back)
  anchor: null,
  whyOpen: {},         // 4.10: pid -> the "Why" list is open
  onRefresh: null,     // 4.10: World -> People redraws its inline card (a deed done there, a countdown run out)

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    this.el = document.getElementById('person-overlay')
    document.addEventListener('click', e => {
      const t = e.target.closest?.('[data-pid]')
      // 4.7: the pin (works in the popover and in World → People's inline card)
      const pin = e.target.closest?.('[data-pc-pin]')
      if (pin) { e.stopPropagation(); e.preventDefault(); return this.togglePin(pin.dataset.pcPin) }
      // 4.10: a deed, or the "Why" toggle (the popover and the inline card alike)
      const act = e.target.closest?.('[data-pc-act]'), why = e.target.closest?.('[data-pc-why]')
      if (act || why) {
        e.stopPropagation(); e.preventDefault()
        const pid = (act || why).closest('[data-pc-for]')?.dataset.pcFor
        if (!pid) return
        if (why) { this.whyOpen[pid] = !this.whyOpen[pid]; return this._redraw(pid, why) }
        const id = act.dataset.pcAct, run = () => this.act(pid, id, act)
        // a deed that can end a life or turn the world against someone asks first
        if ((id === 'duel' || id === 'denounce') && this.h.confirm) {
          const nm = this.gs.personInfo(pid)?.name || 'them'
          return this.h.confirm(id === 'duel' ? `Challenge ${nm} to the death?` : `Denounce ${nm}?`,
            id === 'duel' ? 'If they accept and you lose, this life ends.' : 'Word spreads: they and theirs will not forget it.', run, id === 'duel' ? 'Challenge' : 'Denounce')
        }
        return run()
      }
      if (t && t.dataset.pid && this.onInline && t.closest('[data-pc-inline]')) { e.stopPropagation(); e.preventDefault(); return this.onInline(t.dataset.pid) }
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
    // 4.10: the countdowns tick in real time; when one runs out the card redraws with its deeds unlocked.
    setInterval(() => {
      for (const el of document.querySelectorAll('[data-pc-cd-end]')) {
        const left = Math.max(0, Math.ceil((+el.dataset.pcCdEnd - Date.now()) / 1000))
        el.textContent = this.clock(left)
        if (!left) { const pid = el.closest('[data-pc-for]')?.dataset.pcFor; el.removeAttribute('data-pc-cd-end'); if (pid) this._redraw(pid, el) }
      }
    }, 1000)
    return this
  },

  // A name you can tap. Plain text when there is no person behind it (yet).
  link(pid, name) {
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return pid ? `<button type="button" class="pc-link" data-pid="${esc(pid)}" title="See ${esc(name)}">${esc(name)}</button>` : esc(name)
  },

  // 4.5: the "known face" marker for someone a system cast from the world (a classmate as a suitor, a face from your log
  // in the arena). '' when they are a stranger to you.
  known(pid) {
    const k = pid && this.gs?.knownFace?.(pid)
    if (!k) return ''
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return `<span class="pc-chip pc-known ${k.tone || ''}" title="${esc(k.why)} Tap their name for their card.">${Icon('eye')}${esc(k.label)}</span>`
  },

  // 4.7: pin / unpin (the player's choice; capped). Redraws the popover; the inline card redraws with its view.
  togglePin(pid) {
    const r = this.gs.togglePin(pid)
    if (!r.ok && r.reason === 'full') this.h.flash?.(`You can follow only ${r.pinMax} people. Unpin someone first.`, 'warn')
    else if (r.ok) this.h.flash?.(r.pinned ? 'Pinned: their life runs in full now, and their deeds reach your log.' : 'Unpinned.', r.pinned ? 'positive' : 'neutral')
    if (this.isOpen() && this.pid === pid) this.open(pid, this.anchor)
    return r
  },

  isOpen() { return !!this.el && !this.el.classList.contains('hidden') },

  clock(secs) { const m = Math.floor(secs / 60), s = secs % 60; return `${m}:${String(s).padStart(2, '0')}` },

  // Redraw wherever this person's card is showing (the popover, or World -> People's inline pane).
  _redraw(pid, from) {
    if (from?.closest?.('.pc-inline')) return this.onRefresh?.()
    if (this.isOpen() && this.pid === pid) this.open(pid, this.anchor)
  },

  // 4.10: do a deed. The answer (accepted / refused) shows as a toast; a fight opens the battle page.
  act(pid, id, btn) {
    const r = this.gs.personAct(pid, id)
    if (!r.ok) { this.h.flash?.(r.lock || (r.reason === 'cooldown' ? `They need time: ready again in ${this.clock(r.secsLeft)}` : 'Not now.'), 'warn'); return r }
    if (r.fight) { this.close(); this.h.onFight?.(); return r }
    this.h.flash?.(r.text, r.accepted === false ? 'warn' : 'positive')
    this._redraw(pid, btn)
    return r
  },

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

  // opts.inline: World → People's pane (no close button; its own back link sits above the card).
  _html(p, opts = {}) {
    const h = this.h, esc = h.esc
    const role = p.toYou ? '' : p.role
    const sub = p.sect ? (p.sect.own ? [role, esc(p.sect.name)].filter(Boolean).join(' · ') : `${role ? role + ' of' : 'Of'} the ${esc(p.sect.name)}`) : role
    const row = (k, v, tone = '') => `<div class="bd-row ${tone}"><span class="bd-l">${k}</span><span class="bd-v">${v}</span></div>`
    // 4.3: the span of years they can hope for (by the realm they reached) and the beats of a life near its end.
    const span = p.span ? ` <span class="bd-run" title="Their realm grants about ${p.span} years. Past it, old age can take them any year.">of ~${p.span}</span>` : ''
    const state = [
      p.chosen ? `<span class="pc-chip gold" title="Born with a rare root and a talent that out-paces most of their year">Heaven’s Chosen</span>` : '',
      p.rank?.heaven ? `<span class="pc-chip ${p.rank.heaven <= 10 ? 'gold' : ''}" title="Their place on the Heaven Ranking (World → Rankings)">${Icon('crown')}#${p.rank.heaven} under Heaven</span>` : '',   // 4.8
      p.rank?.dragon ? `<span class="pc-chip ${p.rank.dragon <= 10 ? 'gold' : 'jade'}" title="Their place on the Rising Dragon Ranking (World → Rankings)">${Icon('rise')}#${p.rank.dragon} Rising Dragon</span>` : '',
      p.hunter ? `<span class="pc-chip red" title="They hunt young geniuses the rankings name">${Icon('skull')}Genius hunter</span>` : '',
      p.twilight ? `<span class="pc-chip dim" title="Within a few years of their span: their hair has gone white">Final seclusion</span>` : '',
      p.injured ? `<span class="pc-chip red" title="A failed breakthrough wounded them; they cultivate slowly while it heals">Healing a backlash</span>` : '',
      p.sworn ? `<span class="pc-chip gold" title="You swore brotherhood: they fight in your sect wars and will avenge you">${Icon('bond')}Sworn sibling</span>` : '',
      p.rival ? `<span class="pc-chip ${p.rival.heat != null ? (p.rival.tone || 'red') : 'dim'}" title="${p.rival.heat != null ? `Your rival this life · heat ${p.rival.heat} (World → Rival)` : 'Your rival in a past life'}">${Icon('duel')}${p.rival.heat != null ? `Your rival · ${this.h.esc(p.rival.word)}` : 'Past rival'}</span>` : '',   // 4.10b
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
    const mems = p.memories.map(m => `<div class="pc-mem${m.past ? ' past' : ''}">${m.past ? '<span class="pc-mem-past">Of a past life</span>' : ''}"${esc(m.text || m.k)}"${m.n > 1 ? ` <span class="pc-mem-n">×${m.n}</span>` : ''}</div>`).join('')
    // 4.10: why they feel so — every memory with what it moved, and what older memories still add.
    const rw = !p.feel && p.relWhy && (p.relWhy.items.length || p.relWhy.older) ? p.relWhy : null, wopen = rw && this.whyOpen[p.pid]
    const sg = v => v ? `${v > 0 ? '+' : '−'}${Math.abs(v)}` : '0'
    const whyBtn = rw ? `<button type="button" class="pc-why${wopen ? ' on' : ''}" data-pc-why aria-expanded="${!!wopen}" title="Each memory, and what it moved">${Icon('why')}Why</button>` : ''
    const whyList = wopen ? `<div class="pc-why-list">${rw.items.map(m => `<div class="pc-why-r"><span>${m.past ? '<i>past life</i> ' : ''}"${esc(m.text)}"${m.n > 1 ? ` ×${m.n}` : ''}</span><b class="${m.d > 0 ? 'up' : 'down'}">${sg(m.d)}</b></div>`).join('')}
      ${rw.older ? `<div class="pc-why-r dim"><span>Older memories, rumours, a forebear's debts</span><b class="${rw.older > 0 ? 'up' : 'down'}">${sg(rw.older)}</b></div>` : ''}
      <div class="pc-why-r tot"><span>How they feel</span><b>${sg(p.relScore)}</b></div></div>` : ''
    const think = `<div class="bd-sec-title">What they think of you</div>
      <div class="pc-think" data-pc-for="${esc(p.pid)}"><span class="pc-relrow"><span class="pc-rel ${tone ? 'pc-tone-' + tone : ''}">${esc(word)}${num}</span>${whyBtn}</span>${whyList}
        ${wopen ? '' : mems || `<div class="pc-mem dim">${p.feel ? 'It moves with how you treat them on Kin → Family.' : 'No deeds pass between you yet. What you do to them will be remembered here.'}</div>`}</div>`
    // 4.4: what they are doing now, who they are bound to, and the feud they carry (the heavy tier's life).
    const nowText = p.now ? (p.nowPid && p.nowName ? esc(p.now).replace(esc(p.nowName), this.link(p.nowPid, p.nowName)) : esc(p.now)) : ''
    const now = p.alive && (p.now || p.feud || p.ties?.length) ? `<div class="bd-sec-title">Their life now</div><div class="pc-now">
      ${p.now ? `<div class="pc-act">${Icon.g('play')}<span>${nowText}</span></div>` : ''}
      ${p.feud ? `<div class="pc-feud">${Icon.g('alert')}<span>Sworn to avenge ${esc(p.feud.why)} on ${this.link(p.feud.pid, p.feud.name)} <span class="dim">(year ${p.feud.y})</span></span></div>` : ''}
      ${p.ties?.length ? `<div class="pc-ties">${p.ties.map(t => `<span class="pc-tie"><span class="pc-tie-w pc-tone-${t.tone}">${esc(t.word)}</span>${this.link(t.pid, t.name)}</span>`).join('')}</div>` : ''}</div>`
      : !p.alive && p.killedBy ? `<div class="pc-now"><div class="pc-feud dim">${Icon.g('skull')}<span>Slain by ${this.link(p.killedBy.pid, p.killedBy.name)}</span></div></div>` : ''
    const kin = p.kin.length ?`<div class="bd-sec-title">Kin</div><div class="pc-kin">${p.kin.map(k =>
      `<span class="pc-kin-i"><span class="pc-kin-r">${esc(k.rel)}</span>${k.name === 'You' ? '<b>You</b>' : this.link(k.pid, k.name)}</span>`).join('')}</div>` : ''
    const go = p.go.length ? `<div class="pc-go">${p.go.map((g, i) =>
      `<button type="button" class="fa-btn pc-go-b" data-pc-go="${i}"><span class="fa-g">${Icon.g(g.view === 'family' ? 'heart' : g.view === 'arena' ? 'duel' : g.view === 'explore' ? 'explore' : g.view === 'sect-disciples' ? 'disciple' : 'gate')}</span><span class="fa-t"><span class="fa-n">${esc(g.label)}</span><span class="fa-e">${g.view === 'world' ? 'their sect’s page' : 'deal with them there'}</span></span></button>`).join('')}</div>` : ''
    const back = !opts.inline && this.trail.length ? `<button type="button" class="bd-x pc-back" data-pc-back title="Back">${Icon('back')}</button>` : ''
    return `<div class="bd-head">${back}<span class="bd-glyph">${Icon.g(p.alive ? 'person' : 'lineage')}</span>
        <span class="bd-title"><span class="bd-tt pc-name">${esc(p.name)}</span><span class="pc-sub">${[p.toYou ? `<b class="pc-you">${esc(p.toYou)}</b>` : p.classmate ? `<b class="pc-you">${esc(p.classmate)}</b>` : '', sub].filter(Boolean).join(' · ')}</span>${state ? `<span class="pc-chips">${state}</span>` : ''}</span>
        <button type="button" class="bd-x pc-pin${p.pinned ? ' on' : ''}" data-pc-pin="${esc(p.pid)}" aria-pressed="${p.pinned}" title="${p.pinned ? 'Unpin: stop following them' : 'Pin: follow their life on World → People'}">${Icon('star')}</button>
        ${opts.inline ? '' : `<button type="button" class="bd-x" data-pc-close title="Close (Esc)">${Icon('close')}</button>`}</div>
      <div class="bd-rows">${rows}</div>${think}${this._acts(p)}${now}${kin}${go}`
  },

  // 4.10: "What you can do" — the deeds open now first, then the locked ones with their reasons.
  _acts(p) {
    if (!p.alive) return ''
    const d = this.gs.personActions?.(p.pid)
    if (!d || d.gone || !d.acts.length) return ''
    const esc = this.h.esc, fmtQ = v => this.h.fmt ? this.h.fmt(v) : String(v)
    const open = d.acts.filter(a => !a.lock), locked = d.acts.filter(a => a.lock)
    const btn = a => {
      const off = !!a.lock || !!d.cd, note = esc(a.note.replace('{qi}', fmtQ(a.qiCost || 0)))
      return `<button type="button" class="fa-btn pc-actb${a.tone ? ' ' + a.tone : ''}${a.lock ? ' locked' : ''}" data-pc-act="${a.id}"${off ? ' disabled' : ''} title="${a.lock ? esc(a.lock) : note}">
        <span class="fa-g">${Icon(a.lock ? 'lock' : a.icon)}</span><span class="fa-t"><span class="fa-n">${esc(a.label)}</span><span class="fa-e">${a.lock ? esc(a.lock) : note}</span></span></button>`
    }
    const cd = d.cd ? `<div class="pc-cd">${Icon('age')}<span>They need time before another deed: ready again in <b data-pc-cd-end="${Date.now() + d.cd * 1000}">${this.clock(d.cd)}</b></span></div>` : ''
    const hint = d.hint ? `<div class="pc-act-hint">${Icon('why')}<span>${esc(NPC_ACTS_TEXT.hint)}</span></div>` : ''
    return `<div class="bd-sec-title">What you can do</div><div class="pc-acts${d.cd ? ' waiting' : ''}" data-pc-for="${esc(p.pid)}">${hint}${cd}
      <div class="pc-act-grid">${open.map(btn).join('')}</div>
      ${locked.length ? `<div class="pc-act-grid pc-locked">${locked.map(btn).join('')}</div>` : ''}</div>`
  },

  _go(btn, pid = this.pid) {
    const info = this.gs.personInfo(pid), g = info?.go?.[+btn.dataset.pcGo]
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
