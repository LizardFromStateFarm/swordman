// ExerciseScene — the practice mini-games' animated figure (Phase 52b/52c; re-rigged 2026-10-11, docs/systems/minigames.md).
// The baked INK_ART has no rig, so the exercises draw a purpose-built side-view cultivator on its own small canvas:
//  · a bone RIG (EXERCISE_BODY lengths) posed from data (EXERCISE_POSES): keyframes along the press with two-bone IK
//    for planted hands + feet (Push-Ups · Lift), or a gait CYCLE for Running (FK tables, the hip grounded on the lowest
//    foot, a short flight, the ground sliding under the planted foot);
//  · a SILHOUETTE: the body is filled as volumes (a chest that tapers to the waist, shoulders, thighs, calves, hands,
//    a head with a topknot, a tunic hem) into a small mask canvas — one colour channel per depth layer (far limbs ·
//    body · near arm) — and the mask is then inked as a hex grid of dots: a lit rim on the up-left edge, a cool
//    stage-coloured back-light on the down-right, an occlusion line where the near arm crosses the body;
//  · SECONDARY MOTION: the sash tails, the hair ribbon and the tunic hem are little verlet chains (gravity + wind +
//    the body's own motion), so cloth trails the run and hangs in the plank.
// MinigameUI maps each game's progress onto setPress() every frame (Running turns the ping-pong into stride phase);
// a landed rep calls kick() — dust at the foot or the load, a colour pulse + rising motes on a clean rep, a slump on
// a miss. Lift draws the body tier's LIFT_ITEMS load in the hands (squat → chest → overhead).
// Reduced motion: no rAF loop; the figure only redraws when the game moves it. Test hooks: freeze(p) holds a press (or
// a stride phase for Running); perf(n) = ms per frame.
// Used by renderer/game/minigames.js (MinigameUI).

const EX_D2R = Math.PI / 180
const exDown = a => [Math.sin(a * EX_D2R), Math.cos(a * EX_D2R)]     // a limb angle: 0 = straight down, + = forward
const exUp = a => [Math.sin(a * EX_D2R), -Math.cos(a * EX_D2R)]      // a torso/head angle: 0 = straight up, + = forward
const exAdd = (p, v, s = 1) => [p[0] + v[0] * s, p[1] + v[1] * s]
const exLerp = (a, b, t) => a + (b - a) * t
const exLerp2 = (a, b, t) => [exLerp(a[0], b[0], t), exLerp(a[1], b[1], t)]
// Sample a [phase, ...values] table at a phase (wrapping 0..1), smoothly between rows
function exTable(rows, ph) {
  ph = ((ph % 1) + 1) % 1
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1]
    if (ph >= a[0] && ph <= b[0]) {
      const u = (ph - a[0]) / Math.max(1e-6, b[0] - a[0]), e = u * u * (3 - 2 * u)
      return a.slice(1).map((v, j) => exLerp(v, b[j + 1], e))
    }
  }
  return rows[0].slice(1)
}
// Two-bone IK: from root toward target with bone lengths l1, l2; the joint bends toward `hint`. Returns [joint, end].
function exIK(root, target, l1, l2, hint) {
  const dx = target[0] - root[0], dy = target[1] - root[1]
  const d0 = Math.hypot(dx, dy) || 1e-6
  const d = Math.max(Math.abs(l1 - l2) + 1e-4, Math.min(l1 + l2 - 1e-4, d0))
  const base = Math.atan2(dy, dx), c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const a = Math.acos(Math.max(-1, Math.min(1, c)))
  const j1 = [root[0] + Math.cos(base + a) * l1, root[1] + Math.sin(base + a) * l1]
  const j2 = [root[0] + Math.cos(base - a) * l1, root[1] + Math.sin(base - a) * l1]
  const h = hint || [0, 1]
  const joint = (j1[0] - root[0]) * h[0] + (j1[1] - root[1]) * h[1] >= (j2[0] - root[0]) * h[0] + (j2[1] - root[1]) * h[1] ? j1 : j2
  const end = [root[0] + dx / d0 * d, root[1] + dy / d0 * d]
  return [joint, end]
}

class ExerciseScene {
  constructor(canvas) {
    this.cv = canvas
    this.ctx = canvas.getContext('2d')
    this.ex = 'pushups'
    this.color = '#87CEEB'
    this.tier = 0                  // stage index (drives the aura rings)
    this.liftTier = 0              // body tier (which LIFT_ITEMS load a Lift draws)
    this.press = 0                 // the game's raw progress 0..1 (marker position / the lift's strain)
    this.shown = 0                 // the press the body shows (eased + springs toward `press`, so it has weight)
    this.phase = 0.05              // Running: the stride phase (0..1 = two steps), advanced by the press's travel
    this.scroll = 0                // Running: how far the ground has slid (figure units)
    this.t = 0
    this.calm = false
    this.running = false
    this.frozen = false
    this.rafId = null
    this.geo = null
    this.puffs = []                // { x, y, t0, q } — dust kicked up on a landed rep
    this.motes = []                // { x, y, t0, s } — Qi motes rising off a clean rep
    this.pulse = 0                 // aura flash on a clean rep, decays each frame
    this.sag = 0                   // a miss: the body slumps for a moment, decays each frame
    this.chains = null             // the cloth (sash tails · ribbon · hem) as verlet chains
    this._mask = null              // offscreen silhouette mask (channel per depth layer) + the accent mask
  }

  get def() { return (typeof EXERCISE_POSES !== 'undefined' && EXERCISE_POSES[this.ex]) || null }
  get B() { return (typeof EXERCISE_BODY !== 'undefined' && EXERCISE_BODY) || { head: 0.058, neck: 0.045, torso: 0.29, upperArm: 0.165, foreArm: 0.15, palm: 0.045, thigh: 0.245, shin: 0.235, ankle: 0.035, foot: 0.095, depth: [0.024, -0.018] } }

