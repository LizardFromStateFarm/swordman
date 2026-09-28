// Beast traits, rarity tiers, beast types and their rare colour variants (Phase 3 Spiritual Beasts; roster of 10 + tiers +
// variants 2026-09-28). Used by: game-state.js (encounter / tame / expedition logic, beastProfile, trait Might in _recalc),
// renderer/game/beasts.js, game.js (Roam → Beasts), renderer/game/beast-detail.js (details page), attention.js.
// Art: each type's `spriteState` (and each variant's `art`) is an INK_BEASTS key (assets/sprites/ink-beasts.js).

const BEAST_TRAITS = {
  swift:             { id: 'swift',             name: 'Swift',             nameCN: '迅捷', desc: 'Expedition duration −15%.' },
  iron_skin:         { id: 'iron_skin',         name: 'Iron Skin',         nameCN: '铁皮', desc: 'Accesses locations 3 stages below minimum.' },
  spirit_nose:       { id: 'spirit_nose',       name: 'Spirit Nose',       nameCN: '灵鼻', desc: 'Loot +25% on beast expeditions.' },
  heavenly_instinct: { id: 'heavenly_instinct', name: 'Heavenly Instinct', nameCN: '天感', desc: '+10% Breakthrough chance while active.' },
  qi_devour:         { id: 'qi_devour',         name: 'Qi Devour',         nameCN: '噬气', desc: 'Generates +0.5 Qi/s passively.' },
  soul_bond:         { id: 'soul_bond',         name: 'Soul Bond',         nameCN: '魂契', desc: '+5% Qi/s per beast level.' },
}

// Rarity tiers. `might` multiplies what a beast's traits do (Qi, breakthrough, loot); `favored` = the chance each trait roll
// is drawn from the type's favoredTraits instead of the whole pool. Styled by .tier-<id> (styles.css).
const BEAST_TIERS = {
  common:    { id: 'common',    name: 'Common',    might: 1.0,  favored: 0.35 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  might: 1.2,  favored: 0.45 },
  rare:      { id: 'rare',      name: 'Rare',      might: 1.45, favored: 0.55 },
  epic:      { id: 'epic',      name: 'Epic',      might: 1.7,  favored: 0.65 },
  legendary: { id: 'legendary', name: 'Legendary', might: 2.0,  favored: 0.8 },
}
const BEAST_TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary']

// A rare colour variant: rolled on a sighting with this chance, its traits hit a little harder (× might).
const BEAST_VARIANT_CHANCE = 0.12
const BEAST_VARIANT_MIGHT = 1.15

