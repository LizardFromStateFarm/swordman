// Scenario checks — the player's Qi edge (user rule 2026-09-29; clan-succession.md → "NPC growth", PLAYER_QI_EDGE in
// succession.js): at the same root and stage, your bare Qi gain is PLAYER_QI_EDGE× an NPC's. Pins _npcStageRate at every
// stage and several roots, that a better-rooted NPC may still outpace a worse-rooted you, and that the three NPC growth
// paths (world persons via _advancePersons, your spouse, your children) never beat the rule.
// Run: npm run checks · node scripts/sim/checks/qi-edge.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs
  const E = sim.ev('PLAYER_QI_EDGE'), YPH = sim.ev('GAME_YEARS_PER_OPEN_HOUR'), ST = sim.data.CULTIVATION_STAGES
  const cap = sim.ev('NPC_STAGE_CAP'), NPCY = sim.ev('NPC_YEARS_PER_STAGE'), SPY = sim.ev('SPOUSE_YEARS_PER_STAGE'), CHY = sim.ev('CHILD_YEARS_PER_STAGE')
  const yours = (k, root) => ST[k].baseQps * root * (3600 / YPH) / ST[k].qiCap   // stages per game year, bare
  assert(E === 1.1, `PLAYER_QI_EDGE = ${E}`)

  // 1. The rule at every stage an NPC can hold, for several roots, on all three paces
  let worst = Infinity, bad = []
  for (let k = 0; k < cap; k++) for (const root of [0.5, 1, 1.6, 3]) for (const [y, useRoot] of [[NPCY, true], [SPY, false], [CHY, true]]) {
    const npc = gs._npcStageRate(k, root, y, useRoot)
    const edge = yours(k, root) / npc
    worst = Math.min(worst, edge)
    if (edge < E - 1e-9) bad.push(`stage ${k} root ${root}`)
    const flat = (useRoot ? root : 1) / y
    if (Math.abs(npc - Math.min(flat, yours(k, root) / E)) > 1e-12) bad.push(`stage ${k} not min(flat, yours/edge)`)
  }
  assert(!bad.length, `same root + stage: you are always ≥ ${E}× an NPC (tightest ${worst.toFixed(3)}×)${bad.length ? ' — ' + bad.slice(0, 4).join(', ') : ''}`)
  assert(gs._npcStageRate(10, 1, NPCY) < 1 / NPCY, `Foundation: the rule slows NPCs (${(1 / gs._npcStageRate(10, 1, NPCY)).toFixed(0)} yrs/stage vs the flat ${NPCY})`)
  assert(gs._npcStageRate(0, 1, NPCY) === 1 / NPCY, 'Mortal: where NPCs are already slower, nothing changes')

  // 2. A better root can still beat you
  assert(gs._npcStageRate(12, 3, NPCY) > yours(12, 1), 'a root-3 NPC outpaces a root-1 you at the same stage (upgrade your root)')

  // 3. World persons: 600 years of growth at root 1 never outruns your bare pace ÷ edge
  { const w = gs.get().world, yr = Math.floor(w.year)
    const p = gs._genPerson({ family: 'Test', bornYear: yr - 20, stage: 0, role: 'kin' }); p.root = { ...(p.root || {}), mult: 1 }; p.grownYear = yr; p.npcXp = 0
    w.persons[p.id] = p
    let expect = 0, xp = 0
    for (let k = 0, left = 600; k < cap && left > 0; k++) { const need = (1 - xp) / gs._npcStageRate(k, 1, NPCY); if (left < need) break; left -= need; expect = k + 1 }
    gs._advancePersons(w, yr + 600)
    assert(p.stageIndex === expect, `a root-1 NPC after 600 years: stage ${p.stageIndex} (the rule's pace says ${expect}; the old flat pace would say ${Math.min(cap, Math.floor(600 / NPCY))})`)
    const before = p.stageIndex; gs._advancePersons(w, yr + 600)
    assert(p.stageIndex === before, 'advancing to the same year again changes nothing') }

  // 4. Your spouse and children follow the same cap
  { const s = gs.get(), f = s.family
    s.stageIndex = 18; s.maxStageThisLife = 18
    f.nextProposalYear = s.world.year - 1; gs._tickFamily(); gs.acceptSuitor(gs.get().family.proposal.suitors[0].id)
    const sp = gs.get().family.spouse; sp.stageIndex = 11; sp.root = { ...(sp.root || {}), mult: 1 }
    gs.get().family.spouseStageYear = s.world.year - 60   // 60 married years at Foundation
    gs.get().family.nextEventYear = 1e9; gs.get().family.nextChildEventYear = 1e9; gs.get().family.planning = 'none'
    gs._tickFamily()
    const need = 1 / gs._npcStageRate(11, 1, SPY, false)
    assert(sp.stageIndex === (60 >= need ? 12 : 11), `a Foundation spouse needs ${need.toFixed(0)} married years a stage (was ${SPY}): stage ${sp.stageIndex} after 60`)
    const c = gs._makeChild(gs.get().family.spouse); c.bornYear -= 40; c.stageIndex = 10; c.xp = 0; c.root = { ...(c.root || {}), mult: 1 }
    const x0 = c.xp; gs._tickFamily()
    assert(Math.abs((c.xp - x0) - gs._npcStageRate(10, 1, CHY)) < 1e-9 || c.stageIndex > 10, `a Foundation child banks ${gs._npcStageRate(10, 1, CHY).toFixed(4)} of a stage a year (capped by the rule)`) }
})()
