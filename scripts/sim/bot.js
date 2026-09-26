// Rule-based player bot for the QA sim. Each check-in it does everything a reasonable greedy player
// would: breakthrough, meditate, learn, craft/equip, expeditions, beasts, sect, own sect, war prep.
// Only calls public gameState methods (never mutates state directly). See docs/systems/qa-sim.md.

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
  constructor(sim, rec, { path = 'founder', actEverySec = 10 } = {}) {
    this.sim = sim; this.gs = sim.gs; this.D = sim.data; this.rec = rec
    this.path = path; this.actEverySec = actEverySec
  }

  get s() { return this.gs.get() }
  inv(id) { return this.s.inventory[id] || 0 }

  // One check-in: keep acting until nothing more to do.
  checkIn() {
    this.rec.checkIn(this.s)
    for (let i = 0; i < 40; i++) {
      const before = this.s.spiritStones
      const acted = this.tryBreakthrough() || this.learnTechnique() || this.craftAndEquip() ||
        this.elixirs() || this.beasts() || this.sect() || this.ownSect() || this.war() || this.expedition()
      if (!acted) break
      this.rec.stones(this.rec.lastAction, this.s.spiritStones - before)
    }
    if (!this.s.meditating) { this.gs.startMeditation(30); this.rec.act('meditate', false) }
  }

  do(name, res, meaningful = true) {
    const ok = res === true || res?.ok === true
    if (ok) this.rec.act(name, meaningful)
    return ok
  }

  // ── Breakthrough ─────────────────────────────────────────────────────────
  tryBreakthrough() {
    const s = this.s, d = s.derived
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
    const res = this.gs.attemptBreakthrough()
    this.rec.breakthrough(res, chance, pill, s.stageIndex)
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
        return this.do('craft_equipment', this.gs.craftItem(r.id))
    }
    // Keep a small stock of the best breakthrough pill we can make, plus heart-calming insurance
    for (const p of this.ascended ? [] : [...BT_PILLS, 'pill_heart_calming', 'pill_heaven_defying']) {
      const r = this.recipe(p)
      const cap = p === 'pill_heart_calming' ? 2 : p === 'pill_heaven_defying' ? 1 : 3
      if (r && this.inv(p) < cap && this.canCraft(r)) return this.do('craft_pill', this.gs.craftItem(r.id))
    }
    // Taming talisman when a beast is waiting and there's room
    if (s.beastEncounters.length && !this.inv('beast_taming_talisman') && s.beasts.length < s.derived.maxBeasts) {
      const r = this.recipe('beast_taming_talisman')
      if (this.canCraft(r)) return this.do('craft_talisman', this.gs.craftItem(r.id))
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
      if (this.canCraft(r)) return this.do('craft_elixir', this.gs.craftItem(r.id))
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
