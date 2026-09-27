// SectView — 宗 Sect as sub-views (roadmap 1.8b-5, Phase 33): Overview · Missions · War for a sect you joined,
// Overview · Buildings · Disciples · War for one you founded, and the list of sects (+ founding) when you have none.
// Replaces the old one-long-list Sect tab (15 screens of scroll for a founder). Every number says what it is made
// of: the sect's blessing in plain terms, what each rank / mission / building / disciple gives, and war odds that
// are the real roll (gameState.sectWarOdds(), "why" card data-bd="sectwar"). Built from the Family/Clan components
// (fam-card, fam-sec, fa-btn) — styles.css → "Sect views". See docs/systems/ui-layout.md → "Sect views".

// A sect's `effects` in words: [label, value, appliesNow?]. UI only.
function sectEffectList(fx, s) {
  const pct = v => `${Math.round(v * 100)}%`
  const out = []
  if (fx.qps_mult)             out.push(['Qi per second', `×${fx.qps_mult}`, true])
  if (fx.weapon_qps_mult)      out.push(['Qi per second with a weapon', `×${fx.weapon_qps_mult}`, !s || !!s.equipped?.weapon])
  if (fx.artifact_qps_mult)    out.push(['Qi per second with an artifact', `×${fx.artifact_qps_mult}`, !s || !!s.equipped?.artifact])
  if (fx.bt_bonus)             out.push(['Breakthrough chance', `+${pct(fx.bt_bonus)}`, true])
  if (fx.bt_floor)             out.push(['Breakthrough chance never below', pct(fx.bt_floor), true])
  if (fx.loot_mult)            out.push(['Expedition loot', `×${fx.loot_mult}`, true])
  if (fx.herb_mult)            out.push(['Spirit Herb drops', `×${fx.herb_mult}`, true])
  if (fx.craft_double_chance)  out.push(['Crafts come out double', pct(fx.craft_double_chance), true])
  if (fx.hidden_locations)     out.push(['Hidden expedition sites', 'revealed', true])
  if (fx.integrity_regen_mult) out.push(['Integrity recovers', `×${fx.integrity_regen_mult} faster`, true])
  return out
}

const SV_STARS = t => `<span class="sv-stars" title="Talent ${t} of 5">${'★'.repeat(t)}<i>${'★'.repeat(5 - t)}</i></span>`

class SectView {
  // h: { esc, fmt, fmtTime, flash, confirm, go(view), orders(s, el, side), startMission(id) }
  constructor(gameState, h) {
    this.gs = gameState
    this.h = h
    this.foundName = ''   // the founding name survives re-renders (any state change redraws the view)
    for (const v of SectView.VIEWS) document.getElementById('tab-' + v).addEventListener('click', e => this._click(e))
    document.getElementById('tab-sect').addEventListener('input', e => { if (e.target.id === 'sv-found-name') this.foundName = e.target.value })
  }

  // Which sub-views your standing offers (NavUI.setAvailable)
  static viewsFor(s) {
    if (s.ownSect?.founded) return ['sect', 'sect-halls', 'sect-disciples', 'sect-war']
    if (s.sect?.id) return ['sect', 'sect-missions', 'sect-war']
    return ['sect']
  }

