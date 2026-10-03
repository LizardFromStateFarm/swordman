// Phase 28 task 4.3 (living-world.md §6): how the world's people live — lifespans by realm, breakthrough backlash, the
// yearly perils of the road, marriage + births, NPC Ascension, the pre-existing world and the per-life cohort (your class).
// 4.6 adds NPC_WORLD (the replacement controller: realm-band targets, waves, wanderers, hidden masters, the elder draft;
// the Chronicle's tuning) + NPC_CHRON_TEXT. Data only (death causes' words: world-population.js → PERSON_CAUSE_TEXT). Used by: renderer/engine/game-state.js (_tickWorldLives, _lifeStep, _seedWorldPeople, _seedCohort,
// classInfo, personInfo) and renderer/game/class-view.js. Tuned with scripts/sim/probe-npc-pace.js + npm run sim.

const NPC_LIVES = {
  // ── Lifespan (years) by the realm of a person's peak stage (maxStage). Old age is a BACKSTOP (user 2026-10-03):
  // generous, so most people fall to backlash, the road or a feud first. ±lifespanJitter per person (by hash).
  lifespanByRealm: { 'Mortal': 90, 'Qi Condensation': 200, 'Foundation Building': 300, 'Core Formation': 500,
                     'Nascent Soul': 850, 'Spirit Severing': 1400 },
  lifespanJitter: 0.15,
  twilightYears: 12,          // this many years before the end they enter final seclusion (a warning beat, shown on the card)
  oldAgeBase: 0.06,           // past the lifespan: yearly chance to die …
  oldAgePerYear: 0.03,        // … + this per year over, …
  oldAgeMax: 0.5,             // … capped.

  // ── Breakthrough between realms (stage 9→10, 12→13, 15→16, 18→19): an NPC who fills the stage must break through.
  // Success = base by the realm they reach + rootBonus × (root mult − 1), capped. A failure injures them or, at the
  // high realms, kills them (backlash). The injured cultivate at injuredMult for injuredYears, then try again.
  btSuccess: { 'Foundation Building': 0.75, 'Core Formation': 0.65, 'Nascent Soul': 0.55, 'Spirit Severing': 0.45 },
  btRootBonus: 0.06,
  btSuccessMax: 0.92,
  btDeathShare: { 'Foundation Building': 0.18, 'Core Formation': 0.28, 'Nascent Soul': 0.38, 'Spirit Severing': 0.48 },
  injuredYears: [6, 16],
  injuredMult: 0.4,

  // ── The perils of the world: a yearly chance of a violent death, by role (the cause is drawn from that role's table).
  hazard: { wanderer: 0.013, stranger: 0.013, duelist: 0.012, disciple: 0.01, sect_elder: 0.006, sect_master: 0.004,
            retired_master: 0.004, old_monster: 0.004, youth: 0.002, kin: 0.004, default: 0.01 },
  hazardHighStage: 13,        // from Core Formation the strong are harder to kill …
  hazardHighMult: 0.6,        // … × this
  hazardChosenMult: 0.5,      // Heaven's Chosen have backers and luck: half the peril
  hazardCauses: {
    wanderer: { road: 4, beast_hunt: 2, feud: 2, duel: 1 },
    disciple: { sect_clash: 3, beast_hunt: 2, road: 1, duel: 1 },
    sect:     { sect_clash: 3, feud: 2, duel: 1 },
    default:  { road: 2, beast_hunt: 1, feud: 1 },
  },

  // ── Marriage + children (world-owned NPCs only; clans and your family run their own).
  marryAge: 22,
  marryChance: 0.03,          // a yearly chance that a single adult seeks a match
  marryAgeGap: 45,
  marryStageGap: 5,
  birthChance: 0.05,          // a yearly chance per living couple …
  birthMaxChildren: 3,
  birthMaxAge: 260,           // … while both are younger than this
  birthSoftCap: 0.8,          // births thin out as the living count nears lightMax × this (4.6 adds the full controller)

  // ── NPC Ascension (no Immortal-era content: the ascended simply leave the world, user 2026-10-03).
  ascendYearsAtPeak: 40,      // years at the last mortal stage before they dare the Trial
  ascendTryChance: 0.04,      // yearly, once eligible
  ascendSuccess: 0.3,
  ascendRootBonus: 0.08,

  // ── The pre-existing world (seeded once per slot, beside the world sects' masters + elders).
  seedWanderers: 64,
  seedWandererStage: [1, 12],
  seedOldMonsters: 6,
  seedMonsterStage: [17, 21],
  seedCouples: 0.3,           // share of wanderers already married to another wanderer …
  seedChildren: [0, 2],       // … with this many children

  // ── Your class: every life, about 60 youths awaken in the same year you do (§6.1, user Q2).
  cohortSize: 60,
  cohortChosen: 3,            // Heaven's Chosen: a rare root and a talent that out-paces you early
  cohortSpread: [               // the rest: share, talent (× the flat pace), root types
    { share: 0.6, talent: [0.6, 0.85], roots: { mixed: 8, dual: 2 } },
    { share: 0.4, talent: [0.9, 1.15], roots: { mixed: 4, dual: 5, pure: 1 } },
  ],
  chosenTalent: [1.2, 1.4],
  chosenRoots: { heavenly: 1, pure: 2 },
  cohortBornJitter: [0, 1],   // born the same year as you, give or take
  cohortJoinSect: 0.04,       // yearly chance an unsworn classmate joins a sect …
  cohortJoinYoursMult: 4,     // … your sect weighted this much more

  // ── Upkeep
  pruneEvery: 10,             // years between prunes of the long dead
  pruneAfter: 200,            // a forgettable dead person is forgotten this long after death
  logFromStage: 10,           // a classmate's breakthrough is news from Foundation Building on
}

