// Expedition system — checks timers each tick and resolves completed expeditions.
// All state mutations are delegated to gameState methods.

class ExpeditionSystem {
  constructor(gs) {
    this._gs = gs
  }

  tick(dt) {
    const s = this._gs.get()
    if (!s?.expedition?.active) return
    if (Date.now() >= s.expedition.endsAt) {
      this._gs.resolveExpedition()
    }
  }
}
