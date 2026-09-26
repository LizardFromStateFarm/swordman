// ASCII sprite renderer with particle system, ethereal aura rings, and stage-reactive backgrounds.

class ASCIIRenderer {
  constructor(canvas) {
    this.cv         = canvas
    this.ctx        = canvas.getContext('2d')
    this.fontSize   = 14
    this.lineHeight = 17
    this.font       = `${this.fontSize}px "Courier New", Consolas, monospace`
    this.sprite     = null
    this.frame      = 0
    this.frameT     = 0
    this.glowPhase  = 0
    this.rafId      = null
    this.lastT      = 0
    this.running    = false
    this._name      = null
    this.stageColor = '#CC6010'   // updated externally from game.js

    // Particle pool
    this._particles = []
    this._particleSpawnT = 0
    this._auraRings = []          // expanding ring effects

    // Phase 20C settings (applied by renderer/game/settings.js)
    this.speed         = 1            // animation speed multiplier
    this.reducedMotion = false        // true → no particles / aura rings
  }

  // ── Public API ───────────────────────────────────────────────────────────

  setState(name) {
    const spr = CULTIVATOR_SPRITES[name]
    if (!spr) return
    if (this._name !== name) {
      this._name  = name
      this.sprite = spr
      this.frame  = 0
      this.frameT = 0
      // Burst of particles on state change
      this._spawnBurst(8)
    }
    if (!this.running) this._start()
  }

  setStageColor(hex) {
    this.stageColor = hex || '#CC6010'
  }

  setSpeed(mult) { this.speed = mult > 0 ? mult : 1 }

  setReducedMotion(on) {
    this.reducedMotion = !!on
    if (this.reducedMotion) { this._particles = []; this._auraRings = [] }
  }

  triggerBreakthroughBurst() {
    if (this.reducedMotion) return
    this._spawnBurst(24)
    this._addAuraRing(1.8)
  }

