// FamilyView — Kin → Family (roadmap 1.8b-3a, Phase 33). The family as a set of choices, not a report: the spouse
// card (affection + trend + why it last moved, time / gift / dual cultivation / try for a child / separate), the
// courtship card when unmarried (seek → pick → meetings → propose), a partner's wish for a child, and every child
// as a card you can open to spend time with, teach or provide for. Heir, lovers and former spouses follow.
// Reads GameState's *Preview() helpers so every button shows its cost and effect before the click.
// See docs/systems/family.md → "1.8b-3a" and docs/systems/ui-layout.md → "Family view".

// Morality words (UI only; −100 ruthless … +100 righteous). Tone = CSS class suffix.
function moralityLabel(m) {
  if (m >= 40)  return { word: 'Righteous', tone: 'jade' }
  if (m >= 10)  return { word: 'Upright',   tone: '' }
  if (m > -10)  return { word: 'Pragmatic', tone: 'dim' }
  if (m > -40)  return { word: 'Callous',   tone: 'gold' }
  return               { word: 'Ruthless',  tone: 'red' }
}

// A spiritual root reads by type (potential): heavenly > pure > dual > mixed (root.mult is the growth speed).
const ROOT_TONE = { heavenly: 'gold', pure: 'jade', dual: 'purple', mixed: 'dim' }

class FamilyView {
  // h: { esc, fmt, stageLabel, affectionLabel, bondLabel, latinOnly, rename, confirm, flash, wire, endText, pendingKey }
  constructor(gameState, h) {
    this.gs = gameState
    this.h = h
    this.el = document.getElementById('tab-family')
    this.openChild = null   // id of the child card whose actions are unfolded
    this.el.addEventListener('click', e => this._click(e))
    // Live cooldown countdowns (real seconds): tick the labels once a second, re-render when one reaches zero.
    this._cdTimer = setInterval(() => this._tickCooldowns(), 1000)
  }

  // "4:59" / "45s" — remaining real time on a cooldown
  _clock(secs) { secs = Math.max(0, Math.ceil(secs)); return secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `${secs}s` }

  _tickCooldowns() {
    const nodes = this.el.querySelectorAll('.fa-cd[data-at]')
    if (!nodes.length) return
    const now = this.gs._cdNow()
    let done = false
    nodes.forEach(n => {
      const left = Math.ceil(+n.dataset.at - now)
      if (left <= 0) done = true
      else n.textContent = `Ready in ${this._clock(left)}`
    })
    if (done && this.el.offsetParent !== null) this.render(this.gs.get())
  }

