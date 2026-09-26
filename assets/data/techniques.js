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
]
