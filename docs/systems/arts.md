# Arts & Move Combat — Spec (Phase 42)
_Covers (planned): assets/data/arts.js (ARTS, rarity, elements, movesets) · game-state.js (art library, study, loadout,
the move-combat engine replacing Press/Guard/Feint, selling) · renderer/game/arts-view.js (Path → Arts) · combat.js
(battle page moves) · battle-scene.js (move effects) · backpack (Sell) · Phase: 42 · Spec written 2026-09-29 (user
request) · Status: **42-0 ✅ (selling) · 42a ✅ (arts core, 2026-09-29)** · 42b–d not built_

**User request (2026-09-29):** "I hate that" (Press/Guard/Feint: a small ±18% lever, and useless against an opponent
with no habit). Replace it with **Pokemon-like combat**: you equip moves from your **Arts**. There should be many, many arts
of different rarities. Some you get by breaking through; many are looted, won in the Arena, or come from other sources.
Not every art is a combat art, but a good share are. Have a screen to pick **4 active combat arts** (the moves) and a
realm-based number of **passive arts**, swappable, with no limit on how many you learn. An art arrives as an **item (a
martial art manual) that you study**. Non-combat arts wait until later; combat arts come next. Also plan **selling
extra items**.

**User decisions (2026-09-29):** moves cost **combat Qi from a pool that refills each turn** (the user first picked cooldowns too, then, the same day:
"no cool down, you can spam them until you run out of Qi and have to wait for regen") · a **parry quick-time event** (user 2026-09-29: hit the timing and the enemy does no damage and you regain a chunk of Qi) · the **Five Elements cycle** decides matchups · selling is a **Sell button in Pack** at fixed prices.

---

## Build split

| Task | What | Needs |
|---|---|---|
| **42-0** | **Sell items** (Pack → Sell). Independent and small, so it goes first | — |
| **42a** | **Arts core:** `ARTS` data (the combat library), manuals as items, study, library, loadout (4 moves + passive slots by realm), breakthrough grants, drop wiring, **Path → Arts** screen, `root.elements` | 42-0 (manual resale) |
| **42b** | **Move combat engine + battle page**, beasts first: HP, combat Qi (no cooldowns), the parry QTE, elements, statuses, turn order, opponent AI, beast movesets, prepare-panel estimate, "why" card, move effects on the scene | 42a |
| **42c** | **People on the new engine:** duels, head challenges, step-down bouts, road slaughter, the Arena. Person movesets (`p.arts`), scouting, rival counters, arts as Arena prizes, sect library | 42b |
| **42d** | **QA & Balance** (CLAUDE.md): sim bot policy, multi-seed sim, checks, smoke in all modes, UX walkthrough, dist + build:web | 42c |
| later (23E) | **Non-combat arts** (Solitary Lineage, Tortoise Breath, Heaven-Evading, Blood Refinement…) as content on the 42a library. No new infrastructure | 42a |

Existing **Techniques** (bought with stones: Qi/s, Qi cap, BT chance) stay as they are. They are cultivation methods, not
arts. The two lists sit side by side under Path.

---

## Arts

### Shape (assets/data/arts.js, data only)
```
ARTS[id] = {
  id, name, nameCN,               // nameCN is flavour (shown as content, cjk-ok)
  kind: 'move' | 'passive' | 'utility',   // 'utility' = non-combat (23E later)
  element: 'metal'|'wood'|'water'|'fire'|'earth'|'neutral',
  rarity: 'yellow'|'profound'|'earth'|'heaven'|'immortal',   // the classic 黄 玄 地 天 grades + one above
  minStage,                        // too profound to study below this realm
  path: 'any'|'virtuous'|'demonic',   // demonic arts cost karma to study/use (Phase 24/13 hook, PLAN 2134)
  // move only:
  move: { type: 'strike'|'multi'|'charge'|'ward'|'counter'|'buff'|'hex'|'heal'|'drain'|'finisher',
          power, cost, priority?, hits?, status?: { id, chance, turns }, self?: {...}, desc },
  // passive only:
  passive: { stat: 'might'|'ward'|'swift'|'qiPool'|'qiRegen'|'crit'|'elementBoost'|'statusResist'|'lifesteal'|…, value, desc },
  mastery: [ …5 levels: power/cost/effect steps ],
  lore, flavor, source: ['breakthrough'|'expedition'|'beast:<type>'|'arena:<ring>'|'sect:<id>'|'event'|'duel'] }
ART_RARITY = { yellow: {color token, studySeconds, sellValue, dropWeight}, … }
ART_PASSIVE_SLOTS = [ by realm: Mortal 1 · Qi Condensation 1 · Foundation 2 · Core 3 · Nascent Soul 4 · Spirit Severing 5 ]
ELEMENT_OVERCOMES = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' }   // ×1.5 / ×0.67
```

