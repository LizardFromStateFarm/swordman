// Phase 28 task 4.3 (living-world.md §6): how the world's people live — lifespans by realm, breakthrough backlash, the
// yearly perils of the road, marriage + births, NPC Ascension, the pre-existing world and the per-life cohort (your class).
// 4.4+4.5 add NPC_HEAVY (heavy tier, goals by temper), NPC_CAST (known-first casting + throttle), NPC_DEED_TEXT, NPC_ACT_TEXT.
// 4.6 adds NPC_WORLD (the replacement controller: realm-band targets, waves, wanderers, hidden masters, the elder draft;
// the Chronicle's tuning) + NPC_CHRON_TEXT. Data only (death causes' words: world-population.js → PERSON_CAUSE_TEXT). Used by: renderer/engine/game-state.js (_tickWorldLives, _lifeStep, _seedWorldPeople, _seedCohort,
// classInfo, personInfo) and renderer/game/class-view.js. 4.9 adds NPC_ENC + NPC_ENC_TEXT (encounters, "Met on the road";
// also read by renderer/game/encounter-view.js). 4.10 adds NPC_REP + NPC_ACTS + NPC_ACTS_TEXT (reputation, rumours, the person
// card's deeds; also read by renderer/game/person-card.js + breakdowns.js). 4.10b adds NPC_RIVAL + NPC_RIVAL_TEXT (Your Rival; also
// read by renderer/game/rival-view.js). 4.8 adds NPC_RANK + NPC_RANK_TEXT (Heavenly Rankings; also read by
// renderer/game/rankings-view.js + breakdowns.js). Tuned with scripts/sim/probe-npc-pace.js + npm run sim.

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
  pruneStrangerAfter: 40,     // …and one you never knew (no fam / rel / memory of you) this soon (final QA: save size)
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
  thinBoost: 1.5,             // pace × (1 + this × deficit share)
  // … and a crowded band grows dangerous (feuds and duels multiply).
  crowdHazard: 1.8,

  // Hidden masters: a thin Nascent Soul / Spirit Severing band can wake an old monster from a long seclusion.
  hiddenBands: ['ns', 'ss'],
  hiddenChance: 0.7,          // a year, × the band's deficit share
  hiddenGap: 5,               // at least this many years between two
  hiddenSeclusion: [120, 480],
  hiddenRoots: { heavenly: 1, pure: 3, dual: 1 },
  // What they do on waking, weighted; a personality in hiddenAmbitious doubles 'seize' and 'found'.
  hiddenFates: { seize: 2, found: 2, wander: 6 },
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

// ── Phase 28 tasks 4.4 + 4.5 (living-world.md §6.2, §6.4, §7): the heavy tier, NPC goals, known-first casting ──────
// The ~150 people most relevant to you (your class first: a reserved share) are "heavy": every game season (¼ year,
// ~30 open s) each one whose current activity has run out picks a goal by utility = base × their temper's weight ×
// morality × situation, and acts on it. Everyone else lives the yearly light step only. Seeded per person + season.
const NPC_HEAVY = {
  heavyMax: 150,
  cohortReserve: 0.4,          // at least this share of the heavy slots goes to this life's class while they live
  relevance: { fam: 3, famCap: 40, rel: 0.4, classmate: 60, pastClassmate: 8, chosen: 12, mySect: 14, seat: 10, kin: 30,
               feud: 12, tie: 3, pin: 1000 },
  seasons: 4,                  // goal steps per game year
  catchUpSeasons: 8,           // at most this many missed seasons are stepped at once

  // Goal bases (before temper × morality × situation) and how many seasons the activity lasts.
  goals: {
    seclude: { base: 3,   len: [1, 4] },
    roam:    { base: 2.5, len: [1, 2] },
    mission: { base: 2,   len: [1, 2] },   // sect members only
    court:   { base: 0.9, len: [1, 2] },   // single adults
    duel:    { base: 0.05, len: [1, 1] },
    revenge: { base: 0.6, len: [1, 2] },   // only while they carry a feud against a living person (it fades: feudYears)
    join:    { base: 1.4, len: [1, 1] },   // unsworn adults
    leave:   { base: 0.015, len: [1, 1] },  // disciples of a world sect
    found:   { base: 0.25, len: [2, 4] },  // unsworn, Core Formation or higher, while the world has room
    betray:  { base: 0.03, len: [1, 2] },  // elders within a stage of their master
    help:    { base: 1.6, len: [1, 2] },   // a friend is wounded
    swear:   { base: 0.6, len: [1, 1] },   // a friend of long standing, not yet sworn
  },
  // Temper → goal multipliers (missing = 1).
  temperGoals: {
    arrogant:  { duel: 2.2, found: 1.8, betray: 1.6, help: 0.6 },
    coward:    { duel: 0.2, revenge: 0.4, seclude: 1.4, roam: 0.6, betray: 0.4 },
    hotblood:  { duel: 2.2, roam: 1.5, revenge: 1.5, swear: 1.6, seclude: 0.7 },
    miser:     { mission: 1.5, roam: 1.2, help: 0.6 },
    glutton:   { roam: 1.6, seclude: 0.7 },
    poet:      { court: 1.8, swear: 1.5, roam: 1.2 },
    stoic:     { seclude: 1.6, court: 0.6 },
    demonking: { found: 2.2, duel: 1.8, betray: 1.8, help: 0.4 },
    paranoid:  { leave: 2.2, betray: 1.6, seclude: 1.2, swear: 0.5 },
    grumpy:    { seclude: 1.3, leave: 1.6, court: 0.6, revenge: 1.3 },
    lazy:      { seclude: 1.8, roam: 0.6, mission: 0.5, duel: 0.4 },
    niceguy:   { help: 2.2, swear: 1.4, duel: 0.4, revenge: 0.5, betray: 0.15 },
    psycho:    { duel: 2.4, revenge: 2, betray: 2, help: 0.3 },
    gremlin:   { roam: 1.6, join: 1.3, leave: 1.6 },
  },
  ambitious: ['arrogant', 'demonking', 'psycho', 'hotblood', 'paranoid'],
  moralityDark: ['duel', 'betray', 'revenge'],   // × (1 − morality/150): the ruthless reach for blood
  moralityLight: ['help', 'swear'],              // × (1 + morality/150)

  // Outcomes
  secludePace: 1.3,            // cultivation pace × while secluded
  roamMeet: 0.35,              // two heavy roamers at one place this season meet with this chance
  meetFriendly: [12, 30],      // a meeting of like hearts: the tie rises this much …
  meetHostile: [-35, -15],     // … or, with a gulf in character (or a psycho), falls
  moralityGulf: 70,            // |morality A − morality B| at or above this makes a meeting hostile
  duelBloodChance: 0.04,       // a duel is to the death this often (always for a revenge; a psycho half the time; always when they hate)
  psychoBlood: 0.4,
  highStage: 16,               // from Nascent Soul the mighty rarely stoop to a duel …
  highDuel: 0.3,               // … their duel urge × this
  bloodTie: -80,               // a duel between people who hate each other this much is always to the death
  meetDuel: 0.2,               // a hostile meeting with a hot-head comes to blows this often
  feudYears: 50,               // a feud not acted on fades after this many years
  duelLuck: 120,               // power roll: powerScore + talent × 40 + rng × this
  sparInjury: [2, 6],          // a lost spar wounds for this many years
  courtWed: 0.45,              // a courtship ends in a wedding this often
  joinYoursMult: 3,            // a joiner weights your sect this much more
  feudTie: -90,                // the kin and sworn of the slain carry this toward the killer
  friendTie: 40,               // a tie at or above this is a friend (help, swear)
  swearTie: 60,                // … at or above this they may swear brotherhood (the tie becomes 100)
  betrayWin: 0.5,              // base odds of a betrayer winning, ± by power
  splitShare: 0.3,             // a failed betrayer who lives breaks away with this share of the sect's disciples
  tiesMax: 8,
  revengeBide: 3,              // a target this many stages above makes them bide their time (they seclude instead)
}

