// Scenario checks — tutorial.md (task 1.23): the coach-mark lessons + their seen-state. The seen-state rides in the
// cross-save soul record (never in a slot save): it survives a reload and is shared by every slot; a corrupt / old
// soul file loads with a blank tutorial record; markTutorialSeen is once per id; tips off / on; "show every tip again"
// forgets everything and turns tips back on; the first-run init marks every lesson for an established player and
// nothing for a new one, exactly once. Lesson data: unique ids, real groups, one trigger kind each, every view
// trigger names a real NAV_GROUPS view (once), every step has text and at least one selector, sect views carry a lock
// reason. Run: npm run checks (all) · node scripts/sim/checks/tutorial.js (this file). Prints ok/FAIL lines.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 7 }); await sim.boot(0); const gs = sim.gs
  const L = sim.ev('TUTORIAL_LESSONS'), G = sim.ev('TUTORIAL_GROUPS')

  // ── Seen-state ──
  let t = gs.tutorialInfo()
  assert(!t.off && !t.init && Object.keys(t.seen).length === 0, 'fresh install: tips on, not initialised, nothing seen')
  assert(!JSON.stringify(gs.get()).includes('"tut"'), 'tutorial state is not in the slot save')
  assert(gs.markTutorialSeen('hud') === true && gs.markTutorialSeen('hud') === false, 'markTutorialSeen is once per lesson')
  assert(JSON.parse(sim.saves.soul).tut.seen.hud > 0, 'a seen lesson is written to the soul file')
  gs.setTutorialsOff(true)
  await gs.initSlot(1)
  t = gs.tutorialInfo()
  assert(t.off && t.seen.hud > 0, 'seen + tips off survive a reload into another slot')
  gs.setTutorialsOff(false)
  assert(!gs.tutorialInfo().off, 'tips back on')

  // ── First-run init ──
  assert(gs.initTutorials(L.map(l => l.id)) === true, 'init runs once')
  t = gs.tutorialInfo()
  assert(t.init && L.every(l => t.seen[l.id] > 0), 'an established player: every lesson marked seen')
  assert(t.seen.hud === JSON.parse(sim.saves.soul).tut.seen.hud, 'init keeps the time a lesson was already seen')
  assert(gs.initTutorials(['x']) === false && !gs.tutorialInfo().seen.x, 'init never runs twice')
  gs.setTutorialsOff(true)
  gs.resetTutorials()
  t = gs.tutorialInfo()
  assert(!t.off && t.init && Object.keys(t.seen).length === 0, 'show every tip again: nothing seen, tips on, stays initialised')

  const fresh = await createSim({ seed: 8 }); await fresh.boot(0)
  assert(fresh.gs.initTutorials([]) === true && Object.keys(fresh.gs.tutorialInfo().seen).length === 0, 'a new player: init marks nothing')

  // ── Old / corrupt soul files ──
  const old = await createSim({ seed: 9 })
  old.saves.soul = JSON.stringify({ v: 1, points: 40, earned: 40, resonance: 1 })   // a Phase 40 file with no tut
  await old.boot(0)
  t = old.gs.tutorialInfo()
  assert(!t.off && !t.init && Object.keys(t.seen).length === 0 && old.gs.getSoul().points === 40, 'a pre-1.23 soul file gains a blank tutorial record')
  const bad = await createSim({ seed: 10 })
  bad.saves.soul = JSON.stringify({ tut: { seen: { hud: 'x', ok: 5 }, off: 'yes' } })
  await bad.boot(0)
  t = bad.gs.tutorialInfo()
  assert(t.off === true && !('hud' in t.seen) && t.seen.ok === 5, 'a hand-edited tut record is cleaned (bad times dropped)')

  // ── Lesson data ──
  const ids = L.map(l => l.id)
  assert(new Set(ids).size === ids.length, `${ids.length} lessons, unique ids`)
  const groups = new Set(G.map(g => g.id))
  assert(L.every(l => groups.has(l.group)), 'every lesson is in a real group')
  assert(L.every(l => ['start', 'view', 'el'].filter(k => l.trigger[k]).length === 1), 'every lesson has exactly one trigger kind')
  assert(L.filter(l => l.trigger.start).map(l => l.id).join() === 'intro,hud', 'two start lessons, in order: the intro scroll, then the HUD tour')
  const intro = L.find(l => l.intro)
  assert(intro && intro.steps.length === 5 && intro.steps.every(s => s.title && s.text && s.text.length <= 260 && !s.at), 'the intro: 5 titled cards (≤ 260 chars, no spotlight)')
  assert(L.filter(l => !l.intro).every(l => l.steps.length && l.steps.every(s => s.text && s.text.length <= 200 && Array.isArray(s.at) && s.at.length)),
    'every step has text (≤ 200 chars) and a selector')
  assert(L.every(l => !l.trigger.el || l.opens), 'every unlock lesson says when it appears (the Guide line)')

  // NAV_GROUPS lives in the UI (nav.js): read just the constant.
  const navSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'renderer', 'game', 'nav.js'), 'utf8')
  const navCtx = {}
  vm.runInNewContext(navSrc.slice(0, navSrc.indexOf('const NAV_AUTO_NAMES')).replace('const NAV_GROUPS', 'this.NAV_GROUPS'), navCtx)
  const views = navCtx.NAV_GROUPS.flatMap(g => g.views.map(v => v[0]))
  const vl = L.filter(l => l.trigger.view).map(l => l.trigger.view)
  const missing = vl.filter(v => !views.includes(v))
  assert(!missing.length, `every view lesson names a real view${missing.length ? ' — missing: ' + missing : ''}`)
  assert(new Set(vl).size === vl.length, 'one lesson per view')
  const uncovered = views.filter(v => !vl.includes(v))
  assert(!uncovered.length, `every view has a lesson${uncovered.length ? ' — none for: ' + uncovered : ''}`)
  const sectOnly = ['sect-missions', 'sect-library', 'sect-halls', 'sect-base', 'sect-disciples', 'sect-war']
  assert(L.filter(l => sectOnly.includes(l.trigger.view)).every(l => l.needs), 'sect views carry a lock reason')
  assert(L.filter(l => l.inBattle).every(l => l.trigger.el && l.trigger.el.includes('#combat-overlay')), 'in-battle lessons trigger on the battle page only')
})()
