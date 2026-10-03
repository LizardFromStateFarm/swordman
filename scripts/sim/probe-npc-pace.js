// Tuning probe (not a check): how many game years an NPC needs to reach each realm on _npcStageRate, by root multiplier
// and talent. Used to set the realm lifespans in assets/data/npc-lives.js (living-world.md §6.3).
// Run: node scripts/sim/probe-npc-pace.js
const { createSim } = require('./loader.js')
;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs
  const ST = sim.ev('CULTIVATION_STAGES'), YPS = sim.ev('NPC_YEARS_PER_STAGE'), CAP = sim.ev('NPC_STAGE_CAP')
  for (const mult of [1, 1.4, 1.8, 3]) for (const talent of [0.7, 1, 1.3]) {
    let st = 1, xp = 0, yrs = 0; const at = {}
    while (st < CAP && yrs < 3000) {
      xp += gs._npcStageRate(st, mult, YPS / talent); yrs++
      while (xp >= 1 && st < CAP) { xp -= 1; st++; const r = ST[st].realm; if (at[r] == null) at[r] = yrs }
    }
    console.log(`root ×${mult} talent ${talent}: ` + Object.entries(at).map(([r, y]) => `${r} ${y}`).join(' · ') + ` · stage ${st} at ${yrs}y`)
  }
})()
