// Clan succession after a death (clan-succession.md 2.6d): parenting styles, the heir bet, the reign sim, rebirth
// position weights, the rare rival-family rebirth, chronicle text and upbringing events. Also 2.6e: challenging
// the head, being challenged as head, and step-down mass tournaments — all resolved while you're still alive.
// Also 2.6f: branch wars (push/declare) and secession into a new clan. Also the bequest (2026-10-02): the combat arts
// and items a life passes down to the next, N of each on your Nth reincarnation. Data only.
// Used by: game-state.js (_beginInterlude/_runSuccession/_beginLife/resolveUpbringingEvent, challengeHead/
// resolveHeadChallenge/answerStepDown, pushBranchWar/declareBranchWar/secede), game.js, scripts/sim/*.
// Personality ids: personalities.js. Tokens in text: {head} (head's given name), {name} (you), {clan} (clan name).

// ── The reign (one generation passes between lives) ──────────────────────────
const REIGN_YEARS            = [40, 80]  // world years that pass between your death and your rebirth (you wake at AWAKENING_AGE)
const HEIR_CHILDREN          = { nurturing: [2, 4], strict: [2, 5], neglectful: [3, 7], ruthless: [4, 8] }   // the new head's children
const BRANCH_CHILDREN        = [1, 3]    // children a branch head has by the time you're reborn
const MAX_BRANCHES           = 3         // a clan has ≤ 1 main line + 3 branches
const BRANCH_NAMES           = ['Eastern Branch', 'Western Branch', 'Southern Branch', 'Northern Branch']
const NPC_YEARS_PER_STAGE    = 12        // coarse NPC growth during a reign (÷ root.mult), same pace as your children
const NPC_STAGE_CAP          = 21        // NPCs never ascend (matches SPOUSE_STAGE_CAP)
// User rule (2026-09-29): at the SAME root and stage, your Qi gain is this much higher than any NPC's. NPC growth (world
// persons, spouse, children) is capped at your bare pace at their stage (stage baseQps × their root, against the stage's
// qiCap, per game year) ÷ this — a better-rooted NPC can still outpace you; you can always upgrade your root.
const PLAYER_QI_EDGE         = 1.1
const WORLD_PRUNE_YEARS      = 400       // dead persons older than this drop out of the registry (heads/past lives kept)

// ── Bequest — what you carry into your next life (user 2026-10-02) ───────────
// Separate from the clan legacies and free every life: on your Nth reincarnation you may pass down one combat art and
// one item PER reincarnation you are on (your 1st rebirth carries 1 of each, your 3rd carries 3 of each). The player
// picks at the interlude (game-state toggleBequest); it is personal, so it works for an orphan rebirth too. Caps keep
// a deep lineage's picker sane (tune in 2.8).
const BEQUEST_ARTS_PER_REINCARNATION  = 1
const BEQUEST_ITEMS_PER_REINCARNATION = 1
const BEQUEST_MAX_ARTS  = 12
const BEQUEST_MAX_ITEMS = 12

// ── Who takes the head seat when nobody was named (the clan's own pick) ──────
// score = stage×100 (× SUCCESSION_BLOODY_STAGE_MULT if the clan's tradition is bloody) + root×10 + bond with the old
// head × SUCCESSION_BOND_WEIGHT; weight = exp((score − best) / SUCCESSION_SPREAD). You bet before the pick is rolled.
const SUCCESSION_BOND_WEIGHT = 2
const SUCCESSION_SPREAD      = 80
const SUCCESSION_BLOODY_STAGE_MULT = 1.3 // stage weighs more when the clan's lethal tournaments outnumber peaceful successions
const BET_MAX_CANDIDATES     = 8         // the bet shows the 8 best-scored candidates (score shown as stage/bond, not odds)
const CLAN_HISTORY_MAX       = 200       // clan.history lines kept (oldest dropped)

