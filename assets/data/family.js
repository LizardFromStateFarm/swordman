// Family: spouse affection, marriage/crisis events, affairs + discovery reactions (Phase 16-lite+, M2), plus
// children who grow up, child events and PERSONALITY_MORALITY (clan-succession.md 2.6b).
// Used by: game-state.js (_tickFamily, resolveMarriageEvent, resolveDuel, encounters), game.js, scripts/sim/*.
// Child timing lives in lifespan.js. Spec: docs/systems/family.md. Personality ids: personalities.js.
// Event text tokens: {spouse} (spouse given name), {name} (you), {child} (youngest living child).

// ── Affection ────────────────────────────────────────────────────────────────
const AFFECTION_START            = 60
const AFFECTION_SAME_PERSONALITY = 10     // bonus at the wedding when you share a temperament
const AFFECTION_DRIFT_PER_YEAR   = 0.3    // toward AFFECTION_REST, each game year
const AFFECTION_REST             = 50
const AFFECTION_DEVOTED          = 75     // ≥ this: DEVOTED_BT_BONUS, discovery leans toward acceptance
const AFFECTION_CRISIS           = 25     // < this: crisis events can fire
const DEVOTED_BT_BONUS           = 0.05
const SABOTAGE_BT_MALUS          = 0.25   // one breakthrough attempt, after a 'sabotage' reaction

// ── Marriage events ──────────────────────────────────────────────────────────
const MARRIAGE_EVENT_YEARS  = [10, 25]
const CRISIS_EVENT_CHANCE   = 0.6
const FAMILY_STONE_SCALE    = 0.5         // event stone costs × (1 + stageIndex × this)
const FORGIVE_AFFECTION     = 15
const BEG_STAY_CHANCE       = 0.4
const BEG_STAY_AFFECTION    = 35

// ── Duel to the death ────────────────────────────────────────────────────────
const DUEL_BASE_WIN         = 0.5
const DUEL_WIN_PER_STAGE    = 0.08        // per stage you're ahead of your spouse
const DUEL_WIN_RANGE        = [0.1, 0.9]
const DUEL_WIN_HEALTH_COST  = 30

// ── Affairs (commit B) ───────────────────────────────────────────────────────
const LOVER_ENCOUNTER_CHANCE    = 0.12    // per expedition return, from PROPOSAL_MIN_STAGE
const LOVER_ENCOUNTER_MAX       = 3
const SEDUCE_CHANCE             = 0.65
const AFFAIR_YEARS              = [15, 50]   // an affair fades on its own after this many game years
const DISCOVERY_PER_LOVER_YEAR  = 0.02
const DISCOVERY_ON_LOVER_CHILD  = 0.40
const AFFAIR_DISCOVERED_AFFECTION = -25
const AFFAIR_CHILD_EXTRA_AFFECTION = -10
const AFFAIR_TOLERATED_AFFECTION  = -5

// Spouse reaction weights on discovering an affair. Scaled at roll time: accept × aff/50,
// duel/suicide/murder_suicide × (100−aff)/50, sabotage unscaled.
const AFFAIR_REACTIONS = {
  niceguy:   { accept: 60, sabotage: 10, duel: 0,  suicide: 30, murder_suicide: 0 },
  lazy:      { accept: 70, sabotage: 20, duel: 5,  suicide: 5,  murder_suicide: 0 },
  coward:    { accept: 50, sabotage: 35, duel: 5,  suicide: 10, murder_suicide: 0 },
  glutton:   { accept: 55, sabotage: 30, duel: 10, suicide: 5,  murder_suicide: 0 },
  gremlin:   { accept: 50, sabotage: 30, duel: 10, suicide: 5,  murder_suicide: 5 },
  stoic:     { accept: 40, sabotage: 30, duel: 25, suicide: 5,  murder_suicide: 0 },
  miser:     { accept: 30, sabotage: 50, duel: 15, suicide: 5,  murder_suicide: 0 },
  grumpy:    { accept: 30, sabotage: 45, duel: 20, suicide: 5,  murder_suicide: 0 },
  poet:      { accept: 10, sabotage: 20, duel: 15, suicide: 40, murder_suicide: 15 },
  paranoid:  { accept: 5,  sabotage: 55, duel: 25, suicide: 10, murder_suicide: 5 },
  arrogant:  { accept: 5,  sabotage: 30, duel: 55, suicide: 5,  murder_suicide: 5 },
  demonking: { accept: 10, sabotage: 20, duel: 55, suicide: 0,  murder_suicide: 15 },
  hotblood:  { accept: 5,  sabotage: 15, duel: 75, suicide: 5,  murder_suicide: 0 },
  psycho:    { accept: 5,  sabotage: 15, duel: 35, suicide: 10, murder_suicide: 35 },
}

