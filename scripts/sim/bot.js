// Rule-based player bot for the QA sim. Each check-in it does everything a reasonable greedy player
// would: breakthrough, meditate, learn, craft/equip, expeditions, beasts, sect, own sect, war prep.
// Only calls public gameState methods (never mutates state directly). See docs/systems/qa-sim.md.
const { mulberry32 } = require('./rng')

const EQUIP_SCORE = {  // how much the bot values each effect type (unknown/no-op effects score 0)
  qps_mult:    v => (v - 1) * 100,
  qi_cap_mult: v => (v - 1) * 60,
  bt_bonus:    v => v * 100,
  void_blade:  (_, e) => (e.bt_bonus || 0) * 100 + ((e.loot_mult || 1) - 1) * 40,
}
const BT_PILLS = ['pill_golden_core', 'pill_foundation', 'pill_qi_refining']   // best first

function itemScore(ITEMS, id) {
  const e = id && ITEMS[id]?.effect
  const f = e && EQUIP_SCORE[e.type]
  return f ? f(e.value, e) : 0
}

class Bot {
  constructor(sim, rec, { path = 'founder', actEverySec = 10, profile = 'active' } = {}) {
    this.sim = sim; this.gs = sim.gs; this.D = sim.data; this.rec = rec
    // The bot's own seeded stream — separate from the game's (sim.ctx Math.random) so bot decisions never
    // shift the game's draw order, and never Node's unseeded Math.random (runs must be reproducible).
    this.rand = mulberry32(((sim.seed ?? 1) ^ 0x9E3779B9) >>> 0)
    this.path = path; this.actEverySec = actEverySec; this.profile = profile
  }

  get s() { return this.gs.get() }
  inv(id) { return this.s.inventory[id] || 0 }

  // One check-in: keep acting until nothing more to do.
  checkIn() {
    this._ci = (this._ci || 0) + 1   // check-in counter: once() throttles roll at most once per check-in
    this.interlude()   // 2.6d: a life that ended between check-ins (or during the last one) is resolved first
    this.rec.checkIn(this.s)
    this.warOrders()
    this.automationSetup()
    this.automation()
    for (let i = 0; i < 40; i++) {
      this.interlude()   // an action this check-in may have ended the life — never act on an unborn one
      const before = this.s.spiritStones
      const acted = this.family() || this.legacies() || this.soul() || this.arts() || this.tryBreakthrough() || this.learnTechnique() || this.craftAndEquip() ||
        this.elixirs() || this.heal() || this.memberWar() || this.beasts() || this.legends() || this.body() || this.sectPolitics() || this.deeds() || this.ranks() || this.hunt() || this.arena() || this.sect() || this.ownSect() || this.war() ||
        this.pushExpedition() || this.expedition()
      if (!acted) break
      // A life-ending action (pass_mantle / a death) books the life-reset purse delta too — the metrics
      // stone_ledger invariant requires every stone to be accounted, so it is attributed to that action.
      this.rec.stones(this.rec.lastAction, this.s.spiritStones - before)
    }
    this.interlude()
    if (!this.s.meditating) { this.gs.startMeditation(30); this.rec.act('meditate', false) }
  }

  // ── Phase 22: Active/Idle Mode + Automation ─────────────────────────────
  // Set once: 'active' plays in Active Mode (no automation, manual clicks + interaction bonuses below);
  // 'casual'/'afk' stay in Idle Mode and rely on automation, mirroring how Phase 32's warOrders() split
  // manual-vs-standing-order behavior by profile (see qa-sim.md).
  automationSetup() {
    if (this._autoModeSet) return false
    this._autoModeSet = true
    this.gs.setPlayMode(this.profile === 'active' ? 'active' : 'idle')
    return false
  }

  // Turns on each automation the moment it unlocks (idle profiles only) — a real player who set this up
  // once wouldn't revisit it every session, but would reasonably flip a new one on shortly after noticing
  // it in the Automation panel. Enables a modest, not-maxed set of Auto-Craft recipes (mirrors
  // craftAndEquip()'s own pill-stocking preference), never counts as a "meaningful" player action itself.
  automation() {
    if (this.profile === 'active') return false
    const s = this.s, a = s.automation
    let did = false
    for (const key of ['autoExplore', 'autoSectMissions', 'autoCraft', 'autoBreakthrough', 'autoTemper']) {
      if (!a[key] && this.gs.automationUnlocked(key)) { this.gs.setAutomation(key, true); did = true }
    }
    if (a.autoCraft) {
      for (const productId of [...BT_PILLS, 'pill_heart_calming']) {
        const r = this.recipe(productId)
        if (r && !a.autoCraftRecipes[r.id]) { this.gs.setAutoCraftRecipe(r.id, true); did = true }
      }
    }
    return did
  }

  // Active Mode's Push Harder — opportunistic, only when the window/affordability lines up.
  pushExpedition() {
    if (this.profile !== 'active' || !this.s.expedition.active || this.s.expedition.pushed) return false
    return this.do('push_expedition', this.gs.pushExpedition())
  }

  // ── Phase 32: War Standing Orders ────────────────────────────────────────
  // Set once, as soon as the bot exists (mirrors a real player configuring orders on day one).
  // 'active' still handles wars manually below (memberWar()/war()) — orders here are just its
  // fallback for the (rare) phase its own actEverySec cadence misses. 'casual'/'afk' rely on
  // orders entirely: memberWar()/war() below no-op for them, by design, to prove the standing-order
  // path alone gets them a comparable outcome to 'active' (see report.js's afk/casual-vs-active check).
  warOrders() {
    if (this._orderedWars) return false
    this._orderedWars = true
    // Modest, not maxed — "reasonable, not optimal" (see qa-sim.md gotchas): a real player who sets
    // orders once and forgets them wouldn't blank-check every war chest, or they'd never save enough
    // to found a sect. 50 stones/war is a meaningful chunk of an early chest (MEMBER_WAR_CHEST_BASE
    // 150) without crowding out SECT_FOUNDING's 500-stone cost the way a larger flat order would.
    this.gs.setWarOrder('answer', 'always')
    this.gs.setWarOrder('chestStones', 50)
    this.gs.setWarOrder('lendBeast', 'strongest')
    this.gs.setWarOrder('reinforce', 'if_affordable')
    this.gs.setWarOrder('reinforceKeep', 300)
    this.gs.setWarOrder('ally', 'cheapest')
    return false   // never counts as a meaningful action; doesn't block the rest of checkIn()
  }

  // ── Family (Phase 16-lite, M2 task 2.5) ───────────────────────────────────
  // Pending proposal → accept the strongest suitor (Persons.powerScore: stage×100 + root mult×10, mirrored
  // here since the bot only touches the public API). Never declines — life-loop.md §7.
  // family.md: a pending duel → fight if the odds are ≥ 50%, else flee. A pending marriage event → 'active'
  // picks the affordable choice its spouse likes most (an attentive player); 'casual'/'afk' pick a random
  // affordable one, which exercises the low-affection crisis path. Crises: forgive a cheater, beg a leaver.
  // Lover encounters: seduce 25% of the time, else leave. Never ends an affair. Duels: fight only at ≥ 60% odds.
  // Phase 31 (M2 task 2.7c): spend Ancestral Merit greedily, cheapest-first-ish priority order (life-loop.md
  // §7's original draft), then pick the highest-minStage known technique once Family Manual is bought.
  legacies() {
    const s = this.s
    const clan = s.world.playerClanId ? s.world.clans[s.world.playerClanId] : null
    if (!clan) return false
    const order = ['ancestral_stipend', 'refined_meridians', 'family_manual', 'heirloom', 'beast_lineage']
    for (const id of order) {
      if (this.do('buy_legacy', this.gs.buyLegacy(id))) return true
    }
    if ((clan.legacies.family_manual || 0) > 0 && !clan.manualTechId && clan.techniquesEver.length) {
      const maxTier = this.D.CLAN_LEGACIES.family_manual.levels[clan.legacies.family_manual - 1].value
      const cands = clan.techniquesEver.map(id => this.D.TECHNIQUES.find(t => t.id === id))
        .filter(t => t && t.minStage <= maxTier).sort((a, b) => b.minStage - a.minStage)
      if (cands[0] && this.do('set_family_manual', this.gs.setFamilyManual(cands[0].id), false)) return true
    }
    return false
  }

  // Phase 40 (soul-points.md): buy every Soul Resonance rank it can afford (one per call, like the player's click).
  soul() {
    return this.do('spend_soul', this.gs.spendSoul(), false)
  }

  // ── Phase 42 (arts.md): study, loadout, library + selling (task 1.15) ─────
  // The bot plays the arts systems: it answers breakthrough offers, works its study desks, wears its best known
  // loadout, buys from its sect's library, writes/studies the clan library, gives a spare manual to the sect and
  // sells what it can never use. Kept "reasonable, not optimal" like the rest of the bot. A duplicate manual of a
  // known art is given to the sect before it is studied, so the sect is fed and one copy is kept to study.
  arts() {
    return this.artOffers() || this.giveManuals() || this.studyManuals() || this.setLoadout() || this.sectLibraryBuy() ||
      this.clanArts() || this.sellSurplus()
  }