  stop() {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  _start() {
    this.running = true
    this.lastT   = performance.now()
    const tick   = (now) => {
      if (!this.running) return
      const dt = Math.min((now - this.lastT) / 1000, 0.1) * this.speed
      this.lastT = now
      this._update(dt)
      this._draw()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  _update(dt) {
    if (!this.sprite) return
    this.glowPhase = (this.glowPhase + dt * 1.4) % (Math.PI * 2)

    // Advance animation frame
    this.frameT += dt
    const dur = 1 / (this.sprite.fps || 1)
    if (this.frameT >= dur) {
      this.frameT -= dur
      this.frame = (this.frame + 1) % this.sprite.frames.length
    }

    if (this.reducedMotion) return

    // Spawn ambient particles
    this._particleSpawnT += dt
    const spawnRate = this._particleRateForState()
    if (this._particleSpawnT >= 1 / spawnRate) {
      this._particleSpawnT = 0
      this._spawnParticle()
    }

    // Update particles
    this._particles = this._particles.filter(p => {
      p.x  += p.vx * dt
      p.y  += p.vy * dt
      p.age += dt
      p.alpha = Math.max(0, 1 - p.age / p.life)
      return p.age < p.life
    })

    // Update aura rings
    this._auraRings = this._auraRings.filter(r => {
      r.radius += r.speed * dt
      r.alpha   = Math.max(0, 1 - r.radius / r.maxRadius)
      return r.alpha > 0
    })
  }

  _draw() {
    const ctx = this.ctx
    const W   = this.cv.width
    const H   = this.cv.height
    ctx.clearRect(0, 0, W, H)
    if (!this.sprite) return

    this._drawBackground(ctx, W, H)
    this._drawAuraRings(ctx, W, H)
    this._drawParticles(ctx, W, H)
    this._drawSprite(ctx, W, H)
    ctx.shadowBlur = 0
  }

  // ── Background ────────────────────────────────────────────────────────────

  _drawBackground(ctx, W, H) {
    const phase = this.glowPhase
    const base  = this._hexToRgb(this.stageColor)

    // Deep ambient radial
    const glow1 = 0.08 + 0.05 * Math.sin(phase)
    const g1 = ctx.createRadialGradient(W/2, H*0.55, 5, W/2, H*0.55, W * 0.65)
    g1.addColorStop(0, `rgba(${base.r},${base.g},${base.b},${glow1})`)
    g1.addColorStop(1, 'transparent')
    ctx.fillStyle = g1
    ctx.fillRect(0, 0, W, H)

    // Secondary offset glow (ethereal double-light)
    const glow2 = 0.04 + 0.03 * Math.sin(phase + 1.2)
    const g2 = ctx.createRadialGradient(W*0.35, H*0.3, 4, W*0.35, H*0.3, W * 0.4)
    g2.addColorStop(0, `rgba(${Math.min(255,base.r+60)},${Math.min(255,base.g+40)},${Math.min(255,base.b+80)},${glow2})`)
    g2.addColorStop(1, 'transparent')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, H)
  }

  // ── Aura rings ────────────────────────────────────────────────────────────

  _drawAuraRings(ctx, W, H) {
    const cx = W / 2, cy = H * 0.52
    for (const r of this._auraRings) {
      const rgb = this._hexToRgb(this.stageColor)
      ctx.beginPath()
      ctx.arc(cx, cy, r.radius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${r.alpha * 0.6})`
      ctx.lineWidth   = 1.5
      ctx.shadowBlur  = 12
      ctx.shadowColor = this.stageColor
      ctx.stroke()
      ctx.shadowBlur  = 0
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  _drawParticles(ctx, W, H) {
    ctx.font         = '11px "Courier New", monospace'
    ctx.textBaseline = 'middle'
    for (const p of this._particles) {
      const rgb = this._hexToRgb(p.color)
      ctx.fillStyle  = `rgba(${rgb.r},${rgb.g},${rgb.b},${p.alpha})`
      ctx.shadowBlur = 8
      ctx.shadowColor = p.color
      ctx.fillText(p.ch, p.x, p.y)
    }
    ctx.shadowBlur = 0
    ctx.font = this.font
  }

  // ── Sprite ────────────────────────────────────────────────────────────────

  _drawSprite(ctx, W, H) {
    ctx.font         = this.font
    ctx.textBaseline = 'top'

    const rows   = this.sprite.frames[this.frame]
    const colors = this.sprite.colors || {}
    const defClr = this.sprite.defaultColor || '#C8B89A'

    const rowWidths = rows.map(r => this._rowWidth(ctx, r))
    const totalH    = rows.length * this.lineHeight
    const oy        = Math.floor((H - totalH) / 2)

    for (let r = 0; r < rows.length; r++) {
      const row  = rows[r]
      let x      = Math.floor((W - rowWidths[r]) / 2)
      const y    = oy + r * this.lineHeight

      for (const ch of row) {
        const cw = ctx.measureText(ch).width
        if (ch !== ' ') {
          const clr       = colors[ch] || defClr
          const isSpecial = !!colors[ch]
          ctx.fillStyle   = clr
          ctx.shadowBlur  = isSpecial ? 10 : 0
          ctx.shadowColor = clr
          ctx.fillText(ch, x, y)
        }
        x += cw
      }
    }
  }

  // ── Particle helpers ──────────────────────────────────────────────────────

  _particleRateForState() {
    const rates = {
      idle:             1,
      meditating:       2,
      meditating_deep:  3,
      levitating:       5,
      transcending:     8,
      breakthrough:     16,
    }
    return rates[this._name] || 2
  }

  static _PARTICLE_CHARS = ['气','✦','✧','·','~','∿','∾','≋','☽','☆','◇','○','·']

  _spawnParticle() {
    const W = this.cv.width, H = this.cv.height
    const cx = W / 2 + (Math.random() - 0.5) * 80
    const cy = H * 0.55 + (Math.random() - 0.5) * 60
    const angle  = Math.random() * Math.PI * 2
    const speed  = 12 + Math.random() * 20
    const colors = [this.stageColor, '#FFD700', '#87CEEB', '#C8B89A']
    this._particles.push({
      x:    cx,
      y:    cy,
      vx:   Math.cos(angle) * speed,
      vy:   Math.sin(angle) * speed - 15,  // slight upward drift
      ch:   ASCIIRenderer._PARTICLE_CHARS[Math.floor(Math.random() * ASCIIRenderer._PARTICLE_CHARS.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      life:  0.8 + Math.random() * 1.2,
      age:   0,
      alpha: 1,
    })
    if (this._particles.length > 60) this._particles.shift()
  }

  _spawnBurst(n) {
    for (let i = 0; i < n; i++) this._spawnParticle()
  }

  _addAuraRing(speedMultiplier = 1) {
    this._auraRings.push({ radius: 10, maxRadius: 120, speed: 55 * speedMultiplier, alpha: 1 })
    this._auraRings.push({ radius: 5,  maxRadius: 80,  speed: 40 * speedMultiplier, alpha: 1 })
  }

  _rowWidth(ctx, row) {
    let w = 0
    for (const ch of row) w += ctx.measureText(ch).width
    return w
  }

  _hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#CC6010')
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) }
             : { r: 204, g: 96, b: 16 }
  }
}
