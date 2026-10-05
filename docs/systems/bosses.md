# Legendary Bosses & Soul Techniques — Reference
_Covers (planned): assets/data/bosses.js (BOSSES, SOUL_TECHNIQUES, tuning) · game-state.js (fight kind `boss`, phases,
`w.bosses`, `w.soulTech`, the mirror heir, the clone + its expedition slot) · hunt-view.js (the Legendary section) ·
combat.js + battle-scene.js (phase bar, boss looks) · family-view.js (Seed of the Self) · the Explore view (the clone's
slot) · attention.js · banter · the sim bot · checks/bosses.js · smoke scenarios/bosses.js ·
Phase: v1 add-on (user 2026-10-04; replaces the A6-3c "bosses" placeholder) · Status: **built 2026-10-04** (spec approved as written; the Bird's art from a picture the user supplies — placeholder until then; the clone = two expeditions at once) · see "As built" at the end_

**User's words (2026-10-04):** *"a couple more rare techniques that are unlockable from big boss fights — one allows you to
breed with yourself, the other allows you to 'clone yourself' which allows for two queued explorations. So 2 techniques and
2 boss fights."* Picks: two legendary bosses in **Roam → Hunt**, behind a realm gate, fought on the battle page **with their
own phases**; beating one teaches its technique **once — the soul keeps it in every later life**; **never in the first
life** (boss 1 from your **3rd life**, boss 2 from your **6th**); a loss leaves you **badly wounded with a real-time wait,
never dead**; the self-child is **a mirror heir, with risks**.

---

## The two bosses

| | **The Self-Born Vermilion Bird** | **The Thousand-Face Mirror Wraith** |
|---|---|---|
| Teaches | **Seed of the Self** (the mirror heir) | **Body Beyond the Body** (the clone) |
| Appears | Life ≥ 3 · Core Formation Early or higher | Life ≥ 6 · Nascent Soul Early or higher |
| Element | Fire → (reborn) Fire + Wood | Mirrors yours, then its own Water |
| Look | an ink firebird, wings of embers; reborn from ash in phase 2 | your own ink figure, inverted and hollow-eyed; splits in phase 2 |

**Phases** (a boss is a beast-model fighter on the move engine with an HP-threshold script; the phase bar above its
health shows the marks):
- **Vermilion Bird.** *I · Wings of Cinder* (100–55%): fire moves, Burn. *II · From the Ashes* (at 55%): it burns to ash
  and is reborn: heals to 70% of the bar once, gains Wood moves (regrowth). *III · The Last Egg* (below 25%): it curls into
  an egg and **hatches in 3 turns** (heals 40% if it hatches). Hit hard now, or brace for the hatchling.
- **Mirror Wraith.** *I · Your Reflection* (100–60%): it fights with **a copy of your own equipped arts** (the deck you
  brought). *II · Two Faces* (at 60%): it splits into two bodies; one is false. Each turn you see a "tell" whose
  reliability is shown ("You read the true face: 70% sure"). A blow on the false face is wasted. *III · The True Face*
  (below 25%): the false body breaks, and it turns your strongest art back on you (reflect).

**Odds first.** The prepare step shows the Monte Carlo estimate (like a beast fight) **plus the phase script in plain
words**, and what a loss costs. Retreat is open every turn.

**A loss (never lethal):** your Health drops to 10% of max, and the boss **rests 30:00 (real time, m:ss)** before you can
face it again. **What you learn carries:** each failed attempt adds +3% to your next estimate ("You know its rhythm now":
max +15%), per boss, kept across lives.

**A win → the end choice (the player's):**
- **Take its heart.** You learn the technique now (if new), plus a rare drop (*Vermilion Ash Pill*: a large Health +
  Integrity heal / *Mirror Shard*: a craft material for a top-tier artifact). Renown +, slayer title on World → Rankings.
- **Let it return to the wild.** You still learn the technique, but take no drop; karma +, Honour +. It remembers the
  mercy: next time it appears it is **stronger (+1 realm) but brings a better drop**, and the Bird leaves a gift once a
  life ("a feather at your door").

**Rematches:** after the first win, each boss reawakens **once per life** (when its gates are met again) for its drop,
renown and the title, and as a test of a new loadout. The technique is never taught twice.

**Memory (per save, across lives):** `w.bosses[id] = { tries, wins, mercy, lastLife, restUntil }`. The boss's lines on
the card and in battle banter read it ("You again. The third of your line to come.").

---

## Technique 1 — Seed of the Self (自生种诀) · the mirror heir

**Use:** Kin → Family → **Seed of the Self** (shown once the soul knows it). Gate: Core Formation or higher; **once per
life**; you must be at ≥ 60% Health.
**Cost, shown first:** Health −40% of max, and **Essence Spent**: Qi/s −25% for **45:00 real time** (a chip with the m:ss
countdown on Path → Character).
**The child:** a normal child record with `mirror: true`:
- root = **a copy of yours** (same type + multiplier; an "echo" never exceeds you); temper = **yours**; morality starts at
  yours (from karma); bond starts high (65).
- **No partner**, so no partner term in the Bloodline growth; as an heir it counts like any child (no BQ speed-up: the
  ~37-life pace to Immortality the user accepted stays).
- Grows, cultivates, can be named heir, recruited into your sect, and raised (all existing child actions).
**Your spouse reacts (their temper decides; you answer):** an accepting spouse adopts the child (+affection); a jealous or
proud one is hurt (affection −; a crisis event "Was I not enough?" with 3 answers: reassure / defend the choice / dismiss).
**Drama — The Mirror Turns:** a mirror child shares your heart, ambitions included. When grown, if its bond < 40 **or** you
wronged it (abuse, passed over as heir for a weaker sibling), an event fires: *"It wears your face, and wants your seat."*
Answers: **Yield the seat** (it becomes head; you keep cultivating) · **Face it** (a head challenge on the battle page; the
child decides lethality by its temper, like 2.6e) · **Send it away** (it leaves and founds a house: from then on it is
**Your Rival** in the next life, through the 4.10b houses). A high bond instead gives a payoff: *"Two hearts, one path"*,
the child shares one of your arts' mastery and fights at your side in a sect war.

## Technique 2 — Body Beyond the Body (身外化身) · the clone

**Use:** Roam → Explore shows **a second expedition slot, "Your other self"**, once the soul knows it. Gate: Nascent Soul
or higher.
**Cost, shown first:** forming the clone costs 20% of your current Qi cap; **while it is out, your Qi/s is −15%** (a split
spirit; shown on the Qi breakdown). Recalling it early refunds nothing.
**What it does:** runs **a second expedition at the same time** as yours, at any location you can enter, with the same
timer and drop table. Its trip can also roll a road encounter, which joins your normal Met on the road queue ("Your other
self met someone at…").
**Risk (odds shown on the slot before sending):** a place above your realm can **shatter** the clone (chance by the place's
gate vs your realm, 0% at or below your realm; up to 35%). A shattered clone returns nothing, costs you Health −20% and a
**20:00 real-time** wait before you can form it again.
**Drama — It Lingers:** a clone kept out a long time slowly gains a will of its own (chance per return rises with its total
time out this life; shown on the slot as "Its will: faint / stirring / its own"). When it fires: *"Your other self does not
come home."* Answers: **Draw it back in** (you absorb it: it brings its last trip's drops plus mastery on one art; the will
resets) · **Let it walk its own road** (it becomes **a real person in the world registry with your face and root**: a
wanderer who lives, cultivates and may meet you on the road: a friend, or a rival; you lose the technique's slot **for the
rest of this life**).
**Automation:** Auto-Explore may also refill the clone's slot (a separate toggle, off by default; the player's delegated
chore, overridable per trip). It never sends the clone above your realm.

---

## Depth pass
1. **Memory:** per-boss tries/wins/mercy across lives (odds + lines change); the mirror child's bond and wrongs; the
   clone's growing will; a released clone is a lasting person in the world.
2. **Choices:** the end choice (heart / mercy); retreat every turn; the Wraith's true-face reads; spouse crisis answers;
   The Mirror Turns (yield / face / send away); It Lingers (draw back / let go); where and when to send the clone.
3. **Hooks (≥ 3):** reincarnation + the soul (gates, kept techniques) · the move-combat battle page · Hunt + Bestiary
   (a Legendary page) · expeditions + Auto-Explore + Met on the road · family (spouse reactions, children, heirs,
   head challenges) · Your Rival (a sent-away mirror child's house) · the living world (a released clone) · Bloodline
   (no partner term) · rankings (slayer titles, renown) · karma + Honour (mercy) · banter · attention.
4. **Drama:** best: a mirror heir who fights at your side; a clone that doubles your harvest; the Bird's yearly feather.
   Worst: your own mirror child taking your seat or becoming the next life's rival; the clone walking away with your face;
   a shattered clone; a boss loss that leaves you at 10% Health with avengers on the road.
5. **Feedback:** past tries raise the odds; mercy makes bosses stronger but richer; how you treated the mirror child decides
   whether it turns; how long you leave the clone out decides whether it leaves.
6. **Agency:** every use is a button the player presses (no timer makes a mirror child or sends a clone, except the
   opt-in Auto-Explore toggle, overridable per trip). Bosses, spouses and the mirror child act on rolls; the player answers.

## UX pass
1. **Surface:** Hunt → **Legendary** section: two boss cards (silhouette until seen), the gates as a checklist ("Your 3rd
   life · Core Formation"), tries / wins / mercy, the rest countdown in m:ss, the estimate + its why. Battle page: a
   **phase bar** with marks + the phase name; the Wraith's read chance. Family: the Seed card with the costs and the
   once-a-life state. Explore: the second slot with its Qi/s cost, the shatter odds per place, its will meter.
2. **Interact:** fight from the boss card (1 tap → prepare → fight). Seed of the Self: 1 tap + confirm. The clone: pick a
   place in its own slot (the same picker as yours). Designed for Expanded/Desktop first; Overlay stacks the cards; phone
   uses the same stacked layout.
3. **Discover:** when a boss's gates are first met: a toast + an attention item ("Something legendary stirs in the
   Hunt") + a dot on Roam. After a win: a one-time hint on the Family / Explore view pointing at the new technique.
4. **Feel:** ink bosses with phase-change effects (the ash rebirth, the split), gold/vermilion/purple tokens, novel-style
   lines ("The bird burns. From the ash, an egg."). Text size + colour-blind settings honoured (phase marks also carry
   labels, not colour alone).
5. **UX debt:** none known yet in these views; log what the build finds.

## Art (asset pipeline, ≥ 8.0)
- **Mirror Wraith:** built from the ink duelist figure (your own look, inverted palette, hollow eyes, a split effect).
- **Vermilion Bird:** no firebird exists. Option A: the user supplies a source picture for the bake pipeline (like every
  beast so far: example_art → scripts/art/ink-bake.js). Option B: derive it from the eagle's dot map (recoloured, larger,
  ember wings + the ash/egg effects). **User pick (2026-10-04): Option A — the user supplies the picture.** Until it arrives the Bird draws with a placeholder (the eagle's dot map in vermilion), flagged in UX debt; the asset gate runs on the real bake.

## Data (assets/data/bosses.js, data only)
`BOSSES` (id, name, technique, gates {life, stage}, element(s), hp mult, phases [{at, name, moves, script}], drops, lines),
`BOSS_FIGHT` (rest 1800 s, loss Health 10%, learn bonus 3%/try max 15%, mercy +1 realm), `SOUL_TECH` (seed: costs, bond,
once-per-life, turn thresholds; clone: Qi cost 20%, Qi/s −15%, shatter curve, will curve, rest 1200 s).

## State (planned)
- `w.bosses = { bird: {tries, wins, mercy, lastLife, restUntil, seen}, wraith: {…} }`, `w.soulTech = { seed: bool, clone: bool }` (world-level =
  kept across lives in this save; migrated by `_ensureBossFields()`).
- Per life: `s.seedUsed`, `s.essenceUntil`, `s.clone = { exp: {active, locationId, endsAt} | null, out: sec, will, gone,
  restUntil }`.
- A child gains `mirror: true`; a released clone is a registry person with `role: 'wanderer'`, `cloneOf: <your pid>`.

## Build order (one task, sub-steps)
a) data + state + migration + the boss fight engine (phases) + checks → b) the Hunt Legendary section + battle page phase
bar → c) Seed of the Self + the mirror child events → d) Body Beyond the Body + the second slot + It Lingers → e) art
(pipeline) → f) banter, attention, the sim bot, smoke, the Visual Review Gate in all 4 modes, docs.