// Known-first casting (§6.4): suitors, courtship candidates, road strangers, arena duelists and recruits are drawn from
// people the world already has ~75% of the time; at most ~5 brand-new names per open hour (30 game years) early on.
const NPC_CAST = {
  knownChance: 0.75,
  knownChanceThrottled: 0.95, // once the open hour's new names are spent
  newPerHour: [5, 10],        // the cap rises with your realm: 5 + floor(stage / 4), at most 10
  weight: { fam: 2, famCap: 20, classmate: 6, pastClassmate: 2, chosen: 2 },
  recruitAge: [16, 40],       // a recruit is a youth or a young wanderer, unsworn, below Foundation Building
}

// The heavy tier's deeds, as the Chronicle and your log tell them. Tokens: {name} {other} {sect} {why} {place}.
const NPC_DEED_TEXT = {
  duelKill: '{name} killed {other} in a duel to the death.',
  duelWin: '{name} bested {other} in a duel.',
  revengeKill: '{name} has avenged {why}: {other} is dead.',
  revengeFail: '{name} sought vengeance on {other}, and died for it.',
  wed: '{name} and {other} are wed.',
  sworn: '{name} and {other} swear brotherhood.',
  join: '{name} takes the oath at the {sect}.',
  leave: '{name} leaves the {sect}.',
  found: '{name} raises a gate of their own: the {sect}.',
  betrayWin: '{name} rises against {other} and takes the master’s seat of the {sect}.',
  betrayDie: '{name} rose against {other}, master of the {sect}, and was cut down.',
  betraySplit: '{name} rose against {other} and failed, then broke from the {sect} with its malcontents to raise the {split}.',
  helped: '{name} tends the wounds of {other}.',
  met: '{name} and {other} crossed paths at {place}.',
}
// "Now:" on the person card, by activity.
const NPC_ACT_TEXT = {
  seclude: 'In secluded cultivation', roam: 'Roaming {place}', mission: 'On a mission for the {sect}', court: 'Seeking a match',
  courtWho: 'Courting {other}', duel: 'Seeking a worthy opponent', revenge: 'Hunting {other}', bide: 'Biding their time against {other}',
  join: 'Seeking a sect to join', leave: 'Restless in the {sect}', found: 'Gathering followers for a sect of their own',
  betray: 'Restless under their master', help: 'Tending {other}', swear: 'Drinking with {other}',
}

