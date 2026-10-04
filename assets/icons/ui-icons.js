// Review score: 7.0 asset / 7.2 in context (2026-09-27, 1.8d-2, 3 cycles, accepted by the user)
// UI_ICONS — the custom UI icon set (roadmap 1.8d): name → inner SVG markup for a 24×24 viewBox. Monochrome line-art:
// every shape strokes in `currentColor` (1.6 stroke, round caps, set by .ic in styles.css); `class="f"` marks a
// filled part. Replaces emoji and chrome CJK in the UI (CLAUDE.md → Game Design Rules). Data only.
// Used by renderer/game/icons.js (Icon()) and scripts/smoke/scenarios/icons.js (contact sheet). Doc: docs/systems/icons.md
// (Kept as JS rather than an .svg sprite: an external <use href> is blocked on file:// in Electron, and a JS table
// works the same in Electron, Capacitor and the smoke tests.)

const UI_ICONS = {
  // ── Window chrome ────────────────────────────────────────────────────────────────────────────
  close:    '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  more:     '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3"/>',
  back:     '<path d="M9 5.5 4 10.5l5 5"/><path d="M4 10.5h10a5 5 0 0 1 0 10h-3"/>',
  window:   '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18"/><circle class="f" cx="6" cy="6.8" r=".9"/>',
  strip:    '<rect x="2.5" y="9" width="19" height="6" rx="1.8"/><path d="M6 12h5"/><circle class="f" cx="17.5" cy="12" r="1"/>',
  expand:   '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="10" width="6" height="4" rx="1" opacity=".55"/>',
  grip:     '<path d="M20 9 9 20M20 14.5 14.5 20M20 19.5l-.5.5"/>',
  pin:      '<path d="M9 3.5h6l-1.2 5.5 3.7 3.5h-11L10.2 9z"/><path d="M12 12.5V21"/>',
  settings: '<path d="M9.91 5.32L10.26 2.86L13.74 2.86L14.09 5.32L16.74 6.85L19.04 5.92L20.78 8.94L18.83 10.47L18.83 13.53L20.78 15.06L19.04 18.08L16.74 17.15L14.09 18.68L13.74 21.14L10.26 21.14L9.91 18.68L7.26 17.15L4.96 18.08L3.22 15.06L5.17 13.53L5.17 10.47L3.22 8.94L4.96 5.92L7.26 6.85Z"/><circle cx="12" cy="12" r="3"/>',

  // ── Layout modes (the ▣ picker) ──────────────────────────────────────────────────────────────
  'layout-overlay':  '<rect x="7" y="2.5" width="10" height="19" rx="1.6"/><path d="M7 6.5h10"/><path d="M9.5 15h5M9.5 18h3" opacity=".6"/>',
  'layout-expanded': '<rect x="2.5" y="5" width="19" height="14" rx="1.6"/><path d="M9.5 5v14"/><path d="M12.5 9.5h6M12.5 13h4" opacity=".6"/>',
  'layout-desktop':  '<rect x="2.5" y="4" width="19" height="12.5" rx="1.6"/><path d="M12 16.5V20M8.5 20.5h7"/>',

  // ── Play mode ────────────────────────────────────────────────────────────────────────────────
  idle:     '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z"/><path d="M16 4.5v2.4M14.8 5.7h2.4" opacity=".7"/>',
  active:   '<path d="M12 2.8c1.2 3.6 5.5 5.6 5.5 10.4a5.5 5.5 0 0 1-11 0c0-2.3 1.2-3.9 2.5-4.9.2 1.7 1 2.8 2.2 3.3-.7-3.1 0-5.9.8-8.8z"/><path d="M12 18.6a1.9 1.9 0 0 1-1.9-1.9c0-1.2 1-1.9 1.9-3.1.9 1.2 1.9 1.9 1.9 3.1a1.9 1.9 0 0 1-1.9 1.9z" opacity=".65"/>',

  // ── Cultivator readout (HUD) ─────────────────────────────────────────────────────────────────
  meditate: '<circle cx="12" cy="5" r="2.2"/><path d="M12 8.2c-2.3 0-3.6 1.3-4.2 3.3L6.6 16M12 8.2c2.3 0 3.6 1.3 4.2 3.3l1.2 4.5"/><path d="M9 15.6l3 1.2 3-1.2"/><path d="M3.5 19c2.8-2.3 14.2-2.3 17 0"/><path d="M6.5 21h11" opacity=".55"/>',
  qi:       '<path d="M3 8.5h10a3 3 0 1 0-3-3"/><path d="M3 15.5h13.5a3 3 0 1 1-3 3"/><path d="M3 12h16.5a2.2 2.2 0 1 0-2.2-2.2" opacity=".75"/>',
  lineage:  '<path d="M8.5 17V7.5a3.5 3.5 0 0 1 7 0V17"/><path d="M6.5 17h11v3.5h-11z"/><path d="M12 8v6.5"/>',
  integrity:'<path d="M3 20.5h18V16h-2.5v-4h-3V7.5h-7V12h-3v4H3z"/>',
  health:   '<path d="M12 3c3.2 4.6 6.2 7.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 10.6 8.8 7.6 12 3z"/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.4 2.8" opacity=".7"/>',
  stone:    '<path d="M8 4.5h7.5l4.5 5.5-3.2 9H8.2L4 12.2z"/><path d="M9.3 8.3l1.6-1.6" opacity=".8"/>',
  crystal:  '<path d="M12 2.5l4.5 6.5L12 21.5 7.5 9z"/><path d="M7.5 9h9M10 9l2 12.5L14 9" opacity=".6"/>',
  age:      '<path d="M5 3h14M5 21h14"/><path d="M7 3v2.8c0 3 5 4.3 5 6.2s-5 3.2-5 6.2V21M17 3v2.8c0 3-5 4.3-5 6.2s5 3.2 5 6.2V21"/><path class="f" d="M9.3 19.6c.6-1.6 1.7-2.4 2.7-2.9 1 .5 2.1 1.3 2.7 2.9z"/>',
  breakthrough: '<path d="M12 7.2l4.8 4.8-4.8 4.8L7.2 12z"/><path d="M12.6 7.8 11.2 11l1.8 1.3-1 3.9"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" opacity=".75"/>',
  why:      '<path d="M8.8 8.8a3.3 3.3 0 1 1 4.7 3c-1 .5-1.5 1.3-1.5 2.6"/><path d="M12 18.4v.1" stroke-width="2.4"/>',
  explore:  '<path d="M2.5 20 9 8.5l3.8 6.2 2.7-3.7L21.5 20z"/><path d="M7.4 11.3 9 12.8l1.6-1.5" opacity=".6"/><circle cx="17.5" cy="5.5" r="1.6" opacity=".7"/>',

  // ── Items, gear, actions ─────────────────────────────────────────────────────────────────────
  sword:    '<path d="M20.5 3.5 10 14l-1.5-1.5L19 2z"/><path d="M6.5 11.5l6 6"/><path d="M9.5 14.5l-5 5"/><circle cx="3.9" cy="20.1" r="1"/>',
  pendant:  '<path d="M10.6 4.2a1.4 1.4 0 1 1 2.8 0"/><path d="M12 5.6v1.6"/><circle cx="12" cy="13.8" r="6.3"/><circle cx="12" cy="13.8" r="2.9"/>',
  duel:     '<path d="M4 4l10.5 10.5M20 4 9.5 14.5"/><path d="M12.8 16.4l3.2-3.2M11.2 16.4 8 13.2"/><path d="M15.8 15.8l4 4M8.2 15.8l-4 4"/>',
  auto:     '<path d="M19.8 11a8 8 0 0 0-14-4.6M4.2 13a8 8 0 0 0 14 4.6"/><path d="M5.2 2.8v3.8H9M18.8 21.2v-3.8H15"/><circle class="f" cx="12" cy="12" r="1.5"/>',
  furnace:  '<path d="M4.5 9h15l-1.3 7.2a2.4 2.4 0 0 1-2.4 2H8.2a2.4 2.4 0 0 1-2.4-2z"/><path d="M7 9V6.2M17 9V6.2M5.5 6.2h3M15.5 6.2h3"/><path d="M8.3 18.2l-1 3.3M15.7 18.2l1 3.3"/>',
  scroll:   '<path d="M4.5 5v14M19.5 5v14" stroke-width="2.4"/><path d="M4.5 7h15M4.5 17h15"/><path d="M8 10.5h8M8 13.5h5"/>',
  token:    '<path d="M6 5h4.5v2h3V5H18v14.5H6z"/><path d="M12 10v6"/>',
  lock:     '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.3v2.4"/>',
  play:     '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  pause:    '<path d="M9 5.5v13M15 5.5v13"/>',

  // ── People, clan, sect, war (1.8d-2) ─────────────────────────────────────────────────────────
  'strip-back': '<rect x="2.5" y="14" width="19" height="6" rx="1.8"/><path d="M9 3.5 5 7.5l4 4"/><path d="M5 7.5h9a4 4 0 0 1 4 4v1"/>',
  bond: '<path d="M12 11c-1.8-2.6-3.6-3.9-5.4-3.9a3.9 3.9 0 0 0 0 7.8c1.8 0 3.6-1.3 5.4-3.9zm0 0c1.8 2.6 3.6 3.9 5.4 3.9a3.9 3.9 0 0 0 0-7.8c-1.8 0-3.6 1.3-5.4 3.9z"/><path d="M17.4 14.9l1.4 5.1M6.6 14.9 5.2 20"/>',
  rings: '<circle cx="9" cy="14" r="5.3"/><circle cx="15" cy="14" r="5.3"/><path d="M15 4.2l1.4 1.6L15 7.4l-1.4-1.6z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  couple: '<circle cx="8.5" cy="8" r="2.6"/><circle cx="15.5" cy="8" r="2.6"/><path d="M3.5 19.5a5 5 0 0 1 10 0M10.5 19.5a5 5 0 0 1 10 0"/>',
  child: '<circle cx="12" cy="8.5" r="2.6"/><path d="M12 5.9c.2-1.3 1.2-2.2 2.6-2.3" opacity=".7"/><path d="M8 20v-3.8a4 4 0 0 1 8 0V20"/>',
  person: '<circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0"/>',
  disciple: '<circle cx="10" cy="7.5" r="3.2"/><path d="M3.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M19 7.5v5M16.5 10h5"/>',
  crown: '<path d="M6.5 16a5.5 5.5 0 0 1 11 0z"/><path d="M3 12.5h18"/><path d="M12 10.5V7"/><circle cx="12" cy="5.6" r="1.4"/><path d="M5 19.5h14" opacity=".7"/>',
  branch: '<path d="M12 21V5.8M12 13.5 7.7 8.6M12 16l4.3-5.4"/><circle cx="12" cy="4.2" r="1.6"/><circle cx="6.6" cy="7.4" r="1.6"/><circle cx="17.4" cy="9.4" r="1.6"/>',
  split: '<path d="M12 21v-7L6.5 8.5M12 14l5.5-5.5"/><path d="M6 13V8h5M18 13V8h-5"/>',
  unbond: '<path d="M9.8 11c-1.6-2.3-3.2-3.4-4.8-3.4a3.4 3.4 0 0 0 0 6.8c1.6 0 3.2-1.1 4.8-3.4zM14.2 11c1.6 2.3 3.2 3.4 4.8 3.4a3.4 3.4 0 0 0 0-6.8c-1.6 0-3.2 1.1-4.8 3.4z"/><path d="M12 5.5v2M12 14.5v2" opacity=".6"/>',
  mantle: '<path d="M9 3.5 3.5 8v6.5l4-1.5L6 21h12l-1.5-8 4 1.5V8L15 3.5"/><path d="M9 3.5l3 4.5 3-4.5"/><path d="M7.8 12.5h8.4" opacity=".6"/>',
  flag: '<path d="M5.5 21V3.5"/><path d="M5.5 4.5h12l-2.5 4 2.5 4h-12"/>',
  beast: '<path d="M12 20.5c-2.8 0-5-1.6-5-3.8 0-2.3 2.3-4.2 5-4.2s5 1.9 5 4.2c0 2.2-2.2 3.8-5 3.8z"/><circle cx="5.8" cy="10.8" r="1.7"/><circle cx="9.5" cy="6.8" r="1.8"/><circle cx="14.5" cy="6.8" r="1.8"/><circle cx="18.2" cy="10.8" r="1.7"/>',
  frost: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M10 4.8 12 6.5l2-1.7M10 19.2l2-1.7 2 1.7" opacity=".7"/>',
  hall: '<path d="M6 7.8c1.2.1 2.2-.3 3-1.1L12 4l3 2.7c.8.8 1.8 1.2 3 1.1"/><path d="M2.5 12.3c1.8.2 3.2-.4 4-1.5h11c.8 1.1 2.2 1.7 4 1.5"/><path d="M9 7.5v3.3M15 7.5v3.3"/><path d="M6.5 12v8.5M17.5 12v8.5M4 20.5h16"/><path d="M10 20.5v-4.5h4v4.5"/>',
  gate: '<path d="M2.5 7.5c2.5.5 4-.3 5-1.8h9c1 1.5 2.5 2.3 5 1.8"/><path d="M5 9.5h14"/><path d="M7 9.5V21M17 9.5V21M5.5 21h3M15.5 21h3"/><path d="M10 10.5h4V13h-4z" opacity=".7"/>',
  rise: '<path d="M6 12.5l6-6 6 6M6 18.5l6-6 6 6"/>',
  chest: '<path d="M4 10h16v10H4z"/><path d="M4 10V8.5A3.5 3.5 0 0 1 7.5 5h9A3.5 3.5 0 0 1 20 8.5V10"/><path d="M10.5 12h3v3h-3z"/>',
  pill: '<path d="M12 21.5a5.8 5.8 0 0 1-4-10A3.3 3.3 0 0 1 12 6.5a3.3 3.3 0 0 1 4 5 5.8 5.8 0 0 1-4 10z"/><path d="M12 6.5V4.3M10.5 3.8h3"/><path d="M9.3 11.5h5.4" opacity=".6"/>',
  shield: '<path d="M12 3 5 5.8v5.4c0 4.5 3 7.7 7 9.8 4-2.1 7-5.3 7-9.8V5.8z"/><path d="M12 7v10" opacity=".55"/>',
  lotus: '<path d="M12 5c2 2.2 2.6 5.6 0 10-2.6-4.4-2-7.8 0-10z"/><path d="M12 15c-3.5.2-6.6-1.8-7.5-5 3.2-.3 5.8 1 7.5 5zM12 15c3.5.2 6.6-1.8 7.5-5-3.2-.3-5.8 1-7.5 5z"/><path d="M4.5 18.5c2.7 1.3 12.3 1.3 15 0" opacity=".6"/>',
  cloud: '<path d="M5.5 17h12.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A4.2 4.2 0 0 0 5.5 17z"/><path d="M9.5 14.2a1.9 1.9 0 1 1 1.9 1.9" opacity=".6"/>',
  lightning: '<path d="M13.5 2.5 6 13.5h5.5L10 21.5l8-11.5h-5.5z"/>',
  dantian: '<circle cx="12" cy="12" r="8.5"/><path d="M7 11.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0"/><path d="M8.5 15c1.2-.9 2.3-.9 3.5 0s2.3.9 3.5 0" opacity=".6"/>',
  vein: '<path d="M12 3c3.2 4.6 6.2 7.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 10.6 8.8 7.6 12 3z"/><path d="M12 19v-6.5M12 15.5l-2.4-2.4M12 13.5l2.4-2.4" opacity=".7"/>',
  mask: '<path d="M4 5.5c2.7 1 5.3 1 8 0 2.7 1 5.3 1 8 0v6c0 5-3.6 8.5-8 9-4.4-.5-8-4-8-9z"/><path d="M7.5 11l2.3.8M16.5 11l-2.3.8"/><path d="M10 16c1.3.7 2.7.7 4 0" opacity=".7"/>',
  root: '<path d="M12 9C12 6 10 4 7 4c0 3 2 5 5 5zM12 9c0-3 2-5 5-5 0 3-2 5-5 5z"/><path d="M12 9v6"/><path d="M5 15h14"/><path d="M12 15v5M12 17.2l-3 2.8M12 17.2l3 2.8"/>',
  tea: '<path d="M5.5 12.5h13c0 3.8-2.9 6.3-6.5 6.3s-6.5-2.5-6.5-6.3z"/><path d="M6.5 11a5.5 2.8 0 0 1 11 0"/><circle cx="12" cy="7.2" r="1"/><path d="M3.5 20.5h17"/>',
  gift: '<path d="M4.5 11h15v9.5h-15zM3.5 7.5h17V11h-17z"/><path d="M12 7.5v13"/><path d="M12 7.5c-1.5-3-5-3.5-5-1.5S10 7.5 12 7.5zm0 0c1.5-3 5-3.5 5-1.5S14 7.5 12 7.5z"/>',
  lantern: '<path d="M12 2v2"/><path d="M7 9c0-2.6 2.2-4.5 5-4.5s5 1.9 5 4.5v4c0 2.6-2.2 4.5-5 4.5S7 15.6 7 13z"/><path d="M7.3 9.5h9.4M7.3 12.5h9.4" opacity=".7"/><path d="M12 17.5V22M10.5 22h3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v6"/><path d="M12 16.6v.1" stroke-width="2.4"/>',
  veil: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 20 4"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',   // 4.7: a pinned person (filled via .on)
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',   // 4.7: World → People's search
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  speech: '<path d="M4 5.5h16V16h-9.5L6 20v-4H4z"/><path d="M8 9.5h8M8 12.5h5" opacity=".6"/>',
  skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.3 3 5.3V19h9v-3.2c1.7-1 3-2.7 3-5.3A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10.5 19v2.5M13.5 19v2.5" opacity=".7"/>',
  yield: '<path d="M6 21V3.5"/><path d="M6 4.5h6.5c.6 3.2.2 7-1.6 10.6-1.4-1.3-3-2-4.9-2.3"/>',
  broken: '<path d="M20.5 3.5 14.3 9.7"/><path d="M11.7 12.3 8 16"/><path d="M5 13l6 6M8 16l-3.5 3.5"/><path d="M13.3 9.2l.4 2-2 .5" opacity=".7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  ring: '<circle cx="12" cy="12" r="5"/>',
  heir: '<path d="M12 3c.8 5 2 6.4 7 7.5-5 1.1-6.2 2.5-7 7.5-.8-5-2-6.4-7-7.5 5-1.1 6.2-2.5 7-7.5z"/><path d="M18.5 17.5v3M17 19h3" opacity=".6"/>',
  // Phase 40: Soul Points — an orb with an ember core, wisps rising off it
  soul: '<circle cx="12" cy="15.5" r="5.5"/><circle class="f" cx="12" cy="15.5" r="1.7"/><path d="M12 10c-.2-2.6 1.8-3.4 1.4-6.5M8.6 11.3c-1-1.7-.3-3.3-1-5.2M15.6 11.4c1.1-1.3 2.6-1.8 2.6-3.9" opacity=".7"/>',

  // ── Ornament ─────────────────────────────────────────────────────────────────────────────────
  taiji:    '<circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9"/><circle cx="12" cy="7.5" r="1.2"/><circle class="f" cx="12" cy="16.5" r="1.3"/>',

  // ── Five Elements (Phase 42, arts.md): shape-distinct marks so element never relies on colour alone ──────────
  el_metal:   '<path d="M12 3.5 19 12l-7 8.5L5 12z"/><path d="M5 12h14"/>',
  el_wood:    '<path d="M12 21V11"/><path d="M12 13.5c-4.4 0-6.8-2.5-6.8-6.8 4.4 0 6.8 2.4 6.8 6.8z"/><path d="M12 11c0-3.6 2.1-5.8 6.6-5.8 0 4-2.2 6.1-6.6 5.8z"/>',
  el_water:   '<path d="M12 3.5c3.2 4.2 6 7.6 6 10.6a6 6 0 0 1-12 0c0-3 2.8-6.4 6-10.6z"/><path d="M9 15.2c1 .9 2 .9 3 0s2-.9 3 0"/>',
  el_fire:    '<path d="M12 20.8c-3.6 0-6-2.4-6-5.7 0-3.4 2.6-5 3.4-8.5 1.6 1.2 2.2 2.8 2.2 4.4 1-1.1 1.6-2.6 1.4-4.4 3 2.3 5 5.2 5 8.5 0 3.3-2.4 5.7-6 5.7z"/><path d="M12 20.8c-1.4 0-2.4-1-2.4-2.4 0-1.5 1.2-2.3 2.4-3.9 1.2 1.6 2.4 2.4 2.4 3.9 0 1.4-1 2.4-2.4 2.4z"/>',
  el_earth:   '<path d="M3.5 18.5 9 9l3.4 5.2L15 10.5l5.5 8z"/><path d="M3 21h18"/>',
  el_neutral: '<circle cx="12" cy="12" r="7.8"/><circle cx="12" cy="12" r="3.2"/><circle class="f" cx="12" cy="12" r="1"/>',
}
