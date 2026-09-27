// Real-app smoke scenario — 1.8b-4 Clan + Hall views (docs/systems/ui-layout.md → "Clan + Hall views"): a named clan
// with an NPC head (parenting style + your bond), you heading a branch (war odds breakdown, secede), a rival and a
// friendly clan, ancestors in the tree, Merit + legacies + the Family Manual picker, the themed scrollbar; every layout
// mode. Screenshots: scripts/smoke/out/clan-*.png (Visual Review Gate input).
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/clan.js
module.exports = async ({ ev, click, wait, shot, assert, sleep }) => {
  const pick = async mode => {
    await click('#btn-layout'); await sleep(150)
    await click(`.layout-opt[data-layout="${mode}"]`); await sleep(700)
  }
  const scrollTo = async (panel, y) => { await ev(`(() => { for (let n = document.getElementById('${panel}'); n; n = n.parentElement) n.scrollTop = ${y} })()`); await sleep(150) }
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('member_elder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')

  // A clan with history: an NPC head, your own branch, other clans, ancestors, Merit and legacies
  await ev(`(() => { const gs = gameState, s = gs.get(), w = s.world, clan = w.clans[w.playerClanId]
    s.name = 'Lin Mei'; s.sectWar.nextWarAt = Date.now() + 3600e3; s.family.nextEventYear = 1e9; s.family.nextChildEventYear = 1e9; s.family.nextProposalYear = 1e9
    w.year += 240; clan.name = 'Lin'; clan.foundedYear = 1
    const npc = (role, stage, extra = {}) => { const p = gs._rollStranger(role); p.family = 'Lin'; p.stageIndex = stage; Object.assign(p, extra); w.persons[p.id] = p; return p }
    const head = npc('head', s.stageIndex + 2, { parentingStyle: 'strict' })
    const main = clan.lines[0]
    main.memberIds = main.memberIds.filter(id => id !== s.self.id)
    main.headId = head.id; main.memberIds.push(head.id)
    for (let i = 0; i < 4; i++) main.memberIds.push(npc('kin', 8 + i).id)
    clan.headId = head.id
    const mine = { id: clan.id + '-b1', name: 'Eastern Branch', headId: s.self.id, memberIds: [s.self.id, npc('kin', 9).id, npc('kin', 7).id] }
    const west = { id: clan.id + '-b2', name: 'Willow Branch', headId: null, memberIds: [] }
    const wh = npc('kin', 12); west.headId = wh.id; west.memberIds.push(wh.id, npc('kin', 6).id)
    clan.lines.push(mine, west); w.playerLineId = mine.id
    s.birth = { headId: head.id, headBond: 38 }
    clan.tradition = { lethalTournaments: 2, peacefulSuccessions: 1, challenges: 3 }
    const zhao = gs._foundClan(w, 'Zhao'), qin = gs._foundClan(w, 'Qin')
    clan.relations[zhao.id] = -72; clan.relations[qin.id] = 34
    const causes = ['passed_mantle', 'expedition', 'ascension_failed', 'passed_mantle']
    for (let i = 0; i < 4; i++) { const a = npc('ancestor', 10 + i * 3, { alive: false, bornYear: 40 + i * 50 - 70 - i * 9, diedYear: 40 + i * 50 }); w.pastLives.push({ personId: a.id, clanId: clan.id, lineId: main.id, cause: causes[i], year: 40 + i * 50, maxStage: a.stageIndex, generation: i + 1, openHours: 5 }) }
    for (const t of ['Year 41: Lin Wei passes the mantle to a daughter of the main line.', 'Year 92: the Willow Branch splits off after a Tournament of Heirs.', 'Year 150: the Zhao clan is founded by a rival rebirth. There is blood between them.', 'Year 201: Lin Mei is born into the Eastern Branch.'])
      clan.history.push({ year: +t.match(/\\d+/)[0], text: t })
    clan.merit = 75; clan.meritEarned = 310; clan.bestStageIndex = s.stageIndex + 1
    clan.legacies = { ancestral_stipend: 1, family_manual: 1 }
    clan.techniquesEver = [...new Set([...(clan.techniquesEver || []), ...s.techniques])]
    clan.firsts = { realm_qi: { gen: 1 }, realm_fb: { gen: 1 }, realm_cf: { gen: 2 }, joined_sect: { gen: 2 }, married: { gen: 1 }, first_child: { gen: 1 } }
    s.generation = 5; s.lifeMerit = [{ id: 'realm_ns', label: 'First to reach Nascent Soul', merit: 35 }]
    gs._recalc(); gs._notify() })()`)
  await sleep(300)

  // ── Overlay ──
  await click('[data-tab="clan"]'); await sleep(250)
  assert(await ev('document.querySelectorAll("#tab-clan .line-row").length') === 3, 'three lines shown (main + two branches)')
  assert(await ev('document.querySelectorAll("#tab-clan .rel-row").length') === 2, 'two clan relations shown')
  assert(await ev('!!document.querySelector("#_declare-branch-war") && !!document.querySelector("#_secede")'), 'branch head: war + secede tiles')
  await scrollTo('tab-clan', 0); await shot('clan-overlay')
  await scrollTo('tab-clan', 260); await shot('clan-overlay-mid')
  await scrollTo('tab-clan', 1e6); await shot('clan-overlay-end')
  await ev(`document.querySelector('#tab-clan .odds-in[data-bd="branch"]').scrollIntoView({ block: 'center' })`); await sleep(150)
  await click('#tab-clan .odds-in[data-bd="branch"]'); await sleep(450)
  assert(await ev('!document.getElementById("breakdown-overlay").classList.contains("hidden")'), 'branch odds popover is open')
  assert(await ev('document.querySelectorAll(".bd-pop .bd-row").length') >= 3, 'branch war odds breakdown')
  await shot('clan-overlay-bd-branch'); await click('#breakdown-overlay'); await sleep(150)

  await click('#tab-clan [data-ca="hall"]'); await sleep(250)
  assert(await ev('document.querySelector("#subtabs .subtab.active, #subtabs [data-tab=hall].active")?.dataset.tab') === 'hall' || await ev('!document.getElementById("tab-hall").classList.contains("hidden")'), 'Clan → Hall tile opens the Hall view')
  assert(await ev('document.querySelectorAll("#tab-hall [data-manual]").length') > 0, "Family Manual picker lists the clan's techniques")
  await scrollTo('tab-hall', 0); await shot('clan-overlay-hall')
  await scrollTo('tab-hall', 300); await shot('clan-overlay-hall-mid')
  await ev(`document.querySelector('#tab-hall .manual')?.scrollIntoView({ block: 'center' })`); await sleep(150)
  await click('#tab-hall [data-manual]:not([disabled])'); await sleep(200)
  assert(await ev('!!gameState._playerClan().manualTechId'), 'picking a Family Manual technique sets it')
  await shot('clan-overlay-hall-manual')
  const m0 = await ev('gameState._playerClan().merit')
  await click('#tab-hall [data-buy]:not([disabled])'); await sleep(200)
  assert(await ev('gameState._playerClan().merit') < m0, 'buying a legacy spends Merit')
  await sleep(2500)   // let the purchase toast clear
  await scrollTo('tab-hall', 1e6); await shot('clan-overlay-hall-end')

  // ── Wider modes ──
  await pick('expanded')
  await click('[data-tab="clan"]'); await sleep(250); await scrollTo('tab-clan', 0); await shot('clan-expanded')
  await click('[data-tab="hall"]'); await sleep(250); await scrollTo('tab-hall', 0); await shot('clan-expanded-hall')
  await pick('desktop')
  await click('[data-tab="clan"]'); await sleep(250); await scrollTo('tab-clan', 0); await shot('clan-desktop')
  await click('[data-tab="hall"]'); await sleep(250); await scrollTo('tab-hall', 0); await shot('clan-desktop-hall')
  await scrollTo('tab-hall', 1e6); await shot('clan-desktop-hall-end')
  await pick('overlay')
}
