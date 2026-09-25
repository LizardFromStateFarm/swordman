// Central game state — single source of truth.
// All mutation happens through methods; subscribers are notified after each change.

class GameState {
  constructor() {
    this._s       = null
    this._subs    = []
    this._saveT   = 0
    this._slot    = 0
    this.SAVE_INT = 30
  }

  get()         { return this._s    }
  activeSlot()  { return this._slot }

  // ── Slot-aware init ───────────────────────────────────────────────────────

  async initSlot(slotIndex) {
    this._slot = slotIndex
    this._saveT = 0

    let saved = null
    try { saved = await window.electron.loadSlot(slotIndex) } catch {}

    if (saved && saved.version === 2) {
      this._s = saved
      // Auto-resolve any expedition that completed while offline
      if (this._s.expedition?.active && Date.now() >= this._s.expedition.endsAt) {
        this._ensurePhase2Fields()
        this.resolveExpedition()
      }
      const elapsed = Math.min((Date.now() - (saved.lastSave || 0)) / 1000, 8 * 3600)
      if (elapsed > 1) {
        this._recalc()
        const gain = elapsed * (this._s.derived?.qiPerSecond || 0)
        this._s.qi = Math.min(this._s.qi + gain, this._s.derived?.qiCap || 100)
        // Integrity regen while offline: +1 per 30 s
        const intGain = Math.floor(elapsed / 30)
        if (intGain > 0) {
          this._ensurePhase3Fields()
          this._s.realmIntegrity = Math.min(100, (this._s.realmIntegrity ?? 100) + intGain)
        }
        if (gain > 0.5) {
          this._s.events = this._s.events || []
          this._s.events.unshift({
            text: `Returned after ${fmtTime(elapsed)}. Absorbed ${fmtQi(gain)} Qi while away.`,
            type: 'positive',
            ts: Date.now(),
          })
        }
      }
    } else {
      this._s = this._newGame()
    }

    this._recalc()
    this._notify()
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _newGame() {
    return {
      version:       2,
      name:          'Unnamed Cultivator',
      stageIndex:    0,
      qi:            0,
      spiritStones:  10,
      comprehension: 0,
      karma:         50,
      techniques:    ['qi_breathing'],
      root:          this._rollRoot(),
      meditating:    false,
      meditationEnds:0,
      // Phase 2
      expedition:    { active: false, locationId: null, endsAt: null },
      inventory:     {},
      equipped:      { weapon: null, artifact: null },
      activePill:    null,
      // Phase 3
      realmIntegrity:   100,
      _intRegenAcc:     0,
      beasts:           [],
      beastEncounters:  [],
      stats: {
        totalQiGained:      0,
        breakthroughs:      0,
        failed:             0,
        meditationSessions: 0,
        timePlayed:         0,
      },
      events:   [],
      lastSave: Date.now(),
      derived:  {},
    }
  }

  _ensurePhase2Fields() {
    const s = this._s
    if (!s.expedition) s.expedition = { active: false, locationId: null, endsAt: null }
    if (!s.inventory)  s.inventory  = {}
    if (!s.equipped)   s.equipped   = { weapon: null, artifact: null }
    if (s.activePill === undefined) s.activePill = null
  }

  _ensurePhase3Fields() {
    const s = this._s
    if (s.realmIntegrity  === undefined) s.realmIntegrity  = 100
    if (s._intRegenAcc    === undefined) s._intRegenAcc    = 0
    if (!s.beasts)                       s.beasts           = []
    if (!s.beastEncounters)              s.beastEncounters  = []
  }

  _rollRoot() {
    const roll     = Math.random()
    const elements = ['fire','water','earth','wood','metal']
    const rnd      = () => elements[Math.floor(Math.random() * elements.length)]
    if (roll < 0.01) return { type:'heavenly', name:'天灵根 Heavenly Root', mult:3.0 }
    if (roll < 0.05) return { type:'pure',     name:`纯灵根 Pure ${rnd()} Root`, mult:1.8 }
    if (roll < 0.25) return { type:'dual',     name:'双灵根 Dual Root', mult:1.4 }
    return                   { type:'mixed',   name:'杂灵根 Mixed Root', mult:1.0 }
  }

  _rollSpecificRoot(type) {
    const elements = ['fire','water','earth','wood','metal']
    const rnd = () => elements[Math.floor(Math.random() * elements.length)]
    switch (type) {
      case 'heavenly': return { type:'heavenly', name:'天灵根 Heavenly Root', mult:3.0 }
      case 'pure':     return { type:'pure',     name:`纯灵根 Pure ${rnd()} Root`, mult:1.8 }
      case 'dual':     return { type:'dual',     name:'双灵根 Dual Root', mult:1.4 }
      default:         return { type:'mixed',    name:'杂灵根 Mixed Root', mult:1.0 }
    }
  }

  _stage() {
    return CULTIVATION_STAGES[Math.min(this._s.stageIndex, CULTIVATION_STAGES.length - 1)]
  }

  _recalc() {
    const s  = this._s
    this._ensurePhase2Fields()
    this._ensurePhase3Fields()
    const st = this._stage()

    let qps = st.baseQps * s.root.mult
    for (const id of s.techniques) {
      const t = TECHNIQUES.find(t => t.id === id)
      if (t?.effect?.type === 'qps_mult') qps *= t.effect.value
    }

    let btBonus = 0
    for (const id of s.techniques) {
      const t = TECHNIQUES.find(t => t.id === id)
      if (t?.effect?.type === 'breakthrough_bonus') btBonus += t.effect.value
    }

    let capMult = 1
    for (const id of s.techniques) {
      const t = TECHNIQUES.find(t => t.id === id)
      if (t?.effect?.type === 'qi_cap_mult') capMult *= t.effect.value
    }

    // Equipped weapon bonuses
    const weapId = s.equipped.weapon
    if (weapId && ITEMS[weapId]) {
      const we = ITEMS[weapId].effect
      if (we.type === 'qps_mult')   qps     *= we.value
      if (we.type === 'void_blade') btBonus += we.bt_bonus
    }

    // Equipped artifact bonuses
    const artId = s.equipped.artifact
    if (artId && ITEMS[artId]) {
      const ae = ITEMS[artId].effect
      if (ae.type === 'qps_mult')    qps     *= ae.value
      if (ae.type === 'qi_cap_mult') capMult *= ae.value
      if (ae.type === 'bt_bonus')    btBonus += ae.value
    }

    const meditBonus = (s.meditating && Date.now() < s.meditationEnds) ? 3 : 1
    if (s.meditating && Date.now() >= s.meditationEnds) s.meditating = false

    // Beast passive bonuses
    let beastQpsMult   = 1
    let beastPassiveQps = 0
    let beastBtBonus   = 0
    for (const beast of (s.beasts || [])) {
      for (const traitId of (beast.traits || [])) {
        const lvlMult = 1 + (beast.level - 1) * 0.10
        if (traitId === 'soul_bond')         beastQpsMult    *= (1 + 0.05 * beast.level)
        if (traitId === 'qi_devour')         beastPassiveQps += 0.5 * lvlMult
        if (traitId === 'heavenly_instinct') beastBtBonus    += 0.10 * lvlMult
      }
    }
    qps      = qps * beastQpsMult + beastPassiveQps
    btBonus += beastBtBonus

    // Pill preview bonus (for display only — consumed at BT attempt time)
    let pillBtPreview = 0
    if (s.activePill && ITEMS[s.activePill]) {
      const pe = ITEMS[s.activePill].effect
      if (pe.type === 'bt_bonus')    pillBtPreview = pe.value
      if (pe.type === 'bt_guarantee') pillBtPreview = 1
    }

    const baseChance = Math.min(0.98, st.breakthroughChance + btBonus + s.karma / 1000)

    s.derived = {
      qiPerSecond:              qps,
      qiPerSecondBoosted:       qps * meditBonus,
      qiCap:                    st.qiCap * capMult,
      breakthroughChance:       baseChance,
      breakthroughChanceDisplay:Math.min(0.98, baseChance + pillBtPreview),
      stage:                    st,
      canBreakthrough:          s.qi >= st.qiCap * capMult * 0.90,
      meditBonus,
      meditSecondsLeft: s.meditating ? Math.max(0, Math.ceil((s.meditationEnds - Date.now()) / 1000)) : 0,
      lootMult:         weapId && ITEMS[weapId]?.effect?.type === 'void_blade' ? ITEMS[weapId].effect.loot_mult : 1,
      hiddenLocations:  artId === 'artifact_void_compass',
      realmIntegrity:   s.realmIntegrity ?? 100,
    }
  }

  _notify(fromTick = false) { this._subs.forEach(fn => fn(this._s, fromTick)) }

  _save() {
    const s = this._s
    s.lastSave = Date.now()
    window.electron.saveSlot(this._slot, s).catch(() => {})
  }

  _rollDrops(loc, lootMultOverride) {
    const lootMult = lootMultOverride ?? (this._s.derived?.lootMult || 1)
    const table    = loc.dropTable
    const numDrops = Math.min(table.length, 1 + Math.floor(Math.random() * Math.min(loc.enemyTier, 3)))
    const remaining = [...table]
    const drops = {}

    for (let i = 0; i < numDrops && remaining.length > 0; i++) {
      const totalW = remaining.reduce((sum, d) => sum + d.weight, 0)
      let rw = Math.random() * totalW
      let idx = 0
      for (; idx < remaining.length - 1; idx++) {
        rw -= remaining[idx].weight
        if (rw <= 0) break
      }
      const drop = remaining.splice(idx, 1)[0]
      const base = drop.minQty + Math.random() * (drop.maxQty - drop.minQty)
      const qty  = Math.max(1, Math.round(base * lootMult))
      drops[drop.itemId] = (drops[drop.itemId] || 0) + qty
    }
    return drops
  }

  // ── Public API ────────────────────────────────────────────────────────────

  subscribe(fn) {
    this._subs.push(fn)
    return () => { this._subs = this._subs.filter(l => l !== fn) }
  }

  tick(dt) {
    const s = this._s
    if (!s) return

    const gain = s.derived.qiPerSecondBoosted * dt
    s.qi = Math.min(s.qi + gain, s.derived.qiCap)
    s.stats.totalQiGained += gain
    s.stats.timePlayed    += dt

    if (s.techniques.includes('karma_cultivation')) {
      s.karma = Math.min(100, s.karma + 0.5 * dt)
    }

    // Integrity passive regen: +1 per 30 s
    s._intRegenAcc = (s._intRegenAcc || 0) + dt
    if (s._intRegenAcc >= 30) {
      s._intRegenAcc -= 30
      s.realmIntegrity = Math.min(100, (s.realmIntegrity ?? 100) + 1)
    }

    this._saveT += dt
    if (this._saveT >= this.SAVE_INT) {
      this._saveT = 0
      this._save()
    }

    this._recalc()
    this._notify(true)
  }

  attemptBreakthrough() {
    const s = this._s
    if (!s.derived.canBreakthrough) return { success: false, reason: 'insufficient_qi' }
    if (s.stageIndex >= CULTIVATION_STAGES.length - 1) return { success: false, reason: 'ascended' }

    // Consume queued pill (if valid and in inventory)
    let pillEffect = null
    if (s.activePill && (s.inventory[s.activePill] || 0) > 0) {
      pillEffect = ITEMS[s.activePill]?.effect || null
      s.inventory[s.activePill]--
      if (s.inventory[s.activePill] <= 0) delete s.inventory[s.activePill]
    }
    s.activePill = null

    const guaranteed = pillEffect?.type === 'bt_guarantee'

    if (!guaranteed) {
      let btChance = s.derived.breakthroughChance
      if (pillEffect?.type === 'bt_bonus') btChance = Math.min(0.98, btChance + pillEffect.value)

      if (Math.random() > btChance) {
        // Qi loss — default keep 50%, pills reduce the loss
        let qiKeep = 0.5
        if (pillEffect?.type === 'qi_loss_reduce') qiKeep = 0.5 + 0.5 * pillEffect.value
        if (pillEffect?.qi_loss_reduce != null)    qiKeep = 0.5 + 0.5 * pillEffect.qi_loss_reduce
        s.qi    *= qiKeep
        s.karma  = Math.max(0, s.karma - 8)
        s.stats.failed++

        // Integrity damage
        s.realmIntegrity = Math.max(0, (s.realmIntegrity ?? 100) - 20)

        // Heart Calming Pill restores integrity on failure
        if (pillEffect?.integrity_restore) {
          s.realmIntegrity = Math.min(100, s.realmIntegrity + pillEffect.integrity_restore)
        }

        // Demotion if integrity reaches 0
        let demoted = false
        if (s.realmIntegrity <= 0 && s.stageIndex > 0) {
          s.stageIndex     = Math.max(0, s.stageIndex - 1)
          s.realmIntegrity = 60
          s.qi             = 0
          demoted          = true
        }

        this._recalc(); this._notify()
        return { success: false, reason: 'failed', demoted }
      }
    }

    s.stageIndex++
    s.qi    = 0
    s.karma = Math.min(100, s.karma + 10)
    s.stats.breakthroughs++
    this._recalc(); this._notify()
    return { success: true, newStage: this._stage() }
  }

  startMeditation(duration = 30) {
    const s = this._s
    if (s.meditating) return false
    s.meditating     = true
    s.meditationEnds = Date.now() + duration * 1000
    s.stats.meditationSessions++
    this._recalc(); this._notify()
    return true
  }

  learnTechnique(id) {
    const s = this._s
    const t = TECHNIQUES.find(t => t.id === id)
    if (!t)                        return { ok: false, reason: 'unknown' }
    if (s.techniques.includes(id)) return { ok: false, reason: 'owned' }
    if (s.stageIndex < t.minStage) return { ok: false, reason: 'stage' }
    if (s.spiritStones < t.cost)   return { ok: false, reason: 'stones' }
    s.spiritStones -= t.cost
    s.techniques.push(id)
    this._recalc(); this._notify()
    return { ok: true }
  }

  // ── Phase 2: Expedition ───────────────────────────────────────────────────

  startExpedition(locationId) {
    const s = this._s
    if (s.expedition.active) return { ok: false, reason: 'active' }
    const loc = LOCATIONS.find(l => l.id === locationId)
    if (!loc) return { ok: false, reason: 'unknown' }
    if (s.stageIndex < loc.minStage) return { ok: false, reason: 'stage' }
    s.expedition = { active: true, locationId, endsAt: Date.now() + loc.duration * 1000 }
    this._notify()
    return { ok: true, loc }
  }

  resolveExpedition() {
    const s = this._s
    if (!s.expedition.active) return
    const loc = LOCATIONS.find(l => l.id === s.expedition.locationId)
    if (!loc) {
      s.expedition = { active: false, locationId: null, endsAt: null }
      return
    }

    const drops = this._rollDrops(loc)

    const parts = []
    for (const [itemId, qty] of Object.entries(drops)) {
      if (ITEMS[itemId]?.type === 'currency') {
        s.spiritStones += qty
        parts.push(`${qty}× Spirit Stone`)
      } else {
        s.inventory[itemId] = (s.inventory[itemId] || 0) + qty
        parts.push(`${qty}× ${ITEMS[itemId]?.name || itemId}`)
      }
    }

    s.expedition = { active: false, locationId: null, endsAt: null }

    this.addEvent({
      text: `Returned from ${loc.name}: ${parts.join(', ')}.`,
      type: 'positive',
    })

    // Beast encounter roll (at most one per expedition, max 3 queued)
    const eligible = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : [])
      .filter(bt => bt.minStage <= s.stageIndex)
    if (eligible.length > 0 && (s.beastEncounters || []).length < 3) {
      const encChance = 0.08 + (loc.enemyTier - 1) * 0.02
      if (Math.random() < encChance) {
        const totalW = eligible.reduce((sum, bt) => sum + bt.encounterChance, 0)
        let rw = Math.random() * totalW
        let beastType = eligible[eligible.length - 1]
        for (const bt of eligible) { rw -= bt.encounterChance; if (rw <= 0) { beastType = bt; break } }

        const traitKeys = Object.keys(typeof BEAST_TRAITS !== 'undefined' ? BEAST_TRAITS : {})
        const traits = []
        while (traits.length < 3 && traitKeys.length >= 3) {
          const t = traitKeys[Math.floor(Math.random() * traitKeys.length)]
          if (!traits.includes(t)) traits.push(t)
        }
        s.beastEncounters = s.beastEncounters || []
        s.beastEncounters.push({
          id: `${Date.now()}_${Math.floor(Math.random() * 9999)}`,
          typeId: beastType.id,
          traits,
          seenAt: Date.now(),
        })
        this.addEvent({
          text: `A wild ${beastType.name} (${beastType.nameCN}) was spotted during the expedition! Check Explore to tame it.`,
          type: 'special',
        })
      }
    }

    this._recalc(); this._notify()
  }

