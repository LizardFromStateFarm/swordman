// ChronicleView — 世 World → Chronicle (Phase 28 task 4.6, docs/systems/living-world.md → "4.6 as built"). The one feed
// of the world's memory: people (realm breakthroughs from Core Formation, deaths with their cause, Ascensions, final
// seclusions, your classmates' weddings) and sects (every line of the old Sects chronicle), plus the replacement
// controller's own beats (awakening waves, wanderers, hidden masters who seize or found a sect). Above it, "The world by
// realm": the living per realm band against the target the world settles around, so the refilling is never hidden.
// Filter chips (All · Notable · Your class · Your clan · Sects · People); every name opens the person card.
// Pane: #tab-chronicle. Data: gameState.worldChronicle({ filter, limit }), noteChronicleSeen(). UI only.

const ChronicleView = {
  gs: null,
  h: null,            // { esc }
  filter: 'all',
  limit: 80,

  FILTERS: [['all', 'All'], ['notable', 'Notable'], ['class', 'Your class'], ['clan', 'Your clan'], ['sects', 'Sects'], ['people', 'People']],
  KIND_ICON: { sect: 'hall', wave: 'root', arrival: 'explore', hidden: 'lightning', rise: 'rise', died: 'lineage',
               ascended: 'cloud', twilight: 'lantern', wed: 'couple' },
  KIND_WORD: { sect: 'Sects', wave: 'Awakening', arrival: 'A wanderer', hidden: 'An old monster', rise: 'Breakthrough',
               died: 'A death', ascended: 'Ascension', twilight: 'Final seclusion', wed: 'A wedding' },

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    const el = document.getElementById('tab-chronicle')
    el.addEventListener('click', e => {
      const f = e.target.closest('[data-chr-f]')
      if (f) { this.filter = f.dataset.chrF; this.limit = 80; this.render(this.gs.get()); return }
      if (e.target.closest('[data-chr-more]')) { this.limit += 80; this.render(this.gs.get()) }
    })
    return this
  },

  // Open on a filter (the Sects ledger's "whole chronicle" link lands on Sects).
  show(filter) { if (this.FILTERS.some(([k]) => k === filter)) { this.filter = filter; this.limit = 80 } },

  render(s) {
    const el = document.getElementById('tab-chronicle')
    if (!s || !el) return
    const c = this.gs.worldChronicle({ filter: this.filter, limit: this.limit })
    this.gs.noteChronicleSeen()
    const esc = this.h.esc
    const head = `<div class="cls-title">The world’s chronicle <span class="cls-yr">year ${c.year}</span></div>
      <div class="cls-lede">What the world remembers: who broke through, who fell and how, who woke from seclusion, what the sects did. It runs on while you play, and through the years between your lives.</div>`

    const chips = `<div class="chr-chips" role="tablist">${this.FILTERS.map(([k, label]) => {
      const n = c.counts[k] || 0
      if (k !== 'all' && k !== this.filter && !n) return ''
      const on = k === this.filter
      return `<button type="button" class="cls-life chr-chip${on ? ' on' : ''}${k === 'notable' && c.unseen ? ' fresh' : ''}" data-chr-f="${k}" aria-selected="${on}">${label} <span class="chr-n">${n}</span></button>`
    }).join('')}</div>`

    // Years newest first; within a year, the lines in the order they happened (the waking before the seizure).
    const years = []
    for (const e of c.entries) { if (!years.length || years[years.length - 1].y !== e.y) years.push({ y: e.y, rows: [] }); years[years.length - 1].rows.push(e) }
    let feed = years.map(g => `<div class="chr-year">Year ${g.y}</div>` + g.rows.reverse().map(e => this._row(e, esc)).join('')).join('')
    if (this.filter === 'all' && c.counts.routine) feed += `<div class="fk-note chr-routine">${c.counts.routine} routine sect lines (new elders, oath-takers) are under <button type="button" class="fa-link" data-chr-f="sects">Sects</button>.</div>`
    if (!c.entries.length) feed = `<div class="fk-note">${this.filter === 'all' ? 'Nothing has been written yet. The world is young.' : 'Nothing of that kind has been written yet.'}</div>`
    const shown = c.entries.length, more = (c.counts[this.filter] || 0) > shown
      ? `<button type="button" class="fa-quiet chr-more" data-chr-more>Earlier years <span class="chr-n">${(c.counts[this.filter] || 0) - shown} more</span></button>` : ''

    el.innerHTML = `<div class="chr-view">${head}
      <div class="chr-cols">${this._bands(c)}
        <section class="chr-feed">${chips}<div class="chr-list">${feed}</div>${more}
          <div class="fk-note chr-foot">The chronicle keeps the last ${NPC_WORLD.chronMax} entries. It never advances while the game is closed.</div></section>
      </div></div>`
    el.querySelectorAll('[data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
    el.querySelectorAll('[data-l]').forEach(b => { b.style.left = b.dataset.l + '%' })
  },

  // One line: a kind glyph, the text with every named person tappable, and a tag when it touches you.
  _row(e, esc) {
    let text = esc(e.text)
    for (const w of e.who) {
      const n = esc(w.name)
      if (n && text.includes(n)) text = text.replace(n, PersonCard.link(w.pid, w.name))
    }
    const tag = e.tags.includes('yours') ? '<span class="pc-chip gold">your sect</span>'
      : e.tags.includes('clan') ? '<span class="pc-chip jade">your clan</span>'
      : e.tags.includes('class') ? '<span class="pc-chip">your class</span>' : ''
    const icon = this.KIND_ICON[e.k] || 'scroll'
    return `<div class="chr-row k-${e.k}${e.notable ? ' notable' : ''}">
      <span class="chr-ic" title="${this.KIND_WORD[e.k] || ''}${e.notable ? ' · notable' : ''}">${Icon(icon)}</span>
      <span class="chr-t">${text}${tag ? ` ${tag}` : ''}</span></div>`
  },

  // The world by realm: living per band against its target (the tick), and why a band refills or thins.
  _bands(c) {
    const rows = c.bands.map(b => {
      // Each bar is scaled to its own target (×1.6 = the full bar), so the small top realms read as clearly as the crowd.
      const full = b.target * 1.6
      const tone = b.state === 'thin' ? 'red' : b.state === 'crowded' ? 'warm' : 'jade'
      const word = b.state === 'thin' ? 'Thin' : b.state === 'crowded' ? 'Crowded' : 'Settled'
      const why = b.state === 'thin'
        ? (b.id === 'low' ? 'Youths awaken in waves every few years until it fills.'
          : b.id === 'ns' || b.id === 'ss' ? 'Those just below break through faster, and an old monster may wake from seclusion.'
          : 'Those just below break through faster, and wanderers come down from the far ranges.')
        : b.state === 'crowded' ? 'Too many at one realm: feuds and duels multiply until it thins. No new arrivals.'
        : 'Near what the world settles around.'
      return `<div class="chr-band" title="${b.name}: ${b.count} living, the world settles near ${b.target}. ${why}">
        <span class="chr-bn">${b.short}</span>
        <span class="chr-bar"><i class="tone-${tone}" data-w="${Math.min(100, Math.round(b.count / full * 100))}"></i><b class="chr-tick" data-l="${Math.round(b.target / full * 100)}"></b></span>
        <span class="chr-bc">${b.count}<span class="dim">/${b.target}</span></span>
        <span class="chr-bs tone-${tone}">${word}</span></div>`
    }).join('')
    const st = c.stats || {}
    const facts = [
      st.waves ? `${st.waves} awakening wave${st.waves === 1 ? '' : 's'} (${st.awakened || 0} youths)` : '',
      st.wanderers ? `${st.wanderers} wanderer${st.wanderers === 1 ? '' : 's'} came down` : '',
      st.hidden ? `${st.hidden} old monster${st.hidden === 1 ? '' : 's'} woke${st.seized ? `, ${st.seized} took a sect` : ''}${st.founded ? `, ${st.founded} founded one` : ''}` : '',
      st.ascended ? `${st.ascended} Ascended` : '',
    ].filter(Boolean)
    return `<section class="chr-bands"><div class="bd-sec-title">The world by realm</div>
      ${rows}
      <details class="chr-why"><summary class="fa-quiet"><span class="lib-fold">${Icon('play')}</span>How the world refills</summary>
        <div class="fk-note chr-bnote">The gold tick marks what each realm settles around. A thin realm refills over years: youths awaken, wanderers arrive, those just below break through faster, and old monsters wake. A crowded one turns on itself.</div>
        ${facts.length ? `<div class="chr-facts">${facts.map(f => `<span>${f}</span>`).join('')}</div>` : ''}</details></section>`
  },
}
