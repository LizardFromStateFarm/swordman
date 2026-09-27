# UI Icon Set — Reference
_Covers: assets/icons/ui-icons.js · renderer/game/icons.js · styles.css (".ic" + "Where the icons sit") · scripts/smoke/scenarios/icons.js · Roadmap: 1.8d (Phase 33) · Updated: 2026-09-27_

The game's own icon set. It replaces emoji and **chrome** CJK in the UI. User rules (CLAUDE.md → Game Design Rules):
no emoji anywhere, and CJK only for **the six nav group marks (修 歷 家 宗 囊 錄)** and deliberate **in-world flavour**
(stage names like 凡人, a sect's `nameCN`, the 道 rail ornament).

## Data Shape
`UI_ICONS = { name: '<inner SVG for a 24×24 viewBox>' }`: line-art that strokes in `currentColor`. `.ic` in styles.css
sets the stroke (1.6, round caps/joins, `fill:none`). A part with `class="f"` is filled instead. `opacity=".6"` on a
secondary stroke is the family's "detail line" idiom.

| Group | Icons |
|---|---|
| Window chrome | close · more · back · window · strip · expand · grip · pin · settings |
| Layout picker | layout-overlay · layout-expanded · layout-desktop (+ strip for Banner) |
| Play mode | idle (moon) · active (flame) · auto (automation chip) |
| HUD | meditate · qi (breath/wind) · lineage (ancestral tablet: catch-up) · integrity (stepped foundation altar) · health (blood drop) · stone (spirit stone) · age (hourglass) · breakthrough · why · explore |
| Items/actions | lock (sealed rows) · crystal (Void Crystal) · sword (weapon slot) · pendant (artifact slot: jade bi disc) · duel (tournament) · token (sect missions) · furnace (craft) · scroll (techniques) · play · pause |
| Ornament | taiji (charselect title) |

## API
- `Icon(name, cls?)` → `<svg class="ic ic-<name> [cls]" viewBox="0 0 24 24" aria-hidden="true">…</svg>`. Unknown
  name → `''` + console.warn.
- `<span data-icon="qi"></span>` in static HTML is filled by `Icon.hydrate(root?)`. It runs once when icons.js loads,
  and again when called after an `innerHTML` that carries `data-icon` attributes.
- `Icon.names()` → every icon name (the contact sheet uses it).

## Wiring
- index.html loads `../assets/icons/ui-icons.js` (with the sprites) and `game/icons.js` (before layout.js). Every later
  UI file may call `Icon()`.
- Dynamic chrome calls `Icon()` directly: the mode chip (game.js `updateModeButton`, nav.js rail-mode), the auto chip
  (nav.js), the layout button, the picker rows, the banner readouts and the tip (layout.js), the banner quick buttons
  (banner-menus.js), the attention calm state (attention.js), and the Pack currency/equip/Auto chips (game.js).
- `build-ios-web.js` copies `assets/` whole, so the icon table ships to Capacitor with no extra step.

## Invariants
1. Icons are decorative. The button or label around one carries the words (`title` + `aria-label` on icon-only buttons).
2. Size in `em` (`.ic` = 1em): the ⚙ text-size setting scales icons with the text. Color from `currentColor`, so state
   colors and the color-blind tokens apply unchanged. Never hard-code a color inside ui-icons.js.
3. One family: 24 grid, 1.6 stroke, round joins, ≈2px inner padding. A new icon must read at 14px next to the others
   on the contact sheet, and it goes through the Visual Review Gate (asset score ≥ 8.0).

## Gotchas
- **Why a JS table, not `ui-icons.svg`** (the plan said .svg): on `file://`, Electron blocks an external
  `<use href="….svg#id">` and `fetch()`. A JS table works the same in Electron, Capacitor, the smoke driver and Node.
- CSP is `style-src 'self'`: don't put `style="…"` inside icon markup. SVG presentation attributes (`opacity`,
  `fill-rule`) are fine.
- `Icon.hydrate` skips an element whose `data-icon-done` already matches its `data-icon`. To swap an icon, change
  `data-icon` and hydrate again, or set `innerHTML = Icon(…)` directly.
- Smoke: `scenarios/icons.js` renders the contact sheet (`out/icons-sheet.png`) and fails on any CJK/emoji/box glyph
  left as text in the titlebar + HUD.

## Status
- **1.8d-1 (2026-09-27):** the set (36 icons) + `Icon()`. Converted: titlebar, HUD, action buttons, layout picker +
  tip, overlay titles (CN subtitles 布局 修行之道 設置 飞升劫 立嗣 奪 媒人 dropped), banner readouts + quick
  buttons, rail/auto chips, attention header + expedition/missions/technique nudges, lock marks (封) in Techniques/Explore/automation/banner rows, Pack currency/equip/Auto chips, charselect title. Emoji left in UI
  code: none (`check-no-emoji.js`: only the sprite files, which the art track A4 replaces).
- **1.8d-2 (next):** the other per-action marks in attention.js items, breakdowns.js, family-view.js, clan-view.js,
  sect-view.js (incl. 封/入 tiles), banner-menus.js row/heading `cn`, the Character tile glyphs, game.js section-title CN suffixes (e.g. "Automation 自動"),
  plus a chrome-CJK lint (CJK allowlist: nav marks + flavour data).
