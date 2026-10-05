// CombatView — the battle page (Phase 35 / roadmap A6-1 + A6-3a; moves since Phase 42b/c, docs/systems/combat.md + arts.md).
// A full-window overlay: the ink field (BattleScene, renderer/engine/battle-scene.js) with a name plate per side (Health,
// your combat Qi, status chips, their element) above a control panel that walks through the steps:
//   prepare  (beasts only) what you're facing, its element + known arts, and a card per stance (Slay / Drive off) with the
//            estimate, the Health it costs and the worst case; the parry window; "why these odds" opens the breakdown card.
//   fight    your 4 equipped arts (keys 1–4), Circulate (C), Palm Strike, Retreat (beast) / Yield (person), the last turn in
//            words and a log. An enemy blow may open the parry prompt on the field (Space). A person's panel adds what you
//            know of them (root, arts seen, habits once fought), the feud, your record, the stakes (1.14a).
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
const PERSON_FIGHT_TITLE = { duel: 'A Duel to the Death', challenge: 'Challenge for the Head Seat', defend: 'Defending the Head Seat', stepdown: 'Contest for the Head Seat', arena: 'The Arena', slaughter: 'A Killing on the Road', sectmaster: 'Challenge for the Master’s Seat', spar: 'A Friendly Spar', road: 'Met on the Road' }
// Phase 28 4.9: a road fight's title by the card that started it
const ROAD_FIGHT_TITLE = { ambush: 'An Ambush on the Road', challenge: 'A Challenge on the Road', contest: 'A Fight for the Find', oldface: 'A Spar with an Old Face',
  spar: 'A Spar, at Your Invitation', duel: 'A Duel to the Death',   // 4.10: a fight you called from their person card
  rivalDuel: 'Your Rival, Again', rivalTalk: 'A Spar Between Rivals', rivalKin: 'Between Your Rival and Your Kin' }   // 4.10b
