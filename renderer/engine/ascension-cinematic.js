// Review score: 7.7 → 7.8 (reviewer agents); cycle 3 accepted by the user 2026-09-28 ("I like the animation, keep it")
// AscensionCinematic — the Immortal Ascension (Phase 40b, docs/systems/soul-points.md → "The Immortal Ascension
// cinematic", docs/systems/art-engine.md). A ~9 s full-window scene on its own canvas, drawn in the ink-dot language:
//   0–2 s    gathering   the game dims under a night sky; tribulation clouds (ink dots) roll in and swirl overhead
//   2–4 s    tribulation three forked bolts strike the cultivator; each one lights the robe's rim further
//   4–6.5 s  rising      the figure lifts, gold motes stream upward, the Ascended's dragons spiral heaven's pillar
//   6.5–8.5  the gate    the clouds part into a dotted heavenly gate; light floods out; the figure enters and fades
//   8.5–9 s  flash       a white-gold bloom — then the finish screen fades in over an afterglow (the lit gate)
// The figure is the Ascended ink art (INK_ART.ascended) from a private InkRenderer in `bare` mode (no scenery).
// Reduced motion: a 2 s gold crossfade over a still of the open gate. Skippable after SKIP_AFTER seconds.
// Test hooks: freeze(t) holds one exact moment; perf(n) = ms per frame. Used by renderer/game/immortal-view.js.

class AscensionCinematic {
  static SECONDS = 9
  static CALM_SECONDS = 2
  static SKIP_AFTER = 1.5
  static BOLTS = [2.1, 2.8, 3.5]   // strike times (s)
  static POWER = [0.7, 0.95, 1.3]  // each strike bigger than the last: width, forks, flash, shake, impact ring

  constructor(canvas) {
    this.cv = canvas
    this.ctx = canvas.getContext('2d')
    this.figCv = document.createElement('canvas')
    this.ink = new InkRenderer(this.figCv, { bare: true })
    this.t = 0
    this.running = false; this.frozen = false; this.done = true
    this.calm = false
    this.onDone = null
    this.rafId = null
    this.geo = null
  }

  get length() { return this.calm ? AscensionCinematic.CALM_SECONDS : AscensionCinematic.SECONDS }

  play({ color = '#FFD700', reducedMotion = false, onDone = null } = {}) {
    this.calm = !!reducedMotion
    this.onDone = onDone
    this.done = false; this.frozen = false; this.t = 0
    this.ink.setStageColor(color)
    this.ink.setReducedMotion(this.calm)
    this.ink.setState('ascended'); this.ink.stop()   // driven frame by frame from here (its own loop stays off)
    this._start()
  }

  canSkip() { return !this.done && this.t >= (this.calm ? 0.3 : AscensionCinematic.SKIP_AFTER) }
  // Jump to the flash (the finish screen follows it), never past it
  skip() { if (this.canSkip()) this.t = Math.max(this.t, this.length - (this.calm ? 0.15 : 0.5)) }