// ── Phase 28 task 4.9 (living-world.md §9): encounters — the world's people meet YOU ──────────────────────────────
// The NPC acts first: their intent is rolled from their temper, morality, how they feel about you, the power gap and
// your karma. You answer from a queued card ("Met on the road", Roam → Explore) — it never expires; your bearing (the
// stance) only pre-selects an answer. Used by game-state.js (_roadRoll, _roadIntent, roadCards, answerRoadCard,
// _roadFightOutcome), renderer/game/encounter-view.js, scripts/sim/bot.js, scripts/sim/checks/encounters.js.
const NPC_ENC = {
  chance: { expedition: 0.18, mission: 0.15, gate: 0.10 },   // per expedition return / mission / game year (a founder's gate)
  perHour: 4,              // cards per open hour (30 game years); avengers skip it
  queueMax: 6,             // cards waiting, counting the old lover / formula strangers
  waitMax: 3,              // notable people who wait for a free slot when the queue is full (never answered for you)
  cooldownYears: 10,       // the same face can't come twice within this, unless |rel| ≥ notableRel
  notableRel: 60,
  stageSpread: [-3, 2],    // a cast stranger's realm around yours
  roamerShare: 0.6,        // a heavy roamer at that place is met first this often (when there is one)
  avengerChance: 0.35,     // per expedition: someone sworn against you finds you on the road (outside the hour cap)
  avengersPerHour: 1,      // ...but at most one in an open hour, and the same avenger not again within avengerCooldown years
  avengerCooldown: 8,
  // Base weight per intent, then × temper × the reads below.
  base: { ambush: 1, challenge: 1.2, rescue: 1, contest: 1.3, teamup: 1.3, youth: 0.9, oldface: 1.2 },
  temper: {
    arrogant:  { challenge: 2.4, ambush: 1.2, teamup: 0.6, rescue: 0.6 },
    coward:    { ambush: 0.4, challenge: 0.2, rescue: 1.8, teamup: 1.4 },
    hotblood:  { challenge: 2.2, teamup: 1.4, ambush: 1.1 },
    miser:     { contest: 2.2, ambush: 1.3, teamup: 0.8 },
    glutton:   { contest: 1.8, teamup: 1.3 },
    poet:      { oldface: 1.8, teamup: 1.4, ambush: 0.4 },
    stoic:     { challenge: 1.2, ambush: 0.5 },
    demonking: { ambush: 2.2, challenge: 1.6, teamup: 0.4, rescue: 0.4 },
    paranoid:  { ambush: 1.4, teamup: 0.5, oldface: 0.7 },
    grumpy:    { contest: 1.4, teamup: 0.6 },
    lazy:      { teamup: 1.6, challenge: 0.4, contest: 0.6 },
    niceguy:   { teamup: 2, rescue: 1.4, oldface: 1.4, ambush: 0.1 },
    psycho:    { ambush: 3, challenge: 1.4, teamup: 0.3 },
    gremlin:   { contest: 1.6, ambush: 1.2, teamup: 1.2 },
  },
  proud: ['arrogant', 'hotblood', 'demonking', 'psycho', 'stoic'],
  ambushMorality: 20,      // only the dark-hearted (morality below this) ambush a stranger — or anyone who hates you
  infamy: 1.5,             // ambush × (1 + infamy × (50 − karma) / 100): a soft mark or a butcher draws knives
  relWarm: 30, relCold: -30,
  youthMaxStage: 6, youthMaxAge: 30,
  // ── The answers' numbers ──
  flee: { base: 0.55, perStage: 0.07, body: 0.04, coward: 0.15, min: 0.1, max: 0.9 },   // + (your stage − theirs) × perStage + your body tier × body
  yieldStones: [0.15, 40],     // hand over 15% of your stones (at least 40, never more than you have)
  lossStones: 0.25,            // beaten in an ambush they meant as a robbery: they take a quarter
  // Final QA (user 2026-10-04): an avenger's lethal ambush can be ended with a blood price — stones × (their stage + 1) / 4
  // × (1 + gap × perGap when they outclass you), and Honour (the deed bloodPaid). Tempers in `refuse` want blood, not silver.
  bloodPrice: { stones: 180, perGap: 0.25, refuse: ['psycho', 'demonking'] },
  rescueHealth: [8, 22],       // what helping costs you (more where the place outclasses you)
  rescueGift: 0.5,             // chance a rescued one presses a reward on you (stones, or one of their arts if they can teach it)
  rescueKarma: 3, walkKarma: -1, robKarma: -6, robStones: [60, 260],   // stones × (their stage + 1) / 4
  contestShare: 0.5,           // Split it: you take half the find
  teamupDrops: 1,              // one extra roll of the place's drops
  betrayKarma: -5,
  favourStones: [40, 160],     // × (their stage + 1) / 4
  favourMinRel: 20,
  // How a card moves their feeling toward you (rel, −100..100), and the line they keep (mem).
  rel: { helped: 40, robbed: -70, walked: -10, teamup: 20, betrayed: -60, split: 10, yielded: 12, contestWon: -10, contestLost: 6,
         talked: 10, favour: 6, favourRefused: -5, declined: -8, declinedProud: -18, invited: 30, pointed: 20, passed: 0, paid: 8, fled: -6,
         spared: 30, raised: 25, humbled: -35, beatYou: 4, lostTo: -8, sparred: 8, bloodPaid: 45 },
  memMax: 6,
  // A wrong deep enough that they swear to repay it (p.feud → you): robbed while wounded, betrayed on the road, humbled
  // by a proud heart. They may come back as an ambush.
  feudOn: ['robbed', 'betrayed'],
  // The stance (the player's bearing on the road): pre-selects an answer per card. Never answers for you.
  // A list = fallbacks in order (a lethal ambush locks "yield", so Wary falls to the blood price, then flight).
  stances: [
    { id: 'wary',      label: 'Wary',      hint: 'Avoid trouble: yield or flee, decline, walk on.' },
    { id: 'courteous', label: 'Courteous', hint: 'Keep the peace: share, help, talk.' },
    { id: 'bold',      label: 'Bold',      hint: 'Meet them head on: fight, accept, contest.' },
    { id: 'ruthless',  label: 'Ruthless',  hint: 'Take what you can: rob, betray, fight to the death.' },
  ],
  stanceDefault: 'courteous',
  preselect: {
    ambush:    { wary: ['yield', 'price', 'flee'], courteous: ['price', 'flee'], bold: 'fight', ruthless: 'fight' },
    challenge: { wary: 'decline', courteous: 'spar', bold: 'spar', ruthless: 'blood' },
    rescue:    { wary: 'walk', courteous: 'help', bold: 'help', ruthless: 'rob' },
    contest:   { wary: 'yield', courteous: 'split', bold: 'fight', ruthless: 'fight' },
    teamup:    { wary: 'decline', courteous: 'accept', bold: 'accept', ruthless: 'betray' },
    youth:     { wary: 'pass', courteous: 'point', bold: 'invite', ruthless: 'invite' },
    oldface:   { wary: 'talk', courteous: 'talk', bold: 'spar', ruthless: 'favour' },
  },
}