  // ── Phase 2: Crafting ─────────────────────────────────────────────────────

  craftItem(recipeId) {
    const s = this._s
    const recipe = RECIPES.find(r => r.id === recipeId)
    if (!recipe) return { ok: false, reason: 'unknown' }
    for (const ing of recipe.ingredients) {
      if ((s.inventory[ing.itemId] || 0) < ing.qty) return { ok: false, reason: 'ingredients' }
    }
    for (const ing of recipe.ingredients) {
      s.inventory[ing.itemId] -= ing.qty
      if (s.inventory[ing.itemId] <= 0) delete s.inventory[ing.itemId]
    }
    s.inventory[recipe.productId] = (s.inventory[recipe.productId] || 0) + 1
    const item = ITEMS[recipe.productId]
    this._recalc(); this._notify()
    return { ok: true, item }
  }

  equipItem(itemId) {
    const s = this._s
    const item = ITEMS[itemId]
    if (!item) return { ok: false, reason: 'unknown' }
    if (item.type !== 'weapon' && item.type !== 'artifact') return { ok: false, reason: 'not_equippable' }
    if ((s.inventory[itemId] || 0) < 1) return { ok: false, reason: 'not_owned' }
    const slot = item.type
    if (s.equipped[slot] === itemId) return { ok: true }  // already equipped
    // Return current to inventory
    if (s.equipped[slot]) {
      s.inventory[s.equipped[slot]] = (s.inventory[s.equipped[slot]] || 0) + 1
    }
    // Take new from inventory
    s.inventory[itemId]--
    if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    s.equipped[slot] = itemId
    this._recalc(); this._notify()
    return { ok: true }
  }

