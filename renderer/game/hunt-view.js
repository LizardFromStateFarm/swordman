// HuntView + BestiaryView — Roam → Hunt and Roam → Bestiary (Phase 35 / roadmap A6-2, docs/systems/combat.md → "the Hunt").
// Hunt: the hunting grounds (HUNT_GROUNDS, assets/data/beasts.js) as cards — realm gate, what lives there (with your odds
// of meeting each kind you can meet; unseen kinds stay unnamed), danger, track time + cost, and the lock reason — plus the
// current search (a live countdown, Call off) and what it found (Fight it / look at it in Beasts). Bestiary: every beast
// kind as a card; unseen ones are silhouettes with only their realm gate and where to hunt them; seen ones show the
// portrait, nature, lore, learned habits and your record. Both render into their panels from game.js (VIEW_RENDER);
// state comes from gameState.huntInfo() / bestiaryEntry(). h: { esc, flash, fight(encId), go(view), fmtTime }.

const HUNT_LOCK_TEXT = {
  stage: g => `Opens at ${typeof stageShortName === 'function' ? stageShortName(g.minStage) : 'stage ' + g.minStage}.`,
  busy: () => 'You are already on a hunt.',
  crowded: () => 'Three beasts already wait for you in Roam → Beasts. Deal with one first.',
  stones: g => `Costs ${g.cost} Spirit Stones to outfit the hunt.`,
}