  render(view, s) {
    const el = document.getElementById('tab-' + view)
    const own = s.ownSect?.founded, def = !own && s.sect?.id ? SECTS.find(x => x.id === s.sect.id) : null
    let html = ''
    if (view === 'sect') html = own ? this._ownOverview(s) : def ? this._memberOverview(s, def) : this._unaffiliated(s)
    else if (view === 'sect-missions' && def) html = this._missions(s, def)
    else if (view === 'sect-halls' && own) html = this._halls(s)
    else if (view === 'sect-disciples' && own) html = this._disciples(s)
    else if (view === 'sect-war' && (own || def)) html = this._war(s, own)
    el.innerHTML = html
    el.querySelectorAll('[data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
    const orders = el.querySelector('.sv-orders')
    if (orders) this.h.orders(s, orders, own ? 'own' : 'member')
    const input = el.querySelector('#sv-found-name')
    if (input) input.value = this.foundName
  }

  // ── pieces ──────────────────────────────────────────────────────────────────
  _tile(act, glyph, name, effect, lock, cls = '', extra = '') {
    return `<button class="fa-btn${cls ? ' ' + cls : ''}${lock ? ' locked' : ''}" data-sa="${act}"${extra} ${lock ? 'disabled' : ''}>
      <span class="fa-g">${Icon.g(glyph)}</span><span class="fa-t"><span class="fa-n">${name}</span>
      <span class="fa-e">${lock ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${this.h.esc(lock)}</span>` : effect}</span></span></button>`
  }
  _sec(title, body, count = '', cls = '') {
    return `<section class="fam-sec${cls ? ' ' + cls : ''}"><div class="fam-sec-title"><span>${title}</span>${count !== '' ? `<span class="fam-count">${count}</span>` : ''}</div>${body}</section>`
  }
  _stat(k, v, tone = '', note = '') {
    return `<div class="sv-stat"><span class="sv-k">${k}</span><span class="sv-v${tone ? ' tone-' + tone : ''}">${v}</span>${note ? `<span class="sv-n">${note}</span>` : ''}</div>`
  }
  _effects(fx, s, suppressed) {
    const list = sectEffectList(fx, s)
    if (!list.length) return ''
    return `<div class="sv-fx${suppressed ? ' suppressed' : ''}">${list.map(([k, v, on]) =>
      `<div class="sv-fx-row${on ? '' : ' off'}"><span>${k}</span><b>${v}</b>${on ? '' : '<em>not now</em>'}</div>`).join('')}</div>`
  }
  _cost(stones, have) {
    const short = Math.max(0, stones - have)
    return `<span class="cost">${this.h.fmt(stones)} stones</span>${short ? ` <span class="down">· ${this.h.fmt(short)} short</span>` : ''}`
  }
  _oddsClass(p) { return p < 0.35 ? 'odds-low' : p < 0.6 ? 'odds-mid' : 'odds-good' }
  _pct(p) { return `${(p * 100).toFixed(1)}%` }
  _warClock(w) {
    const target = w.phase === 'scouting' ? w.scoutEndsAt + (w.side === 'member' ? MEMBER_WAR_PREP_SECONDS * 1000 : 0)
                 : w.phase === 'preparing' ? w.prepEndsAt : w.nextWarAt
    return `<span class="nw" data-wartimer>${this.h.fmtTime(Math.max(0, Math.ceil((target - Date.now()) / 1000)))}</span>`
  }

  // ── No sect ────────────────────────────────────────────────────────────────
  _unaffiliated(s) {
    const h = this.h
    const cards = SECTS.filter(d => d.minStage <= s.stageIndex + 3).map(d => {
      const ok = s.stageIndex >= d.minStage
      return `<div class="sv-sect${ok ? '' : ' locked'}">
        <div class="sv-sect-head"><span class="sv-sect-n" title="${h.esc(d.nameCN)}">${h.esc(d.name)}</span>
          ${this._tile('join', ok ? 'gate' : 'lock', ok ? 'Join' : 'Sealed', '', ok ? '' : stageShortName(d.minStage), 'sv-join', ` data-id="${d.id}"`)}</div>
        <div class="sv-sect-d">${h.esc(d.desc)}</div>${this._effects(d.effects, null)}</div>`
    }).join('')
    const hidden = SECTS.filter(d => d.minStage > s.stageIndex + 3).length
    return `<div class="fam-view sect-view">
      <div class="fam-col">
        <section class="fam-card alone"><div class="fc-head"><span class="fc-glyph dim" data-icon="person"></span><div class="fc-id">
          <div class="fc-name">A wandering cultivator</div>
          <div class="fc-sub">No sect claims you. A sect lends its blessing, sets you missions for contribution, and calls you to its wars. You may leave at any time, at a small cost in karma.</div></div></div></section>
        ${this._sec('Sects that would take you', cards + (hidden ? `<div class="fk-note">${hidden} more sect${hidden === 1 ? '' : 's'} will not look at you until you are stronger.</div>` : ''), SECTS.length - hidden)}
      </div>
      <div class="fam-col">${this._foundCard(s)}</div></div>`
  }

  _foundCard(s) {
    const F = SECT_FOUNDING, h = this.h
    if (s.stageIndex < F.minStage - 3) return ''
    const stageOk = s.stageIndex >= F.minStage
    const needs = [[`Spirit Stones`, F.stones, s.spiritStones], ...Object.entries(F.items).map(([id, q]) => [ITEMS[id]?.name || id, q, s.inventory[id] || 0])]
    const canPay = needs.every(([, q, have]) => have >= q)
    const lock = !stageOk ? stageShortName(F.minStage) : s.sect?.id ? 'Leave your sect first' : !canPay ? 'Gather the cost first' : ''
    return `<section class="fam-card sect"><div class="fc-head"><span class="fc-glyph" data-icon="gate"></span><div class="fc-id">
        <div class="fc-name">Found your own sect</div>
        <div class="fc-sub">Raise halls, take disciples who feed you Qi and stones, and hold your mountain against rivals.</div></div></div>
      <div class="sv-needs">${needs.map(([n, q, have]) => `<div class="sv-need${have >= q ? ' met' : ''}"><span>${h.esc(n)}</span><b>${h.fmt(Math.min(have, q))} / ${h.fmt(q)}</b></div>`).join('')}
        <div class="sv-need wide${stageOk ? ' met' : ''}"><span>Realm</span><b>${h.esc(CULTIVATION_STAGES[F.minStage].realm)}${stageOk ? ' · reached' : ''}</b></div></div>
      ${stageOk ? `<input id="sv-found-name" class="sect-input sv-input" maxlength="${F.maxNameLen}" placeholder="Name your sect…">` : ''}
      ${this._tile('found', 'gate', 'Found the sect', 'your name above the mountain gate', lock, 'wide')}</section>`
  }

  // ── Joined sect ────────────────────────────────────────────────────────────
  _rankCard(s, def) {
    const h = this.h, sect = s.sect, rank = SECT_RANKS[sect.rank], next = SECT_RANKS[sect.rank + 1]
    const prog = next ? Math.min(100, Math.max(0, (sect.contribution - rank.minContribution) / (next.minContribution - rank.minContribution) * 100)) : 100
    const needC = next ? Math.max(0, next.minContribution - sect.contribution) : 0
    const toRank = next ? Math.ceil(needC / SECT_DONATE_RATE) : 0
    const tiles = [
      this._tile('rankup', 'rise', next ? `Rise to ${h.esc(next.name)}` : 'Highest rank', next ? `rewards <span class="up">×${next.rewardMult}</span> (now ×${rank.rewardMult})` : 'nothing above you but the sect master',
        next && needC > 0 ? `${h.fmt(needC)} more Contribution` : !next ? 'You stand at the top' : ''),
      this._tile('donate', 'stone', 'Give 10 stones', `+${Math.floor(10 * SECT_DONATE_RATE)} Contribution`, s.spiritStones < 10 ? 'You carry fewer than 10 stones' : '', '', ' data-n="10"'),
    ]
    if (next && needC > 0 && toRank > 10)
      tiles.push(this._tile('donate', 'stone', `Give ${h.fmt(toRank)} stones`, `enough to rise to ${h.esc(next.name)}`, s.spiritStones < toRank ? `You hold ${h.fmt(Math.floor(s.spiritStones))}` : '', 'key', ` data-n="${toRank}"`))
    return `<section class="fam-card sect">
      <div class="fc-head"><span class="fc-glyph" data-icon="hall"></span><div class="fc-id"><div class="fc-name" title="${h.esc(def.nameCN)}">${h.esc(def.name)}</div>
        <div class="fc-sub">${h.esc(def.desc)}</div>
        <div class="fc-tags"><span class="fam-tag tone-gold"><b data-icon="rise"></b>${h.esc(rank.name)}</span><span class="fam-tag">rewards ×${rank.rewardMult}</span></div></div></div>
      <div class="fc-aff static"><span class="fa-row"><span class="fa-k">Contribution</span><span class="fa-v">${h.fmt(sect.contribution)}${next ? ` <span class="sv-of">/ ${h.fmt(next.minContribution)}</span>` : ''}</span></span>
        <span class="fam-bar"><i class="tone-gold" data-w="${prog}"></i></span>
        <span class="fa-last">${next ? `Earned from missions, war service and gifts. ${h.esc(next.name)} at ${h.fmt(next.minContribution)}.` : 'The highest rank. Contribution still counts in war.'}</span></div>
      <div class="fa-grid">${tiles.join('')}</div>
      <div class="fc-foot"><button class="fa-link danger" data-sa="leave">Leave the sect</button></div></section>`
  }

  _memberOverview(s, def) {
    const h = this.h, sect = s.sect, w = s.sectWar || {}
    const sup = !!s.derived.sectBuffSuppressed
    const act = sect.activeMissions.length
    const open = SECT_MISSIONS.filter(m => sect.rank >= m.minRank).length
    const warOn = w.phase === 'scouting' || w.phase === 'preparing'
    const odds = this.gs.sectWarOdds()
    const found = s.stageIndex >= SECT_FOUNDING.minStage
    return `<div class="fam-view sect-view">
      <div class="fam-col">${this._rankCard(s, def)}</div>
      <div class="fam-col">
        ${this._sec(`The sect's blessing${sup ? ' <span class="tone-red">withheld</span>' : ''}`,
          this._effects(def.effects, s, sup) + (sup ? '<div class="fk-note sv-warn">The sect lost a war and licks its wounds. Its blessing returns in a few hours.</div>' : '<div class="fk-note">Active while you are a member, on top of everything else.</div>'))}
        ${this._sec('Duties', `<div class="fa-grid">
          ${this._tile('go', 'token', `Missions · ${act} of ${SECT_MAX_MISSIONS} underway`, `${open} open to your rank${act < SECT_MAX_MISSIONS ? ' · <span class="up">a slot is free</span>' : ''}`, '', '', ' data-view="sect-missions"')}
          ${this._tile('go', 'flag', warOn ? `War with the ${h.esc(w.enemyName)}` : 'Sect wars', warOn
            ? `battle in ${this._warClock(w)} · <span class="${this._oddsClass(odds?.chance || 0)}">${this._pct(odds?.chance || 0)}</span> to win${w.answered ? '' : ' · <span class="down">unanswered</span>'}`
            : `next call in ${this._warClock(w)} · record ${w.warVictories || 0}–${w.warDefeats || 0}`, '', warOn && !w.answered ? 'urgent' : '', ' data-view="sect-war"')}</div>`)}
        ${this._underway(s)}
        ${found ? '<div class="fk-note">You are strong enough to found a sect of your own. Leave this one first.</div>' : ''}
      </div></div>`
  }

  _underway(s) {
    const h = this.h, act = s.sect.activeMissions
    if (!act.length) return ''
    return this._sec('Underway', act.map(a => {
      const m = SECT_MISSIONS.find(x => x.id === a.missionId)
      if (!m) return ''
      const left = Math.max(0, a.endsAt - Date.now())
      return `<div class="sv-timer sv-under"><span class="sv-under-n">${h.esc(m.name)}</span><span class="sect-mission-timer" data-uid="${a.uid}" data-mid="${m.id}">${h.fmtTime(Math.ceil(left / 1000))} remaining</span>
        <span class="fam-bar"><i class="tone-jade" data-barfor="${a.uid}" data-w="${Math.max(0, Math.min(100, 100 - left / (m.duration * 1000) * 100))}"></i></span></div>`
    }).join(''), act.length + ' of ' + SECT_MAX_MISSIONS, 'sv-under-sec')
  }

  _missions(s, def) {
    const h = this.h, sect = s.sect, mult = SECT_RANKS[sect.rank].rewardMult
    const full = sect.activeMissions.length >= SECT_MAX_MISSIONS
    const cards = SECT_MISSIONS.map(m => {
      const active = sect.activeMissions.find(a => a.missionId === m.id)
      const unlocked = sect.rank >= m.minRank
      const dur = m.duration >= 3600 ? `${m.duration / 3600}h` : `${Math.round(m.duration / 60)}m`
      const q = r => { const a = Math.max(1, Math.round(r.minQty * mult)), b = Math.max(1, Math.round(r.maxQty * mult)); return a === b ? `${a}` : `${a}–${b}` }
      const gains = [...m.rewards.map(r => `<span class="sv-gain">${q(r)} ${h.esc(ITEMS[r.itemId]?.name || r.itemId)}</span>`),
        `<span class="sv-gain up">+${Math.round(m.contribution * mult)} Contribution</span>`,
        ...(m.beastXp ? [`<span class="sv-gain">${m.beastXp} XP to each idle beast</span>`] : [])].join('')
      let foot
      if (active) {
        const left = Math.max(0, active.endsAt - Date.now())
        foot = `<div class="sv-timer"><span class="sect-mission-timer" data-uid="${active.uid}" data-mid="${m.id}">${h.fmtTime(Math.ceil(left / 1000))} remaining</span>
          <span class="fam-bar"><i class="tone-jade" data-barfor="${active.uid}" data-w="${Math.max(0, Math.min(100, 100 - left / (m.duration * 1000) * 100))}"></i></span></div>`
      } else {
        const lock = !unlocked ? `${SECT_RANKS[m.minRank].name} and above` : full ? 'Both mission slots are busy' : ''
        foot = this._tile('mission', 'explore', 'Set out', `${dur} away`, lock, 'wide sv-go', ` data-id="${m.id}"`)
      }
      return `<div class="sv-card${active ? ' active' : ''}${unlocked ? '' : ' locked'}">
        <div class="sv-card-h"><span class="sv-card-n" title="${h.esc(m.nameCN)}">${h.esc(m.name)}</span><span class="sv-card-t">${dur}</span></div>
        <div class="sv-card-d">${h.esc(m.desc)}</div><div class="sv-gains">${gains}</div>${foot}</div>`
    }).join('')
    return `<div class="sv-head"><span>${sect.activeMissions.length} of ${SECT_MAX_MISSIONS} missions underway</span><span class="sv-head-n">Rewards ×${mult} at your rank · missions finish while you are away</span></div>
      <div class="sv-grid">${cards}</div>`
  }

  // ── Own sect ───────────────────────────────────────────────────────────────
  _ownOverview(s) {
    const h = this.h, o = s.ownSect, d = s.derived, info = this.gs.ownSectInfo(), w = s.sectWar || {}
    const warOn = w.phase === 'scouting' || w.phase === 'preparing'
    const odds = this.gs.sectWarOdds()
    const f = info.fame
    const builtN = info.buildings.filter(x => x.built).length
    const hallTile = info.hall.cost != null
      ? this._tile('hall', 'hall', `Raise the Sect Hall to Lv.${o.hallLevel + 1}`, `<span class="up">${info.hall.cap} → ${info.hall.nextCap}</span> disciple seats · ${this._cost(info.hall.cost, s.spiritStones)}`, '', info.hall.ok ? '' : 'short')
      : this._tile('hall', 'hall', 'Sect Hall Lv.' + o.hallLevel, '', 'The hall can rise no higher')
    return `<div class="fam-view sect-view">
      <div class="fam-col">
        <section class="fam-card sect"><div class="fc-head"><span class="fc-glyph" data-icon="hall"></span><div class="fc-id">
          <div class="fc-name">${h.esc(o.name)}</div>
          <div class="fc-sub">Your sect, founded by your own hand. Disciples cultivate beside you and share what they gather.</div>
          <div class="fc-tags"><span class="fam-tag tone-gold"><b data-icon="crown"></b>Sect Leader</span><span class="fam-tag" title="Fame: disciples ${f.disciples} + halls ${f.buildings} + Sect Hall ${f.hall} + victories ${f.wins}. Fame draws stronger rivals, and more often.">Fame ${h.fmt(f.total)}</span></div></div></div>
          <div class="sv-stats">
            ${this._stat('Spirit Stones', `${info.totals.stonesMin.toFixed(1)}<small>/min</small>`, 'gold')}
            ${this._stat('Spirit Herbs', `${info.totals.herbsMin.toFixed(1)}<small>/min</small>`, 'jade')}
            ${this._stat('Your Qi/s', `+${(info.totals.qi * 100).toFixed(1)}%`, 'jade', 'from disciples')}
            ${this._stat('War defense', d.warDefense ? `+${Math.round(d.warDefense * 100)}%` : '—', d.warDefense ? 'jade' : 'dim', d.arrayDamaged ? '<span class="down">array damaged</span>' : '')}
          </div>
          <div class="fa-grid">${hallTile}</div>
          <div class="fc-foot"><button class="fa-link danger" data-sa="disband">Disband the sect</button></div></section>
        ${this._fameSec(f)}
      </div>
      <div class="fam-col">
        ${this._sec('Your mountain', `<div class="fa-grid sv-links">
          ${this._tile('go', 'disciple', `Disciples · ${o.disciples.length} of ${info.hall.cap}`, info.full ? 'every seat is taken' : `<span class="up">${info.hall.cap - o.disciples.length} seat${info.hall.cap - o.disciples.length === 1 ? '' : 's'} open</span> · ${o.recruitPool.length} waiting at the gate`, '', '', ' data-view="sect-disciples"')}
          ${this._tile('go', 'hall', `Buildings · ${builtN} of ${SECT_BUILDINGS.length}`, info.buildings.some(x => x.ok) ? '<span class="up">one is within reach</span>' : builtN === SECT_BUILDINGS.length ? 'all raised' : 'see what each would give', '', '', ' data-view="sect-halls"')}
          ${this._tile('go', 'flag', warOn ? `The ${h.esc(w.enemyName)} march on you` : 'Sect wars', warOn
            ? `${w.phase === 'scouting' ? 'strike' : 'arrive'} in ${this._warClock(w)} · <span class="${this._oddsClass(odds?.chance || 0)}">${this._pct(odds?.chance || 0)}</span> to hold`
            : `next threat in ${this._warClock(w)} · record ${w.warVictories || 0}–${w.warDefeats || 0}`, '', warOn ? 'urgent' : '', ' data-view="sect-war"')}</div>`)}
        ${this._lastWar(s, w, true)}
      </div></div>`
  }

  _fameSec(f) {
    const h = this.h
    return this._sec('Fame', `<div class="sv-fame">${[['Disciples (talent × level)', f.disciples], ['Halls raised', f.buildings], ['Sect Hall', f.hall], ['Wars won', f.wins]].map(([k, v]) =>
      `<div class="sv-fx-row"><span>${k}</span><b>${h.fmt(v)}</b></div>`).join('')}</div>
      <div class="fk-note">Fame draws rivals: the more you have, the sooner the next one comes, and the richer the spoils.</div>`, h.fmt(f.total), 'sv-fame-sec')
  }

  _halls(s) {
    const h = this.h, info = this.gs.ownSectInfo(), d = s.derived, o = s.ownSect
    const now = x => {   // what the building is doing for you right now, in your numbers
      const e = x.b.effects
      if (e.disciple_qi_mult) return `disciples give +${(info.totals.qi * 100).toFixed(1)}% Qi/s${x.built ? '' : ` (would be +${(info.totals.qi * e.disciple_qi_mult * 100).toFixed(1)}%)`}`
      if (e.craft_double_chance) return `double crafts: ${Math.round((d.sectCraftDouble || 0) * 100)}%${x.built ? '' : ` → ${Math.round(Math.min(1, (d.sectCraftDouble || 0) + e.craft_double_chance) * 100)}%`}`
      if (e.beast_slots) return `beast slots: ${d.maxBeasts}${x.built ? '' : ` → ${d.maxBeasts + e.beast_slots}`}`
      if (e.disciple_xp_mult) return `disciples grow ×${(d.discipleXpMult || 1).toFixed(2)}${x.built ? '' : ` → ×${((d.discipleXpMult || 1) * e.disciple_xp_mult).toFixed(2)}`}`
      if (e.war_defense) return x.built ? (d.arrayDamaged ? '<span class="down">damaged in the last defeat; mends by itself</span>' : `war defense +${Math.round(e.war_defense * 100)}%`) : `war defense +${Math.round(d.warDefense * 100)}% → +${Math.round((d.warDefense + e.war_defense) * 100)}%`
      if (e.income_mult) return `income ${info.totals.stonesMin.toFixed(1)} stones/min${x.built ? '' : ` → ${(info.totals.stonesMin * e.income_mult).toFixed(1)}`}`
      return ''
    }
    const cards = info.buildings.map(x => {
      const b = x.b
      const cost = [`<span class="sv-gain${x.stonesShort ? ' short' : ''}">${h.fmt(b.stones)} stones</span>`,
        ...Object.entries(b.items).map(([id, q]) => { const have = s.inventory[id] || 0; return `<span class="sv-gain${have < q ? ' short' : ''}">${q} ${h.esc(ITEMS[id]?.name || id)} <i>(${h.fmt(have)})</i></span>` })].join('')
      const lock = x.stonesShort ? `${h.fmt(x.stonesShort)} stones short` : x.missing.length ? `Need ${x.missing.map(m => `${m.need - m.have} more ${ITEMS[m.id]?.name || m.id}`).join(', ')}` : ''
      return `<div class="sv-card${x.built ? ' built' : ''}">
        <div class="sv-card-h"><span class="sv-card-n" title="${h.esc(b.nameCN)}">${h.esc(b.name)}</span>${x.built ? '<span class="sv-card-t tone-jade">raised</span>' : ''}</div>
        <div class="sv-card-d">${h.esc(b.desc)}</div>
        <div class="sv-now">${now(x)}</div>
        ${x.built ? '' : `<div class="sv-gains">${cost}</div>${this._tile('build', 'hall', 'Build', 'once, for good', lock, 'wide sv-go', ` data-id="${b.id}"`)}`}</div>`
    }).join('')
    const hall = info.hall
    const hallCard = `<div class="sv-card hall">
        <div class="sv-card-h"><span class="sv-card-n">Sect Hall</span><span class="sv-card-t">Lv.${o.hallLevel} of ${SECT_HALL_LEVELS.length}</span></div>
        <div class="sv-card-d">The heart of the sect. Each level seats five more disciples.</div>
        <div class="sv-now">${hall.cap} disciple seats · ${o.disciples.length} taken</div>
        ${hall.cost != null ? this._tile('hall', 'hall', `Raise to Lv.${o.hallLevel + 1}`, `<span class="up">${hall.cap} → ${hall.nextCap}</span> seats · ${this._cost(hall.cost, s.spiritStones)}`, '', 'wide sv-go') : '<div class="sv-now dim">The hall stands at its full height.</div>'}</div>`
    const built = info.buildings.filter(x => x.built).length
    return `<div class="sv-head"><span>${built} of ${SECT_BUILDINGS.length} halls raised</span><span class="sv-head-n">each is built once and works for good</span></div>
      <div class="sv-grid">${hallCard}${cards}</div>`
  }

  _disciples(s) {
    const h = this.h, info = this.gs.ownSectInfo(), o = s.ownSect
    const roster = info.disciples.map(x => `<div class="sv-disc" title="+${(x.qi * 100).toFixed(2)}% Qi/s · ${x.stonesMin.toFixed(2)} stones/min · ${x.herbsMin.toFixed(2)} herbs/min">
        <div class="sv-disc-h"><span class="sv-disc-n">${h.esc(x.d.name)}</span>${SV_STARS(x.d.talent)}<span class="sv-lv">Lv.${x.d.level}${x.max ? ' <b>max</b>' : ''}</span>
          <button class="sv-dismiss" data-sa="dismiss" data-id="${h.esc(x.d.id)}" title="Send ${h.esc(x.d.name)} away">dismiss</button></div>
        <span class="fam-bar thin"><i class="tone-gold" data-w="${Math.round(x.xpFrac * 100)}"></i></span>
        <div class="sv-disc-y"><span class="up">+${(x.qi * 100).toFixed(2)}% Qi/s</span><span>${x.stonesMin.toFixed(2)} stones/min</span><span>${x.herbsMin.toFixed(2)} herbs/min</span>
          <span class="dim">${x.max ? 'fully grown' : `Lv.${x.d.level + 1} in ${h.fmtTime(x.eta)}`}</span></div></div>`).join('')
    const pool = info.candidates.map(x => `<div class="sv-card sv-cand">
        <div class="sv-card-h"><span class="sv-card-n">${h.esc(x.c.name)}</span>${SV_STARS(x.c.talent)}</div>
        <div class="sv-gains"><span class="sv-gain up">+${(x.qi * 100).toFixed(2)}% Qi/s</span><span class="sv-gain">${x.stonesMin.toFixed(2)} stones/min</span><span class="sv-gain dim">at Lv.1, more as they grow</span></div>
        ${this._tile('recruit', 'disciple', 'Take <span class="sv-long">them </span>in', this._cost(x.cost, s.spiritStones), x.reason === 'full' ? 'Every seat is taken: raise the Sect Hall' : x.reason === 'stones' ? `${h.fmt(x.cost - Math.floor(s.spiritStones))} stones short` : '', 'wide sv-go', ` data-id="${h.esc(x.c.id)}"`)}</div>`).join('')
    return `<div class="fam-view sect-view sv-disc-view">
      <div class="fam-col">${this._sec('Your disciples', (roster || '<div class="fk-note">No one has taken your teaching yet. Candidates wait at the gate.</div>') +
        (o.disciples.length ? `<div class="fk-note sv-together">Together: +${(info.totals.qi * 100).toFixed(1)}% Qi/s · ${info.totals.stonesMin.toFixed(1)} stones and ${info.totals.herbsMin.toFixed(1)} herbs a minute. Talent and level raise all three.</div>` : ''),
        `${o.disciples.length} / ${info.hall.cap}`)}</div>
      <div class="fam-col">${this._sec('At the gate', `<div class="sv-grid tight">${pool}</div>
        ${this._tile('reroll', 'auto', 'Call others to the gate', `${this._cost(RECRUIT_REROLL_COST, s.spiritStones)} · or wait: new faces in <span data-pooltimer>${h.fmtTime(Math.max(0, Math.ceil((o.poolRefreshAt - Date.now()) / 1000)))}</span>`, s.spiritStones < RECRUIT_REROLL_COST ? `Costs ${RECRUIT_REROLL_COST} stones` : '', 'wide sv-call')}`, o.recruitPool.length)}</div></div>`
  }

  // ── War (both sides) ───────────────────────────────────────────────────────
  _war(s, own) {
    const h = this.h, w = s.sectWar, odds = this.gs.sectWarOdds()
    const on = w.phase === 'scouting' || w.phase === 'preparing'
    const stars = on ? `<span class="sv-tier" title="Enemy strength ${w.enemyTier} of 5">${'★'.repeat(w.enemyTier)}</span>` : ''
    let title, sub, clock
    if (!on) { title = own ? 'Your borders are quiet' : 'The sect is at peace'; sub = own ? 'Rivals test a famous sect more often.' : 'Higher ranks are called to war more often.'; clock = `${own ? 'Next threat' : 'Next call to arms'} in ${this._warClock(w)}` }
    else if (own) { title = `The ${h.esc(w.enemyName)}`; sub = w.phase === 'scouting' ? 'Their scouts are in your hills.' : 'They are preparing to strike.'; clock = `${w.phase === 'scouting' ? 'They strike in' : 'Preparation ends in'} ${this._warClock(w)}` }
    else { title = `The ${h.esc(w.enemyName)}`; sub = w.phase === 'scouting' ? 'Call to Arms: the elders summon every disciple.' : 'Muster: the sect gathers at the mountain gate.'; clock = `Battle in ${this._warClock(w)}` }
    const pc = odds ? Math.round(odds.chance * 100) : 50
    const oddsBtn = odds ? `<button class="fc-aff sv-odds" data-bd="sectwar"><span class="fa-row"><span class="fa-k">${on ? 'Odds of victory' : 'Odds if war came now'}</span>
        <span class="fa-v ${this._oddsClass(odds.chance)}">${this._pct(odds.chance)}</span></span>
        <span class="fam-bar"><i class="tone-${odds.chance < 0.35 ? 'red' : odds.chance < 0.6 ? 'gold' : 'jade'}" data-w="${pc}"></i></span>
        <span class="fa-last">Your strength ×${odds.mult.toFixed(2)}; the rival rolls ×0.6 to ×1.4 when battle is joined.${odds.ifAnswered != null ? ` Answering alone: <b class="up">${this._pct(odds.ifAnswered)}</b>.` : ''}</span></button>` : ''
    const status = `<section class="fam-card sect${on ? ' war' : ''}"><div class="fc-head"><span class="fc-glyph${on ? ' war' : ''}" data-icon="flag"></span><div class="fc-id">
        <div class="fc-name">${title} ${stars}</div><div class="fc-sub">${sub}</div>
        <div class="fc-tags"><span class="fam-tag"><b data-icon="age"></b>${clock}</span><span class="fam-tag">wars: ${w.warVictories} won · ${w.warDefeats} lost${w.warsIgnored ? ` · ${w.warsIgnored} ignored` : ''}</span></div></div></div>
      ${oddsBtn}${on ? (own ? this._ownActions(s, w, odds) : this._memberActions(s, w)) : ''}
      ${!on && s.derived.sectBuffSuppressed ? '<div class="fk-note sv-warn">The sect lost its last war. Its blessing is withheld for a few hours.</div>' : ''}
      ${!on && own && s.derived.arrayDamaged ? '<div class="fk-note sv-warn">The Defensive Array was damaged in the last defeat. It mends by itself.</div>' : ''}</section>`
    return `<div class="fam-view sect-view">
      <div class="fam-col">${status}${this._lastWar(s, w, own)}</div>
      <div class="fam-col">${this._sec('Standing orders', `<div class="sv-orders"></div><div class="fk-note sv-orders-note">Carried out the moment a war begins, whether or not the game is open. Anything you do by hand adds to them.</div>`)}
        ${this._stakes(own)}</div></div>`
  }

  _memberActions(s, w) {
    const h = this.h, { rankMult } = this.gs.memberWarPower()
    const full = this.gs.memberWarChestFull(), left = full - w.chestStones
    const give = Math.min(Math.max(10, Math.ceil(full / 4)), left)
    const pct = v => `+${Math.round(v * rankMult * 100)}%`
    const tiles = [
      this._tile('answer', 'flag', w.answered ? 'Call answered' : 'Answer the call', w.answered ? `you march with the sect · <span class="up">${pct(MEMBER_WAR_ANSWER_BONUS)}</span>` : `<span class="up">${pct(MEMBER_WAR_ANSWER_BONUS)}</span> sect strength · free`, '', w.answered ? 'done' : 'urgent', w.answered ? ' disabled' : ''),
      this._tile('chest', 'chest', left > 0 ? `Give ${h.fmt(give)} to the war chest` : 'War chest full', left > 0 ? `chest ${h.fmt(w.chestStones)} / ${h.fmt(full)} · full = <span class="up">${pct(MEMBER_WAR_CHEST_MAX_BONUS)}</span>` : `<span class="up">${pct(MEMBER_WAR_CHEST_MAX_BONUS)}</span> strength`,
        left <= 0 ? '' : s.spiritStones < give ? `${h.fmt(give)} stones needed` : '', left <= 0 ? 'done' : '', left <= 0 ? ' disabled' : ` data-n="${give}"`),
    ]
    const pills = Object.keys(s.inventory).filter(id => ITEMS[id]?.type === 'pill' && s.inventory[id] > 0)
    for (const id of pills.slice(0, 3)) tiles.push(this._tile('pill', 'pill', `Offer ${h.esc(ITEMS[id].name)} <i class="dim">×${s.inventory[id]}</i>`, `<span class="up">${pct(MEMBER_WAR_PILL_BONUS)}</span> · +${MEMBER_WAR_PILL_CONTRIB} Contribution`,
      w.pillsGiven >= MEMBER_WAR_MAX_PILLS ? `${MEMBER_WAR_MAX_PILLS} pills already given` : '', '', ` data-id="${id}"`))
    const warBeast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
    if (warBeast) tiles.push(this._tile('beast', 'beast', `${h.esc(warBeast.name)} is at the front`, `returns with ${MEMBER_WAR_BEAST_XP} XP`, '', 'done', ' disabled'))
    else for (const b of (s.beasts || []).filter(b => !b.expedition).slice(0, 3)) {
      const v = Math.min(MEMBER_WAR_BEAST_MAX_BONUS, MEMBER_WAR_BEAST_BASE_BONUS + MEMBER_WAR_BEAST_LVL_BONUS * b.level)
      tiles.push(this._tile('beast', 'beast', `Send ${h.esc(b.name)} <i class="dim">Lv.${b.level}</i>`, `<span class="up">${pct(v)}</span> · back with ${MEMBER_WAR_BEAST_XP} XP`, '', '', ` data-id="${h.esc(b.id)}"`))
    }
    return `<div class="fa-grid sv-acts">${tiles.join('')}</div>${w.answered || w.chestStones || w.pillsGiven || warBeast ? '' : '<div class="fk-note sv-warn">Ignore the call and you lose Contribution and karma, win or lose.</div>'}`
  }

  _ownActions(s, w, odds) {
    const h = this.h, rc = odds.reinforceCost, ac = odds.allyCost
    const tiles = []
    if (w.reinforced) tiles.push(this._tile('reinforce', 'shield', 'Reinforced', `<span class="up">×${1 + WAR_REINFORCE_POWER_BONUS}</span> strength`, '', 'done', ' disabled'))
    else tiles.push(this._tile('reinforce', 'shield', 'Reinforce the defenses', `${odds?.ifReinforced != null ? `odds → <span class="up">${this._pct(odds.ifReinforced)}</span> · ` : ''}${this._cost(rc, s.spiritStones)}`,
      w.phase !== 'preparing' ? 'Once they begin preparing' : s.spiritStones < rc ? `${h.fmt(rc - Math.floor(s.spiritStones))} stones short` : ''))
    if (w.allyId) tiles.push(this._tile('ally', 'bond', `${h.esc(SECTS.find(x => x.id === w.allyId)?.name || 'An ally')} fights with you`, `<span class="up">×${1 + WAR_ALLY_POWER_BONUS}</span> strength`, '', 'done', ' disabled'))
    else for (const d of SECTS.filter(d => d.minStage <= s.stageIndex + 3).slice(-1))   // every ally costs and gives the same (sect-war.md)
      tiles.push(this._tile('ally', 'bond', `Ask the ${h.esc(d.name)}`, `${odds?.ifAllied != null ? `odds → <span class="up">${this._pct(odds.ifAllied)}</span> · ` : ''}${this._cost(ac, s.spiritStones)}`,
        s.spiritStones < ac ? `${h.fmt(ac - Math.floor(s.spiritStones))} stones short` : '', '', ` data-id="${d.id}"`))
    return `<div class="fa-grid sv-acts">${tiles.join('')}</div>`
  }

  _lastWar(s, w, own) {
    const r = w.lastResult
    if (!r || (!own && r.side !== 'member')) return ''
    const h = this.h, bits = []
    if (own) {
      if (r.win) bits.push(`<span class="up">+${h.fmt(r.spoils.spirit_stone)} stones</span>`, `<span class="up">+${h.fmt(r.spoils.spirit_herb)} herbs</span>`)
      else { bits.push(`<span class="down">−${h.fmt(r.spoilsLost)} stones plundered</span>`); if (r.arrayHit) bits.push('<span class="down">array damaged</span>'); if (r.injured) bits.push(`<span class="down">you were wounded (−${r.injured} Health)</span>`) }
    } else {
      if (r.stones) bits.push(`<span class="up">+${h.fmt(r.stones)} stones</span>`)
      if (r.contribDelta) bits.push(`<span class="${r.contribDelta > 0 ? 'up' : 'down'}">${r.contribDelta > 0 ? '+' : '−'}${Math.abs(r.contribDelta)} Contribution</span>`)
      if (r.rareItem) bits.push(`<span class="up">${h.esc(ITEMS[r.rareItem]?.name || r.rareItem)}</span>`)
      if (!r.engaged) bits.push(r.seen ? '<span class="down">you ignored the call</span>' : '<span class="dim">fought without you</span>')
      if (!r.win && r.suppressed) bits.push('<span class="down">blessing withheld a while</span>')
    }
    return `<section class="fam-sec sv-last ${r.win ? 'win' : 'loss'}"><div class="fam-sec-title"><span>Last war · ${r.win ? 'victory' : 'defeat'}</span></div>
      <div class="sv-last-t">${r.win ? 'You drove off' : 'You fell to'} the ${h.esc(r.enemyName)}.</div><div class="sv-gains">${bits.map(b => `<span class="sv-gain">${b}</span>`).join('')}</div></section>`
  }

  _stakes(own) {
    const rows = own
      ? [['Victory', `about ${WAR_SPOILS_STONE_BASE}+ stones and herbs, more with fame`, 'up'], ['Defeat', `lose ${Math.round(WAR_LOSS_RESOURCE_FRAC * 100)}% of your stones; the Defensive Array goes dark ${WAR_ARRAY_DAMAGE_HOURS}h; you may be wounded`, 'down']]
      : [['Victory', 'stones and Contribution if you took part, sometimes a rare prize', 'up'], ['Defeat', `the sect's blessing is withheld ${MEMBER_WAR_BUFF_SUPPRESS_HOURS}h; members lose some Contribution`, 'down'], ['Ignored', 'lose Contribution and karma, even in victory', 'down']]
    return this._sec('What rides on it', rows.map(([k, v, t]) => `<div class="sv-stake"><b class="${t}">${k}</b><span>${v}</span></div>`).join(''), '', 'sv-stakes')
  }

