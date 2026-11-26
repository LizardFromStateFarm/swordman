// SECT_OFFICES / SECT_TIERS / RECRUIT_POLICY — M5 Deep Sect Management (Phase 27, docs/systems/sect-management.md).
// Data only. Read by renderer/engine/game-state.js (sectOfficeInfo / appointOffice / setRecruitPolicy / _refreshRecruitPool /
// _recalc) and renderer/game/sect-view.js (Sect → Disciples).

// An office runs itself while a disciple holds it. Its bonus scales with the holder's talent (talent/5) and by
// ×1.2 when the holder's personality is a natural fit (`affinity`). Offsets are small and multiplicative/additive
// on top of the buildings, so an office is a choice, not a second building tree.
const SECT_OFFICES = [
  { id: 'steward',   name: 'Steward',   cn: '管事', effect: 'income',  value: 0.12, affinity: ['miser', 'stoic', 'paranoid'],
    desc: '+12% disciple stone/herb income (scaled by the holder).' },
  { id: 'trainer',   name: 'Trainer',   cn: '教习', effect: 'xp',      value: 0.25, affinity: ['niceguy', 'stoic', 'poet'],
    desc: 'Disciples gain +25% training XP (scaled by the holder).' },
  { id: 'warden',    name: 'Warden',    cn: '护法', effect: 'defense', value: 0.20, affinity: ['stoic', 'hotblood', 'grumpy'],
    desc: '+20% war defense (scaled by the holder).' },
  { id: 'recruiter', name: 'Recruiter', cn: '招贤', effect: 'recruit', value: 1.00, affinity: ['niceguy', 'poet', 'arrogant'],
    desc: 'A better class of candidate at the gate (a chance of +1 talent).' },
]
// Personalities that fit each office (×1.2). Any other holder still works at talent scale.

// Sect Tier is derived from fame (never stored): it biases the recruit pool toward talent.
const SECT_TIERS = [
  { id: 'humble',   name: 'A Humble Hall',  minFame: 0,   talentBias: 0 },
  { id: 'rising',   name: 'A Rising Sect',  minFame: 80,  talentBias: 0.08 },
  { id: 'great',    name: 'A Great Sect',   minFame: 250, talentBias: 0.16 },
  { id: 'heavenly', name: 'A Heavenly Sect', minFame: 600, talentBias: 0.24 },
]

// Recruitment policy (strictness): how choosy the gate is. Higher = fewer, better candidates, slower refresh.
const RECRUIT_POLICY_DEFAULT = { strictness: 0, minTalent: 1, autoRecruit: false }
const RECRUIT_STRICTNESS = [
  { strictness: 0, name: 'Open gate',    minTalent: 1, rerolls: 0, refreshSeconds: 900 },
  { strictness: 1, name: 'Selective',    minTalent: 2, rerolls: 3, refreshSeconds: 1200 },
  { strictness: 2, name: 'Exacting',     minTalent: 3, rerolls: 6, refreshSeconds: 1800 },
]

// Disciple loyalty: only direct wrongs move it (no passive decay — user rule "no upkeep chores").
const DISCIPLE_LOYALTY_START = 60
const DISCIPLE_WRONG_REPLACED = 15   // losing an office to someone else
const DISCIPLE_LEAVE_AT = 0
const DISCIPLE_INNER_YIELD = 1.10    // a promoted inner disciple feeds 10% more
