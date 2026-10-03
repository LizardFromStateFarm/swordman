// Living Sects — the world's sect registry (Phase 43b, docs/systems/npc-sects.md): the seed table for the five
// joinable sects + the first rivals, the yearly growth/decline/birth/clash sim tuning, Might weights, stance bands,
// the world-sect events (WORLD_SECT_EVENTS) with their choices, (43f) SECT_RAZE — razing + the remnant, and (43d) SECT_BLESSING — the joined blessing's
// build-up factor, rank shares, hall funding, the levy + court tuning. Data only.
// Depends on: sect-buildings.js (building ids), sect-war.js (RIVAL_SECT_* name pools), personalities.js (temper ids).
// Used by: renderer/engine/game-state.js (_ensurePhase43bFields, _tickWorldSects, worldSectsInfo, world events),
// renderer/game/sect-view.js (the "Sects of the World" ledger + the event card + the 43d blessing card),
// renderer/game/breakdowns.js (the blessing "why"), renderer/game/attention.js.

const WORLD_SECTS = {
  // Alive-sect cap for births (a seceded branch always makes its record, even past it).
  maxAlive: 12,
  // Births top the world up to this many rival (non-joinable) sects.
  rivalsTarget: 4,
  birthChance: 0.12,          // per game year, while under rivalsTarget

  // Growth — per game year, per alive sect. A sect raises ONE thing at most a year: a building level (an unbuilt hall
  // counts as level 0 → 1) or, with hallShare, its Sect Hall. Never past its own caps (maxBuildingLevel / maxHall).
  growChance: 0.03,
  growPerTier: 0.008,         // + this × tier (tier 4 ≈ one level every ~16 game years ≈ 30 open minutes; tuned in 43g)
  hallShare: 0.25,
  // Disciples drift toward the Sect Hall's NPC cap (index = hallLevel − 1) by this fraction a year.
  discipleCaps: [30, 80, 200, 500],
  discipleDrift: 0.08,

  // Setbacks — the world is not only a ladder. A fire, a feud, a lost elder: one building level is lost.
  declineChance: 0.012,
  // Two NPC sects that clash: the weaker (by Might, with a roll) loses a level and some disciples.
  clashChance: 0.02,
  clashDiscipleLoss: 0.12,

  // A sect with no halls left and almost no disciples breaks up (joinable sects never do — they hold a floor).
  dissolveBelow: 6,

  // Might — the one number that says how strong a sect is (43c's war odds will read it).
  might: { perLevel: 8, perHall: 12, perTier: 10, discipleSqrt: 4 },
  mightBands: [ [40, 'Fledgling'], [80, 'Modest'], [130, 'Established'], [190, 'Mighty'], [Infinity, 'Towering'] ],

  // Stance toward you, −100..100. A sect remembers what you did (deeds) and it moves this.
  stanceBands: [ [-60, 'Sworn foe', 'red'], [-20, 'Hostile', 'red'], [20, 'Wary', 'dim'], [60, 'Cordial', 'jade'], [Infinity, 'Friendly', 'gold'] ],
  deedsMax: 5,
  chronicleMax: 14,

  // Your deeds → stance
  stanceJoin: 25, stanceLeave: -20, stanceDesert: -40,
  stanceWarDeclared: -10, stanceWarWonAgainst: -8, stanceMemberWarFoe: -5,
  stanceSeceded: -70,

  // War binding: who comes for you. weight = 1 + max(0, −stance)/hostilityDiv, rivals ×rivalWeight. Sworn allies never.
  hostilityDiv: 20, rivalWeight: 2,
  warDiscipleLoss: 0.1,       // the side that loses a war against you loses this share of its disciples
  // Phase 43c: a war's enemy strength = your side × ratio × (0.6–1.4). ratio = (their Might / yours)^exp, clamped —
  // dampened so a Towering foe is a hard war, not a hopeless one (pillar 4: the odds card always shows it first).
  // A foe that loses burns one hall a level; a foe that wins raises one (never past its caps) and holds you cheaper.
  war: { ratioExp: 0.6, ratioMin: 0.4, ratioMax: 2.5 },
  stanceWarBeatYou: -5,

  // World events — at most one waits at a time; it never expires (it waits on you).
  eventChance: 0.07,          // per game year, when none is pending
}

