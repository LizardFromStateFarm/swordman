// Loads the Cultivator Idle app's art data files READ-ONLY and evaluates them in a vm — the same
// technique scripts/sim/loader.js uses (classic scripts → `const` rewritten to `var` so the names land
// on the context). This module NEVER writes to the app. Used by: tools/cli.js.
//
// App root defaults to the parent of 3d/; override with CULTIVATOR_APP_ROOT or --app-root so the 3D
// project can later live outside this repo.
'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const DEFAULT_APP_ROOT = path.resolve(__dirname, '..', '..')

// Load order matters for ink: INK_ART before INK_PARTS (mirrors renderer/index.html).
const ART_FILES = {
  ink: ['assets/sprites/ink-cultivator.js', 'assets/sprites/ink-parts.js'],
  ascii: ['assets/sprites/cultivator-sprites.js'],
}

function loadArt (kind = 'ink', { appRoot } = {}) {
  const files = ART_FILES[kind]
  if (!files) throw new Error(`unknown art source "${kind}" (have: ${Object.keys(ART_FILES).join(', ')})`)
  const root = appRoot || process.env.CULTIVATOR_APP_ROOT || DEFAULT_APP_ROOT
  const ctx = vm.createContext({ console })
  for (const rel of files) {
    const file = path.join(root, rel)
    if (!fs.existsSync(file)) throw new Error(`art file not found: ${file} (set --app-root or CULTIVATOR_APP_ROOT)`)
    const src = fs.readFileSync(file, 'utf8').replace(/^const /gm, 'var ')
    vm.runInContext(src, ctx, { filename: rel })
  }
  return { kind, root, INK_ART: ctx.INK_ART, INK_PARTS: ctx.INK_PARTS, CULTIVATOR_SPRITES: ctx.CULTIVATOR_SPRITES }
}

module.exports = { loadArt, ART_FILES, DEFAULT_APP_ROOT }
