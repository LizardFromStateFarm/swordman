// Own-sect (Phase 5A) data: founding requirements, Sect Hall levels, buildings, disciple constants + name pools.
// Depends on: items.js (item ids). Used by: game-state.js (own-sect logic, _recalc), game.js (Sect tab).

const SECT_FOUNDING = { minStage: 18, stones: 500, items: { void_crystal: 50 }, maxNameLen: 20 }

// Index = hallLevel - 1. `cap` = disciple cap at that level; `upgradeStones` = cost to reach the next level.
const SECT_HALL_LEVELS = [
  { cap: 5,  upgradeStones: 100 },
  { cap: 10, upgradeStones: 250 },
  { cap: 15, upgradeStones: 500 },
  { cap: 20, upgradeStones: null },
]

const SECT_BUILDINGS = [
  {
    id: 'qi_library', name: 'Qi Library', nameCN: '气功馆',
    desc: 'Disciples contribute +20% more Qi to you.',
    stones: 50, items: {}, effects: { disciple_qi_mult: 1.2 },
  },
  {
    id: 'pill_hall', name: 'Pill Hall', nameCN: '炼丹殿',
    desc: 'Furnaces burn day and night: 40% chance crafts yield double.',
    stones: 100, items: { spirit_herb: 20 }, effects: { craft_double_chance: 0.4 },
  },
  {
    id: 'beast_pen', name: 'Spirit Beast Pen', nameCN: '灵兽栏',
    desc: '+2 spiritual beast slots.',
    stones: 80, items: {}, effects: { beast_slots: 2 },
  },
  {
    id: 'training_ground', name: 'Training Ground', nameCN: '修炼场',
    desc: 'Disciples level up 30% faster.',
    stones: 60, items: {}, effects: { disciple_xp_mult: 1.3 },
  },
  {
    id: 'defensive_array', name: 'Defensive Array', nameCN: '防御阵',
    desc: 'War defense +40% (used by sect wars, Phase 5B).',
    stones: 200, items: { void_crystal: 5 }, effects: { war_defense: 0.4 },
  },
  {
    id: 'treasury', name: 'Treasury', nameCN: '宝库',
    desc: 'Disciple resource income +30%.',
    stones: 150, items: {}, effects: { income_mult: 1.3 },
  },
]

const DISCIPLE_MAX_LEVEL       = 10
const DISCIPLE_RECRUIT_COST    = 15      // Spirit Stones × talent²
const RECRUIT_REROLL_COST      = 10
const RECRUIT_POOL_SIZE        = 3
const RECRUIT_REFRESH_SECONDS  = 900
const RECRUIT_TALENT_WEIGHTS   = [40, 30, 20, 8, 2]   // 1★..5★

// Per second, per disciple, × talent × (1 + 0.1×(level−1)):
const DISCIPLE_STONE_RATE = 0.003
const DISCIPLE_HERB_RATE  = 0.0015
const DISCIPLE_QI_FRAC    = 0.004   // fraction of base Qi/s added per disciple
const DISCIPLE_XP_BASE    = 0.5     // xp/s = BASE + PER_TALENT × talent
const DISCIPLE_XP_PER_TALENT = 0.25
const DISCIPLE_XP_PER_LEVEL  = 600  // xp needed to leave level L = 600 × L

const DISCIPLE_SURNAMES = ['Li','Wang','Zhang','Liu','Chen','Yang','Zhao','Huang','Zhou','Wu','Xu','Sun','Ma','Zhu','Hu','Guo','Lin','He','Gao','Luo']
const DISCIPLE_GIVEN    = ['Wei','Fang','Lei','Xiu','Jun','Yan','Ming','Hao','Ling','Tao','Qing','Yue','Rui','Shan','Bo','Xin','Chen','Ruo','Zhi','Han']