// ── Parenting styles (rolled for each new head — not copied from how you raised them) ─
const PARENTING_STYLES = {
  nurturing:  { name: 'Nurturing',  nameCN: '慈', blurb: 'Raises children with patience and warmth.',
                childBond: [55, 80], morality: 10, headBond: [60, 85], stipendMult: 1.2 },
  strict:     { name: 'Strict',     nameCN: '严', blurb: 'Discipline first, praise never.',
                childBond: [40, 60], morality: 0,  headBond: [40, 60], stipendMult: 1.0 },
  neglectful: { name: 'Neglectful', nameCN: '疏', blurb: 'Too busy cultivating to remember names.',
                childBond: [20, 40], morality: -5, headBond: [20, 40], stipendMult: 0.6 },
  ruthless:   { name: 'Ruthless',   nameCN: '狠', blurb: 'Children are blades to be tempered — or broken.',
                childBond: [10, 35], morality: -15, headBond: [10, 35], stipendMult: 0.8 },
}
// Style roll: every style starts at STYLE_BASE_WEIGHT, then
//   nurturing  += (bond with the old head − 50) × 0.8 + max(0, morality) × 0.3
//   neglectful += max(0, 50 − bond) × 0.5
//   ruthless   += max(0, −morality) × 0.4
//   + STYLE_PERSONALITY_BIAS[personality]
// Trauma (survived a lethal tournament): 50/50 "never again" (nurturing + TRAUMA_STYLE_SHIFT) or "the cycle
// continues" (ruthless + TRAUMA_STYLE_SHIFT, strict + half). A scarred heir can still become a loving parent.
const STYLE_BASE_WEIGHT  = 25
const TRAUMA_STYLE_SHIFT = 50
const STYLE_PERSONALITY_BIAS = {
  niceguy:   { nurturing: 30 },               poet:     { nurturing: 15, neglectful: 10 },
  stoic:     { strict: 25 },                  grumpy:   { strict: 25 },
  lazy:      { neglectful: 30 },              glutton:  { nurturing: 10, neglectful: 10 },
  gremlin:   { neglectful: 15, nurturing: 5 },coward:   { strict: 10, neglectful: 10 },
  miser:     { strict: 20 },                  hotblood: { strict: 15, nurturing: 10 },
  arrogant:  { strict: 20, ruthless: 10 },    paranoid: { strict: 20, ruthless: 10 },
  demonking: { ruthless: 30 },                psycho:   { ruthless: 40 },
}
const TRAUMA_PATH_TEXT = {
  never_again: 'Scarred by the Tournament of Heirs, {head} swore no child of theirs would ever bleed for a seat.',
  cycle:       'The Tournament of Heirs never left {head}. What was done to them, they did in turn.',
}

// ── Sect fortunes during the reign (only if the clan holds a founded sect: clan.sect) ─
// Weights per style: grow (Hall +1) / hold / decline (Hall −1, a disciple leaves) / lost (sect taken by a rival).
const SECT_FORTUNE = {
  nurturing:  { grow: 45, hold: 45, decline: 10, lost: 0 },
  strict:     { grow: 40, hold: 45, decline: 15, lost: 0 },
  neglectful: { grow: 10, hold: 40, decline: 35, lost: 15 },
  ruthless:   { grow: 35, hold: 25, decline: 20, lost: 20 },
}
// Clan stipend at rebirth: STIPEND_BASE × sect Hall level × style.stipendMult × position multiplier (0 if no sect).
const STIPEND_BASE = 60
const STIPEND_POSITION_MULT = { eldest: 1.0, younger: 0.5, branch: 0.25, rival: 0.5, orphan: 0 }

// ── Rebirth position (you don't remember; nobody knows) ──────────────────────
// Base weights, then × bet modifiers, × the head's style row. A position with no seat (no branches) gets 0.
const POSITION_BASE     = { eldest: 20, younger: 50, branch: 30 }
const POSITION_BET_WON  = { eldest: 2.0, younger: 1.3, branch: 0.5 }
const POSITION_BET_LOST = { eldest: 0.4, younger: 0.8, branch: 2.5 }
const POSITION_STYLE    = {
  nurturing:  { eldest: 1.2, younger: 1.0, branch: 0.9 },
  strict:     { eldest: 1.0, younger: 1.0, branch: 1.0 },
  neglectful: { eldest: 0.8, younger: 1.2, branch: 1.0 },
  ruthless:   { eldest: 0.8, younger: 0.9, branch: 1.4 },
}
const POSITION_TEXT = {
  eldest:  { name: 'Eldest of the Main Line', short: 'eldest · heir apparent', headBondBonus: 10 },
  younger: { name: 'A Younger Child of the Main Line', short: 'younger child', headBondBonus: 0 },
  branch:  { name: 'A Child of the {line}', short: 'branch child', headBondBonus: -10 },
  rival:   { name: 'A Child of a Rival House', short: 'rival blood', headBondBonus: 0 },
  orphan:  { name: 'An Orphan of the World', short: 'orphan', headBondBonus: 0 },
}
// Very rarely (user, 2026-09-26) the wheel of rebirth drops you into the family of someone who wronged you — an
// enemy recorded this life or earlier (world.enemies: a spouse you dueled, a sect you warred with). Only rolled
// when an enemy is known and you chose a clan birth. Phase 28K later makes this your named rival's line.
const RIVAL_REBIRTH_CHANCE = 0.02
const RIVAL_CLAN_RELATION  = -60
const ENEMIES_MAX          = 20

