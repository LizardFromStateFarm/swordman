// TALISMAN_* — graded Beast Taming Talismans and the tame-attempt rules (Phase 41, docs/systems/combat.md
// → "Tame talisman grades & tame attempts"). Data only.
// A talisman's grade sets the chance a tame attempt succeeds (none are guaranteed); a failed DIRECT attempt
// then turns into a fight or a clean escape, with the beast's nature weighting which. Used by:
// renderer/engine/game-state.js (tameEncounteredBeast / tameInfo / beastFightChoices / beastFightFinish),
// renderer/game.js (Roam → Beasts), renderer/game/beast-detail.js, renderer/game/combat.js, scripts/sim/*.

// Grade → its tame chance and the item that carries it. `crude` keeps the original item id so old saves work.
const TALISMAN_GRADES = {
  crude:    { id: 'crude',    name: 'Crude',    tameChance: 0.40, itemId: 'beast_taming_talisman' },
  fine:     { id: 'fine',     name: 'Fine',     tameChance: 0.55, itemId: 'beast_taming_talisman_fine' },
  superior: { id: 'superior', name: 'Superior', tameChance: 0.70, itemId: 'beast_taming_talisman_superior' },
  pristine: { id: 'pristine', name: 'Pristine', tameChance: 0.90, itemId: 'beast_taming_talisman_pristine' },
}
const TALISMAN_GRADE_ORDER = ['crude', 'fine', 'superior', 'pristine']

// A failed direct tame: fight (it turns on you) vs flee (it is gone). Nature decides the split —
// a fell man-eater attacks, a benign guardian bolts — and a vengeful returner presses, a cub breaks away.
const TAME_FIGHT_CHANCE_BASE = 0.5
const TAME_NATURE_FIGHT_MULT = { benign: 0.5, wild: 1.0, fell: 1.6 }
const TAME_FIGHT_CHANCE_MIN = 0.2
const TAME_FIGHT_CHANCE_MAX = 0.9
const TAME_MOOD_FIGHT_MOD = { vengeful: 0.2, cub: -0.2 }
