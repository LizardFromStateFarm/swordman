// Scenario checks — Phase 43h: sect relations (docs/systems/npc-sects.md → "43h"). What you can DO to another sect, as
// a leader (gift, alliance + breaking it, declare war, tribute, spy, trade manuals, poach) or a member (gift, spar,
// urge your master to war). Pins: who sees which action; every action charges / rolls / remembers exactly as shown;
// cooldowns lock with a reason; a declared war enters the real war state machine against that sect (unprovoked → karma
// + others cool; a sworn ally / a war underway locks it); failed tribute / spy may bring war; a trade needs a manual of
// near grade; a poach picks ONE named disciple (cost + odds by talent and loyalty; a failure leaves them warier) and needs a seat; a spar is a nonlethal battle-page fight that pays Contribution; urging can start a
// member war. Run: npm run checks · node scripts/sim/checks/sect-relations.js. Prints ok/FAIL lines.
const { createSim } = require('../loader.js')
const { playFight } = require('../fight-helpers.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
const force = (sim, v, fn) => { const M = sim.ev('Math'), r = M.random; M.random = () => v; try { return fn() } finally { M.random = r } }

const leader = async seed => {
  const sim = await createSim({ seed }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  s.stageIndex = 20; s.spiritStones = 1e6; s.health = 100; s.ownSect.founded = true; s.ownSect.name = 'Test Peak'
  s.sectWar = gs._blankSectWar('own'); s.sectWar.nextWarAt = Date.now() + 9e9; gs._recalc()
  const r = s.world.sects.list.find(x => x.kind === 'rival')
  return { sim, gs, s, r }
}
const ids = info => info.actions.map(a => a.id)

;(async () => {
  let { sim, gs, s, r } = await leader(4381)
  const R = sim.ev('SECT_RELATIONS')
  // ── Who sees what ──
  const li = gs.sectRelationsInfo(r.id)
  assert(['gift', 'alliance', 'war', 'tribute', 'spy', 'trade', 'poach'].every(a => ids(li).includes(a)) && !ids(li).includes('spar'), 'a leader sees the leader\'s actions, not a member\'s')
  // ── Gift ──
  const st0 = r.stance, c0 = s.spiritStones, gift = li.actions.find(a => a.id === 'gift')
  const g = gs.sectAct(r.id, 'gift')
  assert(g.ok && s.spiritStones === c0 - gift.cost && r.stance > st0 && r.deeds.some(d => /gift/.test(d.text)), 'a gift charges, warms them, and is remembered')
  assert(/Again in/.test(gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'gift').lock) && gs.sectAct(r.id, 'gift').reason === 'locked', 'then it waits on its cooldown, with the reason')
  // ── Alliance ──
  r.stance = 10
  assert(gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'alliance').lock, 'an alliance needs them to think well of you first')
  r.stance = 60
  force(sim, 0, () => gs.sectAct(r.id, 'alliance'))
  assert(r.sworn && ids(gs.sectRelationsInfo(r.id)).includes('breakAlliance'), 'an accepted alliance makes them sworn; you may break it')
  assert(gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'war').lock, 'war on a sworn ally is locked, with its reason')
  const other = s.world.sects.list.find(x => x !== r); other.stance = 30; const k0 = s.karma
  gs.sectAct(r.id, 'breakAlliance')
  assert(!r.sworn && s.karma < k0 && other.stance < 30, 'breaking it costs karma, and the other sects cool')
  // ── Declare war ──
  r.stance = 10; other.stance = 30; const k1 = s.karma
  const w = gs.sectAct(r.id, 'war')
  assert(w.ok && s.sectWar.phase === 'scouting' && s.sectWar.enemyId === r.id && s.sectWar.declaredByYou, 'declaring war starts a real war against them')
  assert(s.karma < k1 && other.stance < 30, 'an unprovoked war costs karma, and others take note')
  assert(gs.sectRelationsInfo(r.id).warHere && gs.sectWarOdds().vs?.foe?.id === r.id, 'the war odds read them as the foe')
  const r2 = s.world.sects.list.find(x => x !== r && !x.sworn)
  assert(/already underway/.test(gs.sectRelationsInfo(r2.id).actions.find(a => a.id === 'war').lock), 'no second war while one is underway')
  // ── Tribute + spy ──
  ;({ sim, gs, s, r } = await leader(4382))
  const s0 = s.spiritStones
  force(sim, 0, () => gs.sectAct(r.id, 'tribute'))
  assert(s.spiritStones === s0 + R.tribute.stonesPerTier * r.tier && r.stance < 0, 'paid tribute: stones in, a grudge kept')
  r.acted = {}
  const h0 = s.health
  force(sim, 0.999, () => gs.sectAct(r.id, 'spy'))   // caught, and (0.999 > failWarChance) no war
  assert(s.health === h0 + R.spy.failHealth && r.deeds.some(d => /spy/.test(d.text)) && s.sectWar.phase === 'none', 'a caught spy: Health lost, remembered')
  r.acted = {}
  force(sim, 0.01, () => gs.sectAct(r.id, 'tribute'))
  r.acted = {}; r.stance = 0
  const before = s.sectWar.phase
  const M = sim.ev('Math'), rnd = M.random; let n = 0
  M.random = () => (n++ === 0 ? 0.999 : 0)   // the demand fails, then the war roll fires
  gs.sectAct(r.id, 'tribute'); M.random = rnd
  assert(before === 'none' && s.sectWar.phase === 'scouting' && s.sectWar.enemyId === r.id && !s.sectWar.declaredByYou, 'a refused demand can bring them marching on you')
  // ── Trade ──
  ;({ sim, gs, s, r } = await leader(4383))
  r.stance = 0
  const t0 = gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'trade')
  assert(/Bring a manual/.test(t0.lock), 'no manual of near grade: the trade is locked, and says what to bring')
  s.inventory.manual_drifting_step_palm = 1
  r.offer = { artId: 'rising_qi_kick', year: Math.floor(s.world.year) }   // a Yellow offer, so a Yellow manual is near enough
  const t1 = gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'trade'), give = t1.yours.find(y => y.ok)
  if (give) {
    const got = t1.offer.id
    const tr = gs.sectAct(r.id, 'trade', give.id)
    assert(tr.ok && (s.inventory['manual_' + got] || 0) >= 1 && r.deeds.some(d => /traded/.test(d.text)), `a trade hands over ${give.id} for ${got}`)
  } else assert(false, 'a near-grade manual can be traded')
  // ── Poach ──
  const d0 = s.ownSect.disciples.length, rd0 = r.disciples
  assert(gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'poach').nav === 'poach', 'the page’s Poach leads into the Disciples flow')
  const ro = gs.poachRoster(r.id)
  assert(ro.list.length > 0 && ro.list.every(d => d.cost > 0 && d.odds > 0 && d.loyalty >= 30), `their named disciples, each with a cost and odds (${ro.list.length})`)
  const lo = { ...ro.list[0], talent: 1, loyalty: 30 }, hi = { ...ro.list[0], talent: 5, loyalty: 90 }
  const tl = gs._poachTerms(r, lo), th = gs._poachTerms(r, hi)
  assert(th.cost > tl.cost && th.odds < tl.odds && th.stance < tl.stance, 'a gifted, loyal disciple costs more, is harder, and angers them more')
  const pick = ro.list[0], st1 = s.spiritStones
  const ok = force(sim, 0, () => gs.poachDisciple(r.id, pick.id))
  assert(ok.success && s.ownSect.disciples.some(d => d.id === pick.id && d.talent === pick.talent && d.level === pick.level) && r.disciples === rd0 - 1 && s.spiritStones === st1 - pick.cost, 'the disciple you chose comes over as they are; you paid')
  assert(r.deeds.some(d => d.text.includes(pick.name)) && !gs.poachRoster(r.id).list.some(d => d.id === pick.id), 'the sect remembers them by name, and they leave its roster')
  r.acted = {}
  const two = gs.poachRoster(r.id).list[0], l0 = two.loyalty
  force(sim, 0.999, () => gs.poachDisciple(r.id, two.id))
  assert(gs.poachRoster(r.id).list.find(d => d.id === two.id)?.loyalty > l0 || gs.poachRoster(r.id).lock, 'a failed lure leaves that disciple warier')
  assert(/Again in/.test(gs.poachRoster(r.id).lock), 'then poaching from them waits on its cooldown')
  s.ownSect.hallLevel = 1; while (gs._mainRoster().length < 5) s.ownSect.disciples.push(gs._newDisciple(1)); r.acted = {}; gs._recalc()
  assert(/seat/.test(gs.sectRelationsInfo(r.id).actions.find(a => a.id === 'poach').lock) && /seat/.test(gs.poachTargets().find(x => x.id === r.id).lock), 'no free seat: poaching is locked, with the reason')

  // ── A member ──
  const sim2 = await createSim({ seed: 4384 }); await sim2.boot(0); const g2 = sim2.gs, m = g2.get()
  m.stageIndex = 12; m.health = 100; m.spiritStones = 1e5; g2.joinSect('thunder_palace'); m.sect.rank = 3; m.sectWar.nextWarAt = Date.now() + 9e9; g2._recalc()
  const fr = m.world.sects.list.find(x => x.kind === 'rival')
  const mi = g2.sectRelationsInfo(fr.id)
  assert(ids(mi).includes('spar') && ids(mi).includes('urge') && ids(mi).includes('gift') && !ids(mi).includes('war'), 'a member sees gift, spar, urge, and not the leader\'s actions')
  const mine = g2._wsMine()
  assert(!g2.sectRelationsInfo(mine.id).actions.length, 'your own sect offers no actions against itself')
  const sp = g2.sectAct(fr.id, 'spar')
  assert(sp.fight && m.family.fight?.kind === 'spar' && !m.family.fight.lethal, 'a spar is a nonlethal fight on the battle page')
  const cc = m.sect.contribution
  playFight(g2, 'win'); g2.personFightFinish('raise')
  assert(m.sect.contribution === cc + R.spar.contribPerTier * mine.tier && !m.family.fight, 'winning the spar pays Contribution in your own sect')
  force(sim2, 0, () => g2.sectAct(fr.id, 'urge'))
  assert(m.sectWar.side === 'member' && m.sectWar.phase === 'scouting' && m.sectWar.enemyId === fr.id, 'your master heeds you: the sect marches on them')
  const fr2 = m.world.sects.list.find(x => x.kind === 'rival' && x !== fr)
  assert(/already at war/.test(g2.sectRelationsInfo(fr2.id).actions.find(a => a.id === 'urge').lock), 'no urging while your sect is at war')
})().catch(e => { console.log('FAIL crashed (43h):', e.stack); process.exitCode = 1 })