// ── Chronicle (shown between lives, saved to clan.history) ───────────────────
const CHRONICLE_ACCESSION = {
  chosen:     'Year {year}: {head}, named heir by the one who came before, takes the head seat of the {clan} clan.',
  tournament: 'Year {year}: {head}, who walked out of the Tournament of Heirs alone, takes the head seat of the {clan} clan.',
  clan:       'Year {year}: the elders of the {clan} clan raise {head} to the head seat.',
  regency:    'Year {year}: {head} is still a child. The elders rule in their name until they come of age.',
  continued:  'Year {year}: {head} keeps the head seat of the {clan} clan.',
}
const CHRONICLE_STYLE = {
  nurturing:  'The courtyards fill with children’s laughter. {head} rules gently, and raises their children the same way.',
  strict:     '{head} runs the clan like a training ground — dawn drills, silent meals, no excuses.',
  neglectful: '{head} vanishes into seclusion for decades at a time. The children raise themselves.',
  ruthless:   '{head} rules by fear. The weak are sent away; the strong learn to watch their backs.',
}
const CHRONICLE_SECT = {
  grow:    'The {sect} flourishes under {head}. A new hall rises on the mountain.',
  hold:    'The {sect} holds steady — no glory, no ruin.',
  decline: 'The {sect} dwindles. Disciples drift away; a hall falls silent.',
  lost:    'The {sect} is lost — the {enemy} take the mountain gate, and the clan’s banner comes down.',
}
const CHRONICLE_EVENTS = {
  nurturing:  ['In a famine year, {head} opens the clan granaries to the valley.', 'A wandering sword saint stays a season, charmed by the clan’s hospitality.'],
  strict:     ['A disciple who failed a trial three times is sent home in disgrace.', 'The clan’s young win every seat at the regional contest. No one smiles.'],
  neglectful: ['A cousin forges the head’s seal for years before anyone notices.', 'Two branches quarrel over an orchard; the head never answers their letters.'],
  ruthless:   ['A cousin who questioned the head is exiled beyond the northern pass.', 'A rival family that insulted the clan is never heard from again.'],
}
const CHRONICLE_EXTINCT = 'Year {year}: no one is left to take the head seat. The {clan} clan’s hall stands empty, and the name passes into history.'
const CHRONICLE_ORPHAN_DEATH = 'Year {year}: no clan mourns you. The wind takes your ashes wherever it likes.'
const CHRONICLE_BIRTH = {
  eldest:  'Year {year}: the eldest child of {head} awakens their spiritual root.',
  younger: 'Year {year}: a younger child of {head} awakens their spiritual root.',
  branch:  'Year {year}: in the {line}, a child awakens their spiritual root.',
  rival:   'Year {year}: in the house of the {clan}, a child awakens their spiritual root — the house of {enemy}, whom you once knew too well. No one knows. You don’t remember.',
  orphan:  'Year {year}: somewhere on the road, a child with no name and no clan awakens their spiritual root.',
}

// ── Clan politics in a life (2.6e): challenge the head, be challenged as head, step-down tournaments ──
// You may challenge the sitting head (or they may be challenged by an NPC while you hold the seat) only
// within CHALLENGE_STAGE_GAP stages of each other — no ambushing a much weaker or stronger head.
// A game year passes fast here (GAME_YEARS_PER_OPEN_HOUR, lifespan.js) — these are rare, once-a-generation
// dramatic beats, not a recurring minigame, so both the check interval AND a flat chance gate it.
const CHALLENGE_STAGE_GAP        = 3
const CHALLENGE_COOLDOWN_YEARS   = [15, 30]   // after a non-lethal loss, before you may challenge again
const CHALLENGE_BOND_LOSS        = 20         // your bond with the head, on a non-lethal loss
const CHALLENGE_KARMA_DEATH      = -5         // karma cost to the one who did the killing
const CHALLENGER_EVENT_YEARS     = [50, 100]  // while you hold the seat, how often the game even checks for a threat
const CHALLENGER_EVENT_CHANCE    = 0.25       // odds a real challenger actually shows up when it does check
const CHALLENGER_STAGE_GAP_MAX   = 4          // only a plausible threat calls you out
const STEPDOWN_CHECK_YEARS       = [50, 100]  // while an NPC leads (not you), how often they might consider it
const STEPDOWN_CHANCE            = { nurturing: 0.04, strict: 0.07, neglectful: 0.14, ruthless: 0.03 }
const STEPDOWN_REIGN_YEARS_MULT  = 0.0015     // + this × years already reigned, per check (older heads tire)

