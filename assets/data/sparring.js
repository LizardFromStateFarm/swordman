// SPARRING — no-Qi body training (user 2026-11-26). A non-lethal bout with a villager/peer, available from the
// first life: no cultivation Qi, a little Health, body XP win or lose, never kills (Health floors at 1). Data only.
// Read by renderer/engine/game-state.js (sparringInfo / spar / _sparChance) and renderer/game/body-view.js.
const SPARRING = {
  cooldownSecs: 45,        // real seconds between bouts
  healthCost: 6,           // bruising cushion you need before you can start
  winXp: 26,               // base body XP on a win, before opponent × tier scaling
  loseXp: 11,              // base on a loss (you still learn)
  opponents: [
    { id: 'village',     name: 'Village Youths',      desc: 'The other youths of the village, rough and grinning.', minTier: 0, xpMult: 1.0, chance: 0.62, hurt: [3, 7] },
    { id: 'hunter',      name: 'The Old Hunter',      desc: 'A weathered hunter who has wrestled worse than you.',  minTier: 1, xpMult: 1.5, chance: 0.55, hurt: [5, 11] },
    { id: 'drillmaster', name: 'The Drill Master',    desc: 'A retired soldier who corrects your stance with a stick.', minTier: 2, xpMult: 2.2, chance: 0.48, hurt: [8, 16] },
    { id: 'wanderer',    name: 'A Passing Cultivator', desc: 'A wandering cultivator deigns to test your body.',       minTier: 3, xpMult: 3.2, chance: 0.40, hurt: [12, 22] },
  ],
}
