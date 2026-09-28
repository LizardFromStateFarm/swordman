// Scenario checks for the ASCII adapter: the char-grid → RigSource regions, the coarse banded auto-rig,
// and the linter on an ASCII rig. Run via `npm test` (tools/cli.js test). Spec: 3d/RIG-FORMAT.md §7.
'use strict'

const { loadArt } = require('../rig/loader')
const { asciiSource } = require('../rig/adapters/ascii')
const { autoRig } = require('../rig/autobind')
const { lintRig } = require('../rig/lint')

function run () {
  const out = []
  const ok = (c, m) => out.push({ ok: !!c, msg: m })

  const art = loadArt('ascii')
  ok(!!art.CULTIVATOR_SPRITES, 'loaded CULTIVATOR_SPRITES from the app')

  for (const [state, regions] of [['idle', 3], ['meditating', 3], ['meditating', 1]]) {
    const tag = `${state}/r${regions}`
    const src = asciiSource(art, { state, regions })
    ok(src.space === '2d', `${tag}: space is 2d`)
    ok(src.regions.length === regions, `${tag}: ${regions} region(s)`)
    ok(src.grid.rows > 0 && src.grid.cols > 0, `${tag}: grid ${src.grid.cols}×${src.grid.rows}`)

    const rig = autoRig(src)
    const bones = Object.keys(rig.skeleton).length
    ok(bones === regions + 1, `${tag}: ${regions + 1} bones (got ${bones})`)
    ok(rig.attachments.length === regions, `${tag}: ${regions} attachments`)
    ok(rig.attachments.every(a => a.pivot.length === 2), `${tag}: pivots are 2D`)

    const res = lintRig(rig, src)
    for (const r of res.results) ok(r.ok, `lint ${tag}: ${r.msg}`)
  }
  return out
}

module.exports = { run }