// Encounter flavor: where on an expedition you cross paths with a potential lover.
const LOVER_ENCOUNTER_TEXT = [
  'shares your campfire in the ruins and does not leave at dawn',
  'is cornered by the same beast you are hunting — you fight back to back',
  'is gathering herbs on the same cliff face and laughs when you both slip',
  'tends your wounds without being asked, and without asking your name',
  'challenges you to a spar, loses, and demands a rematch over wine',
  'is a wandering cultivator who knows every star by its old name',
]

// ── Events ───────────────────────────────────────────────────────────────────
// choice: { label, result, aff: {default, <personalityId>: delta}, cost?: {stones}, effect?: {qiFrac, health,
//   karma, integrity, contribution, items: {id: qty}}, outcome?: 'forgive'|'duel'|'divorce'|'beg'|'let_go' }
// `aff` is keyed by the SPOUSE's personality. requires: 'sect'|'beast'|'children' gates the event.
const MARRIAGE_EVENTS = [
  { id: 'anniversary', title: 'An Anniversary', text: '{spouse} reminds you, a little pointedly, that today marks another year since your wedding.',
    choices: [
      { label: 'Throw a grand banquet', cost: { stones: 60 }, result: 'The banquet is spoken of for a decade.',
        aff: { default: 8, glutton: 15, arrogant: 12, poet: 12, demonking: 10, miser: -10, grumpy: -4 } },
      { label: 'A quiet night under the moon', result: 'You share wine and say little. It is enough.',
        aff: { default: 5, poet: 10, stoic: 6, lazy: 8, niceguy: 8, arrogant: -5, demonking: -5 } },
      { label: 'You were in closed-door cultivation', effect: { qiFrac: 0.1 }, result: 'Your Qi deepens. The bed stays cold.',
        aff: { default: -10, stoic: -2, lazy: -3, niceguy: -6, poet: -15 } },
    ] },
  { id: 'rival_insult', title: 'An Insult at the Market', text: 'A young master from a lesser sect mocks {spouse} in front of half the market.',
    choices: [
      { label: 'Challenge him on the spot', effect: { health: -10, karma: -3 }, result: 'He will be eating through a reed for a month.',
        aff: { default: 6, hotblood: 15, psycho: 15, demonking: 12, arrogant: 12, coward: -8, niceguy: -4 } },
      { label: 'Walk away', result: 'You lead {spouse} away. The laughter follows you both.',
        aff: { default: -4, coward: 8, stoic: 3, niceguy: 4, hotblood: -12, arrogant: -12, demonking: -10 } },
      { label: 'Flay him with words', result: 'By the end, the market is laughing at him instead.',
        aff: { default: 4, gremlin: 10, arrogant: 8, grumpy: 6, poet: 6 } },
    ] },
  { id: 'hairpin', title: 'A Jade Hairpin', text: '{spouse} lingers at a jeweler\'s stall, staring at a hairpin carved from spirit jade.',
    choices: [
      { label: 'Buy it', cost: { stones: 40 }, result: '{spouse} wears it every day after.',
        aff: { default: 8, arrogant: 10, poet: 10, miser: -5 } },
      { label: 'Haggle the jeweler down', cost: { stones: 20 }, result: 'Half price, and the jeweler weeps.',
        aff: { default: 3, miser: 12, gremlin: 6, arrogant: -6, poet: -4 } },
      { label: 'Pretend not to notice', result: 'You walk on. {spouse} does not mention it again.',
        aff: { default: -8, miser: 5, stoic: -2, lazy: -2 } },
    ] },
  { id: 'journey', title: 'The Sea of Clouds', text: '{spouse} wants to journey to the Sea of Clouds, just the two of you.',
    choices: [
      { label: 'Go together', effect: { qiFrac: -0.15 }, result: 'Your cultivation stalls. Neither of you minds.',
        aff: { default: 10, poet: 15, hotblood: 8, gremlin: 8, lazy: -3, grumpy: -6, paranoid: -4 } },
      { label: 'Cultivation comes first', result: '{spouse} goes nowhere and says nothing about it.',
        aff: { default: -6, stoic: 0, grumpy: 3, lazy: 2, poet: -12 } },
      { label: 'Send them with an escort', cost: { stones: 30 }, result: 'They return safe, sunburnt, and a little lonely.',
        aff: { default: 2, paranoid: 6, coward: 6, miser: -4 } },
    ] },
  { id: 'stew', title: 'A Suspicious Stew', text: '{spouse} has cooked you a spirit-beast stew. It is smoking. It is also purple.',
    choices: [
      { label: 'Eat every bite', effect: { health: -5 }, result: 'Your meridians object loudly. You smile anyway.',
        aff: { default: 8, glutton: 12, gremlin: 10, niceguy: 6 } },
      { label: 'Politely decline', result: '{spouse} eats it alone, watching you.',
        aff: { default: -5, stoic: -1, lazy: -2, glutton: -10 } },
      { label: 'Critique the seasoning', result: 'A frank discussion of salt follows.',
        aff: { default: -8, grumpy: 5, stoic: 2, arrogant: -12, poet: -10 } },
    ] },
  { id: 'teach', title: 'A Request for Guidance', text: '{spouse} is stuck at a bottleneck and asks for your guidance.',
    choices: [
      { label: 'Guide them for a season', effect: { qiFrac: -0.1 }, result: 'Their Qi flows smoother. So does the house.',
        aff: { default: 8, hotblood: 10, niceguy: 8, paranoid: 4, lazy: -4, arrogant: -3 } },
      { label: 'Every path is walked alone', result: '{spouse} nods, and walks it alone.',
        aff: { default: -3, stoic: 4, paranoid: 3, arrogant: 2, niceguy: -6 } },
    ] },
  { id: 'sect_elder', requires: 'sect', title: 'Meeting the Elder', text: '{spouse} wants to be presented to your sect elder.',
    choices: [
      { label: 'Introduce them', effect: { contribution: 10 }, result: 'The elder approves. Your standing rises a little.',
        aff: { default: 6, arrogant: 10, demonking: 8, coward: -5, paranoid: -5, grumpy: -3 } },
      { label: 'Keep sect and home apart', result: 'Some walls are worth keeping.',
        aff: { default: -5, paranoid: 6, grumpy: 3, lazy: 3 } },
    ] },
  { id: 'beast_ride', requires: 'beast', title: 'A Ride on the Beast', text: '{spouse} wants to ride your spirit beast. Just once. Probably.',
    choices: [
      { label: 'Let them', result: 'The beast tolerates it. {spouse} is thrilled for days.',
        aff: { default: 8, gremlin: 12, hotblood: 10, psycho: 8, coward: -6, grumpy: -3 } },
      { label: 'It is too dangerous', result: 'The beast looks relieved. {spouse} does not.',
        aff: { default: -4, coward: 4, paranoid: 3, hotblood: -8 } },
    ] },
  { id: 'bullied_child', requires: 'children', title: 'Trouble at the Clan School', text: '{child} comes home bruised. Another family\'s child has been bullying them.',
    choices: [
      { label: 'Confront the bully\'s parents', effect: { karma: -2 }, result: 'The bullying stops. So do the invitations.',
        aff: { default: 6, hotblood: 10, psycho: 12, demonking: 8, niceguy: -2, coward: -6 } },
      { label: 'Teach {child} to fight', effect: { qiFrac: -0.05 }, result: '{child} wins the rematch.',
        aff: { default: 5, demonking: 8, stoic: 5, hotblood: 8, niceguy: -3 } },
      { label: 'Children sort these things out', result: 'They do, eventually, badly.',
        aff: { default: -6, lazy: 5, stoic: 2, niceguy: -10, poet: -8 } },
    ] },
  { id: 'lantern_festival', title: 'The Lantern Festival', text: 'The valley is lit with ten thousand lanterns tonight.',
    choices: [
      { label: 'Go together', cost: { stones: 25 }, result: 'You release a lantern together. {spouse} will not say what they wished for.',
        aff: { default: 7, poet: 12, gremlin: 10, glutton: 8, grumpy: -8, miser: -8 } },
      { label: 'Stay home', result: 'You watch the lanterns from the roof.',
        aff: { default: -3, grumpy: 6, lazy: 6, paranoid: 4, poet: -8 } },
    ] },
  { id: 'old_acquaintance', title: 'An Old Acquaintance', text: 'Someone from {spouse}\'s past arrives at the gate, smiling a little too warmly.',
    choices: [
      { label: 'Welcome them in', result: 'The evening is pleasant. Mostly.',
        aff: { default: 4, niceguy: 8, gremlin: 4, paranoid: -6 } },
      { label: 'Glare them off the mountain', result: 'They leave. Quickly.',
        aff: { default: -2, demonking: 6, arrogant: 4, paranoid: 8, niceguy: -8 } },
      { label: 'Ask pointed questions', result: 'You learn a great deal. {spouse} learns you were listening.',
        aff: { default: -1, paranoid: 10, stoic: -3, poet: -4 } },
    ] },
  { id: 'in_laws_debt', title: 'The In-Laws', text: '{spouse}\'s family has fallen on hard times and asks for help.',
    choices: [
      { label: 'Pay their debts', cost: { stones: 50 }, effect: { karma: 3 }, result: 'Your in-laws bow deeply at the next festival.',
        aff: { default: 6, niceguy: 10, poet: 6, miser: -12 } },
      { label: 'Refuse', result: 'The next family dinner is very quiet.',
        aff: { default: -6, miser: 10, demonking: 5, niceguy: -10 } },
      { label: 'Intimidate their creditors', effect: { karma: -5 }, result: 'The debt is forgiven. Nobody asks how.',
        aff: { default: 2, demonking: 12, psycho: 10, hotblood: 6, niceguy: -10, coward: -8 } },
    ] },
  { id: 'terrible_poem', title: 'A Poem for You', text: '{spouse} has written you a poem. It rhymes "Dao" with "cow" four times.',
    choices: [
      { label: 'Praise it lavishly', result: 'It is framed and hung in the main hall.',
        aff: { default: 6, poet: 15, arrogant: 8, gremlin: 6 } },
      { label: 'Offer honest critique', result: 'You are technically correct. It does not help.',
        aff: { default: -6, stoic: 5, grumpy: 5, poet: -20, arrogant: -10 } },
      { label: 'Write one back', result: 'Yours rhymes "Qi" with "tea". A family tradition is born.',
        aff: { default: 8, poet: 12, gremlin: 8, lazy: -2 } },
    ] },
  { id: 'demonic_rumor', title: 'Whispers of the Demonic Path', text: 'Rumor says {spouse} practices demonic arts in secret.',
    choices: [
      { label: 'Defend their honor publicly', effect: { karma: -3 }, result: 'The rumor dies. So does one rumormonger\'s career.',
        aff: { default: 8, demonking: 12, paranoid: 4, arrogant: 6 } },
      { label: 'Investigate quietly', result: 'You find nothing. {spouse} finds out you looked.',
        aff: { default: -4, paranoid: 6, stoic: 2, niceguy: -8, poet: -6 } },
      { label: 'Ignore the gossip', result: 'Gossip starves when nobody feeds it.',
        aff: { default: 2, stoic: 6, lazy: 6, hotblood: -6 } },
    ] },
  { id: 'breakthrough_worry', title: 'A Plea for Caution', text: '{spouse} begs you to wait before your next breakthrough. They dreamed of lightning.',
    choices: [
      { label: 'Promise to be careful', effect: { integrity: 10 }, result: 'You spend a month steadying your foundation.',
        aff: { default: 6, coward: 12, niceguy: 8, paranoid: 6, hotblood: -6 } },
      { label: 'The heavens wait for no one', result: 'You press on. {spouse} lights incense every night.',
        aff: { default: -4, hotblood: 8, psycho: 6, demonking: 6, coward: -10 } },
    ] },
  { id: 'spirit_cat', title: 'A Stray Spirit Cat', text: '{spouse} has brought home a stray spirit cat. It has already bitten the gatekeeper.',
    choices: [
      { label: 'Keep it', cost: { stones: 10 }, result: 'The cat rules the household within a week.',
        aff: { default: 6, niceguy: 10, gremlin: 12, psycho: 6, miser: -6, grumpy: -5 } },
      { label: 'No animals in the house', result: 'The cat leaves. {spouse} visits it daily.',
        aff: { default: -4, grumpy: 4, miser: 4, paranoid: 2 } },
    ] },
  { id: 'gambling_debt', title: 'A Night at the Gambling Den', text: '{spouse} lost a small fortune at a gambling den and is too ashamed to look at you.',
    choices: [
      { label: 'Pay it quietly', cost: { stones: 30 }, result: 'It is never mentioned again.',
        aff: { default: 6, lazy: 4, niceguy: 4, miser: -8 } },
      { label: 'Scold them', result: 'Loud. Deserved. Not forgotten.',
        aff: { default: -6, miser: 6, grumpy: 4, gremlin: -10, arrogant: -8 } },
      { label: 'Win it back yourself', effect: { karma: -2 }, result: 'You win it back, and a little more.',
        aff: { default: 4, gremlin: 12, psycho: 8, hotblood: 6, stoic: -4 } },
    ] },
  { id: 'tournament', title: 'A Martial Tournament', text: 'A tournament is held in the valley. {spouse} wants to watch you win it.',
    choices: [
      { label: 'Enter', effect: { health: -8, karma: 2 }, result: 'You take the banner. {spouse} cheers loudest.',
        aff: { default: 6, hotblood: 12, arrogant: 10, demonking: 10, coward: -8 } },
      { label: 'Decline', result: 'You watch from the stands.',
        aff: { default: -3, coward: 6, lazy: 6, stoic: 2, arrogant: -10, hotblood: -8 } },
    ] },
  { id: 'sleep_mantras', title: 'Mantras in the Night', text: '{spouse} complains that you recite mantras in your sleep. Loudly.',
    choices: [
      { label: 'Move to separate chambers', result: 'You both sleep better. Apart.',
        aff: { default: -4, grumpy: 6, paranoid: 4, lazy: 2, poet: -10 } },
      { label: 'Learn a silencing technique', effect: { qiFrac: -0.05 }, result: 'Silence, at last.',
        aff: { default: 5, stoic: 3, niceguy: 4 } },
      { label: 'Call it a blessing from the heavens', result: '{spouse} throws a pillow at you.',
        aff: { default: -2, gremlin: 10, arrogant: 4, demonking: 6, grumpy: -6 } },
    ] },
  { id: 'nightmare', title: 'A Nightmare', text: '{spouse} wakes shaking from a dream of your death.',
    choices: [
      { label: 'Hold them until dawn', result: 'Neither of you sleeps. Neither of you minds.',
        aff: { default: 8, poet: 10, niceguy: 10, coward: 8, stoic: -2 } },
      { label: 'Dreams are only dreams', result: 'You go back to sleep. {spouse} does not.',
        aff: { default: -6, stoic: 3, grumpy: 2, poet: -10 } },
      { label: 'Consult a diviner', cost: { stones: 20 }, result: 'The diviner sees a long life. Probably.',
        aff: { default: 3, paranoid: 12, gremlin: 6, coward: 6 } },
    ] },
  { id: 'herb_garden', title: 'A Spirit Herb Garden', text: '{spouse} wants to plant a spirit herb garden behind the cave dwelling.',
    choices: [
      { label: 'Dig it together', effect: { items: { spirit_herb: 5 } }, result: 'The first harvest is small, and yours.',
        aff: { default: 7, grumpy: 5, niceguy: 6, stoic: 4, lazy: -4 } },
      { label: 'Buy a finished garden', cost: { stones: 60 }, effect: { items: { spirit_herb: 8 } }, result: 'It blooms at once. It feels a little bought.',
        aff: { default: 3, lazy: 10, arrogant: 6, miser: -10, poet: -4 } },
      { label: 'We have no time for gardens', result: 'The plot behind the dwelling stays bare.',
        aff: { default: -5, stoic: 0, hotblood: 2 } },
    ] },
  { id: 'in_laws_visit', title: 'The Elders Visit', text: '{spouse}\'s parents come to inspect you. They are not impressed yet.',
    choices: [
      { label: 'Kowtow respectfully', effect: { karma: 3 }, result: 'They leave approving, if not warm.',
        aff: { default: 6, grumpy: 8, niceguy: 6, demonking: -6, arrogant: -4 } },
      { label: 'Show off your cultivation', result: 'Their teacups rattle. They are impressed.',
        aff: { default: 4, arrogant: 10, demonking: 10, stoic: -3, grumpy: -6 } },
      { label: 'Hide in seclusion', effect: { qiFrac: 0.1 }, result: 'You gain Qi. {spouse} handles the visit alone.',
        aff: { default: -8, lazy: 2, coward: 2 } },
    ] },
  { id: 'tribulation_storm', title: 'A Neighbor\'s Tribulation', text: 'A neighbor\'s heavenly tribulation splits the sky over your home. {spouse} is terrified.',
    choices: [
      { label: 'Shield them', effect: { health: -6 }, result: 'A stray bolt finds you instead of them.',
        aff: { default: 8, coward: 12, niceguy: 6, poet: 8 } },
      { label: 'Watch it together, taking notes', effect: { qiFrac: 0.05 }, result: 'You learn something about lightning.',
        aff: { default: 4, hotblood: 8, stoic: 6, psycho: 8, coward: -6 } },
      { label: 'Leave them to it', result: 'They ride out the storm alone.',
        aff: { default: -8, stoic: -2 } },
    ] },
  { id: 'heart_oath', title: 'A Heart-Demon Oath', text: '{spouse} asks you to swear a heart-demon oath of fidelity.',
    choices: [
      { label: 'Swear it', effect: { karma: 5 }, result: 'The oath binds your Dao heart. The heavens heard.',
        aff: { default: 10, paranoid: 15, poet: 12, niceguy: 6, gremlin: 5 } },
      { label: 'Refuse', result: 'The silence afterward is very long.',
        aff: { default: -10, lazy: -3, stoic: -5, psycho: -15, paranoid: -15 } },
      { label: 'Swear a ridiculous one instead', result: 'You swear on the honor of the spirit cat.',
        aff: { default: 2, gremlin: 15, lazy: 4, stoic: -4, paranoid: -8 } },
    ] },
]

