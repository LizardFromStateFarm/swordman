// Breakdowns — "why is this number what it is" popovers (roadmap 1.8b-2, Phase 33). buildBreakdown() is DOM-free: it
// turns the save + GameState's recorded terms (s.derived.breakdown, ascensionBreakdown(), btFailPreview(),
// vitalsInfo()) into a card model { glyph, title, cn, total, rows, sections, notes }. BreakdownUI draws that card as
// a popover next to whatever was tapped: any element with data-bd="<kind>" (HUD numbers, Character tiles).
// Kinds: qps · cap · bt · integrity · health · karma · bloodline. See docs/systems/ui-layout.md → "Breakdowns".

// Short stage names for locks and hints ("Qi Condensation 4", "Core Formation · Early") instead of "Stage 12+".
function stageShortName(i) {
  const st = CULTIVATION_STAGES[Math.max(0, Math.min(i, CULTIVATION_STAGES.length - 1))]
  if (!st) return `Stage ${i}`
  if (st.realm === 'Qi Condensation') return `Qi Condensation ${i}`
  if (st.realm === 'Mortal' || !st.layer) return st.realm
  return `${st.realm} · ${st.layer.replace(/ Stage$/, '')}`
}

// Bloodline is shown from Spirit Severing on (it only matters for the Ascension Trial), or once you have tried it.
function bloodlineVisible(s) {
  const ss = CULTIVATION_STAGES.findIndex(x => x.realm === 'Spirit Severing')
  return s.stageIndex >= ss || (s.stats?.ascensionAttempts || 0) > 0
}

const BD_PCT = v => `${(v * 100).toFixed(1)}%`

