// Handles cultivation event scheduling and triggering.

class CultivationSystem {
  constructor(state) {
    this.gs       = state
    this.eventT   = 0
    this.nextIn   = this._roll()
  }

  _roll() { return 30 + Math.random() * 90 }  // 30–120s between events

  tick(dt) {
    this.eventT += dt
    if (this.eventT >= this.nextIn) {
      this.eventT = 0
      this.nextIn = this._roll()
      this._trigger()
    }
  }

  _trigger() {
    const s = this.gs.get()
    if (!s) return

    const pool = RANDOM_EVENTS.filter(e => s.stageIndex >= (e.minStage || 0))
    if (!pool.length) return

    const total = pool.reduce((acc, e) => acc + (e.weight || 1), 0)
    let pick    = Math.random() * total

    for (const ev of pool) {
      pick -= ev.weight || 1
      if (pick <= 0) {
        try {
          const result = ev.apply(s, this.gs)
          this.gs.addEvent({ text: result.text, type: result.type || 'neutral' })
        } catch {}
        return
      }
    }
  }
}