  // The 4 moves it would wear right now, best-first: raw damage at its mastery, its root element worth +20%
  // (an affinity bonus in `_mbDamage`) and a fresh element worth a little extra (the fight's element matchup).
  // The `_mbPolicy` actually chooses each turn, so a deck of strong moves is what matters here.
  artMoveRank() {
    const A = this.D.ARTS, els = this.s.root.elements, known = this.s.arts.known
    const pool = Object.keys(known).filter(id => A[id]?.kind === 'move')
    const val = id => {
      const a = A[id], m = a.move, lv = known[id]?.mastery || 1
      let v = (m.power || 0) * (m.hits || 1) * (1 + this.D.ART_MASTERY_POWER * (lv - 1))
      if (m.type === 'heal') v = Math.max(v, 30)                      // the policy heals under 30% Health
      else if (!['strike', 'multi', 'finisher', 'drain', 'charge', 'hex'].includes(m.type)) v *= 0.5   // wards/buffs the policy never picks
      if (m.type === 'charge') v *= 0.85
      if (a.element !== 'neutral' && els.includes(a.element)) v *= 1.2
      return v
    }
    const out = []
    while (out.length < 4) {
      let best = null, bv = -1
      for (const id of pool) {
        if (out.includes(id)) continue
        const a = A[id], v = val(id) * (a.element !== 'neutral' && !out.some(x => A[x].element === a.element) ? 1.12 : 1)
        if (v > bv) { bv = v; best = id }
      }
      if (!best) break
      out.push(best)
    }
    return out
  }
  // Passives: the best grade it knows (the policy doesn't read them, so grade is the honest proxy).
  artPassiveRank() {
    const A = this.D.ARTS, R = this.D.ART_RARITY_ORDER, els = this.s.root.elements
    return Object.keys(this.s.arts.known).filter(id => A[id]?.kind === 'passive')
      .sort((x, y) => R.indexOf(A[y].rarity) - R.indexOf(A[x].rarity) || A[y].minStage - A[x].minStage ||
        (els.includes(A[y].element) - els.includes(A[x].element)) || x.localeCompare(y))
  }

  // Answer a waiting breakthrough offer — 'active' takes the best art, casual/afk take one at random. The offer
  // waits forever, so nothing is lost; this is just the player's pick (agency rule).
  artOffers() {
    const off = this.s.arts.offers[0]
    if (!off) return false
    let pick
    if (this.profile === 'active') {
      const A = this.D.ARTS, R = this.D.ART_RARITY_ORDER, els = this.s.root.elements
      const score = id => R.indexOf(A[id].rarity) + (els.includes(A[id].element) ? 0.5 : 0)
      pick = [...off.options].sort((x, y) => score(y) - score(x))[0]
    } else pick = off.options[Math.floor(this.rand() * off.options.length)]
    return this.do('choose_art', this.gs.chooseArtOffer(off.id, pick))
  }

  // Put a free desk to work: 'active' studies the best manual it holds, casual/afk any ready one.
  studyManuals() {
    const s = this.s, A = this.D.ARTS, R = this.D.ART_RARITY_ORDER
    if ((s.arts.studies || []).length >= this.gs.studySlots()) return false
    const ready = Object.keys(s.inventory).filter(k => k.startsWith('manual_') && s.inventory[k] > 0)
      .map(k => k.slice(7)).filter(id => A[id] && this.gs.artStudyLock(id) === null)
    if (!ready.length) return false
    const pick = this.profile === 'active'
      ? ready.sort((x, y) => R.indexOf(A[y].rarity) - R.indexOf(A[x].rarity) || A[y].minStage - A[x].minStage)[0]
      : ready[Math.floor(this.rand() * ready.length)]
    return this.do('study_art', this.gs.studyArt(pick))
  }

  // Wear the best known loadout — rewrites a slot only when it would actually change.
  setLoadout() {
    const s = this.s
    const moves = [...this.artMoveRank(), null, null, null, null].slice(0, 4)
    const slots = this.gs.passiveSlots()
    const passives = [...this.artPassiveRank().slice(0, slots), ...Array(5 - slots).fill(null)]
    let did = false
    for (let i = 0; i < 4; i++)
      if (s.arts.loadout.moves[i] !== moves[i] && (moves[i] || s.arts.loadout.moves[i] !== null)) { this.gs.setArtSlot('move', i, moves[i]); did = true }
    for (let i = 0; i < 5; i++)
      if (s.arts.loadout.passives[i] !== passives[i] && (passives[i] || s.arts.loadout.passives[i] !== null)) { this.gs.setArtSlot('passive', i, passives[i]); did = true }
    return did ? this.do('set_loadout', true) : false
  }

  // Buy an art it lacks from a joined sect's library with Contribution (cheapest grade first). Members only,
  // and it keeps enough Contribution back to feel like a member rather than a spendthrift.
  sectLibraryBuy() {
    const lib = this.gs.sectLibrary()
    if (!lib) return false
    const A = this.D.ARTS, R = this.D.ART_RARITY_ORDER
    const cands = lib.arts.filter(a => !a.lock && !a.known && !a.held && !a.tooProfound && a.price <= lib.contribution)
      .sort((x, y) => x.price - y.price || R.indexOf(A[y.id].rarity) - R.indexOf(A[x.id].rarity))
    const want = cands.find(a => this.profile === 'active' || lib.contribution - a.price >= 200)
    return want ? this.do('buy_sect_art', this.gs.buySectArt(want.id)) : false
  }

  // The clan library (outlives you): study what a past life wrote in when a desk is free, and — 'active' only,
  // with stones to spare — write a mastered art in so later lives can learn it at half the time.
  clanArts() {
    const info = this.gs.clanLibraryInfo()
    if (!info) return false
    if ((this.s.arts.studies || []).length < this.gs.studySlots()) {
      const row = info.shelf.find(x => !x.lock)
      if (row) return this.do('study_clan_art', this.gs.studyFromClan(row.artId))
    }
    if (this.profile !== 'active') return false
    const A = this.D.ARTS
    const w = info.writable.find(x => (this.s.arts.known[x.id]?.mastery || 1) >= 2 && x.cost <= this.s.spiritStones * 0.2 && this.s.spiritStones - x.cost >= 300)
    return w ? this.do('write_clan_art', this.gs.writeClanArt(w.id)) : false
  }

  // A spare manual for an art it already knows (a second copy, or one it has studied to mastery 2) is worth more
  // to the sect (Contribution / war strength) than in the pack — the game's own Pack row calls this "a spare".
  giveManuals() {
    const info = this.gs.sectDonateInfo()
    if (!info) return false
    const spare = info.manuals.find(m => !m.lock && m.spare &&
      ((this.s.arts.known[m.id]?.mastery || 1) >= 2 || m.n >= 2))
    return spare ? this.do('donate_manual', this.gs.donateManualToSect(spare.id)) : false
  }

  // Sell what can never be used again: a manual for an art already mastered (no mastery left to gain) and gear
  // it has outgrown (the craftAndEquip path leaves the old piece in the pack).
  sellSurplus() {
    const s = this.s, ITEMS = this.D.ITEMS
    for (const [id, n] of Object.entries(s.inventory)) {
      if (!id.startsWith('manual_') || n <= 0) continue
      if ((s.arts.known[id.slice(7)]?.mastery || 0) >= this.D.ART_MASTERY_MAX) return this.do('sell', this.gs.sellItem(id, n))
    }
    for (const slot of ['weapon', 'artifact']) {
      const outgrown = Object.keys(s.inventory).filter(id => ITEMS[id]?.type === slot && s.inventory[id] > 0 &&
        itemScore(ITEMS, id) < itemScore(ITEMS, s.equipped[slot]))
      if (outgrown.length) return this.do('sell', this.gs.sellItem(outgrown[0], s.inventory[outgrown[0]]))
    }
    return false
  }

  // 1.8b-3a (family.md): the player's own family actions. 'active' courts, tends its spouse (time/gift below
  // Warm, dual cultivation only when nearly safe) and spends time with its most distant child; casual does each
  // now and then; afk only courts once in a while (so every path is exercised). One action per call.
  familyAgency() {
    const f = this.s.family, gs = this.gs, active = this.profile === 'active', odds = active ? 1 : this.profile === 'casual' ? 0.05 : 0.01
    if (!f.spouse) {
      const c = f.court
      if (c?.beat) {
        const def = gs.courtBeatDef(c.beat), p = c.target.personality
        const opts = def.choices.map((ch, i) => ({ i, v: ch.int ? (ch.int[p] ?? ch.int.default ?? 0) : 0, cost: gs.familyCost(ch) })).filter(o => this.s.spiritStones >= o.cost)
        const pick = active ? opts.sort((a, b) => b.v - a.v)[0] : opts[Math.floor(this.rand() * opts.length)]
        return pick ? this.do('court_meeting', gs.resolveCourtBeat(pick.i)) : this.do('court_withdraw', gs.withdrawCourtship(), false)
      }
      if (c?.target) {
        if (gs.canPropose().ok) { const r = gs.propose(); return this.do(r.accepted ? 'court_wed' : 'court_refused', r) }
        if (gs.canMeet().ok) return this.do('court_meet', gs.meetTarget(), false)
        return false
      }
      if (c?.candidates?.length) {
        const best = [...c.candidates].sort((a, b) => b.stageIndex - a.stageIndex)[0]
        return this.do('court_target', gs.courtTarget(best.id), false)
      }
      if (!f.proposal && gs.canSeekMatch().ok && this.rand() < odds * 0.2) return this.do('seek_match', gs.seekMatch())
      return false
    }
    if (this.rand() >= odds) return false
    if (f.affection < 60) for (const k of ['time', 'gift']) if (gs.spouseActionPreview(k).ok) return this.do('spouse_' + k, gs.spouseAction(k))
    const dual = gs.spouseActionPreview('dual')
    if (dual.ok && dual.risk <= 0.05) return this.do('spouse_dual', gs.spouseAction('dual'))
    const kid = gs._homeChildren().filter(c => gs.childActionPreview(c.id, 'time').ok).sort((a, b) => a.bond - b.bond)[0]
    if (kid && kid.bond < 45) return this.do('child_time', gs.childAction(kid.id, 'time'))
    return false
  }

