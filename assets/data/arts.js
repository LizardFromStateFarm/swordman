// ARTS — the combat-arts library (Phase 42, task 1.12; spec + as-built docs/systems/arts.md) + rarity, elements,
// passive slots, study, drop and breakthrough-offer tuning. Data only.
// Used by: game-state.js (s.arts: study, loadout, offers, drops; manuals registered as ITEMS 'manual_<id>'),
// renderer/game/arts-view.js (Path → Arts), game.js (Pack Study), attention.js, scripts/sim (loader).
//
// kind: 'move' (one of your 4 battle moves) | 'passive' (a realm-limited slot) | 'utility' (non-combat, 23E, later).
// move: { type, power, cost, hits?, priority?, status?: { id, chance, turns }, self?: {...}, drain?, ward?, charge?, finisher? }
//   type: strike · multi · charge (lands next turn, big) · ward (cuts the next hit) · counter · buff · hex · heal · drain · finisher
//   power ≈ damage before Might/Ward/element; cost = combat Qi (pool 100, +15 a turn — tuned in 1.13). No cooldowns.
// passive: { stat, value } — stat: might · ward · swift · qiPool · qiRegen · crit · element (value = +frac to that element's
//   moves; uses art.element) · statusResist · lifesteal · parry (parry window ×) · heal (Health back after a won fight)
// sig: 'beast:<typeId>' | 'arena:<ringId>' — a signature art: only from that source, never offered or dropped elsewhere.
// starter: true — the Yellow move a new cultivator of that root element starts with.
// Balance targets live in arts.md; the move engine that reads these numbers is task 1.13 (beasts) + 1.14a (people:
// PERSON_* at the bottom).

const ART_ELEMENTS = {
  metal:   { name: 'Metal',   icon: 'el_metal',   color: '--el-metal',   status: 'bleed' },
  wood:    { name: 'Wood',    icon: 'el_wood',    color: '--el-wood',    status: 'entangle' },
  water:   { name: 'Water',   icon: 'el_water',   color: '--el-water',   status: 'chill' },
  fire:    { name: 'Fire',    icon: 'el_fire',    color: '--el-fire',    status: 'burn' },
  earth:   { name: 'Earth',   icon: 'el_earth',   color: '--el-earth',   status: 'daze' },
  neutral: { name: 'Neutral', icon: 'el_neutral', color: '--el-neutral', status: null },
}
// The overcoming cycle (五行相克): each element overcomes the next (×1.5), and is overcome by the one before it (×0.67).
const ELEMENT_OVERCOMES = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' }

const ART_STATUS = {
  bleed:      { name: 'Bleed',        desc: 'Loses Health every turn.' },
  entangle:   { name: 'Entangled',    desc: 'Every move costs more Qi.' },
  chill:      { name: 'Chilled',      desc: 'Acts last, whatever its speed.' },
  burn:       { name: 'Burning',      desc: 'Loses Health every turn; stacks.' },
  daze:       { name: 'Dazed',        desc: 'May lose its turn.' },
  seal:       { name: 'Sealed',       desc: 'One of its moves cannot be used.' },
  guardbreak: { name: 'Guard Broken', desc: 'Takes more damage.' },
}

// Grades, lowest to highest (黄 玄 地 天 + one above). studySeconds: user pick 2026-09-29 (Yellow 1 min → Immortal 2 h).
const ART_RARITY_ORDER = ['yellow', 'profound', 'earth', 'heaven', 'immortal']
const ART_RARITY = {
  yellow:   { name: 'Yellow',   color: '--r-yellow',   studySeconds: 60,   sellValue: 3 },
  profound: { name: 'Profound', color: '--r-profound', studySeconds: 300,  sellValue: 10 },
  earth:    { name: 'Earth',    color: '--r-earth',    studySeconds: 1200, sellValue: 30 },
  heaven:   { name: 'Heaven',   color: '--r-heaven',   studySeconds: 3600, sellValue: 80 },
  immortal: { name: 'Immortal', color: '--r-immortal', studySeconds: 7200, sellValue: 200 },
}

const ART_MOVE_SLOTS = 4
// 4 saved loadouts you set freely and switch between (user 2026-10-01): each deck is its own 4 moves + passive slots.
const ART_LOADOUT_COUNT = 4
// Passive slots by realm (the stageIndex a realm starts at → slots). Mortal/QC 1 · Foundation 2 · Core 3 · Nascent 4 · Severing 5.
const ART_PASSIVE_SLOTS = [{ stage: 0, slots: 1 }, { stage: 10, slots: 2 }, { stage: 13, slots: 3 }, { stage: 16, slots: 4 }, { stage: 19, slots: 5 }]
const ART_PASSIVE_SLOTS_MAX = 5

// Study: one manual at a time; Comprehension (s.comprehension, raised by Heavenly Insight events) shortens it.
const ART_STUDY_COMPREHENSION = 0.05   // time ÷ (1 + 0.05 × comprehension)
const ART_STUDY_MIN_FRAC      = 0.5    // …never below half
// 1.14b (user 2026-09-30): the higher your realm, the more manuals you can study at once — study desks by realm
// (the user's pick, the slower curve): Mortal / Qi Condensation 1 · Foundation / Core 2 · Nascent Soul and up 3.
const ART_STUDY_SLOTS = [{ stage: 0, slots: 1 }, { stage: 10, slots: 2 }, { stage: 16, slots: 3 }]
const ART_STUDY_SLOTS_MAX = 3
// Mastery 1–5: a duplicate manual studied = +1 level now; battle use adds xp (1.13). Each level past 1: +power, −cost.
const ART_MASTERY_MAX       = 5
const ART_MASTERY_XP        = [0, 0, 20, 50, 100, 180]   // xp to reach level n (index = level)
const ART_MASTERY_POWER     = 0.08   // +8% power per level past 1
const ART_MASTERY_COST      = 1      // −1 Qi cost per level past 1 (never below 0)

