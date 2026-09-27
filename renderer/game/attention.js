// Attention — the "needs you" layer (roadmap 1.8b-1, Phase 33). collectAttention() is DOM-free: it turns the save
// into a ranked list of things waiting on the player (a pending decision, an opportunity, an idle slot), each with
// the reason it's there and where it leads. AttentionUI draws that list as the strip under the HUD (Overlay), a
// card column (Expanded/Desktop) or a one-line summary (Banner), and NavUI turns the same list into tab badges.
// See docs/systems/ui-layout.md → "Navigation + attention".

// tier: 'urgent' = a decision is waiting on you · 'ready' = something you can act on now · 'idle' = a quiet nudge
const ATTENTION_TIER_ORDER = { urgent: 0, ready: 1, idle: 2 }

// item: { id, tier, glyph, title, why, view, open?, left? }  view = the NAV view it lives in; open = a popup to
// show; left = seconds on a countdown (war arrival)
function collectAttention(s, gs) {
  if (!s) return []
  const out = []
  const add = (tier, id, glyph, title, why, view, open, left) => out.push({ tier, id, glyph, title, why, view, open, left })
  const f = s.family || {}
  const name = p => (p ? (typeof Persons !== 'undefined' ? Persons.fullName(p) : p.given) : 'Someone')

  // ── Decisions (a popup is waiting; it never expires) ──
  if (f.proposal) add('urgent', 'proposal', 'bond', 'A matchmaker awaits', 'Offers of marriage have arrived. Accept one or send them away.', 'family', 'proposal')
  if (f.spouse && f.duel && !f.fight) add('urgent', 'duel', 'duel', `${f.spouse.given} demands a duel`, 'Your spouse will not let the affair pass. Answer them.', 'family', 'family')
  else if (f.headChallenge) {
    const ch = gs.person?.(f.headChallenge.challengerId)
    add('urgent', 'head-challenge', 'sword', `${ch?.given || 'A rival'} challenges your seat`, 'As clan head, you decide whether this fight is to the death.', 'clan', 'family')
  } else if (f.stepDownOffer) add('urgent', 'step-down', 'mantle', 'The clan head steps down', 'Enter the contest for the seat, or stand aside.', 'clan', 'family')
  else if (f.spouse && f.event) add('urgent', 'marriage-event', 'couple', `${f.spouse.given} needs you`, 'A matter in your marriage waits on your answer.', 'family', 'family')
  else if (f.childEvent) {
    const c = (f.children || []).find(k => k.id === f.childEvent.childId)
    add('urgent', 'child-event', 'child', `${c?.given || 'Your child'} needs a parent`, 'A choice about raising them waits on you.', 'family', 'family')
  } else if (s.upbringing?.event) add('urgent', 'upbringing', 'child', 'A matter from your youth', 'How you answer shapes your bond with the clan head.', 'family', 'family')
  // 1.8b-3b: a fight you're in (never resolves without you), and a lover's ultimatum
  if (f.fight) {
    const opp = f.fight.kind === 'duel' ? f.spouse : gs.person?.(f.fight.oppId)
    add('urgent', 'fight', 'duel', `Your fight with ${opp?.given || 'your rival'}`, `${f.fight.you}–${f.fight.them}, first to ${typeof FIGHT_TO !== 'undefined' ? FIGHT_TO : 2}. Choose your next move.`, f.fight.kind === 'duel' ? 'family' : 'clan', 'family')
  }
  const ult = (f.lovers || []).find(l => l.ultimatum)
  if (ult) add('urgent', 'ultimatum', 'alert', `${ult.person.given} wants an answer`, f.spouse ? 'Leave your spouse, let them go, or one more season.' : 'Marry them, let them go, or one more season.', 'family')
  // 1.8b-3a: a partner's wish for a child (the 'ask' plan) is a decision; it waits until you answer
  if (f.childWish) {
    const p = f.spouse?.id === f.childWish.partnerId ? f.spouse : (f.lovers || []).find(l => l.person.id === f.childWish.partnerId)?.person
    if (p) add('urgent', 'child-wish', 'lantern', `${p.given} wishes for a child`, 'Yes, or not now. Nothing happens until you choose.', 'family')
  }
  if (f.tournament) add('urgent', 'tournament', 'duel', 'The Tournament of Heirs waits', 'You pick every pairing. It will not continue without you.', 'family', 'tournament')

  // ── Sect wars ──
  const w = s.sectWar
  if (w && (w.phase === 'scouting' || w.phase === 'preparing')) {
    const left = Math.max(0, Math.ceil(((w.phase === 'preparing' ? w.prepEndsAt : w.scoutEndsAt) - Date.now()) / 1000))
    if (w.side === 'member' && s.sect?.id && !w.answered)
      add('urgent', 'war-call', 'flag', `War call: ${w.enemyName}`, 'Your sect calls every disciple to arms. Answer, or lose standing.', 'sect-war', null, left)
    else if (w.side === 'own' && s.ownSect?.founded)
      add('urgent', 'own-war', 'flag', `${w.enemyName} marches on you`, w.phase === 'preparing' ? 'Reinforce or call an ally before they arrive.' : 'Their scouts are in your hills. Prepare.', 'sect-war', null, left)
  }

  // ── Opportunities ──
  const road = f.encounters || []
  if (road.length) add('ready', 'road', 'explore', road.length === 1 ? `${road[0].person?.given || 'A stranger'}, met on the road` : `${road.length} strangers on the road`, 'Seduce or leave them. They wait until you choose.', 'explore')
  const wild = s.beastEncounters || []
  if (wild.length) {
    const t = typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES.find(b => b.id === wild[0].typeId) : null
    add('ready', 'beasts', 'beast', wild.length === 1 ? `A wild ${t?.name || 'beast'} lingers` : `${wild.length} wild beasts linger`, (s.inventory?.beast_taming_talisman || 0) > 0 ? 'You carry a Taming Talisman.' : 'Taming needs a Beast Taming Talisman.', 'beasts')
  }
  // 1.8b-3a courtship: candidates to choose from, a meeting waiting on your answer, or one you can arrange
  const court = f.court
  if (court && !court.target && (court.candidates || []).length) add('ready', 'court', 'bond', 'The go-between waits', `${court.candidates.length} candidates. Choose whom to court.`, 'family')
  else if (court?.beat) add('ready', 'court', 'bond', `${court.target.given} is waiting`, 'A meeting is underway. Answer them.', 'family')
  else if (court?.target && gs.canMeet?.().ok) add('ready', 'court', 'bond', `You could call on ${court.target.given}`, gs.canPropose?.().ok ? 'Or ask for their hand.' : 'Arrange another meeting.', 'family')
  // 1.8b-4 clan: a challenge you can now make; Merit enough for a legacy
  const cc = gs.canChallengeHead?.()
  if (cc?.ok) add('ready', 'challenge', 'sword', 'You could challenge the head', 'You are strong enough to contest the seat. The head decides if it is to the death.', 'clan')
  const clan = gs._playerClan?.()
  if (clan && typeof CLAN_LEGACIES !== 'undefined' && Object.entries(CLAN_LEGACIES).some(([id, d]) => {
    const lvl = clan.legacies?.[id] || 0
    return lvl < d.levels.length && !(d.requires && !clan.firsts?.[d.requires]) && clan.merit >= d.levels[lvl].cost
  })) add('idle', 'merit', 'lineage', 'Ancestral Merit to spend', `${Math.floor(clan.merit)} Merit. A legacy for every heir after you.`, 'hall')
  if (gs.isClanHead?.() && !f.heirId && !f.tournament && (gs.eligibleHeirs?.() || []).length)
    add('ready', 'heir', 'heir', 'No heir is named', 'If your path ends today, the clan chooses without you.', 'family')

  // ── Idle slots (quiet nudges; hidden while the matching automation is running) ──
  const autoOn = key => s.playMode === 'idle' && s.automation?.[key] && gs.automationUnlocked?.(key)
  if (!s.expedition?.active && !autoOn('autoExplore')) add('idle', 'expedition', 'explore', 'No expedition underway', 'Send one out: loot, stones and beast sightings.', 'explore')
  if (s.sect?.id && !autoOn('autoSectMissions') && typeof SECT_MAX_MISSIONS !== 'undefined' && (s.sect.activeMissions || []).length < SECT_MAX_MISSIONS)
    add('idle', 'missions', 'token', 'A mission slot is open', `${(s.sect.activeMissions || []).length} of ${SECT_MAX_MISSIONS} missions underway.`, 'sect-missions')
  // 1.8b-5: your own sect — a seat you could fill now, a hall you could raise now
  const os = s.ownSect?.founded && gs.ownSectInfo?.()
  if (os) {
    const cand = os.candidates.filter(c => c.ok).sort((a, b) => b.c.talent - a.c.talent)[0]
    if (cand) add('idle', 'recruit', 'disciple', 'A disciple seat is open', `${cand.c.name} (${cand.c.talent} star${cand.c.talent === 1 ? '' : 's'}) would join for ${cand.cost} stones.`, 'sect-disciples')
    const bld = os.buildings.find(x => x.ok)
    if (bld) add('idle', 'build', 'hall', `You could raise the ${bld.b.name}`, `${bld.b.desc} Costs ${bld.b.stones} stones.`, 'sect-halls')
  }
  // 1.8b-3a: a spouse cooling toward you, when something can be done about it now
  if (f.spouse && f.affection < 50 && (gs.spouseActionPreview?.('time').ok || gs.spouseActionPreview?.('gift').ok))
    add('idle', 'spouse-cool', 'frost', `${f.spouse.given} is growing distant`, `Affection ${Math.round(f.affection)}. Time together or a gift would help.`, 'family')
  if (typeof TECHNIQUES !== 'undefined') {
    const t = TECHNIQUES.find(t => !s.techniques.includes(t.id) && s.stageIndex >= t.minStage && (s.spiritStones >= t.cost || t.id === s.inheritedManual))
    if (t) add('idle', 'technique', 'scroll', `You can learn ${t.name}`, t.id === s.inheritedManual ? 'Your Family Manual: free to learn.' : `Costs ${t.cost} stones; you have ${Math.floor(s.spiritStones)}.`, 'techniques')
  }

  return out.sort((a, b) => ATTENTION_TIER_ORDER[a.tier] - ATTENTION_TIER_ORDER[b.tier])
}

