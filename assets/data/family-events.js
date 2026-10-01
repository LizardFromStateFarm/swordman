// A bad father beats his child — a rare family event (family.md → "A father's hand"). Data only.
//
// "Your father" is the head who raised you in this life (s.birth.headId) — the same person the upbringing event
// (succession.js UPBRINGING_EVENTS) is keyed to. He counts as BAD when any one of these is true: a cruel parenting
// style, a cruel personality, his own trauma (he survived the Tournament of Heirs), or a bond that has gone cold.
// It only fires while you are still a child of the house (within BEATING_MAX_YEARS of waking), and it is rare —
// a whole-generation dramatic beat like 2.6e's challenges, not a recurring minigame (both a year interval AND a
// flat chance gate it). Never lethal: _applyFamilyEffect floors Health at 1.
//
// Choice outcomes read a mix of HIS personality (bond deltas below) and YOUR personality (the `bond[yourId]` key,
// exactly like UPBRINGING_EVENTS). Enough defiance, grown up and outranking him, unlocks BEATING_RECKONING.
// Used by: game-state.js (_tickFamily roll, beatingInfo/resolveBeating, reckoningInfo/resolveReckoning),
// game.js (the family-overlay card), attention.js (urgent + ready items).

const BEATING_CHECK_YEARS        = [6, 14]   // game years between checks while you are young + he is bad
const BEATING_CHANCE             = 0.30      // odds it actually happens when the game checks
const BEATING_MAX_YEARS          = 12        // only within this many years of waking (you are a child of the house)
const BEATING_BAD_STYLES         = ['ruthless', 'neglectful']
const BEATING_BAD_PERSONALITIES  = ['psycho', 'demonking', 'arrogant', 'grumpy', 'miser']
const BEATING_BOND_MAX           = 35        // a bond below this counts as a bad relationship on its own
const BEATING_SCAR_AT            = 2         // beatings before it leaves a scar (s.self.trauma → heir Bloodline)
const BEATING_RECKONING_DEFIANCE = 3         // defiance needed for the grown-up reckoning
const BEATING_KARMA              = { forgive: 4, break: -4 }

// The event: one beating, three answers. `defiance` is the memory that later unlocks the reckoning.
const BEATING_EVENT = {
  id: 'beating', title: 'A Father’s Hand',
  choices: [
    { id: 'endure', label: 'Endure it', sub: 'Health −20 · say nothing', defiance: 1,
      effect: { health: -20 },
      bond: { default: 2, stoic: 6, coward: 4, hotblood: -6, arrogant: -4 },
      result: 'You take it without a sound. He loses interest and walks away.' },
    { id: 'flee', label: 'Run', sub: 'Health −10 · he remembers', defiance: 2,
      effect: { health: -10 },
      bond: { default: -6, coward: 2 },
      result: 'You slip his reach and spend the night in the cold. He remembers.' },
    { id: 'defy', label: 'Strike back', sub: 'Health −20 · you cannot win — yet', defiance: 3,
      effect: { health: -20 },
      bond: { default: -8, hotblood: 4, niceguy: 2, stoic: -4, coward: -6, arrogant: -12, demonking: -10, psycho: -14 },
      result: 'You swing. He puts you down — but he looks at you differently now.' },
  ],
}

// The grown-up reckoning: he once beat you; now you outrank him. Forgive, or make sure it never happens again.
const RECKONING_TITLE = 'A Reckoning'
const RECKONING_TEXT  = '{head} once beat you bloody. You are grown now — and you stand above him.'
const RECKONING_CHOICES = [
  { id: 'forgive', label: 'Let it go', sub: 'karma up · the bond eases', result: 'You let it go. {head} does not meet your eyes — but something between you eases.' },
  { id: 'break',   label: 'Break him', sub: 'karma down · he never raises a hand again', result: 'You stand over {head}. He will never raise a hand to you again.' },
]