  stop() {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  // Test hooks (scripts/smoke/scenarios/immortal.js)
  freeze(t) { this.stop(); this.frozen = true; this.t = t; this._draw() }
  perf(n = 60) {
    const t0 = performance.now()
    for (let i = 0; i < n; i++) { this.t = 1 + (i / n) * 7.5; this._draw() }
    return (performance.now() - t0) / n
  }

  _start() {
    this.running = true
    let last = performance.now()
    const tick = now => {
      if (!this.running) return
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (!this.frozen) this.t += dt
      const after = this.t - this.length
      // the afterglow behind the finish screen only needs a slow drift at ~30 fps (and one still with Reduced motion)
      if (after < 0) this._draw()
      else if (this.calm) { if (!this._drewAfter) { this._draw(); this._drewAfter = true } }
      else if ((this._odd = !this._odd)) this._draw()
      if (!this.done && after >= 0) { this.done = true; this.onDone?.() }
      this.rafId = requestAnimationFrame(tick)
    }
    this._drewAfter = false; this._odd = false
    this.rafId = requestAnimationFrame(tick)
  }

  // ── Geometry (rebuilt when the window changes size: a banner peek, a phone rotation) ──────────────────

  _layout() {
    const W = Math.max(1, this.cv.clientWidth || window.innerWidth), H = Math.max(1, this.cv.clientHeight || window.innerHeight)
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    if (this.geo && this.geo.W === W && this.geo.H === H && this.geo.dpr === dpr) return this.geo
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr)
    const fw = Math.min(W * 0.98, 640, H * 1.25), fh = fw * 230 / 420          // INK_ART.ascended view is 420 × 230
    this.ink.setSize(fw, fh)
    const G = Math.min(W * 0.66, H * 0.42, 440)                                 // gate width (scaled to the height on wide windows)
    const R = Math.max(W, H) * 0.78                                              // cloud vortex radius
    // Cloud billows: puffs strung along three spiral arms, each a soft clump of dots (dense, larger dots at the heart,
    // lit on top, flat underneath). Dots keep their puff's spin so a billow turns as one shape.
    const clouds = [], puffs = [], nPuff = Math.round(Math.min(96, Math.max(48, W * H / 8500)))
    for (let p = 0; p < nPuff; p++) {
      const f = inkRnd(p * 2.7 + 0.4), pr = 0.14 + 0.86 * f
      const pa = (p % 3) * 2.094 + pr * 3.4 + (inkRnd(p * 9.1) - 0.5) * 1.1
      const size = (0.045 + 0.075 * inkRnd(p * 4.3)) * (0.55 + 0.9 * pr)
      const px = Math.cos(pa) * pr, py = Math.sin(pa) * pr, spin = (0.14 + 0.36 * (1 - pr)) * (0.9 + 0.2 * inkRnd(p * 5.9))
      puffs.push({ a: pa, r: pr, size, spin })
      const k = Math.round(24 + 300 * size)
      for (let j = 0; j < k; j++) {
        const gx = (inkRnd(p * 131 + j * 1.7) + inkRnd(p * 57 + j * 3.3) + inkRnd(p * 11 + j * 8.1) - 1.5) * size * 1.5
        const gy = (inkRnd(p * 71 + j * 2.9) + inkRnd(p * 13 + j * 5.1) + inkRnd(p * 29 + j * 6.7) - 1.5) * size
        const x = px + gx, y = py + Math.max(gy, -size * 0.9) * (gy > 0 ? 0.55 : 1)   // flatter underneath
        const rr = Math.hypot(x, y)
        if (rr < 0.05 || rr > 1.08) continue
        const e = Math.min(1, Math.hypot(gx / (size * 1.5), gy / size) / 1.2)          // 0 heart … 1 edge
        clouds.push({ a: Math.atan2(y, x), r: rr, spin, e,
          z: Math.max(0, Math.min(0.999, 0.5 - gy / size * 0.45 + (inkRnd(p * 3.7 + j) - 0.5) * 0.3)),
          s: 0.8 + 1.7 * (1 - e) * (0.5 + 0.5 * inkRnd(p * 3 + j * 1.3)) })
      }
    }
    // the sea of clouds below: four rows of billows (lighter on top) + ink dots along the upper surface; it settles a
    // little lower as the figure rises and stays, lit gold by the pillar and the gate (the world left behind)
    const sea = [], seaDots = [], ns = Math.ceil(W / 52) + 5
    for (let row = 0; row < 4; row++) for (let i = 0; i < ns; i++) {
      const q = { x: (i / (ns - 1)) * W * 1.2 - W * 0.1 + (inkRnd(i * 3.3 + row * 11) - 0.5) * 40, dy: inkRnd(i * 7.1 + row) * 0.03,
        w: 110 + 120 * inkRnd(i * 5.7 + row * 3), row }
      sea.push(q)
      if (row < 2) for (let j = 0; j < 16; j++) {
        const f = (j + inkRnd(i * 13 + j * 3.1 + row)) / 16 - 0.5
        seaDots.push({ x: q.x + f * q.w * 0.8, dy: q.dy, row, off: -Math.cos(f * Math.PI) * q.w * 0.12 + inkRnd(j * 9.7 + i) * 6, s: 0.8 + 1.2 * inkRnd(j * 5.3 + i * 2) })
      }
    }
    this.geo = { W, H, dpr, fw, fh, G, R, clouds, puffs, sea, seaDots, seaImg: this._puffSprite('rgba(104,88,146,0.6)', 'rgba(70,58,104,0.34)'), puffImg: this._puffSprite(), gate: this._gateDots(), motes: this._moteSeeds() }
    return this.geo
  }