  render(s) {
    const f = s.family || {}
    // Two columns in Expanded/Desktop (you + your partner · your children); Overlay stacks them in `order`.
    this.el.innerHTML = `<div class="fam-view">
      <div class="fam-col">${this._treeLink()}${this._ultimatum(s)}${this._wish(s)}${this._partner(s)}${this._plan(s)}${this._others(s)}${this._heir(s)}</div>
      <div class="fam-col">${(s.family.lovers || []).map(l => this._loverCard(s, l)).join('')}${this._children(s)}</div></div>`
    // Bar widths/colors through CSSOM (CSP blocks inline style attributes)
    this.el.querySelectorAll('[data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
    this.el.querySelectorAll('[data-l]').forEach(b => { b.style.left = b.dataset.l + '%' })
    this.h.wire(this.el)
  }


  // ── pieces ──────────────────────────────────────────────────────────────────
  _name(p) { return this.h.esc(Persons.fullName(p)) }
  _persona(id) { return PERSONALITIES.find(x => x.id === id) }
  _age(s, p) { return Math.max(0, Math.floor(s.world.year - p.bornYear)) }
  _signed(n) { n = Math.round(n); return `${n >= 0 ? '+' : '−'}${Math.abs(n)}` }
  _plural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}` }

  // One action button: glyph, name, what it does (or why it's locked). data-fa = action, data-id = target.
  _act(fa, glyph, name, p, effect, extra = '', cls = '') {
    const cd = !p.ok && p.reason === 'cooldown' && p.secsLeft != null
    const why = !p.ok && !cd ? this._lockText(p) : ''
    return `<button class="fa-btn${cls ? ' ' + cls : ''}${p.ok ? '' : ' locked'}" data-fa="${fa}"${extra} ${p.ok ? '' : 'disabled'}>
      <span class="fa-g">${Icon.g(glyph)}</span><span class="fa-t"><span class="fa-n">${name}</span>
      <span class="fa-e">${cd ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i><span class="fa-cd" data-at="${this.gs._cdNow() + p.secsLeft}">Ready in ${this._clock(p.secsLeft)}</span></span>` : why ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${this.h.esc(why)}</span>` : effect}</span></span></button>`
  }

  _lockText(p) {
    switch (p.reason) {
      case 'cooldown':  return `Again in year ${p.readyYear}`
      case 'qi':        return 'Not enough Qi'
      // Say what it costs, not just "no" (user 2026-09-27)
      case 'stones': {
        const cost = p.cost ?? p.stones
        return cost ? `Costs ${this._num(cost)} stones · you have ${this._num(Math.floor(this.gs.get().spiritStones))}` : 'Not enough Spirit Stones'
      }
      case 'young':     return `From age ${p.minAge}`
      case 'full':      return 'Every hall seat is taken'
      case 'joined':    return 'Already in your sect'
      case 'gone':      return 'They are gone from the house'
      case 'no_sect':   return 'Found a sect first'
      case 'expecting': return 'A child is already on the way'
      case 'cold':      return 'They are too cold toward you'
      case 'stage':     return `Reach ${stageShortName(p.minStage)}`
      case 'courting':  return 'You are already courting'
      case 'meetings':  return `${p.left} more meeting${p.left === 1 ? '' : 's'} first`
      case 'pending':   return 'Answer the meeting first'
      case 'duel':      return 'Not while a duel is pending'
      case 'wish':      return 'They already ask: answer above'
      case 'items':     return 'Needs a Beast Core'
      case 'maxed':     return `Their body is a ${BODY_TIERS[p.bodyTier]?.name || 'peak'}: as far as you can drill it`
      default:          return 'Not now'
    }
  }

  _eff(bits) { return bits.filter(Boolean).map(b => `<span class="${b[1] || ''}">${b[0]}</span>`).join(' · ') }
  _num(n) { return this.h.fmt(n).replace(/\.0+(?=[A-Za-z]*$)/, '') }   // 210.00M → 210M (100M stays 100M)
  _qiBit(q) { return q ? [`−${this._num(q)} Qi`, 'cost'] : null }
  _stoneBit(n) { return n ? [`${Icon('stone')} ${this._num(n)}`, 'cost'] : null }
  _heartBit(n) { return n ? [`affection ${this._signed(n)}`, n > 0 ? 'up' : 'down'] : null }

  // A partner's wish for a child ('ask' plan) — the one urgent thing this view can hold.
  _wish(s) {
    const f = s.family, w = f.childWish
    if (!w) return ''
    const p = [f.spouse, ...f.lovers.map(l => l.person)].find(x => x?.id === w.partnerId)
    if (!p) return ''
    const lover = f.spouse?.id !== p.id
    const decline = f.spouse?.id === p.id ? (CHILD_WISH_DECLINE_AFF[p.personality] ?? CHILD_WISH_DECLINE_AFF.default) : 0
    return `<section class="fam-wish">
      <div class="fw-g" data-icon="lantern"></div>
      <div class="fw-body">
        <div class="fw-title">${this.h.esc(p.given)} wishes for a child</div>
        <div class="fw-text">${lover ? `Your lover asks it quietly. A child would be yours, and ${f.spouse ? 'harder to hide from your spouse' : 'your clan’s'}.`
          : `Since year ${w.year}, ${this.h.esc(p.given)} has spoken of it. The choice is yours; it waits until you make it.`}</div>
        <div class="fw-acts">
          <button class="fa-pill yes row" data-fa="wish-yes">Yes<span>within the year</span></button>
          <button class="fa-pill row" data-fa="wish-no">Not now<span>${decline ? `affection ${this._signed(decline)}` : 'the wish passes'}</span></button>
        </div>
      </div></section>`
  }

  _partner(s) {
    const f = s.family
    if (f.spouse) return this._spouseCard(s)
    if (f.court) return this._courtCard(s)
    return this._alone(s)
  }

  _spouseCard(s) {
    const f = s.family, sp = f.spouse, h = this.h, gs = this.gs
    const al = h.affectionLabel(f.affection)
    const pers = this._persona(sp.personality)
    const trail = f.affTrail || [], then = trail.length ? trail[Math.max(0, trail.length - 1 - AFF_TREND_YEARS)][1] : null
    const trend = then == null ? 0 : Math.round(f.affection - then)
    const trendHtml = trend ? `<span class="fc-trend ${trend > 0 ? 'up' : 'down'}" title="Change over the last ${Math.min(AFF_TREND_YEARS, trail.length - 1)} years">${trend > 0 ? '▲' : '▼'}${Math.abs(trend)}</span>` : '<span class="fc-trend flat" title="Steady">—</span>'
    const last = f.lastAff ? `${h.esc(f.lastAff.why)}${f.lastAff.delta ? ` <b class="${f.lastAff.delta > 0 ? 'up' : 'down'}">${this._signed(f.lastAff.delta)}</b>` : ''} · yr ${f.lastAff.year}` : 'Nothing yet has moved them.'
    const flags = []
    if (f.affection >= AFFECTION_DEVOTED) flags.push(`<span class="fc-flag jade">Devoted · +${Math.round(DEVOTED_BT_BONUS * 100)}% breakthrough</span>`)
    if (f.affection < AFFECTION_CRISIS) flags.push('<span class="fc-flag red">Cold · a crisis may come</span>')
    if (f.tolerant) flags.push('<span class="fc-flag">Knows of your lovers, and tolerates it</span>')
    if (f.btSabotage) flags.push(`<span class="fc-flag red">Sabotaging your next breakthrough · −${Math.round(SABOTAGE_BT_MALUS * 100)}%</span>`)
    const t = gs.spouseActionPreview('time'), g = gs.spouseActionPreview('gift'), d = gs.spouseActionPreview('dual'), c = gs.tryChildPreview()
    const expecting = f.expecting.filter(e => e.partnerId === sp.id)
    const cEff = expecting.length ? '' : this._eff([['a child within the year', 'up']])
    // A pending wish from this spouse is the way to a child right now: say so instead of a bare cooldown
    if (f.childWish?.partnerId === sp.id && !c.ok) Object.assign(c, { reason: 'wish' })
    return `<section class="fam-card spouse">
      <div class="fc-head">
        <span class="fc-glyph" data-icon="couple"></span>
        <div class="fc-id"><div class="fc-name">${this._name(sp)}</div>
          <div class="fc-sub">${h.stageLabel(sp.stageIndex)} · age ${this._age(s, sp)} · wed in year ${f.marriedYear}</div>
          ${pers ? `<div class="fc-tags"><span class="fam-tag" title="${h.esc(pers.blurb)}"><b data-icon="mask"></b>${h.esc(pers.name)}</span><span class="fam-tag"><b data-icon="root"></b>${h.esc(h.latinOnly(sp.root?.name || ''))}</span></div>` : ''}
        </div>
      </div>
      <button class="fc-aff" data-bd="affection">
        <span class="fa-row"><span class="fa-k">Affection</span><span class="fa-v tone-${al.tone}">${al.word} · ${Math.round(f.affection)}</span>${trendHtml}</span>
        <span class="fam-bar"><i class="tone-${al.tone}" data-w="${Math.round(f.affection)}"></i><em data-l="${AFFECTION_CRISIS}" title="Below this: Cold"></em><em data-l="${AFFECTION_DEVOTED}" title="From here: Devoted"></em></span>
        <span class="fa-last">${last}</span>
      </button>
      ${flags.length ? `<div class="fc-flags">${flags.join('')}</div>` : ''}
      ${pers ? `<div class="fc-hint">${h.esc(pers.blurb)} Every temper is pleased by different things.</div>` : ''}
      <div class="fa-grid">
        ${this._act('sp-time', 'heart', 'Spend time', t, this._eff([this._heartBit(t.aff), this._qiBit(t.qi)]))}
        ${this._act('sp-gift', 'gift', 'Bring a gift', g, this._eff([this._heartBit(g.aff), this._stoneBit(g.stones)]))}
        ${this._act('sp-dual', 'taiji', 'Dual cultivation', d, d.qiGainFrac != null ? this._eff([[`+${Math.round(d.qiGainFrac * 100)}% Qi`, 'up'], [`${Math.round(d.risk * 100)}% deviation`, d.risk > 0.1 ? 'down' : 'dim']]) : '')}
        ${expecting.length ? `<div class="fa-btn info"><span class="fa-g" data-icon="child"></span><span class="fa-t"><span class="fa-n">Expecting</span><span class="fa-e">due in year ${Math.ceil(expecting[0].dueYear)}</span></span></div>`
          : this._act('sp-child', 'heir', 'Try for a child', c, cEff)}
      </div>
      <div class="fc-foot"><button class="fa-quiet danger" data-fa="sp-separate">Separate from ${h.esc(sp.given)}</button></div>
    </section>`
  }

  _courtCard(s) {
    const f = s.family, c = f.court, h = this.h, gs = this.gs
    if (!c.target) {
      return `<section class="fam-card court">
        <div class="fc-head"><span class="fc-glyph" data-icon="bond"></span><div class="fc-id"><div class="fc-name">Whom will you court?</div>
          <div class="fc-sub">The matchmaker waits for your answer. Read them well: each temper wants something different.</div></div></div>
        <div class="cand-grid">${c.candidates.map(p => {
          const pers = this._persona(p.personality)
          return `<div class="cand">
            <div class="cand-name">${this._name(p)}</div>
            <div class="cand-sub">${h.stageLabel(p.stageIndex)} · age ${this._age(s, p)}</div>
            <div class="cand-tags"><span class="fam-tag" title="${h.esc(pers?.blurb || '')}"><b data-icon="mask"></b>${h.esc(pers?.name || '')}</span><span class="fam-tag"><b data-icon="root"></b>${h.esc(h.latinOnly(p.root?.name || ''))}</span></div>
            ${pers ? `<div class="cand-blurb">${h.esc(pers.blurb)}</div>` : ''}
            <button class="fa-pill gold" data-fa="court-pick" data-id="${h.esc(p.id)}">Court</button></div>`
        }).join('')}</div>
        <div class="fc-foot"><button class="fa-quiet" data-fa="court-withdraw">Send the matchmaker away</button></div></section>`
    }
    const t = c.target, pers = this._persona(t.personality)
    const pc = gs.proposeChance(), cp = gs.canPropose(), cm = gs.canMeet()
    const beat = c.beat ? gs.courtBeatDef(c.beat) : null
    const pips = Array.from({ length: COURT_BEATS_TO_PROPOSE }, (_, i) => `<i class="${i < c.meetings ? 'on' : ''}"></i>`).join('')
    return `<section class="fam-card court">
      <div class="fc-head"><span class="fc-glyph" data-icon="bond"></span><div class="fc-id"><div class="fc-name">Courting ${this._name(t)}</div>
        <div class="fc-sub">${h.stageLabel(t.stageIndex)} · age ${this._age(s, t)}</div>
        ${pers ? `<div class="fc-tags"><span class="fam-tag" title="${h.esc(pers.blurb)}"><b data-icon="mask"></b>${h.esc(pers.name)}</span></div>` : ''}</div></div>
      <div class="fc-aff static${beat ? ' compact' : ''}">
        <span class="fa-row"><span class="fa-k">Interest</span><span class="fa-v">${Math.round(c.interest)}</span><span class="court-pips" title="Meetings before you may propose">${pips}</span></span>
        <span class="fam-bar"><i class="tone-rose" data-w="${Math.round(c.interest)}"></i></span>
        ${pers && !beat ? `<span class="fa-last">${h.esc(pers.blurb)}</span>` : ''}
      </div>
      ${!beat && c.lastResult ? `<div class="court-last"><b>${h.esc(c.lastResult.title)}</b> ${h.esc(c.lastResult.text)}
        ${c.lastResult.delta ? `<span class="${c.lastResult.delta > 0 ? 'up' : 'down'}">interest ${this._signed(c.lastResult.delta)}</span>` : '<span class="dim">interest unmoved</span>'}</div>` : ''}
      ${beat ? `<div class="court-beat">
          <div class="cb-title">${h.esc(beat.title)}</div>
          <div class="cb-text">${h.esc(gs.courtText(beat.text))}</div>
          <div class="cb-choices">${beat.choices.map((ch, i) => {
            const cost = gs.familyCost(ch), way = COURT_WAYS[ch.way]
            const sub = [way ? h.esc(way.hint) : '', cost ? `<span class="cost">${Icon('stone')} ${this._num(cost)}</span>` : ''].filter(Boolean).join(' · ')
            return `<button class="fa-btn cb-choice" data-fa="court-answer" data-i="${i}" ${s.spiritStones < cost ? 'disabled' : ''}>
              <span class="fa-g">${Icon.g(way ? way.glyph : 'bond')}</span><span class="fa-t"><span class="fa-n">${h.esc(gs.courtText(ch.label))}</span><span class="fa-e">${sub}</span></span></button>`
          }).join('')}</div></div>`
      : `<div class="fa-grid two">
          ${this._act('court-meet', 'tea', 'Arrange a meeting', cm, this._eff([['see what they make of you', 'dim']]))}
          <div class="fa-split">
            ${cp.ok ? `<button class="fa-btn propose" data-fa="court-propose"><span class="fa-g" data-icon="rings"></span><span class="fa-t"><span class="fa-n">Propose</span><span class="fa-e"><span class="up">ask for their hand</span></span></span></button>`
              : this._act('court-propose', 'rings', 'Propose', cp, '')}
            <button class="fa-why" data-bd="propose" title="Why these odds?"><b>${(pc.total * 100).toFixed(1)}%</b><span data-icon="why"></span></button>
          </div>
        </div>`}
      <div class="fc-foot"><button class="fa-quiet danger" data-fa="court-withdraw">Stop calling on ${h.esc(t.given)}</button></div>
    </section>`
  }

  _alone(s) {
    const f = s.family, h = this.h, sk = this.gs.canSeekMatch()
    const spurned = (f.spurned || []).length
    const seekBtn = sk.ok
      ? `<button class="fa-btn wide" data-fa="court-seek"><span class="fa-g" data-icon="bond"></span><span class="fa-t"><span class="fa-n">Seek a match</span><span class="fa-e">${this._eff([['meet three candidates', 'dim'], this._stoneBit(sk.cost)])}</span></span></button>`
      : this._act('court-seek', 'bond', 'Seek a match', sk, '', '', 'wide')
    return `<section class="fam-card alone">
      <div class="fc-head"><span class="fc-glyph dim" data-icon="person"></span><div class="fc-id"><div class="fc-name">No partner at your side</div>
        <div class="fc-sub">${this._kinLine()}Pay a matchmaker to find someone worth courting, wait for their offer, or leave it to the road (Roam → Explore).</div></div></div>
      ${f.proposal ? `<button class="fa-btn wide urgent" id="_matchmaker"><span class="fa-g" data-icon="bond"></span><span class="fa-t"><span class="fa-n">A matchmaker awaits</span><span class="fa-e">${f.proposal.suitors.length} offer${f.proposal.suitors.length === 1 ? '' : 's'} of marriage</span></span></button>` : ''}
      ${seekBtn}
      ${spurned ? `<div class="fc-hint">${spurned === 1 ? 'One suitor has' : `${spurned} suitors have`} refused you. The road is long; you may meet again.</div>` : ''}
    </section>`
  }

  // The family tree's door (user 2026-10-03): always on top of Family, with who is on it.
  _treeLink() {
    const c = this.gs.familyTreeInfo()?.counts
    if (!c) return ''
    const pl = (n, w, ws) => `${n} ${n === 1 ? w : ws}`
    const bits = [c.parents ? pl(c.parents, 'parent', 'parents') : '', c.siblings ? pl(c.siblings, 'sibling', 'siblings') : '',
      c.children ? pl(c.children, 'child', 'children') : ''].filter(Boolean)
    return `<button class="fa-btn wide fam-tree-link" data-fa="tree"><span class="fa-g">${Icon.g('lineage')}</span><span class="fa-t"><span class="fa-n">Family tree</span>
      <span class="fa-e">${bits.length ? bits.join(' · ') : 'your line, from your ancestors down'} · see it drawn</span></span></button>`
  }
  // The parents and siblings you do have, for the unwed card (it no longer says you walk alone).
  _kinLine() {
    const c = this.gs.familyTreeInfo()?.counts
    if (!c || (!c.parents && !c.siblings)) return ''
    const who = [c.parents ? (c.parents === 1 ? 'a parent' : 'your parents') : '', c.siblings ? `${c.siblings} sibling${c.siblings === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')
    return `You have ${who} (see the family tree), but no one of your own yet. `
  }

