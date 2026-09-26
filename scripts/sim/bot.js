// Rule-based player bot for the QA sim. Each check-in it does everything a reasonable greedy player
// would: breakthrough, meditate, learn, craft/equip, expeditions, beasts, sect, own sect, war prep.
// Only calls public gameState methods (never mutates state directly). See docs/systems/qa-sim.md.
const { mulberry32 } = require('./rng')

const EQUIP_SCORE = {  // how much the bot values each effect type (unknown/no-op effects score 0)
  qps_mult:    v => (v - 1) * 100,
  qi_cap_mult: v => (v - 1) * 60,
  bt_bonus:    v => v * 100,
  void_blade:  (_, e) => (e.bt_bonus || 0) * 100 + ((e.loot_mult || 1) - 1) * 40,
}
const BT_PILLS = ['pill_golden_core', 'pill_foundation', 'pill_qi_refining']   // best first

function itemScore(ITEMS, id) {
  const e = id && ITEMS[id]?.effect
  const f = e && EQUIP_SCORE[e.type]
  return f ? f(e.value, e) : 0
}

class Bot {
  constructor(sim, rec, { path = 'founder', actEverySec = 10, profile = 'active' } = {}) {
    this.sim = sim; this.gs = sim.gs; this.D = sim.data; this.rec = rec
    // The bot's own seeded stream — separate from the game's (sim.ctx Math.random) so bot decisions never
    // shift the game's draw order, and never Node's unseeded Math.random (runs must be reproducible).
    this.rand = mulberry32(((sim.seed ?? 1) ^ 0x9E3779B9) >>> 0)
    this.path = path; this.actEverySec = actEverySec; this.profile = profile
  }

  get s() { return this.gs.get() }
  inv(id) { return this.s.inventory[id] || 0 }

  // One check-in: keep acting until nothing more to do.
  checkIn() {
    this.rec.checkIn(this.s)
    this.warOrders()
    this.automationSetup()
    this.automation()
    for (let i = 0; i < 40; i++) {
      const before = this.s.spiritStones
      const acted = this.family() || this.tryBreakthrough() || this.learnTechnique() || this.craftAndEquip() ||
        this.elixirs() || this.memberWar() || this.beasts() || this.sect() || this.ownSect() || this.war() ||
        this.pushExpedition() || this.expedition()
      if (!acted) break
      this.rec.stones(this.rec.lastAction, this.s.spiritStones - before)
    }
    if (!this.s.meditating) { this.gs.startMeditation(30); this.rec.act('meditate', false) }
  }

  // ── Phase 22: Active/Idle Mode + Automation ─────────────────────────────
  // Set once: 'active' plays in Active Mode (no automation, manual clicks + interaction bonuses below);
  // 'casual'/'afk' stay in Idle Mode and rely on automation, mirroring how Phase 32's warOrders() split
  // manual-vs-standing-order behavior by profile (see qa-sim.md).
  automationSetup() {
    if (this._autoModeSet) return false
    this._autoModeSet = true
    this.gs.setPlayMode(this.profile === 'active' ? 'active' : 'idle')
    return false
  }

  // Turns on each automation the moment it unlocks (idle profiles only) — a real player who set this up
  // once wouldn't revisit it every session, but would reasonably flip a new one on shortly after noticing
  // it in the Automation panel. Enables a modest, not-maxed set of Auto-Craft recipes (mirrors
  // craftAndEquip()'s own pill-stocking preference), never counts as a "meaningful" player action itself.
  automation() {
    if (this.profile === 'active') return false
    const s = this.s, a = s.automation
    let did = false
    for (const key of ['autoExplore', 'autoSectMissions', 'autoCraft', 'autoBreakthrough']) {
      if (!a[key] && this.gs.automationUnlocked(key)) { this.gs.setAutomation(key, true); did = true }
    }
    if (a.autoCraft) {
      for (const productId of [...BT_PILLS, 'pill_heart_calming']) {
        const r = this.recipe(productId)
        if (r && !a.autoCraftRecipes[r.id]) { this.gs.setAutoCraftRecipe(r.id, true); did = true }
      }
    }
    return did
  }

  // Active Mode's Push Harder — opportunistic, only when the window/affordability lines up.
  pushExpedition() {
    if (this.profile !== 'active' || !this.s.expedition.active || this.s.expedition.pushed) return false
    return this.do('push_expedition', this.gs.pushExpedition())
  }