---

## As built (2026-10-04, part 97)

**Status: built — engine, UI in every layout mode, sim bot, checks, smoke; Visual Review Gate 7.2 → 7.6 PASS.** The Vermilion Bird's real art is baked (asset gate 8.2). Banter (final QA, 2026-10-04): `boss_awake` + `boss_won` have lines
(4 per personality + 2 generic; true for both bosses). Still silent (no lines, by choice — rarer moments): `mirror_born`,
`clone_shattered`, `clone_lingers`.

**Data** (`assets/data/bosses.js`): `BOSS_MOVES` (Shell of Ash, Cinder Talon, Hollow Palm), `BOSSES` (gates, phases, drop,
lines), `BOSS_ORDER`, `BOSS_FIGHT`, `SOUL_TECH`. Items: `vermilion_ash_pill` (full heal), `mirror_shard` (material),
`artifact_mirror_soul_plate` (Qi/s ×1.5) + its hidden recipe; `RECIPE_DISCOVERY.boss` — `recipeSource()` returns `'boss'`
and `_rollHiddenRecipe()` never hands it out by chance. Art (2026-10-04): `INK_BEASTS.vermilion_bird` baked from the user's picture (example_art/vermabird.png → `scripts/art/ink-bake.js vermilion_bird`: the halo cut by `pale` + `erode`, `flipX` to face you, 175×202 dots), wings beating from their roots, the tail swaying, embers rising — asset gate **8.2 PASS** (the placeholder recoloured eagle is gone).

