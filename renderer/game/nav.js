// NavUI — grouped navigation (roadmap 1.8b-1, Phase 33): six groups, each with sub-views, replacing the old strip
// of seven 9px tabs. Draws the group buttons (#tabs) with attention badges, the sub-tab row (#subtabs) and the
// per-group automation chip, and switches the .panel shown in #tab-body. game.js owns what each view renders
// (onShow). UI only. See docs/systems/ui-layout.md → "Navigation + attention".

// view id = the panel id suffix (#tab-<view>). Add a view: a panel in index.html, an entry here, a render in game.js.
const NAV_GROUPS = [
  { id: 'cultivate', glyph: '修', name: 'Path',  title: 'Cultivation: techniques and your character',
    views: [['stats', 'Character'], ['techniques', 'Techniques']] },
  { id: 'adventure', glyph: '歷', name: 'Roam',  title: 'Adventure: expeditions, the road, spirit beasts',
    views: [['explore', 'Explore'], ['beasts', 'Beasts']], auto: 'autoExplore' },
  { id: 'kin',       glyph: '家', name: 'Kin',   title: 'Family, clan and the Ancestral Hall',
    views: [['family', 'Family'], ['clan', 'Clan'], ['hall', 'Hall']] },
  // 1.8b-5: which sub-views show depends on your standing (NavUI.setAvailable, from game.js sectViews())
  { id: 'sect',      glyph: '宗', name: 'Sect',  title: 'Your sect: missions, wars, buildings',
    views: [['sect', 'Overview'], ['sect-missions', 'Missions'], ['sect-halls', 'Halls'], ['sect-disciples', 'Disciples'], ['sect-war', 'War']],
    auto: 'autoSectMissions' },
  { id: 'pack',      glyph: '囊', name: 'Pack',  title: 'Your pack and the alchemy furnace',
    views: [['craft', 'Craft'], ['pack', 'Items']], autoView: { craft: 'autoCraft' } },
  { id: 'log',       glyph: '錄', name: 'Log',   title: 'Chronicle of events and idle chatter',
    views: [['events', 'Events'], ['banter', 'Banter']] },
]

const NAV_AUTO_NAMES = { autoExplore: 'Auto-Explore', autoSectMissions: 'Auto-Missions', autoCraft: 'Auto-Craft' }
const NAV_KEY = 'cultivator-idle:nav'

class NavUI {
  // onShow(view) renders a view; onMode() opens the Mode panel (automation chip).
  constructor({ onShow, onMode }) {
    this.onShow = onShow
    this.onMode = onMode
    this.group = 'cultivate'
    this.last = {}   // group → last sub-view, so coming back lands where you were
    try { Object.assign(this, JSON.parse(localStorage.getItem(NAV_KEY) || '{}')) } catch {}
    this.view = this._groupDef(this.group) ? (this.last[this.group] || this._groupDef(this.group).views[0][0]) : 'stats'
    this.tabs = document.getElementById('tabs')
    this.subs = document.getElementById('subtabs')
    this._badgeSig = ''
    this.avail = null   // Set of views currently offered (null = all); hides sub-tabs that don't apply
    this._build()
    this._showPanel()
  }

  _groupDef(id) { return NAV_GROUPS.find(g => g.id === id) }
  groupOf(view) { return NAV_GROUPS.find(g => g.views.some(v => v[0] === view)) }