  // ── clicks ─────────────────────────────────────────────────────────────────
  _click(e) {
    const b = e.target.closest('[data-sa]')
    if (!b || b.disabled) return
    const gs = this.gs, h = this.h, id = b.dataset.id, n = Number(b.dataset.n)
    const say = (r, ok, msgs = {}) => r.ok ? h.flash(ok(r), 'positive') : h.flash(msgs[r.reason] || 'Not now', 'negative')
    const stones = { stones: 'Not enough Spirit Stones' }
    switch (b.dataset.sa) {
      case 'go': return h.go(b.dataset.view)
      case 'join': { const r = gs.joinSect(id); return r.ok ? h.flash(`Joined the ${r.sect.name}`, 'special') : h.flash({ stage: 'Realm too low', in_sect: 'Already in a sect', own_sect: 'You lead your own sect' }[r.reason] || 'Cannot join', 'negative') }
      case 'found': { const r = gs.foundOwnSect(this.foundName); if (r.ok) this.foundName = ''
        return r.ok ? h.flash('Your sect is founded!', 'special') : h.flash({ stage: 'Realm too low', in_sect: 'Leave your current sect first', stones: 'Not enough Spirit Stones', crystals: 'Not enough Void Crystals' }[r.reason] || 'Cannot found a sect', 'negative') }
      case 'rankup': return say(gs.rankUpSect(), r => `You rise to ${SECT_RANKS[r.rank].name}`, { contribution: 'Not enough Contribution' })
      case 'donate': return say(gs.donateToSect(n), r => `Gave ${n} stones (+${r.gained} Contribution)`, stones)
      case 'leave': return h.confirm('Leave the sect?', `You lose your rank and all Contribution, and pay karma for it${sectWarActive(gs.get()) ? ', more for deserting a war' : ''}. Rejoining starts again as an Outer Disciple.`, () => gs.leaveSect(), 'Leave')
      case 'mission': return h.startMission(id)
      case 'hall': return say(gs.upgradeSectHall(), r => `The Sect Hall rises to Lv.${r.level}`, { ...stones, max_level: 'The hall is at its full height' })
      case 'build': return say(gs.buildSectBuilding(id), r => `The ${r.building.name} is raised`, { ...stones, items: 'Missing materials' })
      case 'recruit': return say(gs.recruitDisciple(id), r => `${r.disciple.name} joins your sect`, { ...stones, full: 'Every seat is taken', not_found: 'They have gone' })
      case 'reroll': return say(gs.rerollRecruitPool(), () => 'New faces arrive at the gate', stones)
      case 'dismiss': { const d = gs.get().ownSect.disciples.find(x => x.id === id)
        return h.confirm(`Dismiss ${d?.name || 'this disciple'}?`, 'They leave for good, with every level they earned. There is no refund.', () => gs.dismissDisciple(id), 'Dismiss') }
      case 'disband': return h.confirm('Disband your sect?', 'Every building and disciple is lost, and it costs 10 karma. This cannot be undone.', () => gs.disbandOwnSect(), 'Disband')
      case 'answer': return say(gs.answerWarCall(), () => 'You answer the call to arms')
      case 'chest': return say(gs.donateWarChest(n), r => `War chest +${r.given} stones (+${r.gained} Contribution)`, { ...stones, full: 'The chest is full' })
      case 'pill': return say(gs.offerWarPill(id), r => `Pill offered (+${r.gained} Contribution)`, { full: 'Enough pills given' })
      case 'beast': return say(gs.sendBeastToWar(id), r => `${r.beast.name} marches to war`, { busy: 'That beast is busy', already: 'A beast is already at the front' })
      case 'reinforce': return say(gs.reinforceForWar(), r => `Defenses reinforced (−${r.cost} stones)`, { ...stones, no_war: 'Only while they prepare' })
      case 'ally': return say(gs.requestWarAlly(id), r => `The ${r.ally.name} will fight beside you`, stones)
    }
  }
}
SectView.VIEWS = ['sect', 'sect-missions', 'sect-halls', 'sect-disciples', 'sect-war']

function sectWarActive(s) { const w = s.sectWar; return !!w && (w.phase === 'scouting' || w.phase === 'preparing') }
