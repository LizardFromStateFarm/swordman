// CombatView — the battle page (Phase 35 / roadmap A6-1, docs/systems/combat.md). A full-window overlay: the ink field
// (BattleScene, renderer/engine/battle-scene.js) with a name plate per side (vigor pips, your live Health) above a
// control panel that walks through three steps:
//   prepare  what you're facing, known habits, and a card per stance (Slay / Drive off) with odds, wound per blow and the
//            worst case; "why these odds" opens the beastfight breakdown card. Nothing is committed until you pick one.
//   fight    Press / Guard / Feint with this exchange's odds, Retreat with its parting blow, the last exchange in words
//            and a short log. Every exchange is your move (the scene animates it).
//   end      after a won battle: finish / spare / bind (Slay) or let it flee / bind (Drive), with loot + karma shown;
//            then the result card and Leave the field. A loss or retreat goes straight to the result.
// The fight itself lives in game-state (f.fight kind 'beast'); closing the page mid-fight leaves it waiting (the
// attention strip reopens it). h: { esc, flash, zoom, settings }. DOM: #combat-overlay (index.html).

const COMBAT_REASON = {
  busy: 'Another fight is underway. Finish it first.',
  wounded: `You are too badly hurt to fight. Rest until your Health is ${typeof BEAST_FIGHT_MIN_HEALTH !== 'undefined' ? BEAST_FIGHT_MIN_HEALTH : 15} or more.`,
  gone: 'It has gone.',
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
    this.step = null                   // 'prepare' | 'fight' | 'end' | 'result'
    this.encId = null
    this.result = null                 // the last end-of-battle summary shown on the result card
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
    if (fi?.kind === 'beast') return this.resume()
    this.encId = encId
    this.result = null; this.snap = null
    this._show()
    this._setupScene(this.gs.get().beastEncounters.find(e => e.id === encId))
    this.step = 'prepare'
    this.render()
  }

  // A battle underway (attention item, or a reload mid-fight)
  resume() {
    const fi = this.gs.get().family?.fight
    if (!fi || fi.kind !== 'beast') return
    this.encId = fi.beast.encId
    this._show()
    this._setupScene(fi.beast)
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
    if (fi?.kind === 'beast' && !fi.over) this.h.flash('The beast waits. Return to the fight from the strip above.', 'neutral')
  }

  _show() {
    this.ov.classList.remove('hidden')
    this.box.style.setProperty('--cz', this.h.zoom())
    this.scene.geo = null
  }

  _setupScene(rec) {
    if (!rec) return
    const s = this.gs.get(), st = CULTIVATION_STAGES[s.stageIndex] || CULTIVATION_STAGES[0]
    const youState = typeof INK_ART !== 'undefined' && INK_ART[st.spriteState] ? st.spriteState : 'meditating'
    const prof = this.gs.beastProfile(rec), set = this.h.settings()
    this.scene.setup({ youState, youColor: st.color, foeArt: prof.art, foeGlow: INK_BEASTS[prof.art]?.glow,
      reducedMotion: !!set.reducedMotion, speed: set.animSpeed || 1 })
    this.scene.start()
  }

  // Cheap enough to call on every state change while open (Health regen, the fight moving on)
  refresh() { if (this.isOpen()) this._plates() }

  render() {
    if (!this.isOpen()) return
    this._plates()
    const s = this.gs.get()
    const fi = s.family?.fight
    if (this.step === 'fight' && fi?.over === 'won') this.step = 'end'
    const html = this.step === 'prepare' ? this._prepare()
      : this.step === 'fight' ? this._fight()
      : this.step === 'end' ? this._end()
      : this._result()
    this.panel.innerHTML = html
    document.getElementById('combat-title').textContent = this._title()
    document.getElementById('combat-close').textContent = this.step === 'fight' ? 'Step back' : 'Leave'
    document.getElementById('combat-close').title = this.step === 'fight' ? 'Pause: the beast waits for you (no blow taken). Retreat ends the fight.' : 'Leave the battle page'
    document.getElementById('combat-close').classList.toggle('hidden', this.step === 'died' || this.step === 'end')
  }

  _title() {
    const n = this._name()
    return this.step === 'prepare' ? `Face the ${n}` : this.step === 'result' || this.step === 'died' ? 'After the Battle' : `Battle · ${n}`
  }
  _name() {
    const s = this.gs.get(), fi = s.family?.fight
    const rec = fi?.kind === 'beast' ? fi.beast : (s.beastEncounters || []).find(e => e.id === this.encId)
    return rec ? this.gs.beastProfile(rec).name + (rec.mood === 'cub' ? ' cub' : '') : (this.result?.name || 'beast')
  }

  // ── Name plates: vigor pips (exchanges left to lose), your Health ──
  _plates() {
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

  // ── Step 1: prepare ──
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

  // ── Step 2: the fight ──
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
      <div class="cb-tacs">${Object.entries(FIGHT_TACTICS).map(([id, t], i) => `
        <button class="cb-tac${last?.you === id ? ' picked' : ''}" data-tac="${id}">
          <span class="cb-g">${Icon.g(t.glyph)}</span>
          <span class="cb-t"><span class="cb-n">${t.name}<kbd>${i + 1}</kbd></span><span class="cb-b">beats ${FIGHT_TACTICS[t.beats].name}</span></span>
          <span class="cb-pct">${pct(info.tactics[id])}<small>this exchange</small></span>
        </button>`).join('')}</div>
      <div class="cb-row2">
        <div class="cb-read sm"><span class="cb-k">Its habits</span> ${read}</div>
        <button class="cb-retreat" data-tac="retreat"><span data-icon="yield"></span>Retreat<small>parting blow −${info.wound}</small></button>
      </div>
      <div class="cb-foot"><span class="cb-chip${info.stance === 'slay' ? ' lethal' : ''}">${info.stance === 'slay' ? 'Slay: a loss can kill you' : 'Drive off: never below 1 Health'}</span>
        <button class="cb-why" data-bd="beastfight:${esc(info.beast.encId)}:${info.stance}"><span data-icon="why"></span>Why</button></div>
      ${log ? `<ol class="cb-log">${log}</ol>` : ''}`
  }

  // ── Step 3: the end choice ──
  _end() {
    const ch = this.gs.beastFightChoices(), esc = this.h.esc
    if (!ch) return this._result()
    const name = this._name()
    const loot = ch.loot.map(d => `${d.lo === d.hi ? d.lo : `${d.lo}–${d.hi}`} ${d.name}${d.chance < 1 ? ` (${Math.round(d.chance * 100)}%)` : ''}`).join(', ')
    const k = v => v > 0 ? `+${v} karma` : v < 0 ? `${v} karma` : 'no karma'
    const opt = (id, title, sub, extra = '', lock = null) => `
      <button class="cb-end ${id}" data-end="${id}" ${lock ? 'disabled' : ''}><span class="cb-st-n">${title}</span><span class="cb-st-sub">${sub}</span>${extra}${lock ? `<span class="cb-st-l warn">${lock}</span>` : ''}</button>`
    const bindLock = ch.bindLock === 'max_beasts' ? 'Your companions are full. Release one first.' : ch.bindLock === 'no_talisman' ? 'You need a Beast Taming Talisman.' : null
    const bind = opt('bind', 'Bind it', ch.bindFree ? 'It bows its head to you. No talisman needed.' : `Tame it with a talisman (you carry ${ch.talismans}).`,
      `<span class="cb-st-l">Joins you at Lv.${typeof BEAST_BOUND_LEVEL !== 'undefined' ? BEAST_BOUND_LEVEL : 2}</span>`, bindLock)
    const opts = ch.ids.includes('finish')
      ? opt('finish', 'Finish it', ch.cub ? 'It is only a cub.' : 'Take what its body holds.', `<span class="cb-st-l">${esc(loot)}</span><span class="cb-st-l${ch.finishKarma < 0 ? ' warn' : ''}">${k(ch.finishKarma)}</span>`)
        + opt('spare', 'Spare it', 'Let it limp away. It may come back one day.', `<span class="cb-st-l">${k(ch.spareKarma)}</span>`) + bind
      : opt('flee', 'Let it flee', 'It runs, and may come back one day.', `<span class="cb-st-l">${k(ch.spareKarma)}</span>`) + bind
    return `<div class="cb-last up">The ${esc(name)} is down. What happens now is yours to decide.</div><div class="cb-ends${ch.ids.length === 3 ? ' three' : ''}">${opts}</div>`
  }

  // ── Result card ──
  _result() {
    const r = this.result, esc = this.h.esc
    if (!r) return `<div class="cb-line">The field is quiet.</div><div class="cb-foot"><button class="cb-leave" data-leave>Leave the field</button></div>`
    const loot = r.loot ? Object.entries(r.loot).map(([id, n]) => `<span class="cb-loot">${n} ${esc(ITEMS[id]?.name || id)}</span>`).join('') : ''
    return `<div class="cb-res ${r.tone}"><div class="cb-res-h">${esc(r.head)}</div><div class="cb-res-t">${esc(r.text)}</div>
      ${loot ? `<div class="cb-loots">${loot}</div>` : ''}${r.karma ? `<div class="cb-res-k">${r.karma > 0 ? '+' : ''}${r.karma} karma</div>` : ''}</div>
      ${this.step === 'died' ? '' : '<div class="cb-foot"><button class="cb-leave" data-leave>Leave the field</button></div>'}`
  }

  _click(e) {
    const t = e.target.closest('button')
    if (!t || t.disabled || t.dataset.bd != null) return
    if (t.dataset.leave != null) return this.close()
    if (t.dataset.stance) {
      const r = this.gs.startBeastFight(this.encId, t.dataset.stance)
      if (!r.ok) { this.h.flash(COMBAT_REASON[r.reason] || 'You cannot fight now.', 'negative'); return this.render() }
      this.step = 'fight'
      return this.render()
    }
    if (t.dataset.tac) {
      if (performance.now() < this.lockUntil) return
      const name = this._name()
      const r = this.gs.fightExchange(t.dataset.tac)
      if (!r.ok) return this.render()
      this.lockUntil = performance.now() + (this.h.settings().reducedMotion ? 250 : 650)
      if (r.exchange) this.scene.play({ type: 'ex', ...r.exchange })
      if (r.over === 'won') { this.scene.play({ type: 'won' }); this.step = 'end' }
      if (r.done) this._ended(r, name)
      return this.render()
    }
    if (t.dataset.end) {
      const name = this._name()
      const r = this.gs.beastFightFinish(t.dataset.end)
      if (!r.ok) { this.h.flash({ max_beasts: 'Your companions are full.', no_talisman: 'You need a Beast Taming Talisman.' }[r.reason] || 'Not now.', 'negative'); return this.render() }
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
    if (r.outcome === 'died') {
      if (this.snap) this.snap.dead = true
      this.scene.play({ type: 'died' })
      this.step = 'died'
      this.result = { name, tone: 'red', head: 'You fall', text: `The ${name} was stronger. Your path ends on this field.` }
      // hold until the fall has played (BattleScene.END_SECONDS.died), then hand over to the death moment + card
      setTimeout(() => { this.ov.classList.add('hidden'); this.scene.stop(); this.step = null }, (BattleScene.END_SECONDS.died + 0.4) * 1000)
      return
    }
    if (r.retreated) {
      this.scene.play({ type: 'retreat' })
      this.result = { name, tone: 'dim', head: 'You break away', text: `Its parting blow cost you ${r.dmg} Health. The ${name} still prowls Roam → Beasts.` }
    } else {
      this.scene.play({ type: 'lost' })
      this.result = { name, tone: 'red', head: `The ${name} throws you down`, text: 'You crawl away wounded. It still prowls Roam → Beasts; heal, and it can be faced again.' }
    }
    this.step = 'result'
  }
}

if (typeof module !== 'undefined') module.exports = { CombatView }
