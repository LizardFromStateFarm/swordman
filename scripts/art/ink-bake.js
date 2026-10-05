// Ink dot-map BAKE (art pipeline, A4-2): turns a source picture (transparent PNG preferred: cut out by alpha) (the user's own art) into an editable DOT MAP PNG in
// which every pixel is exactly one ink dot (hex grid: odd rows sit half a dot to the right; rows are 0.866 of a dot
// apart, so the map is stretched 1/0.866 vertically). Background removal: pixels outside the beast get alpha 0.
// The engine (renderer/engine/ink-renderer.js → raster `map`) draws the map as ink dots with glow, dissolve and motion
// regions on top. Maps live in assets/sprites/beasts/<id>.png and can be hand-edited in any pixel editor.
// Specs: scripts/art/ink-bake.json. Doc: docs/systems/art-engine.md → "Raster beasts: the bake pipeline".
// Run: npx electron scripts/art/ink-bake.js [id ...]      (no ids = every spec)
// Writes per id: assets/sprites/beasts/<id>.png (the dot map) and scripts/art/out/<id>.mask.png (the cut-out, for review).
const { app, nativeImage } = require('electron')
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '../..')

app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

function bake(spec) {
  const src = nativeImage.createFromPath(path.join(root, spec.src))
  if (src.isEmpty()) throw new Error('cannot read ' + spec.src)
  const [x0, y0, x1, y1] = spec.crop || [0, 0, src.getSize().width, src.getSize().height]
  // default size: the same dot pitch for every beast in the portrait box (200 dots across a wide picture, 168 rows down a tall one)
  const W = spec.width || Math.min(200, Math.round(168 * 0.866 * (x1 - x0) / (y1 - y0))), H = Math.round((y1 - y0) / (x1 - x0) * W / 0.866)
  const img = src.crop({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).resize({ width: W, height: H, quality: 'best' })
  const bgra = img.toBitmap()                                   // BGRA (premultiplied where transparent)
  for (let i = 0; i < W * H; i++) { const a = bgra[i * 4 + 3]; if (a > 0 && a < 255) for (let j = 0; j < 3; j++) bgra[i * 4 + j] = Math.min(255, bgra[i * 4 + j] * 255 / a) }
  if (spec.flipX) for (let y = 0; y < H; y++) for (let x = 0; x < W >> 1; x++) {   // face the cultivator (beasts aren't mirrored in battle)
    const a = (y * W + x) * 4, b = (y * W + W - 1 - x) * 4
    for (let j = 0; j < 4; j++) { const t = bgra[a + j]; bgra[a + j] = bgra[b + j]; bgra[b + j] = t }
  }
  const N = W * H, Y = new Float32Array(N)
  for (let i = 0; i < N; i++) Y[i] = (0.11 * bgra[i * 4] + 0.59 * bgra[i * 4 + 1] + 0.3 * bgra[i * 4 + 2]) / 255

  // 1 · detail: fur, feathers, sparkles and runes are textured; a painted backdrop glow is smooth. |Y − local mean|,
  //     averaged over a window. Plus plain brightness above the local backdrop (a glowing but smooth edge still counts).
  const box = (A, r) => {                                       // box blur, radius r (separable)
    const T = new Float32Array(N), O = new Float32Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += A[y * W + xx]; n++ } }
      T[y * W + x] = s / n
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += T[yy * W + x]; n++ } }
      O[y * W + x] = s / n
    }
    return O
  }
  const m2 = box(Y, 2), dev = new Float32Array(N)
  for (let i = 0; i < N; i++) dev[i] = Math.abs(Y[i] - m2[i])
  const detail = box(dev, 3)
  const back = box(box(Y, 12), 12)                                // the backdrop's broad glow
  const t = spec.detail ?? 0.028, lift = spec.lift ?? 0.12
  let M = new Uint8Array(N)
  // a source with real transparency is cut out by its alpha; otherwise the detector below finds the beast
  let clear = 0; for (let i = 0; i < N; i++) if (bgra[i * 4 + 3] < 128) clear++
  const byAlpha = spec.alpha ?? clear > N * 0.05
  if (byAlpha) for (let i = 0; i < N; i++) M[i] = bgra[i * 4 + 3] >= (spec.alphaMin ?? 128) && Y[i] > (spec.minL ?? 0.03) ? 1 : 0
  else for (let i = 0; i < N; i++) M[i] = (detail[i] > t || Y[i] - back[i] > lift) && Y[i] > (spec.minL ?? 0.08) ? 1 : 0
  // pale: a source painted INSIDE a soft glow (the Vermilion Bird) — drop pixels that are pale (low saturation), bright and
  // smooth: the halo, not the feathers. { sat: max saturation, Y: min brightness, detail: max texture }
  if (spec.pale) {
    const P = spec.pale
    for (let i = 0; i < N; i++) {
      if (!M[i]) continue
      const b = bgra[i * 4], g = bgra[i * 4 + 1], r = bgra[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx ? (mx - mn) / mx : 0
      if (sat < (P.sat ?? 0.3) && Y[i] > (P.Y ?? 0.55) && detail[i] < (P.detail ?? 0.04)) M[i] = 0
    }
  }

  // 2 · close small gaps (dilate → erode), fill holes (whatever the border can't reach is inside), drop specks
  const morph = (A, r, grow) => {
    const O = new Uint8Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let hit = grow ? 0 : 1
      for (let dy = -r; dy <= r && hit === (grow ? 0 : 1); dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const xx = x + dx, yy = y + dy, v = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : A[yy * W + xx]
        if (grow && v) { hit = 1; break } if (!grow && !v) { hit = 0; break }
      }
      O[y * W + x] = hit
    }
    return O
  }
  const close = spec.close ?? (byAlpha ? 0 : 2)
  if (close) M = morph(morph(M, close, true), close, false)
  if (spec.erode) M = morph(M, spec.erode, false)   // shave a coloured rim the source's glow left on the silhouette
  const outside = new Uint8Array(N), stack = []
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
  while (stack.length) { const i = stack.pop(); if (outside[i] || M[i]) continue; outside[i] = 1
    const x = i % W, y = (i / W) | 0
    if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W) }
  if (spec.fillHoles ?? !byAlpha) for (let i = 0; i < N; i++) if (!outside[i]) M[i] = 1
  const seen = new Int32Array(N).fill(-1), minArea = spec.minArea ?? 60
  for (let i = 0; i < N; i++) {
    if (!M[i] || seen[i] >= 0) continue
    const comp = [], st = [i]; seen[i] = i
    while (st.length) { const j = st.pop(); comp.push(j); const x = j % W, y = (j / W) | 0
      for (const k of [x > 0 && j - 1, x < W - 1 && j + 1, y > 0 && j - W, y < H - 1 && j + W]) if (k !== false && M[k] && seen[k] < 0) { seen[k] = i; st.push(k) } }
    if (comp.length < minArea) for (const j of comp) M[j] = 0
  }
  // hand corrections in map px: erase / keep polygons (a stray glow blob, a limb the detector missed)
  const inPoly = (x, y, P) => { let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
    const [xa, ya] = P[a], [xb, yb] = P[b]; if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c } return c }
  for (const P of spec.erase || []) for (let i = 0; i < N; i++) if (inPoly(i % W, (i / W) | 0, P)) M[i] = 0
  for (const P of spec.keep || []) for (let i = 0; i < N; i++) if (inPoly(i % W, (i / W) | 0, P)) M[i] = 1

  // 3 · write the dot map (RGBA → BGRA bitmap for nativeImage) + a mask preview
  const out = Buffer.alloc(N * 4), prev = Buffer.alloc(N * 4)
  for (let i = 0; i < N; i++) {
    const a = M[i] ? 255 : 0
    out[i * 4] = bgra[i * 4] * a / 255; out[i * 4 + 1] = bgra[i * 4 + 1] * a / 255; out[i * 4 + 2] = bgra[i * 4 + 2] * a / 255; out[i * 4 + 3] = a
    const v = M[i] ? 255 : 40
    prev[i * 4] = M[i] ? bgra[i * 4] : 60; prev[i * 4 + 1] = M[i] ? bgra[i * 4 + 1] : 20; prev[i * 4 + 2] = M[i] ? bgra[i * 4 + 2] : v; prev[i * 4 + 3] = 255
  }
  const dir = path.join(root, 'assets/sprites/beasts'), dbg = path.join(__dirname, 'out')
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(dbg, { recursive: true })
  fs.writeFileSync(path.join(dir, spec.id + '.png'), nativeImage.createFromBitmap(out, { width: W, height: H }).toPNG())
  fs.writeFileSync(path.join(dbg, spec.id + '.mask.png'),
    nativeImage.createFromBitmap(prev, { width: W, height: H }).resize({ width: W * 3, height: H * 3, quality: 'good' }).toPNG())
  let kept = 0; for (let i = 0; i < N; i++) kept += M[i]
  console.log(`${spec.id}: ${W}x${H} dots, ${kept} kept (${Math.round(kept / N * 100)}%) → assets/sprites/beasts/${spec.id}.png`)
}

app.whenReady().then(() => {
  let code = 0
  try {
    const specs = JSON.parse(fs.readFileSync(path.join(__dirname, 'ink-bake.json'), 'utf8'))
    const ids = process.argv.slice(2).filter(a => !a.startsWith('-') && a !== '.' && !a.endsWith('.js'))
    for (const s of specs) if (!ids.length || ids.includes(s.id)) bake(s)
  } catch (e) { console.error(e.message); code = 1 }
  app.exit(code)
})
