// 3D project rig editor — the human correction UI (spec: 3d/RIG-EDITOR.md).
// Loads the art through the APP's real InkRenderer (injected read-only) and draws draggable dots on top:
// gold = bones (rest positions), teal = attachment pivots. Saves back via the host (tools/preload.js).
'use strict'
;(function () {
  const DPR = 3        // device px per logical sheet unit
  const HIT = 6        // handle hit radius (logical px)
  const SNAP = 4       // snap-to-bbox tolerance (logical px)

  const $ = id => document.getElementById(id)
  const round = n => Math.round(n * 100) / 100
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

  let job, rig, artCache = null, r = null
  let sel = null                 // { type:'bone', name } | { type:'attachment', index }
  let drag = null
  const touched = new Set()
  const hist = { past: [], future: [] }
  let lintTimer = null

  const cv = $('stage')
  const ctx = cv.getContext('2d')

  // ── geometry helpers (bone world = sum of parent-relative offsets; mirrors rig/model.js) ──
  function boneWorld (name) {
    const chain = []; let n = name
    while (n && rig.skeleton[n]) { chain.unshift(rig.skeleton[n]); n = rig.skeleton[n].parent }
    let x = 0, y = 0
    for (const b of chain) { x += b.pos[0]; y += b.pos[1] }
    return [x, y]
  }
  function bboxOf (a) {
    if (a.part) return job.geometry.parts[a.part] || null
    if (a.kind) return job.geometry.kinds[a.kind] || null
    return null
  }

  // ── history / dirty ──
  function snap () { hist.past.push(JSON.stringify(rig)); if (hist.past.length > 80) hist.past.shift(); hist.future.length = 0 }
  function undo () { if (!hist.past.length) return; hist.future.push(JSON.stringify(rig)); rig = JSON.parse(hist.past.pop()); afterChange() }
  function redo () { if (!hist.future.length) return; hist.past.push(JSON.stringify(rig)); rig = JSON.parse(hist.future.pop()); afterChange() }
  function markDirty (v = true) { $('dirty').textContent = v ? '● unsaved' : '' }

  // ── art ──
  function moment () {
    const m = $('moment').value
    if (m === 'bt') return { t: 0.9, opts: { bt: 1 } }
    if (m === 'fail') return { t: 0.3, opts: { fail: 1 } }
    return { t: 0.6, opts: {} }
  }
  function renderArt () {
    r.base = InkRenderer.resolve(job.state, INK_ART)
    if (!r.base) { artCache = null; return }
    r.slotSel = { ...(rig.source.slots || {}) }
    r.art = r._effective()
    const m = moment()
    artCache = r.stillCanvas(300, 150, DPR, m.t, m.opts)
  }

  // ── draw ──
  function drawBoxes (g) {
    g.lineWidth = 0.4
    g.strokeStyle = 'rgba(140,136,170,0.5)'
    for (const b of Object.values(job.geometry.parts)) { g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0) }
    g.setLineDash([2, 2]); g.strokeStyle = 'rgba(108,196,160,0.5)'
    for (const b of Object.values(job.geometry.kinds)) { g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0) }
    g.setLineDash([])
  }
  function drawBones (g) {
    g.lineWidth = 0.8
    g.strokeStyle = 'rgba(240,208,96,0.7)'
    for (const [name, b] of Object.entries(rig.skeleton)) {
      if (!b.parent || !rig.skeleton[b.parent]) continue
      const p = boneWorld(b.parent), c = boneWorld(name)
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(c[0], c[1]); g.stroke()
    }
    for (const name of Object.keys(rig.skeleton)) {
      const w = boneWorld(name), on = sel && sel.type === 'bone' && sel.name === name
      g.beginPath(); g.arc(w[0], w[1], on ? 2.8 : 2, 0, Math.PI * 2)
      g.fillStyle = on ? '#FFFFFF' : '#F0D060'; g.fill()
    }
  }
  function drawPivots (g) {
    ;(rig.attachments || []).forEach((a, i) => {
      if (!a.pivot) return
      const on = sel && sel.type === 'attachment' && sel.index === i
      g.beginPath(); g.arc(a.pivot[0], a.pivot[1], on ? 2.6 : 1.8, 0, Math.PI * 2)
      g.fillStyle = on ? '#FFFFFF' : '#6CC4A0'; g.fill()
      g.lineWidth = 0.4; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke()
    })
  }
  function paint () {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (artCache) ctx.drawImage(artCache, 0, 0)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    if ($('show-geo').checked) drawBoxes(ctx)
    if ($('show-pivots').checked) drawPivots(ctx)
    if ($('show-bones').checked) drawBones(ctx)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  // ── hit test + snapping ──
  function toLogical (e) {
    const rc = cv.getBoundingClientRect()
    return [(e.clientX - rc.left) * (cv.width / rc.width) / DPR, (e.clientY - rc.top) * (cv.height / rc.height) / DPR]
  }
  function hit (p) {
    for (let i = (rig.attachments || []).length - 1; i >= 0; i--) {
      const a = rig.attachments[i]
      if (a.pivot && dist(p, a.pivot) <= HIT) return { type: 'attachment', index: i }
    }
    for (const name of Object.keys(rig.skeleton)) if (dist(p, boneWorld(name)) <= HIT) return { type: 'bone', name }
    return null
  }
  function snapAndClamp (a, x, y) {
    const bb = bboxOf(a)
    if (bb) {
      const mx = (bb.x0 + bb.x1) / 2, my = (bb.y0 + bb.y1) / 2
      for (const c of [bb.x0, mx, bb.x1]) if (Math.abs(x - c) <= SNAP) x = c
      for (const c of [bb.y0, my, bb.y1]) if (Math.abs(y - c) <= SNAP) y = c
      x = Math.min(Math.max(x, bb.x0), bb.x1); y = Math.min(Math.max(y, bb.y0), bb.y1)
    }
    return [round(x), round(y)]
  }

  // ── inspector ──
  function row (label, right) {
    const d = document.createElement('div'); d.className = 'row'
    const s = document.createElement('span'); s.textContent = label
    const v = document.createElement('span')
    if (typeof right === 'string') v.innerHTML = right; else v.appendChild(right)
    d.append(s, v); return d
  }
  function input (value, onChange, step) {
    const i = document.createElement('input'); i.type = 'number'; i.step = step || '0.5'; i.value = value
    i.addEventListener('change', () => onChange(parseFloat(i.value))); return i
  }
  function select (options, value, onChange) {
    const s = document.createElement('select')
    for (const o of options) { const op = document.createElement('option'); op.value = o; op.textContent = o; if (o === value) op.selected = true; s.appendChild(op) }
    s.addEventListener('change', () => onChange(s.value)); return s
  }
  function check (checked, onChange) {
    const i = document.createElement('input'); i.type = 'checkbox'; i.checked = checked
    i.addEventListener('change', () => onChange(i.checked)); return i
  }
  const fmtBB = b => `${b.x0.toFixed(0)},${b.y0.toFixed(0)} → ${b.x1.toFixed(0)},${b.y1.toFixed(0)}`

  function renderInspector () {
    const el = $('inspector')
    if (!sel) { el.innerHTML = '<span class="muted">Click a dot or a line to select. Nothing selected.</span>'; return }
    el.textContent = ''
    if (sel.type === 'bone') {
      const name = sel.name, b = rig.skeleton[name], w = boneWorld(name)
      el.append(
        row('bone', `<span class="tag">${name}</span>`),
        row('parent', `<span class="tag kind">${b.parent || '— (root)'}</span>`),
        row('world x', input(w[0], v => { snap(); b.pos[0] = round(b.pos[0] + (v - w[0])); touched.add(`skeleton.${name}.pos`); changed() })),
        row('world y', input(w[1], v => { snap(); b.pos[1] = round(b.pos[1] + (v - w[1])); touched.add(`skeleton.${name}.pos`); changed() })),
      )
    } else {
      const i = sel.index, a = rig.attachments[i], bb = bboxOf(a)
      el.append(
        row('target', a.part ? `<span class="tag">part: ${a.part}</span>` : `<span class="tag kind">kind: ${a.kind}</span>`),
        row('bone', select(Object.keys(rig.skeleton), a.bone, v => { snap(); a.bone = v; touched.add(`attachments.${i}.bone`); changed() })),
        row('pivot x', input(a.pivot[0], v => { snap(); a.pivot[0] = round(v); touched.add(`attachments.${i}.pivot`); changed() })),
        row('pivot y', input(a.pivot[1], v => { snap(); a.pivot[1] = round(v); touched.add(`attachments.${i}.pivot`); changed() })),
      )
      if (a.soft != null) el.append(row('soft', input(a.soft, v => { snap(); a.soft = v; touched.add(`attachments.${i}.soft`); changed() }, '0.05')))
      if (a.kind === 'hair' || a.sway) el.append(row('sway amp', input(a.sway ? a.sway.amp : 0, v => { snap(); a.sway = { lag: 0.18, ...(a.sway || {}), amp: v }; touched.add(`attachments.${i}.sway`); changed() }, '0.5')))
      el.append(row('solid (objects only)', check(!!a.solid, v => { snap(); a.solid = v; touched.add(`attachments.${i}.solid`); changed() })))
      if (bb) el.append(row('bbox', `<span class="muted" style="font:11px ui-monospace">${fmtBB(bb)}</span>`))
    }
  }

  // ── slots strip ──
  function buildSlots () {
    const host = $('slots'); host.textContent = ''
    const lab = document.createElement('label'); lab.textContent = 'slots'; host.appendChild(lab)
    for (const kind of job.slotKinds) {
      const opts = job.slotOptions[kind] || []
      if (!opts.length) continue
      const s = select(opts, (rig.source.slots || {})[kind], v => {
        snap(); rig.source.slots = { ...(rig.source.slots || {}), [kind]: v }
        touched.add(`source.slots.${kind}`); renderArt(); changed()
      })
      s.title = kind
      host.appendChild(s)
    }
  }

  // ── lint + save ──
  function scheduleLint () { clearTimeout(lintTimer); lintTimer = setTimeout(runLint, 300) }
  async function runLint () { showLint(await window.editor.lint(rig)) }
  function showLint (res) {
    const el = $('lint'); el.textContent = ''
    for (const r2 of res.results) {
      const d = document.createElement('div'); d.className = 'lint-line ' + (r2.ok ? 'ok' : 'fail')
      d.textContent = (r2.ok ? 'ok   ' : 'FAIL ') + r2.msg; el.appendChild(d)
    }
    const s = document.createElement('div'); s.className = 'lint-sum ' + (res.ok ? 'ok' : 'fail')
    s.textContent = res.ok ? 'PASS' : 'FAIL — fix before this rig is used'; el.appendChild(s)
  }
  async function save () {
    rig.meta = rig.meta || {}
    rig.meta.humanTouched = [...touched]
    showLint(await window.editor.save(rig))
    markDirty(false); touched.clear()
  }

  function changed () { markDirty(); paint(); renderInspector(); scheduleLint() }
  function afterChange () { buildSlots(); renderArt(); paint(); renderInspector(); markDirty(); scheduleLint() }

  // ── wiring ──
  function wire () {
    cv.addEventListener('pointerdown', e => {
      const p = toLogical(e), s = hit(p)
      if (!s) { sel = null; renderInspector(); paint(); return }
      sel = s
      snap()
      const orig = JSON.parse(JSON.stringify(s.type === 'bone' ? rig.skeleton[s.name] : rig.attachments[s.index]))
      drag = { ...s, start: p, orig }
      try { cv.setPointerCapture(e.pointerId) } catch {}
      renderInspector(); paint()
    })
    cv.addEventListener('pointermove', e => {
      const p = toLogical(e)
      if (!drag) { cv.style.cursor = hit(p) ? 'grab' : 'crosshair'; return }
      if (drag.type === 'bone') {
        const b = rig.skeleton[drag.name]
        b.pos = [round(drag.orig.pos[0] + (p[0] - drag.start[0])), round(drag.orig.pos[1] + (p[1] - drag.start[1]))]
        touched.add(`skeleton.${drag.name}.pos`)
      } else {
        const a = rig.attachments[drag.index]
        const [x, y] = snapAndClamp(a, drag.orig.pivot[0] + (p[0] - drag.start[0]), drag.orig.pivot[1] + (p[1] - drag.start[1]))
        a.pivot = [x, y]
        touched.add(`attachments.${drag.index}.pivot`)
      }
      renderInspector(); paint()
    })
    const end = () => { if (!drag) return; drag = null; markDirty(); scheduleLint() }
    cv.addEventListener('pointerup', end)
    cv.addEventListener('pointercancel', end)

    $('moment').addEventListener('change', () => { renderArt(); paint() })
    for (const id of ['show-bones', 'show-pivots', 'show-geo']) $(id).addEventListener('change', paint)
    $('undo').addEventListener('click', undo)
    $('redo').addEventListener('click', redo)
    $('check').addEventListener('click', runLint)
    $('save').addEventListener('click', save)

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo() }
      else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save() }
      else if (e.key === 'Escape') { sel = null; renderInspector(); paint() }
    })
  }

  // ── boot ──
  async function boot () {
    job = await window.editor.getJob()
    for (const src of job.sources) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
    rig = job.rig
    $('rig-name').textContent = job.rigPath.split(/[\\/]/).pop()
    cv.width = 300 * DPR; cv.height = 150 * DPR
    cv.style.width = (300 * DPR) + 'px'; cv.style.height = (150 * DPR) + 'px'
    r = new InkRenderer(cv, { table: INK_ART })
    buildSlots()
    renderArt()
    wire()
    paint()
    renderInspector()
    runLint()
  }

  // ── test hook (tools/host.js --smoke): exercises the data path without mouse events ──
  window.__editor = {
    state: () => ({
      bones: Object.keys(rig.skeleton).length, attachments: (rig.attachments || []).length,
      art: !!artCache, canvas: [cv.width, cv.height], slotSelects: $('slots').querySelectorAll('select').length,
    }),
    probe: async () => {
      const a = rig.attachments[0]
      const before = a.pivot.slice()
      a.pivot = [round(a.pivot[0] + 2), round(a.pivot[1] + 1)]
      touched.add('attachments.0.pivot')
      rig.meta = { ...(rig.meta || {}), humanTouched: [...touched] }
      renderArt(); paint()
      const lint = await window.editor.lint(rig)
      const saved = await window.editor.save(rig)
      return { before, after: a.pivot, lintOk: lint.ok, saveOk: saved.ok, touched: rig.meta.humanTouched.length }
    },
  }

  boot().catch(e => {
    document.body.insertAdjacentHTML('beforeend', `<pre style="color:#E4572E;padding:16px">editor failed: ${e && e.message}</pre>`)
  })
})()
