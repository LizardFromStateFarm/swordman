# Combat & Battles — Reference
_Covers: game-state.js (fight engine: `f.fight`, beast battles, bestiary) · assets/data/beasts.js (BEAST_FIGHT_*, per-type
`fight` + `nature`) · assets/data/talismans.js (tame talisman grades + tame-attempt rules) · renderer/game/combat.js
(CombatView battle page) · renderer/engine/battle-scene.js (BattleScene canvas)
· game.js / beast-detail.js (Fight entry) · breakdowns.js (`beastfight` card) · attention.js · Phase: 35, 41 (roadmap A6) ·
Updated: 2026-09-29_

> **Replaced for every fight: beasts (1.13a, 2026-09-29) · people (1.14a, 2026-09-30).** Beast battles run on moves
> (arts.md → "42b part 1"); duels, head challenges, defending the seat, step-down bouts, road fights and Arena bouts too
> (arts.md → "42c part 1 as built"). Press / Guard / Feint, exchange pips, FIGHT_TO / DUEL_TO / BATTLE_TO are gone; the text
> below about exchanges is history. Stances, Yield, end choices, feuds, the bracket and the Arena purse are unchanged.
> **Being replaced (user 2026-09-29):** the Press/Guard/Feint exchange loop below gives way to **move combat on
> collectible arts** (Phase 42, docs/systems/arts.md: 4 equipped move arts, combat Qi with no cooldowns, a parry QTE,
> Five Elements, statuses). Stances, Retreat/Yield, end choices, the bestiary, feuds and the Arena carry over.

Phase 35 is **not a new combat model**. It takes the fight card from 1.8b-3b (Press > Feint > Guard > Press, exchange
odds derived from a one-roll match chance, opponent habits) and extends it to non-family opponents on a full-window
battle page drawn with the ink engine.

**Split (user-approved 2026-09-28):**
- **A6-1** (this build): the spec, the engine generalized to beast opponents, **beast battles from Roam → Beasts** (Fight
  beside Tame), the battle page, the bestiary (engine + details page line), and a breakdown card.
- **A6-2**: Beast Hunt / Arena entry in the Roam group (`startArenaFight(tier)`, `s.arena = {streak, best, tier}`,
  `assets/data/arena.js`), a bestiary view, and banter triggers for battles.
- **A6-3** (split 2026-09-29): **A6-3a** ✅ duels, head challenges, defending the seat and your step-down bouts on the
  battle page + ink duelists + end choices + feuds (below) · **A6-3b** the Arena (duelist ladder, stakes, streak, rivals)
  · **A6-3c** boss fights (needs 23E/17).

Ordinary expeditions keep auto-resolving (pillar 4). Every battle is started by the player, and every exchange is the
player's move (CLAUDE.md agency rule). There is no auto-fight.

---

## Depth pass (A6-1)

1. **Memory.** `s.bestiary[typeId]` records fought / won / lost / slain / spared / bound, and `habitsKnown`. A beast you
   spare or let flee may come back: `bestiary[typeId].returning = 'grateful' | 'vengeful'` marks the **next sighting** of
   that type. A grateful one can be tamed without a talisman. A vengeful one is stronger (+power) and its lore line says
   why. Slaying a beast may leave a **cub** encounter behind (a weaker sighting of the same type).