  _children(s) {
    const f = s.family, h = this.h, gs = this.gs
    const kids = f.children || []
    const home = kids.filter(c => c.alive && !c.estranged).sort((a, b) => a.bornYear - b.bornYear)
    const gone = kids.filter(c => !c.alive || c.estranged)
    const living = home.length, lost = kids.filter(c => !c.alive).length
    const best = this._bestRootIds(home)
    const cards = home.map(c => this._childCard(s, c, best.has(c.id))).join('')
    const empty = !kids.length ? `<div class="fam-empty">${f.spouse || f.lovers.length ? 'No children yet.' : 'No children. That begins with a partner.'}</div>` : ''
    return `<section class="fam-sec fam-kids">
      <div class="fam-sec-title"><span>Children</span><span class="fam-count">${living} at home${lost ? ` · ${lost} lost` : ''}${gone.length - lost ? ` · ${gone.length - lost} left` : ''}</span></div>
      ${empty}${cards ? `<div class="kid-grid">${cards}</div>` : ''}
      ${gone.length ? `<details class="fam-fold"><summary>Gone from the house · ${gone.length}</summary>${gone.map(c => {
        const age = Math.max(0, Math.floor((c.alive ? s.world.year : c.diedYear) - c.bornYear))
        return `<div class="fold-row">${this._name(c)} <span>${c.alive ? `left the clan in year ${c.leftYear}` : `died at ${age}`}</span></div>`
      }).join('')}</details>` : ''}
    </section>`
  }

