// SettingsUI — ⚙ panel rendered from SETTINGS_DEFS + applies presentation settings (Phase 20C).
// UI only (not loaded by the sim). All writes go through gameState.setSetting(). See docs/systems/settings.md.

class SettingsUI {
  constructor(gameState, renderer) {
    this.gs       = gameState
    this.renderer = renderer
    this._applied = {}
    this._palette = null
    this.overlay  = document.getElementById('settings-overlay')
    this.body     = document.getElementById('settings-body')
    document.getElementById('settings-close').addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close() })
  }

  open()  { this.render(); this.overlay.classList.remove('hidden') }
  close() { this.overlay.classList.add('hidden') }

  // Called on every state notify — only touches what actually changed.
  apply(settings) {
    const set = settings || this.gs.getSettings()
    const changed = id => set[id] !== this._applied[id]
    const root = document.documentElement

    if (changed('animSpeed'))     this.renderer.setSpeed(set.animSpeed)
    if (changed('reducedMotion')) this.renderer.setReducedMotion(set.reducedMotion)
    if (changed('colorblind')) {
      if (set.colorblind === 'off') delete root.dataset.cb
      else root.dataset.cb = set.colorblind
      this._palette = null
    }
    if (changed('bgOpacity'))        root.style.setProperty('--bg-opacity', set.bgOpacity)
    if (changed('fontSize'))         document.getElementById('tab-body').style.zoom = set.fontSize / 13
    if (changed('canvasBrightness')) document.getElementById('sprite-canvas').style.filter =
      set.canvasBrightness === 1 ? '' : `brightness(${set.canvasBrightness})`

    this._applied = { ...set }
    if (!this.overlay.classList.contains('hidden')) this.render()
  }

  // Current --red / --jade as [r,g,b], for inline-styled lerps (health bar) that CSS vars can't reach.
  palette() {
    if (this._palette) return this._palette
    const cs  = getComputedStyle(document.documentElement)
    const rgb = name => {
      const hex = cs.getPropertyValue(name).trim().replace('#', '')
      const n = parseInt(hex.length === 3 ? hex.replace(/./g, c => c + c) : hex, 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    this._palette = { red: rgb('--red'), jade: rgb('--jade') }
    return this._palette
  }

  render() {
    const set = this.gs.getSettings()
    const el  = this.body
    el.innerHTML = ''
    let group = null
    for (const def of SETTINGS_DEFS) {
      if (def.group !== group) {
        group = def.group
        const h = document.createElement('div')
        h.className = 'set-group'
        h.textContent = group
        el.appendChild(h)
      }
      const row = document.createElement('div')
      row.className = 'set-row'
      const label = document.createElement('div')
      label.className = 'set-label'
      label.textContent = def.label
      if (def.hint) label.title = def.hint
      row.appendChild(label)

      if (def.type === 'range') {
        const wrap = document.createElement('div')
        wrap.className = 'set-range'
        const input = document.createElement('input')
        input.type = 'range'
        input.min = def.min; input.max = def.max; input.step = def.step
        input.value = set[def.id]
        const val = document.createElement('span')
        val.className = 'set-range-val'
        val.textContent = Math.round(set[def.id] * 100) + '%'
        // Live preview while dragging; commit (save) on release.
        input.addEventListener('input', () => {
          val.textContent = Math.round(input.value * 100) + '%'
          document.documentElement.style.setProperty('--bg-opacity', input.value)
        })
        input.addEventListener('change', () => this.gs.setSetting(def.id, Number(input.value)))
        wrap.append(input, val)
        row.appendChild(wrap)
      } else {
        const seg = document.createElement('div')
        seg.className = 'set-seg'
        for (const opt of def.options) {
          const b = document.createElement('button')
          b.className = 'set-opt' + (opt.value === set[def.id] ? ' active' : '')
          b.textContent = opt.label
          b.addEventListener('click', () => this.gs.setSetting(def.id, opt.value))
          seg.appendChild(b)
        }
        row.appendChild(seg)
      }
      el.appendChild(row)
      if (def.hint) {
        const hint = document.createElement('div')
        hint.className = 'set-hint'
        hint.textContent = def.hint
        el.appendChild(hint)
      }
    }
  }
}
