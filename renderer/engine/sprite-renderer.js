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
    this.holdUntil = 0        // a breakthrough / failure moment plays out before the per-notify stage state resumes
  }

  setArtStyle(style) { this.style = style === 'ink' ? 'ink' : 'classic'; this._route() }

  setState(name) {
    // game.js re-sends the stage state on every notify; without this hold that overwrote the breakthrough moment the
    // same frame (the 1.8c baseline bug). game.js sends the stage state again when the moment ends (2.5s / 1.5s).
    const now = performance.now()
    if (name === 'breakthrough') this.holdUntil = now + 2400
    else if (now < this.holdUntil) return
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
  triggerFailure(demoted) { this.holdUntil = performance.now() + 1400; this.active.triggerFailure?.(demoted) }       // ink only; the classic sprite has the window shake
  setSlots(sel) { this.ink.setSlots(sel) }                                // ink part slots (A3-2); A5 wires a player choice
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
