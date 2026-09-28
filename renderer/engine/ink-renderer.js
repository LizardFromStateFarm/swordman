// InkRenderer — the hybrid ink art engine (roadmap A3-1, Phase 34; direction chosen in A2, see docs/systems/art-engine.md).
// Draws INK_ART (assets/sprites/ink-cultivator.js): vector parts turned into ink dots (tone from a light model, folds,
// dots thinning into the paper, rim light) or smooth fills, tapered brush strokes, glyph parts, over a cached
// ink-wash background, with clean vector effects (halo, tilted orbit rings, straight-rising motes).
// Same public API as ASCIIRenderer so SpriteRenderer (sprite-renderer.js) can swap between them.
//
// Speed: every static thing (background, each motion layer, the breakthrough rim variant) is rasterised ONCE per
// canvas size into offscreen canvases; a frame is a few drawImage calls + the effects. Frames are capped at 30 fps.
// Motion is per layer (lap still, body breathes about body.anchorY, head rides on the shoulders), so layers never
// open gaps between each other. Small canvases (banner) use the LOD: smooth fills instead of dots, framed on the figure.

const INK_FONT = '"Courier New", "Segoe UI Symbol", "Noto Sans Symbols 2", monospace'

class InkRenderer {
  // Materials drawn as solid fills: objects only (sword, hairpin). Everything else is ink dots (user 2026-09-27).
  static SOLID = new Set(['metal', 'steel', 'grip', 'jade'])
  static SLOT_KINDS = ['robe', 'hair', 'weapon', 'face', 'aura']   // merge order (later palette wins)

  static has(state) { return typeof INK_ART !== 'undefined' && !!INK_ART[state] }

  // A realm variant (A4-1) names its base with `extends` and overrides only what changes: palette / background /
  // slots / halo / qiPearl / body merge key by key, every other key replaces. `aura: false` = the aura slot's effects
  // are ignored (the Mortal has no Qi to shape). Resolved once per state and kept.
  static resolve(state) {
    const R = InkRenderer._resolved || (InkRenderer._resolved = new Map())
    if (R.has(state)) return R.get(state)
    const V = INK_ART[state]
    let out = V
    if (V && V.extends) {
      const B = InkRenderer.resolve(V.extends)
      out = { ...B, ...V }
      for (const k of ['palette', 'background', 'slots', 'halo', 'qiPearl', 'body']) {
        if (V[k] && B[k]) out[k] = { ...B[k], ...V[k] }
      }
      delete out.extends
    }
    R.set(state, out)
    return out
  }

  constructor(canvas) {
    this.cv  = canvas
    this.ctx = canvas.getContext('2d')
    this.base = null            // INK_ART entry for the current sprite state
    this.art = null             // base + the chosen slot options merged in (what every painter reads)
    this.slotSel = {}           // player/dev choices per slot kind; unset kinds use base.slots
    this.fail = 0; this.demote = false   // failed-breakthrough moment, eases 1 → 0
    this.t = 0
    this.bt = 0; this.btTarget = 0; this.btStart = 0     // breakthrough intensity eases between 0 and 1
    this.speed = 1
    this.reducedMotion = false
    this.stageColor = '#87CEEB'
    this.w = 300; this.h = 150
    this.cache = null
    this.running = false; this.frozen = false
    this.rafId = null; this.lastT = 0; this._acc = 0
    this._probe = document.createElement('canvas').getContext('2d')
  }

  // ── Public API (mirrors ASCIIRenderer) ───────────────────────────────────

  setState(name) {
    if (name === 'breakthrough') { this.btTarget = 1; this.btStart = this.t }
    else if (InkRenderer.has(name)) {
      const art = InkRenderer.resolve(name)
      if (art !== this.base) { this.base = art; this.art = this._effective(); this.cache = null }
      if (this.fail < 0.05) this.btTarget = 0
    }
    if (!this.running) this._start()
  }

  setStageColor(hex) {
    const c = hex || '#87CEEB'
    if (c !== this.stageColor) { this.stageColor = c; this.cache = null }   // the background glow is baked
  }

