// ArenaView — Roam → Arena (Phase 35 / roadmap A6-3b, docs/systems/combat.md → "A6-3b"). Six rings (ARENA_RINGS,
// assets/data/arena.js) as cards: realm gate, fee, prize, the title if you hold it, and a roster row per duelist (temper,
// realm, your odds, record, feud, Fight / Blood match with what a win adds, and the lock reason). Above them: a grudge
// call-out (accept / decline), the run underway (purse, streak × renown multiplier with a "why" card, Walk away) or your
// standing (renown, best streak, titles). Bouts play on the battle page (CombatView). State: gameState.arenaInfo().
// h: { esc, flash, fight(), fmt }.

const ARENA_LOCK_TEXT = {
  gone: () => 'Gone from the ring.',
  stage: (R) => `Opens at ${typeof stageShortName === 'function' ? stageShortName(R.minStage) : 'stage ' + R.minStage}.`,
  busy: () => 'Another fight or call-out waits on you.',
  other_ring: (R, info) => `Your run is on the ${info.run?.ring?.name || 'other ring'}. Walk away first.`,
  beaten: () => 'Beaten this run.',
  champion: (R, info) => `Answers you after ${info.run ? info.run.champLeft : ARENA_CHAMP_AFTER} more win${(info.run ? info.run.champLeft : ARENA_CHAMP_AFTER) === 1 ? '' : 's'} this run.`,
  wounded: (R, info) => `Heal to ${info.minHealth} Health first.`,
  stones: (R) => `The fee is ${R.entry} Spirit Stones.`,
  no_blood: () => 'Refuses a blood match.',
  resting: () => 'The sand is being raked.',
}