// Phase 43d: the joined blessing scales with the sect (docs/systems/npc-sects.md → "43d").
// factor = base + perLevel × Σ hall levels + perHall × (Sect Hall − 1), clamped [min, max]: a poor sect blesses
// little, a grown one more, the late-join sect starts near the top. Your rank decides your share of it
// (rankShare[SECT_RANKS index]). The effects then scale by k = factor × share: ×1.4 → ×(1 + 0.4·k), +5% → +5%·k.
const SECT_BLESSING = {
  base: 0.6, perLevel: 0.1, perHall: 0.08, min: 0.4, max: 1.5,
  rankShare: [0.8, 0.85, 0.9, 0.95, 1.0, 1.1],
  btFloorMax: 0.9,            // a scaled breakthrough floor never passes this (Heaven's 0.98 cap still applies after)
  // Fund a hall of the sect you belong to: your stones raise one level of THEIR hall (never past its own caps).
  // cost = building stones × 1.8^level (Sect Hall: SECT_HALL_LEVELS[lv−1].upgradeStones) × costMult × (1 + perTier·(tier−1))
  fund: { costMult: 1.0, perTier: 0.25, contribRate: 0.75, stance: 6, hallMinRank: 3 /* Elder: only they fund the Sect Hall */ },
  lostYears: 4,               // a lost hall can still call a levy for this many game years
  // A richer sect courts you when its blessing factor beats yours by courtGap and it stands ≥ courtStance toward you.
  courtGap: 0.25, courtStance: 20,
  stanceDefected: -35,        // what your old sect thinks of you when you go over to another
}

// The seed: the five joinable sects (weakish — the late one strong, user 2026-10-01) and the first rivals (they
// may hold high halls). `levels` = starting building levels; caps are per sect so the world never homogenizes.
const WORLD_SECT_SEED = [
  { defId: 'azure_sword',    tier: 1, maxBuildingLevel: 2, maxHall: 2, hallLevel: 1, temper: 'arrogant', levels: { training_ground: 1, qi_library: 1 } },
  { defId: 'myriad_herb',    tier: 1, maxBuildingLevel: 2, maxHall: 3, hallLevel: 1, temper: 'niceguy',  levels: { pill_hall: 1 } },
  { defId: 'thunder_palace', tier: 2, maxBuildingLevel: 2, maxHall: 3, hallLevel: 2, temper: 'hotblood', levels: { training_ground: 2, defensive_array: 1 } },
  { defId: 'void_moon',      tier: 3, maxBuildingLevel: 3, maxHall: 3, hallLevel: 2, temper: 'paranoid', levels: { qi_library: 2, treasury: 1, defensive_array: 1 } },
  { defId: 'heaven_defying', tier: 5, maxBuildingLevel: 3, maxHall: 4, hallLevel: 3, temper: 'demonking', levels: { qi_library: 3, pill_hall: 2, training_ground: 3, defensive_array: 2, treasury: 2 } },
]
const WORLD_RIVAL_SEED = [
  { tier: 4, maxBuildingLevel: 3, maxHall: 4, hallLevel: 3, levels: { training_ground: 3, defensive_array: 3, treasury: 2, beast_pen: 2 } },
  { tier: 3, maxBuildingLevel: 2, maxHall: 3, hallLevel: 2, levels: { training_ground: 2, defensive_array: 1, pill_hall: 1 } },
  { tier: 2, maxBuildingLevel: 2, maxHall: 2, hallLevel: 1, levels: { beast_pen: 1, training_ground: 1 } },
]
// A newborn rival (a birth, a refill after a fall): small, with room to grow.
const WORLD_SECT_NEWBORN = { tiers: [1, 2], maxBuildingLevel: [1, 3], maxHall: [2, 4], discipleStart: [8, 20] }
// A branch that seceded from your sect (Phase 45) becomes one of these.
const WORLD_SECT_SPLINTER = { tier: 1, maxBuildingLevel: 2, maxHall: 2, suffixes: ['Splinter Hall', 'Breakaway Sect', 'Severed Branch'] }

