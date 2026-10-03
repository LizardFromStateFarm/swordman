// Scenario checks — the family tree (Kin → Tree, user 2026-10-03; docs/systems/family.md → "Family tree").
// Pins familyTreeInfo(): you at gen 0; parents / grandparents / great-grandparents up the `parents` chain (no further);
// full vs half siblings; spouse, former spouse and a lover who bore a child; children (alive, dead, estranged) with
// their spouses; grandchildren; a past life in the line is marked, one outside it is listed apart; the clan head + heir
// marks; counts for the Family tab's door. Read-only (state unchanged). Run: npm run checks · node scripts/sim/checks/family-tree.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 3303 }); await sim.boot(0); const gs = sim.gs, s = gs.get(), w = s.world
  const yr = Math.floor(w.year)
  const mk = (role, born, parents = [], extra = {}) => { const p = gs._genPerson({ family: 'Lin', bornYear: born, stage: 3, role, parents }); Object.assign(p, extra); w.persons[p.id] = p; return p }
  // Four generations up (the 4th must not show)
  const gg1 = mk('kin', yr - 120), gg2 = mk('kin', yr - 118)
  const great = mk('kin', yr - 130)
  const gp1 = mk('ancestor', yr - 90, [gg1.id, gg2.id], { alive: false, diedYear: yr - 20, cause: 'old_age' }), gp2 = mk('kin', yr - 88)
  gg1.parents = [great.id]
  const pa = mk('kin', yr - 50, [gp1.id, gp2.id]), pb = mk('kin', yr - 48)
  const other = mk('kin', yr - 45)
  s.self.parents = [pa.id, pb.id]; s.self.bornYear = yr - 20
  const sib = mk('kin', yr - 25, [pa.id, pb.id]), half = mk('kin', yr - 15, [pa.id, other.id])
  w.pastLives.push({ personId: gp1.id, clanId: w.playerClanId, lineId: w.playerLineId, cause: 'old_age', year: yr - 20, maxStage: 9, generation: 1 })
  const stranger = mk('ancestor', yr - 300, [], { alive: false, diedYear: yr - 200 })
  w.pastLives.push({ personId: stranger.id, clanId: null, cause: 'event', year: yr - 200, maxStage: 4, generation: 2 })
  // Partners, children, grandchildren
  const sp = mk('spouse', yr - 21), ex = mk('former_spouse', yr - 22), lov = mk('lover', yr - 19)
  s.family.spouse = sp; s.family.affection = 70; s.family.formerSpouses = [{ ...ex, endCause: 'separated', endedYear: yr - 2 }]
  s.family.lovers = [{ person: lov, since: yr - 3 }]
  const k1 = mk('child', yr - 3, [s.self.id, sp.id], { bond: 64 }), k2 = mk('child', yr - 2, [s.self.id, lov.id], { alive: false, diedYear: yr - 1 })
  const k3 = mk('child', yr - 4, [s.self.id, ex.id], { estranged: true })
  const inlaw = mk('spouse', yr - 4); k1.spouseIds = [inlaw.id]
  s.family.children = [k1, k2, k3]; s.family.heirId = k1.id
  const gk = mk('kin', yr, [k1.id, inlaw.id])
  w.clans[w.playerClanId].headId = pa.id
  const before = JSON.stringify(s.family)

  const T = gs.familyTreeInfo(), N = id => T.nodes.find(n => n.id === id)
  assert(N(s.self.id)?.you && N(s.self.id).gen === 0, 'you sit at generation 0')
  assert(N(pa.id)?.gen === -1 && N(pb.id)?.gen === -1 && N(gp1.id)?.gen === -2 && N(gg1.id)?.gen === -3, 'parents, grandparents and great-grandparents up the line')
  assert(!N(great.id), 'no further than three generations up')
  assert(N(sib.id)?.rel === 'Sibling' && N(half.id)?.rel === 'Half-sibling', 'full and half siblings')
  assert(N(sp.id)?.rel === 'Spouse' && N(sp.id).affection === 70 && N(sp.id).open === 'spouse', 'your spouse, with affection, opens on Family')
  assert(N(ex.id)?.rel === 'Former spouse' && N(ex.id).former && N(lov.id)?.rel === 'Lover', 'a former spouse, and a lover who bore your child')
  assert(N(k1.id)?.open === 'child' && N(k1.id).bond === 64 && N(k1.id).heir, 'a child at home: bond, heir mark, opens on Family')
  assert(N(k2.id) && !N(k2.id).alive && N(k2.id).open === null, 'a child who died stays on the tree, faded, no actions')
  assert(N(k3.id)?.estranged && N(k3.id).open === null, 'an estranged child is marked')
  assert(N(inlaw.id)?.partnerOf === k1.id && N(gk.id)?.gen === 2, "a child's spouse beside them; a grandchild below")
  assert(N(gp1.id)?.pastLife === 1 && !N(gp1.id).alive && N(gp1.id).cause === 'old_age', 'a past life in the line is marked, with how it ended')
  assert(T.otherLives.length === 1 && T.otherLives[0].id === stranger.id, 'an earlier life outside the line is listed apart')
  assert(N(pa.id)?.head, 'the clan head is marked')
  assert(T.counts.parents === 2 && T.counts.siblings === 2 && T.counts.children === 3, "the Family tab's door counts parents, siblings, children")
  assert(JSON.stringify(s.family) === before, 'reading the tree changes nothing')
  // A first life with no one: just you
  const sim2 = await createSim({ seed: 3304 }); await sim2.boot(0)
  const T2 = sim2.gs.familyTreeInfo()
  assert(T2.nodes.length === 1 && T2.counts.parents === 0, 'a lone founder: the tree is just you')
})()