const attClock = sec => sec >= 60 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s` : `${sec}s`

// DOM side: renders the list into #attention. onPick(item) is game.js's handler (navigate and/or open a popup).
class AttentionUI {
  constructor(onPick) {
    this.onPick = onPick
    this.el = document.getElementById('attention')
    this.open = false   // Overlay: the "+N more" list is unfolded
    this._sig = ''
    this.items = []
    this.el.addEventListener('click', e => {
      const more = e.target.closest('[data-att-more]')
      if (e.target.closest('[data-att-fold]')) { this.open = false; this._sig = ''; this.render(this.items); return }
      if (more && document.body.dataset.layout === 'banner') { this.open = true; this._sig = ''; this.onBannerMore?.(); return }   // a 56px strip can't unfold: open the full window
      if (more) { this.open = !this.open; this._sig = ''; this.render(this.items); return }
      const row = e.target.closest('[data-att]')
      if (!row) return
      const item = this.items.find(i => i.id === row.dataset.att)
      if (item) { this.open = false; this._sig = ''; this.onPick(item) }
    })
    // An unfolded list folds again on any click outside it
    document.addEventListener('click', e => {
      // (isConnected: a re-render detaches the +N button that was just clicked)
      if (this.open && e.target.isConnected && !this.el.contains(e.target)) { this.open = false; this._sig = ''; this.render(this.items) }
    })
  }

  // Cheap to call every frame: only touches the DOM when the list (or a countdown) changed.
  render(items) {
    this.items = items
    const sig = items.map(i => i.id + i.title + i.why + (i.left ?? '')).join('|') + this.open   // why too: its counts change (Merit, affection)
    if (sig === this._sig) return
    this._sig = sig
    const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const row = (i, cls = '') => `<button class="att-item att-${i.tier}${cls}" data-att="${i.id}">
      <span class="att-glyph">${typeof UI_ICONS !== 'undefined' && UI_ICONS[i.glyph] ? Icon(i.glyph) : i.glyph}</span>
      <span class="att-text"><span class="att-title">${esc(i.title)}${i.left != null ? ` <span class="att-left">${attClock(i.left)}</span>` : ''}</span><span class="att-why">${esc(i.why)}</span></span>
      <span class="att-go">›</span></button>`
    const n = t => items.filter(i => i.tier === t).length
    const kinds = [['urgent', 'decision'], ['ready', 'chance'], ['idle', 'nudge']].filter(([t]) => n(t))
      .map(([t, w]) => `<span class="att-k ${t}">${n(t)} ${w}${n(t) > 1 ? 's' : ''}</span>`).join('')
    const worstHidden = items.slice(1).find(i => i.tier !== 'idle')?.tier || ''
    const hiddenDots = ['urgent', 'ready', 'idle'].filter(t => items.slice(1).some(i => i.tier === t)).map(t => `<span class="att-dot ${t}"></span>`).join('')
    this.el.classList.toggle('calm', !items.length)
    this.el.classList.toggle('has-urgent', items.some(i => i.tier === 'urgent'))
    if (!items.length) {
      this.el.innerHTML = `<div class="att-head"><span class="att-head-title">Attention</span></div>
        <div class="att-calm"><span class="att-glyph">${Icon('idle')}</span><span>All is still. Nothing needs you.</span></div>`
      return
    }
    const more = items.length - 1
    this.el.innerHTML = `<div class="att-head"><span class="att-head-title">Attention</span><span class="att-count">${kinds}</span></div>
      <div class="att-list${this.open ? ' open' : ''}">${items.map((i, n) => row(i, n ? ' att-rest' : ' att-first')).join('')}${this.open ? '<button class="att-fold" data-att-fold>▴ fold away</button>' : ''}</div>
      ${more ? `<button class="att-more ${worstHidden}" data-att-more title="${more} more waiting"><span class="att-dots">${hiddenDots}</span>+${more} ▾</button>` : ''}`
  }
}

// Node (sim/checks) can require the pure part.
if (typeof module !== 'undefined') module.exports = { collectAttention, ATTENTION_TIER_ORDER }
