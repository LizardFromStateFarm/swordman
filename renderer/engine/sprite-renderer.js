// SpriteRenderer — picks the art engine for the sprite canvas (roadmap A3-1). Wraps the old grid ASCIIRenderer and the
// new hybrid InkRenderer behind the one API game.js / layout.js / settings.js already call. The Settings "Sprite art" setting
// (artStyle) chooses Ink or Classic; Ink is used for sprite states that have INK_ART;
// every stage has ink art since A4-1; a state without INK_ART still falls back to the classic sprite. Only the active engine runs its loop.
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

  setStageColor(hex) { if (this.holdUntil === Infinity) return; this.color = hex;   // (held during a death moment)
    this.ascii.setStageColor(hex); this.ink.setStageColor(hex) }
  setSize(w, h, scale = 1) { this.size = [w, h, scale]; this.active.setSize(w, h, scale) }
  setSpeed(m) { this.ascii.setSpeed(m); this.ink.setSpeed(m) }
  setReducedMotion(on) { this.ascii.setReducedMotion(on); this.ink.setReducedMotion(on) }
  triggerBreakthroughBurst() { this.active.triggerBreakthroughBurst() }
  triggerFailure(demoted) { this.holdUntil = performance.now() + 1400; this.active.triggerFailure?.(demoted) }       // ink only; the classic sprite has the window shake
  setSlots(sel) { this.ink.setSlots(sel) }                                // ink part slots (A3-2); A5 wires a player choice
  // A4-3 death moment (ink only). Returns how long (ms) game.js should let it play before opening the death card; the
  // dying figure's state is held (the heir's stage must not swap in under it) until clearDeath().
  playDeath(kind, dyingState = null, color = null) {
    if (!this.isInk()) return 0
    if (color) this.setStageColor(color)
    const st = kind === 'ascend' ? 'ascended' : dyingState   // it is the Ascended who rises; else the one who died (not the heir already in state)
    if (st && InkRenderer.has(st)) { this.state = this.base = st; this.ink.setState(st) }
    this.holdUntil = Infinity
    this.ink.triggerDeath(kind)
    return Math.round((this.ink.reducedMotion ? 1.2 : InkRenderer.DEATH_SECONDS) * 1000) + 400
  }
  clearDeath() {
    this.ink.clearDeath()
    if (this.holdUntil === Infinity) this.holdUntil = 0
  }
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