**Engine** (`game-state.js`, section "v1 add-on: Legendary bosses"):
- State: `w.bosses[id] = { tries, wins, mercy, seen, wonLife, restUntil, awakeLife, fresh }`, `w.soulTech = { seed, clone }`;
  per life `s.soulUse = { seedUsed, essenceUntil }`, `s.clone = { exp, outSec, linger, gone, restUntil, auto, lastLocationId }`.
  `_ensureBossFields()` runs last in `_recalc`. A `boss` fight survives `_ensurePhase16Fields`' fight validation.
- Fight kind `'boss'`, stance `'boss'` (`_mbThrownHp` → 1: thrown down at 1 Health, never death). `_mbNewBoss(id)` builds
  the battle (`b.boss = { id, phase, egg, split, read, hatched, learn, stolen, shift }`); `_mbFoeBoss` (HP = beastHpBase ×
  hpMult × (1 + 6%/stage above the gate) × (1 + 15%/mercy); power = gate × 100 + `def.power` + 60/stage above + 100/mercy).
- Phases: `_mbCheck` calls `_mbBossPhase(b)` **before** a win is declared, so the Bird's rebirth catches a killing blow
  (only a `heal` phase stops death); `_mbEndTurn` calls `_mbBossTurn(b)` (the egg counts down, hatches +40%);
  `_mbAct`: during Two Faces each of your attacks hits the false face unless `rng() < read` (`ev.falseFace`).
  `_mbClone` copies `b.boss`, so the Monte Carlo estimate plays the phases.
