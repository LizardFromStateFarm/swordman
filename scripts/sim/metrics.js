// Recorder for one sim run: pacing timeline, milestones, fun/engagement signals, invariants, errors.
// Fed by scripts/sim/run.js (per tick) and scripts/sim/bot.js (per action). See docs/systems/qa-sim.md.

const QPS_CHECKPOINTS_H = [1, 5, 10, 25, 50, 100, 200]

const blankWar = () => ({ wins: 0, losses: 0, seen: 0, ignored: 0, unseen: 0, contribNet: 0 })
function warSummary(t) {
  const total = t.wins + t.losses
  return { total, wins: t.wins, losses: t.losses, engagedPct: total ? Math.round(100 * Math.min(1, t.seen / total)) : null }
}

class Recorder {
  constructor(data, endSec = Infinity) {
    this.D = data
    this.endSec = endSec
    this.ledger = {}                 // source/sink → Σ Spirit Stones (+ earned, − spent)
    this.lateEarned = 0              // stones earned in the last 25% of the run (end-game income rate)
    this.lastAction = null
    this.t = 0                       // sim seconds since start
    this.stageReached = { 0: 0 }     // stageIndex → first time reached (s)
    this.maxStage = 0
    this.milestones = {}             // name → first time (s)
    this.actions = {}                // action → count
    this.meaningful = 0              // non-meditate successful actions
    this.checkIns = 0
    this.bt = { attempts: 0, fails: 0, streak: 0, maxStreak: 0, maxStreakStage: null, demotions: 0, pillsUsed: 0 }
    this.openSec = 0; this.cappedSec = 0; this.integrityWaitSec = 0
    this.waitingIntegrity = false
    this.peakStones = 0
    this.fill = {}                   // stageIndex → { q: Σ qps·dt, sec, cap } — for "idle time to fill cap"
    this.qps = {}                    // checkpoint hour → qi/s
    this.warsSeen = new Set()        // side:nextWarAt keys of wars the player checked in during
    this.wars = { own: blankWar(), member: blankWar() }   // per-side war tally (sectWar resets on join/leave/found)
    this._war = null                 // last seen { side, n, ignored, unseen, contrib } baseline
    this.violations = {}             // type → { count, firstAt, example }
    this.errors = {}                 // message → { count, firstAt, where }
    this.saveChecks = 0
    this._lastSlow = -Infinity
    this._lastDeathTs = null         // Phase 23A/B: dedupe s.lastReincarnation across ticks
    this.deathsByCause = {}
  }

  // ── Hooks from the bot ───────────────────────────────────────────────────
  checkIn() { this.checkIns++ }
  act(name, meaningful) {
    this.actions[name] = (this.actions[name] || 0) + 1
    this.lastAction = name
    if (meaningful) this.meaningful++
    this.milestone(`first_${name}`)
  }
  milestone(name) { if (!(name in this.milestones)) this.milestones[name] = this.t }
  warSeen(w) { if (!this.warsSeen.has(`${w.side}:${w.nextWarAt}`)) { this.warsSeen.add(`${w.side}:${w.nextWarAt}`); if (this.wars[w.side]) this.wars[w.side].seen++ } }

  // Per-tick war tally: diff the live sectWar counters against the last baseline for the same side.
  trackWars(w) {
    const cur = { side: w.side, v: w.warVictories, l: w.warDefeats, ignored: w.warsIgnored || 0, unseen: w.warsUnseen || 0, contrib: w.contribNet || 0 }
    const b = this._war
    this._war = cur
    if (!cur.side || !b || b.side !== cur.side || cur.v + cur.l < b.v + b.l) return
    const t = this.wars[cur.side]
    t.wins += cur.v - b.v; t.losses += cur.l - b.l
    t.ignored += cur.ignored - b.ignored; t.unseen += cur.unseen - b.unseen; t.contribNet += cur.contrib - b.contrib
  }
  breakthrough(res, chance, pill, fromStage) {
    const b = this.bt
    this.lastAction = 'breakthrough'
    b.attempts++
    if (pill) b.pillsUsed++
    if (res.success) { b.streak = 0; return }
    b.fails++; b.streak++
    if (b.streak > b.maxStreak) { b.maxStreak = b.streak; b.maxStreakStage = fromStage }
    if (res.demoted) { b.demotions++; this.milestone('first_demotion') }
  }

