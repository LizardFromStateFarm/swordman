// UNLOCK_GROUPS / UNLOCK_VIEWS / UNLOCK_RULES — Phase 50 progressive disclosure (docs/systems/unlocks.md).
// Data only. Read by renderer/game/unlocks.js (viewUnlocked / availableViews / lockedGroups) and game.js.
//
// A rule tests the save; any condition that passes UNLOCKS the view:
//   always:true   open from the first frame (the mortal verbs: Explore + Body)
//   awaken:true   after the meridians open (Qi Condensation 1)
//   stage:n       s.stageIndex >= n (0 = mortal, 1–9 = Qi Condensation layers, 10+ = Foundation Building)
//   anySect:true  joined a sect OR founded one (existing state always re-opens a gate)
//   founded:true  founded a sect of your own
//   family:true   a proposal, spouse, lover or child exists (existing family re-opens the gate)
//
// The schedule keeps the opening to Explore + Body, then hands the player one system at a time. The
// thresholds are the same stages the systems themselves require (sects open at QC 2, marriage at FB).

const UNLOCK_GROUPS = [
  { id: 'cultivate', name: 'Path' },
  { id: 'adventure', name: 'Roam' },
  { id: 'kin',       name: 'Kin' },
  { id: 'sect',      name: 'Sect' },
  { id: 'pack',      name: 'Pack' },
  { id: 'log',       name: 'World' },
]

// Ordered so a "locked" group names the soonest gate among its views.
const UNLOCK_VIEWS = [
  { view: 'explore',        group: 'adventure', label: 'Explore' },
  { view: 'physique',       group: 'cultivate', label: 'Body' },
  { view: 'stats',          group: 'cultivate', label: 'Character' },
  { view: 'techniques',     group: 'cultivate', label: 'Techniques' },
  { view: 'pack',           group: 'pack',      label: 'Items' },
  { view: 'events',         group: 'log',       label: 'Events' },
  { view: 'banter',         group: 'log',       label: 'Banter' },
  { view: 'beasts',         group: 'adventure', label: 'Beasts' },
  { view: 'arts',           group: 'cultivate', label: 'Arts' },
  { view: 'hunt',           group: 'adventure', label: 'Hunt' },
  { view: 'sect',           group: 'sect',      label: 'Sect' },
  { view: 'sect-missions',  group: 'sect',      label: 'Missions' },
  { view: 'sect-library',   group: 'sect',      label: 'Library' },
  { view: 'sect-halls',     group: 'sect',      label: 'Halls' },
  { view: 'sect-base',      group: 'sect',      label: 'Base' },
  { view: 'sect-disciples', group: 'sect',      label: 'Disciples' },
  { view: 'sect-war',       group: 'sect',      label: 'War' },
  { view: 'arena',          group: 'adventure', label: 'Arena' },
  { view: 'bestiary',       group: 'adventure', label: 'Bestiary' },
  { view: 'craft',          group: 'pack',      label: 'Craft' },
  { view: 'world',          group: 'log',       label: 'Sects' },
  { view: 'people',         group: 'log',       label: 'People' },
  { view: 'chronicle',      group: 'log',       label: 'Chronicle' },
  { view: 'class',          group: 'log',       label: 'Class' },
  { view: 'rankings',       group: 'log',       label: 'Rankings' },
  { view: 'rival',          group: 'log',       label: 'Rival' },
  { view: 'family',         group: 'kin',       label: 'Family' },
  { view: 'tree',           group: 'kin',       label: 'Tree' },
  { view: 'clan',           group: 'kin',       label: 'Clan' },
  { view: 'hall',           group: 'kin',       label: 'Hall' },
]

const UNLOCK_RULES = {
  // The mortal opening: only these two, until Awakening.
  explore:  { always: true },
  physique: { always: true },

  // Awakening opens the core verbs and the Path.
  stats:      { awaken: true },
  techniques: { awaken: true },
  pack:       { awaken: true },
  events:     { awaken: true },
  banter:     { awaken: true },
  beasts:     { awaken: true },

  // Qi Condensation 2: arts, hunting, a sect (its lowest gate is minStage 2), the arena.
  arts:          { stage: 2 },
  hunt:          { stage: 2 },
  sect:          { stage: 2 },
  'sect-missions': { stage: 2 },
  'sect-library':  { stage: 2 },
  arena:         { stage: 2 },

  // Qi Condensation 3: the bestiary and the furnace.
  bestiary: { stage: 3 },
  craft:    { stage: 3 },

  // Qi Condensation 4–7: the world opens in layers.
  world:     { stage: 4 },
  people:    { stage: 4 },
  chronicle: { stage: 5 },
  class:     { stage: 5 },
  rankings:  { stage: 6 },
  rival:     { stage: 7 },

  // Your own sect's deeper pages (only shown once you have a sect anyway).
  'sect-halls':     { stage: 2, anySect: true },
  'sect-base':      { stage: 2, anySect: true },
  'sect-disciples': { stage: 2, anySect: true },
  'sect-war':       { stage: 2, anySect: true },

  // Foundation Building: the family and clan, or as soon as a family exists.
  family: { stage: 10, family: true },
  tree:   { stage: 10, family: true },
  clan:   { stage: 10, family: true },
  hall:   { stage: 10, family: true },
}
