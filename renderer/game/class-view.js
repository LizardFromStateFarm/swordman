// ClassView — 世 World → Class (Phase 28 task 4.3, docs/systems/living-world.md §6.1). The ~60 youths who awakened the
// year you did, living their own lives on the light world sim: where each stands (you are placed among them), who is
// Heaven's Chosen, who is healing a backlash or in final seclusion, who has fallen and how, who Ascended. A chip row
// switches to an earlier life's class (they live on). Every name opens the person card. 4.8 adds the ranked Class board.
// Pane: #tab-class. Data: gameState.classInfo(life), noteClassSeen().

const ClassView = {
  gs: null,
  h: null,          // { esc, stageLabel(i) }
  life: null,       // the class shown (null = this life's)

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    document.getElementById('tab-class').addEventListener('click', e => {
      const b = e.target.closest('[data-cls-life]')
      if (b) { this.life = +b.dataset.clsLife || null; this.render(this.gs.get()); document.getElementById('tab-class').scrollTop = 0 }
    })
    return this
  },

  render(s) {
    const el = document.getElementById('tab-class')
    if (!s || !el) return
    let c = this.gs.classInfo(this.life)
    if (!c.members.length && this.life) { this.life = null; c = this.gs.classInfo() }
    if (c.current) this.gs.noteClassSeen()
    const esc = this.h.esc
    if (!c.members.length) { el.innerHTML = `<div class="cls-view"><div class="fk-note">No youths awakened beside you yet.</div></div>`; return }

    const living = c.members.filter(m => m.alive), fallen = c.members.filter(m => !m.alive && !m.ascended), up = c.members.filter(m => m.ascended)
    const head = c.current
      ? `<div class="cls-title">Your class <span class="cls-yr">awakened in year ${c.awakenYear}</span></div>
         <div class="cls-lede">${c.members.length} youths awakened the year you did. Their lives run on without you: they break through, wed, are wounded, fall, and a rare few Ascend.</div>`
      : `<div class="cls-title">${c.pastName ? `${esc(c.pastName)}’s class` : `The class of life ${c.life}`} <span class="cls-yr">awakened in year ${c.awakenYear}</span></div>
         <div class="cls-lede">They awakened beside a past life of yours. The survivors are old now; some may still cross your path.</div>`
    const stat = (n, label, tone = '') => `<span class="cls-stat ${tone}"><b>${n}</b> ${label}</span>`
    const stats = `<div class="cls-stats">${stat(c.counts.living, 'living', 'jade')}${stat(c.counts.fallen, 'fallen', 'red')}${c.counts.ascended ? stat(c.counts.ascended, 'ascended', 'gold') : ''}${
      c.current ? stat(c.ahead, c.ahead === 1 ? 'stands above you' : 'stand above you', c.ahead ? 'warn' : '') : ''}</div>`
    const lives = c.lives.length > 1 ? `<div class="cls-lives" role="tablist">${c.lives.map(n => {
      const on = n === c.life, cur = n === c.lives[0]
      return `<button type="button" class="cls-life${on ? ' on' : ''}" data-cls-life="${cur ? 0 : n}" aria-selected="${on}">${cur ? 'This life' : `Life ${n}`}</button>`
    }).join('')}</div>` : ''

    const tags = m => [
      m.chosen ? `<span class="pc-chip gold" title="Heaven’s Chosen: a rare root and a talent that out-paces most of their year">Chosen</span>` : '',
      m.injured ? `<span class="pc-chip red" title="Wounded by a failed breakthrough; cultivating slowly while it heals">Healing</span>` : '',
      m.twilight ? `<span class="pc-chip dim" title="Near the end of their years: in final seclusion">Final seclusion</span>` : '',
    ].join('')
    const realm = i => esc(typeof stageShortName === 'function' ? stageShortName(i) : this.h.stageLabel(i))
    const row = (m, i) => `<div class="cls-row${m.chosen ? ' chosen' : ''}">
        <span class="cls-n">${i}</span>
        <span class="cls-body"><span class="cls-who">${PersonCard.link(m.pid, m.name)}${tags(m)}</span>
          <span class="cls-meta"><span class="cls-realm">${realm(m.stage)}</span> · age ${m.age}${m.sect ? ` · <span class="cls-sect" title="Sworn to the ${esc(m.sect)}">${esc(m.sect)}</span>` : ''}</span></span>
      </div>`
    const you = i => `<div class="cls-row you"><span class="cls-n">${i}</span><span class="cls-body"><span class="cls-who"><b>You</b></span>
        <span class="cls-meta"><span class="cls-realm">${realm(c.youStage)}</span> · age ${Math.floor(s.age || 0)}</span></span></div>`
    let rows = '', n = 0, youIn = !c.current
    for (const m of living) {
      if (!youIn && m.stage <= c.youStage) {   // you stand among them, at your own realm
        youIn = true
        rows += you(++n)
      }
      rows += row(m, ++n)
    }
    if (!youIn) rows += you(++n)
    const dead = m => `<div class="cls-row dead">
        <span class="cls-n">${m.ascended ? Icon.g('rise') : Icon.g('lineage')}</span>
        <span class="cls-body"><span class="cls-who">${PersonCard.link(m.pid, m.name)}${m.chosen ? '<span class="pc-chip gold">Chosen</span>' : ''}</span>
          <span class="cls-meta"><span class="cls-cause">${m.ascended ? 'Ascended' : esc(m.cause || 'Passed on')}</span> · year ${m.diedYear ?? "?"} · <span class="cls-realm dim">${realm(m.stage)}, at ${m.age}</span></span></span>
      </div>`
    const sec = (title, body, cls = '') => `<div class="bd-sec-title cls-sec ${cls}">${title}</div><div class="cls-list">${body}</div>`
    el.innerHTML = `<div class="cls-view">${head}${lives}${stats}
      ${living.length || c.current ? sec(c.current ? 'Where everyone stands' : 'Still living', rows || '<div class="fk-note">None of them still live.</div>') : ''}
      ${up.length ? sec('Ascended', up.map(dead).join(''), 'gold') : ''}
      ${fallen.length ? `<details class="cls-fallen"${c.current ? ' open' : ''}><summary class="bd-sec-title cls-sec">The fallen · ${fallen.length}</summary><div class="cls-list">${fallen.map(dead).join('')}</div></details>` : ''}
    </div>`
  },
}