  family() {
    const f = this.s.family
    if (!f) return false
    // 2.6b Family Planning, set once per life: 'active' keeps families small ('some'), casual/afk go big ('many').
    // (Was once per run until 2.6d — every later life silently fell back to the default 'many'.)
    // 1.8b-3a: casual keeps the "Ask me" default and answers each wish; afk delegates ('many').
    if (this._plannedFor !== this.s.self.id) { this._plannedFor = this.s.self.id; this.gs.setFamilyPlanning(this.profile === 'active' ? 'some' : this.profile === 'casual' ? 'ask' : 'many') }
    // 1.8b-3b / 1.14a: a fight you're in is played on moves (the default policy, like beast battles) and the parry QTE
    // lands at a per-profile rate; 'active' yields a hopeless lethal fight when they'd likely accept.
    if (f.fight?.kind === 'beast') return this.battle()   // Phase 35: beast battles have their own end choice
    if (f.fight?.kind === 'boss') return this.bossBattle()   // v1 add-on: a legendary boss (bosses.md)
    if (f.fight?.over === 'won') {       // A6-3a: a won fight waits for the end choice. 'active' makes friends where it can
      const ch = this.gs.personFightChoices()   // (a debt), and finishes / humbles the rest; casual/afk pick at random.
      const pick = this.profile === 'active'
        ? (ch.lethal ? (ch.reaction.spare === 'debt' ? 'spare' : 'finish') : (ch.reaction.raise === 'debt' ? 'raise' : 'humble'))
        : ch.ids[Math.floor(this.rand() * ch.ids.length)]
      return this.do('fight_end_' + pick, this.gs.personFightFinish(pick))
    }
    if (f.fight) {
      const info = this.gs.fightInfo(), m = info.m
      if (m?.pending) {
        const rate = { active: 0.6, casual: 0.25 }[this.profile] ?? 0.1
        return this.do('fight_parry', this.gs.fightParry(Array.from({ length: m.pending.hits }, () => this.rand() < rate)))
      }
      if (this.profile === 'active' && info.lethal && m.turn === 1 && !this._yieldTried && info.yieldAccept > 0.5 &&
          this.gs.personFightOdds(info.opp, info.kind, true).chance < 0.2) {
        this._yieldTried = true
        return this.do('fight_yield', this.gs.fightExchange('yield'))
      }
      this._yieldTried = false
      const res = this.gs.fightMove(this.gs._mbPolicy(m))
      if (res?.over || res?.done) this.rec.fightLen('person', res.turn)   // fight length (arts.md target 4–8 turns)
      return this.do('fight_move', res)
    }
    // 1.8b-3b: a lover's ultimatum — 'active' keeps its marriage safe; casual/afk choose at random.
    const ult = (f.lovers || []).find(l => l.ultimatum)
    if (ult) {
      const opts = f.spouse ? ['let_go', 'one_more', 'marry'] : ['marry', 'let_go', 'one_more']
      const pick = this.profile === 'active' ? (f.spouse ? 'let_go' : 'marry') : opts[Math.floor(this.rand() * opts.length)]
      return this.do('lover_' + pick, this.gs.answerLoverUltimatum(ult.person.id, pick))
    }
    if (this.profile === 'active' && f.spouse && !f.tolerant) {
      const l = (f.lovers || []).find(x => this.gs.affairRisk(x.person.id)?.covered === false)
      if (l && this.s.spiritStones > this.gs.coverCost() * 4 && this.do('cover_tracks', this.gs.coverTracks(l.person.id), false)) return true
    }
    if (f.childWish) return this.do('child_wish', this.gs.answerChildWish(this.rand() < 0.75))
    if (this.familyAgency()) return true
    // 2.6e: an NPC calls you out for the head seat — decide lethal or not. 'active' plays it savvy (lethal
    // only when clearly favored); casual/afk decide at random.
    if (f.headChallenge) {
      const challenger = this.gs.person(f.headChallenge.challengerId)
      const lethal = this.profile === 'active' ? !!(challenger && challenger.stageIndex < this.s.stageIndex) : this.rand() < 0.4
      return this.do('head_challenge_decide', this.gs.resolveHeadChallenge(lethal))
    }
    // 2.6e: the sitting head steps down — 'active' always enters if eligible; casual/afk enter about half the time.
    if (f.stepDownOffer) {
      const join = f.stepDownOffer.eligible && (this.profile === 'active' || this.rand() < 0.5)
      return this.do('stepdown_answer', this.gs.answerStepDown(join))
    }
    // 2.6d upbringing (you are the child): 'active' picks what its own personality likes; casual/afk pick at random.
    const up = this.s.upbringing?.event
    if (up) {
      const def = this.gs.upbringingEventDef(up), me = this.s.personality?.id
      let i = Math.floor(this.rand() * def.choices.length)
      if (this.profile === 'active') {
        const val = c => c.bond ? (c.bond[me] ?? c.bond.default ?? 0) : 0
        i = def.choices.map((c, k) => ({ v: val(c), k })).sort((a, b) => b.v - a.v)[0].k
      }
      return this.do('upbringing', this.gs.resolveUpbringingEvent(i))
    }
    // family-events.js: a bad father's hand, and the grown-up reckoning. 'active' takes the defiant line.
    if (this.s.abuse?.event) return this.do('beating', this.gs.resolveBeating(this.profile === 'active' ? 2 : Math.floor(this.rand() * 3)))
    if (this.s.abuse?.reckon) return this.do('reckoning', this.gs.resolveReckoning(this.profile === 'active' ? 'break' : 'forgive'))
    // family-events.js: the mirror — always answer a grown child's reckoning; 'active' raises a hand sometimes
    // (the child's trauma feeds the heir Bloodline term), everyone else stays their hand.
    const kidReck = this.gs.childReckoningInfo?.()
    if (kidReck) return this.do('child_reckoning', this.gs.resolveChildReckoning(kidReck.id, 'accept'))
    if (this.profile === 'active' && this.rand() < 0.02) {
      const kid = (this.s.family.children || []).find(c => this.gs.abuseChildPreview(c.id).ok)
      if (kid) return this.do('child_abuse', this.gs.abuseChild(kid.id))
    }
    // 2.6c heirs: a tournament in progress is fought to the end (strongest paired with weakest — the bot
    // protects its best). 'active' hosts one per life once it has 6+ adult children and reaches Nascent Soul;
    // everyone else (and 'active' until then) simply names the strongest adult child heir.
    if (f.tournament) {
      const info = this.gs.tournamentInfo()
      const pool = info.pool.map(id => f.children.find(c => c.id === id)).sort((a, b) => b.stageIndex - a.stageIndex)
      const pairs = []
      while (pairs.length < info.fights) pairs.push([pool.shift().id, pool.pop().id])
      // 1.8b-3b: casual spares a loser now and then (they leave the house instead of dying)
      const spare = this.profile === 'casual' && info.lethal ? pairs.map((_, i) => i).filter(() => this.rand() < 0.2) : []
      return this.do('tournament_round', this.gs.fightTournamentRound(pairs, spare))
    }
    const adults = this.gs.eligibleHeirs()
    if (this.profile === 'active' && !f.lastTournament && adults.length >= 6 && this.s.stageIndex >= 16) {
      return this.do('host_tournament', this.gs.startTournament())
    }
    if (!f.heirId && adults.length) {
      const best = [...adults].sort((a, b) => b.stageIndex - a.stageIndex)[0]
      if (this.do('choose_heir', this.gs.chooseHeir(best.id), false)) return false
    }
    // 2.6b child events: 'active' picks what that child likes most (and always fetches a runaway); casual/afk
    // pick at random — which lets bonds fall far enough to exercise the runaway crisis.
    if (f.childEvent) {
      const def = this.gs.childEventDef(f.childEvent), child = f.children.find(c => c.id === f.childEvent.childId)
      const affordable = def.choices.map((c, i) => ({ c, i })).filter(x => this.s.spiritStones >= this.gs.familyCost(x.c))
      if (!affordable.length || !child) return false
      let pick
      if (this.profile === 'active') {
        const val = c => c.outcome === 'fetch' ? 999 : c.bond ? (c.bond[child.personality] ?? c.bond.default ?? 0) : 0
        pick = affordable.sort((a, b) => val(b.c) - val(a.c))[0]
      } else pick = affordable[Math.floor(this.rand() * affordable.length)]
      return this.do(f.childEvent.crisis ? 'child_crisis' : 'child_event', this.gs.resolveChildEvent(pick.i))
    }
    if (f.duel) return this.do('duel', this.gs.resolveDuel(this.gs.duelChance() >= 0.6 ? 'fight' : 'flee'))
    if (f.event) {
      const def = this.gs.marriageEventDef(f.event)
      const affordable = def.choices.map((c, i) => ({ c, i })).filter(x => this.s.spiritStones >= this.gs.familyCost(x.c))
      if (!affordable.length) return false
      let pick
      if (f.event.crisis) pick = affordable.find(x => x.c.outcome === 'forgive' || x.c.outcome === 'beg') || affordable[0]
      else if (this.profile === 'active') {
        const p = f.spouse.personality, val = c => c.aff ? (c.aff[p] ?? c.aff.default ?? 0) : 0
        pick = affordable.sort((a, b) => val(b.c) - val(a.c))[0]
      } else pick = affordable[Math.floor(this.rand() * affordable.length)]
      return this.do(f.event.crisis ? 'family_crisis' : 'family_event', this.gs.resolveMarriageEvent(pick.i))
    }
    // 2.6e: challenge the head for the seat when you're clearly the stronger fighter — 'active' seeks the
    // seat outright; casual/afk occasionally try their luck.
    const cc = this.gs.canChallengeHead()
    if (cc.ok) {
      const favored = cc.head.stageIndex <= this.s.stageIndex
      if (this.profile === 'active' ? favored : this.rand() < 0.01) return this.do('challenge_head', this.gs.challengeHead())
    }
    // 2.6f: branch politics. 'active' plays a branch head aggressively (declares once favored, else secedes
    // once in a while rather than wait forever); a branch member pushes rarely. Every profile occasionally
    // tries either path, enough to exercise both outcomes without every branch life turning into a war.
    const dw = this.gs.canDeclareBranchWar()
    if (dw.ok) {
      const prev = this.gs.branchWarPreview()
      const favored = prev && prev.ours >= prev.main
      if (this.profile === 'active' ? favored : this.rand() < 0.03) return this.do('declare_branch_war', this.gs.declareBranchWar())
      if (this.profile !== 'active' && this.rand() < 0.01) return this.do('secede', this.gs.secede())
    } else {
      const pw = this.gs.canPushBranchWar()
      if (pw.ok && this.rand() < (this.profile === 'active' ? 0.05 : 0.02)) return this.do('push_branch_war', this.gs.pushBranchWar())
    }
    // Phase 43b: a world-sect event waits on an answer. 'active' takes the best-odds affordable choice; the others pick
    // any affordable one at random (enough to exercise every branch, stance swings and the fail paths).
    const wse = this.gs.worldSectEventInfo?.()
    if (wse) {
      const open = wse.choices.filter(c => !c.lock)
      if (open.length) {
        const c = this.profile === 'active' ? [...open].sort((a, b) => (b.odds ?? 1) - (a.odds ?? 1))[0] : open[Math.floor(this.rand() * open.length)]
        return this.do('world_sect_event', this.gs.answerWorldSectEvent(c.i))
      }
    }
    // Phase 46 (1.20d): the sect your line founded offers a place at Core Formation. 'active' takes it (a way back
    // into its own old sect); casual/afk mostly decline — enough to exercise both paths.
    const lr = this.gs.lineageRecruitInfo?.()
    if (lr) {
      const join = this.profile === 'active' ? true : this.rand() < 0.3
      return this.do(join ? 'lineage_join' : 'lineage_decline', this.gs.answerLineageRecruit(join))
    }
    // Phase 28 4.9: Met on the road. Each profile keeps a bearing (active bold, casual courteous, afk wary; 1 in 10
    // answers is ruthless, so robbing / betrayal / feuds get exercised) and answers what its bearing marks.
    const road = this.gs.roadCards?.()
    if (road?.cards.length) {
      const want = this.profile === 'active' ? 'bold' : this.profile === 'afk' ? 'wary' : 'courteous'
      const st = this.rand() < 0.1 ? 'ruthless' : want
      if (road.stance !== st) this.gs.setRoadStance(st)
      const c = this.gs.roadCardInfo(road.cards[0].id)
      // 4.8 invitations (final QA): the bearing alone made bold/ruthless accept every one and sect-hop. Accept only
      // without a sect, or from a low rank in it, and never on the founder path once founding is within reach.
      let pre = c.pre
      if (c.kind === 'invite') pre = (!this.s.sect.id || (this.s.sect.rank || 0) < 1) && !(this.path === 'founder' && this.canFound()) ? 'accept' : 'decline'
      const a = c.answers.find(x => x.id === pre && !x.lock) || c.answers.find(x => !x.lock)
      if (a) return this.do('road_' + c.kind + '_' + a.id, this.gs.answerRoadCard(c.id, a.id))
    }
    // Encounters: a formula-carrier → help to learn it (mostly) or rob; a lover encounter → seduce 1 in 4
    // (enough to exercise affairs, discovery and every reaction branch).
    if (f.encounters?.length) {
      if (f.encounters[0].kind === 'recipe') {
        return this.rand() < 0.8 ? this.do('learn_recipe', this.gs.learnEncounterRecipe(0)) : this.do('rob_recipe', this.gs.robEncounterRecipe(0))
      }
      return this.rand() < 0.25 ? this.do('seduce', this.gs.seduceEncounter(0)) : this.do('leave_encounter', this.gs.dismissEncounter(0), false)
    }
    const prop = f.proposal
    if (!prop || f.spouse) return false
    const score = p => p.stageIndex * 100 + Math.round((p.root?.mult ?? 0) * 10)
    const best = [...prop.suitors].sort((a, b) => score(b) - score(a))[0]
    return this.do('marry', this.gs.acceptSuitor(best.id))
  }

