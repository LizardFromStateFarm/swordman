// Family: spouse affection, marriage/crisis events, affairs + discovery reactions (Phase 16-lite+, M2).
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