// Basics every cultivator knows (never dropped, can't be sold since there is no manual).
const ART_BASICS = ['palm_strike', 'qi_shield']
// Fixed "fundamentals" at a layer (stageIndex → art), learned outright with a log line.
const ART_STAGE_GRANTS = { 4: 'drifting_step_palm', 7: 'rising_qi_kick' }

// Breakthrough insight: the first layer of each new realm offers 3 arts, you keep one (the choice waits; never expires).
// Rarity weights by the realm you enter. One option is of your root's element when the pool has one.
const ART_OFFER_COUNT = 3
const ART_OFFER_WEIGHTS = {
  'Qi Condensation':     { yellow: 80, profound: 20 },
  'Foundation Building': { yellow: 35, profound: 50, earth: 15 },
  'Core Formation':      { profound: 40, earth: 45, heaven: 15 },
  'Nascent Soul':        { earth: 55, heaven: 45 },
  'Spirit Severing':     { earth: 30, heaven: 70 },
}

// Drops. Expedition: a manual with this chance per run (+ per enemy tier); rarity by the location's tier.
const ART_EXPEDITION_DROP      = 0.02
const ART_EXPEDITION_DROP_TIER = 0.01
const ART_DROP_WEIGHTS_BY_TIER = {
  1: { yellow: 90, profound: 10 }, 2: { yellow: 70, profound: 28, earth: 2 }, 3: { yellow: 45, profound: 45, earth: 10 },
  4: { profound: 50, earth: 42, heaven: 8 }, 5: { profound: 25, earth: 55, heaven: 20 }, 6: { earth: 55, heaven: 45 },
}
// Slaying a beast (Finish): a chance at its signature art (by tier), else a small chance at a manual of its element.
const ART_BEAST_SIG_CHANCE = { common: 0.06, uncommon: 0.08, rare: 0.10, epic: 0.12, legendary: 0.25 }
const ART_BEAST_ELEMENT_DROP = 0.05
const BEAST_ELEMENT = {
  spirit_fox: 'fire', blood_python: 'wood', thunder_eagle: 'metal', spectral_bear: 'earth', white_tiger: 'metal',
  qilin: 'fire', void_hound: 'water', black_tortoise: 'water', azure_dragon: 'wood', golden_dragon: 'metal',
}
// Arena: winning a ring's title for the first time hands you its champion's signature art; any win may drop a manual.
const ART_ARENA_BOUT_DROP = 0.06
const ART_ARENA_RING_WEIGHTS = {
  dust: { yellow: 90, profound: 10 }, iron: { yellow: 60, profound: 40 }, jade: { profound: 60, earth: 40 },
  golden: { profound: 30, earth: 60, heaven: 10 }, lotus: { earth: 60, heaven: 40 }, heaven: { earth: 30, heaven: 70 },
}

const A = (id, name, nameCN, element, rarity, minStage, kind, body, lore, extra = {}) =>
  ({ id, name, nameCN, element, rarity, minStage, kind, ...(kind === 'move' ? { move: body } : { passive: body }), lore, ...extra })

