// Review score: 8.0 (asset gate, cycle 2 reviewer agent, 2026-09-28) · 1.13b element effects 8.3 (asset gate, cycle 2, 2026-09-29)
// BattleScene — the battle page's canvas (Phase 35 / roadmap A6-1, docs/systems/combat.md). Your cultivator (the current
// realm's INK_ART, `bare`) stands on the left and the beast (INK_BEASTS, `bare`) on the right, over a dotted night field.
// Each figure is one private InkRenderer driven frame by frame (like AscensionCinematic); this class adds the backdrop
// and the fight's motion + effects, all in the ink-dot language:
//   exchange  Press = a lunge + a crescent of Qi dots (you) / three claw rakes (beast) · Guard = a dotted ward arc ·
//             Feint = afterimages and a side-step · the clash sparks at the middle, the loser staggers, flashes and
//             takes a floating wound number
//   ends      won (it slumps, you are lit gold) · finish (it dissolves into ash) · spare / flee (it limps off) ·
//             bind (a ring of gold dots closes on it) · lost (you slump, it rears) · died (you dissolve) · retreat
// Reduced motion keeps the flashes and numbers but drops the movement. Used by renderer/game/combat.js.
// A6-3a: the opponent may be a person (a duelist): their realm's INK_ART dressed in INK_PARTS slots, mirrored; their
// Press / Feint throw a crescent in their stage colour.
// 1.13b (move fights, docs/systems/arts.md → "42b part 2"): an exchange may carry `fx` (the art's element, type, hits,
// parried mask…) and is then drawn per element (_fxBack / _fxFront: metal cuts · wood vines · water frost · fire flame ·
// earth stones), with status auras on the figures (setStatus), the parry wind-up ring on you (telegraph) and the press
// flash (parryFlash). Person fights (old engine) still use the press/guard/feint art above.
// Test hooks: freeze(t) holds one exact moment; perf(n) = ms per frame. Effect sheet: scripts/smoke/scenarios/battle-fx.js.

class BattleScene {
  static EX_SECONDS = 1.1
  static END_SECONDS = { won: 1.0, finish: 2.6, spare: 1.8, flee: 1.8, bind: 2.2, lost: 1.2, died: 2.6, retreat: 1.4 }

  constructor(canvas) {
    this.cv = canvas
    this.ctx = canvas.getContext('2d')
    this.you = this._fig(new InkRenderer(document.createElement('canvas'), { bare: true }))
    this.foe = this._fig(null)
    this.t = 0; this.last = 0
    this.queue = []; this.cur = null          // cur = { ev, t0, dur }
    this.pose = { you: 'idle', foe: 'idle' }   // settled state after an end animation
    this.floaters = []                          // { x, y, text, col, t0 }
    this.calm = false; this.speed = 1
    this.running = false; this.frozen = false; this.rafId = null
    this.geo = null
    this.status = { you: {}, foe: {} }          // 1.13b: live statuses drawn as auras ({ burn: 1, charge: 'fire', … })
    this.tele = null                            // 1.13b: the parry wind-up { k: 1 → 0 as the blow nears, hot, el }
    this.pf = null                              // 1.13b: the last parry press { ok, t0 }
  }

  _fig(ink) { return { ink, art: null, crop: null, glow: '#87CEEB' } }

  // youState: INK_ART sprite state · youColor: stage colour · foeArt: INK_BEASTS key · foeGlow: its glow colour
  // A6-3a: a person opponent — foePerson: true, foeArt = their realm's INK_ART state, foeSlots = INK_PARTS look
  // (assets/data/duelists.js); they are mirrored to face you, and their Press throws a crescent back (a beast's: claws)
  setup({ youState, youColor, youSlots = null, foeArt, foeGlow, foePerson = false, foeSlots = null, reducedMotion = false, speed = 1 }) {
    this.calm = !!reducedMotion; this.speed = speed > 0 ? speed : 1
    const Y = this.you
    Y.glow = youColor || '#87CEEB'
    Y.ink.setStageColor(Y.glow); Y.ink.setReducedMotion(this.calm)
    if (youSlots) Y.ink.setSlots(youSlots)
    Y.ink.setState(youState); Y.ink.stop(); Y.art = youState
    const table = foePerson ? INK_ART : INK_BEASTS
    if (!this.foe.ink || this.foe.art !== foeArt || this.foe.table !== table) {
      this.foe.ink = new InkRenderer(document.createElement('canvas'), { table, bare: true })
      this.foe.art = foeArt; this.foe.table = table
    }
    const F = this.foe
    F.person = !!foePerson; F.flip = !!foePerson
    F.glow = foeGlow || (!foePerson && INK_BEASTS[foeArt]?.glow) || '#7A6AB0'
    F.ink.setStageColor(F.glow); F.ink.setReducedMotion(this.calm)
    if (foeSlots) F.ink.setSlots(foeSlots)
    F.ink.setState(foeArt); F.ink.stop()
    for (const f of [Y, F]) { f.ink.death = 0; f.ink.bt = 0; f.ink.btTarget = 0; f.ink.fail = 0; f.dis = null; f.d = 0 }
    this.queue = []; this.cur = null; this.floaters = []
    this.pose = { you: 'idle', foe: 'idle' }
    this.geo = null
    this.status = { you: {}, foe: {} }; this.tele = null; this.pf = null
  }

  // 1.13b hooks for renderer/game/combat.js: statuses → auras, the parry wind-up (k = the panel ring's 1 → 0), a press
  setStatus(side, st) { this.status[side] = st || {} }
  telegraph(t) { this.tele = t || null }
  parryFlash(ok) { this.pf = { ok: !!ok, t0: this.t } }

  // ev.fx (1.13b, move fights): { side, id, el, type, hits, mask[] (1 = landed, 0 = parried), parried, em, crit, status,
  //   heal, gather, release, claw } — drawn per element by _fxBack / _fxFront; without fx the A6 press/guard/feint art plays
  // ev: { type: 'ex', you, them, won, dmg, foeDmg?, nohit? }  (Phase 42b: one side's move per event; nohit = no one is struck) | { type: 'won' | 'finish' | 'spare' | 'flee' | 'bind' | 'lost' | 'died' | 'retreat' }
  // A fall cuts the queue: the exchanges still waiting are skipped so the fall plays right after the blow that caused it
  play(ev) {
    if (ev.type === 'died') {
      this.queue = []
      if (this.cur?.ev.type === 'ex') this.cur.dur = Math.min(this.cur.dur, this.t - this.cur.t0 + 0.5)
    }
    this.queue.push(ev); if (!this.running) this.start()
  }
  busy() { return !!this.cur || this.queue.length > 0 }
  // Hurry: a backlog plays faster so the scene never lags the buttons by more than a beat
  _dur(ev) { const d = ev.type === 'ex' ? BattleScene.EX_SECONDS : BattleScene.END_SECONDS[ev.type] || 1; return d / (this.queue.length > 1 ? 2 : 1) }

  start() {
    if (this.running) return
    this.running = true; this.frozen = false
    this.last = performance.now()
    const tick = now => {
      if (!this.running) return
      const dt = Math.min((now - this.last) / 1000, 0.1); this.last = now
      if (!this.frozen) this._advance(dt)
      this._draw()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }
  stop() { this.running = false; if (this.rafId) cancelAnimationFrame(this.rafId); this.rafId = null }

  _advance(dt) {
    this.t += dt
    if (this.cur && this.t - this.cur.t0 >= this.cur.dur) { this._settle(this.cur.ev); this.cur = null }
    if (!this.cur && this.queue.length) { const ev = this.queue.shift(); this.cur = { ev, t0: this.t, dur: this._dur(ev) }; this._begin(ev) }
    this.floaters = this.floaters.filter(f => this.t - f.t0 < 1.3)
  }

  _begin(ev) { this._floatersFor(ev, this.cur.t0, this.cur.dur) }
  _floatersFor(ev, t0, dur) {
    if (ev.type !== 'ex') return
    const fx = ev.fx, at = t0 + dur * 0.42
    // 1.13b: a word under the number names why (overcomes / resisted / telling blow / parried / the status it took)
    const why = fx ? (fx.em > 1 ? 'overcomes' : fx.em < 1 ? 'resisted' : fx.crit ? 'telling blow' : '') : ''
    const stn = fx?.status && typeof ART_STATUS !== 'undefined' ? ART_STATUS[fx.status]?.name : ''
    const sub = [why, stn].filter(Boolean).join(' · ')
    if (ev.dmg) this._floater('you', `−${ev.dmg}`, '#E8836F', at, sub)
    if (ev.foeDmg) this._floater('foe', `−${ev.foeDmg}`, '#F6E2A0', at, sub)   // Phase 42b: damage you deal
    if (!fx) return
    const def = fx.side === 'you' ? 'foe' : 'you', dealt = fx.side === 'foe' ? ev.dmg : ev.foeDmg
    if (fx.parried && !dealt) this._floater(def, 'Parried', fx.side === 'foe' ? '#9AE6C8' : '#C8C0E0', at, fx.side === 'foe' && typeof MOVE_COMBAT !== 'undefined' ? `+${fx.parried * MOVE_COMBAT.parryQi} Qi` : '')
    else if (stn && !dealt) this._floater(def, stn, BattleScene.ST[fx.status] || '#E8E2F4', at)
    if (fx.heal) this._floater(fx.side, `+${fx.heal}`, '#9AE6C8', t0 + dur * 0.3, 'Health')
  }

  // One wound number per side at a time (a quick second exchange replaces the first instead of stacking on it)
  _floater(side, text, col, t0, sub = '') { this.floaters = this.floaters.filter(f => f.side !== side); this.floaters.push({ side, text, col, t0, sub }) }

  _settle(ev) {
    const P = this.pose
    if (ev.type === 'won') P.foe = 'down'
    if (ev.type === 'finish') P.foe = 'gone'
    if (ev.type === 'spare' || ev.type === 'flee' || ev.type === 'bind') P.foe = 'gone'
    if (ev.type === 'lost') P.you = 'down'
    if (ev.type === 'died') P.you = 'gone'
    if (ev.type === 'retreat') P.you = 'gone'
  }

  // ── Test hooks (scripts/smoke/scenarios/combat.js) ──
  // freeze(u, ev, pose): hold the scene u (0–1) of the way through ev, over the settled pose
  freeze(u = 0, ev = null, pose = null) {
    this.stop(); this.frozen = true
    if (pose) this.pose = { ...this.pose, ...pose }
    this.cur = ev ? { ev, t0: 0, dur: this._dur(ev) } : null
    this.t = ev ? u * this.cur.dur : 0
    this.t += 10; if (this.cur) this.cur.t0 += 10
    this.floaters = []
    if (ev) this._floatersFor(ev, this.cur.t0, this.cur.dur)
    this._draw()
  }
  perf(n = 60) {
    // 1.13b: a busy frame: a three-hit fire art (one parried) over five auras
    const t0 = performance.now(), ev = { type: 'ex', won: true, foeDmg: 9, fx: { side: 'you', el: 'fire', type: 'multi', hits: 3, mask: [1, 0, 1], parried: 1, em: 1.4 } }
    const st0 = this.status
    this.status = { you: { burn: 2, chill: 1 }, foe: { entangle: 1, daze: 1, seal: 1, charge: 'earth' } }
    this.cur = { ev, t0: this.t, dur: 1 }
    for (let i = 0; i < n; i++) { this.t += 1 / n; this._draw() }
    this.cur = null; this.status = st0
    return (performance.now() - t0) / n
  }

  // ── Geometry ──
  _layout() {
    const W = Math.max(1, this.cv.clientWidth || 300), H = Math.max(1, this.cv.clientHeight || 200)
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    if (this.geo && this.geo.W === W && this.geo.H === H && this.geo.dpr === dpr) return this.geo
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr)
    const ground = H * 0.84
    const figH = Math.min(H * 0.62, W * 0.33)                     // a figure's height on the field (narrow boxes: keep them apart)
    const g = { W, H, dpr, ground, figH, youX: W * 0.24, foeX: W * 0.735, bg: null }
    this.geo = g
    this._sizeFig(this.you, INK_ART, figH * 1.12, 0.14)
    if (this.foe.person) this._sizeFig(this.foe, INK_ART, figH * 1.12, 0.14)
    else this._sizeFig(this.foe, INK_BEASTS, figH * 1.08, 0.04)
    g.bg = this._backdrop(g)
    return g
  }

