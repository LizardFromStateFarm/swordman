// BaseView — 宗 Sect → Base (roadmap A7, Phase 38A): the large VIEW-ONLY ink diorama of your sect compound.
// Owns #scene-canvas and one SceneRenderer (renderer/engine/scene-renderer.js); re-draws when the sect state
// changes, and plays a build-growth burst where a structure was just raised. It reads state and never writes it —
// building still happens in Sect → Halls (user rule 2026-09-27). See docs/systems/scene-art.md.
//
// It renders through its own VIEW_RENDER entry (game.js), not SectView.render: the canvas must persist across
// re-renders, so the panel is never rebuilt with innerHTML after the first time.

class BaseView {
  // h: { esc, fmt, go(view) }
  constructor(gameState, h) { this.gs = gameState; this.h = h; this.renderer = null; this._sig = ''; this._seen = null; this._seenHall = null; this._size = '' }

  render(s, el) {
    if (!this.renderer) this._init(el)
    const desc = SceneRenderer.buildSectScene(s)
    if (desc.sig !== this._sig) {
      const built = new Set(Object.keys(s.ownSect.buildings || {}).filter(k => s.ownSect.buildings[k]))
      built.add('hall'); built.add('gate')
      if (this._seen) {                                     // something raised since we last looked announces itself
        const at = id => SECT_SCENE.slots.find(x => x.id === id)
        for (const id of built) if (!this._seen.has(id)) { const sl = at(id); if (sl) this.renderer.triggerGrow(sl.x, sl.y - 10) }
        if (this._seenHall != null && s.ownSect.hallLevel > this._seenHall) { const sl = at('hall'); this.renderer.triggerGrow(sl.x, sl.y - 24) }
      }
      this._seen = built; this._seenHall = s.ownSect.hallLevel
      this._sig = desc.sig
      this.renderer.setScene(desc)
      this.renderer.setStageColor(s.derived?.stage?.color || '#CC6010')
    }
    this._legend(s)
    this._fit()
  }

  _init(el) {
    el.innerHTML = `
      <div class="scene-view sect-view">
        <div class="scene-wrap"><canvas id="scene-canvas"></canvas></div>
        <div class="scene-cap" id="scene-cap"></div>
        <div class="scene-legend" id="scene-legend"></div>
      </div>`
    this.frame = el.querySelector('.scene-wrap')
    this.renderer = new SceneRenderer(el.querySelector('#scene-canvas'), { skipHidden: true })
    el.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) this.h.go(b.dataset.go) })
    window.addEventListener('resize', () => this._fit())
    if (window.ResizeObserver) new ResizeObserver(() => this._fit()).observe(this.frame)
  }

  // Fit the canvas to the room the view gives it — large on Expanded/Desktop, scaled in Overlay. The scene box's
  // aspect (420×236 ≈ 1.78) is close to h/w ≈ 0.58, so the art fills the canvas instead of letterboxing.
  _fit() {
    if (!this.renderer || !this.frame) return
    const avail = this.frame.clientWidth
    if (!avail) return
    const narrow = document.body.dataset.layout === 'overlay' || document.body.dataset.narrow === '1'
    const w = Math.max(160, Math.min(880, Math.round(avail)))
    const h = Math.max(130, Math.min(narrow ? 240 : 460, Math.round(w * (narrow ? 0.48 : 0.58))))
    if (w + 'x' + h === this._size) return
    this._size = w + 'x' + h
    this.renderer.setSize(w, h)
  }

  // The view-only caption + a legend of what the scene is showing, so the picture is read, not guessed.
  _legend(s) {
    const o = s.ownSect, info = this.gs.ownSectInfo()
    const built = info ? info.buildings.filter(x => x.built) : []
    const n = o.disciples.length
    // The action lives on the caption line (always on screen); the legend is a chip row that scrolls sideways in Overlay.
    document.getElementById('scene-cap').innerHTML =
      `<span class="scene-dim">View only — the scene reflects what you have raised.</span>` +
      `<button class="fa-link scene-go" data-go="sect-halls">Raise a hall</button>`
    document.getElementById('scene-legend').innerHTML =
      `<span class="scene-chip gold">Sect Hall · Lv.${o.hallLevel}</span>` +
      built.map(x => `<span class="scene-chip">${this.h.esc(x.b.name)}</span>`).join('') +
      `<span class="scene-chip">${n} disciple${n === 1 ? '' : 's'}</span>` +
      `<span class="scene-chip">Fame ${this.h.fmt(info ? info.fame.total : 0)}</span>` +
      (s.derived?.arrayDamaged ? '<span class="scene-chip warn">array damaged</span>' : '')
  }
}
