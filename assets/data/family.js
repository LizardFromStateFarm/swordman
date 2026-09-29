// Family: spouse affection, marriage/crisis events, affairs + discovery reactions (Phase 16-lite+, M2), plus
// children who grow up, child events and PERSONALITY_MORALITY (clan-succession.md 2.6b).
// Used by: game-state.js (_tickFamily, resolveMarriageEvent, resolveDuel, encounters), game.js, scripts/sim/*.
// 1.8b-3a adds courtship (COURT_*), spouse actions, child wishes and raising actions; 1.8b-3b adds affair choices
// (COVER_*, CONFESS_*, LOVER_SCORN) and the fight card (FIGHT_*) at the bottom.
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

// ── 1.8b-3a: family agency (family.md → "1.8b-3a"). The player's own choices — courtship, spouse actions,
// whether to have a child, raising a child. All deltas keyed by the OTHER person's personality. ───────────────
// Courtship: you pick who. Stone costs scale like event costs (familyCost).
const COURT_CANDIDATES          = 3
const COURT_SEEK_COST           = 30        // stones, × (1 + stage × FAMILY_STONE_SCALE)
const COURT_SEEK_COOLDOWN_SECS  = 300       // real seconds (open time), after a refusal or a withdrawn courtship
const COURT_INTEREST_START      = 40
const COURT_SAME_PERSONALITY    = 10
const COURT_BEAT_GAP_SECS       = 120       // real seconds between meetings
const COURT_BEATS_TO_PROPOSE    = 2
const COURT_STAGE_WEIGHT        = 0.03      // proposal chance per stage you stand above them
const COURT_KARMA_WEIGHT        = 0.004     // per karma point above 50
const COURT_PROPOSE_RANGE       = [0.05, 0.95]
const COURT_AFFECTION_CARRY     = 0.5       // wedding affection = AFFECTION_START + (interest − 50) × this
const SPURNED_MAX               = 5
const SPURNED_ENCOUNTER_CHANCE  = 0.3       // share of road encounters that are a suitor who once refused you

