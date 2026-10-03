// Sect branches (分舵) + the Tournament of Branches (会武) — Phase 45 (docs/systems/sect-branches.md). Data only.
// Depends on: nothing. Used by: renderer/engine/game-state.js (branch logic), renderer/game/sect-view.js (Branches UI).

const SECT_BRANCH = {
  // A sect holds at most this many branches at once (user rule, 2026-10-02). Dissolve one to raise another.
  maxBranches: 4,

  // A branch's seats — the head counts as one: base + the head's talent (1–5) + 1 per 4 levels, capped.
  baseCap: 3,
  levelCapBonus: 1,
  maxCap: 10,

  // A branch feeds the sect at `yield` × a loyalty factor (the head keeps a share of what their members gather).
  yield: 0.7,
  loyaltyScaleFloor: 0.5,   // loyalty 0 → ×0.5, loyalty 100 → ×1.0, of `yield`

  // Head recruitment — a game-year tick (like the family): a new member every recruitYears[0]..recruitYears[1].
  recruitYears: [3, 6],
  recruitChance: 0.5,

  loyaltyStart: 70,
  secedeAt: 20,             // loyalty at or below → a wronged head takes the branch and leaves, a rival born

  // Loyalty only ever falls on a DIRECT wrong, never on neglect (user rule, 2026-10-02).
  wrong: { recall: 30, dissolve: 40, poach: 12, overlook: 5 },

  // Rivalry: branches grow jealous of one another; a hot rivalry can end in a brawl until it is settled.
  heatPerRecruit: 8,
  heatMax: 100,
  brawlAt: 70,
  brawlChance: 0.3,
  brawlHeatDrop: 45,

  // The Tournament of Branches (会武) — the sect leader holds it and pays the winner's prize.
  tourney: {
    baseCost: 60, costPerStage: 25, cooldownSecs: 900,
    winLoyalty: 12, loseLoyalty: -5,
    qiFrac: 0.35,             // 'qi' prize = 35% of your Qi cap
    stonesBase: 80, stonesPerBranch: 60,   // 'stones' prize scales with how many branches contended
    fame: 20,
  },
}