  // ── 2.6d: between lives (called by run.js right after the step that ended a life) ──────────────────
  // Bet: 'active' bets on the strongest candidate (a reasonable read of the elders), casual/afk guess at random.
  // Rebirth: 'casual' is born an orphan 10% of the time (exercises orphan lives + returning to the last clan).
  // Self-attributing in the stone ledger: the rebirth can grant a clan stipend ('clan_stipend').
  interlude() {
    if (!this.s.interlude) return
    const before = this.s.spiritStones
    for (let i = 0; i < 3 && this.s.interlude; i++) {
      const info = this.gs.interludeInfo()
      if (info.step === 'bet') {
        const c = info.candidates
        const pick = this.profile === 'active' ? [...c].sort((a, b) => b.stageIndex - a.stageIndex)[0] : c[Math.floor(this.rand() * c.length)]
        this.do('heir_bet', this.gs.placeBet(pick.id), false)
      } else {
        // 2026-10-02: the bequest — carry arts + items into the next life (1 of each per reincarnation you are on).
        // 'active' takes the strongest (the pool is best-first); casual/afk take a seeded random subset.
        const bq = info.bequest
        if (bq && (bq.maxArts > 0 || bq.maxItems > 0)) {
          const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
          const arts = this.profile === 'active' ? bq.pool.arts : shuffle(bq.pool.arts)
          const items = this.profile === 'active' ? bq.pool.items : shuffle(bq.pool.items)
          for (const a of arts.slice(0, bq.maxArts)) this.gs.toggleBequest('arts', a.id)
          for (const x of items.slice(0, bq.maxItems)) this.gs.toggleBequest('items', x.id)
        }
        const orphan = !info.canJoinClan || (this.profile === 'casual' && this.rand() < 0.1)
        this.do('rebirth', this.gs.chooseRebirth(orphan ? 'orphan' : 'clan'), false)
      }
    }
    this.rec.stones('clan_stipend', this.s.spiritStones - before)
  }

  do(name, res, meaningful = true) {
    const ok = res === true || res?.ok === true
    if (ok) this.rec.act(name, meaningful)
    return ok
  }

  // ── Breakthrough ─────────────────────────────────────────────────────────
  tryBreakthrough() {
    const s = this.s, d = s.derived
    // The last mortal stage is a chance-based Ascension Trial, not a normal breakthrough (Phase 23C).
    if (s.stageIndex === this.D.CULTIVATION_STAGES.length - 2) return this.tryAscension()
    if (!d.canBreakthrough || s.stageIndex >= this.D.CULTIVATION_STAGES.length - 1) return false
    let chance = d.breakthroughChance, pill = null
    if (this.inv('pill_heaven_defying') && chance < 0.5) pill = 'pill_heaven_defying'
    else if (chance < 0.95) {
      pill = BT_PILLS.find(p => this.inv(p)) || null
      if (pill) chance = Math.min(0.98, chance + (this.D.ITEMS[pill].effect.value || 0))
    }
    const integ = s.realmIntegrity ?? 100
    // A failure at ≤20 integrity demotes — a sensible player calms the heart or waits for regen.
    if (integ <= 20 && pill !== 'pill_heaven_defying' && chance < 0.9) {
      if (this.inv('pill_heart_calming')) pill = 'pill_heart_calming'
      else { this.rec.waitingIntegrity = true; return false }
    }
    this.rec.waitingIntegrity = false
    this.gs.setActivePill(pill)
    // Phase 22 (22C): 'active' always "clicks within the window" — a min-maxer never misses it.
    const res = this.gs.attemptBreakthrough({ focusBonus: this.profile === 'active' })
    this.rec.breakthrough(res, chance, pill, s.stageIndex)
    return true
  }

  // ── Ascension Trial (Phase 23C) ──────────────────────────────────────────
  // Phase 47 (1.21): the Trial requires Bloodline Quality 100. Until then the only way to thicken the bloodline is
  // to end the life and reincarnate — so at the peak a greedy bot lays down the path (Pass the Mantle) and climbs again.
  // No other in-life lever raises survival chance much beyond passive Health/Integrity regen, so the attempt itself
  // stays greedy: take the gamble as soon as BQ 100 opens it.
  tryAscension() {
    const s = this.s, d = s.derived
    if (!d.canBreakthrough) return false
    if ((s.bloodlineQuality || 0) < this.D.ASCENSION_MIN_BLOODLINE) {
      this.gs.passTheMantle()
      this.rec.act('pass_mantle', true)
      return true
    }
    const res = this.gs.attemptAscension()
    this.rec.act('ascend', true)
    if (res.success) { this.rec.milestone('first_ascend_success'); this.rec.immortalGen ??= this.s.generation }   // final QA: lives to Immortality
    return true
  }