  // The child(ren) at home with the highest spiritual root — "the kid with the highest potential". Only a
  // clear best is marked: if every child shares one root multiplier there is no highest, so nobody is crowned.
  _bestRootIds(home) {
    if (home.length < 2) return new Set()
    const mult = c => c.root?.mult ?? 1
    const max = Math.max(...home.map(mult))
    if (!home.some(c => mult(c) < max)) return new Set()
    return new Set(home.filter(c => mult(c) === max).map(c => c.id))
  }

  // Family Planning + what's on the way. Left column: it's about you and your partners, not the children you have.
  _plan(s) {
    const f = s.family, h = this.h
    const plans = [['ask', 'Ask me'], ['some', 'Few'], ['many', 'Many'], ['none', 'None']]
    const iv = CHILD_INTERVAL_BY_PLAN[f.planning]
    let planNote
    if (f.planning === 'ask') planNote = 'Every child is your choice: a partner will ask, or you can try.'
    else if (f.planning === 'none') planNote = 'No children, for now.'
    else planNote = `Left to fate: a child every ${iv[0]}–${iv[1]} years with each partner.`
    const next = f.spouse && f.planning !== 'ask' && f.planning !== 'none' && f.nextChildYear != null
      ? `<div class="fk-next">Next expected around year ${Math.ceil(f.nextChildYear)} <button class="fa-quiet" data-fa="postpone">Not this time</button></div>` : ''
    const expecting = f.expecting.filter(e => e.partnerId !== f.spouse?.id).map(e => {
      const p = [...f.lovers.map(l => l.person), ...f.formerSpouses].find(x => x.id === e.partnerId)
      return `<div class="fk-next">Expecting a child with ${p ? h.esc(p.given) : 'a former partner'} · due in year ${Math.ceil(e.dueYear)}</div>`
    }).join('')
    return `<section class="fam-sec fam-plan">
      <div class="fam-sec-title"><span>Children to come</span></div>
      <div class="fk-plan"><div class="set-seg">${plans.map(([v, l]) => `<button class="set-opt${f.planning === v ? ' active' : ''}" data-plan="${v}">${l}</button>`).join('')}</div>
        <div class="fk-note">${planNote}</div></div>
      ${next}${expecting}
    </section>`
  }