  // The heavenly gate as dots, in gate units (width 1, centred on the door; v down). Upswept double roof, two beams,
  // two pillars, a cloud plinth. k = reveal order (top first, a little noise), e = edge weight (brighter outline).
  _gateDots() {
    // an eave: a band whose tips curl up (centre line y0 − lift·(|u|/half)^2.4), a little thicker at the middle
    const inRoof = (u, v, y0, half, lift) => Math.abs(u) <= half && Math.abs(v - (y0 - lift * (Math.abs(u) / half) ** 2.4)) <= 0.03 - 0.012 * Math.abs(u) / half
    const su = u => Math.abs(u) - 0.52                                            // side bays, mirrored
    const inside = (u, v) =>
      inRoof(u, v, -0.36, 0.5, 0.13) ||                                           // lower eave (corners flung up)
      inRoof(u, v, -0.5, 0.32, 0.1) ||                                            // upper eave
      inRoof(su(u), v, -0.15, 0.17, 0.07) ||                                      // side roofs
      (Math.abs(u) >= 0.35 && Math.abs(u) <= 0.64 && v >= -0.085 && v <= -0.06) ||  // side beams
      (Math.abs(u) >= 0.6 && Math.abs(u) <= 0.64 && v >= -0.13 && v <= 0.42) ||   // side posts
      (Math.abs(u) <= 0.2 && v >= -0.47 && v <= -0.37) ||                         // the roof's wall between eaves
      (Math.abs(u) <= 0.44 && v >= -0.27 && v <= -0.225) ||                       // top beam
      (Math.abs(u) <= 0.38 && v >= -0.15 && v <= -0.12) ||                        // lower beam
      (Math.abs(u) >= 0.29 && Math.abs(u) <= 0.35 && v >= -0.27 && v <= 0.42) ||   // pillars
      (Math.abs(u) <= 0.05 && v >= -0.225 && v <= -0.15)                          // the tablet between the beams
    const dots = [], p = 0.0135
    for (let v = -0.58; v <= 0.46; v += p * 0.866) {
      const row = Math.round(v / (p * 0.866))
      for (let u = -0.72 + (row & 1 ? p / 2 : 0); u <= 0.72; u += p) {
        if (!inside(u, v)) continue
        const edge = [[p, 0], [-p, 0], [0, p], [0, -p]].some(([du, dv]) => !inside(u + du, v + dv))
        const n = inkRnd(u * 91.7 + v * 37.3)
        if (!edge && n < 0.35) continue                                           // interiors thin out (ink, not a fill)
        dots.push({ u, v, e: edge ? 1 : 0, k: (v + 0.6) / 1.06 * 0.75 + n * 0.25 })
      }
    }
    // a cloud plinth under the pillars: loose dots in a flat band
    for (let i = 0; i < 220; i++) {
      const u = (inkRnd(i * 4.1) - 0.5) * 1.5, v = 0.43 + (inkRnd(i * 6.7) - 0.5) * 0.07 * (1 - Math.abs(u))
      dots.push({ u, v, e: 0, k: 0.8 + inkRnd(i) * 0.2, plinth: true })
    }
    return dots
  }

