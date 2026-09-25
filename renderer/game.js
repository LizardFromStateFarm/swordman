// Main game controller — character select → game loop → UI updates.

;(async function () {

  // ── Character Select ───────────────────────────────────────────────────────

  let slots = await window.electron.loadAllSlots()

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
    container.querySelectorAll('.cs-btn-del').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(parseInt(btn.dataset.slot)))
    })
  }

  let _pendingDelete = -1
  function confirmDelete(slotIndex) {
    _pendingDelete = slotIndex
    document.getElementById('confirm-overlay').classList.remove('hidden')
  }

  document.getElementById('confirm-yes').addEventListener('click', async () => {
    if (_pendingDelete >= 0) {
      await window.electron.deleteSlot(_pendingDelete)
      slots[_pendingDelete] = null
      _pendingDelete = -1
    }
    document.getElementById('confirm-overlay').classList.add('hidden')
    renderCharSelect()
  })

  document.getElementById('confirm-no').addEventListener('click', () => {
    _pendingDelete = -1
    document.getElementById('confirm-overlay').classList.add('hidden')
  })

  document.getElementById('cs-quit').addEventListener('click', () => { window.electron.quit() })

  renderCharSelect()

  // ── Start game ────────────────────────────────────────────────────────────

  async function startGame(slotIndex) {
    await gameState.initSlot(slotIndex)
    document.getElementById('charselect').classList.add('hidden')
    document.getElementById('app').classList.remove('hidden')
    bootGame()
  }

  document.getElementById('btn-back').addEventListener('click', async () => {
    gameState.forceSave()
    tickRunning = false
    slots = await window.electron.loadAllSlots()
    document.getElementById('app').classList.add('hidden')
    document.getElementById('charselect').classList.remove('hidden')
    renderCharSelect()
  })

  // ── Game bootstrap ────────────────────────────────────────────────────────

  const renderer  = new ASCIIRenderer(document.getElementById('sprite-canvas'))
  const cultSys   = new CultivationSystem(gameState)
  const expSys    = new ExpeditionSystem(gameState)
  const craftSys  = new CraftingSystem(gameState)
  const beastSys  = new BeastSystem(gameState)
  let tickRunning = false

  function bootGame() {
    tickRunning = true

    gameState.subscribe((s, fromTick) => {
      if (!s) return
      updateHUD(s, fromTick)
      updateSprite(s)
    })

    const s = gameState.get()
    if (s) { updateHUD(s); updateSprite(s) }

    let lastTick = performance.now()
    function loop(now) {
      if (!tickRunning) return
      const dt = Math.min((now - lastTick) / 1000, 2)
      lastTick = now
      gameState.tick(dt)
      cultSys.tick(dt)
      expSys.tick(dt)
      beastSys.tick(dt)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  // ── HUD updates ───────────────────────────────────────────────────────────

  function updateHUD(s, fromTick = false) {
    const d  = s.derived
    const st = d.stage

    document.getElementById('cultivator-name').textContent = s.name

    document.getElementById('stage-realm').textContent = `${st.realm} — ${st.realmCN}`
    document.getElementById('stage-realm').style.color = st.color || 'var(--gold)'
    document.getElementById('stage-layer').textContent = `${st.layer} · ${st.layerCN}`
    document.getElementById('stage-desc').textContent  = st.desc

    const cap = isFinite(d.qiCap) ? d.qiCap : 1e15
    const pct = Math.min(100, (s.qi / cap) * 100)
    document.getElementById('qi-fill').style.width    = pct + '%'
    document.getElementById('qi-numbers').textContent = `${fmt(s.qi)} / ${fmt(d.qiCap)}`
    document.getElementById('qi-rate').textContent    =
      d.meditBonus > 1
        ? `+${fmt(d.qiPerSecondBoosted)} qi/s (${d.meditBonus}×) · ${d.meditSecondsLeft}s`
        : `+${fmt(d.qiPerSecond)} qi/s`

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
    if (st.id === 'ascension') {
      btnBt.disabled = true
      btnBt.querySelector('.act-name').textContent = 'Ascended'
      btnBt.querySelector('.act-sub').textContent  = ''
    } else {
      btnBt.disabled = !d.canBreakthrough
      btnBt.classList.toggle('ready', d.canBreakthrough)
      btnBt.querySelector('.act-sub').textContent = d.canBreakthrough
        ? `${btPct}% chance${pillName ? ' (pill)' : ''}`
        : `${Math.round(pct)}% qi filled`
    }

    document.getElementById('meditate-badge').classList.toggle('hidden', !s.meditating)

    // Integrity bar: lerp color from indigo (#6060C0) at 100 to red (#C83030) at 0
    const integ    = s.derived.realmIntegrity ?? 100
    const t        = integ / 100
    const ir = Math.round(200 + t * (96  - 200))
    const ig = Math.round(48  + t * (96  - 48))
    const ib = Math.round(48  + t * (192 - 48))
    document.getElementById('integrity-fill').style.width      = Math.min(100, integ) + '%'
    document.getElementById('integrity-fill').style.background = `rgb(${ir},${ig},${ib})`
    document.getElementById('integrity-numbers').textContent   = `${Math.round(integ)} / 100`

    const activeTab = document.querySelector('.tab.active')?.dataset?.tab
    if (fromTick) {
      // On every tick: only update the live expedition timer without re-rendering
      if (activeTab === 'explore') updateExpeditionTimerInPlace(s)
    } else {
      // On explicit state changes: full tab re-render (safe, buttons will be stable until next change)
      if (activeTab === 'techniques') renderTechniques(s)
      if (activeTab === 'stats')      renderStats(s)
      if (activeTab === 'events')     renderEvents(s)
      if (activeTab === 'explore')    renderExplore(s)
      if (activeTab === 'craft')      renderCraft(s)
    }
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
        row.addEventListener('click', () => {
          const res = gameState.learnTechnique(t.id)
          if (!res.ok) {
            const msgs = { owned:'Already learned', stage:'Realm too low', stones:'Need more spirit stones' }
            flashMessage(msgs[res.reason] || 'Cannot learn', 'negative')
          }
        })
      }
      el.appendChild(row)
    }
  }

  function techRowHTML(t, isOwned, isLocked) {
    const right = isOwned
      ? '<div class="tech-owned">✓ Learned</div>'
      : isLocked
        ? `<div class="tech-cost" style="color:var(--dim)">Stage ${t.minStage}+</div>`
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
    const d     = s.derived
    const integ = d.realmIntegrity ?? 100
    const integColor = integ >= 70 ? 'var(--jade)' : integ >= 30 ? 'var(--gold)' : 'var(--red)'
    document.getElementById('tab-stats').innerHTML = `
      <div class="root-badge">⚗ ${s.root.name} · ×${s.root.mult} Qi</div>
      ${sr('Realm', d.stage.realm)} ${sr('Layer', d.stage.layer)}
      ${sr('Total Qi Gained', fmt(s.stats.totalQiGained))}
      ${sr('Qi / Second', fmt(d.qiPerSecond))}
      ${sr('Qi Cap', fmt(d.qiCap))}
      ${sr('Breakthrough Chance', Math.round(d.breakthroughChance*100)+'%')}
      ${sr('Realm Integrity', `<span style="color:${integColor}">${Math.round(integ)}</span>`)}
      ${sr('Breakthroughs', s.stats.breakthroughs)}
      ${sr('Failed BTs', s.stats.failed)}
      ${sr('Meditation Sessions', s.stats.meditationSessions)}
      ${sr('Karma', Math.round(s.karma))}
      ${sr('Spirit Stones', s.spiritStones)}
      ${sr('Techniques', s.techniques.length)}
      ${sr('Beasts', `${(s.beasts||[]).length}/3`)}
      ${sr('Time Cultivating', fmtTime(s.stats.timePlayed))}
      ${s.equipped.weapon   ? sr('Weapon',   ITEMS[s.equipped.weapon]?.name   || s.equipped.weapon)   : ''}
      ${s.equipped.artifact ? sr('Artifact', ITEMS[s.equipped.artifact]?.name || s.equipped.artifact) : ''}
    `
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
      `
    } else {
      statusDiv.innerHTML = `
        <div class="exp-status-label">Expedition</div>
        <div style="color:var(--dim)">Idle — choose a location below</div>
      `
    }
    el.appendChild(statusDiv)

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

      row.innerHTML = `
        <div class="loc-info">
          <div class="loc-name">${escHtml(loc.name)} <span style="color:var(--dim);font-size:9px">${escHtml(loc.nameCN)}</span></div>
          <div class="loc-meta">${durText} · Tier ${loc.enemyTier}${unlocked ? '' : ` · Stage ${loc.minStage}+`}</div>
        </div>
        <button class="loc-btn${unlocked && !s.expedition.active ? ' available' : ''}"
                ${(!unlocked || s.expedition.active) ? 'disabled' : ''}
                data-locid="${loc.id}">
          ${s.expedition.active && s.expedition.locationId === loc.id ? 'Active' : unlocked ? 'Send' : `Stg ${loc.minStage}`}
        </button>
      `
      el.appendChild(row)
    }

    // Wire Send buttons
    el.querySelectorAll('.loc-btn[data-locid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = gameState.startExpedition(btn.dataset.locid)
        if (!res.ok) {
          const msgs = { active:'Expedition already active', stage:'Realm too low', unknown:'Unknown location' }
          flashMessage(msgs[res.reason] || 'Cannot send expedition', 'negative')
        } else {
          flashMessage(`Expedition to ${res.loc.name} underway.`, 'positive')
        }
      })
    })

    // Inventory
    const invEntries = Object.entries(s.inventory).filter(([, qty]) => qty > 0)
    if (invEntries.length > 0) {
      const invTitle = document.createElement('div')
      invTitle.className = 'section-title'
      invTitle.textContent = 'Inventory'
      el.appendChild(invTitle)

      const groups = { resource: [], pill: [], elixir: [], weapon: [], artifact: [], talisman: [] }
      for (const [itemId, qty] of invEntries) {
        const item = ITEMS[itemId]
        if (item && groups[item.type]) groups[item.type].push([itemId, qty, item])
      }

      for (const [groupKey, entries] of Object.entries(groups)) {
        if (!entries.length) continue
        const grid = document.createElement('div')
        grid.className = 'inv-grid'
        for (const [itemId, qty, item] of entries) {
          const cell = document.createElement('div')
          cell.className = 'inv-item'
          cell.title = item.desc
          cell.innerHTML = `<span class="inv-item-name">${escHtml(item.name)}</span><span class="inv-item-qty">×${qty}</span>`
          grid.appendChild(cell)
        }
        el.appendChild(grid)
      }
    }

    // ── Beast Encounters ──────────────────────────────────────────────────────
    const encounters = s.beastEncounters || []
    if (encounters.length > 0) {
      const encTitle = document.createElement('div')
      encTitle.className = 'section-title'
      encTitle.textContent = 'Beast Encounters'
      el.appendChild(encTitle)

      for (const enc of encounters) {
        const beastType = BEAST_TYPES.find(b => b.id === enc.typeId)
        const canTame   = (s.beasts || []).length < 3
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
              ${canTame ? 'Tame (1× Talisman)' : (s.beasts?.length >= 3 ? 'Full (3/3)' : (s.inventory['beast_taming_talisman'] || 0) < 1 ? 'No Talisman' : 'Stage too low')}
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
            const msgs = { not_found:'Already gone', stage:'Realm too low', max_beasts:'Already have 3 beasts', no_talisman:'Need a Beast Taming Talisman' }
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
      beastTitle.textContent = `Beasts (${beasts.length}/3)`
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
          statusHtml = `<span style="color:var(--jade);font-size:10px">On expedition: ${escHtml(loc?.name || '?')} · ${fmtTime(Math.ceil(msLeft/1000))}</span>`
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
  }

  // ── Craft tab ─────────────────────────────────────────────────────────────

  let _craftSubTab = 'pills'

  function renderCraft(s) {
    const el = document.getElementById('tab-craft')
    el.innerHTML = ''

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
      btn.addEventListener('click', () => {
        const res = craftSys.craft(btn.dataset.recipe)
        if (res.ok) {
          flashMessage(`Crafted: ${res.item.name}`, 'positive')
        } else {
          flashMessage(res.reason === 'ingredients' ? 'Not enough materials' : 'Cannot craft', 'negative')
        }
      })
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
  }

  // ── Game controls ─────────────────────────────────────────────────────────

  document.getElementById('btn-meditate').addEventListener('click', () => {
    gameState.startMeditation(30)
  })

  document.getElementById('btn-breakthrough').addEventListener('click', () => {
    const s = gameState.get()
    if (!s?.derived?.canBreakthrough) return
    renderer.setState('breakthrough')
    const res = gameState.attemptBreakthrough()
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

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active')
      const s = gameState.get()
      if (s) {
        if (btn.dataset.tab === 'techniques') renderTechniques(s)
        if (btn.dataset.tab === 'stats')      renderStats(s)
        if (btn.dataset.tab === 'events')     renderEvents(s)
        if (btn.dataset.tab === 'explore')    renderExplore(s)
        if (btn.dataset.tab === 'craft')      renderCraft(s)
      }
    })
  })

  document.getElementById('btn-pin').addEventListener('click', () => {
    window.electron.toggleAlwaysOnTop()
  })

  document.getElementById('btn-quit').addEventListener('click', () => {
    gameState.forceSave()
    window.electron.quit()
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
      toast.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(8,4,14,.95);border:1px solid;padding:5px 13px;border-radius:4px;font-size:12px;z-index:300;pointer-events:none;transition:opacity .3s;font-family:var(--font)'
      document.body.appendChild(toast)
    }
    if (flashTimer) clearTimeout(flashTimer)
    const color = type === 'special' ? '#EDD050' : type === 'negative' ? '#C83030' : type === 'neutral' ? '#8A7A60' : '#30B878'
    toast.style.borderColor = color
    toast.style.color       = color
    toast.textContent       = msg
    toast.style.opacity     = '1'
    flashTimer = setTimeout(() => { toast.style.opacity = '0' }, 2800)
  }

  function fmt(n) {
    if (!isFinite(n) || n >= 1e15) return '∞'
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