  // ── Phase 32: War Standing Orders ────────────────────────────────────────
  // Set once, as soon as the bot exists (mirrors a real player configuring orders on day one).
  // 'active' still handles wars manually below (memberWar()/war()) — orders here are just its
  // fallback for the (rare) phase its own actEverySec cadence misses. 'casual'/'afk' rely on
  // orders entirely: memberWar()/war() below no-op for them, by design, to prove the standing-order
  // path alone gets them a comparable outcome to 'active' (see report.js's afk/casual-vs-active check).
  warOrders() {
    if (this._orderedWars) return false
    this._orderedWars = true
    // Modest, not maxed — "reasonable, not optimal" (see qa-sim.md gotchas): a real player who sets
    // orders once and forgets them wouldn't blank-check every war chest, or they'd never save enough
    // to found a sect. 50 stones/war is a meaningful chunk of an early chest (MEMBER_WAR_CHEST_BASE
    // 150) without crowding out SECT_FOUNDING's 500-stone cost the way a larger flat order would.
    this.gs.setWarOrder('answer', 'always')
    this.gs.setWarOrder('chestStones', 50)
    this.gs.setWarOrder('lendBeast', 'strongest')
    this.gs.setWarOrder('reinforce', 'if_affordable')
    this.gs.setWarOrder('reinforceKeep', 300)
    this.gs.setWarOrder('ally', 'cheapest')
    return false   // never counts as a meaningful action; doesn't block the rest of checkIn()
  }

  // ── Family (Phase 16-lite, M2 task 2.5) ───────────────────────────────────
  // Pending proposal → accept the strongest suitor (Persons.powerScore: stage×100 + root mult×10, mirrored
  // here since the bot only touches the public API). Never declines — life-loop.md §7.
  // family.md: a pending duel → fight if the odds are ≥ 50%, else flee. A pending marriage event → 'active'
  // picks the affordable choice its spouse likes most (an attentive player); 'casual'/'afk' pick a random
  // affordable one, which exercises the low-affection crisis path. Crises: forgive a cheater, beg a leaver.
  // Lover encounters: seduce 25% of the time, else leave. Never ends an affair. Duels: fight only at ≥ 60% odds.
  family() {
    const f = this.s.family
    if (!f) return false
    // 2.6b Family Planning, set once: 'active' keeps families small ('some'), casual/afk go big ('many').
    if (!this._planned) { this._planned = true; this.gs.setFamilyPlanning(this.profile === 'active' ? 'some' : 'many') }
    // 2.6c heirs: a tournament in progress is fought to the end (strongest paired with weakest — the bot
    // protects its best). 'active' hosts one per life once it has 6+ adult children and reaches Nascent Soul;
    // everyone else (and 'active' until then) simply names the strongest adult child heir.
    if (f.tournament) {
      const info = this.gs.tournamentInfo()
      const pool = info.pool.map(id => f.children.find(c => c.id === id)).sort((a, b) => b.stageIndex - a.stageIndex)
      const pairs = []
      while (pairs.length < info.fights) pairs.push([pool.shift().id, pool.pop().id])
      return this.do('tournament_round', this.gs.fightTournamentRound(pairs))
    }
    const adults = this.gs.eligibleHeirs()
    if (this.profile === 'active' && !f.lastTournament && adults.length >= 6 && this.s.stageIndex >= 16) {
      return this.do('host_tournament', this.gs.startTournament())
    }
    if (!f.heirId && adults.length) {
      const best = [...adults].sort((a, b) => b.stageIndex - a.stageIndex)[0]
      if (this.do('choose_heir', this.gs.chooseHeir(best.id), false)) return false
    }
    // 2.6b child events: 'active' picks what that child likes most (and always fetches a runaway); casual/afk
    // pick at random — which lets bonds fall far enough to exercise the runaway crisis.
    if (f.childEvent) {
      const def = this.gs.childEventDef(f.childEvent), child = f.children.find(c => c.id === f.childEvent.childId)
      const affordable = def.choices.map((c, i) => ({ c, i })).filter(x => this.s.spiritStones >= this.gs.familyCost(x.c))
      if (!affordable.length || !child) return false
      let pick
      if (this.profile === 'active') {
        const val = c => c.outcome === 'fetch' ? 999 : c.bond ? (c.bond[child.personality] ?? c.bond.default ?? 0) : 0
        pick = affordable.sort((a, b) => val(b.c) - val(a.c))[0]
      } else pick = affordable[Math.floor(this.rand() * affordable.length)]
      return this.do(f.childEvent.crisis ? 'child_crisis' : 'child_event', this.gs.resolveChildEvent(pick.i))
    }
    if (f.duel) return this.do('duel', this.gs.resolveDuel(this.gs.duelChance() >= 0.6 ? 'fight' : 'flee'))
    if (f.event) {
      const def = this.gs.marriageEventDef(f.event)
      const affordable = def.choices.map((c, i) => ({ c, i })).filter(x => this.s.spiritStones >= this.gs.familyCost(x.c))
      if (!affordable.length) return false
      let pick
      if (f.event.crisis) pick = affordable.find(x => x.c.outcome === 'forgive' || x.c.outcome === 'beg') || affordable[0]
      else if (this.profile === 'active') {
        const p = f.spouse.personality, val = c => c.aff ? (c.aff[p] ?? c.aff.default ?? 0) : 0
        pick = affordable.sort((a, b) => val(b.c) - val(a.c))[0]
      } else pick = affordable[Math.floor(this.rand() * affordable.length)]
      return this.do(f.event.crisis ? 'family_crisis' : 'family_event', this.gs.resolveMarriageEvent(pick.i))
    }
    // Encounters: seduce 1 in 4 (enough to exercise affairs, discovery and every reaction branch).
    if (f.encounters?.length) {
      return this.rand() < 0.25 ? this.do('seduce', this.gs.seduceEncounter(0)) : this.do('leave_encounter', this.gs.dismissEncounter(0), false)
    }
    const prop = f.proposal
    if (!prop || f.spouse) return false
    const score = p => p.stageIndex * 100 + Math.round((p.root?.mult ?? 0) * 10)
    const best = [...prop.suitors].sort((a, b) => score(b) - score(a))[0]
    return this.do('marry', this.gs.acceptSuitor(best.id))
  }

