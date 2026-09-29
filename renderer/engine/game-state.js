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
    this._saveT   = 0
    this._slot    = 0
    this.SAVE_INT = 30
    this._soul    = this._blankSoul()   // Phase 40: cross-save Soul record (NOT in _s) — loadSoul() fills it
  }

  get()         { return this._s    }
  activeSlot()  { return this._slot }

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
      bestiary:         {},   // Phase 35 (combat.md): per beast type — seen, fought/won/lost/slain/spared/bound, habitsKnown, returning
      bestiarySeenVer:  1,
      arena:            this._blankArena(),   // A6-3b (combat.md): rings, duelists, the run, renown, titles, call-outs
      arts:             null, // Phase 42 (arts.md): known arts, loadout, study, breakthrough offers — filled by _ensurePhase42Fields (needs root elements)
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
    // A6-2: what you have already met counts as seen in the Bestiary (companions + beasts waiting), once
    if (!s.bestiarySeenVer) {
      s.bestiarySeenVer = 1
      for (const b of [...(s.beasts || []), ...(s.beastEncounters || [])]) if (b?.typeId) this._bestiary(b.typeId).seen = true
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
      autoExplore: false, autoExplorePaused: {}, autoExploreLocationId: null, lastExploreLocationId: null,
      autoSectMissions: false, autoSectMissionIds: [],
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
    const died = endCause === 'suicide' || endCause === 'murder_suicide' || endCause === 'duel'
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
      // (PLAYER_QI_EDGE: the years a stage takes are capped by your bare pace at their stage and root)
      for (let need; sp.stageIndex < SPOUSE_STAGE_CAP && y - f.spouseStageYear >= (need = 1 / this._npcStageRate(sp.stageIndex, sp.root?.mult || 1, SPOUSE_YEARS_PER_STAGE, false));) {
        sp.stageIndex++
        sp.maxStage = Math.max(sp.maxStage, sp.stageIndex)
        f.spouseStageYear += need
      }
      if (sp.stageIndex >= SPOUSE_STAGE_CAP) f.spouseStageYear = y
      // Affection drifts slowly back toward AFFECTION_REST.
      const gap = AFFECTION_REST - f.affection
      f.affection += Math.sign(gap) * Math.min(Math.abs(gap), AFFECTION_DRIFT_PER_YEAR)
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
        for (let i = 0; i < n; i++) suitors.push(this._rollStranger('suitor'))
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
    this._ensurePhase35Fields()
    this._ensurePhase42Fields()
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
      fame   += 10 * bIds.length + 25 * own.hallLevel + 5 * (s.sectWar?.warVictories || 0) + (s.arena?.sectFame || 0)   // A6-3b: arena wins
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
    // Phase 40: Soul Resonance — cross-save, every slot and every life (docs/systems/soul-points.md)
    qMul(`Soul Resonance (rank ${this._soul.resonance})`, this.soulQiMult())

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
    if (!s || s.interlude) return   // 2.6d: between lives the clock stops until the player chooses
    if (s.family?.bracket && !s.family.fight) this._bracketStep()   // A6-3a: a bracket saved between bouts runs on

    // Phase 30 (M2 task 2.3): game clock. Age/gameYear advance ONLY here — never in initSlot()/offline
    // catch-up (life-loop.md pillar 4; §10 gotcha: "open" means the process is running, tray included,
    // since Phase 9A keeps ticking while hidden — only the app not running at all skips aging).
    // Age is a stat only — nothing dies of age (user decision 2026-09-26).
    const years = dt * GAME_YEARS_PER_OPEN_HOUR / 3600
    const prevYear = Math.floor(s.world.year)
    s.age      += years
    s.world.year += years
    if (Math.floor(s.world.year) !== prevYear) { this._tickFamily(); this._tickArena() }   // Phase 16-lite (M2 task 2.5) · A6-3b
    if (s.hunt && !s.hunt.found && Date.now() >= s.hunt.endsAt) this._resolveHunt()   // Phase 35 (A6-2)
    if (s.arts?.study && Date.now() >= s.arts.study.endsAt) this._finishStudy()      // Phase 42 (arts.md): study runs on real time, closed or open

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
    this._startFight('slaughter', person, true, this.personFightOdds(person, 'slaughter').chance, { foe: person, place: enc.place })
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
    for (let i = 0; i < COURT_CANDIDATES; i++) candidates.push(this._rollStranger('suitor'))
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
    const minAge = kind === 'teach' ? TEACH_MIN_AGE : kind === 'gift' ? GIFT_MIN_AGE : 0
    if (def.qiFrac) out.qi = this._qiSlice(def.qiFrac)
    if (def.stones) out.stones = this.familyCost({ cost: { stones: def.stones } })
    if (def.xp) out.xp = def.xp
    if (kind === 'teach') out.morality = Math.round((this._selfMorality() - (c.morality ?? 0)) * TEACH_MORALITY_PULL)
    if (kind === 'gift' && def.spoil?.[c.personality]) out.morality = def.spoil[c.personality]
    const ready = c.cd?.[kind]
    if (age < minAge) return { ...out, ok: false, reason: 'young', minAge }
    if (this._cdLeft(ready)) return { ...out, ok: false, reason: 'cooldown', secsLeft: this._cdLeft(ready) }
    if (out.qi && s.qi < out.qi) return { ...out, ok: false, reason: 'qi' }
    if (out.stones && s.spiritStones < out.stones) return { ...out, ok: false, reason: 'stones' }
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
                   gift: `you give ${c.given} pills and spirit stones` }[kind]
    this.addEvent({ text: `Year ${this._yr()}: ${text}. (${c.given}: bond ${d >= 0 ? '+' : ''}${d})`, type: 'positive' })
    this._recalc(); this._notify()
    return { ok: true, bond: c.bond, delta: d }
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
    // 1.8b-3b: the duel is fought exchange by exchange on the fight card (fightExchange) — your moves, not a roll.
    const chance = this.duelChance()
    this._startFight('duel', f.spouse, true, chance)
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

  // ── 1.8b-3b (family.md): your own fights, exchange by exchange ─────────────
  // kind: 'duel' (your spouse) · 'challenge' (you called out the head) · 'defend' (you hold the seat).
  // matchChance = the old one-roll odds; the exchange odds are derived so that neutral play keeps them.
  // extra (Phase 35 beast battles): { to, beast, stance, power, over } — `to` = exchanges to win (default FIGHT_TO).
  _startFight(kind, opp, lethal, matchChance, extra = null) {
    const s = this._s, f = s.family
    const to = extra?.to || DUEL_TO                  // A6-3a: people fight to DUEL_TO on the battle page (was FIGHT_TO)
    f.fight = { kind, oppId: opp.id, lethal: !!lethal, p: this._exchangeChance(matchChance, to), to, you: 0, them: 0, round: 1,
                log: [], year: Math.floor(s.world.year), ...(extra || {}) }
    this._emit('fight_start', { kind, lethal: !!lethal })
    this._notify()
  }

  // Solves P(first to `to`) = matchChance for the single-exchange chance p (bisection; monotone in p).
  _exchangeChance(P, to = FIGHT_TO) {
    const race = p => { let sum = 0, c = 1
      for (let k = 0; k < to; k++) { sum += c * Math.pow(p, to) * Math.pow(1 - p, k); c = c * (to + k) / (k + 1) }
      return sum }
    let lo = 0, hi = 1
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (race(mid) < P) lo = mid; else hi = mid }
    return (lo + hi) / 2
  }

  // Expected (luck-free) fight power — the odds you are shown; the old roll added ± TOURNAMENT_LUCK around it.
  _expectedPower(c) { return (c.stageIndex || 0) * 100 + Math.round((c.root?.mult || 1) * 10) + (TOURNAMENT_PERSONALITY_POWER[c.personality] || 0) }
  _powerChance(a, b) { return 1 / (1 + Math.exp(-(this._expectedPower(a) - this._expectedPower(b)) / TOURNAMENT_SPREAD)) }

  _fightOpp() {
    const f = this._s.family, fi = f.fight
    if (!fi) return null
    if (fi.kind === 'beast') return this._beastOpp(fi.beast, fi.oppId)
    if (fi.kind === 'arena') return this._s.arena?.duelists?.[fi.oppId] || null   // A6-3b: the Arena's own duelists
    if (fi.kind === 'slaughter') return fi.foe || null                            // A6-3a: a road stranger (never in the world registry)
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
    if (!self && p.feud === 'grudge') parts.push({ label: 'Their grudge against you', value: FEUD_POWER })
    return { parts, total: parts.reduce((a, x) => a + x.value, 0) }
  }

  // The match odds of a fight with a person (what the battle page + the breakdown card show). The spouse duel keeps its
  // own stage rule (duelChance); the rest are the logistic of the two powers.
  personFightOdds(opp, kind) {
    if (!opp) return null
    if (kind === 'duel') {
      const gap = this._s.stageIndex - (opp.stageIndex || 0)
      return { duel: true, chance: this.duelChance(), gap, base: DUEL_BASE_WIN, perStage: DUEL_WIN_PER_STAGE, range: DUEL_WIN_RANGE }
    }
    const you = this._personPowerParts(this._selfAsPerson(), true), them = this._personPowerParts(opp)
    return { you, them, chance: 1 / (1 + Math.exp(-(you.total - them.total) / TOURNAMENT_SPREAD)) }
  }

  personRecord(p) { return { fought: 0, youWon: 0, theyWon: 0, spared: 0, raised: 0, humbled: 0, ...(p?.vsYou || {}) } }
  _noteVsYou(p, field) {
    if (!p) return
    p.vsYou = this.personRecord(p)
    p.vsYou.fought++
    if (field) p.vsYou[field]++
  }

  _fightStyle(opp) { return opp?.beast ? this._beastStyle(opp.typeId, opp.traits) : FIGHT_STYLE[opp?.personality] || FIGHT_STYLE.default }
  _tacticEdge(mine, theirs) { return FIGHT_TACTICS[mine].beats === theirs ? FIGHT_EDGE : FIGHT_TACTICS[theirs].beats === mine ? -FIGHT_EDGE : 0 }
  _clampExchange(q) { return Math.max(FIGHT_EXCHANGE_RANGE[0], Math.min(FIGHT_EXCHANGE_RANGE[1], q)) }

  // Chance they accept your yield in a lethal fight (always accepted when the fight isn't to the death).
  _yieldAccept(opp) {
    const f = this._s.family, fi = f.fight
    if (!fi.lethal) return 1
    let a = YIELD_ACCEPT_BASE + (opp?.morality ?? 0) / 100
    if (fi.kind === 'duel') a += (f.affection - 50) / 200
    else if (fi.kind === 'challenge') a += (this._bondWithHead(opp) - 50) / 200
    if (opp?.feud === 'debt') a += FEUD_YIELD                   // A6-3a: they owe you / they hate you
    else if (opp?.feud === 'grudge') a -= FEUD_YIELD
    return Math.max(0.05, Math.min(0.95, a))
  }

  // What the fight card shows: score, each tactic's chance this exchange (against their habits), the temper hint.
  fightInfo() {
    const f = this._s.family, fi = f.fight
    if (!fi) return null
    const opp = this._fightOpp(), style = this._fightStyle(opp)
    // Phase 35: a beast's habits are unknown until you have fought one of its kind; the odds shown are then against
    // even habits (all the player can know), and the true habits stay hidden.
    const beast = fi.kind === 'beast', known = !beast || !!this._s.bestiary?.[fi.beast.typeId]?.habitsKnown
    const w = known ? { press: style.press, guard: style.guard, feint: style.feint } : { press: 1, guard: 1, feint: 1 }
    const W = w.press + w.guard + w.feint
    const tactics = {}
    for (const t of Object.keys(FIGHT_TACTICS))
      tactics[t] = Object.keys(w).reduce((acc, o) => acc + (w[o] / W) * this._clampExchange(fi.p + this._tacticEdge(t, o)), 0)
    const out = { kind: fi.kind, opp, lethal: fi.lethal, you: fi.you, them: fi.them, to: fi.to || FIGHT_TO, round: fi.round, base: fi.p,
             tactics, habits: known ? { press: w.press / W, guard: w.guard / W, feint: w.feint / W } : null, hint: known ? style.hint : null,
             habitsKnown: known, yieldAccept: beast ? 1 : this._yieldAccept(opp), log: [...fi.log] }
    if (beast) Object.assign(out, { beast: { ...fi.beast }, stance: fi.stance, over: fi.over || null, health: this._s.health ?? 100,
      wound: this._beastWound(fi.beast, fi.stance), lossWound: this._beastLossWound(fi.beast, fi.stance), power: fi.power })
    else Object.assign(out, { over: fi.over || null, health: this._s.health ?? 100, wound: FIGHT_WOUND, record: this.personRecord(opp),
      feud: opp?.feud || null, odds: this.personFightOdds(opp, fi.kind), bracket: this._bracketInfo() })
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
    if (fi.kind === 'beast') {                                   // Phase 35: a won battle waits for beastFightFinish()
      if (tactic === 'retreat' || tactic === 'yield') return this._beastRetreat(fi, opp)
    }
    if (tactic === 'yield') {
      if (Math.random() < this._yieldAccept(opp)) {
        f.fight = null
        return { ok: true, done: true, yielded: true, outcome: this._finishFight(fi, opp, false, true), ...this._afterBoutInfo() }
      }
      fi.log.push({ round: fi.round, yieldRefused: true })
      this.addEvent({ text: `You lower your blade — ${opp.given} does not. This ends with one of you.`, type: 'negative' })
      this._notify()
      return { ok: true, done: false, refused: true }
    }
    if (!FIGHT_TACTICS[tactic]) return { ok: false, reason: 'bad_tactic' }
    const style = this._fightStyle(opp)
    let r = Math.random() * (style.press + style.guard + style.feint)
    const theirs = (r -= style.press) < 0 ? 'press' : (r -= style.guard) < 0 ? 'guard' : 'feint'
    const q = this._clampExchange(fi.p + this._tacticEdge(tactic, theirs))
    const won = Math.random() < q
    let dmg = 0
    if (won) fi.you++
    else if (fi.kind === 'beast') {                              // Phase 35: real wounds; the Slay stance can kill you
      fi.them++
      dmg = this._beastWound(fi.beast, fi.stance)
      s.health = (s.health ?? 100) - dmg
      if (fi.stance !== 'slay') s.health = Math.max(1, s.health)
    }
    else { fi.them++; s.health = Math.max(1, (s.health ?? 100) - FIGHT_WOUND) }
    fi.log.push({ round: fi.round, you: tactic, them: theirs, won, ...(dmg ? { dmg } : {}) })
    fi.round++
    if (fi.kind === 'beast') return this._beastAfterExchange(fi, opp, { you: tactic, them: theirs, won, dmg })
    const to = fi.to || FIGHT_TO, exchange = { you: tactic, them: theirs, won, dmg: won ? 0 : FIGHT_WOUND }
    if (fi.you >= to) {                                          // A6-3a: you won — the end choice is yours (personFightFinish)
      fi.over = 'won'
      this.addEvent({ text: `${opp.given} is down. What happens now is your choice.`, type: 'positive' })
      this._notify()
      return { ok: true, done: false, over: 'won', exchange }
    }
    if (fi.them >= to) {
      f.fight = null
      const outcome = this._finishFight(fi, opp, false, false)
      return { ok: true, done: true, exchange, outcome, ...this._afterBoutInfo() }
    }
    this._notify()
    return { ok: true, done: false, exchange }
  }

  // Applies the outcome of each fight kind. `died` = the loser does not rise: a lethal loss for you, or your Finish.
  _finishFight(fi, opp, won, yielded, died = !won && fi.lethal && !yielded) {
    this._noteVsYou(opp, won ? 'youWon' : 'theyWon')
    if (fi.kind === 'duel') return this._duelOutcome(won, yielded)
    const me = this._selfAsPerson()
    const res = won ? { winner: me, loser: opp, died, yielded: false } : { winner: opp, loser: me, died, yielded }
    if (fi.kind === 'stepdown') return this._stepdownBoutEnd(fi, opp, res)
    if (fi.kind === 'arena') return this._arenaBoutEnd(fi, opp, res)
    if (fi.kind === 'slaughter') return this._slaughterOutcome(fi, opp, res)
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
    const karma = { finish: fi.kind === 'duel' ? 0 : fi.kind === 'arena' ? ARENA_KILL_KARMA : CHALLENGE_KARMA_DEATH, spare: SPARE_KARMA, raise: 0, humble: 0 }
    return { kind: fi.kind, lethal: fi.lethal, ids, name: opp?.given, begs: fi.lethal && pid === 'coward',
      reaction: { spare: react(SPARE_REACTION), raise: react(RAISE_REACTION), humble: react(HUMBLE_REACTION) }, karma,
      quietYears: fi.kind === 'arena' ? null : HUMBLE_QUIET_YEARS, bracket: this._bracketInfo(),
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
      if (opp) opp.feud = feud
      if (choice === 'spare') { s.karma = Math.min(100, s.karma + SPARE_KARMA); if (opp) opp.vsYou = { ...this.personRecord(opp), spared: this.personRecord(opp).spared + 1 } }
      if (choice === 'raise' && opp) opp.vsYou = { ...this.personRecord(opp), raised: this.personRecord(opp).raised + 1 }
      if (choice === 'humble') {
        if (opp) opp.vsYou = { ...this.personRecord(opp), humbled: this.personRecord(opp).humbled + 1 }
        if (fi.kind === 'arena') s.arena.renown += ARENA_RENOWN.humble   // the crowd loves it; the clan never saw it
        else f.cowedUntilYear = yr + Math.round(this._randRange(HUMBLE_QUIET_YEARS))
      }
      const said = { spare: `You lower your blade and let ${opp?.given} live.`, raise: `You offer ${opp?.given} your hand and help them up.`,
        humble: `You leave ${opp?.given} in the dust before the whole clan.` }[choice]
      this.addEvent({ text: `${said} ${feud === 'debt' ? 'They will remember they owe you.' : 'They will not forget it.'}`, type: feud === 'debt' ? 'positive' : 'negative' })
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
    return { ok: true, choice, outcome, feud, ...this._afterBoutInfo() }
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
        const p = this._genPerson({ family: Persons.rollSurname(), bornYear: yr - 20 - this._randInt([0, 40]), stage, role: 'duelist' })
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
    const opp = A.duelists[oppId]
    this._startFight('arena', opp, !!blood, this.personFightOdds(opp, 'arena').chance,
      { arena: { ringId: R.id, blood: !!blood, champion: A.rings[R.id].championId === oppId, callout: false } })
    return { ok: true, fight: true }
  }

  // Your choice between bouts: take the purse and go
  arenaWalkAway() {
    const s = this._s, A = s.arena, run = A.run
    if (!run) return { ok: false, reason: 'no_run' }
    if (s.family?.fight?.kind === 'arena') return { ok: false, reason: 'busy' }
    s.spiritStones += run.purse
    const R = ARENA_RINGS.find(r => r.id === run.ringId)
    this.addEvent({ text: `You walk off the ${R?.name || 'sand'} with ${run.purse} Spirit Stones${run.streak > 1 ? ` and a streak of ${run.streak}` : ''}.`, type: 'positive' })
    A.last = { walked: true, purse: run.purse, streak: run.streak, ringId: run.ringId }
    A.run = null
    A.restUntil = Date.now() + ARENA_REST_SECONDS * 1000
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
      if (res.died) { opp.alive = false; opp.diedYear = yr; opp.cause = 'arena_blood'; A.record.kills++; s.karma = Math.max(0, s.karma + ARENA_KILL_KARMA) }
      A.best = Math.max(A.best, run?.streak || 0)
      if (s.ownSect?.founded) A.sectFame += R.fame
      else if (s.sect?.id) s.sect.contribution += R.contribution
      A.last = { won: true, gain, purse: run?.purse || 0, streak: run?.streak || 0, title, ringId: R.id, champLeft: Math.max(0, ARENA_CHAMP_AFTER - (run?.wins || 0)) }
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
    A.restUntil = Date.now() + ARENA_REST_SECONDS * 1000
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
    this._startFight('arena', p, !!c.blood, this.personFightOdds(p, 'arena').chance,
      { arena: { ringId: R.id, blood: !!c.blood, champion: A.rings[R.id]?.championId === p.id, callout: true } })
    return { ok: true, fight: true }
  }

  // ── Phase 35 (docs/systems/combat.md): beast battles ────────────────────────
  // A wild beast from Roam → Beasts, fought on the battle page (renderer/game/combat.js) exchange by exchange. The fight
  // lives in the shared f.fight slot (kind 'beast'), so it also holds the one-fight-at-a-time gate.

  bestiaryEntry(typeId) {
    const b = this._s.bestiary?.[typeId]
    return { seen: false, fought: 0, won: 0, lost: 0, slain: 0, spared: 0, bound: 0, habitsKnown: false, returning: null, ...(b || {}) }
  }
  _bestiary(typeId) {
    const s = this._s
    if (!s.bestiary) s.bestiary = {}
    return (s.bestiary[typeId] = this.bestiaryEntry(typeId))
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
    const chance = 1 / (1 + Math.exp(-(me.total - it.total) / TOURNAMENT_SPREAD))
    const hp = s.health ?? 100, rec = this.bestiaryEntry(enc.typeId)
    const stance = {}
    for (const st of ['slay', 'drive']) {
      const wound = this._beastWound(enc, st), lossWound = this._beastLossWound(enc, st)
      const worst = BATTLE_TO * wound + lossWound
      stance[st] = { chance, wound, lossWound, worst, canDie: st === 'slay' && hp - worst <= 0 }
    }
    const style = this._beastStyle(enc.typeId, enc.traits || []), W = style.press + style.guard + style.feint
    const nature = (typeof BEAST_NATURE !== 'undefined' && BEAST_NATURE[enc.typeId]) || 'wild'
    return { encId, name: prof.name, prof, nature, mood: enc.mood || null, you: me, it, chance, stance, health: hp, to: BATTLE_TO,
      habitsKnown: rec.habitsKnown, record: rec,
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
    this._startFight('beast', { id: 'beast:' + enc.id }, stance === 'slay', pv.chance, {
      to: BATTLE_TO, stance, power: pv.it.total, over: null,
      beast: { encId: enc.id, typeId: enc.typeId, ...(enc.variant ? { variant: enc.variant } : {}), traits: [...(enc.traits || [])], ...(enc.mood ? { mood: enc.mood } : {}) } })
    return { ok: true, fight: true, chance: pv.chance }
  }

  _beastAfterExchange(fi, opp, exchange) {
    const s = this._s, f = s.family, to = fi.to || BATTLE_TO
    if ((s.health ?? 100) <= 0) return { ok: true, done: true, exchange, outcome: this._beastFightDeath(fi, opp) }
    if (fi.them >= to) {
      f.fight = null
      return { ok: true, done: true, exchange, outcome: this._beastFightLost(fi, opp) }
    }
    if (fi.you >= to) {
      fi.over = 'won'
      this.addEvent({ text: `The ${opp.name} goes down and does not rise. It is yours to decide what happens now.`, type: 'positive' })
      this._notify()
      return { ok: true, done: false, over: 'won', exchange }
    }
    this._notify()
    return { ok: true, done: false, exchange }
  }

  _beastFightDeath(fi, opp) {
    const s = this._s, b = this._bestiary(fi.beast.typeId)
    s.family.fight = null
    b.fought++; b.lost++; b.habitsKnown = true
    this.addEvent({ text: `Year ${Math.floor(s.world.year)}: the ${opp.name} was stronger. You went to kill it, and it killed you.`, type: 'negative' })
    this._die('beast_hunt')
    return 'died'
  }

  _beastFightLost(fi, opp) {
    const s = this._s, b = this._bestiary(fi.beast.typeId)
    b.fought++; b.lost++; b.habitsKnown = true
    const extra = this._beastLossWound(fi.beast, fi.stance)
    s.health = (s.health ?? 100) - extra
    if (fi.stance !== 'slay') s.health = Math.max(1, s.health)
    if (s.health <= 0) return this._beastFightDeath(fi, opp)
    this.addEvent({ text: `The ${opp.name} throws you down (−${extra} Health). You crawl away; it still prowls Roam → Beasts.`, type: 'negative' })
    this._emit('battle_lost', { beast: opp.name })
    this._recalc(); this._notify()
    return 'lost'
  }

  _beastRetreat(fi, opp) {
    const s = this._s, b = this._bestiary(fi.beast.typeId)
    const dmg = this._beastWound(fi.beast, fi.stance)
    s.health = (s.health ?? 100) - dmg
    if (fi.stance !== 'slay') s.health = Math.max(1, s.health)
    if (s.health <= 0) return { ok: true, done: true, retreated: true, outcome: this._beastFightDeath(fi, opp) }
    s.family.fight = null
    b.fought++
    if (fi.round > 1) b.habitsKnown = true                       // you traded blows: you saw how it fights
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
    const rec = fi.beast, prof = this.beastProfile(rec), name = prof.name, b = this._bestiary(rec.typeId)
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
    return { v: 1, points: 0, earned: 0, resonance: 0, failedAscensions: 0, immortals: 0, v1Finished: null, log: [], seen: false }
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
      const from = Math.max(p.grownYear ?? year, (p.bornYear ?? 0) + AWAKENING_AGE)
      p.grownYear = year
      if (year <= from || (p.stageIndex || 0) >= NPC_STAGE_CAP) continue
      let left = year - from, xp = p.npcXp || 0
      p.stageIndex = p.stageIndex || 0
      while (left > 0 && p.stageIndex < NPC_STAGE_CAP) {
        const rate = this._npcStageRate(p.stageIndex, p.root?.mult || 1, NPC_YEARS_PER_STAGE)
        const need = (1 - xp) / rate
        if (left < need) { xp += left * rate; left = 0; break }
        left -= need; xp = 0; p.stageIndex++
      }
      p.npcXp = p.stageIndex >= NPC_STAGE_CAP ? 0 : xp
      p.maxStage = Math.max(p.maxStage || 0, p.stageIndex)
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
    this._startFight('challenge', head, lethal, this.personFightOdds(head, 'challenge').chance)
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
    this._startFight('defend', challenger, lethal, this.personFightOdds(challenger, 'defend').chance)
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
        this._startFight('stepdown', opp, br.roundLethal, this.personFightOdds(opp, 'stepdown').chance)
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
    return fi?.kind === 'stepdown' && !fi.over && fi.you === 0 && fi.them === 0 ? { next: true } : {}
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

  // ── Phase 42 (task 1.12, docs/systems/arts.md): combat arts — library, manuals, study, loadout, offers ─────────
  // s.arts = { known: { [artId]: { mastery, xp, uses, how, at } }, loadout: { moves: [id|null ×4], passives: [id|null ×5] },
  //            study: null | { artId, startedAt, endsAt }, offers: [{ id, realm, options: [artId ×3] }], found: { [artId]: true } }
  _blankArts() {
    const known = {}
    for (const id of ART_BASICS) known[id] = { mastery: 1, xp: 0, uses: 0, how: 'basic', at: Date.now() }
    const els = this.rootElements()
    const starter = ARTS_LIST.find(a => a.starter && a.element === els[0])
    if (starter) known[starter.id] = { mastery: 1, xp: 0, uses: 0, how: 'root', at: Date.now() }
    const moves = Object.keys(known).filter(id => ARTS[id].kind === 'move')
    return { known, loadout: { moves: [...moves, null, null, null, null].slice(0, ART_MOVE_SLOTS), passives: Array(ART_PASSIVE_SLOTS_MAX).fill(null) },
      study: null, offers: [], found: Object.fromEntries(Object.keys(known).map(id => [id, true])) }
  }

  _ensurePhase42Fields() {
    const s = this._s
    if (!Array.isArray(s.root?.elements)) s.root.elements = Persons.rootElements(s.root, `${s.self?.id ?? ''}|${s.name}`)
    if (!s.arts || typeof s.arts !== 'object') s.arts = this._blankArts()
    const a = s.arts
    if (!a.known || typeof a.known !== 'object') a.known = {}
    for (const id of Object.keys(a.known)) if (!ARTS[id]) delete a.known[id]
    for (const id of ART_BASICS) if (!a.known[id]) a.known[id] = { mastery: 1, xp: 0, uses: 0, how: 'basic', at: Date.now() }
    if (!a.loadout) a.loadout = { moves: [], passives: [] }
    const clean = (arr, n, kind) => Array.from({ length: n }, (_, i) => { const id = arr?.[i]; return id && a.known[id] && ARTS[id]?.kind === kind ? id : null })
    a.loadout.moves = clean(a.loadout.moves, ART_MOVE_SLOTS, 'move')
    a.loadout.passives = clean(a.loadout.passives, ART_PASSIVE_SLOTS_MAX, 'passive')
    if (a.study && !(ARTS[a.study.artId] && a.study.endsAt > 0)) a.study = null
    if (!Array.isArray(a.offers)) a.offers = []
    a.offers = a.offers.filter(o => Array.isArray(o.options) && o.options.every(id => ARTS[id]))
    if (!a.found || typeof a.found !== 'object') a.found = {}
    for (const id of Object.keys(a.known)) a.found[id] = true
  }

  rootElements() { const r = this._s?.root; return Array.isArray(r?.elements) ? r.elements : Persons.rootElements(r || {}, '') }
  passiveSlots(stage = this._s.stageIndex) { let n = 1; for (const x of ART_PASSIVE_SLOTS) if (stage >= x.stage) n = x.slots; return n }
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
    if (s.arts.study) return 'busy'
    return null
  }
  studyArt(artId) {
    const s = this._s, lock = this.artStudyLock(artId)
    if (lock) return { ok: false, reason: lock }
    s.inventory['manual_' + artId]--
    if (s.inventory['manual_' + artId] <= 0) delete s.inventory['manual_' + artId]
    const secs = this.artStudySeconds(artId)
    s.arts.study = { artId, startedAt: Date.now(), endsAt: Date.now() + secs * 1000 }
    this.addEvent({ text: `You sit down with the ${ARTS[artId].name} manual. (${fmtTime(secs)})`, type: 'neutral' })
    this._recalc(); this._notify()
    return { ok: true, seconds: secs }
  }
  cancelStudy() {
    const s = this._s, st = s.arts.study
    if (!st) return { ok: false, reason: 'none' }
    s.inventory['manual_' + st.artId] = (s.inventory['manual_' + st.artId] || 0) + 1   // the manual goes back in the pack
    s.arts.study = null
    this._recalc(); this._notify()
    return { ok: true }
  }
  _finishStudy() {
    const s = this._s, st = s.arts.study
    if (!st) return
    s.arts.study = null
    this._learnArt(st.artId, 'study')
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
  // Put a known art in a slot (null clears it). An art already in another slot moves (slots never hold duplicates).
  setArtSlot(kind, index, artId) {
    const s = this._s, a = s.arts
    if (s.family?.fight) return { ok: false, reason: 'fighting' }
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
  // What Path → Arts shows. Passives beyond your realm's slots stay in the loadout but are inactive (shown locked).
  artsInfo() {
    const s = this._s, a = s.arts
    return { known: a.known, loadout: a.loadout, passiveSlots: this.passiveSlots(), study: a.study, offers: a.offers,
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
    this._bestiary(beastType.id).seen = true
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
    this._bestiary(enc.typeId).seen = true
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

  // ── 1.8b-5 (UI read helpers, no state changes) ─────────────────────────────

  // Win odds of the coming (or next) sect war, rolled exactly as _resolveSectWar/_resolveMemberWar roll it: your
  // power multiplier m against an enemy of ×(0.6–1.4, uniform) → P(win) = mean of m/(m+u) = (m/0.8)·ln((m+1.4)/(m+0.6)).
  // parts: { label, op: 'base' | '+' | 'x', value } — the terms of m, for the "why" card.
  sectWarOdds() {
    const s = this._s, w = s.sectWar, d = s.derived || {}
    const odds = m => (m <= 0 ? 0 : (m / 0.8) * Math.log((m + 1.4) / (m + 0.6)))
    if (w?.side === 'member' && s.sect?.id) {
      const { rankMult, power } = this.memberWarPower()
      const full = this.memberWarChestFull()
      const beast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
      const parts = [{ label: 'Your sect alone', op: 'base', value: 1 }]
      const add = (label, v) => { if (v > 0) parts.push({ label, op: '+', value: v * rankMult }) }
      if (w.answered) add('You answered the call', MEMBER_WAR_ANSWER_BONUS)
      add(`War chest ${Math.min(w.chestStones, full)}/${full}`, MEMBER_WAR_CHEST_MAX_BONUS * Math.min(1, w.chestStones / full))
      add(`Pills offered ×${w.pillsGiven}`, MEMBER_WAR_PILL_BONUS * w.pillsGiven)
      if (beast) add(`${beast.name} at the front`, Math.min(MEMBER_WAR_BEAST_MAX_BONUS, MEMBER_WAR_BEAST_BASE_BONUS + MEMBER_WAR_BEAST_LVL_BONUS * beast.level))
      return { side: 'member', mult: power, chance: odds(power), parts, rankMult,
               ifAnswered: w.answered ? null : odds(power + MEMBER_WAR_ANSWER_BONUS * rankMult) }
    }
    if (w?.side === 'own' && s.ownSect?.founded) {
      let m = 1 + (d.warDefense || 0)
      const parts = [{ label: 'Your sect alone', op: 'base', value: 1 }]
      if (d.warDefense) parts.push({ label: 'Defensive Array', op: '+', value: d.warDefense })
      if (w.reinforced) { m *= 1 + WAR_REINFORCE_POWER_BONUS; parts.push({ label: 'Reinforced', op: 'x', value: 1 + WAR_REINFORCE_POWER_BONUS }) }
      if (w.allyId) { m *= 1 + WAR_ALLY_POWER_BONUS; parts.push({ label: `${SECTS.find(x => x.id === w.allyId)?.name || 'Ally'} fights with you`, op: 'x', value: 1 + WAR_ALLY_POWER_BONUS }) }
      return { side: 'own', mult: m, chance: odds(m), parts, arrayDamaged: !!d.arrayDamaged,
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
    for (const id of Object.keys(o.buildings)) if (o.buildings[id]) lib *= SECT_BUILDINGS.find(b => b.id === id)?.effects?.disciple_qi_mult || 1
    const yieldOf = (talent, level) => {
      const lm = 1 + 0.1 * (level - 1)
      return { qi: DISCIPLE_QI_FRAC * talent * lm * lib, stonesMin: DISCIPLE_STONE_RATE * talent * lm * inc * 60, herbsMin: DISCIPLE_HERB_RATE * talent * lm * inc * 60 }
    }
    const disciples = o.disciples.map(dc => {
      const max = dc.level >= DISCIPLE_MAX_LEVEL
      const need = DISCIPLE_XP_PER_LEVEL * dc.level, rate = (DISCIPLE_XP_BASE + DISCIPLE_XP_PER_TALENT * dc.talent) * xpMult
      return { d: dc, ...yieldOf(dc.talent, dc.level), max, xpFrac: max ? 1 : Math.min(1, dc.xp / need), eta: max ? 0 : Math.ceil((need - dc.xp) / rate), fame: dc.talent * dc.level }
    })
    const full = o.disciples.length >= (d.discipleCap || 0)
    const candidates = o.recruitPool.map(c => {
      const cost = DISCIPLE_RECRUIT_COST * c.talent * c.talent
      return { c, cost, ...yieldOf(c.talent, 1), ok: !full && s.spiritStones >= cost, reason: full ? 'full' : s.spiritStones < cost ? 'stones' : null }
    })
    const buildings = SECT_BUILDINGS.map(b => {
      const missing = Object.entries(b.items).map(([id, need]) => ({ id, need, have: s.inventory[id] || 0 })).filter(x => x.have < x.need)
      const built = !!o.buildings[b.id]
      return { b, built, stonesShort: Math.max(0, b.stones - s.spiritStones), missing, ok: !built && s.spiritStones >= b.stones && !missing.length }
    })
    const lvl = Math.min(o.hallLevel, SECT_HALL_LEVELS.length)
    const hallNext = SECT_HALL_LEVELS[lvl - 1]?.upgradeStones ?? null
    const builtN = buildings.filter(x => x.built).length
    return {
      disciples, candidates, buildings, full,
      totals: { stonesMin: disciples.reduce((a, x) => a + x.stonesMin, 0), herbsMin: disciples.reduce((a, x) => a + x.herbsMin, 0), qi: d.discipleQiFrac || 0 },
      hall: { level: o.hallLevel, cap: d.discipleCap || 0, nextCap: SECT_HALL_LEVELS[lvl]?.cap ?? null, cost: hallNext, ok: hallNext != null && s.spiritStones >= hallNext },
      fame: { total: d.sectFame || 0, disciples: disciples.reduce((a, x) => a + x.fame, 0), buildings: 10 * builtN, hall: 25 * o.hallLevel, wins: 5 * (s.sectWar?.warVictories || 0), arena: s.arena?.sectFame || 0 },
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
      if (key === 'autoSectMissions' && value && s.playMode === 'idle' && s.sect.id) this._fillAutoSectMissions()
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

const gameState = new GameState()
