# Arts & Move Combat — Spec (Phase 42)
_Covers (planned): assets/data/arts.js (ARTS, rarity, elements, movesets) · game-state.js (art library, study, loadout,
the move-combat engine replacing Press/Guard/Feint, selling) · renderer/game/arts-view.js (Path → Arts) · combat.js
(battle page moves) · battle-scene.js (move effects) · backpack (Sell) · Phase: 42 · Spec written 2026-09-29 (user
request) · Status: **42-0 ✅ (selling) · 42a ✅ (arts core) · 42b ✅ (beasts on moves + scene effects, 2026-09-29) · 42c part 1 ✅ (people on moves, 2026-09-30) · 42c part 2 ✅ (rivals, libraries, study desks, 2026-09-30)** · 42d (QA & Balance, task 1.15) not built_

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
| **42c** | **People on the new engine** (split 2026-09-30): **part 1 = task 1.14a** ✅ duels, head challenges, step-down bouts, road slaughter, the Arena on moves; person movesets (`p.arts`), temper AI, scouting · **part 2 = task 1.14b** rival counters, raise → taught / finish → manual, sect + clan libraries, arts as Arena prizes | 42b |
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
- **Study** a manual from Pack or from Path → Arts. (Since 1.14b: several at once — study desks by realm, see "42c part 2".) Studying runs one at a time on a real-time timer (by rarity: Yellow
  1 min … Immortal 2 h), and **Comprehension** speeds it up (`s.comprehension` already exists and is otherwise unused).
  The manual is consumed. Your realm must be ≥ `minStage`, otherwise the manual is locked with "Too profound: opens at
  <realm>". Studying runs while you're away (a timer, like expeditions).
- **No limit on arts known.** `s.arts.known = { [artId]: { mastery 1–5, xp, uses } }`.
- **Mastery:** using a move in battle gives mastery XP. Studying a duplicate manual jumps it +1 level (or you can sell
  the duplicate). Each level lowers the cost or raises the power, and level 5 unlocks the art's extra effect (e.g.
  Frost Lotus Palm 5: Chill lasts a turn longer).

### Loadout
- **4 active move slots** and **N passive slots** (ART_PASSIVE_SLOTS by realm). Locked slots show "opens at <realm>".
- **Swap freely, even mid-fight.** A battle runs on the deck it began with (`_mbYou` snapshots your slots), so a change
  to your loadout never alters a fight already underway — it only applies to your next one. (2026-09-30: the old
  "loadout locked mid-fight" rule was removed as confusing; it was never needed.)
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
  (`FIGHT_STYLE` survives as the AI temper weights). **Done in 1.14a** (see "42c part 1 as built").

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
  `_offerArts(realm)` + `chooseArtOffer(offerId, artId)`, `setArtSlot(kind, index, id|null)` (swaps; never refused
  mid-fight since 2026-09-30 — a battle keeps its own `you.slots` snapshot; still refuses a locked slot, wrong kind,
  unknown), `passiveSlots(stage)`, `rootElements()`.
- **Sources wired**: breakthrough into a new realm → offer of 3 (one of your element; waits, never expires); Layer 4 and 7
  grant Drifting Step Palm / Rising Qi Kick; expeditions (2% + 1%/tier); beast **Finish** → its signature (6–25% by
  tier) else 5% a manual of its element; Arena **first title** → the champion's art, any win 6% a manual. Sect library,
  events, duelists and the clan library are 42c.
- **UI** `renderer/game/arts-view.js` (Path → Arts, `#tab-arts`): offer card, root line, study desk (live countdown via
  `ArtsView.tickInPlace`), 2×2 moves + passive strip (locks name the realm), library (found count + "· N shown",
  kind / **grade** / element chip rows, rows → effect/lore/slot buttons; picking a slot filters to equippable arts and
  scrolls to them). The **grade** row (2026-09-30) is `Any grade` + the five grades, each chip tinted with its grade's
  colour (`g-<grade>` → `--r-*`); it hides while picking, as the kind row does. Attention:
  `arts-offer` / `arts-study` (ready) and `arts-slot` (idle). Six **element icons** `el_*` + element/grade CSS tokens.
