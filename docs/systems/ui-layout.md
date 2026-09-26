# UI Layout — Reference
_Covers: renderer/index.html · renderer/styles.css · renderer/game.js · Phase: 1–2 · Updated: 2026-09-24_

## Window Structure
Fixed 300×540px window. Flex column, no scroll on outer container.

```
#titlebar          32px   drag region; cultivator name (click → rename) + 3 buttons
#sprite-wrap       172px  canvas; no-drag; meditate-badge overlay (top-right)
#stage-block       ~55px  realm + layer + desc text, centered
#qi-block          ~38px  labels + track + rate
#actions           ~48px  2-column grid: Meditate + Breakthrough buttons
#tabs              ~26px  5 equal-flex tabs; font-size 10px
#tab-body          ~169px flex:1; overflow:hidden; active .panel scrolls internally
```

## CSS Variables
Defined in `:root` at top of styles.css — always use these, never raw hex in new rules:
```
--bg      rgba(8,4,14,0.93)    main background
--bg2     rgba(18,9,28,0.96)   overlay/card backgrounds
--text    #E8D8B0              primary text
--dim     #8A7A60              secondary/muted text
--gold    #EDD050              highlight, active states, stage name
--red     #C83030              negative events, danger
--jade    #30B878              positive events, active expedition, earned/learned
--purple  #9070C8              root badge, special effects
--border  #2A1A10              all borders
--font    "Courier New",...    monospace; always use this for buttons and inputs
```

## Tab System
5 tabs: Techniques · Stats · Explore · Craft · Log
- Tab buttons: `.tab` class, `data-tab="<name>"` attribute
- Panels: `#tab-<name>`, `.panel` class; `.panel.active` shown
- Tab click handler in `game.js` calls the relevant `render<X>(s)` function
- `updateHUD(s)` also calls the active tab's render function every frame (for live data like timers)

## Adding a New Tab
1. HTML: `<button class="tab" data-tab="<name>"><name></button>` in `#tabs`
2. HTML: `<div id="tab-<name>" class="panel"></div>` in `#tab-body`
3. `game.js`: add `if (activeTab === '<name>') render<Name>(s)` in `updateHUD`
4. `game.js`: add `if (btn.dataset.tab === '<name>') render<Name>(s)` in tab click handler
5. CSS: add panel-specific styles in styles.css (see Explore/Craft sections for pattern)
6. Consider whether 6 tabs at 300px needs a font-size reduction (currently 10px for 5 tabs)

## Render Function Pattern
All `render<X>(s)` functions:
- Receive current state snapshot `s`
- Clear `el.innerHTML = ''` then rebuild DOM
- Wire event listeners fresh each render (no stale listener buildup since innerHTML clears them)
- Are called every frame when tab is active — keep them fast; avoid layout thrashing

## Flash Message
`flashMessage(msg, type)` — shows a toast and calls `gameState.addEvent`.
Types: `'positive'` (jade), `'negative'` (red), `'special'` (gold), `'neutral'` (dim)

## Overlays
Two overlays in HTML: `#rename-overlay`, `#confirm-overlay`.
Pattern: `.hidden` class toggle. Always `z-index: 200`. Wire buttons directly in the IIFE.

## Invariants
1. The window is always 300×540px — do not change these in CSS or main.js
2. All button elements must have `font-family: var(--font)` explicitly set (browser defaults differ)
3. The sprite canvas is `300×172` — the renderer hardcodes this
4. `-webkit-app-region: drag` on the titlebar; child interactive elements must have `-webkit-app-region: no-drag`

## Gotchas
- `#tab-body` has `overflow: hidden`; individual `.panel` divs have `overflow-y: auto` — add scrollable content inside panels, not on tab-body
- Rendering on every frame (not just on state change) is intentional for live timers (expedition countdown) — this is acceptable at 300px scale
- The "Events" tab was renamed "Log" in Phase 2 HTML (tab label) but its panel id remains `tab-events` and its data-tab is `events` — don't rename the id/attr without updating all references
- Window always-on-top must use the `'screen-saver'` level (`main.js` `createWindow()` + `toggle-always-on-top` handler), not plain `alwaysOnTop: true`. Windows drops a normal-level always-on-top window behind an exclusive-fullscreen game as soon as the game regains focus — `'screen-saver'` is the highest level Electron exposes and is what actually survives on top of a fullscreen game. Any code path that calls `setAlwaysOnTop` must pass this level or the window will silently start disappearing behind games again. Default spawn position is top-right (`x: sw-W-20, y: 20`) per user request — the window still remembers a dragged position across restarts via `window.json`.
- `#btn-pin` shows pinned state visually (`.pinned` class = gold glow, matches `--gold` active-state convention). `toggleAlwaysOnTop()` is `ipcRenderer.invoke` (not `send`) and resolves the new boolean state from `main.js`'s `ipcMain.handle('toggle-always-on-top', ...)` — the click handler in `game.js` awaits it to update the class + title. The iOS/browser shim (`platform-storage.js`) has no real window, so its `toggleAlwaysOnTop` is a no-op that always resolves `true` just to keep the button's state logic from breaking there.
