// Phase 14 + 52 mini-games (docs/systems/minigames.md, docs/systems/body-constitution.md → "Mini-games").
// Two families, both optional and charge-free (cooldown-gated, Phase 48):
//  · timing — a body exercise on an animated ExerciseScene figure (renderer/engine/exercise-scene.js). Three modes
//    (the registry's `mode`, assets/data/minigames.js): 'beat' (Push-Ups — press when the marker crosses the gold
//    seal) · 'stride' (Running — tap the foot that is due, on the beat) · 'hold' (Lift — hold, let go inside the gold).
//    Body XP, or a time cut on a running tempering.
//  · puzzle (Meridian Flow + Memorization): Meridian Flow — rotate channels so every acupoint joins the dantian;
//    Memorization — repeat a seeded acupoint sequence. Both reward Qi.
// FlowPuzzle + MemoryPuzzle are DOM-free and deterministic (seeded) so the ENGINE can re-generate a puzzle and verify
// an answer (game-state.js finishMinigame) — the UI never writes a reward. The same is true of the timing games: the
// UI reports the grades, the engine recomputes the points (the registry's `timing` config, with an anti-script floor).
// MinigameUI is the overlay (DOM only inside methods, so the sim loader can load this file).

// ── FlowPuzzle: a spanning tree of channels on an n×n grid, scrambled by rotation ──
// A cell's channels are a bitmask: N 1 · E 2 · S 4 · W 8. Turning a cell clockwise maps N→E→S→W→N.
const FlowPuzzle = {
  DIRS: [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]],   // [bit, dx, dy, the opposite bit]
  rng(seed) {
    let a = seed >>> 0
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  },
  rot(mask, turns) {
    let m = mask
    for (let i = 0; i < ((turns % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15
    return m
  },
  // → { n, source, solved: [masks], shown: [masks as dealt], leaves: [cell indices] }
  generate(seed, n) {
    const R = this.rng(seed), N = n * n, solved = new Array(N).fill(0), seen = new Array(N).fill(false)
    const source = Math.floor(n / 2) * n + Math.floor(n / 2)
    // Randomised depth-first search: long winding channels, like meridians
    const stack = [source]; seen[source] = true
    while (stack.length) {
      const c = stack[stack.length - 1], x = c % n, y = Math.floor(c / n)
      const opts = this.DIRS.filter(([, dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen[ny * n + nx] })
      if (!opts.length) { stack.pop(); continue }
      const [bit, dx, dy, opp] = opts[Math.floor(R() * opts.length)], nc = (y + dy) * n + (x + dx)
      solved[c] |= bit; solved[nc] |= opp; seen[nc] = true; stack.push(nc)
    }
    // Deal every tile a random turn; re-deal if it came out already solved
    let turns
    do { turns = solved.map(() => Math.floor(R() * 4)) } while (this.isSolved(solved.map((m, i) => this.rot(m, turns[i])), n, source))
    const leaves = solved.map((m, i) => i !== source && [1, 2, 4, 8].filter(b => m & b).length === 1 ? i : -1).filter(i => i >= 0)
    return { n, source, solved, shown: solved.map((m, i) => this.rot(m, turns[i])), leaves }
  },
  // Which cells Qi reaches from the source (through channels both sides share)
  reached(masks, n, source) {
    const seen = new Set([source]), q = [source]
    while (q.length) {
      const c = q.shift(), x = c % n, y = Math.floor(c / n)
      for (const [bit, dx, dy, opp] of this.DIRS) {
        if (!(masks[c] & bit)) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue
        const nc = ny * n + nx
        if ((masks[nc] & opp) && !seen.has(nc)) { seen.add(nc); q.push(nc) }
      }
    }
    return seen
  },
  // Solved = every cell reached and no channel ends open (off the grid, or into a cell that doesn't answer it)
  isSolved(masks, n, source) {
    for (let c = 0; c < n * n; c++) {
      const x = c % n, y = Math.floor(c / n)
      for (const [bit, dx, dy, opp] of this.DIRS) {
        if (!(masks[c] & bit)) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= n || ny >= n || !(masks[ny * n + nx] & opp)) return false
      }
    }
    return this.reached(masks, n, source).size === n * n
  },
  // The engine's check: re-deal the seeded puzzle and apply the player's clockwise turns per cell
  check(seed, n, rotations) {
    if (!Array.isArray(rotations) || rotations.length !== n * n) return false
    const p = this.generate(seed, n)
    return this.isSolved(p.shown.map((m, i) => this.rot(m, (rotations[i] | 0) % 4)), n, p.source)
  },
}

// ── MemoryPuzzle: the Acupoint Sequence. A seeded order per round on a grid of acupoints; the player repeats it. ──
// `generate(seed, lens)` → one cell-index sequence per round, deterministic (no cell lights twice in a row). Reads the
// `MEMORY.grid` size (assets/data/minigames.js). DOM-free so the engine can re-derive the answers in finishMinigame.
const MemoryPuzzle = {
  generate(seed, lens) {
    const R = FlowPuzzle.rng(seed), grid = (typeof MEMORY !== 'undefined' ? MEMORY.grid : 9)
    return (Array.isArray(lens) ? lens : []).map(len => {
      const seq = []
      for (let i = 0; i < len; i++) {
        let c = Math.floor(R() * grid), guard = 0
        while (i > 0 && c === seq[i - 1] && guard++ < 20) c = Math.floor(R() * grid)
        seq.push(c)
      }
      return seq
    })
  },
}

// ── The Lift's strain curve: rises to the peak, then slips back — let go inside the gold near the top. ──
const HOLD = { riseSecs: 1.8, fallSecs: 1.5, gold: 0.82, good: 0.5, gapMs: 380 }
// ── The overlay ── h: { esc, flash, fmtTime, fmt }
const MinigameUI = {
  el: null, gs: null, h: null, kind: null, family: null, st: null, raf: 0, scene: null,

  open(kind, gs, h) {
    this.gs = gs; this.h = h
    this._stopScene()
    const r = gs.startMinigame(kind)
    if (!r.ok) {
      h.flash(r.reason === 'cooldown' ? `Not ready yet — ${Math.ceil((r.leftMs || 0) / 1000)}s.`
        : r.reason === 'locked' ? (r.lock || 'Not yet unlocked.')
        : r.reason === 'charges' ? 'No charges left.'
        : 'Not now.', 'negative')
      return
    }
    this.kind = kind
    this.family = (MINIGAMES.find(g => g.id === kind) || {}).family || 'timing'
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.id = 'mg-overlay'
      this.el.className = 'mg-overlay hidden'
      this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true')
      document.body.appendChild(this.el)
      this.el.addEventListener('click', e => this._click(e))
      // Timing games score on pointerdown, at the event's own time: a touch 'click' only fires on finger-up,
      // 80-150 ms late, which pushed every on-the-seal tap past the perfect window on phones (v1 fix 2026-10-05)
      this.el.addEventListener('pointerdown', e => this._pointerDown(e))
      document.addEventListener('pointerup', e => this._pointerUp(e))
      document.addEventListener('keydown', e => this._key(e))
      document.addEventListener('keyup', e => this._key(e))
    }
    this.el.classList.remove('hidden')
    if (kind === 'flow') this._startFlow(r.session)
    else if (kind === 'memory') this._startMemory(r.session)
    else this._startTiming(kind, r.session)
  },
  close() {
    cancelAnimationFrame(this.raf); this.raf = 0
    this._stopScene(); this._clearTimers()
    if (this.el) { this.el.classList.add('hidden'); this.el.innerHTML = '' }
    this.kind = null; this.family = null; this.st = null
  },
  _stopScene() { if (this.scene) { this.scene.stop(); this.scene = null } },
  _clearTimers() { (this.st?.timers || []).forEach(clearTimeout); if (this.st) this.st.timers = [] },
  _reduced() { const s = this.gs.get()?.settings; return !!s?.reducedMotion },
  _def() { return MINIGAMES.find(g => g.id === this.kind) || {} },
  _glyph() { return (MINIGAMES.find(g => g.id === this.kind) || {}).glyph || MINIGAME_DEFAULT_GLYPH },
  // The def's timing block, with the shared STRIKES defaults (the same fallbacks the engine uses).
  _t() {
    const t = this._def().timing || {}
    return { sweepMs: t.sweepMs || STRIKES.sweepMs, cutMax: t.cutMax != null ? t.cutMax : STRIKES.cutMax,
      cutPerPoint: t.cutPerPoint != null ? t.cutPerPoint : STRIKES.cutPerPoint }
  },
  _shell(title, sub, body, foot) {
    const flow = this.kind === 'flow'
    this.el.innerHTML = `<div class="mg-card mg-${this.kind}">
      <div class="mg-head"><span class="mg-glyph">${Icon(this._glyph())}</span>
        <div class="mg-titles"><div class="mg-title">${title}</div><div class="mg-sub">${sub}</div></div>
        <button class="mg-x" data-mg="quit" title="${flow ? 'Set it aside: the puzzle waits for you, as you left it' : 'Give up (nothing is lost)'}" aria-label="${flow ? 'Set aside' : 'Give up'}">${Icon('close')}</button></div>
      <div class="mg-body">${body}</div><div class="mg-foot">${foot}</div></div>`
  },

  // ── Timing games (Push-Ups · Running · Lift) ──
  _startTiming(kind, ses) {
    const def = this._def(), t = def.timing || {}
    const reps = ses.reps || t.reps || STRIKES.strikes
    this.st = { kind, mode: def.mode || 'beat', reps, sweepMs: t.sweepMs || STRIKES.sweepMs,
      perfectPts: t.perfectPts || STRIKES.perfect, goodPts: t.goodPts || STRIKES.good,
      relax: ses.relaxed ? STRIKES.relaxedMult : 1, R: FlowPuzzle.rng(ses.seed),
      hits: [], t0: performance.now(), done: false, i: 0 }
    if (this.st.mode === 'stride') this._startStride(ses)
    else if (this.st.mode === 'hold') this._startHold(ses)
    else this._startBeat(ses)
    const loop = now => { this._drawTiming(now); if (this.family === 'timing' && !this.st?.done) this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
  },
  // The animated figure (Phase 52b/52c): a purpose-built dot-silhouette in the registry's `scene` set, carrying your
  // stage colour + aura (and the body tier, for the Lift's load). Absent in the sim (engine/exercise-scene.js is
  // app-only) — the games still play on the bar.
  _startScene(ex) {
    const c = ex && this.el.querySelector('.mg-ex')
    if (!c || typeof ExerciseScene === 'undefined') return
    const s = this.gs.get(), st = CULTIVATION_STAGES[s.stageIndex] || CULTIVATION_STAGES[0]
    this.scene = new ExerciseScene(c)
    this.scene.play({ exercise: ex, color: st.color, tier: s.stageIndex, liftTier: s.body?.tier || 0, reducedMotion: this._reduced() })
  },
  _drawTiming(now) {
    const m = this.st?.mode
    if (m === 'stride') return this._drawStride(now)
    if (m === 'hold') return this._drawHold(now)
    return this._drawBeat(now)
  },

  // beat — a marker ping-pongs across the bar; press when it crosses the gold seal
  _startBeat() {
    const S = STRIKES, info = this.gs.minigameInfo()[this.kind] || {}
    this.st.center = 0.25 + this.st.R() * 0.5
    const reduced = this._reduced(), ex = this._def().scene
    this._shell(info.name || 'Training', `Press when the marker crosses the gold seal. ${this.st.reps} reps; the seal narrows each time.`,
      `${ex ? '<canvas class="mg-ex" aria-hidden="true"></canvas>' : ''}
       <div class="mg-bar${reduced ? ' calm' : ''}" data-mg="strike">
         <div class="mg-seal"><i class="mg-perfect"></i></div><div class="mg-marker"></div></div>
       <div class="mg-pips">${Array.from({ length: this.st.reps }, () => '<i></i>').join('')}</div>
       <div class="mg-call" aria-live="polite">&nbsp;</div>`,
      `<button class="mg-btn mg-strike" data-mg="strike">Press <kbd>Space</kbd></button>`)
    this._startScene(ex)
    this._placeSeal()
  },
  // stride — Running: tap the foot that is due when the marker crosses the seal (the marker is quicker each rep)
  _startStride() {
    const def = this._def(), info = this.gs.minigameInfo()[this.kind] || {}
    const sides = Array.from({ length: this.st.reps }, (_, i) => i % 2 ? 'R' : 'L')
    this.st.sides = sides
    this.st.center = 0.3 + this.st.R() * 0.4
    const reduced = this._reduced()
    this._shell(info.name || 'Running', `Tap the foot that is due when the marker crosses the gold. ${this.st.reps} steps; the stride quickens each step.`,
      `<canvas class="mg-ex" aria-hidden="true"></canvas>
       <div class="mg-bar${reduced ? ' calm' : ''}"><div class="mg-seal"><i class="mg-perfect"></i></div><div class="mg-marker"></div></div>
       <div class="mg-pips mg-steps">${sides.map(s => `<i>${s}</i>`).join('')}</div>
       <div class="mg-call" aria-live="polite">&nbsp;</div>`,
      `<div class="mg-feet">
         <button class="mg-btn mg-foot" data-mg="step" data-side="L">Left</button>
         <button class="mg-btn mg-foot" data-mg="step" data-side="R">Right</button></div>`)
    this._startScene(def.scene)
    this._placeSeal()
    this._dueSide()
  },
  // hold — Lift: hold the load, let go inside the gold; hold too long and it slips back down
  _startHold() {
    const def = this._def(), info = this.gs.minigameInfo()[this.kind] || {}
    const item = this.gs.liftItemInfo?.().name || 'the load'
    this.st.holding = false; this.st.strain = 0; this.st.releasedAt = -1e9
    const reduced = this._reduced(), reps = this.st.reps
    this._shell(info.name || 'Lift', `Hold, and let go inside the gold. ${reps} rep${reps > 1 ? 's' : ''} — today the load is ${this.h.esc(item)}.`,
      `<canvas class="mg-ex" aria-hidden="true"></canvas>
       <div class="mg-strain${reduced ? ' calm' : ''}" data-mg="lift">
         <div class="mg-gold" style="width:${((1 - HOLD.gold) * 100 + 3).toFixed(0)}%"></div><div class="mg-strainfill"></div></div>
       <div class="mg-pips">${Array.from({ length: reps }, () => '<i></i>').join('')}</div>
       <div class="mg-call" aria-live="polite">Press and hold</div>`,
      `<button class="mg-btn mg-lift" data-mg="lift">Hold <kbd>Space</kbd></button>`)
    this._startScene(def.scene)
  },
  _sealW() { const S = STRIKES; return Math.max(S.sealMin, S.seal - S.sealShrink * this.st.i) * this.st.relax },
  _placeSeal() {
    const w = this._sealW(), seal = this.el.querySelector('.mg-seal')
    if (!seal) return
    seal.style.left = ((this.st.center - w / 2) * 100) + '%'; seal.style.width = (w * 100) + '%'
    seal.querySelector('.mg-perfect').style.width = (STRIKES.perfectFrac * 100) + '%'
  },
  // Ping-pong position 0..1 across the bar (a full there-and-back is one rep)
  _pos(now) { const T = this.st.sweepMs, k = ((now - this.st.t0) % (2 * T)) / T; return k <= 1 ? k : 2 - k },
  _drawBeat(now) {
    const p = this._pos(now), mk = this.el.querySelector('.mg-marker'), bar = this.el.querySelector('.mg-bar')
    if (this.scene) this.scene.setPress(p)   // the figure presses in step with the sweeping marker
    if (!mk) return
    mk.style.left = (p * 100) + '%'
    // Reduced motion: the marker is hidden; the seal brightens as the moment nears (same timing window)
    if (bar.classList.contains('calm')) {
      const w = this._sealW(), d = Math.abs(p - this.st.center)
      bar.style.setProperty('--near', Math.max(0, 1 - d / (w * 1.5)).toFixed(2))
    }
  },
  _drawStride(now) {
    const p = this._pos(now), mk = this.el.querySelector('.mg-marker'), bar = this.el.querySelector('.mg-bar')
    if (this.scene) this.scene.setPress(p)   // the stride ping-pongs in step with the marker
    if (!mk) return
    mk.style.left = (p * 100) + '%'
    if (bar?.classList.contains('calm')) { const w = this._sealW(), d = Math.abs(p - this.st.center); bar.style.setProperty('--near', Math.max(0, 1 - d / (w * 1.5)).toFixed(2)) }
  },
  _drawHold(now) {
    const st = this.st
    if (st.holding) { const dt = (now - st.held0) / 1000; st.strain = dt <= HOLD.riseSecs ? dt / HOLD.riseSecs : Math.max(0, 1 - (dt - HOLD.riseSecs) / HOLD.fallSecs) }
    if (this.scene) this.scene.setPress(st.strain)   // the load rises as you strain, then slips back down
    const fill = this.el.querySelector('.mg-strainfill'); if (fill) fill.style.width = (Math.min(1.02, st.strain) * 100).toFixed(1) + '%'
  },
  _dueSide() {
    const st = this.st, due = st.sides?.[st.i]
    const badge = this.el.querySelector('.mg-bar')
    if (badge) badge.dataset.due = due || ''
    this.el.querySelectorAll('.mg-foot').forEach(b => b.classList.toggle('due', b.dataset.side === due))
  },
  // A beat tap (Push-Ups)
  _strike(at) {
    const st = this.st
    if (!st || st.done) return
    const now = performance.now(), t = at > 0 && at <= now && now - at < 500 ? at : now
    const p = this._pos(t), w = this._sealW(), d = Math.abs(p - st.center)
    this._step(d <= w * STRIKES.perfectFrac / 2 ? 'perfect' : d <= w / 2 ? 'good' : 'miss')
  },
  // A stride tap (Running): correct foot AND on the beat, or a stumble
  _stride(which, at) {
    const st = this.st
    if (!st || st.done) return
    const due = st.sides[st.i]
    const now = performance.now(), t = at > 0 && at <= now && now - at < 500 ? at : now
    const p = this._pos(t), w = this._sealW(), d = Math.abs(p - st.center)
    this._step(which === due ? (d <= w * STRIKES.perfectFrac / 2 ? 'perfect' : d <= w / 2 ? 'good' : 'miss') : 'miss')
  },
  _holdDown() {
    const st = this.st
    if (!st || st.done || st.holding || performance.now() - st.releasedAt < HOLD.gapMs) return
    st.holding = true; st.held0 = performance.now(); st.strain = 0
    const call = this.el.querySelector('.mg-call'); if (call) { call.textContent = 'Hold…'; call.className = 'mg-call' }
  },
  _holdUp() {
    const st = this.st
    if (!st || st.done || !st.holding) return
    st.holding = false; st.releasedAt = performance.now()
    const s = st.strain
    st.strain = 0
    this._step(s >= HOLD.gold ? 'perfect' : s >= HOLD.good ? 'good' : 'miss')
  },
  // Record one graded rep/step, update the pips + call, and finish when the reps run out
  _step(hit) {
    const st = this.st, stride = st.mode === 'stride', hold = st.mode === 'hold'
    st.hits.push(hit)
    const pip = this.el.querySelectorAll('.mg-pips i')[st.i]
    if (pip) pip.className = hit
    const call = this.el.querySelector('.mg-call')
    if (call) {
      call.textContent = hit === 'perfect' ? (stride ? 'Clean stride' : hold ? 'Lifted!' : 'Perfect!')
        : hit === 'good' ? (hold ? 'A clean enough lift' : 'Good') : (stride ? 'Stumble' : hold ? 'It slips back' : 'Miss')
      call.className = 'mg-call ' + hit
    }
    const bar = this.el.querySelector('.mg-bar, .mg-strain')
    if (bar) { bar.classList.remove('flash-perfect', 'flash-good', 'flash-miss'); void bar.offsetWidth; bar.classList.add('flash-' + hit) }
    if (this.scene) this.scene.kick(hit)   // a dust puff on the rep
    st.i++
    if (st.i >= st.reps) return this._endTiming()
    if (st.mode === 'beat' || stride) { st.center = 0.2 + st.R() * 0.6; this._placeSeal(); if (stride) this._dueSide() }
  },
  _endTiming() {
    const st = this.st
    st.done = true
    this._stopScene()   // the result card replaces the figure
    const max = st.reps * st.perfectPts
    const pts = st.hits.reduce((a, h) => a + (h === 'perfect' ? st.perfectPts : h === 'good' ? st.goodPts : 0), 0)
    const info = this.gs.minigameInfo()[st.kind] || {}, xp = this.gs.exerciseXp(st.kind, pts)
    const c = this._t(), cut = Math.min(c.cutMax, pts * c.cutPerPoint)
    const tally = `${st.hits.filter(h => h === 'perfect').length} perfect · ${st.hits.filter(h => h === 'good').length} good · ${st.hits.filter(h => h === 'miss').length} missed`
    const canCut = this.gs.minigameInfo().canCut
    const choices = canCut
      ? `<div class="mg-choose">How do you spend it?</div>
         <div class="mg-pick"><button class="mg-btn" data-mg="take-xp">${Icon('shield')} +${this.h.fmt(xp)} body XP</button>
         <button class="mg-btn ghost" data-mg="take-cut">${Icon('age')} Drive on ${this.h.esc(this.gs.minigameInfo().cutTarget)}: ${Math.round(cut * 100)}% sooner</button></div>`
      : `<div class="mg-pick"><button class="mg-btn" data-mg="take-xp">${Icon('shield')} Take +${this.h.fmt(xp)} body XP</button></div>`
    this.el.querySelector('.mg-body').innerHTML = `<div class="mg-result${pts === max ? ' perfect' : ''}">
      <div class="mg-score"><b>${pts}</b> / ${max}</div><div class="mg-tally">${tally}</div>${choices}</div>`
    this.el.querySelector('.mg-foot').innerHTML = ''
  },
  _takeTiming(use) {
    this.gs.finishMinigame(this.st.kind, { hits: this.st.hits, use })
    this.close()   // the engine logged the result
  },

  // ── Meridian Flow (puzzle) ──
  _startFlow(ses) {
    const p = FlowPuzzle.generate(ses.seed, ses.n)
    this.st = { p, turns: Array.isArray(ses.turns) && ses.turns.length === p.n * p.n ? [...ses.turns] : new Array(p.n * p.n).fill(0), done: false, focus: p.source }
    const info = this.gs.minigameInfo().flow
    this._shell('Meridian Flow', `Turn the channels until Qi reaches every acupoint and no channel ends open. No hurry: close it and it waits for you.`,
      `<div class="mg-grid" style="--n:${p.n}" role="grid">${this._cells()}</div>
       <div class="mg-flowmeta"><span class="mg-reach"></span></div>`,
      `<span class="mg-reward">${Icon('qi')} +${this.h.fmt(info.qi)} Qi${info.tired ? ' (tired: the hour’s fourth+ solve)' : ''} when the channels open</span>`)
    this._paintFlow()
  },
  _masks() { const { p, turns } = this.st; return p.shown.map((m, i) => FlowPuzzle.rot(m, turns[i])) },
  _cells() {
    const { p } = this.st
    return p.shown.map((_, i) => `<button class="mg-tile${i === p.source ? ' src' : ''}${p.leaves.includes(i) ? ' leaf' : ''}" data-mg="turn" data-i="${i}" aria-label="Channel ${i + 1}"></button>`).join('')
  },
  // A tile: channels from the centre to each open side; the dantian (source) and acupoints (leaves) as circles
  _tileSvg(mask, i, lit) {
    const { p } = this.st, seg = { 1: 'M50 50V0', 2: 'M50 50H100', 4: 'M50 50V100', 8: 'M50 50H0' }
    const d = [1, 2, 4, 8].filter(b => mask & b).map(b => seg[b]).join(' ')
    const node = i === p.source ? '<circle cx="50" cy="50" r="17" class="dan"/>' : p.leaves.includes(i) ? '<circle cx="50" cy="50" r="11" class="acu"/>' : '<circle cx="50" cy="50" r="7" class="knot"/>'
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" class="ch${lit ? ' lit' : ''}"/>${node}</svg>`
  },
  _paintFlow() {
    const masks = this._masks(), { p } = this.st, lit = FlowPuzzle.reached(masks, p.n, p.source)
    this.el.querySelectorAll('.mg-tile').forEach(b => { const i = +b.dataset.i; b.innerHTML = this._tileSvg(masks[i], i, lit.has(i)); b.classList.toggle('lit', lit.has(i)) })
    const acu = p.leaves.filter(i => lit.has(i)).length
    const r = this.el.querySelector('.mg-reach'); if (r) r.textContent = `${acu} of ${p.leaves.length} acupoints reached`
    if (FlowPuzzle.isSolved(masks, p.n, p.source)) this._endFlow()
  },
  _turn(i) {
    if (!this.st || this.st.done) return
    this.st.turns[i] = (this.st.turns[i] + 1) % 4
    this._paintFlow()
  },
  _endFlow() {
    this.st.done = true
    this.el.querySelector('.mg-grid')?.classList.add('solved')
    const r = this.gs.finishMinigame('flow', { rotations: this.st.turns })
    const foot = this.el.querySelector('.mg-foot')
    foot.innerHTML = r.solved
      ? `<span class="mg-done">${Icon('qi')} The channels open: +${this.h.fmt(r.qi)} Qi.</span><button class="mg-btn" data-mg="close">Done</button>`
      : `<span class="mg-done">The Qi stalls.</span><button class="mg-btn" data-mg="close">Done</button>`
    foot.querySelector('button')?.focus()
  },

  // ── Memorization (the Acupoint Sequence, Phase 52d) ──
  // A 3×3 grid lights a seeded order per round; the player taps it back. A wrong tap ends the run but keeps every round
  // already cleared. No clock; the engine re-derives the sequences from the session seed and counts the rounds held.
  _startMemory(ses) {
    const plan = MemoryPuzzle.generate(ses.seed, ses.lens)
    const grid = (typeof MEMORY !== 'undefined' ? MEMORY.grid : 9), n = plan.length
    this.st = { plan, round: 0, pos: 0, answers: plan.map(() => []), watching: true, done: false, timers: [] }
    const info = this.gs.minigameInfo().memory || {}
    this._shell('Memorization', `Watch the acupoints light, then repeat the order. ${n} round${n > 1 ? 's' : ''} — the sequence grows as your realm deepens.`,
      `<div class="mg-acu" role="grid">${Array.from({ length: grid }, (_, i) => `<button class="mg-acu-t" data-mg="acu" data-i="${i}" aria-label="Acupoint ${i + 1}"></button>`).join('')}</div>
       <div class="mg-call" aria-live="polite">&nbsp;</div>`,
      `<span class="mg-reward">${Icon('qi')} +${this.h.fmt(info.qi || 0)} Qi for a full sequence${info.tired ? ' (tired: the hour’s third+ clear)' : ''}</span>`)
    this._memoryRound()
  },
  _memoryRound() {
    const st = this.st; if (!st || st.done) return
    const seq = st.plan[st.round]
    st.watching = true; st.pos = 0; st.answers[st.round] = []
    const call = this.el.querySelector('.mg-call')
    if (call) { call.textContent = `Round ${st.round + 1} of ${st.plan.length} — watch`; call.className = 'mg-call' }
    this.el.querySelector('.mg-acu')?.classList.add('watching')   // dim + block the board while the order plays
    this._acuLit(-1)
    const step = MEMORY.gapMs + MEMORY.paceMs
    seq.forEach((c, i) => {
      st.timers.push(setTimeout(() => this._acuLit(c), i * step + MEMORY.gapMs))
      st.timers.push(setTimeout(() => this._acuLit(-1), i * step + MEMORY.gapMs + MEMORY.paceMs))
    })
    st.timers.push(setTimeout(() => this._memoryTurn(), seq.length * step + 260))
  },
  _memoryTurn() {
    const st = this.st; if (!st || st.done) return
    st.watching = false; st.pos = 0
    this.el.querySelector('.mg-acu')?.classList.remove('watching')
    const call = this.el.querySelector('.mg-call')
    if (call) { call.textContent = 'Your turn · tap or 1–9'; call.className = 'mg-call' }
  },
  _acuLit(i) { this.el.querySelectorAll('.mg-acu-t').forEach((b, k) => b.classList.toggle('lit', k === i)) },
  _acu(i) {
    const st = this.st; if (!st || st.done || st.breaking || st.watching || i == null) return
    const seq = st.plan[st.round]
    if (i === seq[st.pos]) {
      st.answers[st.round].push(i); st.pos++
      this._acuLit(i); st.timers.push(setTimeout(() => this._acuLit(-1), 150))
      if (st.pos < seq.length) return
      st.round++
      if (st.round >= st.plan.length) return this._endMemory()
      const call = this.el.querySelector('.mg-call')
      if (call) { call.textContent = 'Held — next'; call.className = 'mg-call perfect' }
      st.timers.push(setTimeout(() => this._memoryRound(), 740))
    } else {
      // A miss: show the wrong tap and the acupoint that was due, then resolve (the rounds you held still pay)
      st.breaking = true
      st.answers[st.round].push(i)   // keep the wrong tap so the engine sees the miss
      this._acuLit(-1)
      const tiles = this.el.querySelectorAll('.mg-acu-t')
      tiles[i]?.classList.add('miss')
      tiles[seq[st.pos]]?.classList.add('due-hint')
      const call = this.el.querySelector('.mg-call')
      if (call) { call.textContent = 'The order breaks'; call.className = 'mg-call miss' }
      st.timers.push(setTimeout(() => this._endMemory(), 1200))
    }
  },
  _endMemory() {
    const st = this.st; if (!st) return
    st.done = true; this._clearTimers(); this._acuLit(-1)
    const r = this.gs.finishMinigame('memory', { answers: st.answers })
    const done = r.completed || 0, total = r.total || st.plan.length
    // The result card leads with the score: the how-to sub becomes the tally.
    const sub = this.el.querySelector('.mg-sub')
    if (sub) sub.textContent = r.perfect ? 'Every sequence held.' : done ? `${done} of ${total} sequences held.` : 'The order slipped away.'
    this.el.querySelector('.mg-body').innerHTML = `<div class="mg-result${r.perfect ? ' perfect' : ''}">
      <div class="mg-score"><b>${done}</b> / ${total}</div>
      <div class="mg-pick"><button class="mg-btn" data-mg="close">${r.qi > 0 ? `Take +${this.h.fmt(r.qi)} Qi` : 'Done'}</button></div></div>`
    this.el.querySelector('.mg-foot').innerHTML = ''
  },

  // ✕ / Esc: a timing game gives up (nothing lost); a Flow puzzle is set aside with your turns and waits (no clock);
  // a Memorization run is simply abandoned (its sequence is timing-sensitive — it does not wait).
  _quit() {
    if (this.st && !this.st.done) {
      if (this.kind === 'flow') { this.gs.finishMinigame('flow', { setAside: true, turns: this.st.turns }); this.h.flash('The puzzle waits for you, as you left it', 'neutral') }
      else this.gs.finishMinigame(this.kind, { abandon: true })
    }
    this.close()
  },

  // ── input ──
  _click(e) {
    const b = e.target.closest('[data-mg]')
    if (!b) return
    const a = b.dataset.mg
    if (a === 'strike') { if (performance.now() - (this._ptrAt || -1e9) > 700) this._strike(e.timeStamp) }   // already struck on pointerdown
    else if (a === 'step') { if (performance.now() - (this._ptrAt || -1e9) > 700) this._stride(b.dataset.side, e.timeStamp) }
    else if (a === 'lift') { /* handled on pointerdown / pointerup */ }
    else if (a === 'turn') this._turn(+b.dataset.i)
    else if (a === 'acu') this._acu(+b.dataset.i)
    else if (a === 'take-xp') this._takeTiming('xp')
    else if (a === 'take-cut') this._takeTiming('cut')
    else if (a === 'close') this.close()
    else if (a === 'quit') this._quit()
  },
  _pointerDown(e) {
    if (this.family !== 'timing' || !this.st || this.st.done || e.button > 0) return
    const t = e.target.closest('[data-mg]'); if (!t) return
    const a = t.dataset.mg
    if (a === 'strike') { this._ptrAt = performance.now(); this._strike(e.timeStamp) }
    else if (a === 'step') { this._ptrAt = performance.now(); this._stride(t.dataset.side, e.timeStamp) }
    else if (a === 'lift') { this._ptrAt = performance.now(); this._holdDown() }
  },
  _pointerUp() { if (this.st?.mode === 'hold' && this.st.holding) this._holdUp() },
  _key(e) {
    if (!this.kind || !this.el || this.el.classList.contains('hidden')) return
    if (e.type === 'keyup') { if (this.st?.mode === 'hold' && e.key === ' ' && this.st.holding) { e.preventDefault(); this._holdUp() } return }
    if (e.key === 'Escape') { e.preventDefault(); this._quit(); return }
    if (this.family === 'timing' && this.st && !this.st.done) {
      if (this.st.mode === 'hold') { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); this._holdDown() } return }
      if (this.st.mode === 'stride') { const s = e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ? 'L' : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ? 'R' : null; if (s && !e.repeat) { e.preventDefault(); this._stride(s, e.timeStamp) } return }
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); this._strike(e.timeStamp); return }
    }
    if (this.kind === 'memory' && this.st && !this.st.done) {
      const k = +e.key
      if (k >= 1 && k <= (typeof MEMORY !== 'undefined' ? MEMORY.grid : 9)) { e.preventDefault(); this._acu(k - 1) }
      return
    }
    if (this.family === 'puzzle' && this.st && !this.st.done) {
      const n = this.st.p.n, f = this.st.focus
      const mv = { ArrowLeft: f % n ? -1 : 0, ArrowRight: f % n < n - 1 ? 1 : 0, ArrowUp: f >= n ? -n : 0, ArrowDown: f < n * (n - 1) ? n : 0 }[e.key]
      if (mv !== undefined) { e.preventDefault(); this.st.focus = f + mv; this.el.querySelector(`.mg-tile[data-i="${this.st.focus}"]`)?.focus() }
    }
  },
}
