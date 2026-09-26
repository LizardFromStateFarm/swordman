// Turns raw sim runs into a compact markdown report (+ summary object) with auto-generated balance/fun flags.
// Used by: scripts/sim/run.js. Thresholds live in scripts/sim/profiles.js. See docs/systems/qa-sim.md.

const { PROFILES, THRESHOLDS: T, PACING_TARGETS_MIN, PACING_PROFILE } = require('./profiles')

const med = xs => { const a = xs.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null }
const rng = xs => { const a = xs.filter(x => x != null); if (!a.length) return '—'; const lo = Math.min(...a), hi = Math.max(...a), m = med(a); return lo === hi ? f(m) : `${f(m)} (${f(lo)}–${f(hi)})` }
const f = x => x == null ? '—' : Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}k` : Number.isInteger(x) ? String(x) : x.toFixed(1)
const fmtMin = m => m == null ? '—' : m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${m.toFixed(m < 10 ? 1 : 0)}m` : `${(m / 60).toFixed(1)}h`
const fmtH = h => h == null ? '—' : h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`

// Features a well-rounded player should touch; "never used" is a strong design signal.
const FEATURES = ['expedition', 'craft_equipment', 'craft_pill', 'use_elixir', 'tame_beast', 'beast_expedition',
  'join_sect', 'sect_mission', 'sect_rank_up', 'found_sect', 'build', 'recruit_disciple', 'upgrade_hall', 'war_ally', 'war_reinforce',
  'war_answer_call', 'war_chest', 'war_beast']

const KEY_MILESTONES = [
  ['Qi Condensation L1', r => r.stageTimes.find(x => x.stage === 1)?.atH],
  ['Foundation Building', r => stageAt(r, 'Foundation Building')],
  ['Core Formation', r => stageAt(r, 'Core Formation')],
  ['Nascent Soul', r => stageAt(r, 'Nascent Soul')],
  ['Spirit Severing', r => stageAt(r, 'Spirit Severing')],
  ['Ascension', r => stageAt(r, 'Ascension')],
  ['first expedition', r => r.milestones.first_expedition],
  ['first equipment craft', r => r.milestones.first_craft_equipment],
  ['first beast tamed', r => r.milestones.first_tame_beast],
  ['joined a sect', r => r.milestones.first_join_sect],
  ['founded own sect', r => r.milestones.first_found_sect],
  ['first war resolved', r => r.milestones.first_war_resolved],
  ['first call answered', r => r.milestones.first_war_answer_call],
  ['all techniques', r => r.milestones.all_techniques],
  ['all buildings', r => r.milestones.all_buildings],
]
function topSource(g) {
  const sums = {}; let tot = 0
  for (const r of g) for (const [k, v] of Object.entries(r.economy.ledger)) if (v > 0) { sums[k] = (sums[k] || 0) + v; tot += v }
  const [src, v] = Object.entries(sums).sort((a, b) => b[1] - a[1])[0] || []
  return src ? { src, pct: 100 * v / tot } : null
}
function stageAt(r, realm) { return r.stageTimes.find(x => x.name.startsWith(realm))?.atH }

function buildReport(runs, args) {
  const profiles = args.profiles, horizons = args.hours
  const longest = Math.max(...horizons)
  const group = (p, h) => runs.filter(r => r.profile === p && r.hours === h)
  const flags = []
  const L = []

  // ── Health (across all runs) ─────────────────────────────────────────────
  const errs = {}, viol = {}
  for (const r of runs) {
    for (const [m, e] of Object.entries(r.health.errors)) { const x = errs[m] || (errs[m] = { ...e, count: 0, runs: [] }); x.count += e.count; x.runs.push(`${r.profile}/${r.hours}h/s${r.seed}`) }
    for (const [t, v] of Object.entries(r.health.violations)) { const x = viol[t] || (viol[t] = { ...v, count: 0, runs: [] }); x.count += v.count; x.runs.push(`${r.profile}/${r.hours}h/s${r.seed}`) }
  }
  const healthy = !Object.keys(errs).length && !Object.keys(viol).length

  // ── Flags (from longest horizon per profile) ─────────────────────────────
  for (const p of profiles) {
    const g = group(p, longest)
    const tag = `[${p} ${longest}h]`
    const dz = g.map(r => r.deadZone).sort((a, b) => b.hours - a.hours)
    const dzMed = med(dz.map(d => d.hours))
    if (dzMed > T.deadZoneHours[p]) { const d = dz[Math.floor(dz.length / 2)]; flags.push(`${tag} Dead zone ${fmtH(dzMed)} (limit ${T.deadZoneHours[p]}h): nothing new between "${d.from}" → "${d.to}" (starts ~${fmtH(d.atH)})`) }

    // Stage walls: median time per stage transition
    const maxS = Math.max(...g.map(r => r.maxStage))
    let prev = null
    const walls = []
    for (let i = 1; i <= maxS; i++) {
      const took = med(g.map(r => r.stageTimes.find(x => x.stage === i)?.tookH))
      const name = g.flatMap(r => r.stageTimes).find(x => x.stage === i)?.name
      // For session-based profiles, a wait of ≤ one closed period is the schedule, not the game.
      const sessionH = PROFILES[p].closedSec ? (PROFILES[p].closedSec + PROFILES[p].openSec) / 3600 * 1.5 : 0
      if (took != null && prev != null && took >= Math.max(T.stageWallMinHours, sessionH) && took >= prev * T.stageWallRatio) walls.push(`${name} took ${fmtH(took)} (${(took / Math.max(prev, 1e-3)).toFixed(0)}× previous)`)
      prev = took
    }
    if (walls.length) flags.push(`${tag} Difficulty wall: ${walls.slice(0, 3).join('; ')}`)

    const last = med(g.map(r => r.stageTimes.at(-1)?.atH ?? 0))
    const finalStage = med(g.map(r => r.maxStage))
    const top = g[0].stageCount - 1
    if (finalStage < top && last < longest * 0.5) flags.push(`${tag} Progression stalls: last stage-up at ~${fmtH(last)}, nothing for the remaining ${fmtH(longest - last)} (stuck at stage ${finalStage})`)
    if (finalStage >= top && last < longest * 0.5) flags.push(`${tag} Content exhausted: Ascension reached at ~${fmtH(last)}, half the run had nothing left`)

    const cap = med(g.map(r => r.qiCappedPct))
    if (cap > T.qiCappedPct) flags.push(`${tag} Qi sat at cap ${cap}% of play time — generation wasted between check-ins`)
    const streak = Math.max(...g.map(r => r.breakthroughs.maxStreak))
    if (streak >= T.failStreak) { const r = g.find(r => r.breakthroughs.maxStreak === streak); flags.push(`${tag} Frustration: ${streak} failed breakthroughs in a row (at stage ${r.breakthroughs.maxStreakStage})`) }
    const dem = Math.max(...g.map(r => r.breakthroughs.demotions))
    if (dem > 0) flags.push(`${tag} ${dem} realm demotion(s) in a run — check integrity tuning`)
    const iw = med(g.map(r => r.integrityWaitPct))
    if (iw > 5) flags.push(`${tag} Waiting on integrity regen ${iw}% of play time (bot refuses risky breakthroughs ≤20 integrity)`)
    const stones = med(g.map(r => r.economy.stonesEnd))
    const bankH = med(g.map(r => r.economy.stonesEnd / Math.max(1, r.economy.lateIncomePerHour)))
    if (stones > T.hoardStones && bankH > T.hoardBankHours) flags.push(`${tag} Hoarding: ${f(stones)} Spirit Stones unspent at end (~${f(bankH)}h of income) — nothing worth buying`)
    const lossPct = med(g.map(r => 100 * -(r.economy.ledger.war_losses || 0) / Math.max(1, r.economy.spent)))
    if (lossPct > T.involuntarySinkPct) flags.push(`${tag} Economy is a tax: ${f(lossPct)}% of stones leave via war defeats, not player purchases`)
    const topSrc = topSource(g)
    if (topSrc && topSrc.pct > T.singleSourcePct) flags.push(`${tag} One-faucet economy: ${topSrc.src} = ${f(topSrc.pct)}% of all stones earned`)
    const dph = med(g.map(r => r.decisionsPerOpenHour))
    if (dph < T.minDecisionsPerHr[p]) flags.push(`${tag} Low engagement: ${dph} meaningful actions/hour (min ${T.minDecisionsPerHr[p]})`)
    const eng = med(g.map(r => r.wars.engagedPct))
    if (eng != null && eng < 50) flags.push(`${tag} Own-sect wars mostly resolve unseen: player checked in during only ${eng}% of wars (15-min window)`)
    const meng = med(g.map(r => r.memberWars?.engagedPct))
    if (meng != null && meng < 50) flags.push(`${tag} Member wars mostly resolve unseen: player answered during only ${meng}% of calls (2h window)`)
    const mign = med(g.map(r => r.memberWars?.ignored))
    if (mign > 0) flags.push(`${tag} Member wars ignored ${mign}× (seen but no commitment) — bot couldn't answer; check slot/stone availability`)
    const founderOnly = ['found_sect', 'build', 'recruit_disciple', 'upgrade_hall', 'war_ally', 'war_reinforce']
    const unused = FEATURES.filter(ft => !(args.path === 'member' && founderOnly.includes(ft)) && g.every(r => !r.actions[ft]))
    if (T.unusedFeature && unused.length) flags.push(`${tag} Never used: ${unused.join(', ')}`)
  }

  // ── Pacing vs design targets (per realm: median over seeds of each stage's fill time) ──
  const stageRealm = i => runs[0].stageRealms?.[i]
  const pacing = {}   // realm → profile → { med, lo, hi }
  for (const p of profiles) {
    const g = group(p, longest), perStage = {}
    for (const r of g) for (const [i, m] of Object.entries(r.fillMin)) (perStage[i] ||= []).push(m)
    for (const [i, ms] of Object.entries(perStage)) {
      const realm = stageRealm(i); if (!PACING_TARGETS_MIN[realm]) continue
      const x = ((pacing[realm] ||= {})[p] ||= [])
      x.push(med(ms))
    }
  }
  if (profiles.includes(PACING_PROFILE)) {
    const off = []
    for (const [realm, [lo, hi]] of Object.entries(PACING_TARGETS_MIN)) {
      const xs = pacing[realm]?.[PACING_PROFILE]; if (!xs?.length) continue
      const m = med(xs)
      if (m < lo / 2 || m > hi * 2) off.push(`${realm} ${fmtMin(m)} (target ${fmtMin(lo)}–${fmtMin(hi)})`)
    }
    if (off.length) flags.unshift(`[${PACING_PROFILE} ${longest}h] Off design pacing (>2× outside GAMEDESIGN band): ${off.join('; ')}`)
  }

  // ── Markdown ─────────────────────────────────────────────────────────────
  const totalWall = runs.reduce((a, r) => a + r.perf.wallMs, 0)
  L.push(`# QA Sim Report`)
  L.push(`${new Date().toISOString().slice(0, 16)} · path=${args.path} · seeds=${args.seeds} (from ${args.seedBase}) · dt=${args.dt}s · overrides: ${args.set.length ? args.set.join('; ') : 'none'}`)
  L.push(``)
  L.push(`**Verdict:** ${healthy ? '✅ healthy (no errors / invariant violations)' : `❌ ${Object.keys(errs).length} error type(s), ${Object.keys(viol).length} violation type(s)`} · ${flags.length} balance/fun flag(s) · ${runs.length} runs, ${(totalWall / 1000).toFixed(0)}s CPU / ${args.wallSec ?? '?'}s wall`)
  L.push(``)
  L.push(`## Summary (median across seeds, min–max in parentheses)`)
  L.push(`| Horizon | Profile | Final stage | BT success | Worst fail streak | Longest dead zone | Actions/h | Qi capped | Stones end | Wars W/L (seen) |`)
  L.push(`|---|---|---|---|---|---|---|---|---|---|`)
  for (const h of horizons) for (const p of profiles) {
    const g = group(p, h)
    const st = med(g.map(r => r.maxStage))
    const stName = g.find(r => r.maxStage === st)?.finalStageName || ''
    const w = g.map(r => r.wars)
    const wars = med(w.map(x => x.total)) ? `${f(med(w.map(x => x.wins)))}/${f(med(w.map(x => x.losses)))} (${f(med(w.map(x => x.engagedPct)))}%)` : '—'
    L.push(`| ${h}h | ${p} | ${rng(g.map(r => r.maxStage))} ${stName} | ${f(med(g.map(r => r.breakthroughs.successRate * 100)))}% | ${rng(g.map(r => r.breakthroughs.maxStreak))} | ${fmtH(med(g.map(r => r.deadZone.hours)))} | ${rng(g.map(r => r.decisionsPerOpenHour))} | ${f(med(g.map(r => r.qiCappedPct)))}% | ${rng(g.map(r => r.economy.stonesEnd))} | ${wars} |`)
  }
  L.push(``)
  L.push(`## Time to reach (median hours, ${longest}h runs; ✗ = not reached, k/n = reached in k of n seeds)`)
  L.push(`| Milestone | ${profiles.join(' | ')} |`)
  L.push(`|---|${profiles.map(() => '---').join('|')}|`)
  for (const [label, get] of KEY_MILESTONES) {
    const cells = profiles.map(p => {
      const g = group(p, longest), vals = g.map(get).filter(x => x != null)
      if (!vals.length) return '✗'
      return fmtH(med(vals)) + (vals.length < g.length ? ` (${vals.length}/${g.length})` : '')
    })
    L.push(`| ${label} | ${cells.join(' | ')} |`)
  }
  L.push(``)
  L.push(`## Pacing vs GAMEDESIGN.md (idle minutes to fill Qi cap per stage, unboosted; realm median [fastest–slowest stage])`)
  L.push(`| Realm | Target | ${profiles.join(' | ')} |`)
  L.push(`|---|---|${profiles.map(() => '---').join('|')}|`)
  for (const [realm, [lo, hi]] of Object.entries(PACING_TARGETS_MIN)) {
    const cells = profiles.map(p => { const xs = pacing[realm]?.[p]; return xs?.length ? `${fmtMin(med(xs))} [${fmtMin(Math.min(...xs))}–${fmtMin(Math.max(...xs))}]` : '—' })
    L.push(`| ${realm} | ${fmtMin(lo)}–${fmtMin(hi)} | ${cells.join(' | ')} |`)
  }
  L.push(``)
  L.push(`## Economy — Spirit Stones (median, ${longest}h runs)`)
  L.push(`| Profile | Earned | Income/h (last 25%) | Spent by choice | Lost to wars | Bank at end | Top sources | Top purchases |`)
  L.push(`|---|---|---|---|---|---|---|---|`)
  for (const p of profiles) {
    const g = group(p, longest), e = g.map(r => r.economy)
    const share = (pos) => { const sums = {}; let tot = 0
      for (const x of e) for (const [k, v] of Object.entries(x.ledger)) if ((v > 0) === pos && k !== 'war_losses') { sums[k] = (sums[k] || 0) + Math.abs(v); tot += Math.abs(v) }
      return Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(100 * v / Math.max(1, tot))}%`).join(', ') || '—' }
    const chosen = med(e.map(x => x.spent + (x.ledger.war_losses || 0)))
    L.push(`| ${p} | ${f(med(e.map(x => x.earned)))} | ${f(med(e.map(x => x.lateIncomePerHour)))} | ${f(chosen)} | ${f(med(e.map(x => -(x.ledger.war_losses || 0))))} | ${f(med(e.map(x => x.stonesEnd)))} | ${share(true)} | ${share(false)} |`)
  }
  L.push(``)
  L.push(`## Member Wars — joined-sect wars (median, ${longest}h runs)`)
  L.push(`| Profile | Wars | W/L | Answered during | Ignored | Fought without you | Contribution net |`)
  L.push(`|---|---|---|---|---|---|---|`)
  for (const p of profiles) {
    const m = group(p, longest).map(r => r.memberWars).filter(Boolean)
    const tot = med(m.map(x => x.total))
    L.push(tot ? `| ${p} | ${f(tot)} | ${f(med(m.map(x => x.wins)))}/${f(med(m.map(x => x.losses)))} | ${f(med(m.map(x => x.engagedPct)))}% | ${f(med(m.map(x => x.ignored)))} | ${f(med(m.map(x => x.unseen)))} | ${f(med(m.map(x => x.contribNet)))} |` : `| ${p} | 0 | — | — | — | — | — |`)
  }
  L.push(``)
  L.push(`## Slowest stage-ups (median, ${longest}h runs)`)
  for (const p of profiles) {
    const g = group(p, longest), by = {}
    for (const r of g) for (const x of r.stageTimes) (by[x.stage] ||= { name: x.name, t: [] }).t.push(x.tookH)
    const top = Object.values(by).map(x => ({ name: x.name, h: med(x.t) })).sort((a, b) => b.h - a.h).slice(0, 3)
    L.push(`- **${p}**: ${top.map(x => `${x.name} ${fmtH(x.h)}`).join(' · ') || '—'}`)
  }
  L.push(``)
  L.push(`## ⚠ Flags`)
  L.push(flags.length ? flags.map(x => `- ${x}`).join('\n') : '- none')
  L.push(``)
  L.push(`## Health`)
  if (healthy) L.push(`- No exceptions, no invariant violations. Save→load round-trips checked: ${runs.reduce((a, r) => a + r.health.saveRoundtrips, 0)}.`)
  for (const [m, e] of Object.entries(errs)) L.push(`- ❌ ERROR ×${e.count} in ${e.where}: \`${m}\` — ${e.stack} (runs: ${e.runs.slice(0, 3).join(', ')}${e.runs.length > 3 ? '…' : ''})`)
  for (const [t, v] of Object.entries(viol)) L.push(`- ❌ ${t} ×${v.count}, first at ${fmtH(v.firstAt / 3600)}, e.g. \`${v.example}\` (runs: ${v.runs.slice(0, 3).join(', ')}${v.runs.length > 3 ? '…' : ''})`)
  L.push(``)
  L.push(`## Performance`)
  const avgUs = med(runs.map(r => r.perf.avgTickUs)), maxUs = Math.max(...runs.map(r => r.perf.maxTickUs))
  L.push(`- Game tick: ${avgUs}µs avg, ${f(maxUs)}µs worst (budget at 60fps: 16,667µs) · sim speed ~${f(med(runs.map(r => r.perf.simHoursPerWallSec)))} game-hours per real second${args.jobs > 1 ? ` (measured under ${args.jobs}-way parallel load — use \`--jobs=1\` for clean tick timings)` : ''}`)
  L.push(``)
  L.push(`Profiles: ${profiles.map(p => `**${p}** = ${PROFILES[p].desc}`).join('; ')}.`)

  return { md: L.join('\n'), summary: { healthy, flags, errors: errs, violations: viol } }
}

module.exports = { buildReport }