// Courtship meetings. `int` = interest delta keyed by the TARGET's personality. Tokens: {them}, {name}.
const COURT_BEATS = [
  { id: 'tea_house', title: 'A Tea House by the River', text: '{them} has chosen a tea house where the river is loud enough to hide an awkward silence.',
    choices: [
      { label: 'Recite a poem you wrote', way: 'gentle', result: '{them} listens to the end, which is more than most would.',
        int: { default: 6, poet: 18, niceguy: 8, stoic: -2, hotblood: -6, gremlin: 4 } },
      { label: 'Talk cultivation theory', way: 'clever', result: 'An hour passes over meridian diagrams.',
        int: { default: 4, stoic: 10, paranoid: 6, grumpy: 8, lazy: -8, glutton: -4 } },
      { label: 'Order everything on the menu', way: 'lavish', cost: { stones: 20 }, result: 'The table groans. So does your purse.',
        int: { default: 5, glutton: 18, arrogant: 8, miser: -12, stoic: -2 } },
    ] },
  { id: 'bandits', title: 'Bandits on the Pass', text: 'Walking {them} home, a dozen bandits step onto the mountain road.',
    choices: [
      { label: 'Cut them down', way: 'bold', effect: { health: -8, karma: -2 }, result: 'It is over quickly. {them} is watching you differently now.',
        int: { default: 8, hotblood: 16, psycho: 16, demonking: 14, arrogant: 10, niceguy: -6, coward: -4 } },
      { label: 'Talk them into leaving', way: 'clever', effect: { karma: 3 }, result: 'Somehow the bandits leave with directions to an honest job.',
        int: { default: 6, niceguy: 16, poet: 8, gremlin: 10, hotblood: -8, psycho: -10 } },
      { label: 'Grab {them} and run', way: 'cautious', result: 'You arrive home breathless and laughing.',
        int: { default: 2, coward: 16, lazy: 8, gremlin: 8, arrogant: -12, demonking: -12, hotblood: -10 } },
    ] },
  { id: 'rival_suitor', title: 'A Rival Suitor', text: 'A young master arrives bearing a spirit-beast pelt as a courting gift for {them}. He looks at you and smirks.',
    choices: [
      { label: 'Challenge him to a spar', way: 'bold', effect: { health: -5 }, result: 'He leaves with the pelt and without his pride.',
        int: { default: 6, hotblood: 14, arrogant: 12, demonking: 10, niceguy: -4, coward: -6 } },
      { label: 'Outbid him with a finer gift', way: 'lavish', cost: { stones: 40 }, result: 'The pelt looks shabby beside yours.',
        int: { default: 5, miser: 16, arrogant: 10, glutton: 6, stoic: -4, niceguy: -2 } },
      { label: 'Let {them} choose', way: 'humble', result: '{them} raises an eyebrow, then walks out with you.',
        int: { default: 7, stoic: 10, niceguy: 10, paranoid: 8, arrogant: -6, demonking: -8 } },
    ] },
  { id: 'lantern_night', title: 'The Lantern Festival', text: 'The town floats a thousand lanterns tonight. {them} asks what you wished for.',
    choices: [
      { label: 'Immortality', way: 'wild', result: '{them} laughs. "Of course you did."',
        int: { default: 2, stoic: 6, demonking: 12, arrogant: 8, poet: -6, niceguy: -4 } },
      { label: '"That you would ask me that"', way: 'gentle', result: 'The lantern light hides nothing.',
        int: { default: 8, poet: 16, niceguy: 10, stoic: -4, paranoid: -8, grumpy: -6 } },
      { label: 'Dumplings, forever', way: 'playful', result: 'It is honest, at least.',
        int: { default: 3, glutton: 18, gremlin: 14, lazy: 8, arrogant: -8, stoic: -4 } },
    ] },
  { id: 'their_family', title: 'Meeting the Elders', text: 'The elders of {them}\'s family receive you in a cold hall and ask what your prospects are.',
    choices: [
      { label: 'Boast of your cultivation', way: 'bold', result: 'The eldest nods, once. It is a start.',
        int: { default: 4, arrogant: 12, demonking: 10, hotblood: 6, niceguy: -4, stoic: -2 } },
      { label: 'Bow low and bring gifts', way: 'humble', cost: { stones: 30 }, result: 'Courtesy is remembered. So are the gifts.',
        int: { default: 7, grumpy: 14, miser: 10, niceguy: 8, paranoid: 4, demonking: -6 } },
      { label: 'Tell them it is not their decision', way: 'wild', result: 'The hall goes silent. {them} hides a smile, or a grimace.',
        int: { default: -2, psycho: 14, demonking: 12, hotblood: 8, gremlin: 6, grumpy: -12, niceguy: -8 } },
    ] },
  { id: 'secret_realm', title: 'A Small Secret Realm', text: '{them} knows of a minor secret realm and wants to see if you can keep up.',
    choices: [
      { label: 'Race them to the treasure', way: 'bold', effect: { qiFrac: 0.03 }, result: 'You both come out scratched and grinning.',
        int: { default: 6, hotblood: 14, arrogant: 8, lazy: -6, coward: -8 } },
      { label: 'Let them take the prize', way: 'humble', result: '{them} notices you slowed down. Whether that pleases them is another matter.',
        int: { default: 5, niceguy: 10, poet: 8, arrogant: 6, demonking: -6, hotblood: -8 } },
      { label: 'Scout for traps first', way: 'cautious', effect: { integrity: 2 }, result: 'There were three. You found all of them.',
        int: { default: 4, paranoid: 16, stoic: 8, coward: 10, hotblood: -6, gremlin: -2 } },
    ] },
  { id: 'rainy_day', title: 'Caught in the Rain', text: 'A storm pins you both under a pavilion for an afternoon.',
    choices: [
      { label: 'Share old stories', way: 'gentle', result: 'You learn more of {them} in one afternoon than in a month.',
        int: { default: 7, niceguy: 10, grumpy: 10, poet: 8, psycho: -2, stoic: 2 } },
      { label: 'Meditate in silence', way: 'calm', effect: { qiFrac: 0.02 }, result: 'The rain drums. Neither of you minds.',
        int: { default: 3, stoic: 16, lazy: 12, hotblood: -8, gremlin: -8, poet: -2 } },
      { label: 'Invent a ridiculous game', way: 'playful', result: 'By dusk there are rules, a scoreboard and one accusation of cheating.',
        int: { default: 4, gremlin: 18, glutton: 6, hotblood: 6, grumpy: -8, stoic: -6 } },
    ] },
  { id: 'old_wound', title: 'An Old Wound', text: '{them} admits, quietly, to a past they are not proud of.',
    choices: [
      { label: 'It changes nothing', way: 'gentle', result: '{them} lets out a breath held for years.',
        int: { default: 9, niceguy: 12, poet: 12, paranoid: 6, psycho: 4 } },
      { label: 'Ask for every detail', way: 'clever', result: 'You get them. Every one.',
        int: { default: -2, paranoid: 12, psycho: 10, gremlin: 4, poet: -8, niceguy: -6 } },
      { label: 'Confess something worse', way: 'wild', effect: { karma: -1 }, result: '{them} stares, then laughs until they cry.',
        int: { default: 6, demonking: 14, psycho: 12, gremlin: 12, stoic: -4, niceguy: -2 } },
    ] },
]