  // w×h in CSS px. The backing store is w×h × devicePixelRatio (the dots need real pixels); `scale` is ignored,
  // the scene is fitted to the canvas (and to the figure on small canvases).
  setSize(w, h) {
    this.w = w; this.h = h
    const dpr = this._dpr()
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr)
    if (this.cv.width !== bw) this.cv.width = bw
    if (this.cv.height !== bh) this.cv.height = bh
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'
    this.cache = null
  }

  // Part slots (INK_PARTS: face / hair / robe / weapon / aura). setSlots({ hair: 'crown' }) changes only the kinds given;
  // null resets a kind to the art's default. The hook for Phase 10 cosmetics and heirs inheriting a look (A5).
  setSlots(sel) {
    for (const [k, v] of Object.entries(sel || {})) { if (v == null) delete this.slotSel[k]; else this.slotSel[k] = v }
    if (this.base) { this.art = this._effective(); this.cache = null }
  }
  slots() { return { ...(this.base?.slots || {}), ...this.slotSel } }
  static slotOptions(kind) { return typeof INK_PARTS !== 'undefined' ? Object.keys(INK_PARTS[kind] || {}) : [] }

  // Base art with each slot's chosen option merged in: parts inserted before/after an anchor part (else appended),
  // strokes and dot features added, palette overrides (robe first, so a face palette could still win), aura effects
  // replace halo/rings/motes, face frames kept for the expression swaps.
  _effective() {
    const B = this.base, sel = { ...(B.slots || {}), ...this.slotSel }
    const A = { ...B, palette: { ...B.palette }, parts: B.parts.slice(), strokes: B.strokes.slice(),
      dotFeatures: (B.dotFeatures || []).slice(), frames: {}, slots: sel }
    if (typeof INK_PARTS === 'undefined') return A
    for (const kind of InkRenderer.SLOT_KINDS) {
      const O = (INK_PARTS[kind] || {})[sel[kind]]
      if (!O || (kind === 'aura' && B.aura === false)) continue
      Object.assign(A.palette, O.palette || {})
      for (const part of O.parts || []) {
        const anchor = part.before || part.after, i = anchor ? A.parts.findIndex(q => q.id === anchor) : -1
        if (i < 0) A.parts.push(part); else A.parts.splice(part.before ? i : i + 1, 0, part)
      }
      A.strokes.push(...(O.strokes || []))
      A.dotFeatures.push(...(O.features || []))
      Object.assign(A.frames, O.frames || {})
      Object.assign(A, O.effects || {})
    }
    return A
  }

  // Dot features for an expression frame ('bt' | 'strain'): frame entries override features with the same id.
  _featuresFor(frame) {
    const over = (frame && this.art.frames[frame]) || []
    return this.art.dotFeatures.map(ft => { const o = ft.id && over.find(g => g.id === ft.id); return o ? { ...ft, ...o } : ft })
  }

  setSpeed(mult) { this.speed = mult > 0 ? mult : 1 }
  setReducedMotion(on) { this.reducedMotion = !!on }
  triggerBreakthroughBurst() { this.btTarget = 1; this.btStart = this.t; this.bt = Math.max(this.bt, 0.6) }
  // Failed breakthrough: the gathered Qi collapses (halo cracks, rings stutter and redden, the figure shudders, the
  // face strains). demoted = the realm shatters: the halo breaks apart and falls.
  triggerFailure(demoted = false) { this.fail = 1; this.demote = !!demoted; this.btTarget = 0; this.failStart = this.t }

  stop() {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  // Test hooks (scripts/smoke/scenarios/ink-art.js): hold one exact moment for repeatable screenshots.
  freeze(t, bt = 0, fail = 0, demote = false) {
    this.frozen = true; this.t = t; this.bt = bt; this.btStart = t - 0.4
    this.fail = fail; this.demote = demote; this.failStart = t - (1 - fail) * 1.8
    this._draw()
  }
  resume() { this.frozen = false }
  // Render one still at any size / pixel ratio into a PNG data URL (close-ups for review), without touching the canvas.
  // opts: { bt, crop: [x, y, w, h] in logical units, slots: {kind: option}, fail, demote }.
  still(...args) { return this.stillCanvas(...args).toDataURL('image/png') }
  // Same, as a canvas (the page CSP blocks data: images, so compose sheets from canvases).
  stillCanvas(w, h, dpr, t, opts = {}) {
    const { bt = 0, crop = null, slots = null, fail = 0, demote = false } = opts
    const prevSel = { ...this.slotSel }
    if (slots) { this.slotSel = { ...this.slotSel, ...slots }; this.art = this._effective() }
    const cv = document.createElement('canvas')
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
    const cache = this._buildCache(w, h, dpr)
    const saved = [this.t, this.bt, this.btStart, this.fail, this.demote, this.failStart]
    this.t = t; this.bt = bt; this.btStart = t - 0.4; this.fail = fail; this.demote = demote; this.failStart = t - (1 - fail) * 1.8
    this._drawTo(cv.getContext('2d'), cache)
    ;[this.t, this.bt, this.btStart, this.fail, this.demote, this.failStart] = saved
    if (slots) { this.slotSel = prevSel; this.art = this._effective() }
    if (!crop) return cv
    const out = document.createElement('canvas')
    out.width = Math.round(crop[2] * cache.S); out.height = Math.round(crop[3] * cache.S)
    out.getContext('2d').drawImage(cv, cache.ox + crop[0] * cache.S, cache.oy + crop[1] * cache.S, out.width, out.height, 0, 0, out.width, out.height)
    return out
  }
  // Average ms per frame over n frames at the current size (cache already built).
  perf(n = 60) {
    const cache = this._cacheFor()
    const t0 = performance.now()
    for (let i = 0; i < n; i++) { this.t += 1 / 30; this._drawTo(this.ctx, cache) }
    return (performance.now() - t0) / n
  }

  // ── Loop ─────────────────────────────────────────────────────────────────

  _dpr() { return Math.min(3, Math.max(1, window.devicePixelRatio || 1)) }

  _start() {
    this.running = true
    this.lastT = performance.now()
    const tick = now => {
      if (!this.running) return
      const dt = Math.min((now - this.lastT) / 1000, 0.1)
      this.lastT = now
      this._acc += dt
      if (this._acc >= 1 / 30) {                       // 30 fps is plenty for breathing + orbits, and saves battery
        const step = this._acc; this._acc = 0
        if (!this.frozen) {
          if (!this.reducedMotion) this.t += step * this.speed
          const k = Math.min(1, step * (this.btTarget > this.bt ? 4 : this.fail > 0 ? 5 : 1.2))
          if (this.fail > 0) this.fail = Math.max(0, this.fail - step / 1.8)
          this.bt += (this.btTarget - this.bt) * k
        }
        this._draw()
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  _cacheFor() {
    const dpr = this._dpr()
    if (!this.cache || this.cache.w !== this.w || this.cache.h !== this.h || this.cache.dpr !== dpr) {
      this.cache = this._buildCache(this.w, this.h, dpr)
    }
    return this.cache
  }

  _draw() {
    if (!this.art) return
    this._drawTo(this.ctx, this._cacheFor())
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  _drawTo(ctx, C) {
    const A = this.art, P = A.palette, t = this.t, bt = this.bt
    const calm = this.reducedMotion
    const breath = calm ? 0 : Math.sin(t * 1.3)
    const k = 1 + A.body.breathe * breath                     // body vertical scale
    const headDy = -(k - 1) * (A.body.anchorY - 45)           // the head rides on the shoulders
    const qi = this.stageColor
    const fail = this.fail
    const glowCol = inkMix(bt > 0.01 ? inkMix(qi, P.gold, bt) : qi, P.failRed || '#C8453A', fail * 0.85)
    const shake = calm ? 0 : fail * fail * 1.3 * Math.sin(t * 57) * C.S   // the figure shudders (device px)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.drawImage(C.bg, 0, 0)
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)              // logical scene units from here on

    // Mist drifting between the ridges (pre-rendered band, wraps around)
    if (!C.lod) {
      const drift = (t * 3) % 600, vx0 = -C.ox / C.S, vx1 = (C.cw - C.ox) / C.S   // tile over the whole visible span (wide phone canvases)
      ctx.globalAlpha = 0.9
      for (let x = Math.floor((vx0 + drift) / 600) * 600 - drift; x < vx1; x += 600) ctx.drawImage(C.mist, x, 0, 600, 150)
      ctx.globalAlpha = 1
    }

    // Breakthrough: a column of light behind the figure
    if (bt > 0.01) {
      // an elliptical soft column (radial gradient squeezed sideways): no hard edges
      ctx.save(); ctx.translate(150, 60); ctx.scale(0.28, 1)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 95)
      g.addColorStop(0, inkRgba(P.gold, 0.2 * bt)); g.addColorStop(0.6, inkRgba(P.gold, 0.07 * bt)); g.addColorStop(1, inkRgba(P.gold, 0))
      ctx.fillStyle = g
      ctx.fillRect(-95, -95, 190, 190)
      ctx.restore()
    }

    if (!calm) this._risingMotes(ctx, C, glowCol, t, bt)

    // Realm ground effects (A4-1): the Foundation array under the lap; the shadow left on the mist by a floating body
    const F = A.float
    const fy = F ? F.y + (calm ? 0 : Math.sin(t * 0.8) * F.bob) : 0           // logical units, negative = lifted
    if (A.formation) this._formation(ctx, C, glowCol, t, bt)
    if (F) this._groundShadow(ctx, F, fy, glowCol)

    ctx.save(); ctx.translate(0, fy)                                          // everything below rides with the body
    this._rings(ctx, C, glowCol, t, bt, 'back')
    if (A.avatar && C.avatar) this._avatar(ctx, C, t, fy)
    if (A.halo) this._halo(ctx, C, glowCol, t, bt, headDy)
    ctx.restore()

    // Figure layers: lap (still) → body (breathes) → head (rides the shoulders)
    const ay = A.body.anchorY, fyD = fy * C.S
    const layer = img => { ctx.save(); ctx.setTransform(1, 0, 0, 1, shake, fyD); ctx.drawImage(img, 0, 0); ctx.restore() }
    const bodyTf = () => ctx.setTransform(1, 0, 0, k, shake, (C.oy + ay * C.S) * (1 - k) + fyD)
    const headTf = () => ctx.setTransform(1, 0, 0, 1, shake, headDy * C.S + fyD)
    const headImg = fail > 0.08 ? C.frames.strain : bt > 0.5 ? C.frames.bt : C.layers.head   // expression frames
    layer(C.layers.lap)
    if (bt > 0.01) { ctx.globalAlpha = bt; layer(C.rim.lap); ctx.globalAlpha = 1 }
    ctx.save(); bodyTf(); ctx.drawImage(C.layers.body, 0, 0)
    if (bt > 0.01) { ctx.globalAlpha = bt; ctx.drawImage(C.rim.body, 0, 0); ctx.globalAlpha = 1 }
    ctx.restore()
    ctx.save(); headTf(); ctx.drawImage(headImg, 0, 0)
    if (bt > 0.01) { ctx.globalAlpha = bt; ctx.drawImage(C.rim.head, 0, 0); ctx.globalAlpha = 1 }
    ctx.restore()
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
    ctx.translate(0, fy)

    // Live strokes (hair locks sway) on the head
    const sway = calm ? 0 : Math.sin(t * 0.9) * 0.9
    ctx.save(); ctx.translate(0, headDy)
    for (const s of A.strokes) if (s.live) {
      const pts = s.pts.map(([x, y], i) => [x + sway * (i / (s.pts.length - 1)) ** 1.5, y])
      this._dotLine(ctx, pts, P[s.color], s.alpha, s.w)
    }
    ctx.restore()

    // The Qi pearl in the hand seal (a golden core from Core Formation on: `qiPearl.color` pins its colour)
    const pr = A.qiPearl
    if (pr) {
      const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.2)
      const pdy = (pr.y - ay) * (k - 1)
      const lit = 1 - fail * (0.6 + 0.4 * Math.abs(Math.sin(t * 31)))                  // the pearl gutters when Qi collapses
      const pc = pr.color ? inkMix(P[pr.color], P.gold, bt) : glowCol
      inkSoftDot(ctx, pr.x, pr.y + pdy, pr.r * (2.6 + bt * 2), pc, (0.18 + 0.12 * pulse + 0.25 * bt) * lit * (pr.glow || 1))
      inkSoftDot(ctx, pr.x, pr.y + pdy, pr.r, inkMix(pc, '#FFFFFF', 0.45), 0.95 * lit)
    }

    this._rings(ctx, C, glowCol, t, bt, 'front')
    if (bt > 0.01) this._ripples(ctx, C, t, bt, headDy)
    if (fail > 0.01) {                                          // the scene dims as the Qi drains away
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = inkRgba('#06030A', 0.28 * fail); ctx.fillRect(0, 0, C.cw, C.ch)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
  }

  _halo(ctx, C, col, t, bt, headDy) {
    const h = this.art.halo
    const r = h.r + (this.reducedMotion ? 0 : 1.2 * Math.sin(t * 1.3)) + bt * 3
    const y = h.y + headDy
    const g = ctx.createRadialGradient(h.x, y, r * 0.3, h.x, y, r * 1.25)
    g.addColorStop(0, inkRgba(col, 0.07 + 0.08 * bt)); g.addColorStop(1, inkRgba(col, 0))
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(h.x, y, r * 1.25, 0, Math.PI * 2); ctx.fill()
    // the ring itself: grid-snapped dots (user: the halo reads better as dots), in head-local grid coordinates
    // `outer` (a ratio) adds a second, fainter ring outside the first (Nascent Soul and beyond)
    for (const [rad, a] of h.outer ? [[r, 1], [r * h.outer, 0.45]] : [[r, 1]]) this._haloRing(ctx, h, rad, y, col, a, bt)
  }

  _haloRing(ctx, h, r, y, col, alpha, bt) {
    const P = this.art.dot.pitch, RY = P * 0.866, gx0 = this._gx0(), ring = new Path2D(), rr = P * 0.4
    const fail = this.fail, prog = 1 - fail, falling = new Path2D()
    let idx = Math.round(r * 50)
    for (let row = Math.floor((h.y - r - 2) / RY); row * RY <= h.y + r + 2; row++) {
      const gy = row * RY, off = gx0 + (row & 1 ? P / 2 : 0)
      for (let gx = Math.floor((h.x - r - 2 - off) / P) * P + off; gx <= h.x + r + 2; gx += P) {
        if (Math.abs(Math.hypot(gx - h.x, gy - h.y) - r) > P * 0.52) continue
        const n = inkRnd(++idx * 3.1)
        if (fail > 0.01 && n < fail * 0.45 && !this.demote) continue                       // cracks: dots go dark
        if (fail > 0.01 && this.demote && n < 0.65) {                                     // shatter: most dots fall
          const fx = gx + (inkRnd(idx * 7.3) - 0.5) * 14 * prog, fy = gy + (y - h.y) + prog * prog * (30 + 40 * inkRnd(idx * 5.7))
          falling.moveTo(fx + rr, fy); falling.arc(fx, fy, rr, 0, Math.PI * 2)
          continue
        }
        ring.moveTo(gx + rr, gy + (y - h.y)); ring.arc(gx, gy + (y - h.y), rr, 0, Math.PI * 2)
      }
    }
    ctx.fillStyle = inkRgba(col, (0.75 + 0.25 * bt) * alpha); ctx.fill(ring)
    if (fail > 0.01 && this.demote) { ctx.fillStyle = inkRgba(col, 0.9 * fail * alpha); ctx.fill(falling) }
  }

  // Foundation array (A4-1): a formation etched in light on the ground under the lap — two counter-turning rings of
  // grid-free dots with gaps that travel, and short rune ticks between them. Drawn behind the figure.
  _formation(ctx, C, col, t, bt) {
    const Fm = this.art.formation, spin = this.reducedMotion ? 0 : t * Fm.speed
    const a = Fm.alpha * (1 + 0.6 * bt) * (1 - 0.7 * this.fail)
    ctx.save(); ctx.translate(Fm.cx, Fm.cy); ctx.scale(1, Fm.ry / Fm.rx)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Fm.rx)
    g.addColorStop(0, inkRgba(col, 0.14 * a)); g.addColorStop(0.7, inkRgba(col, 0.05 * a)); g.addColorStop(1, inkRgba(col, 0))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Fm.rx, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    const lod = C.lod, pt = (r, ang) => [Fm.cx + Math.cos(ang) * r, Fm.cy + Math.sin(ang) * r * Fm.ry / Fm.rx]
    const dotRing = (r, n, rot, gap, rad, al) => {
      const path = new Path2D()
      for (let i = 0; i < n; i++) {
        if (i % gap < 2) continue                                          // gaps make the turning visible
        const [x, y] = pt(r, rot + i / n * Math.PI * 2)
        path.moveTo(x + rad, y); path.arc(x, y, rad, 0, Math.PI * 2)
      }
      ctx.fillStyle = inkRgba(inkMix(col, '#FFFFFF', 0.25), al); ctx.fill(path)
    }
    dotRing(Fm.rx, lod ? 48 : 120, spin, 20, lod ? 0.9 : 0.55, 0.7 * a)
    dotRing(Fm.rx * 0.74, lod ? 36 : 90, -spin * 1.4, 15, lod ? 0.8 : 0.5, 0.55 * a)
    if (lod) return
    // rune ticks: eight short spokes of three dots between the rings, turning with the outer ring
    const ticks = new Path2D()
    for (let i = 0; i < 8; i++) {
      const ang = spin + i / 8 * Math.PI * 2 + Math.PI / 8
      for (const f of [0.8, 0.87, 0.94]) { const [x, y] = pt(Fm.rx * f, ang); ticks.moveTo(x + 0.6, y); ticks.arc(x, y, 0.6, 0, Math.PI * 2) }
    }
    ctx.fillStyle = inkRgba(col, 0.75 * a); ctx.fill(ticks)
  }

  // A floating body (Core Formation on) leaves a soft shadow on the mist below; it fades as the body rises.
  _groundShadow(ctx, F, fy, col) {
    const s = F.shadow, h = Math.max(0, -fy), k = Math.max(0.4, 1 - h / 30)
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1, s.ry / s.rx)
    const r = s.rx * (0.8 + 0.2 * k)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    g.addColorStop(0, inkRgba('#05030A', 0.75 * k)); g.addColorStop(1, inkRgba('#05030A', 0))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
    const q = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.3)                // the Qi pressing down on the ground
    q.addColorStop(0, inkRgba(col, 0.1)); q.addColorStop(1, inkRgba(col, 0))
    ctx.fillStyle = q; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // Nascent Soul and beyond: the soul itself — a small self seated on a cloud of light above the crown (the Daoist
  // image of the infant soul leaving through the crown). Baked in the cache on the SAME dot pitch as the figure (the
  // shape is re-sampled at its small size, not scaled down), so it stays crisp ink dots; it drifts and breathes gently.
  _avatar(ctx, C, t, fy) {
    const V = this.art.avatar, calm = this.reducedMotion
    const rise = calm ? 0 : 0.9 * Math.sin(t * 0.5)                              // drifts a little on its own
    const by = V.y + V.dy + fy + rise                                            // the soul's seat
    const a = V.alpha * (calm ? 1 : 0.85 + 0.15 * Math.sin(t * 0.9)) * (1 - 0.8 * this.fail) * (1 + 0.4 * this.bt)
    // the cloud it sits on: a soft, flattened glow
    ctx.save(); ctx.translate(V.x, by); ctx.scale(1, 0.28)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, V.cloud)
    g.addColorStop(0, inkRgba(this.stageColor, 0.35 * a)); g.addColorStop(1, inkRgba(this.stageColor, 0))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, V.cloud, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, (fy + rise) * C.S)
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(C.avatar, 0, 0)
    ctx.restore()
  }

  _paintAvatar(ctx, C, parts, grid) {
    const { P, RY, gx0 } = grid, V = this.art.avatar, s = V.scale, probe = this._probe
    const col = inkMix(this.stageColor, '#FFFFFF', 0.35)
    const body = parts.filter(p => !InkRenderer.SOLID.has(p.mat))                 // objects stay with the body
    const toFig = (x, y) => [V.x + (x - V.x) / s, V.y + (y - V.y - V.dy) / s]  // soul space → figure space
    // an infant's proportions: the head parts are sampled larger (headScale) about the neck, so the head reads
    const hs = s * (V.headScale || 1), ny = V.y + V.dy + (V.neckY - V.y) * s
    const toHead = (x, y) => [V.x + (x - V.x) / hs, V.neckY + (y - ny) / hs]
    const y0 = ny - V.neckY * hs - 2, y1 = V.y + V.dy + 2, x0 = V.x - 70 * s, x1 = V.x + 70 * s
    const r0 = Math.floor(y0 / RY), r1 = Math.ceil(y1 / RY), c0 = Math.floor((x0 - gx0) / P) - 1, c1 = Math.ceil((x1 - gx0) / P) + 1
    const W = c1 - c0 + 1, H = r1 - r0 + 1, own = new Int16Array(W * H).fill(-1)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = gx0 + c * P + (r & 1 ? P / 2 : 0), F = toFig(x, r * RY), Hd = toHead(x, r * RY)
      for (let i = body.length - 1; i >= 0; i--) {
        const q = body[i], bb = q.box, [fx, fy] = q.layer === 'head' ? Hd : F
        if (fx < bb[0] || fx > bb[2] || fy < bb[1] || fy > bb[3]) continue
        if (probe.isPointInPath(q.path, fx, fy)) { own[(r - r0) * W + (c - c0)] = i; break }
      }
    }
    const at = (c, r) => (c < 0 || r < 0 || c >= W || r >= H) ? -1 : own[r * W + c]
    // tones by material so the tiny figure still reads: a bright face, deep hair, a robe of light
    const tone = { skin: [inkMix(col, '#FFFFFF', 0.6), 0.95], hair: [inkMix(this.stageColor, '#140C22', 0.45), 0.9] }
    const paths = new Map(), edgePath = new Path2D()
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const id = own[r * W + c]
      if (id < 0) continue
      const x = gx0 + (c + c0) * P + ((r + r0) & 1 ? P / 2 : 0), y = (r + r0) * RY
      const edge = at(c - 1, r) < 0 || at(c + 1, r) < 0 || at(c, r - 1) < 0 || at(c, r + 1) < 0
      const mat = body[id].mat, key = edge && mat !== 'skin' && mat !== 'hair' ? 'edge' : tone[mat] ? mat : 'robe'
      const path = key === 'edge' ? edgePath : (paths.get(key) || paths.set(key, new Path2D()).get(key))
      const rad = P * (key === 'robe' ? 0.3 : 0.4)
      path.moveTo(x + rad, y); path.arc(x, y, rad, 0, Math.PI * 2)
    }
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
    ctx.shadowColor = this.stageColor; ctx.shadowBlur = 2.5 * C.S
    ctx.fillStyle = col; ctx.globalAlpha = 0.95; ctx.fill(edgePath)
    ctx.shadowBlur = 0
    for (const [key, path] of paths) {
      const [c2, a2] = tone[key] || [col, 0.5]
      ctx.fillStyle = c2; ctx.globalAlpha = a2; ctx.fill(path)
    }
    ctx.globalAlpha = 1
  }

  // x of dot column 0, chosen so a column sits exactly on the figure's centre line (x = scene width / 2).
  _gx0() { const P = this.art.dot.pitch; return (this.art.scene[0] / 2) % P - P }

  // A polyline drawn as grid-snapped ink dots (hair locks): pixelated like the rest of the figure, never a solid line.
  _dotLine(ctx, pts, col, alpha, w) {
    const P = this.art.dot.pitch, RY = P * 0.866, gx0 = this._gx0(), seen = new Set(), path = new Path2D(), rr = P * (w > 1.2 ? 0.47 : 0.36)
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4)
      for (let k = 0; k <= n; k++) {
        const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n
        const row = Math.round(y / RY), off = gx0 + (row & 1 ? P / 2 : 0), c = Math.round((x - off) / P)
        const key = row * 10000 + c
        if (seen.has(key)) continue
        seen.add(key)
        const gx = c * P + off, gy = row * RY
        path.moveTo(gx + rr, gy); path.arc(gx, gy, rr, 0, Math.PI * 2)
      }
    }
    ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fill(path); ctx.globalAlpha = 1
  }

  // Tilted orbit rings with motes and short comet tails. The half with sin(a) < 0 is the far side (behind the figure).
  _rings(ctx, C, col, t, bt, half) {
    const rings = C.lod ? this.art.rings.slice(0, 1) : this.art.rings
    const back = half === 'back'
    const grow = 1 + 0.12 * bt
    for (const R of rings) {
      const wob = 1 + 0.07 * this.fail * Math.sin(t * 23 + R.rx)
      const rx = R.rx * grow * wob, ry = R.ry * grow * wob, ct = Math.cos(R.tilt), st = Math.sin(R.tilt)
      const pt = a => { const x = Math.cos(a) * rx, y = Math.sin(a) * ry; return [R.cx + x * ct - y * st, R.cy + x * st + y * ct] }
      // the orbit line, far half fainter
      ctx.beginPath()
      const a0 = back ? Math.PI : 0
      for (let i = 0; i <= 40; i++) { const [x, y] = pt(a0 + i / 40 * Math.PI); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
      ctx.lineWidth = Math.max(0.4, C.minW)
      ctx.strokeStyle = inkRgba(col, R.alpha * (back ? 0.12 : 0.22) * (1 + bt))
      ctx.stroke()
      // motes riding the orbit, each with a short tail
      const spin = this.reducedMotion ? 0 : t * R.speed * (1 + 2.5 * bt) - this.fail * 0.6 * R.speed
      for (let m = 0; m < R.motes; m++) {
        const a = spin + m / R.motes * Math.PI * 2 + inkRnd(m + R.rx) * 0.8
        const far = Math.sin(a) < 0
        if (far !== back) continue
        const depth = far ? 0.5 : 1
        for (let j = 5; j >= 0; j--) {
          const [x, y] = pt(a - Math.sign(R.speed) * j * 0.035)
          const fade = 1 - j / 6
          if (j) { ctx.fillStyle = inkRgba(col, 0.35 * fade * depth * R.alpha); ctx.beginPath(); ctx.arc(x, y, 0.55 * fade + 0.2, 0, Math.PI * 2); ctx.fill() }
          else {
            inkSoftDot(ctx, x, y, 2.4 * depth, col, 0.22 * R.alpha * (1 + bt))
            inkSoftDot(ctx, x, y, 0.8 * depth + 0.2, inkMix(col, '#FFFFFF', 0.5), 0.95 * depth)
          }
        }
      }
    }
  }

  // Straight-rising ambient Qi (behind the figure, so it never dirties it).
  _risingMotes(ctx, C, col, t, bt) {
    const M = this.art.motes
    const n = Math.round((C.lod ? 4 : M.count) + (C.lod ? 0 : (M.btCount - M.count) * bt))
    for (let i = 0; i < n; i++) {
      const life = (t * (M.speed + 0.3 * bt) + inkRnd(i)) % 1
      const x = M.x0 + inkRnd(i + 50) * (M.x1 - M.x0)
      const y = 140 - life * 132
      const a = Math.sin(life * Math.PI) * (0.55 + 0.35 * bt)
      const c = bt > 0.3 && i % 2 ? this.art.palette.gold : col
      inkSoftDot(ctx, x, y, 1.9, c, 0.16 * a)
      inkSoftDot(ctx, x, y, 0.45 + 0.35 * inkRnd(i + 7), inkMix(c, '#FFFFFF', 0.35), a)
    }
  }

  // Breakthrough: clean rings rippling out from the head.
  _ripples(ctx, C, t, bt, headDy) {
    const h = this.art.halo || { x: 150, y: 32, r: 14 }, gold = this.art.palette.gold
    for (let i = 0; i < 3; i++) {
      const ph = (((t - this.btStart) / 1.1 + i / 3) % 1 + 1) % 1
      const r = h.r + ph * 62
      ctx.lineWidth = Math.max(0.5, C.minW) * (1.4 - ph)
      ctx.strokeStyle = inkRgba(gold, (1 - ph) * 0.6 * bt)
      ctx.beginPath(); ctx.arc(h.x, h.y + headDy, r, 0, Math.PI * 2); ctx.stroke()
    }
  }

  // ── Cache: everything static, rasterised once per size ───────────────────

  _buildCache(w, h, dpr) {
    const A = this.art
    const [SW, SH] = A.scene
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr)
    const lod = Math.min(w / SW, h / SH) < 0.5                 // banner-sized: fine dots would turn to noise
    const box = lod ? A.figureBox : (A.view || [0, 0, SW, SH])   // `view` zooms out for headroom (floating realms)
    const bw = box[2] - box[0], bh = box[3] - box[1]
    const S = Math.min(cw / bw, ch / bh)                       // device px per logical unit
    const ox = (cw - bw * S) / 2 - box[0] * S, oy = (ch - bh * S) / 2 - box[1] * S
    const C = { w, h, dpr, cw, ch, S, ox, oy, lod, minW: 0.9 / S }
    const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c }

    const parts = A.parts.map((p, i) => ({ ...p, i, path: inkPath(p.d), box: inkBounds(p.d) }))
    const grid = lod ? null : this._sampleGrid(parts, A)

    C.bg = mk(); this._paintBackground(C.bg.getContext('2d'), C)
    if (!lod) { C.mist = document.createElement('canvas'); C.mist.width = Math.round(600 * S); C.mist.height = Math.round(150 * S); this._paintMist(C.mist.getContext('2d'), S) }
    C.layers = {}; C.rim = {}; C.frames = {}
    for (const L of ['lap', 'body', 'head']) {
      C.layers[L] = mk(); this._paintLayer(C.layers[L].getContext('2d'), C, parts, grid, L, false)
      C.rim[L] = mk();    this._paintLayer(C.rim[L].getContext('2d'), C, parts, grid, L, true)
    }
    // expression frames: the head layer again with the frame's dot features (falls back to the plain head)
    for (const fr of ['bt', 'strain']) {
      if (!this.art.frames[fr]) { C.frames[fr] = C.layers.head; continue }
      C.frames[fr] = mk(); this._paintLayer(C.frames[fr].getContext('2d'), C, parts, grid, 'head', false, fr)
    }
    if (A.avatar && grid) { C.avatar = mk(); this._paintAvatar(C.avatar.getContext('2d'), C, parts, grid) }
    return C
  }

  // Which part owns each ink-dot position (hex-staggered grid), painter's order: the front-most part wins.
  _sampleGrid(parts, A) {
    const P = A.dot.pitch, RY = P * 0.866, gx0 = this._gx0()   // grid aligned to the centre line: features stay symmetric
    const cols = Math.ceil(A.scene[0] / P) + 2, rows = Math.ceil(A.scene[1] / RY) + 2
    const ids = new Int16Array(cols * rows).fill(-1)
    const probe = this._probe
    for (let r = 0; r < rows; r++) {
      const y = r * RY
      for (let c = 0; c < cols; c++) {
        const x = gx0 + c * P + (r & 1 ? P / 2 : 0)
        for (let i = parts.length - 1; i >= 0; i--) {
          const b = parts[i].box
          if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
          if (probe.isPointInPath(parts[i].path, x, y)) { ids[r * cols + c] = i; break }
        }
      }
    }
    return { P, RY, cols, rows, ids, gx0 }
  }

  _paintLayer(ctx, C, parts, grid, layer, rim, frame = null) {
    const A = this.art, PAL = A.palette
    this._feats = this._featuresFor(frame)
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
    for (const p of parts) {
      if (p.layer !== layer) continue
      const dotted = !C.lod && !InkRenderer.SOLID.has(p.mat)          // only objects are solid (user rule)
      if (dotted) this._paintDots(ctx, C, p, parts, grid, rim)
      else if (!rim) this._paintSmooth(ctx, C, p)
      else if (p.mat !== 'skin') this._paintSmoothRim(ctx, C, p)
      if (!rim) for (const s of A.strokes) if (s.after === p.id && !s.live) this._stroke(ctx, C, s, PAL)
    }
    if (rim) return
    if (C.lod) for (const f of this._feats) if (parts.find(q => q.id === f.part)?.layer === layer) inkBrush(ctx, f.pts.length > 1 ? f.pts : [f.pts[0], f.pts[0]], f.w, PAL[f.color], 1, C.minW)
    for (const s of A.strokes) if (s.layer === layer && !s.live && !s.after) this._stroke(ctx, C, s, PAL)
    for (const g of A.glyphs) if (g.layer === layer) inkGlyphRun(ctx, g, PAL, C.lod, C.S)
  }

  // Tone 0..1 at a point of a part: light from the upper left, soft folds (tonal bands, never dark lines).
  _tone(p, x, y) {
    const b = p.box, Lg = this.art.light
    const vy = (y - b[1]) / Math.max(1, b[3] - b[1])
    let L = 0.95 - 0.55 * vy + 0.3 * ((Lg.x - x) / Lg.spread)
    const f = p.fold
    if (f) {
      const ca = Math.cos(f.ang), sa = Math.sin(f.ang)
      L *= 1 - f.amp * (0.5 + 0.5 * Math.sin(f.k * (x * ca + y * sa) + f.warp * Math.sin(y * 0.09 + x * 0.02)))
    }
    return Math.max(0.06, Math.min(1, L))
  }

  _paintDots(ctx, C, p, parts, grid, rim) {
    const { P, RY, cols, rows, ids, gx0 } = grid
    const PAL = this.art.palette
    const gold = PAL.gold
    const feats = (this._feats || this.art.dotFeatures).filter(ft => ft.part === p.id)
    if (!rim) this._underpaint(ctx, p)                         // a wash under the dots, so cloth reads as mass, not an LED field
    const buckets = new Map()                                  // colour|alpha|radius → Path2D (one fill per bucket)
    const add = (key, x, y, r) => {
      let b = buckets.get(key); if (!b) { b = new Path2D(); buckets.set(key, b) }
      b.moveTo(x + r, y); b.arc(x, y, r, 0, Math.PI * 2)
    }
    const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? -1 : ids[r * cols + c]
    for (let r = 0; r < rows; r++) {
      const odd = r & 1, y = r * RY
      for (let c = 0; c < cols; c++) {
        if (ids[r * cols + c] !== p.i) continue
        const x = gx0 + c * P + (odd ? P / 2 : 0)
        // neighbours on the hex grid; "outside" = empty or a part behind this one (its silhouette edge)
        const up = odd ? [at(c, r - 1), at(c + 1, r - 1)] : [at(c - 1, r - 1), at(c, r - 1)]
        const dn = odd ? [at(c, r + 1), at(c + 1, r + 1)] : [at(c - 1, r + 1), at(c, r + 1)]
        const out = id => id < p.i
        const litEdge = out(at(c - 1, r)) || out(up[0]) || out(up[1])
        const edge = litEdge || out(at(c + 1, r)) || out(dn[0]) || out(dn[1])
        const seed = c * 131 + r * 17 + p.i * 7
        if (rim) {                                             // breakthrough: gold rim on every silhouette edge
          if (!(at(c - 1, r) < 0 || at(c + 1, r) < 0 || up[0] < 0 || up[1] < 0 || dn[0] < 0 || dn[1] < 0)) continue   // outer silhouette only
          add(`${gold}|0.95|${(P * 0.36).toFixed(2)}`, x, y, P * 0.36)
          continue
        }
        const L = this._tone(p, x, y)
        let col, a, rad
        if (p.mat === 'robe') {
          if (L < 0.42 && inkRnd(seed) < (0.42 - L) * 1.7) continue     // ink thinning into the paper
          const q = Math.round(L * 14) / 14
          col = q < 0.4 ? inkMix(PAL.robeDeep, PAL.robeShade, q / 0.4) : inkMix(PAL.robeShade, PAL.robe, (q - 0.4) / 0.6)
          if (litEdge) col = inkMix(col, PAL.rim, 0.55)
          a = (0.35 + 0.65 * q).toFixed(2); rad = P * (0.16 + 0.42 * q)   // lit dots grow until they merge
        } else if (p.mat === 'hair') {
          const q = Math.round(L * 10) / 10
          col = inkMix(PAL.hair, PAL.hairHi, 0.1 + 0.55 * q * q)
          if (litEdge) col = inkMix(col, PAL.hairHi, 0.5)
          a = '1'; rad = P * 0.47
        } else if (p.mat === 'sash') {
          const q = Math.round(L * 8) / 8
          col = inkMix(PAL.sashShade, PAL.sash, 0.3 + 0.7 * q); a = '1'; rad = P * 0.45
        } else if (p.mat === 'skin') {
          const hit = feats.find(ft => inkPolyDist(x, y, ft.pts) < ft.w)
          if (hit) { col = PAL[hit.color]; a = hit.color === 'eyeGlow' ? '0.999' : '1'; rad = P * 0.48 }
          else { const q = Math.round(L * 10) / 10; col = inkMix(PAL.skinShade, PAL.skin, 0.35 + 0.65 * q); a = '1'; rad = P * 0.46 }
        } else if (p.mat === 'trim') {
          const q = Math.round(L * 8) / 8
          col = inkMix(PAL.trimShade, PAL.trim, 0.35 + 0.65 * q); a = '1'; rad = P * 0.44
        } else {                                               // cuff: the shadowed sleeve opening
          const q = Math.round(L * 8) / 8
          col = inkMix(PAL.robeDeep, PAL.cuff, q); a = '0.9'; rad = P * 0.4
        }
        add(`${col}|${a}|${rad.toFixed(2)}`, x, y, rad)
      }
    }
    for (const [key, path] of buckets) {
      const [col, a] = key.split('|')
      ctx.globalAlpha = +a; ctx.fillStyle = col
      if (rim) { ctx.shadowColor = gold; ctx.shadowBlur = 3 * C.S }
      else if (a === '0.999') { ctx.shadowColor = col; ctx.shadowBlur = 3 * C.S }   // glowing feature dots (eyes lit on breakthrough)
      ctx.fill(path)
      ctx.shadowBlur = 0
    }
    ctx.globalAlpha = 1
  }

  // The tonal wash under a dotted part: darker at the lower right, like ink pooling in the folds.
  _underpaint(ctx, p) {
    const PAL = this.art.palette, b = p.box
    const [c0, c1, a] = {
      robe: [PAL.robeShade, PAL.robeDeep, 0.6], hair: [PAL.hair, PAL.hair, 0.95],
      sash: [PAL.sashShade, PAL.sashShade, 0.8], cuff: [PAL.robeDeep, PAL.robeDeep, 0.85],
      skin: [PAL.skinShade, PAL.skinShade, 0.55], trim: [PAL.trimShade, PAL.trimShade, 0.5],
    }[p.mat]
    const g = ctx.createLinearGradient(b[0], b[1], b[2], b[3])
    g.addColorStop(0, inkRgba(c0, a)); g.addColorStop(1, inkRgba(c1, a))
    ctx.fillStyle = g
    ctx.fill(p.path)
  }

  _paintSmooth(ctx, C, p) {
    const PAL = this.art.palette, b = p.box
    const g = ctx.createLinearGradient(b[0], b[1], b[2], b[3])
    const pair = {
      skin: [PAL.skin, PAL.skinShade], trim: [PAL.trim, PAL.trimShade], robe: [PAL.robe, PAL.robeShade],
      cuff: [PAL.cuff, PAL.robeDeep], sash: [PAL.sash, PAL.sashShade], hair: [PAL.hairHi, PAL.hair],
      steel: [PAL.steel, PAL.steelShade], grip: [PAL.grip, PAL.grip], metal: [PAL.trim, PAL.trimShade],
    }[p.mat] || [PAL.robe, PAL.robeShade]
    g.addColorStop(0, p.mat === 'hair' ? inkMix(pair[1], pair[0], 0.35) : pair[0])
    g.addColorStop(1, pair[1])
    ctx.fillStyle = g
    if (p.mat === 'trim' || p.mat === 'metal') { ctx.shadowColor = PAL.trim; ctx.shadowBlur = 3 * C.S }
    ctx.fill(p.path)
    ctx.shadowBlur = 0
  }

  _stroke(ctx, C, s, PAL) {
    if (s.glow) { ctx.save(); ctx.shadowColor = PAL[s.color]; ctx.shadowBlur = s.glow * C.S }
    inkBrush(ctx, s.pts, s.w, PAL[s.color], s.alpha, C.minW)
    if (s.glow) ctx.restore()
  }

  _paintSmoothRim(ctx, C, p) {
    ctx.lineWidth = Math.max(0.6, C.minW)
    ctx.strokeStyle = this.art.palette.gold
    ctx.shadowColor = this.art.palette.gold; ctx.shadowBlur = 3 * C.S
    ctx.stroke(p.path)
    ctx.shadowBlur = 0
  }

  _paintBackground(ctx, C) {
    const A = this.art, PAL = A.palette, B = A.background
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const sky = ctx.createLinearGradient(0, 0, 0, C.ch)
    sky.addColorStop(0, PAL.sky0); sky.addColorStop(1, PAL.sky1)
    ctx.fillStyle = sky; ctx.fillRect(0, 0, C.cw, C.ch)
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
    const x0 = -C.ox / C.S, x1 = (C.cw - C.ox) / C.S, y1 = (C.ch - C.oy) / C.S   // the visible logical span
    const gl = ctx.createRadialGradient(B.glow.x, B.glow.y, 2, B.glow.x, B.glow.y, B.glow.r)
    gl.addColorStop(0, inkRgba(this.stageColor, 0.11)); gl.addColorStop(1, inkRgba(this.stageColor, 0))
    ctx.fillStyle = gl; ctx.fillRect(x0, -C.oy / C.S, x1 - x0, y1 + C.oy / C.S)
    if (C.lod) return
    // a pale moon, soft
    const m = B.moon
    inkSoftDot(ctx, m.x, m.y, m.r * 3, PAL.moon, 0.06)
    inkSoftDot(ctx, m.x, m.y, m.r, PAL.moon, 0.22)
    const ridge = (R, x) => R[0] + R[1] * Math.sin(x * R[2] + R[3]) + R[4] * Math.sin(x * R[5] + R[6]) + R[7] * Math.sin(x * R[8] + R[9])
    // ink bleed: a blurred dark wash under each ridge line (brush feel instead of a hard band)
    for (const [R, col, blur] of [[B.ridgeFar, PAL.mountFar, 3], [B.ridgeNear, PAL.bleed, 2.5]]) {
      ctx.save()
      ctx.filter = `blur(${(blur * C.S).toFixed(1)}px)`
      ctx.beginPath(); ctx.moveTo(x0 - 10, 160)
      for (let x = x0 - 10; x <= x1 + 10; x += 2) ctx.lineTo(x, ridge(R, x) + 2)
      ctx.lineTo(x1 + 10, 160); ctx.closePath()
      ctx.fillStyle = inkRgba(col, 0.55); ctx.fill()
      ctx.restore()
    }
    // ink-dot mountains: dots thin out below each ridge line, like ink soaking into paper
    const P = A.dot.pitch * 0.85, RY = P * 0.866
    for (const [R, col, depth, rad] of [[B.ridgeFar, PAL.mountFar, 12, 0.3], [B.ridgeNear, PAL.mountNear, 15, 0.34]]) {
      const path = new Path2D()
      for (let r = 0; r * RY < 152; r++) {
        const y = r * RY
        for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
          const d = y - ridge(R, x)
          if (d < 0) continue
          if (R === B.ridgeFar && y > ridge(B.ridgeNear, x) - 1) continue
          if (inkRnd(Math.floor(x * 13 + y * 7)) < d / depth) continue
          const rr = P * rad * (1 - 0.4 * Math.min(1, d / depth))
          path.moveTo(x + rr, y); path.arc(x, y, rr, 0, Math.PI * 2)
        }
      }
      ctx.fillStyle = col; ctx.fill(path)
    }
  }

  // Two soft mist bands, 600 logical px wide (drawn twice for a seamless drift).
  _paintMist(ctx, S) {
    const B = this.art.background, col = this.art.palette.mist
    ctx.setTransform(S, 0, 0, S, 0, 0)
    ctx.filter = `blur(${(4 * S).toFixed(1)}px)`
    for (const [yi, my] of B.mistY.entries()) {
      for (let i = 0; i < 9; i++) {
        const x = (i / 9) * 600 + inkRnd(i + yi * 20) * 40
        const rx = 30 + inkRnd(i + 3 + yi * 20) * 36, ry = 2.2 + inkRnd(i + 9) * 2.4
        ctx.fillStyle = inkRgba(col, yi ? 0.10 : 0.14)
        for (const dx of [0, -600, 600]) { ctx.beginPath(); ctx.ellipse(x + dx, my + inkRnd(i + 5) * 5 - 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill() }
      }
    }
    ctx.filter = 'none'
  }
}