// state: true = a current value (Integrity, Health…), shown in the header, not as the "=" of the rows
// row: { label, val, tone?: 'up' | 'down' | 'dim' | 'warn', op? }  section: { title, rows }
function buildBreakdown(kind, s, gs, fmt, fmtTime) {
  const d = s.derived, b = d.breakdown || {}
  const small = n => (n < 10 ? n.toFixed(2).replace(/\.?0+$/, '') : fmt(n))
  // Multiplier chains carry a running subtotal ("×1.8 → 360K") so the player can follow base → total step by step
  const mulRows = (parts, unit) => { let run = 0; return parts.map(p => {
    run = p.op === 'base' ? p.value : p.op === 'x' ? run * p.value : run + p.value
    return {
      label: p.label, run: p.op === 'base' ? null : small(run),
      val: p.op === 'base' ? `${small(p.value)}${unit}` : p.op === 'x' ? `×${+p.value.toFixed(3)}` : `+${small(p.value)}${unit} flat`,
      op: p.op, tone: p.op === 'base' ? '' : (p.op === 'x' ? p.value < 1 : p.value < 0) ? 'down' : 'up',
    } }) }
  const lastMortal = CULTIVATION_STAGES.length - 2

  if (kind === 'qps') {
    const rows = mulRows(b.qps || [], '')
    if (d.meditBonus > 1) rows.push({ label: `Meditation (${d.meditSecondsLeft}s left)`, val: `×${d.meditBonus}`, run: small(d.qiPerSecondBoosted), op: 'x', tone: 'up' })
    const notes = []
    if (d.catchUp) notes.push(`承 Ancestral catch-up: your clan has already reached ${stageShortName(d.catchUpUntil)}. Until you match it, Qi flows ×${CATCHUP_QPS_MULT} and breakthroughs come ${BD_PCT(CATCHUP_BT_BONUS)} easier.`)
    if (d.sectBuffSuppressed) notes.push('Your sect lost a war. Its blessing is withheld for now.')
    notes.push(OFFLINE_QI_MULT === 1 ? 'Qi keeps gathering while the game is closed, at the same rate.' : `While the game is closed, Qi gathers at ×${OFFLINE_QI_MULT}.`)
    return { glyph: '氣', title: 'Qi per second', cn: '吐納', total: `${small(d.qiPerSecondBoosted)} /s`, rows, notes }
  }

  if (kind === 'cap') {
    const left = Math.max(0, d.qiCap * 0.9 - s.qi)
    const rate = d.qiPerSecondBoosted
    const notes = [left <= 0 ? 'Your sea of Qi is full enough to attempt a breakthrough.'
      : `Breakthrough opens at 90% of the cap: ${fmt(left)} Qi to go${rate > 0 ? `, about ${fmtTime(Math.ceil(left / rate))} at this rate` : ''}.`]
    return { glyph: '海', title: 'Qi capacity', cn: '氣海', total: fmt(d.qiCap), rows: mulRows(b.cap || [], ''), notes }
  }

  if (kind === 'bt' && s.stageIndex === lastMortal) {
    const ab = gs.ascensionBreakdown()
    const rows = ab.parts.map(p => p.op === 'base' ? { label: p.label, val: BD_PCT(p.value), op: 'base' }
      : p.want != null && !p.value ? { label: `${p.label} (not yet)`, val: `+${BD_PCT(p.want)}`, op: '+', tone: 'dim' }
      : { label: p.label, val: `+${BD_PCT(p.value)}`, op: '+', tone: 'up' })
    const raw = ab.parts.reduce((a, p) => a + p.value, 0)
    if (raw > ab.cap) rows.push({ label: 'Heaven allows no more than', val: BD_PCT(ab.cap), tone: 'dim' })
    return { glyph: '劫', title: 'Ascension Trial', cn: '飛升', total: BD_PCT(ab.total), rows,
      sections: [{ title: 'If the tribulation takes you', rows: [{ label: 'This life ends; your heir carries on', val: '', tone: 'warn' }] }],
      notes: ['Survivors ascend and become the clan’s Ascended Ancestor. Bloodline is what tips the odds.'] }
  }

  if (kind === 'bt') {
    const rows = (b.bt || []).map(p => p.op === 'base' ? { label: p.label, val: BD_PCT(p.value), op: 'base' }
      : { label: p.label, val: `${p.value < 0 ? '−' : '+'}${BD_PCT(Math.abs(p.value))}`, op: '+', tone: p.value < 0 ? 'down' : 'up' })
    if (b.btRaw > 0.98) rows.push({ label: 'Heaven’s limit (surplus wasted)', val: '98%', tone: 'dim' })
    else if (b.btFloor > b.btRaw) rows.push({ label: 'Sect guarantees at least', val: BD_PCT(b.btFloor), tone: 'up' })
    if (b.btPill >= 1) rows.push({ label: `${ITEMS[s.activePill]?.name || 'Pill'} (spent on the attempt)`, val: 'certain', tone: 'up' })
    else if (b.btPill) rows.push({ label: `${ITEMS[s.activePill]?.name || 'Pill'} (spent on the attempt)`, val: `+${BD_PCT(b.btPill)}`, op: '+', tone: 'up' })
    const fp = gs.btFailPreview()
    const fail = fp.guaranteed ? [{ label: 'The pill guarantees success', val: '', tone: 'up' }] : [
      { label: `Qi scattered${fp.activeKeep ? ' (Active Mode keeps 10%)' : fp.pillSoftens ? ' (pill softens it)' : ''}`, val: `−${Math.round(fp.qiLossFrac * 100)}%`, tone: 'down' },
      { label: `Integrity ${Math.round(s.realmIntegrity ?? 100)} → ${Math.round(fp.integrityAfter)}`, val: `−${Math.round(fp.integrityLoss)}`, tone: 'down' },
      ...(fp.karmaLoss ? [{ label: 'Karma', val: `−${Math.round(fp.karmaLoss)}`, tone: 'down' }] : []),
      ...(fp.demotes ? [{ label: `Foundation cracks: fall back to ${stageShortName(s.stageIndex - 1)}`, val: '', tone: 'warn' }] : []),
    ]
    const notes = []
    if (s.playMode === 'active') notes.push(`Active Mode: strike within ${ACTIVE_BT_FOCUS_WINDOW_SECONDS}s of the bar filling for +${BD_PCT(ACTIVE_BT_FOCUS_BONUS)} on that attempt.`)
    if (!d.canBreakthrough) { const left = Math.max(0, d.qiCap * 0.9 - s.qi); notes.push(`Opens once Qi reaches 90% of the cap. Now ${Math.floor(s.qi / d.qiCap * 100)}%${d.qiPerSecondBoosted > 0 ? `, about ${fmtTime(Math.ceil(left / d.qiPerSecondBoosted))} to go` : ''}.`) }
    return { glyph: '破', title: 'Breakthrough chance', cn: '突破', total: BD_PCT(d.breakthroughChanceDisplay), rows,
      sections: [{ title: 'If it fails', rows: fail }], notes }
  }

  if (kind === 'integrity') {
    const v = gs.vitalsInfo().integrity
    const rows = [
      { label: `Recovers +1 every ${+v.regenSeconds.toFixed(1)}s`, val: v.value >= 100 ? 'full' : `full in ${fmtTime(Math.ceil((100 - v.value) * v.regenSeconds))}`, tone: 'up' },
      { label: 'A failed breakthrough', val: `−${v.failLoss}`, tone: 'down' },
      { label: `Failing at 0: fall a stage, reset to ${v.demoteResetTo}`, val: '', tone: 'warn' },
    ]
    if (s.stageIndex === lastMortal) rows.push({ label: 'At 100 for the Ascension Trial', val: `+${BD_PCT(ASCENSION_PREP_INTEGRITY)}`, tone: v.value >= 100 ? 'up' : 'dim' })
    return { glyph: '基', state: true, title: 'Realm Integrity', cn: '根基', total: `${Math.round(v.value)} / 100`, rows,
      notes: ['How settled your foundation is. Rushing breakthroughs cracks it; time mends it.'] }
  }

  if (kind === 'health') {
    const h = gs.vitalsInfo().health
    const rows = [{ label: `Recovers +${h.regenAmount} every ${h.regenSeconds}s`, val: h.value >= 100 ? 'full' : `full in ${fmtTime(Math.ceil((100 - h.value) / h.regenAmount * h.regenSeconds))}`, tone: 'up' }]
    const risks = h.risky.slice(0, 3).map(r => ({ label: `Roaming ${r.name} (${Math.round(r.chance * 100)}% chance)`, val: `−${r.dmg}`, tone: 'down' }))
    if (!risks.length) risks.push({ label: 'Roaming: nowhere in reach outclasses you', val: '—', tone: 'dim' })
    if (h.risky.length > 3) risks.push({ label: `…and ${h.risky.length - 3} more dangerous places`, val: '', tone: 'dim' })
    risks.push({ label: `Losing a sect war you fought in (${Math.round(h.warChance * 100)}% chance)`, val: `−${h.warDmg}`, tone: 'down' })
    risks.push({ label: 'Winning a duel', val: `−${h.duelCost}`, tone: 'down' })
    risks.push({ label: 'At 0, this life ends', val: '', tone: 'warn' })
    if (s.stageIndex === lastMortal) rows.push({ label: 'At 100 for the Ascension Trial', val: `+${BD_PCT(ASCENSION_PREP_HEALTH)}`, tone: h.value >= 100 ? 'up' : 'dim' })
    return { glyph: '血', state: true, title: 'Health', cn: '氣血', total: `${Math.round(h.value)} / 100`, rows,
      sections: [{ title: 'What wounds you', rows: risks }], notes: ['Some chance events also wound or heal you.'] }
  }

  if (kind === 'karma') {
    const rows = [
      { label: 'Adds to every breakthrough', val: `+${BD_PCT(s.karma / 1000)}`, tone: s.karma ? 'up' : 'dim' },
      { label: 'Each breakthrough', val: '+10', tone: 'up' },
      { label: 'Each failed breakthrough', val: '−8', tone: 'down' },
    ]
    if (s.techniques.includes('karma_cultivation')) rows.push({ label: 'Karma Cultivation Art', val: '+0.5 /s', tone: 'up' })
    return { glyph: '緣', state: true, title: 'Karma', cn: '因果', total: `${Math.round(s.karma)} / 100`, rows,
      notes: ['Every 10 karma is +1% to break through. Some chance events weigh your deeds too.'] }
  }

  if (kind === 'bloodline') {
    const bq = s.bloodlineQuality || 0
    const rows = [
      { label: 'Ascension Trial odds', val: `+${BD_PCT(bq * ASCENSION_BQ_COEF)}`, tone: bq ? 'up' : 'dim' },
      { label: 'At the full 100', val: `+${BD_PCT(BLOODLINE_CAP * ASCENSION_BQ_COEF)}`, tone: 'dim' },
    ]
    return { glyph: '脈', state: true, title: 'Bloodline', cn: '血脈', total: `${Math.round(bq)} / ${BLOODLINE_CAP}`, rows,
      notes: ['It thickens with each generation: when a life ends it grows from how far you climbed, how far your spouse climbed, and the strength of the heir who follows.'] }
  }
  return null
}

