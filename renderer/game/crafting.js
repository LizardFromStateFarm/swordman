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
    return r.ingredients.every(i => (s.inventory[i.itemId] || 0) >= i.qty)
  }

  craft(recipeId)    { return this._gs.craftItem(recipeId)    }
  equip(itemId)      { return this._gs.equipItem(itemId)      }
  unequip(slot)      { return this._gs.unequipItem(slot)      }
  setPill(itemId)    { return this._gs.setActivePill(itemId)  }
  useElixir(itemId)  { return this._gs.useElixir(itemId)      }
}
