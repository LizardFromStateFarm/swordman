// Real-app smoke scenario — per-element move effects on the battle page (task 1.13b, docs/systems/arts.md → "42b part 2").
// Opens a real beast battle, then holds exact moments of every effect with BattleScene.freeze and composes them into
// scripts/smoke/out/battle-fx-sheet-<n>.png (flight + impact per element, parried, overcomes / resisted, wards, arts' own
// moments, every status aura, the parry wind-up and press flashes), and screenshots the page mid-effect and mid-parry in
// Overlay / Expanded / Desktop / phone (battle-fx-<mode>.png, battle-fx-parry-<mode>.png). Also checks a real turn feeds
// the scene an `fx` and that live statuses reach the scene as auras.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/battle-fx.js
const fs = require('fs'), path = require('path')
const OUT = path.join(__dirname, '..', 'out')

module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => {
    await ev('combatView.isOpen() && (combatView.step = "result", combatView.close())')
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(800)
  }
  const openFight = async (type = 'spirit_fox') => {
    await ev(`(() => { const gs = gameState, s = gs.get(); s.family.fight = null; s.health = 100; s.stageIndex = 14
      s.beastEncounters = [{ id: 'fx_enc', typeId: '${type}', traits: [], seenAt: Date.now() }]
      gs._recalc(); gs._notify() })()`)
    await sleep(200)
    await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="beasts"]'); await sleep(400)
    await click('#tab-beasts .beast-fight-btn[data-fight=fx_enc]'); await sleep(400)
    await click('#combat-panel .cb-stance.slay'); await sleep(300)
  }

  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await ev('(() => { const s = gameState.get(); s.sectWar.nextWarAt = Date.now() + 3600e3; gameState.setSetting("artStyle", "ink"); s.arts.parryTaught = true })()')

  // ── A real turn: the scene gets an fx, statuses become auras ──
  await pick('desktop'); await openFight()
  assert(await ev('combatView.step === "fight"'), 'the battle opens on moves')
  await ev(`(() => { const m = gameState.get().family.fight.m; m.foe.moves = ["beast_rake"]; m.foe.P.parryChance = 0; gameState.get().arts.parryMode = "off" })()`)
  await ev(`(() => { globalThis.__fxSeen = []; const p = combatView.scene.play.bind(combatView.scene); combatView.scene.play = e => { __fxSeen.push(e); return p(e) } })()`)
  await ev('combatView.lockUntil = 0'); await ev('document.querySelector("#combat-panel .cb-moves [data-move]:not([disabled])").click()'); await sleep(300)
  assert(await ev('__fxSeen.some(e => e.fx && e.fx.side === "you") && __fxSeen.some(e => e.fx && e.fx.side === "foe" && e.fx.claw)'), 'a turn plays both sides with an fx (the beast\'s Rake as claws)')
  await ev('(() => { const m = gameState.get().family.fight.m; m.foe.st = { burn: 2 }; m.you.st = { chill: 1 }; combatView._plateSig = null; combatView.refresh() })()')
  assert(await ev('!!combatView.scene.status.foe.burn && !!combatView.scene.status.you.chill'), 'live statuses reach the scene as auras')
  await ev('(() => { const m = gameState.get().family.fight.m; m.foe.st = {}; m.you.st = {}; combatView._plateSig = null; combatView.refresh() })()')

  // ── The sheet: exact moments, composed in the page ──
  const sheet = await ev(`(() => {
    const sc = combatView.scene, cv = sc.cv
    const EL = ['metal', 'wood', 'water', 'fire', 'earth', 'neutral']
    const hit = (side, el, extra = {}) => ({ type: 'ex', won: side === 'you', [side === 'you' ? 'foeDmg' : 'dmg']: 14, fx: { side, id: 'x', el, type: 'strike', hits: 1, mask: [1], em: 1, ...extra } })
    const frames = []
    for (const el of EL) {
      frames.push([el + ' · flight', 0.32, hit('you', el)])
      frames.push([el + ' · impact', 0.55, hit('you', el)])
      frames.push([el + ' · later', 0.75, hit('you', el)])
      frames.push([el + ' · you parry it', 0.56, { type: 'ex', won: true, nohit: true, fx: { side: 'foe', id: 'x', el, type: 'strike', hits: 1, mask: [0], parried: 1, em: 1 } }])
      frames.push([el + ' · ward', 0.4, { type: 'ex', nohit: true, fx: { side: 'you', id: 'x', el, type: 'ward', hits: 0, em: 1 } }])
    }
    frames.push(['fire overcomes + telling blow', 0.55, hit('you', 'fire', { em: 1.4, crit: true })])
    frames.push(['water resisted', 0.55, hit('you', 'water', { em: 0.75 })])
    frames.push(['metal ×3, one parried', 0.6, { type: 'ex', won: true, foeDmg: 20, fx: { side: 'you', id: 'x', el: 'metal', type: 'multi', hits: 3, mask: [1, 0, 1], parried: 1, em: 1 } }])
    frames.push(['beast Rake (claws) on you', 0.52, { type: 'ex', won: false, dmg: 9, fx: { side: 'foe', id: 'beast_rake', el: 'fire', type: 'strike', hits: 1, mask: [1], em: 1, claw: true } }])
    frames.push(['earth · falling', 0.38, hit('foe', 'earth')])
    frames.push(['drain', 0.8, hit('you', 'wood', { type: 'drain' })])
    frames.push(['heal', 0.5, { type: 'ex', nohit: true, fx: { side: 'you', id: 'x', el: 'water', type: 'heal', hits: 0, heal: 18, em: 1 } }])
    frames.push(['buff', 0.5, { type: 'ex', nohit: true, fx: { side: 'you', id: 'x', el: 'metal', type: 'buff', hits: 0, em: 1 } }])
    frames.push(['circulate', 0.6, { type: 'ex', nohit: true, fx: { side: 'you', id: 'circulate', el: null, type: 'circulate', hits: 0, em: 1 } }])
    frames.push(['gathering a charge', 0.6, { type: 'ex', nohit: true, fx: { side: 'you', id: 'x', el: 'fire', type: 'charge', gather: true, hits: 0, em: 1 } }])
    frames.push(['hex · flight', 0.32, { type: 'ex', nohit: true, fx: { side: 'you', id: 'x', el: 'water', type: 'hex', hits: 0, status: 'chill', em: 1 } }])
    frames.push(['hex takes (Chilled)', 0.6, { type: 'ex', won: true, nohit: true, fx: { side: 'you', id: 'x', el: 'water', type: 'hex', hits: 0, status: 'chill', em: 1 } }])
    const auras = [['burn', { burn: 2 }], ['chill', { chill: 1 }], ['bleed', { bleed: 1 }], ['entangle', { entangle: 1 }], ['daze', { daze: 1 }], ['seal', { seal: 1 }], ['guardbreak', { guardbreak: 1 }], ['charge (earth)', { charge: 'earth' }]]
    // pages of 3 × 4 cells, large enough to judge the dots (battle-fx-sheet-<n>.png)
    const W = 640, H = Math.round(W * cv.height / cv.width), LBL = 26, cols = 3, per = 12, pages = []
    let out = null, g = null, n = 0
    const put = label => {
      if (n % per === 0) {
        out = document.createElement('canvas'); out.width = W * cols; out.height = (H + LBL) * (per / cols); pages.push(out)
        g = out.getContext('2d'); g.fillStyle = '#05030A'; g.fillRect(0, 0, out.width, out.height)
        g.font = '18px Georgia, serif'; g.fillStyle = '#E8D9B0'; g.textAlign = 'left'
      }
      const i = n % per, c = i % cols, r = Math.floor(i / cols)
      g.drawImage(cv, c * W, r * (H + LBL) + LBL, W, H); g.fillText(label, c * W + 8, r * (H + LBL) + 19); n++
    }
    for (const [label, u, e] of frames) { sc.status = { you: {}, foe: {} }; sc.tele = null; sc.pf = null; sc.freeze(u, e); put(label) }
    for (const [label, st] of auras) { sc.status = { you: st, foe: st }; sc.freeze(0); put('aura · ' + label) }
    sc.status = { you: {}, foe: {} }
    sc.tele = { k: 0.7, hot: false, el: 'fire' }; sc.freeze(0); put('parry wind-up (early)')
    sc.tele = { k: 0.02, hot: true, el: 'fire' }; sc.freeze(0); put('parry wind-up (now!)')
    sc.tele = null; sc.pf = { ok: true, t0: 10 - 0.08 }; sc.freeze(0); put('parry press: on the mark')
    sc.pf = { ok: false, t0: 10 - 0.08 }; sc.freeze(0); put('parry press: too soon')
    sc.pf = null
    return pages.map(c => c.toDataURL('image/png'))
  })()`)
  assert(!!sheet, 'the effect sheet rendered')
  for (const [i, url] of (sheet || []).entries()) { const f = path.join(OUT, `battle-fx-sheet-${i + 1}.png`); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('     sheet', f) }

  const ms = await ev('combatView.scene.perf(40)')
  console.log(`     busy effects frame ${ms.toFixed(2)} ms`)
  assert(ms < 12, `busy effects frame under 12 ms (${ms.toFixed(2)})`)

  // ── Every layout mode: mid-effect with auras, and the parry prompt with its ring on the field ──
  for (const mode of ['overlay', 'expanded', 'desktop', 'phone']) {
    if (mode === 'phone') { await pick('desktop'); await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(500) }
    else await pick(mode)
    await openFight('spirit_fox')
    await ev(`(() => { const sc = combatView.scene; sc.status = { you: { burn: 1 }, foe: { entangle: 1, daze: 1 } }
      sc.freeze(0.55, { type: 'ex', won: true, foeDmg: 23, fx: { side: 'you', id: 'x', el: 'water', type: 'strike', hits: 1, mask: [1], em: 1.4 } }) })()`)
    await shot(`battle-fx-${mode}`)
    await ev('combatView.scene.status = { you: {}, foe: {} }; combatView.scene.start()')
    await ev(`(() => { const m = gameState.get().family.fight.m; m.foe.moves = ["beast_rake"]; m.foe.qi = 100; m.foe.P.parryChance = 0; gameState.get().arts.parryMode = "normal" })()`)
    await ev('combatView.lockUntil = 0'); await ev('document.querySelector("#combat-panel [data-move=circulate]").click()'); await sleep(250)
    assert(await ev('!!combatView.qte'), `${mode}: its attack opens the parry prompt`)
    await sleep(200)
    assert(await ev('!!combatView.scene.tele'), `${mode}: the wind-up ring is on the field while the prompt is live`)
    await ev('combatView.scene.tele = { k: 0.35, hot: false, el: "fire" }; combatView.scene.freeze(0)')
    await shot(`battle-fx-parry-${mode}`)
    await ev('combatView.qte.due[combatView.qte.results.length] = performance.now(); document.querySelector("#combat-parry [data-parry]").click()'); await sleep(100)
    assert(await ev('!!combatView.scene.pf?.ok'), `${mode}: a parry on the mark flashes the ward on the field`)
    await sleep(700)
    assert(await ev('!combatView.scene.tele'), `${mode}: the ring leaves the field once the blow is answered`)
    await ev('combatView.step = "result"; combatView.close()')
    if (mode === 'phone') { await clearEmulation(); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(400) }
  }
}
