// Dev-only late-game test characters (shown on character select only when running unpackaged — `npm start`). Data only.
// Depends on: stages.js, techniques.js, items.js, beasts.js, sects.js, sect-buildings.js ids. Used by: game-state.js (buildDevSave), game.js (charselect).
// Fields: stageIndex · qiFrac (Qi as a fraction of the stage cap) · stones · karma · root · techniques ('all' = every one
// unlocked at that stage) · inventory · equipped · beasts [{ typeId, level, traits }] · sect (joined) · ownSect (founded) ·
// warInMinutes (first sect war / call to arms starts this soon, so the war UI can be tested right away).

const DEV_PRESETS = [
  {
    id: 'member_elder', name: 'Sect Elder (member wars)',
    desc: 'Nascent Soul Middle · Heaven Defying Sect Elder · 2 beasts · war call in 1 min',
    stageIndex: 17, qiFrac: 0.5, stones: 5000, karma: 60, root: 'pure',
    techniques: 'all',
    inventory: { pill_golden_core: 3, pill_heart_calming: 2, pill_foundation: 3, spirit_herb: 60, demon_essence: 8,
                 artifact_fragment: 4, void_crystal: 20, beast_taming_talisman: 1 },
    equipped: { weapon: 'weapon_spirit_sword', artifact: 'artifact_soul_ring' },
    beasts: [
      { typeId: 'void_hound',    level: 8, traits: ['soul_bond', 'swift', 'spirit_nose'] },
      { typeId: 'thunder_eagle', level: 6, traits: ['qi_devour', 'heavenly_instinct', 'iron_skin'] },
    ],
    sect: { id: 'heaven_defying', rank: 3, contribution: 1200 },
    warInMinutes: 1,
  },
  {
    id: 'founder', name: 'Sect Founder (own wars)',
    desc: 'Spirit Severing Early · own sect, all buildings, 12 disciples · 3 beasts · war in 1 min',
    stageIndex: 19, qiFrac: 0.3, stones: 8000, karma: 55, root: 'dual',
    techniques: 'all',
    inventory: { pill_golden_core: 3, pill_heart_calming: 2, spirit_herb: 120, demon_essence: 10,
                 artifact_fragment: 6, void_crystal: 30, heavenly_ore: 5, celestial_herb: 10 },
    equipped: { weapon: 'weapon_void_blade', artifact: 'artifact_heaven_talisman' },
    beasts: [
      { typeId: 'void_hound',    level: 10, traits: ['soul_bond', 'qi_devour', 'spirit_nose'] },
      { typeId: 'thunder_eagle', level: 8,  traits: ['swift', 'heavenly_instinct', 'iron_skin'] },
      { typeId: 'spirit_fox',    level: 6,  traits: ['soul_bond', 'spirit_nose', 'swift'] },
    ],
    ownSect: { name: 'Azure Cloud Peak', hallLevel: 3, buildings: 'all',
               disciples: [5, 5, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1], discipleLevel: 5 },
    warInMinutes: 1,
  },
  {
    id: 'pre_ascension', name: 'Pre-Ascension',
    desc: 'Spirit Severing Late with Qi near cap — one breakthrough from Ascension · founded sect',
    stageIndex: 21, qiFrac: 0.95, stones: 20000, karma: 70, root: 'heavenly',
    techniques: 'all',
    inventory: { pill_heaven_defying: 2, pill_golden_core: 5, pill_heart_calming: 3, spirit_herb: 200, demon_essence: 20,
                 artifact_fragment: 10, void_crystal: 60, heavenly_ore: 10, celestial_herb: 20, chaos_essence: 5 },
    equipped: { weapon: 'weapon_void_blade', artifact: 'artifact_heaven_talisman' },
    beasts: [
      { typeId: 'void_hound',    level: 15, traits: ['soul_bond', 'qi_devour', 'heavenly_instinct'] },
      { typeId: 'thunder_eagle', level: 12, traits: ['swift', 'spirit_nose', 'iron_skin'] },
      { typeId: 'spirit_fox',    level: 10, traits: ['soul_bond', 'spirit_nose', 'swift'] },
    ],
    ownSect: { name: 'Nine Heavens Pavilion', hallLevel: 4, buildings: 'all',
               disciples: [5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 1], discipleLevel: 8 },
    warInMinutes: 30,
  },
]
