// Main game controller — character select → game loop → UI updates.

;(async function () {

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
  const sectSys   = new SectSystem(gameState)
  const sectWarSys = new SectWarSystem(gameState)
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
      sectSys.tick(dt)
      sectWarSys.tick(dt)
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
      if (activeTab === 'sect')    updateSectTimersInPlace(s)
    } else {
      // On explicit state changes: full tab re-render (safe, buttons will be stable until next change)
      if (activeTab === 'techniques') renderTechniques(s)
      if (activeTab === 'stats')      renderStats(s)
      if (activeTab === 'events')     renderEvents(s)
      if (activeTab === 'explore')    renderExplore(s)
      if (activeTab === 'craft')      renderCraft(s)
      if (activeTab === 'sect')       renderSect(s)
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
      ${sr('Beasts', `${(s.beasts||[]).length}/${d.maxBeasts || 3}`)}
      ${s.ownSect?.founded ? sr('Own Sect', `${escHtml(s.ownSect.name)} · ${s.ownSect.disciples.length}/${d.discipleCap} disciples · Fame ${fmt(d.sectFame)}`) : ''}
      ${s.ownSect?.founded ? sr('Sect Wars', `${s.sectWar.warVictories}W – ${s.sectWar.warDefeats}L`) : ''}
      ${s.sect?.id ? sr('Sect', `${SECTS.find(x => x.id === s.sect.id)?.name || '?'} · ${SECT_RANKS[s.sect.rank]?.name || ''}`) : ''}
      ${sr('Time Cultivating', fmtTime(s.stats.timePlayed))}
      ${s.equipped.weapon   ? sr('Weapon',   ITEMS[s.equipped.weapon]?.name   || s.equipped.weapon)   : ''}
      ${s.equipped.artifact ? sr('Artifact', ITEMS[s.equipped.artifact]?.name || s.equipped.artifact) : ''}
    `
  }

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
            ${ok ? 'Join' : `Stg ${d.minStage}`}
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
    // Mission bars: set via JS (CSP blocks inline style attributes in innerHTML)
    const warSlot = s.derived.warSlot || 0
    const mt = document.createElement('div')
    mt.className = 'section-title'
    mt.textContent = `Missions (${sect.activeMissions.length + warSlot}/${SECT_MAX_MISSIONS} active${warSlot ? ', 1 pledged to war' : ''})`
    el.appendChild(mt)

    for (const m of SECT_MISSIONS) {
      const active   = sect.activeMissions.find(a => a.missionId === m.id)
      const unlocked = sect.rank >= m.minRank
      const full     = sect.activeMissions.length + warSlot >= SECT_MAX_MISSIONS
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
      btn.addEventListener('click', () => {
        const res = gameState.startSectMission(btn.dataset.mission)
        const msgs = { rank:'Rank too low', busy:'Already underway', full:'Mission slots full', unknown:'Unknown mission', no_sect:'Not in a sect' }
        if (!res.ok) flashMessage(msgs[res.reason] || 'Cannot start mission', 'negative')
        else flashMessage(`Mission started: ${res.mission.name}`, 'positive')
      })
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
        <div class="sect-desc">${ok ? 'Build halls, recruit disciples, and lead a sect of your own.' : `Requires Nascent Soul (stage ${F.minStage}).`}</div>
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
    const slotsFree = s.sect.activeMissions.length < SECT_MAX_MISSIONS
    const warBeast = w.beastId && (s.beasts || []).find(b => b.id === w.beastId)
    panel.innerHTML = `
      <div class="sect-name">⚔ ${escHtml(w.enemyName)} ${'★'.repeat(w.enemyTier)}</div>
      <div class="sect-desc">${calling ? 'Call to Arms — the elders summon every disciple.' : 'Muster — the sect gathers at the mountain gate.'}</div>
      <div class="war-timer">Battle in <span id="_war_timer"></span></div>
      <div class="sect-desc">Your commitment: +${Math.round(bonus * rankMult * 100)}% sect strength · ~${winPct}% to win</div>
      ${bonus ? '' : '<div class="sect-desc war-warn">Ignoring the call costs contribution and karma.</div>'}
      <div class="sect-btns">
        <button class="sect-btn${!w.answered && slotsFree ? ' available' : ''}" id="_war_answer" ${w.answered || !slotsFree ? 'disabled' : ''}>${w.answered ? 'Answered ✓' : slotsFree ? 'Answer the Call' : 'Answer (free a mission slot)'}</button>
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
      if (!r.ok) flashMessage(r.reason === 'full' ? 'Free a mission slot first' : (msgs[r.reason] || 'Cannot answer'), 'negative')
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
          flashMessage(res.doubled ? `Crafted: ${res.item.name} ×2 (Herb Hall bonus!)` : `Crafted: ${res.item.name}`, 'positive')
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
        if (btn.dataset.tab === 'sect')       renderSect(s)
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
