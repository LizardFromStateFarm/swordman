// Martial arts and cultivation techniques available to learn.
// effect.type values: 'qps_mult', 'breakthrough_bonus', 'karma_gain', 'qi_cap_mult'

const TECHNIQUES = [
  // ── BASIC ────────────────────────────────────────────────────────────────
  {
    id: 'qi_breathing', name: 'Qi Breathing Art', nameCN: '吐纳功',
    element: 'any', minStage: 0, cost: 0,
    desc: 'The most basic breathing technique. Permanently improves Qi absorption.',
    effect: { type: 'qps_mult', value: 1.25 },
    owned: true,  // everyone starts with this
    flavor: '"Breathe in the world\'s qi, breathe out mortal dust."',
  },
  {
    id: 'iron_body', name: 'Iron Body Tempering', nameCN: '铁体锻炼',
    element: 'earth', minStage: 1, cost: 5,
    desc: 'Tempers the body with earthen Qi. Improves Qi cap.',
    effect: { type: 'qi_cap_mult', value: 1.50 },
    flavor: '"The body is the vessel; without a strong vessel, Qi spills to waste."',
  },
  {
    id: 'wind_steps', name: 'Wind Steps', nameCN: '风行步',
    element: 'wind', minStage: 2, cost: 8,
    desc: 'Circulates Qi through the legs. Subtly accelerates all cultivation.',
    effect: { type: 'qps_mult', value: 1.40 },
    flavor: '"Move like the wind and Qi flows like a river."',
  },
  {
    id: 'heart_flame', name: 'Heart Flame Sutra', nameCN: '心火经',
    element: 'fire', minStage: 3, cost: 20,
    desc: 'Ignites inner fire. Greatly accelerates Qi generation.',
    effect: { type: 'qps_mult', value: 1.80 },
    flavor: '"The flame that burns inward is the hottest flame of all."',
  },
  {
    id: 'jade_root', name: 'Jade Root Cultivation', nameCN: '玉根功',
    element: 'wood', minStage: 4, cost: 30,
    desc: 'Draws upon wood-element Qi of the earth. Boosts Qi rate.',
    effect: { type: 'qps_mult', value: 2.00 },
    flavor: '"The ancient tree remembers what mortals have forgotten."',
  },
  {
    id: 'void_heart', name: 'Void Heart Mantra', nameCN: '空心咒',
    element: 'void', minStage: 7, cost: 80,
    desc: 'Empties the mind entirely. Breakthrough chance greatly increased.',
    effect: { type: 'breakthrough_bonus', value: 0.12 },
    flavor: '"Where there is nothing, the Dao finds room to enter."',
  },
  {
    id: 'celestial_orbit', name: 'Celestial Orbit Technique', nameCN: '天轨功',
    element: 'any', minStage: 10, cost: 600,   // was 150 — ×3 Qi/s; price keeps its timing on the pacing curve // economy pass 2026-09-25 (npm run sim)
    desc: 'Cycles Qi through all twelve meridians. Massive Qi gain multiplier.',
    effect: { type: 'qps_mult', value: 3.00 },
    flavor: '"Heaven turns, earth revolves, and so too must your cultivation."',
  },
  {
    id: 'karma_cultivation', name: 'Karma Cultivation Art', nameCN: '因果功',
    element: 'void', minStage: 5, cost: 40,
    desc: 'Accumulates karmic fortune passively. Improves all breakthrough attempts.',
    effect: { type: 'karma_gain', value: 0.5 },
    flavor: '"Every deed sows seeds. Tend them well."',
  },

  // ── LATE REALM (Phase 51: techniques past stage 10 — the late dead zone) ────
  // Small multipliers on purpose: they stack on every earlier technique, so a big value would balloon
  // the late Qi curve the same phase is smoothing. Costs scale with late-stage stone income.
  {
    id: 'starlight_sutra', name: 'Starlight Sutra', nameCN: '星光经',
    element: 'any', minStage: 12, cost: 4000,
    desc: 'Draws the cold light of distant stars into the meridians.',
    effect: { type: 'qps_mult', value: 1.30 },
    flavor: '"A star is a sun that learned patience."',
  },
  {
    id: 'heart_of_heaven', name: 'Heart of Heaven', nameCN: '天心诀',
    element: 'any', minStage: 14, cost: 8000,
    desc: 'Aligns the Dao heart with the turning of heaven. Steadies every breakthrough.',
    effect: { type: 'breakthrough_bonus', value: 0.05 },
    flavor: '"Ask not for a longer road. Ask for steadier feet."',
  },
  {
    id: 'void_marrow', name: 'Void Marrow Refinement', nameCN: '虚髓炼',
    element: 'void', minStage: 16, cost: 16000,
    desc: 'Hollows the marrow so it can hold more of the void.',
    effect: { type: 'qi_cap_mult', value: 1.35 },
    flavor: '"Make of yourself a vessel with no bottom."',
  },
  {
    id: 'nine_turn_orbit', name: 'Nine-Turn Orbit', nameCN: '九转周天',
    element: 'any', minStage: 18, cost: 32000,
    desc: 'Nine complete circulations in a single breath, each faster than the last.',
    effect: { type: 'qps_mult', value: 1.40 },
    flavor: '"The first turn is the world. The ninth is the Dao."',
  },
  {
    id: 'immortal_breath', name: 'Immortal Breath', nameCN: '仙息',
    element: 'any', minStage: 20, cost: 64000,
    desc: 'A breath taken once an hour, each one worth a mortal lifetime of gathering.',
    effect: { type: 'qps_mult', value: 1.50 },
    flavor: '"Mortals count breaths. Immortals count ages."',
  },
  {
    id: 'heaven_gate_key', name: "Heaven's Gate Key", nameCN: '天关钥',
    element: 'void', minStage: 21, cost: 120000,
    desc: 'The last lock before the heavenly gate answers a little more readily.',
    effect: { type: 'breakthrough_bonus', value: 0.06 },
    flavor: '"The gate was never locked. It was only waiting for a hand that had earned it."',
  },
]
