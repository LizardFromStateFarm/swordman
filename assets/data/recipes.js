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

  // ── Healing pills (Phase 44) ─────────────────────────────────────────────────
  // The first three are known from the start. `hidden: true` formulas must be found (see RECIPE_DISCOVERY below).
  {
    id: 'recipe_pill_mending', category: 'pills', productId: 'pill_mending',
    ingredients: [{ itemId: 'spirit_herb', qty: 3 }, { itemId: 'beast_core', qty: 1 }],
  },
  {
    id: 'recipe_pill_blood_nourish', category: 'pills', productId: 'pill_blood_nourish',
    ingredients: [{ itemId: 'spirit_herb', qty: 2 }, { itemId: 'demon_essence', qty: 1 }, { itemId: 'beast_core', qty: 1 }],
  },
  {
    id: 'recipe_pill_spirit_stabilize', category: 'pills', productId: 'pill_spirit_stabilize',
    ingredients: [{ itemId: 'spirit_herb', qty: 2 }, { itemId: 'poison_herb', qty: 1 }],
  },
  {
    id: 'recipe_pill_soul_anchor', category: 'pills', productId: 'pill_soul_anchor', hidden: true,
    ingredients: [{ itemId: 'spirit_herb', qty: 4 }, { itemId: 'demon_essence', qty: 1 }, { itemId: 'beast_core', qty: 1 }],
  },
  {
    id: 'recipe_pill_golden_marrow', category: 'pills', productId: 'pill_golden_marrow', hidden: true,
    ingredients: [{ itemId: 'celestial_herb', qty: 6 }, { itemId: 'heavenly_ore', qty: 2 }, { itemId: 'beast_core', qty: 1 }],
  },
  {
    id: 'recipe_pill_nine_turn', category: 'pills', productId: 'pill_nine_turn', hidden: true,
    ingredients: [{ itemId: 'celestial_herb', qty: 5 }, { itemId: 'heavenly_ore', qty: 2 }, { itemId: 'chaos_essence', qty: 1 }],
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
  // Phase 44 — discovered weapons
  {
    id: 'recipe_weapon_dust_cleaver', category: 'weapons', productId: 'weapon_dust_cleaver', hidden: true,
    ingredients: [{ itemId: 'iron_ore', qty: 2 }, { itemId: 'beast_core', qty: 1 }],
  },
  {
    id: 'recipe_weapon_whisper_dagger', category: 'weapons', productId: 'weapon_whisper_dagger', hidden: true,
    ingredients: [{ itemId: 'iron_ore', qty: 4 }, { itemId: 'spirit_herb', qty: 1 }],
  },
  {
    id: 'recipe_weapon_iron_bell_hammer', category: 'weapons', productId: 'weapon_iron_bell_hammer', hidden: true,
    ingredients: [{ itemId: 'iron_ore', qty: 6 }, { itemId: 'beast_core', qty: 2 }],
  },
  {
    id: 'recipe_weapon_starfall_spear', category: 'weapons', productId: 'weapon_starfall_spear', hidden: true,
    ingredients: [{ itemId: 'heavenly_ore', qty: 4 }, { itemId: 'void_crystal', qty: 2 }],
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
  // Phase 44 — discovered artifacts
  {
    id: 'recipe_artifact_beast_whistle', category: 'artifacts', productId: 'artifact_beast_whistle', hidden: true,
    ingredients: [{ itemId: 'beast_core', qty: 3 }, { itemId: 'iron_ore', qty: 2 }],
  },
  {
    id: 'recipe_artifact_jade_cicada', category: 'artifacts', productId: 'artifact_jade_cicada', hidden: true,
    ingredients: [{ itemId: 'celestial_herb', qty: 2 }, { itemId: 'void_crystal', qty: 1 }],
  },
  {
    id: 'recipe_artifact_lotus_seat', category: 'artifacts', productId: 'artifact_lotus_seat', hidden: true,
    ingredients: [{ itemId: 'void_crystal', qty: 3 }, { itemId: 'ancient_script', qty: 2 }],
  },
  // v1 add-on (bosses.md): taught by the Mirror Wraith's heart (bossFightFinish 'heart'), never by RECIPE_DISCOVERY
  {
    id: 'recipe_artifact_mirror_soul_plate', category: 'artifacts', productId: 'artifact_mirror_soul_plate', hidden: true,
    ingredients: [{ itemId: 'mirror_shard', qty: 2 }, { itemId: 'void_crystal', qty: 2 }],
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

// ── Phase 44: how the discovery-gated recipes (RECIPES[i].hidden) are found ────────────────────────────────────
// A hidden recipe is unknown until found — the Craft tab shows a locked "Unknown formula" card with a hint.
//   encounter — a stranger met on the road (Roam → Explore) can teach it (help them) or lose it (rob them)
//   arena     — a ring champion guards it; beating them for the ring's title teaches it
// Used by: game-state.js (_blankRecipes / recipeSource / _rollHiddenRecipe / learnEncounterRecipe / _arenaBoutEnd).
const RECIPE_DISCOVERY = {
  encounter: [
    'recipe_pill_soul_anchor',
    'recipe_weapon_whisper_dagger',
    'recipe_weapon_starfall_spear',
    'recipe_artifact_beast_whistle',
  ],
  arena: {
    dust:   'recipe_weapon_dust_cleaver',
    iron:   'recipe_weapon_iron_bell_hammer',
    jade:   'recipe_artifact_jade_cicada',
    golden: 'recipe_pill_golden_marrow',
    lotus:  'recipe_artifact_lotus_seat',
    heaven: 'recipe_pill_nine_turn',
  },
  boss: ['recipe_artifact_mirror_soul_plate'],   // v1 add-on: taught only by a legendary boss's heart (bosses.md)
  encounterChance: 0.06,   // per expedition return: a stranger carrying a formula (only if one is still unknown)
  arenaWinChance:  0.10,   // per Arena win: a random unknown formula turns up (the champion's is guaranteed)
  robStones:       25,     // robbing the stranger instead: quick Spirit Stones, the formula is lost
  robKarma:        -6,
}

// Phase 44 — flavour lines for a road encounter that carries a formula (Roam → Explore). {person} is not a token;
// the line follows "At <place>, <Name> …".
const RECIPE_ENCOUNTER_TEXT = [
  'sits by a dead fire nursing a burned arm, a pill-furnace at their side',
  'is a travelling alchemist whose satchel reeks of roots and cinnabar',
  'was a sect\'s pill master once, and will not say why they left',
  'offers to trade a formula for a night\'s protection on the road',
]