// The cards' words. Tokens: {name} {place} {item} {sect} {why} {mem} {moral} {temper} {root} {n} {cause}. `why` lines
// explain the NPC's intent on the card (no silent mechanics).
const NPC_ENC_TEXT = {
  title: { ambush: 'Upon you on the road', challenge: 'A challenge', rescue: 'Cornered and bleeding', contest: 'A treasure contested',
           teamup: 'An offer to travel together', youth: 'A promising youth', oldface: 'An old face' },
  gateTitle: { ambush: 'At your gate, with a blade', challenge: 'A challenger at the gate', youth: 'A petitioner at the gate', oldface: 'A visitor at the gate' },
  open: {
    ambush:    ['{name} steps out of the trees at {place}, blade already drawn.', '{name} has been waiting for you on the path through {place}.'],
    challenge: ['{name} blocks the way at {place} and names you: "Draw, and let us see whose cultivation is real."', 'At {place}, {name} gives you the bow of a challenger.'],
    rescue:    ['At {place} you find {name} pinned against the rocks, beasts circling, their robe red to the waist.', '{name} lies by the road at {place}, Qi scattered, a broken blade in hand.'],
    contest:   ['You and {name} reach the {item} at {place} in the same breath.', 'At {place}, {name} has a hand on the {item}, and so do you.'],
    teamup:    ['{name} falls into step beside you at {place}: "The deeper paths are kinder to two."', 'At {place}, {name} offers to clear the way together and split what you find.'],
    youth:     ['At {place} a youth, {name}, trails you for a day, then kneels: "Teach me."', '{name}, barely grown, is cutting firewood at {place} with a Qi you can feel from the road.'],
    oldface:   ['At {place} you meet {name} again. The years have marked you both.', '{name} calls your name across {place}. You know that voice.'],
  },
  gateOpen: {
    ambush:    ['{name} walks through your gate at dusk, and the disciples fall back from the look on their face.'],
    challenge: ['{name} stands before your gate and asks, loud enough for every disciple, whether its master is worth the name.'],
    youth:     ['{name} has knelt at your gate for three days in the rain, asking to be taken in.'],
    oldface:   ['{name} comes up the mountain path to your gate, asking for you by name.'],
  },
  why: {
    feud:      'They are sworn against you: {why}.',
    feudHeir:  'They are sworn against your line: {why}, at the hands of {heir}, who came before you.',
    hunter:    'They are {moral}, and your name has become a byword for cruelty. They mean to end it.',
    hate:      'They hate you. They remember: "{mem}"',
    greed:     'They are {moral}, and you look like an easy mark.',
    infamy:    'Word of your deeds has spread. They mean to end them, or profit from them.',
    proud:     'A {temper} heart: they want to measure themselves against you.',
    grudge:    'They still remember: "{mem}"',
    weaker:    'They are badly outmatched here, and know it.',
    greedy:    'A {temper} soul: they will not give up a find easily.',
    warm:      'They think well of you: "{mem}"',
    kind:      'A {temper} heart: they would rather not walk alone.',
    talent:    'Their root is {root}. Someone should teach them.',
    classmate: 'You awakened in the same year.',
    familiar:  'You have crossed paths {n} times.',
    plain:     'Nothing between you yet.',
  },
  brush: ['At {place} you pass {name} on the road. A nod, and the dust takes them.', 'You glimpse {name} at {place}, but your hands are full of other matters.'],
  // Why they swear to repay you (p.feud.why, as their card shows it).
  feudWhy: { robbed: 'you robbed them as they lay bleeding', betrayed: 'you betrayed them on the road', humbled: 'you shamed them in the dust' },
  waits: '{name} is looking for you, and will find you once your hands are free.',
  gone: '{name} will not keep the meeting: {cause}.',
  // The line they keep of you (p.mem; shown on their person card in their own words). {place} {y}
  mem: {
    helped: 'You pulled me out of {place} when I was dying.', robbed: 'You robbed me as I lay bleeding at {place}.',
    walked: 'You walked past me at {place}.', teamup: 'We cleared {place} together.', betrayed: 'You turned on me at {place} and took my share.',
    split: 'We split a find at {place}, fair and square.', yielded: 'You let me have the find at {place}.',
    contestWon: 'You beat me to a find at {place}.', contestLost: 'I took a find from you at {place}.',
    talked: 'We talked of old days at {place}.', favour: 'I helped you at {place}.', favourRefused: 'You asked me for help at {place}. I said no.',
    declined: 'You refused my challenge at {place}.', declinedProud: 'You hid from my challenge at {place}, coward.',
    invited: 'You took me into your sect.', pointed: 'You showed me the way to a sect.', paid: 'You paid me off at {place}.',
    fled: 'You ran from me at {place}.', spared: 'You spared my life at {place}.', raised: 'You beat me at {place} and helped me up.',
    humbled: 'You shamed me in the dust at {place}.', beatYou: 'I beat you at {place}.', lostTo: 'You beat me at {place}.',
    sparred: 'We crossed blades at {place}.',
    bloodPaid: 'You paid the blood price at {place}. It is ended.',
  },
}

