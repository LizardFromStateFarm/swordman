// BodyView — Path → Body (Phase 14, docs/systems/body-constitution.md → "UX pass"). Left: the body (tier seal, XP bar with
// the trial mark + the bank cap, what the tier gives: max Health, regen, failed-breakthrough Qi kept, fight power), then
// whatever needs you (the ordeal's crisis, the tier trial), the tempering underway, the two mini-games, scars + taint and
// Auto-Temper. Right: every tempering method by group with its cost (have / need), time and XP, or why it can't start.
// With Body Beyond the Body (bosses.md), "Your other self" tempers too: its card on the left (its tempering, its ordeal
// peak, It Lingers, "On its own"), and an "Other self" button on each method it can take (2026-10-05).
// State comes from gameState.bodyInfo() / temperingList() / minigameInfo(); every change goes through gameState.
// h: { esc, flash, fmt, fmtTime, confirm, play(kind) }.

const BodyView = {
  _wired: false,

  realm(i) { return typeof stageShortName === 'function' ? stageShortName(i) : 'stage ' + i },
  pct(x) { return Math.round(x * 100) + '%' },
  // 300 → "5 min", 7200 → "2 h", 5400 → "1 h 30"
  dur(secs) { const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min` },

  render(s, el, gs, h) {
    this.gs = gs; this.h = h
    const b = gs.bodyInfo(), mg = gs.minigameInfo(), list = gs.temperingList()
    this.ci = gs.cloneInfo?.() || null
    el.innerHTML = `<div class="fam-view body-view">
      <div class="fam-col">${this._hero(b)}${this._crisis(b)}${this._cloneCrisis()}${this._trial(b, s)}${this._active(b)}${this._clone(list)}${this._games(mg)}${this._marks(b)}${this._auto(s, list)}</div>
      <div class="fam-col">${this._methods(list, s)}${this._history(b)}</div></div>`
    if (!this._wired) {
      this._wired = true
      el.addEventListener('click', e => this._click(e))
      el.addEventListener('change', e => {
        const p = e.target.closest('[data-bd-pick]'); if (p) this.gs.setAutomation('autoTemperId', p.value || null)
        const c = e.target.closest('[data-bd-cpick]'); if (c) this.gs.setCloneAutoTemper(c.value || null)
      })
    }
  },

  // A live countdown without a re-render. Returns true when something finished (the caller re-renders).
  tickInPlace(el, fmtTime) {
    let due = false
    el.querySelectorAll('[data-bd-left]').forEach(n => {
      const left = Math.max(0, Math.ceil((+n.dataset.bdLeft - Date.now()) / 1000))
      n.textContent = left ? fmtTime(left).replace(/ /g, ' ') : 'now'
      if (!left) due = true
    })
    el.querySelectorAll('[data-bd-prog]').forEach(n => {
      const [a, z] = n.dataset.bdProg.split(':').map(Number)
      n.style.width = Math.max(0, Math.min(100, (Date.now() - a) / (z - a) * 100)) + '%'
    })
    return due
  },

  _hero(b) {
    const h = this.h, t = b.def, next = b.next
    const span = next ? next.xp - t.xp : 1, fill = next ? Math.min(1, (b.xp - t.xp) / span) : 1
    const capFrac = next ? Math.min(1.6, (b.cap - t.xp) / span) : 1
    const banked = next && b.xp > next.xp ? b.xp - next.xp : 0
    const chip = (bd, icon, k, v, title) => `<span class="bd-chip"${bd ? ` data-bd="${bd}"` : ''} title="${h.esc(title)}"><i data-icon="${icon}"></i>${k} <b>${v}</b></span>`
    const capNote = !next ? 'The body can go no higher. It is forged as heaven allows.'
      : b.trial.ready ? `Ready for the trial. Training banks up to ${h.fmt(b.cap)} XP meanwhile; past that it is lost.`
      : `${h.fmt(next.xp - b.xp)} XP to the ${next.name}.`
    return `<div class="fam-card bd-hero tier-${t.id.toLowerCase()}">
      <div class="bd-top">
        <div class="bd-seal${b.trial.ready ? ' ready' : ''}" title="Body tier ${t.id} of S"><span>${t.id}</span></div>
        <div class="bd-name"><div class="bd-tier">${h.esc(t.name)}</div>
          <div class="bd-line">Every life begins in a Frail Body. What it becomes is up to you.</div></div>
      </div>
      <div class="bd-xp" title="${h.fmt(b.xp)} body XP">
        <div class="bd-xp-track"><div class="bd-xp-fill" style="width:${(fill / Math.max(1, capFrac)) * 100}%"></div>
          ${next ? `<i class="bd-xp-mark" style="left:${(1 / Math.max(1, capFrac)) * 100}%" title="The trial mark: ${h.fmt(next.xp)} XP"></i>` : ''}
          ${banked ? `<div class="bd-xp-bank" style="left:${(1 / capFrac) * 100}%;width:${(banked / span / capFrac) * 100}%"></div>` : ''}</div>
        <div class="bd-xp-nums"><span><b>${h.fmt(b.xp)}</b> body XP</span><span>${next ? `Trial for ${next.id} at ${h.fmt(next.xp)} XP` : 'S · the peak'}</span></div>
        <div class="bd-xp-note">${capNote}</div>
      </div>
      <div class="bd-chips">
        ${chip('health', 'health', 'Max Health', b.maxHealth, 'Your Health can rise this high. Every damage source stays the same size, so a bigger body is a real cushion.')}
        ${chip('health', 'rise', 'Regen', `+1 / ${Math.round(b.regenSec)}s`, 'Health comes back this fast, open or closed.')}
        ${chip('', 'breakthrough', 'Failed BT keeps', `+${this.pct(b.btKeep)} Qi`, 'A failed breakthrough keeps this much more of your Qi (on top of the usual half).')}
        ${b.power ? chip('', 'duel', 'Fight power', `+${b.power}`, 'Added to your power in duels, challenges, the Arena and beast fights.') : ''}
        ${b.btBonus ? chip('', 'lightning', 'Thunder-tempered', `+${this.pct(b.btBonus)} BT`, 'Breakthrough chance from enduring Thunder Peak this life.') : ''}
        ${b.rootBoost ? chip('', ART_ELEMENTS[b.rootBoost.element]?.icon || 'qi', `${ART_ELEMENTS[b.rootBoost.element]?.name}-root`, `×${b.rootBoost.mult} · <span data-bd-left="${b.rootBoost.until}">${h.fmtTime(b.rootBoost.left)}</span>`, 'Your root drinks what the ordeal left in you.') : ''}
      </div></div>`
  },

  _crisis(b) {
    const c = b.crisis, h = this.h
    if (!c) return ''
    const o = c.odds
    return `<div class="fam-card bd-crisis">
      <div class="bd-card-title"><i data-icon="alert"></i>${h.esc(c.name)}: the peak</div>
      <div class="bd-text">Your body screams. The ordeal waits on your answer, and nothing is lost while it waits.</div>
      <div class="fa-grid bd-choices">
        ${this._tile('endure', 'lightning', 'Endure', `${h.fmt(c.xp)} XP${c.bonus ? ` · ${h.esc(c.bonus)}` : ''}<br><span class="bd-odds">${this.pct(o.chance)} clean</span> · else loses ${c.hurt[0]}–${c.hurt[1]} Health, ${this.pct(c.scarChance)} a ${c.grave ? '<b class="down">grave</b> ' : ''}scar`, '', 'grave')}
        ${this._tile('ease', 'yield', 'Ease off', `${h.fmt(c.easeXp)} XP · no risk, no bonus`)}
        ${this._tile('qi', 'qi', 'Draw on your Qi', `${h.fmt(c.xp)} XP${c.bonus ? ' + the bonus' : ''} · safe · costs ${h.fmt(c.qiCost)} Qi`, c.qiOk ? '' : `Needs ${h.fmt(c.qiCost)} Qi`)}
      </div><button class="bd-why" data-bd="ordeal"><i data-icon="why"></i>Why ${this.pct(o.chance)} to endure cleanly?</button></div>`
  },

  _trial(b, s) {
    const t = b.trial, h = this.h
    if (!t.ready) return ''
    const m = t.marrow, w = t.bitter, have = s.inventory.beast_core || 0
    const mLock = s.spiritStones < m.stones ? `Need ${h.fmt(m.stones - s.spiritStones)} more stones` : have < m.cores ? `Need ${m.cores - have} more Beast Core${m.cores - have === 1 ? '' : 's'}` : ''
    return `<div class="fam-card bd-trial">
      <div class="bd-card-title"><i data-icon="rise"></i>The tier trial: ${h.esc(t.next.id)} · ${h.esc(t.next.name)}</div>
      <div class="bd-text">The bar is full; the body will not change on its own. Choose how to break it open. A failure costs ${t.failHealth} Health and ${this.pct(1 - t.failKeep)} of your progress.</div>
      <div class="fa-grid bd-choices">
        ${this._tile('marrow', 'pill', 'Temper the marrow', `${h.fmt(m.stones)} stones + ${m.cores} Beast Cores · <span class="bd-odds">${this.pct(m.chance)}</span>`, mLock)}
        ${this._tile('bitter', 'broken', 'The bitter way', `−${w.health} Health · <span class="bd-odds">${this.pct(w.chance)}</span> · ${this.pct(w.scarChance)} a scar`, w.ok ? '' : `Needs more than ${w.health} Health`, '', 'grave')}
      </div>
      <div class="bd-foot">Or keep training: the XP banks toward it.</div></div>`
  },

  _active(b) {
    const a = b.active, h = this.h
    if (!a || a.crisis) return ''
    const m = a.method
    return `<div class="fam-sec bd-active"><div class="fam-sec-title"><span>Tempering</span><span class="fam-count" data-bd-left="${a.endsAt}">${h.fmtTime(a.left)}</span></div>
      <div class="bd-act-name">${h.esc(m.name)}</div>
      <div class="bd-prog"><div data-bd-prog="${a.startedAt}:${a.endsAt}" style="width:${Math.min(100, (Date.now() - a.startedAt) / (a.endsAt - a.startedAt) * 100)}%"></div></div>
      <div class="bd-act-meta">+${h.fmt(a.xp)} body XP${m.qiMult && m.qiMult < 1 ? ` · <span class="down">Qi/s ×${m.qiMult} while it runs</span>` : ''}${m.group === 'ordeal' ? ' · stops at its peak for your answer' : ''}</div>
      <button class="fa-quiet" data-bd-act="cancel">Break off (what it cost is spent)</button></div>`
  },

  _games(mg) {
    const h = this.h, pips = n => `<span class="ch-charges">${'<b class="on"></b>'.repeat(n)}${'<b></b>'.repeat(mg.max - n)}</span>`
    const g = (kind, icon, name, what, row) => `<button class="fa-btn bd-game" data-mg-open="${kind}" ${row.charges || row.waiting ? '' : 'disabled'}>
      <span class="fa-g">${Icon.g(icon)}</span><span class="fa-t"><span class="fa-n">${name} ${pips(row.charges)}</span>
      <span class="fa-e">${what}${row.charges || row.waiting ? '' : ` · next in <span data-bd-left="${Date.now() + row.nextIn * 1000}">${h.fmtTime(row.nextIn)}</span>`}</span></span></button>`
    const st = mg.strikes, fl = mg.flow
    return `<div class="fam-sec bd-games"><div class="fam-sec-title"><span>Practice</span><span class="fam-count">optional</span></div>
      <div class="fa-grid">
        ${g('strikes', 'duel', 'Tempering Strikes', `Timing · up to +${h.fmt(st.perfectXp)} body XP${st.canCut ? ` or ${this.pct(st.cutMax)} off ${h.esc(st.cutTarget)}` : ''}`, st)}
        ${g('flow', 'vein', 'Meridian Flow', `${fl.waiting ? 'Resume your puzzle' : 'Puzzle, no clock'} · +${h.fmt(fl.qi)} Qi${fl.tired ? ' · tired this hour' : ''}`, fl)}
      </div><div class="bd-foot">A charge returns every 30 minutes, even while you are away. Play when you like; nothing is lost if you don't.</div></div>`
  },

  _marks(b) {
    const h = this.h
    if (!b.scars.length && !b.taint) return ''
    const scars = b.scars.map((x, i) => `<div class="bd-scar"><span class="bd-scar-n">${h.esc(x.def?.name || x.id)}</span>
      <span class="bd-scar-e">${x.def?.maxHealth ? `${Math.round(x.def.maxHealth * 100)}% max Health` : ''}${x.def?.regen ? ` · ${Math.round(x.def.regen * 100)}% regen` : ''} · from ${h.esc(x.cause || 'an ordeal')}</span>
      <button class="fa-quiet" data-bd-act="mend" data-i="${i}" ${b.mendHave ? '' : 'disabled'} title="A ${h.esc(ITEMS[SCAR_MEND_ITEM]?.name || 'Golden Marrow Pill')} mends one scar">Mend (${b.mendHave})</button></div>`).join('')
    const taint = b.taint ? `<div class="bd-taint"><span>Taint <b class="down">${b.taint} / ${b.taintMax}</b></span><span>−${b.taint * ORDEAL_CRISIS.perTaint}% on every ordeal; each finished drill draws ${TAINT_CLEANSE_PER_DRILL} out.${b.taint >= ORDEAL_CRISIS.graveTaint ? ' A failed ordeal now leaves a <b class="down">grave</b> scar.' : ''}</span></div>` : ''
    return `<div class="fam-sec bd-marks"><div class="fam-sec-title"><span>What the body carries</span></div>${scars}${taint}</div>`
  },

  _auto(s, list) {
    const gs = this.gs, h = this.h
    if (!gs.automationUnlocked('autoTemper')) return `<div class="bd-foot bd-auto-lock"><i data-icon="lock"></i> Auto-Temper opens at ${h.esc(AUTOMATION_UNLOCKS.autoTemper.label)}: it repeats a safe drill while you idle.</div>`
    const a = s.automation, id = a.autoTemperId || s.body.last, m = TEMPERING_METHODS.find(x => x.id === id)
    const safe = list.filter(x => (x.group === 'drill' || x.group === 'spirit') && x.reason !== 'stage' && x.reason !== 'locked')
    return `<div class="fam-sec bd-auto"><div class="fam-sec-title"><span>Auto-Temper</span><span class="fam-count">Idle Mode only</span></div>
      <div class="bd-auto-row auto-row"><div class="set-seg"><button class="set-opt${a.autoTemper ? ' active is-on' : ''}" data-bd-act="auto" data-on="1">On</button><button class="set-opt${a.autoTemper ? '' : ' active'}" data-bd-act="auto" data-on="0">Off</button></div>
        <select class="bd-auto-pick" data-bd-pick="1" aria-label="Which drill Auto-Temper repeats"><option value="">Your last drill${s.body.last ? ` (${h.esc(TEMPERING_METHODS.find(x => x.id === s.body.last)?.name || '')})` : ''}</option>
          ${safe.map(x => `<option value="${x.id}"${a.autoTemperId === x.id ? ' selected' : ''}>${h.esc(x.name)}</option>`).join('')}</select></div>
      <div class="bd-foot">Repeats ${m ? h.esc(m.name) : 'your last drill'} whenever it ends and you can pay for it. It never starts an ordeal or answers one.</div></div>`
  },

  _methods(list, s) {
    const h = this.h, out = []
    for (const [g, def] of Object.entries(TEMPERING_GROUPS)) {
      const rows = list.filter(x => x.group === g)
      if (!rows.length) continue
      out.push(`<section class="fam-sec bd-group bd-g-${g}"><div class="fam-sec-title"><span>${def.name}</span>${def.note ? `<span class="fam-count">${def.note}</span>` : ''}</div>
        <div class="bd-methods">${rows.map(x => this._method(x, s)).join('')}</div></section>`)
    }
    return out.join('')
  },
  _method(x, s) {
    const h = this.h
    const cost = x.cost.length ? x.cost.map(c => `<span class="bd-cost${c.have < c.n ? ' short' : ''}" title="You have ${c.have}">${c.n} ${h.esc(c.name)}</span>`).join(' ')
      : x.blood ? `<span class="bd-cost short">−${x.blood.health} Health · ${x.blood.karma} karma · +${x.blood.taint} taint</span>` : '<span class="bd-cost free">free</span>'
    const lock = { locked: x.lockText || 'Locked', stage: `Opens at ${this.realm(x.minStage)}`, busy: 'Another tempering is underway', clone_same: 'Your other self is doing this one',
      items: 'Not enough to pay for it', no_beast: 'Needs a tamed spirit beast', once: 'Done this life: once is all a body can bear',
      health: 'Too wounded to bleed for it' }[x.reason] || ''
    const extra = x.beast ? ` · sparring ${h.esc(x.beast)}` : x.onEndure ? ` · endure: ${h.esc(this._endureShort(x.onEndure))}` : ''
    return `<div class="bd-method${x.ok ? '' : ' locked'}${x.reason === 'busy' ? ' busy' : ''}">
      <div class="bd-m-top"><span class="bd-m-name">${h.esc(x.name)}</span><span class="bd-m-xp">+${h.fmt(x.xp)} XP</span></div>
      <div class="bd-m-desc">${h.esc(x.desc)}</div>
      <div class="bd-m-meta"><span class="bd-time">${this.dur(x.secs)}</span> · ${cost}${extra}</div>
      ${this._mActs(x, lock)}</div>`
  },
  // Begin (you) and, when your other self is free, its own button (or why it can't take this one)
  _mActs(x, lock) {
    const h = this.h
    const mine = x.ok ? `<button class="fa-btn bd-begin${x.group === 'demonic' ? ' grave' : ''}" data-bd-act="begin" data-id="${x.id}"><span class="fa-g">${Icon.g(x.group === 'demonic' ? 'skull' : x.group === 'ordeal' ? 'lightning' : 'play')}</span><span class="fa-t"><span class="fa-n">Begin</span></span></button>`
      : x.reason === 'busy' ? '' : `<div class="bd-m-lock"><i data-icon="lock"></i>${h.esc(lock)}</div>`
    const r = x.clone?.reason
    const shown = x.clone && !['busy', 'rest', 'gone', 'clone_stage', 'linger', 'unknown', 'own_body', 'stage', 'locked'].includes(r)
    if (!shown || (r && x.ok === false && x.reason === r)) return mine || ''
    const why = { items: 'Not enough to pay for it', qi: `Needs ${h.fmt(this.ci?.qiCost || 0)} Qi to form`, once: 'Done this life', yours: 'You are doing this one', no_beast: 'Needs a tamed beast' }[r]
    const clone = r ? `<div class="bd-m-lock bd-clone-lock"><i data-icon="split"></i>${h.esc(why || 'Not now')}</div>`
      : `<button class="fa-btn bd-begin bd-clone-go${x.group === 'ordeal' ? ' grave' : ''}" data-bd-act="clone-begin" data-id="${x.id}" title="Your other self takes this on: it pays the cost and ${h.fmt(this.ci?.qiCost || 0)} Qi to form; the XP is yours"><span class="fa-g">${Icon.g('split')}</span><span class="fa-t"><span class="fa-n">Other self</span></span></button>`
    return `<div class="bd-m-acts">${mine}${clone}</div>`
  },

  // ── Your other self (Body Beyond the Body): what it is doing, its peak, It Lingers, and "On its own" ──
  _clone(list) {
    const c = this.ci, h = this.h
    if (!c || c.crisis) return ''
    const will = `its will: <b>${h.esc(c.willWord)}</b> (${this.pct(c.will)} it lingers next time)`
    let status = '', body = ''
    if (c.linger) {
      status = 'waits on you'
      const t = c.linger.kind === 'temper'
      body = `<div class="bd-text">${t ? `It finished ${h.esc(c.linger.place)} and did not come back to you. It flexes hands that are yours` : `It sits on a stone at ${h.esc(c.linger.place)}`}, and looks at you with your own eyes.</div>
        <div class="fa-grid bd-choices">
          ${this._tile('clone-absorb', 'split', 'Draw it back in', `${t ? `+${h.fmt(c.linger.xp)} body XP` : 'its finds'}, a deeper grasp of one art · its will resets`)}
          ${this._tile('clone-release', 'person', 'Let it walk its own road', `a person with your face${c.temperXp > 0 ? ' and the body it trained' : ''} joins the world · no other self this life`, '', '', 'grave')}
        </div>`
    } else if (c.temper) {
      const t = c.temper
      status = `<span data-bd-left="${t.endsAt}">${h.fmtTime(t.left)}</span>`
      body = `<div class="bd-act-name">${h.esc(t.name)}</div>
        <div class="bd-prog bd-clone-prog"><div data-bd-prog="${t.startedAt}:${t.endsAt}" style="width:${Math.min(100, (Date.now() - t.startedAt) / (t.endsAt - t.startedAt) * 100)}%"></div></div>
        <div class="bd-act-meta">+${h.fmt(t.xp)} body XP, all yours · <span class="down">your Qi/s ×${c.qiMult} while it works</span>${t.group === 'ordeal' ? ' · stops at its peak for your answer' : ''} · ${will}</div>
        <button class="fa-quiet" data-bd-act="clone-recall">Call it back (what it cost is spent)</button>`
    } else if (c.exp) {
      status = 'on the road'
      body = `<div class="bd-act-meta">It walks to ${h.esc(c.exp.name)}, back in <span data-bd-left="${c.exp.endsAt}">${h.fmtTime(c.exp.left)}</span> (Roam → Explore). When it returns it can temper.</div>`
    } else if (c.lock) {
      status = c.lock === 'rest' ? 'shattered' : ''
      body = `<div class="bd-foot bd-auto-lock"><i data-icon="lock"></i> ${c.lock === 'rest' ? `Shattered. It can be formed again in <span data-bd-left="${Date.now() + c.restLeft * 1000}">${h.fmtTime(c.restLeft)}</span>.` : h.esc(c.lock)}</div>`
    } else {
      status = 'free'
      body = `<div class="bd-act-meta">Send it to temper with <b class="bd-gold">Other self</b> on any method: it pays that cost and ${c.canPay ? '' : '<span class="down">'}${h.fmt(c.qiCost)} Qi${c.canPay ? '' : '</span>'} to form, and every point of XP is yours. Your Qi/s ×${c.qiMult} while it works (a spirit method's halving falls on it, not you). An ordeal's peak risks only it: a failed endure shatters it instead of scarring you. ${will}.</div>`
    }
    return `<div class="fam-sec bd-clone"><div class="fam-sec-title"><span><i data-icon="split"></i>Your other self</span>${status ? `<span class="fam-count">${status}</span>` : ''}</div>
      ${body}${c.lock && c.lock !== 'rest' ? '' : this._cloneAuto(list)}</div>`
  },
  _cloneAuto(list) {
    const c = this.ci, h = this.h, duty = c.auto ? c.autoDuty : 'off'
    const safe = list.filter(x => (x.group === 'drill' || x.group === 'spirit') && x.reason !== 'stage' && x.reason !== 'locked')
    const lastName = c.lastTemperId ? TEMPERING_METHODS.find(x => x.id === c.lastTemperId)?.name : ''
    const id = c.autoTemperId || c.lastTemperId, m = TEMPERING_METHODS.find(x => x.id === id)
    const seg = ['off', 'explore', 'temper'].map(d => `<button class="set-opt${duty === d ? ' active' + (d !== 'off' ? ' is-on' : '') : ''}" data-bd-act="clone-duty" data-duty="${d}">${{ off: 'Off', explore: 'Explore', temper: 'Temper' }[d]}</button>`).join('')
    const pick = duty === 'temper' ? `<select class="bd-auto-pick" data-bd-cpick="1" aria-label="Which drill your other self repeats"><option value="">Its last drill${lastName ? ` (${h.esc(lastName)})` : ''}</option>
        ${safe.map(x => `<option value="${x.id}"${c.autoTemperId === x.id ? ' selected' : ''}>${h.esc(x.name)}</option>`).join('')}</select>` : ''
    const note = duty === 'temper' ? (m ? `Repeats ${h.esc(m.name)} whenever it ends and you can pay for it (the cost + ${h.fmt(c.qiCost)} Qi each time). It never takes an ordeal on its own.` : 'Pick a drill, or send it once by hand: it repeats the last one.')
      : duty === 'explore' ? 'Walks to its last place again whenever it comes home (Roam → Explore), never above your realm.'
      : 'It waits for you. Send it by hand, or let it repeat a duty.'
    return `<div class="bd-clone-auto"><div class="bd-auto-row auto-row"><span class="bd-clone-k">On its own</span><div class="set-seg">${seg}</div>${pick}</div><div class="bd-foot">${note}</div></div>`
  },
  // The clone's ordeal peak: always your answer. The risk is its: a failed endure shatters it, never scars you.
  _cloneCrisis() {
    const c = this.ci?.crisis, h = this.h
    if (!c) return ''
    const o = c.odds
    return `<div class="fam-card bd-crisis bd-clone-crisis">
      <div class="bd-card-title"><i data-icon="split"></i>Your other self: ${h.esc(c.name)}, the peak</div>
      <div class="bd-text">It looks to you. The ordeal waits on your answer; the risk is its body, not yours.</div>
      <div class="fa-grid bd-choices">
        ${this._tile('clone-endure', 'lightning', 'Let it endure', `${h.fmt(c.xp)} XP${c.bonus ? ` · ${h.esc(c.bonus)}` : ''}<br><span class="bd-odds">${this.pct(o.chance)} clean</span> · else it shatters: no XP, −${c.shatterHealth} Health to you, ${h.fmtTime(c.restSec)} before you can form it again · no scar`, '', 'grave')}
        ${this._tile('clone-ease', 'yield', 'Call it to ease off', `${h.fmt(c.easeXp)} XP · no risk, no bonus`)}
        ${this._tile('clone-qi', 'qi', 'Lend it your Qi', `${h.fmt(c.xp)} XP${c.bonus ? ' + the bonus' : ''} · safe · costs ${h.fmt(c.qiCost)} Qi`, c.qiOk ? '' : `Needs ${h.fmt(c.qiCost)} Qi`)}
      </div><button class="bd-why" data-bd="ordeal"><i data-icon="why"></i>Why ${this.pct(o.chance)} to endure cleanly?</button></div>`
  },

  _endureShort(e) {
    if (e.rootBoost) return `${ART_ELEMENTS[e.rootBoost.element]?.name}-root ×${e.rootBoost.mult}`
    if (e.btBonus) return `+${Math.round(e.btBonus * 100)}% breakthrough`
    if (e.first) return 'a clan first'
    return ''
  },
  _history(b) {
    const h = this.h, rows = b.history.filter(x => x.tier)
    if (!rows.length) return ''
    return `<div class="fam-sec bd-hist"><div class="fam-sec-title"><span>This body's story</span></div>
      ${rows.map(x => `<div class="chron-line">Year ${x.year}: ${h.esc(BODY_TIERS.find(t => t.id === x.tier)?.name || x.tier)}, ${x.how === 'bitter' ? 'by the bitter way' : 'the marrow tempered'}.</div>`).join('')}</div>`
  },

  _tile(act, glyph, name, effect, lock = '', cls = '', edge = '') {
    return `<button class="fa-btn${cls ? ' ' + cls : ''}${edge ? ' ' + edge : ''}${lock ? ' locked' : ''}" data-bd-act="${act}" ${lock ? 'disabled' : ''}>
      <span class="fa-g">${Icon.g(glyph)}</span><span class="fa-t"><span class="fa-n">${name}</span>
      <span class="fa-e">${lock ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${this.h.esc(lock)}</span>` : effect}</span></span></button>`
  },

  _click(e) {
    const gs = this.gs, h = this.h
    const b = e.target.closest('[data-bd-act]')
    if (!b || b.disabled) return
    const act = b.dataset.bdAct
    // Failures toast; successes are already in the log (the engine writes them) and on the re-rendered card
    const say = r => { if (!r?.ok) h.flash({ items: 'Not enough to pay for it', busy: 'Another tempering is underway', qi: 'Not enough Qi', cost: 'Not enough to pay for it', health: 'Too wounded' }[r?.reason] || 'Not now', 'negative') }
    if (act === 'begin') {
      const m = TEMPERING_METHODS.find(x => x.id === b.dataset.id)
      if (m?.group === 'demonic') return h.confirm('Begin the Blood Forging?', `It costs ${BLOOD_FORGING.health} Health and ${-BLOOD_FORGING.karma} karma now, adds taint, and the righteous sects will hear of it.`, () => say(gs.startTempering(m.id)), 'Forge')
      return say(gs.startTempering(b.dataset.id))
    }
    if (act === 'cancel') return h.confirm('Break off this tempering?', 'What it cost is spent and the XP is lost.', () => say(gs.cancelTempering()), 'Break off')
    if (act === 'endure' || act === 'ease' || act === 'qi') {
      return say(gs.answerOrdeal(act))
    }
    if (act === 'marrow' || act === 'bitter') {
      return say(gs.attemptTierTrial(act))
    }
    if (act === 'mend') return say(gs.mendScar(+b.dataset.i))
    if (act === 'auto') return say(gs.setAutomation('autoTemper', b.dataset.on === '1'))
    // Your other self
    const csay = r => { if (!r?.ok) h.flash({ items: 'Not enough to pay for it', qi: 'Not enough Qi to form it', busy: 'Your other self is busy', yours: 'You are doing this one yourself', once: 'Done this life', rest: 'It is still shattered', no_beast: 'Needs a tamed spirit beast' }[r?.reason] || 'Not now', 'negative') }
    if (act === 'clone-begin') {
      const m = TEMPERING_METHODS.find(x => x.id === b.dataset.id)
      if (m?.group === 'ordeal') return h.confirm(`Send your other self into ${m.name}?`, `It pays the cost and ${h.fmt(this.ci?.qiCost || 0)} Qi to form. At the peak you choose: if it endures and fails, it shatters (Health −${Math.round(SOUL_TECH.clone.shatterHealth * 100)}% of your max, a ${h.fmtTime(SOUL_TECH.clone.restSec)} wait), but you take no scar.`, () => csay(gs.startCloneTempering(m.id)), 'Send it')
      return csay(gs.startCloneTempering(b.dataset.id))
    }
    if (act === 'clone-recall') return h.confirm('Call your other self back?', 'What it cost is spent and the XP is lost.', () => csay(gs.recallClone()), 'Call it back')
    if (act === 'clone-endure' || act === 'clone-ease' || act === 'clone-qi') {
      const r = gs.answerCloneOrdeal(act.slice(6))
      if (r?.ok && r.shattered) h.flash('Your other self shatters.', 'negative')
      return csay(r)
    }
    if (act === 'clone-absorb') return csay(gs.answerCloneLinger('absorb'))
    if (act === 'clone-release') return h.confirm('Let your other self go?', `It becomes a person of its own, with your face and your root${this.ci?.temperXp > 0 ? ', and the body it trained for you' : ''}, and you cannot form another this life.`, () => csay(gs.answerCloneLinger('release')), 'Let it go')
    if (act === 'clone-duty') return csay(gs.setCloneDuty(b.dataset.duty))
  },
}
