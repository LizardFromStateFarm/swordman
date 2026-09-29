// All item types: resources, pills, elixirs, weapons, artifacts.
// Depended on by: locations.js (drop tables), recipes.js (ingredients/products),
//                 game-state.js (inventory logic, sell prices), expedition.js, crafting.js, game.js (Pack Sell)
//
// `category` (Phase 21, Pack tab filter chips): 'currency'|'mat'|'pill'|'equip'|'rare'|'key'.
// A second, independent enum from RECIPES[i].category — see docs/systems/backpack.md.

const ITEMS = {
  // ── Currency ────────────────────────────────────────────────────────────────
  spirit_stone: {
    id: 'spirit_stone', name: 'Spirit Stone', nameCN: '灵石',
    desc: 'Dense stone saturated with earth Qi. The currency of cultivators.',
    type: 'currency', stackable: true, category: 'currency',
  },

  // ── Resources ───────────────────────────────────────────────────────────────
  spirit_herb: {
    id: 'spirit_herb', name: 'Spirit Herb', nameCN: '灵草',
    desc: 'A common herb that hums with ambient Qi.',
    type: 'resource', stackable: true, category: 'mat',
  },
  beast_core: {
    id: 'beast_core', name: 'Beast Core', nameCN: '兽核',
    desc: 'Crystallized spiritual energy taken from a slain beast.',
    type: 'resource', stackable: true, category: 'mat',
  },
  iron_ore: {
    id: 'iron_ore', name: 'Iron Ore', nameCN: '铁矿',
    desc: 'Ore threaded with latent metal energy.',
    type: 'resource', stackable: true, category: 'mat',
  },
  demon_essence: {
    id: 'demon_essence', name: 'Demon Essence', nameCN: '妖精',
    desc: 'Distilled malice, taken from a slain demon.',
    type: 'resource', stackable: true, category: 'mat',
  },
  poison_herb: {
    id: 'poison_herb', name: 'Poison Herb', nameCN: '毒草',
    desc: 'A herb that kills as readily as it heals.',
    type: 'resource', stackable: true, category: 'mat',
  },
  artifact_fragment: {
    id: 'artifact_fragment', name: 'Artifact Fragment', nameCN: '遗器碎片',
    desc: 'A shard of an ancient artifact, still faintly resonant.',
    type: 'resource', stackable: true, category: 'mat',
  },
  ancient_script: {
    id: 'ancient_script', name: 'Ancient Script', nameCN: '古籍',
    desc: 'A parchment scribed in a forgotten celestial tongue.',
    type: 'resource', stackable: true, category: 'rare',
  },
  celestial_herb: {
    id: 'celestial_herb', name: 'Celestial Herb', nameCN: '仙草',
    desc: 'Grows only where heaven touches earth.',
    type: 'resource', stackable: true, category: 'mat',
  },
  heavenly_ore: {
    id: 'heavenly_ore', name: 'Heavenly Ore', nameCN: '天铁',
    desc: 'Forged in celestial furnaces. Sings in the presence of Qi.',
    type: 'resource', stackable: true, category: 'mat',
  },
  void_crystal: {
    id: 'void_crystal', name: 'Void Crystal', nameCN: '虚晶',
    desc: 'Holds nothing — and therefore holds everything.',
    type: 'resource', stackable: true, category: 'rare',
  },
  chaos_essence: {
    id: 'chaos_essence', name: 'Chaos Essence', nameCN: '混元精',
    desc: 'Formless matter from the void between realms.',
    type: 'resource', stackable: true, category: 'rare',
  },

  // ── Pills (consume on breakthrough attempt) ──────────────────────────────────
  pill_qi_refining: {
    id: 'pill_qi_refining', name: 'Qi Refining Pill', nameCN: '聚气丹',
    desc: '+10% breakthrough chance (1 use).',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'bt_bonus', value: 0.10 },
  },
  pill_foundation: {
    id: 'pill_foundation', name: 'Foundation Pill', nameCN: '筑基丹',
    desc: '+20% breakthrough chance (1 use).',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'bt_bonus', value: 0.20 },
  },
  pill_heart_calming: {
    id: 'pill_heart_calming', name: 'Heart Calming Pill', nameCN: '定心丹',
    desc: '-50% Qi lost on breakthrough failure; +30 Integrity restored (1 use).',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'qi_loss_reduce', value: 0.50, integrity_restore: 30 },
  },
  pill_golden_core: {
    id: 'pill_golden_core', name: 'Golden Core Pill', nameCN: '金丹',
    desc: '+30% BT chance, -80% Qi loss on failure (1 use).',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'bt_bonus', value: 0.30, qi_loss_reduce: 0.80 },
  },
  pill_heaven_defying: {
    id: 'pill_heaven_defying', name: 'Heaven Defying Pill', nameCN: '逆天丹',
    desc: 'Breakthrough always succeeds (1 use).',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'bt_guarantee' },
  },

  // ── Talismans (consumed on use) ──────────────────────────────────────────────
  // Phase 41: four grades, each with its own tame chance (TALISMAN_GRADES in talismans.js). None is guaranteed.
  beast_taming_talisman: {
    id: 'beast_taming_talisman', name: 'Crude Beast Taming Talisman', nameCN: '粗制驯兽符',
    desc: 'A rough charm. 40% to tame a wild beast. A failure may turn it on you, or lose it for good.',
    type: 'talisman', stackable: true, category: 'key',
    effect: { type: 'tame_beast', grade: 'crude' },
  },
  beast_taming_talisman_fine: {
    id: 'beast_taming_talisman_fine', name: 'Fine Beast Taming Talisman', nameCN: '精制驯兽符',
    desc: 'Careful brushwork. 55% to tame a wild beast.',
    type: 'talisman', stackable: true, category: 'key',
    effect: { type: 'tame_beast', grade: 'fine' },
  },
  beast_taming_talisman_superior: {
    id: 'beast_taming_talisman_superior', name: 'Superior Beast Taming Talisman', nameCN: '上品驯兽符',
    desc: 'Sealed in cinnabar. 70% to tame a wild beast.',
    type: 'talisman', stackable: true, category: 'key',
    effect: { type: 'tame_beast', grade: 'superior' },
  },
  beast_taming_talisman_pristine: {
    id: 'beast_taming_talisman_pristine', name: 'Pristine Beast Taming Talisman', nameCN: '极品驯兽符',
    desc: 'Drawn on spirit silk. 90% to tame a wild beast.',
    type: 'talisman', stackable: true, category: 'key',
    effect: { type: 'tame_beast', grade: 'pristine' },
  },

  // ── Elixirs (root reroll — consumed immediately) ─────────────────────────────
  elixir_muddy_root: {
    id: 'elixir_muddy_root', name: 'Muddy Root Elixir', nameCN: '浊根液',
    desc: 'Guarantees Mixed root on use.',
    type: 'elixir', stackable: true, category: 'pill',
    effect: { type: 'root_reroll', outcomes: [{ type: 'mixed', weight: 1 }] },
  },
  elixir_cleansing_root: {
    id: 'elixir_cleansing_root', name: 'Cleansing Root Elixir', nameCN: '洗筋液',
    desc: '50% Dual Root, 50% Mixed Root.',
    type: 'elixir', stackable: true, category: 'pill',
    effect: { type: 'root_reroll', outcomes: [{ type: 'dual', weight: 1 }, { type: 'mixed', weight: 1 }] },
  },
  elixir_pure_root: {
    id: 'elixir_pure_root', name: 'Pure Root Elixir', nameCN: '纯根丹',
    desc: '60% Pure, 35% Dual, 5% Heavenly.',
    type: 'elixir', stackable: true, category: 'pill',
    effect: { type: 'root_reroll', outcomes: [{ type: 'pure', weight: 12 }, { type: 'dual', weight: 7 }, { type: 'heavenly', weight: 1 }] },
  },
  elixir_heavenly_root: {
    id: 'elixir_heavenly_root', name: 'Heavenly Root Elixir', nameCN: '天根丹',
    desc: '40% Pure, 40% Heavenly, 20% Dual.',
    type: 'elixir', stackable: true, category: 'pill',
    effect: { type: 'root_reroll', outcomes: [{ type: 'pure', weight: 2 }, { type: 'heavenly', weight: 2 }, { type: 'dual', weight: 1 }] },
  },

  // ── Weapons (equip slot — passive) ───────────────────────────────────────────
  weapon_spirit_sword: {
    id: 'weapon_spirit_sword', name: 'Spirit Sword', nameCN: '灵剑',
    desc: '+15% Qi/s.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.15 },
  },
  weapon_soul_spear: {
    id: 'weapon_soul_spear', name: 'Soul Spear', nameCN: '魂枪',
    desc: '+25% expedition power.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'expedition_power', value: 0.25 },
  },
  weapon_thunder_staff: {
    id: 'weapon_thunder_staff', name: 'Thunder Staff', nameCN: '雷杖',
    desc: 'Enemies −20% HP.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'enemy_hp_reduce', value: 0.20 },
  },
  weapon_void_blade: {
    id: 'weapon_void_blade', name: 'Void Blade', nameCN: '虚刃',
    desc: '+50% loot, +20% BT chance.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'void_blade', loot_mult: 1.50, bt_bonus: 0.20 },
  },

  // ── Artifacts (equip slot — passive) ─────────────────────────────────────────
  artifact_jade_pendant: {
    id: 'artifact_jade_pendant', name: 'Jade Pendant', nameCN: '玉佩',
    desc: 'Qi cap ×1.2.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'qi_cap_mult', value: 1.2 },
  },
  artifact_soul_ring: {
    id: 'artifact_soul_ring', name: 'Soul Ring', nameCN: '魂环',
    desc: 'Qi/s ×1.3.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.3 },
  },
  artifact_heaven_talisman: {
    id: 'artifact_heaven_talisman', name: 'Heaven Talisman', nameCN: '天符',
    desc: 'BT chance +8% permanently.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'bt_bonus', value: 0.08 },
  },
  artifact_void_compass: {
    id: 'artifact_void_compass', name: 'Void Compass', nameCN: '虚空罗盘',
    desc: 'Unlocks hidden expedition locations.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'hidden_locations' },
  },
}

// ── Selling (task 1.11, Phase 42-0; docs/systems/backpack.md → "Selling") ──────────────────────────────────────
// Spirit Stones per unit for raw materials, roughly the stones the same run would drop. Crafted items have no entry:
// they sell for SELL_CRAFTED_FRACTION of their recipe's ingredients (so craft → sell never mints stones). Items with
// neither use SELL_DEFAULT_VALUE by category. Currency never sells. Used by game-state.js itemValue()/sellItem().
const ITEM_SELL_VALUE = {
  spirit_herb: 1, beast_core: 1, iron_ore: 2, poison_herb: 2, demon_essence: 3,
  artifact_fragment: 4, ancient_script: 6, celestial_herb: 6, heavenly_ore: 8,
  void_crystal: 12, chaos_essence: 15,
}
const SELL_CRAFTED_FRACTION = 0.6
const SELL_DEFAULT_VALUE = { mat: 1, rare: 5, pill: 2, equip: 5, key: 2 }
