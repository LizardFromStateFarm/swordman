// ArtsView — Path → Arts (Phase 42, task 1.12; docs/systems/arts.md → "UX pass"). Left: the breakthrough offer (pick 1 of
// 3), the study desk (the manual under study with a live countdown, or the manuals waiting in your pack) and the loadout
// (4 move slots as a 2×2 grid + passive slots, locked ones naming the realm that opens them). Right: the library — every
// art you know or hold a manual for, filterable by kind/element, "N of M found". Click a slot → the library filters to
// that kind and each art offers "Equip here". State comes from gameState.artsInfo() / artStats() / artStudyLock(); every
// change goes through gameState (studyArt, cancelStudy, chooseArtOffer, setArtSlot). h: { esc, flash, fmtTime }.

const ArtsView = {
  pick: null,                        // { kind: 'move' | 'passive', index } while choosing for a slot
  filter: { kind: 'all', el: 'all' },
  open: null,                        // the library row expanded
  _wired: false,

  realm(i) { return typeof stageShortName === 'function' ? stageShortName(i) : 'stage ' + i },
  elIcon(e) { return Icon(ART_ELEMENTS[e]?.icon || 'el_neutral') },
  pips(n) { return `<span class="art-pips" title="Mastery ${n} of ${ART_MASTERY_MAX}">${Array.from({ length: ART_MASTERY_MAX }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>` },
  // One line of numbers: grade · kind · Qi cost · power (moves) or the passive's effect
  meta(gs, id, desc = false) {
    const st = gs.artStats(id), a = st.art, g = ART_RARITY[a.rarity].name
    if (a.kind !== 'move') return desc ? `${g} · Passive · ${a.passive.desc}` : `${g} · Passive`
    const m = a.move, parts = [`${g} · ${m.type === 'multi' ? `${m.hits}-hit` : m.type}`, `${st.cost} Qi`]
    if (m.power) parts.push(`${m.hits ? `${st.power}×${m.hits}` : st.power} power`)
    if (m.priority) parts.push('strikes first')
    return parts.join(' · ')
  },
  studyLockText(s, gs, id) {
    const lock = gs.artStudyLock(id), a = ARTS[id]
    return lock === 'stage' ? `Too profound: opens at ${this.realm(a.minStage)}` : lock === 'busy' ? 'You are studying another manual'
      : lock === 'maxed' ? 'Mastered: sell the spare manual' : ''
  },

  render(s, el, gs, h) {
    this.gs = gs; this.h = h; this.el = el
    if (!this._wired) { el.addEventListener('click', e => this._click(e)); this._wired = true }
    const esc = h.esc, info = gs.artsInfo()
    if (this.pick && s.family?.fight) this.pick = null

    // ── the breakthrough offer ──
    const offers = info.offers.map(o => `<section class="art-offer">
      <div class="art-offer-h">${Icon('breakthrough')}<span><b>Breakthrough insight</b> · ${esc(o.realm)}</span></div>
      <div class="art-offer-sub">Breaking through, you glimpse three arts. Keep one; the others fade back into the Dao. It waits for you.</div>
      <div class="art-offer-row">${o.options.map(id => { const a = ARTS[id]; return `<div class="art-card el-${a.element}">
        <div class="art-card-h">${this.elIcon(a.element)}<span class="art-n r-${a.rarity}">${esc(a.name)}</span></div>
        <div class="art-meta">${esc(this.meta(gs, id))}</div>
        <div class="art-desc">${esc(a.move?.desc || a.passive.desc)}</div>
        <button class="art-btn gold" data-offer="${o.id}" data-art="${id}">Keep this art</button></div>` }).join('')}</div></section>`).join('')

    // ── the study desk ──
    const held = Object.keys(s.inventory).filter(k => k.startsWith('manual_') && s.inventory[k] > 0).map(k => k.slice(7)).filter(id => ARTS[id])
    let desk
    if (info.study) {
      const a = ARTS[info.study.artId], total = (info.study.endsAt - info.study.startedAt) / 1000, left = Math.max(0, Math.ceil((info.study.endsAt - Date.now()) / 1000))
      desk = `<div class="art-study on">${Icon('scroll')}<div class="art-study-t"><div class="art-k">Studying</div>
        <div class="art-study-n">${this.elIcon(a.element)}<span class="r-${a.rarity}">${esc(a.name)}</span>${info.known[a.id] ? ' <span class="art-dim">(to deepen it)</span>' : ''}</div>
        <div class="art-bar"><b data-arts-bar="${info.study.startedAt}:${info.study.endsAt}" style="width:${Math.min(100, 100 * (1 - left / total)).toFixed(1)}%"></b></div>
        <div class="art-dim"><span data-arts-left="${info.study.endsAt}">${h.fmtTime(left)}</span> left · study goes on while the game is closed</div></div>
        <button class="art-btn quiet" data-cancel-study title="The manual goes back in your pack">Stop</button></div>`
    } else {
      const ready = held.filter(id => !gs.artStudyLock(id))
      desk = `<div class="art-study">${Icon('scroll')}<div class="art-study-t"><div class="art-k">Study desk</div>
        ${ready.length ? `<div class="art-dim">${ready.length} manual${ready.length === 1 ? '' : 's'} ready to study:</div><div class="art-ready">${ready.slice(0, 4).map(id =>
          `<button class="art-btn" data-study="${id}">${this.elIcon(ARTS[id].element)}${esc(ARTS[id].name)} · ${h.fmtTime(gs.artStudySeconds(id))}</button>`).join('')}</div>`
        : `<div class="art-dim">No manual to study. Manuals turn up on expeditions, on beasts you slay and as Arena prizes; each new realm offers an art of its own.</div>`}
        ${(s.comprehension || 0) > 0 ? `<div class="art-dim">Comprehension ${s.comprehension}: study is ${Math.round((1 - gs.artStudySeconds('autumn_blade_qi') / ART_RARITY.yellow.studySeconds) * 100)}% faster.</div>` : ''}</div></div>`
    }

    // ── loadout ──
    const slot = (kind, i, id, locked) => {
      const picking = this.pick?.kind === kind && this.pick.index === i
      if (locked) return `<div class="art-slot locked" title="Opens at ${esc(this.realm(locked))}">${Icon('lock')}<span>Opens at ${esc(this.realm(locked))}</span></div>`
      if (!id) return `<button class="art-slot empty${picking ? ' picking' : ''}" data-slot="${kind}:${i}"><span class="art-slot-e">${picking ? 'Choose from the library' : kind === 'move' ? 'Empty · choose a move' : 'Empty · choose a passive'}</span></button>`
      const a = ARTS[id], k = info.known[id]
      return `<div class="art-slot el-${a.element}${picking ? ' picking' : ''}"><button class="art-slot-b" data-slot="${kind}:${i}" title="Swap this ${kind}">
        <span class="art-card-h">${this.elIcon(a.element)}<span class="art-n r-${a.rarity}">${esc(a.name)}</span></span>
        <span class="art-meta">${esc(this.meta(gs, id, true))}</span>${this.pips(k?.mastery || 1)}</button>
        <button class="art-x" data-clear="${kind}:${i}" title="Empty this slot" aria-label="Empty this slot">${Icon('close')}</button></div>`
    }
    const pslots = Array.from({ length: ART_PASSIVE_SLOTS_MAX }, (_, i) => {
      const open = i < info.passiveSlots
      const opensAt = open ? null : ART_PASSIVE_SLOTS.find(x => x.slots > i)?.stage
      return slot('passive', i, info.loadout.passives[i], opensAt)
    }).join('')
    const loadout = `<section class="art-sec"><div class="art-sec-h"><span>Moves</span><span class="art-dim">${info.loadout.moves.filter(Boolean).length} of ${ART_MOVE_SLOTS}</span></div>
        <div class="art-moves">${info.loadout.moves.map((id, i) => slot('move', i, id)).join('')}</div>
        <div class="art-sec-h"><span>Passives</span><span class="art-dim">${info.passiveSlots} slot${info.passiveSlots === 1 ? '' : 's'} open${info.nextSlot ? ` · the next opens at ${esc(this.realm(info.nextSlot.stage))}` : ''}</span></div>
        <div class="art-passives">${pslots}</div>
        <div class="art-note">${Icon('sword')}Battles still use Press / Guard / Feint for now. These moves take the field when combat learns the new arts.</div></section>`

    // ── library ──
    const ids = [...new Set([...Object.keys(info.known), ...held])]
      .filter(id => this.filter.kind === 'all' || ARTS[id].kind === this.filter.kind)
      .filter(id => this.filter.el === 'all' || ARTS[id].element === this.filter.el)
      .filter(id => !this.pick || (ARTS[id].kind === this.pick.kind && info.known[id]))   // picking: only arts you can equip
      .sort((x, y) => ART_RARITY_ORDER.indexOf(ARTS[y].rarity) - ART_RARITY_ORDER.indexOf(ARTS[x].rarity) || ARTS[x].name.localeCompare(ARTS[y].name))
    const equippedAt = id => { const m = info.loadout.moves.indexOf(id), p = info.loadout.passives.indexOf(id); return m >= 0 ? `move slot ${m + 1}` : p >= 0 ? `passive slot ${p + 1}` : '' }
    const rows = ids.map(id => {
      const a = ARTS[id], k = info.known[id], n = s.inventory['manual_' + id] || 0, open = this.open === id, at = equippedAt(id)
      let act = ''
      if (this.pick && k) act = `<button class="art-btn gold" data-equip="${id}">${at ? 'Move here' : 'Equip here'}</button>`
      else if (!k && n) { const lock = this.studyLockText(s, gs, id); act = lock ? `<span class="art-lock">${Icon('lock')}${esc(lock)}</span>` : `<button class="art-btn" data-study="${id}">Study · ${h.fmtTime(gs.artStudySeconds(id))}</button>` }
      const tags = [k ? '' : '<span class="art-tag" title="You hold its manual but have not studied it yet">not yet learned</span>', at ? `<span class="art-tag on">${at}</span>` : '', n && k ? `<span class="art-tag">+${n} manual${n === 1 ? '' : 's'}</span>` : ''].join('')
      const detail = open ? `<div class="art-row-d"><div class="art-desc">${esc(a.move?.desc || a.passive.desc)}</div><div class="art-lore">${esc(a.lore)}</div>
        <div class="art-dim">${ART_ELEMENTS[a.element].name}${ART_ELEMENTS[a.element].status ? ` · its ailment is ${ART_STATUS[ART_ELEMENTS[a.element].status].name}` : ''} · studied from ${this.realm(a.minStage)}${a.sig ? ` · signature art` : ''}</div>
        ${k && n && !gs.artStudyLock(id) ? `<button class="art-btn" data-study="${id}">Study the spare manual · mastery ${k.mastery + 1}</button>` : ''}
        ${k && !this.pick ? `<div class="art-equip-row">${a.kind === 'move' ? info.loadout.moves.map((_, i) => `<button class="art-btn" data-put="move:${i}:${id}">Move slot ${i + 1}</button>`).join('')
          : Array.from({ length: info.passiveSlots }, (_, i) => `<button class="art-btn" data-put="passive:${i}:${id}">Passive slot ${i + 1}</button>`).join('')}</div>` : ''}</div>` : ''
      return `<div class="art-row el-${a.element}${open ? ' open' : ''}${k ? '' : ' unknown'}">
        <button class="art-row-m" data-open="${id}">${this.elIcon(a.element)}<span class="art-row-t"><span class="art-n r-${a.rarity}">${esc(a.name)}</span>
          <span class="art-meta">${esc(this.meta(gs, id, true))}</span></span>${k ? this.pips(k.mastery) : ''}</button>
        <div class="art-row-a">${tags}${act}</div>${detail}</div>`
    }).join('') || `<div class="art-empty">${this.pick ? `You know no ${this.pick.kind === 'move' ? 'move' : 'passive art'} to put here yet.` : 'Nothing here yet.'}</div>`
    const chip = (key, val, label, cur) => `<button class="pack-chip${cur === val ? ' active' : ''}" data-f="${key}:${val}">${label}</button>`
    const library = `<section class="art-sec"><div class="art-sec-h"><span>Library</span><span class="art-dim" title="Arts you have known, held or been offered">${info.found} of ${info.total} found</span></div>
      ${this.pick ? `<div class="art-picking">${Icon('play')}Choosing for ${this.pick.kind} slot ${this.pick.index + 1}<button class="art-btn quiet" data-pick-cancel>Cancel</button></div>` : ''}
      <div class="art-filters">${this.pick ? '' : chip('kind', 'all', 'All', this.filter.kind) + chip('kind', 'move', 'Moves', this.filter.kind) + chip('kind', 'passive', 'Passives', this.filter.kind)}</div>
      <div class="art-filters">${chip('el', 'all', 'Any element', this.filter.el)}${Object.keys(ART_ELEMENTS).map(e => `<button class="pack-chip el-chip el-${e}${this.filter.el === e ? ' active' : ''}" data-f="el:${e}" title="${ART_ELEMENTS[e].name}">${this.elIcon(e)}<span>${ART_ELEMENTS[e].name}</span></button>`).join('')}</div>
      <div class="art-list">${rows}</div></section>`

    const els = info.elements.map(e => `<span class="art-root el-${e}">${this.elIcon(e)}${ART_ELEMENTS[e].name}</span>`).join('')
    el.innerHTML = `<div class="arts-view">
      <div class="arts-col">${offers}
        <div class="art-head"><span class="art-k">Your root</span>${els}<span class="art-dim">Arts of your root's elements come to you more easily.</span></div>
        ${desk}${loadout}</div>
      <div class="arts-col">${library}</div></div>`
    Icon.hydrate?.(el)
  },

  tickInPlace(el, fmtTime) {
    el.querySelectorAll('[data-arts-left]').forEach(n => { n.textContent = fmtTime(Math.max(0, Math.ceil((Number(n.dataset.artsLeft) - Date.now()) / 1000))) })
    el.querySelectorAll('[data-arts-bar]').forEach(b => { const [a, z] = b.dataset.artsBar.split(':').map(Number); b.style.width = Math.min(100, 100 * (Date.now() - a) / (z - a)).toFixed(1) + '%' })
  },

  _click(e) {
    const t = e.target.closest('button')
    if (!t || t.disabled) return
    const gs = this.gs, h = this.h, s = gs.get(), d = t.dataset
    const say = (r, ok, msgs = {}) => r.ok ? (ok && h.flash(ok, 'positive')) : h.flash(msgs[r.reason] || 'Not now', 'negative')
    if (d.offer) { const r = gs.chooseArtOffer(d.offer, d.art); return say(r, `You keep ${ARTS[d.art].name}.`) }
    if (d.study) return say(gs.studyArt(d.study), `You begin studying ${ARTS[d.study].name}.`, { stage: 'Too profound for your realm', busy: 'You are studying another manual', maxed: 'Already mastered' })
    if (d.cancelStudy != null) return say(gs.cancelStudy(), 'You set the manual aside.')
    if (d.slot) {
      const [kind, i] = d.slot.split(':')
      if (s.family?.fight) return h.flash('Not in the middle of a fight', 'negative')
      this.pick = this.pick?.kind === kind && this.pick.index === +i ? null : { kind, index: +i }
      this.open = null
      this.render(s, this.el, gs, h)
      if (this.pick) this.el.querySelector(".art-picking")?.scrollIntoView({ block: "start", behavior: "smooth" })   // the library may be below the fold
      return
    }
    if (d.clear) { const [kind, i] = d.clear.split(':'); return say(gs.setArtSlot(kind, +i, null), '', { fighting: 'Not in the middle of a fight' }) }
    if (d.equip && this.pick) {
      const r = gs.setArtSlot(this.pick.kind, this.pick.index, d.equip)
      if (r.ok) { this.pick = null; h.flash(`${ARTS[d.equip].name} equipped.`, 'positive'); return this.render(gs.get(), this.el, gs, h) }
      return say(r, '', { fighting: 'Not in the middle of a fight', locked: 'That slot is still locked' })
    }
    if (d.put) { const [kind, i, id] = d.put.split(':'); return say(gs.setArtSlot(kind, +i, id), `${ARTS[id].name} equipped.`, { fighting: 'Not in the middle of a fight', locked: 'That slot is still locked' }) }
    if (d.pickCancel != null) { this.pick = null; return this.render(s, this.el, gs, h) }
    if (d.open) { this.open = this.open === d.open ? null : d.open; return this.render(s, this.el, gs, h) }
    if (d.f) { const [k, v] = d.f.split(':'); this.filter[k] = v; return this.render(s, this.el, gs, h) }
  },
}
