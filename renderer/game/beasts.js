// Spiritual Beast system — ticks beast expedition timers and resolves completions.
// All state mutations are delegated to gameState methods.

class BeastSystem {
  constructor(gs) {
    this._gs = gs
  }

  tick(dt) {
    const s = this._gs.get()
    if (!s?.beasts?.length) return
    const now = Date.now()
    for (const beast of s.beasts) {
      if (beast.expedition?.endsAt && !beast.expedition.war && now >= beast.expedition.endsAt) {
        this._gs.resolveBeastExpedition(beast.id)
      }
    }
  }
}
