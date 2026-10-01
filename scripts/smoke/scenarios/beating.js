// Real-app smoke scenario — a bad father's hand (family.md → "A father's hand"; assets/data/family-events.js).
// A first life has no father, so the state is forced: a cruel head in the world, s.birth pointing at him, and a
// pending beating. Checks the attention item, the family-overlay card (title + three answers), and that answering
// costs 20 Health and closes the card. Screenshots: scripts/smoke/out/beating-*.png.
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/beating.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  await click('.cs-btn-new[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(500)

  await ev(`(() => {
    const s = gameState.get()
    const head = gameState._genPerson({ family: 'Smoke', bornYear: Math.floor(s.world.year) - 40, stage: 8, role: 'kin' })
    head.alive = true; head.parentingStyle = 'ruthless'; head.personality = 'psycho'; head.trauma = false
    s.world.persons[head.id] = head
    s.birth = { headId: head.id, headStyle: 'ruthless', headBond: 15 }
    s.age = 18
    s.abuse = { nextCheck: 0, hits: 0, defiance: 0, event: { year: Math.floor(s.world.year), headId: head.id }, reckon: false, avenged: false }
    gameState._notify()
  })()`)
  await sleep(500)

  assert(await ev('!!document.querySelector("#attention [data-att=\\"beating\\"]")'), 'the attention strip shows the beating')
  const hp0 = await ev('Math.round(gameState.get().health)')
  await click('#attention [data-att="beating"]')
  await sleep(600)
  assert(await ev('!document.getElementById("family-overlay").classList.contains("hidden")'), 'the beating card opens')
  assert(await ev('/A Father/.test(document.getElementById("family-title").textContent)'), `the card is titled "A Father's Hand"`)
  assert(await ev('document.querySelectorAll("#family-choices [data-beat]").length === 3'), 'three answers are offered')
  await shot('beating-card')

  await click('#family-choices [data-beat="0"]')   // endure: -20 Health
  await sleep(500)
  const hp1 = await ev('Math.round(gameState.get().health)')
  assert(hp0 - hp1 === 20, `enduring costs 20 Health (${hp0} → ${hp1})`)
  assert(await ev('document.getElementById("family-overlay").classList.contains("hidden")'), 'answering closes the card')
  assert(await ev('!gameState.get().abuse.event'), 'the pending beating is cleared')
  await shot('beating-after')
}