  learnTechnique() {
    const s = this.s
    const t = this.D.TECHNIQUES.filter(t => !s.techniques.includes(t.id) && t.minStage <= s.stageIndex && t.cost <= s.spiritStones)
      .sort((a, b) => a.cost - b.cost)[0]
    return t ? this.do('learn_technique', this.gs.learnTechnique(t.id)) : false
  }

  // ── Crafting / equipment / pills ─────────────────────────────────────────
  // Materials earmarked for founding / sect buildings aren't spent on optional crafts.
  reserved(id) {
    const s = this.s
    if (this.path === 'founder' && !s.ownSect.founded) return this.D.SECT_FOUNDING.items[id] || 0
    if (s.ownSect.founded) return this.D.SECT_BUILDINGS.filter(b => !s.ownSect.buildings[b.id]).reduce((a, b) => a + (b.items[id] || 0), 0)
    return 0
  }
  canCraft(r) { return !!r && (!r.hidden || this.gs.recipeKnown(r.id)) && r.ingredients.every(i => this.inv(i.itemId) - this.reserved(i.itemId) >= i.qty) }
  get ascended() { return this.s.stageIndex >= this.D.CULTIVATION_STAGES.length - 1 }
  recipe(productId) { return this.D.RECIPES.find(r => r.productId === productId) }

