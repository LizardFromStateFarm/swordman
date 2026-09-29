// BeastDetail: the beast details page (A4-2 follow-up) — click a beast's portrait or name in Roam → Beasts (a wild
// encounter or a tamed companion) to open a panel with a large animated ink portrait, lore, realm gate, rarity,
// growth, what each trait does, and (for an encounter) the Tame action with its lock reason, plus Fight (Phase 35: opens
// the battle page via deps.fight) with its odds, the Mood row for a returning beast and the Bestiary row. Re-renders on state
// changes while open (game.js calls render); the large portrait is one InkRenderer kept for the panel's lifetime.
// Uses BEAST_TYPES / BEAST_TRAITS (assets/data/beasts.js), INK_BEASTS, BeastPortraits.asciiHTML (Classic art),
// stageShortName (breakdowns.js). DOM: #beast-overlay in index.html. See docs/systems/integrity.md → "Beast details".

const BeastDetail = {
  target: null,           // { kind: 'enc' | 'beast', id }
  ink: null, cv: null,    // the large portrait
  deps: null,             // { gameState, flash }

  init(deps) {
    this.deps = deps
    const ov = document.getElementById('beast-overlay')
    ov.addEventListener('click', e => { if (e.target === ov) this.close() })
    document.getElementById('beast-close').addEventListener('click', () => this.close())
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.target) this.close() })
    return this
  },

  // key = a portrait's data-bp-key ('enc:<id>' | 'beast:<id>')
  openKey(key) { const i = key.indexOf(':'); this.open(key.slice(0, i), key.slice(i + 1)) },
  open(kind, id) {
    this.target = { kind, id }
    document.getElementById('beast-overlay').classList.remove('hidden')
    this.render(this.deps.gameState.get())
  },
  close() {
    this.target = null
    document.getElementById('beast-overlay').classList.add('hidden')
    if (this.ink) { this.ink.stop(); this.ink = null; this.cv = null }
  },
  isOpen() { return !!this.target },

  render(s) {
    if (!this.target) return
    const { kind, id } = this.target
    const rec = kind === 'enc' ? (s.beastEncounters || []).find(e => e.id === id) : (s.beasts || []).find(b => b.id === id)
    if (!rec) { this.close(); return }                          // tamed, released or gone
    const prof = this.deps.gameState.beastProfile(rec)
    const T = prof.type || { name: rec.typeId, desc: '', minStage: 0, xpPerExp: 10 }
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const cap = s.derived.maxBeasts || 3, talismans = s.inventory['beast_taming_talisman'] || 0

    const realm = typeof stageShortName === 'function' ? stageShortName(T.minStage || 0) : 'Stage ' + (T.minStage || 0)

    document.getElementById('beast-title').textContent = kind === 'enc' ? 'Wild Beast' : 'Companion'
    const stat = (k, v, cls = '') => `<div class="bdx-stat${k === 'Now' ? ' wide' : ''}"><span class="bdx-k">${k}</span><span class="bdx-v ${cls}">${v}</span></div>`
    const chips = `<span class="tier-chip tier-${prof.tier.id}">${esc(prof.tier.name)}</span>${prof.variant ? '<span class="tier-chip tier-variant">Rare colour</span>' : ''}`
    let stats = stat('Realm', esc(realm) + '+' + (s.stageIndex >= (T.minStage || 0) ? '' : ' · above your realm'), s.stageIndex >= (T.minStage || 0) ? '' : 'locked')
      + stat('Might', `×${prof.might.toFixed(2)} trait strength`)
      + stat('Growth', `+${T.xpPerExp || 10} XP / expedition`)
    let head, action = ''
    if (kind === 'enc') {
      head = `<div class="bdx-name">${esc(prof.name)}${rec.mood === 'cub' ? ' cub' : ''}<span class="bdx-tag">Wild</span>${chips}</div>`
      const free = rec.mood === 'grateful', fighting = s.family?.fight?.beast?.encId === id
      const why = fighting ? 'You are fighting it. Finish the battle first.'
        : (s.beasts || []).length >= cap ? `Your companions are full (${cap}/${cap}). Release one first.`
        : s.stageIndex < (T.minStage || 0) ? `It will not heed anyone below ${esc(realm)}.`
        : !free && talismans < 1 ? 'You need a Beast Taming Talisman (craft one, or find one on an expedition).' : ''
      // Phase 35: Fight opens the battle page's prepare step (odds for Slay / Drive off before anything happens)
      const pv = this.deps.gameState.beastFightPreview(id)
      const fightWhy = fighting ? '' : pv?.locked === 'busy' ? 'Another fight is underway.' : pv?.locked === 'wounded' ? 'You are too wounded to fight.' : ''
      const odds = pv ? (pv.chance < 0.01 ? '<1%' : Math.round(pv.chance * 100) + '%') : '?'
      action = `<div class="bdx-actions"><button class="bdx-tame" ${why ? 'disabled' : ''}>${free ? 'Tame · it comes freely' : 'Tame · 1 Talisman'}</button>`
        + `<button class="bdx-fight" ${fightWhy ? 'disabled' : ''}><span data-icon="sword"></span>${fighting ? 'Return to battle' : `Fight · ${odds} to win`}</button>`
        + `<span class="bdx-have">You carry ${talismans}</span></div>${why ? `<div class="bdx-why">${why}</div>` : ''}${fightWhy ? `<div class="bdx-why">${fightWhy}</div>` : ''}`
      const b = this.deps.gameState.bestiaryEntry(rec.typeId)
      if (rec.mood) stats += stat('Mood', { grateful: 'It remembers your mercy', vengeful: 'It came back for you', cub: 'Its mother is dead' }[rec.mood], rec.mood === 'grateful' ? 'jade' : '')
      stats += stat('Bestiary', b.fought ? `fought ${b.fought} · won ${b.won} · slain ${b.slain}${b.spared ? ` · spared ${b.spared}` : ''}` : 'never fought one')
    } else {
      head = `<div class="bdx-name">${esc(rec.name)}<span class="bdx-sub">Lv.${rec.level} ${esc(prof.variant ? prof.variant.name : T.name)}</span>${chips}</div>`
      const xp = Math.min(100, rec.xp || 0)
      stats = stat('Level', rec.level >= 10 ? 'Lv.10 (peak)' : `Lv.${rec.level} · ${xp}/100 XP`) + stats
      if (rec.expedition) {
        const loc = typeof LOCATIONS !== 'undefined' && LOCATIONS.find(l => l.id === rec.expedition.locationId)
        const left = Math.max(0, Math.ceil((rec.expedition.endsAt - Date.now()) / 1000))
        stats += stat('Now', rec.expedition.war ? 'At war with the sect' : `Exploring ${esc(loc?.name || '?')} (<span data-beast-left="${rec.expedition.endsAt}">${Math.floor(left / 60)}m ${left % 60}s</span>)`, 'jade')
      } else stats += stat('Now', 'Resting at your side')
      // Companion actions (same calls as the card): send out to a location, or release for good.
      const busy = !!rec.expedition
      const locBtns = (typeof LOCATIONS !== 'undefined' ? LOCATIONS : []).filter(l => s.stageIndex >= l.minStage)
        .map(l => `<button class="bdx-loc" data-loc="${esc(l.id)}" ${busy ? 'disabled' : ''}>${esc(l.name)} (${l.duration >= 60 ? Math.floor(l.duration / 60) + 'm' : l.duration + 's'})</button>`).join('')
      // Auto-Expedition (Lv.BEAST_AUTO_EXPEDITION_LEVEL+): On/Off + where it goes next. The pick works while it is out:
      // it is read when the beast comes home, so the next trip swaps without cutting this one short.
      const gs = this.deps.gameState
      let auto
      if (!gs.beastAutoUnlocked(rec)) {
        auto = `<div class="bdx-sec">Auto-Expedition</div><div class="bdx-why">Opens at Lv.${BEAST_AUTO_EXPEDITION_LEVEL}: once it knows the roads it can go out on its own.</div>`
      } else {
        const on = !!rec.autoExp, tgt = gs.beastAutoTarget(rec), cur = rec.autoExpLocId
        const picks = [[null, `Its last trip${rec.lastExpLocId ? ` (${esc(LOCATIONS.find(l => l.id === rec.lastExpLocId)?.name || '?')})` : ''}`]]
          .concat(LOCATIONS.filter(l => s.stageIndex >= l.minStage).map(l => [l.id, esc(l.name)]))
        const note = !on ? 'Off: it waits for you to send it.' : s.playMode === 'active' ? 'Resting while you play in Active Mode.'
          : busy && tgt && tgt.id !== rec.expedition.locationId ? `When it returns it sets out for <b>${esc(tgt.name)}</b>.`
          : tgt ? `It keeps going back to <b>${esc(tgt.name)}</b>.` : 'Send it once, or pick a place below.'
        auto = `<div class="bdx-sec bdx-auto-h">Auto-Expedition <span class="set-seg bdx-auto-seg"><button class="set-opt is-on${on ? ' active' : ''}" data-bauto="1">On</button><button class="set-opt${on ? '' : ' active'}" data-bauto="0">Off</button></span></div>
          <div class="bdx-auto-note">${note}</div>
          ${on ? `<div class="bdx-locs bdx-auto-picks">${picks.map(([lid, n]) => `<button class="pack-chip${cur === lid ? ' active' : ''}" data-bautoloc="${lid ?? ''}">${n}</button>`).join('')}</div>` : ''}`
      }
      action = `${auto}<div class="bdx-sec">Send now</div><div class="bdx-sec-sm">${busy ? 'On the road: it cannot be sent again until it returns.' : 'Pick a place for one trip.'}</div>
        <div class="bdx-locs">${locBtns}</div>
        <div class="bdx-actions" style="margin-top:10px"><button class="bdx-release" title="Releases it into the wild for good">Release</button></div>`
    }
    const traits = (rec.traits || []).map(t => BEAST_TRAITS[t]).filter(Boolean)
      .map(t => `<div class="bdx-trait"><span class="bdx-trait-n">${esc(t.name)}</span><span class="bdx-trait-d">${esc(t.desc)}</span></div>`).join('')

    const body = document.getElementById('beast-body')
    body.innerHTML = `<div class="bdx-art"></div>${head}
      <div class="bdx-lore">${esc(prof.lore)}</div>
      <div class="bdx-stats">${stats}</div>
      <div class="bdx-sec">Traits</div><div class="bdx-traits">${traits || '<div class="bdx-trait-d">None</div>'}</div>
      ${action}`
    body.querySelector('.bdx-tame')?.addEventListener('click', () => {
      const res = this.deps.gameState.tameEncounteredBeast(id)
      if (res.ok) { this.deps.flash(`Tamed: ${res.beast.name}!`, 'special'); this.open('beast', res.beast.id) }
      else this.deps.flash({ not_found: 'Already gone', stage: 'Realm too low', max_beasts: 'Beast capacity full', no_talisman: 'Need a Beast Taming Talisman' }[res.reason] || 'Cannot tame', 'negative')
    })
    body.querySelector('.bdx-fight')?.addEventListener('click', () => this.deps.fight?.(id))
    body.querySelectorAll('.bdx-loc').forEach(b => b.addEventListener('click', () => {
      const res = this.deps.gameState.sendBeastExpedition(id, b.dataset.loc)
      if (res.ok) this.deps.flash(`${rec.name} sent to ${res.loc.name}.`, 'positive')
      else this.deps.flash({ not_found: 'Beast not found', active: 'Already on expedition', stage: 'Stage too low', unknown_location: 'Unknown location' }[res.reason] || 'Cannot send', 'negative')
    }))
    body.querySelectorAll('[data-bauto]').forEach(b => b.addEventListener('click', () => {
      const res = this.deps.gameState.setBeastAuto(id, b.dataset.bauto === '1')
      if (!res.ok) this.deps.flash('Cannot change Auto-Expedition', 'negative')
    }))
    body.querySelectorAll('[data-bautoloc]').forEach(b => b.addEventListener('click', () => {
      const res = this.deps.gameState.setBeastAutoLocation(id, b.dataset.bautoloc || null)
      if (!res.ok) this.deps.flash('Cannot choose that location', 'negative')
    }))
    body.querySelector('.bdx-release')?.addEventListener('click', () => {
      this.deps.confirm(`Release ${rec.name}?`, 'You lose its trait bonuses and it will not return.', () => {
        if (this.deps.gameState.dismissBeast(id).ok) { this.deps.flash('Beast released into the wild.', 'neutral'); this.close() }
      }, 'Release')
    })
    document.getElementById('beast-box').dataset.tier = prof.tier.id
    this._portrait(body.querySelector('.bdx-art'), prof.art, s)
  },

  // The large portrait: one InkRenderer sized to the panel (re-attached on every re-render, rebuilt only on resize).
  _portrait(slot, type, s) {
    const settings = this.deps.gameState.getSettings()
    const hasInk = typeof INK_BEASTS !== 'undefined' && InkRenderer.has(type, INK_BEASTS)
    if (!hasInk || (settings.artStyle !== 'ink' && BeastPortraits.asciiHTML(type))) {         // Classic art, when the beast has an ASCII sprite
      if (this.ink) { this.ink.stop(); this.ink = null; this.cv = null }
      slot.classList.add('ascii'); slot.innerHTML = BeastPortraits.asciiHTML(type); return
    }
    const fit = Math.floor(window.innerHeight * 0.45 / 0.73)            // keep the stats + Tame on screen in short windows
    const w = Math.max(200, Math.min(600, fit, slot.clientWidth || 280)), h = Math.round(w * 0.73)
    if (!this.ink || this.ink.type !== type) {
      if (this.ink) this.ink.stop()
      this.cv = document.createElement('canvas'); this.cv.className = 'bdx-canvas'
      this.ink = new InkRenderer(this.cv, { table: INK_BEASTS })
      this.ink.type = type
      this.ink.setStageColor(INK_BEASTS[type].glow || '#7A6AB0')
    }
    if (this.ink.w !== w || this.ink.h !== h) this.ink.setSize(w, h)
    this.ink.setReducedMotion(!!settings.reducedMotion)
    this.ink.setSpeed(settings.animSpeed || 1)
    slot.appendChild(this.cv)
    this.ink.setState(type)
  },
}
