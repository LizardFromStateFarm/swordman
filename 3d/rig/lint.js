// Rig linter — the agent's feedback loop (spec: 3d/RIG-FORMAT.md "Rig linter"). Pure, no DOM.
// Prints one `ok` line per rule group (plus every `FAIL`), so an agent can see exactly what was checked and
// fix a failure from its message alone. Works for 2D (ink) and 3D (voxel) rigs via the RigSource interface:
// `source.bboxOf(attachment)` for geometry, `source.checks.coverage/bounds(rig)` for the source-specific rules.
'use strict'

const { insideBox } = require('./model')

function lintRig (rig, source) {
  const out = []
  const check = (label, fn) => {
    const fails = []
    fn(m => fails.push(m))
    if (fails.length) for (const m of fails) out.push({ ok: false, msg: m })
    else out.push({ ok: true, msg: label })
  }

  if (!rig || typeof rig !== 'object') { out.push({ ok: false, msg: 'rig is not an object' }); return { ok: false, results: out } }

  const bones = rig.skeleton || {}
  const names = Object.keys(bones)
  const atts = Array.isArray(rig.attachments) ? rig.attachments : null

  check('rig.v = 1', f => {
    if (rig.v !== 1) f(`rig.v must be 1 (got ${JSON.stringify(rig.v)})`)
    if (!names.length) f('skeleton is empty')
    if (source && source.space && rig.space && rig.space !== source.space) f(`rig.space "${rig.space}" ≠ source space "${source.space}"`)
  })

  check(`skeleton: ${names.length} bones, parents acyclic`, f => {
    for (const name of names) {
      const b = bones[name]
      if (!Array.isArray(b.pos) || b.pos.length < 2) f(`bone "${name}": pos must be [x,y(,z)]`)
      if (b.parent != null && !bones[b.parent]) f(`bone "${name}": parent "${b.parent}" missing`)
      const seen = new Set([name]); let n = b.parent
      while (n) { if (seen.has(n)) { f(`skeleton has a parent cycle through "${name}"`); break } seen.add(n); n = bones[n] && bones[n].parent }
    }
  })

  const keyOf = a => a.part ? 'part:' + a.part : a.kind ? 'kind:' + a.kind : a.group != null ? 'group:' + a.group : null
  const claimed = new Set()
  if (!atts) out.push({ ok: false, msg: 'attachments must be an array' })
  else check(`attachments: ${atts.length} bound to bones`, f => {
    for (const a of atts) {
      const label = a.part ? `part:${a.part}` : a.kind ? `kind:${a.kind}` : a.group != null ? `group:${a.group}` : 'attachment'
      if (!bones[a.bone]) f(`${label} → unknown bone "${a.bone}"`)
      const k = keyOf(a)
      if (k) { if (claimed.has(k)) f(`"${k}" is claimed by two attachments`); claimed.add(k) }
      const bb = source && source.bboxOf ? source.bboxOf(a) : null
      if (!bb) f(`${label}: no geometry found in the source art`)
      else if (a.pivot && !insideBox(a.pivot, bb)) f(`${label}: pivot ${JSON.stringify(a.pivot)} is outside its bbox`)
      if (a.soft != null && (typeof a.soft !== 'number' || a.soft < 0 || a.soft > 1)) f(`${label}: soft must be 0…1`)
      if (a.sway && !(a.sway.amp >= 0)) f(`${label}: sway.amp must be >= 0`)
    }
  })

  const children = {}
  for (const name of names) if (bones[name].parent) (children[bones[name].parent] ||= []).push(name)
  check('no orphan bones', f => {
    for (const name of names) {
      const hasChild = (children[name] || []).length > 0
      const hasAtt = (atts || []).some(a => a.bone === name)
      if (!hasChild && !hasAtt) f(`orphan bone "${name}" (no children and no attachment)`)
    }
  })

  const tracks = Object.entries(rig.tracks || {})
  check(`tracks: ${tracks.length} valid`, f => {
    for (const [tname, tr] of tracks) {
      for (const [bone, keys] of Object.entries(tr.feels || {})) {
        if (!bones[bone]) { f(`track ${tname}: unknown bone "${bone}"`); continue }
        if (!Array.isArray(keys) || !keys.length) { f(`track ${tname}.${bone}: no keys`); continue }
        let prev = -Infinity
        for (const kk of keys) {
          if (typeof kk.t !== 'number' || kk.t <= prev) f(`track ${tname}.${bone}: key times must strictly increase`)
          prev = kk.t
          if (!Array.isArray(kk.pose) || kk.pose.length < 2) f(`track ${tname}.${bone}: pose must be [rot, lift…]`)
        }
        if (tr.loop) {
          if (keys[0].t !== 0) f(`track ${tname}.${bone}: a loop must start at t = 0`)
          if (JSON.stringify(keys[0].pose) !== JSON.stringify(keys[keys.length - 1].pose)) f(`track ${tname}.${bone}: loop first pose must equal last pose`)
        }
      }
    }
  })

  if (source && source.checks) {
    if (source.checks.coverage) check('coverage: all geometry bound', f => { for (const m of source.checks.coverage(rig)) f(m) })
    if (source.checks.bounds) check('geometry fits the source bounds', f => { for (const m of source.checks.bounds(rig)) f(m) })
  }

  return { ok: out.every(r => r.ok), results: out }
}

module.exports = { lintRig }