### The library (launch target, 42a)
**72 combat arts:** 12 per element (8 moves + 4 passives) × 5 elements, plus 12 neutral. Rarity mix: about 30 Yellow ·
20 Profound · 13 Earth · 7 Heaven · 2 Immortal. Each element has a clear identity, so a loadout is a real choice:

| Element | Identity | Status it inflicts | Examples |
|---|---|---|---|
| Metal | burst damage, armour break, crits | **Bleed** (damage each turn) | Autumn Blade Qi · Ten Thousand Swords Rain (Heaven, multi-hit) · Unbreakable Edge (passive: crit) |
| Wood | sustain: drain, regen, poison | **Entangle** (costs Qi to act) | Spring Vine Binding · Life-Stealing Thorn · Evergreen Heart (passive: regen) |
| Water | control, slows, Qi drain | **Chill** (acts last, −speed) | Frost Lotus Palm · Tide-Turning Current (counter) · Deep Pool Breath (passive: Qi regen) |
| Fire | raw power, charge moves, self-risk | **Burn** (damage each turn, stacks) | Heart Flame Fist · Phoenix Rebirth Blaze (Earth grade: charge) · Blazing Marrow (passive: might, less ward) |
| Earth | guard, counters, stuns | **Daze** (a chance to lose the turn) | Mountain-Bearing Stance (ward) · Collapsing Peak (finisher) · Iron Body (passive: ward) |
| Neutral | fundamentals + oddities | — | Palm Strike (0 Qi, everyone knows it) · Qi Shield (everyone) · Void Step (priority dodge) |

A writing brief for names/lore goes in 42a (same idea as banter-writing-guide.md): xianxia-translation voice, one
flavour line each, no emoji, the effect in plain words.

### Getting arts (sources)
- **Breakthroughs:** the first layer of each new realm offers **a choice of 3 arts** (one of your root's element when
  you have one), and you keep one. That's the player's choice, never a roll that decides for you (agency rule). Some
  layers inside a realm grant a fixed "realm fundamentals" art (a Yellow neutral move).
- **Expeditions:** a `rareDrops` art-manual entry on `LOCATIONS` (about 1–4% per run, the tier sets the rarity). Beast
  expeditions can bring manuals home too.
- **Beasts:** slaying a beast has a chance to drop an art of its element (e.g. Thunder Eagle → Thunder Talon Strike). The
  Golden Dragon has an Immortal art. Binding or sparing a beast never drops one (mercy keeps its secret).
- **Arena:** each ring's prize table gets manuals, and each **ring champion guards a signature art** that you win with
  the title.
- **People:** a duelist you **raise** may teach you one of their arts (a debt paid); one you **finish** drops their manual.
- **Sects:** a joined sect's **library** sells its element's arts for Contribution by rank; a founded sect's Scripture
  Pavilion building lets disciples bring arts home.
- **Events:** new RANDOM_EVENTS with positive and negative variants, such as a dying hermit's scroll (take it / bury him
  with it: karma), a forged manual (study it and lose Qi), or a rival sect's stolen art (keep it, and war risk rises).
- **Clan:** any art you know can be **written into the clan library** (Kin → Hall). Heirs of the line study it at half
  the time (the 23E inheritance idea, pulled forward for combat arts).

### Manuals, study, mastery
- A manual is an item: `ITEMS['manual_<artId>']`, category `'manual'` (a new Pack chip **Arts**), generated from ARTS so
  the two never drift.
