// BIRTH_ORIGINS / CONSTITUTIONS / ALIGNMENT_TIERS / DAO_PATHS / TRIBULATION — M3 character foundation
// (Phases 12 Birth Origin, 13 Alignment, 39 Cultivation Path / Dao Reversal, 7A Dao Paths, 7C Heavenly Tribulation).
// Data only. Read by renderer/engine/game-state.js (_rollOrigin, alignmentInfo, daoPathInfo, chooseDaoPath,
// revertDaoPath, attemptBreakthrough) and the Character view. Spec: docs/systems/character.md.

// ── Phase 12: Birth Origin ────────────────────────────────────────────────────────────────────────────────
// An origin = a province + a family + a constitution. `weight` is its roll chance for an orphan/fresh soul;
// an heir reuses the clan's origin (the clan remembers where it came from). Effects are small and permanent
// for the life: qps (Qi/s multiplier), bt (breakthrough add), cap (Qi-cap multiplier), karma (start offset),
// stones (starting Spirit Stones).
const CONSTITUTIONS = {
  plain:  { name: 'Mortal Frame',   cn: '凡体', desc: 'An ordinary body, without a hook for heaven to grab. No gift, no flaw.', qps: 1.00, bt: 0.00, cap: 1.00 },
  spirit: { name: 'Spirit-Veined',  cn: '灵体', desc: 'The meridians drink Qi a little faster than they should.',                 qps: 1.06, bt: 0.01, cap: 1.00 },
  iron:   { name: 'Iron-Boned',     cn: '铁骨体', desc: 'Bones that ring when struck; the body endures what would break others.',    qps: 0.98, bt: 0.00, cap: 1.04 },
  frost:  { name: 'Frost-Rooted',   cn: '寒灵体', desc: 'A coldness in the marrow that steadies a trembling Dao heart.',             qps: 1.02, bt: 0.02, cap: 1.00 },
  sword:  { name: 'Sword-Hearted',  cn: '剑心体', desc: 'The heart is a blade; it finds the opening before the mind does.',          qps: 1.03, bt: 0.02, cap: 1.00 },
  hollow: { name: 'Hollow Vessel',  cn: '空灵体', desc: 'A hollow space where a self should be — Qi pours in to fill it.',           qps: 1.00, bt: 0.00, cap: 1.06 },
}

const BIRTH_ORIGINS = [
  { id: 'rice_village', name: 'Rice Village', region: 'The Verdant Plains', family: 'Tenant farmers',
    desc: 'A childhood of mud, rice, and thin porridge. You learned early that the harvest does not wait.',
    weight: 24, start: { stones: 8, karma: 2 }, qps: 1.00, bt: 0.01, cap: 1.00,
    constitutions: { plain: 60, spirit: 18, iron: 12, frost: 6, sword: 4, hollow: 0 } },
  { id: 'river_town', name: 'River Town', region: 'The Riverlands', family: 'Merchants',
    desc: 'Weighing scales, river barges, and the first coins you ever cheated a stranger out of.',
    weight: 18, start: { stones: 35, karma: -2 }, qps: 1.02, bt: 0.00, cap: 1.00,
    constitutions: { plain: 55, spirit: 20, iron: 6, frost: 8, sword: 8, hollow: 3 } },
  { id: 'mountain_hold', name: 'Mountain Hold', region: 'The Grey Peaks', family: 'Hunters',
    desc: 'Snow, sinew, and a bow taller than you were. The mountain decides who is allowed to leave it.',
    weight: 16, start: { stones: 5, karma: 0 }, qps: 0.99, bt: 0.01, cap: 1.03,
    constitutions: { plain: 45, spirit: 10, iron: 30, frost: 10, sword: 5, hollow: 0 } },
  { id: 'scholar_manor', name: 'Scholar Manor', region: 'Cloud Prefecture', family: 'Scholars',
    desc: 'Ink, gossip, and a library that was never quite forbidden. You read faster than you ran.',
    weight: 14, start: { stones: 20, karma: 1 }, qps: 1.01, bt: 0.03, cap: 1.02,
    constitutions: { plain: 50, spirit: 25, iron: 3, frost: 10, sword: 7, hollow: 5 } },
  { id: 'sect_ward', name: 'Sect Ward', region: 'Any province', family: 'A sect outer court',
    desc: 'You grew up sweeping a courtyard where cultivators walked, close enough to their light to taste it.',
    weight: 12, start: { stones: 15, karma: 0 }, qps: 1.04, bt: 0.01, cap: 1.00,
    constitutions: { plain: 40, spirit: 30, iron: 8, frost: 8, sword: 10, hollow: 4 } },
  { id: 'orphan_streets', name: 'The Streets', region: 'No province', family: 'Orphan',
    desc: 'No clan, no name worth remembering, and a hunger that sharpened everything else.',
    weight: 16, start: { stones: 2, karma: -3 }, qps: 1.01, bt: 0.02, cap: 1.00,
    constitutions: { plain: 50, spirit: 15, iron: 15, frost: 5, sword: 5, hollow: 10 } },
]