- Learning: each try → `you.P.might += 3%` (max 15%) and the Wraith's read +3% (max 85%).
- API: `bossInfo()`, `bossFightPreview(id)`, `startBossFight(id)`, `bossFightChoices()`, `bossFightFinish('heart'|'mercy')`,
  `markBossSeen(id)`, `fightExchange('retreat')` (no parting blow), `_bossLost`, `_tickSoulTech()` (year queue: announces a
  woken boss once a life + `_tickMirrorChildren`).
- Seed: `seedInfo()`, `useSeedOfSelf()`, `_makeMirrorChild()`, `answerSeedCrisis(reassure|defend|dismiss)`,
  `mirrorTurnInfo()`, `answerMirrorTurn(yield|face|send)`; the ally bonus folds into `_swornWar()` (every war resolver +
  odds card reads it; labels now "At your side: …").
- Clone: `cloneInfo()`, `startCloneExpedition(loc)`, `recallClone()`, `setCloneAuto(on)`, `_tickClone()` (in `tick`),
  `_resolveClone()` (shatter → linger → drops + a road roll), `answerCloneLinger(absorb|release)`. Shatter =
  7% × stages the place's gate sits above (your stage − 3), max 35%. Will = out-hours this life × 4%, max 50%.
- Qi/s parts: "Essence spent (Seed of the Self)" ×0.75 while it runs; "Your other self is out" ×0.85.