// Phase 46 (docs/systems/lineage-sect.md → 1.20b): a sect the player founded (or took over) outlives them. On death it
// becomes a real world sect (`kind: 'lineage'`) led by a branch head — it grows, churns and can be razed like any
// other. It never simply vanishes with the player: a steward holds the gate if no disciple remains.
const WORLD_SECT_LINEAGE = {
  stance: 70,                 // the sect still remembers your line founded it
  steward: 'a nameless steward',
  minDisciples: 1,            // a lineage record always shows at least this many
  // A lineage sect's tier starts from the founder's last realm: tier = 1 + floor(stage / 5), capped 1..5.
  realmTierStep: 5,
}

// Phase 46 (1.20c): the world's leaders age out. Each game year a seated leader faces this chance of being succeeded
// (a death or a retirement) — rising with how long they have held the seat, capped. A successor may bring a new temper.
const WORLD_SECT_LEADERS = {
  changeBase: 0.05,           // per game year, minimum
  changePerYear: 0.006,       // + this × years in the seat
  changeMax: 0.35,
  temperSwitchChance: 0.4,    // the successor's temper differs from the last master's
  disciplesJoinChance: 0.15,  // an occasional trickle of new blood (a flavour line, not a stat change)
  joinMin: 1, joinMax: 4,
}

// Tempers a newborn rival may get (the leader's personality — it shades how they answer you).
const WORLD_SECT_TEMPERS = ['arrogant', 'hotblood', 'miser', 'stoic', 'demonking', 'paranoid', 'grumpy', 'psycho', 'niceguy', 'poet']

