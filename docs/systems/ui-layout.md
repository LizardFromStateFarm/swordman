# UI Layout — Reference
_Covers: renderer/index.html · renderer/styles.css · renderer/game.js · renderer/game/layout.js · renderer/game/nav.js · renderer/game/attention.js · main.js (window geometry) · Phase: 1–2, 6E, 33 · Updated: 2026-09-26 (1.8b-1 navigation + attention)_

## Window Structure
The window size comes from the **layout mode** (Phase 6E, see "Layout modes" below). `#app` / `#charselect` fill
the window (`100vw × 100vh`); nothing in CSS hard-codes the window size any more. Overlay (default) is 300×700
(clamped to the screen's work area). Measured before 1.7: a 300×600 window with a 101–112px tab body (UX Audit).

```
#titlebar            ~39px  drag region; name (click → rename, one line + ellipsis) + 歸 窗 [閒 Idle|動 Active] 設 頂 ✕
#hud                         the always-visible readout (wrapper, Phase 6E)
  #sprite-wrap       150px   canvas (size set per mode by LayoutUI → renderer.setSize); meditate-badge overlay
  #stage-block       ~50px   realm + layer + desc (desc clipped to one line in Overlay; full text in its title)
  #qi-block          ~40px   labels + track + rate
  #vitals            ~26px   Integrity · Health · Age on ONE row (3-column grid; values out of 100, no "/ 100")
  #banner-info               banner only: stones + expedition
  #actions           ~46px   Meditate (坐) + Breakthrough (破) (icon left, name over sub)
  #attention         ~32px   1.8b-1: what's waiting (Overlay: one line + "+N" unfold; Expanded/Desktop: card column)
  #banner-quick / #banner-btns  banner only: quick menus, ⬡ open the full window
#main-pane                   wrapper for the navigation (Phase 6E); a row in Expanded/Desktop (rail | view)
  #tabs              ~38px   1.8b-1: six group buttons (glyph over name); a 64px vertical rail in Expanded/Desktop
  #view                      sub-tab row + tab body
    #subtabs         ~30px   pill sub-tabs of the open group + the 自 automation chip (hidden for 1-view groups w/o chip)
    #tab-body        flex:1  ~246px in Overlay (was 305 after 1.7; nav + strip cost ~60px); active .panel scrolls
#resize-grip                 Desktop only: ◢ bottom-right
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
--bg-opacity 1                 Phase 20C setting; multiplies --bg, titlebar and #app shadow alphas
```
`:root[data-cb="deuteranopia"|"protanopia"]` overrides `--red`/`--jade` (color-blind setting). Never hard-code
red/green hex in JS: use `var(--red)` or `settingsUI.palette()` (see settings.md).

## Navigation (1.8b-1, Phase 33) — groups → views
`NAV_GROUPS` in `renderer/game/nav.js` is the single source. A **view** is one panel (`#tab-<view>`); a **group** is a
button in `#tabs` holding 1+ views shown as sub-tabs:

| Group | Views (sub-tabs) | Automation chip |
|---|---|---|
| 修 Path | techniques (Techniques) · stats (Character) | — |
| 歷 Roam | explore (Explore: expedition, locations, road encounters) · beasts (Beasts: wild + tamed) | Auto-Explore |
| 家 Kin | family (Family) · clan (Clan: clan rows, Hall, Pass the Mantle) | — |
| 宗 Sect | sect (Overview) · sect-missions (Missions, joined) · sect-halls (Halls, founded) · sect-disciples (Disciples, founded) · sect-war (War, either) — only the views your standing offers are shown (1.8b-5) | Auto-Missions |
| 囊 Pack | pack (Items) · craft (Craft) — user asked for Craft and Pack together | Auto-Craft (on Craft) |
| 錄 Log | events (Events) · banter (Banter) | — |

- `NavUI` builds every group button and every sub-tab button once; sub-tabs outside the open group are
  `.hidden` but stay in the DOM, so `[data-tab="<view>"]` always resolves (smoke scenarios click them).
- `nav.go(view)` switches group + panel and calls `renderView(view, s)` (game.js `VIEW_RENDER` map). A group
  remembers its last sub-view (localStorage `cultivator-idle:nav`, per computer).
- `updateHUD` re-renders `nav.view` on explicit state changes and runs the in-place timer updaters on ticks.
- `nav.update(s, attentionItems, automationUnlocked)` redraws badges + the automation chip (DOM only on change).
- **Offered views (1.8b-5):** `nav.setAvailable(views)` hides sub-tabs that don't apply (game.js passes every view
  except the sect ones `SectView.viewsFor(s)` withholds, each HUD update; cheap signature check). If the open view is
  withdrawn (you leave/found a sect) the nav falls back to the group's first offered view; a group button never
  lands on a withdrawn "last" view. A group with one offered view shows the context line instead of sub-tabs.
- **Sub-tab marks (1.8b-5):** `nav.update` sets `data-att` on each sub-tab to the most urgent attention tier aimed at
  that view (CSS dot: red decision · jade chance · gold nudge), so a many-view group says which view wants you.