// ── 4.10 (living-world.md §2.1/§2.5): memory → reputation. Your deeds toward people become Honour / Infamy (two
// separate 0–100 scores: you can be both), and word of a deed spreads to the wronged (or helped) one's kin, sworn and
// friends as a smaller "heard" memory. Both tilt who comes to you on the road, who accepts your offers, and suitors.
// Used by game-state.js (_repDeed, _tickRepute, _roadIntent, personActions) + breakdowns.js (kind 'repute').
const NPC_REP = {
  // A deed's weight: the memory key it was written under → { h: honour, i: infamy } (before the deed's own reads).
  deeds: {
    helped: { h: 6 }, spared: { h: 4 }, raised: { h: 2 }, yielded: { h: 1 }, split: { h: 1 }, invited: { h: 2 }, pointed: { h: 2 },
    teamup: { h: 1 }, mentored: { h: 3 }, gift: { h: 1 }, sworn: { h: 2 }, denounceJust: { h: 3 },
    robbed: { i: 8 }, betrayed: { i: 8 }, humbled: { i: 2 }, walked: { i: 1 }, denounced: { i: 5 }, murdered: { i: 6 },
    betrayedSworn: { i: 15 },
    slewHunter: { h: 4 },        // 4.8: you cut down a genius hunter
    bloodPaid: { h: -3 },        // final QA: you bought off an avenger (silver for blood is no glory)
  },
  max: 100,
  fadePerYear: 0.012,        // both scores fade toward 0 by this share per game year (deeds are forgotten slowly)
  carry: 0.5,                // what a new life inherits of the last one's Honour / Infamy
  heirFeudStage: 10,         // a feud inherited from a past life comes for you only once you reach Foundation Building
  logMax: 12,                // the deeds kept for the breakdown card
  // Words (Character tile + the breakdown). The higher of the two decides; both ≥ `both` → "Feared and honoured".
  words: [
    { min: 60, h: 'Renowned', i: 'Notorious' }, { min: 30, h: 'Upright', i: 'Infamous' }, { min: 12, h: 'Well spoken of', i: 'Whispered about' },
  ],
  none: 'Unknown', both: 'Feared and honoured', bothMin: 30,
  // How the world reads it (shown on the breakdown card, and used by the road + the person card's odds).
  road: { hunterInfamy: 40, hunterMorality: 40, hunterWeight: 1.6, honourRescue: 1.0, honourTeamup: 0.8 },   // weights × (1 + score / 100 × this)
  acceptHonour: 0.002, acceptInfamy: -0.003,   // + per point to every "will they accept" odds (recruit, swear, court, spar)
  courtInfamy: -0.25,        // a courtship's starting interest × points of infamy
  // Rumours: a deed with a victim (or a beneficiary) spreads to their people once a game year.
  rumour: { share: 0.4, max: 4, minDelta: 8, life: 3, darkAdmire: -40 },   // share of the rel delta; ≤ max hearers; deeds under minDelta stay quiet; a rumour lives ≤ life years; hearers with morality ≤ darkAdmire shrug off cruelty
  // A friend's yearly kindness / an enemy's yearly malice (heavy people only; real-time effects are log lines that name them).
  friendRel: 50, enemyRel: -50,
  friendGift: 0.05, friendStones: [40, 140],   // per year: chance a friend sends stones (× their stage + 1) / 4
  enemySlander: 0.04, slanderInfamy: 2, slanderRel: -6,   // per year: an enemy spreads word against you (infamy +, their friends cool)
}

// 4.10 (living-world.md §2.2, PLAN 15C): what you can do to someone from their person card. One deed per person at a
// time: `cooldownSecs` of real open time (shown as a countdown — never in game years). The NPC's answer to an offer is
// theirs (odds shown first); your choice to make the offer is never rolled.
const NPC_ACTS = {
  cooldownSecs: 240,
  gift: { stones: [30, 25], rel: 10, greedyRel: 20, greedy: ['miser', 'glutton', 'gremlin'], warmCap: 60, warmRel: 4 },   // stones = a + b × their stage
  spar: { accept: 0.55, proud: 0.3, perRel: 0.004, hateAccept: 0.25 },
  duel: { needRel: -40, accept: 0.35, proud: 0.45, hate: 0.4, murderInfamy: true },    // to the death: only against someone you are at odds with
  mentor: { gap: 3, needRel: 30, qiFrac: 0.15, rel: 20, xp: 0.4, mult: 1.6, years: 10 },   // costs this share of your Qi cap; they grow ×mult for `years`
  recruit: { needRel: 20, base: 0.25, perRel: 0.008, unaffiliated: 0.2, member: -0.25, refuseRel: -5, stanceHit: -6 },
  swear: { needRel: 80, base: 0.55, perRel: 0.02, rel: 10, warEach: 0.08, warMax: 0.3 },   // sworn siblings add warEach to your sect wars (≤ warMax)
  denounce: { rel: -30, tieHit: -15, karma: -5, justMorality: -40, foesWarm: 8 },
  court: { needRel: 10, minAge: 18, interestPerRel: 0.25 },
}

const NPC_ACTS_TEXT = {
  label: { gift: 'Send a gift', spar: 'Spar', duel: 'Duel to the death', mentor: 'Teach them', recruit: 'Invite to your sect',
           swear: 'Swear brotherhood', denounce: 'Denounce them', court: 'Court them' },
  icon:  { gift: 'gift', spar: 'duel', duel: 'skull', mentor: 'scroll', recruit: 'disciple', swear: 'bond', denounce: 'alert', court: 'heart' },
  // The line they keep of you (p.mem) for each answer; {place} is where it happened.
  mem: {
    gift: 'You sent me a gift.', giftGreedy: 'You sent me a fine gift. I will not forget it.',
    mentored: 'You taught me when you owed me nothing.', recruited: 'You took me into your sect.', recruitRefused: 'You tried to buy my oath.',
    sworn: 'We swore brotherhood, under the same sky.', swearRefused: 'You asked me to swear brotherhood. I was not ready.',
    denounced: 'You denounced me before the world.', denounceJust: 'You named my crimes before the world.',
    courted: 'You came courting.', sparRefused: 'You asked me to spar. I had better things to do.', duelRefused: 'You called me out to the death. I would not dignify it.',
    heard: 'I heard you {deed} {name}.', heardKind: 'I heard you {deed} {name}. That speaks well of you.',
    forebear: 'I knew {name}, who came before you.',
  },
  // How a rumour names the deed ("I heard you robbed Wei Lan.")
  deed: { helped: 'saved', spared: 'spared', raised: 'beat and raised up', robbed: 'robbed', betrayed: 'betrayed', humbled: 'shamed',
          mentored: 'taught', denounced: 'denounced', murdered: 'killed', invited: 'took in', betrayedSworn: 'turned on your own sworn sibling,' },
  friendGift: ['{name} sends {n} Spirit Stones with a note: "{mem}"', 'A courier brings {n} Spirit Stones from {name}, "for old times."'],
  slander: ['{name} speaks against you in the tea houses: "{mem}" Infamy +{n}.', 'Word reaches you that {name} has been telling the story of how you {deed}. Infamy +{n}.'],
  swornFell: 'Your sworn sibling {name} has fallen: {cause}.',
  swornAvenge: '{name}, your sworn sibling, swears to avenge you on {killer}.',
  swornWar: '{names} came to fight at your side.',
  hint: 'Each person answers one deed at a time. What you do here is remembered, and word of it spreads.',
}

