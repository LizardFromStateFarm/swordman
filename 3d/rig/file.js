// Rig file I/O — data-only `.js` files with a single `const RIG… = {…}`. Shared by tools/cli.js and tools/host.js.
'use strict'

const fs = require('fs')
const vm = require('vm')

function loadRig (file) {
  const src = fs.readFileSync(file, 'utf8')
  const m = src.match(/^(?:const|var|let)\s+(RIG\w*)\s*=/m)
  if (!m) throw new Error(`no "const RIG… = {…}" declaration found in ${file}`)
  const ctx = vm.createContext({})
  vm.runInContext(src.replace(/^const /gm, 'var '), ctx, { filename: file })
  return ctx[m[1]]
}

// Serialize a rig to the file text. `note` is a one-line provenance comment; defaults to the rig's source.
function serializeRig (rig, note) {
  const src = rig.source || {}
  const head = note || `${src.kind} · ${src.state} · slots ${JSON.stringify(src.slots || {})}`
  return `// Rig for the 3D project — DATA ONLY. Edit it in the rig editor; do not hand-edit the numbers.\n` +
    `// Source: ${head}. Spec: 3d/RIG-FORMAT.md.\n` +
    `const RIG = ${JSON.stringify(rig, null, 2)};\n`
}

module.exports = { loadRig, serializeRig }
