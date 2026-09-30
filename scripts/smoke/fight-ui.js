// Smoke helpers — play a fight on the battle page through its real buttons (Phase 42b/c: every fight is on moves).
// Used by scripts/smoke/scenarios/{duels,arena,fights,succession}.js. Not a scenario itself.
//   const F = require('../fight-ui.js')(ctx)
//   await F.move()          click your first ready move (or F.move('circulate')); parrying is off meanwhile, so no QTE waits
//   await F.win(end)        force their HP to 1 and strike until the end step; then click `end` ('raise' / 'spare' / …) if given
//   await F.lose()          your Health to 2, they only Palm Strike, you Circulate, until the fight is over
module.exports = ({ ev, click, sleep }) => {
  const off = () => ev('(() => { const a = gameState.get().arts; globalThis.__pm = a.parryMode; a.parryMode = "off" })()')
  const on = () => ev('(() => { if (globalThis.__pm) gameState.get().arts.parryMode = globalThis.__pm })()')
  const fighting = () => ev('combatView.step === "fight" && !!gameState.get().family.fight?.m')
  const move = async (id = null) => {
    await off()
    await ev('combatView.lockUntil = 0')
    const sel = id ? `#combat-panel [data-move="${id}"]` : '#combat-panel .cb-moves button[data-move]:not([disabled])'
    const has = await ev(`!!document.querySelector('${sel}')`)
    await click(has ? sel : '#combat-panel [data-move="circulate"]'); await sleep(220)
    await on()
  }
  const win = async (end = null) => {
    for (let i = 0; i < 8 && await fighting(); i++) {
      await ev('(() => { const m = gameState.get().family.fight.m; m.foe.hp = 1; m.foe.P.parryChance = 0; m.foe.ward = 0 })()')
      await move()
    }
    await sleep(150)
    if (end && await ev('combatView.step === "end"')) { await click(`#combat-panel .cb-end.${end}`); await sleep(300) }
  }
  const lose = async () => {
    for (let i = 0; i < 8 && await fighting(); i++) {
      await ev('(() => { const s = gameState.get(), m = s.family.fight.m; s.health = 2; m.foe.moves = ["palm_strike"]; m.foe.charging = null })()')
      await move('circulate')
    }
    await sleep(150)
  }
  return { move, win, lose, fighting }
}
