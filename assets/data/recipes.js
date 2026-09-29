// Crafting recipes grouped by category.
// Depends on: items.js (ingredient and product ids)
// Used by: crafting.js, game-state.js (craftItem)

const RECIPES = [
  // ── Pills ────────────────────────────────────────────────────────────────────
  {
    id: 'recipe_pill_qi_refining', category: 'pills', productId: 'pill_qi_refining',
    ingredients: [{ itemId: 'spirit_herb', qty: 2 }],
  },
  {
    id: 'recipe_pill_foundation', category: 'pills', productId: 'pill_foundation',
    ingredients: [{ itemId: 'spirit_herb', qty: 5 }, { itemId: 'beast_core', qty: 1 }],
  },
  {
    id: 'recipe_pill_heart_calming', category: 'pills', productId: 'pill_heart_calming',
    ingredients: [{ itemId: 'spirit_herb', qty: 3 }, { itemId: 'demon_essence', qty: 1 }],
  },
  {
    id: 'recipe_pill_golden_core', category: 'pills', productId: 'pill_golden_core',
    ingredients: [{ itemId: 'celestial_herb', qty: 10 }, { itemId: 'heavenly_ore', qty: 2 }],
  },
  {
    id: 'recipe_pill_heaven_defying', category: 'pills', productId: 'pill_heaven_defying',
    ingredients: [{ itemId: 'void_crystal', qty: 20 }, { itemId: 'chaos_essence', qty: 5 }],
  },

  // ── Elixirs ──────────────────────────────────────────────────────────────────
  {
    id: 'recipe_elixir_muddy_root', category: 'elixirs', productId: 'elixir_muddy_root',
    ingredients: [{ itemId: 'spirit_herb', qty: 3 }],
  },
  {
    id: 'recipe_elixir_cleansing_root', category: 'elixirs', productId: 'elixir_cleansing_root',
    ingredients: [{ itemId: 'spirit_herb', qty: 5 }, { itemId: 'beast_core', qty: 2 }],
  },
  {
    id: 'recipe_elixir_pure_root', category: 'elixirs', productId: 'elixir_pure_root',
    ingredients: [{ itemId: 'celestial_herb', qty: 10 }, { itemId: 'void_crystal', qty: 3 }],
  },
  {
    id: 'recipe_elixir_heavenly_root', category: 'elixirs', productId: 'elixir_heavenly_root',
    ingredients: [{ itemId: 'chaos_essence', qty: 20 }, { itemId: 'ancient_script', qty: 5 }],
  },

  // ── Weapons ──────────────────────────────────────────────────────────────────
  {
    id: 'recipe_weapon_spirit_sword', category: 'weapons', productId: 'weapon_spirit_sword',
    ingredients: [{ itemId: 'iron_ore', qty: 3 }],
  },
  {
    id: 'recipe_weapon_soul_spear', category: 'weapons', productId: 'weapon_soul_spear',
    ingredients: [{ itemId: 'iron_ore', qty: 5 }, { itemId: 'beast_core', qty: 2 }],
  },
  {
    id: 'recipe_weapon_thunder_staff', category: 'weapons', productId: 'weapon_thunder_staff',
    ingredients: [{ itemId: 'heavenly_ore', qty: 3 }],
  },
  {
    id: 'recipe_weapon_void_blade', category: 'weapons', productId: 'weapon_void_blade',
    ingredients: [{ itemId: 'heavenly_ore', qty: 5 }, { itemId: 'void_crystal', qty: 3 }],
  },

  // ── Artifacts ─────────────────────────────────────────────────────────────────
  {
    id: 'recipe_artifact_jade_pendant', category: 'artifacts', productId: 'artifact_jade_pendant',
    ingredients: [{ itemId: 'spirit_herb', qty: 2 }, { itemId: 'iron_ore', qty: 1 }],
  },
  {
    id: 'recipe_artifact_soul_ring', category: 'artifacts', productId: 'artifact_soul_ring',
    ingredients: [{ itemId: 'beast_core', qty: 3 }, { itemId: 'iron_ore', qty: 2 }],
  },
  {
    id: 'recipe_artifact_heaven_talisman', category: 'artifacts', productId: 'artifact_heaven_talisman',
    ingredients: [{ itemId: 'ancient_script', qty: 5 }],
  },
  {
    id: 'recipe_artifact_void_compass', category: 'artifacts', productId: 'artifact_void_compass',
    ingredients: [{ itemId: 'void_crystal', qty: 3 }],
  },

  // ── Talismans ─────────────────────────────────────────────────────────────────
  {
    id: 'recipe_talisman_beast_taming', category: 'talismans', productId: 'beast_taming_talisman',
    ingredients: [{ itemId: 'beast_core', qty: 5 }, { itemId: 'ancient_script', qty: 2 }],
  },
  {
    id: 'recipe_talisman_beast_taming_fine', category: 'talismans', productId: 'beast_taming_talisman_fine',
    ingredients: [{ itemId: 'beast_core', qty: 8 }, { itemId: 'ancient_script', qty: 3 }],
  },
  {
    id: 'recipe_talisman_beast_taming_superior', category: 'talismans', productId: 'beast_taming_talisman_superior',
    ingredients: [{ itemId: 'beast_core', qty: 12 }, { itemId: 'ancient_script', qty: 5 }, { itemId: 'void_crystal', qty: 1 }],
  },
  {
    id: 'recipe_talisman_beast_taming_pristine', category: 'talismans', productId: 'beast_taming_talisman_pristine',
    ingredients: [{ itemId: 'beast_core', qty: 20 }, { itemId: 'ancient_script', qty: 8 }, { itemId: 'void_crystal', qty: 3 }],
  },
]
