// ARENA_* — the Arena (Phase 35 / A6-3b, docs/systems/combat.md → "A6-3b"): six rings by realm, their duelist bands,
// fees, prizes and titles, plus purse / streak / renown / call-out / gift tuning. Data only.
// Used by: renderer/engine/game-state.js (arenaInfo / startArenaBout / arenaWalkAway / _arenaBoutEnd / _tickArena),
// renderer/game/arena-view.js, renderer/game/combat.js, scripts/sim/*.

// band = the stages the roster's duelists hold; champ = the champion's stage. entry = the fee to start a run; prize = a
// won bout's base purse; champPrize = beating the champion; fame / contribution = what a win gives your sect.
const ARENA_RINGS = [
  { id: 'dust',   name: 'Dust Ring',        minStage: 0,  band: [0, 2],   champ: 3,  entry: 2,    prize: 4,    champPrize: 20,    fame: 2,  contribution: 2,
    title: 'Champion of the Dust Ring',   desc: 'A trampled circle behind the market, ringed by gamblers and bored porters. Anyone may step in.' },
  { id: 'iron',   name: 'Iron Bell Ring',   minStage: 3,  band: [3, 7],   champ: 9,  entry: 4,    prize: 8,    champPrize: 40,    fame: 4,  contribution: 4,
    title: 'Master of the Iron Bell',     desc: 'An iron bell hangs over the sand; it rings once for every fighter carried out.' },
  { id: 'jade',   name: 'Jade Terrace',     minStage: 10, band: [10, 11], champ: 12, entry: 8,    prize: 15,   champPrize: 75,    fame: 8,  contribution: 8,
    title: 'Lord of the Jade Terrace',    desc: 'Foundation cultivators duel on green stone while the sects watch from the eaves, taking notes.' },
  { id: 'golden', name: 'Golden Core Pit',  minStage: 13, band: [13, 14], champ: 15, entry: 15,   prize: 30,   champPrize: 150,   fame: 14, contribution: 14,
    title: 'Sovereign of the Golden Pit', desc: 'Sunk into a mountain, lit by the cores of those who fight in it.' },
  { id: 'lotus',  name: 'Soul Lotus Ring',  minStage: 16, band: [16, 17], champ: 18, entry: 30,   prize: 60,   champPrize: 300,   fame: 22, contribution: 22,
    title: 'Keeper of the Soul Lotus',    desc: 'A ring of floating lotus pads over still water. Nascent souls watch from the petals.' },
  { id: 'heaven', name: "Heaven's Ring",    minStage: 19, band: [19, 20], champ: 21, entry: 60,   prize: 120,  champPrize: 600,   fame: 35, contribution: 35,
    title: 'The One Beneath Heaven',      desc: 'Above the clouds, on a disc of white stone. Few have stood here twice.' },
]

const ARENA_ROSTER        = 4        // duelists per ring (plus the champion)
const ARENA_CHAMP_AFTER   = 3        // wins in this run before the champion answers you
const ARENA_MIN_HEALTH    = 30       // Health needed to start or continue a run
const ARENA_REST_SECONDS  = 1800     // after a run ends (walked away or lost), the Arena closes its gates to you for 30 minutes (real time)
const ARENA_STREAK_STEP   = 0.25     // each win in a row: +25% on the next purse…
const ARENA_STREAK_MAX    = 2.5      // …up to ×2.5
const ARENA_BLOOD_MULT    = 3        // a blood match (to the death) pays ×3
const ARENA_LOSS_KEEP     = 0.5      // losing ends the run; you keep this share of the purse
const ARENA_RENOWN        = { win: 1, blood: 3, champion: 5, humble: 1, declined: -5 }
const ARENA_RENOWN_PURSE  = 0.005    // each point of renown: +0.5% on every purse…
const ARENA_RENOWN_CAP    = 0.5      // …up to +50%
const ARENA_KILL_KARMA    = -3       // finishing a duelist in a blood match
const ARENA_CALLOUT_CHANCE = 0.08    // per game year: a grudge-holding duelist calls you out
const ARENA_CALLOUT_MULT  = 2        // a grudge match pays this × the ring's prize
const ARENA_CALLOUT_BLOOD = ['psycho', 'demonking', 'hotblood']   // tempers that demand blood when they call you out
const ARENA_GIFT_CHANCE   = 0.05     // per game year: a duelist who owes you sends a gift (and the debt is paid)
const ARENA_NO_BLOOD      = ['coward']                            // tempers that refuse a blood match
