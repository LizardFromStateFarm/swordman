// Enemy tiers — used in expedition power calculation.
// Used by: expedition.js (resolveExpedition)

const ENEMIES = [
  { tier: 1, name: 'Forest Beast',      nameCN: '凡兽',    hp: 100,  power: 10  },
  { tier: 2, name: 'Demon Beast',       nameCN: '妖兽',    hp: 250,  power: 25  },
  { tier: 3, name: 'Ancient Guardian',  nameCN: '古守',    hp: 600,  power: 60  },
  { tier: 4, name: 'Celestial Wraith',  nameCN: '天魂',    hp: 1500, power: 150 },
  { tier: 5, name: 'Void Entity',       nameCN: '虚空存在', hp: 5000, power: 500 },
]
