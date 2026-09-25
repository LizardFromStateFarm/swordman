// Expedition locations — timed runs that return resources.
// Depends on: items.js (drop table item ids)
// Used by: expedition.js, game-state.js (resolveExpedition)

const LOCATIONS = [
  {
    id: 'mortal_forest',
    name: 'Mortal Forest', nameCN: '凡人森林',
    desc: 'A spirit-thin wood haunted by ordinary beasts.',
    minStage: 0,
    duration: 60,
    enemyTier: 1,
    dropTable: [
      { itemId: 'spirit_herb',  weight: 5, minQty: 1, maxQty: 3 },
      { itemId: 'beast_core',   weight: 3, minQty: 1, maxQty: 2 },
      { itemId: 'spirit_stone', weight: 2, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: 'spirit_quarry',
    name: 'Spirit Stone Quarry', nameCN: '灵石矿场',
    desc: 'Deep veins of spirit stone guarded by puppet constructs.',
    minStage: 3,
    duration: 90,
    enemyTier: 1,
    dropTable: [
      { itemId: 'spirit_stone', weight: 5, minQty: 2, maxQty: 4 },
      { itemId: 'iron_ore',     weight: 4, minQty: 1, maxQty: 3 },
      { itemId: 'spirit_herb',  weight: 2, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: 'demon_marsh',
    name: 'Demon Marsh', nameCN: '妖魔沼泽',
    desc: 'A fetid wetland where demons nest between the reeds.',
    minStage: 6,
    duration: 120,
    enemyTier: 2,
    dropTable: [
      { itemId: 'demon_essence', weight: 4, minQty: 1, maxQty: 2 },
      { itemId: 'poison_herb',   weight: 4, minQty: 1, maxQty: 3 },
      { itemId: 'beast_core',    weight: 3, minQty: 1, maxQty: 2 },
      { itemId: 'spirit_stone',  weight: 1, minQty: 1, maxQty: 3 },
    ],
  },
  {
    id: 'ancient_ruins',
    name: 'Ancient Ruins', nameCN: '古代遗迹',
    desc: 'Crumbling halls of a civilization that touched the heavens.',
    minStage: 10,
    duration: 180,
    enemyTier: 3,
    dropTable: [
      { itemId: 'artifact_fragment', weight: 4, minQty: 1, maxQty: 2 },
      { itemId: 'ancient_script',    weight: 3, minQty: 1, maxQty: 2 },
      { itemId: 'spirit_stone',      weight: 2, minQty: 3, maxQty: 5 },
      { itemId: 'demon_essence',     weight: 1, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: 'heavenly_peak',
    name: 'Heavenly Peak', nameCN: '天峰',
    desc: 'A mountain piercing the clouds where immortals once trained.',
    minStage: 15,
    duration: 300,
    enemyTier: 4,
    dropTable: [
      { itemId: 'celestial_herb', weight: 4, minQty: 1, maxQty: 2 },
      { itemId: 'heavenly_ore',   weight: 4, minQty: 1, maxQty: 2 },
      { itemId: 'spirit_stone',   weight: 2, minQty: 4, maxQty: 8 },
      { itemId: 'ancient_script', weight: 1, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: 'void_rift',
    name: 'Void Rift', nameCN: '虚空裂缝',
    desc: 'A tear in reality itself. What waits inside defies description.',
    minStage: 19,
    duration: 600,
    enemyTier: 5,
    dropTable: [
      { itemId: 'void_crystal',  weight: 4, minQty: 1, maxQty: 3 },
      { itemId: 'chaos_essence', weight: 3, minQty: 1, maxQty: 2 },
      { itemId: 'heavenly_ore',  weight: 2, minQty: 1, maxQty: 2 },
      { itemId: 'spirit_stone',  weight: 1, minQty: 5, maxQty: 10 },
    ],
  },
]
