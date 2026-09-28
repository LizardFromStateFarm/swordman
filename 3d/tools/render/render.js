// 3D project render page — driven by tools/host.js via window.renderJob(job).
//   ink   : the app's art + InkRenderer are injected as inline scripts (read-only) → renders exactly what the
//           app renders (WYSIWYG).
//   voxel : a self-contained isometric painter (no app code) draws the model + a bone overlay.
// Neither path ever writes to the app.
;(function () {
  'use strict'

  // Inject app source text as classic <script> elements: `const INK_ART` / `class InkRenderer` become global
  // lexical bindings, exactly as a <script src> would.
  window.__sources__ = function (srcs) {
    for (const src of srcs) {
      const s = document.createElement('script')
      s.textContent = src
      document.head.appendChild(s)
    }
    return true
  }

  function poly (g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill() }

  // ── ink ──
  function drawOverlay (g, ov, s) {
    g.save(); g.scale(s, s); g.lineWidth = 0.7
    g.strokeStyle = 'rgba(240, 208, 96, 0.75)'
    for (const b of ov.bones) {
      if (!b.parent) continue
      const p = ov.bones.find(x => x.name === b.parent)
      if (!p) continue
      g.beginPath(); g.moveTo(p.world[0], p.world[1]); g.lineTo(b.world[0], b.world[1]); g.stroke()
    }
    g.fillStyle = '#F0D060'
    for (const b of ov.bones) { g.beginPath(); g.arc(b.world[0], b.world[1], 1.7, 0, Math.PI * 2); g.fill() }
    g.fillStyle = '#6CC4A0'
    for (const p of ov.pivots) { g.beginPath(); g.arc(p.pivot[0], p.pivot[1], 1.4, 0, Math.PI * 2); g.fill() }
    g.restore()
  }

  function renderInk (job) {
    const stage = document.getElementById('stage')
    const r = new InkRenderer(stage, { table: INK_ART })
    r.base = InkRenderer.resolve(job.state, INK_ART)
    r.slotSel = { ...(job.slots || {}) }
    r.art = r._effective()
    const out = []
    for (const m of job.moments) {
      const art = r.stillCanvas(300, 150, job.dpr || 4, m.t == null ? 0.6 : m.t, { bt: m.bt || 0, fail: m.fail || 0, demote: !!m.demote })
      const s = art.width / 300
      const c = document.createElement('canvas'); c.width = art.width; c.height = art.height
      const g = c.getContext('2d'); g.drawImage(art, 0, 0)
      if (job.overlay) drawOverlay(g, job.overlay, s)
      out.push({ name: m.name, dataUrl: c.toDataURL('image/png') })
    }
    return out
  }

  // ── voxel: isometric painter (z-up, back-to-front by x+y+z) ──
  function renderVoxel (job) {
    const [sx, sy, sz] = job.model.size
    const dpr = job.dpr || 1
    const k = Math.max(2, Math.min(820 / (sx + sy), 560 / ((sx + sy) / 2 + sz)))     // px per voxel
    const W = Math.ceil((sx + sy) * k + 80), H = Math.ceil(((sx + sy) / 2 + sz) * k + 60)
    const c = document.createElement('canvas')
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr)
    const g = c.getContext('2d'); g.scale(dpr, dpr)
    g.fillStyle = '#08040E'; g.fillRect(0, 0, W, H)
    const ox = 40, oy = 40 + sz * k
    const proj = (vx, vy, vz) => [ox + (vx - vy) * k, oy + (vx + vy) * k / 2 - vz * k]

    const order = job.model.voxels.slice().sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))
    for (const v of order) {
      const col = job.model.palette[v[3] - 1] || [200, 200, 200, 255]
      const rgb = f => `rgb(${Math.round(col[0] * f)},${Math.round(col[1] * f)},${Math.round(col[2] * f)})`
      const p = (dx, dy, dz) => proj(v[0] + dx, v[1] + dy, v[2] + dz)
      const A = p(0, 0, 1), B = p(1, 0, 1), C = p(1, 1, 1), D = p(0, 1, 1)     // top face
      const Bb = p(1, 0, 0), Cb = p(1, 1, 0), Db = p(0, 1, 0)                 // bottom of the visible sides
      g.fillStyle = rgb(1.0); poly(g, [A, B, C, D])
      g.fillStyle = rgb(0.72); poly(g, [B, C, Cb, Bb])
      g.fillStyle = rgb(0.5); poly(g, [D, C, Cb, Db])
    }

    if (job.overlay) {
      g.lineWidth = 1.2
      g.strokeStyle = 'rgba(240, 208, 96, 0.9)'
      for (const b of job.overlay.bones) {
        if (!b.parent) continue
        const par = job.overlay.bones.find(x => x.name === b.parent)
        if (!par) continue
        const a = proj(par.world[0], par.world[1], par.world[2]), q = proj(b.world[0], b.world[1], b.world[2])
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(q[0], q[1]); g.stroke()
      }
      for (const b of job.overlay.bones) {
        const w = proj(b.world[0], b.world[1], b.world[2])
        g.beginPath(); g.arc(w[0], w[1], 3, 0, Math.PI * 2); g.fillStyle = '#F0D060'; g.fill()
        g.fillStyle = '#0B0716'; g.font = '10px system-ui'; g.fillText(b.name, w[0] + 4, w[1] - 3)
      }
    }
    return [{ name: job.name || 'voxel-iso', dataUrl: c.toDataURL('image/png') }]
  }

  // ── ascii: the classic glyph sprite, drawn with the app's font + colours ──
  const isWide = cp => (cp >= 0x1100 && cp <= 0x115F) || cp === 0x2329 || cp === 0x232A ||
    (cp >= 0x2E80 && cp <= 0xA4CF && cp !== 0x303F) || (cp >= 0xAC00 && cp <= 0xD7A3) ||
    (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x1F300 && cp <= 0x1FAFF)

  function renderAscii (job) {
    const dpr = job.dpr || 2
    const [W, H] = job.canvas
    const c = document.createElement('canvas')
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr)
    const g = c.getContext('2d'); g.scale(dpr, dpr)
    g.fillStyle = '#08040E'; g.fillRect(0, 0, W, H)
    g.font = '14px "Courier New", monospace'; g.textBaseline = 'top'
    const cw = job.cell.w, chh = job.cell.h
    job.rows.forEach((row, r) => {
      let x = job.grid.ox
      for (const chr of row) {
        if (chr !== ' ') {
          const col = job.colors[chr] || job.defaultColor || '#C8B89A'
          g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 4
          g.fillText(chr, x, job.grid.oy + r * chh)
        }
        x += isWide(chr.codePointAt(0)) ? cw * 2 : cw
      }
    })
    g.shadowBlur = 0

    if (job.overlay) {
      if (job.regions) {
        g.setLineDash([3, 3]); g.lineWidth = 0.7; g.strokeStyle = 'rgba(140,136,170,0.6)'
        for (const rg of job.regions) g.strokeRect(rg.box.x0, rg.box.y0, rg.box.x1 - rg.box.x0, rg.box.y1 - rg.box.y0)
        g.setLineDash([])
      }
      g.lineWidth = 0.9; g.strokeStyle = 'rgba(240,208,96,0.8)'
      for (const b of job.overlay.bones) {
        if (!b.parent) continue
        const p = job.overlay.bones.find(x => x.name === b.parent)
        if (!p) continue
        g.beginPath(); g.moveTo(p.world[0], p.world[1]); g.lineTo(b.world[0], b.world[1]); g.stroke()
      }
      g.fillStyle = '#F0D060'
      for (const b of job.overlay.bones) { g.beginPath(); g.arc(b.world[0], b.world[1], 2, 0, Math.PI * 2); g.fill() }
      g.fillStyle = '#6CC4A0'
      for (const p of job.overlay.pivots) { g.beginPath(); g.arc(p.pivot[0], p.pivot[1], 1.6, 0, Math.PI * 2); g.fill() }
    }
    return [{ name: job.name, dataUrl: c.toDataURL('image/png') }]
  }

  window.renderJob = function (job) {
    if (job.kind === 'voxel') return renderVoxel(job)
    if (job.kind === 'ascii') return renderAscii(job)
    return renderInk(job)
  }
})()