// The sitting head's own decision when lethality is theirs to call — deciding on a challenge against them, or
// setting the policy for a whole step-down tournament: style + how badly they're regarded (the lower the bond,
// the harsher) + morality + personality + whether the clan's own tradition already runs bloody (reuses the
// same "bloody" test succession scoring already uses). Rolled as a straight percent, clamped so it's never sure.
const LETHAL_BASE_WEIGHT       = { nurturing: 8, strict: 20, neglectful: 15, ruthless: 45 }
const LETHAL_BOND_WEIGHT       = 0.5    // + max(0, 50 − bond) × this
const LETHAL_MORALITY_WEIGHT   = 0.4    // + max(0, −morality) × this
const LETHAL_BLOODY_BONUS      = 15     // + this if the clan's tradition already runs bloody
const LETHAL_PERSONALITY_BONUS = { psycho: 25, demonking: 20, hotblood: 10, arrogant: 10, niceguy: -15, poet: -10, coward: -10 }
const LETHAL_CHANCE_RANGE      = [5, 90]

// ── Branch wars & secession (2.6f) ────────────────────────────────────────────
// Only the living player ever starts these — pushing your branch head to war, declaring war as a branch head,
// or seceding outright. No NPC branch acts on its own here (that's M4's living-world job); the player's own
// line is always the one in motion. War strength = sum of _fightPower over a line's living adults (you
// included); an uninvolved third branch may pick a side and lend a fraction of its own strength.
const BRANCH_WAR_COOLDOWN_YEARS     = [30, 60]  // after any attempt (won, lost, or a head who refused your push)
const BRANCH_WAR_WILL_BASE          = { niceguy: 5, poet: 8, coward: 3, stoic: 18, grumpy: 22, lazy: 10, glutton: 12,
                                         gremlin: 16, miser: 14, hotblood: 42, arrogant: 36, paranoid: 24, demonking: 46, psycho: 50 }
const BRANCH_WAR_WILL_STRENGTH_MULT = 40   // + this × clamp(attacker/defender power − 1, −1, 1) — braver when the numbers favor them
const BRANCH_WAR_WILL_BLOODY_BONUS  = 12   // + this if the clan's own tradition already runs bloody
const BRANCH_WAR_WILL_RANGE         = [5, 85]
const BRANCH_WAR_SPREAD             = 260  // aggregate-line-power spread for the win-odds logistic (wider than a 1v1 fight's TOURNAMENT_SPREAD)
const BRANCH_WAR_ALLY_LINE_SHARE    = 0.5  // an uninvolved branch that picks a side lends this fraction of its own strength
const BRANCH_WAR_DEATH_CHANCE       = 0.35 // the losing side's head: deposed (survives) unless this roll hits
const BRANCH_WAR_DEATH_BLOODY_BONUS = 0.25
const BRANCH_WAR_KARMA_DEATH        = -5

// Secession (branch head only, no fight): the old clan becomes a rival or ally depending on how warm you were
// with the head you left and your own morality — a cold, ruthless exit reads very differently from a fond one.
const SECESSION_RELATION_BASE          = 10    // a little goodwill even on an otherwise flat parting
const SECESSION_RELATION_BOND_MULT     = 0.9   // + (bond with the head you're leaving − 50) × this
const SECESSION_RELATION_MORALITY_MULT = 0.3   // + your own morality × this

