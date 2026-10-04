// Real-app perf scenario — Phase 28 task 4.11 (living-world.md §6.2): how long the frame that turns a game year takes in
// the real renderer (engine work + every UI re-render it triggers), on a late founder save with a matured world, with a
// heavy view open (World → Rankings, then World → People). Forces 30 year turns per view (16 ms frames) and prints mean / p95 / max of the worst
// frame of each turn (4.11 spreads the turn over a few frames) plus how many non-tick notifies (full re-renders) each turn fired. Not a pass/fail gate beyond
// "no console errors"; read the numbers. Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/perf-yearturn.js
module.exports = async ({ ev, click, wait, assert, sleep }) => {
  await ev(`(async () => { await window.electron.saveSlot(0, gameState.buildDevSave('founder')) })()`)
  await ev('location.reload()'); await sleep(1500)
  await wait('document.querySelector(\'.cs-btn-play[data-slot="0"]\')', 10000)
  await click('.cs-btn-play[data-slot="0"]')
  await wait('gameState.get() && !document.getElementById("app")?.classList.contains("hidden")')
  await sleep(400)
  await ev('document.getElementById("layout-tip")?.click()')
  await click('#btn-layout'); await sleep(150); await click('.layout-opt[data-layout="desktop"]'); await sleep(700)
  // Mature the world: 300 quiet years (as a generation jump would), then let it run open.
  await ev(`(() => { const s = gameState.get(), w = s.world, y = Math.floor(w.year); gameState._worldYears(y, y + 300); w.year = y + 300.5; w.livesYear = y + 300 })()`)
  const run = async (label) => {
    const r = await ev(`(() => {
      const gs = gameState, s = gs.get(), w = s.world, out = [], ns = []
      const real = gs._notify.bind(gs); let n = 0
      gs._notify = (fromTick) => { if (!fromTick) n++; return real(fromTick) }
      for (let i = 0; i < 30; i++) {
        w.year = Math.floor(w.year) + 0.9999; s.age = Math.floor(s.age) + 0.9999
        n = 0
        let a = performance.now(); gs.tick(0.016); let worst = performance.now() - a, frames = 1
        while (gs._yearJobs?.length && frames < 30) { a = performance.now(); gs.tick(0.016); worst = Math.max(worst, performance.now() - a); frames++ }
        out.push(worst); ns.push(n); (globalThis.__fr ||= []).push(frames)
      }
      gs._notify = real
      out.sort((x, y) => x - y)
      return { mean: out.reduce((x, y) => x + y, 0) / out.length, p95: out[Math.floor(out.length * 0.95)], max: out[out.length - 1],
        notifies: ns.reduce((x, y) => x + y, 0) / ns.length, frames: (globalThis.__fr.splice(0).reduce((x, y) => x + y, 0) / 30), persons: Object.keys(w.persons).length, living: Object.values(w.persons).filter(p => p.alive !== false).length }
    })()`)
    console.log(`  ${label}: worst frame of the year turn: mean ${r.mean.toFixed(1)} ms · p95 ${r.p95.toFixed(1)} · max ${r.max.toFixed(1)} · full re-renders per turn ${r.notifies.toFixed(1)} · over ${r.frames.toFixed(1)} frames · registry ${r.persons} (${r.living} living)`)
    return r
  }
  await click('#tabs [data-group="log"]'); await sleep(200); await click('[data-tab="rankings"]'); await sleep(300)
  const a = await run('World → Rankings open')
  await click('[data-tab="people"]'); await sleep(300)
  const b = await run('World → People open')
  await click('#tabs [data-group="cultivate"]'); await sleep(300)
  const c = await run('Path open')
  assert(a.max > 0 && b.max > 0 && c.max > 0, 'measured')
}
