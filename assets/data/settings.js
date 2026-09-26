// SETTINGS_DEFS — per-slot presentation settings shown in the ⚙ panel (Phase 20C). Used by game-state.js
// (defaults, validation, migration), renderer/game/settings.js (panel + apply) and scripts/sim (invariant).
// To add a setting: append an entry, then read s.settings.<id> where it matters. See docs/systems/settings.md.

const SETTINGS_DEFS = [
  { id: 'displayNumbers', label: 'Numbers', group: 'Display', type: 'choice', default: 'formatted',
    options: [{ value: 'raw', label: 'Raw' }, { value: 'formatted', label: '1.2K' }, { value: 'scientific', label: '1.2e3' }] },
  { id: 'fontSize', label: 'Panel text', group: 'Display', type: 'choice', default: 13,
    options: [{ value: 11, label: 'Small' }, { value: 13, label: 'Normal' }, { value: 15, label: 'Large' }] },
  { id: 'colorblind', label: 'Color vision', group: 'Display', type: 'choice', default: 'off',
    options: [{ value: 'off', label: 'Off' }, { value: 'deuteranopia', label: 'Deutan' }, { value: 'protanopia', label: 'Protan' }],
    hint: 'Red/green become vermillion/teal' },
  { id: 'bgOpacity', label: 'Background', group: 'Window', type: 'range', default: 1, min: 0.2, max: 1, step: 0.05,
    hint: 'Lower lets your desktop show through' },
  { id: 'animSpeed', label: 'Animation', group: 'Motion', type: 'choice', default: 1,
    options: [{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }] },
  { id: 'reducedMotion', label: 'Reduce motion', group: 'Motion', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }],
    hint: 'Hides particles and aura rings' },
  { id: 'canvasBrightness', label: 'Sprite glow', group: 'Motion', type: 'choice', default: 1,
    options: [{ value: 0.7, label: '70%' }, { value: 1, label: '100%' }, { value: 1.3, label: '130%' }] },
]