// Low-affection pool (affection < AFFECTION_CRISIS). Outcomes are resolved in game-state.js.
const MARRIAGE_CRISIS_EVENTS = [
  { id: 'spouse_cheated', title: 'Betrayal', text: '{spouse} returns at dawn smelling of another cultivator\'s incense, and does not deny it.',
    choices: [
      { label: 'Forgive them', outcome: 'forgive', effect: { karma: 3 }, result: 'You forgive. You do not forget.' },
      { label: 'Confront them — to the death', outcome: 'duel', result: 'Swords are drawn in the courtyard.' },
      { label: 'Divorce them', outcome: 'divorce', result: 'The marriage ends with a single signature.' },
    ] },
  { id: 'spouse_leaving', title: 'Packing', text: '{spouse} is packing their things. They say this house has been cold for too long.',
    choices: [
      { label: 'Beg them to stay', outcome: 'beg', result: '' },
      { label: 'Let them go', outcome: 'let_go', result: 'You watch them walk down the mountain.' },
    ] },
]

// ── Children who grow up (clan-succession.md 2.6b) ───────────────────────────
const CHILD_YEARS_PER_STAGE   = 12      // game years per stage for a ×1 root child, from AWAKENING_AGE; ÷ root.mult
const CHILD_BOND_START        = 50
const CHILD_BOND_CRISIS       = 20      // below this, an adult child may run away (CHILD_RUNAWAY_CHANCE per event roll)
const CHILD_RUNAWAY_CHANCE    = 0.5
const CHILD_EVENT_YEARS       = [8, 18] // one pending child event at a time, never expires
const CHILD_EVENT_MIN_AGE     = 6
const FAVOR_SIBLING_PENALTY   = 5       // bond lost by every OTHER living child when you favor one
const CHILD_FETCH_BOND        = 25      // bond gained when you go after a runaway
// Big households spread you thin: with more than CHILD_ATTENTION children at home, every child's bond drifts
// DOWN (never up) toward 50 − CHILD_NEGLECT_PER_CHILD × (extra children), floored at CHILD_NEGLECT_FLOOR.
const CHILD_ATTENTION         = 4
const CHILD_NEGLECT_PER_CHILD = 2
const CHILD_NEGLECT_FLOOR     = 15
const CHILD_NEGLECT_DRIFT     = 0.5     // bond per game year