const ARTS_LIST = [
  // ── Neutral: the fundamentals + oddities ────────────────────────────────────────────────────────────────────
  A('palm_strike', 'Palm Strike', '掌击', 'neutral', 'yellow', 0, 'move', { type: 'strike', power: 20, cost: 0, desc: 'A plain palm. Costs nothing, so you are never without a move.' },
    'The first thing any master teaches, and the last thing a dying man forgets.'),
  A('qi_shield', 'Qi Shield', '护体气', 'neutral', 'yellow', 0, 'move', { type: 'ward', power: 0, cost: 10, ward: 0.5, desc: 'Halves the next hit you take this turn.' },
    'A skin of breath held tight around the body.'),
  A('drifting_step_palm', 'Drifting Step Palm', '游步掌', 'neutral', 'yellow', 1, 'move', { type: 'strike', power: 30, cost: 8, priority: 1, desc: 'Steps in first and strikes before the enemy moves.' },
    'Taught to every Qi Condensation disciple who has learned to stop falling over.'),
  A('rising_qi_kick', 'Rising Qi Kick', '升气腿', 'neutral', 'yellow', 1, 'move', { type: 'strike', power: 38, cost: 14, desc: 'A kick carried upward on a burst of Qi.' },
    'The legs are three times stronger than the arms. Most cultivators forget this.'),
  A('echoing_fist', 'Echoing Fist', '回响拳', 'neutral', 'yellow', 2, 'move', { type: 'multi', power: 14, hits: 3, cost: 18, desc: 'Three quick blows; each can be parried on its own.' },
    'Strike once and let the Qi strike twice more on its way out.'),
  A('mind_piercing_shout', 'Mind-Piercing Shout', '破神喝', 'neutral', 'profound', 5, 'move', { type: 'hex', power: 0, cost: 20, status: { id: 'seal', chance: 0.7, turns: 2 }, desc: 'A shout that locks away one of the enemy\'s moves.' },
    'A roar that reaches past the ears and closes a door in the mind.'),
  A('void_step', 'Void Step', '虚空步', 'neutral', 'profound', 8, 'move', { type: 'counter', power: 30, cost: 22, priority: 2, desc: 'Vanishes before the enemy\'s blow and strikes from behind if they attacked.' },
    'For a breath you are not there. Then you are behind them.'),
  A('sutra_of_stillness', 'Sutra of Stillness', '静心经', 'neutral', 'profound', 6, 'move', { type: 'heal', power: 0, cost: 30, heal: 14, desc: 'Restores Health and clears one of your ailments.' },
    'Recited in a single breath, it smooths the torn channels.'),
  A('shattering_palm_seal', 'Shattering Palm Seal', '碎印掌', 'neutral', 'earth', 11, 'move', { type: 'strike', power: 62, cost: 32, status: { id: 'guardbreak', chance: 0.5, turns: 2 }, desc: 'A seal-stamped palm that can crack the enemy\'s guard.' },
    'The seal is carved into the palm itself, one character for every year of practice.'),
  A('heart_of_the_blade', 'Heart of the Blade', '剑心', 'neutral', 'yellow', 2, 'passive', { stat: 'crit', value: 0.05, desc: '+5% critical chance.' },
    'Before the sword is drawn, it has already found the gap.'),
  A('unmoving_mind', 'Unmoving Mind', '不动心', 'neutral', 'profound', 9, 'passive', { stat: 'parry', value: 1.25, desc: 'Your parry window is 25% wider.' },
    'Fear narrows the moment. A still mind keeps it wide.'),
  A('myriad_forms_insight', 'Myriad Forms Insight', '万象悟', 'neutral', 'heaven', 15, 'passive', { stat: 'qiRegen', value: 6, desc: '+6 combat Qi every turn.' },
    'All arts are one art. The one who sees it breathes easier in every fight.'),
  A('golden_dragon_divine_fist', 'Golden Dragon Divine Fist', '金龙神拳', 'neutral', 'immortal', 19, 'move', { type: 'strike', power: 140, cost: 60, status: { id: 'daze', chance: 0.4, turns: 1 }, desc: 'A fist that carries the roar of a true dragon.' },
    'Torn from the heart of the Golden Dragon. It still remembers the sky.', { sig: 'beast:golden_dragon' }),
  A('heaven_severing_intent', 'Heaven-Severing Sword Intent', '断天剑意', 'neutral', 'immortal', 19, 'move', { type: 'finisher', power: 110, cost: 55, finisher: 1.0, desc: 'Doubles its power against a foe below a third of their Health.' },
    'The One Beneath Heaven kept it for the one who would one day beat them.', { sig: 'arena:heaven' }),

  // ── Metal: burst, crits, armour break · Bleed ───────────────────────────────────────────────────────────────
  A('autumn_blade_qi', 'Autumn Blade Qi', '秋刃气', 'metal', 'yellow', 0, 'move', { type: 'strike', power: 36, cost: 14, status: { id: 'bleed', chance: 0.25, turns: 2 }, desc: 'A thin arc of cutting Qi that may open a bleeding wound.' },
    'Cold as the first frost on a blade.', { starter: true }),
  A('iron_needle_rain', 'Iron Needle Rain', '铁针雨', 'metal', 'yellow', 2, 'move', { type: 'multi', power: 12, hits: 4, cost: 20, desc: 'Four needles of hardened Qi; parry each or eat each.' },
    'A beggar\'s trick, until a cultivator does it with Qi.'),
  A('edge_seeking_thrust', 'Edge-Seeking Thrust', '寻隙刺', 'metal', 'yellow', 3, 'move', { type: 'strike', power: 44, cost: 18, crit: 0.15, desc: 'A precise thrust with a high critical chance.' },
    'Every guard has a gap the width of a hair.'),
  A('armour_rending_slash', 'Armour-Rending Slash', '裂甲斩', 'metal', 'profound', 6, 'move', { type: 'strike', power: 48, cost: 24, status: { id: 'guardbreak', chance: 0.6, turns: 2 }, desc: 'Splits the enemy\'s guard open for a few turns.' },
    'Made for the scaled hides of the Demon Marsh.'),
  A('thunder_talon_strike', 'Thunder Talon Strike', '雷爪击', 'metal', 'profound', 6, 'move', { type: 'strike', power: 52, cost: 22, priority: 1, desc: 'A diving strike that lands first, like the eagle\'s stoop.' },
    'Learned by watching a Thunder Eagle fall from a clear sky onto its prey.', { sig: 'beast:thunder_eagle' }),
  A('white_tiger_rending_claw', 'White Tiger Rending Claw', '白虎裂爪', 'metal', 'earth', 13, 'move', { type: 'multi', power: 26, hits: 3, cost: 34, status: { id: 'bleed', chance: 0.35, turns: 3 }, desc: 'Three raking claws of white Qi; each may leave a bleeding wound.' },
    'The White Tiger guards the west. Its claws are the autumn wind given teeth.', { sig: 'beast:white_tiger' }),
  A('severing_crescent', 'Severing Crescent', '断月弧', 'metal', 'earth', 11, 'move', { type: 'strike', power: 72, cost: 36, status: { id: 'bleed', chance: 0.4, turns: 3 }, desc: 'A crescent of blade-light that cuts deep.' },
    'A moon-shaped cut that keeps opening after the blade has passed.'),
  A('ten_thousand_swords_rain', 'Ten Thousand Swords Rain', '万剑雨', 'metal', 'heaven', 15, 'move', { type: 'multi', power: 22, hits: 5, cost: 50, desc: 'Five falling swords of Qi. Parry them all and you are a master.' },
    'The sky fills with blades, and every one of them knows your name.'),
  A('unbreakable_edge', 'Unbreakable Edge', '不折锋', 'metal', 'yellow', 1, 'passive', { stat: 'crit', value: 0.06, desc: '+6% critical chance.' },
    'A blade that does not bend does not miss its mark.'),
  A('metal_bone_tempering', 'Metal-Bone Tempering', '金骨淬', 'metal', 'profound', 7, 'passive', { stat: 'might', value: 0.08, desc: '+8% Might.' },
    'Bones soaked in metal Qi until they ring when struck.'),
  A('autumn_killing_intent', 'Autumn Killing Intent', '秋杀意', 'metal', 'earth', 12, 'passive', { stat: 'element', value: 0.15, desc: 'Your Metal moves hit 15% harder.' },
    'Autumn is the season of executions. Its Qi remembers.'),
  A('sword_heart_clarity', 'Sword-Heart Clarity', '剑心通明', 'metal', 'heaven', 16, 'passive', { stat: 'crit', value: 0.12, desc: '+12% critical chance.' },
    'When the heart is a sword, the world is made of openings.'),

  // ── Wood: sustain, drain, poison · Entangle ────────────────────────────────────────────────────────────────
  A('spring_vine_binding', 'Spring Vine Binding', '春藤缚', 'wood', 'yellow', 0, 'move', { type: 'strike', power: 30, cost: 12, status: { id: 'entangle', chance: 0.5, turns: 2 }, desc: 'Vines of green Qi that make every move cost the enemy more.' },
    'The softest thing in the garden holds the strongest man still.', { starter: true }),
  A('life_stealing_thorn', 'Life-Stealing Thorn', '噬命棘', 'wood', 'yellow', 2, 'move', { type: 'drain', power: 32, cost: 16, drain: 0.5, desc: 'Heals you for half the damage it deals.' },
    'The thorn drinks. The rose blooms. You are the rose.'),
  A('verdant_mending', 'Verdant Mending', '青木回春', 'wood', 'yellow', 3, 'move', { type: 'heal', power: 0, cost: 22, heal: 12, desc: 'Restores Health with the patience of growing things.' },
    'Grass grows back. So can you.'),
  A('coiling_venom_fang', 'Coiling Venom Fang', '缠毒牙', 'wood', 'profound', 3, 'move', { type: 'strike', power: 40, cost: 18, status: { id: 'bleed', chance: 0.5, turns: 3 }, desc: 'A venomed strike that keeps hurting after it lands.' },
    'Studied from a Blood Python that had eaten three hunters and was still hungry.', { sig: 'beast:blood_python' }),
  A('thousand_roots_prison', 'Thousand Roots Prison', '千根狱', 'wood', 'profound', 7, 'move', { type: 'hex', power: 0, cost: 24, status: { id: 'entangle', chance: 0.9, turns: 3 }, desc: 'Roots rise and hold; the enemy pays dearly for every move.' },
    'The forest is patient, and it is everywhere.'),
  A('azure_dragon_spring_tide', 'Azure Dragon Spring Tide', '青龙春潮', 'wood', 'heaven', 19, 'move', { type: 'drain', power: 80, cost: 46, drain: 0.6, desc: 'A surge of living Qi that heals you for most of what it takes.' },
    'The Azure Dragon of the east is spring itself. Its breath makes the dead trees bud.', { sig: 'beast:azure_dragon' }),
  A('withering_blight', 'Withering Blight', '枯萎诀', 'wood', 'earth', 11, 'move', { type: 'strike', power: 58, cost: 30, status: { id: 'entangle', chance: 0.6, turns: 3 }, desc: 'Grey Qi that saps strength and chokes the channels.' },
    'The other face of wood: rot, and the slow return of all things to soil.'),
  A('world_tree_verdance', 'World Tree Verdance', '建木长青', 'wood', 'earth', 13, 'move', { type: 'heal', power: 0, cost: 36, heal: 24, desc: 'A great heal that also clears every ailment on you.' },
    'A seed from the tree that holds up the sky, planted in the dantian.'),
  A('evergreen_heart', 'Evergreen Heart', '长青心', 'wood', 'yellow', 1, 'passive', { stat: 'heal', value: 3, desc: 'Recover 3 Health after every won fight.' },
    'An evergreen does not mourn the winter.'),
  A('sap_and_marrow', 'Sap and Marrow', '液髓', 'wood', 'profound', 6, 'passive', { stat: 'lifesteal', value: 0.08, desc: 'Every hit heals you for 8% of its damage.' },
    'The body learns to feed on the fight itself.'),
  A('spring_eternal', 'Spring Eternal', '永春', 'wood', 'earth', 12, 'passive', { stat: 'element', value: 0.15, desc: 'Your Wood moves hit 15% harder.' },
    'Every spring is the same spring, returning.'),
  A('rootbound_body', 'Rootbound Body', '根生体', 'wood', 'heaven', 16, 'passive', { stat: 'statusResist', value: 0.4, desc: 'Ailments land on you 40% less often.' },
    'Roots run from the soles into the earth. Nothing moves you now.'),

  // ── Water: control, slows, Qi drain · Chill ────────────────────────────────────────────────────────────────
  A('frost_lotus_palm', 'Frost Lotus Palm', '霜莲掌', 'water', 'yellow', 0, 'move', { type: 'strike', power: 32, cost: 12, status: { id: 'chill', chance: 0.4, turns: 2 }, desc: 'A palm that blooms into frost and slows the enemy.' },
    'The lotus that opens on the frozen lake.', { starter: true }),
  A('flowing_water_step', 'Flowing Water Step', '流水步', 'water', 'yellow', 2, 'move', { type: 'counter', power: 28, cost: 14, desc: 'Yield like water; if they strike, the blow is turned back on them.' },
    'Water does not fight the rock. It goes around, and in time the rock is gone.'),
  A('tide_drinking_palm', 'Tide-Drinking Palm', '吞潮掌', 'water', 'yellow', 3, 'move', { type: 'strike', power: 30, cost: 10, qiDrain: 15, desc: 'Steals combat Qi from the enemy into your own pool.' },
    'The tide goes out of them and into you.'),
  A('tide_turning_current', 'Tide-Turning Current', '逆潮流', 'water', 'profound', 5, 'move', { type: 'counter', power: 46, cost: 22, desc: 'A counter that returns a heavy strike with interest.' },
    'The harder they push, the harder the sea pushes back.'),
  A('mirror_lake_mist', 'Mirror-Lake Mist', '镜湖雾', 'water', 'profound', 7, 'move', { type: 'hex', power: 0, cost: 20, status: { id: 'chill', chance: 0.85, turns: 3 }, desc: 'A cold mist that makes the enemy act last for three turns.' },
    'On the mirror lake nothing moves quickly, and nothing is where it seems.'),
  A('black_tortoise_shell', 'Black Tortoise Shell', '玄武甲', 'water', 'heaven', 16, 'move', { type: 'ward', power: 0, cost: 30, ward: 0.9, desc: 'Turns aside almost all of the next blow, and chills the one who struck.' },
    'The Black Tortoise carries the north on its back and has never once set it down.', { sig: 'beast:black_tortoise' }),
  A('abyssal_current', 'Abyssal Current', '渊流', 'water', 'earth', 11, 'move', { type: 'strike', power: 66, cost: 34, qiDrain: 20, desc: 'Deep water that drags the enemy\'s Qi down with it.' },
    'Nothing comes back up from the deepest water.'),
  A('void_hound_fang', 'Void Hound Fang', '虚犬牙', 'water', 'earth', 15, 'move', { type: 'strike', power: 70, cost: 34, priority: 1, status: { id: 'chill', chance: 0.4, turns: 2 }, desc: 'A bite from nowhere that lands first and leaves a chill.' },
    'The Void Hound does not run to you. It is simply there, already biting.', { sig: 'beast:void_hound' }),
  A('deep_pool_breath', 'Deep Pool Breath', '深潭息', 'water', 'yellow', 1, 'passive', { stat: 'qiRegen', value: 3, desc: '+3 combat Qi every turn.' },
    'Breathe as the deep pool breathes: slowly, and without end.'),
  A('still_water_mind', 'Still Water Mind', '止水心', 'water', 'profound', 6, 'passive', { stat: 'parry', value: 1.2, desc: 'Your parry window is 20% wider.' },
    'On still water every ripple shows.'),
  A('boundless_sea', 'Boundless Sea', '无涯海', 'water', 'earth', 12, 'passive', { stat: 'qiPool', value: 30, desc: '+30 combat Qi at the start of a fight.' },
    'The sea is never full.'),
  A('north_sea_sovereign', 'North Sea Sovereign', '北冥主', 'water', 'heaven', 17, 'passive', { stat: 'element', value: 0.2, desc: 'Your Water moves hit 20% harder.' },
    'In the northern darkness there is a fish, and its name is Kun.'),

  // ── Fire: raw power, charge moves, self-risk · Burn ────────────────────────────────────────────────────────
  A('heart_flame_fist', 'Heart Flame Fist', '心火拳', 'fire', 'yellow', 0, 'move', { type: 'strike', power: 40, cost: 16, status: { id: 'burn', chance: 0.3, turns: 2 }, desc: 'A burning fist; it may set the enemy alight.' },
    'The fire in the heart, let out through the knuckles.', { starter: true }),
  A('ember_scatter', 'Ember Scatter', '散烬', 'fire', 'yellow', 2, 'move', { type: 'multi', power: 13, hits: 3, cost: 16, status: { id: 'burn', chance: 0.2, turns: 2 }, desc: 'Three embers, each with a chance to burn.' },
    'Throw a handful of sparks at a dry field and walk away.'),
  A('blazing_charge', 'Blazing Charge', '炎冲', 'fire', 'yellow', 3, 'move', { type: 'charge', power: 70, cost: 26, desc: 'Gathers fire this turn and lands a huge blow the next. Easy to see coming.' },
    'The sun takes all night to rise. Then there is no stopping it.'),
  A('fox_fire_lantern', 'Fox-Fire Lantern', '狐火灯', 'fire', 'profound', 3, 'move', { type: 'hex', power: 10, cost: 18, status: { id: 'burn', chance: 0.9, turns: 3 }, desc: 'A ghost-light that clings and burns for three turns.' },
    'A Spirit Fox\'s lantern led you in circles for a night before you learned to carry one yourself.', { sig: 'beast:spirit_fox' }),
  A('phoenix_rebirth_blaze', 'Phoenix Rebirth Blaze', '凤凰涅槃焰', 'fire', 'earth', 12, 'move', { type: 'charge', power: 110, cost: 40, heal: 10, desc: 'A charge that lands a burning blow next turn and heals you as it does.' },
    'The phoenix burns down to ash every five hundred years, and chooses to come back.'),
  A('qilin_flame_hoof', 'Qilin Flame Hoof', '麒麟焰蹄', 'fire', 'earth', 14, 'move', { type: 'strike', power: 74, cost: 34, status: { id: 'burn', chance: 0.5, turns: 3 }, desc: 'A stamp of holy flame. Righteous fire, but fire all the same.' },
    'The Qilin walks on grass without bending it. When it chooses to, it walks on you.', { sig: 'beast:qilin' }),
  A('flame_lotus_storm', 'Flame Lotus Storm', '火莲风暴', 'fire', 'profound', 7, 'move', { type: 'strike', power: 54, cost: 26, status: { id: 'burn', chance: 0.4, turns: 3 }, desc: 'Petals of fire whirl around the enemy.' },
    'A lotus of fire blooms, and every petal is a blade.'),
  A('sun_devouring_blaze', 'Sun-Devouring Blaze', '吞日焰', 'fire', 'heaven', 16, 'move', { type: 'strike', power: 100, cost: 52, status: { id: 'burn', chance: 0.6, turns: 3 }, selfDamage: 6, desc: 'Fire hot enough to hurt you too. Very little survives it.' },
    'Some say it was made by a man who tried to swallow the sun. He is not mentioned otherwise.'),
  A('kindled_meridians', 'Kindled Meridians', '燃脉', 'fire', 'yellow', 1, 'passive', { stat: 'might', value: 0.05, desc: '+5% Might.' },
    'The channels run warm and a little too fast.'),
  A('blazing_marrow', 'Blazing Marrow', '炎髓', 'fire', 'profound', 6, 'passive', { stat: 'might', value: 0.12, ward: -0.05, desc: '+12% Might, but −5% Ward.' },
    'Fire in the bones makes the fists heavy and the skin thin.'),
  A('undying_ember', 'Undying Ember', '不灭烬', 'fire', 'earth', 12, 'passive', { stat: 'element', value: 0.15, desc: 'Your Fire moves hit 15% harder.' },
    'Bury it under a mountain and it will still be warm in a thousand years.'),
  A('vermilion_bird_plumage', 'Vermilion Bird Plumage', '朱雀羽', 'fire', 'heaven', 17, 'passive', { stat: 'swift', value: 12, desc: '+12 Swift: you act first more often.' },
    'The Vermilion Bird of the south is never the second to arrive.'),

  // ── Earth: guard, counters, stuns · Daze ───────────────────────────────────────────────────────────────────
  A('mountain_bearing_stance', 'Mountain-Bearing Stance', '负山式', 'earth', 'yellow', 0, 'move', { type: 'ward', power: 0, cost: 12, ward: 0.6, counter: 0.3, desc: 'Braces like a mountain: cuts the next hit and returns part of it.' },
    'Carry the mountain long enough and it stops feeling heavy.'),
  A('stone_fist', 'Stone Fist', '石拳', 'earth', 'yellow', 0, 'move', { type: 'strike', power: 38, cost: 14, status: { id: 'daze', chance: 0.2, turns: 1 }, desc: 'A fist like a falling rock; it may daze.' },
    'Not subtle. Does not need to be.', { starter: true }),
  A('quaking_stomp', 'Quaking Stomp', '震地踏', 'earth', 'yellow', 3, 'move', { type: 'strike', power: 34, cost: 18, status: { id: 'daze', chance: 0.45, turns: 1 }, desc: 'The ground jumps; the enemy may lose their footing and their turn.' },
    'The earth is a drum. Strike it and everything standing on it hears.'),
  A('mountain_bear_roar', 'Mountain Bear Roar', '山熊吼', 'earth', 'earth', 10, 'move', { type: 'hex', power: 20, cost: 24, status: { id: 'daze', chance: 0.8, turns: 1 }, desc: 'A roar that shakes the ground and the enemy\'s wits.' },
    'The Spectral Bear\'s roar is felt in the soles of the feet before it is heard.', { sig: 'beast:spectral_bear' }),
  A('iron_body', 'Iron Body', '铁身', 'earth', 'profound', 5, 'move', { type: 'buff', power: 0, cost: 20, self: { stat: 'ward', value: 0.3, turns: 3 }, desc: 'Hardens the body: +30% Ward for three turns.' },
    'Iron Body Tempering, the cultivation method, made into a fighting stance.'),
  A('collapsing_peak', 'Collapsing Peak', '崩山', 'earth', 'earth', 12, 'move', { type: 'finisher', power: 70, cost: 36, finisher: 0.8, desc: 'Brings the mountain down on a weakened foe: far stronger when they are hurt.' },
    'A mountain does not fall often. When it does, there is no second blow needed.'),
  A('rampart_of_ten_li', 'Rampart of Ten Li', '十里壁', 'earth', 'profound', 7, 'move', { type: 'ward', power: 0, cost: 22, ward: 0.8, desc: 'Raises a wall of stone Qi that stops most of the next blow.' },
    'The wall ran ten li across the pass. The army that came to it went home.'),
  A('yellow_dragon_earth_sovereign', 'Yellow Dragon Earth Sovereign', '黄龙镇地', 'earth', 'heaven', 17, 'move', { type: 'strike', power: 96, cost: 48, status: { id: 'daze', chance: 0.5, turns: 1 }, self: { stat: 'ward', value: 0.2, turns: 2 }, desc: 'A crushing blow that also steadies you behind a stone guard.' },
    'The Yellow Dragon keeps the centre, where all the elements meet and none of them move it.'),
  A('grounded_stance', 'Grounded Stance', '扎根桩', 'earth', 'yellow', 1, 'passive', { stat: 'ward', value: 0.06, desc: '+6% Ward.' },
    'Stand for an hour in the horse stance, every morning, for ten years.'),
  A('stone_skin', 'Stone Skin', '石肤', 'earth', 'profound', 6, 'passive', { stat: 'ward', value: 0.1, desc: '+10% Ward.' },
    'Grey and rough, and blades slide off it.'),
  A('bedrock_will', 'Bedrock Will', '磐石意', 'earth', 'earth', 12, 'passive', { stat: 'element', value: 0.15, desc: 'Your Earth moves hit 15% harder.' },
    'Below the soil, below the stone, there is the thing that does not move.'),
  A('mountain_heart', 'Mountain Heart', '山心', 'earth', 'heaven', 16, 'passive', { stat: 'ward', value: 0.2, desc: '+20% Ward.' },
    'The mountain does not fight. It is simply still there afterwards.'),
  // ── Arena champions' signature arts (sig 'arena:<ring>'; the Heaven's Ring one is Heaven-Severing Sword Intent) ──
  A('dust_ring_haymaker', 'Dust Ring Haymaker', '尘台重拳', 'neutral', 'yellow', 0, 'move', { type: 'strike', power: 46, cost: 16, desc: 'A wide, heavy swing that the Dust Ring crowd loves.' },
    'Nobody in the Dust Ring has ever blocked it. Most of them never saw it coming either.', { sig: 'arena:dust' }),
  A('iron_bell_toll', 'Iron Bell Toll', '铁钟鸣', 'metal', 'profound', 3, 'move', { type: 'strike', power: 50, cost: 22, status: { id: 'daze', chance: 0.5, turns: 1 }, desc: 'A palm struck like a temple bell; the ringing dazes the enemy.' },
    'The Master of the Iron Bell rings it once at the start of every bout, and once at the end.', { sig: 'arena:iron' }),
  A('jade_terrace_sweep', 'Jade Terrace Sweep', '玉台横扫', 'earth', 'earth', 10, 'move', { type: 'strike', power: 64, cost: 30, status: { id: 'guardbreak', chance: 0.5, turns: 2 }, desc: 'A low sweep across the terrace that knocks the guard aside.' },
    'The Lord of the Jade Terrace sweeps the floor with their challengers, as the saying goes.', { sig: 'arena:jade' }),
  A('golden_pit_fury', 'Golden Pit Fury', '金坑怒', 'fire', 'earth', 13, 'move', { type: 'multi', power: 28, hits: 3, cost: 36, status: { id: 'burn', chance: 0.3, turns: 2 }, desc: 'Three furious burning blows in the style of the pit.' },
    'The Sovereign of the Golden Pit fights like the pit is on fire. It usually is.', { sig: 'arena:golden' }),
  A('soul_lotus_bloom', 'Soul Lotus Bloom', '魂莲绽', 'wood', 'heaven', 16, 'move', { type: 'drain', power: 76, cost: 44, drain: 0.5, status: { id: 'entangle', chance: 0.5, turns: 2 }, desc: 'A lotus of soul-light that drinks from the enemy and binds them.' },
    'The Keeper of the Soul Lotus does not strike. The lotus does.', { sig: 'arena:lotus' }),
]