// ── World-sect events (one waits at a time) ──────────────────────────────────────────────────────────────────
// needs: when the event may fire — stance [min,max] (of the chosen sect toward you), founder (you lead a sect),
//   splinter (the sect seceded from yours), notMine (never your own joined sect — always true here), justRaised.
// choice fields:
//   glyph  — the tile icon (assets/icons/ui-icons.js)
//   cost   { stones } (or stonesPerTier) — paid up front; a choice you can't afford is locked with the reason
//   gain   { stones, stonesPerTier, herbs } — what you get on success
//   stance { default, <sect temper>: n } — how THEY take it (the same answer lands differently on a proud master)
//   odds   { base, perStageGap, you: { <your personality>: ±n } } — a roll; fail* fields apply when it fails
//          perStageGap: × (your stage − the sect's tier × 4)
//   vsMight true — the roll is your Might against theirs (founder: your sect; otherwise your realm)
//   karma, health, disciples (+n: one joins you · −n: n leave), sworn (true: a sworn alliance),
//   result / failResult — log text ({sect} {leader} {hall} {mine} tokens; {mine} = the sect you belong to)
// Phase 43d fields: needs.mine (fires for YOUR joined sect only; every other event never does), needs.justLost
//   (it lost a hall within SECT_BLESSING.lostYears), needs.court (a member courted by a richer, friendly sect).
//   choice: restore (the lost hall is rebuilt), contrib / failContrib { base, perTier } (± Contribution in your own
//   sect; perTier × your sect's tier), mineStance / failMineStance { default, <temper> } (your OWN sect's stance, read
//   by its temper), defect (you go over to the event's sect), lockWar (locked while your sect is at war),
//   odds.mineStanceDiv (+ your own sect's stance ÷ this), health (paid on success as well).
// Phase 43f fields: needs.remnant (a sect reborn from ashes you made, still holding its grudge). choice: clearGrudge
//   (on success the feud is set down), march (they march on your sect; with lockWar, never while a war is underway).
const WORLD_SECT_EVENTS = [
  { id: 'envoy', short: 'Their envoys', weight: 3, needs: { stance: [-15, 100] }, glyph: 'gift',
    title: 'Envoys from the {sect}',
    text: 'Envoys of the {sect} climb to your door with spirit tea and a chest of stones. {leader} asks for friendship between your houses.',
    choices: [
      { label: 'Receive them as friends', glyph: 'tea', gain: { stonesPerTier: 25 }, stance: { default: 15, stoic: 8, niceguy: 20 },
        result: 'You drink their tea and keep their stones. The {sect} speaks well of you.' },
      { label: 'Demand tribute instead', glyph: 'crown', vsMight: true, gain: { stonesPerTier: 80 }, karma: -4,
        stance: { default: -25, arrogant: -40, demonking: -40, coward: -10, niceguy: -15 },
        result: 'They pay, white-faced. The {sect} will not forget the shame.',
        failStance: { default: -35 }, failResult: 'They laugh in your face and take their chest home. The tale travels.' },
      { label: 'Send them away', glyph: 'close', stance: { default: -8, arrogant: -15, stoic: -2, paranoid: -12 },
        result: 'The envoys leave with their tea untouched.' },
    ] },
  { id: 'hall_raised', short: 'Their new hall', weight: 4, needs: { stance: [-40, 100], justRaised: true }, glyph: 'hall',
    title: 'The {sect} raises its {hall}',
    text: 'Bells ring across the valleys: the {sect} has raised its {hall}, and every house of note is watching the ceremony.',
    choices: [
      { label: 'Send a congratulatory gift', glyph: 'gift', cost: { stonesPerTier: 20 }, gain: { herbs: 6 },
        stance: { default: 12, miser: 20, demonking: 6, arrogant: 16 },
        result: 'Your gift is read aloud at the ceremony. A basket of their herbs comes back with thanks.' },
      { label: 'Slip a spy into the new hall', glyph: 'eye', odds: { base: 0.5, perStageGap: 0.03, you: { paranoid: 0.15, gremlin: 0.06, coward: -0.08, hotblood: -0.1, niceguy: -0.06 } },
        gain: { stonesPerTier: 40, herbs: 4 }, karma: -2,
        result: 'Your spy walks out with a purse of stones and a sheaf of their herb ledgers. No one saw.',
        failStance: { default: -30, paranoid: -45 }, failHealth: -10, failKarma: -3,
        failResult: 'Your spy is caught on the third night. The {sect} sends back their hands and your name.' },
      { label: 'Let it pass', glyph: 'close', stance: { default: -3, arrogant: -6 }, result: 'You do not go. Few notice; the {sect} does.' },
    ] },
  { id: 'insult', short: 'Their insult', weight: 4, needs: { stance: [-100, -20] }, glyph: 'alert',
    title: 'An insult from the {sect}',
    text: 'An elder of the {sect} mocks your name before a crowd at the market of the Nine Bridges. {leader} is said to have laughed when told of it.',
    choices: [
      { label: 'Swallow it', glyph: 'yield', karma: 2, stance: { default: -5, arrogant: -10 },
        result: 'You let it pass. Some call it patience; the {sect} calls it fear.' },
      { label: 'Answer with your fists', glyph: 'duel', odds: { base: 0.55, perStageGap: 0.04, you: { hotblood: 0.12, demonking: 0.08, psycho: 0.1, coward: -0.15, poet: -0.05 } },
        stance: { default: -10 }, karma: -2,
        result: 'The elder crawls home with a broken jaw. Nobody at the Nine Bridges mocks you now.',
        failHealth: -15, failStance: { default: -12 }, failResult: 'The elder is stronger than he looked. You limp home to their laughter.' },
      { label: 'Demand an apology from {leader}', glyph: 'speech', vsMight: true, gain: { stonesPerTier: 15 },
        stance: { default: 12, arrogant: 4, coward: 20 },
        result: '{leader} sends a written apology and a purse. Your name is cleaner than before.',
        failStance: { default: -15, arrogant: -25 }, failResult: '{leader} tears up your letter in front of their disciples.' },
    ] },
  { id: 'refugee', short: 'Their runaway disciple', weight: 2, needs: { stance: [-100, 100] }, glyph: 'person',
    title: 'A refugee from the {sect}',
    text: 'A battered disciple of the {sect} kneels at your gate. They fled {leader}’s cruelty and beg you for shelter.',
    choices: [
      { label: 'Take them in', glyph: 'gate', disciples: 1, gain: { herbs: 3 }, karma: 3, stance: { default: -15, niceguy: -5, psycho: -25 },
        result: 'You shelter them. The {sect} counts it a theft.' },
      { label: 'Return them to their sect', glyph: 'back', karma: -4, stance: { default: 12, psycho: 20, niceguy: 0 },
        result: 'You send them back in chains. The {sect} is grateful. The disciple is never seen again.' },
      { label: 'Turn them away', glyph: 'close', karma: -1, result: 'You close the gate. They walk on down the mountain.' },
    ] },
  { id: 'splinter_lure', short: 'Their lure', weight: 5, needs: { stance: [-100, 0], founder: true, splinter: true }, glyph: 'split',
    title: 'The {sect} calls to your disciples',
    text: '{leader}, who left your sect in anger, sends word to your disciples: better pay, kinder masters, a hall of their own.',
    choices: [
      { label: 'Pay them to stay', glyph: 'stone', cost: { stonesPerDisciple: 6 }, stance: { default: 0 },
        result: 'A purse for every disciple. No one leaves this year.' },
      { label: 'Let the restless go', glyph: 'split', disciples: -2, stance: { default: 6 },
        result: 'Two of your disciples walk down the mountain to the {sect}.' },
      { label: 'Send back a threat', glyph: 'sword', vsMight: true, stance: { default: -10 }, setback: true,
        result: 'Your threat is heard. {leader}’s new banners burn in the night, and the {sect} loses a hall.',
        failDisciples: -1, failStance: { default: -12 }, failResult: '{leader} laughs. One more of your disciples slips away to them.' },
    ] },
  { id: 'alliance', short: 'Their alliance', weight: 2, needs: { stance: [40, 100] }, glyph: 'bond',
    title: 'The {sect} proposes an alliance',
    text: '{leader} of the {sect} offers a sworn alliance: their banners never raised against you, and yours never against them.',
    choices: [
      { label: 'Swear brotherhood', glyph: 'bond', sworn: true, stance: { default: 20 },
        result: 'You swear before Heaven. The {sect} will never march against you.' },
      { label: 'Ask for stones instead', glyph: 'stone', gain: { stonesPerTier: 50 }, stance: { default: -12, miser: -25, niceguy: -4 },
        result: 'They pay, a little coldly. Friendship has a price, it seems.' },
      { label: 'Decline politely', glyph: 'close', stance: { default: -5 }, result: 'You decline with fine words. The {sect} bows and goes.' },
    ] },
  // Phase 43f — a sect you razed rose again from its ashes, and its heir has not forgotten.
  { id: 'vengeance', short: 'The heir’s feud', weight: 6, needs: { remnant: true, founder: true }, glyph: 'el_fire',
    title: 'A letter from the ashes',
    text: '{leader}, heir of the sect you burned, writes in ash-black ink: the {sect} remembers its dead. Pay for them, face the heir, or wait for their banners.',
    choices: [
      { label: 'Pay a blood-price', glyph: 'stone', cost: { stonesPerTier: 80 }, clearGrudge: true, karma: 2, stance: { default: 40, arrogant: 25, miser: 50 },
        result: '{leader} takes the stones and burns your letter in front of the survivors. The feud is set down.' },
      { label: 'Face the heir alone', glyph: 'duel', clearGrudge: true,
        odds: { base: 0.5, perStageGap: 0.04, you: { hotblood: 0.1, demonking: 0.08, stoic: 0.06, coward: -0.15, lazy: -0.08 } },
        stance: { default: 20, hotblood: 30, arrogant: 10 },
        result: 'You meet {leader} on the old ashes and put them on their knees, then let them rise. They swear the feud is done.',
        failHealth: -20, failStance: { default: -10 }, failResult: '{leader} fights like grief made flesh. You leave the ashes bleeding, and the feud lives.' },
      { label: 'Scorn them', glyph: 'close', march: true, lockWar: true, karma: -1, stance: { default: -15 },
        result: 'Your scorn reaches the heir. The {sect}’s banners rise toward your mountain.' },
    ] },
  // Phase 43d — your own sect lost a hall (a war raid, a clash, a fire) and its blessing fell with it.
  { id: 'levy', short: 'The levy', weight: 8, needs: { mine: true, justLost: true }, glyph: 'hall',
    title: 'The {sect} calls a levy',
    text: 'The {hall} of the {sect} lies in ash, and the blessing on every disciple has thinned with it. {leader} calls on each disciple to rebuild: coin, or the labour of their own hands.',
    choices: [
      { label: 'Pay the levy', glyph: 'stone', cost: { stonesPerTier: 30 }, restore: true, contrib: { base: 10, perTier: 15 },
        stance: { default: 10, miser: 16, arrogant: 6 },
        result: 'Your stones buy timber and jade. The {hall} rises again, and the elders write your name in the levy book.' },
      { label: 'Lead the work crew yourself', glyph: 'rise', health: -6, restore: true, contrib: { base: 20, perTier: 30 },
        odds: { base: 0.6, perStageGap: 0.02, you: { stoic: 0.12, niceguy: 0.1, hotblood: 0.05, glutton: 0.04, lazy: -0.12, coward: -0.06, arrogant: -0.08 } },
        stance: { default: 14, grumpy: 20, hotblood: 18 },
        result: 'You haul beams beside the outer disciples until the {hall} stands again. Even {leader} comes down to watch.',
        failHealth: -12, failContrib: { base: 5, perTier: 8 }, failStance: { default: 4 },
        failResult: 'A beam slips and the half-built {hall} comes down on the crew. You dig them out, bleeding; the work must start again.' },
      { label: 'Refuse the levy', glyph: 'close', karma: -2, contrib: { base: -10, perTier: -20 },
        stance: { default: -12, arrogant: -20, niceguy: -6, miser: -18 },
        result: 'You give nothing. The {hall} stays in ash, and the elders strike a line through your name.' },
    ] },
  // Phase 43d — a richer sect that likes you sends for you. Your own sect will hear of whatever you do.
  { id: 'courted', short: 'Their offer', weight: 3, needs: { court: true, stance: [20, 100] }, glyph: 'scroll',
    title: 'The {sect} sends for you',
    text: 'A sealed letter from {leader} of the {sect}: their halls are richer than those of the {mine}, their blessing deeper. A place waits for you there, one rank below your own.',
    choices: [
      { label: 'Go over to the {sect}', glyph: 'gate', defect: true, lockWar: true, karma: -3, stance: { default: 15, arrogant: 10, niceguy: 20 },
        result: 'You bow out of the {mine} and walk down the mountain to the {sect}. Behind you, the word "turncoat" follows.' },
      { label: 'Show the letter to your own master', glyph: 'speech',
        odds: { base: 0.5, mineStanceDiv: 400, you: { paranoid: 0.15, arrogant: 0.06, gremlin: 0.05, niceguy: -0.1, hotblood: -0.08 } },
        contrib: { base: 40, perTier: 40 }, mineStance: { default: 4 },
        result: 'Your master reads the letter twice and pays to keep you. The {sect} never learns what its letter bought you.',
        failContrib: { base: 0, perTier: 0 }, failMineStance: { default: -12, arrogant: -18, paranoid: -16 }, failStance: { default: -10 },
        failResult: 'Your master sees the game for what it is. The {mine} cools toward you, and the {sect} hears it was used.' },
      { label: 'Refuse, and stay loyal', glyph: 'bond', karma: 1, contrib: { base: 10, perTier: 10 }, stance: { default: -4, arrogant: -8 },
        mineStance: { default: 12, grumpy: 16, paranoid: 16 },
        result: 'You send the letter back with its seal unbroken. Word reaches your own elders, and they are pleased.' },
    ] },
]

