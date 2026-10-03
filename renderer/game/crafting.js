// Crafting system — thin wrapper used by game.js UI handlers.
// All state mutations are delegated to gameState methods.

class CraftingSystem {
  constructor(gs) {
    this._gs = gs
  }

  canCraft(recipeId) {
    const s = this._gs.get()
    const r = RECIPES.find(r => r.id === recipeId)
    if (!r) return false
    if (r.hidden && !this._gs.recipeKnown(recipeId)) return false   // Phase 44: an undiscovered formula
    return r.ingredients.every(i => (s.inventory[i.itemId] || 0) >= i.qty)
  }

  craft(recipeId, watched = false) { return this._gs.craftItem(recipeId, { watched }) }
  equip(itemId)      { return this._gs.equipItem(itemId)      }
  unequip(slot)      { return this._gs.unequipItem(slot)      }
  setPill(itemId)    { return this._gs.setActivePill(itemId)  }
  useElixir(itemId)  { return this._gs.useElixir(itemId)      }
  useHeal(itemId)    { return this._gs.useHealPill(itemId)    }   // Phase 44
  discard(itemId, n = 1) { return this._gs.discardItem(itemId, n) }   // Phase 21
  sell(itemId, n = 1)    { return this._gs.sellItem(itemId, n) }      // task 1.11
}