  unequipItem(slot) {
    const s = this._s
    const itemId = s.equipped[slot]
    if (!itemId) return { ok: false, reason: 'empty' }
    s.inventory[itemId] = (s.inventory[itemId] || 0) + 1
    s.equipped[slot] = null
    this._recalc(); this._notify()
    return { ok: true }
  }

  setActivePill(itemId) {
    const s = this._s
    if (itemId === null) {
      s.activePill = null
      this._recalc(); this._notify()
      return { ok: true }
    }
    const item = ITEMS[itemId]
    if (!item || item.type !== 'pill') return { ok: false, reason: 'not_pill' }
    if ((s.inventory[itemId] || 0) < 1) return { ok: false, reason: 'not_owned' }
    s.activePill = itemId
    this._recalc(); this._notify()
    return { ok: true }
  }

  useElixir(itemId) {
    const s = this._s
    const item = ITEMS[itemId]
    if (!item || item.type !== 'elixir') return { ok: false, reason: 'not_elixir' }
    if ((s.inventory[itemId] || 0) < 1)  return { ok: false, reason: 'not_owned' }
    s.inventory[itemId]--
    if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    const outcomes  = item.effect.outcomes
    const totalW    = outcomes.reduce((sum, o) => sum + o.weight, 0)
    let rw = Math.random() * totalW
    let chosen = outcomes[outcomes.length - 1]
    for (const o of outcomes) {
      rw -= o.weight
      if (rw <= 0) { chosen = o; break }
    }
    const oldName = s.root.name
    s.root = this._rollSpecificRoot(chosen.type)
    this._recalc(); this._notify()
    return { ok: true, oldRoot: oldName, newRoot: s.root.name }
  }

