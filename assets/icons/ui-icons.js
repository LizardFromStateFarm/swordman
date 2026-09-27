// Review score: 6.8 asset / 7.2 in context (2026-09-27, 3 cycles, accepted by the user; redraws due in 1.8d-2)
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
  lineage:  '<path d="M6 7.8 12 3.5l6 4.3z"/><path d="M8.5 7.8h7v9.2h-7z"/><path d="M6.5 17h11v2h-11zM4.5 19h15v2h-15z"/><path d="M12 10.3v4.2" opacity=".7"/>',
  integrity:'<path d="M3 20.5h18v-5h-3.5V11h-3V6.5h-5V11h-3v4.5H3z"/><path d="M6.5 15.5h11M9.5 11h5" opacity=".6"/>',
  health:   '<path d="M12 3c3.2 4.6 6.2 7.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 10.6 8.8 7.6 12 3z"/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.4 2.8" opacity=".7"/>',
  stone:    '<path d="M7 4.5h10l4 4.8L12 20 3 9.3z"/><path d="M3 9.3h18M9.5 4.5 8 9.3 12 20l4-10.7-1.5-4.8" opacity=".7"/>',
  crystal:  '<path d="M12 2.5l4.5 6.5L12 21.5 7.5 9z"/><path d="M7.5 9h9M10 9l2 12.5L14 9" opacity=".6"/>',
  age:      '<path d="M5 3h14M5 21h14"/><path d="M7 3v2.8c0 3 5 4.3 5 6.2s-5 3.2-5 6.2V21M17 3v2.8c0 3-5 4.3-5 6.2s5 3.2 5 6.2V21"/><path class="f" d="M9.3 19.6c.6-1.6 1.7-2.4 2.7-2.9 1 .5 2.1 1.3 2.7 2.9z"/>',
  breakthrough: '<path d="M12 7.2l4.8 4.8-4.8 4.8L7.2 12z"/><path d="M12 2v2.8M12 19.2V22M2 12h2.8M19.2 12H22"/><path d="M12 10.6v2.8M10.6 12h2.8" opacity=".6"/>',
  why:      '<path d="M8.8 8.8a3.3 3.3 0 1 1 4.7 3c-1 .5-1.5 1.3-1.5 2.6"/><path d="M12 18.4v.1" stroke-width="2.4"/>',
  explore:  '<path d="M2.5 20 9 8.5l3.8 6.2 2.7-3.7L21.5 20z"/><path d="M7.4 11.3 9 12.8l1.6-1.5" opacity=".6"/><circle cx="17.5" cy="5.5" r="1.6" opacity=".7"/>',

  // ── Items, gear, actions ─────────────────────────────────────────────────────────────────────
  sword:    '<path d="M20.5 3.5 10 14l-1.5-1.5L19 2z"/><path d="M6.5 11.5l6 6"/><path d="M9.5 14.5l-5 5"/><circle cx="3.9" cy="20.1" r="1"/>',
  pendant:  '<path d="M12 2.5v3.5"/><circle cx="12" cy="11.5" r="5.5"/><circle cx="12" cy="11.5" r="1.9"/><path d="M12 17v2.3M10.4 21.6 12 19.3l1.6 2.3"/>',
  duel:     '<path d="M4 4l10.5 10.5M20 4 9.5 14.5"/><path d="M12.8 16.4l3.2-3.2M11.2 16.4 8 13.2"/><path d="M15.8 15.8l4 4M8.2 15.8l-4 4"/>',
  auto:     '<path d="M19.8 11a8 8 0 0 0-14-4.6M4.2 13a8 8 0 0 0 14 4.6"/><path d="M5.2 2.8v3.8H9M18.8 21.2v-3.8H15"/><circle class="f" cx="12" cy="12" r="1.5"/>',
  furnace:  '<path d="M4.5 9h15l-1.3 7.2a2.4 2.4 0 0 1-2.4 2H8.2a2.4 2.4 0 0 1-2.4-2z"/><path d="M7 9V6.2M17 9V6.2M5.5 6.2h3M15.5 6.2h3"/><path d="M8.3 18.2l-1 3.3M15.7 18.2l1 3.3"/>',
  scroll:   '<path d="M3.5 4.5h17M3.5 19.5h17"/><path d="M6 4.5c.7 5 .7 10 0 15M18 4.5c-.7 5-.7 10 0 15"/><path d="M10.5 8.5v7M13.5 8.5v4.5" opacity=".65"/>',
  token:    '<rect x="5" y="3" width="14" height="11.5" rx="2.5"/><circle cx="12" cy="6.5" r="1.2"/><path d="M9 10.6h6" opacity=".7"/><path d="M12 14.5v3.3"/><path class="f" d="M10.9 17.6h2.2l.7 4h-3.6z"/>',
  lock:     '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.3v2.4"/>',
  play:     '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  pause:    '<path d="M9 5.5v13M15 5.5v13"/>',

  // ── Ornament ─────────────────────────────────────────────────────────────────────────────────
  taiji:    '<circle cx="12" cy="12" r="9"/><path class="f" fill-rule="evenodd" d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9zM13.3 16.5a1.3 1.3 0 1 0-2.6 0 1.3 1.3 0 1 0 2.6 0z"/><circle class="f" cx="12" cy="7.5" r="1.3"/>',
}