// How each meeting choice comes across (UI: an icon name from assets/icons/ui-icons.js + a hint at who likes it; the real
// effect is the choice's int).
const COURT_WAYS = {
  bold:     { glyph: 'active', hint: 'bold · the fierce admire it' },
  gentle:   { glyph: 'heart', hint: 'gentle · soft hearts warm to it' },
  clever:   { glyph: 'eye', hint: 'clever · the careful take note' },
  lavish:   { glyph: 'gift', hint: 'lavish · for lovers of fine things' },
  playful:  { glyph: 'mask', hint: 'playful · odd souls laugh along' },
  humble:   { glyph: 'lotus', hint: 'humble · the proud may think it weak' },
  wild:     { glyph: 'lightning', hint: 'reckless · the unhinged love it' },
  cautious: { glyph: 'shield', hint: 'cautious · the wary approve' },
  calm:     { glyph: 'idle', hint: 'calm · quiet ones settle beside you' },
}

// Spouse actions — each its own cooldown in real seconds (open time). aff keyed by the SPOUSE's personality.
const SPOUSE_ACTIONS = {
  time: { cdSecs: 300, qiFrac: 0.03, aff: { default: 4, lazy: 7, poet: 7, niceguy: 6, grumpy: 5, stoic: 2, demonking: 2, hotblood: 3 } },
  gift: { cdSecs: 300, stones: 40, aff: { default: 6, miser: 12, glutton: 10, arrogant: 9, gremlin: 8, stoic: 2, niceguy: 4 } },
  dual: { cdSecs: 300 },
}
const DUAL_QI_BASE          = 0.12    // share of the Qi cap gained
const DUAL_QI_PER_STAGE     = 0.02    // per stage your spouse stands above you
const DUAL_QI_RANGE         = [0.04, 0.25]
const DUAL_AFFECTION        = 3
const DUAL_SAFE_AFFECTION   = 60      // deviation risk = clamp((this − affection)/100, DUAL_RISK_RANGE)
const DUAL_RISK_RANGE       = [0.03, 0.6]
const DUAL_DEVIATION        = { health: -15, integrity: -8, aff: -6 }
const CHILD_TRY_GAP_SECS    = 600     // real seconds (open time)
const PREGNANCY_YEARS       = 1
const SEPARATE_CHILD_BOND   = -10     // every child shared with a spouse you leave
const AFF_TRAIL_MAX         = 12      // yearly affection samples kept for the trend arrow
const AFF_TREND_YEARS       = 10      // trend = now vs this many years ago
// Declining a partner's wish for a child ("Not now"), keyed by the partner's personality.
const CHILD_WISH_DECLINE_AFF = { default: -4, niceguy: -2, stoic: -1, lazy: -1, poet: -8, hotblood: -6, demonking: -6 }

// Raising a child — per-child cooldowns (real seconds, open time). bond keyed by the CHILD's personality.
const TEACH_MIN_AGE         = 12
const GIFT_MIN_AGE          = 6
const TEACH_MORALITY_PULL   = 0.15    // the child's morality moves this share of the way toward yours
const CHILD_ACTIONS = {
  time:  { cdSecs: 300, qiFrac: 0.02, bond: { default: 6, lazy: 8, niceguy: 8, poet: 8, grumpy: 5, stoic: 3, psycho: 2, demonking: 3 } },
  teach: { cdSecs: 300, qiFrac: 0.06, xp: 0.35, bond: { default: 3, hotblood: 6, stoic: 5, paranoid: 4, arrogant: -2, lazy: -3 } },
  gift:  { cdSecs: 300, stones: 50, xp: 0.2, bond: { default: 4, miser: 9, glutton: 8, arrogant: 6, stoic: 1 },
           spoil: { arrogant: -4, psycho: -4, demonking: -3, miser: -2 } },
}

// ── 1.8b-3b: affairs on your terms (family.md → "1.8b-3b") ────────────────────
const COVER_TRACKS_COST        = 60        // stones, scaled like event costs
const COVER_YEARS              = 20
const COVER_DISCOVERY_MULT     = 0.3
const CONFESS_AFFECTION        = -12       // instead of AFFAIR_DISCOVERED_AFFECTION
const CONFESS_ACCEPT_MULT      = 2
const CONFESS_VIOLENT_MULT     = 0.5
const AFFAIR_EXTEND_YEARS      = [10, 20]  // "one more season" after an ultimatum
const AFFAIR_HOT_DISCOVERY_MULT = 2.5      // …and discovery runs hotter meanwhile
const LOVER_WED_AFFECTION      = 70
// Chance a lover you leave does not go quietly (tells your spouse, or becomes a rival), by the LOVER's personality.
const LOVER_SCORN = { default: 0.15, psycho: 0.6, demonking: 0.45, arrogant: 0.4, paranoid: 0.35, hotblood: 0.3,
                      poet: 0.25, grumpy: 0.2, niceguy: 0.02, stoic: 0.05, lazy: 0.05, coward: 0.05 }