  // Fit a figure's figureBox (padded) to `h` CSS px: the ink canvas is sized so its view maps 1:1 onto the field
  _sizeFig(f, table, h, pad) {
    const A = InkRenderer.resolve(f.art, table)
    if (!A) return
    const box = A.figureBox || A.view || [0, 0, ...A.scene], view = A.view || [0, 0, ...A.scene]
    const bw = box[2] - box[0], bh = box[3] - box[1]
    const crop = [box[0] - bw * pad, box[1] - bh * pad, bw * (1 + 2 * pad), bh * (1 + pad)]   // no pad below the feet
    const k = h / crop[3]                                           // CSS px per logical unit
    f.ink.setSize(Math.round((view[2] - view[0]) * k), Math.round((view[3] - view[1]) * k))
    f.crop = crop; f.k = k
  }

  // The field: an ink night, far ridges and a moon in dots, a ground band of dots, a faint ring between the fighters
  _backdrop(g) {
    const c = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height
    const x = c.getContext('2d'); x.scale(g.dpr, g.dpr)
    const { W, H, ground } = g
    const sky = x.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#07050F'); sky.addColorStop(0.6, '#130E22'); sky.addColorStop(1, '#0A0714')
    x.fillStyle = sky; x.fillRect(0, 0, W, H)
    const dot = (px, py, r, col, a) => { x.fillStyle = inkRgba(col, a); x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill() }
    const n = Math.round(W * H / 900)
    for (let i = 0; i < n; i++) {                                    // stars, thinning toward the ground
      const px = inkRnd(i * 3.1) * W, py = Math.pow(inkRnd(i * 7.7), 1.6) * ground * 0.8
      dot(px, py, 0.4 + inkRnd(i * 5.3) * 0.7, '#E8E2F4', 0.15 + 0.5 * inkRnd(i * 9.9) * (1 - py / ground))
    }
    // moon: a disc of dots, brighter on the lit side
    const mx = W * 0.5, my = H * 0.2, mr = Math.min(W, H) * 0.07
    const halo = x.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.2)
    halo.addColorStop(0, 'rgba(232,226,208,0.10)'); halo.addColorStop(1, 'rgba(232,226,208,0)')
    x.fillStyle = halo; x.fillRect(mx - mr * 3.3, my - mr * 3.3, mr * 6.6, mr * 6.6)
    const step = Math.max(1.5, mr / 13)                             // a hex grid of dots inside the disc, lit from the upper right
    for (let py = my - mr; py <= my + mr; py += step * 0.87) for (let px = mx - mr + ((Math.round((py - my) / (step * 0.87)) & 1) ? step / 2 : 0); px <= mx + mr; px += step) {
      const d = Math.hypot(px - mx, py - my) / mr
      if (d > 1) continue
      const lit = 0.55 + 0.45 * (((px - mx) - (py - my)) / (mr * 1.42))
      dot(px, py, step * (0.26 + 0.12 * lit) * (1 - d * d * 0.35), '#EDE6D2', (0.25 + 0.6 * lit) * (1 - Math.pow(d, 6) * 0.6) * (0.75 + 0.25 * inkRnd(px * 1.3 + py)))
    }
    // two ridgelines of dots
    const ridge = (base, amp, f1, f2, ph, col, a, step) => {
      for (let px = 0; px < W; px += step) {
        const top = base - amp * (0.6 * Math.sin(px * f1 + ph) + 0.4 * Math.sin(px * f2 + ph * 2.3))
        for (let py = top; py < ground; py += step * 1.25) {
          const k = (py - top) / (ground - top)
          if (inkRnd(px * 0.37 + py * 1.91) < 0.72 - k * 0.45) dot(px + (inkRnd(px + py) - 0.5) * step, py, step * 0.28, col, a * (1 - k * 0.6))
        }
      }
    }
    ridge(ground - H * 0.3, H * 0.09, 0.011, 0.027, 1.3, '#3A3158', 0.55, Math.max(2.4, W / 260))
    ridge(ground - H * 0.14, H * 0.06, 0.017, 0.041, 4.1, '#4A3F6A', 0.6, Math.max(2.2, W / 280))
    // the ground band + a trodden ring between the fighters
    const gg = x.createLinearGradient(0, ground - 6, 0, H)
    gg.addColorStop(0, 'rgba(20,15,34,0)'); gg.addColorStop(0.2, 'rgba(20,15,34,0.95)'); gg.addColorStop(1, '#0B0814')
    x.fillStyle = gg; x.fillRect(0, ground - 6, W, H - ground + 6)
    for (let i = 0; i < W * 0.9; i++) {
      const px = inkRnd(i * 2.3) * W, py = ground - 2 + Math.pow(inkRnd(i * 6.1), 2) * (H - ground)
      dot(px, py, 0.5 + inkRnd(i * 1.1) * 0.6, '#8C88AA', 0.12 + 0.3 * (1 - (py - ground) / (H - ground + 1)))
    }
    const rx = (g.foeX - g.youX) * 0.62, ry = H * 0.035
    for (let i = 0; i < 140; i++) {
      const a = (i / 140) * Math.PI * 2
      dot(W / 2 + Math.cos(a) * rx, ground + 2 + Math.sin(a) * ry, 0.8, '#B8A8E0', 0.12 + 0.18 * (Math.sin(a) > 0 ? 1 : 0.5))
    }
    return c
  }

  // ── Frame ──
  _draw() {
    const g = this._layout(), ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(g.bg, 0, 0)
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
    const cur = this.cur, ev = cur?.ev, u = cur ? Math.min(1, (this.t - cur.t0) / cur.dur) : 0
    this._mist(ctx, g)
    const Y = this._placeYou(g, ev, u), F = this._placeFoe(g, ev, u)
    // effects that sit behind the figures (wards), the figures, then strikes + sparks in front
    if (ev?.type === 'ex') { if (ev.fx) this._fxBack(ctx, g, ev, u, Y, F); else this._wards(ctx, g, ev, u, Y, F) }
    this._drawFig(ctx, g, this.foe, F)
    this._drawFig(ctx, g, this.you, Y)
    this._auras(ctx, g, Y, F)
    if (ev?.type === 'ex') { if (ev.fx) this._fxFront(ctx, g, ev, u, Y, F); else this._strikes(ctx, g, ev, u, Y, F) }
    if (ev?.type === 'bind') this._bindRing(ctx, g, u, F)
    this._teleDraw(ctx, g, Y, F)
    this._floaters(ctx, g, Y, F)
  }

  _mist(ctx, g) {
    if (this.calm) return
    const { W, ground } = g
    for (let i = 0; i < 36; i++) {
      const sp = 6 + inkRnd(i * 3.3) * 10
      const x = ((inkRnd(i * 1.9) * W + this.t * sp) % (W + 40)) - 20
      const y = ground - 6 - inkRnd(i * 7.1) * g.H * 0.12
      ctx.fillStyle = inkRgba('#8C88AA', 0.1 + 0.12 * inkRnd(i * 2.2))
      ctx.beginPath(); ctx.arc(x, y + Math.sin(this.t * 0.7 + i) * 2, 0.9 + inkRnd(i) * 0.8, 0, Math.PI * 2); ctx.fill()
    }
  }

  // Where each figure stands this frame: offset, alpha, shake, flash, glow. Ease helpers keep motion ink-soft.
  _placeYou(g, ev, u) {
    const o = { x: g.youX, y: g.ground, a: 1, shake: 0, flash: 0, flashCol: '#E8836F', bt: 0, sink: 0, ghosts: 0 }
    const calm = this.calm, reach = (g.foeX - g.youX) * 0.18
    if (this.pose.you === 'down') { o.sink = 0.06; o.a = 0.55 }
    if (this.pose.you === 'gone') o.a = 0
    if (this.pose.foe === 'down' && this.pose.you === 'idle') o.bt = 1
    if (!ev) return o
    if (ev.type === 'ex') {
      const mv = this._mv(ev, 'you')
      if (!calm) {
        if (mv === 'press') o.x += reach * BattleScene._lunge(u)
        if (mv === 'feint') { o.x += reach * 0.45 * Math.sin(Math.min(1, u / 0.45) * Math.PI); o.ghosts = Math.sin(Math.min(1, u / 0.5) * Math.PI) }
        if (mv === 'guard') o.x -= reach * 0.12 * Math.sin(Math.min(1, u / 0.5) * Math.PI)
        if (mv === 'stomp') o.y -= g.figH * 0.035 * Math.sin(Math.min(1, u / 0.3) * Math.PI)
      }
      if (!ev.won && !ev.nohit) { const h = BattleScene._hit(u); o.flash = h * 0.7; if (!calm) o.shake = h * 5; o.x -= calm ? 0 : reach * 0.35 * h }
      else o.bt = 0.35 * BattleScene._hit(u)
    }
    if (ev.type === 'won') o.bt = u
    if (ev.type === 'lost') { o.sink = 0.06 * u; o.a = 1 - 0.45 * u; o.flash = (1 - u) * 0.6 }
    if (ev.type === 'retreat') { o.x -= calm ? 0 : g.W * 0.35 * u * u; o.a = 1 - u }
    if (ev.type === 'died') { o.flash = Math.max(0, 0.5 - u); o.d = Math.min(1, u * 1.1) }
    if (this.pose.you === 'gone' && this.you.dis) { o.a = 1; o.d = 1 }
    return o
  }

  _placeFoe(g, ev, u) {
    const o = { x: g.foeX, y: g.ground, a: 1, shake: 0, flash: 0, flashCol: '#FFF4E0', bt: 0, sink: 0, ghosts: 0, crouch: 0 }
    const calm = this.calm, reach = (g.foeX - g.youX) * 0.2
    if (this.pose.foe === 'down') { o.sink = 0.07; o.a = 0.6; o.crouch = 0.08 }
    if (this.pose.foe === 'gone') o.a = 0
    if (this.pose.you === 'down') o.bt = 0.6
    if (this.pose.foe === 'gone' && this.foe.dis) { o.a = 1; o.d = 1; o.sink = 0.07; o.crouch = 0.08 }
    if (this.tele && !calm) { const w = 1 - Math.max(0, Math.min(1, this.tele.k)); o.x += reach * 0.14 * Math.sin(w * Math.PI / 2); o.crouch = 0.05 * w }   // 1.13b: it draws back, coiled
    if (!ev) return o
    if (ev.type === 'ex') {
      const mv = this._mv(ev, 'foe')
      if (!calm) {
        if (mv === 'press') o.x -= reach * BattleScene._lunge(u)
        if (mv === 'feint') { o.x -= reach * 0.4 * Math.sin(Math.min(1, u / 0.45) * Math.PI); o.ghosts = Math.sin(Math.min(1, u / 0.5) * Math.PI) }
        if (mv === 'guard') o.crouch = 0.05 * Math.sin(Math.min(1, u / 0.6) * Math.PI)
        if (mv === 'stomp') o.crouch = 0.06 * Math.sin(Math.min(1, u / 0.3) * Math.PI)
      }
      if (ev.won && !ev.nohit) { const h = BattleScene._hit(u); o.flash = h * 0.8; if (!calm) o.shake = h * 6; o.x += calm ? 0 : reach * 0.3 * h }
      else o.bt = 0.4 * BattleScene._hit(u)
    }
    if (ev.type === 'won') { o.sink = 0.07 * u; o.crouch = 0.08 * u; o.a = 1 - 0.4 * u; o.flash = (1 - u) * 0.5 }
    if (ev.type === 'finish') { o.sink = 0.07; o.crouch = 0.08; o.a = 1; o.d = Math.min(1, u * 1.1) }
    // (a spared person steps back rather than bolting: their aura stays inside the frame)
    if (ev.type === 'spare' || ev.type === 'flee') { o.sink = 0.07 * (1 - u); o.a = 0.6 * (1 - u * u); o.x += calm ? 0 : g.W * (this.foe.person ? 0.08 : 0.3) * u * u }
    if (ev.type === 'bind') { o.sink = 0.07 * (1 - u); o.a = u < 0.7 ? 0.6 + 0.4 * (u / 0.7) : 1 - (u - 0.7) / 0.3; o.bt = u }
    if (ev.type === 'lost') o.bt = 0.6 * u
    return o
  }

  static _lunge(u) { return u < 0.38 ? Math.sin((u / 0.38) * Math.PI / 2) : u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45 }   // out, hold the clash, back
  static _hit(u) { return u < 0.42 ? 0 : u < 0.5 ? (u - 0.42) / 0.08 : Math.max(0, 1 - (u - 0.5) / 0.45) }

  // Draw one figure: render its ink frame, tint it for a flash, crop to its padded figureBox, set feet on the ground
  _drawFig(ctx, g, f, o) {
    if (o.a <= 0.01) return
    const ink = f.ink
    ink.t = 10 + this.t; ink.bt = o.bt || 0; ink.btStart = ink.t - 0.4
    ink._draw()
    const C = ink.cache
    if (!C) return
    if (o.flash > 0.01) {
      const fx = ink.cv.getContext('2d')
      fx.save(); fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-atop'; fx.globalAlpha = 1
      fx.fillStyle = inkRgba(o.flashCol, 0.55 * o.flash); fx.fillRect(0, 0, C.cw, C.ch); fx.restore()
    }
    const cr = f.crop
    const sx = C.ox + cr[0] * C.S, sy = C.oy + cr[1] * C.S, sw = cr[2] * C.S, sh = cr[3] * C.S
    const dw = cr[2] * f.k, dh = cr[3] * f.k * (1 - (o.crouch || 0))
    const sink = (o.sink || 0) * dh
    const shx = o.shake ? Math.sin(this.t * 61) * o.shake : 0
    const dx = o.x - dw / 2 + shx, dy = o.y - dh + sink
    o.cx = o.x + shx; o.cy = dy + dh * 0.5; o.top = dy; o.w = dw; o.h = dh
    // A6-3a: a person opponent faces you — mirrored about their own centre line
    if (f.flip) { ctx.save(); ctx.translate(2 * (o.x + shx), 0); ctx.scale(-1, 1) }
    if (o.ghosts > 0.02) {                                   // feint afterimages, trailing to either side
      ctx.globalAlpha = 0.22 * o.ghosts * o.a
      ctx.drawImage(ink.cv, sx, sy, sw, sh, dx - dw * 0.1 * o.ghosts, dy, dw, dh)
      ctx.drawImage(ink.cv, sx, sy, sw, sh, dx + dw * 0.1 * o.ghosts, dy, dw, dh)
    }
    if (o.d > 0) this._dissolve(ctx, f, o, [sx, sy, sw, sh], [dx, dy, dw, dh])
    else {
      ctx.globalAlpha = o.a
      ctx.drawImage(ink.cv, sx, sy, sw, sh, dx, dy, dw, dh)
      ctx.globalAlpha = 1
    }
    if (f.flip) ctx.restore()
  }

  // The fall (finish / died): the figure comes apart into ash motes, head first, carried off on the wind; where a mote
  // has left, the figure has a hole. Sampled once from the figure's own drawn frame (~5,000 grains, each keeping its colour).
  _dissolve(ctx, f, o, src, dst) {
    const [sx, sy, sw, sh] = src, [dx, dy, dw, dh] = dst, d = o.d
    if (!f.dis) {
      const W = Math.max(1, Math.round(sw)), H = Math.max(1, Math.round(sh))
      const step = Math.max(2, Math.round(Math.sqrt(W * H / 5200)))
      const img = f.ink.cv.getContext('2d').getImageData(Math.round(sx), Math.round(sy), W, H).data
      const dots = []
      let top = Infinity, bot = -Infinity
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const i = (y * W + x) * 4
        if (img[i + 3] < 90) continue
        const lum = img[i] * 0.3 + img[i + 1] * 0.59 + img[i + 2] * 0.11
        dots.push({ dark: lum < 70, x: x / W, y: y / H, c: '#' + [img[i], img[i + 1], img[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('') })
        top = Math.min(top, y / H); bot = Math.max(bot, y / H)
      }
      for (const p of dots) {
        const n = inkRnd(p.x * 91.7 + p.y * 37.3), yN = (p.y - top) / Math.max(0.01, bot - top)
        p.delay = Math.max(0.01, (p.y - 0.04) / 1.3 + 0.08 * n)         // released as the wipe passes (see below), a little raggedly
        p.drift = (0.25 + 0.6 * inkRnd(p.x * 13 + p.y * 7)) * (f === this.foe && !f.flip ? 1 : -1)   // (a mirrored figure's local x runs the other way)
        p.rise = 0.15 + 0.35 * inkRnd(p.x * 5 + p.y * 17)
      }
      f.dis = { dots, step: step / W }
    }
    const D = f.dis, r = Math.max(0.6, Math.min(1.3, D.step * dw * 0.32))
    // the figure: a soft wipe erases it from the head down (cut = how far down it has gone), its edge speckled by grains
    // coming loose; composed on the figure's own canvas
    const fx = f.ink.cv.getContext('2d')
    fx.save(); fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'destination-out'
    fx.globalAlpha = 1; fx.fillStyle = '#000'                          // (the renderer leaves its own alpha on this context)
    const cut = d * 1.3 + 0.04, band = 0.16
    const wipe = fx.createLinearGradient(0, sy, 0, sy + sh)
    wipe.addColorStop(0, 'rgba(0,0,0,1)')
    wipe.addColorStop(Math.max(0.001, Math.min(0.998, cut - band)), 'rgba(0,0,0,1)')
    wipe.addColorStop(Math.max(0.002, Math.min(0.999, cut)), 'rgba(0,0,0,0)')
    wipe.addColorStop(1, 'rgba(0,0,0,0)')
    if (d > 0.005) { fx.fillStyle = wipe; fx.fillRect(sx, sy, sw, sh) }
    fx.fillStyle = '#000'
    const grain = new Path2D(), hr = Math.max(1, D.step * sw * 0.4)
    for (const p of D.dots) if (p.y < cut + 0.05 && p.y > cut - band - 0.05 && d > p.delay - 0.06) { const hx = sx + p.x * sw, hy = sy + p.y * sh; grain.moveTo(hx + hr, hy); grain.arc(hx, hy, hr, 0, Math.PI * 2) }
    fx.fill(grain); fx.restore()
    const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
    ctx.globalAlpha = this.calm ? 1 - d : 1
    ctx.drawImage(f.ink.cv, sx, sy, sw, sh, dx, dy, dw, dh)
    ctx.globalAlpha = 1
    if (this.calm) return
    for (const p of D.dots) {                                         // the motes: lift, then drift and sink into the dark
      const lp = (d - p.delay) / 0.5
      if (p.dark || lp <= 0 || lp >= 1) continue
      const e = lp * lp
      const x = dx + p.x * dw + e * p.drift * dw * 0.9 + Math.sin(lp * 6 + p.x * 20) * 3 * lp
      const y = dy + p.y * dh - Math.sin(lp * Math.PI) * p.rise * dh * 0.5 + e * dh * 0.12
      ctx.fillStyle = inkRgba(inkMix(p.c, '#9A96A8', Math.min(1, lp * 1.8)), Math.pow(1 - lp, 0.6) * 0.95)
      ctx.beginPath(); ctx.arc(x, y, r * (1 - 0.5 * lp), 0, Math.PI * 2); ctx.fill()
    }
  }

  // Guard: a dotted ward arc in front of whoever guards (behind the figures so it reads as held, not thrown)
  _wards(ctx, g, ev, u, Y, F) {
    const on = Math.sin(Math.min(1, u / 0.7) * Math.PI)
    if (on <= 0.01) return
    const ward = (x, y, dir, col, r) => {
      for (let i = 0; i < 46; i++) {
        const a = -1.05 + (i / 45) * 2.1
        const px = x + dir * Math.cos(a) * r, py = y + Math.sin(a) * r * 1.15
        ctx.fillStyle = inkRgba(col, (0.35 + 0.5 * inkRnd(i * 3.1 + Math.floor(this.t * 12))) * on)
        ctx.beginPath(); ctx.arc(px, py, 1.1 + 0.8 * (1 - Math.abs(a)), 0, Math.PI * 2); ctx.fill()
      }
    }
    const r = g.figH * 0.42
    if (ev.you === 'guard') ward(g.youX, g.ground - g.figH * 0.45, 1, '#9AE6C8', r)
    if (ev.them === 'guard') ward(g.foeX, g.ground - g.figH * 0.45, -1, this.foe.glow, r)
  }

  // Press: your Qi crescent flies at it / its claws rake at you. The clash sparks where they meet.
  _strikes(ctx, g, ev, u, Y, F) {
    const mid = (g.youX + g.foeX) / 2, y = g.ground - g.figH * 0.5
    if (ev.you === 'press' || ev.you === 'feint') {
      const p = Math.min(1, Math.max(0, (u - 0.18) / 0.3)), fade = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.2)
      if (p > 0 && fade > 0) {
        // won: it flies all the way and lands · lost: it stalls short of the middle and breaks apart (only the winner lands)
        const hx = g.youX + (ev.won ? (g.foeX - g.youX) * 0.92 : (mid - g.youX) * 0.8) * p
        const scatter = ev.won ? 0 : Math.max(0, (u - 0.36) / 0.3)
        this._crescent(ctx, hx, y, g.figH * (ev.you === 'feint' ? 0.22 : 0.34), '#F0D060', fade * (ev.you === 'feint' ? 0.6 : 1) * (1 - scatter * 0.6), 1, scatter)
      }
    }
    if (this.foe.person && (ev.them === 'press' || ev.them === 'feint')) {   // A6-3a: a duelist's sword-light, thrown back at you
      const p = Math.min(1, Math.max(0, (u - 0.18) / 0.3)), fade = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.2)
      if (p > 0 && fade > 0) {
        const hx = g.foeX - (!ev.won ? (g.foeX - g.youX) * 0.92 : (g.foeX - mid) * 0.8) * p
        const scatter = ev.won ? Math.max(0, (u - 0.36) / 0.3) : 0
        // an ember tint on their stage colour, so the incoming blade never reads as more of the gold aura (review A6-3a)
        this._crescent(ctx, hx, y + g.figH * 0.04, g.figH * (ev.them === 'feint' ? 0.22 : 0.34), inkMix(this.foe.glow, '#F0604A', 0.75), fade * (ev.them === 'feint' ? 0.6 : 1) * (1 - scatter * 0.6), -1, scatter)
      }
    } else if (ev.them === 'press') {
      const p = Math.min(1, Math.max(0, (u - 0.28) / 0.2)), fade = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.25)
      if (p > 0 && fade > 0) this._claws(ctx, ev.won ? mid - g.figH * 0.1 : g.youX + g.figH * 0.08, y - g.figH * 0.05, g.figH * 0.36, p, fade, this.foe.glow)
    }
    // the clash: a burst of dots on whoever lost the exchange
    const burst = u > 0.4 && u < 0.85 ? (u - 0.4) / 0.45 : 0
    if (burst > 0 && !ev.nohit) {
      const bx = ev.won ? F.cx ?? g.foeX : Y.cx ?? g.youX, by = y
      const col = ev.won ? '#F6E2A0' : '#E8836F'
      for (let i = 0; i < 40; i++) {
        const a = inkRnd(i * 2.7) * Math.PI * 2, sp = (0.35 + inkRnd(i * 5.1) * 0.65) * g.figH * 0.45
        const r = sp * Math.pow(burst, 0.6)
        ctx.fillStyle = inkRgba(col, (1 - burst) * (0.5 + 0.5 * inkRnd(i)))
        ctx.beginPath(); ctx.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.8, 1.4 * (1 - burst) + 0.5, 0, Math.PI * 2); ctx.fill()
      }
    }
  }

  // A crescent of Qi dots (a sword-light), bowed toward the direction of travel
  // scatter 0–1: the blade breaks into loose motes (a countered strike)
  _crescent(ctx, x, y, r, col, alpha, dir, scatter = 0, z = 1) {
    ctx.save()
    for (let i = 0; i < 56; i++) {
      const k = i / 55, a = -1.25 + k * 2.5
      const thick = Math.sin(k * Math.PI)
      for (let j = 0; j < 3; j++) {                                      // rows across the band: gold edges, a pale core
        const rr = r * (1 - j * 0.085 * thick)
        const jit = (inkRnd(i * 7.3 + j * 1.9) - 0.5) * (1.6 + scatter * r * 0.9)
        const px = x + dir * (Math.cos(a) * rr - r * 0.55) + jit, py = y + Math.sin(a) * rr + (inkRnd(i * 3.1 + j * 5.7) - 0.5) * (1.6 + scatter * r * 0.9)
        ctx.fillStyle = inkRgba(j === 1 ? '#FFF6D8' : col, alpha * (0.18 + 0.5 * thick) * (j === 1 ? 0.8 : 0.65))
        ctx.beginPath(); ctx.arc(px, py, (0.5 + 0.95 * thick) * (j === 1 ? 0.75 : 1) * (1 - scatter * 0.4) * z, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.restore()
    // a faint trail of motes behind it
    for (let i = 0; i < 18; i++) {
      const px = x - dir * r * (0.8 + inkRnd(i * 3.3) * 1.6), py = y + (inkRnd(i * 7.1) - 0.5) * r * 1.4
      ctx.fillStyle = inkRgba(col, alpha * 0.25 * inkRnd(i * 1.3)); ctx.beginPath(); ctx.arc(px, py, 0.9, 0, Math.PI * 2); ctx.fill()
    }
  }

  // Three claw rakes drawn in dots, sweeping down-left as p goes 0 → 1
  _claws(ctx, x, y, len, p, fade, col) {
    for (let c = 0; c < 3; c++) {
      const ox = (c - 1) * len * 0.2, n = Math.round(30 * p)
      for (let i = 0; i < n; i++) {
        const k = i / 29, w = Math.sin(k * Math.PI)
        const jx = (inkRnd(i * 3.7 + c * 11) - 0.5) * 2.2 * w, jy = (inkRnd(i * 5.3 + c * 7) - 0.5) * 2.2 * w
        const px = x + ox + len * 0.25 - k * len * 0.5 + jx, py = y - len * 0.45 + k * len * 0.9 + jy
        ctx.fillStyle = inkRgba(i > n - 3 ? '#FFFFFF' : col, fade * (0.3 + 0.55 * w))
        ctx.beginPath(); ctx.arc(px, py, 0.5 + 1.05 * w, 0, Math.PI * 2); ctx.fill()
      }
    }
  }

  // Bind: a ring of gold dots closes on the beast, then it goes into the talisman as light
  _bindRing(ctx, g, u, F) {
    const cx = g.foeX, cy = g.ground - g.figH * 0.5
    const r = g.figH * (0.9 - 0.55 * Math.min(1, u / 0.7))
    const a0 = this.t * 1.6
    for (let i = 0; i < 72; i++) {
      const a = a0 + (i / 72) * Math.PI * 2
      ctx.fillStyle = inkRgba(i % 6 ? '#F0D060' : '#FFFBEA', Math.min(1, u * 3) * (u > 0.85 ? (1 - u) / 0.15 : 1) * 0.85)
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, i % 6 ? 1.1 : 1.8, 0, Math.PI * 2); ctx.fill()
    }
    if (u > 0.6) for (let i = 0; i < 30; i++) {              // light rising out of it
      const k = ((u - 0.6) / 0.4 + inkRnd(i * 1.9)) % 1
      ctx.fillStyle = inkRgba('#F2CC6A', 0.7 * (1 - k))
      ctx.beginPath(); ctx.arc(cx + (inkRnd(i * 4.3) - 0.5) * g.figH * 0.6, cy + g.figH * 0.3 - k * g.figH, 1.2, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ══ 1.13b: per-element move effects (docs/systems/arts.md → "42b part 2") ══
  // Every art is drawn by its element, and each element has its own shape, so colour is never the only cue:
  //   metal  a sword-light flies, then two crossing cuts are drawn through the target (silver, white edge)
  //   wood   shoots race along the ground, then thorned vines burst up and coil around the target
  //   water  a crested wave flies, then frost rings spread and six-armed ice crystals form and melt
  //   fire   a comet of embers flies, then a flame burst climbs off the target in tongues of fire
  //   earth  the caster stamps; boulders of dots fall on the target, shatter and throw a dust ring
  //   neutral / Palm Strike  the gold crescent of A6 · a beast's plain Rake keeps its claws (tinted by its element)
  // A parried hit breaks on a six-sided ward in front of the defender (jade for you) and its motes fly back.
  // Overcoming adds a ring of the element; resisted blows are smaller and greyed; a telling blow flares white.
  // Wards (ward / counter) are held by element: blades · woven vines · a flowing water arc · a flame wall · rising stones.
  static EL = { metal: '#D8DCE6', wood: '#6CC46A', water: '#5AA8E8', fire: '#F07A3A', earth: '#C8A060', neutral: '#F0D060' }
  static ST = { bleed: '#E8836F', burn: '#F07A3A', chill: '#8CC8F0', entangle: '#6CC46A', daze: '#D8B870', seal: '#B89AE8', guardbreak: '#E86060' }
  static ATK = ['strike', 'multi', 'charge', 'finisher', 'drain']

  _mv(ev, side) {
    const fx = ev.fx
    if (!fx) return side === 'you' ? ev.you : ev.them
    if (fx.side !== side) return side === 'you' && fx.parried ? 'guard' : null
    if (this._isAtk(fx)) return fx.el === 'earth' ? 'stomp' : fx.hits > 1 ? 'feint' : 'press'
    if (fx.type === 'ward' || fx.type === 'counter') return 'guard'
    return null
  }
  _isAtk(fx) { return !fx.gather && !fx.dazed && (fx.release || BattleScene.ATK.includes(fx.type)) }
  _z(g) { return Math.max(1, Math.min(2.3, g.figH / 140)) }   // dot scale: effects must read over the dense figures
  _dot(ctx, x, y, r, col, a) { a *= this._fxA ?? 1; if (a <= 0.01 || r <= 0.05) return; ctx.fillStyle = inkRgba(col, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill() }
  _sides(g, fx, Y, F) {
    const you = fx.side === 'you', A = you ? Y : F, D = you ? F : Y
    const mid = g.ground - g.figH * 0.5
    return { you, A, D, dir: you ? 1 : -1, ax: A.cx ?? A.x, ay: A.cy ?? mid, dx: D.cx ?? D.x, dy: D.cy ?? mid }
  }
  _hitTimes(n) { return n <= 1 ? [0.45] : Array.from({ length: n }, (_, i) => 0.36 + i * 0.26 / (n - 1)) }

  // Behind the figures: held wards
  _fxBack(ctx, g, ev, u, Y, F) {
    const fx = ev.fx
    if (fx.type !== 'ward' && fx.type !== 'counter') return
    const you = fx.side === 'you', R = g.figH
    const on = Math.sin(Math.min(1, u / 0.85) * Math.PI)
    this._elWard(ctx, fx.el || 'neutral', (you ? Y.x : F.x) + (you ? 1 : -1) * R * 0.04, g.ground - R * 0.45, you ? 1 : -1, R * 0.42, on, this._z(g), you ? '#9AE6C8' : this.foe.glow)
  }

  // In front: the blow itself, or the art's own moment (heal / buff / circulate / gather / hex)
  _fxFront(ctx, g, ev, u, Y, F) {
    const fx = ev.fx, S = this._sides(g, fx, Y, F), R = g.figH, z = this._z(g), el = fx.el || 'neutral'
    const col = BattleScene.EL[el]
    if (fx.dazed) return
    ctx.save(); ctx.globalCompositeOperation = 'lighter'         // Qi is light: effects add onto the figures (stones opt out)
    try { this._fxFront2(ctx, g, fx, S, R, z, el, col, u) } finally { ctx.restore() }
  }
  _fxFront2(ctx, g, fx, S, R, z, el, col, u) {
    if (fx.type === 'circulate') return this._circulate(ctx, S.ax, S.ay, R, u, z, '#A8D8F0')
    if (fx.type === 'heal') return this._healFx(ctx, g, S.A, S.ax, R, u, z)
    if (fx.type === 'buff') return this._buffFx(ctx, g, S.A, S.ax, R, u, z, col)
    if (fx.gather) return this._gatherFx(ctx, S.ax + S.dir * R * 0.22, S.ay, R, u, z, col)
    if (fx.type === 'hex') return this._hexFx(ctx, S, R, u, z, fx, el)
    if (fx.type === 'counter' && fx.hits) return
    if (!this._isAtk(fx)) return
    const n = Math.max(1, fx.hits || 1), T = this._hitTimes(n)
    let s = fx.em > 1 ? 1.28 : fx.em < 1 ? 0.6 : 1                // resisted: smaller, greyer and fainter (review 1.13b)
    if (fx.release || fx.type === 'finisher') s *= 1.2
    const c = fx.em < 1 ? inkMix(col, '#8C88AA', 0.6) : col
    this._fxA = fx.em < 1 ? 0.6 : 1
    for (let i = 0; i < n; i++) {
      const ti = T[i], landed = fx.mask ? fx.mask[i] !== 0 : true
      const seed = i * 17.3 + (fx.id ? fx.id.length * 3.7 : 0)
      const tx = landed ? S.dx + (n > 1 ? (inkRnd(seed) - 0.5) * R * 0.12 : 0) : S.dx - S.dir * R * 0.3
      const ty = S.dy + (n > 1 ? (inkRnd(seed * 3) - 0.5) * R * 0.2 : 0)
      const travel = i === 0 ? 0.26 : 0.18
      const p = (u - (ti - travel)) / travel, k = (u - ti) / 0.5
      this._elBlow(ctx, g, el, fx, S, tx, ty, p, k, landed ? s : s * 0.6, c, R, z, seed, landed)
      if (k < 0 || k > 1) continue
      if (!landed) this._parryWard(ctx, tx, ty, S.dir, R, k, z, fx.side === 'foe' ? '#9AE6C8' : this.foe.glow, c, seed)
      else {
        if (fx.em > 1) this._ring(ctx, tx, ty, R * (0.16 + 0.55 * Math.pow(k, 0.7)), 0.7, c, (1 - k) * 0.85, 1.3 * z, 44)
        if (fx.crit && i === 0) this._flare(ctx, tx, ty, R * 0.32 * (1 - k * 0.5), '#FFFFFF', 1 - k, z)
      }
    }
    this._fxA = 1
    if (fx.type === 'drain' && u > 0.5) this._drainFx(ctx, S, R, (u - 0.5) / 0.5, z)
  }

  _elBlow(ctx, g, el, fx, S, tx, ty, p, k, s, c, R, z, seed, landed) {
    const ox = S.ax + S.dir * R * 0.2, oy = S.ay
    const e = Math.max(0, Math.min(1, p)), ease = 1 - (1 - e) * (1 - e)
    const hx = ox + (tx - ox) * ease, hy = oy + (ty - oy) * ease
    const fly = p > 0 && p < 1 && !this.calm, imp = k >= 0 && k <= 1
    if (fx.claw) {                                              // a beast's plain Rake: its claws, in its element's colour
      const cp = Math.max(0, Math.min(1, (p - 0.4) / 0.6)), fade = k < 0.2 ? 1 : Math.max(0, 1 - (k - 0.2) / 0.4)
      if (cp > 0 && fade > 0) this._claws(ctx, tx + S.dir * R * 0.02, ty - R * 0.04, R * 0.36 * s, cp, fade, inkMix(this.foe.glow, c, 0.5))
      if (imp && landed) this._burst(ctx, tx, ty, R * s * 0.8, k, z, c, seed)
      return
    }
    if (el === 'metal') {
      if (fly) this._crescent(ctx, hx, hy, R * 0.3 * s, c, 1, S.dir, 0, z * 1.2)
      if (imp && landed) this._slashes(ctx, tx, ty, R * 0.34 * s, k, c, z, seed, S.dir)
    } else if (el === 'fire') {
      if (fly) this._fireball(ctx, hx, hy, S.dir, R * Math.min(1.2, s), z)
      if (imp) this._flameBurst(ctx, tx, ty, R * s, k, z, seed)
    } else if (el === 'water') {
      if (fly) this._wave(ctx, hx, hy, S.dir, R * Math.min(1.2, s), z)
      if (imp) this._frost(ctx, tx, ty, R * s, k, z, seed, landed)
    } else if (el === 'wood') {
      if (fly) this._sprouts(ctx, ox, hx, g.ground, S.dir, R, z, c, seed)
      if (imp) this._vines(ctx, tx, landed ? g.ground : ty + R * 0.3, ty, R * s, k, z, seed, c)
    } else if (el === 'earth') {
      if (p > 0 && p < 0.6 && !this.calm) this._ring(ctx, S.ax, g.ground + 1, R * (0.1 + 0.35 * p / 0.6), 0.16, '#9C8A6A', (1 - p / 0.6) * 0.7, 1.1 * z, 40)   // the stamp
      this._stones(ctx, tx, ty, R * s, p, k, z, seed, c, g.ground)
    } else {
      if (fly) this._crescent(ctx, hx, hy, R * 0.3 * s, c, 1, S.dir, 0, z * 1.2)
      if (imp && landed && k < 0.5) this._crescent(ctx, tx + S.dir * R * 0.06, ty, R * 0.34 * s * (1 + 0.25 * k), c, 1 - Math.pow(k / 0.5, 2), S.dir, k * 0.4, z * 1.5)   // the palm-light stays, breaking up
      if (imp && landed) this._burst(ctx, tx + S.dir * R * 0.08, ty, R * s * 0.7, k, z, '#F6E2A0', seed)
    }
  }

  _ring(ctx, x, y, r, sy, col, a, rad, N, ph = 0) {
    if (a <= 0.01) return
    for (let i = 0; i < N; i++) { const t = ph + (i / N) * 6.2832; this._dot(ctx, x + Math.cos(t) * r, y + Math.sin(t) * r * sy, rad * (0.7 + 0.5 * inkRnd(i * 3.1 + N)), col, a * (0.6 + 0.4 * inkRnd(i * 7.3))) }
  }
  _flare(ctx, x, y, L, col, a, z) {
    for (let arm = 0; arm < 4; arm++) {
      const an = arm * Math.PI / 2 + Math.PI / 4
      for (let i = 1; i <= 9; i++) { const q = i / 9; this._dot(ctx, x + Math.cos(an) * L * q, y + Math.sin(an) * L * q, (1.6 - 1.2 * q) * z, col, a * (1 - q * 0.7)) }
    }
    this._dot(ctx, x, y, 2.4 * z, col, a)
  }
  // the A6 clash burst (neutral blows, claws)
  _burst(ctx, x, y, R, k, z, col, seed) {
    for (let i = 0; i < 40; i++) {
      const a = inkRnd(seed + i * 2.7) * Math.PI * 2, r = (0.35 + inkRnd(seed + i * 5.1) * 0.65) * R * 0.42 * Math.pow(k, 0.6)
      this._dot(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, (1.4 * (1 - k) + 0.5) * z, col, (1 - k) * (0.5 + 0.5 * inkRnd(i)))
    }
  }

  // metal: two crossing cuts drawn through the target, sparks thrown off the edge
  _slashes(ctx, x, y, L, k, col, z, seed, dir) {
    for (let c = 0; c < 2; c++) {
      const an = (c === 0 ? -0.6 : 0.55) + (inkRnd(seed + c) - 0.5) * 0.3
      const draw = Math.min(1, (k - c * 0.07) / 0.14)
      if (draw <= 0) continue
      const fade = k < 0.35 ? 1 : Math.max(0, 1 - (k - 0.35) / 0.6)
      const ca = Math.cos(an) * dir, sa = Math.sin(an), N = 46
      for (let i = 0; i < N; i++) {
        const q = i / (N - 1)
        if (q > draw) break
        const tt = (q - 0.5) * 2 * L, w = Math.sin(q * Math.PI), lead = draw < 1 && q > draw - 0.07
        this._dot(ctx, x + ca * tt, y + sa * tt, (0.45 + 1.35 * w) * z * (lead ? 1.5 : 1), lead || i % 3 === 1 ? '#FFFFFF' : col, fade * (0.35 + 0.6 * w))
        if (w > 0.4 && i % 2) this._dot(ctx, x + ca * tt - sa * 2.2 * z, y + sa * tt + ca * 2.2 * z, 0.6 * z, col, fade * 0.35 * w)   // a faint second edge
      }
    }
    if (k < 0.5) for (let i = 0; i < 20; i++) {
      const a = inkRnd(seed * 3 + i) * 6.2832, r = L * (0.25 + 0.9 * inkRnd(i * 5.7 + seed)) * Math.pow(k / 0.5, 0.6)
      this._dot(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 0.9 * z, i % 2 ? '#FFFFFF' : col, (1 - k / 0.5) * 0.85)
    }
  }

  // fire: a comet of embers, white-hot at the head, reddening down the tail
  _fireball(ctx, x, y, dir, R, z) {
    const t = this.t
    for (let i = 0; i < 42; i++) {
      const q = inkRnd(i * 3.3), fl = inkRnd(i * 5.1 + Math.floor(t * 24))
      const px = x - dir * q * q * R * 0.34 + (fl - 0.5) * R * 0.05 * (0.3 + q)
      const py = y - q * R * 0.06 + (inkRnd(i * 7.7) - 0.5) * R * 0.08 * (0.25 + q) + Math.sin(t * 14 + i) * q * R * 0.012
      const col = q < 0.15 ? '#FFF4C8' : q < 0.4 ? '#FFC060' : q < 0.7 ? '#F07A3A' : '#B8402A'
      this._dot(ctx, px, py, (2.4 - 1.8 * q) * z, col, 0.95 - q * 0.5)
    }
  }
  // fire: the burst climbs off the target in tongues, then embers drift up and go dark
  _flameBurst(ctx, x, y, R, k, z, seed) {
    for (let i = 0; i < 60; i++) {
      const a = -Math.PI / 2 + (inkRnd(seed + i * 2.7) - 0.5) * Math.PI * 1.1, sp = 0.3 + 0.7 * inkRnd(seed + i * 5.3)
      const r = sp * R * 0.3 * Math.pow(Math.min(1, k * 1.4), 0.55), rise = k * R * 0.4 * (0.5 + sp)
      const age = Math.min(1, k * (0.8 + 0.6 * sp))
      const col = age < 0.2 ? '#FFF4C8' : age < 0.45 ? '#FFC060' : age < 0.7 ? '#F07A3A' : '#8C3A2A'
      this._dot(ctx, x + Math.cos(a) * r + Math.sin(this.t * 20 + i) * R * 0.008, y + Math.sin(a) * r * 0.8 - rise, (2.2 - 1.6 * age) * z, col, (1 - age) * 0.95)
    }
    const up = Math.sin(Math.min(1, k / 0.65) * Math.PI)
    for (let j = 0; j < 5; j++) {                                  // tall tongues: uneven, leaning, rising well above the target
      const bx = x + (j - 2) * R * 0.065 + (inkRnd(seed + j * 9) - 0.5) * R * 0.04, hgt = R * (0.3 + 0.24 * inkRnd(seed + j) + (j === 2 ? 0.1 : 0)) * up
      const lean = (inkRnd(seed + j * 4) - 0.5) * 0.12 + (j - 2) * 0.035
      for (let i = 0; i < 20; i++) {
        const q = i / 19
        const px = bx + (lean * q + Math.sin(q * 5 + this.t * 14 + j * 2) * 0.03 * q * q) * R + (inkRnd(i * 3 + j) - 0.5) * R * 0.015 * (1 - q)
        this._dot(ctx, px, y + R * 0.08 - q * hgt, (2.4 - 1.9 * q) * z, q < 0.12 ? '#FFD070' : q < 0.55 ? '#F08030' : '#C0402A', (0.8 - q * 0.45) * (1 - k))
      }
    }
  }

  // water: a crested wave, droplets shed behind it
  _wave(ctx, x, y, dir, R, z) {
    const t = this.t
    for (let i = 0; i < 38; i++) {
      const q = i / 37, px = x - dir * q * R * 0.44, py = y + Math.sin(q * 10 - t * 22) * R * 0.05 * (1 - q * 0.5)
      this._dot(ctx, px, py, (1.9 - 1.2 * q) * z, q < 0.12 ? '#EAF6FF' : '#5AA8E8', 0.95 - q * 0.6)
      if (i % 4 === 0) this._dot(ctx, px + (inkRnd(i) - 0.5) * R * 0.04, py + R * 0.03 + q * R * 0.07, 0.8 * z, '#9AD0F8', 0.6 - q * 0.4)
    }
    for (let i = 0; i < 11; i++) { const a = (i / 10) * Math.PI * 1.25; this._dot(ctx, x + dir * Math.sin(a) * R * 0.055, y - R * 0.075 + (1 - Math.cos(a)) * R * 0.045, 1.3 * z, '#EAF6FF', 0.9) }
  }
  // water: frost rings spread, six-armed crystals form, hang and melt, frost dust settles
  _frost(ctx, x, y, R, k, z, seed, landed) {
    for (let r = 0; r < 3; r++) {
      const kr = k - r * 0.13
      if (kr <= 0 || kr >= 1) continue
      this._ring(ctx, x, y, R * (0.06 + 0.42 * Math.pow(kr, 0.7)), 0.62, r === 0 ? '#EAF6FF' : '#5AA8E8', (1 - kr) * 0.95, (1.3 - kr * 0.6) * z, 48, r)
    }
    if (!landed) return
    const ca = k < 0.08 ? 0 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
    for (let c = 0; c < 7; c++) {
      const cx = x + (inkRnd(seed + c * 3.1) - 0.5) * R * 0.5, cy = y + (inkRnd(seed + c * 5.9) - 0.5) * R * 0.45
      const sz = R * (0.018 + 0.02 * inkRnd(seed + c)) * Math.min(1, k / 0.2)
      this._dot(ctx, cx, cy, 1.2 * z, '#FFFFFF', ca)
      for (let a = 0; a < 6; a++) { const an = a * Math.PI / 3 + c; for (let j = 1; j <= 2; j++) this._dot(ctx, cx + Math.cos(an) * sz * j, cy + Math.sin(an) * sz * j, (1 - j * 0.25) * z, '#CFEAFF', ca * 0.9) }
    }
    for (let i = 0; i < 20; i++) this._dot(ctx, x + (inkRnd(seed + i * 1.7) - 0.5) * R * 0.6, y - R * 0.1 + k * R * 0.3 * (0.4 + inkRnd(i * 2.3)), 0.8 * z, '#DDF2FF', (1 - k) * 0.6)
  }

  // wood: shoots race along the ground toward the target, fading behind the head
  _sprouts(ctx, ox, hx, gy, dir, R, z, col, seed) {
    const stepX = R * 0.045, n = Math.floor(Math.abs(hx - ox) / stepX)
    for (let i = 0; i < n; i++) {
      const sx = ox + dir * i * stepX, back = (n - i) / Math.max(1, n), a = Math.max(0, 1 - back * 1.3)
      const hgt = R * (0.03 + 0.04 * inkRnd(seed + i)) * (0.4 + 0.6 * a)
      for (let j = 0; j < 4; j++) this._dot(ctx, sx + dir * j * 0.9 * z, gy - 1 - j * hgt / 3, (1.3 - j * 0.22) * z, j === 3 ? '#C8F4A8' : col, a * 0.9)
    }
    for (let i = 0; i < 8; i++) this._dot(ctx, hx + (inkRnd(i * 3 + seed) - 0.5) * R * 0.06, gy - inkRnd(i * 7) * R * 0.05, 1 * z, '#6A5A40', 0.7)   // clods thrown up
  }
  // wood: thorned vines burst up from the ground and coil at the target, then wither back
  _vines(ctx, x, gy, ty, R, k, z, seed, col) {
    const grow = Math.min(1, k / 0.35), fade = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4)
    for (let j = 0; j < 4; j++) {
      const x0 = x + (j - 1.5) * R * 0.12 + (inkRnd(seed + j) - 0.5) * R * 0.05
      const H = Math.max(R * 0.2, (gy - ty) + R * (0.08 + 0.2 * inkRnd(seed * 3 + j)))
      const N = 36, n = Math.round(N * grow), ph = inkRnd(seed + j * 7) * 6
      for (let i = 0; i < n; i++) {
        const q = i / N, px = x0 + Math.sin(q * 6 + ph) * R * 0.1 * (0.3 + q), py = gy - q * H
        const tip = i >= n - 2
        this._dot(ctx, px, py, (1.7 - q * 0.9) * z * (tip ? 1.2 : 1), tip ? '#E8FFD8' : i % 5 === 0 ? '#3E8A48' : col, fade * (0.55 + 0.4 * (1 - q)))
        if (i % 6 === 3) {                                       // a leaf / a thorn to alternate sides
          const sd = i % 12 === 3 ? 1 : -1
          for (let l = 1; l <= 3; l++) this._dot(ctx, px + sd * l * 1.7 * z, py - l * 1.1 * z, (1.15 - l * 0.22) * z, l === 3 ? '#E8FFD8' : '#9AE07A', fade * 0.75)
        }
      }
    }
  }

  // earth: boulders of dots fall onto the target, shatter, and a dust ring runs out along the ground
  _stones(ctx, tx, ty, R, p, k, z, seed, col, gy) {
    const e = Math.max(0, Math.min(1, p))
    for (let j = 0; j < 3; j++) {
      const rx = tx + (j - 1) * R * 0.15, ry = ty + (j === 1 ? -R * 0.03 : R * 0.08), r = R * (j === 1 ? 0.13 : 0.09)
      if (p > 0 && p < 1 && !this.calm) {
        const fy = ry - (1 - e * e) * R * (0.95 + j * 0.2)
        this._stone(ctx, rx + (1 - e) * R * 0.06 * (j - 1), fy, r, col, 0.95, seed + j, z)
        for (let i = 1; i <= 4; i++) this._dot(ctx, rx + (inkRnd(i + j) - 0.5) * r, fy - r - i * R * 0.03, 0.8 * z, '#9C8A6A', 0.5 * (1 - i / 5))   // a dust trail
      }
      if (k >= 0 && k <= 1) {
        if (k < 0.4) this._stone(ctx, rx, ry + k * R * 0.1, r * (1 - k * 0.9), col, 1 - Math.pow(k / 0.4, 2), seed + j, z)   // it sits, cracks, crumbles
        for (let i = 0; i < 11; i++) {                            // fragments on parabolas
          const side = (i % 2 ? 1 : -1) * (0.4 + inkRnd(seed + j * 11 + i)), vx = side * R * 0.45, vy = -R * 0.12 * inkRnd(seed * 2 + i + j)
          const fy = Math.min(gy - 1, ry + vy * k + R * 1.3 * k * k)   // flung out and down, coming to rest on the ground
          this._dot(ctx, rx + vx * Math.min(1, k * 1.3), fy, (2.4 - 1.2 * k) * z, i % 3 ? col : '#F0DCB0', (1 - k * 0.8) * 0.95)
        }
      }
    }
    if (k >= 0 && k <= 1) {
      this._ring(ctx, tx, gy, R * (0.15 + 0.75 * Math.pow(k, 0.6)), 0.16, '#D8C090', (1 - k) * 0.95, 1.7 * z, 72)
      this._ring(ctx, tx, gy, R * (0.1 + 0.5 * Math.pow(k, 0.6)), 0.16, '#F0DCB0', (1 - k) * 0.7, 1.2 * z, 48, 0.4)
      for (let i = 0; i < 18; i++) {                                // dust puffs rising off the ring
        const an = inkRnd(seed + i * 3.3) * 6.2832, rr = R * (0.15 + 0.6 * Math.pow(k, 0.6))
        this._dot(ctx, tx + Math.cos(an) * rr, gy + Math.sin(an) * rr * 0.16 - k * R * 0.08 * inkRnd(i), 1.6 * z, '#B8A078', (1 - k) * 0.6)
      }
    }
  }
  // one boulder: an angular outline filled with a hex grid of dots, lit from the moon (upper right)
  _stone(ctx, x, y, r, col, a, seed, z) {
    if (r < 1 || a <= 0.01) return
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'source-over'
    const V = 7, pts = []
    for (let i = 0; i < V; i++) { const an = (i / V) * 6.2832 + inkRnd(seed * 1.3 + i) * 0.5, rr = r * (0.72 + 0.34 * inkRnd(seed * 2.1 + i)); pts.push([Math.cos(an) * rr, Math.sin(an) * rr * 0.86]) }
    const inside = (px, py) => { let c = false; for (let i = 0, j = V - 1; i < V; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c } return c }
    const st = Math.max(1.7 * z, r / 5.5)
    let row = 0
    for (let py = -r; py <= r; py += st * 0.87, row++) for (let px = -r + (row & 1 ? st / 2 : 0); px <= r; px += st) {
      if (!inside(px, py)) continue
      const lit = Math.max(0, Math.min(1, 0.5 + (px - py) / (r * 1.8)))
      this._dot(ctx, x + px, y + py, st * (0.3 + 0.14 * lit), inkMix('#6A5840', inkMix(col, '#F4E2B8', 0.35), lit), a * (0.7 + 0.3 * lit))
    }
    for (let i = 0; i < V; i++) {                                   // a lit rim on the moon side, a dark one below
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % V], lit = ((x0 + x1) - (y0 + y1)) / (4 * r) + 0.5
      for (let q = 0; q < 1; q += 0.2) this._dot(ctx, x + x0 + (x1 - x0) * q, y + y0 + (y1 - y0) * q, st * 0.32, lit > 0.5 ? '#FFF0CC' : '#2A2018', a * (lit > 0.5 ? 0.9 : 0.7))
    }
    ctx.globalCompositeOperation = op
  }

  // a parried blow: a six-sided ward flares in front of the defender, the attack's motes fly back
  _parryWard(ctx, x, y, dir, R, k, z, wardCol, atkCol, seed) {
    const rH = R * 0.2 * (1 + 0.15 * k), a = Math.pow(1 - k, 0.7)
    const V = i => { const an = i * Math.PI / 3 + Math.PI / 6; return [x + Math.cos(an) * rH * 0.42, y + Math.sin(an) * rH] }
    for (let s = 0; s < 6; s++) {
      const [x0, y0] = V(s), [x1, y1] = V(s + 1)
      for (let i = 0; i < 9; i++) { const q = i / 9; this._dot(ctx, x0 + (x1 - x0) * q, y0 + (y1 - y0) * q, (i ? 1.2 : 2) * z, i ? wardCol : '#FFFFFF', a * (i ? 0.85 : 1)) }
    }
    if (k < 0.3) for (let r = 0; r < 12; r++) {                  // the flash
      const an = r * Math.PI / 6, L = R * 0.14 * (k / 0.3)
      for (let i = 1; i <= 4; i++) this._dot(ctx, x + Math.cos(an) * (rH * 0.3 + L * i / 4) * 0.6, y + Math.sin(an) * (rH * 0.3 + L * i / 4), 0.9 * z, '#FFFFFF', (1 - k / 0.3) * 0.9)
    }
    for (let i = 0; i < 22; i++) {
      const sp = 0.3 + 0.7 * inkRnd(seed + i * 2.3)
      this._dot(ctx, x - dir * R * 0.38 * k * sp, y + (inkRnd(seed + i * 4.1) - 0.5) * R * 0.34 * k, (1.4 - k) * z, atkCol, (1 - k) * 0.8)
    }
  }

  // held wards, one look per element (behind the figure)
  _elWard(ctx, el, x, y, dir, r, on, z, glow) {
    if (on <= 0.01) return
    const t = this.calm ? 0 : this.t
    const at = q => { const a = -1.05 + q * 2.1; return [x + dir * Math.cos(a) * r, y + Math.sin(a) * r * 1.15, a] }
    if (el === 'metal') {                                          // a fan of upright blades standing out of the arc
      for (let b = 0; b < 9; b++) {
        const [bx, by, a] = at(b / 8), ux = dir * Math.cos(a), uy = Math.sin(a) * 1.15
        for (let j = 0; j < 8; j++) { const q = j / 7; this._dot(ctx, bx + ux * q * r * 0.2, by + uy * q * r * 0.2, (1.5 - q * 0.9) * z, q > 0.8 ? '#FFFFFF' : '#D8DCE6', on * (0.5 + 0.45 * (1 - q))) }
      }
    } else if (el === 'wood') {                                    // two woven strands, leaves on the crossings
      for (let i = 0; i < 70; i++) {
        const q = i / 69, [bx, by, a] = at(q), ux = dir * Math.cos(a), uy = Math.sin(a) * 1.15
        for (const sgn of [1, -1]) { const o = sgn * Math.sin(q * 18 + t * 1.5) * r * 0.06; this._dot(ctx, bx + ux * o, by + uy * o, 1.25 * z, sgn > 0 ? '#6CC46A' : '#3E8A48', on * 0.8) }
        if (i % 9 === 4) this._dot(ctx, bx + ux * r * 0.07, by + uy * r * 0.07, 1.6 * z, '#B8F0A0', on * 0.8)
      }
    } else if (el === 'water') {                                   // a flowing arc, light running along it, drops falling off
      for (let i = 0; i < 64; i++) {
        const q = i / 63, [bx, by] = at(q), lum = 0.5 + 0.5 * Math.sin(q * 14 - t * 6)
        this._dot(ctx, bx, by, (1 + 0.8 * lum) * z, lum > 0.8 ? '#EAF6FF' : '#5AA8E8', on * (0.35 + 0.55 * lum))
        const [ix, iy] = [x + (bx - x) * 0.88, y + (by - y) * 0.88]
        if (i % 2) this._dot(ctx, ix, iy, 0.8 * z, '#5AA8E8', on * 0.35)
      }
      for (let i = 0; i < 6; i++) { const ph = (t * 0.9 + inkRnd(i * 3.7)) % 1, [bx, by] = at(0.6 + inkRnd(i) * 0.4); this._dot(ctx, bx, by + ph * r * 0.5, 1 * z, '#9AD0F8', on * (1 - ph) * 0.7) }
    } else if (el === 'fire') {                                    // a wall of flame tongues along the arc
      for (let i = 0; i < 34; i++) {
        const [bx, by] = at(i / 33), h = r * (0.1 + 0.08 * inkRnd(i * 2.9)) * (0.7 + 0.3 * Math.sin(t * 9 + i * 1.7))
        for (let j = 0; j < 4; j++) { const q = j / 3; this._dot(ctx, bx + Math.sin(t * 12 + i + j) * 1.2 * z, by - q * h, (1.6 - q * 0.9) * z, q < 0.3 ? '#FFE08A' : q < 0.7 ? '#F07A3A' : '#B8402A', on * (0.85 - q * 0.4)) }
      }
    } else if (el === 'earth') {                                   // three stones rise out of the ground in front
      for (let b = 0; b < 3; b++) {
        const [bx, by] = at(0.2 + b * 0.3)
        this._stone(ctx, bx, by + (1 - on) * r * 0.6, r * 0.24, '#C8A060', Math.min(1, on * 1.6), 7.1 + b, z)
      }
    } else {
      for (let i = 0; i < 46; i++) {
        const [bx, by, a] = at(i / 45)
        this._dot(ctx, bx, by, (1.1 + 0.8 * (1 - Math.abs(a))) * z, glow, (0.35 + 0.5 * inkRnd(i * 3.1 + Math.floor(t * 12))) * on)
      }
    }
  }

  _healFx(ctx, g, A, x, R, u, z) {
    const top = A.top ?? g.ground - R, h = A.h ?? R, base = top + h, env = Math.sin(u * Math.PI)
    for (let i = 0; i < 36; i++) {
      const ph = (u * 1.4 + inkRnd(i * 3.3)) % 1, an = i * 2.4 + u * 7, front = Math.sin(an) > 0
      this._dot(ctx, x + Math.cos(an) * R * 0.2 * (1 - ph * 0.4), base - ph * h * 0.95, (1.7 - ph) * z, front ? '#9AE6C8' : '#DDF8EC', env * (1 - ph) * (front ? 0.95 : 0.5))
    }
    this._ring(ctx, x, base - 2, R * 0.26, 0.2, '#9AE6C8', env * 0.6, 1.1 * z, 40, u * 2)
  }
  _buffFx(ctx, g, A, x, R, u, z, col) {
    const top = A.top ?? g.ground - R, h = A.h ?? R, base = top + h, y = base - u * h * 0.9
    this._ring(ctx, x, y, R * 0.22, 0.25, col, Math.sin(u * Math.PI), 1.3 * z, 44, u * 4)
    for (let i = 0; i < 14; i++) this._dot(ctx, x + (inkRnd(i * 3.1) - 0.5) * R * 0.44, y + inkRnd(i * 5.3) * h * 0.2, 1 * z, '#FFF6D8', Math.sin(u * Math.PI) * 0.7 * inkRnd(i + Math.floor(this.t * 10)))
  }
  // Circulate: breath and Qi drawn inward to the dantian
  _circulate(ctx, x, y, R, u, z, col) {
    const env = Math.sin(u * Math.PI)
    for (let i = 0; i < 34; i++) {
      const ph = (u * 1.6 + inkRnd(i * 2.9)) % 1, an = inkRnd(i * 4.7) * 6.2832 + ph * 2.2, r = R * 0.48 * (1 - ph)
      this._dot(ctx, x + Math.cos(an) * r, y + R * 0.06 + Math.sin(an) * r * 0.85, (0.8 + ph) * z, i % 4 ? col : '#F6E2A0', env * (0.2 + 0.75 * ph))
    }
    if (u > 0.55) this._ring(ctx, x, y + R * 0.06, R * 0.05 + R * 0.12 * (u - 0.55) / 0.45, 0.8, '#EAF6FF', (1 - u) * 1.6, 1 * z, 22)
  }
  // a charge being gathered: an orb of the element grows in the hand, motes pulled in
  _gatherFx(ctx, x, y, R, u, z, col) {
    this._orb(ctx, x, y, R * (0.03 + 0.06 * Math.min(1, u / 0.7)), col, z, 1)
    for (let i = 0; i < 24; i++) {
      const ph = (u * 1.5 + inkRnd(i * 3.9)) % 1, an = inkRnd(i * 6.1) * 6.2832, r = R * 0.35 * (1 - ph)
      this._dot(ctx, x + Math.cos(an) * r, y + Math.sin(an) * r, (0.7 + ph) * z, col, Math.sin(u * Math.PI) * ph)
    }
  }
  _orb(ctx, x, y, r, col, z, a) {
    const t = this.calm ? 0 : this.t
    this._dot(ctx, x, y, Math.max(1.5, r * 0.35), '#FFFFFF', a * 0.9)
    for (let ring = 1; ring <= 3; ring++) this._ring(ctx, x, y, r * ring / 3, 1, ring === 1 ? inkMix(col, '#FFFFFF', 0.5) : col, a * (1 - ring * 0.2), (1.3 - ring * 0.2) * z, 8 + ring * 6, t * (ring % 2 ? 1.5 : -1.2))
  }
  // hex: a sigil of the status' colour flies at the target and breaks into it (or fizzles grey when it does not take)
  _hexFx(ctx, S, R, u, z, fx, el) {
    const stId = fx.status || (typeof ART_ELEMENTS !== 'undefined' ? ART_ELEMENTS[el]?.status : null)
    const col = BattleScene.ST[stId] || BattleScene.EL[el]
    const p = Math.max(0, Math.min(1, (u - 0.15) / 0.3)), e = 1 - (1 - p) * (1 - p)
    const x = S.ax + S.dir * R * 0.2 + (S.dx - S.ax - S.dir * R * 0.2) * e, y = S.ay + (S.dy - S.ay) * e - Math.sin(p * Math.PI) * R * 0.12
    const r = R * 0.075, k = (u - 0.45) / 0.5
    if (p > 0 && k < 0) {
      const spin = this.calm ? 0 : this.t * 3
      this._ring(ctx, x, y, r, 1, col, 0.9, 1.1 * z, 20, spin)
      for (let a = 0; a < 4; a++) { const an = spin * -1.3 + a * Math.PI / 2; for (let i = 1; i <= 3; i++) this._dot(ctx, x + Math.cos(an) * r * i / 4, y + Math.sin(an) * r * i / 4, 1 * z, '#FFFFFF', 0.8) }
    }
    if (k >= 0 && k <= 1) {
      if (fx.status) { this._ring(ctx, S.dx, S.dy, R * (0.08 + 0.4 * Math.pow(k, 0.6)), 0.8, col, (1 - k) * 0.9, 1.3 * z, 40); this._burst(ctx, S.dx, S.dy, R * 0.7, k, z, col, 5.5) }
      else this._burst(ctx, S.dx - S.dir * R * 0.15, S.dy, R * 0.4, k, z, '#8C88AA', 2.2)
    }
  }
  // drain: motes of the target's life flow back along an arc to the attacker
  _drainFx(ctx, S, R, k, z) {
    for (let i = 0; i < 24; i++) {
      const q = Math.max(0, Math.min(1, k * 1.4 - inkRnd(i * 3.3) * 0.4))
      if (q <= 0 || q >= 1) continue
      const x = S.dx + (S.ax - S.dx) * q, y = S.dy + (S.ay - S.dy) * q - Math.sin(q * Math.PI) * R * 0.2 + (inkRnd(i * 5.1) - 0.5) * R * 0.06
      this._dot(ctx, x, y, 1.3 * z, i % 3 ? '#D8708A' : '#FFD8E0', Math.sin(q * Math.PI) * 0.9)
    }
  }

  // ── Status auras: drawn on each figure for as long as the status lasts (the plates' chips count the turns) ──
  _auras(ctx, g, Y, F) {
    const t = this.calm ? 0 : this.t, R = g.figH, z = this._z(g)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    try { this._auras2(ctx, g, Y, F, t, R, z) } finally { ctx.restore() }
  }
  _auras2(ctx, g, Y, F, t, R, z) {
    for (const [side, o] of [['you', Y], ['foe', F]]) {
      const st = this.status[side]
      if (!st || o.a <= 0.05 || o.top == null || o.d > 0) continue
      const person = side === 'you' || this.foe.person, dir = side === 'you' ? 1 : -1
      const bw = o.w * (person ? 0.42 : 0.62), top = o.top + o.h * (person ? 0.14 : 0.12), bot = o.top + o.h, bh = bot - top, cx = o.cx
      const A = o.a
      if (st.burn) for (let i = 0; i < 14; i++) {                  // embers rising off the edges and shoulders as short streaks
        const ph = (t * 0.9 + inkRnd(i * 1.7)) % 1, edge = i % 2 ? 1 : -1
        const px = cx + edge * bw * (0.38 + 0.14 * inkRnd(i * 3.1)) + Math.sin(t * 5 + i) * 1.5 * z, py = top + bh * (0.15 + 0.45 * inkRnd(i * 5.3)) - ph * R * 0.22
        for (let j = 0; j < 3; j++) this._dot(ctx, px, py + j * 2.2 * z, (1.6 - j * 0.45) * z, j === 0 ? '#FFE08A' : '#F07A3A', A * (1 - ph) * (0.75 - j * 0.2))
      }
      if (st.chill) {
        this._ring(ctx, cx, bot - 1, bw * 0.62, 0.16, '#DDF2FF', A * 0.9, 1.4 * z, 56)
        this._ring(ctx, cx, bot - 1, bw * 0.48, 0.16, '#8CC8F0', A * 0.6, 1.1 * z, 40, 0.3)
        for (let i = 0; i < 16; i++) {
          const ph = (t * 0.22 + inkRnd(i * 2.3)) % 1
          this._dot(ctx, cx + (inkRnd(i * 4.1) - 0.5) * bw * 1.2 + Math.sin(t + i) * 3, top + ph * bh, 0.9 * z, '#DDF2FF', A * 0.65 * (1 - ph * 0.5))
        }
        for (let i = 0; i < 6; i++) this._dot(ctx, cx + (inkRnd(i * 9.1) - 0.5) * bw * 0.8, top + inkRnd(i * 6.7) * bh, 1.2 * z, '#FFFFFF', A * 0.8 * (0.5 + 0.5 * Math.sin(t * 3 + i * 2)))   // rime glints
      }
      if (st.bleed) ctx.globalCompositeOperation = 'source-over'   // blood is dark, not light
      if (st.bleed) for (let i = 0; i < 9; i++) {
        const ph = (t * 0.7 + inkRnd(i * 3.9)) % 1, px = cx + (inkRnd(i * 2.1) - 0.5) * bw * 0.7, y0 = top + bh * (0.3 + 0.25 * inkRnd(i * 7.7)), py = y0 + ph * ph * (bot - y0)
        this._dot(ctx, px, py, 2.6 * z, '#E0483E', A * (1 - ph * 0.5))
        this._dot(ctx, px, py - 2.6 * z, 1.4 * z, '#F08070', A * (1 - ph) * 0.8)
        this._dot(ctx, px, py - 4.6 * z, 0.9 * z, '#F08070', A * (1 - ph) * 0.5)
        this._dot(ctx, px + (inkRnd(i) - 0.5) * 6 * z, bot - 1, 1.3 * z, '#B8302A', A * 0.8)
      }
      ctx.globalCompositeOperation = 'lighter'
      if (st.entangle) for (let i = 0; i < 72; i++) {
        const q = i / 71, an = q * 15 + t * 0.8, front = Math.sin(an) > 0
        const px = cx + Math.cos(an) * bw * 0.55, py = bot - q * bh * 0.4
        this._dot(ctx, px, py, 1.35 * z, front ? '#6CC46A' : '#2E6A38', A * (front ? 0.9 : 0.35))
        if (i % 9 === 4 && front) this._dot(ctx, px + 2 * z, py - 1.5 * z, 1.4 * z, '#B8F0A0', A * 0.8)
      }
      if (st.daze) for (let j = 0; j < 4; j++) {
        const an = t * 2.2 + j * Math.PI / 2, sx = cx + Math.cos(an) * bw * 0.36, sy = top - R * 0.02 + Math.sin(an) * bw * 0.1, al = A * (Math.sin(an) > 0 ? 0.95 : 0.5)
        this._dot(ctx, sx, sy, 1.5 * z, '#FFF0C0', al)
        for (let a = 0; a < 4; a++) this._dot(ctx, sx + Math.cos(a * Math.PI / 2) * 3 * z, sy + Math.sin(a * Math.PI / 2) * 3 * z, 0.8 * z, '#E8C878', al * 0.8)
      }
      if (st.seal) {
        const sy = top + bh * 0.38, r = bw * 0.34
        this._ring(ctx, cx, sy, r, 1, '#B89AE8', A * 0.8, 1.2 * z, 36, t * 0.6)
        for (let i = 0; i < 8; i++) { const an = -t * 0.6 + i * Math.PI / 4; for (let j = 1; j <= 2; j++) this._dot(ctx, cx + Math.cos(an) * r * (1 + j * 0.12), sy + Math.sin(an) * r * (1 + j * 0.12), 0.9 * z, '#D8C8F8', A * 0.55) }
      }
      if (st.guardbreak) for (let i = 0; i < 30; i++) {
        if (i % 7 === 3 || i % 7 === 4) continue                  // the cracks
        const a = -0.9 + (i / 29) * 1.8
        this._dot(ctx, cx + dir * (bw * 0.5 + Math.cos(a) * bw * 0.3), top + bh * 0.4 + Math.sin(a) * bh * 0.35 + (i % 7 === 5 ? ((t * 20) % 6) : 0), 1.1 * z, '#E86060', A * 0.55)
      }
      if (st.charge) this._orb(ctx, cx + dir * bw * 0.62, top + bh * 0.35, R * (0.07 + 0.012 * Math.sin(t * 5)), BattleScene.EL[st.charge] || '#F0D060', z, A)
    }
  }

  // ── The parry wind-up on the field (the panel's ring, mirrored on you) + the press flash ──
  _teleDraw(ctx, g, Y, F) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    try { this._teleDraw2(ctx, g, Y, F) } finally { ctx.restore() }
  }
  _teleDraw2(ctx, g, Y, F) {
    const T = this.tele, R = g.figH, z = this._z(g)
    if (T && Y.top != null && Y.a > 0.05) {
      const k = Math.max(0, Math.min(1, T.k)), cx = Y.cx, cy = Y.top + Y.h * 0.5
      const col = T.hot ? '#9AE6C8' : BattleScene.EL[T.el || 'neutral'], r0 = R * 0.26
      this._ring(ctx, cx, cy, r0, 1.25, T.hot ? '#EAFFF6' : '#E8E2F4', T.hot ? 0.95 : 0.3 + 0.35 * (1 - k), (T.hot ? 1.5 : 1) * z, 56)   // the mark
      if (!this.calm && k > 0.01) {
        const r = r0 * (1 + 1.1 * k)
        this._ring(ctx, cx, cy, r, 1.25, col, 0.45 + 0.5 * (1 - k), 1.3 * z, 64, k * 2)
        for (let q = 0; q < 4; q++) { const an = q * Math.PI / 2; this._dot(ctx, cx + Math.cos(an) * r, cy + Math.sin(an) * r * 1.25, 2.2 * z, '#FFFFFF', 0.5 + 0.5 * (1 - k)) }
      }
      if (F.top != null) {                                          // its blow gathering in front of it
        const fx0 = F.cx - R * 0.3, fy0 = F.top + F.h * 0.4, w = 0.35 + 0.65 * (1 - k), ec = BattleScene.EL[T.el || 'neutral']
        for (let i = 0; i < 40; i++) {                              // a swirl of its Qi drawn into the blow it is about to throw
          const ph = ((this.calm ? 0.5 : this.t * 1.6) + inkRnd(i * 3.3)) % 1, an = inkRnd(i * 5.9) * 6.2832 + ph * 2.4, r = R * 0.34 * (1 - ph)
          this._dot(ctx, fx0 + Math.cos(an) * r, fy0 + Math.sin(an) * r * 0.8, (1 + 1.2 * ph) * z, ec, w * (0.3 + 0.7 * ph))
        }
        this._ring(ctx, fx0, fy0, R * (0.04 + 0.05 * w), 1, ec, w, 1.3 * z, 16, this.t * 3)
        this._dot(ctx, fx0, fy0, (2 + 3 * w) * z, '#FFFFFF', w * 0.85)
      }
    }
    const pf = this.pf
    if (pf && Y.top != null && this.t - pf.t0 < 0.5 && this.t >= pf.t0) {
      const k = (this.t - pf.t0) / 0.5, x = Y.cx + R * 0.28, y = Y.top + Y.h * 0.5
      if (pf.ok) this._parryWard(ctx, x, y, -1, R, k, z, '#9AE6C8', '#FFFFFF', 3.3)
      else this._ring(ctx, x, y, R * (0.12 + 0.1 * k), 1.8, '#E8836F', (1 - k) * 0.8, 1.1 * z, 18, 0.3)
    }
  }

  _floaters(ctx, g, Y, F) {
    for (const f of this.floaters) {
      const k = (this.t - f.t0) / 1.2
      if (k < 0 || k > 1) continue
      const o = f.side === 'you' ? Y : F
      const x = o.cx ?? (f.side === 'you' ? g.youX : g.foeX), y = (o.top ?? g.ground - g.figH) - 6 - k * g.figH * 0.18
      const size = Math.max(12, Math.round(g.figH * 0.09))
      ctx.font = `700 ${size}px "Courier New", Consolas, monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillStyle = inkRgba('#07050F', 0.7 * (1 - k)); ctx.fillText(f.text, x + 1, y + 1)
      ctx.fillStyle = inkRgba(f.col, 1 - k * k); ctx.fillText(f.text, x, y)
      if (f.sub) {                                              // 1.13b: why, small, under the number
        const s2 = Math.max(11, Math.round(size * 0.66))
        ctx.font = `700 ${s2}px "Courier New", Consolas, monospace`; ctx.textBaseline = 'top'
        ctx.fillStyle = inkRgba('#07050F', 0.7 * (1 - k)); ctx.fillText(f.sub, x + 1, y + 3)
        ctx.fillStyle = inkRgba(inkMix(f.col, '#F4ECD8', 0.35), 0.95 * (1 - k * k)); ctx.fillText(f.sub, x, y + 2)
      }
    }
  }
}

if (typeof module !== 'undefined') module.exports = { BattleScene }
