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

  // Art tables: INK_ART (the cultivator) by default; a renderer may draw another table (INK_BEASTS, A4-2).
  static has(state, table = typeof INK_ART !== 'undefined' ? INK_ART : null) { return !!(table && table[state]) }

  // A realm variant (A4-1) names its base with `extends` and overrides only what changes: palette / background /
  // slots / halo / qiPearl / body merge key by key, every other key replaces. `aura: false` = the aura slot's effects
  // are ignored (the Mortal has no Qi to shape). Resolved once per state and kept.
  static resolve(state, table = INK_ART) {
    const all = InkRenderer._resolved || (InkRenderer._resolved = new Map())
    const R = all.get(table) || all.set(table, new Map()).get(table)
    if (R.has(state)) return R.get(state)
    const V = table[state]
    let out = V
    if (V && V.extends) {
      const B = InkRenderer.resolve(V.extends, table)
      out = { ...B, ...V }
      for (const k of ['palette', 'background', 'slots', 'halo', 'qiPearl', 'body', 'raster']) {
        if (V[k] && B[k]) out[k] = { ...B[k], ...V[k] }
      }
      delete out.extends
    }
    R.set(state, out)
    return out
  }

  constructor(canvas, opts = {}) {
    this.table = opts.table || null   // null = INK_ART (looked up late: the data file may load after this one)
    this.skipHidden = !!opts.skipHidden   // portraits: don't draw while the canvas is not on screen
    this.cv  = canvas
    this.ctx = canvas.getContext('2d')
    this.base = null            // INK_ART entry for the current sprite state
    this.art = null             // base + the chosen slot options merged in (what every painter reads)
    this.slotSel = {}           // player/dev choices per slot kind; unset kinds use base.slots
    this.fail = 0; this.demote = false   // failed-breakthrough moment, eases 1 → 0
    this.bare = !!opts.bare     // 40b: no scenery (the Immortal Ascension cinematic draws its own sky around the figure)
    this.death = 0; this.deathKind = 'fall'   // death moment (A4-3): 0 = alive, rises to 1 as the figure dissolves; held until clearDeath()
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
    else if (InkRenderer.has(name, this.table || INK_ART)) {
      const art = InkRenderer.resolve(name, this.table || INK_ART)
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
    const cx = (B.scene?.[0] || 300) / 2
    const A = { ...B, palette: { ...B.palette }, parts: inkMirrorAll(B.parts, cx), strokes: inkMirrorAll(B.strokes, cx),
      dotFeatures: inkMirrorAll(B.dotFeatures || [], cx), frames: {}, slots: sel }
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
  // The end of a life (A4-3): 'fall' = the figure comes apart into ash-grey dust carried off on the wind, the scene dims;
  // 'ascend' = it turns to gold light and rises (the Ascension Trial passed). Plays over DEATH_SECONDS (real time, even
  // with Reduced motion, which swaps the dust for a plain fade) and holds the empty scene until clearDeath().
  static DEATH_SECONDS = 3.2
  triggerDeath(kind = 'fall') {
    this.death = 0.001; this.deathKind = kind === 'ascend' ? 'ascend' : 'fall'
    if (this.deathKind === 'ascend') { this.btTarget = 1; this.btStart = this.t }
    if (!this.running) this._start()
  }
  clearDeath() { this.death = 0; this.btTarget = 0 }

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
    const { bt = 0, crop = null, slots = null, fail = 0, demote = false, death = 0, deathKind = 'fall' } = opts
    const prevSel = { ...this.slotSel }
    if (slots) { this.slotSel = { ...this.slotSel, ...slots }; this.art = this._effective() }
    const cv = document.createElement('canvas')
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
    const cache = this._buildCache(w, h, dpr)
    const saved = [this.t, this.bt, this.btStart, this.fail, this.demote, this.failStart, this.death, this.deathKind]
    this.t = t; this.bt = bt; this.btStart = t - 0.4; this.fail = fail; this.demote = demote; this.failStart = t - (1 - fail) * 1.8
    this.death = death; this.deathKind = deathKind
    this._drawTo(cv.getContext('2d'), cache)
    ;[this.t, this.bt, this.btStart, this.fail, this.demote, this.failStart, this.death, this.deathKind] = saved
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
          if (this.death > 0 && this.death < 1) this.death = Math.min(1, this.death + step / (this.reducedMotion ? 1.2 : InkRenderer.DEATH_SECONDS))
          this.bt += (this.btTarget - this.bt) * k
        }
        if (!this.skipHidden || this.cv.offsetParent) this._draw()
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  _cacheFor() {
    const dpr = this._dpr()
    if (!this.cache || this.cache.w !== this.w || this.cache.h !== this.h || this.cache.dpr !== dpr) {
      // the backing store follows a DPR change (another monitor, phone): else the new cache is drawn cropped
      const bw = Math.round(this.w * dpr), bh = Math.round(this.h * dpr)
      if (this.cv.width !== bw) this.cv.width = bw
      if (this.cv.height !== bh) this.cv.height = bh
      this.cache = this._buildCache(this.w, this.h, dpr)
    }
    return this.cache
  }

  _draw() {
    if (!this.art) return
    this._drawTo(this.ctx, this._cacheFor())
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  _drawTo(ctx, C) {   // (ctx is reassigned while the figure layers compose on C.fig)
    const A = this.art, P = A.palette, t = this.t, bt = this.bt
    const calm = this.reducedMotion
    const breath = calm ? 0 : Math.sin(t * 1.3)
    const k = 1 + A.body.breathe * breath                     // body vertical scale
    const headDy = -(k - 1) * (A.body.anchorY - (A.body.headY ?? 45))           // the head rides on the shoulders
    const qi = this.stageColor
    const fail = this.fail
    const glowCol = inkMix(bt > 0.01 ? inkMix(qi, P.gold, bt) : qi, P.failRed || '#C8453A', fail * 0.85)
    const shake = calm ? 0 : fail * fail * 1.3 * Math.sin(t * 57) * C.S   // the figure shudders (device px)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    if (this.bare) ctx.clearRect(0, 0, C.cw, C.ch); else ctx.drawImage(C.bg, 0, 0)   // bare: figure + effects only (40b cinematic)
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)              // logical scene units from here on

    // Mist drifting between the ridges (pre-rendered band, wraps around)
    if (!C.lod && !this.bare && (A.background.mistA ?? 1) > 0) {
      const drift = (t * 3) % 600, vx0 = -C.ox / C.S, vx1 = (C.cw - C.ox) / C.S   // tile over the whole visible span (wide phone canvases)
      ctx.globalAlpha = Math.min(1, 0.9 * (A.background.mistA ?? 1))
      for (let x = Math.floor((vx0 + drift) / 600) * 600 - drift; x < vx1; x += 600) ctx.drawImage(C.mist, x, 0, 600, 150)
      ctx.globalAlpha = 1
    }
    // Realm ambience (A4-3): fireflies, stars, falling water, birds, drifting clouds, the turning earth, sparkling stars…
    if (!C.lod && !this.bare && A.background.ambience) this._ambience(ctx, C, t)

    // Death moment (A4-3): everything in front of the scenery is composed on its own canvas, then dissolved (_deathCompose)
    const dying = this.death > 0, scene = ctx
    if (dying) {
      if (!C.dth) { C.dth = document.createElement('canvas'); C.dth.width = C.cw; C.dth.height = C.ch }
      ctx = C.dth.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, C.cw, C.ch)
      ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
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

    if (A.pillar && !this.bare) this._pillar(ctx, C, t, bt)   // bare (40b cinematic) draws its own full-height pillar                                 // Ascension: heaven's light falls on you
    if (!calm) this._risingMotes(ctx, C, glowCol, t, bt)

    // Realm ground effects (A4-1): the Foundation array under the lap; the shadow left on the mist by a floating body
    const F = A.float
    const fy = F ? F.y + (calm ? 0 : Math.sin(t * 0.8) * F.bob) : 0           // logical units, negative = lifted
    if (A.formation) this._formation(ctx, C, glowCol, t, bt)
    if (F && F.shadow && !this.bare) this._groundShadow(ctx, F, fy, glowCol)                // (no shadow when there is no ground below)

    ctx.save(); ctx.translate(0, fy)                                          // everything below rides with the body
    if (A.swords) this._swordFan(ctx, C, t, bt)                               // Spirit Severing on: flying swords fanned behind
    if (A.dragons) this._dragons(ctx, C, t, bt, 'back')
    this._rings(ctx, C, glowCol, t, bt, 'back')
    if (A.ribbons) this._ribbons(ctx, C, t)                                   // celestial ribbons float behind the arms
    if (A.halo) this._halo(ctx, C, glowCol, t, bt, headDy)
    if (A.lotus) this._lotus(ctx, C, glowCol, t, bt, 'back')
    ctx.restore()

    // Figure layers: lap (still) → body (breathes) → head (rides the shoulders)
    const ay = A.body.anchorY, fyD = fy * C.S
    const bodyTf = () => ctx.setTransform(1, 0, 0, k, shake, (C.oy + ay * C.S) * (1 - k) + fyD)
    const headTf = () => ctx.setTransform(1, 0, 0, 1, shake, headDy * C.S + fyD)
    const headImg = fail > 0.08 ? C.frames.strain : bt > 0.5 ? C.frames.bt : C.layers.head   // expression frames
    // occlude (raster beasts): the figure is composed on its own canvas, and each layer first erases what lies behind
    // its solid silhouette, so a swaying tail or beating wing never shows through the body's dot gaps (user 2026-09-28)
    const fig = C.occ ? C.fig.getContext('2d') : ctx
    if (C.occ) { fig.setTransform(1, 0, 0, 1, 0, 0); fig.clearRect(0, 0, C.cw, C.ch) }
    const out = ctx; ctx = fig
    this._layerOrder().forEach((L, li) => {
      ctx.save()
      if (L === 'body') bodyTf()
      else if (L === 'head') headTf()
      else if (A.motion?.[L]) this._swingTf(ctx, C, this._mapPivot(A.motion[L]), t, shake, fyD)   // tails sway, wings beat (A4-2)
      else ctx.setTransform(1, 0, 0, 1, shake, fyD)
      if (C.occ && li > 0 && C.mask[L]) { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(C.mask[L], 0, 0); ctx.globalCompositeOperation = 'source-over' }
      ctx.drawImage(L === 'head' ? headImg : C.layers[L], 0, 0)
      if (bt > 0.01) { ctx.globalAlpha = bt; ctx.drawImage(C.rim[L], 0, 0); ctx.globalAlpha = 1 }
      ctx.restore()
    })
    ctx = out
    if (C.occ) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(C.fig, 0, 0) }
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

    // glints (raster beasts): a living eye, a pulsing gem; [{ x, y, r, color }] in scene units, drawn as glowing dots
    for (const G0 of A.glints || []) {
      const q = this._mapPivot({ map: G0.map, pivot: [G0.x, G0.y] }), G = { ...G0, x: q.pivot[0], y: q.pivot[1] }
      const pl = calm ? 0.7 : 0.7 + 0.3 * Math.sin(t * 2.1 + G.x)
      inkSoftDot(ctx, G.x, G.y + headDy, G.r * 3.5, P[G.color] || G.color, 0.6 * pl + 0.3 * bt)
      inkSoftDot(ctx, G.x, G.y + headDy, G.r, inkMix(P[G.color] || G.color, '#FFFFFF', 0.5), 0.95)
    }
    if (A.lotus) this._lotus(ctx, C, glowCol, t, bt, 'front')
    this._rings(ctx, C, glowCol, t, bt, 'front')
    if (A.dragons) this._dragons(ctx, C, t, bt, 'front')
    if (A.bolts && !this.reducedMotion) this._bolts(ctx, C, t)
    if (bt > 0.01 && !dying) this._ripples(ctx, C, t, bt, headDy)
    if (dying) { ctx = scene; this._deathCompose(ctx, C, fy) }
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
    // a sun-disk (Spirit Severing on): dotted rays turning slowly outside the ring, long and short alternating
    if (h.rays && !this.demote) {
      const spin = this.reducedMotion ? 0 : t * 0.05, R0 = r * (h.outer || 1) + 2.5, path = new Path2D()
      for (let i = 0; i < h.rays; i++) {
        const ang = spin + i / h.rays * Math.PI * 2, len = i % 2 ? h.rayLen * 0.5 : h.rayLen
        for (let d = 0; d <= len; d += 1.6) {
          const rr = 0.55 * (1 - d / (len + 2)) + 0.15, x = h.x + Math.cos(ang) * (R0 + d), yy = y + Math.sin(ang) * (R0 + d)
          path.moveTo(x + rr, yy); path.arc(x, yy, rr, 0, Math.PI * 2)
        }
      }
      ctx.fillStyle = inkRgba(inkMix(col, '#FFFFFF', 0.3), (0.55 + 0.35 * bt) * (1 - this.fail)); ctx.fill(path)
    }
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
    if (Fm.core) {                                                       // a rift: darkness swallowing the middle
      const d = ctx.createRadialGradient(0, 0, 0, 0, 0, Fm.rx * 0.72)
      d.addColorStop(0, inkRgba('#020104', 0.95)); d.addColorStop(0.75, inkRgba('#05020A', 0.8)); d.addColorStop(1, inkRgba('#05020A', 0))
      ctx.fillStyle = d; ctx.beginPath(); ctx.arc(0, 0, Fm.rx * 0.72, 0, Math.PI * 2); ctx.fill()
    }
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

  // ── Realm spectacle (A4-1, user 2026-09-27: "the bigger realms should be wildly different") ──

  // Qi dragons: spirits of condensed Qi (not beasts) that coil around the cultivator on tilted orbits and weave
  // behind and in front of the figure. Rank grows with the realm: a baby (Core) → young pair (Nascent Soul) → grown
  // pair with horns, mane and claws chasing pearls (Spirit Severing) → three golden sovereigns (Ascension).
  // D = { cx cy rx ry tilt  speed phase  arc (body length, radians)  size (head width)  wave  bob  color  tier 1..4 }
  _dragons(ctx, C, t, bt, half) {
    const P = this.art.palette, calm = this.reducedMotion, back = half === 'back'
    for (const D of this.art.dragons) {
      const col = inkMix(P[D.color] || this.stageColor, P.gold, bt * 0.6)
      const hi = inkMix(col, '#FFFFFF', 0.55), deep = inkMix(col, '#05030A', 0.45)
      const dir = Math.sign(D.speed) || 1
      const head = (calm ? 0 : t * D.speed) + D.phase - this.fail * 0.4 * D.speed
      const ct = Math.cos(D.tilt), st = Math.sin(D.tilt)
      const K = C.lod ? 22 : Math.round(40 + D.arc * 34)
      const orbit = a => {
        const x = Math.cos(a) * D.rx, y = Math.sin(a) * D.ry + D.bob * Math.sin(a * 2 + t * 0.7)
        return [D.cx + x * ct - y * st, D.cy + x * st + y * ct]
      }
      // spine: head first; the body undulates sideways, the head stays steadier
      const pts = []
      for (let i = 0; i <= K; i++) {
        const u = i / K, a = head - dir * u * D.arc
        pts.push({ u, a, p: orbit(a), far: Math.sin(a) < 0 })
      }
      for (let i = 0; i <= K; i++) {
        const q = pts[i], n0 = pts[Math.max(0, i - 1)].p, n1 = pts[Math.min(K, i + 1)].p
        let tx = n0[0] - n1[0], ty = n0[1] - n1[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L
        q.tx = tx; q.ty = ty; q.nx = -ty; q.ny = tx                              // tangent (towards the head) + normal
        const wv = calm ? 0 : D.wave * Math.sin(t * 2.4 - q.u * 9) * (0.25 + 0.75 * q.u)
        q.x = q.p[0] + q.nx * wv; q.y = q.p[1] + q.ny * wv
        // body width: a neck behind the head, full at the shoulders, tapering to a fine tail
        q.w = D.size * (q.u < 0.07 ? 0.7 + q.u * 3 : Math.pow(1 - (q.u - 0.07) / 0.93, 0.75)) * (0.35 + 0.65 * Math.min(1, q.u * 8 + 0.4))
      }
      const alpha = (D.alpha || 1) * (1 - 0.6 * this.fail)
      const sideOk = q => q.far === back
      // 1 · the Qi glow around the body (one soft stroke along the spine)
      if (!C.lod) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.strokeStyle = inkRgba(col, 0.12 * alpha * (1 + bt)); ctx.lineWidth = D.size * 2.6
        ctx.shadowColor = col; ctx.shadowBlur = D.size * 1.5 * C.S
        ctx.beginPath(); let on = false
        for (let i = 0; i <= K; i += 2) { const q = pts[i]; if (!sideOk(q)) { on = false; continue } on ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); on = true }
        ctx.stroke(); ctx.restore()
      }
      // 2 · the body: overlapping dots, dark underside + bright back (batched: one fill per tone)
      const under = new Path2D(), top = new Path2D(), scales = new Path2D()
      for (let i = K; i >= 1; i--) {
        const q = pts[i]; if (!sideOk(q)) continue
        const r = Math.max(0.25, q.w / 2)
        let x = q.x - q.nx * r * 0.25, y = q.y - q.ny * r * 0.25; under.moveTo(x + r, y); under.arc(x, y, r, 0, Math.PI * 2)
        x = q.x + q.nx * r * 0.2; y = q.y + q.ny * r * 0.2; top.moveTo(x + r * 0.78, y); top.arc(x, y, r * 0.78, 0, Math.PI * 2)
        if (i % 2 === 0 && i > 1 && i < K - 1 && !C.lod) { const sr = Math.max(0.35, r * 0.3); x = q.x + q.nx * r * 0.45; y = q.y + q.ny * r * 0.45; scales.moveTo(x + sr, y); scales.arc(x, y, sr, 0, Math.PI * 2) }
      }
      ctx.fillStyle = inkRgba(deep, 0.75 * alpha); ctx.fill(under)
      ctx.fillStyle = inkRgba(col, 0.9 * alpha); ctx.fill(top)
      ctx.fillStyle = inkRgba(hi, 0.95 * alpha); ctx.fill(scales)
      // 3 · the mane / dorsal fins (tier ≥ 2); claws (tier ≥ 3)
      if (!C.lod && D.tier >= 2) for (let i = K - 2; i >= 2; i--) {
        const q = pts[i]; if (!sideOk(q)) continue
        const r = q.w / 2
        if (D.tier >= 2 && i % 4 === 0 && q.u > 0.06 && q.u < 0.9) {
          const len = (D.tier >= 3 ? 1.1 : 0.7) * q.w + 0.6, bx = q.x + q.nx * r, by = q.y + q.ny * r
          inkBrush(ctx, [[bx + q.tx * len * 0.3, by + q.ty * len * 0.3], [bx + q.nx * len - q.tx * len * 0.5, by + q.ny * len - q.ty * len * 0.5]],
            Math.max(0.5, q.w * 0.3), hi, 0.8 * alpha, C.minW)
        }
        if (D.tier >= 3 && (i === Math.round(K * 0.22) || i === Math.round(K * 0.5))) {       // two pairs of claws, reaching down
          for (const sd of [-1, 1]) {
            const bx = q.x - q.nx * r * 0.8, by = q.y - q.ny * r * 0.8, len = q.w * 1.3 + 1
            const ex = bx - q.nx * len + q.tx * sd * len * 0.6, ey = by - q.ny * len + q.ty * sd * len * 0.6
            inkBrush(ctx, [[bx, by], [(bx + ex) / 2 - q.tx * 0.6, (by + ey) / 2 - q.ty * 0.6], [ex, ey]], Math.max(0.45, q.w * 0.3), col, 0.9 * alpha, C.minW)
            for (const f of [-0.6, 0, 0.6]) inkBrush(ctx, [[ex, ey], [ex - q.nx * 1.1 + q.tx * f, ey - q.ny * 1.1 + q.ty * f]], 0.35, hi, 0.9 * alpha, C.minW)
          }
        }
      }
      // 4 · tail flame: a few soft wisps trailing off the tip
      const tail = pts[K]
      if (sideOk(tail) && !C.lod) for (let j = 0; j < 4; j++) {
        const f = (t * 1.6 + j * 0.25) % 1
        inkSoftDot(ctx, tail.x - tail.tx * f * 5 + tail.nx * Math.sin(t * 5 + j) * 1.2, tail.y - tail.ty * f * 5 + tail.ny * Math.sin(t * 5 + j) * 1.2,
          1.4 * (1 - f) + 0.4, hi, 0.55 * (1 - f) * alpha)
      }
      // 5 · the head: an elongated skull + snout, horns swept back, long whiskers, a glowing eye; grown dragons chase a pearl
      const h0 = pts[0]
      if (!sideOk(h0)) continue
      const hw = D.size * 0.62, hl = D.size * 1.5
      const hx = h0.x + h0.tx * hl * 0.35, hy = h0.y + h0.ty * hl * 0.35
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(h0.ty, h0.tx))
      inkSoftDot(ctx, 0, 0, hl * 1.4, col, 0.22 * alpha * (1 + bt))
      ctx.fillStyle = inkRgba(deep, 0.85 * alpha)
      ctx.beginPath(); ctx.moveTo(-hl * 0.5, -hw); ctx.quadraticCurveTo(hl * 0.35, -hw * 1.05, hl * 0.95, -hw * 0.35)
      ctx.lineTo(hl * 1.05, hw * 0.05); ctx.quadraticCurveTo(hl * 0.4, hw * 0.95, -hl * 0.5, hw * 0.85); ctx.closePath(); ctx.fill()
      ctx.fillStyle = inkRgba(col, 0.95 * alpha)
      ctx.beginPath(); ctx.moveTo(-hl * 0.42, -hw * 0.8); ctx.quadraticCurveTo(hl * 0.35, -hw * 0.9, hl * 0.9, -hw * 0.3)
      ctx.lineTo(hl * 0.95, 0); ctx.quadraticCurveTo(hl * 0.3, hw * 0.35, -hl * 0.42, hw * 0.45); ctx.closePath(); ctx.fill()
      if (!C.lod) {
        const hornL = D.tier >= 3 ? hl * 1.25 : D.tier >= 2 ? hl * 0.85 : hl * 0.45
        for (const sd of [-1, 1]) {                                             // horns (antler-like when grown)
          const bx = -hl * 0.15, by = sd * hw * 0.55
          inkBrush(ctx, [[bx, by], [bx - hornL * 0.55, by + sd * hornL * 0.35], [bx - hornL, by + sd * hornL * 0.3]], Math.max(0.5, hw * 0.45), hi, 0.95 * alpha, C.minW)
          if (D.tier >= 3) inkBrush(ctx, [[bx - hornL * 0.5, by + sd * hornL * 0.33], [bx - hornL * 0.55, by + sd * hornL * 0.7]], Math.max(0.4, hw * 0.3), hi, 0.9 * alpha, C.minW)
        }
        const wl = D.size * (D.tier >= 2 ? 4.2 : 2.4), wave = calm ? 0 : Math.sin(t * 3)
        for (const sd of [-1, 1]) {                                             // whiskers stream back from the snout
          inkBrush(ctx, [[hl * 0.85, sd * hw * 0.25], [hl * 0.3, sd * hw * 1.4 + wave * 0.6], [-wl * 0.4, sd * hw * 1.8 - wave], [-wl, sd * hw * 1.3 + wave * 1.4]],
            0.55, hi, 0.75 * alpha, C.minW)
        }
        if (D.tier >= 2) {                                                     // the mane behind the skull
          for (let j = 0; j < 3; j++) inkBrush(ctx, [[-hl * 0.3, (j - 1) * hw * 0.5], [-hl * (0.9 + j * 0.15), (j - 1) * hw * 1.1 + (calm ? 0 : Math.sin(t * 4 + j) * 0.5)]],
            Math.max(0.5, hw * 0.5), col, 0.7 * alpha, C.minW)
        }
        inkSoftDot(ctx, hl * 0.35, -hw * 0.35, Math.max(0.6, hw * 0.45) + 0.8, '#FFFFFF', 0.5 * alpha)   // the eye
        inkSoftDot(ctx, hl * 0.35, -hw * 0.35, Math.max(0.3, hw * 0.22), '#FFFFFF', alpha)
      }
      ctx.restore()
      if (D.tier >= 3 && !C.lod) {                                             // the pearl it chases, just ahead of the jaws
        const px = hx + h0.tx * hl * 1.9, py = hy + h0.ty * hl * 1.9, pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3 + D.phase)
        inkSoftDot(ctx, px, py, D.size * 1.6, hi, (0.25 + 0.2 * pulse) * alpha)
        inkSoftDot(ctx, px, py, D.size * 0.45, '#FFFFFF', 0.95 * alpha)
      }
    }
  }

  // Flying swords (Spirit Severing on): a fan of swords standing in the air behind the cultivator, tips outward,
  // each hovering on its own breath. Objects, so solid (user rule). S = { cx cy r n spread len }
  _swordFan(ctx, C, t, bt) {
    const S = this.art.swords, P = this.art.palette, calm = this.reducedMotion
    for (let i = 0; i < S.n; i++) {
      const th = -S.spread / 2 + S.spread * i / (S.n - 1)
      const hover = calm ? 0 : Math.sin(t * 1.3 + i * 0.9) * 1.4 - this.fail * 6 * inkRnd(i)
      const r = S.r + hover, x = S.cx + Math.sin(th) * r, y = S.cy - Math.cos(th) * r
      ctx.save(); ctx.translate(x, y); ctx.rotate(th)
      const L = S.len, a = 0.92 * (1 - 0.5 * this.fail)
      // its trail of Qi towards the centre
      const g = ctx.createLinearGradient(0, L * 0.3, 0, L * 1.2)
      g.addColorStop(0, inkRgba(P.swordGlow || P.gold, 0.28 * a)); g.addColorStop(1, inkRgba(P.swordGlow || P.gold, 0))
      ctx.fillStyle = g; ctx.fillRect(-1.2, L * 0.3, 2.4, L * 0.9)
      ctx.shadowColor = P.swordGlow || P.gold; ctx.shadowBlur = (3 + 3 * bt) * C.S
      const bl = ctx.createLinearGradient(-1, 0, 1, 0)
      bl.addColorStop(0, P.steel); bl.addColorStop(1, P.steelShade)
      ctx.fillStyle = bl; ctx.globalAlpha = a
      ctx.beginPath(); ctx.moveTo(0, -L * 0.62); ctx.lineTo(1.05, -L * 0.5); ctx.lineTo(1.05, L * 0.2); ctx.lineTo(-1.05, L * 0.2); ctx.lineTo(-1.05, -L * 0.5); ctx.closePath(); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = P.trim; ctx.fillRect(-2.6, L * 0.2, 5.2, 1.1)              // guard
      ctx.fillStyle = P.grip; ctx.fillRect(-0.7, L * 0.2 + 1.1, 1.4, L * 0.2)      // grip
      ctx.fillStyle = P.trim; ctx.beginPath(); ctx.arc(0, L * 0.42 + 1.3, 0.9, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = P.rim; ctx.globalAlpha = 0.6 * a; ctx.fillRect(-0.2, -L * 0.5, 0.4, L * 0.66)   // edge light
      ctx.globalAlpha = 1
      ctx.restore()
    }
  }

  // A lotus of light under the seat (Nascent Soul on): a back row of tall petals behind the lap and a front row of
  // short ones in front of it. Petals are translucent Qi: a soft fill, a lit rim and a bright tip. L = { x y w h n }
  _lotus(ctx, C, col, t, bt, half) {
    const L = this.art.lotus, calm = this.reducedMotion, breathe = calm ? 0 : Math.sin(t * 0.9) * 0.04
    const rows = half === 'back' ? [[L.n, 1, -1]] : [[L.n - 2, 0.62, 1]]
    const c2 = inkMix(col, '#FFFFFF', 0.4)
    for (const [n, sc, row] of rows) {
      for (let i = 0; i < n; i++) {
        const f = n === 1 ? 0 : i / (n - 1) * 2 - 1                            // −1 … 1 across the row
        const bx = L.x + f * L.w * 0.42 * sc, by = L.y + (row > 0 ? 3 : 0) - Math.abs(f) * 2
        const ang = f * (row > 0 ? 0.9 : 1.05), len = L.h * sc * (1.05 - 0.35 * Math.abs(f)) * (1 + breathe), wd = L.h * 0.34 * sc
        ctx.save(); ctx.translate(bx, by); ctx.rotate(ang)
        const g = ctx.createLinearGradient(0, 0, 0, -len)
        g.addColorStop(0, inkRgba(col, 0.08)); g.addColorStop(0.7, inkRgba(col, 0.26 * (1 + bt))); g.addColorStop(1, inkRgba(c2, 0.45 * (1 + bt)))
        ctx.fillStyle = g
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wd, -len * 0.45, 0, -len); ctx.quadraticCurveTo(-wd, -len * 0.45, 0, 0); ctx.fill()
        ctx.lineWidth = Math.max(0.45, C.minW); ctx.strokeStyle = inkRgba(c2, 0.7 * (1 - 0.6 * this.fail)); ctx.stroke()
        ctx.restore()
        const tx = bx + Math.sin(ang) * len, ty = by - Math.cos(ang) * len
        inkSoftDot(ctx, tx, ty, 2.2, c2, 0.35); inkSoftDot(ctx, tx, ty, 0.6, '#FFFFFF', 0.9)
      }
    }
  }

  // Celestial ribbons (披帛-style sashes of the immortals) floating out from the shoulders and down past the knees,
  // drawn as grid-snapped dots (cloth is ink dots). R = [{ pts, color, w, wave }]
  _ribbons(ctx, C, t) {
    const PAL = this.art.palette, calm = this.reducedMotion, P = this.art.dot.pitch, RY = P * 0.866, gx0 = this._gx0()
    for (const [n, R] of this.art.ribbons.entries()) {
      // the ribbon's centre line, waving harder towards the free end
      const pts = R.pts.map(([x, y], i) => {
        const u = i / (R.pts.length - 1), w = calm ? 0 : Math.sin(t * 1.1 - i * 0.9 + n * 2) * R.wave * u
        return [x + w * 0.6, y + w]
      })
      const col = PAL[R.color], hi = inkMix(col, '#FFFFFF', 0.55), seen = new Set(), body = new Path2D(), edge = new Path2D()
      let total = 0; const segs = []
      for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(L); total += L }
      let run = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = segs[i], nx = -(y1 - y0) / L, ny = (x1 - x0) / L
        for (let d = 0; d <= L; d += 0.5) {
          const u = (run + d) / total, half = R.w * (0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.3))) * (1 - 0.7 * u)
          const cx = x0 + (x1 - x0) * d / L, cy = y0 + (y1 - y0) * d / L
          for (let o = -half; o <= half; o += P * 0.5) {
            const x = cx + nx * o, y = cy + ny * o, row = Math.round(y / RY), off = gx0 + (row & 1 ? P / 2 : 0), c = Math.round((x - off) / P)
            const key = row * 10000 + c
            if (seen.has(key)) continue
            seen.add(key)
            if (u > 0.55 && inkRnd(key) < (u - 0.55) * 1.6) continue                 // the free end frays into the air
            const gx = c * P + off, gy = row * RY, path = o < -half + P * 0.6 ? edge : body, rr = P * 0.4
            path.moveTo(gx + rr, gy); path.arc(gx, gy, rr, 0, Math.PI * 2)
          }
        }
        run += L
      }
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill(body)
      ctx.fillStyle = hi; ctx.globalAlpha = 0.95; ctx.fill(edge)
      ctx.globalAlpha = 1
    }
  }

  // Ascension: a pillar of heaven's light falling on the cultivator from above the frame.
  _pillar(ctx, C, t, bt) {
    const Pl = this.art.pillar, col = this.art.palette[Pl.color] || this.art.palette.gold
    const k = 0.85 + (this.reducedMotion ? 0 : 0.15 * Math.sin(t * 0.7))
    const top = -C.oy / C.S
    const g = ctx.createLinearGradient(Pl.x - Pl.w, 0, Pl.x + Pl.w, 0)
    g.addColorStop(0, inkRgba(col, 0)); g.addColorStop(0.5, inkRgba(col, Pl.alpha * k * (1 + bt))); g.addColorStop(1, inkRgba(col, 0))
    ctx.fillStyle = g; ctx.fillRect(Pl.x - Pl.w, top, Pl.w * 2, Pl.y - top)
    const g2 = ctx.createLinearGradient(Pl.x - Pl.w * 0.3, 0, Pl.x + Pl.w * 0.3, 0)
    g2.addColorStop(0, inkRgba(col, 0)); g2.addColorStop(0.5, inkRgba('#FFFFFF', Pl.alpha * 0.8 * k)); g2.addColorStop(1, inkRgba(col, 0))
    ctx.fillStyle = g2; ctx.fillRect(Pl.x - Pl.w * 0.3, top, Pl.w * 0.6, Pl.y - top)
  }

  // Motion layers back → front. The cultivator uses lap / body / head; beasts add their own (tail, wings) with
  // `motion[layer] = { pivot: [x, y], amp (radians), speed, phase, scaleY? }` (A4-2).
  _layerOrder() { return this.art.layerOrder || ['lap', 'body', 'head'] }

  // A swinging layer: rotated about its pivot (a tail at its root, a wing at the shoulder); scaleY squashes a beating wing.
  _swingTf(ctx, C, M, t, shake, fyD) {
    const calm = this.reducedMotion, w = calm ? 0 : Math.sin(t * M.speed + (M.phase || 0))
    const px = C.ox + M.pivot[0] * C.S, py = C.oy + M.pivot[1] * C.S
    ctx.setTransform(1, 0, 0, 1, px + shake, py + fyD)
    ctx.rotate(M.amp * w)
    if (M.scaleY) ctx.scale(1, 1 + M.scaleY * w)
    ctx.translate(-px, -py)
  }

  // Lightning (Thunder Eagle): short jagged bolts flicker around the beast, each alive for a fraction of a second.
  // B = { n, area: [x0, y0, x1, y1], avoid?: [x0, x1] (a band the bolts never start in: the head), color, every (s) }
  _bolts(ctx, C, t) {
    const B = this.art.bolts, col = this.art.palette[B.color] || '#E8F4FF'
    for (let i = 0; i < B.n; i++) {
      const cycle = t / B.every + inkRnd(i * 3.7), k = Math.floor(cycle), f = cycle - k
      if (f > 0.2) continue                                               // most of the time: dark
      const seed = k * 17 + i * 5, a = 0.55 + 0.45 * (1 - f / 0.2)      // bright for its whole short life
      let x = B.area[0] + inkRnd(seed) * (B.area[2] - B.area[0]), y = B.area[1] + inkRnd(seed + 1) * (B.area[3] - B.area[1]) * 0.5
      if (B.avoid && x > B.avoid[0] && x < B.avoid[1]) x = x < (B.avoid[0] + B.avoid[1]) / 2 ? B.avoid[0] - 8 : B.avoid[1] + 8   // not across the face
      const pts = [[x, y]]
      for (let j = 0; j < 5; j++) { x += (inkRnd(seed + j * 2 + 3) - 0.5) * 9; y += 3 + inkRnd(seed + j * 2 + 4) * 5; pts.push([x, y]) }
      const fork = [pts[2]]                                               // a branch splitting off partway down
      let fx = pts[2][0], fy = pts[2][1], dir = inkRnd(seed + 20) < 0.5 ? -1 : 1
      for (let j = 0; j < 3; j++) { fx += dir * (3 + inkRnd(seed + j + 21) * 4); fy += 2 + inkRnd(seed + j + 25) * 4; fork.push([fx, fy]) }
      const core = new Path2D(), halo = new Path2D(), step = 0.9
      let n = 0
      for (const run of [pts, fork]) for (let j = 1; j < run.length; j++) {
        const [ax, ay] = run[j - 1], [bx, by] = run[j], len = Math.hypot(bx - ax, by - ay)
        for (let u = 0; u < len; u += step) {
          const x = ax + (bx - ax) * u / len, y = ay + (by - ay) * u / len, jx = (inkRnd(seed + n) - 0.5) * 0.5; n++
          core.moveTo(x + jx + 0.42, y); core.arc(x + jx, y, 0.42, 0, Math.PI * 2)
          if (inkRnd(seed + n * 3) < 0.18) { const sx = x + (inkRnd(seed + n * 5) - 0.5) * 4, sy = y + (inkRnd(seed + n * 7) - 0.5) * 4
            halo.moveTo(sx + 0.3, sy); halo.arc(sx, sy, 0.3, 0, Math.PI * 2) }
        }
      }
      ctx.save()
      ctx.shadowColor = col; ctx.shadowBlur = 6 * C.S
      ctx.fillStyle = inkRgba(col, 0.8 * a); ctx.fill(halo); ctx.fill(core)
      ctx.shadowBlur = 2 * C.S; ctx.shadowColor = '#FFFFFF'
      ctx.fillStyle = inkRgba('#FFFFFF', a); ctx.fill(core)
      ctx.restore()
    }
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
      const y = (M.y0 ?? 140) - life * (M.rise ?? 132)
      const a = Math.sin(life * Math.PI) * (0.55 + 0.35 * bt)
      const base = M.color ? this.art.palette[M.color] : col
      const c = bt > 0.3 && i % 2 ? this.art.palette.gold : base
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
    const full = A.view || [0, 0, SW, SH]                      // `view` zooms out for headroom (floating realms) or in (portraits)
    const lod = Math.min(w / (full[2] - full[0]), h / (full[3] - full[1])) < 0.5   // banner-sized: fine dots would turn to noise
    const box = lod ? A.figureBox : full
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
    for (const L of this._layerOrder()) {
      C.layers[L] = mk(); this._paintLayer(C.layers[L].getContext('2d'), C, parts, grid, L, false)
      C.rim[L] = mk();    this._paintLayer(C.rim[L].getContext('2d'), C, parts, grid, L, true)
    }
    C.occ = !!(A.raster && this._layerOrder().length > 1)
    if (C.occ) {                                              // silhouette masks per layer (see _drawTo)
      C.fig = mk(); C.mask = {}
      for (const L of this._layerOrder()) {
        const m = mk(), g = m.getContext('2d'); g.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
        for (const R of [].concat(A.raster)) this._paintRasterMask(g, R, L)
        C.mask[L] = m
      }
    }
    // expression frames: the head layer again with the frame's dot features (falls back to the plain head)
    for (const fr of ['bt', 'strain']) {
      if (!this.art.frames[fr]) { C.frames[fr] = C.layers.head; continue }
      C.frames[fr] = mk(); this._paintLayer(C.frames[fr].getContext('2d'), C, parts, grid, 'head', false, fr)
    }
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
    for (const R of [].concat(A.raster || [])) this._paintRaster(ctx, C, R, layer, rim)
    if (rim) return
    if (C.lod) for (const f of this._feats) if (parts.find(q => q.id === f.part)?.layer === layer) inkBrush(ctx, f.pts.length > 1 ? f.pts : [f.pts[0], f.pts[0]], f.w, PAL[f.color], 1, C.minW)
    for (const s of A.strokes) if (s.layer === layer && !s.live && !s.after) this._stroke(ctx, C, s, PAL)
    for (const g of A.glyphs) if (g.layer === layer) inkGlyphRun(ctx, g, PAL, C.lod, C.S)
  }

  // ── Raster art: a baked DOT MAP drawn as ink dots (dots only, user 2026-09-28) ──
  // R = { map: 'sprites/beasts/<id>.png' (relative to assets/), box: [x0 y0 x1 y1] (scene; the map's width spans it),
  //       layer?: 'body', regions?: [{ layer, mask: [[mx, my], ...] }] (map px; dots inside go to that layer, e.g. a tail
  //       that sways), minL?: 0.1 (darker = no dot), gain?: 1, sat?: 1.3, gamma?: 1.4 (dot-size curve),
  //       tone?: e.g. 0.7 (< 1 lifts a dark beast's shadows: a black wolf's face and ruff) }
  // One map pixel = one dot on the hex grid (odd rows half a dot right, rows 0.866 of a dot apart). Maps come from
  // scripts/art/ink-bake.js and can be hand-edited in any pixel editor (alpha 0 = no dot). Brightness sets each dot's
  // size and alpha, so the picture reads as ink dots with gaps; the silhouette takes the art's `edgeGlow`.
  static image(src, onload) {
    const M = InkRenderer._imgs || (InkRenderer._imgs = new Map())
    let e = M.get(src)
    if (!e) { e = { img: new Image(), ok: false, wait: [] }; M.set(src, e)
      e.img.onload = () => { e.ok = true; e.wait.splice(0).forEach(f => f()) }
      e.img.onerror = () => console.warn('ink dot map failed to load', src)
      e.img.src = src }
    if (!e.ok && onload) e.wait.push(onload)
    return e.ok ? e.img : null
  }
  // assets/ sits beside renderer/ on desktop ("../assets/") but inside the web root on mobile ("assets/"): take the
  // prefix the page actually used to load the sprite data.
  static assetUrl(rel) {
    if (InkRenderer._assetBase == null) {
      const s = [...document.scripts].map(x => x.getAttribute('src') || '').find(x => x.includes('assets/sprites/'))
      InkRenderer._assetBase = s ? s.slice(0, s.indexOf('assets/') + 7) : '../assets/'
    }
    return InkRenderer._assetBase + rel
  }

  _rasterGrid(R) {
    const img = InkRenderer.image(InkRenderer.assetUrl(R.map), () => { this.cache = null })
    if (!img) return null
    const key = R.map + '|' + R.box
    if (R._g?.key === key) return R._g
    // contain-fit: any map aspect (a tall dragon, a wide eagle) is centred in the box at the largest dot size that fits
    const W = img.naturalWidth, H = img.naturalHeight, [bx0, by0, bx1, by1] = R.box
    const P = Math.min((bx1 - bx0) / W, (by1 - by0) / (H * 0.866)), RY = P * 0.866
    const x0 = bx0 + ((bx1 - bx0) - W * P) / 2, y0 = by0 + ((by1 - by0) - H * RY) / 2
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, W, H).data
    const inPoly = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
      const [xa, ya] = Q[i], [xb, yb] = Q[j]; if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c } return c }
    const solid = (c, r) => c >= 0 && r >= 0 && c < W && r < H && px[(r * W + c) * 4 + 3] >= 128
    const dots = []
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = (r * W + c) * 4
      if (px[k + 3] < 128) continue
      const rgb = R.tone ? [0, 1, 2].map(j => 255 * (px[k + j] / 255) ** R.tone) : [px[k], px[k + 1], px[k + 2]]
      const L = (0.5 * (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) + 0.5 * Math.max(...rgb)) / 255   // luma + value: saturated blues/violets count as bright
      if (L < (R.minL ?? 0.1)) continue
      const o = r & 1
      const edge = [[c - 1, r], [c + 1, r], [c - 1 + o, r - 1], [c + o, r - 1], [c - 1 + o, r + 1], [c + o, r + 1]].some(([cc, rr]) => !solid(cc, rr))
      const layer = (R.regions || []).find(q => inPoly(c + 0.5, r + 0.5, q.mask))?.layer || R.layer || 'body'
      dots.push({ x: x0 + (c + 0.5 + o * 0.5) * P, y: y0 + (r + 0.5) * RY, c, r, rgb, L, layer, edge })
    }
    // auto exposure: a dark beast (a void wolf) and a bright one (a white fox) both land their highlights near white
    const Ls = dots.map(d => d.L).sort((a, b) => a - b), p92 = Ls[Math.floor(Ls.length * 0.92)] || 1
    const expo = Math.max(0.8, Math.min(2.6, 0.92 / p92))
    // seams: a region's dots next to the still body are drawn in BOTH layers, so a swaying tail never opens a gap
    const at = new Map(dots.map(d => [d.c + ',' + d.r, d]))
    const base = R.layer || 'body'
    for (const d of dots) {
      if (d.layer === base) continue
      for (let dr = -2; dr <= 2 && !d.both; dr++) for (let dc = -2; dc <= 2; dc++) { const q = at.get((d.c + dc) + ',' + (d.r + dr)); if (q && q.layer === base) { d.both = true; break } }
    }
    R._g = { key, dots, P, expo, base, x0, y0, RY }
    return R._g
  }

  // Motion / glint positions may be given in DOT-MAP px (`map: [mx, my]`): placed through the raster's contain-fit.
  _mapPivot(M) {
    if (!M.map) return M
    const G = [].concat(this.art.raster || [])[0]?._g
    if (!G) return { ...M, pivot: M.pivot || [150, 75] }
    return { ...M, pivot: [G.x0 + (M.map[0] + 0.5) * G.P, G.y0 + (M.map[1] + 0.5) * G.RY] }
  }

  // A layer's solid silhouette: every one of its dots as a disc wide enough to close the gaps to its neighbours.
  _paintRasterMask(ctx, R, layer) {
    const G = this._rasterGrid(R)
    if (!G) return
    const path = new Path2D(), r = G.P * 0.62
    for (const d of G.dots) if (d.layer === layer || (d.both && layer === G.base)) { path.moveTo(d.x + r, d.y); path.arc(d.x, d.y, r, 0, Math.PI * 2) }
    ctx.fillStyle = '#000'; ctx.fill(path)
  }

  _paintRaster(ctx, C, R, layer, rim) {
    const G = this._rasterGrid(R)
    if (!G) return
    const PAL = this.art.palette, P = G.P, gain = (R.gain ?? 1) * G.expo, sat = R.sat ?? 1.3, gam = R.gamma ?? 1.4
    const eg = this.art.edgeGlow && PAL[this.art.edgeGlow]
    const buckets = new Map(), q = v => Math.max(0, Math.min(255, Math.round(v / 12) * 12))
    const add = (key, x, y, r) => { let b = buckets.get(key); if (!b) { b = new Path2D(); buckets.set(key, b) } b.moveTo(x + r, y); b.arc(x, y, r, 0, Math.PI * 2) }
    for (const d of G.dots) {
      if (d.layer !== layer && !(d.both && layer === G.base)) continue
      if (rim) { if (d.edge) add(`${PAL.gold}|0.95`, d.x, d.y, P * 0.36); continue }
      const L = Math.min(1, d.L * gain), Lc = L ** gam                 // size curve: mid-tones shrink and open gaps, highlights swell
      if (L < 0.32 && inkRnd(d.c * 131 + d.r * 17) < (0.32 - L) * 2.2) continue      // dim patches thin out into the dark
      const rgb = R.hue || R.tint ? inkRecolor(d.rgb, R) : d.rgb
      const m = (rgb[0] + rgb[1] + rgb[2]) / 3
      let col = '#' + rgb.map(v => q((m + (v - m) * sat) * gain).toString(16).padStart(2, '0')).join('')
      let a = (0.45 + 0.55 * L).toFixed(2)
      if (eg && d.edge) { col = inkMix(col, eg, 0.55); a = '0.999' }
      add(`${col}|${a}`, d.x, d.y, P * (0.14 + 0.4 * Lc))
    }
    for (const [key, path] of buckets) {
      const [col, a] = key.split('|')
      ctx.globalAlpha = +a; ctx.fillStyle = col
      if (rim) { ctx.shadowColor = PAL.gold; ctx.shadowBlur = 3 * C.S }
      else if (a === '0.999') { ctx.shadowColor = col; ctx.shadowBlur = 2.5 * C.S }
      ctx.fill(path); ctx.shadowBlur = 0
    }
    ctx.globalAlpha = 1
  }

  // Tone 0..1 at a point of a part: light from the upper left, soft folds (tonal bands, never dark lines).
  _tone(p, x, y) {
    const b = p.box, Lg = this.art.light
    const vy = (y - b[1]) / Math.max(1, b[3] - b[1])
    let L = 0.95 - 0.55 * vy + 0.3 * ((Lg.x - x) / Lg.spread) + (p.lift || 0)   // lift: a part that catches more light
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
    if (!rim && this.art.underpaint !== false) this._underpaint(ctx, p)   // a wash under the dots, so cloth reads as mass (beasts: off, dots only)
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
        // dissolve [x0 y0 x1 y1]: the part thins out into loose Qi dots from (x0,y0) toward (x1,y1) (spirit tails, smoke)
        let dz = 0
        if (p.dissolve) {
          const [x0, y0, x1, y1] = p.dissolve, vx = x1 - x0, vy = y1 - y0
          dz = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)))
          if (inkRnd(seed + 3) < dz * dz * 1.15) continue
        }
        if (rim) {                                           // breakthrough: gold rim on every silhouette edge
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
        const eg = this.art.edgeGlow && PAL[this.art.edgeGlow]
        if (eg && p.mat !== 'cuff' && (dz > 0.35 || at(c - 1, r) < 0 || at(c + 1, r) < 0 || up[0] < 0 || up[1] < 0 || dn[0] < 0 || dn[1] < 0)) {
          col = inkMix(col, eg, 0.3 + 0.6 * dz); a = '0.999'                 // spirit light on the silhouette and dissolving ends
        }
        if (dz) rad *= 1 - 0.45 * dz
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
    // a pale moon, soft (`sun: true` = a low setting sun: wider, warmer glow; `moon: null` = none)
    const m = B.moon
    if (m && m.sun) {
      inkSoftDot(ctx, m.x, m.y, m.r * 7, PAL.moon, 0.09)
      inkSoftDot(ctx, m.x, m.y, m.r * 2.4, PAL.moon, 0.22)
      inkSoftDot(ctx, m.x, m.y, m.r, PAL.moon, 0.75)
    } else if (m) {                                                          // `a` brightens a realm's moon
      inkSoftDot(ctx, m.x, m.y, m.r * 3, PAL.moon, 0.06 * (m.a || 1))
      inkSoftDot(ctx, m.x, m.y, m.r, PAL.moon, 0.22 * (m.a || 1))
    }
    // A4-3 scenery drawn BEHIND the ridges (floating islands, god rays)
    for (const el of B.scenery || []) if (el.back) this._scenery(ctx, C, el, x0, x1, y1)
    const ridge = (R, x) => this._ridge(R, x)
    if (B.ridges !== false) {                                    // `ridges: false` = no mountain ridges (waterfalls, sky, space)
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
    const rimPath = PAL.ridgeRim ? new Path2D() : null                     // an optional lit edge on each ridge line
    for (const [R, col, depth, rad] of [[B.ridgeFar, PAL.mountFar, 12, 0.3], [B.ridgeNear, PAL.mountNear, 15, 0.34]]) {
      const path = new Path2D()
      for (let r = 0; r * RY < 152; r++) {
        const y = r * RY
        for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
          const d = y - ridge(R, x)
          if (d < 0) continue
          if (R === B.ridgeFar && y > ridge(B.ridgeNear, x) - 1) continue
          if (inkRnd2(x, y) < d / depth) continue
          if (rimPath && d < 1.3) { rimPath.moveTo(x + P * rad, y); rimPath.arc(x, y, P * rad, 0, Math.PI * 2); continue }
          const rr = P * rad * (1 - 0.4 * Math.min(1, d / depth))
          path.moveTo(x + rr, y); path.arc(x, y, rr, 0, Math.PI * 2)
        }
      }
      ctx.fillStyle = col; ctx.fill(path)
    }
    if (rimPath) { ctx.fillStyle = inkRgba(PAL.ridgeRim, 0.7); ctx.fill(rimPath) }
    }
    // A4-3 realm scenery in front of the ridges (fields, a hut, pines, a cliff + falls, a cloud sea, a lake…)
    for (const el of B.scenery || []) if (!el.back) this._scenery(ctx, C, el, x0, x1, y1)
  }

  // A waterfall's shape (static curtain + animated water share it): edges widen from w at the lip to wb at the foot and
  // wobble; the lip bulges up (lipArc) where the water rolls over.
  _fallsGeo(el) {
    const top = el.top, bot = el.bottom, wb = el.wb ?? el.w * 1.25, arc = el.lipArc ?? 4
    const f = y => Math.max(0, Math.min(1, (y - top) / (bot - top)))
    const half = y => (el.w + (wb - el.w) * f(y) ** 1.4) / 2
    const L = y => el.x - half(y) - 1.6 * Math.sin(y * 0.11 + 1) - 0.9 * Math.sin(y * 0.29)
    const R = y => el.x + half(y) + 1.6 * Math.sin(y * 0.13 + 2) + 0.9 * Math.sin(y * 0.31 + 1)
    const lipY = x => top - arc * Math.sin(Math.max(0, Math.min(1, (x - el.x + el.w / 2) / el.w)) * Math.PI) + 0.9 * Math.sin(x * 0.7)
    const Ls = y => el.x - half(y), Rs = y => el.x + half(y)
    // x of a streak at fraction u across: smooth inside (no shared wobble bands), the ragged edge only near the sides
    const at = (u, y) => { const e = Math.max(0, 1 - Math.min(u, 1 - u) * 7), a = Ls(y) + u * (Rs(y) - Ls(y)); return a + e * ((L(y) + u * (R(y) - L(y))) - a) }
    return { top, bot, L, R, lipY, at }
  }

  _ridge(R, x) { return R[0] + R[1] * Math.sin(x * R[2] + R[3]) + R[4] * Math.sin(x * R[5] + R[6]) + R[7] * Math.sin(x * R[8] + R[9]) }

  // ── Realm scenery + ambience (A4-3) ──────────────────────────────────────
  // Dots only (no wash), like the rest of the new art. Scenery is static and baked into the background cache;
  // ambience is animated and drawn each frame (a few dozen soft dots). Data: INK_ART[state].background.scenery /
  // .ambience (assets/sprites/ink-cultivator.js). Colours are palette keys.

  // Fill a polygon with hex-staggered ink dots. `shade(x, y)` → radius factor (0 = no dot) for tone and texture.
  _dotPoly(ctx, pts, col, P, rad, alpha = 1, shade = null) {
    const path = new Path2D(); path.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1])
    path.closePath()
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    for (const [x, y] of pts) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y) }
    const RY = P * 0.866, out = new Path2D(), probe = this._probe
    for (let r = Math.floor(by0 / RY); r * RY <= by1; r++) {
      const y = r * RY
      for (let x = Math.floor(bx0 / P) * P + (r & 1 ? P / 2 : 0); x <= bx1; x += P) {
        if (!probe.isPointInPath(path, x, y)) continue
        const f = shade ? shade(x, y) : 1
        if (f <= 0) continue
        const rr = P * rad * f
        out.moveTo(x + rr, y); out.arc(x, y, rr, 0, Math.PI * 2)
      }
    }
    ctx.fillStyle = inkRgba(col, alpha); ctx.fill(out)
  }

  _scenery(ctx, C, el, x0, x1, y1) {
    const PAL = this.art.palette, B = this.art.background, P = this.art.dot.pitch * 0.85, RY = P * 0.866
    const col = k => PAL[k] || k
    switch (el.kind) {
      case 'fields': {                                   // terraced paddies: bright bund lines, water catching the sky
        const bund = new Path2D(), water = new Path2D()
        const edge = (i, x) => el.y0 + (el.y1 - el.y0) * Math.pow(i / el.n, 1.25) + Math.sin(x * 0.021 + i * 1.7) * 2.2
        for (let r = Math.floor(el.y0 / RY); r * RY <= y1 + 2; r++) {
          const y = r * RY
          for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
            let i = 0; while (i < el.n && edge(i + 1, x) < y) i++
            if (i >= el.n || y < edge(0, x)) continue
            const dEdge = y - edge(i, x), n = inkRnd2(x, y)
            if (dEdge < 1.1) { bund.moveTo(x + P * 0.34, y); bund.arc(x, y, P * 0.34, 0, Math.PI * 2) }
            else if (n < 0.16 - dEdge * 0.006) { const rr = P * (0.18 + 0.12 * n); water.moveTo(x + rr, y); water.arc(x, y, rr, 0, Math.PI * 2) }
          }
        }
        ctx.fillStyle = inkRgba(col(el.water), 0.55); ctx.fill(water)
        ctx.fillStyle = inkRgba(col(el.color), 0.8); ctx.fill(bund)
        break
      }
      case 'hut': {                                      // a thatched field hut with one lit window
        const { x, y, w, h } = el, roofY = y - h * 0.55
        this._dotPoly(ctx, [[x - w * 0.42, y], [x - w * 0.42, roofY], [x + w * 0.42, roofY], [x + w * 0.42, y]], col('wall'), P, 0.32, 0.9)
        this._dotPoly(ctx, [[x - w * 0.62, roofY + 2], [x - w * 0.1, y - h], [x + w * 0.1, y - h], [x + w * 0.62, roofY + 2]], col('roof'), P, 0.36, 0.95,
          (px, py) => 0.75 + 0.35 * inkRnd2(px, py))
        inkSoftDot(ctx, x + w * 0.14, y - h * 0.3, 7, col('lamp'), 0.22)
        this._dotPoly(ctx, [[x + w * 0.04, y - h * 0.4], [x + w * 0.24, y - h * 0.4], [x + w * 0.24, y - h * 0.18], [x + w * 0.04, y - h * 0.18]], col('lamp'), P * 0.8, 0.4, 1)
        break
      }
      case 'tree': {                                     // a lone broad tree on the near ridge, bent by the wind
        const base = this._ridge(B.ridgeNear, el.x) + 1.5, h = el.h, lean = el.lean ?? 4
        this._dotPoly(ctx, [[el.x - 1.6, base], [el.x - 1 + lean * 0.4, base - h * 0.45], [el.x + lean - 0.6, base - h * 0.62], [el.x + lean + 0.6, base - h * 0.62],
          [el.x + 1 + lean * 0.4, base - h * 0.45], [el.x + 1.6, base]], col(el.trunk), P, 0.34, 0.95)
        for (const [dx, dy, rx, ry] of [[0, -0.72, 0.42, 0.2], [-0.3, -0.62, 0.3, 0.16], [0.34, -0.64, 0.3, 0.15], [0.12, -0.84, 0.28, 0.14]]) {
          const cx = el.x + lean + dx * h, cy = base + dy * h, pts = []
          for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, wob = 1 + 0.12 * Math.sin(i * 2.7 + el.x); pts.push([cx + Math.cos(a) * rx * h * wob, cy + Math.sin(a) * ry * h * wob]) }
          this._dotPoly(ctx, pts, col(el.leaf), P, 0.36, 0.95, (px, py) => {
            const n = inkRnd2(px, py), lit = (cx - px) + (cy - py) * 1.4                       // upper-left side catches the moon
            if (n < 0.14) return 0
            return 0.62 + 0.3 * n + (lit > 3 ? 0.18 : 0)
          })
        }
        break
      }
      case 'pines': {                                    // stacked tiers of dots standing on the near ridge line
        for (const [x, h] of el.items) {
          const base = this._ridge(B.ridgeNear, x) + 2
          this._dotPoly(ctx, [[x - 0.6, base], [x - 0.6, base - h * 0.3], [x + 0.6, base - h * 0.3], [x + 0.6, base]], col(el.color), P, 0.3, 0.9)
          for (let k = 0; k < 3; k++) {
            const top = base - h * (0.42 + k * 0.24) - h * 0.2, half = h * 0.3 * (1 - k * 0.24)
            this._dotPoly(ctx, [[x - half, top + h * 0.26], [x, top], [x + half, top + h * 0.26]], col(el.color), P, 0.34, 0.9)
          }
        }
        break
      }
      case 'cliff': {                                    // a rock face: its skyline edge frays into loose, lit dots
        const edge = el.pts.slice(0, -2)                                    // the open outline (not the off-screen closing corners)
        const rim = new Path2D()
        this._dotPoly(ctx, el.pts, col(el.color), P, 0.36, 0.95, (px, py) => {
          const n = inkRnd2(px, py), e = inkPolyDist(px, py, edge)
          if (e < 3.6 && n > 0.25) { rim.moveTo(px + P * 0.36, py); rim.arc(px, py, P * 0.36, 0, Math.PI * 2); return 0 }   // the lit edge
          if (e < 5 && n < 0.62 - e * 0.12) return 0                          // frayed edge
          if (e > 6 && Math.sin(px * 0.3 + py * 0.035 + inkRnd2(px * 0.12, py * 0.03) * 5) > 0.55) return 0   // dark crevices running down the face
          if (n < Math.min(0.5, 0.08 + e / 45)) return 0                       // the rock thins toward the inside: depth, not a flat block
          if (e < 3.2) { rim.moveTo(px + P * 0.32, py); rim.arc(px, py, P * 0.32, 0, Math.PI * 2); return 0 }
          return 0.5 + 0.4 * n + (e < 9 ? 0.18 : 0)
        })
        ctx.fillStyle = inkRgba(col(el.hi || el.color), 0.95); ctx.fill(rim)
        break
      }
      case 'falls': {                                    // the still part of a waterfall: a pale column + a mist pool
        const path = new Path2D()
        for (let r = Math.floor(el.y0 / RY); r * RY <= el.y1; r++) {
          const y = r * RY, f = (y - el.y0) / (el.y1 - el.y0), hw = el.w * (0.35 + 0.45 * f) + Math.sin(y * 0.4) * 0.6
          for (let x = el.x - hw; x <= el.x + hw; x += P * 0.8) {
            if (inkRnd2(x, y) < 0.35 + 0.5 * (Math.abs(x - el.x) / hw) ** 2) continue          // soft, ragged edges
            path.moveTo(x + P * 0.22, y); path.arc(x, y, P * 0.22, 0, Math.PI * 2)
          }
        }
        ctx.fillStyle = inkRgba(col(el.color), 0.5); ctx.fill(path)
        const plume = new Path2D()                                           // the mist plume at the foot
        for (let i = 0; i < 60; i++) {
          const a = inkRnd(i * 3.7) * Math.PI, rr = el.w * (0.6 + 2.2 * inkRnd(i * 5.1)), x = el.x + Math.cos(a) * rr * 1.6, y = el.y1 - Math.sin(a) * rr * 0.7
          plume.moveTo(x + 0.4, y); plume.arc(x, y, 0.4, 0, Math.PI * 2)
        }
        ctx.fillStyle = inkRgba(col(el.color), 0.35); ctx.fill(plume)
        inkSoftDot(ctx, el.x, el.y1, el.w * 3.5, col(el.color), 0.16)
        break
      }
      case 'cloudSea': {                                 // a sea of cloud: billowing tops, thinning below
        const top = x => el.y - Math.abs(Math.sin(x * 0.061)) * el.amp - Math.abs(Math.sin(x * 0.027 + 1.3)) * el.amp * 0.7
        const hi = new Path2D(), lo = new Path2D()
        for (let r = Math.floor((el.y - el.amp * 2) / RY); r * RY <= y1 + 2; r++) {
          const y = r * RY
          for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
            const d = y - top(x)
            if (d < 0) continue
            const n = inkRnd2(x, y)
            if (n < Math.min(1, d / el.depth) * (el.thin ?? 0.63)) continue
            const rr = P * 0.36 * (1 - 0.45 * Math.min(1, d / el.depth)), p = d < (el.crest ?? 2.2) ? hi : lo
            p.moveTo(x + rr, y); p.arc(x, y, rr, 0, Math.PI * 2)
          }
        }
        ctx.fillStyle = inkRgba(col(el.color), el.alpha ?? 0.5); ctx.fill(lo)
        ctx.fillStyle = inkRgba(col(el.hi || el.color), 0.85); ctx.fill(hi)
        break
      }
      case 'lake': {                                     // still water: faint ripple rows, the moon's path in bright dots
        const rip = new Path2D(), path = new Path2D(), m = B.moon
        for (let r = Math.floor(el.y / RY); r * RY <= y1 + 2; r++) {
          const y = r * RY, depth = (y - el.y) / 40
          for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
            const n = inkRnd2(x, y)
            const band = Math.sin(x * 0.09 + y * 1.7) > 0.55                                   // ripples come in short dashes
            const half = el.path * (0.5 + 0.9 * depth), dash = m ? Math.floor((x - m.x + 40) / 3.4 + r * 1.7) : 0
            if (m && Math.abs(x - m.x) < half && r % 2 && inkRnd(dash * 7.3 + r) > 0.35 + 0.55 * Math.abs(x - m.x) / half) { path.moveTo(x + P * 0.3, y); path.arc(x, y, P * 0.3, 0, Math.PI * 2) }
            else if (band && n < 0.45) { rip.moveTo(x + P * 0.24, y); rip.arc(x, y, P * 0.24, 0, Math.PI * 2) }
          }
        }
        ctx.fillStyle = inkRgba(col(el.color), 0.55); ctx.fill(rip)
        ctx.fillStyle = inkRgba(col(el.hi), 0.5); ctx.fill(path)
        break
      }
      case 'pads': {                                     // lotus pads (a notched disc of dots) and closed buds on the water
        for (const [x, y, s, bud] of el.items) {
          const rx = 7 * s, ry = 2.2 * s, pts = []
          for (let i = 0; i <= 20; i++) { const a = 0.35 + i / 20 * (Math.PI * 2 - 0.7); pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]) }
          pts.push([x, y])
          this._dotPoly(ctx, pts, col(el.color), P * 0.8, 0.36, 0.75, (px, py) => 0.6 + 0.5 * inkRnd2(px, py))
          if (bud) this._dotPoly(ctx, [[x - 1.6 * s, y - 1], [x - 0.9 * s, y - 4 * s], [x, y - 5.6 * s], [x + 0.9 * s, y - 4 * s], [x + 1.6 * s, y - 1]], col(el.bud), P * 0.6, 0.4, 0.9)
        }
        break
      }
      case 'bigFalls': {                                 // a great waterfall (between two cliffs unless cliffs: false); the falling water is ambience
        const G = this._fallsGeo(el), top = G.top, bot = G.bot, sky = el.cliffTop ?? top - 10, A0 = el.alpha ?? 1
        if (el.cliffs !== false) {
          const side = dir => {                                               // a cliff whose inner face follows the falls' edge
            const edgeAt = y => (dir > 0 ? G.L(y) - 1.5 : G.R(y) + 1.5), pts = [[edgeAt(bot), bot + 40]]
            for (let y = bot; y >= top; y -= 6) pts.push([edgeAt(y) - dir * 2.5 * inkRnd(y * 1.7 + dir), y])
            pts.push([edgeAt(top) - dir * 5, top - 5])                           // a broken, rocky skyline stepping up and away
            for (let i = 1; i <= 14; i++) pts.push([edgeAt(top) - dir * i * 9, sky - i * 1.2 + (inkRnd(i * 3.7 + dir) - 0.5) * 12 - (i % 3 === 0 ? 6 : 0)])
            pts.push([edgeAt(top) - dir * 400, sky - 20], [edgeAt(top) - dir * 400, bot + 40])
            this._scenery(ctx, C, { kind: 'cliff', color: el.rock, hi: el.rockHi, pts }, x0, x1, y1)
          }
          side(1); side(-1)
        }
        // the curtain: streaks that follow the widening shape and wobble, three brightnesses, broken into runs
        const streak = [new Path2D(), new Path2D(), new Path2D()], lip = new Path2D()
        const w0 = G.R(top) - G.L(top), n = Math.round(w0 / (P * 0.95))
        for (let s = 0; s <= n; s++) {
          const u = s / n, lvl = inkRnd(s * 3.3 + el.x) > 0.7 ? 2 : inkRnd(s * 5.1 + el.x) > 0.4 ? 1 : 0, ph = inkRnd(s * 7.1 + el.x) * 40
          const lx = G.L(top) + u * w0
          for (let y = G.lipY(lx) + 1.4; y <= bot; y += 1.1) {
            if (Math.sin(y * 0.07 + ph) + 0.6 * Math.sin(y * 0.19 + ph * 2) < -0.55) continue
            const x = G.at(u, y) + Math.sin(y * 0.05 + ph) * 0.5, rr = P * [0.14, 0.18, 0.22][lvl]
            streak[lvl].moveTo(x + rr, y); streak[lvl].arc(x, y, rr, 0, Math.PI * 2)
          }
          if (inkRnd(Math.floor(s / 3) * 5.7 + el.x) < 0.18) continue                  // breaks in the lip
          for (let k = 0; k < 3; k++) { const y = G.lipY(lx) + k * 1.1 + (k ? inkRnd(s + k) * 0.8 : 0); lip.moveTo(lx + P * 0.3, y); lip.arc(lx, y, P * 0.3, 0, Math.PI * 2) }
        }
        ;[0.2, 0.36, 0.6].forEach((a, i) => { ctx.fillStyle = inkRgba(col(el.color), a * A0); ctx.fill(streak[i]) })
        if (top > -20) { ctx.fillStyle = inkRgba(col(el.color), 0.9 * A0); ctx.fill(lip) }
        if (el.pool) {                                                         // the plunge pool: churned foam, then ripples
          const foam = new Path2D(), rip = new Path2D(), fl = G.L(bot) - 14, fr = G.R(bot) + 14
          const cloudTop = x => bot - 8 - 14 * Math.abs(Math.sin(x * 0.07 + 1)) * (0.5 + 0.5 * inkRnd(Math.floor(x / 9)))   // billows 8-22 up
          for (let r = Math.floor((bot - 24) / RY); r * RY <= y1 + 2; r++) {
            const y = r * RY, d = y - bot
            for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
              const nn = inkRnd2(x, y), side = Math.max(0, Math.max(fl - x, x - fr)) / 16      // fades out past the fall's sides
              const top = cloudTop(x) + side * 16, h = bot + 6 - top
              if (y >= top && y < bot + 6 && nn > 0.25 + 0.6 * (bot + 6 - y) / h * 0.4 + side * 0.5) { foam.moveTo(x + P * 0.3, y); foam.arc(x, y, P * 0.3, 0, Math.PI * 2) }
              else if (d > 6 && Math.sin(x * 0.08 + y * 1.9) > 0.6 && nn < 0.4) { rip.moveTo(x + P * 0.22, y); rip.arc(x, y, P * 0.22, 0, Math.PI * 2) }
            }
          }
          ctx.fillStyle = inkRgba(col(el.color), 0.4); ctx.fill(rip)
          ctx.fillStyle = inkRgba(col(el.color), 0.55); ctx.fill(foam)
        }
        break
      }
      case 'rainbow': {                                  // a faint dotted rainbow standing in the spray
        const cols = ['#E86A6A', '#E8A45A', '#E8D66A', '#6AC88C', '#6A8CE8', '#9A74D8']
        cols.forEach((c, i) => {
          const rr = el.r - i * 1.5, path = new Path2D()
          for (let a = Math.PI * 1.08; a < Math.PI * 1.92; a += 1.3 / rr) {
            const f = Math.sin((a - Math.PI * 1.08) / (Math.PI * 0.84) * Math.PI)       // fades at both feet
            if (inkRnd(a * 97 + i) > f * 0.9) continue
            const x = el.x + Math.cos(a) * rr, y = el.y + Math.sin(a) * rr
            path.moveTo(x + 0.42, y); path.arc(x, y, 0.42, 0, Math.PI * 2)
          }
          ctx.fillStyle = inkRgba(c, el.alpha ?? 0.4); ctx.fill(path)
        })
        break
      }
      case 'peaks': {                                    // jagged mountain peaks: lit left faces, snow on the summits
        for (const [cx, base, h, w, skew = 0] of el.items) {
          // the ridgeline is a random walk (small spurs and notches), not a ruler-straight triangle side
          const sx = cx + skew, sy = base - h, pts = [[cx - w, base + 40], [cx - w, base]], N = 22
          let walk = 0
          for (let i = 1; i < N; i++) {
            const f = i / N; walk = walk * 0.6 + (inkRnd(cx * 3 + i) - 0.5) * h * 0.09
            pts.push([cx - w + (sx - cx + w) * f + (inkRnd(cx + i) - 0.5) * 3, base - h * f ** 0.9 + walk - (i % 5 === 2 ? h * 0.04 : 0)])
          }
          pts.push([sx, sy]); walk = 0
          for (let i = 1; i < N; i++) {
            const f = i / N; walk = walk * 0.6 + (inkRnd(cx * 7 + i) - 0.5) * h * 0.09
            pts.push([sx + (cx + w - sx) * f + (inkRnd(cx + i * 5) - 0.5) * 3, sy + h * f ** 1.1 + walk - (i % 6 === 3 ? h * 0.04 : 0)])
          }
          pts.push([cx + w, base], [cx + w, base + 40])
          const snowY = sy + h * (el.snowline ?? 0.3)
          const snowLine = px => snowY - Math.abs(px - sx) * (el.snowSlope ?? 0.12)                         // snowSlope: the cap narrows down the slopes
          const isSnow = (px, py) => py < snowLine(px) + (inkRnd2(px, py) - 0.5) * 8
          this._dotPoly(ctx, pts, col(el.color), P, 0.36, el.alpha ?? 0.95, (px, py) => isSnow(px, py) ? 0 : (px < sx ? 0.9 : 0.62) * (0.75 + 0.35 * inkRnd2(px, py)))
          this._dotPoly(ctx, pts, col(el.snow), P, 0.36, el.alpha ?? 0.95, (px, py) => {
            if (!isSnow(px, py)) return 0
            const down = Math.max(0, Math.min(1, (py - sy) / Math.max(4, snowLine(px) - sy)))               // 0 at the summit → 1 at the snowline
            if (inkRnd2(px * 1.7, py) < down * 0.65) return 0                                               // the snow thins toward its lower edge
            return (px < sx ? 1 : 0.72) * (1 - 0.35 * down)
          })
        }
        break
      }
      case 'nebula': {                                   // clouds of star-dust: soft falloff, broken up by noise
        for (const [cx, cy, rx, ry, c, ang = 0, a0 = 0.5] of el.items) {
          const path = new Path2D(), ca = Math.cos(ang), sa = Math.sin(ang), R = Math.max(rx, ry)
          for (let r = Math.floor((cy - R) / RY); r * RY <= cy + R; r++) {
            const y = r * RY
            for (let x = Math.floor((cx - R) / P) * P + (r & 1 ? P / 2 : 0); x < cx + R; x += P) {
              const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry, d2 = u * u + v * v
              if (d2 > 1) continue
              const n = 0.6 * inkRnd2(x * 0.25, y * 0.25) + 0.4 * inkRnd2(x, y)
              if (n < 0.35 + 0.6 * d2) continue
              const rr = P * (0.16 + 0.2 * (1 - d2))
              path.moveTo(x + rr, y); path.arc(x, y, rr, 0, Math.PI * 2)
            }
          }
          ctx.fillStyle = inkRgba(col(c), a0); ctx.fill(path)
        }
        break
      }
      case 'earthRim': {                                 // the atmosphere: a glowing dotted limb around the planet
        const { cx, cy, r } = el
        for (const [dr, a, rad] of [[0.8, 0.9, 0.42], [2.4, 0.5, 0.36], [4.2, 0.25, 0.3], [6.2, 0.12, 0.26]]) {
          const path = new Path2D(), R = r + dr
          for (let q = -Math.PI; q < 0; q += 1.5 / R) {
            const x = cx + Math.cos(q) * R, y = cy + Math.sin(q) * R
            if (x < x0 - 4 || x > x1 + 4 || y > y1 + 4) continue
            path.moveTo(x + rad, y); path.arc(x, y, rad, 0, Math.PI * 2)
          }
          ctx.fillStyle = inkRgba(col(el.color), a); ctx.fill(path)
        }
        inkSoftDot(ctx, cx, cy - r, 60, col(el.color), 0.08)
        break
      }
      case 'rays': {                                     // god rays: faint dotted lines fanning down from the sky
        const path = new Path2D()
        for (let i = 0; i < el.n; i++) {
          const ang = Math.PI / 2 + (i / (el.n - 1) - 0.5) * el.spread
          for (let d = 6; d < el.len; d += 2.4) {
            if (inkRnd(i * 97 + d) < d / el.len * 0.8) continue
            const x = el.x + Math.cos(ang) * d, y = el.y + Math.sin(ang) * d
            path.moveTo(x + 0.45, y); path.arc(x, y, 0.45, 0, Math.PI * 2)
          }
        }
        ctx.fillStyle = inkRgba(col(el.color), 0.35); ctx.fill(path)
        break
      }
      case 'islands': {                                  // floating islands, each with a pavilion of the immortals
        for (const [x, y, s] of el.items) {
          const w = 26 * s, jag = i => (inkRnd(x + i * 3.7) - 0.5) * 4 * s
          const under = [[x - w, y], [x + w, y], [x + w * 0.5 + jag(1), y + 8 * s], [x + w * 0.15 + jag(2), y + 16 * s], [x, y + 24 * s], [x - w * 0.2 + jag(3), y + 15 * s], [x - w * 0.6 + jag(4), y + 7 * s]]
          this._dotPoly(ctx, under, col(el.rock), P, 0.36, 0.9, (px, py) => (py - y < 2 ? 1.15 : 0.6 + 0.4 * inkRnd2(px, py)))
          // the pavilion: two pillars, a hall, a curved two-tier roof with upturned eaves
          const hw = 9 * s, hy = y - 1
          this._dotPoly(ctx, [[x - hw * 0.8, hy], [x - hw * 0.8, hy - 7 * s], [x + hw * 0.8, hy - 7 * s], [x + hw * 0.8, hy]], col(el.hall), P * 0.9, 0.3, 0.85)
          for (const [ry, rw, rh] of [[hy - 7 * s, hw * 1.35, 4 * s], [hy - 12 * s, hw * 0.9, 3.5 * s]]) {
            this._dotPoly(ctx, [[x - rw, ry - rh * 0.1], [x - rw * 1.08, ry - rh * 0.55], [x - rw * 0.55, ry - rh * 0.6], [x, ry - rh * 1.25],
              [x + rw * 0.55, ry - rh * 0.6], [x + rw * 1.08, ry - rh * 0.55], [x + rw, ry - rh * 0.1]], col(el.roof), P * 0.8, 0.4, 1)
          }
          inkSoftDot(ctx, x, hy - 4 * s, 10 * s, col(el.roof), 0.16)
        }
        break
      }
    }
  }

  // Animated ambience, drawn every frame between the mist and the figure. Deterministic per index (no allocation per dot).
  _ambience(ctx, C, t) {
    const PAL = this.art.palette, B = this.art.background, calm = this.reducedMotion
    const vx0 = -C.ox / C.S, vx1 = (C.cw - C.ox) / C.S, W = vx1 - vx0
    const col = k => PAL[k] || k
    for (const a of B.ambience) {
      switch (a.kind) {
        case 'stars': {                                  // twinkling stars above the far ridge
          const path = [new Path2D(), new Path2D()]
          for (let i = 0; i < a.n; i++) {
            const x = vx0 + inkRnd(i * 3.3) * W, y = -30 + inkRnd(i * 7.9) * (a.y1 + 30)
            if (B.ridges !== false && y > this._ridge(B.ridgeFar, x) - 4) continue
            if (a.y0 != null && y < a.y0) continue
            if (a.avoid && Math.hypot(x - a.avoid[0], y - a.avoid[1]) < a.avoid[2] + 3) continue
            if (a.clear && x > a.clear[0] && x < a.clear[2] && y > a.clear[1] && y < a.clear[3]) continue   // keep off a silhouette (e.g. the compound)
            if (a.fade && inkRnd(i * 2.7) > Math.max(0, Math.min(1, (a.y1 - y) / a.fade))) continue         // thin out toward the horizon line
            const tw = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * (0.8 + inkRnd(i) * 1.6) + i)
            const rr = 0.3 + 0.35 * inkRnd(i * 1.7) * tw
            path[tw > 0.6 ? 1 : 0].moveTo(x + rr, y); path[tw > 0.6 ? 1 : 0].arc(x, y, rr, 0, Math.PI * 2)
          }
          ctx.fillStyle = inkRgba(col(a.color), 0.4); ctx.fill(path[0])
          ctx.fillStyle = inkRgba(col(a.color), 0.85); ctx.fill(path[1])
          break
        }
        case 'grass': {                                  // a meadow in the wind: blades of dots, the gust travels across; flowers on some tips
          const paths = [new Path2D(), new Path2D(), new Path2D()], flowers = (a.flowers || []).map(() => new Path2D())
          for (let i = 0; i < a.n; i++) {
            const depth = inkRnd(i * 3.7) ** 0.6, x = vx0 + inkRnd(i * 5.9) * W
            const base = Math.max(a.y0 + depth * (a.y1 - a.y0), B.ridges !== false ? this._ridge(B.ridgeNear, x) + 3 : 0)
            const h = (2.5 + 5 * inkRnd(i * 8.3)) * (0.5 + 0.7 * depth), m = Math.max(2, Math.round(h / 1.1))
            const gust = calm ? 0.3 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 - x * 0.021)) ** 2   // a wave of wind rolling across (~3 s)
            const sway = (Math.sin(t * 2.2 + i * 0.7 + x * 0.05) * 0.5 + 0.9) * gust * (a.wind ?? 2.4) * (0.6 + 0.6 * depth)
            const lvl = depth > 0.75 ? 2 : depth > 0.4 ? 1 : 0, rr = 0.3 + 0.16 * depth
            for (let k = 0; k <= m; k++) {
              const f = k / m, xx = x + sway * f * f, yy = base - k * 1.1
              paths[lvl].moveTo(xx + rr, yy); paths[lvl].arc(xx, yy, rr, 0, Math.PI * 2)
            }
            if (flowers.length && inkRnd(i * 11.3) < (a.flowerRate ?? 0.08)) {
              const fi = Math.floor(inkRnd(i * 13.1) * flowers.length), xx = x + sway, yy = base - m * 1.1 - 0.4
              flowers[fi].moveTo(xx + 0.7, yy); flowers[fi].arc(xx, yy, 0.7, 0, Math.PI * 2)
            }
          }
          ;[0.4, 0.62, 0.85].forEach((al, i) => { ctx.fillStyle = inkRgba(inkMix(col(a.color), col(a.hi || a.color), i / 2), al); ctx.fill(paths[i]) })
          ;(a.flowers || []).forEach((c, i) => { ctx.fillStyle = inkRgba(col(c), 0.9); ctx.fill(flowers[i]) })
          break
        }
        case 'fireflies': {                              // slow wandering sparks that pulse
          const [bx0, by0, bx1, by1] = a.box
          for (let i = 0; i < a.n; i++) {
            const x = bx0 + (bx1 - bx0) * (inkRnd(i * 5.1) + 0.06 * Math.sin(t * 0.21 + i * 2.3)) , y = by0 + (by1 - by0) * (inkRnd(i * 9.7) + 0.08 * Math.sin(t * 0.33 + i))
            const pl = calm ? 0.6 : Math.max(0, Math.sin(t * (0.9 + inkRnd(i * 2) * 0.8) + i * 1.9))
            if (pl < 0.05) continue
            inkSoftDot(ctx, x, y, 3.2, col(a.color), 0.28 * pl)
            inkSoftDot(ctx, x, y, 0.6, inkMix(col(a.color), '#FFFFFF', 0.4), 0.9 * pl)
          }
          break
        }
        case 'falls': {                                  // water streaming down + spray at the foot
          const path = new Path2D()
          for (let i = 0; i < a.n; i++) {
            const ph = ((t * a.speed + inkRnd(i * 3.1)) % 1 + 1) % 1
            const f = ph * ph, x = a.x + (inkRnd(i * 7.7) - 0.5) * a.w * (0.7 + 0.9 * f), y = a.y0 + f * (a.y1 - a.y0)
            path.moveTo(x + 0.5, y); path.arc(x, y, 0.5, 0, Math.PI * 2)
          }
          ctx.fillStyle = inkRgba(col(a.color), 0.75); ctx.fill(path)
          for (let i = 0; i < 6; i++) {
            const ph = ((t * 0.6 + i / 6) % 1 + 1) % 1
            inkSoftDot(ctx, a.x + (inkRnd(i) - 0.5) * a.w * 3, a.y1 - ph * 8, 2 + ph * 3, col(a.color), 0.16 * (1 - ph))
          }
          break
        }
        case 'lanterns': {                               // sky lanterns drifting up from the water
          for (let i = 0; i < a.n; i++) {
            const ph = ((t * a.speed + inkRnd(i * 4.3)) % 1 + 1) % 1
            const x = a.x0 + (a.x1 - a.x0) * inkRnd(i * 6.1) + 4 * Math.sin(t * 0.4 + i), y = a.y0 - ph * (a.y0 - a.y1)
            const fade = Math.min(1, ph * 5, (1 - ph) * 3), s = 0.7 + 0.5 * inkRnd(i * 2.9)
            inkSoftDot(ctx, x, y, 5 * s, col(a.color), 0.2 * fade)
            ctx.fillStyle = inkRgba(inkMix(col(a.color), '#FFFFFF', 0.25), 0.85 * fade)
            for (const [dx, dy] of [[0, -0.9], [-0.8, 0], [0.8, 0], [0, 0.9]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, 0.55 * s, 0, Math.PI * 2); ctx.fill() }
          }
          break
        }
        case 'petals': {                                 // petals (or embers) falling on the wind
          const H = 190
          for (let i = 0; i < a.n; i++) {
            const x = vx0 + ((inkRnd(i * 2.1) * W + t * a.wind * (0.7 + inkRnd(i) * 0.6)) % W + W) % W
            const y = ((inkRnd(i * 5.3) * H + t * a.fall * (0.7 + inkRnd(i * 3) * 0.6)) % H + H) % H - 30
            const fl = Math.sin(t * 2.2 + i * 1.3)                                        // flutter: the petal turns
            ctx.fillStyle = inkRgba(col(a.color), 0.7)
            ctx.beginPath(); ctx.arc(x, y, 0.65, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(x + 1.1 * fl, y + 0.5, 0.5, 0, Math.PI * 2); ctx.fill()
          }
          break
        }
        case 'lightning': {                              // a distant storm: a dotted bolt behind the far peaks, the sky flickers
          if (calm) break
          const k = Math.floor(t / a.every), ph = t - k * a.every
          if (ph > 0.45) break
          const fl = ph < 0.08 ? 1 : ph < 0.16 ? 0.25 : ph < 0.26 ? 0.8 : Math.max(0, 1 - (ph - 0.26) / 0.19)
          const bx = vx0 + W * (0.1 + 0.8 * inkRnd(k * 3.7))
          if (Math.abs(bx - 150) < 50) break                                                  // never across the figure
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
          const g = ctx.createRadialGradient(C.ox + bx * C.S, C.oy + 30 * C.S, 0, C.ox + bx * C.S, C.oy + 30 * C.S, 110 * C.S)
          g.addColorStop(0, inkRgba(col(a.color), 0.16 * fl)); g.addColorStop(1, inkRgba(col(a.color), 0))
          ctx.fillStyle = g; ctx.fillRect(0, 0, C.cw, C.ch); ctx.restore()
          const path = new Path2D(), end = this._ridge(B.ridgeFar, bx)
          let x = bx
          for (let y = -30; y < end; y += 1.6) {
            x += (inkRnd(k * 31 + y) - 0.5) * 2.2
            path.moveTo(x + 0.5, y); path.arc(x, y, 0.5, 0, Math.PI * 2)
          }
          ctx.fillStyle = inkRgba(col(a.color), 0.8 * fl); ctx.fill(path)
          break
        }
        case 'bigFalls': {                               // the waterfall: bright clumps racing down, spray bursting at the foot, pool rings
          const G = this._fallsGeo(a), H = G.bot - G.top, A0 = a.alpha ?? 1
          const head = new Path2D(), mid = new Path2D(), tail = new Path2D()
          for (let i = 0; i < a.n; i++) {
            const sp = 0.75 + 0.5 * inkRnd(i * 1.3), ph = ((t * a.speed * sp + inkRnd(i * 3.1)) % 1 + 1) % 1
            const u = inkRnd(i * 7.7), y = G.top + ph ** 1.6 * (H + 4), len = 4 + 7 * inkRnd(i * 2.2)
            for (let k = 0; k < 6; k++) {
              const yy = y - k * len / 5
              if (yy < G.lipY(G.at(u, yy)) + 1) break
              const x = G.at(u, yy), rr = k === 0 ? 0.6 : 0.45, pth = k === 0 ? head : k < 3 ? mid : tail
              pth.moveTo(x + rr, yy); pth.arc(x, yy, rr, 0, Math.PI * 2)
            }
          }
          ctx.fillStyle = inkRgba(col(a.color), 0.3 * A0); ctx.fill(tail)
          ctx.fillStyle = inkRgba(col(a.color), 0.6 * A0); ctx.fill(mid)
          ctx.fillStyle = inkRgba(inkMix(col(a.color), '#FFFFFF', 0.5), 0.95 * A0); ctx.fill(head)
          if (a.spray !== false) {                                                 // spray bursting up and out at the foot
            const spray = new Path2D(), wl = G.L(G.bot), wr = G.R(G.bot)
            for (let i = 0; i < 44; i++) {
              const p = ((t * 0.9 * (0.7 + 0.6 * inkRnd(i)) + inkRnd(i * 4.4)) % 1 + 1) % 1
              const bx = wl + (wr - wl) * inkRnd(i * 6.6), x = bx + (inkRnd(i * 2.2) - 0.5) * 36 * p, y = G.bot + 2 - Math.sin(p * Math.PI) * (5 + 11 * inkRnd(i * 8.1))
              const rr = 0.55 * (1 - p) + 0.2
              spray.moveTo(x + rr, y); spray.arc(x, y, rr, 0, Math.PI * 2)
            }
            ctx.fillStyle = inkRgba(col(a.color), 0.95 * A0); ctx.fill(spray)
            for (let i = 0; i < 10; i++) {
              const ph = ((t * 0.3 + i / 10) % 1 + 1) % 1
              inkSoftDot(ctx, wl + (wr - wl) * inkRnd(i * 2.3) + (inkRnd(i) - 0.5) * 24 * ph, G.bot - ph * 16, 5 + ph * 8, col(a.color), 0.12 * (1 - ph) * A0)
            }
          }
          if (a.pool && !calm) {                                                   // rings spreading across the pool
            for (let i = 0; i < 3; i++) {
              const q = t * 0.32 + i / 3, p = q - Math.floor(q), cx = a.x + (inkRnd(Math.floor(q) * 3 + i) - 0.5) * 40
              const rx = 10 + p * 70, ry = rx * 0.14, ring = new Path2D()
              for (let ang = 0; ang < Math.PI * 2; ang += 2 / rx) {
                const x = cx + Math.cos(ang) * rx, y = G.bot + 7 + Math.sin(ang) * ry
                if (y < G.bot + 2) continue
                ring.moveTo(x + 0.55, y); ring.arc(x, y, 0.55, 0, Math.PI * 2)
              }
              ctx.fillStyle = inkRgba(col(a.color), 0.85 * (1 - p)); ctx.fill(ring)
            }
          }
          break
        }
        case 'birds': {                                  // birds / cranes in small V flocks crossing the sky, wings beating
          const groups = Math.ceil(a.n / 3), span = W + 60
          ctx.fillStyle = inkRgba(col(a.color), a.alpha ?? 0.85)
          for (let g = 0; g < groups; g++) {
            const sp = a.speed * (0.8 + 0.4 * inkRnd(g * 3.7))
            const bx = vx0 - 30 + (((inkRnd(g * 5.3) * span + t * sp) % span) + span) % span, by = a.y0 + (a.y1 - a.y0) * inkRnd(g * 2.9) + Math.sin(t * 0.4 + g) * 2
            for (let j = 0; j < 3 && g * 3 + j < a.n; j++) {
              const s = (a.size ?? 1) * (0.85 + 0.3 * inkRnd(g * 3 + j)), x = bx - j * 5 * s, y = by + j * 3 * s          // a small V: the leader in front
              const flap = calm ? 0.3 : Math.sin(t * 7 + g * 2 + j * 0.9)
              ctx.beginPath(); ctx.arc(x, y, 0.55 * s, 0, Math.PI * 2); ctx.fill()
              for (let k = 1; k <= 3; k++) for (const sd of [-1, 1]) {
                ctx.beginPath(); ctx.arc(x + sd * k * 1.05 * s, y - flap * k * 0.55 * s + k * 0.12 * s, 0.42 * s, 0, Math.PI * 2); ctx.fill()
              }
            }
          }
          break
        }
        case 'cloudBank': {                              // a band of cloud drifting across (pre-rendered, 600 wide, tiles)
          const key = 'cb' + a.y + a.seed
          C.amb = C.amb || {}
          if (!C.amb[key]) {
            const cv = document.createElement('canvas'), H = a.h + 6
            cv.width = Math.round(600 * C.S); cv.height = Math.round(H * C.S)
            const g = cv.getContext('2d'); g.setTransform(C.S, 0, 0, C.S, 0, 0)
            const P2 = this.art.dot.pitch * 0.9, RY2 = P2 * 0.866, k = Math.PI * 2 / 600, hi = new Path2D(), lo = new Path2D()
            for (let r = 0; r * RY2 < H; r++) {
              const y = r * RY2
              for (let x = (r & 1 ? P2 / 2 : 0); x < 600; x += P2) {
                const gap = Math.sin(x * k * 2 + a.seed) + 0.6 * Math.sin(x * k * 5 + a.seed * 3)
                if (gap < (a.gap ?? -0.2)) continue                                     // clear sky between banks (higher gap = separate wisps)
                const top = a.h * (0.55 - 0.3 * Math.abs(Math.sin(x * k * 9 + a.seed)) - 0.2 * Math.abs(Math.sin(x * k * 17 + a.seed * 2)) - 0.15 * Math.min(1, gap))
                const d = y - top
                if (d < 0 || inkRnd2(x + a.seed * 50, y) < d / a.h * 1.1) continue
                const p = d < 2.2 ? hi : lo, rr = P2 * (d < 2.2 ? 0.36 : 0.3)
                p.moveTo(x + rr, y); p.arc(x, y, rr, 0, Math.PI * 2)
              }
            }
            g.fillStyle = inkRgba(col(a.color), 0.55); g.fill(lo)
            g.fillStyle = inkRgba(col(a.hi || a.color), 0.9); g.fill(hi)
            C.amb[key] = cv
          }
          const drift = ((t * a.speed) % 600 + 600) % 600
          ctx.globalAlpha = a.alpha ?? 1
          for (let x = Math.floor((vx0 + drift) / 600) * 600 - drift; x < vx1; x += 600) ctx.drawImage(C.amb[key], x, a.y, 600, a.h + 6)
          ctx.globalAlpha = 1
          break
        }
        case 'earth': {                                  // the planet below, turning: land, sea and cloud dots on a sphere
          C.amb = C.amb || {}
          let E = C.amb.earth
          if (!E) {                                                               // the dot grid + a wrap-around land/cloud table, once per cache
            const P2 = this.art.dot.pitch * 1.2, RY2 = P2 * 0.866, pts = [], TW = 512, TH = 128
            for (let r = Math.floor((a.cy - a.r) / RY2); r * RY2 < (C.ch - C.oy) / C.S + 2; r++) {
              const y = r * RY2
              for (let x = Math.floor(vx0 / P2) * P2 + (r & 1 ? P2 / 2 : 0); x < vx1; x += P2) {
                const dx = (x - a.cx) / a.r, dy = (y - a.cy) / a.r, q = 1 - dx * dx - dy * dy
                if (q <= 0) continue
                const z = Math.sqrt(q), k = a.tilt ?? 1.2                            // tilt: the visible band is low latitudes, not the pole
                const dy2 = dy * Math.cos(k) + z * Math.sin(k), z2 = -dy * Math.sin(k) + z * Math.cos(k)
                pts.push(x, y, z, Math.atan2(dx, z2), Math.asin(Math.max(-1, Math.min(1, dy2))))
              }
            }
            const vnoise = (u, v, s, seed) => {                                   // smooth value noise that wraps in u
              const cu = u * s, cv = v * s, iu = Math.floor(cu), iv = Math.floor(cv), fu = cu - iu, fv = cv - iv
              const h = (i, j) => inkRnd(((i % s) + s) % s * 131 + j * 17 + seed)
              const sm = f => f * f * (3 - 2 * f)
              const a0 = h(iu, iv) + (h(iu + 1, iv) - h(iu, iv)) * sm(fu), a1 = h(iu, iv + 1) + (h(iu + 1, iv + 1) - h(iu, iv + 1)) * sm(fu)
              return a0 + (a1 - a0) * sm(fv)
            }
            // smooth land / cloud fields (thresholded per dot); built once per app, they do not depend on the canvas size
            const { land, cloud } = InkRenderer._earthTbl || (InkRenderer._earthTbl = (() => {
              const land = new Float32Array(TW * TH), cloud = new Float32Array(TW * TH)
              for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
                const u = i / TW, v = j / TH
                land[j * TW + i] = 0.55 * vnoise(u, v, 8, 1) + 0.3 * vnoise(u, v, 24, 7) + 0.15 * vnoise(u, v, 64, 5)
                cloud[j * TW + i] = 0.5 * vnoise(u, v, 14, 3) + 0.3 * vnoise(u, v, 40, 9) + 0.2 * vnoise(u, v, 96, 2)
              }
              return { land, cloud }
            })())
            E = C.amb.earth = { pts, land, cloud, TW, TH, P2, frame: null, at: -1 }
          }
          // redraw the sphere into its own canvas ~10×/s (it turns slowly), then blit every frame
          if (!E.frame) { E.frame = document.createElement('canvas'); E.frame.width = C.cw; E.frame.height = C.ch }
          if (Math.abs(t - E.at) > 0.1 || calm && E.at < 0) {
            E.at = t
            const g = E.frame.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, C.cw, C.ch); g.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
            const rot = t * a.rot, paths = [[], [], []].map(() => [new Path2D(), new Path2D(), new Path2D()])   // [sea|land|cloud][shade]
            const { pts, land, cloud, TW, TH, P2 } = E
            for (let k = 0; k < pts.length; k += 5) {
              const x = pts[k], y = pts[k + 1], z = pts[k + 2], lon = pts[k + 3], lat = pts[k + 4]
              const fj = (lat / Math.PI + 0.5) * (TH - 1)
              const smp = (F, lo) => {                                          // bilinear: smooth coastlines on the fixed dot grid
                const fi = ((lo / (Math.PI * 2)) * TW % TW + TW) % TW, i0 = Math.floor(fi), j0 = Math.min(TH - 2, Math.floor(fj)), u = fi - i0, v = fj - j0, i1 = (i0 + 1) % TW
                return (F[j0 * TW + i0] * (1 - u) + F[j0 * TW + i1] * u) * (1 - v) + (F[(j0 + 1) * TW + i0] * (1 - u) + F[(j0 + 1) * TW + i1] * u) * v
              }
              const kind = smp(cloud, lon + rot * 1.35) > 0.6 ? 2 : smp(land, lon + rot) > 0.52 ? 1 : 0
              const sh = z > 0.55 ? 2 : z > 0.25 ? 1 : 0, rr = P2 * (kind ? 0.42 : 0.36) * (0.7 + 0.3 * z)
              paths[kind][sh].moveTo(x + rr, y); paths[kind][sh].arc(x, y, rr, 0, Math.PI * 2)
            }
            ;[a.sea, a.land, a.cloud].forEach((c, kind) => [0.5, 0.75, 0.95].forEach((al, sh) => { g.fillStyle = inkRgba(col(c), al); g.fill(paths[kind][sh]) }))
          }
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(E.frame, 0, 0); ctx.restore()
          break
        }
        case 'bigStars': {                               // big sparkling stars: a bright core and four dotted spikes that flare
          const cols = a.colors || [a.color]
          for (let i = 0; i < a.n; i++) {
            const x = vx0 + inkRnd(i * 4.1 + 7) * W, y = -36 + inkRnd(i * 6.7 + 3) * (a.y1 + 36)
            if (a.clear && x > a.clear[0] && x < a.clear[2] && y > a.clear[1] && y < a.clear[3]) continue   // keep off the figure
            const s = a.size * (0.6 + 0.8 * inkRnd(i * 9.1)), c = col(cols[i % cols.length])
            const pl = calm ? 0.6 : 0.35 + 0.65 * Math.max(0, Math.sin(t * (0.6 + inkRnd(i) * 1.1) + i * 2.3)) ** 2
            inkSoftDot(ctx, x, y, s * 3.2, c, 0.18 * pl)
            const path = new Path2D(), L = s * (2.2 + 3.2 * pl)
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              for (let d = 0.9; d < L; d += 0.9) { const rr = 0.42 * (1 - d / L) + 0.1; path.moveTo(x + dx * d + rr, y + dy * d); path.arc(x + dx * d, y + dy * d, rr, 0, Math.PI * 2) }
            }
            ctx.fillStyle = inkRgba(inkMix(c, '#FFFFFF', 0.4), 0.85 * pl); ctx.fill(path)
            inkSoftDot(ctx, x, y, 0.9 * s, inkMix(c, '#FFFFFF', 0.6), 0.95)
          }
          break
        }
        case 'shooting': {                               // now and then a shooting star streaks across
          if (calm) break
          const k = Math.floor(t / a.every), ph = (t - k * a.every) / 1.1
          if (ph > 1) break
          const sx = vx0 + W * (0.15 + 0.7 * inkRnd(k * 2.7)), sy = -20 + 50 * inkRnd(k * 5.1), dir = inkRnd(k) < 0.5 ? -1 : 1
          const hx = sx + dir * ph * 110, hy = sy + ph * 45, path = new Path2D()
          for (let i = 0; i < 16; i++) {
            const f = i / 16, x = hx - dir * f * 30, y = hy - f * 12.3, rr = 0.6 * (1 - f) + 0.12
            path.moveTo(x + rr, y); path.arc(x, y, rr, 0, Math.PI * 2)
          }
          ctx.fillStyle = inkRgba(col(a.color), 0.9 * Math.sin(ph * Math.PI)); ctx.fill(path)
          break
        }
        case 'shimmer': {                                // glints dancing on the moon's path over the water
          if (!B.moon) break
          for (let i = 0; i < a.n; i++) {
            const y = a.y0 + (a.y1 - a.y0) * inkRnd(i * 3.9), spread = a.w * (0.4 + (y - a.y0) / 40)
            const x = B.moon.x + (inkRnd(i * 8.3) - 0.5) * 2 * spread
            const pl = calm ? 0.5 : Math.max(0, Math.sin(t * (1.5 + inkRnd(i) * 2) + i * 2.1))
            if (pl < 0.3) continue
            ctx.fillStyle = inkRgba(col(a.color), 0.9 * pl)
            ctx.beginPath(); ctx.ellipse(x, y, 1.4, 0.4, 0, 0, Math.PI * 2); ctx.fill()
          }
          break
        }
      }
    }
  }

  // The death moment (A4-3). The foreground (figure + every Qi effect) was drawn on C.dth this frame; each sampled dot
  // of the figure lifts away as a mote when its turn comes, leaving a hole behind (the dissolve front), and the rest
  // fades. 'fall' = ash drifting off on the wind while the scene dims; 'ascend' = gold light rising, feet first.
  _deathCompose(ctx, C, fy) {
    const d = this.death, asc = this.deathKind === 'ascend', calm = this.reducedMotion, P = this.art.palette
    const D = this._deathDots(C), fx = C.dth.getContext('2d')
    const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
    if (!calm && D.dots.length) {                                       // holes where the motes have already left
      fx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy + fy * C.S)
      fx.globalCompositeOperation = 'destination-out'
      const hole = new Path2D()
      for (const p of D.dots) if (d > p.delay) { hole.moveTo(p.x + D.r, p.y); hole.arc(p.x, p.y, D.r, 0, Math.PI * 2) }
      fx.fill(hole)
      fx.globalCompositeOperation = 'source-over'
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = calm ? 1 - d : 1 - smooth(asc ? 0.45 : 0.6, 0.95, d)
    ctx.drawImage(C.dth, 0, 0)
    ctx.globalAlpha = 1
    if (!calm) {
      ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy + fy * C.S)
      const ash = '#8E8A96'
      for (const p of D.dots) {
        const lp = (d - p.delay) / 0.5
        if (lp <= 0 || lp >= 1) continue
        const e = lp * lp
        const x = p.x + (asc ? Math.sin(lp * 5 + p.ph) * 3 * lp : e * p.drift + Math.sin(lp * 6 + p.ph) * 2 * lp)
        const y = asc ? p.y - e * p.rise * 1.8 : p.y - Math.sin(lp * Math.PI) * p.rise * 0.45 + e * 16   // ash lifts, then sinks away
        const c = asc ? inkMix(p.c, P.gold, Math.min(1, lp * 2.2)) : inkMix(p.c, ash, Math.min(1, lp * 3))
        ctx.fillStyle = inkRgba(c, (1 - lp) * 0.95)
        ctx.beginPath(); ctx.arc(x, y, D.r * (asc ? 0.9 : 0.75) * (1 - 0.5 * lp), 0, Math.PI * 2); ctx.fill()
      }
    }
    if (asc) {                                                          // a column of light takes the last of them up
      const g = smooth(0, 0.35, d) * (1 - smooth(0.8, 1, d) * 0.6)
      ctx.save(); ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy); ctx.translate(150, 40); ctx.scale(0.3, 1.4)
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 100)
      gr.addColorStop(0, inkRgba(P.gold, 0.3 * g)); gr.addColorStop(1, inkRgba(P.gold, 0))
      ctx.fillStyle = gr; ctx.fillRect(-100, -100, 200, 200); ctx.restore()
    } else {                                                            // the world goes quiet
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = inkRgba('#05030A', 0.3 * smooth(0.2, 1, d)); ctx.fillRect(0, 0, C.cw, C.ch)
    }
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
  }

  // Sample the figure's dots once per cache: a coarse grid over the figure layers, keeping each opaque cell's colour.
  _deathDots(C) {
    if (C.deathDots && C.deathDots.kind === this.deathKind) return C.deathDots
    const step = C.lod ? 3 : 2.1, A = this.art, box = A.figureBox, dots = []
    const imgs = this._layerOrder().map(L => C.layers[L].getContext('2d').getImageData(0, 0, C.cw, C.ch).data).reverse()   // front first
    let top = Infinity, bot = -Infinity
    for (let y = box[1]; y <= box[3]; y += step) {
      for (let x = box[0]; x <= box[2]; x += step) {
        const px = Math.round(C.ox + x * C.S), py = Math.round(C.oy + y * C.S)
        if (px < 0 || py < 0 || px >= C.cw || py >= C.ch) continue
        const o = (py * C.cw + px) * 4
        const im = imgs.find(a => a[o + 3] > 70)
        if (!im) continue
        const hex = '#' + [im[o], im[o + 1], im[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
        dots.push({ x, y, c: hex, ph: inkRnd(x * 3 + y) * 6 })
        top = Math.min(top, y); bot = Math.max(bot, y)
      }
    }
    const asc = this.deathKind === 'ascend'
    for (const p of dots) {
      const yN = (p.y - top) / Math.max(1, bot - top), n = inkRnd(p.x * 7.1 + p.y * 3.3)
      p.delay = asc ? 0.03 + 0.18 * n + 0.28 * (1 - yN) : 0.03 + 0.28 * n + 0.18 * yN      // ash: the head goes first; light: the feet
      p.rise = asc ? 40 + 50 * inkRnd(p.x + p.y * 9) : 12 + 26 * inkRnd(p.x + p.y * 9)
      p.drift = 18 + 40 * inkRnd(p.x * 5 + p.y)
    }
    C.deathDots = { dots, r: step * 0.72, kind: this.deathKind }
    return C.deathDots
  }

  // Two soft mist bands, 600 logical px wide (drawn twice for a seamless drift). A background may have no mist
  // (`mistY` absent) — e.g. the mountaintop sect scene — in which case there is simply nothing to paint.
  _paintMist(ctx, S) {
    const B = this.art.background, col = this.art.palette.mist
    ctx.setTransform(S, 0, 0, S, 0, 0)
    ctx.filter = `blur(${(4 * S).toFixed(1)}px)`
    for (const [yi, my] of (B.mistY || []).entries()) {
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
// Variant recolour (raster `hue`: degrees, `tint`: '#rrggbb', `tintAmt`: 0..1): hue rotation in YIQ space (keeps
// brightness, so whites stay white and the shading survives), then a mix toward the tint, stronger on bright dots.
function inkRecolor(rgb, R) {
  let [r, g, b] = rgb
  if (R.hue) {
    const a = R.hue * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a)
    const y = 0.299 * r + 0.587 * g + 0.114 * b, i = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b
    const i2 = i * c - q * sn, q2 = i * sn + q * c
    r = y + 0.956 * i2 + 0.621 * q2; g = y - 0.272 * i2 - 0.647 * q2; b = y - 1.106 * i2 + 1.703 * q2
  }
  if (R.tint) {
    const [tr, tg, tb] = inkHexRgb(R.tint), L = (0.3 * r + 0.59 * g + 0.11 * b) / 255, k = (R.tintAmt ?? 0.4) * (0.4 + 0.6 * L)
    r += (tr * (0.5 + L) - r) * k; g += (tg * (0.5 + L) - g) * k; b += (tb * (0.5 + L) - b) * k
  }
  return [r, g, b].map(v => Math.max(0, Math.min(255, v)))
}

// 2-D noise for scenery textures (a linear seed like x*5+y*3 bands diagonally)
function inkRnd2(x, y) { return inkRnd(Math.floor(x * 8.37) * 0.618 + inkRnd(Math.floor(y * 8.37) * 1.31) * 9187.3) }
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

// Symmetric art (front-facing beasts): an entry with `mirror: true` is followed by its reflection across x = cx
// (id + '_m', on `mirrorLayer` if given: the right wing beats on its own layer). Reflects `d`, `pts` and `dissolve`.
function inkMirrorAll(list, cx) {
  const out = []
  for (const e of list) {
    out.push(e)
    if (!e.mirror) continue
    const m = { ...e, mirror: false, id: e.id && e.id + '_m', layer: e.mirrorLayer || e.layer }
    if (e.d) m.d = inkMirrorD(e.d, cx)
    if (e.pts) m.pts = e.pts.map(([x, y]) => [2 * cx - x, y])
    if (e.dissolve) m.dissolve = [2 * cx - e.dissolve[0], e.dissolve[1], 2 * cx - e.dissolve[2], e.dissolve[3]]
    if (e.after) m.after = e.after + '_m'
    out.push(m)
  }
  return out
}
function inkMirrorD(d, cx) {
  const out = [], n = { M: 2, L: 2, Q: 4, C: 6, E: 4, Z: 0 }
  for (let i = 0; i < d.length;) {
    const c = d[i++]; out.push(c)
    for (let k = 0; k < n[c]; k++) out.push(k % 2 === 0 && !(c === 'E' && k === 2) ? 2 * cx - d[i + k] : d[i + k])
    i += n[c]
  }
  return out
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