const ARTS = Object.fromEntries(ARTS_LIST.map(a => [a.id, a]))


// ── Move combat (Phase 42b, task 1.13a; arts.md → "Move combat" + "Parry") ─────────────────────────────────────────
// Beast fights use these now; people fights move over in 1.14. The engine (game-state.js "42b") reads every number here.
const MOVE_COMBAT = {
  qiPool: 100, qiRegen: 15,              // combat Qi: starts full, refills each turn. No cooldowns (user 2026-09-29).
  circulateQi: 35,                       // Circulate: skip the attack, gather Qi
  parryQi: 25, parryCirculateMult: 2,    // a parried hit: 0 damage + Qi back (double on a Circulate turn)
  parryWindowMs: 300, parryWideMult: 1.6, parryMinMs: 120, parryMaxMs: 650,   // user pick: "fair, ~300 ms"
  parryLeadMs: [700, 1100], parryTutorialLead: 1.8, parryGapMs: 420, parryGraceMs: 120,
  parryPromptChance: 0.35, parryBigShare: 0.9,   // user 2026-09-29: fewer prompts — charges, finishers and a beast's strongest
                                                 // arts always telegraph; other blows 35% of the time (the rest just land)
  parryMult: { multi: 0.8, priority: 0.8, charge: 1.4, finisher: 0.75 },     // windows by the attack's kind
  parrySwift: 0.01,                      // ±1% window per point of Swift over / under the attacker
  dmgScale: 0.4, powerSpread: 333, powerRatioClamp: [0.3, 3.5], spread: [0.75, 1.1],   // one stage ≈ ×1.35 damage both ways
  critBase: 0.05, critMult: 1.5, elementOver: 1.4, elementUnder: 0.75, affinity: 0.2,
  guardBreakMult: 1.3, counterTakenMult: 0.5,
  bleedDmg: 4, burnDmg: 3, burnStackMax: 3, dazeSkip: 0.4, entangleCost: 8,
  beastHpBase: 80, beastHpMight: 0.5, swiftBase: 50, swiftTrait: 15,
  foeDmgMult: 1.15, foeHpMult: 1,        // global beast tuning knobs (1.13a balance pass; ×1.15 with fewer parry prompts, user 2026-09-29)
  beastParryPerGuard: 0.004, beastParryMax: 0.3,   // a beast parries your blows by a roll (its guard habit)
  driveTakenMult: 0.5, driveThrownHp: 10,          // Drive off: half damage; at this Health you are thrown down (never dies)
  estimateRuns: 300, parryRateDefault: 0.3, parryRateWindow: 30, maxTurns: 30,
  masteryXpPerUse: 1,
}
// Each beast's moves (ARTS ids; the signature art is the beast's own) + a free basic attack of its element.
const BEAST_MOVES = {
  spirit_fox:    ['fox_fire_lantern', 'heart_flame_fist', 'ember_scatter'],
  blood_python:  ['coiling_venom_fang', 'spring_vine_binding', 'life_stealing_thorn'],
  thunder_eagle: ['thunder_talon_strike', 'iron_needle_rain', 'edge_seeking_thrust'],
  spectral_bear: ['mountain_bear_roar', 'stone_fist', 'mountain_bearing_stance'],
  white_tiger:   ['white_tiger_rending_claw', 'armour_rending_slash', 'severing_crescent'],
  qilin:         ['qilin_flame_hoof', 'flame_lotus_storm', 'sutra_of_stillness'],
  void_hound:    ['void_hound_fang', 'mirror_lake_mist', 'abyssal_current'],
  black_tortoise:['black_tortoise_shell', 'tide_turning_current', 'frost_lotus_palm'],
  azure_dragon:  ['azure_dragon_spring_tide', 'withering_blight', 'thousand_roots_prison'],
  golden_dragon: ['golden_dragon_divine_fist', 'ten_thousand_swords_rain', 'severing_crescent'],
}
// Per-beast HP tuning (movesets differ in strength; 1.13a balance pass: a well-kept loadout at the same realm, parrying ~30%,
// wins ≈ 55%, one realm up ≈ 80%; the two dragons stay far harder). Missing = 1.
const BEAST_HP_MULT = { spirit_fox: 1.3, blood_python: 1.0, thunder_eagle: 1.1, spectral_bear: 1.65, white_tiger: 1, qilin: 0.8, void_hound: 1.05, black_tortoise: 0.7, azure_dragon: 1, golden_dragon: 0.95 }
const BEAST_BASIC = { name: 'Rake', move: { type: 'strike', power: 22, cost: 0, desc: 'Tooth and claw.' } }
// Move types that are attacks (a parry window opens on each hit)
const MOVE_ATTACKS = ['strike', 'multi', 'charge', 'finisher', 'drain']

