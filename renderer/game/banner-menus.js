// BannerMenus — the banner strip's quick-action dropdowns (roadmap 1.7b): sect missions · explore · craft ·
// learn, so the everyday actions work without leaving banner mode. While a menu is open, main.js grows the window
// by BANNER_MENU_GROW px (window.electron.bannerMenu). Actions go through game.js's shared quickActions, so the tabs
// and the menus give identical feedback. UI only (not loaded by the sim). See docs/systems/ui-layout.md →
// "Banner quick actions".

const BANNER_MENU_GROW  = 380   // px the window grows while a dropdown is open
const BANNER_MENU_WIDTH = 384

const BANNER_CRAFT_CATS = [['pills', 'Pills'], ['elixirs', 'Elixirs'], ['weapons', 'Weapons'], ['artifacts', 'Artifacts'], ['talismans', 'Talismans']]

class BannerMenus {
  constructor(gameState, actions, helpers) {
    this.gs       = gameState
    this.actions  = actions
    this.h        = helpers            // { fmt, fmtTime, escHtml, effectText, personStageLabel }
    this.open     = null               // 'missions' | 'explore' | 'craft' | 'learn'
    this.craftCat = 'pills'
    this._btnKey  = ''
    this._drawnAt = 0
    this._pressing = false            // no timer redraws mid-click, or the click can land on a replaced row
    this.quick = document.getElementById('banner-quick')
    this.menu  = document.getElementById('banner-menu')

    this.quick.addEventListener('click', e => {
      const b = e.target.closest('[data-menu]')
      if (b) this.toggle(b.dataset.menu)
    })
    this.menu.addEventListener('pointerdown', () => { this._pressing = true })
    document.addEventListener('pointerup', () => { setTimeout(() => { this._pressing = false }, 0) })
    this.menu.addEventListener('click', e => {
      const cat = e.target.closest('[data-cat]')
      if (cat) { this.craftCat = cat.dataset.cat; this._render(this.gs.get()); return }
      const row = e.target.closest('.bm-row[data-id]:not([disabled])')
      if (!row) return
      const run = { missions: 'startMission', explore: 'sendExpedition', craft: 'craft', learn: 'learn' }[this.open]
      const res = this.actions[run](row.dataset.id)
      if (res?.ok && this.open === 'explore') this.close()   // one expedition at a time: nothing left to pick
      else this._render(this.gs.get())
    })
    // Clicking anywhere else (the strip, or the see-through area of the grown window) closes the menu.
    document.addEventListener('pointerdown', e => {
      if (this.open && !this.menu.contains(e.target) && !this.quick.contains(e.target)) this.close()
    })
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.open) this.close() })
  }

  toggle(id) { this.open === id ? this.close() : this._openMenu(id) }

  close() {
    if (!this.open) return
    this.open = null
    this.menu.classList.add('hidden')
    document.body.classList.remove('banner-menu-open')
    this._btnKey = ''
    window.electron.bannerMenu(0)
  }

  // Every frame in banner mode: button labels (only when they change) + the open menu (≤ 2×/s for its timers).
  update(s, fromTick) {
    if (!s) return
    this._renderButtons(s)
    if (this.open && !this._pressing && (!fromTick || Date.now() - this._drawnAt > 500)) this._render(s)
  }

  _openMenu(id) {
    this.open = id
    if (id === 'craft') this.actions.markCraftWatched()   // looking at the Craft menu counts as watching (22C)
    document.body.classList.add('banner-menu-open')
    window.electron.bannerMenu(BANNER_MENU_GROW)
    this.menu.classList.remove('hidden')
    this._render(this.gs.get(), true)
    this._btnKey = ''
    this._renderButtons(this.gs.get())
    // Hang the menu under (or over, for a bottom banner) its button, kept on screen.
    const btn = this.quick.querySelector(`[data-menu="${id}"]`)
    const left = btn ? btn.getBoundingClientRect().left : 0
    this.menu.style.left = Math.max(4, Math.min(left, window.innerWidth - BANNER_MENU_WIDTH - 4)) + 'px'
  }

  // ── Buttons on the strip ──────────────────────────────────────────────────

  _buttons(s) {
    const { fmtTime } = this.h
    const out = []
    const sect = s.sect
    if (sect?.id && !s.ownSect?.founded) {
      const n = sect.activeMissions.length
      const startable = n < SECT_MAX_MISSIONS && SECT_MISSIONS.some(m => sect.rank >= m.minRank && !sect.activeMissions.some(a => a.missionId === m.id))
      out.push({ id: 'missions', icon: 'token', label: `Missions ${n}/${SECT_MAX_MISSIONS}`, ready: startable, title: 'Sect missions' })
    }
    const e = s.expedition
    out.push(e?.active
      ? { id: 'explore', icon: 'explore', label: `Explore · ${fmtTime(Math.max(0, Math.ceil((e.endsAt - Date.now()) / 1000)))}`, busy: true,
          title: `Expedition to ${LOCATIONS.find(l => l.id === e.locationId)?.name || '?'} underway` }
      : { id: 'explore', icon: 'explore', label: 'Explore', ready: true, title: 'Send an expedition' })
    const craftable = RECIPES.filter(r => ITEMS[r.productId] && r.ingredients.every(i => (s.inventory[i.itemId] || 0) >= i.qty)).length
    out.push({ id: 'craft', icon: 'furnace', label: 'Craft', badge: craftable || '', title: `${craftable} recipe${craftable === 1 ? '' : 's'} you can craft now` })
    const learnable = TECHNIQUES.filter(t => !s.techniques.includes(t.id) && s.stageIndex >= t.minStage && s.spiritStones >= t.cost).length
    out.push({ id: 'learn', icon: 'scroll', label: 'Learn', dot: learnable > 0, ready: learnable > 0, title: learnable ? `${learnable} technique${learnable === 1 ? '' : 's'} you can learn now` : 'Techniques' })
    return out
  }

  _renderButtons(s) {
    const btns = this._buttons(s)
    const key = btns.map(b => `${b.id}|${b.label}|${b.badge}|${b.dot}|${b.ready}|${b.busy}`).join(';') + '|' + this.open
    if (key === this._btnKey) return
    this._btnKey = key
    const esc = this.h.escHtml
    this.quick.innerHTML = btns.map(b => `
      <button class="bq-btn${b.ready ? ' ready' : ''}${b.busy ? ' busy' : ''}${this.open === b.id ? ' open' : ''}" data-menu="${b.id}" title="${esc(b.title)}">
        <span class="bq-icon">${Icon(b.icon)}</span><span class="bq-label">${esc(String(b.label))}</span>${b.badge ? `<span class="bq-badge">${esc(String(b.badge))}</span>` : ''}${b.dot ? '<span class="bq-dot"></span>' : ''}<span class="bq-caret">▾</span>
      </button>`).join('')
  }

  // ── The open menu ─────────────────────────────────────────────────────────

  _render(s, resetScroll) {
    if (!this.open || !s) return
    const body = { missions: () => this._missions(s), explore: () => this._explore(s), craft: () => this._craft(s), learn: () => this._learn(s) }[this.open]()
    const list = this.menu.querySelector('.bm-list')
    const top = resetScroll || !list ? 0 : list.scrollTop
    this.menu.innerHTML = body
    const nl = this.menu.querySelector('.bm-list')
    if (nl) nl.scrollTop = top
    this._drawnAt = Date.now()
  }

  // head: [title, cn, sub]; rows: { id, name, cn, side, sideCls, meta: [html parts], cls, disabled }
  // Meta parts never break internally (each is a nowrap span); lines wrap only between parts.
  _frame(title, cn, sub, rows, extra = '', empty = 'Nothing here yet.') {
    const esc = this.h.escHtml
    return `
      <div class="bm-head"><span class="bm-title">${esc(title)}</span> <span class="bm-titlecn">${esc(cn)}</span>
        ${sub ? `<div class="bm-sub">${sub}</div>` : ''}</div>
      <div class="bm-orn">◆</div>
      ${extra}
      <div class="bm-list">${rows.length ? rows.map(r => `
        <button class="bm-row ${r.cls || ''}" data-id="${esc(r.id)}" ${r.disabled ? 'disabled' : ''}>
          <span class="bm-name">${esc(r.name)}${r.cn ? ` <span class="bm-cn">${esc(r.cn)}</span>` : ''}</span>
          <span class="bm-side ${r.sideCls || ''}">${r.side}</span>
          <span class="bm-meta">${r.meta.filter(Boolean).map(p => `<span class="bm-part">${p}</span>`).join('<span class="bm-sep"> · </span>')}</span>
          ${r.desc ? `<span class="bm-desc">${r.desc}</span>` : ''}
        </button>`).join('') : `<div class="bm-empty">${esc(empty)}</div>`}</div>`
  }

  _dur(sec) { return sec >= 60 ? `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ''}` : `${sec}s` }
  _left(endsAt) { return this.h.fmtTime(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))) }
  _lock(text, html) { return `<span class="bm-seal">${Icon('lock')}</span> ${html ?? this.h.escHtml(text)}` }
  _stones(n) { return `<span class="bm-stone">石</span> ${this.h.fmt(n)}` }

  _missions(s) {
    const { escHtml: esc, fmt } = this.h
    const sect = s.sect
    const def = SECTS.find(x => x.id === sect.id)
    const n = sect.activeMissions.length
    const full = n >= SECT_MAX_MISSIONS
    const qty = r => r.minQty === r.maxQty ? r.minQty : `${r.minQty}–${r.maxQty}`
    const rows = SECT_MISSIONS.map(m => {
      const active = sect.activeMissions.find(a => a.missionId === m.id)
      const unlocked = sect.rank >= m.minRank
      let side, sideCls = '', cls = '', disabled = false
      if (active) { side = `${this._left(active.endsAt)} left`; sideCls = 'live'; cls = 'active'; disabled = true }
      else if (!unlocked) { side = this._lock(SECT_RANKS[m.minRank]?.name || 'Higher rank'); cls = 'locked'; disabled = true }
      else if (full) { side = 'Slots full'; sideCls = 'dim'; disabled = true }
      else { side = 'Start ›'; sideCls = 'go'; cls = 'can' }
      const meta = [this._dur(m.duration), ...m.rewards.map(r => `${qty(r)} ${esc(ITEMS[r.itemId]?.name || r.itemId)}`),
        m.beastXp ? `${m.beastXp} beast XP` : '', `<span class="bm-gain">+${m.contribution} contrib.</span>`]
      return { id: m.id, name: m.name, cn: m.nameCN, side, sideCls, cls, disabled, meta, running: !!active }
    }).sort((a, b) => b.running - a.running)   // running missions pinned on top
    const sub = `${esc(def?.name || 'Your sect')} · ${esc(SECT_RANKS[sect.rank]?.name || '')} · contribution ${fmt(sect.contribution)}<br>
      <b>${n}/${SECT_MAX_MISSIONS}</b> missions underway`
    return this._frame('Sect Missions', '宗门任务', sub, rows)
  }

  _explore(s) {
    const esc = this.h.escHtml
    const e = s.expedition
    const busy = !!e?.active
    const cur = busy ? LOCATIONS.find(l => l.id === e.locationId) : null
    const rows = []
    for (const loc of LOCATIONS) {
      const unlocked = s.stageIndex >= loc.minStage
      if (!unlocked && loc.minStage > s.stageIndex + 2 && !s.derived.hiddenLocations) continue
      let side, sideCls = '', cls = '', disabled = false
      if (busy && e.locationId === loc.id) { side = `${this._left(e.endsAt)} left`; sideCls = 'live'; cls = 'active'; disabled = true }
      else if (!unlocked) { side = this._lock(this.h.personStageLabel(loc.minStage)); cls = 'locked'; disabled = true }
      else if (busy) { side = 'Busy'; sideCls = 'dim'; disabled = true }
      else { side = 'Send ›'; sideCls = 'go'; cls = 'can' }
      // Signature drops: the three heaviest entries of the drop table, as chance per roll
      const total = loc.dropTable.reduce((a, d) => a + d.weight, 0) || 1
      const drops = [...loc.dropTable].sort((a, b) => b.weight - a.weight).slice(0, 3)
        .map(d => `${esc(ITEMS[d.itemId]?.name || d.itemId)} ${Math.round(100 * d.weight / total)}%`)
      rows.push({ id: loc.id, name: loc.name, cn: loc.nameCN, side, sideCls, cls, disabled,
                  meta: [this._dur(loc.duration), `<span class="bm-tier">Tier ${loc.enemyTier}</span>`, ...drops], running: busy && e.locationId === loc.id })
    }
    rows.sort((a, b) => b.running - a.running)
    const sub = busy
      ? `<span class="bm-live">${esc(cur?.name || 'Expedition')} · ${this._left(e.endsAt)} left</span> · one expedition at a time`
      : 'Choose a destination. Percentages are each drop\'s share of the loot rolls.'
    return this._frame('Expeditions', '历练', sub, rows)
  }

  _craft(s) {
    const esc = this.h.escHtml
    const chips = `<div class="bm-chips">${BANNER_CRAFT_CATS.map(([k, l]) => {
      const n = RECIPES.filter(r => r.category === k && r.ingredients.every(i => (s.inventory[i.itemId] || 0) >= i.qty)).length
      return `<button class="bm-chip${k === this.craftCat ? ' active' : ''}" data-cat="${k}">${l}${n ? ` <span class="bm-chip-n">${n}</span>` : ''}</button>`
    }).join('')}</div>`
    const rows = RECIPES.filter(r => r.category === this.craftCat && ITEMS[r.productId]).map(r => {
      const item = ITEMS[r.productId]
      const can = r.ingredients.every(i => (s.inventory[i.itemId] || 0) >= i.qty)
      const owned = s.inventory[r.productId] || 0
      // "have/need": jade when enough, red when short
      const meta = r.ingredients.map(i => {
        const have = s.inventory[i.itemId] || 0
        return `${esc(ITEMS[i.itemId]?.name || i.itemId)} <span class="${have >= i.qty ? 'bm-have' : 'bm-miss'}">${this.h.fmt(have)}/${i.qty}</span>`
      })
      const own = owned ? `<span class="bm-owned">×${owned}</span> ` : ''
      const short = r.ingredients.find(i => (s.inventory[i.itemId] || 0) < i.qty)
      const need = short ? `Need ${short.qty - (s.inventory[short.itemId] || 0)} ${ITEMS[short.itemId]?.name || short.itemId}` : ''
      return { id: r.id, name: item.name, cn: item.nameCN, cls: can ? 'can' : 'locked', disabled: !can,
               side: can ? `${own}Craft ›` : `${own}${this._lock(need)}`, sideCls: can ? 'go' : 'dim', meta }
    })
    return this._frame('Alchemy & Forging', '炼制', 'Materials shown as have/need · ×N = how many you already own.', rows, chips, 'No recipes in this category.')
  }

  _learn(s) {
    const { escHtml: esc, effectText, personStageLabel } = this.h
    const todo = TECHNIQUES.filter(t => !s.techniques.includes(t.id))
    const open = todo.filter(t => s.stageIndex >= t.minStage).sort((a, b) => a.cost - b.cost)
    const next = todo.filter(t => s.stageIndex < t.minStage).sort((a, b) => a.minStage - b.minStage).slice(0, 3)
    const rows = [...open, ...next].map(t => {
      const unlocked = s.stageIndex >= t.minStage
      const free = t.id === s.inheritedManual
      const afford = free || s.spiritStones >= t.cost
      let side, sideCls = '', cls = '', disabled = false
      if (!unlocked) { side = this._lock(personStageLabel(t.minStage)); cls = 'locked'; disabled = true }
      else if (free) { side = 'Family Manual · free ›'; sideCls = 'go'; cls = 'can' }
      else if (afford) { side = `${this._stones(t.cost)} ›`; sideCls = 'go'; cls = 'can' }
      else { side = this._lock('', `Need ${this._stones(t.cost - s.spiritStones)} more`); cls = 'locked'; disabled = true }
      return { id: t.id, name: t.name, cn: t.nameCN, side, sideCls, cls, disabled,
               meta: [`<span class="bm-eff">${esc(effectText(t.effect))}</span>`], desc: esc(t.desc) }
    })
    return this._frame('Techniques', '功法', `You hold ${this._stones(s.spiritStones)} spirit stones · ${s.techniques.length} techniques mastered`, rows, '',
      'Every technique within your reach is mastered.')
  }
}
