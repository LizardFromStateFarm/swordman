// Central game state — single source of truth.
// All mutation happens through methods; subscribers are notified after each change.

// Phase 42 (arts.md): every art (except the basics everyone knows) comes as a martial art manual — an ITEMS entry
// generated from ARTS so the two never drift. Pack category 'manual' (chip "Arts"); priced by grade in itemValue().
if (typeof ARTS_LIST !== 'undefined' && typeof ITEMS !== 'undefined') {
  for (const a of ARTS_LIST) {
    if (ART_BASICS.includes(a.id)) continue
    ITEMS['manual_' + a.id] = { id: 'manual_' + a.id, name: `${a.name} Manual`, nameCN: a.nameCN, art: a.id,
      desc: `A martial art manual (${ART_RARITY[a.rarity].name} grade, ${ART_ELEMENTS[a.element].name} ${a.kind === 'move' ? 'move' : 'passive'}). Study it to learn ${a.name}.`,
      type: 'manual', stackable: true, category: 'manual' }
  }
}

class GameState {
  constructor() {
    this._s       = null
    this._subs    = []
    this._eventSubs = []   // Phase 29: onGameEvent listeners (banter). Not state.
    this._warLive = true
    this._present = true   // 2026-09-30: is the player actually at the game? game.js sets it each frame (window hidden/unfocused = away)
    this._saveT   = 0
    this._slot    = 0
    this.SAVE_INT = 30
    this._soul    = this._blankSoul()   // Phase 40: cross-save Soul record (NOT in _s) — loadSoul() fills it
  }

  get()         { return this._s    }
  activeSlot()  { return this._slot }
  // 2026-09-30 (user): are you actively playing? The renderer calls this every frame — false while the window is hidden
  // to the tray or unfocused. Used to make absence gentler (affection drifts much slower; see affectionDriftRate()).
  setPresent(present) { this._present = !!present }

  // ── Slot-aware init ───────────────────────────────────────────────────────

  async initSlot(slotIndex) {
    this._slot = slotIndex
    this._saveT = 0
    await this.loadSoul()   // Phase 40: another slot (or the charselect) may have changed it

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
        const healthGain = Math.floor((elapsed / this.healthRegenSeconds()) * HEALTH_REGEN_AMOUNT)   // Phase 14: the body's rate
        if (healthGain > 0) {
          this._ensurePhase23Fields()
          this._s.health = Math.min(this.maxHealth(), (this._s.health ?? 100) + healthGain)
        }
        this._tickBody()   // Phase 14: tempering finished while closed pays out (an ordeal holds at its crisis)
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
    if (this._personaRolled || this._saveAfterLoad) { this._personaRolled = this._saveAfterLoad = false; this._save() }   // persist load-time migrations now
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
      // family-events.js: a bad father's hand — rare beatings while you are young, the defiance they build, and
      // the grown-up reckoning. Filled for old saves by _ensureBeatingFields().
      abuse:            { nextCheck: 0, hits: 0, defiance: 0, event: null, reckon: false, avenged: false },
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
      road:             this._blankRoad(),   // Phase 28 4.9: "Met on the road" (living-world.md §9)
      bestiary:         {},   // Phase 35 (combat.md): per beast type — seen, fought/won/lost/slain/spared/bound, habitsKnown, returning, variants (rare colours met, 2026-09-30)
      bestiarySeenVer:  2,
      arena:            this._blankArena(),   // A6-3b (combat.md): rings, duelists, the run, renown, titles, call-outs
      arts:             null, // Phase 42 (arts.md): known arts, loadout, study, breakthrough offers — filled by _ensurePhase42Fields (needs root elements)
      recipes:          this._blankRecipes(), // Phase 44: which formulas the player knows (the basic ones at start; the rest are discovered)
      hunt:             null, // A6-2: { groundId, startedAt, endsAt, found: encId | null } while tracking on a hunting ground
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
      // Phase 14 (body-constitution.md): the body (every life starts at F) + the mini-game charges (the player's)
      body:              this._blankBody(),
      minigames:         this._blankMinigames(),
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
      inkDefaultMigrated: true,   // A4-4: new lives start on the Ink default; only old saves migrate
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

  // Phase 35 (docs/systems/combat.md): the bestiary. A beast battle in f.fight whose snapshot names an unknown type is
  // dropped by _ensurePhase16Fields' fight guard.
  _ensurePhase35Fields() {
    const s = this._s
    if (!s.bestiary || typeof s.bestiary !== 'object') s.bestiary = {}
    if (s.hunt === undefined || (s.hunt && (typeof s.hunt !== 'object' || !HUNT_GROUNDS.some(g => g.id === s.hunt.groundId)))) s.hunt = null
    // A6-2: what you have already met counts as seen in the Bestiary (companions + beasts waiting), once.
    // 2026-09-30 (user): v2 also records which rare colour variants you have met (from the beasts still around).
    if ((s.bestiarySeenVer || 0) < 2) {
      s.bestiarySeenVer = 2
      for (const b of [...(s.beasts || []), ...(s.beastEncounters || [])]) this._seeBeast(b)
    }
    // A6-3a: a paused step-down bracket (you are in it); a step-down bout without its bracket is dropped
    const f = s.family
    if (f) {
      if (f.bracket === undefined || (f.bracket && (typeof f.bracket !== 'object' || !Array.isArray(f.bracket.pool)))) f.bracket = null
      if (f.fight?.kind === 'stepdown' && !f.bracket) f.fight = null
      if (f.cowedUntilYear === undefined) f.cowedUntilYear = null
    }
    // A6-3b: the Arena; an arena bout whose duelist is gone is dropped (and its run, if any, pays out)
    if (!s.arena || typeof s.arena !== 'object') s.arena = this._blankArena()
    else for (const [k, v] of Object.entries(this._blankArena())) if (s.arena[k] === undefined) s.arena[k] = v
    if (f?.fight?.kind === 'arena' && !s.arena.duelists[f.fight.oppId]) f.fight = null
  }

  _ensurePhase4Fields() {
    const s = this._s
    if (!s.sect) s.sect = { id: null, rank: 0, contribution: 0, activeMissions: [] }
    if (!Array.isArray(s.sect.activeMissions)) s.sect.activeMissions = []
    if (s.sect.rank === undefined)         s.sect.rank         = 0
    if (s.sect.contribution === undefined) s.sect.contribution = 0
    if (s.sect.id === undefined)           s.sect.id           = null
    if (s.sect.masterId === undefined)     s.sect.masterId     = null   // Phase 43e: minted lazily by _sectMaster()
  }

  _blankOwnSect() {
    return { founded: false, name: '', foundedAt: 0, hallLevel: 1, buildings: {}, disciples: [],
             recruitPool: [], poolRefreshAt: 0, _incomeAcc: { spirit_stone: 0, spirit_herb: 0 },
             // Phase 45 (sect-branches.md): sub-leaders + their branches + the Tournament of Branches
             branches: [], branchSeq: 1, tourneyAt: 0, lastTourney: null,
             // Phase 43e (npc-sects.md): a sect taken from its master, and its old guard waiting on your word
             takenOver: null, oldGuard: null, razed: [] }
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
    if (o.takenOver === undefined) o.takenOver = null   // Phase 43e
    if (!Array.isArray(o.razed)) o.razed = []            // Phase 43f: the sects you burned [{ name, year, tier }]
    if (o.oldGuard === undefined)  o.oldGuard = null
  }

  // Phase 43: buildings gained levels. An old save stores `true` for a raised building — make it level 1 (the value
  // it was balanced against); any falsy entry is dropped. A clan's stored sect (2.7d, spread into ownSect when you
  // inherit one) is normalised too, since it is copied in after this runs.
  _ensurePhase43Fields() {
    const norm = bs => { if (!bs) return
      for (const k of Object.keys(bs)) { if (bs[k] === true) bs[k] = 1; else if (!(bs[k] > 0)) delete bs[k] } }
    norm(this._s.ownSect?.buildings)
    const clan = this._playerClan?.()
    if (clan?.sect?.buildings) norm(clan.sect.buildings)
  }

  // Phase 45 (docs/systems/sect-branches.md): sub-leaders, their branches and the Tournament of Branches.
  // Gives every disciple its branch fields (branchId/role/kin/personality) and drops a branch whose head is gone.
  // A disciple's personality is derived from its id (a hash — no new Math.random draws, so sim seeds stay put).
  _ensurePhase45Fields() {
    const o = this._s?.ownSect
    if (!o) return
    if (!Array.isArray(o.branches))   o.branches = []
    if (!(o.branchSeq > 0))           o.branchSeq = 1
    if (o.tourneyAt === undefined)    o.tourneyAt = 0
    if (o.lastTourney === undefined)  o.lastTourney = null
    for (const d of o.disciples || []) {
      if (d.branchId === undefined)    d.branchId = null
      if (d.role === undefined)        d.role = 'disciple'
      if (d.kin === undefined)         d.kin = false
      if (!d.personality)              d.personality = disciplePersonality(d.id)
    }
    // A head who is gone (dismissed, killed) dissolves their branch; ids are kept consistent for the rest.
    const headIds = new Set((o.disciples || []).map(d => d.id))
    o.branches = o.branches.filter(b => headIds.has(b.headId))
    const ids = new Set(o.branches.map(b => b.id))
    for (const b of o.branches) {
      if (b.loyalty == null)                       b.loyalty = SECT_BRANCH.loyaltyStart
      if (b.heat == null)                          b.heat = 0
      if (b.wins == null)                          b.wins = 0
      if (b.losses == null)                        b.losses = 0
      if (b.tourneyWins == null)                   b.tourneyWins = 0
      if (b.since == null)                         b.since = Math.floor(this._s.world?.year || 0)
      if (b.lastRecruitYear == null)               b.lastRecruitYear = b.since
      if (b.rivalId && !ids.has(b.rivalId))        b.rivalId = null
    }
    for (const d of o.disciples || []) {
      if (d.branchId && !ids.has(d.branchId)) { d.branchId = null; if (d.role === 'head') d.role = 'disciple' }
    }
  }

  _blankSectWar(side = null) {
    return { side, phase: 'none', nextWarAt: 0, scoutEndsAt: 0, prepEndsAt: 0,
             enemyName: '', enemyId: null, enemyTier: 0, allyId: null, reinforced: false,
             arrayDamagedUntil: 0, warVictories: 0, warDefeats: 0, lastResult: null,
             // Phase 5C member wars
             answered: false, chestStones: 0, pillsGiven: 0, beastId: null, seen: false,
             buffSuppressedUntil: 0, warsIgnored: 0, warsUnseen: 0, contribNet: 0,
             declaredByYou: false,    // Phase 43h: you (not the world) started this war
             razeVow: false, razeSet: false }   // Phase 43f: burn their mountain if you win · you set/lifted it by hand
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
    if (!WAR_ORDER_RAZE_OPTIONS.includes(o.raze))               o.raze          = WAR_ORDERS_DEFAULT.raze   // Phase 43f
    if (!(typeof o.chestStones === 'number' && isFinite(o.chestStones) && o.chestStones >= 0)) o.chestStones = WAR_ORDERS_DEFAULT.chestStones
    if (!(typeof o.reinforceKeep === 'number' && isFinite(o.reinforceKeep) && o.reinforceKeep >= 0)) o.reinforceKeep = WAR_ORDERS_DEFAULT.reinforceKeep
  }

  _blankAutomation() {
    return {
      autoExplore: false, autoExplorePaused: {}, autoExploreLocationId: null, lastExploreLocationId: null,
      autoSectMissions: false, autoSectMissionIds: [],
      autoCraft: false, autoCraftRecipes: {},
      autoBreakthrough: false, breakthroughThreshold: AUTO_BREAKTHROUGH_THRESHOLD_DEFAULT,
      autoTemper: false, autoTemperId: null,   // Phase 14: repeat a safe tempering (never an ordeal)
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
    if (!a.autoExplorePaused || typeof a.autoExplorePaused !== 'object') a.autoExplorePaused = {}   // legacy (unused since the Mode-panel picker)
    if (typeof a.autoExploreLocationId !== 'string') a.autoExploreLocationId = null                 // null = the last location you sent
    if (a.lastExploreLocationId === undefined) a.lastExploreLocationId = null
    if (typeof a.autoSectMissions !== 'boolean') a.autoSectMissions = false
    // Which missions Auto-Missions keeps running ([] = re-take whichever one just finished). At most one per slot.
    if (!Array.isArray(a.autoSectMissionIds)) a.autoSectMissionIds = []
    a.autoSectMissionIds = [...new Set(a.autoSectMissionIds.filter(id => SECT_MISSIONS.some(m => m.id === id)))].slice(0, SECT_MAX_MISSIONS)
    if (!(a._slotAcc >= 0)) a._slotAcc = 0
    // Per-beast Auto-Expedition (Lv.BEAST_AUTO_EXPEDITION_LEVEL+): autoExp on/off, autoExpLocId (null = its last trip)
    for (const b of s.beasts || []) {
      if (typeof b.autoExp !== 'boolean') b.autoExp = false
      if (typeof b.autoExpLocId !== 'string') b.autoExpLocId = null
      if (typeof b.lastExpLocId !== 'string') b.lastExpLocId = b.expedition?.locationId || null
    }
    if (typeof a.autoCraft !== 'boolean') a.autoCraft = false
    if (!a.autoCraftRecipes || typeof a.autoCraftRecipes !== 'object') a.autoCraftRecipes = {}
    if (typeof a.autoBreakthrough !== 'boolean') a.autoBreakthrough = false
    if (!(typeof a.breakthroughThreshold === 'number' && isFinite(a.breakthroughThreshold) &&
          a.breakthroughThreshold >= AUTO_BREAKTHROUGH_THRESHOLD_MIN && a.breakthroughThreshold <= AUTO_BREAKTHROUGH_THRESHOLD_MAX))
      a.breakthroughThreshold = AUTO_BREAKTHROUGH_THRESHOLD_DEFAULT
    if (!(a._craftAcc >= 0)) a._craftAcc = 0
    if (typeof a.autoTemper !== 'boolean') a.autoTemper = false   // Phase 14
    if (a.autoTemperId != null && !['drill', 'spirit'].includes(TEMPERING_METHODS.find(m => m.id === a.autoTemperId)?.group)) a.autoTemperId = null
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
    // A4-4: Ink became the default Sprite art. Saves from before it sit on the old Classic default (indistinguishable
    // from a deliberate pick), so they move to Ink once, with a log line naming how to switch back.
    if (s.inkDefaultMigrated === undefined) {
      if (s.settings.artStyle === 'classic') {
        s.settings.artStyle = 'ink'
        s.events = s.events || []
        s.events.unshift({ text: 'The world is repainted in ink. (Prefer the old ASCII? Settings → Sprite art → Classic.)',
          type: 'special', ts: Date.now() })
      }
      s.inkDefaultMigrated = true
      this._saveAfterLoad = true   // persist the migration now (load() saves right after _recalc)
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
             enemies: [], lastClanId: null,
             chron: [], chronSeq: 0, chronSeen: 0,   // Phase 28 (4.6): the merged world Chronicle
             rep: { h: 0, i: 0, log: [] }, rumours: [],   // 4.10: your Honour / Infamy + the rumours on their way
             rivals: [], rivalHouses: {},                  // 4.10b: one rivalry record per life + the lines that carry a rivalry on
             ranks: null }                                 // 4.8: the Heavenly Rankings (built lazily by _ranks())
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
      library: [],   // 1.14b: the clan library — [{ artId, by, gen, year }], kept across lives (Kin → Hall)
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
                     bestStageIndex: 0, ascendedAncestors: 0, blessingStacks: 0, library: [] }
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
      this._regKeep(p, { role, grownYear: yr })   // 2.6d: NPC growth continues from here (_advancePersons); Phase 28 keeps rel/mem/sect
      if (clan && p.alive !== false) this._joinClan(w, clan, p.id, w.playerLineId)
    }
    if (f.spouse) keep(f.spouse, 'spouse')
    for (const x of f.formerSpouses || []) this._regKeep(x, { role: 'former_spouse' })
    for (const c of f.children || []) {
      if (c.estranged) this._regKeep(c, { role: 'estranged' })   // left the clan: in the world, off the roster
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
      // Phase 46 (1.20b): `clan.sect` stays the clan's light claim (the stipend + the "a sect took the clan's"
      // note); the world record itself is minted just below, outside this clan block, so an orphan keeps theirs too.
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
    // Phase 46 (1.20b, lineage-sect.md): a founded sect outlives the player — a branch head inherits it and it keeps
    // living as a world sect. Runs for an orphan founder too (no clan needed), and points the clan's claim at it.
    if (s.ownSect?.founded) {
      const rec = this._wsFromOwnSect(s.ownSect, w)
      if (clan?.sect) clan.sect.worldSectId = rec ? rec.id : null
    }
    this._rivalLifeEnds(cause, yr)   // 4.10b: the rivalry is closed, and a strong one passes to the next life as a house
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

  // ── Bequest (user 2026-10-02): carry N arts + N items into your next life (N = the reincarnation you are on) ──
  // Free every life and personal — not clan-gated, so it rides an orphan rebirth too (unlike the legacies above).
  // The pool is snapshotted at death (_bequestPool), shown in the interlude, picked by the player (toggleBequest),
  // then handed over in _applyBequest.

  _bequestMax(reincarnation) {
    const n = Math.max(0, reincarnation | 0)
    return { arts: Math.min(BEQUEST_MAX_ARTS, n * BEQUEST_ARTS_PER_REINCARNATION),
             items: Math.min(BEQUEST_MAX_ITEMS, n * BEQUEST_ITEMS_PER_REINCARNATION) }
  }

  // The dying life's pickable pool: known combat arts (never the basics everyone starts with) + pack items (never
  // currency). Best first, so the UI and the sim bot lead with the strongest.
  _bequestPool() {
    const s = this._s, arts = [], items = []
    for (const [id, rec] of Object.entries(s.arts?.known || {})) {
      const a = ARTS[id]
      if (!a || ART_BASICS.includes(id)) continue
      arts.push({ id, name: a.name, rarity: a.rarity, element: a.element, kind: a.kind, mastery: rec?.mastery || 1 })
    }
    arts.sort((a, b) => (ART_RARITY_ORDER.indexOf(b.rarity) - ART_RARITY_ORDER.indexOf(a.rarity)) || a.name.localeCompare(b.name))
    for (const [id, n] of Object.entries(s.inventory || {})) {
      const it = ITEMS[id]
      if (!(n > 0) || !it || it.type === 'currency' || it.category === 'currency') continue
      items.push({ id, name: it.name, category: it.category, qty: n })
    }
    items.sort((a, b) => (b.qty - a.qty) || a.name.localeCompare(b.name))
    return { arts, items }
  }

  // The interlude's bequest picker: toggle one art or item into (or out of) what you carry forward, bounded by the
  // reincarnation count. An explicit player choice — never rolled, never simulated.
  toggleBequest(kind, id) {
    const it = this._s.interlude
    if (!it || it.step !== 'chronicle') return { ok: false, reason: 'not_ready' }
    if (kind !== 'arts' && kind !== 'items') return { ok: false, reason: 'bad_kind' }
    if (!(it.bequestPool?.[kind] || []).some(x => x.id === id)) return { ok: false, reason: 'not_owned' }
    it.bequest = it.bequest || { arts: [], items: [] }
    const list = it.bequest[kind] = it.bequest[kind] || []
    const i = list.indexOf(id)
    if (i >= 0) list.splice(i, 1)
    else {
      const max = (it.bequestMax || {})[kind] || 0
      if (list.length >= max) return { ok: false, reason: 'full' }
      list.push(id)
    }
    this._notify()
    return { ok: true, picked: [...list] }
  }

  // Hand the bequested arts + items to the new life at _beginLife(). Not clan-gated. Builds s.arts first — a fresh
  // life's is null until the _ensure chain runs — then writes directly (one log line, not one per art).
  _applyBequest(it) {
    const arts = it?.bequest?.arts || [], items = it?.bequest?.items || []
    if (!arts.length && !items.length) return
    const s = this._s
    if (arts.length) {
      this._ensurePhase42Fields()
      for (const id of arts) {
        if (!ARTS[id] || s.arts.known[id]) continue
        s.arts.known[id] = { mastery: 1, xp: 0, uses: 0, how: 'bequest', at: Date.now() }
        s.arts.found[id] = true
      }
    }
    const itemBits = []
    for (const id of items) {
      const pick = (it.bequestPool?.items || []).find(x => x.id === id)
      if (!pick) continue
      s.inventory[id] = (s.inventory[id] || 0) + (pick.qty || 1)
      itemBits.push(`${pick.name}${pick.qty > 1 ? ` ×${pick.qty}` : ''}`)
    }
    if (s.lastReincarnation) s.lastReincarnation.bequest = { arts: [...arts], items: [...items] }
    const bits = []
    if (arts.length) bits.push(`${arts.length} art${arts.length === 1 ? '' : 's'} (${arts.map(id => ARTS[id]?.name).filter(Boolean).join(', ')})`)
    if (itemBits.length) bits.push(itemBits.join(', '))
    if (bits.length) this.addEvent({ text: `Your past life's bequest passes to you: ${bits.join(' · ')}.`, type: 'special' })
  }

  // Public (UI, read-only): the family tree (user 2026-10-03) — your blood around you, by generation: up to three
  // generations of ancestors (gen −3..−1), you + siblings + partners (0), children and their partners (+1),
  // grandchildren (+2). A past life of yours that sits in the line is marked; earlier lives outside it are listed.
  // nodes: { id, name, rel, gen, parents[], alive, age, diedYear, cause, stage, personality, rootType, morality,
  //          bond?, affection?, pastLife?, ascended?, head?, heir?, you?, open: 'child'|'spouse'|'lover'|null, former? }
  familyTreeInfo() {
    const s = this._s, w = s.world, f = s.family || {}, yr = Math.floor(w?.year || 0)
    if (!w || !s.self) return null
    const clan = this._playerClan(), heirId = f.heirId || null
    const lives = new Map((w.pastLives || []).map((l, i) => [l.personId, { gen: l.generation || i + 1, year: l.year, cause: l.cause }]))
    const nodes = new Map()
    const add = (p, rel, gen, extra = {}) => {
      if (!p?.id || nodes.has(p.id)) return nodes.get(p?.id) || null
      const life = lives.get(p.id)
      const n = { id: p.id, name: Persons.fullName(p) || 'Nameless', rel, gen, parents: (p.parents || []).filter(Boolean),
        alive: p.alive !== false, age: Math.max(0, Math.floor(((p.alive === false ? p.diedYear : null) ?? yr) - (p.bornYear || yr))),
        diedYear: p.diedYear ?? null, cause: p.cause || null, stage: p.stageIndex || 0,
        personality: PERSONALITIES.find(x => x.id === (p.personality?.id || p.personality))?.name || '',
        rootType: p.root?.type || null, rootName: p.root?.name || null, rootMult: p.root?.mult ?? null, morality: p.morality ?? null,
        pastLife: life ? life.gen : null, ascended: !!p.ascendedAncestor, head: !!clan && clan.headId === p.id,
        heir: p.id === heirId, estranged: !!p.estranged, open: null, ...extra }
      nodes.set(p.id, n)
      return n
    }
    const me = { ...this._selfAsPerson(), given: s.self.given || s.name, family: s.self.family }
    add(me, 'You', 0, { you: true, name: s.name, stage: s.stageIndex, personality: s.personality?.name || '', rootType: s.root?.type || null, rootName: s.root?.name || null, rootMult: s.root?.mult ?? null })
    // Ancestors: each parent's parents, three generations up
    const relUp = ['Parent', 'Grandparent', 'Great-grandparent']
    let wave = [me]
    for (let d = 1; d <= 3; d++) {
      const next = []
      for (const c of wave) for (const pid of c.parents || []) { const p = this.person(pid); if (p && add(p, relUp[d - 1], -d)) next.push(p) }
      wave = next
    }
    // Siblings: anyone who shares a parent with you (full or half), oldest first
    const myParents = new Set(me.parents || [])
    if (myParents.size) {
      Object.values(w.persons).filter(p => p.id !== me.id && (p.parents || []).some(x => myParents.has(x)))
        .sort((a, b) => (a.bornYear || 0) - (b.bornYear || 0))
        .forEach(p => add(p, (p.parents || []).every(x => myParents.has(x)) && p.parents.length === myParents.size ? 'Sibling' : 'Half-sibling', 0))
    }
    // Partners: your spouse, former spouses, and any lover who is a parent of your child
    if (f.spouse) add(f.spouse, 'Spouse', 0, { open: 'spouse', affection: f.affection ?? null })
    for (const x of f.formerSpouses || []) add(x, 'Former spouse', 0, { former: true, endCause: x.endCause || null })
    const kids = f.children || []
    for (const l of f.lovers || []) if (kids.some(c => (c.parents || []).includes(l.person?.id))) add(l.person, 'Lover', 0, { open: 'lover', former: true })
    // Children (with their partners) and grandchildren
    for (const c of [...kids].sort((a, b) => (a.bornYear || 0) - (b.bornYear || 0))) {
      add(c, 'Child', 1, { open: c.alive !== false && !c.estranged ? 'child' : null, bond: c.bond ?? null })
      for (const sid of c.spouseIds || []) { const sp = this.person(sid); if (sp) add(sp, "Child's spouse", 1, { partnerOf: c.id }) }
    }
    const kidIds = new Set(kids.map(c => c.id))
    Object.values(w.persons).filter(p => (p.parents || []).some(x => kidIds.has(x)))
      .sort((a, b) => (a.bornYear || 0) - (b.bornYear || 0)).forEach(p => add(p, 'Grandchild', 2))
    // Earlier lives of yours that are not in this line (an orphan rebirth, a branch birth, another clan)
    const otherLives = [...lives.entries()].filter(([id]) => !nodes.has(id)).map(([id, l]) => {
      const p = w.persons[id]
      return { id, name: Persons.fullName(p) || 'Nameless', gen: l.gen, year: l.year, cause: l.cause, stage: p?.maxStage ?? p?.stageIndex ?? 0, ascended: !!p?.ascendedAncestor }
    }).sort((a, b) => a.gen - b.gen)
    return { nodes: [...nodes.values()], otherLives, year: yr, clanName: clan?.name || null, selfId: me.id,
             counts: { parents: [...nodes.values()].filter(n => n.gen === -1).length,
                       siblings: [...nodes.values()].filter(n => /sibling/i.test(n.rel)).length,
                       children: kids.length } }
  }

  // A person by id: the living player, or the world registry.
  person(id) {
    const s = this._s
    return id === s.self?.id ? s.self : (s.world.persons[id] || null)
  }

  // ── Phase 28 (living-world.md §5, task 4.2): one registry of persons ──────────────────────────────────────────
  // world.persons is the only home of a person's identity + life. Systems with richer relationship state keep their
  // own object (family copies, arena duelists, own-sect disciples) and are mirrored here by _syncPersons(): the
  // owner's copy wins for PERSON_LIFE_KEYS; the registry keeps the world's fields (rel, mem, ties, fam, sectId…).

  // Copy an owner's life fields onto the registry record (creating it), then apply `extra`. Returns the record.
  _regMerge(src, extra = {}) {
    const w = this._s.world
    const p = w.persons[src.id] || Persons.make({ id: src.id })
    for (const k of PERSON_LIFE_KEYS) {
      const v = src[k]
      if (v === undefined) continue
      p[k] = Array.isArray(v) ? [...v] : (v && typeof v === 'object') ? { ...v } : v
    }
    Object.assign(p, extra)
    Persons.stampV2(p)
    w.persons[src.id] = p
    return p
  }

  // A whole owner object into the registry (end of a life: _recordLifeInWorld), keeping the world's own fields.
  _regKeep(src, extra = {}) {
    const w = this._s.world, old = w.persons[src.id], keep = {}
    if (old) for (const k of Object.keys(Persons.v2Defaults())) if (k !== 'owner' && old[k] !== undefined) keep[k] = old[k]
    if (old?.sectId === undefined && src.sectId) keep.sectId = src.sectId
    const p = Persons.stampV2({ ...(old || {}), ...src, ...keep, owner: 'world', ...extra })
    w.persons[src.id] = p
    return p
  }

  // A new person, drawn from a seeded rng (never Math.random — minting must not shift the sim's seeds).
  _mintPerson({ family = null, given = null, stage = 1, age = [20, 60], personality = null, root = null, role = 'wanderer',
                sectId = null, sectRole = null } = {}, rng) {
    const w = this._s.world, yr = Math.floor(w.year || 1)
    const pick = a => a[Math.floor(rng() * a.length)]
    const st = Math.max(0, Math.min(NPC_STAGE_CAP, Math.round(stage)))
    const pers = personality && PERSONALITIES.some(x => x.id === personality) ? personality : pick(PERSONALITIES).id
    // World-minted people take their own id series ('n…'), so minting never shifts the ids (and the id-seeded arts)
    // of the family's people, which still count on w.nextId.
    w.nextNpcId = w.nextNpcId || 1
    // 4.3: a new person never takes a living or remembered name (living-world.md §12.5): a few tries, then accept.
    if (this._namesFor !== w) { this._namesFor = w; this._names = new Set(Object.values(w.persons).map(x => Persons.fullName(x))) }
    const fam = family ?? pick(SURNAMES)
    let gv = given || pick(GIVEN_NAMES)
    for (let i = 0; !given && i < 6 && this._names.has(fam ? `${fam} ${gv}` : gv); i++) gv = pick(GIVEN_NAMES)
    this._names.add(fam ? `${fam} ${gv}` : gv)
    const p = Persons.make({ id: 'n' + (w.nextNpcId++), given: gv, family: fam,
      bornYear: yr - (age[0] + Math.floor(rng() * (age[1] - age[0] + 1))), root: root || this._rngRoot(rng),
      personality: pers, stageIndex: st, maxStage: st, role, alive: true, sectId, sectRole })
    p.morality = Math.max(-100, Math.min(100, Math.round((PERSONALITY_MORALITY[pers] ?? 0) + (rng() * 2 - 1) * MORALITY_NOISE)))
    p.grownYear = yr
    w.persons[p.id] = p
    return p
  }

  // Persons.rollRoot's odds on a seeded rng.
  _rngRoot(rng) {
    const r = rng(), els = ['fire', 'water', 'earth', 'wood', 'metal'], el = els[Math.floor(rng() * els.length)]
    return this._rootOfType(r < 0.01 ? 'heavenly' : r < 0.05 ? 'pure' : r < 0.25 ? 'dual' : 'mixed', el)
  }
  _rootOfType(type, el = 'water') {
    switch (type) {
      case 'heavenly': return { type: 'heavenly', name: '天灵根 Heavenly Root', mult: 3.0 }   // cjk-ok: root name data; UI strips it with latinOnly()
      case 'pure':     return { type: 'pure',     name: `纯灵根 Pure ${el} Root`, mult: 1.8 }   // cjk-ok: root name data; UI strips it with latinOnly()
      case 'dual':     return { type: 'dual',     name: '双灵根 Dual Root', mult: 1.4 }   // cjk-ok: root name data; UI strips it with latinOnly()
      default:         return { type: 'mixed',    name: '杂灵根 Mixed Root', mult: 1.0 }   // cjk-ok: root name data; UI strips it with latinOnly()
    }
  }

  // An own-sect disciple's person (minted the first time; a recruited child IS the child's person).
  _disciplePerson(d) {
    const w = this._s.world, P = WORLD_PEOPLE
    if (!d) return null
    let p = null
    if (d.kin && d.childId) { d.pid = d.childId; p = w.persons[d.childId] || null }
    else {
      p = d.pid ? w.persons[d.pid] || null : null
      if (!p) {
        const rng = wsRng(`${d.id}|disciple`)
        const parts = String(d.name || 'Nameless').split(' ')
        const talent = d.talent || 1
        p = this._mintPerson({ family: parts.length > 1 ? parts[0] : '', given: parts.length > 1 ? parts.slice(1).join(' ') : parts[0],
          stage: 1, age: P.discipleAge, personality: d.personality, role: 'disciple',
          root: this._rootOfType(talent >= 5 ? 'heavenly' : talent >= 4 ? 'pure' : talent >= 3 ? 'dual' : 'mixed', ['fire', 'water', 'earth', 'wood', 'metal'][Math.floor(rng() * 5)]) }, rng)
        d.pid = p.id
      }
      p.owner = 'sect'
      const st = Math.max(1, Math.min(NPC_STAGE_CAP, Math.round((d.level || 1) * P.discipleStagePerLevel)))
      p.stageIndex = Math.max(p.stageIndex || 0, st); p.maxStage = Math.max(p.maxStage || 0, p.stageIndex)
      if (d.personality) p.personality = d.personality
      if (p.alive !== false) p.role = d.role === 'head' ? 'branch_head' : 'disciple'
    }
    if (p) { p.sectId = 'own'; p.sectRole = d.role === 'head' ? 'elder' : 'disciple' }
    return p
  }

  // Mirror every owner's people into the registry and release the ones an owner let go (living-world.md §5).
  // Cheap (owners hold < ~100 people); runs on every save and every game year.
  _syncPersons() {
    const s = this._s, w = s?.world
    if (!w?.persons || !s.self) return
    const owned = new Set(), f = s.family || {}, me = s.self.id
    const fam = (p, role) => {
      if (!p?.id || p.id === me || owned.has(p.id)) return
      this._regMerge(p, { owner: 'family', role }); owned.add(p.id)
    }
    fam(f.spouse, 'spouse')
    for (const x of f.formerSpouses || []) fam(x, 'former_spouse')
    for (const l of f.lovers || []) fam(l.person, 'lover')
    for (const c of f.children || []) fam(c, c.estranged ? 'estranged' : 'child')
    for (const e of f.encounters || []) fam(e.person, 'stranger')
    for (const x of f.proposal?.suitors || []) fam(x, 'suitor')
    for (const x of f.court?.candidates || []) fam(x, 'suitor')
    for (const x of f.spurned || []) fam(x.person, 'suitor')
    for (const p of Object.values(s.arena?.duelists || {})) {
      if (!p?.id || owned.has(p.id)) continue
      this._regMerge(p, { owner: 'arena', role: 'duelist' }); owned.add(p.id)
    }
    const ownPids = new Set()
    if (s.ownSect?.founded) for (const d of s.ownSect.disciples || []) {
      const p = this._disciplePerson(d)
      if (p) { ownPids.add(p.id); owned.add(p.id) }
    }
    const live = new Set(this._wsAll().filter(r => r.alive).map(r => r.id))
    for (const p of Object.values(w.persons)) {
      if (p.owner && p.owner !== 'world' && !owned.has(p.id)) p.owner = 'world'
      const gone = p.sectId === 'own' ? !ownPids.has(p.id) : (p.sectId && !live.has(p.sectId))
      if (gone) {
        p.sectId = null; p.sectRole = null
        if (p.alive !== false && ['disciple', 'branch_head', 'sect_master', 'sect_elder'].includes(p.role)) p.role = 'wanderer'
      }
    }
  }

  // Public (UI): the person card — who they are, what they are to you, where to act on them. Null if unknown.
  personInfo(pid) {
    const s = this._s, w = s.world
    if (pid && pid !== s.self?.id && !w.persons[pid]) {   // shown before the next save mirrored them
      this._syncPersons()
      const d = (s.ownSect?.disciples || []).find(x => x.id === pid)   // a disciple row may carry its own id
      if (d?.pid) pid = d.pid
    }
    const p = pid === s.self?.id ? null : w.persons[pid]
    if (!p) return null
    const yr = Math.floor(w.year), alive = p.alive !== false
    const name = id => { const x = this.person(id); return x ? { pid: x.id, name: id === s.self.id ? 'You' : Persons.fullName(x) || 'Nameless' } : null }
    const sect = p.sectId === 'own' ? { name: s.ownSect?.name || 'your sect', own: true }
      : p.sectId ? (() => { const r = this._wsRec(p.sectId); return r ? { id: r.id, name: r.name } : null })() : null
    const mor = typeof p.morality === 'number' ? MORALITY_WORDS.find(m => p.morality >= m.min) : null
    const f = s.family || {}
    const rel = f.spouse?.id === pid ? 'Your spouse' : (f.children || []).some(c => c.id === pid) ? 'Your child'
      : (f.lovers || []).some(l => l.person?.id === pid) ? 'Your lover' : (f.formerSpouses || []).some(x => x.id === pid) ? 'Your former spouse'
      : (s.self.parents || []).includes(pid) ? 'Your parent' : w.pastLives.some(l => l.personId === pid) ? 'A past life of yours' : null
    const kin = []
    for (const id of p.parents || []) { const n = name(id); if (n) kin.push({ ...n, rel: 'parent' }) }
    for (const id of p.spouseIds || []) { const n = name(id); if (n) kin.push({ ...n, rel: 'spouse' }) }
    for (const c of Object.values(w.persons)) if ((c.parents || []).includes(pid)) kin.push({ pid: c.id, name: Persons.fullName(c), rel: 'child' })
    if ((p.parents || []).length === 0 && (f.children || []).some(c => (c.parents || []).includes(pid)))
      for (const c of f.children) if ((c.parents || []).includes(pid) && !kin.some(k => k.pid === c.id)) kin.push({ pid: c.id, name: Persons.fullName(c), rel: 'child' })
    // Where to act on them today (existing systems; the card's own actions arrive in 4.10).
    const go = []
    if (f.spouse?.id === pid || (f.lovers || []).some(l => l.person?.id === pid) || (f.children || []).some(c => c.id === pid)) go.push({ view: 'family', label: 'Kin → Family' })
    if (p.owner === 'arena') go.push({ view: 'arena', label: 'Roam → Arena' })
    if (p.sectId === 'own') go.push({ view: 'sect-disciples', label: 'Sect → Disciples' })
    else if (sect?.id) go.push({ view: 'world', sectId: sect.id, label: `The ${sect.name}` })
    if ((f.encounters || []).some(e => e.person?.id === pid) || (s.road?.cards || []).some(c => c.pid === pid)) go.push({ view: 'explore', label: 'Roam → Explore' })
    return {
      pid, name: Persons.fullName(p) || 'Nameless', alive, age: Math.max(0, yr - (p.bornYear ?? yr)),
      stage: p.stageIndex || 0, maxStage: p.maxStage || p.stageIndex || 0, diedYear: p.diedYear ?? null,
      cause: p.cause ? (PERSON_CAUSE_TEXT[p.cause] || 'Passed on') : null,
      rootName: p.root?.name || null, rootMult: p.root?.mult || null,
      temper: PERSONALITIES.find(x => x.id === p.personality)?.name || null,
      morality: mor ? { word: mor.word, tone: mor.tone } : null,
      body: BODY_TIER_LETTERS[p.bodyTier || 0] || 'F',
      role: PERSON_ROLE_TEXT[p.role] || (p.role ? String(p.role).replace(/_/g, ' ') : 'Cultivator'),
      sectRole: p.sectRole, sect, toYou: rel, relScore: p.rel || 0,
      // 4.10: every memory with what it moved (d) and whether a past life of yours earned it; "older" = what the
      // memories they no longer name still add (rumours trimmed, a gift long ago, a forebear's halved debt).
      memories: (p.mem || []).slice(-3).map(m => ({ ...m, past: m.life != null && m.life < this._lifeNo() })),
      relWhy: (() => {
        const items = (p.mem || []).filter(m => typeof m.d === 'number' && m.d).map(m => ({ text: m.text || m.k, d: m.d, y: m.y, n: m.n || 1, past: m.life != null && m.life < this._lifeNo() }))
        const older = (p.rel || 0) - items.reduce((a, m) => a + m.d, 0)
        return { items: items.reverse(), older: Math.abs(older) >= 1 ? Math.round(older) : 0 }
      })(),
      sworn: !!p.sworn && p.sworn === s.self?.id,
      rank: alive ? this.rankOf(pid) : null, rankBest: p.rankBest || null, hunter: !!p.hunter,   // 4.8
      rival: this._isRival(p) ? (({ w: word, tone }) => ({ word, tone, heat: this._rivalRec().heat }))(this._rivalWord(this._rivalRec().heat))
        : p.rivalOf ? { word: 'Rival of a past life', tone: '', heat: null } : null,   // 4.10b
      // Family already keeps how they feel about you (bond / affection); the world's rel takes over for everyone else (4.10).
      feel: f.spouse?.id === pid && typeof f.affection === 'number' ? { label: 'Affection', v: Math.round(f.affection) }
        : (() => { const c = (f.children || []).find(x => x.id === pid); return c && typeof c.bond === 'number' ? { label: 'Bond', v: Math.round(c.bond) } : null })(),
      bodyKnown: (p.bodyTier || 0) > 0,
      kin: kin.slice(0, 8), go, pinned: !!p.pin, seen: p.fam || 0,
      // 4.3: their life — the span they can hope for, the warning beats, their class.
      span: alive && p.owner !== 'family' ? this._lifespan(p) : null, twilight: alive && !!p.twilight,
      injured: alive && (p.injuredUntil || 0) > yr ? p.injuredUntil - yr : 0, ascended: !!p.ascended, chosen: !!p.chosen,
      classmate: p.cohort == null ? null : p.cohort === this._lifeNo() ? 'Your classmate' : `Your classmate in life ${p.cohort}`,
      ...(alive && p.owner !== 'family' ? this._personNow(p) : { now: null, ties: [], feud: null, heavy: false, killedBy: this._personNow(p).killedBy }),   // 4.4: Now + ties
    }
  }

  // Public (UI): a name was shown to the player on a card — familiarity grows (living-world.md §6.4).
  notePersonSeen(pid) {
    const p = this._s.world?.persons?.[pid]
    if (p) { p.fam = (p.fam || 0) + 1; p.seenY = Math.floor(this._s.world.year || 0) }
  }

  // Phase 28 migration: v2 fields on every registry person, every owner's people mirrored, and every world sect's
  // master + elders made real people. The heavy pass runs once (w.peopleV); later people arrive through
  // _syncPersons / _wsEnsurePeople as they appear.
  _ensurePhase28Fields() {
    const s = this._s, w = s?.world
    if (s && !s.road) s.road = this._blankRoad()   // 4.9: encounters
    if (w?.persons && s.self && w.peopleV >= 1 && this._syncedFor !== s) { this._syncedFor = s; this._syncPersons() }   // once per load
    if (w?.persons && s.self && w.peopleV >= 1) {   // 4.3: the pre-existing world (once per slot) + this life's class
      if (!w.worldSeedV) { this._seedWorldPeople(); w.worldSeedV = 1 }
      if (!s.interlude && !w.cohorts?.[this._lifeNo()]) this._seedCohort()
      else if (!s.interlude && !this._rivalRec()) this._pickRival()   // 4.10b: a save from before Your Rival
      if (w.livesYear == null) w.livesYear = Math.floor(w.year)
      if (w.seasonAt == null) w.seasonAt = Math.floor(w.year * NPC_HEAVY.seasons)   // 4.4: no catch-up for the seasons before 4.4
      // 4.6: the merged Chronicle starts from the sects' own short chronicle (once).
      if (!Array.isArray(w.chron)) {
        w.chron = []; w.chronSeq = 0
        for (const c of w.sects?.chronicle || []) this._chron({ k: 'sect', t: c.text, s: c.sectId, y: c.year })
        w.chronSeen = w.chronSeq
      }
      if (w.peopleSeen == null) w.peopleSeen = w.chronSeq || 0   // 4.7: World → People's "news of the pinned" mark
    }
    if (!w?.persons || !s.self || w.peopleV >= 1) return
    for (const p of Object.values(w.persons)) Persons.stampV2(p)
    Persons.stampV2(s.self)
    this._syncPersons()
    for (const r of this._wsAll()) if (r.alive) this._wsEnsurePeople(r)
    w.peopleV = 1
    this._ensurePhase28Fields()   // 4.3: seed the world + the class now that the registry is stamped
  }

  // Public (QA + the sim report): how big the save has grown (living-world.md §10).
  worldSizeInfo() {
    const s = this._s, slot = JSON.stringify(s).length, world = JSON.stringify(s.world || {}).length
    const ps = Object.values(s.world?.persons || {})
    return { slotBytes: slot, worldBytes: world, persons: ps.length, living: ps.filter(p => p.alive !== false).length,
             budgetSlot: WORLD_PEOPLE.slotBudgetBytes, budgetWorld: WORLD_PEOPLE.worldBudgetBytes }
  }

  // ── Phase 28 task 4.3 (living-world.md §6): the light world sim — the world's people live, wed, fall and Ascend ──
  // Game time only (the yearly tick, plus the generation skipped between lives); the world is frozen while closed.
  // Seeded per person + year (wsRng): the step never draws Math.random, so the sim's other seeds don't shift.

  _lifeRealm(stage) { return CULTIVATION_STAGES[Math.max(0, Math.min(NPC_STAGE_CAP, stage || 0))]?.realm || 'Mortal' }
  // A person's lifespan in years: the realm of their peak stage, ± a per-person jitter.
  _lifespan(p) {
    const L = NPC_LIVES, base = L.lifespanByRealm[this._lifeRealm(Math.max(p.maxStage || 0, p.stageIndex || 0))] || 150
    return Math.round(base * (1 + (wsRng(`${p.id}|span`)() * 2 - 1) * L.lifespanJitter))
  }
  _lifeNo() { return (this._s.world.pastLives || []).length + 1 }
  _playerBorn() { const s = this._s; return Math.round(s.world.year - (s.age ?? AWAKENING_AGE)) }

  // Grows one person up to `year` (stage pace × talent, slowed while injured). With `rolls`, crossing into a new realm
  // is a breakthrough that can fail: injured (back to half a stage, slowed) or, higher up, killed by the backlash.
  // Returns { up: realm reached | null, injured, died }. `boost` (4.6): the replacement controller's pace × for the band
  // just below a thin one (1 = none).
  _growPerson(p, year, rolls = false, boost = 1) {
    const out = { up: null, injured: false, died: false }
    const from = Math.max(p.grownYear ?? year, (p.bornYear ?? 0) + AWAKENING_AGE)
    p.grownYear = year
    if (year <= from || (p.stageIndex || 0) >= NPC_STAGE_CAP) return out
    let left = year - from, xp = p.npcXp || 0
    p.stageIndex = p.stageIndex || 0
    while (left > 0 && p.stageIndex < NPC_STAGE_CAP) {
      const slow = p.injuredUntil && p.injuredUntil > year - left ? NPC_LIVES.injuredMult : 1
      const taught = p.mentorUntil && p.mentorUntil > year - left ? NPC_ACTS.mentor.mult : 1   // 4.10: you taught them
      const rate = this._npcStageRate(p.stageIndex, p.root?.mult || 1, NPC_YEARS_PER_STAGE / (p.talent || 1)) * slow * boost * taught
      const need = (1 - xp) / rate
      if (left < need) { xp += left * rate; left = 0; break }
      left -= need; xp = 0
      const next = p.stageIndex + 1, realm = this._lifeRealm(next)
      if (rolls && p.stageIndex >= 1 && realm !== this._lifeRealm(p.stageIndex)) {
        const L = NPC_LIVES, rng = wsRng(`${p.id}|bt|${next}|${year}`)
        const ok = Math.min(L.btSuccessMax, (L.btSuccess[realm] ?? 0.6) + L.btRootBonus * ((p.root?.mult || 1) - 1))
        if (rng() >= ok) {
          if (rng() < (L.btDeathShare[realm] ?? 0.2) * (p.rivalOf && p.rivalOf === this._s.self?.id ? NPC_RIVAL.hazardMult : 1)) { out.died = true; break }   // 4.10b: (your rival, mostly spared)
          out.injured = true
          p.injuredUntil = year + L.injuredYears[0] + Math.floor(rng() * (L.injuredYears[1] - L.injuredYears[0] + 1))
          xp = 0.5; left = 0; break
        }
        out.up = realm
      }
      p.stageIndex = next
      p.stageYear = year
    }
    p.npcXp = p.stageIndex >= NPC_STAGE_CAP ? 0 : xp
    p.maxStage = Math.max(p.maxStage || 0, p.stageIndex)
    return out
  }

  // Years a person of root `mult` needs to climb from awakening to `stage` on the NPC pace (seeding ages).
  _yearsToStage(stage, mult = 1, talent = 1) {
    let y = 0
    for (let st = 1; st < Math.min(stage, NPC_STAGE_CAP); st++) y += 1 / this._npcStageRate(st, mult, NPC_YEARS_PER_STAGE / talent)
    return Math.round(y)
  }

  // A world person dies: the registry, the stats, any seat they held. `news` collects what the player hears.
  _npcDies(p, yr, cause, news = null) {
    this._killPerson(p.id, yr, cause)   // (frees their sect seat: _vacateSeat)
    delete p.twilight; delete p.injuredUntil
    news?.push({ k: 'died', p, cause })
  }
  // A dead master's seat goes to the senior elder (else someone new is raised); a dead elder leaves the bench. Was only in
  // _npcDies — a death by your hand (a duel, a card deed, the road) left a dead person seated (final QA: sect_master_dead).
  _vacateSeat(p, yr, cause) {
    if (!p.sectId || p.sectId === 'own') return
    const r = this._wsRec(p.sectId)
    if (r?.alive && r.leaderId === p.id) this._wsSeatHeir(r, yr, `buries its master: ${Persons.fullName(p)} is gone (${(PERSON_CAUSE_TEXT[cause] || 'passed on').toLowerCase()})`, true, p.id)
    else if (r?.alive && (r.elderIds || []).includes(p.id)) {
      r.elderIds = r.elderIds.filter(id => id !== p.id)
      this._wsChron(this._lifeText('elderFell', p, { sect: r.name, cause }), r.id, [p.id], (p.stageIndex || 0) >= NPC_WORLD.notableStage)
    }
  }

  _lifeText(key, p, extra = {}) {
    const vals = { name: Persons.fullName(p) || 'Someone', realm: this._lifeRealm(p.stageIndex), ...extra }
    if (extra.cause) vals.cause = PERSON_CAUSE_TEXT[extra.cause] || 'They passed on'
    return (NPC_LIFE_TEXT[key] || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m)
  }

  // The game-year tick: every year since the last step (only while open — pillar 4).
  _tickWorldLives() {
    const w = this._s?.world
    if (!w?.persons || this._s.interlude) return
    const yr = Math.floor(w.year)
    if (w.livesYear == null) w.livesYear = yr - 1
    for (let y = Math.max(w.livesYear + 1, yr - 4); y <= yr; y++) this._lifeStep(y)
    w.livesYear = Math.max(w.livesYear, yr)
  }
  // The years skipped between lives (2.6d's generation jump): the world lives them too, quietly.
  _worldYears(fromYear, toYear) {
    const w = this._s.world
    for (let y = Math.max((w.livesYear ?? fromYear) + 1, fromYear + 1); y <= toYear; y++) {
      this._lifeStep(y, true)
      for (let k = 0; k < NPC_HEAVY.seasons; k++) this._heavyStep(y * NPC_HEAVY.seasons + k, true)   // 4.4: the heavy tier lives those years too
    }
    w.livesYear = Math.max(w.livesYear ?? toYear, toYear)
    w.seasonAt = Math.max(w.seasonAt ?? 0, (toYear + 1) * NPC_HEAVY.seasons - 1)
  }

  // One game year for every world-owned person. Family / arena / own-sect people live under their owners; clan people
  // grow and may die of old age when they hold no seat (the clan systems run their heads, marriages and children).
  _lifeStep(yr, quiet = false) {
    const s = this._s, w = s.world, L = NPC_LIVES
    const st = w.lifeStats ||= { deaths: {}, births: 0, marriages: 0, ascended: 0 }
    const clanIds = new Set(), seats = new Set()
    for (const c of Object.values(w.clans || {})) {
      if (c.headId) seats.add(c.headId)
      for (const l of c.lines || []) { if (l.headId) seats.add(l.headId); for (const id of l.memberIds || []) clanIds.add(id) }
    }
    const it = s.interlude
    if (it) { if (it.successorId) seats.add(it.successorId); if (it.spouseId) seats.add(it.spouseId) }
    for (const id of s.self?.parents || []) seats.add(id)   // your parents see you grown (the clan decides their fate)
    const myClan = new Set(this._clanMemberIds(this._playerClan(w)))
    const life = this._lifeNo(), news = []
    const people = Object.values(w.persons).filter(p => p.alive !== false && (!p.owner || p.owner === 'world') && p.id !== s.self?.id && p.role !== 'ancestor')
    const pool = [], seekers = []
    const mine = this._wsMine(), sects = this._wsAll().filter(r => r.alive)
    // 4.6: the replacement controller reads the bands at the start of the year: the band below a thin one cultivates
    // faster, a crowded band grows dangerous.
    const bands = this._worldBands(people), W6 = NPC_WORLD
    const boostOf = bi => { const up = bands[bi + 1]; return up && up.deficit > 0 ? 1 + W6.thinBoost * up.deficit : 1 }
    for (const p of people) {
      if (p.alive === false) continue   // fell earlier this step (a master's death can't kill another, but stay safe)
      const clan = clanIds.has(p.id), rng = wsRng(`${p.id}|${yr}|life`)
      const bi = this._bandIndex(p.stageIndex)
      const sec = this._actOn(p, yr * NPC_HEAVY.seasons)?.k === 'seclude' ? NPC_HEAVY.secludePace : 1   // 4.4: a secluded heavy person cultivates faster
      const g = this._growPerson(p, yr, !clan, boostOf(bi) * sec)
      if (g.died) { this._npcDies(p, yr, 'bt_backlash', news); continue }
      if (g.injured) news.push({ k: 'injured', p })
      if (g.up) news.push({ k: 'up', p, realm: g.up })
      const age = yr - (p.bornYear ?? yr)
      if (p.role === 'youth' && age >= AWAKENING_AGE) p.role = 'wanderer'
      // NPC Ascension: long at the last mortal stage, they dare the Trial.
      if (!clan && (p.stageIndex || 0) >= NPC_STAGE_CAP) {
        if (p.stageYear == null) p.stageYear = yr
        if (yr - p.stageYear >= L.ascendYearsAtPeak && rng() < L.ascendTryChance) {
          if (rng() < L.ascendSuccess + L.ascendRootBonus * ((p.root?.mult || 1) - 1)) {
            p.ascended = true; st.ascended++
            this._npcDies(p, yr, 'ascended'); news.push({ k: 'ascended', p }); continue
          }
          this._npcDies(p, yr, 'ascension_failed', news); continue
        }
      }
      // The perils of the road (clan people are the clan's to lose).
      if (!clan) {
        const role = age < AWAKENING_AGE ? 'youth' : p.sectRole === 'master' ? 'sect_master' : p.sectRole === 'elder' ? 'sect_elder'
          : p.sectRole === 'disciple' ? 'disciple' : p.role
        let h = L.hazard[role] ?? L.hazard.default
        if ((p.stageIndex || 0) >= L.hazardHighStage) h *= L.hazardHighMult
        if (p.chosen) h *= L.hazardChosenMult
        if (p.rivalOf && p.rivalOf === s.self?.id) h *= NPC_RIVAL.hazardMult   // 4.10b: the world spares your rival for you, mostly
        if (bands[bi]?.state === 'crowded') h *= W6.crowdHazard   // 4.6: too many at one realm — feuds multiply
        if (rng() < h) {
          const tbl = L.hazardCauses[role === 'disciple' ? 'disciple' : p.sectId ? 'sect' : role === 'wanderer' ? 'wanderer' : 'default']
          this._npcDies(p, yr, this._weightedRng(tbl, rng), news); continue
        }
      }
      // Old age: a backstop, with a warning first (final seclusion).
      if (!seats.has(p.id)) {
        const span = this._lifespan(p)
        if (age >= span) {
          if (rng() < Math.min(L.oldAgeMax, L.oldAgeBase + L.oldAgePerYear * (age - span))) { this._npcDies(p, yr, 'old_age', news); continue }
        } else if (age >= span - L.twilightYears && !p.twilight) { p.twilight = yr; news.push({ k: 'twilight', p }) }
      }
      // A classmate finds a sect (yours most likely).
      if (p.cohort && !p.sectId && age >= AWAKENING_AGE && sects.length && rng() < L.cohortJoinSect) {
        const wt = {}
        for (const r of sects) wt[r.id] = r === mine ? L.cohortJoinYoursMult : 1
        const r = this._wsRec(this._weightedRng(wt, rng))
        if (r) { p.sectId = r.id; p.sectRole = 'disciple'; p.role = 'disciple' }
      }
      if (!clan && age >= L.marryAge && !(p.spouseIds || []).some(id => w.persons[id] && w.persons[id].alive !== false)) {
        pool.push(p)
        if (rng() < L.marryChance) seekers.push(p)
      }
    }
    // Matches: each seeker looks at a few singles and weds the first who suits.
    const taken = new Set()
    for (const a of seekers) {
      if (taken.has(a.id) || a.alive === false) continue
      const rng = wsRng(`${a.id}|${yr}|wed`)
      for (let i = 0; i < 6 && pool.length > 1; i++) {
        const b = pool[Math.floor(rng() * pool.length)]
        if (b === a || b.alive === false || taken.has(b.id) || Math.abs((a.bornYear || 0) - (b.bornYear || 0)) > L.marryAgeGap) continue
        if (Math.abs((a.stageIndex || 0) - (b.stageIndex || 0)) > L.marryStageGap) continue
        if ((a.parents || []).some(x => (b.parents || []).includes(x)) || (a.parents || []).includes(b.id) || (b.parents || []).includes(a.id)) continue
        a.spouseIds = [...(a.spouseIds || []), b.id]; b.spouseIds = [...(b.spouseIds || []), a.id]
        taken.add(a.id); taken.add(b.id); st.marriages++
        news.push({ k: 'married', p: a, q: b }, { k: 'married', p: b, q: a })
        break
      }
    }
    // Children: living couples, while the low band has room (4.6: the controller's birth room; was 4.3's lightMax cap).
    const low = this._worldBands(people)[0]
    const room = Math.max(0, Math.min(1, (low.target * W6.birthRoomTop - low.count) / (low.target * W6.birthRoomSpan)))
    if (room > 0) {
      const kids = {}
      for (const p of Object.values(w.persons)) for (const id of p.parents || []) kids[id] = (kids[id] || 0) + 1
      for (const a of people) {
        if (a.alive === false || clanIds.has(a.id)) continue
        for (const bid of a.spouseIds || []) {
          const b = w.persons[bid]
          if (!b || b.alive === false || String(a.id) > String(b.id) || clanIds.has(b.id) || (b.owner && b.owner !== 'world')) continue
          if (yr - (a.bornYear ?? yr) > L.birthMaxAge || yr - (b.bornYear ?? yr) > L.birthMaxAge) continue
          if (Math.max(kids[a.id] || 0, kids[b.id] || 0) >= L.birthMaxChildren) continue
          const rng = wsRng(`${a.id}|${b.id}|${yr}|birth`)
          if (rng() >= L.birthChance * room) continue
          const c = this._mintPerson({ family: a.family || b.family, stage: 0, age: [0, 0], role: 'youth',
            root: this._rngBlendRoot(a.root, b.root, rng) }, rng)
          c.parents = [a.id, b.id]; c.grownYear = yr
          kids[a.id] = (kids[a.id] || 0) + 1; kids[b.id] = (kids[b.id] || 0) + 1; st.births++
        }
      }
    }
    this._replenishWorld(yr, quiet)   // 4.6: waves, wanderers, hidden masters (the world refills over years)
    this._assignTiers(yr)             // 4.5: who is heavy this year
    if (yr % L.pruneEvery === 0) this._pruneDead(yr)
    this._chronLives(news, life, myClan, yr)   // 4.6: the merged Chronicle keeps the year (quiet years too)
    if (!quiet) this._tellLives(news, life, myClan)
  }

  // ── Phase 28 task 4.6 (living-world.md §6.1): the replacement controller ──────────────────────────────────────
  // The world's living (world-owned) people by realm band against NPC_WORLD targets. A thin band is refilled over
  // years — awakening waves (low), wanderers (Foundation / Core), hidden masters (Nascent Soul / Spirit Severing) and
  // the faster pace of the band below — never by an instant respawn. Seeded per slot + year (no Math.random).
  _bandIndex(stage) {
    const st = stage || 0, B = NPC_WORLD.bands
    for (let i = 0; i < B.length; i++) if (st >= B[i].from && st <= B[i].to) return i
    return B.length - 1
  }
  _worldPeople() {
    const s = this._s
    return Object.values(s.world.persons).filter(p => p.alive !== false && (!p.owner || p.owner === 'world') && p.id !== s.self?.id && p.role !== 'ancestor')
  }
  // [{ id, name, short, from, to, target, count, deficit (0..1 below target), state: 'thin'|'ok'|'crowded' }]
  _worldBands(people = null) {
    const W6 = NPC_WORLD, counts = W6.bands.map(() => 0)
    for (const p of people || this._worldPeople()) if (p.alive !== false) counts[this._bandIndex(p.stageIndex)]++
    return W6.bands.map((b, i) => {
      const count = counts[i], deficit = Math.max(0, Math.min(1, (b.target - count) / b.target))
      const state = count < b.target * (1 - W6.tolerance) ? 'thin' : count > b.target * (1 + W6.tolerance) ? 'crowded' : 'ok'
      return { ...b, count, deficit, state }
    })
  }
  _replenishWorld(yr, quiet = false) {
    const s = this._s, w = s.world, W6 = NPC_WORLD, L = NPC_LIVES
    const bands = this._worldBands(), at = id => bands.find(b => b.id === id)
    const rng = wsRng(`${this._peopleSeed()}|${yr}|replenish`)
    const st = w.lifeStats ||= { deaths: {}, births: 0, marriages: 0, ascended: 0 }
    const placeAge = (p, stage, extra = 0) => {
      const need = AWAKENING_AGE + this._yearsToStage(stage, p.root?.mult || 1, p.talent || 1)
      p.bornYear = yr - Math.round(Math.min(this._lifespan(p) * 0.85, need * (0.9 + rng() * 0.3) + extra))
      p.grownYear = yr; p.stageYear = yr
    }
    // Awakening waves: youths whose roots stir in the villages, sized to the low band's deficit.
    const low = bands[0]
    if (yr % W6.waveEvery === 0 && low.count < low.target) {
      const n = Math.max(W6.waveSize[0], Math.min(W6.waveSize[1], Math.round((low.target - low.count) * W6.waveShare)))
      const wave = []
      for (let i = 0; i < n; i++) {
        const p = this._mintPerson({ stage: 0, age: [0, 0], role: 'wanderer' }, rng)
        p.bornYear = yr - AWAKENING_AGE - W6.waveAge[0] - Math.floor(rng() * (W6.waveAge[1] - W6.waveAge[0] + 1))
        p.grownYear = p.bornYear + AWAKENING_AGE; p.wave = yr
        this._growPerson(p, yr, false)
        wave.push(p)
      }
      st.waves = (st.waves || 0) + 1; st.awakened = (st.awakened || 0) + n
      const rank = { heavenly: 4, pure: 3, dual: 2, mixed: 1 }
      const best = [...wave].sort((a, b) => (rank[b.root?.type] || 0) - (rank[a.root?.type] || 0))[0]
      const rare = best && (rank[best.root?.type] || 0) >= 3
      this._chron({ k: 'wave', t: this._chronText(rare ? 'waveBest' : 'wave', best, { n, best: Persons.fullName(best), root: this._rootWords(best.root) }),
        p: rare ? [best.id] : null, n: best.root?.type === 'heavenly' })
    }
    // Wanderers: a short Foundation / Core band draws someone down from the far ranges.
    for (const id of W6.wanderBands) {
      const b = at(id)
      if (!b || !(b.deficit > 0) || rng() >= W6.wanderChance * b.deficit) continue
      const stage = b.from + Math.floor(rng() * (b.to - b.from + 1))
      const p = this._mintPerson({ stage, role: 'wanderer' }, rng)
      placeAge(p, stage)
      st.wanderers = (st.wanderers || 0) + 1
      this._chron({ k: 'arrival', t: this._chronText('wanderer', p), p: [p.id] })
    }
    // Hidden masters: a thin top band can wake an old monster from a long seclusion (rare; never two close together).
    if (yr - (w.hiddenYear ?? -1e9) >= W6.hiddenGap) {
      const thin = W6.hiddenBands.map(at).filter(b => b && b.deficit > 0).sort((a, b) => b.deficit - a.deficit)[0]
      if (thin && rng() < W6.hiddenChance * thin.deficit) this._hiddenMaster(thin, yr, rng, quiet)
    }
  }
  // An old monster breaks a long seclusion. Their own nature decides what they do with the world they wake to: take
  // a weaker master's seat, raise a sect of their own, or walk alone. The player hears of it (a toast, a log line, banter).
  _hiddenMaster(band, yr, rng, quiet = false) {
    const s = this._s, w = s.world, W6 = NPC_WORLD, els = ['fire', 'water', 'earth', 'wood', 'metal']
    const stage = band.from + Math.floor(rng() * (band.to - band.from + 1))
    const p = this._mintPerson({ stage, role: 'old_monster', root: this._rootOfType(this._weightedRng(W6.hiddenRoots, rng), els[Math.floor(rng() * 5)]) }, rng)
    const years = W6.hiddenSeclusion[0] + Math.floor(rng() * (W6.hiddenSeclusion[1] - W6.hiddenSeclusion[0] + 1))
    const need = AWAKENING_AGE + this._yearsToStage(stage, p.root.mult)
    p.bornYear = yr - Math.round(Math.min(this._lifespan(p) * 0.55, need + years * 0.3))
    p.grownYear = yr; p.stageYear = yr; p.hidden = years
    w.hiddenYear = yr
    const st = w.lifeStats ||= { deaths: {}, births: 0, marriages: 0, ascended: 0 }
    st.hidden = (st.hidden || 0) + 1
    this._chron({ k: 'hidden', t: this._chronText('hidden', p, { years }), p: [p.id], n: true })
    // What they do: an ambitious nature reaches for power.
    const wt = { ...W6.hiddenFates }
    if (W6.hiddenAmbitious.includes(p.personality)) for (const k of ['seize', 'found']) if (wt[k] != null) wt[k] *= 2
    const W = w.sects, foe = s.sectWar?.enemyId
    const prey = this._wsAll().filter(r => r.alive && r.id !== W?.event?.sectId && r.id !== foe)
      .map(r => ({ r, m: this._wsLeader(r) }))
      .filter(x => x.m && (x.m.stageIndex || 0) <= stage - W6.seizeGap)
      .sort((a, b) => (a.m.stageIndex || 0) - (b.m.stageIndex || 0) || String(a.r.id).localeCompare(String(b.r.id)))
    if (!prey.length) delete wt.seize
    if (!W || W.list.length >= WORLD_SECTS.maxAlive) delete wt.found
    const fate = this._weightedRng(wt, rng)
    let line = null, seized = null
    if (fate === 'seize') {
      const { r, m } = prey[Math.floor(rng() * Math.min(2, prey.length))]
      const old = Persons.fullName(m), kills = rng() < W6.seizeKills
      if (kills) this._killPerson(m.id, yr, 'seat_struggle', { seat: false })
      else { m.role = 'retired_master'; m.sectRole = null }
      if (WORLD_SECT_TEMPERS.includes(p.personality)) r.temper = p.personality
      this._wsSeat(r, p)
      r.elderIds = (r.elderIds || []).filter(id => id !== p.id)
      r.leaderSince = yr
      r.stance = Math.round((r.stance || 0) * W6.seizeStanceKeep)
      this._wsChron(this._chronText(kills ? 'seizeKill' : 'seizeYield', p, { sect: r.name, old }), r.id, [p.id, m.id], true)
      seized = { r, old, kills }
      st.seized = (st.seized || 0) + 1
    } else if (fate === 'found') {
      const tier = W6.foundTier[0] + Math.floor(rng() * (W6.foundTier[1] - W6.foundTier[0] + 1))
      const r = this._wsNewRival({ tier, origin: 'hidden_master', rng, leader: Persons.fullName(p) })
      if (WORLD_SECT_TEMPERS.includes(p.personality)) r.temper = p.personality
      this._wsSeat(r, p)
      r.leaderSince = yr
      this._wsChron(this._chronText('found', p, { sect: r.name }), r.id, [p.id], true)
      st.founded = (st.founded || 0) + 1
    } else this._chron({ k: 'hidden', t: this._chronText('hiddenWander', p), p: [p.id] })
    if (quiet) return p
    // The player hears of it: a log line + a toast + banter; louder when it is their own sect (or their line's).
    const mineR = this._wsMine()
    if (seized && (seized.r === mineR || seized.r.kind === 'lineage')) {
      line = this._lifeText('hiddenSeizedYours', p, { sect: seized.r.name, old: seized.old, fate: seized.kills ? 'fell defending it' : 'bowed and withdrew' })
      this.addEvent({ type: 'negative', text: line, pid: p.id })
      this._emit('world_news', { text: line, type: 'negative' })
    } else {
      line = this._lifeText('hidden', p)
      this.addEvent({ type: 'special', text: line, pid: p.id })
      this._emit('world_news', { text: line, type: 'special' })
    }
    this._emit('hidden_master', { master: Persons.fullName(p) })
    return p
  }
  _rootWords(root) { return String(root?.name || 'spirit root').replace(/[^\x00-\x7F]+/g, '').trim() || 'spirit root' }
  _chronText(key, p, extra = {}) {
    const vals = { name: p ? Persons.fullName(p) || 'Someone' : 'Someone', realm: p ? this._lifeRealm(p.stageIndex) : '', ...extra }
    if (extra.cause) vals.cause = PERSON_CAUSE_TEXT[extra.cause] || 'They passed on'
    return (NPC_CHRON_TEXT[key] || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m)
  }

  // ── 4.6: the merged Chronicle (世 World → Chronicle) ─────────────────────────────────────────────────────────────
  // w.chron: [{ i (seq), y, k (kind), t (text), p ([pid]), s (sect record id), n (notable) }], capped (NPC_WORLD.chronMax).
  // q = routine (left out of the All filter). Kinds: sect (every sect line, via _wsChron) · wave · arrival · hidden · rise · died · ascended · twilight · wed.
  _chron({ k, t, p = null, s = null, n = false, y = null, q = false }) {
    const w = this._s?.world
    if (!w || !t) return
    if (!Array.isArray(w.chron)) w.chron = []
    w.chronSeq = (w.chronSeq || 0) + 1
    const e = { i: w.chronSeq, y: y ?? Math.floor(w.year || 0), k, t }
    if (p?.length) e.p = p.filter(Boolean)
    if (s) e.s = s
    if (n) e.n = 1
    if (q) e.q = 1   // routine (an elder raised, hopefuls take the oath): kept under Sects, left out of All
    w.chron.push(e)
    if (w.chron.length > NPC_WORLD.chronMax) w.chron.splice(0, w.chron.length - NPC_WORLD.chronMax)
  }
  // A year's news into the Chronicle: the high realms for anyone, plus this life's class and your clan.
  _chronLives(news, life, myClan, yr) {
    const W6 = NPC_WORLD
    for (const n of news) {
      const p = n.p, stg = p.stageIndex || 0, mine = p.cohort === life, kin = myClan.has(p.id)
      if (n.k === 'died') {
        if (p.sectRole === 'master' || p.sectRole === 'elder') continue   // the sect's line names them (_npcDies)
        if (stg >= W6.chronDeathStage || mine || kin || p.chosen || (p.fam || 0) > 0)
          this._chron({ k: 'died', t: this._chronText('died', p, { cause: n.cause }), p: [p.id], n: stg >= W6.notableStage || (mine && p.chosen), y: yr })
      } else if (n.k === 'ascended') this._chron({ k: 'ascended', t: this._chronText('ascended', p), p: [p.id], n: true, y: yr })
      else if (n.k === 'up' && (stg >= W6.chronRiseStage || (mine && stg >= NPC_LIVES.logFromStage)))
        this._chron({ k: 'rise', t: this._chronText('rise', p), p: [p.id], n: stg >= W6.notableStage, y: yr })
      else if (n.k === 'twilight' && (stg >= W6.notableStage || mine || kin)) this._chron({ k: 'twilight', t: this._chronText('twilight', p), p: [p.id], y: yr })
      else if (n.k === 'married' && (mine || n.q.cohort === life) && String(p.id) < String(n.q.id))
        this._chron({ k: 'wed', t: this._chronText('wed', p, { spouse: Persons.fullName(n.q) }), p: [p.id, n.q.id], y: yr })
    }
  }

  // Public (UI): the merged Chronicle, newest first. filter: all | notable | class | clan | sects | people.
  // Each entry: { i, y, k, text, who: [{ pid, name }], sectId, notable, tags: ['class'|'clan'|'yours'] }.
  worldChronicle({ filter = 'all', limit = 80 } = {}) {
    const s = this._s, w = s.world
    if (!Array.isArray(w.chron)) w.chron = []
    const life = this._lifeNo(), myClan = new Set(this._clanMemberIds(this._playerClan(w)))
    const mine = this._wsMine()?.id || null
    const counts = { all: 0, notable: 0, class: 0, clan: 0, sects: 0, people: 0, routine: 0 }
    const out = []
    for (let i = w.chron.length - 1; i >= 0; i--) {
      const e = w.chron[i], ps = (e.p || []).map(id => w.persons[id]).filter(Boolean)
      const tags = []
      if (ps.some(p => p.cohort === life)) tags.push('class')
      if (ps.some(p => myClan.has(p.id))) tags.push('clan')
      if (e.s && e.s === mine) tags.push('yours')
      const sect = e.k === 'sect' || !!e.s
      const is = { all: !e.q, notable: !!e.n, class: tags.includes('class'), clan: tags.includes('clan'), sects: sect, people: !sect }
      for (const k of Object.keys(counts)) if (is[k]) counts[k]++
      if (e.q) counts.routine++
      if (!is[filter] || out.length >= limit) continue
      out.push({ i: e.i, y: e.y, k: e.k, text: e.t, sectId: e.s || null, notable: !!e.n, tags,
                 who: ps.map(p => ({ pid: p.id, name: Persons.fullName(p) })) })
    }
    return { entries: out, counts, total: w.chron.length, unseen: this.chronicleNews(), bands: this._worldBands(),
             year: Math.floor(w.year || 0), stats: { ...(w.lifeStats || {}) } }
  }
  // Public (attention): notable lines since you last opened the Chronicle.
  chronicleNews() {
    const w = this._s?.world
    if (!Array.isArray(w?.chron)) return 0
    const seen = w.chronSeen || 0
    let n = 0
    for (let i = w.chron.length - 1; i >= 0 && w.chron[i].i > seen; i--) if (w.chron[i].n) n++
    return n
  }
  noteChronicleSeen() { const w = this._s?.world; if (w) w.chronSeen = w.chronSeq || 0 }
  // Public (UI): the world's people by realm band against the controller's targets (World → Chronicle's strip).
  worldBandsInfo() { return this._worldBands() }

  // ── Phase 28 tasks 4.4 + 4.5 (living-world.md §6.2, §6.4, §7): the heavy tier + NPC goals, known-first casting ──
  // Relevance decides who is heavy (≤ NPC_HEAVY.heavyMax; this life's class holds a reserved share). Each game season
  // a heavy person whose activity has run out picks a goal (utility: base × temper × morality × situation) and acts —
  // roams and meets people, courts, duels, avenges, joins / leaves / founds a sect, betrays a master, helps a friend,
  // swears brotherhood. Seeded per person + season (no Math.random). Clan people stay with the clan's own systems.

  _clanIdSet() {
    const ids = new Set()
    for (const c of Object.values(this._s.world.clans || {})) { if (c.headId) ids.add(c.headId); for (const l of c.lines || []) for (const id of l.memberIds || []) ids.add(id) }
    return ids
  }
  // Who in the world (world-owned, living, not a clan's) can take part in the heavy step or be its target.
  _heavyEligible(p, clanIds) {
    const s = this._s
    return p && p.alive !== false && (!p.owner || p.owner === 'world') && p.id !== s.self?.id && p.role !== 'ancestor' && !clanIds.has(p.id)
  }
  // Yearly: who matters to you now. Relevance = familiarity + feeling + your class + your sect + seats + ties.
  _assignTiers(yr) {
    const s = this._s, w = s.world, H = NPC_HEAVY, R = H.relevance, life = this._lifeNo(), clanIds = this._clanIdSet()
    const mine = this._wsMine()?.id || null
    const pool = []
    for (const p of Object.values(w.persons)) {
      if (p.ties) for (const id of Object.keys(p.ties)) if (w.persons[id]?.alive === false || !w.persons[id]) delete p.ties[id]   // ties to the dead fade
      if (p.feud && (w.persons[p.feud.pid]?.alive === false || yr - (p.feud.y || yr) > NPC_HEAVY.feudYears)) delete p.feud   // the dead or a long-cold feud
      if (!this._heavyEligible(p, clanIds)) { if (p.tier === 'heavy') p.tier = 'light'; continue }
      const score = Math.min(R.famCap, (p.fam || 0) * R.fam) + Math.abs(p.rel || 0) * R.rel + (p.cohort === life ? R.classmate : p.cohort ? R.pastClassmate : 0)
        + (p.chosen ? R.chosen : 0) + (mine && p.sectId === mine ? R.mySect : 0) + (p.sectRole === 'master' || p.sectRole === 'elder' ? R.seat : 0)
        + (p.feud ? R.feud : 0) + Object.keys(p.ties || {}).length * R.tie + (p.pin ? R.pin : 0)
      pool.push({ p, score, cls: p.cohort === life })
    }
    const max = H.heavyMax, reserve = Math.round(max * H.cohortReserve)
    const by = (a, b) => b.score - a.score || String(a.p.id).localeCompare(String(b.p.id))
    const cls = pool.filter(x => x.cls).sort(by), heavy = new Set(cls.slice(0, reserve).map(x => x.p.id))
    for (const x of pool.sort(by)) { if (heavy.size >= max) break; heavy.add(x.p.id) }
    for (const x of pool) x.p.tier = heavy.has(x.p.id) ? 'heavy' : 'light'
    w.tiersYear = yr
  }

  // The seasons since the last one stepped (only while open; the world is frozen while closed).
  _tickSeasons() {
    const s = this._s, w = s?.world
    if (!w?.persons || s.interlude) return
    const now = Math.floor(w.year * NPC_HEAVY.seasons)
    if (w.seasonAt == null) w.seasonAt = now - 1
    for (let si = Math.max(w.seasonAt + 1, now - NPC_HEAVY.catchUpSeasons + 1); si <= now; si++) this._heavyStep(si)
    w.seasonAt = Math.max(w.seasonAt, now)
  }

  _act(p, k, si, rng, extra = {}) {
    const len = NPC_HEAVY.goals[k]?.len || [1, 1]
    p.act = { k, until: si + len[0] + Math.floor(rng() * (len[1] - len[0] + 1)), ...extra }
  }
  _actOn(p, si) { return p.act && p.act.until > si ? p.act : null }
  _tie(a, b) { return a?.ties?.[b?.id] || 0 }
  _tieAdd(a, b, d, set = false) {
    if (!a || !b || a === b) return
    a.ties ||= {}
    a.ties[b.id] = Math.max(-100, Math.min(100, Math.round(set ? d : (a.ties[b.id] || 0) + d)))
    const ks = Object.keys(a.ties)
    if (ks.length > NPC_HEAVY.tiesMax) {   // keep the strongest feelings
      ks.sort((x, y) => Math.abs(a.ties[y]) - Math.abs(a.ties[x]))
      for (const k of ks.slice(NPC_HEAVY.tiesMax)) delete a.ties[k]
    }
  }
  _npcPower(p, rng) { return Persons.powerScore(p) + (p.talent || 1) * 40 + rng() * NPC_HEAVY.duelLuck - ((p.injuredUntil || 0) > Math.floor(this._s.world.year) ? 80 : 0) }
  // How `p` is bound to the slain `v` (for the feud's reason), or null.
  _kinWord(p, v) {
    if ((p.parents || []).includes(v.id)) return 'their parent'
    if ((v.parents || []).includes(p.id)) return 'their child'
    if ((p.spouseIds || []).includes(v.id)) return 'their spouse'
    if ((p.parents || []).some(x => (v.parents || []).includes(x))) return 'their sibling'
    if (this._tie(p, v) >= 100) return 'their sworn sibling'
    return null
  }
  // `killer` slew `v`: v dies, and v's kin + sworn take up the feud (the world remembers who killed whom).
  _npcSlain(v, killer, yr, cause, news = null) {
    if (!v || v.alive === false) return
    this._npcDies(v, yr, cause, news)
    v.killedBy = killer?.id || null
    if (!killer) return
    const w = this._s.world, clanIds = this._clanIdSet()
    const near = new Set([...(v.parents || []), ...(v.spouseIds || []), ...Object.keys(v.ties || {}).filter(id => v.ties[id] >= 100)])
    for (const p of Object.values(w.persons)) if ((p.parents || []).includes(v.id) || ((v.parents || []).length && (p.parents || []).some(x => v.parents.includes(x)))) near.add(p.id)
    // Every one of them hates the killer; one (the closest: a child, a spouse, a parent, a sibling, a sworn sibling) swears to avenge.
    const order = ['their child', 'their spouse', 'their parent', 'their sibling', 'their sworn sibling'], cand = []
    for (const id of near) {
      const p = w.persons[id]
      if (!this._heavyEligible(p, clanIds) || p.id === killer.id) continue
      const why = this._kinWord(p, v)
      if (!why) continue
      this._tieAdd(p, killer, NPC_HEAVY.feudTie, true)
      if (!p.feud || w.persons[p.feud.pid]?.alive === false) cand.push({ p, why, o: order.indexOf(why.replace(/^their (parent|child)$/, (m, x) => x === 'parent' ? 'their child' : 'their parent')) })
    }
    const av = cand.sort((a, b) => a.o - b.o || String(a.p.id).localeCompare(String(b.p.id)))[0]
    if (av) av.p.feud = { pid: killer.id, why: `${av.why} ${Persons.fullName(v)}`, y: yr }
  }

  // Does the player know them (their class, clan, sect, or a name they have seen)?
  _knownToYou(p, ctx) { return !!p && (p.cohort === ctx.life || (p.fam || 0) > 0 || ctx.clan.has(p.id) || (ctx.mine && p.sectId === ctx.mine)) }
  // A heavy deed: always in the Chronicle when someone in it is known to you (or it is notable); in your log too when
  // you know them and the year is not quiet; the big ones toast for your class and familiar faces.
  _deed(key, a, b, ctx, { extra = {}, notable = false, big = false, sectId = null } = {}) {
    const known = this._knownToYou(a, ctx) || this._knownToYou(b, ctx)
    if (!known && !notable) return
    const vals = { name: Persons.fullName(a), other: b ? Persons.fullName(b) : '', ...extra }
    const text = (NPC_DEED_TEXT[key] || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m)
    this._chron({ k: 'deed', t: text, p: [a?.id, b?.id].filter(Boolean), s: sectId, n: notable || (big && known) })
    if (ctx.quiet || !known) return
    this.addEvent({ type: big ? 'special' : 'neutral', text, pid: a?.id || null })
    const close = x => x && (x.cohort === ctx.life || (x.fam || 0) >= 3)
    if (big && (close(a) || close(b))) this._emit('world_news', { text, type: 'special' })
  }

  // One season for the heavy tier.
  _heavyStep(si, quiet = false) {
    const s = this._s, w = s.world, H = NPC_HEAVY, G = H.goals, yr = Math.floor(si / H.seasons)
    if (w.tiersYear == null) this._assignTiers(yr)
    const clanIds = this._clanIdSet(), mine = this._wsMine()
    const ctx = { life: this._lifeNo(), clan: new Set(this._clanMemberIds(this._playerClan(w))), mine: mine?.id || null, quiet }
    const st = w.lifeStats ||= { deaths: {}, births: 0, marriages: 0, ascended: 0 }
    const deeds = st.deeds ||= {}
    const did = k => { deeds[k] = (deeds[k] || 0) + 1 }
    const all = Object.values(w.persons).filter(p => this._heavyEligible(p, clanIds))
    const heavy = all.filter(p => p.tier === 'heavy').sort((a, b) => String(a.id).localeCompare(String(b.id)))
    const sects = this._wsAll().filter(r => r.alive)
    const roamers = {}
    for (const p of heavy) {
      if (p.alive === false || p.roadCard || this._actOn(p, si)) continue   // 4.9: on a card, they wait for your answer
      const rng = wsRng(`${p.id}|${si}|goal`), age = yr - (p.bornYear ?? yr), adult = age >= AWAKENING_AGE + 2, stg = p.stageIndex || 0
      const tw = H.temperGoals[p.personality] || {}, mor = p.morality || 0
      const single = !(p.spouseIds || []).some(id => w.persons[id] && w.persons[id].alive !== false)
      const foe = p.feud ? w.persons[p.feud.pid] : null
      const r = p.sectId && p.sectId !== 'own' ? this._wsRec(p.sectId) : null
      const master = r && r.leaderId !== p.id ? w.persons[r.leaderId] : null
      const friends = Object.keys(p.ties || {}).map(id => w.persons[id]).filter(x => x && x.alive !== false && p.ties[x.id] >= H.friendTie)
      const hurt = friends.find(x => (x.injuredUntil || 0) > yr)
      const sworn = friends.find(x => p.ties[x.id] >= H.swearTie && p.ties[x.id] < 100 && this._tie(x, p) >= H.swearTie)
      const ok = {
        seclude: true, roam: adult, mission: adult && !!r && !!p.sectRole, court: adult && age >= NPC_LIVES.marryAge && single,
        duel: adult && stg >= 1, revenge: adult && !!foe && foe.alive !== false, join: adult && !p.sectId && sects.length > 0,
        leave: p.sectRole === 'disciple' && !!r, found: adult && !p.sectId && stg >= 13 && (w.sects?.list.length || 0) < WORLD_SECTS.maxAlive,
        betray: p.sectRole === 'elder' && !!master && master.alive !== false && stg >= (master.stageIndex || 0) - 1,
        help: !!hurt, swear: !!sworn,
      }
      const wt = {}
      for (const [k, g] of Object.entries(G)) {
        if (!ok[k]) continue
        let v = g.base * (tw[k] ?? 1)
        if (H.moralityDark.includes(k)) v *= Math.max(0.1, 1 - mor / 150)
        if (H.moralityLight.includes(k)) v *= Math.max(0.1, 1 + mor / 150)
        if (k === 'seclude' && (p.injuredUntil || 0) > yr) v *= 2
        if (k === 'duel' && stg >= H.highStage) v *= H.highDuel
        if ((k === 'found' || k === 'betray') && H.ambitious.includes(p.personality)) v *= 2
        if (k === 'leave' && master && this._tie(p, master) <= -40) v *= 5
        wt[k] = v
      }
      const k = this._weightedRng(wt, rng)
      if (k === 'seclude' || k === 'mission' || k === 'duel' || k === 'join' || k === 'leave' || k === 'found' || k === 'court') this._act(p, k, si, rng)
      if (k === 'mission') { p.npcXp = Math.min(0.95, (p.npcXp || 0) + 0.08); this._act(p, 'mission', si, rng, { sect: r.id }) }
      else if (k === 'roam') {
        const locs = LOCATIONS.filter(l => (l.minStage || 0) <= stg).slice(-3)
        const loc = locs[Math.floor(rng() * locs.length)] || LOCATIONS[0]
        this._act(p, 'roam', si, rng, { loc: loc.id })
        ;(roamers[loc.id] ||= []).push(p)
      } else if (k === 'court') {
        const pool = all.filter(x => x !== p && x.alive !== false && (yr - (x.bornYear ?? yr)) >= NPC_LIVES.marryAge && Math.abs((x.bornYear || 0) - (p.bornYear || 0)) <= NPC_LIVES.marryAgeGap
          && Math.abs((x.stageIndex || 0) - stg) <= NPC_LIVES.marryStageGap && !(x.spouseIds || []).some(id => w.persons[id]?.alive !== false)
          && !this._kinWord(p, x) && this._tie(p, x) > -20)
          .sort((a, b) => this._tie(p, b) - this._tie(p, a) || String(a.id).localeCompare(String(b.id))).slice(0, 6)
        const q = pool[Math.floor(rng() * pool.length)]
        if (q) {
          if (rng() < H.courtWed) {
            p.spouseIds = [...(p.spouseIds || []), q.id]; q.spouseIds = [...(q.spouseIds || []), p.id]
            this._tieAdd(p, q, 70, true); this._tieAdd(q, p, 70, true); st.marriages++; did('wed')
            this._deed('wed', p, q, ctx)
          } else { this._tieAdd(p, q, 10); this._act(p, 'court', si, rng, { other: q.id }) }
        }
      } else if (k === 'duel') {
        const near = all.filter(x => x !== p && x.alive !== false && Math.abs((x.stageIndex || 0) - stg) <= 2 && (yr - (x.bornYear ?? yr)) >= AWAKENING_AGE + 2)
        const hated = near.filter(x => this._tie(p, x) <= -20)
        const pick = (hated.length ? hated : near.filter(x => x.sectId !== p.sectId || !p.sectId))
        const q = pick[Math.floor(rng() * pick.length)]
        if (q) {
          const blood = this._tie(p, q) <= H.bloodTie || rng() < (p.personality === 'psycho' ? H.psychoBlood : H.duelBloodChance)
          this._npcDuel(p, q, blood, yr, rng, ctx, 'duel'); did(blood ? 'duelBlood' : 'duel')
        }
      } else if (k === 'revenge') {
        if ((foe.stageIndex || 0) >= stg + H.revengeBide) this._act(p, 'seclude', si, rng, { bide: foe.id })
        else { this._act(p, 'revenge', si, rng, { other: foe.id }); this._npcDuel(p, foe, true, yr, rng, ctx, 'revenge'); did('revenge') }
      } else if (k === 'join') {
        const wts = {}
        for (const x of sects) wts[x.id] = (x === mine ? H.joinYoursMult : 1) * (1 + (x.tier || 1) * 0.2)
        const to = this._wsRec(this._weightedRng(wts, rng))
        if (to) { p.sectId = to.id; p.sectRole = 'disciple'; p.role = 'disciple'; to.disciples = (to.disciples || 0) + 1; did('join'); this._deed('join', p, null, ctx, { extra: { sect: to.name }, sectId: to.id }) }
      } else if (k === 'leave') {
        p.sectId = null; p.sectRole = null; p.role = 'wanderer'; r.disciples = Math.max(0, (r.disciples || 0) - 1); did('leave')
        this._deed('leave', p, null, ctx, { extra: { sect: r.name }, sectId: r.id })
      } else if (k === 'found') {
        const nr = this._wsNewRival({ tier: stg >= 16 ? 2 : 1, origin: 'founded', rng, leader: Persons.fullName(p) })
        if (WORLD_SECT_TEMPERS.includes(p.personality)) nr.temper = p.personality
        this._wsSeat(nr, p); nr.leaderSince = yr; did('found')
        this._wsChron(`A new sect raises its gate: the ${nr.name}, founded by ${Persons.fullName(p)}.`, nr.id, [p.id], stg >= NPC_WORLD.notableStage)
        this._deed('found', p, null, ctx, { extra: { sect: nr.name }, big: true, sectId: nr.id })
      } else if (k === 'betray') {
        this._act(p, 'betray', si, rng); this._npcBetray(p, master, r, yr, rng, ctx); did('betray')
      } else if (k === 'help') {
        hurt.injuredUntil = yr + Math.ceil(((hurt.injuredUntil || yr) - yr) / 2)
        this._tieAdd(p, hurt, 10); this._tieAdd(hurt, p, 15); this._act(p, 'help', si, rng, { other: hurt.id }); did('help')
        this._deed('helped', p, hurt, ctx)
      } else if (k === 'swear') {
        this._tieAdd(p, sworn, 100, true); this._tieAdd(sworn, p, 100, true); this._act(p, 'swear', si, rng, { other: sworn.id }); did('sworn')
        this._deed('sworn', p, sworn, ctx, { big: true })
      }
    }
    // Roamers who share a place this season may meet: like hearts befriend, a gulf in character breeds a grudge
    // (and the hot-headed settle it on the spot).
    for (const [loc, ps] of Object.entries(roamers)) {
      for (let i = 0; i + 1 < ps.length; i += 2) {
        const a = ps[i], b = ps[i + 1], rng = wsRng(`${a.id}|${b.id}|${si}|meet`)
        if (a.alive === false || b.alive === false || rng() >= H.roamMeet) continue
        const hostile = Math.abs((a.morality || 0) - (b.morality || 0)) >= H.moralityGulf || a.personality === 'psycho' || b.personality === 'psycho'
        const [lo, hi] = hostile ? H.meetHostile : H.meetFriendly, d = lo + Math.floor(rng() * (hi - lo + 1))
        this._tieAdd(a, b, d); this._tieAdd(b, a, d); did(hostile ? 'metHostile' : 'metFriendly')
        const hot = x => (H.temperGoals[x.personality]?.duel || 1) > 1.5
        if (hostile && (hot(a) || hot(b)) && rng() < H.meetDuel) this._npcDuel(hot(a) ? a : b, hot(a) ? b : a, this._tie(a, b) <= H.bloodTie, yr, rng, ctx, 'duel')
      }
    }
  }

  // Two of the world's people fight (a duel, a revenge). With `blood` the loser dies and their kin take up the feud.
  _npcDuel(a, b, blood, yr, rng, ctx, kind = 'duel') {
    const H = NPC_HEAVY, aw = this._npcPower(a, rng) >= this._npcPower(b, rng)
    const [win, lose] = aw ? [a, b] : [b, a]
    if (blood) {
      this._npcSlain(lose, win, yr, kind === 'revenge' ? 'feud' : 'duel')
      if (kind === 'revenge') {
        if (win === a) { const why = a.feud?.why || 'an old wrong'; delete a.feud; this._deed('revengeKill', a, b, ctx, { extra: { why }, big: true }) }
        else this._deed('revengeFail', a, b, ctx, { big: true })
      } else this._deed('duelKill', win, lose, ctx, { big: true, notable: (lose.stageIndex || 0) >= NPC_WORLD.notableStage })
      return win
    }
    lose.injuredUntil = Math.max(lose.injuredUntil || 0, yr + H.sparInjury[0] + Math.floor(rng() * (H.sparInjury[1] - H.sparInjury[0] + 1)))
    const proud = lose.personality === 'arrogant' || lose.personality === 'demonking'
    this._tieAdd(lose, win, proud ? -25 : 6); this._tieAdd(win, lose, 4)
    this._deed('duelWin', win, lose, ctx)
    return win
  }

  // An elder rises against their master: they take the seat, die, or break away with the malcontents (a split).
  _npcBetray(p, m, r, yr, rng, ctx) {
    const H = NPC_HEAVY
    const odds = Math.max(0.15, Math.min(0.85, H.betrayWin + (this._npcPower(p, rng) - this._npcPower(m, rng)) / 400))
    const yours = r === this._wsMine() || r.kind === 'lineage'
    let text = null
    if (rng() < odds) {
      const old = Persons.fullName(m)
      this._npcSlain(m, p, yr, 'seat_struggle')
      if (r.alive && r.leaderId !== p.id) {   // _npcDies seated the senior elder; the usurper takes it from them
        this._wsSeat(r, p); r.elderIds = (r.elderIds || []).filter(id => id !== p.id); r.leaderSince = yr
      }
      this._wsChron(NPC_DEED_TEXT.betrayWin.replace('{name}', Persons.fullName(p)).replace('{other}', old).replace('{sect}', r.name), r.id, [p.id, m.id], true)
      text = `${Persons.fullName(p)} has overthrown ${old}. They lead the ${r.name} now.`
    } else if (rng() < 0.5) {
      this._npcSlain(p, m, yr, 'seat_struggle')
      this._wsChron(NPC_DEED_TEXT.betrayDie.replace('{name}', Persons.fullName(p)).replace('{other}', Persons.fullName(m)).replace('{sect}', r.name), r.id, [p.id, m.id], (r.tier || 1) >= 3)
    } else {
      r.elderIds = (r.elderIds || []).filter(id => id !== p.id)
      const n = Math.round((r.disciples || 0) * H.splitShare)
      r.disciples = Math.max(0, (r.disciples || 0) - n)
      const nr = (this._s.world.sects?.list.length || 0) < WORLD_SECTS.maxAlive
        ? this._wsNewRival({ tier: Math.max(1, (r.tier || 1) - 1), origin: 'split', rng, leader: Persons.fullName(p), disciples: Math.max(3, n), splitFrom: r.id }) : null
      this._tieAdd(p, m, -100, true); this._tieAdd(m, p, -100, true)
      if (nr) {
        if (WORLD_SECT_TEMPERS.includes(p.personality)) nr.temper = p.personality
        this._wsSeat(nr, p); nr.leaderSince = yr
        this._wsChron(NPC_DEED_TEXT.betraySplit.replace('{name}', Persons.fullName(p)).replace('{other}', Persons.fullName(m)).replace('{sect}', r.name).replace('{split}', nr.name), nr.id, [p.id, m.id], true)
        text = `${Persons.fullName(p)} broke from the ${r.name} and raised the ${nr.name}.`
      } else { p.sectId = null; p.sectRole = null; p.role = 'wanderer' }
    }
    this._wsEnsurePeople(r, true)
    if (text && yours && !ctx.quiet) { this.addEvent({ type: 'negative', text, pid: p.id }); this._emit('world_news', { text, type: 'negative' }) }
  }

  // Public (UI): what a person is doing now and who they are bound to (the person card).
  _personNow(p) {
    const w = this._s.world, si = Math.floor((w.year || 0) * NPC_HEAVY.seasons), a = this._actOn(p, si)
    const nm = id => id === this._s.self?.id ? 'you' : Persons.fullName(w.persons[id]) || 'someone'
    let now = null, nowPid = null
    if (a) {
      const key = a.bide ? 'bide' : a.k === 'court' && a.other ? 'courtWho' : a.k
      const loc = a.loc ? LOCATIONS.find(l => l.id === a.loc) : null
      const sect = a.sect ? this._wsRec(a.sect)?.name : p.sectId && p.sectId !== 'own' ? this._wsRec(p.sectId)?.name : null
      const other = a.bide || a.other || null
      now = (NPC_ACT_TEXT[key] || '').replace('{place}', loc ? `the ${loc.name}` : 'the wilds').replace('{sect}', sect || 'sect')
        .replace('{other}', other ? nm(other) : 'someone')
      nowPid = other
    }
    const ties = Object.entries(p.ties || {}).map(([id, v]) => ({ id, v, q: w.persons[id] })).filter(x => x.q && x.q.alive !== false)
      .sort((x, y) => Math.abs(y.v) - Math.abs(x.v)).slice(0, 5)
      .map(x => ({ pid: x.id, name: Persons.fullName(x.q), v: x.v, word: x.v >= 100 ? 'Sworn' : x.v >= 60 ? 'Close' : x.v >= 40 ? 'Friend' : x.v <= -80 ? 'Blood feud' : x.v <= -40 ? 'Enemy' : x.v < 0 ? 'Grudge' : 'Acquaintance',
                    tone: x.v >= 100 ? 'gold' : x.v >= 40 ? 'jade' : x.v <= -40 ? 'red' : 'dim' }))
    const feud = p.feud && w.persons[p.feud.pid]?.alive !== false ? { pid: p.feud.pid, name: nm(p.feud.pid), why: p.feud.why, y: p.feud.y } : null
    return { now, nowPid, nowName: nowPid ? nm(nowPid) : null, ties, feud, heavy: p.tier === 'heavy', killedBy: p.killedBy ? { pid: p.killedBy, name: nm(p.killedBy) } : null }
  }

  // ── Known-first casting (§6.4, task 4.5) ──
  // Who the world can offer as a suitor / road stranger / arena duelist / recruit, ~75% of the time someone it
  // already has (weighted by how familiar they are). Returns the registry person (callers copy it) or null.
  _castKnown(kind, { stage = [0, NPC_STAGE_CAP], age = [AWAKENING_AGE, 999], exclude = [] } = {}) {
    const s = this._s, w = s.world, C = NPC_CAST
    if (!w?.persons) return null
    const throttled = this._castThrottled()
    w.castSeq = (w.castSeq || 0) + 1
    const rng = wsRng(`${this._peopleSeed()}|cast|${w.castSeq}`)   // its own seeded stream: casting never shifts Math.random
    if (rng() >= (throttled ? C.knownChanceThrottled : C.knownChance)) return null
    const yr = Math.floor(w.year), life = this._lifeNo(), clanIds = this._clanIdSet()
    const busy = new Set(exclude.filter(Boolean))
    const f = s.family || {}
    for (const x of [f.spouse, ...(f.formerSpouses || []), ...(f.children || []), ...(f.lovers || []).map(l => l.person), ...(f.encounters || []).map(e => e.person),
      ...(f.proposal?.suitors || []), ...(f.court?.candidates || []), f.court?.target, ...(f.spurned || []).map(x => x.person)]) if (x?.id) busy.add(x.id)
    for (const id of Object.keys(s.arena?.duelists || {})) busy.add(id)
    for (const c of s.ownSect?.recruitPool || []) if (c.pid) busy.add(c.pid)
    for (const id of s.self?.parents || []) busy.add(id)
    const kinOfYou = new Set((f.children || []).flatMap(c => [c.id]))
    const cand = Object.values(w.persons).filter(p => {
      if (!this._heavyEligible(p, clanIds) || busy.has(p.id) || kinOfYou.has(p.id) || (p.parents || []).includes(s.self?.id)) return false
      const st = p.stageIndex || 0, a = yr - (p.bornYear ?? yr)
      if (st < stage[0] || st > stage[1] || a < age[0] || a > age[1]) return false
      if (p.sectRole === 'master' || p.sectRole === 'elder' || p.roadCard) return false
      if (kind === 'suitor' && (p.spouseIds || []).some(id => w.persons[id]?.alive !== false)) return false
      if (kind === 'recruit' && (p.sectId || st > 9)) return false
      return true
    })
    if (!cand.length) return null
    const W = C.weight, wt = p => 1 + Math.min(W.famCap, (p.fam || 0) * W.fam) + (p.cohort === life ? W.classmate : p.cohort ? W.pastClassmate : 0) + (p.chosen ? W.chosen : 0)
    let r = rng() * cand.reduce((a, p) => a + wt(p), 0)
    let pick = cand[cand.length - 1]
    for (const p of cand) { r -= wt(p); if (r < 0) { pick = p; break } }
    pick.fam = (pick.fam || 0) + 1; pick.seenY = yr
    const cs = this._castStats(); cs.known++; cs.knownTotal++
    return pick
  }
  // A copy of a registry person for an owner (family / arena) — the registry stays the one home (§5, pid write-through).
  _castCopy(p, role) {
    p.owner = role === 'duelist' ? 'arena' : 'family'; p.role = role   // mirrored now (the next sync would; a card may open first)
    const c = JSON.parse(JSON.stringify(p))
    for (const k of ['tier', 'act', 'ties', 'feud', 'mem', 'killedBy', 'grownYear', 'npcXp']) delete c[k]
    c.role = role
    return c
  }
  _castStats() {
    const w = this._s.world, hour = Math.floor((w.year || 0) / GAME_YEARS_PER_OPEN_HOUR)
    const c = w.cast ||= { hour, fresh: 0, known: 0, freshTotal: 0, knownTotal: 0, hours: 0 }
    if (c.hour !== hour) { c.hour = hour; c.fresh = 0; c.known = 0; c.hours = (c.hours || 0) + 1 }
    return c
  }
  _castCap() { const C = NPC_CAST; return Math.min(C.newPerHour[1], C.newPerHour[0] + Math.floor((this._s.stageIndex || 0) / 4)) }
  _castThrottled() { return this._castStats().fresh >= this._castCap() }
  _castFresh() { const c = this._castStats(); c.fresh++; c.freshTotal++ }

  // Public (UI): is this someone you know? (the "known face" marker on suitors, strangers, duelists, recruits)
  knownFace(pid) {
    const s = this._s, w = s.world, p = pid ? w?.persons?.[pid] : null
    if (!p || p.id === s.self?.id) return null
    const life = this._lifeNo()
    if (p.cohort === life) return { label: 'Your classmate', tone: 'gold', why: 'They awakened the same year as you.' }
    if (p.cohort) return { label: 'Old classmate', tone: '', why: `They awakened beside a past life of yours (life ${p.cohort}).` }
    if ((p.fam || 0) >= 2) return { label: 'Known face', tone: '', why: `You have come across their name ${p.fam} times.` }
    return null
  }

  // ── Phase 28 task 4.9 (living-world.md §9): encounters — the world's people meet you ─────────────────────────
  // The NPC acts first (their intent is theirs: _roadIntent reads temper, morality, rel, the power gap, your karma);
  // you answer from a queued card in Roam → Explore → "Met on the road". A card never expires and is never answered
  // for you; the stance only pre-selects a button. Every answer moves their rel and leaves a line in their mem.
  // State: s.road (per life: cards, waiting, the hour's count, stats) · w.roadStance (per slot) · p.roadCard / p.roadY.

  _blankRoad() {
    return { cards: [], waiting: [], seq: 0, hour: -1, n: 0, hintSeen: false, last: null }
  }
  // The counters (QA + the sim report) live on the world, so they add up across lives.
  _roadStats() { return this._s.world.roadStats ||= { rolled: 0, cards: 0, brushes: 0, waited: 0, answered: 0, gone: 0, byKind: {}, byAnswer: {}, bySource: {} } }
  _road() { return this._s.road ||= this._blankRoad() }
  roadStance() { return this._s.world?.roadStance || NPC_ENC.stanceDefault }
  // The player's bearing on the road (their own setting): it only pre-selects an answer on each card.
  setRoadStance(id) {
    if (!NPC_ENC.stances.some(x => x.id === id)) return { ok: false, reason: 'unknown' }
    this._s.world.roadStance = id
    this._notify()
    return { ok: true, stance: id }
  }
  _roadQueueLen() { return this._road().cards.length + (this._s.family?.encounters?.length || 0) }
  _roadFill(t, vals) { return String(t || '').replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m) }
  _roadPick(a) { return a[Math.floor(Math.random() * a.length)] }

  // An expedition returned / a sect mission ended / a game year passed at a founder's gate: does someone meet you?
  // source: 'expedition' | 'mission' | 'gate'. Returns the card, { brush }, { waited } or null.
  _roadRoll(source, loc = null, place = null) {
    const s = this._s, w = s.world, E = NPC_ENC
    if (!w?.persons || !s.self || s.interlude || !Array.isArray(s.family?.encounters)) return null
    const R = this._road(), hour = Math.floor((w.year || 0) / GAME_YEARS_PER_OPEN_HOUR)
    if (R.hour !== hour) { R.hour = hour; R.n = 0; R.avN = 0 }
    place = place || loc?.name || 'the road'
    // Someone sworn against you finds you first (they skip the hour's cap; when the queue is full they wait).
    const av = source !== 'mission' ? this._roadAvenger() : null
    if (av && (R.avN || 0) < E.avengersPerHour && Math.random() < E.avengerChance) { R.avN = (R.avN || 0) + 1; return this._roadMeet(av, 'ambush', source, loc, place, true) }
    if (Math.random() >= (E.chance[source] || 0) || R.n >= E.perHour) return null
    const p = this._roadCast(source, loc)
    if (!p) return null
    const intent = this._roadIntent(p, source)
    return intent ? this._roadMeet(p, intent, source, loc, place, false) : null
  }

  // A living person sworn to repay you (p.feud.pid = you): an avenger from _npcSlain, or someone you robbed / betrayed.
  _roadAvenger() {
    const s = this._s, w = s.world, yr = Math.floor(w.year), clanIds = this._clanIdSet()
    const rid = this._rivalOf()?.id   // 4.10b: your rival comes on their own schedule, never as an ordinary avenger
    return Object.values(w.persons).filter(p => p.feud?.pid === s.self.id && this._heavyEligible(p, clanIds) && !p.roadCard && p.id !== rid
      && !(p.feud.heir && s.stageIndex < NPC_REP.heirFeudStage)   // 4.10: an avenger of your line waits until you are grown
      && !(p.roadY != null && yr - p.roadY < NPC_ENC.avengerCooldown)).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null
  }

  // Who you meet: a heavy roamer at that place first, your own sect's people on a mission, else the world's known-first
  // casting (a fresh face is minted into the registry, and stays).
  _roadCast(source, loc) {
    const s = this._s, w = s.world, E = NPC_ENC, yr = Math.floor(w.year), clanIds = this._clanIdSet()
    const near = p => Math.abs((p.stageIndex || 0) - s.stageIndex) <= 4
    const rid = this._rivalOf()?.id   // 4.10b: (the rival seeks you out on their own schedule)
    const free = p => this._heavyEligible(p, clanIds) && !p.roadCard && p.sectRole !== 'master' && p.id !== rid
      && !(p.roadY != null && yr - p.roadY < E.cooldownYears && Math.abs(p.rel || 0) < E.notableRel)
    const si = Math.floor((w.year || 0) * NPC_HEAVY.seasons)
    if (source === 'expedition' && loc && Math.random() < E.roamerShare) {
      const here = Object.values(w.persons).filter(p => free(p) && near(p) && this._actOn(p, si)?.k === 'roam' && p.act.loc === loc.id)
      if (here.length) { const p = this._roadPick(here); p.fam = (p.fam || 0) + 1; p.seenY = yr; return p }
    }
    if (source === 'mission') {
      const mine = this._wsMine()
      const fellows = mine ? Object.values(w.persons).filter(p => free(p) && p.sectId === mine.id && near(p)) : []
      if (fellows.length) { const p = this._roadPick(fellows); p.fam = (p.fam || 0) + 1; p.seenY = yr; return p }
    }
    const busy = Object.values(w.persons).filter(p => !free(p)).map(p => p.id)
    const sectOpen = s.ownSect?.founded || s.sect?.id || (w.sects?.list || []).length
    const youth = sectOpen && Math.random() < 0.18
    const lo = Math.max(0, s.stageIndex + E.stageSpread[0]), hi = Math.min(NPC_STAGE_CAP, s.stageIndex + E.stageSpread[1])
    const known = youth ? this._castKnown('recruit', { stage: [0, E.youthMaxStage], age: [AWAKENING_AGE, E.youthMaxAge], exclude: busy })
      : this._castKnown('stranger', { stage: [lo, Math.max(lo, hi)], age: [AWAKENING_AGE + 2, 9999], exclude: busy })
    if (known) return known
    this._castFresh()
    const R = this._road(), rng = wsRng(`${this._peopleSeed()}|road|${R.seq}|${w.castSeq || 0}`)
    return youth ? this._mintPerson({ stage: Math.floor(rng() * (E.youthMaxStage + 1)), age: [AWAKENING_AGE, 24], role: 'youth' }, rng)
      : this._mintPerson({ stage: lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1)), age: [20, 70], role: 'wanderer' }, rng)
  }

  // What the NPC means to do — their choice, read from who they are and what they remember of you.
  _roadIntent(p, source) {
    const s = this._s, E = NPC_ENC, yr = Math.floor(s.world.year), rel = p.rel || 0, mor = p.morality || 0
    const tw = E.temper[p.personality] || {}, gap = (p.stageIndex || 0) - s.stageIndex, age = yr - (p.bornYear ?? yr)
    const young = (p.stageIndex || 0) <= E.youthMaxStage && age <= E.youthMaxAge && !p.sectId
    const sectOpen = s.ownSect?.founded || s.sect?.id || (s.world.sects?.list || []).length
    const gate = source === 'gate'
    const rep = this._rep(), RR = NPC_REP.road
    const hunter = rep.i >= RR.hunterInfamy && mor >= RR.hunterMorality   // 4.10: the righteous hunt the infamous
    const ok = {
      ambush: mor < E.ambushMorality || rel <= E.relCold || hunter,
      challenge: Math.abs(gap) <= 3 && age >= AWAKENING_AGE + 2,
      rescue: !gate && gap <= 1,
      contest: source === 'expedition',
      teamup: !gate && rel > E.relCold && mor > -40,
      youth: young && !!sectOpen && rel > E.relCold,
      oldface: p.cohort != null || (p.fam || 0) >= 3 || Math.abs(rel) >= 20,
    }
    const wt = {}
    for (const [k, b] of Object.entries(E.base)) {
      if (!ok[k]) continue
      let v = b * (tw[k] ?? 1)
      if (k === 'ambush') v *= (1 + E.infamy * (50 - (s.karma ?? 50)) / 100) * (rel <= E.relCold ? 2.5 : 1) * (gap > 0 ? 1.3 : gap < -2 ? 0.4 : 1)
      if (k === 'ambush' && hunter) v *= RR.hunterWeight * rep.i / 50
      if (k === 'rescue') v *= 1 + rep.h / 100 * RR.honourRescue   // 4.10: the wounded seek out a merciful name
      if (k === 'teamup') v *= 1 + rep.h / 100 * RR.honourTeamup
      if ((k === 'teamup' || k === 'oldface') && rel >= E.relWarm) v *= 2
      if (k === 'challenge' && rel <= E.relCold) v *= 1.5
      if (k === 'oldface' && p.cohort === this._lifeNo()) v *= 2
      if (k === 'youth') v *= 3
      wt[k] = v
    }
    return Object.keys(wt).length ? this._weightedRng(wt, Math.random) : null
  }

  // Why they came, in words for the card (no silent mechanics).
  _roadWhy(p, kind, avenger) {
    const s = this._s, T = NPC_ENC_TEXT.why, E = NPC_ENC, rel = p.rel || 0
    const mem = (p.mem || []).slice(-1)[0]?.text || ''
    const temper = (PERSONALITIES.find(x => x.id === p.personality)?.name || 'restless').toLowerCase()
    const moral = (MORALITY_WORDS.find(m => (p.morality || 0) >= m.min)?.word || 'pragmatic').toLowerCase()
    const v = { why: p.feud?.why || 'an old wrong', heir: p.feud?.heir || 'your forebear', mem, temper, moral, root: this._rootWords(p.root), n: p.fam || 0 }
    let k
    if (avenger) k = p.feud?.heir ? 'feudHeir' : 'feud'
    else if (kind === 'ambush') k = rel <= E.relCold && mem ? 'hate' : this._rep().i >= NPC_REP.road.hunterInfamy && (p.morality || 0) >= NPC_REP.road.hunterMorality ? 'hunter' : (s.karma ?? 50) < 35 ? 'infamy' : 'greed'
    else if (kind === 'challenge') k = rel <= E.relCold && mem ? 'grudge' : 'proud'
    else if (kind === 'rescue') k = rel >= E.relWarm && mem ? 'warm' : 'weaker'
    else if (kind === 'contest') k = rel <= E.relCold && mem ? 'grudge' : 'greedy'
    else if (kind === 'teamup') k = rel >= E.relWarm && mem ? 'warm' : 'kind'
    else if (kind === 'youth') k = 'talent'
    else k = p.cohort === this._lifeNo() ? 'classmate' : rel >= E.relWarm && mem ? 'warm' : rel <= E.relCold && mem ? 'grudge' : (p.fam || 0) >= 2 ? 'familiar' : 'plain'
    return this._roadFill(T[k], v)
  }

  // They found you. A card when there's room; else a notable person waits for a slot and an ordinary one is a brush.
  _roadMeet(p, kind, source, loc, place, avenger) {
    const s = this._s, R = this._road(), E = NPC_ENC, yr = Math.floor(s.world.year)
    this._roadStats().rolled++
    const notable = avenger || Math.abs(p.rel || 0) >= E.notableRel
    if (this._roadQueueLen() >= E.queueMax) {
      if (notable && R.waiting.length < E.waitMax) {
        R.waiting.push({ pid: p.id, kind, source, locId: loc?.id || null, place, avenger: !!avenger })
        p.roadCard = 'wait'; this._roadStats().waited++
        this.addEvent({ text: this._roadFill(NPC_ENC_TEXT.waits, { name: Persons.fullName(p) }), type: 'neutral', pid: p.id })
        return { waited: true, pid: p.id }
      }
      this._roadStats().brushes++; p.roadY = yr
      this.addEvent({ text: this._roadFill(this._roadPick(NPC_ENC_TEXT.brush), { name: Persons.fullName(p), place }), type: 'neutral', pid: p.id })
      return { brush: true, pid: p.id }
    }
    return this._roadCard(p, kind, source, loc, place, avenger)
  }

  _roadCard(p, kind, source, loc, place, avenger, x = {}) {
    const s = this._s, R = this._road(), E = NPC_ENC, X = NPC_ENC_TEXT, yr = Math.floor(s.world.year)
    const gate = source === 'gate'
    const card = { id: 'r' + (++R.seq), kind, pid: p.id, name: Persons.fullName(p), source, gate, locId: loc?.id || null, place, y: yr, avenger: !!avenger }
    if (x.rival) return this._rivalCardOpen(card, p, x.kin || null)   // 4.10b: your rival's own cards
    if (x.rank) return this._rankCardOpen(card, p, x.rank)   // 4.8: a rankings card (challenger · hunter · invitation)
    if (kind === 'ambush') card.lethal = !!avenger || (p.rel || 0) <= -60 || p.personality === 'psycho'
    if (kind === 'challenge') card.blood = (p.rel || 0) <= -40 || p.personality === 'psycho' || p.personality === 'demonking'
    if (kind === 'contest') {
      const tbl = (loc?.dropTable || []).filter(d => ITEMS[d.itemId] && ITEMS[d.itemId].type !== 'currency')
      const d = tbl.length ? [...tbl].sort((a, b) => a.weight - b.weight)[Math.floor(Math.random() * Math.min(3, tbl.length))] : null
      card.item = d ? { id: d.itemId, qty: 2 + Math.floor(Math.random() * 3) } : { id: null, qty: 0, stones: 40 + 20 * s.stageIndex }
    }
    const itemName = card.item?.id ? ITEMS[card.item.id].name : 'cache of spirit stones'
    card.text = this._roadFill(this._roadPick((gate && X.gateOpen[kind]) || X.open[kind]), { name: card.name, place, item: itemName })
    card.why = this._roadWhy(p, kind, avenger)
    p.roadCard = card.id; p.roadY = yr; p.fam = (p.fam || 0) + 1; p.seenY = yr
    if (!avenger) R.n++
    R.cards.push(card)
    this._roadStats().cards++
    this._roadStats().byKind[kind] = (this._roadStats().byKind[kind] || 0) + 1
    this._roadStats().bySource[source] = (this._roadStats().bySource[source] || 0) + 1
    this.addEvent({ text: `${card.text} (Roam → Explore)`, type: kind === 'ambush' ? 'negative' : 'special', pid: p.id })
    if (kind === 'ambush') this._emit('ambushed', { enemy: card.name, kind })   // (a banter line; other cards stay quiet so the return's line isn't lost)
    this._notify()
    return card
  }

  // The card is answered (or its person is gone): off the queue, and a waiting one takes the slot.
  _roadClose(card, answer) {
    const s = this._s, R = this._road(), p = s.world.persons[card.pid]
    R.cards = R.cards.filter(c => c.id !== card.id)
    if (p && p.roadCard === card.id) delete p.roadCard
    if (answer) { this._roadStats().answered++; const k = `${card.kind}:${answer}`; this._roadStats().byAnswer[k] = (this._roadStats().byAnswer[k] || 0) + 1 }
    this._roadPromote()
  }
  _roadPromote() {
    const s = this._s, R = this._road()
    while (R.waiting.length && this._roadQueueLen() < NPC_ENC.queueMax) {
      const x = R.waiting.shift(), p = s.world.persons[x.pid]
      if (!p || p.alive === false) continue
      delete p.roadCard
      this._roadCard(p, x.kind, x.source, LOCATIONS.find(l => l.id === x.locId) || null, x.place, x.avenger, x.rival ? { rival: true, kin: x.kin } : x.rank ? { rank: x.rank } : {})
    }
  }
  // A person on a card (or waiting) died before you answered: the card goes, and the log says why.
  _roadForget(p, cause) {
    const s = this._s, R = s.road
    if (!R) return
    const card = R.cards.find(c => c.pid === p.id), wait = R.waiting.find(x => x.pid === p.id)
    if (!card && !wait) return
    R.waiting = R.waiting.filter(x => x.pid !== p.id)
    if (card) { R.cards = R.cards.filter(c => c.id !== card.id); this._roadStats().gone++ }
    delete p.roadCard
    this.addEvent({ text: this._roadFill(NPC_ENC_TEXT.gone, { name: Persons.fullName(p), cause: (PERSON_CAUSE_TEXT[cause] || 'they have passed on').toLowerCase() }), type: 'neutral', pid: p.id })
    this._roadPromote()
  }

  // Their feeling toward you moves, and they keep a line of it (their own words, shown on their card).
  _roadRemember(p, key, place) {
    if (!p) return
    const s = this._s, E = NPC_ENC, yr = Math.floor(s.world.year)
    this._remember(p, key, E.rel[key] || 0, this._roadFill(NPC_ENC_TEXT.mem[key], { place: place || 'the road' }))   // 4.10: + reputation + rumour
    if (E.feudOn.includes(key) && p.alive !== false && !(p.feud && s.world.persons[p.feud.pid]?.alive !== false)) {
      p.feud = { pid: s.self.id, why: NPC_ENC_TEXT.feudWhy[key] || 'an old wrong', y: yr }
    }
  }

  // Public (UI + bot): the cards waiting, each with its person, the answers (odds, costs, locks) and the stance's pick.
  roadCards() {
    const s = this._s, R = this._road(), st = this.roadStance()
    return { stance: st, stances: NPC_ENC.stances, max: NPC_ENC.queueMax, waiting: R.waiting.length, hintSeen: !!(R.hintSeen || s.world?.roadHint),
      family: (s.family?.encounters || []).length,
      cards: R.cards.map(c => this.roadCardInfo(c.id)).filter(Boolean) }
  }
  noteRoadHint() { this._road().hintSeen = true; this._s.world.roadHint = true; this._notify() }   // (once per slot)

  roadCardInfo(id) {
    const s = this._s, R = this._road(), E = NPC_ENC, card = R.cards.find(c => c.id === id)
    if (!card) return null
    const p = s.world.persons[card.pid]
    if (!p) return null
    const yr = Math.floor(s.world.year), fight = s.family?.fight, hurt = (s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH
    const fightLock = fight ? 'Another fight is underway' : hurt ? 'Too wounded to fight' : null
    const odds = lethal => Math.round((this.personFightOdds(p, 'road', lethal)?.chance ?? 0.5) * 100)
    const A = [], add = (id, label, note, extra = {}) => A.push({ id, label, note, ...extra })
    const stoneYield = Math.min(s.spiritStones, Math.max(E.yieldStones[1], Math.round(s.spiritStones * E.yieldStones[0])))
    if (card.kind === 'ambush') {
      add('fight', 'Fight', `${odds(card.lethal)}% to win${card.lethal ? ' · to the death: lose, and this life ends' : ` · lose, and they take ${Math.round(E.lossStones * 100)}% of your stones`}`, { odds: odds(card.lethal), lock: fightLock, tone: 'red' })
      add('flee', 'Flee', `${Math.round(this._roadFleeChance(p) * 100)}% to slip away · fail, and the fight starts here`, { odds: Math.round(this._roadFleeChance(p) * 100), lock: fight ? 'Another fight is underway' : null })
      add('yield', 'Hand over stones', card.lethal ? '' : `They take ${stoneYield} Spirit Stones and go`, { lock: card.lethal ? 'They came for your life, not your purse' : null })
      if (card.lethal && card.avenger) {   // final QA (user 2026-10-04): an avenger can be bought off — the feud ends
        const bp = this._roadBloodPrice(p), refuse = E.bloodPrice.refuse.includes(p.personality)
        add('price', 'Pay the blood price', `${bp} Spirit Stones · Honour ${NPC_REP.deeds.bloodPaid.h} · the feud ends`,
          { lock: refuse ? 'Nothing but blood will answer this' : s.spiritStones < bp ? `You do not have ${bp} Spirit Stones` : null })
      }
    } else if (card.kind === 'challenge') {
      add('spar', 'Accept: a spar', `${odds(false)}% to win · until one yields`, { odds: odds(false), lock: fightLock })
      add('blood', 'Accept: to the death', `${odds(true)}% to win · lose, and this life ends`, { odds: odds(true), lock: fightLock, tone: 'red' })
      add('decline', 'Decline', E.proud.includes(p.personality) ? 'A proud heart will take it hard' : 'They will think a little less of you')
    } else if (card.kind === 'rescue') {
      const cost = this._roadRescueCost(card)
      add('help', 'Help them', `Costs about ${cost} Health · karma +${E.rescueKarma} · they may repay you`, { lock: (s.health ?? 100) <= cost + 5 ? 'Too wounded to fight their foes off' : null, tone: 'jade' })
      add('walk', 'Walk on', `Karma ${E.walkKarma} · they will remember`)
      add('rob', 'Rob them', `About ${this._roadRobStones(p)} stones · karma ${E.robKarma} · they may swear to repay it`, { tone: 'red' })
    } else if (card.kind === 'contest') {
      const it = card.item, nm = it.id ? `${it.qty}× ${ITEMS[it.id].name}` : `${it.stones} Spirit Stones`
      add('split', 'Split it', `You take half of ${nm}`)
      add('fight', 'Fight for it', `${odds(false)}% to win all of it · until one yields`, { odds: odds(false), lock: fightLock })
      add('yield', 'Let them have it', 'They will think well of you')
    } else if (card.kind === 'teamup') {
      add('accept', 'Travel together', 'One more haul from the place · they warm to you', { tone: 'jade' })
      add('betray', 'Accept, then take their share', `Two hauls · karma ${E.betrayKarma} · they may swear to repay it`, { tone: 'red' })
      add('decline', 'Go alone', 'They go their own way')
    } else if (card.kind === 'youth') {
      const o = s.ownSect, full = o?.founded && this._mainRoster().length >= (s.derived?.discipleCap || 0)
      add('invite', 'Take them into your sect', o?.founded ? `They join ${o.name} as a disciple, free` : '', { lock: !o?.founded ? 'You have no sect of your own' : full ? 'Your hall has no room' : null, tone: 'jade' })
      const to = this._roadPointSect()
      add('point', 'Point them to a sect', to ? `They take the oath at the ${to.name}${s.sect?.id && to === this._wsMine() ? ' · your sect thanks you' : ''}` : '', { lock: to ? null : 'No sect will have them' })
      add('pass', 'Pass on', 'They find their own way')
    } else if (card.rival) {
      this._rivalAnswers(card, p, add, odds, fightLock)   // 4.10b
    } else if (card.rank) {
      this._rankAnswers(card, p, add, odds, fightLock)   // 4.8
    } else {
      add('talk', 'Talk', 'Old days and new news · they warm to you', { tone: 'jade' })
      add('spar', 'Spar', `${odds(false)}% to win · until one yields`, { odds: odds(false), lock: fightLock })
      const will = (p.rel || 0) >= E.favourMinRel
      add('favour', 'Ask a favour', will ? `They think well enough of you to help` : 'They owe you nothing, and will likely refuse')
    }
    const pre = (card.rival ? NPC_RIVAL.preselect : card.rank ? NPC_RANK.preselect : E.preselect)[card.kind]?.[this.roadStance()]
    const pick = [].concat(pre || []).find(id => A.some(a => a.id === id && !a.lock)) || (A.find(a => !a.lock)?.id || null)   // a list = fallbacks in order
    const pers = PERSONALITIES.find(x => x.id === p.personality)
    const title = card.rank ? NPC_RANK_TEXT.title[card.kind] : card.rival ? (card.blood ? NPC_RIVAL_TEXT.bloodTitle : NPC_RIVAL_TEXT.title[card.kind]) : (card.gate && NPC_ENC_TEXT.gateTitle[card.kind]) || NPC_ENC_TEXT.title[card.kind]
    const rv = card.rival ? this._rivalRec() : null
    return { ...card, answers: A, pre: pick, title, heat: rv ? rv.heat : null, heatWord: rv ? this._rivalWord(rv.heat).w : null,
      urgent: card.kind === 'ambush' || card.avenger || card.kind === 'rivalKin' || !!card.blood || card.kind === 'hunter' || card.kind === 'hunterKin', alive: p.alive !== false, stage: p.stageIndex || 0, temper: pers?.name || null,
      morality: (MORALITY_WORDS.find(m => (p.morality || 0) >= m.min) || {}).word || null, rel: p.rel || 0, ago: yr - card.y }
  }

  // Final QA: what an avenger takes to end the feud — scales with their realm, and more when they outclass you.
  _roadBloodPrice(p) {
    const B = NPC_ENC.bloodPrice, gap = Math.max(0, (p.stageIndex || 0) - (this._s.stageIndex || 0))
    return Math.round(B.stones * ((p.stageIndex || 0) + 1) / 4 * (1 + gap * B.perGap))
  }

  _roadFleeChance(p) {
    const F = NPC_ENC.flee, s = this._s
    const c = F.base + (s.stageIndex - (p.stageIndex || 0)) * F.perStage + (s.body?.tier || 0) * F.body + (p.personality === 'coward' ? F.coward : 0)
    return Math.max(F.min, Math.min(F.max, c))
  }
  _roadRescueCost(card) {
    const s = this._s, loc = LOCATIONS.find(l => l.id === card.locId), R = NPC_ENC.rescueHealth
    const outclass = Math.max(0, (loc?.enemyTier || 1) - (1 + Math.floor(s.stageIndex / 5)))
    return Math.min(R[1] + 10, R[0] + Math.round((R[1] - R[0]) * Math.min(1, 0.3 + outclass * 0.35)))
  }
  _roadRobStones(p) { const R = NPC_ENC.robStones; return Math.round((R[0] + (R[1] - R[0]) * 0.5) * ((p.stageIndex || 0) + 1) / 4) }
  _roadPointSect() {
    const mine = this._wsMine()
    if (mine?.alive !== false && mine) return mine
    return this._wsAll().filter(r => r.alive).sort((a, b) => (b.tier || 1) - (a.tier || 1) || String(a.id).localeCompare(String(b.id)))[0] || null
  }

  // Your answer — always yours. Returns { ok, answer, text, fight? } (fight: the battle page opens; the card's story
  // ends in _roadFightOutcome).
  answerRoadCard(id, answer) {
    const s = this._s, E = NPC_ENC, R = this._road(), info = this.roadCardInfo(id)
    if (!info) return { ok: false, reason: 'unknown' }
    const a = info.answers.find(x => x.id === answer)
    if (!a) return { ok: false, reason: 'bad_answer' }
    if (a.lock) return { ok: false, reason: 'locked', lock: a.lock }
    const card = R.cards.find(c => c.id === id), p = s.world.persons[card.pid], yr = Math.floor(s.world.year)
    const name = card.name, place = card.place, loc = LOCATIONS.find(l => l.id === card.locId) || null
    const fight = (lethal, why) => {
      this._roadClose(card, answer)
      this.addEvent({ text: why, type: 'negative', pid: p.id })
      this._startFight('road', p, lethal, { road: { ...card, answer } })
      return { ok: true, answer, fight: true, text: why }
    }
    let text = '', type = 'neutral'
    const gain = (drops) => {
      const parts = []
      for (const [iid, q] of Object.entries(drops)) {
        if (ITEMS[iid]?.type === 'currency') s.spiritStones += q; else s.inventory[iid] = (s.inventory[iid] || 0) + q
        parts.push(`${q}× ${ITEMS[iid]?.name || iid}`)
      }
      return parts.join(', ') || 'little of worth'
    }
    switch (`${card.kind}:${answer}`) {
      case 'ambush:fight': return fight(card.lethal, `You turn to face ${name}${card.lethal ? '. This ends with one of you.' : '.'}`)
      case 'ambush:flee': {
        if (Math.random() < this._roadFleeChance(p)) { this._roadRemember(p, 'fled', place); text = `You slip away from ${name} at ${place}.`; break }
        return fight(card.lethal, `You run, and ${name} runs you down at ${place}.`)
      }
      case 'ambush:price': {   // final QA: the blood price ends an avenger's feud
        if (!card.lethal || !card.avenger || E.bloodPrice.refuse.includes(p.personality)) return { ok: false, reason: 'refused' }
        const n = this._roadBloodPrice(p)
        if (s.spiritStones < n) return { ok: false, reason: 'stones' }
        s.spiritStones -= n; delete p.feud; this._roadRemember(p, 'bloodPaid', place)
        text = `You pay ${name} the blood price: ${n} Spirit Stones. They take it, and the feud between you is ended.`; type = 'neutral'; break
      }
      case 'ambush:yield': {
        const n = Math.min(s.spiritStones, Math.max(E.yieldStones[1], Math.round(s.spiritStones * E.yieldStones[0])))
        s.spiritStones -= n; this._roadRemember(p, 'paid', place)
        text = `You hand ${name} ${n} Spirit Stones. They weigh the pouch, and go.`; type = 'negative'; break
      }
      case 'challenge:spar': case 'oldface:spar': return fight(false, `You accept ${name}'s challenge: until one yields.`)
      case 'challenge:blood': return fight(true, `You accept ${name}'s challenge: to the death.`)
      case 'challenge:decline': {
        const proud = E.proud.includes(p.personality)
        this._roadRemember(p, proud ? 'declinedProud' : 'declined', place)
        text = card.gate ? `You send ${name} away from your gate. Your disciples watch them go.` : `You decline ${name}'s challenge and walk on.`; break
      }
      case 'rescue:help': {
        const cost = this._roadRescueCost(card)
        s.health = Math.max(1, (s.health ?? 100) - cost)
        s.karma = Math.min(100, s.karma + E.rescueKarma)
        this._roadRemember(p, 'helped', place)
        p.injuredUntil = Math.min(p.injuredUntil || yr, yr + 1)
        let gift = ''
        if (Math.random() < E.rescueGift) {
          const t = this._teachableArts(p)
          if (t.length) { const art = this._roadPick(t); this._grantManual(art, `from ${p.given}, in thanks for their life`); gift = ` In thanks, they write out ${ARTS[art].name} for you.` }
          else { const n = 30 + 20 * ((p.stageIndex || 0) + 1); s.spiritStones += n; gift = ` They press ${n} Spirit Stones on you.` }
        }
        text = `You drive off what was hunting ${name} at ${place}. Health -${cost}.${gift}`; type = 'positive'; break
      }
      case 'rescue:walk':
        s.karma = Math.max(0, s.karma + E.walkKarma); this._roadRemember(p, 'walked', place)
        text = `You walk past ${name} at ${place}. Their eyes follow you.`; break
      case 'rescue:rob': {
        const n = this._roadRobStones(p)
        s.spiritStones += n; s.karma = Math.max(0, s.karma + E.robKarma)
        p.injuredUntil = Math.max(p.injuredUntil || 0, yr + 3)
        this._roadRemember(p, 'robbed', place)
        text = `You take ${n} Spirit Stones from ${name} as they lie bleeding at ${place}.`; type = 'negative'; break
      }
      case 'contest:split': {
        const it = card.item
        text = `You and ${name} split the find: ${it.id ? gain({ [it.id]: Math.max(1, Math.ceil(it.qty * E.contestShare)) }) : gain({ spirit_stone: Math.round(it.stones * E.contestShare) })}.`
        this._roadRemember(p, 'split', place); type = 'positive'; break
      }
      case 'contest:fight': return fight(false, `You and ${name} fight for the find at ${place}: until one yields.`)
      case 'contest:yield': this._roadRemember(p, 'yielded', place); text = `You step back and let ${name} take the find.`; break
      case 'teamup:accept': {
        const got = loc ? gain(this._rollDrops(loc)) : 'little of worth'
        this._roadRemember(p, 'teamup', place); p.fam = (p.fam || 0) + 2
        text = `You and ${name} clear ${place} together: ${got}.`; type = 'positive'; break
      }
      case 'teamup:betray': {
        const d1 = loc ? this._rollDrops(loc) : {}, d2 = loc ? this._rollDrops(loc) : {}
        for (const [k, q] of Object.entries(d2)) d1[k] = (d1[k] || 0) + q
        const got = gain(d1)
        s.karma = Math.max(0, s.karma + E.betrayKarma); this._roadRemember(p, 'betrayed', place)
        text = `You clear ${place} with ${name}, then take their share at knifepoint: ${got}.`; type = 'negative'; break
      }
      case 'teamup:decline': this._roadRemember(p, 'declined', place); text = `You thank ${name}, and go on alone.`; break
      case 'youth:invite': {
        const o = s.ownSect
        this._takeIntoSect(p)
        this._roadRemember(p, 'invited', place)
        text = `${name} kneels and takes the oath of ${o.name}.`; type = 'positive'; break
      }
      case 'youth:point': {
        const r = this._roadPointSect()
        p.sectId = r.id; p.sectRole = 'disciple'; p.role = 'disciple'; r.disciples = (r.disciples || 0) + 1
        if (s.sect?.id && r === this._wsMine()) s.sect.contribution += 15
        this._roadRemember(p, 'pointed', place)
        text = `You send ${name} to the ${r.name}. They bow low before they go.`; type = 'positive'; break
      }
      case 'youth:pass': text = `You leave ${name} to find their own way.`; break
      case 'oldface:talk': {
        this._roadRemember(p, 'talked', place)
        const now = this._personNow(p).now
        text = `You and ${name} talk late into the night${now ? `. ${now.charAt(0) + now.slice(1).toLowerCase()}, they say` : ''}.`; type = 'positive'; break
      }
      case 'oldface:favour': {
        if ((p.rel || 0) >= E.favourMinRel) {
          const F = E.favourStones, n = Math.round((F[0] + Math.random() * (F[1] - F[0])) * ((p.stageIndex || 0) + 1) / 4)
          s.spiritStones += n; this._roadRemember(p, 'favour', place)
          text = `${name} helps you without a second thought: ${n} Spirit Stones.`; type = 'positive'
        } else { this._roadRemember(p, 'favourRefused', place); text = `${name} hears you out, and says no.` }
        break
      }
      default: {
        if (!card.rival && !card.rank) return { ok: false, reason: 'bad_answer' }
        const r = card.rank ? this._rankAnswer(card, p, answer, fight) : this._rivalAnswer(card, p, answer, fight)   // 4.10b: your rival's cards · 4.8: rankings cards
        if (!r || r.fight || !r.ok) return r || { ok: false, reason: 'bad_answer' }
        text = r.text; type = r.type || 'neutral'
      }
    }
    this._roadClose(card, answer)
    R.last = { id, kind: card.kind, answer, text }
    this.addEvent({ text, type, pid: p.id })
    this._recalc(); this._notify()
    return { ok: true, answer, text }
  }

  // A road fight ended (fight kind 'road'; the card's story is on fi.road). res from _finishFight.
  _roadFightOutcome(fi, opp, res) {
    const s = this._s, E = NPC_ENC, yr = Math.floor(s.world.year), card = fi.road || {}, place = card.place || 'the road'
    const name = Persons.fullName(opp), R = this._road()
    this._applyLethalTrauma(res, fi.lethal)
    let text = '', outcome
    const rv = this._isRival(opp) ? this._rivalRec() : null   // 4.10b: a fight with your rival writes the rivalry's record
    if (res.winner.id === s.self.id) {
      if (res.died) {
        // An ambusher cut down in self-defence costs no karma (nor a rival stopped on the way to your kin); killing a
        // challenger you agreed to fight does.
        if (card.kind !== 'ambush' && card.kind !== 'rivalKin' && card.kind !== 'hunter' && card.kind !== 'hunterKin') s.karma = Math.max(0, s.karma + CHALLENGE_KARMA_DEATH)   // (4.8: nor a genius hunter)
        if (card.kind === 'duel' && opp.feud?.pid !== s.self.id && !(rv && rv.heat <= NPC_RIVAL.bloodHeat)) this._repDeed('murdered', opp)   // 4.10: a duel you called (4.10b: a blood feud with your rival is not murder)
        if (rv) this._rivalFought(rv, opp, card, 'slain', place)
        const rk = card.rank ? this._rankFought(card, opp, 'slain') : ''   // 4.8
        this._npcSlain(opp, s.self, yr, rv ? 'rival' : 'road')
        text = card.kind === 'ambush' ? `${name} came for you at ${place}, and does not leave it.` : `You kill ${name} at ${place}.`
        if (card.kind === 'contest') text += ` The find is yours: ${this._roadTake(card, 1)}.`
        text += rk
        outcome = 'won_lethal'
      } else {
        const ch = fi.roadChoice || 'raise'
        this._roadRemember(opp, ch === 'humble' ? 'humbled' : ch === 'spare' ? 'spared' : card.kind === 'ambush' ? 'lostTo' : ch === 'raise' ? 'raised' : 'sparred', place)
        if (ch === 'humble' && E.proud.includes(opp.personality) && !opp.feud) opp.feud = { pid: s.self.id, why: NPC_ENC_TEXT.feudWhy.humbled, y: yr }
        text = { spare: `You let ${name} live.`, raise: `You help ${name} up.`, humble: `You leave ${name} in the dust.` }[ch] || `You beat ${name}.`
        if (card.kind === 'contest') text += ` The find is yours: ${this._roadTake(card, 1)}.`
        if (rv) text += this._rivalFought(rv, opp, card, ch === 'humble' ? 'humbled' : ch === 'spare' ? 'spared' : 'won', place)
        if (card.rank) text += this._rankFought(card, opp, 'won')   // 4.8
        outcome = 'won_nonlethal'
      }
    } else if (res.died) {
      this._roadRemember(opp, 'beatYou', place)
      R.last = { kind: card.kind, answer: card.answer, text: `${name} killed you at ${place}.` }
      this.addEvent({ text: `Year ${yr}: ${name}'s blade is faster. You die at ${place}.`, type: 'negative', pid: opp.id })
      if (rv) this._rivalFought(rv, opp, card, 'killedYou', place)
      if (opp.feud?.pid === s.self.id) delete opp.feud
      for (const sw of this._swornWar().people) {   // 4.10: your sworn siblings take up the feud
        if (sw.id === opp.id || (sw.feud && s.world.persons[sw.feud.pid]?.alive !== false)) continue
        sw.feud = { pid: opp.id, why: `their sworn sibling ${s.name}`, y: yr }
        this.addEvent({ text: NPC_ACTS_TEXT.swornAvenge.replace('{name}', Persons.fullName(sw)).replace('{killer}', name), type: 'special', pid: sw.id })
      }
      this._recalc(); this._notify()
      this._die('road')
      return 'lost_lethal'
    } else {
      this._roadRemember(opp, 'beatYou', place)
      if (card.kind === 'ambush') {
        const n = Math.floor(s.spiritStones * E.lossStones)
        s.spiritStones -= n
        text = `${name} beats you down at ${place} and takes ${n} Spirit Stones.`
      } else text = card.kind === 'contest' ? `${name} beats you, and takes the find.` : `${name} beats you${res.yielded ? ' — you yield' : ''}, and walks on.`
      if (rv) text += this._rivalFought(rv, opp, card, 'lost', place)
      if (card.rank) text += this._rankFought(card, opp, 'lost')   // 4.8
      outcome = 'lost_nonlethal'
    }
    R.last = { kind: card.kind, answer: card.answer, text }
    this.addEvent({ text, type: outcome.startsWith('won') ? 'positive' : 'negative', pid: opp.id })
    this._recalc(); this._notify()
    return outcome
  }
  _roadTake(card, share) {
    const s = this._s, it = card.item || {}
    if (it.id) { const q = Math.max(1, Math.round(it.qty * share)); s.inventory[it.id] = (s.inventory[it.id] || 0) + q; return `${q}× ${ITEMS[it.id].name}` }
    const n = Math.round((it.stones || 0) * share); s.spiritStones += n; return `${n} Spirit Stones`
  }

  // Public (QA + the sim report): encounter counters.
  roadStats() { const R = this._road(); return { ...this._roadStats(), queued: R.cards.length, waiting: R.waiting.length } }

  // ── Phase 28 task 4.10 (living-world.md §2): memory, reputation, rumours, the person card's deeds ──────────────
  // Every memory carries its rel delta (`d`, the person card's "why"), and the life it was written in. A deed with a
  // weight in NPC_REP.deeds moves your Honour / Infamy (w.rep, carried at half into the next life); a big one becomes a
  // rumour that reaches the person's kin + friends the next game year. State: w.rep · w.rumours · p.mem[].d/.life ·
  // p.sworn (your id) · p.actAt (real-time cooldown stamp) · p.mentorUntil · w.actStats.

  _rep() { return this._s.world.rep ||= { h: 0, i: 0, log: [] } }
  // A deed moves Honour / Infamy. Returns the deed key as counted (a wrong done to a sworn sibling is its own deed).
  _repDeed(key, p) {
    if (!key) return null
    const R = NPC_REP, rep = this._rep(), me = this._s.self?.id
    if (['robbed', 'betrayed', 'denounced', 'murdered'].includes(key) && me && p?.sworn === me) { key = 'betrayedSworn'; p.sworn = null }
    const d = R.deeds[key]
    if (!d) return key
    if (d.h) rep.h = Math.max(0, Math.min(R.max, rep.h + d.h))   // (final QA: a deed can now cost Honour — never below 0)
    if (d.i) rep.i = Math.max(0, Math.min(R.max, rep.i + d.i))
    rep.log.push({ y: Math.floor(this._s.world.year), k: key, h: d.h || 0, i: d.i || 0, pid: p?.id || null, n: p ? Persons.fullName(p) : '' })
    if (rep.log.length > R.logMax) rep.log.splice(0, rep.log.length - R.logMax)
    return key
  }
  // `p` remembers something you did: rel moves by d, they keep the line, your name moves, and word may spread.
  _remember(p, key, d, text, { rumour = true, deed = key } = {}) {
    if (!p) return
    const s = this._s, w = s.world, yr = Math.floor(w.year)
    d = Math.round(d || 0)
    p.rel = Math.max(-100, Math.min(100, Math.round((p.rel || 0) + d)))
    const last = (p.mem || []).slice(-1)[0]
    if (text && last && last.k === key && last.text === text && last.life === this._lifeNo()) { last.y = yr; last.d = (last.d || 0) + d; last.n = (last.n || 1) + 1 }   // the same deed again: one line, ×n
    else if (text) p.mem = [...(p.mem || []), { y: yr, k: key, text, d, life: this._lifeNo() }].slice(-NPC_ENC.memMax)
    const dk = this._repDeed(deed, p)
    if (rumour && dk && Math.abs(d) >= NPC_REP.rumour.minDelta && NPC_ACTS_TEXT.deed[dk]) {
      (w.rumours ||= []).push({ y: yr, pid: p.id, k: dk, d })
      if (w.rumours.length > 30) w.rumours.shift()
    }
    if (d && this._isRival(p)) this._rivalHeat(this._rivalRec(), d * NPC_RIVAL.relToHeat)   // 4.10b: what your rival remembers moves the heat
  }

  // Public (UI): your name in the world — Honour, Infamy, the word for it, the latest deeds, and what it changes.
  reputeInfo() {
    const R = NPC_REP, rep = this._rep(), h = Math.round(rep.h), i = Math.round(rep.i)
    let word = R.none, tone = 'dim'
    if (h >= R.bothMin && i >= R.bothMin) { word = R.both; tone = 'gold' }
    else for (const x of R.words) {
      if (Math.max(h, i) < x.min) continue
      word = h >= i ? x.h : x.i; tone = h >= i ? 'jade' : 'red'; break
    }
    const acc = Math.round((h * R.acceptHonour + i * R.acceptInfamy) * 100)
    const effects = []
    if (h) effects.push({ label: 'The wounded and the kind seek you out on the road', val: `×${(1 + h / 100 * R.road.honourRescue).toFixed(2)}`, tone: 'up' })
    if (i >= R.road.hunterInfamy) effects.push({ label: 'The righteous hunt you on the road', val: `×${(R.road.hunterWeight * i / 50).toFixed(2)}`, tone: 'down' })
    if (acc) effects.push({ label: 'Offers you make (spar, recruit, swear, court)', val: `${acc > 0 ? '+' : ''}${acc}% to accept`, tone: acc > 0 ? 'up' : 'down' })
    if (i) effects.push({ label: 'A courtship starts cooler', val: `−${Math.round(i * -R.courtInfamy)} interest`, tone: 'down' })
    return { h, i, word, tone, log: [...rep.log].reverse(), effects, carry: R.carry, fade: R.fadePerYear }
  }

  // The yearly tick: your name fades a little, rumours reach the people of those you touched, friends send gifts and
  // enemies talk. Seeded per person + year (wsRng), so the sim's other draws don't shift.
  _tickRepute(yr) {
    const s = this._s, w = s.world, R = NPC_REP, T = NPC_ACTS_TEXT, rep = this._rep(), me = s.self?.id
    if (!w?.persons || !me || s.interlude) return
    rep.h *= 1 - R.fadePerYear; rep.i *= 1 - R.fadePerYear
    const st = w.repStats ||= { rumours: 0, heard: 0, gifts: 0, slanders: 0 }
    const rs = w.rumours || []
    w.rumours = []
    for (const r of rs) {
      const v = w.persons[r.pid]
      if (!v) continue
      const near = new Set([...(v.parents || []), ...(v.spouseIds || []), ...Object.keys(v.ties || {}).filter(id => v.ties[id] >= 40)])
      for (const p of Object.values(w.persons)) if ((p.parents || []).includes(v.id)) near.add(p.id)
      let n = 0
      for (const id of [...near].sort()) {
        if (n >= R.rumour.max) break
        const h = w.persons[id]
        if (!h || h.alive === false || id === me || id === v.id || h.role === 'ancestor') continue
        if (r.d < 0 && (h.morality || 0) <= R.rumour.darkAdmire) continue   // a dark heart shrugs off cruelty
        const text = this._roadFill(r.d > 0 ? T.mem.heardKind : T.mem.heard, { deed: T.deed[r.k], name: Persons.fullName(v) })
        this._remember(h, 'heard', r.d * R.rumour.share, text, { rumour: false, deed: null })
        n++; st.heard++
      }
      if (n) st.rumours++
    }
    for (const p of Object.values(w.persons)) {
      if (p.alive === false || p.tier !== 'heavy' || p.id === me || p.roadCard) continue
      const rel = p.rel || 0
      if (rel < R.friendRel && rel > R.enemyRel && p.feud?.pid !== me) continue
      const rng = wsRng(`${p.id}|rep|${yr}`), nm = Persons.fullName(p)
      const mem = (p.mem || []).filter(m => m.life === this._lifeNo() || m.life == null).slice(-1)[0]?.text || 'For old times.'
      if (rel >= R.friendRel && rng() < R.friendGift) {
        const n = Math.round((R.friendStones[0] + rng() * (R.friendStones[1] - R.friendStones[0])) * ((p.stageIndex || 0) + 1) / 4)
        s.spiritStones += n; st.gifts++
        this.addEvent({ text: this._roadFill(T.friendGift[Math.floor(rng() * T.friendGift.length)], { name: nm, n, mem }), type: 'positive', pid: p.id })
      } else if ((rel <= R.enemyRel || p.feud?.pid === me) && rng() < R.enemySlander) {
        rep.i = Math.min(R.max, rep.i + R.slanderInfamy); st.slanders++
        rep.log.push({ y: yr, k: 'slander', h: 0, i: R.slanderInfamy, pid: p.id, n: nm })
        if (rep.log.length > R.logMax) rep.log.splice(0, rep.log.length - R.logMax)
        for (const q of Object.values(w.persons)) if (q.alive !== false && (q.ties?.[p.id] || 0) >= 40 && q.id !== me) q.rel = Math.max(-100, Math.min(100, (q.rel || 0) + R.slanderRel))
        const deed = T.deed[(p.mem || []).slice(-1)[0]?.k] || 'wronged them'
        this.addEvent({ text: this._roadFill(T.slander[Math.floor(rng() * T.slander.length)], { name: nm, mem, n: R.slanderInfamy, deed }), type: 'negative', pid: p.id })
      }
    }
  }

  // A new life (2.6d `_beginLife`): what the world remembers of the last one. Feuds sworn against it now hunt you;
  // hatred (rel ≤ −50) stays whole; every other feeling is halved; sworn oaths end with the life; Honour / Infamy carry
  // at NPC_REP.carry (user pick 2026-10-03: strong grudges, half debts).
  _inheritRepute(year = null) {
    const s = this._s, w = s.world, last = (w.pastLives || []).slice(-1)[0], me = s.self?.id, R = NPC_REP
    if (!last || !me || last.personId === me) return
    const old = w.persons[last.personId], oldName = (old && Persons.fullName(old)) || 'your forebear'
    for (const p of Object.values(w.persons)) {
      if (p.id === me) continue
      if (p.feud?.pid === last.personId) { p.feud.pid = me; p.feud.heir = oldName; if (year != null) p.feud.y = year }   // the clock starts again with the new life
      if (p.sworn === last.personId) p.sworn = null
      if (p.rel && p.rel > -50) p.rel = Math.round(p.rel * R.carry)
    }
    const rep = this._rep()
    rep.h *= R.carry; rep.i *= R.carry
    rep.log.push({ y: Math.floor(w.year), k: 'carried', h: Math.round(rep.h), i: Math.round(rep.i), pid: last.personId, n: oldName })
    if (rep.log.length > R.logMax) rep.log.splice(0, rep.log.length - R.logMax)
  }

  // The sworn siblings you have (alive), and what they add to a sect war of yours.
  _swornWar() {
    const s = this._s, me = s.self?.id, A = NPC_ACTS.swear
    const ps = Object.values(s.world?.persons || {}).filter(p => p.sworn === me && p.alive !== false)
    // v1 add-on (bosses.md): a mirror child who stands with you ("Two hearts, one path") fights in every war too
    const mk = (s.family?.children || []).find(c => c.alive && c.mirrorFate === 'ally'), mb = mk ? SOUL_TECH.seed.allyWarBonus : 0
    return { people: ps, names: [...ps.map(p => Persons.fullName(p)), ...(mk ? [`${mk.given}, your mirror`] : [])], bonus: Math.min(A.warMax, ps.length * A.warEach) + mb }
  }

  // Takes a registry person into your own sect as a disciple (they ARE the disciple: pid kept). Shared with the road's
  // youth card. Leaves a world sect one disciple short.
  _takeIntoSect(p) {
    const s = this._s, o = s.ownSect, t = p.root?.type
    const talent = t === 'heavenly' ? 5 : t === 'pure' ? 4 : t === 'dual' ? 3 : 2
    o.disciples.push({ id: `d${Date.now()}_${Math.floor(Math.random() * 99999)}`, pid: p.id, name: Persons.fullName(p), talent, level: 1, xp: 0, branchId: null, role: 'disciple', kin: false, personality: disciplePersonality(p.id) })
    const r = p.sectId && p.sectId !== 'own' ? this._wsRec(p.sectId) : null
    if (r) { r.disciples = Math.max(0, (r.disciples || 0) - 1); r.memberIds = (r.memberIds || []).filter(id => id !== p.id) }
    p.sectId = 'own'; p.sectRole = 'disciple'; p.role = 'disciple'; p.owner = 'sect'
    return r
  }

  _isYourKin(p) {
    const s = this._s, f = s.family || {}, id = p.id
    return f.spouse?.id === id || (f.children || []).some(c => c.id === id) || (f.lovers || []).some(l => l.person?.id === id)
      || (s.self?.parents || []).includes(id) || (p.parents || []).includes(s.self?.id) || this._clanIdSet().has(id)
  }

  // Public (UI + bot): what you can do to this person from their card. Every deed with its cost, the odds they accept
  // (theirs to decide), the fight odds, and why it is locked. cd = seconds of open time before they take another deed.
  personActions(pid) {
    const s = this._s, w = s.world, p = w?.persons?.[pid], me = s.self?.id
    if (!p || pid === me) return null
    const A = NPC_ACTS, R = NPC_REP, T = NPC_ACTS_TEXT, yr = Math.floor(w.year), rel = p.rel || 0, rep = this._rep()
    if (p.alive === false || p.role === 'ancestor' || (w.pastLives || []).some(l => l.personId === pid)) return { pid, acts: [], cd: 0, gone: true }
    const f = s.family || {}, kin = this._isYourKin(p), proud = NPC_ENC.proud.includes(p.personality)
    const clamp = v => Math.max(0.05, Math.min(0.95, v)), pct = v => Math.round(v * 100)
    const accept = b => clamp(b + rep.h * R.acceptHonour + rep.i * R.acceptInfamy)
    const fightLock = f.fight ? 'Another fight is underway' : (s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH ? 'Too wounded to fight' : null
    const odds = lethal => Math.round((this.personFightOdds(p, 'road', lethal)?.chance ?? 0.5) * 100)
    const acts = [], add = (id, note, x = {}) => acts.push({ id, label: T.label[id], icon: T.icon[id], note, lock: null, tone: '', ...x })
    // Gift
    const cost = Math.round(A.gift.stones[0] + A.gift.stones[1] * (p.stageIndex || 0))
    const greedy = A.gift.greedy.includes(p.personality)
    const gd = rel >= A.gift.warmCap ? A.gift.warmRel : greedy ? A.gift.greedyRel : A.gift.rel
    add('gift', `${cost} Spirit Stones · +${gd}${greedy && rel < A.gift.warmCap ? ' (a greedy heart loves a gift)' : rel >= A.gift.warmCap ? ' (they already hold you dear)' : ''}`,
      { cost, lock: s.spiritStones < cost ? `Needs ${cost} Spirit Stones` : null, tone: 'jade' })
    // Spar
    const sparAcc = accept(A.spar.accept + (proud ? A.spar.proud : 0) + rel * A.spar.perRel + (rel <= -30 ? A.spar.hateAccept : 0))
    add('spar', `${pct(sparAcc)}% they accept · ${odds(false)}% to win · until one yields`, { chance: pct(sparAcc), odds: odds(false), lock: fightLock })
    // Duel to the death
    const rv = this._isRival(p) ? this._rivalRec() : null   // 4.10b: with your rival, a blood feud (heat) opens it too
    const atOdds = rel <= A.duel.needRel || p.feud?.pid === me || (rv && rv.heat <= NPC_RIVAL.bloodHeat)
    const duelAcc = clamp(A.duel.accept + (proud ? A.duel.proud : 0) + (atOdds ? A.duel.hate : 0))
    add('duel', `${pct(duelAcc)}% they accept · ${odds(true)}% to win · lose, and this life ends`, { chance: pct(duelAcc), odds: odds(true), tone: 'red',
      lock: kin ? 'Not against your own family' : !atOdds ? (rv ? `Only in a blood feud (heat ${this._rivalSigned(NPC_RIVAL.bloodHeat)} or colder; now ${this._rivalSigned(rv.heat)})`
        : `Only against someone at odds with you (${A.duel.needRel} or sworn against you)`) : fightLock })
    // Teach them (mentor)
    const qiCost = Math.round((s.derived?.qiCap || 0) * A.mentor.qiFrac)
    const gap = s.stageIndex - (p.stageIndex || 0)
    add('mentor', `Costs {qi} Qi · they cultivate ×${A.mentor.mult} for a while · +${A.mentor.rel} · Honour +${R.deeds.mentored.h}`, { qiCost, tone: 'jade',
      lock: gap < A.mentor.gap ? `You must stand ${A.mentor.gap} stages above them` : (p.stageIndex || 0) >= NPC_STAGE_CAP ? 'They have nothing left to learn' : rel < A.mentor.needRel ? `They must think well of you (+${A.mentor.needRel})` : (p.mentorUntil || 0) > yr ? 'Still learning from your last lesson' : s.qi < qiCost ? 'Not enough Qi' : null })
    // Invite to your sect
    const o = s.ownSect, full = o?.founded && this._mainRoster().length >= (s.derived?.discipleCap || 0)
    const recAcc = accept(A.recruit.base + rel * A.recruit.perRel + (p.sectId ? A.recruit.member : A.recruit.unaffiliated))
    const fromSect = p.sectId && p.sectId !== 'own' ? this._wsRec(p.sectId) : null
    add('recruit', `${pct(recAcc)}% they accept${fromSect ? ` · the ${fromSect.name} will resent it` : ''}`, { chance: pct(recAcc), tone: 'jade',
      lock: !o?.founded ? 'You have no sect of your own' : p.sectId === 'own' ? 'Already in your sect' : p.sectRole === 'master' || p.sectRole === 'elder' ? 'A sect master or elder will not leave their sect'
        : kin ? 'Your family is not yours to recruit here (Kin → Family)' : p.owner === 'arena' ? 'They belong to the Arena\'s rings' : full ? 'Your hall has no room' : rel < A.recruit.needRel ? `They must think well of you (+${A.recruit.needRel})` : null })
    // Swear brotherhood
    const swAcc = accept(A.swear.base + (rel - A.swear.needRel) * A.swear.perRel)
    add('swear', `${pct(swAcc)}% they accept · they fight in your sect wars and avenge you`, { chance: pct(swAcc), tone: 'gold',
      lock: p.sworn === me ? 'Already sworn to you' : kin ? 'Family is already bound to you' : rel < A.swear.needRel ? `They must hold you dear (+${A.swear.needRel})` : null })
    // Denounce
    const just = (p.morality || 0) <= A.denounce.justMorality
    add('denounce', just ? `Their crimes are real: Honour +${R.deeds.denounceJust.h}, no karma cost · they will hate you` : `Karma ${A.denounce.karma} · Infamy +${R.deeds.denounced.i} · they and theirs turn on you${p.sworn === me ? ' · breaks your oath' : ''}`,
      { tone: 'red', lock: kin ? 'Not your own family' : null })
    // Court
    const age = yr - (p.bornYear ?? yr), married = (p.spouseIds || []).some(id => w.persons[id] && w.persons[id].alive !== false)
    const interest = Math.round(COURT_INTEREST_START + rel * A.court.interestPerRel + rep.i * R.courtInfamy + (p.personality === s.personality?.id ? COURT_SAME_PERSONALITY : 0))
    add('court', `Begins a courtship on Kin → Family · they start ${Math.max(0, interest)} interested`, { tone: 'jade',
      lock: f.spouse ? 'You are married' : f.court ? 'You are already courting someone' : Math.max(s.maxStageThisLife || 0, s.stageIndex) < PROPOSAL_MIN_STAGE ? 'Courtship opens at Foundation Building'
        : kin ? 'Not your own family' : married ? 'They are married' : age < A.court.minAge ? 'They are too young' : p.owner === 'arena' ? 'They belong to the Arena\'s rings' : rel < A.court.needRel ? `They hardly know you (+${A.court.needRel})` : null })
    return { pid, acts, cd: this._cdLeft(p.actAt), hint: !w.actHint, sworn: p.sworn === me }
  }

  // Public (UI + bot): do it. Your choice; their answer to an offer is theirs (rolled on the odds shown). Returns
  // { ok, text, accepted?, fight? } (fight: the battle page opens as a road fight).
  personAct(pid, id) {
    const s = this._s, w = s.world, info = this.personActions(pid)
    if (!info || info.gone) return { ok: false, reason: 'unknown' }
    const a = info.acts.find(x => x.id === id)
    if (!a) return { ok: false, reason: 'bad_act' }
    if (info.cd) return { ok: false, reason: 'cooldown', secsLeft: info.cd }
    if (a.lock) return { ok: false, reason: 'locked', lock: a.lock }
    const A = NPC_ACTS, T = NPC_ACTS_TEXT, p = w.persons[pid], name = Persons.fullName(p), yr = Math.floor(w.year)
    p.actAt = this._cdNow() + A.cooldownSecs
    w.actHint = true
    const st = w.actStats ||= {}
    st[id] = (st[id] || 0) + 1
    const roll = () => Math.random() * 100 < a.chance
    let text = '', type = 'neutral', accepted = null
    const fight = (lethal, kind, why) => {
      this.addEvent({ text: why, type: 'negative', pid })
      this._startFight('road', p, lethal, { road: { id: 'act', kind, pid, name, place: 'a quiet courtyard', answer: kind, act: true } })
      this._notify()
      return { ok: true, fight: true, accepted: true, text: why }
    }
    switch (id) {
      case 'gift': {
        s.spiritStones -= a.cost
        const greedy = A.gift.greedy.includes(p.personality)
        const gd = (p.rel || 0) >= A.gift.warmCap ? A.gift.warmRel : greedy ? A.gift.greedyRel : A.gift.rel
        this._remember(p, 'gift', gd, T.mem[greedy ? 'giftGreedy' : 'gift'], { rumour: false })
        text = `You send ${name} ${a.cost} Spirit Stones.${greedy ? ' Their eyes light up.' : ''}`; type = 'positive'; break
      }
      case 'spar':
        if (roll()) return fight(false, 'spar', `${name} accepts your invitation to spar: until one yields.`)
        this._remember(p, 'sparRefused', -2, T.mem.sparRefused, { rumour: false, deed: null })
        text = `${name} declines to spar with you.`; accepted = false; break
      case 'duel':
        if (Math.random() * 100 < a.chance) return fight(true, 'duel', `${name} accepts your challenge: to the death.`)
        this._remember(p, 'duelRefused', -5, T.mem.duelRefused, { rumour: false, deed: null })
        text = `${name} will not meet you to the death.`; accepted = false; break
      case 'mentor':
        s.qi = Math.max(0, s.qi - a.qiCost)
        p.npcXp = Math.min(0.95, (p.npcXp || 0) + A.mentor.xp)
        p.mentorUntil = yr + A.mentor.years
        this._remember(p, 'mentored', A.mentor.rel, T.mem.mentored)
        text = `You sit with ${name} and open the way a little further for them.`; type = 'positive'; break
      case 'recruit':
        if (roll()) {
          const from = this._takeIntoSect(p)
          if (from) this._wsDeed(from, A.recruit.stanceHit, `you lured ${name} away`)
          this._remember(p, 'invited', NPC_ENC.rel.invited, T.mem.recruited)
          text = `${name} takes the oath of ${s.ownSect.name}.${from ? ` The ${from.name} will not forget it.` : ''}`; type = 'positive'; accepted = true
        } else {
          this._remember(p, 'recruitRefused', A.recruit.refuseRel, T.mem.recruitRefused, { rumour: false, deed: null })
          text = `${name} hears you out, and declines your sect.`; accepted = false
        }
        break
      case 'swear':
        if (roll()) {
          p.sworn = s.self.id
          this._remember(p, 'sworn', A.swear.rel, T.mem.sworn)
          this._chron({ k: 'deed', t: `${s.name} and ${name} swear brotherhood under the same sky.`, p: [p.id], n: false })
          text = `You and ${name} swear brotherhood: from this day, your enemies are theirs.`; type = 'special'; accepted = true
          this._emit('world_news', { text, type: 'special' })
        } else {
          this._remember(p, 'swearRefused', 0, T.mem.swearRefused, { rumour: false, deed: null })
          text = `${name} is moved, but not ready to swear.`; accepted = false
        }
        break
      case 'denounce': {
        const D = A.denounce, just = (p.morality || 0) <= D.justMorality
        if (!just) s.karma = Math.max(0, s.karma + D.karma)
        this._remember(p, just ? 'denounceJust' : 'denounced', D.rel, T.mem[just ? 'denounceJust' : 'denounced'])
        for (const q of Object.values(w.persons)) {
          if (q.alive === false || q.id === p.id || !q.ties || q.ties[p.id] == null) continue
          const was = q.ties[p.id]
          this._tieAdd(q, p, D.tieHit)
          if (was <= -40) q.rel = Math.max(-100, Math.min(100, (q.rel || 0) + D.foesWarm))   // their foes like you for it
        }
        if (!just && NPC_ENC.proud.includes(p.personality) && !(p.feud && w.persons[p.feud.pid]?.alive !== false)) p.feud = { pid: s.self.id, why: 'you denounced them before the world', y: yr }
        text = just ? `You name ${name}'s crimes before the world. Some nod; ${name} will not forgive it.` : `You denounce ${name} before the world.`
        type = just ? 'neutral' : 'negative'; break
      }
      case 'court': {
        this._courtPerson(p)
        this._remember(p, 'courted', 3, T.mem.courted, { rumour: false, deed: null })
        text = `You begin to court ${name}. (Kin → Family)`; type = 'special'; break
      }
      default: return { ok: false, reason: 'bad_act' }
    }
    this.addEvent({ text, type, pid })
    this._recalc(); this._notify()
    return { ok: true, text, accepted }
  }

  // ── Phase 28 task 4.10b (living-world.md §8 + "4.10b as built", PLAN 28K): Your Rival ────────────────────────────
  // One genius of your class per life, never your kin (_pickRival, when the class is seeded). The record lives on the
  // world (w.rivals, one per life) so it outlives you. Heat (−100 bitter … +100 kindred) moves with every memory they
  // keep of you (_remember × NPC_RIVAL.relToHeat) plus a few rival-only reads (a refused challenge, being overtaken, a
  // war they led, your kin). They seek you out on their own schedule (_tickRival, yearly) through the road queue: their
  // cards skip the hour cap and the face cooldown, and wait first in line when the queue is full. A strong rivalry
  // becomes a house (w.rivalHouses): the next life's class holds an heir of that line, and they are its rival.
  // State: w.rivals [{ life, pid, name, heat, meets, wins, losses, beats, seq, seen, nextY, lead, end, house, inherited }]
  // · w.rivalHouses { [surname]: { surname, pid, fromLife, fromName, heat, end, y, used } } · w.rivalHint · person
  // rivalOf (your id that life) / rivalHouse.

  _rivalRec(life = null) {
    const w = this._s?.world
    if (!w?.rivals?.length) return null
    const n = life ?? this._lifeNo()
    return w.rivals.find(r => r.life === n) || null
  }
  // The living rival of this life, or null.
  _rivalOf() {
    const r = this._rivalRec(), p = r && !r.end ? this._s.world.persons[r.pid] : null
    return p && p.alive !== false ? p : null
  }
  _isRival(p) { const r = p ? this._rivalRec() : null; return !!(r && !r.end && r.pid === p.id) }
  _rivalWord(heat) { const W = NPC_RIVAL.words; return W.find(x => heat >= x.min) || W[W.length - 1] }
  _rivalHeat(r, d) {
    if (!r || !d) return r?.heat || 0
    r.heat = Math.max(NPC_RIVAL.heatMin, Math.min(NPC_RIVAL.heatMax, Math.round((r.heat || 0) + d)))
    return r.heat
  }
  _rivalSigned(n) { n = Math.round(n || 0); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) }
  _rivalStage(i) { const st = CULTIVATION_STAGES[i]; return st ? `${st.realm}${st.layer && st.realm !== 'Mortal' ? ' ' + st.layer : ''}` : 'Mortal' }
  // A beat of the rivalry's history (structured, so a later story mode can quote it). meet: it was a meeting.
  _rivalBeat(r, k, vals = {}, { meet = false, tone = '' } = {}) {
    const text = this._roadFill(NPC_RIVAL_TEXT.beat[k], { name: r.name, ...vals })
    r.seq = (r.seq || 0) + 1
    r.beats.push({ i: r.seq, y: Math.floor(this._s.world.year), k, text, place: vals.place || null, heat: r.heat, tone })
    if (r.beats.length > NPC_RIVAL.beatsMax) r.beats.splice(0, r.beats.length - NPC_RIVAL.beatsMax)
    if (meet) r.meets++
    return text
  }

  // The class is seeded (_seedCohort): a house that carries a rivalry puts its heir among them. Returns { surname, parentId }.
  _rivalHouseHeir(life) {
    const s = this._s, w = s.world
    const hs = Object.values(w.rivalHouses || {}).filter(h => !h.used && h.surname && h.surname !== s.self?.family)   // (born into their line: no rival of your own blood)
    if (!hs.length) return null
    const h = hs.sort((a, b) => (b.y || 0) - (a.y || 0))[0]
    h.used = life
    const founder = w.persons[h.pid]
    const parent = founder && founder.alive !== false ? founder
      : Object.values(w.persons).filter(p => p.alive !== false && (p.parents || []).includes(h.pid)).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null
    return { surname: h.surname, parentId: parent?.id || null }
  }

  // Names this life's rival: the house's heir if there is one, else the strongest of Heaven's Chosen, never kin.
  _pickRival() {
    const s = this._s, w = s.world, life = this._lifeNo(), me = s.self?.id, R = NPC_RIVAL
    if (!w?.persons || !w.cohorts?.[life] || s.interlude || !me) return null
    w.rivals ||= []; w.rivalHouses ||= {}
    const had = this._rivalRec(life)
    if (had) return had
    const clanIds = this._clanIdSet(), fam = s.self.family || ''
    const cands = w.cohorts[life].ids.map(id => w.persons[id])
      .filter(p => p && p.alive !== false && !clanIds.has(p.id) && !(fam && p.family === fam) && !this._isYourKin(p))
    if (!cands.length) return null
    const score = p => (p.rivalHouse ? 1e4 : 0) + (p.chosen ? 1e3 : 0) + (p.stageIndex || 0) * 10 + (p.talent || 1)
    cands.sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)))
    const p = cands[0], yr = Math.floor(w.year), awake = w.cohorts[life].year
    const house = p.rivalHouse ? w.rivalHouses[p.rivalHouse] : null
    const rng = wsRng(`${p.id}|rival|first`)
    const r = { life, pid: p.id, name: Persons.fullName(p), heat: 0, meets: 0, wins: 0, losses: 0, beats: [], seq: 0, seen: 0,
      nextY: Math.max(yr + 1, awake + R.firstMeet[0] + Math.floor(rng() * (R.firstMeet[1] - R.firstMeet[0] + 1))),
      lead: Math.sign((s.stageIndex || 0) - (p.stageIndex || 0)), end: null, house: house?.surname || null, inherited: null }
    p.rivalOf = me
    if (house) {
      r.heat = Math.round(house.heat * R.carryHeat)
      r.inherited = { fromLife: house.fromLife, fromName: house.fromName, heat: house.heat, end: house.end || null }
      if (house.heat < 0) p.rel = Math.min(p.rel || 0, R.houseRel)
      this._rivalBeat(r, 'inherited', { house: house.surname, from: house.fromName })
    } else this._rivalBeat(r, 'chosen')
    w.rivals.push(r)
    this.addEvent({ text: this._roadFill(NPC_RIVAL_TEXT.named, { name: r.name }), type: 'special', pid: p.id })
    return r
  }

  // The game-year tick: who leads, and whether the rival comes looking for you this year (their choice, on their clock).
  _tickRival(yr) {
    const s = this._s, w = s.world, R = NPC_RIVAL
    if (!w?.persons || s.interlude || !s.self) return
    const r = this._rivalRec()
    if (!r || r.end) return
    const p = w.persons[r.pid]
    if (!p || p.alive === false) return
    this._rivalLead(r, p)
    if (yr < r.nextY || p.roadCard) return
    const rng = wsRng(`${p.id}|rival|${yr}`)
    r.nextY = yr + R.meetEvery[0] + Math.floor(rng() * (R.meetEvery[1] - R.meetEvery[0] + 1))
    const kin = r.heat <= R.bloodHeat ? this._rivalKinTarget() : null
    const kind = kin && rng() < R.kinStrike ? 'rivalKin'
      : rng() < ((p.injuredUntil || 0) > yr ? R.troubleHurt : R.trouble) ? 'rivalTrouble'
      : r.heat >= R.talkHeat && rng() < R.talkShare ? 'rivalTalk' : 'rivalDuel'
    this._rivalMeet(p, kind, kind === 'rivalKin' ? kin : null)
  }

  // Who leads now. A pass either way is a beat (and being overtaken stings a proud heart).
  _rivalLead(r, p) {
    const s = this._s, R = NPC_RIVAL, T = NPC_RIVAL_TEXT, you = s.stageIndex || 0, them = p.stageIndex || 0
    const lead = Math.sign(you - them)
    if (!lead || lead === r.lead) return
    const was = r.lead
    r.lead = lead
    if (!was) return
    const vals = { name: r.name, realm: this._rivalStage(you), theirs: this._rivalStage(them) }
    if (lead > 0) {
      this._rivalHeat(r, NPC_ENC.proud.includes(p.personality) ? R.heat.overtakenProud : R.heat.overtakenHumble)
      this._rivalBeat(r, 'overtook', vals, { tone: 'jade' })
      this.addEvent({ text: this._roadFill(T.overtook, vals), type: 'special', pid: p.id })
    } else {
      this._rivalBeat(r, 'passed', vals, { tone: 'red' })
      this.addEvent({ text: this._roadFill(T.passed, vals), type: 'neutral', pid: p.id })
    }
  }

  // Their breakthrough, as a headline (from _tellLives). Returns the line for the log.
  _rivalRose(p) {
    const r = this._rivalRec(), realm = this._lifeRealm(p.stageIndex)
    if (r) this._rivalBeat(r, 'rose', { realm }, { tone: 'gold' })
    this._emit('rival_rise', { rival: p.given || Persons.fullName(p) })
    return { text: this._roadFill(NPC_RIVAL_TEXT.rose, { name: Persons.fullName(p), realm }), type: 'special', toast: true, who: p }
  }

  _rivalPlace(p) {
    const s = this._s, loc = p.act?.loc ? LOCATIONS.find(l => l.id === p.act.loc) || null : null
    if (loc) return { loc, place: loc.name }
    if (s.ownSect?.founded) return { loc: null, place: `the gate of ${s.ownSect.name}` }
    const mine = this._wsMine()
    return { loc: null, place: mine ? `the foot of the ${mine.name}'s mountain` : 'the mountain road' }
  }

  // They come: a card at once, or first in line when your hands are full (never answered for you, never expires).
  _rivalMeet(p, kind, kin = null) {
    const Rd = this._road(), { loc, place } = this._rivalPlace(p)
    if (this._roadQueueLen() >= NPC_ENC.queueMax) {
      Rd.waiting.unshift({ pid: p.id, kind, source: 'rival', locId: loc?.id || null, place, avenger: false, rival: true, kin })
      p.roadCard = 'wait'; this._roadStats().waited++
      this.addEvent({ text: this._roadFill(NPC_RIVAL_TEXT.waits, { name: Persons.fullName(p) }), type: 'special', pid: p.id })
      this._notify()
      return { waited: true, pid: p.id }
    }
    return this._roadCard(p, kind, 'rival', loc, place, false, { rival: true, kin })
  }

  // (_roadCard hands a rival's card here.)
  _rivalCardOpen(card, p, kin) {
    const s = this._s, Rd = this._road(), r = this._rivalRec(), T = NPC_RIVAL_TEXT, yr = Math.floor(s.world.year)
    card.rival = true
    if (kin) card.kin = kin
    if (card.kind === 'rivalDuel') card.blood = (r?.heat ?? 0) <= NPC_RIVAL.bloodHeat
    const key = card.kind === 'rivalDuel' && card.blood ? 'rivalDuelBlood' : card.kind
    card.text = this._roadFill(this._roadPick(T.open[key]), { name: card.name, place: card.place, kin: kin?.name || 'your kin' })
    card.why = this._rivalWhy(card, r)
    p.roadCard = card.id; p.roadY = yr; p.fam = (p.fam || 0) + 1; p.seenY = yr
    Rd.cards.push(card)
    const st = this._roadStats()
    st.cards++; st.byKind[card.kind] = (st.byKind[card.kind] || 0) + 1; st.bySource.rival = (st.bySource.rival || 0) + 1
    const bad = card.kind === 'rivalKin' || card.blood
    this.addEvent({ text: `${card.text} (Roam → Explore)`, type: bad ? 'negative' : 'special', pid: p.id })
    this._emit('world_news', { text: `${card.name}, your rival, has come looking for you.`, type: bad ? 'negative' : 'special' })
    this._notify()
    return card
  }

  _rivalWhy(card, r) {
    const T = NPC_RIVAL_TEXT.why, heat = r?.heat ?? 0
    const k = card.kind === 'rivalKin' ? 'kin' : card.kind === 'rivalTrouble' ? 'trouble' : card.kind === 'rivalTalk' ? 'talk'
      : card.blood ? 'blood' : r && r.meets === 0 && !r.inherited ? 'first' : 'duel'
    let t = this._roadFill(T[k], { heat: this._rivalSigned(heat), word: this._rivalWord(heat).w.toLowerCase() })
    if (r?.inherited) t += this._roadFill(T.house, { from: r.inherited.fromName })
    return t
  }

  // In a blood feud: the kin they would go after — your heir, else your eldest grown child, else your spouse.
  _rivalKinTarget() {
    const s = this._s, f = s.family || {}, yr = Math.floor(s.world.year)
    const grown = (f.children || []).filter(c => c.alive && !c.estranged && yr - (c.bornYear ?? yr) >= ADULT_AGE)
    const c = grown.find(x => x.id === f.heirId) || [...grown].sort((a, b) => (a.bornYear ?? 0) - (b.bornYear ?? 0))[0]
    if (c) return { id: c.id, name: c.given || Persons.fullName(c), kind: 'child', word: c.id === f.heirId ? 'your heir' : 'your child' }
    if (f.spouse) return { id: f.spouse.id, name: f.spouse.given || Persons.fullName(f.spouse), kind: 'spouse', word: 'your spouse' }
    return null
  }
  _rivalKinNow(kin) {
    const f = this._s.family || {}
    if (!kin) return null
    if (kin.kind === 'spouse') return f.spouse?.id === kin.id ? f.spouse : null
    return (f.children || []).find(c => c.id === kin.id && c.alive && !c.estranged) || null
  }
  // The odds your kin lives if you let them face your rival (theirs to fight; your choice not to be there).
  _rivalKinOdds(p, kin) {
    const R = NPC_RIVAL, k = this._rivalKinNow(kin)
    if (!k) return 1
    return Math.max(R.kinMin, Math.min(R.kinMax, R.kinBase + ((k.stageIndex || 0) - (p.stageIndex || 0)) * R.kinPerStage))
  }
  _rivalHelpCost(p) { const H = NPC_RIVAL.helpHealth; return Math.min(H[1], H[0] + Math.max(0, (p.stageIndex || 0) - (this._s.stageIndex || 0)) * 3) }
  _rivalPayCost(p) { return Math.round(NPC_RIVAL.payStones * ((p.stageIndex || 0) + 1)) }
  _rivalSwearChance(heat) { const S = NPC_RIVAL.swear; return Math.min(0.95, S.base + Math.max(0, heat - NPC_RIVAL.bondHeat) * S.perHeat) }

  // A rival card's answers (roadCardInfo). Every answer shows what it does to the heat; locks say what they need.
  _rivalAnswers(card, p, add, odds, fightLock) {
    const s = this._s, R = NPC_RIVAL, r = this._rivalRec(), heat = r?.heat ?? 0, me = s.self?.id, sg = n => this._rivalSigned(n)
    const proud = NPC_ENC.proud.includes(p.personality), needBond = `Needs heat ${sg(R.bondHeat)} (now ${sg(heat)})`
    if (card.kind === 'rivalDuel') {
      add('spar', 'Accept: until one yields', `${odds(false)}% to win · win, and they respect you more`, { odds: odds(false), lock: fightLock })
      add('blood', 'Accept: to the death', `${odds(true)}% to win · lose, and this life ends`, { odds: odds(true), tone: 'red',
        lock: card.blood ? fightLock : `Only in a blood feud (heat ${sg(R.bloodHeat)} or colder; now ${sg(heat)})` })
      const k = proud ? 'declinedProud' : 'declined'
      add('decline', 'Decline', `${proud ? 'A proud heart takes it hard' : 'They think less of you'} · heat ${sg(R.heat[k] + R.rel['rv_' + k] * R.relToHeat)}`)
    } else if (card.kind === 'rivalTalk') {
      add('drink', 'Drink with them', `An evening of old stories · heat ${sg(R.rel.rv_drink * R.relToHeat)}`, { tone: 'jade' })
      add('spar', 'A friendly spar', `${odds(false)}% to win · until one yields`, { odds: odds(false), lock: fightLock })
      const sw = Math.round(this._rivalSwearChance(heat) * 100)
      add('swear', 'Swear brotherhood', `${sw}% they accept · they fight in your sect wars and avenge you`, { chance: sw, tone: 'gold',
        lock: p.sworn === me ? 'Already sworn to you' : heat < R.bondHeat ? needBond : null })
      const court = this.personActions(p.id)?.acts?.find(a => a.id === 'court')
      add('court', 'Court them', 'Begins a courtship on Kin → Family', { tone: 'jade', lock: heat < R.bondHeat ? needBond : court?.lock || null })
    } else if (card.kind === 'rivalTrouble') {
      const cost = this._rivalHelpCost(p)
      add('help', 'Help them', `Costs about ${cost} Health · karma +${R.helpKarma} · heat ${sg(R.rel.rv_helped * R.relToHeat)}`,
        { tone: 'jade', lock: (s.health ?? 100) <= cost + 5 ? 'Too wounded to fight their foes off' : null })
      add('sabotage', 'Sabotage them', `They lose their progress and heal for years · karma ${R.sabotageKarma} · ${Math.round(R.sabotageFound * 100)}% they learn it was you (heat ${sg(R.rel.rv_sabotaged * R.relToHeat)})`, { tone: 'red' })
      add('walk', 'Walk on', `Heat ${sg(R.rel.rv_walked * R.relToHeat)} · they will remember`)
    } else if (card.kind === 'rivalKin') {
      const kin = card.kin, k = this._rivalKinNow(kin)
      if (!k) { add('leave', 'Let it go', `${kin?.name || 'They'} ${kin ? 'is' : 'are'} beyond their reach now`); return }
      const live = Math.round(this._rivalKinOdds(p, kin) * 100), cost = this._rivalPayCost(p)
      add('intercept', `Stand between them and ${kin.name}`, `${odds(true)}% to win · to the death: lose, and this life ends`, { odds: odds(true), tone: 'red', lock: fightLock })
      add('pay', 'Pay the blood price', `${cost} Spirit Stones · they turn back, this time`, { cost, lock: s.spiritStones < cost ? `Needs ${cost} Spirit Stones` : null })
      add('leave', `Let ${kin.name} face them`, `${live}% ${kin.name} lives · otherwise ${kin.word} dies`, { tone: 'red', chance: live })
    }
  }

  // Your answer to a rival card (from answerRoadCard). Returns { ok, text, type } or a fight (the battle page opens).
  _rivalAnswer(card, p, answer, fight) {
    const s = this._s, R = NPC_RIVAL, T = NPC_RIVAL_TEXT, r = this._rivalRec(), name = card.name, place = card.place, yr = Math.floor(s.world.year)
    const kinName = card.kin?.name || 'your kin'
    const mem = key => this._remember(p, key, R.rel[key] || 0, this._roadFill(T.mem[key], { place, kin: kinName }), { deed: R.deeds[key] || null, rumour: !!R.deeds[key] })
    const beat = (k, vals = {}, o = {}) => r ? this._rivalBeat(r, k, { place, ...vals }, o) : ''
    switch (`${card.kind}:${answer}`) {
      case 'rivalDuel:spar': case 'rivalTalk:spar': return fight(false, `You accept ${name}'s challenge: until one yields.`)
      case 'rivalDuel:blood': return fight(true, `You accept ${name}'s challenge: to the death.`)
      case 'rivalKin:intercept': return fight(true, `You find ${name} on the road to ${kinName}, and step into their path.`)
      case 'rivalDuel:decline': {
        const proud = NPC_ENC.proud.includes(p.personality)
        mem(proud ? 'rv_declinedProud' : 'rv_declined'); this._rivalHeat(r, R.heat[proud ? 'declinedProud' : 'declined'])
        beat('declined', {}, { meet: true, tone: 'red' })
        return { ok: true, text: `You refuse ${name}. ${proud ? 'Their laughter follows you down the road.' : 'They watch you go.'}` }
      }
      case 'rivalTalk:drink':
        mem('rv_drink'); beat('drink', {}, { meet: true, tone: 'jade' })
        return { ok: true, type: 'positive', text: `You and ${name} drink until the jar is dry, and argue about the Dao until dawn.` }
      case 'rivalTalk:swear': {
        if (Math.random() < this._rivalSwearChance(r?.heat ?? 0)) {
          p.sworn = s.self.id
          mem('rv_sworn'); beat('sworn', {}, { meet: true, tone: 'gold' })
          this._chron({ k: 'deed', t: `${s.name} and ${name}, rivals since the day they awakened, swear brotherhood.`, p: [p.id], n: true })
          this._emit('world_news', { text: `You and ${name} swear brotherhood. Rivals still.`, type: 'special' })
          return { ok: true, type: 'special', text: `You and ${name} swear brotherhood under the same sky. Rivals still.` }
        }
        beat('swornRefused', {}, { meet: true })
        return { ok: true, text: `${name} turns the cup in their hands: "Not yet. Beat me first."` }
      }
      case 'rivalTalk:court':
        this._courtPerson(p)
        mem('rv_courted'); beat('courted', {}, { meet: true, tone: 'jade' })
        return { ok: true, type: 'special', text: `You begin to court ${name}, of all people. (Kin → Family)` }
      case 'rivalTrouble:help': {
        const cost = this._rivalHelpCost(p)
        s.health = Math.max(1, (s.health ?? 100) - cost); s.karma = Math.min(100, s.karma + R.helpKarma)
        p.injuredUntil = Math.min(p.injuredUntil || yr, yr + 1)
        mem('rv_helped'); beat('helped', {}, { meet: true, tone: 'jade' })
        return { ok: true, type: 'positive', text: `You cut ${name} free at ${place}. Health −${cost}. They do not thank you; they do not need to.` }
      }
      case 'rivalTrouble:sabotage': {
        s.karma = Math.max(0, s.karma + R.sabotageKarma)
        p.npcXp = 0; p.injuredUntil = Math.max(p.injuredUntil || 0, yr + R.sabotageInjury)
        const found = Math.random() < R.sabotageFound
        if (found) mem('rv_sabotaged')   // (unseen, nobody knows: karma only)
        beat('sabotaged', { found: found ? ', and they know it was you' : '' }, { meet: true, tone: 'red' })
        return { ok: true, type: 'negative', text: `You break the last ward around ${name} at ${place}, and leave. Their cultivation will not recover for years.${found ? ' Somehow, they know it was you.' : ''}` }
      }
      case 'rivalTrouble:walk':
        mem('rv_walked'); beat('walked', {}, { meet: true })
        return { ok: true, text: `You leave ${name} to it at ${place}. They get out alone, and they saw you go.` }
      case 'rivalKin:pay': {
        const cost = this._rivalPayCost(p)
        s.spiritStones -= cost; mem('rv_paid'); this._rivalHeat(r, R.heat.paid)
        beat('kinPaid', { kin: kinName }, { meet: true })
        return { ok: true, type: 'negative', text: `You send ${name} ${cost} Spirit Stones for ${kinName}'s life. They take it, and turn back. This time.` }
      }
      case 'rivalKin:leave': {
        const res = this._rivalKinStrike(r, p, card.kin, place)
        return { ok: true, type: res.died ? 'negative' : 'neutral', text: res.text }
      }
    }
    return null
  }

  // Your rival reaches your kin (you let them face it, or you fell back from the fight). Their fight; the odds were shown.
  _rivalKinStrike(r, p, kin, place) {
    const s = this._s, R = NPC_RIVAL, T = NPC_RIVAL_TEXT, f = s.family || {}, name = Persons.fullName(p), yr = Math.floor(s.world.year)
    const k = this._rivalKinNow(kin)
    if (!k) return { died: false, text: `${name} finds no one left to strike.` }
    if (Math.random() < this._rivalKinOdds(p, kin)) {
      this._remember(p, 'rv_kinWounded', R.rel.rv_kinWounded, this._roadFill(T.mem.rv_kinWounded, { kin: kin.name }), { rumour: false, deed: null })
      if (r) this._rivalBeat(r, 'kinSafe', { kin: kin.name, place }, { tone: 'jade' })
      return { died: false, text: `${kin.name} meets ${name} blade to blade, and drives them off, bleeding but alive.` }
    }
    const text = `${name} has killed ${kin.name}, ${kin.word}. The blood feud has its first grave.`
    if (kin.kind === 'spouse') this._spouseEnds('rival', `${name}, your rival, has killed ${kin.name}.`)
    else { k.alive = false; k.diedYear = yr; k.cause = 'rival'; if (f.heirId === k.id) f.heirId = null }
    this._killPerson(kin.id, yr, 'rival')
    this._remember(p, 'rv_kinKilled', 0, this._roadFill(T.mem.rv_kinKilled, { kin: kin.name }), { rumour: false, deed: null })
    this._rivalHeat(r, R.heat.kinKilled)
    if (r) this._rivalBeat(r, 'kinKilled', { kin: kin.name, place }, { tone: 'red' })
    this._emit('world_news', { text, type: 'negative' })
    return { died: true, text }
  }

  // A fight with your rival ended (_roadFightOutcome). Writes the record; returns extra text for the result line.
  _rivalFought(r, p, card, what, place) {
    const R = NPC_RIVAL, yr = Math.floor(this._s.world.year), kinCard = card.kind === 'rivalKin', kin = card.kin?.name
    if (what === 'slain') {
      r.wins++
      if (kinCard) this._rivalBeat(r, 'kinSaved', { kin, place }, { tone: 'jade' })
      this._rivalBeat(r, 'slain', { place }, { meet: true, tone: 'red' })
      r.end = { y: yr, k: 'slain', text: `You killed them at ${place}.` }
      return ''
    }
    if (what === 'won' || what === 'spared' || what === 'humbled') {
      r.wins++
      if (kinCard) { this._rivalHeat(r, R.heat.kinSaved); this._rivalBeat(r, 'kinSaved', { kin, place }, { tone: 'jade' }) }
      this._rivalBeat(r, what, { place }, { meet: true, tone: what === 'humbled' ? 'red' : 'jade' })
      return kinCard ? ` ${kin} is safe.` : ''
    }
    if (what === 'lost') {
      r.losses++
      this._rivalBeat(r, 'lost', { place }, { meet: true, tone: 'red' })
      return kinCard ? ' ' + this._rivalKinStrike(r, p, card.kin, place).text : ''
    }
    if (what === 'killedYou') {
      r.losses++
      this._rivalBeat(r, kinCard ? 'kinLost' : 'killedYou', { kin, place }, { meet: true, tone: 'red' })
      r.end = { y: yr, k: 'killedYou', text: `They killed you at ${place}.` }
    }
    return ''
  }

  // Your rival died (any cause but your blade) or Ascended (_killPerson).
  _rivalEnds(r, p, cause, yr) {
    const T = NPC_RIVAL_TEXT, asc = cause === 'ascended', c = (PERSON_CAUSE_TEXT[cause] || 'They passed on').toLowerCase()
    this._rivalBeat(r, asc ? 'ascended' : 'fell', { cause: c }, { tone: asc ? 'gold' : 'red' })
    r.end = { y: yr, k: asc ? 'ascended' : 'fell', cause, text: asc ? 'They Ascended.' : (PERSON_CAUSE_TEXT[cause] || 'They passed on') + '.' }
    const text = this._roadFill(asc ? T.ascended : T.fell, { name: r.name, cause: c })
    this.addEvent({ text, type: asc ? 'special' : 'negative', pid: r.pid })
    this._emit('world_news', { text, type: asc ? 'special' : 'negative' })
  }

  // Your life ends (_recordLifeInWorld): the record closes, and a strong rivalry (or a death between you) becomes a house
  // whose heir will be the next life's rival. A bitter house is also an enemy the rare rival-family rebirth can use (2.6d).
  _rivalLifeEnds(cause, yr) {
    const w = this._s.world, r = this._rivalRec(), R = NPC_RIVAL
    if (!r) return
    const p = w.persons[r.pid]
    if (!r.end) { this._rivalBeat(r, 'lifeEnded'); r.end = { y: yr, k: 'lifeEnded', text: 'Your life ended first.' } }
    const blood = r.end.k === 'slain' || r.end.k === 'killedYou' || r.beats.some(b => b.k === 'kinKilled')
    if (!p?.family || (Math.abs(r.heat) < R.houseMin && !blood)) return
    let heat = r.heat
    if (r.end.k === 'slain') heat = Math.min(heat, -60)   // you killed their founder: the line hates you
    else if (blood) heat = Math.min(heat, -40)
    w.rivalHouses ||= {}
    w.rivalHouses[p.family] = { surname: p.family, pid: p.id, fromLife: r.life, fromName: r.name, heat, end: r.end.k, y: yr, used: null }
    if (heat < 0) this._noteEnemy({ kind: 'rival', personId: p.id, name: r.name, surname: p.family, why: 'your rival' })
  }

  // The rare rival-family rebirth (2.6d, _rivalClan): the rival of a past life, or a child of theirs, heads the house.
  _rivalLineHead(pid) {
    const w = this._s.world, clanIds = this._clanIdSet()
    const ok = p => p && p.alive !== false && !clanIds.has(p.id) && !p.roadCard
    if (ok(w.persons[pid])) return w.persons[pid]
    return Object.values(w.persons).filter(q => ok(q) && (q.parents || []).includes(pid)).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null
  }

  // Sect wars: your rival leads the foe when their sect is the one you fight (_warMightRatio reads it).
  _rivalWar(foe) {
    const p = this._rivalOf(), W = NPC_RIVAL.war
    if (!p || !foe || p.sectId !== foe.id) return null
    const gap = Math.max(0, (p.stageIndex || 0) - (this._s.stageIndex || 0))
    return { pid: p.id, name: Persons.fullName(p), mult: 1 + Math.min(W.max, W.base + gap * W.perStage) }
  }
  _rivalWarBeat(foe, win) {
    const rv = this._rivalWar(foe), r = this._rivalRec()
    if (!rv || !r) return
    this._rivalHeat(r, NPC_RIVAL.heat.warLed)
    this._rivalBeat(r, 'war', { sect: foe.name, result: win ? ', and is thrown back' : ', and carries the day' }, { tone: win ? 'jade' : 'red' })
    this.addEvent({ text: this._roadFill(NPC_RIVAL_TEXT.war, { name: rv.name, sect: foe.name }) + (win ? ' They are thrown back.' : ' They carry the day.'), type: win ? 'positive' : 'negative', pid: rv.pid })
  }

  // A courtship with a registry person (the person card's Court, and a rival's card at heat ≥ bondHeat).
  _courtPerson(p) {
    const s = this._s, A = NPC_ACTS, f = s.family, c = this._castCopy(p, 'suitor')
    const interest = Math.max(0, Math.min(100, Math.round(COURT_INTEREST_START + (p.rel || 0) * A.court.interestPerRel + this._rep().i * NPC_REP.courtInfamy
      + (p.personality === s.personality?.id ? COURT_SAME_PERSONALITY : 0))))
    f.court = { candidates: [], target: c, interest, meetings: 0, nextMeetAt: this._cdNow(), beat: null, lastBeatId: null }
    return f.court
  }

  // Public (UI: World → Rival, the person card, the bot): the rivalry of this life, earlier lives' rivals, and the
  // deeds you can do from the panel. nextSecs: about how long (open time) until they seek you out again.
  rivalInfo() {
    const s = this._s, w = s.world, R = NPC_RIVAL, life = this._lifeNo(), yr = Math.floor(w?.year || 0)
    const row = x => { const wd = this._rivalWord(x.heat); return { life: x.life, pid: x.pid, name: x.name, heat: x.heat, word: wd.w, tone: wd.tone,
      meets: x.meets, wins: x.wins, losses: x.losses, end: x.end?.k || null, endText: x.end?.text || null, alive: w.persons[x.pid]?.alive !== false } }
    const past = (w?.rivals || []).filter(x => x.life !== life).sort((a, b) => b.life - a.life).map(row)
    const houses = Object.values(w?.rivalHouses || {}).filter(h => !h.used).map(h => ({ surname: h.surname, fromName: h.fromName, heat: h.heat, fromLife: h.fromLife }))
    const r = this._rivalRec()
    if (!r) return { has: false, life, past, houses, hint: !w?.rivalHint }
    const p = w.persons[r.pid], alive = !!p && p.alive !== false, wd = this._rivalWord(r.heat)
    const Rd = this._road(), card = Rd.cards.find(c => c.pid === r.pid), waiting = Rd.waiting.some(x => x.pid === r.pid)
    const nextSecs = !r.end && alive && !card && !waiting ? Math.max(0, Math.round((r.nextY - (w.year || 0)) * 3600 / GAME_YEARS_PER_OPEN_HOUR)) : null
    const sect = p?.sectId === 'own' ? (s.ownSect?.name || null) : p?.sectId ? this._wsRec(p.sectId)?.name || null : null
    const youStage = s.stageIndex || 0, themStage = p ? (alive ? p.stageIndex || 0 : p.maxStage || p.stageIndex || 0) : 0
    const acts = alive && !r.end ? this.personActions(r.pid) : null
    return { has: true, life, pid: r.pid, name: r.name, alive, ascended: !!p?.ascended, chosen: !!p?.chosen, sworn: !!p && p.sworn === s.self?.id,
      heat: r.heat, word: wd.w, tone: wd.tone, blood: r.heat <= R.bloodHeat, bond: r.heat >= R.bondHeat, bloodHeat: R.bloodHeat, bondHeat: R.bondHeat,
      meets: r.meets, wins: r.wins, losses: r.losses, end: r.end, house: r.house, inherited: r.inherited,
      them: { stage: themStage, age: p ? Math.max(0, (alive ? yr : p.diedYear ?? yr) - (p.bornYear ?? yr)) : null, sect,
        temper: PERSONALITIES.find(x => x.id === p?.personality)?.name || null, root: p ? this._rootWords(p.root) : null,
        morality: (MORALITY_WORDS.find(m => (p?.morality || 0) >= m.min) || {}).word || null, rel: p?.rel || 0 },
      you: { stage: youStage, age: Math.floor(s.age || 0) },
      lead: alive ? Math.sign(youStage - themStage) : 0, gap: Math.abs(youStage - themStage),
      onRoad: card ? card.id : null, waiting, nextSecs,
      acts: acts && !acts.gone ? { cd: acts.cd, list: ['spar', 'duel', 'gift'].map(id => acts.acts.find(a => a.id === id)).filter(Boolean) } : null,
      beats: [...r.beats].reverse(), fresh: Math.max(0, (r.seq || 0) - (r.seen || 0)), past, houses, hint: !w.rivalHint,
      ranks: w.ranks?.y != null && alive ? { them: this.rankOf(r.pid), you: w.ranks.veil ? null : { ...w.ranks.you } } : null }   // 4.8
  }
  noteRivalSeen() { const r = this._rivalRec(); if (r && (r.seen || 0) !== (r.seq || 0)) { r.seen = r.seq || 0; this._notify() } }
  rivalNews() { const r = this._rivalRec(); return r ? Math.max(0, (r.seq || 0) - (r.seen || 0)) : 0 }
  noteRivalHint() { this._s.world.rivalHint = true; this._notify() }
  // QA + the sim report: every life's rivalry in short.
  rivalStats() {
    return (this._s.world?.rivals || []).map(r => ({ life: r.life, heat: r.heat, meets: r.meets, wins: r.wins, losses: r.losses, end: r.end?.k || null,
      house: !!r.inherited, beats: r.seq || 0 }))
  }

  // ── Phase 28 task 4.8 (living-world.md → "4.8 Heavenly Rankings", PLAN 28J): the in-world boards ─────────────────
  // Heaven (everyone living), Rising Dragon (≤ NPC_RANK.dragonYears on the path, power for their years) and Your Class
  // (your cohort, living + fallen + ascended), all by one rank power (rankPowerParts: realm, progress, root, body, arts,
  // gear, renown). Published each game year (_tickRanks): the boards, ▲▼, headlines, titles, the Rising Dragon honour
  // roll, class firsts. Unless you veil your name, a place brings sect fame, challengers from just below, genius hunters
  // (after you or your Rising Dragon child) and sect invitations, all as road cards you answer. The Class board duel:
  // challenge the classmate just above you (a real-time cooldown).
  // State: w.ranks { life, y, seq, seen, boards { heaven, dragon: [{ pid, sc }] }, prev { heaven, dragon, class: { pid: place } },
  // you { heaven, dragon, class }, best { heaven, dragon, class }, titles [{ t, life, y }], honour [{ pid, name, place, y, you }],
  // news [{ i, y, text, tone }], veil, declines, cd { challenge, hunter, invite }, renown, firsts { realm: pid }, alive, duelAt,
  // stats, hint } · person renown, rankBest { h, d }, rankHiddenUntil, hunter · world sect `ranked` (members in the Heaven top 20).

  _ranks() {
    const w = this._s.world
    w.ranks ||= { life: this._lifeNo(), y: null, seq: 0, seen: 0, boards: { heaven: [], dragon: [] }, prev: { heaven: {}, dragon: {}, class: {} },
      you: { heaven: null, dragon: null, class: null }, best: { heaven: null, dragon: null, class: null }, titles: [], honour: [], news: [],
      veil: false, declines: 0, cd: { challenge: 0, hunter: 0, invite: 0 }, renown: 0, firsts: null, alive: null, duelAt: 0,
      stats: { pubs: 0, challengers: 0, hunters: 0, invites: 0, duels: 0 }, hint: false }
    const R = w.ranks
    if (R.life !== this._lifeNo()) {   // a new life: a new name to make (titles + the honour roll stay with the world)
      R.life = this._lifeNo(); R.you = { heaven: null, dragon: null, class: null }; R.best = { heaven: null, dragon: null, class: null }
      R.prev.class = {}; R.prev.classNow = {}; R.declines = 0; R.renown = 0; R.firsts = null; R.alive = null; R.cd = { challenge: 0, hunter: 0, invite: 0 }
    }
    return R
  }

  // Rank power, term by term (the "why"). self: you (live state); else a registry person.
  rankPowerParts(p, self = false) {
    const s = this._s, K = NPC_RANK, Y = self ? 'Your' : 'Their'
    if (self) p = this._selfAsPerson()
    const stage = p?.stageIndex || 0, sn = typeof stageShortName === 'function' ? stageShortName(stage) : 'stage ' + stage
    const cap = s.derived?.qiCap || CULTIVATION_STAGES[s.stageIndex]?.qiCap || 1
    const prog = self ? Math.min(99, Math.floor((s.qi || 0) / cap * 100)) : stage >= NPC_STAGE_CAP ? 0 : Math.min(99, Math.floor((p.npcXp || 0) * 100))
    const parts = [{ label: `${Y} realm (${sn})`, value: stage * 100 }]
    if (prog > 0) parts.push({ label: 'Progress in the stage', value: prog })
    parts.push({ label: `${Y} spirit root`, value: Math.round((p.root?.mult || 1) * 10) })
    const bt = BODY_TIERS[Math.max(0, Math.min(BODY_TIERS.length - 1, self ? (s.body?.tier || 0) : (p.bodyTier || 0)))]
    if (bt?.power) parts.push({ label: `${Y} body (${bt.name})`, value: bt.power })
    let arts = 0, artsLabel = `${Y} arts`
    if (self) {
      const lo = s.arts?.loadout || {}, ids = [...(lo.moves || []).slice(0, ART_MOVE_SLOTS), ...(lo.passives || []).slice(0, this.passiveSlots())]
      for (const id of ids) if (ARTS[id]) arts += (K.artPoints[ARTS[id].rarity] || 0) * (1 + K.artMastery * Math.max(0, (s.arts?.known?.[id]?.mastery || 1) - 1))
      artsLabel = 'Your worn arts'
    } else {   // (by realm, as the world reckons them: rolling their real arts here would reorder the board mid-read)
      arts = K.artEstimate[Math.min(K.artEstimate.length - 1, this._personRealm(stage))] || 0; artsLabel = 'Their arts (as the world reckons them)'
    }
    if (arts) parts.push({ label: artsLabel, value: Math.round(arts) })
    if (self) for (const slot of ['weapon', 'artifact']) {
      const id = s.equipped?.[slot]
      if (id && ITEMS[id]) parts.push({ label: `${ITEMS[id].name} (${slot})`, value: K.gear[slot] })
    }
    const ren = Math.round(self ? (this._ranks().renown || 0) : (p.renown || 0))
    if (ren) parts.push({ label: 'Renown from ranked duels', value: ren })
    return { parts, total: Math.max(0, parts.reduce((a, x) => a + x.value, 0)) }
  }
  _rankYears(p, self = false) {
    const yr = Math.floor(this._s.world.year)
    return self ? Math.max(0, Math.floor((this._s.age || AWAKENING_AGE) - AWAKENING_AGE)) : Math.max(0, yr - ((p.bornYear ?? yr) + AWAKENING_AGE))
  }
  _rankDragonScore(power, years) { const k = NPC_RANK.dragonK; return Math.round(power * k / (years + k)) }

  // Everyone the boards can hold this year: [{ pid, power, years, self }]. Hidden children are off both boards.
  _rankField() {
    const s = this._s, w = s.world, yr = Math.floor(w.year), me = s.self?.id, out = []
    for (const p of Object.values(w.persons)) {
      if (p.alive === false || p.ascended || p.role === 'ancestor' || p.id === me) continue
      if ((p.stageIndex || 0) < 1 && yr - (p.bornYear ?? yr) < AWAKENING_AGE) continue   // not yet awakened
      if ((p.rankHiddenUntil || 0) > yr) continue
      out.push({ pid: p.id, power: this.rankPowerParts(p).total, years: this._rankYears(p), self: false })
    }
    return out
  }
  _rankSelf() { return { pid: this._s.self?.id, power: this.rankPowerParts(null, true).total, years: this._rankYears(null, true), self: true } }

  // Sorted board ([{ pid, sc }]) from the field; you are placed in it unless veiled (your place is returned either way).
  _rankBoard(field, me, kind) {
    const K = NPC_RANK, sc = e => kind === 'dragon' ? this._rankDragonScore(e.power, e.years) : e.power
    const pool = field.filter(e => kind !== 'dragon' || e.years <= K.dragonYears).map(e => ({ pid: e.pid, sc: sc(e) }))
    const meIn = me && (kind !== 'dragon' || me.years <= K.dragonYears)
    const mine = meIn ? { pid: me.pid, sc: sc(me) } : null
    const all = mine ? [...pool, mine] : pool
    all.sort((a, b) => b.sc - a.sc || String(a.pid).localeCompare(String(b.pid)))
    const place = mine ? all.indexOf(mine) + 1 : null
    const shown = this._ranks().veil && mine ? all.filter(e => e !== mine) : all
    return { list: shown.slice(0, K.keep), place, total: all.length, mineSc: mine?.sc ?? null }
  }

  // Your cohort by rank power (living; the fallen + ascended listed apart). Returns [{ pid, power, self }] sorted.
  _rankClass() {
    const s = this._s, w = s.world, c = w.cohorts?.[this._lifeNo()]
    if (!c || !s.self) return []
    const rows = c.ids.map(id => w.persons[id]).filter(p => p && p.alive !== false && !p.ascended).map(p => ({ pid: p.id, power: this.rankPowerParts(p).total, self: false }))
    rows.push({ pid: s.self.id, power: this.rankPowerParts(null, true).total, self: true })
    return rows.sort((a, b) => b.power - a.power || String(a.pid).localeCompare(String(b.pid)))
  }

  _rankNews(text, tone = '', { log = false, pid = null, type = null } = {}) {
    const R = this._ranks()
    R.seq++
    R.news.push({ i: R.seq, y: Math.floor(this._s.world.year), text, tone, log: !!log })
    if (R.news.length > NPC_RANK.newsMax) R.news.splice(0, R.news.length - NPC_RANK.newsMax)
    if (log) this.addEvent({ text: `${text} (World → Rankings)`, type: type || (tone === 'red' ? 'negative' : 'special'), pid })
  }

  // The game year turns: publish (every NPC_RANK.every years), then what a public name brings.
  _tickRanks(yr) {
    const s = this._s, w = s.world, K = NPC_RANK
    if (!w?.persons || s.interlude || !s.self) return
    const R = this._ranks()
    if (R.y != null && yr - R.y < K.every) return
    const first = R.y == null
    R.y = yr; R.stats.pubs++
    // Renown fades (yours and theirs).
    R.renown = Math.round((R.renown || 0) * (1 - K.renown.fade))
    for (const p of Object.values(w.persons)) if (p.renown) { p.renown = Math.round(p.renown * (1 - K.renown.fade)); if (Math.abs(p.renown) < 2) delete p.renown }
    const field = this._rankField(), me = this._rankSelf()
    const H = this._rankBoard(field, me, 'heaven'), D = this._rankBoard(field, me, 'dragon')
    const cls = this._rankClass(), cPlace = cls.findIndex(e => e.self) + 1 || null
    const before = { heaven: R.you.heaven, dragon: R.you.dragon, class: R.you.class }
    const prevFirst = R.boards.heaven[0]?.pid || null
    // ▲▼ is measured against the last publication.
    const mapOf = list => Object.fromEntries(list.map((e, i) => [e.pid, i + 1]))
    R.prev = { heaven: mapOf(R.boards.heaven), dragon: mapOf(R.boards.dragon), class: R.prev.classNow || {} }
    R.prev.classNow = Object.fromEntries(cls.map((e, i) => [e.pid, i + 1]))
    R.boards = { heaven: H.list, dragon: D.list }
    R.you = { heaven: H.place, dragon: D.place, class: cPlace }
    // Everyone's best place (the honour roll + the person card).
    H.list.forEach((e, i) => { const p = w.persons[e.pid]; if (p) { p.rankBest ||= {}; p.rankBest.h = Math.min(p.rankBest.h ?? 1e9, i + 1) } })
    D.list.forEach((e, i) => { const p = w.persons[e.pid]; if (p) { p.rankBest ||= {}; p.rankBest.d = Math.min(p.rankBest.d ?? 1e9, i + 1) } })
    // A world sect's Might counts its members in the Heaven top 20.
    const ranked = {}
    for (const e of H.list.slice(0, 20)) { const p = w.persons[e.pid]; if (p?.sectId && p.sectId !== 'own') ranked[p.sectId] = (ranked[p.sectId] || 0) + 1 }
    for (const r of this._wsAll()) { if (ranked[r.id]) r.ranked = ranked[r.id]; else delete r.ranked }
    if (first) {   // the first publication on an old save: set the baselines quietly
      R.best = { heaven: R.veil ? null : H.place, dragon: R.veil ? null : D.place, class: cPlace }
      this._rankClassMarks(true)
      this._rankNews('The world publishes its rankings. Your name stands among them.', 'gold')
      this._notify(); return
    }
    if (!R.veil) for (const b of ['heaven', 'dragon']) this._rankYouMoved(b, before[b], R.you[b], b === 'heaven' ? H.total : D.total)
    this._rankYouMoved('class', before.class, cPlace, cls.length, true)
    // A new first under Heaven.
    const nf = H.list[0]?.pid
    if (nf && prevFirst && nf !== prevFirst && nf !== s.self.id) {
      const p = w.persons[nf], name = Persons.fullName(p)
      this._chron({ k: 'deed', t: this._roadFill(NPC_RANK_TEXT.newFirst, { name }), p: [nf], n: true })
      this._rankNews(this._roadFill(NPC_RANK_TEXT.newFirst, { name }), 'gold', { log: (p.fam || 0) > 0, pid: nf })
    }
    // Your rival passes you on a board.
    const rv = this._rivalOf()
    if (rv && !R.veil) for (const b of ['heaven', 'dragon']) {
      const theirs = R.boards[b].findIndex(e => e.pid === rv.id) + 1, wasTheirs = R.prev[b][rv.id], yours = R.you[b], wasYours = before[b]
      if (theirs && yours && theirs < yours && wasTheirs && wasYours && wasTheirs > wasYours)
        this._rankNews(this._roadFill(NPC_RANK_TEXT.rivalPassed, { name: Persons.fullName(rv), on: NPC_RANK_TEXT.on[b], theirs, yours }), 'red', { log: true, pid: rv.id, type: 'neutral' })
    }
    this._rankHonourRoll(yr, D)
    this._rankClassMarks(false)
    if (!R.veil) this._rankVisitors(yr)
    this._recalc()
    this._notify()
  }

  // Your place moved on a board: news always, the log on a threshold, a title on the high ones.
  _rankYouMoved(b, was, now, total, quiet = false) {
    const R = this._ranks(), T = NPC_RANK_TEXT, on = T.on[b]
    if (!now) return
    const bestWas = R.best[b]
    if (bestWas == null || now < bestWas) R.best[b] = now
    if (was == null) { if (!quiet && now <= NPC_RANK.keep) this._rankNews(this._roadFill(T.firstListed, { place: now, on }), 'gold', { log: true }); return }
    if (now === was) return
    const tops = [1, 3, 10, 20]
    const crossed = tops.find(t => now <= t && was > t)
    if (crossed) {
      this._rankNews(this._roadFill(T.top[crossed], { on }), 'gold', { log: !quiet || crossed === 1 })
      if (crossed <= 10) this._emit('rank_rise', { board: b === 'heaven' ? 'the Heaven Ranking' : b === 'dragon' ? 'the Rising Dragon Ranking' : 'my class', place: '#' + now })
    } else if (!quiet) this._rankNews(this._roadFill(now < was ? (bestWas != null && now < bestWas ? T.best : T.rose) : T.fell, { place: now, on }), now < was ? 'jade' : '')
    for (const [n, t] of NPC_RANK.titles[b] || []) if (now <= n) { this._rankTitle(t); break }
  }
  _rankTitle(t) {
    const R = this._ranks(), life = this._lifeNo()
    if (R.titles.some(x => x.t === t && x.life === life)) return
    R.titles.push({ t, life, y: Math.floor(this._s.world.year) })
    this._rankNews(this._roadFill(NPC_RANK_TEXT.titleEarned, { title: t }), 'gold', { log: true })
  }

  // Those who aged off Rising Dragon this year: the honour roll (yours too).
  _rankHonourRoll(yr, D) {
    const s = this._s, w = s.world, R = this._ranks(), K = NPC_RANK, T = NPC_RANK_TEXT
    for (const pid of Object.keys(R.prev.dragon)) {
      const p = w.persons[pid]
      if (!p || p.alive === false || this._rankYears(p) <= K.dragonYears || this._rankYears(p) > K.dragonYears + K.every) continue
      const best = p.rankBest?.d
      if (best && best <= K.show && !R.honour.some(x => x.pid === pid)) {
        R.honour.push({ pid, name: Persons.fullName(p), place: best, y: yr, you: false })
        this._rankNews(this._roadFill(T.honour, { name: Persons.fullName(p), place: best }), '', { log: (p.fam || 0) > 0 || p.cohort === this._lifeNo(), pid, type: 'neutral' })
      }
    }
    const yrs = this._rankYears(null, true), best = R.best.dragon
    if (yrs > K.dragonYears && yrs <= K.dragonYears + K.every && best && best <= K.show && !R.honour.some(x => x.you && x.life === this._lifeNo())) {
      R.honour.push({ pid: s.self.id, name: s.name, place: best, y: yr, you: true, life: this._lifeNo() })
      this._rankNews(this._roadFill(T.honourYou, { place: best }), 'gold', { log: true })
    }
    if (R.honour.length > K.honourMax) R.honour.splice(0, R.honour.length - K.honourMax)
  }

  // Class milestones: the first of your class to reach each realm, and how few still live.
  _rankClassMarks(quiet) {
    const s = this._s, w = s.world, R = this._ranks(), T = NPC_RANK_TEXT, c = w.cohorts?.[this._lifeNo()]
    if (!c) return
    R.firsts ||= {}
    const order = [...new Set(CULTIVATION_STAGES.slice(0, NPC_STAGE_CAP + 1).map(x => x.realm))].filter(r => r !== 'Mortal' && r !== 'Qi Condensation')
    const living = c.ids.map(id => w.persons[id]).filter(p => p && p.alive !== false && !p.ascended)
    for (const realm of order) {
      if (R.firsts[realm]) continue
      const at = st => order.indexOf(this._lifeRealm(st)) >= order.indexOf(realm)
      if (at(s.stageIndex || 0)) { R.firsts[realm] = s.self.id; if (!quiet) this._rankNews(this._roadFill(T.classFirstYou, { realm }), 'gold', { log: true }); continue }
      const who = living.filter(p => at(p.stageIndex || 0)).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]
      if (who) { R.firsts[realm] = who.id; if (!quiet) this._rankNews(this._roadFill(T.classFirst, { name: Persons.fullName(who), realm }), '', { log: true, pid: who.id, type: 'neutral' }) }
    }
    const n = living.length + 1   // (you count)
    const mark = NPC_RANK.classAlive.find(t => n <= t)
    if (R.alive == null) R.alive = mark ?? null
    else if (mark != null && (R.alive == null || mark < R.alive)) { R.alive = mark; if (!quiet) this._rankNews(this._roadFill(T.classAlive, { n }), 'red', { log: true, type: 'neutral' }) }
  }

  // What a public name brings this year: a challenger from just below, a genius hunter, an invitation (each its own clock).
  _rankVisitors(yr) {
    const s = this._s, R = this._ranks(), K = NPC_RANK, rng = wsRng(`${s.self.id}|rank|${yr}`)
    const C = K.challenge, h = R.you.heaven, d = R.you.dragon
    if (yr >= R.cd.challenge && ((h && h <= C.heavenTop) || (d && d <= C.dragonTop))
      && rng() < C.chance * (1 + C.perDecline * Math.min(R.declines || 0, C.declineMax))) {
      const b = h && h <= C.heavenTop ? 'heaven' : 'dragon', mine = R.you[b]
      const p = this._rankChallenger(b, mine)
      if (p) { R.cd.challenge = yr + C.cooldown; R.stats.challengers++; this._rankMeet(p, 'rankChallenge', { board: b, theirs: R.boards[b].findIndex(e => e.pid === p.id) + 1, yours: mine }) }
    }
    const Hn = K.hunter
    if (yr >= R.cd.hunter && rng() < Hn.chance) {
      const kin = d && d <= Hn.dragonTop ? null : this._rankKinTarget()
      if ((d && d <= Hn.dragonTop) || kin) {
        const target = kin ? (s.world.persons[kin.pid]?.stageIndex || 0) : (s.stageIndex || 0)
        const p = this._rankHunter(target, rng)
        R.cd.hunter = yr + Hn.cooldown; R.stats.hunters++
        this._rankMeet(p, kin ? 'hunterKin' : 'hunter', { board: 'dragon', yours: d, theirs: kin?.place || null, kin: kin ? { id: kin.pid, name: kin.name, word: kin.word, kind: 'child' } : null })
      }
    }
    const I = K.invite
    if (yr >= R.cd.invite && !s.ownSect?.founded && ((h && h <= I.heavenTop) || (d && d <= I.dragonTop)) && rng() < I.chance) {
      const sect = this._rankInviter()
      const envoy = sect && this._rankEnvoy(sect)
      if (envoy) { R.cd.invite = yr + I.cooldown; R.stats.invites++; this._rankMeet(envoy, 'invite', { board: h && h <= I.heavenTop ? 'heaven' : 'dragon', yours: h && h <= I.heavenTop ? h : d, sect: sect.id }) }
    }
  }

  // Someone ranked just below you who would fight for your place (proud tempers first).
  _rankChallenger(b, mine) {
    const s = this._s, w = s.world, K = NPC_RANK.challenge, clan = this._clanIdSet(), rid = this._rivalOf()?.id
    const cands = this._ranks().boards[b].slice(mine, mine + K.below).map(e => w.persons[e.pid])   // (you sit at index mine − 1)
      .filter(p => p && this._heavyEligible(p, clan) && !p.roadCard && p.id !== rid && !this._isYourKin(p) && p.sectRole !== 'master'
        && Math.abs((p.stageIndex || 0) - (s.stageIndex || 0)) <= K.stageGap)
    if (!cands.length) return null
    const wt = p => (NPC_ENC.temper[p.personality]?.challenge ?? 1) * ((p.rel || 0) <= NPC_ENC.relCold ? 1.5 : 1)
    return cands.sort((a, b2) => wt(b2) - wt(a) || String(a.id).localeCompare(String(b2.id)))[0]
  }

  // Your grown or growing child on the Rising Dragon top N (not in hiding).
  _rankKinTarget() {
    const s = this._s, f = s.family || {}, R = this._ranks(), top = NPC_RANK.hunter.dragonTop
    for (let i = 0; i < Math.min(top, R.boards.dragon.length); i++) {
      const pid = R.boards.dragon[i].pid, c = (f.children || []).find(x => x.id === pid && x.alive && !x.estranged)
      if (c) return { pid, name: c.given || Persons.fullName(c), word: c.id === f.heirId ? 'your heir' : 'your child', place: i + 1 }
    }
    return null
  }

  // A genius hunter: a dark-hearted cultivator a realm-step or two above their prey, minted into the registry (and kept).
  _rankHunter(stage, rng) {
    const H = NPC_RANK.hunter, st = Math.min(NPC_STAGE_CAP, stage + H.stageAbove[0] + Math.floor(rng() * (H.stageAbove[1] - H.stageAbove[0] + 1)))
    const known = Object.values(this._s.world.persons).find(p => p.hunter && p.alive !== false && !p.roadCard && Math.abs((p.stageIndex || 0) - st) <= 2)
    if (known) return known
    const p = this._mintPerson({ stage: st, age: [60, 160], personality: ['psycho', 'demonking', 'miser', 'paranoid'][Math.floor(rng() * 4)], role: 'wanderer' }, rng)
    p.morality = -60 - Math.floor(rng() * 30); p.hunter = true
    return p
  }

  // A sect that wants a ranked name: unaffiliated → any open sect; a member → only a mightier one than yours.
  _rankInviter() {
    const s = this._s, mine = this._wsMine(), myM = mine ? worldSectMight(mine) : -1
    const ok = this._wsAll().filter(r => r.alive && r.defId && r !== mine && !this.sectInAshes?.(r.defId)
      && (SECTS.find(d => d.id === r.defId)?.minStage ?? 0) <= (s.stageIndex || 0) && worldSectMight(r) > myM && (r.stance ?? 0) > -40)
    return ok.sort((a, b) => worldSectMight(b) - worldSectMight(a) || String(a.id).localeCompare(String(b.id)))[0] || null
  }
  _rankEnvoy(r) {
    const ps = Object.values(this._s.world.persons).filter(p => p.alive !== false && p.sectId === r.id && !p.roadCard)
    return ps.find(p => p.sectRole === 'elder') || ps.find(p => p.sectRole === 'master') || null
  }

  // They come (a card, or first in line when the queue is full — never answered for you).
  _rankMeet(p, kind, x) {
    const Rd = this._road(), s = this._s
    const loc = p.act?.loc ? LOCATIONS.find(l => l.id === p.act.loc) || null : null
    const place = loc?.name || (s.ownSect?.founded ? `the gate of ${s.ownSect.name}` : 'the mountain road')
    if (this._roadQueueLen() >= NPC_ENC.queueMax) {
      Rd.waiting.unshift({ pid: p.id, kind, source: 'rank', locId: loc?.id || null, place, avenger: false, rank: x })
      p.roadCard = 'wait'; this._roadStats().waited++
      this.addEvent({ text: this._roadFill(NPC_ENC_TEXT.waits, { name: Persons.fullName(p) }), type: 'neutral', pid: p.id })
      return { waited: true, pid: p.id }
    }
    return this._roadCard(p, kind, 'rank', loc, place, false, { rank: x })
  }

  // (_roadCard hands a rankings card here.)
  _rankCardOpen(card, p, x) {
    const s = this._s, Rd = this._road(), T = NPC_RANK_TEXT, R = this._ranks(), yr = Math.floor(s.world.year)
    card.rank = x
    if (x.kin) card.kin = x.kin
    if (card.kind === 'hunter' || card.kind === 'hunterKin') card.lethal = true
    const sect = x.sect ? this._wsRec(x.sect) : null
    const vals = { name: card.name, place: card.place, on: T.on[x.board] || '', theirs: x.theirs ?? '?', yours: x.yours ?? '?', kin: x.kin?.name || 'your child', sect: sect?.name || 'sect' }
    card.text = this._roadFill(this._roadPick(T.open[card.kind]), vals)
    let why = this._roadFill(T.why[card.kind], { ...vals, weaker: this._wsMine() ? T.why.inviteWeaker : '' })
    if (card.kind === 'rankChallenge' && R.declines) why += this._roadFill(T.why.challengeCoward, { n: R.declines })
    card.why = why
    p.roadCard = card.id; p.roadY = yr; p.fam = (p.fam || 0) + 1; p.seenY = yr
    Rd.cards.push(card)
    const st = this._roadStats()
    st.cards++; st.byKind[card.kind] = (st.byKind[card.kind] || 0) + 1; st.bySource.rank = (st.bySource.rank || 0) + 1
    const bad = card.kind === 'hunter' || card.kind === 'hunterKin'
    this.addEvent({ text: `${card.text} (Roam → Explore)`, type: bad ? 'negative' : 'special', pid: p.id })
    if (bad) this._emit('world_news', { text: card.kind === 'hunterKin' ? `A genius hunter is after ${x.kin?.name || 'your child'}.` : 'A genius hunter has found you.', type: 'negative' })
    this._notify()
    return card
  }

  _rankKinNow(kin) { return kin ? (this._s.family?.children || []).find(c => c.id === kin.id && c.alive && !c.estranged) || null : null }
  _rankKinOdds(p, kin) {
    const H = NPC_RANK.hunter, k = this._rankKinNow(kin)
    if (!k) return 1
    return Math.max(H.kinMin, Math.min(H.kinMax, H.kinBase + ((k.stageIndex || 0) - (p.stageIndex || 0)) * H.kinPerStage))
  }
  _rankPayCost(p) { return Math.round(NPC_RANK.hunter.payStones * ((p.stageIndex || 0) + 1)) }

  // A rankings card's answers (roadCardInfo).
  _rankAnswers(card, p, add, odds, fightLock) {
    const s = this._s, K = NPC_RANK, x = card.rank || {}, proud = NPC_ENC.proud.includes(p.personality), sg = n => (n > 0 ? '+' : '') + n
    if (card.kind === 'rankChallenge') {
      add('spar', 'Accept: until one yields', `${odds(false)}% to win · win: renown ${sg(K.renown.win)}, lose: ${sg(K.renown.lose)}`, { odds: odds(false), lock: fightLock })
      add('blood', 'Accept: to the death', `${odds(true)}% to win · lose, and this life ends`, { odds: odds(true), tone: 'red', lock: fightLock })
      add('decline', 'Decline', `Renown ${sg(proud ? K.renown.declineProud : K.renown.decline)} · ${proud ? 'a proud heart will spread it' : 'they will say you can be pushed'}; more will come`)
    } else if (card.kind === 'hunter') {
      const flee = Math.round(this._roadFleeChance(p) * 100), cost = this._rankPayCost(p)
      add('fight', 'Fight', `${odds(true)}% to win · to the death · win: Honour +${K.hunter.honour}, renown +${K.renown.killHunter}`, { odds: odds(true), tone: 'red', lock: fightLock })
      add('flee', 'Flee', `${flee}% to slip away · fail, and the fight starts here`, { odds: flee, lock: s.family?.fight ? 'Another fight is underway' : null })
      add('pay', 'Pay them off', `${cost} Spirit Stones · they find other prey, this time`, { cost, lock: s.spiritStones < cost ? `Needs ${cost} Spirit Stones` : null })
      add('veil', 'Veil your name', `${Math.round(K.hunter.veilLoses * 100)}% they lose the trail · you leave the public boards (World → Rankings)`, { chance: Math.round(K.hunter.veilLoses * 100), tone: 'jade' })
    } else if (card.kind === 'hunterKin') {
      const kin = card.kin, k = this._rankKinNow(kin)
      if (!k) { add('leave', 'Let it go', `${kin?.name || 'They'} ${kin ? 'is' : 'are'} beyond their reach now`); return }
      const live = Math.round(this._rankKinOdds(p, kin) * 100), cost = this._rankPayCost(p)
      add('intercept', `Stand between them and ${kin.name}`, `${odds(true)}% to win · to the death: lose, and this life ends`, { odds: odds(true), tone: 'red', lock: fightLock })
      add('pay', 'Pay them off', `${cost} Spirit Stones · they find other prey`, { cost, lock: s.spiritStones < cost ? `Needs ${cost} Spirit Stones` : null })
      add('hide', `Hide ${kin.name}`, `${kin.name} leaves the boards for ${K.hunter.hideYears} years, safe and unseen (their bond with you dips)`, { tone: 'jade' })
      add('leave', `Let ${kin.name} face them`, `${live}% ${kin.name} lives · otherwise ${kin.word} dies`, { tone: 'red', chance: live })
    } else if (card.kind === 'invite') {
      const r = this._wsRec(x.sect), def = r && SECTS.find(d => d.id === r.defId), mine = this._sectDef?.()
      const rankName = SECT_RANKS[K.invite.startRank]?.name || 'Inner Disciple'
      const lock = !r ? 'The sect is gone' : s.ownSect?.founded ? 'You lead a sect of your own' : this.sectInAshes?.(r.defId) ? 'Their mountain is in ashes' : def && s.stageIndex < def.minStage ? 'Your realm is too low for them' : null
      add('accept', `Join the ${r?.name || 'sect'}`, mine ? `As ${rankName} · you leave the ${mine.name} (rank and contribution forfeit; a deserter on the eve of war)` : `As ${rankName}, not an Outer Disciple`, { tone: 'jade', lock })
      add('decline', 'Decline with thanks', 'They will ask again some day, perhaps')
      add('refuse', 'Refuse them outright', `The ${r?.name || 'sect'} remembers the insult`, { tone: 'red' })
    }
  }

  // Your answer to a rankings card (from answerRoadCard). Returns { ok, text, type } or a fight.
  _rankAnswer(card, p, answer, fight) {
    const s = this._s, K = NPC_RANK, T = NPC_RANK_TEXT, R = this._ranks(), name = card.name, place = card.place, yr = Math.floor(s.world.year)
    const kinName = card.kin?.name || 'your child'
    const mem = key => this._remember(p, key, T.rel[key] || 0, this._roadFill(T.mem[key], { place, kin: kinName }), { rumour: false, deed: null })
    const renown = d => { R.renown = Math.max(K.renown.min, Math.min(K.renown.max, Math.round((R.renown || 0) + d))) }
    switch (`${card.kind}:${answer}`) {
      case 'rankChallenge:spar': return fight(false, `You accept ${name}'s challenge for your place: until one yields.`)
      case 'rankChallenge:blood': return fight(true, `You accept ${name}'s challenge for your place: to the death.`)
      case 'rankChallenge:decline': {
        const proud = NPC_ENC.proud.includes(p.personality)
        mem(proud ? 'rk_declinedProud' : 'rk_declined'); renown(proud ? K.renown.declineProud : K.renown.decline); R.declines = (R.declines || 0) + 1
        p.renown = Math.min(K.renown.max, (p.renown || 0) + Math.round(-(proud ? K.renown.declineProud : K.renown.decline) / 2))
        return { ok: true, text: `You will not fight ${name} for your place. ${proud ? 'They make sure the world hears of it.' : 'They bow, and go, and talk.'}` }
      }
      case 'hunter:fight': return fight(true, `You turn on ${name}. A hunter of geniuses meets one.`)
      case 'hunterKin:intercept': return fight(true, `You find ${name} on the road to ${kinName}, and step into their path.`)
      case 'hunter:flee': {
        if (Math.random() < this._roadFleeChance(p)) { mem('rk_fled'); return { ok: true, text: `You lose ${name} in the hills beyond ${place}.` } }
        return fight(true, `You run, and ${name} runs you down at ${place}.`)
      }
      case 'hunter:pay': case 'hunterKin:pay': {
        const cost = this._rankPayCost(p)
        s.spiritStones -= cost; mem(card.kind === 'hunterKin' ? 'rk_kinPaid' : 'rk_paid')
        return { ok: true, type: 'negative', text: `You send ${name} ${cost} Spirit Stones. They weigh the pouch, and go hunting elsewhere.` }
      }
      case 'hunter:veil': {
        this.setRankVeil(true)
        if (Math.random() < K.hunter.veilLoses) { mem('rk_veiled'); return { ok: true, type: 'positive', text: `You go quiet, and your name goes dark. ${name} loses the trail.` } }
        return fight(true, `You veil your name, but ${name} already has your scent. They find you at ${place}.`)
      }
      case 'hunterKin:hide': {
        const k = this._rankKinNow(card.kin), q = s.world.persons[card.kin?.id]
        if (q) q.rankHiddenUntil = yr + K.hunter.hideYears
        if (k && typeof k.bond === 'number') k.bond = Math.max(0, k.bond - 5)
        return { ok: true, type: 'neutral', text: `You send ${kinName} into hiding. The rankings will not carry their name for ${K.hunter.hideYears} years.` }
      }
      case 'hunterKin:leave': {
        const res = this._rankKinStrike(p, card.kin)
        return { ok: true, type: res.died ? 'negative' : 'neutral', text: res.text }
      }
      case 'invite:accept': {
        const r = this._wsRec(card.rank?.sect)
        if (!r) return { ok: false, reason: 'gone' }
        if (s.sect?.id) this.leaveSect()
        const j = this.joinSect(r.defId)
        if (!j.ok) return { ok: false, reason: j.reason }
        s.sect.rank = Math.max(s.sect.rank || 0, K.invite.startRank)
        mem('rk_joined')
        return { ok: true, type: 'special', text: `You take the oath of the ${r.name} as ${SECT_RANKS[s.sect.rank]?.name || 'an Inner Disciple'}. The rankings opened their gate.` }
      }
      case 'invite:decline': {
        const r = this._wsRec(card.rank?.sect)
        if (r) this._wsDeed(r, K.invite.stanceDecline, 'you turned down their invitation')
        mem('rk_inviteDeclined')
        return { ok: true, text: `You thank ${name}, and decline. They bow, and take the news home.` }
      }
      case 'invite:refuse': {
        const r = this._wsRec(card.rank?.sect)
        if (r) this._wsDeed(r, K.invite.stanceRefuse, 'you spat on their invitation')
        mem('rk_inviteRefused')
        return { ok: true, type: 'negative', text: `You send ${name} away with words they will repeat to their master.` }
      }
    }
    return null
  }

  // The hunter reaches your child (you let them face it, or you fell back from the fight).
  _rankKinStrike(p, kin) {
    const s = this._s, f = s.family || {}, name = Persons.fullName(p), yr = Math.floor(s.world.year)
    const k = this._rankKinNow(kin)
    if (!k) return { died: false, text: `${name} finds no one to take.` }
    if (Math.random() < this._rankKinOdds(p, kin)) return { died: false, text: `${kin.name} meets ${name} blade to blade, and drives the hunter off, bleeding but alive.` }
    const text = `${name}, a hunter of geniuses, has killed ${kin.name}, ${kin.word}.`
    k.alive = false; k.diedYear = yr; k.cause = 'hunter'
    if (f.heirId === k.id) f.heirId = null
    this._killPerson(kin.id, yr, 'hunter')
    this._emit('world_news', { text, type: 'negative' })
    return { died: true, text }
  }

  // A fight from a rankings card or the Class duel ended (_roadFightOutcome). what: won | lost | slain | killedYou.
  _rankFought(card, opp, what) {
    const s = this._s, K = NPC_RANK, R = this._ranks(), kinCard = card.kind === 'hunterKin'
    const renown = d => { R.renown = Math.max(K.renown.min, Math.min(K.renown.max, Math.round((R.renown || 0) + d))) }
    if (card.kind === 'rankChallenge' || card.kind === 'rankDuel') {
      if (what === 'won' || what === 'slain') { renown(K.renown.win); if (opp.alive !== false) opp.renown = Math.max(K.renown.min, (opp.renown || 0) + K.renown.lose) }
      if (what === 'lost') { renown(K.renown.lose); opp.renown = Math.min(K.renown.max, (opp.renown || 0) + K.renown.win) }
      if (what !== 'killedYou' && opp.alive !== false) this._remember(opp, 'rk_spar', NPC_RANK_TEXT.rel.rk_spar, this._roadFill(NPC_RANK_TEXT.mem.rk_spar, { place: card.place || 'the road' }), { rumour: false, deed: null })
      R.stats.duels++
      return ''
    }
    if (card.kind === 'hunter' || kinCard) {
      if (what === 'slain') {
        renown(K.renown.killHunter); s.karma = Math.min(100, (s.karma ?? 50) + K.hunter.karma); this._repDeed('slewHunter', opp)
        return kinCard ? ` ${card.kin?.name || 'Your child'} is safe.` : ' The geniuses of this generation breathe easier.'
      }
      if (what === 'won') return kinCard ? ` ${card.kin?.name || 'Your child'} is safe, for now.` : ''
      if (what === 'lost' && kinCard) return ' ' + this._rankKinStrike(opp, card.kin).text
    }
    return ''
  }

  // Public: veil (or unveil) your name. Takes effect at the next publication.
  setRankVeil(on) {
    const R = this._ranks()
    on = !!on
    if (R.veil === on) return { ok: true, veil: on }
    R.veil = on
    this._rankNews(on ? NPC_RANK_TEXT.veilOn : NPC_RANK_TEXT.veilOff, on ? '' : 'jade', { log: true, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, veil: on }
  }

  // Public: the Class board duel — challenge the classmate ranked just above you (a spar for renown).
  challengeRanked(pid) {
    const s = this._s, info = this._rankDuelInfo()
    if (!info || info.pid !== pid) return { ok: false, reason: 'not_above' }
    if (info.lock) return { ok: false, reason: 'locked', lock: info.lock }
    const p = s.world.persons[pid], R = this._ranks()
    R.duelAt = this._cdNow() + NPC_RANK.duel.cdSec
    const yours = R.prev.classNow?.[s.self.id] || null, theirs = R.prev.classNow?.[pid] || null
    this.addEvent({ text: `You call out ${Persons.fullName(p)}, who stands one place above you in your class. Until one yields.`, type: 'special', pid })
    this._startFight('road', p, false, { road: { id: null, kind: 'rankDuel', pid, name: Persons.fullName(p), place: 'the ranking stone', answer: 'spar', rank: { board: 'class', theirs, yours } } })
    return { ok: true, fight: true }
  }
  _rankDuelInfo() {
    const s = this._s, cls = this._rankClass(), i = cls.findIndex(e => e.self)
    if (i <= 0) return null
    const p = s.world.persons[cls[i - 1].pid]
    if (!p) return null
    const cd = this._cdLeft(this._ranks().duelAt), gap = Math.abs((p.stageIndex || 0) - (s.stageIndex || 0))
    const lock = s.family?.fight ? 'Another fight is underway' : (s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH ? 'Too wounded to fight'
      : p.roadCard ? 'They are already on the road to you' : gap > NPC_RANK.duel.stageGap ? `They stand ${gap} stages from you: too far to call out` : cd ? 'Wait for the cooldown' : null
    return { pid: p.id, name: Persons.fullName(p), lock, cd, odds: Math.round((this.personFightOdds(p, 'road', false)?.chance ?? 0.5) * 100) }
  }

  // Sect fame from a public place (a founder's sect): the best of each board's row.
  _rankFame() {
    const R = this._s.world?.ranks
    if (!R || R.veil || R.life !== this._lifeNo()) return 0
    const pick = (b, n) => n ? ((NPC_RANK.fame[b].find(([t]) => n <= t) || [0, 0])[1]) : 0
    return pick('heaven', R.you.heaven) + pick('dragon', R.you.dragon)
  }

  // A person's places this year (the person card's chip). { heaven, dragon } or null.
  rankOf(pid) {
    const R = this._s.world?.ranks
    if (!R || R.y == null) return null
    const h = R.boards.heaven.findIndex(e => e.pid === pid) + 1, d = R.boards.dragon.findIndex(e => e.pid === pid) + 1
    return h || d ? { heaven: h || null, dragon: d || null } : null
  }

  // Public (UI: World → Rankings). board: 'class' | 'dragon' | 'heaven'.
  rankingsInfo(board = 'class') {
    const s = this._s, w = s.world, K = NPC_RANK, R = this._ranks(), yr = Math.floor(w.year || 0), me = s.self?.id
    const rid = this._rivalOf()?.id || null, kinIds = new Set((s.family?.children || []).map(c => c.id).concat(s.family?.spouse ? [s.family.spouse.id] : []))
    const stageOf = p => p.alive !== false ? (p.stageIndex || 0) : (p.maxStage || p.stageIndex || 0)
    const sectOf = p => p.sectId === 'own' ? (s.ownSect?.name || null) : p.sectId ? this._wsRec(p.sectId)?.name || null : null
    const row = (pid, place, sc, prevMap) => {
      const self = pid === me, p = self ? null : w.persons[pid]
      if (!self && !p) return null
      const was = prevMap?.[pid]
      return { place, pid, self, name: self ? (s.name || 'You') : Persons.fullName(p) || 'Nameless', sc,
        stage: self ? (s.stageIndex || 0) : stageOf(p), sect: self ? (s.ownSect?.founded ? s.ownSect.name : this._wsMine()?.name || null) : sectOf(p),
        move: was == null ? 'new' : was - place, chosen: !!p?.chosen, rival: !!rid && pid === rid, kin: kinIds.has(pid), pinned: !!p?.pin,
        hunter: !!p?.hunter, age: self ? Math.floor(s.age || 0) : Math.max(0, yr - (p.bornYear ?? yr)) }
    }
    const nextSecs = R.y == null ? null : Math.max(0, Math.round((R.y + K.every - (w.year || 0)) * 3600 / GAME_YEARS_PER_OPEN_HOUR))
    const out = { board, year: R.y, nextSecs, veil: R.veil, hint: !R.hint, renown: R.renown || 0, declines: R.declines || 0,
      you: { ...R.you }, best: { ...R.best }, titles: R.titles.filter(t => t.life === this._lifeNo()), pastTitles: R.titles.filter(t => t.life !== this._lifeNo()),
      honour: [...R.honour].reverse(), news: [...R.news].reverse().slice(0, 8), fresh: Math.max(0, (R.seq || 0) - (R.seen || 0)),
      power: this.rankPowerParts(null, true).total, fame: this._rankFame(), founder: !!s.ownSect?.founded, rows: [], total: 0, place: null, fallen: [] }
    if (board === 'class') {
      const cls = this._rankClass(), prev = R.prev.class
      out.total = cls.length
      const all = cls.map((e, i) => row(e.pid, i + 1, e.power, prev)).filter(Boolean)
      out.place = all.find(r => r.self)?.place || null
      const shown = new Set(all.slice(0, K.show).map(r => r.pid))
      const i = all.findIndex(r => r.self)
      for (let j = Math.max(0, i - K.around); j <= Math.min(all.length - 1, i + K.around); j++) shown.add(all[j].pid)
      for (const r of all) if (r.pinned || r.rival) shown.add(r.pid)
      out.rows = all.filter(r => shown.has(r.pid))
      const duel = this._rankDuelInfo()
      if (duel) { const r = out.rows.find(x => x.pid === duel.pid); if (r) r.duel = duel }
      const c = w.cohorts?.[this._lifeNo()]
      out.fallen = (c?.ids || []).map(id => w.persons[id]).filter(p => p && (p.alive === false || p.ascended))
        .map(p => ({ pid: p.id, name: Persons.fullName(p), ascended: !!p.ascended, stage: stageOf(p), cause: p.ascended ? 'Ascended' : PERSON_CAUSE_TEXT[p.cause] || 'Passed on', y: p.diedYear ?? null }))
        .sort((a, b) => (b.ascended - a.ascended) || b.stage - a.stage)
      out.counts = { living: cls.length, fallen: out.fallen.filter(f => !f.ascended).length, ascended: out.fallen.filter(f => f.ascended).length }
    } else {
      const list = R.boards[board] || [], prev = R.prev[board]
      out.total = list.length + (R.veil && R.you[board] ? 1 : 0)
      out.place = R.you[board]
      const all = list.map((e, i) => ({ e, place: i + 1 }))
      const shown = new Set(all.slice(0, K.show).map(x => x.e.pid))
      const i = all.findIndex(x => x.e.pid === me)
      if (i >= 0) for (let j = Math.max(0, i - K.around); j <= Math.min(all.length - 1, i + K.around); j++) shown.add(all[j].e.pid)
      for (const x of all) { const p = w.persons[x.e.pid]; if (p?.pin || x.e.pid === rid || kinIds.has(x.e.pid)) shown.add(x.e.pid) }
      out.rows = all.filter(x => shown.has(x.e.pid)).map(x => row(x.e.pid, x.place, x.e.sc, prev)).filter(Boolean)
      out.youOff = R.veil ? 'veiled' : board === 'dragon' && this._rankYears(null, true) > K.dragonYears ? 'aged' : !R.you[board] ? 'none' : R.you[board] > K.keep ? 'below' : null
      out.dragonYears = K.dragonYears; out.yourYears = this._rankYears(null, true)
    }
    return out
  }
  noteRanksSeen() { const R = this._ranks(); if (R.seen !== R.seq) { R.seen = R.seq; this._notify() } }
  // What the attention strip counts: the logged headlines (your moves past a threshold, titles, a child hunted…) since you last looked.
  ranksNews() { const R = this._s.world?.ranks; return R ? R.news.filter(n => n.log && n.i > (R.seen || 0)).length : 0 }
  ranksNewsLast() { const R = this._s.world?.ranks; return R ? [...R.news].reverse().find(n => n.log && n.i > (R.seen || 0)) || null : null }
  noteRanksHint() { this._ranks().hint = true; this._notify() }
  rankStats() { const R = this._s.world?.ranks; return R ? { ...R.stats, you: { ...R.you }, best: { ...R.best }, renown: R.renown, veil: R.veil, titles: R.titles.length, honour: R.honour.length } : null }

  // ── Phase 28 task 4.7 (living-world.md §3): World → People — the people you know, pins, tappable log names ──

  // The registry people named (in full) in a line of text, the event's own pid first. [{ pid, n }] (≤ logNamesMax).
  _namesIn(text, pid = null) {
    const ps = this._s.world?.persons, out = []
    if (!ps || !text) return out
    const me = this._s.self?.id, max = WORLD_PEOPLE.logNamesMax
    const take = p => {
      const n = Persons.fullName(p)
      if (n && n.includes(' ') && text.includes(n) && !out.some(x => x.pid === p.id || x.n === n)) out.push({ pid: p.id, n })
    }
    if (pid && ps[pid] && pid !== me) take(ps[pid])
    for (const p of Object.values(ps)) { if (out.length >= max) break; if (p.id !== me) take(p) }
    return out
  }

  // What a person is to you, in a word (the People list's tie): the strongest bond wins.
  _tieToYou(p, ctx) {
    const s = this._s, f = s.family || {}, id = p.id
    if (f.spouse?.id === id) return { k: 'kin', word: 'Your spouse', tone: 'gold' }
    if ((f.children || []).some(c => c.id === id)) return { k: 'kin', word: 'Your child', tone: 'gold' }
    if ((f.lovers || []).some(l => l.person?.id === id)) return { k: 'kin', word: 'Your lover', tone: 'jade' }
    if ((f.formerSpouses || []).some(x => x.id === id)) return { k: 'kin', word: 'Former spouse', tone: '' }
    if ((s.self?.parents || []).includes(id)) return { k: 'kin', word: 'Your parent', tone: 'gold' }
    if (ctx.clan.has(id)) return { k: 'kin', word: 'Your clan', tone: 'jade' }
    if (ctx.rival && id === ctx.rival) return { k: 'rival', word: 'Your rival', tone: 'red' }   // 4.10b
    if (p.rivalOf && p.rivalOf !== s.self?.id && !ctx.clan.has(id)) return { k: 'rival', word: 'Rival of a past life', tone: '' }
    if (p.sworn && p.sworn === s.self?.id) return { k: 'friend', word: 'Sworn sibling', tone: 'gold' }   // 4.10
    if (p.feud?.pid === s.self?.id) return { k: 'grudge', word: 'Sworn against you', tone: 'red' }
    if (p.sectId === 'own') return { k: 'sect', word: p.role === 'branch_head' ? 'Your branch head' : 'Your disciple', tone: 'jade' }
    if (ctx.mine && p.sectId === ctx.mine) return { k: 'sect', word: p.sectRole === 'master' ? 'Your sect master' : p.sectRole === 'elder' ? 'Your sect elder' : 'Fellow disciple', tone: 'jade' }
    if (p.cohort === ctx.life) return { k: 'class', word: 'Your classmate', tone: 'gold' }
    if (p.cohort) return { k: 'class', word: `Classmate, life ${p.cohort}`, tone: '' }
    if (p.owner === 'arena') return { k: 'other', word: 'Arena duelist', tone: '' }
    if (p.owner === 'family') return { k: 'other', word: PERSON_ROLE_TEXT[p.role] || 'Met on the road', tone: '' }
    return { k: 'other', word: 'Known face', tone: '' }
  }

  // Is this someone the People list shows? (you have met them, seen their name, or they are bound to you)
  _inPeople(p, ctx) {
    if (!p || p.id === ctx.me || p.role === 'ancestor' || ctx.past.has(p.id)) return false
    return !!(p.pin || p.cohort != null || (p.fam || 0) > 0 || p.rel || ctx.clan.has(p.id) || p.owner === 'family' || p.owner === 'arena'
      || p.sectId === 'own' || (ctx.mine && p.sectId === ctx.mine) || p.feud?.pid === ctx.me || ctx.parents.has(p.id))
  }

  _peopleCtx() {
    const s = this._s, w = s.world
    return { me: s.self?.id, life: this._lifeNo(), mine: this._wsMine()?.id || null, yr: Math.floor(w.year || 0),
      clan: new Set(this._clanMemberIds(this._playerClan(w))), parents: new Set(s.self?.parents || []),
      past: new Set((w.pastLives || []).map(l => l.personId)), rival: this._rivalOf()?.id || null }
  }

  // Public (UI): World → People. filter: all | pinned | class | kin | sect | grudge | fallen; sort: relevance | realm |
  // recent | name; q: a search over names + sect names. Every filter but Pinned + Fallen lists the living.
  // Rows: { pid, name, alive, ascended, stage, age, tie, sect, rel, relWord, relTone, last: { y, text }, pinned, fresh, chips }.
  knownPeople({ q = '', filter = 'all', sort = 'relevance', limit = WORLD_PEOPLE.peoplePage, since = null } = {}) {
    const s = this._s, w = s.world, ctx = this._peopleCtx(), yr = ctx.yr
    if (!w?.persons) return { rows: [], counts: {}, shown: 0, matched: 0, pins: 0, pinMax: WORLD_PEOPLE.pinMax, year: yr }
    // The latest thing the world wrote about each person (the Chronicle, then your log for those it never named).
    const last = new Map(), seen = since ?? (w.peopleSeen || 0)
    for (let i = (w.chron || []).length - 1; i >= 0; i--) {
      const e = w.chron[i]
      for (const id of e.p || []) if (!last.has(id)) last.set(id, { y: e.y, text: e.t, i: e.i })
    }
    for (const ev of s.events || []) for (const x of ev.who || []) if (!last.has(x.pid)) last.set(x.pid, { y: null, text: ev.text, i: 0 })
    const needle = String(q || '').trim().toLowerCase()
    const counts = { all: 0, pinned: 0, class: 0, kin: 0, sect: 0, friend: 0, grudge: 0, rival: 0, fallen: 0 }
    const list = []
    let pins = 0
    for (const p of Object.values(w.persons)) {
      if (p.pin) pins++
      if (!this._inPeople(p, ctx)) continue
      const alive = p.alive !== false, tie = this._tieToYou(p, ctx)
      const grudge = (p.rel || 0) < 0 || p.feud?.pid === ctx.me
      const sectRec = p.sectId && p.sectId !== 'own' ? this._wsRec(p.sectId) : null
      const sect = p.sectId === 'own' ? (s.ownSect?.name || 'your sect') : sectRec?.name || null
      if (needle && !(Persons.fullName(p).toLowerCase().includes(needle) || (sect && sect.toLowerCase().includes(needle)))) continue
      const is = { all: alive, pinned: !!p.pin, class: alive && p.cohort != null, kin: alive && tie.k === 'kin', sect: alive && tie.k === 'sect',
                   friend: alive && ((p.rel || 0) >= NPC_ENC.relWarm || (!!p.sworn && p.sworn === ctx.me)),   // 4.10
                   grudge: alive && grudge, rival: !!p.rivalOf, fallen: !alive }   // 4.10b: Rivals = every life's rival, living or not
      for (const k of Object.keys(counts)) if (is[k]) counts[k]++
      if (!is[filter]) continue
      list.push({ p, alive, tie, sect, grudge })
    }
    const R = NPC_HEAVY.relevance
    const score = p => Math.min(R.famCap, (p.fam || 0) * R.fam) + Math.abs(p.rel || 0) * R.rel + (p.cohort === ctx.life ? R.classmate : p.cohort ? R.pastClassmate : 0)
      + (p.chosen ? R.chosen : 0) + (ctx.mine && p.sectId === ctx.mine ? R.mySect : 0) + (p.sectRole === 'master' || p.sectRole === 'elder' ? R.seat : 0)
      + (ctx.clan.has(p.id) || p.owner === 'family' ? R.classmate : 0) + (p.pin ? R.pin : 0)
    const stage = p => p.alive !== false ? (p.stageIndex || 0) : (p.maxStage || p.stageIndex || 0)
    const by = { relevance: (a, b) => score(b.p) - score(a.p), realm: (a, b) => stage(b.p) - stage(a.p),
                 recent: (a, b) => (b.p.seenY ?? -1) - (a.p.seenY ?? -1) || (last.get(b.p.id)?.i || 0) - (last.get(a.p.id)?.i || 0),
                 name: () => 0 }[sort] || (() => 0)
    list.sort((a, b) => by(a, b) || Persons.fullName(a.p).localeCompare(Persons.fullName(b.p)))
    const rows = list.slice(0, limit).map(({ p, alive, tie, sect, grudge }) => {
      const r = p.rel || 0, l = last.get(p.id)
      const relWord = !r ? null : r >= 60 ? 'Devoted' : r >= 30 ? 'Warm' : r > -30 ? 'Indifferent' : r > -60 ? 'Cold' : 'Hateful'
      return { pid: p.id, name: Persons.fullName(p) || 'Nameless', alive, ascended: !!p.ascended, stage: stage(p),
        age: Math.max(0, (alive ? yr : p.diedYear ?? yr) - (p.bornYear ?? yr)), diedYear: p.diedYear ?? null,
        cause: !alive && !p.ascended ? (PERSON_CAUSE_TEXT[p.cause] || 'Passed on') : null,
        tie, sect, grudge, rel: r, relWord, relTone: r >= 30 ? 'jade' : r <= -30 ? 'red' : '',
        role: p.sectRole === 'master' ? 'Sect master' : p.sectRole === 'elder' ? 'Sect elder' : null,
        chosen: !!p.chosen, injured: alive && (p.injuredUntil || 0) > yr, twilight: alive && !!p.twilight, heavy: p.tier === 'heavy',
        feud: alive && p.feud && w.persons[p.feud.pid]?.alive !== false ? { pid: p.feud.pid, name: Persons.fullName(w.persons[p.feud.pid]) || 'someone', you: p.feud.pid === ctx.me } : null,
        last: l ? { y: l.y, text: l.text } : null, pinned: !!p.pin, fresh: !!p.pin && !!l && l.i > seen }
    })
    return { rows, counts, shown: rows.length, matched: list.length, pins, pinMax: WORLD_PEOPLE.pinMax, year: yr }
  }

  // Public (UI): pin / unpin someone (★). The player's own choice; capped by WORLD_PEOPLE.pinMax.
  togglePin(pid) {
    const s = this._s, p = s.world?.persons?.[pid]
    if (!p || pid === s.self?.id) return { ok: false, reason: 'unknown' }
    if (p.pin) { delete p.pin; this._notify(); return { ok: true, pinned: false } }
    const pins = Object.values(s.world.persons).filter(x => x.pin).length
    if (pins >= WORLD_PEOPLE.pinMax) return { ok: false, reason: 'full', pinMax: WORLD_PEOPLE.pinMax }
    p.pin = 1; p.fam = Math.max(1, p.fam || 0)
    if (p.alive !== false && this._heavyEligible(p, this._clanIdSet())) p.tier = 'heavy'   // their life runs in full from now on
    this._notify()
    return { ok: true, pinned: true }
  }

  // Public (attention): Chronicle lines about people you pinned since you last opened World → People.
  peopleNews() {
    const w = this._s?.world
    if (!Array.isArray(w?.chron) || !w.persons) return 0
    const seen = w.peopleSeen || 0
    let n = 0
    for (let i = w.chron.length - 1; i >= 0 && w.chron[i].i > seen; i--) if ((w.chron[i].p || []).some(id => w.persons[id]?.pin)) n++
    return n
  }
  // Returns the mark before (the view keeps it while open, so the fresh dots stay until you leave).
  notePeopleSeen() { const w = this._s?.world; if (!w) return 0; const was = w.peopleSeen || 0; w.peopleSeen = w.chronSeq || 0; return was }

  _weightedRng(tbl, rng) {
    const ks = Object.keys(tbl).filter(k => Number.isFinite(tbl[k]) && tbl[k] > 0), tot = ks.reduce((a, k) => a + tbl[k], 0)   // 4.4: a missing or NaN weight never wins
    let r = rng() * tot
    for (const k of ks) { r -= tbl[k]; if (r < 0) return k }
    return ks[ks.length - 1]
  }
  // Persons.blendRoot's odds on a seeded rng.
  _rngBlendRoot(a, b, rng) {
    const r = rng(), el = ['fire', 'water', 'earth', 'wood', 'metal'][Math.floor(rng() * 5)]
    if (r < 0.4 && a?.type) return this._rootOfType(a.type, el)
    if (r < 0.8 && b?.type) return this._rootOfType(b.type, el)
    return this._rngRoot(rng)
  }

  // What the player hears of a year in the world: their class, their clan, people they have met. Everyone else only
  // reaches the sects' chronicle (masters, elders) or nothing at all (4.6 brings the merged Chronicle).
  _tellLives(news, life, myClan) {
    const s = this._s, out = [], youStage = s.stageIndex || 0
    const told = s.world.classTold ||= { fell: 0, passed: [] }
    const rid = this._rivalOf()?.id   // 4.10b
    for (const n of news) {
      const p = n.p, mine = p.cohort === life, known = (p.fam || 0) > 0 || myClan.has(p.id)
      if (n.k === 'up' && rid && p.id === rid) { out.unshift(this._rivalRose(p)); continue }   // 4.10b: your rival's breakthrough is a headline
      if (n.k === 'died') {
        if (mine) { out.push({ text: this._lifeText(p.chosen ? 'chosenFell' : 'classmateFell', p, { cause: n.cause }), type: 'negative', toast: !!p.chosen, banter: 'classmate_fell', who: p }); told.fell = (told.fell || 0) + 1 }
        else if (myClan.has(p.id)) out.push({ text: this._lifeText('kinFell', p, { cause: n.cause }), type: 'negative', who: p })
        else if (known && !p.sectRole) out.push({ text: this._lifeText('knownFell', p, { cause: n.cause }), type: 'neutral', who: p })
      } else if (n.k === 'ascended') {
        out.push({ text: this._lifeText('ascended', p), type: 'special', toast: true, who: p })
      } else if (n.k === 'up' && mine && (p.stageIndex || 0) >= NPC_LIVES.logFromStage) {
        const passed = (p.stageIndex || 0) > youStage && !(told.passed || []).includes(p.id)
        if (passed) { told.passed = [...(told.passed || []), p.id].slice(-80); out.push({ text: this._lifeText('classmatePassed', p), type: 'neutral', banter: 'classmate_passed', who: p }) }
        else out.push({ text: this._lifeText(p.chosen ? 'chosenRealm' : 'classmateRealm', p), type: 'neutral', who: p })
      } else if (n.k === 'twilight' && (mine || known)) out.push({ text: this._lifeText('twilight', p), type: 'neutral', who: p })
      else if (n.k === 'injured' && (mine || known)) out.push({ text: this._lifeText('injured', p), type: 'neutral', who: p })
      else if (n.k === 'married' && mine) out.push({ text: this._lifeText('married', p, { spouse: Persons.fullName(n.q) }), type: 'positive', who: p })
    }
    for (const e of out.slice(0, 5)) this.addEvent({ type: e.type, text: e.text, pid: e.who?.id || null })
    const b = out.find(e => e.banter)
    if (b) this._emit(b.banter, { classmate: b.who.given })
    const t = out.find(e => e.toast)
    if (t) this._emit('world_news', { text: t.text, type: t.type })
  }

  // The long dead are forgotten unless something still needs them: past lives, clan kin, classmates (the Class board),
  // strong feelings, pins, the parents + spouses of the living, the seats of sects.
  _pruneDead(yr) {
    const s = this._s, w = s.world, keep = new Set(), cut = yr - NPC_LIVES.pruneAfter
    // final QA (save size): a stranger you never knew (no familiarity, regard or memory of you) is forgotten sooner
    const cutStranger = yr - (NPC_LIVES.pruneStrangerAfter ?? NPC_LIVES.pruneAfter)
    const stranger = p => !p.fam && !p.rel && !(p.mem && p.mem.length) && !p.feud && !p.sworn
    for (const l of w.pastLives || []) keep.add(l.personId)
    for (const c of Object.values(w.clans || {})) { keep.add(c.headId); for (const l of c.lines || []) for (const id of l.memberIds || []) keep.add(id) }
    for (const r of this._wsAll()) { keep.add(r.leaderId); for (const id of r.elderIds || []) keep.add(id) }
    for (const id of s.self?.parents || []) keep.add(id)
    for (const p of Object.values(w.persons)) if (p.alive !== false) { for (const id of p.parents || []) keep.add(id); for (const id of p.spouseIds || []) keep.add(id) }
    for (const [id, p] of Object.entries(w.persons)) {
      if (p.alive !== false || (p.owner && p.owner !== 'world')) continue
      if (keep.has(id) || p.cohort != null || p.pin || Math.abs(p.rel || 0) >= 50 || p.ascended || (p.diedYear ?? yr) > (stranger(p) ? cutStranger : cut)) { this._compactDead(p); continue }
      delete w.persons[id]
    }
  }
  // The dead the world keeps shed what only the living use (readers default every one of these keys).
  _compactDead(p) {
    for (const k of ['npcXp', 'grownYear', 'injuredUntil', 'stageYear', 'twilight', 'talent', 'tier', 'arts', 'act', 'ties', 'mentorUntil', 'actAt']) delete p[k]   // act/ties/mentorUntil/actAt: final QA (save size)
    if (!p.fam) delete p.fam
    if (!p.pin) delete p.pin
    if (!p.rel) delete p.rel
    if (p.ties && !Object.keys(p.ties).length) delete p.ties
    if (p.gender == null) delete p.gender
    if (p.sectRole == null) delete p.sectRole
  }

  // The pre-existing world (§6.1), once per slot: wanderers (some wed, with children) and a few old monsters, beside the
  // world sects' masters + elders (_wsEnsurePeople). Ages fit the stages they reached; nobody starts past their span.
  _seedWorldPeople() {
    const w = this._s.world, L = NPC_LIVES, yr = Math.floor(w.year || 1)
    const rng = wsRng(`${this._peopleSeed()}|world`)
    const els = ['fire', 'water', 'earth', 'wood', 'metal']
    const place = (p, stage) => {
      const span = this._lifespan(p)
      const need = AWAKENING_AGE + this._yearsToStage(stage, p.root?.mult || 1)
      p.bornYear = yr - Math.round(Math.min(span * 0.9, need * (0.9 + rng() * 0.5)))
      p.grownYear = yr
    }
    const wand = []
    for (let i = 0; i < L.seedWanderers; i++) {
      const stage = L.seedWandererStage[0] + Math.floor(Math.pow(rng(), 1.6) * (L.seedWandererStage[1] - L.seedWandererStage[0] + 1))
      const p = this._mintPerson({ stage, role: 'wanderer' }, rng)
      place(p, stage); wand.push(p)
    }
    for (let i = 0; i < L.seedOldMonsters; i++) {
      const stage = L.seedMonsterStage[0] + Math.floor(rng() * (L.seedMonsterStage[1] - L.seedMonsterStage[0] + 1))
      const p = this._mintPerson({ stage, role: 'old_monster', root: this._rootOfType(rng() < 0.3 ? 'heavenly' : 'pure', els[Math.floor(rng() * 5)]) }, rng)
      place(p, stage)
      if (stage >= NPC_STAGE_CAP) p.stageYear = yr - Math.floor(rng() * L.ascendYearsAtPeak)
    }
    for (let i = 0; i + 1 < wand.length; i += 2) {
      if (rng() >= L.seedCouples) continue
      const a = wand[i], b = wand[i + 1]
      a.spouseIds = [b.id]; b.spouseIds = [a.id]
      const n = L.seedChildren[0] + Math.floor(rng() * (L.seedChildren[1] - L.seedChildren[0] + 1))
      const young = Math.max(a.bornYear, b.bornYear)
      for (let k = 0; k < n; k++) {
        const born = Math.min(yr, young + 20 + Math.floor(rng() * 40))
        const c = this._mintPerson({ family: a.family, stage: 0, age: [0, 0], role: yr - born >= AWAKENING_AGE ? 'wanderer' : 'youth', root: this._rngBlendRoot(a.root, b.root, rng) }, rng)
        c.bornYear = born; c.parents = [a.id, b.id]; c.grownYear = born + AWAKENING_AGE
        this._growPerson(c, yr, false)
      }
    }
  }
  // A seed that differs per slot without a Math.random draw: the slot's own first rolls (its sects' masters).
  _peopleSeed() {
    const w = this._s.world
    if (!w.peopleSeed) w.peopleSeed = String(wsRng(`${(w.sects?.list || []).map(r => r.leader + r.name).join('|')}|${this._s.name}`)() * 1e9 | 0)
    return w.peopleSeed
  }

  // Your class (§6.1, 28H): ~60 youths who awaken the year you do. A mid-life save gets its class grown to today.
  _seedCohort() {
    const s = this._s, w = s.world, L = NPC_LIVES, life = this._lifeNo()
    w.cohorts ||= {}
    if (w.cohorts[life] || s.interlude) return
    const born = this._playerBorn(), awake = born + AWAKENING_AGE, yr = Math.floor(w.year)
    const rng = wsRng(`${this._peopleSeed()}|cohort|${life}|${born}`)
    const ids = [], els = ['fire', 'water', 'earth', 'wood', 'metal'], heir = this._rivalHouseHeir(life)
    for (let i = 0; i < L.cohortSize; i++) {
      const chosen = i < L.cohortChosen
      let band = L.cohortSpread[L.cohortSpread.length - 1]
      if (!chosen) { let r = rng(); for (const b of L.cohortSpread) { r -= b.share; if (r < 0) { band = b; break } } }
      const roots = chosen ? L.chosenRoots : band.roots, tal = chosen ? L.chosenTalent : band.talent
      const p = this._mintPerson({ stage: 0, age: [0, 0], role: 'wanderer', root: this._rootOfType(this._weightedRng(roots, rng), els[Math.floor(rng() * 5)]) }, rng)
      p.bornYear = born - L.cohortBornJitter[0] - Math.floor(rng() * (L.cohortBornJitter[1] - L.cohortBornJitter[0] + 1))
      p.talent = Math.round((tal[0] + rng() * (tal[1] - tal[0])) * 100) / 100
      p.cohort = life; p.grownYear = p.bornYear + AWAKENING_AGE
      if (chosen) p.chosen = true
      if (i === 0 && heir) { p.family = heir.surname; p.parents = heir.parentId ? [heir.parentId] : []; p.rivalHouse = heir.surname; this._names?.add(Persons.fullName(p)) }   // 4.10b: the rival line's heir
      ids.push(p.id)
      for (let y = p.grownYear + 1; y <= yr; y++) { if (this._growPerson(p, y, true).died) { this._npcDies(p, y, 'bt_backlash'); break } }
    }
    w.cohorts[life] = { year: awake, born, ids }
    w.livesYear = Math.max(w.livesYear ?? yr, yr)
    this._pickRival()   // 4.10b
  }

  // Public (UI): a class — yours this life, or an earlier life's. The living by realm, then the ascended, then the fallen.
  classInfo(life = null) {
    const s = this._s, w = s.world, cur = this._lifeNo()
    const lives = Object.keys(w.cohorts || {}).map(Number).sort((a, b) => b - a)
    const n = life ?? cur, c = w.cohorts?.[n]
    if (!c) return { life: n, current: n === cur, lives, members: [], counts: { living: 0, fallen: 0, ascended: 0 }, ahead: 0, youStage: null }
    const yr = Math.floor(w.year), you = s.stageIndex || 0
    const members = c.ids.map(id => w.persons[id]).filter(Boolean).map(p => {
      const sect = p.sectId && p.sectId !== 'own' ? this._wsRec(p.sectId) : null
      return { pid: p.id, name: Persons.fullName(p) || 'Nameless', alive: p.alive !== false, ascended: !!p.ascended,
        stage: p.alive !== false ? (p.stageIndex || 0) : (p.maxStage || p.stageIndex || 0), chosen: !!p.chosen,
        age: Math.max(0, (p.alive === false ? p.diedYear ?? yr : yr) - (p.bornYear ?? yr)), diedYear: p.diedYear ?? null,
        cause: p.alive === false && !p.ascended ? (PERSON_CAUSE_TEXT[p.cause] || 'Passed on') : null,
        twilight: !!p.twilight && p.alive !== false, injured: (p.injuredUntil || 0) > yr && p.alive !== false,
        sect: sect ? sect.name : p.sectId === 'own' ? (s.ownSect?.name || 'your sect') : null }
    })
    const rank = m => m.alive ? 0 : m.ascended ? 1 : 2
    members.sort((a, b) => rank(a) - rank(b) || b.stage - a.stage || (b.chosen - a.chosen) || a.name.localeCompare(b.name))
    const counts = { living: members.filter(m => m.alive).length, ascended: members.filter(m => m.ascended).length }
    counts.fallen = members.length - counts.living - counts.ascended
    const past = n < cur ? w.pastLives?.[n - 1] : null
    return { life: n, current: n === cur, lives, awakenYear: c.year, members, counts,
      ahead: n === cur ? members.filter(m => m.alive && m.stage > you).length : 0, youStage: n === cur ? you : null,
      pastName: past ? Persons.fullName(w.persons[past.personId]) || null : null }
  }
  // Public (UI): the class view was seen (clears the World group's class dot).
  noteClassSeen() { const t = this._s.world?.classTold; if (t && t.fell) { t.fell = 0; this._notify() } }
  classNews() { return this._s.world?.classTold?.fell || 0 }

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
             branchWarCooldownYear: null,
             // 1.8b-3a (family.md): player agency — a partner's wish for a child, children on the way, spouse
             // action cooldowns, why affection last moved + a yearly trail, courtship, suitors who refused you.
             // planVer 1 = the planning value is the player's own (old saves' 'many' default becomes 'ask').
             planVer: 1, childWish: null, expecting: [], spouseCd: {}, childTryAt: null,
             lastAff: null, affTrail: [], court: null, seekCooldownAt: null, spurned: [],
             // 1.8b-3b: a fight you are in (spouse duel / head challenge), exchange by exchange
             fight: null,
             // A6-3a (combat.md): a step-down bracket paused on your bout; no one else challenges you until this year
             bracket: null, cowedUntilYear: null }
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
    // 1.8b-3a: 'many' was the silent default before "Ask me" existed — it becomes 'ask'. some/none were chosen.
    if (f.planVer === undefined && (f.planning === 'many' || f.planning === undefined)) f.planning = 'ask'
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
    // 1.8b-3a shapes
    if (!Array.isArray(f.expecting)) f.expecting = []
    if (!Array.isArray(f.affTrail))  f.affTrail = []
    if (!Array.isArray(f.spurned))   f.spurned = []
    if (!f.spouseCd || typeof f.spouseCd !== 'object') f.spouseCd = {}
    // 2026-09-28: cooldowns moved from game years to real seconds; old year stamps are dropped (they start clear)
    if (!f.cdSecsVer) { f.cdSecsVer = 1; f.spouseCd = {}; f.childTryAt = null; f.seekCooldownAt = null; delete f.childTryYear; delete f.seekCooldownYear; for (const c of f.children) c.cd = {}; if (f.court) f.court.nextMeetAt = null }
    if (f.childWish && !this._partnerById(f.childWish.partnerId, true)) f.childWish = null
    if (f.court && (typeof f.court !== 'object' || !Array.isArray(f.court.candidates))) f.court = null
    if (f.court && f.spouse) f.court = null
    if (f.fight && (typeof f.fight !== 'object' || !f.fight.kind || (f.fight.kind === 'duel' ? !f.spouse
      : f.fight.kind === 'beast' ? !(typeof BEAST_TYPES !== 'undefined' && BEAST_TYPES.some(b => b.id === f.fight.beast?.typeId))
      : f.fight.kind === 'arena' ? !s.arena?.duelists?.[f.fight.oppId]            // A6-3b: the Arena's own duelists
      : f.fight.kind === 'slaughter' || f.fight.kind === 'spar' ? !f.fight.foe   // A6-3a / 43h: the foe lives on the fight itself
      : f.fight.kind === 'boss' ? !(typeof BOSSES !== 'undefined' && BOSSES[f.fight.boss?.id])   // v1 add-on: a legendary boss
      : !this.person(f.fight.oppId)))) f.fight = null
    for (const c of f.children) {
      if (!c.cd || typeof c.cd !== 'object') c.cd = {}
      if (!c.raised || typeof c.raised !== 'object') c.raised = { time: 0, teach: 0, gift: 0 }
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

  // `why` (1.8b-3a) is shown in the Family view and the affection breakdown: "Anniversary +8 (yr 412)".
  _changeAffection(delta, why) {
    const f = this._s.family
    if (!f.spouse) return 0
    const before = f.affection
    f.affection = Math.max(0, Math.min(100, f.affection + delta))
    const moved = f.affection - before
    if (why && moved) f.lastAff = { delta: Math.round(moved), why, year: Math.floor(this._s.world.year) }
    return moved
  }

  // 1.8b-3a: a partner (current spouse, lover, or — for a child already on the way — a former spouse) by id.
  _partnerById(id, currentOnly = false) {
    const f = this._s.family
    if (f.spouse?.id === id) return f.spouse
    const lover = f.lovers.find(l => l.person.id === id)
    if (lover) return lover.person
    return currentOnly ? null : (f.formerSpouses.find(p => p.id === id) || null)
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
    child.cd       = {}                                // 1.8b-3a: raising-action cooldowns (ready-at stamps, real seconds)
    child.raised   = { time: 0, teach: 0, gift: 0 }
    f.children.push(child)
    this.addEvent({ text: `Year ${yr}: a child is born — ${Persons.fullName(child)} (${child.root.name}).`, type: 'special' })
    this._claimFirst('first_child')
    this._emit('child_born', { child: child.given })
    return child
  }

  // 1.8b-3a: every birth goes through here (delegated timer or an answered wish / try). A lover's child may
  // expose the affair (DISCOVERY_ON_LOVER_CHILD); a tolerant spouse only sighs (AFFAIR_TOLERATED_AFFECTION).
  _birth(partnerId) {
    const f = this._s.family, partner = this._partnerById(partnerId)
    if (!partner) return null
    const child = this._makeChild(partner)
    const lover = f.lovers.find(l => l.person.id === partnerId)
    if (lover && f.spouse) {
      if (f.tolerant) this._changeAffection(AFFAIR_TOLERATED_AFFECTION, `a child by ${lover.person.given}`)
      else if (!f.duel && Math.random() < DISCOVERY_ON_LOVER_CHILD * this._affairMult(lover)) this._discoverAffair(lover, true)
    }
    return child
  }

  // 1.8b-3a ('ask' plan): a partner wishes for a child. One at a time; never expires; the player answers.
  _raiseChildWish(partner) {
    const f = this._s.family, yr = Math.floor(this._s.world.year)
    f.childWish = { partnerId: partner.id, year: yr }
    this.addEvent({ text: `Year ${yr}: ${Persons.fullName(partner)} speaks, softly, of wanting a child with you.`, type: 'special' })
    this._emit('child_wish', { partner: partner.given })
  }

  // The marriage ends. endCause: left | divorced | suicide | murder_suicide | duel (family.md). Death causes
  // mark the spouse dead; the rest walk away. Proposals resume after PROPOSAL_RETRY_YEARS.
  _spouseEnds(endCause, text, type = 'negative') {
    const s = this._s, f = s.family, sp = f.spouse
    if (!sp) return
    const y = s.world.year, yr = Math.floor(y)
    const died = endCause === 'suicide' || endCause === 'murder_suicide' || endCause === 'duel' || endCause === 'rival'   // 4.10b: a rival's blade
    const former = { ...sp, endedYear: yr, endCause }
    if (died) { former.alive = false; former.diedYear = yr; former.cause = endCause }
    f.formerSpouses.push(former)
    f.spouse = null; f.affection = null; f.tolerant = false
    f.nextChildYear = null; f.event = null; f.nextEventYear = null; f.duel = null; f.btSabotage = false
    f.spouseCd = {}; f.lastAff = null; f.affTrail = []   // 1.8b-3a (a child already on the way is still born)
    if (f.childWish?.partnerId === sp.id) f.childWish = null
    if (died) f.expecting = f.expecting.filter(e => e.partnerId !== sp.id)
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
    if (fx.health)    s.health = Math.max(1, Math.min(this.maxHealth(), (s.health ?? 100) + fx.health))
    if (fx.karma)     s.karma = Math.max(0, Math.min(100, s.karma + fx.karma))
    if (fx.integrity) s.realmIntegrity = Math.max(0, Math.min(100, (s.realmIntegrity ?? 100) + fx.integrity))
    if (fx.contribution && s.sect?.id) s.sect.contribution += fx.contribution
    for (const [id, q] of Object.entries(fx.items || {})) s.inventory[id] = (s.inventory[id] || 0) + q
  }

  // A generated person near the player's stage/age (suitors and lovers).
  // 4.5: known-first — about 75% of the time a person the world already has (a classmate, a face you've seen), copied
  // for the family; else a new one (counted against the new-name throttle). `exclude`: ids already offered this time.
  _rollStranger(role, exclude = []) {
    const s = this._s
    const lo = Math.max(1, Math.min(SPOUSE_STAGE_CAP, s.stageIndex + SUITOR_STAGE_OFFSET[0])), hi = Math.max(1, Math.min(SPOUSE_STAGE_CAP, s.stageIndex + SUITOR_STAGE_OFFSET[1]))
    const known = this._castKnown(role === 'suitor' ? 'suitor' : 'stranger', { stage: [lo, hi], age: [18, Math.max(30, (s.age || 16) + SUITOR_AGE_OFFSET_YEARS[1] + 10)], exclude })
    if (known) return this._castCopy(known, role)
    this._castFresh()
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
  // confessed (1.8b-3b): you told them yourself — a smaller blow, and forgiveness is likelier.
  _discoverAffair(lover, viaChild, confessed = false) {
    const s = this._s, f = s.family, sp = f.spouse
    if (!sp) return
    const yr = Math.floor(s.world.year), spName = Persons.fullName(sp), loverName = Persons.fullName(lover.person)
    f.tally.discovered++
    if (confessed) {
      this._changeAffection(CONFESS_AFFECTION, 'you confessed an affair')
      this.addEvent({ text: `Year ${yr}: you tell ${spName} everything about ${loverName}. They listen without a word.`, type: 'negative' })
    } else {
      this._changeAffection(AFFAIR_DISCOVERED_AFFECTION + (viaChild ? AFFAIR_CHILD_EXTRA_AFFECTION : 0), viaChild ? 'learned of your affair, and the child' : 'learned of your affair')
      this.addEvent({ text: `Year ${yr}: ${spName} learns of your affair with ${loverName}${viaChild ? ' — and of the child' : ''}.`, type: 'negative' })
    }
    const w = AFFAIR_REACTIONS[sp.personality] || { accept: 30, sabotage: 30, duel: 20, suicide: 10, murder_suicide: 10 }
    // 2.6b: the spouse's morality tilts it too — a righteous spouse forgives more, a ruthless one turns violent.
    const m = sp.morality ?? 0, kind = 1 + Math.max(0, m) / 100, cruel = 1 + Math.max(0, -m) / 100
    const a = f.affection, calm = a / 50, hot = (100 - a) / 50
    const ca = confessed ? CONFESS_ACCEPT_MULT : 1, cv = confessed ? CONFESS_VIOLENT_MULT : 1
    const opts = [['accept', w.accept * calm * kind * ca], ['sabotage', w.sabotage], ['duel', w.duel * hot * cruel * cv],
                  ['suicide', w.suicide * hot * cv], ['murder_suicide', w.murder_suicide * hot * cruel * cv]]
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

  // 2026-09-30 (user): how fast a partner's affection drifts toward AFFECTION_REST this game year. The full rate only
  // applies while you are actively playing (Active Mode with the window in front of you); while you are away (window
  // hidden/unfocused) or in Idle Mode it is AFFECTION_DRIFT_AWAY_FRAC of that, so absence barely cools a relationship.
  affectionDriftRate() {
    const s = this._s
    if (!s) return AFFECTION_DRIFT_PER_YEAR
    const away = s.playMode === 'idle' || !this._present
    return away ? AFFECTION_DRIFT_PER_YEAR * AFFECTION_DRIFT_AWAY_FRAC : AFFECTION_DRIFT_PER_YEAR
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

    // family-events.js: a bad father may beat you while you are still a child of the house. Rare — a year interval
    // AND a flat chance gate it. Never lethal (_applyFamilyEffect floors Health at 1). Enough defiance, grown up
    // and outranking him, later unlocks the reckoning.
    const ab = s.abuse || (s.abuse = this._blankAbuse())
    if (!ab.avenged && !ab.event) {
      const head = this._father()
      if (head && head.alive !== false && s.age <= AWAKENING_AGE + BEATING_MAX_YEARS && this.isBadFather()) {
        if (!ab.nextCheck) ab.nextCheck = yr + this._randRange(BEATING_CHECK_YEARS)
        if (yr >= ab.nextCheck) {
          ab.nextCheck = yr + this._randRange(BEATING_CHECK_YEARS)
          if (Math.random() < BEATING_CHANCE) {
            ab.event = { year: yr, headId: head.id }
            this.addEvent({ text: `Year ${yr}: ${this.beatingWhy()}.`, type: 'negative' })
            this._emit('beating', { id: 'beating' })
          }
        }
      }
    }
    if (!ab.reckon && this.reckoningInfo()) ab.reckon = true

    // Spouse: gains a stage every SPOUSE_YEARS_PER_STAGE married years (never ascends, never dies of age).
    const sp = f.spouse
    if (sp) {
      // (PLAYER_QI_EDGE: the years a stage takes are capped by your bare pace at their stage and root)
      for (let need; sp.stageIndex < SPOUSE_STAGE_CAP && y - f.spouseStageYear >= (need = 1 / this._npcStageRate(sp.stageIndex, sp.root?.mult || 1, SPOUSE_YEARS_PER_STAGE, false));) {
        sp.stageIndex++
        sp.maxStage = Math.max(sp.maxStage, sp.stageIndex)
        f.spouseStageYear += need
      }
      if (sp.stageIndex >= SPOUSE_STAGE_CAP) f.spouseStageYear = y
      // Affection drifts slowly back toward AFFECTION_REST — full rate only while you actively play (2026-09-30).
      const gap = AFFECTION_REST - f.affection
      f.affection += Math.sign(gap) * Math.min(Math.abs(gap), this.affectionDriftRate())
      f.affTrail.push([yr, Math.round(f.affection)])   // 1.8b-3a: the trend arrow
      if (f.affTrail.length > AFF_TRAIL_MAX) f.affTrail.splice(0, f.affTrail.length - AFF_TRAIL_MAX)
    }

    // 1.8b-3a: children already on the way arrive (a lover's child may still expose the affair).
    for (const e of [...f.expecting]) {
      if (y < e.dueYear) continue
      f.expecting.splice(f.expecting.indexOf(e), 1)
      this._birth(e.partnerId)
    }

    // Children with the spouse: paced by Family Planning (2.6b), no cap. 'none' pauses births entirely.
    // 'ask' (1.8b-3a default) only raises the spouse's WISH for a child — the player answers it.
    const interval = this._childInterval(), ask = f.planning === 'ask'
    if (f.spouse && interval && f.nextChildYear != null && y >= f.nextChildYear) {
      if (!ask) {
        this._birth(f.spouse.id)
        f.nextChildYear = y + this._randRange(interval)
      } else if (!f.childWish) {
        if (f.affection >= AFFECTION_CRISIS) this._raiseChildWish(f.spouse)
        else f.nextChildYear = y + this._randRange(interval)   // a Cold spouse doesn't ask
      }
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
      c.xp += this._npcStageRate(c.stageIndex, c.root?.mult || 1, CHILD_YEARS_PER_STAGE)   // (PLAYER_QI_EDGE cap)
      this._growChild(c, cap)
    }

    // Lovers (family.md): each has their own child timer. A lover's child may expose the affair
    // (DISCOVERY_ON_LOVER_CHILD); a tolerant spouse only sighs (AFFAIR_TOLERATED_AFFECTION).
    for (const lover of [...f.lovers]) {
      // 1.8b-3b: an affair no longer fades on its own — the lover asks you to choose (answerLoverUltimatum).
      if (lover.endsYear != null && y >= lover.endsYear && !lover.ultimatum) {
        lover.ultimatum = { year: yr }
        this.addEvent({ text: `Year ${yr}: ${Persons.fullName(lover.person)} will not go on like this. ${f.spouse ? '"Leave them for me, or let me go."' : '"Marry me, or let me go."'}`, type: 'special' })
        this._emit('lover_ultimatum', { name: lover.person.given })
      }
      if (!interval || y < lover.nextChildYear) continue
      if (!ask) {
        lover.nextChildYear = y + this._randRange(interval)
        this._birth(lover.person.id)
      } else if (!f.childWish) this._raiseChildWish(lover.person)
    }
    // Yearly discovery roll per lover while married (at most one discovery per year).
    if (f.spouse && !f.tolerant && !f.duel) {
      const found = f.lovers.find(l => Math.random() < this._affairChance(l))   // 1.8b-3b: covering / "one more season"
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
        for (let i = 0; i < n; i++) suitors.push(this._rollStranger('suitor', suitors.map(x => x.id)))
        f.proposal = { suitors, year: yr }
        f.nextProposalYear = null
        this.addEvent({ text: `Year ${yr}: a matchmaker arrives with ${n === 1 ? 'a proposal' : `${n} proposals`} of marriage.`, type: 'special' })
        this._emit('proposal', { count: n })
      }
    }

    // 2.6e: while you hold the head seat, a rival with a real shot may call you out — one pending at a time.
    const clan = this._playerClan()
    if (clan && this.isClanHead() && !f.headChallenge && !f.fight && !f.bracket) {
      if (f.nextChallengerYear == null) f.nextChallengerYear = y + this._randRange(CHALLENGER_EVENT_YEARS)
      else if (y >= f.nextChallengerYear) {
        f.nextChallengerYear = y + this._randRange(CHALLENGER_EVENT_YEARS)
        // A6-3a: while the clan is cowed (you humbled someone), only a grudge-holder dares
        const ch = Math.random() < CHALLENGER_EVENT_CHANCE ? this._pickChallenger(clan, f.cowedUntilYear != null && y < f.cowedUntilYear) : null
        if (ch) {
          f.headChallenge = { challengerId: ch.id, year: yr }
          this.addEvent({ text: `Year ${yr}: ${Persons.fullName(ch)} strides into the hall and calls you out for the head seat.`, type: 'negative' })
          this._emit('head_challenge', { id: ch.id })
        }
      }
    }

    // 2.6e: while an NPC leads (not you), they may eventually tire of the seat — anyone adult may join the
    // tournament that follows, you included.
    if (clan && clan.headId && clan.headId !== s.self.id && !f.stepDownOffer && !f.bracket) {
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
    if (!id) return null
    const def = typeof SECTS !== 'undefined' ? (SECTS.find(x => x.id === id) || null) : null
    return def || this._lineageSectDef(id)   // Phase 46 (1.20d): a membership in a lineage world sect has no SECTS def
  }

  // Phase 46 (1.20d, lineage-sect.md): synthesise a SECTS-shaped def for a lineage world sect you are a member of,
  // so rank, missions, the blessing and the master systems all keep working. Effects are neutral (a founded sect had
  // no joined-sect blessing); the reward is the connection + the road back to owning it.
  _lineageSectDef(id) {
    const r = this._wsById(id)
    if (!r || r.kind !== 'lineage') return null
    const minStage = CULTIVATION_STAGES.findIndex(x => x.realm === 'Core Formation')
    return { id: r.id, name: r.name, nameCN: '', minStage, effects: {}, lineage: true,
             desc: `The sect your line founded, led now by ${r.leader}. Its halls lend what they can; rank, missions and its wars are as any other sect's.` }
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
    this._ensurePhase43Fields()
    this._ensurePhase45Fields()
    this._ensurePhase5BFields()
    this._ensurePhase32Fields()
    this._ensurePhase22Fields()
    this._ensurePhase23Fields()
    this._ensurePhase14Fields()   // Phase 14: the body + mini-games (after 23: clamps Health to the body's max)
    this._ensurePhase20CFields()
    this._ensurePhase29Fields()
    this._ensurePhase33Fields()   // world first (2.6a) — self/clan roster below depend on it
    this._ensurePhase30Fields()
    this._ensurePhase43bFields()  // Phase 43b: the world's sect registry (needs s.world + s.self)
    this._ensurePhase16Fields()
    this._ensurePhase34Fields()   // Phase 31 (2.7a) — needs s.world.clans (33), reads maxStageThisLife/techniques
    this._ensurePhase46Fields()   // Phase 46 (1.20b) — needs world.sects (43b) + world.clans (33)
    this._ensurePhase35Fields()
    this._ensurePhase42Fields()
    this._ensurePhase44Fields()   // Phase 44: known recipes (a new field, so old saves gain the basic formulas)
    this._ensureBeatingFields()   // family-events.js — a bad father's hand + the grown-up reckoning
    this._ensurePhase28Fields()   // Phase 28 (4.2): one registry of persons — needs world.sects (43b), arena (35), family (16)
    this._ensureBossFields()      // v1 add-on (bosses.md): legendary bosses + soul techniques — needs s.world
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
      const might = this.beastProfile(beast).might          // tier × variant: what the beast's traits are worth
      for (const traitId of (beast.traits || [])) {
        const lvlMult = 1 + (beast.level - 1) * 0.10
        if (traitId === 'soul_bond')         beastQpsMult    *= (1 + 0.05 * beast.level * might)
        if (traitId === 'qi_devour')         beastPassiveQps += 0.5 * lvlMult * might
        if (traitId === 'heavenly_instinct') beastBtBonus    += 0.10 * lvlMult * (1 + (might - 1) * 0.5)   // BT: half the edge
      }
    }
    qMul('Soul-bonded beasts', beastQpsMult)
    qps += beastPassiveQps
    if (beastPassiveQps) qpsParts.push({ label: 'Qi-devouring beasts', op: '+', value: beastPassiveQps })
    bAdd('Beast instinct', beastBtBonus)

    // Sect bonuses (Phase 4) — suppressed for a while after the sect loses a member war (Phase 5C)
    const sectBuffSuppressed = s.sectWar.side === 'member' && Date.now() < (s.sectWar.buffSuppressedUntil || 0)
    // Phase 43d: the blessing scales with the sect's halls × your rank's share (sectBlessing()). Only ever for a sect
    // you joined (s.sect.id); a founder holds no s.sect, so it can never double-apply alongside ownSect.
    const blessing = this.sectBlessing()
    const sectFx = sectBuffSuppressed || !blessing ? {} : sectBlessingEffects(this._sectDef()?.effects, blessing.k)
    const sectName = this._sectDef() ? `${this._sectDef().name} (blessing ×${blessing.k.toFixed(2)})` : 'Sect'
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
      const bIds = Object.keys(own.buildings).filter(k => own.buildings[k] > 0)
      let totalLevels = 0
      for (const id of bIds) {
        const lvl = own.buildings[id], e = sectBuildingEffects(id, lvl)     // Phase 43: effects scale with the level
        totalLevels += lvl
        libMult    *= e.disciple_qi_mult || 1
        ownCraft   += e.craft_double_chance || 0
        maxBeasts  += e.beast_slots || 0
        xpMult     *= e.disciple_xp_mult || 1
        if (!(id === 'defensive_array' && arrayDamaged)) warDefense += e.war_defense || 0
        incomeMult *= e.income_mult || 1
      }
      for (const d of own.disciples) {
        discQi += DISCIPLE_QI_FRAC * d.talent * (1 + 0.1 * (d.level - 1)) * this._discipleYieldMult(d)   // Phase 45: branch members feed a share
        fame   += d.talent * d.level
      }
      discQi *= libMult
      discCap = SECT_HALL_LEVELS[Math.min(own.hallLevel, SECT_HALL_LEVELS.length) - 1].cap
      fame   += 10 * totalLevels + 25 * own.hallLevel + 5 * (s.sectWar?.warVictories || 0) + (s.arena?.sectFame || 0) + SECT_RAZE.fame * (own.razed?.length || 0) + this._rankFame()   // 4.8: a public place on the rankings · A6-3b · 43f: sects you razed: arena wins (Phase 43: deeper halls carry more fame)
    }
    qMul('Disciples’ offerings', 1 + discQi)

    // Phase 31 (M2 task 2.7d, clan-succession.md §2.7): clan legacies that scale Qi/s permanently — Refined
    // Meridians and the Ancestor Blessing (both unconditional). None apply to an orphan life (no clan).
    // Phase 46 (1.20a, lineage-sect.md): ancestral catch-up is REMOVED — Bloodline Quality is the head start now.
    const legacyClan = this._playerClan()
    if (legacyClan) {
      qMul('Refined Meridians', 1 + this._legacyValue(legacyClan, 'refined_meridians'))
      qMul('Ancestor Blessing', 1 + (legacyClan.blessingStacks || 0) * ANCESTOR_BLESSING_QPS)
    }
    // Phase 46 (1.20a): a stronger bloodline cultivates faster (+0.4%/pt, cap +40% at BQ 100). 0 on a first life,
    // so only a reincarnated life shows the term — the inherited advantage that replaced catch-up.
    const bloodlineBq = s.bloodlineQuality || 0
    if (bloodlineBq > 0) qMul('Bloodline Quality', 1 + bloodlineBq * BLOODLINE_QI_COEF)
    // Phase 14 (body-constitution.md): spirit tempering halves Qi/s while it runs; an endured ordeal's root boost;
    // Thunder Peak's breakthrough edge.
    const body = s.body
    const tempM = body.active && !body.active.crisis ? this._temperMethod(body.active.id) : null
    if (tempM?.qiMult) qMul(`${tempM.name} (tempering)`, tempM.qiMult)
    if (body.rootBoost && Date.now() < body.rootBoost.until && this.rootElements().includes(body.rootBoost.element))
      qMul(`${ART_ELEMENTS[body.rootBoost.element].name}-tempered root`, body.rootBoost.mult)
    bAdd('Thunder-tempered body', body.btBonus || 0)
    // Phase 40: Soul Resonance — cross-save, every slot and every life (docs/systems/soul-points.md)
    qMul(`Soul Resonance (rank ${this._soul.resonance})`, this.soulQiMult())
    // v1 add-on (bosses.md): the soul techniques' costs — a spent seed, a spirit split with your other self
    if ((s.soulUse?.essenceUntil || 0) > Date.now()) qMul('Essence spent (Seed of the Self)', SOUL_TECH.seed.essenceQiMult)
    if (s.clone?.exp || s.clone?.temper) qMul(`Your other self is ${s.clone.temper ? 'tempering' : 'out'} (Body Beyond the Body)`, SOUL_TECH.clone.qiMult)

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
      sectBlessingK:    blessing ? blessing.k : null,   // Phase 43d: factor × rank share (null when in no sect)
      // Phase 14: the body
      bodyTier:         body.tier,
      maxHealth:        this.maxHealth(),
      healthRegenSeconds: this.healthRegenSeconds(),
      btKeepBody:       BODY_TIERS[body.tier].btKeep,
      // 1.8b-2: the terms behind qiPerSecond / breakthroughChance / qiCap (see top of _recalc)
      breakdown: {
        qps: qpsParts, bt: btParts, cap: capParts,
        btFloor: sectFx.bt_floor || 0, btPill: pillBtPreview, btRaw: st.breakthroughChance + btBonus + s.karma / 1000,
      },
    }
    this._maybeLineageRecruit()   // Phase 46 (1.20d): the old line-sect offers you a place at Core Formation
  }

  _notify(fromTick = false) {
    if (this._yearBatch && !fromTick) { this._yearDirty = true; return }   // 4.11: the year's jobs re-render once, at the end
    this._subs.forEach(fn => fn(this._s, fromTick))
  }

  // ── Phase 28 task 4.11 (living-world.md → "4.11 as built"): the game-year turn, spread over frames ──────────────────
  // The year's jobs run in their old order, but a real frame (dt < 1 s) only spends about YEAR_FRAME_MS on them and the
  // rest wait for the next frames (the whole turn lands within a few frames, ~1/15 s). Their full re-renders collapse into
  // one when the queue empties. A tick of a second or more (the sim, the checks, a long-stalled frame) drains them all at
  // once, so results there are unchanged. Not saved: closing mid-turn drops at most a few frames' jobs (the lives and the
  // rankings catch up on the next turn).
  _queueYear(yr) {
    const s = this._s, J = this._yearJobs ||= []
    J.push(() => this._tickFamily(), () => this._tickArena(), () => this._tickBranches(), () => this._tickWorldSects(),
      () => this._tickWorldLives(), () => this._tickRepute(yr), () => this._tickRival(yr), () => this._tickRanks(yr), () => this._tickSoulTech(),
      () => { this._syncPersons(); if (s.ownSect?.founded && !s.interlude) this._roadRoll('gate', null, `the gate of ${s.ownSect.name}`) })
  }
  _drainYear(dt) {
    const J = this._yearJobs, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const all = dt >= 1, t0 = now()
    this._yearBatch = true
    try {
      do { J.shift()() } while (J.length && (all || now() - t0 < YEAR_FRAME_MS))
    } finally { this._yearBatch = false }
    if (!J.length && this._yearDirty) { this._yearDirty = false; this._notify() }
  }
  // Run anything still queued now (before a save, a life's end, a test that reads the year's results at once).
  flushYear() { if (this._yearJobs?.length) this._drainYear(1e9) }

  _save() {
    const s = this._s
    try { this.flushYear() } catch (e) { console.error(e) }   // 4.11: a year turn half-spread across frames lands whole first
    try { this._syncPersons() } catch (e) { console.error(e) }   // Phase 28: owners mirrored before every write
    s.lastSave = Date.now()
    window.electron.saveSlot(this._slot, s).catch(() => {})
  }

  // UI (user 2026-09-27): what an expedition can bring back — exact chance each item shows up and its quantity range,
  // mirroring _rollDrops (1..min(tier,3) weighted picks without repeats, qty × lootMult). Push Harder's extra roll not included.
  dropPreview(locId) {
    const loc = LOCATIONS.find(l => l.id === locId)
    if (!loc) return []
    const table = loc.dropTable, lootMult = this._s.derived?.lootMult || 1
    const maxK = Math.min(loc.enemyTier, 3)
    // P(item i is among the first k picks), weighted without replacement — tables are tiny, so enumerate.
    const pIn = (items, i, k) => {
      if (k <= 0 || !items.length) return 0
      const W = items.reduce((a, d) => a + d.weight, 0)
      let p = 0
      for (let j = 0; j < items.length; j++) {
        const pj = items[j].weight / W
        if (j === i) p += pj
        else p += pj * pIn(items.filter((_, x) => x !== j), i < j ? i : i - 1, k - 1)
      }
      return p
    }
    return table.map((d, i) => {
      let chance = 0
      for (let r = 1; r <= maxK; r++) chance += pIn(table, i, Math.min(table.length, r)) / maxK
      return { itemId: d.itemId, name: ITEMS[d.itemId]?.name || d.itemId, chance,
               min: Math.max(1, Math.round(d.minQty * lootMult)), max: Math.max(1, Math.round(d.maxQty * lootMult)) }
    }).sort((a, b) => b.chance - a.chance)
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
    if (s?.interlude && this._yearJobs?.length) this.flushYear()   // 4.11: a life that ended mid-turn: the turn finishes as it always did, in one go
    if (!s || s.interlude) return   // 2.6d: between lives the clock stops until the player chooses
    if (s.family?.bracket && !s.family.fight) this._bracketStep()   // A6-3a: a bracket saved between bouts runs on

    // Phase 30 (M2 task 2.3): game clock. Age/gameYear advance ONLY here — never in initSlot()/offline
    // catch-up (life-loop.md pillar 4; §10 gotcha: "open" means the process is running, tray included,
    // since Phase 9A keeps ticking while hidden — only the app not running at all skips aging).
    // Age is a stat only — nothing dies of age (user decision 2026-09-26).
    const years = dt * GAME_YEARS_PER_OPEN_HOUR / 3600
    const prevYear = Math.floor(s.world.year), prevSeason = Math.floor(s.world.year * NPC_HEAVY.seasons)
    s.age      += years
    s.world.year += years
    if (Math.floor(s.world.year) !== prevYear) this._queueYear(Math.floor(s.world.year))   // Phase 16-lite (M2 task 2.5) · A6-3b · Phase 45 · Phase 43b · Phase 28 (4.3 … 4.8) — 4.11: spread over the next frames
    if (Math.floor(s.world.year * NPC_HEAVY.seasons) !== prevSeason) { if (this._yearJobs?.length) this._yearJobs.push(() => this._tickSeasons()); else this._tickSeasons() }   // Phase 28 (4.4): the heavy tier's seasons (4.11: after the year's jobs)
    if (this._yearJobs?.length) this._drainYear(dt)
    if (s.hunt && !s.hunt.found && Date.now() >= s.hunt.endsAt) this._resolveHunt()   // Phase 35 (A6-2)
    if (s.arts?.studies?.length) this._finishStudies()      // Phase 42 (arts.md): study runs on real time, closed or open (1.14b: desks)
    this._tickBody()                                         // Phase 14: tempering + mini-game charges run on real time
    this._tickClone()                                        // v1 add-on: the clone's expedition (bosses.md)

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
    // Phase 14: the body sets the rate (+1 every healthRegenSeconds) and the ceiling (maxHealth)
    s._healthRegenAcc = (s._healthRegenAcc || 0) + dt
    const regenSec = this.healthRegenSeconds()
    if (s._healthRegenAcc >= regenSec) {
      s._healthRegenAcc -= regenSec
      s.health = Math.min(this.maxHealth(), (s.health ?? 100) + HEALTH_REGEN_AMOUNT)
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
        qiKeep = Math.min(1, qiKeep + (BODY_TIERS[s.body?.tier || 0]?.btKeep || 0))         // Phase 14: a stronger body holds more
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
    if (newRealm !== prevRealm) this._offerArts(newRealm)          // Phase 42: breakthrough insight — pick 1 of 3
    if (ART_STAGE_GRANTS[s.stageIndex]) this._learnArt(ART_STAGE_GRANTS[s.stageIndex], 'grant')
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
    const spouse = this._wed(suitor, AFFECTION_START + (suitor.personality === s.personality?.id ? AFFECTION_SAME_PERSONALITY : 0))
    this._recalc(); this._notify()
    this._emit('married', { spouse: spouse.given })
    return { ok: true, spouse }
  }

  // Shared by the matchmaker's proposal and a courtship (1.8b-3a). Clears both.
  _wed(person, affection) {
    const s = this._s, f = s.family, y = s.world.year
    const spouse = { ...person, role: 'spouse', spouseIds: [...(person.spouseIds || []), s.self.id] }
    s.self.spouseIds = [...(s.self.spouseIds || []), spouse.id]
    f.spouse          = spouse
    f.marriedYear     = Math.floor(y)
    f.spouseStageYear = y
    f.proposal        = null
    f.court           = null
    f.nextProposalYear = null
    f.nextChildYear   = this._childInterval() ? y + this._randRange(FIRST_CHILD_YEARS) : null   // 2.6b planning
    f.affection       = Math.max(0, Math.min(100, Math.round(affection)))
    f.tolerant        = false
    f.nextEventYear   = null
    f.spouseCd = {}; f.affTrail = []; f.lastAff = null
    this.addEvent({ text: `Year ${Math.floor(y)}: ${s.name} and ${Persons.fullName(spouse)} are wed. Two paths become one.`, type: 'special' })
    this._claimFirst('married')
    return spouse
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
    const delta = this._changeAffection(ch.aff ? (ch.aff[f.spouse.personality] ?? ch.aff.default ?? 0) : 0, def.title)
    f.lastEventId = f.event.id
    f.event = null
    if (ctx.crisis) f.tally.crises++; else f.tally.events++
    const who = f.spouse.given
    const heart = delta ? ` (${who}: affection ${delta > 0 ? '+' : ''}${Math.round(delta)})` : ''
    if (ch.result) this.addEvent({ text: this.familyText(`${def.title}: ${ch.result}${heart}`, ctx), type: delta < 0 ? 'negative' : 'positive' })

    let outcome = null
    if (ch.outcome === 'forgive') {
      this._changeAffection(FORGIVE_AFFECTION, 'you forgave them'); outcome = 'forgiven'
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
        f.lastAff = { delta: 0, why: 'you begged them to stay', year: Math.floor(s.world.year) }
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

  // A6-3a: fight the i-th pending expedition encounter to the death (fight kind `slaughter`). Consumes the encounter
  // the same way seducing does; the bout plays on the battle page (docs/systems/combat.md).
  slaughterEncounter(i) {
    const s = this._s, f = s.family, enc = f.encounters[i]
    if (!enc) return { ok: false, reason: 'unknown' }
    if (f.fight) return { ok: false, reason: 'busy' }                 // one fight at a time (shared gate)
    if ((s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH) return { ok: false, reason: 'wounded' }
    const person = enc.person
    f.encounters.splice(i, 1)
    this.addEvent({ text: `You draw steel on ${Persons.fullName(person)} on the road at ${enc.place}.`, type: 'negative' })
    this._startFight('slaughter', person, true, { foe: person, place: enc.place })
    return { ok: true, fight: true }
  }

  dismissEncounter(i) {
    const f = this._s.family
    if (!f.encounters[i]) return { ok: false, reason: 'unknown' }
    f.encounters.splice(i, 1)
    this._notify()
    return { ok: true }
  }

  // Ends an affair. Children already born stay yours. 1.8b-3b: the lover may not go quietly (LOVER_SCORN by their
  // personality) — they go to your spouse, or (if you're unmarried / they already know) become a rival.
  endAffair(personId) {
    const s = this._s, f = s.family
    const idx = f.lovers.findIndex(l => l.person.id === personId)
    if (idx < 0) return { ok: false, reason: 'unknown' }
    const [lover] = f.lovers.splice(idx, 1)
    const name = Persons.fullName(lover.person)
    if (f.childWish?.partnerId === personId) f.childWish = null
    const scorned = Math.random() < this._keyed(LOVER_SCORN, lover.person.personality)
    this.addEvent({ text: `You end things with ${name}.`, type: 'neutral' })
    let told = false
    if (scorned) {
      if (f.spouse && !f.tolerant && !f.duel) {
        this.addEvent({ text: `${name} does not go quietly. By nightfall, ${f.spouse.given} knows everything.`, type: 'negative' })
        this._discoverAffair(lover, false); told = true
      } else {
        this._noteEnemy({ kind: 'person', personId: lover.person.id, name, surname: lover.person.family, why: 'you cast them aside' })
        this.addEvent({ text: `${name} swears you will regret this.`, type: 'negative' })
      }
    }
    this._recalc(); this._notify()
    return { ok: true, scorned, told }
  }

  // ── 1.8b-3b (family.md): affairs on your terms ──────────────────────────
  _lover(personId) { return this._s.family.lovers.find(l => l.person.id === personId) || null }
  _affairMult(lover) {
    const y = this._s.world.year
    return (lover.coverUntil != null && y < lover.coverUntil ? COVER_DISCOVERY_MULT : 1) *
           (lover.hotUntil != null && y < lover.hotUntil ? AFFAIR_HOT_DISCOVERY_MULT : 1)
  }
  _affairChance(lover) { return Math.min(1, DISCOVERY_PER_LOVER_YEAR * this._affairMult(lover)) }

  // What the Family view shows on a lover card: yearly discovery chance and why.
  affairRisk(personId) {
    const s = this._s, f = s.family, l = this._lover(personId)
    if (!l) return null
    const y = s.world.year
    const covered = l.coverUntil != null && y < l.coverUntil, hot = l.hotUntil != null && y < l.hotUntil
    const exposed = !!f.spouse && !f.tolerant
    return { perYear: exposed ? this._affairChance(l) : 0, onChild: exposed ? Math.min(1, DISCOVERY_ON_LOVER_CHILD * this._affairMult(l)) : 0,
             exposed, tolerant: !!f.spouse && f.tolerant, covered, coverUntil: covered ? Math.ceil(l.coverUntil) : null,
             hot, hotUntil: hot ? Math.ceil(l.hotUntil) : null, scorn: this._keyed(LOVER_SCORN, l.person.personality) }
  }

  coverCost() { return this.familyCost({ cost: { stones: COVER_TRACKS_COST } }) }

  coverTracks(personId) {
    const s = this._s, f = s.family, l = this._lover(personId)
    if (!l) return { ok: false, reason: 'unknown' }
    if (!f.spouse || f.tolerant) return { ok: false, reason: 'nothing_to_hide' }
    if (l.coverUntil != null && s.world.year < l.coverUntil) return { ok: false, reason: 'covered', readyYear: Math.ceil(l.coverUntil) }
    const cost = this.coverCost()
    if (s.spiritStones < cost) return { ok: false, reason: 'stones', cost }
    s.spiritStones -= cost
    l.coverUntil = s.world.year + COVER_YEARS
    this.addEvent({ text: `You pay for silence and separate roads. Meetings with ${l.person.given} leave no trace — for now.`, type: 'neutral' })
    this._notify()
    return { ok: true, cost }
  }

  confessAffair(personId) {
    const f = this._s.family, l = this._lover(personId)
    if (!l) return { ok: false, reason: 'unknown' }
    if (!f.spouse || f.tolerant) return { ok: false, reason: 'nothing_to_confess' }
    if (f.duel) return { ok: false, reason: 'duel' }
    const before = f.tally.accept
    this._discoverAffair(l, false, true)
    this._recalc(); this._notify()
    return { ok: true, accepted: f.tally.accept > before }
  }

  // Unmarried: wed your lover (they stop being a lover).
  marryLover(personId) {
    const f = this._s.family, l = this._lover(personId)
    if (!l) return { ok: false, reason: 'unknown' }
    if (f.spouse) return { ok: false, reason: 'married' }
    f.lovers.splice(f.lovers.indexOf(l), 1)
    const spouse = this._wed(l.person, LOVER_WED_AFFECTION)
    this._recalc(); this._notify()
    this._emit('married', { spouse: spouse.given })
    return { ok: true, spouse }
  }

  // The lover's ultimatum: 'marry' (leaving your spouse if you have one), 'let_go' (as endAffair), 'one_more'.
  answerLoverUltimatum(personId, choice) {
    const s = this._s, f = s.family, l = this._lover(personId)
    if (!l?.ultimatum) return { ok: false, reason: 'no_ultimatum' }
    if (choice === 'marry') {
      if (f.spouse) this._spouseEnds('divorced', `you leave ${Persons.fullName(f.spouse)} for ${Persons.fullName(l.person)}.`)
      return this.marryLover(personId)
    }
    if (choice === 'let_go') return this.endAffair(personId)
    if (choice === 'one_more') {
      l.ultimatum = null
      const more = this._randRange(AFFAIR_EXTEND_YEARS)
      l.endsYear = s.world.year + more
      l.hotUntil = s.world.year + more
      this.addEvent({ text: `${l.person.given} agrees to wait a little longer. You are careless together; people are starting to talk.`, type: 'neutral' })
      this._notify()
      return { ok: true }
    }
    return { ok: false, reason: 'bad_choice' }
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
    const heart = delta ? ` (${child.given}: bond ${delta > 0 ? '+' : ''}${Math.round(delta)})` : ''
    if (ch.result) this.addEvent({ text: this.familyText(`${def.title}: ${ch.result}${heart}`, ev), type: delta < 0 || outcome === 'estranged' ? 'negative' : 'positive' })
    this._recalc(); this._notify()
    return { ok: true, bond: child.bond, outcome }
  }

  // ── 1.8b-3a (family.md): family agency — the player's own choices ────────
  // Every action has a *Preview() the UI shows before the click (costs, odds, why it's locked) and the action
  // itself returns {ok, …} | {ok:false, reason}. Cooldowns are real seconds of open time (`_cdNow()` = stats.timePlayed; f.spouseCd / child.cd hold ready-at stamps).

  _yr() { return Math.floor(this._s.world.year) }
  _qiSlice(frac) { const cap = this._s.derived.qiCap; return isFinite(cap) ? frac * cap : 0 }
  _keyed(map, id) { return map ? (map[id] ?? map.default ?? 0) : 0 }

  // Courtship ────────────────────────────────────────────────────────────────
  courtCost() { return this.familyCost({ cost: { stones: COURT_SEEK_COST } }) }

  // Real-time cooldowns (2026-09-28): stamps are stats.timePlayed seconds, so they only run while the game is open.
  _cdNow() { return this._s.stats.timePlayed || 0 }
  _cdLeft(at) { return at != null && at > this._cdNow() ? Math.ceil(at - this._cdNow()) : 0 }

  canSeekMatch() {
    const s = this._s, f = s.family
    if (f.spouse) return { ok: false, reason: 'married' }
    if (f.court) return { ok: false, reason: 'courting' }
    if (Math.max(s.maxStageThisLife || 0, s.stageIndex) < PROPOSAL_MIN_STAGE) return { ok: false, reason: 'stage', minStage: PROPOSAL_MIN_STAGE }
    if (this._cdLeft(f.seekCooldownAt)) return { ok: false, reason: 'cooldown', secsLeft: this._cdLeft(f.seekCooldownAt) }
    if (s.spiritStones < this.courtCost()) return { ok: false, reason: 'stones', cost: this.courtCost() }
    return { ok: true, cost: this.courtCost() }
  }

  // Pays the matchmaker and shows COURT_CANDIDATES strangers near your stage. Nothing else happens until you pick.
  seekMatch() {
    const chk = this.canSeekMatch()
    if (!chk.ok) return chk
    const s = this._s, f = s.family
    s.spiritStones -= chk.cost
    const candidates = []
    for (let i = 0; i < COURT_CANDIDATES; i++) candidates.push(this._rollStranger('suitor', candidates.map(x => x.id)))
    f.court = { candidates, target: null, interest: 0, meetings: 0, nextMeetAt: null, beat: null, lastBeatId: null }
    this.addEvent({ text: `A matchmaker brings word of ${COURT_CANDIDATES} cultivators who might be courted.`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, candidates }
  }

  courtTarget(personId) {
    const s = this._s, f = s.family, c = f.court
    if (!c || c.target) return { ok: false, reason: 'no_court' }
    const p = c.candidates.find(x => x.id === personId)
    if (!p) return { ok: false, reason: 'unknown' }
    c.target = p; c.candidates = []
    c.interest = COURT_INTEREST_START + (p.personality === s.personality?.id ? COURT_SAME_PERSONALITY : 0)
    c.nextMeetAt = this._cdNow()
    this.addEvent({ text: `You begin to court ${Persons.fullName(p)}.`, type: 'special' })
    this._notify()
    return { ok: true }
  }

  canMeet() {
    const s = this._s, c = s.family.court
    if (!c?.target) return { ok: false, reason: 'no_target' }
    if (c.beat) return { ok: false, reason: 'pending' }
    if (this._cdLeft(c.nextMeetAt)) return { ok: false, reason: 'cooldown', secsLeft: this._cdLeft(c.nextMeetAt) }
    return { ok: true }
  }

  // Draws the next meeting (a COURT_BEATS card). It waits until you answer it.
  meetTarget() {
    const chk = this.canMeet()
    if (!chk.ok) return chk
    const c = this._s.family.court
    let pool = COURT_BEATS.filter(b => b.id !== c.lastBeatId && !(c.seen || []).includes(b.id))
    if (!pool.length) pool = COURT_BEATS.filter(b => b.id !== c.lastBeatId)
    const b = pool[Math.floor(Math.random() * pool.length)]
    c.beat = { id: b.id }
    this._notify()
    return { ok: true, beat: b }
  }

  courtBeatDef(beat) { return COURT_BEATS.find(b => b.id === beat?.id) || null }

  courtText(str) {
    const t = this._s.family.court?.target
    return String(str || '').replace(/\{them\}/g, t ? t.given : 'them').replace(/\{name\}/g, this._s.name)
  }

  resolveCourtBeat(i) {
    const s = this._s, c = s.family.court
    if (!c?.beat) return { ok: false, reason: 'no_beat' }
    const def = this.courtBeatDef(c.beat), ch = def?.choices?.[i]
    if (!ch) return { ok: false, reason: 'bad_choice' }
    const cost = this.familyCost(ch)
    if (s.spiritStones < cost) return { ok: false, reason: 'cant_afford' }
    s.spiritStones -= cost
    this._applyFamilyEffect(ch.effect)
    const before = c.interest
    c.interest = Math.max(0, Math.min(100, c.interest + this._keyed(ch.int, c.target.personality)))
    const delta = Math.round(c.interest - before)
    c.meetings++
    c.lastBeatId = c.beat.id
    c.seen = [...(c.seen || []), c.beat.id]
    c.lastResult = { title: def.title, text: this.courtText(ch.result), delta }   // shown on the card (1.8b-3a)
    c.beat = null
    c.nextMeetAt = this._cdNow() + COURT_BEAT_GAP_SECS
    this.addEvent({ text: this.courtText(`${def.title}: ${ch.result}${delta ? ` (interest ${delta > 0 ? '+' : ''}${delta})` : ''}`), type: delta < 0 ? 'negative' : 'positive' })
    this._recalc(); this._notify()
    return { ok: true, interest: c.interest, delta }
  }

  // Proposal odds, as parts (shown as a breakdown before you ask).
  proposeChance() {
    const s = this._s, c = s.family.court, t = c?.target
    if (!t) return null
    const gap = s.stageIndex - t.stageIndex
    const parts = [
      { label: `${t.given}'s interest`, value: c.interest / 100, op: 'base' },
      { label: gap >= 0 ? `You stand ${gap} stage${gap === 1 ? '' : 's'} above them` : `They stand ${-gap} stage${gap === -1 ? '' : 's'} above you`, value: gap * COURT_STAGE_WEIGHT },
      { label: 'Your karma', value: (s.karma - 50) * COURT_KARMA_WEIGHT },
    ]
    const raw = parts.reduce((a, p) => a + p.value, 0)
    return { total: Math.max(COURT_PROPOSE_RANGE[0], Math.min(COURT_PROPOSE_RANGE[1], raw)), raw, parts,
             meetings: c.meetings, need: COURT_BEATS_TO_PROPOSE, range: COURT_PROPOSE_RANGE }
  }

  canPropose() {
    const c = this._s.family.court
    if (!c?.target) return { ok: false, reason: 'no_target' }
    if (c.beat) return { ok: false, reason: 'pending' }
    if (c.meetings < COURT_BEATS_TO_PROPOSE) return { ok: false, reason: 'meetings', left: COURT_BEATS_TO_PROPOSE - c.meetings }
    return { ok: true, chance: this.proposeChance().total }
  }

  propose() {
    const chk = this.canPropose()
    if (!chk.ok) return chk
    const s = this._s, f = s.family, c = f.court, t = c.target
    if (Math.random() < chk.chance) {
      const spouse = this._wed(t, AFFECTION_START + (c.interest - 50) * COURT_AFFECTION_CARRY)
      this._recalc(); this._notify()
      this._emit('married', { spouse: spouse.given })
      return { ok: true, accepted: true, chance: chk.chance, spouse }
    }
    f.spurned.push({ person: { ...t, role: 'spurned' }, interest: Math.round(c.interest), year: this._yr() })
    if (f.spurned.length > SPURNED_MAX) f.spurned.shift()
    f.court = null
    f.seekCooldownAt = this._cdNow() + COURT_SEEK_COOLDOWN_SECS
    this.addEvent({ text: `${Persons.fullName(t)} hears your proposal out, and gently declines. The road stretches on.`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true, accepted: false, chance: chk.chance }
  }

  withdrawCourtship() {
    const s = this._s, f = s.family, c = f.court
    if (!c) return { ok: false, reason: 'no_court' }
    if (c.target) {
      this.addEvent({ text: `You stop calling on ${Persons.fullName(c.target)}.`, type: 'neutral' })
      f.seekCooldownAt = this._cdNow() + COURT_SEEK_COOLDOWN_SECS
    }
    f.court = null
    this._notify()
    return { ok: true }
  }

  // Spouse actions ───────────────────────────────────────────────────────────
  // kind: time | gift | dual. Preview fields: qi (cost), stones, aff (expected delta), qiGain + risk (dual).
  spouseActionPreview(kind) {
    const s = this._s, f = s.family, sp = f.spouse, def = SPOUSE_ACTIONS[kind]
    if (!sp) return { ok: false, reason: 'no_spouse' }
    if (!def) return { ok: false, reason: 'invalid' }
    const out = { ok: true, kind }
    const ready = f.spouseCd[kind]
    if (this._cdLeft(ready)) Object.assign(out, { ok: false, reason: 'cooldown', secsLeft: this._cdLeft(ready) })
    if (def.qiFrac) out.qi = this._qiSlice(def.qiFrac)
    if (def.stones) out.stones = this.familyCost({ cost: { stones: def.stones } })
    if (def.aff) out.aff = this._keyed(def.aff, sp.personality)
    if (kind === 'dual') {
      out.qiGainFrac = Math.max(DUAL_QI_RANGE[0], Math.min(DUAL_QI_RANGE[1], DUAL_QI_BASE + DUAL_QI_PER_STAGE * (sp.stageIndex - s.stageIndex)))
      out.qiGain = this._qiSlice(out.qiGainFrac)
      out.risk = Math.max(DUAL_RISK_RANGE[0], Math.min(DUAL_RISK_RANGE[1], (DUAL_SAFE_AFFECTION - f.affection) / 100))
      out.aff = DUAL_AFFECTION
    }
    if (out.ok && out.qi && s.qi < out.qi) Object.assign(out, { ok: false, reason: 'qi' })
    if (out.ok && out.stones && s.spiritStones < out.stones) Object.assign(out, { ok: false, reason: 'stones' })
    return out
  }

  spouseAction(kind) {
    const p = this.spouseActionPreview(kind)
    if (!p.ok) return p
    const s = this._s, f = s.family, sp = f.spouse, yr = this._yr()
    f.spouseCd[kind] = this._cdNow() + SPOUSE_ACTIONS[kind].cdSecs
    if (p.qi) s.qi = Math.max(0, s.qi - p.qi)
    if (p.stones) s.spiritStones -= p.stones
    let res = { ok: true, kind }
    if (kind === 'time') {
      const d = this._changeAffection(p.aff, 'time spent together')
      this.addEvent({ text: `Year ${yr}: you set cultivation aside for a season with ${sp.given}. (affection ${d >= 0 ? '+' : ''}${Math.round(d)})`, type: 'positive' })
      res.aff = d
    } else if (kind === 'gift') {
      const d = this._changeAffection(p.aff, 'a gift')
      this.addEvent({ text: `Year ${yr}: you bring ${sp.given} a gift from the market. (affection ${d >= 0 ? '+' : ''}${Math.round(d)})`, type: 'positive' })
      res.aff = d
    } else if (kind === 'dual') {
      if (Math.random() < p.risk) {
        const dv = DUAL_DEVIATION
        this._applyFamilyEffect({ health: dv.health, integrity: dv.integrity })
        const d = this._changeAffection(dv.aff, 'a dual cultivation gone wrong')
        this.addEvent({ text: `Year ${yr}: your meridians and ${sp.given}'s will not align — the Qi turns on you both. (Health ${dv.health}, Integrity ${dv.integrity}, affection ${Math.round(d)})`, type: 'negative' })
        res = { ...res, deviation: true, aff: d }
      } else {
        if (isFinite(s.derived.qiCap)) s.qi = Math.min(s.derived.qiCap, s.qi + p.qiGain)
        const d = this._changeAffection(p.aff, 'dual cultivation')
        this.addEvent({ text: `Year ${yr}: you and ${sp.given} cultivate as one; your Qi deepens. (+${Math.round(p.qiGainFrac * 100)}% of capacity, affection +${Math.round(d)})`, type: 'positive' })
        res = { ...res, deviation: false, qiGain: p.qiGain, aff: d }
      }
    }
    this._recalc(); this._notify()
    return res
  }

  // Try for a child with your spouse — any Family Planning. A Cold spouse refuses (and says so).
  tryChildPreview() {
    const s = this._s, f = s.family
    if (!f.spouse) return { ok: false, reason: 'no_spouse' }
    if (f.expecting.some(e => e.partnerId === f.spouse.id)) return { ok: false, reason: 'expecting' }
    if (this._cdLeft(f.childTryAt)) return { ok: false, reason: 'cooldown', secsLeft: this._cdLeft(f.childTryAt) }
    if (f.affection < AFFECTION_CRISIS) return { ok: false, reason: 'cold' }
    return { ok: true }
  }

  tryForChild() {
    const p = this.tryChildPreview()
    const s = this._s, f = s.family
    if (!p.ok) {
      if (p.reason === 'cold') { this.addEvent({ text: `${f.spouse.given} turns away. "Not like this. Not now."`, type: 'negative' }); this._notify() }
      return p
    }
    this._conceive(f.spouse)
    if (f.childWish?.partnerId === f.spouse.id) f.childWish = null
    this._recalc(); this._notify()
    return { ok: true }
  }

  _conceive(partner) {
    const s = this._s, f = s.family
    f.expecting.push({ partnerId: partner.id, dueYear: s.world.year + PREGNANCY_YEARS })
    f.childTryAt = this._cdNow() + CHILD_TRY_GAP_SECS
    // The partner's own timer restarts from now (whatever the plan).
    const interval = this._childInterval()
    if (interval) {
      if (f.spouse?.id === partner.id) f.nextChildYear = s.world.year + this._randRange(interval)
      const lover = f.lovers.find(l => l.person.id === partner.id)
      if (lover) lover.nextChildYear = s.world.year + this._randRange(interval)
    }
    this.addEvent({ text: `Year ${this._yr()}: ${Persons.fullName(partner)} is with child. The birth is due within the year.`, type: 'special' })
  }

  // Answer a partner's wish for a child ('ask' plan). No → the wish passes; the partner may be hurt.
  answerChildWish(yes) {
    const s = this._s, f = s.family, w = f.childWish
    if (!w) return { ok: false, reason: 'no_wish' }
    const partner = this._partnerById(w.partnerId, true)
    f.childWish = null
    if (!partner) { this._notify(); return { ok: false, reason: 'gone' } }
    if (yes) {
      this._conceive(partner)
    } else {
      const interval = this._childInterval() || CHILD_INTERVAL_BY_PLAN.ask
      const next = s.world.year + this._randRange(interval)
      let d = 0
      if (f.spouse?.id === partner.id) { f.nextChildYear = next; d = this._changeAffection(this._keyed(CHILD_WISH_DECLINE_AFF, partner.personality), 'you said not now to a child') }
      else { const l = f.lovers.find(x => x.person.id === partner.id); if (l) l.nextChildYear = next }
      this.addEvent({ text: `You tell ${partner.given}: not now.${d ? ` (affection ${Math.round(d)})` : ''}`, type: 'neutral' })
    }
    this._recalc(); this._notify()
    return { ok: true, yes: !!yes }
  }

  // Delegated plans (some/many): skip the next scheduled birth with your spouse — one more interval.
  postponeChild() {
    const s = this._s, f = s.family, interval = this._childInterval()
    if (!f.spouse || f.planning === 'ask' || !interval || f.nextChildYear == null) return { ok: false, reason: 'nothing_scheduled' }
    f.nextChildYear = Math.max(f.nextChildYear, s.world.year) + this._randRange(interval)
    this.addEvent({ text: `You and ${f.spouse.given} agree: not yet.`, type: 'neutral' })
    this._notify()
    return { ok: true, nextYear: Math.ceil(f.nextChildYear) }
  }

  // Leave your spouse by choice. Children you share with them take it hard.
  separateFromSpouse() {
    const s = this._s, f = s.family, sp = f.spouse
    if (!sp) return { ok: false, reason: 'no_spouse' }
    for (const c of this._homeChildren()) if ((c.parents || []).includes(sp.id)) c.bond = Math.max(0, c.bond + SEPARATE_CHILD_BOND)
    this._spouseEnds('divorced', `you and ${Persons.fullName(sp)} part ways. The marriage is over.`)
    this._recalc(); this._notify()
    return { ok: true }
  }

  // Raising a child ──────────────────────────────────────────────────────────
  // kind: time | teach | gift. Preview: qi, stones, bond (expected), xp, morality (expected shift), minAge.
  childActionPreview(childId, kind) {
    const s = this._s, c = s.family.children.find(x => x.id === childId), def = CHILD_ACTIONS[kind]
    if (!c || !def) return { ok: false, reason: 'unknown' }
    if (!c.alive || c.estranged) return { ok: false, reason: 'gone' }
    const age = this._childAge(c)
    const out = { ok: true, kind, bond: this._keyed(def.bond, c.personality) }
    const minAge = kind === 'teach' ? TEACH_MIN_AGE : kind === 'gift' ? GIFT_MIN_AGE : kind === 'temper' ? TEMPER_MIN_AGE : 0
    if (def.qiFrac) out.qi = this._qiSlice(def.qiFrac)
    if (def.stones) out.stones = this.familyCost({ cost: { stones: def.stones } })
    if (def.xp) out.xp = def.xp
    if (def.items) out.items = Object.entries(def.items).map(([id, n]) => ({ id, n, name: ITEMS[id]?.name || id, have: s.inventory[id] || 0 }))   // Phase 14: temper
    if (kind === 'temper') { out.bodyTier = c.bodyTier || 0; out.maxed = (c.bodyTier || 0) >= CHILD_BODY.maxTier; out.bodyXp = c.bodyXp || 0; out.perTier = CHILD_BODY.perTier }
    if (kind === 'teach') out.morality = Math.round((this._selfMorality() - (c.morality ?? 0)) * TEACH_MORALITY_PULL)
    if (kind === 'gift' && def.spoil?.[c.personality]) out.morality = def.spoil[c.personality]
    const ready = c.cd?.[kind]
    if (age < minAge) return { ...out, ok: false, reason: 'young', minAge }
    if (this._cdLeft(ready)) return { ...out, ok: false, reason: 'cooldown', secsLeft: this._cdLeft(ready) }
    if (out.qi && s.qi < out.qi) return { ...out, ok: false, reason: 'qi' }
    if (out.stones && s.spiritStones < out.stones) return { ...out, ok: false, reason: 'stones' }
    if (out.maxed) return { ...out, ok: false, reason: 'maxed' }
    if (out.items?.some(x => x.have < x.n)) return { ...out, ok: false, reason: 'items' }
    return out
  }

  childAction(childId, kind) {
    const p = this.childActionPreview(childId, kind)
    if (!p.ok) return p
    const s = this._s, c = s.family.children.find(x => x.id === childId), def = CHILD_ACTIONS[kind]
    c.cd = c.cd || {}; c.raised = c.raised || { time: 0, teach: 0, gift: 0 }
    c.cd[kind] = this._cdNow() + def.cdSecs
    c.raised[kind] = (c.raised[kind] || 0) + 1
    if (p.qi) s.qi = Math.max(0, s.qi - p.qi)
    if (p.stones) s.spiritStones -= p.stones
    for (const x of p.items || []) { s.inventory[x.id] -= x.n; if (s.inventory[x.id] <= 0) delete s.inventory[x.id] }
    let bodyUp = false
    if (kind === 'temper') {   // Phase 14: their body hardens; every CHILD_BODY.perTier sessions, a tier
      c.bodyXp = (c.bodyXp || 0) + CHILD_BODY.perSession
      const t = Math.min(CHILD_BODY.maxTier, Math.floor(c.bodyXp / CHILD_BODY.perTier))
      if (t > (c.bodyTier || 0)) { c.bodyTier = t; bodyUp = true }
    }
    const before = c.bond
    c.bond = Math.max(0, Math.min(100, c.bond + p.bond))
    if (p.morality) c.morality = Math.max(-100, Math.min(100, (c.morality ?? 0) + p.morality))
    if (p.xp) {
      c.xp += p.xp
      // Before awakening it's a head start (banked, at most one stage); after, it's real progress.
      if (this._childAge(c) >= AWAKENING_AGE) this._growChild(c, Math.min(SPOUSE_STAGE_CAP, s.stageIndex))
      else c.xp = Math.min(c.xp, 1)
    }
    const d = Math.round(c.bond - before)
    const text = { time: `you spend a season with ${c.given}`, teach: `you teach ${c.given} your art`,
                   gift: `you give ${c.given} pills and spirit stones`,
                   temper: `you drill ${c.given} until their arms shake${bodyUp ? `: their body hardens into a ${BODY_TIERS[c.bodyTier].name}` : ''}` }[kind]
    this.addEvent({ text: `Year ${this._yr()}: ${text}. (${c.given}: bond ${d >= 0 ? '+' : ''}${d})`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, bond: c.bond, delta: d }
  }

  // ── family-events.js: you may lay a hand on your own child (the mirror of "A father's hand") ──────
  _kidFill(str, name) { return String(str || '').replace(/\{name\}/g, name) }

  abuseChildPreview(childId) {
    const s = this._s, c = s.family.children.find(x => x.id === childId)
    if (!c || !c.alive || c.estranged) return { ok: false, reason: 'gone' }
    const age = this._childAge(c)
    if (age < CHILD_ABUSE_MIN_AGE) return { ok: false, reason: 'young', minAge: CHILD_ABUSE_MIN_AGE }
    if (this._cdLeft(c.cd?.harsh)) return { ok: false, reason: 'cooldown', secsLeft: this._cdLeft(c.cd.harsh) }
    return { ok: true, bond: this._keyed(CHILD_ABUSE_BOND, c.personality), karma: CHILD_ABUSE_KARMA, hits: c.abuse?.hits || 0 }
  }

  // A deliberate act, never simulated. Bond falls by the child's personality; karma falls; 2 hits scar them.
  abuseChild(childId) {
    const p = this.abuseChildPreview(childId)
    if (!p.ok) return p
    const s = this._s, c = s.family.children.find(x => x.id === childId)
    c.cd = c.cd || {}; c.cd.harsh = this._cdNow() + CHILD_ABUSE_CD_SECS
    c.abuse = c.abuse || { hits: 0, grudge: 0, settled: false }
    c.abuse.hits++
    c.abuse.grudge = Math.min(CHILD_ABUSE_GRUDGE_MAX, (c.abuse.grudge || 0) + 1)
    const delta = this._keyed(CHILD_ABUSE_BOND, c.personality)
    c.bond = Math.max(0, Math.min(100, c.bond + delta))
    if (c.abuse.hits >= CHILD_ABUSE_TRAUMA_AT) c.trauma = true
    this._applyFamilyEffect({ karma: CHILD_ABUSE_KARMA })
    const reaction = this._kidFill(CHILD_ABUSE_REACTIONS[c.personality] || CHILD_ABUSE_REACTIONS.default, c.given)
    this.addEvent({ text: `Year ${this._yr()}: you raise a hand to ${c.given}. (${c.given}: bond ${delta >= 0 ? '+' : ''}${delta}) ${reaction}`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true, bond: c.bond, delta, hits: c.abuse.hits, trauma: !!c.trauma }
  }

  // The grown child's reckoning — the mirror of yours. Grown, and hit enough times.
  childReckoningInfo() {
    const s = this._s
    return (s.family.children || []).find(c => c.alive && !c.estranged && c.abuse && c.abuse.hits >= CHILD_RECKON_MIN_HITS &&
      !c.abuse.settled && this._childAge(c) >= ADULT_AGE) || null
  }

  resolveChildReckoning(childId, kind) {
    const s = this._s, c = s.family.children.find(x => x.id === childId)
    if (!c || !c.abuse) return { ok: false, reason: 'none' }
    c.abuse.settled = true
    if (kind === 'accept') {
      this._applyFamilyEffect({ health: CHILD_RECKON_HEALTH, karma: 4 })   // you take the blow; never lethal
      c.bond = Math.max(0, Math.min(100, c.bond + 15)); c.abuse.grudge = 0
    } else {
      this._applyFamilyEffect({ karma: -4 })
      c.bond = Math.max(0, c.bond - 25)
      if (c.bond <= 0) c.estranged = true     // they leave the house for good
    }
    const choice = CHILD_RECKONING_CHOICES.find(x => x.id === kind) || CHILD_RECKONING_CHOICES[0]
    this.addEvent({ text: `Year ${this._yr()}: ${this._kidFill(choice.result, c.given)}`, type: kind === 'accept' ? 'special' : 'negative' })
    this._recalc(); this._notify()
    return { ok: true, bond: c.bond }
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
  // spare (1.8b-3b): indexes into pairs whose loser you spare in a lethal round — they live, disgraced and estranged.
  fightTournamentRound(pairs, spare = []) {
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
    const spared = new Set((Array.isArray(spare) ? spare : []).map(Number))
    let deathsThisRound = 0
    for (const [pi, [ia, ib]] of pairs.entries()) {
      const a = kid(ia), b = kid(ib)
      const pa = this._fightPower(a), pb = this._fightPower(b)
      const aWins = Math.random() < 1 / (1 + Math.exp(-(pa - pb) / TOURNAMENT_SPREAD))
      const win = aWins ? a : b, lose = aWins ? b : a
      let died = false, yielded = false, sparedNow = false
      if (lethal) {
        if (lose.personality === 'coward' && Math.random() < TOURNAMENT_COWARD_YIELD) yielded = true
        else if (spared.has(pi)) {   // 1.8b-3b: your mercy — they live, but leave the house in disgrace
          sparedNow = true
          lose.estranged = true; lose.leftYear = yr; lose.spared = true
          lose.bond = Math.max(0, Math.min(100, lose.bond + TOURNAMENT_SPARE_BOND))
        } else {
          deathsThisRound++
          died = true
          lose.alive = false; lose.diedYear = yr; lose.cause = 'tournament'
          f.tally.tournamentDeaths++
          s.karma = Math.max(0, s.karma + TOURNAMENT_KARMA_PER_DEATH)
          if (f.spouse && (lose.parents || []).includes(f.spouse.id)) this._changeAffection(TOURNAMENT_SPOUSE_AFFECTION_PER_DEATH, `${lose.given} died in the tournament`)
        }
      }
      t.pool = t.pool.filter(id => id !== lose.id)
      t.eliminated.push({ id: lose.id, round: t.round, died, yielded, spared: sparedNow, stage: lose.stageIndex })
      t.fightsDone++
      const how = died ? `${lose.given} falls and does not rise` : sparedNow ? `you stay the killing blow; ${lose.given} leaves the house in disgrace` : yielded ? `${lose.given} throws down their sword and yields` : `${lose.given} is beaten`
      const text = `Round ${t.round}: ${Persons.fullName(win)} defeats ${Persons.fullName(lose)} — ${how}.`
      this.addEvent({ text, type: died ? 'negative' : 'neutral' })
      results.push({ a: ia, b: ib, winner: win.id, loser: lose.id, died, yielded, spared: sparedNow, text })
    }
    if (lethal && deathsThisRound > 0) {   // 1.8b-3b: only a round with a death marks the survivors
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

  // Chance to win a duel against your spouse: the move-fight estimate (1.14a; was 0.5 ± 0.08 per stage).
  duelChance() {
    const sp = this._s.family.spouse
    return sp ? this.personFightOdds(sp, 'duel', true).chance : 0
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
    // 1.8b-3b: the duel is fought on the battle page — your moves, not a roll (on the move engine since 1.14a).
    const chance = this.duelChance()
    this._startFight('duel', f.spouse, true)
    return { ok: true, fight: true, chance }
  }

  _duelOutcome(won, yielded) {
    const s = this._s, f = s.family, name = Persons.fullName(f.spouse)
    if (yielded) {
      f.tally.fled++
      this._spouseEnds('left', `you throw down your sword. ${name} spares you, and walks out of your life.`)
      this._recalc(); this._notify()
      return 'fled'
    }
    if (won) {
      f.tally.duelWon++
      s.health = Math.max(1, (s.health ?? 100) - DUEL_WIN_HEALTH_COST)
      this._spouseEnds('duel', `the duel ends in the courtyard. ${name} does not rise. You carry the wound, and the silence.`)
      this._recalc(); this._notify()
      return 'won'
    }
    f.tally.duelLost++
    this.addEvent({ text: `Year ${Math.floor(s.world.year)}: ${name}'s blade is faster. Your path ends in your own courtyard.`, type: 'negative' })
    this._die('spouse_duel')
    return 'lost'
  }

  // ── 1.8b-3b (family.md): your own fights, on the battle page ───────────────
  // kind: 'duel' (your spouse) · 'challenge' (you called out the head) · 'defend' (you hold the seat) · 'stepdown' ·
  // 'arena' · 'slaughter' · 'beast'. Every kind is fought on moves (fi.m, Phase 42b/c): a person's battle is built here;
  // a beast's comes in `extra` ({ stance, beast, power, over, m }).
  _startFight(kind, opp, lethal, extra = null) {
    const s = this._s, f = s.family
    f.fight = { kind, oppId: opp.id, lethal: !!lethal, round: 1, log: [], year: Math.floor(s.world.year), ...(extra || {}) }
    if (kind !== 'beast' && !f.fight.m) f.fight.m = this._mbNewPerson(opp, !!lethal)
    this._emit('fight_start', { kind, lethal: !!lethal })
    this._notify()
  }

  // Expected (luck-free) fight power — the odds you are shown; the old roll added ± TOURNAMENT_LUCK around it.
  _expectedPower(c) { return (c.stageIndex || 0) * 100 + Math.round((c.root?.mult || 1) * 10) + (TOURNAMENT_PERSONALITY_POWER[c.personality] || 0) }
  _powerChance(a, b) { return 1 / (1 + Math.exp(-(this._expectedPower(a) - this._expectedPower(b)) / TOURNAMENT_SPREAD)) }

  _fightOpp() {
    const f = this._s.family, fi = f.fight
    if (!fi) return null
    if (fi.kind === 'beast') return this._beastOpp(fi.beast, fi.oppId)
    if (fi.kind === 'boss') return this._bossOpp(fi)   // v1 add-on
    if (fi.kind === 'arena') return this._s.arena?.duelists?.[fi.oppId] || null   // A6-3b: the Arena's own duelists
    if (fi.kind === 'slaughter') return fi.foe || null                            // A6-3a: a road stranger (never in the world registry)
    if (fi.kind === 'spar') return fi.foe || null                                 // 43h: a disciple of another sect
    return fi.kind === 'duel' ? f.spouse : this.person(fi.oppId)
  }

  // ── A6-3a (combat.md): your fights with people — odds, memory, the end choice ──
  // A fighter's luck-free power, term by term (the same total as _expectedPower), plus a grudge against you.
  _personPowerParts(p, self = false) {
    const stage = p.stageIndex || 0, sn = typeof stageShortName === 'function' ? stageShortName(stage) : 'stage ' + stage
    const parts = [{ label: `${self ? 'Your' : 'Their'} realm (${sn})`, value: stage * 100 },
      { label: `${self ? 'Your' : 'Their'} spirit root`, value: Math.round((p.root?.mult || 1) * 10) }]
    const temper = TOURNAMENT_PERSONALITY_POWER[p.personality] || 0
    if (temper) parts.push({ label: `${self ? 'Your' : 'Their'} temper (${PERSONALITIES.find(x => x.id === p.personality)?.name || p.personality})`, value: temper })
    const bt = BODY_TIERS[Math.max(0, Math.min(BODY_TIERS.length - 1, self ? (this._s.body?.tier || 0) : (p.bodyTier || 0)))]   // Phase 14: the body
    if (bt.power) parts.push({ label: `${self ? 'Your' : 'Their'} body (${bt.name})`, value: bt.power })
    if (!self && (p.feud === 'grudge' || (p.feud?.pid && p.feud.pid === this._s.self?.id))) parts.push({ label: 'Their grudge against you', value: FEUD_POWER })   // 4.9: sworn against you counts too
    return { parts, total: parts.reduce((a, x) => a + x.value, 0) }
  }

  // The odds of a fight with a person (the family cards, Arena rows, the battle page + the breakdown card): since 1.14a a
  // Monte Carlo of the move fight itself (your loadout + Health + parry rate vs their arts), like a beast's. `lethal`
  // defaults to the live fight's, else the kind's usual stakes. The power parts are what sets how hard blows land.
  personFightOdds(opp, kind, lethal = null) {
    if (!opp) return null
    const fi = this._s.family?.fight
    const L = lethal ?? (fi && fi.oppId === opp.id && fi.kind === kind ? fi.lethal : kind === 'duel' || kind === 'slaughter')
    const est = this._personEstimate(opp, L)
    const you = this._personPowerParts(this._selfAsPerson(), true), them = this._personPowerParts(opp)
    return { you, them, chance: est.chance, est, lethal: L, duel: kind === 'duel' }
  }

  personRecord(p) { return { fought: 0, youWon: 0, theyWon: 0, spared: 0, raised: 0, humbled: 0, movesSeen: [], els: {}, ...(p?.vsYou || {}) } }
  _noteVsYou(p, field) {
    if (!p) return
    p.vsYou = this.personRecord(p)
    p.vsYou.fought++
    if (field) p.vsYou[field]++
  }

  _fightStyle(opp) { return opp?.beast ? this._beastStyle(opp.typeId, opp.traits) : FIGHT_STYLE[opp?.personality] || FIGHT_STYLE.default }

  // Chance they accept your yield in a lethal fight (always accepted when the fight isn't to the death).
  _yieldAccept(opp) {
    const f = this._s.family, fi = f.fight
    if (!fi.lethal) return 1
    let a = YIELD_ACCEPT_BASE + (opp?.morality ?? 0) / 100
    if (fi.kind === 'duel') a += (f.affection - 50) / 200
    else if (fi.kind === 'challenge') a += (this._bondWithHead(opp) - 50) / 200
    if (opp?.feud === 'debt') a += FEUD_YIELD                   // A6-3a: they owe you / they hate you
    else if (opp?.feud === 'grudge' || (opp?.feud?.pid && opp.feud.pid === this._s.self?.id)) a -= FEUD_YIELD   // 4.9: an avenger too
    return Math.max(0.05, Math.min(0.95, a))
  }

  // What the battle page shows: the move battle (fi.m), how they fight once you know it, the stakes.
  fightInfo() {
    const f = this._s.family, fi = f.fight
    if (!fi) return null
    if (fi.kind === 'boss') {   // v1 add-on: a legendary boss — its phase, the Wraith's read, what you know of it
      const def = BOSSES[fi.boss.id], B = fi.m?.boss || {}
      return { kind: 'boss', opp: this._bossOpp(fi), lethal: false, m: fi.m || null, over: fi.over || null, health: this._s.health ?? 100, habitsKnown: true,
        boss: { id: def.id, name: def.name, short: def.short, phase: B.phase || 0, phases: def.phases.map(p => ({ name: p.name, text: p.text, at: p.at })),
          egg: B.egg || 0, split: !!B.split, read: B.read || 0, hatched: !!B.hatched, stolen: B.stolen || null, learn: B.learn || 0 }, log: [...(fi.log || [])] }
    }
    const opp = this._fightOpp(), style = this._fightStyle(opp)
    const beast = fi.kind === 'beast'
    if (!beast && !fi.m && !fi.over && opp) this._personFightM(fi)       // an old-engine fight restarts on moves
    // A beast's habits are unknown until you have fought one of its kind; a person's until you have fought them.
    const known = beast ? !!this._s.bestiary?.[fi.beast.typeId]?.habitsKnown : this.personRecord(opp).fought > 0
    const out = { kind: fi.kind, opp, lethal: fi.lethal, round: fi.round, m: fi.m || null, over: fi.over || null, health: this._s.health ?? 100,
             hint: known ? style.hint : null, habitsKnown: known, yieldAccept: beast ? 1 : this._yieldAccept(opp), log: [...fi.log] }
    if (beast) Object.assign(out, { beast: { ...fi.beast }, stance: fi.stance,
      wound: this._beastWound(fi.beast, fi.stance), lossWound: this._beastLossWound(fi.beast, fi.stance), power: fi.power })
    else Object.assign(out, { record: this.personRecord(opp),
      // a registry person's feud is an object (4.4); one sworn against you reads as the old fights' grudge
      feud: typeof opp?.feud === 'string' ? opp.feud : opp?.feud?.pid === this._s.self?.id ? 'grudge' : null,
      bracket: this._bracketInfo(), scout: this.personScouting(opp), road: fi.road || null })   // 4.9: the card a road fight came from
    if (fi.kind === 'arena') {                                     // A6-3b: the ring, the purse, what this win would add
      const A = this._s.arena, R = ARENA_RINGS.find(r => r.id === fi.arena?.ringId)
      out.arena = { ...fi.arena, ring: R, purse: A.run?.purse || 0, streak: A.run?.streak || 0,
        prize: R ? this._arenaPrize(R, !!fi.arena?.champion, !!fi.arena?.blood, A.run?.streak || 0, !!fi.arena?.callout) : 0,
        keep: Math.floor((A.run?.purse || 0) * ARENA_LOSS_KEEP) }
    }
    return out
  }

  fightExchange(tactic) {
    const s = this._s, f = s.family, fi = f.fight
    if (!fi) return { ok: false, reason: 'no_fight' }
    const opp = this._fightOpp()
    if (!opp) { f.fight = null; this._notify(); return { ok: false, reason: 'no_opponent' } }
    if (fi.over) return { ok: false, reason: 'decide' }         // a won fight waits for its end choice (beast or person)
    // Phase 42b/c: every fight is on moves (fightMove / fightParry); this call only ends one — a beast's Retreat, a Yield.
    if (fi.kind === 'beast') {
      if (tactic === 'retreat' || tactic === 'yield') return this._beastRetreat(fi, opp)
      return { ok: false, reason: 'moves' }
    }
    if (fi.kind === 'boss') {   // v1 add-on: break away — no parting blow, it rests and you learn
      if (fi.m?.pending) return { ok: false, reason: 'parry' }
      if (tactic === 'retreat' || tactic === 'yield') return { ok: true, done: true, retreated: true, outcome: this._bossLost(fi, true) }
      return { ok: false, reason: 'moves' }
    }
    if (fi.m?.pending) return { ok: false, reason: 'parry' }
    if (tactic === 'yield') {
      if (Math.random() < this._yieldAccept(opp)) {
        f.fight = null
        return { ok: true, done: true, yielded: true, outcome: this._finishFight(fi, opp, false, true), ...this._afterBoutInfo() }
      }
      fi.log.push({ round: fi.m?.turn || fi.round, yieldRefused: true })
      if (fi.m) fi.m.lines.push({ turn: fi.m.turn, who: 'you', text: `You offer to yield. ${opp.given} refuses: this ends with one of you.`, tone: 'down' })
      this.addEvent({ text: `You lower your blade — ${opp.given} does not. This ends with one of you.`, type: 'negative' })
      this._notify()
      return { ok: true, done: false, refused: true }
    }
    return { ok: false, reason: 'moves' }
  }

  // Applies the outcome of each fight kind. `died` = the loser does not rise: a lethal loss for you, or your Finish.
  _finishFight(fi, opp, won, yielded, died = !won && fi.lethal && !yielded) {
    this._noteVsYou(opp, won ? 'youWon' : 'theyWon')
    if (opp && !died) this._rivalTrain(opp)                      // 1.14b: a grudge-holder trains against your favourite element
    if (fi.kind === 'duel') return this._duelOutcome(won, yielded)
    const me = this._selfAsPerson()
    const res = won ? { winner: me, loser: opp, died, yielded: false } : { winner: opp, loser: me, died, yielded }
    if (fi.kind === 'stepdown') return this._stepdownBoutEnd(fi, opp, res)
    if (fi.kind === 'arena') return this._arenaBoutEnd(fi, opp, res)
    if (fi.kind === 'slaughter') return this._slaughterOutcome(fi, opp, res)
    if (fi.kind === 'sectmaster') return this._sectmasterOutcome(opp, fi.lethal, res)   // Phase 43e
    if (fi.kind === 'spar') return this._sparOutcome(fi, opp, res)                         // Phase 43h
    if (fi.kind === 'road') return this._roadFightOutcome(fi, opp, res)                    // 4.9: an encounter's fight
    const clan = this._playerClan()
    return fi.kind === 'challenge' ? this._challengeOutcome(clan, opp, fi.lethal, res) : this._defendOutcome(clan, opp, fi.lethal, res)
  }

  // After a won fight: what the end step offers. Lethal → finish / spare; until one yields → raise / humble. The
  // reaction each would leave is read from their temper (shown to you: tempers are known).
  personFightChoices() {
    const f = this._s.family, fi = f.fight
    if (!fi || fi.kind === 'beast' || fi.over !== 'won') return null
    const opp = this._fightOpp(), pid = opp?.personality
    const react = T => T[pid] || T.default
    const ids = fi.lethal ? ['finish', 'spare'] : ['raise', 'humble']
    const karma = { finish: fi.kind === 'duel' || (fi.kind === 'road' && fi.road?.kind === 'ambush') ? 0 : fi.kind === 'arena' ? ARENA_KILL_KARMA : CHALLENGE_KARMA_DEATH, spare: SPARE_KARMA, raise: 0, humble: 0 }
    // 1.14b: raising one who will owe you → they teach you one of their arts; finishing → their manual may drop
    const reaction = { spare: react(SPARE_REACTION), raise: react(RAISE_REACTION), humble: react(HUMBLE_REACTION) }
    const teachable = opp && !opp.beast ? this._teachableArts(opp) : []
    return { kind: fi.kind, lethal: fi.lethal, ids, name: opp?.given, begs: fi.lethal && pid === 'coward', reaction, karma,
      teach: reaction.raise === 'debt' && teachable.length > 0, finishManual: opp && !opp.beast && this._lootableArts(opp).length ? PERSON_FINISH_MANUAL : 0,
      quietYears: fi.kind === 'arena' || fi.kind === 'road' ? null : HUMBLE_QUIET_YEARS, bracket: this._bracketInfo(),
      arena: fi.kind === 'arena' ? { ...fi.arena, renownHumble: ARENA_RENOWN.humble } : null }
  }

  // Your end choice after a won fight with a person. Returns { ok, choice, outcome, feud, next? } — `next` = a step-down
  // bracket paused on your next bout (a new f.fight is already set).
  personFightFinish(choice) {
    const s = this._s, f = s.family, fi = f.fight
    const ch = this.personFightChoices()
    if (!ch) return { ok: false, reason: 'no_choice' }
    if (!ch.ids.includes(choice)) return { ok: false, reason: 'bad_choice' }
    const opp = this._fightOpp(), yr = Math.floor(s.world.year)
    f.fight = null
    let feud = null
    if (choice !== 'finish') {
      feud = ch.reaction[choice]
      if (opp && fi.kind !== 'road') opp.feud = feud   // 4.9: a registry person's feud is an object; the road keeps the choice
      if (fi.kind === 'road') fi.roadChoice = choice
      if (choice === 'spare') { s.karma = Math.min(100, s.karma + SPARE_KARMA); if (opp) opp.vsYou = { ...this.personRecord(opp), spared: this.personRecord(opp).spared + 1 } }
      if (choice === 'raise' && opp) opp.vsYou = { ...this.personRecord(opp), raised: this.personRecord(opp).raised + 1 }
      if (choice === 'humble') {
        if (opp) opp.vsYou = { ...this.personRecord(opp), humbled: this.personRecord(opp).humbled + 1 }
        if (fi.kind === 'arena') s.arena.renown += ARENA_RENOWN.humble   // the crowd loves it; the clan never saw it
        else if (fi.kind !== 'spar' && fi.kind !== 'sectmaster' && fi.kind !== 'road') f.cowedUntilYear = yr + Math.round(this._randRange(HUMBLE_QUIET_YEARS))   // (43e/h: not a clan matter)
      }
      const said = { spare: `You lower your blade and let ${opp?.given} live.`, raise: `You offer ${opp?.given} your hand and help them up.`,
        humble: `You leave ${opp?.given} in the dust before the whole clan.` }[choice]
      this.addEvent({ text: `${said} ${feud === 'debt' ? 'They will remember they owe you.' : 'They will not forget it.'}`, type: feud === 'debt' ? 'positive' : 'negative' })
    }
    // 1.14b: what the choice brings in arts (the world picks which art; taking it is the choice you just made)
    let art = null
    if (opp && choice === 'raise' && feud === 'debt') {
      const t = this._teachableArts(opp)
      if (t.length) { art = t[Math.floor(Math.random() * t.length)]; this._grantManual(art, `from ${opp.given}, who writes it out for you in thanks`) }
    } else if (opp && choice === 'finish' && Math.random() < PERSON_FINISH_MANUAL) {
      const l = this._lootableArts(opp)
      if (l.length) { art = l[Math.floor(Math.random() * l.length)]; this._grantManual(art, `on ${opp.given}'s body`) }
    }
    let outcome
    if (fi.kind === 'duel' && choice === 'spare') {              // the spouse duel, spared: they leave you, alive
      this._noteVsYou(opp, 'youWon')
      f.tally.duelWon++
      s.health = Math.max(1, (s.health ?? 100) - DUEL_WIN_HEALTH_COST)
      this._spouseEnds('left', `${Persons.fullName(opp)} kneels in the courtyard, beaten. You sheathe your blade; they gather what they own and go.`)
      this._recalc(); this._notify()
      outcome = 'spared'
    } else outcome = this._finishFight(fi, opp, true, false, choice === 'finish')
    this._emit('fight_end', { kind: fi.kind, choice })
    return { ok: true, choice, outcome, feud, art, ...this._afterBoutInfo() }
  }

  // ── A6-3b (docs/systems/combat.md → "A6-3b"): the Arena ────────────────────
  // Six rings by realm, each with a roster of duelists + a champion (person records kept in s.arena.duelists, per life).
  // A run: pay the entry fee, fight bout after bout (f.fight kind 'arena'); each win adds to the purse (prize × streak ×
  // renown × blood); walk away to be paid, lose to keep half, lose a blood match to die. The A6-3a end choices apply.

  _blankArena() {
    return { run: null, duelists: {}, rings: {}, titles: [], renown: 0, best: 0, callout: null, sectFame: 0, seenRings: [], restUntil: 0,
             record: { runs: 0, bouts: 0, won: 0, lost: 0, blood: 0, champions: 0, kills: 0 }, last: null }
  }

  // Rolls any missing roster slot / champion for every ring you can enter (and again for the dead, once no run holds them)
  _arenaEnsureRosters() {
    const s = this._s, A = s.arena, yr = Math.floor(s.world.year)
    const alive = id => A.duelists[id] && A.duelists[id].alive !== false
    for (const R of ARENA_RINGS) {
      if (s.stageIndex < R.minStage) continue
      const ring = A.rings[R.id] || (A.rings[R.id] = { roster: [], championId: null })
      if (A.run?.ringId === R.id) continue
      const make = stage => {
        // 4.5: known-first — a ring draws on the world's people of its realm (a classmate may hold a ring)
        const known = this._castKnown('duelist', { stage: [Math.max(0, stage - 1), stage + 1], age: [AWAKENING_AGE + 2, 9999] })
        const p = known ? this._castCopy(known, 'duelist') : this._genPerson({ family: Persons.rollSurname(), bornYear: yr - 20 - this._randInt([0, 40]), stage, role: 'duelist' })
        if (!known) this._castFresh()
        p.arenaRing = R.id; A.duelists[p.id] = p; return p.id
      }
      ring.roster = ring.roster.filter(alive)
      while (ring.roster.length < ARENA_ROSTER) ring.roster.push(make(R.band[0] + Math.round((R.band[1] - R.band[0]) * ring.roster.length / Math.max(1, ARENA_ROSTER - 1))))
      if (!alive(ring.championId)) ring.championId = make(R.champ)
    }
    for (const [id, p] of Object.entries(A.duelists))            // the dead that no ring holds any more
      if (p.alive === false && !Object.values(A.rings).some(r => r.roster.includes(id) || r.championId === id) && s.family?.fight?.oppId !== id) delete A.duelists[id]
  }

  _arenaMult(streak, blood) {
    const A = this._s.arena
    const st = Math.min(ARENA_STREAK_MAX, 1 + ARENA_STREAK_STEP * streak)
    const rn = 1 + Math.min(ARENA_RENOWN_CAP, Math.max(0, A.renown) * ARENA_RENOWN_PURSE)
    const bl = blood ? ARENA_BLOOD_MULT : 1
    return { streak: st, renown: rn, blood: bl, total: st * rn * bl }
  }
  // What a win against this duelist would add to the purse right now
  _arenaPrize(R, champion, blood, streak, callout = false) {
    const base = (champion ? R.champPrize : R.prize) * (callout ? ARENA_CALLOUT_MULT : 1)
    return Math.round(base * this._arenaMult(streak, blood).total)
  }

  // Why you can't fight this duelist now (null = you can). blood = a blood match.
  _arenaLock(R, id, blood) {
    const s = this._s, A = s.arena, run = A.run, p = A.duelists[id], ring = A.rings[R.id]
    if (!p || p.alive === false) return 'gone'
    if (s.stageIndex < R.minStage) return 'stage'
    if (s.interlude || s.family?.fight || A.callout) return 'busy'
    if (run && run.ringId !== R.id) return 'other_ring'
    if (run?.beaten.includes(id)) return 'beaten'
    if (!run && (A.restUntil || 0) > Date.now()) return 'resting'
    if (ring?.championId === id && (run?.wins || 0) < ARENA_CHAMP_AFTER) return 'champion'
    if ((s.health ?? 100) < ARENA_MIN_HEALTH) return 'wounded'
    if (!run && s.spiritStones < R.entry) return 'stones'
    if (blood && ARENA_NO_BLOOD.includes(p.personality)) return 'no_blood'
    return null
  }

  // Everything Roam → Arena shows
  arenaInfo() {
    const s = this._s, A = s.arena
    this._arenaEnsureRosters()
    for (const R of ARENA_RINGS) if (s.stageIndex >= R.minStage && !A.seenRings.includes(R.id)) A.seenRings.push(R.id)   // (the "opens to you" nudge)
    const run = A.run
    const rings = ARENA_RINGS.map(R => {
      const open = s.stageIndex >= R.minStage, ring = A.rings[R.id]
      const row = (id, champion) => {
        const p = A.duelists[id]
        return { id, p, champion, odds: this.personFightOdds(p, 'arena').chance, record: this.personRecord(p), feud: p.feud || null,
          lock: this._arenaLock(R, id, false), bloodLock: this._arenaLock(R, id, true),
          prize: this._arenaPrize(R, champion, false, run?.ringId === R.id ? run.streak : 0),
          bloodPrize: this._arenaPrize(R, champion, true, run?.ringId === R.id ? run.streak : 0) }
      }
      const rows = open && ring ? [...ring.roster.map(id => row(id, false)), row(ring.championId, true)] : []
      return { ...R, open, title: A.titles.includes(R.id), rows, here: run?.ringId === R.id }
    })
    const cur = run ? { ...run, ring: ARENA_RINGS.find(r => r.id === run.ringId), mult: this._arenaMult(run.streak, false),
      champLeft: Math.max(0, ARENA_CHAMP_AFTER - run.wins) } : null
    const co = A.callout ? { ...A.callout, p: A.duelists[A.callout.id], ring: ARENA_RINGS.find(r => r.id === A.callout.ringId) } : null
    if (co?.p) co.prize = this._arenaPrize(co.ring, false, co.blood, 0, true)
    return { rings, run: cur, renown: A.renown, mult: this._arenaMult(run?.streak || 0, false), best: A.best, record: { ...A.record },
      titles: A.titles.map(id => ARENA_RINGS.find(r => r.id === id)?.title).filter(Boolean), callout: co?.p ? co : null,
      health: s.health ?? 100, minHealth: ARENA_MIN_HEALTH, last: A.last,
      restUntil: !run && (A.restUntil || 0) > Date.now() ? A.restUntil : null }
  }

  // Your choice: fight this duelist (a blood match = to the death, ×3). Starts a run (pays the fee) if none is underway.
  startArenaBout(ringId, oppId, blood = false) {
    const s = this._s, A = s.arena, R = ARENA_RINGS.find(r => r.id === ringId)
    if (!R) return { ok: false, reason: 'unknown' }
    this._arenaEnsureRosters()
    const lock = this._arenaLock(R, oppId, !!blood)
    if (lock) return { ok: false, reason: lock }
    if (!A.run) {
      s.spiritStones -= R.entry
      A.run = { ringId: R.id, purse: 0, streak: 0, wins: 0, beaten: [], startedYear: Math.floor(s.world.year) }
      A.record.runs++
      this.addEvent({ text: `You pay ${R.entry} Spirit Stones and step onto the ${R.name}.`, type: 'neutral' })
    }
    A.run.chosen = true                       // a bout you picked: this run will rest the Arena when it ends
    const opp = A.duelists[oppId]
    this._startFight('arena', opp, !!blood,
      { arena: { ringId: R.id, blood: !!blood, champion: A.rings[R.id].championId === oppId, callout: false } })
    return { ok: true, fight: true }
  }

  // Your choice between bouts: take the purse and go
  // The 30-min Arena rest follows a run YOU chose (user 2026-10-05): a grudge-holder's call-out you only answered never
  // starts or extends it; fight on after one (a bout you pick) and the run is yours, so it rests as usual.
  _arenaRest(run) {
    const A = this._s.arena
    if (run && run.callout && !run.chosen) return
    A.restUntil = Date.now() + ARENA_REST_SECONDS * 1000
  }
  arenaWalkAway() {
    const s = this._s, A = s.arena, run = A.run
    if (!run) return { ok: false, reason: 'no_run' }
    if (s.family?.fight?.kind === 'arena') return { ok: false, reason: 'busy' }
    s.spiritStones += run.purse
    const R = ARENA_RINGS.find(r => r.id === run.ringId)
    this.addEvent({ text: `You walk off the ${R?.name || 'sand'} with ${run.purse} Spirit Stones${run.streak > 1 ? ` and a streak of ${run.streak}` : ''}.`, type: 'positive' })
    A.last = { walked: true, purse: run.purse, streak: run.streak, ringId: run.ringId }
    A.run = null
    this._arenaRest(run)
    this._arenaEnsureRosters()
    this._recalc(); this._notify()
    return { ok: true, purse: run.purse }
  }

  // A bout is over (your loss / yield, or your end choice after a win)
  _arenaBoutEnd(fi, opp, res) {
    const s = this._s, A = s.arena, run = A.run, yr = Math.floor(s.world.year)
    const R = ARENA_RINGS.find(r => r.id === fi.arena?.ringId) || ARENA_RINGS[0]
    const blood = !!fi.arena?.blood, champion = !!fi.arena?.champion
    A.record.bouts++
    if (res.winner.id === s.self.id) {
      A.record.won++
      const gain = this._arenaPrize(R, champion, blood, run?.streak || 0, !!fi.arena?.callout)
      if (run) { run.purse += gain; run.streak++; run.wins++; run.beaten.push(opp.id) }
      A.renown += ARENA_RENOWN.win + (blood ? ARENA_RENOWN.blood : 0) + (champion ? ARENA_RENOWN.champion : 0)
      if (blood) A.record.blood++
      let title = null
      if (champion && !A.titles.includes(R.id)) { A.titles.push(R.id); A.record.champions++; title = R.title }
      // Phase 42: the champion's signature art goes with the title; any win may turn up a manual
      const sigArt = title && ARTS_LIST.find(a => a.sig === 'arena:' + R.id)
      if (sigArt) this._grantManual(sigArt.id, `from the ${R.name}'s champion`)
      else if (Math.random() < ART_ARENA_BOUT_DROP) { const artId = this._rollArt(ART_ARENA_RING_WEIGHTS[R.id]); if (artId) this._grantManual(artId, `as a prize in the ${R.name}`) }
      // Phase 44: the ring champion's formula comes with the title; any win may turn up an unknown one
      let learnedRecipe = null
      const champRecipe = title ? RECIPE_DISCOVERY.arena[R.id] : null
      if (champRecipe && !s.recipes.known[champRecipe]) { this._learnRecipe(champRecipe, 'arena'); learnedRecipe = champRecipe }
      else if (Math.random() < RECIPE_DISCOVERY.arenaWinChance) { const rid = this._rollHiddenRecipe(); if (rid) { this._learnRecipe(rid, 'arena'); learnedRecipe = rid } }
      if (res.died) { opp.alive = false; opp.diedYear = yr; opp.cause = 'arena_blood'; A.record.kills++; s.karma = Math.max(0, s.karma + ARENA_KILL_KARMA) }
      A.best = Math.max(A.best, run?.streak || 0)
      if (s.ownSect?.founded) A.sectFame += R.fame
      else if (s.sect?.id) s.sect.contribution += R.contribution
      A.last = { won: true, gain, purse: run?.purse || 0, streak: run?.streak || 0, title, ringId: R.id, champLeft: Math.max(0, ARENA_CHAMP_AFTER - (run?.wins || 0)),
        recipe: learnedRecipe ? (ITEMS[RECIPES.find(r => r.id === learnedRecipe)?.productId]?.name || 'a formula') : null }
      this.addEvent({ text: `The ${R.name}: you beat ${Persons.fullName(opp)}${res.died ? ', and they do not rise' : ''}. +${gain} to the purse (${run?.purse || gain} now).${title ? ` The crowd names you ${title}.` : ''}`, type: title ? 'special' : 'positive' })
      this._emit('arena_win', { ring: R.id, streak: run?.streak || 0, blood, champion, title: !!title })
      this._recalc(); this._notify()
      return 'arena_won'
    }
    A.record.lost++
    const keep = run ? Math.floor(run.purse * ARENA_LOSS_KEEP) : 0
    s.spiritStones += keep
    A.last = { lost: true, keep, purse: run?.purse || 0, streak: run?.streak || 0, ringId: R.id, died: !!res.died }
    A.run = null
    this._arenaRest(run)
    if (res.died) {
      this.addEvent({ text: `Year ${yr}: on the ${R.name}, ${Persons.fullName(opp)}'s blade is faster. The crowd roars for the wrong one.`, type: 'negative' })
      this._recalc(); this._notify()
      this._die('arena_blood')
      return 'died'
    }
    this.addEvent({ text: `The ${R.name}: ${Persons.fullName(opp)} beats you. Your run ends; you keep ${keep} of the purse.`, type: 'negative' })
    this._arenaEnsureRosters()
    this._recalc(); this._notify()
    return 'arena_lost'
  }

  // Yearly: a grudge-holding duelist may call you out; a duelist who owes you may send a gift (world rolls, not yours)
  _tickArena() {
    const s = this._s, A = s.arena
    if (!A || s.interlude) return
    const yr = Math.floor(s.world.year)
    const living = Object.values(A.duelists).filter(p => p.alive !== false)
    const grudges = living.filter(p => p.feud === 'grudge' && p.arenaRing && s.stageIndex >= (ARENA_RINGS.find(r => r.id === p.arenaRing)?.minStage ?? 0))
    if (!A.callout && !A.run && !s.family?.fight && grudges.length && Math.random() < ARENA_CALLOUT_CHANCE) {
      const p = grudges[Math.floor(Math.random() * grudges.length)]
      A.callout = { id: p.id, ringId: p.arenaRing, year: yr, blood: ARENA_CALLOUT_BLOOD.includes(p.personality) }
      this.addEvent({ text: `Year ${yr}: ${Persons.fullName(p)} has not forgotten. They call you out on the ${ARENA_RINGS.find(r => r.id === p.arenaRing)?.name}${A.callout.blood ? ', to the death' : ''}.`, type: 'negative' })
      this._emit('arena_callout', { id: p.id })
    }
    const debtors = living.filter(p => p.feud === 'debt')
    if (debtors.length && Math.random() < ARENA_GIFT_CHANCE) {
      const p = debtors[Math.floor(Math.random() * debtors.length)], R = ARENA_RINGS.find(r => r.id === p.arenaRing) || ARENA_RINGS[0]
      s.spiritStones += R.prize; p.feud = null
      this.addEvent({ text: `${Persons.fullName(p)} sends ${R.prize} Spirit Stones with a note: "For the hand you gave me on the sand. We are even."`, type: 'positive' })
    }
  }

  // Your choice: answer a call-out (their ring, their stakes, ARENA_CALLOUT_MULT × the purse) or let it go (−renown)
  answerArenaCallout(accept) {
    const s = this._s, A = s.arena, c = A.callout
    if (!c) return { ok: false, reason: 'no_callout' }
    const p = A.duelists[c.id], R = ARENA_RINGS.find(r => r.id === c.ringId)
    if (accept && (s.family?.fight || A.run)) return { ok: false, reason: 'busy' }
    A.callout = null
    if (!p || p.alive === false || !R) { this._notify(); return { ok: true, outcome: 'moot' } }
    if (!accept) {
      A.renown += ARENA_RENOWN.declined
      this.addEvent({ text: `You let ${Persons.fullName(p)}'s challenge go unanswered. The arena crowds call it fear.`, type: 'negative' })
      this._notify()
      return { ok: true, outcome: 'declined' }
    }
    A.run = { ringId: R.id, purse: 0, streak: 0, wins: 0, beaten: [], startedYear: Math.floor(s.world.year), callout: true }
    A.record.runs++
    this._startFight('arena', p, !!c.blood,
      { arena: { ringId: R.id, blood: !!c.blood, champion: A.rings[R.id]?.championId === p.id, callout: true } })
    return { ok: true, fight: true }
  }

  // ── Phase 35 (docs/systems/combat.md): beast battles ────────────────────────
  // A wild beast from Roam → Beasts, fought on the battle page (renderer/game/combat.js) exchange by exchange. The fight
  // lives in the shared f.fight slot (kind 'beast'), so it also holds the one-fight-at-a-time gate.

  bestiaryEntry(typeId) {
    const b = this._s.bestiary?.[typeId]
    return { seen: false, fought: 0, won: 0, lost: 0, slain: 0, spared: 0, bound: 0, habitsKnown: false, returning: null, variants: {}, ...(b || {}) }
  }
  _bestiary(typeId) {
    const s = this._s
    if (!s.bestiary) s.bestiary = {}
    return (s.bestiary[typeId] = this.bestiaryEntry(typeId))
  }
  // 2026-09-30 (user): record meeting a beast — seen, and (if it wears a rare colour) which variant, so the Bestiary can
  // show the variants you have run into. Returns the entry, so a fight path can tally on it. Idempotent.
  _seeBeast(rec) {
    if (!rec?.typeId) return null
    const b = this._bestiary(rec.typeId)
    b.seen = true
    if (rec.variant) b.variants[rec.variant] = true
    return b
  }

  // What the fight engine sees as the opponent (a beast is not a world person).
  _beastOpp(rec, id) {
    const prof = this.beastProfile(rec)
    return { id, beast: true, typeId: rec?.typeId, traits: rec?.traits || [], mood: rec?.mood || null, given: prof.name, name: prof.name, prof, morality: 0 }
  }

  _beastStyle(typeId, traits = []) {
    const B = (typeof BEAST_FIGHT_STYLE !== 'undefined' && (BEAST_FIGHT_STYLE[typeId] || BEAST_FIGHT_STYLE.default)) || FIGHT_STYLE.default
    const st = { ...B }
    if (traits.includes('swift')) st.feint += BEAST_TRAIT_FEINT
    if (traits.includes('iron_skin')) st.guard += BEAST_TRAIT_GUARD
    return st
  }

  // Its power: realm gate × 100 + base + Might + traits + mood. Parts are what the breakdown card lists.
  _beastPower(rec) {
    const prof = this.beastProfile(rec), T = prof.type || { minStage: 0 }
    const parts = [{ label: `Its realm (${typeof stageShortName === 'function' ? stageShortName(T.minStage || 0) : 'stage ' + (T.minStage || 0)})`, value: (T.minStage || 0) * 100 + BEAST_FIGHT_BASE_POWER }]
    const mp = Math.round((prof.might - 1) * BEAST_FIGHT_MIGHT_POWER)
    if (mp) parts.push({ label: `${prof.tier.name}${prof.variant ? ', rare colour' : ''} (Might ×${prof.might.toFixed(2)})`, value: mp })
    for (const t of rec?.traits || []) if (BEAST_TRAIT_POWER[t]) parts.push({ label: (BEAST_TRAITS[t]?.name || t), value: BEAST_TRAIT_POWER[t] })
    const mood = rec?.mood && BEAST_MOOD_POWER[rec.mood]
    if (mood) parts.push({ label: rec.mood === 'cub' ? 'Only a cub' : 'It remembers you', value: mood })
    return { parts, total: parts.reduce((a, p) => a + p.value, 0) }
  }

  // Your side: the same luck-free power as a duel (_expectedPower), minus wounds.
  _selfFightPower() {
    const s = this._s, hp = s.health ?? 100
    const parts = [{ label: `Your realm (${typeof stageShortName === 'function' ? stageShortName(s.stageIndex) : 'stage ' + s.stageIndex})`, value: s.stageIndex * 100 },
      { label: 'Your spirit root', value: Math.round((s.root?.mult || 1) * 10) }]
    const temper = TOURNAMENT_PERSONALITY_POWER[s.personality?.id] || 0
    if (temper) parts.push({ label: `Your temper (${s.personality?.name || s.personality?.id})`, value: temper })
    const bodyPow = BODY_TIERS[s.body?.tier || 0]?.power || 0   // Phase 14
    if (bodyPow) parts.push({ label: `Your body (${BODY_TIERS[s.body.tier].name})`, value: bodyPow })
    if (hp < BEAST_WOUNDED_BELOW) parts.push({ label: `Wounded (Health ${Math.ceil(hp)})`, value: -Math.round((BEAST_WOUNDED_BELOW - hp) * BEAST_WOUNDED_POWER) })
    return { parts, total: parts.reduce((a, p) => a + p.value, 0) }
  }

  _beastWound(rec, stance) {
    const w = BEAST_WOUND * this.beastProfile(rec).might * (stance === 'slay' ? 1 : BEAST_DRIVE_WOUND_MULT)
    return Math.max(1, Math.round(w))
  }
  _beastLossWound(rec, stance) {
    const w = BEAST_LOSS_WOUND * this.beastProfile(rec).might * (stance === 'slay' ? 1 : BEAST_DRIVE_WOUND_MULT)
    return Math.max(1, Math.round(w))
  }

  _beastFightLock(enc) {
    const s = this._s
    if (!enc) return 'gone'
    if (s.interlude || s.family?.fight) return 'busy'
    if ((s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH) return 'wounded'
    return null
  }

  // Everything the prepare panel shows before you commit: both stances' odds + wounds + worst case, known habits.
  beastFightPreview(encId) {
    const s = this._s
    const enc = (s.beastEncounters || []).find(e => e.id === encId)
    if (!enc) return null
    const prof = this.beastProfile(enc), me = this._selfFightPower(), it = this._beastPower(enc)
    const hp = s.health ?? 100, rec = this.bestiaryEntry(enc.typeId)
    // Phase 42b: the odds are a Monte Carlo of the move fight itself (your loadout, its moves, your parry rate), per stance
    const stance = {}
    for (const st of ['slay', 'drive']) {
      const b = this._mbNew(enc, st)
      const key = JSON.stringify([encId, st, Math.round(hp), s.stageIndex, b.you.moves, b.you.mastery, b.you.P, s.arts?.parryMode, Math.round(this.parryRate() * 20)])
      this._mbCache = this._mbCache || new Map()
      let est = this._mbCache.get(key)
      if (!est) { est = this._mbEstimate(b); this._mbCache.set(key, est); if (this._mbCache.size > 60) this._mbCache.delete(this._mbCache.keys().next().value) }
      const hit = this._mbDamage({ ...b.foe, mastery: {} }, b.you, this._mbArt('beast_rake'), () => 0.5).dmg
      const wound = st === 'drive' ? Math.max(1, Math.round(hit * MOVE_COMBAT.driveTakenMult)) : hit
      stance[st] = { chance: est.chance, died: est.died, turns: est.turns, hurt: Math.round(est.hurt), parryRate: est.parryRate, wound, lossWound: 0,
        worst: Math.round(est.hurt), canDie: st === 'slay' && est.died >= 0.02, foeHp: b.foe.max, foeElement: b.foe.element }
    }
    const chance = stance.slay.chance
    const style = this._beastStyle(enc.typeId, enc.traits || []), W = style.press + style.guard + style.feint
    const nature = (typeof BEAST_NATURE !== 'undefined' && BEAST_NATURE[enc.typeId]) || 'wild'
    return { encId, name: prof.name, prof, nature, mood: enc.mood || null, you: me, it, chance, stance, health: hp,
      habitsKnown: rec.habitsKnown, record: rec, element: BEAST_ELEMENT[enc.typeId] || 'neutral', moves: rec.habitsKnown ? this._mbFoe(enc, null).moves : null,
      habits: rec.habitsKnown ? { press: style.press / W, guard: style.guard / W, feint: style.feint / W } : null,
      hint: rec.habitsKnown ? style.hint : null, locked: this._beastFightLock(enc) }
  }

  // Your choice: 'slay' (it fights for its life; full wounds; a loss can kill you) or 'drive' (half wounds, never below 1).
  startBeastFight(encId, stance) {
    if (stance !== 'slay' && stance !== 'drive') return { ok: false, reason: 'bad_stance' }
    const pv = this.beastFightPreview(encId)
    if (!pv) return { ok: false, reason: 'not_found' }
    if (pv.locked) return { ok: false, reason: pv.locked }
    const enc = this._s.beastEncounters.find(e => e.id === encId)
    this._startFight('beast', { id: 'beast:' + enc.id }, stance === 'slay', {
      stance, power: pv.it.total, over: null, m: this._mbNew(enc, stance),
      beast: { encId: enc.id, typeId: enc.typeId, ...(enc.variant ? { variant: enc.variant } : {}), traits: [...(enc.traits || [])], ...(enc.mood ? { mood: enc.mood } : {}) } })
    return { ok: true, fight: true, chance: pv.stance[stance].chance }
  }

  // ── Phase 42b (task 1.13a, arts.md → "Move combat" + "Parry"): beast battles on moves ──────────────────────────────
  // A battle `b` (kept in fi.m) is plain data, so the same functions play the live fight, the Monte Carlo estimate and
  // the sim bot: b = { stance, turn, you, foe, plan, planIdx, pending, over, lines, sim }. A fighter = { side, name, hp,
  // max, qi, pool, regen, power, element, elements, swift, moves, mastery, P (passives), st (status → turns), burn, buffs,
  // ward, reflect, counterPow, charging, circ, sealed, style? }. No cooldowns: Qi is the only limit (user 2026-09-29).
  _mbRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  _mbArt(id) {
    const c = this._mbArtC || (this._mbArtC = new Map())            // hot in the estimate: look each id up once
    let a = c.get(id)
    if (a === undefined) { a = this._mbArtMake(id); c.set(id, a) }
    return a
  }
  _mbArtMake(id) {
    if (id === 'circulate') return { id, name: 'Circulate', element: null, kind: 'move', move: { type: 'circulate', power: 0, cost: 0, desc: `Gather ${MOVE_COMBAT.circulateQi} Qi instead of attacking.` } }
    if (id === 'beast_rake') return { id, name: BEAST_BASIC.name, element: null, kind: 'move', move: BEAST_BASIC.move }
    if (BOSS_MOVES[id]) return BOSS_MOVES[id]   // v1 add-on: a legendary boss's own moves
    return ARTS[id] || null
  }
  _mbPassives() { return this._mbPassivesOf((this._s.arts?.loadout?.passives || []).slice(0, this.passiveSlots())) }
  _mbPassivesOf(ids) {
    const P = { might: 0, ward: 0, swift: 0, qiPool: 0, qiRegen: 0, crit: 0, statusResist: 0, lifesteal: 0, parry: 1, heal: 0, el: {}, parryChance: 0 }
    for (const id of ids) {
      const a = id && ARTS[id], p = a?.passive
      if (!p) continue
      if (p.stat === 'element') P.el[a.element] = (P.el[a.element] || 0) + p.value
      else if (p.stat === 'parry') P.parry *= p.value
      else P[p.stat] = (P[p.stat] || 0) + p.value
      if (p.ward) P.ward += p.ward
    }
    return P
  }
  _mbYou(stance) {
    const s = this._s, P = this._mbPassives(), els = this.rootElements(), MC = MOVE_COMBAT
    const power = s.stageIndex * 100 + Math.round((s.root?.mult || 1) * 10) + (TOURNAMENT_PERSONALITY_POWER[s.personality?.id] || 0)
    // (user 2026-09-30) A fight keeps the deck it began with: `slots` is a copy of the loadout at the first blow, so the
    // loadout is never locked — you can rearrange Path → Arts whenever you like without changing a fight already underway.
    const slots = (s.arts?.loadout?.moves || []).slice(0, ART_MOVE_SLOTS)
    const moves = slots.filter(Boolean)
    const mastery = Object.fromEntries(Object.entries(s.arts?.known || {}).map(([id, k]) => [id, k.mastery || 1]))
    return { side: 'you', name: s.name, hp: Math.max(0, s.health ?? 100), max: this.maxHealth(), qi: MC.qiPool + P.qiPool, pool: MC.qiPool + P.qiPool, regen: MC.qiRegen + P.qiRegen,
      power, element: null, elements: els, swift: MC.swiftBase + P.swift, moves, slots, mastery, P, st: {}, burn: 0, buffs: [], ward: 0, reflect: 0, counterPow: 0, charging: null, circ: false, sealed: null }
  }
  _mbFoe(rec, youEl) {
    const MC = MOVE_COMBAT, prof = this.beastProfile(rec), style = this._beastStyle(rec.typeId, rec.traits || [])
    const el = BEAST_ELEMENT[rec.typeId] || 'neutral', moves = [...(BEAST_MOVES[rec.typeId] || []), 'beast_rake']
    if (false && rec.mood === 'vengeful' && youEl) {               // (retired in the 1.13a balance pass: your defence has no element)
      const counterEl = Object.keys(ELEMENT_OVERCOMES).find(e => ELEMENT_OVERCOMES[e] === youEl)
      const c = ARTS_LIST.find(a => a.kind === 'move' && !a.sig && a.element === counterEl && MOVE_ATTACKS.includes(a.move.type) && a.minStage <= (prof.type?.minStage || 0) + 3)
      if (c && !moves.includes(c.id)) moves.unshift(c.id)
    }
    const max = Math.max(20, Math.round(MC.beastHpBase * MC.foeHpMult * (BEAST_HP_MULT[rec.typeId] || 1) * (1 + (prof.might - 1) * MC.beastHpMight) * (rec.mood === 'cub' ? 0.6 : 1)))
    const P = { might: 0, ward: 0, swift: 0, qiPool: 0, qiRegen: 0, crit: 0, statusResist: 0, lifesteal: 0, parry: 1, heal: 0, el: {},
      parryChance: Math.min(MC.beastParryMax, style.guard * MC.beastParryPerGuard) }
    return { side: 'foe', name: prof.name, the: `the ${prof.name}`, dmgMult: MC.foeDmgMult, hp: max, max, qi: MC.qiPool, pool: MC.qiPool, regen: MC.qiRegen, power: this._beastPower(rec).total,
      element: el, elements: [el], swift: MC.swiftBase + ((rec.traits || []).includes('swift') ? MC.swiftTrait : 0), moves, mastery: {}, P,
      style: { press: style.press, guard: style.guard, feint: style.feint }, st: {}, burn: 0, buffs: [], ward: 0, reflect: 0, counterPow: 0, charging: null, circ: false, sealed: null }
  }
  _mbNew(rec, stance) { const you = this._mbYou(stance); return { stance, turn: 1, you, foe: this._mbFoe(rec, you.element), plan: null, planIdx: 0, pending: null, over: null, lines: [] } }

  // ── Phase 42c (task 1.14a, arts.md → "People on moves"): a person's arts + their side of a fight ──
  // p.arts = { moves, passives, element, realm } — rolled once per realm from their root's elements + temper with a
  // seeded RNG (their id + realm; never Math.random, so sim seeds stay put), then kept on the record. An Arena champion
  // guards their ring's signature art. Crossing into a new realm re-rolls it (they grow; what you have seen stays seen).
  _personRealm(stage) { let r = 0; ART_PASSIVE_SLOTS.forEach((x, i) => { if (stage >= x.stage) r = i }); return r }
  _personElements(p) {
    if (!p.root) return Persons.rootElements({ type: 'mixed', name: '' }, p.id)
    if (!Array.isArray(p.root.elements)) p.root.elements = Persons.rootElements(p.root, p.id)
    return p.root.elements
  }
  personArts(p) {
    if (!p) return null
    const stage = p.stageIndex || 0, realm = this._personRealm(stage)
    const champ = this._arenaChampionRing(p), counterEl = p.counter?.el || null
    if (p.arts?.moves && p.arts.realm === realm && p.arts.champ === champ && (p.arts.counterEl || null) === counterEl) return p.arts
    const els = this._personElements(p), temper = PERSON_TEMPER_ARTS[p.personality] || {}
    let h = 2166136261; for (const ch of `${p.id}|${realm}|arts`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    const rng = this._mbRng(h)
    const rar = [...PERSON_ART_WEIGHTS].reverse().find(x => stage >= x.stage).w
    const pick = (pool, n, taken) => {
      const out = []
      for (let k = 0; k < n; k++) {
        const opts = pool.filter(a => !taken.includes(a.id) && !out.includes(a.id))
        const w = opts.map(a => (rar[a.rarity] || 0) * (els.includes(a.element) ? PERSON_ART_OWN_ELEMENT : 1) * (a.move ? temper[a.move.type] || 1 : 1))
        let r = rng() * w.reduce((t, x) => t + x, 0)
        const i = w.findIndex(x => (r -= x) < 0)
        if (i < 0) break
        out.push(opts[i].id)
      }
      return out
    }
    const ok = a => !a.sig && !ART_BASICS.includes(a.id) && a.minStage <= stage && (a.element === 'neutral' || els.includes(a.element))
    const nMoves = [...PERSON_MOVE_COUNT].reverse().find(x => stage >= x.stage).n
    const moves = []
    const sig = champ && ARTS_LIST.find(a => a.sig === 'arena:' + champ)
    if (sig) moves.push(sig.id)
    const starter = ARTS_LIST.find(a => a.starter && a.element === els[0])
    if (starter && moves.length < nMoves) moves.push(starter.id)
    // at least one real attack beyond the starter, then anything their temper reaches for
    moves.push(...pick(ARTS_LIST.filter(a => a.kind === 'move' && ok(a) && MOVE_ATTACKS.includes(a.move.type)), Math.min(1, nMoves - moves.length), moves))
    moves.push(...pick(ARTS_LIST.filter(a => a.kind === 'move' && ok(a)), nMoves - moves.length, moves))
    const passives = pick(ARTS_LIST.filter(a => a.kind === 'passive' && ok(a)), Math.ceil(this.passiveSlots(stage) * PERSON_PASSIVE_SHARE), [])
    // 1.14b: a rival's counter — an attack art of the element that overcomes yours (in place of their last pick)
    let counterArt = null
    if (counterEl) {
      const pool = ARTS_LIST.filter(a => a.kind === 'move' && !a.sig && !ART_BASICS.includes(a.id) && a.element === counterEl && a.minStage <= stage && MOVE_ATTACKS.includes(a.move.type))
      counterArt = pick(pool, 1, moves)[0] || null
      if (counterArt) { if (moves.length >= nMoves) moves[moves.length - 1] = counterArt; else moves.push(counterArt) }
    }
    p.arts = { moves, passives, element: els[0], realm, champ, counterEl, counterArt }
    return p.arts
  }
  _arenaChampionRing(p) {
    if (!p?.arenaRing) return null
    const ring = this._s.arena?.rings?.[p.arenaRing]
    return ring?.championId === p.id ? p.arenaRing : null
  }
  // ── 1.14b (arts.md → "42c part 2"): rival counters ──
  // The element your landed blows against them carried most (at least RIVAL_COUNTER_MIN_BLOWS times), or null.
  _favouriteElement(p) {
    const els = this.personRecord(p).els || {}
    const [el, n] = Object.entries(els).sort((a, b) => b[1] - a[1])[0] || []
    return n >= RIVAL_COUNTER_MIN_BLOWS ? el : null
  }
  // After a fight: one who holds a grudge trains against the element you lean on — they fight as the element that
  // overcomes it (your arts of it are resisted) and learn an art of it (personArts). Said in the log once per change.
  _rivalTrain(p) {
    if (p.feud !== 'grudge' || p.alive === false) return
    const fav = this._favouriteElement(p)
    if (!fav) return
    const el = Object.keys(ELEMENT_OVERCOMES).find(e => ELEMENT_OVERCOMES[e] === fav)
    if (!el || p.counter?.el === el) return
    p.counter = { vs: fav, el, year: Math.floor(this._s.world.year) }
    this.addEvent({ text: `Word reaches you: ${Persons.fullName(p)} has not forgotten. They say ${p.given} now trains in ${ART_ELEMENTS[el].name} arts, against your ${ART_ELEMENTS[fav].name}.`, type: 'negative' })
    this._emit('rival_counter', { id: p.id, vs: fav, el })
  }

  // Their side of the fight (the same fighter shape as a beast's). Power = the A6-3a person power (realm, root, temper, a grudge).
  _mbFoePerson(p) {
    const MC = MOVE_COMBAT, PF = PERSON_FIGHT, A = this.personArts(p), P = this._mbPassivesOf(A.passives)
    const style = FIGHT_STYLE[p.personality] || FIGHT_STYLE.default
    P.parryChance = Math.min(PF.parryMax, style.guard * PF.parryPerGuard)
    const max = Math.round(PF.hpBase * (1 + PF.hpPerRealm * this._personRealm(p.stageIndex || 0)))
    const pool = MC.qiPool + P.qiPool
    // 1.14b: a rival who trained against you fights as the counter element (your arts of the element they studied resist)
    const element = A.counterEl || A.element, elements = [...new Set([...this._personElements(p), ...(A.counterEl ? [A.counterEl] : [])])]
    return { side: 'foe', person: true, id: p.id, name: p.given || Persons.fullName(p), the: p.given || Persons.fullName(p), dmgMult: PF.dmgMult * (p.feud === 'grudge' ? PF.grudgeDmgMult : 1),
      hp: max, max, qi: pool, pool, regen: MC.qiRegen + P.qiRegen, power: this._personPowerParts(p).total,
      element, elements, swift: MC.swiftBase + P.swift, moves: [...A.moves, 'palm_strike'], mastery: {}, P,
      style: { press: style.press, guard: style.guard, feint: style.feint }, temper: p.personality,
      st: {}, burn: 0, buffs: [], ward: 0, reflect: 0, counterPow: 0, charging: null, circ: false, sealed: null }
  }
  _mbNewPerson(p, lethal) {
    const stance = lethal ? 'slay' : 'yield'
    const you = this._mbYou(stance), foe = this._mbFoePerson(p)
    you.spread = foe.spread = PERSON_FIGHT.powerSpread                   // gentler than a beast's: a stage ≈ ±25% (arts.md)
    return { stance, turn: 1, you, foe, plan: null, planIdx: 0, pending: null, over: null, lines: [], person: true }
  }
  // The estimate for a fight with this person (cached: roster rows ask for many at once)
  _personEstimate(p, lethal) {
    const s = this._s, b = this._mbNewPerson(p, lethal)
    b.you.hp = Math.max(1, Math.round(b.you.hp / 5) * 5)                  // 'about': Health to the nearest 5, so regen keeps the cache
    const key = JSON.stringify(['p', p.id, p.stageIndex, p.feud || '', lethal, b.you.hp, s.stageIndex, b.you.moves, b.you.mastery, b.you.P, b.foe.moves, b.foe.power, s.arts?.parryMode, Math.round(this.parryRate() * 20)])
    this._mbCache = this._mbCache || new Map()
    let est = this._mbCache.get(key)
    if (!est) { est = this._mbEstimate(b, PERSON_FIGHT.estimateRuns); this._mbCache.set(key, est); if (this._mbCache.size > 120) this._mbCache.delete(this._mbCache.keys().next().value) }
    return { ...est, foeHp: b.foe.max, element: b.foe.element }
  }
  // Their arts you could be taught (raise → a debt) or loot (finish): never a signature, never a basic; taught = ones you
  // don't know yet (a loot may deepen one you know)
  _teachableArts(p) { const A = this.personArts(p); return [...A.moves, ...A.passives].filter(id => ARTS[id] && !ARTS[id].sig && !this._s.arts.known[id]) }
  _lootableArts(p) { const A = this.personArts(p); return [...A.moves, ...A.passives].filter(id => ARTS[id] && !ARTS[id].sig) }
  // Scouting: what you know of their arts (seen used against you) and how they fight (once you have fought them)
  personScouting(p) {
    if (!p) return null
    const A = this.personArts(p), rec = this.personRecord(p), seen = rec.movesSeen || []
    const style = FIGHT_STYLE[p.personality] || FIGHT_STYLE.default
    const parry = Math.min(PERSON_FIGHT.parryMax, style.guard * PERSON_FIGHT.parryPerGuard)
    // 1.14b: word of a rival's counter travels (the log said so), so their counter art counts as known
    const counter = A.counterEl ? { vs: p.counter.vs, el: A.counterEl, art: A.counterArt } : null
    return { element: A.counterEl || A.element, rootElement: A.element, counter, elements: this._personElements(p),
      moves: A.moves.map(id => ({ id, seen: seen.includes(id) || id === A.counterArt })),
      seen: A.moves.filter(id => seen.includes(id) || id === A.counterArt).length, total: A.moves.length, habitsKnown: rec.fought > 0, hint: style.hint,
      parry, parryWord: parry >= 0.2 ? 'parries often' : parry >= 0.12 ? 'parries now and then' : 'rarely parries' }
  }

  _mbBuff(F, stat) { return F.buffs.reduce((t, b) => t + (b.stat === stat ? b.value : 0), 0) }
  _mbCost(F, id) {
    const a = this._mbArt(id)
    if (!a || id === 'circulate' || F.charging === id) return 0
    return Math.max(0, a.move.cost - ART_MASTERY_COST * ((F.mastery[id] || 1) - 1)) + (F.st.entangle ? MOVE_COMBAT.entangleCost : 0)
  }
  _mbElementMult(el, D) {
    if (!el || el === 'neutral' || !D.element || D.element === 'neutral') return 1
    return ELEMENT_OVERCOMES[el] === D.element ? MOVE_COMBAT.elementOver : ELEMENT_OVERCOMES[D.element] === el ? MOVE_COMBAT.elementUnder : 1
  }
  // One hit's damage (before a ward / parry): power × Might/Ward ratio × element × root affinity × passives × spread × crit
  _mbDamage(A, D, art, rng, powOverride = null) {
    const MC = MOVE_COMBAT, m = art.move
    let pow = (powOverride ?? m.power) * (1 + ART_MASTERY_POWER * ((A.mastery[art.id] || 1) - 1))
    if (m.type === 'finisher' && D.hp < D.max / 3) pow *= 1 + (m.finisher || 0)
    const ratio = Math.max(MC.powerRatioClamp[0], Math.min(MC.powerRatioClamp[1], Math.exp((A.power - D.power) / (A.spread || MC.powerSpread))))   // 1.14a: people fights set their own spread
    const el = art.element && art.element !== 'neutral' ? art.element : (art.id === 'beast_rake' ? A.element : null)
    const em = this._mbElementMult(el, D)
    const aff = el && A.elements.includes(el) ? 1 + MC.affinity : 1
    const might = 1 + A.P.might + this._mbBuff(A, 'might') + (el ? (A.P.el[el] || 0) : 0)
    const ward = Math.max(0.3, 1 + D.P.ward + this._mbBuff(D, 'ward'))
    const crit = rng() < MC.critBase + A.P.crit + (m.crit || 0)
    const sp = MC.spread[0] + rng() * (MC.spread[1] - MC.spread[0])
    const dmg = pow * MC.dmgScale * ratio * em * aff * might / ward * (D.st.guardbreak ? MC.guardBreakMult : 1) * sp * (crit ? MC.critMult : 1) * (A.dmgMult || 1)
    return { dmg: Math.max(1, Math.round(dmg)), crit, em }
  }
  _mbStatus(b, D, st, rng) {
    if (!st || rng() >= st.chance * (1 - D.P.statusResist)) return null
    if (st.id === 'burn') D.burn = Math.min(MOVE_COMBAT.burnStackMax, D.burn + 1)
    if (st.id === 'seal') { const pool = D.moves.filter(id => id !== 'beast_rake' && id !== 'palm_strike'); D.sealed = pool.length ? pool[Math.floor(rng() * pool.length)] : null }
    D.st[st.id] = Math.max(D.st[st.id] || 0, st.turns)
    return st.id
  }
  _mbLine(b, who, text, tone = '') { b.lines.push({ turn: b.turn, who, text, tone }) }
  // Stances: 'slay' (to the death: 0 Health kills you) · 'drive' (a beast driven off: half damage, thrown down at
  // driveThrownHp) · 'yield' (1.14a, a person "until one yields": full damage; you are beaten at PERSON_FIGHT.yieldThrownHp
  // Health, they yield at yieldFoeFrac of their HP).
  // Only 'slay' can take you below 1.
  _mbHurt(b, D, dmg) {
    if (D.side === 'you' && b.stance === 'drive') dmg = Math.max(1, Math.round(dmg * MOVE_COMBAT.driveTakenMult))
    D.hp -= dmg
    if (D.side === 'you' && b.stance !== 'slay') D.hp = Math.max(1, D.hp)
    return dmg
  }
  _mbThrownHp(b) { return b.stance === 'drive' ? MOVE_COMBAT.driveThrownHp : b.stance === 'yield' ? PERSON_FIGHT.yieldThrownHp : b.stance === 'boss' ? 1 : 0 }
  // One side's action. `parry` = [bool per hit] for an attack on you (the parry QTE's results); beasts parry by a roll.
  _mbAct(b, A, D, id, rng, parry = null) {
    const MC = MOVE_COMBAT, art = this._mbArt(id), m = art.move, W = A.side === 'you' ? 'You' : A.the[0].toUpperCase() + A.the.slice(1)
    const ev = { side: A.side, id, name: art.name, type: m.type, element: art.element || (id === 'beast_rake' ? A.element : null), hits: [] }
    if (A.st.daze && rng() < MC.dazeSkip) { ev.dazed = true; A.charging = null; this._mbLine(b, A.side, `${W} ${A.side === 'you' ? 'are' : 'is'} dazed and lose${A.side === 'you' ? '' : 's'} the turn.`, 'down'); return ev }
    if (id === 'circulate') { A.qi = Math.min(A.pool, A.qi + MC.circulateQi); A.circ = true; this._mbLine(b, A.side, `${W} draw${A.side === 'you' ? '' : 's'} in breath and Qi (+${MC.circulateQi} Qi).`, 'qi'); return ev }
    const releasing = A.charging === id
    A.qi = Math.max(0, A.qi - this._mbCost(A, id))
    if (A.side === 'you' && !b.sim) this._artUse(id)
    if (m.type === 'charge' && !releasing) { A.charging = id; ev.gather = true; this._mbLine(b, A.side, `${W} gather${A.side === 'you' ? '' : 's'} ${art.name}. It lands next turn.`, 'qi'); return ev }
    if (releasing) { A.charging = null; ev.release = true }
    if (m.type === 'ward') { A.ward = Math.max(A.ward, m.ward || 0.5); A.reflect = m.counter || 0; this._mbLine(b, A.side, `${W} brace${A.side === 'you' ? '' : 's'}: ${art.name}.`, 'qi'); return ev }
    if (m.type === 'counter') { A.counterPow = m.power; A.ward = Math.max(A.ward, 1 - MC.counterTakenMult); this._mbLine(b, A.side, `${W} wait${A.side === 'you' ? '' : 's'} to turn the blow: ${art.name}.`, 'qi'); return ev }
    if (m.type === 'buff') { A.buffs.push({ ...m.self }); this._mbLine(b, A.side, `${W} use${A.side === 'you' ? '' : 's'} ${art.name}.`, 'qi'); return ev }
    if (m.type === 'heal') {
      const before = A.hp; A.hp = Math.min(A.max, A.hp + m.heal); const cleared = Object.keys(A.st)[0]
      if (cleared) { delete A.st[cleared]; if (cleared === 'burn') A.burn = 0; if (cleared === 'seal') A.sealed = null }
      ev.heal = A.hp - before
      this._mbLine(b, A.side, `${W} use${A.side === 'you' ? '' : 's'} ${art.name} (+${ev.heal} Health${cleared ? `, ${ART_STATUS[cleared].name} cleared` : ''}).`, 'up'); return ev
    }
    if (m.type === 'hex') {
      if (m.power) { const h = this._mbDamage(A, D, art, rng); ev.hits.push({ dmg: this._mbHurt(b, D, h.dmg), em: h.em }) }
      const got = this._mbStatus(b, D, m.status, rng)
      ev.status = got
      this._mbLine(b, A.side, `${W} use${A.side === 'you' ? '' : 's'} ${art.name}${got ? `: ${D.side === 'you' ? 'you are' : `${D.the} is`} ${ART_STATUS[got].name}` : ', but it does not take'}.`, got ? (A.side === 'you' ? 'up' : 'down') : '')
      return ev
    }
    // attacks: strike / multi / charge (released) / finisher / drain
    if (A.side === 'you' && b.boss?.split && rng() >= b.boss.read) {   // v1 add-on: the Wraith's Two Faces — you struck the false one
      ev.falseFace = true; ev.total = 0
      this._mbLine(b, 'you', `You use ${art.name} on the false face. It ripples, and is gone, and the true one smiles.`, 'down')
      return ev
    }
    const hits = m.hits || 1
    let total = 0, parried = 0, status = null
    for (let h = 0; h < hits && D.hp > 0 && A.hp > 0; h++) {
      const par = D.side === 'you' ? !!parry?.[h] : rng() < D.P.parryChance
      if (par) {
        D.qi = Math.min(D.pool, D.qi + MC.parryQi * (D.circ ? MC.parryCirculateMult : 1)); parried++
        ev.hits.push({ parried: true }); continue
      }
      const r = this._mbDamage(A, D, art, rng)
      let dmg = r.dmg
      if (D.ward) { dmg = Math.max(1, Math.round(dmg * (1 - D.ward))); D.ward = 0 }
      dmg = this._mbHurt(b, D, dmg); total += dmg
      if (D.reflect) { const back = Math.max(1, Math.round(dmg * D.reflect)); this._mbHurt(b, A, back); ev.reflected = (ev.reflected || 0) + back; D.reflect = 0 }
      if (D.counterPow) { const c = this._mbDamage(D, A, { id: 'counter', element: null, move: { type: 'strike', power: D.counterPow } }, rng); ev.countered = this._mbHurt(b, A, c.dmg); D.counterPow = 0 }
      if (A.P.lifesteal) A.hp = Math.min(A.max, A.hp + Math.round(dmg * A.P.lifesteal))
      if (m.drain) A.hp = Math.min(A.max, A.hp + Math.round(dmg * m.drain))
      if (m.qiDrain) { const q = Math.min(D.qi, m.qiDrain); D.qi -= q; A.qi = Math.min(A.pool, A.qi + q) }
      status = this._mbStatus(b, D, m.status, rng) || status
      ev.hits.push({ dmg, crit: r.crit, em: r.em })
    }
    if (m.selfDamage) { A.hp -= m.selfDamage; ev.self = m.selfDamage }
    if (m.heal && ev.release) A.hp = Math.min(A.max, A.hp + m.heal)
    if (m.self) A.buffs.push({ ...m.self })
    ev.total = total; ev.parried = parried; ev.status = status
    const em = ev.hits.find(x => x.em)?.em
    const tag = em > 1 ? ' It overcomes!' : em < 1 ? ' It is resisted.' : ''
    const crit = ev.hits.some(x => x.crit) ? ' A telling blow.' : ''
    const par = parried ? (D.side === 'you' ? ` You parry ${parried === hits ? (hits > 1 ? 'every hit' : 'it') : `${parried} of ${hits}`} (+${parried * MC.parryQi * (D.circ ? MC.parryCirculateMult : 1)} Qi).` : ` ${D.person ? D.name : 'It'} turns aside ${parried === hits ? 'your blow' : `${parried} of your hits`}.`) : ''
    const st = status ? ` ${D.side === 'you' ? 'You are' : D.person ? `${D.name} is` : 'It is'} ${ART_STATUS[status].name}.` : ''
    this._mbLine(b, A.side, `${W} use${A.side === 'you' ? '' : 's'} ${art.name}${total ? `: ${total} damage` : ''}.${tag}${crit}${par}${st}${ev.countered ? ` The counter strikes back for ${ev.countered}.` : ''}${ev.reflected ? ` The stance returns ${ev.reflected}.` : ''}`, A.side === 'you' ? (total ? 'up' : '') : (total ? 'down' : 'up'))
    return ev
  }
  _mbCheck(b) {
    if (b.boss) this._mbBossPhase(b)   // v1 add-on: a boss's phase script runs before a win is declared
    if (b.foe.hp <= 0 || (b.stance === 'yield' && b.foe.hp <= b.foe.max * PERSON_FIGHT.yieldFoeFrac)) b.over = 'won'
    else if (b.you.hp <= 0) b.over = b.stance === 'slay' ? 'died' : 'lost'
    else if (b.stance !== 'slay' && b.you.hp <= this._mbThrownHp(b)) b.over = 'lost'
    return b.over
  }
  _mbEndTurn(b) {
    const MC = MOVE_COMBAT
    for (const F of [b.you, b.foe]) {
      if (F.st.bleed) { F.hp -= MC.bleedDmg; if (F.side === 'you' && b.stance !== 'slay') F.hp = Math.max(1, F.hp) }
      if (F.st.burn) { F.hp -= MC.burnDmg * Math.max(1, F.burn); if (F.side === 'you' && b.stance !== 'slay') F.hp = Math.max(1, F.hp) }
      for (const k of Object.keys(F.st)) if (--F.st[k] <= 0) { delete F.st[k]; if (k === 'burn') F.burn = 0; if (k === 'seal') F.sealed = null }
      F.buffs = F.buffs.filter(x => --x.turns > 0)
      F.qi = Math.min(F.pool, F.qi + F.regen)
      F.ward = 0; F.reflect = 0; F.counterPow = 0; F.circ = false
    }
    if (b.boss) this._mbBossTurn(b)   // v1 add-on: the Bird's egg
    b.turn++
  }
  // Who acts first: wards/counters, then priority, then Swift (Chilled acts last); ties go to you.
  _mbOrder(b, youId, foeId) {
    const pr = (F, id) => { const t = this._mbArt(id).move.type; return (['ward', 'counter'].includes(t) ? 3 : 0) + (this._mbArt(id).move.priority || 0) - (F.st.chill ? 5 : 0) }
    const a = pr(b.you, youId) * 100 + b.you.swift, c = pr(b.foe, foeId) * 100 + b.foe.swift
    return a >= c ? [['you', youId], ['foe', foeId]] : [['foe', foeId], ['you', youId]]
  }
  // The opponent's choice (the world's roll): its habits weight its move kinds, the board nudges them. A person's temper
  // adds its own leanings (PERSON_TEMPER_AI: the hothead's strikes, the stoic's wards when hurt, the schemer's hexes).
  _mbAi(b, rng) {
    const F = b.foe, Y = b.you
    if (F.charging) return F.charging
    const T = F.temper ? PERSON_TEMPER_AI[F.temper] : null, hurt = F.hp < F.max * 0.5
    const opts = F.moves.filter(id => id !== F.sealed && this._mbCost(F, id) <= F.qi)
    if (T?.circulate && F.qi < 30) opts.push('circulate')
    const w = opts.map(id => {
      const m = this._mbArt(id).move, s = F.style
      if (id === 'circulate') return s.guard * T.circulate * 0.5
      let x = MOVE_ATTACKS.includes(m.type) ? s.press : ['ward', 'counter', 'buff', 'heal'].includes(m.type) ? s.guard : s.feint
      x *= 0.6 + m.power / 60
      if (m.type === 'heal') x *= F.hp < F.max * 0.3 ? 2.5 : F.hp < F.max * 0.5 ? 1 : 0.1
      if (m.type === 'finisher' && Y.hp < Y.max * 0.35) x *= 2
      if (m.type === 'hex' && m.status && Y.st[m.status.id]) x *= 0.25
      if (id === 'beast_rake' || id === 'palm_strike') x *= 0.5
      if (T) x *= (T[m.type] || 1) * (hurt && T.hurt ? T.hurt[m.type] || 1 : 1)
      return Math.max(0.01, x)
    })
    let r = rng() * w.reduce((t, v) => t + v, 0)
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i] }
    return opts[opts.length - 1] || 'beast_rake'
  }
  // A competent default for your side (the estimate, and the sim bot): heal when low, else the best expected damage.
  _mbPolicy(b) {
    const Y = b.you, D = b.foe
    if (Y.charging) return Y.charging
    const opts = [...new Set([...Y.moves, 'palm_strike'])].filter(id => id !== Y.sealed && this._mbArt(id) && this._mbCost(Y, id) <= Y.qi)
    const heal = opts.find(id => this._mbArt(id).move.type === 'heal')
    if (heal && Y.hp < Y.max * 0.3) return heal
    let best = 'palm_strike', bv = -1
    for (const id of opts) {
      const a = this._mbArt(id), m = a.move
      if (!MOVE_ATTACKS.includes(m.type) && m.type !== 'hex') continue
      const el = a.element !== 'neutral' ? a.element : null
      let v = (m.power || 4) * (m.hits || 1) * this._mbElementMult(el, D) * (el && Y.elements.includes(el) ? 1.2 : 1) * (m.type === 'charge' ? 0.6 : 1) * (m.type === 'finisher' && D.hp < D.max / 3 ? 1 + m.finisher : 1)
      if (m.type === 'hex') v = D.st[m.status?.id] ? 0 : 18
      if (v > bv) { bv = v; best = id }
    }
    if (best === 'palm_strike' && Y.qi < 25 && Y.moves.some(id => this._mbArt(id)?.move.cost > Y.qi)) return 'circulate'
    return best
  }
  // Run the turn's actions from where it stopped. provider(act) → the parry results for an attack on you, or null to pause
  // (the live QTE). Returns 'pending' | 'turn' | 'over'.
  _mbStep(b, rng, provider, youId = null) {
    if (!b.plan) { b.plan = this._mbOrder(b, youId, this._mbAi(b, rng)); b.planIdx = 0; b.events = [] }
    while (b.planIdx < b.plan.length) {
      const [side, id] = b.plan[b.planIdx]
      const A = side === 'you' ? b.you : b.foe, D = side === 'you' ? b.foe : b.you
      const art = this._mbArt(id), attack = MOVE_ATTACKS.includes(art.move.type) && !(art.move.type === 'charge' && A.charging !== id)
      let parry = null
      if (side === 'foe' && attack) {
        // Parry pacing (user 2026-09-29: "parries happen a lot"): only some blows are telegraphed — decided once per blow
        // (kept on the plan entry, so resuming after the QTE never re-rolls it). An untelegraphed blow simply lands.
        const entry = b.plan[b.planIdx]
        if (entry[2] === undefined) entry[2] = this._mbTelegraphed(b, art, rng)
        if (!entry[2]) { parry = Array(art.move.hits || 1).fill(false); b.unwarned = true }
        else parry = provider({ id, art, hits: art.move.hits || 1 })
        if (parry === null) { b.pending = { id, name: art.name, type: art.move.type, hits: art.move.hits || 1, element: art.element || b.foe.element, priority: !!art.move.priority, windowMs: this._mbWindow(b, art) }; return 'pending' }
      }
      b.pending = null
      const ev = this._mbAct(b, A, D, id, rng, parry)
      if (b.unwarned) {
        ev.unwarned = true; b.unwarned = false
        const L = b.lines[b.lines.length - 1]                       // say why no prompt came (only when parrying is on)
        if (!b.sim && L && ev.total && this._s?.arts?.parryMode !== 'off') L.text += ' Too quick to parry.'
      }
      b.events.push(ev)
      b.planIdx++
      if (this._mbCheck(b)) { b.plan = null; return 'over' }
    }
    this._mbEndTurn(b)
    b.plan = null
    return this._mbCheck(b) ? 'over' : 'turn'
  }
  // Does this blow open a parry window? Charges, finishers and its strongest arts always do; the rest by a roll (the world's
  // pacing — the parry itself stays yours). MOVE_COMBAT.parryPromptChance / parryBigShare.
  _mbTelegraphed(b, art, rng) {
    const MC = MOVE_COMBAT, m = art.move
    if (m.type === 'charge' || m.type === 'finisher') return true
    const weight = x => MOVE_ATTACKS.includes(x.type) ? (x.power || 0) * (x.hits || 1) : 0
    const top = Math.max(1, ...(b.foe.moves || []).map(id => weight(this._mbArt(id)?.move || {})))
    if (weight(m) >= top * MC.parryBigShare) return true
    return rng() < MC.parryPromptChance
  }
  // The parry window (ms) for this attack: base × Wide × its kind × your parry passives × Swift gap
  _mbWindow(b, art) {
    const MC = MOVE_COMBAT, m = art.move
    let w = MC.parryWindowMs * (this._s?.arts?.parryMode === 'wide' ? MC.parryWideMult : 1) * b.you.P.parry
    if (m.hits > 1) w *= MC.parryMult.multi
    if (m.priority) w *= MC.parryMult.priority
    if (m.type === 'charge') w *= MC.parryMult.charge
    if (m.type === 'finisher') w *= MC.parryMult.finisher
    w *= 1 + MC.parrySwift * (b.you.swift - b.foe.swift)
    return Math.round(Math.max(MC.parryMinMs, Math.min(MC.parryMaxMs, w)))
  }
  parryRate() {
    const log = this._s?.arts?.parryLog || []
    return log.length >= 5 ? log.reduce((t, x) => t + x, 0) / log.length : MOVE_COMBAT.parryRateDefault
  }
  // Monte Carlo: `runs` fights from here with the default policy for you and your recent parry rate. Deterministic (its own
  // seeded RNG), so it never disturbs Math.random and gives the same answer on every render.
  _mbEstimate(b0, runs = MOVE_COMBAT.estimateRuns) {
    const rate = this._s?.arts?.parryMode === 'off' ? 0 : this.parryRate()
    let seed = 7; for (const ch of JSON.stringify([b0.stance, b0.you.hp, b0.you.moves, b0.you.P, b0.foe.max, b0.foe.moves, b0.you.power, b0.foe.power, rate])) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0
    const rng = this._mbRng(seed)
    let won = 0, died = 0, turns = 0, lost = 0, hurt = 0
    for (let i = 0; i < runs; i++) {
      const b = this._mbClone(b0); b.sim = true
      const prov = q => Array.from({ length: q.hits }, () => rng() < rate)
      let guard = 0
      while (!b.over && guard++ < MOVE_COMBAT.maxTurns * 3) {
        const r = this._mbStep(b, rng, prov, this._mbPolicy(b))
        if (r === 'turn' && b.turn > MOVE_COMBAT.maxTurns) break
      }
      if (b.over === 'won') won++; else if (b.over === 'died') died++; else lost++
      turns += b.turn; hurt += b0.you.hp - Math.max(0, b.you.hp)
    }
    return { chance: won / runs, died: died / runs, lost: lost / runs, turns: turns / runs, hurt: hurt / runs, parryRate: rate }
  }
  // A fresh copy of a battle for one estimate run: only the parts a fight mutates are copied (P, moves, mastery and style
  // are read-only), which is ~5× cheaper than a JSON round trip.
  _mbClone(b0) {
    const F = x => ({ ...x, st: { ...x.st }, buffs: x.buffs.map(y => ({ ...y })) })
    return { ...b0, you: F(b0.you), foe: F(b0.foe), boss: b0.boss ? { ...b0.boss } : undefined, plan: b0.plan ? b0.plan.map(e => [...e]) : null, pending: b0.pending ? { ...b0.pending } : null, lines: [], events: [] }
  }
  // What each of your buttons does now (the battle page's 2×2 grid + Circulate + Palm Strike if it's not equipped).
  // 1.14a: every fight is on moves; beastMoves / beastMove / beastParry stay as names for the same calls.
  beastMoves() { return this.fightMoves() }
  beastMove(id) { return this.fightMove(id) }
  beastParry(results) { return this.fightParry(results) }
  fightMoves() {
    const fi = this._s.family?.fight, b = fi?.m
    if (!b) return null
    const Y = b.you, D = b.foe
    const one = id => {
      const a = this._mbArt(id), m = a.move, cost = this._mbCost(Y, id), el = a.element && a.element !== 'neutral' ? a.element : null
      const power = m.power ? Math.round(m.power * (1 + ART_MASTERY_POWER * ((Y.mastery[id] || 1) - 1))) : 0
      const em = this._mbElementMult(el, D)
      const lock = Y.charging && Y.charging !== id ? 'charging' : id === Y.sealed ? 'sealed' : cost > Y.qi ? 'qi' : null
      return { id, name: a.name, element: a.element || null, type: m.type, cost, power, hits: m.hits || 1, desc: m.desc, lock, matchup: em > 1 ? 'over' : em < 1 ? 'under' : null, affinity: !!(el && Y.elements.includes(el)), release: Y.charging === id }
    }
    // The grid shows the deck this battle began with (`b.you.slots`), not the live loadout — so rearranging your arts
    // mid-fight never changes the fight in progress (an old save's battle predates `slots`: fall back to the loadout).
    const raw = b.you.slots?.length ? b.you.slots : (this._s.arts?.loadout?.moves || [])
    const slots = raw.map(id => id ? one(id) : null)
    return { slots, circulate: one('circulate'), palm: slots.some(x => x?.id === 'palm_strike') ? null : one('palm_strike'), charging: Y.charging }
  }
  // Your move. Plays the turn until an attack on you opens a parry window (pending) or the turn ends.
  fightMove(id) {
    const s = this._s, fi = s.family?.fight
    if (fi && !fi.m && !fi.over && fi.kind !== 'beast' && fi.kind !== 'boss') this._personFightM(fi)
    const b = fi?.m
    if (!b) return { ok: false, reason: 'no_battle' }
    if (fi.over || b.over) return { ok: false, reason: 'decide' }
    if (b.pending) return { ok: false, reason: 'parry' }
    const Y = b.you
    const allowed = id === 'circulate' || id === 'palm_strike' || Y.moves.includes(id)
    if (!allowed || !this._mbArt(id)) return { ok: false, reason: 'unknown' }
    if (Y.charging && id !== Y.charging) return { ok: false, reason: 'charging' }
    if (id === Y.sealed) return { ok: false, reason: 'sealed' }
    if (this._mbCost(Y, id) > Y.qi) return { ok: false, reason: 'qi' }
    return this._mbLive(b, fi, id)
  }
  // The parry QTE's results for the pending attack: one bool per hit (hit the timing = true)
  fightParry(results) {
    const s = this._s, fi = s.family?.fight, b = fi?.m
    if (!b?.pending) return { ok: false, reason: 'none' }
    const hits = b.pending.hits, res = Array.from({ length: hits }, (_, i) => !!results?.[i])
    if (s.arts.parryMode !== 'off') {
      s.arts.parryLog = [...(s.arts.parryLog || []), ...res.map(x => x ? 1 : 0)].slice(-MOVE_COMBAT.parryRateWindow)
      if (!s.arts.parryTaught) s.arts.parryTaught = true
    }
    b.pendingAnswer = res
    return this._mbLive(b, fi, null)
  }
  _mbLive(b, fi, youId) {
    const s = this._s
    b.you.hp = Math.max(0, Math.min(this.maxHealth(), s.health ?? 100))
    const n0 = b.lines.length
    let answer = b.pendingAnswer; b.pendingAnswer = null
    // the pending attack gets the QTE's answer; with parrying Off every hit lands; otherwise pause for the QTE
    const prov = q => { if (answer) { const a = answer; answer = null; return a } return s.arts.parryMode === 'off' ? Array(q.hits).fill(false) : null }
    const evStart = b.plan ? b.events.length : 0
    const r = this._mbStep(b, Math.random, prov, youId)
    s.health = Math.max(0, Math.min(this.maxHealth(), b.you.hp))
    if (b.stance !== 'slay') s.health = Math.max(1, s.health)
    const events = (b.events || []).slice(evStart)
    const out = { ok: true, events, lines: b.lines.slice(n0), pending: r === 'pending' ? b.pending : null, turn: b.turn }
    if (fi.kind === 'boss') return this._mbLiveBoss(b, fi, r, out)   // v1 add-on
    if (fi.kind !== 'beast') return this._mbLivePerson(b, fi, r, out)
    if (r === 'over') {
      const opp = this._fightOpp()
      if (b.over === 'won') {
        fi.over = 'won'
        if (b.you.P.heal) s.health = Math.min(this.maxHealth(), s.health + b.you.P.heal)
        this.addEvent({ text: `The ${opp.name} goes down and does not rise. It is yours to decide what happens now.`, type: 'positive' })
        out.over = 'won'
      } else if (b.over === 'died') { out.done = true; out.outcome = this._beastFightDeath(fi, opp) }
      else { this._s.family.fight = null; out.done = true; out.outcome = this._beastFightLost(fi, opp, true) }
    }
    if (!out.done) { this._recalc(); this._notify() }
    return out
  }
  // 1.14a: a fight with a person moved on. Scouting (the arts they used on you), then the same outcomes as before:
  // a win waits for your end choice; a loss / death goes through _finishFight (every fight kind's own outcome).
  _mbLivePerson(b, fi, r, out) {
    const s = this._s, opp = this._fightOpp()
    if (opp) {
      const rec = this.personRecord(opp), seen = new Set(rec.movesSeen || []), els = { ...(rec.els || {}) }
      for (const ev of out.events) {
        if (ev.side === 'foe' && ev.id !== 'palm_strike' && ev.id !== 'circulate') seen.add(ev.id)
        // 1.14b: they remember the elements your landed blows carried (a rival trains against the one you lean on)
        if (ev.side === 'you' && ev.total > 0 && ev.element && ev.element !== 'neutral') els[ev.element] = (els[ev.element] || 0) + 1
      }
      if (out.pending?.id && out.pending.id !== 'palm_strike') seen.add(out.pending.id)
      opp.vsYou = { ...rec, movesSeen: [...seen], els }
    }
    if (r === 'over') {
      const f = s.family
      if (b.over === 'won') {
        fi.over = 'won'
        if (b.you.P.heal) s.health = Math.min(this.maxHealth(), s.health + b.you.P.heal)
        this.addEvent({ text: `${opp?.given || 'They'} ${fi.lethal ? 'is down, and cannot rise' : 'yields'}. What happens now is your choice.`, type: 'positive' })
        out.over = 'won'
      } else {
        f.fight = null
        out.done = true
        out.outcome = this._finishFight(fi, opp, false, false, b.over === 'died')
        Object.assign(out, this._afterBoutInfo())
        return out
      }
    }
    this._recalc(); this._notify()
    return out
  }
  // A person fight without a move battle (an old save paused mid-fight on Press/Guard/Feint): it restarts on moves, at
  // your current Health.
  _personFightM(fi) {
    const opp = this._fightOpp()
    if (opp) fi.m = this._mbNewPerson(opp, fi.lethal)
    return fi.m
  }

  // Mastery through use: each use of a known art in a real battle is xp toward its next level
  _artUse(id) {
    const k = this._s.arts?.known?.[id]
    if (!k) return
    k.uses = (k.uses || 0) + 1
    if (k.mastery >= ART_MASTERY_MAX) return
    k.xp = (k.xp || 0) + MOVE_COMBAT.masteryXpPerUse
    if (k.xp >= ART_MASTERY_XP[k.mastery + 1]) { k.mastery++; this.addEvent({ text: `${ARTS[id].name} deepens through use: mastery ${k.mastery} of ${ART_MASTERY_MAX}.`, type: 'positive' }) }
  }
  setParryMode(mode) {
    if (!['normal', 'wide', 'off'].includes(mode)) return { ok: false, reason: 'invalid' }
    this._s.arts.parryMode = mode; this._save(); this._notify()
    return { ok: true }
  }

  _beastFightDeath(fi, opp) {
    const s = this._s, b = this._seeBeast(fi.beast)
    s.family.fight = null
    b.fought++; b.lost++; b.habitsKnown = true
    this.addEvent({ text: `Year ${Math.floor(s.world.year)}: the ${opp.name} was stronger. You went to kill it, and it killed you.`, type: 'negative' })
    this._die('beast_hunt')
    return 'died'
  }

  _beastFightLost(fi, opp, onField = false) {
    const s = this._s, b = this._seeBeast(fi.beast)
    b.fought++; b.lost++; b.habitsKnown = true
    const extra = onField ? 0 : this._beastLossWound(fi.beast, fi.stance)
    s.health = (s.health ?? 100) - extra
    if (fi.stance !== 'slay') s.health = Math.max(1, s.health)
    if (s.health <= 0) return this._beastFightDeath(fi, opp)
    this.addEvent({ text: `The ${opp.name} throws you down${extra ? ` (−${extra} Health)` : ''}. You crawl away; it still prowls Roam → Beasts.`, type: 'negative' })
    this._emit('battle_lost', { beast: opp.name })
    this._recalc(); this._notify()
    return 'lost'
  }

  _beastRetreat(fi, opp) {
    const s = this._s, b = this._seeBeast(fi.beast)
    const m = fi.m, hit = m ? this._mbDamage(m.foe, m.you, this._mbArt('beast_rake'), Math.random).dmg : this._beastWound(fi.beast, fi.stance)
    const dmg = m && fi.stance === 'drive' ? Math.max(1, Math.round(hit * MOVE_COMBAT.driveTakenMult)) : hit
    s.health = (s.health ?? 100) - dmg
    if (fi.stance !== 'slay') s.health = Math.max(1, s.health)
    if (s.health <= 0) return { ok: true, done: true, retreated: true, outcome: this._beastFightDeath(fi, opp) }
    s.family.fight = null
    b.fought++
    if (fi.round > 1 || (fi.m?.turn || 1) > 1) b.habitsKnown = true   // you traded blows: you saw how it fights
    this.addEvent({ text: `You break away from the ${opp.name}. Its parting blow costs you ${dmg} Health; it still prowls Roam → Beasts.`, type: 'negative' })
    this._emit('battle_lost', { beast: opp.name, retreated: true })
    this._recalc(); this._notify()
    return { ok: true, done: true, retreated: true, outcome: 'retreated', dmg }
  }

  // Which end choices a won battle offers, and why one is locked.
  beastFightChoices() {
    const s = this._s, fi = s.family?.fight
    if (!fi || fi.kind !== 'beast' || fi.over !== 'won') return null
    const full = (s.beasts || []).length >= (s.derived?.maxBeasts || 3)
    const free = fi.beast.mood === 'grateful'
    const counts = this.talismanCounts()
    const tal = TALISMAN_GRADE_ORDER.reduce((a, g) => a + counts[g], 0)
    const best = this._bestTalismanGrade()
    const bindLock = full ? 'max_beasts' : !free && !best ? 'no_talisman' : null
    const talismanGrades = TALISMAN_GRADE_ORDER.map(g => ({ id: g, name: TALISMAN_GRADES[g].name, chance: TALISMAN_GRADES[g].tameChance, count: counts[g] }))
    const nature = BEAST_NATURE[fi.beast.typeId] || 'wild'
    const cub = fi.beast.mood === 'cub'
    const finishKarma = cub ? BEAST_KARMA.cub : BEAST_KARMA.finish[nature]
    const ids = fi.stance === 'slay' ? ['finish', 'spare', 'bind'] : ['flee', 'bind']
    return { ids, nature, cub, bindLock, bindFree: free, talismans: tal, talismanGrades, bindGrade: best,
      bindChance: free ? 1 : (best ? TALISMAN_GRADES[best].tameChance : null),
      finishKarma, spareKarma: BEAST_KARMA.spare[nature], loot: this._beastLootPreview(fi.beast) }
  }

  _beastLootPreview(rec) {
    const prof = this.beastProfile(rec), mult = prof.variant ? BEAST_VARIANT_LOOT : 1
    return (BEAST_SLAY_LOOT[prof.tier.id] || BEAST_SLAY_LOOT.common).map(([id, lo, hi, ch]) =>
      ({ id, name: ITEMS[id]?.name || id, lo: Math.round(lo * mult), hi: Math.round(hi * mult), chance: ch }))
  }

  // The end choice of a won battle: 'finish' | 'spare' (Slay stance) · 'flee' (Drive) · 'bind' (either, with a talisman).
  beastFightFinish(choice, gradeId) {
    const s = this._s, f = s.family, fi = f?.fight
    const ch = this.beastFightChoices()
    if (!ch) return { ok: false, reason: 'no_battle' }
    if (!ch.ids.includes(choice)) return { ok: false, reason: 'bad_choice' }
    if (choice === 'bind' && ch.bindLock) return { ok: false, reason: ch.bindLock }
    const rec = fi.beast, prof = this.beastProfile(rec), name = prof.name, b = this._seeBeast(rec)
    f.fight = null
    s.beastEncounters = (s.beastEncounters || []).filter(e => e.id !== rec.encId)
    b.fought++; b.won++; b.habitsKnown = true
    const karma0 = s.karma
    const res = { ok: true, outcome: choice, karma: 0 }
    if (choice === 'finish') {
      b.slain++
      s.karma = Math.max(0, Math.min(100, s.karma + ch.finishKarma))
      const loot = {}
      for (const d of this._beastLootPreview(rec)) {
        if (Math.random() >= d.chance) continue
        const n = d.lo + Math.floor(Math.random() * (d.hi - d.lo + 1))
        if (n <= 0) continue
        loot[d.id] = n
        if (ITEMS[d.id]?.type === 'currency') s.spiritStones += n
        else s.inventory[d.id] = (s.inventory[d.id] || 0) + n
      }
      res.loot = loot
      const lootTxt = Object.entries(loot).map(([id, n]) => `${n} ${ITEMS[id]?.name || id}`).join(', ')
      this.addEvent({ text: ch.cub ? `You finish the ${name} cub. ${lootTxt ? 'You take ' + lootTxt + '.' : ''} It was very small.`
        : ch.nature === 'benign' ? `You slay the ${name}, ${BEAST_NATURE_TEXT.benign}. You take ${lootTxt || 'nothing'}, and the valley goes quiet.`
        : `You slay the ${name} and take ${lootTxt || 'nothing'}.`, type: ch.nature === 'benign' || ch.cub ? 'negative' : 'positive' })
      // A mother leaves a cub behind (a weaker sighting of the same kind)
      if (!ch.cub && Math.random() < BEAST_CUB_CHANCE && (s.beastEncounters || []).length < 3) {
        s.beastEncounters.push({ id: `${Date.now()}_${Math.floor(Math.random() * 9999)}`, typeId: rec.typeId,
          ...(rec.variant ? { variant: rec.variant } : {}), traits: [...rec.traits], mood: 'cub', seenAt: Date.now() })
        this.addEvent({ text: `Something small cries in the ${name}'s den. A cub waits in Roam → Beasts.`, type: 'special' })
        res.cub = true
      }
      this._emit('beast_slain', { beast: name, tier: prof.tier.id })
      // Phase 42: its signature art, or a manual of its element (mercy keeps its secrets: only Finish drops arts)
      const sig = ARTS_LIST.find(a => a.sig === 'beast:' + rec.typeId)
      if (sig && !ch.cub && Math.random() < (ART_BEAST_SIG_CHANCE[prof.tier.id] || 0.05)) { this._grantManual(sig.id, `on the ${name}`); res.art = sig.id }
      else if (Math.random() < ART_BEAST_ELEMENT_DROP) {
        const artId = this._rollArt(ART_DROP_WEIGHTS_BY_TIER[Math.min(6, 1 + Math.floor(s.stageIndex / 4))], BEAST_ELEMENT[rec.typeId])
        if (artId) { this._grantManual(artId, `on the ${name}`); res.art = artId }
      }
    } else if (choice === 'spare' || choice === 'flee') {
      b.spared++
      s.karma = Math.max(0, Math.min(100, s.karma + ch.spareKarma))
      if (!ch.cub && Math.random() < BEAST_RETURN_CHANCE) {
        // karma pulls toward gratitude; a long slay record (every kind) pulls toward vengeance (A6-2)
        const slain = Object.values(s.bestiary || {}).reduce((a, e) => a + (e.slain || 0), 0)
        const g = Math.max(0.2, Math.min(0.85, BEAST_GRATEFUL_BASE + (s.karma - 50) / 100 - Math.min(BEAST_SLAYER_VENGEFUL_MAX, slain * BEAST_SLAYER_VENGEFUL)))
        b.returning = Math.random() < g ? 'grateful' : 'vengeful'
        res.returning = b.returning
      }
      this.addEvent({ text: choice === 'spare' ? `You lower your blade. The ${name} limps into the trees and looks back once.`
        : `The ${name} breaks off and flees. It will remember this place, and you.`, type: 'neutral' })
      this._emit('beast_spared', { beast: name })
    } else {                                                     // bind: tame it now, broken to your will
      let grade = null, chance = 1
      if (!ch.bindFree) {
        const counts = this.talismanCounts()
        grade = (gradeId && TALISMAN_GRADES[gradeId] && counts[gradeId] > 0) ? gradeId : this._bestTalismanGrade()
        if (!grade) { this._recalc(); this._notify(); return { ok: false, reason: 'no_talisman' } }
        chance = TALISMAN_GRADES[grade].tameChance
        const itemId = TALISMAN_GRADES[grade].itemId
        s.inventory[itemId]--
        if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
      }
      res.grade = grade
      if (Math.random() < chance) {
        b.bound++
        const beast = { id: rec.encId, typeId: rec.typeId, ...(rec.variant ? { variant: rec.variant } : {}), name,
          level: BEAST_BOUND_LEVEL, xp: 0, traits: [...rec.traits], expedition: null }
        s.beasts = s.beasts || []
        s.beasts.push(beast)
        res.beast = beast
        this._claimFirst('first_beast')
        this.addEvent({ text: `Beaten and bound, the ${name} bows its head. It joins you at Lv.${BEAST_BOUND_LEVEL}.`, type: 'special' })
        this._emit('beast_spared', { beast: name, bound: true })
        this._emit('beast_tamed', { name })
      } else {
        res.bindFailed = true
        res.outcome = 'bind_failed'
        this.addEvent({ text: `You reach for the ${name} — and it slips free, and is gone.`, type: 'neutral' })
        this._emit('tame_failed', { beast: name, outcome: 'escaped' })
      }
    }
    res.karma = Math.round((s.karma - karma0) * 10) / 10
    this._recalc(); this._notify()
    return res
  }

  // ── Phase 23A/B/C: Health, Bloodline Quality, Ascension Trial ──────────────

  // Hidden from the player except on the Ascension screen and after the first attempt (Phase 23B).
  // 1.8b-2: the Ascension Trial's terms, same math as ascensionChance() (checks/breakdowns.js pins the sum).
  // ══ v1 add-on: Legendary bosses + soul techniques (docs/systems/bosses.md; data assets/data/bosses.js) ══════════════
  // World (kept across lives in this save): w.bosses[id] = { tries, wins, mercy, seen, wonLife, restUntil }, w.soulTech =
  // { seed, clone }. Per life: s.soulUse = { seedUsed, essenceUntil }, s.clone = { exp, outSec, linger, gone, restUntil, auto }.
  _ensureBossFields() {
    const s = this._s, w = s?.world
    if (!w) return
    if (!w.bosses || typeof w.bosses !== 'object') w.bosses = {}
    for (const id of BOSS_ORDER) {
      const b = w.bosses[id] ||= {}
      for (const [k, v] of Object.entries({ tries: 0, wins: 0, mercy: 0, seen: false, wonLife: 0, restUntil: 0, awakeLife: 0 })) if (b[k] === undefined) b[k] = v
    }
    if (!w.soulTech || typeof w.soulTech !== 'object') w.soulTech = { seed: false, clone: false }
    if (!s.soulUse || typeof s.soulUse !== 'object') s.soulUse = { seedUsed: false, essenceUntil: 0 }
    if (!s.clone || typeof s.clone !== 'object') s.clone = { exp: null, outSec: 0, linger: null, gone: false, restUntil: 0, auto: false }
    // 2026-10-05: the clone can temper your body too — its own tempering slot, what it has trained, and its auto duty
    for (const [k, v] of Object.entries({ temper: null, temperXp: 0, autoDuty: 'explore', autoTemperId: null, lastTemperId: null })) if (s.clone[k] === undefined) s.clone[k] = v
    if (s.clone.temper && !this._temperMethod(s.clone.temper.id)) s.clone.temper = null
    if (!['explore', 'temper'].includes(s.clone.autoDuty)) s.clone.autoDuty = 'explore'
  }
  _stName(i) { return typeof stageShortName === 'function' ? stageShortName(i) : (CULTIVATION_STAGES[i]?.realm || 'stage ' + i) }
  soulTechKnown(id) { return !!this._s.world?.soulTech?.[id] }

  // ── The bosses ──
  // Why a boss can't be fought now (null = it can): 'life' / 'stage' gates, 'won' (beaten this life), 'rest' (real time).
  _bossLock(id) {
    const s = this._s, def = BOSSES[id], rec = s.world.bosses[id], life = this._lifeNo()
    if (life < def.gates.life) return 'life'
    if (s.stageIndex < def.gates.stage) return 'stage'
    if (rec.wonLife === life) return 'won'
    if (Date.now() < (rec.restUntil || 0)) return 'rest'
    return null
  }
  _bossPower(def, rec) {
    const B = BOSS_FIGHT, s = this._s, over = Math.max(0, s.stageIndex - def.gates.stage), mercy = Math.min(B.mercyMax, rec.mercy || 0)
    const parts = [{ label: `Its might (${this._stName(def.gates.stage)} and beyond)`, value: def.gates.stage * 100 + def.power }]
    if (over) parts.push({ label: 'It meets you where you stand', value: over * 60 })
    if (mercy) parts.push({ label: `It remembers your mercy (×${mercy})`, value: mercy * B.mercyRealm })
    return { parts, total: parts.reduce((a, p) => a + p.value, 0) }
  }
  _mbFoeBoss(def, rec, you) {
    const MC = MOVE_COMBAT, B = BOSS_FIGHT, s = this._s, ph = def.phases[0]
    const over = Math.max(0, s.stageIndex - def.gates.stage), mercy = Math.min(B.mercyMax, rec.mercy || 0)
    const max = Math.round(MC.beastHpBase * MC.foeHpMult * def.hpMult * (1 + over * B.stageScale) * (1 + mercy * B.mercyHp))
    const moves = ph.mirror ? [...new Set([...(you.moves || []), ...ph.moves])] : [...ph.moves]
    const P = { might: 0, ward: 0, swift: 0, qiPool: 0, qiRegen: 0, crit: 0, statusResist: 0.2, lifesteal: 0, parry: 1, heal: 0, el: {}, parryChance: def.parryChance }
    return { side: 'foe', name: def.short, the: `the ${def.short}`, dmgMult: MC.foeDmgMult * (ph.dmgMult || 1), hp: max, max, qi: MC.qiPool, pool: MC.qiPool, regen: MC.qiRegen,
      power: this._bossPower(def, rec).total, element: def.element, elements: [def.element], swift: def.swift, moves, mastery: ph.mirror ? { ...you.mastery } : {}, P,
      style: { press: 1, guard: 0.7, feint: 0.7 }, st: {}, burn: 0, buffs: [], ward: 0, reflect: 0, counterPow: 0, charging: null, circ: false, sealed: null, boss: def.id }
  }
  // A fresh boss battle. `you.P.might` carries what your past attempts taught you (+3% per try, max +15%).
  _mbNewBoss(id) {
    const def = BOSSES[id], rec = this._s.world.bosses[id], B = BOSS_FIGHT
    const you = this._mbYou('boss'), learn = Math.min(B.learnMax, (rec.tries || 0) * B.learnPerTry)
    if (learn) you.P = { ...you.P, might: (you.P.might || 0) + learn }
    const read = Math.min(B.readMax, B.readBase + (rec.tries || 0) * B.readPerTry)
    return { stance: 'boss', turn: 1, you, foe: this._mbFoeBoss(def, rec, you), plan: null, planIdx: 0, pending: null, over: null, lines: [],
      boss: { id, phase: 0, egg: 0, split: false, read, hatched: false, learn } }
  }
  // The phase script: called from _mbCheck before a win is declared (so a rebirth can catch a killing blow).
  _mbBossPhase(b) {
    const B = b.boss, def = BOSSES[B.id], F = b.foe
    for (let i = B.phase + 1; i < def.phases.length; i++) {
      const ph = def.phases[i]
      if (F.hp > F.max * ph.at) break
      if (F.hp <= 0 && !ph.heal) break                     // a blow that kills it outright ends it (only a rebirth stops death)
      B.phase = i; B.shift = (B.shift || 0) + 1
      if (ph.heal) F.hp = Math.max(F.hp, Math.round(F.max * ph.heal))
      if (ph.elements) { F.element = ph.element || F.element; F.elements = [...ph.elements] }
      let moves = [...ph.moves]
      if (ph.steal) {                                      // the Wraith turns your strongest art back on you
        const top = (b.you.moves || []).map(id => this._mbArt(id)).filter(a => a && MOVE_ATTACKS.includes(a.move.type))
          .sort((x, y) => (y.move.power || 0) * (y.move.hits || 1) - (x.move.power || 0) * (x.move.hits || 1))[0]
        if (top) { moves = [top.id, ...moves]; F.mastery = { ...F.mastery, [top.id]: b.you.mastery?.[top.id] || 1 }; B.stolen = top.id }
      }
      F.moves = moves; F.charging = null; F.sealed = null
      if (ph.dmgMult) F.dmgMult = MOVE_COMBAT.foeDmgMult * ph.dmgMult
      if (ph.egg) B.egg = ph.egg
      if (ph.split) B.split = true
      if (ph.unsplit) B.split = false
      if (ph.line) this._mbLine(b, 'foe', ph.line, 'down')
      if (ph.heal) break                                   // a rebirth lifts it above the next mark
    }
  }
  // End of a turn: the Bird's egg counts down, and hatches if it still lives.
  _mbBossTurn(b) {
    const B = b.boss, def = BOSSES[B.id], F = b.foe
    if (!B.egg || F.hp <= 0) return
    if (--B.egg > 0) return
    const ph = def.phases[B.phase]
    F.hp = Math.min(F.max, F.hp + Math.round(F.max * (ph.hatchHeal || 0)))
    F.moves = [...(def.phases[Math.max(0, B.phase - 1)].moves || [])]
    B.hatched = true; B.shift = (B.shift || 0) + 1
    this._mbLine(b, 'foe', def.hatchLine || 'It hatches.', 'down')
  }

  // Public (UI + bot): every boss — its gates as a checklist, your record with it, the rest countdown, what it teaches.
  bossInfo() {
    const s = this._s, w = s.world, life = this._lifeNo()
    return BOSS_ORDER.map(id => {
      const def = BOSSES[id], rec = w.bosses[id], lock = this._bossLock(id), T = SOUL_TECH[def.technique]
      return { id, name: def.name, short: def.short, lore: def.lore, element: def.element, art: def.art || null,
        technique: { id: T.id, name: T.name, desc: T.desc, known: !!w.soulTech[T.id] },
        gates: [{ k: 'life', ok: life >= def.gates.life, text: `Your ${this._ordinal(def.gates.life)} life or later`, now: `this is your ${this._ordinal(life)}` },
                { k: 'stage', ok: s.stageIndex >= def.gates.stage, text: `${this._stName(def.gates.stage)} or higher`, now: this._stName(s.stageIndex) }],
        lock, restLeft: lock === 'rest' ? Math.ceil((rec.restUntil - Date.now()) / 1000) : 0,
        seen: !!rec.seen, tries: rec.tries || 0, wins: rec.wins || 0, mercy: rec.mercy || 0, wonThisLife: rec.wonLife === life,
        learn: Math.min(BOSS_FIGHT.learnMax, (rec.tries || 0) * BOSS_FIGHT.learnPerTry),
        phases: def.phases.map(p => ({ name: p.name, text: p.text, at: p.at })),
        line: rec.mercy ? def.lines.mercy : (rec.tries || rec.wins) ? def.lines.again.replace('{n}', this._ordinal((rec.tries || 0) + (rec.wins || 0) + 1)) : def.lines.first,
        drop: { name: ITEMS[def.drop.item]?.name || def.drop.item, n: def.drop.n + Math.min(BOSS_FIGHT.mercyMax, rec.mercy || 0) * BOSS_FIGHT.mercyDropBonus } }
    })
  }
  _ordinal(n) { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th') }
  // The prepare step: the estimate (a Monte Carlo of the phased fight, like a beast's), what a loss costs.
  bossFightPreview(id) {
    const def = BOSSES[id]
    if (!def) return null
    const s = this._s, lock = this._bossLock(id) || (s.family?.fight ? 'busy' : (s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH ? 'wounded' : null)
    const b0 = this._mbNewBoss(id), est = this._mbEstimate(b0)
    return { id, name: def.name, lock, chance: est.chance, turns: est.turns, hurt: Math.round(est.hurt), parryRate: est.parryRate,
      foeHp: b0.foe.max, power: this._bossPower(def, this._s.world.bosses[id]), learn: b0.boss.learn, read: b0.boss.read,
      lossHealth: Math.round(this.maxHealth() * BOSS_FIGHT.lossHealth), restSec: BOSS_FIGHT.restSec }
  }
  startBossFight(id) {
    const pv = this.bossFightPreview(id)
    if (!pv) return { ok: false, reason: 'unknown' }
    if (pv.lock) return { ok: false, reason: pv.lock }
    const s = this._s, rec = s.world.bosses[id]
    rec.seen = true
    this._startFight('boss', { id: 'boss:' + id }, false, { boss: { id }, m: this._mbNewBoss(id) })
    this.addEvent({ text: `You climb to face the ${BOSSES[id].name}.`, type: 'special' })
    return { ok: true, fight: true, chance: pv.chance }
  }
  _bossOpp(fi) { const def = BOSSES[fi.boss?.id]; return def ? { id: fi.oppId, name: def.short, boss: def.id } : null }
  _mbLiveBoss(b, fi, r, out) {
    const s = this._s, def = BOSSES[fi.boss.id]
    out.phase = b.boss.phase; out.shift = b.boss.shift || 0
    if (r === 'over') {
      if (b.over === 'won') {
        fi.over = 'won'
        this.addEvent({ text: `The ${def.short} falls, and does not rise. What you take from it is yours to decide.`, type: 'positive' })
        out.over = 'won'
      } else { out.done = true; out.outcome = this._bossLost(fi, false) }
    }
    if (!out.done) { this._recalc(); this._notify() }
    return out
  }
  // A loss or a retreat: never death. A loss leaves you at 10% Health; either way it rests (real time) and you learn.
  _bossLost(fi, retreated) {
    const s = this._s, def = BOSSES[fi.boss.id], rec = s.world.bosses[def.id], B = BOSS_FIGHT
    rec.tries = (rec.tries || 0) + 1
    rec.restUntil = Date.now() + B.restSec * 1000
    if (!retreated) s.health = Math.max(1, Math.round(this.maxHealth() * B.lossHealth))
    s.family.fight = null
    this.addEvent({ text: retreated ? `You break away from the ${def.short}. It returns to its slumber; you know its rhythm a little better now.`
      : `The ${def.short} throws you down the mountain. You live, barely. You know its rhythm a little better now.`, type: 'negative' })
    this._emit('battle_lost', { beast: def.short, retreated })
    this._recalc(); this._notify()
    return retreated ? 'retreated' : 'lost'
  }
  // The end choice after a win: take its heart (the drop) or let it return to the wild (mercy). Both teach the technique once.
  bossFightChoices() {
    const fi = this._s.family?.fight
    if (fi?.kind !== 'boss' || fi.over !== 'won') return null
    const def = BOSSES[fi.boss.id], rec = this._s.world.bosses[def.id], T = SOUL_TECH[def.technique], B = BOSS_FIGHT
    const n = def.drop.n + Math.min(B.mercyMax, rec.mercy || 0) * B.mercyDropBonus
    return { id: def.id, name: def.short, technique: { name: T.name, desc: T.desc, isNew: !this._s.world.soulTech[T.id] },
      heart: { drop: `${n} ${ITEMS[def.drop.item]?.name || def.drop.item}`, renown: def.renown, recipe: def.id === 'wraith' ? ITEMS.artifact_mirror_soul_plate.name : null },
      mercy: { karma: B.mercyKarma, honour: B.mercyHonour } }
  }
  bossFightFinish(choice) {
    const s = this._s, fi = s.family?.fight
    if (fi?.kind !== 'boss' || fi.over !== 'won') return { ok: false, reason: 'none' }
    if (choice !== 'heart' && choice !== 'mercy') return { ok: false, reason: 'bad_choice' }
    const def = BOSSES[fi.boss.id], rec = s.world.bosses[def.id], T = SOUL_TECH[def.technique], B = BOSS_FIGHT, w = s.world
    const n = def.drop.n + Math.min(B.mercyMax, rec.mercy || 0) * B.mercyDropBonus
    rec.wins = (rec.wins || 0) + 1; rec.wonLife = this._lifeNo()
    const learned = !w.soulTech[T.id]
    w.soulTech[T.id] = true
    let drop = null, recipe = null
    if (choice === 'heart') {
      s.inventory[def.drop.item] = (s.inventory[def.drop.item] || 0) + n; drop = { [def.drop.item]: n }
      this._ranks().renown = (this._ranks().renown || 0) + def.renown   // the Heavenly Rankings' renown (4.8)
      if (def.id === 'wraith' && this._learnRecipe('recipe_artifact_mirror_soul_plate', 'boss')) recipe = ITEMS.artifact_mirror_soul_plate.name
      this.addEvent({ text: `You take the ${def.short}'s heart: ${n} ${ITEMS[def.drop.item]?.name}.`, type: 'positive' })
    } else {
      rec.mercy = (rec.mercy || 0) + 1
      s.karma = Math.min(100, (s.karma ?? 50) + B.mercyKarma)
      const rep = this._rep(); rep.h = Math.min(NPC_REP.max, rep.h + B.mercyHonour)
      this.addEvent({ text: `You let the ${def.short} return to the wild. It will remember, and grow.`, type: 'special' })
    }
    if (learned) this.addEvent({ text: `Its secret is yours, and your soul will keep it in every life to come: ${T.name}.`, type: 'special' })
    s.family.fight = null
    this._emit('boss_won', { beast: def.short, technique: T.name, learned })
    this._recalc(); this._notify()
    return { ok: true, choice, learned, technique: T.name, drop, recipe }
  }
  // Yearly (the year-turn queue): a boss whose gates are newly met this life is announced once (toast + attention).
  _tickSoulTech() {
    const s = this._s, w = s.world, life = this._lifeNo()
    if (s.interlude) return
    for (const id of BOSS_ORDER) {
      const rec = w.bosses[id], lock = this._bossLock(id)
      if ((lock === null || lock === 'rest') && rec.awakeLife !== life) {
        rec.awakeLife = life; rec.fresh = true
        this.addEvent({ text: `Something legendary stirs. The ${BOSSES[id].name} can be faced in Roam → Hunt.`, type: 'special' })
        this._emit('boss_awake', { beast: BOSSES[id].short })
      }
    }
    this._tickMirrorChildren()
  }
  markBossSeen(id) { const r = this._s.world.bosses?.[id]; if (r) r.fresh = false }

  // ── Seed of the Self: the mirror heir ──
  seedInfo() {
    const s = this._s, T = SOUL_TECH.seed
    if (!this.soulTechKnown('seed')) return null
    const max = this.maxHealth(), cost = Math.round(max * T.healthCost)
    const lock = s.soulUse.seedUsed ? 'Once a life: your seed is already spent'
      : s.stageIndex < T.minStage ? `Reach ${this._stName(T.minStage)} first`
      : (s.health ?? 100) < max * T.minHealthFrac ? `Needs ${Math.ceil(max * T.minHealthFrac)} Health (you have ${Math.floor(s.health ?? 100)})`
      : s.interlude ? 'Not between lives' : null
    const sp = s.family?.spouse
    return { name: T.name, desc: T.desc, lock, used: !!s.soulUse.seedUsed, healthCost: cost, essenceSec: T.essenceSec, qiMult: T.essenceQiMult,
      essenceLeft: Math.max(0, Math.ceil(((s.soulUse.essenceUntil || 0) - Date.now()) / 1000)),
      spouse: sp ? { name: sp.given, reacts: this._seedSpouseReact(sp) } : null }
  }
  _seedSpouseReact(sp) { return ['jealous', 'proud', 'hothead', 'tyrant', 'arrogant'].includes(sp.personality) ? 'hurt' : ['gentle', 'niceguy', 'scholar', 'stoic', 'monk'].includes(sp.personality) ? 'accept' : 'unsure' }
  useSeedOfSelf() {
    const s = this._s, T = SOUL_TECH.seed, info = this.seedInfo()
    if (!info) return { ok: false, reason: 'unknown' }
    if (info.lock) return { ok: false, reason: 'locked', lock: info.lock }
    s.health = Math.max(1, (s.health ?? 100) - info.healthCost)
    s.soulUse.seedUsed = true; s.soulUse.essenceUntil = Date.now() + T.essenceSec * 1000
    const child = this._makeMirrorChild()
    const sp = s.family.spouse
    let react = null
    if (sp) {
      react = this._seedSpouseReact(sp)
      if (react === 'accept') this._changeAffection(6, `${child.given}, a child of your own essence`)
      else if (react === 'hurt') { this._changeAffection(-10, 'a child made without them'); s.family.seedCrisis = { childId: child.id, spouse: sp.given } }
      else if (Math.random() < 0.5) { this._changeAffection(-6, 'a child made without them'); s.family.seedCrisis = { childId: child.id, spouse: sp.given } }
    }
    this._emit('mirror_born', { child: child.given })
    this._recalc(); this._notify()
    return { ok: true, child: child.given, childId: child.id, react, crisis: !!s.family.seedCrisis }
  }
  _makeMirrorChild() {
    const s = this._s, f = s.family, yr = Math.floor(s.world.year), T = SOUL_TECH.seed
    const taken = new Set(f.children.map(c => c.given))
    let given = Persons.rollGiven()
    for (let i = 0; i < 3 && taken.has(given); i++) given = Persons.rollGiven()
    const child = Persons.make({ id: this._newPersonId(), given, family: this._clanSurname(), bornYear: yr,
      root: { ...s.root }, personality: s.personality?.id || Persons.rollPersonality(), role: 'child', alive: true, parents: [s.self.id] })
    child.mirror = true
    child.bond = T.bond
    child.morality = this._rollMorality(child.personality, (s.karma - 50) * MORALITY_KARMA_WEIGHT)
    child.xp = 0; child.cd = {}; child.raised = { time: 0, teach: 0, gift: 0 }
    f.children.push(child)
    this.addEvent({ text: `Year ${yr}: from a seed of your own essence, a child — ${Persons.fullName(child)} (${child.root.name}). It has your eyes, and your heart.`, type: 'special' })
    this._claimFirst('first_child')
    this._emit('child_born', { child: child.given })
    return child
  }
  // The spouse's hurt (a crisis you answer): reassure (affection back, costs a gift's worth of time) · defend (neutral) · dismiss.
  answerSeedCrisis(choice) {
    const f = this._s.family, c = f?.seedCrisis
    if (!c) return { ok: false, reason: 'none' }
    if (!['reassure', 'defend', 'dismiss'].includes(choice)) return { ok: false, reason: 'bad_choice' }
    const d = { reassure: 8, defend: 0, dismiss: -12 }[choice]
    if (d) this._changeAffection(d, { reassure: 'you reassured them', dismiss: 'you dismissed their hurt' }[choice])
    const text = { reassure: `You hold ${c.spouse}'s hands and tell them the child is theirs too. Slowly, they believe it.`,
      defend: `You tell ${c.spouse} the path asked it of you. They say nothing more of it.`,
      dismiss: `You tell ${c.spouse} it is not their concern. Something closes in their face.` }[choice]
    f.seedCrisis = null
    this.addEvent({ text, type: choice === 'dismiss' ? 'negative' : 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, text }
  }
  // Yearly: a grown mirror child turns (bond < turnBond, or wronged) or stands with you (bond ≥ allyBond). Once each.
  _tickMirrorChildren() {
    const s = this._s, f = s.family, T = SOUL_TECH.seed, yr = Math.floor(s.world.year)
    if (!f?.children || f.mirrorTurn) return
    for (const c of f.children) {
      if (!c.mirror || !c.alive || c.estranged || c.mirrorFate || yr - c.bornYear < ADULT_AGE) continue
      if ((c.bond ?? 50) < T.turnBond || c.wronged) { f.mirrorTurn = { childId: c.id, y: yr }; c.mirrorFate = 'turning'
        this.addEvent({ text: `${c.given} wears your face, and wants your seat.`, type: 'negative', pid: c.id }); return }
      if ((c.bond ?? 50) >= T.allyBond) { c.mirrorFate = 'ally'
        this.addEvent({ text: `${c.given} kneels beside you: two hearts, one path. Your mirror child will stand with you in every war.`, type: 'positive', pid: c.id }) }
    }
  }
  mirrorAllyBonus() { return (this._s.family?.children || []).some(c => c.alive && c.mirrorFate === 'ally') ? SOUL_TECH.seed.allyWarBonus : 0 }
  mirrorTurnInfo() {
    const f = this._s.family, t = f?.mirrorTurn, c = t && f.children.find(x => x.id === t.childId)
    if (!c) return null
    return { childId: c.id, name: c.given, stage: c.stageIndex || 0, bond: Math.round(c.bond ?? 50), wronged: !!c.wronged, odds: this.personFightOdds?.(c, 'defend', null)?.chance ?? null }
  }
  // Your answer: yield (they lead the clan, you keep cultivating) · face (a fight for the seat on the battle page) · send away
  // (they renounce the clan name and found a house — the next life's rival comes from it).
  answerMirrorTurn(choice) {
    const s = this._s, f = s.family, info = this.mirrorTurnInfo()
    if (!info) return { ok: false, reason: 'none' }
    const c = f.children.find(x => x.id === info.childId), yr = Math.floor(s.world.year)
    if (choice === 'face') {
      if (f.fight) return { ok: false, reason: 'busy' }
      f.mirrorTurn = null; c.mirrorFate = 'faced'
      this._startFight('defend', c, this._headDecidesLethal(c, this._playerClan?.(), c.bond ?? 50))   // the child's temper decides (2.6e)
      return { ok: true, fight: true }
    }
    if (choice === 'yield') {
      f.mirrorTurn = null; c.mirrorFate = 'yielded'
      const clan = this._playerClan?.()
      if (clan && clan.headId === s.self.id) clan.headId = c.id
      c.bond = Math.min(100, (c.bond ?? 50) + 20)
      this.addEvent({ text: `You bow to ${c.given}. Your mirror leads the clan now; you keep to your cultivation.`, type: 'neutral', pid: c.id })
    } else if (choice === 'send') {
      f.mirrorTurn = null; c.mirrorFate = 'sent'
      const old = this._clanSurname()
      let sur = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
      for (let i = 0; i < 8 && (sur === old || s.world.rivalHouses?.[sur]); i++) sur = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
      f.children = f.children.filter(x => x.id !== c.id)
      for (const cl of Object.values(s.world.clans || {})) for (const l of cl.lines || []) l.memberIds = (l.memberIds || []).filter(id => id !== c.id)
      const p = s.world.persons[c.id] || c
      Object.assign(p, { ...c, family: sur, role: 'wanderer', owner: 'world', estranged: true, mirrorOf: s.self.id })
      s.world.persons[p.id] = p
      s.world.rivalHouses ||= {}
      s.world.rivalHouses[sur] = { surname: sur, pid: p.id, fromLife: this._lifeNo(), fromName: Persons.fullName(p), heat: -50, end: 'mirror', y: yr, used: null }
      this._noteEnemy?.({ kind: 'rival', personId: p.id, name: Persons.fullName(p), surname: sur, why: 'your mirror child' })
      this.addEvent({ text: `${c.given} walks out of the gate and takes the name ${sur}. A house of your own blood will be your rival.`, type: 'negative', pid: p.id })
    } else return { ok: false, reason: 'bad_choice' }
    this._recalc(); this._notify()
    return { ok: true, choice }
  }

  // ── Body Beyond the Body: the clone's own expedition slot ──
  _cloneShatter(loc) { const T = SOUL_TECH.clone; return Math.min(T.shatterMax, T.shatterPerStage * Math.max(0, (loc.minStage || 0) - (this._s.stageIndex - 3))) }
  _cloneWillChance() { const T = SOUL_TECH.clone; return Math.max(0, Math.min(T.willMax, (this._s.clone.outSec || 0) / 3600 * T.willPerHour)) }
  cloneInfo() {
    const s = this._s, T = SOUL_TECH.clone, c = s.clone
    if (!this.soulTechKnown('clone')) return null
    const cost = Math.round(this._qiCapValue() * T.qiCost), will = this._cloneWillChance()
    const lock = c.gone ? 'Your other self walks its own road now (this life)'
      : s.stageIndex < T.minStage ? `Reach ${this._stName(T.minStage)} first`
      : Date.now() < (c.restUntil || 0) ? 'rest' : null
    const exp = c.exp ? { ...c.exp, name: LOCATIONS.find(l => l.id === c.exp.locationId)?.name || '', left: Math.max(0, Math.ceil((c.exp.endsAt - Date.now()) / 1000)) } : null
    const tm = c.temper ? this._temperMethod(c.temper.id) : null
    const temper = c.temper ? { ...c.temper, name: tm?.name || '', group: tm?.group, left: Math.max(0, Math.ceil((c.temper.endsAt - Date.now()) / 1000)) } : null
    return { name: T.name, lock, restLeft: lock === 'rest' ? Math.ceil((c.restUntil - Date.now()) / 1000) : 0, qiCost: cost, qiMult: T.qiMult,
      canPay: s.qi >= cost, exp, temper, busy: !!(c.exp || c.temper), crisis: this.cloneCrisisInfo(), temperXp: c.temperXp || 0,
      linger: c.linger ? { ...c.linger } : null, auto: !!c.auto, autoDuty: c.autoDuty || 'explore', autoTemperId: c.autoTemperId || null,
      lastTemperId: c.lastTemperId || null,
      will, willWord: T.willWords.find(x => will >= x.min).w,
      places: LOCATIONS.filter(l => s.stageIndex >= l.minStage).map(l => ({ id: l.id, name: l.name, duration: l.duration, shatter: this._cloneShatter(l) })) }
  }
  _qiCapValue() { return this._s.derived?.qiCap || this._stage().qiCap || 0 }
  startCloneExpedition(locationId) {
    const s = this._s, info = this.cloneInfo()
    if (!info) return { ok: false, reason: 'unknown' }
    if (info.lock) return { ok: false, reason: 'locked', lock: info.lock }
    if (s.clone.exp || s.clone.temper) return { ok: false, reason: 'active' }
    if (s.clone.linger) return { ok: false, reason: 'linger' }
    const loc = LOCATIONS.find(l => l.id === locationId)
    if (!loc || s.stageIndex < loc.minStage) return { ok: false, reason: 'stage' }
    if (s.qi < info.qiCost) return { ok: false, reason: 'qi' }
    s.qi -= info.qiCost
    s.clone.exp = { locationId, startedAt: Date.now(), endsAt: Date.now() + loc.duration * 1000 * this._activeTimeMult('expedition'), shatter: this._cloneShatter(loc) }
    s.clone.lastLocationId = locationId
    this._recalc(); this._notify()
    return { ok: true, loc }
  }
  recallClone() {
    const c = this._s.clone
    if (c.temper) {
      const m = this._temperMethod(c.temper.id)
      c.temper = null
      this.addEvent({ text: `You call your other self back from ${m?.name || 'its tempering'}. What it cost is spent; the work is lost.`, type: 'neutral' })
      this._recalc(); this._notify()
      return { ok: true }
    }
    if (!c.exp) return { ok: false, reason: 'none' }
    c.exp = null
    this.addEvent({ text: 'You call your other self home before it arrives. It brings nothing back.', type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true }
  }
  setCloneAuto(on) { this._s.clone.auto = !!on; this._notify(); return { ok: true } }
  // "On its own": off, or the duty it repeats — 'explore' (its last place, never above your realm) or 'temper' (a safe
  // drill / spirit method, never an ordeal). The player's delegated chore; any manual send overrides it for that trip.
  setCloneDuty(duty) {
    const c = this._s.clone
    if (duty === 'off') c.auto = false
    else if (duty === 'explore' || duty === 'temper') { c.auto = true; c.autoDuty = duty }
    else return { ok: false, reason: 'unknown' }
    this._notify(); return { ok: true }
  }
  setCloneAutoTemper(id) {
    const m = id ? this._temperMethod(id) : null
    if (id && (!m || (m.group !== 'drill' && m.group !== 'spirit'))) return { ok: false, reason: 'unsafe' }
    this._s.clone.autoTemperId = id || null; this._notify(); return { ok: true }
  }
  _tickClone() {
    const s = this._s, c = s.clone
    if (!c || s.interlude) return
    if (c.exp && Date.now() >= c.exp.endsAt) this._resolveClone()
    let guard = 0
    while (c.temper && !c.temper.crisis && Date.now() >= c.temper.endsAt && guard++ < 60) {
      const end = c.temper.endsAt
      this._resolveCloneTemper()
      this._cloneAutoTemper(end)
    }
    if (c.auto && !c.exp && !c.temper && !c.linger) {   // the player's delegated chore (off by default)
      if (c.autoDuty === 'temper') this._cloneAutoTemper(Date.now())
      else if (c.lastLocationId) {                       // never above your realm
        const info = this.cloneInfo()
        if (info && !info.lock && s.qi >= info.qiCost) this.startCloneExpedition(c.lastLocationId)
      }
    }
  }

  // ── The clone tempers your body (2026-10-05): a second tempering beside yours, full XP, items + the forming Qi paid
  // up front; Qi/s x0.85 while it works (a spirit method's halving falls on it, not you). It may take an ordeal (your
  // choice, never automated): at the peak the risk is its — a failed endure shatters it instead of scarring you.
  cloneTemperCheck(id) {
    const s = this._s, c = s.clone, m = this._temperMethod(id), info = this.cloneInfo()
    if (!info || !m) return 'unknown'
    if (m.group === 'demonic' || m.group === 'tribulation') return 'own_body'
    if (m.locked) return 'locked'
    if (info.lock) return info.lock === 'rest' ? 'rest' : info.lock.startsWith('Reach') ? 'clone_stage' : 'gone'
    if (s.stageIndex < m.minStage) return 'stage'
    if (c.exp || c.temper) return 'busy'
    if (c.linger) return 'linger'
    if (m.once && s.body.ordealsDone[m.id]) return 'once'
    if ((m.group === 'ordeal' || m.once) && s.body.active?.id === m.id) return 'yours'
    if (m.needsBeast && !this._strongestBeast()) return 'no_beast'
    if (Object.entries(m.cost || {}).some(([k, n]) => (s.inventory[k] || 0) < n)) return 'items'
    if (s.qi < info.qiCost) return 'qi'
    return null
  }
  startCloneTempering(id) {
    const r = this.cloneTemperCheck(id)
    if (r) return { ok: false, reason: r }
    return this._beginCloneTemper(this._temperMethod(id), Date.now())
  }
  _beginCloneTemper(m, at) {
    const s = this._s, c = s.clone, cost = this.cloneInfo().qiCost
    for (const [id, n] of Object.entries(m.cost || {})) { s.inventory[id] -= n; if (s.inventory[id] <= 0) delete s.inventory[id] }
    s.qi -= cost
    const xp = this.methodXp(m)
    c.temper = { id: m.id, startedAt: at, endsAt: at + m.secs * 1000, xp, crisis: false }
    if (m.group === 'drill' || m.group === 'spirit') c.lastTemperId = m.id
    this.addEvent({ text: `Your other self begins ${m.name} in your place. (${fmtTime(m.secs)}, about ${fmtQi(xp)} body XP; −${fmtQi(cost)} Qi to form it)`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, xp, endsAt: c.temper.endsAt }
  }
  // Auto duty 'temper': repeats the chosen safe method from where the last one ended (offline too). Never an ordeal.
  _cloneAutoTemper(from) {
    const c = this._s.clone
    if (!c.auto || c.autoDuty !== 'temper' || c.temper || c.exp || c.linger) return
    const id = c.autoTemperId || c.lastTemperId, m = this._temperMethod(id)
    if (!m || (m.group !== 'drill' && m.group !== 'spirit') || this.cloneTemperCheck(id)) return
    this._beginCloneTemper(m, Math.max(from, Date.now() - m.secs * 1000 * 50))
    this._emit('auto_fire', { system: 'clone_temper' })
  }
  _resolveCloneTemper() {
    const s = this._s, c = s.clone, t = c.temper, m = this._temperMethod(t.id)
    if (!m) { c.temper = null; return }
    if (m.group === 'ordeal') {
      t.crisis = true
      this.addEvent({ text: `Your other self reaches the peak of ${m.name}. It looks to you: endure, ease off, or lend it your Qi?`, type: 'special' })
      this._emit('ordeal_crisis', { id: m.id, clone: true })
      return
    }
    c.temper = null
    c.outSec = (c.outSec || 0) + Math.max(0, (t.endsAt - t.startedAt) / 1000)
    if (Math.random() < this._cloneWillChance()) return this._cloneLingers(m, t.xp)
    this._cloneTemperPay(m, t.xp)
  }
  _cloneTemperPay(m, xp0, note = '') {
    const s = this._s, c = s.clone, b = s.body, xp = this._gainBodyXp(xp0)
    c.temperXp = (c.temperXp || 0) + xp
    if (m.group === 'drill' && b.taint > 0) { b.taint = Math.max(0, b.taint - TAINT_CLEANSE_PER_DRILL); note += ' The quiet work draws a little taint from your blood.' }
    b.history.unshift({ id: m.id, year: Math.floor(s.world.year), xp, clone: true })
    if (b.history.length > 20) b.history.length = 20
    this.addEvent({ text: `Your other self finishes ${m.name}, and the body it trained is yours: +${fmtQi(xp)} body XP.${this.tierTrialInfo().ready ? ' Your body is ready for the tier trial.' : ''}${note}`, type: 'positive' })
    this._recalc(); this._notify()
    return xp
  }
  _cloneLingers(m, xp) {
    const c = this._s.clone
    c.linger = { kind: 'temper', place: m.name, drops: {}, xp }
    this.addEvent({ text: `Your other self finishes ${m.name} and does not come back to you. It flexes hands that are yours, and looks at you with your own eyes.`, type: 'special' })
    this._emit('clone_lingers', {})
    this._recalc(); this._notify()
  }
  cloneCrisisInfo() {
    const s = this._s, t = s.clone?.temper
    if (!t?.crisis) return null
    const m = this._temperMethod(t.id), C = ORDEAL_CRISIS, T = SOUL_TECH.clone, qiCost = Math.round((s.derived?.qiCap || 0) * C.qiFrac)
    return { id: m.id, name: m.name, xp: t.xp, easeXp: Math.round(t.xp * C.easeXp), odds: this.ordealOdds(), qiCost, qiOk: s.qi >= qiCost,
             bonus: this._endureBonusText(m), shatterHealth: Math.round(this.maxHealth() * T.shatterHealth), restSec: T.restSec }
  }
  // The clone's ordeal peak — always the player's answer. Endure: on the same odds as yours (it has your body), clean ->
  // the XP + the ordeal's reward; failed -> it shatters (Health -20%, 20:00 rest, no XP) and you keep no scar.
  answerCloneOrdeal(choice) {
    const info = this.cloneCrisisInfo()
    if (!info) return { ok: false, reason: 'no_crisis' }
    const s = this._s, c = s.clone, b = s.body, t = c.temper, m = this._temperMethod(info.id), T = SOUL_TECH.clone
    if (choice === 'qi' && !info.qiOk) return { ok: false, reason: 'qi' }
    if (!['qi', 'ease', 'endure'].includes(choice)) return { ok: false, reason: 'unknown' }
    c.temper = null
    c.outSec = (c.outSec || 0) + Math.max(0, (t.endsAt - t.startedAt) / 1000)
    if (m.once || m.group === 'ordeal') b.ordealsDone[m.id] = (b.ordealsDone[m.id] || 0) + 1
    const res = { ok: true, choice }
    if (choice === 'qi') {
      s.qi -= info.qiCost
      this._applyEndureBonus(m)
      res.xp = this._cloneTemperPay(m, info.xp, ` You poured ${fmtQi(info.qiCost)} Qi into it and it came through whole.`)
    } else if (choice === 'ease') {
      res.xp = this._cloneTemperPay(m, info.easeXp, ' It eased off at the peak.')
    } else if (Math.random() < info.odds.chance) {
      res.clean = true; b.cleanEndures++
      this._applyEndureBonus(m)
      res.xp = this._cloneTemperPay(m, info.xp, info.bonus ? ` It endured to the end. (${info.bonus})` : ' It endured to the end.')
      this._emit('ordeal_endure', { id: m.id, clone: true })
    } else {
      res.clean = false; res.shattered = true
      s.health = Math.max(1, (s.health ?? 100) - info.shatterHealth)
      c.restUntil = Date.now() + T.restSec * 1000
      this.addEvent({ text: `${m.name} breaks your other self before it breaks the ordeal. It shatters, and the backlash tears through you (−${info.shatterHealth} Health). No scar is yours: the body that broke was its.`, type: 'negative' })
      this._emit('clone_shattered', {})
      this._recalc(); this._notify()
    }
    return res
  }
  _resolveClone() {
    const s = this._s, c = s.clone, T = SOUL_TECH.clone, exp = c.exp, loc = LOCATIONS.find(l => l.id === exp.locationId)
    c.exp = null
    if (!loc) return
    c.outSec = (c.outSec || 0) + Math.max(0, (exp.endsAt - exp.startedAt) / 1000)
    if (Math.random() < (exp.shatter || 0)) {
      s.health = Math.max(1, (s.health ?? 100) - Math.round(this.maxHealth() * T.shatterHealth))
      c.restUntil = Date.now() + T.restSec * 1000
      this.addEvent({ text: `Your other self shatters at ${loc.name}. The backlash tears through you (−${Math.round(this.maxHealth() * T.shatterHealth)} Health).`, type: 'negative' })
      this._emit('clone_shattered', {})
      this._recalc(); this._notify(); return
    }
    const drops = this._rollDrops(loc)
    if (Math.random() < this._cloneWillChance()) {   // It lingers: the drops wait on your answer
      c.linger = { locationId: loc.id, place: loc.name, drops }
      this.addEvent({ text: `Your other self does not come home from ${loc.name}. It sits on a stone and looks back at you with your own eyes.`, type: 'special' })
      this._emit('clone_lingers', {})
      this._recalc(); this._notify(); return
    }
    const got = this._cloneGive(drops)
    this.addEvent({ text: `Your other self returns from ${loc.name}: ${got || 'little of worth'}.`, type: 'positive' })
    this._roadRoll('expedition', loc, `${loc.name}, where your other self walked`)
    this._recalc(); this._notify()
  }
  _cloneGive(drops) {
    const s = this._s, parts = []
    for (const [id, q] of Object.entries(drops || {})) {
      if (ITEMS[id]?.type === 'currency') s.spiritStones += q; else s.inventory[id] = (s.inventory[id] || 0) + q
      parts.push(`${q}× ${ITEMS[id]?.name || id}`)
    }
    return parts.join(', ')
  }
  // It Lingers: draw it back in (its drops + mastery on one of your arts; its will resets) or let it walk its own road
  // (a real person with your face and root joins the world; the technique's slot is closed for the rest of this life).
  answerCloneLinger(choice) {
    const s = this._s, c = s.clone, L = c.linger
    if (!L) return { ok: false, reason: 'none' }
    if (choice === 'absorb') {
      let got = this._cloneGive(L.drops)
      if (L.xp) { const xp = this._gainBodyXp(L.xp); s.clone.temperXp = (s.clone.temperXp || 0) + xp; got = `${got ? got + ', ' : ''}+${fmtQi(xp)} body XP` }
      const ids = (s.arts?.loadout?.moves || []).filter(id => id && s.arts.known?.[id] && (s.arts.known[id].mastery || 1) < ART_MASTERY_MAX)
      const art = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null
      if (art) s.arts.known[art].mastery = (s.arts.known[art].mastery || 1) + 1
      c.linger = null; c.outSec = 0
      this.addEvent({ text: `You draw your other self back in. Its road becomes yours: ${got || 'little of worth'}${art ? `, and a deeper grasp of ${ARTS[art]?.name}` : ''}.`, type: 'positive' })
      this._recalc(); this._notify()
      return { ok: true, choice, art }
    }
    if (choice === 'release') {
      const me = s.self, yr = Math.floor(s.world.year)
      const p = this._mintPerson({ family: me.family || null, given: `${me.given || s.name}`, stage: Math.max(0, s.stageIndex - 3), age: [s.age || 20, s.age || 20],
        personality: s.personality?.id || null, root: { ...s.root }, role: 'wanderer' }, Math.random)
      p.cloneOf = me.id; p.rel = 20; p.fam = 1; p.seenY = yr
      // the body it trained walks away with it: a clone that tempered keeps your body tier (a hard rival on the road);
      // one that never did is a shade of it, a tier below
      p.bodyTier = c.temperXp > 0 ? s.body.tier : Math.max(0, s.body.tier - 1)
      p.mem = [{ y: yr, k: 'cloneFreed', text: `You let me go at ${L.place}. I have your face, ${c.temperXp > 0 ? 'the body I trained for you, ' : ''}and my own road.`, d: 20, life: this._lifeNo() }]
      c.linger = null; c.gone = true; c.exp = null; c.temper = null
      this.addEvent({ text: `You let your other self go. It walks away from ${L.place} with your face, and your name, and a road of its own.`, type: 'special', pid: p.id })
      this._recalc(); this._notify()
      return { ok: true, choice, pid: p.id }
    }
    return { ok: false, reason: 'bad_choice' }
  }

  ascensionBreakdown() {
    const s = this._s
    const bq = s.bloodlineQuality || 0
    const parts = [{ label: 'Heaven’s mercy', op: 'base', value: ASCENSION_BASE_CHANCE },
                   { label: `Bloodline ${Math.round(bq)}`, op: '+', value: bq * ASCENSION_BQ_COEF }]
    parts.push({ label: 'Integrity at 100', op: '+', value: (s.realmIntegrity ?? 100) >= 100 ? ASCENSION_PREP_INTEGRITY : 0, want: ASCENSION_PREP_INTEGRITY })
    parts.push({ label: 'Health full',      op: '+', value: (s.health ?? 100) >= this.maxHealth() ? ASCENSION_PREP_HEALTH : 0, want: ASCENSION_PREP_HEALTH })
    // Phase 47: the Trial is gated on the full bloodline — surface it so the UI can explain the lock.
    return { parts, cap: ASCENSION_CHANCE_CAP, total: this.ascensionChance(),
      req: { need: ASCENSION_MIN_BLOODLINE, have: bq, met: bq >= ASCENSION_MIN_BLOODLINE } }
  }

  // ── Phase 14 (docs/systems/body-constitution.md): Body Constitution & Tempering ─────────────────────────────
  // The body is a second path beside Qi: every life starts at F (Frail Body) and trains up to S on real-time tempering.
  // The tier sets max Health, Health regen, the Qi kept on a failed breakthrough and a share of fight power. Ordeals stop
  // at a crisis the player answers; the tier only rises through a trial the player chooses. Data: tempering.js.
  _blankBody() {
    return { tier: 0, xp: 0, active: null, last: null, scars: [], taint: 0, cleanEndures: 0, ordealsDone: {}, btBonus: 0,
             rootBoost: null, bloodForgings: 0, history: [] }
  }
  _blankMinigames() {
    return { strikes: { charges: MINIGAME_CHARGES.max, nextAt: null, best: 0, plays: 0, session: null },
             flow:    { charges: MINIGAME_CHARGES.max, nextAt: null, best: null, plays: 0, hour: [], session: null } }
  }
  _ensurePhase14Fields() {
    const s = this._s
    if (!s.body || typeof s.body !== 'object') s.body = this._blankBody()
    const b = s.body, d = this._blankBody()
    for (const k of Object.keys(d)) if (b[k] === undefined) b[k] = d[k]
    b.tier = Math.max(0, Math.min(BODY_TIERS.length - 1, b.tier | 0))
    if (!(b.xp >= 0)) b.xp = 0
    if (b.active && !this._temperMethod(b.active.id)) b.active = null
    if (!s.minigames || typeof s.minigames !== 'object') s.minigames = this._blankMinigames()
    const m = s.minigames, dm = this._blankMinigames()
    for (const k of ['strikes', 'flow']) {
      if (!m[k] || typeof m[k] !== 'object') m[k] = dm[k]
      for (const f of Object.keys(dm[k])) if (m[k][f] === undefined) m[k][f] = dm[k][f]
      m[k].charges = Math.max(0, Math.min(MINIGAME_CHARGES.max, m[k].charges | 0))
    }
    if (s.health > this.maxHealth()) s.health = this.maxHealth()
  }
  _temperMethod(id) { return TEMPERING_METHODS.find(m => m.id === id) || null }

  // Max Health: the tier's, less any scars. Safe before _recalc (reads s.body directly).
  maxHealth() {
    const b = this._s?.body
    if (!b) return 100
    const base = BODY_TIERS[b.tier || 0].maxHealth
    const scar = (b.scars || []).reduce((a, x) => a + (BODY_SCARS[x.id]?.maxHealth || 0), 0)
    return Math.max(1, Math.round(base * (1 + scar)))
  }
  healthRegenSeconds() {
    const b = this._s?.body
    if (!b) return HEALTH_REGEN_SECONDS
    const scar = (b.scars || []).reduce((a, x) => a + (BODY_SCARS[x.id]?.regen || 0), 0)
    return BODY_TIERS[b.tier || 0].regenSec / Math.max(0.1, 1 + scar)
  }
  bodyTier(i = this._s?.body?.tier || 0) { return BODY_TIERS[i] }

  // XP past the next mark banks toward the trial, up to BODY_BANK_FRAC of the step after it. At S nothing more is gained.
  _bodyXpCap() {
    const i = this._s.body.tier, T = BODY_TIERS, next = T[i + 1]
    if (!next) return T[i].xp
    const after = T[i + 2] ? T[i + 2].xp - next.xp : next.xp - T[i].xp
    return Math.round(next.xp + BODY_BANK_FRAC * after)
  }
  _gainBodyXp(n) {
    const b = this._s.body, before = b.xp
    b.xp = Math.min(this._bodyXpCap(), b.xp + Math.max(0, Math.round(n)))
    return b.xp - before
  }
  // Every tempering's XP multiplier: a founder's Training Ground + Active Mode. Parts for the breakdown.
  temperXpMult() {
    const s = this._s, parts = [{ label: 'Base', op: 'base', value: 1 }]
    let m = 1
    const tg = s.ownSect?.founded ? (s.ownSect.buildings?.training_ground || 0) : 0
    if (tg) { m += tg * TEMPERING_XP_TRAINING_GROUND; parts.push({ label: `Training Ground Lv.${tg}`, op: '+', value: tg * TEMPERING_XP_TRAINING_GROUND }) }
    if (s.playMode === 'active') { m += TEMPERING_XP_ACTIVE; parts.push({ label: 'Active Mode', op: '+', value: TEMPERING_XP_ACTIVE }) }
    return { mult: m, parts }
  }
  _strongestBeast() {
    let best = null, bv = -1
    for (const x of this._s.beasts || []) { const v = (x.level || 1) * this.beastProfile(x).might; if (v > bv) { bv = v; best = x } }
    return best
  }
  _methodBaseXp(m) {
    if (m.xp === 'beast') { const x = this._strongestBeast(); return x ? TEMPERING_BEAST_XP.base + TEMPERING_BEAST_XP.perLevelMight * (x.level || 1) * this.beastProfile(x).might : 0 }
    if (m.xp === 'blood') return BLOOD_FORGING.xpMult * this._bestTemperRate() * m.secs / 3600
    return m.xp
  }
  // The best XP per hour among the methods your realm has opened (numeric XP only): the yardstick for Blood Forging
  // and the Tempering Strikes reward.
  _bestTemperRate() {
    const st = this._s.stageIndex
    return Math.max(...TEMPERING_METHODS.filter(m => !m.locked && typeof m.xp === 'number' && st >= m.minStage).map(m => m.xp / (m.secs / 3600)))
  }
  methodXp(m) { return Math.round(this._methodBaseXp(m) * this.temperXpMult().mult) }
  _bloodOpen() { const s = this._s; return s.body.bloodForgings > 0 || s.karma <= BLOOD_FORGING.unlockKarma }

  // Public (UI): every method with its cost, XP, and why it can't start (reason) if it can't.
  temperingList() {
    const s = this._s, b = s.body, cloneOn = this.soulTechKnown('clone') && !s.clone?.gone
    return TEMPERING_METHODS.filter(m => m.group !== 'demonic' || this._bloodOpen()).map(m => {
      const cost = Object.entries(m.cost || {}).map(([id, n]) => ({ id, name: ITEMS[id]?.name || id, n, have: s.inventory[id] || 0 }))
      const out = { id: m.id, group: m.group, name: m.name, desc: m.desc, secs: m.secs, cost, xp: m.locked ? m.xp : this.methodXp(m),
                    qiMult: m.qiMult || 1, onEndure: m.onEndure || null, once: !!m.once, minStage: m.minStage, ok: true, reason: null }
      if (m.group === 'demonic') out.blood = { health: BLOOD_FORGING.health, karma: BLOOD_FORGING.karma, taint: BLOOD_FORGING.taint }
      if (m.needsBeast) { const x = this._strongestBeast(); out.beast = x ? (x.name || 'your beast') : null }
      const lock = r => { if (out.ok) { out.ok = false; out.reason = r } }
      if (m.locked) lock('locked')
      if (s.stageIndex < m.minStage) lock('stage')
      if (m.once && b.ordealsDone[m.id]) lock('once')
      if (m.needsBeast && !this._strongestBeast()) lock('no_beast')
      if ((m.group === 'ordeal' || m.once) && s.clone?.temper?.id === m.id) lock('clone_same')
      if (b.active) lock('busy')
      if (cost.some(c => c.have < c.n)) lock('items')
      if (m.group === 'demonic' && (s.health ?? 100) <= BLOOD_FORGING.health) lock('health')
      if (out.reason === 'locked') out.lockText = m.locked
      if (cloneOn && m.group !== 'demonic' && m.group !== 'tribulation') out.clone = { reason: this.cloneTemperCheck(m.id) }
      return out
    })
  }
  startTempering(id) {
    const s = this._s, b = s.body, m = this._temperMethod(id)
    if (!m) return { ok: false, reason: 'unknown' }
    const row = this.temperingList().find(x => x.id === id)
    if (!row) return { ok: false, reason: 'karma' }
    if (!row.ok) return { ok: false, reason: row.reason }
    return this._beginTempering(m, Date.now())
  }
  _beginTempering(m, at) {
    const s = this._s, b = s.body
    for (const [id, n] of Object.entries(m.cost || {})) { s.inventory[id] -= n; if (s.inventory[id] <= 0) delete s.inventory[id] }
    const xp = this.methodXp(m)
    if (m.group === 'demonic') {
      s.health = Math.max(1, (s.health ?? 100) - BLOOD_FORGING.health)
      s.karma = Math.max(0, s.karma + BLOOD_FORGING.karma)
      b.taint = Math.min(TAINT_MAX, b.taint + BLOOD_FORGING.taint)
      b.bloodForgings++
      // The righteous hear of it (43b deeds): each sect whose master leans good cools a little
      for (const x of this._wsAll?.() || []) if (x.alive && (PERSONALITY_MORALITY[x.temper] ?? 0) > 0) this._wsDeed(x, BLOOD_FORGING.sectStance, 'you tempered your body in blood')
    }
    b.active = { id: m.id, startedAt: at, endsAt: at + m.secs * 1000, xp, crisis: false }
    if (m.group === 'drill' || m.group === 'spirit') b.last = m.id
    this.addEvent({ text: m.group === 'demonic'
      ? `You open your veins and begin the Blood Forging (−${BLOOD_FORGING.health} Health, ${BLOOD_FORGING.karma} karma, +${BLOOD_FORGING.taint} taint).`
      : `You begin ${m.name}. (${fmtTime(m.secs)}, about ${fmtQi(xp)} body XP)`, type: m.group === 'demonic' ? 'negative' : 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, xp, endsAt: b.active.endsAt }
  }
  cancelTempering() {
    const b = this._s.body
    if (!b.active) return { ok: false, reason: 'idle' }
    const m = this._temperMethod(b.active.id)
    b.active = null
    this.addEvent({ text: `You break off ${m?.name || 'your tempering'}. What it cost is spent.`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true }
  }
  // Each tick (and on load): charges refill; a finished tempering pays out, or an ordeal reaches its crisis and holds.
  _tickBody() {
    const s = this._s, b = s.body
    for (const k of ['strikes', 'flow']) this._refillCharges(s.minigames[k])
    let guard = 0
    while (b.active && !b.active.crisis && Date.now() >= b.active.endsAt && guard++ < 60) {
      const m = this._temperMethod(b.active.id)
      if (m?.group === 'ordeal') {
        b.active.crisis = true
        this.addEvent({ text: `${m.name} reaches its peak. Your body screams. Endure, ease off, or draw on your Qi?`, type: 'special' })
        this._emit('ordeal_crisis', { id: m.id })
        break
      }
      const end = b.active.endsAt
      this._finishTempering(m)
      this._autoTemper(end)
    }
  }
  _finishTempering(m, mult = 1) {
    const s = this._s, b = s.body, xp = this._gainBodyXp(b.active.xp * mult)
    let note = ''
    if (m.group === 'drill' && b.taint > 0) { b.taint = Math.max(0, b.taint - TAINT_CLEANSE_PER_DRILL); note = ' The quiet work draws a little taint from your blood.' }
    b.history.unshift({ id: m.id, year: Math.floor(s.world.year), xp })
    if (b.history.length > 20) b.history.length = 20
    b.active = null
    this.addEvent({ text: `${m.name} is done: +${fmtQi(xp)} body XP.${this.tierTrialInfo().ready ? ' Your body is ready for the tier trial.' : ''}${note}`, type: 'positive' })
    return xp
  }
  // Auto-Temper (22D, delegated): repeats your last SAFE method from where the last one ended. Never an ordeal.
  _autoTemper(from) {
    const s = this._s, a = s.automation, b = s.body
    if (s.playMode !== 'idle' || !a?.autoTemper || !this.automationUnlocked('autoTemper') || b.active) return
    const id = a.autoTemperId || b.last, m = this._temperMethod(id)
    if (!m || (m.group !== 'drill' && m.group !== 'spirit')) return
    const row = this.temperingList().find(x => x.id === id)
    if (!row?.ok) return
    this._beginTempering(m, Math.max(from, Date.now() - m.secs * 1000 * 50))
    this._emit('auto_fire', { system: 'temper' })
  }

  // The ordeal crisis: clean-endure odds and their parts (the breakdown card shows the same terms).
  ordealOdds() {
    const s = this._s, b = s.body, C = ORDEAL_CRISIS
    const hpPct = Math.max(0, Math.min(1, (s.health ?? 100) / this.maxHealth()))
    const temper = C.temper[s.personality?.id] || 0
    const parts = [{ label: 'Base', value: C.base }, { label: `Health ${Math.round(hpPct * 100)}%`, value: Math.round(hpPct * C.perHealth) },
      { label: `${BODY_TIERS[b.tier].name}`, value: b.tier * C.perTier }]
    if (temper) parts.push({ label: `Your temper (${PERSONALITIES.find(p => p.id === s.personality?.id)?.name || s.personality?.id})`, value: temper })
    const ends = Math.min(C.endureCap, b.cleanEndures * C.perEndure)
    if (ends) parts.push({ label: 'Ordeals you have endured', value: ends })
    if (b.taint) parts.push({ label: `Taint ${b.taint}`, value: -b.taint * C.perTaint })
    const raw = parts.reduce((a, x) => a + x.value, 0)
    return { chance: Math.max(C.min, Math.min(C.max, raw)) / 100, parts, raw }
  }
  crisisInfo() {
    const s = this._s, b = s.body
    if (!b.active?.crisis) return null
    const m = this._temperMethod(b.active.id), C = ORDEAL_CRISIS, qiCost = Math.round((s.derived?.qiCap || 0) * C.qiFrac)
    return { id: m.id, name: m.name, xp: b.active.xp, easeXp: Math.round(b.active.xp * C.easeXp), odds: this.ordealOdds(),
             hurt: C.hurt, scarChance: C.scarChance, grave: b.taint >= C.graveTaint, qiCost, qiOk: s.qi >= qiCost,
             bonus: this._endureBonusText(m) }
  }
  _endureBonusText(m) {
    const e = m.onEndure || {}
    if (e.rootBoost) { const has = this.rootElements().includes(e.rootBoost.element)
      return `${ART_ELEMENTS[e.rootBoost.element].name}-root Qi/s ×${e.rootBoost.mult} for ${fmtTime(e.rootBoost.secs)}${has ? '' : ' (your root has no ' + ART_ELEMENTS[e.rootBoost.element].name + ' to drink it)'}` }
    if (e.btBonus) return `+${Math.round(e.btBonus * 100)}% breakthrough chance for this life (now +${Math.round(this._s.body.btBonus * 100)}%, cap +${Math.round(ORDEAL_CRISIS.btBonusCap * 100)}%)`
    if (e.first) return 'a clan first, if no one of your line has done it'
    return ''
  }
  _applyEndureBonus(m) {
    const s = this._s, b = s.body, e = m.onEndure || {}
    if (e.rootBoost && this.rootElements().includes(e.rootBoost.element)) b.rootBoost = { element: e.rootBoost.element, mult: e.rootBoost.mult, until: Date.now() + e.rootBoost.secs * 1000 }
    if (e.btBonus) b.btBonus = Math.min(ORDEAL_CRISIS.btBonusCap, Math.round((b.btBonus + e.btBonus) * 1000) / 1000)
    if (e.first) this._claimFirst(e.first)
  }
  answerOrdeal(choice) {
    const info = this.crisisInfo()
    if (!info) return { ok: false, reason: 'no_crisis' }
    const s = this._s, b = s.body, m = this._temperMethod(info.id), C = ORDEAL_CRISIS
    let res = { ok: true, choice }
    if (choice === 'qi') {
      if (!info.qiOk) return { ok: false, reason: 'qi' }
      s.qi -= info.qiCost
      res.xp = this._finishTempering(m)
      this._applyEndureBonus(m)
      this.addEvent({ text: `You pour ${fmtQi(info.qiCost)} Qi into the strain and come through ${m.name} whole.`, type: 'positive' })
    } else if (choice === 'ease') {
      res.xp = this._finishTempering(m, C.easeXp)
    } else if (choice === 'endure') {
      const clean = Math.random() < info.odds.chance
      res.clean = clean
      res.xp = this._finishTempering(m)
      if (clean) {
        b.cleanEndures++
        this._applyEndureBonus(m)
        this.addEvent({ text: `You endure ${m.name} to its end and walk out of it changed. ${info.bonus ? '(' + info.bonus + ')' : ''}`, type: 'special' })
        this._emit('ordeal_endure', { id: m.id })
      } else {
        const hurt = this._randInt(C.hurt)
        s.health = Math.max(1, (s.health ?? 100) - hurt)
        res.hurt = hurt
        if (Math.random() < C.scarChance) res.scar = this._addScar(b.taint >= C.graveTaint ? 'shattered_meridians' : 'torn_sinews', m.name)
        this.addEvent({ text: `${m.name} breaks you before you break it (−${hurt} Health${res.scar ? `, ${BODY_SCARS[res.scar].name}` : ''}). The XP is yours; the lesson cost more.`, type: 'negative' })
        if (res.scar) this._emit('ordeal_scar', { id: res.scar })
      }
    } else return { ok: false, reason: 'unknown' }
    if (m.once || m.group === 'ordeal') b.ordealsDone[m.id] = (b.ordealsDone[m.id] || 0) + 1
    this._recalc(); this._notify()
    return res
  }
  _addScar(id, cause) {
    const b = this._s.body
    b.scars.push({ id, cause, year: Math.floor(this._s.world.year) })
    const max = this.maxHealth()
    if (this._s.health > max) this._s.health = max
    return id
  }
  mendScar(index) {
    const s = this._s, b = s.body, sc = b.scars[index]
    if (!sc) return { ok: false, reason: 'unknown' }
    if (!(s.inventory[SCAR_MEND_ITEM] > 0)) return { ok: false, reason: 'items' }
    s.inventory[SCAR_MEND_ITEM]--; if (s.inventory[SCAR_MEND_ITEM] <= 0) delete s.inventory[SCAR_MEND_ITEM]
    b.scars.splice(index, 1)
    this.addEvent({ text: `A ${ITEMS[SCAR_MEND_ITEM].name} seeps into the old wound. ${BODY_SCARS[sc.id].name} is mended.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  // The tier trial: the bar is full and the tier rises only through the player's choice.
  tierTrialInfo() {
    const s = this._s, b = s.body, T = TIER_TRIAL, next = BODY_TIERS[b.tier + 1]
    if (!next) return { ready: false, max: true }
    const ready = b.xp >= next.xp
    const hpPct = Math.max(0, Math.min(1, (s.health ?? 100) / this.maxHealth()))
    const stones = Math.round(T.marrow.stonesBase * Math.pow(T.marrow.stonesGrowth, b.tier)), cores = T.marrow.coresPerTier * (b.tier + 1)
    const marrowChance = Math.min(T.marrow.max, T.marrow.base + hpPct * T.marrow.perHealth)
    const bitterHealth = Math.round(this.maxHealth() * T.bitter.healthFrac)
    const marrow = { stones, cores, chance: marrowChance, ok: ready && s.spiritStones >= stones && (s.inventory.beast_core || 0) >= cores,
                     parts: [{ label: 'Base', value: T.marrow.base }, { label: `Health ${Math.round(hpPct * 100)}%`, value: hpPct * T.marrow.perHealth }] }
    const bitter = { health: bitterHealth, chance: T.bitter.chance, scarChance: T.bitter.scarChance, ok: ready && (s.health ?? 100) > bitterHealth }
    return { ready, next: { ...next, index: b.tier + 1 }, need: next.xp, have: b.xp, marrow, bitter, failKeep: T.failKeepXp, failHealth: T.failHealth }
  }
  attemptTierTrial(kind) {
    const s = this._s, b = s.body, info = this.tierTrialInfo(), T = TIER_TRIAL
    if (!info.ready) return { ok: false, reason: info.max ? 'max' : 'not_ready' }
    const way = info[kind]
    if (!way || (kind !== 'marrow' && kind !== 'bitter')) return { ok: false, reason: 'unknown' }
    if (!way.ok) return { ok: false, reason: kind === 'marrow' ? 'cost' : 'health' }
    if (kind === 'marrow') {
      s.spiritStones -= way.stones
      s.inventory.beast_core -= way.cores; if (s.inventory.beast_core <= 0) delete s.inventory.beast_core
    } else s.health = Math.max(1, (s.health ?? 100) - way.health)
    const win = Math.random() < way.chance
    const res = { ok: true, kind, win }
    if (kind === 'bitter' && Math.random() < way.scarChance) res.scar = this._addScar(b.taint >= ORDEAL_CRISIS.graveTaint ? 'shattered_meridians' : 'torn_sinews', 'the bitter way')
    if (win) {
      const oldMax = this.maxHealth()
      b.tier++
      const t = BODY_TIERS[b.tier]
      s.health = Math.min(this.maxHealth(), (s.health ?? 100) + Math.max(0, this.maxHealth() - oldMax))
      b.history.unshift({ tier: t.id, year: Math.floor(s.world.year), how: kind })
      if (b.tier === BODY_TIERS.length - 1) this._claimFirst('body_s')
      this.addEvent({ text: `Your body breaks through: ${t.id} · ${t.name}. Max Health ${this.maxHealth()}, +1 Health every ${Math.round(this.healthRegenSeconds())}s.${res.scar ? ` (${BODY_SCARS[res.scar].name})` : ''}`, type: 'special' })
      this._emit('body_tier_up', { tier: t.id })
    } else {
      const mark = BODY_TIERS[b.tier].xp
      b.xp = Math.round(mark + T.failKeepXp * (b.xp - mark))
      s.health = Math.max(1, (s.health ?? 100) - T.failHealth)
      this.addEvent({ text: `The trial fails: the marrow will not take the change (−${T.failHealth} Health, ${Math.round((1 - T.failKeepXp) * 100)}% of your progress lost).${res.scar ? ` (${BODY_SCARS[res.scar].name})` : ''}`, type: 'negative' })
    }
    this._recalc(); this._notify()
    return res
  }

  // Public (UI): the whole body at a glance.
  bodyInfo() {
    const s = this._s, b = s.body, t = BODY_TIERS[b.tier], next = BODY_TIERS[b.tier + 1] || null
    const a = b.active ? { ...b.active, method: this._temperMethod(b.active.id), left: Math.max(0, Math.ceil((b.active.endsAt - Date.now()) / 1000)) } : null
    return { tier: b.tier, def: t, next, xp: b.xp, from: t.xp, to: next ? next.xp : t.xp, cap: this._bodyXpCap(),
             maxHealth: this.maxHealth(), health: s.health ?? 100, regenSec: this.healthRegenSeconds(), btKeep: t.btKeep, btBonus: b.btBonus,
             power: t.power, scars: b.scars.map(x => ({ ...x, def: BODY_SCARS[x.id] })), taint: b.taint, taintMax: TAINT_MAX,
             cleanEndures: b.cleanEndures, active: a, crisis: this.crisisInfo(), trial: this.tierTrialInfo(), xpMult: this.temperXpMult(),
             rootBoost: b.rootBoost && Date.now() < b.rootBoost.until ? { ...b.rootBoost, left: Math.ceil((b.rootBoost.until - Date.now()) / 1000) } : null,
             bloodOpen: this._bloodOpen(), bloodForgings: b.bloodForgings, history: b.history.slice(0, 8),
             mendHave: s.inventory[SCAR_MEND_ITEM] || 0 }
  }

  // ── Phase 14 mini-games: Tempering Strikes (body XP) + Meridian Flow (Qi). Charges refill on real time. ──
  _refillCharges(g) {
    const R = MINIGAME_CHARGES, now = Date.now()
    if (g.charges >= R.max) { g.nextAt = null; return }
    if (!g.nextAt) g.nextAt = now + R.refillSecs * 1000
    while (g.charges < R.max && now >= g.nextAt) { g.charges++; g.nextAt += R.refillSecs * 1000 }
    if (g.charges >= R.max) g.nextAt = null
  }
  _flowSize() { let z = FLOW.sizes[0]; for (const x of FLOW.sizes) if (this._s.stageIndex >= x.stage) z = x; return z }
  strikesXp(points) {
    const max = STRIKES.strikes * STRIKES.perfect
    return Math.max(STRIKES.minXp, Math.round(points / max * STRIKES.xpHours * this._bestTemperRate() * this.temperXpMult().mult))
  }
  _flowHourCount() { const g = this._s.minigames.flow, now = Date.now(); g.hour = (g.hour || []).filter(t => now - t < 3600000); return g.hour.length }
  flowQi() {
    const cap = this._s.derived?.qiCap || 0
    return Math.round(cap * FLOW.qiFrac * (this._flowHourCount() >= FLOW.hourFull ? FLOW.hourMult : 1))
  }
  minigameInfo() {
    const s = this._s, M = s.minigames, b = s.body, z = this._flowSize()
    for (const k of ['strikes', 'flow']) this._refillCharges(M[k])
    const left = g => g.nextAt ? Math.max(0, Math.ceil((g.nextAt - Date.now()) / 1000)) : 0
    const canCut = !!(b.active && !b.active.crisis)
    return {
      max: MINIGAME_CHARGES.max, refillSecs: MINIGAME_CHARGES.refillSecs,
      strikes: { charges: M.strikes.charges, nextIn: left(M.strikes), best: M.strikes.best, plays: M.strikes.plays, perfectXp: this.strikesXp(STRIKES.strikes * STRIKES.perfect),
                 canCut, cutMax: STRIKES.cutMax, cutTarget: canCut ? this._temperMethod(b.active.id)?.name : null, live: !!M.strikes.session },
      flow: { charges: M.flow.charges, nextIn: left(M.flow), n: z.n, points: z.points, qi: this.flowQi(), waiting: !!M.flow.session,
              tired: this._flowHourCount() >= FLOW.hourFull, best: M.flow.best, plays: M.flow.plays, live: !!M.flow.session },
    }
  }
  // Starts a game: spends a charge (said on the button) and returns its session. Abandoning keeps the charge spent.
  startMinigame(kind) {
    const s = this._s, g = s.minigames?.[kind]
    if (!g) return { ok: false, reason: 'unknown' }
    this._refillCharges(g)
    if (kind === 'flow' && g.session) return { ok: true, session: g.session, resumed: true }   // a puzzle set aside: it waits, no new charge
    if (g.charges <= 0) return { ok: false, reason: 'charges' }
    if (g.charges >= MINIGAME_CHARGES.max) g.nextAt = Date.now() + MINIGAME_CHARGES.refillSecs * 1000
    g.charges--
    const seed = Math.floor(Math.random() * 2 ** 31)
    const relaxed = !!s.settings?.relaxedTiming
    g.session = kind === 'flow' ? { seed, n: this._flowSize().n, points: this._flowSize().points, startedAt: Date.now() }
                                : { seed, relaxed, startedAt: Date.now() }
    this._notify()
    return { ok: true, session: g.session }
  }
  // result — strikes: { hits: ['perfect'|'good'|'miss', …], use: 'xp'|'cut' } · flow: { rotations: [0..3 per cell] } or { abandon: true }
  finishMinigame(kind, result = {}) {
    const s = this._s, g = s.minigames?.[kind], ses = g?.session
    if (!ses) return { ok: false, reason: 'no_session' }
    // Meridian Flow has no clock: closing it sets the puzzle aside with your turns, to finish later (the charge stays spent)
    if (kind === 'flow' && result.setAside) {
      const n = ses.n * ses.n, t = Array.isArray(result.turns) ? result.turns : []
      ses.turns = Array.from({ length: n }, (_, i) => ((t[i] | 0) % 4 + 4) % 4)
      this._notify(); return { ok: true, setAside: true }
    }
    g.session = null
    if (result.abandon) { this._notify(); return { ok: true, abandoned: true } }
    g.plays++
    const secs = (Date.now() - ses.startedAt) / 1000
    if (kind === 'strikes') {
      const hits = (Array.isArray(result.hits) ? result.hits : []).slice(0, STRIKES.strikes)
      // The marker needs time to cross the bar: a run faster than this was not played (scores as misses)
      const minSecs = STRIKES.strikes * STRIKES.sweepMs / 1000 * 0.25
      const pts = secs < minSecs ? 0 : hits.reduce((a, h) => a + (h === 'perfect' ? STRIKES.perfect : h === 'good' ? STRIKES.good : 0), 0)
      g.best = Math.max(g.best || 0, pts)
      const perfect = pts === STRIKES.strikes * STRIKES.perfect
      const b = s.body
      let res
      if (result.use === 'cut' && b.active && !b.active.crisis) {
        const left = Math.max(0, b.active.endsAt - Date.now()), frac = Math.min(STRIKES.cutMax, pts * STRIKES.cutPerPoint)
        const cut = Math.round(left * frac)
        b.active.endsAt -= cut
        res = { ok: true, points: pts, cutSecs: Math.round(cut / 1000), frac }
        this.addEvent({ text: `Tempering Strikes: ${pts} points. You drive ${this._temperMethod(b.active.id)?.name} on, ${fmtTime(res.cutSecs)} sooner.`, type: 'positive' })
      } else {
        const xp = this._gainBodyXp(this.strikesXp(pts))
        res = { ok: true, points: pts, xp }
        this.addEvent({ text: `Tempering Strikes: ${pts} points, +${fmtQi(xp)} body XP.`, type: pts ? 'positive' : 'neutral' })
      }
      if (perfect) this._emit('minigame_perfect', { kind })
      this._tickBody(); this._recalc(); this._notify()
      return { ...res, perfect, max: STRIKES.strikes * STRIKES.perfect }
    }
    if (kind === 'flow') {
      const solved = typeof FlowPuzzle !== 'undefined' && FlowPuzzle.check(ses.seed, ses.n, result.rotations)
      if (!solved) { this.addEvent({ text: 'The Qi stalls in a broken channel and disperses.', type: 'neutral' }); this._notify(); return { ok: true, solved: false } }
      const qi = this.flowQi(), cap = s.derived?.qiCap || 0
      const gain = Math.max(0, Math.min(qi, cap - s.qi))
      s.qi += gain; s.stats.totalQiGained += gain
      g.hour.push(Date.now())
      this.addEvent({ text: `Meridian Flow: the channels open. +${fmtQi(gain)} Qi.`, type: 'positive' })
      this._recalc(); this._notify()
      return { ok: true, solved: true, qi: gain }
    }
    return { ok: false, reason: 'unknown' }
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
    const bodyKeep = BODY_TIERS[s.body?.tier || 0]?.btKeep || 0   // Phase 14
    qiKeep = Math.min(1, qiKeep + bodyKeep)
    const integ = s.realmIntegrity ?? 100
    let after = Math.max(0, integ - 20)
    if (pe?.integrity_restore) after = Math.min(100, after + pe.integrity_restore)
    return {
      guaranteed: pe?.type === 'bt_guarantee',
      qiLossFrac: 1 - qiKeep, activeKeep, bodyKeep, pillSoftens: qiKeep > (activeKeep ? 0.5 + ACTIVE_BT_QI_LOSS_BONUS : 0.5) + bodyKeep,
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
        value: s.health ?? 100, max: this.maxHealth(), regenSeconds: this.healthRegenSeconds(), regenAmount: HEALTH_REGEN_AMOUNT,
        body: BODY_TIERS[s.body?.tier || 0], scars: (s.body?.scars || []).map(x => BODY_SCARS[x.id]?.name),
        risky, warChance: WAR_INJURY_CHANCE, warDmg: WAR_INJURY_AMOUNT, duelCost: DUEL_WIN_HEALTH_COST,
      },
    }
  }

  ascensionChance() {
    const s = this._s
    const bq = s.bloodlineQuality || 0
    let prep = 0
    if ((s.realmIntegrity ?? 100) >= 100) prep += ASCENSION_PREP_INTEGRITY
    if ((s.health ?? 100) >= this.maxHealth()) prep += ASCENSION_PREP_HEALTH   // Phase 14: "full", not 100
    const chance = ASCENSION_BASE_CHANCE + bq * ASCENSION_BQ_COEF + prep
    return Math.max(0, Math.min(ASCENSION_CHANCE_CAP, chance))
  }

  attemptAscension() {
    const s = this._s
    const lastMortal = CULTIVATION_STAGES.length - 2
    if (s.stageIndex !== lastMortal)  return { success: false, reason: 'not_ready' }
    if (!s.derived.canBreakthrough)   return { success: false, reason: 'insufficient_qi' }
    // Phase 47 (1.21): the Trial may only be attempted at the full bloodline — no roll, no death before then.
    if ((s.bloodlineQuality || 0) < ASCENSION_MIN_BLOODLINE)
      return { success: false, reason: 'bloodline_too_low', need: ASCENSION_MIN_BLOODLINE, have: s.bloodlineQuality || 0 }

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
      const soul = this._grantImmortalSoul()   // Phase 40: before _die() so the name/clan are the Immortal's
      // Phase 31 (M2 task 2.7d): a successful Ascension ENDS the life — an Ascended Ancestor, not a character
      // left idling at an unreachable stub stage. Routes through the same interlude/rebirth flow as any other
      // death (fixes the post-Ascension dead zone: bloodline.md/life-loop.md's long-flagged gap).
      this._die('ascended', soul)
      this._save()   // Phase 40 invariant 3: the outcome (and its grant) is on disk before anything can re-roll it
      return { success: true, chance, ascended: true, newStage, soul }
    }

    const soul = this._grantSoul('fail', SOUL_FAIL_BASE + SOUL_FAIL_PER_PCT * Math.round(chance * 100), { chance })
    this._die('ascension_failed', soul)
    this._save()
    return { success: false, reason: 'died', chance, soul }
  }

  // ── Phase 40: Soul Points + Soul Resonance (docs/systems/soul-points.md) ────
  // One record per INSTALL, shared by every slot: soul.json via window.electron.loadSoul/saveSoul, never inside _s.

  _blankSoul() {
    return { v: 1, points: 0, earned: 0, resonance: 0, failedAscensions: 0, immortals: 0, v1Finished: null, log: [], seen: false,
      tut: { seen: {}, off: false, init: false } }   // 1.23: tutorial lessons seen + tips on/off — per install, like the rest of the soul
  }

  // Missing/corrupt → blank; every field clamped so a hand-edited file can't break the invariants.
  _normSoul(raw) {
    const b = this._blankSoul()
    if (!raw || typeof raw !== 'object') return b
    const num = v => (Number.isFinite(+v) ? Math.max(0, +v) : 0)
    b.points           = num(raw.points)
    b.earned           = Math.max(num(raw.earned), b.points)
    b.resonance        = Math.min(SOUL_RESONANCE_MAX, Math.floor(num(raw.resonance)))
    b.failedAscensions = Math.floor(num(raw.failedAscensions))
    b.immortals        = Math.floor(num(raw.immortals))
    b.v1Finished       = raw.v1Finished && typeof raw.v1Finished === 'object' ? raw.v1Finished : null
    b.log              = Array.isArray(raw.log) ? raw.log.slice(0, SOUL_LOG_MAX) : []
    b.seen             = !!raw.seen
    const t = raw.tut && typeof raw.tut === 'object' ? raw.tut : {}
    b.tut.off = !!t.off
    b.tut.init = !!t.init
    if (t.seen && typeof t.seen === 'object') for (const [k, v] of Object.entries(t.seen)) if (Number.isFinite(+v)) b.tut.seen[k] = +v
    return b
  }

  // Boot (charselect) and every initSlot(). A shell with no soul storage keeps the in-memory record.
  async loadSoul() {
    let raw = null
    try { raw = await window.electron.loadSoul?.() } catch {}
    if (raw) this._soul = this._normSoul(raw)
    if (this._s) this._recalc()
    return this.getSoul()
  }

  _saveSoul() {
    if (this._s?.devSave) return   // invariant 5: a dev preset life never writes the real soul file
    try { window.electron.saveSoul?.(this._soul)?.catch?.(() => {}) } catch {}
  }

  getSoul() { return JSON.parse(JSON.stringify(this._soul)) }

  soulQiMult() { return 1 + SOUL_RESONANCE_QPS * this._soul.resonance }

  soulRankCost(rank = this._soul.resonance) { return Math.round(SOUL_RANK_BASE * Math.pow(SOUL_RANK_GROWTH, rank)) }

  // Soul screen summary: what the next rank costs and gives, or why it can't be bought.
  soulInfo() {
    const so = this._soul, max = so.resonance >= SOUL_RESONANCE_MAX
    const cost = max ? null : this.soulRankCost()
    return {
      ...this.getSoul(), max, cost, mult: this.soulQiMult(), perRank: SOUL_RESONANCE_QPS, maxRank: SOUL_RESONANCE_MAX,
      need: max ? 0 : Math.max(0, cost - so.points), canSpend: !max && so.points >= cost,
    }
  }

  // One rank per call: the player clicks every rank (agency rule — nothing auto-spends).
  spendSoul() {
    const so = this._soul
    if (so.resonance >= SOUL_RESONANCE_MAX) return { ok: false, reason: 'max' }
    const cost = this.soulRankCost()
    if (so.points < cost) return { ok: false, reason: 'points', need: cost - so.points }
    so.points -= cost
    so.resonance++
    this._soulLog('spend', cost, null, { rank: so.resonance })
    this._saveSoul()
    if (this._s) { this._recalc(); this._notify() }
    return { ok: true, rank: so.resonance, cost }
  }

  markSoulSeen() {
    if (this._soul.seen) return
    this._soul.seen = true
    this._saveSoul()
    if (this._s) this._notify()
  }

  // ── 1.23: Tutorial seen-state (docs/systems/tutorial.md) — rides in the soul record so a new slot or a new life never
  // re-teaches what this install has already seen. Presentation only: nothing here touches _s or balance.
  tutorialInfo() { return { off: this._soul.tut.off, init: this._soul.tut.init, seen: { ...this._soul.tut.seen } } }

  // Once per install, the first time a game is on screen with this build. An established player (passed in as
  // markIds = every lesson id) is not walked through basics they already know; the Guide can still replay any of it.
  initTutorials(markIds = []) {
    if (this._soul.tut.init) return false
    const now = Date.now()
    for (const id of markIds) this._soul.tut.seen[id] ??= now
    this._soul.tut.init = true
    this._saveSoul()
    return true
  }

  markTutorialSeen(id) {
    if (!id || this._soul.tut.seen[id]) return false
    this._soul.tut.seen[id] = Date.now()
    this._saveSoul()
    return true
  }

  setTutorialsOff(off) {
    this._soul.tut.off = !!off
    this._saveSoul()
  }

  // Forget every lesson (the Guide's "Show every tip again"); tips switch back on.
  resetTutorials() {
    this._soul.tut = { seen: {}, off: false, init: true }
    this._saveSoul()
  }

  _soulWho() {
    const s = this._s, clan = this._playerClan()
    return clan?.name ? `${s.name} of the ${clan.name} clan` : `${s.name} the orphan`
  }

  _soulLog(kind, pts, who, extra = {}) {
    this._soul.log.unshift({ at: Date.now(), kind, pts, who, ...extra })
    if (this._soul.log.length > SOUL_LOG_MAX) this._soul.log.length = SOUL_LOG_MAX
  }

  // Called from attemptAscension() only. Returns what the death card shows: { kind, pts, first, chance? }.
  _grantSoul(kind, pts, meta = {}) {
    const so = this._soul
    const first = so.earned === 0
    pts = Math.max(0, Math.round(pts))
    so.points += pts
    so.earned += pts
    if (kind === 'fail') so.failedAscensions++
    else so.immortals++
    if (first) so.seen = false   // the discovery dot: Hall sub-tab + charselect Soul button until the screen is opened
    this._soulLog(kind, pts, this._soulWho(), meta.chance != null ? { chance: meta.chance } : {})
    this._saveSoul()
    return { kind, pts, first, ...meta }
  }

  // The first Immortality on this install is the v1 finish (+SOUL_V1_GRANT, once: v1Finished is set in the same step
  // as the grant); every later one pays SOUL_IMMORTAL_GRANT. 40b shows the v1 screen from lastReincarnation.soul.kind.
  // meta = what the finish screen / Immortal card shows (40b): who rose, their clan, generation, open hours this life,
  // and how many Trials had failed (any slot) before this one.
  _grantImmortalSoul() {
    const so = this._soul, s = this._s
    const meta = { who: this._soulWho(), name: s.name, clan: this._playerClan()?.name || null, generation: s.generation || 1,
      hours: +((s.stats?.timePlayed || 0) / 3600).toFixed(1), failedBefore: so.failedAscensions }
    if (so.v1Finished) return this._grantSoul('immortal', SOUL_IMMORTAL_GRANT, meta)
    so.v1Finished = { at: Date.now(), slot: this._slot, ...meta }
    return this._grantSoul('v1', SOUL_V1_GRANT, meta)
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
  _die(cause, soul = null) {   // soul (Phase 40): the Trial's Soul Points grant, on the summary before anyone is notified
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
    const minigames   = s.minigames   // Phase 14: mini-game charges belong to the player; the body is the life's (resets to F)
    const automation  = s.automation
    const devSave     = s.devSave

    const summary = {
      cause, maxStageReached: maxStage, stageAtDeath: s.stageIndex, generation: priorGen,   // A4-3: the death moment draws this realm
      soul,   // Phase 40: { kind, pts, first, chance? | who, clan, hours… } — the death card line / the finish screen
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
      roadDeath: cause === 'road' ? { kind: s.road?.last?.kind || null, answer: s.road?.last?.answer || null } : null,   // final QA: which encounter killed this life (sim metrics)
    }

    // 2.6a: the world survives. The dying life's person, spouse(s) and children are written into the registry
    // (living children and a living spouse stay on the clan roster — the succession below picks from them).
    const deadId = s.self.id
    const world = this._recordLifeInWorld(cause, maxStage, priorGen)
    // 2026-10-02: snapshot the dying life's arts + pack for the interlude's bequest step (they are gone once
    // _newGame() rebuilds this._s just below, the same reason the legacies snapshot onto pendingSuccession).
    summary.bequest = this._bequestPool()
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
    if (minigames) { this._s.minigames = minigames; minigames.strikes.session = minigames.flow.session = null }
    if (automation) this._s.automation = automation
    if (devSave) this._s.devSave = true
    this._beginInterlude(cause, deadId)
    this._recalc(); this._notify()
  }

  // ── 2.6d (clan-succession.md): between lives — succession, reign, rebirth ─────────────────────────────

  // User rule (2026-09-29, PLAYER_QI_EDGE): an NPC's stages per game year at `stage` — its own flat pace (root ÷
  // yearsPerStage), but never more than your bare pace at that stage and root ÷ PLAYER_QI_EDGE. Your bare pace = the
  // stage's baseQps × root, filling its qiCap, over the open seconds one game year takes.
  _npcStageRate(stage, rootMult, yearsPerStage, flatUsesRoot = true) {   // (a spouse's flat pace ignores root)
    const flat = (flatUsesRoot ? rootMult : 1) / yearsPerStage
    const st = CULTIVATION_STAGES[stage]
    if (!st || !(st.qiCap > 0) || !isFinite(st.qiCap)) return flat
    const yours = st.baseQps * rootMult * (3600 / GAME_YEARS_PER_OPEN_HOUR) / st.qiCap
    return Math.min(flat, yours / PLAYER_QI_EDGE)
  }

  // Coarse NPC growth up to `year` for every living person in the registry (never the living player, who isn't
  // in it). Stage progress only counts years past AWAKENING_AGE; capped at NPC_STAGE_CAP. No Math.random().
  // npcXp = progress through the current stage (0–1); each stage has its own pace (_npcStageRate).
  _advancePersons(w, year) {
    for (const p of Object.values(w.persons)) {
      if (p.alive === false) continue
      if (p.owner && p.owner !== 'world') continue   // Phase 28: family / arena / own-sect people grow under their owner
      this._growPerson(p, year, false)                // 4.3: the same grower the yearly life step uses (no rolls here)
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
      orphanDeath: !this._playerClan(w),
      // 2026-10-02: the bequest step — the dying life's pool (captured in _die), your picks, and the per-life caps.
      reincarnation: w.pastLives.length, bequestPool: s.lastReincarnation?.bequest || null,
      bequestMax: this._bequestMax(w.pastLives.length), bequest: { arts: [], items: [] } }
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
    // 2026-10-02: the bequest — defensively defaulted so an old mid-interlude save (no bequest fields) still renders.
    const bqMax = it.bequestMax || this._bequestMax(it.reincarnation || w.pastLives.length)
    const bq = it.bequest || { arts: [], items: [] }
    return { step: it.step, cause: it.cause, year: it.year, clanName: clan?.name || '', extinct: it.extinct,
             candidates: it.step === 'bet' ? it.candidates.slice(0, BET_MAX_CANDIDATES).map(id => w.persons[id]) : [],
             bet: it.bet, betWon: it.betWon, successor: it.successorId ? w.persons[it.successorId] : null,
             style: it.style, heirKind: it.heirKind, reignYears: it.reignYears, chronicle: [...it.chronicle],
             reincarnation: it.reincarnation || w.pastLives.length,
             bequest: { maxArts: bqMax.arts, maxItems: bqMax.items, arts: [...(bq.arts || [])], items: [...(bq.items || [])],
                        pool: it.bequestPool || { arts: [], items: [] } },
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
      if (clan.sect.worldSectId) {
        // Phase 46 (1.20b, lineage-sect.md): the sect lives in the world now — the world sim owns its fate, not a
        // reign roll. The chronicle names it and its current master (who may not be who you left it to).
        const rec = (w.sects?.list || []).find(r => r.id === clan.sect.worldSectId && r.alive)
        if (rec) { clan.sect.hallLevel = rec.hallLevel
          lines.push(`The ${rec.name}, the sect your line founded, still stands — led now by ${rec.leader}.`) }
        else { lines.push(`The ${clan.sect.name}, the sect your line founded, is spoken of no more.`); clan.sect = null }
        it.sectFate = 'lineage'
      } else {
        const fate = this._weighted(SECT_FORTUNE[style])
        const sect = clan.sect, enemy = fate === 'lost' ? this._rivalSectName() : ''
        if (fate === 'grow') sect.hallLevel = Math.min(SECT_HALL_LEVELS.length, (sect.hallLevel || 1) + 1)
        if (fate === 'decline') { sect.hallLevel = Math.max(1, (sect.hallLevel || 1) - 1); (sect.disciples || []).pop() }
        lines.push(this._fillClan(CHRONICLE_SECT[fate], fill({ sect: sect.name || 'clan sect', enemy })))
        if (fate === 'lost') { this._noteEnemy({ kind: 'sect', name: `the ${enemy}`, why: `took the ${sect.name}` }); clan.sect = null }
        else sect.heirId = succ.id
        it.sectFate = fate
      }
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
      // 4.10b: a rival of a past life — their own line takes you in (they, or a child of theirs, head it)
      const line = enemy.kind === 'rival' ? this._rivalLineHead(enemy.personId) : null
      const head = line || this._genPerson({ family: clan.name, bornYear: yr - this._randInt([60, 200]), stage: this._randInt([10, 18]), role: 'head' })
      if (line) line.role = 'head'   // (a clan member now: the clan's systems run them, not the heavy step)
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
    this._inheritRepute(newYear)         // 4.10: grudges whole, debts halved, feuds re-aimed at you (before the skipped years, so they don't lapse)
    this._worldYears(it.year, newYear)   // Phase 28 (4.3): the world lives the skipped years (backlash, the road, old age, births)
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
    this._applyBequest(it)                        // 2026-10-02: the arts + items passed down (rides an orphan rebirth too)
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

  // ── family-events.js: a bad father's hand (rare, while you are a child of the house) ────────────────
  _blankAbuse() { return { nextCheck: 0, hits: 0, defiance: 0, event: null, reckon: false, avenged: false } }

  _ensureBeatingFields() {
    const s = this._s
    if (!s.abuse || typeof s.abuse !== 'object') s.abuse = this._blankAbuse()
    const a = s.abuse, b = this._blankAbuse()
    for (const k of Object.keys(b)) if (a[k] === undefined) a[k] = b[k]
  }

  // The head who raised you this life — your father in the house. null for an orphan, a rival birth, or a first life.
  _father() {
    const s = this._s, id = s.birth?.headId
    return (id && s.world?.persons?.[id]) || null
  }

  // "Bad" = a cruel style, a cruel personality, his own trauma, or a bond that has gone cold (family-events.js).
  isBadFather() {
    const s = this._s, head = this._father()
    if (!head || head.alive === false) return false
    const style = head.parentingStyle || s.birth?.headStyle
    return BEATING_BAD_STYLES.includes(style) || BEATING_BAD_PERSONALITIES.includes(head.personality) ||
           !!head.trauma || (s.birth?.headBond ?? 50) < BEATING_BOND_MAX
  }

  // A flavour line for WHY he is beating you — his trauma, his temper, or how little he thinks of you.
  beatingWhy() {
    const s = this._s, head = this._father()
    if (!head) return 'A hard hand falls on you'
    const who = head.given || 'Your father'
    if (head.trauma) return `${who} is drunk, and the Tournament of Heirs is in his eyes again`
    if (BEATING_BAD_PERSONALITIES.includes(head.personality)) return `${who} is in one of his black moods`
    if ((s.birth?.headBond ?? 50) < BEATING_BOND_MAX) return `${who} looks at you like a stranger and raises his hand`
    return `${who} has been drinking`
  }

  // The pending beating (game.js's family-overlay card) — null when none is waiting.
  beatingInfo() {
    const s = this._s, a = s.abuse
    if (!a?.event) return null
    const head = this._father()
    return { headId: a.event.headId, headName: head?.given || 'your father', why: this.beatingWhy(),
             bond: s.birth?.headBond ?? null, choices: BEATING_EVENT.choices }
  }

  // Answer a beating. Health floors at 1 (a childhood beating never kills you). Defiance is the memory.
  resolveBeating(i) {
    const s = this._s, a = s.abuse
    if (!a?.event) return { ok: false, reason: 'no_event' }
    const ch = BEATING_EVENT.choices[i]
    if (!ch) return { ok: false, reason: 'bad_choice' }
    this._applyFamilyEffect(ch.effect)   // never lethal: floors Health at 1
    const delta = ch.bond ? (ch.bond[s.personality?.id] ?? ch.bond.default ?? 0) : 0
    if (s.birth && s.birth.headBond != null) s.birth.headBond = Math.max(0, Math.min(100, s.birth.headBond + delta))
    a.hits++
    a.defiance = Math.min(BEATING_RECKONING_DEFIANCE, a.defiance + (ch.defiance || 0))
    if (a.hits >= BEATING_SCAR_AT) s.self.trauma = true   // scarred (2.6d: feeds the heir Bloodline term)
    a.event = null
    const heart = delta ? ` (bond with him ${delta > 0 ? '+' : ''}${delta})` : ''
    this.addEvent({ text: this.upbringingText(`${ch.result}${heart}`), type: delta < 0 ? 'negative' : 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, health: s.health }
  }

  // The grown-up reckoning: he beat you, you stood up to him enough, and now you outrank him.
  reckoningInfo() {
    const s = this._s, a = s.abuse, head = this._father()
    if (!a || a.avenged || !head || head.alive === false) return null
    if (a.defiance < BEATING_RECKONING_DEFIANCE) return null
    if (s.age < AWAKENING_AGE + BEATING_MAX_YEARS) return null
    if ((s.stageIndex || 0) <= (head.stageIndex || 0)) return null
    return { headId: head.id, headName: head.given || 'him', hits: a.hits }
  }

  resolveReckoning(kind) {
    const s = this._s, a = s.abuse, info = this.reckoningInfo()
    if (!info) return { ok: false, reason: 'none' }
    const head = this._father()
    if (kind === 'break') {
      this._applyFamilyEffect({ karma: BEATING_KARMA.break })
      if (head) head.feud = 'grudge'
    } else {
      this._applyFamilyEffect({ karma: BEATING_KARMA.forgive })
      if (s.birth) s.birth.headBond = Math.max(0, Math.min(100, (s.birth.headBond ?? 0) + 20))
    }
    const choice = RECKONING_CHOICES.find(c => c.id === kind) || RECKONING_CHOICES[0]
    a.reckon = false; a.avenged = true
    this.addEvent({ text: this.upbringingText(choice.result), type: 'special' })
    this._recalc(); this._notify()
    return { ok: true }
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

  _killPerson(id, yr, cause, { seat = true } = {}) {
    const w = this._s.world, p = w.persons[id]
    if (!p || p.alive === false) return
    p.alive = false; p.diedYear = yr; p.cause = cause
    if (seat) this._vacateSeat(p, yr, cause)   // final QA: any death (a duel, a deed, the road) frees a sect seat at once
    if (p.roadCard) this._roadForget(p, cause)   // 4.9: a card waiting on them goes
    const rv = this._rivalRec()
    if (rv && !rv.end && rv.pid === id) this._rivalEnds(rv, p, cause, yr)   // 4.10b: your rival is gone
    if (p.sworn && p.sworn === this._s.self?.id) {   // 4.10: your sworn sibling falls
      const text = NPC_ACTS_TEXT.swornFell.replace('{name}', Persons.fullName(p)).replace('{cause}', (PERSON_CAUSE_TEXT[cause] || 'they have passed on').toLowerCase())
      this.addEvent({ text, type: 'negative', pid: p.id }); this._emit('world_news', { text, type: 'negative' })
    }
    const st = w.lifeStats ||= { deaths: {}, births: 0, marriages: 0, ascended: 0 }   // 4.3: how the world's people end (QA)
    st.deaths[cause] = (st.deaths[cause] || 0) + 1
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
      // Phase 46 (1.20b): a sect that lives on as a world sect is not the clan head's to hand over — only a
      // pre-46 dormant `clan.sect` snapshot still passes with the seat.
      if (clan.sect && !clan.sect.worldSectId && !s.ownSect.founded && !s.sect.id) {
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
    this._repairLines(clan)
    return old
  }
  // Final QA: a branch's head must be one of its own members (a head moved into the main line could leave a branch still
  // naming them — a later branch war then killed the clan head as that branch's "loser", clan_head_invalid). A branch
  // whose head is not its own living member passes to its strongest living member, else none. The main line keeps the
  // clan head. Deterministic (no Math.random), so it is safe in migrations.
  _repairLines(clan) {
    const w = this._s.world, self = this._s.self?.id
    if (!clan?.lines?.length) return
    clan.lines.forEach((l, i) => {
      if (i === 0) { if (clan.headId && l.memberIds.includes(clan.headId)) l.headId = clan.headId; return }
      const ok = id => id && l.memberIds.includes(id) && (id === self || (w.persons[id] && w.persons[id].alive !== false))
      if (ok(l.headId)) return
      const next = l.memberIds.map(id => w.persons[id]).filter(p => p && p.id !== self && p.alive !== false && !p.estranged)
        .sort((a, b) => (b.stageIndex || 0) - (a.stageIndex || 0) || String(a.id).localeCompare(String(b.id)))[0]
      l.headId = next ? next.id : null
      if (next && next.role !== 'head') next.role = 'branch_head'
    })
  }

  // Public (UI): can you challenge the sitting head right now?
  canChallengeHead() {
    const s = this._s, clan = this._playerClan()
    if (!clan) return { ok: false, reason: 'no_clan' }
    if (clan.headId === s.self.id) return { ok: false, reason: 'is_head' }
    if (s.family.fight) return { ok: false, reason: 'busy' }   // 1.8b-3b: one fight at a time
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
    this.addEvent({ text: `Year ${yr}: you call out ${Persons.fullName(head)} before the clan. ${lethal ? 'They answer: to the death.' : 'They answer: until one yields.'}`, type: 'special' })
    // 1.8b-3b: fought exchange by exchange on the fight card; the outcome lands in _challengeOutcome().
    this._startFight('challenge', head, lethal)
    return { ok: true, fight: true, lethal }
  }

  _challengeOutcome(clan, head, lethal, res) {
    const s = this._s, f = s.family, yr = Math.floor(s.world.year)
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
        return 'lost_lethal'
      }
      f.challengeCooldownYear = yr + this._randRange(CHALLENGE_COOLDOWN_YEARS)
      if (s.birth?.headId === head.id) s.birth.headBond = Math.max(0, (s.birth.headBond ?? 50) - CHALLENGE_BOND_LOSS)
      this.addEvent({ text: `Year ${yr}: ${Persons.fullName(head)} beats you down and lets you live. You will need to heal before you try again.`, type: 'negative' })
      outcome = 'lost_nonlethal'
    }
    this._recalc(); this._notify()
    return outcome
  }

  // A challenger from the roster with a real shot: adult, on the clan roster, within a plausible stage of you.
  // A6-3a: a debtor never calls you out; a grudge-holder is FEUD_CHALLENGE_WEIGHT× likelier (and the only one who dares
  // while the clan is cowed).
  _pickChallenger(clan, cowed = false) {
    const w = this._s.world, s = this._s, yr = Math.floor(w.year)
    const ids = [...new Set(this._clanMemberIds(clan))].filter(id => id !== s.self.id)
    const cands = ids.map(id => w.persons[id]).filter(p => p && p.alive !== false && !p.estranged && p.feud !== 'debt' &&
      (!cowed || p.feud === 'grudge') &&
      yr - (p.bornYear ?? 0) >= ADULT_AGE && Math.abs((p.stageIndex || 0) - s.stageIndex) <= CHALLENGER_STAGE_GAP_MAX)
    if (!cands.length) return null
    const wt = p => p.feud === 'grudge' ? FEUD_CHALLENGE_WEIGHT : 1
    let r = Math.random() * cands.reduce((a, p) => a + wt(p), 0)
    for (const p of cands) if ((r -= wt(p)) < 0) return p
    return cands[cands.length - 1]
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
    // 1.8b-3b: your call on lethality stays here; the fight itself is on the fight card (→ _defendOutcome).
    this._startFight('defend', challenger, lethal)
    return { ok: true, fight: true, lethal }
  }

  _defendOutcome(clan, challenger, lethal, res) {
    const s = this._s, f = s.family, yr = Math.floor(s.world.year)
    this._applyLethalTrauma(res, lethal)
    const youWon = res.winner.id === s.self.id
    f.tally.challenges++
    if (youWon) {
      f.tally.challengesWon++
      if (res.died) { this._killPerson(challenger.id, yr, 'challenge'); s.karma = Math.max(0, s.karma + CHALLENGE_KARMA_DEATH) }
      this.addEvent({ text: `Year ${yr}: ${res.died ? `${Persons.fullName(challenger)} falls before you. Your seat is secure` : `you beat ${Persons.fullName(challenger)} down and let them live`}.`, type: res.died ? 'negative' : 'positive' })
      this._recalc(); this._notify()
      return res.died ? 'won_lethal' : 'won_nonlethal'
    }
    f.tally.challengesLost++
    if (res.died) {
      this.addEvent({ text: `Year ${yr}: ${Persons.fullName(challenger)}'s blade is faster. Your reign ends where it stood.`, type: 'negative' })
      this._recalc(); this._notify()
      this._die('challenged')
      return 'lost_lethal'
    }
    this._installHead(clan, challenger.id)
    this.addEvent({ text: `Year ${yr}: ${Persons.fullName(challenger)} beats you before the whole clan. You step down; they take the head seat.`, type: 'negative' })
    this._recalc(); this._notify()
    return 'lost_nonlethal'
  }

  // A road encounter fought to the death (A6-3a). A stranger has no clan, seat or name worth keeping: the loser simply
  // does not get up. Killing them costs karma; the end step can spare them instead (they walk on). Losing is death.
  _slaughterOutcome(fi, opp, res) {
    const s = this._s, yr = Math.floor(s.world.year)
    this._applyLethalTrauma(res, fi.lethal)
    const name = Persons.fullName(opp)
    if (res.winner.id === s.self.id) {
      if (res.died) {
        s.karma = Math.max(0, s.karma + CHALLENGE_KARMA_DEATH)
        this.addEvent({ text: `Year ${yr}: you cut ${name} down on the road at ${fi.place || 'the wayside'} and leave them where they fell.`, type: 'negative' })
        this._recalc(); this._notify()
        return 'won_lethal'
      }
      this.addEvent({ text: `Year ${yr}: you beat ${name} down and let them crawl away.`, type: 'neutral' })
      this._recalc(); this._notify()
      return 'won_nonlethal'
    }
    if (res.died) {
      this.addEvent({ text: `Year ${yr}: ${name}'s blade is faster. You die on the road, far from home.`, type: 'negative' })
      this._recalc(); this._notify()
      this._die('slaughter')
      return 'lost_lethal'
    }
    this.addEvent({ text: `Year ${yr}: you yield. ${name} lets you live, and walks on.`, type: 'neutral' })
    this._recalc(); this._notify()
    return 'lost_nonlethal'
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
    if (pool.includes(s.self.id)) {                              // A6-3a: you are in it — your bouts are played on the battle page
      f.bracket = { headId: off.headId, yr, lethal, pool: [...pool], round: 1, order: null, i: 0, next: [], eliminated: [], selfOut: null, deaths: 0 }
      return { ok: true, joined: true, lethal, ...this._bracketStep() }
    }
    const result = this._runBracket(pool, lethal, yr)
    for (const line of result.lines) this.addEvent({ text: line, type: line.includes('do not rise') ? 'negative' : 'neutral' })
    return this._finishStepDown(clan, result, lethal, false, yr)
  }

  // A6-3a: runs the paused bracket (f.bracket) until a pairing includes you — then starts that bout (f.fight kind
  // 'stepdown') and returns { outcome: 'bout', next: true } — or until one stands, then settles the seat. NPC–NPC bouts
  // are rolled (_resolveFight) and logged as they happen. Same shape as _runBracket.
  _bracketStep() {
    const s = this._s, f = s.family, br = f.bracket, self = s.self.id, w = s.world
    if (!br) return { outcome: 'moot' }
    const clan = this._playerClan()
    if (!clan) { f.bracket = null; return { outcome: 'moot' } }
    const get = id => id === self ? this._selfAsPerson() : w.persons[id]
    const nameOf = id => id === self ? s.name : Persons.fullName(w.persons[id])
    for (let guard = 0; guard < 500; guard++) {
      if (!br.order) {
        br.pool = br.pool.filter(id => id === self ? !br.selfOut : w.persons[id] && w.persons[id].alive !== false)
        if (br.pool.length <= 1) break
        br.roundLethal = br.lethal && br.pool.length > TOURNAMENT_TOP
        br.order = [...br.pool].sort(() => Math.random() - 0.5); br.next = []; br.i = 0
        if (br.order.length % 2) br.next.push(br.order.pop())
      }
      if (br.i >= br.order.length) { br.pool = br.next; br.order = null; br.round++; continue }
      const idA = br.order[br.i], idB = br.order[br.i + 1]
      if (idA === self || idB === self) {
        const opp = get(idA === self ? idB : idA)
        br.oppId = opp.id
        this._startFight('stepdown', opp, br.roundLethal)
        return { outcome: 'bout', next: true }
      }
      const pa = get(idA), pb = get(idB)
      const res = this._resolveFight(pa, pb, br.roundLethal)
      this._applyLethalTrauma(res, br.roundLethal)
      const winId = res.winner === pa ? idA : idB, loseId = winId === idA ? idB : idA
      this._bracketRecord(br, winId, loseId, res)
      this.addEvent({ text: `${nameOf(winId)} defeats ${nameOf(loseId)}${res.died ? ', and they do not rise' : res.yielded ? ' as they yield' : ''}.`, type: res.died ? 'negative' : 'neutral' })
    }
    const ranking = [br.pool[0], ...br.eliminated.sort((a, b) => (b.round - a.round) || (b.stage - a.stage)).map(e => e.id)]
    const result = { winnerId: br.pool[0], ranking, deaths: br.deaths, lines: [], selfOut: br.selfOut }
    f.bracket = null
    return this._finishStepDown(clan, result, br.lethal, true, br.yr)
  }

  _bracketRecord(br, winId, loseId, res) {
    const self = this._s.self.id
    br.next.push(winId)
    if (res.died) { br.deaths++; if (loseId === self) br.selfOut = 'died'; else this._killPerson(loseId, br.yr, 'stepdown_tournament') }
    else if (loseId === self && !br.selfOut) br.selfOut = 'eliminated'
    const lp = loseId === self ? this._selfAsPerson() : this._s.world.persons[loseId]
    br.eliminated.push({ id: loseId, round: br.round, died: !!res.died, stage: lp?.stageIndex ?? 0 })
    br.i += 2
  }

  // Your bout in the bracket is over (lost / yielded, or your end choice after a win): record it, run on.
  _stepdownBoutEnd(fi, opp, res) {
    const s = this._s, br = s.family.bracket
    if (!br) return 'moot'
    this._applyLethalTrauma(res, fi.lethal)
    const youWon = res.winner.id === s.self.id
    this._bracketRecord(br, res.winner.id, res.loser.id, res)
    const oppName = Persons.fullName(opp)
    this.addEvent({ text: youWon ? `You defeat ${oppName}${res.died ? ', and they do not rise' : ''}.` : `${oppName} defeats you${res.died ? '' : '. You are out of the contest'}.`, type: youWon ? 'positive' : 'negative' })
    return this._bracketStep().outcome
  }

  // What the battle page shows about a bracket you are in (null when none): round, fighters left, blood or not.
  _bracketInfo() {
    const br = this._s.family?.bracket
    if (!br) return null
    return { round: br.round, left: (br.pool || []).length, lethal: !!br.roundLethal, bloodTo: TOURNAMENT_TOP }
  }
  // After a person fight ends: a step-down bracket may already have started your next bout.
  _afterBoutInfo() {
    const fi = this._s.family?.fight
    return fi?.kind === 'stepdown' && !fi.over && (!fi.m || (fi.m.turn === 1 && !fi.m.plan)) ? { next: true } : {}
  }

  // Settles the seat after a step-down bracket (yours, played; or the one you watched). `joined` = you were in it.
  _finishStepDown(clan, result, lethal, joined, yr) {
    const s = this._s, f = s.family, w = s.world
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
    return !!(f.tournament || f.headChallenge || f.stepDownOffer || f.fight || f.bracket)
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

  // Public (UI): rough strength preview — your line vs. the main line, pre-war. `chance` is the win odds before
  // the other branches pick sides (_resolveBranchWar adds their weight at declaration).
  branchWarPreview() {
    const info = this._branchInfo()
    if (!info || info.isMain) return null
    const ours = this._lineStrength(info.clan, info.mine), main = this._lineStrength(info.clan, info.main)
    return { ours: Math.round(ours), main: Math.round(main), chance: 1 / (1 + Math.exp(-(ours - main) / BRANCH_WAR_SPREAD)) }
  }

  // ── 1.8b-4 (UI read helpers, no state changes) ─────────────────────────────

  // What this life would add to the clan's Ancestral Merit if it ended now — same terms as _recordLifeInWorld.
  meritPreview() {
    const s = this._s
    const maxStage = Math.max(s.maxStageThisLife || 0, s.stageIndex)
    const stage = MERIT_STAGE * Math.pow(maxStage / (CULTIVATION_STAGES.length - 1), 2)
    const firsts = (s.lifeMerit || []).map(m => ({ label: m.label, merit: m.merit }))
    const wars = (s.sectWar?.warVictories || 0) * MERIT_DEED_WAR_WON
    const beasts = (s.beasts || []).length * MERIT_DEED_BEAST
    const disciples = (s.ownSect?.disciples || []).length * MERIT_DEED_DISCIPLE
    const deedsRaw = wars + beasts + disciples
    const deeds = Math.min(MERIT_DEED_CAP, deedsRaw)
    const firstsTotal = firsts.reduce((a, m) => a + m.merit, 0)
    return { stage, firsts, firstsTotal, wars, beasts, disciples, deedsRaw, deeds, cap: MERIT_DEED_CAP,
             total: Math.round(stage + firstsTotal + deeds), orphan: !this._playerClan() }
  }

  // Family Manual choices: every technique the clan has ever learned, with whether this legacy level allows it.
  familyManualOptions() {
    const clan = this._playerClan()
    const lvl = clan?.legacies?.family_manual || 0
    if (!clan || !lvl) return null
    const maxTier = CLAN_LEGACIES.family_manual.levels[lvl - 1].value
    return { maxTier, current: clan.manualTechId, options: clan.techniquesEver
      .map(id => TECHNIQUES.find(t => t.id === id)).filter(Boolean)
      .map(t => ({ id: t.id, name: t.name, minStage: t.minStage, allowed: t.minStage <= maxTier })) }
  }

  // Other clans your clan has feelings about (clan.relations: −100 feud … +100 allied), strongest first.
  clanRelations() {
    const clan = this._playerClan(), w = this._s.world
    if (!clan) return []
    return Object.entries(clan.relations || {}).map(([id, value]) => ({ id, value, clan: w.clans[id] || null }))
      .filter(r => r.clan).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  }

  // Resolves attackerLine's war on the main line at once. Only ever called with the PLAYER's own line as the
  // attacker (no NPC branch declares on its own — that's M4's job). Aggregate line power (+ uninvolved
  // branches who pick a side) decides the logistic win chance; the losing side's head is deposed unless a
  // death roll hits, in which case they die (you: _die('branch_war'); an NPC: killed outright). The winning
  // line becomes the new main line; the old main line is simply relabeled as a branch.
  _resolveBranchWar(clan, attackerLine) {
    this._repairLines(clan)   // final QA: the heads that fight are the heads the lines really have
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
    // Phase 42: a martial art manual, now and then (more often in harder places)
    if (Math.random() < ART_EXPEDITION_DROP + ART_EXPEDITION_DROP_TIER * ((loc.enemyTier || 1) - 1)) {
      const artId = this._rollArt(ART_DROP_WEIGHTS_BY_TIER[Math.min(6, loc.enemyTier || 1)])
      if (artId) this._grantManual(artId, `in ${loc.name}`)
    }

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

        this._spawnBeastEncounter(beastType)
      }
    }

    // Lover encounter (family.md): at most one per expedition, max LOVER_ENCOUNTER_MAX pending, never expire.
    // Skipped for a not-yet-migrated save during initSlot()'s offline catch-up (no encounters/clan yet).
    const fam = s.family
    if (fam && Array.isArray(fam.encounters) && s.world && (s.maxStageThisLife || 0) >= PROPOSAL_MIN_STAGE && fam.encounters.length < LOVER_ENCOUNTER_MAX &&
        Math.random() < LOVER_ENCOUNTER_CHANCE) {
      // 1.8b-3a: sometimes it's a suitor who once refused you (family.md → spurned).
      const old = Array.isArray(fam.spurned) && fam.spurned.length && Math.random() < SPURNED_ENCOUNTER_CHANCE
        ? fam.spurned.splice(Math.floor(Math.random() * fam.spurned.length), 1)[0] : null
      const person = old ? { ...old.person, role: 'stranger' } : this._rollStranger('stranger')
      const flavor = old ? 'once refused your proposal, and now falls into step beside you'
        : LOVER_ENCOUNTER_TEXT[Math.floor(Math.random() * LOVER_ENCOUNTER_TEXT.length)]
      fam.encounters.push({ person, place: loc.name, text: flavor, year: Math.floor(s.world.year), ...(old ? { spurned: true } : {}) })
      this.addEvent({ text: `At ${loc.name}, ${Persons.fullName(person)} ${flavor}. (Roam → Explore)`, type: 'special' })
      this._emit('lover_encounter', { name: Persons.fullName(person) })
    }

    // Phase 44: a stranger on the road carries a formula — help them to learn it, or rob them (Roam → Explore).
    if (fam && Array.isArray(fam.encounters) && s.world && s.recipes) {
      const pool = RECIPE_DISCOVERY.encounter.filter(id => !s.recipes.known[id])
      if (pool.length && fam.encounters.length < LOVER_ENCOUNTER_MAX && Math.random() < RECIPE_DISCOVERY.encounterChance) {
        const recipeId = pool[Math.floor(Math.random() * pool.length)]
        const person = this._rollStranger('stranger')
        const flavor = RECIPE_ENCOUNTER_TEXT[Math.floor(Math.random() * RECIPE_ENCOUNTER_TEXT.length)]
        fam.encounters.push({ kind: 'recipe', recipeId, person, place: loc.name, text: flavor, year: Math.floor(s.world.year) })
        this.addEvent({ text: `At ${loc.name}, ${Persons.fullName(person)} ${flavor}. (Roam → Explore)`, type: 'special' })
        this._emit('recipe_encounter', { name: Persons.fullName(person) })
      }
    }

    // Health risk: zones whose enemy tier outclasses the player's current stage (Phase 23A)
    const expectedTier = 1 + Math.floor(s.stageIndex / 5)
    const outclass = Math.max(0, loc.enemyTier - expectedTier)
    this._roadRoll('expedition', loc)   // Phase 28 4.9: someone on the road (living-world.md §9)

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
    const locId = s.automation.autoExploreLocationId || s.automation.lastExploreLocationId
    if (!locId) return
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
    if (recipe.hidden && !this.recipeKnown(recipeId)) return { ok: false, reason: 'locked' }   // Phase 44: not yet discovered
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
    if (item.effect?.type === 'heal') return { ok: false, reason: 'not_bt_pill' }   // Phase 44: a healing pill is used, not queued
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

  // ── Phase 42 (task 1.12, docs/systems/arts.md): combat arts — library, manuals, study, loadout, offers ─────────
  // s.arts = { known: { [artId]: { mastery, xp, uses, how, at } }, loadout: { moves: [id|null ×4], passives: [id|null ×5] },
  //            studies: [{ artId, startedAt, endsAt, src: 'manual'|'clan' }] (1.14b: one desk each, ART_STUDY_SLOTS by realm),
  //            offers: [{ id, realm, options: [artId ×3] }], found: { [artId]: true } }
  _blankArts() {
    const known = {}
    for (const id of ART_BASICS) known[id] = { mastery: 1, xp: 0, uses: 0, how: 'basic', at: Date.now() }
    const els = this.rootElements()
    const starter = ARTS_LIST.find(a => a.starter && a.element === els[0])
    if (starter) known[starter.id] = { mastery: 1, xp: 0, uses: 0, how: 'root', at: Date.now() }
    const moves = Object.keys(known).filter(id => ARTS[id].kind === 'move')
    // Phase 42 (user 2026-10-01): 4 saved loadouts you set freely and switch between. `loadout` stays the live pointer to
    // the active deck, so every reader of s.arts.loadout (fights, the sim bot, the sim checks) is unchanged.
    const deck = () => ({ moves: Array(ART_MOVE_SLOTS).fill(null), passives: Array(ART_PASSIVE_SLOTS_MAX).fill(null) })
    const loadouts = Array.from({ length: ART_LOADOUT_COUNT }, deck)
    loadouts[0].moves = [...moves, ...Array(ART_MOVE_SLOTS).fill(null)].slice(0, ART_MOVE_SLOTS)
    return { known, loadouts, activeLoadout: 0, loadout: loadouts[0],
      studies: [], offers: [], found: Object.fromEntries(Object.keys(known).map(id => [id, true])), parryMode: 'normal', parryLog: [], parryTaught: false }
  }

  _ensurePhase42Fields() {
    const s = this._s
    if (!Array.isArray(s.root?.elements)) s.root.elements = Persons.rootElements(s.root, `${s.self?.id ?? ''}|${s.name}`)
    if (!s.arts || typeof s.arts !== 'object') s.arts = this._blankArts()
    const a = s.arts
    if (!a.known || typeof a.known !== 'object') a.known = {}
    for (const id of Object.keys(a.known)) if (!ARTS[id]) delete a.known[id]
    for (const id of ART_BASICS) if (!a.known[id]) a.known[id] = { mastery: 1, xp: 0, uses: 0, how: 'basic', at: Date.now() }
    if (!a.loadout || typeof a.loadout !== 'object') a.loadout = { moves: [], passives: [] }
    // Phase 42 (user 2026-10-01): 4 saved loadouts. An old save's single `loadout` becomes deck 1; `loadout` stays the
    // live pointer to the active deck, so every reader of s.arts.loadout is unchanged.
    if (!Array.isArray(a.loadouts)) a.loadouts = [a.loadout]
    a.loadouts = a.loadouts.slice(0, ART_LOADOUT_COUNT)
    while (a.loadouts.length < ART_LOADOUT_COUNT) a.loadouts.push({ moves: [], passives: [] })
    if (!(Number.isInteger(a.activeLoadout) && a.activeLoadout >= 0 && a.activeLoadout < ART_LOADOUT_COUNT)) a.activeLoadout = 0
    const clean = (arr, n, kind) => Array.from({ length: n }, (_, i) => { const id = arr?.[i]; return id && a.known[id] && ARTS[id]?.kind === kind ? id : null })
    a.loadouts = a.loadouts.map(d => { const o = d && typeof d === 'object' ? d : {}
      return { moves: clean(o.moves, ART_MOVE_SLOTS, 'move'), passives: clean(o.passives, ART_PASSIVE_SLOTS_MAX, 'passive') } })
    a.loadout = a.loadouts[a.activeLoadout]
    // 1.14b: one study → a list of desks (an old save's study becomes the first desk; a desk beyond your realm's count keeps running)
    if (!Array.isArray(a.studies)) a.studies = a.study ? [{ src: 'manual', ...a.study }] : []
    delete a.study
    a.studies = a.studies.filter(d => d && ARTS[d.artId] && d.endsAt > 0).map(d => ({ src: 'manual', ...d }))
    if (!Array.isArray(a.offers)) a.offers = []
    a.offers = a.offers.filter(o => Array.isArray(o.options) && o.options.every(id => ARTS[id]))
    if (!a.found || typeof a.found !== 'object') a.found = {}
    for (const id of Object.keys(a.known)) a.found[id] = true
    if (!['normal', 'wide', 'off'].includes(a.parryMode)) a.parryMode = 'normal'
    if (!Array.isArray(a.parryLog)) a.parryLog = []
    if (typeof a.parryTaught !== 'boolean') a.parryTaught = false
    const fi = s.family?.fight
    if (fi?.kind === 'beast' && !fi.m && !fi.over) { const rec = fi.beast; if (rec && BEAST_TYPES.some(x => x.id === rec.typeId)) fi.m = this._mbNew(rec, fi.stance) }   // an old-engine fight restarts on moves
    if (fi && fi.kind !== 'beast' && !fi.m && !fi.over) this._personFightM(fi)   // 1.14a: a person fight too (at your current Health)
    if (fi) { for (const k of ['p', 'to', 'you', 'them']) delete fi[k] }        // the Press/Guard/Feint race is gone
  }

  // ── Phase 44 (docs/systems/crafting.md): healing pills + discovery-gated recipes ──────────────────────────────
  // s.recipes = { known: { [recipeId]: { how, at } } }. A RECIPES entry with `hidden: true` is unknown until found
  // (a stranger on the road, or an Arena ring champion — RECIPE_DISCOVERY in recipes.js). Used by game.js (Craft,
  // Pack), combat.js (the Arena result line), the expedition encounter roll and the sim.
  _blankRecipes() {
    const known = {}
    for (const r of RECIPES) if (!r.hidden) known[r.id] = { how: 'basic', at: Date.now() }
    return { known }
  }
  _ensurePhase44Fields() {
    const s = this._s
    if (!s.recipes || typeof s.recipes !== 'object') s.recipes = this._blankRecipes()
    const r = s.recipes
    if (!r.known || typeof r.known !== 'object') r.known = {}
    for (const id of Object.keys(r.known)) if (!RECIPES.some(x => x.id === id)) delete r.known[id]   // a formula dropped from the game
    for (const rec of RECIPES) if (!rec.hidden && !r.known[rec.id]) r.known[rec.id] = { how: 'basic', at: Date.now() }
  }
  recipeKnown(recipeId) { return !!this._s?.recipes?.known?.[recipeId] }
  // Where an unknown formula comes from (null for a recipe that is never hidden).
  recipeSource(recipeId) {
    if (RECIPE_DISCOVERY.encounter.includes(recipeId)) return 'encounter'
    for (const ring of Object.keys(RECIPE_DISCOVERY.arena)) if (RECIPE_DISCOVERY.arena[ring] === recipeId) return 'arena'
    if ((RECIPE_DISCOVERY.boss || []).includes(recipeId)) return 'boss'   // v1 add-on: a legendary boss's heart
    return null
  }
  // The lock line the Craft tab shows on an unknown-formula card.
  recipeHint(recipeId) {
    const src = this.recipeSource(recipeId)
    return src === 'encounter' ? 'A stranger on the road (Roam → Explore) may teach this one.'
      : src === 'arena' ? 'A ring champion (Roam → Arena) guards this formula.'
      : src === 'boss' ? 'A legendary beast (Roam → Hunt → Legendary) carries what it is made from.'
      : 'Its formula is not yet known.'
  }
  _learnRecipe(recipeId, how) {
    const s = this._s, rec = RECIPES.find(r => r.id === recipeId)
    if (!rec || s.recipes.known[recipeId]) return false
    s.recipes.known[recipeId] = { how, at: Date.now() }
    const name = ITEMS[rec.productId]?.name || recipeId
    this.addEvent({ text: `You learn the formula for ${name}. Craft it in Pack → Craft.`, type: 'special' })
    this._emit('recipe_learned', { recipeId, how })
    this._recalc(); this._notify()
    return true
  }
  // A random still-unknown formula from a source group ('encounter' | 'arena' | null = any hidden one).
  _rollHiddenRecipe(source = null) {
    const s = this._s
    let pool = RECIPES.filter(r => r.hidden && !s.recipes.known[r.id] && this.recipeSource(r.id) !== 'boss')   // (a boss's formula never turns up by chance)
    if (source) pool = pool.filter(r => this.recipeSource(r.id) === source)
    if (!pool.length) return null
    return pool[Math.floor(Math.random() * pool.length)].id
  }
  // A healing pill ('heal') — restore Health / Realm Integrity on use (not queued for a breakthrough). Clamped to 100.
  // Refused when there is nothing to restore (no silent waste).
  healLock(effect) {
    const s = this._s
    const hpFull = (s.health ?? 100) >= this.maxHealth(), igFull = (s.realmIntegrity ?? 100) >= 100
    return ((!effect.health || hpFull) && (!effect.integrity || igFull)) ? 'full' : null
  }
  useHealPill(itemId) {
    const s = this._s, item = ITEMS[itemId]
    if (!item || item.type !== 'pill' || item.effect?.type !== 'heal') return { ok: false, reason: 'not_heal' }
    if ((s.inventory[itemId] || 0) < 1) return { ok: false, reason: 'not_owned' }
    if (this.healLock(item.effect)) return { ok: false, reason: 'full' }
    s.inventory[itemId]--
    if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    const e = item.effect, hp0 = s.health ?? 100, ig0 = s.realmIntegrity ?? 100
    s.health = Math.min(this.maxHealth(), hp0 + (e.health || 0))
    s.realmIntegrity = Math.min(100, ig0 + (e.integrity || 0))
    const healed = Math.round(s.health - hp0), igHealed = Math.round(s.realmIntegrity - ig0)
    const parts = []
    if (healed > 0) parts.push(`+${healed} Health`)
    if (igHealed > 0) parts.push(`+${igHealed} Integrity`)
    this.addEvent({ text: `You take the ${item.name}. ${parts.length ? parts.join(', ') + '.' : 'Nothing changes.'}`, type: (healed || igHealed) ? 'positive' : 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, health: s.health, integrity: s.realmIntegrity, healed, integrityHealed: igHealed }
  }
  // The i-th road encounter is a stranger carrying a formula. Help them — and learn it.
  learnEncounterRecipe(i) {
    const s = this._s, f = s.family, enc = f.encounters[i]
    if (!enc || enc.kind !== 'recipe') return { ok: false, reason: 'unknown' }
    f.encounters.splice(i, 1)
    const rec = RECIPES.find(r => r.id === enc.recipeId)
    const name = ITEMS[rec?.productId]?.name || 'a formula'
    if (rec && !s.recipes.known[rec.id]) this._learnRecipe(rec.id, 'encounter')
    else this.addEvent({ text: `You help ${Persons.fullName(enc.person)} — and trade formulas you both already know.`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, recipeId: enc.recipeId, name }
  }
  // Or rob them — quick stones, no formula, and karma remembers.
  robEncounterRecipe(i) {
    const s = this._s, f = s.family, enc = f.encounters[i]
    if (!enc || enc.kind !== 'recipe') return { ok: false, reason: 'unknown' }
    f.encounters.splice(i, 1)
    const stones = RECIPE_DISCOVERY.robStones
    s.spiritStones += stones
    s.karma = Math.max(0, s.karma + RECIPE_DISCOVERY.robKarma)
    this.addEvent({ text: `You rob ${Persons.fullName(enc.person)} on the road for ${stones} Spirit Stones. The formula is lost with them.`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true, stones }
  }

  rootElements() { const r = this._s?.root; return Array.isArray(r?.elements) ? r.elements : Persons.rootElements(r || {}, '') }
  passiveSlots(stage = this._s.stageIndex) { let n = 1; for (const x of ART_PASSIVE_SLOTS) if (stage >= x.stage) n = x.slots; return n }
  // 1.14b (user): study desks — how many manuals you can study at once, by realm (ART_STUDY_SLOTS)
  studySlots(stage = this._s.stageIndex) { let n = 1; for (const x of ART_STUDY_SLOTS) if (stage >= x.stage) n = x.slots; return n }
  artStudySeconds(artId) {
    const base = ART_RARITY[ARTS[artId]?.rarity]?.studySeconds || 60
    return Math.round(base * Math.max(ART_STUDY_MIN_FRAC, 1 / (1 + ART_STUDY_COMPREHENSION * (this._s.comprehension || 0))))
  }
  // An art's numbers at your mastery: power +8%/level, cost −1/level (never below 0).
  artStats(artId) {
    const art = ARTS[artId], k = this._s.arts.known[artId], lv = k?.mastery || 1
    if (!art) return null
    if (art.kind !== 'move') return { art, mastery: lv, known: !!k }
    const m = art.move
    return { art, mastery: lv, known: !!k, power: Math.round(m.power * (1 + ART_MASTERY_POWER * (lv - 1))), cost: Math.max(0, m.cost - ART_MASTERY_COST * (lv - 1)) }
  }
  // Why a manual can't be studied right now (null = it can).
  artStudyLock(artId) {
    const s = this._s, art = ARTS[artId], k = s.arts.known[artId]
    if (!art) return 'unknown'
    if (!(s.inventory['manual_' + artId] > 0)) return 'no_manual'
    if (s.stageIndex < art.minStage) return 'stage'
    if (k && k.mastery >= ART_MASTERY_MAX) return 'maxed'
    return this._deskLock(artId)
  }
  // A free desk for this art? 'studying' = already on a desk · 'busy' = every desk your realm allows is taken
  _deskLock(artId) {
    const st = this._s.arts.studies || []
    if (st.some(d => d.artId === artId)) return 'studying'
    if (st.length >= this.studySlots()) return 'busy'
    return null
  }
  _startDesk(artId, secs, src) {
    const s = this._s, now = Date.now()
    s.arts.studies.push({ artId, startedAt: now, endsAt: now + secs * 1000, src })
  }
  studyArt(artId) {
    const s = this._s, lock = this.artStudyLock(artId)
    if (lock) return { ok: false, reason: lock }
    s.inventory['manual_' + artId]--
    if (s.inventory['manual_' + artId] <= 0) delete s.inventory['manual_' + artId]
    const secs = this.artStudySeconds(artId)
    this._startDesk(artId, secs, 'manual')
    this.addEvent({ text: `You sit down with the ${ARTS[artId].name} manual. (${fmtTime(secs)})`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, seconds: secs }
  }
  // Stop a desk (default: the first). A manual goes back in the pack; a clan-library study just ends.
  cancelStudy(artId = null) {
    const s = this._s, st = s.arts.studies, i = artId ? st.findIndex(d => d.artId === artId) : 0
    const d = st[i]
    if (!d) return { ok: false, reason: 'none' }
    if (d.src === 'manual') s.inventory['manual_' + d.artId] = (s.inventory['manual_' + d.artId] || 0) + 1
    st.splice(i, 1)
    this._recalc(); this._notify()
    return { ok: true }
  }
  // Every desk whose time is up (tick; timestamps, so it also completes after a closed game)
  _finishStudies() {
    const s = this._s, now = Date.now()
    const done = (s.arts?.studies || []).filter(d => now >= d.endsAt)
    if (!done.length) return
    s.arts.studies = s.arts.studies.filter(d => now < d.endsAt)
    for (const d of done) this._learnArt(d.artId, d.src === 'clan' || d.src === 'sect' ? d.src : 'study')
  }
  // Learn an art (or deepen it: a known art gains a mastery level). how: study | offer | grant | …
  _learnArt(artId, how) {
    const s = this._s, art = ARTS[artId]
    if (!art) return
    const k = s.arts.known[artId]
    s.arts.found[artId] = true
    if (k) {
      if (k.mastery < ART_MASTERY_MAX) { k.mastery++; k.xp = Math.max(k.xp, ART_MASTERY_XP[k.mastery]) }
      this.addEvent({ text: `${art.name} deepens: mastery ${k.mastery} of ${ART_MASTERY_MAX}.`, type: 'positive' })
    } else {
      s.arts.known[artId] = { mastery: 1, xp: 0, uses: 0, how, at: Date.now() }
      this.addEvent({ text: how === 'grant' ? `Your cultivation opens a new art on its own: ${art.name}. Equip it in Path → Arts.`
        : `You have learned ${art.name} (${ART_RARITY[art.rarity].name} grade ${art.kind === 'move' ? 'move' : 'passive art'}). Equip it in Path → Arts.`, type: 'special' })
    }
    this._emit('art_learned', { artId, how })
    this._recalc(); this._notify()
  }
  // A manual into the pack, with a log line naming where it came from.
  _grantManual(artId, where) {
    const s = this._s, art = ARTS[artId]
    if (!art) return
    s.inventory['manual_' + artId] = (s.inventory['manual_' + artId] || 0) + 1
    s.arts.found[artId] = true
    const note = s.stageIndex < art.minStage ? ' It is too profound for you yet.' : s.arts.known[artId] ? ' You know it already: study it again to deepen it, or sell it.' : ' Study it from your pack.'
    this.addEvent({ text: `You find a martial art manual ${where}: ${art.name} (${ART_RARITY[art.rarity].name} grade).${note}`, type: 'special' })
    this._emit('art_manual', { artId })
  }
  // A random non-signature art by rarity weights (optionally one element). Prefers arts you don't know yet.
  _rollArt(weights, element = null) {
    const pool = ARTS_LIST.filter(a => !a.sig && !ART_BASICS.includes(a.id) && !Object.values(ART_STAGE_GRANTS).includes(a.id) && weights?.[a.rarity] && (!element || a.element === element))
    if (!pool.length) return null
    const fresh = pool.filter(a => !this._s.arts.known[a.id])
    const use = fresh.length && Math.random() < 0.8 ? fresh : pool
    let r = Math.random() * use.reduce((t, a) => t + weights[a.rarity], 0)
    for (const a of use) { r -= weights[a.rarity]; if (r <= 0) return a.id }
    return use[use.length - 1].id
  }
  // Breakthrough insight: 3 arts you don't know, one of your root's element when there is one. Waits for your pick.
  _offerArts(realm) {
    const s = this._s, w = ART_OFFER_WEIGHTS[realm]
    if (!w) return
    const pool = ARTS_LIST.filter(a => !a.sig && !s.arts.known[a.id] && !ART_BASICS.includes(a.id) && !Object.values(ART_STAGE_GRANTS).includes(a.id) && w[a.rarity] && a.minStage <= s.stageIndex)
    const pick = list => { let r = Math.random() * list.reduce((t, a) => t + w[a.rarity], 0); for (const a of list) { r -= w[a.rarity]; if (r <= 0) return a } return list[list.length - 1] }
    const out = [], els = this.rootElements()
    const mine = pool.filter(a => els.includes(a.element))
    if (mine.length) out.push(pick(mine))
    while (out.length < ART_OFFER_COUNT) { const left = pool.filter(a => !out.includes(a)); if (!left.length) break; out.push(pick(left)) }
    if (!out.length) return
    for (const a of out) s.arts.found[a.id] = true
    s.arts.offers.push({ id: `${Date.now()}_${Math.floor(Math.random() * 9999)}`, realm, options: out.map(a => a.id) })
    this.addEvent({ text: `Breaking into ${realm}, you glimpse the shape of new arts. Choose one to keep in Path → Arts.`, type: 'special' })
  }
  chooseArtOffer(offerId, artId) {
    const s = this._s, i = s.arts.offers.findIndex(o => o.id === offerId)
    if (i < 0) return { ok: false, reason: 'no_offer' }
    if (!s.arts.offers[i].options.includes(artId)) return { ok: false, reason: 'bad_choice' }
    s.arts.offers.splice(i, 1)
    this._learnArt(artId, 'offer')
    return { ok: true }
  }
  // Put a known art in a slot of the ACTIVE loadout (null clears it). An art already in another slot moves (slots never
  // hold duplicates). (user 2026-09-30) Never refused mid-fight: a battle runs on the deck it began with (`_mbYou`'s
  // `slots`), so changing your loadout now only affects your *next* fight.
  setArtSlot(kind, index, artId) {
    const s = this._s, a = s.arts
    const list = kind === 'move' ? a.loadout.moves : kind === 'passive' ? a.loadout.passives : null
    if (!list || !(index >= 0 && index < list.length)) return { ok: false, reason: 'bad_slot' }
    if (kind === 'passive' && index >= this.passiveSlots()) return { ok: false, reason: 'locked' }
    if (artId != null) {
      if (!a.known[artId]) return { ok: false, reason: 'unknown' }
      if (ARTS[artId].kind !== kind) return { ok: false, reason: 'wrong_kind' }
      const was = list.indexOf(artId)
      if (was >= 0) list[was] = list[index]            // swap places
    }
    list[index] = artId ?? null
    this._save(); this._notify()
    return { ok: true }
  }
  // Switch which saved loadout fights (user 2026-10-01). The active deck is what `s.arts.loadout` points at, so fights,
  // estimates and the sim all read it. A battle keeps the deck it began with, so switching only affects the next fight.
  setActiveLoadout(i) {
    const a = this._s.arts
    if (!a || !Array.isArray(a.loadouts) || !(Number.isInteger(i) && i >= 0 && i < a.loadouts.length)) return { ok: false, reason: 'bad_loadout' }
    if (a.activeLoadout !== i) { a.activeLoadout = i; a.loadout = a.loadouts[i]; this._save(); this._notify() }
    return { ok: true }
  }
  // ── 1.14b (arts.md → "42c part 2"): the sect library + the clan library ──────────────────────────────────────────
  // A joined sect's library: its elements' arts + neutral (never signatures, basics or the fixed grants), each grade opened
  // by your rank (SECT_LIBRARY_GRADE_BY_RANK), bought for Contribution. Returns null when you are in no joined sect.
  sectLibrary() {
    const s = this._s, sect = s.sect?.id && SECTS.find(x => x.id === s.sect.id)
    if (!sect) return null
    const els = SECT_ART_ELEMENTS[sect.id] || [], R = ART_RARITY_ORDER
    const topAt = rank => R.indexOf(SECT_LIBRARY_GRADE_BY_RANK[Math.min(rank, SECT_LIBRARY_GRADE_BY_RANK.length - 1)])
    const rankFor = g => SECT_LIBRARY_GRADE_BY_RANK.findIndex(x => R.indexOf(x) >= R.indexOf(g))
    const arts = ARTS_LIST.filter(a => !a.sig && !ART_BASICS.includes(a.id) && !Object.values(ART_STAGE_GRANTS).includes(a.id)
        && SECT_LIBRARY_PRICE[a.rarity] != null && (els.includes(a.element) || a.element === 'neutral'))
      .map(a => {
        const price = SECT_LIBRARY_PRICE[a.rarity], needRank = rankFor(a.rarity)
        const lock = R.indexOf(a.rarity) > topAt(s.sect.rank) ? 'rank' : s.sect.contribution < price ? 'contribution' : null
        return { id: a.id, price, needRank, lock, known: !!s.arts.known[a.id], held: s.inventory['manual_' + a.id] || 0, tooProfound: s.stageIndex < a.minStage }
      })
      .sort((x, y) => R.indexOf(ARTS[x.id].rarity) - R.indexOf(ARTS[y.id].rarity) || (els.indexOf(ARTS[y.id].element) >= 0) - (els.indexOf(ARTS[x.id].element) >= 0) || ARTS[x.id].name.localeCompare(ARTS[y.id].name))
    return { sect, elements: els, rank: s.sect.rank, contribution: s.sect.contribution, arts }
  }
  // Your choice: a manual from the library for its price in Contribution (your rank is kept).
  buySectArt(artId) {
    const lib = this.sectLibrary()
    if (!lib) return { ok: false, reason: 'no_sect' }
    const row = lib.arts.find(x => x.id === artId)
    if (!row) return { ok: false, reason: 'unknown' }
    if (row.lock) return { ok: false, reason: row.lock }
    this._s.sect.contribution -= row.price
    this._grantManual(artId, `in the ${lib.sect.name}'s library, for ${row.price} Contribution`)
    this._recalc(); this._notify()
    return { ok: true, price: row.price }
  }

  // ── Giving manuals to your sect (user 2026-09-30) ──
  // The shelf of the sect you belong to (joined: s.sect.shelf, lost to you when you leave · founded: s.ownSect.library).
  _sectShelf() {
    const s = this._s
    if (s.ownSect?.founded) return (s.ownSect.library ||= [])
    if (s.sect?.id) return (s.sect.shelf ||= [])
    return null
  }
  // War strength from the shelf: Σ SECT_SHELF_WAR by grade, capped (a multiplier on the sect's side of the roll)
  sectShelfWar() {
    const shelf = this._sectShelf()
    if (!shelf?.length) return 0
    return Math.min(SECT_SHELF_WAR_CAP, shelf.reduce((t, x) => t + (SECT_SHELF_WAR[ARTS[x.artId]?.rarity] || 0), 0))
  }
  // What the Library's giving section shows: each manual in your pack, what giving it pays, or why not (on the shelf already)
  sectDonateInfo() {
    const s = this._s, shelf = this._sectShelf()
    if (!shelf) return null
    const own = !!s.ownSect?.founded, on = new Set(shelf.map(x => x.artId)), war = this.sectShelfWar()
    const manuals = Object.keys(s.inventory).filter(k => k.startsWith('manual_') && s.inventory[k] > 0 && ARTS[k.slice(7)]).map(k => {
      const id = k.slice(7), a = ARTS[id], w = SECT_SHELF_WAR[a.rarity] || 0
      return { id, n: s.inventory[k], contribution: own ? 0 : SECT_DONATE_CONTRIB[a.rarity] || 0, war: Math.max(0, Math.min(SECT_SHELF_WAR_CAP, war + w) - war),
        known: !!s.arts.known[id], spare: !!s.arts.known[id], lock: on.has(id) ? 'shelved' : null }
    }).sort((x, y) => (y.spare - x.spare) || ART_RARITY_ORDER.indexOf(ARTS[y.id].rarity) - ART_RARITY_ORDER.indexOf(ARTS[x.id].rarity))
    const shelfRows = shelf.filter(x => ARTS[x.artId]).map(x => ({ ...x, seconds: Math.max(1, Math.round(this.artStudySeconds(x.artId) * SECT_SHELF_STUDY_FRAC)),
      lock: !own ? 'member' : s.arts.known[x.artId] ? 'known' : s.stageIndex < ARTS[x.artId].minStage ? 'stage' : this._deskLock(x.artId) }))
    return { own, manuals, shelf: shelfRows, war, cap: SECT_SHELF_WAR_CAP }
  }
  // Your choice: give one manual to your sect (it leaves your pack for good)
  donateManualToSect(artId) {
    const s = this._s, info = this.sectDonateInfo()
    if (!info) return { ok: false, reason: 'no_sect' }
    const row = info.manuals.find(x => x.id === artId)
    if (!row) return { ok: false, reason: 'no_manual' }
    if (row.lock) return { ok: false, reason: row.lock }
    s.inventory['manual_' + artId]--
    if (s.inventory['manual_' + artId] <= 0) delete s.inventory['manual_' + artId]
    this._sectShelf().push({ artId, by: s.name, year: Math.floor(s.world.year) })
    const name = info.own ? s.ownSect.name : this._sectDef()?.name
    if (!info.own) s.sect.contribution += row.contribution
    this.addEvent({ text: `You give the ${ARTS[artId].name} manual to the ${name || 'sect'} library.${row.contribution ? ` +${row.contribution} Contribution.` : ''} Its disciples will train in it${row.war ? ` (war strength +${Math.round(row.war * 100)}%)` : ''}.`, type: 'positive' })
    this._emit('sect_donate', { artId })
    this._recalc(); this._notify()
    return { ok: true, contribution: row.contribution, war: row.war }
  }
  // A founder studies an art from their own sect's library (no manual, SECT_SHELF_STUDY_FRAC of the time; arts you don't know)
  studyFromSect(artId) {
    const info = this.sectDonateInfo()
    if (!info) return { ok: false, reason: 'no_sect' }
    const row = info.shelf.find(x => x.artId === artId)
    if (!row) return { ok: false, reason: 'not_on_shelf' }
    if (row.lock) return { ok: false, reason: row.lock }
    this._startDesk(artId, row.seconds, 'sect')
    this.addEvent({ text: `You take ${ARTS[artId].name} down from your sect's library. (${fmtTime(row.seconds)})`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, seconds: row.seconds }
  }

  // The clan library: arts written in by anyone of the clan, kept across lives. Returns null without a clan.
  clanLibraryInfo() {
    const s = this._s, clan = this._playerClan()
    if (!clan) return null
    if (!Array.isArray(clan.library)) clan.library = []
    const inLib = new Set(clan.library.map(x => x.artId))
    const shelf = clan.library.filter(x => ARTS[x.artId]).map(x => {
      const lock = s.arts.known[x.artId] ? 'known' : s.stageIndex < ARTS[x.artId].minStage ? 'stage' : this._deskLock(x.artId)
      return { ...x, seconds: this._clanStudySeconds(x.artId), lock }
    })
    const writable = Object.keys(s.arts.known).filter(id => ARTS[id] && !ART_BASICS.includes(id) && !inLib.has(id))
      .map(id => ({ id, cost: CLAN_LIBRARY_WRITE_COST[ARTS[id].rarity] || 0 }))
      .sort((x, y) => y.cost - x.cost || ARTS[x.id].name.localeCompare(ARTS[y.id].name))
    return { clan, shelf, writable, stones: s.spiritStones }
  }
  _clanStudySeconds(artId) { return Math.max(1, Math.round(this.artStudySeconds(artId) * CLAN_LIBRARY_STUDY_FRAC)) }
  // Your choice: write an art you know into the clan library (Spirit Stones by grade). Every later life of the clan can study it.
  writeClanArt(artId) {
    const s = this._s, info = this.clanLibraryInfo()
    if (!info) return { ok: false, reason: 'no_clan' }
    const row = info.writable.find(x => x.id === artId)
    if (!row) return { ok: false, reason: info.clan.library.some(x => x.artId === artId) ? 'already' : 'unknown' }
    if (s.spiritStones < row.cost) return { ok: false, reason: 'stones' }
    s.spiritStones -= row.cost
    const yr = Math.floor(s.world.year)
    info.clan.library.push({ artId, by: s.name, gen: s.generation || 1, year: yr })
    info.clan.history.push({ year: yr, text: `Year ${yr}: ${s.name} writes ${ARTS[artId].name} into the clan library.` })
    this.addEvent({ text: `You write ${ARTS[artId].name} into the ${info.clan.name || 'clan'} library. Those who come after you can study it.`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, cost: row.cost }
  }
  // Your choice: study an art from the clan library (no manual; CLAN_LIBRARY_STUDY_FRAC of the time; only arts you don't know).
  studyFromClan(artId) {
    const info = this.clanLibraryInfo()
    if (!info) return { ok: false, reason: 'no_clan' }
    const row = info.shelf.find(x => x.artId === artId)
    if (!row) return { ok: false, reason: 'not_in_library' }
    if (row.lock) return { ok: false, reason: row.lock }
    this._startDesk(artId, row.seconds, 'clan')
    this.addEvent({ text: `You take ${ARTS[artId].name} down from the clan library, in ${row.by}'s hand. (${fmtTime(row.seconds)})`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, seconds: row.seconds }
  }

  // What Path → Arts shows. Passives beyond your realm's slots stay in the loadout but are inactive (shown locked).
  artsInfo() {
    const s = this._s, a = s.arts
    return { known: a.known, loadout: a.loadout, loadouts: a.loadouts, activeLoadout: a.activeLoadout, passiveSlots: this.passiveSlots(), studies: a.studies, studySlots: this.studySlots(),
      nextStudySlot: ART_STUDY_SLOTS.find(x => x.stage > s.stageIndex) || null, offers: a.offers,
      found: Object.keys(a.found).length, total: ARTS_LIST.length, elements: this.rootElements(),
      nextSlot: ART_PASSIVE_SLOTS.find(x => x.stage > s.stageIndex) || null }
  }

  // Task 1.11 (backpack.md → "Selling"): Spirit Stones one unit sells for. Materials: ITEM_SELL_VALUE; crafted items:
  // SELL_CRAFTED_FRACTION of their recipe's ingredients (craft → sell never mints stones); otherwise a category default.
  // 0 = cannot be sold (currency).
  itemValue(itemId, _depth = 0) {
    const item = ITEMS[itemId]
    if (!item || item.type === 'currency') return 0
    if (ITEM_SELL_VALUE[itemId] != null) return ITEM_SELL_VALUE[itemId]
    if (item.type === 'manual') return ART_RARITY[ARTS[item.art]?.rarity]?.sellValue || 1   // Phase 42: by grade
    const r = _depth < 4 && RECIPES.find(x => x.productId === itemId)
    if (r) return Math.max(1, Math.floor(SELL_CRAFTED_FRACTION * r.ingredients.reduce((a, i) => a + i.qty * this.itemValue(i.itemId, _depth + 1), 0)))
    return SELL_DEFAULT_VALUE[item.category] || 1
  }

  // Sell n unequipped copies for itemValue × n Spirit Stones. Equipped gear is not in `inventory`, so it can't be sold
  // until unequipped (same rule as discardItem).
  sellItem(itemId, n = 1) {
    const s = this._s
    const item = ITEMS[itemId]
    if (!item) return { ok: false, reason: 'unknown' }
    const each = this.itemValue(itemId)
    if (!each) return { ok: false, reason: 'unsellable' }
    if (!(Number.isInteger(n) && n > 0)) return { ok: false, reason: 'invalid_qty' }
    const have = s.inventory[itemId] || 0
    if (!have && (s.equipped?.weapon === itemId || s.equipped?.artifact === itemId)) return { ok: false, reason: 'equipped' }
    if (have < n) return { ok: false, reason: 'not_owned' }
    s.inventory[itemId] -= n
    if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    if (s.activePill === itemId && !s.inventory[itemId]) s.activePill = null
    const stones = each * n
    s.spiritStones += stones
    this.addEvent({ text: `Sold ${n}× ${item.name} for ${stones} Spirit Stone${stones === 1 ? '' : 's'}.`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, stones, each }
  }

  // ── Phase 3: Spiritual Beasts ─────────────────────────────────────────────

  // One wild beast sighting (an expedition roll, or a hunt that found its quarry — A6-2): traits, rare colour, a returning
  // grateful/vengeful mood, the log line. The random draws are in the same order as the pre-A6-2 inline code (sim seeds).
  _spawnBeastEncounter(beastType, hunt = null) {
    const s = this._s
    // traits: each roll draws from the type's favored traits with the tier's chance, else from the whole pool
    const traitKeys = Object.keys(typeof BEAST_TRAITS !== 'undefined' ? BEAST_TRAITS : {})
    const tier = (typeof BEAST_TIERS !== 'undefined' && BEAST_TIERS[beastType.tier]) || { favored: 0 }
    const fav = (beastType.favoredTraits || []).filter(t => traitKeys.includes(t))
    const traits = []
    for (let guard = 0; traits.length < 3 && traitKeys.length >= 3 && guard < 50; guard++) {
      const favLeft = fav.filter(t => !traits.includes(t))
      const pool = favLeft.length && Math.random() < tier.favored ? favLeft : traitKeys
      const t = pool[Math.floor(Math.random() * pool.length)]
      if (!traits.includes(t)) traits.push(t)
    }
    const V = (beastType.variants || [])[0]
    const variant = V && Math.random() < (typeof BEAST_VARIANT_CHANCE !== 'undefined' ? BEAST_VARIANT_CHANCE : 0) ? V.id : null
    // Phase 35: a beast you spared (or drove off) comes back on its kind's next sighting, grateful or vengeful
    const back = s.bestiary?.[beastType.id]?.returning || null
    if (back) s.bestiary[beastType.id].returning = null
    s.beastEncounters = s.beastEncounters || []
    const enc = {
      id: `${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      typeId: beastType.id,
      ...(variant ? { variant } : {}),
      traits,
      ...(back ? { mood: back } : {}),
      ...(hunt ? { hunted: hunt.id } : {}),
      seenAt: Date.now(),
    }
    s.beastEncounters.push(enc)
    this._seeBeast(enc)
    const seenName = variant ? V.name : beastType.name
    this.addEvent({
      text: back === 'grateful' ? `The ${beastType.name} you spared has found you again. It follows at a distance and asks for nothing. (Roam → Beasts: it would come without a talisman.)`
        : back === 'vengeful' ? `The ${beastType.name} you let go has come back bigger, and it has not forgotten you. It waits in Roam → Beasts.`
        : beastType.tier === 'legendary'
        ? `The sky darkens. A ${seenName} watches you from the clouds, a legendary beast few cultivators ever see. It waits in Roam → Beasts, for now.`
        : `A wild ${seenName}${variant ? ' (a rare colour)' : ''} was ${hunt ? 'found in ' + hunt.name : 'spotted during the expedition'}! Tame it or fight it in Roam → Beasts.`,
      type: 'special',
    })
    this._emit('beast_sighted', { name: seenName, tier: beastType.tier, variant: !!variant })
    return enc
  }

  // ── Phase 35 (A6-2, combat.md → "the Hunt"): go looking for a beast on a hunting ground ──
  _huntLock(g) {
    const s = this._s
    // a finished hunt ends once its beast is dealt with (tamed, fought to the end, or gone)
    if (s.hunt?.found && !(s.beastEncounters || []).some(e => e.id === s.hunt.found)) s.hunt = null
    if (!g) return 'unknown'
    if (s.stageIndex < g.minStage) return 'stage'
    if (s.hunt) return 'busy'
    if ((s.beastEncounters || []).length >= 3) return 'crowded'
    if ((s.spiritStones || 0) < (g.cost || 0)) return 'stones'
    return null
  }

  // The beasts a ground can yield for you right now (minStage ≤ yours), with their share of the draw.
  _huntTable(g) {
    const s = this._s
    const rows = Object.entries(g.types).map(([id, mult]) => ({ type: BEAST_TYPES.find(b => b.id === id), mult }))
      .filter(r => r.type)
    const open = rows.filter(r => r.type.minStage <= s.stageIndex)
    const W = open.reduce((a, r) => a + r.type.encounterChance * r.mult, 0)
    return rows.map(r => ({ id: r.type.id, name: r.type.name, tier: r.type.tier, minStage: r.type.minStage,
      open: r.type.minStage <= s.stageIndex, chance: r.type.minStage <= s.stageIndex && W > 0 ? r.type.encounterChance * r.mult / W : 0,
      seen: !!s.bestiary?.[r.type.id]?.seen }))
  }

  huntInfo() {
    const s = this._s, order = BEAST_TIER_ORDER
    this._huntLock(HUNT_GROUNDS[0])                              // (clears a finished hunt whose beast is gone)
    const grounds = HUNT_GROUNDS.map(g => {
      const table = this._huntTable(g)
      const danger = table.reduce((best, r) => order.indexOf(r.tier) > order.indexOf(best) ? r.tier : best, 'common')
      return { ...g, table, danger, lock: this._huntLock(g) }
    })
    const h = s.hunt
    const cur = h ? { ...h, ground: HUNT_GROUNDS.find(g => g.id === h.groundId), left: Math.max(0, Math.ceil((h.endsAt - Date.now()) / 1000)),
      foundEnc: h.found ? (s.beastEncounters || []).find(e => e.id === h.found) || null : null } : null
    return { grounds, hunt: cur }
  }

  startHunt(groundId) {
    const s = this._s, g = HUNT_GROUNDS.find(x => x.id === groundId)
    const lock = this._huntLock(g)
    if (lock) return { ok: false, reason: lock }
    s.spiritStones -= g.cost || 0
    s.hunt = { groundId, startedAt: Date.now(), endsAt: Date.now() + g.trackSeconds * 1000, found: null }
    this.addEvent({ text: `You set out into ${g.name} to track a beast.`, type: 'neutral' })
    this._notify()
    return { ok: true }
  }

  // Calls off a search, or clears a finished one once you have seen what it found. The cost is not refunded.
  cancelHunt() {
    const s = this._s
    if (!s.hunt) return { ok: false, reason: 'no_hunt' }
    const found = !!s.hunt.found
    s.hunt = null
    if (!found) this.addEvent({ text: 'You call off the hunt and come home empty-handed.', type: 'neutral' })
    this._notify()
    return { ok: true }
  }

  _resolveHunt() {
    const s = this._s, g = HUNT_GROUNDS.find(x => x.id === s.hunt.groundId)
    const table = g ? this._huntTable(g).filter(r => r.open) : []
    if (!table.length || (s.beastEncounters || []).length >= 3) {
      this.addEvent({ text: `The trail in ${g?.name || 'the wilds'} goes cold. You come home with nothing.`, type: 'neutral' })
      s.hunt = null
      return
    }
    let r = Math.random()
    let pick = table[table.length - 1]
    for (const row of table) { r -= row.chance; if (r <= 0) { pick = row; break } }
    const enc = this._spawnBeastEncounter(BEAST_TYPES.find(b => b.id === pick.id), g)
    s.hunt.found = enc.id
    this._notify()
  }

  // What a beast (encounter or companion record) is: its type, tier, variant, display name, art key and Might
  // (the multiplier on what its traits do: tier × type override × variant). DOM-free; the UI reads it too.
  beastProfile(rec) {
    const type = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : []).find(b => b.id === rec?.typeId) || null
    const tiers = typeof BEAST_TIERS !== 'undefined' ? BEAST_TIERS : {}
    const tier = tiers[type?.tier] || tiers.common || { id: 'common', name: 'Common', might: 1 }
    const variant = rec?.variant ? (type?.variants || []).find(v => v.id === rec.variant) || null : null
    const might = (type?.might ?? tier.might) * (variant ? (typeof BEAST_VARIANT_MIGHT !== 'undefined' ? BEAST_VARIANT_MIGHT : 1) : 1)
    return { type, tier, variant, might: Math.round(might * 100) / 100,
      name: variant ? variant.name : (type?.name || rec?.typeId || 'Beast'),
      art: variant?.art || type?.spriteState || rec?.typeId, lore: variant?.lore || type?.lore || type?.desc || '' }
  }

  // How many talismans the player holds of each grade (Phase 41). DOM-free; the UI reads it too.
  talismanCounts() {
    const inv = this._s.inventory || {}, out = {}
    for (const g of TALISMAN_GRADE_ORDER) out[g] = inv[TALISMAN_GRADES[g].itemId] || 0
    return out
  }

  // The strongest grade the player holds at least one of (else null). The default a tame attempt uses.
  _bestTalismanGrade() {
    const c = this.talismanCounts()
    for (let i = TALISMAN_GRADE_ORDER.length - 1; i >= 0; i--) if (c[TALISMAN_GRADE_ORDER[i]] > 0) return TALISMAN_GRADE_ORDER[i]
    return null
  }

  // A failed direct tame turns into a fight or a clean escape: the chance of the fight, by the beast's nature + mood.
  _tameFightChance(nature, mood) {
    const base = typeof TAME_FIGHT_CHANCE_BASE !== 'undefined' ? TAME_FIGHT_CHANCE_BASE : 0.5
    const mult = (typeof TAME_NATURE_FIGHT_MULT !== 'undefined' && TAME_NATURE_FIGHT_MULT[nature]) || 1
    const mod = (typeof TAME_MOOD_FIGHT_MOD !== 'undefined' && TAME_MOOD_FIGHT_MOD[mood]) || 0
    return Math.max(TAME_FIGHT_CHANCE_MIN, Math.min(TAME_FIGHT_CHANCE_MAX, base * mult + mod))
  }

  // Read helper for the UI + tests: what a tame attempt on this encounter would offer (grades, chance, locks).
  tameInfo(encId) {
    const s = this._s
    const enc = (s.beastEncounters || []).find(e => e.id === encId)
    if (!enc) return null
    const beastType = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : []).find(b => b.id === enc.typeId)
    const prof = this.beastProfile(enc)
    const nature = (typeof BEAST_NATURE !== 'undefined' && BEAST_NATURE[enc.typeId]) || 'wild'
    const free = enc.mood === 'grateful'
    const counts = this.talismanCounts()
    const grades = TALISMAN_GRADE_ORDER.map(g => ({ id: g, name: TALISMAN_GRADES[g].name, chance: TALISMAN_GRADES[g].tameChance, count: counts[g] }))
    const best = this._bestTalismanGrade()
    let canTame = true, why = null
    if (s.family?.fight?.beast?.encId === encId) { canTame = false; why = 'fighting' }
    else if ((s.beasts || []).length >= (s.derived?.maxBeasts || 3)) { canTame = false; why = 'max_beasts' }
    else if (beastType && s.stageIndex < (beastType.minStage || 0)) { canTame = false; why = 'stage' }
    else if (!free && !best) { canTame = false; why = 'no_talisman' }
    return { encId, name: prof.name, prof, nature, mood: enc.mood || null, free, canTame, why,
      fightChance: this._tameFightChance(nature, enc.mood || null), grades, best, chance: free ? 1 : (best ? TALISMAN_GRADES[best].tameChance : null) }
  }

  // Phase 41: a graded talisman sets the chance; a failed direct attempt turns the beast hostile (a fight) or
  // lets it escape. gradeId is optional — the best grade held is used when it is omitted or not held.
  tameEncounteredBeast(encounterId, gradeId) {
    const s = this._s
    const enc = (s.beastEncounters || []).find(e => e.id === encounterId)
    if (!enc) return { ok: false, reason: 'not_found' }

    const beastType = (typeof BEAST_TYPES !== 'undefined' ? BEAST_TYPES : []).find(b => b.id === enc.typeId)
    if (!beastType) return { ok: false, reason: 'unknown_type' }
    if (s.stageIndex < beastType.minStage) return { ok: false, reason: 'stage' }
    if (s.family?.fight?.beast?.encId === encounterId) return { ok: false, reason: 'fighting' }   // Phase 35
    if ((s.beasts || []).length >= (s.derived?.maxBeasts || 3)) return { ok: false, reason: 'max_beasts' }

    const free = enc.mood === 'grateful'                          // Phase 35: a spared beast that came back
    let grade = null
    if (!free) {
      const counts = this.talismanCounts()
      grade = (gradeId && TALISMAN_GRADES[gradeId] && counts[gradeId] > 0) ? gradeId : this._bestTalismanGrade()
      if (!grade) return { ok: false, reason: 'no_talisman' }
      const itemId = TALISMAN_GRADES[grade].itemId
      s.inventory[itemId]--
      if (s.inventory[itemId] <= 0) delete s.inventory[itemId]
    }

    const chance = free ? 1 : TALISMAN_GRADES[grade].tameChance
    const nature = (typeof BEAST_NATURE !== 'undefined' && BEAST_NATURE[enc.typeId]) || 'wild'
    this._seeBeast(enc)
    const name = this.beastProfile(enc).name

    if (!free && Math.random() >= chance) {
      // The charm fails. A fell beast rounds on you; a gentle one bolts — never force a lethal fight on the wounded.
      const turns = Math.random() < this._tameFightChance(nature, enc.mood || null)
      if (turns && !this._beastFightLock(enc)) {
        this.startBeastFight(encounterId, 'slay')
        this.addEvent({ text: `The ${name} will not be charmed. It rounds on you.`, type: 'negative' })
        this._recalc(); this._notify()
        this._emit('tame_failed', { beast: name, outcome: 'fight' })
        return { ok: false, reason: 'tame_failed', outcome: 'fight', grade, chance }
      }
      s.beastEncounters = s.beastEncounters.filter(e => e.id !== encounterId)
      this.addEvent({ text: `The ${name} slips the charm and is gone into the wild.`, type: 'neutral' })
      this._recalc(); this._notify()
      this._emit('tame_failed', { beast: name, outcome: 'flee' })
      return { ok: false, reason: 'tame_failed', outcome: 'flee', grade, chance }
    }

    s.beastEncounters = s.beastEncounters.filter(e => e.id !== encounterId)

    const beast = {
      id:         enc.id,
      typeId:     enc.typeId,
      ...(enc.variant ? { variant: enc.variant } : {}),
      name:       this.beastProfile(enc).name,
      level:      1,
      xp:         0,
      traits:     enc.traits,
      expedition: null,
    }
    s.beasts = s.beasts || []
    s.beasts.push(beast)

    this._claimFirst('first_beast')
    this._recalc(); this._notify()
    this._emit('beast_tamed', { name: beast.name })
    return { ok: true, beast, grade, chance }
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
    beast.lastExpLocId = locationId
    this._notify()
    return { ok: true, loc }
  }

  // Auto-Expedition (per beast, from Lv.BEAST_AUTO_EXPEDITION_LEVEL): where it goes next — its picked location, or
  // its last trip. Read at launch time, so changing the pick while it is out takes effect when it comes home.
  beastAutoUnlocked(beast) { return !!beast && beast.level >= BEAST_AUTO_EXPEDITION_LEVEL }
  beastAutoTarget(beast) {
    const id = beast?.autoExpLocId || beast?.lastExpLocId
    return id ? LOCATIONS.find(l => l.id === id) || null : null
  }
  setBeastAuto(beastId, on) {
    const beast = (this._s.beasts || []).find(b => b.id === beastId)
    if (!beast) return { ok: false, reason: 'not_found' }
    if (on && !this.beastAutoUnlocked(beast)) return { ok: false, reason: 'locked' }
    beast.autoExp = !!on
    if (on) this._maybeAutoBeast(beast)          // at home already: sets out now
    this._save(); this._notify()
    return { ok: true }
  }
  setBeastAutoLocation(beastId, locationId) {
    const s = this._s
    const beast = (s.beasts || []).find(b => b.id === beastId)
    if (!beast) return { ok: false, reason: 'not_found' }
    if (locationId != null) {
      const loc = LOCATIONS.find(l => l.id === locationId)
      if (!loc) return { ok: false, reason: 'unknown_location' }
      if (s.stageIndex < loc.minStage) return { ok: false, reason: 'stage' }
    }
    beast.autoExpLocId = locationId ?? null
    if (beast.autoExp) this._maybeAutoBeast(beast)
    this._save(); this._notify()
    return { ok: true }
  }
  _maybeAutoBeast(beast) {
    const s = this._s
    if (s.playMode !== 'idle' || !beast?.autoExp || beast.expedition || !this.beastAutoUnlocked(beast)) return
    const loc = this.beastAutoTarget(beast)
    if (!loc || s.stageIndex < loc.minStage) return
    const res = this.sendBeastExpedition(beast.id, loc.id)
    if (res.ok) {
      this.addEvent({ text: `[Auto] ${beast.name} sets out for ${loc.name}.`, type: 'neutral' })
      this._emit('auto_fire', { system: 'beast_expedition' })
    }
  }

  resolveBeastExpedition(beastId) {
    const s = this._s
    const beast = (s.beasts || []).find(b => b.id === beastId)
    if (!beast?.expedition || beast.expedition.war) return   // war-lent beasts come home when the war resolves (Phase 5C)

    const loc = LOCATIONS.find(l => l.id === beast.expedition.locationId)
    if (!loc) { beast.expedition = null; this._notify(); return }

    const hasNose   = beast.traits.includes('spirit_nose')
    const lootMult  = (hasNose ? 1.25 : 1) * (1 + (this.beastProfile(beast).might - 1) * 0.5)   // mightier beasts bring more home
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
    this._maybeAutoBeast(beast)
    this._recalc(); this._notify()
  }

  _addBeastXp(beast, xp) {
    beast.xp += xp
    while (beast.xp >= 100 && beast.level < 10) {
      beast.xp   -= 100
      beast.level++
      this.addEvent({ text: `${beast.name} reached level ${beast.level}!`, type: 'positive' })
      if (beast.level === BEAST_AUTO_EXPEDITION_LEVEL)
        this.addEvent({ text: `${beast.name} knows the roads now: it can go out on its own. Turn on Auto-Expedition on its card in Roam → Beasts.`, type: 'special' })
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
    if (this.sectInAshes(def.id)) return { ok: false, reason: 'ashes' }   // Phase 43f: burned, not yet risen
    if (!this._wsByDef(def.id)) this._wsKeepGates()   // final QA: a gate always leads to a living record
    s.sect = { id: def.id, rank: 0, contribution: 0, activeMissions: [] }
    s.sectWar = this._blankSectWar('member')   // first call to arms is scheduled on the next tick
    this.addEvent({ text: `You joined the ${def.name} (${def.nameCN}) as an Outer Disciple.`, type: 'special' })
    this._claimFirst('joined_sect')
    this._wsDeed(this._wsByDef(def.id), WORLD_SECTS.stanceJoin, 'took you in as a disciple')   // Phase 43b
    this._sectMaster()   // Phase 43e: the master who sits above you
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
    const gave = (s.sect.shelf || []).length
    if (gave) this.addEvent({ text: `The ${gave === 1 ? 'manual' : `${gave} manuals`} you gave stay${gave === 1 ? 's' : ''} on the ${def.name}'s shelves.`, type: 'neutral' })
    this._wsDeed(this._wsByDef(def.id), deserter ? WORLD_SECTS.stanceDesert : WORLD_SECTS.stanceLeave, deserter ? 'you deserted them on the eve of war' : 'you left them')   // Phase 43b
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
    this._wsDeed(this._wsMine(), SECT_MASTER.regardRankUp)   // 43e
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
  // With missions picked (automation.autoSectMissionIds) it fills free slots with those instead — read when a slot
  // frees, so changing the picks mid-mission swaps what runs next without cancelling what is underway.
  _maybeAutoSectMission(missionId) {
    const s = this._s
    if (s.playMode !== 'idle' || !s.automation.autoSectMissions) return
    if (!s.sect.id || !this.automationUnlocked('autoSectMissions')) return
    if (s.automation.autoSectMissionIds.length) { this._fillAutoSectMissions(); return }
    if (s.sect.activeMissions.length >= SECT_MAX_MISSIONS) return
    const m = SECT_MISSIONS.find(x => x.id === missionId)
    if (!m || s.sect.rank < m.minRank) return
    const res = this.startSectMission(missionId)
    if (res.ok) {
      this.addEvent({ text: `[Auto] ${m.name} re-queued.`, type: 'neutral' })
      this._emit('auto_fire', { system: 'sect_mission' })
    }
  }

  _fillAutoSectMissions() {
    const s = this._s
    for (const id of s.automation.autoSectMissionIds) {
      if (s.sect.activeMissions.length >= SECT_MAX_MISSIONS) return
      const m = SECT_MISSIONS.find(x => x.id === id)
      if (!m || s.sect.rank < m.minRank || s.sect.activeMissions.some(a => a.missionId === id)) continue
      if (this.startSectMission(id).ok) {
        this.addEvent({ text: `[Auto] ${m.name} taken up.`, type: 'neutral' })
        this._emit('auto_fire', { system: 'sect_mission' })
      }
    }
  }

  // Pick / unpick a mission for Auto-Missions to keep running (at most SECT_MAX_MISSIONS; [] = repeat what finished).
  setAutoSectMission(missionId, on) {
    const s = this._s
    if (!s) return { ok: false, reason: 'no_state' }
    const m = SECT_MISSIONS.find(x => x.id === missionId)
    if (!m) return { ok: false, reason: 'unknown' }
    const ids = s.automation.autoSectMissionIds
    if (on) {
      if (ids.includes(missionId)) return { ok: true }
      if (s.sect.id && s.sect.rank < m.minRank) return { ok: false, reason: 'rank' }
      if (ids.length >= SECT_MAX_MISSIONS) return { ok: false, reason: 'full' }
      ids.push(missionId)
    } else {
      s.automation.autoSectMissionIds = ids.filter(id => id !== missionId)
    }
    if (s.playMode === 'idle' && s.automation.autoSectMissions && s.sect.id && this.automationUnlocked('autoSectMissions')) this._fillAutoSectMissions()
    this._save(); this._notify()
    return { ok: true }
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
    this._wsDeed(this._wsMine(), SECT_MASTER.regardMission)   // 43e: service warms the master's regard (no deed line)
    parts.push(`${contrib} Contribution`)

    if (m.beastXp > 0) {
      const idle = (s.beasts || []).filter(b => !b.expedition)
      for (const b of idle) this._addBeastXp(b, m.beastXp)
      if (idle.length) parts.push(`${m.beastXp} Beast XP each`)
    }

    this.addEvent({ text: `Mission complete — ${m.name}: ${parts.join(', ')}.`, type: 'positive' })
    this._roadRoll('mission', null, m.name)   // Phase 28 4.9: one of your sect's people, met on the mission
    this._maybeAutoSectMission(active.missionId)
    this._recalc(); this._notify()
  }

  // ── Phase 5A: Own Sect ────────────────────────────────────────────────────

  _genRecruit(exclude = [], cast = false) {   // cast: only the gate's recruit pool draws real people
    // 4.5: known-first — an unsworn youth of the world (a wave's child, a classmate without a sect); stars from their root
    const known = cast && this._s.world?.persons ? this._castKnown('recruit', { stage: [0, 9], age: NPC_CAST.recruitAge, exclude }) : null
    if (known) {
      const t = known.root?.type, talent = t === 'heavenly' ? 5 : t === 'pure' ? 4 : t === 'dual' ? 3 : (known.talent || 1) >= 1 ? 2 : 1
      return { id: `d${Date.now()}_${Math.floor(Math.random() * 99999)}`, pid: known.id, name: Persons.fullName(known), talent }
    }
    if (cast && this._s.world?.persons) this._castFresh()
    const w = RECRUIT_TALENT_WEIGHTS
    let r = Math.random() * w.reduce((a, b) => a + b, 0), talent = 1
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { talent = i + 1; break } }
    const pick = a => a[Math.floor(Math.random() * a.length)]
    return { id: `d${Date.now()}_${Math.floor(Math.random() * 99999)}`, name: `${pick(DISCIPLE_SURNAMES)} ${pick(DISCIPLE_GIVEN)}`, talent }
  }

  _refreshRecruitPool() {
    const o = this._s.ownSect
    o.recruitPool = []
    for (let i = 0; i < RECRUIT_POOL_SIZE; i++) o.recruitPool.push(this._genRecruit(o.recruitPool.map(c => c.pid), true))
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
    if (o.buildings[id] > 0) return { ok: false, reason: 'built' }
    if (s.spiritStones < b.stones) return { ok: false, reason: 'stones' }
    for (const [iid, q] of Object.entries(b.items)) {
      if ((s.inventory[iid] || 0) < q) return { ok: false, reason: 'items' }
    }
    s.spiritStones -= b.stones
    for (const [iid, q] of Object.entries(b.items)) {
      s.inventory[iid] -= q
      if (s.inventory[iid] <= 0) delete s.inventory[iid]
    }
    o.buildings[id] = 1                                            // Phase 43: level 1 (upgradeSectBuilding deepens it)
    this.addEvent({ text: `${b.name} (${b.nameCN}) completed in ${o.name}.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, building: b }
  }

  // Phase 43: deepen a hall you already raised. Effects scale with the level; every level costs more than the last.
  // Returns null cost when the building is unbuilt or already at SECT_BUILDING_MAX_LEVEL.
  sectBuildingUpgradeCost(id) { return sectBuildingUpgradeCost(id, this._s.ownSect?.buildings?.[id] || 0) }

  upgradeSectBuilding(id) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const b = SECT_BUILDINGS.find(x => x.id === id)
    if (!b)                  return { ok: false, reason: 'unknown' }
    const level = o.buildings[id] || 0
    if (level <= 0)          return { ok: false, reason: 'not_built' }
    if (level >= SECT_BUILDING_MAX_LEVEL) return { ok: false, reason: 'max_level' }
    const cost = sectBuildingUpgradeCost(id, level)
    if (s.spiritStones < cost) return { ok: false, reason: 'stones' }
    s.spiritStones -= cost
    o.buildings[id] = level + 1
    this.addEvent({ text: `The ${b.name} (${b.nameCN}) deepens to level ${level + 1} in ${o.name}.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, level: level + 1 }
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
    // Phase 45: the Hall's cap seats YOUR OWN hall only — branch members live in their branch's seats.
    if (this._mainRoster().length >= (s.derived?.discipleCap || 0)) return { ok: false, reason: 'full' }
    const cost = DISCIPLE_RECRUIT_COST * c.talent * c.talent
    if (s.spiritStones < cost) return { ok: false, reason: 'stones' }
    s.spiritStones -= cost
    o.recruitPool = o.recruitPool.filter(x => x.id !== candidateId)
    const disciple = { id: c.id, ...(c.pid ? { pid: c.pid } : {}), name: c.name, talent: c.talent, level: 1, xp: 0,   // 4.5: a cast recruit IS that person
                       branchId: null, role: 'disciple', kin: false, personality: disciplePersonality(c.id) }
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
    const n = s.ownSect.name, gate = s.ownSect.takenOver?.defId
    s.ownSect = this._blankOwnSect()
    s.sectWar = this._blankSectWar()
    s.karma   = Math.max(0, s.karma - 10)
    this.addEvent({ text: `You disbanded the ${n}. Its halls fall silent.`, type: 'negative' })
    // final QA: a sect you took over is older than you — its gate opens again without you
    if (gate && s.world?.sects && this._wsKeepGates().some(r => r.defId === gate)) this.addEvent({ text: `The ${n} was here before you, and outlasts you: its gate opens again under a new master.`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  // ── Phase 45: Sect branches (分舵) — sub-leaders, rivalry, the Tournament of Branches ──────────────────────
  // See docs/systems/sect-branches.md. Appointing a head is free and ungated (user 2026-10-02); a branch's members
  // live in the branch's own seats, so branches are how a sect grows past its Hall. Loyalty never decays on its own
  // — only a direct wrong (dissolve · promote/poach · being overlooked) can sour a head.

  _mainRoster()      { return (this._s.ownSect?.disciples || []).filter(d => !d.branchId) }
  _branchById(id)    { return this._s.ownSect.branches.find(b => b.id === id) || null }
  _branchHead(b)     { return this._s.ownSect.disciples.find(d => d.id === b.headId) || null }
  _branchMembers(b)  { return this._s.ownSect.disciples.filter(d => d.branchId === b.id && d.id !== b.headId) }
  _branchTourneyCost() { const S = SECT_BRANCH.tourney; return Math.round(S.baseCost + S.costPerStage * this._s.stageIndex) }

  // A disciple's output multiplier: 1 in your own hall, the branch's yield × loyalty inside a branch.
  _discipleYieldMult(d) {
    if (!d?.branchId) return 1
    const b = this._branchById(d.branchId)
    return b ? branchYieldMult(b) : 1
  }

  // Move a head's loyalty by `delta` (negative = a wrong); a drop to secedeAt makes them take the branch and go.
  _adjustLoyalty(b, delta, why) {
    if (!b) return false
    b.loyalty = Math.max(0, Math.min(100, (b.loyalty ?? SECT_BRANCH.loyaltyStart) + delta))
    if (delta < 0) b.wrongedYear = Math.floor(this._s.world?.year || 0)
    if (b.loyalty <= SECT_BRANCH.secedeAt) return this._branchSecede(b, why)
    return false
  }
  _wrongHead(b, amount, why) { return this._adjustLoyalty(b, -amount, why) }

  // The head takes the branch and leaves: a rival born from your own house (a real NPC sect record lands in 43b).
  _branchSecede(b, why) {
    const o = this._s.ownSect
    const head = this._branchHead(b)
    const members = this._branchMembers(b)
    o.disciples = o.disciples.filter(d => d.branchId !== b.id)
    o.branches  = o.branches.filter(x => x.id !== b.id)
    for (const x of o.branches) if (x.rivalId === b.id) x.rivalId = null
    if (head) {
      const rec = this._wsSplinter(head, members.length, why)   // Phase 43b: the branch becomes a real sect
      // Phase 28 (4.2): the members who walked out are its people now.
      if (rec) for (const m of members) {
        const p = this._disciplePerson(m)
        if (p && p.id !== rec.leaderId) { p.sectId = rec.id; p.sectRole = 'disciple'; p.owner = 'world' }
      }
      this._noteEnemy({ kind: 'sect', name: rec ? `the ${rec.name}` : `the ${head.name} faction`, why: 'left your sect in anger' })
      this.addEvent({ text: `${head.name} took ${members.length ? `${members.length} disciple${members.length === 1 ? '' : 's'}` : 'their followers'} and left ${o.name}. "${why}"${rec ? ` They raise the ${rec.name} against you.` : ''}`, type: 'negative' })
    }
    this._s.karma = Math.max(0, this._s.karma - 3)
    return head
  }

  // A brand-new branch, led by `head`. Free — no gate (the user's pick).
  _makeBranch(head) {
    const o = this._s.ownSect, yr = Math.floor(this._s.world?.year || 0)
    const branch = { id: `bk${o.branchSeq++}`, name: `${String(head.name || 'A').split(' ')[0]} Branch`, headId: head.id,
                     since: yr, lastRecruitYear: yr, wins: 0, losses: 0, loyalty: SECT_BRANCH.loyaltyStart,
                     wrongedYear: 0, rivalId: null, heat: 0, tourneyWins: 0 }
    o.branches.push(branch)
    head.role = 'head'; head.branchId = branch.id
    const others = o.branches.filter(x => x.id !== branch.id && !x.rivalId)
    if (others.length) { const r = others[Math.floor(Math.random() * others.length)]; branch.rivalId = r.id; r.rivalId = branch.id }
    return branch
  }

  appointBranchHead(discipleId) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const d = o.disciples.find(x => x.id === discipleId)
    if (!d) return { ok: false, reason: 'not_found' }
    if (o.branches.some(b => b.headId === discipleId)) return { ok: false, reason: 'already_head' }
    if (o.branches.length >= SECT_BRANCH.maxBranches) return { ok: false, reason: 'max_branches' }
    const old = d.branchId ? this._branchById(d.branchId) : null      // calling them out of a branch is a poach
    if (old) this._wrongHead(old, SECT_BRANCH.wrong.poach, `${d.name} was called away from their branch`)
    const branch = this._makeBranch(d)
    this.addEvent({ text: `${d.name} is raised to Branch Head of the ${branch.name}. They will gather disciples of their own.`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, branch }
  }

  // Dissolve a branch. The head is stripped of it (a direct wrong); if that breaks them they take the branch and
  // leave. Otherwise the head + members return to your own hall while seats allow, and the rest slip away.
  dismissBranch(branchId) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const b = this._branchById(branchId)
    if (!b) return { ok: false, reason: 'not_found' }
    const head = this._branchHead(b), members = this._branchMembers(b)
    if (this._wrongHead(b, SECT_BRANCH.wrong.dissolve, 'You dissolved their branch')) { this._recalc(); this._notify(); return { ok: true, seceded: true } }
    o.branches = o.branches.filter(x => x.id !== b.id)
    for (const x of o.branches) if (x.rivalId === b.id) x.rivalId = null
    const cap = s.derived?.discipleCap || 0
    let kept = 0, left = 0
    for (const d of [head, ...members].filter(Boolean)) {
      if (this._mainRoster().length < cap) { d.branchId = null; d.role = 'disciple'; kept++ }
      else { o.disciples = o.disciples.filter(x => x.id !== d.id); left++ }
    }
    this.addEvent({ text: `You dissolved the ${b.name}: ${kept} return to your hall${left ? `, and ${left} slip away` : ''}.`, type: 'negative' })
    this._recalc(); this._notify()
    return { ok: true, kept, left }
  }

  // Bring a branch member up into your own hall (needs a seat). A direct wrong to the head they leave behind.
  promoteBranchMember(discipleId) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const d = o.disciples.find(x => x.id === discipleId)
    if (!d) return { ok: false, reason: 'not_found' }
    if (!d.branchId) return { ok: false, reason: 'not_in_branch' }
    if (this._mainRoster().length >= (s.derived?.discipleCap || 0)) return { ok: false, reason: 'full' }
    const b = this._branchById(d.branchId), head = b ? this._branchHead(b) : null
    d.branchId = null; d.role = 'disciple'
    const seceded = b ? this._wrongHead(b, SECT_BRANCH.wrong.poach, `${d.name} was brought up into your own hall`) : false
    this.addEvent({ text: `${d.name} is brought up into your own hall${head && !seceded ? `; ${head.name}'s branch feels the loss` : ''}.`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true }
  }

  // The sect leader holds a tournament between the branches and pays the winner's prize (user 2026-10-02).
  holdBranchTournament(rewardKind) {
    const s = this._s, o = s.ownSect, S = SECT_BRANCH.tourney
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    if (o.branches.length < 2) return { ok: false, reason: 'no_branches' }
    if (!['qi', 'art', 'stones'].includes(rewardKind)) return { ok: false, reason: 'bad_reward' }
    const left = (o.tourneyAt || 0) - this._cdNow()
    if (left > 0) return { ok: false, reason: 'cooldown', secsLeft: left }
    const cost = this._branchTourneyCost()
    if (s.spiritStones < cost) return { ok: false, reason: 'stones', cost }
    s.spiritStones -= cost
    const rows = o.branches.map(b => {
      const head = this._branchHead(b), members = this._branchMembers(b)
      const base = (head ? head.talent * head.level * 2 : 0) + members.reduce((a, m) => a + m.talent * m.level, 0)
      return { b, roll: base * (0.75 + Math.random() * 0.5) }
    })
    rows.sort((a, b) => b.roll - a.roll)
    const win = rows[0], winHead = this._branchHead(win.b)
    win.b.wins = (win.b.wins || 0) + 1; win.b.tourneyWins = (win.b.tourneyWins || 0) + 1
    win.b.loyalty = Math.min(100, (win.b.loyalty ?? SECT_BRANCH.loyaltyStart) + S.winLoyalty)
    for (const r of rows.slice(1)) this._adjustLoyalty(r.b, S.loseLoyalty, 'they were overlooked at your tournament')
    let amount = 0, kind = rewardKind
    if (rewardKind === 'qi') { amount = Math.round((s.derived?.qiCap || 0) * S.qiFrac); s.qi = Math.min(s.derived?.qiCap ?? s.qi, s.qi + amount) }
    else if (rewardKind === 'stones') { amount = Math.round((S.stonesBase + S.stonesPerBranch * o.branches.length) * (1 + s.stageIndex * 0.1)); s.spiritStones += amount }
    else { const artId = this._rollArt(ART_DROP_WEIGHTS_BY_TIER[Math.min(6, 1 + Math.floor(s.stageIndex / 4))]); if (artId) { this._grantManual(artId, 'as the prize of your Tournament of Branches'); amount = 1; kind = artId } }
    o.tourneyAt = this._cdNow() + S.cooldownSecs
    o.lastTourney = { year: Math.floor(s.world?.year || 0), winnerId: win.b.id, winnerName: win.b.name, head: winHead?.name || '', rewardKind: kind, amount }
    const prize = kind === 'qi' ? `You grant them a share of your Qi.` : kind === 'stones' ? `You pay out ${amount} Spirit Stones.` : `You give up a manual (${ARTS[kind]?.name || 'an art'}) as the prize.`
    this.addEvent({ text: `The Tournament of Branches: the ${win.b.name}${winHead ? ` under ${winHead.name}` : ''} takes the day. ${prize}`, type: 'special' })
    this._emit('branch_tourney', { winner: win.b.name, reward: kind })
    this._recalc(); this._notify()
    return { ok: true, winner: win.b, reward: { kind, amount } }
  }

  // Take a grown child into the sect — free and instant (no pool, no cost). A child's root sets their talent.
  recruitChild(childId) {
    const s = this._s, o = s.ownSect
    if (!o.founded) return { ok: false, reason: 'no_sect' }
    const c = s.family?.children?.find(x => x.id === childId)
    if (!c) return { ok: false, reason: 'unknown' }
    if (!c.alive || c.estranged) return { ok: false, reason: 'gone' }
    const age = Math.max(0, Math.floor(s.world.year - c.bornYear))
    if (age < AWAKENING_AGE) return { ok: false, reason: 'young', minAge: AWAKENING_AGE }
    if (o.disciples.some(d => d.childId === childId)) return { ok: false, reason: 'joined' }
    if (this._mainRoster().length >= (s.derived?.discipleCap || 0)) return { ok: false, reason: 'full' }
    const talent = Math.max(1, Math.min(5, Math.round((c.root?.mult || 1) * 1.6)))
    const disciple = { id: 'k' + c.id, name: Persons.fullName(c), talent, level: 1, xp: 0,
                       branchId: null, role: 'disciple', kin: true, childId, personality: c.personality || disciplePersonality(c.id) }
    o.disciples.push(disciple)
    this.addEvent({ text: `Your child ${disciple.name} joins ${o.name} as a disciple — blood of your blood.`, type: 'special' })
    this._recalc(); this._notify()
    return { ok: true, disciple }
  }

  childRecruitPreview(childId) {
    const s = this._s, o = s.ownSect
    const c = s.family?.children?.find(x => x.id === childId)
    if (!c) return null
    const age = Math.max(0, Math.floor(s.world.year - c.bornYear))
    const talent = Math.max(1, Math.min(5, Math.round((c.root?.mult || 1) * 1.6)))
    if (!o?.founded) return { ok: false, reason: 'no_sect', minAge: AWAKENING_AGE, talent, kin: true }
    const taken = o.disciples.some(d => d.childId === childId)
    const full = this._mainRoster().length >= (s.derived?.discipleCap || 0)
    const reason = age < AWAKENING_AGE ? 'young' : taken ? 'joined' : full ? 'full' : null
    return { ok: !reason, reason, minAge: AWAKENING_AGE, talent, kin: true }
  }

  // Children who could be taken in now (grown, at home, not already a disciple) — the UI read helper.
  recruitableChildren() {
    const s = this._s, o = s.ownSect
    if (!o?.founded) return []
    const taken = new Set(o.disciples.filter(d => d.childId).map(d => d.childId))
    return (s.family?.children || []).filter(c => c.alive && !c.estranged && !taken.has(c.id) &&
      Math.floor(s.world.year - c.bornYear) >= AWAKENING_AGE)
  }

  // Branch totals + the tournament's state, for the UI (mirrors _recalc/tickOwnSect exactly).
  branchInfo() {
    const s = this._s, o = s.ownSect, d = s.derived || {}
    if (!o?.founded) return null
    const inc = d.ownSectIncomeMult || 1
    const branches = o.branches.map(b => {
      const head = this._branchHead(b), members = this._branchMembers(b)
      const cap = branchCap(head), ym = branchYieldMult(b)
      const of = (t, l) => { const lm = 1 + 0.1 * (l - 1)
        return { qi: DISCIPLE_QI_FRAC * t * lm * ym, stonesMin: DISCIPLE_STONE_RATE * t * lm * inc * 60 * ym, herbsMin: DISCIPLE_HERB_RATE * t * lm * inc * 60 * ym } }
      let qi = 0, stonesMin = 0, herbsMin = 0, strength = 0
      for (const m of [...(head ? [head] : []), ...members]) { const y = of(m.talent, m.level); qi += y.qi; stonesMin += y.stonesMin; herbsMin += y.herbsMin; strength += m.talent * m.level }
      const rival = b.rivalId ? o.branches.find(x => x.id === b.rivalId) : null
      return { b, head, members, cap, seats: Math.max(0, cap - 1 - members.length), ym,
               loyalty: b.loyalty ?? SECT_BRANCH.loyaltyStart, rival, heat: b.heat || 0, seceding: (b.loyalty ?? 100) <= SECT_BRANCH.secedeAt,
               totals: { qi, stonesMin, herbsMin }, strength }
    })
    const cost = this._branchTourneyCost(), left = Math.max(0, (o.tourneyAt || 0) - this._cdNow())
    const S = SECT_BRANCH.tourney
    return { branches, count: branches.length, max: SECT_BRANCH.maxBranches, full: branches.length >= SECT_BRANCH.maxBranches,
      tourney: { cost, secsLeft: left, short: s.spiritStones < cost,
                 ready: branches.length >= 2 && left <= 0 && s.spiritStones >= cost,
                 qiFrac: S.qiFrac, stones: Math.round((S.stonesBase + S.stonesPerBranch * branches.length) * (1 + s.stageIndex * 0.1)) },
      last: o.lastTourney }
  }

  // Phase 45: a game-year tick (with the family, so it only runs while you are present — pillar 4). A head may take
  // on a member, a rivalry grows hot, and a hot rivalry may break into a brawl. Loyalty itself never decays.
  _tickBranches() {
    const s = this._s, o = s.ownSect
    if (!o?.founded || !o.branches.length) return
    const S = SECT_BRANCH, yr = Math.floor(s.world.year)
    let changed = false
    for (const b of [...o.branches]) {
      const head = this._branchHead(b)
      if (!head) continue
      const members = this._branchMembers(b), cap = branchCap(head) - 1, gap = yr - (b.lastRecruitYear || yr)
      if (members.length < cap && gap >= S.recruitYears[0] && (gap >= S.recruitYears[1] || Math.random() < S.recruitChance)) {
        const rec = { ...this._genRecruit(), level: 1, xp: 0, branchId: b.id, role: 'disciple', kin: false }
        rec.personality = Persons.rollPersonality()
        o.disciples.push(rec)
        b.lastRecruitYear = yr
        changed = true
        const rival = b.rivalId ? this._branchById(b.rivalId) : null
        if (rival) { b.heat = Math.min(S.heatMax, (b.heat || 0) + S.heatPerRecruit); rival.heat = Math.min(S.heatMax, (rival.heat || 0) + S.heatPerRecruit) }
        this.addEvent({ text: `${head.name}'s ${b.name} takes in ${rec.name}.`, type: 'positive' })
      }
      if ((b.heat || 0) >= S.brawlAt && Math.random() < S.brawlChance) {
        const rival = b.rivalId ? this._branchById(b.rivalId) : null
        const pick = ms => ms.length ? ms[Math.floor(Math.random() * ms.length)] : null
        const a = pick(this._branchMembers(b)), c = rival ? pick(this._branchMembers(rival)) : null
        for (const m of [a, c]) if (m) o.disciples = o.disciples.filter(x => x.id !== m.id)
        b.heat = Math.max(0, (b.heat || 0) - S.brawlHeatDrop)
        if (rival) rival.heat = Math.max(0, (rival.heat || 0) - S.brawlHeatDrop)
        changed = true
        const names = [a?.name, c?.name].filter(Boolean).join(' and ') || 'disciples'
        this.addEvent({ text: `A brawl between the ${b.name}${rival ? ` and the ${rival.name}` : ''}: ${names} are driven out of ${o.name}.`, type: 'negative' })
      }
    }
    if (changed) { this._recalc(); this._notify() }
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
      const ym = this._discipleYieldMult(dc)   // Phase 45: a branch member feeds a share (head keeps some back)
      stones += DISCIPLE_STONE_RATE * dc.talent * lm * ym
      herbs  += DISCIPLE_HERB_RATE  * dc.talent * lm * ym
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

  // ── Phase 43b: Living Sects — the world's sect registry (docs/systems/npc-sects.md) ───────────────────────────
  // s.world.sects survives every death (it is the world's). Each record: { id, name, defId, kind: 'joinable'|'rival'|
  // 'splinter', tier, temper, leader, buildings: {id: level}, hallLevel, maxBuildingLevel, maxHall, disciples, stance,
  // deeds, sworn, origin, bornYear, lastRaisedYear, alive }. Might is derived (worldSectMight), never stored.
  // The sim steps once per game year (with the family), so it only runs while the game is open (pillar 4).

  _blankWorldSects() { return { list: [], nextId: 1, born: 0, fallen: 0, chronicle: [], event: null, lastRaised: null,
                               razed: 0, dread: 0, ashes: [] } }   // Phase 43f: sects razed, your dread, the ashes (remnants to come)

  _ensurePhase43bFields() {
    const w = this._s?.world
    if (!w) return
    if (!w.sects || !Array.isArray(w.sects.list)) w.sects = this._seedWorldSects(w)
    const W = w.sects, blank = this._blankWorldSects()
    for (const k of Object.keys(blank)) if (W[k] === undefined) W[k] = blank[k]
    if (!Array.isArray(W.chronicle)) W.chronicle = []
    for (const r of W.list) {
      if (!r.buildings) r.buildings = {}
      if (!Array.isArray(r.deeds)) r.deeds = []
      if (typeof r.stance !== 'number') r.stance = 0
      if (r.sworn === undefined) r.sworn = false
      if (r.lastLost === undefined) r.lastLost = null   // 43d: the hall it lost last (the levy)
      if (!r.acted) r.acted = {}                        // 43h: your actions' per-sect cooldowns (the year each may be used again)
      if (!(r.hallLevel >= 1)) r.hallLevel = 1
      if (!(r.disciples >= 0)) r.disciples = 10
      if (r.leaderSince === undefined) r.leaderSince = r.bornYear || Math.floor(this._s?.world?.year || 1)   // 46c: leaders age out
      if (r.kind === 'lineage') {                        // 46b: a sect founded by the player's line
        if (r.founderName === undefined) r.founderName = ''
        if (r.lineageOf === undefined) r.lineageOf = null
      }
    }
    if (W.event && !W.list.some(r => r.id === W.event.sectId)) W.event = null
  }

  // Phase 46 (1.20b, lineage-sect.md): a pre-46 save kept its founded sect as a dormant `clan.sect` snapshot. Turn
  // it into the living world sect it now should be, so it can be seen, fought over and rejoined. Runs once per clan
  // (guarded by `worldSectId`).
  _ensurePhase46Fields() {
    const w = this._s?.world
    if (!w?.sects || !w.clans) return
    for (const clan of Object.values(w.clans)) {
      const cs = clan?.sect
      if (!cs || cs.worldSectId || !cs.name) continue
      const rec = this._wsFromClanSect(cs, clan, w)
      if (rec) cs.worldSectId = rec.id
    }
    this._wsKeepGates()   // final QA: a save whose taken-over sect lost its gate gets it back (idempotent)
    for (const clan of Object.values(w.clans)) this._repairLines(clan)   // final QA: no branch names a head it does not hold
  }

  // The world's first sects. A hash-seeded RNG (no Math.random draws, so existing sim seeds don't shift).
  _seedWorldSects(w) {
    const S = WORLD_SECTS, W = this._blankWorldSects(), s = this._s
    const rng = wsRng(`${s.self?.id || ''}|${s.name || ''}|${Math.floor(w.year || 1)}`)
    const yr = Math.floor(w.year || 1)
    const cap = (hall) => S.discipleCaps[Math.max(0, Math.min(S.discipleCaps.length - 1, hall - 1))]
    const add = (fields) => {
      const r = { id: 'ws' + (W.nextId++), defId: null, kind: 'rival', stance: 0, deeds: [], sworn: false, origin: 'seed',
                  bornYear: yr, lastRaisedYear: 0, alive: true, ...fields }
      r.leader = r.leader || wsLeaderName(rng)
      if (!(r.disciples >= 0)) r.disciples = Math.round(cap(r.hallLevel) * (0.45 + rng() * 0.35))
      W.list.push(r)
      return r
    }
    for (const sd of WORLD_SECT_SEED) {
      const def = SECTS.find(d => d.id === sd.defId)
      if (!def) continue
      add({ name: def.name, defId: def.id, kind: 'joinable', tier: sd.tier, temper: sd.temper, buildings: { ...sd.levels },
            hallLevel: sd.hallLevel, maxBuildingLevel: sd.maxBuildingLevel, maxHall: sd.maxHall })
    }
    const taken = new Set(W.list.map(r => r.name))
    for (const rv of WORLD_RIVAL_SEED) {
      const name = wsRivalName(rng, taken); taken.add(name)
      add({ name, tier: rv.tier, temper: WORLD_SECT_TEMPERS[Math.floor(rng() * WORLD_SECT_TEMPERS.length)], buildings: { ...rv.levels },
            hallLevel: rv.hallLevel, maxBuildingLevel: rv.maxBuildingLevel, maxHall: rv.maxHall })
    }
    // An old save: the sect you already belong to took you in; factions that seceded from you (Phase 45, before
    // 43b) become the splinter sects they always meant to be.
    if (s.sect?.id) {
      const mine = W.list.find(r => r.defId === s.sect.id)
      if (mine) { mine.stance = S.stanceJoin; mine.deeds.push({ year: yr, text: 'took you in as a disciple' }) }
    }
    for (const e of w.enemies || []) {
      const m = e.kind === 'sect' && /^the (.+) faction$/.exec(e.name || '')
      if (!m || W.list.length >= S.maxAlive + 4) continue
      const surname = m[1].split(' ')[0]
      add({ name: `${surname} ${WORLD_SECT_SPLINTER.suffixes[0]}`, kind: 'splinter', origin: 'seceded', tier: WORLD_SECT_SPLINTER.tier,
            temper: 'grumpy', leader: m[1], buildings: {}, hallLevel: 1, maxBuildingLevel: WORLD_SECT_SPLINTER.maxBuildingLevel,
            maxHall: WORLD_SECT_SPLINTER.maxHall, disciples: 4, stance: S.stanceSeceded,
            deeds: [{ year: e.year || yr, text: e.why || 'left your sect in anger' }] })
    }
    return W
  }

  _wsAll()       { return this._s.world?.sects?.list || [] }
  _wsRec(id)     { return id ? this._wsAll().find(r => r.id === id && r.alive) || null : null }
  _wsById(id)    { return this._wsRec(id) }   // Phase 46: a lineage membership resolves by record id, not defId
  _wsByDef(defId){ return this._wsAll().find(r => r.defId === defId && r.alive) || null }
  _wsMine()      { const id = this._s.sect?.id; return id ? (this._wsByDef(id) || this._wsById(id)) : null }
  _wsLevels(r)   { return Object.values(r.buildings || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0) }

  // The sects' short chronicle (kept for the sect page + old readers) and, since 4.6, the merged world Chronicle.
  // `pids` name the people in the line (World → Chronicle links them); `notable` lights the 世 dot.
  _wsChron(text, sectId = null, pids = null, notable = false, routine = false) {
    const W = this._s.world.sects
    W.chronicle.push({ year: Math.floor(this._s.world.year), text, sectId })
    if (W.chronicle.length > WORLD_SECTS.chronicleMax) W.chronicle.splice(0, W.chronicle.length - WORLD_SECTS.chronicleMax)
    this._chron({ k: 'sect', t: text, s: sectId, p: pids, n: notable, q: routine })
  }
  // A sect remembers what you did to it (newest last) and its stance moves with it.
  _wsDeed(r, delta, text) {
    if (!r) return
    r.stance = Math.max(-100, Math.min(100, Math.round((r.stance || 0) + (delta || 0))))
    if (text) {
      r.deeds.push({ year: Math.floor(this._s.world.year), text, delta: Math.round(delta || 0) })
      if (r.deeds.length > WORLD_SECTS.deedsMax) r.deeds.splice(0, r.deeds.length - WORLD_SECTS.deedsMax)
    }
  }

  // Your own Might, the same scale as a sect's. A founder is their sect; a disciple borrows some of their sect's
  // weight; a wanderer has only their realm.
  playerMight() {
    const s = this._s, personal = Math.round(10 + 6 * (s.stageIndex || 0))
    const o = s.ownSect
    if (o?.founded) {
      const tier = Math.max(1, Math.min(5, Math.round((s.stageIndex || 0) / 5)))
      return Math.max(personal, worldSectMight({ buildings: o.buildings, hallLevel: o.hallLevel, disciples: (o.disciples?.length || 0) * 10, tier }))
    }
    const mine = this._wsMine()
    return mine ? Math.max(personal, Math.round(0.6 * worldSectMight(mine))) : personal
  }

  // `rng` (4.6): a hidden master founds a sect from the seeded life step, so it never draws Math.random.
  _wsNewRival({ name, tier, kind = 'rival', origin = 'born', rng = Math.random, ...rest } = {}) {
    const S = WORLD_SECTS, N = WORLD_SECT_NEWBORN, W = this._s.world.sects
    const rnd = (a, b) => a + Math.floor(rng() * (b - a + 1))
    const taken = new Set(this._wsAll().filter(r => r.alive).map(r => r.name))
    const r = { id: 'ws' + (W.nextId++), defId: null, kind, origin,
                name: name || wsRivalName(rng, taken),
                tier: tier || N.tiers[Math.floor(rng() * N.tiers.length)],
                temper: WORLD_SECT_TEMPERS[Math.floor(rng() * WORLD_SECT_TEMPERS.length)],
                leader: wsLeaderName(rng), buildings: {}, hallLevel: 1,
                maxBuildingLevel: rnd(N.maxBuildingLevel[0], N.maxBuildingLevel[1]), maxHall: rnd(N.maxHall[0], N.maxHall[1]),
                disciples: rnd(N.discipleStart[0], N.discipleStart[1]), stance: 0, deeds: [], sworn: false,
                bornYear: Math.floor(this._s.world.year), lastRaisedYear: 0, alive: true, ...rest }
    W.list.push(r)
    W.born++
    return r
  }

  // Raise one thing: a building level (an unbuilt hall is level 0) or, with hallShare, the Sect Hall. Within its caps.
  _wsGrow(r) {
    const S = WORLD_SECTS
    const open = SECT_BUILDINGS.filter(b => (r.buildings[b.id] || 0) < r.maxBuildingLevel)
    const hallOk = r.hallLevel < r.maxHall
    if (!open.length && !hallOk) return null
    if (hallOk && (!open.length || Math.random() < S.hallShare)) {
      r.hallLevel++
      return { hall: true, level: r.hallLevel }
    }
    const b = open[Math.floor(Math.random() * open.length)]
    r.buildings[b.id] = (r.buildings[b.id] || 0) + 1
    return { buildingId: b.id, level: r.buildings[b.id] }
  }
  // Lose one level (a fire, a feud). A joinable sect always keeps at least one hall standing.
  // 43d: the loss is remembered (r.lastLost, for the levy) and, when it is your own sect, named with what it did to your blessing.
  _wsSetback(r, cause = '') {
    const built = Object.keys(r.buildings).filter(k => r.buildings[k] > 0)
    // A joinable sect (and, since Phase 46, a line founded by the player) always keeps at least one hall standing.
    if (!built.length || ((r.kind === 'joinable' || r.kind === 'lineage') && this._wsLevels(r) <= 1)) return null
    const id = built[Math.floor(Math.random() * built.length)]
    r.buildings[id]--
    if (r.buildings[id] <= 0) delete r.buildings[id]
    r.lastLost = { buildingId: id, year: Math.floor(this._s.world?.year || 0) }
    if (r === this._wsMine()) this._wsMineLost(r, id, cause)
    return id
  }
  // Phase 43d: your own sect lost a hall level. The log names the cause and the new blessing; the sect calls a levy
  // (the event waits on you; if another matter is waiting, the levy can still come on a later year).
  _wsMineLost(r, id, cause) {
    const W = this._s.world.sects, name = SECT_BUILDINGS.find(b => b.id === id)?.name || 'hall', lv = r.buildings[id] || 0
    const k = this.sectBlessing()?.k
    this.addEvent({ type: 'negative', text: `${cause ? `${cause}: t` : 'T'}he ${r.name}'s ${name} ${lv ? `falls to Lv.${lv}` : 'is lost'}. The blessing on you thins to ×${(k ?? 1).toFixed(2)}.` })
    if (!W.event) {
      W.event = { id: 'levy', sectId: r.id, year: Math.floor(this._s.world.year), buildingId: id }
      this.addEvent({ text: `The ${r.name} calls a levy to rebuild its ${name}. It waits on you in Sect → Overview.`, type: 'neutral' })
    }
  }

  // Phase 46 (1.20c, lineage-sect.md): a master who has held the seat long faces a rising chance of being succeeded
  // — a death or a retirement. The world churns on; a master of your line's old sect earns a player log line.
  // Phase 28 (4.2): who sits in the master's seat now (a registry person, or null when none was seated yet).
  _wsLeader(r) {
    const p = r?.leaderId ? this._s.world.persons[r.leaderId] : null
    return p && p.alive !== false && Persons.fullName(p) === r.leader ? p : null
  }
  _wsSeat(r, p) {
    r.leaderId = p.id
    r.leader = Persons.fullName(p)
    if (r.temper && PERSONALITIES.some(x => x.id === r.temper)) p.personality = r.temper   // the sect's temper IS its master's
    p.role = 'sect_master'; p.sectId = r.id; p.sectRole = 'master'
    if (p.owner === 'sect') p.owner = 'world'
  }
  _wsMasterStage(r, rng) {
    const M = SECT_MASTER
    return Math.min(NPC_STAGE_CAP, M.stageBase + M.stagePerTier * (r.tier || 1) + M.stageJitter[0] + Math.floor(rng() * (M.stageJitter[1] - M.stageJitter[0] + 1)))
  }
  // A world sect's named people: a real master (named r.leader) and its elders, by tier. Idempotent; seeded rng only.
  // `draft` (4.6, the yearly tick + successions only, never a UI read): an empty elder's seat goes to a living person
  // first — one of the sect's own disciples, else an unsworn wanderer of the right realm — before anyone is minted.
  _wsEnsurePeople(r, draft = false) {
    if (!r?.alive) return
    const w = this._s.world, P = WORLD_PEOPLE, yr = Math.floor(w.year || 1)
    const rng = wsRng(`${r.id}|${r.leader}|${yr}|people`)
    if (!this._wsLeader(r)) {
      const prev = r.leaderId ? w.persons[r.leaderId] : null
      if (prev && prev.alive !== false && prev.sectId === r.id) { prev.role = 'retired_master'; prev.sectRole = null }
      // Someone of that name already of this sect (an elder, the master you met in 43e) takes the seat; else mint them.
      const named = Object.values(w.persons).find(p => p.alive !== false && Persons.fullName(p) === r.leader && (p.sectId === r.id || p.sectRecId === r.id))
      const parts = String(r.leader || '').split(' ')
      const p = named || this._mintPerson({ family: parts.length > 1 ? parts[0] : '', given: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || null),
        stage: this._wsMasterStage(r, rng), age: P.masterAge, personality: r.temper, role: 'sect_master' }, rng)
      this._wsSeat(r, p)
      r.elderIds = (r.elderIds || []).filter(id => id !== p.id)
    }
    const lead = this._wsLeader(r)
    r.elderIds = (r.elderIds || []).filter(id => { const e = w.persons[id]; return e && e.alive !== false && e.sectId === r.id && id !== r.leaderId })
    const want = P.eldersByTier[Math.max(0, Math.min(P.eldersByTier.length - 1, (r.tier || 1) - 1))]
    while (r.elderIds.length < want) {
      const drafted = draft && lead ? this._wsDraftElder(r, lead, rng) : null
      if (drafted) { r.elderIds.push(drafted.id); continue }
      const below = P.elderStageBelow[0] + Math.floor(rng() * (P.elderStageBelow[1] - P.elderStageBelow[0] + 1))
      const e = this._mintPerson({ stage: Math.max(1, (lead?.stageIndex || 10) - below), age: P.elderAge, role: 'sect_elder', sectId: r.id, sectRole: 'elder' }, rng)
      r.elderIds.push(e.id)
    }
  }
  // 4.6: who the world offers for an empty elder's seat (null = nobody fits; the caller mints someone new).
  _wsDraftElder(r, lead, rng) {
    const s = this._s, w = s.world, P = WORLD_PEOPLE, yr = Math.floor(w.year || 1)
    const lo = Math.max(1, (lead.stageIndex || 0) - P.elderStageBelow[1]), hi = (lead.stageIndex || 0) - P.elderStageBelow[0]
    const ok = p => p.alive !== false && (!p.owner || p.owner === 'world') && p.id !== s.self?.id && p.id !== lead.id
      && (p.role === 'wanderer' || p.role === 'disciple') && yr - (p.bornYear ?? yr) >= AWAKENING_AGE
      && (p.stageIndex || 0) >= lo && (p.stageIndex || 0) <= hi
    const byStage = (a, b) => (b.stageIndex || 0) - (a.stageIndex || 0) || String(a.id).localeCompare(String(b.id))
    const all = Object.values(w.persons).filter(ok)
    let pool = all.filter(p => p.sectId === r.id && p.sectRole === 'disciple').sort(byStage)
    if (!pool.length) pool = all.filter(p => !p.sectId).sort(byStage)
    if (!pool.length) return null
    const e = pool[Math.floor(rng() * Math.min(NPC_WORLD.draftPool, pool.length))]
    e.sectId = r.id; e.sectRole = 'elder'; e.role = 'sect_elder'
    this._chron({ k: 'sect', t: this._chronText('drafted', e, { sect: r.name }), s: r.id, p: [e.id], q: true })
    if (e.cohort === this._lifeNo()) this.addEvent({ type: 'neutral', text: this._lifeText('draftedClassmate', e, { sect: r.name }), pid: e.id })
    return e
  }
  // Public (UI + checks): a sect's named people — master first, then elders.
  sectPeople(recId) {
    const r = this._wsRec(recId)
    if (!r) return []
    this._wsEnsurePeople(r)
    return [r.leaderId, ...(r.elderIds || [])].map(id => this._s.world.persons[id]).filter(Boolean)
      .map(p => ({ pid: p.id, name: Persons.fullName(p), role: p.id === r.leaderId ? 'Master' : 'Elder', stage: p.stageIndex || 0 }))
  }

  _wsCheckSuccession(r, yr) {
    const L = WORLD_SECT_LEADERS
    const seated = Math.max(0, yr - (r.leaderSince ?? r.bornYear ?? yr))
    const chance = Math.min(L.changeMax, L.changeBase + L.changePerYear * seated)
    if (Math.random() >= chance) return null
    // Phase 28 (4.2): real people. The old master dies in the seat or retires into seclusion (a hash of the sect and
    // year decides — no extra Math.random draws); the senior elder takes the seat, else someone new is raised.
    this._wsEnsurePeople(r)
    const old = r.leader, oldP = this._wsLeader(r)
    // 4.3: deaths of age and backlash now come from the light life step. A change of seat here is a struggle (an elder
    // forces the master out, and some masters die in it) or a retirement.
    const dies = wsRng(`${r.id}|${yr}|succession`)() < WORLD_PEOPLE.masterDiesShare
    if (oldP) {
      if (dies) this._killPerson(oldP.id, yr, 'seat_struggle', { seat: false })
      else { oldP.role = 'retired_master'; oldP.sectRole = null }
    }
    if (Math.random() < L.temperSwitchChance) r.temper = WORLD_SECT_TEMPERS[Math.floor(Math.random() * WORLD_SECT_TEMPERS.length)]
    return this._wsSeatHeir(r, yr, dies ? `buries its master: ${old} fell in a struggle for the seat` : `bows as ${old} retires into seclusion`, dies)
  }
  // The senior elder takes the empty seat (else someone new is raised); the chronicle names how the old master left.
  _wsSeatHeir(r, yr, how, died, oldPid = null) {
    const w = this._s.world, old = r.leader
    oldPid = oldPid || r.leaderId || null
    const heir = (r.elderIds || []).map(id => w.persons[id]).filter(p => p && p.alive !== false)
      .sort((a, b) => (b.stageIndex || 0) - (a.stageIndex || 0) || String(a.id).localeCompare(String(b.id)))[0]
    if (heir) this._wsSeat(r, heir)
    else this._wsSeat(r, this._mintPerson({ stage: this._wsMasterStage(r, wsRng(`${r.id}|${yr}|heir`)), age: WORLD_PEOPLE.masterAge, personality: r.temper, role: 'sect_master' }, wsRng(`${r.id}|${yr}|heir-p`)))
    r.elderIds = (r.elderIds || []).filter(id => id !== r.leaderId)
    r.leaderSince = yr
    this._wsEnsurePeople(r, true)   // a new elder rises to fill the bench (4.6: drawn from the living first)
    this._wsChron(`The ${r.name} ${how}, and ${heir ? 'its senior elder, ' : ''}${r.leader} takes the seat.`, r.id,
      [oldPid, r.leaderId].filter(Boolean), (r.tier || 1) >= 4 || r === this._wsMine() || r.kind === 'lineage')
    if (r.kind === 'lineage') this.addEvent({ type: 'neutral', text: `The ${r.name} — the sect your line founded — ${died ? `buries ${old}` : `sees ${old} retire`}. ${r.leader} leads it now.` })
    return r.leader
  }

  // Phase 43b: the world's yearly step (rides the game-year tick — only while open, pillar 4).
  _tickWorldSects() {
    const s = this._s, W = s.world?.sects
    if (!W) return
    const S = WORLD_SECTS, yr = Math.floor(s.world.year)
    const bName = id => SECT_BUILDINGS.find(b => b.id === id)?.name || 'hall'
    const alive = () => W.list.filter(r => r.alive)
    const mine = this._wsMine()
    // Final QA: no dead person keeps a seat, whatever path seated or killed them (a lineage inheritor who had died as a
    // disciple, a death that bypassed _killPerson): the senior elder takes a dead master's seat, dead elders leave the bench.
    for (const r of alive()) {
      const lp = r.leaderId ? s.world.persons?.[r.leaderId] : null
      if (lp && lp.alive === false) this._wsSeatHeir(r, yr, `buries its master: ${Persons.fullName(lp)} is gone`, true, lp.id)
      if (r.elderIds?.length) r.elderIds = r.elderIds.filter(id => s.world.persons?.[id]?.alive !== false)
    }
    for (const r of alive()) this._wsEnsurePeople(r, true)   // Phase 28 (4.2): a newborn sect's master + elders become real people (4.6: the bench drafts the living)
    for (const r of alive()) {
      if (Math.random() < (S.growChance + S.growPerTier * (r.tier || 1)) * (r.grudge ? SECT_RAZE.remnant.growMult : 1)) {   // 43f: a remnant rebuilds in anger
        const g = this._wsGrow(r)
        if (g) {
          r.lastRaisedYear = yr
          if (g.buildingId && g.buildingId === r.lastLost?.buildingId) r.lastLost = null   // 43d: rebuilt on its own
          if (r === mine) this.addEvent({ type: 'positive', text: `The ${r.name} raises its ${g.hall ? 'Sect Hall' : bName(g.buildingId)} to Lv.${g.level}. The blessing on you grows to ×${this.sectBlessing().k.toFixed(2)}.` })   // 43d
          if (g.hall) this._wsChron(`The ${r.name} raises its Sect Hall to Lv.${g.level}.`, r.id)
          else {
            this._wsChron(g.level === 1 ? `The ${r.name} raises a ${bName(g.buildingId)}.` : `The ${r.name} deepens its ${bName(g.buildingId)} to Lv.${g.level}.`, r.id)
            W.lastRaised = { sectId: r.id, buildingId: g.buildingId, year: yr }
          }
        }
      }
      const target = S.discipleCaps[Math.max(0, Math.min(S.discipleCaps.length - 1, r.hallLevel - 1))]
      r.disciples = Math.max(0, Math.round(r.disciples + (target - r.disciples) * S.discipleDrift))
      this._wsCheckSuccession(r, yr)   // Phase 46 (1.20c): masters age out over the generations
      if (Math.random() < WORLD_SECT_LEADERS.disciplesJoinChance && r.disciples > 0 && r.disciples < target) {
        const more = WORLD_SECT_LEADERS.joinMin + Math.floor(Math.random() * (WORLD_SECT_LEADERS.joinMax - WORLD_SECT_LEADERS.joinMin + 1))
        this._wsChron(`${more} hopeful${more === 1 ? ' takes' : 's take'} the oath at the ${r.name}.`, r.id, null, false, true)
      }
      if (Math.random() < S.declineChance) {
        const lost = this._wsSetback(r, 'Fire on the mountain')
        if (lost) this._wsChron(`Fire takes the ${bName(lost)} of the ${r.name}.`, r.id)
      }
    }
    // Two sects clash; the weaker (by Might, with a roll) loses a level and some disciples.
    const live = alive()
    if (live.length >= 2 && Math.random() < S.clashChance) {
      const a = live[Math.floor(Math.random() * live.length)]
      const others = live.filter(x => x !== a)
      const b = others[Math.floor(Math.random() * others.length)]
      const ma = worldSectMight(a), mb = worldSectMight(b)
      const [win, lose] = Math.random() < ma / (ma + mb) ? [a, b] : [b, a]
      this._wsSetback(lose, `A clash with the ${win.name}`)
      lose.disciples = Math.round(lose.disciples * (1 - S.clashDiscipleLoss))
      this._wsChron(`The ${win.name} and the ${lose.name} clash in the passes. The ${lose.name} comes off worse.`, lose.id)
    }
    // A broken sect disbands (never a joinable one); the world refills with births.
    for (const r of alive()) {
      if (r.kind === 'joinable' || r.kind === 'lineage' || r.id === W.event?.sectId) continue   // Phase 46: a player's line-sect never just vanishes
      if (this._wsLevels(r) === 0 && r.hallLevel <= 1 && r.disciples < S.dissolveBelow) {
        r.alive = false; W.fallen++
        this._wsChron(`The ${r.name} breaks apart. Its last disciples scatter.`, r.id)
        this.addEvent({ text: `The ${r.name} is no more: its last disciples scatter to the winds.`, type: 'neutral' })
      }
    }
    W.list = W.list.filter(r => r.alive)
    this._tickAshes(yr)   // Phase 43f: dread fades; the ashes may stir
    this._wsKeepGates()   // final QA: a gate with no living record raises it again
    const rivals = W.list.filter(r => r.kind !== 'joinable').length
    if (rivals < S.rivalsTarget && W.list.length < S.maxAlive && Math.random() < S.birthChance) {
      const r = this._wsNewRival()
      this._wsChron(`A new sect raises its gate: the ${r.name}, led by ${r.leader}.`, r.id)
      this.addEvent({ text: `A new sect raises its gate in the hills: the ${r.name}, led by ${r.leader}.`, type: 'neutral' })
    }
    if (!W.event && Math.random() < S.eventChance) this._wsRollEvent(yr)
  }

  // Which sects an event can fire for, given its `needs`.
  _wsEligible(def, yr) {
    const s = this._s, W = s.world.sects, n = def.needs || {}, mine = this._wsMine()
    if (n.founder && !s.ownSect?.founded) return []
    // 43d: the levy is your own sect's (a hall it lost lately, not yet rebuilt); a court needs you to be a member
    if (n.mine) return mine && (!n.justLost || (mine.lastLost && yr - mine.lastLost.year <= SECT_BLESSING.lostYears)) ? [mine] : []
    if (n.court && !mine) return []
    return W.list.filter(r => r.alive && r !== mine
      && (!n.court || this._wsCourts(r, mine))
      && (!n.stance || (r.stance >= n.stance[0] && r.stance <= n.stance[1]))
      && (!n.splinter || r.kind === 'splinter')
      && (!n.remnant || r.grudge)   // 43f: a sect reborn from your ashes, still holding its feud
      && (!n.justRaised || (W.lastRaised?.sectId === r.id && yr - W.lastRaised.year <= 2))
      && !(def.id === 'alliance' && r.sworn))
  }
  _wsRollEvent(yr) {
    const W = this._s.world.sects
    const opts = WORLD_SECT_EVENTS.map(def => ({ def, sects: this._wsEligible(def, yr) })).filter(o => o.sects.length)
    const total = opts.reduce((a, o) => a + o.def.weight, 0)
    if (!total) return null
    let roll = Math.random() * total, pick = opts[0]
    for (const o of opts) { roll -= o.def.weight; if (roll <= 0) { pick = o; break } }
    const r = pick.sects[Math.floor(Math.random() * pick.sects.length)]
    const bId = pick.def.needs?.justRaised ? W.lastRaised.buildingId : pick.def.needs?.justLost ? r.lastLost.buildingId : null
    W.event = { id: pick.def.id, sectId: r.id, year: yr, ...(bId ? { buildingId: bId } : {}) }
    this.addEvent({ text: `Word comes from the ${r.name}. A matter waits on you in Sect → Overview.`, type: 'neutral' })
    if (this._warLive) this._notify()
    return W.event
  }

  _wsFill(text, r, ev, mineName = this._sectDef()?.name || 'your sect') {
    const hall = ev?.buildingId ? (SECT_BUILDINGS.find(b => b.id === ev.buildingId)?.name || 'hall') : 'hall'
    return String(text || '').replace(/\{sect\}/g, r?.name || 'sect').replace(/\{leader\}/g, r?.leader || 'their master').replace(/\{hall\}/g, hall)
      .replace(/\{mine\}/g, mineName)
  }
  // The chance a choice succeeds (null = no roll), the same number the UI shows.
  _wsOdds(c, r) {
    const s = this._s
    if (c.vsMight) { const me = this.playerMight(), them = worldSectMight(r); return Math.max(0.05, Math.min(0.95, me / (me + them))) }
    if (!c.odds) return null
    const gap = (s.stageIndex || 0) - (r.tier || 1) * 4
    const you = c.odds.you?.[s.personality?.id] || 0
    const loyal = c.odds.mineStanceDiv ? (this._wsMine()?.stance || 0) / c.odds.mineStanceDiv : 0   // 43d: your own sect's regard
    return Math.max(0.1, Math.min(0.9, c.odds.base + (c.odds.perStageGap || 0) * gap + you + loyal))
  }
  // Phase 43d: a richer joinable sect that would take you (its blessing factor beats your sect's by courtGap).
  _wsCourts(r, mine) {
    const def = r.defId && SECTS.find(d => d.id === r.defId)
    if (!def || !mine || r === mine || (this._s.stageIndex || 0) < def.minStage) return false
    return wsBlessingFactor(r).factor >= wsBlessingFactor(mine).factor + SECT_BLESSING.courtGap
  }
  // 43d: ± Contribution in your own sect from a { base, perTier } (perTier × your sect's tier).
  _wsContribOf(spec) {
    if (!spec) return 0
    return Math.round((spec.base || 0) + (spec.perTier || 0) * (this._wsMine()?.tier || 1))
  }
  // A choice with lockWar waits while any war of yours is underway (a member's call to arms, or your own sect's war).
  _wsWarLock() { return this._wsMemberWar() || (!!this._s.ownSect?.founded && this._relWarOn()) }
  _wsMemberWar() {
    const w = this._s.sectWar
    return w?.side === 'member' && (w.phase === 'scouting' || w.phase === 'preparing')
  }
  // 43d: a lost hall rises again a level (the levy). Returns its name, or null when nothing was lost.
  _wsRestore(r) {
    const id = r?.lastLost?.buildingId
    if (!id) return null
    r.buildings[id] = Math.min(r.maxBuildingLevel || SECT_BUILDING_MAX_LEVEL, (r.buildings[id] || 0) + 1)
    r.lastLost = null
    return SECT_BUILDINGS.find(b => b.id === id)?.name || 'hall'
  }
  // 43d: you go over to another sect. Your old sect remembers it; you enter one rank lower, your missions dropped.
  _wsDefect(r) {
    const s = this._s, old = this._sectDef(), oldRec = this._wsMine(), def = SECTS.find(d => d.id === r.defId)
    if (!def || !old) return null
    if (s.sectWar?.beastId) this._releaseWarBeast(0)
    const rank = Math.max(0, (s.sect.rank || 0) - 1)
    this._wsDeed(oldRec, SECT_BLESSING.stanceDefected, `you went over to the ${r.name}`)
    this._wsChron(`${s.name} leaves the ${old.name} for the ${r.name}.`, r.id)
    s.sect = { id: def.id, rank, contribution: SECT_RANKS[rank].minContribution, activeMissions: [] }
    s.sectWar = this._blankSectWar('member')
    return { from: old.name, to: def.name, rank: SECT_RANKS[rank].name }
  }
  _wsCost(c, r) {
    const k = c.cost || {}
    const o = this._s.ownSect
    return Math.round((k.stones || 0) + (k.stonesPerTier || 0) * (r.tier || 1) + (k.stonesPerDisciple || 0) * (o?.founded ? o.disciples.length : 0))
  }
  _wsGain(c, r) {
    const g = c.gain || {}
    return { stones: Math.round((g.stones || 0) + (g.stonesPerTier || 0) * (r.tier || 1)), herbs: g.herbs || 0 }
  }
  _wsStanceOf(map, r) { return map ? (map[r.temper] ?? map.default ?? 0) : 0 }

  // Public (UI): the waiting world-sect event, with every choice's cost, odds and lock reason.
  worldSectEventInfo() {
    const s = this._s, ev = s.world?.sects?.event
    if (!ev) return null
    const def = WORLD_SECT_EVENTS.find(d => d.id === ev.id), r = this._wsRec(ev.sectId)
    if (!def || !r) return null
    const temperName = PERSONALITIES.find(p => p.id === r.temper)?.name || ''
    return { id: def.id, glyph: def.glyph, year: ev.year, sect: this._wsRow(r),
      title: this._wsFill(def.title, r, ev), text: this._wsFill(def.text, r, ev), temper: temperName,
      choices: def.choices.map((c, i) => {
        const cost = this._wsCost(c, r), odds = this._wsOdds(c, r), gain = this._wsGain(c, r)
        const lock = cost > s.spiritStones ? `Needs ${cost} stones`
          : c.lockWar && this._wsWarLock() ? 'Not while your sect is at war' : ''
        const mine = this._wsMine()
        // 43d: going over — where you land and what the blessing would be there
        let defect = null
        if (c.defect && r.defId) {
          const rank = Math.max(0, (s.sect?.rank || 0) - 1)
          defect = { rank: SECT_RANKS[rank].name, k: Math.round(wsBlessingFactor(r).factor * SECT_BLESSING.rankShare[rank] * 100) / 100,
                     nowK: this.sectBlessing()?.k ?? 0, missions: s.sect?.activeMissions?.length || 0 }
        }
        return { i, label: this._wsFill(c.label, r, ev), glyph: c.glyph || def.glyph, cost, odds, gain, lock, vsMight: !!c.vsMight,
          stance: this._wsStanceOf(c.stance, r), failStance: c.failStance ? this._wsStanceOf(c.failStance, r) : null,
          karma: c.karma || 0, health: c.failHealth || 0, healthNow: c.health || 0, disciples: c.disciples || 0, sworn: !!c.sworn, setback: !!c.setback,
          contrib: this._wsContribOf(c.contrib), failContrib: c.failContrib ? this._wsContribOf(c.failContrib) : null,
          mineStance: c.mineStance && mine ? this._wsStanceOf(c.mineStance, mine) : 0,
          failMineStance: c.failMineStance && mine ? this._wsStanceOf(c.failMineStance, mine) : null,
          restore: !!c.restore, defect, loyal: !!c.odds?.mineStanceDiv, clearGrudge: !!c.clearGrudge, march: !!c.march }
      }), mine: ev.id === 'levy', mineName: this._sectDef()?.name || null, mineStance: this._wsMine()?.stance ?? null }
  }

  // Public (UI/sim): answer the waiting world-sect event with choice `i`. Every effect is named in the log line.
  answerWorldSectEvent(i) {
    const s = this._s, W = s.world?.sects, ev = W?.event
    if (!ev) return { ok: false, reason: 'no_event' }
    const def = WORLD_SECT_EVENTS.find(d => d.id === ev.id), r = this._wsRec(ev.sectId)
    if (!def || !r) { W.event = null; return { ok: false, reason: 'gone' } }
    const c = def.choices[i]
    if (!c) return { ok: false, reason: 'bad_choice' }
    const cost = this._wsCost(c, r)
    if (cost > s.spiritStones) return { ok: false, reason: 'stones' }
    if (c.lockWar && this._wsWarLock()) return { ok: false, reason: 'war' }
    s.spiritStones -= cost
    const odds = this._wsOdds(c, r)
    const success = odds == null ? true : Math.random() < odds
    const o = s.ownSect, parts = []
    const mine = this._wsMine(), mineName = this._sectDef()?.name || 'your sect'   // 43d: before any defection
    if (cost) parts.push(`−${cost} stones`)
    const stance = success ? this._wsStanceOf(c.stance, r) : this._wsStanceOf(c.failStance || c.stance, r)
    // 43d: your own sect — Contribution and how it regards you (the levy is your sect's own event: `r` is `mine` there)
    const contrib = this._wsContribOf(success ? c.contrib : c.failContrib)
    if (contrib && s.sect?.id) {
      const before = s.sect.contribution
      s.sect.contribution = Math.max(0, before + contrib)
      const d = s.sect.contribution - before
      if (d) parts.push(`${d > 0 ? '+' : '−'}${Math.abs(d)} Contribution`)
    }
    const mStance = mine && mine !== r ? this._wsStanceOf(success ? c.mineStance : (c.failMineStance || c.mineStance), mine) : 0
    if (mStance) {
      this._wsDeed(mine, mStance, `${def.short || def.id}: ${success ? 'you' : 'you tried to'} ${this._wsFill(c.label, r, ev, mineName).replace(/^./, ch => ch.toLowerCase())}`)
      parts.push(`the ${mine.name} ${mStance > 0 ? 'warms' : 'cools'} (${mStance > 0 ? '+' : ''}${mStance})`)
    }
    if (success && c.health) { s.health = Math.max(1, (s.health ?? 100) + c.health); parts.push(`Health ${c.health}`) }
    if (success) {
      if (c.restore) { const h = this._wsRestore(r); if (h) parts.push(`the ${h} rises again`) }
      if (c.defect) { const d = this._wsDefect(r); if (d) parts.push(`you join the ${d.to} as ${d.rank}`) }
      const g = this._wsGain(c, r)
      if (g.stones) { s.spiritStones += g.stones; parts.push(`+${g.stones} stones`) }
      if (g.herbs)  { s.inventory.spirit_herb = (s.inventory.spirit_herb || 0) + g.herbs; parts.push(`+${g.herbs} Spirit Herbs`) }
      if (c.karma)  { s.karma = Math.max(0, Math.min(100, s.karma + c.karma)); parts.push(`${c.karma > 0 ? '+' : ''}${c.karma} karma`) }
      if (c.disciples > 0) {
        if (o?.founded && this._mainRoster().length < (s.derived?.discipleCap || 0)) {
          const rec = { ...this._genRecruit(), level: 1, xp: 0, branchId: null, role: 'disciple', kin: false }
          rec.personality = disciplePersonality(rec.id)
          o.disciples.push(rec)
          parts.push(`${rec.name} joins your sect`)
        }
      } else if (c.disciples < 0) {
        const n = this._wsTakeDisciples(-c.disciples, r)
        if (n) parts.push(`${n} disciple${n === 1 ? '' : 's'} leave${n === 1 ? 's' : ''} for the ${r.name}`)
      }
      if (c.setback) this._wsSetback(r)
      if (c.sworn) { r.sworn = true; this._wsChron(`You and the ${r.name} swear an alliance before Heaven.`, r.id) }
      if (c.clearGrudge && r.grudge) { r.grudge = false; parts.push('the feud is set down'); this._wsChron(`The ${r.name} sets down its feud with ${o?.name || s.name}.`, r.id) }   // 43f
      if (c.march && o?.founded && !this._relWarOn()) { this._openWarOn(r, false, false); parts.push('they march on your mountain') }   // 43f
    } else {
      if (c.failHealth) { s.health = Math.max(1, (s.health ?? 100) + c.failHealth); parts.push(`Health ${c.failHealth}`) }
      if (c.failKarma)  { s.karma = Math.max(0, s.karma + c.failKarma); parts.push(`${c.failKarma} karma`) }
      if (c.failDisciples) {
        const n = this._wsTakeDisciples(-c.failDisciples, r)
        if (n) parts.push(`${n} disciple${n === 1 ? '' : 's'} slip${n === 1 ? 's' : ''} away`)
      }
    }
    const verb = this._wsFill(c.label, r, ev).replace(/^./, ch => ch.toLowerCase())
    this._wsDeed(r, stance, `${def.short || def.id}: you chose to ${verb}${success ? '' : ' — and failed'}`)
    if (stance) parts.push(`the ${r.name} ${stance > 0 ? 'warms' : 'cools'} (${stance > 0 ? '+' : ''}${stance})`)
    const text = this._wsFill(success ? c.result : c.failResult, r, ev, mineName)
    W.event = null
    this._recalc()
    const k = this.sectBlessing()?.k   // 43d: name what the answer did to your blessing (a levy paid, a sect left)
    if ((c.restore && success) || (c.defect && success)) parts.push(`blessing now ×${(k ?? 0).toFixed(2)}`)
    this.addEvent({ text: `${text}${parts.length ? ` (${parts.join(', ')})` : ''}`, type: success ? (stance < 0 && !cost ? 'neutral' : 'positive') : 'negative' })
    this._notify()
    return { ok: true, success, text, odds, parts }
  }

  // n disciples leave your sect for record `r` (main-hall members first, never a branch head or your own child).
  _wsTakeDisciples(n, r) {
    const o = this._s.ownSect
    if (!o?.founded || n <= 0) return 0
    const pool = o.disciples.filter(d => d.role !== 'head' && !d.kin).sort((a, b) => (a.branchId ? 1 : 0) - (b.branchId ? 1 : 0))
    const gone = pool.slice(0, n)
    if (!gone.length) return 0
    const ids = new Set(gone.map(d => d.id))
    o.disciples = o.disciples.filter(d => !ids.has(d.id))
    if (r) r.disciples += gone.length
    return gone.length
  }

  // Phase 45 → 43b: a branch that secedes becomes a real sect, led by the wronged head, with a grudge toward you.
  _wsSplinter(head, memberCount, why) {
    const W = this._s.world?.sects
    if (!W || !head) return null
    const P = WORLD_SECT_SPLINTER
    const surname = String(head.name || 'Nameless').split(' ')[0]
    const taken = new Set(W.list.filter(r => r.alive).map(r => r.name))
    let name = `${surname} ${P.suffixes[0]}`
    for (const suf of P.suffixes) { name = `${surname} ${suf}`; if (!taken.has(name)) break }
    const r = this._wsNewRival({ name, kind: 'splinter', origin: 'seceded', tier: P.tier, maxBuildingLevel: P.maxBuildingLevel,
                                 maxHall: P.maxHall, leader: head.name, temper: head.personality || 'grumpy',
                                 disciples: memberCount + 1, stance: WORLD_SECTS.stanceSeceded })
    r.deeds.push({ year: Math.floor(this._s.world.year), text: why ? `left your sect in anger: "${why}"` : 'left your sect in anger', delta: WORLD_SECTS.stanceSeceded })
    // Phase 28 (4.2): the head who left is the splinter's master — the same person, not a namesake.
    const hp = head.id ? this._disciplePerson(head) : null
    if (hp && Persons.fullName(hp) === r.leader) this._wsSeat(r, hp)
    this._wsChron(`${head.name} raises the ${r.name} from the branch that left ${this._s.ownSect?.name || 'your sect'}.`, r.id)
    return r
  }

  // ── Phase 46 (1.20b, lineage-sect.md): a player-owned sect outlives the player ────────────────────────────────
  // Who takes the master's seat when you die. DECIDED, never rolled (migration rule, no Math.random): the branch
  // head with the highest loyalty (tie: the larger branch, then name order), else the strongest disciple, else a
  // nameless steward keeps the gate.
  _lineageInheritor(o) {
    const ds = o?.disciples || [], bs = o?.branches || []
    const heads = bs.map(b => {
      const d = ds.find(x => x.id === b.headId)
      if (!d) return null
      return { name: d.name, personality: d.personality || null, d,
               loyalty: typeof b.loyalty === 'number' ? b.loyalty : 60,
               size: ds.filter(x => x.branchId === b.id).length }
    }).filter(Boolean)
    if (heads.length) {
      heads.sort((a, b) => (b.loyalty - a.loyalty) || (b.size - a.size) || String(a.name).localeCompare(String(b.name)))
      return heads[0]
    }
    const best = [...ds].sort((a, b) => ((b.level || 1) * 10 + (b.talent || 1)) - ((a.level || 1) * 10 + (a.talent || 1)))[0]
    return best ? { name: best.name, personality: best.personality || null, d: best, loyalty: 60, size: ds.length } : null
  }

  // Build the lineage world-sect record from a dying founder's ownSect. Deterministic (no Math.random draws).
  _wsFromOwnSect(o, w) {
    const W = w?.sects
    if (!W || !o?.founded) return null
    const rec = this._lineageRecord(w, o.name, o.buildings, o.hallLevel, (o.disciples || []).length, this._s.stageIndex || 0)
    // A sect you took over keeps its gate (lineage-sect.md 46b): joining that sect later finds this record (final QA fix —
    // it was always minted with defId null, so the gate led to a sect with no record).
    const gate = o.takenOver?.defId
    if (gate && !this._wsByDef(gate)) rec.defId = gate
    const inh = this._lineageInheritor(o)
    if (inh) {
      rec.leader = inh.name
      if (inh.personality && PERSONALITIES.some(p => p.id === inh.personality)) rec.temper = inh.personality
      if (rec.deeds[0]) rec.deeds[0].text = `founded by ${rec.founderName}; passes to ${rec.leader}`
    }
    W.list.push(rec)
    // Phase 28 (4.2): the sect's people go with it — the inheritor is seated, branch heads become its elders, the
    // rest its disciples (living-world.md §5). The record keeps living as a world sect from here.
    if (w.persons) {
      const ds = o.disciples || []
      for (const d of ds) {
        const p = this._disciplePerson(d)
        if (!p) continue
        p.sectId = rec.id; p.sectRole = d.role === 'head' ? 'elder' : 'disciple'; if (p.owner === 'sect') p.owner = 'world'
      }
      const hp = inh?.d ? w.persons[inh.d.kin ? inh.d.childId : inh.d.pid] : null
      if (hp && hp.alive !== false && Persons.fullName(hp) === rec.leader) this._wsSeat(rec, hp)   // (final QA: never a dead inheritor)
      rec.elderIds = ds.filter(d => d.role === 'head' && d !== inh?.d).map(d => d.kin ? d.childId : d.pid).filter(id => w.persons[id])
    }
    this._wsChron(`The ${rec.name} bows its head: ${rec.founderName} is gone, and ${rec.leader} takes the master's seat.`, rec.id)
    return rec
  }

  // A pre-46 save kept the founded sect as a dormant `clan.sect` snapshot; turn it into the living record it now is.
  _wsFromClanSect(cs, clan, w) {
    const W = w?.sects
    if (!W || !cs?.name) return null
    const rec = this._lineageRecord(w, cs.name, cs.buildings, cs.hallLevel, (cs.disciples || []).length, 10)
    const head = clan?.headId ? w.persons?.[clan.headId] : null
    if (head?.given) rec.leader = head.given
    rec.founderName = clan?.name ? `${clan.name} clan` : ''   // the current player isn't the founder here
    rec.lineageOf = null
    W.list.push(rec)
    return rec
  }

  // ── Phase 46 (1.20d, lineage-sect.md): recruited into your old sect at Core Formation ─────────────────────────
  // Fires once per life, the first time you reach Core Formation with no other sect, if a sect your line founded
  // still lives. The offer waits on you (it never expires) — join as an Outer Disciple, or decline for this life.
  _maybeLineageRecruit() {
    const s = this._s
    if (!s || s.interlude) return
    if (s.lineageOffer && (s.lineageOffer.done || s.lineageOffer.offered)) return
    const cf = CULTIVATION_STAGES.findIndex(x => x.realm === 'Core Formation')
    if ((s.stageIndex || 0) < cf) return
    if (s.sect?.id || s.ownSect?.founded) return
    const rec = this._wsAll().filter(r => r.alive && r.kind === 'lineage')
      .sort((a, b) => (b.bornYear || 0) - (a.bornYear || 0) || String(a.id).localeCompare(String(b.id)))[0]
    if (!rec) return
    s.lineageOffer = { recId: rec.id, year: Math.floor(s.world.year || 1), offered: true, done: false }
    this.addEvent({ type: 'special', text: `Riders in your own line's colors come to the gate: the ${rec.name}, the sect your blood founded, offers you a place at the outer gate. (Sect → Overview)` })
  }

  // Public (UI): the waiting recruitment offer.
  lineageRecruitInfo() {
    const off = this._s?.lineageOffer
    if (!off || off.done || !off.offered) return null
    const r = this._wsById(off.recId)
    if (!r) return null
    return { rec: this._wsRow(r), name: r.name, leader: r.leader, founderName: r.founderName,
             temper: PERSONALITIES.find(p => p.id === r.temper)?.name || '', disciples: r.disciples,
             tier: r.tier, might: worldSectMight(r), year: off.year, rank: SECT_RANKS[0].name }
  }

  // Public: answer the offer. `join` = true takes the oath (as an Outer Disciple); false declines for this life.
  answerLineageRecruit(join) {
    const s = this._s, off = s?.lineageOffer
    if (!off || off.done || !off.offered) return { ok: false, reason: 'no_offer' }
    off.done = true
    if (!join) { this.addEvent({ text: 'You send the riders away. You will not be asked again in this life.', type: 'neutral' }); this._recalc(); this._notify(); return { ok: true, joined: false } }
    const r = this._wsById(off.recId)
    if (!r) return { ok: false, reason: 'gone' }
    if (s.sect?.id || s.ownSect?.founded) return { ok: false, reason: 'in_sect' }
    s.sect = { id: r.id, rank: 0, contribution: 0, activeMissions: [] }
    s.sectWar = this._blankSectWar('member')
    this._wsDeed(r, WORLD_SECTS.stanceJoin, 'took you back as a disciple')
    this.addEvent({ type: 'special', text: `You kneel at the ${r.name}'s gate and take the oath. Your own blood founded this sect, but they do not know your face: you enter as an Outer Disciple.` })
    this._claimFirst('joined_sect')
    this._sectMaster()   // 43e: the master who sits above you
    this._recalc(); this._notify()
    return { ok: true, joined: true, sect: this._sectDef() }
  }

  _lineageRecord(w, name, buildings, hallLevel, discipleCount, stageIndex) {
    const W = w.sects, L = WORLD_SECT_LINEAGE, yr = Math.floor(w.year || 1)
    const tier = Math.max(1, Math.min(5, 1 + Math.floor((stageIndex || 0) / L.realmTierStep)))
    const rec = { id: 'ws' + (W.nextId++), defId: null, kind: 'lineage', origin: 'inherited',
                  name: name || 'Nameless Sect', tier, temper: WORLD_SECT_TEMPERS[0], leader: L.steward,
                  buildings: { ...(buildings || {}) }, hallLevel: hallLevel || 1,
                  maxBuildingLevel: SECT_BUILDING_MAX_LEVEL, maxHall: SECT_HALL_LEVELS.length,
                  disciples: Math.max(L.minDisciples, discipleCount || 0),
                  stance: L.stance, deeds: [], sworn: false, bornYear: yr, lastRaisedYear: 0, alive: true,
                  lineageOf: this._s.self?.id || null, founderName: this._s.name || '', leaderSince: yr, lastLost: null }
    rec.deeds.push({ year: yr, text: `founded by ${rec.founderName}; passes to ${rec.leader}` })
    return rec
  }

  // Phase 43b: who comes for you in a war — a real sect, weighted by how much it hates you. Sworn allies never; your
  // own joined sect never. If no one is left, a new rival is born to do it.
  _wsWarFoe(member) {
    const S = WORLD_SECTS, mine = member ? this._wsMine() : null
    const cands = this._wsAll().filter(r => r.alive && !r.sworn && r !== mine)
    const wt = r => (1 + Math.max(0, -r.stance) / S.hostilityDiv) * (r.kind === 'joinable' ? 1 : S.rivalWeight) * (r.grudge && !member ? SECT_RAZE.remnant.warWeight : 1)   // 43f: a remnant's feud
    const total = cands.reduce((a, r) => a + wt(r), 0)
    if (!total) {
      const r = this._wsNewRival()
      this._wsChron(`A new sect raises its gate: the ${r.name}, led by ${r.leader}.`, r.id)
      return r
    }
    let roll = Math.random() * total
    for (const r of cands) { roll -= wt(r); if (roll <= 0) return r }
    return cands[cands.length - 1]
  }
  // The sect a war is bound to: by id, else (a hand-set or pre-43b war) by name. null when none is found.
  _wsWarEnemy() {
    const w = this._s.sectWar
    return this._wsRec(w?.enemyId) || (w?.enemyName ? this._wsAll().find(x => x.alive && x.name === w.enemyName) : null) || null
  }
  // Phase 43c: how much stronger the bound foe is than your side, as the enemy-strength multiplier both resolvers and
  // sectWarOdds() read. Own war: your Might (playerMight) vs theirs. Member war: your joined sect's own Might vs theirs.
  // ratio 1 = an even match (also the fallback when no record is bound — pre-43b wars, hand-set test wars).
  _warMightRatio(member) {
    const ph = this._s.sectWar?.phase
    const foe = ph === 'scouting' || ph === 'preparing' ? this._wsWarEnemy() : null   // at peace: no foe yet → even
    const mine = member ? this._wsMine() : null
    const them = foe ? worldSectMight(foe) : 0
    const us = member ? (mine ? worldSectMight(mine) : 0) : this.playerMight()
    if (!foe || !us || !them) return { ratio: 1, foe, them, us }
    const W = WORLD_SECTS.war, rival = this._rivalWar(foe)   // 4.10b: your rival leads them
    return { ratio: Math.max(W.ratioMin, Math.min(W.ratioMax, Math.pow(them / us, W.ratioExp) * (rival ? rival.mult : 1))), foe, them, us, rival }
  }
  // The sect remembers the war, and its mountain shows it (43c): a foe that loses burns one hall a level; a foe that
  // wins raises one with the spoils (never past its own caps). Returns what changed, for the log + the Last war card.
  _wsWarResult(win, member) {
    const r = this._wsWarEnemy()
    if (!r) return null
    this._rivalWarBeat(r, win)   // 4.10b: your rival led them
    if (win && !member && this._s.sectWar?.razeVow) return this._wsRaze(r)   // Phase 43f: the vow is kept
    const S = WORLD_SECTS
    const where = member ? `the ${this._sectDef()?.name || 'your sect'}` : this._s.ownSect?.name || 'your mountain'
    const nameOf = id => SECT_BUILDINGS.find(b => b.id === id)?.name || id
    let hall = null
    if (win) {
      r.disciples = Math.round(r.disciples * (1 - S.warDiscipleLoss))
      const id = this._wsSetback(r)
      if (id) hall = { burned: true, name: nameOf(id), level: r.buildings[id] || 0 }
      this._wsDeed(r, S.stanceWarWonAgainst, `${member ? 'lost a war to your sect' : 'lost a war against you'}${hall ? `; their ${hall.name} burned` : ''}`)
      this._wsChron(`The ${r.name} is thrown back from ${where}${hall ? `, and its ${hall.name} burns behind it` : ''}.`, r.id)
    } else {
      const g = this._wsGrow(r)
      if (g) hall = { raised: true, name: g.hall ? 'Sect Hall' : nameOf(g.buildingId), level: g.level }
      this._wsDeed(r, S.stanceWarBeatYou, `${member ? 'beat your sect in war' : 'broke through your defenses'}${hall ? `; raised their ${hall.name} on the spoils` : ''}`)
      this._wsChron(`The ${r.name} breaks ${where} in war${hall ? ` and raises its ${hall.name} on the spoils` : ''}.`, r.id)
      // 43d: a member war lost — they raid your sect's mountain on the way out (a hall falls a level → the levy)
      const mine = member ? this._wsMine() : null
      if (mine) this._wsSetback(mine, `The ${r.name} raids the mountain`)
    }
    const might = worldSectMight(r)
    if (hall) this.addEvent({ type: win ? 'positive' : 'negative', text: win
      ? `The ${r.name}'s ${hall.name} burns as they flee${hall.level ? ` (now Lv.${hall.level})` : ' to its foundations'}. Their Might falls to ${might}.`
      : `On your spoils the ${r.name} raises its ${hall.name} to Lv.${hall.level}. Their Might grows to ${might}.` })
    return hall ? { ...hall, sect: r.name, might } : { sect: r.name, might }
  }

  // One ledger row: what the UI shows for a sect (also the player's own founded sect, as a pseudo-row).
  _wsRow(r) {
    const S = WORLD_SECTS, might = worldSectMight(r)
    const band = S.mightBands.find(([max]) => might < max)[1]
    const st = S.stanceBands.find(([max]) => r.stance < max)
    const mine = this._wsMine()
    return { id: r.id, name: r.name, defId: r.defId, kind: r.kind, origin: r.origin, tier: r.tier, leader: r.leader, leaderId: this._wsLeader(r)?.id || null,
      temper: PERSONALITIES.find(p => p.id === r.temper)?.name || '', might, band,
      stance: r.stance, stanceLabel: st[1], stanceTone: st[2], sworn: !!r.sworn, mine: r === mine,
      hallLevel: r.hallLevel, maxHall: r.maxHall, maxBuildingLevel: r.maxBuildingLevel, disciples: r.disciples,
      levels: this._wsLevels(r), built: Object.values(r.buildings).filter(v => v > 0).length,
      buildings: SECT_BUILDINGS.map(b => ({ id: b.id, name: b.name, level: r.buildings[b.id] || 0 })),
      deeds: [...r.deeds].reverse(), bornYear: r.bornYear,
      grudge: !!r.grudge, ashOf: r.ashOf || null,   // 43f: reborn from ashes you made (and still feuding)
      lineage: r.kind === 'lineage', founderName: r.founderName || null, leaderSince: r.leaderSince || null,   // 46b/c
      blessing: r.defId ? wsBlessingFactor(r).factor : null,   // 43d: how much of its blessing it can give (joinable sects)
      atCap: r.hallLevel >= r.maxHall && SECT_BUILDINGS.every(b => (r.buildings[b.id] || 0) >= r.maxBuildingLevel) }
  }

  // Public (UI): the ledger — every living sect ranked by Might, your own founded sect among them.
  worldSectsInfo() {
    const s = this._s, W = s.world?.sects
    if (!W) return null
    const rows = W.list.filter(r => r.alive).map(r => this._wsRow(r))
    const o = s.ownSect
    if (o?.founded) {
      const might = this.playerMight()
      rows.push({ id: 'own', name: o.name, kind: 'own', own: true, might, band: WORLD_SECTS.mightBands.find(([max]) => might < max)[1],
        hallLevel: o.hallLevel, maxHall: SECT_HALL_LEVELS.length, maxBuildingLevel: SECT_BUILDING_MAX_LEVEL, disciples: o.disciples.length,
        levels: Object.values(o.buildings).reduce((a, v) => a + (v > 0 ? v : 0), 0), built: Object.values(o.buildings).filter(v => v > 0).length,
        buildings: SECT_BUILDINGS.map(b => ({ id: b.id, name: b.name, level: o.buildings[b.id] || 0 })), deeds: [] })
    }
    rows.sort((a, b) => b.might - a.might)
    return { rows, chronicle: [...W.chronicle].reverse(), born: W.born, fallen: W.fallen, playerMight: this.playerMight(),
             event: !!W.event, ...this.razeWorldInfo() }
  }

  // ── Phase 43d: the blessing scales with the sect (docs/systems/npc-sects.md → "43d") ──────────────────────────
  // Public: what you draw from the sect you joined. k = factor (its halls) × share (your rank). null in no sect.
  sectBlessing() {
    const s = this._s, def = this._sectDef()
    if (!def) return null
    const r = this._wsMine(), B = SECT_BLESSING
    const f = r ? wsBlessingFactor(r) : { factor: 1, raw: 1, levels: 0, hall: 0 }
    const share = B.rankShare[Math.max(0, Math.min(B.rankShare.length - 1, s.sect.rank || 0))]
    return { factor: f.factor, raw: f.raw, levels: f.levels, hall: f.hall, share, k: Math.round(f.factor * share * 100) / 100, recId: r?.id || null }
  }

  // Stones to raise one level of your sect's hall `id` ('hall' = its Sect Hall), or null at its cap.
  _fundCost(r, id) {
    const F = SECT_BLESSING.fund, mul = F.costMult * (1 + F.perTier * ((r.tier || 1) - 1))
    if (id === 'hall') {
      const up = r.hallLevel < r.maxHall ? SECT_HALL_LEVELS[r.hallLevel - 1]?.upgradeStones : null
      return up ? Math.round(up * mul) : null
    }
    const b = SECT_BUILDINGS.find(x => x.id === id), lv = r.buildings[id] || 0
    if (!b || lv >= r.maxBuildingLevel) return null
    return Math.round(b.stones * Math.pow(SECT_BUILDING_UPGRADE_MULT, lv) * mul)
  }
  // What one more level of `id` would do to your blessing.
  _fundAfter(r, id) {
    const t = { ...r, buildings: { ...r.buildings }, hallLevel: r.hallLevel }
    if (id === 'hall') t.hallLevel++; else t.buildings[id] = (t.buildings[id] || 0) + 1
    return Math.round(wsBlessingFactor(t).factor * this.sectBlessing().share * 100) / 100
  }

  // Public (UI): the blessing card — the factor and its parts, your rank's share, the scaled effects, and every hall
  // you could pay to raise (cost, what it does to the blessing, the lock reason).
  sectBlessingInfo() {
    const s = this._s, def = this._sectDef(), bl = this.sectBlessing()
    if (!def || !bl) return null
    const B = SECT_BLESSING, F = B.fund, r = this._wsMine(), rank = s.sect.rank || 0
    const fund = id => {
      const cost = this._fundCost(r, id), level = id === 'hall' ? r.hallLevel : (r.buildings[id] || 0)
      const max = id === 'hall' ? r.maxHall : r.maxBuildingLevel
      const lock = cost == null ? 'At the height this sect can bear'
        : id === 'hall' && rank < F.hallMinRank ? `${SECT_RANKS[F.hallMinRank].name} and above`
        : cost > s.spiritStones ? `${Math.ceil(cost - s.spiritStones)} stones short` : ''
      return { id, name: id === 'hall' ? 'Sect Hall' : SECT_BUILDINGS.find(b => b.id === id).name, level, max, cost,
               after: cost == null ? null : this._fundAfter(r, id), contrib: cost == null ? 0 : Math.max(1, Math.floor(cost * F.contribRate)),
               lock, lost: r.lastLost?.buildingId === id }
    }
    // (r is null when the joined sect has no world record — the card still draws, with no halls to fund; final QA fix)
    const top = r ? { ...r, buildings: Object.fromEntries(SECT_BUILDINGS.map(b => [b.id, r.maxBuildingLevel])), hallLevel: r.maxHall } : null
    const nextRank = SECT_RANKS[rank + 1]
    return { name: def.name, factor: bl.factor, share: bl.share, k: bl.k, levels: bl.levels, hallLevel: (bl.hall || 0) + 1,
      parts: [{ label: 'Every sect blesses its own', val: B.base },
              { label: `${bl.levels} hall level${bl.levels === 1 ? '' : 's'} × ${B.perLevel}`, val: B.perLevel * bl.levels },
              { label: `Sect Hall Lv.${bl.hall + 1}`, val: B.perHall * bl.hall }],
      capped: bl.raw > B.max ? 'max' : bl.raw < B.min ? 'min' : null, min: B.min, max: B.max,
      rankName: SECT_RANKS[rank].name, nextRankName: nextRank?.name || null, nextShare: nextRank ? B.rankShare[rank + 1] : null,
      reach: top ? wsBlessingFactor(top).factor : bl.factor, effects: sectBlessingEffects(def.effects, bl.k), full: def.effects,
      suppressed: !!s.derived?.sectBuffSuppressed,
      halls: r ? [...SECT_BUILDINGS.map(b => fund(b.id)), fund('hall')] : [], stance: r ? this._wsRow(r) : null,
      lost: r?.lastLost ? { name: SECT_BUILDINGS.find(b => b.id === r.lastLost.buildingId)?.name || 'hall', year: r.lastLost.year } : null }
  }

  // Public: pay to raise one level of your joined sect's hall `id` ('hall' = its Sect Hall). Its halls grow (never
  // past its caps), so your blessing grows; you earn Contribution and the sect remembers it.
  fundSectHall(id) {
    const s = this._s, def = this._sectDef(), r = this._wsMine()
    if (!def || !r) return { ok: false, reason: 'no_sect' }
    if (id !== 'hall' && !SECT_BUILDINGS.some(b => b.id === id)) return { ok: false, reason: 'unknown' }
    const F = SECT_BLESSING.fund
    if (id === 'hall' && (s.sect.rank || 0) < F.hallMinRank) return { ok: false, reason: 'rank' }
    const cost = this._fundCost(r, id)
    if (cost == null)            return { ok: false, reason: 'max_level' }
    if (s.spiritStones < cost)   return { ok: false, reason: 'stones' }
    const before = this.sectBlessing().k
    s.spiritStones -= cost
    let name, level
    if (id === 'hall') { r.hallLevel++; name = 'Sect Hall'; level = r.hallLevel }
    else { r.buildings[id] = (r.buildings[id] || 0) + 1; name = SECT_BUILDINGS.find(b => b.id === id).name; level = r.buildings[id] }
    r.lastRaisedYear = Math.floor(s.world.year)
    const W = s.world.sects
    let levy = ''
    if (r.lastLost?.buildingId === id) {
      r.lastLost = null
      if (W.event?.id === 'levy' && W.event.sectId === r.id) { W.event = null; levy = ' The levy is settled.' }
    }
    const gained = Math.max(1, Math.floor(cost * F.contribRate))
    s.sect.contribution += gained
    this._wsDeed(r, F.stance, `you paid to raise their ${name} to Lv.${level}`)
    this._wsChron(`With ${s.name}'s stones, the ${r.name} raises its ${name} to Lv.${level}.`, r.id)
    this._recalc()
    const after = this.sectBlessing().k
    this.addEvent({ type: 'positive', text: `Your stones raise the ${def.name}'s ${name} to Lv.${level} (−${cost} stones, +${gained} Contribution). The blessing on you grows ×${before.toFixed(2)} → ×${after.toFixed(2)}.${levy}` })
    this._notify()
    return { ok: true, cost, gained, name, level, before, after }
  }

  // ── Phase 43e: the sect master + taking the sect over (docs/systems/npc-sects.md → "43e") ─────────────────────
  // The master is a world person (s.sect.masterId), minted when you join (or lazily, the first time anything asks).
  // Their regard for you is the sect record's stance (43b): your service and your answers move it.
  _sectMaster(mint = true) {
    const s = this._s, r = this._wsMine()
    if (!s.sect?.id || !r) return null
    // Phase 28 (4.2): the master is the sect's seated registry person (living-world.md §5).
    let p = this._wsLeader(r)
    if (!p) {
      const had = s.sect.masterId ? this.person(s.sect.masterId) : null
      if (had && had.alive !== false && Persons.fullName(had) === r.leader) { this._wsSeat(r, had); p = had }
    }
    if (!p && !mint) return null
    if (!p) { this._wsEnsurePeople(r); p = this._wsLeader(r) }
    if (!p) return null
    p.sectRecId = r.id
    s.sect.masterId = p.id
    return p
  }
  _masterMight(p) { return Math.round(10 + 6 * (p?.stageIndex || 0)) }   // the same personal scale as playerMight()

  // The master's own call on a fight to the death (a %), the number the card shows before you challenge.
  _masterLethalPct(p, regard) {
    const M = SECT_MASTER
    const w = M.lethalBase + (LETHAL_PERSONALITY_BONUS[p.personality] || 0) + Math.max(0, M.regardPivot - regard) * M.regardWeight
      + Math.max(0, -(p.morality ?? 0)) * LETHAL_MORALITY_WEIGHT
    return Math.round(Math.max(LETHAL_CHANCE_RANGE[0], Math.min(LETHAL_CHANCE_RANGE[1], w)))
  }
  _petitionOdds(p, regard) {
    const P = SECT_MASTER.petition, me = this.playerMight(), them = this._masterMight(p)
    return Math.max(P.min, Math.min(P.max, P.base + P.perRegard * Math.max(0, regard) + P.mightWeight * me / (me + them)))
  }

  // Public (UI): can you challenge your sect's master now? A Grand Elder only, NO realm gate (user 2026-10-01).
  canChallengeSectMaster() {
    const s = this._s
    if (!s.sect?.id) return { ok: false, reason: 'no_sect' }
    if ((s.sect.rank || 0) < SECT_RANKS.length - 1) return { ok: false, reason: 'rank' }
    if (s.family?.fight) return { ok: false, reason: 'busy' }
    const ready = s.sect.challengeReadyYear
    if (ready != null && s.world.year < ready) return { ok: false, reason: 'cooldown', readyYear: ready }
    const master = this._sectMaster()
    if (!master) return { ok: false, reason: 'no_master' }
    return { ok: true, master }
  }
  canPetitionSectMaster() {
    const s = this._s
    if (!s.sect?.id) return { ok: false, reason: 'no_sect' }
    if ((s.sect.rank || 0) < SECT_RANKS.length - 1) return { ok: false, reason: 'rank' }
    if (s.family?.fight) return { ok: false, reason: 'busy' }
    const ready = s.sect.petitionReadyYear
    if (ready != null && s.world.year < ready) return { ok: false, reason: 'cooldown', readyYear: ready }
    const master = this._sectMaster()
    return master ? { ok: true, master } : { ok: false, reason: 'no_master' }
  }

  // Public (UI): the master card — who they are, their regard, the challenge (odds, the chance they make it lethal,
  // what a loss costs) and the petition (odds), each with its lock reason.
  sectMasterInfo() {
    const s = this._s, r = this._wsMine(), p = this._sectMaster()
    if (!p || !r) return null
    const regard = r.stance || 0, st = WORLD_SECTS.stanceBands.find(([max]) => regard < max)
    const ch = this.canChallengeSectMaster(), pe = this.canPetitionSectMaster(), yr = s.world.year
    const lockOf = c => c.ok ? '' : c.reason === 'rank' ? `${SECT_RANKS[SECT_RANKS.length - 1].name} only`
      : c.reason === 'cooldown' ? `Heal and wait: about ${Math.max(1, Math.ceil(c.readyYear - yr))} more year${Math.ceil(c.readyYear - yr) === 1 ? '' : 's'}`
      : c.reason === 'busy' ? 'You are already in a fight' : 'Not now'
    const odds = this.personFightOdds(p, 'sectmaster', false)
    const M = SECT_MASTER, T = M.takeover, hallCap = SECT_HALL_LEVELS[0].cap
    return { id: p.id, name: Persons.fullName(p), given: p.given, stage: p.stageIndex || 0, temper: PERSONALITIES.find(x => x.id === p.personality)?.name || '',
      personality: p.personality, regard, regardLabel: st[1], regardTone: st[2], rank: s.sect.rank || 0, grand: (s.sect.rank || 0) >= SECT_RANKS.length - 1,
      record: this.personRecord(p), myMight: this.playerMight(), masterMight: this._masterMight(p),
      challenge: { ok: ch.ok, lock: lockOf(ch), odds: odds?.chance ?? 0, lethalPct: this._masterLethalPct(p, regard), lossRank: SECT_RANKS[M.lossRank].name },
      petition: { ok: pe.ok, lock: lockOf(pe), odds: this._petitionOdds(p, regard) },
      prize: { halls: Object.values(r.buildings).filter(v => v > 0).length, stay: Math.round(hallCap * T.stayFrac),
               oldGuard: T.oldGuard, oldGuardPeaceful: T.oldGuardPeaceful, library: (s.sect.shelf || []).length } }
  }

  // You call out your master. They choose: to the death, or until one yields (their temper, cruelty, regard).
  challengeSectMaster() {
    const c = this.canChallengeSectMaster()
    if (!c.ok) return c
    const s = this._s, p = c.master, r = this._wsMine(), yr = Math.floor(s.world.year)
    const lethal = Math.random() * 100 < this._masterLethalPct(p, r?.stance || 0)
    s.sect.challenges = (s.sect.challenges || 0) + 1
    this.addEvent({ type: 'special', text: `Year ${yr}: before the whole ${this._sectDef().name}, you call out ${Persons.fullName(p)} for the master's seat. ${lethal ? 'They answer: to the death.' : 'They answer: until one yields.'}` })
    this._startFight('sectmaster', p, lethal)
    return { ok: true, fight: true, lethal }
  }

  // You ask your master to step down. No blood: their regard and your Might against theirs decide it.
  petitionSectMaster() {
    const c = this.canPetitionSectMaster()
    if (!c.ok) return c
    const s = this._s, p = c.master, r = this._wsMine(), M = SECT_MASTER, yr = Math.floor(s.world.year)
    const odds = this._petitionOdds(p, r?.stance || 0)
    if (Math.random() < odds) {
      this.addEvent({ type: 'special', text: `Year ${yr}: ${Persons.fullName(p)} hears you out in the Sect Hall, long and silent. Then they rise, and set the master's seal in your hands.` })
      p.role = 'elder'
      this._takeOverSect('peaceful', p, null)
      return { ok: true, success: true, odds }
    }
    s.sect.petitionReadyYear = yr + this._randInt(M.petitionCooldownYears)
    this._wsDeed(r, M.petition.failStance, 'you asked them to step down')
    this.addEvent({ type: 'negative', text: `Year ${yr}: ${Persons.fullName(p)} hears you out, and laughs. "Ask me again when you are worth the seat." Their regard for you cools (${M.petition.failStance}).` })
    this._recalc(); this._notify()
    return { ok: true, success: false, odds }
  }

  // The fight's end (from _finishFight). Win: the sect is yours (an exiled master raises a splinter; a slain one does
  // not). Lose: the master's call — death, or demoted to Elder with a cooldown and a colder regard.
  _sectmasterOutcome(p, lethal, res) {
    const s = this._s, yr = Math.floor(s.world.year), r = this._wsMine(), M = SECT_MASTER
    this._applyLethalTrauma(res, lethal)
    if (res.winner.id === s.self.id) {
      let splinter = null
      if (res.died) { this._killPerson(p.id, yr, 'sect_master', { seat: false }); s.karma = Math.max(0, s.karma + CHALLENGE_KARMA_DEATH) }
      else splinter = this._exileMaster(p, r)
      this.addEvent({ type: 'special', text: res.died
        ? `Year ${yr}: ${Persons.fullName(p)} falls on the floor of their own Sect Hall. The seat is yours.`
        : `Year ${yr}: you beat ${Persons.fullName(p)} to their knees and send them down the mountain. The seat is yours.` })
      this._takeOverSect(res.died ? 'slain' : 'exiled', p, splinter)
      return res.died ? 'won_lethal' : 'won_nonlethal'
    }
    if (res.died) {
      this.addEvent({ type: 'negative', text: `Year ${yr}: ${Persons.fullName(p)}'s blade is faster. Your bid for the master's seat ends your life.` })
      this._recalc(); this._notify()
      this._die('sect_master')
      return 'lost_lethal'
    }
    s.sect.rank = Math.min(s.sect.rank || 0, M.lossRank)
    s.sect.contribution = Math.min(s.sect.contribution, SECT_RANKS[M.lossRank].minContribution)
    s.sect.challengeReadyYear = yr + this._randInt(M.challengeCooldownYears)
    this._wsDeed(r, M.lossStance, `you challenged ${p.given} for the seat, and lost`)
    this.addEvent({ type: 'negative', text: `Year ${yr}: ${Persons.fullName(p)} beats you down and lets you live, and strips you to ${SECT_RANKS[M.lossRank].name} before the sect. Heal before you try again.` })
    this._recalc(); this._notify()
    return 'lost_nonlethal'
  }

  // A spared master is driven out and raises a splinter sect, its stance set by how you left them (raised → a debt).
  _exileMaster(p, r) {
    const E = SECT_MASTER.exile, W = this._s.world?.sects
    if (!W) return null
    const stance = E[p.feud] ?? E.default
    const taken = new Set(W.list.filter(x => x.alive).map(x => x.name))
    let name = `${p.family} ${WORLD_SECT_SPLINTER.suffixes[0]}`
    for (const suf of WORLD_SECT_SPLINTER.suffixes) { name = `${p.family} ${suf}`; if (!taken.has(name)) break }
    const sp = this._wsNewRival({ name, kind: 'splinter', origin: 'exiled', tier: WORLD_SECT_SPLINTER.tier, maxBuildingLevel: WORLD_SECT_SPLINTER.maxBuildingLevel,
      maxHall: WORLD_SECT_SPLINTER.maxHall, leader: Persons.fullName(p), temper: p.personality || 'grumpy', disciples: 4, stance })
    sp.deeds.push({ year: Math.floor(this._s.world.year), text: `you took ${r?.name || 'their sect'} from them`, delta: stance })
    p.sectRecId = sp.id
    this._wsSeat(sp, p); p.role = 'exile'   // Phase 28: the same person leads the splinter
    this._wsChron(`${Persons.fullName(p)}, cast out of the ${r?.name || 'sect'}, raises the ${sp.name}.`, sp.id)
    return sp
  }

  _newDisciple(level = 1) {
    const rec = { ...this._genRecruit(), level, xp: 0, branchId: null, role: 'disciple', kin: false }
    rec.personality = disciplePersonality(rec.id)
    return rec
  }

  // The sect becomes yours: a founded sect named for it, every hall it had kept at Lv.1 (user 2026-10-01: "the sect
  // buildings should be low level"), its Sect Hall Lv.1, the manuals on its shelf as your library, a share of its seats
  // filled at once, and an old guard waiting on your word. Its world record ends (you lead it now), s.sect clears (so
  // the joined blessing can never double-apply) and the war side becomes your own.
  _takeOverSect(how, master, splinter) {
    const s = this._s, def = this._sectDef(), r = this._wsMine(), yr = Math.floor(s.world.year), T = SECT_MASTER.takeover
    if (s.sectWar?.beastId) this._releaseWarBeast(0)
    const buildings = Object.fromEntries(Object.entries(r?.buildings || {}).filter(([, v]) => v > 0).map(([k]) => [k, 1]))
    const o = { ...this._blankOwnSect(), founded: true, name: def.name, foundedAt: Date.now(), hallLevel: 1, buildings,
                library: [...(s.sect.shelf || [])], takenOver: { defId: def.id, year: yr, how, from: Persons.fullName(master), tier: r?.tier || 1 } }
    const stay = Math.max(1, Math.round(SECT_HALL_LEVELS[0].cap * T.stayFrac))
    for (let i = 0; i < stay; i++) o.disciples.push(this._newDisciple(1))
    const n = this._randInt(how === 'peaceful' ? T.oldGuardPeaceful : T.oldGuard)
    o.oldGuard = { n, year: yr, how, splinterId: splinter?.id || null, master: Persons.fullName(master),
                   members: Array.from({ length: n }, () => this._newDisciple(T.oldGuardLevel)) }
    s.ownSect = o
    if (r) {
      r.alive = false; r.fate = 'taken'
      const W = s.world.sects
      if (W.event?.sectId === r.id) W.event = null
      W.list = W.list.filter(x => x.alive)
      this._wsChron(`${s.name} takes the ${r.name} from ${Persons.fullName(master)}${how === 'peaceful' ? ', who hands over the seal' : ''}.`, null)
    }
    s.sect = { id: null, rank: 0, contribution: 0, activeMissions: [] }
    s.sectWar = this._blankSectWar('own')
    this._claimFirst('took_sect')
    this.addEvent({ type: 'special', text: `You are master of the ${def.name}. Its halls stand at Lv.1 under your hand; ${stay} disciples kneel at once, and ${n} of the old guard wait on your word in Sect → Overview.` })
    this._recalc(); this._notify()
  }

  // Public (UI): the old guard's fate — 'win' (stones; they stay, as a branch under their eldest), 'go' (about half
  // stay; the rest walk to the exiled master's splinter, if there is one), 'purge' (karma; none stay, none go to them).
  oldGuardInfo() {
    const s = this._s, o = s.ownSect, g = o?.oldGuard
    if (!o?.founded || !g) return null
    const T = SECT_MASTER.takeover, cost = T.winOverStones * (o.takenOver?.tier || 1) * g.n
    const sp = g.splinterId ? this._wsRec(g.splinterId) : null
    return { n: g.n, how: g.how, master: g.master, splinter: sp ? sp.name : null, branchOk: o.branches.length < SECT_BRANCH.maxBranches,
      choices: [{ id: 'win', cost, lock: cost > s.spiritStones ? `Needs ${cost} stones` : '', karma: T.winOverKarma, loyalty: T.winOverLoyalty },
                { id: 'go', stay: T.letGoStay },
                { id: 'purge', karma: T.purgeKarma }] }
  }
  answerOldGuard(choice) {
    const s = this._s, o = s.ownSect, info = this.oldGuardInfo()
    if (!info) return { ok: false, reason: 'none' }
    const c = info.choices.find(x => x.id === choice)
    if (!c) return { ok: false, reason: 'bad_choice' }
    if (c.lock) return { ok: false, reason: 'stones' }
    const T = SECT_MASTER.takeover, g = o.oldGuard, sp = g.splinterId ? this._wsRec(g.splinterId) : null
    let kept = [], gone = 0, text
    if (choice === 'win') {
      s.spiritStones -= c.cost
      s.karma = Math.min(100, s.karma + T.winOverKarma)
      kept = g.members
      text = `You open the treasury to the old guard of ${g.master}. They bow, slowly, and stay`
    } else if (choice === 'go') {
      kept = g.members.filter(() => Math.random() < T.letGoStay)
      gone = g.n - kept.length
      if (sp && gone) sp.disciples += gone
      text = `You tell the old guard they are free to go. ${kept.length} stay${gone ? `; ${gone} walk down the mountain${sp ? ` to ${g.master}'s ${sp.name}` : ''}` : ''}`
    } else {
      s.karma = Math.max(0, s.karma + T.purgeKarma)
      gone = g.n
      text = `You purge the old guard of ${g.master}. No one who knelt to them is left on the mountain`
    }
    // The ones who stay: a branch under their eldest (Phase 45 seats), else your own hall while seats allow
    let branch = null
    if (kept.length) {
      for (const d of kept) o.disciples.push(d)
      if (choice === 'win' && kept.length >= 2 && o.branches.length < SECT_BRANCH.maxBranches) {
        branch = this._makeBranch(kept[0])
        branch.loyalty = T.winOverLoyalty
        for (const d of kept.slice(1)) d.branchId = branch.id
      } else {
        const cap = SECT_HALL_LEVELS[Math.min(o.hallLevel, SECT_HALL_LEVELS.length) - 1].cap
        const over = this._mainRoster().length - cap
        if (over > 0) {   // no seat for them: they walk too (to the exile, when there is one)
          const ids = new Set(kept.slice(-over).map(d => d.id))
          o.disciples = o.disciples.filter(d => !ids.has(d.id)); kept = kept.filter(d => !ids.has(d.id))
          gone += ids.size; if (sp && choice !== 'purge') sp.disciples += ids.size
        }
      }
    }
    o.oldGuard = null
    this.addEvent({ type: choice === 'purge' ? 'negative' : 'special', text: `${text}.${branch ? ` They keep together as the ${branch.name}, under ${kept[0].name} (loyalty ${T.winOverLoyalty}).` : ''}${c.karma ? ` (${c.karma > 0 ? '+' : ''}${c.karma} karma)` : ''}` })
    this._recalc(); this._notify()
    return { ok: true, kept: kept.length, gone, branch }
  }

  // ── Phase 43h: sect relations — what you can DO to another sect (docs/systems/npc-sects.md → "43h") ───────────
  // Every action is a player button on the sect's detail page (SectDetail). Only the other sect's reply rolls, and its
  // odds are shown first. Each action leaves a deed (stance ± with the reason) and a per-sect cooldown (r.acted).
  _relRole() { const s = this._s; return s.ownSect?.founded ? 'leader' : s.sect?.id ? 'member' : 'none' }
  _relYear() { return Math.floor(this._s.world?.year || 0) }
  _relWait(r, id) { const until = r.acted?.[id] || 0; return Math.max(0, until - this._relYear()) }
  _relDone(r, id) { (r.acted ||= {})[id] = this._relYear() + (SECT_RELATIONS[id]?.cooldown || 0) }
  _relStance(spec, r) { return typeof spec === 'number' ? spec : this._wsStanceOf(spec, r) }
  _relWarOn() { const p = this._s.sectWar?.phase; return p === 'scouting' || p === 'preparing' }

  // A war that starts now against `r` — you declared it, your master took up your urging, or they answered an insult.
  // It enters the same state machine (scouting → preparing → the resolver), so odds, orders and the resolvers all apply.
  _openWarOn(r, member, byYou) {
    const s = this._s, w = s.sectWar, now = Date.now()
    w.phase = 'scouting'; w.nextWarAt = now
    w.scoutEndsAt = now + (member ? MEMBER_WAR_SCOUT_SECONDS : WAR_SCOUT_SECONDS) * 1000
    w.enemyId = r.id; w.enemyName = r.name; w.enemyTier = r.tier || 1
    w.allyId = null; w.reinforced = false; w.answered = false; w.chestStones = 0; w.pillsGiven = 0; w.beastId = null; w.seen = true
    w.declaredByYou = !!byYou
    w.razeVow = false; w.razeSet = false   // Phase 43f
    this._noteEnemy({ kind: 'sect', name: `the ${r.name}`, why: byYou ? 'you declared war on them' : 'went to war with your sect' })
    this._applyWarOrders()
  }
  // The world watches an unprovoked blow: every other sect that thinks well of you thinks a little less of you.
  _relOthersCool(r, delta) {
    for (const x of this._wsAll()) if (x.alive && x !== r && x.stance > 0) x.stance = Math.max(-100, x.stance + delta)
  }
  // The manual a sect will trade this year (rolled once a year; its grade by the sect's tier).
  _relOffer(r) {
    const yr = this._relYear()
    if (!r.offer || r.offer.year !== yr || !ARTS[r.offer.artId]) {
      const W = SECT_RELATIONS.trade.offerWeights[Math.max(0, Math.min(4, (r.tier || 1) - 1))]
      r.offer = { artId: this._rollArt(W), year: yr }
    }
    return r.offer.artId
  }
  // A disciple of theirs to spar with (a member's visit), kept for the year; your realm ± 1. Not a world person.
  _relSparFoe(r) {
    const s = this._s, yr = this._relYear()
    if (!r.sparFoe || r.sparFoe.year !== yr) {
      const stage = Math.max(0, Math.min(CULTIVATION_STAGES.length - 2, (s.stageIndex || 0) + this._randInt([-1, 1])))
      const p = this._genPerson({ family: Persons.rollSurname(), bornYear: yr - this._randInt([18, 60]), stage, role: 'duelist' })
      p.sectRecId = r.id
      r.sparFoe = { year: yr, p }
    }
    return r.sparFoe.p
  }
  _relOdds(id, r) {
    const s = this._s, A = SECT_RELATIONS[id], clamp = v => Math.max(0.05, Math.min(0.95, v))
    if (id === 'alliance') return clamp(A.odds.base + A.odds.perStance * Math.max(0, r.stance - A.minStance) + (A.odds.temper[r.temper] || 0))
    if (id === 'tribute') { const me = this.playerMight(), them = worldSectMight(r); return clamp(me / (me + them)) }
    if (id === 'spy') {
      const gap = (s.stageIndex || 0) - (r.tier || 1) * 4
      return clamp(A.odds.base + A.odds.perStageGap * gap + A.odds.perArrayLevel * (r.buildings.defensive_array || 0) + (A.odds.you[s.personality?.id] || 0))
    }
    if (id === 'urge') {
      const mine = this._wsMine(), m = this._sectMaster(false)
      return clamp(A.odds.base + A.odds.perRegard * Math.max(0, mine?.stance || 0) + (r.stance <= -20 ? A.odds.hated : 0) + (A.odds.master[m?.personality] || 0))
    }
    return null
  }

  // Public (UI): one sect's page — the sect, you against it, and every action you may take, each with its cost, odds,
  // effects and lock reason. Actions depend on who you are (a leader, a member, neither).
  sectRelationsInfo(recId) {
    const s = this._s, r = this._wsRec(recId)
    if (!r) return null
    this._wsEnsurePeople(r)   // Phase 28: a newborn sect's master + elders are real before the page names them
    const role = this._relRole(), mine = this._wsMine(), isMine = r === mine, R = SECT_RELATIONS, yr = this._relYear()
    const tier = r.tier || 1, sgn = n => (n > 0 ? '+' : '') + n
    const warHere = this._relWarOn() && this._wsWarEnemy() === r
    const acts = []
    const add = (id, label, bits, extra = {}) => {
      const A = R[id], wait = this._relWait(r, id)
      let lock = extra.lock || ''
      if (!lock && wait) lock = `Again in ${wait} year${wait === 1 ? '' : 's'}`
      if (!lock && extra.cost > s.spiritStones) lock = `Needs ${extra.cost} stones`
      acts.push({ id, glyph: A.glyph, label, bits, cost: extra.cost || 0, odds: extra.odds ?? null, lock, confirm: extra.confirm || null, group: extra.group || 'diplomacy', ...extra })
    }
    if (!isMine && role !== 'none') {
      const g = R.gift, gc = g.stonesPerTier * tier
      add('gift', 'Send a gift', [{ t: `+${this._relStance(g.stance, r)} with them`, tone: 'up' }], { cost: gc })
    }
    if (role === 'leader' && !isMine) {
      const al = R.alliance
      if (!r.sworn) add('alliance', 'Propose a sworn alliance', [{ t: 'they never march on you', tone: 'up' }, { t: `refused: ${sgn(al.failStance)}`, tone: 'down' }],
        { odds: this._relOdds('alliance', r), lock: r.stance < al.minStance ? `They must think well of you first (${al.minStance}+, now ${sgn(r.stance)})` : '' })
      else add('breakAlliance', 'Break the alliance', [{ t: `${sgn(R.breakAlliance.stance)} with them`, tone: 'down' }, { t: `${R.breakAlliance.karma} karma`, tone: 'down' }, { t: 'others cool toward you', tone: 'down' }],
        { confirm: 'Break your sworn word? Every sect hears of it.' })
      const wr = R.war, unprov = r.stance > wr.unprovokedAbove
      const us = this.playerMight(), them = worldSectMight(r), W = WORLD_SECTS.war
      const ratio = Math.max(W.ratioMin, Math.min(W.ratioMax, Math.pow(them / Math.max(1, us), W.ratioExp)))
      add('war', 'Declare war', [{ t: `they fight at ×${ratio.toFixed(2)} of an even match (Might ${them} vs your ${us})`, tone: 'dim' },
        { t: `${sgn(wr.stance)} with them`, tone: 'down' }, ...(unprov ? [{ t: `unprovoked: ${wr.unprovokedKarma} karma, others cool`, tone: 'down' }] : [{ t: 'they wronged you first: no karma', tone: 'up' }])],
        { group: 'war', lock: r.sworn ? 'Your sworn ally: break the alliance first' : this._relWarOn() ? 'A war is already underway' : '',
          confirm: `Declare war on the ${r.name}? Your scouts go out at once; battle comes after the preparing phase, as in any war.` })
      const tb = R.tribute
      add('tribute', 'Demand tribute', [{ t: `+${tb.stonesPerTier * tier} stones`, tone: 'up' }, { t: `${sgn(this._relStance(tb.stance, r))} with them`, tone: 'down' },
        { t: `refused: ${sgn(tb.failStance)}, ${Math.round(tb.failWarChance * 100)}% they march on you`, tone: 'down' }],
        { group: 'force', odds: this._relOdds('tribute', r), vsMight: true, lock: r.sworn ? 'Not from a sworn ally' : '' })
      const sp = R.spy
      add('spy', 'Send a spy', [{ t: `steal +${sp.stonesPerTier * tier} stones or a manual`, tone: 'up' }, { t: `${sp.karma} karma`, tone: 'down' },
        { t: `caught: ${sgn(sp.failStance)}, Health ${sp.failHealth}, ${Math.round(sp.failWarChance * 100)}% they march on you`, tone: 'down' }],
        { group: 'force', odds: this._relOdds('spy', r) })
      const tr = R.trade, offer = this._relOffer(r), oa = ARTS[offer]
      const rank = id => ART_RARITY_ORDER.indexOf(ARTS[id]?.rarity)
      const yours = Object.keys(s.inventory).filter(k => k.startsWith('manual_') && s.inventory[k] > 0 && ARTS[k.slice(7)])
        .map(k => k.slice(7)).map(id => ({ id, name: ARTS[id].name, rarity: ARTS[id].rarity, ok: rank(id) >= rank(offer) - tr.gradeSlack }))
      add('trade', 'Trade manuals', [{ t: `they offer ${oa ? `${oa.name} (${ART_RARITY[oa.rarity].name})` : 'nothing'}`, tone: 'up' }, { t: `+${tr.stance} with them`, tone: 'up' }],
        { group: 'trade', offer: oa ? { id: offer, name: oa.name, rarity: oa.rarity, element: oa.element, known: !!s.arts?.known?.[offer] } : null, yours,
          lock: r.stance < tr.minStance ? `They will not trade with you (${sgn(r.stance)})` : !oa ? 'Nothing to offer' : !yours.some(y => y.ok) ? `Bring a manual of ${ART_RARITY[ART_RARITY_ORDER[Math.max(0, rank(offer) - tr.gradeSlack)]].name} grade or better` : '' })
      const po = R.poach, cap = s.derived?.discipleCap || 0
      add('poach', 'Poach a disciple', [{ t: `choose one of their ${this._relRoster(r).length} named disciples (Sect → Disciples)`, tone: '' }, { t: `${sgn(po.stance)} or worse with them`, tone: 'down' }],
        { group: 'trade', nav: 'poach', lock: this._poachLock(r) })
    }
    if (role === 'member' && !isMine) {
      const foe = this._relSparFoe(r), so = this.personFightOdds(foe, 'spar', false)
      add('spar', `Spar with ${foe.given} of the ${r.name}`, [{ t: `${Math.round((so?.chance || 0) * 100)}% to win`, tone: '' }, { t: `win: +${R.spar.contribPerTier * (mine?.tier || 1)} Contribution, +${R.spar.stance} with them`, tone: 'up' }, { t: 'until one yields', tone: '' }],
        { group: 'visit', odds: so?.chance ?? null, foeId: foe.id, lock: s.family?.fight ? 'You are already in a fight' : '' })
      const m = this._sectMaster(false)
      add('urge', `Urge ${m?.given || 'your master'} to war on them`, [{ t: `the ${this._sectDef()?.name || 'sect'} marches on them`, tone: 'up' }, { t: `refused: ${R.urge.failRegard} regard`, tone: 'down' }],
        { group: 'war', odds: this._relOdds('urge', r), lock: this._relWarOn() ? 'Your sect is already at war' : !m ? 'Your sect has no master' : '' })
    }
    const row = this._wsRow(r)
    const W = WORLD_SECTS.war, us = role === 'member' && mine ? worldSectMight(mine) : this.playerMight()
    return { sect: row, people: this.sectPeople(r.id), role, isMine, warHere, sworn: !!r.sworn, myMight: us, offer: r.offer, actions: acts, year: yr,
      ratio: Math.max(W.ratioMin, Math.min(W.ratioMax, Math.pow(row.might / Math.max(1, us), W.ratioExp))),
      blessing: r.defId ? { factor: row.blessing, def: SECTS.find(d => d.id === r.defId) } : null,
      master: isMine ? this.sectMasterInfo() : null }
  }

  // Public (UI): take action `id` toward sect `recId` (arg: the manual you give, for a trade). Every outcome is a log line
  // naming the cause; the reply (accept / refuse / caught) is theirs.
  sectAct(recId, id, arg = null) {
    const s = this._s, info = this.sectRelationsInfo(recId)
    if (!info) return { ok: false, reason: 'gone' }
    const a = info.actions.find(x => x.id === id)
    if (!a) return { ok: false, reason: 'unavailable' }
    if (a.lock) return { ok: false, reason: 'locked', lock: a.lock }
    const r = this._wsRec(recId), R = SECT_RELATIONS, A = R[id], tier = r.tier || 1, sgn = n => (n > 0 ? '+' : '') + n
    const roll = a.odds == null ? true : Math.random() < a.odds
    let text = '', ok = true, success = roll, extra = {}
    const deed = (d, t) => this._wsDeed(r, d, t)
    const answerWar = () => { if (!this._relWarOn() && s.ownSect?.founded && Math.random() < A.failWarChance) { this._openWarOn(r, false, false); return ` In answer, the ${r.name} marches on you.` } return '' }
    if (a.cost) s.spiritStones -= a.cost
    switch (id) {
      case 'gift': { const d = this._relStance(A.stance, r); deed(d, `you sent them a gift`); text = `Your gift reaches the ${r.name}; ${r.leader} accepts it (${sgn(d)}, −${a.cost} stones).`; break }
      case 'alliance':
        if (roll) { r.sworn = true; deed(A.stance, 'you swore an alliance'); this._wsChron(`You and the ${r.name} swear an alliance before Heaven.`, r.id); text = `${r.leader} takes your hand: the ${r.name} is your sworn ally, and will never march on you.` }
        else { deed(A.failStance, 'you proposed an alliance; they refused'); text = `${r.leader} declines your alliance, politely (${sgn(A.failStance)}).` }
        break
      case 'breakAlliance':
        r.sworn = false; deed(A.stance, 'you broke your sworn alliance'); s.karma = Math.max(0, s.karma + A.karma); this._relOthersCool(r, A.othersStance)
        this._wsChron(`${s.ownSect?.name || 'You'} breaks its sworn word to the ${r.name}.`, r.id)
        text = `You break your oath to the ${r.name} (${sgn(A.stance)}, ${A.karma} karma). Every sect hears of it.`; break
      case 'war': {
        const unprov = r.stance > A.unprovokedAbove
        deed(A.stance, 'you declared war on them')
        if (unprov) { s.karma = Math.max(0, s.karma + A.unprovokedKarma); this._relOthersCool(r, A.othersStance) }
        this._openWarOn(r, false, true)
        this._wsChron(`${s.ownSect?.name || 'You'} declares war on the ${r.name}.`, r.id)
        text = `You declare war on the ${r.name}. Your scouts ride out; battle comes when the preparing is done.${unprov ? ` An unprovoked war: ${A.unprovokedKarma} karma, and other sects take note.` : ''}`; break
      }
      case 'tribute':
        if (roll) { const g = A.stonesPerTier * tier, d = this._relStance(A.stance, r); s.spiritStones += g; deed(d, 'you wrung tribute from them'); text = `The ${r.name} pays, white-faced: +${g} stones (${sgn(d)}).` }
        else { deed(A.failStance, 'you demanded tribute; they laughed'); text = `The ${r.name} laughs at your demand (${sgn(A.failStance)}).${answerWar()}` }
        break
      case 'spy':
        s.karma = Math.max(0, s.karma + A.karma)
        if (roll) {
          let manual = null
          if (Math.random() < A.manualChance) { manual = this._rollArt(R.trade.offerWeights[Math.max(0, Math.min(4, tier - 1))]); if (manual) this._grantManual(manual, `stolen from the ${r.name}'s library by your spy`) }
          if (!manual) { const g = A.stonesPerTier * tier; s.spiritStones += g; text = `Your spy slips out of the ${r.name} with +${g} stones. No one saw.` }
          else text = `Your spy slips out of the ${r.name} with a manual: ${ARTS[manual].name}. No one saw.`
          extra.manual = manual
        } else {
          deed(A.failStance, 'your spy was caught'); s.health = Math.max(1, (s.health ?? 100) + A.failHealth)
          text = `Your spy is caught in the ${r.name}. They send back the body, and your name (${sgn(A.failStance)}, Health ${A.failHealth}).${answerWar()}`
        }
        break
      case 'trade': {
        const give = a.yours.find(y => y.id === arg)
        if (!give) { ok = false; break }
        if (!give.ok) { if (a.cost) s.spiritStones += a.cost; return { ok: false, reason: 'grade' } }
        s.inventory['manual_' + give.id]--
        if (s.inventory['manual_' + give.id] <= 0) delete s.inventory['manual_' + give.id]
        const got = a.offer.id
        this._grantManual(got, `from the ${r.name}, in trade for your ${give.name}`)
        deed(A.stance, `you traded them ${give.name}`); r.offer = null
        text = `The ${r.name} takes your ${give.name} and hands over ${ARTS[got].name}.`; extra.got = got; break
      }
      case 'poach': return this.poachDisciple(recId, arg)   // (the page's button leads to Sect → Disciples → Poach recruits)
      case 'spar': {
        const foe = this._relSparFoe(r)
        this._startFight('spar', foe, false, { foe, sectId: r.id })
        this._relDone(r, id)
        this.addEvent({ type: 'neutral', text: `You call on the ${r.name} and cross palms with ${foe.given} in their courtyard.` })
        return { ok: true, fight: true }
      }
      case 'urge': {
        const mine = this._wsMine(), m = this._sectMaster(false)
        if (roll) { this._wsDeed(mine, A.okRegard, `you urged war on the ${r.name}`); this._openWarOn(r, true, false); deed(WORLD_SECTS.stanceMemberWarFoe, 'your sect went to war with them at your urging')
          text = `${m?.given || 'Your master'} hears you out, and the war drums sound: the ${this._sectDef().name} marches on the ${r.name}.` }
        else { this._wsDeed(mine, A.failRegard, `you urged war on the ${r.name}; refused`); text = `${m?.given || 'Your master'} hears you out and refuses (${A.failRegard} regard).` }
        break
      }
    }
    if (!ok) { if (a.cost) s.spiritStones += a.cost; return { ok: false, reason: 'bad_arg' } }
    this._relDone(r, id)
    this.addEvent({ type: success ? 'positive' : 'negative', text })
    this._recalc(); this._notify()
    return { ok: true, success, text, odds: a.odds, ...extra }
  }

  // ── Poaching one named disciple (Sect → Disciples → Poach recruits) ──
  // A sect's named disciples, rolled once a year (talent leans on its tier). Not world persons; a poached one joins you as is.
  _relRoster(r) {
    const yr = this._relYear(), P = SECT_RELATIONS.poach
    if (!r.roster || r.roster.year !== yr) {
      const n = Math.max(0, Math.min(P.roster, Math.floor(r.disciples || 0)))
      const talent = () => Math.max(1, Math.min(5, 1 + Math.floor(Math.random() * (1.6 + 0.6 * (r.tier || 1)))))
      r.roster = { year: yr, list: Array.from({ length: n }, () => ({ ...this._genRecruit(), talent: talent(), level: this._randInt(P.level), loyalty: this._randInt(P.loyalty) })) }
    }
    return r.roster.list
  }
  _poachLock(r) {
    const s = this._s
    if (this._relRole() !== 'leader') return 'Only a sect leader may poach'
    if (r === this._wsMine()) return 'Your own sect'
    const wait = this._relWait(r, 'poach')
    if (wait) return `Again in ${wait} year${wait === 1 ? '' : 's'}`
    if (this._mainRoster().length >= (s.derived?.discipleCap || 0)) return 'Every seat in your hall is taken'
    if (!this._relRoster(r).length) return 'They have none to spare'
    return ''
  }
  _poachTerms(r, d) {
    const P = SECT_RELATIONS.poach, s = this._s
    const cost = Math.round(P.stonesPerTier * (r.tier || 1) * (1 + P.talentCost * (d.talent - 1)))
    const odds = Math.max(0.05, Math.min(0.95, P.odds.base + (this.playerMight() - worldSectMight(r)) / P.odds.mightDiv
      - (d.loyalty - 50) / P.odds.loyaltyDiv + P.odds.perTalent * (d.talent - 2)))
    return { cost, odds, stance: P.stance + P.stancePerTalent * Math.max(0, d.talent - 2), lock: cost > s.spiritStones ? `Needs ${cost} stones` : '' }
  }
  // Public (UI): the sects you may poach from (the picker) — each with its lock reason.
  poachTargets() {
    if (this._relRole() !== 'leader') return []
    return this._wsAll().filter(r => r.alive).map(r => ({ id: r.id, name: r.name, stance: r.stance, stanceLabel: this._wsRow(r).stanceLabel,
      stanceTone: this._wsRow(r).stanceTone, tier: r.tier, disciples: r.disciples, sworn: !!r.sworn, lock: this._poachLock(r) }))
  }
  // Public (UI): one sect's named disciples, each with what poaching them costs, the odds, and how the sect takes it.
  poachRoster(recId) {
    const r = this._wsRec(recId)
    if (!r) return null
    const lock = this._poachLock(r)
    return { id: r.id, name: r.name, leader: r.leader, stance: r.stance, lock, myMight: this.playerMight(), theirMight: worldSectMight(r),
      list: this._relRoster(r).map(d => ({ ...d, ...this._poachTerms(r, d) })) }
  }
  // Public: try to lure disciple `dId` away from sect `recId`. You pay either way; the reply is theirs.
  poachDisciple(recId, dId) {
    const s = this._s, r = this._wsRec(recId)
    if (!r) return { ok: false, reason: 'gone' }
    const lock = this._poachLock(r)
    if (lock) return { ok: false, reason: 'locked', lock }
    const d = this._relRoster(r).find(x => x.id === dId)
    if (!d) return { ok: false, reason: 'not_found' }
    const P = SECT_RELATIONS.poach, t = this._poachTerms(r, d), sgn = n => (n > 0 ? '+' : '') + n
    if (t.lock) return { ok: false, reason: 'stones', lock: t.lock }
    s.spiritStones -= t.cost
    const success = Math.random() < t.odds
    let text
    if (success) {
      const rec = { id: d.id, name: d.name, talent: d.talent, level: d.level, xp: 0, branchId: null, role: 'disciple', kin: false }
      rec.personality = disciplePersonality(rec.id)
      s.ownSect.disciples.push(rec)
      r.roster.list = r.roster.list.filter(x => x !== d); r.disciples = Math.max(0, r.disciples - 1)
      this._wsDeed(r, t.stance, `you lured ${d.name} away from them`)
      text = `${d.name} (talent ${d.talent}, Lv.${d.level}) leaves the ${r.name} for your sect. The ${r.name} will remember it (${sgn(t.stance)}, −${t.cost} stones).`
    } else {
      d.loyalty = Math.min(100, d.loyalty + P.failLoyalty)
      this._wsDeed(r, P.failStance, `you tried to lure ${d.name} away`)
      text = `${d.name} hears you out, then reports you to ${r.leader} (${sgn(P.failStance)}, the −${t.cost} stones are lost; ${d.name} is warier now).`
    }
    this._relDone(r, 'poach')
    this.addEvent({ type: success ? 'positive' : 'negative', text })
    this._recalc(); this._notify()
    return { ok: true, success, text, odds: t.odds, disciple: success ? d : null }
  }

  // A spar's end (from _finishFight): a member's courtesy bout. A win earns Contribution in your own sect and their respect.
  _sparOutcome(fi, opp, res) {
    const s = this._s, r = this._wsRec(fi.sectId), R = SECT_RELATIONS.spar
    if (res.winner.id === s.self.id) {
      const c = R.contribPerTier * (this._wsMine()?.tier || 1)
      if (s.sect?.id) s.sect.contribution += c
      if (r) this._wsDeed(r, R.stance, `you bested ${opp.given} in a spar`)
      this.addEvent({ type: 'positive', text: `You best ${opp.given} of the ${r?.name || 'sect'} before their own disciples (+${c} Contribution${r ? `, +${R.stance} with them` : ''}).` })
      this._recalc(); this._notify()
      return 'won'
    }
    this.addEvent({ type: 'neutral', text: `${opp.given} of the ${r?.name || 'sect'} puts you on your back, and helps you up. You will do better next time.` })
    this._recalc(); this._notify()
    return 'lost_nonlethal'
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
      w.declaredByYou = false   // 43h: the world's war, not yours
      w.razeVow = false; w.razeSet = false   // 43f: a new war, a new vow (the standing order may set it below)
      w.scoutEndsAt = w.nextWarAt + (member ? MEMBER_WAR_SCOUT_SECONDS : WAR_SCOUT_SECONDS) * 1000
      // Phase 43b: a real sect comes for you — weighted by how much it hates you (sworn allies never)
      const foe = this._wsWarFoe(member)
      // Phase 43f: your dread — a weaker foe may remember the ashes and turn back (a remnant's grudge never does)
      const W43 = s.world?.sects, D = SECT_RAZE.dread
      if (!member && foe && !foe.grudge && W43?.dread > 0 && worldSectMight(foe) < this.playerMight()
          && Math.random() < Math.min(D.skipMax, W43.dread * D.skipPer)) {
        w.phase = 'none'
        this._scheduleNextWar(w.nextWarAt)
        const ash = [...(W43.ashes || [])].reverse()[0]
        this.addEvent({ type: 'positive', text: `The ${foe.name} musters at your border, remembers the ashes of the ${ash?.name || 'sects you burned'}, and turns back.` })
        return true
      }
      w.enemyId = foe?.id || null
      w.enemyName = foe?.name || this._rivalSectName()
      if (foe) this._wsDeed(foe, member ? WORLD_SECTS.stanceMemberWarFoe : WORLD_SECTS.stanceWarDeclared, member ? 'went to war with your sect' : 'marched on your mountain')
      this._noteEnemy({ kind: 'sect', name: `the ${w.enemyName}`, why: 'went to war with your sect' })   // 2.6d
      const baseTier = member ? this._sectTier() : Math.round((s.derived?.sectFame || 0) / 100)
      w.enemyTier = foe?.tier || Math.max(1, Math.min(5, baseTier + Math.floor(Math.random() * 3) - 1))   // 43c: the real sect's tier
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
        : w.declaredByYou ? `Your host gathers at the gate to march on the ${w.enemyName}. Battle is near.` : `The ${w.enemyName} will strike soon — prepare your defenses!`, type: 'negative' })
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
        const foeDef = this._wsWarEnemy()?.defId, pool = SECTS.filter(x => x.id !== foeDef)   // 43c: never the foe itself
        const pick = o.ally === 'cheapest' ? pool[0] : pool[pool.length - 1]
        if (pick && s.spiritStones >= this._warAllyCost()) this.requestWarAlly(pick.id)
      }
      if (w.phase === 'preparing' && !w.reinforced && o.reinforce === 'if_affordable') {
        if (s.spiritStones - this._warReinforceCost() >= o.reinforceKeep) this.reinforceForWar()
      }
      this._applyRazeOrder()
    }
  }

  // ── Phase 43f: razing a sect (docs/systems/npc-sects.md → "43f") ───────────────────────────────────────────────
  // The standing order sets the vow only on a war you never touched by hand (w.razeSet): your own call always wins.
  _applyRazeOrder() {
    const w = this._s.sectWar, o = this._s.warOrders
    if (!w || w.side !== 'own' || w.razeSet || !this._relWarOn() || !this._wsWarEnemy()) return
    w.razeVow = o?.raze === 'always' || (o?.raze === 'theirs' && !w.declaredByYou)
  }
  // Public (UI): can you vow to raze this war's foe, and what it would bring. null when no own-sect war is underway.
  razeInfo() {
    const s = this._s, w = s.sectWar
    if (!s.ownSect?.founded || w?.side !== 'own' || !this._relWarOn()) return null
    const r = this._wsWarEnemy(), R = SECT_RAZE
    if (!r) return { ok: false, lock: 'This foe has no mountain to burn', vow: false }
    const provoked = this._razeProvoked(r), levels = this._wsLevels(r)
    const outrage = this._wsAll().filter(x => x.alive && x !== r).map(x => ({ name: x.name, delta: this._razeOutrage(x, provoked) }))
    return { ok: true, vow: !!w.razeVow, byHand: !!w.razeSet, order: s.warOrders?.raze || 'never', provoked,
      sect: r.name, tier: r.tier || 1, joinable: r.kind === 'joinable',
      stones: R.spoilsPerTier * (r.tier || 1) + R.spoilsPerLevel * levels, herbs: R.herbsPerLevel * levels, manualChance: R.manualChance,
      karma: provoked ? R.karmaProvoked : R.karma, fame: R.fame, dread: r.tier || 1,
      cool: outrage.filter(x => x.delta < 0).length, warm: outrage.filter(x => x.delta > 0).length,
      worst: outrage.sort((a, b) => a.delta - b.delta)[0] || null,
      remnant: r.kind === 'joinable' ? 1 : this._remnantChance({ survivors: Math.round((r.disciples || 0) * (1 - WORLD_SECTS.warDiscipleLoss) * R.remnant.survivorFrac), provoked }) }
  }
  // Public (UI): the ashes and your dread, for the World ledger. dreadSkip = the chance a weaker foe turns back.
  razeWorldInfo() {
    const W = this._s.world?.sects, D = SECT_RAZE.dread
    if (!W) return { ashes: [], dread: 0, dreadSkip: 0, razed: 0 }
    const yr = Math.floor(this._s.world.year)
    return { razed: W.razed || 0, dread: W.dread || 0, dreadSkip: Math.min(D.skipMax, (W.dread || 0) * D.skipPer),
      ashes: [...(W.ashes || [])].reverse().map(a => ({ name: a.name, year: a.year, state: a.state, survivors: a.survivors,
        joinable: a.kind === 'joinable', reborn: a.rebornId ? this._wsRec(a.rebornId)?.name || null : null,
        stirs: a.state === 'smoking' ? (yr >= a.returnYear ? 'any year now' : 'quiet') : null })) }
  }
  // A joinable sect burned to the ground and not yet risen again: its gate cannot be joined.
  sectInAshes(defId) {
    const W = this._s.world?.sects
    return !!W && !this._wsByDef(defId) && (W.ashes || []).some(a => a.defId === defId && a.state === 'smoking')
  }
  // Public (UI): vow (or lift the vow) to raze the foe if this war is won. Overrides the standing order for this war.
  setRazeVow(on) {
    const info = this.razeInfo()
    if (!info) return { ok: false, reason: 'no_war' }
    if (!info.ok) return { ok: false, reason: 'no_foe' }
    const w = this._s.sectWar
    w.razeVow = !!on; w.razeSet = true
    this.addEvent({ type: on ? 'negative' : 'neutral', text: on
      ? `You swear before your disciples: if the ${info.sect} falls, its mountain burns to the ground.`
      : `You lift your vow. If the ${info.sect} falls, its mountain will stand.` })
    this._notify()
    return { ok: true, vow: w.razeVow }
  }
  // A war they started (or a remnant's feud) is answered, not begun: less karma, less outrage.
  _razeProvoked(r) { return !this._s.sectWar?.declaredByYou || !!r?.grudge }
  // How sect `x` takes a razing: its master's morality (righteous recoil, ruthless respect), halved when provoked.
  _razeOutrage(x, provoked) {
    const O = SECT_RAZE.outrage, m = PERSONALITY_MORALITY[x.temper] ?? 0
    const d = -m * O.perMorality * (provoked ? O.provokedMult : 1)
    return Math.round(Math.max(-O.cap, Math.min(O.cap, d)))
  }
  _remnantChance({ survivors, provoked }) {
    const P = SECT_RAZE.remnant
    return Math.max(P.min, Math.min(P.max, P.base + P.perSurvivor * (survivors || 0) + (provoked ? P.provoked : 0)))
  }
  // Your sect won a war it vowed to raze: the foe's record dies. Treasury + maybe a manual, karma, fame, dread, the world
  // reacts, and the ashes wait to see whether anyone rises from them. Returns what happened (the Last war card + log).
  _wsRaze(r) {
    const s = this._s, W = s.world.sects, R = SECT_RAZE, yr = Math.floor(s.world.year)
    const provoked = this._razeProvoked(r), levels = this._wsLevels(r), tier = r.tier || 1
    const stones = R.spoilsPerTier * tier + R.spoilsPerLevel * levels, herbs = R.herbsPerLevel * levels
    s.spiritStones += stones
    if (herbs) s.inventory.spirit_herb = (s.inventory.spirit_herb || 0) + herbs
    let manual = null
    if (Math.random() < R.manualChance) {
      manual = this._rollArt(SECT_RELATIONS.trade.offerWeights[Math.max(0, Math.min(4, tier - 1))])
      if (manual) this._grantManual(manual, `in the ruins of the ${r.name}`)
    }
    const karma = provoked ? R.karmaProvoked : R.karma
    s.karma = Math.max(0, Math.min(100, s.karma + karma))
    const survivors = Math.round((r.disciples || 0) * (1 - WORLD_SECTS.warDiscipleLoss) * R.remnant.survivorFrac)
    // The world reacts — each sect by its master's conscience
    let cool = 0, warm = 0
    for (const x of this._wsAll()) {
      if (!x.alive || x === r) continue
      const d = this._razeOutrage(x, provoked)
      if (!d) continue
      this._wsDeed(x, d, `you burned the ${r.name} to the ground`)
      if (d < 0) cool++; else warm++
    }
    // The record dies; its ashes wait
    r.alive = false; r.razedYear = yr
    W.razed = (W.razed || 0) + 1
    W.dread = Math.min(R.dread.max, (W.dread || 0) + tier)
    const ash = { name: r.name, defId: r.defId || null, kind: r.kind, tier, temper: r.temper, leader: r.leader,
                  maxBuildingLevel: r.maxBuildingLevel, maxHall: r.maxHall, year: yr, survivors, provoked, state: 'smoking',
                  returnYear: yr + this._randInt(R.remnant.years), rebornId: null }
    W.ashes.push(ash)
    if (W.ashes.length > R.ashesMax) W.ashes.splice(0, W.ashes.length - R.ashesMax)
    if (W.event?.sectId === r.id) W.event = null
    W.list = W.list.filter(x => x.alive)
    const o = s.ownSect
    if (o?.founded) o.razed.push({ name: r.name, year: yr, tier })
    if (this._warLive) this._claimFirst('razed_sect')   // offline catch-up must not change world.clans (save-roundtrip)
    this._noteEnemy({ kind: 'sect', name: `the survivors of the ${r.name}`, why: 'you burned their mountain' })
    this._wsChron(`${o?.name || 'You'} burns the ${r.name} to the ground. ${survivors ? `${survivors} survivors scatter into the hills.` : 'No one is left.'}`, null)
    const bits = [`+${stones} stones`, herbs ? `+${herbs} Spirit Herbs` : '', manual ? `the ${ARTS[manual]?.name} manual` : '', `${karma} karma`,
                  cool ? `${cool} sect${cool === 1 ? '' : 's'} recoil${cool === 1 ? 's' : ''}` : '', warm ? `${warm} respect${warm === 1 ? 's' : ''} it` : ''].filter(Boolean)
    this.addEvent({ type: 'special', text: `The ${r.name} burns. Its halls fall, its gate is ash, and its name is struck from the world (${bits.join(', ')}).` })
    return { razed: true, sect: r.name, might: 0, stones, herbs, manual, karma, cool, warm, survivors, provoked }
  }
  // Final QA (2026-10-04): the world keeps its gates. Every joinable sect (SECTS) has a living record unless it is yours
  // right now (taken over) or burned and not yet risen (smoking ashes). A sect you used to own always comes back: a lineage
  // record made before lineage records kept their gate gets it back by name; otherwise the gate raises a fresh record in
  // its seed shape (Lv.1 halls, a hash-seeded leader — no Math.random, so migrations and sim seeds don't shift).
  _wsKeepGates() {
    const s = this._s, W = s.world?.sects
    if (!W) return []
    const yr = Math.floor(s.world.year || 1), back = []
    for (const def of SECTS) {
      if (this._wsByDef(def.id)) continue
      if (s.ownSect?.founded && s.ownSect.takenOver?.defId === def.id) continue
      if ((W.ashes || []).some(a => a.defId === def.id && a.state === 'smoking')) continue
      const named = W.list.find(r => r.alive && !r.defId && r.kind === 'lineage' && r.name === def.name)
      if (named) { named.defId = def.id; back.push(named); continue }
      const sd = WORLD_SECT_SEED.find(x => x.defId === def.id) || { tier: 1, maxBuildingLevel: 2, maxHall: 2, temper: WORLD_SECT_TEMPERS[0] }
      const r = this._wsNewRival({ name: def.name, defId: def.id, kind: 'joinable', origin: 'regated', tier: sd.tier, temper: sd.temper,
        maxBuildingLevel: sd.maxBuildingLevel, maxHall: sd.maxHall, rng: wsRng(`gate|${def.id}|${yr}`) })
      this._wsChron(`The ${r.name} opens its gate again under ${r.leader}.`, r.id)
      back.push(r)
    }
    return back
  }

  // A world year: dread fades, and the ashes may stir. A joinable sect always returns (the world keeps its gates).
  _tickAshes(yr) {
    const W = this._s.world.sects, R = SECT_RAZE, P = R.remnant
    if (W.dread > 0) W.dread = Math.max(0, Math.round((W.dread - R.dread.decay) * 100) / 100)
    for (const a of W.ashes || []) {
      if (a.state !== 'smoking' || yr < a.returnYear) continue
      const joinable = !!a.defId && !this._wsByDef(a.defId)   // any record that held a gate (a lineage sect too) — final QA
      if (!joinable && Math.random() >= this._remnantChance(a)) {
        a.state = 'scattered'
        this._wsChron(`No one returns to the ashes of the ${a.name}. Grass grows over its gate.`, null)
        continue
      }
      const taken = new Set(this._wsAll().filter(x => x.alive).map(x => x.name))
      const name = joinable ? a.name : (taken.has(`${P.prefix} ${a.name}`) ? `${P.prefix} ${a.name} ${yr}` : `${P.prefix} ${a.name}`)
      const heir = wsLeaderName(Math.random)
      const r = this._wsNewRival({ name, kind: joinable ? 'joinable' : 'rival', origin: 'remnant', defId: joinable ? a.defId : null,
        tier: Math.max(1, a.tier - 1), temper: a.temper, leader: heir, maxBuildingLevel: a.maxBuildingLevel || 2, maxHall: a.maxHall || 2,
        disciples: Math.max(4, a.survivors), stance: joinable ? P.stanceJoinable : P.stance, grudge: true, ashOf: a.name })
      r.deeds.push({ year: a.year, text: `you burned their mountain; ${heir} was among the survivors`, delta: r.stance })
      a.state = 'reborn'; a.rebornId = r.id
      this._wsChron(`${heir}, a survivor of the ${a.name}, raises its gate again on the old ashes: the ${r.name}.`, r.id)
      this.addEvent({ type: 'negative', text: `Smoke rises from the ashes of the ${a.name}: ${heir} has raised the ${r.name}, and swears vengeance on you.` })
    }
  }

  _resolveSectWar() {
    const s = this._s, w = s.sectWar, d = s.derived || {}
    const fame = d.sectFame || 0
    let playerPower = (fame + 20) * (1 + (d.warDefense || 0)) * (1 + this.sectShelfWar())   // + the arts on your library's shelf
    if (w.reinforced) playerPower *= 1 + WAR_REINFORCE_POWER_BONUS
    if (w.allyId)     playerPower *= 1 + WAR_ALLY_POWER_BONUS
    const sworn = this._swornWar()                                      // 4.10: your sworn siblings come to fight
    if (sworn.bonus) { playerPower *= 1 + sworn.bonus; this.addEvent({ text: NPC_ACTS_TEXT.swornWar.replace('{names}', sworn.names.join(', ')), type: 'special' }) }
    const odds = this.sectWarOdds()?.chance ?? null                   // (read before the roll: the Last war card shows it)
    const vs = this._warMightRatio(false)                               // 43c: the bound sect's real Might
    const enemyPower = (fame + 20) * vs.ratio * (0.6 + Math.random() * 0.8)
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

    const foe = this._wsWarResult(win, false)   // Phase 43b: the sect remembers · 43c: and its halls show it
    Object.assign(w.lastResult, { odds, foeMight: vs.them || null, ourMight: vs.us || null, foeHall: foe?.name ? foe : null, razed: foe?.razed ? foe : null, vowed: !!w.razeVow })   // 43f
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
    bonus += this._swornWar().bonus                          // 4.10: your sworn siblings answer the call too
    const rankMult = SECT_RANKS[s.sect.rank]?.rewardMult || 1
    const shelf = this.sectShelfWar()                        // (a multiplier: the shelf alone never counts as taking part)
    return { bonus, rankMult, shelf, power: (1 + bonus * rankMult) * (1 + shelf) }
  }

  // ── 1.8b-5 (UI read helpers, no state changes) ─────────────────────────────

  // Win odds of the coming (or next) sect war, rolled exactly as _resolveSectWar/_resolveMemberWar roll it: your
  // power multiplier m against an enemy of r×(0.6–1.4, uniform), r = the Might ratio (43c, _warMightRatio)
  // → P(win) = mean of m/(m+r·u) = (m/(0.8r))·ln((m+1.4r)/(m+0.6r)).
  // parts: { label, op: 'base' | '+' | 'x', value } — the terms of m, for the "why" card. vs: the Might match-up.
  sectWarOdds() {
    const s = this._s, w = s.sectWar, d = s.derived || {}
    const member = w?.side === 'member'
    const mv = this._warMightRatio(member), r = mv.ratio
    const odds = m => (m <= 0 ? 0 : (m / (0.8 * r)) * Math.log((m + 1.4 * r) / (m + 0.6 * r)))
    const vs = { ratio: r, them: mv.them, us: mv.us, bound: !!mv.foe, foe: mv.foe ? this._wsRow(mv.foe) : null, rival: mv.rival || null }   // 4.10b: your rival leads them
    if (member && s.sect?.id) {
      const { rankMult, power, shelf } = this.memberWarPower()
      const full = this.memberWarChestFull()
      const beast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
      const parts = [{ label: 'Your sect alone', op: 'base', value: 1 }]
      const add = (label, v) => { if (v > 0) parts.push({ label, op: '+', value: v * rankMult }) }
      if (w.answered) add('You answered the call', MEMBER_WAR_ANSWER_BONUS)
      add(`War chest ${Math.min(w.chestStones, full)}/${full}`, MEMBER_WAR_CHEST_MAX_BONUS * Math.min(1, w.chestStones / full))
      add(`Pills offered ×${w.pillsGiven}`, MEMBER_WAR_PILL_BONUS * w.pillsGiven)
      if (beast) add(`${beast.name} at the front`, Math.min(MEMBER_WAR_BEAST_MAX_BONUS, MEMBER_WAR_BEAST_BASE_BONUS + MEMBER_WAR_BEAST_LVL_BONUS * beast.level))
      const sw = this._swornWar()
      if (sw.bonus) add(`At your side: ${sw.names.join(', ')}`, sw.bonus)
      if (shelf) parts.push({ label: `Arts you gave the library (${s.sect.shelf.length})`, op: 'x', value: 1 + shelf })
      return { side: 'member', mult: power, chance: odds(power), parts, rankMult, vs,
               ifAnswered: w.answered ? null : odds((power / (1 + shelf) + MEMBER_WAR_ANSWER_BONUS * rankMult) * (1 + shelf)) }
    }
    if (w?.side === 'own' && s.ownSect?.founded) {
      let m = 1 + (d.warDefense || 0)
      const parts = [{ label: 'Your sect alone', op: 'base', value: 1 }]
      if (d.warDefense) parts.push({ label: 'Defensive Array', op: '+', value: d.warDefense })
      const shelf = this.sectShelfWar()
      if (shelf) { m *= 1 + shelf; parts.push({ label: `Arts in your sect library (${s.ownSect.library.length})`, op: 'x', value: 1 + shelf }) }
      if (w.reinforced) { m *= 1 + WAR_REINFORCE_POWER_BONUS; parts.push({ label: 'Reinforced', op: 'x', value: 1 + WAR_REINFORCE_POWER_BONUS }) }
      const sw = this._swornWar()
      if (sw.bonus) { m *= 1 + sw.bonus; parts.push({ label: `At your side: ${sw.names.join(', ')}`, op: 'x', value: 1 + sw.bonus }) }
      if (w.allyId) { m *= 1 + WAR_ALLY_POWER_BONUS; parts.push({ label: `${SECTS.find(x => x.id === w.allyId)?.name || 'Ally'} fights with you`, op: 'x', value: 1 + WAR_ALLY_POWER_BONUS }) }
      return { side: 'own', mult: m, chance: odds(m), parts, vs, arrayDamaged: !!d.arrayDamaged,
               reinforceCost: this._warReinforceCost(), allyCost: this._warAllyCost(),
               ifReinforced: w.reinforced ? null : odds(m * (1 + WAR_REINFORCE_POWER_BONUS)),
               ifAllied: w.allyId ? null : odds(m * (1 + WAR_ALLY_POWER_BONUS)) }
    }
    return null
  }

  // Your own sect in numbers: what each disciple adds, each candidate would add, each building costs/does, fame terms.
  ownSectInfo() {
    const s = this._s, o = s.ownSect, d = s.derived || {}
    if (!o?.founded) return null
    const inc = d.ownSectIncomeMult || 1, xpMult = d.discipleXpMult || 1
    let lib = 1
    for (const id of Object.keys(o.buildings)) if (o.buildings[id] > 0) lib *= sectBuildingEffects(id, o.buildings[id]).disciple_qi_mult || 1
    const yieldOf = (talent, level, ym = 1) => {
      const lm = 1 + 0.1 * (level - 1)
      return { qi: DISCIPLE_QI_FRAC * talent * lm * lib * ym, stonesMin: DISCIPLE_STONE_RATE * talent * lm * inc * 60 * ym, herbsMin: DISCIPLE_HERB_RATE * talent * lm * inc * 60 * ym }
    }
    const disciples = o.disciples.map(dc => {
      const max = dc.level >= DISCIPLE_MAX_LEVEL
      const need = DISCIPLE_XP_PER_LEVEL * dc.level, rate = (DISCIPLE_XP_BASE + DISCIPLE_XP_PER_TALENT * dc.talent) * xpMult
      return { d: dc, ...yieldOf(dc.talent, dc.level, this._discipleYieldMult(dc)), max, xpFrac: max ? 1 : Math.min(1, dc.xp / need), eta: max ? 0 : Math.ceil((need - dc.xp) / rate), fame: dc.talent * dc.level,
               branch: !!dc.branchId, kin: !!dc.kin }
    })
    const full = this._mainRoster().length >= (d.discipleCap || 0)   // Phase 45: the Hall seats your own hall only
    const candidates = o.recruitPool.map(c => {
      const cost = DISCIPLE_RECRUIT_COST * c.talent * c.talent
      return { c, cost, ...yieldOf(c.talent, 1), ok: !full && s.spiritStones >= cost, reason: full ? 'full' : s.spiritStones < cost ? 'stones' : null }
    })
    const buildings = SECT_BUILDINGS.map(b => {
      const missing = Object.entries(b.items).map(([id, need]) => ({ id, need, have: s.inventory[id] || 0 })).filter(x => x.have < x.need)
      const level = o.buildings[b.id] || 0, maxed = level >= SECT_BUILDING_MAX_LEVEL
      const upgradeCost = level > 0 && !maxed ? sectBuildingUpgradeCost(b.id, level) : null
      return { b, level, built: level > 0, maxed, upgradeCost,
        stonesShort: Math.max(0, b.stones - s.spiritStones),
        upShort: upgradeCost != null ? Math.max(0, upgradeCost - s.spiritStones) : 0,
        missing, ok: level === 0 && s.spiritStones >= b.stones && !missing.length,
        canUpgrade: upgradeCost != null && s.spiritStones >= upgradeCost }
    })
    const lvl = Math.min(o.hallLevel, SECT_HALL_LEVELS.length)
    const hallNext = SECT_HALL_LEVELS[lvl - 1]?.upgradeStones ?? null
    const builtN = buildings.filter(x => x.built).length
    const totalLevels = buildings.reduce((a, x) => a + x.level, 0)   // Phase 43: fame carries the depth, not just the count
    return {
      disciples, candidates, buildings, full, builtN, totalLevels,
      mainCount: this._mainRoster().length, branchCount: o.branches.length,
      totals: { stonesMin: disciples.reduce((a, x) => a + x.stonesMin, 0), herbsMin: disciples.reduce((a, x) => a + x.herbsMin, 0), qi: d.discipleQiFrac || 0 },
      hall: { level: o.hallLevel, cap: d.discipleCap || 0, nextCap: SECT_HALL_LEVELS[lvl]?.cap ?? null, cost: hallNext, ok: hallNext != null && s.spiritStones >= hallNext },
      fame: { total: d.sectFame || 0, disciples: disciples.reduce((a, x) => a + x.fame, 0), buildings: 10 * totalLevels, hall: 25 * o.hallLevel, wins: 5 * (s.sectWar?.warVictories || 0), arena: s.arena?.sectFame || 0, razed: SECT_RAZE.fame * (o.razed?.length || 0), ranked: this._rankFame() },   // 43f · 4.8
    }
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
    const odds = this.sectWarOdds()?.chance ?? null
    const vs = this._warMightRatio(true)                                // 43c: your sect's Might against theirs
    const enemyPower = vs.ratio * (0.6 + Math.random() * 0.8)
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
      this._wsDeed(this._wsMine(), SECT_MASTER.regardIgnore, 'you ignored the call to arms')   // 43e
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

    const foe = this._wsWarResult(win, true)    // Phase 43b: the sect remembers · 43c: and its halls show it
    Object.assign(res, { odds, foeMight: vs.them || null, ourMight: vs.us || null, foeHall: foe?.name ? foe : null })
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
    if (this._wsWarEnemy()?.defId === sectId)      return { ok: false, reason: 'is_foe' }   // 43c: not the sect you fight
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
    this._wsDeed(this._wsMine(), SECT_MASTER.regardAnswer, 'you answered the call to arms')   // 43e
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
      case 'raze':   // Phase 43f
        if (!WAR_ORDER_RAZE_OPTIONS.includes(value)) return { ok: false, reason: 'invalid' }
        o.raze = value; this._applyRazeOrder(); break
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
    if (['autoExplore', 'autoSectMissions', 'autoCraft', 'autoBreakthrough', 'autoTemper'].includes(key)) {
      if (typeof value !== 'boolean') return { ok: false, reason: 'invalid' }
      if (value && !this.automationUnlocked(key)) return { ok: false, reason: 'locked' }
      a[key] = value
      if (key === 'autoSectMissions' && value && s.playMode === 'idle' && s.sect.id) this._fillAutoSectMissions()
      if (key === 'autoTemper' && value) this._autoTemper(Date.now())
    } else if (key === 'autoTemperId') {   // Phase 14: which safe method Auto-Temper repeats (null = your last)
      if (value != null && !['drill', 'spirit'].includes(TEMPERING_METHODS.find(m => m.id === value)?.group)) return { ok: false, reason: 'invalid' }
      a.autoTemperId = value ?? null
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

  // Which location Auto-Explore idles on. null = whichever you last sent yourself.
  setAutoExploreLocation(locationId) {
    const s = this._s
    if (!s) return { ok: false, reason: 'no_state' }
    if (locationId != null) {
      const loc = LOCATIONS.find(l => l.id === locationId)
      if (!loc) return { ok: false, reason: 'unknown_location' }
      if (s.stageIndex < loc.minStage) return { ok: false, reason: 'stage' }
    }
    s.automation.autoExploreLocationId = locationId ?? null
    this._save(); this._notify()
    return { ok: true }
  }

  setAutoCraftRecipe(recipeId, enabled) {
    const s = this._s
    if (!s) return { ok: false, reason: 'no_state' }
    if (enabled && !this.recipeKnown(recipeId)) return { ok: false, reason: 'locked' }   // Phase 44: an unknown formula can't be auto-crafted
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

    // Phase 46 (1.20a): ancestral catch-up auto-BT is gone (Bloodline Quality → Qi/s replaced it). Only the
    // opt-in Phase 22 automations below remain.
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

    // Free slots: picked sect missions and beasts on Auto-Expedition set out (turned on while home, back from Active Mode,
    // a slot freed by a manual cancel). Returns and resolves already relaunch at once; this is the catch-all.
    a._slotAcc = (a._slotAcc || 0) + dt
    if (a._slotAcc >= AUTO_SLOT_CHECK_SECONDS) {
      a._slotAcc = 0
      if (a.autoSectMissions && a.autoSectMissionIds.length && s.sect.id && this.automationUnlocked('autoSectMissions')) this._fillAutoSectMissions()
      for (const b of s.beasts || []) if (b.autoExp && !b.expedition) this._maybeAutoBeast(b)
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
    s.devSave      = true   // Phase 40: soul grants from a dev life stay in memory, never the real soul file
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
        buildings: Object.fromEntries(SECT_BUILDINGS.filter(b => o.buildings === 'all' || o.buildings.includes(b.id)).map(b => [b.id, o.buildingLevel || 1])),
        disciples: o.disciples.map(talent => ({ ...this._genRecruit(), talent, level: o.discipleLevel, xp: 0 })) }
      s.sectWar = this._blankSectWar('own')
    }
    if (p.warInMinutes && s.sectWar.side) s.sectWar.nextWarAt = now + p.warInMinutes * 60 * 1000
    // Qi as a fraction of the *effective* cap (techniques/artifacts multiply it) — run _recalc against the new save
    const live = this._s, subs = this._subs
    this._s = s
    this._subs = []   // final QA: the half-built save must not reach the UI (a seeded rival's log line re-rendered the HUD on it)
    try {
      // 1.14a: a late-game test life fights people on moves, so it gets a kit for its realm (rolled like a person's arts, at
      // mastery 3) instead of the starter-only loadout a fresh save has
      this._ensurePhase42Fields()
      const kit = this.personArts({ id: `dev|${p.id}`, stageIndex: p.stageIndex, root: s.root, personality: s.personality?.id })
      for (const id of [...kit.moves, ...kit.passives]) s.arts.known[id] = { mastery: 3, xp: ART_MASTERY_XP[3], uses: 0, how: 'dev', at: now }
      s.arts.loadout.moves = [...kit.moves, 'qi_shield', null, null, null].slice(0, ART_MOVE_SLOTS)
      s.arts.loadout.passives = [...kit.passives, null, null, null, null, null].slice(0, ART_PASSIVE_SLOTS_MAX)
      for (const id of Object.keys(s.arts.known)) s.arts.found[id] = true
      this._recalc()
    } finally { this._s = live; this._subs = subs }
    s.qi = s.derived.qiCap * p.qiFrac
    s.stats.breakthroughs = p.stageIndex
    s.lastSave = now
    return s
  }

  addEvent(ev) {
    this._s.events = this._s.events || []
    const w = this._s.world
    if (ev.pid) { const p = w?.persons?.[ev.pid]; if (p) { p.fam = (p.fam || 0) + 1; p.seenY = Math.floor(w.year || 0) } }   // 4.5: a name in your log grows familiar
    const who = this._namesIn(ev.text, ev.pid)   // 4.7: the names in the line, so the Events log can make them tappable
    this._s.events.unshift({ ...ev, ...(who.length ? { who } : {}), ts: Date.now() })
    if (this._s.events.length > 25) this._s.events.pop()
    this._notify()
  }

  setName(name) {
    this._s.name = name.trim().slice(0, 24) || 'Unnamed Cultivator'
    this._notify()
  }

  // 2026-10-02 (user): name or rename one of your children. Free and cosmetic — the child keeps their whole
  // record (root/potential, bond, morality, stage, cooldowns); only their given name changes. The player's
  // own explicit choice, never rolled (agency rule). Called from the child card's Rename action.
  renameChild(childId, name) {
    const kids = this._s.family?.children
    const c = kids && kids.find(x => x.id === childId)
    if (!c) return { ok: false, reason: 'unknown' }
    const v = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 16)
    if (!v) return { ok: false, reason: 'empty' }
    if (v === c.given) return { ok: true, given: v, unchanged: true }
    c.given = v
    this._notify()
    return { ok: true, given: v }
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
  // Round first, then pick the unit: 999,960 reads "1.0M", not "1000.0K" (1.8b-6 review).
  if (n < 1e3) return Math.floor(n).toString()
  const units = [[1e3, 'K'], [1e6, 'M'], [1e9, 'B'], [1e12, 'T']]
  for (let i = 0; i < units.length; i++) {
    const [div, suf] = units[i]
    if (i === units.length - 1 || +(n / div).toFixed(1) < 1000) return (n / div).toFixed(1) + suf
  }
}

function fmtTime(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Phase 43: levelled sect buildings ────────────────────────────────────────
// A building's effects at a given level. Level 1 is the building exactly as first raised; every level after scales
// its effects by (1 + SECT_BUILDING_LEVEL_STEP × (level − 1)). Level 0 = not built (the caller skips it). Shared by
// _recalc / ownSectInfo (engine), the Halls UI and the Base diorama — pure, no state.
function sectBuildingEffects(id, level) {
  const base = SECT_BUILDINGS.find(b => b.id === id)?.effects || {}
  const k = 1 + SECT_BUILDING_LEVEL_STEP * (Math.max(1, level) - 1)
  const out = {}
  for (const [key, v] of Object.entries(base)) out[key] = key === 'beast_slots' ? Math.round(v * k) : v * k
  return out
}

// Stones to reach the NEXT level, or null when the building is unbuilt or already at the cap.
function sectBuildingUpgradeCost(id, level) {
  const b = SECT_BUILDINGS.find(x => x.id === id)
  if (!b || !(level > 0) || level >= SECT_BUILDING_MAX_LEVEL) return null
  return Math.round(b.stones * Math.pow(SECT_BUILDING_UPGRADE_MULT, level))
}

// Phase 45: a disciple's personality, derived from its id (a hash, never Math.random — migration is RNG-free).
function disciplePersonality(id) {
  let h = 2166136261
  for (const ch of String(id || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return PERSONALITIES[h % PERSONALITIES.length].id
}

// Phase 45: a branch's seat count — the head takes one: base + the head's talent (1–5) + 1 per 4 levels, capped.
function branchCap(head) {
  const S = SECT_BRANCH
  if (!head) return S.baseCap
  return Math.min(S.maxCap, S.baseCap + (head.talent || 1) + Math.floor(((head.level || 1) - 1) / 4) * S.levelCapBonus)
}

// Phase 45: what a branch's members feed the sect — the shared yield × a loyalty factor (a sour head keeps more back).
function branchYieldMult(b) {
  const S = SECT_BRANCH
  const loy = Math.max(0, Math.min(100, b?.loyalty ?? S.loyaltyStart))
  return S.yield * (S.loyaltyScaleFloor + (1 - S.loyaltyScaleFloor) * loy / 100)
}

// Phase 43b: a sect's Might — the one number for how strong it is (levels, Sect Hall, tier, disciples). The ledger,
// the world events' "your Might against theirs" rolls and (43c) the war odds all read this.
function worldSectMight(r) {
  const M = WORLD_SECTS.might
  const levels = Object.values(r?.buildings || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0)
  return Math.round(M.perLevel * levels + M.perHall * Math.max(0, (r?.hallLevel || 1) - 1) + M.perTier * (r?.tier || 1)
    + M.discipleSqrt * Math.sqrt(Math.max(0, r?.disciples || 0))
    + (typeof NPC_RANK !== 'undefined' ? NPC_RANK.sectMight : 0) * (r?.ranked || 0))   // 4.8: its people in the Heaven top 20
}

// Phase 43d: how much of its full blessing a sect can give, from how built-up it is (SECT_BLESSING). 1 = the
// blessing as written in SECTS[].effects. The parts are the "why" the Overview + popover show.
function wsBlessingFactor(r) {
  const B = SECT_BLESSING
  const levels = Object.values(r?.buildings || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0)
  const hall = Math.max(0, (r?.hallLevel || 1) - 1)
  const raw = B.base + B.perLevel * levels + B.perHall * hall
  return { factor: Math.round(Math.max(B.min, Math.min(B.max, raw)) * 100) / 100, raw, levels, hall }
}
// Phase 43d: a sect's effects scaled by k (factor × your rank's share). Multipliers scale their bonus part, flat
// bonuses scale whole, a breakthrough floor is capped (SECT_BLESSING.btFloorMax); on/off effects stay on. Shared with the UI.
function sectBlessingEffects(fx, k) {
  const out = {}
  for (const [key, v] of Object.entries(fx || {})) {
    if (typeof v !== 'number') out[key] = v
    else if (/_mult$/.test(key)) out[key] = Math.max(1, 1 + (v - 1) * k)
    else if (key === 'bt_floor') out[key] = Math.min(SECT_BLESSING.btFloorMax, v * k)
    else out[key] = v * k
  }
  return out
}

// Phase 43b: a small seeded RNG (mulberry32 over an FNV hash) — seeding the world's sects draws no Math.random.
function wsRng(seed) {
  let h = 2166136261
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return () => {
    h = (h + 0x6D2B79F5) >>> 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function wsLeaderName(rng) {
  return `${SURNAMES[Math.floor(rng() * SURNAMES.length)]} ${GIVEN_NAMES[Math.floor(rng() * GIVEN_NAMES.length)]}`
}
function wsRivalName(rng, taken = new Set()) {
  for (let i = 0; i < 40; i++) {
    const n = `${RIVAL_SECT_PREFIXES[Math.floor(rng() * RIVAL_SECT_PREFIXES.length)]} ${RIVAL_SECT_SUFFIXES[Math.floor(rng() * RIVAL_SECT_SUFFIXES.length)]}`
    if (!taken.has(n)) return n
  }
  return `${RIVAL_SECT_PREFIXES[Math.floor(rng() * RIVAL_SECT_PREFIXES.length)]} ${RIVAL_SECT_SUFFIXES[Math.floor(rng() * RIVAL_SECT_SUFFIXES.length)]} ${taken.size + 1}`
}

const gameState = new GameState()