  stones(source, delta) {
    if (!delta) return
    if (source === 'war') source = delta > 0 ? 'war_spoils' : 'war_losses'
    this.ledger[source] = (this.ledger[source] || 0) + delta
    if (delta > 0 && this.t >= this.endSec * 0.75) this.lateEarned += delta
  }

  // ── Per-tick sampling (cheap) ────────────────────────────────────────────
  sample(s, dt, open) {
    this.t += dt
    this.trackWars(s.sectWar)
    if (s.lastReincarnation && s.lastReincarnation.ts !== this._lastDeathTs) {
      this._lastDeathTs = s.lastReincarnation.ts
      this.deathsByCause[s.lastReincarnation.cause] = (this.deathsByCause[s.lastReincarnation.cause] || 0) + 1
      this.milestone('first_death')
    }
    if (open) {
      this.openSec += dt
      if (s.qi >= s.derived.qiCap * 0.999 && isFinite(s.derived.qiCap)) this.cappedSec += dt
      if (this.waitingIntegrity) this.integrityWaitSec += dt
      const f = this.fill[s.stageIndex] || (this.fill[s.stageIndex] = { q: 0, sec: 0, cap: 0 })
      f.q += s.derived.qiPerSecond * dt; f.sec += dt; f.cap = s.derived.qiCap
    }
    if (s.stageIndex > this.maxStage) {
      for (let i = this.maxStage + 1; i <= s.stageIndex; i++) this.stageReached[i] = this.t
      this.maxStage = s.stageIndex
    }
    if (s.spiritStones > this.peakStones) this.peakStones = s.spiritStones
    for (const h of QPS_CHECKPOINTS_H) if (!(h in this.qps) && this.t >= h * 3600) this.qps[h] = s.derived.qiPerSecond
  }

  // ── Slow poll (every sim minute): state-based milestones + invariants ────
  slow(s) {
    if (s.sect.id) this.milestone(`sect_rank_${s.sect.rank}`)
    if (s.ownSect.founded) {
      const n = Object.values(s.ownSect.buildings).filter(Boolean).length
      if (n === this.D.SECT_BUILDINGS.length) this.milestone('all_buildings')
      if (s.ownSect.hallLevel >= this.D.SECT_HALL_LEVELS.length) this.milestone('max_hall')
    }
    const w = s.sectWar
    if (w.warVictories + w.warDefeats > 0) this.milestone('first_war_resolved')
    if (w.warVictories > 0) this.milestone('first_war_victory')
    if (s.beasts.some(b => b.level >= 10)) this.milestone('beast_level_10')
    if (s.techniques.length === this.D.TECHNIQUES.length) this.milestone('all_techniques')
    for (const l of this.D.LOCATIONS) if (s.stageIndex >= l.minStage) this.milestone(`unlock_${l.id}`)
    this.checkInvariants(s)
  }

  violate(type, example) {
    const v = this.violations[type] || (this.violations[type] = { count: 0, firstAt: this.t, example })
    v.count++
  }

  error(err, where) {
    const msg = String(err?.message || err)
    const e = this.errors[msg] || (this.errors[msg] = { count: 0, firstAt: this.t, where,
      stack: String(err?.stack || '').split('\n').slice(1, 3).map(x => x.trim()).join(' | ') })
    e.count++
  }