const BEAST_TYPES = [
  {
    id: 'spirit_fox', name: 'Spirit Fox', nameCN: '灵狐', tier: 'common',
    desc: 'Quick and clever; senses Qi from great distances.',
    lore: 'Foxes that drink moonlight for a hundred years grow a second tail, and a third, and on. This one wears gold its first master hung on it and never took back. It can smell a spirit herb three valleys away, and a lie across the table.',
    minStage: 0, encounterChance: 0.08, baseExpPower: 10, xpPerExp: 8,
    spriteState: 'spirit_fox', favoredTraits: ['swift', 'spirit_nose'],
    variants: [{ id: 'crimson', name: 'Crimson Nine-Tail', art: 'spirit_fox__crimson',
      lore: 'A fox whose tails caught fire in a burning temple and never went out. It does not burn what it loves.' }],
  },
  {
    id: 'blood_python', name: 'Blood Python', nameCN: '血蟒', tier: 'common',
    desc: 'Coils of red iron; its blood runs hot with stolen Qi.',
    lore: 'It grew fat in a battlefield marsh, drinking what soaked into the mud. The gold marks on its scales are old seals some sect pressed into it, trying to bind it. They held for a while.',
    minStage: 3, encounterChance: 0.07, baseExpPower: 14, xpPerExp: 10,
    spriteState: 'blood_python', favoredTraits: ['qi_devour', 'iron_skin'],
    variants: [{ id: 'jade', name: 'Jade Python', art: 'blood_python__jade',
      lore: 'Shed from a python that coiled a hundred years around a jade vein. Its venom is said to cure as often as it kills.' }],
  },
  {
    id: 'thunder_eagle', name: 'Thunder Eagle', nameCN: '雷鹰', tier: 'uncommon',
    desc: 'Its wings crackle with heavenly lightning.',
    lore: 'Born in the eye of a tribulation storm, it fed on the lightning meant for a cultivator who failed. It nests only on peaks the clouds cannot reach. When it takes a master, thunder answers when they call.',
    minStage: 6, encounterChance: 0.05, baseExpPower: 25, xpPerExp: 20,
    spriteState: 'thunder_eagle', favoredTraits: ['swift', 'heavenly_instinct'],
    variants: [{ id: 'violet', name: 'Violet Storm Roc', art: 'thunder_eagle__violet',
      lore: 'Violet lightning is the heavens angry. This roc was hatched in it and has been angry ever since.' }],
  },
  {
    id: 'spectral_bear', name: 'Spectral Bear', nameCN: '幽魂熊', tier: 'uncommon',
    desc: 'A great bear of cold ghost-fire; wounds close on it like water.',
    lore: 'A mountain bear that died guarding its cubs and would not stop guarding. Its body burned away and the fire stayed. It walks through snow without melting it.',
    minStage: 10, encounterChance: 0.045, baseExpPower: 32, xpPerExp: 22,
    spriteState: 'spectral_bear', favoredTraits: ['iron_skin', 'soul_bond'],
    variants: [{ id: 'ember', name: 'Ember Spirit Bear', art: 'spectral_bear__ember',
      lore: 'Its ghost-fire runs warm instead of cold. Travellers who sleep beside it wake up rested and a little braver.' }],
  },
  {
    id: 'white_tiger', name: 'White Tiger', nameCN: '白虎', tier: 'rare',
    desc: 'Lord of the western wind; its stripes are written in metal Qi.',
    lore: 'Old texts name the White Tiger as the guardian of the West, and every white tiger born since has believed it. This one wears the gold of three kings it outlived.',
    minStage: 13, encounterChance: 0.03, baseExpPower: 45, xpPerExp: 30,
    spriteState: 'white_tiger', favoredTraits: ['heavenly_instinct', 'swift'],
    variants: [{ id: 'golden', name: 'Golden Tiger', art: 'white_tiger__golden',
      lore: 'A tiger that slept a thousand years in a gold mine and woke up the colour of it. It is very hard to impress.' }],
  },
  {
    id: 'qilin', name: 'Qilin', nameCN: '麒麟', tier: 'rare',
    desc: 'A gentle omen; it walks on grass without bending it.',
    lore: 'The qilin appears when a great sage is born or a great ruler dies. It will not tread on a living insect. It chose you, which is either a blessing or a warning.',
    minStage: 14, encounterChance: 0.028, baseExpPower: 50, xpPerExp: 32,
    spriteState: 'qilin', favoredTraits: ['heavenly_instinct', 'soul_bond'],
    variants: [{ id: 'crimson', name: 'Crimson Qilin', art: 'qilin__crimson',
      lore: 'The red qilin comes before wars instead of sages. It is just as gentle. That is what frightens people.' }],
  },
  {
    id: 'void_hound', name: 'Void Hound', nameCN: '虚空犬', tier: 'epic',
    desc: 'Hunts through rifts in space; loyal beyond death.',
    lore: 'Its coat holds the dark between stars, and the runes on it were not put there by any hand. It steps through the gaps in space as a common wolf steps through grass. Once bound, it has followed masters into the next life.',
    minStage: 15, encounterChance: 0.02, baseExpPower: 60, xpPerExp: 40,
    spriteState: 'void_hound', favoredTraits: ['soul_bond', 'qi_devour'],
    variants: [{ id: 'frost', name: 'Frost Void Hound', art: 'void_hound__frost',
      lore: 'This one hunted too long in the cold places between worlds. The stars in its coat froze where they were.' }],
  },
  {
    id: 'black_tortoise', name: 'Black Tortoise', nameCN: '玄武', tier: 'epic',
    desc: 'Tortoise and serpent in one; the northern sky written on its shell.',
    lore: 'Xuanwu, guardian of the North: a tortoise that carries the night sky, and a serpent that never sleeps coiled around it. The two argue. They have been arguing for ten thousand years.',
    minStage: 16, encounterChance: 0.018, baseExpPower: 70, xpPerExp: 45,
    spriteState: 'black_tortoise', favoredTraits: ['iron_skin', 'qi_devour'],
    variants: [{ id: 'flame', name: 'Flame-Shell Xuanwu', art: 'black_tortoise__flame',
      lore: 'Its shell holds a summer sky instead of a winter one. The serpent complains about the heat.' }],
  },
  {
    id: 'azure_dragon', name: 'Azure Dragon', nameCN: '青龙', tier: 'legendary',
    desc: 'Guardian of the East; rain follows wherever it flies.',
    lore: 'Qinglong, the Azure Dragon of the East, lord of spring rain and new growth. It does not serve. On rare occasions it agrees to travel with someone, for a while, because it is curious how their story ends.',
    minStage: 19, encounterChance: 0.006, baseExpPower: 120, xpPerExp: 60,
    spriteState: 'azure_dragon', favoredTraits: ['soul_bond', 'heavenly_instinct'],
    variants: [{ id: 'storm', name: 'Violet Storm Dragon', art: 'azure_dragon__storm',
      lore: 'A dragon of the storm season, when spring rain turns to typhoon. Villages leave offerings to the azure one. They leave offerings to this one very quickly.' }],
  },
  {
    id: 'golden_dragon', name: 'Golden Dragon', nameCN: '金龙', tier: 'legendary', might: 2.3,
    desc: 'The Emperor of beasts; the sun itself bows to it.',
    lore: 'Only one golden dragon is ever awake at a time. Emperors have worn its image on their robes for ten thousand years and never once seen it. If it is here, heaven itself is watching you.',
    minStage: 20, encounterChance: 0.004, baseExpPower: 150, xpPerExp: 70,
    spriteState: 'golden_dragon', favoredTraits: ['heavenly_instinct', 'soul_bond', 'qi_devour'],
    variants: [{ id: 'crimson', name: 'Crimson Sun Dragon', art: 'golden_dragon__crimson',
      lore: 'The sun at the end of the world is red. So is this dragon. Scholars disagree about whether that is a coincidence.' }],
  },
]