// Phase 43f: razing a sect (docs/systems/npc-sects.md → "43f"). Own-sect wars only. You vow it on the War panel
// (or a standing order does, for a war you never touched); a war WON under the vow burns the foe's mountain: the record
// dies, its treasury and (sometimes) a manual are yours, and the world reacts. User picks (2026-10-02): the world reacts
// + the remnant returns (no sack choice, no change to the war odds).
const SECT_RAZE = {
  spoilsPerLevel: 40, spoilsPerTier: 60, herbsPerLevel: 3,   // the burned treasury: + per hall level they had, + per tier
  manualChance: 0.6,                                           // a manual pulled from their library (SECT_RELATIONS.trade.offerWeights by tier)
  karma: -8, karmaProvoked: -3,                                // you declared it · they marched on you (or a remnant's feud)
  fame: 15,                                                    // sect fame per sect you have razed (ownSect.razed)
  // The world reacts: every living sect's stance moves by −(its master's morality, PERSONALITY_MORALITY) × perMorality —
  // righteous masters recoil, ruthless ones respect it — halved when the war was theirs. Capped ±cap.
  outrage: { perMorality: 0.3, provokedMult: 0.5, cap: 20 },
  // Dread: + the razed sect's tier; falls by decay a game year. While it lasts, a WEAKER sect picked to march on your
  // own sect may lose its nerve and turn back (chance = min(skipMax, dread × skipPer)). A remnant's grudge ignores it.
  dread: { decay: 0.5, skipPer: 0.08, skipMax: 0.6, max: 12 },
  // The remnant: some years after, survivors may raise the sect again (a joinable sect always returns — the world
  // keeps its five gates), as "Reborn …", with a grudge: hostile, grows faster, comes to war more often.
  remnant: { years: [3, 6], base: 0.35, perSurvivor: 1 / 60, provoked: -0.1, min: 0.2, max: 0.85, survivorFrac: 0.3,
             stance: -70, stanceJoinable: -50, growMult: 2, warWeight: 2, prefix: 'Reborn' },
  ashesMax: 8,
}

