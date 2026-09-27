// SETTINGS_DEFS — per-slot presentation settings shown in the Settings panel (Phase 20C). Used by game-state.js
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
  { id: 'banterFreq', label: 'Chatter', group: 'Banter', type: 'choice', default: 'normal',
    options: [{ value: 'off', label: 'Off' }, { value: 'rare', label: 'Rare' }, { value: 'normal', label: 'Norm' }, { value: 'chatty', label: 'Chatty' }] },
  { id: 'profanity', label: 'Swearing', group: 'Banter', type: 'choice', default: 'uncensored',
    options: [{ value: 'uncensored', label: 'Uncut' }, { value: 'masked', label: 'F***' }] },
  { id: 'animSpeed', label: 'Animation', group: 'Motion', type: 'choice', default: 1,
    options: [{ value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }] },
  { id: 'reducedMotion', label: 'Reduce motion', group: 'Motion', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }],
    hint: 'Hides particles and aura rings' },
  { id: 'canvasBrightness', label: 'Sprite glow', group: 'Motion', type: 'choice', default: 1,
    options: [{ value: 0.7, label: '70%' }, { value: 1, label: '100%' }, { value: 1.3, label: '130%' }] },
  // Phase 9A: close-button behavior (main.js reads this indirectly — the renderer branches on it).
  // Own group (not 'Window') so it doesn't reopen that section non-contiguously in the panel — see
  // renderer/game/settings.js render(): a group header prints whenever def.group differs from the
  // previous entry's, so appending to a name already used earlier in the array duplicates the header.
  // Was 'closeAction' (default tray) until 1.8b-1; renamed so old saves get the new default (user 2026-09-26:
  // ✕ quits, like any app). The old key is dropped by game-state's unknown-settings cleanup.
  { id: 'closeButton', label: 'Close button', group: 'Desktop', type: 'choice', default: 'quit',
    options: [{ value: 'quit', label: 'Quit' }, { value: 'tray', label: 'Hide to tray' }],
    hint: 'Hide to tray keeps cultivating in the background; quit it from the tray icon' },
  // Phase 9B: opt-in desktop notifications, ALL off by default (pillar 4 — never punish absence).
  // Only fire while the window is hidden/minimized/unfocused; see renderer/game/notifications.js.
  { id: 'notifyBreakthrough', label: 'Breakthrough ready', group: 'Notifications', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  { id: 'notifyExpedition', label: 'Expedition returned', group: 'Notifications', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  { id: 'notifyWar', label: 'War news', group: 'Notifications', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  { id: 'notifyBeastTamed', label: 'Beast tamed', group: 'Notifications', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
  { id: 'notifyDeath', label: 'Life has ended', group: 'Notifications', type: 'choice', default: false,
    options: [{ value: false, label: 'Off' }, { value: true, label: 'On' }] },
]