// ── Phase 13: Alignment ───────────────────────────────────────────────────────────────────────────────────
// −100…100. Derived drift: each game year it moves toward (karma − 50) × 1.6 plus the Dao path's pull, so
// how you live tilts it. Path choice and Dao Reversal shift it directly.
const ALIGNMENT_TIERS = [
  { id: 'demonic',    name: 'Demonic',    min: -100, max: -40, tone: 'red' },
  { id: 'wayward',    name: 'Wayward',    min: -40,  max: -15, tone: 'red' },
  { id: 'neutral',    name: 'Neutral',    min: -15,  max: 15,  tone: '' },
  { id: 'decent',     name: 'Decent',     min: 15,   max: 40,  tone: 'jade' },
  { id: 'righteous',  name: 'Righteous',  min: 40,   max: 100, tone: 'jade' },
]
const ALIGNMENT_DRIFT = { karmaWeight: 1.6, maxStep: 5, pathPull: 20 }

// ── Phases 39A/39B/7A: the Cultivation Path ───────────────────────────────────────────────────────────────
// Everyone cultivates the Basic Method until their first Core Formation breakthrough (stage 13), then the
// path is a CHOICE (never rolled). A path pulls alignment, changes Qi/s and breakthrough odds, and gates
// future paths (v2's Immortal Paths). Dao Reversal: once per life, a costly attempt to switch.
const DAO_PATH_CORE_STAGE = 13
const DAO_PATHS = {
  basic:    { name: 'The Basic Method', cn: '筑基法', tone: '',      qps: 1.00, bt: 0.00, alignPull: 0,
              desc: 'No path yet — the plain foundation every cultivator walks before the road forks.' },
  virtuous: { name: 'The Virtuous Path', cn: '正道', tone: 'jade',   qps: 0.96, bt: 0.05, alignPull: +20, minAlign: 15,
              desc: 'Mercy, restraint, and a heart turned toward heaven.',
              tradeoff: 'Slower Qi growth, but steadier breakthroughs and a kinder world.' },
  neutral:  { name: 'The Neutral Path', cn: '中庸', tone: 'gold',    qps: 1.05, bt: 0.01, alignPull: 0,
              desc: 'Neither saint nor monster — the road as it comes.',
              tradeoff: 'A little more Qi, a little less certainty.' },
  demonic:  { name: 'The Demonic Path', cn: '魔道', tone: 'red',     qps: 1.16, bt: -0.05, alignPull: -20, maxAlign: -15,
              desc: 'Power taken rather than given. The heavens dislike it; the body does not.',
              tradeoff: 'Much more Qi, harder breakthroughs, and the world remembers.' },
}
const DAO_REVERSAL = { oncePerLife: true, baseChance: 0.55, failHealthFrac: 0.4, sealArts: true }

// ── Phase 7C: Heavenly Tribulation ───────────────────────────────────────────────────────────────────────
// Crossing into a new realm calls down a tribulation. It damages Health (a 23A damage source), reduced by
// the body tier and Integrity. It floors at 1 in v1 — a scar, not a death — until the full dramatic version
// (7C's animation + choices) lands; the floor keeps the early pacing safe.
const TRIBULATION = {
  damageByStage: { 10: 0.06, 13: 0.08, 16: 0.11, 19: 0.15 },
  bodyReduce: 0.35,        // a full body tier (6) sheds up to ~35% of it
  integrityReduce: 0.30,   // full Integrity sheds up to ~30%
  floorHealth: 1,
}
