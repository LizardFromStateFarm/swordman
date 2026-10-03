// SectDetail — a sect's own page (Phase 43h, docs/systems/npc-sects.md → "43h"), drawn inline in 世 World → Sects
// (WorldView, world-view.js) when you tap a sect in the list. Shows the sect (Might against yours, stance + what it
// remembers of you, its halls with level pips, its blessing) and every action you may take toward it — a leader: gift,
// alliance, declare war, tribute, spy, trade manuals, poach (a shortcut into Sect → Disciples → Poach recruits); a
// member: gift, spar with one of their disciples, urge your master to war. Each action shows its cost, the real odds of
// their reply, what it does, and why it is locked. Data: gameState.sectRelationsInfo(id); actions: gameState.sectAct().
// html(s, id) returns the page; click(e, id) handles its buttons (WorldView routes them here).

const SectDetail = {
  deps: null,            // { gameState, flash, confirm, fight, go, fmt, poach(id) }
  tradePick: null,       // the manual you chose to give, for a trade

  init(deps) { this.deps = deps; return this },

  _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') },
  _pips(lv, max) { return Array.from({ length: SECT_BUILDING_MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : i < max ? '' : 'cap'}"></i>`).join('') },
  _odds(p) { return p < 0.35 ? 'odds-low' : p < 0.6 ? 'odds-mid' : 'odds-good' },

  // The page for sect `id`, or null when it is gone (it fell, or was taken). The caller sets [data-w] bar widths.
  html(s, id) {
    const gs = this.deps.gameState, info = gs.sectRelationsInfo(id)
    if (!info) return null
    const esc = v => this._esc(v), r = info.sect, sgn = n => (n > 0 ? '+' : '') + n, fmt = n => this.deps.fmt(n)
    const kind = info.isMine ? 'Your sect' : info.warHere ? 'At war with you' : r.sworn ? 'A sworn ally' : r.kind === 'joinable' ? 'A sect that takes disciples' : r.kind === 'splinter' ? 'A splinter sect' : r.grudge ? 'Risen from ashes you made' : 'A rival sect'
    const tone = info.warHere ? 'war' : r.sworn ? 'ally' : r.stance <= -20 ? 'hostile' : ''

    // ── who they are, and you against them ──
    const tags = [info.warHere ? '<span class="fam-tag tone-red">at war with you</span>' : '', r.sworn ? '<span class="fam-tag tone-jade">sworn ally</span>' : '',
      info.isMine ? '<span class="fam-tag tone-gold">your sect</span>' : '',
      r.grudge ? `<span class="fam-tag tone-red" title="Raised again from the ashes of the ${esc(r.ashOf || r.name)}, which you burned. They want vengeance, rebuild fast, and come to war more often.">feud: you burned them</span>` : '',   // 43f
      `<span class="fam-tag tone-${r.stanceTone}" title="Their stance toward you (${r.stance} of ±100). What you do to them moves it.">${esc(r.stanceLabel)} ${sgn(r.stance)}</span>`,
      r.blessing != null ? `<span class="fam-tag" title="How much of its written blessing its halls can give its disciples">blessing ×${r.blessing.toFixed(2)}</span>` : ''].join('')
    const vmax = Math.max(r.might, info.myMight, 1)
    const vs = `<div class="sv-vs">
        <div class="sv-vs-row"><span class="sv-vs-n">${esc(r.name)}</span><span class="fam-bar"><i class="tone-red" data-w="${Math.round(r.might / vmax * 100)}"></i></span><b>${fmt(r.might)}</b></div>
        <div class="sv-vs-row"><span class="sv-vs-n">${info.role === 'member' ? 'Your sect' : 'You'}</span><span class="fam-bar"><i class="tone-gold" data-w="${Math.round(info.myMight / vmax * 100)}"></i></span><b>${fmt(info.myMight)}</b></div></div>
      <div class="sdx-ratio">In a war they would fight at <b class="${info.ratio > 1 ? 'down' : 'up'}">×${info.ratio.toFixed(2)}</b> of an even match.</div>`
    const head = `<section class="fam-card sect sdx-hero" data-tone="${tone}"><div class="sdx-kind">${kind}</div><div class="fc-head"><span class="fc-glyph" data-icon="${info.isMine ? 'hall' : r.kind === 'splinter' ? 'split' : 'gate'}"></span><div class="fc-id">
        <div class="fc-name">${esc(r.name)}</div>
        <div class="fc-sub">Led by ${PersonCard.link(r.leaderId, r.leader)}${r.temper ? `, ${esc(r.temper)}` : ''} · ${esc(r.band)} · ${fmt(r.disciples)} disciples</div>
        <div class="fc-tags">${tags}</div>
        ${(info.people || []).length > 1 ? `<div class="pc-people"><span class="pc-people-k">Elders</span>${info.people.filter(p => p.role !== 'Master').map(p => PersonCard.link(p.pid, p.name)).join('<span class="pc-sep">·</span>')}</div>` : ''}</div></div>${info.isMine ? '' : vs}</section>`

    // ── what you can do ──
    const GROUPS = [['diplomacy', 'Diplomacy'], ['war', 'War'], ['force', 'Pressure'], ['trade', 'Trade and people'], ['visit', 'A visit']]
    const tile = a => {
      const bits = []
      if (a.cost) bits.push(`<span class="cost">${fmt(a.cost)} stones</span>`)
      if (a.odds != null && a.id !== 'spar') bits.push(`<span class="${this._odds(a.odds)}">${Math.round(a.odds * 100)}% they ${a.id === 'alliance' ? 'accept' : a.id === 'urge' ? 'agree' : a.id === 'spy' ? 'never see it' : 'pay'}</span>${a.vsMight ? ' <span class="ws-why">(your Might against theirs)</span>' : ''}`)
      for (const b of a.bits) bits.push(`<span class="${b.tone || ''}">${esc(b.t)}</span>`)
      if (a.id === 'trade' && !a.lock) {
        const pick = this.tradePick && a.yours.some(y => y.id === this.tradePick && y.ok) ? this.tradePick : null
        const chips = `<div class="sdx-trade"><div class="sdx-k">Give one of yours</div><div class="sdx-chips">${a.yours.map(y =>
          `<button class="pack-chip sdx-chip${pick === y.id ? ' active' : ''}" data-pick="${y.id}" ${y.ok ? '' : 'disabled'} title="${y.ok ? `${esc(y.name)} (${ART_RARITY[y.rarity].name})` : 'Too low a grade for their offer'}">${esc(y.name)} <i>${ART_RARITY[y.rarity].name}</i></button>`).join('')}</div></div>`
        return `<div class="sdx-act">${this._tile(a, bits, pick ? '' : 'Pick a manual to give', pick)}${chips}</div>`
      }
      return `<div class="sdx-act">${this._tile(a, bits, a.lock)}</div>`
    }
    let acts = ''
    if (info.isMine) acts = '<div class="fk-note">Your own sect. Its blessing, its master and its halls are on Sect → Overview.</div>'
    else if (!info.actions.length) acts = `<div class="fk-note">You stand outside every sect. Join one, or found your own, to deal with the ${esc(r.name)}.</div>`
    else acts = GROUPS.map(([g, title]) => {
      const list = info.actions.filter(a => a.group === g)
      return list.length ? `<section class="fam-sec sdx-group"><div class="fam-sec-title"><span>${title}</span></div><div class="ws-choices">${list.map(tile).join('')}</div></section>` : ''
    }).join('')

    // ── its halls + what it remembers ──
    const halls = r.buildings.map(b => `<div class="ws-hall${b.level ? '' : ' none'}"><span>${esc(b.name)}</span><span class="ws-pips" title="${b.level ? `Lv.${b.level}` : 'not raised'} · can reach Lv.${r.maxBuildingLevel}">${this._pips(b.level, r.maxBuildingLevel)}</span></div>`).join('')
    const deeds = (r.deeds || []).map(d => `<div class="ws-deed"><span class="ws-yr">yr ${d.year}</span><span>${esc(d.text)}</span>${d.delta ? `<b class="${d.delta > 0 ? 'up' : 'down'}">${sgn(d.delta)}</b>` : ''}</div>`).join('')
    const body = `<section class="fam-sec"><div class="fam-sec-title"><span>Their mountain</span><span class="fam-count">${r.levels} hall levels</span></div>
        <div class="ws-halls">${halls}<div class="ws-hall hall"><span>Sect Hall</span><span class="ws-hlv">Lv.${r.hallLevel} <i>of ${r.maxHall}</i></span></div></div>
        <div class="ws-key"><span class="ws-pips"><i class="on"></i></span> built <span class="ws-pips"><i></i></span> room to grow <span class="ws-pips"><i class="cap"></i></span> beyond this sect</div></section>
      ${info.isMine ? '' : `<section class="fam-sec"><div class="fam-sec-title"><span>What they remember of you</span></div>${deeds || '<div class="ws-deed none">Nothing yet. They know your name, no more.</div>'}</section>`}`

    return `<div class="sdx"><button class="fa-quiet sdx-back" data-back="1">${Icon('back')} All sects</button>${head}<div class="sdx-acts">${acts}</div>${body}</div>`
  },

  _tile(a, bits, lock, pick = null) {
    const esc = v => this._esc(v)
    return `<button class="fa-btn wide ws-choice${a.group === 'war' ? ' sdx-war' : ''}${lock ? ' locked' : ''}" data-act="${a.id}"${pick ? ` data-arg="${pick}"` : ''} ${lock ? 'disabled' : ''}>
      <span class="fa-g">${Icon.g(a.glyph)}</span><span class="fa-t"><span class="fa-n">${esc(a.label)}</span>
      <span class="fa-e">${bits.join(' · ')}${lock ? `<br><span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${esc(lock)}</span>` : ''}</span></span></button>`
  },

  // A click on the page for sect `id`. Returns true when it was one of the page's own controls.
  click(e, id, rerender) {
    const gs = this.deps.gameState
    const p = e.target.closest('[data-pick]')
    if (p) { if (!p.disabled) { this.tradePick = this.tradePick === p.dataset.pick ? null : p.dataset.pick; rerender() } return true }
    const b = e.target.closest('[data-act]')
    if (!b) return false
    if (b.disabled) return true
    const act = b.dataset.act, arg = b.dataset.arg || null
    const a = gs.sectRelationsInfo(id)?.actions.find(x => x.id === act)
    if (a?.nav === 'poach') { this.deps.poach(id); return true }   // into Sect → Disciples → Poach recruits, this sect picked
    const run = () => {
      const r = gs.sectAct(id, act, arg)
      if (!r.ok) return this.deps.flash(r.lock || 'Not now', 'negative')
      if (r.fight) return this.deps.fight()
      this.tradePick = null
      this.deps.flash(r.text, r.success ? 'positive' : 'negative')
      if (act === 'war' || (act === 'urge' && r.success)) this.deps.go('sect-war')
    }
    if (a?.confirm) this.deps.confirm(a.label + '?', a.confirm, run, a.label)
    else run()
    return true
  },
}