- **Study** a manual from Pack or from Path → Arts. Studying runs one at a time on a real-time timer (by rarity: Yellow
  1 min … Immortal 2 h), and **Comprehension** speeds it up (`s.comprehension` already exists and is otherwise unused).
  The manual is consumed. Your realm must be ≥ `minStage`, otherwise the manual is locked with "Too profound: opens at
  <realm>". Studying runs while you're away (a timer, like expeditions).
- **No limit on arts known.** `s.arts.known = { [artId]: { mastery 1–5, xp, uses } }`.
- **Mastery:** using a move in battle gives mastery XP. Studying a duplicate manual jumps it +1 level (or you can sell
  the duplicate). Each level lowers the cost or raises the power, and level 5 unlocks the art's extra effect (e.g.
  Frost Lotus Palm 5: Chill lasts a turn longer).

### Loadout
- **4 active move slots** and **N passive slots** (ART_PASSIVE_SLOTS by realm). Locked slots show "opens at <realm>".
- Swap freely outside a fight. The loadout is locked while a fight is underway (the battle page says so).
- An empty move slot falls back to Palm Strike, so you can never enter a fight with no move.
- (Polish, 42d) two saved loadouts ("Hunt" / "Duel").

---

## Move combat (42b–c) — replaces Press / Guard / Feint

### Per fight
- **HP.** Your battle HP **is your real Health** (0–100), so wounds carry out of the fight exactly as today (23A hook).
  An opponent's HP scales from its power (realm, Might, variant, traits, mood; for people, stage + root + temper).
- **Stats.** From power: **Might** (damage), **Ward** (damage taken), **Swift** (who acts first). Passives and buffs
  modify them. The realm gap still matters most: a stage up is still worth roughly +25% win chance, as today.
- **Combat Qi, no cooldowns** (user 2026-09-29: "you can spam them until you're out of Qi and have to wait for regen").
  A pool (base 100 + passives) starts full and refills +15 per turn (+ passives). Each move costs 0–60, and you can use
  the same move every turn as long as you can pay for it. Qi is the only limit, so the choice becomes spend now vs. save.
  Two basic actions everyone knows: **Palm Strike** (0 Qi, weak) and **Circulate** (no attack, +35 Qi this turn; a parry
  during a Circulate turn refunds double). The fight can never lock you out.
- **Turn.** Both sides pick a move → the higher Swift acts first (priority moves go first) → effects apply (enemy
  attacks open a **parry window**, below) → statuses tick → Qi refills. Target length: **4–8 turns**.
- **Damage** = move power × (attacker Might ÷ defender Ward) × element (×1.5 overcomes / ×0.67 overcome / ×1) ×
  **root affinity** (+20% when the art's element is one of your root's elements) × a small spread (0.9–1.0) × crit.
- **Elements everywhere.** Beasts have an element (fox fire, eagle metal/thunder → metal, tortoise water, bear earth,
  python wood, and so on). A person's element comes from their root. Their element is shown once you know it.
- **Statuses:** Bleed, Burn, Entangle, Chill, Daze (one per element), plus Seal (one move locked) and Guard Broken
  (Ward down). Each has a visible chip with turns left and a one-line tooltip.
- **Retreat / Yield, stances and end choices stay** (Slay / Drive off; finish / spare / bind; raise / humble; the yield
  acceptance roll). Only the exchange loop changes.

### Parry (quick-time event) — user 2026-09-29
"If you hit the parry timing the enemy does no damage and you regen a chunk of Qi."
- **When:** every enemy **attack** (strike, multi-hit, charge, finisher) is telegraphed on the battle scene. A ring closes
  on your figure, and a **Parry** button / Space / tapping the scene is live. Each hit of a multi-hit move is its own
  window. Hexes, heals and buffs can't be parried, so status play stays a real counter.
- **Success:** the hit does **0 damage** and you gain **+`PARRY_QI` (25) Qi** (×2 on a Circulate turn), with a
  "Parried!" flash, a ward ring on the scene and a log line. Statuses riding on that hit are blocked too.
- **Timing:** the window is `PARRY_WINDOW_MS` (≈250 ms, clamped 120–450), widened by your Swift over theirs, earth ward
  passives and the art's mastery, and narrowed by priority and multi-hit moves. A **charge** move telegraphs a turn
  ahead (slow and easy), while a finisher is tight. The lead-in (≈0.7–1.1 s) varies a little so it can't be learned
  blind. Pressing **early** is a whiff: that hit can't be parried again. That prevents mashing.
