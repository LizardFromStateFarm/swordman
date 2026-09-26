// NotificationSystem — decides when to fire an opt-in OS notification (Phase 9A-B). DOM-free (the
// sim loads it too, see docs/systems/qa-sim.md); game.js supplies the real isWindowActive()/fire()
// and calls tick() once per frame. All state reads are read-only (s.settings, s.derived) — this
// system never mutates game state, so it needs no new state fields or _ensurePhaseNFields(). See
// docs/systems/notifications.md.

// Per-`kind` cooldown in seconds — keeps one noisy event type (e.g. repeated war news) from
// spamming the OS notification tray. In-memory only; resets each launch, which is fine since it
// only exists to de-spam within a single running session.
const NOTIFY_COOLDOWN_S = {
  breakthrough: 300,
  expedition:   30,
  war:          30,
  beastTamed:   30,
  death:        10,
}

class NotificationSystem {
  constructor(state, isWindowActive = () => true, fire = () => {}) {
    this.gs             = state
    this.isWindowActive = isWindowActive   // true = player is looking at the window right now
    this.fire           = fire             // (title, body) => void — game.js wires window.electron.notify
    this._cooldowns     = {}               // kind -> last-fired Date.now() ms
    this._btReady       = false            // edge trigger for s.derived.canBreakthrough
    state.onGameEvent((type, ctx) => this._onEvent(type, ctx))
  }

  _enabled(settingId) { return !!this.gs.get()?.settings?.[settingId] }

  _cooldownOk(kind) {
    const last = this._cooldowns[kind] || 0
    const cd   = (NOTIFY_COOLDOWN_S[kind] || 30) * 1000
    if (Date.now() - last < cd) return false
    this._cooldowns[kind] = Date.now()
    return true
  }

  _send(kind, settingId, title, body) {
    if (!this._enabled(settingId)) return   // opt-in per type, all off by default
    if (this.isWindowActive())     return   // news, not a summons — only fires when they'd miss it otherwise
    if (!this._cooldownOk(kind))   return
    this.fire(title, body)
  }

  _onEvent(type, ctx = {}) {
    if (type === 'expedition_return') {
      this._send('expedition', 'notifyExpedition', 'Expedition returned', 'A disciple is back from the road.')
    } else if (type === 'war_call') {
      this._send('war', 'notifyWar', 'War news', `${ctx.sect || 'Your sect'} has declared war.`)
    } else if (type === 'war_won') {
      this._send('war', 'notifyWar', 'War news', `${ctx.sect || 'Your sect'} has won its war.`)
    } else if (type === 'war_lost') {
      this._send('war', 'notifyWar', 'War news', `${ctx.sect || 'Your sect'} has lost its war.`)
    } else if (type === 'beast_tamed') {
      this._send('beastTamed', 'notifyBeastTamed', 'Beast tamed', `${ctx.name || 'A beast'} has bonded with you.`)
    } else if (type === 'death') {
      this._send('death', 'notifyDeath', 'A life has ended', 'The thread of this life has been cut. A new one begins.')
    }
  }

  // Edge-triggered on s.derived.canBreakthrough (false -> true), read straight off existing derived
  // state rather than adding a new emit/state field for it.
  tick() {
    const s = this.gs.get()
    if (!s) return
    const ready = !!s.derived?.canBreakthrough
    if (ready && !this._btReady) {
      this._send('breakthrough', 'notifyBreakthrough', 'Qi gathered', 'Your Qi has gathered — a breakthrough awaits.')
    }
    this._btReady = ready
  }
}