  _childCard(s, c, best = false) {
    const h = this.h, gs = this.gs, f = s.family
    const age = this._age(s, c), bl = h.bondLabel(c.bond ?? 50), ml = moralityLabel(c.morality ?? 0)
    const pers = this._persona(c.personality)
    const open = this.openChild === c.id
    const stage = age >= AWAKENING_AGE ? h.stageLabel(c.stageIndex) : c.xp > 0 ? 'Not yet awakened · a head start' : 'Not yet awakened'
    const heir = f.heirId === c.id
    const rootName = c.root ? h.latinOnly(c.root.name || '') : ''
    const rootChip = rootName ? `<span class="kid-root tone-${ROOT_TONE[c.root.type] || 'dim'}${best ? ' best' : ''}" title="${best ? 'Highest potential of your children — ' : ''}spiritual root · Qi and stage growth ×${c.root.mult}"><b data-icon="${best ? 'crown' : 'root'}"></b>${h.esc(rootName)} ×${c.root.mult}</span>` : ''
    const other = c.parents?.find(id => id !== s.self.id)
    const parent = other ? [f.spouse, ...f.formerSpouses, ...f.lovers.map(l => l.person)].find(p => p?.id === other) : null
    let acts = ''
    if (open) {
      const t = gs.childActionPreview(c.id, 'time'), te = gs.childActionPreview(c.id, 'teach'), g = gs.childActionPreview(c.id, 'gift'), tp = gs.childActionPreview(c.id, 'temper')   // Phase 14
      const ap = gs.abuseChildPreview(c.id)   // family-events.js: the mirror — you may raise a hand too
      const mor = n => n ? [`morality ${this._signed(n)}`, n > 0 ? 'up' : 'down'] : null
      // Phase 45 (sect-branches.md): a grown child may be taken into your sect for free, any time.
      const rp = s.ownSect?.founded && age >= AWAKENING_AGE ? gs.childRecruitPreview(c.id) : null
      const sectRow = rp ? `<div class="kid-sect-row"><button class="fa-quiet kid-sect${rp.ok ? '' : ' locked'}" data-fa="ch-sect" data-id="${h.esc(c.id)}" ${rp.ok ? '' : 'disabled'}>${Icon('disciple')}<span class="ks-txt"><span class="ks-t">${rp.ok ? 'Bring into the sect' : h.esc(this._lockText(rp))}</span>${rp.ok ? `<span class="ks-s">free · talent ${rp.talent}★</span>` : ''}</span></button></div>` : ''
      acts = `<div class="kid-rename-row"><button class="fa-quiet kid-rename" data-fa="ch-rename" data-id="${h.esc(c.id)}" title="Give this child a name">Rename</button></div>${sectRow}
      <div class="kid-acts">
        ${this._act('ch-time', 'heart', 'Spend time', t, this._eff([[`bond ${this._signed(t.bond)}`, t.bond >= 0 ? 'up' : 'down'], this._qiBit(t.qi)]), ` data-id="${h.esc(c.id)}"`)}
        ${this._act('ch-teach', 'scroll', 'Teach your art', te, this._eff([['progress', 'up'], te.bond ? [`bond ${this._signed(te.bond)}`, te.bond >= 0 ? 'up' : 'down'] : null, mor(te.morality), this._qiBit(te.qi)]), ` data-id="${h.esc(c.id)}"`)}
        ${this._act('ch-gift', 'stone', 'Give resources', g, this._eff([['progress', 'up'], [`bond ${this._signed(g.bond)}`, 'up'], mor(g.morality), this._stoneBit(g.stones)]), ` data-id="${h.esc(c.id)}"`)}
        ${this._act('ch-temper', 'shield', 'Temper their body', tp, this._eff([[`${BODY_TIERS[tp.bodyTier || 0]?.id || 'F'} · ${(tp.bodyXp || 0) % (tp.perTier || 3)}/${tp.perTier || 3} to the next`, 'up'], tp.bond ? [`bond ${this._signed(tp.bond)}`, tp.bond >= 0 ? 'up' : 'down'] : null, ['1 Beast Core', 'cost']]), ` data-id="${h.esc(c.id)}" title="A harder body adds fight power in tournaments and challenges"`)}
        ${this._act('ch-harsh', 'duel', 'Raise a hand', ap, this._eff([[`bond ${this._signed(ap.bond || 0)}`, 'down'], [`karma ${this._signed(ap.karma || 0)}`, 'down']]), ` data-id="${h.esc(c.id)}"`, 'grave')}
      </div>
      ${pers ? `<div class="kid-note">${h.esc(pers.blurb)}</div>` : ''}
      <div class="kid-meta">${parent ? `by ${h.esc(parent.given)} · ` : ''}${this._plural(c.raised?.time || 0, 'season')} together · ${this._plural(c.raised?.teach || 0, 'lesson')}</div>`
    }
    return `<div class="kid${open ? ' open' : ''}${heir ? ' heir' : ''}">
      <button class="kid-head" data-fa="ch-open" data-id="${h.esc(c.id)}">
        <span class="kid-name">${heir ? '<b class="kid-star" title="Named heir" data-icon="heir"></b>' : ''}${this._name(c)}</span>
        <span class="kid-age">${age}</span>
        <span class="kid-sub">${stage}</span>
        <span class="kid-foot">${rootChip}<span class="kid-tags">${pers ? `<span class="fam-tag"><b data-icon="mask"></b>${h.esc(pers.name)}</span>` : ''}<span class="fam-tag tone-${ml.tone}">${ml.word}</span>${c.trauma ? '<span class="fam-tag tone-red">Scarred</span>' : ''}${c.bodyTier ? `<span class="fam-tag" title="Body tier: fight power in tournaments and challenges"><b data-icon="shield"></b>${BODY_TIERS[c.bodyTier].id} body</span>` : ''}</span>
        <span class="kid-bond" title="Bond ${Math.round(c.bond ?? 50)} / 100"><span class="kid-bw tone-${bl.tone}">${bl.word}</span><span class="fam-bar thin"><i class="tone-${bl.tone}" data-w="${Math.round(c.bond ?? 50)}"></i></span><span class="kid-bn">${Math.round(c.bond ?? 50)}</span></span></span>
        <span class="kid-chev">${open ? '▴' : '▾'}</span>
      </button>${acts}</div>`
  }

