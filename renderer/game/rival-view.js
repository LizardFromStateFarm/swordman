// RivalView — 世 World → Rival (Phase 28 task 4.10b, docs/systems/living-world.md → "4.10b as built"). The one genius of
// your class the world measures you against: the two of you side by side (realm, age, who leads), the heat between you
// (−100 blood feud … +100 kindred spirit) on a meter with what each end opens, the record (meetings, wins, losses), when
// they will seek you out again (real open time, never game years), the deeds you can start yourself (spar, a duel to the
// death in a blood feud, a gift — the person card's own buttons, so PersonCard handles them), the rivalry's history as a
// timeline, a house that carries a rivalry from a past life, and earlier lives' rivals. Pane: #tab-rival.
// Data: gameState.rivalInfo(), noteRivalSeen(), noteRivalHint(). UI only.

const RivalView = {
  gs: null,
  h: null,          // { esc, stageLabel(i), go(view), clock(sec) }

  init(gs, helpers) {
    this.gs = gs; this.h = helpers
    const el = document.getElementById('tab-rival')
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-rv-go],[data-rv-hint]')
      if (!t) return
      if (t.dataset.rvHint != null) { this.gs.noteRivalHint(); return }
      this.h.go(t.dataset.rvGo)
    })
    // The deed cooldown and the next-visit estimate count down in real time; when the cooldown ends the deeds unlock.
    setInterval(() => {
      for (const n of el.querySelectorAll('[data-rv-end]')) {
        const left = Math.max(0, Math.ceil((+n.dataset.rvEnd - Date.now()) / 1000))
        n.textContent = n.dataset.rvKind === 'next' ? this._approx(left) : this.h.clock(left)
        if (!left && n.dataset.rvKind === 'cd' && el.offsetParent) { n.removeAttribute('data-rv-end'); this.render(this.gs.get()) }
      }
    }, 1000)
    return this
  },

  _approx(sec) { return sec >= 90 ? `about ${Math.round(sec / 60)} min` : sec > 0 ? 'moments' : 'any moment now' },
  _signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) },

  render(s) {
    const el = document.getElementById('tab-rival')
    if (!s || !el) return
    const r = this.gs.rivalInfo(), esc = this.h.esc
    if (r.has) this.gs.noteRivalSeen()
    const realm = i => esc(typeof stageShortName === 'function' ? stageShortName(i) : this.h.stageLabel(i))
    if (!r.has) {
      el.innerHTML = `<div class="rv-view"><div class="rv-title">Your rival</div>
        <div class="fk-note">No one has stepped out of your class to meet your eyes yet. Your rival is named when the youths who awakened with you are known.</div>
        ${this._past(r, realm)}</div>`
      return
    }
    const ended = !!r.end, them = r.them
    const chips = [
      r.chosen ? `<span class="pc-chip gold" title="Heaven’s Chosen: a rare root and a talent that out-paces most of their year">Chosen</span>` : '',
      r.sworn ? `<span class="pc-chip gold" title="You swore brotherhood: they fight in your sect wars and will avenge you">${Icon('bond')}Sworn sibling</span>` : '',
      r.house ? `<span class="pc-chip red" title="Their line carries a rivalry with yours from a past life">The ${esc(r.house)} line</span>` : '',
      ended ? `<span class="pc-chip dim">${esc(r.end.k === 'ascended' ? 'Ascended' : r.end.k === 'lifeEnded' ? 'Outlived you' : 'Gone')}</span>` : '',
    ].join('')
    const lead = !r.alive ? (r.ascended ? 'They Ascended.' : 'They are gone.')
      : r.lead > 0 ? `You lead by ${r.gap} ${r.gap === 1 ? 'stage' : 'stages'}` : r.lead < 0 ? `They lead by ${r.gap} ${r.gap === 1 ? 'stage' : 'stages'}` : 'Level, stage for stage'
    const face = `<div class="rv-face">
        <div class="rv-side you"><span class="rv-lab">You</span><b class="rv-nm">${esc(s.name || 'You')}</b>
          <span class="rv-realm">${realm(r.you.stage)}</span><span class="rv-sub">age ${r.you.age}</span></div>
        <div class="rv-vs"><span class="rv-vs-g">${Icon('duel')}</span><span class="rv-lead ${r.lead > 0 ? 'jade' : r.lead < 0 ? 'red' : ''}">${esc(lead)}</span></div>
        <div class="rv-side them${r.alive ? '' : ' dead'}"><span class="rv-lab">Your rival</span><b class="rv-nm">${PersonCard.link(r.pid, r.name)}</b>
          <span class="rv-realm">${realm(them.stage)}</span><span class="rv-sub">age ${them.age ?? '?'}</span></div>
      </div>
      <div class="rv-meta">${[them.temper, them.morality, them.root ? (/root$/i.test(them.root) ? them.root : `${them.root} root`) : null, them.sect].filter(Boolean).map(esc).join(' · ')}${chips ? ` ${chips}` : ''}</div>`

    // The heat meter: −100 … +100, the two thresholds marked with what they open.
    const pos = v => ((v + 100) / 200 * 100).toFixed(1)
    const heat = `<div class="rv-heat${r.blood ? ' blood' : r.bond ? ' bond' : ''}">
        <div class="rv-heat-h"><span class="rv-heat-l">Heat between you</span><b class="rv-heat-v ${r.tone}">${this._signed(r.heat)}</b><span class="rv-heat-w ${r.tone}">${esc(r.word)}</span></div>
        <div class="rv-bar" role="meter" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${r.heat}" aria-label="Heat ${r.heat}, ${esc(r.word)}">
          <span class="rv-zone blood" style="width:${pos(r.bloodHeat)}%"></span><span class="rv-zone bond" style="left:${pos(r.bondHeat)}%"></span>
          <span class="rv-tick" style="left:50%"></span><span class="rv-mark" style="left:${pos(r.heat)}%"></span>
        </div>
        <div class="rv-ends"><span class="${r.blood ? 'on' : ''}">${Icon('skull')}<span><b>${this._signed(r.bloodHeat)} or colder</b> a blood feud: duels to the death, and they may go after your kin</span></span>
          <span class="${r.bond ? 'on' : ''}">${Icon('bond')}<span><b>${this._signed(r.bondHeat)} or warmer</b> swear brotherhood, or court them, when they visit</span></span></div>
        <p class="rv-why">${Icon('why')}<span>Every meeting moves it: mercy, help and a shared jar warm it; refusing them, shaming them, sabotage and being overtaken by you cool it.</span></p>
      </div>`

    const stat = (n, label, tone = '') => `<span class="cls-stat ${tone}"><b>${n}</b> ${label}</span>`
    const rec = `<div class="cls-stats rv-rec">${stat(r.meets, r.meets === 1 ? 'meeting' : 'meetings')}${stat(r.wins, r.wins === 1 ? 'win' : 'wins', 'jade')}${stat(r.losses, r.losses === 1 ? 'loss' : 'losses', 'red')}</div>`
      + this._ranks(r)   // 4.8: the two of you on the rankings

    // When they come next (real open time), or why not.
    let next
    if (ended) next = `<div class="rv-next ended">${Icon('lineage')}<span>${esc(r.end.text || 'The rivalry has ended.')}</span></div>`
    else if (r.onRoad) next = `<div class="rv-next now">${Icon('duel')}<span>They are waiting for you on the road.</span><button class="fa-btn rv-go" data-rv-go="explore">Answer them</button></div>`
    else if (r.waiting) next = `<div class="rv-next">${Icon('person')}<span>They are looking for you, and will come as soon as a place frees on the road.</span></div>`
    else if (r.nextSecs != null) next = `<div class="rv-next">${Icon('age')}<span>They will seek you out again in <b data-rv-end="${Date.now() + r.nextSecs * 1000}" data-rv-kind="next">${this._approx(r.nextSecs)}</b> of open time.</span></div>`
    else next = ''

    // Deeds you can start yourself (the person card's own buttons; PersonCard handles the click, the duel's confirm, a fight).
    let acts = ''
    if (r.acts && r.acts.list.length) {
      const fmtQ = v => String(v)
      const btn = a => {
        const off = !!a.lock || !!r.acts.cd, note = esc(String(a.note || '').replace('{qi}', fmtQ(a.qiCost || 0)))
        return `<button type="button" class="fa-btn pc-actb${a.tone ? ' ' + a.tone : ''}${a.lock ? ' locked' : ''}" data-pc-act="${a.id}"${off ? ' disabled' : ''} title="${a.lock ? esc(a.lock) : note}">
          <span class="fa-g">${Icon(a.lock ? 'lock' : a.icon)}</span><span class="fa-t"><span class="fa-n">${esc(a.label)}</span><span class="fa-e">${a.lock ? esc(a.lock) : note}</span></span></button>`
      }
      const cd = r.acts.cd ? `<div class="pc-cd">${Icon('age')}<span>They need time before another deed: ready again in <b data-rv-end="${Date.now() + r.acts.cd * 1000}" data-rv-kind="cd">${this.h.clock(r.acts.cd)}</b></span></div>` : ''
      acts = `<div class="bd-sec-title">Seek them out yourself</div>
        <div class="pc-acts rv-acts${r.acts.cd ? ' waiting' : ''}" data-pc-for="${esc(r.pid)}">${cd}<div class="pc-act-grid">${r.acts.list.map(btn).join('')}</div>
        <div class="rv-more">More on ${PersonCard.link(r.pid, 'their card')}: teach, swear, court, denounce.</div></div>`
    }

    const inh = r.inherited ? `<div class="rv-house">${Icon('lineage')}<span>Their line has stood against yours since <b>${esc(r.inherited.fromName)}</b>, your rival in life ${r.inherited.fromLife}${r.inherited.end === 'slain' ? ', whom you killed' : r.inherited.end === 'killedYou' ? ', who killed you' : ''}. The heat carried: ${this._signed(r.inherited.heat)} then, ${this._signed(Math.round(r.inherited.heat / 2))} at the start of this life.</span></div>` : ''

    const beats = r.beats.length ? `<div class="bd-sec-title">The rivalry so far</div><ol class="rv-beats">${r.beats.map(b =>
      `<li class="rv-beat ${b.tone || ''}"><span class="rv-by">yr ${b.y}</span><span class="rv-bt">${esc(b.text)}</span></li>`).join('')}</ol>` : ''

    const hint = r.hint ? `<div class="er-hint rv-hint">${Icon('why')}<span>${esc(NPC_RIVAL_TEXT.hint)}</span><button class="er-hint-x" data-rv-hint aria-label="Got it">Got it</button></div>` : ''

    el.innerHTML = `<div class="rv-view">
      <div class="rv-title">Your rival <span class="cls-yr">life ${r.life}</span></div>
      ${hint}${face}${inh}${heat}${rec}${next}${acts}${beats}${this._past(r, realm)}
    </div>`
  },

  // 4.8: where the rankings put the two of you (Heaven, then Rising Dragon), with a door to World → Rankings.
  _ranks(r) {
    if (!r.ranks) return ''
    const t = r.ranks.them || {}, y = r.ranks.you || {}, pl = n => n ? `#${n}` : '—'
    const row = (k, label) => (t[k] || y[k]) ? `<span>${label}: you <b>${pl(y[k])}</b> · they <b>${pl(t[k])}</b></span>` : ''
    const body = row('heaven', 'Under Heaven') + row('dragon', 'Rising Dragon')
    return body ? `<div class="rv-ranks">${Icon('crown')}<span class="rv-ranks-b">${body}</span><button class="er-heat-go" data-rv-go="rankings">The rankings</button></div>` : ''
  },

  // Earlier lives' rivals, and a house that will send its heir into your next class.
  _past(r, realm) {
    const esc = this.h.esc
    const houses = (r.houses || []).map(h => `<div class="rv-house">${Icon('lineage')}<span>The <b>${esc(h.surname)}</b> line remembers ${esc(h.fromName)} (heat ${this._signed(h.heat)}). Their heir will awaken in your next class.</span></div>`).join('')
    if (!r.past?.length) return houses
    const end = x => ({ slain: 'You killed them', killedYou: 'They killed you', fell: 'Fell', ascended: 'Ascended', lifeEnded: 'Outlived you' }[x.end] || 'Ended')
    return `${houses}<details class="cls-fallen rv-past"><summary class="bd-sec-title cls-sec">Rivals of past lives · ${r.past.length}</summary><div class="cls-list">${r.past.map(x =>
      `<div class="cls-row${x.alive ? '' : ' dead'}"><span class="cls-n">${x.life}</span><span class="cls-body"><span class="cls-who">${PersonCard.link(x.pid, x.name)}<span class="pc-chip ${x.tone || 'dim'}">${esc(x.word)}</span></span>
        <span class="cls-meta">${esc(end(x))} · ${x.meets} met · ${x.wins}–${x.losses} · heat ${this._signed(x.heat)}</span></span></div>`).join('')}</div></details>`
  },
}
