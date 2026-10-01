// Attention — the "needs you" layer (roadmap 1.8b-1, Phase 33). collectAttention() is DOM-free: it turns the save
// into a ranked list of things waiting on the player (a pending decision, an opportunity, an idle slot), each with
// the reason it's there and where it leads. AttentionUI draws that list as the strip under the HUD (Overlay), a
// card column (Expanded/Desktop), a one-line summary (Banner) or a collapsed one-line row on a phone, and NavUI
// turns the same list into tab badges.
// See docs/systems/ui-layout.md → "Navigation + attention".

// tier: 'urgent' = a decision is waiting on you · 'ready' = something you can act on now · 'idle' = a quiet nudge
const ATTENTION_TIER_ORDER = { urgent: 0, ready: 1, idle: 2 }

// Phone: the attention center collapses to one line by default (the viewport is short) — the player's choice is
// remembered per device. Only the phone layout (desktop mode at a narrow width) is affected; Overlay already folds.
const ATT_MIN_KEY = 'cultivator-idle:att-min'

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
  // family-events.js: a bad father's hand — the beating waits on your answer; the grown-up reckoning, later.
  if (s.abuse?.event) add('urgent', 'beating', 'child', 'A father’s hand', `${gs.beatingInfo?.()?.why || 'Your father'} · he will not stop on his own.`, 'family', 'family')
  const reck = s.abuse?.reckon ? gs.reckoningInfo?.() : null
  if (reck) add('ready', 'reckoning', 'sword', 'A reckoning waits', `${reck.headName} once beat you. You are grown now — and you stand above him.`, 'family', 'family')
  // family-events.js: the mirror — a child you beat, now grown and stronger, has come back for you.
  const kidReck = gs.childReckoningInfo?.()
  if (kidReck) add('urgent', 'child-reckoning', 'child', 'A child’s reckoning', `${kidReck.given} has not forgotten. They are grown now — and stronger than you.`, 'family', 'family')
  // 1.8b-3b: a fight you're in (never resolves without you), and a lover's ultimatum
  if (f.fight?.kind === 'beast') {                               // Phase 35: a beast battle (the battle page reopens it)
    const bn = gs.beastProfile ? gs.beastProfile(f.fight.beast).name : 'beast'
    add('urgent', 'fight', 'beast', f.fight.over ? `The ${bn} is down` : `Your battle with the ${bn}`,
      f.fight.over ? 'Finish it, spare it, or bind it. It waits on you.' : `Turn ${f.fight.m?.turn || 1}. Choose your next move.`, 'beasts', 'combat')
  } else if (f.fight) {
    const opp = f.fight.kind === 'duel' ? f.spouse : f.fight.kind === 'arena' ? s.arena?.duelists?.[f.fight.oppId] : gs.person?.(f.fight.oppId)
    add('urgent', 'fight', 'duel', f.fight.over ? `${opp?.given || 'Your rival'} is down` : `Your fight with ${opp?.given || 'your rival'}`,
      f.fight.over ? (f.fight.lethal ? 'Finish them, or spare them. They wait on you.' : 'Help them up, or humble them. They wait on you.')
        : `Turn ${f.fight.m?.turn || 1}. Choose your next move.`, f.fight.kind === 'duel' ? 'family' : f.fight.kind === 'arena' ? 'arena' : 'clan', 'combat')
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
  if (road.length) add('ready', 'road', 'explore', road.length === 1 ? `${road[0].person?.given || 'A stranger'}, met on the road` : `${road.length} strangers on the road`, 'Seduce, slaughter, or leave them. They wait until you choose.', 'explore')
  const wild = (s.beastEncounters || []).filter(e => e.id !== s.hunt?.found)   // A6-2: a hunt's find has its own item below
  if (wild.length) {
    // a legendary sighting leads the card (and names itself) even among other wild beasts
    const prof = e => (gs?.beastProfile ? gs.beastProfile(e) : { name: 'beast', tier: { id: 'common' } })
    const legend = wild.find(e => prof(e).tier.id === 'legendary')
    const tal = (typeof TALISMAN_GRADES !== 'undefined')
      ? TALISMAN_GRADE_ORDER.reduce((a, g) => a + (s.inventory?.[TALISMAN_GRADES[g].itemId] || 0), 0)
      : (s.inventory?.beast_taming_talisman || 0)
    const talis = tal > 0 ? `You carry ${tal} taming talisman${tal === 1 ? '' : 's'}.` : 'Taming needs a taming talisman.'
    if (legend) add('ready', 'beasts', 'beast', `A legendary ${prof(legend).name} watches you`, `Few cultivators ever see one. ${talis}`, 'beasts')
    else add('ready', 'beasts', 'beast', wild.length === 1 ? `A wild ${prof(wild[0]).name} lingers` : `${wild.length} wild beasts linger`, talis, 'beasts')
  }
  // A6-2: a hunt that found its beast (it also shows under the wild-beasts item) — lead the player back to Roam → Hunt
  if (s.hunt?.found && (s.beastEncounters || []).some(e => e.id === s.hunt.found)) {
    const e = s.beastEncounters.find(x => x.id === s.hunt.found)
    const bn = gs.beastProfile ? gs.beastProfile(e).name : 'beast'
    add('ready', 'hunt', 'beast', `Your hunt found ${/^[aeiou]/i.test(bn) ? 'an' : 'a'} ${bn}`, 'Fight it, tame it, or let it be.', 'hunt')
  }
  // A6-3b the Arena: a grudge call-out (urgent), a run waiting between bouts, a ring that just opened to you
  const A = s.arena
  if (A && !f.fight) {
    const cp = A.callout && A.duelists?.[A.callout.id]
    const rn = id => (typeof ARENA_RINGS !== 'undefined' && ARENA_RINGS.find(r => r.id === id)?.name) || 'the Arena'
    if (cp) add('urgent', 'arena-callout', 'sword', `${cp.given} calls you out`, `On the ${rn(A.callout.ringId)}${A.callout.blood ? ', to the death' : ''}. Answer them, or let it go.`, 'arena')
    else if (A.run) add('ready', 'arena-run', 'stone', `Your purse: ${A.run.purse} stones`, `${A.run.streak} win${A.run.streak === 1 ? '' : 's'} on the ${rn(A.run.ringId)}. Fight on, or walk away with it.`, 'arena')
    else if (typeof ARENA_RINGS !== 'undefined') {
      const fresh = ARENA_RINGS.filter(r => (s.stageIndex || 0) >= r.minStage && !(A.seenRings || []).includes(r.id)).pop()
      if (fresh) add('idle', 'arena-ring', 'sword', `The ${fresh.name} opens to you`, `A new ring in Roam → Arena. A win there pays ${fresh.prize}+.`, 'arena')
    }
  }
  // Phase 42 arts: a breakthrough offer (it waits), a manual you can study while the desk is free, an empty slot you can fill
  const ar = s.arts
  if (ar && typeof ARTS !== 'undefined') {
    if (ar.offers?.length) add('ready', 'arts-offer', 'breakthrough', 'A breakthrough insight', `${ar.offers.length > 1 ? `${ar.offers.length} choices wait` : `Three arts from ${ar.offers[0].realm}`}: keep one in Path → Arts.`, 'arts')
    const held = Object.keys(s.inventory || {}).filter(k => k.startsWith('manual_') && s.inventory[k] > 0 && ARTS[k.slice(7)])
    // 1.14b: while a study desk is free (more desks as your realm rises)
    const desks = ar.studies || [], deskN = gs?.studySlots ? gs.studySlots() : 1
    const studyable = desks.length < deskN && held.filter(k => { const a = ARTS[k.slice(7)], kn = ar.known[a.id]; return (s.stageIndex || 0) >= a.minStage && !(kn && kn.mastery >= ART_MASTERY_MAX) && !desks.some(d => d.artId === a.id) })
    if (studyable?.length) add('ready', 'arts-study', 'scroll', studyable.length === 1 ? `${ARTS[studyable[0].slice(7)].name}: a manual to study` : `${studyable.length} martial art manuals to study`, `${deskN - desks.length === 1 ? 'A study desk is free' : `${deskN - desks.length} study desks are free`}: Path → Arts or your pack.`, 'arts')
    // A spare manual (an art you know) your sect's library would take: Contribution + war strength (user 2026-09-30)
    const give = gs?.sectDonateInfo?.()?.manuals.filter(x => x.spare && !x.lock)
    if (give?.length) add('idle', 'sect-donate', 'scroll', give.length === 1 ? `A spare manual: ${ARTS[give[0].id].name}` : `${give.length} spare manuals`, `Your sect's library would take ${give.length === 1 ? 'it' : 'them'}${give[0].contribution ? ' for Contribution' : ''} and train for war on ${give.length === 1 ? 'it' : 'them'}.`, s.ownSect?.founded ? 'sect-halls' : 'sect-library')
    const kind = k => Object.keys(ar.known).filter(id => ARTS[id]?.kind === k)
    const freeMove = ar.loadout.moves.includes(null) && kind('move').some(id => !ar.loadout.moves.includes(id))
    const slots = gs?.passiveSlots ? gs.passiveSlots() : 1
    const freePas = ar.loadout.passives.slice(0, slots).includes(null) && kind('passive').some(id => !ar.loadout.passives.includes(id))
    if (freeMove || freePas) add('idle', 'arts-slot', 'sword', freeMove ? 'An empty move slot' : 'An empty passive slot', 'You know an art that could fill it. Path → Arts.', 'arts')
  }
  // 1.8b-3a courtship: candidates to choose from, a meeting waiting on your answer, or one you can arrange
  const court = f.court
  if (court && !court.target && (court.candidates || []).length) add('ready', 'court', 'bond', 'The matchmaker waits', `${court.candidates.length} candidates. Choose whom to court.`, 'family')
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
  // Phase 40: fresh Soul Points (the discovery dot until the Soul screen is opened) or a rank you can buy
  const soul = gs.soulInfo?.()
  if (soul?.earned && (!soul.seen || soul.canSpend))
    add('idle', 'soul', 'soul', soul.seen ? 'A Soul Resonance rank is ready' : 'Your soul remembers', `${Math.floor(soul.points)} Soul Points, shared by every save slot. Spend them on faster Qi.`, 'hall', 'soul')
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
    try { this._minPref = localStorage.getItem(ATT_MIN_KEY) } catch { this._minPref = null }   // '0' = expanded, else minimized
    this.el.addEventListener('click', e => {
      if (e.target.closest('[data-att-min]')) {   // phone: the head caret expands/minimizes the list (remembered)
        this._minPref = this._minOn() ? '0' : '1'
        try { localStorage.setItem(ATT_MIN_KEY, this._minPref) } catch {}
        this._sig = ''; this.render(this.items); return
      }
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

  // A phone: the native shells report layout 'desktop' at a narrow width. Overlay is narrow too, but it already
  // folds to one line + "+N", so it keeps its own behaviour and never gets the caret.
  _isPhone() { const b = document.body.dataset; return b.layout === 'desktop' && b.narrow === '1' }
  // Minimized by default on a phone until the player opens it (their choice remembered).
  _minOn() { return this._isPhone() && this._minPref !== '0' }

  // Cheap to call every frame: only touches the DOM when the list (or a countdown) changed.
  render(items) {
    this.items = items
    const min = this._minOn()
    const sig = items.map(i => i.id + i.title + i.why + (i.left ?? '')).join('|') + this.open + min   // why too: its counts change (Merit, affection)
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
    this.el.classList.toggle('minimized', min)   // phone only: one line + a caret; no effect elsewhere (CSS-scoped)
    if (!items.length) {
      this.el.innerHTML = `<div class="att-head"><span class="att-head-title">Attention</span></div>
        <div class="att-calm"><span class="att-glyph">${Icon('idle')}</span><span>All is still. Nothing needs you.</span></div>`
      return
    }
    const more = items.length - 1
    const minBtn = `<button class="att-min" data-att-min aria-expanded="${min ? 'false' : 'true'}" title="${min ? 'Expand attention' : 'Minimize attention'}">${min ? '▾' : '▴'}</button>`
    this.el.innerHTML = `<div class="att-head"><span class="att-head-title">Attention</span><span class="att-head-right"><span class="att-count">${kinds}</span>${minBtn}</span></div>
      <div class="att-list${this.open ? ' open' : ''}">${items.map((i, n) => row(i, n ? ' att-rest' : ' att-first')).join('')}${this.open ? '<button class="att-fold" data-att-fold>▴ fold away</button>' : ''}</div>
      ${more ? `<button class="att-more ${worstHidden}" data-att-more title="${more} more waiting"><span class="att-dots">${hiddenDots}</span>+${more} ▾</button>` : ''}`
  }
}

// Node (sim/checks) can require the pure part.
if (typeof module !== 'undefined') module.exports = { collectAttention, ATTENTION_TIER_ORDER }