- **Tests**: `scripts/sim/checks/arts.js` (44) · smoke `scripts/smoke/scenarios/arts.js` (Overlay / Expanded / Desktop /
  phone, early + late). Not done here: battle use (1.13), the sim bot doesn't study/equip (1.15), a tutorial hint.

---

## 42b part 1 as built (task 1.13a, 2026-09-29): beast fights on moves
User picks (2026-09-29): split 1.13 → **1.13a** engine + parry + battle UI, **1.13b** per-element move effects on the scene;
parry window "fair, ~300 ms".
- **Engine** (game-state.js → "Phase 42b"): a battle `fi.m` is plain data; `_mbStep(b, rng, provider, youId)` plays a
  turn (order = wards/counters first, then priority, then Swift; Chilled acts last; ties to you) and pauses at an enemy
  attack for the parry QTE (`provider` returns null → `b.pending`). `_mbAct` handles every move type (strike, multi,
  charge (gather → release next turn), finisher, drain, ward (+reflect), counter, buff, hex, heal, Circulate), statuses
  (bleed/burn tick; burn stacks ×3; daze 40% skip; entangle +8 Qi; seal one move; guardbreak ×1.3), lifesteal, qiDrain,
  selfDamage. `_mbDamage` = power × dmgScale × e^(Δpower/333) × element × root affinity × Might/Ward × spread × crit.
  `_mbAi` = habit-weighted beast choice; `_mbPolicy` = the default player policy (estimate + sim bot).
- **Live API**: `startBeastFight` builds `fi.m`; `beastMoves()` (the buttons); `beastMove(id)` (reasons: qi / sealed /
  charging / unknown / decide / parry); `beastParry([bool per hit])` (logs your parry rate, `s.arts.parryLog`, last 30);
  `setParryMode('normal'|'wide'|'off')`; Retreat still `fightExchange('retreat')` (parting blow = its Rake). Win →
  `fi.over = 'won'` → the unchanged end choice. HP = `s.health`; Drive = half damage, thrown down at 10, never below 1.
  Mastery through use: `_artUse` (+1 xp per use; level at ART_MASTERY_XP).
- **Estimate**: `_mbEstimate` plays the fight 300× with its own seeded RNG (never touches Math.random; cached per
  loadout/health/parry rate) at **your recent parry rate** (default 30%). `beastFightPreview` stance cards read it
  (chance, died, turns, hurt, wound = its Rake before parrying).
- **Battle page** (combat.js): plates with Health + combat Qi + status chips + the beast's element/HP; prepare step with the
  element, known arts, estimate per stance and the **Parry window** choice; fight step = last turn in words, 2×2 move grid
  (keys 1–4), Circulate (C), Palm Strike if unequipped, Retreat; the **parry prompt** (a ring closing on a mark, Parry
  button / Space / tap, per-hit pips, "Parried! / Too soon / It lands"; a slower first-time tutorial lead; reduced motion
  = a filling bar). Scene: each side's move is one `ex` event (`nohit`, `foeDmg` floaters). Breakdown `beastfight`
  rewritten for the estimate.
