// SceneRenderer — the scene layer of the hybrid ink engine (roadmap A7 / Phase 38A): a large, VIEW-ONLY diorama of
// the sect compound, drawn from SECT_SCENE (assets/scenes/sect-base-scene.js) and the live own-sect state.
// It SUBCLASSES InkRenderer (ink-renderer.js) to reuse the ink-dot rasteriser — `_dotPoly`, `_ridge`, `_dotLine`,
// the baked background/mist cache and `_paintBackground` — per the plan ("do not write a new rasteriser"). It sets
// `layerOrder: []` so the figure machinery is skipped, and overrides only `_drawTo` (background + mist + ambience +
// the build-growth burst) plus `_scenery`/`_ambience` for the scene's own structure kinds (unknown kinds fall through
// to the parent, so the realm kinds — pines, birds, cloudBank… — still work).
// Build/upgrade happens in the existing rows (Sect → Halls); this only reflects state (user rule 2026-09-27).
// See docs/systems/scene-art.md.

class SceneRenderer extends InkRenderer {
  // Live state → the scene descriptor { background, sig }. Pure and DOM-free (checks/scene.js runs it headless).
  static buildSectScene(s) {
    const o = (s && s.ownSect) || {}
    const built = o.buildings || {}
    const level = Math.max(1, o.hallLevel || 1)
    const fame = (s && s.derived && s.derived.sectFame) || 0
    const disciples = (o.disciples || []).length
    const damaged = !!(s && s.derived && s.derived.arrayDamaged)

    const scenery = [
      { kind: 'compoundGround', ground: SECT_SCENE.ground, front: SECT_SCENE.front, pathX: SECT_SCENE.pathX },
    ]
    for (const slot of SECT_SCENE.slots) {
      if (slot.id === 'hall') scenery.push({ ...slot, level, scale: 1.45 + (level - 1) * 0.16 })
      else if (slot.id === 'gate') scenery.push({ ...slot })
      else if (slot.id === 'defensive_array') { if (built.defensive_array) scenery.push({ ...slot, dim: damaged }) }
      else if (built[slot.id]) {                                   // Phase 43: a deepened hall stands larger
        const lv = built[slot.id] || 1
        scenery.push({ ...slot, level: lv, scale: (slot.scale || 1) * (1 + 0.12 * (lv - 1)) })
      }
    }
    scenery.push({ kind: 'lanterns', items: SECT_SCENE.dressing.lanterns })
    scenery.push({ kind: 'foreRocks', front: SECT_SCENE.front })   // a dark near layer framing the compound (depth)
    const banners = Math.min(6, Math.floor(fame / 40))                       // fame raises flags along the terrace

    const ambience = (SECT_SCENE.background.ambience || []).map(a => ({ ...a }))   // cloned: the star mask is state-dependent
    // The compound stands on a peak with NO hills behind it. The star band keeps a FIXED floor (raising the hall must
    // not thin the sky), and only the Sect Hall's spire — the sole structure taller than that floor (Lv.2+) — carves a
    // mask out of it, so no star is painted on a roof (ambience draws ON TOP of the baked compound). Spire apex by
    // level ≈ 97 / 87 / 65 / 40 logical.
    const spireTop = [97, 87, 65, 40][Math.min(3, level - 1)] - 8
    const spireHalf = 26 * (1.45 + (level - 1) * 0.16) + 30
    for (const a of ambience) if (a.kind === 'stars' || a.kind === 'bigStars') a.clear = [174 - spireHalf, spireTop, 174 + spireHalf, 236]
    if (built.pill_hall) ambience.push({ kind: 'smoke', x: 106, y0: 140, y1: 72, n: 16, color: 'mist' })
    if (built.defensive_array) ambience.push({ kind: 'wardPulse', x: 208, y: 176, r: 45, color: 'ward', dim: damaged })
    if (built.beast_pen) ambience.push({ kind: 'beastPace', x0: 30, x1: 62, y: 170, color: 'beast' })
    if (banners) ambience.push({ kind: 'banners', n: banners, color: 'banner', gold: 'bannerGold' })
    if (disciples) ambience.push({ kind: 'disciples', n: disciples, box: [110, 310, 159, 190] })
    ambience.push({ kind: 'spiritMotes', n: 10, box: [60, 360, 100, 192], color: 'gold' })

    const sig = [level, Object.keys(built).filter(k => built[k]).sort().map(k => `${k}:${built[k]}`).join(','), disciples, banners, damaged ? 1 : 0].join('|')
    return { background: { ...SECT_SCENE.background, scenery, ambience }, sig }
  }

  constructor(canvas, opts = {}) { super(canvas, opts); this.growStart = null; this.growX = 0; this.growY = 0 }

  // The scene is large and mostly baked, so render at ≥2× the CSS size: on a 1-DPR monitor a 1× backing store would
  // make the ink dots sub-pixel (grey mush). Down-scaled by the browser, this keeps the dots fine and crisp.
  _dpr() { return Math.min(3, Math.max(2, super._dpr())) }

