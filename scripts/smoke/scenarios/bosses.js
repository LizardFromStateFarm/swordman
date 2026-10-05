// Real-app smoke scenario — v1 add-on (docs/systems/bosses.md): Legendary bosses + soul techniques. A founder dev save
// moved to life 6 at Nascent Soul, so both bosses wake. In each layout: the attention item, Roam → Hunt → Legendary (gate
// checklists, phases, the technique, Face it), the boss prepare step, the fight in phase II (the phase bar's marks, the
// phase chip, the Two Faces / egg note), the end choice (heart / mercy) and the result; Kin → Family's Seed of the Self card
// (+ the mirror child chip and The Mirror Turns card); Roam → Explore's other-self slot (idle with the place picker, out,
// and lingering). Overlay / Expanded / Desktop / phone. Screenshots: scripts/smoke/out/bosses-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/bosses.js
module.exports = async ({ ev, click, wait, shot, assert, sleep, emulate, clearEmulation }) => {
  const pick = async mode => { await click('#btn-layout'); await sleep(150); await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  const setup = () => `(() => { const s = gameState.get(), w = s.world
    while ((w.pastLives || []).length < 5) w.pastLives.push({ personId: 'smoke' + w.pastLives.length, cause: 'probe', year: 0 })
    s.stageIndex = Math.max(s.stageIndex, 16); s.maxStageThisLife = Math.max(s.maxStageThisLife || 0, s.stageIndex)
    for (const id of BOSS_ORDER) Object.assign(w.bosses[id], { restUntil: 0, wonLife: 0, awakeLife: 0, fresh: false })
    w.bosses.bird.tries = 2
    s.family.fight = null; s.health = 9999; gameState._recalc(); s.health = gameState.maxHealth()
    for (const c of [...(s.road?.cards || [])]) gameState._roadClose(c, null); if (s.road) s.road.waiting = []; s.family.encounters = []
    gameState._tickSoulTech(); gameState._recalc(); gameState._notify() })()`
  const noHScroll = async sel => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return true; if (el.scrollWidth <= el.clientWidth + 1) return true; const R = el.getBoundingClientRect().right; return [...el.querySelectorAll("*")].filter(x => x.getBoundingClientRect().right > R + 1).map(x => x.tagName + "." + x.className).slice(0, 4).join(" | ") })()`); if (r !== true) console.log('  overflow:', r); return r === true }
  const toHunt = async () => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="hunt"]'); await sleep(350) }
  const toExplore = async () => { await click('#tabs [data-group="adventure"]'); await sleep(200); await click('[data-tab="explore"]'); await sleep(350) }
  const toFamily = async () => { await click('#tabs [data-group="kin"]'); await sleep(200); await click('[data-tab="family"]'); await sleep(350) }

  const pass = async tag => {
    await ev(setup()); await sleep(250)
    assert(await ev('[...document.querySelectorAll("#attention *")].some(e => /legendary stirs/i.test(e.textContent))'), `${tag}: attention: something legendary stirs`)
    await toHunt()
    assert(await ev('document.querySelectorAll("#tab-hunt .boss-card").length === 2'), `${tag}: two boss cards in Legendary`)
    assert(await ev('document.querySelectorAll("#tab-hunt .boss-gates li.ok").length >= 4'), `${tag}: the gates read as a checklist (all met)`)
    assert(await ev('document.querySelectorAll("#tab-hunt .boss-phases li").length === 6'), `${tag}: each boss shows its three phases`)
    assert(await ev('/\\+6% might/.test(document.querySelector("#tab-hunt .boss-bird .boss-rec")?.textContent || "")'), `${tag}: past tries show what you learned`)
    assert(await noHScroll('#tab-hunt'), `${tag}: no sideways scroll (Hunt)`)
    await ev('document.querySelector("#tab-hunt .hunt-sec")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`bosses-${tag}-hunt`)

    // the Vermilion Bird's art (the user's picture, baked): its prepare step + a turn into the fight, then step away
    await click('#tab-hunt [data-boss-fight="bird"]'); await sleep(900)
    assert(await ev('!!document.querySelector("[data-boss-start=bird]")'), `${tag}: the Bird's prepare step`)
    await shot(`bosses-${tag}-bird`)
    await click('[data-boss-start="bird"]'); await sleep(900)
    await shot(`bosses-${tag}-bird-fight`)
    await ev('(() => { gameState.get().family.fight = null; combatView.step = "result"; combatView.close(); gameState._notify() })()'); await sleep(300)
    await toHunt()

    // the prepare step → the fight in phase II
    await click('#tab-hunt [data-boss-fight="wraith"]'); await sleep(600)
    assert(await ev('!document.getElementById("combat-overlay").classList.contains("hidden") && !!document.querySelector("[data-boss-start=wraith]")'), `${tag}: the battle page opens on the boss's prepare step`)
    assert(await ev('/Never|never death/i.test(document.getElementById("combat-panel").textContent) && /%/.test(document.querySelector(".cb-st-p")?.textContent || "")'), `${tag}: the estimate and "never death" shown first`)
    await shot(`bosses-${tag}-prepare`)
    await click('[data-boss-start="wraith"]'); await sleep(400)
    await ev(`(() => { const b = gameState.get().family.fight.m; b.foe.hp = Math.round(b.foe.max * 0.5); gameState._mbCheck(b); combatView.render() })()`); await sleep(300)
    assert(await ev('document.querySelectorAll(".boss-mark").length === 2 && /Two Faces/.test(document.querySelector(".cb-st.phase")?.textContent || "")'), `${tag}: the phase bar's marks + the phase chip`)
    assert(await ev('/true one/.test(document.getElementById("combat-panel").textContent)'), `${tag}: the Two Faces note says how often you read true`)
    await shot(`bosses-${tag}-fight`)
    await ev(`(() => { const b = gameState.get().family.fight.m; b.foe.hp = 0; b.boss.phase = 2; gameState._mbCheck(b); const fi = gameState.get().family.fight; fi.over = 'won'; combatView.step = 'end'; combatView.render() })()`); await sleep(300)
    assert(await ev('!!document.querySelector("[data-end=heart]") && !!document.querySelector("[data-end=mercy]")'), `${tag}: the end choice: its heart or mercy`)
    await shot(`bosses-${tag}-end`)
    await click('[data-end="heart"]'); await sleep(400)
    assert(await ev('/heart/.test(document.querySelector(".cb-res-h")?.textContent || "") && gameState.soulTechKnown("clone")'), `${tag}: the result; Body Beyond the Body is learned`)
    await shot(`bosses-${tag}-result`)
    await click('[data-leave]'); await sleep(300)

    // Seed of the Self + a mirror child that turns
    await ev(`(() => { const s = gameState.get(); s.world.soulTech.seed = true; s.soulUse.seedUsed = false; s.health = gameState.maxHealth(); gameState._recalc()
      const r = gameState.useSeedOfSelf(); const k = s.family.children.find(c => c.id === r.childId); if (k) { k.bornYear = Math.floor(s.world.year) - 20; k.bond = 20 }
      s.family.seedCrisis = null; gameState._tickMirrorChildren(); gameState._notify() })()`); await sleep(250)
    await toFamily()
    assert(await ev('!!document.querySelector("#tab-family .fam-card.seed") && /Once a life/.test(document.querySelector("#tab-family .fam-card.seed").textContent)'), `${tag}: the Seed of the Self card (spent this life, with the reason)`)
    assert(await ev('!!document.querySelector("#tab-family [data-fa=mt-send]")'), `${tag}: The Mirror Turns card with its three answers`)
    assert(await ev('[...document.querySelectorAll("#tab-family .kid-root")].some(e => /Mirror/.test(e.textContent))'), `${tag}: the mirror child's chip`)
    assert(await noHScroll('#tab-family'), `${tag}: no sideways scroll (Family)`)
    await ev('document.querySelector("#tab-family .fam-wish.urgent")?.scrollIntoView({ block: "start" })'); await sleep(150)
    await shot(`bosses-${tag}-family`)

    // the clone's slot: idle (the picker), then out, then lingering
    await ev('(() => { const s = gameState.get(); s.clone = { exp: null, outSec: 0, linger: null, gone: false, restUntil: 0, auto: false }; s.qi = 1e30; gameState._recalc(); gameState._notify() })()'); await sleep(200)
    await toExplore()
    assert(await ev('!!document.querySelector("#tab-explore .exp-status.clone .clone-sel")'), `${tag}: your other self's slot with its place picker`)
    assert(await noHScroll('#tab-explore'), `${tag}: no sideways scroll (Explore)`)
    await ev('document.querySelector("#tab-explore .exp-status.clone")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`bosses-${tag}-clone`)
    await click('#tab-explore [data-clone="send"]'); await sleep(300)
    assert(await ev('!!gameState.get().clone.exp && /remaining/.test(document.querySelector("#tab-explore .exp-status.clone")?.textContent || "")'), `${tag}: it sets out (a countdown, Recall, its Qi/s cost)`)
    await ev('document.querySelector("#tab-explore .exp-status.clone")?.scrollIntoView({ block: "center" })'); await sleep(150)
    await shot(`bosses-${tag}-clone-out`)
    await ev('(() => { const s = gameState.get(), c = s.clone; c.linger = { locationId: c.exp.locationId, place: "the Misty Foothills", drops: {} }; c.exp = null; gameState._notify() })()'); await sleep(250)
    assert(await ev('!!document.querySelector("#tab-explore [data-clone=release]") && [...document.querySelectorAll("#attention *")].some(e => /does not come home/i.test(e.textContent))'), `${tag}: It Lingers: the choice + the attention item`)
    await shot(`bosses-${tag}-linger`)
    await ev('(() => { const s = gameState.get(); s.clone.linger = null; s.family.mirrorTurn = null; gameState._notify() })()')
  }
  await pass('overlay')
  await pick('expanded'); await pass('expanded')
  await pick('desktop'); await pass('desktop')
  await emulate(390, 844); await ev('window.dispatchEvent(new Event("resize"))'); await sleep(600)
  await pass('phone')
  await clearEmulation()
}