**Tuning** (`scripts/sim/probe-boss-fights.js`; kept loadout, mastery 2, body tier 2): both bosses ~30% at their gate,
45–58% after 3–5 tries, 83–90% three stages up; ~9–10 turns (twice a gate beast). Bird `hpMult 2.0, power 0`; Wraith
`hpMult 2.4, power 0`. 60 h active sim: Bird 4 tries / 4 wins, Wraith 1 / 3 (once-a-life rematches), boss fights 6 turns
median, 282 clone trips, 10 lingered.

**UI**: Roam → Hunt → **Legendary** (`hunt-view.js` `_legendary`); battle page boss mode (`combat.js` `openBoss`,
`_setupBoss` — the Wraith wears your figure + slots in purple — `_prepareBoss`, `_platesBoss` with the phase bar marks +
phase/egg/split chips, a phase line above the moves, `_endBoss`, `_finishBoss`); Kin → Family `_seed` (the Seed card,
the spouse's hurt, The Mirror Turns as stacked rows, a Mirror chip on the child); Roam → Explore `renderClonePanel`
(game.js); attention items `boss-awake`, `mirror-turn`, `seed-crisis`, `clone-linger`.

**Sim bot** (`bot.js` `bossBattle`, `legends`): faces a woken boss at ≥ 40% (active) / ≥ 50% (casual), never afk; heart
(active) or mercy 1 in 3; plants the seed half the time; faces a turning mirror child when ≥ 60%, else sends it away
(active) or yields; sends the clone to the deepest place ≤ 10% shatter when Qi ≥ 2× the cost; releases a lingering clone
1 in 10. Report line "Legendary bosses (v1 add-on)".

**Diverged from the spec:** the learning bonus is +3% *might* per try (a real effect), not +3% on the shown estimate;
Retreat has no parting blow (it ends the try, the boss rests); the spouse reaction is by temper (hurt / accept / a coin
flip), the crisis has fixed affection deltas (+8 / 0 / −12).

**Checks:** `scripts/sim/checks/bosses.js` (56) · recipes.js (+3) · smoke `scripts/smoke/scenarios/bosses.js` (4 modes).