  craftAndEquip() {
    const { ITEMS, RECIPES } = this.D, s = this.s
    // Equip the best owned item per slot
    for (const slot of ['weapon', 'artifact']) {
      const owned = Object.keys(s.inventory).filter(id => ITEMS[id]?.type === slot)
      const best = owned.sort((a, b) => itemScore(ITEMS, b) - itemScore(ITEMS, a))[0]
      if (best && itemScore(ITEMS, best) > itemScore(ITEMS, s.equipped[slot])) return this.do('equip', this.gs.equipItem(best))
    }
    // Craft an equipment upgrade
    for (const r of RECIPES.filter(r => r.category === 'weapons' || r.category === 'artifacts')) {
      const slot = ITEMS[r.productId].type
      if (itemScore(ITEMS, r.productId) > itemScore(ITEMS, s.equipped[slot]) && !this.inv(r.productId) && this.canCraft(r))
        return this.do('craft_equipment', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    // Keep a small stock of the best breakthrough pill we can make, plus heart-calming insurance
    for (const p of this.ascended ? [] : [...BT_PILLS, 'pill_heart_calming', 'pill_heaven_defying']) {
      const r = this.recipe(p)
      const cap = p === 'pill_heart_calming' ? 2 : p === 'pill_heaven_defying' ? 1 : 3
      if (r && this.inv(p) < cap && this.canCraft(r)) return this.do('craft_pill', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    // Phase 44: a couple of healing pills on hand — a life-saving use when wounded.
    for (const p of ['pill_blood_nourish', 'pill_mending']) {
      const r = this.recipe(p)
      if (r && this.inv(p) < 2 && this.canCraft(r)) return this.do('craft_heal_pill', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    // Taming talismans when a beast is waiting and there's room — keep two, so a failed tame can still be bound (Phase 41)
    if (s.beastEncounters.length && this.talismanCount() < 2 && s.beasts.length < s.derived.maxBeasts) {
      for (const g of ['pristine', 'superior', 'fine', 'crude']) {
        const gr = this.D.TALISMAN_GRADES && this.D.TALISMAN_GRADES[g]
        const r = gr && this.recipe(gr.itemId)
        if (r && this.canCraft(r)) return this.do('craft_talisman', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
      }
    }
    return false
  }

  // Phase 41: how many taming talismans it holds, any grade.
  talismanCount() {
    const G = this.D.TALISMAN_GRADES
    if (!G) return this.inv('beast_taming_talisman')
    return this.D.TALISMAN_GRADE_ORDER.reduce((a, g) => a + this.inv(G[g].itemId), 0)
  }

  // Phase 41: the item id of the strongest taming talisman it holds (or null) — the grade a tame/bind will use.
  bestTalisman() {
    const G = this.D.TALISMAN_GRADES, O = this.D.TALISMAN_GRADE_ORDER
    if (!G || !O) return this.inv('beast_taming_talisman') ? 'beast_taming_talisman' : null
    for (let i = O.length - 1; i >= 0; i--) if (this.inv(G[O[i]].itemId)) return G[O[i]].itemId
    return null
  }

  elixirs() {
    const type = this.s.root.type
    const plan = type === 'mixed' ? ['elixir_heavenly_root', 'elixir_pure_root', 'elixir_cleansing_root']
               : type === 'dual'  ? ['elixir_heavenly_root', 'elixir_pure_root'] : []
    for (const e of plan) {
      if (this.inv(e)) return this.do('use_elixir', this.gs.useElixir(e))
      const r = this.recipe(e)
      if (this.canCraft(r)) return this.do('craft_elixir', this.gs.craftItem(r.id, { watched: this.profile === 'active' }))
    }
    return false
  }

  // Phase 44: take a healing pill when wounded (best first).
  heal() {
    if ((this.s.health ?? 100) >= 60) return false
    for (const p of ['pill_nine_turn', 'pill_golden_marrow', 'pill_soul_anchor', 'pill_blood_nourish', 'pill_mending']) {
      if (this.inv(p)) return this.do('use_heal_pill', this.gs.useHealPill(p))
    }
    return false
  }

  // ── Expeditions / beasts ─────────────────────────────────────────────────
  wanted() {
    const s = this.s, { ITEMS, RECIPES } = this.D, want = new Map()   // itemId → 'want' | 'urgent'
    const add = (id, level) => { if (want.get(id) !== 'urgent') want.set(id, level) }
    const talProducts = new Set(Object.values(this.D.TALISMAN_GRADES || {}).map(g => g.itemId))   // Phase 41
    for (const r of RECIPES) {
      const isUpgrade = (r.category === 'weapons' || r.category === 'artifacts') &&
        itemScore(ITEMS, r.productId) > itemScore(ITEMS, s.equipped[ITEMS[r.productId].type])
      const isPill = r.category === 'pills' && !this.ascended && this.inv(r.productId) < 3
      // A beast is waiting to be tamed → its talisman materials trump everything (encounters are rare).
      const urgent = talProducts.has(r.productId) && s.beastEncounters.length && s.beasts.length < s.derived.maxBeasts
      if (isUpgrade || isPill || urgent)
        r.ingredients.forEach(i => { if (this.inv(i.itemId) < i.qty) add(i.itemId, urgent ? 'urgent' : 'want') })
    }
    if (this.path === 'founder' && !s.ownSect.founded) Object.keys(this.D.SECT_FOUNDING.items).forEach(i => add(i, 'want'))
    if (s.ownSect.founded) for (const b of this.D.SECT_BUILDINGS) if (!s.ownSect.buildings[b.id]) Object.keys(b.items).forEach(i => add(i, 'want'))
    return want
  }

  dropStage(id) {
    this._dropStage ||= {}
    if (!(id in this._dropStage)) this._dropStage[id] = Math.min(...this.D.LOCATIONS.filter(l => l.dropTable.some(d => d.itemId === id)).map(l => l.minStage))
    return this._dropStage[id]
  }

  bestLocation(cycleSec) {
    const s = this.s, want = this.wanted()
    let best = null, bestScore = -1
    for (const loc of this.D.LOCATIONS.filter(l => l.minStage <= s.stageIndex)) {
      const tw = loc.dropTable.reduce((a, d) => a + d.weight, 0)
      const drops = Math.min(loc.dropTable.length, (1 + Math.min(loc.enemyTier, 3)) / 2 + 0.5)
      let v = 0
      for (const d of loc.dropTable) {
        // Rarity ≈ how late the item first drops; wanted items ×3. Stones are always useful.
        const w = want.get(d.itemId)
        const val = w === 'urgent' ? 100 : d.itemId === 'spirit_stone' ? 2 : (1 + this.dropStage(d.itemId) / 3) * (w ? 3 : 0.3)
        v += (d.weight / tw) * ((d.minQty + d.maxQty) / 2) * val
      }
      const score = v * drops / Math.max(loc.duration, cycleSec)
      if (score > bestScore) { bestScore = score; best = loc }
    }
    return best
  }

  expedition() {
    if (this.s.expedition.active) return false
    const loc = this.bestLocation(this.actEverySec)
    return loc ? this.do('expedition', this.gs.startExpedition(loc.id)) : false
  }

  beasts() {
    const s = this.s
    const enc = s.beastEncounters[0]
    // Phase 41: tame with the best grade it holds (the attempt may fail — it then fights it, or loses it)
    if (enc && (this.bestTalisman() || enc.mood === 'grateful') && s.beasts.length < s.derived.maxBeasts)
      return this.do('tame_beast', this.gs.tameEncounteredBeast(enc.id))
    // Phase 35 (A6-2): a waiting beast it can't tame is fought when the odds are good (Drive off if Slay could kill it)
    for (const e of s.beastEncounters) {
      const pv = this.gs.beastFightPreview(e.id)
      if (!pv || pv.locked || pv.chance < 0.6 || (s.health ?? 100) < 60) continue
      return this.do('beast_fight', this.gs.startBeastFight(e.id, pv.stance.slay.canDie ? 'drive' : 'slay'))
    }
    const idle = s.beasts.find(b => !b.expedition)
    if (idle) {
      const loc = this.bestLocation(this.actEverySec)
      if (loc) return this.do('beast_expedition', this.gs.sendBeastExpedition(idle.id, loc.id))
    }
    return false
  }

  // ── Phase 35 (A6-2): beast battles + the hunt (docs/systems/combat.md → "Sim bot") ──
  // A battle underway: 'active' plays the best-odds tactic and retreats a Slay it could die in; casual/afk play at random.
  // A won battle: bind it (talisman + room), else finish it.
  battle() {
    const s = this.s, fi = s.family.fight
    if (fi.over) {
      const ch = this.gs.beastFightChoices()
      const pick = !ch.bindLock ? 'bind' : ch.ids.includes('finish') ? 'finish' : 'flee'
      return this.do('beast_' + pick, this.gs.beastFightFinish(pick))
    }
    // Phase 42b: move combat. The default policy picks the move; the parry QTE lands at a per-profile rate.
    const m = fi.m
    if (m?.pending) {
      const rate = { active: 0.6, casual: 0.25 }[this.profile] ?? 0.1
      return this.do('beast_parry', this.gs.beastParry(Array.from({ length: m.pending.hits }, () => this.rand() < rate)))
    }
    if (m) {
      if (this.profile === 'active' && fi.stance === 'slay' && (s.health ?? 100) <= 20) return this.do('beast_retreat', this.gs.fightExchange('retreat'))
      const res = this.gs.beastMove(this.gs._mbPolicy(m))
      if (res?.over || res?.done) this.rec.fightLen('beast', res.turn)   // fight length (arts.md target 4–8 turns)
      return this.do('beast_move', res)
    }
    return this.do('beast_retreat', this.gs.fightExchange('retreat'))
  }

  // ── v1 add-on (docs/systems/bosses.md → "Sim bot"): legendary bosses + the soul techniques ──
  // A boss fight: parry at the profile's rate, the default policy, retreat when nearly thrown down (active only, so the
  // try still counts). A win: active takes its heart; casual/afk show mercy 1 in 3 (exercises the stronger return).
  bossBattle() {
    const s = this.s, fi = s.family.fight
    if (fi.over === 'won') {
      const pick = this.profile === 'active' ? 'heart' : this.rand() < 0.33 ? 'mercy' : 'heart'
      return this.do('boss_' + pick, this.gs.bossFightFinish(pick))
    }
    const m = fi.m
    if (m?.pending) {
      const rate = { active: 0.6, casual: 0.25 }[this.profile] ?? 0.1
      return this.do('boss_parry', this.gs.fightParry(Array.from({ length: m.pending.hits }, () => this.rand() < rate)))
    }
    if (this.profile === 'active' && (s.health ?? 100) <= 8) return this.do('boss_retreat', this.gs.fightExchange('retreat'))
    const res = this.gs.fightMove(this.gs._mbPolicy(m))
    if (res?.over || res?.done) this.rec.fightLen('boss', res.turn)
    return this.do('boss_move', res)
  }
  // Face a woken boss when healthy and the estimate is fair (active ≥ 40%, casual ≥ 50%; afk never climbs). Seed of the
  // Self: casual/active plant it once a life (the child is an heir candidate); the spouse's hurt is answered; a turning
  // mirror child is faced when favoured, else sent away (active) or yielded to. The clone: sent to the safest place it
  // can reach when Qi allows; a lingering clone is drawn back (released 1 in 10, so the world gains your other self).
  legends() {
    const s = this.s, f = s.family
    if (f.seedCrisis) return this.do('seed_crisis', this.gs.answerSeedCrisis(this.profile === 'active' ? 'reassure' : ['reassure', 'defend', 'dismiss'][Math.floor(this.rand() * 3)]))
    const mt = this.gs.mirrorTurnInfo?.()
    if (mt && !f.fight) {
      const pick = (mt.odds ?? 0) >= 0.6 ? 'face' : this.profile === 'active' ? 'send' : 'yield'
      return this.do('mirror_' + pick, this.gs.answerMirrorTurn(pick))
    }
    if (s.clone?.linger) return this.do('clone_linger', this.gs.answerCloneLinger(this.rand() < 0.1 ? 'release' : 'absorb'))
    if (this.profile === 'afk' || f.fight) return false
    const want = this.profile === 'active' ? 0.4 : 0.5
    for (const b of this.gs.bossInfo?.() || []) {
      if (b.lock || (s.health ?? 100) < this.gs.maxHealth() * 0.9) continue
      const pv = this.gs.bossFightPreview(b.id)
      if (pv && !pv.lock && pv.chance >= want) return this.do('boss_face', this.gs.startBossFight(b.id))
    }
    const si = this.gs.seedInfo?.()
    if (si && !si.lock && this.rand() < 0.5) return this.do('seed_plant', this.gs.useSeedOfSelf())
    const ci = this.gs.cloneInfo?.()
    if (ci && !ci.lock && !ci.exp && !ci.linger && ci.canPay && s.qi >= ci.qiCost * 2) {
      const place = [...ci.places].filter(p => p.shatter <= 0.1).pop() || ci.places[0]
      if (place) return this.do('clone_send', this.gs.startCloneExpedition(place.id))
    }
    return false
  }

  // A throttle that rolls at most once per check-in (the check-in loop calls every method up to 40 times).
  once(key, p) {
    this._rolled ||= {}
    if (this._rolled[key] === this._ci) return false
    this._rolled[key] = this._ci
    return this.rand() < p
  }

  // ── Phase 14 (body-constitution.md → "Sim bot"; final QA): the body ──────────────────────────────────────
  // The ordeal crisis: 'active' pays Qi when it can, endures at good odds, else eases; casual/afk answer at random.
  // A ready tier trial: the marrow way when affordable, else the bitter way while healthy ('afk' only takes the marrow).
  // Tempering: the best XP per second among open drill/spirit methods; 'active' and casual take on an ordeal now and
  // then, and casual tries the Blood Forging rarely (taint, karma). afk leans on Auto-Temper (automation()).
  // Mini-games (active + casual): a game started this check-in is finished at the next (the clock must move, or the
  // Strikes score as unplayed); Strikes hit at the profile's skill, Meridian Flow is solved from the seeded puzzle.
  body() {
    const s = this.s, gs = this.gs, b = s.body
    if (!b || s.family?.fight) return false
    const crisis = gs.crisisInfo()
    if (crisis) {
      const pick = this.profile === 'active' ? (crisis.qiOk ? 'qi' : crisis.odds.chance >= 0.6 ? 'endure' : 'ease')
        : ['endure', 'ease', crisis.qiOk ? 'qi' : 'ease'][Math.floor(this.rand() * 3)]
      return this.do('ordeal_' + pick, gs.answerOrdeal(pick))
    }
    const tr = gs.tierTrialInfo()
    if (tr.ready) {
      if (tr.marrow.ok && tr.marrow.chance >= 0.5) return this.do('body_trial_marrow', gs.attemptTierTrial('marrow'))
      if (this.profile !== 'afk' && tr.bitter.ok && (s.health ?? 100) >= gs.maxHealth() * 0.8) return this.do('body_trial_bitter', gs.attemptTierTrial('bitter'))
    }
    if (b.scars.length && gs.bodyInfo().mendHave > 0) return this.do('mend_scar', gs.mendScar(0))
    if (this.profile !== 'afk' && this.minigames()) return true
    if (b.active) return false
    const list = gs.temperingList().filter(m => m.ok)
    if (!list.length) return false
    const blood = list.find(m => m.group === 'demonic')
    if (blood && this.profile === 'casual' && this.once('blood', 0.02)) return this.do('temper_blood', gs.startTempering(blood.id))
    const ordeal = list.filter(m => m.group === 'ordeal').sort((a, b) => b.xp - a.xp)[0]
    if (ordeal && this.profile !== 'afk' && (s.health ?? 100) >= gs.maxHealth() * 0.8 && this.once('ordeal', this.profile === 'active' ? 0.02 : 0.3))
      return this.do('temper_ordeal', gs.startTempering(ordeal.id))
    const safe = list.filter(m => m.group === 'drill' || m.group === 'spirit').sort((a, b) => b.xp / b.secs - a.xp / a.secs)[0]
    if (!safe) return false
    // afk only starts one by hand while Auto-Temper is still locked (it repeats the last one once unlocked)
    if (this.profile === 'afk' && s.automation.autoTemper) return false
    return this.do('temper', gs.startTempering(safe.id))
  }
  minigames() {
    const s = this.s, gs = this.gs, M = s.minigames
    if (!M) return false
    const skill = this.profile === 'active' ? 0.6 : 0.3
    // (the check-in a game was started in is kept on the bot, never on the game's state)
    this._mg ||= {}
    if (M.strikes.session && this._mg.strikes !== this._ci) {
      const n = this.sim.ev('STRIKES.strikes')
      const hits = Array.from({ length: n }, () => { const r = this.rand(); return r < skill ? 'perfect' : r < skill + 0.3 ? 'good' : 'miss' })
      const cut = !!(s.body.active && !s.body.active.crisis && this.rand() < 0.5)
      return this.do('minigame_strikes', gs.finishMinigame('strikes', { hits, use: cut ? 'cut' : 'xp' }))
    }
    if (M.flow.session && this._mg.flow !== this._ci) {
      const ses = M.flow.session
      const p = this.sim.ev(`FlowPuzzle.generate(${ses.seed}, ${ses.n})`)
      const rot = (m, t) => this.sim.ev(`FlowPuzzle.rot(${m}, ${t})`)
      const solve = this.rand() < (this.profile === 'active' ? 0.95 : 0.8)   // now and then a player gives up on one
      if (!solve) return this.do('minigame_flow_abandon', gs.finishMinigame('flow', { abandon: true }), false)
      const rotations = p.shown.map((m, i) => [0, 1, 2, 3].find(t => rot(m, t) === p.solved[i]) ?? 0)
      return this.do('minigame_flow', gs.finishMinigame('flow', { rotations }))
    }
    if (M.strikes.session || M.flow.session) return false
    const info = gs.minigameInfo()
    const play = this.profile === 'active' ? 1 : 0.5
    if (info.flow.charges > 0 && !info.flow.tired && s.qi < s.derived.qiCap * 0.7 && this.once('flow', play)) {
      const r = gs.startMinigame('flow')
      if (r.ok) { this._mg.flow = this._ci; this.rec.act('minigame_start', false); return true }
    }
    if (info.strikes.charges > 0 && this.once('strikes', play)) {
      const r = gs.startMinigame('strikes')
      if (r.ok) { this._mg.strikes = this._ci; this.rec.act('minigame_start', false); return true }
    }
    return false
  }

  // ── Phase 43 (npc-sects.md → "Sim bot", 43g): sect politics ───────────────────────────────────────────────
  // Old guard after a takeover: 'active' wins them over when it can afford it, else lets them go; others at random.
  // Raze vow in an own war: 'active' vows when the war was provoked; casual 1 in 3 (afk relies on the standing order).
  // A joined sect's halls: the 'member' path (and any bot with a big surplus) funds the cheapest open hall.
  // The sect master (Grand Elder): petition at ≥ 50%, else challenge at ≥ 65% when they'd rarely make it lethal.
  // Relations toward other sects: a few acts per open hour, chosen by what is open and how the odds stand.
  sectPolitics() {
    const s = this.s, gs = this.gs
    const og = gs.oldGuardInfo?.()
    if (og) {
      const open = og.choices.filter(c => !c.lock)
      const pick = this.profile === 'active' ? (open.find(c => c.id === 'win') || open.find(c => c.id === 'go')) : open[Math.floor(this.rand() * open.length)]
      return this.do('old_guard_' + pick.id, gs.answerOldGuard(pick.id))
    }
    const rz = gs.razeInfo?.()
    if (rz?.ok && !rz.byHand && this.profile !== 'afk') {
      const vow = this.profile === 'active' ? rz.provoked : this.rand() < 0.33
      return this.do(vow ? 'raze_vow' : 'raze_spare', gs.setRazeVow(vow), vow)
    }
    if (s.family?.fight) return false
    if (s.sect.id && !s.ownSect.founded) {
      const rich = this.path === 'member' ? 600 : 3 * this.D.SECT_FOUNDING.stones + 1000
      if (s.spiritStones > rich && this.once('fund', this.profile === 'active' ? 0.05 : 0.5)) {
        const h = (gs.sectBlessingInfo()?.halls || []).filter(x => !x.lock && x.cost != null && x.cost <= s.spiritStones - rich / 2).sort((a, b) => a.cost - b.cost)[0]
        if (h) return this.do('fund_sect_hall', gs.fundSectHall(h.id))
      }
      const mi = gs.sectMasterInfo?.()
      if (mi?.grand && this.once('master', this.profile === 'active' ? 0.02 : this.profile === 'casual' ? 0.2 : 0.05)) {
        if (mi.petition.ok && mi.petition.odds >= 0.5) return this.do('petition_master', gs.petitionSectMaster())
        if (mi.challenge.ok && mi.challenge.odds >= 0.65 && mi.challenge.lethalPct <= 40 && (s.health ?? 100) >= gs.maxHealth() * 0.9)
          return this.do('challenge_master', gs.challengeSectMaster())
        if (this.profile !== 'active' && mi.petition.ok && this.rand() < 0.2) return this.do('petition_master', gs.petitionSectMaster())
      }
    }
    if (!(s.ownSect.founded || s.sect.id) || !this.once('relations', this.profile === 'active' ? 0.01 : this.profile === 'casual' ? 0.25 : 0.05)) return false
    const rows = (gs.worldSectsInfo()?.rows || []).filter(r => !r.own)
    if (!rows.length) return false
    const rec = rows[Math.floor(this.rand() * rows.length)]
    const info = gs.sectRelationsInfo(rec.id)
    if (!info || info.isMine) return false
    const open = id => info.actions.find(a => a.id === id && !a.lock)
    const r = this.rand()
    if (info.role === 'leader') {
      const trade = open('trade')
      if (trade && !trade.offer?.known) {
        const give = trade.yours.filter(y => y.ok && this.s.arts?.known?.[y.id]).sort((a, b) => this.D.ART_RARITY_ORDER.indexOf(a.rarity) - this.D.ART_RARITY_ORDER.indexOf(b.rarity))[0]
        if (give) return this.do('sect_trade', gs.sectAct(rec.id, 'trade', give.id))
      }
      const al = open('alliance')
      if (al && al.odds >= 0.5) return this.do('sect_alliance', gs.sectAct(rec.id, 'alliance'))
      const war = open('war')
      if (war && this.profile === 'active' && info.ratio <= 0.7 && info.sect.stance < 0 && r < 0.3) return this.do('sect_declare_war', gs.sectAct(rec.id, 'war'))
      const tr = open('tribute')
      if (tr && tr.odds >= 0.7 && r < 0.3) return this.do('sect_tribute', gs.sectAct(rec.id, 'tribute'))
      const spy = open('spy')
      if (spy && spy.odds >= 0.6 && r < 0.2) return this.do('sect_spy', gs.sectAct(rec.id, 'spy'))
      if (open('poach') && r < 0.4) {
        const d = (gs.poachRoster(rec.id)?.list || []).filter(x => !x.lock && x.odds >= 0.5 && x.cost <= s.spiritStones * 0.2).sort((a, b) => b.talent - a.talent)[0]
        if (d) return this.do('sect_poach', gs.poachDisciple(rec.id, d.id))
      }
    } else if (info.role === 'member') {
      const sp = open('spar')
      if (sp && sp.odds >= 0.6 && (s.health ?? 100) >= gs.maxHealth() * 0.8) return this.do('sect_spar', gs.sectAct(rec.id, 'spar'))
      const ur = open('urge')
      if (ur && ur.odds >= 0.5 && info.sect.stance < -20 && r < 0.3) return this.do('sect_urge', gs.sectAct(rec.id, 'urge'))
    }
    const gift = open('gift')
    if (gift && info.sect.stance < 20 && s.spiritStones >= gift.cost * 10) return this.do('sect_gift', gs.sectAct(rec.id, 'gift'))
    return false
  }

  // ── Phase 28 4.10 (living-world.md → "Sim bot"; final QA): the person card's deeds ────────────────────────
  // A few times per open hour it looks at someone it knows and does the first deed that fits: swear brotherhood with
  // someone who holds it dear, invite a fit recruit, teach someone far below, court when single, spar at good odds,
  // gift the cool, duel a sworn foe only when heavily favoured ('active'), denounce a true villain.
  deeds() {
    const s = this.s, gs = this.gs
    if (s.family?.fight || !gs.knownPeople || !this.once('deeds', this.profile === 'active' ? 0.01 : this.profile === 'casual' ? 0.25 : 0.04)) return false
    const rows = gs.knownPeople({ filter: 'all', sort: 'relevance', limit: 30 }).rows.filter(x => x.alive)
    if (!rows.length) return false
    const pid = rows[Math.floor(this.rand() * rows.length)].pid
    const info = gs.personActions(pid)
    if (!info || info.gone || info.cd) return false
    const p = s.world.persons[pid], rel = p?.rel || 0
    const act = id => info.acts.find(a => a.id === id && !a.lock)
    const healthy = (s.health ?? 100) >= gs.maxHealth() * 0.8
    const tries = [
      ['swear', a => a.chance >= 40],
      ['recruit', a => a.chance >= 40],
      ['mentor', () => true],
      ['court', () => this.profile !== 'afk' && this.rand() < 0.3],
      ['duel', a => this.profile === 'active' && healthy && a.odds >= 85],
      ['denounce', () => (p?.morality ?? 0) <= -2 && this.rand() < 0.3],
      ['spar', a => healthy && a.odds >= 60],
      ['gift', a => rel < 30 && s.spiritStones >= a.cost * 10],
    ]
    for (const [id, ok] of tries) {
      const a = act(id)
      if (a && ok(a)) return this.do('deed_' + id, gs.personAct(pid, id))
    }
    return false
  }

  // ── Phase 28 4.8 (living-world.md → "Sim bot"; final QA): the Heavenly Rankings ───────────────────────────
  // The Class duel: call out the classmate just above when the odds are fair (active ≥ 55%, casual ≥ 65%).
  // The Veil: 'afk' (wary) veils its name once genius hunters have come; the others stay public.
  ranks() {
    const s = this.s, gs = this.gs
    if (!gs.rankingsInfo || s.family?.fight) return false
    if (this.profile === 'afk') {
      const st = gs.rankStats()
      if (st && !st.veil && (st.hunters || 0) > 0) return this.do('rank_veil', gs.setRankVeil(true), false)
      return false
    }
    if (!this.once('rankduel', this.profile === 'active' ? 0.02 : 0.5)) return false
    const d = gs.rankingsInfo('class')?.rows?.find(x => x.duel)?.duel
    if (d && !d.lock && d.odds >= (this.profile === 'active' ? 55 : 65) && (s.health ?? 100) >= gs.maxHealth() * 0.8)
      return this.do('rank_duel', gs.challengeRanked(d.pid))
    return false
  }

  // Hunt when idle, healthy and no beast is waiting: the deepest open ground whose cost is under a fifth of its stones.
  hunt() {
    const s = this.s
    if (s.hunt || s.family?.fight || s.beastEncounters.length || (s.health ?? 100) < 70) return false
    const g = this.gs.huntInfo().grounds.filter(x => !x.lock && (x.cost || 0) <= s.spiritStones * 0.2).pop()
    return g ? this.do('hunt', this.gs.startHunt(g.id)) : false
  }

  // A6-3b the Arena ('afk' never enters). Call-outs: answer when favoured. A run: fight the best-odds opponent while
  // healthy, walk away at a streak target (active 4, casual 2) or when nothing good is left. Blood only when heavily
  // favoured ('active', ≥ 95%). Starts a run in the deepest open ring with a ≥ 60% opponent when healthy and flush.
  arena() {
    const s = this.s
    if (this.profile === 'afk' || !s.arena || s.family?.fight) return false
    const info = this.gs.arenaInfo()
    if (info.callout) {
      const odds = this.gs.personFightOdds(info.callout.p, 'arena').chance
      const yes = odds >= (info.callout.blood ? 0.75 : 0.55) && (s.health ?? 100) >= 60
      return this.do('arena_callout_' + (yes ? 'accept' : 'decline'), this.gs.answerArenaCallout(yes))
    }
    const pickIn = (R, min) => (R?.rows || []).filter(r => !r.lock && r.odds >= min).sort((a, b) => b.odds - a.odds)[0]
    if (info.run) {
      const R = info.rings.find(r => r.id === info.run.ringId)
      const target = this.profile === 'active' ? 4 : 2
      const next = pickIn(R, this.profile === 'active' ? 0.55 : 0.6)
      if (info.run.streak >= target || !next || (s.health ?? 100) < info.minHealth + 15) return this.do('arena_walk', this.gs.arenaWalkAway())
      const blood = this.profile === 'active' && !next.bloodLock && next.odds >= 0.95
      return this.do('arena_bout', this.gs.startArenaBout(R.id, next.id, blood))
    }
    if ((s.health ?? 100) < 80) return false
    for (const R of [...info.rings].reverse()) {
      if (!R.open || s.spiritStones < R.entry * 5) continue
      const r = pickIn(R, 0.6)
      if (r) return this.do('arena_bout', this.gs.startArenaBout(R.id, r.id, this.profile === 'active' && !r.bloodLock && r.odds >= 0.95))
    }
    return false
  }

  // ── Joined sect ──────────────────────────────────────────────────────────
  sect() {
    const s = this.s, D = this.D
    if (!s.sect.id) {
      if (s.ownSect.founded || s.stageIndex < 3) return false
      if (this.path === 'founder' && this.canFound()) return false
      const def = D.SECTS.filter(x => x.minStage <= s.stageIndex).sort((a, b) => b.minStage - a.minStage)[0]
      return def ? this.do('join_sect', this.gs.joinSect(def.id)) : false
    }
    if (this.path === 'founder' && this.canFound()) return this.do('leave_sect', this.gs.leaveSect())
    if (D.SECT_RANKS[s.sect.rank + 1] && s.sect.contribution >= D.SECT_RANKS[s.sect.rank + 1].minContribution)
      return this.do('sect_rank_up', this.gs.rankUpSect())
    if (s.sect.activeMissions.length < D.SECT_MAX_MISSIONS) {
      const m = D.SECT_MISSIONS.filter(m => m.minRank <= s.sect.rank && !s.sect.activeMissions.some(a => a.missionId === m.id))
        .sort((a, b) => b.contribution / Math.max(b.duration, this.actEverySec) - a.contribution / Math.max(a.duration, this.actEverySec))[0]
      if (m) return this.do('sect_mission', this.gs.startSectMission(m.id))
    }
    if (this.path === 'member' && s.spiritStones > 400) return this.do('sect_donate', this.gs.donateToSect(s.spiritStones - 300))
    return false
  }

  // ── Member war (Phase 5C): answer the call, lend a beast, fill the war chest when comfortably affordable ──
  // Manual actions here are 'active'-only (Phase 32) — casual/afk rely entirely on warOrders() above,
  // by design, so the sim actually exercises the "never punish absence" path instead of masking it
  // with a bot that still clicks every button on its own.
  memberWar() {
    const s = this.s, w = s.sectWar, D = this.D
    if (w.side !== 'member' || (w.phase !== 'scouting' && w.phase !== 'preparing')) return false
    this.rec.warSeen(w)
    if (this.profile !== 'active') return false
    if (!w.answered && s.sect.activeMissions.length < D.SECT_MAX_MISSIONS) return this.do('war_answer_call', this.gs.answerWarCall())
    if (!w.beastId) {
      const b = s.beasts.filter(b => !b.expedition).sort((a, b) => b.level - a.level)[0]
      if (b) return this.do('war_beast', this.gs.sendBeastToWar(b.id))
    }
    const full = this.gs.memberWarChestFull(), left = full - w.chestStones
    const chunk = Math.min(left, Math.max(10, Math.ceil(full / 4)))
    if (left > 0 && s.spiritStones >= 3 * chunk) return this.do('war_chest', this.gs.donateWarChest(chunk))
    // Pills only once they're no longer needed for breakthroughs
    if (this.ascended && w.pillsGiven < D.MEMBER_WAR_MAX_PILLS) {
      const p = Object.keys(s.inventory).find(id => D.ITEMS[id]?.type === 'pill')
      if (p) return this.do('war_pill', this.gs.offerWarPill(p))
    }
    return false
  }

  // ── Own sect ─────────────────────────────────────────────────────────────
  canFound() {
    const s = this.s, F = this.D.SECT_FOUNDING
    return !s.ownSect.founded && s.stageIndex >= F.minStage && s.spiritStones >= F.stones &&
      Object.entries(F.items).every(([id, q]) => this.inv(id) >= q)
  }

  ownSect() {
    const s = this.s, o = s.ownSect, D = this.D
    if (!o.founded) return this.path === 'founder' && this.canFound() && !s.sect.id ? this.do('found_sect', this.gs.foundOwnSect('Sim Sect')) : false
    const cand = [...o.recruitPool].sort((a, b) => b.talent - a.talent)
      .find(c => D.DISCIPLE_RECRUIT_COST * c.talent * c.talent <= s.spiritStones)
    if (cand && o.disciples.length < s.derived.discipleCap) return this.do('recruit_disciple', this.gs.recruitDisciple(cand.id))
    if (o.disciples.length >= s.derived.discipleCap) {
      const cost = D.SECT_HALL_LEVELS[o.hallLevel - 1]?.upgradeStones
      if (cost != null && s.spiritStones >= cost) return this.do('upgrade_hall', this.gs.upgradeSectHall())
    }
    const b = D.SECT_BUILDINGS.filter(b => !o.buildings[b.id] && b.stones <= s.spiritStones &&
      Object.entries(b.items).every(([id, q]) => this.inv(id) >= q)).sort((a, b) => a.stones - b.stones)[0]
    if (b) return this.do('build', this.gs.buildSectBuilding(b.id))
    // Phase 43: once every hall is raised, deepen the cheapest one it can afford (keep a reserve for recruits).
    const up = D.SECT_BUILDINGS.map(x => ({ id: x.id, lvl: o.buildings[x.id] || 0, stones: x.stones }))
      .filter(x => x.lvl > 0 && x.lvl < D.SECT_BUILDING_MAX_LEVEL)
      .map(x => ({ id: x.id, cost: Math.round(x.stones * Math.pow(D.SECT_BUILDING_UPGRADE_MULT, x.lvl)) }))
      .filter(x => x.cost <= s.spiritStones / 2).sort((a, b) => a.cost - b.cost)[0]
    return up ? this.do('upgrade_building', this.gs.upgradeSectBuilding(up.id)) : false
  }

  war() {
    const s = this.s, w = s.sectWar
    if (!s.ownSect.founded || (w.phase !== 'scouting' && w.phase !== 'preparing')) return false
    this.rec.warSeen(w)
    if (this.profile !== 'active') return false
    // Buy war boosts only when comfortably affordable (≥ 3× cost) — mirrors game-state.js cost formulas.
    const fame = s.derived.sectFame || 0, D = this.D
    const allyCost = Math.round(D.WAR_ALLY_COST_BASE + fame * D.WAR_ALLY_COST_PER_FAME)
    const reinforceCost = Math.round(Math.max(20, fame * D.WAR_REINFORCE_COST_PER_FAME))
    if (!w.allyId && s.spiritStones >= 3 * allyCost) {
      const r = this.gs.requestWarAlly(D.SECTS[0].id)
      if (r.ok) return this.do('war_ally', r)
    }
    if (w.phase === 'preparing' && !w.reinforced && s.spiritStones >= 3 * reinforceCost) return this.do('war_reinforce', this.gs.reinforceForWar())
    return false
  }
}

module.exports = { Bot }
