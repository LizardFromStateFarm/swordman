# Combat & Battles — Reference
_Covers: game-state.js (fight engine: `f.fight`, beast battles, bestiary) · assets/data/beasts.js (BEAST_FIGHT_*, per-type
`fight` + `nature`) · renderer/game/combat.js (CombatView battle page) · renderer/engine/battle-scene.js (BattleScene canvas)
· game.js / beast-detail.js (Fight entry) · breakdowns.js (`beastfight` card) · attention.js · Phase: 35 (roadmap A6) ·
Updated: 2026-09-28_

Phase 35 is **not a new combat model**. It takes the fight card from 1.8b-3b (Press > Feint > Guard > Press, exchange
odds derived from a one-roll match chance, opponent habits) and extends it to non-family opponents on a full-window
battle page drawn with the ink engine.

**Split (user-approved 2026-09-28):**
- **A6-1** (this build): the spec, the engine generalized to beast opponents, **beast battles from Roam → Beasts** (Fight
  beside Tame), the battle page, the bestiary (engine + details page line), and a breakdown card.
- **A6-2**: Beast Hunt / Arena entry in the Roam group (`startArenaFight(tier)`, `s.arena = {streak, best, tier}`,
  `assets/data/arena.js`), a bestiary view, and banter triggers for battles.
- **A6-3**: route duels, head challenges, defending the seat, and your bouts in step-down tournaments onto the
  battle page (they use the family fight card today), plus humanoid duelist art (A3 part slots) and boss fights (23E/17).

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
   **Bind it** (tame it with a talisman; it joins at Lv.2). After a Drive-off win: **Let it flee** or **Bind it**.
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
{ kind: 'duel'|'challenge'|'defend'|'beast', oppId, lethal, p, to, you, them, round, log: [...], year,
  // kind 'beast' only:
  beast: { encId, typeId, variant?, traits, mood? },   // snapshot: the fight does not need the encounter to exist
  stance: 'slay'|'drive', power, over: null|'won' }     // over = won, waiting for the end choice
```
`to` is new: family fights keep `FIGHT_TO` (2), beast battles use `BATTLE_TO` (4). A save without `to` reads `FIGHT_TO`.
The load guard (`_ensure…`) drops a beast fight whose snapshot is missing a known type.

`s.bestiary`: `{ [typeId]: { fought, won, lost, slain, spared, bound, habitsKnown, returning: null|'grateful'|'vengeful' } }`.

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
- `beastFightFinish(choice)`: `'finish' | 'spare' | 'bind' | 'flee'` after a won battle → `{ ok, outcome, loot?, beast?,
  karma }`.
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
  realm state, the beast's INK_BEASTS art) cropped to their padded `figureBox` and set on a baked dotted field (stars,
  a dotted moon, two ridgelines, ground band, a trodden ring). Events queue and play in order (a backlog plays at 2×).
  Frame ≈ 3 ms (smoke). Classic Sprite art still gets the ink field (the beasts' Classic sprites are single-frame ASCII).
- **Entry points:** Roam → Beasts encounter card (Fight + odds; lock line when too wounded / busy), beast details page
  (Fight · N% to win, Mood + Bestiary stat rows). Sighting log: "Tame it or fight it in Roam → Beasts."
- **Tests:** scripts/sim/checks/combat.js (35) · smoke scripts/smoke/scenarios/combat.js (combat-*.png, all four modes).
- **Not done here (A6-2 / A6-3 / QA):** the sim bot doesn't hunt yet (it never starts a beast battle, so balance is
  untouched); no banter lines for battles (`beast_slain` is emitted but not a banter trigger); duels/tournaments still
  use the family fight card.

## Gotchas

- `familyPendingKey()` and the family overlay **ignore** `kind: 'beast'`: the battle page owns it. The attention item
  routes a beast fight to `CombatView.resume()`.
- `s.health` can go to 0 or below inside a Slay battle (the only place a fight can kill without a roll); every other
  fight still floors Health at 1 mid-fight.
- `beastFightPreview()` reads `stageShortName` only if the renderer has loaded breakdowns.js (the sim loader hasn't).
- `canChallengeHead()` / `_branchWarBusy()` / NPC head challenges wait while any `f.fight` is set, beast fights
  included (one fight at a time).
- A won battle stays in `f.fight` with `over: 'won'` until the end choice, so a reload mid-choice resumes on it.