- **Opponents parry too, by a roll** (the world's action): a chance from realm, temper (stoic/grumpy high, hotblood low)
  and earth passives, shown once scouted ("parries often"). A parried player attack refunds *their* Qi, so spamming your
  big move into a guarder is a mistake you can see coming.
- **Access:** ⚙ **Parry window: Normal / Wide (×1.6) / Off**. Off means no prompts and hits land normally; nothing is
  parried for you, since the parry is the player's own action and is never simulated (agency rule). Reduced motion swaps
  the closing ring for a filling bar. The window never depends on frame rate (timestamps, not frames).
- **Honest odds:** the prepare estimate assumes **your own recent parry rate** (the last 30 windows,
  `s.arts.parry = { tries, hits }`, starting at 30%), and the "why" card says so ("assumes you parry 42%, your recent
  rate"). The sim bot has a per-profile parry rate (casual 20%, active 60%).

### Opponent AI (the world's rolls, allowed by the agency rule)
- **Beasts:** a fixed moveset per type (3–4 moves in `BEAST_MOVES`). Their habit (A6-1 `BEAST_FIGHT_STYLE`) becomes
  move weights: the aggressive eagle favours strikes, the tortoise wards.
- **People:** `p.arts` (3–4 moves + passives by realm; rolled from their root element and temper when first needed,
  then kept on the person). Temper sets the choice policy: hotblood → highest damage; stoic → ward when hurt;
  coward → heal/escape; psycho → hexes; arrogant → the flashiest charge move.
- The AI reads the board (your statuses, its Qi, element matchups) with temper-weighted scoring and a little noise,
  so it isn't perfectly predictable.

### Surface the odds honestly
- **Prepare panel:** "about 62% to win" = a quick Monte Carlo of the fight (~300 runs, with a competent default policy
  for you: best expected damage, heal when low), labelled **estimate**. The "why" card lists power, the element matchup,
  your loadout's best move against it, their known moves, and wounds.
- **During the fight:** each move button shows Qi cost, power, element, and **"overcomes / weak"** against the
  target's known element. Also shown: both HP bars, your Qi bar, status chips, and a turn log that names every cause
  ("Frost Lotus Palm overcomes fire: 34 damage, it is Chilled").

---

## Depth pass
1. **Memory.** `s.arts.known` (mastery, uses); scouting: `bestiary[type].movesSeen` and `p.vsYou.movesSeen` (an
   opponent's moves stay hidden until you have seen them used); the clan library across generations; a rival's `p.arts`
   grows over time.
2. **Choices.** The breakthrough pick-1-of-3; which 4 moves + passives to bring (element coverage vs root affinity vs
   mastery); every move in every turn; study order; learn, sell, or copy a duplicate into the clan library; events
   (take the hermit's scroll or bury it with him).
3. **Hooks (≥3).** Breakthroughs (grants) · Health & Death (HP = Health) · beasts (element movesets, art drops, binding)
   · Arena (champion arts, prizes) · duels / clan (raise → taught, finish → manual; rivals) · sects (library for
   Contribution; Scripture Pavilion) · clan Hall (library for heirs) · karma (demonic arts; finishing to loot a manual)
   · random events · Pack/economy (selling manuals).
4. **Drama.** Best: the grudge-holder you humbled comes back with a water art to drown your fire, and you win anyway with
   the Metal art the Arena champion guarded, and they finally yield. Worst: you study a forbidden demonic art for its
   power, it costs karma each use, and in a blood match your Seal-ed signature move leaves you with Palm Strike against
   a champion. Also possible: an heir inherits the family's Immortal art and the clan's name rises on it.
5. **Feedback.** **Rival counters:** a person who lost to you notes your most-used element. Once they hold a grudge,
   their next art is one that overcomes it (they train against *you*). Your reputation shows as a log line ("They say the
   Lin heir fights only with fire"). Beasts you've slain many of never adapt (beasts don't train), but a *vengeful*
   returning beast gets a counter-element move.
6. **Agency.** Player decisions in this feature: the breakthrough pick, study, the loadout, every move, every parry, retreat/yield,
   end choices, selling. All are explicit. The world rolls: opponent moves, drops, the rival's counter-art, the event
   that offers a manual. **There is no auto-battle.**

## UX pass
1. **Surface.** Path → Arts shows everything: known arts with element mark, rarity colour, cost/power, mastery
   pips, where it came from; locked passive slots with the realm that opens them; the study timer; unknown arts
   discovered so far as silhouettes ("12 of 72 found"). The battle page and "why" card follow the rules above.
2. **Interact.** **Path → Arts** (a new sub-tab beside Techniques and Character): Expanded/Desktop = Library list on the
   left (filters: Moves / Passives, element, rarity, "can study") and the **Loadout** on the right (4 move cards in a 2×2
   grid like a Pokemon move screen + a passive strip). Click a slot → pick from the matching arts, one click to swap.
   Overlay (300px) and phone: the loadout on top, the library as a list below, and slot picking as a sheet. Battle page:
   the 4 moves as a 2×2 grid of big buttons (keys 1–4) + Circulate, Retreat/Yield underneath; during an enemy attack a
   large **Parry** button (Space) takes over the lower panel so it is a thumb-sized target on phones.
3. **Discover.** A new manual → toast + a badge on Pack and Path + an attention item "An art manual to study". A
   breakthrough grant → a choice card that can't be missed (it waits until you pick; nothing is lost). The first enemy attack of your first new-engine fight slows down with a one-line "Parry when the ring closes" tutorial. The first
   visit to Arts → a one-line hint. A free passive slot at a new realm → a badge on Arts.
4. **Feel.** Rarity tokens (Yellow → --dim-hi, Profound → --jade, Earth → --purple, Heaven → --gold, Immortal → a gold
   shimmer). Five element marks + move-type marks join the SVG icon set (Visual Review Gate, assets ≥ 8.0). Each move
   type has its own effect on the battle scene: slash crescents (metal), vines (wood), frost ripples (water), flame
   burst (fire), falling stone + ward (earth). Honor ⚙ text size, colour-blind (element marks differ by shape, not only
   colour) and reduced motion.
5. **UX debt found.** The current fight's single win % hides that tactics barely matter (the reason for this phase). No
   item has a price. Comprehension has no UI.

---

## Selling (42-0)
- `ITEMS[id].value` (Spirit Stones per unit, data); items without a value get a default by category/tier. Currency and
  key items can't be sold.
- `sellItem(itemId, n)` → `{ ok, stones } | { ok:false, reason: 'unknown'|'unsellable'|'equipped'|'not_owned'|'invalid_qty' }`.
  It uses the discardItem decrement pattern and logs "Sold 12× Spirit Herb for 36 stones."
- Pack row: **Sell** beside Discard, with ×1 / ×10 / **all but 1**. Rare items and art manuals ask for confirmation.
  Equipped items show "Unequip first". Manuals for an art you already know are tagged "you know this: study for
  mastery or sell".
- Prices stay low enough that selling never rivals expeditions or the Arena (tuned in 42d / 2.8). Selling doesn't
  replace the Auction House (Phase 36), which still comes later for rare goods and bidding.

## Migration
- `_ensurePhase42Fields()`: `s.arts = { known: { palm_strike, qi_shield, + a root-element Yellow starter }, loadout:
  { moves: [...4], passives: [] }, study: null, clanLibrary: [] }`; `root.elements` parsed from the old root name (pure
  → its element; dual → 2 random, fixed once; mixed → 3; heavenly → all 5) for you and every person record.
- A save paused mid-fight on the old engine: that fight restarts on the new engine at its current Health (it can't be
  converted exactly). Tested by a check.
- The FIGHT_TACTICS / FIGHT_STYLE / `_exchangeChance` path is removed in 42c after every fight kind has moved over
  (`FIGHT_STYLE` survives as the AI temper weights).

## Tests (to write while building)
- checks/arts.js: study gates, mastery, loadout rules, slots by realm, breakthrough offers, drops, migration.
- checks/combat.js + duels.js + arena.js rewritten for the new engine: element multipliers, status ticks, Qi pool + refill, parry window + Qi refund,
  turn order, HP = Health, death in Slay / blood, the estimate is within ±5% of a 2,000-run Monte Carlo.
- checks/sell.js. Smoke: scenarios/arts.js (screen in all modes) + combat/duels/arena updated.

---

## 42a as built (task 1.12, 2026-09-29)
- **Data** `assets/data/arts.js`: **79 combat arts** (56 moves, 23 passives; Yellow 27 · Profound 20 · Earth 18 · Heaven
  12 · Immortal 2); 12 per element + 19 neutral incl. the basics. **Signature arts** for all 10 beast types
  (`sig: 'beast:<type>'`) and all 6 Arena rings (`sig: 'arena:<ring>'`; Heaven's Ring → Heaven-Severing Sword Intent,
  the Golden Dragon → Golden Dragon Divine Fist). One Yellow **starter** move per element. ART_ELEMENTS / ELEMENT_OVERCOMES /
  ART_STATUS / ART_RARITY (study 1 min → 2 h, sell 3 → 200) / ART_PASSIVE_SLOTS / ART_OFFER_WEIGHTS / drop tables /
  BEAST_ELEMENT. Move numbers (power/cost/status) are first-pass for the 1.13 engine.
- **Manuals**: game-state.js registers `ITEMS['manual_<id>']` (category `manual`) from ARTS at load; itemValue prices them
  by grade. Pack chip **Arts**; a manual row has Study (or its lock: too profound / studying another / mastered) and
  "See it in Arts".
- **Root elements**: `Persons.rootElements(root, seed)` — pure = the element in its name, heavenly = all five, dual 2 /
  mixed 3 by a **hash** (no Math.random, so sim seeds don't move). `s.root.elements` set by `_ensurePhase42Fields`
  (other persons get theirs in 1.14).
- **State** `s.arts = { known: {id: {mastery, xp, uses, how, at}}, loadout: {moves[4], passives[5]}, study, offers[], found{} }`,
  per life (`_newGame` sets null → `_ensurePhase42Fields` fills: Palm Strike + Qi Shield + your root's starter, all three
  equipped). Passives beyond your realm's slots stay stored but inactive.
- **API**: `artsInfo()`, `artStats(id)` (mastery: +8% power / −1 cost per level), `artStudySeconds(id)` (÷ 1 + 0.05 ×
  Comprehension, never below half), `artStudyLock(id)`, `studyArt(id)` / `cancelStudy()` (the manual goes back) /
  `_finishStudy` (tick(); timestamps, so it completes after a closed game too), `_learnArt(id, how)` (known → +1 mastery),
  `_grantManual(id, where)`, `_rollArt(weights, element)` (prefers unknown arts 80%, never signatures/basics/grants),
  `_offerArts(realm)` + `chooseArtOffer(offerId, artId)`, `setArtSlot(kind, index, id|null)` (swaps; refuses mid-fight,
  locked slot, wrong kind, unknown), `passiveSlots(stage)`, `rootElements()`.
- **Sources wired**: breakthrough into a new realm → offer of 3 (one of your element; waits, never expires); Layer 4 and 7
  grant Drifting Step Palm / Rising Qi Kick; expeditions (2% + 1%/tier); beast **Finish** → its signature (6–25% by
  tier) else 5% a manual of its element; Arena **first title** → the champion's art, any win 6% a manual. Sect library,
  events, duelists and the clan library are 42c.
- **UI** `renderer/game/arts-view.js` (Path → Arts, `#tab-arts`): offer card, root line, study desk (live countdown via
  `ArtsView.tickInPlace`), 2×2 moves + passive strip (locks name the realm), library (found count, kind/element chips,
  rows → effect/lore/slot buttons; picking a slot filters to equippable arts and scrolls to them). Attention:
  `arts-offer` / `arts-study` (ready) and `arts-slot` (idle). Six **element icons** `el_*` + element/grade CSS tokens.
- **Tests**: `scripts/sim/checks/arts.js` (44) · smoke `scripts/smoke/scenarios/arts.js` (Overlay / Expanded / Desktop /
  phone, early + late). Not done here: battle use (1.13), the sim bot doesn't study/equip (1.15), a tutorial hint.
