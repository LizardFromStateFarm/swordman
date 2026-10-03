// FamilyTreeView — Kin → Tree (user 2026-10-03: "add a family tree to the family tab, like an actual tree; it can have
// its own page but make sure there's a button to see it on the family tab"). Reads gameState.familyTreeInfo() (read-only):
// your blood by generation — up to three generations of ancestors, you with your siblings and partners, your children
// with theirs, your grandchildren. Rows are drawn as person nodes; an SVG layer draws the lines (a couple's bar, and an
// elbow from each couple down to their children). Tap anyone for their card; a spouse or a child at home links to
// their actions on Kin → Family; a past life links to the Ancestral Hall. Pane: #tab-tree. docs/systems/family.md → "Family tree".

const FT_GEN_NAME = { '-3': 'Great-grandparents', '-2': 'Grandparents', '-1': 'Parents', 0: 'Your generation', 1: 'Children', 2: 'Grandchildren' }

class FamilyTreeView {
  // h: { esc, stageLabel, latinOnly, causeText, go(view), openOnFamily(id) }
  constructor(gameState, h) {
    this.gs = gameState
    this.h = h
    this.el = document.getElementById('tab-tree')
    this.sel = null          // the person whose card is open (null = you)
    this.el.addEventListener('click', e => this._click(e))
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this._lines()) : null
  }

  render(s) {
    const T = this.gs.familyTreeInfo()
    if (!T) { this.el.innerHTML = '<div class="empty-note">No family yet.</div>'; return }
    this.T = T
    const byId = new Map(T.nodes.map(n => [n.id, n]))
    if (!byId.has(this.sel)) this.sel = T.selfId
    const rows = this._rows(T, byId)
    const gens = Object.keys(rows).map(Number).sort((a, b) => a - b)
    const c = T.counts
    const sum = [c.parents ? `${c.parents} parent${c.parents === 1 ? '' : 's'}` : 'no parents known',
      `${c.siblings} sibling${c.siblings === 1 ? '' : 's'}`, `${c.children} child${c.children === 1 ? '' : 'ren'}`].join(' · ')
    this.el.innerHTML = `<div class="ft-view">
      <div class="ft-head"><div class="ft-title">${T.clanName ? `The ${this.h.esc(T.clanName)} line` : 'Your blood'}</div>
        <div class="ft-sum">${sum} · year ${T.year}</div>
        <button class="fa-quiet ft-back" data-ft="family">${Icon('back')} Family</button></div>
      ${this.sel === T.selfId ? this._youLine(byId.get(T.selfId)) : this._card(byId.get(this.sel))}
      <div class="ft-scroll"><div class="ft-canvas">
        <svg class="ft-lines" aria-hidden="true"></svg>
        ${gens.map(g => `<div class="ft-row" data-gen="${g}"><div class="ft-gen">${FT_GEN_NAME[g] || ''}</div>
          <div class="ft-nodes">${rows[g].map(n => this._node(n)).join('')}</div></div>`).join('')}
      </div></div>
      <div class="ft-key"><span><i class="k-alive"></i>living</span><span><i class="k-dead"></i>passed on</span><span><i class="k-life"></i>a past life of yours</span>
        <span>${Icon('heir')} heir</span><span>${Icon('crown')} clan head</span></div>
      ${this._otherLives(T)}
    </div>`
    this._ro?.disconnect()
    const canvas = this.el.querySelector('.ft-canvas')
    if (canvas && this._ro) this._ro.observe(canvas)
    requestAnimationFrame(() => { this._lines(); this._center() })
  }

  // Order each generation so children sit under their parents and partners sit side by side.
  _rows(T, byId) {
    const rows = {}, put = n => { (rows[n.gen] ||= []).includes(n) || rows[n.gen].push(n) }
    const me = byId.get(T.selfId)
    // Ancestors: a pedigree — each row is the parents of the row below, in order
    let below = [me]
    for (let g = -1; g >= -3; g--) {
      const row = []
      for (const c of below) for (const pid of c.parents) { const p = byId.get(pid); if (p && p.gen === g && !row.includes(p)) row.push(p) }
      if (!row.length) break
      row.forEach(put); below = row
    }
    // Your generation: older siblings · you · your partners · younger siblings
    const sibs = T.nodes.filter(n => n.gen === 0 && /sibling/i.test(n.rel))
    const partners = T.nodes.filter(n => n.gen === 0 && ['Spouse', 'Former spouse', 'Lover'].includes(n.rel))
    const older = sibs.filter(n => n.age > me.age || (n.age === me.age && n.id < me.id)), younger = sibs.filter(n => !older.includes(n))
    ;[...older, me, ...partners.sort((a, b) => (a.former ? 1 : 0) - (b.former ? 1 : 0)), ...younger].forEach(put)
    // Children grouped by their other parent (in the partner order above), each followed by their own partner
    const kids = T.nodes.filter(n => n.rel === 'Child')
    const order = p => { const o = p.parents.find(x => x !== T.selfId); const i = partners.findIndex(x => x.id === o); return i < 0 ? 99 : i }
    for (const k of [...kids].sort((a, b) => order(a) - order(b))) {
      put(k)
      T.nodes.filter(n => n.partnerOf === k.id).forEach(put)
    }
    // Grandchildren under their parent, in the child order
    const kidOrder = new Map((rows[1] || []).map((n, i) => [n.id, i]))
    T.nodes.filter(n => n.gen === 2).sort((a, b) => Math.min(...a.parents.map(p => kidOrder.get(p) ?? 99)) - Math.min(...b.parents.map(p => kidOrder.get(p) ?? 99))).forEach(put)
    return rows
  }

  _node(n) {
    const h = this.h
    const cls = ['ft-node', n.alive ? '' : 'dead', n.you ? 'you' : '', n.pastLife ? 'life' : '', n.former ? 'former' : '', n.estranged ? 'estranged' : '', n.id === this.sel ? 'sel' : ''].filter(Boolean).join(' ')
    const marks = `${n.head ? `<b class="ft-mark gold" title="Head of the clan">${Icon('crown')}</b>` : ''}${n.heir ? `<b class="ft-mark gold" title="Your named heir">${Icon('heir')}</b>` : ''}`
    const sub = n.alive ? `${n.age >= (typeof AWAKENING_AGE !== 'undefined' ? AWAKENING_AGE : 6) ? h.stageLabel(n.stage) : 'not yet awakened'}` : `d. year ${n.diedYear ?? '?'}`
    return `<button class="${cls}" data-ft="pick" data-id="${h.esc(n.id)}"${n.parents.length ? ` data-parents="${h.esc(n.parents.join(','))}"` : ''}${n.partnerOf ? ` data-partner="${h.esc(n.partnerOf)}"` : ''}>
      <span class="ft-rel" title="${n.pastLife ? `Your past life no. ${n.pastLife}` : ''}">${n.pastLife ? `Past life ${n.pastLife}` : h.esc(n.rel)}${marks}</span>
      <span class="ft-name">${h.esc(n.name)}</span>
      <span class="ft-sub">${n.alive ? `${n.age} · ` : ''}${h.esc(sub)}</span></button>`
  }

  // Until you tap someone: one quiet line, so the tree itself is on the first screen
  _youLine(n) {
    return `<div class="ft-you">${Icon('person')}<span><b>${this.h.esc(n.name)}</b> · ${this.h.esc(this.h.stageLabel(n.stage))} · tap anyone on the tree to see them</span></div>`
  }

  // The card for whoever is picked: who they are to you, and what you can do from here.
  _card(n) {
    if (!n) return ''
    const h = this.h, bits = []
    bits.push(n.alive ? `${n.age} years old` : `passed on in year ${n.diedYear ?? '?'}${n.cause ? ` · ${h.esc(h.causeText(n.cause) || n.cause)}` : ''}`)
    bits.push(n.you ? h.stageLabel(n.stage) : n.alive ? h.stageLabel(n.stage) : `reached ${h.stageLabel(n.stage)}`)
    if (n.personality) bits.push(h.esc(n.personality))
    if (n.rootName) bits.push(`${h.esc(h.latinOnly(n.rootName))}${n.rootMult ? ` ×${n.rootMult}` : ''}`)
    const tags = []
    if (n.bond != null) tags.push(`<span class="fam-tag tone-${n.bond >= 60 ? 'jade' : n.bond < 30 ? 'red' : ''}">bond ${Math.round(n.bond)}</span>`)
    if (n.affection != null) tags.push(`<span class="fam-tag tone-${n.affection >= 60 ? 'jade' : n.affection < 30 ? 'red' : ''}">affection ${Math.round(n.affection)}</span>`)
    if (n.morality != null && !n.you) tags.push(`<span class="fam-tag">${n.morality >= 40 ? 'Righteous' : n.morality >= 10 ? 'Upright' : n.morality > -10 ? 'Pragmatic' : n.morality > -40 ? 'Callous' : 'Ruthless'}</span>`)
    if (n.pastLife) tags.push(`<span class="fam-tag tone-gold">your ${n.pastLife === 1 ? 'first' : `life no. ${n.pastLife}`}</span>`)
    if (n.ascended) tags.push('<span class="fam-tag tone-gold">Ascended Ancestor</span>')
    if (n.estranged) tags.push('<span class="fam-tag tone-red">left the clan</span>')
    const act = n.open === 'child' || n.open === 'spouse' || n.open === 'lover'
      ? `<button class="fa-btn ft-go" data-ft="open" data-id="${h.esc(n.id)}"><span class="fa-g">${Icon.g(n.open === 'child' ? 'child' : 'heart')}</span><span class="fa-t"><span class="fa-n">${n.open === 'child' ? 'Raise them' : 'Be with them'}</span><span class="fa-e">on Kin → Family</span></span></button>`
      : n.pastLife ? `<button class="fa-btn ft-go" data-ft="hall"><span class="fa-g">${Icon.g('lineage')}</span><span class="fa-t"><span class="fa-n">The Ancestral Hall</span><span class="fa-e">their record and epitaph</span></span></button>` : ''
    return `<section class="fam-card ft-card${n.alive ? '' : ' dead'}"><div class="fc-head"><span class="fc-glyph" data-icon="${n.you ? 'person' : n.gen < 0 ? 'lineage' : n.gen > 0 ? 'child' : 'couple'}"></span>
      <div class="fc-id"><div class="fc-name">${h.esc(n.name)}</div><div class="fc-sub">${n.you ? 'You' : h.esc(n.rel)} · ${bits.join(' · ')}</div>
      ${tags.length ? `<div class="fc-tags">${tags.join('')}</div>` : ''}</div>${act}</div></section>`
  }

  _otherLives(T) {
    if (!T.otherLives.length) return ''
    const h = this.h
    return `<section class="fam-sec ft-others"><div class="fam-sec-title"><span>Earlier lives outside this line</span><span class="fam-count">${T.otherLives.length}</span></div>
      ${T.otherLives.map(l => `<div class="fold-row">${h.esc(l.name)} <span>life no. ${l.gen} · reached ${h.esc(h.stageLabel(l.stage))} · year ${l.year}${l.ascended ? ' · Ascended' : ''}</span></div>`).join('')}</section>`
  }

  // Lines: a bar between partners side by side, and an elbow from each couple (or single parent) to each child.
  _lines() {
    const canvas = this.el.querySelector('.ft-canvas'), svg = canvas?.querySelector('.ft-lines')
    if (!svg || !canvas.offsetParent) return
    const cr = canvas.getBoundingClientRect()
    svg.setAttribute('width', canvas.scrollWidth); svg.setAttribute('height', canvas.scrollHeight)
    const box = id => { const e = canvas.querySelector(`.ft-node[data-id="${CSS.escape(id)}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left - cr.left, r: r.right - cr.left, t: r.top - cr.top, b: r.bottom - cr.top, cx: (r.left + r.right) / 2 - cr.left, cy: (r.top + r.bottom) / 2 - cr.top } }
    const paths = []
    const T = this.T, byId = new Map(T.nodes.map(n => [n.id, n]))
    // partner bars: you and your partners; a child and their spouse; two parents of the same child
    const bar = (a, b, dashed) => { const A = box(a), B = box(b); if (!A || !B || Math.abs(A.cy - B.cy) > 4) return
      const [L, R] = A.cx < B.cx ? [A, B] : [B, A]; paths.push(`<path class="ft-ln${dashed ? ' dash' : ''}" d="M${L.r} ${L.cy}H${R.l}"/>`) }
    for (const n of T.nodes) {
      if (['Spouse', 'Former spouse', 'Lover'].includes(n.rel)) bar(T.selfId, n.id, n.former)
      if (n.partnerOf) bar(n.partnerOf, n.id, false)
    }
    const seenPair = new Set()
    for (const n of T.nodes) if (n.parents.length === 2) { const k = [...n.parents].sort().join('|'); if (!seenPair.has(k) && byId.has(n.parents[0]) && byId.has(n.parents[1]) && byId.get(n.parents[0]).gen < n.gen) { seenPair.add(k); bar(n.parents[0], n.parents[1], false) } }
    // descent: from the parents' midpoint (bottom) down to a bus, then to each child's top
    const groups = new Map()
    for (const n of T.nodes) {
      const ps = n.parents.filter(p => byId.has(p) && byId.get(p).gen === n.gen - 1)
      if (!ps.length) continue
      const k = [...ps].sort().join('|');
      (groups.get(k) || groups.set(k, { ps, kids: [] }).get(k)).kids.push(n.id)
    }
    for (const { ps, kids } of groups.values()) {
      const P = ps.map(box).filter(Boolean), K = kids.map(box).filter(Boolean)
      if (!P.length || !K.length) continue
      const x0 = P.length === 2 ? (P[0].cx + P[1].cx) / 2 : P[0].cx
      const y0 = P.length === 2 ? P[0].cy : Math.max(...P.map(p => p.b))
      const top = Math.min(...K.map(k => k.t)), mid = Math.max(...P.map(p => p.b)) + (top - Math.max(...P.map(p => p.b))) / 2
      const xs = [x0, ...K.map(k => k.cx)], lo = Math.min(...xs), hi = Math.max(...xs)
      paths.push(`<path class="ft-ln" d="M${x0} ${y0}V${mid}M${lo} ${mid}H${hi}${K.map(k => `M${k.cx} ${mid}V${k.t}`).join('')}"/>`)
    }
    svg.innerHTML = paths.join('')
  }

  // Bring you into view (wide trees scroll sideways in Overlay / on a phone)
  _center() {
    const sc = this.el.querySelector('.ft-scroll'), me = this.el.querySelector('.ft-node.you')
    if (!sc || !me || sc.scrollWidth <= sc.clientWidth) return
    sc.scrollLeft = Math.max(0, me.offsetLeft + me.offsetWidth / 2 - sc.clientWidth / 2)
  }

  _click(e) {
    const b = e.target.closest('[data-ft]')
    if (!b) return
    const a = b.dataset.ft
    if (a === 'pick') {
      this.sel = b.dataset.id
      const keep = this.el.querySelector('.ft-scroll')?.scrollLeft || 0
      this.render(this.gs.get())
      const sc = this.el.querySelector('.ft-scroll'); if (sc) requestAnimationFrame(() => { sc.scrollLeft = keep })
    } else if (a === 'open') this.h.openOnFamily(b.dataset.id)
    else if (a === 'hall') this.h.go('hall')
    else if (a === 'family') this.h.go('family')
  }
}