// ── Phase 42c (task 1.14a): people on moves ─────────────────────────────────────────────────────────────────────────
// A person's arts (p.arts) are rolled once per realm from their root's elements + temper, seeded by their id (never
// Math.random), then kept. Moves: PERSON_MOVE_COUNT by stage; the rarity of each pick follows their stage (by the
// same realm thresholds as ART_PASSIVE_SLOTS); their passive slots follow ART_PASSIVE_SLOTS like yours.
const PERSON_MOVE_COUNT = [{ stage: 0, n: 2 }, { stage: 4, n: 3 }, { stage: 13, n: 4 }]
// (1.14a balance: a notch below the grades your breakthrough offers give, so a kept loadout meets them ~evenly)
const PERSON_ART_WEIGHTS = [
  { stage: 0,  w: { yellow: 100 } },
  { stage: 4,  w: { yellow: 80, profound: 20 } },
  { stage: 10, w: { yellow: 40, profound: 50, earth: 10 } },
  { stage: 13, w: { yellow: 10, profound: 50, earth: 35, heaven: 5 } },
  { stage: 16, w: { profound: 30, earth: 50, heaven: 20 } },
  { stage: 19, w: { profound: 10, earth: 45, heaven: 42, immortal: 3 } },
]
const PERSON_PASSIVE_SHARE = 0.5       // they fill this share of the passive slots you would have at their realm (rounded up)
const PERSON_ART_OWN_ELEMENT = 4       // an art of one of their root's elements is this many times likelier than a neutral one
// Temper → which move kinds they reach for when picking arts (×weight), and how they choose in a fight (×weight per move
// type; `hurt` applies below half Health). The world's rolls, never yours (agency rule). FIGHT_STYLE (family.js) still
// sets how often they attack / guard / trick, and their parry chance.
const PERSON_TEMPER_ARTS = {
  hotblood:  { strike: 2, multi: 1.6 },          arrogant: { charge: 3, finisher: 2 },  demonking: { charge: 3, finisher: 2.5 },
  stoic:     { ward: 3, counter: 3 },            coward:   { heal: 3, ward: 2 },        psycho:    { hex: 3, drain: 2 },
  grumpy:    { counter: 2.5, ward: 1.5 },        paranoid: { hex: 2, counter: 1.5 },    gremlin:   { hex: 2, multi: 1.5 },
  poet:      { multi: 2, hex: 1.5 },             miser:    { drain: 2.5, ward: 1.5 },   glutton:   { strike: 1.8, drain: 1.5 },
  niceguy:   { ward: 2, heal: 2 },               lazy:     { counter: 2, ward: 1.5 },
}
const PERSON_TEMPER_AI = {
  hotblood:  { strike: 1.5, multi: 1.4, ward: 0.3 },   arrogant: { charge: 2.5, finisher: 2, ward: 0.5 },
  demonking: { charge: 2.5, finisher: 2 },            stoic:    { hurt: { ward: 3, counter: 3, heal: 2 } },
  coward:    { hurt: { heal: 3, ward: 3 }, ward: 1.5 }, psycho:   { hex: 2.5, drain: 1.8 },
  grumpy:    { counter: 2, ward: 1.4 },                paranoid: { hex: 2, counter: 1.5 },
  gremlin:   { hex: 1.8, multi: 1.4 },                 poet:     { multi: 1.6, hex: 1.3 },
  niceguy:   { hurt: { heal: 2, ward: 2 } },           lazy:     { circulate: 1.5, counter: 1.5 },
}
const PERSON_FIGHT = {
  hpBase: 100,                     // a person's battle HP (yours = your Health, 0–100)
  hpPerRealm: 0,                   // + this per realm past Mortal (0: the same 100 as your Health; the realm gap is in power)
  powerSpread: 700,                // power gap → blow ratio e^(gap/this); beasts use MOVE_COMBAT.powerSpread (333)
  dmgMult: 1.15,                   // global knob for people's damage (beasts: MOVE_COMBAT.foeDmgMult)
  grudgeDmgMult: 1.2,              // one who holds a grudge against you hits this much harder (on top of FEUD_POWER)
  parryPerGuard: 0.004, parryMax: 0.3,   // they parry your blows by a roll: FIGHT_STYLE guard × this
  yieldThrownHp: 30,               // a fight "until one yields": at this Health you are beaten (never below 1) …
  yieldFoeFrac: 0.3,               // … and they yield at this share of their HP (both sides stop at ~30%: the loss stays a wound)
  estimateRuns: 150,               // Monte Carlo runs for a person (roster rows show many at once)
}

