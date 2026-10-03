// Scenario checks — Phase 43f: razing a sect (docs/systems/npc-sects.md → "43f"). Own-sect wars only. Pins: the vow
// (by hand, or the standing order on a war you never touched; a hand-set vow beats the order); a won war under the vow
// kills the foe's record and pays its treasury (stones, herbs, maybe a manual), karma (less when provoked), fame and
// dread; the world reacts by each master's morality; a lost war burns nothing; dread can turn a weaker foe back (never
// a remnant); the ashes: a joinable sect always returns and its gate is sealed until it does, a rival may return as
// "Reborn …" with a grudge (hostile, faster growth, more wars) or scatter; the heir's vengeance event (blood-price /
// face the heir / scorn → they march). Run: npm run checks · node scripts/sim/checks/sect-raze.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const force = (sim, v, fn) => { const M = sim.ev('Math'), r = M.random; M.random = () => v; try { return fn() } finally { M.random = r } }

const leader = async seed => {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = 20; s.spiritStones = 1e6; s.health = 100; s.karma = 50; s.ownSect.founded = true; s.ownSect.name = 'Test Peak'
  s.sectWar = gs._blankSectWar('own'); s.sectWar.nextWarAt = Date.now() + 9e9; gs._recalc()
  const r = s.world.sects.list.find(x => x.kind === 'rival')
  return { sim, gs, s, r, W: s.world.sects }
}
// Your sect wins (0 → the win roll passes) or loses (0.999) the war it is in.
const resolve = (sim, gs, win) => force(sim, win ? 0 : 0.999, () => gs._resolveSectWar())