// ── helpers (module scope) ───────────────────────────────────────────────────

// Deterministic pseudo-random in [0,1) from a number seed.
function inkRnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

function inkHexRgb(hex) {
  if (hex.startsWith('rgb')) return hex.match(/\d+/g).slice(0, 3).map(Number)
  const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]
}
function inkMix(a, b, f) {
  const A = inkHexRgb(a), B = inkHexRgb(b)
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, f))).toString(16).padStart(2, '0')).join('')
}
function inkRgba(hex, a) { const [r, g, b] = inkHexRgb(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})` }

// Distance from a point to a polyline (a single point counts as a zero-length segment).
function inkPolyDist(x, y, pts) {
  let best = Infinity
  for (let i = 0; i < Math.max(1, pts.length - 1); i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[Math.min(i + 1, pts.length - 1)]
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return best
}

// A glowing dot without shadowBlur (cheap): a radial gradient disc.
function inkSoftDot(ctx, x, y, r, col, a) {
  if (a <= 0.003 || r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, inkRgba(col, a)); g.addColorStop(0.55, inkRgba(col, a * 0.55)); g.addColorStop(1, inkRgba(col, 0))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

// Flat command array → Path2D (see assets/sprites/ink-cultivator.js for the format).
function inkPath(d) {
  const p = new Path2D()
  for (let i = 0; i < d.length;) {
    const c = d[i++]
    if (c === 'M') { p.moveTo(d[i], d[i + 1]); i += 2 }
    else if (c === 'L') { p.lineTo(d[i], d[i + 1]); i += 2 }
    else if (c === 'Q') { p.quadraticCurveTo(d[i], d[i + 1], d[i + 2], d[i + 3]); i += 4 }
    else if (c === 'C') { p.bezierCurveTo(d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5]); i += 6 }
    else if (c === 'E') { p.moveTo(d[i] + d[i + 2], d[i + 1]); p.ellipse(d[i], d[i + 1], d[i + 2], d[i + 3], 0, 0, Math.PI * 2); i += 4 }
    else if (c === 'Z') p.closePath()
  }
  return p
}

// Conservative bounding box (control points included).
function inkBounds(d) {
  const xs = [], ys = []
  for (let i = 0; i < d.length;) {
    const c = d[i++]
    const n = { M: 2, L: 2, Q: 4, C: 6, E: 4, Z: 0 }[c]
    if (c === 'E') { xs.push(d[i] - d[i + 2], d[i] + d[i + 2]); ys.push(d[i + 1] - d[i + 3], d[i + 1] + d[i + 3]) }
    else for (let j = 0; j < n; j += 2) { xs.push(d[i + j]); ys.push(d[i + j + 1]) }
    i += n
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// A tapered brush stroke through the points (Catmull-Rom), thickest in the middle, pointed at both ends.
function inkBrush(ctx, pts, w, col, alpha, minW) {
  const sm = []
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)]
    for (let s = 0; s < 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t
      sm.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)))
    }
  }
  sm.push(pts[n - 1])
  const L = [], R = []
  for (let i = 0; i < sm.length; i++) {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len
    const u = i / (sm.length - 1)
    const hw = Math.max(minW * 0.5, w * 0.5 * Math.pow(Math.sin(Math.PI * u), 0.6))
    L.push([sm[i][0] - dy * hw, sm[i][1] + dx * hw]); R.push([sm[i][0] + dy * hw, sm[i][1] - dx * hw])
  }
  ctx.beginPath()
  ctx.moveTo(L[0][0], L[0][1])
  for (const q of L) ctx.lineTo(q[0], q[1])
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1])
  ctx.closePath()
  ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1
}

// A run of glyphs at a fixed advance (the (b)-style glyph parts: sword, knot).
function inkGlyphRun(ctx, g, PAL, lod, S) {
  const chars = [...g.text], adv = g.size * 0.6
  ctx.save()
  ctx.translate(g.x, g.y); if (g.rot) ctx.rotate(g.rot)
  ctx.font = `${g.size}px ${INK_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const x0 = -chars.length * adv / 2 + adv / 2
  chars.forEach((ch, i) => {
    const col = PAL[(g.map && g.map[ch]) || g.color]
    if (g.glow && !lod) { ctx.shadowColor = col; ctx.shadowBlur = g.glow * S } else ctx.shadowBlur = 0
    ctx.fillStyle = col
    ctx.fillText(ch, x0 + i * adv, 0)
  })
  ctx.restore()
}