  do(name, res, meaningful = true) {
    const ok = res === true || res?.ok === true
    if (ok) this.rec.act(name, meaningful)
    return ok
  }

  // ── Breakthrough ─────────────────────────────────────────────────────────
  tryBreakthrough() {
    const s = this.s, d = s.derived
    // The last mortal stage is a chance-based Ascension Trial, not a normal breakthrough (Phase 23C).
    if (s.stageIndex === this.D.CULTIVATION_STAGES.length - 2) return this.tryAscension()
    if (!d.canBreakthrough || s.stageIndex >= this.D.CULTIVATION_STAGES.length - 1) return false
    let chance = d.breakthroughChance, pill = null
    if (this.inv('pill_heaven_defying') && chance < 0.5) pill = 'pill_heaven_defying'
    else if (chance < 0.95) {
      pill = BT_PILLS.find(p => this.inv(p)) || null
      if (pill) chance = Math.min(0.98, chance + (this.D.ITEMS[pill].effect.value || 0))
    }
    const integ = s.realmIntegrity ?? 100
    // A failure at ≤20 integrity demotes — a sensible player calms the heart or waits for regen.
    if (integ <= 20 && pill !== 'pill_heaven_defying' && chance < 0.9) {
      if (this.inv('pill_heart_calming')) pill = 'pill_heart_calming'
      else { this.rec.waitingIntegrity = true; return false }
    }
    this.rec.waitingIntegrity = false
    this.gs.setActivePill(pill)
    // Phase 22 (22C): 'active' always "clicks within the window" — a min-maxer never misses it.
    const res = this.gs.attemptBreakthrough({ focusBonus: this.profile === 'active' })
    this.rec.breakthrough(res, chance, pill, s.stageIndex)
    return true
  }

  // ── Ascension Trial (Phase 23C) ──────────────────────────────────────────
  // No in-life lever raises survival chance much beyond passive Health/Integrity regen, so — like the
  // rest of this bot — it's greedy, not optimal: attempt as soon as ready, accepting the gamble.
  tryAscension() {
    const s = this.s, d = s.derived
    if (!d.canBreakthrough) return false
    const res = this.gs.attemptAscension()
    this.rec.act('ascend', true)
    if (res.success) this.rec.milestone('first_ascend_success')
    return true
  }