const HuntView = {
  render(s, el, gs, h) {
    const esc = h.esc, info = gs.huntInfo()
    const realm = i => typeof stageShortName === 'function' ? stageShortName(i) : 'stage ' + i
    const cur = info.hunt
    let status = ''
    if (cur?.found && cur.foundEnc) {
      const prof = gs.beastProfile(cur.foundEnc)
      status = `<div class="hunt-now found">
        <div class="hunt-found-art">${BeastPortraits.html('enc:' + cur.foundEnc.id, prof.art)}</div>
        <div class="hunt-now-t"><div class="hunt-k">The hunt is over</div>
          <div class="hunt-now-n">You found ${/^[aeiou]/i.test(prof.name) ? 'an' : 'a'} ${esc(prof.name)}${cur.foundEnc.mood === 'vengeful' ? ', and it remembers you' : cur.foundEnc.mood === 'grateful' ? ', one you spared once' : ''} in ${esc(cur.ground?.name || 'the wilds')}.</div>
          <div class="hunt-wait"><span data-icon="lock"></span>Deal with it (fight, tame or leave it in Roam → Beasts) before you track another.</div>
          <div class="hunt-acts"><button class="hunt-btn gold" data-hunt-fight="${esc(cur.foundEnc.id)}"><span data-icon="sword"></span>Fight it</button>
            <button class="hunt-btn" data-hunt-go="beasts">See it in Beasts</button></div></div></div>`
    } else if (cur && !cur.found) {
      const total = (cur.endsAt - cur.startedAt) / 1000, pct = Math.max(0, Math.min(100, 100 * (1 - cur.left / total)))
      status = `<div class="hunt-now">
        <div class="hunt-now-t"><div class="hunt-k">Tracking in ${esc(cur.ground?.name || '')}</div>
          <div class="hunt-bar"><b style="width:${pct.toFixed(1)}%" data-hunt-bar="${cur.startedAt}:${cur.endsAt}"></b></div>
          <div class="hunt-sub"><span data-hunt-left="${cur.endsAt}">${h.fmtTime(cur.left)}</span> left · the search goes on while the game is closed</div></div>
        <button class="hunt-btn quiet" data-hunt-cancel>Call off</button></div>`
    }
    const cards = info.grounds.map(g => {
      const locked = s.stageIndex < g.minStage
      const kinds = g.table.map(r => r.seen || (r.open && !locked)
        ? `<span class="hunt-kind tier-txt-${r.tier}${r.open ? '' : ' closed'}">${esc(r.seen ? r.name : 'Unknown beast')}${r.open ? `<small>${Math.round(r.chance * 100)}%</small>` : `<small>${esc(realm(r.minStage))}+</small>`}</span>`
        : `<span class="hunt-kind unknown">Unknown beast<small>${esc(realm(r.minStage))}+</small></span>`).join('')
      const lock = g.lock && g.lock !== 'busy' ? HUNT_LOCK_TEXT[g.lock]?.(g) : null
      const here = cur && cur.groundId === g.id
      return `<div class="hunt-card${locked ? ' locked' : ''}${here ? ' here' : ''}">
        <div class="hunt-head"><span class="hunt-name">${esc(g.name)}</span><span class="tier-chip tier-${g.danger}" title="The most dangerous beast here">${esc(BEAST_TIERS[g.danger]?.name || g.danger)}</span></div>
        <div class="hunt-desc">${esc(g.desc)}</div>
        <div class="hunt-kinds">${kinds}</div>
        <div class="hunt-foot"><span class="hunt-meta">${esc(realm(g.minStage))}+ · ${h.fmtTime(g.trackSeconds)} · ${g.cost ? g.cost + ' stones' : 'free'}</span>
          ${here ? `<span class="hunt-tag">${cur.found ? 'Found here' : 'Hunting here'}</span>` : `<button class="hunt-btn" data-hunt-start="${esc(g.id)}" ${g.lock ? 'disabled' : ''}>Track a beast</button>`}</div>
        ${lock ? `<div class="hunt-lock"><span data-icon="lock"></span>${esc(lock)}</div>` : ''}
      </div>`
    }).join('')
    el.innerHTML = `<div class="view-lede">Go looking for a beast instead of waiting for one to cross your path. When the search ends, the beast waits in Roam → Beasts: fight it, tame it, or leave it.</div>
      ${status}${this._legendary(gs, h)}<div class="hunt-k hunt-sec">Hunting grounds</div><div class="hunt-grid">${cards}</div>`
    BeastPortraits.mount(el, gs.getSettings())
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return
      if (b.dataset.huntStart) {
        const r = gs.startHunt(b.dataset.huntStart)
        if (r.ok) h.flash('The hunt begins.', 'positive')
        else h.flash(HUNT_LOCK_TEXT[r.reason]?.(HUNT_GROUNDS.find(g => g.id === b.dataset.huntStart)) || 'You cannot hunt now.', 'negative')
      }
      if (b.dataset.huntCancel != null) gs.cancelHunt()
      if (b.dataset.huntFight) h.fight(b.dataset.huntFight)
      if (b.dataset.huntGo) h.go(b.dataset.huntGo)
      if (b.dataset.bossFight) { gs.markBossSeen(b.dataset.bossFight); h.fightBoss?.(b.dataset.bossFight) }
    }
  },

  // v1 add-on (docs/systems/bosses.md): the Legendary section — two bosses, their gates as a checklist, the phase script,
  // your record (tries / wins / mercy, what you have learned), the technique each teaches, the rest countdown, Face it.
  _legendary(gs, h) {
    const esc = h.esc, list = gs.bossInfo?.() || []
    if (!list.length) return ''
    const LOCK = { life: 'Not in this life', stage: 'Not yet: your realm', won: 'Beaten this life: it wakes again in your next', rest: 'It rests' }
    const ROMAN = ['I', 'II', 'III', 'IV']
    const cards = list.map(b => {
      const known = b.seen || !b.lock || b.lock === 'rest' || b.wins
      const gates = b.gates.map(g => `<li class="${g.ok ? 'ok' : 'no'}"><span data-icon="${g.ok ? 'check' : 'lock'}"></span>${esc(g.text)}<small>${esc(g.now)}</small></li>`).join('')
      const phases = b.phases.map((p, i) => `<li><b>${ROMAN[i]} · ${esc(p.name)}</b><span>${esc(p.text)}</span></li>`).join('')
      const rec = b.tries || b.wins ? `<div class="boss-rec">Faced ${b.tries + b.wins} · beaten ${b.wins}${b.mercy ? ` · spared ${b.mercy}` : ''}${b.learn ? ` · <span class="up">you know its rhythm: +${Math.round(b.learn * 100)}% might</span>` : ''}</div>` : ''
      const tech = `<div class="boss-tech${b.technique.known ? ' known' : ''}"><span data-icon="soul"></span><span><b>${esc(b.technique.name)}</b>${b.technique.known ? ' · your soul keeps it' : ' · taught once, kept in every life'}${b.technique.desc ? `<small>${esc(b.technique.desc)}</small>` : ''}</span></div>`
      const act = !b.lock ? `<button class="hunt-btn gold" data-boss-fight="${esc(b.id)}"><span data-icon="sword"></span>Face it</button>`
        : b.lock === 'rest' ? `<span class="boss-lock"><span data-icon="lock"></span>It rests: <span data-hunt-left="${Date.now() + b.restLeft * 1000}">${h.fmtTime(b.restLeft)}</span></span>`
        : `<span class="boss-lock"><span data-icon="lock"></span>${esc(LOCK[b.lock] || 'Not now')}</span>`
      const art = known && b.art ? BeastPortraits.html('boss:' + b.id, b.art) : `<span class="boss-sil" data-icon="${b.id === 'wraith' ? 'mask' : 'beast'}"></span>`
      return `<div class="boss-card boss-${esc(b.id)}${b.lock && b.lock !== 'rest' ? ' locked' : ''}">
        <div class="boss-art">${art}</div>
        <div class="boss-body">
          <div class="boss-head"><span class="boss-name">${esc(known ? b.name : 'A legend, unseen')}</span><span class="cb-el el-${esc(b.element)}">${Icon(ART_ELEMENTS[b.element]?.icon || 'el_neutral')}</span></div>
          <div class="boss-line">${esc(known ? b.line : b.lore)}</div>
          <ul class="boss-gates">${gates}</ul>
          ${known ? `<ol class="boss-phases">${phases}</ol>` : ''}
          ${tech}${rec}
          <div class="boss-foot"><span class="hunt-meta">Win: ${esc(b.drop.n + ' ' + b.drop.name)} or mercy · lose: never death, a real-time rest</span>${act}</div>
        </div></div>`
    }).join('')
    return `<div class="hunt-k hunt-sec">Legendary</div><div class="boss-grid">${cards}</div>`
  },

  // every tick while the Hunt view is open: the countdown + bar, without a re-render
  tickInPlace(root, fmtTime) {
    for (const sp of root.querySelectorAll('[data-hunt-left]')) sp.textContent = fmtTime(Math.max(0, Math.ceil((+sp.dataset.huntLeft - Date.now()) / 1000)))
    for (const b of root.querySelectorAll('[data-hunt-bar]')) {
      const [a, z] = b.dataset.huntBar.split(':').map(Number)
      b.style.width = Math.max(0, Math.min(100, 100 * (Date.now() - a) / (z - a))).toFixed(1) + '%'
    }
  },
}

