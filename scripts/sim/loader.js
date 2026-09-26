// Loads the REAL game logic (assets/data/*.js + engine/game-state.js + game/*.js) into a Node vm
// context — the same way index.html loads <script> tags — with a controllable clock, seeded
// Math.random, and an in-memory window.electron. No DOM, no Electron, no real waiting.
// Used by: scripts/sim/run.js. See docs/systems/qa-sim.md.

const fs   = require('fs')
const path = require('path')
const vm   = require('vm')
const { mulberry32 } = require('./rng')

const ROOT = path.join(__dirname, '..', '..')

// Load order mirrors renderer/index.html (sprites, platform-storage, ascii-renderer, game.js skipped:
// they're UI/Node-bridge only and the logic never references them).
const DATA_FILES = ['stages', 'techniques', 'events', 'items', 'locations', 'enemies', 'recipes',
                    'beasts', 'sects', 'sect-buildings', 'sect-war']
  .map(f => `assets/data/${f}.js`)
const LOGIC_FILES = ['renderer/engine/game-state.js',
  ...['cultivation', 'expedition', 'crafting', 'beasts', 'sect', 'sect-war'].map(f => `renderer/game/${f}.js`)]

function createSim({ seed = 1, startMs = Date.UTC(2026, 0, 1), overrides = [] } = {}) {
  const clock = { now: startMs }
  const rng   = mulberry32(seed)

  const RealDate = Date
  class SimDate extends RealDate {
    constructor(...a) { a.length ? super(...a) : super(clock.now) }
    static now() { return clock.now }
  }

  const simMath = Object.create(Math)
  simMath.random = rng

  const saves = {}   // slot → JSON string (serialized, so every load is a real round-trip)
  const window = {
    electron: {
      saveSlot: async (slot, data) => { saves[slot] = JSON.stringify(data); return true },
      loadSlot: async (slot) => (saves[slot] ? JSON.parse(saves[slot]) : null),
      listSlots: async () => Object.keys(saves).map(Number),
      deleteSlot: async (slot) => { delete saves[slot]; return true },
    },
  }

  const ctx = vm.createContext({ window, Date: SimDate, Math: simMath, console })

  for (const rel of [...DATA_FILES, ...LOGIC_FILES]) {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    // Data files: top-level `const` → `var` so --set overrides can reassign tuning constants.
    if (rel.startsWith('assets/data/')) src = src.replace(/^const /gm, 'var ')
    vm.runInContext(src, ctx, { filename: rel })
  }

  // Balance overrides, e.g. "WAR_MIN_INTERVAL_HOURS=1" or "CULTIVATION_STAGES[11].qiCap=5000"
  for (const o of overrides) vm.runInContext(o, ctx, { filename: 'override' })

  const ev = code => vm.runInContext(code, ctx)
  const gs = ev('gameState')
  const systems = ev(`[new CultivationSystem(gameState), new ExpeditionSystem(gameState),
    new BeastSystem(gameState), new SectSystem(gameState), new SectWarSystem(gameState)]`)
  const SYSTEM_SOURCES = ['events', 'expeditions', 'beast_expeditions', 'sect_missions', 'war']

  return {
    ctx, clock, gs, systems, saves, ev,
    data: ev(`({ CULTIVATION_STAGES, TECHNIQUES, ITEMS, LOCATIONS, RECIPES, SECTS, SECT_RANKS,
      SECT_MISSIONS, SECT_MAX_MISSIONS, SECT_FOUNDING, SECT_BUILDINGS, SECT_HALL_LEVELS,
      DISCIPLE_RECRUIT_COST, BEAST_TYPES, WAR_REINFORCE_COST_PER_FAME, WAR_ALLY_COST_BASE, WAR_ALLY_COST_PER_FAME, MEMBER_WAR_MAX_PILLS })`),
    // One frame of the real game loop (renderer/game.js), minus rendering.
    // onStones(source, delta) — optional Spirit Stone ledger hook (who produced/consumed stones this frame).
    step(dt, onStones) {
      clock.now += dt * 1000
      if (!onStones) { gs.tick(dt); for (const sys of systems) sys.tick(dt); return }
      const s0 = gs.get(), w0 = s0.sectWar.warVictories + s0.sectWar.warDefeats
      let before = s0.spiritStones
      gs.tick(dt)   // own-sect disciple income + war resolution happen inside tick()
      const s1 = gs.get()
      onStones(s1.sectWar.warVictories + s1.sectWar.warDefeats !== w0 ? 'war' : 'disciples', s1.spiritStones - before)
      systems.forEach((sys, i) => { before = gs.get().spiritStones; sys.tick(dt); onStones(SYSTEM_SOURCES[i], gs.get().spiritStones - before) })
    },
    // Real initSlot is async but only awaits the (sync-resolving) stub — drain microtasks.
    async boot(slot = 0) { await gs.initSlot(slot) },
  }
}

module.exports = { createSim }
