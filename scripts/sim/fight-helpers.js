// Fight helpers for scenario checks (scripts/sim/checks/*.js) — Phase 42c (task 1.14a): every fight is on moves, so a
// check that needs "win this fight" / "lose this fight" forces the move battle instead of rolling Press/Guard/Feint.
// Not a check itself (run-all only runs checks/). docs/systems/qa-sim.md → "Scenario checks".
//
//   playFight(gs, 'win')  → plays until the fight waits for your end choice (fi.over === 'won'): their HP is set to 1 and
//                           they can't parry, you use Palm Strike, and every parry prompt is answered on the mark.
//   playFight(gs, 'lose') → plays until the fight is over against you: your Health is set to 2 (a lethal fight kills you,
//                           one "until one yields" throws you down), they only use Palm Strike, every parry is missed.
// Returns the last fightMove / fightParry result (with .outcome / .done / .over as the engine reports them).
function playFight(gs, how) {
  const s = gs.get()
  let r = null
  for (let i = 0; i < 40; i++) {
    const fi = s.family?.fight
    if (!fi || fi.over) break
    const m = fi.m || gs.fightInfo()?.m
    if (!m) break
    if (m.pending) { r = gs.fightParry(Array(m.pending.hits).fill(how === 'win')); continue }
    if (how === 'win') { m.foe.hp = 1; m.foe.P.parryChance = 0; m.foe.ward = 0 }
    else { s.health = 2; m.foe.moves = ['palm_strike']; m.foe.charging = null; m.foe.hp = Math.max(m.foe.hp, m.foe.max) }
    r = gs.fightMove(how === 'win' ? 'palm_strike' : 'circulate')
  }
  return r
}

module.exports = { playFight }
