// Real-app smoke scenario — 1.8b-3a Family view + family agency (docs/systems/family.md → "1.8b-3a"): alone →
// seek a match → candidates → court → a meeting card → propose (odds breakdown) → married with children: spouse
// actions, a child's wish (attention item), a child card's raising actions, the affection breakdown; every layout
// mode. Screenshots: scripts/smoke/out/fam-*.png (Visual Review Gate input).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/family.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700)
  }
  const scrollTab = async y => { await ev(`(() => { for (let n = document.getElementById('tab-family'); n; n = n.parentElement) n.scrollTop = ${y} })()`); await sleep(120) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  // Quiet world: no war, no random matchmaker, no events firing mid-shot
  await ev(`(() => { const s = gameState.get(), f = s.family; s.sectWar.nextWarAt = Date.now() + 3600e3
    f.spouse = null; f.affection = null; f.proposal = null; f.nextProposalYear = 1e9; f.children = []; f.lovers = []; f.encounters = []
    s.name = 'Lin Mei'; f.nextEventYear = 1e9; f.nextChildEventYear = 1e9; s.spiritStones = Math.max(s.spiritStones, 5000); gameState._recalc(); gameState._notify() })()`)

  // ── Alone → seek → candidates ──
  await click('[data-tab="family"]'); await sleep(250)
  assert(await ev('!!document.querySelector("#tab-family [data-fa=court-seek]")'), 'alone: Seek a match is offered')
  await shot('fam-overlay-alone')
  await click('#tab-family [data-fa="court-seek"]'); await sleep(250)
  assert(await ev('document.querySelectorAll("#tab-family [data-fa=court-pick]").length') === 3, 'three candidates to choose from')
  assert(await ev('[...document.querySelectorAll("#attention [data-att]")].some(b => b.dataset.att === "court")'), 'attention: the go-between waits')
  await shot('fam-overlay-candidates')
  await click('#tab-family [data-fa="court-pick"]'); await sleep(250)
  await click('#tab-family [data-fa="court-meet"]'); await sleep(250)
  assert(await ev('!!document.querySelector("#tab-family .court-beat")'), 'a meeting card is drawn')
  await shot('fam-overlay-meeting')
  await click('#tab-family .cb-choice'); await sleep(250)
  await ev(`(() => { const c = gameState.get().family.court; c.meetings = 2; c.nextMeetYear = 0; gameState._notify() })()`); await sleep(250)
  assert(await ev('!!document.querySelector("#tab-family [data-fa=court-propose]:not([disabled])")'), 'Propose unlocks after two meetings')
  await shot('fam-overlay-courting')
  await click('#tab-family [data-bd="propose"]'); await sleep(350)
  assert(await ev('document.querySelectorAll(".bd-pop .bd-row").length') >= 3, 'proposal odds breakdown has its parts')
  await shot('fam-overlay-bd-propose'); await click('#breakdown-overlay'); await sleep(150)

  // ── Married, with a household ──
  await ev(`(() => { const gs = gameState, s = gs.get(), f = s.family, t = f.court.target
    gs._wed(t, 58); f.planning = 'ask'; s.world.year += 12   // a dozen married years, so the trend has history
    const ages = [34, 22, 17, 13, 8, 3]
    for (const a of ages) { const c = gs._makeChild(f.spouse); c.bornYear = s.world.year - a; c.bond = [82, 58, 31, 64, 47, 50][ages.indexOf(a)] }
    const kids = f.children; kids[0].stageIndex = 11; kids[1].stageIndex = 6; kids[2].stageIndex = 1; kids[0].morality = 44; kids[2].morality = -52
    f.heirId = kids[0].id
    for (let i = 0; i < 11; i++) f.affTrail.push([f.marriedYear + 1 + i, 49 + i])
    gs.spouseAction('time'); gs._raiseChildWish(f.spouse); s.qi = s.derived.qiCap * 0.6; gs._recalc(); gs._notify() })()`)
  await sleep(300)
  assert(await ev('!!document.querySelector("#tab-family .fam-wish")'), 'the wish card leads the view')
  assert(await ev('[...document.querySelectorAll("#attention [data-att]")].some(b => b.dataset.att === "child-wish")'), 'attention: the wish is an urgent item')
  await scrollTab(0); await shot('fam-overlay-married')
  await click('#tab-family [data-bd="affection"]'); await sleep(350)
  assert(await ev('!!document.querySelector(".bd-pop") && document.querySelector(".bd-pop").textContent.includes("time spent together")'), 'affection breakdown names the last cause')
  await shot('fam-overlay-bd-affection'); await click('#breakdown-overlay'); await sleep(150)
  await ev(`document.querySelectorAll('#tab-family [data-fa="ch-open"]')[1].click()`); await sleep(250)
  assert(await ev('document.querySelectorAll("#tab-family .kid.open .kid-acts [data-fa]").length') === 3, 'an open child card offers time / teach / resources')
  await ev(`document.querySelector('#tab-family .kid.open').scrollIntoView({ block: 'center' })`); await sleep(150)
  await shot('fam-overlay-child')
  const bond0 = await ev(`gameState.get().family.children[1].bond`)
  await click('#tab-family .kid.open [data-fa="ch-time"]'); await sleep(250)
  assert(await ev(`gameState.get().family.children[1].bond`) > bond0, 'spending time raises that child\'s bond')
  await click('#tab-family [data-fa="wish-yes"]'); await sleep(250)
  assert(await ev('gameState.get().family.expecting.length') === 1 && await ev('!document.querySelector("#tab-family .fam-wish")'), 'Yes: expecting, wish card gone')

  // ── Wider modes ──
  await ev(`(() => { const gs = gameState, f = gs.get().family; f.expecting = []; gs._raiseChildWish(f.spouse); gs._notify() })()`)
  await pick('expanded')
  await click('[data-tab="family"]'); await sleep(250); await scrollTab(0); await shot('fam-expanded')
  await pick('desktop')
  await click('[data-tab="family"]'); await sleep(250); await scrollTab(0); await shot('fam-desktop')
  await click('#tab-family [data-bd="affection"]'); await sleep(350); await shot('fam-desktop-bd-affection'); await click('#breakdown-overlay')
  await pick('banner'); await sleep(400); await shot('fam-banner')
  await pick('overlay')
}
