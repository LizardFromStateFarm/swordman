// PeopleView — 世 World → People (Phase 28 task 4.7, docs/systems/living-world.md → "4.7 as built"). Everyone you know in
// the world's registry: your class (this life and earlier), kin and clan, your sect, the arena, faces from your log, and
// anyone you pinned. Search (names + sect names), filter chips (All · Pinned · Classmates · Kin · Sect · Grudges ·
// Fallen), a sort (Relevance · Realm · Recently seen · Name), a pin per row, and the latest the world wrote of each.
// Tapping a row opens the person card inline: beside the list when the pane is wide (Expanded / Desktop), in place of
// it with a "All people" back link when narrow (Overlay / phone). Names inside that card step through inline (Back).
// The search box lives in a shell that is drawn once, so a state change redraws only the list (focus is kept).
// Pane: #tab-people. Data: gameState.knownPeople(), togglePin(), notePeopleSeen(), personInfo(). UI only.

const PeopleView = {
  gs: null,
  h: null,              // { esc, stageLabel(i), go(view, g) }
  filter: 'all',
  sort: 'relevance',
  q: '',
  limit: WORLD_PEOPLE.peoplePage,
  open: null,           // the person whose card shows
  trail: [],            // the people stepped through inside the card (Back)
  mark: null,           // the "news of the pinned" mark taken when the view was entered (fresh dots stay while open)

  FILTERS: [['all', 'All'], ['pinned', 'Pinned'], ['class', 'Classmates'], ['kin', 'Kin'], ['sect', 'Sect'], ['friend', 'Friends'], ['grudge', 'Grudges'], ['rival', 'Rivals'], ['fallen', 'Fallen']],   // 4.10b: Rivals
  SORTS: [['relevance', 'Who matters most'], ['realm', 'Highest realm'], ['recent', 'Recently seen'], ['name', 'Name']],
  EMPTY: {
    all: 'You know no one yet. Your classmates, kin and the faces you meet will gather here.',
    pinned: 'No one pinned yet. Pin someone (the star on their row or card) to follow their life: their deeds reach your log and they never fade from the world.',
    class: 'No classmates living.', kin: 'No living kin known to you.', sect: 'No one of your sect yet.',
    friend: 'No one counts you a friend yet. Help them, teach them, send a gift.', grudge: 'No one holds a grudge against you. Yet.', rival: 'No rival has stepped out of your class yet.', fallen: 'No one you know has fallen.',
  },

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    const el = document.getElementById('tab-people')
    el.addEventListener('click', e => this._click(e))
    el.addEventListener('input', e => {
      if (!e.target.matches('[data-pp-q]')) return
      this.q = e.target.value; this.limit = WORLD_PEOPLE.peoplePage
      this._body()
    })
    el.addEventListener('change', e => {
      if (!e.target.matches('[data-pp-sort]')) return
      this.sort = e.target.value; this._body()
    })
    PersonCard.onInline = pid => this.show(pid, true)
    PersonCard.onRefresh = () => this._body()   // 4.10: a deed done in the inline card
    return this
  },

  // The view was entered (nav): take the news mark once, so the fresh dots last while you look.
  enter() { this.mark = this.gs.notePeopleSeen() },

  // Open someone's card here (other views may link to it). step = from inside the card (Back returns).
  show(pid, step = false) {
    if (step && this.open && this.open !== pid) this.trail.push(this.open); else if (!step) this.trail = []
    this.open = pid
    this.gs.notePersonSeen(pid)
    this._body(true)
  },

  render(s) {
    const el = document.getElementById('tab-people')
    if (!s || !el) return
    if (this.mark == null) this.enter()
    if (!el.querySelector('.pp-view')) {
      const esc = this.h.esc
      el.innerHTML = `<div class="pp-view">
        <div class="cls-title">People you know</div>
        <div class="cls-lede">Everyone whose path has crossed yours. Their lives run on without you; pin the ones you mean to follow.</div>
        <div class="pp-tools">
          <label class="pp-search">${Icon('search')}<input type="search" data-pp-q placeholder="Search a name or a sect" value="${esc(this.q)}" aria-label="Search people" autocomplete="off" spellcheck="false"></label>
          <label class="pp-sort"><span>Sort</span><select data-pp-sort aria-label="Sort people">${this.SORTS.map(([k, l]) => `<option value="${k}"${k === this.sort ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="pp-body"></div></div>`
    }
    this._body()
  },

  _body(top = false) {
    const el = document.getElementById('tab-people'), body = el?.querySelector('.pp-body')
    if (!body) return this.render(this.gs.get())
    const d = this.gs.knownPeople({ q: this.q, filter: this.filter, sort: this.sort, limit: this.limit, since: this.mark })
    const info = this.open ? this.gs.personInfo(this.open) : null
    if (this.open && !info) { this.open = null; this.trail = [] }
    const wide = el.clientWidth >= 560
    const list = this._list(d)
    const card = info ? this._card(info, wide) : ''
    el.querySelector('.pp-view').classList.toggle('carded', !!info && !wide)
    body.className = 'pp-body' + (wide ? ' wide' : '') + (info ? ' has-card' : '')
    body.innerHTML = wide
      ? `<div class="pp-cols"><section class="pp-listcol">${list}</section><section class="pp-cardcol">${card || this._cardHint(d)}</section></div>`
      : (info ? card : list)
    if (top) { el.scrollTop = 0; body.querySelector('.pp-cardcol')?.scrollTo?.(0, 0) }
  },

  _list(d) {
    const esc = this.h.esc
    const chips = `<div class="chr-chips pp-chips" role="tablist">${this.FILTERS.map(([k, label]) => {
      const n = d.counts[k] || 0, on = k === this.filter
      if (!n && !on && k !== 'all' && k !== 'pinned') return ''
      return `<button type="button" class="cls-life chr-chip${on ? ' on' : ''}" data-pp-f="${k}" aria-selected="${on}">${k === 'pinned' ? Icon('star') : ''}${label} <span class="chr-n">${n}</span></button>`
    }).join('')}</div>`
    const rows = d.rows.map(r => this._row(r, esc)).join('')
    const empty = this.q ? `No one you know matches “${esc(this.q)}”.` : this.EMPTY[this.filter]
    const more = d.matched > d.shown ? `<button type="button" class="fa-quiet chr-more" data-pp-more>Show more <span class="chr-n">${d.matched - d.shown} more</span></button>` : ''
    const foot = `<div class="fk-note pp-foot">${Icon('star')}<span>Pinned <b>${d.pins}</b> of ${d.pinMax}. A pinned person’s life runs in full: their deeds reach your log and the chronicle, and they are never forgotten after they fall.</span></div>`
    return `${chips}<div class="pp-list">${rows || `<div class="fk-note pp-empty">${empty}</div>`}</div>${more}${foot}`
  },

  _row(r, esc) {
    const realm = esc(typeof stageShortName === 'function' ? stageShortName(r.stage) : this.h.stageLabel(r.stage))
    const chips = [
      `<span class="pc-chip ${r.tie.tone}">${esc(r.tie.word)}</span>`,
      r.role ? `<span class="pc-chip">${r.role}</span>` : '',
      r.chosen ? `<span class="pc-chip gold" title="Heaven’s Chosen: a rare root and a talent that out-paces their year">Chosen</span>` : '',
      r.feud && !(r.feud.you && r.tie.k === 'grudge') ? `<span class="pc-chip red" title="${r.feud.you ? 'They have sworn vengeance on you' : `Sworn to avenge a death on ${esc(r.feud.name)}`}">${Icon('alert')}${r.feud.you ? 'Hunts you' : 'Feud'}</span>` : '',
      r.injured ? `<span class="pc-chip red" title="Healing a breakthrough backlash">Healing</span>` : '',
      r.twilight ? `<span class="pc-chip dim" title="Near the end of their years">Final seclusion</span>` : '',
    ].join('')
    const meta = r.alive
      ? `<span class="pp-seg cls-realm">${realm}</span> <span class="pp-seg">· age ${r.age}</span>${r.sect ? ` <span class="pp-seg">· <span class="cls-sect">${esc(r.sect)}</span></span>` : ''}`   // review: no dangling separator
      : `<span class="pp-seg cls-cause">${r.ascended ? 'Ascended' : esc(r.cause)}</span> <span class="pp-seg">· year ${r.diedYear ?? '?'}</span> <span class="pp-seg cls-realm dim">· ${realm}, at ${r.age}</span>`
    const feel = r.relWord ? `<span class="pp-rel pc-tone-${r.relTone || 'dim'}" title="What they think of you">${r.relTone === 'red' ? Icon('broken') : r.relTone === 'jade' ? Icon('heart') : ''}${r.relWord}</span>` : ''
    const last = r.last ? `<span class="pp-last${r.fresh ? ' fresh' : ''}" title="${esc(r.last.text)}">${r.fresh ? '<i class="pp-dot" aria-label="news"></i>' : ''}${r.last.y != null ? `<b>Y${r.last.y}</b> ` : ''}${esc(r.last.text)}</span>` : ''
    return `<div class="pp-row${r.alive ? '' : ' dead'}${r.pinned ? ' pinned' : ''}${this.open === r.pid ? ' on' : ''}">
      <button type="button" class="pp-pin${r.pinned ? ' on' : ''}" data-pc-pin="${esc(r.pid)}" aria-pressed="${r.pinned}" title="${r.pinned ? 'Unpin' : 'Pin: follow their life'}">${Icon('star')}</button>
      <button type="button" class="pp-open" data-pp-open="${esc(r.pid)}" aria-label="Open ${esc(r.name)}">
        <span class="pp-top"><span class="pp-name">${esc(r.name)}</span>${feel}</span>
        <span class="pp-chips-row">${chips}</span>
        <span class="cls-meta">${meta}</span>${last}
      </button></div>`
  },

  _card(info, wide = false) {
    const back = this.trail.length
      ? `<button type="button" class="fa-quiet pp-back" data-pp-back>${Icon('back')}Back</button>`
      : wide ? `<button type="button" class="fa-quiet pp-back" data-pp-close>${Icon('close')}Close</button>`
      : `<button type="button" class="fa-quiet pp-back" data-pp-close>${Icon('back')}All people</button>`
    return `<div class="pp-card">${back}<div class="bd-pop pc-pop pc-inline${info.alive ? '' : ' dead'}" data-pc-inline role="region" aria-label="${this.h.esc(info.name)}">${PersonCard._html(info, { inline: true })}</div></div>`
  },

  _cardHint(d) {
    return `<div class="pp-hint">${Icon('person')}<span>Choose someone to see their card: who they are, what they think of you, their life now and their kin.${d.pins ? '' : ' The star pins them.'}</span></div>`
  },

  _click(e) {
    const f = e.target.closest('[data-pp-f]')
    if (f) { this.filter = f.dataset.ppF; this.limit = WORLD_PEOPLE.peoplePage; return this._body() }
    if (e.target.closest('[data-pp-more]')) { this.limit += WORLD_PEOPLE.peoplePage; return this._body() }
    const o = e.target.closest('[data-pp-open]')
    if (o) return this.show(o.dataset.ppOpen)
    if (e.target.closest('[data-pp-close]')) { this.open = null; this.trail = []; return this._body(true) }
    if (e.target.closest('[data-pp-back]')) { this.open = this.trail.pop() || null; return this._body(true) }
    const go = e.target.closest('.pc-inline [data-pc-go]')
    if (go) { e.stopPropagation(); return PersonCard._go(go, this.open) }
  },
}
