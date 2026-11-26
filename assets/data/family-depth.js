// FAMILY_VISIONS — M6 Ancestral Visions (Phase 18E, docs/systems/family-depth.md).
// Data only. An heir born into a clan that has earned any Merit may receive one ancestor's vision: a choose-one
// boon for the life (never rolled for you). Read by renderer/engine/game-state.js (visionOfferInfo / chooseVision /
// _beginLife / _recalc) and renderer/game/clan-view.js (Kin → Hall).
const FAMILY_VISIONS = [
  { id: 'qi',        name: 'The Ancestors Breathe',   desc: '+10% Qi/s for this life.',        qps: 1.10 },
  { id: 'body',      name: 'The Old Bones Remember',   desc: '1,200 body XP at once.',          bodyXp: 1200 },
  { id: 'integrity', name: 'A Steady Foundation',      desc: '+20 Integrity at once.',          integrity: 20 },
  { id: 'stones',    name: 'A Hidden Purse',           desc: '300 Spirit Stones at once.',       stones: 300 },
]
const FAMILY_VISION_COUNT = 3   // options offered (a deterministic subset, never Math.random)
