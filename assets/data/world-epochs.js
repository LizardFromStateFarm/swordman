// WORLD_EPOCHS — M8 World Epochs & Spiritual Tides (Phase 19, docs/systems/world-flavor.md).
// Data only. The world turns through ages on the game clock; each shapes Qi/s for everyone (a tide). Read by
// renderer/engine/game-state.js (_tickEpoch / epochInfo / _recalc) and the Character / Chronicle UI.
const WORLD_EPOCHS = [
  { id: 'dawn',   name: 'The Dawning Age',   desc: 'The world is young and the Qi lies close to the surface.', qi: 1.00, years: 400 },
  { id: 'tide',   name: 'The Rising Tide',   desc: 'Spiritual tides swell across the provinces; cultivation comes easily.', qi: 1.12, years: 400 },
  { id: 'wither', name: 'The Withering',     desc: 'The tides recede. What was easy now demands twice the patience.', qi: 0.92, years: 400 },
  { id: 'chaos',  name: 'The Age of Chaos',  desc: 'Heaven and earth are restless; Qi runs wild and dangerous and rich.', qi: 1.20, years: 400 },
]
const EPOCH_DEFAULT = 'dawn'