const PERSON_FIGHT_YIELD = { duel: 'your marriage ends', challenge: 'you lose; heal before you try again', defend: 'you give up the head seat', stepdown: 'you are out of the contest', arena: 'the run ends; you keep half the purse', slaughter: 'they let you live, and walk on', sectmaster: 'you are stripped to Elder; heal before you try again', spar: 'you bow out; no harm done', road: 'they let you go, and take what they came for' }

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
    this.parryEl = document.getElementById('combat-parry')    // the parry prompt, on the field between you and it (user 2026-09-29)
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
      if (this.step === 'fight') {                                  // Phase 42b (people since 1.14a): moves 1–4, C circulate, Space parry
        if (e.key === ' ' || e.key === 'p' || e.key === 'P') { if (this.qte) { e.preventDefault(); this._parryPress() } return }
        const slot = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key]
        if (slot != null) this.panel.querySelectorAll('.cb-moves > *')[slot]?.click?.()
        if (e.key === 'c' || e.key === 'C') this.panel.querySelector('[data-move="circulate"]')?.click()
      }
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

  // v1 add-on (docs/systems/bosses.md): a legendary boss from Roam → Hunt → Legendary — its prepare step first
  openBoss(id) {
    const fi = this.gs.get().family?.fight
    if (fi) return this.resume()
    this.mode = 'boss'; this.bossId = id
    this.result = null; this.snap = null; this.bindGrade = null
    this._show()
    this._setupBoss(id)
    this.step = 'prepare'
    this.render()
  }
  // The Bird draws as an ink beast; the Wraith wears your own figure and robe, mirrored, with a cold glow.
  _setupBoss(id) {
    const def = BOSSES[id], set = this.h.settings(), you = this._youState()
    if (!def) return
    if (id === 'wraith') {
      const yi = this.scene.you.ink, slots = yi?.slotSel ? { ...yi.slotSel } : null
      this.scene.setup({ ...you, foePerson: true, foeArt: you.youState, foeGlow: '#8A7AE8', foeSlots: slots, reducedMotion: !!set.reducedMotion, speed: set.animSpeed || 1 })
    } else this.scene.setup({ ...you, foeArt: def.art, foeGlow: def.glow, reducedMotion: !!set.reducedMotion, speed: set.animSpeed || 1 })
    this.scene.start()
  }

  // A fight underway (attention item, the family card, a reload mid-fight) — a beast or a person
  resume() {
    const fi = this.gs.get().family?.fight
    if (!fi) return
    this.result = null; this.bindGrade = null
    if (fi.kind === 'boss') {
      this.mode = 'boss'; this.bossId = fi.boss.id; this.snap = null
      this._show()
      this._setupBoss(fi.boss.id)
    } else if (fi.kind === 'beast') {
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
    if (fi.m?.pending && this.step === 'fight') this._startParry(fi.m.pending)
  }

  close() {
    if (this.step === 'died') return                            // the death moment finishes on its own
    this.ov.classList.add('hidden')
    this.scene.stop()
    this.step = null
    this.qte = null                                              // a parry prompt restarts when you come back
    this.scene.telegraph(null)
    this.parryEl.classList.add('hidden'); this._parryKey = null
    const fi = this.gs.get()?.family?.fight
    if (fi && !fi.over) this.h.flash(fi.kind === 'beast' || fi.kind === 'boss' ? 'The beast waits. Return to the fight from the strip above.' : 'Your opponent waits. Return to the fight from the strip above.', 'neutral')
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
    const Bm = this.mode === 'boss'
    const html = this.step === 'prepare' ? (Bm ? this._prepareBoss() : this._prepare())
      : this.step === 'fight' ? this._fight()
      : this.step === 'end' ? (P ? this._endPerson() : Bm ? this._endBoss() : this._end())
      : this._result()
    this.panel.innerHTML = html
    this._renderParry()
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
      if (this.kind === 'road') return (fi?.road && ROAD_FIGHT_TITLE[fi.road.kind]) || PERSON_FIGHT_TITLE.road
      return (PERSON_FIGHT_TITLE[this.kind] || 'A Fight') + (this.kind === 'stepdown' && br ? ` · Round ${br.round}` : '')
    }
    const n = this._name()
    if (this.mode === 'boss') return this.step === 'prepare' ? `Face the ${n}` : this.step === 'result' ? 'After the Battle' : `Legendary · ${n}`
    return this.step === 'prepare' ? `Face the ${n}` : this.step === 'result' || this.step === 'died' ? 'After the Battle' : `Battle · ${n}`
  }
  _name() {
    if (this.mode === 'person') return this._opp()?.given || this.result?.name || 'your opponent'
    if (this.mode === 'boss') return BOSSES[this.bossId]?.short || 'beast'
    const s = this.gs.get(), fi = s.family?.fight
    const rec = fi?.kind === 'beast' ? fi.beast : (s.beastEncounters || []).find(e => e.id === this.encId)
    return rec ? this.gs.beastProfile(rec).name + (rec.mood === 'cub' ? ' cub' : '') : (this.result?.name || 'beast')
  }

  // ── Name plates (Phase 42b; people since 1.14a): HP + your combat Qi + status chips + their element ──
  // A beast's plate carries its tier; a person's their realm and a feud chip (they owe you / hold a grudge).
  _plates() {
    if (this.mode === 'boss') return this._platesBoss()
    const s = this.gs.get(), fi = s.family?.fight, esc = this.h.esc, P = this.mode === 'person'
    // (a step-down bracket may already hold your next bout while the result card still speaks of the last one)
    // _settling: the engine notifies mid-call (refresh → here) before this view has moved on to the result step
    const done = this._settling || this.step === 'result' || this.step === 'died'
    const live = fi && (P ? fi.kind !== 'beast' && !done : fi.kind === 'beast') ? fi : null
    const clone = m => m ? JSON.parse(JSON.stringify(m)) : null
    let rec = null, opp = null
    if (P) {
      opp = this._opp()
      if (live && opp) this.snap = { person: true, name: Persons.fullName(opp), youName: s.name, stage: opp.stageIndex || 0, feud: typeof opp.feud === 'string' ? opp.feud : opp.feud?.pid === s.self?.id ? 'grudge' : null, m: clone(live.m), foeGone: this.snap?.foeGone || null }
      if (!this.snap) return
    } else {
      rec = live ? live.beast : (s.beastEncounters || []).find(e => e.id === this.encId)
      if (live) this.snap = { name: this.gs.beastProfile(rec).name, youName: s.name, rec, m: clone(live.m), foeGone: this.snap?.foeGone || null }
    }
    const after = !live && this.snap && done
    const S = after || P ? this.snap : null
    const M = after ? S.m : live?.m || (P ? S.m : null)
    const hp = S?.dead ? 0 : Math.max(0, Math.ceil(s.health ?? 100)), hpMax = this.gs.maxHealth?.() || 100   // Phase 14: the body's max
    const prec = P ? null : (after ? S.rec : rec)
    const prof = prec ? this.gs.beastProfile(prec) : null
    const pv = !P && !M && this.encId ? this.gs.beastFightPreview(this.encId) : null
    const fallen = after && ['slain', 'fallen'].includes(S?.foeGone)
    const fHp = M ? Math.max(0, fallen ? 0 : M.foe.hp) : pv?.stance.slay.foeHp || 0, fMax = M ? M.foe.max : fHp || 1
    const el = M?.foe.element || pv?.element || null
    const qi = M ? Math.round(M.you.qi) : null, pool = M ? M.you.pool : 0
    const chips = F => Object.entries(F?.st || {}).map(([k, n]) => `<span class="cb-st ${k}" title="${esc(ART_STATUS[k].desc)}">${esc(ART_STATUS[k].name)}${k === 'burn' && F.burn > 1 ? ` ×${F.burn}` : ''} <b>${n}</b></span>`).join('')
      + (F?.charging ? `<span class="cb-st charge" title="Lands next turn">Gathering</span>` : '')
    const foeGone = after && S?.foeGone ? ' gone' : ''
    // 1.13b: the scene draws each live status as an aura (and a gathered charge as an orb in its element)
    const aura = F => F ? { ...F.st, ...(F.charging ? { charge: (typeof ARTS !== 'undefined' && ARTS[F.charging]?.element) || F.element || 'neutral' } : {}) } : {}
    this.scene.setStatus('you', M && !after ? aura(M.you) : {}); this.scene.setStatus('foe', M && !after ? aura(M.foe) : {})
    const foeName = P ? S.name : `${prof?.name || ''}${prec?.mood === 'cub' ? ' cub' : ''}`
    const sig = [hp, qi, fHp, JSON.stringify(M?.you.st), JSON.stringify(M?.foe.st), M?.you.charging, M?.foe.charging, foeName, this.step, foeGone, S?.feud].join('|')
    if (sig === this._plateSig) return
    this._plateSig = sig
    const fate = after && S?.foeGone ? `<span class="cb-fate">${esc(S.foeGone)}</span>` : ''
    const tier = P ? `<div class="cb-tier">${fate}<span class="cb-realm">${esc(stageShortName(S.stage))}</span>${S.feud ? `<span class="cb-feud ${S.feud}">${esc(FEUD_TEXT[S.feud])}</span>` : ''}</div>`
      : prof ? `<div class="cb-tier">${fate}<span class="tier-chip tier-${prof.tier.id}">${esc(prof.tier.name)}</span>${prof.variant ? '<span class="tier-chip tier-variant">Rare colour</span>' : ''}</div>` : ''
    this.plates.innerHTML = `
      <div class="cb-plate you"><div class="cb-pn">${esc((S?.youName ?? s.name) || 'You')}</div>
        <div class="cb-hp${hp < 30 ? ' low' : ''}" title="Your Health (${hp} / ${hpMax}): wounds here are real"><span data-icon="health"></span><span class="cb-hpbar"><b style="width:${Math.min(100, hp / hpMax * 100)}%"></b></span><span class="cb-hpv">${hp}</span></div>
        ${M ? `<div class="cb-qi" title="Combat Qi: each move costs some; +${M.you.regen} a turn, more from Circulate and parries"><span data-icon="qi"></span><span class="cb-qibar"><b style="width:${Math.round(100 * qi / pool)}%"></b></span><span class="cb-hpv">${qi}</span></div>` : ''}
        <div class="cb-sts">${chips(M?.you)}</div></div>
      <div class="cb-plate foe${foeGone}"><div class="cb-pn">${el ? `<span class="cb-el el-${el}" title="${esc(ART_ELEMENTS[el].name)}${P ? ': their root' : ''}">${Icon(ART_ELEMENTS[el].icon)}</span>` : ''}${esc(foeName)}</div>
        <div class="cb-hp foe" title="${P ? 'Their strength' : 'Its strength'}"><span class="cb-hpv">${Math.ceil(fHp)}</span><span class="cb-hpbar"><b style="width:${Math.round(100 * fHp / fMax)}%"></b></span></div>
        <div class="cb-sts">${chips(M?.foe)}</div>
        ${tier}</div>`
    Icon.hydrate?.(this.plates)
  }

  // ── Step 1: prepare (beasts) — the estimate per stance, its element + known moves, your parry window ──
  _prepare() {
    const pv = this.gs.beastFightPreview(this.encId), esc = this.h.esc
    if (!pv) return `<div class="cb-line">It has gone.</div>`
    const pct = v => v < 0.01 ? '<1%' : v > 0.99 ? '>99%' : `${Math.round(v * 100)}%`
    const T = pv.prof.type, el = pv.element, s = this.gs.get(), mode = s.arts?.parryMode || 'normal'
    const moves = pv.moves ? pv.moves.map(id => this.gs._mbArt(id)).filter(Boolean).map(a => `<span class="cb-mv-tag el-${a.element || el}">${esc(a.name)}</span>`).join('') : ''
    const read = pv.habitsKnown
      ? `<div class="cb-read"><span class="cb-k">How it fights</span> ${esc(pv.hint)}. <span class="cb-habits">Its arts: ${moves}</span></div>`
      : `<div class="cb-read"><span class="cb-k">How it fights</span> Unknown. You have never fought one of these; after this battle you will know its arts.</div>`
    const elLine = `<div class="cb-read"><span class="cb-k">Element</span><span class="cb-el el-${el}">${Icon(ART_ELEMENTS[el].icon)}</span>${esc(ART_ELEMENTS[el].name)}${this._matchupHint(el)}</div>`
    const rec = pv.record.fought ? `<div class="cb-rec">Your record: fought ${pv.record.fought} · won ${pv.record.won} · slain ${pv.record.slain}${pv.record.spared ? ` · spared ${pv.record.spared}` : ''}</div>` : ''
    const mood = pv.mood === 'grateful' ? '<div class="cb-mood good">This one remembers your mercy. It would come to you without a talisman.</div>'
      : pv.mood === 'vengeful' ? '<div class="cb-mood bad">This one remembers you, and it has grown stronger since.</div>'
      : pv.mood === 'cub' ? '<div class="cb-mood">Only a cub. Its mother is dead.</div>' : ''
    const S = pv.stance.slay, D = pv.stance.drive
    const card = (id, title, sub, st, lines) => `
      <button class="cb-stance ${id}${S.canDie && id === 'slay' ? ' deadly' : ''}" data-stance="${id}" ${pv.locked ? 'disabled' : ''}>
        <span class="cb-st-h"><span class="cb-st-n">${title}</span><span class="cb-st-p">${pct(st.chance)}<small>to win (estimate)</small></span></span>
        <span class="cb-st-sub">${sub}</span>
        ${lines.map(l => `<span class="cb-st-l${l.warn ? ' warn' : ''}">${l.t}</span>`).join('')}
      </button>`
    const parry = `<div class="cb-parry-mode"><span class="cb-k">Parry window</span>${['normal', 'wide', 'off'].map(v => `<button class="pack-chip${mode === v ? ' active' : ''}" data-parrymode="${v}">${{ normal: 'Normal', wide: 'Wide', off: 'Off' }[v]}</button>`).join('')}
      <span class="cb-note">${mode === 'off' ? 'No parry prompts: every blow lands.' : `When it strikes, a ring closes on you: press Parry (Space) as it meets the mark for no damage and +${MOVE_COMBAT.parryQi} Qi.${mode === 'wide' ? ' Wide: a gentler window.' : ''}`}</span></div>`
    return `
      <div class="cb-prep">
        <div class="cb-intro">${esc(pv.prof.variant ? pv.prof.variant.name : T?.name || pv.name)}, ${esc(BEAST_NATURE_TEXT[pv.nature] || 'a wild beast')}. ${esc(T?.desc || '')}</div>
        ${mood}${elLine}${read}${rec}
        <div class="cb-stances">
          ${card('slay', 'Slay it', 'It fights for its life. Take its body, and perhaps its art.', S, [
            { t: `Its blows: about −${S.wound} Health each, before parrying` },
            { t: `You would lose about ${S.hurt} Health (${Math.round(S.turns)} turns)` },
            S.canDie ? { t: `This could kill you: about ${pct(S.died)} of such fights end in your death.`, warn: true } : { t: `Health ${Math.ceil(pv.health)}: a loss here would not kill you` },
          ])}
          ${card('drive', 'Drive it off', 'It fights to get away. Safer, and no spoils.', D, [
            { t: `Its blows: about −${D.wound} Health each (half)` },
            { t: `Thrown down at ${MOVE_COMBAT.driveThrownHp} Health, never killed` },
            { t: 'Win, and bind it or let it go' },
          ])}
        </div>
        ${parry}
        <div class="cb-foot">
          <button class="cb-why" data-bd="beastfight:${esc(this.encId)}:slay"><span data-icon="why"></span>Why these odds</button>
          ${pv.locked ? `<span class="cb-lock"><span data-icon="lock"></span>${esc(COMBAT_REASON[pv.locked] || 'You cannot fight now.')}</span>` : `<span class="cb-note">The estimate assumes you parry ${pct(S.parryRate)} (${mode === 'off' ? 'parrying is off' : 'your recent rate'}). Nothing happens until you choose.</span>`}
        </div>
      </div>`
  }
  _matchupHint(el) {
    const mine = (this.gs.get().arts?.loadout?.moves || []).filter(Boolean).map(id => ARTS[id]).filter(a => a && a.element && a.element !== 'neutral')
    const over = mine.filter(a => ELEMENT_OVERCOMES[a.element] === el), under = mine.filter(a => ELEMENT_OVERCOMES[el] === a.element)
    return over.length ? ` · <span class="up">${this.h.esc(over[0].name)} overcomes it</span>` : under.length ? ` · <span class="down">it resists your ${this.h.esc(under[0].name)}</span>` : ''
  }

  // ── Step 2: the fight (Phase 42b; people since 1.14a) — your 4 moves, Circulate, Palm Strike, Retreat / Yield; or the
  // parry prompt. A person's panel adds what you know of them (their root, the arts you have seen, how they fight), the
  // feud, your record together and the stakes (to the death / until one yields, the Arena purse, the bracket).
  _fight() {
    const info = this.gs.fightInfo(), esc = this.h.esc
    if (!info || !info.m) return this._result()
    const B = info.kind === 'boss', P = info.kind !== 'beast' && !B   // v1 add-on: a boss plays like a beast (Retreat, no scouting)
    const m = info.m, name = P ? (info.opp?.given || 'Your opponent') : info.opp.name, mv = this.gs.fightMoves()
    const The = P ? name : `The ${name}`
    const pct = v => `${Math.round(v * 100)}%`
    const lastTurn = m.lines.length ? m.lines[m.lines.length - 1].turn : 0
    const turnLines = m.lines.filter(l => l.turn === lastTurn).slice(-3)
    const last = !m.lines.length ? `<div class="cb-last">${P ? `${esc(name)} faces you${info.lethal ? ', and one of you will not walk away' : ''}.` : `The ${esc(name)} circles you.`} Choose your move: each costs combat Qi, and there are no cooldowns.</div>`
      : `<div class="cb-last">${turnLines.map(l => `<div class="cb-ll ${l.tone}">${esc(l.text)}</div>`).join('')}</div>`
    // an incoming blow: the prompt is on the field (#combat-parry); your moves stay in view, locked until it is answered
    const pend = !!m.pending
    const btn = (x, i) => {
      if (!x) return `<div class="cb-mv empty">Empty slot<small>equip an art in Path → Arts</small></div>`
      const lock = pend ? 'parry first' : x.lock === 'qi' ? `needs ${x.cost} Qi` : x.lock === 'sealed' ? 'sealed' : x.lock === 'charging' ? 'gathering' : ''
      const tag = x.matchup === 'over' ? '<span class="cb-mt up">overcomes</span>' : x.matchup === 'under' ? '<span class="cb-mt down">resisted</span>' : ''
      const pw = x.power ? `${x.hits > 1 ? `${x.power}×${x.hits}` : x.power} power` : { ward: 'ward', counter: 'counter', buff: 'buff', heal: 'heal', hex: 'hex' }[x.type] || x.type
      return `<button class="cb-mv el-${x.element || 'neutral'}${x.release ? ' release' : ''}" data-move="${x.id}" ${lock ? 'disabled' : ''} title="${esc(x.desc || '')}">
        <span class="cb-mv-h"><span class="cb-el">${Icon(ART_ELEMENTS[x.element || 'neutral'].icon)}</span><span class="cb-mv-n">${x.release ? 'Release ' : ''}${esc(x.name)}</span>${i != null ? `<kbd>${i + 1}</kbd>` : ''}</span>
        <span class="cb-mv-m">${x.release ? 'lands now · no cost' : `${x.cost} Qi · ${pw}`}${x.affinity ? ' · your root' : ''}</span>
        <span class="cb-mv-f">${lock ? `<span class="cb-mt lock">${lock}</span>` : tag}</span></button>`
    }
    const incoming = pend ? `<div class="cb-last down">${esc(The)} uses <b>${esc(m.pending.name)}</b>${m.pending.hits > 1 ? ` · ${m.pending.hits} hits` : ''}. ${this.gs.get().arts?.parryTaught ? 'Parry it on the field, or take the blow.' : 'Press Parry on the field (or Space) as the ring closes on you. Too soon and you are open; too late and it lands.'}</div>` : ''
    const grid = `<div class="cb-moves${pend ? ' locked' : ''}">${mv.slots.map((x, i) => btn(x, i)).join('')}</div>`
    const bi = B ? info.boss : null, ROMAN = ['I', 'II', 'III', 'IV']
    const bossNote = bi ? (bi.egg ? `The egg hatches in ${bi.egg} turn${bi.egg === 1 ? '' : 's'}: break it first.` : bi.split ? `Two faces: your blows find the true one ${Math.round(bi.read * 100)}% of the time.` : bi.stolen ? `It wields your ${ARTS[bi.stolen]?.name || 'art'} against you.` : bi.phases[bi.phase + 1] ? `Next: ${bi.phases[bi.phase + 1].name} at ${Math.round(bi.phases[bi.phase + 1].at * 100)}%.` : '') : ''
    const note = P ? '' : B ? '<span class="cb-flex"></span>'
      : `<span class="cb-note cb-flex">${m.foe.element ? `It is ${ART_ELEMENTS[m.foe.element].name}.` : ''} ${info.habitsKnown ? esc(info.hint) + '.' : 'Its arts are unknown until it uses them.'}</span>`
    const out = P
      ? `<button class="cb-retreat" data-tac="yield" ${pend ? 'disabled' : ''}><span data-icon="yield"></span>Yield<small>${info.lethal ? `accepted ~${pct(info.yieldAccept)} · ` : ''}${esc(PERSON_FIGHT_YIELD[info.kind] || 'you lose')}</small></button>`
      : `<button class="cb-retreat" data-tac="retreat" ${pend ? 'disabled' : ''}><span data-icon="yield"></span>Retreat<small>${B ? 'no parting blow; it rests, you learn' : 'it gets a parting blow'}</small></button>`
    const extra = `<div class="cb-row2">
        <button class="cb-retreat qi" data-move="circulate" ${mv.charging || pend ? 'disabled' : ''}>Circulate<small>+${MOVE_COMBAT.circulateQi} Qi, no attack</small></button>
        ${mv.palm ? `<button class="cb-retreat qi" data-move="palm_strike" ${mv.palm.lock || pend ? 'disabled' : ''}>Palm Strike<small>free · ${mv.palm.power} power</small></button>` : ''}
        ${P ? '<span class="cb-flex"></span>' : note}${out}
      </div>`
    const older = m.lines.filter(l => l.turn !== lastTurn).slice(-6).reverse()
    const log = older.map(l => `<li class="${l.tone}"><span class="cb-lr">${l.turn}</span>${esc(l.text)}</li>`).join('')
    let foot
    if (P) {
      const ar = info.arena, br = info.bracket
      const stake = ar ? (info.lethal ? `Blood match: to the death, ×${typeof ARENA_BLOOD_MULT !== 'undefined' ? ARENA_BLOOD_MULT : 3} purse` : 'Until one yields: lose, and keep half the purse')
        : info.lethal ? 'To the death: the loser does not rise' : `Until one yields: at ${PERSON_FIGHT.yieldThrownHp} Health you are beaten`
      const yieldAt = !info.lethal ? `<span class="cb-note">They yield at ${Math.round(m.foe.max * PERSON_FIGHT.yieldFoeFrac)}</span>` : ''
      const side = ar ? `<span class="cb-note">Purse ${this.h.fmt ? this.h.fmt(ar.purse) : ar.purse} · a win adds <b class="gold">+${this.h.fmt ? this.h.fmt(ar.prize) : ar.prize}</b>${ar.champion ? ' · the champion' : ''}</span>`
        : br ? `<span class="cb-note">Round ${br.round} · ${br.left} left${br.lethal ? '' : ` · blood at the last ${br.bloodTo}`}</span>` : ''
      foot = `<div class="cb-foot"><span class="cb-chip${info.lethal ? ' lethal' : ''}">${stake}</span>${side}${ar || br ? '' : yieldAt}
        <span class="cb-note">Turn ${m.turn}${br ? '' : ' · keys 1–4, C'}</span>
        <button class="cb-why" data-bd="personfight:${esc(info.opp?.id || '')}:${info.kind}"><span data-icon="why"></span>Why</button></div>`
    } else if (B) foot = `<div class="cb-foot"><span class="cb-chip">Never death: at 1 Health you are thrown down</span>${bi.learn ? `<span class="cb-note up">+${Math.round(bi.learn * 100)}% might: you know its rhythm</span>` : ''}
        <span class="cb-note">Turn ${m.turn} · keys 1–4, C to circulate</span></div>`
    else foot = `<div class="cb-foot"><span class="cb-chip${info.stance === 'slay' ? ' lethal' : ''}">${info.stance === 'slay' ? 'Slay: a loss can kill you' : 'Drive off: never below 1 Health'}</span>
        <span class="cb-note">Turn ${m.turn} · keys 1–4, C to circulate</span>
        <button class="cb-why" data-bd="beastfight:${esc(info.beast.encId)}:${info.stance}"><span data-icon="why"></span>Why</button></div>`
    const bossLine = B ? `<div class="cb-boss-line"><b>${ROMAN[bi.phase]} · ${esc(bi.phases[bi.phase].name)}</b> ${esc(bossNote)}</div>` : ''
    return `${pend ? incoming : last}${bossLine}${grid}${extra}${P ? this._scout(info, name) : ''}
      ${foot}
      ${log ? `<ol class="cb-log lines">${log}</ol>` : ''}`
  }
  // 1.14a: what you know of a person you fight — their root's element (always), the arts you have seen them use (the rest
  // stay "?"), how they fight + how often they parry (once you have fought them); the feud and your record; and, before the
  // first move, the parry window (beasts choose it on the prepare step; people open straight on the fight).
  _scout(info, who) {
    const esc = this.h.esc, sc = info.scout, m = info.m
    if (!sc) return ''
    const el = ART_ELEMENTS[sc.element] || ART_ELEMENTS.neutral
    const arts = sc.moves.map(x => x.seen ? `<span class="cb-mv-tag el-${ARTS[x.id]?.element || 'neutral'}">${esc(ARTS[x.id]?.name || x.id)}</span>` : '<span class="cb-mv-tag unseen" title="Not yet seen: it shows once they use it on you">?</span>').join('')
    const how = info.habitsKnown ? `${esc(sc.hint)}; ${sc.parryWord}.` : 'How they fight shows once you have crossed blades.'
    // 1.14b: a rival who trained against you fights as the counter element (their root stays what it was)
    const rootEl = ART_ELEMENTS[sc.rootElement] || el
    const who2 = sc.counter ? `<span class="cb-el el-${sc.rootElement}">${Icon(rootEl.icon)}</span>${esc(rootEl.name)} root, <span class="down">${sc.rootElement === sc.counter.el ? `honed` : `trained in ${esc(el.name)}`} against your ${esc(ART_ELEMENTS[sc.counter.vs].name)}</span>`
      : `<span class="cb-el el-${sc.element}">${Icon(el.icon)}</span>${esc(el.name)} root`
    const read = `<div class="cb-read sm cb-scout"><span class="cb-k">What you know</span>${who2}${this._matchupHint(sc.element)} · <span class="cb-habits">Arts ${sc.seen} of ${sc.total} seen: ${arts}</span> <span class="cb-hint">${how}</span></div>`
    const rec = info.record, feud = info.feud
    const recLine = rec.fought ? `<div class="cb-rec">You and ${esc(who)}: fought ${rec.fought} · you won ${rec.youWon} · they won ${rec.theyWon}${rec.spared ? ` · spared ${rec.spared}` : ''}${rec.humbled ? ` · humbled ${rec.humbled}` : ''}</div>` : ''
    const feudLine = feud === 'grudge' ? `<div class="cb-mood bad">${esc(who)} holds a grudge against you: they hit harder, and will not easily let you yield.</div>`
      : feud === 'debt' ? `<div class="cb-mood good">${esc(who)} owes you. They would more readily accept your yield.</div>` : ''
    const mode = this.gs.get().arts?.parryMode || 'normal'
    const parry = m.turn === 1 && !m.lines.length && !m.pending
      ? `<div class="cb-parry-mode"><span class="cb-k">Parry window</span>${['normal', 'wide', 'off'].map(v => `<button class="pack-chip${mode === v ? ' active' : ''}" data-parrymode="${v}">${{ normal: 'Normal', wide: 'Wide', off: 'Off' }[v]}</button>`).join('')}
          <span class="cb-note">${mode === 'off' ? 'No parry prompts: every blow lands.' : `A ring closes on you when they strike: Parry (Space) on the mark for no damage and +${MOVE_COMBAT.parryQi} Qi.`}</span></div>` : ''
    return `${read}${feudLine}${recLine}${parry}`
  }
  // The parry prompt on the field, between you and it (user 2026-09-29: don't cover the moves). The closing ring is drawn on
  // the canvas around you (BattleScene.telegraph); the button glows when the window is open. Reduced motion: a filling bar.
  _renderParry() {
    const fi = this.gs.get()?.family?.fight, p = this.step === 'fight' ? fi?.m?.pending : null
    if (!p) { this.parryEl.classList.add('hidden'); this.parryEl.innerHTML = ''; this._parryKey = null; return }
    const key = `${fi.m.turn}:${p.id}`
    if (key === this._parryKey) return                            // keep the live pips / feedback
    this._parryKey = key
    const q = this.qte, done = q ? q.results.length : 0, esc = this.h.esc
    const tut = !this.gs.get().arts?.parryTaught
    this.parryEl.innerHTML = `
      <div class="cb-parry-h"><b>${esc(p.name)}</b>${p.hits > 1 ? ` · ${p.hits} hits` : ''}${p.type === 'charge' ? ' · slow, heavy' : ''}</div>
      <div class="cb-parry-ring${this.h.settings().reducedMotion ? ' calm' : ''}"><i class="cb-ring-bar"><b></b></i></div>
      <button class="cb-parry-btn" data-parry>Parry<small>Space</small></button>
      ${p.hits > 1 ? `<div class="cb-parry-hits">${Array.from({ length: p.hits }, (_, i) => `<i class="${i < done ? (q.results[i] ? 'ok' : 'no') : ''}"></i>`).join('')}</div>` : ''}
      <div class="cb-parry-fb" aria-live="polite"></div>`
    this.parryEl.classList.remove('flash', 'miss', 'hot')
    this.parryEl.classList.toggle('tut', tut)
    this.parryEl.classList.remove('hidden')
  }

  // The parry QTE: each hit gets a window of p.windowMs centred on its moment of impact
  _startParry(p) {
    if (this.qte && !this.qte.sent) return
    const tut = !this.gs.get().arts?.parryTaught
    const lead = (MOVE_COMBAT.parryLeadMs[0] + Math.random() * (MOVE_COMBAT.parryLeadMs[1] - MOVE_COMBAT.parryLeadMs[0])) * (tut ? MOVE_COMBAT.parryTutorialLead : 1)
    const t0 = performance.now()
    this.qte = { p, t0, results: [], due: Array.from({ length: p.hits }, (_, i) => t0 + lead + i * (MOVE_COMBAT.parryGapMs + p.windowMs)), lead, w: p.windowMs }
    const q = this.qte
    const loop = () => {
      if (this.qte !== q || q.sent) return
      const now = performance.now(), i = q.results.length
      if (i < q.p.hits && now > q.due[i] + q.w / 2) this._parryHit(false, 'It lands')
      const el = this.parryEl.querySelector('.cb-parry-ring'), j = q.results.length
      if (el && j < q.p.hits) {
        const start = j === 0 ? q.t0 : q.due[j - 1] + q.w / 2, span = q.due[j] - start
        const k = Math.max(0, (q.due[j] - now) / span)
        el.querySelector('.cb-ring-bar b').style.width = `${Math.min(100, (1 - k) * 100).toFixed(1)}%`
        el.classList.toggle('hot', Math.abs(now - q.due[j]) <= q.w / 2)
        this.parryEl.classList.toggle('hot', Math.abs(now - q.due[j]) <= q.w / 2)
      }
      if (j < q.p.hits) {                                          // 1.13b: the same ring, on the field
        const start = j === 0 ? q.t0 : q.due[j - 1] + q.w / 2
        this.scene.telegraph({ k: Math.max(0, (q.due[j] - now) / (q.due[j] - start)), hot: Math.abs(now - q.due[j]) <= q.w / 2, el: q.p.element })
      }
      else this.scene.telegraph(null)
      if (!q.sent) requestAnimationFrame(loop)
      else this.scene.telegraph(null)
    }
    requestAnimationFrame(loop)
  }
  _parryHit(ok, text) {
    const q = this.qte
    if (!q || q.sent || q.results.length >= q.p.hits) return
    q.results.push(ok)
    const fb = this.parryEl.querySelector('.cb-parry-fb')
    if (fb) { fb.textContent = text; fb.className = 'cb-parry-fb ' + (ok ? 'ok' : 'no') }
    const pip = this.parryEl.querySelectorAll('.cb-parry-hits i')[q.results.length - 1]
    if (pip) pip.className = ok ? 'ok' : 'no'
    const pe = this.parryEl
    pe.classList.remove('flash', 'miss', 'hot'); void pe.offsetWidth; pe.classList.add(ok ? 'flash' : 'miss')
    if (q.results.length >= q.p.hits) { q.sent = true; this.scene.telegraph(null); setTimeout(() => this._sendParry(q), 380) }
  }
  _parryPress() {
    const q = this.qte
    if (!q || q.sent) return
    const now = performance.now(), i = q.results.length, d = q.due[i]
    if (Math.abs(now - d) <= q.w / 2) { this.scene.parryFlash(true); this._parryHit(true, 'Parried!') }
    else if (now < d - q.w / 2) { this.scene.parryFlash(false); this._parryHit(false, 'Too soon') }
  }
  _sendParry(q) {
    if (this.qte === q) this.qte = null
    const name = this._name()
    const r = this._settle(() => this.gs.fightParry(q.results))
    this._afterMove(r, name)
  }
  // A step-down bout can end and start the next in one call: hold the plates on this bout until the result card is up
  _settle(fn) {
    this._settling = this.mode === 'person' && this.gs.get().family?.fight?.kind === 'stepdown'
    try { return fn() } finally { this._settling = false }
  }
  // Play a turn's events on the scene, then move the page on (the end choice, the result, or the next parry)
  _afterMove(r, name) {
    if (!r.ok) return this.render()
    this.lockUntil = performance.now() + (this.h.settings().reducedMotion ? 250 : 500)
    for (const ev of r.events || []) this.scene.play(this._sceneEv(ev))
    if (r.over === 'won') { this.scene.play({ type: 'won' }); this.step = 'end' }
    if (this.mode === 'boss' && r.shift > (this._shift || 0) && !r.over && !r.done) {   // v1 add-on: a boss changes
      this._shift = r.shift
      const bi = this.gs.fightInfo()?.boss
      if (bi) { this.h.flash(bi.hatched && !bi.egg && bi.phase === 2 ? 'The egg hatches.' : bi.phases[bi.phase].name, 'special') }
    }
    if (r.done) (this.mode === 'person' ? this._endedPerson(r, name) : this._ended(r, name))
    this.render()
    if (r.pending) this._startParry(r.pending)
  }
  _sceneEv(ev) {
    const atk = MOVE_ATTACKS.includes(ev.type) && !ev.gather
    const t = ev.hits?.length > 1 ? 'feint' : 'press'
    // 1.13b: what the scene needs to draw the art by its element (battle-scene.js → _fxFront)
    const fx = { side: ev.side, id: ev.id, el: ev.element || null, type: ev.type, hits: ev.hits?.length || 0, mask: (ev.hits || []).map(h => h.parried ? 0 : 1),
      parried: ev.parried || 0, em: ev.hits?.find(h => h.em)?.em || 1, crit: !!ev.hits?.some(h => h.crit), status: ev.status || null, heal: ev.heal || 0,
      gather: !!ev.gather, release: !!ev.release, dazed: !!ev.dazed, claw: ev.side === 'foe' && ev.id === 'beast_rake' }
    if (ev.side === 'you') {
      if (atk) return { type: 'ex', you: t, won: ev.total > 0, foeDmg: ev.total || 0, nohit: !ev.total, fx }
      return { type: 'ex', you: ev.type === 'hex' ? 'feint' : 'guard', won: !!ev.status, nohit: !ev.status && !ev.hits?.length, foeDmg: ev.hits?.[0]?.dmg || 0, fx }
    }
    if (atk) return { type: 'ex', them: 'press', you: ev.parried ? 'guard' : null, won: !ev.total, dmg: ev.total || 0, nohit: !ev.total, fx }
    return { type: 'ex', them: ev.type === 'hex' ? 'feint' : 'guard', won: !ev.status, nohit: !ev.status, dmg: ev.hits?.[0]?.dmg || 0, fx }
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
    const bind = `<button class="cb-end bind" data-end="bind"${sel ? ` data-grade="${sel}"` : ''} ${bindLock ? 'disabled' : ''}><span class="cb-st-n">Bind it</span><span class="cb-st-sub">${bindSub}</span><span class="cb-st-l">Joins you at Lv.${typeof BEAST_BOUND_LEVEL !== 'undefined' ? BEAST_BOUND_LEVEL : 2}</span><span class="cb-st-l">no karma change</span>${bindLock ? `<span class="cb-st-l warn">${bindLock}</span>` : ''}</button>`
    // Karma, with why (a man-eater's death is a good deed; a guardian's weighs on you) and what actually applies at 0 / 100
    const kWhy = (v, why) => {
      const now = this.gs.get().karma ?? 50, eff = Math.max(0, Math.min(100, now + v)) - now
      const cap = eff !== v ? ` (you are at ${now >= 100 ? 'the most karma, 100' : now <= 0 ? 'the least karma, 0' : Math.round(now)}: ${eff ? `${eff > 0 ? '+' : ''}${Math.round(eff * 10) / 10} applies` : 'no change'})` : ''
      return `<span class="cb-st-l${v < 0 ? ' warn' : ''}">${k(v)}${why ? ` · ${why}` : ''}${cap}</span>`
    }
    const WHY = {
      finish: ch.cub ? 'it is a cub' : { fell: 'a man-eater: ending it is a good deed', benign: 'a guardian beast: its death weighs on you', wild: 'a wild beast' }[ch.nature],
      spare: { fell: 'a man-eater let loose will hunt again', benign: 'mercy to a guardian', wild: 'mercy' }[ch.nature],
    }
    const opts = ch.ids.includes('finish')
      ? opt('finish', 'Finish it', ch.cub ? 'It is only a cub.' : 'Take what its body holds.', `<span class="cb-st-l">${esc(loot)}</span>${kWhy(ch.finishKarma, WHY.finish)}`)
        + opt('spare', 'Spare it', 'Let it limp away. It may come back one day.', kWhy(ch.spareKarma, WHY.spare)) + bind
      : opt('flee', 'Let it flee', 'It runs, and may come back one day.', kWhy(ch.spareKarma, WHY.spare)) + bind
    return `<div class="cb-last up">The ${esc(name)} is down. What happens now is yours to decide.</div>${gradeRow}<div class="cb-ends${ch.ids.length === 3 ? ' three' : ''}">${opts}</div>`
  }

  // ── v1 add-on (docs/systems/bosses.md): a legendary boss — the prepare step, its plates + phase bar, the end choice ──
  _prepareBoss() {
    const id = this.bossId, pv = this.gs.bossFightPreview(id), info = (this.gs.bossInfo() || []).find(b => b.id === id), esc = this.h.esc
    if (!pv || !info) return `<div class="cb-line">It is gone.</div>`
    const pct = v => v < 0.01 ? '<1%' : v > 0.99 ? '>99%' : `${Math.round(v * 100)}%`, mode = this.gs.get().arts?.parryMode || 'normal'
    const ROMAN = ['I', 'II', 'III', 'IV']
    const phases = info.phases.map((p, i) => `<li><b>${ROMAN[i]} · ${esc(p.name)}</b> ${esc(p.text)}</li>`).join('')
    const LOCK = { life: 'Not in this life.', stage: 'Your realm is not yet high enough.', won: 'You beat it this life. It wakes again in your next.', rest: `It rests (${this.h.fmtTime?.(info.restLeft) || ''}).`, busy: COMBAT_REASON.busy, wounded: COMBAT_REASON.wounded }
    const parry = `<div class="cb-parry-mode"><span class="cb-k">Parry window</span>${['normal', 'wide', 'off'].map(v => `<button class="pack-chip${mode === v ? ' active' : ''}" data-parrymode="${v}">${{ normal: 'Normal', wide: 'Wide', off: 'Off' }[v]}</button>`).join('')}</div>`
    return `
      <div class="cb-prep">
        <div class="cb-intro">${esc(info.name)}. ${esc(info.lore)}</div>
        <div class="cb-mood">${esc(info.line)}</div>
        <div class="cb-read"><span class="cb-k">How it fights</span><ol class="boss-phases cb">${phases}</ol></div>
        <div class="cb-stances one">
          <button class="cb-stance boss" data-boss-start="${esc(id)}" ${pv.lock ? 'disabled' : ''}>
            <span class="cb-st-h"><span class="cb-st-n">Face it</span><span class="cb-st-p">${pct(pv.chance)}<small>to win (estimate)</small></span></span>
            <span class="cb-st-sub">A fight of about ${Math.round(pv.turns)} turns. You would lose about ${pv.hurt} Health.</span>
            <span class="cb-st-l">Win: ${esc(info.technique.known ? 'its drop and renown' : `${info.technique.name}, kept by your soul in every life`)}</span>
            <span class="cb-st-l">Lose: never death. You are left at ${pv.lossHealth} Health, and it rests ${Math.round(pv.restSec / 60)}:00 (real time).</span>
            ${pv.learn ? `<span class="cb-st-l up">You know its rhythm: +${Math.round(pv.learn * 100)}% might from ${info.tries} past ${info.tries === 1 ? 'try' : 'tries'}</span>` : `<span class="cb-st-l">Each failed try teaches you its rhythm (+${Math.round(BOSS_FIGHT.learnPerTry * 100)}% might, up to +${Math.round(BOSS_FIGHT.learnMax * 100)}%)</span>`}
          </button>
        </div>
        ${parry}
        <div class="cb-foot">
          ${pv.lock ? `<span class="cb-lock"><span data-icon="lock"></span>${esc(LOCK[pv.lock] || 'You cannot fight now.')}</span>` : `<span class="cb-note">The estimate assumes you parry ${pct(pv.parryRate)} and plays its phases. Retreat is open every turn. Nothing happens until you choose.</span>`}
        </div>
      </div>`
  }
  _platesBoss() {
    const s = this.gs.get(), fi = s.family?.fight, esc = this.h.esc, def = BOSSES[this.bossId]
    const live = fi?.kind === 'boss' && this.step !== 'result' ? fi : null, going = live && !live.over
    if (live) this.snap = { m: JSON.parse(JSON.stringify(live.m)), foeGone: this.snap?.foeGone || null }
    const M = live?.m || this.snap?.m || null, pv = !M ? this.gs.bossFightPreview(this.bossId) : null
    const hp = Math.max(0, Math.ceil(s.health ?? 100)), hpMax = this.gs.maxHealth?.() || 100
    const fHp = M ? Math.max(0, this.snap?.foeGone === 'slain' ? 0 : M.foe.hp) : pv?.foeHp || 0, fMax = M ? M.foe.max : fHp || 1
    const B = M?.boss || { phase: 0 }, el = M?.foe.element || def.element
    const qi = M ? Math.round(M.you.qi) : null, pool = M ? M.you.pool : 0
    const chips = F => Object.entries(F?.st || {}).map(([k, n]) => `<span class="cb-st ${k}" title="${esc(ART_STATUS[k].desc)}">${esc(ART_STATUS[k].name)} <b>${n}</b></span>`).join('')
      + (F?.charging ? `<span class="cb-st charge">Gathering</span>` : '')
    const aura = F => F ? { ...F.st, ...(F.charging ? { charge: ARTS[F.charging]?.element || F.element || 'neutral' } : {}) } : {}
    this.scene.setStatus('you', M && live ? aura(M.you) : {}); this.scene.setStatus('foe', M && live ? aura(M.foe) : {})
    const sig = [hp, qi, fHp, B.phase, B.egg, B.split, JSON.stringify(M?.you.st), JSON.stringify(M?.foe.st), this.step].join('|')
    if (sig === this._plateSig) return
    this._plateSig = sig
    // the phase bar: a mark at each phase's threshold, the current phase named (labels, not colour alone)
    const marks = def.phases.slice(1).map(p => `<i class="boss-mark" style="left:${Math.round(p.at * 100)}%" title="${esc(p.name)} at ${Math.round(p.at * 100)}%"></i>`).join('')
    const ROMAN = ['I', 'II', 'III', 'IV']
    this.plates.innerHTML = `
      <div class="cb-plate you"><div class="cb-pn">${esc(s.name || 'You')}</div>
        <div class="cb-hp${hp < 30 ? ' low' : ''}" title="Your Health (${hp} / ${hpMax})"><span data-icon="health"></span><span class="cb-hpbar"><b style="width:${Math.min(100, hp / hpMax * 100)}%"></b></span><span class="cb-hpv">${hp}</span></div>
        ${M ? `<div class="cb-qi" title="Combat Qi"><span data-icon="qi"></span><span class="cb-qibar"><b style="width:${Math.round(100 * qi / pool)}%"></b></span><span class="cb-hpv">${qi}</span></div>` : ''}
        <div class="cb-sts">${chips(M?.you)}</div></div>
      <div class="cb-plate foe boss"><div class="cb-pn"><span class="cb-el el-${el}">${Icon(ART_ELEMENTS[el].icon)}</span>${esc(def.short)}</div>
        <div class="cb-hp foe" title="Its strength · the marks are where it changes"><span class="cb-hpv">${Math.ceil(fHp)}</span><span class="cb-hpbar boss-bar"><b style="width:${Math.round(100 * fHp / fMax)}%"></b>${marks}</span></div>
        <div class="cb-sts"><span class="cb-st phase">${ROMAN[B.phase]} · ${esc(def.phases[B.phase].name)}</span>${B.egg && going ? `<span class="cb-st egg">Hatches in <b>${B.egg}</b></span>` : ''}${B.split && going ? `<span class="cb-st split">Two faces · ${Math.round(B.read * 100)}% true</span>` : ''}${chips(M?.foe)}</div>
        <div class="cb-tier"><span class="tier-chip tier-legendary">Legendary</span></div></div>`
    Icon.hydrate?.(this.plates)
  }
  _endBoss() {
    const ch = this.gs.bossFightChoices(), esc = this.h.esc
    if (!ch) return this._result()
    const tech = `<span class="cb-st-l good">${ch.technique.isNew ? `You learn ${esc(ch.technique.name)}: your soul keeps it in every life` : `${esc(ch.technique.name)} is already yours`}</span>`
    return `<div class="cb-last up">The ${esc(ch.name)} is down. What you take from it is yours to decide.</div><div class="cb-ends">
      <button class="cb-end finish" data-end="heart"><span class="cb-st-n">Take its heart</span><span class="cb-st-sub">${esc(ch.heart.drop)}, and renown under Heaven.</span>${tech}<span class="cb-st-l">+${ch.heart.renown} renown${ch.heart.recipe ? ` · the formula for the ${esc(ch.heart.recipe)}` : ''}</span></button>
      <button class="cb-end spare" data-end="mercy"><span class="cb-st-n">Let it return to the wild</span><span class="cb-st-sub">No drop. It will remember, and come back stronger, and richer.</span>${tech}<span class="cb-st-l">+${ch.mercy.karma} karma · +${ch.mercy.honour} Honour</span></button>
    </div>`
  }
  _finishBoss(choice) {
    const name = this._name(), r = this.gs.bossFightFinish(choice)
    if (!r.ok) return this.render()
    this.scene.play({ type: choice === 'heart' ? 'finish' : 'spare' })
    if (this.snap) this.snap.foeGone = choice === 'heart' ? 'slain' : 'spared'
    const learned = r.learned ? ` ${r.technique} is yours now: your soul will carry it into every life.` : ''
    this.result = { name, tone: choice === 'heart' ? 'gold' : 'jade', karma: choice === 'mercy' ? BOSS_FIGHT.mercyKarma : 0, loot: r.drop || null,
      head: choice === 'heart' ? `You take the ${name}'s heart` : `You let the ${name} go`,
      text: (choice === 'heart' ? `It will wake again in your next life.${r.recipe ? ` You learn the formula for the ${r.recipe}.` : ''}` : 'It looks back once before it goes. It will remember.') + learned }
    this.step = 'result'
    this.render()
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
    const FIN = { duel: 'End it. Your spouse does not rise.', challenge: 'End it, and take the head seat over their body.', defend: 'End it. Your seat is secure.', stepdown: 'End it. One fewer between you and the seat.', arena: 'End it on the sand. The crowd roars.', slaughter: 'End it. They do not rise, and the road keeps the body.', sectmaster: 'End it, and take the master’s seat over their body.', spar: 'End it.', road: 'End it. They do not rise, and their kin will learn who did it.' }
    const SPR = { duel: 'Lower your blade. They leave you, and live.', challenge: 'Let them live. You take the head seat all the same.', defend: 'Let them live. Your seat is secure.', stepdown: 'Let them live. They are out of the contest.', arena: 'Let them live. The crowd will remember your mercy.', slaughter: 'Lower your blade. They get up and go.', sectmaster: 'Let them live. They go into exile, and may raise a sect of their own.', spar: 'Let them up.', road: 'Lower your blade. They will remember it.' }
    const quiet = ch.quietYears ? `${ch.quietYears[0]}–${ch.quietYears[1]}` : ''
    // 1.14b: what each choice brings in arts — a debtor raised teaches you one of theirs; a body may hold its manual
    const manual = ch.finishManual ? `<span class="cb-st-l good">their manual: ${Math.round(ch.finishManual * 100)}% chance</span>` : ''
    const taught = ch.teach ? `<span class="cb-st-l good">in thanks, they teach you one of their arts</span>` : ''
    const opts = ch.lethal
      ? opt('finish', 'Finish them', FIN[ch.kind] || 'End it.', `<span class="cb-st-l warn">${esc(who)} dies; ${ch.kind === 'road' ? 'their kin may come for you' : 'no one is left to remember it'}</span>${manual}<span class="cb-st-l${ch.karma.finish < 0 ? ' warn' : ''}">${k(ch.karma.finish) || 'no karma change'}</span>`)
        + opt('spare', 'Spare them', SPR[ch.kind] || 'Let them live.', `${react(ch.reaction.spare)}<span class="cb-st-l">${k(ch.karma.spare)}</span>`)
      : ch.kind === 'road'   // Phase 28 4.9: no clan watches on the road; they remember it themselves
        ? opt('raise', 'Raise them up', 'Offer your hand. They will remember the mercy.', `${react(ch.reaction.raise)}${taught}<span class="cb-st-l good">they will think better of you</span>`)
          + opt('humble', 'Humble them', 'Leave them in the dust.', `${react(ch.reaction.humble)}<span class="cb-st-l warn">they will hate you for it; a proud heart may swear to repay it</span>`)
      : opt('raise', 'Raise them up', `Offer your hand before the ${ch.arena ? 'crowd' : 'clan'}. Mercy, seen by all.`,
          `${react(ch.reaction.raise)}${taught}<span class="cb-st-l">${ch.arena ? 'One who owes you may repay it one day' : 'A debtor never challenges you'}</span>`)
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
    if (this.qte && e.target.closest('[data-parry-zone]') && !e.target.closest('button')) return this._parryPress()   // tap anywhere on the prompt
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
    if (t.dataset.bossStart) {                                      // v1 add-on: face a legendary boss
      const r = this.gs.startBossFight(t.dataset.bossStart)
      if (!r.ok) { this.h.flash(COMBAT_REASON[r.reason] || 'You cannot face it now.', 'negative'); return this.render() }
      this._shift = 0
      this.step = 'fight'
      return this.render()
    }
    if (t.dataset.end && this.mode === 'boss') return this._finishBoss(t.dataset.end)
    if (t.dataset.stance) {
      const r = this.gs.startBeastFight(this.encId, t.dataset.stance)
      if (!r.ok) { this.h.flash(COMBAT_REASON[r.reason] || 'You cannot fight now.', 'negative'); return this.render() }
      this.step = 'fight'
      return this.render()
    }
    if (t.dataset.parry != null) return this._parryPress()
    if (t.dataset.parrymode) { this.gs.setParryMode(t.dataset.parrymode); return this.render() }
    if (t.dataset.move) {                                         // Phase 42b: one of your moves
      if (performance.now() < this.lockUntil || this.qte) return
      const name = this._name()
      const r = this._settle(() => this.gs.fightMove(t.dataset.move))
      if (!r.ok) { this.h.flash({ qi: 'Not enough combat Qi. Circulate, or use a cheaper move.', sealed: 'That art is sealed.', charging: 'You are gathering a charge: release it.' }[r.reason] || 'Not now.', 'negative'); return this.render() }
      return this._afterMove(r, name)
    }
    if (t.dataset.tac) {                                          // Retreat (a beast) / Yield (a person): the only non-move ends
      if (performance.now() < this.lockUntil || this.qte) return
      const name = this._name()
      const r = this._settle(() => this.gs.fightExchange(t.dataset.tac))
      if (!r.ok) return this.render()
      if (r.refused) this.h.flash(`${name} refuses your yield. This ends with one of you.`, 'negative')
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
    if (this.mode === 'boss') {                                    // v1 add-on: never death — thrown down, or broken away
      this.scene.play({ type: r.retreated ? 'retreat' : 'lost' })
      this.result = { name, tone: r.retreated ? 'dim' : 'red', head: r.retreated ? 'You break away' : `The ${name} throws you down`,
        text: `${r.retreated ? 'No parting blow: it lets you go.' : 'You live, barely.'} It rests ${Math.round(BOSS_FIGHT.restSec / 60)} minutes before it will face you again, and you know its rhythm a little better now.` }
      this.step = 'result'
      return
    }
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
        slaughter: `${name}'s blade is faster. You die on the road, far from home.`,
        road: `${name}'s blade is faster. You die on the road, far from home.`,
        sectmaster: `${name}'s blade is faster. You die on the floor of the Sect Hall you meant to rule.` }
      return this._fall(name, T[this.kind] || 'Your path ends here.')
    }
    this.scene.play({ type: r.yielded ? 'retreat' : 'lost' })
    const T = r.yielded
      ? { duel: `You throw down your sword. ${name} spares you, and walks out of your life.`, challenge: 'You yield. The head keeps the seat; heal before you try again.',
          defend: `You yield. ${name} takes the head seat.`, stepdown: 'You yield, and step out of the contest.', slaughter: `You yield. ${name} lets you live, and walks on.`,
          sectmaster: `You yield. ${name} keeps the seat and strips you to Elder. Heal before you try again.`,
          spar: `You bow out. ${name} returns the bow.` }
      : { challenge: `${name} beats you down and lets you live. Heal before you try again.`, defend: `${name} beats you before the whole clan. They take the head seat.`,
          stepdown: `${name} beats you. You are out of the contest.`, slaughter: `${name} beats you down and lets you live. You limp home.`,
          sectmaster: `${name} beats you down before the whole sect, lets you live, and strips you to Elder.`,
          spar: `${name} puts you on your back, and helps you up.` }
    this.result = { name, tone: r.yielded ? 'dim' : 'red', head: r.yielded ? 'You yield' : `${name} stands over you`, text: T[this.kind] || 'You are beaten, but alive.' }
    if (this.kind === 'road') this.result.text = this.gs.get().road?.last?.text || this.result.text   // Phase 28 4.9: what they took
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
    this.snapOpp = this._opp()                                     // (1.14b: read their counter after the fight is gone)
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
      sectmaster: { finish: 'The master’s seat is yours, over their body. The sect is yours to rule.', spare: 'The sect is yours. They walk down the mountain into exile.',
        raise: 'The sect is yours. They leave in exile, owing you their life.', humble: 'The sect is yours. They crawl from the hall, and will not forget it.' },
      spar: { raise: 'You help them up. Their sect saw the courtesy.', humble: 'You leave them in the dust of their own courtyard.' },
    }
    if (kind === 'road') TXT.road = { [choice]: this.gs.get().road?.last?.text || '' }   // Phase 28 4.9: the card's own ending (a find won, a feud sworn)
    const karma = choice === 'spare' ? (typeof SPARE_KARMA !== 'undefined' ? SPARE_KARMA : 0) : choice === 'finish' && kind === 'arena' ? (typeof ARENA_KILL_KARMA !== 'undefined' ? ARENA_KILL_KARMA : 0) : 0
    // 1.14b: an art that came of it (taught by a debtor, or a manual on the body)
    const artLine = r.art && ARTS[r.art] ? (choice === 'raise' ? ` In thanks, ${name} writes out ${ARTS[r.art].name} for you: the manual is in your pack, study it in Path → Arts.` : ` On the body: the ${ARTS[r.art].name} manual, now in your pack.`) : ''
    const counter = r.feud === 'grudge' && this.snapOpp?.counter
    const counterLine = counter ? ` Word will come that they train in ${ART_ELEMENTS[counter.el].name} arts, against your ${ART_ELEMENTS[counter.vs].name}.` : ''
    this.result = { name, tone: choice === 'finish' ? 'gold' : 'jade', karma, head: HEAD[choice], text: `${TXT[kind]?.[choice] || ''} ${feud}${artLine}${counterLine}`.trim(), art: r.art || null }
    if (kind === 'arena') {                                          // A6-3b: what the win put in the purse; walk away or fight on
      const L = this.gs.get().arena?.last
      if (L?.won) Object.assign(this.result, { arena: true, purse: L.purse, gain: L.gain, streak: L.streak,
        head: L.title ? `${L.title}` : this.result.head,
        text: `${L.title ? `You beat the champion. ` : ''}${this.result.text} +${this.h.fmt(L.gain)} to the purse: ${this.h.fmt(L.purse)} now, ${L.streak} win${L.streak === 1 ? '' : 's'} in a row.${L.champLeft ? '' : ' The champion will answer you.'}${L.recipe ? ` The champion's formula is yours — you can now craft ${L.recipe} in Pack → Craft.` : ''}` })
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
