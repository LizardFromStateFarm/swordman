// Main game controller — character select → game loop → UI updates.

;(async function () {

  // CSP shim (1.8b-1): index.html's CSP (style-src 'self') blocks style="…" attributes parsed from innerHTML, so
  // the ~57 inline styles in the render functions (affection/bond colors, widths, margins) were silently dropped.
  // Styles set through CSSOM are allowed, so re-apply each new element's attribute that way. New UI code should
  // use classes in styles.css instead of inline styles.
  const applyInlineStyles = root => {
    if (root.nodeType !== 1) return
    if (root.hasAttribute('style')) root.style.cssText = root.getAttribute('style')
    for (const n of root.querySelectorAll('[style]')) n.style.cssText = n.getAttribute('style')
  }
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) applyInlineStyles(n) })
    .observe(document.body, { childList: true, subtree: true })

  // ── Character Select ───────────────────────────────────────────────────────

  let slots = await window.electron.loadAllSlots()
  await gameState.loadSoul()   // Phase 40: the cross-save Soul record (charselect shows its button + total)
  // Dev builds (npm start) can create late-game test characters — see assets/data/dev-presets.js
  let isDev = false
  try { isDev = !!(await window.electron.isDev?.()) } catch {}

  function renderCharSelect() {
    const container = document.getElementById('cs-slots')
    container.innerHTML = ''

    slots.forEach((save, i) => {
      const card = document.createElement('div')
      card.className = 'cs-slot'

      const header = document.createElement('div')
      header.className = 'cs-slot-header'
      header.textContent = `SLOT ${i + 1}`
      card.appendChild(header)

      if (save) {
        const stage = CULTIVATION_STAGES[Math.min(save.stageIndex || 0, CULTIVATION_STAGES.length - 1)]
        const body  = document.createElement('div')
        body.className = 'cs-slot-body'
        body.innerHTML = `
          <div class="cs-char-name">${escHtml(save.name || 'Unnamed Cultivator')}</div>
          <div class="cs-char-stage" style="color:${stage.color || 'var(--text)'}">${stage.realm} · ${stage.layer}</div>
          ${(() => { const p = PERSONALITIES.find(x => x.id === save.personality?.id); return p ? `<div class="cs-char-persona">${p.name}</div>` : '' })()}
          <div class="cs-char-meta">
            ${fmtTime(save.stats?.timePlayed || 0)} cultivated
            &nbsp;·&nbsp; ${save.stats?.breakthroughs || 0} breakthroughs
          </div>
          <div class="cs-slot-btns">
            <button class="cs-btn-play" data-slot="${i}">▶ Continue</button>
            <button class="cs-btn-del"  data-slot="${i}">✕</button>
          </div>
        `
        card.appendChild(body)
      } else {
        const empty = document.createElement('div')
        empty.className = 'cs-slot-empty'
        empty.innerHTML = `
          <div class="cs-empty-label">── Empty ──</div>
          <button class="cs-btn-new" data-slot="${i}">+ New Cultivator</button>
        `
        if (isDev && typeof DEV_PRESETS !== 'undefined') {
          const dev = document.createElement('div')
          dev.className = 'cs-dev'
          dev.innerHTML = `
            <select class="cs-dev-select" data-slot="${i}">
              ${DEV_PRESETS.map(p => `<option value="${p.id}" title="${escHtml(p.desc)}">${escHtml(p.name)}</option>`).join('')}
            </select>
            <button class="cs-btn-dev" data-slot="${i}" title="Dev only: create a late-game test character">DEV</button>`
          empty.appendChild(dev)
        }
        card.appendChild(empty)
      }

      container.appendChild(card)
    })

    container.querySelectorAll('.cs-btn-play').forEach(btn => {
      btn.addEventListener('click', () => startGame(parseInt(btn.dataset.slot)))
    })
    container.querySelectorAll('.cs-btn-new').forEach(btn => {
      btn.addEventListener('click', () => startGame(parseInt(btn.dataset.slot)))
    })
    container.querySelectorAll('.cs-btn-dev').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.slot)
        const save = gameState.buildDevSave(container.querySelector(`.cs-dev-select[data-slot="${i}"]`)?.value)
        if (!save) return
        await window.electron.saveSlot(i, save)
        startGame(i)
      })
    })
    container.querySelectorAll('.cs-btn-del').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(parseInt(btn.dataset.slot)))
    })
    renderCsSoul()
  }

  // ── Soul screen (Phase 40a, docs/systems/soul-points.md) ──────────────────────
  // Cross-save, so its door is on the charselect (once any points exist) as well as Kin → Hall.
  const soulView = new SoulView(gameState, {
    esc: escHtml, fmt,
    // The toast lives in the game view; at the charselect the screen's own pip animation is the feedback
    flash: (m, t) => { if (!document.getElementById('app').classList.contains('hidden')) flashMessage(m, t) },
    onChange: () => { renderCsSoul(); const s = gameState.get(); if (s && hallView) renderHall(s) },
    // 40b: the Soul screen's "Your ascension" row replays the first Immortal's cinematic + finish screen (changes nothing)
    relive: () => {
      const v = gameState.getSoul().v1Finished
      if (!v) return
      soulView.close()
      immortalView.play({ kind: 'v1', pts: SOUL_V1_GRANT, ...v }, { relive: true, color: CULTIVATION_STAGES[CULTIVATION_STAGES.length - 1].color })
    },
  })
  // Phase 40b: a successful Ascension Trial — the cinematic, then the finish screen / later-Immortal card
  const immortalView = new ImmortalView({
    esc: escHtml, fmt, openSoul: () => soulView.open(),
    reducedMotion: () => !!gameState.getSettings().reducedMotion,
    zoom: () => (gameState.getSettings().fontSize || 13) / 13,
  })
  window.immortalView = immortalView   // smoke tests (scripts/smoke/scenarios/immortal.js) freeze + capture it
  // Phase 35 (A6-1): the battle page — beast battles from Roam → Beasts (renderer/game/combat.js, docs/systems/combat.md)
  const combatView = new CombatView(gameState, {
    esc: escHtml, flash: (m, t) => flashMessage(m, t), settings: () => gameState.getSettings(), fmt: v => fmt(v), go: v => nav.go(v),
    zoom: () => (gameState.getSettings().fontSize || 13) / 13,
  })
  window.combatView = combatView       // smoke tests (scripts/smoke/scenarios/combat.js)
  function renderCsSoul() {
    const b = document.getElementById('cs-soul'), i = gameState.soulInfo()
    b.classList.toggle('hidden', !i.earned)
    if (!i.earned) return
    const pct = Math.round(i.perRank * i.resonance * 100)
    b.classList.toggle('fresh', !i.seen)
    b.classList.toggle('ready', i.canSpend)
    b.innerHTML = `<span class="css-g">${Icon('soul')}</span><span class="css-t"><span class="css-n">The Soul Remembers</span>
      <span class="css-e">${fmt(i.points)} Soul Points${pct ? ` · +${pct}% Qi, every slot` : ''}${i.canSpend ? ' · a rank is ready' : ''}</span></span>
      <span class="css-dot"></span>`
    b.title = 'Soul Points and Soul Resonance: shared by every save slot'
  }
  document.getElementById('cs-soul').addEventListener('click', () => soulView.open())

  // Generic confirm overlay (Phase 21: also used by the Pack tab's Discard button — see showConfirm below).
  let _pendingConfirm = null
  function showConfirm(msg, sub, onYes, label = 'Delete') {
    document.getElementById('confirm-msg').textContent = msg
    document.getElementById('confirm-sub').textContent = sub
    document.getElementById('confirm-yes').textContent = label
    _pendingConfirm = onYes
    document.getElementById('confirm-overlay').classList.remove('hidden')
  }

  function confirmDelete(slotIndex) {
    showConfirm('Delete this cultivator?', 'This cannot be undone.', async () => {
      await window.electron.deleteSlot(slotIndex)
      slots[slotIndex] = null
      renderCharSelect()
    })
  }

  document.getElementById('confirm-yes').addEventListener('click', async () => {
    const cb = _pendingConfirm
    _pendingConfirm = null
    document.getElementById('confirm-overlay').classList.add('hidden')
    if (cb) await cb()
  })

  document.getElementById('confirm-no').addEventListener('click', () => {
    _pendingConfirm = null
    document.getElementById('confirm-overlay').classList.add('hidden')
  })

  document.getElementById('cs-quit').addEventListener('click', () => { window.electron.quit() })

  renderCharSelect()

  // ── Start game ────────────────────────────────────────────────────────────

  async function startGame(slotIndex) {
    await gameState.initSlot(slotIndex)
    document.getElementById('charselect').classList.add('hidden')
    document.getElementById('app').classList.remove('hidden')
    layoutUI.enterGame()
    bootGame()
  }

  document.getElementById('btn-back').addEventListener('click', async () => {
    gameState.forceSave()
    tickRunning = false
    slots = await window.electron.loadAllSlots()
    soulView.close()
    document.getElementById('app').classList.add('hidden')
    document.getElementById('charselect').classList.remove('hidden')
    layoutUI.leaveGame()
    settingsUI.close()
    settingsUI.apply(gameState.defaultSettings())
    document.getElementById('banter-bubble').classList.add('hidden')   // charselect always shows default presentation
    renderCharSelect()
  })

  // ── Game bootstrap ────────────────────────────────────────────────────────

  const renderer  = new SpriteRenderer(document.getElementById('sprite-canvas'))   // A3-1: Classic ASCII or Ink art (Settings: Sprite art)
  window.spriteRenderer = renderer   // smoke tests (scripts/smoke/scenarios/ink-art.js) freeze + capture it
  const cultSys   = new CultivationSystem(gameState)
  const expSys    = new ExpeditionSystem(gameState)
  const craftSys  = new CraftingSystem(gameState)
  const beastSys  = new BeastSystem(gameState)
  const sectSys   = new SectSystem(gameState)
  const sectWarSys = new SectWarSystem(gameState)
  const settingsUI = new SettingsUI(gameState, renderer)
  // Phase 6E layout modes (renderer/game/layout.js). fmt/fmtTime are hoisted function declarations below.
  const layoutUI   = new LayoutUI(renderer, { fmt, fmtTime })
  layoutUI.init()

  // The four quick actions, shared by the tabs and the banner's dropdowns (1.7b) so both give the same feedback.
  const quickActions = {
    learn(id) {
      const res = gameState.learnTechnique(id)
      if (!res.ok) flashMessage({ owned: 'Already learned', stage: 'Realm too low', stones: 'Need more spirit stones' }[res.reason] || 'Cannot learn', 'negative')
      else flashMessage(`Learned: ${TECHNIQUES.find(t => t.id === id)?.name}`, 'special')
      return res
    },
    startMission(id) {
      const res = gameState.startSectMission(id)
      const msgs = { rank: 'Rank too low', busy: 'Already underway', full: 'Mission slots full', unknown: 'Unknown mission', no_sect: 'Not in a sect' }
      if (!res.ok) flashMessage(msgs[res.reason] || 'Cannot start mission', 'negative')
      else flashMessage(`Mission started: ${res.mission.name}`, 'positive')
      return res
    },
    sendExpedition(id) {
      const res = gameState.startExpedition(id)
      if (!res.ok) flashMessage({ active: 'Expedition already active', stage: 'Realm too low', unknown: 'Unknown location' }[res.reason] || 'Cannot send expedition', 'negative')
      else flashMessage(`Expedition to ${res.loc.name} underway.`, 'positive')
      return res
    },
    // Phase 22 (22C): "watching" = viewed the Craft tab (or the banner's Craft menu) within the last minute.
    craft(id) {
      const watched = Date.now() - _craftTabViewedAt <= ACTIVE_CRAFT_TOUCH_WINDOW_SECONDS * 1000
      const res = craftSys.craft(id, watched)
      if (res.ok) {
        const bonus = res.masterTouch ? ` ×2 (Master's Touch!)` : res.doubled ? ` ×2 (Herb Hall bonus!)` : ''
        flashMessage(`Crafted: ${res.item.name}${bonus}`, 'positive')
      } else flashMessage(res.reason === 'ingredients' ? 'Not enough materials' : 'Cannot craft', 'negative')
      return res
    },
    markCraftWatched() { _craftTabViewedAt = Date.now() },
  }
  const bannerMenus = new BannerMenus(gameState, quickActions, { fmt, fmtTime, escHtml, effectText, personStageLabel })
  BeastDetail.init({ gameState, flash: (m, t) => flashMessage(m, t), confirm: showConfirm, fight: id => { BeastDetail.close(); combatView.open(id) } })   // A4-2: beast details page
  SectDetail.init({ gameState, flash: (m, t) => flashMessage(m, t), confirm: showConfirm, fmt: n => fmt(n), go: v => nav.go(v), fight: () => combatView.resume(),
    poach: id => { (sectView ||= new SectView(gameState, sectHelpers())).startPoach(id); nav.go('sect-disciples') } })   // 43h: a sect's own page (drawn in World → Sects)
  WorldView.init({ gameState, ledger: s => (sectView ||= new SectView(gameState, sectHelpers()))._ledger(s) })   // 43h: 世 World → Sects
  layoutUI.onModeChange = mode => { if (mode !== 'banner') bannerMenus.close() }
  // Any popup open? Banter holds new lines while one is, and hides a bubble already showing (1.8b-1).
  const isPopupOpen = () => !!document.querySelector('body > [id$="-overlay"]:not(.hidden)')
  const banterSys  = new BanterSystem(gameState, isPopupOpen)
  // Phase 9A/B: window "active" = visible AND focused; notifications only fire otherwise (news, not a summons).
  const notifSys   = new NotificationSystem(gameState, () => !document.hidden && document.hasFocus(),
    (title, body) => window.electron.notify(title, body))
  window.electron.onRequestSave?.(() => gameState.forceSave())   // main.js asks for a flush before a real quit
  let tickRunning = false
  let _trayName = null, _trayStage = null
  // Phase 22 (22C): Active Mode's breakthrough focus click-window — client-side only, not persisted.
  let _btFocusReadyAt = null, _prevCanBreakthrough = false
  // Phase 22 (22C): Active Mode's craft Master's Touch — "watching" = viewed the Craft tab within 60s.
  let _craftTabViewedAt = 0
  let _proposalShownYear = null   // Phase 16-lite (M2 task 2.5): auto-open each proposal once per session; Stats reopens it
  let _familyShownKey    = null   // family.md: auto-open each marriage event / duel once per session

  function bootGame() {
    tickRunning = true

    // Seed with the loaded save's existing value so a prior-session death doesn't re-pop the overlay.
    let _lastDeathTs = gameState.get()?.lastReincarnation?.ts ?? null
    let _lastBanterTs = gameState.get()?.banter?.last?.ts ?? null
    let _deathHoldUntil = 0   // A4-3: while the death moment plays, the interlude card waits

    gameState.subscribe((s, fromTick) => {
      if (!s) return
      if (!fromTick) settingsUI.apply(s.settings)
      updateHUD(s, fromTick)
      updateSprite(s)
      if (s.lastReincarnation && s.lastReincarnation.ts !== _lastDeathTs) {
        _lastDeathTs = s.lastReincarnation.ts
        // A4-3: the life ends on screen first (ink: the figure dissolves into ash, or rises as gold light when it
        // Ascended), then the death card opens. Classic art has no moment (hold 0).
        const lr = s.lastReincarnation, dying = CULTIVATION_STAGES[lr.stageAtDeath ?? lr.maxStageReached]
        const hold = renderer.playDeath(lr.cause === 'ascended' ? 'ascend' : 'fall', dying?.spriteState, dying?.color)   // the one who died, not the heir
        if (lr.cause === 'ascended' && lr.soul) {
          // Phase 40b: the Immortal Ascension plays full-window; the interlude card waits until the player continues
          _deathHoldUntil = Infinity
          immortalView.play(lr.soul, { color: CULTIVATION_STAGES[CULTIVATION_STAGES.length - 1].color,
            onContinue: () => { _deathHoldUntil = 0; showDeathOverlay(gameState.get()?.lastReincarnation) } })
        } else {
          _deathHoldUntil = Date.now() + hold
          // Phase 46: guard the deferred card — a life resolved before the hold elapses (a scripted/auto rebirth)
          // must not pop the stale death card over the new life. Line 299 still shows it if the interlude persists.
          if (hold) setTimeout(() => { if (gameState.get()?.interlude) showDeathOverlay(gameState.get()?.lastReincarnation) }, hold)
          else showDeathOverlay(s.lastReincarnation)
        }
      } else if (s.interlude && Date.now() >= _deathHoldUntil && document.getElementById('death-overlay').classList.contains('hidden')) {
        showDeathOverlay(s.lastReincarnation)   // 2.6d: never leave an interlude without its card
      }
      if (s.banter?.last && s.banter.last.ts !== _lastBanterTs) {
        _lastBanterTs = s.banter.last.ts
        showBanterBubble(s.banter.last.text, s)
      }
    })

    const s = gameState.get()
    if (s) { settingsUI.apply(s.settings); updateHUD(s); updateSprite(s) }
    if (s?.interlude) showDeathOverlay(s.lastReincarnation)   // 2.6d: a save closed mid-interlude resumes it

    let lastTick = performance.now()
    function step(now) {
      const dt = Math.min((now - lastTick) / 1000, 2)
      lastTick = now
      // 2026-09-30: tell the engine whether the player is actually at the game (same test NotificationSystem uses) —
      // away (hidden to the tray / unfocused) makes a spouse's affection drift far slower.
      gameState.setPresent(!document.hidden && document.hasFocus())
      gameState.tick(dt)
      cultSys.tick(dt)
      expSys.tick(dt)
      beastSys.tick(dt)
      sectSys.tick(dt)
      sectWarSys.tick(dt)
      banterSys.tick(dt)
      notifSys.tick()
    }
    function loop(now) {
      if (!tickRunning) return
      step(now)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    // Phase 9A: rAF stops while the window is hidden to the tray, so a 1s timer keeps the game ticking
    // whenever frames stall (main.js sets backgroundThrottling:false so this timer isn't throttled).
    const bgTimer = setInterval(() => {
      if (!tickRunning) { clearInterval(bgTimer); return }
      const now = performance.now()
      if (now - lastTick > 900) step(now)
    }, 1000)
  }

  // ── HUD updates ───────────────────────────────────────────────────────────

  function updateHUD(s, fromTick = false) {
    const d  = s.derived
    const st = d.stage

    document.getElementById('cultivator-name').textContent = s.name
    updateModeButton(s)

    document.getElementById('stage-realm').textContent = st.realm
    document.getElementById('stage-realm').style.color = st.color || 'var(--gold)'
    document.getElementById('stage-layer').textContent = st.layer   // English only (user 2026-09-27)
    document.getElementById('stage-desc').textContent  = st.desc
    document.getElementById('stage-desc').title        = st.desc   // Phase 6E: clipped to one line in Overlay

    // Phase 9A: keep the tray tooltip/menu label in sync, but only send the (cheap but not-free) IPC
    // when the name or stage label actually changed — this runs every frame while the tab is live.
    const stageLabel = `${st.realm} ${st.layer}`.trim()
    if (s.name !== _trayName || stageLabel !== _trayStage) {
      _trayName = s.name; _trayStage = stageLabel
      window.electron.updateTrayInfo(s.name, stageLabel)
    }

    const cap = isFinite(d.qiCap) ? d.qiCap : 1e15
    const pct = Math.min(100, (s.qi / cap) * 100)
    document.getElementById('qi-fill').style.width    = pct + '%'
    document.getElementById('qi-numbers').textContent = `${fmt(s.qi)} / ${fmt(d.qiCap)}`
    document.getElementById('qi-rate').textContent    =
      d.meditBonus > 1
        ? `+${fmt(d.qiPerSecondBoosted)} qi/s (${d.meditBonus}×) · ${d.meditSecondsLeft}s`
        : `+${fmt(d.qiPerSecond)} qi/s`
    breakdownUI.refresh(s)

    const btnMed = document.getElementById('btn-meditate')
    if (s.meditating) {
      btnMed.classList.add('meditating')
      btnMed.querySelector('.act-sub').textContent = `${d.meditSecondsLeft}s remaining`
      btnMed.disabled = true
    } else {
      btnMed.classList.remove('meditating')
      btnMed.querySelector('.act-sub').textContent = '3× Qi · 30s'
      btnMed.disabled = false
    }

    // Phase 14 follow-up: the Meridian Flow segment beside Meditate — charges, or "resume" for a puzzle set aside
    const btnFlow = document.getElementById('btn-flow'), fl = s.minigames?.flow && gameState.minigameInfo().flow   // (refills charges first)
    if (btnFlow && fl) {
      const max = MINIGAME_CHARGES.max, waiting = !!fl.waiting, n = fl.charges || 0
      btnFlow.disabled = !n && !waiting
      btnFlow.classList.toggle('waiting', waiting)
      btnFlow.classList.toggle('full', n >= max && !waiting)
      btnFlow.querySelector('.flow-n').innerHTML = waiting ? Icon('play') : n   // a set-aside puzzle: resume
      const qi = fmt(fl.qi)
      btnFlow.title = waiting ? `Meridian Flow: your puzzle waits, as you left it. Finish it for +${qi} Qi.`
        : n ? `Meridian Flow: turn the channels until the Qi flows, at your own pace. +${qi} Qi · ${n} of ${max} charges.`
        : `Meridian Flow: no charges. One returns every 30 minutes, even while you are away.`
    }

    const btnBt  = document.getElementById('btn-breakthrough')
    const btPct  = Math.round(d.breakthroughChanceDisplay * 100)
    const pillName = s.activePill ? ITEMS[s.activePill]?.name : null
    const lastMortalIdx = CULTIVATION_STAGES.length - 2
    if (st.id === 'ascension') {
      btnBt.disabled = true
      btnBt.querySelector('.act-name').textContent = 'Ascended'
      btnBt.querySelector('.act-sub').textContent  = ''
    } else if (s.stageIndex === lastMortalIdx) {
      btnBt.disabled = !d.canBreakthrough
      btnBt.classList.toggle('ready', d.canBreakthrough)
      btnBt.querySelector('.act-name').textContent = 'Ascension Trial'
      btnBt.querySelector('.act-sub').textContent = d.canBreakthrough
        ? 'Attempt to transcend'
        : `${Math.round(pct)}% qi filled`
    } else {
      btnBt.disabled = !d.canBreakthrough
      btnBt.classList.toggle('ready', d.canBreakthrough)
      btnBt.querySelector('.act-name').textContent = 'Breakthrough'
      btnBt.querySelector('.act-sub').textContent = d.canBreakthrough
        ? `${btPct}% chance${pillName ? ' (pill)' : ''}`
        : `${Math.round(pct)}% qi filled`
    }

    // Phase 22 (22C): Active Mode breakthrough focus window — 3s pulse the moment canBreakthrough flips true.
    if (s.playMode === 'active' && d.canBreakthrough && !_prevCanBreakthrough) _btFocusReadyAt = Date.now()
    if (!d.canBreakthrough) _btFocusReadyAt = null
    _prevCanBreakthrough = d.canBreakthrough
    const inFocusWindow = s.playMode === 'active' && _btFocusReadyAt && (Date.now() - _btFocusReadyAt) <= ACTIVE_BT_FOCUS_WINDOW_SECONDS * 1000
    btnBt.classList.toggle('bt-focus', !!inFocusWindow)

    document.getElementById('meditate-badge').classList.toggle('hidden', !s.meditating)

    // Integrity bar: lerp color from indigo (#6060C0) at 100 to red (#C83030) at 0
    const integ    = s.derived.realmIntegrity ?? 100
    const t        = integ / 100
    const ir = Math.round(200 + t * (96  - 200))
    const ig = Math.round(48  + t * (96  - 48))
    const ib = Math.round(48  + t * (192 - 48))
    document.getElementById('integrity-fill').style.width      = Math.min(100, integ) + '%'
    document.getElementById('integrity-fill').style.background = `rgb(${ir},${ig},${ib})`
    document.getElementById('integrity-numbers').textContent   = String(Math.round(integ))   // out of 100; the bar shows the rest

    // Health bar: lerp --jade (full) to --red (empty) (Phase 23A; palette follows color-blind setting)
    const health = s.health ?? 100, healthMax = s.derived?.maxHealth || 100   // Phase 14: the body sets the max
    const ht = Math.max(0, Math.min(1, health / healthMax))
    const { red: R, jade: J } = settingsUI.palette()
    const hr = Math.round(R[0] + ht * (J[0] - R[0]))
    const hg = Math.round(R[1] + ht * (J[1] - R[1]))
    const hb = Math.round(R[2] + ht * (J[2] - R[2]))
    document.getElementById('health-fill').style.width      = (ht * 100) + '%'
    document.getElementById('health-fill').style.background = `rgb(${hr},${hg},${hb})`
    document.getElementById('health-numbers').textContent   = healthMax === 100 ? String(Math.round(health)) : `${Math.round(health)}/${healthMax}`

    // Age readout (Phase 30) — a stat only, nothing dies of age
    document.getElementById('age-numbers').textContent = String(Math.floor(s.age))
    document.getElementById('stones-numbers').textContent = fmt(s.spiritStones)

    // Proposal card (Phase 16-lite, M2 task 2.5) — auto-opens once per proposal
    const prop = s.family?.proposal
    if (prop && prop.year !== _proposalShownYear) {
      _proposalShownYear = prop.year
      openProposalOverlay(s)
    }
    if (!prop) document.getElementById('proposal-overlay').classList.add('hidden')

    // Family card (family.md): marriage/crisis event or duel — auto-opens once per item, never expires
    const famKey = familyPendingKey(s)
    if (famKey && famKey !== _familyShownKey && document.getElementById('proposal-overlay').classList.contains('hidden')) {
      _familyShownKey = famKey
      openFamilyOverlay(s)
    }
    if (!famKey) document.getElementById('family-overlay').classList.add('hidden')

    layoutUI.update(s)   // Phase 6E: banner-strip stones + expedition readout (no-op in other modes)
    if (layoutUI.mode === 'banner') bannerMenus.update(s, fromTick)   // 1.7b: quick-action buttons + open menu

    // 1.8b-1: the attention list feeds the strip, the group badges and the banner summary
    const att = collectAttention(s, gameState)
    attentionUI.render(att)
    nav.setAvailable(ALL_VIEWS.filter(v => !v.startsWith('sect') || SectView.viewsFor(s).includes(v)))   // 1.8b-5
    nav.update(s, att, k => gameState.automationUnlocked(k))
    // A banter bubble never sits on top of a popup (1.8c bug: it covered the death + ascension cards)
    if (isPopupOpen()) document.getElementById('banter-bubble').classList.add('hidden')
    if (!document.getElementById('mode-overlay').classList.contains('hidden') && !fromTick) renderModePanel(s)
    if (BeastDetail.isOpen() && !fromTick) BeastDetail.render(s)   // A4-2: beast details page follows the state
    combatView.refresh()                                          // Phase 35: the battle page's Health + vigor plates

    const activeTab = nav.view
    if (fromTick) {
      // On every tick: only update the live expedition timer without re-rendering
      if (activeTab === 'explore') updateExpeditionTimerInPlace(s)
      updateBeastTimersInPlace()   // Roam > Beasts list + the beast details page count down live
      if (activeTab === 'arts') ArtsView.tickInPlace(document.getElementById('tab-arts'), fmtTime)   // Phase 42: the study countdown
      if (activeTab === 'hunt') HuntView.tickInPlace(document.getElementById('tab-hunt'), fmtTime)   // A6-2: the search countdown
      if (activeTab === 'physique' && BodyView.tickInPlace(document.getElementById('tab-physique'), fmtTime)) renderView('physique', gameState.get())   // Phase 14: a tempering ends / an ordeal peaks
      if (activeTab === 'arena' && ArenaView.tickInPlace(document.getElementById('tab-arena'), fmtTime)) renderView('arena', gameState.get())   // A6-3b: a ring's rest
      if (activeTab.startsWith('sect')) updateSectTimersInPlace(s)
      if (activeTab === 'pack')    updatePackDeltaInPlace(s)   // Phase 21: per-frame currency delta fade
    } else {
      // On explicit state changes: full tab re-render (safe, buttons will be stable until next change)
      renderView(activeTab, s)
    }
  }

  const ALL_VIEWS = NAV_GROUPS.flatMap(g => g.views.map(v => v[0]))
  // A6-2 (Roam → Hunt / Bestiary, renderer/game/hunt-view.js)
  const huntHelpers = { esc: escHtml, flash: (m, t) => flashMessage(m, t), fmtTime, fight: id => combatView.open(id), go: v => nav.go(v) }
  const arenaHelpers = { esc: escHtml, flash: (m, t) => flashMessage(m, t), fmt, fmtTime, fight: () => combatView.resume() }   // A6-3b
  // Phase 14 (body-constitution.md): Path → Body + the two mini-games (any [data-mg-open] button opens one)
  const mgHelpers = { esc: escHtml, flash: (m, t) => flashMessage(m, t), fmt, fmtTime }
  const bodyHelpers = { ...mgHelpers, confirm: showConfirm }
  document.addEventListener('click', e => { const b = e.target.closest('[data-mg-open]'); if (b && !b.disabled) MinigameUI.open(b.dataset.mgOpen, gameState, mgHelpers) })
  // A7 (Phase 38A): the Sect → Base compound scene — its own view (it owns a canvas, so SectView.render must not rebuild it)
  const baseView = new BaseView(gameState, { esc: escHtml, fmt, fmtTime, go: v => nav.go(v) })
  // 1.8b-1: one entry point per view (NAV_GROUPS in renderer/game/nav.js)
  const VIEW_RENDER = {
    techniques: s => renderTechniques(s), stats: s => renderStats(s), explore: s => renderExplore(s),
    beasts: s => renderBeasts(s), hunt: s => HuntView.render(s, document.getElementById('tab-hunt'), gameState, huntHelpers),
    bestiary: s => BestiaryView.render(s, document.getElementById('tab-bestiary'), gameState, huntHelpers),
    arena: s => ArenaView.render(s, document.getElementById('tab-arena'), gameState, arenaHelpers),   // A6-3b
    arts: s => ArtsView.render(s, document.getElementById('tab-arts'), gameState, { esc: escHtml, flash: (m, t) => flashMessage(m, t), fmtTime }),   // Phase 42
    physique: s => BodyView.render(s, document.getElementById('tab-physique'), gameState, bodyHelpers),   // Phase 14
    family: s => renderFamily(s), tree: s => renderTree(s), clan: s => renderClan(s), hall: s => renderHall(s), sect: s => renderSect(s),
    'sect-missions': s => renderSect(s, 'sect-missions'), 'sect-library': s => renderSect(s, 'sect-library'), 'sect-halls': s => renderSect(s, 'sect-halls'),
    'sect-disciples': s => renderSect(s, 'sect-disciples'), 'sect-war': s => renderSect(s, 'sect-war'),
    'sect-base': s => baseView.render(s, document.getElementById('tab-sect-base')),   // A7 (Phase 38A): the compound scene
    pack: s => renderPack(s), craft: s => renderCraft(s), events: s => renderEvents(s), banter: s => renderBanter(s),
    world: s => WorldView.render(s),   // 43h: 世 World → Sects
    class: s => ClassView.render(s),   // Phase 28 (4.3): 世 World → Class
    chronicle: s => ChronicleView.render(s),   // Phase 28 (4.6): 世 World → Chronicle
  }
  function renderView(view, s) {
    if (!s) return
    VIEW_RENDER[view]?.(s)
    if (view.startsWith('sect')) nav.setContext(s.ownSect?.founded ? s.ownSect.name : s.sect?.id ? SECTS.find(x => x.id === s.sect.id)?.name : 'no sect yet')
  }

  // Beast expedition countdowns: each timer span carries its endsAt; refresh the text every tick, no re-render.
  function updateBeastTimersInPlace() {
    document.querySelectorAll('[data-beast-left]').forEach(n => {
      const left = Math.max(0, Math.ceil((+n.dataset.beastLeft - Date.now()) / 1000))
      n.textContent = fmtTime(left)
    })
  }

  function updateExpeditionTimerInPlace(s) {
    const line = document.getElementById('_exp_timer_line')
    const bar  = document.getElementById('_exp_timer_bar')
    if (!line || !bar || !s.expedition?.active) return
    const loc    = LOCATIONS.find(l => l.id === s.expedition.locationId)
    const msLeft = Math.max(0, s.expedition.endsAt - Date.now())
    const pct    = Math.max(0, Math.min(100, 100 - (msLeft / ((loc?.duration || 1) * 1000)) * 100))
    line.textContent    = `${loc?.name || '?'} — ${fmtTime(Math.ceil(msLeft / 1000))} remaining`
    bar.style.width     = pct + '%'

    // Phase 22 (22C): Push Harder button — last ACTIVE_PUSH_HARDER_WINDOW_FRAC of the timer, Active Mode only.
    const pushBtn = document.getElementById('_exp_push')
    if (pushBtn) {
      const inWindow = pct >= (100 - ACTIVE_PUSH_HARDER_WINDOW_FRAC * 100)
      pushBtn.classList.toggle('hidden', !inWindow || !!s.expedition.pushed)
      pushBtn.disabled = s.expedition.pushed || s.spiritStones < ACTIVE_PUSH_HARDER_COST
      pushBtn.classList.toggle('available', !pushBtn.disabled)
      pushBtn.textContent = s.expedition.pushed ? 'Pushed ✓' : `Push Harder (-${ACTIVE_PUSH_HARDER_COST})`
    }
  }

  function updateSprite(s) {
    renderer.setState(s.derived.stage?.spriteState || 'idle')
    renderer.setStageColor(s.derived.stage?.color || '#CC6010')
  }

  // ── Techniques tab ────────────────────────────────────────────────────────

  function renderTechniques(s) {
    const el = document.getElementById('tab-techniques')
    el.innerHTML = ''

    const grid = document.createElement('div')   // 1.8b-5: cards side by side in Expanded/Desktop
    grid.className = 'card-grid'
    el.appendChild(grid)
    const qb    = TECHNIQUES.find(t => t.id === 'qi_breathing')
    const qbRow = document.createElement('div')
    qbRow.className = 'tech-row owned'
    qbRow.innerHTML = techRowHTML(qb, true, false)
    grid.appendChild(qbRow)

    for (const t of TECHNIQUES) {
      if (t.id === 'qi_breathing') continue
      const isOwned  = s.techniques.includes(t.id)
      const isLocked = s.stageIndex < t.minStage
      const row = document.createElement('div')
      row.className = 'tech-row' + (isOwned ? ' owned' : '') + (isLocked ? ' locked' : '')
      row.innerHTML = techRowHTML(t, isOwned, isLocked)
      if (!isOwned && !isLocked) {
        row.addEventListener('click', () => quickActions.learn(t.id))
      }
      grid.appendChild(row)
    }
  }

  function techRowHTML(t, isOwned, isLocked) {
    const right = isOwned
      ? '<div class="tech-owned">✓ Learned</div>'
      : isLocked
        ? `<div class="tech-cost tech-lock" title="Unlocks at ${stageShortName(t.minStage)}">${Icon('lock')} ${stageShortName(t.minStage)}</div>`
        : `<div class="tech-cost">${Icon('stone')} ${t.cost}</div>`
    return `
      <div class="tech-main">
        <div class="tech-name" title="${t.nameCN}">${t.name}</div>
        <div class="tech-sub">${t.desc}</div>
      </div>
      <div class="tech-right">${right}<div class="tech-bonus">${effectText(t.effect)}</div></div>
    `
  }

  function effectText(e) {
    if (!e) return ''
    if (e.type === 'qps_mult')          return `×${e.value} Qi/s`
    if (e.type === 'qi_cap_mult')        return `×${e.value} Cap`
    if (e.type === 'breakthrough_bonus') return `+${Math.round(e.value*100)}% BT`
    if (e.type === 'karma_gain')         return `+Karma/s`
    return ''
  }

  // ── Stats tab ─────────────────────────────────────────────────────────────

  function renderStats(s) {
    // 1.8b-2: Character view. Every derived number is a tile that opens its breakdown (data-bd → BreakdownUI).
    const d  = s.derived
    const st = d.stage
    const lastMortal = CULTIVATION_STAGES.length - 2
    const integ  = d.realmIntegrity ?? 100
    const health = s.health ?? 100, healthMax = d.maxHealth || 100, hpPct = health / healthMax * 100   // Phase 14
    const tone = v => v >= 70 ? 'jade' : v >= 30 ? '' : 'warn'
    const body = gameState.bodyInfo(), mg = gameState.minigameInfo()
    const persona = PERSONALITIES.find(x => x.id === s.personality?.id)
    const fp = st.id === 'ascension' ? null : gameState.btFailPreview()
    const toFill = Math.max(0, d.qiCap * 0.9 - s.qi)
    const barColor = v => v >= 70 ? 'var(--jade)' : v >= 30 ? 'var(--gold)' : 'var(--red)'
    const tile = (bd, key, glyph, val, sub, cls = '', bar) => `<button class="ch-tile ${cls}" data-bd="${bd}">
        <span class="t-k"><span>${key}</span><i>${Icon.g(glyph)}</i></span><span class="t-v">${val}</span>
        ${sub ? `<span class="t-s">${sub}</span>` : ''}${bar != null ? `<span class="ch-bar"><div data-w="${Math.max(0, Math.min(100, bar))}" data-bar="${barColor(bar)}"></div></span>` : ''}</button>`

    let btTile
    if (st.id === 'ascension') btTile = `<div class="ch-tile wide"><span class="t-k"><span>Ascended</span><i data-icon="cloud"></i></span><span class="t-v">Beyond the mortal path</span></div>`
    else if (s.stageIndex === lastMortal) {
      // Phase 47: the Trial is gated on a full bloodline (100) — show the lock, not a misleading chance.
      const bq = Math.round(s.bloodlineQuality || 0), need = ASCENSION_MIN_BLOODLINE, locked = bq < need
      btTile = tile('bt', 'Ascension Trial', 'lightning', locked ? 'Locked' : (gameState.ascensionChance() * 100).toFixed(1) + '%',
        locked ? `Bloodline ${bq} / ${need} required` : 'Failure ends this life', locked ? 'warn wide' : 'wide')
    }
    else btTile = tile('bt', 'Breakthrough', 'breakthrough', (d.breakthroughChanceDisplay * 100).toFixed(1) + '%',
      fp.guaranteed ? 'Pill guarantees success' : `Fails: −${Math.round(fp.qiLossFrac * 100)}% Qi · −${Math.round(fp.integrityLoss)} Integrity${fp.karmaLoss ? ` · −${Math.round(fp.karmaLoss)} Karma` : ''}${fp.demotes ? ' · fall a stage' : ''}`,
      fp.demotes ? 'warn wide' : 'wide')

    const none = '<span class="ch-none">none</span>'
    const sectName = s.sect?.id ? SECTS.find(x => x.id === s.sect.id)?.name : null
    const el = document.getElementById('tab-stats')
    el.innerHTML = `<div class="ch-view">
      <div class="ch-head" data-color="${st.color || ''}">
        <div class="ch-realm">${escHtml(s.name)}</div>
        <div class="ch-layer">${escHtml(stageShortName(s.stageIndex))}</div>
        <div class="ch-tags">
          <span class="ch-tag root" title="Spiritual root: multiplies all Qi"><b data-icon="root"></b>${escHtml(latinOnly(s.root.name))} ×${s.root.mult}</span>
          ${persona ? `<span class="ch-tag" title="${escHtml(persona.blurb)}"><b data-icon="mask"></b>${escHtml(persona.name)}</span>` : ''}
        </div>
        <div class="ch-meta" title="Age passes only while the game is open. Nothing dies of age.">Age ${Math.floor(s.age)} · Year ${Math.floor(s.world.year)} · Gen ${s.generation || 1}</div>
        ${persona ? `<div class="ch-persona">${escHtml(persona.blurb)}</div>` : ''}
      </div>
      <div class="ch-grid">
        <section>
          <div class="ch-sec-title"><span>Cultivation</span></div>
          <div class="ch-tiles">
            ${tile('qps', 'Qi / second', 'qi', fmt(d.qiPerSecondBoosted), `${(d.breakdown?.qps || []).length} sources${d.meditBonus > 1 ? ' · meditating' : ''}`, 'jade')}
            ${tile('cap', 'Qi capacity', 'dantian', fmt(d.qiCap), toFill > 0 && d.qiPerSecondBoosted > 0 ? `Ready in ${fmtTime(Math.ceil(toFill / d.qiPerSecondBoosted)).replace(/ /g, '\u00a0')}` : 'Ready to break through')}
            ${btTile}
          </div>
          <button class="ch-play" data-mg-open="flow" ${mg.flow.charges || mg.flow.waiting ? '' : 'disabled'} title="Turn the meridian channels until the Qi flows: +${fmt(mg.flow.qi)} Qi, at your own pace. Charges refill one every 30 minutes, even while you are away.">
            <i data-icon="vein"></i><span><b>Meridian Flow</b> · ${mg.flow.waiting ? 'resume · ' : ''}+${fmt(mg.flow.qi)} Qi</span><span class="ch-charges">${'<b class="on"></b>'.repeat(mg.flow.charges)}${'<b></b>'.repeat(mg.max - mg.flow.charges)}</span>${mg.flow.charges || mg.flow.waiting ? '' : `<em>${fmtTime(mg.flow.nextIn)}</em>`}</button>
        </section>
        <section>
          <div class="ch-sec-title"><span>Foundation</span></div>
          <div class="ch-tiles">
            ${tile('integrity', 'Integrity', 'integrity', Math.round(integ), integ >= 100 ? 'Settled' : 'Mending', tone(integ), integ)}
            ${tile('health', 'Health', 'health', `${Math.round(health)}<small> / ${healthMax}</small>`, health >= healthMax ? 'Whole' : `+1 every ${Math.round(d.healthRegenSeconds || 45)}s`, tone(hpPct), hpPct)}
            ${tile('body', 'Body', 'shield', `${body.def.id} · ${escHtml(body.def.name)}`, body.trial.ready ? 'Ready for the tier trial' : body.next ? `${fmt(body.xp)} / ${fmt(body.to)} XP` : 'The body can go no higher', body.trial.ready ? 'gold' : '', body.next ? Math.min(100, (body.xp - body.from) / (body.to - body.from) * 100) : 100)}
            ${tile('karma', 'Karma', 'lotus', Math.round(s.karma), `+${(s.karma / 10).toFixed(1)}% breakthrough`)}
            ${bloodlineVisible(s) ? tile('bloodline', 'Bloodline', 'vein', Math.round(s.bloodlineQuality || 0), `Qi ×${(1 + (s.bloodlineQuality || 0) * BLOODLINE_QI_COEF).toFixed(2)} · ${(s.bloodlineQuality || 0) >= BLOODLINE_CAP ? `+${((s.bloodlineQuality || 0) * ASCENSION_BQ_COEF * 100).toFixed(1)}% Ascension` : `Ascension at ${ASCENSION_MIN_BLOODLINE}`}`)
              : `<div class="ch-tile" title="Bloodline Quality is revealed once it grows (from your second life) — it raises Qi/s and Ascension odds"><span class="t-k"><span>Bloodline</span><i data-icon="vein"></i></span><span class="t-v ch-sealed" data-icon="lock"></span><span class="t-s">Sealed — grows with each life</span></div>`}
          </div>
        </section>
        <section>
          <div class="ch-sec-title"><span>Belongings &amp; Bonds</span></div>
          <div class="ch-list">
            ${sr('Weapon', s.equipped.weapon ? escHtml(ITEMS[s.equipped.weapon]?.name || s.equipped.weapon) : none)}
            ${sr('Artifact', s.equipped.artifact ? escHtml(ITEMS[s.equipped.artifact]?.name || s.equipped.artifact) : none)}
            ${sr('Techniques', `${s.techniques.length} of ${TECHNIQUES.length}`)}
            ${sr('Beasts', `${(s.beasts || []).length} / ${d.maxBeasts || 3}`)}
            ${sr('Spirit Stones', fmt(s.spiritStones))}
            ${s.ownSect?.founded ? sr('Own Sect', `${escHtml(s.ownSect.name)} · ${s.ownSect.disciples.length}/${d.discipleCap} disciples`) : ''}
            ${s.ownSect?.founded ? sr('Sect Wars', `${s.sectWar.warVictories} won · ${s.sectWar.warDefeats} lost`) : ''}
            ${sectName ? sr('Sect', `${escHtml(sectName)} · ${SECT_RANKS[s.sect.rank]?.name || ''}`) : ''}
          </div>
        </section>
        <section>
          <div class="ch-sec-title"><span>Record</span></div>
          <div class="ch-list">
            ${sr('Breakthroughs', `${s.stats.breakthroughs} · ${s.stats.failed} failed`)}
            ${sr('Meditations', s.stats.meditationSessions)}
            ${sr('Qi gathered', fmt(s.stats.totalQiGained))}
            ${sr('Time cultivating', fmtTime(s.stats.timePlayed))}
            ${(s.deaths || 0) > 0 ? sr('Lives ended', s.deaths) : ''}
            ${s.stats.ascensionAttempts > 0 ? sr('Ascension Trials', `${s.stats.ascensionAttempts} · ${s.stats.ascensions || 0} survived`) : ''}
          </div>
        </section>
      </div></div>`
    // Colors + bar widths through CSSOM (CSP blocks inline style attributes)
    const head = el.querySelector('.ch-head')
    if (head.dataset.color) head.style.setProperty('--ch-color', head.dataset.color)
    el.querySelectorAll('.ch-bar > div').forEach(b => { b.style.width = b.dataset.w + '%'; b.style.setProperty('--bar', b.dataset.bar) })
  }

  // ── 家 Kin → Family (1.8b-3a: renderer/game/family-view.js — spouse/courtship, wishes, children, heir) ──
  let familyView = null
  function renderFamily(s) {
    familyView ||= new FamilyView(gameState, {
      esc: escHtml, fmt, stageLabel: personStageLabel, affectionLabel, bondLabel, latinOnly,
      rename: openRename,
      confirm: showConfirm, flash: flashMessage, wire: wireKinButtons, endText: SPOUSE_END_TEXT, pendingKey: familyPendingKey,
      go: view => nav.go(view),   // the family tree's door (family-tree.js)
    })
    familyView.render(s)
  }

  // ── 家 Kin → Tree (2026-10-03: renderer/game/family-tree.js — the family tree, opened from Kin → Family) ──
  let treeView = null
  function renderTree(s) {
    treeView ||= new FamilyTreeView(gameState, { esc: escHtml, stageLabel: personStageLabel, latinOnly, causeText: c => DEATH_CAUSE_TEXT[c] || null,
      go: view => nav.go(view), openOnFamily: id => { if (familyView) familyView.openChild = familyView.gs.get().family.children?.some(c => c.id === id) ? id : null; nav.go('family') } })
    treeView.render(s)
  }

  // ── 家 Kin → Clan + Hall (1.8b-4: renderer/game/clan-view.js) ──
  let clanView = null, hallView = null
  const kinHelpers = () => ({ esc: escHtml, fmt, fmtTime, stageLabel: personStageLabel, bondLabel, confirm: showConfirm, flash: flashMessage,
    wire: wireKinButtons, go: view => openHallOverlay(view), epitaphFor, fillEpitaph, openSoul: () => soulView.open() })
  function renderClan(s) { (clanView ||= new ClanView(gameState, kinHelpers())).render(s) }
  function renderHall(s) { (hallView ||= new HallView(gameState, kinHelpers())).render(s) }
  // The Hall was a pop-over until 1.8b-4; it is now Kin → Hall. Kept as the one entry point (banner peeks open).
  function openHallOverlay(view = 'hall') {
    if (layoutUI.mode === 'banner') layoutUI.peek(false)
    nav.go(view)
  }

  // ── 世 World → Banter (1.8b-1: was at the bottom of Stats) ──
  function renderBanter(s) {
    const el = document.getElementById('tab-banter')
    el.innerHTML = renderBanterLog(s) || '<div class="empty-note">No idle chatter yet. Your cultivator mutters to the wind now and then.</div>'
  }

  function wireKinButtons(root) {
    const $ = id => root.querySelector('#' + id)
    $('_matchmaker')?.addEventListener('click', () => openProposalOverlay(gameState.get()))
    $('_family-matter')?.addEventListener('click', () => openFamilyOverlay(gameState.get()))
    $('_choose-heir')?.addEventListener('click', () => openHeirOverlay())
    $('_hall')?.addEventListener('click', () => openHallOverlay())
    $('_tournament')?.addEventListener('click', () => {
      if (gameState.get().family.tournament) return openTournamentOverlay()
      showConfirm('Host a Tournament of Heirs?', 'Every adult child fights. Rounds are to the death until four remain. It cannot be stopped once blood is spilled.', () => {
        if (gameState.startTournament().ok) openTournamentOverlay()
      }, 'Begin')
    })
    root.querySelectorAll('[data-plan]').forEach(btn => btn.addEventListener('click', () => gameState.setFamilyPlanning(btn.dataset.plan)))
    root.querySelectorAll('[data-end-affair]').forEach(btn => btn.addEventListener('click', () => {
      showConfirm('End the affair?', 'Children already born stay yours.', () => gameState.endAffair(btn.dataset.endAffair), 'End It')
    }))
    $('_pass-mantle')?.addEventListener('click', () => {
      showConfirm('Pass the Mantle?', 'This ends your life peacefully, now. Cannot be undone.', () => {
        gameState.passTheMantle()
      }, 'Pass the Mantle')
    })
    $('_challenge-head')?.addEventListener('click', () => {
      showConfirm('Challenge the head?', 'The head decides whether this is to the death. If they choose blood and you lose, this life ends.', () => {
        const res = gameState.challengeHead()
        if (res.fight) combatView.resume()   // A6-3a: fight it out on the battle page
      }, 'Challenge')
    })
    $('_declare-branch-war')?.addEventListener('click', () => {
      showConfirm('Declare war on the main line?', 'Your branch marches against the clan you were born into. The losing head is deposed — or does not survive it.', () => {
        const res = gameState.declareBranchWar()
        if (res.ok && res.won) flashMessage('Your branch prevails. The clan is yours.', 'positive')
        else if (res.ok && !res.died) flashMessage('Your branch is put down. You are deposed.', 'negative')
      }, 'Declare War')
    })
    $('_push-branch-war')?.addEventListener('click', () => {
      showConfirm('Press your branch head to war?', 'They decide for themselves whether to march, weighing their temper against the odds.', () => {
        const res = gameState.pushBranchWar()
        if (res.ok && res.declared === false) flashMessage('They refuse — not yet.', 'neutral')
      }, 'Push')
    })
    $('_secede')?.addEventListener('click', () => {
      showConfirm('Secede and found a new clan?', 'You leave with your whole branch. The old clan lives on as a rival or ally, depending on how you part.', () => {
        gameState.secede()
      }, 'Secede')
    })
  }

  // Affection tiers (family.md) — UI only; the number is shown alongside.
  function affectionLabel(a) {
    if (a >= AFFECTION_DEVOTED) return { word: 'Devoted', color: 'var(--jade)', tone: 'jade' }
    if (a >= 50)                return { word: 'Warm',    color: 'var(--text)', tone: 'warm' }
    if (a >= AFFECTION_CRISIS)  return { word: 'Cool',    color: 'var(--gold)', tone: 'gold' }
    return                             { word: 'Cold',    color: 'var(--red)', tone: 'red' }
  }

  // Child bond tiers (clan-succession.md 2.6b) — UI only.
  function bondLabel(b) {
    if (b >= 70)                return { word: 'Close',    color: 'var(--jade)', tone: 'jade' }
    if (b >= 45)                return { word: 'Fond',     color: 'var(--text)', tone: 'warm' }
    if (b >= CHILD_BOND_CRISIS) return { word: 'Distant',  color: 'var(--gold)', tone: 'gold' }
    return                             { word: 'Estranged', color: 'var(--red)', tone: 'red' }
  }

  const SPOUSE_END_TEXT = { left: 'left you', divorced: 'divorced', suicide: 'took their own life',
                            murder_suicide: 'died, and took children with them', duel: 'fell in a duel with you' }


  // ── Banter (Phase 29) ─────────────────────────────────────────────────────

  function banterText(text, s) {
    return (s || gameState.get())?.settings?.profanity === 'masked' ? BanterSystem.mask(text) : text
  }

  function renderBanterLog(s) {
    const log = s.banter?.log || []
    if (!log.length) return ''
    return `<div class="banter-log-head">Banter</div>
      ${log.map(l => `<div class="banter-log-line"><span class="banter-log-ago">${fmtAgo(l.ts)}</span> ${escHtml(banterText(l.text, s))}</div>`).join('')}`
  }

  let _bubbleTimer = null
  function showBanterBubble(text, s) {
    const el = document.getElementById('banter-bubble')
    document.getElementById('banter-text').textContent = banterText(text, s)
    el.classList.remove('hidden', 'fading')
    if (_bubbleTimer) clearTimeout(_bubbleTimer)
    _bubbleTimer = setTimeout(() => {
      el.classList.add('fading')
      _bubbleTimer = setTimeout(() => el.classList.add('hidden'), 600)
    }, BANTER_BUBBLE_SECONDS * 1000)
  }
  document.getElementById('banter-bubble').addEventListener('click', () => {
    if (_bubbleTimer) clearTimeout(_bubbleTimer)
    document.getElementById('banter-bubble').classList.add('hidden')
  })

  // ── 宗 Sect (1.8b-5): Overview · Missions/Buildings/Disciples · War — renderer/game/sect-view.js ──────────
  let sectView = null
  const sectHelpers = () => ({ esc: escHtml, fmt, fmtTime, flash: flashMessage, confirm: showConfirm, go: v => nav.go(v),
    orders: (s, el, side) => renderWarOrdersPanel(s, el, side), startMission: id => quickActions.startMission(id), fight: () => combatView.resume() })   // 43e: the master challenge
  function renderSect(s, view = 'sect') { (sectView ||= new SectView(gameState, sectHelpers())).render(view, s) }

  // ── Automation panel (Phase 22, section 22D) ───────────────────────────────
  // Lives in the Mode panel only (1.8b-1; it used to render at the top of Explore and both Sect views) — a
  // roadmap of what's unlocked and what unlocks next. Reuses the Settings panel's .set-row/.set-label/.set-seg/.set-opt
  // CSS (same trick as renderWarOrdersPanel below) so it needs no new stylesheet.
  function renderAutomationPanel(s, el) {
    const box = document.createElement('div')
    box.className = 'auto-list' + (s.playMode === 'active' ? ' resting' : '')
    if (s.playMode === 'active') {
      const note = document.createElement('div')
      note.className = 'auto-note'
      note.textContent = 'Resting while you play Active. Your switches are kept; they resume in Idle.'
      box.appendChild(note)
    }

    const ROWS = [
      ['autoExplore', 'Auto-Explore', 'Sends you back out when an expedition returns. Choose where below.'],
      ['autoSectMissions', 'Auto-Missions', 'Keeps the missions you pick running, or re-takes whichever finished.'],
      ['autoCraft', 'Auto-Craft', 'Crafts every recipe you mark Auto in Pack → Craft, whenever materials allow.'],
      ['autoBreakthrough', 'Auto-Breakthrough', 'Attempts a breakthrough once Qi reaches the threshold.'],
      ['autoTemper', 'Auto-Temper', 'Repeats a safe body drill whenever it ends (pick which on Path → Body). Never an ordeal.'],   // Phase 14
    ]
    for (const [key, name, what] of ROWS) {
      const unlocked = gameState.automationUnlocked(key)
      const row = document.createElement('div')
      row.className = 'set-row auto-row' + (unlocked ? '' : ' locked')
      const label = document.createElement('div')
      label.className = 'set-label'
      label.innerHTML = `<span class="auto-name">${unlocked ? '' : `${Icon('lock')} `}${name}</span><span class="auto-what">${what}</span>`
      row.appendChild(label)
      if (unlocked) {
        const seg = document.createElement('div')
        seg.className = 'set-seg'
        for (const [val, lab] of [[true, 'On'], [false, 'Off']]) {
          const b = document.createElement('button')
          b.className = 'set-opt' + (s.automation[key] === val ? ' active' : '') + (val ? ' is-on' : '')
          b.textContent = lab
          b.addEventListener('click', () => {
            const res = gameState.setAutomation(key, val)
            if (!res.ok) flashMessage('Cannot change automation', 'negative')
          })
          seg.appendChild(b)
        }
        row.appendChild(seg)
      } else {
        const hint = document.createElement('div')
        hint.className = 'auto-unlock'
        hint.textContent = `at ${AUTOMATION_UNLOCKS[key].label}`
        row.appendChild(hint)
      }
      box.appendChild(row)

      if (key === 'autoExplore' && unlocked && s.automation.autoExplore) {
        const pick = document.createElement('div')
        pick.className = 'auto-loc-pick'
        pick.innerHTML = '<div class="auto-loc-h">Idle on</div>'
        const chips = document.createElement('div')
        chips.className = 'auto-loc-chips'
        const cur = s.automation.autoExploreLocationId
        const opts = [[null, 'Last one I sent', 'Relaunches whichever location you sent yourself most recently']]
          .concat(LOCATIONS.filter(l => s.stageIndex >= l.minStage).map(l => [l.id, l.name, `Always relaunch ${l.name} (${l.duration >= 60 ? Math.floor(l.duration / 60) + 'm' : l.duration + 's'} away)`]))
        for (const [id, name, tip] of opts) {
          const b = document.createElement('button')
          b.className = 'pack-chip' + (cur === id ? ' active' : '')
          b.textContent = name
          b.title = tip
          b.addEventListener('click', () => {
            const res = gameState.setAutoExploreLocation(id)
            if (!res.ok) flashMessage('Cannot choose that location', 'negative')
          })
          chips.appendChild(b)
        }
        pick.appendChild(chips)
        box.appendChild(pick)
      }

      // Auto-Missions: which missions to keep running (same chip picker as Auto-Explore's "Idle on"). Picks are read
      // when a slot frees, so changing them mid-mission swaps what runs next.
      if (key === 'autoSectMissions' && unlocked && s.automation.autoSectMissions && s.sect?.id) {
        const pick = document.createElement('div')
        pick.className = 'auto-loc-pick'
        const ids = s.automation.autoSectMissionIds
        pick.innerHTML = `<div class="auto-loc-h">Keep running <span class="auto-loc-n">${ids.length ? `${ids.length} of ${SECT_MAX_MISSIONS} picked` : 'up to ' + SECT_MAX_MISSIONS}</span></div>`
        const chips = document.createElement('div')
        chips.className = 'auto-loc-chips'
        const any = document.createElement('button')
        any.className = 'pack-chip' + (ids.length ? '' : ' active')
        any.textContent = 'Whatever finished'
        any.title = 'Re-takes each mission as it finishes'
        any.addEventListener('click', () => { for (const id of [...ids]) gameState.setAutoSectMission(id, false) })
        chips.appendChild(any)
        for (const m of SECT_MISSIONS.filter(m => s.sect.rank >= m.minRank)) {
          const b = document.createElement('button')
          const on = ids.includes(m.id)
          b.className = 'pack-chip' + (on ? ' active' : '')
          b.textContent = m.name
          b.title = on ? 'Picked: taken up whenever a slot is free. Click to unpick.' : `Keep ${m.name} running`
          b.addEventListener('click', () => {
            const res = gameState.setAutoSectMission(m.id, !on)
            if (!res.ok) flashMessage(res.reason === 'full' ? `Pick at most ${SECT_MAX_MISSIONS}: unpick one first` : 'Cannot pick that mission', 'negative')
          })
          chips.appendChild(b)
        }
        pick.appendChild(chips)
        box.appendChild(pick)
      }

      if (key === 'autoBreakthrough' && unlocked && s.automation.autoBreakthrough) {
        const tr = document.createElement('div')
        tr.className = 'set-row'
        const trLabel = document.createElement('div')
        trLabel.className = 'set-label'
        trLabel.textContent = '…at Qi ≥'
        tr.appendChild(trLabel)
        const wrap = document.createElement('div')
        wrap.className = 'set-range'
        const input = document.createElement('input')
        input.type = 'range'
        input.min = AUTO_BREAKTHROUGH_THRESHOLD_MIN; input.max = AUTO_BREAKTHROUGH_THRESHOLD_MAX; input.step = AUTO_BREAKTHROUGH_THRESHOLD_STEP
        input.value = s.automation.breakthroughThreshold
        const val = document.createElement('span')
        val.className = 'set-range-val'
        val.textContent = Math.round(s.automation.breakthroughThreshold * 100) + '%'
        input.addEventListener('input', () => { val.textContent = Math.round(input.value * 100) + '%' })
        input.addEventListener('change', () => gameState.setAutomation('breakthroughThreshold', Number(input.value)))
        wrap.append(input, val)
        tr.appendChild(wrap)
        box.appendChild(tr)
      }
    }

    // Beast Auto-Expedition is set per companion (Roam → Beasts); this row says it exists and how many are on it.
    const beasts = s.beasts || [], ready = beasts.filter(b => gameState.beastAutoUnlocked(b)), onAuto = beasts.filter(b => b.autoExp && gameState.beastAutoUnlocked(b))
    const brow = document.createElement('div')
    brow.className = 'set-row auto-row' + (ready.length ? '' : ' locked')
    brow.innerHTML = `<div class="set-label"><span class="auto-name">${ready.length ? '' : `${Icon('lock')} `}Beast Auto-Expedition</span><span class="auto-what">Each companion from Lv.${BEAST_AUTO_EXPEDITION_LEVEL} can keep going out on its own. Set it on the beast's card.</span></div>
      <div class="auto-unlock">${ready.length ? `${onAuto.length} of ${ready.length} on auto` : `at beast Lv.${BEAST_AUTO_EXPEDITION_LEVEL}`}</div>`
    box.appendChild(brow)
    el.appendChild(box)
  }

  // ── War Standing Orders (Phase 32) ─────────────────────────────────────────
  // Rendered into Sect → War for both sides (SectView calls it through its helpers, 1.8b-5).
  // Reuses the Settings panel's .set-row/.set-label/.set-seg/.set-opt CSS so it fits 300px without
  // its own stylesheet (see docs/systems/settings.md).
  function renderWarOrdersPanel(s, el, side) {
    const o = s.warOrders
    if (!o) return
    const title = document.createElement('div')
    title.className = 'section-title'
    title.textContent = 'Standing Orders'
    el.appendChild(title)

    const segRow = (label, key, options, hint) => {
      const row = document.createElement('div')
      row.className = 'set-row'
      const lab = document.createElement('div')
      lab.className = 'set-label'
      lab.textContent = label
      if (hint) lab.title = hint
      row.appendChild(lab)
      const wrap = document.createElement('div')
      wrap.className = 'set-seg'
      for (const opt of options) {
        const b = document.createElement('button')
        b.className = 'set-opt' + (opt.value === o[key] ? ' active' : '')
        b.textContent = opt.label
        b.addEventListener('click', () => gameState.setWarOrder(key, opt.value))
        wrap.appendChild(b)
      }
      row.appendChild(wrap)
      el.appendChild(row)
    }

    // opts: { step, presets: [[label, value], …] } — presets are one-click amounts beside the stepper
    const numRow = (label, key, hint, opts = {}) => {
      const row = document.createElement('div')
      row.className = 'set-row'
      const lab = document.createElement('div')
      lab.className = 'set-label'
      lab.textContent = label
      if (hint) lab.title = hint
      row.appendChild(lab)
      const input = document.createElement('input')
      input.type = 'number'
      input.className = 'sect-input warord-input'
      input.min = 0
      input.step = opts.step || 10
      input.value = o[key]
      input.addEventListener('change', () => gameState.setWarOrder(key, input.value))
      // Themed −/+ steppers (the native Windows spin arrows are hidden app-wide in styles.css)
      const wrap = document.createElement('div')
      wrap.className = 'num-step'
      const stepBtn = (txt, dir) => {
        const b = document.createElement('button')
        b.type = 'button'; b.className = 'num-step-btn'; b.textContent = txt
        b.title = `${dir > 0 ? '+' : '−'}${input.step} stones`
        b.disabled = dir < 0 ? !(Number(o[key]) > 0) : (opts.max != null && Number(o[key]) >= opts.max)
        b.addEventListener('click', () => {
          input.value = Math.min(opts.max ?? Infinity, Math.max(0, (Number(input.value) || 0) + dir * Number(input.step)))
          gameState.setWarOrder(key, input.value)
        })
        return b
      }
      wrap.append(stepBtn('−', -1), input, stepBtn('+', 1))
      const ctl = document.createElement('div')
      ctl.className = 'num-ctl'
      if (opts.presets) {
        const seg = document.createElement('div')
        seg.className = 'set-seg num-presets'
        for (const [plabel, pval] of opts.presets) {
          const b = document.createElement('button')
          b.type = 'button'; b.className = 'set-opt' + (Number(o[key]) === pval ? ' active' : ''); b.textContent = plabel
          b.title = pval + ' Spirit Stones'
          b.addEventListener('click', () => { input.value = pval; gameState.setWarOrder(key, pval) })
          seg.appendChild(b)
        }
        ctl.appendChild(seg)
      }
      ctl.appendChild(wrap)
      row.appendChild(ctl)
      el.appendChild(row)
    }
    // What a war-chest order actually buys, with this character's numbers (1.8b quick fix, user 2026-09-27)
    const chestNote = () => {
      const full = gameState.memberWarChestFull()
      const per = Math.min(full, o.chestStones || 0)
      const rankMult = SECT_RANKS[s.sect?.rank]?.rewardMult || 1
      const pct = Math.round(MEMBER_WAR_CHEST_MAX_BONUS * Math.min(1, per / full) * rankMult * 100)
      const note = document.createElement('div')
      note.className = 'warord-note'
      note.innerHTML = (per > 0
          ? `<span class="wn-you">Your tithe: <b>${fmt(per)}</b> stones each war → <b class="up">+${pct}%</b> war strength (better odds of victory), <b>+${fmt(Math.floor(per * SECT_DONATE_RATE))}</b> Contribution${per < full * 0.1 ? ' <i>(a token gesture)</i>' : ''}</span>`
          : `<span class="wn-you">No tithe: you never give on your own (you can still give by hand during a war).</span>`) +
        `<br>Paid from your pouch when you answer a call, never more than you hold. The chest takes at most ${fmt(full)} (±${Math.max(10, Math.round(full / 10 / 10) * 10)} per step).`
      el.appendChild(note)
    }

    if (side === 'member') {
      segRow('Answer calls', 'answer', [
        { value: 'always', label: 'Always' }, { value: 'defensive', label: 'Defensive' }, { value: 'stay_out', label: 'Stay out' },
      ], 'Defensive behaves like Always for now — every member war today is your sect being attacked.')
      { const full = gameState.memberWarChestFull()
        numRow('War chest', 'chestStones', 'Spirit Stones given each war; capped by the chest and what you hold',
          { max: full, step: Math.max(10, Math.round(full / 10 / 10) * 10), presets: [['None', 0], ['Half', Math.round(full / 2)], ['Full', full]] }) }
      chestNote()
      segRow('Lend beast', 'lendBeast', [{ value: 'never', label: 'Never' }, { value: 'strongest', label: 'Strongest' }])
    } else if (side === 'own') {
      segRow('Reinforce', 'reinforce', [{ value: 'never', label: 'Never' }, { value: 'if_affordable', label: 'If affordable' }])
      numRow('…and keeps at least', 'reinforceKeep', 'Only reinforce if this many Spirit Stones remain banked afterward')
      segRow('Request ally', 'ally', [{ value: 'never', label: 'Never' }, { value: 'cheapest', label: 'Cheapest' }, { value: 'best', label: 'Best' }])
      segRow('Raze if we win', 'raze', [{ value: 'never', label: 'Never' }, { value: 'theirs', label: 'Wars they start' }, { value: 'always', label: 'Every war' }],
        'Vow to burn the foe to the ground if your sect wins. Costs karma and the regard of some sects; a vow you set or lift by hand on a war always wins.')
    }
  }

  function updateSectTimersInPlace(s) {
    const secs = at => fmtTime(Math.max(0, Math.ceil((at - Date.now()) / 1000)))
    if (s.ownSect?.founded) document.querySelectorAll('[data-pooltimer]').forEach(n => { n.textContent = secs(s.ownSect.poolRefreshAt) })
    const w = s.sectWar
    if (w) {
      // Member wars show time to battle for the whole window; own-sect wars count down each phase
      const target = w.phase === 'scouting' ? w.scoutEndsAt + (w.side === 'member' ? MEMBER_WAR_PREP_SECONDS * 1000 : 0)
                   : w.phase === 'preparing' ? w.prepEndsAt : w.nextWarAt
      document.querySelectorAll('[data-wartimer]').forEach(n => { n.textContent = secs(target) })
    }
    document.querySelectorAll('.sect-mission-timer').forEach(node => {
      const a = s.sect?.activeMissions?.find(x => x.uid === node.dataset.uid)
      const m = SECT_MISSIONS.find(x => x.id === node.dataset.mid)
      if (!a || !m) return
      const msLeft = Math.max(0, a.endsAt - Date.now())
      node.textContent = `${fmtTime(Math.ceil(msLeft / 1000))} remaining`
      const bar = document.querySelector(`[data-barfor="${a.uid}"]`)
      if (bar) bar.style.width = Math.max(0, Math.min(100, 100 - msLeft / (m.duration * 1000) * 100)) + '%'
    })
  }


  function sr(k, v) {
    return `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>`
  }

  // ── Events tab ────────────────────────────────────────────────────────────

  function renderEvents(s) {
    const el = document.getElementById('tab-events')
    el.innerHTML = ''
    if (!s.events?.length) {
      el.innerHTML = '<div style="color:var(--dim);font-size:11px;text-align:center;padding:14px">No events yet…</div>'
      return
    }
    for (const ev of s.events) {
      const row = document.createElement('div')
      row.className = `ev-row ${ev.type || 'neutral'}`
      row.innerHTML = `${escHtml(ev.text)}<div class="ev-time">${fmtAgo(ev.ts)}</div>`
      el.appendChild(row)
    }
  }

  // ── Explore tab ───────────────────────────────────────────────────────────

  function renderExplore(s) {
    const el = document.getElementById('tab-explore')
    el.innerHTML = ''

    // Expedition status block
    const statusDiv = document.createElement('div')
    statusDiv.className = 'exp-status' + (s.expedition.active ? ' exp-status-active' : '')

    if (s.expedition.active) {
      const loc     = LOCATIONS.find(l => l.id === s.expedition.locationId)
      const msLeft  = Math.max(0, s.expedition.endsAt - Date.now())
      const sLeft   = Math.ceil(msLeft / 1000)
      const locDur  = loc?.duration || 1
      const pct     = Math.max(0, Math.min(100, 100 - (msLeft / (locDur * 1000)) * 100))
      statusDiv.innerHTML = `
        <div class="exp-status-label">Expedition</div>
        <div id="_exp_timer_line">${escHtml(loc?.name || '?')} — ${fmtTime(sLeft)} remaining</div>
        <div class="exp-timer-bar-wrap"><div class="exp-timer-bar" id="_exp_timer_bar" style="width:${pct}%"></div></div>
        ${s.playMode === 'active' ? `<button class="loc-btn hidden" id="_exp_push">Push Harder</button>` : ''}
      `
    } else {
      statusDiv.innerHTML = `
        <div class="exp-status-label">Expedition</div>
        <div class="exp-idle">Idle — choose a location below</div>
      `
    }
    // Auto-Explore lives here now (was a chip in the Roam sub-tab strip, clipped once Roam had five tabs): an On/Off
    // switch, what it does while on (where it sends you, that it rests in Active Mode), or when it unlocks.
    const autoRow = document.createElement('div')
    autoRow.className = 'exp-auto'
    if (gameState.automationUnlocked('autoExplore')) {
      const on = !!s.automation.autoExplore
      const where = s.automation.autoExploreLocationId ? LOCATIONS.find(l => l.id === s.automation.autoExploreLocationId)?.name : null
      const nextId = s.automation.autoExploreLocationId || s.automation.lastExploreLocationId
      const swaps = s.expedition.active && nextId && nextId !== s.expedition.locationId
      const note = !on ? 'sends you back out when an expedition returns'
        : s.playMode === 'active' ? 'rests while you play in Active Mode'
        : swaps ? `on: when this run returns, next is <b class="exp-auto-next">${escHtml(LOCATIONS.find(l => l.id === nextId)?.name || '?')}</b> · <button class="exp-auto-where" data-exp-where>change</button>`
        : `on: back out to ${where ? escHtml(where) : 'the last place you went'} · ${s.expedition.active ? 'pick <b>Go next</b> on a card to switch' : '<button class="exp-auto-where" data-exp-where>change where</button>'}`
      autoRow.innerHTML = `<span class="exp-auto-l">${Icon('auto')}<b>Auto-Explore</b><small>${note}</small></span>
        <span class="set-seg"><button class="set-opt is-on${on ? ' active' : ''}" data-exp-auto="1">On</button><button class="set-opt${on ? '' : ' active'}" data-exp-auto="0">Off</button></span>`
      autoRow.querySelectorAll('[data-exp-auto]').forEach(b => b.addEventListener('click', () => {
        const res = gameState.setAutomation('autoExplore', b.dataset.expAuto === '1')
        if (!res.ok) flashMessage('Cannot change Auto-Explore now', 'negative')
      }))
      autoRow.querySelector('[data-exp-where]')?.addEventListener('click', () => openModePanel())   // the location picker lives there
    } else {
      autoRow.classList.add('locked')
      autoRow.innerHTML = `<span class="exp-auto-l">${Icon('lock')}<b>Auto-Explore</b><small>unlocks at ${escHtml(AUTOMATION_UNLOCKS.autoExplore.label)}</small></span>`
    }
    statusDiv.appendChild(autoRow)

    // ── Encounters on the Road (family.md) — potential lovers + formula-carriers, never expire ────
    // Rendered at the very top of Explore (above the expedition timer): the attention item routes here, so a
    // pending choice must be on screen, not below the fold.
    const people = s.family?.encounters || []
    if (people.length > 0) {
      const pTitle = document.createElement('div')
      pTitle.className = 'section-title'
      pTitle.textContent = 'Encounters on the Road'
      el.appendChild(pTitle)
      people.forEach((enc, i) => {
        const p = enc.person
        const pers = PERSONALITIES.find(x => x.id === p.personality)
        if (enc.kind === 'recipe') {                                  // Phase 44: a stranger carrying a formula
          const rec = RECIPES.find(r => r.id === enc.recipeId)
          const product = rec ? ITEMS[rec.productId] : null
          const row = document.createElement('div')
          row.className = 'suitor-card'
          row.style.marginBottom = '6px'
          row.innerHTML = `
            <div class="suitor-name">${escHtml(Persons.fullName(p))}</div>
            <div>${escHtml(personStageLabel(p.stageIndex))} · ${escHtml(p.root?.name || '')}${pers ? ` · ${escHtml(pers.name)}` : ''}</div>
            <div style="margin:3px 0">At ${escHtml(enc.place)}, ${escHtml(Persons.fullName(p))} ${escHtml(enc.text || '')}.</div>
            <div style="margin:3px 0">Their formula: <b>${escHtml(product?.name || 'a pill')}</b>.</div>
            <div style="display:flex;gap:6px">
              <button class="sect-btn" style="flex:1;min-height:32px" data-learnrecipe="${i}">Help them · learn it</button>
              <button class="sect-btn" style="flex:1;min-height:32px" data-robrecipe="${i}" title="Take their stones and leave them the road. The formula goes with them.">Rob them</button>
              <button class="sect-btn" style="flex:1;min-height:32px" data-leave="${i}">Leave</button>
            </div>
            <div class="recipe-enc-note">Robbing pays ${RECIPE_DISCOVERY.robStones} stones but costs ${Math.abs(RECIPE_DISCOVERY.robKarma)} karma — and the formula is lost for good.</div>`
          el.appendChild(row)
          return
        }
        // A6-3a: Slaughter — a fight to the death, on the battle page. Locked while another fight runs or you are hurt.
        const lock = s.family.fight ? 'Another fight is underway' : (s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH ? 'Too wounded to fight' : null
        const row = document.createElement('div')
        row.className = 'suitor-card'
        row.style.marginBottom = '6px'
        row.innerHTML = `
          <div class="suitor-name">${escHtml(Persons.fullName(p))}</div>
          <div>${escHtml(personStageLabel(p.stageIndex))} · ${escHtml(p.root?.name || '')}${pers ? ` · ${escHtml(pers.name)}` : ''}</div>
          <div style="margin:3px 0">At ${escHtml(enc.place)}, they ${escHtml(enc.text || '')}.</div>
          <div style="display:flex;gap:6px">
            <button class="sect-btn" style="flex:1;min-height:32px" data-seduce="${i}">Seduce</button>
            <button class="sect-btn" style="flex:1;min-height:32px" data-slaughter="${i}" ${lock ? `disabled title="${escHtml(lock)}"` : `title="Fight them to the death. You choose every exchange; if you lose, this life ends."`}>Slaughter</button>
            <button class="sect-btn" style="flex:1;min-height:32px" data-leave="${i}">Leave</button>
          </div>${lock ? `<div style="font-size:9px;margin-top:3px;color:var(--gold)"><span data-icon="lock"></span>${escHtml(lock)}</div>` : ''}${s.family.spouse && !s.family.tolerant ? `<div style="font-size:9px;margin-top:3px;color:var(--gold)">${escHtml(s.family.spouse.given)} may find out.</div>` : ''}`
        el.appendChild(row)
      })
      el.querySelectorAll('[data-seduce]').forEach(btn => btn.addEventListener('click', () => {
        const res = gameState.seduceEncounter(+btn.dataset.seduce)
        if (res.ok) flashMessage(res.success ? 'An affair begins.' : 'Rebuffed.', res.success ? 'special' : 'negative')
      }))
      el.querySelectorAll('[data-slaughter]').forEach(btn => btn.addEventListener('click', () => {
        const res = gameState.slaughterEncounter(+btn.dataset.slaughter)
        if (!res.ok) return flashMessage({ busy: 'Another fight is underway.', wounded: 'Too wounded to fight.' }[res.reason] || 'You cannot fight now.', 'negative')
        combatView.resume()
      }))
      el.querySelectorAll('[data-learnrecipe]').forEach(btn => btn.addEventListener('click', () => {
        const res = gameState.learnEncounterRecipe(+btn.dataset.learnrecipe)
        flashMessage(res.ok ? `You learn to brew ${res.name}.` : 'The formula slips away.', res.ok ? 'special' : 'negative')
      }))
      el.querySelectorAll('[data-robrecipe]').forEach(btn => btn.addEventListener('click', () => {
        const res = gameState.robEncounterRecipe(+btn.dataset.robrecipe)
        flashMessage(res.ok ? `You rob them for ${fmt(res.stones)} Spirit Stones. The formula is lost.` : 'You cannot rob them.', 'negative')
      }))
      el.querySelectorAll('[data-leave]').forEach(btn => btn.addEventListener('click', () => gameState.dismissEncounter(+btn.dataset.leave)))
    }

    // Expedition status (below any pending encounter — a decision outranks the timer)
    el.appendChild(statusDiv)
    document.getElementById('_exp_push')?.addEventListener('click', () => {
      const r = gameState.pushExpedition()
      if (r.ok) flashMessage('Pushed harder — an extra roll awaits at return.', 'positive')
      else flashMessage(r.reason === 'stones' ? 'Not enough Spirit Stones' : 'Cannot push', 'negative')
    })

    // Locations list
    const locTitle = document.createElement('div')
    locTitle.className = 'section-title'
    locTitle.textContent = 'Locations'
    el.appendChild(locTitle)
    const locGrid = document.createElement('div')   // 1.8b-5: cards side by side in Expanded/Desktop
    locGrid.className = 'card-grid'
    el.appendChild(locGrid)

    for (const loc of LOCATIONS) {
      if (loc.minStage > s.stageIndex && !s.derived.hiddenLocations) {
        // Show locked locations for the next 2 unlockable stages only
        if (loc.minStage > s.stageIndex + 2) continue
      }

      const unlocked = s.stageIndex >= loc.minStage
      const here = s.expedition.active && s.expedition.locationId === loc.id
      // 1.8b-6: a location is a mission-style card (sect-view.js .sv-card): header, lore line, drop chips, a
      // "Set out" tile — the same pattern as sect missions, since it is the same "send out" action.
      const row = document.createElement('div')
      row.className = 'sv-card loc-card' + (unlocked ? '' : ' locked') + (here ? ' active' : '')

      const durText = loc.duration >= 60
        ? `${Math.floor(loc.duration/60)}m`
        : `${loc.duration}s`

      const autoOn = s.automation.autoExplore && gameState.automationUnlocked('autoExplore')
      const autoTarget = unlocked && autoOn && loc.id === (s.automation.autoExploreLocationId || s.automation.lastExploreLocationId)
      // While a run is out and Auto-Explore is on, another card queues itself as the next run ("Go next").
      const queue = unlocked && !here && s.expedition.active && autoOn
      const lock = !unlocked ? `Opens at ${stageShortName(loc.minStage)}`
        : here || queue ? '' : s.expedition.active ? (gameState.automationUnlocked('autoExplore') ? 'One at a time · turn on Auto-Explore to queue it next' : 'One expedition at a time') : ''
      const tileName = here ? 'Underway' : queue ? (autoTarget ? 'Next up' : 'Go next') : 'Set out'
      const tileSub  = here ? 'your party is on the road' : queue ? (autoTarget ? 'Auto-Explore goes here next' : `after this run · ${durText} away`) : `${durText} away · Tier ${loc.enemyTier} foes`
      row.innerHTML = `
        <div class="sv-card-h"><span class="sv-card-n" title="${escHtml(loc.nameCN)}">${escHtml(loc.name)}</span>${autoTarget ? `<span class="pack-chip loc-auto active" title="Auto-Explore idles here. Change it from the Idle button, top right.">${Icon('play')} Auto</span>` : ''}<span class="sv-card-t">${durText}</span></div>
        <div class="sv-card-d">${escHtml(loc.desc || '')}</div>
        <div class="sv-gains" title="Chance each item comes back from one run, and how many">${gameState.dropPreview(loc.id).map(d =>
          `<span class="sv-gain">${d.min === d.max ? d.min : `${d.min}–${d.max}`} ${escHtml(d.name)} <b class="ld-pct">${Math.round(d.chance * 100)}%</b></span>`).join('')}</div>
        <button class="fa-btn wide sv-go loc-btn${lock ? ' locked' : ''}${here || (queue && autoTarget) ? ' info' : ''}${queue ? ' loc-queue' : ''}" data-locid="${loc.id}" ${queue ? 'data-queue' : ''} ${lock || here || (queue && autoTarget) ? 'disabled' : ''}>
          <span class="fa-g">${Icon.g('explore')}</span><span class="fa-t"><span class="fa-n">${tileName}</span>
          <span class="fa-e">${lock ? `<span class="fa-lock"><i class="fa-lock-ic" data-icon="lock"></i>${escHtml(lock)}</span>` : tileSub}</span></span></button>
      `
      locGrid.appendChild(row)
    }

    // Wire Send buttons
    el.querySelectorAll('.loc-btn[data-locid]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.queue == null) return quickActions.sendExpedition(btn.dataset.locid)
        const res = gameState.setAutoExploreLocation(btn.dataset.locid)
        if (res.ok) flashMessage(`Next run: ${LOCATIONS.find(l => l.id === btn.dataset.locid)?.name}`, 'positive')
        else flashMessage('Cannot queue that location', 'negative')
      })
    })

  }

  // ── 歷 Roam → Beasts (1.8b-1: split out of Explore) ─────────────────────────
  // A beast's rarity tier as a small coloured chip (+ "Rare colour" for a variant): Roam → Beasts cards
  const tierChip = prof => `<span class="tier-chip tier-${prof.tier.id}">${escHtml(prof.tier.name)}</span>${prof.variant ? '<span class="tier-chip tier-variant">Rare colour</span>' : ''}`

  // Phase 41: which talisman grade the player picked per encounter (best held by default). Render-layer only.
  const _tameGrade = {}

  function renderBeasts(s) {
    const el = document.getElementById('tab-beasts')
    el.innerHTML = ''
    const cap = s.derived.maxBeasts || 3
    const counts = gameState.talismanCounts()
    const held = TALISMAN_GRADE_ORDER.filter(g => counts[g] > 0)
    const head = document.createElement('div')
    head.className = 'view-lede'
    head.innerHTML = `Companions ${(s.beasts || []).length} / ${cap} · Taming Talismans ${held.length ? held.map(g => `${escHtml(TALISMAN_GRADES[g].name)} <b>${counts[g]}</b>`).join(' · ') : '<b>none</b>'}${held.length ? '' : ' <span class="lede-hint">(craft them, or find them on expeditions)</span>'}`
    el.appendChild(head)
    // ── Beast Encounters ──────────────────────────────────────────────────────
    const encounters = s.beastEncounters || []
    if (encounters.length > 0) {
      const encTitle = document.createElement('div')
      encTitle.className = 'section-title'
      encTitle.textContent = 'Beast Encounters'
      el.appendChild(encTitle)

      for (const enc of encounters) {
        const beastType = BEAST_TYPES.find(b => b.id === enc.typeId)
        const free      = enc.mood === 'grateful'                  // Phase 35: a spared beast came back
        const fighting  = s.family?.fight?.beast?.encId === enc.id
        const ti        = gameState.tameInfo(enc.id)               // Phase 41: grades, chance, locks
        const canTame   = ti ? ti.canTame : false
        const held      = ti ? ti.grades.filter(g => g.count > 0) : []
        let sel = ti && ti.best ? ti.best : null
        if (sel && _tameGrade[enc.id] && held.some(g => g.id === _tameGrade[enc.id])) sel = _tameGrade[enc.id]
        const selGr = sel ? ti.grades.find(g => g.id === sel) : null
        const tameLabel = fighting ? 'In battle'
          : canTame ? (free ? 'Tame (it comes freely)' : `Tame · ${escHtml(selGr.name)} (${Math.round(selGr.chance * 100)}%)`)
          : ti?.why === 'max_beasts' ? `Full (${s.derived.maxBeasts || 3}/${s.derived.maxBeasts || 3})`
          : ti?.why === 'no_talisman' ? 'No Talisman' : ti?.why === 'stage' ? 'Stage too low' : 'Cannot tame'
        const gradeRow = held.length > 1
          ? `<div class="tame-grades">${held.map(g => `<button class="pack-chip${sel === g.id ? ' active' : ''}" data-tamegrade="${g.id}" data-encid="${escHtml(enc.id)}">${escHtml(g.name)}<small> ${g.count}</small></button>`).join('')}</div>`
          : ''
        // Phase 35: Fight — opens the battle page's prepare step (odds before you commit); a lock says why not
        const fightLock = fighting ? null : s.family?.fight ? 'Another fight is underway' : (s.health ?? 100) < BEAST_FIGHT_MIN_HEALTH ? 'Too wounded to fight' : null
        const pv = gameState.beastFightPreview(enc.id)
        const moodTag = enc.mood === 'grateful' ? '<span class="beast-mood good">Remembers your mercy</span>'
          : enc.mood === 'vengeful' ? '<span class="beast-mood bad">Came back for you</span>'
          : enc.mood === 'cub' ? '<span class="beast-mood">A cub</span>' : ''

        const prof = gameState.beastProfile(enc)
        const row = document.createElement('div')
        row.className = 'beast-encounter-row tier-row-' + prof.tier.id + (prof.variant ? ' is-variant' : '')
        const traitNames = enc.traits.map(id => BEAST_TRAITS[id]?.name || id).join(', ')
        const spriteHtml = BeastPortraits.html('enc:' + enc.id, prof.art)   // A4-2: ink portrait (or classic ASCII)
        row.innerHTML = `
          <div class="beast-sprite-small">${spriteHtml}</div>
          <div class="beast-encounter-info">
            <div class="beast-enc-head"><button class="beast-enc-name bdx-open" data-bdx="enc:${escHtml(enc.id)}">${escHtml(prof.name)}${enc.mood === 'cub' ? ' cub' : ''}</button>${tierChip(prof)}${moodTag}</div>
            <div class="beast-enc-desc">${escHtml(beastType?.desc || '')}</div>
            <div class="beast-enc-traits">${escHtml(traitNames)}</div>
            ${gradeRow}
            <div class="beast-enc-acts">
              <button class="beast-tame-btn" data-encid="${escHtml(enc.id)}" ${canTame ? '' : 'disabled'}>${tameLabel}</button>
              <button class="beast-fight-btn" data-fight="${escHtml(enc.id)}" ${fightLock ? `disabled title="${escHtml(fightLock)}"` : `title="Win odds ${pv ? Math.round(pv.chance * 100) : '?'}%. You choose to slay it or drive it off before anything happens."`}>
                <span data-icon="sword"></span>${fighting ? 'Return to battle' : 'Fight'}${!fighting && pv ? `<small>${pv.chance < 0.01 ? '<1' : Math.round(pv.chance * 100)}%</small>` : ''}
              </button>
            </div>
            ${fightLock ? `<div class="beast-lock-why"><span data-icon="lock"></span>${escHtml(fightLock)}</div>` : ''}
          </div>
        `
        el.appendChild(row)
      }

      el.querySelectorAll('.beast-fight-btn[data-fight]').forEach(btn => btn.addEventListener('click', () => combatView.open(btn.dataset.fight)))
      el.querySelectorAll('.tame-grades [data-tamegrade]').forEach(btn => btn.addEventListener('click', () => {
        _tameGrade[btn.dataset.encid] = btn.dataset.tamegrade
        renderBeasts(s)
      }))
      el.querySelectorAll('.beast-tame-btn[data-encid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const encId = btn.dataset.encid
          const res = gameState.tameEncounteredBeast(encId, _tameGrade[encId])
          if (res.ok) {
            delete _tameGrade[encId]
            flashMessage(`Tamed: ${res.beast.name}!`, 'special')
          } else if (res.reason === 'tame_failed') {
            if (res.outcome === 'fight') { flashMessage('It will not be charmed — it turns on you!', 'negative'); combatView.open(encId) }
            else flashMessage('The charm fails, and it bolts into the wild.', 'negative')
          } else {
            const msgs = { not_found:'Already gone', stage:'Realm too low', max_beasts:'Beast capacity full', no_talisman:'Need a taming talisman', fighting:'You are fighting it' }
            flashMessage(msgs[res.reason] || 'Cannot tame', 'negative')
          }
        })
      })
    }

    // ── Active Beasts ─────────────────────────────────────────────────────────
    const beasts = s.beasts || []
    if (beasts.length > 0) {
      const beastTitle = document.createElement('div')
      beastTitle.className = 'section-title'
      beastTitle.textContent = `Beasts (${beasts.length}/${s.derived.maxBeasts || 3})`
      el.appendChild(beastTitle)

      for (const beast of beasts) {
        const beastType  = BEAST_TYPES.find(b => b.id === beast.typeId)
        const xpPct      = Math.min(100, (beast.xp / 100) * 100)
        const isOnExp    = !!beast.expedition
        const msLeft     = isOnExp ? Math.max(0, beast.expedition.endsAt - Date.now()) : 0
        const traitTags  = beast.traits.map(id => {
          const tr = BEAST_TRAITS[id]
          return `<span class="beast-trait-tag" title="${escHtml(tr?.desc || '')}">${escHtml(tr?.name || id)}</span>`
        }).join('')

        const prof = gameState.beastProfile(beast)
        const row = document.createElement('div')
        row.className = 'beast-row tier-row-' + prof.tier.id + (prof.variant ? ' is-variant' : '')
        row.dataset.beastid = beast.id

        let statusHtml = ''
        if (isOnExp) {
          const loc = LOCATIONS.find(l => l.id === beast.expedition.locationId)
          statusHtml = beast.expedition.war
            ? `<span style="color:var(--red);font-size:10px">At war with the sect · <span data-beast-left="${beast.expedition.endsAt}">${fmtTime(Math.ceil(msLeft/1000))}</span></span>`
            : `<span style="color:var(--jade);font-size:10px">On expedition: ${escHtml(loc?.name || '?')} · <span data-beast-left="${beast.expedition.endsAt}">${fmtTime(Math.ceil(msLeft/1000))}</span></span>`
        }

        // Auto-Expedition (per beast, Lv.BEAST_AUTO_EXPEDITION_LEVEL+): On/Off + where it goes next; the details page picks where.
        let autoHtml
        if (!gameState.beastAutoUnlocked(beast)) {
          autoHtml = `<div class="exp-auto beast-auto locked"><span class="exp-auto-l">${Icon('lock')}<b>Auto-Expedition</b><small>at Lv.${BEAST_AUTO_EXPEDITION_LEVEL}: it learns the roads and can go out on its own</small></span></div>`
        } else {
          const tgt = gameState.beastAutoTarget(beast), on = !!beast.autoExp
          const swaps = on && isOnExp && tgt && tgt.id !== beast.expedition.locationId && !beast.expedition.war
          const note = !on ? 'keeps it going out on its own'
            : s.playMode === 'active' ? 'rests while you play in Active Mode'
            : !tgt ? 'on: send it once yourself, or pick where on its page'
            : swaps ? `on: when it returns, next is <b class="exp-auto-next">${escHtml(tgt.name)}</b>`
            : `on: back out to <b>${escHtml(tgt.name)}</b>`
          autoHtml = `<div class="exp-auto beast-auto"><span class="exp-auto-l">${Icon('auto')}<b>Auto-Expedition</b><small>${note} · <button class="exp-auto-where bdx-open" data-bdx="beast:${escHtml(beast.id)}">change where</button></small></span>
            <span class="set-seg"><button class="set-opt is-on${on ? ' active' : ''}" data-bauto="${escHtml(beast.id)}" data-on="1">On</button><button class="set-opt${on ? '' : ' active'}" data-bauto="${escHtml(beast.id)}" data-on="0">Off</button></span></div>`
        }

        row.innerHTML = `
          <div class="beast-row-top">${BeastPortraits.html('beast:' + beast.id, prof.art)}<div class="beast-row-main">
          <div class="beast-row-header">
            <div>
              <button class="beast-name bdx-open" data-bdx="beast:${escHtml(beast.id)}">${escHtml(beast.name)}</button>
              <span class="beast-level">Lv.${beast.level}</span>
              ${beastType && beastType.name !== beast.name ? `<span class="beast-kind">${escHtml(prof.variant ? prof.variant.name : beastType.name)}</span>` : ''}${tierChip(prof)}
            </div>
            <button class="beast-dismiss-btn" data-dismissid="${escHtml(beast.id)}">Release</button>
          </div>
          <div class="beast-xp-bar-wrap"><div class="beast-xp-bar" style="width:${xpPct}%"></div></div>
          <div class="beast-traits" style="margin-top:3px">${traitTags}</div>
          </div></div>
          ${statusHtml ? `<div style="margin:3px 0">${statusHtml}</div>` : ''}
          ${autoHtml}
          <div class="beast-btns">
            <button class="beast-exp-btn" data-sendid="${escHtml(beast.id)}" ${isOnExp ? 'disabled' : ''}>
              ${isOnExp ? 'Expeditioning…' : 'Send on Expedition'}
            </button>
          </div>
          <div class="beast-loc-picker" id="blp_${escHtml(beast.id)}">
            ${LOCATIONS.filter(l => s.stageIndex >= l.minStage || s.stageIndex >= l.minStage - 3)
              .map(l => {
                const avail = s.stageIndex >= l.minStage
                const durText = l.duration >= 60 ? `${Math.floor(l.duration/60)}m` : `${l.duration}s`
                return `<button class="beast-loc-pick-btn${avail ? ' avail' : ''}"
                  data-beastid="${escHtml(beast.id)}" data-locid="${l.id}" ${(!avail || isOnExp) ? 'disabled' : ''}>
                  ${escHtml(l.name)} (${durText})
                </button>`
              }).join('')}
          </div>
        `
        el.appendChild(row)
      }

      el.querySelectorAll('.beast-exp-btn[data-sendid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const picker = document.getElementById('blp_' + btn.dataset.sendid)
          if (picker) picker.classList.toggle('open')
        })
      })

      el.querySelectorAll('.beast-loc-pick-btn[data-beastid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = gameState.sendBeastExpedition(btn.dataset.beastid, btn.dataset.locid)
          if (res.ok) {
            flashMessage(`${BEAST_TYPES.find(b => b.id === gameState.get().beasts.find(bst => bst.id === btn.dataset.beastid)?.typeId)?.name || 'Beast'} sent to ${res.loc.name}.`, 'positive')
            const picker = document.getElementById('blp_' + btn.dataset.beastid)
            if (picker) picker.classList.remove('open')
          } else {
            const msgs = { not_found:'Beast not found', active:'Already on expedition', stage:'Stage too low', unknown_location:'Unknown location' }
            flashMessage(msgs[res.reason] || 'Cannot send', 'negative')
          }
        })
      })

      el.querySelectorAll('[data-bauto]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = gameState.setBeastAuto(btn.dataset.bauto, btn.dataset.on === '1')
          if (!res.ok) flashMessage(res.reason === 'locked' ? `Auto-Expedition opens at Lv.${BEAST_AUTO_EXPEDITION_LEVEL}` : 'Cannot change Auto-Expedition', 'negative')
        })
      })

      el.querySelectorAll('.beast-dismiss-btn[data-dismissid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = gameState.dismissBeast(btn.dataset.dismissid)
          if (res.ok) flashMessage('Beast released into the wild.', 'neutral')
          else flashMessage('Cannot release', 'negative')
        })
      })
    }
    if (!encounters.length && !beasts.length) {
      const empty = document.createElement('div')
      empty.className = 'empty-note'
      empty.textContent = 'No beasts yet. Wild ones are sighted on expeditions, or track one down in Roam → Hunt. Tame them with a Beast Taming Talisman, or fight them.'
      el.appendChild(empty)
    }
    BeastPortraits.mount(el, gameState.getSettings())   // A4-2: fill the portrait placeholders (pooled ink canvases)
    // A4-2: a portrait or a beast's name opens its details page (big portrait, lore, traits, Tame)
    el.querySelectorAll('.beast-portrait[data-bp-key]').forEach(p => { p.classList.add('bdx-open'); p.title = 'View details'; p.onclick = () => BeastDetail.openKey(p.dataset.bpKey) })
    el.querySelectorAll('button[data-bdx]').forEach(b => { b.onclick = () => BeastDetail.openKey(b.dataset.bdx) })
  }

  // ── Craft tab ─────────────────────────────────────────────────────────────

  let _craftSubTab = 'pills'

  // Phase 44: a short "+30 Health, +25 Integrity" — for a heal pill's effect, or the result of using one.
  function healLabel(x) {
    const hp = x.healed ?? Math.min(gameState.maxHealth(), x.health || 0)
    const ig = x.integrityHealed ?? Math.min(100, x.integrity || 0)
    const parts = []
    if (hp > 0) parts.push(`+${hp} Health`)
    if (ig > 0) parts.push(`+${ig} Integrity`)
    return parts.join(', ') || 'nothing'
  }

  function renderCraft(s) {
    const el = document.getElementById('tab-craft')
    el.innerHTML = ''
    _craftTabViewedAt = Date.now()   // Phase 22 (22C): "watching" the Craft tab, for Master's Touch

    // Equipped slots
    const equipDiv = document.createElement('div')
    equipDiv.className = 'equip-slots'

    for (const slot of ['weapon', 'artifact']) {
      const itemId = s.equipped[slot]
      const item   = itemId ? ITEMS[itemId] : null
      const slotDiv = document.createElement('div')
      slotDiv.className = 'equip-slot' + (item ? ' filled' : '')
      slotDiv.innerHTML = `
        <div class="equip-slot-label">${slot === 'weapon' ? `${Icon('sword')} Weapon` : `${Icon('pendant')} Artifact`}</div>
        ${item
          ? `<div class="equip-slot-name">${escHtml(item.name)}</div>`
          : `<div class="equip-slot-empty">— empty —</div>`}
        ${item ? `<button class="equip-unequip-btn" data-slot="${slot}">Unequip</button>` : ''}
      `
      equipDiv.appendChild(slotDiv)
    }
    el.appendChild(equipDiv)

    // Wire unequip buttons
    equipDiv.querySelectorAll('.equip-unequip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.unequip(btn.dataset.slot)
        if (!res.ok) flashMessage('Cannot unequip', 'negative')
      })
    })

    // Sub-tabs
    const subTabBar = document.createElement('div')
    subTabBar.className = 'craft-subtabs'
    for (const [key, label, icon] of [['pills','Pills','pill'],['elixirs','Elixirs','furnace'],['weapons','Weapons','sword'],['artifacts','Artifacts','pendant'],['talismans','Talismans','scroll']]) {
      const btn = document.createElement('button')
      btn.className = 'craft-subtab' + (key === _craftSubTab ? ' active' : '')
      btn.innerHTML = `${Icon(icon)}<span>${label}</span>`
      btn.addEventListener('click', () => {
        _craftSubTab = key
        renderCraft(gameState.get())
      })
      subTabBar.appendChild(btn)
    }
    el.appendChild(subTabBar)

    // Recipe list for active sub-tab (1.8b-5: cards side by side in Expanded/Desktop)
    const recipes = RECIPES.filter(r => r.category === _craftSubTab)
    // Phase 44: how many of this category's formulas you know — above the grid, so it frames what follows.
    if (recipes.some(r => r.hidden)) {
      const knownN = recipes.filter(r => gameState.recipeKnown(r.id)).length
      const note = document.createElement('div')
      note.className = 'craft-note'
      note.innerHTML = `<span data-icon="scroll"></span>${knownN} of ${recipes.length} formulas known — the rest are found in Roam → Arena / Explore.`
      el.appendChild(note)
    }
    const recipeGrid = document.createElement('div')
    recipeGrid.className = 'card-grid'
    el.appendChild(recipeGrid)
    for (const recipe of recipes) {
      const item = ITEMS[recipe.productId]
      if (!item) continue
      if (!gameState.recipeKnown(recipe.id)) {                       // Phase 44: an undiscovered formula
        const row = document.createElement('div')
        row.className = 'recipe-row recipe-unknown'
        row.innerHTML = `
          <div class="recipe-header"><span class="recipe-name"><span data-icon="lock"></span> Unknown formula</span></div>
          <div class="recipe-desc">${escHtml(gameState.recipeHint(recipe.id))}</div>`
        recipeGrid.appendChild(row)
        continue
      }

      const row = document.createElement('div')
      row.className = 'recipe-row'

      // Ingredient availability
      const ingsHTML = recipe.ingredients.map(ing => {
        const have    = (s.inventory[ing.itemId] || 0)
        const enough  = have >= ing.qty
        const ingItem = ITEMS[ing.itemId]
        return `<span class="recipe-ing ${enough ? 'have' : 'missing'}">${ing.qty}× ${escHtml(ingItem?.name || ing.itemId)} (${have})</span>`
      }).join('')

      const canCraft  = craftSys.canCraft(recipe.id)
      const inInv     = (s.inventory[recipe.productId] || 0) > 0
      const isWeapon  = item.type === 'weapon'
      const isArtifact= item.type === 'artifact'
      const isEquip   = isWeapon || isArtifact
      const equipped  = isEquip && s.equipped[item.type] === recipe.productId
      const isPill    = item.type === 'pill'
      const isElixir  = item.type === 'elixir'

      let btnsHTML = `<button class="recipe-craft-btn${canCraft ? ' can-craft' : ''}"
        ${canCraft ? '' : 'disabled'} data-recipe="${recipe.id}">Craft</button>`

      if (isEquip) {
        if (equipped) {
          btnsHTML += `<button class="recipe-equip-btn equipped" disabled>Equipped</button>`
        } else if (inInv) {
          btnsHTML += `<button class="recipe-equip-btn can-equip" data-equip="${recipe.productId}">Equip</button>`
        }
      }

      if (isPill) {
        if (item.effect?.type === 'heal') {                          // Phase 44: a healing pill is used, not queued
          if (inInv) {
            const hl = gameState.healLock(item.effect)
            btnsHTML += hl
              ? `<button class="recipe-equip-btn" disabled title="Nothing to heal — Health and Integrity are full.">Use · ${escHtml(healLabel(item.effect))}</button>`
              : `<button class="recipe-equip-btn can-equip" data-useheal="${recipe.productId}">Use · ${escHtml(healLabel(item.effect))}</button>`
          }
        } else {
          const inQueue = s.activePill === recipe.productId
          if (inQueue) {
            btnsHTML += `<button class="pill-queue-btn queued" data-clearqueue="1">★ Queued</button>`
          } else if (inInv) {
            btnsHTML += `<button class="pill-queue-btn can-queue" data-queue="${recipe.productId}">Queue BT</button>`
          }
        }
      }

      if (isElixir && inInv) {
        btnsHTML += `<button class="recipe-equip-btn can-equip" data-useelixir="${recipe.productId}">Use</button>`
      }

      // Phase 22 (22B/22D): per-recipe Auto-Craft toggle, once unlocked.
      if (gameState.automationUnlocked('autoCraft')) {
        const autoOn = !!s.automation.autoCraftRecipes[recipe.id]
        btnsHTML += `<button class="pack-chip${autoOn ? ' active' : ''}" data-autocraft="${recipe.id}" title="Auto-repeat this recipe while materials allow">${autoOn ? '✓ Auto' : 'Auto'}</button>`
      }

      row.innerHTML = `
        <div class="recipe-header">
          <span class="recipe-name" title="${escHtml(item.nameCN)}">${escHtml(item.name)}</span>
          ${inInv ? `<span class="recipe-owned">×${s.inventory[recipe.productId]} owned</span>` : ''}
        </div>
        <div class="recipe-desc">${escHtml(item.desc)}</div>
        <div class="recipe-ings">${ingsHTML}</div>
        <div class="recipe-btns">${btnsHTML}</div>
      `
      recipeGrid.appendChild(row)
    }

    // Wire craft buttons
    el.querySelectorAll('[data-recipe]').forEach(btn => {
      btn.addEventListener('click', () => quickActions.craft(btn.dataset.recipe))
    })

    // Wire equip buttons
    el.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.equip(btn.dataset.equip)
        if (!res.ok) flashMessage('Cannot equip', 'negative')
        else flashMessage(`Equipped: ${ITEMS[btn.dataset.equip]?.name}`, 'positive')
      })
    })

    // Wire pill queue buttons
    el.querySelectorAll('[data-queue]').forEach(btn => {
      btn.addEventListener('click', () => {
        craftSys.setPill(btn.dataset.queue)
        flashMessage(`${ITEMS[btn.dataset.queue]?.name} queued for next breakthrough.`, 'positive')
      })
    })
    el.querySelectorAll('[data-clearqueue]').forEach(btn => {
      btn.addEventListener('click', () => {
        craftSys.setPill(null)
        flashMessage('Pill removed from queue.', 'neutral')
      })
    })

    // Wire elixir use buttons
    el.querySelectorAll('[data-useelixir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.useElixir(btn.dataset.useelixir)
        if (res.ok) {
          flashMessage(`Root changed: ${res.newRoot}`, 'special')
        } else {
          flashMessage('Cannot use elixir', 'negative')
        }
      })
    })

    // Wire healing-pill use buttons (Phase 44)
    el.querySelectorAll('[data-useheal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.useHeal(btn.dataset.useheal)
        if (res.ok) flashMessage(`${ITEMS[btn.dataset.useheal]?.name}: ${healLabel(res)}`, 'positive')
        else flashMessage('Cannot use that pill', 'negative')
      })
    })

    // Wire per-recipe Auto-Craft toggles (Phase 22)
    el.querySelectorAll('[data-autocraft]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.autocraft
        gameState.setAutoCraftRecipe(id, !s.automation.autoCraftRecipes[id])
      })
    })
  }

  // ── Pack tab (Phase 21) ────────────────────────────────────────────────────
  // Filter/sort/expand state is presentation-only (not saved) — see docs/systems/backpack.md.

  let _packFilter      = 'all'
  let _packSort        = 'name'
  let _packExpanded    = null
  let _packLastStones  = null
  let _packDelta       = null   // { val, ts } — fades via inline opacity computed per-frame, no CSS animation

  const PACK_FILTERS = [
    ['all', 'All'], ['mat', 'Mats'], ['pill', 'Pills'],
    ['equip', 'Equip'], ['rare', 'Rare'], ['key', 'Keys'], ['manual', 'Arts'],   // Phase 42: martial art manuals
  ]

  // Real inventory rows + a synthetic row for equipped gear that has no unequipped copy in stock
  // (equipping moves an item OUT of s.inventory — see docs/systems/crafting.md).
  function packRows(s) {
    const rows = []
    for (const [id, qty] of Object.entries(s.inventory)) {
      if (qty > 0 && ITEMS[id]) rows.push({ id, item: ITEMS[id], qty, equipped: false })
    }
    for (const slot of ['weapon', 'artifact']) {
      const id = s.equipped[slot]
      if (!id || !ITEMS[id]) continue
      const existing = rows.find(r => r.id === id)
      if (existing) existing.equipped = true
      else rows.push({ id, item: ITEMS[id], qty: 1, equipped: true })
    }
    return rows
  }

  function packDeltaHTML() {
    if (!_packDelta) return ''
    const age = Date.now() - _packDelta.ts
    if (age >= 3000) { _packDelta = null; return '' }
    const opacity = (1 - age / 3000).toFixed(2)
    const lift    = ((age / 3000) * 10).toFixed(1)
    const cls     = _packDelta.val > 0 ? 'pos' : 'neg'
    const sign    = _packDelta.val > 0 ? '+' : '−'
    return `<span class="pack-delta ${cls}" style="opacity:${opacity};transform:translateY(${-lift}px)">${sign}${fmt(Math.abs(_packDelta.val))}</span>`
  }

  // Called every rAF tick while the Pack tab is active — only touches the delta span + stones number,
  // never rebuilds the row list (that only happens on a real state-change notify, see renderPack).
  function updatePackDeltaInPlace(s) {
    if (_packLastStones !== null && s.spiritStones !== _packLastStones) {
      const diff = s.spiritStones - _packLastStones
      if (diff !== 0) _packDelta = { val: diff, ts: Date.now() }
    }
    _packLastStones = s.spiritStones

    const valEl = document.getElementById('pack-stones-val')
    if (valEl) valEl.textContent = fmt(s.spiritStones)
    const host = document.getElementById('pack-delta-host')
    if (host) host.innerHTML = packDeltaHTML()
  }

  function renderPack(s) {
    const el = document.getElementById('tab-pack')
    el.innerHTML = ''

    if (_packLastStones !== null && s.spiritStones !== _packLastStones) {
      const diff = s.spiritStones - _packLastStones
      if (diff !== 0) _packDelta = { val: diff, ts: Date.now() }
    }
    _packLastStones = s.spiritStones

    const currency = document.createElement('div')
    currency.className = 'pack-currency'
    currency.innerHTML = `
      <div class="pack-currency-row stones">
        <span>${Icon('stone')} Spirit Stones</span>
        <span class="pack-currency-val" id="pack-stones-val">${fmt(s.spiritStones)}</span>
        <span id="pack-delta-host">${packDeltaHTML()}</span>
      </div>
      <div class="pack-currency-row">
        <span class="pack-currency-label">${Icon('crystal')} Void Crystals (rare)</span>
        <span class="pack-currency-val">×${fmt(s.inventory['void_crystal'] || 0)}</span>
      </div>
    `
    el.appendChild(currency)

    const filterBar = document.createElement('div')
    filterBar.className = 'pack-filters'
    for (const [key, label] of PACK_FILTERS) {
      const btn = document.createElement('button')
      btn.className = 'pack-chip' + (key === _packFilter ? ' active' : '')
      btn.textContent = label
      btn.addEventListener('click', () => { _packFilter = key; renderPack(gameState.get()) })
      filterBar.appendChild(btn)
    }
    el.appendChild(filterBar)

    const sortRow = document.createElement('div')
    sortRow.className = 'pack-sort-row'
    sortRow.innerHTML = `<span>Sort:</span>`
    for (const [key, label] of [['name', 'Name'], ['qty', 'Qty']]) {
      const btn = document.createElement('button')
      btn.className = 'pack-sort-btn' + (key === _packSort ? ' active' : '')
      btn.textContent = label
      btn.addEventListener('click', () => { _packSort = key; renderPack(gameState.get()) })
      sortRow.appendChild(btn)
    }
    el.appendChild(sortRow)

    let rows = packRows(s).filter(r => r.item.category !== 'currency')
    if (_packFilter !== 'all') rows = rows.filter(r => r.item.category === _packFilter)
    rows.sort(_packSort === 'qty'
      ? (a, b) => b.qty - a.qty
      : (a, b) => a.item.name.localeCompare(b.item.name))

    if (!rows.length) {
      const empty = document.createElement('div')
      empty.className = 'pack-empty'
      empty.textContent = _packFilter === 'all' ? 'Your pack is empty.' : 'Nothing here yet.'
      el.appendChild(empty)
    }

    for (const row of rows) {
      const { id, item, qty, equipped } = row
      const invQty = s.inventory[id] || 0   // unequipped, discardable copies only

      const div = document.createElement('div')
      div.className = 'pack-item-row' + (id === _packExpanded ? ' expanded' : '')

      const main = document.createElement('div')
      main.className = 'pack-item-main'
      const each = gameState.itemValue(id)
      main.innerHTML = `
        <span class="pack-item-name">${escHtml(item.name)}${equipped ? '<span class="pack-item-badge">◆</span>' : ''}</span>
        ${each ? `<span class="pack-item-val" title="Sells for ${fmt(each)} Spirit Stone${each === 1 ? '' : 's'} each">${Icon('stone')}${fmt(each)}<small>ea</small></span>` : ''}
        <span class="pack-item-qty">×${fmt(qty)}</span>
      `
      main.addEventListener('click', () => {
        _packExpanded = (_packExpanded === id) ? null : id
        renderPack(gameState.get())
      })
      div.appendChild(main)

      if (id === _packExpanded) {
        const isPill   = item.type === 'pill'
        const isElixir = item.type === 'elixir'
        const isEquip  = item.type === 'weapon' || item.type === 'artifact'

        let btnsHTML = ''
        if (isPill && invQty > 0) {
          if (item.effect?.type === 'heal') {                       // Phase 44: a healing pill is used, not queued
            const hl = gameState.healLock(item.effect)
            btnsHTML += hl
              ? `<button class="pack-btn-use" disabled title="Nothing to heal — Health and Integrity are full.">Use · ${escHtml(healLabel(item.effect))}</button>`
              : `<button class="pack-btn-use" data-useheal="${id}">Use · ${escHtml(healLabel(item.effect))}</button>`
          } else {
            btnsHTML += (s.activePill === id)
              ? `<button class="pack-btn-use" data-clearpill>★ Queued (clear)</button>`
              : `<button class="pack-btn-use" data-usepill="${id}">Queue for Breakthrough</button>`
          }
        }
        if (isElixir && invQty > 0) {
          btnsHTML += `<button class="pack-btn-use" data-useelixir="${id}">Use</button>`
        }
        if (item.type === 'manual' && invQty > 0) {   // Phase 42: study it (or say why not), or look at it in Path → Arts
          const lock = gameState.artStudyLock(item.art), art = ARTS[item.art], known = s.arts.known[item.art]
          btnsHTML += lock === 'stage' ? `<span class="pack-item-hint">Too profound: opens at ${escHtml(stageShortName(art.minStage))}.</span>`
            : lock === 'busy' ? `<span class="pack-item-hint">Every study desk is in use (${gameState.studySlots()} at your realm).</span>`
            : lock === 'studying' ? `<span class="pack-item-hint">Already on a study desk.</span>`
            : lock === 'maxed' ? `<span class="pack-item-hint">Mastered: sell the spare.</span>`
            : `<button class="pack-btn-use" data-studyart="${item.art}">${known ? 'Study to deepen' : 'Study'} · ${fmtTime(gameState.artStudySeconds(item.art))}</button>`
          btnsHTML += `<button class="pack-btn-equip" data-gotoarts>See it in Arts</button>`
          // Giving it to your sect (user 2026-09-30): what it pays, or that the shelf has it already
          const give = gameState.sectDonateInfo()?.manuals.find(x => x.id === item.art)
          if (give) btnsHTML += give.lock ? `<span class="pack-item-hint">Your sect's library has it.</span>`
            : `<button class="pack-btn-equip" data-giveart="${item.art}">Give to the sect${give.contribution ? ` · +${give.contribution} Contribution` : ''}</button>`
        }
        if (isEquip && !equipped && invQty > 0) {
          btnsHTML += `<button class="pack-btn-equip" data-equip="${id}">Equip</button>`
        }
        if (invQty > 0) {
          btnsHTML += `<button class="pack-btn-discard" data-discard="${id}">Discard ×1</button>`
        } else if (equipped) {
          btnsHTML += `<span class="pack-item-hint">Equipped. Unequip it in the Craft tab to discard${each ? ` or sell it (${fmt(each)} stones)` : ''}.</span>`
        }

        // Selling (task 1.11): ×1 · ×10 · all but 1 · all, each button naming the stones it pays
        let sellHTML = ''
        if (each && invQty > 0) {
          const opts = [[1, 'Sell 1']]
          if (invQty > 10) opts.push([10, 'Sell 10'])
          if (invQty > 2) opts.push([invQty - 1, 'All but 1'])
          if (invQty > 1) opts.push([invQty, 'Sell all'])
          sellHTML = `<div class="pack-sell"><span class="pack-sell-l">${Icon('stone')}Sell · ${fmt(each)} each</span>${opts.map(([n, lab]) =>
            `<button class="pack-btn-sell" data-sell="${id}" data-n="${n}">${lab}<b>+${fmt(each * n)}</b></button>`).join('')}</div>`
        }

        const detail = document.createElement('div')
        detail.className = 'pack-item-detail'
        detail.innerHTML = `
          <div class="pack-item-desc">${escHtml(item.desc)}</div>
          <div class="pack-item-btns">${btnsHTML}</div>
          ${sellHTML}
        `
        div.appendChild(detail)
      }
      el.appendChild(div)
    }

    el.querySelectorAll('[data-usepill]').forEach(btn => {
      btn.addEventListener('click', () => {
        craftSys.setPill(btn.dataset.usepill)
        flashMessage(`${ITEMS[btn.dataset.usepill]?.name} queued for next breakthrough.`, 'positive')
      })
    })
    el.querySelectorAll('[data-clearpill]').forEach(btn => {
      btn.addEventListener('click', () => {
        craftSys.setPill(null)
        flashMessage('Pill removed from queue.', 'neutral')
      })
    })
    el.querySelectorAll('[data-useelixir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.useElixir(btn.dataset.useelixir)
        if (res.ok) flashMessage(`Root changed: ${res.newRoot}`, 'special')
        else flashMessage('Cannot use elixir', 'negative')
      })
    })
    el.querySelectorAll('[data-useheal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.useHeal(btn.dataset.useheal)
        if (res.ok) flashMessage(`${ITEMS[btn.dataset.useheal]?.name}: ${healLabel(res)}`, 'positive')
        else flashMessage('Cannot use that pill', 'negative')
      })
    })
    el.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = craftSys.equip(btn.dataset.equip)
        if (res.ok) flashMessage(`Equipped: ${ITEMS[btn.dataset.equip]?.name}`, 'positive')
        else flashMessage('Cannot equip', 'negative')
      })
    })
    el.querySelectorAll('[data-discard]').forEach(btn => {
      btn.addEventListener('click', () => {
        const iid  = btn.dataset.discard
        const name = ITEMS[iid]?.name || iid
        showConfirm(`Discard 1× ${name}?`, 'This cannot be undone.', () => {
          const res = craftSys.discard(iid, 1)
          if (res.ok) flashMessage(`Discarded: ${name}`, 'neutral')
          else flashMessage('Cannot discard', 'negative')
        }, 'Discard')
      })
    })
    el.querySelectorAll('[data-giveart]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.giveart
      const go = () => { const r = gameState.donateManualToSect(id); flashMessage(r.ok ? `You give the ${ARTS[id].name} manual to your sect${r.contribution ? ` (+${r.contribution} Contribution)` : ''}.` : 'The library already has it', r.ok ? 'positive' : 'negative') }
      if (gameState.get().arts.known[id]) go(); else showConfirm(`Give away ${ARTS[id].name}?`, 'You have not learned this art yet. Once given, the manual is the sect\'s.', go, 'Give it')
    }))
    el.querySelectorAll('[data-studyart]').forEach(btn => btn.addEventListener('click', () => {
      const r = gameState.studyArt(btn.dataset.studyart)
      if (r.ok) flashMessage(`You begin studying ${ARTS[btn.dataset.studyart].name}.`, 'positive')
      else flashMessage({ stage: 'Too profound for your realm', busy: 'Every study desk is in use', studying: 'Already on a study desk' }[r.reason] || 'Cannot study', 'negative')
    }))
    el.querySelectorAll('[data-gotoarts]').forEach(btn => btn.addEventListener('click', () => nav.go('arts')))
    el.querySelectorAll('[data-sell]').forEach(btn => {
      btn.addEventListener('click', () => {
        const iid = btn.dataset.sell, n = Number(btn.dataset.n), it = ITEMS[iid], have = gameState.get().inventory[iid] || 0
        const total = gameState.itemValue(iid) * n
        const go = () => {
          const res = craftSys.sell(iid, n)
          if (res.ok) flashMessage(`Sold ${n}× ${it?.name}: +${fmt(res.stones)} Spirit Stones`, 'positive')
          else flashMessage({ equipped: 'Unequip it first', unsellable: 'That cannot be sold', not_owned: 'You do not have that many' }[res.reason] || 'Cannot sell', 'negative')
        }
        // Ask first when it is precious (rare / gear / talismans / costly), or when it empties the stack
        const precious = ['rare', 'equip', 'key'].includes(it?.category) || gameState.itemValue(iid) >= 20
        if (precious || (n === have && n > 1)) showConfirm(`Sell ${n}× ${it?.name}?`, `For ${fmt(total)} Spirit Stones. Sold items are gone for good.`, go, 'Sell')
        else go()
      })
    })
  }

  // ── Game controls ─────────────────────────────────────────────────────────

  document.getElementById('btn-meditate').addEventListener('click', () => {
    gameState.startMeditation(30)
  })

  document.getElementById('btn-breakthrough').addEventListener('click', () => {
    const s = gameState.get()
    if (!s?.derived?.canBreakthrough) return
    if (s.stageIndex === CULTIVATION_STAGES.length - 2) { openAscensionOverlay(); return }
    renderer.setState('breakthrough')
    // Phase 22 (22C): Active Mode's breakthrough focus click-window — bonus applies to this attempt only.
    const focusBonus = s.playMode === 'active' && _btFocusReadyAt && (Date.now() - _btFocusReadyAt) <= ACTIVE_BT_FOCUS_WINDOW_SECONDS * 1000
    const res = gameState.attemptBreakthrough({ focusBonus })
    if (res.success) {
      renderer.triggerBreakthroughBurst()
      flashMessage(`Breakthrough! ${res.newStage.realm} · ${res.newStage.layer}`, 'special')
      setTimeout(() => renderer.setState(gameState.get()?.derived?.stage?.spriteState || 'meditating'), 2500)
    } else {
      renderer.triggerFailure(!!res.demoted)   // ink art: the Qi collapses (halo cracks / shatters on demotion)
      if (res.demoted) {
        const app = document.getElementById('app')
        app.classList.add('shake')
        setTimeout(() => app.classList.remove('shake'), 600)
        const st = gameState.get()?.derived?.stage
        flashMessage(`Realm shattered! Demoted to ${st ? st.realm + ' · ' + st.layer : 'lower realm'}.`, 'negative')
      } else {
        const msgs = {
          failed:         'Breakthrough failed! Integrity −20.',
          insufficient_qi:'Not enough Qi.',
          ascended:       'You have already ascended.',
        }
        flashMessage(msgs[res.reason] || 'Breakthrough failed.', 'negative')
      }
      setTimeout(() => renderer.setState(gameState.get()?.derived?.stage?.spriteState || 'meditating'), 1500)
    }
  })

  // ── Ascension Trial overlay (Phase 23C) ─────────────────────────────────────

  function openAscensionOverlay() {
    const s = gameState.get()
    const chance = gameState.ascensionChance()
    const need = ASCENSION_MIN_BLOODLINE
    const bq = Math.round(s.bloodlineQuality || 0)
    const met = bq >= need
    document.getElementById('asc-bloodline').textContent = `${bq} / ${need}`
    document.getElementById('asc-chance').textContent = met ? `${Math.round(chance * 100)}%` : 'Locked'
    // Phase 47: the Trial is gated on a full bloodline — explain the lock and refuse the button.
    document.getElementById('asc-lock').classList.toggle('hidden', met)
    document.getElementById('asc-lock-bq').textContent = bq
    const btn = document.getElementById('ascend-now')
    btn.disabled = !met
    btn.title = met ? '' : `Requires Bloodline Quality ${need} (you have ${bq})`
    // Phase 40: the consolation is known before the choice (same formula as attemptAscension)
    document.getElementById('asc-soul').textContent = `+${Math.round(SOUL_FAIL_BASE + SOUL_FAIL_PER_PCT * Math.round(chance * 100))} Soul Points`
    document.getElementById('ascension-overlay').classList.remove('hidden')
    banterSys.say('ascension_trial')
  }

  document.getElementById('ascend-wait').addEventListener('click', () => {
    document.getElementById('ascension-overlay').classList.add('hidden')
  })

  document.getElementById('ascend-now').addEventListener('click', () => {
    const res = gameState.attemptAscension()
    if (res.reason === 'bloodline_too_low') return   // the button is disabled, but never die to a locked Trial
    document.getElementById('ascension-overlay').classList.add('hidden')
    // Phase 31 (M2 task 2.7d): a successful Ascension ALSO ends the life (fixes the post-Ascension dead zone). The
    // lastReincarnation watcher in bootGame plays what follows: the Immortal Ascension cinematic + finish screen
    // (Phase 40b), then the interlude card; a failed Trial gets the death moment.
  })

  // ── Death / reincarnation overlay (Phase 23A/D) ─────────────────────────────

  const DEATH_CAUSE_TEXT = {
    expedition:        'Slain on an expedition',
    sect_war:           'Fallen defending the sect',
    event:              'Claimed by a cultivation mishap',
    ascension_failed:   'The Ascension Trial claimed your life',
    old_age:            'Your years ran out',
    passed_mantle:      'You laid down the path',
    spouse_duel:        'Slain by your spouse in a duel to the death',
    challenge_lost:     'Slain challenging the head for their seat',
    sect_master:        'Slain challenging your sect master for the seat',
    beast_hunt:         'Killed by the beast you went to slay',
    arena_blood:        'Killed in a blood match in the Arena',
    challenged:         'Slain defending the head seat',
    stepdown_tournament: 'Fallen in the succession tournament',
    branch_war:          'Fallen leading your branch to war',
    ascended:            'You rose to the Immortal Realms — an Ascended Ancestor now watches over the clan',
  }

  // 2.6d (clan-succession.md): the death card walks through the interlude — heir bet (if the clan must pick),
  // the reign chronicle + clan/orphan choice, then the birth card. All state lives in s.interlude; this only renders.
  function showDeathOverlay(summary) {
    if (!summary) return
    renderInterlude()
    document.getElementById('death-overlay').classList.remove('hidden')
  }

  const HEIR_KIND_TEXT = { chosen: 'your named heir', tournament: 'the victor of the Tournament of Heirs', clan: 'the elders’ choice', regency: 'a child, ruling through a regent' }

  // Cause + stats; re-rendered each step — the Bloodline heir term only lands once the new head is known.
  function renderDeathStats(summary) {
    document.getElementById('death-cause').textContent = DEATH_CAUSE_TEXT[summary.cause] || 'This life has ended'
    const reachedStage = CULTIVATION_STAGES[Math.min(summary.maxStageReached, CULTIVATION_STAGES.length - 1)]
    document.getElementById('death-stats').innerHTML =
      `Reached ${reachedStage.realm} · ${reachedStage.layer}<br>` +
      `Generation ${summary.generation} → ${summary.generation + 1}<br>` +
      `Bloodline Quality: ${Math.round(summary.parentBloodlineQuality)} → ${Math.round(summary.newBloodlineQuality)}${summary.heirTerm ? ` (heir +${summary.heirTerm.toFixed(1)})` : ''}`
    // Phase 40: what the soul kept from this Trial, and why
    const so = summary.soul, el = document.getElementById('death-soul')
    el.classList.toggle('hidden', !so)
    if (so) {
      const why = so.kind === 'fail' ? `fell at ${Math.round((so.chance || 0) * 100)}% odds` : so.kind === 'v1' ? 'the first to become Immortal' : 'became Immortal'
      el.innerHTML = `<span class="ds-g">${Icon('soul')}</span><span class="ds-t"><b>Your soul remembers: +${so.pts} Soul Points</b>
        <span class="ds-s">${why} · shared by every save slot</span></span>`
    }
  }

  function renderInterlude() {
    const lr = gameState.get()?.lastReincarnation
    if (lr) renderDeathStats(lr)
    const info = gameState.interludeInfo()
    const head = document.getElementById('interlude-head'), body = document.getElementById('interlude-body')
    const choices = document.getElementById('interlude-choices'), ok = document.getElementById('death-ok')
    const s = gameState.get()
    if (!info) {   // the life has begun — birth card
      const b = s.birth, lr = s.lastReincarnation
      const pos = b ? POSITION_TEXT[b.position] : null
      head.textContent = pos ? pos.name.replace('{line}', b.lineName || 'branch') : ''
      const last = lr?.birth?.chronicle?.slice(-1) || []
      body.innerHTML = last.map(l => `<div class="chron-line">${escHtml(l)}</div>`).join('') +
        (b ? `<div class="chron-line">You are <b>${escHtml(s.name)}</b> · ${escHtml(s.root.name)}.${b.stipend ? ` The clan sect grants a stipend of ${b.stipend} Spirit Stones.` : ''}</div>` : '')
      choices.innerHTML = ''
      ok.classList.remove('hidden')
      return
    }
    ok.classList.add('hidden')
    if (info.step === 'bet') {
      head.textContent = `The head seat of the ${info.clanName || 'nameless'} clan stands empty. Who will the elders raise to it?`
      body.innerHTML = '<div class="chron-line" style="color:var(--dim)">Place your bet. Guess right and the wheel of rebirth favors the main line; guess wrong and it may not.</div>'
      choices.innerHTML = info.candidates.map(p => {
        const pers = PERSONALITIES.find(x => x.id === p.personality)
        const age = Math.max(0, Math.floor(info.year - (p.bornYear ?? info.year)))
        const bl = bondLabel(p.bond ?? 50)
        return `<button data-bet="${escHtml(p.id)}">${escHtml(Persons.fullName(p))}<span class="family-sub">age ${age} · ${personStageLabel(p.stageIndex)} · ${escHtml(pers?.name || '')} · ${bl.word}${p.trauma ? ' · scarred' : ''}</span></button>`
      }).join('')
      choices.querySelectorAll('[data-bet]').forEach(btn => btn.addEventListener('click', () => { gameState.placeBet(btn.dataset.bet); renderInterlude() }))
      return
    }
    // The reign chronicle + the rebirth choice
    const succ = info.successor
    const style = info.style ? PARENTING_STYLES[info.style] : null
    head.textContent = succ ? `The Reign of ${Persons.fullName(succ)}${style ? ` · ${style.name} ${style.nameCN}` : ''}` : 'The Wheel Turns'
    let html = info.chronicle.map(l => `<div class="chron-line">${escHtml(l)}</div>`).join('')
    if (succ && info.heirKind) html += `<div class="chron-line" style="color:var(--dim)">${escHtml(Persons.fullName(succ))}: ${HEIR_KIND_TEXT[info.heirKind] || ''}.</div>`
    if (info.bet) {
      const betP = gameState.person(info.bet)
      html += `<div class="chron-line chron-bet${info.betWon ? '' : ' lost'}">Your bet on ${escHtml(Persons.fullName(betP))}: ${info.betWon ? 'you called it.' : 'the elders chose otherwise.'}</div>`
    }
    body.innerHTML = html
    // 2026-10-02: the bequest — pass down 1 art + 1 item per reincarnation you are on (your 3rd rebirth carries 3 of
    // each). Your own choice, free every life, and it rides an orphan rebirth too. Picked here, applied at birth.
    const bq = info.bequest
    if (bq && (bq.maxArts > 0 || bq.maxItems > 0) && (bq.pool.arts.length || bq.pool.items.length)) {
      const full = (picked, max) => picked.length >= max
      const chip = (on, maxed, attrs, label, sub) => `<button class="beq-chip${on ? ' on' : ''}${maxed ? ' maxed' : ''}"${maxed ? ' disabled title="Full — unpick one first"' : ''} ${attrs}>${escHtml(label)}${sub ? `<span class="beq-sub">${escHtml(sub)}</span>` : ''}</button>`
      const artsFull = full(bq.arts, bq.maxArts), itemsFull = full(bq.items, bq.maxItems)
      const artsHtml = bq.pool.arts.length
        ? bq.pool.arts.map(a => chip(bq.arts.includes(a.id), !bq.arts.includes(a.id) && artsFull, `data-beq="arts" data-id="${escHtml(a.id)}"`,
            a.name, ART_RARITY[a.rarity]?.name || a.rarity)).join('')   // no mastery: a bequeathed art arrives at mastery 1
        : '<span class="beq-none">No arts to pass down.</span>'
      const itemsHtml = bq.pool.items.length
        ? bq.pool.items.map(x => chip(bq.items.includes(x.id), !bq.items.includes(x.id) && itemsFull, `data-beq="items" data-id="${escHtml(x.id)}"`,
            `${x.name}${x.qty > 1 ? ` ×${x.qty}` : ''}`)).join('')
        : '<span class="beq-none">Nothing in the pack.</span>'
      body.innerHTML += `<div class="beq">
        <div class="beq-head">Your parting gift<span class="beq-meta">carry ${bq.maxArts} art${bq.maxArts === 1 ? '' : 's'} · ${bq.maxItems} item${bq.maxItems === 1 ? '' : 's'} · ${info.reincarnation} reincarnation${info.reincarnation === 1 ? '' : 's'}</span></div>
        <div class="beq-sec"><span class="beq-k">Arts <i>${bq.arts.length}/${bq.maxArts}${artsFull ? ' · full' : ''}</i></span><div class="beq-chips">${artsHtml}</div></div>
        <div class="beq-sec"><span class="beq-k">Items <i>${bq.items.length}/${bq.maxItems}${itemsFull ? ' · full' : ''}</i></span><div class="beq-chips">${itemsHtml}</div></div>
      </div>`
      body.querySelectorAll('[data-beq]').forEach(btn => btn.addEventListener('click', () => {
        // The card is rebuilt wholesale, so carry the chip rows' scroll across the re-render (a deep pool scrolls).
        const sc = [...body.querySelectorAll('.beq-chips')].map(c => c.scrollTop)
        gameState.toggleBequest(btn.dataset.beq, btn.dataset.id); renderInterlude()
        const after = document.getElementById('interlude-body')?.querySelectorAll('.beq-chips') || []
        sc.forEach((v, i) => { if (after[i]) after[i].scrollTop = v })
      }))
    }
    const clanBtn = info.canJoinClan
      ? `<button data-rebirth="clan">Be born into the ${escHtml(info.clanName || 'nameless')} clan<span class="family-sub">Eldest, a younger child or a branch child: the wheel decides. You will not remember, and no one will know.</span></button>`
      : ''
    choices.innerHTML = clanBtn +
      '<button data-rebirth="orphan">Be born an orphan<span class="family-sub">No clan, no name, no expectations. The clan lives on without you.</span></button>'
    choices.querySelectorAll('[data-rebirth]').forEach(btn => btn.addEventListener('click', () => {
      if (gameState.chooseRebirth(btn.dataset.rebirth).ok) renderInterlude()
    }))
  }

  let _soulToldTs = null   // Phase 40: the soul toast + banter fire once per death
  document.getElementById('death-ok').addEventListener('click', () => {
    document.getElementById('death-overlay').classList.add('hidden')
    renderer.clearDeath()                                   // A4-3: the new life's figure takes the stage
    const s = gameState.get()
    if (s) updateSprite(s)
    if (s?.birth) flashMessage(`${s.name} awakens. A new life begins.`, 'special')
    // Phase 40: the first Soul Points ever get a pointer to where they're spent; every grant gets a line
    const so = s?.lastReincarnation?.soul
    if (so && s.lastReincarnation.ts !== _soulToldTs) {
      _soulToldTs = s.lastReincarnation.ts
      if (so.first) setTimeout(() => flashMessage('Your soul remembers. Spend Soul Points in Kin → Hall.', 'special'), 3000)
      if (so.kind === 'fail') banterSys.say('soul_remembers')   // the lines are about the fall
    }
  })

  // ── Ancestral Hall (Phase 31, M2 task 2.7f, clan-succession.md §2.7) ────────
  // Deterministic epitaph pick (no Math.random — re-opening the Hall must show the same line every time).
  function epitaphFor(cause, personId) {
    const pool = EPITAPHS[cause]
    if (!pool || !pool.length) return null
    let h = 0
    for (let i = 0; i < personId.length; i++) h = (h * 31 + personId.charCodeAt(i)) >>> 0
    return pool[h % pool.length]
  }
  function fillEpitaph(str, p, l, clanName) {
    const name  = p ? Persons.fullName(p) : 'Someone forgotten'
    const died  = p?.diedYear ?? l?.year   // 1.8b-4: fall back to the year the life ended (the age went missing)
    const age   = (died != null && p?.bornYear != null) ? Math.max(0, Math.floor(died - p.bornYear)) : ''
    const realm = CULTIVATION_STAGES[Math.min(l.maxStage ?? 0, CULTIVATION_STAGES.length - 1)]?.realm || ''
    return String(str).replace(/\{(\w+)\}/g, (m, k) => ({ name, age, realm, clan: clanName || '' }[k] ?? m))
  }


  // ── Proposal overlay (Phase 16-lite, M2 task 2.5) ───────────────────────────

  function personStageLabel(i) {
    const st = CULTIVATION_STAGES[Math.min(Math.max(i || 0, 0), CULTIVATION_STAGES.length - 1)]
    return st.realm === 'Mortal' ? 'Mortal' : `${st.realm} · ${st.layer}`
  }

  function openProposalOverlay(s) {
    const prop = s.family?.proposal
    if (!prop) return
    document.getElementById('proposal-suitors').innerHTML = prop.suitors.map(p => {
      const pers = PERSONALITIES.find(x => x.id === p.personality)
      const age  = Math.max(0, Math.floor(s.world.year - p.bornYear))
      return `<div class="suitor-card">
        <div class="suitor-name">${escHtml(Persons.fullName(p))}</div>
        <div>${personStageLabel(p.stageIndex)} · age ${age}</div>
        <div>${escHtml(p.root?.name || '')}${pers ? ` · ${escHtml(pers.name)}` : ''}</div>
        <button data-suitor="${escHtml(p.id)}">Accept</button>
      </div>`
    }).join('')
    document.querySelectorAll('#proposal-suitors [data-suitor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = gameState.acceptSuitor(btn.dataset.suitor)
        document.getElementById('proposal-overlay').classList.add('hidden')
        if (res.ok) flashMessage(`You are wed to ${Persons.fullName(res.spouse)}.`, 'special')
      })
    })
    document.getElementById('proposal-overlay').classList.remove('hidden')
  }

  // ── Family overlay (docs/systems/family.md): marriage/crisis events + duel ──

  function familyPendingKey(s) {
    const f = s.family
    if (!f) return null
    if (f.fight) return null   // Phase 35 / A6-3a: the battle page owns every fight; family matters wait for it
    if (f.spouse && f.duel)  return `duel:${f.duel.year}`
    if (f.headChallenge) return `hc:${f.headChallenge.challengerId}:${f.headChallenge.year}`   // 2.6e
    if (f.stepDownOffer) return `sd:${f.stepDownOffer.headId}:${f.stepDownOffer.year}`          // 2.6e
    if (f.spouse && f.event) return `ev:${f.event.id}:${f.event.year}`
    if (f.childEvent) return `child:${f.childEvent.id}:${f.childEvent.childId}:${f.childEvent.year}`   // 2.6b
    if (s.abuse?.event) return `beat:${s.abuse.event.year}`   // family-events.js: a bad father's hand
    if (s.upbringing?.event) return `up:${s.upbringing.event.id}:${s.upbringing.event.year}`   // 2.6d
    if (s.abuse?.reckon) return `reckon:${s.abuse.hits}`      // family-events.js: the grown-up reckoning
    const kidReck = gameState.childReckoningInfo?.()           // family-events.js: a grown child's reckoning (the mirror)
    if (kidReck) return `kidreckon:${kidReck.id}:${kidReck.abuse.hits}`
    return null
  }

  // (1.8b-3b's family-overlay fight card was retired in A6-3a: every fight plays on the battle page, CombatView.)
  function openFamilyOverlay(s) {
    const f = s.family
    if (!familyPendingKey(s)) return
    const box = document.getElementById('family-box')
    const choicesEl = document.getElementById('family-choices')
    box.classList.remove('fight')
    if (f.spouse && f.duel) {
      const pct = Math.round(gameState.duelChance() * 100)
      box.classList.add('crisis')
      document.getElementById('family-title').textContent = 'A Duel to the Death'
      document.getElementById('family-desc').textContent = `${Persons.fullName(f.spouse)} waits in the courtyard with a drawn blade. One of you will not walk away.`
      choicesEl.innerHTML = `<button data-duel="fight">Fight<span class="family-sub">about ${pct}% to survive — you choose every exchange; if you lose, this life ends</span></button>
        <button data-duel="flee">Flee<span class="family-sub">${escHtml(f.spouse.given)} leaves you for good</span></button>`
      choicesEl.querySelectorAll('[data-duel]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        const res = gameState.resolveDuel(btn.dataset.duel)
        if (res.fight) combatView.resume()   // A6-3a: the battle page
      }))
    } else if (f.headChallenge) {   // 2.6e: an NPC calls you out for the head seat — you decide lethal or not
      const challenger = gameState.person(f.headChallenge.challengerId)
      box.classList.add('crisis')
      document.getElementById('family-title').textContent = 'Challenged for the Head Seat'
      document.getElementById('family-desc').textContent = challenger
        ? `${Persons.fullName(challenger)} strides into the hall and calls you out.${challenger.feud === 'grudge' ? ' They have not forgotten what you did to them.' : ''} Will this be to the death, or will the loser simply yield?`
        : 'A challenger waits. The matter must be settled.'
      const hco = challenger ? Math.round(gameState.personFightOdds(challenger, 'defend').chance * 100) : null
      choicesEl.innerHTML = `<button data-hc="1">To the Death<span class="family-sub">${hco != null ? `about ${hco}% to win · ` : ''}the loser does not walk away</span></button>
        <button data-hc="0">Non-Lethal<span class="family-sub">the loser yields and lives; lose, and you give up the seat</span></button>`
      choicesEl.querySelectorAll('[data-hc]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        const res = gameState.resolveHeadChallenge(btn.dataset.hc === '1')
        if (res.fight) combatView.resume()   // A6-3a: the battle page
      }))
    } else if (f.stepDownOffer) {   // 2.6e: the sitting head is stepping down — join the tournament, or watch
      const off = f.stepDownOffer, head = gameState.person(off.headId)
      box.classList.remove('crisis')
      document.getElementById('family-title').textContent = 'The Head Seat Stands Open'
      document.getElementById('family-desc').textContent = `${head ? Persons.fullName(head) : 'The head'} steps back and lets the clan settle it. ${off.entrantIds.length} may contest the seat. Will you enter?`
      choicesEl.innerHTML = `<button data-sd="1">Enter the Tournament<span class="family-sub">you fight every bout of yours on the battle page; win it all, or fall trying</span></button>
        <button data-sd="0">Stay Out<span class="family-sub">watch the clan settle it without you</span></button>`
      choicesEl.querySelectorAll('[data-sd]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        const res = gameState.answerStepDown(btn.dataset.sd === '1')
        if (res.next) return combatView.resume()                   // A6-3a: your first bout
        if (res.outcome === 'won') flashMessage('You took the head seat.', 'positive')
        else if (res.outcome === 'died') flashMessage('You fell in the tournament.', 'negative')
      }))
    } else if (s.abuse?.event) {   // family-events.js: a bad father's hand
      const info = gameState.beatingInfo()
      box.classList.add('crisis')
      document.getElementById('family-title').textContent = BEATING_EVENT.title
      document.getElementById('family-desc').textContent = `${info.why}. What do you do?`
      choicesEl.innerHTML = BEATING_EVENT.choices.map((ch, i) =>
        `<button data-beat="${i}">${escHtml(ch.label)}<span class="family-sub">${escHtml(ch.sub)}</span></button>`).join('')
      choicesEl.querySelectorAll('[data-beat]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        gameState.resolveBeating(+btn.dataset.beat)
      }))
    } else if (s.abuse?.reckon) {   // family-events.js: the grown-up reckoning
      box.classList.remove('crisis')
      document.getElementById('family-title').textContent = RECKONING_TITLE
      document.getElementById('family-desc').textContent = gameState.upbringingText(RECKONING_TEXT)
      choicesEl.innerHTML = RECKONING_CHOICES.map(ch =>
        `<button data-reckon="${ch.id}">${escHtml(ch.label)}<span class="family-sub">${escHtml(ch.sub)}</span></button>`).join('')
      choicesEl.querySelectorAll('[data-reckon]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        gameState.resolveReckoning(btn.dataset.reckon)
      }))
    } else if (gameState.childReckoningInfo()) {   // family-events.js: a grown child's reckoning (the mirror)
      const kid = gameState.childReckoningInfo()
      box.classList.add('crisis')
      document.getElementById('family-title').textContent = CHILD_RECKONING_TITLE
      document.getElementById('family-desc').textContent = String(CHILD_RECKONING_TEXT).replace(/\{name\}/g, kid.given)
      choicesEl.innerHTML = CHILD_RECKONING_CHOICES.map(ch =>
        `<button data-kidreckon="${ch.id}">${escHtml(ch.label)}<span class="family-sub">${escHtml(ch.sub)}</span></button>`).join('')
      choicesEl.querySelectorAll('[data-kidreckon]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        gameState.resolveChildReckoning(kid.id, btn.dataset.kidreckon)
      }))
    } else if (!(f.spouse && f.event) && !f.childEvent && s.upbringing?.event) {   // 2.6d upbringing (you are the child)
      const ev = s.upbringing.event, def = gameState.upbringingEventDef(ev)
      box.classList.remove('crisis')
      document.getElementById('family-title').textContent = def.title
      const bl = s.birth?.headBond != null ? bondLabel(s.birth.headBond) : null
      document.getElementById('family-desc').textContent = gameState.upbringingText(def.text) + (bl ? ` (your bond with the head: ${bl.word.toLowerCase()})` : '')
      choicesEl.innerHTML = def.choices.map((ch, i) => `<button data-uchoice="${i}">${escHtml(gameState.upbringingText(ch.label))}</button>`).join('')
      choicesEl.querySelectorAll('[data-uchoice]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        gameState.resolveUpbringingEvent(+btn.dataset.uchoice)
      }))
    } else if (!(f.spouse && f.event) && f.childEvent) {   // 2.6b child event (after duel/marriage matters)
      const ev = f.childEvent, def = gameState.childEventDef(ev)
      const child = f.children.find(c => c.id === ev.childId)
      box.classList.toggle('crisis', !!ev.crisis)
      document.getElementById('family-title').textContent = def.title
      document.getElementById('family-desc').textContent = gameState.familyText(def.text, ev) +
        (child ? ` (${child.given}: ${bondLabel(child.bond).word.toLowerCase()}, age ${Math.floor(s.world.year - child.bornYear)})` : '')
      choicesEl.innerHTML = def.choices.map((ch, i) => {
        const cost = gameState.familyCost(ch)
        const sub = cost ? `<span class="family-sub">${fmt(cost)} Spirit Stones</span>` : ''
        return `<button data-cchoice="${i}" ${s.spiritStones < cost ? 'disabled' : ''}>${escHtml(gameState.familyText(ch.label, ev))}${sub}</button>`
      }).join('')
      choicesEl.querySelectorAll('[data-cchoice]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        gameState.resolveChildEvent(+btn.dataset.cchoice)
      }))
    } else {
      const def = gameState.marriageEventDef(f.event)
      box.classList.toggle('crisis', !!f.event.crisis)
      document.getElementById('family-title').textContent = def.title
      document.getElementById('family-desc').textContent = gameState.familyText(def.text, f.event)
      choicesEl.innerHTML = def.choices.map((ch, i) => {
        const cost = gameState.familyCost(ch)
        const sub = cost ? `<span class="family-sub">${fmt(cost)} Spirit Stones</span>` : ''
        return `<button data-choice="${i}" ${s.spiritStones < cost ? 'disabled' : ''}>${escHtml(gameState.familyText(ch.label, f.event))}${sub}</button>`
      }).join('')
      choicesEl.querySelectorAll('[data-choice]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        gameState.resolveMarriageEvent(+btn.dataset.choice)
      }))
    }
    document.getElementById('family-overlay').classList.remove('hidden')
  }

  // ── Heir + Tournament of Heirs (clan-succession.md 2.6c) ─────────────────

  function childSummary(s, c) {
    const pers = PERSONALITIES.find(x => x.id === c.personality)
    const bl = bondLabel(c.bond ?? 50)
    return [personStageLabel(c.stageIndex), c.root ? `${escHtml(latinOnly(c.root.name))} ×${c.root.mult}` : '',
      escHtml(pers?.name || ''), bl.word + (c.trauma ? ' · scarred' : '')].filter(Boolean).join(' · ')
  }

  function openHeirOverlay() {
    const s = gameState.get(), f = s.family
    const list = document.getElementById('heir-list')
    list.innerHTML = gameState.eligibleHeirs().map(c => `<button data-heir="${escHtml(c.id)}"${c.id === f.heirId ? ' style="border-color:var(--gold)"' : ''}>
      ${escHtml(Persons.fullName(c))}${c.id === f.heirId ? ' ★' : ''}<span class="fam-sub">${childSummary(s, c)}</span></button>`).join('') ||
      '<div class="fam-modal-desc">No adult children at home.</div>'
    list.querySelectorAll('[data-heir]').forEach(b => b.addEventListener('click', () => {
      gameState.chooseHeir(b.dataset.heir); document.getElementById('heir-overlay').classList.add('hidden')
    }))
    document.getElementById('heir-overlay').classList.remove('hidden')
  }
  document.getElementById('heir-clear').addEventListener('click', () => { gameState.clearHeir(); document.getElementById('heir-overlay').classList.add('hidden') })
  document.getElementById('heir-close').addEventListener('click', () => document.getElementById('heir-overlay').classList.add('hidden'))

  // Pairing state lives in the render layer only (no persisted state): click one fighter, then their opponent.
  let _tPick = null, _tPairs = [], _tLog = [], _tSpare = new Set()   // _tSpare: pair indexes whose loser you spare (1.8b-3b)
  function openTournamentOverlay() {
    _tPick = null; _tPairs = []; _tSpare = new Set()
    renderTournament()
    document.getElementById('tournament-overlay').classList.remove('hidden')
  }
  function renderTournament() {
    const s = gameState.get(), f = s.family, info = gameState.tournamentInfo()
    const box = document.getElementById('tournament-box')
    const kid = id => f.children.find(c => c.id === id)
    document.getElementById('tournament-log').innerHTML = _tLog.map(r => {
      const g = r.died ? 'skull' : r.spared ? 'lotus' : r.yielded ? 'yield' : 'broken'
      return `<div class="t-log ${r.died ? 'died' : r.spared ? 'spared' : ''}"><b>${Icon(g)}</b><span>${escHtml(r.text)}</span></div>` }).join('')
    if (!info) {   // finished (or called off)
      box.classList.remove('lethal')
      const heir = f.heirId ? kid(f.heirId) : null
      document.getElementById('tournament-info').textContent = heir ? `${Persons.fullName(heir)} is your heir.` : 'The tournament is over.'
      document.getElementById('tournament-pool').innerHTML = ''; document.getElementById('tournament-pairs').innerHTML = ''
      for (const id of ['tournament-auto', 'tournament-fight', 'tournament-cancel']) document.getElementById(id).disabled = true
      return
    }
    box.classList.toggle('lethal', info.lethal)
    document.getElementById('tournament-info').textContent = info.lethal
      ? `Round ${info.round} — TO THE DEATH. ${info.n} remain; pair ${info.fights} fight${info.fights === 1 ? '' : 's'} (the field never drops below ${TOURNAMENT_TOP}). Unpaired fighters rest. You may spare any loser: they live, but leave the house in disgrace.`
      : `Round ${info.round} — the Top ${info.n}, non-lethal. Pair ${info.fights} fight${info.fights === 1 ? '' : 's'}.`
    const pairedIds = new Set(_tPairs.flat())
    document.getElementById('tournament-pool').innerHTML = info.pool.map(id => { const c = kid(id)
      const pn = _tPairs.findIndex(p => p.includes(id))
      return `<button data-fighter="${escHtml(id)}" class="${_tPick === id ? 'picked' : ''}${pairedIds.has(id) ? ' paired' : ''}">${pn >= 0 ? `<span class="t-no">${pn + 1}</span>` : _tPairs.length >= info.fights ? '<span class="t-rest" data-icon="idle"></span>' : ''}${escHtml(Persons.fullName(c))}<span class="fam-sub">${childSummary(s, c)}</span></button>` }).join('')
    // 1.8b-3b: each pairing is a small versus tile — who, how strong, the odds, and (lethal rounds) death or mercy
    document.getElementById('tournament-pairs').innerHTML = _tPairs.map(([a, b], i) => {
      const A = kid(a), B = kid(b), pa = gameState._powerChance(A, B), spare = _tSpare.has(i)
      return `<div class="t-pair${spare ? ' spared' : ''}">
        <div class="t-vs"><span class="t-no">${i + 1}</span>
          <span class="t-f"><b>${escHtml(A.given)}</b><small>${escHtml(stageShortName(A.stageIndex))}</small></span>
          <i>vs</i>
          <span class="t-f r"><b>${escHtml(B.given)}</b><small>${escHtml(stageShortName(B.stageIndex))}</small></span></div>
        <div class="t-odds"><span class="l">${Math.round(pa * 100)}%</span><span class="t-bar"><i data-w="${Math.round(pa * 100)}"></i><em></em></span><span class="r">${Math.round((1 - pa) * 100)}%</span></div>
        ${info.lethal ? `<div class="t-switch" role="group">
            <button class="${spare ? '' : 'on death'}" data-spare="${i}" data-v="0">${Icon('skull')} To the death</button>
            <button class="${spare ? 'on mercy' : ''}" data-spare="${i}" data-v="1">${Icon('lotus')} Spare the loser</button></div>
          <div class="t-cons">${spare ? 'The loser lives, but leaves the house in disgrace.' : 'The loser dies. Every survivor carries it.'}</div>` : ''}
      </div>` }).join('')
    document.querySelectorAll('#tournament-pairs [data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
    document.querySelectorAll('#tournament-pairs [data-spare]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.spare; if (b.dataset.v === '1') _tSpare.add(i); else _tSpare.delete(i); renderTournament()
    }))
    document.getElementById('tournament-pool').querySelectorAll('[data-fighter]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.fighter
      const existing = _tPairs.findIndex(p => p.includes(id))
      if (existing >= 0) {                                                  // click a paired fighter → unpair
        _tPairs.splice(existing, 1)
        _tSpare = new Set([..._tSpare].filter(i => i !== existing).map(i => (i > existing ? i - 1 : i)))
      }
      else if (_tPick === id) _tPick = null
      else if (_tPick && _tPairs.length < info.fights) { _tPairs.push([_tPick, id]); _tPick = null }
      else _tPick = id
      renderTournament()
    }))
    document.getElementById('tournament-auto').disabled = _tPairs.length >= info.fights
    document.getElementById('tournament-fight').disabled = _tPairs.length !== info.fights
    document.getElementById('tournament-cancel').disabled = info.fightsDone > 0
  }
  document.getElementById('tournament-auto').addEventListener('click', () => {
    const info = gameState.tournamentInfo(); if (!info) return
    const free = info.pool.filter(id => !_tPairs.flat().includes(id))
    while (_tPairs.length < info.fights && free.length >= 2) _tPairs.push([free.shift(), free.shift()])
    _tPick = null; renderTournament()
  })
  document.getElementById('tournament-fight').addEventListener('click', () => {
    const res = gameState.fightTournamentRound(_tPairs, [..._tSpare])
    if (!res.ok) return flashMessage('Pair every fight first', 'negative')
    _tLog.push(...res.results); _tPairs = []; _tPick = null; _tSpare = new Set()
    renderTournament()
  })
  document.getElementById('tournament-cancel').addEventListener('click', () => {
    gameState.cancelTournament(); _tLog = []; document.getElementById('tournament-overlay').classList.add('hidden')
  })
  document.getElementById('tournament-close').addEventListener('click', () => {
    document.getElementById('tournament-overlay').classList.add('hidden')
    if (!gameState.get().family.tournament) _tLog = []
  })

  document.getElementById('family-later').addEventListener('click', () => {
    document.getElementById('family-overlay').classList.add('hidden')
  })

  document.getElementById('proposal-later').addEventListener('click', () => {
    document.getElementById('proposal-overlay').classList.add('hidden')
  })

  document.getElementById('proposal-decline').addEventListener('click', () => {
    gameState.declineProposal()
    document.getElementById('proposal-overlay').classList.add('hidden')
  })

  document.getElementById('btn-settings').addEventListener('click', () => settingsUI.open())

  // Titlebar ⋯ menu (Overlay only): forwards to the real 窗 / 歸 buttons, which CSS hides in Overlay
  const tbMenu = document.getElementById('tb-menu')
  document.getElementById('btn-more').addEventListener('click', e => { e.stopPropagation(); tbMenu.classList.toggle('hidden'); document.getElementById('layout-tip')?.click() })   // opening the menu answers the layout tip
  tbMenu.addEventListener('click', e => {
    const it = e.target.closest('[data-tbm]')
    if (!it) return
    tbMenu.classList.add('hidden')
    document.getElementById(it.dataset.tbm === 'layout' ? 'btn-layout' : 'btn-back').click()
  })
  document.addEventListener('click', e => { if (!tbMenu.contains(e.target)) tbMenu.classList.add('hidden') })

  // ── Mode panel: Active / Idle (Phase 22) + every automation switch (1.8b-1) ─
  // One home for automation (it used to render at the top of Explore and both Sect views). Opened from the
  // titlebar 閒/動 button and from the 自 chip beside the sub-tabs.
  function openModePanel() {
    renderModePanel(gameState.get())
    document.getElementById('mode-overlay').classList.remove('hidden')
  }
  function closeModePanel() { document.getElementById('mode-overlay').classList.add('hidden') }
  document.getElementById('btn-mode').addEventListener('click', openModePanel)
  document.getElementById('mode-close').addEventListener('click', closeModePanel)
  document.getElementById('mode-overlay').addEventListener('click', e => { if (e.target.id === 'mode-overlay') closeModePanel() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModePanel() })

  function renderModePanel(s) {
    if (!s) return
    const body = document.getElementById('mode-body')
    const active = s.playMode === 'active'
    const pct = x => Math.round(x * 100) + '%'
    const card = (id, glyph, name, cn, sum, lines, on, extra = '') => `
      <button class="mode-card${on ? ' active' : ''}" data-mode="${id}">
        <span class="mode-card-head"><span class="mode-glyph">${Icon.g(glyph)}</span><span class="mode-name">${name}</span>${on ? '<span class="mode-now">current</span>' : ''}</span>
        <span class="mode-sum">${sum} Tap to switch.</span>
        ${lines.map(l => `<span class="mode-line">${l}</span>`).join('')}${extra}
      </button>`
    // What Idle would actually run right now (so the Idle card says something concrete)
    const AUTO_NAMES = { autoExplore: 'Auto-Explore', autoSectMissions: 'Auto-Missions', autoCraft: 'Auto-Craft', autoBreakthrough: 'Auto-Breakthrough', autoTemper: 'Auto-Temper' }
    const runs = Object.keys(AUTO_NAMES).filter(k => gameState.automationUnlocked(k) && s.automation[k]).map(k => AUTO_NAMES[k])
    const firstLock = Object.keys(AUTO_NAMES).find(k => !gameState.automationUnlocked(k))
    const runsLine = runs.length ? `<span class="mode-runs">Runs: ${runs.join(', ')}</span>`
      : `<span class="mode-runs none">Nothing switched on yet${firstLock ? `; the first unlocks at ${AUTOMATION_UNLOCKS[firstLock].label}` : ''}.</span>`
    body.innerHTML = `
      <div class="mode-intro">How you walk the path right now. Switch whenever you like; nothing is lost.</div>
      <div class="mode-cards">
        ${card('idle', 'idle', 'Idle', '', 'Automation works while you are away.', ['For when you step away.', 'Unlocked automation runs for you.', 'Nothing is ever punished for your absence.'], !active, runsLine)}
        ${card('active', 'active', 'Active', '', 'Faster journeys and focus bonuses while you play.', [
          `Expeditions ${pct(1 - ACTIVE_EXPEDITION_TIME_MULT)} faster, missions ${pct(1 - ACTIVE_SECT_MISSION_TIME_MULT)} faster.`,
          `Breakthrough focus: press within ${ACTIVE_BT_FOCUS_WINDOW_SECONDS}s of it lighting up for +${pct(ACTIVE_BT_FOCUS_BONUS)}.`,
          `A failed breakthrough keeps ${pct(ACTIVE_BT_QI_LOSS_BONUS)} more Qi.`,
          `Push Harder near an expedition's end (${Icon('stone')} ${ACTIVE_PUSH_HARDER_COST}) for an extra roll.`,
          `Master's Touch: ${pct(ACTIVE_CRAFT_TOUCH_CHANCE)} double crafts while you watch the furnace.`,
          `Body tempering earns ${pct(TEMPERING_XP_ACTIVE)} more XP.`,
          'Automation rests while you play.'], active)}
      </div>
      <div class="section-title">Automation</div>
      <div id="mode-auto"></div>`
    body.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.mode !== gameState.get().playMode) gameState.setPlayMode(b.dataset.mode)
    }))
    renderAutomationPanel(s, document.getElementById('mode-auto'))
  }

  function updateModeButton(s) {
    const btn = document.getElementById('btn-mode')
    const active = s.playMode === 'active'
    if (btn.dataset.mode === s.playMode) return
    btn.dataset.mode = s.playMode
    btn.innerHTML = `<span class="mb-glyph">${Icon(active ? 'active' : 'idle')}</span><span class="mb-name">${active ? 'Active' : 'Idle'}</span>`
    document.querySelector('#mode-title [data-icon]').innerHTML = Icon(active ? 'active' : 'idle')
    btn.classList.toggle('mode-active', active)
    btn.title = active ? 'Active Mode · click for Mode and automation' : 'Idle Mode · click for Mode and automation'
  }


  // ── Navigation + attention (1.8b-1) ─────────────────────────────────────────
  const nav = new NavUI({ onShow: view => renderView(view, gameState.get()), onMode: openModePanel })
  const attentionUI = new AttentionUI(item => {
    if (layoutUI.mode === 'banner' && !item.open) layoutUI.peek(false)   // a nav target needs the full window
    const s = gameState.get()
    if (item.open === 'proposal') openProposalOverlay(s)
    else if (item.open === 'family') openFamilyOverlay(s)
    else if (item.open === 'tournament') openTournamentOverlay()
    else if (item.open === 'combat') combatView.resume()   // Phase 35: a beast battle underway
    else if (item.open === 'soul') { if (layoutUI.mode === 'banner') layoutUI.peek(false); soulView.open() }   // Phase 40
    if (!item.open || layoutUI.mode !== 'banner') nav.go(item.view)
  })
  attentionUI.onBannerMore = () => layoutUI.peek(false)
  // 1.8b-2: tap any [data-bd] number (HUD, Character tiles) for its "why" card (renderer/game/breakdowns.js)
  const breakdownUI = new BreakdownUI(gameState, { fmt, fmtTime, esc: escHtml })
  // Phase 28 (4.2): tap any [data-pid] name for that person's card (renderer/game/person-card.js)
  PersonCard.init(gameState, { esc: escHtml, stageLabel: personStageLabel, latinOnly,
    go: (view, g) => { if (layoutUI.mode === 'banner') layoutUI.peek(false); if (view === 'world' && g?.sectId) WorldView.show(g.sectId); nav.go(view) } })
  // Phase 28 (4.3): World → Class, and the toast for rare world news (a Chosen classmate falls, someone Ascends)
  ClassView.init(gameState, { esc: escHtml, stageLabel: personStageLabel })
  // Phase 28 (4.6): World → Chronicle; any [data-chronicle="<filter>"] link (the Sects ledger) opens it on that filter
  ChronicleView.init(gameState, { esc: escHtml })
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-chronicle]')
    if (!b) return
    ChronicleView.show(b.dataset.chronicle)
    if (layoutUI.mode === 'banner') layoutUI.peek(false)
    nav.go('chronicle')
  })
  gameState.onGameEvent((type, ctx) => { if (type === 'world_news') showToast(ctx.text, ctx.type) })

  document.getElementById('btn-pin').addEventListener('click', async () => {
    const btn = document.getElementById('btn-pin')
    const pinned = await window.electron.toggleAlwaysOnTop()
    btn.classList.toggle('pinned', pinned)
    btn.title = pinned ? 'Pinned on top (click to unpin)' : 'Not pinned (click to pin on top)'
  })

  document.getElementById('btn-quit').addEventListener('click', () => {
    gameState.forceSave()
    // Setting 'closeButton' (default 'quit' since 1.8b-1, user 2026-09-26): a real quit, or hide to the tray and
    // keep cultivating. main.js applies the same choice to native closes (Alt+F4, taskbar) via setCloseToTray.
    // See docs/systems/notifications.md.
    if (gameState.getSettings().closeButton === 'tray') window.electron.hideToTray()
    else window.electron.quit()
  })

  // The one name box, shared by the cultivator's own title (click to rename) and a child's Rename action
  // (Kin → Family). `openRename(value, onOk, maxLength)` — onOk receives the entered text on OK/Enter.
  let _renameOnOk = null
  function openRename(value, onOk, maxLength = 24) {
    const input = document.getElementById('rename-input')
    input.maxLength = maxLength
    input.value = value || ''
    _renameOnOk = onOk || null
    document.getElementById('rename-overlay').classList.remove('hidden')
    input.focus(); input.select()
  }
  function commitRename() {
    const input = document.getElementById('rename-input')
    const fn = _renameOnOk
    document.getElementById('rename-overlay').classList.add('hidden')
    _renameOnOk = null
    if (fn) fn(input.value)
  }
  function closeRename() { document.getElementById('rename-overlay').classList.add('hidden'); _renameOnOk = null }

  document.getElementById('cultivator-name').addEventListener('click', () => {
    openRename(gameState.get()?.name || '', v => gameState.setName(v))
  })

  document.getElementById('rename-ok').addEventListener('click', commitRename)
  document.getElementById('rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') closeRename()
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  let flashTimer = null
  function flashMessage(msg, type = 'positive') {
    gameState.addEvent({ text: msg, type })
    showToast(msg, type)
  }
  // The toast alone (the engine already logged the line, e.g. Phase 28 world news)
  function showToast(msg, type = 'positive') {
    let toast = document.getElementById('_toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = '_toast'
      document.body.appendChild(toast)   // look: styles.css #_toast
    }
    // 1.8b-1: land on the lower edge of the sprite scene, never over tab content or a popup's rows (1.8c bug).
    // Banner mode positions it in the strip via CSS instead.
    const scene = document.getElementById('sprite-wrap').getBoundingClientRect()
    toast.style.top  = Math.max(4, scene.bottom - 34) + 'px'
    toast.style.left = (scene.left + scene.width / 2) + 'px'
    if (flashTimer) clearTimeout(flashTimer)
    const color = type === 'special' ? 'var(--gold)' : type === 'negative' ? 'var(--red)' : type === 'neutral' ? 'var(--dim)' : 'var(--jade)'
    toast.style.borderColor = color
    toast.style.color       = color
    toast.textContent       = msg
    toast.style.opacity     = '1'
    flashTimer = setTimeout(() => { toast.style.opacity = '0' }, 2800)
  }

  function fmt(n) {
    const mode = gameState.getSettings().displayNumbers
    if (!isFinite(n)) return '∞'
    if (mode === 'raw')        return Math.floor(n).toLocaleString('en-US')
    if (mode === 'scientific') return n >= 1e4 ? n.toExponential(2).replace('e+', 'e') : Math.floor(n).toString()
    if (n >= 1e15) return '∞'
    // Round first, then pick the unit: 999,960 must read "1.00M", not "1000.0K" (1.8b-6 review).
    if (n < 1e3) return Math.floor(n).toString()
    const units = [[1e3, 1, 'K'], [1e6, 2, 'M'], [1e9, 2, 'B'], [1e12, 2, 'T']]
    for (let i = 0; i < units.length; i++) {
      const [div, dp, suf] = units[i]
      if (i === units.length - 1 || +(n / div).toFixed(dp) < 1000) return (n / div).toFixed(dp) + suf
    }
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  function fmtAgo(ts) {
    const ago = Math.floor((Date.now() - ts) / 1000)
    if (ago < 60)   return `${ago}s ago`
    if (ago < 3600) return `${Math.floor(ago/60)}m ago`
    return `${Math.floor(ago/3600)}h ago`
  }

  // "纯灵根 Pure wood Root" → "Pure wood Root": the English beside a colored glyph marker, no plain CJK text (user 2026-09-27)
  function latinOnly(s) {
    return String(s).replace(/[\u3400-\u9fff\uf900-\ufaff]+/g, '').replace(/\s+/g, ' ').trim()
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

})()