// Log lines for news about the people you know. Tokens: {name} {realm} {sect} {cause}.
const NPC_LIFE_TEXT = {
  classmateRealm: 'Your classmate {name} has broken through to {realm}.',
  chosenRealm: 'Heaven’s Chosen {name} has broken through to {realm}. The class whispers.',
  classmatePassed: '{name}, who awakened the same year as you, now stands above you at {realm}.',
  classmateFell: 'Your classmate {name} is dead. {cause}.',
  chosenFell: 'Heaven’s Chosen {name} is dead. {cause}. A bright star goes out.',
  kinFell: '{name} of your clan has passed on. {cause}.',
  knownFell: '{name} has passed on. {cause}.',
  twilight: '{name}’s hair has gone white. They enter final seclusion.',
  injured: '{name} was wounded by a failed breakthrough and has gone into seclusion to heal.',
  married: 'Your classmate {name} has married {spouse}.',
  ascended: 'Thunder rolls across the sky: {name} has Ascended. The world has one immortal more.',
  ascendFailed: '{name} attempted the Ascension Trial. The lightning took them.',
  elderFell: 'Elder {name} of the {sect} has passed on. {cause}.',
  masterFell: 'The {sect} buries its master: {name} is gone ({cause}).',
  hidden: 'An old monster breaks seclusion: {name}, at {realm}. The peaks shake.',
  hiddenSeizedYours: '{name}, an old monster out of seclusion, has taken the master’s seat of your sect, the {sect}. {old} {fate}.',
  draftedClassmate: 'Your classmate {name} is raised to elder of the {sect}.',
}

