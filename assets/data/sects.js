// Sect definitions, ranks, and missions for Phase 4 (Join Existing Sect). Data only.
// Depends on: items.js (mission reward item ids). Used by: game-state.js (sect logic, _recalc), renderer/game/sect.js, game.js (Sect tab)

const SECT_MAX_MISSIONS = 2
const SECT_DONATE_RATE  = 0.5   // contribution points per Spirit Stone donated

const SECTS = [
  {
    id: 'azure_sword', name: 'Azure Sword Sect', nameCN: '碧剑宗',
    desc: 'Swordsmen who temper blade and heart as one. Their disciples wield weapons as extensions of Qi.',
    minStage: 3, specialty: 'Weapon buffs, breakthrough chance',
    effects: { bt_bonus: 0.05, weapon_qps_mult: 1.15 },
  },
  {
    id: 'myriad_herb', name: 'Myriad Herb Hall', nameCN: '万草堂',
    desc: 'Alchemists and herbalists whose gardens never wither. Their pill furnaces are rarely idle.',
    minStage: 2, specialty: 'Crafting doubles, herb drops',
    effects: { craft_double_chance: 0.35, herb_mult: 1.5 },
  },
  {
    id: 'thunder_palace', name: 'Thunder Palace', nameCN: '雷宫',
    desc: 'Their halls stand where lightning strikes daily. Disciples cultivate within the storm.',
    minStage: 6, specialty: 'Qi/s +40%, expedition power',
    effects: { qps_mult: 1.4, loot_mult: 1.15 },
  },
  {
    id: 'void_moon', name: 'Void Moon Pavilion', nameCN: '虚月阁',
    desc: 'A pavilion that appears only beneath a moonless sky. It knows the paths others cannot see.',
    minStage: 10, specialty: 'Hidden locations, Integrity regen',
    effects: { hidden_locations: true, integrity_regen_mult: 2 },
  },
  {
    id: 'heaven_defying', name: 'Heaven Defying Sect', nameCN: '逆天门',
    desc: 'They spit at fate and Heaven alike. Failure is a word their elders have struck from the scrolls.',
    minStage: 15, specialty: 'Breakthrough floor 50%, artifact bonus',
    effects: { bt_floor: 0.5, artifact_qps_mult: 1.2 },
  },
]

const SECT_RANKS = [
  { name: 'Outer Disciple',  nameCN: '外门弟子', minContribution: 0,    rewardMult: 1.0 },
  { name: 'Inner Disciple',  nameCN: '内门弟子', minContribution: 100,  rewardMult: 1.1 },
  { name: 'Core Disciple',   nameCN: '核心弟子', minContribution: 350,  rewardMult: 1.25 },
  { name: 'Elder',           nameCN: '长老',     minContribution: 900,  rewardMult: 1.4 },
  { name: 'Peak Elder',      nameCN: '峰主',     minContribution: 2200, rewardMult: 1.6 },
  { name: 'Grand Elder',     nameCN: '太上长老', minContribution: 5000, rewardMult: 2.0 },
]

const SECT_MISSIONS = [
  {
    id: 'herb_gathering', name: 'Herb Gathering', nameCN: '采药',
    desc: 'Gather herbs from the sect gardens and surrounding peaks.',
    duration: 300, minRank: 0, contribution: 10, beastXp: 0,
    rewards: [{ itemId: 'spirit_herb', minQty: 3, maxQty: 6 }],
  },
  {
    id: 'patrol', name: 'Patrol', nameCN: '巡山',
    desc: 'Walk the sect borders and drive off trespassers.',
    duration: 600, minRank: 0, contribution: 25, beastXp: 0,
    rewards: [{ itemId: 'spirit_stone', minQty: 5, maxQty: 12 }],
  },
  {
    id: 'escort', name: 'Escort', nameCN: '护送',
    desc: 'Guard a merchant caravan through bandit country. Your beasts learn from the road.',
    duration: 1200, minRank: 1, contribution: 60, beastXp: 15,
    rewards: [{ itemId: 'spirit_stone', minQty: 10, maxQty: 20 }],   // long missions pay stones: they finish while offline // economy pass 2026-09-25 (npm run sim)
  },
  {
    id: 'subdue_demon', name: 'Subdue Demon', nameCN: '降妖',
    desc: 'A demon stirs beneath the mountain. Seal it before it wakes.',
    duration: 1800, minRank: 2, contribution: 150, beastXp: 0,
    rewards: [{ itemId: 'demon_essence', minQty: 1, maxQty: 2 }, { itemId: 'spirit_stone', minQty: 15, maxQty: 30 }],
  },
  {
    id: 'retrieve_artifact', name: 'Retrieve Artifact', nameCN: '寻宝',
    desc: 'Recover a relic the sect lost in a ruined cave system long ago.',
    duration: 3600, minRank: 3, contribution: 400, beastXp: 0,
    rewards: [{ itemId: 'artifact_fragment', minQty: 1, maxQty: 1 }, { itemId: 'spirit_stone', minQty: 30, maxQty: 60 }],
  },
]
