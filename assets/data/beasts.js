// Beast trait pool and beast type definitions for Phase 3 Spiritual Beasts.
// Used by: game-state.js (encounter/tame/expedition logic), renderer/game/beasts.js, game.js (UI)

const BEAST_TRAITS = {
  swift:             { id: 'swift',             name: 'Swift',             nameCN: '迅捷', desc: 'Expedition duration −15%.' },
  iron_skin:         { id: 'iron_skin',         name: 'Iron Skin',         nameCN: '铁皮', desc: 'Accesses locations 3 stages below minimum.' },
  spirit_nose:       { id: 'spirit_nose',       name: 'Spirit Nose',       nameCN: '灵鼻', desc: 'Loot +25% on beast expeditions.' },
  heavenly_instinct: { id: 'heavenly_instinct', name: 'Heavenly Instinct', nameCN: '天感', desc: '+10% Breakthrough chance while active.' },
  qi_devour:         { id: 'qi_devour',         name: 'Qi Devour',         nameCN: '噬气', desc: 'Generates +0.5 Qi/s passively.' },
  soul_bond:         { id: 'soul_bond',         name: 'Soul Bond',         nameCN: '魂契', desc: '+5% Qi/s per beast level.' },
}

const BEAST_TYPES = [
  {
    id: 'spirit_fox', name: 'Spirit Fox', nameCN: '灵狐',
    desc: 'Quick and clever; senses Qi from great distances.',
    minStage: 0,
    encounterChance: 0.08,
    baseExpPower: 10,
    xpPerExp: 8,
    spriteState: 'spirit_fox',
    favoredTraits: ['swift', 'spirit_nose'],
  },
  {
    id: 'thunder_eagle', name: 'Thunder Eagle', nameCN: '雷鹰',
    desc: 'Its wings crackle with heavenly lightning.',
    minStage: 6,
    encounterChance: 0.05,
    baseExpPower: 25,
    xpPerExp: 20,
    spriteState: 'thunder_eagle',
    favoredTraits: ['swift', 'heavenly_instinct'],
  },
  {
    id: 'void_hound', name: 'Void Hound', nameCN: '虚空犬',
    desc: 'Hunts through rifts in space; loyal beyond death.',
    minStage: 15,
    encounterChance: 0.03,
    baseExpPower: 60,
    xpPerExp: 50,
    spriteState: 'void_hound',
    favoredTraits: ['soul_bond', 'qi_devour'],
  },
]