  play({ exercise = 'pushups', color = '#87CEEB', tier = 0, liftTier = 0, reducedMotion = false } = {}) {
    this.ex = (typeof EXERCISE_POSES !== 'undefined' && EXERCISE_POSES[exercise]) ? exercise : 'pushups'
    this.color = color || '#87CEEB'
    this._palette()
    this.tier = tier | 0
    this.liftTier = Math.max(0, Math.min(6, liftTier | 0))
    this.calm = !!reducedMotion
    this.press = 0; this.shown = 0; this.phase = 0.05; this.scroll = 0; this.t = 0
    this.puffs = []; this.motes = []; this.pulse = 0; this.sag = 0; this.geo = null; this.chains = null
    if (this.calm) { this._settle(); this._draw(); return }   // reduced motion: no rAF loop
    this.start()
  }

  // The ink palette for the stage colour: a dark body that separates from its own glow, a warm lit rim, a cool
  // stage-coloured back-light, and the sash/ribbon accent.
  _palette() {
    const c = this.color
    const body = inkMix('#191427', c, 0.12), rim = inkMix(c, '#FFF4DC', 0.66)
    const far = inkMix('#120E1E', c, 0.2), farRim = inkMix(c, '#B8B0CC', 0.42)
    const back = inkMix(c, '#FFFFFF', 0.15)
    const acc = inkMix(c, '#F0C860', 0.72), accLit = inkMix(acc, '#FFF6E0', 0.6)
    // shade buckets: [layer][lit level 0..3][backlit 0/1]
    const mk = (base, hi, f = 1) => [0, 1, 2, 3].map(l => [0, 1].map(b => {
      let col = inkMix(base, hi, [0.07, 0.2, 0.38, 0.84][l] * f)
      if (b) col = inkMix(col, back, 0.42)
      return col
    }))
    this.pal = {
      far: mk(far, farRim, 0.4), body: mk(body, rim), near: mk(inkMix(body, '#2A2340', 0.25), rim),
      occl: inkMix('#07050C', c, 0.06), acc: [inkMix(acc, '#3A2A10', 0.25), acc, accLit],
      dust: inkMix('#C8C0E0', c, 0.4), rim, back,
    }
  }

  stop() { this.running = false; if (this.rafId) cancelAnimationFrame(this.rafId); this.rafId = null }

  // press 0–1: MinigameUI calls this each frame from the timing game's progress. Running converts the press's travel
  // into stride phase (a there-and-back of the marker = one full stride = two steps).
  setPress(r) {
    r = Math.max(0, Math.min(1, r))
    if (this.def?.kind === 'cycle' && !this.frozen) {
      const d = Math.abs(r - this.press) * 0.5
      this.phase = (this.phase + d) % 1
      this.scroll += d * (this.def.scroll || 1.7)
    }
    this.press = r
    if (this.calm) { this.shown = this._target(); this._draw() }
  }

  // A landed rep: dust at the foot (running) or the load/hands, a colour pulse + motes on a clean rep, a slump on a miss
  kick(quality = 'good') {
    if (!this.def || !this.geo) return
    const P = this._pose()
    const at = this.ex === 'run' ? this._lowFoot(P) : this.ex === 'lift' ? [P.wrist[0], Math.min(1, P.wrist[1] + 0.2)] : P.palmTip
    this.puffs.push({ x: this._x(at[0]), y: this.ex === 'lift' && quality !== 'miss' ? this.geo.gy : this._y(at[1]), t0: this.t, q: quality })
    this.pulse = quality === 'perfect' ? 1 : quality === 'good' ? 0.55 : 0.15
    if (quality === 'miss') this.sag = 1
    if (quality !== 'miss') {
      const c = this._x((P.hip[0] + P.shoulder[0]) / 2), cy = this._y((P.hip[1] + P.shoulder[1]) / 2)
      const n = quality === 'perfect' ? 12 : 6
      for (let i = 0; i < n; i++) this.motes.push({ x: c + (inkRnd(this.t * 13 + i * 3.7) - 0.5) * this.geo.k * 0.5, y: cy + (inkRnd(this.t * 7 + i * 5.3) - 0.5) * this.geo.k * 0.2, t0: this.t, s: 0.6 + inkRnd(i * 9.1 + this.t) * 0.8 })
    }
  }

