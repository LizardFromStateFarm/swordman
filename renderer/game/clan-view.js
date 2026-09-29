// ClanView + HallView — Kin → Clan and Kin → Hall (roadmap 1.8b-4, Phase 33). The clan as something you can read at
// a glance and act on: who leads it and how they raise their own, your bond with them, every line and branch, how the
// clan stands with other clans, and each clan action as a tile that says what it does or why it's sealed. The Hall
// (was a pop-over) is now its own view: Merit and what this life will add, clan firsts still open, legacies with
// their next effect, the Family Manual picker, then the family tree and chronicle.
// Shares the Family view's components (fam-card, fa-btn, fam-tag, fam-bar) — styles.css → "Family view" + "Clan view".
// See docs/systems/ui-layout.md → "Clan + Hall views".

// Relation words (UI only; clan.relations −100 feud … +100 allied)
function relationLabel(v) {
  if (v <= -50) return { word: 'Blood feud', tone: 'red' }
  if (v < -15)  return { word: 'Rivals',     tone: 'gold' }
  if (v <= 15)  return { word: 'Wary peace', tone: 'dim' }
  if (v < 50)   return { word: 'Friendly',   tone: 'warm' }
  return               { word: 'Allied',     tone: 'jade' }
}

// Shared bits for both views. h: { esc, fmt, stageLabel, bondLabel, confirm, flash, wire, go }
class KinViewBase {
  constructor(gameState, h, panelId) {
    this.gs = gameState
    this.h = h
    this.el = document.getElementById(panelId)
    this.el.addEventListener('click', e => this._click(e))
  }
  _name(p) { return this.h.esc(Persons.fullName(p)) }
  _clan(s) { const w = s.world; return w.playerClanId ? w.clans[w.playerClanId] : null }
  _clanName(c) { return c?.name ? `The ${this.h.esc(c.name)} Clan` : 'The Nameless Clan' }
  // 'Year 92: text' → a gold year so the chronicle scans as a timeline
  _yearText(t) { const m = /^(Year -?\d+):\s*/.exec(t); return m ? `<b class="yr">${m[1]}</b> ${this.h.esc(t.slice(m[0].length))}` : this.h.esc(t) }
  _plural(n, w) { return `${n} ${w}${n === 1 ? '' : (w.endsWith('ch') ? 'es' : 's')}` }
  _paint() {
    this.el.querySelectorAll('[data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
    this.el.querySelectorAll('[data-l]').forEach(b => { b.style.left = b.dataset.l + '%' })
  }
  // Same tile as the Family view: glyph, name, what it does, or 封 why it's sealed.
  _tile(attrs, glyph, name, effect, lock, cls = '') {
    return `<button class="fa-btn${cls ? ' ' + cls : ''}${lock ? ' locked' : ''}" ${attrs} ${lock ? 'disabled' : ''}>
      <span class="fa-g">${Icon.g(glyph)}</span><span class="fa-t"><span class="fa-n">${name}</span>
      <span class="fa-e">${lock ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${this.h.esc(lock)}</span>` : effect}</span></span></button>`
  }
}

class ClanView extends KinViewBase {
  constructor(gameState, h) { super(gameState, h, 'tab-clan') }

  render(s) {
    const clan = this._clan(s)
    this.el.innerHTML = clan
      ? `<div class="fam-view kin-view"><div class="fam-col">${this._card(s, clan)}${this._actions(s, clan)}</div>
          <div class="fam-col">${this._head(s, clan)}${this._lines(s, clan)}${this._relations()}${this._recent(clan)}</div></div>`
      : this._orphan(s)
    this._paint()
    this.h.wire(this.el)
  }

  _orphan(s) {
    const w = s.world, last = w.lastClanId ? w.clans[w.lastClanId] : null
    return `<div class="fam-view kin-view"><div class="fam-col"><section class="fam-card alone">
      <div class="fc-head"><span class="fc-glyph dim" data-icon="person"></span><div class="fc-id"><div class="fc-name">An orphan of the world</div>
        <div class="fc-sub">You belong to no clan. No head, no lines, no Ancestral Merit to earn.${last ? ` Your forebears' hall still stands: ${this._clanName(last)}.` : ''}</div></div></div>
      ${last ? this._tile('data-ca="hall"', 'lineage', 'Visit the Ancestral Hall', '<span class="dim">the family tree and chronicle</span>', '', 'wide') : ''}
      ${this._tile('id="_pass-mantle"', 'mantle', 'Pass the Mantle', 'ends this life now; your heir carries on', '', 'wide')}
    </section></div></div>`
  }

  _card(s, clan) {
    const h = this.h, w = s.world
    const members = new Set(clan.lines.flatMap(l => l.memberIds)).size
    const branches = clan.lines.length - 1
    const mine = clan.lines.find(l => l.id === w.playerLineId)
    let standing
    if (clan.headId === s.self.id) standing = '<span class="fam-tag tone-jade"><b data-icon="crown"></b>Clan Head</span>'
    else if (mine && mine !== clan.lines[0]) standing = `<span class="fam-tag"><b data-icon="branch"></b>${h.esc(mine.name)}${mine.headId === s.self.id ? ' head' : ''}</span>`
    else standing = '<span class="fam-tag"><b data-icon="lineage"></b>Main Line</span>'
    const pos = s.birth && typeof POSITION_TEXT !== 'undefined' ? POSITION_TEXT[s.birth.position] : null
    const t = clan.tradition || {}
    const bloody = (t.lethalTournaments || 0) > (t.peacefulSuccessions || 0)
    return `<section class="fam-card clan">
      <div class="fc-head"><span class="fc-glyph" data-icon="lineage"></span><div class="fc-id"><div class="fc-name">${this._clanName(clan)}</div>
        <div class="fc-sub">Founded in year ${clan.foundedYear ?? 1}<br><span class="nw">generation ${s.generation || 1}</span> · ${this._plural(members, 'member')} · ${branches ? this._plural(branches, 'branch') : 'no branches'}</div>
        <div class="fc-tags">${standing}${pos ? `<span class="fam-tag">${h.esc(pos.short)}</span>` : ''}</div></div></div>
      <div class="clan-trad"><span class="ct-k">Tradition</span>
        <span class="ct-v">${bloody ? '<b class="tone-red" data-icon="health"></b>Blood decides succession' : '<b class="tone-jade" data-icon="lotus"></b>Succession is settled in peace'}</span>
        <span class="ct-n">Past successions: ${t.lethalTournaments || 0} to the death · ${t.peacefulSuccessions || 0} peaceful · ${t.challenges || 0} challenges</span></div>
      ${this._tile('data-ca="hall"', 'lineage', 'Ancestral Hall', `<span class="cost">${h.fmt(clan.merit)} Merit to spend</span> · legacies, firsts, ancestors`, '', 'wide')}
    </section>`
  }

  _head(s, clan) {
    const h = this.h, gs = this.gs
    if (!clan.headId || clan.headId === s.self.id) return ''
    const head = gs.person(clan.headId)
    if (!head) return ''
    const st = head.parentingStyle ? PARENTING_STYLES[head.parentingStyle] : null
    const known = s.birth?.headBond != null && s.birth.headId === head.id
    const bond = known ? Math.round(s.birth.headBond) : null
    const bl = known ? h.bondLabel(bond) : null
    return `<section class="fam-card">
      <div class="fc-head"><span class="fc-glyph" data-icon="crown"></span><div class="fc-id"><div class="fc-name">${this._name(head)}</div>
        <div class="fc-sub">Clan Head · ${h.stageLabel(head.stageIndex)}</div>
        <div class="fc-tags">${st ? `<span class="fam-tag" title="${h.esc(st.blurb)}"><b data-icon="child"></b>${h.esc(st.name)} parent</span>` : ''}</div></div></div>
      ${st ? `<div class="fc-hint">${h.esc(st.blurb)}</div>` : ''}
      ${known ? `<div class="fc-aff static">
        <span class="fa-row"><span class="fa-k">Your bond</span><span class="fa-v tone-${bl.tone}">${bl.word} · ${bond}</span></span>
        <span class="fam-bar"><i class="tone-${bl.tone}" data-w="${bond}"></i></span>
        <span class="fa-last">How the head feels about you. It weighs on whether a challenge is to the death.</span></div>` : ''}
    </section>`
  }

  _actions(s, clan) {
    const gs = this.gs, h = this.h, w = s.world
    const tiles = []
    const mine = clan.lines.find(l => l.id === w.playerLineId)
    if (clan.headId !== s.self.id) {
      const cc = gs.canChallengeHead()
      const lock = cc.ok ? '' : cc.reason === 'cooldown' ? `Recovering · again in year ${Math.ceil(cc.readyYear)}`
        : cc.reason === 'stage_gap' ? `Come within ${CHALLENGE_STAGE_GAP} stages of the head` : cc.reason === 'busy' ? 'Another fight is underway' : 'Not now'
      // Where you stand before you act: your bond weighs on whether the head makes it lethal
      const hb = s.birth?.headBond != null && s.birth.headId === clan.headId ? h.bondLabel(Math.round(s.birth.headBond)) : null
      // A6-3a: the odds of the fight itself, inline (tap → the personfight "why" card), and any feud the head holds
      const head = gs.person(clan.headId), ho = head && gs.personFightOdds(head, 'challenge')
      const hoc = ho ? (ho.chance < 0.2 ? 'odds-low' : ho.chance < 0.55 ? 'odds-mid' : 'odds-good') : ''
      const hodds = ho ? `<span class="odds-in ${hoc}" data-bd="personfight:${head.id}:challenge" title="Why these odds?"><b>${Math.round(ho.chance * 100)}%</b> to win <i data-icon="why"></i></span>` : ''
      const hfeud = head?.feud ? ` · <span class="${head.feud === 'debt' ? 'up' : 'down'}">${FEUD_TEXT[head.feud]}</span>` : ''
      if (cc.ok || ['cooldown', 'stage_gap', 'busy'].includes(cc.reason))
        tiles.push(this._tile('id="_challenge-head"', 'sword', 'Challenge the Head',
          `${hodds}${hodds ? '<br>' : ''}${hb ? `<span class="tone-${hb.tone}">bond ${hb.word.toLowerCase()}</span> · ` : ''}the head decides if it is <span class="down">to the death</span>${hfeud}`, lock))
    }
    if (mine && mine !== clan.lines[0]) {
      const prev = gs.branchWarPreview()
      const oc = prev ? (prev.chance < 0.2 ? 'odds-low' : prev.chance < 0.55 ? 'odds-mid' : 'odds-good') : ''
      // One tile, one action: the odds sit inline; tapping them (data-bd) opens the "why" card instead of acting
      // (BreakdownUI handles [data-bd] clicks in the capture phase and stops them there).
      const odds = prev ? `<span class="odds-in ${oc}" data-bd="branch" title="Why these odds?"><b>${prev.chance < 0.001 ? '&lt;0.1' : (prev.chance * 100).toFixed(1)}%</b> to win <i data-icon="why"></i></span>` : ''
      if (mine.headId === s.self.id) {
        const dw = gs.canDeclareBranchWar()
        const lock = dw.ok ? '' : dw.reason === 'cooldown' ? `Your branch recovers · year ${Math.ceil(dw.readyYear)}` : dw.reason === 'busy' ? 'A contest is already underway' : 'Not now'
        tiles.push(this._tile('id="_declare-branch-war"', 'flag', 'War on the Main Line', `${odds}${odds ? '<br>' : ''}the loser is deposed, or <span class="down">dies</span>`, lock, 'grave'))
        const sec = gs.canSecede()
        tiles.push(this._tile('id="_secede"', 'split', 'Secede', 'leave with your whole branch; how you part decides whether the old clan becomes friend or rival', sec.ok ? '' : sec.reason === 'busy' ? 'Not while a contest is underway' : 'Not now'))
      } else {
        const pw = gs.canPushBranchWar()
        const lock = pw.ok ? '' : pw.reason === 'cooldown' ? `Too soon · year ${Math.ceil(pw.readyYear)}` : pw.reason === 'busy' ? 'A contest is already underway' : 'Not now'
        tiles.push(this._tile('id="_push-branch-war"', 'flag', 'Push your branch to war', `${odds}${odds ? '<br>' : ''}your branch head decides`, lock))
      }
    }
    tiles.push(this._tile('id="_pass-mantle"', 'mantle', 'Pass the Mantle', 'ends this life now; your heir carries on · <span class="down">no undoing it</span>', '', 'grave'))
    return `<section class="fam-sec"><div class="fam-sec-title"><span>What you can do</span></div><div class="fa-grid clan-acts">${tiles.join('')}</div></section>`
  }

  _lines(s, clan) {
    const h = this.h, gs = this.gs, w = s.world, yr = Math.floor(w.year)
    const alive = id => { if (id === s.self.id) return true; const p = w.persons[id]; return p && p.alive !== false && !p.estranged }
    const rows = clan.lines.map((l, i) => {
      const head = l.headId ? (l.headId === s.self.id ? null : gs.person(l.headId)) : null
      const count = l.memberIds.filter(alive).length
      const yours = l.id === w.playerLineId
      const last = i === clan.lines.length - 1
      return `<div class="line-row${yours ? ' yours' : ''}${i ? ' branch' : ' root'}">
        <span class="lr-tree">${i === 0 ? '◆' : last ? '└' : '├'}</span>
        <span class="lr-main"><span class="lr-n">${h.esc(l.name)}${yours ? ' <span class="lr-you">you</span>' : ''}</span>
          <span class="lr-s">${l.headId === s.self.id ? 'led by you' : head ? `led by ${this._name(head)}` : 'no head'} · ${this._plural(count, 'member')}</span></span></div>`
    }).join('')
    const prev = gs.branchWarPreview()
    return `<section class="fam-sec"><div class="fam-sec-title"><span>Lines &amp; branches</span><span class="fam-count">${clan.lines.length}</span></div>
      <div class="line-tree">${rows}</div>
      ${prev ? `<button class="fc-aff" data-bd="branch"><span class="fa-row stack"><span class="fa-k">Your branch vs the main line</span><span class="fa-v">${h.fmt(prev.ours)} : ${h.fmt(prev.main)}</span></span>
        <span class="fam-bar"><i class="tone-${prev.ours >= prev.main ? 'jade' : 'gold'}" data-w="${Math.round(100 * prev.ours / Math.max(1, prev.ours + prev.main))}"></i><em data-l="50"></em></span>
        <span class="fa-last">Strength of every grown fighter in each line.</span></button>` : ''}
      ${clan.lines.length === 1 ? '<div class="fk-note">Branches split off when a Tournament of Heirs leaves more than one survivor.</div>' : ''}
    </section>`
  }

  _relations() {
    const rel = this.gs.clanRelations()
    if (!rel.length) return ''
    return `<section class="fam-sec"><div class="fam-sec-title"><span>Other clans</span><span class="fam-count">${rel.length}</span></div>
      ${rel.map(r => {
        const l = relationLabel(r.value), v = Math.max(-100, Math.min(100, r.value))
        return `<div class="rel-row"><span class="rel-n">${this._clanName(r.clan)}</span><span class="rel-w tone-${l.tone}">${l.word}</span>
          <span class="rel-bar"><i class="tone-${l.tone}" data-l="${v < 0 ? 50 + v / 2 : 50}" data-w="${Math.abs(v) / 2}"></i><em></em></span></div>`
      }).join('')}
      <div class="fk-note">Feuds come from a rival rebirth or a bitter secession; a warm parting leaves friends.</div></section>`
  }

  _recent(clan) {
    const hist = [...(clan.history || [])].slice(-3).reverse()
    if (!hist.length) return ''
    return `<section class="fam-sec"><div class="fam-sec-title"><span>Lately in the clan</span></div>
      ${hist.map(x => `<div class="chron-line">${this._yearText(x.text)}</div>`).join('')}
      <button class="fa-quiet" data-ca="hall">The whole chronicle, in the Hall</button></section>`
  }

  _click(e) {
    const b = e.target.closest('[data-ca]')
    if (!b || b.disabled) return
    if (b.dataset.ca === 'hall') this.h.go('hall')
  }
}

class HallView extends KinViewBase {
  constructor(gameState, h) { super(gameState, h, 'tab-hall') }

  render(s) {
    const w = s.world
    const clan = this._clan(s) || (w.lastClanId ? w.clans[w.lastClanId] : null)
    if (!clan) {
      this.el.innerHTML = `<div class="fam-view kin-view"><div class="fam-col"><section class="fam-card alone">
        <div class="fc-head"><span class="fc-glyph dim" data-icon="lineage"></span><div class="fc-id"><div class="fc-name">No hall stands for you</div>
        <div class="fc-sub">An orphan has no ancestors to honor, and no clan to leave anything to.</div></div></div></section>${this._soul()}</div></div>`
      return
    }
    const own = clan === this._clan(s)
    this.el.innerHTML = `<div class="fam-view kin-view">
      <div class="fam-col">${this._records(s, clan)}${this._soul()}${own ? this._thisLife(s) + this._firsts(clan) : ''}${this._tree(s, clan)}${this._chronicle(clan)}</div>
      <div class="fam-col">${own ? this._legacies(clan) : ''}</div></div>`
    this._paint()
  }

  _records(s, clan) {
    const h = this.h
    return `<section class="fam-card hall">
      <div class="fc-head"><span class="fc-glyph" data-icon="lineage"></span><div class="fc-id"><div class="fc-name">${this._clanName(clan)}</div>
        <div class="fc-sub">The Ancestral Hall · <span class="nw">generation ${s.generation || 1}</span></div></div></div>
      <div class="hall-tiles">
        <div class="ht wide hero"><span class="ht-k">Ancestral Merit to spend</span><span class="ht-v gold">${h.fmt(clan.merit)}</span></div>
        <div class="ht minor"><span class="ht-k">Lifetime Merit</span><span class="ht-v">${h.fmt(clan.meritEarned)}</span></div>
        <div class="ht minor"><span class="ht-k">Furthest realm</span><span class="ht-v">${h.esc(stageShortName(clan.bestStageIndex))}</span></div>
        ${clan.ascendedAncestors ? `<div class="ht wide"><span class="ht-k">Ascended Ancestors</span><span class="ht-v jade">${clan.ascendedAncestors} · +${Math.round(Math.min(ANCESTOR_BLESSING_QPS_MAX, clan.ascendedAncestors) * ANCESTOR_BLESSING_QPS * 100)}% Qi for every heir</span></div>` : ''}
      </div></section>`
  }

  // Phase 40: the cross-save Soul (soul-points.md). Its door in the Hall; the screen itself is SoulView (an overlay).
  _soul() {
    const i = this.gs.soulInfo(), h = this.h
    const pct = Math.round(i.perRank * i.resonance * 100)
    const eff = i.earned
      ? `<span class="cost">${h.fmt(i.points)} Soul Points</span> · <span class="nw">Resonance +${pct}% Qi</span>${i.canSpend ? ' · <span class="soul-rdy">a rank is ready</span>' : ''}`
      : 'Shared by every save slot. Fall at the Ascension Trial and the soul keeps an ember.'
    return `<button class="fa-btn wide soul-door${i.earned && !i.seen ? ' fresh' : ''}" data-ca="soul">
      <span class="fa-g">${Icon.g('soul')}</span><span class="fa-t"><span class="fa-n">The Soul Remembers</span><span class="fa-e">${eff}</span></span></button>`
  }

  // What this life adds to the ledger when it ends (the real formula, via meritPreview()).
  _thisLife(s) {
    const m = this.gs.meritPreview(), h = this.h
    const row = (k, v, cls = '') => `<div class="mp-row ${cls}"><span>${cls.includes('first') ? '<i class="mp-ic" data-icon="check"></i>' : ''}${k}</span><b>+${Math.round(v)}</b></div>`
    return `<section class="fam-sec"><div class="fam-sec-title"><span>This life will add</span><span class="fam-count gold">+${m.total} Merit</span></div>
      ${row(`Realm reached <span class="nw">${h.esc(stageShortName(Math.max(s.maxStageThisLife || 0, s.stageIndex)))}</span>`, m.stage)}
      ${m.firsts.map(f => row(h.esc(f.label), f.merit, 'first')).join('')}
      ${row(`Deeds: wars, beasts, disciples${m.deedsRaw > m.cap ? ` (capped at ${m.cap})` : ` (up to ${m.cap})`}`, m.deeds, m.deeds ? '' : 'dim')}
      <div class="fk-note">Credited to the clan when this life ends, however it ends.</div></section>`
  }

  _firsts(clan) {
    const h = this.h
    const all = Object.entries(CLAN_FIRSTS)
    const open = all.filter(([id]) => !clan.firsts[id]), done = all.length - open.length
    return `<section class="fam-sec"><div class="fam-sec-title"><span>Clan firsts</span><span class="fam-count">${done} of ${all.length} claimed</span></div>
      <div class="firsts">${all.map(([id, f]) => {
        const got = clan.firsts[id]
        return `<div class="fr${got ? ' got' : ''}"><span class="fr-g">${Icon(got ? 'check' : 'ring')}</span><span class="fr-l">${h.esc(this._firstLabel(f.label))}</span>
          <span class="fr-m">${got ? `gen ${got.gen}` : `+${f.merit}`}</span></div>`
      }).join('')}</div>
      <div class="fk-note">Each pays Merit once, to whoever in the clan does it first.</div></section>`
  }

  // 'First to reach Nascent Soul' → 'Reach Nascent Soul', 'First war won' → 'War won'
  _firstLabel(l) { const t = l.replace(/^First (to )?/, ''); return t.charAt(0).toUpperCase() + t.slice(1) }

  _legacyValue(id, v) {
    switch (id) {
      case 'ancestral_stipend': return `${v} spirit stones`
      case 'heirloom':          return `${v} equipped item${v === 1 ? '' : 's'} carried over`
      case 'family_manual':     return v >= 99 ? 'any technique' : `techniques up to ${stageShortName(v)}`
      case 'beast_lineage':     return 'one beast offspring'
      case 'refined_meridians': return `+${Math.round(v * 100)}% Qi, every life`
      default:                  return String(v)
    }
  }

  _legacies(clan) {
    const h = this.h
    const cards = Object.entries(CLAN_LEGACIES).map(([id, def]) => {
      const lvl = clan.legacies[id] || 0, n = def.levels.length, maxed = lvl >= n
      const locked = def.requires && !clan.firsts[def.requires]
      const cost = maxed ? 0 : def.levels[lvl].cost
      const pips = Array.from({ length: n }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')
      const now = lvl ? this._legacyValue(id, def.levels[lvl - 1].value) : 'not yet bought'
      const next = maxed ? '' : this._legacyValue(id, def.levels[lvl].value)
      let buy
      if (maxed) buy = '<span class="lg-max">Complete</span>'
      else if (locked) buy = `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>Needs the clan first: ${h.esc(this._firstLabel(CLAN_FIRSTS[def.requires]?.label || 'a deed'))}</span>`
      else if (clan.merit < cost) buy = `<span class="lg-short"><span class="lg-prog"><i data-w="${Math.round(100 * clan.merit / cost)}"></i></span>${cost} Merit · ${cost - clan.merit} short</span>`
      else buy = `<button class="lg-buy" data-buy="${h.esc(id)}">${lvl ? 'Raise' : 'Buy'}<span>${cost} Merit</span></button>`
      return `<div class="lg${lvl ? ' owned' : ''}${locked ? ' sealed' : ''}">
        <div class="lg-top"><span class="lg-n">${h.esc(def.name)}</span><span class="court-pips lg-pips" title="Level ${lvl} of ${n}">${pips}</span></div>
        <div class="lg-d">${h.esc(def.desc)}</div>
        <div class="lg-bot"><span class="lg-now">Now: <b>${h.esc(now)}</b>${next ? `<br>Next: ${h.esc(next)}` : ''}</span>${buy}</div>
        ${id === 'family_manual' && lvl ? this._manual() : ''}</div>`
    }).join('')
    return `<section class="fam-sec"><div class="fam-sec-title"><span>Clan legacies</span><span class="fam-count gold">${h.fmt(clan.merit)} Merit</span></div>
      <div class="lg-list">${cards}</div></section>`
  }

  // The Family Manual picker (UX debt since 2.7): which known technique every heir learns for free.
  _manual() {
    const m = this.gs.familyManualOptions(), h = this.h
    if (!m) return ''
    if (!m.options.length) return '<div class="fk-note">The clan has learned no techniques yet. Learn one and it can be handed down.</div>'
    const open = m.options.filter(o => o.allowed), later = m.options.length - open.length
    return `<div class="manual"><div class="manual-k">Handed down to every heir:</div>
      ${open.map(o => `<button class="manual-o${o.id === m.current ? ' on' : ''}" data-manual="${h.esc(o.id)}">
        <span>${h.esc(o.name)}</span><span class="mo-s">${o.id === m.current ? 'chosen · ' : ''}learnable from ${stageShortName(o.minStage)}</span></button>`).join('')}
      ${later ? `<div class="manual-more">${later} more the clan knows ${later === 1 ? 'needs' : 'need'} a higher level of this legacy</div>` : ''}</div>`
  }

  _tree(s, clan) {
    const h = this.h, w = s.world
    const lives = w.pastLives.filter(l => l.clanId === clan.id).slice().reverse()
    const lines = lives.map(l => {
      const p = w.persons[l.personId]
      const line = h.epitaphFor(l.cause, l.personId)
      const text = line ? h.fillEpitaph(line, p, l, clan.name) : `${p ? Persons.fullName(p) : 'Someone'}, gone from this world.`
      return `<div class="chron-line${p?.ascendedAncestor ? ' ascended' : ''}">${p?.ascendedAncestor ? '<b class="kid-star" data-icon="cloud"></b>' : ''}${h.esc(text)}</div>`
    }).join('')
    return `<details class="fam-sec hall-fold" open><summary class="fam-sec-title"><span>Ancestors</span><span class="fam-count">${this._plural(lives.length, 'life').replace('lifes', 'lives')}</span></summary>
      ${lines || '<div class="fam-empty">No one has come before you yet.</div>'}</details>`
  }

  _chronicle(clan) {
    const hist = [...(clan.history || [])].reverse()
    return `<details class="fam-sec hall-fold"${hist.length <= 6 ? ' open' : ''}><summary class="fam-sec-title"><span>Chronicle</span><span class="fam-count">${hist.length}</span></summary>
      ${hist.map(x => `<div class="chron-line">${this._yearText(x.text)}</div>`).join('') || '<div class="fam-empty">Nothing is written yet.</div>'}</details>`
  }

  _click(e) {
    const buy = e.target.closest('[data-buy]'), man = e.target.closest('[data-manual]')
    if (e.target.closest('[data-ca="soul"]')) return this.h.openSoul()
    if (buy && !buy.disabled) {
      const r = this.gs.buyLegacy(buy.dataset.buy)
      if (r.ok) this.h.flash(`${CLAN_LEGACIES[buy.dataset.buy].name} rises to level ${r.level}.`, 'special')
    } else if (man && !man.disabled) {
      this.gs.setFamilyManual(man.dataset.manual)
    }
  }
}