// ── 4.10b (living-world.md §8, PLAN 28K): Your Rival (宿敌). One cohort genius per life, never your kin. A rivalry record
// on the world (w.rivals: heat −100 bitter … +100 kindred, meetings, wins, losses, structured beats); the rival seeks you
// out on their own schedule (game years, told to the player only in real open time), their breakthroughs are headlines,
// they lead the enemy when their sect is the foe, and a bitter (or warm) rivalry outlives you as a house: the rival's line
// supplies the next life's rival. Used by game-state.js (_pickRival, _tickRival, the rival cards' answers, rivalInfo) +
// renderer/game/rival-view.js + encounter-view.js.
const NPC_RIVAL = {
  firstMeet: [5, 10],          // game years after you awaken before they first seek you out (≈ 10–20 min of open time)
  meetEvery: [15, 25],         // then every this many game years (spec §8; ≈ 30–50 min of open time)
  relToHeat: 0.5,              // every memory they keep of you moves heat by this share of its rel delta
  heatMin: -100, heatMax: 100,
  bloodHeat: -70,              // at or below: a blood feud (lethal duels; they may go after your kin)
  bondHeat: 70,                // at or above: sworn brotherhood or courtship can be offered on their card
  kinStrike: 0.35,             // in a blood feud, the share of their visits that go after your kin instead of you
  trouble: 0.18,               // the share of visits where they are in trouble (troubleHurt when they are wounded)
  troubleHurt: 0.6,
  talkHeat: 40,                // at or above: a visit is mostly a cup of wine (talkShare), else a challenge
  talkShare: 0.6,
  // Heat that does not come from a memory line (on top of relToHeat × the memory's own rel delta).
  heat: { declined: -8, declinedProud: -14, overtakenProud: -6, overtakenHumble: 3, warLed: -6, kinKilled: -20, kinSaved: 6, paid: 4 },
  // Their memory of each answer (rel delta). Keys are rv_* (4.10's rumour/deed weights are mapped through `deeds`).
  rel: { rv_drink: 12, rv_declined: -6, rv_declinedProud: -12, rv_helped: 45, rv_sabotaged: -60, rv_walked: -8, rv_paid: -4,
         rv_kinWounded: -4, rv_kinKilled: 0, rv_sworn: 15, rv_courted: 6 },
  deeds: { rv_helped: 'helped', rv_sabotaged: 'betrayed', rv_walked: 'walked' },   // what an answer weighs on your name (NPC_REP.deeds)
  helpHealth: [10, 24],        // helping them costs you this much Health (more when they outclass you)
  helpKarma: 3, sabotageKarma: -6, sabotageInjury: 6, sabotageFound: 0.5,   // sabotage: their progress lost + years healing; found out half the time
  payStones: 160,              // the blood price to turn them from your kin: × (their stage + 1)
  kinBase: 0.55, kinPerStage: 0.08, kinMin: 0.1, kinMax: 0.9,   // your kin survives: base + (kin stage − theirs) × perStage
  swear: { base: 0.6, perHeat: 0.01 },   // accept odds at heat ≥ bondHeat (+ per heat point above it)
  war: { base: 0.12, perStage: 0.03, max: 0.35 },   // the foe's Might × (1 + this) when your rival leads it
  carryHeat: 0.5,              // a house: the next rival of that line starts at this share of the old heat
  houseMin: 30,                // |heat| at or above (or a death between you): the rivalry passes to the next life
  houseRel: -20,               // and a bitter house's heir starts this cold toward you
  beatsMax: 30,
  hazardMult: 0.35,            // the world's perils (road, backlash) take your living rival at this share, so the rivalry has time to grow
  // Heat words (the rival view + person card chip): the first whose min the heat reaches.
  words: [
    { min: 70, w: 'Kindred spirit', tone: 'gold' }, { min: 35, w: 'Respected rival', tone: 'jade' }, { min: -34, w: 'Rival', tone: '' },
    { min: -69, w: 'Bitter rival', tone: 'red' }, { min: -101, w: 'Blood feud', tone: 'red' },
  ],
  preselect: {
    rivalDuel:    { wary: 'decline', courteous: 'spar', bold: 'spar', ruthless: 'blood' },
    rivalTalk:    { wary: 'drink', courteous: 'drink', bold: 'spar', ruthless: 'spar' },
    rivalTrouble: { wary: 'walk', courteous: 'help', bold: 'help', ruthless: 'sabotage' },
    rivalKin:     { wary: 'pay', courteous: 'intercept', bold: 'intercept', ruthless: 'intercept' },
  },
}

