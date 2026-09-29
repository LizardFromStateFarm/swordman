// CombatView — the battle page (Phase 35 / roadmap A6-1 + A6-3a, docs/systems/combat.md). A full-window overlay: the ink
// field (BattleScene, renderer/engine/battle-scene.js) with a name plate per side (vigor pips, your live Health) above a
// control panel that walks through the steps:
//   prepare  (beasts only) what you're facing, known habits, and a card per stance (Slay / Drive off) with odds, wound per
//            blow and the worst case; "why these odds" opens the beastfight breakdown card. Nothing is committed yet.
//   fight    Press / Guard / Feint with this exchange's odds, Retreat (beast) / Yield (person), the last exchange in words
//            and a short log. Every exchange is your move (the scene animates it).
//   end      after a won fight: finish / spare / bind (beast, Slay) · let it flee / bind (Drive) · finish / spare (a person,
//            to the death) · raise / humble (a person, until one yields) — with loot / karma / the reaction shown;
//            then the result card. A loss, retreat or yield goes straight to the result.
// A6-3a: people (the spouse duel, challenging the head, defending the seat, your step-down tournament bouts) open here
// straight on the fight step — the family card before it holds the decision. A step-down bracket chains bouts: the
// result card of one bout leads to the next opponent.
// The fight itself lives in game-state (f.fight); closing the page mid-fight leaves it waiting (the attention strip
// reopens it). h: { esc, flash, zoom, settings }. DOM: #combat-overlay (index.html).

const COMBAT_REASON = {
  busy: 'Another fight is underway. Finish it first.',
  wounded: `You are too badly hurt to fight. Rest until your Health is ${typeof BEAST_FIGHT_MIN_HEALTH !== 'undefined' ? BEAST_FIGHT_MIN_HEALTH : 15} or more.`,
  gone: 'It has gone.',
}
// A6-3a: a fight with a person — its title, and what yielding costs you
const PERSON_FIGHT_TITLE = { duel: 'A Duel to the Death', challenge: 'Challenge for the Head Seat', defend: 'Defending the Head Seat', stepdown: 'Contest for the Head Seat', arena: 'The Arena', slaughter: 'A Killing on the Road' }
const PERSON_FIGHT_YIELD = { duel: 'your marriage ends', challenge: 'you lose; heal before you try again', defend: 'you give up the head seat', stepdown: 'you are out of the contest', arena: 'the run ends; you keep half the purse', slaughter: 'they let you live, and walk on' }

// The look of a person you fight: temper → slots, then their role (assets/data/duelists.js)
// (never the robe you wear: a rival must not read as your reflection — the next robe in DUELIST_ROBES instead)
function duelistSlots(p, avoidRobe = null) {
  const L = (typeof DUELIST_LOOK !== 'undefined' && (DUELIST_LOOK[p?.personality] || DUELIST_LOOK.default)) || {}
  const R = (typeof DUELIST_ROLE_LOOK !== 'undefined' && DUELIST_ROLE_LOOK[p?.role]) || {}
  const out = { ...L, ...R }
  if (avoidRobe && out.robe === avoidRobe && typeof DUELIST_ROBES !== 'undefined') {
    const i = DUELIST_ROBES.indexOf(avoidRobe)
    out.robe = DUELIST_ROBES[(i + 1) % DUELIST_ROBES.length]
  }
  return out
}

