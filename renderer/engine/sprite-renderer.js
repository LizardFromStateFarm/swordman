// SpriteRenderer — picks the art engine for the sprite canvas (roadmap A3-1). Wraps the old grid ASCIIRenderer and the
// new hybrid InkRenderer behind the one API game.js / layout.js / settings.js already call. The Settings "Sprite art" setting
// (artStyle) chooses Ink or Classic; Ink is used only for sprite states that have INK_ART (Qi Condensation so far),
// every other state falls back to the classic sprite. Only the active engine runs its animation loop.
// See docs/systems/art-engine.md.

class SpriteRenderer {
  constructor(canvas) {
    this.ascii  = new ASCIIRenderer(canvas)
    this.ink    = new InkRenderer(canvas)
    this.active = this.ascii
    this.style  = 'classic'
    this.state  = null        // last state asked for (may be 'breakthrough')
    this.base   = null        // last non-breakthrough state: decides which engine has art for this stage
    this.size   = [300, 150, 1]
    this.color  = null
  }

  setArtStyle(style) { this.style = style === 'ink' ? 'ink' : 'classic'; this._route() }

  setState(name) {
    this.state = name
    if (name !== 'breakthrough') this.base = name
    this._route()
    this.active.setState(name)
  }

  setStageColor(hex) { this.color = hex; this.ascii.setStageColor(hex); this.ink.setStageColor(hex) }
  setSize(w, h, scale = 1) { this.size = [w, h, scale]; this.active.setSize(w, h, scale) }
  setSpeed(m) { this.ascii.setSpeed(m); this.ink.setSpeed(m) }
  setReducedMotion(on) { this.ascii.setReducedMotion(on); this.ink.setReducedMotion(on) }
  triggerBreakthroughBurst() { this.active.triggerBreakthroughBurst() }
  stop() { this.ascii.stop(); this.ink.stop() }

  isInk() { return this.active === this.ink }

  _route() {
    const next = this.style === 'ink' && InkRenderer.has(this.base) ? this.ink : this.ascii
    if (next === this.active) return
    this.active.stop()
    this.active = next
    next.setSize(...this.size)
    if (this.color) next.setStageColor(this.color)
    if (this.state) next.setState(this.base || this.state)
    if (this.state === 'breakthrough') next.setState('breakthrough')
  }
}
