# Sect Branches & Sub-leaders (分舵) — Reference & Build Spec
_Covers: assets/data/sect-branches.js · renderer/engine/game-state.js (`s.ownSect`, `_tickBranches`, branch API) ·
renderer/game/sect-view.js (Sect → Disciples) · renderer/game/family-view.js (Kin → Family child card) · Phase: 45 ·
Updated: 2026-10-02_

> **Status: built (2026-10-02).** Not a roadmap milestone; user-requested depth for the sect-ownership system
> ("appoint your disciples as sect sub-leaders to run their own branch of the sect where they would recruit their
> own disciples, and recruit your kids whenever you want for free"), grown to the **full** option the user picked
> (branch-vs-branch rivalry + promoting members) plus a **Tournament of Branches** the sect leader holds and prizes.

## The ask (user, 2026-10-02)
Appoint disciples as **sub-leaders** who run their own **branch (分舵)** and **recruit their own disciples**; recruit
your **children for free, any time**. User's answers when the spec was put to them: appoint **freely, no gate**;
children recruited once **grown/awakened**, free and instant; branches at **full depth** (rivalry + promotion);
**a Tournament of Branches** the sect leader starts, awarding the winner **Qi, an art, or Spirit Stones**; and
**no relationship maintenance** — a head only turns on you if you **directly wrong** them.

## Depth pass (CLAUDE.md)
1. **Memory** — a branch remembers its head, its members, how it grew, its **loyalty**, its **rival**, and the
   **heat** of that rivalry; the sect remembers who last won the tournament.
2. **Choices** — appoint a head (any disciple, any time); dissolve a branch; promote a member up into your own
   hall; hold the Tournament of Branches and choose the prize; take a grown child into the sect.
3. **Hooks (≥3)** — **disciples** (branch members are disciples: Qi, stones, herbs, fame) · **family/children**
   (a recruited child keeps their root as talent, their bond and personality) · **sect war/fame** (branch members
   raise `sectFame`, which draws rivals sooner) · **personalities** (a head's temper colours the log) · the
   **sect library** (a branch head's win can hand you a manual) · **karma** (wronging a head).
4. **Drama** — best: a beloved child heads a thriving branch that doubles your intake and wins your tournament.
   Worst: you spend a head's loyalty too often and they **secede with their whole branch** — a rival house grown
   from your own.
5. **Feedback** — branches you leave alone keep their head loyal (there is **no passive decay**); the loyalty you
   lose is exactly the loyalty you spent wronging them.
6. **Agency** — every player decision is explicit: appointing, dissolving, promoting, holding the tournament,
   picking its prize, and recruiting a child. The **world** may roll a head's yearly recruitment and the odd
   brawl — never a decision that is the player's.

## UX pass (CLAUDE.md)
- **Surface** — Sect → **Disciples** gains a **Branches** section: each branch shows its head (temper, loyalty),
  its seats, what it yields, and its rivalry. Every number reads the real math (`branchInfo`). The tournament
  tile shows its cost, what each prize gives and the cooldown.
- **Interact** — appoint a head with one tap on a disciple row; dissolve/promote from the branch card; hold the
  tournament from the Disciples view; recruit a child with one tap on their card in Kin → Family. All ≤2 clicks.
- **Discover** — attention nudges: a branch can grow / a head is near seceding / a tournament is ready / a grown
  child could be taken into the sect.
- **Feel** — the existing `fam-card` / `fa-btn` / `sv-*` vocabulary; 分舵 flavour; gold for a win, red for a
  secession risk.
- **Layout** — no sixth Sect sub-tab (the row is already full and cramped on Overlay — known UX debt): branches
  live inside Disciples, which keeps every layout's ≤3-Overlay-screens bar.

## State (`s.ownSect`, added by `_ensurePhase45Fields()` — works on an old save)
```
branches: [ { id, name, headId, since, lastRecruitYear, wins, losses, loyalty, wrongedYear, rivalId, heat, tourneyWins } ]
branchSeq: number    tourneyAt: number (stats.timePlayed stamp)    lastTourney: {year, winnerId, rewardKind, amount}|null
```
Each disciple gains `branchId` (null = your own hall, else a branch id), `role` (`'disciple'`|`'head'`),
`kin` (a child you brought in) and `personality` (migrated from a hash of the id — no new RNG draws).

## API (game-state.js)
- `appointBranchHead(discipleId)` → `{ok, branch?}` — free, no realm/cost gate, but **at most `SECT_BRANCH.maxBranches`
  (4) branches** at once. Reasons: `no_sect`, `not_found`, `already_head`, `max_branches`. Appointing a disciple who already sits in another branch **poaches** them (that head is wronged).
- `dismissBranch(branchId)` → `{ok}` — the head steps down and the branch dissolves; the head + members return to
  your hall where seats allow. **A direct wrong:** the head's loyalty drops; if it reaches `secedeAt` they **leave
  with the members**.
- `promoteBranchMember(discipleId)` → `{ok, reason?}` — move a branch member up into your own hall (needs a free
  seat). **A direct wrong** to their head (`poach`).
- `holdBranchTournament(rewardKind)` → `{ok, winner?, reward?}` — `rewardKind` ∈ `qi` · `art` · `stones`. Needs
  ≥2 branches, stones (`_branchTourneyCost()`), and not on cooldown. Reasons: `no_branches`, `stones`, `cooldown`.
- `recruitChild(childId)` → `{ok, disciple?}` — **free and instant** for a grown/awakened child. Reasons:
  `no_sect`, `unknown`, `gone`, `young`, `joined`, `full`. A child's spiritual root sets their disciple talent.
- `branchInfo()` → UI read helper (`{ count, max, full, … }`): per branch `{ b, head, members, cap, seats, ym, loyalty, rival, heat, seceding,
  totals, strength }`, plus `{ count, tourney:{cost, ready, secsLeft}, last }`.
- `_branchCap(headDisciple)` · `_branchYieldMult(b)` · `_discipleYieldMult(d)` · `_branchTourneyCost()` — module-
  scope/method helpers shared by the engine, `ownSectInfo()` and the view.
- `_tickBranches()` — a game-year tick (with `_tickFamily()`, so it only runs while you are present — pillar 4):
  a head may take on a member, earns/keeps heat with its rival, and a hot rivalry may break into a brawl.

## Rules
- **A sect holds at most 4 branches** (`SECT_BRANCH.maxBranches`, user rule 2026-10-02). At the cap the Branches header
  reads `4 / 4`, every disciple row's **branch** button is disabled with a tooltip, and a note says to dissolve one
  first. A save that somehow holds more keeps them (nothing is torn down) but can't raise another until under the cap.
- **The main hall cap only limits your own hall.** Branch members live in their branch's seats (`_branchCap`), not
  against `discipleCap` — so branches are how a sect grows past its Hall. `recruitDisciple` / `recruitChild` /
  `ownSectInfo().full` all count only unbranched disciples.
- **Branch output** is `member rates × SECT_BRANCH.yield × loyaltyFactor` — a happy head passes on ~60% of a
  direct disciple's Qi/stones/herbs; a sour one less.
- **Loyalty never decays on its own.** It only falls with a direct wrong (dissolve · promote/poach · being
  overlooked at a tournament), and only a wrong can drive a head to secede.
- **A child's root is their talent** (mixed→2, dual→2, pure→3, heavenly→5), and they keep their bond/personality.
- **The tournament picks the strongest branch** by a seeded strength roll plus the player's chosen prize; every
  other branch is a little overlooked (`loseLoyalty`).

## Gotchas
- Branch growth is on the **game-year** tick inside `tick()` only — it does **not** run in offline catch-up (like
  the family), so absence is never punished.
- `_ensurePhase45Fields()` is called in the `_recalc` chain **after** `_ensurePhase43Fields()`; it drops any branch
  whose head is gone (a dismissed/killed head dissolves their branch automatically).
- A seceding branch is logged and noted as an enemy (`_noteEnemy`) but does **not** yet become a real NPC sect
  record — that lands with Phase 43b's `s.world.sects`.
- The 6th Sect sub-tab was deliberately avoided; the Branches section stays inside Disciples.
- **Layout (2026-10-02 fix pass):** the tournament prizes are `.sv-prize` medallions (icon · name · prize, stacked) in a
  3-column grid, never `.fa-btn` rows (those squeezed to one word a line in Desktop's narrow column). In Overlay the
  sect sections `align-self: stretch` (the `.fam-view` flex column's `align-items:start` let a no-wrap row push a
  section past the pane), and the disciple row's **branch / dismiss** go icon-only (`.sv-disc-act`, labels kept in
  `title`/`aria-label`) so names fit; elsewhere the pair wraps together to a right-aligned second line.

## Checks / smoke
- `scripts/smoke/scenarios/branches.js`: the 4-branch cap + no clipping of the prizes / child button in Overlay,
  Expanded, Desktop and phone; the cooldown lock (`out/branches-*.png`).
- `scripts/sim/checks/sect-branches.js` (38): appoint/dissolve/poach, the Hall-cap split, branch yield, loyalty only
  on a wrong, secession, tournament prizes + cooldown, `recruitChild` (young/grown/free/root→talent/kin), migration.
- `scripts/smoke/scenarios/sect.js` (+9): a disciple row offers **branch**, the branch card renders, a second branch
  shows the tournament tile, holding it records `lastTourney`, and a grown child is taken in from Kin → Family.
  New shots `sect-founder-overlay-branch` / `-branches` / `-tourney` / `-child-recruit`.


## Secession → a real sect (Phase 43b, 2026-10-02)
A head who secedes now raises a **splinter sect** in `s.world.sects` (`_wsSplinter`: kind `splinter`, led by the head, their temper, members + 1 disciples, stance −70, the wrong remembered as a deed). It grows like any NPC sect, is a likely war attacker (hostility-weighted), and can send the **lure** world event (pay your disciples to stay / let two go / threaten it). `world.enemies` now names the splinter sect. See npc-sects.md → 43b.