- **Sub-tab row width (1.8b-5):** `#subtabs` is a size container; `@container` rules tighten the pills below 380px /
  300px and fold the automation chip to "自 ●". Expanded's right column is only ~275px, so Expanded keeps Overlay-like
  row padding. Sub-tabs never wrap (they ellipsize as a last resort); smoke sect.js asserts all sect tabs fit.
- Group names are ≤ 5 chars so six fit in 300px with the glyph above (the approved "Cultivate/Adventure" became
  "Path/Roam" for width).

## Adding a New View
1. HTML: `<div id="tab-<view>" class="panel"></div>` in `#tab-body`
2. `nav.js`: add `['<view>', 'Label']` to a group's `views` (or a new group: glyph, ≤ 5-char name, title)
3. `game.js`: add `<view>: s => render<View>(s)` to `VIEW_RENDER`
4. If something in it can wait on the player, add an item in `collectAttention()` with `view: '<view>'`
5. CSS in styles.css; use classes, not inline `style="…"` (see the CSP gotcha)

## Attention layer (1.8b-1)
`collectAttention(s, gameState)` (renderer/game/attention.js, DOM-free, `require`-able from Node) returns ranked
items `{ id, tier, glyph, title, why, view, open?, left? }`:
- **urgent** (a decision; red): proposal 媒, duel 決, head challenge 挑, step-down 讓, marriage event 婚, child event 子,
  upbringing 幼, tournament 奪, member war call 戰 (until answered), own-sect war 戰 (with countdown)
- **ready** (an opportunity; jade): road strangers 逢, wild beasts 獸, clan head with adults but no heir 嗣
- **idle** (a nudge; dim; hidden while the matching automation runs): no expedition 歷, open mission slot 任,
  an affordable technique 功
Clicking an item opens its popup (`open`: proposal / family / tournament) or navigates to `view`; on the banner a
nav target first peeks the full window. Group badges: red count = has urgent, jade count = ready only, gold dot =
nudges only. Rendering: Overlay one line + "+N" (unfolds a floating list with reasons, folds on outside click);
Expanded/Desktop a card column under the actions with every reason; Banner one chip after the quick menus, "+N"
peeks the full window.

## Mode panel (1.8b-1)
`#mode-overlay`, rendered by game.js `renderModePanel()`: Idle / Active cards (Active lists its bonuses from the
ACTIVE_* constants) + the automation rows (`renderAutomationPanel`, now only here; locked rows show 封 + unlock
requirement). Opened by the titlebar 閒/動 button and by the 自 chip. The titlebar button no longer toggles the mode
directly; the choice is made on a card that says what it does.

## "Locked because…" (1.8b-1)
`lockedAction(label, why)` in game.js renders a dashed, disabled button with "封 <why>". Use it instead of omitting
an action the player can't take yet. Applied so far: Challenge the Head, Declare War on the Main Line, Secede, Push
for War (1.8b-4 extends it across the Clan view).

## Breakdowns + Character view (1.8b-2)
- **Any element with `data-bd="<kind>"` opens a "why" card** (renderer/game/breakdowns.js). Kinds: `qps` · `cap` ·
  `bt` (the Ascension Trial card at the last mortal stage) · `integrity` · `health` · `karma` · `bloodline`.
  `buildBreakdown(kind, s, gs, fmt, fmtTime)` is DOM-free and returns `{ glyph, title, cn, total, rows, sections,
  notes, state? }`; `BreakdownUI` draws it in `#breakdown-overlay` beside the tapped element (flips above it, clamps
  inside the window, centers when the anchor is scrolled away). Closes on Esc, ✕, an outside click, or tapping the
  same element. Refreshed every HUD update (only rewrites when the text changed). `state: true` cards (Integrity,
  Health, Karma, Bloodline) show the value in the header; formula cards end in an "=" total line.
- The numbers come from GameState (core-loop.md → Breakdowns), never recomputed in the UI.
- It is an `*-overlay`, so in banner mode the window peeks open for it and drops back when it closes.
- **HUD entry points:** `#qi-rate` (qps) and `#qi-numbers` (cap) have dotted underlines; `#integrity-block` /
  `#health-block` whole blocks; the 詳 badge `#bt-why` on the Breakthrough button (the button itself still
  attempts). `#catchup-chip` (承 catch-up) sits left of the Qi rate while ancestral catch-up is active.
- **Character view** (`renderStats`): identity card (full name, stage, root/personality/age/year/generation tags),
  catch-up banner, tiles for Cultivation (Qi/s, Qi cap + time to ready, Breakthrough + failure cost) and Foundation
  (Integrity, Health, Karma, Bloodline sealed 封 until Spirit Severing via `bloodlineVisible()`), then Belongings &
  Bonds and Record lists. Sections flow into two columns when the view is ≥ ~520px (Desktop). In **Overlay** the view is ordered numbers-first (identity card last, catch-up banner hidden: the HUD above already names the realm and carries the 承 chip). Formula cards show a running subtotal per multiplier ("×1.8 → 360K"); percentages always show one decimal.
