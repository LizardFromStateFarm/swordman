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

// ── The mirror: YOU may lay a hand on your own child (user 2026-10-01) ────────────────────────────────
// A deliberate raising action (Kin → Family, the child's raising row) — never automatic, behind a confirm.
// The child remembers: their bond falls by CHILD_ABUSE_BOND (keyed by THEIR personality, so a `stoic` one
// hardens and a `coward` breaks), a grudge builds, and CHILD_ABUSE_TRAUMA_AT hits scar them — which already
// feeds the heir Bloodline term (2.6d). Hitting a child costs karma. A grown child you have hit enough, who
// now outranks you, eventually calls you out (CHILD_RECKONING) — the mirror of "A father's hand".
// Used by: game-state.js (abuseChildPreview/abuseChild, childReckoningInfo/resolveChildReckoning),
// family-view.js (the action + confirm), game.js (the reckoning card), attention.js.
const CHILD_ABUSE_CD_SECS    = 600        // real seconds between beatings of the same child
const CHILD_ABUSE_MIN_AGE    = 4
const CHILD_ABUSE_KARMA      = -6
const CHILD_ABUSE_BOND       = { default: -22, stoic: -14, coward: -28, hotblood: -30, niceguy: -26, arrogant: -18, psycho: -12, demonking: -10 }
const CHILD_ABUSE_GRUDGE_MAX = 3
const CHILD_ABUSE_TRAUMA_AT  = 2          // hits before it leaves a scar on the child
const CHILD_RECKON_MIN_HITS  = 3          // hits before a grown child calls you out (a child's stage is capped
                                          // at yours and grows slowly, so grown + hit enough is the real gate)
const CHILD_RECKON_HEALTH    = -20        // accepting their blow: Health −20 (never lethal, floors at 1)
const CHILD_ABUSE_REACTIONS = {
  default:   '{name} does not cry. {name} does not look away either.',
  stoic:     '{name} takes it in silence, and files it away.',
  coward:    '{name} promises anything, anything at all, to make it stop.',
  hotblood:  '{name} spits blood and swears you will not always be stronger.',
  niceguy:   '{name} asks what they did wrong. You do not answer.',
  psycho:    '{name} smiles through it. That is worse than the crying.',
  demonking: '{name} goes very still, and starts to plan.',
  arrogant:  '{name} tells you that you will regret this. You probably will.',
  poet:      '{name} will write about this one day.',
  lazy:      '{name} simply endures, waiting for it to be over.',
  grumpy:    '{name} glares, and says nothing at all.',
  glutton:   '{name} curls around their bruises and thinks of dinner.',
  gremlin:   '{name} only learns to be quieter about the things you hate.',
  miser:     '{name} counts what this will cost you, some day.',
  paranoid:  '{name} was right about you all along.',
}
const CHILD_RECKONING_TITLE = 'A Child’s Reckoning'
const CHILD_RECKONING_TEXT  = '{name} is grown now — no longer a child you can simply strike. They have not forgotten. They stand in your doorway.'
const CHILD_RECKONING_CHOICES = [
  { id: 'accept', label: 'Let them strike', sub: 'take the blow · karma up · it eases', result: 'You do not raise a hand. {name} strikes you once — and something between you is paid.' },
  { id: 'refuse', label: 'Put them down', sub: 'karma down · they will not forgive this', result: 'You put them on the ground. They get up, walk out of your house, and do not come back.' },
]