2. **Choices.** Before the fight: **Slay** stance (it fights for its life, with full wounds, and a loss can kill you) or
   **Drive off** (half wounds, you can't drop below 1 Health, no loot). Each exchange: Press / Guard / Feint, or
   **Retreat** (always works, but it gets a parting blow and stays). After a win in the Slay stance: **Finish it** (loot
   and karma by its nature, and it may leave a cub), **Spare it** (it flees and may return grateful or vengeful), or
   **Bind it** (tame it with a talisman; it joins at Lv.2 — and, since Phase 41, the bind rolls the talisman's grade,
   so it can slip free). After a Drive-off win: **Let it flee** or **Bind it**.
3. **Hooks.** Health & Death (23A: real Health is spent on every lost exchange; a Slay loss can kill you, cause
   `beast_hunt`) · beasts and taming (tiers, Might, variants, traits change habits and power; binding goes through the
   tame path and the companion cap) · karma (by the beast's `nature`) · loot (beast cores, demon essence, rare
   materials by tier) · attention strip (a battle underway) · clan epitaphs and death causes · the one-fight-at-a-time
   gate shared with duels and head challenges.
4. **Drama.** Best: you slay a Golden Dragon at the edge of your strength and carry its heart home. Worst: a legendary
   beast kills you in the Slay stance while you're already wounded, and the clan remembers the one who hunted the
   dragon. Story beats in between: killing a qilin weighs on your karma; the fox you spared comes back and follows you
   for nothing; the python you let flee returns bigger and angrier; a slain mother leaves a cub crying in the den.
5. **Feedback.** Habits are hidden on the first fight with a type ("You have never fought one of these"). After one
   fight they are shown, and the tactic odds become exact. Past mercy or slaughter changes who returns (grateful vs
   vengeful, weighted by your karma: grateful with 0.5 + (karma − 50)/100, clamped 0.2–0.85), and the bestiary line on the details page shows your history with that beast.
6. **Agency.** Player decisions made by the feature: stance, every exchange, retreat, the end choice (finish/spare/bind).
   All are explicit choices. The world rolls only what the beast does: its tactic each exchange, whether a spared beast
   returns, whether a cub is left.

## UX pass (A6-1)

1. **Surface.** Before committing, the battle page opens on a **prepare** panel: win odds for each stance, the Health
   each lost exchange costs, the worst case if you lose ("could kill you: your Health 34 < 52 at stake"), known habits
   or "unknown", and a "why these odds" breakdown (`data-bd="beastfight:<encId>:<stance>"`: your power, its power,
   realm gap, wounds, traits, mood). During the fight: both vigor bars (first to `BATTLE_TO`), your live Health, the
   per-tactic odds on the buttons, the last exchange in words ("You feint; it guards. You take the exchange."), and a
   short exchange log. Results name the cause in a toast and a log line.
2. **Interact.** Roam → Beasts encounter card and the beast details page each get a **Fight** button beside Tame, one
   click to the prepare panel and one more to start. Tactics are large buttons. The page is a full-window overlay
   (`#combat-overlay`): in Expanded/Desktop the scene sits above a wide control row; in Overlay (300px) and on phones
   the scene shrinks and the controls stack; in Banner the overlay auto-peeks the window (layout.js watches
   `*-overlay`).
3. **Discover.** The Fight button sits on every encounter card, with a lock reason when it's disabled (too wounded,
   another fight underway). The beast sighting log line mentions it ("Tame it or fight it in Roam → Beasts"). A battle
   underway gets an urgent attention item that reopens the page.
