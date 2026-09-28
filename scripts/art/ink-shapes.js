// Ink art authoring helper (A4-2): turns a limb centreline or a tapering curve into a `d` polygon for INK_ART /
// INK_BEASTS parts, so jointed legs (knee, hock) and S-curved flame tails don't have to be offset by hand.
// Output is pasted into assets/sprites/ink-*.js (the data files stay logic-free). See .agents/rules/assets.md → Ink art.
// Run: node scripts/art/ink-shapes.js '<json spec>'   spec = { name: { limb: [[x,y,w],...] } | { taper: [P0,P1,P2,P3], w, n? } }
//   limb  — polyline of joints with a width at each (a leg: hip → knee → hock → paw)
//   taper — a cubic Bezier centreline; width swells to ~1.3·w a third of the way along and tapers to a point
//   sym   — { sym: [[x,y],...], cx? }: the LEFT half of a symmetric outline, from the top of the centre line down to the
//           bottom of it; returns the whole closed shape mirrored across x = cx (default 150). Front-facing faces/bodies.
const r = v => Math.round(v * 2) / 2

function outline(pts) {                                   // pts: [[x, y, w]] → closed polygon around the centreline
  const L = [], R = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len
    const [x, y, w] = pts[i], h = w / 2
    L.push([r(x - dy * h), r(y + dx * h)]); R.push([r(x + dy * h), r(y - dx * h)])
  }
  const ring = [...L, ...R.reverse()]
  return ['M', ...ring[0], ...ring.slice(1).flatMap(p => ['L', ...p]), 'Z']
}

function bez([p0, p1, p2, p3], t) {
  const u = 1 - t
  return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k])
}

function shape(spec) {
  if (spec.limb) return outline(spec.limb)
  if (spec.sym) {
    const cx = spec.cx ?? 150, half = spec.sym, back = half.slice(1, -1).reverse().map(([x, y]) => [2 * cx - x, y])
    const ring = [...half, ...back]
    return ['M', ...ring[0], ...ring.slice(1).flatMap(q => ['L', ...q]), 'Z']
  }
  const n = spec.n || 14, pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, [x, y] = bez(spec.taper, t)
    pts.push([x, y, Math.max(0.2, spec.w * (1 - t) ** 0.85 * (1 + 0.6 * Math.sin(Math.PI * t)))])
  }
  return outline(pts)
}

const spec = JSON.parse(process.argv[2] || '{}')
for (const [name, s] of Object.entries(spec)) console.log(`${name}: ${JSON.stringify(shape(s)).replace(/"/g, "'").replace(/,/g, ', ')}`)
