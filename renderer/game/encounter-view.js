// EncounterView — Roam → Explore → "Met on the road" (Phase 28 task 4.9, docs/systems/living-world.md → "4.9 as built").
// The world's people meet you on expeditions, sect missions and at your gate. Each waits as a card (≤ 6, never expires):
// a compact row (what they want, who, where) that opens in place into the full card: who they are (tappable name →
// person card, the "known face" pill, realm · temper · character · how they feel about you), what happened, WHY they
// came, and your answers with their odds, costs and lock reasons. Your bearing on the road (Wary · Courteous · Bold ·
// Ruthless) only marks one answer as "your bearing" — nothing is ever answered for you. The old lover / formula
// strangers (family.encounters) are appended to the same list by game.js. Data: gameState.roadCards(),
// answerRoadCard(), setRoadStance(), noteRoadHint(). UI only.

const EncounterView = {
  gs: null,
  h: null,              // { esc, stageLabel(i), flash(text, tone), onFight() }
  open: null,           // the card shown open (else the first urgent / first one)

  KIND_ICON: { ambush: 'sword', challenge: 'duel', rescue: 'health', contest: 'chest', teamup: 'couple', youth: 'disciple', oldface: 'eye',
               rivalDuel: 'duel', rivalTalk: 'bond', rivalTrouble: 'health', rivalKin: 'skull',   // 4.10b: your rival's cards
               rankChallenge: 'crown', hunter: 'skull', hunterKin: 'skull', invite: 'gate' },   // 4.8: rankings cards
  KIND_WORD: { ambush: 'Ambush', challenge: 'Challenge', rescue: 'Rescue', contest: 'Contest', teamup: 'Company', youth: 'Youth', oldface: 'Old face',
               rivalDuel: 'Rival', rivalTalk: 'Rival', rivalTrouble: 'Rival', rivalKin: 'Blood feud',
               rankChallenge: 'Ranked', hunter: 'Hunter', hunterKin: 'Hunter', invite: 'Invitation' },

  init(gs, helpers) { this.gs = gs; this.h = helpers; return this },

  // How they feel about you, in a word (with an icon so it isn't colour alone).
  _feel(rel) {
    if (rel >= 60) return { w: 'Devoted', tone: 'jade', icon: 'heart' }
    if (rel >= 30) return { w: 'Warm', tone: 'jade', icon: 'heart' }
    if (rel <= -60) return { w: 'Hateful', tone: 'red', icon: 'broken' }
    if (rel <= -30) return { w: 'Cold', tone: 'red', icon: 'broken' }
    return rel ? { w: 'Indifferent', tone: '', icon: null } : { w: 'A stranger to you', tone: '', icon: null }
  },

  // The section, or null when nobody waits. `extra` = how many family strangers game.js will append to .er-list.
  render(s) {
    const info = this.gs.roadCards(), cards = info.cards, extra = info.family
    if (!cards.length && !extra) return null
    const esc = this.h.esc
    const sec = document.createElement('section')
    sec.className = 'er-road'
    if (this.open !== '__none' && !cards.some(c => c.id === this.open)) this.open = (cards.find(c => c.urgent) || cards[0])?.id || null
    const st = info.stances.find(x => x.id === info.stance)
    const n = cards.length + extra
    sec.innerHTML = `
      <div class="er-head"><span class="section-title">Met on the road</span><span class="er-count" title="Cards waiting, of ${info.max}. When the road is full, passers-by become a line in your log; those who matter to you wait.">${n}/${info.max}</span></div>
      ${cards.length ? `<div class="er-stance" role="group" aria-label="Your bearing on the road">
        <span class="er-stance-l">Your bearing</span>
        <span class="set-seg">${info.stances.map(x => `<button class="set-opt${x.id === info.stance ? ' active' : ''}" data-er-stance="${x.id}" title="${esc(x.hint)}">${esc(x.label)}</button>`).join('')}</span>
        <small class="er-stance-h">${esc(st?.hint || '')} It only marks an answer; you always choose.</small>
      </div>` : ''}
      <div class="er-list">${cards.map(c => this._card(c)).join('')}</div>
      ${cards.length && !info.hintSeen ? `<div class="er-hint">${Icon('why')}<span>People here act on their own. Each waits until you answer. Tap a name to see who they are.</span><button class="er-hint-x" data-er-hint aria-label="Got it">Got it</button></div>` : ''}
      ${info.waiting ? `<div class="er-wait">${Icon('person')}<span>${info.waiting} more ${info.waiting === 1 ? 'is' : 'are'} looking for you, and will come when a place frees.</span></div>` : ''}`
    sec.addEventListener('click', e => this._click(e))
    return sec
  },

  _card(c) {
    const esc = this.h.esc, open = c.id === this.open
    const icon = c.gate ? 'gate' : this.KIND_ICON[c.kind] || 'person'
    const head = `<button class="er-row" data-er-open="${c.id}" aria-expanded="${open}">
        <span class="er-ic">${Icon(icon)}</span>
        <span class="er-rt"><b class="er-title">${esc(c.title)}</b><small>${esc(c.name)} · ${esc(c.place)}${c.ago > 0 ? ` · ${c.ago} yr ago` : ''}</small></span>
        <span class="er-tag ${c.urgent ? 'urgent' : c.rival ? 'rival' : c.rank ? 'rank' : ''}">${esc(c.avenger ? 'Vengeance' : c.blood ? 'Blood feud' : this.KIND_WORD[c.kind] || '')}</span>
      </button>`
    if (!open) return `<div class="er-card${c.urgent ? ' urgent' : ''}">${head}</div>`
    const f = this._feel(c.rel), known = PersonCard.known(c.pid)
    const who = [this.h.stageLabel(c.stage), c.temper, c.morality].filter(Boolean).map(esc).join(' · ')
    const ans = c.answers.map(a => {
      const pre = a.id === c.pre
      return `<button class="er-ans ${a.tone || ''}${pre ? ' pre' : ''}" data-er-ans="${a.id}" data-er-card="${c.id}" ${a.lock ? 'disabled' : ''}>
          <span class="er-al">${esc(a.label)}${pre ? '<em class="er-pre">your bearing</em>' : ''}</span>
          ${a.lock ? `<small class="er-lock">${Icon('lock')}${esc(a.lock)}</small>` : a.note ? `<small>${esc(a.note)}</small>` : ''}
        </button>`
    }).join('')
    return `<div class="er-card open${c.urgent ? ' urgent' : ''}">${head}
      <div class="er-body">
        <div class="er-who">${PersonCard.link(c.pid, c.name)}${known ? ' ' + known : ''}${c.rival ? '' : `<span class="er-feel ${f.tone}">${f.icon ? Icon(f.icon) : ''}${esc(f.w)}</span>`}</div>
        <div class="er-meta">${who}</div>
        ${c.rank ? `<div class="er-heat er-rank">${Icon('crown')}<span>${esc(this._rankLine(c))}</span><button class="er-heat-go" data-er-ranks>The rankings</button></div>` : ''}
        ${c.rival ? `<div class="er-heat">${Icon('duel')}<span>Your rival · heat <b>${c.heat > 0 ? '+' : c.heat < 0 ? '−' : ''}${Math.abs(c.heat)}</b> · ${esc(c.heatWord)}</span><button class="er-heat-go" data-er-rival>The rivalry</button></div>` : ''}
        <p class="er-text">${esc(c.text)}</p>
        <p class="er-why">${Icon('why')}<span>${esc(c.why)}</span></p>
        <div class="er-answers">${ans}</div>
      </div></div>`
  },

  _click(e) {
    const t = e.target.closest('[data-er-open],[data-er-ans],[data-er-stance],[data-er-hint],[data-er-rival],[data-er-ranks]')
    if (!t || t.disabled) return
    if (t.dataset.erRanks != null) return this.h.goRanks?.()   // 4.8: World → Rankings
    if (t.dataset.erRival != null) return this.h.goRival?.()   // 4.10b: World → Rival
    if (t.dataset.erOpen) { this.open = this.open === t.dataset.erOpen ? '__none' : t.dataset.erOpen; return this._redraw() }
    if (t.dataset.erStance) { this.gs.setRoadStance(t.dataset.erStance); return }
    if (t.dataset.erHint != null) { this.gs.noteRoadHint(); return this._redraw() }
    const res = this.gs.answerRoadCard(t.dataset.erCard, t.dataset.erAns)
    if (!res.ok) return this.h.flash(res.lock || 'You cannot do that now.', 'negative')
    this.open = null
    if (res.fight) return this.h.onFight()
    this.h.flash(res.text, 'special')
  },
  // 4.8: where the rankings put the two of you (the card's crown line).
  _rankLine(c) {
    const x = c.rank || {}, on = { heaven: 'under Heaven', dragon: 'among the Rising Dragons', class: 'in your class' }[x.board] || ''
    if (c.kind === 'hunterKin') return `${c.kin?.name || 'Your child'} stands #${x.theirs ?? '?'} ${on}`
    if (c.kind === 'rankChallenge') return `You #${x.yours ?? '?'} · they #${x.theirs ?? '?'} ${on}`
    return x.yours ? `You stand #${x.yours} ${on}` : 'The rankings know your name'
  },
  _redraw() { this.h.rerender() },
}