  // A lover's ultimatum (NPC): "leave them / marry me, or let me go" — urgent, at the top like a wish.
  _ultimatum(s) {
    const f = s.family, h = this.h, l = (f.lovers || []).find(x => x.ultimatum)
    if (!l) return ''
    const r = this.gs.affairRisk(l.person.id), p = l.person
    return `<section class="fam-wish ult">
      <div class="fw-g" data-icon="alert"></div>
      <div class="fw-body">
        <div class="fw-title">${h.esc(p.given)} will not go on like this</div>
        <div class="fw-text">${f.spouse ? `"Leave ${h.esc(f.spouse.given)} for me, or let me go." It waits on you.` : '"Marry me, or let me go." It waits on you.'}</div>
        <div class="fa-grid ult-acts">
          ${this._act('ult-marry', f.spouse ? 'split' : 'rings', f.spouse ? `Leave ${h.esc(f.spouse.given)} for them` : 'Marry them', { ok: true },
            this._eff(f.spouse ? [[`divorce ${h.esc(f.spouse.given)}`, 'down'], [`wed ${h.esc(p.given)}`, 'up']] : [[`wed ${h.esc(p.given)}`, 'up']]), ` data-id="${h.esc(p.id)}"`, f.spouse ? 'grave' : '')}
          ${this._act('ult-let_go', 'unbond', 'Let them go', { ok: true },
            this._eff([[`${Math.round(r.scorn * 100)}% they won't go quietly`, r.scorn > 0.25 ? 'down' : 'dim'], [f.spouse && !r.tolerant ? `they may tell ${h.esc(f.spouse.given)}` : 'they may become your enemy', 'dim']]), ` data-id="${h.esc(p.id)}"`)}
          ${this._act('ult-one_more', 'age', 'One more season', { ok: true },
            this._eff([[`${AFFAIR_EXTEND_YEARS[0]}–${AFFAIR_EXTEND_YEARS[1]} more years`, 'dim'], r.exposed ? [`discovery ×${AFFAIR_HOT_DISCOVERY_MULT} meanwhile`, 'down'] : null]), ` data-id="${h.esc(p.id)}"`)}
        </div>
      </div></section>`
  }

  _loverCard(s, l) {
    const f = s.family, h = this.h, gs = this.gs, p = l.person
    const pers = this._persona(p.personality), r = gs.affairRisk(p.id)
    const cc = gs.coverCost()
    let risk
    if (!f.spouse) risk = '<span class="tone-dim">You are unmarried: there is no one to hide it from.</span>'
    else if (r.tolerant) risk = `<span class="tone-dim">${h.esc(f.spouse.given)} knows, and tolerates it.</span>`
    else risk = `Discovery: <b class="${r.perYear > 0.03 ? 'down' : ''}">${(r.perYear * 100).toFixed(1)}%</b> a year · <b>${Math.round(r.onChild * 100)}%</b> if a child is born${r.covered ? ` · tracks covered until year ${r.coverUntil}` : ''}${r.hot ? ' · <span class="down">people are talking</span>' : ''}`
    const id = ` data-id="${h.esc(p.id)}"`
    const tiles = []
    if (f.spouse && !r.tolerant) {
      tiles.push(this._act('lv-cover', 'veil', 'Cover your tracks', r.covered ? { ok: false, reason: 'cooldown', readyYear: r.coverUntil } : s.spiritStones < cc ? { ok: false, reason: 'stones' } : { ok: true },
        this._eff([[`discovery ×${COVER_DISCOVERY_MULT} for ${COVER_YEARS} years`, 'up'], this._stoneBit(cc)]), id))
      tiles.push(this._act('lv-confess', 'speech', 'Confess', f.duel || f.fight ? { ok: false, reason: 'duel' } : { ok: true },
        this._eff([['they forgive more often', 'up'], [`affection ${CONFESS_AFFECTION}`, 'down']]), id, 'grave'))
    }
    if (!f.spouse) tiles.push(this._act('lv-marry', 'rings', 'Make it official', { ok: true }, this._eff([['marry them', 'up']]), id))
    tiles.push(this._act('lv-end', 'unbond', 'End it', { ok: true },
      this._eff([[`${Math.round(r.scorn * 100)}% they won't go quietly`, r.scorn > 0.25 ? 'down' : 'dim']]), id))
    return `<section class="fam-card lover">
      <div class="fc-head"><span class="fc-glyph dim" data-icon="heart"></span><div class="fc-id"><div class="fc-name">${this._name(p)}</div>
        <div class="fc-sub">Your lover since year ${l.since} · ${h.stageLabel(p.stageIndex)}</div>
        ${pers ? `<div class="fc-tags"><span class="fam-tag" title="${h.esc(pers.blurb)}"><b data-icon="mask"></b>${h.esc(pers.name)}</span></div>` : ''}</div></div>
      <div class="lv-risk">${risk}</div>
      <div class="fa-grid">${tiles.join('')}</div>
    </section>`
  }