// ── 1.8b-3b: your own fights (spouse duel, head challenges) ───────────────────
// First to FIGHT_TO exchanges. Press beats Feint, Feint beats Guard, Guard beats Press (± FIGHT_EDGE on the exchange).
const FIGHT_TO          = 2
const FIGHT_EDGE        = 0.18
const FIGHT_EXCHANGE_RANGE = [0.05, 0.95]
const FIGHT_WOUND       = 4        // Health per exchange lost (never below 1 mid-fight)
const YIELD_ACCEPT_BASE = 0.5      // lethal fight: the opponent accepts your yield with this + morality/100 (+ bond for kin)
const FIGHT_TACTICS = {
  press: { name: 'Press', glyph: 'sword', beats: 'feint', blurb: 'All-out attack' },
  guard: { name: 'Guard', glyph: 'shield', beats: 'press', blurb: 'Hold and counter' },
  feint: { name: 'Feint', glyph: 'veil', beats: 'guard', blurb: 'Draw them open' },
}
// How each temper fights: weights for press / guard / feint, and the hint the player sees.
const FIGHT_STYLE = {
  default:   { press: 34, guard: 33, feint: 33, hint: 'fights without a clear habit' },
  hotblood:  { press: 60, guard: 15, feint: 25, hint: 'charges in, again and again' },
  psycho:    { press: 50, guard: 10, feint: 40, hint: 'lunges, grinning, and loves a trick' },
  demonking: { press: 55, guard: 20, feint: 25, hint: 'wants a grand, crushing blow' },
  arrogant:  { press: 50, guard: 30, feint: 20, hint: 'attacks first, too proud to trick' },
  stoic:     { press: 20, guard: 60, feint: 20, hint: 'waits behind a wall of guard' },
  coward:    { press: 10, guard: 60, feint: 30, hint: 'keeps their distance and covers up' },
  grumpy:    { press: 25, guard: 55, feint: 20, hint: 'old habits: guard, then punish' },
  lazy:      { press: 20, guard: 50, feint: 30, hint: 'does as little as possible' },
  paranoid:  { press: 15, guard: 40, feint: 45, hint: 'suspects every move, answers with tricks' },
  gremlin:   { press: 30, guard: 15, feint: 55, hint: 'nothing they do makes sense, on purpose' },
  poet:      { press: 25, guard: 30, feint: 45, hint: 'fights like a verse: turns and feints' },
  miser:     { press: 20, guard: 45, feint: 35, hint: 'spends nothing it does not have to' },
  glutton:   { press: 45, guard: 35, feint: 20, hint: 'heavy, straightforward swings' },
  niceguy:   { press: 25, guard: 50, feint: 25, hint: 'does not want to hurt you' },
}
const TOURNAMENT_SPARE_BOND = -20   // a spared loser leaves the house in disgrace

// ── Phase 35 / A6-3a (combat.md): your fights with people, on the battle page ──
const DUEL_TO = 3                   // exchanges to win a fight with a person (beasts: BATTLE_TO); odds keep the old match chance
// A won fight waits for your end choice. What each temper makes of it: 'debt' (they owe you) or 'grudge' (they hate you).
const SPARE_REACTION = { default: 'debt', arrogant: 'grudge', demonking: 'grudge', psycho: 'grudge', hotblood: 'grudge', grumpy: 'grudge' }
const RAISE_REACTION = { default: 'debt', psycho: 'grudge', demonking: 'grudge' }
const HUMBLE_REACTION = { default: 'grudge', coward: 'debt', niceguy: 'debt' }
const HUMBLE_QUIET_YEARS = [15, 25] // after you humble someone, no one else dares challenge you for this long
const FEUD_CHALLENGE_WEIGHT = 3     // a grudge-holder is this many times likelier to be the one who calls you out
const FEUD_POWER = 30               // …and fights you this much harder (a debtor never challenges you)
const FEUD_YIELD = 0.25             // yield acceptance: + for a debtor, − for a grudge-holder
const SPARE_KARMA = 2               // sparing a life you could have taken
const FEUD_TEXT = { debt: 'owes you', grudge: 'holds a grudge' }