;(async () => {
  let { sim, gs, s, r, W } = await leader(5101)
  const R = sim.ev('SECT_RAZE')
  // ── The vow ──
  assert(gs.razeInfo() === null && gs.setRazeVow(true).reason === 'no_war', 'no vow at peace')
  gs._openWarOn(r, false, true)
  let info = gs.razeInfo()
  assert(info.ok && !info.vow && !info.provoked && info.karma === R.karma, 'a war you declared: the vow is offered, unprovoked karma shown')
  assert(info.stones === R.spoilsPerTier * r.tier + R.spoilsPerLevel * gs._wsLevels(r), 'the shown treasury is the formula')
  assert(gs.setRazeVow(true).ok && s.sectWar.razeVow && s.sectWar.razeSet, 'vowing by hand sets the vow')
  gs.setWarOrder('raze', 'never')
  assert(s.sectWar.razeVow, 'a hand-set vow beats the standing order')
  // ── A won war under the vow ──
  const id = r.id, name = r.name, levels = gs._wsLevels(r), tier = r.tier, st0 = s.spiritStones, k0 = s.karma
  const nice = W.list.find(x => x !== r && x.alive); nice.temper = 'niceguy'; nice.stance = 0
  const cruel = W.list.find(x => x !== r && x !== nice && x.alive); cruel.temper = 'psycho'; cruel.stance = 0
  const fame0 = s.derived.sectFame
  resolve(sim, gs, true)
  assert(!W.list.some(x => x.id === id) && W.razed === 1, 'the razed sect is struck from the world')
  assert(s.spiritStones >= st0 + R.spoilsPerTier * tier + R.spoilsPerLevel * levels, 'its treasury is yours (on top of the war spoils)')
  assert(s.karma === k0 + R.karma, 'karma paid for an unprovoked razing')
  assert(nice.stance < 0 && cruel.stance > 0 && nice.deeds.some(d => /burned/.test(d.text)), 'the world reacts: a righteous master recoils, a cruel one respects it, both remember')
  assert(W.dread === tier && W.ashes.length === 1 && W.ashes[0].state === 'smoking', 'dread rises by its tier; its ashes smoke')
  assert(s.ownSect.razed.length === 1 && s.derived.sectFame === fame0 + R.fame + 5, 'your sect counts it (fame + the victory)')
  assert(s.sectWar.lastResult.razed?.sect === name && s.sectWar.lastResult.vowed, 'the Last war card knows it burned')
  assert(W.chronicle.some(c => /to the ground/.test(c.text)), 'the chronicle records it')
  // ── A lost war burns nothing ──
  ;({ sim, gs, s, r, W } = await leader(5102))
  gs._openWarOn(r, false, true); gs.setRazeVow(true)
  resolve(sim, gs, false)
  assert(r.alive && W.list.includes(r) && !W.razed, 'lose the war, and the vow is empty: they stand')
  // ── Without the vow, a win only burns a hall ──
  ;({ sim, gs, s, r, W } = await leader(5103))
  gs._openWarOn(r, false, true)
  resolve(sim, gs, true)
  assert(r.alive && !W.razed, 'no vow, no razing')
  // ── The standing order ──
  ;({ sim, gs, s, r, W } = await leader(5104))
  gs.setWarOrder('raze', 'theirs')
  gs._openWarOn(r, false, true)
  assert(!s.sectWar.razeVow, "'theirs' does not vow on a war you declared")
  s.sectWar.phase = 'none'; s.sectWar.nextWarAt = sim.ev('Date.now()') - 1
  force(sim, 0.5, () => gs._advanceSectWarStep())
  assert(s.sectWar.phase === 'scouting' && s.sectWar.razeVow && !s.sectWar.razeSet, "'theirs' vows on a war a sect starts")
  assert(gs.razeInfo().provoked && gs.razeInfo().karma === R.karmaProvoked, 'a war they started: provoked, less karma')
  gs.setRazeVow(false)
  gs.setWarOrder('raze', 'always')
  assert(!s.sectWar.razeVow, 'lifting the vow by hand holds against a later order change')
  assert(gs.setWarOrder('raze', 'bogus').reason === 'invalid', 'an unknown order is refused')
  // ── Dread turns a weaker foe back (never a remnant) ──
  ;({ sim, gs, s, r, W } = await leader(5105))
  W.dread = 12
  for (const x of W.list) { x.stance = -50; x.buildings = {}; x.hallLevel = 1; x.disciples = 4 }
  s.sectWar.phase = 'none'; s.sectWar.nextWarAt = sim.ev('Date.now()') - 1
  force(sim, 0, () => gs._advanceSectWarStep())
  assert(s.sectWar.phase === 'none' && s.sectWar.nextWarAt > sim.ev('Date.now()') - 1 && s.events.some(e => /turns back/.test(e.text)), 'a dreaded name: a weaker foe turns back, the war rescheduled')
  for (const x of W.list) x.grudge = true
  s.sectWar.nextWarAt = sim.ev('Date.now()') - 1
  force(sim, 0, () => gs._advanceSectWarStep())
  assert(s.sectWar.phase === 'scouting', 'a remnant\'s grudge ignores the dread')
  const d0 = W.dread; gs._tickAshes(Math.floor(s.world.year))
  assert(W.dread === d0 - R.dread.decay, 'dread fades a little each year')
  // ── The ashes: a rival returns as a remnant ──
  ;({ sim, gs, s, r, W } = await leader(5106))
  gs._openWarOn(r, false, true); gs.setRazeVow(true); resolve(sim, gs, true)
  const ash = W.ashes[0], yr = ash.returnYear
  force(sim, 0, () => gs._tickAshes(yr - 1))
  assert(ash.state === 'smoking', 'the ashes stay quiet until their year')
  force(sim, 0, () => gs._tickAshes(yr))
  const rem = gs._wsRec(ash.rebornId)
  assert(ash.state === 'reborn' && rem && rem.grudge && rem.origin === 'remnant' && rem.name === `${R.remnant.prefix} ${ash.name}`, 'survivors raise it again as a remnant with a grudge')
  assert(rem.stance === R.remnant.stance && rem.tier === Math.max(1, ash.tier - 1) && rem.deeds.some(d => /burned/.test(d.text)), 'hostile, a tier weaker, and it remembers why')
  assert(gs._wsRow(rem).grudge && gs._wsRow(rem).ashOf === ash.name, 'the ledger shows the feud')
  // a remnant is the only foe left that is not sworn: it is the one who comes
  for (const x of W.list) if (x !== rem) x.sworn = true
  assert(gs._wsWarFoe(false) === rem, 'a remnant can be the one who comes to war')
  assert(R.remnant.warWeight > 1 && R.remnant.growMult > 1, 'a remnant comes to war more often and rebuilds faster (tuning)')
  // ── or the survivors scatter ──
  ;({ sim, gs, s, r, W } = await leader(5107))
  gs._openWarOn(r, false, true); gs.setRazeVow(true); resolve(sim, gs, true)
  force(sim, 0.999, () => gs._tickAshes(W.ashes[0].returnYear))
  assert(W.ashes[0].state === 'scattered' && !W.ashes[0].rebornId, 'or no one returns, and grass grows over the gate')
  // ── A joinable sect: its gate is sealed until it returns (always) ──
  ;({ sim, gs, s, r, W } = await leader(5108))
  const j = W.list.find(x => x.defId === 'azure_sword')
  gs._openWarOn(j, false, true); gs.setRazeVow(true); resolve(sim, gs, true)
  assert(!gs._wsByDef('azure_sword') && gs.sectInAshes('azure_sword'), 'a burned joinable sect lies in ashes')
  s.ownSect.founded = false; s.stageIndex = 20
  assert(gs.joinSect('azure_sword').reason === 'ashes', 'its gate cannot be joined while it lies in ashes')
  s.ownSect.founded = true
  force(sim, 0.999, () => gs._tickAshes(W.ashes[0].returnYear))
  const back = gs._wsByDef('azure_sword')
  assert(back && back.kind === 'joinable' && back.grudge && back.name === j.name && !gs.sectInAshes('azure_sword'), 'it always rises again, under its own name, with a grudge')
  // ── The heir's vengeance ──
  ;({ sim, gs, s, r, W } = await leader(5109))
  r.grudge = true; r.origin = 'remnant'; r.stance = -70
  const def = sim.ev('WORLD_SECT_EVENTS').find(e => e.id === 'vengeance')
  assert(gs._wsEligible(def, Math.floor(s.world.year)).includes(r), 'a remnant with a grudge may send the letter from the ashes')
  W.event = { id: 'vengeance', sectId: r.id, year: 1 }
  let ev = gs.worldSectEventInfo()
  assert(ev.choices[0].clearGrudge && ev.choices[2].march, 'the choices show what they do')
  gs.answerWorldSectEvent(0)
  assert(!r.grudge && r.stance > -70, 'a blood-price sets the feud down')
  assert(!gs._wsEligible(def, Math.floor(s.world.year)).includes(r), 'and the letters stop')
  r.grudge = true; W.event = { id: 'vengeance', sectId: r.id, year: 1 }
  gs.answerWorldSectEvent(2)
  assert(s.sectWar.phase === 'scouting' && s.sectWar.enemyId === r.id && r.grudge, 'scorn them, and they march on you')
  r.grudge = true; W.event = { id: 'vengeance', sectId: r.id, year: 1 }
  ev = gs.worldSectEventInfo()
  assert(/at war/.test(ev.choices[2].lock), 'scorn waits while a war is underway')
  // ── Member wars never raze ──
  ;({ sim, gs, s, r, W } = await leader(5110))
  s.ownSect.founded = false; s.sect = { id: 'azure_sword', rank: 0, contribution: 0, activeMissions: [] }
  s.sectWar = gs._blankSectWar('member'); gs._openWarOn(r, true, false)
  assert(gs.razeInfo() === null, 'a member war offers no vow')
  // ── Migration ──
  ;({ sim, gs, s, r, W } = await leader(5111))
  delete W.ashes; delete W.dread; delete s.ownSect.razed; delete s.warOrders.raze; delete s.sectWar.razeVow
  gs._recalc()
  assert(Array.isArray(W.ashes) && W.dread === 0 && Array.isArray(s.ownSect.razed) && s.warOrders.raze === 'never' && s.sectWar.razeVow === false, 'an old save gains the 43f fields')
})()
