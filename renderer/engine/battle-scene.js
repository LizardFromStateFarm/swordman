// Review score: 8.0 (asset gate, cycle 2 reviewer agent, 2026-09-28)
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
// Test hooks: freeze(t) holds one exact moment; perf(n) = ms per frame.

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
  }

  _fig(ink) { return { ink, art: null, crop: null, glow: '#87CEEB' } }

  // youState: INK_ART sprite state · youColor: stage colour · foeArt: INK_BEASTS key · foeGlow: its glow colour
  setup({ youState, youColor, youSlots = null, foeArt, foeGlow, reducedMotion = false, speed = 1 }) {
    this.calm = !!reducedMotion; this.speed = speed > 0 ? speed : 1
    const Y = this.you
    Y.glow = youColor || '#87CEEB'
    Y.ink.setStageColor(Y.glow); Y.ink.setReducedMotion(this.calm)
    if (youSlots) Y.ink.setSlots(youSlots)
    Y.ink.setState(youState); Y.ink.stop(); Y.art = youState
    if (!this.foe.ink || this.foe.art !== foeArt) {
      this.foe.ink = new InkRenderer(document.createElement('canvas'), { table: INK_BEASTS, bare: true })
      this.foe.art = foeArt
    }
    const F = this.foe
    F.glow = foeGlow || INK_BEASTS[foeArt]?.glow || '#7A6AB0'
    F.ink.setStageColor(F.glow); F.ink.setReducedMotion(this.calm)
    F.ink.setState(foeArt); F.ink.stop()
    for (const f of [Y, F]) { f.ink.death = 0; f.ink.bt = 0; f.ink.btTarget = 0; f.ink.fail = 0; f.dis = null; f.d = 0 }
    this.queue = []; this.cur = null; this.floaters = []
    this.pose = { you: 'idle', foe: 'idle' }
    this.geo = null
  }

  // ev: { type: 'ex', you, them, won, dmg } | { type: 'won' | 'finish' | 'spare' | 'flee' | 'bind' | 'lost' | 'died' | 'retreat' }
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

  _begin(ev) {
    const g = this._layout()
    if (ev.type === 'ex' && ev.dmg) this._floater('you', `−${ev.dmg}`, '#E8836F', this.t + this.cur.dur * 0.42)
    void g
  }

  // One wound number per side at a time (a quick second exchange replaces the first instead of stacking on it)
  _floater(side, text, col, t0) { this.floaters = this.floaters.filter(f => f.side !== side); this.floaters.push({ side, text, col, t0 }) }

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
    if (ev) {
      if (ev.type === 'ex' && ev.dmg && u > 0.42) this._floater('you', `−${ev.dmg}`, '#E8836F', this.cur.t0 + this.cur.dur * 0.42)
    }
    this._draw()
  }
  perf(n = 60) {
    const t0 = performance.now(), ev = { type: 'ex', you: 'press', them: 'feint', won: true }
    this.cur = { ev, t0: this.t, dur: 1 }
    for (let i = 0; i < n; i++) { this.t += 1 / n; this._draw() }
    this.cur = null
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
    this._sizeFig(this.foe, INK_BEASTS, figH * 1.08, 0.04)
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
    if (ev?.type === 'ex') this._wards(ctx, g, ev, u, Y, F)
    this._drawFig(ctx, g, this.foe, F)
    this._drawFig(ctx, g, this.you, Y)
    if (ev?.type === 'ex') this._strikes(ctx, g, ev, u, Y, F)
    if (ev?.type === 'bind') this._bindRing(ctx, g, u, F)
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
      if (!calm) {
        if (ev.you === 'press') o.x += reach * BattleScene._lunge(u)
        if (ev.you === 'feint') { o.x += reach * 0.45 * Math.sin(Math.min(1, u / 0.45) * Math.PI); o.ghosts = Math.sin(Math.min(1, u / 0.5) * Math.PI) }
        if (ev.you === 'guard') o.x -= reach * 0.12 * Math.sin(Math.min(1, u / 0.5) * Math.PI)
      }
      if (!ev.won) { const h = BattleScene._hit(u); o.flash = h * 0.7; if (!calm) o.shake = h * 5; o.x -= calm ? 0 : reach * 0.35 * h }
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
    if (!ev) return o
    if (ev.type === 'ex') {
      if (!calm) {
        if (ev.them === 'press') o.x -= reach * BattleScene._lunge(u)
        if (ev.them === 'feint') { o.x -= reach * 0.4 * Math.sin(Math.min(1, u / 0.45) * Math.PI); o.ghosts = Math.sin(Math.min(1, u / 0.5) * Math.PI) }
        if (ev.them === 'guard') o.crouch = 0.05 * Math.sin(Math.min(1, u / 0.6) * Math.PI)
      }
      if (ev.won) { const h = BattleScene._hit(u); o.flash = h * 0.8; if (!calm) o.shake = h * 6; o.x += calm ? 0 : reach * 0.3 * h }
      else o.bt = 0.4 * BattleScene._hit(u)
    }
    if (ev.type === 'won') { o.sink = 0.07 * u; o.crouch = 0.08 * u; o.a = 1 - 0.4 * u; o.flash = (1 - u) * 0.5 }
    if (ev.type === 'finish') { o.sink = 0.07; o.crouch = 0.08; o.a = 1; o.d = Math.min(1, u * 1.1) }
    if (ev.type === 'spare' || ev.type === 'flee') { o.sink = 0.07 * (1 - u); o.a = 0.6 * (1 - u * u); o.x += calm ? 0 : g.W * 0.3 * u * u }
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
    if (o.ghosts > 0.02) {                                   // feint afterimages, trailing to either side
      ctx.globalAlpha = 0.22 * o.ghosts * o.a
      ctx.drawImage(ink.cv, sx, sy, sw, sh, dx - dw * 0.1 * o.ghosts, dy, dw, dh)
      ctx.drawImage(ink.cv, sx, sy, sw, sh, dx + dw * 0.1 * o.ghosts, dy, dw, dh)
    }
    o.cx = o.x + shx; o.cy = dy + dh * 0.5; o.top = dy; o.w = dw; o.h = dh
    if (o.d > 0) return this._dissolve(ctx, f, o, [sx, sy, sw, sh], [dx, dy, dw, dh])
    ctx.globalAlpha = o.a
    ctx.drawImage(ink.cv, sx, sy, sw, sh, dx, dy, dw, dh)
    ctx.globalAlpha = 1
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
        p.drift = (0.25 + 0.6 * inkRnd(p.x * 13 + p.y * 7)) * (f === this.foe ? 1 : -1)
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
    if (ev.them === 'press') {
      const p = Math.min(1, Math.max(0, (u - 0.28) / 0.2)), fade = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.25)
      if (p > 0 && fade > 0) this._claws(ctx, ev.won ? mid - g.figH * 0.1 : g.youX + g.figH * 0.08, y - g.figH * 0.05, g.figH * 0.36, p, fade, this.foe.glow)
    }
    // the clash: a burst of dots on whoever lost the exchange
    const burst = u > 0.4 && u < 0.85 ? (u - 0.4) / 0.45 : 0
    if (burst > 0) {
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
  _crescent(ctx, x, y, r, col, alpha, dir, scatter = 0) {
    ctx.save()
    for (let i = 0; i < 56; i++) {
      const k = i / 55, a = -1.25 + k * 2.5
      const thick = Math.sin(k * Math.PI)
      for (let j = 0; j < 3; j++) {                                      // rows across the band: gold edges, a pale core
        const rr = r * (1 - j * 0.085 * thick)
        const jit = (inkRnd(i * 7.3 + j * 1.9) - 0.5) * (1.6 + scatter * r * 0.9)
        const px = x + dir * (Math.cos(a) * rr - r * 0.55) + jit, py = y + Math.sin(a) * rr + (inkRnd(i * 3.1 + j * 5.7) - 0.5) * (1.6 + scatter * r * 0.9)
        ctx.fillStyle = inkRgba(j === 1 ? '#FFF6D8' : col, alpha * (0.18 + 0.5 * thick) * (j === 1 ? 0.8 : 0.65))
        ctx.beginPath(); ctx.arc(px, py, (0.5 + 0.95 * thick) * (j === 1 ? 0.75 : 1) * (1 - scatter * 0.4), 0, Math.PI * 2); ctx.fill()
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
    }
  }
}

if (typeof module !== 'undefined') module.exports = { BattleScene }