- `stageShortName(i)` ("Qi Condensation 4", "Core Formation · Early") replaces "Stage N+" in the Techniques, Explore
  and Sect locks. Use it for any new stage requirement.
- Not zoomed by the ⚙ text-size setting yet (that only zooms #tab-body); the card is 11px minimum.
- 1.8b-3a adds `affection` (spouse card meter) and `propose` (courtship odds) kinds.

## Family view (1.8b-3a)
- `renderer/game/family-view.js` → `FamilyView(gameState, helpers)`; game.js `renderFamily()` creates it lazily and
  passes `esc, fmt, stageLabel, affectionLabel, bondLabel, latinOnly, confirm, flash, wire (wireKinButtons),
  endText, pendingKey`. One delegated click listener on `#tab-family` handles every `data-fa` action; the old ids
  (`_matchmaker`, `_family-matter`, `_choose-heir`, `_tournament`, `data-plan`, `data-end-affair`) still go through
  `wireKinButtons`. The open child card (`openChild`) is view state only.
- **Structure:** `.fam-view` = two `.fam-col`s (wish + partner card + lovers/former + heir · children). Columns flow
  side by side from ~530px (Desktop); Expanded and Overlay get one column. In **Overlay** the columns are
  `display: contents` and ordered wish → partner → children → the rest.
- **Partner card** is one of: spouse (`.fam-card.spouse`: affection meter `data-bd="affection"` with the 25/75 tier
  ticks, trend arrow over `AFF_TREND_YEARS`, last cause; flags; 4 actions in `.fa-grid`), courtship (`.court`:
  candidate cards → interest meter + meeting pips → the meeting card inline, `.court-beat`), or alone (`.alone`: seek +
  a pending matchmaker). A partner's wish is `.fam-wish` above it (a slow gold pulse, off with ⚙ Reduce motion or
  `prefers-reduced-motion`, via `:root[data-motion]` set by settings.js).
- **Action button** `.fa-btn` = glyph + name + effect line (`.up` jade / `.down` red / `.cost` gold) or a `封` lock
  reason from the `*Preview()` result. Tones `.tone-jade/-warm/-gold/-red/-dim` are shared by bars, words and tags
  (`affectionLabel`/`bondLabel` now return `tone`).
- **Children:** `.kid` cards (name, age, stage or "not yet awakened", personality + morality tags, bond meter);
  tap to open `.kid-acts`. All children are listed (the old "youngest 12" cap is gone); the dead and estranged fold
  into "Gone from the house". Family Planning is the segmented control at the top (Ask me · Few · Many · None).