// ── Morality (every Person, −100 ruthless … +100 righteous). M3's alignment phase extends this field. ─
// Base by personality; children also inherit a nudge from your karma at their birth, then upbringing moves it.
const PERSONALITY_MORALITY = {
  niceguy: 50, poet: 15, stoic: 10, glutton: 10, lazy: 5, grumpy: 5, hotblood: 5, coward: 0, gremlin: 0,
  miser: -10, arrogant: -15, paranoid: -20, demonking: -40, psycho: -60,
}
const MORALITY_NOISE          = 15      // ± uniform at birth/roll
const MORALITY_KARMA_WEIGHT   = 0.2     // child: + (your karma − 50) × this at birth
// Affair reactions read the spouse's morality: violent outcomes × (1 + max(0, −m)/100), accept × (1 + max(0, m)/100).

// ── Child events (2.6b). Same shape as MARRIAGE_EVENTS, but `bond` is keyed by the CHILD's personality and
// applies to that child; `morality` nudges the child; `train` adds stage progress (capped at your stage);
// `favor` costs every other living child FAVOR_SIBLING_PENALTY bond. requires: 'siblings' | 'adult'.
// Tokens: {child}, {name}, {spouse}.
const CHILD_EVENTS = [
  { id: 'spared_rival', title: 'A Spared Rival', text: '{child} beat a rival in a clan spar — then helped them up. The elders are divided.',
    choices: [
      { label: 'Praise their mercy', morality: 10, result: '{child} stands a little taller.',
        bond: { default: 8, niceguy: 12, poet: 10, psycho: -6, demonking: -4 } },
      { label: 'Mercy is weakness', morality: -10, train: 0.3, result: '{child} will not hesitate again.',
        bond: { default: -6, demonking: 8, psycho: 10, arrogant: 4, niceguy: -12 } },
    ] },
  { id: 'forbidden_art', title: 'A Forbidden Technique', text: '{child} begs you to teach them a technique the elders call forbidden.',
    choices: [
      { label: 'Teach it in secret', morality: -5, train: 0.6, effect: { karma: -3 }, result: '{child} learns fast. Too fast, perhaps.',
        bond: { default: 8, demonking: 14, psycho: 12, hotblood: 10, coward: -4, stoic: -2 } },
      { label: 'Teach a safer art instead', train: 0.3, effect: { qiFrac: -0.1 }, result: 'Slower, steadier, and still yours.',
        bond: { default: 4, stoic: 8, coward: 8, paranoid: 4, hotblood: -4 } },
      { label: 'Refuse', result: '{child} sulks for a season.',
        bond: { default: -6, stoic: 2, coward: 4, hotblood: -10, demonking: -10 } },
    ] },
  { id: 'sibling_quarrel', requires: 'siblings', title: 'A Quarrel Between Siblings', text: '{child} and a sibling came to blows over a single spirit herb.',
    choices: [
      { label: 'Side with {child}', favor: true, result: '{child} wins. The sibling does not forget.',
        bond: { default: 10, arrogant: 14, glutton: 12, niceguy: 4 } },
      { label: 'Make them share it', morality: 5, result: 'Half a herb each. Nobody is happy. Everyone learns.',
        bond: { default: 2, niceguy: 8, stoic: 4, miser: -8, arrogant: -6 } },
      { label: 'Punish them both', result: 'The courtyard is very quiet for a while.',
        bond: { default: -5, stoic: 2, grumpy: 2, gremlin: -8 } },
    ] },
  { id: 'coming_of_age', requires: 'adult', title: 'Coming of Age', text: '{child} has come of age. The clan expects a ceremony.',
    choices: [
      { label: 'A grand ceremony', cost: { stones: 50 }, result: 'The whole valley hears the name {child} today.',
        bond: { default: 12, arrogant: 16, glutton: 14, poet: 12, miser: -2, stoic: 4 } },
      { label: 'A private blessing', result: 'Just the two of you, and a cup of old wine.',
        bond: { default: 6, stoic: 10, niceguy: 10, poet: 8, arrogant: -6 } },
      { label: 'You are in seclusion', effect: { qiFrac: 0.1 }, result: 'The ceremony goes on without you.',
        bond: { default: -14, stoic: -4, lazy: -6, niceguy: -16, poet: -18 } },
    ] },
  { id: 'wounded_cub', title: 'A Wounded Cub', text: '{child} carried home an injured spirit-beast cub.',
    choices: [
      { label: 'Help heal it', cost: { stones: 10 }, morality: 8, result: 'The cub follows {child} everywhere now.',
        bond: { default: 8, niceguy: 12, gremlin: 12, glutton: 4, psycho: -4 } },
      { label: 'Make them release it', result: '{child} watches it limp back into the forest.',
        bond: { default: -4, stoic: 2, paranoid: 2, niceguy: -8 } },
      { label: 'Take its core — a lesson in the Dao', morality: -12, effect: { items: { beast_core: 1 } }, result: '{child} does not cry. You notice.',
        bond: { default: -8, psycho: 10, demonking: 8, niceguy: -20, poet: -14 } },
    ] },
  { id: 'servant_bully', title: 'A Cruel Streak', text: 'A servant tearfully reports that {child} has been tormenting their son.',
    choices: [
      { label: 'Punish {child} harshly', morality: 8, result: '{child} apologizes. Their eyes do not.',
        bond: { default: -8, niceguy: 2, stoic: -2, psycho: -14, arrogant: -12 } },
      { label: 'Make them apologize', morality: 5, result: 'A stiff bow, and a lesson half-learned.',
        bond: { default: -2, niceguy: 4, grumpy: 2 } },
      { label: 'The strong rule the weak', morality: -10, result: 'The servant leaves your employ the next morning.',
        bond: { default: 6, psycho: 12, demonking: 12, arrogant: 10, niceguy: -10 } },
    ] },
  { id: 'join_expedition', title: 'Take Me With You', text: '{child} wants to come along on your next expedition.',
    choices: [
      { label: 'Take them', effect: { health: -5 }, train: 0.5, result: 'You take a hit meant for {child}. They saw.',
        bond: { default: 10, hotblood: 14, gremlin: 10, coward: -6, lazy: -4 } },
      { label: 'It is too dangerous', result: '{child} watches you leave from the gate.',
        bond: { default: -5, coward: 6, lazy: 4, hotblood: -12 } },
    ] },
  { id: 'first_love', requires: 'adult', title: 'First Love', text: '{child} has fallen for a wandering cultivator with no name and no sect.',
    choices: [
      { label: 'Give your blessing', morality: 3, result: '{child} beams for a month.',
        bond: { default: 10, poet: 16, niceguy: 10, paranoid: -2 } },
      { label: 'Forbid it', result: '{child} obeys. Mostly.',
        bond: { default: -10, stoic: -2, grumpy: 0, poet: -18 } },
      { label: 'Test the suitor yourself', effect: { health: -3 }, result: 'The suitor survives the test. Barely. {child} is mortified.',
        bond: { default: 2, hotblood: 8, arrogant: 6, paranoid: 8, poet: -6 } },
    ] },
  { id: 'stolen_pills', title: 'Missing Pills', text: 'Pills are missing from the clan store. {child} is wearing a very innocent face.',
    choices: [
      { label: 'Let it go this once', morality: -3, result: '{child} grins. You will regret this.',
        bond: { default: 6, glutton: 10, gremlin: 8, lazy: 8, stoic: -2 } },
      { label: 'Punish them', morality: 5, result: '{child} scrubs the courtyard for a month.',
        bond: { default: -6, stoic: 2, grumpy: 4, gremlin: -10 } },
      { label: 'Admire the audacity', morality: -6, train: 0.2, result: 'You show {child} how to do it properly.',
        bond: { default: 8, gremlin: 16, psycho: 10, demonking: 8, niceguy: -6 } },
    ] },
  { id: 'poetry_path', title: 'The Path of the Brush', text: '{child} wants to give up cultivation for poetry.',
    choices: [
      { label: 'Let them follow their heart', train: -0.5, result: '{child} writes you a poem. It is not bad.',
        bond: { default: 10, poet: 18, lazy: 10, niceguy: 8, hotblood: -4 } },
      { label: 'Cultivation comes first', train: 0.3, result: '{child} returns to the training ground, brush left behind.',
        bond: { default: -8, stoic: 2, hotblood: 4, poet: -18 } },
    ] },
  { id: 'why_seclusion', title: 'Where Were You?', text: '{child} asks why you are always in seclusion.',
    choices: [
      { label: 'Spend a season with them', effect: { qiFrac: -0.1 }, result: 'A season of kites, sparring and bad cooking.',
        bond: { default: 12, niceguy: 14, glutton: 12, gremlin: 12, stoic: 4 } },
      { label: 'Explain the Dao', result: '{child} nods, and does not understand.',
        bond: { default: 2, stoic: 8, poet: 4, gremlin: -4 } },
      { label: 'Send them away', result: '{child} stops asking.',
        bond: { default: -12, stoic: -4, lazy: -4, niceguy: -16 } },
    ] },
  { id: 'public_humiliation', title: 'Humiliated', text: 'A rival clan heir humiliated {child} in the market square.',
    choices: [
      { label: 'Demand satisfaction', effect: { health: -8 }, morality: -3, result: 'The rival clan sends an apology — and a grudge.',
        bond: { default: 10, hotblood: 14, arrogant: 14, demonking: 10, coward: 2, niceguy: 2 } },
      { label: 'Train {child} for revenge', train: 0.5, morality: -5, result: 'A rematch is scheduled for next spring.',
        bond: { default: 8, hotblood: 12, psycho: 12, demonking: 10, coward: -6 } },
      { label: 'Teach them to rise above it', morality: 8, result: '{child} learns something harder than any technique.',
        bond: { default: 2, niceguy: 10, stoic: 10, poet: 6, arrogant: -10, hotblood: -8 } },
    ] },
]

