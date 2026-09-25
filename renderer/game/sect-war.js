// Sect War system — advances the war state machine (scouting → preparing → auto-resolve).
// All state mutations are delegated to gameState methods; this just drives the per-frame check.

class SectWarSystem {
  constructor(gs) {
    this._gs = gs
  }

  tick(dt) {
    this._gs.tickSectWar()
  }
}