  _build() {
    this.tabs.innerHTML = NAV_GROUPS.map(g =>
      `<button class="tab" data-group="${g.id}" title="${g.title}"><span class="tab-glyph">${g.glyph}</span><span class="tab-name">${g.name}</span><span class="tab-badge"></span></button>`).join('')
    // Every sub-tab button exists all the time (hidden outside its group), so [data-tab="…"] always resolves.
    this.subs.innerHTML = '<span class="sub-group" id="sub-group"></span>' + NAV_GROUPS.map(g => g.views.map(([v, label]) =>
      `<button class="subtab" data-tab="${v}" data-in="${g.id}">${label}</button>`).join('')).join('') +
      '<button class="auto-chip hidden" id="auto-chip" title="Automation: open the Mode panel"></button>'
    // Expanded/Desktop: the rail's foot holds the Mode button (CSS hides it in the other modes)
    this.tabs.insertAdjacentHTML('beforeend', `<div id="rail-ink">道</div><button id="rail-mode" title="Mode and automation"><span class="rm-glyph">${Icon('idle')}</span><span class="rm-name">Idle</span></button>`)
    document.getElementById('rail-mode').addEventListener('click', () => this.onMode())
    this.tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-group]')
      if (!b) return
      const g = this._groupDef(b.dataset.group)
      const last = this.last[g.id]
      this.go(last && this._offered(last) ? last : g.views.find(v => this._offered(v[0]))[0])
    })
    this.subs.addEventListener('click', e => {
      if (e.target.closest('#auto-chip')) return this.onMode()
      const b = e.target.closest('[data-tab]')
      if (b) this.go(b.dataset.tab)
    })
  }

  go(view) {
    const g = this.groupOf(view)
    if (!g) return
    this.group = g.id
    this.view = view
    this.last[g.id] = view
    try { localStorage.setItem(NAV_KEY, JSON.stringify({ group: this.group, last: this.last })) } catch {}
    this._showPanel()
    this.onShow(view)
  }

  _offered(view) { return !this.avail || this.avail.has(view) }

  // 1.8b-5: offer only these views (views of other groups must be listed too). If the open view is withdrawn
  // (you left the sect, or founded one), fall back to its group's first offered view.
  setAvailable(views) {
    const sig = [...views].sort().join('|')
    if (sig === this._availSig) return
    this._availSig = sig
    this.avail = new Set(views)
    const g = this.groupOf(this.view)
    if (g && !this._offered(this.view)) return this.go(g.views.find(v => this._offered(v[0]))[0])
    this._showPanel()
  }

  _showPanel() {
    const g = this._groupDef(this.group)
    this.tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.group === this.group))
    this.subs.querySelectorAll('.subtab').forEach(b => {
      b.classList.toggle('hidden', b.dataset.in !== this.group || !this._offered(b.dataset.tab))
      b.classList.toggle('active', b.dataset.tab === this.view)
    })
    this.subs.classList.toggle('single', g.views.filter(v => this._offered(v[0])).length < 2)
    document.getElementById('sub-group').innerHTML = `<span class="sub-group-glyph">${g.glyph}</span><span id="sub-group-sub">${g.name}</span>`
    document.querySelectorAll('#tab-body .panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + this.view))
    this._autoSig = null
  }

  // Per frame: badges from the attention list + the automation chip for the open group. DOM only on change.
  // A one-view group's row shows context from game.js instead of repeating the group name (e.g. the sect's name)
  setContext(text) {
    const el = document.getElementById('sub-group-sub')
    const g = this._groupDef(this.group)
    if (el && el.textContent !== (text || g.name)) el.textContent = text || g.name
  }

  update(s, items, automationUnlocked) {
    const count = {}, dot = {}
    for (const i of items) {
      const g = this.groupOf(i.view)?.id
      if (!g) continue
      if (i.tier === 'idle') dot[g] = true
      else count[g] = (count[g] || 0) + 1
    }
    const urgent = new Set(items.filter(i => i.tier === 'urgent').map(i => this.groupOf(i.view)?.id))
    // 1.8b-5: sub-tabs carry a small mark too, so a group with several views says which one wants you
    const subTier = {}
    for (const i of items) if (!subTier[i.view] || ATTENTION_TIER_ORDER[i.tier] < ATTENTION_TIER_ORDER[subTier[i.view]]) subTier[i.view] = i.tier
    const subSig = JSON.stringify(subTier)
    if (subSig !== this._subSig) {
      this._subSig = subSig
      this.subs.querySelectorAll('.subtab').forEach(b => { b.dataset.att = subTier[b.dataset.tab] || '' })
    }
    const sig = JSON.stringify([count, dot, [...urgent]])
    if (sig !== this._badgeSig) {
      this._badgeSig = sig
      this.tabs.querySelectorAll('.tab').forEach(b => {
        const g = b.dataset.group, badge = b.querySelector('.tab-badge')
        badge.textContent = count[g] ? String(count[g]) : ''
        badge.className = 'tab-badge' + (count[g] ? (urgent.has(g) ? ' urgent' : ' ready') : dot[g] ? ' dot' : '')
        b.setAttribute('aria-label', `${b.title}${count[g] ? `, ${count[g]} waiting` : ''}`)
      })
    }
    // Automation chip: the key this group (or this view) automates, when it's unlocked
    const g = this._groupDef(this.group)
    const key = g.autoView?.[this.view] || g.auto
    const chip = document.getElementById('auto-chip')
    const unlocked = key && automationUnlocked(key)
    const on = unlocked && s.playMode === 'idle' && !!s.automation?.[key]
    const rm = document.getElementById('rail-mode')
    if (rm && rm.dataset.mode !== s.playMode) {
      rm.dataset.mode = s.playMode
      rm.classList.toggle('active', s.playMode === 'active')
      rm.innerHTML = `<span class="rm-glyph">${Icon(s.playMode === 'active' ? 'active' : 'idle')}</span><span class="rm-name">${s.playMode === 'active' ? 'Active' : 'Idle'}</span>`
    }
    const autoSig = `${key}|${unlocked}|${on}|${s.playMode}`
    if (autoSig === this._autoSig) return
    this._autoSig = autoSig
    chip.classList.toggle('hidden', !unlocked)
    if (!unlocked) return
    chip.classList.toggle('on', on)
    const state = s.playMode === 'active' ? 'resting (Active Mode)' : on ? 'on' : 'off'
    chip.innerHTML = `${Icon('auto')}<span class="ac-label"> ${s.playMode === 'active' ? 'rests' : on ? 'on' : 'off'}</span><span class="ac-dot"></span>`
    chip.title = `${NAV_AUTO_NAMES[key]}: ${state}. Click for the Mode panel.`
    chip.setAttribute('aria-label', chip.title)
  }
}