const NPC_RIVAL_TEXT = {
  title: { rivalDuel: 'Your rival comes calling', rivalTalk: 'Your rival, with a jar of wine', rivalTrouble: 'Your rival, cornered', rivalKin: 'Your rival goes after your own' },
  bloodTitle: 'Your rival, with murder in their eyes',
  open: {
    rivalDuel:      ['{name} is waiting at {place}, sword across their knees: "Again. Until one of us is sure."', 'At {place}, {name} steps into your path and bows the bow of an equal.'],
    rivalDuelBlood: ['{name} finds you at {place}. They do not bow: "This ends with one of us in the ground."'],
    rivalTalk:      ['{name} sits down beside you at {place} with a jar of wine and two cups: "Who else would I drink with?"', 'At {place}, {name} laughs when they see you: "Still alive? Good. Sit."'],
    rivalTrouble:   ['At {place} you find {name} hemmed in by beasts, their Qi guttering. They see you, and say nothing.', 'Word reaches you at {place}: {name} is trapped in a collapsing formation two valleys over.'],
    rivalKin:       ['Word reaches you at {place}: {name} has gone looking for {kin}, and they did not go to talk.'],
  },
  why: {
    first:   'You awakened in the same year. Of everyone in your class, they are the one who will not let you out of their sight.',
    duel:    'They have measured themselves against you since the day you both awakened. Heat {heat}: {word}.',
    blood:   'The rivalry has turned to hate. Heat {heat}: {word}. They mean to kill you.',
    talk:    'Years of rivalry have become something like friendship. Heat {heat}: {word}.',
    trouble: 'Your rival is in trouble. Whatever you do here, they will know it was you.',
    kin:     'A blood feud. They cannot break you, so they will break what you love. Heat {heat}.',
    house:   ' Their line has stood against yours since {from}, a life ago.',
  },
  // The line they keep (p.mem). {place} {kin}
  mem: {
    rv_drink: 'We drank at {place}, the two of us.', rv_declined: 'You refused me at {place}.', rv_declinedProud: 'You hid from me at {place}. Coward.',
    rv_helped: 'You saved my life at {place}. I hate that I owe you.', rv_sabotaged: 'You ruined my cultivation at {place}. I know it was you.',
    rv_walked: 'You watched me nearly die at {place}, and walked on.', rv_paid: 'You bought {kin}\'s life from me.',
    rv_kinWounded: 'I left {kin} bleeding. Next time it will be you.', rv_kinKilled: 'I killed {kin}. Now you know how it feels.',
    rv_sworn: 'We swore brotherhood. Rivals still.', rv_courted: 'You came courting me, of all people.',
  },
  // Beat lines: the rivalry's history, kept on the record (a later story mode can quote them).
  beat: {
    chosen: 'You and {name} awaken in the same year. The world will measure you against each other.',
    inherited: '{name} is born into the {house} line, which has stood against yours since {from}.',
    rose: '{name} breaks into {realm}.', overtook: 'You pass {name}: {realm} to their {theirs}.', passed: '{name} passes you: {theirs} to your {realm}.',
    won: 'You beat {name} at {place}.', lost: '{name} beats you at {place}.', spared: 'You spare {name}\'s life at {place}.', humbled: 'You leave {name} in the dust at {place}.',
    slain: 'You kill {name} at {place}.', killedYou: '{name} kills you at {place}.', declined: 'You refuse {name}\'s challenge at {place}.',
    drink: 'You and {name} drink at {place}.', helped: 'You save {name}\'s life at {place}.', sabotaged: 'You sabotage {name} at {place}{found}.',
    walked: 'You leave {name} to their fate at {place}.', sworn: 'You and {name} swear brotherhood.', swornRefused: '{name} will not swear: "Not yet."',
    courted: 'You begin to court {name}.', kinSaved: 'You stand between {name} and {kin}, and win.', kinLost: 'You fall defending {kin} from {name}.',
    kinPaid: 'You pay {name} the blood price for {kin}.', kinWounded: '{name} leaves {kin} bleeding.', kinKilled: '{name} kills {kin}.', kinSafe: '{kin} drives {name} off.',
    war: '{name} leads the {sect} against you{result}.', fell: '{name} falls: {cause}.', ascended: '{name} Ascends.', lifeEnded: 'Your life ends. {name} lives on.',
  },
  // Log + toast lines.
  rose: 'Your rival {name} has broken into {realm}. The heavens tremble.',
  overtook: 'You have passed your rival {name}. They will not take it quietly.',
  passed: 'Your rival {name} has passed you. They stand a step above you now.',
  fell: 'Your rival {name} has fallen: {cause}.',
  ascended: 'Your rival {name} has Ascended, and left you behind on the mortal road.',
  war: 'Your rival {name} leads the {sect} against you.',
  waits: 'Your rival {name} is looking for you, and will find you once your hands are free.',
  named: 'Of everyone who awakened with you, {name} is the one who will not let you out of their sight. (World → Rival)',
  hint: 'Your rival seeks you out on their own. How you meet them moves the heat between you, and the heat decides what the rivalry can become.',
}

// ── Phase 28 task 4.8 (living-world.md → "4.8 Heavenly Rankings"): the in-world boards ─────────────────────────────
// Heaven (天榜, everyone living) · Rising Dragon (潜龙榜, ≤ dragonYears on the path, power for their years) · Your Class
// (同届榜, your cohort, living + fallen + ascended). Published every game year (≈ 2 open minutes); what being ranked brings.
const NPC_RANK = {
  every: 1,                    // game years between publications
  keep: 100,                   // places kept per public board (the view shows the top `show` + your neighbours)
  show: 20, around: 2,
  dragonYears: 60,             // years on the path (since awakening) to stay on Rising Dragon
  dragonK: 20,                 // Rising Dragon score = power × K ÷ (years on the path + K)
  // Rank power (rankPowerParts): realm stage × 100 + progress 0–99 + root × 10 + body + arts + gear + renown.
  artPoints: { yellow: 3, profound: 6, earth: 10, heaven: 16, immortal: 24 },   // per worn move / passive (× mastery)
  artMastery: 0.08,            // + per mastery level past 1 (yours)
  artEstimate: [6, 14, 26, 40, 58],   // an NPC whose arts were never rolled: by arts realm (personRealm 0–4)
  gear: { weapon: 15, artifact: 15 },
  renown: { win: 30, lose: -20, decline: -15, declineProud: -25, killHunter: 40, max: 200, min: -100, fade: 0.08 },
  // Being ranked (only while your name is not veiled): [place or better, value].
  fame: { heaven: [[1, 120], [3, 90], [10, 60], [20, 40], [50, 25], [100, 10]], dragon: [[1, 60], [10, 30], [20, 15]] },
  sectMight: 6,                // a world sect's Might + this per member in the Heaven top 20
  challenge: { chance: 0.03, perDecline: 0.25, declineMax: 4, cooldown: 8, below: 6, heavenTop: 50, dragonTop: 20, stageGap: 3 },
  hunter: { chance: 0.02, cooldown: 15, dragonTop: 20, stageAbove: [1, 2], payStones: 120, hideYears: 12,
            kinBase: 0.5, kinPerStage: 0.08, kinMin: 0.1, kinMax: 0.9, veilLoses: 0.75, honour: 4, karma: 2 },
  invite: { chance: 0.03, cooldown: 20, heavenTop: 50, dragonTop: 20, startRank: 1, stanceDecline: -2, stanceRefuse: -8 },
  duel: { cdSec: 300, stageGap: 3 },   // the Class board duel: the classmate just above you, once per 5 open minutes
  titles: { heaven: [[1, 'First Under Heaven'], [3, 'Among the Three Under Heaven'], [10, 'Among the Ten Under Heaven']],
            dragon: [[1, 'First of the Rising Dragons'], [10, 'Among the Ten Rising Dragons']], class: [[1, 'First of your class']] },
  classAlive: [20, 10, 5, 1],  // "Only N of your class still live." when the living fall to these
  newsMax: 24, honourMax: 30,
  preselect: {
    rankChallenge: { wary: 'decline', courteous: 'spar', bold: 'spar', ruthless: 'blood' },
    hunter:        { wary: 'veil', courteous: 'flee', bold: 'fight', ruthless: 'fight' },
    hunterKin:     { wary: 'hide', courteous: 'hide', bold: 'intercept', ruthless: 'intercept' },
    invite:        { wary: 'decline', courteous: 'decline', bold: 'accept', ruthless: 'accept' },
  },
}

