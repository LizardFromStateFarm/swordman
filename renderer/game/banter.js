// BanterSystem — picks what the cultivator says and when (Phase 29). DOM-free: game.js renders the bubble from
// s.banter.last; the sim loads this file too. All state writes go through gameState.recordBanter(). See docs/systems/banter.md.

class BanterSystem {
  constructor(state, isBlocked = () => false) {
    this.gs        = state
    this.isBlocked = isBlocked   // true while an overlay is open → no idle chatter
    this.idleT     = 0
    this.nextIn    = null
    this.pending   = null        // { trigger, ctx, t } — one queued contextual line; newer events replace it
    this._lowHealth = false
    state.onGameEvent((type, ctx) => this._onEvent(type, ctx))
  }

  _freq() {
    const s = this.gs.get()
    return s?.settings?.banterFreq || 'normal'
  }

  _rollIdle() {
    const [lo, hi] = BANTER_FREQ[this._freq()] || BANTER_FREQ.normal
    return lo + Math.random() * (hi - lo)
  }

  _onEvent(type, ctx) {
    let trigger = type
    if (type === 'bt_fail' && ctx.streak >= BANTER_FAIL_STREAK) trigger = 'bt_fail_streak'
    if (type === 'expedition_return' && ctx.rareItem) { trigger = 'rare_drop'; ctx = { item: ctx.rareItem } }
    this.pending = { trigger, ctx, t: BANTER_CONTEXT_DELAY }
  }

  tick(dt) {
    const s = this.gs.get()
    if (!s) return
    if (this._freq() === 'off') { this.pending = null; return }

    if (this.pending) {
      this.pending.t -= dt
      if (this.pending.t <= 0) {
        const { trigger, ctx } = this.pending
        this.pending = null
        this.say(trigger, ctx)
        this.idleT = 0
      }
      return
    }

    const low = (s.health ?? 100) < BANTER_LOW_HEALTH
    if (low && !this._lowHealth) { this._lowHealth = true; this.say('low_health'); this.idleT = 0; return }
    if (!low) this._lowHealth = false

    if (this.nextIn === null) this.nextIn = this._rollIdle()
    this.idleT += dt
    if (this.idleT < this.nextIn) return
    this.idleT  = 0
    this.nextIn = this._rollIdle()
    if (this.isBlocked()) return
    this.say(this._timeOfDayTrigger(s) || 'idle')
  }

  // 'morning' / 'night' at most once per window per local day; otherwise null.
  _timeOfDayTrigger(s) {
    const d = new Date()
    const h = d.getHours()
    const win = h >= 5 && h < 10 ? 'morning' : (h >= 23 || h < 4) ? 'night' : null
    if (!win) return null
    const day = new Date(d.getTime() - (h < 4 ? 86400000 : 0))   // 1–4 am still counts as "tonight"
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}:${win}`
    if (s.banter?.todSaid === key) return null
    this.gs.markTimeOfDay(key)
    return win
  }

  // Picks a line for trigger (personality pool → generic fallback), avoiding recent lines, fills tokens, records it.
  say(trigger, ctx = {}) {
    const s = this.gs.get()
    if (!s || this._freq() === 'off') return null
    const text = this.pick(s, trigger, ctx)
    if (text) this.gs.recordBanter(text, trigger)
    return text
  }

  pick(s, trigger, ctx = {}) {
    const own = BANTER_LINES[s.personality?.id]?.[trigger] || []
    const gen = BANTER_LINES.generic?.[trigger] || []
    // Mostly the personality's own voice; generic lines are occasional seasoning / fallback.
    let pool = own.length && (Math.random() > 0.12 || !gen.length) ? own : gen
    if (!pool.length) pool = own.length ? own : gen
    if (!pool.length) return null
    const recent = s.banter?.recent || []
    const fresh  = pool.filter(l => !recent.includes(l))
    const raw    = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)]
    return this.fill(raw, s, ctx)
  }

  fill(line, s, ctx) {
    const st = s.derived?.stage
    const vals = {
      name:  s.name,
      stage: st ? `${st.realm}${st.layer && st.realm !== 'Mortal' ? ' ' + st.layer : ''}` : 'mortal',
      item:  ctx.item, hours: ctx.hours, enemy: ctx.enemy, sect: ctx.sect,
      // Phase 16-lite (M2 task 2.5): given names from the married/child_born events; fall back to the live
      // family (e.g. a queued line said after a reload) and then to a neutral phrase.
      spouse: ctx.spouse ?? s.family?.spouse?.given,
      child:  ctx.child ?? s.family?.children?.[s.family.children.length - 1]?.given,
    }
    const FALLBACK = { item: 'something', spouse: 'my spouse', child: 'the little one' }
    return line.replace(/\{(\w+)\}/g, (m, k) => vals[k] != null ? String(vals[k]) : (FALLBACK[k] || 'someone'))
  }

  // Display-time profanity mask ("fuck" → "f***").
  static mask(text) {
    return String(text).replace(/\b(fuck\w*|shit\w*|damn\w*|goddamn\w*|bastard\w*|bitch\w*|asshole\w*|ass|arse\w*|crap\w*|piss\w*|dicks?|cocks?|motherfuck\w*|bullshit\w*|hell)\b/gi,
      w => w[0] + '*'.repeat(Math.max(2, w.length - 1)))
  }
}