  learnTechnique() {
    const s = this.s
    const t = this.D.TECHNIQUES.filter(t => !s.techniques.includes(t.id) && t.minStage <= s.stageIndex && t.cost <= s.spiritStones)
      .sort((a, b) => a.cost - b.cost)[0]
    return t ? this.do('learn_technique', this.gs.learnTechnique(t.id)) : false
  }

  // ── Crafting / equipment / pills ─────────────────────────────────────────
  // Materials earmarked for founding / sect buildings aren't spent on optional crafts.
  reserved(id) {
    const s = this.s
    if (this.path === 'founder' && !s.ownSect.founded) return this.D.SECT_FOUNDING.items[id] || 0
    if (s.ownSect.founded) return this.D.SECT_BUILDINGS.filter(b => !s.ownSect.buildings[b.id]).reduce((a, b) => a + (b.items[id] || 0), 0)
    return 0
  }
  canCraft(r) { return r.ingredients.every(i => this.inv(i.itemId) - this.reserved(i.itemId) >= i.qty) }
  get ascended() { return this.s.stageIndex >= this.D.CULTIVATION_STAGES.length - 1 }
  recipe(productId) { return this.D.RECIPES.find(r => r.productId === productId) }

  craftAndEquip() {
    const { ITEMS, RECIPES } = this.D, s = this.s
    // Equip the best owned item per slot
    for (const slot of ['weapon', 'artifact']) {
      const owned = Object.keys(s.inventory).filter(id => ITEMS[id]?.type === slot)
      const best = owned.sort((a, b) => itemScore(ITEMS, b) - itemScore(ITEMS, a))[0]
      if (best && itemScore(ITEMS, best) > itemScore(ITEMS, s.equipped[slot])) return this.do('equip', this.gs.equipItem(best))
    }
    // Craft an equipment upgrade
    for (const r of RECIPES.filter(r => r.category === 'weapons' || r.category === 'artifacts')) {
      const slot = ITEMS[r.productId].type
      if (itemScore(ITEMS, r.productId) > itemScore(ITEMS, s.equipped[slot]) && !this.inv(r.productId) && this.canCraft(r))
        return this.do('craft_equipment', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    // Keep a small stock of the best breakthrough pill we can make, plus heart-calming insurance
    for (const p of this.ascended ? [] : [...BT_PILLS, 'pill_heart_calming', 'pill_heaven_defying']) {
      const r = this.recipe(p)
      const cap = p === 'pill_heart_calming' ? 2 : p === 'pill_heaven_defying' ? 1 : 3
      if (r && this.inv(p) < cap && this.canCraft(r)) return this.do('craft_pill', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    // Taming talisman when a beast is waiting and there's room
    if (s.beastEncounters.length && !this.inv('beast_taming_talisman') && s.beasts.length < s.derived.maxBeasts) {
      const r = this.recipe('beast_taming_talisman')
      if (this.canCraft(r)) return this.do('craft_talisman', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    return false
  }

  elixirs() {
    const type = this.s.root.type
    const plan = type === 'mixed' ? ['elixir_heavenly_root', 'elixir_pure_root', 'elixir_cleansing_root']
               : type === 'dual'  ? ['elixir_heavenly_root', 'elixir_pure_root'] : []
    for (const e of plan) {
      if (this.inv(e)) return this.do('use_elixir', this.gs.useElixir(e))
      const r = this.recipe(e)
      if (this.canCraft(r)) return this.do('craft_elixir', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    return false
  }

  // ── Expeditions / beasts ─────────────────────────────────────────────────
  wanted() {
    const s = this.s, { ITEMS, RECIPES } = this.D, want = new Map()   // itemId → 'want' | 'urgent'
    const add = (id, level) => { if (want.get(id) !== 'urgent') want.set(id, level) }
    for (const r of RECIPES) {
      const isUpgrade = (r.category === 'weapons' || r.category === 'artifacts') &&
        itemScore(ITEMS, r.productId) > itemScore(ITEMS, s.equipped[ITEMS[r.productId].type])
      const isPill = r.category === 'pills' && !this.ascended && this.inv(r.productId) < 3
      // A beast is waiting to be tamed → its talisman materials trump everything (encounters are rare).
      const urgent = r.productId === 'beast_taming_talisman' && s.beastEncounters.length && s.beasts.length < s.derived.maxBeasts
      if (isUpgrade || isPill || urgent)
        r.ingredients.forEach(i => { if (this.inv(i.itemId) < i.qty) add(i.itemId, urgent ? 'urgent' : 'want') })
    }
    if (this.path === 'founder' && !s.ownSect.founded) Object.keys(this.D.SECT_FOUNDING.items).forEach(i => add(i, 'want'))
    if (s.ownSect.founded) for (const b of this.D.SECT_BUILDINGS) if (!s.ownSect.buildings[b.id]) Object.keys(b.items).forEach(i => add(i, 'want'))
    return want
  }

  dropStage(id) {
    this._dropStage ||= {}
    if (!(id in this._dropStage)) this._dropStage[id] = Math.min(...this.D.LOCATIONS.filter(l => l.dropTable.some(d => d.itemId === id)).map(l => l.minStage))
    return this._dropStage[id]
  }

  bestLocation(cycleSec) {
    const s = this.s, want = this.wanted()
    let best = null, bestScore = -1
    for (const loc of this.D.LOCATIONS.filter(l => l.minStage <= s.stageIndex)) {
      const tw = loc.dropTable.reduce((a, d) => a + d.weight, 0)
      const drops = Math.min(loc.dropTable.length, (1 + Math.min(loc.enemyTier, 3)) / 2 + 0.5)
      let v = 0
      for (const d of loc.dropTable) {
        // Rarity ≈ how late the item first drops; wanted items ×3. Stones are always useful.
        const w = want.get(d.itemId)
        const val = w === 'urgent' ? 100 : d.itemId === 'spirit_stone' ? 2 : (1 + this.dropStage(d.itemId) / 3) * (w ? 3 : 0.3)
        v += (d.weight / tw) * ((d.minQty + d.maxQty) / 2) * val
      }
      const score = v * drops / Math.max(loc.duration, cycleSec)
      if (score > bestScore) { bestScore = score; best = loc }
    }
    return best
  }

  expedition() {
    if (this.s.expedition.active) return false
    const loc = this.bestLocation(this.actEverySec)
    return loc ? this.do('expedition', this.gs.startExpedition(loc.id)) : false
  }

  beasts() {
    const s = this.s
    const enc = s.beastEncounters[0]
    if (enc && this.inv('beast_taming_talisman') && s.beasts.length < s.derived.maxBeasts)
      return this.do('tame_beast', this.gs.tameEncounteredBeast(enc.id))
    const idle = s.beasts.find(b => !b.expedition)
    if (idle) {
      const loc = this.bestLocation(this.actEverySec)
      if (loc) return this.do('beast_expedition', this.gs.sendBeastExpedition(idle.id, loc.id))
    }
    return false
  }

  // ── Joined sect ──────────────────────────────────────────────────────────
  sect() {
    const s = this.s, D = this.D
    if (!s.sect.id) {
      if (s.ownSect.founded || s.stageIndex < 3) return false
      if (this.path === 'founder' && this.canFound()) return false
      const def = D.SECTS.filter(x => x.minStage <= s.stageIndex).sort((a, b) => b.minStage - a.minStage)[0]
      return def ? this.do('join_sect', this.gs.joinSect(def.id)) : false
    }
    if (this.path === 'founder' && this.canFound()) return this.do('leave_sect', this.gs.leaveSect())
    if (D.SECT_RANKS[s.sect.rank + 1] && s.sect.contribution >= D.SECT_RANKS[s.sect.rank + 1].minContribution)
      return this.do('sect_rank_up', this.gs.rankUpSect())
    if (s.sect.activeMissions.length < D.SECT_MAX_MISSIONS) {
      const m = D.SECT_MISSIONS.filter(m => m.minRank <= s.sect.rank && !s.sect.activeMissions.some(a => a.missionId === m.id))
        .sort((a, b) => b.contribution / Math.max(b.duration, this.actEverySec) - a.contribution / Math.max(a.duration, this.actEverySec))[0]
      if (m) return this.do('sect_mission', this.gs.startSectMission(m.id))
    }
    if (this.path === 'member' && s.spiritStones > 400) return this.do('sect_donate', this.gs.donateToSect(s.spiritStones - 300))
    return false
  }

  // ── Member war (Phase 5C): answer the call, lend a beast, fill the war chest when comfortably affordable ──
  // Manual actions here are 'active'-only (Phase 32) — casual/afk rely entirely on warOrders() above,
  // by design, so the sim actually exercises the "never punish absence" path instead of masking it
  // with a bot that still clicks every button on its own.
  memberWar() {
    const s = this.s, w = s.sectWar, D = this.D
    if (w.side !== 'member' || (w.phase !== 'scouting' && w.phase !== 'preparing')) return false
    this.rec.warSeen(w)
    if (this.profile !== 'active') return false
    if (!w.answered && s.sect.activeMissions.length < D.SECT_MAX_MISSIONS) return this.do('war_answer_call', this.gs.answerWarCall())
    if (!w.beastId) {
      const b = s.beasts.filter(b => !b.expedition).sort((a, b) => b.level - a.level)[0]
      if (b) return this.do('war_beast', this.gs.sendBeastToWar(b.id))
    }
    const full = this.gs.memberWarChestFull(), left = full - w.chestStones
    const chunk = Math.min(left, Math.max(10, Math.ceil(full / 4)))
    if (left > 0 && s.spiritStones >= 3 * chunk) return this.do('war_chest', this.gs.donateWarChest(chunk))
    // Pills only once they're no longer needed for breakthroughs
    if (this.ascended && w.pillsGiven < D.MEMBER_WAR_MAX_PILLS) {
      const p = Object.keys(s.inventory).find(id => D.ITEMS[id]?.type === 'pill')
      if (p) return this.do('war_pill', this.gs.offerWarPill(p))
    }
    return false
  }

  // ── Own sect ─────────────────────────────────────────────────────────────
  canFound() {
    const s = this.s, F = this.D.SECT_FOUNDING
    return !s.ownSect.founded && s.stageIndex >= F.minStage && s.spiritStones >= F.stones &&
      Object.entries(F.items).every(([id, q]) => this.inv(id) >= q)
  }

  ownSect() {
    const s = this.s, o = s.ownSect, D = this.D
    if (!o.founded) return this.path === 'founder' && this.canFound() && !s.sect.id ? this.do('found_sect', this.gs.foundOwnSect('Sim Sect')) : false
    const cand = [...o.recruitPool].sort((a, b) => b.talent - a.talent)
      .find(c => D.DISCIPLE_RECRUIT_COST * c.talent * c.talent <= s.spiritStones)
    if (cand && o.disciples.length < s.derived.discipleCap) return this.do('recruit_disciple', this.gs.recruitDisciple(cand.id))
    if (o.disciples.length >= s.derived.discipleCap) {
      const cost = D.SECT_HALL_LEVELS[o.hallLevel - 1]?.upgradeStones
      if (cost != null && s.spiritStones >= cost) return this.do('upgrade_hall', this.gs.upgradeSectHall())
    }
    const b = D.SECT_BUILDINGS.filter(b => !o.buildings[b.id] && b.stones <= s.spiritStones &&
      Object.entries(b.items).every(([id, q]) => this.inv(id) >= q)).sort((a, b) => a.stones - b.stones)[0]
    return b ? this.do('build', this.gs.buildSectBuilding(b.id)) : false
  }

  war() {
    const s = this.s, w = s.sectWar
    if (!s.ownSect.founded || (w.phase !== 'scouting' && w.phase !== 'preparing')) return false
    this.rec.warSeen(w)
    if (this.profile !== 'active') return false
    // Buy war boosts only when comfortably affordable (≥ 3× cost) — mirrors game-state.js cost formulas.
    const fame = s.derived.sectFame || 0, D = this.D
    const allyCost = Math.round(D.WAR_ALLY_COST_BASE + fame * D.WAR_ALLY_COST_PER_FAME)
    const reinforceCost = Math.round(Math.max(20, fame * D.WAR_REINFORCE_COST_PER_FAME))
    if (!w.allyId && s.spiritStones >= 3 * allyCost) {
      const r = this.gs.requestWarAlly(D.SECTS[0].id)
      if (r.ok) return this.do('war_ally', r)
    }
    if (w.phase === 'preparing' && !w.reinforced && s.spiritStones >= 3 * reinforceCost) return this.do('war_reinforce', this.gs.reinforceForWar())
    return false
  }
}

module.exports = { Bot }