  // A billow's soft body: a feathered ellipse of dark storm ink (drawn under each puff's dots, scaled per puff)
  _puffSprite(c0 = 'rgba(46,36,70,0.85)', c1 = 'rgba(34,26,54,0.55)') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 58, 4, 64, 64, 64)
    g.addColorStop(0, c0); g.addColorStop(0.55, c1); g.addColorStop(1, 'rgba(24,18,40,0)')
    x.fillStyle = g; x.fillRect(0, 0, 128, 128)
    return c
  }

  _moteSeeds() {
    const m = []
    for (let i = 0; i < 110; i++) m.push({ sp: 0.16 + 0.24 * inkRnd(i * 2.9), ph: inkRnd(i * 8.3), x: inkRnd(i * 4.7) - 0.5, s: 0.8 + 1.5 * inkRnd(i * 1.3), w: inkRnd(i * 6.1) })
    return m
  }

  // ── Frame ────────────────────────────────────────────────────────────────────────────────────────────

  _draw() {
    const g = this._layout(), ctx = this.ctx
    // Reduced motion: a still of the open gate with the figure before it, fading to gold
    const st = this.calm ? (this.t < this.length ? 7.3 : 9.6) : this.t
    const calmGold = this.calm ? AscensionCinematic._ss(0.2, this.length, this.t) : 0
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
    ctx.clearRect(0, 0, g.W, g.H)
    this._scene(ctx, g, st, calmGold)
  }

  static _ss(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

  _scene(ctx, g, st, calmGold) {
    const ss = AscensionCinematic._ss, { W, H, G } = g
    const dim     = ss(0, 1.3, st)
    const gather  = ss(0, 2.3, st)
    const rise    = ss(4.0, 6.4, st)
    const part    = ss(4.6, 7.0, st)
    const gateIn  = ss(6.1, 7.5, st)
    const light   = ss(6.6, 8.6, st)
    const enter   = ss(7.0, 8.6, st)
    const after   = Math.max(0, st - AscensionCinematic.SECONDS)
    const flash   = this.calm ? calmGold : ss(8.25, 9.0, st) * (1 - 0.9 * ss(0, 1.4, after))
    const tall = H > W * 1.4                                                      // phone / Overlay: use the height
    const cx = W / 2, cy = Math.max(H * (tall ? 0.22 : 0.2), G * 0.95 * 0.64 + H * 0.04)   // the eye of the storm = where the gate opens (roof + headroom on screen)
    // lightning: every strike lives 1.2 s (0.5 s bolt, then a dotted afterimage); each is bigger than the last
    const strikes = this.calm ? [] : AscensionCinematic.BOLTS.map((b, i) => ({ i, age: st - b, pow: AscensionCinematic.POWER[i] })).filter(s => s.age >= 0 && s.age < 1.2)
    const litOf = s => s.age < 0.5 ? (1 - s.age / 0.5) * (s.age > 0.1 && s.age < 0.16 ? 0.45 : 1) * s.pow : 0
    const boltLit = Math.min(1, Math.max(0, ...strikes.map(litOf)))
    const shake = Math.max(0, ...strikes.map(s => s.age < 0.35 ? (1 - s.age / 0.35) * 6 * s.pow : 0))

    ctx.save()
    if (shake) ctx.translate((inkRnd(st * 97) - 0.5) * shake, (inkRnd(st * 53) - 0.5) * shake)

    // Sky: the game dims under it
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, inkMix('#07040E', '#1C1020', light * 0.5)); sky.addColorStop(1, '#150C26')
    ctx.globalAlpha = dim; ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20); ctx.globalAlpha = 1

    // Light behind the gate, flooding out through the parting clouds
    const door = { x: cx, y: cy + G * 0.16 }
    if (light > 0.001) {
      const rr = G * (0.3 + 2.8 * light)
      const lg = ctx.createRadialGradient(door.x, door.y, 0, door.x, door.y, rr)
      lg.addColorStop(0, inkRgba('#FFF6DC', 0.9 * light)); lg.addColorStop(0.3, inkRgba('#F2C872', 0.45 * light)); lg.addColorStop(1, inkRgba('#F2C872', 0))
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H)
    }
    if (part > 0.001) {                                                           // a thin sliver of heaven in the eye
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, G * 0.7 * part + 1)
      eg.addColorStop(0, inkRgba('#FFE8B0', 0.35 * part)); eg.addColorStop(1, inkRgba('#FFE8B0', 0))
      ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H)
    }

    this._clouds(ctx, g, st, cx, cy, gather, part, light, boltLit)
    if (gateIn > 0.001) this._gate(ctx, g, cx, cy, gateIn, light, st)

    // The figure: bt steps up with each strike, then the full rim light as it rises
    const struck = AscensionCinematic.BOLTS.filter(b => st >= b + 0.05).length
    const bt = Math.min(1, [0.1, 0.4, 0.68, 0.95][struck] + 0.05 * rise)
    const figA = 1 - ss(8.0, 8.7, st)
    const fx = cx, y0 = H * (tall ? 0.6 : 0.66), y1 = H * (tall ? 0.5 : 0.56)
    let fy = y0 - (y0 - y1) * rise
    fy += (door.y + G * 0.02 - fy) * enter
    const sc = 1 - 0.78 * enter
    // Heaven's pillar: from the figure up into the eye / the gate (three dragons climb it while the figure rises)
    const pil = Math.max(ss(1.6, 4.4, st) * 0.5, rise) * (1 - ss(8.2, 8.9, st))
    const pTop = cy - G * 0.3, pBot = Math.max(fy + g.fh * 0.34, H * (tall ? 0.74 : 0.84))
    // The cloud sea below: settles a little as the figure rises, stays, gold where the pillar meets it
    const seaA = gather
    if (seaA > 0.01) this._sea(ctx, g, st, H * (tall ? 0.72 : 0.8) + H * 0.05 * rise, seaA, Math.max(pil * 0.6, light), fx, light)
    if (pil > 0.01) {
      const hh = (pBot - pTop) / 2, cw = g.fw * 0.13
      ctx.save(); ctx.translate(fx, pTop + hh); ctx.scale(cw / hh, 1)
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, hh)
      pg.addColorStop(0, inkRgba('#FFF2C8', 0.46 * pil)); pg.addColorStop(0.55, inkRgba('#F2C872', 0.13 * pil)); pg.addColorStop(1, inkRgba('#F2C872', 0))
      ctx.fillStyle = pg; ctx.fillRect(-hh, -hh, hh * 2, hh * 2); ctx.restore()
      // a bright core, added as light (feathered at both ends and both edges)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(fx, pTop + hh); ctx.scale(g.fw * 0.042 / hh, 1)
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, hh)
      cg.addColorStop(0, inkRgba('#FFE7A8', 0.5 * pil)); cg.addColorStop(0.7, inkRgba('#E8B860', 0.22 * pil)); cg.addColorStop(1, inkRgba('#E8B860', 0))
      ctx.fillStyle = cg; ctx.fillRect(-hh, -hh, hh * 2, hh * 2); ctx.restore()
    }
    const climb = ss(3.9, 4.9, st) * (1 - ss(7.3, 8.2, st))
    if (climb > 0.01) this._dragonsClimb(ctx, g, st, fx, pTop, pBot, climb, false)
    if (figA > 0.01) {
      this._motes(ctx, g, st, fx, fy, ss(3.8, 4.6, st) * (1 - ss(8.1, 8.8, st)), door)
      this._figure(ctx, g, fx, fy, sc, figA, bt, st)
    }
    if (climb > 0.01) this._dragonsClimb(ctx, g, st, fx, pTop, pBot, climb, true)
    for (const s of strikes) this._bolt(ctx, g, s.i, s.age, cx, fx, fy, litOf(s), s.pow)
    ctx.restore()

    if (boltLit > 0) { ctx.fillStyle = inkRgba('#E6DEFF', 0.14 * boltLit); ctx.fillRect(0, 0, W, H) }
    const glow = this.calm ? calmGold : ss(8.6, 9.8, st)                           // after the peak
    if (glow > 0.01) this._afterglow(ctx, g, st, door, glow)
    if (flash > 0.001) {
      const M = Math.max(W, H), fg = ctx.createRadialGradient(door.x, door.y, 0, door.x, door.y, M * 1.05)
      fg.addColorStop(0, inkRgba('#FFFFFF', flash)); fg.addColorStop(0.28, inkRgba('#FFF8E2', flash * 0.97))
      fg.addColorStop(0.65, inkRgba('#FFE7A6', flash * 0.9)); fg.addColorStop(1, inkRgba('#F2C66A', flash * 0.82))
      ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H)
    }
  }

  // After the flash: a dark vignette so the light has a source, a radiant bloom on the gate, gold motes drifting up
  // through the lower half and over the warm cloud sea.
  _afterglow(ctx, g, st, door, a) {
    const { W, H } = g, M = Math.max(W, H)
    const vg = ctx.createRadialGradient(door.x, door.y + H * 0.1, M * 0.18, door.x, door.y + H * 0.1, M * 0.85)
    vg.addColorStop(0, 'rgba(8,4,14,0)'); vg.addColorStop(1, inkRgba('#06030C', 0.6 * a))
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)
    const bl = ctx.createRadialGradient(door.x, door.y, 0, door.x, door.y, g.G * 1.3)
    bl.addColorStop(0, inkRgba('#FFFBEE', 0.6 * a)); bl.addColorStop(0.4, inkRgba('#FFE39A', 0.3 * a)); bl.addColorStop(1, inkRgba('#FFE39A', 0))
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bl; ctx.fillRect(door.x - g.G * 1.3, door.y - g.G * 1.3, g.G * 2.6, g.G * 2.6); ctx.restore()
    const gold = new Path2D(), white = new Path2D()
    for (const m of g.motes) {
      const ph = (st * m.sp * 0.5 + m.ph) % 1
      const x = W / 2 + m.x * W * 1.05 + Math.sin(st * 0.8 + m.ph * 30) * 8, y = H * (1.02 - 0.75 * ph)
      const rr = m.s * (1 - 0.3 * ph), P = m.w > 0.75 ? white : gold
      P.moveTo(x + rr, y); P.arc(x, y, rr, 0, Math.PI * 2)
    }
    ctx.fillStyle = inkRgba('#F2CC6A', 0.65 * a); ctx.fill(gold)
    ctx.fillStyle = inkRgba('#FFFBEA', 0.8 * a); ctx.fill(white)
  }

  // Tribulation clouds: a flattened vortex of ink dots turning over the figure; the eye opens as they part.
  _clouds(ctx, g, st, cx, cy, gather, part, light, boltLit) {
    if (gather <= 0.001) return
    const { R, G, H } = g, flat = 0.42, hole = part * G * 0.78
    const fadeY0 = cy + R * flat * 0.45, fadeY1 = cy + R * flat * 0.95
    // buckets: 3 tones × 3 alphas, + a gold-lit rim around the eye once the light comes
    // soft bodies first (the mass of the storm), then the dots that give it texture
    const spinOn = this.calm ? 0 : 1
    for (const q of g.puffs) {
      let rr = q.r * R * (1 + 0.85 * (1 - gather)) + hole * (1 - Math.min(1, q.r * 0.9))
      const ang = q.a + st * q.spin * spinOn
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * flat
      const w = q.size * R * 3.4, h = w * 0.62
      if (y - h > H || y + h < 0) continue
      ctx.globalAlpha = gather * 0.9 * (1 - AscensionCinematic._ss(fadeY0, fadeY1, y))
      ctx.drawImage(g.puffImg, x - w / 2, y - h / 2, w, h)
    }
    ctx.globalAlpha = 1
    const B = Array.from({ length: 10 }, () => new Path2D())
    const alphas = [0.22, 0.42, 0.68]
    for (const d of g.clouds) {
      let rr = d.r * R * (1 + 0.85 * (1 - gather))
      rr += hole * (1 - Math.min(1, d.r * 0.9))                                   // the eye pushes inner dots outward
      const ang = d.a + st * d.spin * (this.calm ? 0 : 1)
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * flat
      if (y > H + 4 || y < -4) continue
      let a = gather * (1 - AscensionCinematic._ss(fadeY0, fadeY1, y)) * (1 - 0.55 * d.e)   // underside frays; billow edges thin
      if (a < 0.05) continue
      const ai = a > 0.7 ? 2 : a > 0.35 ? 1 : 0
      const rim = light > 0.05 && rr < hole + G * 0.5
      const bi = rim ? 9 : Math.min(2, Math.floor(d.z * 3)) * 3 + ai
      const r = d.s * (0.9 + 0.3 * d.z)
      B[bi].moveTo(x + r, y); B[bi].arc(x, y, r, 0, Math.PI * 2)
    }
    const tones = ['#2E2446', '#4A3C68', '#6E5E96'].map(c => inkMix(c, '#D6CCF2', boltLit * 0.75))
    for (let ti = 0; ti < 3; ti++) for (let ai = 0; ai < 3; ai++) {
      ctx.fillStyle = inkRgba(inkMix(tones[ti], '#6A4E7A', light * 0.35), alphas[ai]); ctx.fill(B[ti * 3 + ai])
    }
    ctx.fillStyle = inkRgba('#F4CC7A', 0.75 * light); ctx.fill(B[9])
  }

  _gate(ctx, g, cx, cy, gateIn, light, st) {
    const G = g.G, gh = G * 0.95, dr = Math.max(0.9, G / 260)
    const lit = new Path2D(), soft = new Path2D(), faint = new Path2D()
    for (const d of g.gate) {
      const vis = Math.max(0, Math.min(1, (gateIn * 1.35 - d.k) * 5))
      if (vis <= 0.02) continue
      const x = cx + d.u * G, y = cy + d.v * gh + (d.plinth ? Math.sin(st * 0.7 + d.u * 9) * 1.5 : 0)
      const p = d.e ? lit : vis > 0.6 ? soft : faint, r = dr * (d.e ? 1.05 : 0.85) * (0.6 + 0.4 * vis)
      p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.fillStyle = inkRgba('#8A6A3A', 0.35 * gateIn); ctx.fill(faint)
    ctx.fillStyle = inkRgba(inkMix('#C89A52', '#FFE6A8', light), 0.75 * gateIn); ctx.fill(soft)
    ctx.fillStyle = inkRgba(inkMix('#E8C070', '#FFF6DA', light), 0.95 * gateIn); ctx.fill(lit)
    // the doorway: light pouring through between the pillars
    const dx0 = cx - G * 0.29, dx1 = cx + G * 0.29, dy0 = cy - 0.12 * gh, dy1 = cy + 0.42 * gh
    const dcx = cx, dcy = (dy0 + dy1) / 2, dR = Math.max(dx1 - dx0, dy1 - dy0) * 0.75
    const dg = ctx.createRadialGradient(dcx, dcy, 0, dcx, dcy, dR)
    dg.addColorStop(0, inkRgba('#FFF8E6', (0.25 + 0.6 * light) * gateIn)); dg.addColorStop(0.6, inkRgba('#FFE2A0', (0.1 + 0.3 * light) * gateIn)); dg.addColorStop(1, inkRgba('#FFE2A0', 0))
    ctx.fillStyle = dg; ctx.fillRect(dcx - dR, dcy - dR, dR * 2, dR * 2)
    // the doorway itself: a lattice of bright dots, densest at its heart
    const door = new Path2D(), pit = Math.max(3.2, G / 70), rd = pit * 0.3
    for (let y = dy0 + pit / 2, row = 0; y < dy1; y += pit * 0.866, row++) {
      for (let x = dx0 + (row & 1 ? pit : pit / 2); x < dx1; x += pit) {
        const f = Math.hypot((x - dcx) / (dx1 - dx0), (y - dcy) / (dy1 - dy0))
        if (inkRnd(x * 3.1 + y * 7.7) < f * 1.1 - 0.15) continue
        door.moveTo(x + rd, y); door.arc(x, y, rd, 0, Math.PI * 2)
      }
    }
    ctx.fillStyle = inkRgba('#FFF6DC', (0.35 + 0.6 * light) * gateIn); ctx.fill(door)
  }

  _motes(ctx, g, st, fx, fy, on, door) {
    if (on <= 0.01) return
    const gold = new Path2D(), white = new Path2D(), span = fy - door.y + g.fh * 0.3
    for (const m of g.motes) {
      const ph = (st * m.sp + m.ph) % 1
      const x = fx + m.x * g.fw * 0.75 * (1 - 0.7 * ph) + Math.sin(st * 1.4 + m.ph * 20) * 5
      const y = fy + g.fh * 0.25 - ph * span
      const r = m.s * (1 - 0.4 * ph)
      const p = m.w > 0.7 ? white : gold
      p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.fillStyle = inkRgba('#F2CC6A', 0.7 * on); ctx.fill(gold)
    ctx.fillStyle = inkRgba('#FFFBEA', 0.85 * on); ctx.fill(white)
  }

  _figure(ctx, g, fx, fy, sc, alpha, bt, st) {
    const ink = this.ink
    ink.t = 10 + st; ink.bt = bt; ink.btStart = ink.t - 0.4
    ink._draw()
    const C = ink.cache
    if (!C) return
    const ax = (C.ox + 150 * C.S) / C.dpr, ay = (C.oy + 70 * C.S) / C.dpr         // the figure's centre in the canvas
    ctx.globalAlpha = alpha
    ctx.drawImage(this.figCv, fx - ax * sc, fy - ay * sc, g.fw * sc, g.fh * sc)
    ctx.globalAlpha = 1
  }

  // A forked bolt from the storm's eye to the crown of the head: glow, body, core; i + 1 side branches. After 0.5 s it
  // leaves a dotted afterimage; an impact ring of gold dots spreads from the figure.
  _bolt(ctx, g, i, age, cx, fx, fy, lit, pow = 1) {
    const { W, H } = g
    const x0 = cx + [-0.22, 0.2, 0.02][i] * W, y0 = H * 0.24
    const x1 = fx + [-6, 5, 0][i], y1 = fy - g.fh * 0.22
    const n = 13, pts = []
    for (let k = 0; k <= n; k++) {
      const f = k / n, j = k === 0 || k === n ? 0 : (inkRnd(i * 71 + k * 13.7) - 0.5) * W * 0.07 * Math.sin(f * Math.PI)
      pts.push([x0 + (x1 - x0) * f + j, y0 + (y1 - y0) * f])
    }
    const forks = [4, 7, 9].slice(0, i + 1).map((at, fi) => {
      const f = [pts[at]], dir = (fi + i) % 2 ? 1 : -1, len = 4 + fi
      for (let k = 1; k <= len; k++) f.push([f[k - 1][0] + dir * W * 0.03 * pow + (inkRnd(i * 19 + fi * 7 + k) - 0.5) * W * 0.03, f[k - 1][1] + H * 0.024])
      return f
    })
    if (age < 0.5) {
      const stroke = (P, w, col, a) => {
        ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const q of P.slice(1)) ctx.lineTo(q[0], q[1])
        ctx.lineWidth = w; ctx.strokeStyle = inkRgba(col, a); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke()
      }
      for (const [P, k] of [[pts, 1], ...forks.map(f => [f, 0.5])]) {
        stroke(P, 18 * k * pow, '#8C74E0', 0.14 * lit)
        stroke(P, 6 * k * pow, '#E4DCFF', 0.55 * lit)
        stroke(P, 2.2 * k * pow, '#FFFFFF', Math.min(1, lit * 1.2))
      }
      // the strike point blooms gold on the crown
      const br = 70 * pow, bg = ctx.createRadialGradient(x1, y1, 0, x1, y1, br)
      bg.addColorStop(0, inkRgba('#FFF4D0', Math.min(1, 0.8 * lit))); bg.addColorStop(1, inkRgba('#FFD070', 0))
      ctx.fillStyle = bg; ctx.fillRect(x1 - br, y1 - br, br * 2, br * 2)
    } else {
      // afterimage: the bolt's path lingers as fading violet-white dots
      const a = 0.55 * (1 - (age - 0.5) / 0.7), path = new Path2D()
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1], n2 = Math.ceil(Math.hypot(bx - ax, by - ay) / 7)
        for (let s = 0; s < n2; s++) { const x = ax + (bx - ax) * s / n2, y = ay + (by - ay) * s / n2, rr = 1.2 * pow; path.moveTo(x + rr, y); path.arc(x, y, rr, 0, Math.PI * 2) }
      }
      ctx.fillStyle = inkRgba('#D8CCFF', a); ctx.fill(path)
    }
    // impact ring: gold dots flung out from the struck figure
    if (age < 0.8) {
      const k = age / 0.8, rad = g.fw * (0.08 + 0.42 * k) * pow, ring = new Path2D(), n3 = 56, ryy = y1 + g.fh * 0.14
      for (let s = 0; s < n3; s++) {
        const an = s / n3 * Math.PI * 2 + i, x = x1 + Math.cos(an) * rad, y = ryy + Math.sin(an) * rad * 0.34, rr = (1.8 - k) * pow
        ring.moveTo(x + rr, y); ring.arc(x, y, rr, 0, Math.PI * 2)
      }
      ctx.fillStyle = inkRgba('#FFE08A', 0.85 * (1 - k)); ctx.fill(ring)
    }
  }

  // The cloud sea: rows of billows (lighter on top, darker below, a dark floor under them) with ink dots along the top,
  // warmed gold where the pillar and the gate's light fall on it.
  _sea(ctx, g, st, top, a, warm, fx, gilt = 0) {
    const { W, H } = g
    const floor = ctx.createLinearGradient(0, top + H * 0.05, 0, H)
    floor.addColorStop(0, inkRgba('#221A38', 0)); floor.addColorStop(0.25, inkRgba('#1C1530', 0.85 * a)); floor.addColorStop(1, inkRgba('#120C20', a))
    ctx.fillStyle = floor; ctx.fillRect(0, top + H * 0.05, W, H)
    for (const q of g.sea) {
      const y = top + q.row * H * 0.055 + q.dy * H + Math.sin(st * 0.5 + q.x * 0.01) * 3, h = q.w * 0.5
      if (y - h > H) continue
      ctx.globalAlpha = a * [0.8, 0.9, 0.95, 1][q.row]
      ctx.drawImage(q.row < 2 ? g.seaImg : g.puffImg, q.x - q.w / 2 + st * 4 * (q.row & 1 ? 1 : -1), y - h / 2, q.w, h)
    }
    ctx.globalAlpha = 1
    // lit dots on the upper surface; gold near the pillar
    const cool = new Path2D(), gold = new Path2D()
    for (const d of g.seaDots) {
      const x = d.x + st * 4 * (d.row & 1 ? 1 : -1), y = top + d.row * H * 0.055 + d.dy * H + d.off + Math.sin(st * 0.5 + d.x * 0.01) * 3
      const near = Math.abs(x - fx) < g.fw * (0.35 + 0.9 * gilt)   // the gate's light spreads gold across it
      const p = near && warm > 0.1 ? gold : cool
      p.moveTo(x + d.s, y); p.arc(x, y, d.s, 0, Math.PI * 2)
    }
    ctx.fillStyle = inkRgba('#8A78B8', 0.55 * a); ctx.fill(cool)
    ctx.fillStyle = inkRgba('#F4D080', (0.4 + 0.5 * warm) * a); ctx.fill(gold)
    if (warm > 0.01) {                                                            // the light pooling where the pillar meets the sea
      const pg = ctx.createRadialGradient(fx, top, 0, fx, top, g.fw * 0.5)
      pg.addColorStop(0, inkRgba('#FFE6A0', 0.35 * warm * a)); pg.addColorStop(1, inkRgba('#FFE6A0', 0))
      ctx.save(); ctx.translate(fx, top); ctx.scale(1, 0.35); ctx.translate(-fx, -top)
      ctx.fillStyle = pg; ctx.fillRect(fx - g.fw * 0.5, top - g.fw * 0.5, g.fw, g.fw); ctx.restore()
    }
  }

  // Three golden dragons climbing heaven's pillar, in dots: an angular head (a snout wedge, swept horns, a white eye),
  // a body that swells just behind the head and tapers to the tail (three rows of dots), dorsal spines every few
  // scales. The back half of each turn is drawn behind the figure, the front half in front.
  _dragonsClimb(ctx, g, st, fx, top, bot, on, front) {
    const S = Math.max(0.8, g.fw / 420), L = 0.36, N = 150
    const B = [new Path2D(), new Path2D(), new Path2D()], hot = new Path2D(), eyes = new Path2D()
    const dot = (P, x, y, rr) => { P.moveTo(x + rr, y); P.arc(x, y, rr, 0, Math.PI * 2) }
    const pos = (k, pp) => {
      const ang = pp * 11 + k * 2.094 - st * 2.2, rad = g.fw * 0.15 * (1 - 0.3 * pp)
      return [fx + Math.cos(ang) * rad, bot - pp * (bot - top), Math.sin(ang)]
    }
    for (let k = 0; k < 3; k++) {
      const head = (st * 0.3 + k / 3) % 1.25
      for (let s = 0; s <= N; s++) {
        const d = (s / N) * L, pp = head - d
        if (pp < 0 || pp > 1) continue
        const [x, y, dep] = pos(k, pp)
        if ((dep > 0) !== front) continue
        const [x2, y2] = pos(k, pp + 0.004)
        let tx = x2 - x, ty = y2 - y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl
        const nx = -ty, ny = tx, u = d / L, ds = 0.72 + 0.28 * dep
        if (s === 0) {                                                        // the head
          const hs = 3.4 * S * ds, bx = x - tx * hs * 0.6, by = y - ty * hs * 0.6
          for (let a = 0; a <= 1; a += 0.2) for (let b = -1; b <= 1; b += 0.34) {   // wedge: wide at the jaw, a point at the snout
            const w = (1 - a) * hs * 0.75 * b
            dot(hot, bx + tx * a * hs * 2 + nx * w, by + ty * a * hs * 2 + ny * w, 0.75 * S)
          }
          for (const sd of [-1, 1]) for (let h = 1; h <= 4; h++) {            // swept-back horns
            dot(hot, bx - tx * h * 1.5 * S + nx * sd * (hs * 0.55 + h * 1.1 * S), by - ty * h * 1.5 * S + ny * sd * (hs * 0.55 + h * 1.1 * S), 0.6 * S)
          }
          dot(eyes, x + nx * hs * 0.3, y + ny * hs * 0.3, 0.9 * S)
          continue
        }
        const swell = Math.sin(Math.min(1, u * 1.35 + 0.12) * Math.PI) * (1 - 0.55 * u)
        const w = (1.2 + 3.4 * swell) * S * ds, bi = u < 0.33 ? 2 : u < 0.66 ? 1 : 0
        dot(B[bi], x, y, (0.8 + 0.5 * swell) * S)
        if (w > 1.6 * S && s % 2 === 0) { dot(B[bi], x + nx * w * 0.6, y + ny * w * 0.6, 0.7 * S); dot(B[bi], x - nx * w * 0.6, y - ny * w * 0.6, 0.7 * S) }
        if (s % 11 === 5 && u < 0.8) for (let q = 1; q <= 3; q++) dot(hot, x - nx * (w * 0.6 + q * 1.3 * S), y - ny * (w * 0.6 + q * 1.3 * S), (0.75 - q * 0.12) * S)   // dorsal spines
      }
    }
    ;[0.4, 0.7, 0.95].forEach((al, i) => { ctx.fillStyle = inkRgba(i === 2 ? '#FFE3A0' : '#E8B850', al * on); ctx.fill(B[i]) })
    ctx.fillStyle = inkRgba('#FFF0C0', on); ctx.fill(hot)
    ctx.fillStyle = inkRgba('#FFFFFF', on); ctx.fill(eyes)
  }

}