  _others(s) {
    const f = s.family, h = this.h
    let html = ''
    if ((f.formerSpouses || []).length) {
      html += `<details class="fam-fold"><summary>Former spouses · ${f.formerSpouses.length}</summary>${f.formerSpouses.map(x =>
        `<div class="fold-row">${this._name(x)} <span>${h.esc(h.endText[x.endCause] || 'gone')} · year ${x.endedYear}</span></div>`).join('')}</details>`
    }
    return html
  }

  _heir(s) {
    const f = s.family, h = this.h, gs = this.gs
    const heir = f.heirId ? f.children.find(c => c.id === f.heirId) : null
    const adults = gs.eligibleHeirs().length
    let pending = ''
    if (h.pendingKey(s)) pending = '<button id="_family-matter" class="fa-btn wide urgent"><span class="fa-g" data-icon="alert"></span><span class="fa-t"><span class="fa-n">A family matter awaits</span><span class="fa-e">It waits on your answer</span></span></button>'
    if (!gs.isClanHead() || !(adults || heir || f.tournament)) return pending ? `<section class="fam-sec">${pending}</section>` : ''
    return `<section class="fam-sec">${pending}
      <div class="fam-sec-title"><span>Heir</span><span class="fam-count">${adults} eligible</span></div>
      <div class="heir-line">${heir ? `<b class="kid-star" data-icon="heir"></b>${this._name(heir)}${heir.trauma ? ' <span class="tone-red">· forged in blood</span>' : ''}` : '<span class="dim">None named. If your path ends, the clan chooses.</span>'}</div>
      <div class="fa-grid">
        <button id="_choose-heir" class="fa-btn" ${adults && !f.tournament ? '' : 'disabled'}><span class="fa-g" data-icon="heir"></span><span class="fa-t"><span class="fa-n">Name an heir</span><span class="fa-e">from ${adults} adult ${adults === 1 ? 'child' : 'children'}</span></span></button>
        <button id="_tournament" class="fa-btn" ${f.tournament || adults >= 2 ? '' : 'disabled'}><span class="fa-g" data-icon="duel"></span><span class="fa-t"><span class="fa-n">${f.tournament ? 'Continue the tournament' : 'Tournament of Heirs'}</span><span class="fa-e">${f.tournament ? 'it waits on your pairings' : '<span class="down">to the death, until four remain</span>'}</span></span></button>
      </div></section>`
  }