// Low-bond adult child (bond < CHILD_BOND_CRISIS). Outcomes resolved in game-state.js.
const CHILD_CRISIS_EVENTS = [
  { id: 'child_runaway', title: 'An Empty Room', text: 'The room of {child} is empty. A note says they will make their own way — without you.',
    choices: [
      { label: 'Go after them', outcome: 'fetch', effect: { qiFrac: -0.1 }, result: 'You find {child} three valleys away. They come home.' },
      { label: 'Let them go', outcome: 'estrange', result: '{child} leaves the clan. The name stays; the child does not.' },
    ] },
]

// ── Tournament of Heirs (clan-succession.md 2.6c) ────────────────────────────
// You pick every matchup. Rounds are to the death while more than TOURNAMENT_TOP remain (a lethal round never
// takes the field below TOURNAMENT_TOP); then the Top 4 fight non-lethally to a winner = your heir; places 2–4
// are recorded as the future branch founders (2.6d). Fight odds: logistic over power difference / TOURNAMENT_SPREAD.
const TOURNAMENT_TOP            = 4
const TOURNAMENT_SPREAD         = 80      // power points (stage×100 + root×10) for ~73% odds
const TOURNAMENT_LUCK           = 60      // ± uniform power noise per fighter per fight
const TOURNAMENT_PERSONALITY_POWER = { hotblood: 40, psycho: 30, demonking: 20, arrogant: 10, lazy: -20, poet: -10 }
const TOURNAMENT_COWARD_YIELD   = 0.35    // a coward facing a lethal loss may yield: loses, lives, disgraced
const TOURNAMENT_SURVIVOR_BOND  = -30     // every lethal-round survivor's bond (ruthless personalities: +5 instead)
const TOURNAMENT_RUTHLESS       = ['psycho', 'demonking']
const TOURNAMENT_KARMA_PER_DEATH = -3
const TOURNAMENT_SPOUSE_AFFECTION_PER_DEATH = -15   // per child of your current spouse who dies
