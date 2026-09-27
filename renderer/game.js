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
  }

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
    document.getElementById('app').classList.add('hidden')
    document.getElementById('charselect').classList.remove('hidden')
    layoutUI.leaveGame()
    settingsUI.close()
    settingsUI.apply(gameState.defaultSettings())
    document.getElementById('banter-bubble').classList.add('hidden')   // charselect always shows default presentation
    renderCharSelect()
  })

  // ── Game bootstrap ────────────────────────────────────────────────────────

  const renderer  = new ASCIIRenderer(document.getElementById('sprite-canvas'))
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

    gameState.subscribe((s, fromTick) => {
      if (!s) return
      if (!fromTick) settingsUI.apply(s.settings)
      updateHUD(s, fromTick)
      updateSprite(s)
      if (s.lastReincarnation && s.lastReincarnation.ts !== _lastDeathTs) {
        _lastDeathTs = s.lastReincarnation.ts
        showDeathOverlay(s.lastReincarnation)
      } else if (s.interlude && document.getElementById('death-overlay').classList.contains('hidden')) {
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

    document.getElementById('stage-realm').textContent = `${st.realm} — ${st.realmCN}`
    document.getElementById('stage-realm').style.color = st.color || 'var(--gold)'
    document.getElementById('stage-layer').textContent = `${st.layer} · ${st.layerCN}`
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
    // 1.8b-2: ancestral catch-up is visible where the Qi rate is (it opens the same Qi/s breakdown)
    const cuChip = document.getElementById('catchup-chip')
    cuChip.classList.toggle('hidden', !d.catchUp)
    if (d.catchUp) cuChip.title = `Ancestral catch-up: ×${CATCHUP_QPS_MULT} Qi/s until ${stageShortName(d.catchUpUntil)}`
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
    const health = s.health ?? 100
    const ht = health / 100
    const { red: R, jade: J } = settingsUI.palette()
    const hr = Math.round(R[0] + ht * (J[0] - R[0]))
    const hg = Math.round(R[1] + ht * (J[1] - R[1]))
    const hb = Math.round(R[2] + ht * (J[2] - R[2]))
    document.getElementById('health-fill').style.width      = Math.min(100, health) + '%'
    document.getElementById('health-fill').style.background = `rgb(${hr},${hg},${hb})`
    document.getElementById('health-numbers').textContent   = String(Math.round(health))

    // Age readout (Phase 30) — a stat only, nothing dies of age
    document.getElementById('age-numbers').textContent = String(Math.floor(s.age))

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
    nav.update(s, att, k => gameState.automationUnlocked(k))
    // A banter bubble never sits on top of a popup (1.8c bug: it covered the death + ascension cards)
    if (isPopupOpen()) document.getElementById('banter-bubble').classList.add('hidden')
    if (!document.getElementById('mode-overlay').classList.contains('hidden') && !fromTick) renderModePanel(s)

    const activeTab = nav.view
    if (fromTick) {
      // On every tick: only update the live expedition timer without re-rendering
      if (activeTab === 'explore') updateExpeditionTimerInPlace(s)
      if (activeTab === 'sect')    updateSectTimersInPlace(s)
      if (activeTab === 'pack')    updatePackDeltaInPlace(s)   // Phase 21: per-frame currency delta fade
    } else {
      // On explicit state changes: full tab re-render (safe, buttons will be stable until next change)
      renderView(activeTab, s)
    }
  }

  // 1.8b-1: one entry point per view (NAV_GROUPS in renderer/game/nav.js)
  const VIEW_RENDER = {
    techniques: s => renderTechniques(s), stats: s => renderStats(s), explore: s => renderExplore(s),
    beasts: s => renderBeasts(s), family: s => renderFamily(s), clan: s => renderClan(s), hall: s => renderHall(s), sect: s => renderSect(s),
    pack: s => renderPack(s), craft: s => renderCraft(s), events: s => renderEvents(s), banter: s => renderBanter(s),
  }
  function renderView(view, s) {
    if (!s) return
    VIEW_RENDER[view]?.(s)
    if (view === 'sect') nav.setContext(s.ownSect?.founded ? s.ownSect.name : s.sect?.id ? SECTS.find(x => x.id === s.sect.id)?.name : 'no sect yet')
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

    const qb    = TECHNIQUES.find(t => t.id === 'qi_breathing')
    const qbRow = document.createElement('div')
    qbRow.className = 'tech-row owned'
    qbRow.innerHTML = techRowHTML(qb, true, false)
    el.appendChild(qbRow)

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
      el.appendChild(row)
    }
  }

  function techRowHTML(t, isOwned, isLocked) {
    const right = isOwned
      ? '<div class="tech-owned">✓ Learned</div>'
      : isLocked
        ? `<div class="tech-cost tech-lock" title="Unlocks at ${stageShortName(t.minStage)}">封 ${stageShortName(t.minStage)}</div>`
        : `<div class="tech-cost">🪨 ${t.cost}</div>`
    return `
      <div class="tech-main">
        <div class="tech-name">${t.name} <span style="color:var(--dim);font-size:10px">${t.nameCN}</span></div>
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
    const health = s.health ?? 100
    const tone = v => v >= 70 ? 'jade' : v >= 30 ? '' : 'warn'
    const persona = PERSONALITIES.find(x => x.id === s.personality?.id)
    const fp = st.id === 'ascension' ? null : gameState.btFailPreview()
    const toFill = Math.max(0, d.qiCap * 0.9 - s.qi)
    const barColor = v => v >= 70 ? 'var(--jade)' : v >= 30 ? 'var(--gold)' : 'var(--red)'
    const tile = (bd, key, glyph, val, sub, cls = '', bar) => `<button class="ch-tile ${cls}" data-bd="${bd}">
        <span class="t-k"><span>${key}</span><i>${glyph}</i></span><span class="t-v">${val}</span>
        ${sub ? `<span class="t-s">${sub}</span>` : ''}${bar != null ? `<span class="ch-bar"><div data-w="${Math.max(0, Math.min(100, bar))}" data-bar="${barColor(bar)}"></div></span>` : ''}</button>`

    let btTile
    if (st.id === 'ascension') btTile = `<div class="ch-tile wide"><span class="t-k"><span>Ascended</span><i>仙</i></span><span class="t-v">Beyond the mortal path</span></div>`
    else if (s.stageIndex === lastMortal) btTile = tile('bt', 'Ascension Trial', '劫', (gameState.ascensionChance() * 100).toFixed(1) + '%', 'Failure ends this life', 'wide')
    else btTile = tile('bt', 'Breakthrough', '破', (d.breakthroughChanceDisplay * 100).toFixed(1) + '%',
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
          <span class="ch-tag root" title="Spiritual root: multiplies all Qi"><b>根</b>${escHtml(latinOnly(s.root.name))} ×${s.root.mult}</span>
          ${persona ? `<span class="ch-tag" title="${escHtml(persona.blurb)}"><b>性</b>${escHtml(persona.name)}</span>` : ''}
        </div>
        <div class="ch-meta" title="Age passes only while the game is open. Nothing dies of age."><b>歲</b>Age ${Math.floor(s.age)} ·<b>年</b>Year ${Math.floor(s.world.year)} ·<b>代</b>Gen ${s.generation || 1}</div>
        ${persona ? `<div class="ch-persona">${escHtml(persona.blurb)}</div>` : ''}
      </div>
      ${d.catchUp ? `<button class="ch-catchup" data-bd="qps"><span class="ch-cg">承</span><span class="ch-ct">Catch-up ×${CATCHUP_QPS_MULT} Qi · +${Math.round(CATCHUP_BT_BONUS * 100)}% BT</span><span class="ch-go">詳</span></button>` : ''}
      <div class="ch-grid">
        <section>
          <div class="ch-sec-title"><span>Cultivation</span></div>
          <div class="ch-tiles">
            ${tile('qps', 'Qi / second', '氣', fmt(d.qiPerSecondBoosted), `${(d.breakdown?.qps || []).length} sources${d.meditBonus > 1 ? ' · meditating' : ''}`, 'jade')}
            ${tile('cap', 'Qi capacity', '海', fmt(d.qiCap), toFill > 0 && d.qiPerSecondBoosted > 0 ? `Ready in ${fmtTime(Math.ceil(toFill / d.qiPerSecondBoosted)).replace(/ /g, '\u00a0')}` : 'Ready to break through')}
            ${btTile}
          </div>
        </section>
        <section>
          <div class="ch-sec-title"><span>Foundation</span></div>
          <div class="ch-tiles">
            ${tile('integrity', 'Integrity', '基', Math.round(integ), integ >= 100 ? 'Settled' : 'Mending', tone(integ), integ)}
            ${tile('health', 'Health', '血', Math.round(health), health >= 100 ? 'Whole' : 'Recovering', tone(health), health)}
            ${tile('karma', 'Karma', '緣', Math.round(s.karma), `+${(s.karma / 10).toFixed(1)}% breakthrough`)}
            ${bloodlineVisible(s) ? tile('bloodline', 'Bloodline', '脈', Math.round(s.bloodlineQuality || 0), `+${((s.bloodlineQuality || 0) * ASCENSION_BQ_COEF * 100).toFixed(1)}% Ascension`)
              : `<div class="ch-tile" title="Bloodline Quality is revealed at Spirit Severing, when it starts to matter"><span class="t-k"><span>Bloodline</span><i>脈</i></span><span class="t-v ch-sealed">封</span><span class="t-s">Sealed until Spirit Severing</span></div>`}
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
      confirm: showConfirm, flash: flashMessage, wire: wireKinButtons, endText: SPOUSE_END_TEXT, pendingKey: familyPendingKey,
    })
    familyView.render(s)
  }

  // ── 家 Kin → Clan + Hall (1.8b-4: renderer/game/clan-view.js) ──
  let clanView = null, hallView = null
  const kinHelpers = () => ({ esc: escHtml, fmt, stageLabel: personStageLabel, bondLabel, confirm: showConfirm, flash: flashMessage,
    wire: wireKinButtons, go: view => openHallOverlay(view), epitaphFor, fillEpitaph })
  function renderClan(s) { (clanView ||= new ClanView(gameState, kinHelpers())).render(s) }
  function renderHall(s) { (hallView ||= new HallView(gameState, kinHelpers())).render(s) }
  // The Hall was a pop-over until 1.8b-4; it is now Kin → Hall. Kept as the one entry point (banner peeks open).
  function openHallOverlay(view = 'hall') {
    if (layoutUI.mode === 'banner') layoutUI.peek(false)
    nav.go(view)
  }

  // ── 錄 Log → Banter (1.8b-1: was at the bottom of Stats) ──
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
        if (res.outcome === 'won_lethal' || res.outcome === 'won_nonlethal') flashMessage('You seized the head seat.', 'positive')
        else if (res.outcome === 'lost_nonlethal') flashMessage('You were beaten back.', 'negative')
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
    return `<div class="banter-log-head">Banter 碎碎念</div>
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

  // ── Sect tab (Phase 4) ────────────────────────────────────────────────────

  let _sectLeaveArmed = false

  function renderSect(s) {
    const el = document.getElementById('tab-sect')
    el.innerHTML = ''
    if (s.ownSect?.founded) { renderOwnSect(s); return }
    const sect = s.sect || { id: null }
    const def  = SECTS.find(x => x.id === sect.id)

    if (!def) {
      _sectLeaveArmed = false
      const title = document.createElement('div')
      title.className = 'section-title'
      title.textContent = 'Join a Sect'
      el.appendChild(title)

      for (const d of SECTS) {
        if (d.minStage > s.stageIndex + 3) continue
        const ok  = s.stageIndex >= d.minStage
        const row = document.createElement('div')
        row.className = 'sect-row' + (ok ? '' : ' locked')
        row.innerHTML = `
          <div class="sect-info">
            <div class="sect-name">${escHtml(d.name)} <span class="sect-cn">${escHtml(d.nameCN)}</span></div>
            <div class="sect-spec">${escHtml(d.specialty)}</div>
            <div class="sect-desc">${escHtml(d.desc)}</div>
          </div>
          <button class="sect-btn${ok ? ' available' : ''}" data-joinsect="${d.id}" ${ok ? '' : 'disabled'}>
            ${ok ? 'Join' : `封 ${stageShortName(d.minStage)}`}
          </button>`
        el.appendChild(row)
      }
      el.querySelectorAll('[data-joinsect]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = gameState.joinSect(btn.dataset.joinsect)
          if (!res.ok) flashMessage({ stage:'Realm too low', in_sect:'Already in a sect', own_sect:'You lead your own sect', unknown:'Unknown sect' }[res.reason] || 'Cannot join', 'negative')
          else flashMessage(`Joined ${res.sect.name}!`, 'special')
        })
      })
      renderFoundPanel(s, el)
      return
    }

    // ── Member view ──
    const rank     = SECT_RANKS[sect.rank]
    const nextRank = SECT_RANKS[sect.rank + 1]
    const canRank  = nextRank && sect.contribution >= nextRank.minContribution
    const head = document.createElement('div')
    head.className = 'sect-header'
    head.innerHTML = `
      <div class="sect-name">${escHtml(def.name)} <span class="sect-cn">${escHtml(def.nameCN)}</span></div>
      <div class="sect-spec">${escHtml(def.specialty)}</div>
      <div class="sect-rank">${escHtml(rank.name)} <span class="sect-cn">${escHtml(rank.nameCN)}</span></div>
      <div class="sect-contrib">Contribution: ${fmt(sect.contribution)}${nextRank ? ` / ${fmt(nextRank.minContribution)} for ${escHtml(nextRank.name)}` : ' (max rank)'}</div>
      ${nextRank ? `<div class="beast-xp-bar-wrap"><div class="beast-xp-bar" id="_sect_rank_bar"></div></div>` : ''}
      <div class="sect-btns">
        <button class="sect-btn${canRank ? ' available' : ''}" id="_sect_rankup" ${canRank ? '' : 'disabled'}>Advance Rank</button>
        <button class="sect-btn" id="_sect_donate" ${s.spiritStones >= 10 ? '' : 'disabled'}>Donate 10 Stones</button>
        <button class="sect-btn sect-leave" id="_sect_leave">${_sectLeaveArmed ? 'Confirm Leave?' : 'Leave'}</button>
      </div>`
    el.appendChild(head)
    if (s.stageIndex >= SECT_FOUNDING.minStage) {
      const hint = document.createElement('div')
      hint.className = 'sect-desc'
      hint.style.marginBottom = '6px'
      hint.textContent = 'Nascent Soul reached: leave this sect if you wish to found your own.'
      el.appendChild(hint)
    }
    const rankBar = head.querySelector('#_sect_rank_bar')
    if (rankBar) rankBar.style.width = Math.min(100, (sect.contribution - rank.minContribution) / (nextRank.minContribution - rank.minContribution) * 100) + '%'
    renderMemberWarPanel(s, el)
    renderWarOrdersPanel(s, el, 'member')
    // Mission bars: set via JS (CSP blocks inline style attributes in innerHTML)
    const mt = document.createElement('div')
    mt.className = 'section-title'
    mt.textContent = `Missions (${sect.activeMissions.length}/${SECT_MAX_MISSIONS} active)`
    el.appendChild(mt)

    for (const m of SECT_MISSIONS) {
      const active   = sect.activeMissions.find(a => a.missionId === m.id)
      const unlocked = sect.rank >= m.minRank
      const full     = sect.activeMissions.length >= SECT_MAX_MISSIONS
      const durText  = m.duration >= 60 ? `${Math.floor(m.duration / 60)}m` : `${m.duration}s`
      const rewards  = [...m.rewards.map(r => `${ITEMS[r.itemId]?.name || r.itemId}`), ...(m.beastXp ? ['Beast XP'] : []), 'Contribution'].join(', ')
      const row = document.createElement('div')
      row.className = 'loc-row' + (unlocked ? '' : ' locked')
      let status = ''
      if (active) {
        const msLeft = Math.max(0, active.endsAt - Date.now())
        const pct = Math.max(0, Math.min(100, 100 - msLeft / (m.duration * 1000) * 100))
        status = `<div class="sect-mission-timer" data-uid="${active.uid}" data-mid="${m.id}">${fmtTime(Math.ceil(msLeft / 1000))} remaining</div>
                  <div class="exp-timer-bar-wrap"><div class="exp-timer-bar" data-barfor="${active.uid}" style="width:${pct}%"></div></div>`
      }
      row.innerHTML = `
        <div class="loc-info">
          <div class="loc-name">${escHtml(m.name)} <span style="color:var(--dim);font-size:9px">${escHtml(m.nameCN)}</span></div>
          <div class="loc-meta">${durText} · ${escHtml(rewards)}${unlocked ? '' : ` · ${escHtml(SECT_RANKS[m.minRank].name)}+`}</div>
          ${status}
        </div>
        <button class="loc-btn${unlocked && !active && !full ? ' available' : ''}" data-mission="${m.id}"
                ${(!unlocked || active || full) ? 'disabled' : ''}>${active ? 'Active' : unlocked ? 'Start' : 'Locked'}</button>`
      el.appendChild(row)
    }

    updateSectTimersInPlace(s)
    el.querySelectorAll('[data-mission]').forEach(btn => {
      btn.addEventListener('click', () => quickActions.startMission(btn.dataset.mission))
    })
    document.getElementById('_sect_rankup')?.addEventListener('click', () => {
      const res = gameState.rankUpSect()
      if (!res.ok) flashMessage('Not enough contribution', 'negative')
    })
    document.getElementById('_sect_donate')?.addEventListener('click', () => {
      const res = gameState.donateToSect(10)
      if (res.ok) flashMessage(`Donated 10 Spirit Stones (+${res.gained} Contribution)`, 'positive')
      else flashMessage('Not enough Spirit Stones', 'negative')
    })
    document.getElementById('_sect_leave')?.addEventListener('click', () => {
      if (!_sectLeaveArmed) { _sectLeaveArmed = true; renderSect(gameState.get()); return }
      _sectLeaveArmed = false
      gameState.leaveSect()
    })
  }

  // ── Own sect (Phase 5A) ───────────────────────────────────────────────────

  let _ownDisbandArmed = false

  function renderFoundPanel(s, el) {
    const F = SECT_FOUNDING
    if (s.stageIndex < F.minStage - 3) return
    const ok       = s.stageIndex >= F.minStage
    const haveItems = Object.entries(F.items).every(([id, q]) => (s.inventory[id] || 0) >= q)
    const canPay   = s.spiritStones >= F.stones && haveItems
    const costTxt  = [`${F.stones} Spirit Stones`, ...Object.entries(F.items).map(([id, q]) => `${q} ${ITEMS[id]?.name || id}`)].join(' + ')
    const title = document.createElement('div')
    title.className = 'section-title'
    title.textContent = 'Found Your Own Sect'
    el.appendChild(title)
    const box = document.createElement('div')
    box.className = 'sect-row' + (ok ? '' : ' locked')
    box.innerHTML = `
      <div class="sect-info">
        <div class="sect-name">創派 Found a Sect</div>
        <div class="sect-spec">Cost: ${escHtml(costTxt)}</div>
        <div class="sect-desc">${ok ? 'Build halls, recruit disciples, and lead a sect of your own.' : `Requires ${stageShortName(F.minStage)}.`}</div>
        ${ok ? `<input id="_found_name" class="sect-input" maxlength="${F.maxNameLen}" placeholder="Name your sect…">` : ''}
      </div>
      <button class="sect-btn${ok && canPay ? ' available' : ''}" id="_found_btn" ${ok && canPay ? '' : 'disabled'}>Found</button>`
    el.appendChild(box)
    document.getElementById('_found_btn')?.addEventListener('click', () => {
      const name = document.getElementById('_found_name')?.value || ''
      const res = gameState.foundOwnSect(name)
      const msgs = { stage:'Realm too low', in_sect:'Leave your current sect first', founded:'Already founded', stones:'Not enough Spirit Stones', crystals:'Not enough Void Crystals' }
      if (!res.ok) flashMessage(msgs[res.reason] || 'Cannot found sect', 'negative')
      else flashMessage('Your sect is founded!', 'special')
    })
  }

  // ── Member wars (Phase 5C) ─────────────────────────────────────────────────

  function renderMemberWarPanel(s, el) {
    const w = s.sectWar
    if (!w || w.side !== 'member') return

    if (w.lastResult?.side === 'member') {
      const r = w.lastResult
      const bits = []
      if (r.stones) bits.push(`+${r.stones} stones`)
      if (r.contribDelta) bits.push(`${r.contribDelta > 0 ? '+' : ''}${r.contribDelta} contribution`)
      if (r.rareItem) bits.push(ITEMS[r.rareItem]?.name || r.rareItem)
      if (!r.seen && !r.engaged) bits.push('fought without you')
      else if (!r.engaged) bits.push('you ignored the call')
      const box = document.createElement('div')
      box.className = 'war-banner ' + (r.win ? 'win' : 'loss')
      box.textContent = `Last War: ${r.win ? 'Victory' : 'Defeat'} vs ${r.enemyName}${bits.length ? ' — ' + bits.join(', ') : ''}`
      el.appendChild(box)
    }

    const panel = document.createElement('div')
    panel.className = 'war-banner ' + (w.phase === 'none' ? '' : w.phase)
    if (w.phase === 'none') {
      panel.innerHTML = `
        <div class="sect-name">⚔ Sect Wars</div>
        <div class="sect-desc">Next call to arms in <span id="_war_timer"></span> · Record ${w.warVictories}W–${w.warDefeats}L${w.warsIgnored ? ` · ${w.warsIgnored} ignored` : ''}</div>
        ${s.derived.sectBuffSuppressed ? '<div class="sect-desc war-warn">The sect licks its wounds — its bonuses are suppressed for now.</div>' : ''}`
      el.appendChild(panel)
      return
    }

    const { bonus, power, rankMult } = gameState.memberWarPower()
    const winPct = Math.round(100 * power / (power + 1))   // vs the average enemy (power 1.0)
    const calling = w.phase === 'scouting'
    const chestFull = gameState.memberWarChestFull()
    const chestLeft = chestFull - w.chestStones
    const give = Math.min(Math.max(10, Math.ceil(chestFull / 4)), chestLeft)
    const warBeast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
    panel.innerHTML = `
      <div class="sect-name">⚔ ${escHtml(w.enemyName)} ${'★'.repeat(w.enemyTier)}</div>
      <div class="sect-desc">${calling ? 'Call to Arms — the elders summon every disciple.' : 'Muster — the sect gathers at the mountain gate.'}</div>
      <div class="war-timer">Battle in <span id="_war_timer"></span></div>
      <div class="sect-desc">Your commitment: +${Math.round(bonus * rankMult * 100)}% sect strength · ~${winPct}% to win</div>
      ${bonus ? '' : '<div class="sect-desc war-warn">Ignoring the call costs contribution and karma.</div>'}
      <div class="sect-btns">
        <button class="sect-btn${!w.answered ? ' available' : ''}" id="_war_answer" ${w.answered ? 'disabled' : ''}>${w.answered ? 'Answered ✓' : 'Answer the Call'}</button>
        <button class="sect-btn${chestLeft > 0 && s.spiritStones >= give ? ' available' : ''}" id="_war_chest" ${chestLeft <= 0 || s.spiritStones < give ? 'disabled' : ''}>${chestLeft <= 0 ? 'War Chest Full ✓' : `War Chest +${give} (${w.chestStones}/${chestFull})`}</button>
      </div>`
    el.appendChild(panel)

    // Pill + beast offerings
    const pills = Object.keys(s.inventory).filter(id => ITEMS[id]?.type === 'pill' && s.inventory[id] > 0)
    const idleBeasts = (s.beasts || []).filter(b => !b.expedition)
    const canPill  = w.pillsGiven < MEMBER_WAR_MAX_PILLS && pills.length > 0
    const canBeast = !warBeast && idleBeasts.length > 0
    if (canPill || canBeast || warBeast || w.pillsGiven) {
      const ot = document.createElement('div')
      ot.className = 'section-title'
      ot.textContent = `War Offerings (pills ${w.pillsGiven}/${MEMBER_WAR_MAX_PILLS}${warBeast ? ` · ${warBeast.name} at the front` : ''})`
      el.appendChild(ot)
      if (canPill) for (const id of pills) {
        const row = document.createElement('div')
        row.className = 'loc-row'
        row.innerHTML = `
          <div class="loc-info">
            <div class="loc-name">${escHtml(ITEMS[id].name)} <span class="sect-cn">×${s.inventory[id]}</span></div>
            <div class="loc-meta">+${Math.round(MEMBER_WAR_PILL_BONUS * rankMult * 100)}% strength · +${MEMBER_WAR_PILL_CONTRIB} contribution</div>
          </div>
          <button class="loc-btn available" data-warpill="${id}">Offer</button>`
        el.appendChild(row)
      }
      if (canBeast) for (const b of idleBeasts) {
        const pct = Math.round(Math.min(MEMBER_WAR_BEAST_MAX_BONUS, MEMBER_WAR_BEAST_BASE_BONUS + MEMBER_WAR_BEAST_LVL_BONUS * b.level) * rankMult * 100)
        const row = document.createElement('div')
        row.className = 'loc-row'
        row.innerHTML = `
          <div class="loc-info">
            <div class="loc-name">${escHtml(b.name)} <span class="beast-level">Lv.${b.level}</span></div>
            <div class="loc-meta">+${pct}% strength · returns with ${MEMBER_WAR_BEAST_XP} XP</div>
          </div>
          <button class="loc-btn available" data-warbeast="${escHtml(b.id)}">Send</button>`
        el.appendChild(row)
      }
    }

    const msgs = { already:'Already done', full:'Nothing more needed', stones:'Not enough Spirit Stones', none:'None left', busy:'That beast is busy', no_war:'The war is over' }
    document.getElementById('_war_answer')?.addEventListener('click', () => {
      const r = gameState.answerWarCall()
      if (!r.ok) flashMessage(msgs[r.reason] || 'Cannot answer', 'negative')
      else flashMessage('You answered the call to arms', 'positive')
    })
    document.getElementById('_war_chest')?.addEventListener('click', () => {
      const r = gameState.donateWarChest(give)
      if (!r.ok) flashMessage(msgs[r.reason] || 'Cannot donate', 'negative')
      else flashMessage(`War chest +${r.given} stones (+${r.gained} Contribution)`, 'positive')
    })
    el.querySelectorAll('[data-warpill]').forEach(btn => btn.addEventListener('click', () => {
      const r = gameState.offerWarPill(btn.dataset.warpill)
      if (!r.ok) flashMessage(msgs[r.reason] || 'Cannot offer', 'negative')
      else flashMessage(`Pill offered (+${r.gained} Contribution)`, 'positive')
    }))
    el.querySelectorAll('[data-warbeast]').forEach(btn => btn.addEventListener('click', () => {
      const r = gameState.sendBeastToWar(btn.dataset.warbeast)
      if (!r.ok) flashMessage(msgs[r.reason] || 'Cannot send', 'negative')
      else flashMessage(`${r.beast.name} marches to war`, 'positive')
    }))
  }

  // ── Automation panel (Phase 22, section 22D) ───────────────────────────────
  // Lives in the Mode panel only (1.8b-1; it used to render at the top of Explore and both Sect views) — a
  // roadmap of what's unlocked and what unlocks next. Reuses the ⚙ Settings panel's .set-row/.set-label/.set-seg/.set-opt
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
      ['autoExplore', 'Auto-Explore', 'Sends you back to your last location when an expedition returns. Pause a location in Explore.'],
      ['autoSectMissions', 'Auto-Missions', 'Re-takes a finished sect mission while a slot is free.'],
      ['autoCraft', 'Auto-Craft', 'Crafts every recipe you mark Auto in Pack → Craft, whenever materials allow.'],
      ['autoBreakthrough', 'Auto-Breakthrough', 'Attempts a breakthrough once Qi reaches the threshold.'],
    ]
    for (const [key, name, what] of ROWS) {
      const unlocked = gameState.automationUnlocked(key)
      const row = document.createElement('div')
      row.className = 'set-row auto-row' + (unlocked ? '' : ' locked')
      const label = document.createElement('div')
      label.className = 'set-label'
      label.innerHTML = `<span class="auto-name">${unlocked ? '' : '封 '}${name}</span><span class="auto-what">${what}</span>`
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
    el.appendChild(box)
  }

  // ── War Standing Orders (Phase 32) ─────────────────────────────────────────
  // Compact section shown in both the member view (renderSect) and the own-sect view (renderOwnSect).
  // Reuses the ⚙ Settings panel's .set-row/.set-label/.set-seg/.set-opt CSS so it fits 300px without
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

    const numRow = (label, key, hint) => {
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
      input.step = 10
      input.value = o[key]
      input.addEventListener('change', () => gameState.setWarOrder(key, input.value))
      row.appendChild(input)
      el.appendChild(row)
    }

    if (side === 'member') {
      segRow('Answer calls', 'answer', [
        { value: 'always', label: 'Always' }, { value: 'defensive', label: 'Defensive' }, { value: 'stay_out', label: 'Stay out' },
      ], 'Defensive behaves like Always for now — every member war today is your sect being attacked.')
      numRow('War chest (stones/war)', 'chestStones', '0 = never donate automatically; capped by the chest and what you can afford')
      segRow('Lend beast', 'lendBeast', [{ value: 'never', label: 'Never' }, { value: 'strongest', label: 'Strongest' }])
    } else if (side === 'own') {
      segRow('Reinforce', 'reinforce', [{ value: 'never', label: 'Never' }, { value: 'if_affordable', label: 'If affordable' }])
      numRow('…and keeps at least', 'reinforceKeep', 'Only reinforce if this many Spirit Stones remain banked afterward')
      segRow('Request ally', 'ally', [{ value: 'never', label: 'Never' }, { value: 'cheapest', label: 'Cheapest' }, { value: 'best', label: 'Best' }])
    }
  }

  function renderSectWarPanel(s, el) {
    const w = s.sectWar
    if (!w) return
    const d = s.derived

    if (w.lastResult) {
      const r = w.lastResult
      const box = document.createElement('div')
      box.className = 'war-banner ' + (r.win ? 'win' : 'loss')
      box.textContent = r.win
        ? `Last War: Victory vs ${r.enemyName} — +${r.spoils.spirit_stone} stones, +${r.spoils.spirit_herb} herbs`
        : `Last War: Defeat vs ${r.enemyName} — lost ${r.spoilsLost} stones${r.arrayHit ? ' · array damaged' : ''}`
      el.appendChild(box)
    }

    const panel = document.createElement('div')
    panel.className = 'war-banner ' + (w.phase === 'none' ? '' : w.phase)
    if (w.phase === 'none') {
      panel.innerHTML = `
        <div class="sect-name">⚔ Sect Wars</div>
        <div class="sect-desc">Next threat in <span id="_war_timer"></span> · Record ${w.warVictories}W–${w.warDefeats}L</div>
        ${d.arrayDamaged ? '<div class="sect-desc" style="color:var(--red)">Defensive Array damaged — offline until repaired by time.</div>' : ''}`
      el.appendChild(panel)
      return
    }

    const scouting = w.phase === 'scouting'
    panel.innerHTML = `
      <div class="sect-name">⚔ ${escHtml(w.enemyName)} ${'★'.repeat(w.enemyTier)}</div>
      <div class="sect-desc">${scouting ? 'Scouted near your borders.' : 'Preparing to strike!'}</div>
      <div class="war-timer">${scouting ? 'Strikes in' : 'Preparation ends in'} <span id="_war_timer"></span></div>
      <div class="sect-desc">${w.allyId ? `Allied with ${SECTS.find(x => x.id === w.allyId)?.name || w.allyId}` : ''}${w.reinforced ? ' · Reinforced' : ''}</div>
      <div class="sect-btns">
        ${!scouting ? `<button class="sect-btn${!w.reinforced && s.spiritStones >= _warReinforceCost(s) ? ' available' : ''}" id="_war_reinforce" ${w.reinforced || s.spiritStones < _warReinforceCost(s) ? 'disabled' : ''}>${w.reinforced ? 'Reinforced ✓' : `Reinforce (${_warReinforceCost(s)})`}</button>` : ''}
      </div>`
    el.appendChild(panel)

    if (!w.allyId) {
      const at = document.createElement('div')
      at.className = 'section-title'
      at.textContent = 'Request Alliance'
      el.appendChild(at)
      const allyCost = _warAllyCost(s)
      for (const def of SECTS) {
        if (def.minStage > s.stageIndex + 3) continue
        const can = s.spiritStones >= allyCost
        const row = document.createElement('div')
        row.className = 'loc-row'
        row.innerHTML = `
          <div class="loc-info">
            <div class="loc-name">${escHtml(def.name)} <span style="color:var(--dim);font-size:9px">${escHtml(def.nameCN)}</span></div>
            <div class="loc-meta">${allyCost} Spirit Stones</div>
          </div>
          <button class="loc-btn${can ? ' available' : ''}" data-warally="${def.id}" ${can ? '' : 'disabled'}>Ally</button>`
        el.appendChild(row)
      }
      el.querySelectorAll('[data-warally]').forEach(btn => btn.addEventListener('click', () => {
        const r = gameState.requestWarAlly(btn.dataset.warally)
        if (!r.ok) flashMessage(r.reason === 'stones' ? 'Not enough Spirit Stones' : 'Cannot request alliance', 'negative')
        else flashMessage(`${r.ally.name} will aid you in this war`, 'positive')
      }))
    }

    document.getElementById('_war_reinforce')?.addEventListener('click', () => {
      const r = gameState.reinforceForWar()
      if (!r.ok) flashMessage(r.reason === 'stones' ? 'Not enough Spirit Stones' : 'Cannot reinforce', 'negative')
      else flashMessage(`Defenses reinforced (-${r.cost} stones)`, 'positive')
    })
  }

  function _warReinforceCost(s) {
    return Math.round(Math.max(20, (s.derived?.sectFame || 0) * WAR_REINFORCE_COST_PER_FAME))
  }
  function _warAllyCost(s) {
    return Math.round(WAR_ALLY_COST_BASE + (s.derived?.sectFame || 0) * WAR_ALLY_COST_PER_FAME)
  }

  function renderOwnSect(s) {
    const el = document.getElementById('tab-sect')
    const o  = s.ownSect
    const d  = s.derived
    const inc = d.ownSectIncomeMult || 1
    let stonesS = 0, herbsS = 0
    for (const dc of o.disciples) {
      const lm = 1 + 0.1 * (dc.level - 1)
      stonesS += DISCIPLE_STONE_RATE * dc.talent * lm
      herbsS  += DISCIPLE_HERB_RATE  * dc.talent * lm
    }
    const hallNext = SECT_HALL_LEVELS[o.hallLevel - 1]?.upgradeStones
    const head = document.createElement('div')
    head.className = 'sect-header'
    head.innerHTML = `
      <div class="sect-name">${escHtml(o.name)} <span class="sect-cn">宗主 Sect Leader</span></div>
      <div class="sect-spec">Fame ${fmt(d.sectFame)} · Hall Lv.${o.hallLevel} · ${o.disciples.length}/${d.discipleCap} disciples</div>
      <div class="sect-contrib">Income: ${(stonesS * inc * 60).toFixed(1)} stones/min · ${(herbsS * inc * 60).toFixed(1)} herbs/min<br>Disciple Qi bonus: +${(d.discipleQiFrac * 100).toFixed(1)}% Qi/s${d.warDefense ? `<br>War defense: +${Math.round(d.warDefense * 100)}%` : ''}</div>
      <div class="sect-btns">
        <button class="sect-btn${hallNext != null && s.spiritStones >= hallNext ? ' available' : ''}" id="_hall_up" ${hallNext != null && s.spiritStones >= hallNext ? '' : 'disabled'}>${hallNext != null ? `Upgrade Hall (${hallNext})` : 'Hall Max'}</button>
        <button class="sect-btn sect-leave" id="_own_disband">${_ownDisbandArmed ? 'Confirm Disband?' : 'Disband'}</button>
      </div>`
    el.innerHTML = ''
    el.appendChild(head)

    renderSectWarPanel(s, el)
    renderWarOrdersPanel(s, el, 'own')

    // Buildings
    const bt = document.createElement('div')
    bt.className = 'section-title'
    bt.textContent = 'Buildings'
    el.appendChild(bt)
    for (const b of SECT_BUILDINGS) {
      const built = !!o.buildings[b.id]
      const costTxt = [`${b.stones} stones`, ...Object.entries(b.items).map(([id, q]) => `${q} ${ITEMS[id]?.name || id}`)].join(', ')
      const afford = s.spiritStones >= b.stones && Object.entries(b.items).every(([id, q]) => (s.inventory[id] || 0) >= q)
      const row = document.createElement('div')
      row.className = 'loc-row' + (built ? ' sect-built' : '')
      row.innerHTML = `
        <div class="loc-info">
          <div class="loc-name">${escHtml(b.name)} <span style="color:var(--dim);font-size:9px">${escHtml(b.nameCN)}</span></div>
          <div class="loc-meta">${escHtml(b.desc)}${built ? '' : ` · ${escHtml(costTxt)}`}</div>
        </div>
        <button class="loc-btn${!built && afford ? ' available' : ''}" data-build="${b.id}" ${built || !afford ? 'disabled' : ''}>${built ? 'Built' : 'Build'}</button>`
      el.appendChild(row)
    }

    // Disciples
    const dt = document.createElement('div')
    dt.className = 'section-title'
    dt.textContent = `Disciples (${o.disciples.length}/${d.discipleCap})`
    el.appendChild(dt)
    if (!o.disciples.length) {
      const empty = document.createElement('div')
      empty.className = 'sect-desc'
      empty.textContent = 'No disciples yet — recruit below.'
      el.appendChild(empty)
    }
    for (const dc of o.disciples) {
      const row = document.createElement('div')
      row.className = 'beast-row'
      row.innerHTML = `
        <div class="beast-row-header">
          <div>
            <span class="beast-name">${escHtml(dc.name)}</span>
            <span class="sect-stars">${'★'.repeat(dc.talent)}${'☆'.repeat(5 - dc.talent)}</span>
            <span class="beast-level">Lv.${dc.level}${dc.level >= DISCIPLE_MAX_LEVEL ? ' MAX' : ''}</span>
          </div>
          <button class="beast-dismiss-btn" data-dismissdisc="${escHtml(dc.id)}">Dismiss</button>
        </div>
        <div class="beast-xp-bar-wrap"><div class="beast-xp-bar" data-xpw="${dc.level >= DISCIPLE_MAX_LEVEL ? 100 : Math.min(100, dc.xp / (DISCIPLE_XP_PER_LEVEL * dc.level) * 100)}"></div></div>`
      el.appendChild(row)
    }

    // Recruitment
    const rt = document.createElement('div')
    rt.className = 'section-title'
    rt.textContent = 'Recruit'
    el.appendChild(rt)
    const full = o.disciples.length >= d.discipleCap
    for (const c of o.recruitPool) {
      const cost = DISCIPLE_RECRUIT_COST * c.talent * c.talent
      const can  = !full && s.spiritStones >= cost
      const row = document.createElement('div')
      row.className = 'loc-row'
      row.innerHTML = `
        <div class="loc-info">
          <div class="loc-name">${escHtml(c.name)} <span class="sect-stars">${'★'.repeat(c.talent)}${'☆'.repeat(5 - c.talent)}</span></div>
          <div class="loc-meta">${cost} Spirit Stones</div>
        </div>
        <button class="loc-btn${can ? ' available' : ''}" data-recruit="${escHtml(c.id)}" ${can ? '' : 'disabled'}>${full ? 'Full' : 'Recruit'}</button>`
      el.appendChild(row)
    }
    const rr = document.createElement('div')
    rr.className = 'sect-btns'
    rr.style.margin = '4px 0 8px'
    rr.innerHTML = `
      <button class="sect-btn" id="_recruit_reroll" ${s.spiritStones >= RECRUIT_REROLL_COST ? '' : 'disabled'}>Reroll (${RECRUIT_REROLL_COST})</button>
      <span class="sect-desc" id="_pool_timer" style="align-self:center"></span>`
    el.appendChild(rr)

    // Apply bar widths via JS (CSP blocks inline style attributes)
    el.querySelectorAll('[data-xpw]').forEach(b => { b.style.width = b.dataset.xpw + '%' })
    updateSectTimersInPlace(s)

    // Wire
    const msgs = { stones:'Not enough Spirit Stones', items:'Missing materials', built:'Already built', full:'Sect is full — upgrade the Hall', not_found:'Candidate gone' }
    el.querySelectorAll('[data-build]').forEach(btn => btn.addEventListener('click', () => {
      const r = gameState.buildSectBuilding(btn.dataset.build)
      if (!r.ok) flashMessage(msgs[r.reason] || 'Cannot build', 'negative')
      else flashMessage(`Built ${r.building.name}`, 'positive')
    }))
    el.querySelectorAll('[data-recruit]').forEach(btn => btn.addEventListener('click', () => {
      const r = gameState.recruitDisciple(btn.dataset.recruit)
      if (!r.ok) flashMessage(msgs[r.reason] || 'Cannot recruit', 'negative')
      else flashMessage(`${r.disciple.name} joined your sect`, 'positive')
    }))
    el.querySelectorAll('[data-dismissdisc]').forEach(btn => btn.addEventListener('click', () => {
      gameState.dismissDisciple(btn.dataset.dismissdisc)
    }))
    document.getElementById('_recruit_reroll')?.addEventListener('click', () => {
      const r = gameState.rerollRecruitPool()
      if (!r.ok) flashMessage(msgs.stones, 'negative')
    })
    document.getElementById('_hall_up')?.addEventListener('click', () => {
      const r = gameState.upgradeSectHall()
      if (!r.ok) flashMessage(r.reason === 'max_level' ? 'Hall is at max level' : msgs.stones, 'negative')
      else flashMessage(`Sect Hall upgraded to Lv.${r.level}`, 'positive')
    })
    document.getElementById('_own_disband')?.addEventListener('click', () => {
      if (!_ownDisbandArmed) { _ownDisbandArmed = true; renderOwnSect(gameState.get()); return }
      _ownDisbandArmed = false
      gameState.disbandOwnSect()
    })
  }

  function updateSectTimersInPlace(s) {
    const pt = document.getElementById('_pool_timer')
    if (pt && s.ownSect?.founded) {
      pt.textContent = `New candidates in ${fmtTime(Math.max(0, Math.ceil((s.ownSect.poolRefreshAt - Date.now()) / 1000)))}`
    }
    const wt = document.getElementById('_war_timer')
    if (wt && s.sectWar) {
      const w = s.sectWar
      // Member wars show time to battle for the whole window; own-sect wars count down each phase
      const target = w.phase === 'scouting' ? w.scoutEndsAt + (w.side === 'member' ? MEMBER_WAR_PREP_SECONDS * 1000 : 0)
                   : w.phase === 'preparing' ? w.prepEndsAt : w.nextWarAt
      wt.textContent = fmtTime(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
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
        <div style="color:var(--dim)">Idle — choose a location below</div>
      `
    }
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

    for (const loc of LOCATIONS) {
      if (loc.minStage > s.stageIndex && !s.derived.hiddenLocations) {
        // Show locked locations for the next 2 unlockable stages only
        if (loc.minStage > s.stageIndex + 2) continue
      }

      const unlocked = s.stageIndex >= loc.minStage
      const row = document.createElement('div')
      row.className = 'loc-row' + (unlocked ? '' : ' locked')

      const durText = loc.duration >= 60
        ? `${Math.floor(loc.duration/60)}m`
        : `${loc.duration}s`

      const showAutoToggle = unlocked && s.playMode === 'idle' && s.automation.autoExplore && gameState.automationUnlocked('autoExplore')
      const paused = !!s.automation.autoExplorePaused[loc.id]
      row.innerHTML = `
        <div class="loc-info">
          <div class="loc-name">${escHtml(loc.name)} <span style="color:var(--dim);font-size:9px">${escHtml(loc.nameCN)}</span></div>
          <div class="loc-meta">${durText} · Tier ${loc.enemyTier}${unlocked ? '' : ` · 封 ${stageShortName(loc.minStage)}`}</div>
        </div>
        ${showAutoToggle ? `<button class="pack-chip${paused ? '' : ' active'}" data-autoloc="${loc.id}" title="Auto-Explore relaunch for this location">${paused ? '⏸ Paused' : '▶ Auto'}</button>` : ''}
        <button class="loc-btn${unlocked && !s.expedition.active ? ' available' : ''}"
                ${(!unlocked || s.expedition.active) ? 'disabled' : ''}
                data-locid="${loc.id}">
          ${s.expedition.active && s.expedition.locationId === loc.id ? 'Active' : unlocked ? 'Send' : `Stg ${loc.minStage}`}
        </button>
      `
      el.appendChild(row)
    }

    el.querySelectorAll('[data-autoloc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const locId = btn.dataset.autoloc
        gameState.setAutoExplorePaused(locId, !s.automation.autoExplorePaused[locId])
      })
    })

    // Wire Send buttons
    el.querySelectorAll('.loc-btn[data-locid]').forEach(btn => {
      btn.addEventListener('click', () => quickActions.sendExpedition(btn.dataset.locid))
    })

    // ── Encounters on the Road (family.md) — potential lovers, never expire ────
    const people = s.family?.encounters || []
    if (people.length > 0) {
      const pTitle = document.createElement('div')
      pTitle.className = 'section-title'
      pTitle.textContent = 'Encounters on the Road'
      el.appendChild(pTitle)
      people.forEach((enc, i) => {
        const p = enc.person
        const pers = PERSONALITIES.find(x => x.id === p.personality)
        const row = document.createElement('div')
        row.className = 'suitor-card'
        row.style.marginBottom = '6px'
        row.innerHTML = `
          <div class="suitor-name">${escHtml(Persons.fullName(p))}</div>
          <div>${escHtml(personStageLabel(p.stageIndex))} · ${escHtml(p.root?.name || '')}${pers ? ` · ${escHtml(pers.name)}` : ''}</div>
          <div style="margin:3px 0">At ${escHtml(enc.place)}, they ${escHtml(enc.text || '')}.</div>
          <div style="display:flex;gap:6px">
            <button class="sect-btn" style="flex:1;min-height:32px" data-seduce="${i}">Seduce</button>
            <button class="sect-btn" style="flex:1;min-height:32px" data-leave="${i}">Leave</button>
          </div>${s.family.spouse && !s.family.tolerant ? `<div style="font-size:9px;margin-top:3px;color:var(--gold)">${escHtml(s.family.spouse.given)} may find out.</div>` : ''}`
        el.appendChild(row)
      })
      el.querySelectorAll('[data-seduce]').forEach(btn => btn.addEventListener('click', () => {
        const res = gameState.seduceEncounter(+btn.dataset.seduce)
        if (res.ok) flashMessage(res.success ? 'An affair begins.' : 'Rebuffed.', res.success ? 'special' : 'negative')
      }))
      el.querySelectorAll('[data-leave]').forEach(btn => btn.addEventListener('click', () => gameState.dismissEncounter(+btn.dataset.leave)))
    }

  }

  // ── 歷 Roam → Beasts (1.8b-1: split out of Explore) ─────────────────────────
  function renderBeasts(s) {
    const el = document.getElementById('tab-beasts')
    el.innerHTML = ''
    const cap = s.derived.maxBeasts || 3
    const talismans = s.inventory['beast_taming_talisman'] || 0
    const head = document.createElement('div')
    head.className = 'view-lede'
    head.innerHTML = `Companions ${(s.beasts || []).length} / ${cap} · Taming Talismans <b>${talismans}</b>${talismans ? '' : ' <span class="lede-hint">(craft them, or find them on expeditions)</span>'}`
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
        const canTame   = (s.beasts || []).length < (s.derived.maxBeasts || 3)
          && s.stageIndex >= (beastType?.minStage || 0)
          && (s.inventory['beast_taming_talisman'] || 0) > 0

        const row = document.createElement('div')
        row.className = 'beast-encounter-row'
        const traitNames = enc.traits.map(id => BEAST_TRAITS[id]?.name || id).join(', ')
        const spriteHtml = renderBeastSpriteHTML(enc.typeId)
        row.innerHTML = `
          <div class="beast-sprite-small">${spriteHtml}</div>
          <div class="beast-encounter-info">
            <div class="beast-enc-name">${escHtml(beastType?.name || enc.typeId)} <span style="color:var(--dim);font-size:9px">${escHtml(beastType?.nameCN || '')}</span></div>
            <div class="beast-enc-traits">${escHtml(traitNames)}</div>
            <button class="beast-tame-btn${canTame ? '' : ''}" data-encid="${escHtml(enc.id)}" ${canTame ? '' : 'disabled'}>
              ${canTame ? 'Tame (1× Talisman)' : (s.beasts?.length >= (s.derived.maxBeasts || 3) ? `Full (${s.derived.maxBeasts || 3}/${s.derived.maxBeasts || 3})` : (s.inventory['beast_taming_talisman'] || 0) < 1 ? 'No Talisman' : 'Stage too low')}
            </button>
          </div>
        `
        el.appendChild(row)
      }

      el.querySelectorAll('.beast-tame-btn[data-encid]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = gameState.tameEncounteredBeast(btn.dataset.encid)
          if (res.ok) {
            flashMessage(`Tamed: ${res.beast.name}!`, 'special')
          } else {
            const msgs = { not_found:'Already gone', stage:'Realm too low', max_beasts:'Beast capacity full', no_talisman:'Need a Beast Taming Talisman' }
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

        const row = document.createElement('div')
        row.className = 'beast-row'
        row.dataset.beastid = beast.id

        let statusHtml = ''
        if (isOnExp) {
          const loc = LOCATIONS.find(l => l.id === beast.expedition.locationId)
          statusHtml = beast.expedition.war
            ? `<span style="color:var(--red);font-size:10px">At war with the sect · ${fmtTime(Math.ceil(msLeft/1000))}</span>`
            : `<span style="color:var(--jade);font-size:10px">On expedition: ${escHtml(loc?.name || '?')} · ${fmtTime(Math.ceil(msLeft/1000))}</span>`
        }

        row.innerHTML = `
          <div class="beast-row-header">
            <div>
              <span class="beast-name">${escHtml(beast.name)}</span>
              <span class="beast-level">Lv.${beast.level}</span>
              <span style="font-size:9px;color:var(--dim)">${escHtml(beastType?.nameCN || '')}</span>
            </div>
            <button class="beast-dismiss-btn" data-dismissid="${escHtml(beast.id)}">Release</button>
          </div>
          <div class="beast-xp-bar-wrap"><div class="beast-xp-bar" style="width:${xpPct}%"></div></div>
          <div class="beast-traits" style="margin-top:3px">${traitTags}</div>
          ${statusHtml ? `<div style="margin:3px 0">${statusHtml}</div>` : ''}
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
      empty.textContent = 'No beasts yet. Wild ones are sighted on expeditions; tame them with a Beast Taming Talisman.'
      el.appendChild(empty)
    }
  }

  // ── Craft tab ─────────────────────────────────────────────────────────────

  let _craftSubTab = 'pills'

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
        <div class="equip-slot-label">${slot === 'weapon' ? '⚔ Weapon' : '💎 Artifact'}</div>
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
    for (const [key, label] of [['pills','Pills'],['elixirs','Elixirs'],['weapons','Weapons'],['artifacts','Artifacts'],['talismans','Talismans']]) {
      const btn = document.createElement('button')
      btn.className = 'craft-subtab' + (key === _craftSubTab ? ' active' : '')
      btn.textContent = label
      btn.addEventListener('click', () => {
        _craftSubTab = key
        renderCraft(gameState.get())
      })
      subTabBar.appendChild(btn)
    }
    el.appendChild(subTabBar)

    // Recipe list for active sub-tab
    const recipes = RECIPES.filter(r => r.category === _craftSubTab)
    for (const recipe of recipes) {
      const item = ITEMS[recipe.productId]
      if (!item) continue

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
        const inQueue = s.activePill === recipe.productId
        if (inQueue) {
          btnsHTML += `<button class="pill-queue-btn queued" data-clearqueue="1">★ Queued</button>`
        } else if (inInv) {
          btnsHTML += `<button class="pill-queue-btn can-queue" data-queue="${recipe.productId}">Queue BT</button>`
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
          <span class="recipe-name">${escHtml(item.name)}<span class="recipe-namecn">${escHtml(item.nameCN)}</span></span>
          ${inInv ? `<span style="font-size:10px;color:var(--jade)">×${s.inventory[recipe.productId]} owned</span>` : ''}
        </div>
        <div class="recipe-desc">${escHtml(item.desc)}</div>
        <div class="recipe-ings">${ingsHTML}</div>
        <div class="recipe-btns">${btnsHTML}</div>
      `
      el.appendChild(row)
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
    ['equip', 'Equip'], ['rare', 'Rare'], ['key', 'Keys'],
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
        <span>💰 Spirit Stones</span>
        <span class="pack-currency-val" id="pack-stones-val">${fmt(s.spiritStones)}</span>
        <span id="pack-delta-host">${packDeltaHTML()}</span>
      </div>
      <div class="pack-currency-row">
        <span class="pack-currency-label">💎 Void Crystals (rare)</span>
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
      main.innerHTML = `
        <span class="pack-item-name">${escHtml(item.name)}${equipped ? '<span class="pack-item-badge">◆</span>' : ''}</span>
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
          btnsHTML += (s.activePill === id)
            ? `<button class="pack-btn-use" data-clearpill>★ Queued (clear)</button>`
            : `<button class="pack-btn-use" data-usepill="${id}">Queue for Breakthrough</button>`
        }
        if (isElixir && invQty > 0) {
          btnsHTML += `<button class="pack-btn-use" data-useelixir="${id}">Use</button>`
        }
        if (isEquip && !equipped && invQty > 0) {
          btnsHTML += `<button class="pack-btn-equip" data-equip="${id}">Equip</button>`
        }
        if (invQty > 0) {
          btnsHTML += `<button class="pack-btn-discard" data-discard="${id}">Discard ×1</button>`
        } else if (equipped) {
          btnsHTML += `<span class="pack-item-hint">Unequip in the Craft tab to discard.</span>`
        }

        const detail = document.createElement('div')
        detail.className = 'pack-item-detail'
        detail.innerHTML = `
          <div class="pack-item-desc">${escHtml(item.desc)}</div>
          <div class="pack-item-btns">${btnsHTML}</div>
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
    document.getElementById('asc-bloodline').textContent = `${Math.round(s.bloodlineQuality || 0)} / 100`
    document.getElementById('asc-chance').textContent = `${Math.round(chance * 100)}%`
    document.getElementById('ascension-overlay').classList.remove('hidden')
    banterSys.say('ascension_trial')
  }

  document.getElementById('ascend-wait').addEventListener('click', () => {
    document.getElementById('ascension-overlay').classList.add('hidden')
  })

  document.getElementById('ascend-now').addEventListener('click', () => {
    document.getElementById('ascension-overlay').classList.add('hidden')
    const res = gameState.attemptAscension()
    if (res.success) {
      renderer.setState('transcending')
      flashMessage('You have Ascended! Welcome to the Immortal Realms.', 'special')
    }
    // Phase 31 (M2 task 2.7d): a successful Ascension now ALSO ends the life (fixes the post-Ascension dead
    // zone) — the death/interlude overlay opens right behind this flash via the lastReincarnation watcher,
    // same as every other cause of death (see bootGame).
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
    const clanBtn = info.canJoinClan
      ? `<button data-rebirth="clan">Be born into the ${escHtml(info.clanName || 'nameless')} clan<span class="family-sub">Eldest, a younger child or a branch child: the wheel decides. You will not remember, and no one will know.</span></button>`
      : ''
    choices.innerHTML = clanBtn +
      '<button data-rebirth="orphan">Be born an orphan<span class="family-sub">No clan, no name, no expectations. The clan lives on without you.</span></button>'
    choices.querySelectorAll('[data-rebirth]').forEach(btn => btn.addEventListener('click', () => {
      if (gameState.chooseRebirth(btn.dataset.rebirth).ok) renderInterlude()
    }))
  }

  document.getElementById('death-ok').addEventListener('click', () => {
    document.getElementById('death-overlay').classList.add('hidden')
    const s = gameState.get()
    if (s?.birth) flashMessage(`${s.name} awakens. A new life begins.`, 'special')
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
    if (f.spouse && f.duel)  return `duel:${f.duel.year}`
    if (f.headChallenge) return `hc:${f.headChallenge.challengerId}:${f.headChallenge.year}`   // 2.6e
    if (f.stepDownOffer) return `sd:${f.stepDownOffer.headId}:${f.stepDownOffer.year}`          // 2.6e
    if (f.spouse && f.event) return `ev:${f.event.id}:${f.event.year}`
    if (f.childEvent) return `child:${f.childEvent.id}:${f.childEvent.childId}:${f.childEvent.year}`   // 2.6b
    if (s.upbringing?.event) return `up:${s.upbringing.event.id}:${s.upbringing.event.year}`   // 2.6d
    return null
  }

  function openFamilyOverlay(s) {
    const f = s.family
    if (!familyPendingKey(s)) return
    const box = document.getElementById('family-box')
    const choicesEl = document.getElementById('family-choices')
    if (f.spouse && f.duel) {
      const pct = Math.round(gameState.duelChance() * 100)
      box.classList.add('crisis')
      document.getElementById('family-title').textContent = 'A Duel to the Death 生死斗'
      document.getElementById('family-desc').textContent = `${Persons.fullName(f.spouse)} waits in the courtyard with a drawn blade. One of you will not walk away.`
      choicesEl.innerHTML = `<button data-duel="fight">Fight<span class="family-sub">${pct}% to survive — if you lose, this life ends</span></button>
        <button data-duel="flee">Flee<span class="family-sub">${escHtml(f.spouse.given)} leaves you for good</span></button>`
      choicesEl.querySelectorAll('[data-duel]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        const res = gameState.resolveDuel(btn.dataset.duel)
        if (res.outcome === 'won') flashMessage('You survived the duel.', 'negative')
      }))
    } else if (f.headChallenge) {   // 2.6e: an NPC calls you out for the head seat — you decide lethal or not
      const challenger = gameState.person(f.headChallenge.challengerId)
      box.classList.add('crisis')
      document.getElementById('family-title').textContent = 'Challenged for the Head Seat'
      document.getElementById('family-desc').textContent = challenger
        ? `${Persons.fullName(challenger)} strides into the hall and calls you out. Will this be to the death, or will the loser simply yield?`
        : 'A challenger waits. The matter must be settled.'
      choicesEl.innerHTML = `<button data-hc="1">To the Death<span class="family-sub">the loser does not walk away</span></button>
        <button data-hc="0">Non-Lethal<span class="family-sub">the loser yields and lives</span></button>`
      choicesEl.querySelectorAll('[data-hc]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        const res = gameState.resolveHeadChallenge(btn.dataset.hc === '1')
        if (res.outcome === 'won_lethal' || res.outcome === 'won_nonlethal') flashMessage('You held the head seat.', 'positive')
        else if (res.outcome === 'lost_nonlethal') flashMessage('You were deposed.', 'negative')
      }))
    } else if (f.stepDownOffer) {   // 2.6e: the sitting head is stepping down — join the tournament, or watch
      const off = f.stepDownOffer, head = gameState.person(off.headId)
      box.classList.remove('crisis')
      document.getElementById('family-title').textContent = 'The Head Seat Stands Open'
      document.getElementById('family-desc').textContent = `${head ? Persons.fullName(head) : 'The head'} steps back and lets the clan settle it. ${off.entrantIds.length} may contest the seat. Will you enter?`
      choicesEl.innerHTML = `<button data-sd="1">Enter the Tournament<span class="family-sub">win it all, or fall trying</span></button>
        <button data-sd="0">Stay Out<span class="family-sub">watch the clan settle it without you</span></button>`
      choicesEl.querySelectorAll('[data-sd]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('family-overlay').classList.add('hidden')
        const res = gameState.answerStepDown(btn.dataset.sd === '1')
        if (res.outcome === 'won') flashMessage('You took the head seat.', 'positive')
        else if (res.outcome === 'died') flashMessage('You fell in the tournament.', 'negative')
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
    return `${personStageLabel(c.stageIndex)} · ${escHtml(pers?.name || '')} · ${bl.word}${c.trauma ? ' · scarred' : ''}`
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
  let _tPick = null, _tPairs = [], _tLog = []
  function openTournamentOverlay() {
    _tPick = null; _tPairs = []
    renderTournament()
    document.getElementById('tournament-overlay').classList.remove('hidden')
  }
  function renderTournament() {
    const s = gameState.get(), f = s.family, info = gameState.tournamentInfo()
    const box = document.getElementById('tournament-box')
    const kid = id => f.children.find(c => c.id === id)
    document.getElementById('tournament-log').innerHTML = _tLog.map(r => `<div class="${r.died ? 'died' : ''}">${escHtml(r.text)}</div>`).join('')
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
      ? `Round ${info.round} — TO THE DEATH. ${info.n} remain; pair ${info.fights} fight${info.fights === 1 ? '' : 's'} (the field never drops below ${TOURNAMENT_TOP}). Unpaired fighters rest.`
      : `Round ${info.round} — the Top ${info.n}, non-lethal. Pair ${info.fights} fight${info.fights === 1 ? '' : 's'}.`
    const pairedIds = new Set(_tPairs.flat())
    document.getElementById('tournament-pool').innerHTML = info.pool.map(id => { const c = kid(id)
      return `<button data-fighter="${escHtml(id)}" class="${_tPick === id ? 'picked' : ''}${pairedIds.has(id) ? ' paired' : ''}">${escHtml(Persons.fullName(c))}<span class="fam-sub">${childSummary(s, c)}</span></button>` }).join('')
    document.getElementById('tournament-pairs').innerHTML = _tPairs.map(([a, b]) => `⚔ ${escHtml(kid(a).given)} vs ${escHtml(kid(b).given)}`).join('<br>')
    document.getElementById('tournament-pool').querySelectorAll('[data-fighter]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.fighter
      const existing = _tPairs.findIndex(p => p.includes(id))
      if (existing >= 0) _tPairs.splice(existing, 1)                       // click a paired fighter → unpair
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
    const res = gameState.fightTournamentRound(_tPairs)
    if (!res.ok) return flashMessage('Pair every fight first', 'negative')
    _tLog.push(...res.results); _tPairs = []; _tPick = null
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
  document.getElementById('btn-more').addEventListener('click', e => { e.stopPropagation(); tbMenu.classList.toggle('hidden') })
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
        <span class="mode-card-head"><span class="mode-glyph">${glyph}</span><span class="mode-name">${name} <span class="mode-cn">${cn}</span></span>${on ? '<span class="mode-now">current</span>' : ''}</span>
        <span class="mode-sum">${sum} Tap to switch.</span>
        ${lines.map(l => `<span class="mode-line">${l}</span>`).join('')}${extra}
      </button>`
    // What Idle would actually run right now (so the Idle card says something concrete)
    const AUTO_NAMES = { autoExplore: 'Auto-Explore', autoSectMissions: 'Auto-Missions', autoCraft: 'Auto-Craft', autoBreakthrough: 'Auto-Breakthrough' }
    const runs = Object.keys(AUTO_NAMES).filter(k => gameState.automationUnlocked(k) && s.automation[k]).map(k => AUTO_NAMES[k])
    const firstLock = Object.keys(AUTO_NAMES).find(k => !gameState.automationUnlocked(k))
    const runsLine = runs.length ? `<span class="mode-runs">Runs: ${runs.join(', ')}</span>`
      : `<span class="mode-runs none">Nothing switched on yet${firstLock ? `; the first unlocks at ${AUTOMATION_UNLOCKS[firstLock].label}` : ''}.</span>`
    body.innerHTML = `
      <div class="mode-intro">How you walk the path right now. Switch whenever you like; nothing is lost.</div>
      <div class="mode-cards">
        ${card('idle', '閒', 'Idle', '閒修', 'Automation works while you are away.', ['For when you step away.', 'Unlocked automation runs for you.', 'Nothing is ever punished for your absence.'], !active, runsLine)}
        ${card('active', '動', 'Active', '勤修', 'Faster journeys and focus bonuses while you play.', [
          `Expeditions ${pct(1 - ACTIVE_EXPEDITION_TIME_MULT)} faster, missions ${pct(1 - ACTIVE_SECT_MISSION_TIME_MULT)} faster.`,
          `Breakthrough focus: press within ${ACTIVE_BT_FOCUS_WINDOW_SECONDS}s of it lighting up for +${pct(ACTIVE_BT_FOCUS_BONUS)}.`,
          `A failed breakthrough keeps ${pct(ACTIVE_BT_QI_LOSS_BONUS)} more Qi.`,
          `Push Harder near an expedition's end (石 ${ACTIVE_PUSH_HARDER_COST}) for an extra roll.`,
          `Master's Touch: ${pct(ACTIVE_CRAFT_TOUCH_CHANCE)} double crafts while you watch the furnace.`,
          'Automation rests while you play.'], active)}
      </div>
      <div class="section-title">Automation 自動</div>
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
    btn.innerHTML = active ? '<span class="mb-glyph">動</span><span class="mb-name">Active</span>' : '<span class="mb-glyph">閒</span><span class="mb-name">Idle</span>'
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
    if (!item.open || layoutUI.mode !== 'banner') nav.go(item.view)
  })
  attentionUI.onBannerMore = () => layoutUI.peek(false)
  // 1.8b-2: tap any [data-bd] number (HUD, Character tiles) for its "why" card (renderer/game/breakdowns.js)
  const breakdownUI = new BreakdownUI(gameState, { fmt, fmtTime, esc: escHtml })

  document.getElementById('btn-pin').addEventListener('click', async () => {
    const btn = document.getElementById('btn-pin')
    const pinned = await window.electron.toggleAlwaysOnTop()
    btn.classList.toggle('pinned', pinned)
    btn.title = pinned ? 'Pinned on top (click to unpin)' : 'Not pinned (click to pin on top)'
  })

  document.getElementById('btn-quit').addEventListener('click', () => {
    gameState.forceSave()
    // ⚙ 'closeButton' (default 'quit' since 1.8b-1, user 2026-09-26): a real quit, or hide to the tray and
    // keep cultivating. main.js applies the same choice to native closes (Alt+F4, taskbar) via setCloseToTray.
    // See docs/systems/notifications.md.
    if (gameState.getSettings().closeButton === 'tray') window.electron.hideToTray()
    else window.electron.quit()
  })

  document.getElementById('cultivator-name').addEventListener('click', () => {
    document.getElementById('rename-input').value = gameState.get()?.name || ''
    document.getElementById('rename-overlay').classList.remove('hidden')
    document.getElementById('rename-input').focus()
  })

  document.getElementById('rename-ok').addEventListener('click', commitRename)
  document.getElementById('rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') document.getElementById('rename-overlay').classList.add('hidden')
  })

  function commitRename() {
    gameState.setName(document.getElementById('rename-input').value)
    document.getElementById('rename-overlay').classList.add('hidden')
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  let flashTimer = null
  function flashMessage(msg, type = 'positive') {
    gameState.addEvent({ text: msg, type })
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
    if (n >= 1e12) return (n/1e12).toFixed(2)+'T'
    if (n >= 1e9)  return (n/1e9 ).toFixed(2)+'B'
    if (n >= 1e6)  return (n/1e6 ).toFixed(2)+'M'
    if (n >= 1e3)  return (n/1e3 ).toFixed(1)+'K'
    return Math.floor(n).toString()
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

  function renderBeastSpriteHTML(spriteState) {
    const sp = typeof BEAST_SPRITES !== 'undefined' && BEAST_SPRITES[spriteState]
    if (!sp?.frames?.[0]) return ''
    const frame = sp.frames[0]
    const lines = frame.map(row => {
      const chars = [...row].map(ch => {
        const color = sp.colors?.[ch] || sp.defaultColor || '#9070C8'
        return `<span style="color:${color}">${escHtml(ch)}</span>`
      }).join('')
      return `<div>${chars}</div>`
    }).join('')
    return `<div style="font-family:var(--font);font-size:9px;line-height:1.2">${lines}</div>`
  }

})()