  start() {
    if (this.running) return
    this.running = true; this.frozen = false
    let last = performance.now()
    const tick = now => {
      if (!this.running) return
      const dt = Math.min((now - last) / 1000, 0.1); last = now
      if (!this.frozen) this._step(dt)
      this._draw()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  _step(dt) {
    this.t += dt
    this.pulse = Math.max(0, this.pulse - dt * 2.2)
    this.sag = Math.max(0, this.sag - dt * 1.6)
    // the body follows the game with a little weight: a quick spring (a lift drops faster than it rises)
    const tgt = this._target(), k = this.ex === 'lift' ? (tgt < this.shown ? 9 : 7) : 22
    this.shown += (tgt - this.shown) * Math.min(1, dt * k)
    this._cloth(dt)
  }

  // The press the pose reads: Push-Ups dwell at the top and the bottom (a sine ease over the linear marker)
  _target() {
    const p = this.press
    return this.def?.ease === 'sine' ? 0.5 - 0.5 * Math.cos(p * Math.PI) : p
  }

  // ── Test hooks (scripts/smoke/scenarios/body.js) ──
  // freeze(p): hold a press (Push-Ups · Lift) or a stride phase (Running), cloth settled
  freeze(p = 0) {
    this.stop(); this.frozen = true; this.t = 2.4
    if (this.def?.kind === 'cycle') { this.phase = ((p % 1) + 1) % 1; this.scroll = this.phase * (this.def.scroll || 1.7) }
    else { this.press = p; this.shown = this._target() }
    this._settle(); this._draw()
  }
  perf(n = 60) {
    const t0 = performance.now()
    for (let i = 0; i < n; i++) { this.setPress(0.5 - 0.5 * Math.cos(i / n * 6.283)); this._step(1 / 30); this._draw() }
    return (performance.now() - t0) / n
  }

  // ── The pose (figure units) ──
  _pose(sh = this.shown, ph = this.phase) {
    const d = this.def
    if (!d) return null
    return d.kind === 'cycle' ? this._cyclePose(d, ph) : this._keyPose(d, sh)
  }

  _keyPose(d, u) {
    const B = this.B, K = d.keys
    let a = K[0], b = K[K.length - 1], f = 0
    for (let i = 0; i < K.length - 1; i++) if (u >= K[i].at && u <= K[i + 1].at) { a = K[i]; b = K[i + 1]; f = (u - a.at) / Math.max(1e-6, b.at - a.at); break }
    if (u <= K[0].at) { a = b = K[0] } else if (u >= K[K.length - 1].at) { a = b = K[K.length - 1] }
    const e = f * f * (3 - 2 * f)
    let hip = exLerp2(a.hip, b.hip, e)
    let torso = exLerp(a.torso, b.torso, e), head = exLerp(a.head, b.head, e)
    const hand = exLerp2(a.arm.ik, b.arm.ik, e), aHint = exLerp2(a.arm.hint || [0, 1], b.arm.hint || [0, 1], e)
    const ank = exLerp2(a.leg.ik, b.leg.ik, e), lHint = exLerp2(a.leg.hint || [1, 0], b.leg.hint || [1, 0], e)
    // a miss: the plank's belly sags · the lifter's load dips + the back rounds
    if (this.sag > 0) {
      if (this.ex === 'pushups') hip = [hip[0], hip[1] + 0.04 * this.sag]
      else { hip = [hip[0], hip[1] + 0.02 * this.sag]; torso += 10 * this.sag }
    }
    // strain: a tremble through the upper body near the top of a lift / the bottom of a push-up
    const strain = this.ex === 'lift' ? Math.max(0, u - 0.55) * 2.2 : Math.max(0, u - 0.7) * 2
    const tr = this.calm || this.frozen ? 0 : Math.sin(this.t * 47) * 0.0045 * strain
    const breath = this.calm ? 0 : Math.sin(this.t * 2.1) * 0.6
    torso += breath * 0.5
    const P = { hip, torso, head }
    const tU = exUp(torso)
    P.shoulder = exAdd(hip, tU, B.torso)
    P.shoulder = [P.shoulder[0] + tr, P.shoulder[1]]
    this._headAt(P, head)
    const handT = [hand[0] + tr * 0.4, hand[1]]
    ;[P.elbow, P.wrist] = exIK(P.shoulder, handT, B.upperArm, B.foreArm, aHint)
    P.palmTip = exAdd(P.wrist, a.arm.palm != null ? exDown(a.arm.palm) : this._dir(P.elbow, P.wrist), B.palm)
    ;[P.knee, P.ankle] = exIK(hip, ank, B.thigh, B.shin, lHint)
    this._foot(P, a.leg, '')
    // the far side: offset by the depth (its own foot target when the stance is split)
    const D = B.depth
    P.shoulder2 = exAdd(P.shoulder, D); P.hip2 = exAdd(hip, D)
    ;[P.elbow2, P.wrist2] = exIK(P.shoulder2, exAdd(exAdd(handT, D), d.far?.arm || [0, 0]), B.upperArm, B.foreArm, aHint)
    P.palmTip2 = exAdd(P.wrist2, a.arm.palm != null ? exDown(a.arm.palm) : this._dir(P.elbow2, P.wrist2), B.palm)
    const ank2 = d.far?.leg ? d.far.leg : exAdd(ank, D)
    ;[P.knee2, P.ankle2] = exIK(P.hip2, ank2, B.thigh, B.shin, lHint)
    this._foot(P, d.far?.leg ? { flat: true } : a.leg, '2', D)
    return P
  }

  _cyclePose(d, ph) {
    const B = this.B
    const leg = p => {
      const [th, kn] = exTable(d.leg, p), [pf] = exTable(d.foot, p)
      const knee = exAdd([0, 0], exDown(th), B.thigh)
      const shinA = th - kn, ankle = exAdd(knee, exDown(shinA), B.shin)
      const fa = shinA + 90 - pf, fd = exDown(fa)
      const heel = exAdd(ankle, fd, -0.025), toe = exAdd(ankle, fd, B.foot)
      return { knee, ankle, heel, toe }
    }
    const n = leg(ph), f = leg(ph + 0.5)
    const low = q => Math.max(q.heel[1], q.toe[1], q.ankle[1] + B.ankle * 0.6)
    // ground the hip on the lowest foot, then lift it in the two flight windows
    const st = d.stance || [0, 0.32], fl = d.flight || 0
    const air = (p0) => { const w = 0.5 - (st[1] - st[0]); const u = (((ph - p0) % 0.5) + 0.5) % 0.5; return u < w ? Math.sin(Math.PI * u / w) : 0 }
    const lift = fl * air(st[1])
    let hipY = 1 - Math.max(low(n), low(f)) - lift
    let torso = d.torso + Math.sin(ph * 4 * Math.PI) * 2 + 10 * this.sag
    const hip = [0, hipY + 0.012 * this.sag]
    const P = { hip, torso, head: d.head }
    const tU = exUp(torso)
    P.shoulder = exAdd(hip, tU, B.torso)
    this._headAt(P, d.head - 4 * this.sag)
    const put = (q, sfx, off) => {
      P['knee' + sfx] = exAdd(exAdd(q.knee, hip), off); P['ankle' + sfx] = exAdd(exAdd(q.ankle, hip), off)
      P['heel' + sfx] = exAdd(exAdd(q.heel, hip), off); P['toe' + sfx] = exAdd(exAdd(q.toe, hip), off)
    }
    const D = B.depth
    put(n, '', [0, 0]); put(f, '2', [D[0] * 0.5, D[1] * 0.5])
    P.hip2 = exAdd(hip, [D[0] * 0.5, D[1] * 0.5]); P.shoulder2 = exAdd(P.shoulder, D)
    const arm = (p, sh, sfx) => {
      const [ua, eb] = exTable(d.arm, p)
      const el = exAdd(sh, exDown(ua + torso * 0.35), B.upperArm), fa = exDown(ua + torso * 0.35 + eb)
      const wr = exAdd(el, fa, B.foreArm)
      P['elbow' + sfx] = el; P['wrist' + sfx] = wr; P['palmTip' + sfx] = exAdd(wr, fa, B.palm * 0.55)   // a loose fist
    }
    arm(ph, P.shoulder, ''); arm(ph + 0.5, P.shoulder2, '2')
    return P
  }

  _dir(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l] }
  _headAt(P, head) {
    const B = this.B, hU = exUp(head)
    const nb = exAdd(P.shoulder, exUp(P.torso), 0.012)
    P.neck = exAdd(nb, hU, B.neck)
    P.headC = exAdd(P.neck, hU, B.head * 0.82)
    P.headU = hU
  }
  // The foot: a planted toe (Push-Ups) · flat on the ground (Lift) · else along the shin
  _foot(P, legDef, sfx, off = [0, 0]) {
    const B = this.B, ank = P['ankle' + sfx]
    if (legDef?.toe) {
      const toe = exAdd(legDef.toe, off), d = this._dir(ank, toe)
      P['toe' + sfx] = toe; P['heel' + sfx] = exAdd(ank, d, -0.03)
    } else {
      const y = 1 - 0.006
      P['heel' + sfx] = [ank[0] - 0.03, y]; P['toe' + sfx] = [ank[0] + B.foot * 0.9, y]
    }
  }
  _lowFoot(P) { return P.toe[1] >= P.toe2[1] ? P.toe : P.toe2 }

  // ── Cloth: the sash tails, the hair ribbon, the tunic hem ──
  _anchors(P) {
    const B = this.B, back = [-Math.cos(P.torso * EX_D2R), -Math.sin(P.torso * EX_D2R)]   // behind the body
    const waist = exAdd(P.hip, exUp(P.torso), B.torso * 0.3)
    const hU = P.headU, hF = [-hU[1], hU[0]]
    const bun = exAdd(exAdd(P.headC, hU, B.head * 0.78), hF, -B.head * 0.62)
    return { sash: exAdd(waist, back, 0.05), ribbon: bun, hem: exAdd(P.hip, back, 0.02), back }
  }
  _settle() {
    this.chains = null
    for (let i = 0; i < 90; i++) this._cloth(1 / 60, true)
  }
  _cloth(dt, settling = false) {
    const P = this._pose()
    if (!P) return
    const A = this._anchors(P), w = this.def.wind || [0, 0]
    const spec = { sash: [5, 0.034, 1.0], sash2: [4, 0.03, 1.0], ribbon: [5, 0.026, 0.8], hem: [3, 0.042, 0.6] }
    if (!this.chains) {
      this.chains = {}
      for (const id of Object.keys(spec)) {
        const [n, seg] = spec[id], a = A[id === 'sash2' ? 'sash' : id]
        this.chains[id] = Array.from({ length: n + 1 }, (_, i) => ({ p: [a[0], a[1] + i * seg], q: [a[0], a[1] + i * seg] }))
      }
    }
    const h = Math.min(dt, 1 / 30)
    const gust = settling || this.calm ? 0 : Math.sin(this.t * 3.1) * 0.35 + Math.sin(this.t * 7.3) * 0.15
    for (const id of Object.keys(spec)) {
      const [, seg, lw] = spec[id], ch = this.chains[id]
      const anchor = A[id === 'sash2' ? 'sash' : id]
      ch[0].p = anchor.slice(); ch[0].q = anchor.slice()
      const windX = (w[0] * (id === 'sash2' ? 0.8 : 1) + (w[0] ? gust * 0.4 : gust * 0.12)) * lw
      const windY = (w[1] || 0) * lw
      for (let i = 1; i < ch.length; i++) {
        const n = ch[i], vx = (n.p[0] - n.q[0]) * 0.9, vy = (n.p[1] - n.q[1]) * 0.9
        n.q = n.p.slice()
        // the hem hangs off the back of the hip (a stiff-ish cloth): pull it toward the thigh line
        let sx = 0, sy = 0
        if (id === 'hem') { const k = this._dir(P.hip, P.knee); sx = (k[0] - (n.p[0] - ch[i - 1].p[0]) / seg) * 6; sy = (k[1] - (n.p[1] - ch[i - 1].p[1]) / seg) * 6 }
        n.p = [n.p[0] + vx + (windX + sx + A.back[0] * 0.3) * h * h * 4, n.p[1] + vy + (2.6 + windY + sy) * h * h * 4]
      }
      for (let it = 0; it < 3; it++) for (let i = 1; i < ch.length; i++) {
        const a = ch[i - 1].p, b = ch[i].p, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-6
        const m = (l - seg) / l
        if (i === 1) { b[0] -= dx * m; b[1] -= dy * m } else { a[0] += dx * m * 0.5; a[1] += dy * m * 0.5; b[0] -= dx * m * 0.5; b[1] -= dy * m * 0.5 }
        if (b[1] > 0.995) b[1] = 0.995   // cloth rests on the ground
      }
    }
  }

  // ── Geometry ──
  // Fit the figure to the panel from the pose set's sampled extent (+ the load), so a push-up spread, a runner and an
  // overhead lift each fill the canvas, centred, with the ground near the bottom.
  _bounds(uMax = 1) {
    const d = this.def
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    for (let i = 0; i <= 20; i++) {
      const u = i / 20 * uMax, P = d.kind === 'cycle' ? this._pose(0, u) : this._pose(u, 0)
      for (const k of Object.keys(P)) if (k !== "headU" && Array.isArray(P[k]) && P[k].length === 2) add(P[k][0], P[k][1])
      add(P.headC[0], P.headC[1] - this.B.head * 1.6)
      if (d.prop === 'lift') { const L = this._loadRect(P); add(L.x - L.w / 2, L.y - L.h / 2); add(L.x + L.w / 2, L.y + L.h / 2) }
    }
    if (d.kind === 'cycle') { x0 -= 0.16; x1 += 0.04 }      // room for the trailing sash
    else { x0 -= 0.06; x1 += 0.05 }
    y0 -= 0.04; y1 = Math.max(y1, 1)
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, mx: (x0 + x1) / 2, my: (y0 + y1) / 2 }
  }
  _layout() {
    const W = Math.max(1, this.cv.clientWidth || 360), H = Math.max(1, this.cv.clientHeight || 160)
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const g0 = this.geo
    if (g0 && g0.W === W && g0.H === H && g0.dpr === dpr && g0.ex === this.ex && g0.lt === this.liftTier) return g0
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr)
    const pad = 8
    const frame = b => {
      const k = Math.min((W - pad * 2) / Math.max(0.2, b.w), (H - pad * 2) / Math.max(0.2, b.h), H * 1.45)
      const gy = H / 2 + (1 - b.my) * k + Math.max(0, (H - pad * 2 - b.h * k) / 2) * 0.55
      return { k, cx: W / 2 - b.mx * k, gy: Math.min(H - 4, gy) }
    }
    const all = frame(this._bounds())
    const g = { W, H, dpr, ex: this.ex, lt: this.liftTier, ...all, all }
    // Lift: the camera starts close on the squat and pulls back as the load rises (it reveals the load overhead)
    if (this.def.prop === 'lift') g.near = frame(this._bounds(0.25))
    // the silhouette mask, at CSS-pixel resolution (one channel per depth layer) + the accent mask
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c }
    this._mask = { body: mk(), acc: mk() }
    this._mask.bx = this._mask.body.getContext('2d', { willReadFrequently: true })
    this._mask.ax = this._mask.acc.getContext('2d', { willReadFrequently: true })
    this.geo = g
    return g
  }
  _x(x) { const g = this.geo; return g.cx + x * g.k }
  _y(y) { const g = this.geo; return g.gy - (1 - y) * g.k }
  _s(p) { return [this._x(p[0]), this._y(p[1])] }

  // ── Frame ──
  _draw() {
    const ctx = this.ctx
    if (!this.def) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height); return }
    const g = this._layout()
    if (g.near) {
      const u = Math.max(0, Math.min(1, (this.shown - 0.08) / 0.62)), e = u * u * (3 - 2 * u)
      g.k = exLerp(g.near.k, g.all.k, e); g.cx = exLerp(g.near.cx, g.all.cx, e); g.gy = exLerp(g.near.gy, g.all.gy, e)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.cv.width, this.cv.height)
    // a heavy lift shakes the frame a hair
    const shake = this.ex === 'lift' && !this.calm && !this.frozen ? Math.max(0, this.shown - 0.6) * 2.4 * Math.sin(this.t * 53) * 0.7 : 0
    ctx.setTransform(g.dpr, 0, 0, g.dpr, shake * g.dpr, 0)
    const P = this._pose()
    if (!this.chains) this._settle()
    this._glow(ctx, g, P)
    this._ground(ctx, g, P)
    this._aura(ctx, g, P)
    this._shadow(ctx, g, P)
    this._silhouette(P)
    const dots = this._ink(g)
    this._fill(ctx, dots.far)
    if (this.def.prop === 'lift') this._prop(ctx, g, P)
    this._fill(ctx, dots.back)
    this._fill(ctx, dots.front)
    this._puffDraw(ctx, g)
    this._moteDraw(ctx, g)
  }

  // A soft pool of the stage colour behind the figure, so the dark silhouette reads
  _glow(ctx, g, P) {
    const cx = this._x((P.hip[0] + P.shoulder[0]) / 2), cy = this._y((P.hip[1] + P.shoulder[1]) / 2)
    const r = g.k * 0.75
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gr.addColorStop(0, inkRgba(this.color, 0.2 + 0.18 * this.pulse))
    gr.addColorStop(0.55, inkRgba(this.color, 0.06 + 0.08 * this.pulse))
    gr.addColorStop(1, inkRgba(this.color, 0))
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = gr; ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.restore()
  }

  // A dotted ground line across the panel, fading at the ends; Running slides it under the planted foot + streaks
  _ground(ctx, g, P) {
    const y = g.gy + 1.5, step = 2.2, off = this.def.kind === 'cycle' ? (this.scroll * g.k) % (step * 9) : 0
    const mid = this._x(P.hip[0]), span = Math.min(g.W * 0.48, g.k * 1.1)
    for (let x = mid - span - step * 9; x <= mid + span; x += step) {
      const xx = x - off, f = 1 - Math.min(1, Math.abs(xx - mid) / span)
      if (f <= 0) continue
      const pebble = inkRnd(Math.round((x - (mid - span)) / step) * 0.71) > 0.86
      ctx.fillStyle = inkRgba('#B8B0CC', (0.1 + 0.22 * f) * (pebble ? 1.5 : 0.75 + 0.4 * inkRnd(x * 0.37)))
      ctx.beginPath(); ctx.arc(xx, y + (pebble ? 1.4 : 0), pebble ? 1.1 : 0.8, 0, 6.2832); ctx.fill()
    }
    if (this.def.kind === 'cycle' && !this.calm) {      // speed streaks behind the runner
      for (let i = 0; i < 7; i++) {
        const ly = this._y(0.25 + inkRnd(i * 4.1) * 0.6), len = g.k * (0.12 + inkRnd(i * 2.3) * 0.16)
        const lx = mid - g.k * 0.35 - ((this.scroll * g.k * (1.4 + inkRnd(i) * 0.8) + inkRnd(i * 7.7) * g.W) % (g.W * 0.5))
        for (let j = 0; j < len; j += 2.4) {
          ctx.fillStyle = inkRgba(this.color, 0.16 * (1 - j / len))
          ctx.beginPath(); ctx.arc(lx + j, ly, 0.7, 0, 6.2832); ctx.fill()
        }
      }
    }
  }

  // A stage-coloured halo of dots around the figure; more rings at higher realms, brighter on a clean rep.
  // Clamped inside the panel so it never clips at the edges.
  _aura(ctx, g, P) {
    const cx = this._x((P.hip[0] + P.shoulder[0]) / 2), cy = this._y((P.hip[1] + P.shoulder[1]) / 2 - 0.02)
    const wide = this.ex === 'pushups'
    const rx = Math.min(g.k * (wide ? 0.6 : 0.4), cx - 4, g.W - cx - 4)
    const ry = Math.min(g.k * (wide ? 0.3 : 0.5), cy - 4, g.H - cy - 4)
    if (rx < 4 || ry < 4) return
    const rings = 1 + Math.min(1, Math.floor(this.tier / 12))
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    for (let r = 0; r < rings; r++) {
      const rr = 1 + r * 0.14, spin = (this.calm ? 0 : this.t * 0.45) * (r % 2 ? -1 : 1)
      for (let i = 0; i < 64; i++) {
        const th = spin + (i / 64) * 6.2832
        ctx.fillStyle = inkRgba(this.color, (0.04 + 0.12 * this.pulse + 0.03 * Math.sin(i * 1.7)) * (0.6 + 0.4 * inkRnd(i * 3.1 + r)))
        ctx.beginPath(); ctx.arc(cx + Math.cos(th) * rx * rr, cy + Math.sin(th) * ry * rr, 0.85 + 0.5 * this.pulse, 0, 6.2832); ctx.fill()
      }
    }
    ctx.restore()
  }

  // Contact shadows under the hands and feet (only where they touch the ground)
  _shadow(ctx, g, P) {
    const pts = [P.toe, P.toe2, P.heel, P.heel2]
    if (this.ex === 'pushups') pts.push(P.palmTip, P.wrist, P.palmTip2)
    for (let n = 0; n < pts.length; n++) {
      const p = pts[n]
      if (!p || p[1] < 0.97) continue
      const x = this._x(p[0]), y = g.gy + 2, near = 1 - (1 - p[1]) / 0.03
      for (let i = 0; i < 10; i++) {
        const off = (inkRnd(i * 3.3 + n) - 0.5) * g.k * 0.1
        const a = 0.28 * near * (1 - Math.abs(off) / (g.k * 0.06))
        if (a <= 0) continue
        ctx.fillStyle = inkRgba('#000000', a)
        ctx.beginPath(); ctx.arc(x + off, y, 1.3, 0, 6.2832); ctx.fill()
      }
    }
  }

  // ── The silhouette mask ── volumes swept as circles along each bone, one channel per layer:
  // R = the far limbs · G = the body (torso, head, legs, hem) · B = the near arm (crosses the body).
  _silhouette(P) {
    const M = this._mask, x = M.bx, a = M.ax, g = this.geo, k = g.k
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, g.W, g.H)
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, g.W, g.H)
    x.globalCompositeOperation = 'lighter'
    const S = p => this._s(p)
    const sweep = (ctx, p0, p1, prof, nrm) => {
      const A = S(p0), Bp = S(p1), dx = Bp[0] - A[0], dy = Bp[1] - A[1], len = Math.hypot(dx, dy)
      const nx = nrm ? nrm[0] : 0, ny = nrm ? nrm[1] : 0
      ctx.beginPath()
      const rAt = t => { for (let i = 0; i < prof.length - 1; i++) if (t <= prof[i + 1][0]) { const u = (t - prof[i][0]) / Math.max(1e-6, prof[i + 1][0] - prof[i][0]), e = u * u * (3 - 2 * u); return [exLerp(prof[i][1], prof[i + 1][1], e), exLerp(prof[i][2] || 0, prof[i + 1][2] || 0, e)] } return [prof[prof.length - 1][1], prof[prof.length - 1][2] || 0] }
      const steps = Math.max(2, Math.ceil(len / 1.2))
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, [r, o] = rAt(t)
        const cx = A[0] + dx * t + nx * o * k, cy = A[1] + dy * t + ny * o * k
        ctx.moveTo(cx + r * k, cy); ctx.arc(cx, cy, Math.max(0.5, r * k), 0, 6.2832)
      }
      ctx.fill()
    }
    const disc = (ctx, p, r) => { const c = S(p); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0.5, r * k), 0, 6.2832); ctx.fill() }
    const tFront = [Math.cos(P.torso * EX_D2R), Math.sin(P.torso * EX_D2R)]   // the chest side of the torso
    const legs = (sfx) => {
      const hip = sfx ? P.hip2 : P.hip
      sweep(x, hip, P['knee' + sfx], [[0, 0.05], [0.5, 0.047], [1, 0.036]])
      sweep(x, P['knee' + sfx], P['ankle' + sfx], [[0, 0.034], [0.3, 0.036], [0.75, 0.026], [1, 0.022]])
      sweep(x, P['heel' + sfx], P['toe' + sfx], [[0, 0.022], [0.4, 0.021], [1, 0.014]])
    }
    const arms = (sfx) => {
      const sh = sfx ? P.shoulder2 : P.shoulder
      sweep(x, sh, P['elbow' + sfx], [[0, 0.04], [0.25, 0.037], [0.6, 0.033], [1, 0.026]])
      sweep(x, P['elbow' + sfx], P['wrist' + sfx], [[0, 0.025], [0.3, 0.027], [1, 0.019]])
      sweep(x, P['wrist' + sfx], P['palmTip' + sfx], [[0, 0.021], [0.5, 0.024], [1, 0.017]])
    }
    // far layer (R)
    x.fillStyle = 'rgb(255,0,0)'
    legs('2'); arms('2')
    // body layer (G): the near leg, the hem, the torso, the neck + head
    x.fillStyle = 'rgb(0,255,0)'
    legs('')
    const hem = this.chains?.hem
    if (hem) for (let i = 0; i < hem.length - 1; i++) sweep(x, hem[i].p, hem[i + 1].p, [[0, 0.052 - i * 0.004], [1, 0.05 - i * 0.006]])
    const breath = this.calm ? 0 : Math.sin(this.t * 2.1) * 0.0025
    sweep(x, P.hip, P.shoulder, [[0, 0.06, -0.006], [0.3, 0.05, 0], [0.7, 0.068 + breath, 0.01], [0.92, 0.062, 0.004], [1, 0.05, 0]], tFront)
    sweep(x, P.shoulder, P.neck, [[0, 0.03], [1, 0.024]])
    const hc = P.headC, hU = P.headU, hF = [-hU[1], hU[0]]   // hF: the face side
    disc(x, hc, this.B.head)
    disc(x, exAdd(exAdd(hc, hF, this.B.head * 0.35), hU, -this.B.head * 0.42), this.B.head * 0.55)   // the jaw
    const bun = exAdd(exAdd(hc, hU, this.B.head * 0.78), hF, -this.B.head * 0.42)
    disc(x, bun, this.B.head * 0.42)                                                                  // the topknot
    // near arm (B)
    x.fillStyle = 'rgb(0,0,255)'
    arms('')
    // accents: the sash band + its tails, the hair ribbon + the pin, the wrist wraps
    a.fillStyle = '#ff0000'; a.strokeStyle = '#ff0000'; a.lineCap = 'round'
    const waist = exAdd(P.hip, exUp(P.torso), this.B.torso * 0.3)
    sweep(a, exAdd(waist, tFront, 0.058), exAdd(waist, tFront, -0.062), [[0, 0.017], [1, 0.017]])
    for (const id of ['sash', 'sash2', 'ribbon']) {
      const ch = this.chains?.[id]
      if (!ch) continue
      const w0 = id === 'ribbon' ? 0.01 : 0.012
      for (let i = 0; i < ch.length - 1; i++) sweep(a, ch[i].p, ch[i + 1].p, [[0, w0 * (1 - i * 0.12)], [1, w0 * (1 - (i + 1) * 0.12)]])
    }
    sweep(a, exAdd(bun, hF, -0.02), exAdd(bun, hF, 0.03), [[0, 0.008], [1, 0.006]])
    this._head = { hc, hF, hU }
  }

  // Ink the mask as a hex grid of dots. Each dot takes its layer's ink, lit by how near it is to the layer's up-left
  // edge (the warm rim), back-lit in the stage colour on the down-right edge, and darkened along the line where the
  // near arm lies over the body. Returns paths per colour, split into the layers behind / in front of a lifted load.
  _ink(g) {
    const M = this._mask, W = g.W, H = g.H
    const bd = M.bx.getImageData(0, 0, W, H).data, ad = M.ax.getImageData(0, 0, W, H).data
    const L = id => { const r = bd[id], gg = bd[id + 1], b = bd[id + 2]; return b > 100 ? 3 : gg > 100 ? 2 : r > 100 ? 1 : 0 }
    const at = (x, y) => { x |= 0; y |= 0; return x < 0 || y < 0 || x >= W || y >= H ? 0 : L((y * W + x) * 4) }
    const acc = (x, y) => { x |= 0; y |= 0; return x < 0 || y < 0 || x >= W || y >= H ? 0 : ad[(y * W + x) * 4 + 3] > 100 }
    const pitch = Math.max(1.45, Math.min(2.2, g.k * 0.0125)), RY = pitch * 0.866, r0 = pitch * 0.47
    const e1 = Math.max(1.3, pitch * 0.8), e2 = e1 * 2.0, e3 = e1 * 3.4
    const far = new Map(), back = new Map(), front = new Map()
    const put = (map, col, x, y, r) => { let p = map.get(col); if (!p) map.set(col, p = new Path2D()); p.moveTo(x + r, y); p.arc(x, y, r, 0, 6.2832) }
    const pal = this.pal
    let row = 0
    for (let y = 1; y < H - 1; y += RY, row++) {
      for (let x = (row & 1) ? pitch / 2 : 0; x < W; x += pitch) {
        const l = at(x, y), isAcc = acc(x, y)
        if (!l && !isAcc) continue
        const map = l === 3 ? front : l === 1 ? far : back
        if (isAcc && (l === 2 || l === 0 || l === 3)) {
          const lit = !acc(x - e1, y - e1) ? 2 : !acc(x + e1, y + e1) ? 0 : 1
          put(l === 3 ? front : back, pal.acc[lit], x, y, r0 * (lit === 2 ? 1.05 : 0.95))
          continue
        }
        // how close the up-left edge of this dot's layer is (a dot over a lower layer counts as an edge)
        const lit = at(x - e1, y - e1) < l ? 3 : at(x - e2, y - e2) < l ? 2 : at(x - e3, y - e3) < l ? 1 : 0
        const bk = l > 1 && at(x + e1, y + e1) < l && lit < 2 ? 1 : 0
        if (l === 3 && at(x + e1, y + e1) === 2 && lit < 3) { put(front, pal.occl, x, y, r0 * 1.02); continue }   // the arm's shadow on the body
        const set = l === 1 ? pal.far : l === 2 ? pal.body : pal.near
        const jitter = 0.92 + 0.12 * inkRnd(x * 0.37 + y * 1.13)
        put(map, set[lit][bk], x, y, r0 * (lit === 3 ? 1.06 : jitter) * (l === 1 ? 0.92 : 1))
      }
    }
    // a pale eye glint on the face side of the head
    const hd = this._head
    if (hd) { const e = this._s(exAdd(exAdd(hd.hc, hd.hF, this.B.head * 0.55), hd.hU, this.B.head * 0.08)); put(back, pal.rim, e[0], e[1], r0 * 0.75) }
    return { far, back, front }
  }
  _fill(ctx, map) { for (const [col, path] of map) { ctx.fillStyle = col; ctx.fill(path) } }

  // ── The load (Lift) ── gripped at the hands, sitting on the ground until it rises: squat → chest → overhead.
  _loadSize(i) {
    return [[0.2, 0.16], [0.3, 0.24], [0.42, 0.34], [0.56, 0.45], [0.74, 0.6], [0.96, 0.77], [1.22, 0.98]][i] || [0.3, 0.24]
  }
  _loadRect(P) {
    const [w, h] = this._loadSize(this.liftTier)
    const rise = Math.min(1, Math.max(0, (0.1 - Math.min(P.wrist[1], P.wrist2[1])) / 0.2))
    const hx = (P.wrist[0] + P.wrist2[0]) / 2 + 0.01 + Math.max(0, w / 2 - 0.06) * (1 - rise), hy = Math.min(P.wrist[1], P.wrist2[1])
    const bottom = Math.min(1, hy + 0.035)
    return { x: hx, y: bottom - h / 2, w, h }
  }
  _prop(ctx, g, P) {
    const R = this._loadRect(P)
    this._load(ctx, this.liftTier, this._x(R.x), this._y(R.y), g.k, R.w, R.h)
  }
  // An ink dot-mass (the load's parts): a rounded, slightly irregular filled body with a lit up-left rim.
  _mass(ctx, cx, cy, w, h, seed, rect = false, tone = 0) {
    const pitch = Math.max(1.5, Math.min(2.1, Math.min(w, h) * 0.12))
    const RY = pitch * 0.866, hw = w / 2, hh = h / 2
    const rim = inkMix(this.color, '#FFF4DC', 0.6), body = inkMix(inkMix('#1B1528', this.color, 0.1), tone > 0 ? '#E8E4F0' : this.color, Math.abs(tone))
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], cols = [body, inkMix(body, rim, 0.22), inkMix(body, rim, 0.5), rim]
    let row = 0
    for (let py = -hh; py <= hh; py += RY, row++) {
      for (let px = -hw + ((row & 1) ? pitch / 2 : 0); px <= hw; px += pitch) {
        const nx = px / hw, ny = py / hh
        const edge = rect ? 1 : 0.84 + 0.16 * inkRnd(seed + Math.round(px * 0.6) * 12.7 + Math.round(py * 0.6) * 6.1)
        const dd = rect ? Math.max(Math.abs(nx), Math.abs(ny)) : Math.hypot(nx, ny)
        if (dd > edge) continue
        const ul = rect ? Math.max(-nx, -ny) : (-nx - ny) * 0.707
        const lvl = dd > edge - (rect ? 0.12 : 0.18) && ul > 0.3 ? 3 : ul > 0.5 ? 2 : ul > 0.1 ? 1 : 0
        const p = paths[lvl], r = pitch * 0.46
        p.moveTo(cx + px + r, cy + py); p.arc(cx + px, cy + py, r, 0, 6.2832)
      }
    }
    paths.forEach((p, i) => { ctx.fillStyle = cols[i]; ctx.fill(p) })
  }
  // The load per body tier (LIFT_ITEMS): one boulder, larger every tier — a broad base, a lit top facet, a side lump,
  // dark cracks (glowing with spirit veins from tier B up)
  _load(ctx, i, cx, cy, k, w, h) {
    const W = w * k, H = h * k, sd = 21 + i * 7
    this._mass(ctx, cx, cy + H * 0.04, W, H * 0.92, sd)                                   // the body of the stone
    this._mass(ctx, cx + W * 0.2, cy + H * 0.14, W * 0.56, H * 0.66, sd + 3)               // a lump on the far side
    this._mass(ctx, cx - W * 0.14, cy - H * 0.2, W * 0.5, H * 0.36, sd + 5, false, 0.1)    // the lit top facet
    // cracks: a few jagged dotted lines; from tier B they glow in the stage colour (spirit veins)
    const glow = i >= 4, n = i < 2 ? 1 : 2
    const dot = Math.max(0.7, Math.min(1.3, W * 0.012))
    ctx.save()
    if (glow) ctx.globalCompositeOperation = 'lighter'
    for (let c = 0; c < n; c++) {
      let x = cx + (inkRnd(sd + c * 4.1) - 0.5) * W * 0.6, y = cy - H * (0.1 + inkRnd(sd + c * 2.7) * 0.25)
      const steps = 3 + Math.round(inkRnd(sd + c) * 2)
      for (let st = 0; st < steps; st++) {
        const nx = x + (inkRnd(sd + c * 9 + st * 1.3) - 0.5) * W * 0.12, ny = y + H * (0.05 + inkRnd(sd + c * 5 + st) * 0.05)
        for (let u = 0; u <= 1; u += 0.25) {
          const px = x + (nx - x) * u, py = y + (ny - y) * u
          if (((px - cx) / (W * 0.48)) ** 2 + ((py - cy) / (H * 0.44)) ** 2 > 0.8) continue   // stay inside the stone
          ctx.fillStyle = glow ? inkRgba(this.color, 0.55 + 0.25 * this.pulse) : 'rgba(6,4,12,0.6)'
          ctx.beginPath(); ctx.arc(px, py, dot, 0, 6.2832); ctx.fill()
        }
        x = nx; y = ny
      }
    }
    ctx.restore()
  }

  // A cone of stacked dot-masses (a peak dir -1 rises from its base at y0; dir +1 hangs down from y0), the top `snow`
  // share drawn pale.
  // jagged: irregular facets (uneven widths, offsets and tones) instead of even bands, to a single point
  _cone(ctx, cx, y0, W, H, dir, seed, tone = 0, snow = 0, jagged = false) {
    const n = jagged ? 10 : 7
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), j = jagged ? (inkRnd(seed + i * 1.7) - 0.5) : 0
      const w = W * Math.max(0.03, (1 - f * 0.97) * (1 + j * 0.35)), h = H / n * (jagged ? 1.5 + inkRnd(seed + i) * 0.6 : 1.7)
      const y = y0 + dir * (f * H * 0.86 + h * 0.3)
      const ox = (inkRnd(seed + i) - 0.5) * W * (jagged ? 0.16 * (1 - f) : 0.06)
      const tn = snow && f > 1 - snow - 0.01 ? 0.6 : jagged ? (i % 2 ? 0.07 : -0.04) : tone
      this._mass(ctx, cx + ox, y, w, h, seed + i * 3.1, false, tn)
    }
  }

  // The dust kicked off the ground on a rep
  _puffDraw(ctx, g) {
    this.puffs = this.puffs.filter(p => this.t - p.t0 < 0.5)
    for (const p of this.puffs) {
      const k = (this.t - p.t0) / 0.5, reach = (p.q === 'miss' ? 0.5 : 1) * g.k * 0.16
      for (let i = 0; i < 14; i++) {
        const a = -0.2 + inkRnd(i * 3.7) * 1.4 + (i % 2 ? Math.PI * 0.55 : 0)
        const sp = (0.3 + inkRnd(i * 5.1)) * reach * k
        ctx.fillStyle = inkRgba(this.pal.dust, (1 - k) * 0.6)
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * sp, p.y - Math.abs(Math.sin(a)) * sp * 0.6, 1.1 * (1 - k) + 0.2, 0, 6.2832); ctx.fill()
      }
    }
  }
  // Qi motes rising off the body on a clean rep
  _moteDraw(ctx, g) {
    this.motes = this.motes.filter(m => this.t - m.t0 < 0.9)
    if (!this.motes.length) return
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    for (const m of this.motes) {
      const k = (this.t - m.t0) / 0.9
      ctx.fillStyle = inkRgba(this.pal.rim, (1 - k) * 0.85)
      ctx.beginPath(); ctx.arc(m.x + Math.sin(k * 6 + m.s * 5) * 2, m.y - k * g.k * 0.3 * m.s, 0.9 + 0.5 * (1 - k), 0, 6.2832); ctx.fill()
    }
    ctx.restore()
  }
}

if (typeof module !== 'undefined') module.exports = { ExerciseScene }