const ArenaView = {
  render(s, el, gs, h) {
    const esc = h.esc, info = gs.arenaInfo(), run = info.run
    const realm = i => typeof stageShortName === 'function' ? stageShortName(i) : 'stage ' + i
    const pct = v => v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`
    const oc = v => v < 0.35 ? 'odds-low' : v < 0.6 ? 'odds-mid' : 'odds-good'
    const temper = p => PERSONALITIES.find(x => x.id === p.personality)?.name || ''
    let top = ''
    if (info.callout) {
      const c = info.callout
      top = `<div class="ar-callout">
        <div class="ar-k">A call-out</div>
        <div class="ar-callout-t">${esc(Persons.fullName(c.p))} has not forgotten you. They wait on the ${esc(c.ring.name)}${c.blood ? ', <span class="down">to the death</span>' : ''}.</div>
        <div class="ar-sub">${esc(temper(c.p))} · ${esc(realm(c.p.stageIndex))} · your odds <b class="${oc(gs.personFightOdds(c.p, 'arena').chance)}">${pct(gs.personFightOdds(c.p, 'arena').chance)}</b> · a win pays <b class="gold">${h.fmt(c.prize)}</b> (no fee)</div>
        <div class="ar-acts"><button class="ar-btn ${c.blood ? 'blood' : 'gold'}" data-ar-callout="1">Answer them</button><button class="ar-btn quiet" data-ar-callout="0">Let it go<small>${ARENA_RENOWN.declined} renown</small></button></div></div>`
    }
    if (run) {
      const m = run.mult
      top += `<div class="ar-run">
        <div class="ar-run-h"><span class="ar-k">Your run · ${esc(run.ring.name)}</span><span class="ar-streak">${run.streak} win${run.streak === 1 ? '' : 's'} in a row</span></div>
        <div class="ar-purse"><span class="ar-purse-v" data-icon="stone"></span><b>${h.fmt(run.purse)}</b><small>in the purse</small></div>
        <div class="ar-mult"><span>Next win ×${m.total.toFixed(2)}</span><span class="dim">streak ×${m.streak.toFixed(2)} · renown ×${m.renown.toFixed(2)}</span>
          <button class="cb-why" data-bd="arena"><span data-icon="why"></span>Why</button></div>
        <div class="ar-sub">${run.champLeft ? `The champion answers after ${run.champLeft} more win${run.champLeft === 1 ? '' : 's'}.` : '<span class="gold">The champion will answer you now.</span>'} Lose a bout and you keep half.${info.health < info.minHealth ? ` <span class="down">You are too hurt to fight on (Health ${Math.ceil(info.health)}); heal, or walk away.</span>` : ''}</div>
        <div class="ar-acts"><button class="ar-btn gold" data-ar-walk>Walk away with ${h.fmt(run.purse)}</button></div></div>`
    } else {
      top += `<div class="ar-standing"><span>Renown <b>${info.renown}</b><small>(purses ×${info.mult.renown.toFixed(2)})</small></span><span>Best streak <b>${info.best}</b></span>
        <span>Bouts <b>${info.record.won}</b>–${info.record.lost}</span>${info.titles.length ? `<span class="ar-titles">${info.titles.map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</div>`
      if (info.restUntil) top += `<div class="hunt-lock ar-rest"><span data-icon="lock"></span>The sand is being raked after your last run. The gates open again in <b data-ar-rest="${info.restUntil}">${h.fmtTime(Math.ceil((info.restUntil - Date.now()) / 1000))}</b>.</div>`
    }
    // (review A6-3b: every greyed button says why)
    if (info.callout) top += '<div class="hunt-lock ar-rest"><span data-icon="lock"></span>Answer the call-out, or let it go, before you step onto the sand again.</div>'
    else if (s.family?.fight && s.family.fight.kind !== 'arena') top += '<div class="hunt-lock ar-rest"><span data-icon="lock"></span>Another fight waits on you. Finish it first.</div>'
    // your run's ring first, then the open rings from the highest down (the ones worth your time), then the locked ones
    const order = [...info.rings].sort((a, b) => (b.here - a.here) || (b.open - a.open) || (a.open ? b.minStage - a.minStage : a.minStage - b.minStage))
    const rings = order.map(R => {
      const locked = !R.open, other = run && !R.here
      const head = `<div class="ar-head"><span class="ar-name">${esc(R.name)}</span>${R.title ? `<span class="ar-title" title="${esc(R.title)}"><b data-icon="crown"></b>Title held</span>` : ''}</div>`
      const meta = `<div class="ar-meta">${esc(realm(R.minStage))}+ · fee ${R.entry} · a win pays ${h.fmt(R.prize)}+ · champion ${h.fmt(R.champPrize)}</div>`
      if (locked || other) return `<div class="ar-card${locked ? ' locked' : ' dim'}">${head}<div class="ar-desc">${esc(R.desc)}</div>${meta}
        <div class="hunt-lock"><span data-icon="lock"></span>${esc(locked ? ARENA_LOCK_TEXT.stage(R) : ARENA_LOCK_TEXT.other_ring(R, info))}</div></div>`
      const rows = R.rows.map(r => {
        const p = r.p, rec = r.record
        const lockTxt = r.lock && r.lock !== 'busy' && r.lock !== 'resting' ? ARENA_LOCK_TEXT[r.lock]?.(R, info) : null
        const bloodTxt = !r.lock && r.bloodLock ? ARENA_LOCK_TEXT[r.bloodLock]?.(R, info) : null
        return `<div class="ar-row${r.champion ? ' champ' : ''}${r.lock ? ' held' : ''}">
          <div class="ar-who"><span class="ar-pn">${r.champion ? '<b data-icon="crown"></b>' : ''}${esc(Persons.fullName(p))}</span>
            <span class="ar-pm">${r.champion ? '<span class="gold">Champion</span> · ' : ''}${esc(temper(p))} · ${esc(realm(p.stageIndex))}${r.feud ? ` · <span class="cb-feud ${r.feud}">${esc(FEUD_TEXT[r.feud])}</span>` : ''}</span>
            ${rec.fought ? `<span class="ar-pm dim">fought ${rec.fought} · you won ${rec.youWon}</span>` : ''}</div>
          <span class="odds-in ${oc(r.odds)}" data-bd="personfight:${esc(p.id)}:arena" title="Your odds to win · why?"><b>${pct(r.odds)}</b><span class="ar-odds-lbl"> to win</span> <i data-icon="why"></i></span>
          <div class="ar-go">${lockTxt ? `<span class="ar-lock"><span data-icon="lock"></span>${esc(lockTxt)}</span>`
            : `<button class="ar-btn" data-ar-fight="${esc(R.id)}:${esc(p.id)}" ${r.lock ? 'disabled' : ''}>Fight<small>+${h.fmt(r.prize)}</small></button>
               <button class="ar-btn blood" data-ar-blood="${esc(R.id)}:${esc(p.id)}" ${r.lock || r.bloodLock ? 'disabled' : ''} title="${esc(bloodTxt || 'To the death: the loser does not rise. ×' + ARENA_BLOOD_MULT + ' purse.')}">Blood<small>+${h.fmt(r.bloodPrize)}</small></button>`}
            ${bloodTxt ? `<span class="ar-lock ar-blood-lock">${esc(bloodTxt)}</span>` : ''}</div></div>`
      }).join('')
      return `<div class="ar-card${R.here ? ' here' : ''}">${head}<div class="ar-desc">${esc(R.desc)}</div>${meta}<div class="ar-rows">${rows}</div></div>`
    }).join('')
    const lede = info.record.runs ? '' : `<div class="view-lede">Step onto the sand for Spirit Stones and renown. Each win fills the purse and raises the next; walk away when you like, or lose and keep half. A blood match pays triple, and can kill you.</div>`
    el.innerHTML = `${lede}${top}<div class="ar-grid">${rings}</div>`
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled || b.dataset.bd != null) return
      const bout = (spec, blood) => {
        const [ringId, oppId] = spec.split(':')
        const r = gs.startArenaBout(ringId, oppId, blood)
        if (r.ok) h.fight()
        else h.flash(ARENA_LOCK_TEXT[r.reason]?.(ARENA_RINGS.find(x => x.id === ringId), info) || 'You cannot fight now.', 'negative')
      }
      if (b.dataset.arFight) bout(b.dataset.arFight, false)
      if (b.dataset.arBlood) bout(b.dataset.arBlood, true)
      if (b.dataset.arWalk != null) { const r = gs.arenaWalkAway(); if (r.ok) h.flash(`You walk away with ${h.fmt(r.purse)} Spirit Stones.`, 'positive') }
      if (b.dataset.arCallout) {
        const r = gs.answerArenaCallout(b.dataset.arCallout === '1')
        if (r.fight) h.fight()
        else if (!r.ok) h.flash('Finish what you are doing first.', 'negative')
      }
    }
  },

  // every tick while the Arena view is open: the rest countdowns; true = one just ended (re-render to unlock the ring)
  tickInPlace(root, fmtTime) {
    let ended = false
    for (const sp of root.querySelectorAll('[data-ar-rest]')) {
      const left = Math.ceil((+sp.dataset.arRest - Date.now()) / 1000)
      if (left <= 0) ended = true
      sp.textContent = fmtTime(Math.max(0, left))
    }
    return ended
  },
}

if (typeof module !== 'undefined') module.exports = { ArenaView }
