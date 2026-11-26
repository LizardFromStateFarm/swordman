// Scenario checks — M5 Deep Sect Management (docs/systems/sect-management.md).
// Offices (appointment, fit, replacement souring a disciple, defection), the recruitment policy + auto-recruit,
// promotions, the derived office bonuses, and the sect tier. Run: npm run checks · node scripts/sim/checks/sect-management.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  // A founded sect with three disciples, without the founding cost.
  const mk = (id, talent, personality, level = 3) => ({ id, name: id.toUpperCase(), talent, level, xp: 0, branchId: null, role: 'disciple', kin: false, personality, loyalty: 60 })
  s.ownSect = { ...gs._blankOwnSect(), founded: true, name: 'Test Hall', hallLevel: 2,
    disciples: [mk('a', 4, 'stoic'), mk('b', 3, 'niceguy'), mk('c', 2, 'lazy')] }
  gs._recalc()

  // ── Offices ──
  assert(gs.sectOfficeInfo().every(o => !o.holder), 'offices start vacant')
  const baseIncome = gs.get().derived.ownSectIncomeMult
  assert(gs.appointOffice('steward', 'a').ok, 'a disciple can be appointed to an office')
  const withSteward = gs.get().derived.ownSectIncomeMult
  assert(withSteward > baseIncome, `a Steward raises disciple income (×${baseIncome.toFixed(2)} → ×${withSteward.toFixed(2)})`)
  assert(gs.sectOfficeInfo().find(o => o.id === 'steward').holder.fit === true, 'a personality fit is recorded (stoic → Steward)')
  assert(gs.appointOffice('steward', 'b').ok && s.ownSect.disciples.find(d => d.id === 'a').loyalty === 45, 'replacing a holder sours them (−15 loyalty)')
  assert(gs.clearOffice('steward').ok && !gs.sectOfficeInfo().find(o => o.id === 'steward').holder, 'an office can be cleared')

  // Defection: a wrong at zero loyalty makes them leave
  let a = s.ownSect.disciples.find(d => d.id === 'a'); a.loyalty = 10
  s.ownSect.offices.steward = 'a'          // seat them, then take it away
  gs.appointOffice('steward', 'c')
  a = s.ownSect.disciples.find(d => d.id === 'a')
  assert(!a, 'a disciple driven to zero loyalty leaves the sect')

  // ── Promotion ──
  const beforeYield = gs.get().derived.qiPerSecond
  assert(gs.promoteDisciple('b').ok, 'a disciple can be promoted to inner')
  assert(s.ownSect.disciples.find(d => d.id === 'b').role === 'inner', 'the promotion sets the inner role')
  gs._recalc()
  assert(gs.get().derived.qiPerSecond >= beforeYield, 'an inner disciple does not reduce sect output')

  // ── Recruitment policy + auto-recruit ──
  assert(gs.setRecruitPolicy({ strictness: 2, minTalent: 3, autoRecruit: true }).ok, 'the recruitment policy can be set')
  const pol = gs.recruitPolicyInfo()
  assert(pol.strictness === 2 && pol.minTalent === 3 && pol.autoRecruit === true, 'the policy round-trips')
  s.ownSect.recruitPool = [{ id: 'r1', name: 'R One', talent: 4 }]
  s.spiritStones = 10000
  const n0 = s.ownSect.disciples.length
  gs.tickOwnSect(1)
  assert(s.ownSect.disciples.length === n0 + 1, 'auto-recruit takes the best waiting candidate')

  // ── Recruiter eye ──
  s.ownSect.offices.recruiter = 'c'
  assert(gs._recruitTalentBonus(3) === 4, 'a seated Recruiter lifts a candidate +1 talent')

  // ── Sect tier (derived from fame) ──
  s.ownSect.hallLevel = 4
  gs._recalc()
  assert(gs.sectTierInfo().id !== 'humble', `a built hall reads above humble (${gs.sectTierInfo().name}, fame ${Math.round(gs.get().derived.sectFame)})`)

  // ── Migration ──
  delete s.ownSect.offices; delete s.ownSect.policy
  for (const d of s.ownSect.disciples) { delete d.loyalty; delete d.role; delete d.personality }
  gs._ensurePhase5Fields()
  assert(s.ownSect.offices && s.ownSect.policy, 'migration fills offices + policy')
  assert(s.ownSect.disciples.every(d => typeof d.loyalty === 'number' && d.role && d.personality), 'migration fills disciple loyalty / role / personality')
})()
