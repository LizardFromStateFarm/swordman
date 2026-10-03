// SectView — 宗 Sect as sub-views (roadmap 1.8b-5, Phase 33): Overview · Missions · War for a sect you joined,
// Overview · Buildings · Disciples · War for one you founded, and the list of sects (+ founding) when you have none.
// 1.14b: Library (joined sects) — the sect's martial art manuals by grade, each grade opened by your rank, bought with
// Contribution (gameState.sectLibrary() / buySectArt()). Giving (user 2026-09-30): your spare manuals go onto the sect's
// shelf for Contribution + war strength (sectDonateInfo / donateManualToSect); a founder's Library is that shelf, studied
// at half time (studyFromSect).
// Replaces the old one-long-list Sect tab (15 screens of scroll for a founder). Every number says what it is made
// of: the sect's blessing in plain terms, what each rank / mission / building / disciple gives, and war odds that
// are the real roll (gameState.sectWarOdds(), "why" card data-bd="sectwar"). Built from the Family/Clan components
// (fam-card, fam-sec, fa-btn) — styles.css → "Sect views". See docs/systems/ui-layout.md → "Sect views".

// A sect's `effects` in words: [label, value, appliesNow?]. UI only.
function sectEffectList(fx, s) {
  const pct = v => `${+(v * 100).toFixed(1)}%`, m = v => +Number(v).toFixed(2)   // 43d: scaled values carry decimals
  const out = []
  if (fx.qps_mult)             out.push(['Qi per second', `×${m(fx.qps_mult)}`, true])
  if (fx.weapon_qps_mult)      out.push(['Qi per second with a weapon', `×${m(fx.weapon_qps_mult)}`, !s || !!s.equipped?.weapon])
  if (fx.artifact_qps_mult)    out.push(['Qi per second with an artifact', `×${m(fx.artifact_qps_mult)}`, !s || !!s.equipped?.artifact])
  if (fx.bt_bonus)             out.push(['Breakthrough chance', `+${pct(fx.bt_bonus)}`, true])
  if (fx.bt_floor)             out.push(['Breakthrough chance never below', pct(fx.bt_floor), true])
  if (fx.loot_mult)            out.push(['Expedition loot', `×${m(fx.loot_mult)}`, true])
  if (fx.herb_mult)            out.push(['Spirit Herb drops', `×${m(fx.herb_mult)}`, true])
  if (fx.craft_double_chance)  out.push(['Crafts come out double', pct(fx.craft_double_chance), true])
  if (fx.hidden_locations)     out.push(['Hidden expedition sites', 'revealed', true])
  if (fx.integrity_regen_mult) out.push(['Integrity recovers', `×${m(fx.integrity_regen_mult)} faster`, true])
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
    if (s.ownSect?.founded) return ['sect', 'sect-halls', 'sect-base', 'sect-disciples', 'sect-war']   // (a founder's library sits inside Halls)
    if (s.sect?.id) return ['sect', 'sect-missions', 'sect-library', 'sect-war']
    return ['sect']
  }

  render(view, s) {
    const el = document.getElementById('tab-' + view)
    // Phase 46 (1.20d): a membership in a lineage world sect has no SECTS row — `_sectDef()` synthesises it.
    const own = s.ownSect?.founded, def = !own && s.sect?.id ? this.gs._sectDef() : null
    let html = ''
    if (view === 'sect') html = own ? this._ownOverview(s) : def ? this._memberOverview(s, def) : this._unaffiliated(s)
    else if (view === 'sect-missions' && def) html = this._missions(s, def)
    else if (view === 'sect-library' && def) html = this._library(s, def)

    else if (view === 'sect-halls' && own) html = this._halls(s) + `<div class="sv-ownlib" id="sv-ownlib">${this._ownLibrary(s)}</div>`
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
  // full (43d): the sect's written blessing, shown faint beside the scaled value you actually draw ("×1.31 of ×1.4")
  _effects(fx, s, suppressed, full = null) {
    const list = sectEffectList(fx, s), whole = full ? sectEffectList(full, s) : null
    if (!list.length) return ''
    return `<div class="sv-fx${suppressed ? ' suppressed' : ''}">${list.map(([k, v, on], i) =>
      `<div class="sv-fx-row${on ? '' : ' off'}"><span>${k}</span><b>${v}</b>${whole && whole[i] && whole[i][1] !== v ? `<i class="sv-fx-of">of ${whole[i][1]}</i>` : ''}${on ? '' : '<em>not now</em>'}</div>`).join('')}</div>`
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

  // Phase 46 (1.20d, lineage-sect.md): the Core-Formation offer from the sect your own line founded.
  _lineageRecruit(s) {
    const info = this.gs.lineageRecruitInfo?.()
    if (!info) return ''
    const h = this.h, age = Math.max(0, Math.floor(s.world.year) - (info.rec.bornYear || 0))
    return `<section class="fam-card sect sv-lineage">
      <div class="fc-head"><span class="fc-glyph" data-icon="gate"></span><div class="fc-id">
        <div class="fc-name">The ${h.esc(info.name)} sends for you</div>
        <div class="fc-sub">Riders in your own line's colors come to the gate: this is the sect your blood founded${info.founderName ? `, by ${h.esc(info.founderName)}` : ''}. It has stood ${age} year${age === 1 ? '' : 's'} without you, and ${h.esc(info.leader)} leads it now. A place waits at the outer gate.</div>
        <div class="fc-tags"><span class="fam-tag tone-gold"><b data-icon="vein"></b>your line's sect</span><span class="fam-tag">${h.esc(info.rec.band)} · Might ${h.fmt(info.might)}</span><span class="fam-tag tone-${info.rec.stanceTone}" title="How the sect your line founded still stands toward you (${info.rec.stance} of ±100).">${h.esc(info.rec.stanceLabel)} ${info.rec.stance > 0 ? '+' : ''}${info.rec.stance}</span><span class="fam-tag">${h.fmt(info.disciples)} disciples</span>${info.temper ? `<span class="fam-tag">${h.esc(info.temper)}</span>` : ''}</div></div></div>
      <div class="fa-grid sv-lineage-acts">
        ${this._tile('lineagejoin', 'gate', `Join as ${h.esc(info.rank)}`, 'start again at the gate of a sect your blood built', '')}
        ${this._tile('lineagedecline', 'close', 'Send them away', 'you will not be asked again this life', '', 'sv-decline')}
      </div></section>`
  }

  // ── No sect ────────────────────────────────────────────────────────────────
  _unaffiliated(s) {
    const h = this.h
    const world = this.gs.worldSectsInfo?.()?.rows || []   // Phase 43b: each sect's real build-up
    const cards = SECTS.filter(d => d.minStage <= s.stageIndex + 3).map(d => {
      const ash = this.gs.sectInAshes?.(d.id), ok = s.stageIndex >= d.minStage && !ash, wr = world.find(r => r.defId === d.id)   // 43f: a burned gate is sealed
      return `<div class="sv-sect${ok ? '' : ' locked'}">
        <div class="sv-sect-head"><span class="sv-sect-n" title="${h.esc(d.nameCN)}">${h.esc(d.name)}</span>
          ${this._tile('join', ok ? 'gate' : 'lock', ok ? 'Join' : ash ? 'In ashes' : 'Sealed', '', ok ? '' : ash ? 'Burned to the ground' : stageShortName(d.minStage), 'sv-join', ` data-id="${d.id}"`)}</div>
        <div class="sv-sect-d">${ash ? '<span class="down">Its mountain was burned to the ground, and its survivors have not yet raised the gate again.</span> ' : ''}${h.esc(d.desc)}</div>${wr ? `<div class="ws-joinline"><span class="fam-tag">${h.esc(wr.band)} · Might ${h.fmt(wr.might)}</span><span class="fam-tag tone-${wr.stanceTone}" title="How they stand toward you">${h.esc(wr.stanceLabel)} toward you</span><span>${wr.built} halls · ${h.fmt(wr.disciples)} disciples</span>${wr.blessing != null ? `<span class="fam-tag tone-${wr.blessing < 0.8 ? 'red' : wr.blessing < 1 ? 'warm' : 'jade'}" title="How much of its written blessing its halls can give. A new Outer Disciple draws ${Math.round(SECT_BLESSING.rankShare[0] * 100)}% of that.">blessing ×${wr.blessing.toFixed(2)}</span>` : ''}</div>` : ''}${wr?.blessing != null ? this._effects(sectBlessingEffects(d.effects, wr.blessing * SECT_BLESSING.rankShare[0]), null, false, d.effects) + '<div class="sv-fx-key">What you would draw on joining · faint: the full blessing</div>' : this._effects(d.effects, null)}</div>`
    }).join('')
    const hidden = SECTS.filter(d => d.minStage > s.stageIndex + 3).length
    return `<div class="fam-view sect-view">
      <div class="fam-col">${this._lineageRecruit(s)}${this._worldEvent(s)}
        <section class="fam-card alone"><div class="fc-head"><span class="fc-glyph dim" data-icon="person"></span><div class="fc-id">
          <div class="fc-name">A wandering cultivator</div>
          <div class="fc-sub">No sect claims you. A sect lends its blessing, sets you missions for contribution, and calls you to its wars. You may leave at any time, at a small cost in karma.</div></div></div></section>
        ${this._sec('Sects that would take you', cards + (hidden ? `<div class="fk-note">${hidden} more sect${hidden === 1 ? '' : 's'} will not look at you until you are stronger.</div>` : ''), SECTS.length - hidden)}
      </div>
      <div class="fam-col">${this._foundCard(s)}${this._founderPreview(s)}${this._worldLink(s)}</div></div>`
  }

  // What founding gives, in plain words — fills the roomy right column so the goal is visible early (1.8b-6 review).
  _founderPreview(s) {
    if (s.stageIndex < SECT_FOUNDING.minStage - 3) return ''
    const last = SECT_HALL_LEVELS[SECT_HALL_LEVELS.length - 1]
    const rows = [
      ['hall', `${SECT_BUILDINGS.length} halls to raise`, 'each one a lasting blessing on your cultivation'],
      ['disciple', `Up to ${last.cap} disciples`, 'they grow with time and feed you Qi, stones and herbs'],
      ['flag', 'Your own wars', 'rivals come for your mountain: prepare, call allies, or yield'],
    ]
    return this._sec('What a founder holds', `<div class="sv-preview">${rows.map(([g, n, d]) =>
      `<div class="sv-prev-row"><span class="fa-g">${Icon.g(g)}</span><span><b>${n}</b><br><span class="sv-prev-d">${d}</span></span></div>`).join('')}</div>`, '', 'sv-preview-sec')
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
      this._tile('rankup', 'rise', next ? `Rise to ${h.esc(next.name)}` : 'Highest rank', next ? `rewards <span class="up">×${next.rewardMult}</span> (now ×${rank.rewardMult}) · draws <span class="up">${Math.round(SECT_BLESSING.rankShare[sect.rank + 1] * 100)}%</span> of the blessing` : 'nothing above you but the sect master',
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
      <div class="fam-col">${this._worldEvent(s)}${this._rankCard(s, def)}${this._master(s)}</div>
      <div class="fam-col">
        ${this._blessing(s, def)}
        ${this._sec('Duties', `<div class="fa-grid">
          ${this._tile('go', 'token', `Missions · ${act} of ${SECT_MAX_MISSIONS} underway`, `${open} open to your rank${act < SECT_MAX_MISSIONS ? ' · <span class="up">a slot is free</span>' : ''}`, '', '', ' data-view="sect-missions"')}
          ${this._tile('go', 'flag', warOn ? `War with the ${h.esc(w.enemyName)}` : 'Sect wars', warOn
            ? `battle in ${this._warClock(w)} · <span class="${this._oddsClass(odds?.chance || 0)}">${this._pct(odds?.chance || 0)}</span> to win${w.answered ? '' : ' · <span class="down">unanswered</span>'}`
            : `next call in ${this._warClock(w)} · record ${w.warVictories || 0}–${w.warDefeats || 0}`, '', warOn && !w.answered ? 'urgent' : '', ' data-view="sect-war"')}
          ${this._libraryTile(s)}${this._worldLink(s, true)}</div>`)}
        ${this._underway(s)}
        ${found ? '<div class="fk-note">You are strong enough to found a sect of your own. Leave this one first.</div>' : ''}
      </div></div>`
  }

  // Phase 43d: the blessing you draw. The sect's halls set how much of it they can give, your rank how much reaches
  // you (the "why" popover data-bd="blessing" has the sum). Below it, the halls your stones can raise: each with its
  // cost, the blessing after, the Contribution it pays and the lock reason. A burned hall leads the list.
  _blessing(s, def) {
    const b = this.gs.sectBlessingInfo?.()
    const sup = !!s.derived.sectBuffSuppressed
    const title = `The sect's blessing${sup ? ' <span class="tone-red">withheld</span>' : ''}`
    if (!b) return this._sec(title, this._effects(def.effects, s, sup))
    const h = this.h, x = v => `×${v.toFixed(2)}`
    const short = document.body.dataset.layout === 'overlay' || document.body.dataset.narrow === '1'
    const word = b.factor < 0.8 ? ['Their halls are poor', 'red'] : b.factor < 1 ? ['Their halls are modest', 'warm']
      : b.factor < b.max ? ['Their halls are rich', 'jade'] : ['Their halls stand at their height', 'gold']
    const head = `<button class="fc-aff sv-odds sv-bless" data-bd="blessing" title="Why this number"><span class="fa-row"><span class="fa-k">You draw <span class="sv-why">why?</span></span>
        <span class="fa-v tone-${word[1]}">${x(b.k)} <span class="sv-of">of the full blessing</span></span></span>
      <span class="fam-bar"><i class="tone-${word[1]}" data-w="${Math.round(Math.min(1, b.k / (b.max * SECT_BLESSING.rankShare[SECT_BLESSING.rankShare.length - 1])) * 100)}"></i></span>
      <span class="fa-last">${word[0]}: ${x(b.factor)}. As ${/^[AEIOU]/.test(b.rankName) ? 'an' : 'a'} ${h.esc(b.rankName)} you draw ${Math.round(b.share * 100)}% of it${b.nextRankName ? `; ${h.esc(b.nextRankName)}s draw ${Math.round(b.nextShare * 100)}%` : ''}.</span></button>`
    const lost = b.lost ? `<div class="fk-note sv-warn">The ${h.esc(b.lost.name)} lies in ash since year ${b.lost.year}. The blessing stays thinner until it is rebuilt.</div>` : ''
    const rows = [...b.halls].sort((p, q) => (q.lost ? 1 : 0) - (p.lost ? 1 : 0)).map(f => {
      const lv = f.id === 'hall' ? `<span class="ws-hlv">Lv.${f.level} <i>of ${f.max}</i></span>` : `<span class="ws-pips" title="Lv.${f.level} · this sect can raise it to Lv.${f.max}">${this._pips(f.level, f.max)}</span>`
      const act = f.cost == null ? '<span class="sv-fund-top">At the height this sect can bear</span>'
        : this._tile('fund', f.id === 'hall' ? 'gate' : 'hall', `${f.lost ? 'Rebuild' : f.level ? 'Raise' : 'Build'} to Lv.${f.level + 1}`,
            `<span class="cost">${h.fmt(f.cost)} stones</span> · you draw ${x(b.k)} → <span class="up">${x(f.after)}</span> · <span class="up nw">+${h.fmt(f.contrib)}&nbsp;Contribution</span>`, f.lock, 'wide sv-fund-t', ` data-id="${f.id}"`)
      return `<div class="sv-fund-row${f.lost ? ' lost' : ''}${f.cost == null ? ' top' : ''}"><div class="sv-fund-h"><span class="sv-fund-n">${h.esc(f.name)}${f.lost ? ' <b class="sv-burned">burned</b>' : ''}</span>${lv}</div>${act}</div>`
    }).join('')
    const can = b.halls.filter(f => f.cost != null && !f.lock).length
    const open = this.fundOpen ?? (!short || !!b.lost)
    const fund = b.halls.length ? `<details class="sv-fund"${open ? ' open' : ''}><summary class="fa-quiet" data-sa="fundfold"><span class="lib-fold">${Icon('play')}</span><span class="sv-fund-lbl">Fund their halls</span>
        <span class="fam-count">${can ? `${can} you can fund` : 'none in reach'}</span></summary>
      <div class="sv-fund-list">${rows}</div>
      <div class="fk-note">The sect builds slowly on its own while you play. Your stones build now: the blessing grows for you, and the sect remembers who paid. Fully built, it could give ${x(b.reach)}.</div></details>` : ''
    return this._sec(title, head + lost + this._effects(b.effects, s, sup, b.full)
      + (sup ? '<div class="fk-note sv-warn">The sect lost a war and licks its wounds. Its blessing returns in a few hours.</div>' : '') + fund, '', 'sv-bless-sec')
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
    const autoOk = this.gs.automationUnlocked('autoSectMissions'), autoOn = autoOk && s.automation.autoSectMissions
    const picks = s.automation.autoSectMissionIds || []
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
        const lock = !unlocked ? `${SECT_RANKS[m.minRank].name} and above` : full ? (autoOn ? (picks.includes(m.id) ? 'Picked: taken up when a slot frees' : 'Both slots busy · pick Keep to queue it') : 'Both mission slots are busy') : ''
        foot = this._tile('mission', 'explore', 'Set out', `${dur} away`, lock, 'wide sv-go', ` data-id="${m.id}"`)
      }
      const picked = picks.includes(m.id)
      const chip = autoOn && unlocked ? `<button class="pack-chip loc-auto sv-keep${picked ? ' active' : ''}" data-sa="autopick" data-id="${m.id}" data-on="${picked ? 0 : 1}" title="${picked ? 'Auto-Missions keeps this running. Click to unpick.' : 'Have Auto-Missions keep this running'}">${Icon('play')} ${picked ? 'Kept' : 'Keep'}</button>` : ''
      return `<div class="sv-card${active ? ' active' : ''}${unlocked ? '' : ' locked'}">
        <div class="sv-card-h"><span class="sv-card-n" title="${h.esc(m.nameCN)}">${h.esc(m.name)}</span>${chip}<span class="sv-card-t">${dur}</span></div>
        <div class="sv-card-d">${h.esc(m.desc)}</div><div class="sv-gains">${gains}</div>${foot}</div>`
    }).join('')
    return `<div class="sv-head"><span>${sect.activeMissions.length} of ${SECT_MAX_MISSIONS} missions underway</span><span class="sv-head-n">Rewards ×${mult} at your rank · missions finish while you are away</span></div>
      ${this._autoRow(s, autoOk, autoOn, picks)}
      <div class="sv-grid">${cards}</div>`
  }

  // ── 1.14b: the library ─────────────────────────────────────────────────────
  _libraryTile(s) {
    const lib = this.gs.sectLibrary?.()
    if (!lib) return ''
    const buyable = lib.arts.filter(x => !x.lock && !x.known).length
    const els = lib.elements.map(e => ART_ELEMENTS[e].name).join(' + ')
    return this._tile('go', 'scroll', 'The library', `${els} + neutral arts${buyable ? ` · <span class="up">${buyable} you can take now</span>` : ''}`, '', '', ' data-view="sect-library"')
  }
  _library(s, def) {
    const h = this.h, lib = this.gs.sectLibrary()
    if (!lib) return ''
    const R = ART_RARITY_ORDER, groups = {}
    for (const x of lib.arts) (groups[ARTS[x.id].rarity] ||= []).push(x)
    const els = lib.elements.map(e => `<span class="art-root el-${e}">${Icon(ART_ELEMENTS[e].icon)}${ART_ELEMENTS[e].name}</span>`).join('')
    const card = x => {
      const a = ARTS[x.id], short = x.price - lib.contribution
      const foot = x.lock === 'rank' ? this._tile('buyart', 'lock', 'Sealed', '', `${SECT_RANKS[x.needRank]?.name || 'A higher rank'} and above`, 'wide sv-go')
        : this._tile('buyart', 'scroll', `Take the manual`, `<span class="cost">${x.price} Contribution</span>${short > 0 ? ` <span class="down">· ${h.fmt(short)} short</span>` : ''}`,
            x.lock === 'contribution' ? `${h.fmt(short)} Contribution short` : '', 'wide sv-go', ` data-id="${x.id}"`)
      const tags = [x.known ? '<span class="art-tag on">you know it · a copy deepens it</span>' : '', x.held ? `<span class="art-tag">${x.held} in your pack</span>` : '',
        x.tooProfound ? `<span class="art-tag">studied from ${h.esc(stageShortName(a.minStage))}</span>` : ''].join('')
      return `<div class="sv-card sv-art el-${a.element}${x.lock === 'rank' ? ' locked' : ''}">
        <div class="sv-card-h">${Icon(ART_ELEMENTS[a.element].icon)}<span class="sv-card-n art-n r-${a.rarity}">${h.esc(a.name)}</span></div>
        <div class="sv-art-m">${h.esc(ArtsView.meta(this.gs, a.id))}</div>
        <div class="sv-card-d">${h.esc(a.move?.desc || a.passive.desc)}</div>${tags ? `<div class="sv-gains">${tags}</div>` : ''}${foot}</div>`
    }
    const sections = R.filter(g => groups[g]).map(g => {
      const need = SECT_LIBRARY_GRADE_BY_RANK.findIndex(x => R.indexOf(x) >= R.indexOf(g))
      const open = lib.rank >= need
      return this._sec(`${ART_RARITY[g].name} grade`, `<div class="sv-grid">${groups[g].map(card).join('')}</div>`,
        open ? `${SECT_LIBRARY_PRICE[g]} Contribution each` : `opens to ${SECT_RANKS[need].name}`, open ? '' : 'sv-sealed')
    }).join('')
    return `<div class="sv-head"><span>The ${h.esc(def.name)} library · ${els}<span class="art-root el-neutral">${Icon('el_neutral')}Neutral</span></span>
        <span class="sv-head-n"><b class="gold">${h.fmt(lib.contribution)}</b> Contribution to spend · spending it keeps your rank · a manual goes to your pack, study it in Path → Arts</span></div>
      ${this._giving(s)}${sections}`
  }
  // Your founded sect's library: only what you have given it (disciples train in it for war; you study it at half time)
  _ownLibrary(s) {
    const h = this.h, info = this.gs.sectDonateInfo()
    if (!info) return ''
    if (!info.shelf.length && !info.manuals.length)                   // empty and nothing to give: one line, Halls stays short
      return this._sec('Sect library', '<div class="fk-note">Empty. Give it a spare art manual and your disciples train in it for war; you can study it here at half the time.</div>')
    return `<div class="sv-head"><span>The ${h.esc(s.ownSect.name)} library</span>
        <span class="sv-head-n">Manuals you give: war strength, and study at half the time.</span></div>
      ${this._giving(s, true)}`
  }
  // Giving manuals (both kinds of sect): the shelf so far, then the manuals in your pack and what each would bring.
  // `fold` (a founder's library under Halls): the give list folds shut, with its count, so Halls stays short.
  _giving(s, fold = false) {
    const h = this.h, info = this.gs.sectDonateInfo()
    if (!info) return ''
    const pct = v => `${Math.round(v * 100)}%`
    const lockText = { member: '', known: 'You know it', busy: 'Every study desk is in use', studying: 'On a study desk now' }
    const shelf = info.shelf.map(x => {
      const a = ARTS[x.artId]
      const act = !info.own ? '' : !x.lock ? `<button class="lg-buy" data-sa="sectstudy" data-id="${x.artId}">Study<span>${h.fmtTime(x.seconds)}</span></button>`
        : `<span class="lib-lock">${x.lock === 'known' ? Icon('check') : Icon('lock')}${h.esc(x.lock === 'stage' ? `Opens at ${stageShortName(a.minStage)}` : lockText[x.lock] || '')}</span>`
      return `<div class="lib-row el-${a.element}"><span class="lib-g">${Icon(ART_ELEMENTS[a.element].icon)}</span>
        <span class="lib-t"><span class="art-n r-${a.rarity}">${h.esc(a.name)}</span><span class="lib-m">${h.esc(ART_RARITY[a.rarity].name)} · war strength +${pct(SECT_SHELF_WAR[a.rarity] || 0)}</span><span class="lib-m lib-by">given by ${h.esc(x.by)}, year ${x.year}</span></span>${act}</div>`
    }).join('') || `<div class="fam-empty">Nothing given yet. A manual you give ${info.own ? 'stays in your library' : 'earns Contribution'} and trains the ${info.own ? 'disciples' : 'sect'} for war.</div>`
    const give = info.manuals.map(x => {
      const a = ARTS[x.id]
      const pays = [x.contribution ? `<span class="up">+${x.contribution} Contribution</span>` : '', x.war ? `war strength +${pct(x.war)}` : 'the war bonus is at its cap'].filter(Boolean).join(' · ')
      return `<div class="lib-row el-${a.element}"><span class="lib-g">${Icon(ART_ELEMENTS[a.element].icon)}</span>
        <span class="lib-t"><span class="art-n r-${a.rarity}">${h.esc(a.name)}</span><span class="lib-m">${x.n} in your pack${x.known ? ' · <span class="up">you know it: a spare</span>' : ' · <span class="down">not yet learned</span>'}</span><span class="lib-m">${pays}</span></span>
        ${x.lock ? `<span class="lib-lock">${Icon('check')}Already on the shelf</span>` : `<button class="lg-buy" data-sa="donate-art" data-id="${x.id}">Give<span>1 manual</span></button>`}</div>`
    }).join('') || '<div class="fam-empty">No manuals in your pack. Spares turn up on expeditions, beasts, the Arena and people you defeat.</div>'
    const giveSec = fold && info.manuals.length
      ? `<section class="fam-sec clan-lib sv-give"><details class="lib-write"${this.giveOpen ? ' open' : ''}><summary class="fa-quiet" data-sa="givefold"><span class="lib-fold">${Icon('play')}</span>Give a manual <span class="fam-count">${info.manuals.length} in your pack</span></summary>${give}</details></section>`
      : this._sec('Give a manual', give, info.manuals.length ? `${info.manuals.length} in your pack` : '', 'clan-lib sv-give')
    return `<div class="sv-give-cols">
      ${this._sec('Given to the library', shelf, `war strength +${pct(info.war)} of +${pct(info.cap)}`, 'clan-lib sv-shelf')}
      ${giveSec}</div>`
  }

  // Auto-Missions switch (same row as Explore's Auto-Explore): On/Off, what it keeps running, or when it unlocks.
  _autoRow(s, autoOk, autoOn, picks) {
    const h = this.h
    if (!autoOk) return `<div class="exp-auto sv-auto locked"><span class="exp-auto-l">${Icon('lock')}<b>Auto-Missions</b><small>unlocks at ${h.esc(AUTOMATION_UNLOCKS.autoSectMissions.label)}</small></span></div>`
    const names = picks.map(id => SECT_MISSIONS.find(m => m.id === id)?.name).filter(Boolean)
    const note = !autoOn ? 're-takes missions for you when a slot frees'
      : s.playMode === 'active' ? 'rests while you play in Active Mode'
      : names.length ? `on: keeps <b class="exp-auto-next">${names.map(h.esc).join('</b> and <b class="exp-auto-next">')}</b> running · tap <b>Kept</b> to let one go`
      : 'on: re-takes each mission as it finishes · pick <b>Keep</b> on a card to choose'
    return `<div class="exp-auto sv-auto"><span class="exp-auto-l">${Icon('auto')}<b>Auto-Missions</b><small>${note}</small></span>
      <span class="set-seg"><button class="set-opt is-on${autoOn ? ' active' : ''}" data-sa="auto" data-on="1">On</button><button class="set-opt${autoOn ? '' : ' active'}" data-sa="auto" data-on="0">Off</button></span></div>`
  }

  // ── Own sect ───────────────────────────────────────────────────────────────
  // ── Phase 43e: the sect master + the takeover (docs/systems/npc-sects.md → "43e") ──
  // Who sits above you, how they regard you (the sect's stance: your service moves it), and, for a Grand Elder at any
  // realm, the challenge (real odds, their chance to make it lethal, what a loss costs) and the petition to step down.
  _master(s) {
    const m = this.gs.sectMasterInfo?.()
    if (!m) return ''
    const h = this.h, sgn = n => (n > 0 ? '+' : '') + n, pct = v => `${Math.round(v * 100)}%`
    const oc = this._oddsClass(m.challenge.odds), poc = this._oddsClass(m.petition.odds)
    const odds = `<span class="odds-in ${oc}" data-bd="personfight:${m.id}:sectmaster" title="Why these odds?"><b>${pct(m.challenge.odds)}</b> to win <i data-icon="why"></i></span>`
    const tiles = [
      this._tile('mchallenge', 'sword', 'Challenge for the seat', `${odds}<br><span class="down">${m.challenge.lethalPct}% they make it to the death</span> · lose and live: <span class="down">${h.esc(m.challenge.lossRank)}</span>`, m.challenge.lock, 'wide'),
      this._tile('mpetition', 'speech', 'Ask them to step down', `<span class="${poc}">${pct(m.petition.odds)} they agree</span> <span class="ws-why">(their regard, and your Might ${h.fmt(m.myMight)} against their ${h.fmt(m.masterMight)})</span><br><span class="sv-dim">refused: <span class="down">${sgn(SECT_MASTER.petition.failStance)} regard</span>, no blood</span>`, m.petition.lock, 'wide'),
    ].join('')
    const P = m.prize
    const prize = `${P.halls} hall${P.halls === 1 ? '' : 's'} (each back to Lv.1), ${P.stay} disciples at once, an old guard of ${P.oldGuard[0]}–${P.oldGuard[1]} to win over${P.library ? `, the ${P.library} manual${P.library === 1 ? '' : 's'} on the shelf` : ''}. A peaceful handover leaves a smaller old guard; a master you spare goes off to raise a sect of their own.`
    return `<section class="fam-card sect sv-master"><div class="fc-head"><span class="fc-glyph" data-icon="crown"></span><div class="fc-id">
        <div class="fc-name">${PersonCard.link(m.id, m.name)}<span class="sv-master-k">sect master</span></div>
        <div class="fc-sub">${h.esc(stageShortName(m.stage))} · ${h.esc(m.temper)}${m.record.fought ? ` · you have fought ${m.record.fought}×` : ''}</div>
        <div class="fc-tags"><span class="fam-tag tone-${m.regardTone}" title="Their regard for you: the sect's stance (${m.regard} of ±100). Missions, answering war calls, levies, loyalty when courted and rising in rank warm it; refusals and ignored calls cool it.">regard: ${h.esc(m.regardLabel)} ${sgn(m.regard)}</span>
          <span class="fam-tag" title="Their Might, on the same scale as yours">Might ${h.fmt(m.masterMight)}</span></div></div></div>
      ${m.grand ? '' : `<div class="fk-note">Only a ${h.esc(SECT_RANKS[SECT_RANKS.length - 1].name)} may call them out or ask for the seat. No realm is too low to try.</div>`}
      <div class="ws-choices">${tiles}</div>
      ${m.grand ? `<div class="sv-prize-box"><div class="ws-k">The prize</div><div class="fk-note">${prize}</div></div>` : ''}</section>`
  }

  // After a takeover: the old guard who knelt to the last master wait on your word (it never expires).
  _oldGuard(s) {
    const g = this.gs.oldGuardInfo?.()
    if (!g) return ''
    const h = this.h, [win, go, purge] = g.choices
    const tiles = [
      this._tile('oldguard', 'stone', 'Win them over', `<span class="cost">${h.fmt(win.cost)} stones</span> · all ${g.n} stay${g.branchOk && g.n >= 2 ? ` as a branch under their eldest (loyalty ${win.loyalty})` : ''} · <span class="up">+${win.karma} karma</span>`, win.lock, 'wide', ' data-id="win"'),
      this._tile('oldguard', 'gate', 'Let them choose', `free · about ${Math.round(go.stay * 100)}% stay${g.splinter ? ` · <span class="down">the rest join ${h.esc(g.master)} at the ${h.esc(g.splinter)}</span>` : ' · the rest scatter'}`, '', 'wide', ' data-id="go"'),
      this._tile('oldguard', 'skull', 'Purge them', `free · none stay${g.splinter ? ', and none reach the exile' : ''} · <span class="down">${purge.karma} karma</span>`, '', 'wide', ' data-id="purge"'),
    ].join('')
    return `<section class="fam-card sect ws-event sv-oldguard"><div class="fc-head"><span class="fc-glyph" data-icon="disciple"></span><div class="fc-id">
        <div class="fc-name">The old guard of ${h.esc(g.master)}</div>
        <div class="fc-sub ws-ev-text">${g.n} veterans who knelt to ${h.esc(g.master)} stand apart in the courtyard${g.how === 'peaceful' ? ', their old master watching from the elders’ benches' : ''}. They will serve, or go, at your word.</div></div></div>
      <div class="ws-choices">${tiles}</div><div class="fk-note sv-wait">It waits on you. Nothing happens until you choose.</div></section>`
  }

  // 43h follow-up: the sects of the world live in 世 World → Sects. A tile here points the way.
  _worldLink(s, tile = false) {
    const info = this.gs.worldSectsInfo?.()
    if (!info?.rows.length) return ''
    const t = this._tile('go', 'gate', 'Sects of the world', `${info.rows.length} sects · in the World tab · your Might <b class="gold">${this.h.fmt(info.playerMight)}</b>`, '', '', ' data-view="world"')
    return tile ? t : this._sec('Sects of the world', `<div class="fa-grid">${t}</div>`)
  }

  // War → "Declare war" (a leader) / "Urge war on a sect" (a member): pick a sect from the list, see the odds, confirm.
  _warPicker(s, own) {
    const h = this.h, info = this.gs.worldSectsInfo?.()
    if (!this.warPick || !info) return ''
    const act = own ? 'war' : 'urge', sgn = n => (n > 0 ? '+' : '') + n
    const rows = info.rows.filter(r => !r.own && !r.mine).map(r => {
      const a = this.gs.sectRelationsInfo(r.id)?.actions.find(x => x.id === act)
      if (!a) return ''
      const bits = [...(a.odds != null ? [`<span class="${this._oddsClass(a.odds)}">${Math.round(a.odds * 100)}% your master agrees</span>`] : []),
        ...a.bits.slice(0, 1).map(b => `<span class="${b.tone || ''}">${h.esc(b.t)}</span>`), ...(own && r.stance <= SECT_RELATIONS.war.unprovokedAbove ? ['<span class="up">they wronged you first: no karma</span>'] : [])].join(' · ')
      return `<div class="sv-pick-row${a.lock ? ' locked' : ''}"><div class="sv-pick-h"><span class="sv-pick-n">${h.esc(r.name)}</span>
          <span class="fam-tag tone-${r.stanceTone}">${h.esc(r.stanceLabel)} ${sgn(r.stance)}</span>${r.sworn ? '<span class="fam-tag tone-jade">sworn ally</span>' : ''}<span class="sv-pick-m">${h.esc(r.band)} · ${h.fmt(r.might)}</span></div>
        ${this._tile(own ? 'declare' : 'urgeon', own ? 'flag' : 'speech', own ? 'Declare war' : 'Urge war', bits, a.lock, 'wide sdx-war', ` data-id="${r.id}"`)}</div>`
    }).join('')
    return this._sec(own ? 'Declare war on…' : 'Urge your master to war on…', `<div class="sv-pick">${rows}</div>
      <div class="fk-note">${own ? `Every declaration: ${SECT_RELATIONS.war.stance} with them, and against a sect that never wronged you ${SECT_RELATIONS.war.unprovokedKarma} karma while the others cool toward you. Your scouts ride out at once; battle comes when the preparing is done, as in any war. Once it is declared, you may vow to raze them.` : `Your master decides, by their temper and their regard for you. Refused: ${SECT_RELATIONS.urge.failRegard} regard.`}</div>`, '', 'sv-pick-sec')
  }

  // Disciples → "Poach recruits": pick a sect, then one of its named disciples (cost, odds, how the sect takes it).
  startPoach(id = null) { this.poachView = id ? { id } : { id: null } }
  _poach(s) {
    const h = this.h, sgn = n => (n > 0 ? '+' : '') + n, pv = this.poachView
    if (!pv) return ''
    const back = (label, sa) => `<button class="fa-quiet sdx-back" data-sa="${sa}">${Icon('back')} ${label}</button>`
    if (!pv.id) {
      const rows = this.gs.poachTargets().map(r => `<button class="ws-row sv-poach-sect" data-sa="poachsect" data-id="${r.id}" ${r.lock && !/^Again/.test(r.lock) ? '' : ''}>
          <span class="ws-top"><span class="ws-n">${h.esc(r.name)}</span><span class="ws-might">${h.fmt(r.disciples)} disciples</span><span class="ws-go">${Icon('play')}</span></span>
          <span class="ws-line"><span class="fam-tag tone-${r.stanceTone}">${h.esc(r.stanceLabel)} ${sgn(r.stance)}</span>${r.sworn ? '<span class="fam-tag tone-jade">sworn ally</span>' : ''}${r.lock ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${h.esc(r.lock)}</span>` : ''}</span></button>`).join('')
      return this._sec('Poach recruits', `${back('Back to the gate', 'poachclose')}<div class="fk-note">Choose a sect; you will see its named disciples, what each would cost, and the odds they come over.</div>${rows}`, '', 'sv-poach')
    }
    const R = this.gs.poachRoster(pv.id)
    if (!R) { this.poachView = { id: null }; return this._poach(s) }
    const cards = R.list.map(d => `<div class="sv-card sv-poach-card">
        <div class="sv-card-h"><span class="sv-card-n">${h.esc(d.name)}</span>${SV_STARS(d.talent)}<span class="sv-lv">Lv.${d.level}</span></div>
        <div class="sv-gains"><span class="sv-gain">loyal to them: ${d.loyalty}</span><span class="sv-gain ${this._oddsClass(d.odds)}">${Math.round(d.odds * 100)}% they come</span><span class="sv-gain down">${sgn(d.stance)} with the sect</span></div>
        ${this._tile('poach', 'disciple', 'Lure them away', `<span class="cost">${h.fmt(d.cost)} stones</span> · paid either way`, R.lock || d.lock, 'wide sv-go', ` data-id="${h.esc(d.id)}"`)}</div>`).join('')
    return this._sec(`The ${h.esc(R.name)}’s disciples`, `${back('All sects', 'poachback')}
      <div class="fk-note">Your Might ${h.fmt(R.myMight)} against theirs ${h.fmt(R.theirMight)}. A loyal or gifted disciple is harder to lure and costs more; whoever you fail to lure reports you to ${h.esc(R.leader)}.${R.lock ? ` <span class="down">${h.esc(R.lock)}.</span>` : ''}</div>
      <div class="sv-grid tight">${cards || '<div class="fk-note">They have no one to spare.</div>'}</div>`, R.list.length, 'sv-poach')
  }

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
      <div class="fam-col">${this._oldGuard(s)}${this._worldEvent(s)}
        <section class="fam-card sect"><div class="fc-head"><span class="fc-glyph" data-icon="hall"></span><div class="fc-id">
          <div class="fc-name">${h.esc(o.name)}</div>
          <div class="fc-sub">${o.takenOver ? `Taken from ${h.esc(o.takenOver.from)} in year ${o.takenOver.year}${o.takenOver.how === 'peaceful' ? ', who handed you the seal' : ''}. Its halls are yours to raise again.` : 'Your sect, founded by your own hand.'} Disciples cultivate beside you and share what they gather.</div>
          <div class="fc-tags"><span class="fam-tag tone-gold"><b data-icon="crown"></b>Sect Leader</span><span class="fam-tag" title="Fame: disciples ${f.disciples} + halls ${f.buildings} + Sect Hall ${f.hall} + victories ${f.wins}${f.arena ? ` + the Arena ${f.arena}` : ''}. Fame draws stronger rivals, and more often.">Fame ${h.fmt(f.total)}</span></div></div></div>
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
          ${this._tile('go', 'gate', 'Your mountain', builtN ? `${builtN} of ${SECT_BUILDINGS.length} halls raised on it` : 'bare rock, waiting for halls', '', '', ' data-view="sect-base"')}
          ${this._tile('go', 'disciple', `Disciples · ${o.disciples.length} of ${info.hall.cap}`, info.full ? 'every seat is taken' : `<span class="up">${info.hall.cap - o.disciples.length} seat${info.hall.cap - o.disciples.length === 1 ? '' : 's'} open</span> · ${o.recruitPool.length} waiting at the gate`, '', '', ' data-view="sect-disciples"')}
          ${this._tile('go', 'hall', `Halls · ${builtN} of ${SECT_BUILDINGS.length} · ${info.totalLevels} levels`, info.buildings.some(x => x.ok) ? '<span class="up">one is within reach</span>' : info.buildings.some(x => x.canUpgrade) ? '<span class="up">one can be deepened</span>' : builtN === SECT_BUILDINGS.length ? 'all raised' : 'see what each would give', '', '', ' data-view="sect-halls"')}
          ${this._tile('go', 'flag', warOn ? (w.declaredByYou ? `You march on the ${h.esc(w.enemyName)}` : `The ${h.esc(w.enemyName)} march on you`) : 'Sect wars', warOn
            ? `${w.phase === 'scouting' ? 'strike' : 'arrive'} in ${this._warClock(w)} · <span class="${this._oddsClass(odds?.chance || 0)}">${this._pct(odds?.chance || 0)}</span> to hold`
            : `next threat in ${this._warClock(w)} · record ${w.warVictories || 0}–${w.warDefeats || 0}`, '', warOn ? 'urgent' : '', ' data-view="sect-war"')}
          ${this._worldLink(s, true)}</div>`)}
        ${this._lastWar(s, w, true)}
      </div></div>`
  }

  _fameSec(f) {
    const h = this.h
    return this._sec('Fame', `<div class="sv-fame">${[['Disciples (talent × level)', f.disciples], ['Halls raised', f.buildings], ['Sect Hall', f.hall], ['Wars won', f.wins], ...(f.arena ? [['Your Arena wins', f.arena]] : [])].map(([k, v]) =>
      `<div class="sv-fx-row"><span>${k}</span><b>${h.fmt(v)}</b></div>`).join('')}</div>
      <div class="fk-note">Fame draws rivals: the more you have, the sooner the next one comes, and the richer the spoils.</div>`, h.fmt(f.total), 'sv-fame-sec')
  }

  _halls(s) {
    const h = this.h, info = this.gs.ownSectInfo(), d = s.derived, o = s.ownSect
    // Phase 43: a hall is levelled. `now` reads its effects at its own level and, when it can be deepened, the next
    // level's value too — the same breakdown `_recalc` applies, so the preview is the real math.
    // Overlay/phone get one terse line per hall (the roomy modes get the full sentence). Both read the same math.
    const short = document.body.dataset.layout === 'overlay' || document.body.dataset.narrow === '1'
    const now = x => {
      const e = sectBuildingEffects(x.b.id, Math.max(1, x.level))
      const n = x.level > 0 && !x.maxed ? sectBuildingEffects(x.b.id, x.level + 1) : null
      const arrow = t => n ? ` <span class="up">→ ${t}</span>` : x.level ? '' : ` <span class="up">(if raised: ${t})</span>`
      const next = (cur, key) => n ? cur / (e[key] || 1) * (n[key] || 1) : cur * (e[key] || 1)   // cur as it would be at the next level
      const p = v => `${(v * 100).toFixed(1)}%`
      if (e.disciple_qi_mult) return `${short ? 'Qi/s' : 'disciples give'} +${p(info.totals.qi)}${short ? '' : ' Qi/s'}${arrow(`+${p(next(info.totals.qi, 'disciple_qi_mult'))}`)}`
      if (e.craft_double_chance) { const c = d.sectCraftDouble || 0, nc = next(c, 'craft_double_chance')
        return `double crafts${short ? '' : ':'} ${Math.round(Math.min(1, c) * 100)}%${arrow(`${Math.round(Math.min(1, nc) * 100)}%`)}` }
      if (e.beast_slots) return `${short ? 'beasts' : 'beast slots:'} ${d.maxBeasts}${arrow(`${next(d.maxBeasts, 'beast_slots')}`)}`
      if (e.disciple_xp_mult) return `disciples grow ×${(d.discipleXpMult || 1).toFixed(2)}${arrow(`×${next(d.discipleXpMult || 1, 'disciple_xp_mult').toFixed(2)}`)}`
      if (e.war_defense) return (x.level && d.arrayDamaged) ? '<span class="down">defense damaged — it mends by itself</span>'
        : `${short ? 'defense' : 'war defense'} +${Math.round((d.warDefense || 0) * 100)}%${arrow(`+${Math.round(next(d.warDefense || 0, 'war_defense') * 100)}%`)}`
      if (e.income_mult) return `income ${info.totals.stonesMin.toFixed(1)}${arrow(`${next(info.totals.stonesMin, 'income_mult').toFixed(1)}`)} stones/min`
      return ''
    }
    const cards = info.buildings.map(x => {
      const b = x.b
      const lv = x.level ? `<span class="sv-card-t tone-jade">Lv.${x.level}${x.maxed ? ' · full' : ''}</span>` : ''
      const head = `<div class="sv-card-h"><span class="sv-card-n" title="${h.esc(b.nameCN)}">${h.esc(b.name)}</span>${lv}</div>`
      if (!x.level) {                                 // not raised yet: the Build tile
        const cost = [`<span class="sv-gain${x.stonesShort ? ' short' : ''}">${h.fmt(b.stones)} stones</span>`,
          ...Object.entries(b.items).map(([id, q]) => { const have = s.inventory[id] || 0; return `<span class="sv-gain${have < q ? ' short' : ''}">${q} ${h.esc(ITEMS[id]?.name || id)} <i>(${h.fmt(have)})</i></span>` })].join('')
        const lock = x.stonesShort ? `${h.fmt(x.stonesShort)} stones short` : x.missing.length ? `Need ${x.missing.map(m => `${m.need - m.have} more ${ITEMS[m.id]?.name || m.id}`).join(', ')}` : ''
        return `<div class="sv-card">${head}<div class="sv-card-d">${h.esc(b.desc)}</div><div class="sv-now">${now(x)}</div>
          <div class="sv-gains">${cost}</div>${this._tile('build', 'hall', 'Build', 'once, for good', lock, 'wide sv-go', ` data-id="${b.id}"`)}</div>`
      }
      const lock = x.upShort ? `${h.fmt(x.upShort)} stones short` : ''
      const action = x.maxed ? '<div class="sv-now dim">At its full height.</div>'
        : this._tile('upgrade', 'rise', `Deepen Lv.${x.level + 1}`, `${h.fmt(x.upgradeCost)} stones`, lock, 'wide sv-go', ` data-id="${b.id}"`)
      return `<div class="sv-card built">${head}<div class="sv-card-d">${h.esc(b.desc)}</div><div class="sv-now">${now(x)}</div>${action}</div>`
    }).join('')
    const hall = info.hall
    const hallCard = `<div class="sv-card hall">
        <div class="sv-card-h"><span class="sv-card-n">Sect Hall</span><span class="sv-card-t">Lv.${o.hallLevel} of ${SECT_HALL_LEVELS.length}</span></div>
        <div class="sv-card-d">The heart of the sect. Each level seats five more disciples.</div>
        <div class="sv-now">${hall.cap} disciple seats · ${o.disciples.length} taken</div>
        ${hall.cost != null ? this._tile('hall', 'hall', `Raise Lv.${o.hallLevel + 1}`, `<span class="up">${hall.cap} → ${hall.nextCap}</span> seats · ${h.fmt(hall.cost)}`, '', 'wide sv-go') : '<div class="sv-now dim">The hall stands at its full height.</div>'}</div>`
    return `<div class="sv-head"><span>${info.builtN} of ${SECT_BUILDINGS.length} halls raised · ${info.totalLevels} levels</span><span class="sv-head-n">each works for good — deepen them for more</span></div>
      <div class="sv-grid">${hallCard}${cards}</div>`
  }

  _persona(id) { return PERSONALITIES.find(x => x.id === id) }

  _disciples(s) {
    const h = this.h, info = this.gs.ownSectInfo(), o = s.ownSect
    const main = info.disciples.filter(x => !x.branch)
    const bFull = !!this.gs.branchInfo()?.full   // at SECT_BRANCH.maxBranches the "branch" button locks and says why
    const roster = main.map(x => `<div class="sv-disc" title="+${(x.qi * 100).toFixed(2)}% Qi/s · ${x.stonesMin.toFixed(2)} stones/min · ${x.herbsMin.toFixed(2)} herbs/min">
        <div class="sv-disc-h"><span class="sv-disc-n">${x.kin ? '<b class="sv-kin" data-icon="heir" title="Your child"></b>' : ''}${PersonCard.link(x.d.pid || x.d.id, x.d.name)}</span>${SV_STARS(x.d.talent)}<span class="sv-lv">Lv.${x.d.level}${x.max ? ' <b>max</b>' : ''}</span>
          <span class="sv-disc-act"><button class="sv-branch-btn" data-sa="branch-appoint" data-id="${h.esc(x.d.id)}" ${bFull ? `disabled title="Your sect already holds ${SECT_BRANCH.maxBranches} branches, the most it can. Dissolve one to raise another."` : `title="Raise ${h.esc(x.d.name)} to head their own branch"`} aria-label="branch">${Icon('branch')}<span class="sv-act-l">branch</span></button>
          <button class="sv-dismiss" data-sa="dismiss" data-id="${h.esc(x.d.id)}" title="Send ${h.esc(x.d.name)} away" aria-label="dismiss">${Icon('close')}<span class="sv-act-l">dismiss</span></button></span></div>
        <span class="fam-bar thin"><i class="tone-gold" data-w="${Math.round(x.xpFrac * 100)}"></i></span>
        <div class="sv-disc-y"><span class="up">+${(x.qi * 100).toFixed(2)}% Qi/s</span><span>${x.stonesMin.toFixed(2)} stones/min</span><span>${x.herbsMin.toFixed(2)} herbs/min</span>
          <span class="dim">${x.max ? 'fully grown' : `Lv.${x.d.level + 1} in ${h.fmtTime(x.eta)}`}</span></div></div>`).join('')
    const pool = info.candidates.map(x => `<div class="sv-card sv-cand">
        <div class="sv-card-h"><span class="sv-card-n">${h.esc(x.c.name)}</span>${SV_STARS(x.c.talent)}</div>
        <div class="sv-gains"><span class="sv-gain up">+${(x.qi * 100).toFixed(2)}% Qi/s</span><span class="sv-gain">${x.stonesMin.toFixed(2)} stones/min</span><span class="sv-gain dim">at Lv.1, more as they grow</span></div>
        ${this._tile('recruit', 'disciple', 'Take <span class="sv-long">them </span>in', this._cost(x.cost, s.spiritStones), x.reason === 'full' ? 'Every hall seat is taken: raise the Sect Hall' : x.reason === 'stones' ? `${h.fmt(x.cost - Math.floor(s.spiritStones))} stones short` : '', 'wide sv-go', ` data-id="${h.esc(x.c.id)}"`)}</div>`).join('')
    return `<div class="fam-view sect-view sv-disc-view">
      <div class="fam-col">${this._branches(s)}${this._sec('Your disciples', (roster || '<div class="fk-note">No one has taken your teaching yet. Candidates wait at the gate.</div>') +
        (main.length ? `<div class="fk-note sv-together">Your own hall: +${(info.totals.qi * 100).toFixed(1)}% Qi/s · ${info.totals.stonesMin.toFixed(1)} stones and ${info.totals.herbsMin.toFixed(1)} herbs a minute. Talent and level raise all three.</div>` : ''),
        `${main.length} / ${info.hall.cap}`)}</div>
      <div class="fam-col">${this.poachView ? this._poach(s) : this._sec(`At the gate <button class="fa-quiet sv-poach-open" data-sa="poachopen" title="Lure a trained disciple away from another sect: choose the sect, then the disciple">${Icon('disciple')} Poach recruits</button>`, `<div class="sv-grid tight">${pool}</div>
        ${this._tile('reroll', 'auto', 'Call others to the gate', `${this._cost(RECRUIT_REROLL_COST, s.spiritStones)} · or wait: new faces in <span data-pooltimer>${h.fmtTime(Math.max(0, Math.ceil((o.poolRefreshAt - Date.now()) / 1000)))}</span>`, s.spiritStones < RECRUIT_REROLL_COST ? `Costs ${RECRUIT_REROLL_COST} stones` : '', 'wide sv-call')}`, o.recruitPool.length)}</div></div>`
  }

  // Phase 45 (sect-branches.md): the sub-leaders' branches + the Tournament of Branches. Lives inside Disciples
  // (no sixth sub-tab — the row is already full and cramped on Overlay).
  _branches(s) {
    const h = this.h, bi = this.gs.branchInfo()
    if (!bi) return ''
    // Empty and narrow? The per-row "branch" buttons already advertise it — don't spend Overlay's short pane on a note.
    if (!bi.count && (document.body.dataset.layout === 'overlay' || document.body.dataset.narrow === '1')) return ''
    const S = SECT_BRANCH, t = bi.tourney
    // The reason a tournament can't be held shows once in the note (not repeated on all three prize tiles).
    const lockWhy = t.secsLeft > 0 ? `Held recently — again in ${h.fmtTime(Math.ceil(t.secsLeft))}` : t.short ? `Costs ${h.fmt(t.cost)} stones — you are short` : bi.count < 2 ? 'Raise a second branch first' : ''
    const pbtn = (kind, glyph, name, eff, tip) => `<button class="sv-prize${t.ready ? '' : ' locked'}" data-sa="bt" data-id="${kind}" ${t.ready ? '' : 'disabled'} title="${h.esc(`The winning branch takes ${tip}`)}">
      <span class="sv-prize-g">${Icon.g(glyph)}</span><span class="sv-prize-n">${name}</span><span class="sv-prize-e">${eff}</span></button>`
    const noteText = lockWhy || `Costs ${h.fmt(t.cost)} stones · the winner takes the prize, the rest resent it`
    const tourney = bi.count >= 2 || t.secsLeft > 0 ? `<div class="sv-tourney">
        <div class="sv-tourney-h">${Icon('crown')} Tournament of Branches</div>
        <div class="sv-tourney-n${lockWhy ? ' why' : ''}">${h.esc(noteText)}</div>
        <div class="sv-tourney-k">Choose the prize to open the contest</div>
        <div class="sv-prizes">
          ${pbtn('qi', 'qi', 'Qi', `+${Math.round(t.qiFrac * 100)}% of cap`, `Qi worth ${Math.round(t.qiFrac * 100)}% of your cap`)}
          ${pbtn('art', 'scroll', 'An art', 'a realm manual', 'a combat-art manual of your realm')}
          ${pbtn('stones', 'stone', 'Stones', `+${h.fmt(t.stones)}`, `${h.fmt(t.stones)} Spirit Stones`)}
        </div>
        ${bi.last ? `<div class="fk-note">Last: the ${h.esc(bi.last.winnerName)} won, year ${bi.last.year}.</div>` : ''}</div>` : ''
    const cards = bi.branches.map(x => {
      const hd = x.head, pers = hd ? this._persona(hd.personality) : null
      const loy = Math.round(x.loyalty), loyTone = loy > 60 ? 'jade' : loy > S.secedeAt ? 'gold' : 'red'
      return `<div class="sv-branch${x.seceding ? ' risk' : ''}">
        <div class="sv-branch-h"><span class="sv-branch-n">${h.esc(x.b.name)}</span>
          ${hd ? `<span class="sv-branch-head">${x.b.since ? `since year ${x.b.since} · ` : ''}led by ${h.esc(hd.name)}</span>` : ''}</div>
        <div class="sv-branch-tags">
          ${pers ? `<span class="fam-tag" title="${h.esc(pers.blurb)}"><b data-icon="mask"></b>${h.esc(pers.name)}</span>` : ''}
          ${hd?.kin ? '<span class="fam-tag tone-gold"><b data-icon="heir"></b>kin</span>' : ''}
          <span class="fam-tag tone-${loyTone}" title="Loyalty only falls when you wrong them">loyalty ${loy}</span>
          <span class="fam-tag">${x.members.length + (hd ? 1 : 0)} / ${x.cap} seats</span>
          ${x.rival ? `<span class="fam-tag tone-${x.heat >= S.brawlAt ? 'red' : 'dim'}">rival: ${h.esc(x.rival.name)}${x.heat >= S.brawlAt ? ' · a brawl may come' : ''}</span>` : ''}
        </div>
        <div class="sv-disc-y"><span class="up">+${(x.totals.qi * 100).toFixed(2)}% Qi/s</span><span>${x.totals.stonesMin.toFixed(2)} stones/min</span><span>${x.totals.herbsMin.toFixed(2)} herbs/min</span>
          <span class="dim">${x.seats ? `${x.seats} seat${x.seats === 1 ? '' : 's'} to fill` : 'full — the head may still grow'}</span></div>
        <div class="sv-branch-members">${x.members.map(m => `<span class="sv-bm" title="+${(x.ym * 100).toFixed(0)}% share">${h.esc(m.name)}
            <button class="sv-bm-up" data-sa="branch-promote" data-id="${h.esc(m.id)}" title="Bring ${h.esc(m.name)} up into your own hall">${Icon.g('rise')}</button></span>`).join('') || '<span class="dim">No members yet — the head will gather disciples as the years pass.</span>'}</div>
        <div class="sv-branch-foot"><button class="fa-quiet danger" data-sa="branch-dissolve" data-id="${h.esc(x.b.id)}">Dissolve the branch</button></div></div>`
    }).join('')
    const body = cards
      ? tourney + `<div class="sv-branch-grid">${cards}</div>` + (bi.full ? `<div class="fk-note sv-branch-cap">${bi.max} branches is the most a sect can hold. Dissolve one to raise another.</div>` : '')
      : `<div class="fk-note">Tap <b>branch</b> on a disciple: they gather disciples of their own, beyond your Hall's seats.</div>`
    return this._sec('Branches', body, `${bi.count} / ${bi.max}`, 'sv-branches')
  }

  // ── War (both sides) ───────────────────────────────────────────────────────
  _war(s, own) {
    const h = this.h, w = s.sectWar, odds = this.gs.sectWarOdds()
    const on = w.phase === 'scouting' || w.phase === 'preparing'
    const vs = on && odds?.vs?.foe ? odds.vs : null   // 43c: the real sect this war is bound to
    const stars = !on ? '' : vs
      ? `<span class="fam-tag tone-red sv-foe-band" title="Their Might, the same number the battle rolls against">${h.esc(vs.foe.band)} · Might ${h.fmt(vs.them)}</span>`
      : `<span class="sv-tier" title="Enemy strength ${w.enemyTier} of 5">${'★'.repeat(w.enemyTier)}</span>`
    let title, sub, clock
    if (!on) { title = own ? 'Your borders are quiet' : 'The sect is at peace'; sub = own ? 'Rivals test a famous sect more often.' : 'Higher ranks are called to war more often.'; clock = `${own ? 'Next threat' : 'Next call to arms'} in ${this._warClock(w)}` }
    else if (own) { title = `The ${h.esc(w.enemyName)}`; sub = w.phase === 'scouting' ? 'Their scouts are in your hills.' : 'They are preparing to strike.'; clock = `${w.phase === 'scouting' ? 'They strike in' : 'Preparation ends in'} ${this._warClock(w)}` }
    else { title = `The ${h.esc(w.enemyName)}`; sub = w.phase === 'scouting' ? 'Call to Arms: the elders summon every disciple.' : 'Muster: the sect gathers at the mountain gate.'; clock = `Battle in ${this._warClock(w)}` }
    const pc = odds ? Math.round(odds.chance * 100) : 50
    const oddsBtn = odds ? `<button class="fc-aff sv-odds" data-bd="sectwar"><span class="fa-row"><span class="fa-k">${on ? 'Odds of victory' : 'Odds if war came now'}</span>
        <span class="fa-v ${this._oddsClass(odds.chance)}">${this._pct(odds.chance)}</span></span>
        <span class="fam-bar"><i class="tone-${odds.chance < 0.35 ? 'red' : odds.chance < 0.6 ? 'gold' : 'jade'}" data-w="${pc}"></i></span>
        <span class="fa-last">${vs
          ? `Their Might ${h.fmt(vs.them)} against ${own ? 'yours' : 'your sect’s'} ${h.fmt(vs.us)}: they fight at <b class="${vs.ratio > 1 ? 'down' : 'up'}">×${vs.ratio.toFixed(2)}</b> of an even match, rolling ×0.6 to ×1.4 of that. Your strength ×${odds.mult.toFixed(2)}.`
          : `Your strength ×${odds.mult.toFixed(2)}; the rival rolls ×0.6 to ×1.4 when battle is joined.`}${odds.ifAnswered != null ? ` Answering alone: <b class="up">${this._pct(odds.ifAnswered)}</b>.` : ''}</span></button>` : ''
    const status = `<section class="fam-card sect${on ? ' war' : ''}"><div class="fc-head"><span class="fc-glyph${on ? ' war' : ''}" data-icon="flag"></span><div class="fc-id">
        <div class="fc-name">${title} ${stars}</div><div class="fc-sub">${sub}</div>
        <div class="fc-tags"><span class="fam-tag"><b data-icon="age"></b>${clock}</span><span class="fam-tag">wars: ${w.warVictories} won · ${w.warDefeats} lost${w.warsIgnored ? ` · ${w.warsIgnored} ignored` : ''}</span></div></div></div>
      ${oddsBtn}${on ? (own ? this._ownActions(s, w, odds) + this._razeVow() : this._memberActions(s, w)) : ''}
      ${on ? '' : `<div class="fa-grid sv-declare">${this._tile('warpick', own ? 'flag' : 'speech', own ? (this.warPick ? 'Hide the sects' : 'Declare war') : (this.warPick ? 'Hide the sects' : 'Urge war on a sect'), own ? 'choose a sect, see the odds, then march' : 'ask your master to march on a sect you name', '', 'wide' + (this.warPick ? '' : ' key'))}</div>`}
      ${!on && s.derived.sectBuffSuppressed ? '<div class="fk-note sv-warn">The sect lost its last war. Its blessing is withheld for a few hours.</div>' : ''}
      ${!on && own && s.derived.arrayDamaged ? '<div class="fk-note sv-warn">The Defensive Array was damaged in the last defeat. It mends by itself.</div>' : ''}</section>`
    return `<div class="fam-view sect-view">
      <div class="fam-col">${status}${on ? '' : this._warPicker(s, own)}${vs ? this._foeMountain(vs, own, s) : ''}${this._lastWar(s, w, own)}</div>
      <div class="fam-col">${this._sec('Standing orders', `<div class="sv-orders"></div><div class="fk-note sv-orders-note">Carried out the moment a war begins, whether or not the game is open. Anything you do by hand adds to them.</div>`)}
        ${this._stakes(own)}</div></div>`
  }

  // Phase 43f: the vow to raze the foe's mountain if your sect wins — what it brings and what it costs, before you swear it.
  _razeVow() {
    const r = this.gs.razeInfo?.(), h = this.h
    if (!r) return ''
    if (!r.ok) return `<div class="fk-note">${h.esc(r.lock)}</div>`
    const pct = v => Math.round(v * 100) + '%'
    const chip = (t, tone, title = '') => `<span class="sv-gain"${title ? ` title="${title}"` : ''}><span class="${tone}">${t}</span></span>`
    const chips = [chip(`+${h.fmt(r.stones)} stones${r.herbs ? `, +${r.herbs} herbs` : ''}`, 'up'), chip(`${pct(r.manualChance)} a manual`, 'up'),
      chip(`+${r.dread} dread`, 'up', 'While your dread lasts, a weaker sect sent against you may turn back. It fades a little each year.'),
      ...(r.warm ? [chip(`${r.warm} respect${r.warm === 1 ? 's' : ''} it`, 'up')] : []),
      chip(`${r.karma} karma${r.provoked ? ' (they began it)' : ''}`, 'down'),
      ...(r.cool ? [chip(`${r.cool} sect${r.cool === 1 ? '' : 's'} recoil${r.worst?.delta < 0 ? `, the ${h.esc(r.worst.name)} ${r.worst.delta}` : ''}`, 'down', 'A righteous master thinks less of you; a ruthless one respects it. Halved when they began the war.')] : []),
      chip(r.joinable ? 'its survivors always rise again, with a feud' : `${pct(r.remnant)} its survivors rise again for vengeance`, 'down')].join('')
    const sub = r.vow ? (r.byHand ? 'sworn by your hand · tap to lift it' : 'sworn by your standing order · tap to lift it for this war')
      : 'only if you win: lose, and nothing burns'
    return `<div class="fa-grid sv-raze-grid">${this._tile('raze', 'el_fire', r.vow ? `Vowed: the ${h.esc(r.sect)} burns` : `Vow to raze the ${h.esc(r.sect)}`, sub, '', 'wide sv-raze' + (r.vow ? ' vowed' : ''), ` data-on="${r.vow ? 0 : 1}"`)}</div>
      <div class="sv-gains sv-raze-chips">${chips}</div>`
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
    else for (const d of SECTS.filter(d => d.minStage <= s.stageIndex + 3 && d.id !== odds.vs?.foe?.defId).slice(-1))   // every ally costs and gives the same (sect-war.md); never the foe (43c)
      tiles.push(this._tile('ally', 'bond', `Ask the ${h.esc(d.name)}`, `${odds?.ifAllied != null ? `odds → <span class="up">${this._pct(odds.ifAllied)}</span> · ` : ''}${this._cost(ac, s.spiritStones)}`,
        s.spiritStones < ac ? `${h.fmt(ac - Math.floor(s.spiritStones))} stones short` : '', '', ` data-id="${d.id}"`))
    return `<div class="fa-grid sv-acts">${tiles.join('')}</div>`
  }

  // 43c: the sect you are at war with — its Might against yours (the numbers the battle rolls), its halls with their
  // level pips, its master and stance, and what the war will do to its mountain.
  _foeMountain(vs, own, s) {
    const h = this.h, f = vs.foe, top = Math.max(1, vs.them, vs.us), sgn = n => (n > 0 ? '+' : '') + n
    const bar = (label, v, tone) => `<div class="sv-vs-row"><span class="sv-vs-n">${label}</span><span class="fam-bar thin"><i class="tone-${tone}" data-w="${Math.round(v / top * 100)}"></i></span><b>${h.fmt(v)}</b></div>`
    const ours = own ? 'You' : h.esc(this.gs._sectDef?.()?.name || 'Your sect')
    const halls = f.buildings.map(b => `<div class="ws-hall${b.level ? '' : ' none'}"><span>${h.esc(b.name)}</span><span class="ws-pips" title="${b.level ? `Lv.${b.level}` : 'not raised'} · can reach Lv.${f.maxBuildingLevel}">${this._pips(b.level, f.maxBuildingLevel)}</span></div>`).join('')
    const deed = f.deeds?.[0]
    return `<section class="fam-sec sv-foe"><div class="fam-sec-title"><span>Their mountain</span><span class="fam-count">${h.esc(f.band)}</span></div>
      <div class="sv-vs" title="Might: ${WORLD_SECTS.might.perLevel} per hall level + ${WORLD_SECTS.might.perHall} per Sect Hall level + ${WORLD_SECTS.might.perTier} per tier + its disciples">
        ${bar(h.esc(f.name), vs.them, 'red')}${bar(ours, vs.us, 'jade')}</div>
      <div class="ws-lead">Led by <b>${PersonCard.link(f.leaderId, f.leader)}</b>${f.temper ? `, ${h.esc(f.temper)}` : ''} · <span class="fam-tag tone-${f.stanceTone}" title="Their stance toward you (${f.stance} of ±100)">${h.esc(f.stanceLabel)} ${sgn(f.stance)}</span>${deed ? ` <span class="sv-foe-deed">They remember: ${h.esc(deed.text)}</span>` : ''}</div>
      <div class="ws-halls">${halls}<div class="ws-hall hall"><span>Sect Hall</span><span class="ws-hlv">Lv.${f.hallLevel} <i>of ${f.maxHall}</i> · ${h.fmt(f.disciples)} disciples</span></div></div>
      <div class="fk-note">${this.gs.razeInfo?.()?.vow ? '<span class="down">You have vowed it: win, and their whole mountain burns.</span>' : 'Win, and one of their halls burns a level as they flee.'} Lose, and they raise one on your spoils.</div></section>`
  }
  _pips(lv, max) {
    return Array.from({ length: SECT_BUILDING_MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : i < max ? '' : 'cap'}"></i>`).join('')
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
    const fh = r.foeHall   // 43c: what the war did to their mountain, and the odds you went in with
    const rz = r.razed   // 43f: the vow kept
    if (rz) bits.push(`<span class="up">their treasury: +${h.fmt(rz.stones)} stones${rz.herbs ? `, +${rz.herbs} herbs` : ''}</span>`,
      ...(rz.manual ? [`<span class="up">the ${h.esc(ARTS[rz.manual]?.name || 'lost')} manual</span>`] : []), `<span class="down">${rz.karma} karma</span>`,
      ...(rz.cool ? [`<span class="down">${rz.cool} sects recoil</span>`] : []), ...(rz.warm ? [`<span class="up">${rz.warm} respect it</span>`] : []),
      `<span class="dim">${rz.survivors} survivors fled</span>`)
    if (fh?.burned) bits.push(`<span class="up">their ${h.esc(fh.name)} burned${fh.level ? ` to Lv.${fh.level}` : ' to its foundations'}</span>`)
    if (fh?.raised) bits.push(`<span class="down">they raised their ${h.esc(fh.name)} to Lv.${fh.level}</span>`)
    if (r.odds != null) bits.push(`<span class="dim">odds were ${this._pct(r.odds)}</span>`)
    if (r.foeMight) bits.push(`<span class="dim">Might ${h.fmt(r.foeMight)} vs ${h.fmt(r.ourMight)}</span>`)
    return `<section class="fam-sec sv-last ${r.win ? 'win' : 'loss'}${rz ? ' razed' : ''}"><div class="fam-sec-title"><span>Last war · ${rz ? 'razed' : r.win ? 'victory' : 'defeat'}</span></div>
      <div class="sv-last-t">${rz ? `You burned the ${h.esc(r.enemyName)} to the ground.` : r.win ? `You drove off the ${h.esc(r.enemyName)}.` : `You fell to the ${h.esc(r.enemyName)}${r.vowed ? ', and your vow to raze them came to nothing' : ''}.`}</div><div class="sv-gains">${bits.map(b => `<span class="sv-gain">${b}</span>`).join('')}</div></section>`
  }

  _stakes(own) {
    const rows = own
      ? [['Victory', `about ${WAR_SPOILS_STONE_BASE}+ stones and herbs, more with fame; one of their halls burns a level. Vowed to raze: their whole mountain and treasury, for karma and the world's regard`, 'up'], ['Defeat', `lose ${Math.round(WAR_LOSS_RESOURCE_FRAC * 100)}% of your stones; the Defensive Array goes dark ${WAR_ARRAY_DAMAGE_HOURS}h; you may be wounded; they raise a hall on the spoils`, 'down']]
      : [['Victory', 'stones and Contribution if you took part, sometimes a rare prize; one of their halls burns a level', 'up'], ['Defeat', `the sect's blessing is withheld ${MEMBER_WAR_BUFF_SUPPRESS_HOURS}h; members lose some Contribution; they raid your mountain (one of your sect’s halls falls a level, thinning the blessing until it is rebuilt) and raise a hall of their own on the spoils`, 'down'], ['Ignored', 'lose Contribution and karma, even in victory', 'down']]
    return this._sec('What rides on it', rows.map(([k, v, t]) => `<div class="sv-stake"><b class="${t}">${k}</b><span>${v}</span></div>`).join(''), '', 'sv-stakes')
  }

  // ── Phase 43b: the world's sects (docs/systems/npc-sects.md) ───────────────
  // A matter from another sect waits on you: what they want, how they stand toward you, and every choice with its
  // cost, its real odds (the same number the roll uses) and what it does to their stance.
  _worldEvent(s) {
    const ev = this.gs.worldSectEventInfo?.()
    if (!ev) return ''
    const h = this.h, r = ev.sect, sgn = n => (n > 0 ? '+' : '') + n
    const tiles = ev.choices.map(c => {
      const bits = []
      if (c.cost) bits.push(`<span class="cost">${h.fmt(c.cost)} stones</span>`)
      if (c.odds != null) bits.push(`<span class="${this._oddsClass(c.odds)}">${Math.round(c.odds * 100)}% to succeed</span>${c.vsMight ? ` <span class="ws-why">(your Might ${h.fmt(this.gs.playerMight())} vs their ${h.fmt(r.might)})</span>` : c.loyal ? ` <span class="ws-why">(rises with your sect’s regard, now ${sgn(ev.mineStance || 0)})</span>` : ''}`)
      if (c.gain.stones) bits.push(`<span class="up">+${h.fmt(c.gain.stones)} stones</span>`)
      if (c.gain.herbs) bits.push(`<span class="up">+${c.gain.herbs} herbs</span>`)
      if (c.disciples > 0 && s.ownSect?.founded) bits.push('<span class="up">a disciple joins you</span>')
      if (c.disciples < 0) bits.push(`<span class="down">${-c.disciples} disciples leave</span>`)
      if (c.karma) bits.push(`${sgn(c.karma)} karma`)
      if (c.sworn) bits.push('<span class="up">they never march on you</span>')
      if (c.setback) bits.push('<span class="up">they lose a hall</span>')
      if (c.healthNow) bits.push(`<span class="down">Health ${c.healthNow}</span>`)
      if (c.restore) bits.push('<span class="up">the hall rises again</span>')
      if (c.clearGrudge) bits.push('<span class="up">the feud is set down</span>')   // 43f
      if (c.march) bits.push('<span class="down">they march on your mountain</span>')
      if (c.contrib) bits.push(`<span class="${c.contrib > 0 ? 'up' : 'down'}">${sgn(c.contrib)} Contribution</span>`)
      if (c.defect) bits.push(`<span class="up">join as ${h.esc(c.defect.rank)}: blessing ×${c.defect.k.toFixed(2)} (now ×${c.defect.nowK.toFixed(2)})</span>`, `<span class="down">${sgn(SECT_BLESSING.stanceDefected)} with the ${h.esc(ev.mineName)}${c.defect.missions ? `, ${c.defect.missions} mission${c.defect.missions === 1 ? '' : 's'} dropped` : ''}</span>`)
      if (c.mineStance) bits.push(`<span class="${c.mineStance > 0 ? 'up' : 'down'}">${sgn(c.mineStance)} with the ${h.esc(ev.mineName)}</span>`)
      if (c.stance) bits.push(`<span class="${c.stance > 0 ? 'up' : 'down'}">${sgn(c.stance)} with ${ev.mine ? 'your sect' : 'them'}</span>`)
      if (c.odds != null && (c.failStance != null || c.failMineStance != null)) bits.push(`<span class="down ws-fail">if it fails: ${[c.failStance != null ? `${sgn(c.failStance)} with ${ev.mine ? 'your sect' : 'them'}` : '', c.failMineStance != null ? `${sgn(c.failMineStance)} with the ${h.esc(ev.mineName)}` : '', c.health ? `Health ${c.health}` : '', c.failContrib ? `${sgn(c.failContrib)} Contribution` : ''].filter(Boolean).join(', ')}</span>`)
      const fail = bits.filter(x => x.includes('ws-fail')), rest = bits.filter(x => !x.includes('ws-fail'))
      return this._tile('wsev', c.glyph, h.esc(c.label), (rest.join(' · ') + fail.join('')) || 'nothing more', c.lock, 'wide ws-choice', ` data-n="${c.i}"`)
    }).join('')
    return `<section class="fam-card sect ws-event"><div class="fc-head"><span class="fc-glyph" data-icon="${ev.glyph}"></span><div class="fc-id">
        <div class="fc-name">${h.esc(ev.title)}</div>
        <div class="fc-sub ws-ev-text">${h.esc(ev.text)}</div>
        <div class="fc-tags"><span class="fam-tag tone-${r.stanceTone}" title="Their stance toward you (${r.stance} of ±100): it moves with what you do to them.">${h.esc(r.stanceLabel)} ${sgn(r.stance)}</span>
          <span class="fam-tag">${h.esc(r.band)} · Might ${h.fmt(r.might)}</span>${r.temper ? `<span class="fam-tag" title="Their master's temper shades how they take your answer.">${h.esc(r.leader)}, ${h.esc(r.temper)}</span>` : ''}</div></div></div>
      <div class="ws-choices">${tiles}</div>
      <div class="fk-note">It waits on you. Nothing happens until you choose.</div></section>`
  }

  // The ledger: every living sect ranked by Might, yours among them. A row opens the sect's own page (43h, SectDetail);
  // the world's chronicle folds below.
  _ledger(s, full = false) {
    // 43h: every row is one tap to the sect's own page (SectDetail): its halls, master, memory, and what you can do to it.
    // Rows are two lines (name + Might, then stance / ties / blessing). No longer folded shut in Overlay (43b UX debt).
    const info = this.gs.worldSectsInfo?.()
    if (!info?.rows.length) return ''
    const h = this.h, top = Math.max(1, info.rows[0].might), sgn = n => (n > 0 ? '+' : '') + n
    const short = document.body.dataset.layout === 'overlay' || document.body.dataset.narrow === '1'
    const w = s.sectWar || {}, foeId = (w.phase === 'scouting' || w.phase === 'preparing') ? w.enemyId : null
    const row = r => {
      const you = r.own || r.mine
      const tags = [you ? '<span class="fam-tag tone-gold">your sect</span>' : '',
        r.lineage ? `<span class="fam-tag tone-gold" title="Founded by your line${r.founderName ? ` — ${h.esc(r.founderName)}` : ''}. Led now by ${h.esc(r.leader || 'another')}.">your line's sect</span>` : '',
        r.id === foeId ? '<span class="fam-tag tone-red">at war</span>' : '',
        r.sworn ? '<span class="fam-tag tone-jade">sworn ally</span>' : '',
        r.kind === 'splinter' ? `<span class="fam-tag tone-red">${r.origin === 'exiled' ? 'your exile' : 'split from you'}</span>` : '',
        r.grudge ? `<span class="fam-tag tone-red" title="Raised again from the ashes of the ${h.esc(r.ashOf || r.name)}, which you burned. They want vengeance, rebuild fast, and come to war more often.">${Icon('el_fire')} feud</span>` : '',   // 43f
        !r.own ? `<span class="fam-tag tone-${r.stanceTone}" title="Their stance toward you (${r.stance} of ±100): it moves with what you do to them.">${h.esc(r.stanceLabel)} ${sgn(r.stance)}</span>` : '',
        r.blessing != null ? `<span class="fam-tag" title="How much of its written blessing its halls can give its disciples">blessing ×${r.blessing.toFixed(2)}</span>` : ''].join('')
      const tone = you ? 'gold' : r.sworn || r.stance >= 20 ? 'jade' : r.stance <= -20 ? 'red' : 'warm'
      const inner = `<span class="ws-top"><span class="ws-n">${h.esc(r.name)}</span><span class="ws-might" title="Might: ${WORLD_SECTS.might.perLevel} per hall level + ${WORLD_SECTS.might.perHall} per Sect Hall level + ${WORLD_SECTS.might.perTier} per tier + its disciples">${h.esc(r.band)} · <b>${h.fmt(r.might)}</b></span>${r.own ? '' : `<span class="ws-go">${Icon('play')}</span>`}</span>
        <span class="fam-bar thin"><i class="tone-${tone}" data-w="${Math.round(r.might / top * 100)}"></i></span>
        <span class="ws-line">${tags}<span class="ws-sum">${r.levels} hall levels · ${h.fmt(r.disciples)} disciples</span></span>`
      return r.own ? `<div class="ws-row you">${inner}</div>`
        : `<button class="ws-row${you ? ' you' : ''}${r.id === foeId ? ' foe' : ''}" data-sa="wsopen" data-id="${r.id}" title="Open the ${h.esc(r.name)}">${inner}</button>`
    }
    const N = short ? 6 : 10, head = info.rows.slice(0, N), rest = info.rows.slice(N)
    const more = rest.length ? `<details class="ws-more"${this.wsMore ? ' open' : ''}><summary class="fa-quiet" data-sa="wsmore"><span class="lib-fold">${Icon('play')}</span>${rest.length} more sect${rest.length === 1 ? '' : 's'}</summary>${rest.map(row).join('')}</details>` : ''
    // Phase 28 (4.6): the sects' lines live in the one merged feed now (世 World → Chronicle); the ledger shows the latest
    // line and links there, opened on its Sects filter.
    const chron = info.chronicle.length ? `<button type="button" class="ws-chron-link" data-chronicle="sects" title="Open the world's chronicle">
      <span class="ws-chron-ic">${Icon('scroll')}</span><span class="ws-chron-body"><span class="ws-chron-h">The world's chronicle</span>
      <span class="ws-chron-last"><span class="ws-yr">yr ${info.chronicle[0].year}</span> ${h.esc(info.chronicle[0].text)}</span></span><span class="ws-go">${Icon('play')}</span></button>` : ''
    return this._sec('Sects of the world', `<div class="ws-hint">Tap a sect to see it and deal with it${s.ownSect?.founded ? ': gifts, alliances, tribute, spies, trade, war' : s.sect?.id ? ': gifts, a spar, urging your master to war' : ''}.</div>
      ${head.map(row).join('')}${more}${this._ashes(info)}${chron}
      <div class="fk-note ws-foot">Your Might: <b class="gold">${h.fmt(info.playerMight)}</b>.${info.dread > 0 ? ` <span class="ws-dread" title="You have burned sects to the ground. While your dread lasts, a weaker sect sent against you may lose its nerve and turn back. A sect with a feud never does. It fades by ${SECT_RAZE.dread.decay} a year.">${Icon('el_fire')} Dread ${info.dread.toFixed(1)}: a weaker foe turns back ${Math.round(info.dreadSkip * 100)}% of the time.</span>` : ''} Sects raise their halls a step at a time while you play, never while the game is closed. Each remembers what you do to it.</div>`,
      info.rows.length, 'ws-ledger')
  }

  // Phase 43f: the sects you burned, and what became of their ashes (smoking · risen again with a feud · scattered).
  _ashes(info) {
    if (!info.ashes?.length) return ''
    const h = this.h
    const fate = a => a.state === 'reborn' ? `<span class="down">rose again as the ${h.esc(a.reborn || 'remnant')}</span>`
      : a.state === 'scattered' ? '<span class="dim">no one returned; grass grows over the gate</span>'
      : `<span class="warm">${a.survivors} survivors in the hills${a.joinable ? ' (its gate is sealed until they return)' : ''}</span>`
    return `<details class="ws-chron ws-ashes"${this.wsAshes ? ' open' : ''}><summary class="fa-quiet" data-sa="wsashes"><span class="lib-fold">${Icon('play')}</span>Ashes you made <span class="fam-count">${info.ashes.length}</span></summary>
      ${info.ashes.map(a => `<div class="ws-deed"><span class="ws-yr">yr ${a.year}</span><span>The ${h.esc(a.name)} · ${fate(a)}</span></div>`).join('')}</details>`
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
      case 'wsev': { const r = gs.answerWorldSectEvent(n)   // Phase 43b: the outcome line names what happened
        return r.ok ? h.flash(r.text, r.success ? 'positive' : 'negative') : h.flash(r.reason === 'stones' ? 'Not enough Spirit Stones' : r.reason === 'war' ? 'Not while your sect is at war' : 'Not now', 'negative') }
      case 'wsopen': WorldView.show(id); return h.go('world')   // 43h: a sect's page lives in 世 World → Sects
      case 'raze': { const r = gs.setRazeVow(b.dataset.on === '1')   // 43f
        return r.ok ? h.flash(r.vow ? 'Sworn: if they fall, their mountain burns' : 'The vow is lifted', r.vow ? 'negative' : 'neutral') : h.flash('No war to swear on', 'negative') }
      case 'warpick': this.warPick = !this.warPick; return this.render('sect-war', gs.get())
      case 'declare': { const r0 = gs.get().world.sects.list.find(x => x.id === id)
        return h.confirm(`Declare war on the ${r0?.name || 'sect'}?`, 'Your scouts ride out at once; battle comes when the preparing is done.', () => { const r = gs.sectAct(id, 'war'); this.warPick = false
          r.ok ? h.flash(r.text, 'negative') : h.flash(r.lock || 'Not now', 'negative') }, 'Declare war') }
      case 'urgeon': { const r = gs.sectAct(id, 'urge'); if (r.ok && r.success) this.warPick = false; return r.ok ? h.flash(r.text, r.success ? 'positive' : 'negative') : h.flash(r.lock || 'Not now', 'negative') }
      case 'poachopen': this.startPoach(); return this.render('sect-disciples', gs.get())
      case 'poachclose': this.poachView = null; return this.render('sect-disciples', gs.get())
      case 'poachback': this.poachView = { id: null }; return this.render('sect-disciples', gs.get())
      case 'poachsect': this.poachView = { id }; return this.render('sect-disciples', gs.get())
      case 'poach': { const r = gs.poachDisciple(this.poachView?.id, id); return r.ok ? h.flash(r.text, r.success ? 'positive' : 'negative') : h.flash(r.lock || 'Not now', 'negative') }
      case 'wsmore': this.wsMore = !b.closest('details').open; return
      case 'wschron': this.wsChron = !b.closest('details').open; return
      case 'wsashes': this.wsAshes = !b.closest('details').open; return   // 43f
      case 'mchallenge': return h.confirm('Challenge your master?', 'They decide whether it is to the death. Lose a fight to the death and this life ends; lose and live, and you are stripped to Elder.',
        () => { const r = gs.challengeSectMaster(); if (r.fight) h.fight?.(); else h.flash('Not now', 'negative') }, 'Challenge')
      case 'mpetition': { const r = gs.petitionSectMaster()
        return r.ok ? h.flash(r.success ? 'They hand you the seal. The sect is yours.' : 'They refuse you, and remember it.', r.success ? 'special' : 'negative') : h.flash('Not now', 'negative') }
      case 'oldguard': return say(gs.answerOldGuard(id), r => r.branch ? `They stay, as the ${r.branch.name}` : `${r.kept} stay, ${r.gone} go`, { stones: 'Not enough Spirit Stones' })
      case 'fundfold': this.fundOpen = !b.closest('details').open; return
      case 'fund': return say(gs.fundSectHall(id), r => `The ${r.name} rises to Lv.${r.level} · blessing ×${r.after.toFixed(2)}`, { ...stones, rank: 'Only an Elder may fund the Sect Hall', max_level: 'At the height this sect can bear' })
      case 'join': { const r = gs.joinSect(id); return r.ok ? h.flash(`Joined the ${r.sect.name}`, 'special') : h.flash({ stage: 'Realm too low', in_sect: 'Already in a sect', own_sect: 'You lead your own sect', ashes: 'It lies in ashes' }[r.reason] || 'Cannot join', 'negative') }
      case 'lineagejoin': { const r = gs.answerLineageRecruit(true); return r.ok ? h.flash(`You take the oath: the ${r.sect?.name || 'sect'} takes you in as an Outer Disciple`, 'special') : h.flash({ gone: 'The sect is gone', in_sect: 'You already belong to a sect' }[r.reason] || 'Not now', 'negative') }
      case 'lineagedecline': { const r = gs.answerLineageRecruit(false); return r.ok ? h.flash('You send the riders away', 'neutral') : h.flash('Not now', 'negative') }
      case 'found': { const r = gs.foundOwnSect(this.foundName); if (r.ok) this.foundName = ''
        return r.ok ? h.flash('Your sect is founded!', 'special') : h.flash({ stage: 'Realm too low', in_sect: 'Leave your current sect first', stones: 'Not enough Spirit Stones', crystals: 'Not enough Void Crystals' }[r.reason] || 'Cannot found a sect', 'negative') }
      case 'rankup': return say(gs.rankUpSect(), r => `You rise to ${SECT_RANKS[r.rank].name}`, { contribution: 'Not enough Contribution' })
      case 'donate': return say(gs.donateToSect(n), r => `Gave ${n} stones (+${r.gained} Contribution)`, stones)
      case 'leave': return h.confirm('Leave the sect?', `You lose your rank and all Contribution, and pay karma for it${sectWarActive(gs.get()) ? ', more for deserting a war' : ''}. Rejoining starts again as an Outer Disciple.`, () => gs.leaveSect(), 'Leave')
      case 'mission': return h.startMission(id)
      case 'buyart': return say(gs.buySectArt(id), r => `The ${ARTS[id].name} manual is yours (−${r.price} Contribution). Study it in Path → Arts.`, { rank: 'Your rank is too low', contribution: 'Not enough Contribution' })
      case 'givefold': this.giveOpen = !b.closest('details').open; return   // (the fold survives re-renders)
      case 'donate-art': {
        const known = !!gs.get().arts.known[id]
        const go = () => say(gs.donateManualToSect(id), r => `You give the ${ARTS[id].name} manual${r.contribution ? ` (+${r.contribution} Contribution)` : ''}.`, { shelved: 'The library already has it' })
        return known ? go() : h.confirm(`Give away ${ARTS[id].name}?`, 'You have not learned this art yet. Once given, the manual is the sect\'s.', go, 'Give it')
      }
      case 'sectstudy': return say(gs.studyFromSect(id), () => `You take ${ARTS[id].name} down from your library.`, { busy: 'Every study desk is in use', known: 'You know it already', stage: 'Too profound for your realm' })
      case 'auto': { const r = gs.setAutomation('autoSectMissions', b.dataset.on === '1'); return r.ok ? null : h.flash('Cannot change Auto-Missions now', 'negative') }
      case 'autopick': { const r = gs.setAutoSectMission(id, b.dataset.on === '1')
        return r.ok ? null : h.flash({ full: `Keep at most ${SECT_MAX_MISSIONS}: unpick one first`, rank: 'Rank too low' }[r.reason] || 'Cannot pick that mission', 'negative') }
      case 'hall': return say(gs.upgradeSectHall(), r => `The Sect Hall rises to Lv.${r.level}`, { ...stones, max_level: 'The hall is at its full height' })
      case 'build': return say(gs.buildSectBuilding(id), r => `The ${r.building.name} is raised`, { ...stones, items: 'Missing materials' })
      case 'upgrade': return say(gs.upgradeSectBuilding(id), r => `The ${SECT_BUILDINGS.find(b => b.id === id)?.name} deepens to Lv.${r.level}`, { ...stones, not_built: 'Raise it first', max_level: 'Already at its full height' })
      case 'recruit': return say(gs.recruitDisciple(id), r => `${r.disciple.name} joins your sect`, { ...stones, full: 'Every seat is taken', not_found: 'They have gone' })
      case 'reroll': return say(gs.rerollRecruitPool(), () => 'New faces arrive at the gate', stones)
      case 'dismiss': { const d = gs.get().ownSect.disciples.find(x => x.id === id)
        return h.confirm(`Dismiss ${d?.name || 'this disciple'}?`, 'They leave for good, with every level they earned. There is no refund.', () => gs.dismissDisciple(id), 'Dismiss') }
      // Phase 45: branches (分舵) — sub-leaders, loyalty on a wrong, the Tournament of Branches
      case 'branch-appoint': return say(gs.appointBranchHead(id), r => `${r.branch.name} is raised`, { already_head: 'They already lead a branch', not_found: 'They are gone', max_branches: `${SECT_BRANCH.maxBranches} branches at most: dissolve one first` })
      case 'branch-promote': return say(gs.promoteBranchMember(id), () => 'Brought up into your own hall', { full: 'Every hall seat is taken — raise the Sect Hall', not_in_branch: 'They are not in a branch' })
      case 'branch-dissolve': {
        const br = gs.branchInfo()?.branches.find(x => x.b.id === id)
        return h.confirm(`Dissolve the ${br?.b.name || 'branch'}?`, 'The head is stripped of it — a wrong they will remember. If their loyalty is already spent, they leave with their disciples.', () => {
          const r = gs.dismissBranch(id)
          if (r.ok && r.seceded) h.flash('They would not stay. They took their disciples and left.', 'negative')
        }, 'Dissolve')
      }
      case 'bt': return say(gs.holdBranchTournament(id), r => `The ${r.winner.name} takes the day`, { no_branches: 'Raise a second branch first', cooldown: 'Wait before holding another', stones: 'Not enough Spirit Stones' })
      case 'disband': return h.confirm('Disband your sect?', 'Every building and disciple is lost, and it costs 10 karma. This cannot be undone.', () => gs.disbandOwnSect(), 'Disband')
      case 'answer': return say(gs.answerWarCall(), () => 'You answer the call to arms')
      case 'chest': return say(gs.donateWarChest(n), r => `War chest +${r.given} stones (+${r.gained} Contribution)`, { ...stones, full: 'The chest is full' })
      case 'pill': return say(gs.offerWarPill(id), r => `Pill offered (+${r.gained} Contribution)`, { full: 'Enough pills given' })
      case 'beast': return say(gs.sendBeastToWar(id), r => `${r.beast.name} marches to war`, { busy: 'That beast is busy', already: 'A beast is already at the front' })
      case 'reinforce': return say(gs.reinforceForWar(), r => `Defenses reinforced (−${r.cost} stones)`, { ...stones, no_war: 'Only while they prepare' })
      case 'ally': return say(gs.requestWarAlly(id), r => `The ${r.ally.name} will fight beside you`, { ...stones, is_foe: 'They are the ones you fight' })
    }
  }
}
SectView.VIEWS = ['sect', 'sect-missions', 'sect-library', 'sect-halls', 'sect-base', 'sect-disciples', 'sect-war']

function sectWarActive(s) { const w = s.sectWar; return !!w && (w.phase === 'scouting' || w.phase === 'preparing') }