- **Diverged from the spec**: (1) the parry window lives on the battle page (`s.arts.parryMode`), **not ⚙ Settings** —
  settings must stay presentation-only (settings.md invariant #2) and the window changes difficulty. (2) **Your defence
  has no element** (elements only boost your attacks + root affinity): a starter-only character facing a beast that
  overcomes its root was near 0%. So the vengeful beast's "counter-element art" was retired (it keeps its +power).
  (3) Elements ×1.4 / ×0.75 (not ×1.5 / ×0.67). (4) Per-beast HP multipliers (BEAST_HP_MULT) because movesets differ.
- **Balance (first pass, parry 30%, a well-kept loadout)**: same realm ≈ 35–100% by beast (fox 75, eagle 64, tiger 60,
  qilin 35, hound 39), one realm up ≈ 84–100%, the dragons 16–17% at their gate and ~90% two realms up. Starter-only
  loadouts are weaker (fox 63% at Mortal). Parrying is a big lever (0% → 60% parry swings an even fight ~20→80%).
  Tune in 1.15 (the knobs: MOVE_COMBAT.foeDmgMult/foeHpMult, BEAST_HP_MULT).
- **Sim bot**: `battle()` uses `_mbPolicy` + parries at 60% (active) / 25% (casual) / 10%. sim:quick clean.
- **Tests**: checks/combat.js rewritten for beasts (estimate vs real play, Qi, no cooldowns, parry, elements, mastery,
  Drive/Slay, retreat, old-engine migration) · talismans.js winFight on moves · smoke scenarios/combat.js (moves, parry
  prompt, a missed vs an on-the-mark parry, the dragon death) · duels/arena smoke still pass (people keep the old engine
  until 1.14).

---

## 42b part 2 as built (task 1.13b, 2026-09-29): per-element move effects on the scene
- **Event → scene**: `CombatView._sceneEv` adds `fx = { side, id, el, type, hits, mask (1 landed / 0 parried per hit),
  parried, em, crit, status, heal, gather, release, dazed, claw }` to each `ex` event. BattleScene draws an event with
  `fx` by element (`_fxBack` wards behind the figures, `_fxFront` blows in front, additive "lighter" blending so Qi reads as
  light over the dense dot figures; stones and blood opt out). Without `fx` (people fights, old engine until 1.14) the A6
  press/guard/feint art plays unchanged. Motion: attacks lunge (multi-hit = afterimages, earth = a stamp), wards brace.
- **Elements differ by shape** (colour-blind safe): metal = flying sword-light → two crossing cuts + sparks · wood = shoots
  racing along the ground → four thorned vines bursting up · water = crested wave → three frost rings + six-armed ice
  crystals + frost dust · fire = ember comet → flame burst + leaning tongues + embers · earth = the caster stamps → three
  dotted boulders fall, crumble, fragments + dust ring · neutral = the gold crescent + clash burst · a beast's plain Rake
  = claws tinted by its element. Multi-hit spreads impacts u 0.36–0.62.
- **Meaning**: a parried hit breaks on a six-sided ward in front of the defender (jade for you) and the attack's motes fly
  back; overcoming adds an element ring (×1.28 size); resisted = ×0.72 and greyed; a telling blow flares white; release /
  finisher ×1.2. Drain: motes flow back to the attacker. Non-attacks: heal (jade spiral + ground ring), buff (climbing
  ring), Circulate (motes drawn to the dantian), gathering a charge (element orb), hex (a status sigil flies, breaks into
  the status or fizzles grey). Wards by element: blades · woven vines · flowing water arc · flame wall · rising stones.
- **Floaters** gain a small line naming why: overcomes / resisted / telling blow / the status taken; "Parried +25 Qi";
  "+N Health".
- **Status auras** (`scene.setStatus(side, st)` from `_plates`, incl. `charge: <element>`): burn embers · chill frost
  ring + snow + rime · bleed drops · entangle vine helix · daze circling stars · seal rotating ring · guardbreak cracked
  arc · charge orb. Cleared when the fight ends.
- **Parry on the field** (1.13a UX debt): the QTE loop calls `scene.telegraph({ k, hot, el })` each frame with the panel
  ring's exact k (timestamps, never frames), so a dotted ring closes on your figure and the beast draws back gathering
  light; `parryFlash(ok)` on a press (ward on the mark / red broken ring too soon). Cleared when answered or on Step back.
- **Reduced motion**: no flying projectiles or closing ring (impacts, auras and the brightening mark stay, static).
- **Perf**: a busy frame (three-hit fire + five auras) ≈ 2 ms. **Tests**: smoke `scenarios/battle-fx.js` (effect sheet
  pages + all four modes); combat.js smoke unchanged and passing.

### Parry pacing + the on-field prompt (user 2026-09-29, after 1.13b)
- **Fewer prompts** ("parries happen a lot"): `_mbTelegraphed(b, art, rng)` decides once per enemy blow (stored on the
  plan entry, so resuming after the QTE never re-rolls): charges, finishers and the beast's strongest arts
  (≥ `MOVE_COMBAT.parryBigShare` 0.9 of its top power × hits) **always** open a parry window; any other blow only
  `parryPromptChance` (35%). An untelegraphed blow lands (`ev.unwarned`, log: "Too quick to parry."). The live fight,
  the estimate and the sim bot share `_mbStep`, so the odds stay honest. To compensate, **`foeDmgMult` 1 → 1.15**.
  sim:quick after: no beast deaths, win/finish counts unchanged.
- **The prompt is on the field** ("instead of blocking all your moves with a pop-up"): `#combat-parry` sits in
  `#combat-stage` between the figures (the attack's name, PARRY / Space, per-hit pips, feedback; glows when the window
  is open; jade on a parry, red when missed). The closing ring is only on the canvas now (BattleScene.telegraph);
  Reduced motion keeps a filling bar in the control. The move panel stays in view, locked ("parry first") under a red line
  naming the blow (the first time: how to parry).
- **Beast end cards say why karma moves**: "+3 karma · a man-eater: ending it is a good deed", "−6 karma · a guardian
  beast: its death weighs on you", "+1 karma · mercy"…, and at 0 / 100 what actually applies. The user reported the card
  and the result disagreeing; not reproducible (card = result for every nature). The only real divergence was the
  0 / 100 clamp, now shown. checks/combat.js pins card = result for all natures at 50 / 0 / 100.

---

## 42c part 1 as built (task 1.14a, 2026-09-30): people on moves
User pick (2026-09-30): split 1.14 → **1.14a** every fight kind on moves (this) and **1.14b** the rival/library layer (rival
counters, raise → taught / finish → manual, sect + clan libraries, duelist arts as Arena prizes).
- **Every fight is on moves.** `_startFight(kind, opp, lethal, extra)` builds a person's battle (`fi.m = _mbNewPerson(opp,
  lethal)`); beasts pass theirs in `extra`. The live calls are generic: `fightMoves()` / `fightMove(id)` / `fightParry(hits)`
  (`beastMoves` / `beastMove` / `beastParry` stay as aliases). `fightExchange` only ends a fight now: a beast's Retreat, a
  person's Yield (refused mid-parry; a refused yield is a line in the turn log). `_mbLive` → `_mbLivePerson` for people: a
  win waits for the unchanged end choice (`fi.over = 'won'`), a loss / death runs `_finishFight` (every kind's own outcome).
- **Stances.** A lethal fight = `'slay'` (0 Health kills you). "Until one yields" = `'yield'`: full damage, you are beaten at
  `PERSON_FIGHT.yieldThrownHp` (30) and never go below 1; they yield at `yieldFoeFrac` (30%) of their HP — the loss stays a
  wound (was ~90 Health when only you stopped early). **Wounds carry**: an Arena run or a step-down bracket wears you down
  bout to bout (the Arena's `ARENA_MIN_HEALTH` lock still applies).
- **A person's arts** `personArts(p)` → `p.arts = { moves, passives, element, realm, champ }`: rolled with `_mbRng` seeded by
  id + realm (never Math.random), kept on the record, re-rolled when they cross a realm (`_personRealm` = the
  ART_PASSIVE_SLOTS thresholds). Moves: `PERSON_MOVE_COUNT` (2 / 3 / 4 by stage), their first element's starter + one real
  attack + temper picks (`PERSON_TEMPER_ARTS` × rarity `PERSON_ART_WEIGHTS` — a notch below your offers — × 4 for their own
  elements), all within their realm, never a signature; passives = half your slots at their realm (`PERSON_PASSIVE_SHARE`).
  An Arena **champion** carries their ring's signature art (`_arenaChampionRing`). Root elements: `_personElements` sets
  `p.root.elements` (Persons.rootElements, hashed by id). In a fight they also have Palm Strike.
- **Their side** `_mbFoePerson(p)`: HP `PERSON_FIGHT.hpBase` 100 (like your Health; `hpPerRealm` 0), power = the A6-3a
  person power (realm, root, temper, a grudge's +30), their root's first element, Swift/Qi from passives, a parry roll from
  their FIGHT_STYLE guard (`parryPerGuard`, max 30%), `dmgMult` 1.15 (the same compensation beasts got for fewer parry
  prompts) × `grudgeDmgMult` 1.2 against you when they hold a grudge. **Power spread**: people use `PERSON_FIGHT.powerSpread`
  700 (`fighter.spread`, read by `_mbDamage`) instead of a beast's 333, so one stage ≈ ±25% like the old logistic.
- **Temper AI** (`_mbAi`): FIGHT_STYLE press/guard/feint weights as for beasts, × `PERSON_TEMPER_AI` by move type (the
  hothead's strikes, the arrogant's charges, a stoic's wards and a coward's heals once hurt, the schemer's hexes, the lazy
  one's Circulate); Palm Strike ×0.5 like a beast's Rake. Text: `fighter.the` ("the Spirit Fox" / "Wei"), `fighter.person`.
- **Scouting** `personScouting(p)`: their root (always), which of their arts you have seen (`p.vsYou.movesSeen`, filled from
  the arts they use on you, even a telegraphed one you parry), habits + a parry word once you have fought them
  (`record.fought > 0`). `fightInfo()` for a person: `m`, `scout`, `record`, `feud`, `bracket`, `habitsKnown`, `hint`.
- **Odds everywhere are the estimate.** `personFightOdds(opp, kind, lethal?)` = `_personEstimate` (the same `_mbEstimate`
  Monte Carlo as beasts, `PERSON_FIGHT.estimateRuns` 150, your Health rounded to 5 so regen keeps the cache; up to 120
  cached) + the power parts: family cards, Challenge-the-Head, Arena rows (a cold six-ring roster ≈ 80 ms in Electron,
  cached 0.2 ms), `duelChance()` (was 0.5 ± 0.08 per stage). `_mbArt` is memoized and `_mbClone` replaces the JSON copy per run.
- **Removed**: FIGHT_TACTICS, FIGHT_TO, FIGHT_EDGE, FIGHT_EXCHANGE_RANGE, FIGHT_WOUND, DUEL_TO, BATTLE_TO, DUEL_BASE_WIN /
  PER_STAGE / RANGE, `_exchangeChance`, `_tacticEdge`, `_clampExchange`, `_beastAfterExchange`, the tactics UI + CSS, the
  exchange pips. **Migration** (`_ensurePhase42Fields`): a person fight saved without `m` restarts on moves at your Health; the
  race fields (p / to / you / them) are dropped. Also fixed: `_ensure` no longer drops a road (slaughter) fight on load (its
  stranger lives on the fight, not in the registry).
- **Battle page** (combat.js): one `_plates()` and one `_fight()` for both; a person's panel adds `_scout()` ("What you know":
  root, arts seen as dashed ? chips, how they fight), the feud + record lines, the parry window on turn 1 (people have no
  prepare step), the stakes chip + the Arena purse / bracket line + "they yield at N". Keys 1–4 / C / Space in every fight.
  The why card (`personfight`) is the estimate, both powers, the blow ratio, what it can cost, root / arts seen / grudge notes.
- **Dev presets** (`buildDevSave`) get a realm kit (rolled like a person's arts, mastery 3) so late-game test lives can fight.
- **Balance (first pass, probe `scripts/sim/probe-person-fights.js`)**: a strong kit at an even stage ≈ 50–65% (up to ~80% with
  the best arts of your realm), one stage up ≈ 25–45%, a realm up rarely; starter-only characters are weak. The sim bot
  still fights on starter arts (it lost its 6 head challenges in sim:quick) — it learns study/loadout in 1.15.
- **Tests**: checks/people-moves.js (29: seeded arts, champion signature, temper leanings, scouting, stances, wounds carry,
  Yield, estimate vs a 2,000-run MC, grudge, migration) + every fight check ported to `scripts/sim/fight-helpers.js`
  (`playFight(gs, 'win'|'lose')`); smoke duels / arena / fights / succession play fights through the real buttons with
  `scripts/smoke/fight-ui.js`. UI review **7.75 PASS**.

---

## 42c part 2 as built (task 1.14b, 2026-09-30): rivals, libraries, study desks
User request with it (2026-09-30): "the higher your realm the more arts you can learn at once" → **study desks**; the user
picked the slower curve.
- **Study desks** `ART_STUDY_SLOTS` (Mortal / Qi Condensation 1 · Foundation / Core 2 · Nascent Soul + 3; `studySlots(stage)`).
  `s.arts.study` → `s.arts.studies = [{ artId, startedAt, endsAt, src: 'manual'|'clan' }]` (migration: an old study becomes
  the first desk). `artStudyLock` → `'busy'` (every desk taken) / `'studying'` (that art is already on a desk);
  `cancelStudy(artId?)` stops one desk (a manual goes back; a clan study just ends); `_finishStudies()` in tick finishes
  each desk on its own time (timestamps, closed or open). A desk already running is never cut short. Path → Arts: busy desks
  with countdowns, one free-desk card listing ready manuals, locked desks naming their realm; the header counts desks and
  names the next realm. Attention "manuals to study" fires while a desk is free. Also fixed: the stale "Battles still use
  Press / Guard / Feint" note under the loadout.
- **Rival counters.** `_mbLivePerson` counts your landed blows by element on the person (`p.vsYou.els`). After a fight they
  survive (`_finishFight` → `_rivalTrain`), one who holds a grudge and was struck ≥ `RIVAL_COUNTER_MIN_BLOWS` (3) times with
  one element sets `p.counter = { vs, el, year }` (`el` overcomes `vs`) and the log says "…now trains in Water arts, against
  your Fire". `personArts` then swaps their last pick for an attack art of `el` (seeded) and `_mbFoePerson` fights as `el`,
  so your arts of `vs` show "resisted" (×0.75). Their root is unchanged. Scouting (`personScouting().counter`) marks the
  counter art as known (word travels); "What you know" says "Fire root, trained in Water against your Fire" (or "honed" when
  their root already is it); the Why card names it; the result card of a grudge-making choice warns of it. This replaced the
  retired 1.13a "vengeful beast counter-art" idea for people: it works because it changes *their* defensive element (your
  defence stays element-neutral).
- **Raise → taught, finish → their manual.** `personFightChoices()` gains `teach` (the raise reaction is a debt and they know
  an art you don't) and `finishManual` (`PERSON_FINISH_MANUAL` 0.6, when they have a non-signature art).
  `personFightFinish` grants the manual (`_teachableArts` / `_lootableArts`; never a signature) and returns `art`; the end
  cards say "in thanks, they teach you one of their arts" / "their manual: 60% chance"; the result card names it.
- **Sect library** (joined sects; a founded sect has none yet): `SECT_ART_ELEMENTS` per sect + neutral, grades opened by
  rank (`SECT_LIBRARY_GRADE_BY_RANK`: Outer yellow · Inner/Core profound · Elder/Peak earth · Grand heaven), priced in
  Contribution (`SECT_LIBRARY_PRICE` 40 / 120 / 350 / 900). `sectLibrary()`, `buySectArt(id)` (reasons no_sect / rank /
  contribution); spending Contribution never lowers the rank you hold. UI: **Sect → Library** sub-view (grade sections, a
  sealed grade names the rank, "Take the manual" + shortfall, known/held tags) + a Library tile in Overview → Duties.
- **Clan library** (`clan.library = [{ artId, by, gen, year }]`, on the clan record, so it outlives you; migration in
  `_ensurePhase34Fields`). `writeClanArt(id)` (Spirit Stones by grade, `CLAN_LIBRARY_WRITE_COST` 60 … 4000; not the basics;
  once per art; a chronicle line), `studyFromClan(id)` (a desk, no manual, `CLAN_LIBRARY_STUDY_FRAC` ½ the time; only arts
  you don't know; reasons known / stage / busy / studying), `clanLibraryInfo()`. UI: **Kin → Hall → Clan library** (the
  shelf with who wrote each and in which generation, Study or why not, a fold to write one of yours in with a confirm).
- **Tests**: checks/rivals-libraries.js (34) · checks/arts.js desks · smoke scenarios/libraries.js (desks / sect library /
  clan library in 4 modes, buy, clan study, write, the rival's counter + Why, raise → taught) · arts smoke on desks.
  UI review **7.6 PASS** (+ polish). Not done: the sim bot doesn't study, buy or write (1.15); founded sects have no library.

### Giving manuals to your sect (user 2026-09-30, after 1.14b)
"Contribute your extra art books for the sect to learn." User pick: Contribution + war strength, and founders get a library.
- **Shelf**: a joined sect's `s.sect.shelf` (stays with the sect when you leave; a log line says so) · a founded sect's
  `s.ownSect.library`. Entries `{ artId, by, year }`; one copy of an art per shelf.
- `sectDonateInfo()` (the manuals in your pack: Contribution `SECT_DONATE_CONTRIB` by grade for a joined sect, 0 for your own;
  the war strength it would add; "a spare" = an art you know; "shelved") · `donateManualToSect(id)` (the manual leaves your
  pack) · `sectShelfWar()` = Σ `SECT_SHELF_WAR` by grade (1 / 2 / 4 / 7 / 12%), capped `SECT_SHELF_WAR_CAP` 25%.
- **War**: a multiplier on your side of the roll, in the shown odds *and* the real roll: `memberWarPower().power` ×(1 + shelf)
  (`bonus` untouched, so the shelf alone never counts as taking part) and `_resolveSectWar` playerPower ×(1 + shelf);
  `sectWarOdds().parts` gains "Arts you gave the library" / "Arts in your sect library" (×).
- **Founders** study a shelved art they don't know at `SECT_SHELF_STUDY_FRAC` ½ the time with no manual (`studyFromSect`, a
  desk with `src: 'sect'`). A member can't take a book back down.
- **UI**: Sect → Library (member): "Given to the library" + "Give a manual" above the grades. A founder's library sits at the
  bottom of **Sect → Halls** (a fifth Sect sub-tab overflows Overlay), the give list folded, one compact line when empty.
  Pack manual rows: "Give to the sect · +N Contribution" (confirm for an art you haven't learned). Attention (idle): "A spare
  manual: …" → the library. Path → Arts desks say "From your sect library".
- **Tests**: checks/rivals-libraries.js (+15: pay, shelf, one copy, war by grade + cap, not "taking part", member + own odds vs a
  4,000-war Monte Carlo of the real roll, founder study, leaving) · smoke scenarios/libraries.js (give, Pack button, nudge,
  founder library in 4 modes, Halls sub-tabs still fit) · sect.js smoke (member tabs + Halls ≤ 3 screens).

### Library grade filter + loadout unlocked mid-fight (user 2026-09-30, after 1.14b)
Two small fixes from a play session ("cannot queue things to study while a fight message is up, though I wasn't in a fight").
- **Grade filter**: the Path → Arts library gains a third chip row — `Any grade` + the five grades, each chip tinted with
  its grade's colour (`renderer/game/arts-view.js` `gradeChip`; CSS `.rar-chip` / `.g-<grade>`). The heading appends
  "· N shown" while a filter narrows the list. Hidden while picking a slot (the kind row already did this), which keeps
  the list viewport in Overlay.
- **The loadout is never locked mid-fight.** The old rule refused `setArtSlot` (and slot-picking) while `s.family.fight`
  was set — which bit whenever a fight was pending but you had stepped back to another tab, and read as a bug. It was
  never needed: `_mbYou` now snapshots the whole move-slot array (`you.slots`), and `fightMoves()` shows **that** deck, so
  a change to your loadout only ever affects your *next* fight. Studying was never gated (a probe confirmed it).
- **Tests**: `checks/arts.js` + `checks/combat.js` now assert the loadout change is allowed mid-fight **and** that the
  live battle's grid stays on the deck it began with; smoke `scenarios/arts.js` gains the grade-filter loop and resets to
  Overlay after the mode loop. `npm test` · checks **767 ok** · arts smoke (4 modes + phone) zero console errors.
- Review: fresh reviewer agent **7.7 PASS** (three `[polish]` → UX Debt: "Earth" is both a grade and an element with no
  row caption; the third filter row crowds the narrow panes; the count's tooltip).