  // ── clicks ──────────────────────────────────────────────────────────────────
  _click(e) {
    const b = e.target.closest('[data-fa]')
    if (!b || b.disabled) return
    const gs = this.gs, h = this.h, id = b.dataset.id
    const s = gs.get(), f = s.family
    switch (b.dataset.fa) {
      case 'tree': h.go?.('tree'); break   // the family tree (family-tree.js)
      case 'wish-yes': gs.answerChildWish(true); break
      case 'wish-no':  gs.answerChildWish(false); break
      case 'sp-time':  gs.spouseAction('time'); break
      case 'sp-gift':  gs.spouseAction('gift'); break
      case 'sp-dual': {
        const r = gs.spouseAction('dual')
        if (r.ok) h.flash(r.deviation ? 'The Qi turns on you both.' : 'Two paths, one breath.', r.deviation ? 'negative' : 'positive')
        break
      }
      case 'sp-child': gs.tryForChild(); break
      case 'sp-separate':
        h.confirm(`Separate from ${f.spouse.given}?`, `The marriage ends. Children you share take it hard (bond ${SEPARATE_CHILD_BOND}).`, () => gs.separateFromSpouse(), 'Separate')
        break
      case 'postpone': gs.postponeChild(); break
      case 'court-seek': gs.seekMatch(); break
      case 'court-pick': gs.courtTarget(id); break
      case 'court-meet': if (gs.meetTarget().ok) this.el.querySelector('.court-beat')?.scrollIntoView({ block: 'nearest' }); break
      case 'court-answer': gs.resolveCourtBeat(+b.dataset.i); break
      case 'court-propose': {
        const r = gs.propose()
        if (r.ok) h.flash(r.accepted ? `${Persons.fullName(r.spouse)} says yes.` : 'They decline, gently.', r.accepted ? 'special' : 'negative')
        break
      }
      case 'court-withdraw': gs.withdrawCourtship(); break
      case 'ch-open': this.openChild = this.openChild === id ? null : id; this.render(gs.get()); break
      case 'ch-time':  gs.childAction(id, 'time'); break
      case 'ch-teach': gs.childAction(id, 'teach'); break
      case 'ch-gift':  gs.childAction(id, 'gift'); break
      case 'ch-temper': gs.childAction(id, 'temper'); break   // Phase 14
      case 'ch-harsh': {   // family-events.js: the mirror of "A father's hand" — a deliberate act, confirmed
        const kid = gs.get().family.children.find(x => x.id === id)
        h.confirm(`Raise a hand to ${kid?.given || 'your child'}?`, 'They will remember it. Your karma will too.', () => {
          const r = gs.abuseChild(id)
          if (r.ok) h.flash(`${kid?.given || 'Your child'} will remember this.`, 'negative')
        }, 'Strike')
        break
      }
      case 'ch-sect': {   // Phase 45: bring a grown child into your sect — free and instant
        const r = gs.recruitChild(id)
        if (r.ok) h.flash(`${r.disciple.name} joins your sect as a disciple.`, 'special')
        else h.flash({ full: 'Every hall seat is taken — raise the Sect Hall', joined: 'They are already a disciple', young: 'They are too young yet' }[r.reason] || 'Not now', 'negative')
        break
      }
      case 'ch-rename': {   // name/rename your own child — the shared name box (same as the cultivator's own)
        const kid = f.children.find(x => x.id === id)
        h.rename(kid?.given || '', v => {
          const r = gs.renameChild(id, v)
          if (r.ok && !r.unchanged) h.flash(`Named ${r.given}.`, 'special')
        }, 16)
        break
      }
      // 1.8b-3b: affairs
      case 'lv-cover':   gs.coverTracks(id); break
      case 'lv-marry':   gs.marryLover(id); break
      case 'lv-confess': {
        const p = f.lovers.find(l => l.person.id === id)?.person
        h.confirm(`Confess to ${f.spouse.given}?`, `You tell them everything about ${p?.given || 'your lover'}. They forgive more often than if they found out, but they may not.`, () => {
          const r = gs.confessAffair(id); if (r.ok) h.flash(r.accepted ? 'They forgive you. It is not mentioned again.' : 'It did not go the way you hoped.', r.accepted ? 'positive' : 'negative')
        }, 'Confess')
        break
      }
      case 'lv-end': h.confirm('End the affair?', 'Children already born stay yours. Some lovers do not go quietly.', () => {
        const r = gs.endAffair(id); if (r.scorned) h.flash(r.told ? 'They went straight to your spouse.' : 'They swear you will regret this.', 'negative')
      }, 'End It'); break
      case 'ult-marry': case 'ult-let_go': case 'ult-one_more': gs.answerLoverUltimatum(id, b.dataset.fa.slice(4)); break
    }
  }
}
