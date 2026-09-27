// Scenario checks — settings.md / notifications.md: the ⚙ Close button setting. 1.8b-1 renamed closeAction (default
// 'tray') → closeButton (default 'quit', user 2026-09-26) so old saves pick up the new default; this pins the
// migration (old key dropped, new default filled, an explicit 'tray' still valid).
// Run: npm run checks (all) · node scripts/sim/checks/settings.js (this file). Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs
  assert(gs.getSettings().closeButton === 'quit', 'new game: Close button defaults to Quit')
  // An old save: closeAction present (the Phase 9A default), closeButton missing
  const s = gs.get(); delete s.settings.closeButton; s.settings.closeAction = 'tray'
  gs._ensurePhase20CFields()
  assert(!('closeAction' in s.settings), 'migration drops the old closeAction key')
  assert(s.settings.closeButton === 'quit', 'migration fills closeButton = quit')
  s.settings.closeButton = 'tray'; gs._ensurePhase20CFields()
  assert(s.settings.closeButton === 'tray', 'an explicit Hide to tray choice survives migration')
  s.settings.closeButton = 'minimize'; gs._ensurePhase20CFields()
  assert(s.settings.closeButton === 'quit', 'an invalid value resets to Quit')
})()