// Phase 43e: the sect master + taking the sect over (docs/systems/npc-sects.md → "43e"). The master is a world
// person minted when you join (lazily for old saves). Their regard for you IS the sect record's stance (43b) — what you
// did for the sect (missions, war calls, levies, loyalty when courted) moves it. A Grand Elder may challenge them with
// NO realm gate, or petition them to step down.
const SECT_MASTER = {
  stageBase: 10, stagePerTier: 3, stageJitter: [0, 2],   // stage = base + perTier × tier + jitter (never the last stage)
  // Their call on a fight to the death (%): base + temper (LETHAL_PERSONALITY_BONUS) + (pivot − regard) × weight when
  // regard is below the pivot + their cruelty (LETHAL_MORALITY_WEIGHT), clamped to LETHAL_CHANCE_RANGE.
  lethalBase: 20, regardPivot: 40, regardWeight: 0.5,
  challengeCooldownYears: [10, 20], petitionCooldownYears: [5, 10],
  lossRank: 3, lossStance: -15,                     // beaten and spared: demoted to Elder, regard falls
  // Petition: chance = base + perRegard × regard (only above 0) + mightWeight × your Might / (yours + theirs)
  petition: { base: 0.02, perRegard: 0.005, mightWeight: 0.4, min: 0.03, max: 0.85, failStance: -12 },
  // Service moves their regard
  regardMission: 1, regardAnswer: 3, regardIgnore: -5, regardRankUp: 2,
  // Taking it over: halls kept drop to Lv.1; the Sect Hall is Lv.1; this share of its seats stays at once
  takeover: { stayFrac: 0.6, oldGuard: [3, 6], oldGuardPeaceful: [1, 3], oldGuardLevel: 3,
              winOverStones: 30 /* × tier × each */, winOverKarma: 2, winOverLoyalty: 35,
              letGoStay: 0.5, purgeKarma: -8 },
  // An exiled master (spared in the fight) raises a splinter sect; their stance by how you left them
  exile: { debt: -10, grudge: -80, default: -50 },
}

