// SCRIPTURES / CHALLENGES / COSMETIC_PETS / COSMETIC_CAVES — M8 cleanup (Phases 11B–C · 20A–B · 10 · 9C–D).
// Data only. Read by renderer/engine/game-state.js (loreInfo / challengeInfo / cosmeticInfo + _recalc) and the
// Character / Events UI. See docs/systems/world-flavor.md.

// ── Scripture Lore (11B–C): a codex unlocked as you climb. ──────────────────────────────────────────────────
const SCRIPTURES = [
  { id: 'breath',    name: 'The Scripture of Breath',      cn: '吐纳经', minStage: 0,
    text: 'Before the first realm, there is only the breath. Draw the world in; let the mortal dust go out.' },
  { id: 'foundation', name: 'The Foundation Sutra',        cn: '筑基经', minStage: 10,
    text: 'A tower is only as tall as its foot. Lay the foundation deep and the heavens may lean on it.' },
  { id: 'core',      name: 'The Golden Core Verses',       cn: '金丹篇', minStage: 13,
    text: 'Gather the scattered light into one seed. What is round cannot be broken by what is sharp.' },
  { id: 'soul',      name: 'The Nascent Soul Hymn',        cn: '元婴颂', minStage: 16,
    text: 'The soul is a second self, born of the first. Teach it to walk, and it will carry you out of the grave.' },
  { id: 'sever',     name: 'The Severing of Ties',         cn: '化神经', minStage: 19,
    text: 'To sever is not to hate. It is to set down a weight you have carried long enough.' },
  { id: 'ascend',    name: 'The Gate and the Key',         cn: '天关经', minStage: 22,
    text: 'The heavenly gate is not locked. It waits for a hand that has grown into the shape of the key.' },
]

// ── Challenge modes (20A–B): chosen at the start of a life, shaping the climb. ──────────────────────────────
const CHALLENGES = [
  { id: 'normal', name: 'The Open Road', desc: 'The standard climb. No modifier.', qi: 1.00, bt: 0.00 },
  { id: 'scorn',  name: "Heaven's Scorn", desc: 'The heavens frown: −10% Qi/s.', qi: 0.90, bt: 0.00 },
  { id: 'iron',   name: 'Iron Blood', desc: 'A harsher world: −20% Qi/s, but +5% breakthrough.', qi: 0.80, bt: 0.05 },
  { id: 'mortal', name: "A Mortal's Grit", desc: 'Hunger sharpens: +10% Qi/s, but −5% breakthrough.', qi: 1.10, bt: -0.05 },
]

// ── Cosmetics (10): a spirit pet and a cultivation cave (names only for now). ───────────────────────────────
const COSMETIC_PETS = [
  { id: 'none',   name: 'None' },
  { id: 'rabbit', name: 'Jade Rabbit', desc: 'A moon-pale rabbit that sleeps in your sleeve.' },
  { id: 'crane',  name: 'Paper Crane', desc: 'A folded crane that never creases and never lands.' },
  { id: 'fox',    name: 'Spirit Fox Kit', desc: 'Nine tails, one of them yours.' },
]
const COSMETIC_CAVES = [
  { id: 'none',     name: 'None' },
  { id: 'bamboo',   name: 'Bamboo Cave', desc: 'Green light, wind through hollow stems.' },
  { id: 'starfall', name: 'Starfall Grotto', desc: 'A ceiling of cold stars, close enough to touch.' },
  { id: 'cloud',    name: 'Cloud Hollow', desc: 'A cave that drifts a little each century.' },
]