## Clan + Hall views (1.8b-4)
- `renderer/game/clan-view.js` → `ClanView` (#tab-clan) and `HallView` (#tab-hall), sharing `KinViewBase` (click
  delegation, `_tile()` = the Family view's `.fa-btn`, bar painting). game.js `renderClan()/renderHall()` create them
  lazily with `kinHelpers()`. **The Hall is a nav view now** (Kin → Family · Clan · Hall); the old `#hall-overlay` is
  gone and `openHallOverlay(view)` just peeks the banner and `nav.go('hall')`.
- **Clan:** clan card (founded, members, branches, generation, your standing tag, tradition = lethal vs peaceful
  successions, Hall tile with Merit) → head card (style + blurb, your bond meter, only when someone else leads) →
  "What you can do" tiles (Challenge the Head, War on the Main Line + odds `data-bd="branch"`, Secede, Push, Pass the
  Mantle; locks say why). Right column: lines & branches as a small ┌├└ tree (yours highlighted), branch strength
  meter, other clans (`clanRelations()`, words Blood feud / Rivals / Wary peace / Friendly / Allied + a centered
  diverging bar), the last 3 chronicle lines. Orphans get one card (+ the last clan's Hall).
- **Hall:** records card (Merit to spend, earned, furthest realm, Ascended Ancestors + blessing) → "This life will
  add" (`meritPreview()`, the real `_recordLifeInWorld` terms) → clan firsts (claimed 得 / open +Merit). Right:
  legacy cards (level pips, Now / Next effect, buy or "need N more", sealed with the first it needs) with the
  **Family Manual picker** inside its card (`familyManualOptions()`, `setFamilyManual`), then the family tree and
  chronicle as `<details>` folds.
- Existing ids still go through `wireKinButtons`: `_challenge-head`, `_declare-branch-war`, `_push-branch-war`,
  `_secede`, `_pass-mantle`. Attention: ready 挑 (a challenge is possible), idle 祠 (Merit enough for a legacy).
- **Scrollbar:** one global `::-webkit-scrollbar` (8px, gold-ink thumb on a faint groove) near the top of styles.css
  replaced the per-element ones. Never set `scrollbar-color` (Chromium lets it override these).
- **Stat rows:** `.stat-row .stat-key` may now shrink and `.stat-val` takes ≥ half the row, so a long label beside a
  long value no longer collapses into a one-word column (the old Hall's "Best Realm Reached").

## Sect views (1.8b-5)
- `renderer/game/sect-view.js` → `SectView` renders all five sect panels (`#tab-sect`, `#tab-sect-missions`,
  `#tab-sect-halls`, `#tab-sect-disciples`, `#tab-sect-war`); game.js `renderSect(s, view)` creates it lazily with
  `sectHelpers()` (esc, fmt, fmtTime, flash, confirm, go, `orders` = the Standing Orders renderer, `startMission`).
  One delegated click handler per panel on `[data-sa]`; no element ids, so stale hidden panels never collide.
  The old renderSect/renderOwnSect/renderFoundPanel/renderMemberWarPanel/renderSectWarPanel are gone.
- **No sect:** a "wandering cultivator" card, every sect within 3 stages as a row with its blessing in words
  (`sectEffectList()`: "Qi per second ×1.4", "Breakthrough chance never below 50%"…) and a Join / sealed-until tile;
  a founding card with have/need tiles (stones, Void Crystals, realm) and the name field (`foundName` survives
  re-renders).
- **Joined → Overview:** rank card (contribution bar to the next rank, "Rise to X" with the next rank's reward mult or
  "N more Contribution", Give 10 stones, Give-enough-to-rise, Leave behind a confirm); the sect's blessing (items
  that don't apply now — weapon/artifact bonuses without the gear — say "not now"; struck through while suppressed
  after a lost war); Duties tiles linking Missions (slots, open count) and War (countdown, odds, unanswered).
  **Missions:** a card per mission (duration, rewards and contribution already × your rank mult, beast XP, rank lock,
  "Set out" or the live timer bar). **War:** see below.
- **Founded → Overview:** sect card (Fame tag with its terms in the tooltip), stat tiles (stones/min, herbs/min, Qi/s
  from disciples, war defense / array damaged), the hall upgrade tile (seats before → after, cost / short); right
  column: links to Disciples / Halls / War, the Fame breakdown, the last war. **Halls:** the Sect Hall card (level,
  seats, raise tile) then a card per building with "what it does now, in your numbers" (e.g. "double crafts:
  35% → 75%", "beast slots: 3 → 5") and its cost with what you hold. **Disciples:** roster (stars, level, XP bar,
  +Qi/s, stones/min, herbs/min, time to next level, dismiss behind a confirm) and the candidates at the gate (their
  Lv.1 yield, cost or "N stones short" / "raise the Sect Hall"), a "Call others" tile with the refresh countdown.
- **War (both sides):** status card (enemy + tier stars, phase clock, record), the **odds card** (`gameState.sectWarOdds()`,
  the exact mean of the real roll; tap → breakdown `data-bd="sectwar"`: strength terms, what-ifs, the stakes), then
  the actions for the phase — member: Answer the call · War chest · offer up to 3 pill kinds · send an idle beast;
  own: Reinforce (preparing only, odds after) · ask the strongest reachable sect as ally (every ally costs/gives the
  same). Last war's result card, Standing orders (the existing `renderWarOrdersPanel`, restyled inside `.sv-orders`:
  26px toggles with a lit gold selected state, labels above their controls), "What rides on it".
- **Overlay:** cards stack single-column; blurbs (`.sv-card-d`, card `.fc-sub`, sect descriptions), the Fame section,
  the Overview's last-war card, the stakes and the orders footnote are hidden (reachable via tooltips / War / the odds
  card); the roster is one line per disciple (yields in the row tooltip); candidates are compact rows. Measured with
  the founder preset during an attack: Overview 2.3 · Halls 2.4 · Disciples 3.0 · War 2.1 Overlay screens (the old
  single list was 14.8).
- **Timers** are data attributes (`[data-wartimer]`, `[data-pooltimer]`, `.sect-mission-timer` + `[data-barfor]`);
  `updateSectTimersInPlace` runs on ticks for any `sect*` view.
- **Attention:** war call / attack → `sect-war`; open mission slot → `sect-missions`; new idle nudges 徒 (a seat is open
  and you can afford a candidate) → `sect-disciples`, 殿 (a building you can afford) → `sect-halls`.
- **Card grids:** Techniques, Explore locations and Craft recipes are wrapped in `.card-grid` — a column in Overlay /
  Banner, an auto-fill grid (≥ 250px cards) in Expanded/Desktop. Their plain CJK subtitles moved into tooltips; the
  Technique cost glyph is 石 (was an emoji).
- Smoke: `scripts/smoke/scenarios/sect.js`. Checks: `scripts/sim/checks/sect-view.js`.

## Render Function Pattern
All `render<X>(s)` functions:
- Receive current state snapshot `s`
- Clear `el.innerHTML = ''` then rebuild DOM
- Wire event listeners fresh each render (no stale listener buildup since innerHTML clears them)
- Are called every frame when tab is active — keep them fast; avoid layout thrashing