// Phase 43h: sect relations — what YOU can do to another sect (docs/systems/npc-sects.md → "43h"). Every action is a
// player button on the sect's detail page; only the other sect's reply rolls (odds shown first). Each action has a
// per-sect cooldown in game years (r.acted[action] = the year it may be used again).
// who: 'leader' (you founded a sect) · 'member' (you belong to one) · 'any'. stance: their stance change; temper keys shade it.
const SECT_RELATIONS = {
  gift:     { who: 'any', glyph: 'gift', cooldown: 3, stonesPerTier: 20, stance: { default: 10, miser: 16, arrogant: 6, stoic: 7 } },
  alliance: { who: 'leader', glyph: 'bond', cooldown: 5, minStance: 40, odds: { base: 0.3, perStance: 0.01, temper: { stoic: 0.1, niceguy: 0.15, poet: 0.05, paranoid: -0.15, arrogant: -0.1, demonking: -0.1 } },
              stance: 15, failStance: -5 },
  breakAlliance: { who: 'leader', glyph: 'unbond', cooldown: 0, stance: -40, karma: -3, othersStance: -4 },
  war:      { who: 'leader', glyph: 'flag', cooldown: 6, stance: -25, unprovokedAbove: -20, unprovokedKarma: -3, othersStance: -3 },
  tribute:  { who: 'leader', glyph: 'crown', cooldown: 5, stonesPerTier: 60, stance: { default: -25, arrogant: -40, demonking: -40, coward: -10 },
              failStance: -30, failWarChance: 0.3 },
  spy:      { who: 'leader', glyph: 'eye', cooldown: 4, odds: { base: 0.45, perStageGap: 0.03, perArrayLevel: -0.08, you: { paranoid: 0.15, gremlin: 0.06, coward: -0.08, hotblood: -0.1 } },
              stonesPerTier: 40, manualChance: 0.5, karma: -2, failStance: -35, failHealth: -10, failWarChance: 0.5 },
  trade:    { who: 'leader', glyph: 'scroll', cooldown: 3, minStance: -20, stance: 5, gradeSlack: 1,
              offerWeights: [ { yellow: 70, profound: 30 }, { yellow: 30, profound: 60, earth: 10 }, { profound: 50, earth: 45, heaven: 5 },
                              { profound: 20, earth: 60, heaven: 20 }, { earth: 40, heaven: 60 } ] },   // by tier 1..5
  // poach: you pick ONE of their named disciples (r.roster, rolled once a year). Per disciple: cost = stonesPerTier × tier ×
  // (1 + talentCost × (talent − 1)); odds = base + (your Might − theirs)/mightDiv − (loyalty − 50)/loyaltyDiv + perTalent × (talent − 2).
  // A star is dearer, harder, and angers them more; a failure leaves that disciple more loyal (they reported you).
  poach:    { who: 'leader', glyph: 'disciple', cooldown: 4, stonesPerTier: 25, talentCost: 0.5,
              odds: { base: 0.6, mightDiv: 400, loyaltyDiv: 150, perTalent: -0.06 },
              stance: -20, stancePerTalent: -5, failStance: -10, failLoyalty: 10, roster: 6, level: [1, 4], loyalty: [30, 90] },
  spar:     { who: 'member', glyph: 'duel', cooldown: 2, contribPerTier: 20, stance: 3, loseHealthNote: true },
  urge:     { who: 'member', glyph: 'speech', cooldown: 5, odds: { base: 0.2, perRegard: 0.005, hated: 0.15, master: { hotblood: 0.15, arrogant: 0.12, demonking: 0.15, psycho: 0.1, niceguy: -0.12, stoic: -0.08, coward: -0.15 } },
              failRegard: -5, okRegard: 2 },
}