class CombatView {
  constructor(gameState, h) {
    this.gs = gameState
    this.h = h
    this.ov = document.getElementById('combat-overlay')
    this.box = document.getElementById('combat-box')
    this.panel = document.getElementById('combat-panel')
    this.plates = document.getElementById('combat-plates')
    this.scene = new BattleScene(document.getElementById('combat-canvas'))
    this.step = null                   // 'prepare' | 'fight' | 'end' | 'result' | 'died'
    this.mode = 'beast'                // 'beast' | 'person' (A6-3a)
    this.encId = null
    this.oppId = null                  // person mode: who you fight
    this.kind = null                   // person mode: duel / challenge / defend / stepdown
    this.result = null                 // the last end-of-battle summary shown on the result card
    this.bindGrade = null              // Phase 41: the talisman grade chosen for the end-of-battle bind
    this.lockUntil = 0
    this.box.addEventListener('click', e => this._click(e))
    document.getElementById('combat-close').addEventListener('click', () => this.close())
    document.addEventListener('keydown', e => {
      if (!this.isOpen()) return
      if (e.key === 'Escape' && !document.getElementById('breakdown-overlay').classList.contains('hidden')) return
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return }
      const key = { '1': 'press', '2': 'guard', '3': 'feint' }[e.key]
      if (key && this.step === 'fight') this.panel.querySelector(`[data-tac="${key}"]`)?.click()
    })
    window.addEventListener('resize', () => { if (this.isOpen()) this.scene.geo = null })
  }

  isOpen() { return !this.ov.classList.contains('hidden') }

  // From an encounter card / the details page: the prepare step (or the fight, if this beast is already being fought)
  open(encId) {
    const fi = this.gs.get().family?.fight
    if (fi) return this.resume()
    this.mode = 'beast'
    this.encId = encId
    this.result = null; this.snap = null; this.bindGrade = null
    this._show()
    this._setupScene(this.gs.get().beastEncounters.find(e => e.id === encId))
    this.step = 'prepare'
    this.render()
  }

  // A fight underway (attention item, the family card, a reload mid-fight) — a beast or a person
  resume() {
    const fi = this.gs.get().family?.fight
    if (!fi) return
    this.result = null; this.bindGrade = null
    if (fi.kind === 'beast') {
      this.mode = 'beast'
      this.encId = fi.beast.encId
      this._show()
      this._setupScene(fi.beast)
    } else {
      this.mode = 'person'
      this.oppId = fi.oppId; this.kind = fi.kind; this.snap = null
      this._show()
      this._setupPerson()
    }
    if (fi.over === 'won') this.scene.pose.foe = 'down'
    this.step = fi.over === 'won' ? 'end' : 'fight'
    this.render()
  }

  close() {
    if (this.step === 'died') return                            // the death moment finishes on its own
    this.ov.classList.add('hidden')
    this.scene.stop()
    this.step = null
    const fi = this.gs.get()?.family?.fight
    if (fi && !fi.over) this.h.flash(fi.kind === 'beast' ? 'The beast waits. Return to the fight from the strip above.' : 'Your opponent waits. Return to the fight from the strip above.', 'neutral')
  }

  _show() {
    this.ov.classList.remove('hidden')
    this.box.style.setProperty('--cz', this.h.zoom())
    this.box.classList.toggle('person', this.mode === 'person')
    this.scene.geo = null
  }

  _youState() {
    const s = this.gs.get(), st = CULTIVATION_STAGES[s.stageIndex] || CULTIVATION_STAGES[0]
    return { youState: typeof INK_ART !== 'undefined' && INK_ART[st.spriteState] ? st.spriteState : 'meditating', youColor: st.color }
  }

  _setupScene(rec) {
    if (!rec) return
    const prof = this.gs.beastProfile(rec), set = this.h.settings()
    this.scene.setup({ ...this._youState(), foeArt: prof.art, foeGlow: INK_BEASTS[prof.art]?.glow,
      reducedMotion: !!set.reducedMotion, speed: set.animSpeed || 1 })
    this.scene.start()
  }

  // A6-3a: the opponent is a person — their own realm's ink figure, dressed by temper + role, facing you
  _setupPerson() {
    const opp = this._opp(), set = this.h.settings()
    if (!opp) return
    const st = CULTIVATION_STAGES[opp.stageIndex || 0] || CULTIVATION_STAGES[0]
    const foeArt = typeof INK_ART !== 'undefined' && INK_ART[st.spriteState] ? st.spriteState : 'meditating'
    const you = this._youState(), yi = this.scene.you.ink
    const youRobe = yi.slotSel?.robe || InkRenderer.resolve(you.youState, INK_ART)?.slots?.robe || null
    this.scene.setup({ ...you, foePerson: true, foeArt, foeGlow: st.color, foeSlots: duelistSlots(opp, youRobe),
      reducedMotion: !!set.reducedMotion, speed: set.animSpeed || 1 })
    this.scene.start()
  }

  _opp() {
    const s = this.gs.get(), fi = s.family?.fight
    if (fi && fi.kind !== 'beast') return this.gs._fightOpp()
    if (this.kind === 'duel') return s.family?.spouse?.id === this.oppId ? s.family.spouse : (s.family?.formerSpouses || []).find(p => p.id === this.oppId)
    if (this.kind === 'arena') return s.arena?.duelists?.[this.oppId] || null
    return this.oppId ? this.gs.person(this.oppId) : null
  }

  // Cheap enough to call on every state change while open (Health regen, the fight moving on)
  refresh() { if (this.isOpen()) this._plates() }

  render() {
    if (!this.isOpen()) return
    this._plates()
    const s = this.gs.get()
    const fi = s.family?.fight
    if (this.step === 'fight' && fi?.over === 'won') this.step = 'end'
    const P = this.mode === 'person'
    const html = this.step === 'prepare' ? this._prepare()
      : this.step === 'fight' ? (P ? this._fightPerson() : this._fight())
      : this.step === 'end' ? (P ? this._endPerson() : this._end())
      : this._result()
    this.panel.innerHTML = html
    document.getElementById('combat-title').textContent = this._title()
    document.getElementById('combat-close').textContent = this.step === 'fight' ? 'Step back' : 'Leave'
    document.getElementById('combat-close').title = this.step === 'fight'
      ? (P ? 'Pause: your opponent waits for you (no blow taken). Yield ends the fight.' : 'Pause: the beast waits for you (no blow taken). Retreat ends the fight.')
      : 'Leave the battle page'
    document.getElementById('combat-close').classList.toggle('hidden', this.step === 'died' || this.step === 'end' || (this.step === 'result' && this.result?.next))
  }

  _title() {
    if (this.mode === 'person') {
      if (this.step === 'result' || this.step === 'died') return this.result?.next ? 'Between Bouts' : 'After the Fight'
      const fi = this.gs.fightInfo(), br = fi?.bracket
      if (this.kind === 'arena' && fi?.arena) return `${fi.arena.ring?.name || 'The Arena'}${fi.arena.blood ? ' · Blood Match' : ''}${fi.arena.callout ? ' · Grudge Match' : ''}`
      return (PERSON_FIGHT_TITLE[this.kind] || 'A Fight') + (this.kind === 'stepdown' && br ? ` · Round ${br.round}` : '')
    }
    const n = this._name()
    return this.step === 'prepare' ? `Face the ${n}` : this.step === 'result' || this.step === 'died' ? 'After the Battle' : `Battle · ${n}`
  }
  _name() {
    if (this.mode === 'person') return this._opp()?.given || this.result?.name || 'your opponent'
    const s = this.gs.get(), fi = s.family?.fight
    const rec = fi?.kind === 'beast' ? fi.beast : (s.beastEncounters || []).find(e => e.id === this.encId)
    return rec ? this.gs.beastProfile(rec).name + (rec.mood === 'cub' ? ' cub' : '') : (this.result?.name || 'beast')
  }

  // ── Name plates: vigor pips (exchanges left to lose), your Health ──
  _plates() {
    if (this.mode === 'person') return this._platesPerson()
    const s = this.gs.get(), fi = s.family?.fight, esc = this.h.esc
    const beastFi = fi?.kind === 'beast' ? fi : null
    const rec = beastFi ? beastFi.beast : (s.beastEncounters || []).find(e => e.id === this.encId)
    // After the battle the fight (and often the encounter) is gone: the plates keep its last state (snap), with the
    // final blow applied by _ended / the end choice, and your Health read live unless you fell.
    if (beastFi) this.snap = { name: this.gs.beastProfile(rec).name, youName: s.name, rec, to: beastFi.to, you: beastFi.you, them: beastFi.them }
    const after = !beastFi && this.snap && (this.step === 'result' || this.step === 'died')
    const S = after ? this.snap : null
    const to = S?.to || beastFi?.to || (typeof BATTLE_TO !== 'undefined' ? BATTLE_TO : 4)
    const pips = (left, cls) => Array.from({ length: to }, (_, i) => `<i class="${i < left ? 'on ' + cls : ''}"></i>`).join('')
    const hp = S?.dead ? 0 : Math.max(0, Math.ceil(s.health ?? 100))
    const prec = S ? S.rec : rec
    const prof = prec ? this.gs.beastProfile(prec) : null
    const youLeft = S ? to - S.them : beastFi ? to - beastFi.them : to, foeLeft = S ? to - S.you : beastFi ? to - beastFi.you : to
    const foeGone = S?.foeGone ? ' gone' : ''
    const sig = [hp, youLeft, foeLeft, prof?.name, this.step, foeGone].join('|')
    if (sig === this._plateSig) return
    this._plateSig = sig
    this.plates.innerHTML = `
      <div class="cb-plate you"><div class="cb-pn">${esc((S?.youName ?? s.name) || 'You')}</div>
        <div class="cb-pips" title="Exchanges you can still lose">${pips(youLeft, 'you')}</div>
        <div class="cb-hp${hp < 30 ? ' low' : ''}"><span data-icon="health"></span><span class="cb-hpbar"><b style="width:${Math.min(100, hp)}%"></b></span><span class="cb-hpv">${hp}</span></div></div>
      <div class="cb-plate foe${foeGone}"><div class="cb-pn">${esc(prof?.name || '')}${prec?.mood === 'cub' ? ' cub' : ''}</div>
        <div class="cb-pips" title="Exchanges it can still lose">${pips(foeLeft, 'foe')}</div>
        ${prof ? `<div class="cb-tier">${S?.foeGone ? `<span class="cb-fate">${esc(S.foeGone)}</span>` : ''}<span class="tier-chip tier-${prof.tier.id}">${esc(prof.tier.name)}</span>${prof.variant ? '<span class="tier-chip tier-variant">Rare colour</span>' : ''}</div>` : ''}</div>`
  }

  // A6-3a: the person's plate — full name, realm, temper, and a feud chip (they owe you / hold a grudge)
  _platesPerson() {
    const s = this.gs.get(), fi = s.family?.fight, esc = this.h.esc
    // (a step-down bracket may already hold your next bout while the result card still speaks of the last one)
    // _settling: the engine notifies mid-call (refresh → here) before this view has moved on to the result step
    const done = this._settling || this.step === 'result' || this.step === 'died'
    const live = fi && fi.kind !== 'beast' && !done ? fi : null
    const opp = this._opp()
    if (live && opp) this.snap = { name: Persons.fullName(opp), youName: s.name, to: live.to || (typeof FIGHT_TO !== 'undefined' ? FIGHT_TO : 2), you: live.you, them: live.them,
      stage: opp.stageIndex || 0, temper: PERSONALITIES.find(p => p.id === opp.personality)?.name || '', feud: opp.feud || null, foeGone: this.snap?.foeGone || null }
    const S = this.snap
    if (!S) return
    const after = !live && done
    const to = S.to, hp = S.dead ? 0 : Math.max(0, Math.ceil(s.health ?? 100))
    const pips = (left, cls) => Array.from({ length: to }, (_, i) => `<i class="${i < left ? 'on ' + cls : ''}"></i>`).join('')
    const youLeft = to - S.them, foeLeft = to - S.you
    const sig = ['p', hp, youLeft, foeLeft, S.name, this.step, S.foeGone, S.feud].join('|')
    if (sig === this._plateSig) return
    this._plateSig = sig
    const feud = S.feud ? `<span class="cb-feud ${S.feud}">${esc(FEUD_TEXT[S.feud])}</span>` : ''
    this.plates.innerHTML = `
      <div class="cb-plate you"><div class="cb-pn">${esc(S.youName || 'You')}</div>
        <div class="cb-pips" title="Exchanges you can still lose">${pips(youLeft, 'you')}</div>
        <div class="cb-hp${hp < 30 ? ' low' : ''}"><span data-icon="health"></span><span class="cb-hpbar"><b style="width:${Math.min(100, hp)}%"></b></span><span class="cb-hpv">${hp}</span></div></div>
      <div class="cb-plate foe${after && S.foeGone ? ' gone' : ''}"><div class="cb-pn">${esc(S.name)}</div>
        <div class="cb-pips" title="Exchanges they can still lose">${pips(foeLeft, 'foe')}</div>
        <div class="cb-tier">${after && S.foeGone ? `<span class="cb-fate">${esc(S.foeGone)}</span>` : ''}<span class="cb-realm">${esc(stageShortName(S.stage))}</span>${feud}</div></div>`
  }

  // ── Step 1: prepare (beasts) ──
  _prepare() {
    const pv = this.gs.beastFightPreview(this.encId), esc = this.h.esc
    if (!pv) return `<div class="cb-line">It has gone.</div>`
    const pct = v => v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`
    const T = pv.prof.type
    const read = pv.habitsKnown
      ? `<div class="cb-read"><span class="cb-k">How it fights</span> ${esc(pv.hint)}. <span class="cb-habits">Press ${pct(pv.habits.press)} · Guard ${pct(pv.habits.guard)} · Feint ${pct(pv.habits.feint)}</span></div>`
      : `<div class="cb-read"><span class="cb-k">How it fights</span> Unknown. You have never fought one of these; after this battle you will know.</div>`
    const rec = pv.record.fought ? `<div class="cb-rec">Your record: fought ${pv.record.fought} · won ${pv.record.won} · slain ${pv.record.slain}${pv.record.spared ? ` · spared ${pv.record.spared}` : ''}</div>` : ''
    const mood = pv.mood === 'grateful' ? '<div class="cb-mood good">This one remembers your mercy. It would come to you without a talisman.</div>'
      : pv.mood === 'vengeful' ? '<div class="cb-mood bad">This one remembers you, and it has grown stronger since.</div>'
      : pv.mood === 'cub' ? '<div class="cb-mood">Only a cub. Its mother is dead.</div>' : ''
    const S = pv.stance.slay, D = pv.stance.drive
    const card = (id, title, sub, st, lines) => `
      <button class="cb-stance ${id}${S.canDie && id === 'slay' ? ' deadly' : ''}" data-stance="${id}" ${pv.locked ? 'disabled' : ''}>
        <span class="cb-st-h"><span class="cb-st-n">${title}</span><span class="cb-st-p">${pct(st.chance)}<small>to win</small></span></span>
        <span class="cb-st-sub">${sub}</span>
        ${lines.map(l => `<span class="cb-st-l${l.warn ? ' warn' : ''}">${l.t}</span>`).join('')}
      </button>`
    return `
      <div class="cb-prep">
        <div class="cb-intro">${esc(pv.prof.variant ? pv.prof.variant.name : T?.name || pv.name)}, ${esc(BEAST_NATURE_TEXT[pv.nature] || 'a wild beast')}. ${esc(T?.desc || '')}</div>
        ${mood}${read}${rec}
        <div class="cb-stances">
          ${card('slay', 'Slay it', 'It fights for its life. Take its body for materials.', S, [
            { t: `Each blow you take: −${S.wound} Health` },
            { t: `Lose the battle: −${S.lossWound} more` },
            S.canDie ? { t: `This could kill you: you have ${Math.ceil(pv.health)} Health, a full loss costs up to ${S.worst}.`, warn: true } : { t: `Worst case −${S.worst} of your ${Math.ceil(pv.health)} Health` },
          ])}
          ${card('drive', 'Drive it off', 'It fights to get away. Safer, and no spoils.', D, [
            { t: `Each blow you take: −${D.wound} Health` },
            { t: 'Never below 1 Health' },
            { t: 'Win, and bind it or let it go' },
          ])}
        </div>
        <div class="cb-foot">
          <button class="cb-why" data-bd="beastfight:${esc(this.encId)}:slay"><span data-icon="why"></span>Why these odds</button>
          ${pv.locked ? `<span class="cb-lock"><span data-icon="lock"></span>${esc(COMBAT_REASON[pv.locked] || 'You cannot fight now.')}</span>` : '<span class="cb-note">Nothing happens until you choose.</span>'}
        </div>
      </div>`
  }

  // ── Step 2: the fight (beast) ──
  _fight() {
    const info = this.gs.fightInfo(), esc = this.h.esc
    if (!info || info.kind !== 'beast') return this._result()
    const name = info.opp.name
    const pct = v => `${Math.round(v * 100)}%`
    const last = info.log[info.log.length - 1]
    const VERB = { press: 'lunges', guard: 'braces', feint: 'feints' }
    const line = !last ? `The ${name} circles you. First to ${info.to} exchanges. Choose your move.`
      : `You ${FIGHT_TACTICS[last.you].name.toLowerCase()}; it ${VERB[last.them]}. ${last.won ? 'You land the blow.' : `It catches you (−${last.dmg} Health).`}`
    const read = info.habitsKnown ? `${esc(info.hint)} · Press ${pct(info.habits.press)} · Guard ${pct(info.habits.guard)} · Feint ${pct(info.habits.feint)}`
      : 'Unknown. These odds assume it fights evenly.'
    const log = info.log.slice(-5).reverse().map(l => `<li class="${l.won ? 'up' : 'down'}"><span class="cb-lr">${l.round}</span>${FIGHT_TACTICS[l.you].name} vs ${FIGHT_TACTICS[l.them].name}<em>${l.won ? 'hit' : `−${l.dmg}`}</em></li>`).join('')
    return `
      <div class="cb-last${last ? (last.won ? ' up' : ' down') : ''}">${esc(line)}</div>
      ${this._tacs(info, last)}
      <div class="cb-row2">
        <div class="cb-read sm"><span class="cb-k">Its habits</span> ${read}</div>
        <button class="cb-retreat" data-tac="retreat"><span data-icon="yield"></span>Retreat<small>parting blow −${info.wound}</small></button>
      </div>
      <div class="cb-foot"><span class="cb-chip${info.stance === 'slay' ? ' lethal' : ''}">${info.stance === 'slay' ? 'Slay: a loss can kill you' : 'Drive off: never below 1 Health'}</span>
        <button class="cb-why" data-bd="beastfight:${esc(info.beast.encId)}:${info.stance}"><span data-icon="why"></span>Why</button></div>
      ${log ? `<ol class="cb-log">${log}</ol>` : ''}`
  }

  _tacs(info, last) {
    const pct = v => `${Math.round(v * 100)}%`
    return `<div class="cb-tacs">${Object.entries(FIGHT_TACTICS).map(([id, t], i) => `
        <button class="cb-tac${last?.you === id ? ' picked' : ''}" data-tac="${id}">
          <span class="cb-g">${Icon.g(t.glyph)}</span>
          <span class="cb-t"><span class="cb-n">${t.name}<kbd>${i + 1}</kbd></span><span class="cb-b">beats ${FIGHT_TACTICS[t.beats].name}</span></span>
          <span class="cb-pct">${pct(info.tactics[id])}<small>this exchange</small></span>
        </button>`).join('')}</div>`
  }

  // ── Step 2: the fight (a person, A6-3a) ──
  _fightPerson() {
    const info = this.gs.fightInfo(), esc = this.h.esc
    if (!info || info.kind === 'beast') return this._result()
    const opp = info.opp, who = opp?.given || 'Your opponent'
    const pct = v => `${Math.round(v * 100)}%`
    const last = info.log[info.log.length - 1]
    const VERB = { press: 'presses', guard: 'guards', feint: 'feints' }
    const line = !last ? `${who} faces you across the ring. First to ${info.to} exchanges. Choose your move.`
      : last.yieldRefused ? `You offered to yield. ${who} refused. This ends with one of you.`
      : last.you === last.them ? `You both ${FIGHT_TACTICS[last.you].name.toLowerCase()}; no read wins it, so strength decides. ${last.won ? 'You land the blow.' : `${who} catches you (−${last.dmg || FIGHT_WOUND} Health).`}`
      : `You ${FIGHT_TACTICS[last.you].name.toLowerCase()}; ${who} ${VERB[last.them]}. ${last.won ? 'You land the blow.' : `${who} catches you (−${last.dmg || FIGHT_WOUND} Health).`}`
    const pers = PERSONALITIES.find(p => p.id === opp?.personality)
    const rec = info.record, feud = info.feud
    const recLine = rec.fought ? `<div class="cb-rec">You and ${esc(who)}: fought ${rec.fought} · you won ${rec.youWon} · they won ${rec.theyWon}${rec.spared ? ` · spared ${rec.spared}` : ''}${rec.humbled ? ` · humbled ${rec.humbled}` : ''}</div>` : ''
    const feudLine = feud === 'grudge' ? `<div class="cb-mood bad">${esc(who)} holds a grudge against you: they fight harder, and will not easily let you yield.</div>`
      : feud === 'debt' ? `<div class="cb-mood good">${esc(who)} owes you. They would more readily accept your yield.</div>` : ''
    const br = info.bracket
    const ar = info.arena
    const stake = ar ? (info.lethal ? `Blood match: to the death, ×${typeof ARENA_BLOOD_MULT !== 'undefined' ? ARENA_BLOOD_MULT : 3} purse` : 'Until one yields: lose, and keep half the purse')
      : info.lethal ? 'To the death: the loser does not rise' : 'Until one yields: the loser lives'
    const bracketLine = ar ? `<span class="cb-note">Purse ${this.h.fmt ? this.h.fmt(ar.purse) : ar.purse} · a win adds <b class="gold">+${this.h.fmt ? this.h.fmt(ar.prize) : ar.prize}</b>${ar.champion ? ' · the champion' : ''}</span>`
      : br ? `<span class="cb-note">Round ${br.round} · ${br.left} still standing${br.lethal ? '' : ` · blood ends at the last ${br.bloodTo}`}</span>` : ''
    const log = info.log.filter(l => !l.yieldRefused).slice(-5).reverse().map(l => `<li class="${l.won ? 'up' : 'down'}"><span class="cb-lr">${l.round}</span>${FIGHT_TACTICS[l.you].name} vs ${FIGHT_TACTICS[l.them].name}<em>${l.won ? 'hit' : `−${l.dmg || FIGHT_WOUND}`}</em></li>`).join('')
    return `
      <div class="cb-last${last && !last.yieldRefused ? (last.won ? ' up' : ' down') : ''}">${esc(line)}</div>
      ${this._tacs(info, last?.yieldRefused ? null : last)}
      <div class="cb-row2">
        <div class="cb-read sm"><span class="cb-k">${esc(pers ? pers.name : 'Their temper')}</span> ${esc(info.hint)} · Press ${pct(info.habits.press)} · Guard ${pct(info.habits.guard)} · Feint ${pct(info.habits.feint)}</div>
        <button class="cb-retreat" data-tac="yield"><span data-icon="yield"></span>Yield<small>${info.lethal ? `accepted ~${pct(info.yieldAccept)} · ` : ''}${esc(PERSON_FIGHT_YIELD[info.kind] || 'you lose')}</small></button>
      </div>
      ${feudLine}${recLine}
      <div class="cb-foot"><span class="cb-chip${info.lethal ? ' lethal' : ''}">${stake}</span>${bracketLine}
        <button class="cb-why" data-bd="personfight:${esc(opp?.id || '')}:${info.kind}"><span data-icon="why"></span>Why</button></div>
      ${log ? `<ol class="cb-log">${log}</ol>` : ''}`
  }

  // ── Step 3: the end choice (beast) ──
  _end() {
    const ch = this.gs.beastFightChoices(), esc = this.h.esc
    if (!ch) return this._result()
    const name = this._name()
    const loot = ch.loot.map(d => `${d.lo === d.hi ? d.lo : `${d.lo}–${d.hi}`} ${d.name}${d.chance < 1 ? ` (${Math.round(d.chance * 100)}%)` : ''}`).join(', ')
    const k = v => v > 0 ? `+${v} karma` : v < 0 ? `${v} karma` : 'no karma'
    const opt = (id, title, sub, extra = '', lock = null) => `
      <button class="cb-end ${id}" data-end="${id}" ${lock ? 'disabled' : ''}><span class="cb-st-n">${title}</span><span class="cb-st-sub">${sub}</span>${extra}${lock ? `<span class="cb-st-l warn">${lock}</span>` : ''}</button>`
    const bindLock = ch.bindLock === 'max_beasts' ? 'Your companions are full. Release one first.' : ch.bindLock === 'no_talisman' ? 'You need a taming talisman.' : null
    // Phase 41: choose a talisman grade for the bind (best held by default); the chance is shown, and a failure loses it.
    const held = (ch.talismanGrades || []).filter(g => g.count > 0)
    let sel = ch.bindGrade
    if (sel && this.bindGrade && held.some(g => g.id === this.bindGrade)) sel = this.bindGrade
    const selGr = sel && ch.talismanGrades ? ch.talismanGrades.find(g => g.id === sel) : null
    const gradeRow = held.length > 1
      ? `<div class="tame-grades cb-tame-grades">${held.map(g => `<button class="pack-chip${sel === g.id ? ' active' : ''}" data-bindgrade="${g.id}">${esc(g.name)}<small> ${g.count}</small></button>`).join('')}</div>`
      : ''
    const bindSub = ch.bindFree ? 'It bows its head to you. No talisman needed.'
      : selGr ? `${esc(selGr.name)} charm — ${Math.round(selGr.chance * 100)}%. If it fails, it is gone.`
      : 'You carry no taming talismans.'
    const bind = `<button class="cb-end bind" data-end="bind"${sel ? ` data-grade="${sel}"` : ''} ${bindLock ? 'disabled' : ''}><span class="cb-st-n">Bind it</span><span class="cb-st-sub">${bindSub}</span><span class="cb-st-l">Joins you at Lv.${typeof BEAST_BOUND_LEVEL !== 'undefined' ? BEAST_BOUND_LEVEL : 2}</span>${bindLock ? `<span class="cb-st-l warn">${bindLock}</span>` : ''}</button>`
    const opts = ch.ids.includes('finish')
      ? opt('finish', 'Finish it', ch.cub ? 'It is only a cub.' : 'Take what its body holds.', `<span class="cb-st-l">${esc(loot)}</span><span class="cb-st-l${ch.finishKarma < 0 ? ' warn' : ''}">${k(ch.finishKarma)}</span>`)
        + opt('spare', 'Spare it', 'Let it limp away. It may come back one day.', `<span class="cb-st-l">${k(ch.spareKarma)}</span>`) + bind
      : opt('flee', 'Let it flee', 'It runs, and may come back one day.', `<span class="cb-st-l">${k(ch.spareKarma)}</span>`) + bind
    return `<div class="cb-last up">The ${esc(name)} is down. What happens now is yours to decide.</div>${gradeRow}<div class="cb-ends${ch.ids.length === 3 ? ' three' : ''}">${opts}</div>`
  }

  // ── Step 3: the end choice (a person, A6-3a) — the reaction each choice leaves is read from their temper ──
  _endPerson() {
    const ch = this.gs.personFightChoices(), esc = this.h.esc
    if (!ch) return this._result()
    const who = ch.name || 'They'
    const k = v => v > 0 ? `+${v} karma` : v < 0 ? `${v} karma` : ''
    const react = f => f === 'debt' ? `<span class="cb-st-l good">${esc(who)} will owe you</span>` : `<span class="cb-st-l warn">${esc(who)} will hold a grudge</span>`
    const opt = (id, title, sub, extra = '') => `
      <button class="cb-end ${id}" data-end="${id}"><span class="cb-st-n">${title}</span><span class="cb-st-sub">${sub}</span>${extra}</button>`
    const FIN = { duel: 'End it. Your spouse does not rise.', challenge: 'End it, and take the head seat over their body.', defend: 'End it. Your seat is secure.', stepdown: 'End it. One fewer between you and the seat.', arena: 'End it on the sand. The crowd roars.', slaughter: 'End it. They do not rise, and the road keeps the body.' }
    const SPR = { duel: 'Lower your blade. They leave you, and live.', challenge: 'Let them live. You take the head seat all the same.', defend: 'Let them live. Your seat is secure.', stepdown: 'Let them live. They are out of the contest.', arena: 'Let them live. The crowd will remember your mercy.', slaughter: 'Lower your blade. They get up and go.' }
    const quiet = ch.quietYears ? `${ch.quietYears[0]}–${ch.quietYears[1]}` : ''
    const opts = ch.lethal
      ? opt('finish', 'Finish them', FIN[ch.kind] || 'End it.', `<span class="cb-st-l warn">${esc(who)} dies; no one is left to remember it</span><span class="cb-st-l${ch.karma.finish < 0 ? ' warn' : ''}">${k(ch.karma.finish) || 'no karma change'}</span>`)
        + opt('spare', 'Spare them', SPR[ch.kind] || 'Let them live.', `${react(ch.reaction.spare)}<span class="cb-st-l">${k(ch.karma.spare)}</span>`)
      : opt('raise', 'Raise them up', `Offer your hand before the ${ch.arena ? 'crowd' : 'clan'}. Mercy, seen by all.`,
          `${react(ch.reaction.raise)}<span class="cb-st-l">${ch.arena ? 'One who owes you may repay it one day' : 'A debtor never challenges you'}</span>`)
        + opt('humble', 'Humble them', ch.arena ? 'Leave them in the dust before the crowd.' : 'Leave them in the dust before the clan.',
          `${react(ch.reaction.humble)}<span class="cb-st-l">${ch.arena ? `+${ch.arena.renownHumble} renown: the crowd loves it` : `No one else dares challenge you for ${quiet} years`}</span>`)
    const head = ch.begs ? `${esc(who)} is down, and begs for their life. It is your choice.` : `${esc(who)} is down. What happens now is your choice.`
    return `<div class="cb-last up">${head}</div><div class="cb-ends">${opts}</div>`
  }

  // ── Result card ──
  _result() {
    const r = this.result, esc = this.h.esc
    if (!r) return `<div class="cb-line">The field is quiet.</div><div class="cb-foot"><button class="cb-leave" data-leave>Leave the field</button></div>`
    const loot = r.loot ? Object.entries(r.loot).map(([id, n]) => `<span class="cb-loot">${n} ${esc(ITEMS[id]?.name || id)}</span>`).join('') : ''
    const run = this.gs.get().arena?.run
    const foot = this.step === 'died' ? ''
      : r.next ? `<div class="cb-foot"><span class="cb-note">${esc(r.nextLine || '')}</span><button class="cb-leave" data-nextbout>Face ${esc(r.nextName || 'the next')}</button></div>`
      : r.arena && run ? `<div class="cb-foot ar-choice"><button class="cb-leave quiet" data-ar-next>Fight on<small>choose your next opponent</small></button>
          <button class="cb-leave" data-ar-walk>Walk away<small>with ${esc(this.h.fmt(run.purse))} stones</small></button></div>`
      : '<div class="cb-foot"><button class="cb-leave" data-leave>Leave the field</button></div>'
    return `<div class="cb-res ${r.tone}"><div class="cb-res-h">${esc(r.head)}</div><div class="cb-res-t">${esc(r.text)}</div>
      ${loot ? `<div class="cb-loots">${loot}</div>` : ''}${r.karma ? `<div class="cb-res-k">${r.karma > 0 ? '+' : ''}${r.karma} karma</div>` : ''}</div>
      ${foot}`
  }

  _click(e) {
    const t = e.target.closest('button')
    if (!t || t.disabled || t.dataset.bd != null) return
    if (t.dataset.leave != null) return this.close()
    if (t.dataset.nextbout != null) return this.resume()          // A6-3a: the next bout of a step-down bracket
    if (t.dataset.arNext != null) { this.close(); return this.h.go?.('arena') }   // A6-3b: back to the roster, run still on
    if (t.dataset.arWalk != null) {                                            // A6-3b: take the purse
      const r = this.gs.arenaWalkAway()
      if (r.ok) this.h.flash(`You walk away with ${this.h.fmt(r.purse)} Spirit Stones.`, 'positive')
      return this.close()
    }
    if (t.dataset.stance) {
      const r = this.gs.startBeastFight(this.encId, t.dataset.stance)
      if (!r.ok) { this.h.flash(COMBAT_REASON[r.reason] || 'You cannot fight now.', 'negative'); return this.render() }
      this.step = 'fight'
      return this.render()
    }
    if (t.dataset.tac) {
      if (performance.now() < this.lockUntil) return
      const name = this._name()
      this._settling = this.mode === 'person' && this.gs.get().family?.fight?.kind === 'stepdown'
      const r = this.gs.fightExchange(t.dataset.tac)
      this._settling = false
      if (!r.ok) return this.render()
      this.lockUntil = performance.now() + (this.h.settings().reducedMotion ? 250 : 650)
      if (r.exchange) this.scene.play({ type: 'ex', ...r.exchange })
      if (r.over === 'won') { this.scene.play({ type: 'won' }); this.step = 'end' }
      if (r.done) (this.mode === 'person' ? this._endedPerson(r, name) : this._ended(r, name))
      return this.render()
    }
    if (t.dataset.bindgrade) { this.bindGrade = t.dataset.bindgrade; return this.render() }   // Phase 41: pick the bind grade
    if (t.dataset.end && this.mode === 'person') return this._finishPerson(t.dataset.end)
    if (t.dataset.end) {
      const name = this._name()
      const r = this.gs.beastFightFinish(t.dataset.end, t.dataset.grade)
      if (!r.ok) { this.h.flash({ max_beasts: 'Your companions are full.', no_talisman: 'You need a taming talisman.' }[r.reason] || 'Not now.', 'negative'); return this.render() }
      if (r.outcome === 'bind_failed') {                          // Phase 41: the charm failed; it is gone
        this.scene.play({ type: 'spare' })
        if (this.snap) this.snap.foeGone = 'fled'
        this.result = { name, karma: r.karma, loot: null, tone: 'jade', head: `The ${name} slips free`, text: 'Your charm fails at the last moment. It is up and gone into the hills.' }
        this.step = 'result'
        return this.render()
      }
      this.scene.play({ type: r.outcome })
      if (this.snap) { this.snap.you = this.snap.to; this.snap.foeGone = { finish: 'slain', spare: 'spared', flee: 'fled', bind: 'bound' }[r.outcome] }
      this.result = {
        name, karma: r.karma, loot: r.loot || null,
        tone: r.outcome === 'finish' ? 'gold' : 'jade',
        head: { finish: `The ${name} is slain`, spare: `You spare the ${name}`, flee: `The ${name} flees`, bind: `The ${name} is bound to you` }[r.outcome],
        text: r.outcome === 'finish' ? (r.cub ? 'Something small cries in its den. A cub waits in Roam → Beasts.' : 'Its body is yours: cores, essence, whatever it held.')
          : r.outcome === 'bind' ? `It joins your companions at Lv.${r.beast?.level}. Find it in Roam → Beasts.`
          : r.returning === 'grateful' ? 'It looks back at you before it goes. You have a feeling you will meet again.'
          : r.returning === 'vengeful' ? 'It looks back at you before it goes. That look was not gratitude.'
          : 'It is gone into the hills.',
      }
      this.step = 'result'
      return this.render()
    }
  }

  // The battle ended without a win to decide on: lost, retreated, or you died
  _ended(r, name) {
    if (this.snap && !r.retreated) this.snap.them = this.snap.to
    if (r.outcome === 'died') return this._fall(name, `The ${name} was stronger. Your path ends on this field.`)
    if (r.retreated) {
      this.scene.play({ type: 'retreat' })
      this.result = { name, tone: 'dim', head: 'You break away', text: `Its parting blow cost you ${r.dmg} Health. The ${name} still prowls Roam → Beasts.` }
    } else {
      this.scene.play({ type: 'lost' })
      this.result = { name, tone: 'red', head: `The ${name} throws you down`, text: 'You crawl away wounded. It still prowls Roam → Beasts; heal, and it can be faced again.' }
    }
    this.step = 'result'
  }

  // You fell: hold until the fall has played (BattleScene.END_SECONDS.died), then hand over to the death moment + card
  _fall(name, text) {
    if (this.snap) this.snap.dead = true
    this.scene.play({ type: 'died' })
    this.step = 'died'
    this.result = { name, tone: 'red', head: 'You fall', text }
    setTimeout(() => { this.ov.classList.add('hidden'); this.scene.stop(); this.step = null }, (BattleScene.END_SECONDS.died + 0.4) * 1000)
  }

  // A6-3a: a fight with a person ended on a loss or a yield (outcome from game-state: 'lost' / 'lost_lethal' / 'died' =
  // your death; 'fled' = the duel yielded; 'lost_nonlethal'; a step-down bout → 'eliminated' / 'won' / 'bout' (next))
  _endedPerson(r, name) {
    if (this.snap && !r.yielded) this.snap.them = this.snap.to
    if (['lost', 'lost_lethal', 'died'].includes(r.outcome)) {
      const T = { duel: `${name}'s blade is faster. Your path ends in your own courtyard.`, challenge: `${name}'s blade is faster. Your challenge ends your life.`,
        defend: `${name}'s blade is faster. Your reign ends where it stood.`, stepdown: `${name}'s blade is faster. You fall in the contest for the seat.`,
        arena: `${name}'s blade is faster. You die on the sand, and the crowd roars for the wrong one.`,
        slaughter: `${name}'s blade is faster. You die on the road, far from home.` }
      return this._fall(name, T[this.kind] || 'Your path ends here.')
    }
    this.scene.play({ type: r.yielded ? 'retreat' : 'lost' })
    const T = r.yielded
      ? { duel: `You throw down your sword. ${name} spares you, and walks out of your life.`, challenge: 'You yield. The head keeps the seat; heal before you try again.',
          defend: `You yield. ${name} takes the head seat.`, stepdown: 'You yield, and step out of the contest.', slaughter: `You yield. ${name} lets you live, and walks on.` }
      : { challenge: `${name} beats you down and lets you live. Heal before you try again.`, defend: `${name} beats you before the whole clan. They take the head seat.`,
          stepdown: `${name} beats you. You are out of the contest.`, slaughter: `${name} beats you down and lets you live. You limp home.` }
    this.result = { name, tone: r.yielded ? 'dim' : 'red', head: r.yielded ? 'You yield' : `${name} stands over you`, text: T[this.kind] || 'You are beaten, but alive.' }
    if (this.kind === 'arena') {                                     // A6-3b: the run ends; half the purse is yours
      const L = this.gs.get().arena?.last
      this.result.text = `${r.yielded ? 'You yield.' : `${name} beats you.`} Your run ends${L?.purse ? `: you keep ${this.h.fmt(L.keep)} of the ${this.h.fmt(L.purse)} purse` : ''}.`
      this.result.arenaDone = true
    }
    this._stepdownTail(r)
    this.step = 'result'
  }

  _finishPerson(choice) {
    const name = this._name(), kind = this.kind
    this._settling = true
    const r = this.gs.personFightFinish(choice)
    this._settling = false
    if (!r.ok) return this.render()
    this.scene.play({ type: choice === 'finish' ? 'finish' : 'spare' })
    if (this.snap) { this.snap.you = this.snap.to; this.snap.foeGone = { finish: 'fallen', spare: 'spared', raise: 'raised', humble: 'humbled' }[choice]; this.snap.feud = r.feud }
    const feud = r.feud === 'debt' ? `${name} will remember they owe you.` : r.feud === 'grudge' ? `${name} will not forget this.` : ''
    const HEAD = { finish: `${name} does not rise`, spare: `You spare ${name}`, raise: `You raise ${name} up`, humble: `You humble ${name}` }
    const TXT = {
      duel: { finish: 'The duel ends in the courtyard. You carry the wound, and the silence.', spare: 'They gather what they own and go. The marriage is over.' },
      challenge: { finish: 'You take the head seat over their body.', spare: 'You take the head seat. They live, as an elder of the clan.', raise: 'You take the head seat, and the clan saw your mercy.', humble: 'You take the head seat, and the clan saw them crawl.' },
      defend: { finish: 'Your seat is secure.', spare: 'Your seat is secure, and they live.', raise: 'Your seat is secure. The clan saw your mercy.', humble: 'Your seat is secure. The clan is cowed.' },
      stepdown: { finish: 'One fewer stands between you and the seat.', spare: 'They are out of the contest, alive.', raise: 'They are out of the contest.', humble: 'They are out of the contest, and the clan saw it.' },
      arena: { finish: 'The sand drinks it in.', spare: 'They limp from the ring, alive.', raise: 'The crowd cheers the gesture.', humble: 'The crowd howls with delight.' },
      slaughter: { finish: 'Their body lies on the road behind you.', spare: 'They get up and go, and do not look back.' },
    }
    const karma = choice === 'spare' ? (typeof SPARE_KARMA !== 'undefined' ? SPARE_KARMA : 0) : choice === 'finish' && kind === 'arena' ? (typeof ARENA_KILL_KARMA !== 'undefined' ? ARENA_KILL_KARMA : 0) : 0
    this.result = { name, tone: choice === 'finish' ? 'gold' : 'jade', karma, head: HEAD[choice], text: `${TXT[kind]?.[choice] || ''} ${feud}`.trim() }
    if (kind === 'arena') {                                          // A6-3b: what the win put in the purse; walk away or fight on
      const L = this.gs.get().arena?.last
      if (L?.won) Object.assign(this.result, { arena: true, purse: L.purse, gain: L.gain, streak: L.streak,
        head: L.title ? `${L.title}` : this.result.head,
        text: `${L.title ? `You beat the champion. ` : ''}${this.result.text} +${this.h.fmt(L.gain)} to the purse: ${this.h.fmt(L.purse)} now, ${L.streak} win${L.streak === 1 ? '' : 's'} in a row.${L.champLeft ? '' : ' The champion will answer you.'}` })
    }
    this._stepdownTail(r)
    this.step = 'result'
    this.render()
  }

  // A step-down bracket: what happened after your bout — the next opponent, or how the contest ended
  _stepdownTail(r) {
    if (this.kind !== 'stepdown') return
    if (r.next) {
      const fi = this.gs.get().family?.fight, nxt = fi ? this.gs.person(fi.oppId) : null, br = this.gs.fightInfo()?.bracket
      Object.assign(this.result, { next: true, nextName: nxt?.given || 'the next', nextLine: br ? `Round ${br.round} · ${br.left} still standing` : '' })
      return
    }
    const clan = this.gs._playerClan?.(), head = clan?.headId ? (clan.headId === this.gs.get().self?.id ? null : this.gs.person(clan.headId)) : null
    if (r.outcome === 'won') Object.assign(this.result, { tone: 'gold', head: 'You stand alone', text: `${this.result.text} The clan raises you to the head seat.` })
    else if (head) this.result.text += ` ${Persons.fullName(head)} stands alone and takes the head seat.`
  }
}

if (typeof module !== 'undefined') module.exports = { CombatView, duelistSlots }
