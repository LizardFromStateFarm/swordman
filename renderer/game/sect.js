// Sect system — resolves sect missions whose timers have elapsed.
// All state mutations are delegated to gameState methods.

class SectSystem {
  constructor(gs) {
    this._gs = gs
  }

  tick(dt) {
    const s = this._gs.get()
    const missions = s?.sect?.activeMissions
    if (!missions?.length) return
    const now = Date.now()
    // Copy: resolveSectMission mutates the array
    for (const m of [...missions]) {
      if (now >= m.endsAt) this._gs.resolveSectMission(m.uid)
    }
  }
}