  // Swap the scene. `this.art` is the same shape _buildCache/_paintBackground expects, with no figure parts.
  setScene(desc) {
    this.base = this.art = {
      scene: SECT_SCENE.box.slice(2), view: SECT_SCENE.box.slice(), figureBox: SECT_SCENE.box.slice(),
      dot: SECT_SCENE.dot, light: SECT_SCENE.light, palette: SECT_SCENE.palette, background: desc.background,
      parts: [], strokes: [], dotFeatures: [], glyphs: [], frames: {}, layerOrder: [],
    }
    this.cache = null
    if (!this.running) this._start()
  }

  // A short burst where a structure just rose (world coordinates).
  triggerGrow(x, y) { this.growStart = this.t; this.growX = x; this.growY = y; if (!this.running) this._start() }

  // ── Frame: background (baked) → drifting mist → animated ambience → the build-growth burst ──
  _drawTo(ctx, C) {
    const A = this.art, B = A.background, t = this.t
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1
    ctx.drawImage(C.bg, 0, 0)
    ctx.setTransform(C.S, 0, 0, C.S, C.ox, C.oy)
    if (!C.lod) {
      if (C.mist && (B.mistA ?? 1) > 0) {
        const drift = (t * 3) % 600, vx0 = -C.ox / C.S, vx1 = (C.cw - C.ox) / C.S
        ctx.globalAlpha = Math.min(1, 0.9 * (B.mistA ?? 1))
        for (let x = Math.floor((vx0 + drift) / 600) * 600 - drift; x < vx1; x += 600) ctx.drawImage(C.mist, x, 0, 600, 150)
        ctx.globalAlpha = 1
      }
      if (B.ambience) this._ambience(ctx, C, t)
      if (this.growStart != null) {
        const g = t - this.growStart
        if (g >= 0 && g < 2.4) this._growFx(ctx, C, g); else this.growStart = null
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1
  }

  _growFx(ctx, C, g) {
    const x = this.growX, y = this.growY, gold = this.art.palette.gold, fade = 1 - g / 2.4
    inkSoftDot(ctx, x, y - 12, 24 * (0.7 + g), gold, 0.10 * fade)
    const r = 6 + g * 20, ring = new Path2D()
    for (let a = 0; a < Math.PI * 2; a += 2 / r) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.32; ring.moveTo(px + 0.5, py); ring.arc(px, py, 0.5, 0, Math.PI * 2) }
    ctx.fillStyle = inkRgba(gold, 0.7 * fade); ctx.fill(ring)
    for (let i = 0; i < 22; i++) {
      const ph = (g / 1.6 + inkRnd(i * 3.1)) % 1, mx = x + (inkRnd(i * 5.7) - 0.5) * 54, my = y - ph * (10 + 40 * inkRnd(i * 2.3))
      inkSoftDot(ctx, mx, my, 1.6 * (1 - ph), gold, 0.8 * (1 - ph) * fade)
    }
  }

  // ── Structure kinds (baked into C.bg by _paintBackground) ────────────────────────────────────────────────
  _scenery(ctx, C, el, x0, x1, y1) {
    const PAL = this.art.palette, P = this.art.dot.pitch * 0.85, RY = P * 0.866
    const col = k => PAL[k] || k
    const S = el.scale || 1
    switch (el.kind) {
      case 'compoundGround': {
        const gy = el.ground, fy = el.front
        // The summit edge: the sky is empty behind it, so a faint lit lip defines the plateau against the black night.
        this._dotLine(ctx, [[x0, gy], [x1, gy]], col('stoneHi'), 0.32, 1.0)
        // the terrace: flagstones with bare seam rows, and a paved path curving up to the hall
        const stone = new Path2D(), path = new Path2D()
        for (let r = Math.ceil(gy / RY); r * RY <= fy; r++) {
          const y = r * RY, seam = (r % 2 === 0)
          for (let x = Math.floor(x0 / P) * P + (r & 1 ? P / 2 : 0); x < x1; x += P) {
            const n = inkRnd2(x, y)
            if (seam && n < 0.3) continue
            if (n < 0.14) continue
            const onPath = Math.abs(x - el.pathX) < 22 + (fy - y) * 0.6
            const rr = P * (onPath ? 0.34 : 0.3), p = onPath ? path : stone
            p.moveTo(x + rr, y); p.arc(x, y, rr, 0, Math.PI * 2)
          }
        }
        ctx.fillStyle = inkRgba(col('stone'), 0.74); ctx.fill(stone)
        ctx.fillStyle = inkRgba(col('path'), 0.78); ctx.fill(path)
        for (const [gx, gr] of [[el.pathX, 48], [el.pathX - 96, 30], [el.pathX + 96, 30]]) inkSoftDot(ctx, gx, fy - 16, gr, col('lamp'), 0.15)   // lantern pools warm the stone, so the terrace carries the compound's light
        this._dotLine(ctx, [[x0, fy], [x1, fy]], col('stoneHi'), 0.6, 1.2)           // the front lip
        this._dotLine(ctx, [[x0, fy - 1.4], [x1, fy - 1.4]], col('bannerGold'), 0.24, 1.0)   // …catching the compound's warm light
        // the rock face falling away below the lip — kept a step above the black sky, so the summit reads as rock, not void
        this._dotPoly(ctx, [[x0, fy], [x1, fy], [x1, y1 + 24], [x0, y1 + 24]], col('stoneDeep'), P, 0.34, 0.95, (px, py) => {
          const d = py - fy, n = inkRnd2(px, py)
          if (d < 1.5) return 0
          if (n < Math.min(0.8, 0.05 + d / 30)) return 0
          return 0.4 + 0.5 * n + (d < 14 ? 0.24 : 0)     // the face catches the terrace light just below the lip
        })
        this._dotLine(ctx, [[x0, fy + 2.6], [x1, fy + 2.6]], col('stone'), 0.3, 1.0)   // a lit seam under the lip
        break
      }
      case 'hall': {
        const { x, y, level = 1 } = el, w = 42 * S, bodyH = (19 + level * 3) * S, base = y, wallBot = base - 4 * S
        this._seat(ctx, P, x, base, w * 1.3)
        this._dotPoly(ctx, [[x - w * 0.64, base], [x + w * 0.64, base], [x + w * 0.58, wallBot], [x - w * 0.58, wallBot]], col('stone'), P, 0.34, 0.9)   // platform
        const top = wallBot - bodyH
        this._dotPoly(ctx, [[x - w * 0.5, wallBot], [x + w * 0.5, wallBot], [x + w * 0.5, top], [x - w * 0.5, top]], col('wall'), P, 0.34, 0.94,
          (px, py) => 0.55 + 0.45 * inkRnd2(px, py) + (py < top + bodyH * 0.32 ? 0.2 : 0))
        for (let i = 0; i <= 6; i++) { const cx = x - w * 0.5 + w * i / 6, outer = i === 0 || i === 6; this._dotPoly(ctx, [[cx - 1.1 * S, wallBot], [cx - 1.1 * S, top], [cx + 1.1 * S, top], [cx + 1.1 * S, wallBot]], col(outer ? 'banner' : 'woodHi'), P, 0.3, outer ? 0.85 : 0.55) }   // two red corner pillars; the inner posts stay quiet so the lit wall reads
        for (const wy of [0.34, 0.68]) for (const f of [-1, 1]) this._win(ctx, P, x + f * w * 0.3, wallBot - bodyH * wy, 3.2 * S, 4.4 * S, 'lamp', wy < 0.5 ? 0.95 : 0.8, wy < 0.5 ? 0.14 : 0.1)
        this._dotPoly(ctx, [[x - 4.5 * S, wallBot], [x + 4.5 * S, wallBot], [x + 4.5 * S, top + 5 * S], [x - 4.5 * S, top + 5 * S]], col('lamp'), P * 0.8, 0.4, 0.95)
        inkSoftDot(ctx, x, base - 8 * S, 18 * S, col('lamp'), 0.18)
        inkSoftDot(ctx, x, base - 10 * S, 60 * S, col('lamp'), 0.15)     // the hall's light spills across the terrace
        this._wallTop(ctx, x - w * 0.5, top, x + w * 0.5, 'wallHi', 0.85)   // the lit top edge, so the hall's mass reads against the hills
        const tiers = [1, 1, 2, 3][Math.min(3, level - 1)]
        let ry = top
        for (let t = 0; t < tiers; t++) { this._roof(ctx, P, col('roof'), col('roofHi'), x, ry, w * (0.64 - t * 0.1), 7 * S); ry -= 6 * S }
        this._dotPoly(ctx, [[x - 1.4 * S, ry], [x, ry - 5 * S], [x + 1.4 * S, ry]], col('gold'), P * 0.7, 0.4, 1)
        if (level >= 3) for (const dx of [-w * 0.78, w * 0.78]) {                              // side wings
          this._dotPoly(ctx, [[x + dx - 9 * S, base - 2 * S], [x + dx + 9 * S, base - 2 * S], [x + dx + 9 * S, top + 8 * S], [x + dx - 9 * S, top + 8 * S]], col('wall'), P, 0.34, 0.92,
            (px, py) => 0.55 + 0.45 * inkRnd2(px, py) + (py < top + 12 * S ? 0.18 : 0))
          this._win(ctx, P, x + dx, top + 15 * S, 4 * S, 4.4 * S, 'lamp', 0.85, 0.12)
          this._roof(ctx, P, col('roof'), col('roofHi'), x + dx, top + 8 * S, 12 * S, 5 * S)
        }
        for (const dx of [-w * 0.6, w * 0.6]) { inkSoftDot(ctx, x + dx, base - 6 * S, 9 * S, col('lamp'), 0.18); this._dotPoly(ctx, [[x + dx - 1.2 * S, base - 4 * S], [x + dx + 1.2 * S, base - 4 * S], [x + dx + 1.2 * S, base - 8 * S], [x + dx - 1.2 * S, base - 8 * S]], col('lamp'), P * 0.6, 0.4, 1) }
        break
      }
      case 'pagoda': {
        const { x, y } = el, w = 15 * S, base = y, tiers = 3, th = 13 * S
        this._seat(ctx, P, x, base, w * 1.7)
        for (let t = 0; t < tiers; t++) {
          const bw = w * (1 - t * 0.16), by = base - t * (th * 0.86)
          this._dotPoly(ctx, [[x - bw * 0.62, by], [x + bw * 0.62, by], [x + bw * 0.62, by - th * 0.72], [x - bw * 0.62, by - th * 0.72]], col(t === 1 ? 'wood' : 'wall'), P, 0.32, 0.92,
            (px, py) => 0.5 + 0.45 * inkRnd2(px, py) + (py < by - th * 0.5 ? 0.18 : 0))
          this._win(ctx, P, x, by - th * 0.18, 2.8 * S, 3.8 * S, 'lamp', 0.9, 0.1)   // a lit window on each tier
          this._wallTop(ctx, x - bw * 0.62, by - th * 0.72, x + bw * 0.62, 'wallHi', 0.7)   // a lit wall edge on each tier: the pagoda is the compound's tallest silhouette
          this._roof(ctx, P, col('roof'), col('roofHi'), x, by - th * 0.72, bw * 1.02, 5.5 * S)
        }
        const ty = base - tiers * th * 0.86 + 2 * S
        this._dotPoly(ctx, [[x - 1 * S, ty], [x, ty - 7 * S], [x + 1 * S, ty]], col('gold'), P * 0.6, 0.4, 1)
        inkSoftDot(ctx, x, ty - 5 * S, 7 * S, col('gold'), 0.16)
        break
      }
      case 'pillHall': {
        const { x, y } = el, w = 26 * S, base = y, top = base - 16 * S
        this._seat(ctx, P, x, base, w * 1.35)
        this._dotPoly(ctx, [[x - w * 0.5, base], [x + w * 0.5, base], [x + w * 0.5, top], [x - w * 0.5, top]], col('wall'), P, 0.34, 0.94,
          (px, py) => 0.55 + 0.45 * inkRnd2(px, py) + (py < top + 11 * S ? 0.2 : 0))
        this._beams(ctx, P, x, w * 0.84, top, base, 'wood', 4, 1.1)
        this._win(ctx, P, x, base - 2.6 * S, 3.6 * S, 5.2 * S, 'lamp', 0.95, 0.18)                     // the furnace hall's lit doorway
        this._win(ctx, P, x - w * 0.32, base - 3 * S, 2.2 * S, 3.2 * S, 'lamp', 0.8, 0.1)
        this._win(ctx, P, x + w * 0.32, base - 3 * S, 2.2 * S, 3.2 * S, 'lamp', 0.8, 0.1)
        this._wallTop(ctx, x - w * 0.5, top, x + w * 0.5, 'wallHi', 0.85)
        this._roof(ctx, P, col('roof'), col('roofHi'), x, top, w * 0.66, 6 * S)
        // the great furnace beside it, and a chimney the smoke ambience rises from
        const fx = x + w * 0.72, fy = base - 1 * S
        this._dotPoly(ctx, [[fx - 6 * S, fy], [fx + 6 * S, fy], [fx + 5 * S, fy - 8 * S], [fx - 5 * S, fy - 8 * S]], col('stone'), P, 0.34, 0.94, (px, py) => 0.5 + 0.4 * inkRnd2(px, py) + (py < fy - 6 * S ? 0.16 : 0))
        this._dotPoly(ctx, [[fx - 3.4 * S, fy - 8 * S], [fx + 3.4 * S, fy - 8 * S], [fx + 2.6 * S, fy - 20 * S], [fx - 2.6 * S, fy - 20 * S]], col('stoneDeep'), P, 0.32, 0.9)
        this._dotLine(ctx, [[fx - 5 * S, fy - 8 * S], [fx + 5 * S, fy - 8 * S]], col('stoneHi'), 0.5, 1.0)   // the furnace's lit rim
        inkSoftDot(ctx, fx, fy - 4 * S, 11 * S, col('lamp'), 0.32)                                 // the furnace mouth
        break
      }
      case 'vault': {
        const { x, y } = el, w = 22 * S, base = y, top = base - 13 * S
        this._seat(ctx, P, x, base, w * 1.4)
        this._dotPoly(ctx, [[x - w * 0.5, base], [x + w * 0.5, base], [x + w * 0.5, top], [x - w * 0.5, top]], col('stone'), P, 0.34, 0.95,
          (px, py) => 0.5 + 0.45 * inkRnd2(px, py) + (py < top + 8 * S ? 0.2 : 0))
        this._beams(ctx, P, x, w * 0.9, top, base, 'wood', 4, 1.0)
        this._dotPoly(ctx, [[x - 4 * S, base], [x + 4 * S, base], [x + 4 * S, top + 4 * S], [x - 4 * S, top + 4 * S]], col('stoneDeep'), P * 0.8, 0.42, 0.9)   // the heavy door
        this._dotLine(ctx, [[x, base], [x, top + 4 * S]], col('stoneHi'), 0.5, 0.9)
        this._win(ctx, P, x, base - 7.6 * S, 2.8 * S, 3.4 * S, 'gold', 0.85, 0.12)   // a lit slot above the door
        this._wallTop(ctx, x - w * 0.5, top, x + w * 0.5, 'wallHi', 0.8)
        this._roof(ctx, P, col('roof'), col('roofHi'), x, top, w * 0.6, 5 * S)
        inkSoftDot(ctx, x, base - 5 * S, 10 * S, col('gold'), 0.18)
        break
      }
      case 'yard': {
        const { x, y } = el, w = 30 * S, base = y
        this._dotPoly(ctx, [[x - w * 0.5, base], [x + w * 0.5, base], [x + w * 0.46, base - 15 * S], [x - w * 0.46, base - 15 * S]], col('slope'), P, 0.32, 0.74,
          (px, py) => { const n = inkRnd2(px, py); return n < 0.5 ? 0 : 0.4 + 0.4 * n })         // a swept-earth floor
        // a low wall behind the yard, its top edge catching the light, so the ground reads against the hills
        this._dotPoly(ctx, [[x - w * 0.5, base - 15 * S], [x + w * 0.5, base - 15 * S], [x + w * 0.5, base - 19 * S], [x - w * 0.5, base - 19 * S]], col('wall'), P, 0.32, 0.9,
          (px, py) => 0.5 + 0.4 * inkRnd2(px, py))
        this._wallTop(ctx, x - w * 0.5, base - 19 * S, x + w * 0.5, 'wallHi', 0.8)
        this._dotLine(ctx, [[x - w * 0.5, base], [x - w * 0.46, base - 15 * S], [x + w * 0.46, base - 15 * S], [x + w * 0.5, base]], col('woodHi'), 0.75, 1.0)
        for (const dx of [-w * 0.42, w * 0.42]) {                                              // braziers: a post carrying a flame
          this._dotPoly(ctx, [[x + dx - 1 * S, base - 2 * S], [x + dx + 1 * S, base - 2 * S], [x + dx + 1 * S, base - 9 * S], [x + dx - 1 * S, base - 9 * S]], col('wood'), P, 0.3, 0.9)
          this._dotPoly(ctx, [[x + dx - 2.2 * S, base - 9 * S], [x + dx + 2.2 * S, base - 9 * S], [x + dx + 1.6 * S, base - 12 * S], [x + dx - 1.6 * S, base - 12 * S]], col('lamp'), P * 0.7, 0.42, 0.95)
          inkSoftDot(ctx, x + dx, base - 11 * S, 12 * S, col('lamp'), 0.22)
        }
        for (const dx of [-8 * S, 8 * S]) {                                                    // training dummies: a post + crossarm
          this._dotPoly(ctx, [[x + dx - 1.1 * S, base], [x + dx + 1.1 * S, base], [x + dx + 1.1 * S, base - 12 * S], [x + dx - 1.1 * S, base - 12 * S]], col('wood'), P, 0.3, 0.9)
          this._dotPoly(ctx, [[x + dx - 5 * S, base - 10 * S], [x + dx + 5 * S, base - 10 * S], [x + dx + 5 * S, base - 11.4 * S], [x + dx - 5 * S, base - 11.4 * S]], col('woodHi'), P, 0.3, 0.9)
        }
        break
      }
      case 'pen': {
        const { x, y } = el, w = 30 * S, base = y
        this._seat(ctx, P, x, base, w * 1.15)
        this._dotLine(ctx, [[x - w * 0.5, base], [x + w * 0.5, base]], col('wood'), 0.8, 1.0)
        for (let i = 0; i <= 5; i++) { const px = x - w * 0.5 + w * i / 5; this._dotPoly(ctx, [[px - 0.9 * S, base], [px + 0.9 * S, base], [px + 0.9 * S, base - 9 * S], [px - 0.9 * S, base - 9 * S]], col('wood'), P, 0.3, 0.92) }
        for (const ry of [base - 3 * S, base - 6.4 * S]) this._dotLine(ctx, [[x - w * 0.5, ry], [x + w * 0.5, ry]], col('woodHi'), 0.7, 0.85)
        this._dotPoly(ctx, [[x + w * 0.16, base], [x + w * 0.5, base], [x + w * 0.5, base - 11 * S], [x + w * 0.16, base - 11 * S]], col('wall'), P, 0.32, 0.92,
          (px, py) => 0.5 + 0.4 * inkRnd2(px, py) + (py < base - 8 * S ? 0.16 : 0))
        this._win(ctx, P, x + w * 0.33, base - 3 * S, 2.6 * S, 3.6 * S, 'lamp', 0.9, 0.12)       // a lantern in the shelter
        this._wallTop(ctx, x + w * 0.16, base - 11 * S, x + w * 0.5, 'wallHi', 0.75)
        this._roof(ctx, P, col('roof'), col('roofHi'), x + w * 0.33, base - 11 * S, w * 0.22, 4.5 * S)
        break
      }
      case 'gate': {                                     // the compound's paifang gate, always on the central axis
        const { x, y } = el, base = y, w = 30 * S, hh = 17 * S
        this._seat(ctx, P, x, base, w * 1.25)
        for (const dx of [-w * 0.5, w * 0.5]) {                                                // two stone piers, each on a plinth
          this._dotPoly(ctx, [[x + dx - 2.4 * S, base], [x + dx + 2.4 * S, base], [x + dx + 2.0 * S, base - hh], [x + dx - 2.0 * S, base - hh]], col('stone'), P, 0.34, 0.95,
            (px, py) => 0.5 + 0.4 * inkRnd2(px, py) + (py < base - hh + 5 * S ? 0.18 : 0))
          this._dotPoly(ctx, [[x + dx - 2.8 * S, base + 1 * S], [x + dx + 2.8 * S, base + 1 * S], [x + dx + 2.8 * S, base - 1.6 * S], [x + dx - 2.8 * S, base - 1.6 * S]], col('stoneHi'), P, 0.32, 0.95)   // a bright plinth: one clean band that seats the gate on the terrace
        }
        this._dotPoly(ctx, [[x - w * 0.62, base - hh], [x + w * 0.62, base - hh], [x + w * 0.62, base - hh - 3.4 * S], [x - w * 0.62, base - hh - 3.4 * S]], col('banner'), P, 0.32, 0.9)   // the lintel beam
        this._roof(ctx, P, col('roof'), col('roofHi'), x, base - hh - 3.4 * S, w * 0.5, 6 * S)
        this._dotPoly(ctx, [[x - 4 * S, base - hh - 0.4 * S], [x + 4 * S, base - hh - 0.4 * S], [x + 4 * S, base - hh - 2.8 * S], [x - 4 * S, base - hh - 2.8 * S]], col('gold'), P * 0.7, 0.4, 0.95)   // the name plaque
        for (const dx of [-w * 0.42, w * 0.42]) {                                              // hanging lanterns on the piers
          this._dotPoly(ctx, [[x + dx - 2.2 * S, base - hh + 1 * S], [x + dx + 2.2 * S, base - hh + 1 * S], [x + dx + 2.2 * S, base - hh - 2.4 * S], [x + dx - 2.2 * S, base - hh - 2.4 * S]], col('lamp'), P * 0.7, 0.4, 0.9)
          inkSoftDot(ctx, x + dx, base - hh - 0.6 * S, 11 * S, col('lamp'), 0.24)
        }
        break
      }
      case 'ward': {
        const { x, y, dim } = el, r = 24 * S, body = col(dim ? 'wardDim' : 'ward')
        // the ring of ward stones, and runes on the ground between them
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.34
          this._dotPoly(ctx, [[px - 1.5 * S, py + 1 * S], [px, py - 5 * S], [px + 1.5 * S, py + 1 * S]], body, P * 0.7, 0.4, dim ? 0.6 : 0.95)
        }
        const ring = new Path2D()
        for (let a = 0; a < Math.PI * 2; a += 2 / r) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.34; ring.moveTo(px + 0.42, py); ring.arc(px, py, 0.42, 0, Math.PI * 2) }
        ctx.fillStyle = inkRgba(body, dim ? 0.3 : 0.55); ctx.fill(ring)
        inkSoftDot(ctx, x, y, r * 1.5, body, dim ? 0.05 : 0.13)
        break
      }
      case 'foreRocks': {                                // near rock outcrops at the frame's edges: a lit depth layer in front of the compound
        const fy = el.front
        for (const [cx, h] of [[x0 + 34, 21], [x1 - 32, 25]]) {
          const top = fy - h
          this._dotPoly(ctx, [[cx - 44, y1 + 30], [cx - 32, fy + 6], [cx - 13, fy - h * 0.55], [cx, fy - h],
            [cx + 13, fy - h * 0.5], [cx + 32, fy + 8], [cx + 44, y1 + 30]], col('stoneDeep'), P, 0.42, 0.96,
            (px, py) => { const n = inkRnd2(px, py); if (n < 0.1) return 0; return 0.42 + 0.5 * n + (py < top + 7 ? 0.3 : 0) })
          this._dotLine(ctx, [[cx - 13, fy - h * 0.55], [cx, fy - h], [cx + 13, fy - h * 0.5]], col('bannerGold'), 0.45, 1.1)   // a warm rim: the near rocks catch the compound's light
          this._dotLine(ctx, [[cx - 32, fy + 6], [cx - 13, fy - h * 0.55]], col('stoneHi'), 0.2, 0.9)
          this._dotLine(ctx, [[cx + 13, fy - h * 0.5], [cx + 32, fy + 8]], col('stoneHi'), 0.2, 0.9)
        }
        break
      }
      case 'lanterns': {
        for (const [x, y] of el.items) {
          this._dotPoly(ctx, [[x - 0.9, y], [x + 0.9, y], [x + 0.9, y - 13], [x - 0.9, y - 13]], col('wood'), P, 0.3, 0.9)
          this._dotPoly(ctx, [[x - 2.4, y - 12], [x + 2.4, y - 12], [x + 2.4, y - 17], [x - 2.4, y - 17]], col('lamp'), P * 0.7, 0.4, 0.9)
          inkSoftDot(ctx, x, y - 14.5, 9, col('lamp'), 0.22)
        }
        break
      }
      default: return super._scenery(ctx, C, el, x0, x1, y1)
    }
  }

  // A curved Chinese roof: a swept body with upturned eaves, a brighter ridge line and a lit underside.
  // (x, y) = the eave line's centre; w = half-width, h = height.
  _roof(ctx, P, roof, hi, x, y, w, h) {
    const pts = [
      [x - w, y - h * 0.1], [x - w * 1.08, y - h * 0.5], [x - w * 0.58, y - h * 0.64],
      [x - w * 0.22, y - h * 1.3], [x + w * 0.22, y - h * 1.3], [x + w * 0.58, y - h * 0.64],
      [x + w * 1.08, y - h * 0.5], [x + w, y - h * 0.1],
      [x + w * 0.5, y + h * 0.1], [x, y + h * 0.16], [x - w * 0.5, y + h * 0.1],
    ]
    this._dotPoly(ctx, pts, roof, P, 0.46, 0.97, (px, py) => {
      const n = inkRnd2(px, py)
      if (n < 0.06) return 0
      const tile = 0.78 + 0.22 * Math.sin(py * 1.15 + px * 0.05)      // tile courses: the roof reads as tiles, not a blob
      return (0.62 + 0.38 * n) * tile + (py < y - h * 0.5 ? 0.24 : 0) // the upper slopes catch the light
    })
    // the shadowed under-eave, deeper: the roof reads as its own mass, separate from the wall and the hills behind
    this._dotPoly(ctx, [[x - w, y - h * 0.18], [x + w, y - h * 0.18], [x + w * 0.9, y + h * 0.06], [x - w * 0.9, y + h * 0.06]], this.art.palette.roofDeep, P * 0.9, 0.4, 0.72)
    // the ridge outline, brighter, with upturned eave tips the light catches
    this._dotLine(ctx, [[x - w * 1.04, y - h * 0.44], [x - w * 0.58, y - h * 0.56], [x - w * 0.22, y - h * 1.16],
      [x + w * 0.22, y - h * 1.16], [x + w * 0.58, y - h * 0.56], [x + w * 1.04, y - h * 0.44]], hi, 0.95, 1.1)
    for (const sd of [-1, 1]) this._dotPoly(ctx, [[x + sd * w * 0.88, y - h * 0.3], [x + sd * w * 1.14, y - h * 0.52],
      [x + sd * w * 1.2, y - h * 0.36], [x + sd * w * 0.94, y - h * 0.16]], hi, P * 0.7, 0.4, 0.95)
    // a warm lit eave running the whole length, and its glow, so every roof carries the compound's light
    this._dotLine(ctx, [[x - w * 0.96, y + h * 0.02], [x, y + h * 0.14], [x + w * 0.96, y + h * 0.02]], this.art.palette.lamp, 0.6, 1.0)
    inkSoftDot(ctx, x, y + h * 0.1, w * 1.1, this.art.palette.lamp, 0.07)
  }

  // A lit window/doorway: a warm block with a soft halo (every structure gets these, so the compound glows).
  _win(ctx, P, x, y, w, h, col = 'lamp', a = 1, glow = 0.16) {
    const c = this.art.palette[col] || col
    this._dotPoly(ctx, [[x - w / 2, y], [x + w / 2, y], [x + w / 2, y - h], [x - w / 2, y - h]], c, P * 0.7, 0.44, a)
    inkSoftDot(ctx, x, y - h / 2, Math.max(w, h) * 1.4, c, glow)
  }

  // Vertical timber posts across a wall: the compound's frame, which breaks a flat block into a building.
  _beams(ctx, P, x, w, yTop, yBot, col = 'wood', n = 3, t = 1.1) {
    for (let i = 0; i < n; i++) {
      const cx = n === 1 ? x : x - w * 0.5 + w * i / (n - 1)
      this._dotPoly(ctx, [[cx - t, yBot], [cx + t, yBot], [cx + t, yTop], [cx - t, yTop]], this.art.palette[col] || col, P, 0.3, 0.85)
    }
  }

  // A lit top edge along a wall: the moon/compound light catching the near face, so its mass reads against the hills.
  _wallTop(ctx, x0, y, x1, col = 'wallHi', a = 0.8) { this._dotLine(ctx, [[x0, y], [x1, y]], this.art.palette[col] || col, a, 1.05) }

  // A soft dark strip under a structure: it sits ON the terrace instead of floating over it.
  _seat(ctx, P, x, y, w, a = 0.5) {
    this._dotPoly(ctx, [[x - w * 0.5, y + 2.6], [x + w * 0.5, y + 2.6], [x + w * 0.4, y - 2.2], [x - w * 0.4, y - 2.2]], this.art.palette.shadow || '#1C1622', P, 0.34, a)
  }

  // ── Animated ambience: the parent draws its realm kinds; we draw the scene's ───────────────────────────────
  _ambience(ctx, C, t) {
    super._ambience(ctx, C, t)                                   // stars / cloudBank / birds / fireflies
    const PAL = this.art.palette, calm = this.reducedMotion
    const col = k => PAL[k] || k
    for (const a of this.art.background.ambience) {
      switch (a.kind) {
        case 'disciples': {                                       // robed figures about the terrace, breathing in place
          const [bx0, bx1, by0, by1] = a.box
          for (let i = 0; i < a.n; i++) {
            const x = bx0 + (bx1 - bx0) * ((i + 0.5) / a.n), y = by0 + (by1 - by0) * inkRnd(i * 4.7) + (calm ? 0 : Math.sin(t * 0.6 + i * 2.1) * 0.5)
            const s = 1 + 0.5 * inkRnd(i * 2.3)
            this._dotPoly(ctx, [[x - 1.6 * s, y], [x + 1.6 * s, y], [x + 1.0 * s, y - 6.5 * s], [x - 1.0 * s, y - 6.5 * s]], col('wall'), this.art.dot.pitch * 0.7, 0.36, 0.9)
            ctx.fillStyle = inkRgba(col('moon'), 0.85); ctx.beginPath(); ctx.arc(x, y - 8 * s, 1.15 * s, 0, Math.PI * 2); ctx.fill()
          }
          break
        }
        case 'smoke': {                                           // a furnace plume, thinning as it rises and drifts
          for (let i = 0; i < a.n; i++) {
            const ph = ((t * 0.09 + i / a.n) % 1 + 1) % 1
            const x = a.x + Math.sin(ph * 4 + i) * (3 + ph * 12) + (calm ? 0 : Math.sin(t * 0.5 + i) * 1.5)
            const y = a.y0 + (a.y1 - a.y0) * ph
            inkSoftDot(ctx, x, y, 4 + ph * 9, col(a.color), 0.16 * (1 - ph) * (1 - ph * 0.4))
          }
          break
        }
        case 'wardPulse': {                                       // the array breathes: an expanding ring on the ground
          const glow = a.dim ? 0.05 : 0.14, w = a.dim ? 0.35 : 0.7
          inkSoftDot(ctx, a.x, a.y, a.r * 1.6, col(a.color), calm ? glow : glow * (0.7 + 0.3 * Math.sin(t * 1.4)))
          for (let k = 0; k < 2; k++) {
            const ph = ((t * (calm ? 0.12 : 0.3) + k / 2) % 1 + 1) % 1
            const r = a.r * (0.4 + ph), ring = new Path2D()
            for (let ang = 0; ang < Math.PI * 2; ang += 2 / r) { const px = a.x + Math.cos(ang) * r, py = a.y + Math.sin(ang) * r * 0.34; ring.moveTo(px + 0.45, py); ring.arc(px, py, 0.45, 0, Math.PI * 2) }
            ctx.fillStyle = inkRgba(col(a.color), w * (1 - ph)); ctx.fill(ring)
          }
          break
        }
        case 'banners': {                                         // fame flags along the terrace, snapping in the wind
          const bx0 = 150, bx1 = 268
          for (let i = 0; i < a.n; i++) {
            const x = bx0 + (bx1 - bx0) * ((i + 0.5) / a.n), y = 174 + (i % 2) * 6
            this._dotPoly(ctx, [[x - 0.8, y], [x + 0.8, y], [x + 0.8, y - 22], [x - 0.8, y - 22]], col('wood'), this.art.dot.pitch * 0.7, 0.3, 0.9)
            const sway = calm ? 2 : 2 + 2.4 * Math.sin(t * 1.6 + i * 1.3), pts = []
            for (let k = 0; k <= 6; k++) { const f = k / 6; pts.push([x + 0.8 + f * 11, y - 20 + Math.sin(f * 2.4) * 1.2 + sway * f * f]) }
            for (let k = 0; k <= 6; k++) { const f = k / 6; pts.push([x + 0.8 + f * 11, y - 12 + Math.sin(f * 2.4) * 1.2 + sway * f * f]) }
            this._dotPoly(ctx, pts, col(a.color), this.art.dot.pitch * 0.72, 0.36, 0.85)
            ctx.fillStyle = inkRgba(col(a.gold), 0.9); ctx.beginPath(); ctx.arc(x, y - 22.6, 1.3, 0, Math.PI * 2); ctx.fill()
          }
          break
        }
        case 'beastPace': {                                       // a low silhouette pacing the pen
          const ph = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.5), x = a.x0 + (a.x1 - a.x0) * ph, y = a.y
          const flip = calm ? 1 : (Math.cos(t * 0.5) < 0 ? 1 : -1)
          for (const [dx, dy, r] of [[-5, -4, 1.1], [0, -5, 1.3], [5, -4, 1.1], [0, -6.4, 1.4]]) {
            ctx.fillStyle = inkRgba(col(a.color), 0.85)
            ctx.beginPath(); ctx.arc(x + dx * flip, y + dy, r, 0, Math.PI * 2); ctx.fill()
          }
          break
        }
        case 'spiritMotes': {                                     // slow rising Qi motes over the compound
          const [bx0, bx1, by0, by1] = a.box
          for (let i = 0; i < a.n; i++) {
            const ph = ((t * 0.05 + inkRnd(i * 3.7)) % 1 + 1) % 1
            const x = bx0 + (bx1 - bx0) * inkRnd(i * 5.1) + (calm ? 0 : Math.sin(t * 0.4 + i) * 2)
            const y = by1 - ph * (by1 - by0)
            inkSoftDot(ctx, x, y, 1.7, col(a.color), 0.5 * Math.sin(ph * Math.PI))
          }
          break
        }
      }
    }
  }
}