## Flash Message
`flashMessage(msg, type)` — shows a toast and calls `gameState.addEvent`. Since 1.8b-1 the toast sits on the lower
edge of the sprite scene (positioned from `#sprite-wrap`'s rect; styled by `#_toast` in CSS), never over tab content;
the banner keeps its own in-strip position.
Types: `'positive'` (jade), `'negative'` (red), `'special'` (gold), `'neutral'` (dim)

## Overlays
Overlays in HTML: `#rename-overlay`, `#confirm-overlay`, `#settings-overlay` (Phase 20C), `#ascension-overlay`, `#death-overlay`.
`#confirm-overlay` is a generic one-shot confirm (Phase 21: `showConfirm(msg, sub, onYes)` in game.js) — charselect's
delete-slot flow and the Pack tab's Discard button both call it. Don't hardcode a new pending-action sentinel if you
add a third caller.
`#banter-bubble` (Phase 29) is `position: fixed`, z 210. Since 1.8b-1 `updateHUD` hides it whenever any
`body > [id$="-overlay"]` is open (`isPopupOpen()`, also BanterSystem's block check), so it never covers a popup. It needs `width: max-content`, because `left:50%` + translate otherwise caps it at half the window.
Pattern: `.hidden` class toggle. Always `z-index: 200`. Wire buttons directly in the IIFE.

## Invariants
1. Window sizes live ONLY in `main.js` `boundsFor()`. CSS never hard-codes the window size (`#app` is 100vw×100vh);
   per-mode differences are CSS rules off `body[data-layout]`. Every new UI must work in all four modes (UX Pass)
2. All button elements must have `font-family: var(--font)` explicitly set (browser defaults differ)
3. The sprite canvas size is set per mode by `LayoutUI` (`LAYOUT_CANVAS` → `renderer.setSize(w, h, scale)`); don't hard-code it anywhere else
4. `-webkit-app-region: drag` on the titlebar; child interactive elements must have `-webkit-app-region: no-drag`

## Layout modes (Phase 6E, roadmap 1.7 — built 2026-09-26)

| Mode | Window | On top | Arrangement | For |
|---|---|---|---|---|
| **Overlay** (default) | 300 × 700 (height clamped to the work area) | yes | stacked: #hud over #main-pane | active play (user decision) |
| **Expanded** | 640 × 720 | yes | grid: #hud 300px left, tabs right | more room, still pinned |
| **Desktop** | 1000 × 760 default, min 640 × 520, resizable via ◢ | **no** | grid: #hud 320px left, tabs right; one column under 600px wide | a normal window; also the iOS/browser layout |
| **Banner** | full work-area width × **56** at the top (default) or bottom edge | yes, skips taskbar, not movable | one row: mini sprite · stage · Qi bar + rate · stones + expedition · Meditate/BT · ⬡ | "while gaming", like a taskbar (user decision) |

**Who owns what**
- `main.js`: geometry only. `LAYOUT_MODES`, `boundsFor(mode, edge)`, `applyLayout()`; IPC `get-layout` →
  `{ mode, bannerEdge, current, supported, pinned }`, `set-layout(mode, { persist, bannerEdge })` →
  `{ mode, bannerEdge, pinned }`, `resize-window(w, h)` (Desktop only). The mode is **app-wide in `window.json`**
  (`layoutMode`, `bannerEdge`, `pos.<mode>` = each mode's remembered drag position, `size.desktop`), NOT a per-slot
  setting: the character select needs a window before any slot is loaded. (Deviation from the 6E spec, which said
  `settings.layoutMode`.) Old saves' top-level `x/y` seed Overlay's position.
- `preload.js` / `platform-storage.js` (Rule 7): `getLayout`, `setLayout`, `resizeWindow`. The iOS/browser shim
  always answers `desktop` with `supported: false`, which hides the ▣ button.
- `renderer/game/layout.js` (`LayoutUI`): sets `body[data-layout]`, sizes the sprite canvas (`LAYOUT_CANVAS`:
  banner = 80×56 at 0.36× scale), renders the ▣ picker (+ banner edge Top/Bottom), updates the banner readouts every
  frame (`update(s)` from `updateHUD`), runs the Desktop grip, and shows a one-time ▣ tip (localStorage flag).
- `styles.css` "LAYOUT MODES" section: all visual differences, CSS-only off `body[data-layout]`. No JS branching in
  render functions.
- `ascii-renderer.js` `setSize(w, h, scale)`: everything draws in a logical space of canvas ÷ scale.

**Banner behaviors**
- The character select never shows as a strip: `main.js` opens in Overlay when the saved mode is banner, and
  `LayoutUI.enterGame()` / `leaveGame()` switch with `persist: false` (the saved preference is untouched).
- **Peek:** ⬡ opens the full Overlay window temporarily (`persist: false`); the titlebar button turns into a jade ▭
  and the picker gets "↩ Back to the banner" at the top.
- **Auto-peek:** a MutationObserver on every `body > [id$="-overlay"]` popup: if one opens while in banner (death
  card, family matter, proposal…), the window opens to Overlay, and it drops back to the banner once all popups
  are closed again. A banner can never hide a decision.
- Space to the right of the Meditate/BT buttons is intentionally empty: 1.8b's attention strip goes there.

### Banner quick actions (roadmap 1.7b, 2026-09-26)
Four dropdown buttons on the strip, marked with gold CJK glyphs (no mixed emoji on the strip; banner also hides the
Meditate/BT emoji icons): **任 Missions n/max** (joined sect only; start a mission) · **歷 Explore** (send an expedition;
shows "Explore · 1:23" while one runs, tooltip names the place) · **煉 Craft [n]** (category chips; n = craftable now)
· **功 Learn ●** (gold dot = a technique is learnable + affordable now).
- `renderer/game/banner-menus.js` (`BannerMenus`): buttons re-render only when their label key changes; the open
  menu re-renders on state changes and ≤ 2×/s for timers, **never while the pointer is held in the menu** (a
  mid-click redraw would swallow the click). Rows are full-width buttons: name + CN · right column (exactly one
  meaning: "Start ›" / "Send ›" / "Craft ›" / "🪨 cost ›", or the lock reason) · meta line (duration, reward amounts,
  have/missing materials, owned count, technique effect).
- Actions go through game.js's shared `quickActions` (learn / startMission / sendExpedition / craft), the SAME
  functions the tabs now call, so feedback is identical. Opening the Craft menu counts as "watching" for Master's
  Touch (22C), like viewing the Craft tab.
- Window: `window.electron.bannerMenu(px)` → main.js `banner-menu` grows the banner by `BANNER_MENU_GROW` (380px)
  downward (top edge) or upward (bottom edge); 0 shrinks it back. In banner mode `#app` is pinned 56px tall at its edge
  (`body[data-edge]`), the rest of the grown window is transparent; clicking there / Esc / picking an expedition closes
  the menu. Leaving banner mode closes it (`layoutUI.onModeChange`).
- Toasts in banner mode sit in the strip's empty right side (left of ⬡), never over a control.
- New tokens from its review: `--btn-bg`, `--panel`, `--scroll`, `--red-text` (a lighter `--red` for small text; follows
  the color-blind palette via color-mix). Use them for new raised controls / floating panels.
- Tests: `scripts/smoke/scenarios/banner-menus.js` (each menu opens + grows the window, one real action per menu, Esc
  shrinks back; close-up screenshots for the Visual Review Gate via the new `shot(name, clip)`).

**Tests:** `scripts/smoke/scenarios/layout-modes.js` (every mode's real window size + data-layout, pin state per
mode, Desktop resize IPC, banner readouts, auto-peek and return, ⬡/↩, charselect never a strip, continue restores
banner). `scenarios/ux-audit.js` gives the per-tab before/after numbers.

## UX direction (user, 2026-09-26)
UI/UX is a first-class deliverable. Every player-facing task does the **UX Pass** in CLAUDE.md (surface /
interact / discover / feel / UX debt). Roadmap 1.8a (UX audit, below) → 1.7 (layout modes) → 1.8b (overhaul).

## UX Audit (roadmap 1.8a, 2026-09-26)

Method: read every render function in `game.js`, cross-checked the `gameState` API and `derived` fields against
what the UI reads, then ran `scripts/smoke/scenarios/ux-audit.js` (dev presets Sect Elder + Sect Founder: screenshots
of every tab/overlay in `scripts/smoke/out/ux-*.png`, plus the metrics below). Rerun that scenario after 1.7/1.8b to
compare before/after.

### Measured (Overlay mode, real window 300×600)

Always-visible chrome takes **~488px of 600**: titlebar 39 · sprite 173 · stage 60 · Qi 48 · Integrity 26 ·
Health 23 · Age 22 · Meditate/Breakthrough 71 · tabs 24. **Tab body: 101–112px**, about 18% of the window. That's
roughly 4–5 lines of text, and it's where nearly every decision in the game happens.

| Tab | Content height px (elder / founder) | Screens of scroll | Controls | First thing you see |
|---|---|---|---|---|
| Tech | 549 / 549 | 4.9× / 5.4× | 0 (rows are clickable, no button look) | Qi Breathing (already owned) |
| Stats | 727 / 764 | 6.5× / 7.6× | 5 | Root + personality badges; clan/family/heir/branch-war actions are ~5 screens down |
| Explore | 808 / 872 | 7.2× / 8.6× | 28 / 38 | **Automation panel**, not exploration |
| Craft | 618 / 618 | 5.5× / 6.1× | 15 / 19 | Equipped slots |
| Pack | 420 / 420 | 3.8× / 4.2× | 8 | Filters |
| Sect | 716 / **1498** | 6.4× / **14.8×** | 20 / 38 | Sect header; war, orders, buildings, disciples, recruit all stacked below |
| Log | — | 1× | 0 | Event list |
| ⚙ Settings (overlay) | 664 in 499 | 1.3× | — | fine |
| Ancestral Hall (overlay) | 627 in 526 | 1.2× | — | fine |

The smallest text is 9px throughout (tabs, section titles, meta lines). The whole UI has only 7 `title=` tooltips,
and they're hover-only, so they don't work on iOS.

### Structural findings (these drive 1.7 / 1.8b)

1. **Inverted space budget.** The passive display (sprite + 4 bars + stage text, ~350px) gets 3× the room of the
   interactive area (~105px). Idle-watching and decision-making need different layouts. Overlay should be the
   *watching* view: compact bars and a **"needs attention" strip**. Expanded/Desktop should be the *doing* view:
   the tab body gets most of the window.
2. **Stats is a junk drawer.** One scrolling list mixes raw stats, clan politics (challenge head, branch war,
   secede), family (spouse, lovers, planning, children, heir, tournament), the Ancestral Hall button, Pass the
   Mantle and the banter log. The game's biggest life decisions sit 5+ screens deep in a tab called "Stats".
   → Split into **Character** (stats + breakdowns), **Family** and **Clan** views.
3. **Automation is duplicated and in the way.** The same panel renders at the top of Explore *and* both Sect
   views, pushing each tab's real content below the fold. → Move it to one place (a Mode panel off the 💤/⚡
   button, or ⚙) and leave a small per-tab indicator.
4. **Seven 9px tabs won't scale.** The M3–M8 roadmap adds Dao, alignment, constitution, world/NPCs, dungeons and
   the Immortal systems. A 300px tab bar can't take more. → Grouped navigation (e.g. Cultivate · Adventure ·
   Family & Clan · Sect · Pack · Log) with sub-tabs, or an icon rail in the wider modes.
5. **No "needs attention" layer.** Pending proposals, family matters, war calls, ready breakthroughs, finished
   expeditions and heir/tournament decisions are either auto-opened modals or buried buttons. Tabs have no
   badges. → An attention strip plus tab badges, which doubles as the Banner-mode summary.
6. **Numbers without reasons.** BT chance, Qi/s, Qi cap and Integrity are shown as totals only. The engine
   builds BT chance from ~10 sources (techniques, weapon, artifact, beasts, sect, devoted spouse, sabotage,
   catch-up, karma), and none of them are itemized. → Breakdowns you open by clicking (not hover, so iOS works).
7. **Actions only discoverable by scrolling.** Challenge the Head, Declare War, Secede, Name an Heir, Tournament,
   Pass the Mantle and Found a Sect appear only when their conditions are met, deep in long lists, with nothing
   pointing at them. When the conditions aren't met, the button is simply absent, so the player never learns
   it exists or what unlocks it. → Show it disabled with "requires …" instead.

### Per-system gaps

Severity: **H** = hurts every session or hides a core decision · **M** = real friction · **L** = polish.
Home: **O** Overlay · **E** Expanded · **D** Desktop · **B** Banner.

| System | Can't see / understand | Can't do / hard to reach | Sev | Proposed home |
|---|---|---|---|---|
| Core loop (Qi, BT, Integrity) | BT chance and Qi/s totals have no breakdown; what Integrity does is never explained; karma silently adds to BT (karma/1000); the cost of a failed BT is never previewed | — | H | Breakdowns on the bars (O/E/D); BT button shows chance + main risk |
| Health / Age | What damages or heals health; age is a bare number (no meaning since lifespan was removed) | — | M | Health breakdown; Age moves to Character, off the main bars |
| Ancestral catch-up (2.7e) | `derived.catchUp` (×2.5 Qi, +10% BT, auto-BT) is **never shown**, so the player just goes mysteriously fast | — | H | Badge by the Qi rate: "Ancestral echo ×2.5 until <stage>" |
| Techniques | Bonuses in shorthand (×1.2 Qi/s); no total from all techniques; locked rows say "Stage 12+" (a number, not a realm name) | Learning = clicking a row that doesn't look clickable | M | Card grid in E/D; realm names |
| Explore / expeditions | Loot odds, danger and enemy tier per location not shown; lootMult / hiddenLocations effects hidden | Content sits under the automation panel | M | Location cards showing risk/reward (E) |
| Beasts | Trait effects and beast BT bonus hidden; the roster lives in Explore | Beast management split between Explore and war offerings | M | Own sub-view (Adventure → Beasts) |
| Road encounters (seduction) | Success odds and consequences not previewed | Easy to miss in Explore; ties into family | M | Attention strip + card |
| Crafting / equipment | No compare-before-equip; sectCraftDouble / herb bonuses hidden | — | M | Side-by-side compare (E/D) |
| Pack | Inventory shown in **both** Pack and Explore | — | L | Pack only |
| Joined sect | What your rank gives you; sect bonuses (bt_floor, herb mult) not listed | Long mission list; donate is fixed at 10 | M | Sect overview card listing active bonuses |
| Member wars + Standing Orders | Win odds only shown during a call; order effects are hover-only text | Orders mixed into the mission list | M | War as its own section, orders beside it |
| Own sect | Building effects are one line each; per-disciple contribution hidden; **15 screens** of scroll | Everything in one list | **H** | Sub-views: Overview · Buildings · Disciples · War (E/D) |
| Automation / Active-Idle mode | What Active Mode actually gives (BT focus window, Push Harder, Master's Touch) is never explained | Duplicated in 3 places | H | One Mode panel off the 💤/⚡ button |
| Family (spouse, lovers, children) | Why affection changes, and its trend, are not shown; morality/tolerance hidden (`morality` has **0** UI references); children shown minimally (youngest 12 only) | All in Stats, 5+ screens down; pending matters come only as a modal or a buried button | **H** | Family view (E/D) + attention strip — **fixed in 1.8b-3a** (affection trend + cause + breakdown, morality words on every child, all children, actions on the cards) |
| Heir / Tournament | Heir candidates aren't compared (strength, bond, trauma) | Buttons deep in Stats | H | Family → Succession panel |
| Clan politics (2.6e/f) | Clan relations (rival/ally, `clan.relations`) have **0** UI; other clans are invisible; branch strength is a bare "A vs B" | Challenge/war/secede buttons deep in Stats, and **absent** (not disabled + explained) when unavailable | **H** | Clan view: lines/branches, head, relations, actions with requirements shown |
| Ancestral Hall / legacies | Merit sources per life not shown; blessingStacks hidden; Buy buttons look active with 0 Merit | **No UI to choose the Family Manual technique**; the Hall is only reachable from Stats | H | Hall reachable from nav; manual picker |
| Bloodline / Ascension | Bloodline Quality hidden until the first Ascension attempt, though it drives survival odds | — | M | Character view, shown from Spirit Severing on |
| Death / interlude | Works well (dedicated overlay) | — | L | keep |
| Random events | Plain log lines, no choices (the CLAUDE.md depth rule wants choice events) | — | M (design) | Event cards through the attention strip (future) |
| Banter | Log buried at the bottom of Stats | — | L | Log tab filter (Events · Banter) |
| Log | One flat list, no filters | — | L | Filters by type |
| Settings | Fine | — | L | Add layout mode + banner edge (1.7) |

### User decisions on the audit (2026-09-26)
- **All four priorities approved for 1.8b:** nav regroup + attention strip + tab badges (automation moves to one
  Mode panel) · split Stats → Character / Family / Clan (+ own-sect sub-views) · click-to-open breakdowns ·
  the UX-debt quick fixes.
- ✅ built in 1.7 (see "Layout modes"). **Overlay (default) is the active-play mode**, not a passive "watching" view. Make it **taller (300×700, as the 6E
  spec says) and compact the top section a bit**, so the tab area gets substantially more room. This replaces
  finding 1's "Overlay = watching" suggestion.
- **Banner is the "while gaming / doing other stuff" mode:** a thin strip pinned to the **top of the screen, like a
  taskbar**, carrying the essentials plus the attention strip. Top is the default edge.

### Priorities proposed for 1.8b (approved: all)
1. Layout modes (1.7), with Expanded/Desktop giving the tab body most of the window; compact the Overlay chrome.
2. Navigation regroup + tab badges + attention strip (findings 3, 4, 5, 7).
3. Split Stats → Character / Family / Clan; own-sect sub-views.
4. Click-to-open breakdowns (BT chance, Qi/s, Integrity, catch-up), iOS safe.
5. UX-debt quick fixes: Family Manual picker, catch-up badge, clan relations list, "locked because…" instead of
   hidden buttons.

## Gotchas
- **CSP blocks inline style attributes.** index.html's CSP is `style-src 'self'`, so `style="…"` in HTML set via
  innerHTML is ignored by Chromium. Until 1.8b-1 ~57 of them in game.js were silently dropped (colors, widths). A
  MutationObserver shim at the top of game.js re-applies them through CSSOM (allowed). New code: use classes.
- `#tab-body` has `overflow: hidden`; individual `.panel` divs have `overflow-y: auto` — add scrollable content inside panels, not on tab-body
- Rendering on every frame (not just on state change) is intentional for live timers (expedition countdown) — this is acceptable at 300px scale
- The "Events" tab was renamed "Log" in Phase 2 HTML (tab label) but its panel id remains `tab-events` and its data-tab is `events` — don't rename the id/attr without updating all references
- Window always-on-top must use the `'screen-saver'` level (`main.js` `createWindow()` + `toggle-always-on-top` handler), not plain `alwaysOnTop: true`. Windows drops a normal-level always-on-top window behind an exclusive-fullscreen game as soon as the game regains focus — `'screen-saver'` is the highest level Electron exposes and is what actually survives on top of a fullscreen game. Any code path that calls `setAlwaysOnTop` must pass this level or the window will silently start disappearing behind games again. Default spawn position is top-right (`x: sw-W-20, y: 20`) per user request — the window still remembers a dragged position across restarts via `window.json`.
- `#btn-pin` shows pinned state visually (`.pinned` class = gold glow, matches `--gold` active-state convention). `toggleAlwaysOnTop()` is `ipcRenderer.invoke` (not `send`) and resolves the new boolean state from `main.js`'s `ipcMain.handle('toggle-always-on-top', ...)` — the click handler in `game.js` awaits it to update the class + title. The iOS/browser shim (`platform-storage.js`) has no real window, so its `toggleAlwaysOnTop` is a no-op that always resolves `true` just to keep the button's state logic from breaking there.