// ── Phase 42c part 2 (task 1.14b): rivals + libraries ───────────────────────────────────────────────────────────────
// Rival counters: a person remembers which elements your blows carried (p.vsYou.els). One who holds a grudge, once
// you have struck them this many times with one element, trains against it: they fight as the element that overcomes
// it (your arts of it are resisted) and carry an art of that element. The world's roll, never yours.
const RIVAL_COUNTER_MIN_BLOWS = 3
// After a won fight: raise one who then owes you → they teach you one of their arts (a manual, always, if they know one
// you don't); finish them → their manual drops with this chance (a signature art never drops this way).
const PERSON_FINISH_MANUAL = 0.6
// A joined sect's library: its arts (the sect's elements + neutral), each grade opened by your rank, bought for
// Contribution (spending it does not lower the rank you already hold). A manual comes into your pack.
const SECT_ART_ELEMENTS = {
  azure_sword: ['metal'], myriad_herb: ['wood', 'water'], thunder_palace: ['metal', 'fire'],
  void_moon: ['water', 'earth'], heaven_defying: ['fire', 'earth'],
}
const SECT_LIBRARY_GRADE_BY_RANK = ['yellow', 'profound', 'profound', 'earth', 'earth', 'heaven']   // highest grade each rank opens
const SECT_LIBRARY_PRICE = { yellow: 40, profound: 120, earth: 350, heaven: 900 }                   // Contribution per manual
// The clan library (Kin → Hall): write an art you know into it for Spirit Stones; it stays with the clan across lives.
// Anyone of the clan who does not know it studies it from the library at this share of the time, with no manual.
const CLAN_LIBRARY_WRITE_COST = { yellow: 60, profound: 200, earth: 600, heaven: 1500, immortal: 4000 }
const CLAN_LIBRARY_STUDY_FRAC = 0.5
// Giving a manual to your sect (user 2026-09-30: "contribute your extra art books for the sect to learn"). The manual goes
// onto the sect's shelf (who gave it, when); a joined sect pays Contribution for it; every shelved art trains the sect's
// disciples: war strength ×(1 + the sum by grade, capped). A founded sect's shelf is its own library: you (and later lives
// while the sect stands) study a shelved art at SECT_SHELF_STUDY_FRAC of the time, with no manual. One copy of an art per shelf.
const SECT_DONATE_CONTRIB = { yellow: 20, profound: 60, earth: 175, heaven: 450, immortal: 1000 }
const SECT_SHELF_WAR = { yellow: 0.01, profound: 0.02, earth: 0.04, heaven: 0.07, immortal: 0.12 }
const SECT_SHELF_WAR_CAP = 0.25
const SECT_SHELF_STUDY_FRAC = 0.5
