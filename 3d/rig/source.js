// Builds a RigSource from the app's art (ink) or a MagicaVoxel model (voxel). Shared by tools/*.
'use strict'

const fs = require('fs')
const path = require('path')
const { loadArt } = require('./loader')
const { inkSource } = require('./adapters/ink')
const { voxelSource } = require('./adapters/voxel')
const { asciiSource } = require('./adapters/ascii')

// A model path is stored either absolute or relative to the 3d project root; resolve it for reading.
function resolveModel (m) {
  if (path.isAbsolute(m)) return m
  const fromCwd = path.resolve(process.cwd(), m)
  if (fs.existsSync(fromCwd)) return fromCwd
  return path.resolve(__dirname, '..', m)
}

function sourceFor (kind, opts = {}) {
  if (kind === 'ink') {
    const art = loadArt('ink', opts)
    return { art, source: inkSource(art, { state: opts.state || 'meditating', slots: opts.slots || {} }) }
  }
  if (kind === 'voxel') {
    if (!opts.model) throw new Error('voxel source needs --model <file.vox>')
    const file = resolveModel(String(opts.model))
    if (!fs.existsSync(file)) throw new Error('no such model: ' + file)
    return { art: null, source: voxelSource(fs.readFileSync(file), { model: opts.model }) }
  }
  if (kind === 'ascii') {
    const art = loadArt('ascii', opts)
    return { art, source: asciiSource(art, { state: opts.state || 'meditating', regions: opts.regions }) }
  }
  throw new Error(`unknown art source "${kind}" (have: ink, voxel, ascii)`)
}

function sourceForRig (rig, opts = {}) {
  const s = rig.source || {}
  return sourceFor(s.kind, { state: s.state, slots: s.slots, model: s.model, regions: s.regions, appRoot: opts.appRoot })
}

module.exports = { sourceFor, sourceForRig }
