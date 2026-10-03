// Phase 28 (living-world.md): the world's people — registry budgets, who each world sect seats by name, and the words
// the person card uses. Data only. Used by: renderer/engine/game-state.js (_ensurePhase28Fields, _syncPersons,
// _wsEnsurePeople, personInfo) and renderer/game/person-card.js. Later tasks (4.3+) add band targets + cohort tuning.

const WORLD_PEOPLE = {
  // Budgets (living-world.md §6.2, §10). 4.2 only measures them; 4.3+ enforces the tiers.
  heavyMax: 150,
  lightMax: 1100,
  slotBudgetBytes: 1200 * 1024,   // the whole slot JSON (mobile keeps every slot in ~5 MB of localStorage)
  worldBudgetBytes: 900 * 1024,

  // Every world sect seats a real master and this many named elders, by sect tier (1..5).
  eldersByTier: [1, 1, 2, 2, 3],
  // An elder stands this many stages below their master (inclusive range), never below 1.
  elderStageBelow: [1, 4],
  // Master: the age band (years) a seated master was born before the current year.
  masterAge: [90, 300],
  elderAge: [60, 200],

  // A master who leaves the seat (WORLD_SECT_LEADERS chance): this share die in a struggle for it; the rest retire.
  // Decided by a hash of the sect + year (no Math.random), so sim seeds don't shift.
  masterDiesShare: 0.35,   // 4.3: age + backlash deaths now come from the life step; this is the seat struggle

  // Own-sect disciples as people: disciple level → realm stage (level 1 = stage 1 … level 10 = stage 10).
  discipleStagePerLevel: 1,
  discipleAge: [16, 40],
}

// The life fields an owner's copy (family / arena / own sect) writes into the registry on every sync. Everything else
// on a registry person (rel, mem, ties, fam, pin, tier, cohort, sectId…) is the world's and never overwritten by a copy.
const PERSON_LIFE_KEYS = ['given', 'family', 'gender', 'bornYear', 'root', 'personality', 'morality', 'stageIndex', 'maxStage',
  'bodyTier', 'alive', 'diedYear', 'cause', 'parents', 'spouseIds', 'estranged']

// How a person's death reads on their card (third person; the player's own death text lives in game.js).
const PERSON_CAUSE_TEXT = {
  old_age: 'Their years ran out', expedition: 'Slain on the road', sect_war: 'Fell in a sect war', event: 'A cultivation mishap',
  ascension_failed: 'The Ascension Trial took them', passed_mantle: 'Laid down the path', spouse_duel: 'Slain in a duel with their spouse',
  challenge_lost: 'Slain challenging for the head seat', sect_master: 'Slain in a fight for the master’s seat',
  beast_hunt: 'Killed by a beast', arena_blood: 'Killed in a blood match in the Arena', challenged: 'Slain defending the head seat',
  stepdown_tournament: 'Fell in a succession tournament', branch_war: 'Fell in a branch war', duel: 'Slain in a duel',
  tournament: 'Fell in the Tournament of Heirs', ascended: 'Ascended',
  // 4.3 (npc-lives.js): the light world sim's causes
  bt_backlash: 'Died in a breakthrough backlash', road: 'Slain on the road', feud: 'Killed in a feud',
  sect_clash: 'Fell in a clash between sects', seat_struggle: 'Fell in a struggle for the master’s seat',
}

// The person card's words.
const PERSON_ROLE_TEXT = {
  self: 'You', ancestor: 'A past life', spouse: 'Spouse', former_spouse: 'Former spouse', child: 'Child', kin: 'Kin',
  head: 'Clan head', branch_head: 'Branch head', elder: 'Elder', estranged: 'Left the clan', new_soul: 'Cultivator',
  sect_master: 'Sect master', sect_elder: 'Sect elder', retired_master: 'Former sect master', disciple: 'Disciple',
  duelist: 'Arena duelist', stranger: 'Met on the road', lover: 'Lover', suitor: 'Suitor', wanderer: 'Wandering cultivator',
  youth: 'A youth of the world', old_monster: 'Old monster',
}

// Morality (−100..100) → a word (the family tree's bands, shared).
const MORALITY_WORDS = [
  { min: 40, word: 'Righteous', tone: 'jade' }, { min: 10, word: 'Upright', tone: 'jade' },
  { min: -10, word: 'Pragmatic', tone: '' }, { min: -40, word: 'Callous', tone: 'red' }, { min: -101, word: 'Ruthless', tone: 'red' },
]

// Body tier index → letter (Phase 14's BODY_TIERS carry the names; the card only needs the grade).
const BODY_TIER_LETTERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S']