const NPC_RANK_TEXT = {
  board: { heaven: 'Heaven Ranking', dragon: 'Rising Dragon Ranking', class: 'Your Class' },
  on: { heaven: 'under Heaven', dragon: 'among the Rising Dragons', class: 'in your class' },
  title: { rankChallenge: 'A challenger from the rankings', hunter: 'A genius hunter', hunterKin: 'A genius hunter, after your child', invite: 'An invitation' },
  open: {
    rankChallenge: ['{name}, #{theirs} {on}, waits for you at {place}: "One place. That is all that stands between us."',
                    'At {place}, {name} bows the shallow bow of a challenger. They stand #{theirs} {on}; you stand #{yours}.'],
    hunter:        ['At {place}, a figure in grey falls into step beside you. {name} hunts young geniuses, and the rankings have named you.',
                    '{name} is waiting at {place}. They collect talents the way others collect coins, and you are on the list.'],
    hunterKin:     ['Word reaches you at {place}: {name}, a genius hunter, has gone looking for {kin}, #{theirs} among the Rising Dragons.'],
    invite:        ['At {place}, {name} of the {sect} bows to you: "The rankings speak of you. Our gate is open, at a rank worthy of you."'],
  },
  why: {
    rankChallenge: 'You stand #{yours} {on}; they stand #{theirs}. Beat you, and the world will say they are your better.',
    challengeCoward: ' You have refused {n} of late: the world has begun to say you can be pushed.',
    hunter: 'The Rising Dragon Ranking names you #{yours}. To a genius hunter, that is a price on your head.',
    hunterKin: 'The rankings named {kin} #{theirs} among the Rising Dragons. A hunter read the same list.',
    invite: 'You stand #{yours} {on}. The {sect} wants that name on its rolls{weaker}.',
    inviteWeaker: ', and its Might is greater than your own sect\'s',
  },
  // Log + news lines. {board} {on} {place} {name} {realm} {n}
  firstListed: 'The rankings are published, and your name is on them: #{place} {on}.',
  rose: 'The rankings are published: you rise to #{place} {on}.',
  fell: 'The rankings are published: you slip to #{place} {on}.',
  best: 'The rankings are published: #{place} {on}, the highest you have ever stood.',
  top: { 20: 'You enter the top twenty {on}.', 10: 'You stand among the ten {on}.', 3: 'You stand among the three {on}.', 1: 'You stand first {on}. The heavens take note of your name.' },
  newFirst: '{name} now stands first under Heaven.',
  rivalPassed: 'Your rival {name} stands above you {on} now: #{theirs} to your #{yours}.',
  classFirst: '{name} is the first of your class to reach {realm}.',
  classFirstYou: 'You are the first of your class to reach {realm}!',
  classAlive: 'Only {n} of your class still live.',
  honour: '{name} ages off the Rising Dragon Ranking, having risen as high as #{place}.',
  honourYou: 'You age off the Rising Dragon Ranking, having risen as high as #{place}. Your name goes on its honour roll.',
  titleEarned: 'A title for your name: {title}.',
  veilOn: 'You veil your name. The next publication will not carry it.',
  veilOff: 'You let your name be known again. The next publication will carry it.',
  hint: 'Every game year the world publishes its rankings. Rank power is your realm, progress, root, body, arts and gear, plus the renown of ranked duels. A public name draws challengers, hunters and invitations; you can veil it.',
  // Their memory (p.mem). {place}
  mem: { rk_spar: 'We fought for a place on the rankings at {place}.', rk_declined: 'You would not fight me for your place at {place}.',
         rk_declinedProud: 'You hid from my challenge at {place}. The rankings will know.', rk_inviteDeclined: 'You turned our sect away at {place}, politely.',
         rk_inviteRefused: 'You spat on our invitation at {place}.', rk_joined: 'You came to us from the rankings.', rk_paid: 'You paid me to leave you be.',
         rk_fled: 'You slipped my net at {place}.', rk_veiled: 'Your name went dark before I could reach you.', rk_kinPaid: 'You bought {kin} back from me.' },
  rel: { rk_spar: 8, rk_declined: -6, rk_declinedProud: -15, rk_inviteDeclined: -2, rk_inviteRefused: -25, rk_joined: 30, rk_paid: -4, rk_fled: -6, rk_veiled: -4, rk_kinPaid: -4 },
}
