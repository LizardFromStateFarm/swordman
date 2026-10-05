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
  mirror_shard: {   // v1 add-on (bosses.md): the Mirror Wraith's only remains — a craft material for the Mirror-Soul Plate
    id: 'mirror_shard', name: 'Mirror Shard', nameCN: '镜魅碎片',
    desc: 'A sliver of the Wraith. Look into it and something looks back, wearing your face.',
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

  // ── Healing pills (Phase 44) — used from the pack to restore Health / Realm Integrity ──
  // effect.type 'heal' = consumed on use (not queued for a breakthrough). The three basic formulas are known from
  // the start; the stronger ones are discovered (a stranger on the road / a ring champion — see recipes.js).
  pill_mending: {
    id: 'pill_mending', name: 'Mending Pill', nameCN: '疗伤丹',
    desc: 'Restores 30 Health.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', health: 30 },
  },
  pill_blood_nourish: {
    id: 'pill_blood_nourish', name: 'Blood-Nourishing Pill', nameCN: '养血丹',
    desc: 'Restores 60 Health.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', health: 60 },
  },
  pill_spirit_stabilize: {
    id: 'pill_spirit_stabilize', name: 'Spirit-Settling Pill', nameCN: '定神丹',
    desc: 'Restores 45 Realm Integrity.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', integrity: 45 },
  },
  pill_soul_anchor: {
    id: 'pill_soul_anchor', name: 'Soul-Anchoring Pill', nameCN: '定魂丹',
    desc: 'Restores 45 Health and 25 Realm Integrity.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', health: 45, integrity: 25 },
  },
  pill_golden_marrow: {
    id: 'pill_golden_marrow', name: 'Golden Marrow Pill', nameCN: '金髓丹',
    desc: 'Restores 80 Health and 30 Realm Integrity.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', health: 80, integrity: 30 },
  },
  pill_nine_turn: {
    id: 'pill_nine_turn', name: 'Nine-Turn Restoration Pill', nameCN: '九转还魂丹',
    desc: 'Restores Health and Realm Integrity to their fullest.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', health: 999, integrity: 999 },
  },
  // v1 add-on (bosses.md): the Vermilion Bird's heart, pressed into a pill — only from the boss
  vermilion_ash_pill: {
    id: 'vermilion_ash_pill', name: 'Vermilion Ash Pill', nameCN: '朱雀灰丹',
    desc: 'Ash from a bird that will not stay dead. Restores Health and Realm Integrity to their fullest.',
    type: 'pill', stackable: true, category: 'pill',
    effect: { type: 'heal', health: 999, integrity: 999 },
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
  // Phase 44 — discovered weapons (a road encounter, or an Arena ring champion).
  weapon_dust_cleaver: {
    id: 'weapon_dust_cleaver', name: 'Dust Cleaver', nameCN: '尘刀',
    desc: '+10% Qi/s.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.10 },
  },
  weapon_whisper_dagger: {
    id: 'weapon_whisper_dagger', name: 'Feather-Whisper Dagger', nameCN: '轻语刃',
    desc: '+12% Qi/s.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.12 },
  },
  weapon_iron_bell_hammer: {
    id: 'weapon_iron_bell_hammer', name: 'Iron Bell Hammer', nameCN: '铁钟锤',
    desc: '+18% Qi/s.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.18 },
  },
  weapon_starfall_spear: {
    id: 'weapon_starfall_spear', name: 'Starfall Spear', nameCN: '陨星枪',
    desc: '+35% loot, +8% BT chance.',
    type: 'weapon', stackable: false, category: 'equip',
    effect: { type: 'void_blade', loot_mult: 1.35, bt_bonus: 0.08 },
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
  // Phase 44 — discovered artifacts (a road encounter, or an Arena ring champion).
  artifact_beast_whistle: {
    id: 'artifact_beast_whistle', name: 'Beast-Calling Whistle', nameCN: '唤兽哨',
    desc: 'BT chance +10%.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'bt_bonus', value: 0.10 },
  },
  artifact_jade_cicada: {
    id: 'artifact_jade_cicada', name: 'Jade Cicada', nameCN: '玉蝉',
    desc: 'Qi cap ×1.35.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'qi_cap_mult', value: 1.35 },
  },
  artifact_lotus_seat: {
    id: 'artifact_lotus_seat', name: 'Lotus Meditation Seat', nameCN: '莲台',
    desc: 'Qi/s ×1.4.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.4 },
  },
  // v1 add-on (bosses.md): crafted from the Mirror Wraith's shards; its formula is learned by taking the Wraith's heart
  artifact_mirror_soul_plate: {
    id: 'artifact_mirror_soul_plate', name: 'Mirror-Soul Plate', nameCN: '镜魂盘',
    desc: 'Qi/s ×1.5. A second self sits in it, cultivating when you do.',
    type: 'artifact', stackable: false, category: 'equip',
    effect: { type: 'qps_mult', value: 1.5 },
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
