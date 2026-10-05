// Tuning probe (not a check): plays one bot profile through the real sim loop and logs every LETHAL road card it
// answers (ambush avengers / rel ≤ −60 / psycho, blood challenges, genius hunters, rival blood feuds): the shown odds,
// whether it was an avenger, the player's stage + the foe's, and whether the life ended there. Prints shown-odds buckets
// vs the real death rate (are the odds honest?) and deaths by kind. Final v1 QA pass (living-world.md §9, 4.8, 4.10).
// Run: node scripts/sim/probe-road-lethality.js [profile=active] [hours=100] [seed=1]
const { createSim } = require('./loader.js')
const { Recorder } = require('./metrics.js')
const { Bot } = require('./bot.js')
const { PROFILES } = require('./profiles.js')
;(async () => {
  const profile = process.argv[2] || 'active', hours = +(process.argv[3] || 100), seed = +(process.argv[4] || 1)
  const prof = PROFILES[profile]
  const sim = createSim({ seed }); const rec = new Recorder(sim.data, hours * 3600)
  const bot = new Bot(sim, rec, { path: 'founder', actEverySec: prof.actEverySec, profile })
  await sim.boot(0); const gs = sim.gs
  const log = []; let pending = null, lastDeathTs = null
  const orig = gs.answerRoadCard.bind(gs)
  gs.answerRoadCard = (id, ans) => {
    const s = gs.get(), card = s.road.cards.find(c => c.id === id)
    const info = card && gs.roadCardInfo(id), a = info?.answers.find(x => x.id === ans)
    const lethal = card && (card.lethal || (card.kind === 'challenge' && ans === 'blood') || card.blood)
    const p0 = card && s.world.persons[card.pid], heir0 = !!p0?.feud?.heir, rel0 = p0?.rel ?? 0
    const r = orig(id, ans)
    if (card && lethal && a && /fight|blood|flee|spar|duel/.test(ans)) {
      const p = s.world.persons[card.pid]
      pending = { heir: heir0, rel: rel0, kind: card.kind, ans, odds: a.odds ?? null, avenger: !!card.avenger, stage: s.stageIndex, foe: p?.stageIndex ?? null, died: false, gen: s.generation }
      log.push(pending)
    }
    return r
  }
  const endSec = hours * 3600; let t = 0, act = 0
  while (t < endSec) {
    sim.step(1, () => {}); t += 1
    const s = gs.get()
    if (s.lastReincarnation && s.lastReincarnation.ts !== lastDeathTs) {
      lastDeathTs = s.lastReincarnation.ts
      if (s.lastReincarnation.cause === 'road' && pending && pending.gen === s.generation - 1) pending.died = true
      pending = null
    }
    if (s.interlude) bot.interlude()
    rec.sample(s, 1, true)
    if ((act += 1) >= prof.actEverySec) { act = 0; bot.checkIn() }
  }
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—'
  console.log(`${profile} ${hours}h seed ${seed}: ${log.length} lethal road fights taken, ${log.filter(x => x.died).length} died`)
  const buckets = {}
  for (const x of log) { const b = x.odds == null ? '?' : Math.floor(x.odds / 10) * 10; (buckets[b] ||= { n: 0, d: 0 }).n++; if (x.died) buckets[b].d++ }
  console.log('shown odds → death rate: ' + Object.entries(buckets).sort((a, b) => +a[0] - +b[0]).map(([b, o]) => `${b}–${+b + 9}%: ${o.d}/${o.n} died (${pct(o.d, o.n)}, expect ~${100 - (+b + 5)}%)`).join(' · '))
  const by = {}
  for (const x of log) { const k = `${x.kind}:${x.ans}${x.avenger ? ' (avenger)' : ''}`; (by[k] ||= { n: 0, d: 0, gap: [] }).n++; if (x.died) by[k].d++; by[k].gap.push((x.foe ?? 0) - x.stage) }
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)] }
  for (const [k, o] of Object.entries(by).sort((a, b) => b[1].d - a[1].d)) console.log(`  ${k}: ${o.d}/${o.n} died (${pct(o.d, o.n)}) · foe stage − yours median ${med(o.gap)}`)
  const av = log.filter(x => x.avenger); console.log('avenger cards: ' + av.length + ' · inherited from a past life ' + av.filter(x => x.heir).length + ' (died ' + av.filter(x => x.heir && x.died).length + ') · rel ≤ −80: ' + av.filter(x => x.rel <= -80).length + ' · rel median ' + med(av.map(x => x.rel)))
  console.log('stage at taken (median): ' + med(log.map(x => x.stage)) + ' · lives: ' + gs.get().generation)
})()