class BreakdownUI {
  // helpers: { fmt, fmtTime, esc }
  constructor(gameState, helpers) {
    this.gs = gameState
    this.h = helpers
    this.el = document.getElementById('breakdown-overlay')
    this.kind = null
    this.anchor = null
    this._sig = ''
    document.addEventListener('click', e => {
      const t = e.target.closest?.('[data-bd]')
      if (t && !t.disabled) { e.stopPropagation(); this.kind === t.dataset.bd && !this.el.classList.contains('hidden') ? this.close() : this.open(t.dataset.bd, t); return }
      if (!this.el.classList.contains('hidden') && !e.target.closest('.bd-pop')) this.close()
    }, true)
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close() })
    window.addEventListener('resize', () => this._place())
  }

  open(kind, anchor) {
    this.kind = kind
    this.anchor = anchor
    this._sig = ''
    this.el.classList.remove('hidden')
    this.refresh(this.gs.get())
    // Opening from the banner peeks the window open first (layout.js watches *-overlay); place after that reflow.
    requestAnimationFrame(() => this._place())
  }

  close() {
    if (this.el.classList.contains('hidden')) return
    this.el.classList.add('hidden')
    this.kind = null
    this.anchor = null
  }

  // Cheap to call every frame: only rewrites the card when its text changed.
  refresh(s) {
    if (!this.kind || !s?.derived || this.el.classList.contains('hidden')) return
    const m = buildBreakdown(this.kind, s, this.gs, this.h.fmt, this.h.fmtTime)
    if (!m) return this.close()
    const esc = this.h.esc
    const row = r => `<div class="bd-row ${r.tone || ''}${r.op === 'base' ? ' base' : ''}"><span class="bd-l">${esc(r.label)}</span><span class="bd-v">${esc(r.val)}${r.run ? `<span class="bd-run">→ ${esc(r.run)}</span>` : ''}</span></div>`
    const html = `<div class="bd-pop" role="dialog" aria-label="${esc(m.title)}">
      <div class="bd-head"><span class="bd-glyph">${m.glyph}</span><span class="bd-title"><span class="bd-tt">${esc(m.title)}</span></span>
        ${m.state ? `<span class="bd-total-v bd-head-v">${esc(m.total)}</span>` : ''}<button class="bd-x" data-bd-close title="Close (Esc)">✕</button></div>
      <div class="bd-rows">${m.rows.map(row).join('')}</div>
      ${m.state ? '' : `<div class="bd-total"><span>=</span><span class="bd-total-v">${esc(m.total)}</span></div>`}
      ${(m.sections || []).map(sec => `<div class="bd-sec-title">${esc(sec.title)}</div><div class="bd-rows">${sec.rows.map(row).join('')}</div>`).join('')}
      ${(m.notes || []).map(n => `<div class="bd-note">${esc(n)}</div>`).join('')}
    </div>`
    if (html === this._sig) return
    this._sig = html
    this.el.innerHTML = html
    this.el.querySelector('[data-bd-close]').addEventListener('click', () => this.close())
    this._place()
  }

  // Beside the tapped element, flipped above it when there's no room below, clamped inside the window.
  _place() {
    const pop = this.el.querySelector('.bd-pop')
    if (!pop) return
    const W = window.innerWidth, H = window.innerHeight, pad = 8
    const w = Math.min(300, W - pad * 2)
    pop.style.width = w + 'px'
    pop.style.maxHeight = (H - pad * 2) + 'px'   // before measuring: a tall card scrolls instead of running off the window
    const r = this.anchor?.isConnected ? this.anchor.getBoundingClientRect() : null
    const ph = pop.offsetHeight
    let left = (W - w) / 2, top = (H - ph) / 2
    if (r && r.width) {
      left = Math.max(pad, Math.min(W - w - pad, r.left + r.width / 2 - w / 2))
      if (r.bottom > 0 && r.top < H) top = r.bottom + 6 + ph <= H - pad ? r.bottom + 6 : r.top - 6 - ph >= pad ? r.top - 6 - ph : H - ph - pad
    }
    pop.style.left = left + 'px'
    pop.style.top = Math.max(pad, Math.min(top, H - ph - pad)) + 'px'
  }
}

if (typeof module !== 'undefined') module.exports = { buildBreakdown, stageShortName, bloodlineVisible }
