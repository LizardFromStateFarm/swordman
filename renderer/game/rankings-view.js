// RankingsView — 世 World → Rankings (Phase 28 task 4.8, docs/systems/living-world.md → "4.8 Heavenly Rankings"). The
// world's three boards, published each game year: Your Class (the youths who awakened with you, by rank power; the fallen
// kept apart), the Rising Dragon Ranking (power for their years, ≤ 60 years on the path) and the Heaven Ranking (everyone
// living). Your standing sits on top (place, ▲▼, rank power with its "why", renown, the next publication in real open
// time), then the top 20 + your neighbours (names open the person card), the Class duel on the classmate just above you,
// the Veil switch with its trade-offs, titles, the honour roll and the latest headlines. Pane: #tab-rankings.
// Data: gameState.rankingsInfo(board), setRankVeil(on), challengeRanked(pid), noteRanksSeen(), noteRanksHint(). UI only.

const RankingsView = {
  gs: null,
  h: null,          // { esc, stageLabel(i), clock(sec), go(view), onFight(), flash(text, tone) }
  board: 'class',

  BOARDS: [['class', 'Your Class'], ['dragon', 'Rising Dragon'], ['heaven', 'Under Heaven']],

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    const el = document.getElementById('tab-rankings')
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-rk-board],[data-rk-veil],[data-rk-hint],[data-rk-duel]')
      if (!t || t.disabled) return
      if (t.dataset.rkBoard) { this.board = t.dataset.rkBoard; this.render(this.gs.get()); return }
      if (t.dataset.rkHint != null) { this.gs.noteRanksHint(); return }
      if (t.dataset.rkVeil != null) { this.gs.setRankVeil(t.dataset.rkVeil === 'on'); return }
      if (t.dataset.rkDuel) {
        const r = this.gs.challengeRanked(t.dataset.rkDuel)
        if (!r.ok) return this.h.flash(r.lock || 'You cannot call them out now.', 'negative')
        this.h.onFight()
      }
    })
    // The next publication and the duel's cooldown count down in real time.
    setInterval(() => {
      for (const n of el.querySelectorAll('[data-rk-end]')) {
        const left = Math.max(0, Math.ceil((+n.dataset.rkEnd - Date.now()) / 1000))
        n.textContent = n.dataset.rkKind === 'pub' ? (left > 0 ? this.h.clock(left) : 'any moment') : this.h.clock(left)
        if (!left && n.dataset.rkKind === 'cd' && el.offsetParent) { n.removeAttribute('data-rk-end'); this.render(this.gs.get()) }
      }
    }, 1000)
    return this
  },

  _realm(i) { return this.h.esc(typeof stageShortName === 'function' ? stageShortName(i) : this.h.stageLabel(i)) },
  _move(m) {
    if (m === 'new') return `<span class="rk-mv new" title="New on the board since the last publication">new</span>`
    if (!m) return `<span class="rk-mv flat" aria-hidden="true"></span>`
    return m > 0 ? `<span class="rk-mv up" title="Up ${m} since the last publication">▲${m}</span>` : `<span class="rk-mv down" title="Down ${-m} since the last publication">▼${-m}</span>`
  },
  _on(b) { return { heaven: 'under Heaven', dragon: 'among the Rising Dragons', class: 'in your class' }[b] },

  render(s) {
    const el = document.getElementById('tab-rankings')
    if (!s || !el) return
    const esc = this.h.esc, r = this.gs.rankingsInfo(this.board), b = this.board
    if (r.fresh) this.gs.noteRanksSeen()
    if (r.year == null) {
      el.innerHTML = `<div class="rk-view"><div class="rk-title">Heavenly Rankings</div>
        <div class="fk-note">The world has not yet published its rankings in this life. They come out once a game year (about every two minutes of open time).</div></div>`
      return
    }
    const hint = r.hint ? `<div class="er-hint rk-hint">${Icon('why')}<span>${esc(NPC_RANK_TEXT.hint)}</span><button class="er-hint-x" data-rk-hint aria-label="Got it">Got it</button></div>` : ''
    const tabs = `<div class="rk-tabs" role="tablist">${this.BOARDS.map(([id, label]) =>
      `<button type="button" class="rk-tab${id === b ? ' on' : ''}" role="tab" aria-selected="${id === b}" data-rk-board="${id}">${esc(label)}</button>`).join('')}</div>`
    const pub = r.nextSecs != null ? `<span class="rk-pub">${Icon('age')}Next publication in <b data-rk-end="${Date.now() + r.nextSecs * 1000}" data-rk-kind="pub">${r.nextSecs > 0 ? this.h.clock(r.nextSecs) : 'any moment'}</b></span>` : ''

    // Your standing on this board.
    const lede = {
      class: 'You against the youths who awakened the year you did, by rank power. The fallen keep their names below.',
      dragon: `The fastest risers of the age: power for their years on the path (power × ${NPC_RANK.dragonK} ÷ (years + ${NPC_RANK.dragonK})). Only those ${r.dragonYears ?? NPC_RANK.dragonYears} years on the path or fewer.`,
      heaven: 'Every living cultivator of the mortal world, by rank power. The old monsters stand here too.',
    }[b]
    const off = { veiled: 'Your name is veiled: the board does not carry it.', aged: `You have walked the path ${r.yourYears} years: too long for the Rising Dragons.`,
      none: 'Your name is not on this board.', below: 'You stand below the hundred the board carries.' }[r.youOff] || ''
    const youRow = r.rows.find(x => x.self)
    const placeTxt = r.place ? `#${r.place}` : '—'
    const stand = `<div class="rk-you${r.veil && b !== 'class' ? ' veiled' : ''}">
        <div class="rk-you-place"><span class="rk-you-lab">${b === 'class' ? 'Your place in your class' : `Your place ${this._on(b)}`}</span>
          <b class="rk-you-n">${placeTxt}</b><span class="rk-you-of">${r.total ? `of ${r.total}` : ''}${youRow && youRow.move ? ' ' + this._move(youRow.move) : ''}</span></div>
        <div class="rk-you-side">
          <button type="button" class="rk-power" data-bd="rankpower" title="What your rank power is made of">${Icon('qi')}<span>Rank power <b>${r.power}</b></span><i data-icon="why"></i></button>
          ${r.renown ? `<span class="rk-renown ${r.renown > 0 ? 'jade' : 'red'}" title="Renown from ranked duels (fades 8% a year)">Renown ${r.renown > 0 ? '+' : '−'}${Math.abs(r.renown)}</span>` : ''}
          ${r.best[b] ? `<span class="rk-best" title="The highest you have stood on this board in this life">Best #${r.best[b]}</span>` : ''}
        </div>
        ${off && b !== 'class' ? `<div class="rk-off">${Icon(r.youOff === 'veiled' ? 'veil' : 'why')}<span>${esc(off)}${r.veil && r.place ? ` You would stand #${r.place}.` : ''}</span></div>` : ''}
      </div>`

    // The board itself.
    const chips = x => [
      x.rival ? `<span class="pc-chip red" title="Your rival this life">Rival</span>` : '',
      x.kin && !x.self ? `<span class="pc-chip gold" title="Your family">Kin</span>` : '',
      x.chosen ? `<span class="pc-chip gold" title="Heaven’s Chosen: a rare root and a talent that out-paces most of their year">Chosen</span>` : '',
      x.pinned ? `<span class="pc-chip" title="Pinned in World → People">${Icon('star')}</span>` : '',
    ].join('')
    const duel = x => {
      const d = x.duel
      if (!d) return ''
      const note = d.lock === 'Wait for the cooldown' ? `Ready in <b data-rk-end="${Date.now() + d.cd * 1000}" data-rk-kind="cd">${this.h.clock(d.cd)}</b>` : d.lock ? esc(d.lock) : `${d.odds}% to win · until one yields · renown +${NPC_RANK.renown.win}`
      return `<div class="rk-duel">${Icon('duel')}<span class="rk-duel-t">${note}</span>
        <button type="button" class="fa-btn rk-duel-b" data-rk-duel="${esc(x.pid)}"${d.lock ? ' disabled' : ''} title="${esc(d.lock || 'Call them out for their place')}">Challenge for the place</button></div>`
    }
    let rows = '', last = 0
    for (const x of r.rows) {
      if (last && x.place > last + 1) rows += `<div class="rk-gap" aria-hidden="true">· · ·</div>`
      last = x.place
      const name = x.self ? `<b class="rk-me">You</b>` : PersonCard.link(x.pid, x.name)
      rows += `<div class="rk-row${x.self ? ' you' : ''}${x.place <= 3 ? ' top' : ''}${x.rival ? ' rival' : ''}" role="listitem">
          <span class="rk-n">${x.place}</span>${this._move(x.move)}
          <span class="rk-body"><span class="rk-who">${name}${chips(x)}</span>
            <span class="rk-meta"><span class="cls-realm">${this._realm(x.stage)}</span> · age ${x.age}</span>${x.sect ? `<span class="rk-meta cls-sect">${esc(x.sect)}</span>` : ''}</span>
          <span class="rk-sc" title="${b === 'dragon' ? 'Power for their years' : 'Rank power'}">${x.sc}</span>
          ${duel(x)}
        </div>`
    }
    const cap = b === 'class' ? '' : `<div class="rk-cap">${b === 'dragon' ? 'Scores are power for their years' : 'Scores are rank power'}, as published in year ${r.year}${b === 'heaven' ? `; yours now is ${r.power}` : ''}.</div>`
    const list = cap + `<div class="rk-list" role="list">${rows || '<div class="fk-note">No one is on this board yet.</div>'}</div>`
    const counts = b === 'class' && r.counts ? `<div class="cls-stats">${[['living', r.counts.living, 'jade'], ['fallen', r.counts.fallen, 'red'], ['ascended', r.counts.ascended, 'gold']]
      .filter(([, n, t]) => n || t !== 'gold').map(([k, n, t]) => `<span class="cls-stat ${t}"><b>${n}</b> ${k}</span>`).join('')}</div>` : ''
    const fallen = b === 'class' && r.fallen.length ? `<details class="cls-fallen rk-fallen"><summary class="bd-sec-title cls-sec">The fallen and the ascended · ${r.fallen.length}</summary><div class="cls-list">${r.fallen.map(f =>
      `<div class="cls-row dead tap" data-pid="${esc(f.pid)}"><span class="cls-n">${Icon.g(f.ascended ? 'rise' : 'lineage')}</span><span class="cls-body"><span class="cls-who">${PersonCard.link(f.pid, f.name)}</span>
        <span class="cls-meta"><span class="cls-cause">${esc(f.cause)}</span>${f.y != null ? ` · year ${f.y}` : ''} · <span class="cls-realm dim">${this._realm(f.stage)}</span></span></span></div>`).join('')}</div></details>` : ''
    const main = `<div class="rk-main"><p class="rk-lede">${esc(lede)}</p>${stand}${counts}${list}${fallen}</div>`

    // The side: your name (veil), titles, the latest headlines, the honour roll.
    const veil = `<div class="rk-veil${r.veil ? ' on' : ''}">
        <div class="rk-veil-h">${Icon(r.veil ? 'veil' : 'eye')}<span class="rk-veil-l">Your name</span>
          <span class="set-seg rk-seg" role="radiogroup" aria-label="Your name on the public boards">${[['off', 'Public'], ['on', 'Veiled']].map(([v, l]) => {
            const on = (v === 'on') === !!r.veil
            return `<button type="button" class="set-opt${on ? ' active' : ''}" role="radio" aria-checked="${on}" data-rk-veil="${v}">${l}</button>` }).join('')}</span></div>
        <p class="rk-veil-n">${r.veil
          ? 'The public boards will not carry you from the next publication: no challengers, no genius hunters, no invitations, and no fame for your sect from a place.'
          : `A public place draws challengers from just below you, genius hunters while you are a Rising Dragon, and invitations from mightier sects${r.founder ? `; it also brings your sect fame (now +${r.fame})` : ''}.`}</p>
      </div>`
    const titles = r.titles.length || r.pastTitles.length ? `<div class="bd-sec-title">Titles</div><div class="rk-titles">${[...r.titles.map(t => ({ ...t, past: false })), ...r.pastTitles.slice(-4).map(t => ({ ...t, past: true }))].map(t =>
      `<span class="rk-title-chip${t.past ? ' past' : ''}" title="${t.past ? `Earned in life ${t.life}` : `Earned in year ${t.y}`}">${Icon('crown')}${esc(t.t)}</span>`).join('')}</div>` : ''
    const news = r.news.length ? `<div class="bd-sec-title">From the rankings</div><ol class="rk-news">${r.news.map(n =>
      `<li class="${n.tone || ''}"><span class="rv-by">yr ${n.y}</span><span>${esc(n.text)}</span></li>`).join('')}</ol>` : ''
    const honour = b === 'dragon' && r.honour.length ? `<details class="cls-fallen"><summary class="bd-sec-title cls-sec">The honour roll · ${r.honour.length}</summary><div class="rk-honour">${r.honour.map(x =>
      `<div class="rk-hon${x.you ? ' you' : ''}"><span class="rk-hon-n">#${x.place}</span><span>${x.you ? '<b class="rk-me">You</b>' : PersonCard.link(x.pid, x.name)}</span><span class="rv-by">yr ${x.y}</span></div>`).join('')}</div></details>` : ''
    const side = `<div class="rk-side">${veil}${titles}${news}${honour}</div>`

    el.innerHTML = `<div class="rk-view">
      <div class="rk-head"><div class="rk-title">Heavenly Rankings <span class="cls-yr">published year ${r.year}</span></div>${pub}</div>
      ${hint}${tabs}<div class="rk-cols">${main}${side}</div></div>`
  },
}
