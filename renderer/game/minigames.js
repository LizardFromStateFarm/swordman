// Phase 14 mini-games (docs/systems/body-constitution.md → "Mini-games"). Two optional, charge-limited games:
//  · Tempering Strikes (body XP): a marker sweeps a brush bar; strike when it crosses the gold seal. 6 strikes.
//  · Meridian Flow (Qi): rotate meridian tiles so every channel joins the dantian with no open ends (a "net" puzzle).
// FlowPuzzle is DOM-free and deterministic (seeded) so the ENGINE can re-generate a puzzle and verify a solution
// (game-state.js finishMinigame) — the UI never writes a reward. MinigameUI is the overlay (DOM only inside methods,
// so the sim loader can load this file). Rewards, charges and validation live in game-state.js.

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

// ── The overlay ── h: { esc, flash, fmtTime, fmt }
const MinigameUI = {
  el: null, gs: null, h: null, kind: null, st: null, raf: 0,

  open(kind, gs, h) {
    this.gs = gs; this.h = h
    const r = gs.startMinigame(kind)
    if (!r.ok) { h.flash(r.reason === 'charges' ? 'No charges left. One returns every 30 minutes.' : 'Not now.', 'negative'); return }
    this.kind = kind
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.id = 'mg-overlay'
      this.el.className = 'mg-overlay hidden'
      this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true')
      document.body.appendChild(this.el)
      this.el.addEventListener('click', e => this._click(e))
      // Strikes score on pointerdown, at the event's own time: a touch 'click' only fires on finger-up, 80-150 ms
      // late, which pushed every on-the-seal tap past the perfect window on phones (v1 mobile fix 2026-10-05)
      this.el.addEventListener('pointerdown', e => this._pointerDown(e))
      document.addEventListener('keydown', e => this._key(e))
    }
    this.el.classList.remove('hidden')
    if (kind === 'strikes') this._startStrikes(r.session)
    else this._startFlow(r.session)
  },
  close() {
    cancelAnimationFrame(this.raf); this.raf = 0
    if (this.el) { this.el.classList.add('hidden'); this.el.innerHTML = '' }
    this.kind = null; this.st = null
  },
  _reduced() { const s = this.gs.get()?.settings; return !!s?.reducedMotion },
  _shell(title, sub, body, foot) {
    this.el.innerHTML = `<div class="mg-card mg-${this.kind}">
      <div class="mg-head"><span class="mg-glyph">${Icon(this.kind === 'strikes' ? 'duel' : 'vein')}</span>
        <div class="mg-titles"><div class="mg-title">${title}</div><div class="mg-sub">${sub}</div></div>
        <button class="mg-x" data-mg="quit" title="${this.kind === 'flow' ? 'Set it aside: the puzzle waits for you, as you left it' : 'Give up (the charge is spent)'}" aria-label="${this.kind === 'flow' ? 'Set aside' : 'Give up'}">${Icon('close')}</button></div>
      <div class="mg-body">${body}</div><div class="mg-foot">${foot}</div></div>`
  },

  // ── Tempering Strikes ──
  _startStrikes(ses) {
    const S = STRIKES, relax = ses.relaxed ? S.relaxedMult : 1
    const R = FlowPuzzle.rng(ses.seed)
    this.st = { i: 0, hits: [], t0: performance.now(), relax, R, center: 0.25 + R() * 0.5, done: false, flashUntil: 0, last: null }
    const reduced = this._reduced()
    this._shell('Tempering Strikes', `Strike when the marker crosses the gold seal. ${S.strikes} strikes; the seal narrows each time.`,
      `<div class="mg-bar${reduced ? ' calm' : ''}" data-mg="strike">
         <div class="mg-seal"><i class="mg-perfect"></i></div><div class="mg-marker"></div></div>
       <div class="mg-pips">${Array.from({ length: S.strikes }, () => '<i></i>').join('')}</div>
       <div class="mg-call" aria-live="polite">&nbsp;</div>`,
      `<button class="mg-btn mg-strike" data-mg="strike">Strike <kbd>Space</kbd></button>`)
    this._placeSeal()
    const loop = now => { this._drawStrikes(now); if (this.kind === 'strikes' && !this.st?.done) this.raf = requestAnimationFrame(loop) }
    this.raf = requestAnimationFrame(loop)
  },
  _sealW() { const S = STRIKES; return Math.max(S.sealMin, S.seal - S.sealShrink * this.st.i) * this.st.relax },
  _placeSeal() {
    const w = this._sealW(), seal = this.el.querySelector('.mg-seal')
    if (!seal) return
    seal.style.left = ((this.st.center - w / 2) * 100) + '%'; seal.style.width = (w * 100) + '%'
    seal.querySelector('.mg-perfect').style.width = (STRIKES.perfectFrac * 100) + '%'
  },
  // Ping-pong position 0..1 across the bar
  _pos(now) { const T = STRIKES.sweepMs, k = ((now - this.st.t0) % (2 * T)) / T; return k <= 1 ? k : 2 - k },
  _drawStrikes(now) {
    const p = this._pos(now), mk = this.el.querySelector('.mg-marker'), bar = this.el.querySelector('.mg-bar')
    if (!mk) return
    mk.style.left = (p * 100) + '%'
    // Reduced motion: the marker is hidden; the seal brightens as the moment nears (same timing window)
    if (bar.classList.contains('calm')) {
      const w = this._sealW(), d = Math.abs(p - this.st.center)
      bar.style.setProperty('--near', Math.max(0, 1 - d / (w * 1.5)).toFixed(2))
    }
  },
  // at — the moment of the strike (an input event's timeStamp, same clock as performance.now()); defaults to now
  _strike(at) {
    const st = this.st
    if (!st || st.done) return
    const now = performance.now(), t = at > 0 && at <= now && now - at < 500 ? at : now
    const p = this._pos(t), w = this._sealW(), d = Math.abs(p - st.center)
    const hit = d <= w * STRIKES.perfectFrac / 2 ? 'perfect' : d <= w / 2 ? 'good' : 'miss'
    st.hits.push(hit)
    const pip = this.el.querySelectorAll('.mg-pips i')[st.i]
    if (pip) pip.className = hit
    const call = this.el.querySelector('.mg-call')
    call.textContent = hit === 'perfect' ? 'Perfect!' : hit === 'good' ? 'Good' : 'Miss'
    call.className = 'mg-call ' + hit
    const bar = this.el.querySelector('.mg-bar')
    bar.classList.remove('flash-perfect', 'flash-good', 'flash-miss'); void bar.offsetWidth; bar.classList.add('flash-' + hit)
    st.i++
    if (st.i >= STRIKES.strikes) return this._endStrikes()
    st.center = 0.2 + st.R() * 0.6
    this._placeSeal()
  },
  _endStrikes() {
    const st = this.st, S = STRIKES
    st.done = true
    const pts = st.hits.reduce((a, h) => a + (h === 'perfect' ? S.perfect : h === 'good' ? S.good : 0), 0), max = S.strikes * S.perfect
    const info = this.gs.minigameInfo().strikes, xp = this.gs.strikesXp(pts), cut = Math.min(S.cutMax, pts * S.cutPerPoint)
    const tally = `${st.hits.filter(h => h === 'perfect').length} perfect · ${st.hits.filter(h => h === 'good').length} good · ${st.hits.filter(h => h === 'miss').length} missed`
    const choices = info.canCut
      ? `<div class="mg-choose">How do you spend it?</div>
         <div class="mg-pick"><button class="mg-btn" data-mg="take-xp">${Icon('shield')} +${this.h.fmt(xp)} body XP</button>
         <button class="mg-btn ghost" data-mg="take-cut">${Icon('age')} Drive on ${this.h.esc(info.cutTarget)}: ${Math.round(cut * 100)}% sooner</button></div>`
      : `<div class="mg-pick"><button class="mg-btn" data-mg="take-xp">${Icon('shield')} Take +${this.h.fmt(xp)} body XP</button></div>`
    this.el.querySelector('.mg-body').innerHTML = `<div class="mg-result${pts === max ? ' perfect' : ''}">
      <div class="mg-score"><b>${pts}</b> / ${max}</div><div class="mg-tally">${tally}</div>${choices}</div>`
    this.el.querySelector('.mg-foot').innerHTML = ''
  },
  _takeStrikes(use) {
    const st = this.st
    const r = this.gs.finishMinigame('strikes', { hits: st.hits, use })
    this.close()   // the engine logged the result
  },

  // ── Meridian Flow ──
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

  // ✕ / Esc: Strikes gives up (the charge is spent); Flow is set aside with your turns and waits (no clock)
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
    else if (a === 'turn') this._turn(+b.dataset.i)
    else if (a === 'take-xp') this._takeStrikes('xp')
    else if (a === 'take-cut') this._takeStrikes('cut')
    else if (a === 'close') this.close()
    else if (a === 'quit') this._quit()
  },
  _pointerDown(e) {
    if (this.kind !== 'strikes' || !this.st || this.st.done || e.button > 0) return
    if (!e.target.closest('[data-mg="strike"]')) return
    this._ptrAt = performance.now()
    this._strike(e.timeStamp)
  },
  _key(e) {
    if (!this.kind || !this.el || this.el.classList.contains('hidden')) return
    if (e.key === 'Escape') { e.preventDefault(); this._quit(); return }
    if (this.kind === 'strikes' && (e.key === ' ' || e.key === 'Enter') && !this.st?.done) { e.preventDefault(); if (!e.repeat) this._strike(e.timeStamp); return }
    if (this.kind === 'flow' && this.st && !this.st.done) {
      const n = this.st.p.n, f = this.st.focus
      const mv = { ArrowLeft: f % n ? -1 : 0, ArrowRight: f % n < n - 1 ? 1 : 0, ArrowUp: f >= n ? -n : 0, ArrowDown: f < n * (n - 1) ? n : 0 }[e.key]
      if (mv !== undefined) { e.preventDefault(); this.st.focus = f + mv; this.el.querySelector(`.mg-tile[data-i="${this.st.focus}"]`)?.focus() }
    }
  },
}