4. **Feel.** Ink scene: your cultivator (the current realm's ink art, `bare`) on the left and the beast on the right,
   over a dotted night field. Lunges on Press, a dotted guard arc on Guard, an afterimage on Feint, a claw or strike arc,
   a stagger shake and a wound flash on a lost exchange, and at the end the loser dissolves (Finish) or retreats (Spare,
   Flee). Reduced motion swaps the movement for flashes.
5. **UX debt.** Logged under START_HERE → UX Debt when the build is done.

---

## State

`s.family.fight`: the one fight in progress (shared gate with duels and head challenges; `null` when none).
```
{ kind: 'duel'|'challenge'|'defend'|'stepdown'|'arena'|'slaughter'|'sectmaster' (43e, npc-sects.md)|'beast', oppId, lethal, p, to, you, them, round, log: [...], year,
  // kind 'beast' only:
  beast: { encId, typeId, variant?, traits, mood? },   // snapshot: the fight does not need the encounter to exist
  stance: 'slay'|'drive', power, over: null|'won',      // over = won, waiting for the end choice
  // kind 'slaughter' only (A6-3a): the road stranger + where you met — never in the world registry
  foe: Person, place }
```
`to` is new: family fights keep `FIGHT_TO` (2), beast battles use `BATTLE_TO` (4). A save without `to` reads `FIGHT_TO`.
The load guard (`_ensure…`) drops a beast fight whose snapshot is missing a known type.

`s.bestiary`: `{ [typeId]: { seen, fought, won, lost, slain, spared, bound, habitsKnown, returning: null|'grateful'|'vengeful', variants: { <variantId>: true } } }`
(`variants` = the rare colours met; see "Bestiary" below).

`s.beastEncounters[i].mood`: optional `'grateful' | 'vengeful' | 'cub'` (set at sighting).

Migration: `_ensurePhase35Fields()` adds `s.bestiary = {}`.

## API (game-state.js)

- `beastFightPreview(encId)` → `null | { name, stance: { slay: {...}, drive: {...} }, habits, habitsKnown, hint, health,
  locked }`. Each stance: `{ chance, wound, lossWound, worst, canDie, youPower, itPower, parts }`. `locked` is a reason
  string or null (`busy` another fight, `wounded` Health < `BEAST_FIGHT_MIN_HEALTH`, `gone`).
- `startBeastFight(encId, stance)` → `{ ok, fight:true } | { ok:false, reason }`. Sets `f.fight` and emits `fight_start`.
- `fightInfo()` (shared): adds `to`, `beast`, `stance`, `over`, `habitsKnown`, `health`, `wound` for beast fights. With
  habits unknown, the tactic odds are computed against even habits (what the player can know).
- `fightExchange(tactic)` (shared): `'retreat'` for beasts (the same slot as `'yield'`). Beast exchanges cost
  `_beastWound()` Health. In the Slay stance Health can hit 0 → `_die('beast_hunt')`. In the Drive stance it never
  drops below 1.
- `beastFightFinish(choice, gradeId?)`: `'finish' | 'spare' | 'bind' | 'flee'` after a won battle → `{ ok, outcome, loot?,
  beast?, grade?, bindFailed?, karma }`. `'bind'` rolls the chosen grade's `tameChance` (Phase 41): success joins it at
  Lv.2, a failure sets `outcome = 'bind_failed'` and the beast escapes (the talisman is still spent; no re-fight).
- `tameEncounteredBeast(encId, gradeId?)` → `{ ok, beast, grade, chance }` or
  `{ ok:false, reason:'tame_failed', outcome:'fight'|'flee', grade, chance }` (Phase 41). Consumes one talisman of the
  chosen grade (the best held when `gradeId` is omitted or unheld) and rolls its chance; a failure starts a real fight
  (`startBeastFight(encId, 'slay')`) or removes the encounter (escape). Too wounded to fight fairly → it flees instead.
  A `grateful` beast is free and never rolls (also `no_talisman` / `stage` / `max_beasts` / `fighting`).
- `tameInfo(encId)` → `{ encId, name, prof, nature, mood, free, canTame, why, fightChance,
  grades: [{ id, name, chance, count }], best, chance }` — what the UI shows before you commit.
- `talismanCounts()` → `{ crude, fine, superior, pristine }` counts read from the pack.
- `bestiaryEntry(typeId)` → the record (or zeros).

## Odds

`itPower = type.minStage × 100 + BEAST_FIGHT_BASE_POWER + (might − 1) × BEAST_FIGHT_MIGHT_POWER + traits + mood`
(`iron_skin` +25, vengeful +60, cub −80). `youPower = _expectedPower(self) − wounds` (Health < 50 → −2 per missing point).
Match chance = `1 / (1 + e^(−(you − it) / TOURNAMENT_SPREAD))` (the same logistic as `_powerChance`). Exchange chance =
`_exchangeChance(P, BATTLE_TO)`, then ± `FIGHT_EDGE` per the tactic read, clamped to `FIGHT_EXCHANGE_RANGE`.
The Drive stance fights at the same odds but costs half the wounds.

Examples (root ×1, stoic temper; pinned by checks/combat.js): a Spirit Fox at Mortal 44%, one stage up 73%. A White
Tiger (Might ×1.45) at stage 13 25%, at 14 54%. A Golden Dragon (×2.3) at stage 20 6%, at 22 45%. Neutral play (a
random tactic each exchange) wins at the shown odds (Monte Carlo in the check).

## Data (assets/data/beasts.js)

`BEAST_FIGHT_STYLE[typeId] = { press, guard, feint, hint }` (habits) and `BEAST_NATURE[typeId] = 'benign' | 'wild' | 'fell'`
(maps keyed by type id, beside BEAST_TYPES, rather than fields on each type). Benign: spectral bear, qilin, black
tortoise. Fell: blood python, void hound. The rest are wild.
`BEAST_FIGHT_*` constants: `BATTLE_TO`, base/might power, wound per exchange (× might), loss wound, min Health, trait and
mood power, karma per nature (`BEAST_KARMA`), cub chance, return chance, bound level, and `BEAST_SLAY_LOOT` per tier.

## Tame talisman grades & tame attempts (Phase 41)

Taming used to be certain: one talisman always worked. Phase 41 makes it a roll with **four graded talismans** (data:
`assets/data/talismans.js`, items in `items.js`, recipes in `recipes.js` under `talismans`).

| Grade | Item | Tame chance | Start recipe cost |
|---|---|---|---|
| Crude | `beast_taming_talisman` (the old single item — old saves keep working) | 40% | 5 beast core + 2 ancient script |
| Fine | `beast_taming_talisman_fine` | 55% | 8 beast core + 3 ancient script |
| Superior | `beast_taming_talisman_superior` | 70% | 12 beast core + 5 ancient script + 1 void crystal |
| Pristine | `beast_taming_talisman_pristine` | 90% | 20 beast core + 8 ancient script + 3 void crystal |

`TALISMAN_GRADES` maps a grade → `{ name, tameChance, itemId }`; `TALISMAN_GRADE_ORDER` is the ladder. Each item carries
`effect = { type: 'tame_beast', grade }` and sits in the `key` Pack category. **No grade is guaranteed.** Costs are the
first pass and are balance-tuned in QA.

**The attempt.** `tameEncounteredBeast(encId, gradeId?)` consumes one talisman of the chosen grade (the best you hold if
you name none, or name one you do not carry) and rolls `Math.random() < grade.tameChance`:
- **Success** → it joins at Lv.1 (the old path: bestiary seen, `first_beast` first, `beast_tamed` emit).
- **Failure** → rolled into a **fight** or a **clean escape**, weighted by the beast's nature + mood:
  `fightChance = clamp(0.5 × natureMult + moodMod, 0.2, 0.9)` with `TAME_NATURE_FIGHT_MULT = { benign: 0.5, wild: 1.0,
  fell: 1.6 }` and `TAME_MOOD_FIGHT_MOD = { vengeful: +0.2, cub: −0.2 }`. A man-eater rounds on you; a guardian bolts.
  - **Fight** → `startBeastFight(encId, 'slay')` starts a real battle (the sighting stays; the battle page resumes it).
    If you are below `BEAST_FIGHT_MIN_HEALTH` (or a fight is already underway) it cannot fairly start, so it **flees**
    instead — a wounded player is never forced into a lethal fight.
  - **Escape** → the sighting is removed; `tame_failed` is emitted with `outcome: 'flee'`.
- A **grateful** beast (a spared beast that came back) is free and never rolls.

**The bind (after a won battle).** `beastFightFinish('bind', gradeId?)` also rolls the grade's chance now: success joins
at `BEAST_BOUND_LEVEL` (2); a failure means the beaten beast slips free and is gone (`outcome: 'bind_failed'`) — the
talisman is spent and there is no second fight. `beastFightChoices()` exposes `talismanGrades`, `bindGrade` and
`bindChance` for the end card.

**UI.** Roam → Beasts, the details page and the battle end card all show the grades you hold (a `pack-chip` row when you
hold more than one, best held pre-selected) and the resulting chance on the button (`Tame · Fine (55%)`). A failed tame
that turns hostile opens the battle page (`combatView.open(encId)` resumes the live fight); an escape just toasts.
`talismanCounts()` / `tameInfo()` are the read helpers behind this.

**Sim + checks.** The bot keeps two talismans (best grade it can afford) so a failed tame can still be bound, and tames
with the best grade it holds. `checks/talismans.js` pins the grade table, item/recipe wiring, the roll, both failure
outcomes, the wounded→flee fallback, the nature weighting, the grateful free tame, and the bind roll.

## As built (A6-1, 2026-09-28)

- **Engine** (game-state.js → "Phase 35 … beast battles"): `_startFight(kind, opp, lethal, P, extra)` takes
  `{ to, beast, stance, power, over }`; `_exchangeChance(P, to)`; `_fightOpp()` returns a beast pseudo-opponent
  (`_beastOpp`); `_fightStyle()` reads `_beastStyle()` (traits shift habits). `fightExchange` routes beast exchanges to
  `_beastAfterExchange` (win → `over: 'won'`, loss → `_beastFightLost`, Health ≤ 0 → `_beastFightDeath` →
  `_die('beast_hunt')`) and `'retreat'` / `'yield'` to `_beastRetreat`. `beastFightChoices()` feeds the end step (ids,
  bind lock, karma, loot preview). A sighting consumes `bestiary[type].returning` into the new encounter's `mood`;
  `tameEncounteredBeast` is free for a grateful one and refuses (`fighting`) the beast you are fighting. Death cause
  text in game.js, epitaphs in clan-legacies.js.
- **Battle page** (renderer/game/combat.js `CombatView`, `window.combatView`): `open(encId)` → prepare; `resume()` for a
  battle underway (attention item `open: 'combat'`, the card's "Return to battle"). Step back leaves the fight waiting.
  Keys 1/2/3 = Press/Guard/Feint, Esc = step back. A death plays the fall on the field (~2.9 s), then the page closes and
  the normal death moment + card follow. Text size (⚙) zooms the panel (`--cz`).
- **Scene** (renderer/engine/battle-scene.js `BattleScene`): two private `bare` InkRenderers (the cultivator's current
  (1.13b: beast fights on moves draw each art by its element, with status auras and the parry wind-up on the field — arts.md → "42b part 2 as built".)
  realm state, the beast's INK_BEASTS art) cropped to their padded `figureBox` and set on a baked dotted field (stars,
  a dotted moon, two ridgelines, ground band, a trodden ring). Events queue and play in order (a backlog plays at 2×).
  Frame ≈ 3 ms (smoke). Classic Sprite art still gets the ink field (the beasts' Classic sprites are single-frame ASCII).
- **Entry points:** Roam → Beasts encounter card (Fight + odds; lock line when too wounded / busy), beast details page
  (Fight · N% to win, Mood + Bestiary stat rows). Sighting log: "Tame it or fight it in Roam → Beasts."
- **Tests:** scripts/sim/checks/combat.js (35) · smoke scripts/smoke/scenarios/combat.js (combat-*.png, all four modes).
- **Not done here (A6-2 / A6-3 / QA):** the sim bot doesn't hunt yet (it never starts a beast battle, so balance is
  untouched); no banter lines for battles (`beast_slain` is emitted but not a banter trigger); duels/tournaments still
  use the family fight card.

## A6-2: the Hunt + the Bestiary (spec 2026-09-28, user-approved; the Arena moved to A6-3) — built 2026-09-28

**Hunt (Roam → Hunt).** `HUNT_GROUNDS` (beasts.js, data only): five grounds, each with a realm gate (`minStage`), the beast
types found there, a track time (real seconds) and a Spirit Stone cost. Misty Foothills (fox, python) → Thunder Crags
(eagle, bear) → the Western Wilds (tiger, qilin) → the Star Rift (hound, tortoise) → the Cloud Sea Summit (the two
dragons). Deeper grounds also hold the shallower tiers at a lower weight.
- `startHunt(groundId)` → `{ok}` or `{ok:false, reason}` (`stage`, `busy` already tracking, `crowded` 3 beasts already
  waiting, `stones`, `unknown`). Pays the cost, sets `s.hunt = { groundId, startedAt, endsAt }`.
- `cancelHunt()` calls it off (the cost is not refunded).
- Resolves in `tick()` once `Date.now() >= endsAt`, so it also resolves after the game was closed: a beast from the
  ground's table whose `minStage ≤` yours (weighted by `encounterChance`) is pushed through the same
  `_spawnBeastEncounter(type, source)` used by expeditions. It gets its traits, variant roll, and a returning
  grateful/vengeful mood. The encounter gets `hunted: groundId`, and `s.hunt.found = encId` stays until you look.
  The log says what was found and where.
- `huntInfo()`: the grounds with lock reasons, odds per type (only for types you can meet), the danger (highest tier),
  and the current track state.

**Bestiary (Roam → Bestiary).** A card per beast type (sorted by realm gate). Unseen kinds show as a dim silhouette with
only their realm gate and where they can be hunted. Seen kinds show the portrait, tier, nature, lore, habits (once learned)
and your record (fought / won / slain / spared / bound). A pending return is hinted ("Something out there remembers
you"). `bestiary[type].seen` is set at every sighting and tame, and migration marks your current companions and waiting
encounters as seen.
- **Rare colours (2026-09-30, user).** Every kind has one rare colour variant (12% of sightings). The bestiary remembers
  which ones you have met: `bestiary[type].variants = { <variantId>: true }`, recorded by `_seeBeast(rec)` — called at a
  sighting (`_spawnBeastEncounter`), a tame, and every beast-fight resolution (it also sets `seen`, and returns the entry
  so a fight path can tally on it). Seen cards carry a full-width **Rare colour** footer: a colour dot + the variant's
  name once met, else "Not yet seen"; the lede reads "Seen N of 10 kinds · rare colours M of 10 met · …". `bestiarySeenVer`
  is now **2** — a v1 save re-scans its live companions / waiting beasts to backfill the variants still around.

**Reputation.** A long slay record makes spared beasts come back vengeful more often: the grateful chance −0.02 per beast
you have slain (all kinds, capped at −0.2).

**Banter.** Three new triggers, each with ≥ 4 lines per personality and 2 generic: `beast_slain` (you finish a beast),
`beast_spared` (spare / let flee / bind), `battle_lost` (lost or retreated). Token `{beast}` = the beast's name
(these triggers only).

**Sim bot.** It hunts when idle and healthy on the richest ground it can enter, and fights a waiting encounter when its
odds are ≥ 60% (the 'active' profile reads habits; casual/afk play random tactics). End choice: bind when it has a
talisman and room, otherwise finish. It retreats when a Slay loss could kill it. Metrics: battles, win rate, beasts
slain/bound, deaths by `beast_hunt`. Invariants: Health is never below 0 outside a Slay death, and no `f.fight` survives a
life.

### A6-2 as built
- Engine: `_spawnBeastEncounter(type, hunt)` is the one sighting path (expedition roll + hunt), same random draws as
  before (sim seeds unchanged); `_huntLock` / `_huntTable` / `huntInfo` / `startHunt` / `cancelHunt` / `_resolveHunt`
  (from `tick()`); a found hunt clears itself once its beast is gone. `bestiary[type].seen`; `bestiarySeenVer` migration.
  State: `s.hunt` (`_newGame` + `_ensurePhase35Fields`). Constants `HUNT_GROUNDS`, `BEAST_SLAYER_VENGEFUL(_MAX)` in beasts.js.
- UI: renderer/game/hunt-view.js (`HuntView.render/tickInPlace`, `BestiaryView.render`), panels `#tab-hunt` /
  `#tab-bestiary`, NAV_GROUPS adventure views, attention item `hunt` (the found beast is left out of the generic
  wild-beasts item). The Roam sub-tab row got Sect-style narrow sizing.
- Banter: triggers `beast_slain` / `beast_spared` (spare, flee, bind) / `battle_lost` (lost, retreat), 174 lines, token
  `{beast}` (fallback "beast").
- Sim: bot.js `battle()` + `hunt()` (+ fights a waiting beast at ≥ 60%); report section "Beast battles + hunts";
  invariants `health_negative`, `battle_without_beast`. sim:quick 24h: active ~11 hunts, ~69 battles, 0 violations —
  battle balance is untuned (2.8 QA).
- Tests: checks/combat.js (51) · smoke scenarios/hunt.js (hunt-*.png, bestiary-*.png).

## A6-3a: people on the battle page (spec 2026-09-29, user-approved; A6-3 split into 3a people · 3b Arena · 3c bosses)

Your own fights against people (the spouse duel, challenging the head, defending the seat, and **your bouts in a
step-down tournament**) leave the small family fight card and play on the battle page, against an ink duelist.

**Engine.**
- Person fights use `DUEL_TO` = 3 exchanges (was `FIGHT_TO` 2; a save mid-fight without `to` still reads 2). Odds still
  come from `_exchangeChance(matchChance, to)`, so neutral play keeps the old match odds.
- **A won fight waits for your end choice** (`fi.over = 'won'`, like a beast), read by `personFightChoices()` and
  settled by `personFightFinish(choice)`:
  - to the death: `finish` (they die: the old lethal outcome) or `spare` (they live: the old non-lethal outcome — for the
    spouse duel, they leave you);
  - until one yields: `raise` (help them up: they owe you) or `humble` (shame them before the clan: they hate you, but
    the clan is cowed — no one else challenges you for `HUMBLE_QUIET_YEARS`).
  A lost fight still ends at once (your death, or the old non-lethal loss). A coward who loses to the death begs; it's
  still your call.
- **Memory** on the person record: `p.vsYou = { fought, youWon, theyWon, spared, raised, humbled }` and
  `p.feud = null | 'debt' | 'grudge'`. Sparing reads their temper (`SPARE_REACTION` in family.js: proud tempers turn
  mercy into a grudge); raising → debt (a psycho / demon king still resents it); humbling → grudge (a coward / nice guy
  takes it as a debt).
- **Feedback:** a grudge-holder is `FEUD_CHALLENGE_WEIGHT`× likelier to be the one who calls you out and fights you with
  `FEUD_POWER` more power; a debtor never challenges you; yield acceptance ±`FEUD_YIELD` (debt +, grudge −). The
  breakdown card (`personfight`) lists every power term, the feud included.
- **Step-down tournament:** `answerStepDown(true)` runs the bracket until a pairing includes you, then pauses in
  `f.bracket` (resumable state, saved) and starts `f.fight` kind `stepdown` against that opponent at `_powerChance` odds;
  `personFightFinish` / a loss continues the bracket (NPC–NPC bouts stay rolled: the world's fights). If you fall to the
  death the rest of the bracket still resolves (new head, branches) before `_die('stepdown_tournament')`.

**UI.** `CombatView.resume()` opens any fight. Person fights skip the prepare step (the family card before it holds the
decision: fight or flee, lethal or not, enter or stay out) and open on the fight step with a stakes line ("To the death:
the loser does not rise"), the person's temper hint + habits, the record + feud, Yield instead of Retreat, and a
"why these odds" card. End step: Finish / Spare or Raise / Humble with the likely reaction shown. The family overlay no
longer draws fights (`renderFightCard` removed); the attention item and the family card route to the battle page.

**Duelist art.** The opponent is the ink cultivator for their own realm (`INK_ART[stage.spriteState]`, `bare`), mirrored
to face you, dressed from INK_PARTS by `duelistSlots(person)` (DUELIST_LOOK in assets/data/duelists.js: temper → face /
hair / robe / weapon / aura; the clan head wears the crown, a spouse the moon-white robe). Their stage colour is the glow.
A person's Press throws a crescent back at you (a beast's is claws).

### A6-3a as built (2026-09-29)
- Engine (game-state.js → "A6-3a"): `_startFight` defaults `to` to `DUEL_TO`; `fightExchange` sets `over: 'won'` for a
  person win; `_finishFight(fi, opp, won, yielded, died)` notes the record and routes `stepdown` to `_stepdownBoutEnd`;
  `personFightOdds(opp, kind)` / `_personPowerParts` / `personRecord` / `personFightChoices` / `personFightFinish`;
  `_bracketStep` / `_bracketRecord` / `_bracketInfo` / `_afterBoutInfo` (`{ next: true }` when your next bout already
  started) / `_finishStepDown` (the seat, shared with the watched bracket). `answerStepDown(true)` returns
  `{ outcome: 'bout', next: true }` when you're in it. A paused `f.bracket` with no fight runs on in `tick()`.
  `_pickChallenger(clan, cowed)` weights feuds. State: `f.bracket`, `f.cowedUntilYear` (`_newGame` + `_ensurePhase35Fields`),
  `p.vsYou`, `p.feud`. Data: family.js `DUEL_TO`, `SPARE/RAISE/HUMBLE_REACTION`, `HUMBLE_QUIET_YEARS`, `FEUD_*`,
  `SPARE_KARMA`, `FEUD_TEXT`; new assets/data/duelists.js (`DUELIST_LOOK`, `DUELIST_ROLE_LOOK`).
- A6-3a also covers **Roam → Explore → Slaughter**: `slaughterEncounter(i)` consumes a road encounter (same busy/wounded
  gate as every fight) and starts `f.fight` kind `slaughter` — lethal, with a `foe` snapshot of the stranger (they are not
  in the world registry, so `_fightOpp` reads `fi.foe`). `_slaughterOutcome` kills on Finish (`CHALLENGE_KARMA_DEATH`), the
  stranger walks away on Spare, and a lethal loss is `_die('slaughter')`. Explore's encounter card is Seduce / Slaughter /
  Leave; the battle page reuses the whole person UI (title "A Killing on the Road", Yield, Finish/Spare).
- UI: `CombatView.resume()` handles every fight (`mode` beast / person); `_fightPerson`, `_endPerson`, `_platesPerson`
  (realm + feud chip; keeps the finished bout on the result card while the next one waits), `_stepdownTail`
  ("Face <name>" → `resume()`), `duelistSlots(p)`. BattleScene `setup({ foePerson, foeSlots })`: INK_ART table, `flip`
  (mirrored draw incl. dissolve), a returning crescent. The family overlay no longer draws fights (`renderFightCard`
  removed; `familyPendingKey` returns null for any fight); duel / head-challenge / step-down cards hand over to the battle
  page, the head-challenge card shows its odds. Kin → Clan: Challenge the Head shows its odds pill (breakdown
  `personfight:<id>:<kind>`) + the head's feud; the "busy" lock now says why. Attention: a person fight opens `combat`.
- Sim: the bot makes the end choice (active: befriend where it gets a debt, else finish / humble). sim:quick healthy.
- Tests: checks/duels.js (29) + family-fights / family-marriage / succession checks updated for the end choice · smoke
  scenarios/duels.js (duel-*.png, all four modes, frame 4.3 ms); fights.js + succession.js smoke moved onto the battle page.
- Not done: the Tournament of Heirs (your children fight, you don't) is untouched; NPC–NPC bouts stay rolled.

**Depth pass.** Memory: vsYou + feud. Choices: finish / spare, raise / humble, yield, every exchange. Hooks: family
(spouse duel → spouse leaves or dies), clan succession (head seat, step-down bracket, branch founders), Health & Death,
karma, challenger scheduling. Drama: best — you spare the heir who challenged you and they stand by you for life;
worst — the cousin you humbled returns with a grudge and cuts you down in your own hall. Agency: the step-down
bouts you are in were a hidden roll; now every one is played.

## A6-3b: the Arena (spec 2026-09-29, user-approved: blood matches opt-in, push-your-luck purse)

**Roam → Arena.** Six rings (`ARENA_RINGS`, assets/data/arena.js), each opening at a realm: Dust (Mortal) · Iron (Qi
Condensation 3) · Jade (Foundation) · Golden (Core) · Lotus (Nascent Soul) · Heaven's (Spirit Severing). Each ring holds a
roster of `ARENA_ROSTER` named duelists (stages across the ring's band, tempers rolled) and a **champion** at the top of
the band. Duelists are person records kept in `s.arena.duelists` (not the world registry: they are the Arena's, per life),
so they carry `vsYou` + `feud` exactly like A6-3a opponents.

**A run.** Pick a ring and an opponent → pay the ring's entry fee → the bout plays on the battle page (f.fight kind
`arena`, `until one yields` unless you chose a **blood match**). Each win adds `prize × streak mult × renown mult × (blood
×3)` to the run's **purse**; the streak raises its multiplier (+`ARENA_STREAK_STEP` per win, capped). Between bouts the
choice is yours: **Walk away** (the purse is paid) or **fight on** (pick the next opponent; each duelist once per run).
The champion only answers after `ARENA_CHAMP_AFTER` wins in the run; beating them earns the ring's **title** and a
champion's prize. Losing ends the run and pays **half** the purse. A lost blood match kills you (cause `arena_blood`).
Wounds are real (FIGHT_WOUND per lost exchange); a run needs `ARENA_MIN_HEALTH`.

**Renown** (`s.arena.renown`): +wins (more for blood, champions, humbling), −declined call-outs; it multiplies purses
(+`ARENA_RENOWN_PURSE` per point, capped).

**Memory + drama.** The A6-3a end choices apply (finish / spare in a blood match, raise / humble otherwise), so arena
duelists owe you or hate you. A **grudge-holder may call you out** (`s.arena.callout`, a yearly roll): an urgent
attention card offers a grudge match (their stakes: a bloodthirsty temper demands blood) at `ARENA_CALLOUT_MULT`× the
purse — accept, or decline (−renown, the grudge stays). A **debtor may send a gift** (stones, and the debt is paid).
A coward refuses blood matches. A duelist who dies is replaced in the roster after the run.

**Hooks.** Health & Death · Spirit Stones · sects (a won bout: +`ARENA_SECT_FAME` fame for a founded sect, or
+contribution for a joined one) · A6-3a feuds + end choices · karma (a blood kill costs karma, sparing gains it) ·
banter (arena_win) · the sim bot.

**UX.** Roam → Arena: a run panel (purse, streak, multiplier math with a `arena` "why" card, Walk away) · ring cards
(lock reason, fee, prize, title held) · roster rows (name, temper, realm, your odds, record, feud, Fight · Blood match,
lock reasons: beaten this run / champion needs N more wins / coward refuses blood / wounded). The battle page's result
card for an arena bout shows the purse and offers Walk away / Choose your next opponent. Attention: a call-out (urgent),
a run waiting between bouts (ready), a newly opened ring (nudge). First visit: a one-line hint.

### A6-3b as built (2026-09-29)
- Data: assets/data/arena.js (`ARENA_RINGS` + tuning; loaded by index.html and the sim loader). Death cause `arena_blood`
  (game.js text, clan-legacies.js epitaphs).
- Engine (game-state.js → "A6-3b"): `s.arena` (`_blankArena()` in `_newGame` + `_ensurePhase35Fields`; per life) =
  `{ run, duelists, rings: { [id]: { roster, championId } }, titles, renown, best, callout, sectFame, seenRings, restUntil,
  record, last }`. `_arenaEnsureRosters` (lazy; the dead are replaced once no run holds the ring), `arenaInfo()`,
  `startArenaBout(ringId, oppId, blood)`, `arenaWalkAway()`, `answerArenaCallout(accept)`, `_arenaBoutEnd` (from
  `_finishFight`), `_tickArena` (yearly, beside `_tickFamily`: call-outs + gifts), `_arenaLock` (gone / stage / busy /
  other_ring / beaten / resting / champion / wounded / stones / no_blood). `_fightOpp` reads `s.arena.duelists` for kind
  `arena`, and so does the family load guard (a bug found by the smoke test: it dropped arena bouts on the next recalc).
  Humbling in the arena gives renown instead of cowing the clan; finishing costs `ARENA_KILL_KARMA`.
- **Balance (sim:quick, active bot):** the first numbers made arena purses 97% of all stones (726k / 24h) → prizes cut
  ~20×, and after every run the whole Arena rests `ARENA_REST_SECONDS` (30 min, real time) → arena ≈ 54% of an active
  min-maxer's stones (21k / 24h vs ~11k before the Arena). Still generous: tune in 2.8 QA.
- UI: renderer/game/arena-view.js (`ArenaView.render` / `tickInPlace` for the rest countdown), `#tab-arena`, NAV_GROUPS
  Roam → Arena, breakdown kinds `arena` (the purse) + `personfight:<id>:arena`, attention `arena-callout` / `arena-run` /
  `arena-ring`, CombatView arena titles / purse line / "Fight on · Walk away" result, Sect → Fame "Your Arena wins".
- Banter: trigger `arena_win` (4 lines per personality + 2 generic).
- Sim: bot.js `arena()` (active + casual; blood only at ≥ 95%), report section "The Arena".
- Tests: checks/arena.js (34) · smoke scenarios/arena.js (arena-*.png, all four modes).

## Gotchas

- `familyPendingKey()` and the family overlay **ignore** `kind: 'beast'`: the battle page owns it. The attention item
  routes a beast fight to `CombatView.resume()`.
- `s.health` can go to 0 or below inside a Slay battle (the only place a fight can kill without a roll); every other
  fight still floors Health at 1 mid-fight.
- `beastFightPreview()` reads `stageShortName` only if the renderer has loaded breakdowns.js (the sim loader hasn't).
- `canChallengeHead()` / `_branchWarBusy()` / NPC head challenges wait while any `f.fight` is set, beast fights
  included (one fight at a time).
- A won battle stays in `f.fight` with `over: 'won'` until the end choice, so a reload mid-choice resumes on it.