// ── Phase 28 task 4.6 (living-world.md §6.1): the replacement controller + the merged Chronicle ──────────────────────
// The world's living people (world-owned, not your family / arena / own sect) are counted by realm band once a game
// year. A thin band is refilled over years, never by an instant respawn; a crowded one grows dangerous.
const NPC_WORLD = {
  bands: [   // stage ranges are inclusive; target = the living the world settles around
    { id: 'low', name: 'Mortals & Qi Condensation', short: 'Qi Cond.', from: 0,  to: 9,  target: 190 },
    { id: 'fb',  name: 'Foundation Building',       short: 'Found.',   from: 10, to: 12, target: 30 },
    { id: 'cf',  name: 'Core Formation',            short: 'Core',     from: 13, to: 15, target: 14 },
    { id: 'ns',  name: 'Nascent Soul',              short: 'Nascent',  from: 16, to: 18, target: 8 },
    { id: 'ss',  name: 'Spirit Severing',           short: 'Severing', from: 19, to: 21, target: 4 },
  ],
  tolerance: 0.15,            // "thin" below target × (1 − this), "crowded" above target × (1 + this)

  // Births (4.3's couples) follow the low band: room = (target × birthRoomTop − low) / (target × birthRoomSpan), 0..1.
  birthRoomTop: 1.1,
  birthRoomSpan: 0.5,

  // Awakening waves: every waveEvery years, youths whose roots stir in the villages, sized to the low band's deficit.
  waveEvery: 10,
  waveShare: 0.45,            // of the low band's deficit …
  waveSize: [2, 14],          // … clamped (none at all while the band is full)
  waveAge: [0, 3],            // years past AWAKENING_AGE

  // Wanderers: a thin Foundation or Core band draws a wandering cultivator down from the far ranges (≤ 1 a band a year).
  wanderBands: ['fb', 'cf'],
  wanderChance: 0.7,          // × the band's deficit share (0..1)

  // Promotion: the band just below a thin band cultivates faster (the heavens fill a void) …
  thinBoost: 0.8,             // pace × (1 + this × deficit share)
  // … and a crowded band grows dangerous (feuds and duels multiply).
  crowdHazard: 1.8,

  // Hidden masters: a thin Nascent Soul / Spirit Severing band can wake an old monster from a long seclusion.
  hiddenBands: ['ns', 'ss'],
  hiddenChance: 0.45,         // a year, × the band's deficit share
  hiddenGap: 8,               // at least this many years between two
  hiddenSeclusion: [120, 480],
  hiddenRoots: { heavenly: 1, pure: 3, dual: 1 },
  // What they do on waking, weighted; a personality in hiddenAmbitious doubles 'seize' and 'found'.
  hiddenFates: { seize: 3, found: 2, wander: 4 },
  hiddenAmbitious: ['arrogant', 'demonking', 'psycho', 'hotblood', 'paranoid'],
  seizeGap: 2,                // they only take a seat from a master at least this many stages below them
  seizeKills: 0.45,           // the share of seizures where the old master falls defending the seat (else they withdraw)
  seizeStanceKeep: 0.5,       // a sect under a new master keeps this much of its stance toward you
  foundTier: [2, 3],

  // The elder draft: an empty elder's bench takes a living person first (a disciple of that sect, then an unsworn
  // wanderer within WORLD_PEOPLE.elderStageBelow of the master) before anyone new is minted.
  draftPool: 3,               // a seeded pick among the strongest few

  // The Chronicle (世 World → Chronicle): one capped feed of persons + sects.
  chronMax: 320,
  chronRiseStage: 13,         // anyone's breakthrough into Core Formation or higher is chronicled
  chronDeathStage: 13,        // anyone's death at Core Formation or higher is chronicled
  notableStage: 16,           // from Nascent Soul a death or breakthrough is Notable (the 世 dot + attention)
}

// The Chronicle's lines. Tokens: {name} {realm} {sect} {cause} {n} {years} {old} {best} {root} {spouse}.
const NPC_CHRON_TEXT = {
  wave: 'Spirit roots stir in the villages: {n} youths awaken this year.',
  waveBest: 'Spirit roots stir in the villages: {n} youths awaken this year. The brightest, {best}, carries a {root}.',
  wanderer: '{name}, a wandering cultivator of {realm}, comes down from the far ranges.',
  hidden: 'After {years} years sealed in a mountain, {name} breaks seclusion at {realm}. The peaks shake.',
  hiddenWander: '{name} walks the world alone and answers to no sect.',
  seizeKill: '{name} walks into the hall of the {sect} and takes the master’s seat. {old} fell defending it.',
  seizeYield: '{name} walks into the hall of the {sect} and takes the master’s seat. {old} bows and withdraws.',
  found: '{name} raises a gate on a nameless peak: the {sect}.',
  drafted: '{name} is raised to elder of the {sect}.',
  rise: '{name} has broken through to {realm}.',
  died: '{name} is dead at {realm}. {cause}.',
  twilight: '{name}, of {realm}, enters final seclusion. Their years are nearly spent.',
  wed: '{name} and {spouse} are wed.',
  ascended: 'Thunder rolls across the sky: {name} has Ascended.',
}