  checkInvariants(s) {
    const d = s.derived
    const bad = []
    const walk = (o, p) => {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'events' || k === 'stage') continue
        if (typeof v === 'number' && !isFinite(v) && !(p === 's.derived' && k === 'qiCap')) bad.push(`${p}.${k}=${v}`)
        else if (v && typeof v === 'object') walk(v, `${p}.${k}`)
      }
    }
    walk(s, 's')
    if (bad.length) this.violate('non_finite_number', bad.slice(0, 3).join(', '))
    if (s.qi < 0) this.violate('qi_negative', s.qi)
    if (s.qi > d.qiCap * 1.0001) this.violate('qi_over_cap', `${s.qi} > ${d.qiCap}`)
    if (s.spiritStones < 0) this.violate('stones_negative', s.spiritStones)
    for (const [id, q] of Object.entries(s.inventory))
      if (!(q > 0) || !Number.isInteger(q)) this.violate('inventory_bad_count', `${id}=${q}`)
    const integ = s.realmIntegrity
    if (!(integ >= 0 && integ <= 100)) this.violate('integrity_out_of_range', integ)
    if (!(s.health >= 0 && s.health <= 100)) this.violate('health_out_of_range', s.health)
    if (!(s.bloodlineQuality >= 0 && s.bloodlineQuality <= this.D.BLOODLINE_CAP)) this.violate('bloodline_out_of_range', s.bloodlineQuality)
    if (!(s.generation >= 1)) this.violate('generation_invalid', s.generation)
    for (const def of this.D.SETTINGS_DEFS) {
      const v = s.settings?.[def.id]
      const ok = def.type === 'range' ? (v >= def.min && v <= def.max) : def.options.some(o => o.value === v)
      if (!ok) this.violate('settings_invalid', `${def.id}=${v}`)
    }
    if (!this.D.PERSONALITIES.some(p => p.id === s.personality?.id)) this.violate('personality_invalid', s.personality?.id)
    if (!(s.banter?.recent.length <= this.D.BANTER_RECENT_MAX) || !(s.banter?.log.length <= this.D.BANTER_LOG_MAX))
      this.violate('banter_buffer_over_cap', `${s.banter?.recent.length}/${s.banter?.log.length}`)
    if (!this._banterPoolsChecked) {   // content check, once per run: no personality × trigger holes
      this._banterPoolsChecked = true
      const { BANTER_LINES: L, BANTER_TRIGGERS: T, BANTER_MIN_LINES: M } = this.D
      for (const id of ['generic', ...this.D.PERSONALITIES.map(p => p.id)]) for (const t of T) {
        const min = id === 'generic' ? (t === 'idle' ? M.genericIdle : M.genericOther) : (t === 'idle' ? M.idle : M.other)
        const n = L[id]?.[t]?.length || 0
        if (n < min) this.violate('banter_pool_holes', `${id}.${t}=${n}<${min}`)
      }
    }
    if (!(s.karma >= 0 && s.karma <= 100)) this.violate('karma_out_of_range', s.karma)
    if (d.breakthroughChance > 0.98 || d.breakthroughChanceDisplay > 0.98) this.violate('bt_chance_over_0.98', d.breakthroughChanceDisplay)
    if (s.stageIndex < 0 || s.stageIndex >= this.D.CULTIVATION_STAGES.length) this.violate('stage_out_of_range', s.stageIndex)
    if (s.beasts.length > d.maxBeasts) this.violate('beasts_over_cap', `${s.beasts.length}/${d.maxBeasts}`)
    if (s.ownSect.founded && s.ownSect.disciples.length > d.discipleCap) this.violate('disciples_over_cap', s.ownSect.disciples.length)
    if (!['none', 'scouting', 'preparing'].includes(s.sectWar.phase)) this.violate('war_phase_invalid', s.sectWar.phase)
    if (s.sect.id && (s.sect.rank < 0 || s.sect.rank >= this.D.SECT_RANKS.length)) this.violate('sect_rank_out_of_range', s.sect.rank)
    if (s.sect.id && s.ownSect.founded) this.violate('joined_and_founded', s.sect.id)
    const w = s.sectWar, side = s.ownSect.founded ? 'own' : s.sect.id ? 'member' : null
    if (w.side !== side) this.violate('war_side_mismatch', `${w.side} vs ${side}`)
    if (w.answered && w.phase === 'none') this.violate('war_answered_not_reset', w.lastResult?.ts)
    for (const b of s.beasts) if (b.expedition?.war && (w.side !== 'member' || w.beastId !== b.id || w.phase === 'none')) this.violate('beast_stuck_at_war', b.id)
  }

  // Called by run.js around a close→reopen (real save + initSlot load).
  checkSaveRoundtrip(before, after) {
    this.saveChecks++
    const keys = ['stageIndex', 'name', 'techniques', 'equipped', 'root']
    for (const k of keys) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) this.violate(`save_roundtrip_${k}`, `${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`)
    if (before.beasts.length !== after.beasts.length) this.violate('save_roundtrip_beasts', `${before.beasts.length} → ${after.beasts.length}`)
    if (before.sect.id !== after.sect.id || before.ownSect.founded !== after.ownSect.founded) this.violate('save_roundtrip_sect', '')
    if (after.qi < before.qi - 1e-6 && after.stageIndex === before.stageIndex) this.violate('offline_lost_qi', `${before.qi} → ${after.qi}`)
  }

  // ── Final result (plain JSON) ────────────────────────────────────────────
  finish(s, extra) {
    const H = x => +(x / 3600).toFixed(2)
    // Novelty timeline → dead zones (longest stretch with nothing new happening)
    const novel = [
      ...Object.entries(this.stageReached).map(([i, t]) => ({ t, what: `stage ${i} ${this.stageName(+i)}` })),
      ...Object.entries(this.milestones).map(([what, t]) => ({ t, what })),
    ].sort((a, b) => a.t - b.t)
    novel.push({ t: this.t, what: 'END OF RUN' })
    let dead = { hours: 0, from: '', to: '' }
    for (let i = 1; i < novel.length; i++) {
      const gap = novel[i].t - novel[i - 1].t
      if (gap > dead.hours * 3600) dead = { hours: H(gap), from: novel[i - 1].what, to: novel[i].what, atH: H(novel[i - 1].t) }
    }
    const stageTimes = []   // time spent getting from stage i-1 → i
    for (let i = 1; i <= this.maxStage; i++) stageTimes.push({ stage: i, name: this.stageName(i), atH: H(this.stageReached[i]), tookH: H(this.stageReached[i] - this.stageReached[i - 1]) })
    return {
      simHours: H(this.t),
      stageCount: this.D.CULTIVATION_STAGES.length, stageRealms: this.D.CULTIVATION_STAGES.map(st => st.realm), finalStage: s.stageIndex, finalStageName: this.stageName(s.stageIndex), maxStage: this.maxStage,
      stageTimes,
      milestones: Object.fromEntries(Object.entries(this.milestones).map(([k, t]) => [k, H(t)])),
      deadZone: dead,
      decisionsPerOpenHour: +(this.meaningful / Math.max(1e-9, this.openSec / 3600)).toFixed(1),
      checkIns: this.checkIns,
      actions: this.actions,
      breakthroughs: { ...this.bt, successRate: this.bt.attempts ? +((this.bt.attempts - this.bt.fails) / this.bt.attempts).toFixed(2) : null },
      // Unboosted idle minutes to fill the Qi cap, using the stage's time-averaged Qi/s (GAMEDESIGN pacing metric)
      fillMin: Object.fromEntries(Object.entries(this.fill).filter(([, f]) => isFinite(f.cap) && f.q > 0)
        .map(([i, f]) => [i, +(f.cap / (f.q / f.sec) / 60).toFixed(2)])),
      qiCappedPct: +(100 * this.cappedSec / Math.max(1, this.openSec)).toFixed(1),
      integrityWaitPct: +(100 * this.integrityWaitSec / Math.max(1, this.openSec)).toFixed(1),
      qpsAt: this.qps,
      economy: {
        ledger: Object.fromEntries(Object.entries(this.ledger).map(([k, v]) => [k, Math.round(v)])),
        earned: Math.round(Object.values(this.ledger).filter(v => v > 0).reduce((a, b) => a + b, 0)),
        spent: Math.round(-Object.values(this.ledger).filter(v => v < 0).reduce((a, b) => a + b, 0)),
        lateIncomePerHour: Math.round(this.lateEarned / Math.max(1e-9, (this.t - this.endSec * 0.75) / 3600)),
        stonesEnd: Math.floor(s.spiritStones), stonesPeak: Math.floor(this.peakStones), inventoryEnd: s.inventory,
                 equipped: s.equipped, root: s.root.type, techniques: s.techniques.length, beasts: s.beasts.map(b => `${b.typeId}:L${b.level}`) },
      sect: { joined: s.sect.id, rank: s.sect.rank, founded: s.ownSect.founded, disciples: s.ownSect.disciples.length,
              buildings: Object.keys(s.ownSect.buildings).filter(k => s.ownSect.buildings[k]).length, hallLevel: s.ownSect.hallLevel,
              fame: Math.round(s.derived.sectFame || 0) },
      wars: warSummary(this.wars.own),
      memberWars: { ...warSummary(this.wars.member), ignored: this.wars.member.ignored, unseen: this.wars.member.unseen, contribNet: this.wars.member.contribNet },
      // Cumulative across the whole run (not final s.stats, which is per-life and resets on reincarnation).
      lineage: { generation: s.generation, deaths: s.deaths, bloodlineQuality: Math.round(s.bloodlineQuality || 0),
                 ascensionAttempts: this.actions.ascend || 0, ascensions: this.milestones.first_ascend_success != null ? 1 : 0,
                 deathsByCause: this.deathsByCause },
      health: { violations: this.violations, errors: this.errors, saveRoundtrips: this.saveChecks },
      ...extra,
    }
  }

  stageName(i) { const st = this.D.CULTIVATION_STAGES[i]; return st ? `${st.realm} ${st.layer}`.replace(/ Stage — /, ' ') : `#${i}` }
}

module.exports = { Recorder }
