// DUELIST_LOOK — how a person you fight is dressed on the battle page (Phase 35 / A6-3a, docs/systems/combat.md): their
// temper → INK_PARTS slots (assets/sprites/ink-parts.js: face / hair / robe / weapon / aura), then role overrides.
// Their realm picks the INK_ART state (CULTIVATION_STAGES[].spriteState). Read by renderer/game/combat.js (duelistSlots).
// Data only.

const DUELIST_LOOK = {
  default:   { face: 'calm',     hair: 'bun',   robe: 'azure',     weapon: 'sword', aura: 'orbit' },
  arrogant:  { face: 'stern',    hair: 'crown', robe: 'crimson',   weapon: 'sword', aura: 'tempest' },
  coward:    { face: 'youthful', hair: 'rag',   robe: 'hemp',      weapon: 'none',  aura: 'still' },
  hotblood:  { face: 'youthful', hair: 'loose', robe: 'crimson',   weapon: 'sword', aura: 'tempest' },
  miser:     { face: 'stern',    hair: 'bun',   robe: 'hemp',      weapon: 'flute', aura: 'still' },
  glutton:   { face: 'calm',     hair: 'rag',   robe: 'moon',      weapon: 'none',  aura: 'orbit' },
  poet:      { face: 'calm',     hair: 'loose', robe: 'moon',      weapon: 'flute', aura: 'still' },
  stoic:     { face: 'stern',    hair: 'bun',   robe: 'ink',       weapon: 'sword', aura: 'still' },
  demonking: { face: 'stern',    hair: 'loose', robe: 'sovereign', weapon: 'sword', aura: 'tempest' },
  paranoid:  { face: 'stern',    hair: 'rag',   robe: 'ink',       weapon: 'flute', aura: 'orbit' },
  grumpy:    { face: 'stern',    hair: 'bun',   robe: 'hemp',      weapon: 'sword', aura: 'still' },
  lazy:      { face: 'calm',     hair: 'loose', robe: 'moon',      weapon: 'none',  aura: 'still' },
  niceguy:   { face: 'youthful', hair: 'bun',   robe: 'azure',     weapon: 'flute', aura: 'orbit' },
  psycho:    { face: 'youthful', hair: 'loose', robe: 'sovereign', weapon: 'sword', aura: 'tempest' },
  gremlin:   { face: 'youthful', hair: 'rag',   robe: 'crimson',   weapon: 'flute', aura: 'tempest' },
}

// A rival never wears your robe: if theirs matches, they take the next one in this order (combat.js duelistSlots).
const DUELIST_ROBES = ['azure', 'crimson', 'ink', 'moon', 'sovereign', 'hemp', 'celestial']

// Role overrides, applied after the temper: the clan head wears the jade crown; a branch head the sovereign black.
const DUELIST_ROLE_LOOK = {
  head:        { hair: 'crown' },
  branch_head: { robe: 'sovereign' },
  sect_master: { hair: 'crown', robe: 'sovereign' },   // Phase 43e: the master of the sect you belong to
}