const BestiaryView = {
  render(s, el, gs, h) {
    const esc = h.esc
    const realm = i => typeof stageShortName === 'function' ? stageShortName(i) : 'stage ' + i
    const types = [...BEAST_TYPES].sort((a, b) => a.minStage - b.minStage)
    const recs = types.map(t => ({ t, r: gs.bestiaryEntry(t.id) }))
    const seen = recs.filter(x => x.r.seen).length
    const tot = k => recs.reduce((a, x) => a + (x.r[k] || 0), 0)
    // 2026-09-30 (user): the rare colour variant of a kind (one each) — whether you have run into it yet
    const variantOf = t => (t.variants || [])[0] || null
    const vTotal = recs.reduce((a, { t }) => a + (variantOf(t) ? 1 : 0), 0)
    const vMet = recs.reduce((a, { t, r }) => a + (variantOf(t) && (r.variants || {})[variantOf(t).id] ? 1 : 0), 0)
    const where = t => HUNT_GROUNDS.filter(g => (g.types[t.id] || 0) >= 1).map(g => g.name)[0] || HUNT_GROUNDS.find(g => g.types[t.id])?.name || ''
    const pct = v => `${Math.round(v * 100)}%`
    const cards = recs.map(({ t, r }) => {
      if (!r.seen) return `<div class="bst-card unseen">
          <div class="bst-art"><span class="bst-sil" data-icon="beast"></span></div>
          <div class="bst-body"><div class="bst-name">Unknown beast<span class="tier-chip tier-${t.tier}">${esc(BEAST_TIERS[t.tier]?.name || t.tier)}</span></div>
          <div class="bst-meta">Appears from ${esc(realm(t.minStage))} · hunt it in ${esc(where(t))}</div></div></div>`
      const prof = gs.beastProfile({ typeId: t.id })
      const nature = BEAST_NATURE[t.id] || 'wild'
      const style = BEAST_FIGHT_STYLE[t.id] || BEAST_FIGHT_STYLE.default, W = style.press + style.guard + style.feint
      const habits = r.habitsKnown
        ? `<div class="bst-habits" title="How often it presses, guards and feints"><span>Press <b style="--w:${pct(style.press / W)}"></b>${pct(style.press / W)}</span><span>Guard <b style="--w:${pct(style.guard / W)}"></b>${pct(style.guard / W)}</span><span>Feint <b style="--w:${pct(style.feint / W)}"></b>${pct(style.feint / W)}</span></div><div class="bst-hint">${esc(style.hint)}.</div>`
        : `<div class="bst-hint dim">Habits unknown: fight one to learn how it fights.</div>`
      const rec = r.fought ? `Fought ${r.fought} · won ${r.won} · slain ${r.slain}${r.spared ? ` · spared ${r.spared}` : ''}${r.bound ? ` · bound ${r.bound}` : ''}` : 'Never fought'
      const v = variantOf(t), vMet = v && !!(r.variants || {})[v.id]
      const vars = v ? `<div class="bst-vars"><span class="bst-vars-k">Rare colour</span>${vMet
        ? `<span class="bst-var met"><i class="bst-var-dot var-${esc(v.id)}"></i>${esc(v.name)}</span>`
        : `<span class="bst-var" title="A rare colour of this beast you have not met yet"><i class="bst-var-dot"></i>Not yet seen</span>`}</div>` : ''
      return `<div class="bst-card nature-${nature}">
          <div class="bst-art">${BeastPortraits.html('bst:' + t.id, prof.art)}</div>
          <div class="bst-body"><div class="bst-name">${esc(t.name)}<span class="tier-chip tier-${t.tier}">${esc(BEAST_TIERS[t.tier]?.name || t.tier)}</span></div>
          <div class="bst-meta">${esc(BEAST_NATURE_TEXT[nature] || nature)} · hunt it in ${esc(where(t))}</div>
          <div class="bst-meta">Appears from ${esc(realm(t.minStage))}</div>
          <div class="bst-lore">${esc(t.desc)}</div>
          ${habits}
          <div class="bst-rec">${rec}</div>
          ${r.returning ? '<div class="bst-back">Something out there remembers you.</div>' : ''}</div>${vars}</div>`
    }).join('')
    el.innerHTML = `<div class="view-lede">Seen <b>${seen}</b> of ${types.length} kinds · rare colours <b>${vMet}</b> of ${vTotal} met · slain ${tot('slain')} · spared ${tot('spared')} · bound ${tot('bound')}</div>
      <div class="bst-grid">${cards}</div>`
    BeastPortraits.mount(el, gs.getSettings())
  },
}

if (typeof module !== 'undefined') module.exports = { HuntView, BestiaryView }