  // ── Phase 3: Spiritual Beasts ─────────────────────────────────────────────

  tameEncounteredBeast(encounterId) {
    const s = this._s
    const enc = (s.beastEncounters || []).find(e => e.id === encounterId)
    if (!enc) return { ok: false, reason: 'not_found' }

    const beastType = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : []).find(b => b.id === enc.typeId)
    if (!beastType) return { ok: false, reason: 'unknown_type' }
    if (s.stageIndex < beastType.minStage) return { ok: false, reason: 'stage' }
    if ((s.beasts || []).length >= 3) return { ok: false, reason: 'max_beasts' }
    if ((s.inventory['beast_taming_talisman'] || 0) < 1) return { ok: false, reason: 'no_talisman' }

    s.inventory['beast_taming_talisman']--
    if (s.inventory['beast_taming_talisman'] <= 0) delete s.inventory['beast_taming_talisman']

    s.beastEncounters = s.beastEncounters.filter(e => e.id !== encounterId)

    const beast = {
      id:         enc.id,
      typeId:     enc.typeId,
      name:       beastType.name,
      level:      1,
      xp:         0,
      traits:     enc.traits,
      expedition: null,
    }
    s.beasts = s.beasts || []
    s.beasts.push(beast)

    this._recalc(); this._notify()
    return { ok: true, beast }
  }

  sendBeastExpedition(beastId, locationId) {
    const s = this._s
    const beast = (s.beasts || []).find(b => b.id === beastId)
    if (!beast) return { ok: false, reason: 'not_found' }
    if (beast.expedition) return { ok: false, reason: 'active' }

    const loc = LOCATIONS.find(l => l.id === locationId)
    if (!loc) return { ok: false, reason: 'unknown_location' }
    if (s.stageIndex < loc.minStage) return { ok: false, reason: 'stage' }

    const hasSwift = beast.traits.includes('swift')
    const duration = hasSwift ? Math.floor(loc.duration * 0.85) : loc.duration

    beast.expedition = { locationId, endsAt: Date.now() + duration * 1000 }
    this._notify()
    return { ok: true, loc }
  }

  resolveBeastExpedition(beastId) {
    const s = this._s
    const beast = (s.beasts || []).find(b => b.id === beastId)
    if (!beast?.expedition) return

    const loc = LOCATIONS.find(l => l.id === beast.expedition.locationId)
    if (!loc) { beast.expedition = null; this._notify(); return }

    const hasNose   = beast.traits.includes('spirit_nose')
    const lootMult  = hasNose ? 1.25 : 1
    const drops     = this._rollDrops(loc, lootMult)
    const parts     = []

    for (const [itemId, qty] of Object.entries(drops)) {
      if (ITEMS[itemId]?.type === 'currency') {
        s.spiritStones += qty
        parts.push(`${qty}× Spirit Stone`)
      } else {
        s.inventory[itemId] = (s.inventory[itemId] || 0) + qty
        parts.push(`${qty}× ${ITEMS[itemId]?.name || itemId}`)
      }
    }

    const beastType = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : []).find(b => b.id === beast.typeId)
    const xpGain    = beastType?.xpPerExp || 10
    beast.xp       += xpGain

    while (beast.xp >= 100 && beast.level < 10) {
      beast.xp   -= 100
      beast.level++
      this.addEvent({ text: `${beast.name} reached level ${beast.level}!`, type: 'positive' })
    }
    if (beast.level >= 10) beast.xp = Math.min(beast.xp, 99)

    beast.expedition = null

    this.addEvent({
      text: `${beast.name} returned: ${parts.length ? parts.join(', ') : 'nothing found'}.`,
      type: 'positive',
    })
    this._recalc(); this._notify()
  }

  dismissBeast(beastId) {
    const s = this._s
    const before = (s.beasts || []).length
    s.beasts = (s.beasts || []).filter(b => b.id !== beastId)
    if (s.beasts.length === before) return { ok: false, reason: 'not_found' }
    this._recalc(); this._notify()
    return { ok: true }
  }

  addEvent(ev) {
    this._s.events = this._s.events || []
    this._s.events.unshift({ ...ev, ts: Date.now() })
    if (this._s.events.length > 25) this._s.events.pop()
    this._notify()
  }

  setName(name) {
    this._s.name = name.trim().slice(0, 24) || 'Unnamed Cultivator'
    this._notify()
  }

  forceSave() { this._save() }
}

// ── Shared format helpers ─────────────────────────────────────────────────────

function fmtQi(n) {
  if (!isFinite(n) || n >= 1e15) return '∞'
  if (n >= 1e12) return (n/1e12).toFixed(1)+'T'
  if (n >= 1e9)  return (n/1e9 ).toFixed(1)+'B'
  if (n >= 1e6)  return (n/1e6 ).toFixed(1)+'M'
  if (n >= 1e3)  return (n/1e3 ).toFixed(1)+'K'
  return Math.floor(n).toString()
}

function fmtTime(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const gameState = new GameState()
