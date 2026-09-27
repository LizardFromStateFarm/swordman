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
      if (elapsed > 1 && !this._s.interlude) {   // 2.6d: an unborn life gains nothing offline
        this._recalc()
        // Phase 30 (M2 task 2.4): OFFLINE_QI_MULT tempers the afk lever. Age never passes offline (pillar 4),
        // so afk lives are cheap in Qi-per-open-hour unless offline gain is throttled relative to live Qi/s.
        const gain = elapsed * (this._s.derived?.qiPerSecond || 0) * OFFLINE_QI_MULT
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

  // A new LIFE. `world` (clan-succession.md 2.6a) survives deaths and is passed in by _die(); a fresh slot
  // builds a new world with a founding clan. Neither path touches Math.random(), so _rollRoot()/
  // _rollPersonality()'s draw order below is unchanged (life-loop.md §10).
  // `unborn` (2.6d): a life created by _die() that waits in s.interlude (heir bet → chronicle → rebirth choice) —
  // it joins no clan yet; _beginLife() places it once the player has chosen.
  _newGame(world = null, unborn = false) {
    const w    = world || this._newWorld()
    const clan = unborn ? null : this._playerClan(w)
    const self = Persons.make({ id: this._newPersonId(w), family: clan ? clan.name : '', role: 'self', alive: true })
    if (clan) this._joinClan(w, clan, self.id, w.playerLineId)
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
      // World (clan-succession.md 2.6a): clans, persons, the world clock — survives every death.
      world:            w,
      self,
      // Phase 30 (M2 task 2.3): age advances ONLY in tick() (never initSlot()/offline catch-up — pillar 4),
      // together with world.year. Age is a harmless stat: no lifespan, nothing dies of age (2026-09-26).
      age:              AWAKENING_AGE,
      // Phase 16-lite (M2 task 2.5): spouse/children/proposal. Advanced only by _tickFamily() (game clock).
      family:           this._blankFamily(),
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
      // Phase 31 (M2 task 2.7, clan-succession.md §2.7): firsts/deeds claimed THIS life (credited to
      // clan.merit at death) and the Family Manual technique inherited from the clan, if any.
      lifeMerit:         [],
      inheritedManual:   null,
      // 2.6d (clan-succession.md): between lives (null while alive), where you were born, the upbringing event
      interlude:         null,
      birth:             null,
      upbringing:        null,
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

  // Deterministic person id, no Math.random() (life-loop.md §4.1). The counter lives on the world (2.6a),
  // so ids stay unique across lives. `w` is passed while a fresh world is being built (before this._s exists).
  _newPersonId(w = this._s.world) { return 'p' + (w.nextId++) }

  // ── World (clan-succession.md, task 2.6a) ─────────────────────────────────
  // s.world survives every death; everything else on `s` is the current life. The living player's Person is
  // s.self (never duplicated into world.persons while alive); _die() snapshots it into the registry.

  _blankWorld() {
    return { v: 1, year: 1, nextId: 1, nextClanId: 1, persons: {}, clans: {}, playerClanId: null,
             playerLineId: null, pastLives: [],
             // 2.6d: people/sects that wronged you (rare rival-family rebirth) + the clan an orphan life came from
             enemies: [], lastClanId: null }
  }

  // A fresh slot: a new world with one founding clan (unnamed until a later task gives clans surnames).
  _newWorld() {
    const w = this._blankWorld()
    const clan = this._foundClan(w, '')
    w.playerClanId = clan.id
    w.playerLineId = clan.lines[0].id
    return w
  }

  _foundClan(w, name, founderId = null) {
    const id = 'c' + (w.nextClanId++)
    const clan = {
      id, name, foundedYear: Math.floor(w.year), founderId, headId: founderId,
      lines: [{ id: `${id}-main`, name: 'Main Line', headId: founderId, memberIds: founderId ? [founderId] : [] }],
      sect: null, tradition: { lethalTournaments: 0, peacefulSuccessions: 0, challenges: 0 },
      relations: {}, history: [],
      // Phase 31 (M2 task 2.7, clan-succession.md §2.7): Ancestral Merit/legacies/firsts/catch-up are per-CLAN —
      // a seceded or rival-rebirth clan starts its own ledger, never carries the old clan's ledger with it.
      merit: 0, meritEarned: 0, firsts: {}, legacies: {}, manualTechId: null, techniquesEver: [],
      bestStageIndex: 0, ascendedAncestors: 0, blessingStacks: 0,
    }
    w.clans[id] = clan
    return clan
  }

  // Migration (2.7a): backfills the Phase 31 Merit/legacy/catch-up fields onto every clan already in the
  // registry (old saves predate them) and the per-life lifeMerit/inheritedManual fields. Must run after
  // _ensurePhase33Fields() (needs s.world.clans). bestStageIndex for the player's own clan is seeded from
  // what this save already knows was reached, so catch-up doesn't regress an existing clan to 0.
  _ensurePhase34Fields() {
    const s = this._s
    const blank = { merit: 0, meritEarned: 0, firsts: {}, legacies: {}, manualTechId: null, techniquesEver: [],
                     bestStageIndex: 0, ascendedAncestors: 0, blessingStacks: 0 }
    for (const clan of Object.values(s.world?.clans || {})) {
      for (const k of Object.keys(blank)) {
        if (clan[k] === undefined) clan[k] = Array.isArray(blank[k]) ? [] : (typeof blank[k] === 'object' && blank[k] !== null ? {} : blank[k])
      }
    }
    const own = this._playerClan()
    if (own) {
      const known = Math.max(s.maxStageThisLife || 0, s.stageIndex || 0, s.lastReincarnation?.maxStageReached || 0)
      own.bestStageIndex = Math.max(own.bestStageIndex, known)
      if (s.techniques?.length && !own.techniquesEver.length) own.techniquesEver = [...s.techniques]
    }
    if (!Array.isArray(s.lifeMerit)) s.lifeMerit = []
    if (s.inheritedManual === undefined) s.inheritedManual = null
  }

  // Idempotent: adds personId to the line (main line by default); fills an empty founder/head slot.
  _joinClan(w, clan, personId, lineId = null) {
    const line = clan.lines.find(l => l.id === lineId) || clan.lines[0]
    if (!line.memberIds.includes(personId)) line.memberIds.push(personId)
    if (!line.headId)   line.headId = personId
    if (!clan.founderId) clan.founderId = personId
    if (!clan.headId)   clan.headId = personId
    return line
  }

  // The player's clan, or null for an orphan life.
  _playerClan(w = this._s?.world) {
    return w?.playerClanId ? (w.clans[w.playerClanId] || null) : null
  }

  // 2.6a: at the end of a life, snapshot the player (full Person: root/personality/stage — s.self doesn't
  // carry them while alive), their spouses and children into world.persons, add a pastLives entry, and keep
  // living family on the clan roster. Returns the world for the next life. No Math.random().
  _recordLifeInWorld(cause, maxStage, generation) {
    const s = this._s, w = s.world, yr = Math.floor(w.year), f = s.family || {}
    const clan = this._playerClan(w)
    // 2.6d: a still-unnamed founding clan takes your surname (the fallback your children already carry).
    if (clan && !clan.name) clan.name = this._clanSurname()
    const wasHead = !!clan && clan.headId === s.self.id
    const me = {
      ...s.self, given: s.self.given || (s.name && s.name !== 'Unnamed Cultivator' ? s.name : ''),
      root: s.root, personality: s.personality?.id || null, stageIndex: s.stageIndex, maxStage,
      alive: false, diedYear: yr, cause, role: 'ancestor',
      // 2.6b: your morality at death = your personality's base, pulled by the karma you lived with.
      morality: Math.max(-100, Math.min(100, Math.round((PERSONALITY_MORALITY[s.personality?.id] ?? 0) + (s.karma - 50)))),
      // Phase 31 (M2 task 2.7d): a ★ mark for the Ancestral Hall's family tree + its own epitaph flavor.
      ascendedAncestor: cause === 'ascended',
    }
    w.persons[me.id] = me
    const keep = (p, role) => {
      if (!p?.id) return
      w.persons[p.id] = { ...p, role, grownYear: yr }   // 2.6d: NPC growth continues from here (_advancePersons)
      if (clan && p.alive !== false) this._joinClan(w, clan, p.id, w.playerLineId)
    }
    if (f.spouse) keep(f.spouse, 'spouse')
    for (const x of f.formerSpouses || []) w.persons[x.id] = { ...x, role: 'former_spouse' }
    for (const c of f.children || []) {
      if (c.estranged) w.persons[c.id] = { ...c, role: 'estranged' }   // left the clan: in the world, off the roster
      else keep(c, 'child')
    }
    if (clan) for (const line of clan.lines) if (line.headId === me.id) line.headId = null   // 2.6d fills it
    if (clan && clan.headId === me.id) clan.headId = null
    // 2.6c: what 2.6d's reign sim needs — who takes over, who founds the branches, and the sect they inherit.
    if (clan) {
      const heir = wasHead && f.heirId && (f.children || []).find(c => c.id === f.heirId && c.alive && !c.estranged)
      const viaTournament = !!heir && f.lastTournament?.ranking?.[0] === heir.id
      // Phase 31 (M2 task 2.7c): a snapshot of what this life carried, for the Heirloom/Beast Lineage legacies
      // to hand to the next life at _beginLife() — captured here since s.equipped/s.beasts are gone once _die()
      // rebuilds this._s via _newGame(), same reason clan.sect is snapshotted below.
      const bestBeast = [...(s.beasts || [])].sort((a, b) => (b.level || 0) - (a.level || 0))[0] || null
      clan.pendingSuccession = { fromPersonId: me.id, year: yr, wasHead, heirId: heir ? heir.id : null,
        heirKind: heir ? (viaTournament ? 'tournament' : 'chosen') : null,
        branchFounderIds: viaTournament
          ? f.lastTournament.ranking.slice(1).filter(id => (f.children || []).some(c => c.id === id && c.alive && !c.estranged)) : [],
        equipped: { ...s.equipped },
        bestBeast: bestBeast ? { typeId: bestBeast.typeId, name: bestBeast.name, traits: [...(bestBeast.traits || [])] } : null }
      if (s.ownSect?.founded) clan.sect = { ...JSON.parse(JSON.stringify(s.ownSect)), inheritedYear: yr, heirId: heir ? heir.id : null }
      // Phase 31 (M2 task 2.7b): Ancestral Merit — stage term + this life's claimed firsts + capped deeds.
      clan.bestStageIndex = Math.max(clan.bestStageIndex, maxStage)
      const stageTerm = MERIT_STAGE * Math.pow(maxStage / (CULTIVATION_STAGES.length - 1), 2)
      const firstsMerit = (s.lifeMerit || []).reduce((a, m) => a + m.merit, 0)
      const deeds = Math.min(MERIT_DEED_CAP,
        (s.sectWar?.warVictories || 0) * MERIT_DEED_WAR_WON +
        (s.beasts || []).length * MERIT_DEED_BEAST +
        (s.ownSect?.disciples || []).length * MERIT_DEED_DISCIPLE)
      const meritGained = Math.round(stageTerm + firstsMerit + deeds)
      clan.merit += meritGained
      clan.meritEarned += meritGained
    }
    w.pastLives.push({ personId: me.id, clanId: clan?.id || null, lineId: w.playerLineId, cause, year: yr,
                       maxStage, generation, openHours: +(s.stats.timePlayed / 3600).toFixed(2) })
    return w
  }

  // Phase 31 (M2 task 2.7b, clan-succession.md §2.7): claims a clan first, idempotent, on the CURRENT clan (a
  // mid-life secession claims on the new clan from then on). Queues the Merit onto s.lifeMerit; credited to
  // clan.merit at death in _recordLifeInWorld(). No-op for an orphan life (no clan to claim into).
  _claimFirst(id) {
    const clan = this._playerClan()
    if (!clan || clan.firsts[id]) return false
    const def = CLAN_FIRSTS[id]
    if (!def) return false
    const s = this._s
    clan.firsts[id] = { gen: s.generation || 1, year: Math.floor(s.world.year) }
    s.lifeMerit.push({ id, label: def.label, merit: def.merit })
    return true
  }

  // ── Phase 31 (M2 task 2.7c, clan-succession.md §2.7): Clan Legacies ────────────────────────────────
  // Bought from Ancestral Merit, any time, on the CURRENT clan (per-clan ledger, same as firsts).

  // The current level's value, or 0 if not bought yet.
  _legacyValue(clan, id) {
    const lvl = clan?.legacies?.[id] || 0
    return lvl > 0 ? CLAN_LEGACIES[id].levels[lvl - 1].value : 0
  }

  buyLegacy(id) {
    const clan = this._playerClan()
    if (!clan) return { ok: false, reason: 'unknown' }
    const def = CLAN_LEGACIES[id]
    if (!def) return { ok: false, reason: 'unknown' }
    if (def.requires && !clan.firsts[def.requires]) return { ok: false, reason: 'locked' }
    const lvl = clan.legacies[id] || 0
    if (lvl >= def.levels.length) return { ok: false, reason: 'maxed' }
    const cost = def.levels[lvl].cost
    if (clan.merit < cost) return { ok: false, reason: 'merit' }
    clan.merit -= cost
    clan.legacies[id] = lvl + 1
    this._notify()
    return { ok: true, level: lvl + 1 }
  }

  // Picks which of the clan's known techniques (clan.techniquesEver) the Family Manual legacy hands the heir
  // for free. Gated by the legacy's own level (levels[].value = max technique minStage it can pick).
  setFamilyManual(techId) {
    const clan = this._playerClan()
    if (!clan) return { ok: false, reason: 'unknown' }
    const lvl = clan.legacies.family_manual || 0
    if (!lvl) return { ok: false, reason: 'no_legacy' }
    if (!clan.techniquesEver.includes(techId)) return { ok: false, reason: 'unknown' }
    const t = TECHNIQUES.find(x => x.id === techId)
    if (!t) return { ok: false, reason: 'unknown' }
    if (t.minStage > CLAN_LEGACIES.family_manual.levels[lvl - 1].value) return { ok: false, reason: 'tier' }
    clan.manualTechId = techId
    this._notify()
    return { ok: true }
  }

  legacyLevel(id) { return this._playerClan()?.legacies?.[id] || 0 }

  // Applies the clan's bought legacies to a freshly-built life at _beginLife() — stipend, heirloom items and a
  // beast lineage offspring captured at the last death (_recordLifeInWorld's snapshot, carried on
  // interlude.legacyCapture since _runSuccession deletes clan.pendingSuccession before this ever runs), and the
  // Family Manual pick (learnTechnique() waives its cost — see there). sect_continuity is cut: the reign sim
  // already hands clan.sect to the heir unconditionally (2.6d).
  _applyLegacies(clan, capture) {
    if (!clan) return
    const s = this._s
    capture = capture || {}
    const stipend = this._legacyValue(clan, 'ancestral_stipend')
    if (stipend) s.spiritStones += stipend
    const slots = this._legacyValue(clan, 'heirloom')
    if (slots >= 1 && capture.equipped?.weapon)   s.equipped.weapon   = capture.equipped.weapon
    if (slots >= 2 && capture.equipped?.artifact) s.equipped.artifact = capture.equipped.artifact
    if (clan.manualTechId) s.inheritedManual = clan.manualTechId
    if (this._legacyValue(clan, 'beast_lineage') && capture.bestBeast && (s.beasts || []).length < (s.derived?.maxBeasts || 3)) {
      const b = capture.bestBeast
      s.beasts.push({ id: `beast_${Date.now()}_${Math.floor(Math.random() * 9999)}`, typeId: b.typeId, name: b.name,
        level: 1, xp: 0, traits: [...(b.traits || [])], expedition: null })
    }
  }

  // A person by id: the living player, or the world registry.
  person(id) {
    const s = this._s
    return id === s.self?.id ? s.self : (s.world.persons[id] || null)
  }

  // Migration (2.6a): builds s.world from the old per-life `s.clan` skeleton (task 2.2) + `s.gameYear`, then
  // backfills the world's shape. Runs FIRST in the _recalc() ensure chain — _ensurePhase30Fields needs it.
  _ensurePhase33Fields() {
    const s = this._s
    if (!s.world || typeof s.world !== 'object') {
      const w = this._blankWorld()
      // Same fallback chain the old per-life clock used: gameYear, else derived from age (itself derived from
      // time played for pre-clock saves — _ensurePhase30Fields() fills `age` with the same formula).
      const age = (typeof s.age === 'number' && isFinite(s.age)) ? s.age
                : AWAKENING_AGE + ((s.stats?.timePlayed || 0) / 3600) * GAME_YEARS_PER_OPEN_HOUR
      w.year = (typeof s.gameYear === 'number' && isFinite(s.gameYear)) ? s.gameYear : 1 + (age - AWAKENING_AGE)
      if (s.clan?.nextId >= 1) w.nextId = s.clan.nextId
      const clan = this._foundClan(w, typeof s.clan?.name === 'string' ? s.clan.name : '')
      w.playerClanId = clan.id
      w.playerLineId = clan.lines[0].id
      s.world = w
    }
    delete s.clan; delete s.gameYear
    const w = s.world, blank = this._blankWorld()
    for (const k of Object.keys(blank)) if (w[k] === undefined) w[k] = blank[k]
    if (!(typeof w.year === 'number' && isFinite(w.year))) w.year = 1
    if (w.playerClanId && !w.clans[w.playerClanId]) { w.playerClanId = null; w.playerLineId = null }
  }

  // Phase 30 (M2 task 2.2/2.3): backfill `self` for saves from before this field existed, plus `age` for saves
  // from before the game clock existed. Must run AFTER _ensurePhase33Fields() (needs s.world). Also makes
  // sure the living player is on their clan's roster (2.6a).
  _ensurePhase30Fields() {
    const s = this._s
    const clan = this._playerClan()
    if (!s.self || typeof s.self !== 'object') {
      const given = (s.name && s.name !== 'Unnamed Cultivator') ? s.name.trim().split(/\s+/).pop() : ''
      s.self = Persons.make({ id: this._newPersonId(), given, family: clan ? clan.name : '', role: 'self', alive: true })
    }
    if (clan && !s.interlude) this._joinClan(s.world, clan, s.self.id, s.world.playerLineId)   // unborn lives join at _beginLife()
    // Migration (life-loop.md §2.5): an old save never had `age` — approximate it from time played.
    if (!(typeof s.age === 'number' && isFinite(s.age))) {
      s.age = AWAKENING_AGE + (s.stats.timePlayed / 3600) * GAME_YEARS_PER_OPEN_HOUR
    }
    // Lifespan/twilight/Final Seclusion were removed 2026-09-26 (age never kills) — drop their leftovers.
    delete s.finalSeclusion; delete s.twilightNoticed; delete s._twilightLogged
    // 2.6d (clan-succession.md): between-lives state + birth record + upbringing event. Old saves: born before 2.6d.
    if (s.interlude === undefined) s.interlude = null
    if (s.birth === undefined)     s.birth = null
    if (s.upbringing === undefined) s.upbringing = null
    if (!Array.isArray(s.world.enemies)) s.world.enemies = []
  }

  // Phase 16-lite (M2 task 2.5) + family depth (docs/systems/family.md). spouseStageYear is the gameYear of
  // the spouse's last stage gain. Nobody dies of age — a spouse leaves the family only through the marriage
  // itself (divorce, walking out, a duel, or a discovered affair). affection is null while unmarried.
  _blankFamily() {
    return { spouse: null, children: [], marriedYear: null, nextChildYear: null, proposal: null,
             nextProposalYear: null, spouseStageYear: null,
             affection: null, tolerant: false, formerSpouses: [], event: null, nextEventYear: null,
             lastEventId: null, duel: null, btSabotage: false, tally: this._blankFamilyTally(),
             lovers: [], encounters: [],
             // 2.6b (clan-succession.md): Family Planning + one pending child event at a time
             planning: FAMILY_PLAN_DEFAULT, childEvent: null, nextChildEventYear: null, lastChildEventId: null,
             // 2.6c: designated heir (a home adult child) + the Tournament of Heirs in progress / last result
             heirId: null, tournament: null, lastTournament: null,
             // 2.6e: challenging the head / being challenged as head / a step-down mass tournament
             challengeCooldownYear: null, headChallenge: null, nextChallengerYear: null,
             stepDownOffer: null, nextStepDownYear: null,
             // 2.6f: branch wars (push/declare) — one cooldown, since only one branch line is ever yours
             branchWarCooldownYear: null }
  }

  _blankFamilyTally() {
    return { events: 0, crises: 0, affairs: 0, discovered: 0, accept: 0, sabotage: 0, duel: 0, suicide: 0,
             murder_suicide: 0, left: 0, duelWon: 0, duelLost: 0, fled: 0, childEvents: 0, runaways: 0,
             tournaments: 0, tournamentDeaths: 0,
             challenges: 0, challengesWon: 0, challengesLost: 0, stepDowns: 0, stepDownWon: 0,
             branchWars: 0, branchWarsWon: 0, secessions: 0 }
  }

  // 2.6c: an heir must be a living, adult child still in the household.
  _heirEligible(c) { return !!c && c.alive && !c.estranged && this._childAge(c) >= ADULT_AGE }

  // 2.6b: morality (−100…100) = personality base + noise + `extra` (e.g. a parent's karma). One Math.random().
  _rollMorality(personality, extra = 0) {
    const base = PERSONALITY_MORALITY[personality] ?? 0
    return Math.max(-100, Math.min(100, Math.round(base + (Math.random() * 2 - 1) * MORALITY_NOISE + extra)))
  }

  // The living player's own morality, live (no Math.random — same formula _recordLifeInWorld snapshots at death).
  _selfMorality() {
    const s = this._s
    return Math.max(-100, Math.min(100, Math.round((PERSONALITY_MORALITY[s.personality?.id] ?? 0) + (s.karma - 50))))
  }

  // 2.6b: the child-birth interval for the current Family Planning choice (null = no children).
  _childInterval() {
    return CHILD_INTERVAL_BY_PLAN[this._s.family.planning] ?? null
  }

  _childAge(c) { return this._s.world.year - c.bornYear }

  // Living children still in the household (not estranged).
  _homeChildren() { return this._s.family.children.filter(c => c.alive && !c.estranged) }

  // Phase 16-lite (M2 task 2.5): shape-only backfill. No Math.random() here — the first proposal is
  // scheduled by _tickFamily() on the next game-year change once maxStageThisLife ≥ PROPOSAL_MIN_STAGE,
  // which covers migrated saves already past Foundation Building too.
  _ensurePhase16Fields() {
    const s = this._s
    if (!s.family || typeof s.family !== 'object') s.family = this._blankFamily()
    const f = s.family, blank = this._blankFamily()
    for (const k of Object.keys(blank)) if (f[k] === undefined) f[k] = blank[k]
    if (!Array.isArray(f.children)) f.children = []
    if (!Array.isArray(f.formerSpouses)) f.formerSpouses = []
    if (!Array.isArray(f.lovers))        f.lovers = []
    if (!Array.isArray(f.encounters))    f.encounters = []
    if (!f.tally || typeof f.tally !== 'object') f.tally = this._blankFamilyTally()
    for (const [k, v] of Object.entries(this._blankFamilyTally())) if (typeof f.tally[k] !== 'number') f.tally[k] = v
    if (f.spouse && !(typeof f.affection === 'number' && isFinite(f.affection))) f.affection = AFFECTION_START
    if (!f.spouse) { f.affection = null; f.event = null; f.duel = null }
    delete f.pastSpouses; delete f.mourningUntil   // spouse death/mourning removed 2026-09-26
    // 2.6b backfill (no Math.random() in an _ensure method: morality falls back to the personality base).
    if (!(f.planning in CHILD_INTERVAL_BY_PLAN)) f.planning = FAMILY_PLAN_DEFAULT
    for (const c of f.children) {
      if (!(typeof c.bond === 'number' && isFinite(c.bond))) c.bond = CHILD_BOND_START
      if (!(typeof c.xp === 'number' && isFinite(c.xp))) c.xp = 0
      if (typeof c.morality !== 'number') c.morality = PERSONALITY_MORALITY[c.personality] ?? 0
    }
    for (const p of [f.spouse, ...f.lovers.map(l => l.person), ...(f.proposal?.suitors || []), ...f.encounters.map(e => e.person)]) {
      if (p && typeof p.morality !== 'number') p.morality = PERSONALITY_MORALITY[p.personality] ?? 0
    }
    if (f.childEvent && !f.children.some(c => c.id === f.childEvent.childId && c.alive && !c.estranged)) f.childEvent = null
    // 2.6c: the heir and tournament entrants must still be eligible (a runaway or a death removes them).
    if (f.heirId && !this._heirEligible(f.children.find(c => c.id === f.heirId))) f.heirId = null
    if (f.tournament) {
      // Filter only — finishing (which logs/notifies) happens in _tickFamily(), never inside _recalc().
      f.tournament.pool = f.tournament.pool.filter(id => this._heirEligible(f.children.find(c => c.id === id)))
      if (f.tournament.pool.length === 0) f.tournament = null
    }
    // 2.6e: a pending challenge/step-down offer must still point at someone real.
    if (f.headChallenge) { const ch = this.person(f.headChallenge.challengerId); if (!ch || ch.alive === false || ch.estranged) f.headChallenge = null }
    if (f.stepDownOffer) { const clan = this._playerClan(); if (!clan || clan.headId !== f.stepDownOffer.headId) f.stepDownOffer = null }
  }

  _changeAffection(delta) {
    const f = this._s.family
    if (!f.spouse) return 0
    const before = f.affection
    f.affection = Math.max(0, Math.min(100, f.affection + delta))
    return f.affection - before
  }

  // Fills {spouse}/{name}/{child} in family event text. ctx.childId (child events) or ctx.child (a given name).
  familyText(str, ctx = {}) {
    const s = this._s
    const byId = ctx.childId ? s.family.children.find(c => c.id === ctx.childId)?.given : null
    const vals = { spouse: s.family.spouse ? s.family.spouse.given : 'your spouse', name: s.name,
                   child: byId || ctx.child || this._youngestChild()?.given || 'your child' }
    return String(str || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m)
  }

  _youngestChild() {
    const kids = this._s.family.children.filter(c => c.alive)
    return kids.length ? kids[kids.length - 1] : null
  }

  // Scaled Spirit Stone cost of a family event choice (FAMILY_STONE_SCALE per stage). Public: the UI shows it.
  familyCost(choice) {
    const base = choice?.cost?.stones || 0
    return base ? Math.round(base * (1 + this._s.stageIndex * FAMILY_STONE_SCALE)) : 0
  }

  // A child with `partner` (spouse or lover). No cap — each partner has their own timer (family.md).
  _makeChild(partner) {
    const s = this._s, f = s.family, yr = Math.floor(s.world.year)
    const taken = new Set(f.children.map(c => c.given))
    let given = Persons.rollGiven()
    for (let i = 0; i < 3 && taken.has(given); i++) given = Persons.rollGiven()
    const child = Persons.make({
      id: this._newPersonId(), given, family: this._clanSurname(), bornYear: yr,
      root: Persons.blendRoot(s.root, partner.root), personality: Persons.rollPersonality(),
      role: 'child', alive: true, parents: [s.self.id, partner.id],
    })
    // 2.6b: children grow up — bond with you, their own morality (your karma nudges it), stage progress.
    child.bond     = CHILD_BOND_START
    child.morality = this._rollMorality(child.personality, (s.karma - 50) * MORALITY_KARMA_WEIGHT)
    child.xp       = 0
    f.children.push(child)
    this.addEvent({ text: `Year ${yr}: a child is born — ${Persons.fullName(child)} (${child.root.name}).`, type: 'special' })
    this._claimFirst('first_child')
    this._emit('child_born', { child: child.given })
    return child
  }

  // The marriage ends. endCause: left | divorced | suicide | murder_suicide | duel (family.md). Death causes
  // mark the spouse dead; the rest walk away. Proposals resume after PROPOSAL_RETRY_YEARS.
  _spouseEnds(endCause, text, type = 'negative') {
    const s = this._s, f = s.family, sp = f.spouse
    if (!sp) return
    const y = s.world.year, yr = Math.floor(y)
    const died = endCause === 'suicide' || endCause === 'murder_suicide' || endCause === 'duel'
    const former = { ...sp, endedYear: yr, endCause }
    if (died) { former.alive = false; former.diedYear = yr; former.cause = endCause }
    f.formerSpouses.push(former)
    f.spouse = null; f.affection = null; f.tolerant = false
    f.nextChildYear = null; f.event = null; f.nextEventYear = null; f.duel = null; f.btSabotage = false
    f.nextProposalYear = y + this._randRange(PROPOSAL_RETRY_YEARS)
    if (!died) f.tally.left++
    if (text) this.addEvent({ text: `Year ${yr}: ${text}`, type })
    this._emit(died ? 'spouse_died' : 'spouse_left', { spouse: Persons.fullName(former), cause: endCause })
  }

  // Next marriage event: the crisis pool below AFFECTION_CRISIS (CRISIS_EVENT_CHANCE), else a normal event
  // whose `requires` gate is met, avoiding an immediate repeat.
  _rollMarriageEvent() {
    const s = this._s, f = s.family
    if (f.affection < AFFECTION_CRISIS && Math.random() < CRISIS_EVENT_CHANCE) {
      const ev = MARRIAGE_CRISIS_EVENTS[Math.floor(Math.random() * MARRIAGE_CRISIS_EVENTS.length)]
      return { id: ev.id, crisis: true }
    }
    const ok = r => !r || (r === 'sect' && !!s.sect?.id) || (r === 'beast' && (s.beasts || []).length > 0) ||
                    (r === 'children' && !!this._youngestChild())
    let pool = MARRIAGE_EVENTS.filter(e => ok(e.requires) && e.id !== f.lastEventId)
    if (!pool.length) pool = MARRIAGE_EVENTS.filter(e => ok(e.requires))
    const ev = pool[Math.floor(Math.random() * pool.length)]
    return { id: ev.id, crisis: false }
  }

  marriageEventDef(ev) {
    return (ev?.crisis ? MARRIAGE_CRISIS_EVENTS : MARRIAGE_EVENTS).find(e => e.id === ev?.id) || null
  }

  // 2.6b: stage-ups from banked xp, capped (xp can't bank past one stage while at the cap).
  _growChild(c, cap) {
    while (c.xp >= 1 && c.stageIndex < cap) {
      c.xp -= 1
      c.stageIndex++
      c.maxStage = Math.max(c.maxStage || 0, c.stageIndex)
    }
    if (c.stageIndex >= cap) c.xp = Math.min(c.xp, 1)
    c.xp = Math.max(0, c.xp)
  }

  // 2.6b: picks a child and an event. A low-bond adult may run away (CHILD_CRISIS_EVENTS) instead.
  _rollChildEvent(eligible) {
    const f = this._s.family
    const child = eligible[Math.floor(Math.random() * eligible.length)]
    const adult = this._childAge(child) >= ADULT_AGE
    if (adult && child.bond < CHILD_BOND_CRISIS && Math.random() < CHILD_RUNAWAY_CHANCE) {
      return { id: CHILD_CRISIS_EVENTS[0].id, crisis: true, childId: child.id }
    }
    const ok = r => !r || (r === 'adult' && adult) || (r === 'siblings' && eligible.length >= 2)
    let pool = CHILD_EVENTS.filter(e => ok(e.requires) && e.id !== f.lastChildEventId)
    if (!pool.length) pool = CHILD_EVENTS.filter(e => ok(e.requires))
    const ev = pool[Math.floor(Math.random() * pool.length)]
    return { id: ev.id, crisis: false, childId: child.id }
  }

  childEventDef(ev) {
    return (ev?.crisis ? CHILD_CRISIS_EVENTS : CHILD_EVENTS).find(e => e.id === ev?.id) || null
  }

  // Shared effect application for marriage + child event choices. Family events never kill (Health ≥ 1).
  _applyFamilyEffect(fx = {}) {
    const s = this._s
    // Skipped once the cap is Infinity (post-Ascension stub stage) — a fraction of Infinity would poison qi.
    if (fx.qiFrac && isFinite(s.derived.qiCap)) s.qi = Math.max(0, Math.min(s.derived.qiCap, s.qi + fx.qiFrac * s.derived.qiCap))
    if (fx.health)    s.health = Math.max(1, Math.min(100, (s.health ?? 100) + fx.health))
    if (fx.karma)     s.karma = Math.max(0, Math.min(100, s.karma + fx.karma))
    if (fx.integrity) s.realmIntegrity = Math.max(0, Math.min(100, (s.realmIntegrity ?? 100) + fx.integrity))
    if (fx.contribution && s.sect?.id) s.sect.contribution += fx.contribution
    for (const [id, q] of Object.entries(fx.items || {})) s.inventory[id] = (s.inventory[id] || 0) + q
  }

  // A generated person near the player's stage/age (suitors and lovers).
  _rollStranger(role) {
    const s = this._s
    const stage = Math.max(1, Math.min(SPOUSE_STAGE_CAP, s.stageIndex + this._randInt(SUITOR_STAGE_OFFSET)))
    const age   = Math.max(18, s.age + this._randRange(SUITOR_AGE_OFFSET_YEARS))
    const p = Persons.make({
      id: this._newPersonId(), given: Persons.rollGiven(), family: Persons.rollSurname(),
      bornYear: Math.floor(s.world.year - age), root: Persons.rollRoot(), personality: Persons.rollPersonality(),
      stageIndex: stage, maxStage: stage, role, alive: true,
    })
    p.morality = this._rollMorality(p.personality)   // 2.6b
    return p
  }

  // family.md: the spouse learns of an affair. Affection drops, then a reaction is rolled from the spouse's
  // personality (AFFAIR_REACTIONS), scaled by the affection that's left: accept × aff/50, violent × (100−aff)/50.
  _discoverAffair(lover, viaChild) {
    const s = this._s, f = s.family, sp = f.spouse
    if (!sp) return
    const yr = Math.floor(s.world.year), spName = Persons.fullName(sp), loverName = Persons.fullName(lover.person)
    f.tally.discovered++
    this._changeAffection(AFFAIR_DISCOVERED_AFFECTION + (viaChild ? AFFAIR_CHILD_EXTRA_AFFECTION : 0))
    this.addEvent({ text: `Year ${yr}: ${spName} learns of your affair with ${loverName}${viaChild ? ' — and of the child' : ''}.`, type: 'negative' })
    const w = AFFAIR_REACTIONS[sp.personality] || { accept: 30, sabotage: 30, duel: 20, suicide: 10, murder_suicide: 10 }
    // 2.6b: the spouse's morality tilts it too — a righteous spouse forgives more, a ruthless one turns violent.
    const m = sp.morality ?? 0, kind = 1 + Math.max(0, m) / 100, cruel = 1 + Math.max(0, -m) / 100
    const a = f.affection, calm = a / 50, hot = (100 - a) / 50
    const opts = [['accept', w.accept * calm * kind], ['sabotage', w.sabotage], ['duel', w.duel * hot * cruel],
                  ['suicide', w.suicide * hot], ['murder_suicide', w.murder_suicide * hot * cruel]]
    const total = opts.reduce((sum, o) => sum + o[1], 0)
    let roll = Math.random() * total, reaction = 'sabotage'
    for (const [k, wt] of opts) { roll -= wt; if (wt > 0 && roll <= 0) { reaction = k; break } }
    f.tally[reaction]++
    if (reaction === 'accept') {
      f.tolerant = true
      this.addEvent({ text: `${spName} is silent for a long time. Then: "I knew what you were when I married you." It is not mentioned again.`, type: 'neutral' })
    } else if (reaction === 'sabotage') {
      f.btSabotage = true
      this.addEvent({ text: `${spName} says nothing. But your seclusion chamber's formation lines have been quietly scuffed.`, type: 'negative' })
    } else if (reaction === 'duel') {
      f.event = null
      f.duel = { year: yr, reason: 'affair' }
      this._noteEnemy({ kind: 'person', personId: sp.id, name: spName, surname: sp.family, why: 'dueled you over an affair' })   // 2.6d
      this.addEvent({ text: `${spName} draws a blade in the courtyard and names the terms: to the death.`, type: 'negative' })
      this._emit('duel', { spouse: spName })
    } else if (reaction === 'suicide') {
      this._spouseEnds('suicide', `${spName} could not bear it. They are found at dawn; they have taken their own life.`)
    } else {
      const lost = f.children.filter(c => c.alive && c.parents.includes(sp.id) && s.world.year - c.bornYear < ADULT_AGE)
      for (const c of lost) { c.alive = false; c.diedYear = yr; c.cause = 'murder_suicide' }
      const names = lost.map(c => c.given).join(', ')
      this._spouseEnds('murder_suicide', lost.length
        ? `in grief and fury, ${spName} ended their own life — and took ${names} with them. The house is silent.`
        : `in grief and fury, ${spName} ended their own life. The house is silent.`)
    }
    this._emit('affair_discovered', { reaction })
  }

  _randRange([lo, hi]) { return lo + Math.random() * (hi - lo) }
  _randInt([lo, hi])   { return lo + Math.floor(Math.random() * (hi - lo + 1)) }

  // Surname for new clan members. The clan's name stays '' until a later task gives clans surnames; until then
  // fall back to the first word of a two-word player name ('Lin Mei' → 'Lin'), else none.
  _clanSurname() {
    const s = this._s
    const clan = this._playerClan()
    if (clan?.name) return clan.name
    const parts = (s.name || '').trim().split(/\s+/)
    return (s.name !== 'Unnamed Cultivator' && parts.length >= 2) ? parts[0] : ''
  }

  // Phase 16-lite (M2 task 2.5): the family's game-clock step. Called from tick() only when
  // floor(gameYear) changes (so ~every 2 open minutes), never offline — families age with the player.
  _tickFamily() {
    const s = this._s, f = s.family, y = s.world.year, yr = Math.floor(y)

    // 2.6d: one upbringing event from the head's style, a few years into a life born into a clan (never expires).
    const up = s.upbringing
    if (up && !up.event && !up.done && y >= up.due) {
      const pool = UPBRINGING_EVENTS[up.style] || []
      if (pool.length) {
        const ev = pool[Math.floor(Math.random() * pool.length)]
        up.event = { id: ev.id, style: up.style, year: yr }
        this.addEvent({ text: `Year ${yr}: ${ev.title} — ${this.upbringingText(ev.text)}`, type: 'neutral' })
        this._emit('upbringing_event', { id: ev.id })
      } else up.done = true
    }

    // Spouse: gains a stage every SPOUSE_YEARS_PER_STAGE married years (never ascends, never dies of age).
    const sp = f.spouse
    if (sp) {
      while (y - f.spouseStageYear >= SPOUSE_YEARS_PER_STAGE && sp.stageIndex < SPOUSE_STAGE_CAP) {
        sp.stageIndex++
        sp.maxStage = Math.max(sp.maxStage, sp.stageIndex)
        f.spouseStageYear += SPOUSE_YEARS_PER_STAGE
      }
      if (sp.stageIndex >= SPOUSE_STAGE_CAP) f.spouseStageYear = y
      // Affection drifts slowly back toward AFFECTION_REST.
      const gap = AFFECTION_REST - f.affection
      f.affection += Math.sign(gap) * Math.min(Math.abs(gap), AFFECTION_DRIFT_PER_YEAR)
    }

    // Children with the spouse: paced by Family Planning (2.6b), no cap. 'none' pauses births entirely.
    const interval = this._childInterval()
    if (f.spouse && interval && f.nextChildYear != null && y >= f.nextChildYear) {
      this._makeChild(f.spouse)
      f.nextChildYear = y + this._randRange(interval)
    }

    // 2.6b: children cultivate from AWAKENING_AGE — a stage per CHILD_YEARS_PER_STAGE ÷ root.mult years, never
    // past your own stage while you live (so a Tournament of Heirs is a real contest, not a formality).
    const cap = Math.min(SPOUSE_STAGE_CAP, s.stageIndex)
    // 2.6b: a big household spreads you thin — bonds drift down toward a neglect target (never up).
    const home = this._homeChildren()
    const neglect = Math.max(CHILD_NEGLECT_FLOOR, 50 - CHILD_NEGLECT_PER_CHILD * Math.max(0, home.length - CHILD_ATTENTION))
    for (const c of home) if (c.bond > neglect) c.bond = Math.max(neglect, c.bond - CHILD_NEGLECT_DRIFT)
    for (const c of home) {
      if (this._childAge(c) < AWAKENING_AGE) continue
      c.xp += (c.root?.mult || 1) / CHILD_YEARS_PER_STAGE
      this._growChild(c, cap)
    }

    // Lovers (family.md): each has their own child timer. A lover's child may expose the affair
    // (DISCOVERY_ON_LOVER_CHILD); a tolerant spouse only sighs (AFFAIR_TOLERATED_AFFECTION).
    for (const lover of [...f.lovers]) {
      if (lover.endsYear != null && y >= lover.endsYear) {   // affairs fade on their own (AFFAIR_YEARS)
        f.lovers.splice(f.lovers.indexOf(lover), 1)
        this.addEvent({ text: `Year ${yr}: your affair with ${Persons.fullName(lover.person)} fades, as such things do.`, type: 'neutral' })
        continue
      }
      if (!interval || y < lover.nextChildYear) continue
      this._makeChild(lover.person)
      lover.nextChildYear = y + this._randRange(interval)
      if (f.spouse && f.tolerant) this._changeAffection(AFFAIR_TOLERATED_AFFECTION)
      else if (f.spouse && !f.duel && Math.random() < DISCOVERY_ON_LOVER_CHILD) this._discoverAffair(lover, true)
    }
    // Yearly discovery roll per lover while married (at most one discovery per year).
    if (f.spouse && !f.tolerant && !f.duel) {
      const found = f.lovers.find(() => Math.random() < DISCOVERY_PER_LOVER_YEAR)
      if (found) this._discoverAffair(found, false)
    }

    // Marriage events: one pending at a time (never expires), none while a duel is pending.
    if (f.spouse && !f.event && !f.duel) {
      if (f.nextEventYear == null) {
        f.nextEventYear = y + this._randRange(MARRIAGE_EVENT_YEARS)
      } else if (y >= f.nextEventYear) {
        const ev = this._rollMarriageEvent()
        f.event = { ...ev, year: yr, child: this._youngestChild()?.given || null }
        f.nextEventYear = null
        const def = this.marriageEventDef(f.event)
        this.addEvent({ text: `Year ${yr}: ${def.title} — ${this.familyText(def.text, f.event)}`, type: ev.crisis ? 'negative' : 'neutral' })
        this._emit('marriage_event', { id: ev.id, crisis: ev.crisis })
      }
    }

    // 2.6c: a tournament whose field shrank to one (a runaway / a death between rounds) ends with that child.
    if (f.tournament && f.tournament.pool.length === 1) this._finishTournament()

    // 2.6b: child events — one pending at a time (never expires), for a child old enough to have a story.
    if (!f.childEvent) {
      const eligible = this._homeChildren().filter(c => this._childAge(c) >= CHILD_EVENT_MIN_AGE)
      if (!eligible.length) f.nextChildEventYear = null
      else if (f.nextChildEventYear == null) f.nextChildEventYear = y + this._randRange(CHILD_EVENT_YEARS)
      else if (y >= f.nextChildEventYear) {
        const ev = this._rollChildEvent(eligible)
        f.childEvent = { ...ev, year: yr }
        f.nextChildEventYear = null
        const def = this.childEventDef(f.childEvent)
        this.addEvent({ text: `Year ${yr}: ${def.title} — ${this.familyText(def.text, f.childEvent)}`, type: ev.crisis ? 'negative' : 'neutral' })
        this._emit('child_event', { id: ev.id, crisis: ev.crisis })
      }
    }

    // Proposals: only unmarried and past PROPOSAL_MIN_STAGE. A pending proposal never expires.
    if (!f.spouse && !f.proposal && (s.maxStageThisLife || 0) >= PROPOSAL_MIN_STAGE) {
      if (f.nextProposalYear == null) {
        f.nextProposalYear = y + this._randRange(PROPOSAL_FIRST_DELAY_YEARS)
      } else if (y >= f.nextProposalYear) {
        const n = this._randInt(PROPOSAL_SUITORS)
        const suitors = []
        for (let i = 0; i < n; i++) suitors.push(this._rollStranger('suitor'))
        f.proposal = { suitors, year: yr }
        f.nextProposalYear = null
        this.addEvent({ text: `Year ${yr}: a matchmaker arrives with ${n === 1 ? 'a proposal' : `${n} proposals`} of marriage.`, type: 'special' })
        this._emit('proposal', { count: n })
      }
    }

    // 2.6e: while you hold the head seat, a rival with a real shot may call you out — one pending at a time.
    const clan = this._playerClan()
    if (clan && this.isClanHead() && !f.headChallenge) {
      if (f.nextChallengerYear == null) f.nextChallengerYear = y + this._randRange(CHALLENGER_EVENT_YEARS)
      else if (y >= f.nextChallengerYear) {
        f.nextChallengerYear = y + this._randRange(CHALLENGER_EVENT_YEARS)
        const ch = Math.random() < CHALLENGER_EVENT_CHANCE ? this._pickChallenger(clan) : null
        if (ch) {
          f.headChallenge = { challengerId: ch.id, year: yr }
          this.addEvent({ text: `Year ${yr}: ${Persons.fullName(ch)} strides into the hall and calls you out for the head seat.`, type: 'negative' })
          this._emit('head_challenge', { id: ch.id })
        }
      }
    }

    // 2.6e: while an NPC leads (not you), they may eventually tire of the seat — anyone adult may join the
    // tournament that follows, you included.
    if (clan && clan.headId && clan.headId !== s.self.id && !f.stepDownOffer) {
      if (f.nextStepDownYear == null) f.nextStepDownYear = y + this._randRange(STEPDOWN_CHECK_YEARS)
      else if (y >= f.nextStepDownYear) {
        f.nextStepDownYear = y + this._randRange(STEPDOWN_CHECK_YEARS)
        const head = s.world.persons[clan.headId]
        if (head) {
          const reign = Math.max(0, yr - (head.headSince ?? yr))
          const chance = (STEPDOWN_CHANCE[head.parentingStyle] ?? 0.15) + reign * STEPDOWN_REIGN_YEARS_MULT
          if (Math.random() < Math.min(0.9, chance)) {
            const entrants = this._stepDownEntrants(clan, clan.headId)
            if (entrants.length >= 2) {
              const eligible = entrants.some(p => p.id === s.self.id)
              f.stepDownOffer = { headId: clan.headId, year: yr, entrantIds: entrants.map(p => p.id), eligible }
              this.addEvent({ text: `Year ${yr}: worn down by ${reign} years in the seat, ${Persons.fullName(head)} lets the head seat stand open to any who can take it.`, type: 'special' })
              this._emit('stepdown_offer', {})
              // Only you get a say — if you're not eligible to enter, the tournament runs itself right away.
              if (!eligible) this.answerStepDown(false)
            }
          }
        }
      }
    }
  }


  _rollPersonality() { return Persons.rollPersonality() }

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

  // Phase 30 (M2 task 2.2): moved to renderer/engine/persons.js (Persons.rollRoot/specificRoot) so M4's
  // NPCs and M6's spouses/children can share the exact same generator. Kept as thin delegates — identical
  // draws, same call order — so every existing caller (buildDevSave, etc.) is unaffected.
  _rollRoot()             { return Persons.rollRoot() }
  _rollSpecificRoot(type) { return Persons.specificRoot(type) }

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
    this._ensurePhase33Fields()   // world first (2.6a) — self/clan roster below depend on it
    this._ensurePhase30Fields()
    this._ensurePhase16Fields()
    this._ensurePhase34Fields()   // Phase 31 (2.7a) — needs s.world.clans (33), reads maxStageThisLife/techniques
    const st = this._stage()

    // 1.8b-2 breakdowns: every term below is recorded as it is applied, so the Character view's "why" popovers
    // are built from the real math, never a UI re-derivation (scripts/sim/checks/breakdowns.js pins that the
    // parts multiply/add back to the totals). Parts: { label, op: 'base' | 'x' | '+', value }.
    const qpsParts = [{ label: `${st.realm} base`, op: 'base', value: st.baseQps }, { label: s.root.name.replace(/[\u3400-\u9fff]+/g, '').trim().replace(/^(?!.*root$)(.*)$/i, '$1 root'), op: 'x', value: s.root.mult }]
    const btParts  = [{ label: `${st.realm} base`, op: 'base', value: st.breakthroughChance }]
    const capParts = [{ label: `${st.realm} ${st.layer}`.trim(), op: 'base', value: st.qiCap }]
    const qMul = (label, m) => { qps *= m; if (m !== 1) qpsParts.push({ label, op: 'x', value: m }) }
    const bAdd = (label, v) => { btBonus += v; if (v) btParts.push({ label, op: '+', value: v }) }
    const cMul = (label, m) => { capMult *= m; if (m !== 1) capParts.push({ label, op: 'x', value: m }) }

    let qps = st.baseQps * s.root.mult
    for (const id of s.techniques) {
      const t = TECHNIQUES.find(t => t.id === id)
      if (t?.effect?.type === 'qps_mult') qMul(t.name, t.effect.value)
    }

    let btBonus = 0
    for (const id of s.techniques) {
      const t = TECHNIQUES.find(t => t.id === id)
      if (t?.effect?.type === 'breakthrough_bonus') bAdd(t.name, t.effect.value)
    }

    let capMult = 1
    for (const id of s.techniques) {
      const t = TECHNIQUES.find(t => t.id === id)
      if (t?.effect?.type === 'qi_cap_mult') cMul(t.name, t.effect.value)
    }

    // Equipped weapon bonuses
    const weapId = s.equipped.weapon
    if (weapId && ITEMS[weapId]) {
      const we = ITEMS[weapId].effect
      if (we.type === 'qps_mult')   qMul(ITEMS[weapId].name, we.value)
      if (we.type === 'void_blade') bAdd(ITEMS[weapId].name, we.bt_bonus)
    }

    // Equipped artifact bonuses
    const artId = s.equipped.artifact
    if (artId && ITEMS[artId]) {
      const ae = ITEMS[artId].effect
      if (ae.type === 'qps_mult')    qMul(ITEMS[artId].name, ae.value)
      if (ae.type === 'qi_cap_mult') cMul(ITEMS[artId].name, ae.value)
      if (ae.type === 'bt_bonus')    bAdd(ITEMS[artId].name, ae.value)
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
    qMul('Soul-bonded beasts', beastQpsMult)
    qps += beastPassiveQps
    if (beastPassiveQps) qpsParts.push({ label: 'Qi-devouring beasts', op: '+', value: beastPassiveQps })
    bAdd('Beast instinct', beastBtBonus)

    // Sect bonuses (Phase 4) — suppressed for a while after the sect loses a member war (Phase 5C)
    const sectBuffSuppressed = s.sectWar.side === 'member' && Date.now() < (s.sectWar.buffSuppressedUntil || 0)
    const sectFx = sectBuffSuppressed ? {} : (this._sectDef()?.effects || {})
    const sectName = this._sectDef()?.name || 'Sect'
    if (sectFx.qps_mult)                 qMul(sectName, sectFx.qps_mult)
    if (sectFx.weapon_qps_mult && weapId) qMul(`${sectName} (weapon)`, sectFx.weapon_qps_mult)
    if (sectFx.artifact_qps_mult && artId) qMul(`${sectName} (artifact)`, sectFx.artifact_qps_mult)
    if (sectFx.bt_bonus)                 bAdd(sectName, sectFx.bt_bonus)

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
    qMul('Disciples’ offerings', 1 + discQi)

    // Phase 31 (M2 tasks 2.7d/2.7e, clan-succession.md §2.7): Ancestral catch-up below the clan's best-reached
    // stage, Refined Meridians (permanent, any stage) and the Ancestor Blessing (permanent, unconditional —
    // not gated by catch-up). None of these apply to an orphan life (no clan).
    const legacyClan = this._playerClan()
    const inCatchUp = !!(legacyClan && s.stageIndex < legacyClan.bestStageIndex)
    let catchUpBtBonus = 0
    if (legacyClan) {
      if (inCatchUp) { qMul('Ancestral catch-up', CATCHUP_QPS_MULT); catchUpBtBonus = CATCHUP_BT_BONUS; btParts.push({ label: 'Ancestral catch-up', op: '+', value: CATCHUP_BT_BONUS }) }
      qMul('Refined Meridians', 1 + this._legacyValue(legacyClan, 'refined_meridians'))
      qMul('Ancestor Blessing', 1 + (legacyClan.blessingStacks || 0) * ANCESTOR_BLESSING_QPS)
    }

    // Family (docs/systems/family.md): a Devoted spouse steadies your breakthroughs; a betrayed one
    // sabotages the next attempt (cleared by attemptBreakthrough()).
    const fam = s.family
    if (fam?.spouse && fam.affection >= AFFECTION_DEVOTED) bAdd('Devoted spouse', DEVOTED_BT_BONUS)
    if (fam?.btSabotage) bAdd('Spouse’s sabotage', -SABOTAGE_BT_MALUS)
    if (s.karma) btParts.push({ label: 'Karma', op: '+', value: s.karma / 1000 })

    // Pill preview bonus (for display only — consumed at BT attempt time)
    let pillBtPreview = 0
    if (s.activePill && ITEMS[s.activePill]) {
      const pe = ITEMS[s.activePill].effect
      if (pe.type === 'bt_bonus')    pillBtPreview = pe.value
      if (pe.type === 'bt_guarantee') pillBtPreview = 1
    }

    const baseChance = Math.min(0.98, Math.max(sectFx.bt_floor || 0, st.breakthroughChance + btBonus + catchUpBtBonus + s.karma / 1000))

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
      catchUp:          inCatchUp,   // Phase 31 (2.7e): below the clan's best-reached stage
      catchUpUntil:     inCatchUp ? legacyClan.bestStageIndex : null,
      // 1.8b-2: the terms behind qiPerSecond / breakthroughChance / qiCap (see top of _recalc)
      breakdown: {
        qps: qpsParts, bt: btParts, cap: capParts,
        btFloor: sectFx.bt_floor || 0, btPill: pillBtPreview, btRaw: st.breakthroughChance + btBonus + catchUpBtBonus + s.karma / 1000,
      },
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
    if (!s || s.interlude) return   // 2.6d: between lives the clock stops until the player chooses

    // Phase 30 (M2 task 2.3): game clock. Age/gameYear advance ONLY here — never in initSlot()/offline
    // catch-up (life-loop.md pillar 4; §10 gotcha: "open" means the process is running, tray included,
    // since Phase 9A keeps ticking while hidden — only the app not running at all skips aging).
    // Age is a stat only — nothing dies of age (user decision 2026-09-26).
    const years = dt * GAME_YEARS_PER_OPEN_HOUR / 3600
    const prevYear = Math.floor(s.world.year)
    s.age      += years
    s.world.year += years
    if (Math.floor(s.world.year) !== prevYear) this._tickFamily()   // Phase 16-lite (M2 task 2.5)

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
    // Family sabotage lasts one attempt; derived.breakthroughChance already includes it for this roll.
    if (s.family) s.family.btSabotage = false

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

    const prevRealm = CULTIVATION_STAGES[s.stageIndex].realm
    s.stageIndex++
    s.qi    = 0
    s.karma = Math.min(100, s.karma + 10)
    s.stats.breakthroughs++
    s.maxStageThisLife = Math.max(s.maxStageThisLife || 0, s.stageIndex)
    if (s.banter) s.banter.failStreak = 0
    // Phase 31 (M2 task 2.7b): realm firsts + live bestStageIndex, so a still-living sibling gets ancestral
    // catch-up immediately, not only once this life ends.
    const newRealm = CULTIVATION_STAGES[s.stageIndex].realm
    if (newRealm !== prevRealm && REALM_FIRST_ID[newRealm]) this._claimFirst(REALM_FIRST_ID[newRealm])
    const clan = this._playerClan()
    if (clan) clan.bestStageIndex = Math.max(clan.bestStageIndex, s.stageIndex)
    this._recalc(); this._notify()
    this._emit('bt_success')
    return { success: true, newStage: this._stage() }
  }

  // ── Phase 30 (M2 task 2.3): Pass the Mantle ────────────────────────────────
  // Ends the life peacefully, any time — the player's way to move to the next generation, since nothing
  // dies of age (life-loop.md §9.3; twilight/Final Seclusion removed 2026-09-26). Routed through the
  // regular _die() → the 2.6d interlude (heir bet, reign chronicle, rebirth choice).
  passTheMantle() {
    this._die('passed_mantle')
    return { ok: true }
  }

  // ── Phase 16-lite (M2 task 2.5): Marriage ──────────────────────────────────

  acceptSuitor(personId) {
    const s = this._s, f = s.family
    if (f.spouse)    return { ok: false, reason: 'married' }
    if (!f.proposal) return { ok: false, reason: 'no_proposal' }
    const suitor = f.proposal.suitors.find(p => p.id === personId)
    if (!suitor) return { ok: false, reason: 'unknown' }
    const y = s.world.year
    const spouse = { ...suitor, role: 'spouse', spouseIds: [...(suitor.spouseIds || []), s.self.id] }
    s.self.spouseIds = [...(s.self.spouseIds || []), spouse.id]
    f.spouse          = spouse
    f.marriedYear     = Math.floor(y)
    f.spouseStageYear = y
    f.proposal        = null
    f.nextProposalYear = null
    f.nextChildYear   = this._childInterval() ? y + this._randRange(FIRST_CHILD_YEARS) : null   // 2.6b planning
    f.affection       = AFFECTION_START + (spouse.personality === s.personality?.id ? AFFECTION_SAME_PERSONALITY : 0)
    f.tolerant        = false
    f.nextEventYear   = null
    this.addEvent({ text: `Year ${Math.floor(y)}: ${s.name} and ${Persons.fullName(spouse)} are wed. Two paths become one.`, type: 'special' })
    this._claimFirst('married')
    this._recalc(); this._notify()
    this._emit('married', { spouse: spouse.given })
    return { ok: true, spouse }
  }

  // "Decline all" — "Decide later" is UI-only (the proposal just stays pending; it never expires).
  declineProposal() {
    const s = this._s, f = s.family
    if (!f.proposal) return { ok: false, reason: 'no_proposal' }
    f.proposal = null
    f.nextProposalYear = s.world.year + this._randRange(PROPOSAL_RETRY_YEARS)
    this.addEvent({ text: `The matchmaker leaves disappointed. Perhaps in a few decades.`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  // ── Family depth (docs/systems/family.md): marriage events + duel ─────────

  // Answers the pending marriage/crisis event. Affection delta is keyed by the SPOUSE's personality.
  resolveMarriageEvent(i) {
    const s = this._s, f = s.family
    if (!f.spouse || !f.event) return { ok: false, reason: 'no_event' }
    const def = this.marriageEventDef(f.event)
    const ch  = def?.choices?.[i]
    if (!ch) return { ok: false, reason: 'bad_choice' }
    const cost = this.familyCost(ch)
    if (s.spiritStones < cost) return { ok: false, reason: 'cant_afford' }
    const ctx = f.event
    s.spiritStones -= cost
    this._applyFamilyEffect(ch.effect)
    const delta = this._changeAffection(ch.aff ? (ch.aff[f.spouse.personality] ?? ch.aff.default ?? 0) : 0)
    f.lastEventId = f.event.id
    f.event = null
    if (ctx.crisis) f.tally.crises++; else f.tally.events++
    const who = f.spouse.given
    const heart = delta ? ` (${who} ♥${delta > 0 ? '+' : ''}${Math.round(delta)})` : ''
    if (ch.result) this.addEvent({ text: this.familyText(`${def.title}: ${ch.result}${heart}`, ctx), type: delta < 0 ? 'negative' : 'positive' })

    let outcome = null
    if (ch.outcome === 'forgive') {
      this._changeAffection(FORGIVE_AFFECTION); outcome = 'forgiven'
    } else if (ch.outcome === 'duel') {
      f.duel = { year: Math.floor(s.world.year), reason: 'betrayal' }; outcome = 'duel'
      this._noteEnemy({ kind: 'person', personId: f.spouse.id, name: Persons.fullName(f.spouse), surname: f.spouse.family, why: 'betrayed you' })   // 2.6d
      this._emit('duel', { spouse: Persons.fullName(f.spouse) })
    } else if (ch.outcome === 'divorce') {
      this._spouseEnds('divorced', `you and ${Persons.fullName(f.spouse)} part ways. The marriage is over.`); outcome = 'divorced'
    } else if (ch.outcome === 'let_go') {
      this._spouseEnds('left', `${Persons.fullName(f.spouse)} walks down the mountain and does not look back.`); outcome = 'left'
    } else if (ch.outcome === 'beg') {
      if (Math.random() < BEG_STAY_CHANCE) {
        f.affection = BEG_STAY_AFFECTION; outcome = 'stayed'
        this.addEvent({ text: `${who} sets down the bags. They will stay — for now.`, type: 'positive' })
      } else {
        this._spouseEnds('left', `${Persons.fullName(f.spouse)} hears you out, then leaves anyway.`); outcome = 'left'
      }
    }
    this._recalc(); this._notify()
    return { ok: true, affection: f.affection, outcome }
  }

  // ── Family depth (family.md): lovers ───────────────────────────────────────

  // Seduce the i-th pending expedition encounter (SEDUCE_CHANCE). Success starts an ongoing affair.
  seduceEncounter(i) {
    const s = this._s, f = s.family, enc = f.encounters[i]
    if (!enc) return { ok: false, reason: 'unknown' }
    f.encounters.splice(i, 1)
    const name = Persons.fullName(enc.person), y = s.world.year
    const success = Math.random() < SEDUCE_CHANCE
    if (success) {
      f.lovers.push({ person: { ...enc.person, role: 'lover' }, since: Math.floor(y), nextChildYear: y + this._randRange(FIRST_CHILD_YEARS),   // births still gated by planning
                      endsYear: y + this._randRange(AFFAIR_YEARS) })
      f.tally.affairs++
      this.addEvent({ text: `You and ${name} begin an affair${f.spouse ? ', out of your spouse\'s sight' : ''}.`, type: 'special' })
    } else {
      this.addEvent({ text: `${name} laughs, not unkindly, and walks on alone.`, type: 'neutral' })
    }
    this._recalc(); this._notify()
    return { ok: true, success }
  }

  dismissEncounter(i) {
    const f = this._s.family
    if (!f.encounters[i]) return { ok: false, reason: 'unknown' }
    f.encounters.splice(i, 1)
    this._notify()
    return { ok: true }
  }

  // Ends an affair. Children already born stay yours.
  endAffair(personId) {
    const s = this._s, f = s.family
    const idx = f.lovers.findIndex(l => l.person.id === personId)
    if (idx < 0) return { ok: false, reason: 'unknown' }
    const [lover] = f.lovers.splice(idx, 1)
    this.addEvent({ text: `You end things with ${Persons.fullName(lover.person)}.`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  // ── 2.6b (clan-succession.md): Family Planning + child events ──────────────

  // 'none' | 'some' | 'many'. Turning children back on schedules the next birth from now (FIRST_CHILD_YEARS)
  // for the spouse and every lover, so no backlog of "overdue" births lands at once.
  setFamilyPlanning(plan) {
    const s = this._s, f = s.family
    if (!(plan in CHILD_INTERVAL_BY_PLAN)) return { ok: false, reason: 'invalid' }
    const wasOff = !this._childInterval()
    f.planning = plan
    if (wasOff && this._childInterval()) {
      const y = s.world.year
      if (f.spouse) f.nextChildYear = y + this._randRange(FIRST_CHILD_YEARS)
      for (const l of f.lovers) l.nextChildYear = y + this._randRange(FIRST_CHILD_YEARS)
    }
    this._notify()
    return { ok: true }
  }

  // Answers the pending child event. Bond is keyed by the CHILD's personality; morality/train/favor apply to
  // that child (favor: every other home child loses FAVOR_SIBLING_PENALTY bond).
  resolveChildEvent(i) {
    const s = this._s, f = s.family, ev = f.childEvent
    if (!ev) return { ok: false, reason: 'no_event' }
    const child = f.children.find(c => c.id === ev.childId)
    const def = this.childEventDef(ev), ch = def?.choices?.[i]
    if (!child || !ch) return { ok: false, reason: 'bad_choice' }
    const cost = this.familyCost(ch)
    if (s.spiritStones < cost) return { ok: false, reason: 'cant_afford' }
    s.spiritStones -= cost
    this._applyFamilyEffect(ch.effect)
    const before = child.bond
    child.bond = Math.max(0, Math.min(100, child.bond + (ch.bond ? (ch.bond[child.personality] ?? ch.bond.default ?? 0) : 0)))
    if (ch.morality) child.morality = Math.max(-100, Math.min(100, child.morality + ch.morality))
    if (ch.train) { child.xp += ch.train; this._growChild(child, Math.min(SPOUSE_STAGE_CAP, s.stageIndex)) }
    if (ch.favor) for (const o of this._homeChildren()) if (o !== child) o.bond = Math.max(0, o.bond - FAVOR_SIBLING_PENALTY)
    f.childEvent = null
    f.lastChildEventId = ev.id
    f.tally.childEvents++
    let outcome = null
    if (ch.outcome === 'fetch') {
      child.bond = Math.min(100, child.bond + CHILD_FETCH_BOND); outcome = 'fetched'
    } else if (ch.outcome === 'estrange') {
      child.estranged = true; child.leftYear = Math.floor(s.world.year); f.tally.runaways++; outcome = 'estranged'
    }
    const delta = child.bond - before
    const heart = delta ? ` (${child.given} ♥${delta > 0 ? '+' : ''}${Math.round(delta)})` : ''
    if (ch.result) this.addEvent({ text: this.familyText(`${def.title}: ${ch.result}${heart}`, ev), type: delta < 0 || outcome === 'estranged' ? 'negative' : 'positive' })
    this._recalc(); this._notify()
    return { ok: true, bond: child.bond, outcome }
  }

  // ── 2.6c (clan-succession.md): heirs + the Tournament of Heirs ─────────────

  // Children who could be named heir / enter a tournament.
  eligibleHeirs() { return this._s.family.children.filter(c => this._heirEligible(c)) }

  chooseHeir(childId) {
    const f = this._s.family
    if (f.tournament) return { ok: false, reason: 'tournament' }
    if (!this.isClanHead()) return { ok: false, reason: 'not_head' }   // 2.6d: only the head names an heir
    const c = f.children.find(x => x.id === childId)
    if (!c) return { ok: false, reason: 'unknown' }
    if (!this._heirEligible(c)) return { ok: false, reason: 'not_eligible' }
    f.heirId = c.id
    this.addEvent({ text: `${Persons.fullName(c)} is named heir to the clan.`, type: 'special' })
    this._notify()
    return { ok: true, heir: c }
  }

  clearHeir() {
    this._s.family.heirId = null
    this._notify()
    return { ok: true }
  }

  // Rounds are lethal while the field is larger than TOURNAMENT_TOP, and a lethal round never takes it below
  // TOURNAMENT_TOP; after that, non-lethal knockout to one winner.
  tournamentInfo() {
    const t = this._s.family.tournament
    if (!t) return null
    const n = t.pool.length, lethal = n > TOURNAMENT_TOP
    return { round: t.round, n, lethal, fights: lethal ? Math.min(Math.floor(n / 2), n - TOURNAMENT_TOP) : Math.floor(n / 2),
             pool: [...t.pool], eliminated: [...t.eliminated], fightsDone: t.fightsDone }
  }

  startTournament() {
    const s = this._s, f = s.family
    if (f.tournament) return { ok: false, reason: 'already' }
    if (!this.isClanHead()) return { ok: false, reason: 'not_head' }   // 2.6d: only the head hosts one
    const entrants = this.eligibleHeirs()
    if (entrants.length < 2) return { ok: false, reason: 'too_few' }
    f.tournament = { year: Math.floor(s.world.year), round: 1, pool: entrants.map(c => c.id), eliminated: [],
                     lethalFought: false, fightsDone: 0 }
    this.addEvent({ text: `Year ${Math.floor(s.world.year)}: ${entrants.length} of your children enter the Tournament of Heirs.`, type: 'special' })
    this._emit('tournament_start', { n: entrants.length })
    this._notify()
    return { ok: true, entrants: entrants.length }
  }

  // Only before the first fight — once blood is spilled, it runs to the end.
  cancelTournament() {
    const f = this._s.family
    if (!f.tournament) return { ok: false, reason: 'no_tournament' }
    if (f.tournament.fightsDone > 0) return { ok: false, reason: 'begun' }
    f.tournament = null
    this.addEvent({ text: 'You call off the Tournament of Heirs before the first blow.', type: 'neutral' })
    this._notify()
    return { ok: true }
  }

  _fightPower(c) {
    return c.stageIndex * 100 + Math.round((c.root?.mult || 1) * 10) + (TOURNAMENT_PERSONALITY_POWER[c.personality] || 0) +
           (Math.random() * 2 - 1) * TOURNAMENT_LUCK
  }

  // pairs: [[idA, idB], …] — exactly tournamentInfo().fights of them, every id in the pool at most once.
  fightTournamentRound(pairs) {
    const s = this._s, f = s.family, info = this.tournamentInfo()
    if (!info) return { ok: false, reason: 'no_tournament' }
    if (!Array.isArray(pairs) || pairs.length !== info.fights) return { ok: false, reason: 'bad_pairs' }
    const seen = new Set()
    for (const p of pairs) {
      if (!Array.isArray(p) || p.length !== 2 || p[0] === p[1]) return { ok: false, reason: 'bad_pairs' }
      for (const id of p) { if (!info.pool.includes(id) || seen.has(id)) return { ok: false, reason: 'bad_pairs' }; seen.add(id) }
    }
    const t = f.tournament, yr = Math.floor(s.world.year), lethal = info.lethal, results = []
    const kid = id => f.children.find(c => c.id === id)
    for (const [ia, ib] of pairs) {
      const a = kid(ia), b = kid(ib)
      const pa = this._fightPower(a), pb = this._fightPower(b)
      const aWins = Math.random() < 1 / (1 + Math.exp(-(pa - pb) / TOURNAMENT_SPREAD))
      const win = aWins ? a : b, lose = aWins ? b : a
      let died = false, yielded = false
      if (lethal) {
        if (lose.personality === 'coward' && Math.random() < TOURNAMENT_COWARD_YIELD) yielded = true
        else {
          died = true
          lose.alive = false; lose.diedYear = yr; lose.cause = 'tournament'
          f.tally.tournamentDeaths++
          s.karma = Math.max(0, s.karma + TOURNAMENT_KARMA_PER_DEATH)
          if (f.spouse && (lose.parents || []).includes(f.spouse.id)) this._changeAffection(TOURNAMENT_SPOUSE_AFFECTION_PER_DEATH)
        }
      }
      t.pool = t.pool.filter(id => id !== lose.id)
      t.eliminated.push({ id: lose.id, round: t.round, died, yielded, stage: lose.stageIndex })
      t.fightsDone++
      const how = died ? `${lose.given} falls and does not rise` : yielded ? `${lose.given} throws down their sword and yields` : `${lose.given} is beaten`
      const text = `Round ${t.round}: ${Persons.fullName(win)} defeats ${Persons.fullName(lose)} — ${how}.`
      this.addEvent({ text, type: died ? 'negative' : 'neutral' })
      results.push({ a: ia, b: ib, winner: win.id, loser: lose.id, died, yielded, text })
    }
    if (lethal) {
      t.lethalFought = true
      // Everyone who lived through a lethal round carries it — fighters, yielders and those who sat it out and
      // watched (trauma → the Bloodline bonus if they become head). Applied once per child.
      for (const c of f.children.filter(x => x.alive && (t.pool.includes(x.id) || t.eliminated.some(e => e.id === x.id && e.yielded)))) {
        if (!c.trauma) { c.trauma = true; c.bond = Math.max(0, Math.min(100, c.bond + (TOURNAMENT_RUTHLESS.includes(c.personality) ? 5 : TOURNAMENT_SURVIVOR_BOND))) }
      }
    }
    t.round++
    let done = false
    if (t.pool.length === 1) { this._finishTournament(); done = true }
    this._recalc(); this._notify()
    return { ok: true, results, done, heirId: done ? f.heirId : null, lethal }
  }

  // Winner = heir. Ranking: winner, then later eliminations first (ties: higher stage); places 2–4 → branch founders.
  _finishTournament() {
    const s = this._s, f = s.family, t = f.tournament
    if (!t || t.pool.length !== 1) return
    const winner = f.children.find(c => c.id === t.pool[0])
    const rest = [...t.eliminated].sort((x, y) => (y.round - x.round) || (y.stage - x.stage)).map(e => e.id)
    const ranking = [winner.id, ...rest]
    const deaths = t.eliminated.filter(e => e.died).length
    f.heirId = winner.id
    f.lastTournament = { year: t.year, ranking: ranking.slice(0, TOURNAMENT_TOP), entrants: ranking.length, deaths, lethal: t.lethalFought }
    f.tally.tournaments++
    const clan = this._playerClan()
    if (clan && t.lethalFought) clan.tradition.lethalTournaments++
    f.tournament = null
    this.addEvent({ text: `The Tournament of Heirs is over. ${Persons.fullName(winner)} stands alone${deaths ? `, and ${deaths} of your children do not stand at all` : ''}. ${winner.given} is your heir.`, type: 'special' })
    this._emit('tournament_end', { heir: winner.given, deaths })
  }

  // Chance to win a duel against your spouse: 0.5 + 0.08 per stage you're ahead, clamped.
  duelChance() {
    const s = this._s, sp = s.family.spouse
    if (!sp) return 0
    return Math.max(DUEL_WIN_RANGE[0], Math.min(DUEL_WIN_RANGE[1], DUEL_BASE_WIN + DUEL_WIN_PER_STAGE * (s.stageIndex - sp.stageIndex)))
  }

  // 'flee' ends the marriage; 'fight' is to the death — yours (life ends) or theirs.
  resolveDuel(choice) {
    const s = this._s, f = s.family
    if (!f.spouse || !f.duel) return { ok: false, reason: 'no_duel' }
    if (choice !== 'fight' && choice !== 'flee') return { ok: false, reason: 'bad_choice' }
    const name = Persons.fullName(f.spouse)
    if (choice === 'flee') {
      f.tally.fled++
      this._spouseEnds('left', `you lower your sword and leave. ${name} does not follow.`)
      this._recalc(); this._notify()
      return { ok: true, outcome: 'fled', chance: 0 }
    }
    const chance = this.duelChance()
    if (Math.random() < chance) {
      f.tally.duelWon++
      s.health = Math.max(1, (s.health ?? 100) - DUEL_WIN_HEALTH_COST)
      this._spouseEnds('duel', `the duel ends in the courtyard. ${name} does not rise. You carry the wound, and the silence.`)
      this._recalc(); this._notify()
      return { ok: true, outcome: 'won', chance }
    }
    f.tally.duelLost++
    this.addEvent({ text: `Year ${Math.floor(s.world.year)}: ${name}'s blade is faster. Your path ends in your own courtyard.`, type: 'negative' })
    this._die('spouse_duel')
    return { ok: true, outcome: 'lost', chance }
  }

  // ── Phase 23A/B/C: Health, Bloodline Quality, Ascension Trial ──────────────

  // Hidden from the player except on the Ascension screen and after the first attempt (Phase 23B).
  // 1.8b-2: the Ascension Trial's terms, same math as ascensionChance() (checks/breakdowns.js pins the sum).
  ascensionBreakdown() {
    const s = this._s
    const bq = s.bloodlineQuality || 0
    const parts = [{ label: 'Heaven’s mercy', op: 'base', value: ASCENSION_BASE_CHANCE },
                   { label: `Bloodline ${Math.round(bq)}`, op: '+', value: bq * ASCENSION_BQ_COEF }]
    parts.push({ label: 'Integrity at 100', op: '+', value: (s.realmIntegrity ?? 100) >= 100 ? ASCENSION_PREP_INTEGRITY : 0, want: ASCENSION_PREP_INTEGRITY })
    parts.push({ label: 'Health at 100',    op: '+', value: (s.health ?? 100) >= 100 ? ASCENSION_PREP_HEALTH : 0, want: ASCENSION_PREP_HEALTH })
    return { parts, cap: ASCENSION_CHANCE_CAP, total: this.ascensionChance() }
  }

  // 1.8b-2: what a failed breakthrough would cost right now (mirrors attemptBreakthrough's failure branch).
  btFailPreview() {
    const s = this._s
    const pe = s.activePill && (s.inventory[s.activePill] || 0) > 0 ? ITEMS[s.activePill]?.effect : null
    let qiKeep = 0.5
    if (pe?.type === 'qi_loss_reduce') qiKeep = 0.5 + 0.5 * pe.value
    if (pe?.qi_loss_reduce != null)    qiKeep = 0.5 + 0.5 * pe.qi_loss_reduce
    const activeKeep = s.playMode === 'active'
    if (activeKeep) qiKeep = Math.min(1, qiKeep + ACTIVE_BT_QI_LOSS_BONUS)
    const integ = s.realmIntegrity ?? 100
    let after = Math.max(0, integ - 20)
    if (pe?.integrity_restore) after = Math.min(100, after + pe.integrity_restore)
    return {
      guaranteed: pe?.type === 'bt_guarantee',
      qiLossFrac: 1 - qiKeep, activeKeep, pillSoftens: qiKeep > (activeKeep ? 0.5 + ACTIVE_BT_QI_LOSS_BONUS : 0.5),
      karmaLoss: Math.min(8, s.karma), integrityLoss: integ - after, integrityAfter: after,
      demotes: after <= 0 && s.stageIndex > 0,
    }
  }

  // 1.8b-2: Integrity + Health explained — regen rates and what can hurt them, from the same constants tick() uses.
  vitalsInfo() {
    const s = this._s
    const expectedTier = 1 + Math.floor(s.stageIndex / 5)
    const risky = LOCATIONS.filter(l => s.stageIndex >= (l.minStage || 0) && l.enemyTier > expectedTier)
      .map(l => { const o = l.enemyTier - expectedTier; return { name: l.name, chance: Math.min(1, EXPEDITION_INJURY_CHANCE_PER_TIER * o), dmg: EXPEDITION_INJURY_BASE + EXPEDITION_INJURY_PER_TIER * o } })
    return {
      integrity: { value: s.realmIntegrity ?? 100, regenSeconds: 30 / (s.derived?.integrityRegenMult || 1), failLoss: 20, demoteResetTo: 60 },
      health: {
        value: s.health ?? 100, regenSeconds: HEALTH_REGEN_SECONDS, regenAmount: HEALTH_REGEN_AMOUNT,
        risky, warChance: WAR_INJURY_CHANCE, warDmg: WAR_INJURY_AMOUNT, duelCost: DUEL_WIN_HEALTH_COST,
      },
    }
  }

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
    this._claimFirst('asc_attempt')   // Phase 31 (2.7b): pays once per clan, every attempt after the first is a no-op

    if (Math.random() < chance) {
      s.stageIndex++
      s.qi       = 0
      s.ascended = true
      s.maxStageThisLife = s.stageIndex
      s.stats.ascensions++
      this._claimFirst('ascended')
      const clan = this._playerClan()
      if (clan) {
        clan.bestStageIndex = Math.max(clan.bestStageIndex, s.stageIndex)
        clan.ascendedAncestors++
        clan.blessingStacks = Math.min(ANCESTOR_BLESSING_QPS_MAX, clan.blessingStacks + 1)
      }
      const newStage = this._stage()
      // Phase 31 (M2 task 2.7d): a successful Ascension ENDS the life — an Ascended Ancestor, not a character
      // left idling at an unreachable stub stage. Routes through the same interlude/rebirth flow as any other
      // death (fixes the post-Ascension dead zone: bloodline.md/life-loop.md's long-flagged gap).
      this._die('ascended')
      return { success: true, chance, ascended: true, newStage }
    }

    this._die('ascension_failed')
    return { success: false, reason: 'died', chance }
  }

  // Public so cultivation.js (random events) can check for health-related death after mutating s.health.
  checkDeath(cause = 'event') {
    if ((this._s.health ?? 100) <= 0) { this._die(cause); return true }
    return false
  }

  // Ends the current life: grows the family's Bloodline Quality from what this life achieved, records the life in
  // the world (2.6a), then starts an UNBORN next life held in s.interlude (2.6d, clan-succession.md): the heir bet
  // (if the clan must pick), the heir's reign + chronicle, then clan-or-orphan → _beginLife(). Every life still
  // reincarnates as a "new soul" for Bloodline carry (BLOODLINE_CARRY_NEW_SOUL); the heir term is added when the
  // new head is known (_beginLife), because it's whoever actually takes the seat.
  _die(cause) {
    const s = this._s
    if (s.interlude) return   // already between lives
    const maxStage  = Math.max(s.maxStageThisLife || 0, s.stageIndex)
    // Phase 9B: fired before this._s is replaced so a listener can still read the dying life's stage.
    this._emit('death', { cause, maxStage })
    const selfTerm  = Math.pow(maxStage / (CULTIVATION_STAGES.length - 1), 2)
    // Phase 16-lite: partner term — the current spouse, else the last former spouse this life (family.md).
    const fam       = s.family || {}
    const partner   = fam.spouse || (fam.formerSpouses || [])[(fam.formerSpouses || []).length - 1] || null
    const spouseMaxStage = partner ? partner.maxStage || 0 : 0
    const partnerTerm = Math.pow(spouseMaxStage / (CULTIVATION_STAGES.length - 1), 2)
    const growth    = BLOODLINE_G_BASE + BLOODLINE_G_SELF * selfTerm + BLOODLINE_G_PARTNER * partnerTerm
    const parentBQ  = s.bloodlineQuality || 0
    const baseBQ    = parentBQ * BLOODLINE_CARRY_NEW_SOUL + growth
    const priorGen  = s.generation || 1
    const priorDeaths = s.deaths || 0
    const settings    = s.settings
    const warOrders   = s.warOrders   // standing orders belong to the player, not the life (Phase 32)
    const playMode    = s.playMode    // Active/Idle mode + automation belong to the player, not the life (Phase 22)
    const automation  = s.automation

    const summary = {
      cause, maxStageReached: maxStage, generation: priorGen,
      parentBloodlineQuality: parentBQ, newBloodlineQuality: Math.min(BLOODLINE_CAP, baseBQ), ts: Date.now(),
      // Phase 30 (M2 task 2.3): life-length metrics (sim + future UI). Additive only — existing
      // consumers (death overlay, sim dedupe) only ever read the keys above.
      openHours:  +(s.stats.timePlayed / 3600).toFixed(2),
      ageAtDeath: s.age,
      // Phase 16-lite (M2 task 2.5): family summary for the sim's Life Loop metrics.
      married:    !!partner,
      children:   (fam.children || []).length,
      childrenAlive: (fam.children || []).filter(c => c.alive).length,
      formerSpouses: (fam.formerSpouses || []).length,
      familyTally: fam.tally ? { ...fam.tally } : null,
      // 2.6b: how the children turned out
      childMaxStage: Math.max(0, ...(fam.children || []).filter(c => c.alive && !c.estranged).map(c => c.stageIndex || 0)),
      childMeanBond: (() => { const k = (fam.children || []).filter(c => c.alive && !c.estranged); return k.length ? k.reduce((a, c) => a + (c.bond ?? 50), 0) / k.length : null })(),
      childMeanMorality: (() => { const k = (fam.children || []).filter(c => c.alive); return k.length ? k.reduce((a, c) => a + (c.morality ?? 0), 0) / k.length : null })(),
      adultChildren: (fam.children || []).filter(c => c.alive && !c.estranged && s.world.year - c.bornYear >= ADULT_AGE).length,
      spouseMaxStage,
      growth,
      // 2.6c/2.6d: filled in by _beginLife() once the new head is known (heir = whoever takes the seat)
      heirStage: null, heirTrauma: false, heirKind: null, heirTerm: 0,
      tournamentDeaths: fam.tally?.tournamentDeaths || 0,
      wasHead: false, birth: null,
    }

    // 2.6a: the world survives. The dying life's person, spouse(s) and children are written into the registry
    // (living children and a living spouse stay on the clan roster — the succession below picks from them).
    const deadId = s.self.id
    const world = this._recordLifeInWorld(cause, maxStage, priorGen)
    const deathClan = this._playerClan(world)
    summary.wasHead = !!deathClan?.pendingSuccession?.wasHead
    this._s = this._newGame(world, true)
    this._s.bloodlineQuality  = Math.min(BLOODLINE_CAP, baseBQ)
    this._s.generation        = priorGen + 1
    this._s.deaths            = priorDeaths + 1
    this._s.lastReincarnation = summary
    this._s._baseBQ           = baseBQ   // the heir term is added on top in _beginLife()
    if (settings) this._s.settings = settings   // presentation prefs belong to the player, not the life
    if (warOrders) this._s.warOrders = warOrders
    if (playMode) this._s.playMode = playMode
    if (automation) this._s.automation = automation
    this._beginInterlude(cause, deadId)
    this._recalc(); this._notify()
  }

  // ── 2.6d (clan-succession.md): between lives — succession, reign, rebirth ─────────────────────────────

  // Coarse NPC growth up to `year` for every living person in the registry (never the living player, who isn't
  // in it). Stage progress only counts years past AWAKENING_AGE; capped at NPC_STAGE_CAP. No Math.random().
  _advancePersons(w, year) {
    for (const p of Object.values(w.persons)) {
      if (p.alive === false) continue
      const from = Math.max(p.grownYear ?? year, (p.bornYear ?? 0) + AWAKENING_AGE)
      p.grownYear = year
      if (year <= from || (p.stageIndex || 0) >= NPC_STAGE_CAP) continue
      p.npcXp = (p.npcXp || 0) + (year - from) * (p.root?.mult || 1) / NPC_YEARS_PER_STAGE
      const gain = Math.floor(p.npcXp)
      if (gain > 0) {
        p.npcXp -= gain
        p.stageIndex = Math.min(NPC_STAGE_CAP, (p.stageIndex || 0) + gain)
        p.maxStage = Math.max(p.maxStage || 0, p.stageIndex)
      }
    }
  }

  _clanMemberIds(clan) { return clan ? clan.lines.flatMap(l => l.memberIds) : [] }
  _lineOf(clan, personId) { return clan?.lines.find(l => l.memberIds.includes(personId)) || null }

  // Succession score: stage×100 (× SUCCESSION_BLOODY_STAGE_MULT when the clan's tradition is bloody) + root×10
  // + bond with the old head × SUCCESSION_BOND_WEIGHT.
  _successionScore(clan, p) {
    const bloody = (clan.tradition?.lethalTournaments || 0) > (clan.tradition?.peacefulSuccessions || 0)
    return (p.stageIndex || 0) * 100 * (bloody ? SUCCESSION_BLOODY_STAGE_MULT : 1) + Math.round((p.root?.mult || 1) * 10) +
           (p.bond ?? 50) * SUCCESSION_BOND_WEIGHT
  }

  // Who could follow `outgoingId`: their living adult children on the roster, else their minor children
  // (a regency), else any living adult of the clan, else anyone living in it. Sorted by score, best first.
  _successionCandidates(clan, outgoingId, year) {
    const w = this._s.world
    const alive = [...new Set(this._clanMemberIds(clan))].map(id => w.persons[id])
      .filter(p => p && p.alive !== false && !p.estranged && p.id !== outgoingId)
    const adult = p => year - (p.bornYear ?? 0) >= ADULT_AGE
    const kids = alive.filter(p => (p.parents || []).includes(outgoingId))
    const pool = kids.some(adult) ? kids.filter(adult) : kids.length ? kids : alive.some(adult) ? alive.filter(adult) : alive
    return pool.sort((a, b) => this._successionScore(clan, b) - this._successionScore(clan, a))
  }

  // Sets up s.interlude for the clan you died in (or, for an orphan death, the clan you last came from).
  _beginInterlude(cause, deadId) {
    const s = this._s, w = s.world, yr = Math.floor(w.year)
    const clan = this._playerClan(w) || (w.lastClanId && w.clans[w.lastClanId] && !w.clans[w.lastClanId].extinct ? w.clans[w.lastClanId] : null)
    const it = s.interlude = { step: 'bet', cause, year: yr, deadId, clanId: clan?.id || null, outgoingId: null,
      candidates: [], designatedId: null, heirKind: null, bet: null, betWon: null, successorId: null, spouseId: null,
      style: null, traumaPath: null, reignYears: 0, nChildren: 0, sectFate: null, extinct: false, chronicle: [],
      orphanDeath: !this._playerClan(w) }
    if (it.orphanDeath) it.chronicle.push(this._fillClan(CHRONICLE_ORPHAN_DEATH, { year: yr }))
    if (!clan) { it.extinct = true; it.step = 'chronicle'; return }   // never belonged anywhere, nowhere to return
    this._advancePersons(w, yr)
    const pend = clan.pendingSuccession && clan.pendingSuccession.fromPersonId === deadId ? clan.pendingSuccession : null
    it.outgoingId = pend?.wasHead ? deadId : clan.headId
    const cands = this._successionCandidates(clan, it.outgoingId, yr)
    const designated = pend?.heirId && cands.find(p => p.id === pend.heirId)
    if (designated) { it.designatedId = designated.id; it.heirKind = pend.heirKind || 'chosen' }
    it.candidates = cands.map(p => p.id)
    if (!cands.length || designated || cands.length === 1) { this._runSuccession(); return }
    it.step = 'bet'
  }

  _fillClan(str, vals) { return String(str || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m) }

  // Public (UI/sim/checks): everything the between-lives overlay shows.
  interludeInfo() {
    const s = this._s, it = s.interlude
    if (!it) return null
    const w = s.world, clan = it.clanId ? w.clans[it.clanId] : null
    return { step: it.step, cause: it.cause, year: it.year, clanName: clan?.name || '', extinct: it.extinct,
             candidates: it.step === 'bet' ? it.candidates.slice(0, BET_MAX_CANDIDATES).map(id => w.persons[id]) : [],
             bet: it.bet, betWon: it.betWon, successor: it.successorId ? w.persons[it.successorId] : null,
             style: it.style, heirKind: it.heirKind, reignYears: it.reignYears, chronicle: [...it.chronicle],
             canJoinClan: !!clan && !it.extinct, summary: s.lastReincarnation }
  }

  // The heir bet: pick who you think the clan raises to the head seat; then the clan picks.
  placeBet(personId) {
    const it = this._s.interlude
    if (!it || it.step !== 'bet') return { ok: false, reason: 'no_bet' }
    if (!it.candidates.slice(0, BET_MAX_CANDIDATES).includes(personId)) return { ok: false, reason: 'bad_candidate' }
    it.bet = personId
    this._runSuccession()
    this._recalc(); this._notify()
    return { ok: true, won: it.betWon, successorId: it.successorId }
  }

  // Weighted pick among candidates: exp((score − best) / SUCCESSION_SPREAD). One Math.random().
  _clanPick(clan, ids) {
    const w = this._s.world, ps = ids.map(id => w.persons[id])
    const sc = ps.map(p => this._successionScore(clan, p)), best = Math.max(...sc)
    const wt = sc.map(x => Math.exp((x - best) / SUCCESSION_SPREAD)), total = wt.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < ps.length; i++) { r -= wt[i]; if (r <= 0) return ps[i] }
    return ps[ps.length - 1]
  }

  // A new head's parenting style — rolled from their bond with the old head, morality, personality, trauma.
  _rollStyle(p) {
    const bond = p.bond ?? 50, m = p.morality ?? 0
    const wt = { nurturing: STYLE_BASE_WEIGHT, strict: STYLE_BASE_WEIGHT, neglectful: STYLE_BASE_WEIGHT, ruthless: STYLE_BASE_WEIGHT }
    wt.nurturing  += (bond - 50) * 0.8 + Math.max(0, m) * 0.3
    wt.neglectful += Math.max(0, 50 - bond) * 0.5
    wt.ruthless   += Math.max(0, -m) * 0.4
    for (const [k, v] of Object.entries(STYLE_PERSONALITY_BIAS[p.personality] || {})) wt[k] += v
    let traumaPath = null
    if (p.trauma) {
      traumaPath = Math.random() < 0.5 ? 'never_again' : 'cycle'
      if (traumaPath === 'never_again') wt.nurturing += TRAUMA_STYLE_SHIFT
      else { wt.ruthless += TRAUMA_STYLE_SHIFT; wt.strict += TRAUMA_STYLE_SHIFT / 2 }
    }
    return { style: this._weighted(wt), traumaPath }
  }

  // Picks a key from {key: weight} (weights ≤ 0 skipped). One Math.random().
  _weighted(wt) {
    const e = Object.entries(wt).filter(([, v]) => v > 0), total = e.reduce((a, [, v]) => a + v, 0)
    let r = Math.random() * total
    for (const [k, v] of e) { r -= v; if (r <= 0) return k }
    return e[e.length - 1][0]
  }

  // A generated NPC (spouse / kin / rival head). Stage and birth year are passed in; morality from personality.
  _genPerson({ family, bornYear, stage, role, parents = [], root = null }) {
    const personality = Persons.rollPersonality()
    const p = Persons.make({ id: this._newPersonId(), given: Persons.rollGiven(), family, bornYear,
      root: root || Persons.rollRoot(), personality, stageIndex: stage, maxStage: stage, role, alive: true, parents })
    p.morality = this._rollMorality(personality)
    p.grownYear = Math.floor(this._s.world.year)
    return p
  }

  // Resolves who takes the seat, their style, branch founding, sect fortunes and the reign chronicle.
  _runSuccession() {
    const s = this._s, w = s.world, it = s.interlude, clan = w.clans[it.clanId], yr = it.year
    it.step = 'chronicle'
    if (!it.candidates.length) {
      it.extinct = true
      const line = this._fillClan(CHRONICLE_EXTINCT, { year: yr, clan: clan.name || 'nameless' })
      it.chronicle.push(line); clan.history.push({ year: yr, text: line })
      clan.headId = null; clan.extinct = true
      delete clan.pendingSuccession
      return
    }
    const succ = it.designatedId ? w.persons[it.designatedId] : this._clanPick(clan, it.candidates)
    it.successorId = succ.id
    if (it.bet) it.betWon = it.bet === succ.id
    const minor = yr - (succ.bornYear ?? 0) < ADULT_AGE
    it.heirKind = it.heirKind || (minor ? 'regency' : 'clan')
    // The old head (an NPC who reigned through your last life) steps down into seclusion — nobody dies of age.
    const old = it.outgoingId && it.outgoingId !== it.deadId ? w.persons[it.outgoingId] : null
    if (old && old.alive !== false) old.role = 'elder'
    if (it.heirKind !== 'tournament') clan.tradition.peacefulSuccessions++
    // Seat: the successor moves to the main line (a branch they led passes to its strongest remaining member).
    const main = clan.lines[0], fromLine = this._lineOf(clan, succ.id)
    if (fromLine && fromLine !== main) {
      fromLine.memberIds = fromLine.memberIds.filter(id => id !== succ.id)
      if (fromLine.headId === succ.id) {
        const next = fromLine.memberIds.map(id => w.persons[id]).filter(p => p && p.alive !== false).sort((a, b) => (b.stageIndex || 0) - (a.stageIndex || 0))[0]
        fromLine.headId = next ? next.id : null
      }
    }
    if (!main.memberIds.includes(succ.id)) main.memberIds.push(succ.id)
    clan.headId = succ.id; main.headId = succ.id; succ.role = 'head'
    const { style, traumaPath } = this._rollStyle(succ)
    succ.parentingStyle = style; succ.headSince = yr
    it.style = style; it.traumaPath = traumaPath
    const fill = extra => ({ year: yr, head: succ.given, clan: clan.name || 'nameless', ...extra })
    const lines = [this._fillClan(CHRONICLE_ACCESSION[it.heirKind] || CHRONICLE_ACCESSION.clan, fill())]
    if (traumaPath) lines.push(this._fillClan(TRAUMA_PATH_TEXT[traumaPath], fill()))
    lines.push(this._fillClan(CHRONICLE_STYLE[style], fill()))
    // Branches: a tournament's places 2–4, otherwise the strongest adult main-line sibling — while there's room.
    const pend = clan.pendingSuccession && clan.pendingSuccession.fromPersonId === it.deadId ? clan.pendingSuccession : null
    let founders = pend?.branchFounderIds?.length
      ? pend.branchFounderIds.map(id => w.persons[id]).filter(p => p && p.alive !== false && !p.estranged)
      : it.candidates.filter(id => id !== succ.id).map(id => w.persons[id])
          .filter(p => yr - (p.bornYear ?? 0) >= ADULT_AGE && this._lineOf(clan, p.id) === main).slice(0, 1)
    founders = founders.filter(p => p.id !== succ.id).slice(0, Math.max(0, MAX_BRANCHES - (clan.lines.length - 1)))
    for (const f of founders) {
      const used = new Set(clan.lines.map(l => l.name))
      const name = BRANCH_NAMES.find(n => !used.has(n)) || `Branch ${clan.lines.length}`
      for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id !== f.id)
      clan.lines.push({ id: `${clan.id}-b${yr}-${f.id}`, name, headId: f.id, memberIds: [f.id], foundedYear: yr })
      f.role = 'branch_head'
      lines.push(`${f.given} leaves the main line to found the ${name}.`)
    }
    // The reign: marriage, children (generated at rebirth, _beginLife), sect fortunes, one story.
    it.reignYears = Math.round(this._randRange(REIGN_YEARS))
    it.nChildren = this._randInt(HEIR_CHILDREN[style])
    let spouse = (succ.spouseIds || []).map(id => w.persons[id]).find(p => p && p.alive !== false) || null
    if (!spouse) {
      spouse = this._genPerson({ family: Persons.rollSurname(), bornYear: (succ.bornYear ?? yr - 20) + this._randInt([-10, 10]),
        stage: Math.max(1, Math.min(NPC_STAGE_CAP, (succ.stageIndex || 1) + this._randInt([-3, 1]))), role: 'spouse' })
      w.persons[spouse.id] = spouse
      succ.spouseIds = [...(succ.spouseIds || []), spouse.id]; spouse.spouseIds = [succ.id]
      main.memberIds.push(spouse.id)
      lines.push(`${succ.given} marries ${Persons.fullName(spouse)}.`)
    }
    it.spouseId = spouse.id
    lines.push(`${it.nChildren} children are born to the head’s household over the next ${it.reignYears} years.`)
    if (clan.sect) {
      const fate = this._weighted(SECT_FORTUNE[style])
      const sect = clan.sect, enemy = fate === 'lost' ? this._rivalSectName() : ''
      if (fate === 'grow') sect.hallLevel = Math.min(SECT_HALL_LEVELS.length, (sect.hallLevel || 1) + 1)
      if (fate === 'decline') { sect.hallLevel = Math.max(1, (sect.hallLevel || 1) - 1); (sect.disciples || []).pop() }
      lines.push(this._fillClan(CHRONICLE_SECT[fate], fill({ sect: sect.name || 'clan sect', enemy })))
      if (fate === 'lost') { this._noteEnemy({ kind: 'sect', name: `the ${enemy}`, why: `took the ${sect.name}` }); clan.sect = null }
      else sect.heirId = succ.id
      it.sectFate = fate
    }
    const pool = CHRONICLE_EVENTS[style]
    lines.push(this._fillClan(pool[Math.floor(Math.random() * pool.length)], fill()))
    it.chronicle.push(...lines)
    for (const l of lines) clan.history.push({ year: yr, text: l })
    if (clan.history.length > CLAN_HISTORY_MAX) clan.history.splice(0, clan.history.length - CLAN_HISTORY_MAX)
    // Phase 31 (2.7c): carry the dying life's equipped/beast snapshot forward onto `it` — pendingSuccession
    // itself is deleted right below, but _beginLife() (Heirloom/Beast Lineage) runs long after this method returns.
    it.legacyCapture = pend ? { equipped: pend.equipped || null, bestBeast: pend.bestBeast || null } : null
    delete clan.pendingSuccession
  }

  _rivalSectName() {
    const pick = a => a[Math.floor(Math.random() * a.length)]
    return `${pick(RIVAL_SECT_PREFIXES)} ${pick(RIVAL_SECT_SUFFIXES)}`
  }

  // Someone who wronged you (a spouse you dueled, a sect you warred with, a sect that took the clan's). One entry
  // per name, newest last, capped. Read only by the rare rival-family rebirth for now (Phase 28K extends it).
  _noteEnemy(e) {
    const w = this._s.world
    w.enemies = (w.enemies || []).filter(x => x.name !== e.name)
    w.enemies.push({ ...e, year: Math.floor(w.year) })
    if (w.enemies.length > ENEMIES_MAX) w.enemies.splice(0, w.enemies.length - ENEMIES_MAX)
  }

  // Public (UI/sim): 'clan' or 'orphan'. Places the unborn life, advances the world a generation, starts it.
  chooseRebirth(choice) {
    const it = this._s.interlude
    if (!it || it.step !== 'chronicle') return { ok: false, reason: 'not_ready' }
    if (choice !== 'clan' && choice !== 'orphan') return { ok: false, reason: 'bad_choice' }
    if (choice === 'clan' && (it.extinct || !it.clanId)) return { ok: false, reason: 'no_clan' }
    this._beginLife(choice)
    return { ok: true, birth: this._s.birth }
  }

  // Checks/dev convenience: resolve a pending interlude with defaults (bet on the likeliest, clan birth if possible).
  finishInterlude(choice = null) {
    const it = this._s.interlude
    if (!it) return null
    if (it.step === 'bet') this.placeBet(it.candidates[0])
    const now = this._s.interlude
    return this.chooseRebirth(choice || (now.extinct || !now.clanId ? 'orphan' : 'clan'))
  }

  // Children of `parents` spread over the reign, ~6–12 years apart; the slot at `youIdx` (if any) is yours and is
  // skipped here. Children not yet born by `yearNow` are dropped.
  _genChildren(clan, line, parents, n, yourBorn, youIdx, yearNow) {
    const w = this._s.world, [pa, pb] = parents, style = PARENTING_STYLES[pa.parentingStyle] || PARENTING_STYLES.strict
    const gap = 6 + Math.random() * 6, kids = []
    for (let i = 0; i < n; i++) {
      const born = Math.round(yourBorn + (i - (youIdx ?? 0)) * gap)
      if (i === youIdx || born > yearNow) continue
      const c = this._genPerson({ family: clan.name, bornYear: born, stage: 0, role: 'kin', parents: [pa.id, pb.id],
                                  root: Persons.blendRoot(pa.root || Persons.rollRoot(), pb.root || Persons.rollRoot()) })
      c.bond = this._randInt(style.childBond)
      c.morality = Math.max(-100, Math.min(100, c.morality + (style.morality || 0)))
      c.grownYear = born
      w.persons[c.id] = c
      line.memberIds.push(c.id)
      kids.push(c)
    }
    this._advancePersons(w, yearNow)
    return kids
  }

  // A rival house for the rare rival-family rebirth: reuse the clan already founded for this enemy, else found one.
  _rivalClan(enemy, fromClan) {
    const w = this._s.world, yr = Math.floor(w.year)
    let clan = Object.values(w.clans).find(c => c.rivalOf?.enemyName === enemy.name && !c.extinct && c.headId)
    if (!clan) {
      if (!enemy.surname) enemy.surname = Persons.rollSurname()
      clan = this._foundClan(w, enemy.surname)
      clan.rivalOf = { clanId: fromClan?.id || null, enemyName: enemy.name }
      const head = this._genPerson({ family: clan.name, bornYear: yr - this._randInt([60, 200]), stage: this._randInt([10, 18]), role: 'head' })
      w.persons[head.id] = head
      this._joinClan(w, clan, head.id)
      head.parentingStyle = this._rollStyle(head).style
    }
    if (fromClan) { clan.relations[fromClan.id] = RIVAL_CLAN_RELATION; fromClan.relations[clan.id] = RIVAL_CLAN_RELATION }
    return clan
  }

  // The spouse of `head` on `line`, generated if they have none.
  _spouseFor(head, line, yourBorn) {
    const w = this._s.world
    let sp = (head.spouseIds || []).map(id => w.persons[id]).find(p => p && p.alive !== false)
    if (!sp) {
      sp = this._genPerson({ family: Persons.rollSurname(), bornYear: head.bornYear ?? yourBorn - 30, stage: Math.max(1, (head.stageIndex || 1) - 2), role: 'spouse' })
      w.persons[sp.id] = sp; head.spouseIds = [...(head.spouseIds || []), sp.id]; sp.spouseIds = [head.id]
      line.memberIds.push(sp.id)
    }
    return sp
  }

  // Places the unborn life (2.6d). The world clock jumps a generation; NPCs grow; you're born into the chosen place.
  _beginLife(choice) {
    const s = this._s, w = s.world, it = s.interlude
    const target = it.clanId ? w.clans[it.clanId] : null
    const newYear = it.year + (it.extinct ? this._randInt(REIGN_YEARS) : it.reignYears)
    w.year = newYear
    this._advancePersons(w, newYear)
    const yourBorn = newYear - AWAKENING_AGE
    const succ = it.successorId ? w.persons[it.successorId] : null
    const spouse = it.spouseId ? w.persons[it.spouseId] : null
    let clan = null, line = null, position = 'orphan', head = null, parents = null, enemy = null, rival = false

    // Very rarely: the house of someone who wronged you (only when you chose a clan birth and an enemy is known).
    if (choice === 'clan') {
      const known = (w.enemies || []).filter(e => !e.surname || e.surname !== target.name)
      if (known.length && Math.random() < RIVAL_REBIRTH_CHANCE) { rival = true; enemy = known[Math.floor(Math.random() * known.length)] }
    }
    if (choice === 'clan' && !rival) {
      clan = target
      const branches = clan.lines.slice(1).filter(l => l.headId && w.persons[l.headId] && w.persons[l.headId].alive !== false)
      const betMod = it.betWon === true ? POSITION_BET_WON : it.betWon === false ? POSITION_BET_LOST : null
      const wt = {}
      for (const k of Object.keys(POSITION_BASE)) wt[k] = POSITION_BASE[k] * (betMod ? betMod[k] : 1) * (POSITION_STYLE[it.style]?.[k] ?? 1)
      if (!branches.length) wt.branch = 0
      if (it.nChildren < 2) wt.younger = 0
      position = this._weighted(wt)
      if (position === 'branch') { line = branches[Math.floor(Math.random() * branches.length)]; head = w.persons[line.headId] }
      else { line = clan.lines[0]; head = succ }
    }
    // The main-line household is generated whether or not you're born into it — the clan lives on either way.
    if (succ && spouse) {
      const mine = clan === target && (position === 'eldest' || position === 'younger')
      const youIdx = mine ? (position === 'eldest' ? 0 : this._randInt([1, Math.max(1, it.nChildren - 1)])) : null
      this._genChildren(target, target.lines[0], [succ, spouse], it.nChildren, mine ? yourBorn : yourBorn - 10, youIdx, newYear)
      if (mine) parents = [succ, spouse]
    }
    if (position === 'branch') {
      if (!head.parentingStyle) head.parentingStyle = this._rollStyle(head).style
      const bSpouse = this._spouseFor(head, line, yourBorn), n = this._randInt(BRANCH_CHILDREN)
      this._genChildren(clan, line, [head, bSpouse], n, yourBorn, this._randInt([0, n - 1]), newYear)
      parents = [head, bSpouse]
    }
    if (rival) {
      clan = this._rivalClan(enemy, target)
      line = clan.lines[0]; head = w.persons[clan.headId]; position = 'rival'
      const rSpouse = this._spouseFor(head, line, yourBorn), n = this._randInt(HEIR_CHILDREN[head.parentingStyle] || [2, 5])
      this._genChildren(clan, line, [head, rSpouse], n, yourBorn, this._randInt([0, n - 1]), newYear)
      parents = [head, rSpouse]
    }

    // You.
    const me = s.self
    me.family = clan ? clan.name : ''
    me.given = Persons.rollGiven()
    me.bornYear = yourBorn
    me.parents = parents ? parents.map(p => p.id) : []
    if (parents) s.root = Persons.blendRoot(parents[0].root || Persons.rollRoot(), parents[1].root || Persons.rollRoot())
    s.name = Persons.fullName(me)
    if (clan) {
      w.playerClanId = clan.id; w.playerLineId = line.id
      this._joinClan(w, clan, me.id, line.id)
    } else {
      if (target && !it.extinct) w.lastClanId = target.id
      w.playerClanId = null; w.playerLineId = null
    }
    const style = head?.parentingStyle || null
    const headBond = head ? Math.max(0, Math.min(100, this._randInt(PARENTING_STYLES[style]?.headBond || [40, 60]) + (POSITION_TEXT[position]?.headBondBonus || 0))) : null
    // The clan stipend from the clan sect, if the reign kept it (your own clan only, not a rival house).
    const sect = clan && clan === target ? clan.sect : null
    const stipend = sect ? Math.round(STIPEND_BASE * (sect.hallLevel || 1) * (PARENTING_STYLES[style]?.stipendMult || 1) * (STIPEND_POSITION_MULT[position] || 0)) : 0
    s.spiritStones += stipend
    s.birth = { position, year: newYear, clanId: clan?.id || null, lineId: line?.id || null, lineName: line?.name || null,
                headId: head?.id || null, headStyle: style, headBond, betWon: it.betWon, rival,
                enemyName: enemy?.name || null, stipend, fromClanId: target?.id || null }
    s.upbringing = head && style ? { due: newYear + this._randRange(UPBRINGING_DELAY_YEARS), event: null, style } : null

    const birthLine = this._fillClan(CHRONICLE_BIRTH[position], { year: newYear, head: head?.given || '', line: line?.name || '',
      clan: clan?.name || '', enemy: enemy?.name || '' })
    it.chronicle.push(birthLine)
    if (clan) clan.history.push({ year: newYear, text: birthLine })

    // Bloodline: + the heir term — whoever took the seat of the clan you died in (2.6c formula, now any successor).
    const heirTerm = succ ? BLOODLINE_G_HEIR * Math.pow((succ.stageIndex || 0) / (CULTIVATION_STAGES.length - 1), 2) +
                            (succ.trauma ? BLOODLINE_G_TRAUMA_HEIR : 0) : 0
    s.bloodlineQuality = Math.min(BLOODLINE_CAP, (s._baseBQ ?? s.bloodlineQuality) + heirTerm)
    delete s._baseBQ
    const lr = s.lastReincarnation
    if (lr) Object.assign(lr, { heirStage: succ ? succ.stageIndex : null, heirTrauma: !!succ?.trauma, heirKind: succ ? it.heirKind : null,
      heirTerm, newBloodlineQuality: s.bloodlineQuality, growth: (lr.growth || 0) + heirTerm,
      birth: { position, style: it.style, headStyle: style, betWon: it.betWon, rival, extinct: it.extinct, stipend,
               successorKind: succ ? it.heirKind : null, sectFate: it.sectFate, chronicle: [...it.chronicle] } })
    this._applyLegacies(clan, it.legacyCapture)   // Phase 31 (2.7c): the clan you're actually reborn into — null for an orphan
    this._pruneWorld(w)
    s.interlude = null
    const pt = POSITION_TEXT[position]
    this.addEvent({ text: birthLine, type: 'special' })
    this.addEvent({ text: `You are ${s.name}${clan ? ` of the ${clan.name} clan` : ''} — ${this._fillClan(pt.name, { line: line?.name || '' }).toLowerCase()}.${stipend ? ` The clan sect grants you a stipend of ${stipend} Spirit Stones.` : ''}`, type: 'positive' })
    this._recalc(); this._notify()
    this._emit('reborn', { position })
  }

  // Drops long-dead persons (not heads, founders or past lives) from the registry and the rosters.
  _pruneWorld(w) {
    const keep = new Set(w.pastLives.map(l => l.personId))
    for (const c of Object.values(w.clans)) { keep.add(c.founderId); keep.add(c.headId); for (const l of c.lines) keep.add(l.headId) }
    const cutoff = w.year - WORLD_PRUNE_YEARS
    const drop = Object.values(w.persons).filter(p => p.alive === false && (p.diedYear ?? w.year) < cutoff && !keep.has(p.id)).map(p => p.id)
    if (!drop.length) return
    const gone = new Set(drop)
    for (const id of drop) delete w.persons[id]
    for (const c of Object.values(w.clans)) for (const l of c.lines) l.memberIds = l.memberIds.filter(id => !gone.has(id))
  }

  // ── 2.6d upbringing: one event from the head's style, early in a life born into a clan ─────────────
  upbringingEventDef(ev) {
    return (UPBRINGING_EVENTS[ev?.style] || []).find(e => e.id === ev?.id) || null
  }

  upbringingText(str) {
    const s = this._s, head = s.birth?.headId ? this.person(s.birth.headId) : null
    const vals = { head: head?.given || 'the head', name: s.name, clan: this._playerClan()?.name || '' }
    return String(str || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m)
  }

  // Bond with the head moves by YOUR personality (the same event plays differently for different characters).
  resolveUpbringingEvent(i) {
    const s = this._s, ev = s.upbringing?.event
    if (!ev) return { ok: false, reason: 'no_event' }
    const def = this.upbringingEventDef(ev), ch = def?.choices?.[i]
    if (!ch) return { ok: false, reason: 'bad_choice' }
    this._applyFamilyEffect(ch.effect)
    const delta = ch.bond ? (ch.bond[s.personality?.id] ?? ch.bond.default ?? 0) : 0
    if (s.birth && s.birth.headBond != null) s.birth.headBond = Math.max(0, Math.min(100, s.birth.headBond + delta))
    s.upbringing = { ...s.upbringing, event: null, done: ev.id }
    const heart = delta ? ` (bond with the head ${delta > 0 ? '+' : ''}${delta})` : ''
    if (ch.result) this.addEvent({ text: this.upbringingText(`${def.title}: ${ch.result}${heart}`), type: delta < 0 ? 'negative' : 'positive' })
    this._recalc(); this._notify()
    return { ok: true, headBond: s.birth?.headBond ?? null }
  }

  // True when the living player heads their clan (only the head names an heir / hosts a Tournament of Heirs).
  isClanHead() {
    const clan = this._playerClan()
    return !!clan && clan.headId === this._s.self.id
  }

  // ── 2.6e (clan-succession.md): challenge the head, be challenged as head, step-down mass tournaments ──
  // Headship can now change mid-life, not only at death. All three paths share: a single logistic fight
  // (or bracket of them) via _resolveFight/_fightPower (the same power formula the Tournament of Heirs uses),
  // a lethality call from _headDecidesLethal when it's the sitting head's to make, and _installHead to move
  // the seat to a still-living winner (you or an NPC) without anyone else's life pausing.

  _isBloody(clan) { return (clan?.tradition?.lethalTournaments || 0) > (clan?.tradition?.peacefulSuccessions || 0) }

  // The sitting head's own call on lethality (deciding on a challenge against them, or setting the policy for
  // a step-down tournament): style + how little they're liked + morality + personality + a bloody clan tradition.
  _headDecidesLethal(head, clan, bond = 50) {
    const style = head.parentingStyle || 'strict'
    let w = LETHAL_BASE_WEIGHT[style] ?? 20
    w += Math.max(0, 50 - bond) * LETHAL_BOND_WEIGHT
    w += Math.max(0, -(head.morality ?? 0)) * LETHAL_MORALITY_WEIGHT
    w += LETHAL_PERSONALITY_BONUS[head.personality] || 0
    if (this._isBloody(clan)) w += LETHAL_BLOODY_BONUS
    return Math.random() * 100 < Math.max(LETHAL_CHANCE_RANGE[0], Math.min(LETHAL_CHANCE_RANGE[1], w))
  }

  // A single fight between two {stageIndex, root, personality} fighters (world persons or _selfAsPerson()).
  // A cowardly loser of a lethal fight may still yield — same TOURNAMENT_COWARD_YIELD rule as 2.6c.
  _resolveFight(fA, fB, lethal) {
    const pa = this._fightPower(fA), pb = this._fightPower(fB)
    const aWins = Math.random() < 1 / (1 + Math.exp(-(pa - pb) / TOURNAMENT_SPREAD))
    const winner = aWins ? fA : fB, loser = aWins ? fB : fA
    let died = false, yielded = false
    if (lethal) {
      if (loser.personality === 'coward' && Math.random() < TOURNAMENT_COWARD_YIELD) yielded = true
      else died = true
    }
    return { winner, loser, died, yielded }
  }

  // Anyone who lives through a lethal fight carries it (fighters who survive, winners included) — same rule
  // 2.6c uses for the Tournament of Heirs, generalized to whoever fought (you, or a world person).
  _applyLethalTrauma(res, lethal) {
    if (!lethal) return
    const mark = f => { if (!f) return; if (f.id === this._s.self.id) this._s.self.trauma = true; else f.trauma = true }
    mark(res.winner)
    if (!res.died) mark(res.loser)
  }

  // The living player as a fight-power-shaped Person: live stage/root/personality over the stored self record.
  _selfAsPerson() {
    const s = this._s
    return { ...s.self, stageIndex: s.stageIndex, root: s.root, personality: s.personality?.id }
  }

  // Your bond with the CURRENT head — only tracked while they're still the head you were born/raised under.
  _bondWithHead(head) {
    const s = this._s
    return (s.birth && s.birth.headId === head?.id && s.birth.headBond != null) ? s.birth.headBond : 50
  }

  _killPerson(id, yr, cause) {
    const p = this._s.world.persons[id]
    if (p) { p.alive = false; p.diedYear = yr; p.cause = cause }
  }

  // Moves a still-living clan member (you, or an NPC) into the head seat. The outgoing head (if still alive)
  // steps down into seclusion, never dies of it. For you: hands over the clan's founded sect (clan.sect) if
  // you don't already run your own. For an NPC: rolls a parenting style if they don't have one yet.
  _installHead(clan, personId) {
    const w = this._s.world, s = this._s, main = clan.lines[0]
    const old = clan.headId ? w.persons[clan.headId] : null
    if (old && old.alive !== false) old.role = 'elder'
    const fromLine = this._lineOf(clan, personId)
    if (fromLine && fromLine !== main) {
      fromLine.memberIds = fromLine.memberIds.filter(id => id !== personId)
      if (fromLine.headId === personId) {
        const next = fromLine.memberIds.map(id => w.persons[id]).filter(p => p && p.alive !== false).sort((a, b) => (b.stageIndex || 0) - (a.stageIndex || 0))[0]
        fromLine.headId = next ? next.id : null
      }
    }
    if (!main.memberIds.includes(personId)) main.memberIds.push(personId)
    clan.headId = personId; main.headId = personId
    if (personId === s.self.id) {
      if (clan.sect && !s.ownSect.founded && !s.sect.id) {
        s.ownSect = { ...this._blankOwnSect(), ...clan.sect, founded: true }
        delete s.ownSect.inheritedYear; delete s.ownSect.heirId
        clan.sect = null
      }
    } else {
      const p = w.persons[personId]
      p.role = 'head'
      if (!p.parentingStyle) p.parentingStyle = this._rollStyle(p).style
      p.headSince = Math.floor(w.year)
    }
    return old
  }

  // Public (UI): can you challenge the sitting head right now?
  canChallengeHead() {
    const s = this._s, clan = this._playerClan()
    if (!clan) return { ok: false, reason: 'no_clan' }
    if (clan.headId === s.self.id) return { ok: false, reason: 'is_head' }
    const head = clan.headId ? this.person(clan.headId) : null
    if (!head) return { ok: false, reason: 'no_head' }
    if (Math.abs((head.stageIndex || 0) - s.stageIndex) > CHALLENGE_STAGE_GAP) return { ok: false, reason: 'stage_gap' }
    const y = s.world.year, ready = s.family.challengeCooldownYear
    if (ready != null && y < ready) return { ok: false, reason: 'cooldown', readyYear: ready }
    return { ok: true, head }
  }

  // You call out the sitting head. They decide lethal or not; the fight resolves at once.
  challengeHead() {
    const check = this.canChallengeHead()
    if (!check.ok) return check
    const s = this._s, f = s.family, w = s.world, yr = Math.floor(w.year), clan = this._playerClan(), head = check.head
    const lethal = this._headDecidesLethal(head, clan, this._bondWithHead(head))
    clan.tradition.challenges = (clan.tradition.challenges || 0) + 1
    const res = this._resolveFight(this._selfAsPerson(), head, lethal)
    this._applyLethalTrauma(res, lethal)
    const youWon = res.winner.id === s.self.id
    f.tally.challenges++
    let outcome
    if (youWon) {
      f.tally.challengesWon++
      if (res.died) { this._killPerson(head.id, yr, 'challenge'); s.karma = Math.max(0, s.karma + CHALLENGE_KARMA_DEATH) }
      this._installHead(clan, s.self.id)
      if (lethal && res.died) s.bloodlineQuality = Math.min(BLOODLINE_CAP, (s.bloodlineQuality || 0) + BLOODLINE_G_TRAUMA_HEIR)
      this.addEvent({ text: `Year ${yr}: ${res.died ? `${Persons.fullName(head)} falls before you` : `you beat ${Persons.fullName(head)} to the ground and let them live`}. You take the head seat of the ${clan.name || 'clan'}.`, type: 'special' })
      outcome = res.died ? 'won_lethal' : 'won_nonlethal'
    } else {
      f.tally.challengesLost++
      if (res.died) {
        this.addEvent({ text: `Year ${yr}: ${Persons.fullName(head)}'s blade is faster. Your challenge for the head seat ends your life.`, type: 'negative' })
        this._recalc(); this._notify()
        this._die('challenge_lost')
        return { ok: true, outcome: 'lost_lethal', lethal }
      }
      f.challengeCooldownYear = yr + this._randRange(CHALLENGE_COOLDOWN_YEARS)
      if (s.birth?.headId === head.id) s.birth.headBond = Math.max(0, (s.birth.headBond ?? 50) - CHALLENGE_BOND_LOSS)
      this.addEvent({ text: `Year ${yr}: ${Persons.fullName(head)} beats you down and lets you live. You will need to heal before you try again.`, type: 'negative' })
      outcome = 'lost_nonlethal'
    }
    this._recalc(); this._notify()
    return { ok: true, outcome, lethal }
  }

  // A challenger from the roster with a real shot: adult, on the clan roster, within a plausible stage of you.
  _pickChallenger(clan) {
    const w = this._s.world, s = this._s, yr = Math.floor(w.year)
    const ids = [...new Set(this._clanMemberIds(clan))].filter(id => id !== s.self.id)
    const cands = ids.map(id => w.persons[id]).filter(p => p && p.alive !== false && !p.estranged &&
      yr - (p.bornYear ?? 0) >= ADULT_AGE && Math.abs((p.stageIndex || 0) - s.stageIndex) <= CHALLENGER_STAGE_GAP_MAX)
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null
  }

  // Public (UI): resolve a pending NPC challenge against you (you're head) — YOUR call on lethality.
  resolveHeadChallenge(lethal) {
    const s = this._s, f = s.family, w = s.world, yr = Math.floor(w.year)
    const ch = f.headChallenge
    if (!ch) return { ok: false, reason: 'no_challenge' }
    f.headChallenge = null
    const clan = this._playerClan(), challenger = this.person(ch.challengerId)
    if (!clan || !challenger || challenger.alive === false) { this._recalc(); this._notify(); return { ok: true, outcome: 'moot' } }
    clan.tradition.challenges = (clan.tradition.challenges || 0) + 1
    lethal = !!lethal
    const res = this._resolveFight(this._selfAsPerson(), challenger, lethal)
    this._applyLethalTrauma(res, lethal)
    const youWon = res.winner.id === s.self.id
    f.tally.challenges++
    if (youWon) {
      f.tally.challengesWon++
      if (res.died) { this._killPerson(challenger.id, yr, 'challenge'); s.karma = Math.max(0, s.karma + CHALLENGE_KARMA_DEATH) }
      this.addEvent({ text: `Year ${yr}: ${res.died ? `${Persons.fullName(challenger)} falls before you. Your seat is secure` : `you beat ${Persons.fullName(challenger)} down and let them live`}.`, type: res.died ? 'negative' : 'positive' })
      this._recalc(); this._notify()
      return { ok: true, outcome: res.died ? 'won_lethal' : 'won_nonlethal', lethal }
    }
    f.tally.challengesLost++
    if (res.died) {
      this.addEvent({ text: `Year ${yr}: ${Persons.fullName(challenger)}'s blade is faster. Your reign ends where it stood.`, type: 'negative' })
      this._recalc(); this._notify()
      this._die('challenged')
      return { ok: true, outcome: 'lost_lethal', lethal }
    }
    this._installHead(clan, challenger.id)
    this.addEvent({ text: `Year ${yr}: ${Persons.fullName(challenger)} beats you before the whole clan. You step down; they take the head seat.`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true, outcome: 'lost_nonlethal', lethal }
  }

  // Everyone adult who could sign up, excluding the stepping-down head — includes the living player.
  _stepDownEntrants(clan, excludeId) {
    const w = this._s.world, s = this._s, yr = Math.floor(w.year), list = []
    for (const id of new Set(this._clanMemberIds(clan))) {
      if (id === excludeId) continue
      if (id === s.self.id) { if (yr - (s.self.bornYear || 0) >= ADULT_AGE) list.push(this._selfAsPerson()) ; continue }
      const p = w.persons[id]
      if (p && p.alive !== false && !p.estranged && yr - (p.bornYear ?? 0) >= ADULT_AGE) list.push(p)
    }
    return list
  }

  // Resolves a whole elimination bracket at once: random pairing each round, lethal while more than
  // TOURNAMENT_TOP remain AND the head chose blood, non-lethal after — same shape as the Tournament of
  // Heirs (2.6c), generalized to the whole clan (branches, and you, may be in the pool) with nobody
  // picking the pairs. Kills NPC losers directly; a losing player is only marked (selfOut), never dies here —
  // the caller finishes with _die() once every other consequence (new head, branches) is already committed.
  _runBracket(ids, lethal, yr) {
    const self = this._s.self.id
    const get = id => id === self ? this._selfAsPerson() : this._s.world.persons[id]
    const nameOf = id => id === self ? this._s.name : Persons.fullName(this._s.world.persons[id])
    let pool = [...ids], round = 1, eliminated = [], lines = [], selfOut = null
    while (pool.length > 1) {
      const roundLethal = lethal && pool.length > TOURNAMENT_TOP
      const order = [...pool].sort(() => Math.random() - 0.5)
      const next = []
      if (order.length % 2) next.push(order.pop())
      for (let i = 0; i < order.length; i += 2) {
        const idA = order[i], idB = order[i + 1], pa = get(idA), pb = get(idB)
        const res = this._resolveFight(pa, pb, roundLethal)
        this._applyLethalTrauma(res, roundLethal)
        const winId = res.winner === pa ? idA : idB, loseId = winId === idA ? idB : idA
        next.push(winId)
        if (res.died) { if (loseId === self) selfOut = 'died'; else this._killPerson(loseId, yr, 'stepdown_tournament') }
        else if (loseId === self && !selfOut) selfOut = 'eliminated'
        eliminated.push({ id: loseId, round, died: res.died, stage: get(loseId)?.stageIndex ?? 0 })
        lines.push(`${nameOf(winId)} defeats ${nameOf(loseId)}${res.died ? ' — they do not rise' : res.yielded ? ' as they yield' : ''}.`)
      }
      pool = next; round++
    }
    const rest = eliminated.sort((a, b) => (b.round - a.round) || (b.stage - a.stage)).map(e => e.id)
    return { winnerId: pool[0], ranking: [pool[0], ...rest], deaths: eliminated.filter(e => e.died).length, lines, selfOut }
  }

  // Places 2–4 in the bracket found new branches (up to MAX_BRANCHES total), mirroring the reign sim's own
  // branch-founding — but from the WHOLE clan's tournament, not just your children.
  _foundBranchesFrom(clan, ranking, yr) {
    const w = this._s.world, main = clan.lines[0]
    const founders = ranking.slice(1, TOURNAMENT_TOP).map(id => id === this._s.self.id ? null : w.persons[id])
      .filter(p => p && p.alive !== false).slice(0, Math.max(0, MAX_BRANCHES - (clan.lines.length - 1)))
    const lines = []
    for (const f of founders) {
      const used = new Set(clan.lines.map(l => l.name))
      const name = BRANCH_NAMES.find(n => !used.has(n)) || `Branch ${clan.lines.length}`
      for (const l of clan.lines) l.memberIds = l.memberIds.filter(id => id !== f.id)
      clan.lines.push({ id: `${clan.id}-b${yr}-${f.id}`, name, headId: f.id, memberIds: [f.id], foundedYear: yr })
      f.role = 'branch_head'
      lines.push(`${f.given} leaves to found the ${name}.`)
    }
    return lines
  }

  // Public (UI): join or decline a pending step-down offer — then the WHOLE tournament resolves at once.
  answerStepDown(join) {
    const s = this._s, f = s.family, off = f.stepDownOffer
    if (!off) return { ok: false, reason: 'no_offer' }
    f.stepDownOffer = null
    const clan = this._playerClan()
    if (!clan || clan.headId !== off.headId) return { ok: true, outcome: 'moot' }
    const w = s.world, yr = Math.floor(w.year), head = w.persons[off.headId]
    let pool = off.entrantIds.filter(id => id === s.self.id ? true : w.persons[id] && w.persons[id].alive !== false && !w.persons[id].estranged)
    if (!off.eligible || !join) pool = pool.filter(id => id !== s.self.id)
    f.tally.stepDowns++
    if (pool.length < 2) {
      this.addEvent({ text: `Year ${yr}: no one steps forward. ${head ? Persons.fullName(head) : 'The head'} keeps the seat after all.`, type: 'neutral' })
      return { ok: true, joined: false, outcome: 'no_contest' }
    }
    const lethal = head ? this._headDecidesLethal(head, clan) : true
    this.addEvent({ text: `Year ${yr}: ${pool.length} step forward to contest the seat${lethal ? ', to the death' : ''}.`, type: lethal ? 'negative' : 'neutral' })
    const result = this._runBracket(pool, lethal, yr)
    for (const line of result.lines) this.addEvent({ text: line, type: line.includes('do not rise') ? 'negative' : 'neutral' })
    const joined = pool.includes(s.self.id)
    const youWin = result.winnerId === s.self.id
    if (lethal) clan.tradition.lethalTournaments++; else clan.tradition.peacefulSuccessions++
    let branchLines = []
    if (youWin) {
      this._installHead(clan, s.self.id)
      if (lethal && result.deaths > 0) s.bloodlineQuality = Math.min(BLOODLINE_CAP, (s.bloodlineQuality || 0) + BLOODLINE_G_TRAUMA_HEIR)
      f.tally.stepDownWon++
      branchLines = this._foundBranchesFrom(clan, result.ranking, yr)
      this.addEvent({ text: `Year ${yr}: you stand alone. The clan raises you to the head seat.`, type: 'special' })
    } else {
      this._installHead(clan, result.winnerId)
      branchLines = this._foundBranchesFrom(clan, result.ranking, yr)
      this.addEvent({ text: `Year ${yr}: ${Persons.fullName(w.persons[result.winnerId])} stands alone and takes the head seat.`, type: 'special' })
    }
    for (const line of branchLines) { this.addEvent({ text: line, type: 'neutral' }); clan.history.push({ year: yr, text: line }) }
    clan.history.push({ year: yr, text: `The step-down tournament for the ${clan.name || 'clan'} ends: ${result.deaths} dead, a new head stands.` })
    if (joined && result.selfOut === 'died') {
      this._recalc(); this._notify()
      this._die('stepdown_tournament')
      return { ok: true, joined, lethal, outcome: 'died', deaths: result.deaths }
    }
    this._recalc(); this._notify()
    return { ok: true, joined, lethal, outcome: youWin ? 'won' : (joined ? 'eliminated' : 'watched'), deaths: result.deaths }
  }

  // ── 2.6f (clan-succession.md): branch wars + secession ─────────────────────
  // Only the living player ever starts these (push/declare/secede) — no NPC branch acts on its own here.
  // War strength = sum of _fightPower over a line's living adults (you included); resolved at once, same
  // logistic shape as a 1v1 fight (_resolveFight), just wider (BRANCH_WAR_SPREAD) since it's now aggregate power.

  // Your line, and whether you're on the main line / lead your own line. null off any clan (or an orphan).
  _branchInfo() {
    const s = this._s, clan = this._playerClan()
    if (!clan) return null
    const mine = this._lineOf(clan, s.self.id)
    if (!mine) return null
    return { clan, mine, main: clan.lines[0], isMain: mine === clan.lines[0], isHead: mine.headId === s.self.id }
  }

  // Sum of _fightPower over a line's living, non-estranged adults (you included, via _selfAsPerson()).
  _lineStrength(clan, line) {
    const s = this._s, w = s.world, yr = Math.floor(w.year)
    let total = 0
    for (const id of line.memberIds) {
      if (id === s.self.id) { total += this._fightPower(this._selfAsPerson()); continue }
      const p = w.persons[id]
      if (p && p.alive !== false && !p.estranged && yr - (p.bornYear ?? 0) >= ADULT_AGE) total += this._fightPower(p)
    }
    return total
  }

  // Any OTHER line (not attacker/defender) with a living head rolls a side (1/3 attacker · 1/3 defender ·
  // 1/3 stays out) and lends BRANCH_WAR_ALLY_LINE_SHARE of its own strength if it picks one.
  _branchAllies(clan, attackerLine, defenderLine) {
    let atkBonus = 0, defBonus = 0, lines = []
    for (const line of clan.lines) {
      if (line === attackerLine || line === defenderLine) continue
      const head = line.headId ? this.person(line.headId) : null
      if (!head || head.alive === false) continue
      const share = this._lineStrength(clan, line) * BRANCH_WAR_ALLY_LINE_SHARE, r = Math.random()
      if (r < 1 / 3) { atkBonus += share; lines.push(`${line.name} lends its strength to ${attackerLine.name}.`) }
      else if (r < 2 / 3) { defBonus += share; lines.push(`${line.name} lends its strength to ${defenderLine.name}.`) }
    }
    return { atkBonus, defBonus, lines }
  }

  // A branch head's own call on whether to march: personality + how the numbers look + a bloody clan tradition.
  _branchHeadWarWill(head, clan, atkPower, defPower) {
    let w = BRANCH_WAR_WILL_BASE[head.personality] ?? 15
    const ratio = defPower > 0 ? Math.max(-1, Math.min(1, atkPower / defPower - 1)) : 1
    w += ratio * BRANCH_WAR_WILL_STRENGTH_MULT
    if (this._isBloody(clan)) w += BRANCH_WAR_WILL_BLOODY_BONUS
    return Math.random() * 100 < Math.max(BRANCH_WAR_WILL_RANGE[0], Math.min(BRANCH_WAR_WILL_RANGE[1], w))
  }

  // No pending family matter may overlap a war/secession decision — same "busy" gate chooseHeir/startTournament use.
  _branchWarBusy() {
    const f = this._s.family
    return !!(f.tournament || f.headChallenge || f.stepDownOffer)
  }

  // Public (UI): can you press your branch head to war right now? (member, not head, off cooldown)
  canPushBranchWar() {
    const s = this._s, info = this._branchInfo()
    if (!info) return { ok: false, reason: 'no_branch' }
    if (info.isMain) return { ok: false, reason: 'main_line' }
    if (info.isHead) return { ok: false, reason: 'is_head' }
    if (this._branchWarBusy()) return { ok: false, reason: 'busy' }
    const y = s.world.year, ready = s.family.branchWarCooldownYear
    if (ready != null && y < ready) return { ok: false, reason: 'cooldown', readyYear: ready }
    const head = info.mine.headId ? this.person(info.mine.headId) : null
    if (!head) return { ok: false, reason: 'no_head' }
    return { ok: true, clan: info.clan, mine: info.mine, head }
  }

  // Public (UI): can you declare war on the main line right now? (you lead your own branch, off cooldown)
  canDeclareBranchWar() {
    const s = this._s, info = this._branchInfo()
    if (!info) return { ok: false, reason: 'no_branch' }
    if (info.isMain) return { ok: false, reason: 'main_line' }
    if (!info.isHead) return { ok: false, reason: 'not_head' }
    if (this._branchWarBusy()) return { ok: false, reason: 'busy' }
    const y = s.world.year, ready = s.family.branchWarCooldownYear
    if (ready != null && y < ready) return { ok: false, reason: 'cooldown', readyYear: ready }
    return { ok: true, clan: info.clan, mine: info.mine }
  }

  // Public (UI): can you leave outright and found a new clan? (you lead your own branch — no fight, no cooldown)
  canSecede() {
    const info = this._branchInfo()
    if (!info) return { ok: false, reason: 'no_branch' }
    if (info.isMain) return { ok: false, reason: 'main_line' }
    if (!info.isHead) return { ok: false, reason: 'not_head' }
    if (this._branchWarBusy()) return { ok: false, reason: 'busy' }
    return { ok: true, clan: info.clan, mine: info.mine }
  }

  // Public (UI): rough strength preview for the Stats panel — your line vs. the main line, pre-war.
  branchWarPreview() {
    const info = this._branchInfo()
    if (!info || info.isMain) return null
    return { ours: Math.round(this._lineStrength(info.clan, info.mine)), main: Math.round(this._lineStrength(info.clan, info.main)) }
  }

  // Resolves attackerLine's war on the main line at once. Only ever called with the PLAYER's own line as the
  // attacker (no NPC branch declares on its own — that's M4's job). Aggregate line power (+ uninvolved
  // branches who pick a side) decides the logistic win chance; the losing side's head is deposed unless a
  // death roll hits, in which case they die (you: _die('branch_war'); an NPC: killed outright). The winning
  // line becomes the new main line; the old main line is simply relabeled as a branch.
  _resolveBranchWar(clan, attackerLine) {
    const s = this._s, w = s.world, yr = Math.floor(w.year), f = s.family, mainLine = clan.lines[0]
    const atkBase = this._lineStrength(clan, attackerLine), defBase = this._lineStrength(clan, mainLine)
    const allies = this._branchAllies(clan, attackerLine, mainLine)
    const atk = atkBase + allies.atkBonus, def = defBase + allies.defBonus
    const attackerWins = Math.random() < 1 / (1 + Math.exp(-(atk - def) / BRANCH_WAR_SPREAD))
    const loserLine = attackerWins ? mainLine : attackerLine
    const loserHeadId = loserLine.headId
    const died = Math.random() < (BRANCH_WAR_DEATH_CHANCE + (this._isBloody(clan) ? BRANCH_WAR_DEATH_BLOODY_BONUS : 0))
    if (died) clan.tradition.lethalTournaments++; else clan.tradition.peacefulSuccessions++
    f.branchWarCooldownYear = yr + this._randRange(BRANCH_WAR_COOLDOWN_YEARS)
    f.tally.branchWars = (f.tally.branchWars || 0) + 1
    const lines = [...allies.lines]
    let selfDied = false
    if (loserHeadId === s.self.id) {
      if (died) selfDied = true
    } else if (loserHeadId) {
      const loserHead = w.persons[loserHeadId]
      if (died && loserHead) { this._killPerson(loserHeadId, yr, 'branch_war'); if (attackerWins) s.karma = Math.max(0, s.karma + BRANCH_WAR_KARMA_DEATH) }
      else if (loserHead) loserHead.role = 'elder'
    }
    // The loser no longer holds their line, whether killed or merely deposed — the strongest other living
    // adult in the line takes it over (mirrors _installHead's own branch-demotion pattern).
    const next = loserLine.memberIds.map(id => id === s.self.id ? null : w.persons[id])
      .filter(p => p && p.id !== loserHeadId && p.alive !== false && !p.estranged)
      .sort((a, b) => (b.stageIndex || 0) - (a.stageIndex || 0))[0]
    loserLine.headId = next ? next.id : null
    // The loser's line is never the one that ends up leading the clan (a demoted old main line included).
    if (next) next.role = 'branch_head'
    if (attackerWins) {
      const idx = clan.lines.indexOf(attackerLine)
      clan.lines[0] = attackerLine; clan.lines[idx] = mainLine
      if (mainLine.name === 'Main Line') {
        const used = new Set(clan.lines.map(l => l.name))
        mainLine.name = BRANCH_NAMES.find(n => !used.has(n)) || `Branch ${clan.lines.length}`
      }
      clan.headId = attackerLine.headId
      const newHead = attackerLine.headId ? this.person(attackerLine.headId) : null
      lines.push(`${attackerLine.name} prevails. The ${clan.name || 'clan'} now answers to ${newHead ? Persons.fullName(newHead) : 'no one'}.`)
    } else {
      lines.push(`The main line holds. ${attackerLine.name} is put down.`)
    }
    for (const line of lines) clan.history.push({ year: yr, text: line })
    if (attackerWins) f.tally.branchWarsWon = (f.tally.branchWarsWon || 0) + 1
    for (const line of lines) this.addEvent({ text: line, type: attackerWins ? 'special' : 'negative' })
    if (selfDied) { this._recalc(); this._notify(); this._die('branch_war'); return { ok: true, won: attackerWins, died: true, lines } }
    this._recalc(); this._notify()
    return { ok: true, won: attackerWins, died: false, lines }
  }

  // A branch MEMBER (not its head) presses their branch head to march on the main line. The head decides for
  // themselves — same shape as _headDecidesLethal, just about starting a war instead of fighting one to the death.
  pushBranchWar() {
    const check = this.canPushBranchWar()
    if (!check.ok) return check
    const s = this._s, f = s.family, yr = Math.floor(s.world.year), { clan, mine, head } = check
    const willing = this._branchHeadWarWill(head, clan, this._lineStrength(clan, mine), this._lineStrength(clan, clan.lines[0]))
    if (!willing) {
      f.branchWarCooldownYear = yr + this._randRange(BRANCH_WAR_COOLDOWN_YEARS)
      this.addEvent({ text: `Year ${yr}: you press ${Persons.fullName(head)} to march on the main line. They refuse — not yet.`, type: 'neutral' })
      this._notify()
      return { ok: true, declared: false }
    }
    this.addEvent({ text: `Year ${yr}: ${Persons.fullName(head)} heeds you. The ${mine.name} marches on the main line.`, type: 'negative' })
    return { ok: true, declared: true, ...this._resolveBranchWar(clan, mine) }
  }

  // The branch head declares outright — no persuasion needed, it's your own call.
  declareBranchWar() {
    const check = this.canDeclareBranchWar()
    if (!check.ok) return check
    const { clan, mine } = check, yr = Math.floor(this._s.world.year)
    this.addEvent({ text: `Year ${yr}: you declare war on the main line of the ${clan.name || 'clan'}.`, type: 'negative' })
    return this._resolveBranchWar(clan, mine)
  }

  // A branch head leaves outright with their whole branch, founding a new clan. No fight — the relation between
  // the two clans afterward reads how warm you were with the head you left and your own morality.
  secede() {
    const check = this.canSecede()
    if (!check.ok) return check
    const s = this._s, w = s.world, f = s.family, { clan, mine } = check, yr = Math.floor(w.year)
    const oldHead = clan.headId ? this.person(clan.headId) : null
    const bond = oldHead ? this._bondWithHead(oldHead) : 50
    const relation = Math.max(-100, Math.min(100, Math.round(
      SECESSION_RELATION_BASE + (bond - 50) * SECESSION_RELATION_BOND_MULT + this._selfMorality() * SECESSION_RELATION_MORALITY_MULT)))
    let newName = Persons.rollSurname()
    for (let tries = 0; tries < 8 && newName === clan.name; tries++) newName = Persons.rollSurname()
    clan.lines = clan.lines.filter(l => l !== mine)
    const newClan = this._foundClan(w, newName, s.self.id)
    newClan.lines[0] = { ...mine, id: `${newClan.id}-main`, name: 'Main Line' }
    newClan.relations[clan.id] = relation; clan.relations[newClan.id] = relation
    w.playerClanId = newClan.id; w.playerLineId = newClan.lines[0].id
    f.tally.secessions = (f.tally.secessions || 0) + 1
    const text = `Year ${yr}: ${s.name} leads the ${mine.name} out of the ${clan.name || 'clan'} and founds the ${newName} clan.`
    clan.history.push({ year: yr, text }); newClan.history.push({ year: yr, text })
    this.addEvent({ text, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, clanId: newClan.id, relation }
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
    const free = id === s.inheritedManual   // Phase 31 (2.7c): Family Manual legacy — free once eligible
    if (!free && s.spiritStones < t.cost) return { ok: false, reason: 'stones' }
    if (!free) s.spiritStones -= t.cost
    s.techniques.push(id)
    const clan = this._playerClan()
    if (clan && !clan.techniquesEver.includes(id)) clan.techniquesEver.push(id)   // Phase 31 (2.7b): Family Manual pool
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

    // Lover encounter (family.md): at most one per expedition, max LOVER_ENCOUNTER_MAX pending, never expire.
    // Skipped for a not-yet-migrated save during initSlot()'s offline catch-up (no encounters/clan yet).
    const fam = s.family
    if (fam && Array.isArray(fam.encounters) && s.world && (s.maxStageThisLife || 0) >= PROPOSAL_MIN_STAGE && fam.encounters.length < LOVER_ENCOUNTER_MAX &&
        Math.random() < LOVER_ENCOUNTER_CHANCE) {
      const person = this._rollStranger('stranger')
      const flavor = LOVER_ENCOUNTER_TEXT[Math.floor(Math.random() * LOVER_ENCOUNTER_TEXT.length)]
      fam.encounters.push({ person, place: loc.name, text: flavor, year: Math.floor(s.world.year) })
      this.addEvent({ text: `At ${loc.name}, ${Persons.fullName(person)} ${flavor}. (Explore tab)`, type: 'special' })
      this._emit('lover_encounter', { name: Persons.fullName(person) })
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

    this._claimFirst('first_beast')
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
    this._claimFirst('joined_sect')
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
    this._claimFirst('founded_sect')
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
      this._noteEnemy({ kind: 'sect', name: `the ${w.enemyName}`, why: 'went to war with your sect' })   // 2.6d
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
      if (this._warLive) this._claimFirst('war_won')   // offline catch-up must not change world.clans (save-roundtrip)
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
      if (this._warLive) this._claimFirst('war_won')   // offline catch-up must not change world.clans (save-roundtrip)
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
    if (!w?.side || this._s.interlude) return   // 2.6d: nothing happens between lives
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

    // Phase 31 (M2 task 2.7e, clan-succession.md §2.7): Ancestral catch-up auto-BT is a base mechanic, not one
    // of Phase 22's opt-in automations below — it fires in BOTH Active and Idle Mode, below the clan's best-
    // reached stage only, with the same Ascension-Trial exclusion Auto-Breakthrough already has.
    if (CATCHUP_AUTO_BT && s.derived?.catchUp && s.derived.canBreakthrough && s.stageIndex < CULTIVATION_STAGES.length - 2) {
      const res = this.attemptBreakthrough()
      if (res.success || res.reason === 'failed') this._emit('auto_fire', { system: 'catchup_breakthrough' })
    }

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