// ── Upbringing (your first years in the new life; one event from the head's style) ─
// Same shape as CHILD_EVENTS, but `bond` is keyed by YOUR personality and moves your bond with the head
// (s.birth.headBond). `effect` uses the shared family effects (karma, qiFrac, health, integrity, items).
const UPBRINGING_DELAY_YEARS = [1, 4]
const UPBRINGING_EVENTS = {
  nurturing: [
    { id: 'up_lantern', title: 'The Lantern Festival', text: '{head} takes the children to the lantern festival and lets you choose the first lantern.',
      choices: [
        { label: 'Wish for the clan', effect: { karma: 3 }, result: '{head} squeezes your shoulder.', bond: { default: 10, niceguy: 14, poet: 12, psycho: 2 } },
        { label: 'Wish to surpass {head}', result: '{head} laughs — and does not forget.', bond: { default: 6, arrogant: 12, hotblood: 12, demonking: 10, coward: 0 } },
        { label: 'Sneak off to cultivate', effect: { qiFrac: 0.15 }, result: 'You meditate alone under the lanterns.', bond: { default: -6, stoic: 0, lazy: -2 } },
      ] },
    { id: 'up_fever', title: 'A Fever', text: 'You fall ill with a spirit fever. {head} sits by your bed for three nights.',
      choices: [
        { label: 'Thank them', effect: { health: 10 }, result: 'You will remember those three nights.', bond: { default: 12, niceguy: 16, poet: 16, grumpy: 6 } },
        { label: 'Send them away — you are fine', effect: { integrity: 5 }, result: 'Proud, and alone, and fine.', bond: { default: -4, arrogant: 4, stoic: 2 } },
      ] },
  ],
  strict: [
    { id: 'up_drill', title: 'The Dawn Drill', text: '{head} makes the children hold horse stance from dawn to noon. You are the last one standing — or nearly.',
      choices: [
        { label: 'Hold until you collapse', effect: { health: -8, integrity: 8 }, result: '{head} nods once. From {head}, that is a speech.', bond: { default: 10, hotblood: 14, stoic: 12, lazy: -2 } },
        { label: 'Fake a faint', effect: { karma: -2 }, result: 'Nobody is fooled. Everyone is punished.', bond: { default: -8, coward: 2, gremlin: 4, lazy: 4 } },
      ] },
    { id: 'up_exam', title: 'The Clan Examination', text: '{head} examines every child on the clan scriptures. You forgot to study.',
      choices: [
        { label: 'Confess', effect: { karma: 3 }, result: 'Twenty strokes, and a strange respect.', bond: { default: 6, niceguy: 10, stoic: 8, arrogant: -6 } },
        { label: 'Bluff through it', effect: { qiFrac: 0.1 }, result: 'You pass. {head} knows. {head} says nothing.', bond: { default: -4, paranoid: 4, gremlin: 6, demonking: 4 } },
        { label: 'Copy a cousin', effect: { karma: -4 }, result: 'The cousin is punished instead. You keep quiet.', bond: { default: -2, psycho: 6, miser: 4, niceguy: -12 } },
      ] },
  ],
  neglectful: [
    { id: 'up_birthday', title: 'A Forgotten Birthday', text: 'It is your birthday. {head} is in seclusion again. A servant brings you a steamed bun.',
      choices: [
        { label: 'Eat the bun and train', effect: { qiFrac: 0.15 }, result: 'You do not need anyone. You tell yourself that.', bond: { default: -6, stoic: -2, lazy: -2 } },
        { label: 'Knock on the seclusion door', effect: { health: -3 }, result: 'The door opens a crack. {head} looks at you like a stranger — then remembers.', bond: { default: 8, niceguy: 10, hotblood: 10, coward: 2 } },
        { label: 'Share the bun with the servant', effect: { karma: 4 }, result: 'The servant weeps. You have a friend in the kitchens now.', bond: { default: 0, niceguy: 4, glutton: -2 } },
      ] },
    { id: 'up_library', title: 'The Locked Library', text: 'Nobody is watching. The head’s private library is unlocked.',
      choices: [
        { label: 'Read everything', effect: { qiFrac: 0.2, karma: -2 }, result: 'You learn more in a month than in the last year.', bond: { default: -2, paranoid: 2, gremlin: 4 } },
        { label: 'Leave it', effect: { karma: 2 }, result: 'Some doors are better left closed.', bond: { default: 2, coward: 4, stoic: 2 } },
      ] },
  ],
  ruthless: [
    { id: 'up_spar', title: 'Blood in the Courtyard', text: '{head} makes the children spar with live blades. Your cousin is on the ground, begging.',
      choices: [
        { label: 'Spare them', effect: { karma: 5 }, result: '{head} calls you soft in front of everyone.', bond: { default: -10, niceguy: -4, psycho: -14, demonking: -12 } },
        { label: 'Finish it as {head} wants', effect: { karma: -8, integrity: 5 }, result: '{head} smiles for the first time you can remember.', bond: { default: 10, psycho: 16, demonking: 14, arrogant: 10, niceguy: -10, poet: -8 } },
        { label: 'Throw down your blade', effect: { health: -10 }, result: '{head} strikes you instead. You do not fall.', bond: { default: -4, hotblood: 4, stoic: 2 } },
      ] },
    { id: 'up_trial', title: 'The Winter Trial', text: '{head} leaves the children on a frozen peak with one cloak between three of you.',
      choices: [
        { label: 'Share the cloak', effect: { health: -8, karma: 4 }, result: 'All three of you come down alive. {head} looks disappointed.', bond: { default: -4, niceguy: 4 } },
        { label: 'Take the cloak', effect: { karma: -6 }, result: 'You come down first. You do not look back.', bond: { default: 8, psycho: 12, demonking: 10, paranoid: 8, niceguy: -14 } },
      ] },
  ],
}
