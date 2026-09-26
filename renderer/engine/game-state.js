// Central game state — single source of truth.
// All mutation happens through methods; subscribers are notified after each change.

class GameState {
  constructor() {
    this._s       = null
    this._subs    = []
    this._eventSubs = []   // Phase 29: onGameEvent listeners (banter). Not state.
    this._warLive = true
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
      // Auto-resolve any expedition that completed while offline. Phase 22: if Auto-Explore relaunches it,
      // chain the new endsAt off the just-missed one (not real "now") so a bounded loop fast-forwards
      // through the whole offline gap, same trick tickSectWar() already uses for its own phase chain.
      if (this._s.expedition?.active && Date.now() >= this._s.expedition.endsAt) {
        this._ensurePhase2Fields()
        this._ensurePhase22Fields()
        let guard = 0
        while (this._s.expedition.active && Date.now() >= this._s.expedition.endsAt && guard++ < 50) {
          const prevEndsAt = this._s.expedition.endsAt
          this.resolveExpedition()
          if (this._s.expedition.active) {
            const loc = LOCATIONS.find(l => l.id === this._s.expedition.locationId)
            this._s.expedition.endsAt = prevEndsAt + (loc?.duration || 0) * 1000 * this._activeTimeMult('expedition')
          }
        }
      }
      const elapsed = Math.min((Date.now() - (saved.lastSave || 0)) / 1000, 8 * 3600)
      if (elapsed > 1) {
        this._recalc()
        const gain = elapsed * (this._s.derived?.qiPerSecond || 0)
        this._s.qi = Math.min(this._s.qi + gain, this._s.derived?.qiCap || 100)
        // Integrity regen while offline: +1 per 30 s
        const intGain = Math.floor((elapsed / 30) * (this._s.derived?.integrityRegenMult || 1))
        if (intGain > 0) {
          this._ensurePhase3Fields()
          this._s.realmIntegrity = Math.min(100, (this._s.realmIntegrity ?? 100) + intGain)
        }
        // Health regen while offline (Phase 23A)
        const healthGain = Math.floor((elapsed / HEALTH_REGEN_SECONDS) * HEALTH_REGEN_AMOUNT)
        if (healthGain > 0) {
          this._ensurePhase23Fields()
          this._s.health = Math.min(100, (this._s.health ?? 100) + healthGain)
        }
        // Side-fix (Phase 22 task, flagged by Phase 32): resolve any pending Phase 4 sect missions BEFORE
        // the war fast-forward, so a Standing Orders chestStones donation during offline catch-up sees an
        // up-to-date Spirit Stone balance — missions used to only resolve on the next LIVE tick (SectSystem
        // only ticks live), which ran after tickSectWar(false) already read a stale balance. See sect-war.md.
        this._ensurePhase4Fields()
        for (const m of [...(this._s.sect.activeMissions || [])]) {
          if (Date.now() >= m.endsAt) this.resolveSectMission(m.uid)
        }
        this.tickOwnSect(elapsed)
        this._ensurePhase5BFields()
        this.tickSectWar(false)   // offline catch-up: wars fully resolved while closed are "unseen" (no ignore penalty)
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
    const awayH = saved?.lastSave ? (Date.now() - saved.lastSave) / 3600000 : 0   // before _save() bumps lastSave
    if (this._personaRolled) { this._personaRolled = false; this._save() }   // persist a migration-rolled personality now
    if (awayH >= BANTER_WELCOME_HOURS) this._emit('welcome_back', { hours: Math.floor(awayH) })
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
      expedition:    { active: false, locationId: null, endsAt: null, pushed: false },
      inventory:     {},
      equipped:      { weapon: null, artifact: null },
      activePill:    null,
      // Phase 3
      realmIntegrity:   100,
      _intRegenAcc:     0,
      beasts:           [],
      beastEncounters:  [],
      // Phase 4
      sect:             { id: null, rank: 0, contribution: 0, activeMissions: [] },
      // Phase 5A
      ownSect:          this._blankOwnSect(),
      // Phase 5B
      sectWar:          this._blankSectWar(),
      // Phase 32
      warOrders:        { ...WAR_ORDERS_DEFAULT },
      // Phase 22
      playMode:         PLAY_MODE_DEFAULT,
      automation:       this._blankAutomation(),
      // Phase 23A/B/C
      health:            100,
      _healthRegenAcc:   0,
      maxStageThisLife:  0,
      bloodlineQuality:  0,
      generation:        1,
      deaths:            0,
      ascended:          false,
      lastReincarnation: null,
      // Phase 20C
      settings:          this.defaultSettings(),
      // Phase 29
      personality:       { id: this._rollPersonality() },
      banter:            this._blankBanter(),
      stats: {
        totalQiGained:      0,
        breakthroughs:      0,
        failed:             0,
        meditationSessions: 0,
        timePlayed:         0,
        ascensionAttempts:  0,
        ascensions:         0,
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

  _ensurePhase4Fields() {
    const s = this._s
    if (!s.sect) s.sect = { id: null, rank: 0, contribution: 0, activeMissions: [] }
    if (!Array.isArray(s.sect.activeMissions)) s.sect.activeMissions = []
    if (s.sect.rank === undefined)         s.sect.rank         = 0
    if (s.sect.contribution === undefined) s.sect.contribution = 0
    if (s.sect.id === undefined)           s.sect.id           = null
  }

  _blankOwnSect() {
    return { founded: false, name: '', foundedAt: 0, hallLevel: 1, buildings: {}, disciples: [],
             recruitPool: [], poolRefreshAt: 0, _incomeAcc: { spirit_stone: 0, spirit_herb: 0 } }
  }

  _ensurePhase5Fields() {
    const s = this._s
    if (!s.ownSect) s.ownSect = this._blankOwnSect()
    const o = s.ownSect
    if (!o.buildings)             o.buildings = {}
    if (!Array.isArray(o.disciples))    o.disciples = []
    if (!Array.isArray(o.recruitPool))  o.recruitPool = []
    if (!o._incomeAcc)            o._incomeAcc = { spirit_stone: 0, spirit_herb: 0 }
    if (!o.hallLevel)             o.hallLevel = 1
    if (o.poolRefreshAt === undefined) o.poolRefreshAt = 0
  }

  _blankSectWar(side = null) {
    return { side, phase: 'none', nextWarAt: 0, scoutEndsAt: 0, prepEndsAt: 0,
             enemyName: '', enemyTier: 0, allyId: null, reinforced: false,
             arrayDamagedUntil: 0, warVictories: 0, warDefeats: 0, lastResult: null,
             // Phase 5C member wars
             answered: false, chestStones: 0, pillsGiven: 0, beastId: null, seen: false,
             buffSuppressedUntil: 0, warsIgnored: 0, warsUnseen: 0, contribNet: 0 }
  }

  // Which war the player takes part in: leading a founded sect, or a member of a joined one (never both).
  _warSide() {
    const s = this._s
    return s.ownSect?.founded ? 'own' : s.sect?.id ? 'member' : null
  }

  _ensurePhase5BFields() {
    const s = this._s
    if (!s.sectWar) s.sectWar = this._blankSectWar()
    const w = s.sectWar
    if (!w.phase)                     w.phase = 'none'
    if (w.nextWarAt === undefined)    w.nextWarAt = 0
    if (w.scoutEndsAt === undefined)  w.scoutEndsAt = 0
    if (w.prepEndsAt === undefined)   w.prepEndsAt = 0
    if (w.arrayDamagedUntil === undefined) w.arrayDamagedUntil = 0
    if (w.warVictories === undefined) w.warVictories = 0
    if (w.warDefeats === undefined)   w.warDefeats = 0
    if (w.allyId === undefined)       w.allyId = null
    if (w.reinforced === undefined)   w.reinforced = false
    // Phase 5C: member-war fields + side sync (old saves only ever had own-sect wars)
    const blank = this._blankSectWar()
    for (const k of Object.keys(blank)) if (w[k] === undefined) w[k] = blank[k]
    const side = this._warSide()
    if (w.side === null && side === 'own') w.side = 'own'   // pre-5C save: keep the founded sect's war record
    if (w.side !== side) {
      if (w.beastId) this._releaseWarBeast(0)
      s.sectWar = this._blankSectWar(side)
    }
  }

  // Phase 32: standing orders. Fills defaults, resets any unknown/invalid value — same pattern as
  // _ensurePhase20CFields() for s.settings.
  _ensurePhase32Fields() {
    const s = this._s
    if (!s.warOrders || typeof s.warOrders !== 'object') s.warOrders = { ...WAR_ORDERS_DEFAULT }
    const o = s.warOrders
    if (!WAR_ORDER_ANSWER_OPTIONS.includes(o.answer))           o.answer        = WAR_ORDERS_DEFAULT.answer
    if (!WAR_ORDER_LEND_BEAST_OPTIONS.includes(o.lendBeast))    o.lendBeast     = WAR_ORDERS_DEFAULT.lendBeast
    if (!WAR_ORDER_REINFORCE_OPTIONS.includes(o.reinforce))     o.reinforce     = WAR_ORDERS_DEFAULT.reinforce
    if (!WAR_ORDER_ALLY_OPTIONS.includes(o.ally))               o.ally          = WAR_ORDERS_DEFAULT.ally
    if (!(typeof o.chestStones === 'number' && isFinite(o.chestStones) && o.chestStones >= 0)) o.chestStones = WAR_ORDERS_DEFAULT.chestStones
    if (!(typeof o.reinforceKeep === 'number' && isFinite(o.reinforceKeep) && o.reinforceKeep >= 0)) o.reinforceKeep = WAR_ORDERS_DEFAULT.reinforceKeep
  }

  _blankAutomation() {
    return {
      autoExplore: false, autoExplorePaused: {}, lastExploreLocationId: null,
      autoSectMissions: false,
      autoCraft: false, autoCraftRecipes: {},
      autoBreakthrough: false, breakthroughThreshold: AUTO_BREAKTHROUGH_THRESHOLD_DEFAULT,
      _craftAcc: 0,
    }
  }

  // Phase 22: Active/Idle mode + automation. Fills defaults, resets invalid values — same pattern as
  // _ensurePhase20CFields()/_ensurePhase32Fields(). playMode is its OWN field (not s.settings) because it
  // changes game balance (timers, bonuses, automation) — settings.md invariant #2 requires s.settings stay
  // presentation-only.
  _ensurePhase22Fields() {
    const s = this._s
    if (s.playMode !== 'idle' && s.playMode !== 'active') s.playMode = PLAY_MODE_DEFAULT
    if (!s.automation || typeof s.automation !== 'object') s.automation = this._blankAutomation()
    const a = s.automation
    if (typeof a.autoExplore !== 'boolean') a.autoExplore = false
    if (!a.autoExplorePaused || typeof a.autoExplorePaused !== 'object') a.autoExplorePaused = {}
    if (a.lastExploreLocationId === undefined) a.lastExploreLocationId = null
    if (typeof a.autoSectMissions !== 'boolean') a.autoSectMissions = false
    if (typeof a.autoCraft !== 'boolean') a.autoCraft = false
    if (!a.autoCraftRecipes || typeof a.autoCraftRecipes !== 'object') a.autoCraftRecipes = {}
    if (typeof a.autoBreakthrough !== 'boolean') a.autoBreakthrough = false
    if (!(typeof a.breakthroughThreshold === 'number' && isFinite(a.breakthroughThreshold) &&
          a.breakthroughThreshold >= AUTO_BREAKTHROUGH_THRESHOLD_MIN && a.breakthroughThreshold <= AUTO_BREAKTHROUGH_THRESHOLD_MAX))
      a.breakthroughThreshold = AUTO_BREAKTHROUGH_THRESHOLD_DEFAULT
    if (!(a._craftAcc >= 0)) a._craftAcc = 0
    if (s.expedition && s.expedition.pushed === undefined) s.expedition.pushed = false
  }

  _ensurePhase23Fields() {
    const s = this._s
    if (s.health === undefined)           s.health           = 100
    if (s._healthRegenAcc === undefined)  s._healthRegenAcc  = 0
    if (s.maxStageThisLife === undefined) s.maxStageThisLife = s.stageIndex
    if (s.bloodlineQuality === undefined) s.bloodlineQuality = 0
    if (s.generation === undefined)       s.generation       = 1
    if (s.deaths === undefined)           s.deaths           = 0
    if (s.ascended === undefined)         s.ascended         = s.stageIndex >= CULTIVATION_STAGES.length - 1
    if (s.lastReincarnation === undefined) s.lastReincarnation = null
    if (s.stats.ascensionAttempts === undefined) s.stats.ascensionAttempts = 0
    if (s.stats.ascensions === undefined)        s.stats.ascensions        = 0
  }

  // Phase 20C: fill missing settings with defaults, reset any unknown/invalid value.
  _ensurePhase20CFields() {
    const s = this._s
    if (!s.settings || typeof s.settings !== 'object') s.settings = {}
    for (const def of SETTINGS_DEFS) {
      if (!this._settingValid(def, s.settings[def.id])) s.settings[def.id] = def.default
    }
    for (const k of Object.keys(s.settings)) {
      if (!SETTINGS_DEFS.some(d => d.id === k)) delete s.settings[k]
    }
  }

  // Phase 29: personality + banter state. Old saves roll a personality on load.
  _ensurePhase29Fields() {
    const s = this._s
    if (!s.personality || !PERSONALITIES.some(p => p.id === s.personality.id)) { s.personality = { id: this._rollPersonality() }; this._personaRolled = true }
    if (!s.banter || typeof s.banter !== 'object') s.banter = this._blankBanter()
    const b = s.banter
    if (!Array.isArray(b.recent)) b.recent = []
    if (!Array.isArray(b.log))    b.log    = []
    if (b.last === undefined)     b.last   = null
    if (!(b.failStreak >= 0))     b.failStreak = 0
    if (b.todSaid === undefined)  b.todSaid = null
    if (!(b.lastAt >= 0))         b.lastAt = 0
  }

  _blankBanter() { return { lastAt: 0, recent: [], log: [], last: null, failStreak: 0, todSaid: null } }

  _rollPersonality() { return PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].id }

  _emit(type, ctx = {}) {
    for (const fn of this._eventSubs) { try { fn(type, ctx) } catch {} }
  }

  _settingValid(def, v) {
    if (def.type === 'range') return typeof v === 'number' && isFinite(v) && v >= def.min && v <= def.max
    return def.options.some(o => o.value === v)
  }

  _sectDef() {
    const id = this._s?.sect?.id
    return id && typeof SECTS !== 'undefined' ? (SECTS.find(x => x.id === id) || null) : null
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
    this._ensurePhase4Fields()
    this._ensurePhase5Fields()
    this._ensurePhase5BFields()
    this._ensurePhase32Fields()
    this._ensurePhase22Fields()
    this._ensurePhase23Fields()
    this._ensurePhase20CFields()
    this._ensurePhase29Fields()
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

    // Sect bonuses (Phase 4) — suppressed for a while after the sect loses a member war (Phase 5C)
    const sectBuffSuppressed = s.sectWar.side === 'member' && Date.now() < (s.sectWar.buffSuppressedUntil || 0)
    const sectFx = sectBuffSuppressed ? {} : (this._sectDef()?.effects || {})
    if (sectFx.qps_mult)                 qps     *= sectFx.qps_mult
    if (sectFx.weapon_qps_mult && weapId) qps    *= sectFx.weapon_qps_mult
    if (sectFx.artifact_qps_mult && artId) qps   *= sectFx.artifact_qps_mult
    if (sectFx.bt_bonus)                 btBonus += sectFx.bt_bonus

    // Own-sect bonuses (Phase 5A)
    const own = s.ownSect
    let discQi = 0, maxBeasts = 3, warDefense = 0, discCap = 0, fame = 0
    let ownCraft = 0, incomeMult = 1, xpMult = 1, libMult = 1
    const arrayDamaged = Date.now() < (s.sectWar?.arrayDamagedUntil || 0)
    if (own.founded) {
      const bIds = Object.keys(own.buildings).filter(k => own.buildings[k])
      for (const id of bIds) {
        const e = SECT_BUILDINGS.find(b => b.id === id)?.effects || {}
        libMult    *= e.disciple_qi_mult || 1
        ownCraft   += e.craft_double_chance || 0
        maxBeasts  += e.beast_slots || 0
        xpMult     *= e.disciple_xp_mult || 1
        if (!(id === 'defensive_array' && arrayDamaged)) warDefense += e.war_defense || 0
        incomeMult *= e.income_mult || 1
      }
      for (const d of own.disciples) {
        discQi += DISCIPLE_QI_FRAC * d.talent * (1 + 0.1 * (d.level - 1))
        fame   += d.talent * d.level
      }
      discQi *= libMult
      discCap = SECT_HALL_LEVELS[Math.min(own.hallLevel, SECT_HALL_LEVELS.length) - 1].cap
      fame   += 10 * bIds.length + 25 * own.hallLevel + 5 * (s.sectWar?.warVictories || 0)
    }
    qps *= 1 + discQi

    // Pill preview bonus (for display only — consumed at BT attempt time)
    let pillBtPreview = 0
    if (s.activePill && ITEMS[s.activePill]) {
      const pe = ITEMS[s.activePill].effect
      if (pe.type === 'bt_bonus')    pillBtPreview = pe.value
      if (pe.type === 'bt_guarantee') pillBtPreview = 1
    }

    const baseChance = Math.min(0.98, Math.max(sectFx.bt_floor || 0, st.breakthroughChance + btBonus + s.karma / 1000))

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
      lootMult:         (weapId && ITEMS[weapId]?.effect?.type === 'void_blade' ? ITEMS[weapId].effect.loot_mult : 1) * (sectFx.loot_mult || 1),
      hiddenLocations:  artId === 'artifact_void_compass' || !!sectFx.hidden_locations,
      sectHerbMult:     sectFx.herb_mult || 1,
      sectCraftDouble:  Math.min(1, (sectFx.craft_double_chance || 0) + ownCraft),
      maxBeasts,
      warDefense,
      discipleCap:      discCap,
      sectFame:         fame,
      ownSectIncomeMult: incomeMult,
      discipleXpMult:   xpMult,
      discipleQiFrac:   discQi,
      integrityRegenMult: sectFx.integrity_regen_mult || 1,
      realmIntegrity:   s.realmIntegrity ?? 100,
      arrayDamaged,
      sectBuffSuppressed,
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
    s._intRegenAcc = (s._intRegenAcc || 0) + dt * (s.derived.integrityRegenMult || 1)
    if (s._intRegenAcc >= 30) {
      s._intRegenAcc -= 30
      s.realmIntegrity = Math.min(100, (s.realmIntegrity ?? 100) + 1)
    }

    // Health passive regen (Phase 23A)
    s._healthRegenAcc = (s._healthRegenAcc || 0) + dt
    if (s._healthRegenAcc >= HEALTH_REGEN_SECONDS) {
      s._healthRegenAcc -= HEALTH_REGEN_SECONDS
      s.health = Math.min(100, (s.health ?? 100) + HEALTH_REGEN_AMOUNT)
    }

    this.tickOwnSect(dt)
    this.tickSectWar()
    this._tickAutomation(dt)

    this._saveT += dt
    if (this._saveT >= this.SAVE_INT) {
      this._saveT = 0
      this._save()
    }

    this._recalc()
    this._notify(true)
  }

  // Phase 22: opts.minQiFrac overrides the default 0.90 gate (used only by the auto-breakthrough dispatch,
  // whose slider ranges 80-100% — manual UI clicks never pass this, so their behavior is unchanged).
  // opts.focusBonus adds ACTIVE_BT_FOCUS_BONUS to this one attempt only (Active Mode click-window, 22C).
  attemptBreakthrough(opts = {}) {
    const s = this._s
    const minQiFrac = opts.minQiFrac ?? 0.90
    if (!(s.qi >= s.derived.qiCap * minQiFrac)) return { success: false, reason: 'insufficient_qi' }
    if (s.stageIndex >= CULTIVATION_STAGES.length - 1) return { success: false, reason: 'ascended' }
    // The last mortal stage no longer breaks through automatically — it's a chance-based Ascension
    // Trial instead (Phase 23C). Callers should use attemptAscension() when they hit this reason.
    if (s.stageIndex === CULTIVATION_STAGES.length - 2) return { success: false, reason: 'ascension_required' }

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
      if (opts.focusBonus) btChance = Math.min(0.98, btChance + ACTIVE_BT_FOCUS_BONUS)   // 22C: click-window bonus, this attempt only

      if (Math.random() > btChance) {
        // Qi loss — default keep 50%, pills reduce the loss
        let qiKeep = 0.5
        if (pillEffect?.type === 'qi_loss_reduce') qiKeep = 0.5 + 0.5 * pillEffect.value
        if (pillEffect?.qi_loss_reduce != null)    qiKeep = 0.5 + 0.5 * pillEffect.qi_loss_reduce
        if (s.playMode === 'active') qiKeep = Math.min(1, qiKeep + ACTIVE_BT_QI_LOSS_BONUS)   // 22C: -10% extra loss kept in Active Mode
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

        s.banter.failStreak = (s.banter?.failStreak || 0) + 1
        this._recalc(); this._notify()
        this._emit('bt_fail', { streak: s.banter.failStreak })
        return { success: false, reason: 'failed', demoted }
      }
    }

    s.stageIndex++
    s.qi    = 0
    s.karma = Math.min(100, s.karma + 10)
    s.stats.breakthroughs++
    s.maxStageThisLife = Math.max(s.maxStageThisLife || 0, s.stageIndex)
    if (s.banter) s.banter.failStreak = 0
    this._recalc(); this._notify()
    this._emit('bt_success')
    return { success: true, newStage: this._stage() }
  }

  // ── Phase 23A/B/C: Health, Bloodline Quality, Ascension Trial ──────────────

  // Hidden from the player except on the Ascension screen and after the first attempt (Phase 23B).
  ascensionChance() {
    const s = this._s
    const bq = s.bloodlineQuality || 0
    let prep = 0
    if ((s.realmIntegrity ?? 100) >= 100) prep += ASCENSION_PREP_INTEGRITY
    if ((s.health ?? 100) >= 100)         prep += ASCENSION_PREP_HEALTH
    const chance = ASCENSION_BASE_CHANCE + bq * ASCENSION_BQ_COEF + prep
    return Math.max(0, Math.min(ASCENSION_CHANCE_CAP, chance))
  }

  attemptAscension() {
    const s = this._s
    const lastMortal = CULTIVATION_STAGES.length - 2
    if (s.stageIndex !== lastMortal)  return { success: false, reason: 'not_ready' }
    if (!s.derived.canBreakthrough)   return { success: false, reason: 'insufficient_qi' }

    const chance = this.ascensionChance()
    s.stats.ascensionAttempts++

    if (Math.random() < chance) {
      s.stageIndex++
      s.qi       = 0
      s.ascended = true
      s.maxStageThisLife = s.stageIndex
      s.stats.ascensions++
      this._recalc(); this._notify()
      return { success: true, chance, newStage: this._stage() }
    }

    this._die('ascension_failed')
    return { success: false, reason: 'died', chance }
  }

  // Public so cultivation.js (random events) can check for health-related death after mutating s.health.
  checkDeath(cause = 'event') {
    if ((this._s.health ?? 100) <= 0) { this._die(cause); return true }
    return false
  }

  // Ends the current life: grows the family's Bloodline Quality from what this life achieved, then
  // resets to a fresh save carrying only bloodlineQuality/generation/deaths forward (Phase 23B/D).
  // Reincarnating into family (full carry) needs an heir — Phase 16/18, not built yet, so every life
  // today reincarnates as a "new soul" (BLOODLINE_CARRY_NEW_SOUL).
  _die(cause) {
    const s = this._s
    const maxStage  = Math.max(s.maxStageThisLife || 0, s.stageIndex)
    // Phase 9B: fired before this._s is replaced so a listener can still read the dying life's stage.
    this._emit('death', { cause, maxStage })
    const selfTerm  = Math.pow(maxStage / (CULTIVATION_STAGES.length - 1), 2)
    const growth    = BLOODLINE_G_BASE + BLOODLINE_G_SELF * selfTerm   // no partner term yet (Phase 16)
    const parentBQ  = s.bloodlineQuality || 0
    const heirBQ    = Math.min(BLOODLINE_CAP, parentBQ * BLOODLINE_CARRY_NEW_SOUL + growth)
    const priorGen  = s.generation || 1
    const priorDeaths = s.deaths || 0
    const settings    = s.settings
    const warOrders   = s.warOrders   // standing orders belong to the player, not the life (Phase 32)
    const playMode    = s.playMode    // Active/Idle mode + automation belong to the player, not the life (Phase 22)
    const automation  = s.automation

    const summary = {
      cause, maxStageReached: maxStage, generation: priorGen,
      parentBloodlineQuality: parentBQ, newBloodlineQuality: heirBQ, ts: Date.now(),
    }

    this._s = this._newGame()
    this._s.bloodlineQuality  = heirBQ
    this._s.generation        = priorGen + 1
    this._s.deaths            = priorDeaths + 1
    this._s.lastReincarnation = summary
    if (settings) this._s.settings = settings   // presentation prefs belong to the player, not the life
    if (warOrders) this._s.warOrders = warOrders
    if (playMode) this._s.playMode = playMode
    if (automation) this._s.automation = automation
    this._recalc(); this._notify()
    this._emit('reborn')
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

  // Phase 22: opts.endsAt lets offline catch-up chain a relaunch off the missed cycle's timestamp instead of
  // real "now", so auto-explore fast-forwards through the whole offline gap (see initSlot()).
  startExpedition(locationId, opts = {}) {
    const s = this._s
    if (s.expedition.active) return { ok: false, reason: 'active' }
    const loc = LOCATIONS.find(l => l.id === locationId)
    if (!loc) return { ok: false, reason: 'unknown' }
    if (s.stageIndex < loc.minStage) return { ok: false, reason: 'stage' }
    const endsAt = opts.endsAt ?? (Date.now() + loc.duration * 1000 * this._activeTimeMult('expedition'))
    s.expedition = { active: true, locationId, endsAt, pushed: false }
    s.automation.lastExploreLocationId = locationId
    this._notify()
    return { ok: true, loc }
  }

  // Phase 22: Active Mode's "Push Harder" — spends stones for one extra drop-table roll on this expedition.
  pushExpedition() {
    const s = this._s
    if (s.playMode !== 'active')  return { ok: false, reason: 'not_active' }
    if (!s.expedition.active)     return { ok: false, reason: 'no_expedition' }
    if (s.expedition.pushed)      return { ok: false, reason: 'already' }
    const loc = LOCATIONS.find(l => l.id === s.expedition.locationId)
    if (!loc) return { ok: false, reason: 'unknown' }
    const msLeft = s.expedition.endsAt - Date.now()
    if (msLeft > loc.duration * 1000 * ACTIVE_PUSH_HARDER_WINDOW_FRAC) return { ok: false, reason: 'too_early' }
    if (s.spiritStones < ACTIVE_PUSH_HARDER_COST) return { ok: false, reason: 'stones' }
    s.spiritStones -= ACTIVE_PUSH_HARDER_COST
    s.expedition.pushed = true
    this._notify()
    return { ok: true }
  }

  // Phase 22: modest Active Mode timer reductions (22C) — 1 outside Active Mode, always.
  _activeTimeMult(kind) {
    if (this._s.playMode !== 'active') return 1
    if (kind === 'expedition')   return ACTIVE_EXPEDITION_TIME_MULT
    if (kind === 'sect_mission') return ACTIVE_SECT_MISSION_TIME_MULT
    return 1
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
    if (s.expedition.pushed) {   // 22C: Push Harder — one extra drop-table roll, merged in
      const extra = this._rollDrops(loc)
      for (const [id, qty] of Object.entries(extra)) drops[id] = (drops[id] || 0) + qty
    }

    // Sect herb bonus (Myriad Herb Hall)
    const herbMult = s.derived?.sectHerbMult || 1
    if (herbMult > 1) {
      for (const id of Object.keys(drops)) {
        if (ITEMS[id]?.type === 'resource' && /herb/.test(id)) drops[id] = Math.max(1, Math.round(drops[id] * herbMult))
      }
    }

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
    const tableW = loc.dropTable.reduce((sum, d) => sum + d.weight, 0)
    const rare   = loc.dropTable.find(d => drops[d.itemId] && ITEMS[d.itemId]?.type !== 'currency' && d.weight <= tableW * BANTER_RARE_WEIGHT_FRAC)
    this._emit('expedition_return', { rareItem: rare ? (ITEMS[rare.itemId]?.name || rare.itemId) : null })

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

    // Health risk: zones whose enemy tier outclasses the player's current stage (Phase 23A)
    const expectedTier = 1 + Math.floor(s.stageIndex / 5)
    const outclass = Math.max(0, loc.enemyTier - expectedTier)
    if (outclass > 0 && Math.random() < EXPEDITION_INJURY_CHANCE_PER_TIER * outclass) {
      const dmg = EXPEDITION_INJURY_BASE + EXPEDITION_INJURY_PER_TIER * outclass
      s.health = Math.max(0, (s.health ?? 100) - dmg)
      this.addEvent({ text: `The foes at ${loc.name} outmatched you — you return injured. Health -${dmg}.`, type: 'negative' })
    }

    if ((s.health ?? 100) <= 0) { this._die('expedition'); return }
    this._maybeAutoExplore()
    this._recalc(); this._notify()
  }

  // Phase 22: relaunches the last manually-chosen location if Auto-Explore is on, unlocked, unpaused for
  // this location, and still reachable at the current stage. Fires live and during offline catch-up.
  _maybeAutoExplore() {
    const s = this._s
    if (s.playMode !== 'idle' || !s.automation.autoExplore) return
    if (!this.automationUnlocked('autoExplore')) return
    const locId = s.automation.lastExploreLocationId
    if (!locId || s.automation.autoExplorePaused[locId]) return
    const loc = LOCATIONS.find(l => l.id === locId)
    if (!loc || s.stageIndex < loc.minStage) return
    // Never auto-walk a wounded cultivator into a zone that outclasses them (live or offline).
    const outclass = loc.enemyTier - (1 + Math.floor(s.stageIndex / 5))
    if (outclass > 0 && (s.health ?? 100) < AUTO_EXPLORE_MIN_HEALTH_OUTCLASSED) {
      this.addEvent({ text: `[Auto] Too wounded to return to ${loc.name} — Auto-Explore stops here; send the next expedition yourself once healed.`, type: 'neutral' })
      return
    }
    const res = this.startExpedition(locId)
    if (res.ok) {
      this.addEvent({ text: `[Auto] Expedition to ${loc.name} launched.`, type: 'neutral' })
      this._emit('auto_fire', { system: 'explore' })
    }
  }

  // ── Phase 2: Crafting ─────────────────────────────────────────────────────

  // Phase 22: opts.watched (game.js passes true when the Craft tab was viewed within the last minute) lets
  // Active Mode roll an independent "Master's Touch" double-output chance — see docs/systems/automation.md.
  craftItem(recipeId, opts = {}) {
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
    let doubled = Math.random() < (s.derived?.sectCraftDouble || 0)
    let masterTouch = false
    if (!doubled && s.playMode === 'active' && opts.watched && Math.random() < ACTIVE_CRAFT_TOUCH_CHANCE) {
      doubled = true; masterTouch = true
    }
    s.inventory[recipe.productId] = (s.inventory[recipe.productId] || 0) + (doubled ? 2 : 1)
    const item = ITEMS[recipe.productId]
    this._recalc(); this._notify()
    return { ok: true, item, doubled, masterTouch }
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

  // Phase 21: Pack tab discard. Only unequipped inventory copies can be discarded — equipped
  // weapon/artifact must be unequipped first (unequipItem returns it to inventory).
  discardItem(itemId, n = 1) {
    const s = this._s
    const item = ITEMS[itemId]
    if (!item) return { ok: false, reason: 'unknown' }
    if (item.type === 'currency') return { ok: false, reason: 'currency' }
    if (!(Number.isInteger(n) && n > 0)) return { ok: false, reason: 'invalid_qty' }
    const have = s.inventory[itemId] || 0
    if (have < n) return { ok: false, reason: 'not_owned' }
    s.inventory[itemId] -= n
    if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    if (s.activePill === itemId && !s.inventory[itemId]) s.activePill = null
    this._recalc(); this._notify()
    return { ok: true }
  }

  // ── Phase 3: Spiritual Beasts ─────────────────────────────────────────────

  tameEncounteredBeast(encounterId) {
    const s = this._s
    const enc = (s.beastEncounters || []).find(e => e.id === encounterId)
    if (!enc) return { ok: false, reason: 'not_found' }

    const beastType = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : []).find(b => b.id === enc.typeId)
    if (!beastType) return { ok: false, reason: 'unknown_type' }
    if (s.stageIndex < beastType.minStage) return { ok: false, reason: 'stage' }
    if ((s.beasts || []).length >= (s.derived?.maxBeasts || 3)) return { ok: false, reason: 'max_beasts' }
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
    this._emit('beast_tamed', { name: beastType.name })
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
    if (!beast?.expedition || beast.expedition.war) return   // war-lent beasts come home when the war resolves (Phase 5C)

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
    this._addBeastXp(beast, xpGain)

    beast.expedition = null

    this.addEvent({
      text: `${beast.name} returned: ${parts.length ? parts.join(', ') : 'nothing found'}.`,
      type: 'positive',
    })
    this._recalc(); this._notify()
  }

  _addBeastXp(beast, xp) {
    beast.xp += xp
    while (beast.xp >= 100 && beast.level < 10) {
      beast.xp   -= 100
      beast.level++
      this.addEvent({ text: `${beast.name} reached level ${beast.level}!`, type: 'positive' })
    }
    if (beast.level >= 10) beast.xp = Math.min(beast.xp, 99)
  }

  dismissBeast(beastId) {
    const s = this._s
    const before = (s.beasts || []).length
    s.beasts = (s.beasts || []).filter(b => b.id !== beastId)
    if (s.beasts.length === before) return { ok: false, reason: 'not_found' }
    this._recalc(); this._notify()
    return { ok: true }
  }

  // ── Phase 4: Sect System ──────────────────────────────────────────────────

  joinSect(sectId) {
    const s = this._s
    const def = SECTS.find(x => x.id === sectId)
    if (!def)                     return { ok: false, reason: 'unknown' }
    if (s.sect.id)                return { ok: false, reason: 'in_sect' }
    if (s.ownSect?.founded)       return { ok: false, reason: 'own_sect' }
    if (s.stageIndex < def.minStage) return { ok: false, reason: 'stage' }
    s.sect = { id: def.id, rank: 0, contribution: 0, activeMissions: [] }
    s.sectWar = this._blankSectWar('member')   // first call to arms is scheduled on the next tick
    this.addEvent({ text: `You joined the ${def.name} (${def.nameCN}) as an Outer Disciple.`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, sect: def }
  }

  leaveSect() {
    const s = this._s
    const def = this._sectDef()
    if (!def) return { ok: false, reason: 'no_sect' }
    const w = s.sectWar
    const deserter = w.side === 'member' && w.phase !== 'none'
    if (w.beastId) this._releaseWarBeast(0)
    s.sect  = { id: null, rank: 0, contribution: 0, activeMissions: [] }
    s.sectWar = this._blankSectWar()
    s.karma = Math.max(0, s.karma - 5 - (deserter ? MEMBER_WAR_DESERT_KARMA : 0))
    if (deserter) this.addEvent({ text: `You fled the ${def.name} on the eve of battle with the ${w.enemyName}. Your fellow disciples curse the name of a deserter.`, type: 'negative' })
    else this.addEvent({ text: `You left the ${def.name}. Your rank and contribution are forfeit.`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  donateToSect(stones) {
    const s = this._s
    stones = Math.floor(stones)
    if (!s.sect.id)               return { ok: false, reason: 'no_sect' }
    if (!(stones > 0))            return { ok: false, reason: 'invalid' }
    if (s.spiritStones < stones)  return { ok: false, reason: 'stones' }
    const gained = Math.max(1, Math.floor(stones * SECT_DONATE_RATE))
    s.spiritStones      -= stones
    s.sect.contribution += gained
    this._recalc(); this._notify()
    return { ok: true, gained }
  }

  rankUpSect() {
    const s = this._s
    if (!s.sect.id) return { ok: false, reason: 'no_sect' }
    const next = SECT_RANKS[s.sect.rank + 1]
    if (!next)                                   return { ok: false, reason: 'max_rank' }
    if (s.sect.contribution < next.minContribution) return { ok: false, reason: 'contribution' }
    s.sect.rank++
    this.addEvent({ text: `Promoted to ${next.name} (${next.nameCN}) in the ${this._sectDef().name}!`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, rank: s.sect.rank }
  }

  startSectMission(missionId) {
    const s = this._s
    if (!s.sect.id) return { ok: false, reason: 'no_sect' }
    const m = SECT_MISSIONS.find(x => x.id === missionId)
    if (!m)                                  return { ok: false, reason: 'unknown' }
    if (s.sect.rank < m.minRank)             return { ok: false, reason: 'rank' }
    if (s.sect.activeMissions.some(a => a.missionId === missionId)) return { ok: false, reason: 'busy' }
    if (s.sect.activeMissions.length >= SECT_MAX_MISSIONS) return { ok: false, reason: 'full' }
    s.sect.activeMissions.push({
      uid: `${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      missionId,
      endsAt: Date.now() + m.duration * 1000 * this._activeTimeMult('sect_mission'),
    })
    this._notify()
    return { ok: true, mission: m }
  }

  // Phase 22: re-queues the same mission type if Auto-Sect-Missions is on, unlocked, and a slot is free.
  // Live only — Phase 4 sect missions have never fast-forwarded during offline catch-up (SectSystem only
  // ticks live); see docs/systems/automation.md Offline Catch-Up.
  _maybeAutoSectMission(missionId) {
    const s = this._s
    if (s.playMode !== 'idle' || !s.automation.autoSectMissions) return
    if (!s.sect.id || !this.automationUnlocked('autoSectMissions')) return
    if (s.sect.activeMissions.length >= SECT_MAX_MISSIONS) return
    const m = SECT_MISSIONS.find(x => x.id === missionId)
    if (!m || s.sect.rank < m.minRank) return
    const res = this.startSectMission(missionId)
    if (res.ok) {
      this.addEvent({ text: `[Auto] ${m.name} re-queued.`, type: 'neutral' })
      this._emit('auto_fire', { system: 'sect_mission' })
    }
  }

  resolveSectMission(uid) {
    const s = this._s
    const idx = s.sect.activeMissions.findIndex(a => a.uid === uid)
    if (idx < 0) return
    const active = s.sect.activeMissions[idx]
    s.sect.activeMissions.splice(idx, 1)
    const m = SECT_MISSIONS.find(x => x.id === active.missionId)
    if (!m || !s.sect.id) { this._notify(); return }

    const mult  = SECT_RANKS[s.sect.rank]?.rewardMult || 1
    const parts = []
    for (const r of m.rewards) {
      const qty = Math.max(1, Math.round((r.minQty + Math.random() * (r.maxQty - r.minQty)) * mult))
      if (ITEMS[r.itemId]?.type === 'currency') {
        s.spiritStones += qty
        parts.push(`${qty}× Spirit Stone`)
      } else {
        s.inventory[r.itemId] = (s.inventory[r.itemId] || 0) + qty
        parts.push(`${qty}× ${ITEMS[r.itemId]?.name || r.itemId}`)
      }
    }
    const contrib = Math.round(m.contribution * mult)
    s.sect.contribution += contrib
    parts.push(`${contrib} Contribution`)

    if (m.beastXp > 0) {
      const idle = (s.beasts || []).filter(b => !b.expedition)
      for (const b of idle) this._addBeastXp(b, m.beastXp)
      if (idle.length) parts.push(`${m.beastXp} Beast XP each`)
    }

    this.addEvent({ text: `Mission complete — ${m.name}: ${parts.join(', ')}.`, type: 'positive' })
    this._maybeAutoSectMission(active.missionId)
    this._recalc(); this._notify()
  }

  // ── Phase 5A: Own Sect ────────────────────────────────────────────────────

  _genRecruit() {
    const w = RECRUIT_TALENT_WEIGHTS
    let r = Math.random() * w.reduce((a, b) => a + b, 0), talent = 1
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { talent = i + 1; break } }
    const pick = a => a[Math.floor(Math.random() * a.length)]
    return { id: `d${Date.now()}_${Math.floor(Math.random() * 99999)}`, name: `${pick(DISCIPLE_SURNAMES)} ${pick(DISCIPLE_GIVEN)}`, talent }
  }

  _refreshRecruitPool() {
    const o = this._s.ownSect
    o.recruitPool = Array.from({ length: RECRUIT_POOL_SIZE }, () => this._genRecruit())
    o.poolRefreshAt = Date.now() + RECRUIT_REFRESH_SECONDS * 1000
  }

  foundOwnSect(name) {
    const s = this._s
    const F = SECT_FOUNDING
    if (s.stageIndex < F.minStage)  return { ok: false, reason: 'stage' }
    if (s.sect.id)                  return { ok: false, reason: 'in_sect' }
    if (s.ownSect.founded)          return { ok: false, reason: 'founded' }
    if (s.spiritStones < F.stones)  return { ok: false, reason: 'stones' }
    for (const [id, q] of Object.entries(F.items)) {
      if ((s.inventory[id] || 0) < q) return { ok: false, reason: 'crystals' }
    }
    s.spiritStones -= F.stones
    for (const [id, q] of Object.entries(F.items)) {
      s.inventory[id] -= q
      if (s.inventory[id] <= 0) delete s.inventory[id]
    }
    const clean = String(name || '').trim().slice(0, F.maxNameLen) || 'Nameless Sect'
    s.ownSect = { ...this._blankOwnSect(), founded: true, name: clean, foundedAt: Date.now() }
    s.sectWar = this._blankSectWar('own')
    this._refreshRecruitPool()
    this._scheduleNextWar()
    this.addEvent({ text: `You founded the ${clean}! Its Sect Hall stands, awaiting disciples.`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  buildSectBuilding(id) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const b = SECT_BUILDINGS.find(x => x.id === id)
    if (!b)            return { ok: false, reason: 'unknown' }
    if (o.buildings[id]) return { ok: false, reason: 'built' }
    if (s.spiritStones < b.stones) return { ok: false, reason: 'stones' }
    for (const [iid, q] of Object.entries(b.items)) {
      if ((s.inventory[iid] || 0) < q) return { ok: false, reason: 'items' }
    }
    s.spiritStones -= b.stones
    for (const [iid, q] of Object.entries(b.items)) {
      s.inventory[iid] -= q
      if (s.inventory[iid] <= 0) delete s.inventory[iid]
    }
    o.buildings[id] = true
    this.addEvent({ text: `${b.name} (${b.nameCN}) completed in ${o.name}.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, building: b }
  }

  upgradeSectHall() {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const cost = SECT_HALL_LEVELS[o.hallLevel - 1]?.upgradeStones
    if (cost == null) return { ok: false, reason: 'max_level' }
    if (s.spiritStones < cost) return { ok: false, reason: 'stones' }
    s.spiritStones -= cost
    o.hallLevel++
    this.addEvent({ text: `Sect Hall upgraded to level ${o.hallLevel}. Disciple capacity is now ${SECT_HALL_LEVELS[o.hallLevel - 1].cap}.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, level: o.hallLevel }
  }

  recruitDisciple(candidateId) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const c = o.recruitPool.find(x => x.id === candidateId)
    if (!c) return { ok: false, reason: 'not_found' }
    if (o.disciples.length >= (s.derived?.discipleCap || 0)) return { ok: false, reason: 'full' }
    const cost = DISCIPLE_RECRUIT_COST * c.talent * c.talent
    if (s.spiritStones < cost) return { ok: false, reason: 'stones' }
    s.spiritStones -= cost
    o.recruitPool = o.recruitPool.filter(x => x.id !== candidateId)
    const disciple = { id: c.id, name: c.name, talent: c.talent, level: 1, xp: 0 }
    o.disciples.push(disciple)
    this.addEvent({ text: `${c.name} (${'★'.repeat(c.talent)}) joined ${o.name} as a disciple.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, disciple }
  }

  rerollRecruitPool() {
    const s = this._s
    if (!s.ownSect.founded) return { ok: false, reason: 'no_sect' }
    if (s.spiritStones < RECRUIT_REROLL_COST) return { ok: false, reason: 'stones' }
    s.spiritStones -= RECRUIT_REROLL_COST
    this._refreshRecruitPool()
    this._notify()
    return { ok: true }
  }

  dismissDisciple(id) {
    const o = this._s.ownSect
    const before = o.disciples.length
    o.disciples = o.disciples.filter(d => d.id !== id)
    if (o.disciples.length === before) return { ok: false, reason: 'not_found' }
    this._recalc(); this._notify()
    return { ok: true }
  }

  disbandOwnSect() {
    const s = this._s
    if (!s.ownSect.founded) return { ok: false, reason: 'no_sect' }
    const n = s.ownSect.name
    s.ownSect = this._blankOwnSect()
    s.sectWar = this._blankSectWar()
    s.karma   = Math.max(0, s.karma - 10)
    this.addEvent({ text: `You disbanded the ${n}. Its halls fall silent.`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  // Income, disciple XP and recruit-pool refresh. dt in seconds (also used for offline catch-up).
  tickOwnSect(dt) {
    const s = this._s
    const o = s?.ownSect
    if (!o?.founded) return
    const d = s.derived || {}
    const inc = d.ownSectIncomeMult || 1
    const xpMult = d.discipleXpMult || 1
    let stones = 0, herbs = 0
    for (const dc of o.disciples) {
      const lm = 1 + 0.1 * (dc.level - 1)
      stones += DISCIPLE_STONE_RATE * dc.talent * lm
      herbs  += DISCIPLE_HERB_RATE  * dc.talent * lm
      if (dc.level < DISCIPLE_MAX_LEVEL) {
        dc.xp += (DISCIPLE_XP_BASE + DISCIPLE_XP_PER_TALENT * dc.talent) * xpMult * dt
        while (dc.level < DISCIPLE_MAX_LEVEL && dc.xp >= DISCIPLE_XP_PER_LEVEL * dc.level) {
          dc.xp -= DISCIPLE_XP_PER_LEVEL * dc.level
          dc.level++
          this.addEvent({ text: `${dc.name} of ${o.name} reached level ${dc.level}.`, type: 'positive' })
        }
        if (dc.level >= DISCIPLE_MAX_LEVEL) dc.xp = 0
      }
    }
    o._incomeAcc.spirit_stone += stones * inc * dt
    o._incomeAcc.spirit_herb  += herbs  * inc * dt
    const wholeStones = Math.floor(o._incomeAcc.spirit_stone)
    const wholeHerbs  = Math.floor(o._incomeAcc.spirit_herb)
    if (wholeStones > 0) { s.spiritStones += wholeStones; o._incomeAcc.spirit_stone -= wholeStones }
    if (wholeHerbs  > 0) { s.inventory.spirit_herb = (s.inventory.spirit_herb || 0) + wholeHerbs; o._incomeAcc.spirit_herb -= wholeHerbs }

    if (Date.now() >= o.poolRefreshAt) {
      this._refreshRecruitPool()
      this._notify()   // non-tick notify so the Sect tab redraws with the new candidates
    }
  }

  // ── Phase 5B: Sect Wars (own sect) + Phase 5C: Member Wars (joined sect) ───────────────────────────────────
  // One state machine for both sides; see docs/systems/sect-war.md.

  _scheduleNextWar(baseTs) {
    const s = this._s, w = s.sectWar
    let hours
    if (w.side === 'member') {
      const frac = Math.min(1, (s.sect.rank || 0) / (SECT_RANKS.length - 1))
      hours = MEMBER_WAR_MAX_INTERVAL_HOURS - frac * (MEMBER_WAR_MAX_INTERVAL_HOURS - MEMBER_WAR_MIN_INTERVAL_HOURS)
    } else {
      const frac = Math.min(1, (s.derived?.sectFame || 0) / WAR_FAME_SOFTCAP)
      hours = WAR_MAX_INTERVAL_HOURS - frac * (WAR_MAX_INTERVAL_HOURS - WAR_MIN_INTERVAL_HOURS)
    }
    w.nextWarAt = (baseTs || Date.now()) + hours * 3600 * 1000
  }

  // When the current war's battle happens (scouting knows it in advance too).
  _warEndsAt() {
    const w = this._s.sectWar
    if (w.phase === 'preparing') return w.prepEndsAt
    const prep = w.side === 'member' ? MEMBER_WAR_PREP_SECONDS : WAR_PREP_SECONDS
    return w.phase === 'scouting' ? w.scoutEndsAt + prep * 1000 : 0
  }

  // Advances the war state machine by exactly one phase transition, if one is due.
  // Returns true if a transition happened (caller loops to fast-forward offline catch-up).
  _advanceSectWarStep() {
    const s = this._s, w = s.sectWar
    if (!w.side || w.side !== this._warSide()) return false
    const member = w.side === 'member'
    const now = Date.now()

    if (w.phase === 'none') {
      if (!w.nextWarAt) { this._scheduleNextWar(); return false }
      if (now < w.nextWarAt) return false
      w.phase = 'scouting'
      w.scoutEndsAt = w.nextWarAt + (member ? MEMBER_WAR_SCOUT_SECONDS : WAR_SCOUT_SECONDS) * 1000
      const pick = a => a[Math.floor(Math.random() * a.length)]
      w.enemyName = `${pick(RIVAL_SECT_PREFIXES)} ${pick(RIVAL_SECT_SUFFIXES)}`
      const baseTier = member ? this._sectTier() : Math.round((s.derived?.sectFame || 0) / 100)
      w.enemyTier = Math.max(1, Math.min(5, baseTier + Math.floor(Math.random() * 3) - 1))
      w.allyId = null
      w.reinforced = false
      w.answered = false; w.chestStones = 0; w.pillsGiven = 0; w.beastId = null; w.seen = false
      if (this._warLive) this._emit('war_call', { enemy: w.enemyName, sect: member ? this._sectDef()?.name : s.ownSect?.name })
      if (member) {
        const def = this._sectDef()
        this.addEvent({ text: `War drums sound across the ${def.name}! The ${w.enemyName} has declared war — the elders call every disciple to arms.`, type: 'negative' })
      } else {
        this.addEvent({ text: `Scouts report the ${w.enemyName} massing near your borders.`, type: 'negative' })
      }
      this._applyWarOrders()   // Phase 32: same the moment this phase opens, live or offline
      return true
    }

    if (w.phase === 'scouting') {
      if (now < w.scoutEndsAt) return false
      w.phase = 'preparing'
      w.prepEndsAt = w.scoutEndsAt + (member ? MEMBER_WAR_PREP_SECONDS : WAR_PREP_SECONDS) * 1000
      this.addEvent({ text: member
        ? `The ${this._sectDef().name} musters its disciples at the mountain gate. Battle with the ${w.enemyName} draws near.`
        : `The ${w.enemyName} will strike soon — prepare your defenses!`, type: 'negative' })
      this._applyWarOrders()   // Phase 32: re-applied here too (reinforce only allowed once 'preparing';
                                // also catches a beast/chest order that couldn't fire at 'scouting')
      return true
    }

    if (w.phase === 'preparing') {
      if (now < w.prepEndsAt) return false
      if (member) this._resolveMemberWar(); else this._resolveSectWar()
      return true
    }

    return false
  }

  // Cost helpers shared by reinforceForWar()/requestWarAlly() and _applyWarOrders() (Phase 32), so the
  // "if affordable" order check never re-derives its own copy of these formulas.
  _warReinforceCost() {
    return Math.round(Math.max(20, (this._s.derived?.sectFame || 0) * WAR_REINFORCE_COST_PER_FAME))
  }
  _warAllyCost() {
    return Math.round(WAR_ALLY_COST_BASE + (this._s.derived?.sectFame || 0) * WAR_ALLY_COST_PER_FAME)
  }

  // Phase 32: apply standing orders the moment a war phase opens (called from _advanceSectWarStep(),
  // identically for live ticks and offline catch-up). Every action here goes through the same public
  // commit method a present player would click (answerWarCall(), donateWarChest(), …), so costs/caps/
  // "already done" guards are never duplicated, and a later manual click on top of an order can't
  // double-charge — the guards just report `already`/no-op.
  _applyWarOrders() {
    const s = this._s, w = s.sectWar, o = s.warOrders
    if (!o || !w.side) return
    if (w.side === 'member') {
      if (!w.answered && o.answer !== 'stay_out') this.answerWarCall()
      if (!w.beastId && o.lendBeast === 'strongest') {
        const beast = (s.beasts || []).filter(b => !b.expedition).sort((a, b) => b.level - a.level)[0]
        if (beast) this.sendBeastToWar(beast.id)
      }
      if (o.chestStones > 0) {
        const room = this.memberWarChestFull() - w.chestStones
        const want = Math.min(o.chestStones, room, Math.floor(s.spiritStones))
        if (want > 0) this.donateWarChest(want)
      }
    } else if (w.side === 'own') {
      if (!w.allyId && o.ally !== 'never' && (w.phase === 'scouting' || w.phase === 'preparing')) {
        // Cost/power don't vary by which SECTS entry is asked yet (see sect-war.js comment), so
        // 'cheapest' and 'best' just pick opposite ends of the roster — flavor only for now.
        const pick = o.ally === 'cheapest' ? SECTS[0] : SECTS[SECTS.length - 1]
        if (pick && s.spiritStones >= this._warAllyCost()) this.requestWarAlly(pick.id)
      }
      if (w.phase === 'preparing' && !w.reinforced && o.reinforce === 'if_affordable') {
        if (s.spiritStones - this._warReinforceCost() >= o.reinforceKeep) this.reinforceForWar()
      }
    }
  }

  _resolveSectWar() {
    const s = this._s, w = s.sectWar, d = s.derived || {}
    const fame = d.sectFame || 0
    let playerPower = (fame + 20) * (1 + (d.warDefense || 0))
    if (w.reinforced) playerPower *= 1 + WAR_REINFORCE_POWER_BONUS
    if (w.allyId)     playerPower *= 1 + WAR_ALLY_POWER_BONUS
    const enemyPower = (fame + 20) * (0.6 + Math.random() * 0.8)
    const win = Math.random() < playerPower / (playerPower + enemyPower)
    const enemyName = w.enemyName

    if (win) {
      const stones = Math.round((WAR_SPOILS_STONE_BASE + fame * WAR_SPOILS_STONE_FRAC) * (0.7 + Math.random() * 0.6))
      const herbs  = Math.round((WAR_SPOILS_HERB_BASE  + fame * WAR_SPOILS_HERB_FRAC)  * (0.7 + Math.random() * 0.6))
      s.spiritStones += stones
      s.inventory.spirit_herb = (s.inventory.spirit_herb || 0) + herbs
      w.warVictories++
      w.lastResult = { win: true, enemyName, spoils: { spirit_stone: stones, spirit_herb: herbs }, ts: Date.now() }
      this.addEvent({ text: `Victory! Your sect repelled the ${enemyName}, seizing ${stones} Spirit Stones and ${herbs} Spirit Herbs.`, type: 'special' })
    } else {
      const lost = Math.round(s.spiritStones * WAR_LOSS_RESOURCE_FRAC)
      s.spiritStones = Math.max(0, s.spiritStones - lost)
      w.warDefeats++
      const arrayHit = !!s.ownSect.buildings.defensive_array
      if (arrayHit) w.arrayDamagedUntil = Date.now() + WAR_ARRAY_DAMAGE_HOURS * 3600 * 1000
      let injured = 0
      if (Math.random() < WAR_INJURY_CHANCE) {
        injured = WAR_INJURY_AMOUNT
        s.health = Math.max(0, (s.health ?? 100) - injured)
      }
      w.lastResult = { win: false, enemyName, spoilsLost: lost, arrayHit, injured, ts: Date.now() }
      this.addEvent({ text: `Defeat — the ${enemyName} broke through, plundering ${lost} Spirit Stones${arrayHit ? ' and damaging your Defensive Array' : ''}${injured ? `. You were injured (Health -${injured})` : ''}.`, type: 'negative' })
    }

    w.phase = 'none'
    this._scheduleNextWar()
    if (this._warLive && w.seen) this._emit(win ? 'war_won' : 'war_lost', { enemy: enemyName, sect: s.ownSect?.name })
    if ((s.health ?? 100) <= 0) { this._die('sect_war'); return }
    this._recalc(); this._notify()
  }

  // 1-based strength of the joined sect (its position in SECTS — later sects are stronger).
  _sectTier() {
    const i = SECTS.findIndex(x => x.id === this._s.sect.id)
    return Math.max(1, i + 1)
  }

  memberWarChestFull() {
    return MEMBER_WAR_CHEST_BASE + (this._s.sect.rank || 0) * MEMBER_WAR_CHEST_PER_RANK
  }

  // Commitment bonus → sect power. Shared by the UI (preview) and _resolveMemberWar().
  memberWarPower() {
    const s = this._s, w = s.sectWar
    let bonus = 0
    if (w.answered) bonus += MEMBER_WAR_ANSWER_BONUS
    bonus += MEMBER_WAR_CHEST_MAX_BONUS * Math.min(1, w.chestStones / this.memberWarChestFull())
    bonus += MEMBER_WAR_PILL_BONUS * w.pillsGiven
    const beast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
    if (beast) bonus += Math.min(MEMBER_WAR_BEAST_MAX_BONUS, MEMBER_WAR_BEAST_BASE_BONUS + MEMBER_WAR_BEAST_LVL_BONUS * beast.level)
    const rankMult = SECT_RANKS[s.sect.rank]?.rewardMult || 1
    return { bonus, rankMult, power: 1 + bonus * rankMult }
  }

  // Brings a war-lent beast home (war resolved, sect left, or state reset). Safe if it was dismissed meanwhile.
  _releaseWarBeast(xp) {
    const s = this._s, w = s.sectWar
    const beast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
    if (beast?.expedition?.war) {
      beast.expedition = null
      if (xp > 0) this._addBeastXp(beast, xp)
    }
    w.beastId = null
    return beast || null
  }

  _resolveMemberWar() {
    const s = this._s, w = s.sectWar
    const def = this._sectDef()
    const { bonus, power } = this.memberWarPower()
    const engaged = bonus > 0
    const enemyPower = 0.6 + Math.random() * 0.8
    const win = Math.random() < power / (power + enemyPower)
    const rankMult = SECT_RANKS[s.sect.rank]?.rewardMult || 1
    const enemyName = w.enemyName
    const beast = this._releaseWarBeast(MEMBER_WAR_BEAST_XP)
    const res = { side: 'member', win, enemyName, engaged, seen: w.seen, contribDelta: 0, ts: Date.now() }
    const parts = []
    const loseContrib = amount => {   // never below 0; rank is never demoted
      const lost = Math.min(s.sect.contribution, Math.round(amount * rankMult))
      s.sect.contribution -= lost
      res.contribDelta -= lost
      return lost
    }

    if (win) {
      w.warVictories++
      if (engaged) {
        const contrib = Math.round(MEMBER_WAR_WIN_CONTRIB * rankMult)
        const stones  = Math.round((MEMBER_WAR_SPOILS_STONE_BASE + this._sectTier() * MEMBER_WAR_SPOILS_STONE_PER_TIER) * rankMult * (0.7 + Math.random() * 0.6))
        s.sect.contribution += contrib
        s.spiritStones += stones
        res.contribDelta += contrib
        res.stones = stones
        parts.push(`${contrib} Contribution`, `${stones} Spirit Stones`)
        if (Math.random() < MEMBER_WAR_RARE_CHANCE) {
          const item = MEMBER_WAR_RARE_ITEMS[Math.floor(Math.random() * MEMBER_WAR_RARE_ITEMS.length)]
          s.inventory[item] = (s.inventory[item] || 0) + 1
          res.rareItem = item
          parts.push(`a ${ITEMS[item]?.name || item}`)
        }
      }
    } else {
      w.warDefeats++
      w.buffSuppressedUntil = Date.now() + MEMBER_WAR_BUFF_SUPPRESS_HOURS * 3600 * 1000
      res.suppressed = true
      // Phase 32: the outcome is real whether the war was seen or not — `seen` only changes the log
      // wording below, never whether the penalty applies (a war that happened while you were away
      // still happened; standing orders are what decided whether you were engaged in it).
      const lostContrib = loseContrib(MEMBER_WAR_LOSS_CONTRIB)
      if (lostContrib > 0) parts.push(`−${lostContrib} Contribution`)
      // Only personal injury if you actually answered the call and fought (Phase 23A)
      if (engaged && Math.random() < WAR_INJURY_CHANCE) {
        res.injured = WAR_INJURY_AMOUNT
        s.health = Math.max(0, (s.health ?? 100) - res.injured)
        parts.push(`you were injured (Health -${res.injured})`)
      }
    }

    const ignored = w.seen && !engaged
    if (ignored) {
      w.warsIgnored++
      const lost = loseContrib(MEMBER_WAR_IGNORE_CONTRIB)
      s.karma = Math.max(0, s.karma - MEMBER_WAR_IGNORE_KARMA)
      parts.push(`−${lost} Contribution and −${MEMBER_WAR_IGNORE_KARMA} karma for ignoring the call`)
    }
    if (!w.seen) w.warsUnseen++   // descriptive count only (Phase 32) — no longer gates reward/penalty
    w.contribNet += res.contribDelta
    if (beast) parts.push(`${beast.name} returned with ${MEMBER_WAR_BEAST_XP} XP`)
    w.lastResult = res
    w.answered = false

    // Phase 32: `seen` is presentation-only — an unseen-but-engaged war (standing orders acted for
    // you) gets the same reward/penalty as a watched one, just a line noting orders did the work.
    const awayNote = (!w.seen && engaged) ? ' Your standing orders acted in your stead.' : ''
    const tail = parts.length ? ` ${parts.join(', ')}.` : ''
    if (win && engaged)      this.addEvent({ text: `Victory! The ${def.name} crushed the ${enemyName}, and the elders remember who answered the call:${tail}${awayNote}`, type: 'special' })
    else if (win)            this.addEvent({ text: `The ${def.name} defeated the ${enemyName} — though you played no part in it.${tail}`, type: ignored ? 'negative' : 'positive' })
    else                     this.addEvent({ text: `Defeat — the ${enemyName} routed the ${def.name}. The sect's blessings wane for ${MEMBER_WAR_BUFF_SUPPRESS_HOURS} hours.${tail}${awayNote}`, type: 'negative' })

    w.phase = 'none'
    this._scheduleNextWar()
    if (this._warLive && w.seen) this._emit(win ? 'war_won' : 'war_lost', { enemy: enemyName, sect: def?.name })
    if ((s.health ?? 100) <= 0) { this._die('sect_war'); return }
    this._recalc(); this._notify()
  }

  // Fast-forwards the sect-war state machine (regular ticks and offline catch-up alike).
  // live=false only for offline catch-up in initSlot(): a war that starts and ends while closed stays "unseen".
  tickSectWar(live = true) {
    const w = this._s?.sectWar
    if (!w?.side) return
    let guard = 0
    this._warLive = live
    try { while (this._advanceSectWarStep() && guard++ < 50) {} } finally { this._warLive = true }
    if (live && w === this._s.sectWar && w.phase !== 'none') w.seen = true
  }

  reinforceForWar() {
    const s = this._s, w = s.sectWar
    if (!s.ownSect.founded)      return { ok: false, reason: 'no_sect' }
    if (w.phase !== 'preparing') return { ok: false, reason: 'no_war' }
    if (w.reinforced)            return { ok: false, reason: 'already' }
    const cost = this._warReinforceCost()
    if (s.spiritStones < cost)   return { ok: false, reason: 'stones' }
    s.spiritStones -= cost
    w.reinforced = true
    this._notify()
    return { ok: true, cost }
  }

  requestWarAlly(sectId) {
    const s = this._s, w = s.sectWar
    if (!s.ownSect.founded)                        return { ok: false, reason: 'no_sect' }
    if (w.phase !== 'scouting' && w.phase !== 'preparing') return { ok: false, reason: 'no_war' }
    if (w.allyId)                                  return { ok: false, reason: 'already' }
    const def = SECTS.find(x => x.id === sectId)
    if (!def)                                      return { ok: false, reason: 'unknown' }
    const cost = this._warAllyCost()
    if (s.spiritStones < cost)                     return { ok: false, reason: 'stones' }
    s.spiritStones -= cost
    w.allyId = sectId
    this.addEvent({ text: `The ${def.name} agreed to send aid against the ${w.enemyName}.`, type: 'positive' })
    this._notify()
    return { ok: true, cost, ally: def }
  }

  // ── Phase 5C: member war commitments ──────────────────────────────────────

  _memberWarActive() {
    const w = this._s.sectWar
    return w.side === 'member' && !!this._s.sect.id && (w.phase === 'scouting' || w.phase === 'preparing')
  }

  answerWarCall() {
    const s = this._s, w = s.sectWar
    if (!this._memberWarActive()) return { ok: false, reason: 'no_war' }
    if (w.answered)               return { ok: false, reason: 'already' }
    w.answered = true
    this.addEvent({ text: `You answered the call to arms. Your sword is pledged to the ${this._sectDef().name} until the ${w.enemyName} is dealt with.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  donateWarChest(stones) {
    const s = this._s, w = s.sectWar
    stones = Math.floor(stones)
    if (!this._memberWarActive()) return { ok: false, reason: 'no_war' }
    if (!(stones > 0))            return { ok: false, reason: 'invalid' }
    const room = this.memberWarChestFull() - w.chestStones
    if (room <= 0)                return { ok: false, reason: 'full' }
    const given = Math.min(stones, room)
    if (s.spiritStones < given)   return { ok: false, reason: 'stones' }
    const gained = Math.max(1, Math.floor(given * SECT_DONATE_RATE))
    s.spiritStones      -= given
    w.chestStones       += given
    s.sect.contribution += gained
    this._notify()
    return { ok: true, given, gained }
  }

  offerWarPill(itemId) {
    const s = this._s, w = s.sectWar
    if (!this._memberWarActive())         return { ok: false, reason: 'no_war' }
    if (ITEMS[itemId]?.type !== 'pill')   return { ok: false, reason: 'not_pill' }
    if (!(s.inventory[itemId] > 0))       return { ok: false, reason: 'none' }
    if (w.pillsGiven >= MEMBER_WAR_MAX_PILLS) return { ok: false, reason: 'full' }
    s.inventory[itemId]--
    if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    if (s.activePill === itemId && !s.inventory[itemId]) s.activePill = null
    w.pillsGiven++
    s.sect.contribution += MEMBER_WAR_PILL_CONTRIB
    this._recalc(); this._notify()
    return { ok: true, gained: MEMBER_WAR_PILL_CONTRIB }
  }

  sendBeastToWar(beastId) {
    const s = this._s, w = s.sectWar
    if (!this._memberWarActive()) return { ok: false, reason: 'no_war' }
    if (w.beastId && (s.beasts || []).some(b => b.id === w.beastId)) return { ok: false, reason: 'already' }
    const beast = (s.beasts || []).find(b => b.id === beastId)
    if (!beast)                   return { ok: false, reason: 'not_found' }
    if (beast.expedition)         return { ok: false, reason: 'busy' }
    beast.expedition = { war: true, locationId: null, endsAt: this._warEndsAt() }
    w.beastId = beast.id
    this.addEvent({ text: `${beast.name} joins the ${this._sectDef().name}'s war host against the ${w.enemyName}.`, type: 'positive' })
    this._notify()
    return { ok: true, beast }
  }

  // ── Phase 32: War Standing Orders ──────────────────────────────────────────

  getWarOrders() { return this._s?.warOrders || { ...WAR_ORDERS_DEFAULT } }

  setWarOrder(key, value) {
    const s = this._s
    if (!s?.warOrders) return { ok: false, reason: 'no_state' }
    const o = s.warOrders
    switch (key) {
      case 'answer':
        if (!WAR_ORDER_ANSWER_OPTIONS.includes(value)) return { ok: false, reason: 'invalid' }
        o.answer = value; break
      case 'lendBeast':
        if (!WAR_ORDER_LEND_BEAST_OPTIONS.includes(value)) return { ok: false, reason: 'invalid' }
        o.lendBeast = value; break
      case 'reinforce':
        if (!WAR_ORDER_REINFORCE_OPTIONS.includes(value)) return { ok: false, reason: 'invalid' }
        o.reinforce = value; break
      case 'ally':
        if (!WAR_ORDER_ALLY_OPTIONS.includes(value)) return { ok: false, reason: 'invalid' }
        o.ally = value; break
      case 'chestStones': {
        const n = Math.floor(Number(value))
        if (!isFinite(n) || n < 0) return { ok: false, reason: 'invalid' }
        o.chestStones = n; break
      }
      case 'reinforceKeep': {
        const n = Math.floor(Number(value))
        if (!isFinite(n) || n < 0) return { ok: false, reason: 'invalid' }
        o.reinforceKeep = n; break
      }
      default: return { ok: false, reason: 'unknown' }
    }
    this._save(); this._notify()
    return { ok: true }
  }

  // ── Phase 22: Active/Idle Mode + Automation ────────────────────────────────

  setPlayMode(mode) {
    const s = this._s
    if (mode !== 'idle' && mode !== 'active') return { ok: false, reason: 'invalid' }
    s.playMode = mode
    this._save(); this._notify()
    return { ok: true }
  }

  // key: unlock condition per AUTOMATION_UNLOCKS. autoSectMissions unlocks via EITHER a joined sect's rank
  // OR (independently) the player's own founded sect's Hall level — whichever applies to how they're playing.
  automationUnlocked(key) {
    const s = this._s
    const u = AUTOMATION_UNLOCKS[key]
    if (!s || !u) return false
    if (key === 'autoSectMissions') {
      return !!(s.sect.id && s.sect.rank >= u.sectRank) || !!(s.ownSect.founded && s.ownSect.hallLevel >= u.hallLevel)
    }
    return s.stageIndex >= u.stageIndex
  }

  setAutomation(key, value) {
    const s = this._s
    if (!s) return { ok: false, reason: 'no_state' }
    const a = s.automation
    if (['autoExplore', 'autoSectMissions', 'autoCraft', 'autoBreakthrough'].includes(key)) {
      if (typeof value !== 'boolean') return { ok: false, reason: 'invalid' }
      if (value && !this.automationUnlocked(key)) return { ok: false, reason: 'locked' }
      a[key] = value
    } else if (key === 'breakthroughThreshold') {
      const n = Number(value)
      if (!isFinite(n)) return { ok: false, reason: 'invalid' }
      a.breakthroughThreshold = Math.min(AUTO_BREAKTHROUGH_THRESHOLD_MAX, Math.max(AUTO_BREAKTHROUGH_THRESHOLD_MIN, n))
    } else {
      return { ok: false, reason: 'unknown' }
    }
    this._save(); this._notify()
    return { ok: true }
  }

  setAutoExplorePaused(locationId, paused) {
    const s = this._s
    if (!s) return { ok: false, reason: 'no_state' }
    if (paused) s.automation.autoExplorePaused[locationId] = true
    else delete s.automation.autoExplorePaused[locationId]
    this._notify()
    return { ok: true }
  }

  setAutoCraftRecipe(recipeId, enabled) {
    const s = this._s
    if (!s) return { ok: false, reason: 'no_state' }
    if (enabled) s.automation.autoCraftRecipes[recipeId] = true
    else delete s.automation.autoCraftRecipes[recipeId]
    this._notify()
    return { ok: true }
  }

  // Auto-Craft (continuous, ticked) + Auto-Breakthrough. Both live-only — see docs/systems/automation.md
  // "Offline Catch-Up". Deliberately excludes the Ascension Trial (last mortal stage) from auto-breakthrough:
  // that's a permanent-death gamble with its own manual confirmation overlay (Phase 23C).
  _tickAutomation(dt) {
    const s = this._s
    if (s.playMode !== 'idle') return
    const a = s.automation

    if (a.autoBreakthrough && this.automationUnlocked('autoBreakthrough')) {
      const lastMortal = CULTIVATION_STAGES.length - 2
      if (s.stageIndex < lastMortal) {
        const res = this.attemptBreakthrough({ minQiFrac: a.breakthroughThreshold })
        if (res.success) this.addEvent({ text: `[Auto] Breakthrough — ${res.newStage.realm} · ${res.newStage.layer}.`, type: 'positive' })
        else if (res.reason === 'failed') this.addEvent({ text: '[Auto] Breakthrough attempt failed.', type: 'negative' })
        if (res.success || res.reason === 'failed') this._emit('auto_fire', { system: 'breakthrough' })
      }
    }

    if (a.autoCraft && this.automationUnlocked('autoCraft')) {
      a._craftAcc = (a._craftAcc || 0) + dt
      if (a._craftAcc >= AUTO_CRAFT_CHECK_SECONDS) {
        a._craftAcc = 0
        for (const recipeId of Object.keys(a.autoCraftRecipes)) {
          if (!a.autoCraftRecipes[recipeId]) continue
          const r = RECIPES.find(x => x.id === recipeId)
          if (!r) continue
          if (r.ingredients.every(ing => (s.inventory[ing.itemId] || 0) >= ing.qty)) {
            const res = this.craftItem(recipeId)
            if (res.ok) {
              this.addEvent({ text: `[Auto] Crafted ${res.item?.name || recipeId}.`, type: 'neutral' })
              this._emit('auto_fire', { system: 'craft' })
            }
          }
        }
      }
    }
  }

  // ── Dev tools: late-game test characters (assets/data/dev-presets.js) ─────
  // Returns a complete save object for a slot; game.js writes it with saveSlot() and loads it via initSlot().
  // Doesn't touch the live state. Charselect only offers this in unpackaged builds (window.electron.isDev()).
  buildDevSave(presetId) {
    const p = typeof DEV_PRESETS !== 'undefined' && DEV_PRESETS.find(x => x.id === presetId)
    if (!p) return null
    const now = Date.now()
    const s = this._newGame()
    s.name         = `[DEV] ${p.name}`
    s.stageIndex   = p.stageIndex
    s.spiritStones = p.stones
    s.karma        = p.karma
    s.root         = this._rollSpecificRoot(p.root)
    s.techniques   = p.techniques === 'all' ? TECHNIQUES.filter(t => t.minStage <= p.stageIndex).map(t => t.id) : [...p.techniques]
    s.inventory    = { ...p.inventory }
    s.equipped     = { ...p.equipped }
    s.beasts = p.beasts.map((b, i) => ({
      id: `dev_${now}_${i}`, typeId: b.typeId, name: BEAST_TYPES.find(t => t.id === b.typeId)?.name || b.typeId,
      level: b.level, xp: 0, traits: [...b.traits], expedition: null,
    }))
    if (p.sect) {
      s.sect    = { id: p.sect.id, rank: p.sect.rank, contribution: p.sect.contribution, activeMissions: [] }
      s.sectWar = this._blankSectWar('member')
    }
    if (p.ownSect) {
      const o = p.ownSect
      s.ownSect = { ...this._blankOwnSect(), founded: true, name: o.name, foundedAt: now, hallLevel: o.hallLevel,
        buildings: Object.fromEntries(SECT_BUILDINGS.filter(b => o.buildings === 'all' || o.buildings.includes(b.id)).map(b => [b.id, true])),
        disciples: o.disciples.map(talent => ({ ...this._genRecruit(), talent, level: o.discipleLevel, xp: 0 })) }
      s.sectWar = this._blankSectWar('own')
    }
    if (p.warInMinutes && s.sectWar.side) s.sectWar.nextWarAt = now + p.warInMinutes * 60 * 1000
    // Qi as a fraction of the *effective* cap (techniques/artifacts multiply it) — run _recalc against the new save
    const live = this._s
    this._s = s
    try { this._recalc() } finally { this._s = live }
    s.qi = s.derived.qiCap * p.qiFrac
    s.stats.breakthroughs = p.stageIndex
    s.lastSave = now
    return s
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

  // ── Phase 29: Banter ──────────────────────────────────────────────────────

  onGameEvent(fn) {
    this._eventSubs.push(fn)
    return () => { this._eventSubs = this._eventSubs.filter(l => l !== fn) }
  }

  recordBanter(text, trigger) {
    const b = this._s?.banter
    if (!b || !text) return
    const now = Date.now()
    b.recent.push(text)
    if (b.recent.length > BANTER_RECENT_MAX) b.recent.splice(0, b.recent.length - BANTER_RECENT_MAX)
    b.log.unshift({ text, trigger, ts: now })
    if (b.log.length > BANTER_LOG_MAX) b.log.length = BANTER_LOG_MAX
    b.last   = { text, trigger, ts: now }
    b.lastAt = now
    this._notify()
  }

  markTimeOfDay(key) { if (this._s?.banter) this._s.banter.todSaid = key }

  // ── Phase 20C: Settings ───────────────────────────────────────────────────

  defaultSettings() {
    const out = {}
    for (const def of SETTINGS_DEFS) out[def.id] = def.default
    return out
  }

  getSettings() { return this._s?.settings || this.defaultSettings() }

  setSetting(id, value) {
    const s   = this._s
    const def = SETTINGS_DEFS.find(d => d.id === id)
    if (!s || !def) return { ok: false, reason: 'unknown' }
    if (def.type === 'range') {
      value = Number(value)
      if (!isFinite(value)) return { ok: false, reason: 'invalid' }
      value = Math.round(Math.min(def.max, Math.max(def.min, value)) / def.step) * def.step
      value = Math.min(def.max, Math.max(def.min, +value.toFixed(4)))
    }
    if (!this._settingValid(def, value)) return { ok: false, reason: 'invalid' }
    s.settings[id] = value
    this._save(); this._notify()
    return { ok: true }
  }
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
