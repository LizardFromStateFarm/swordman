// Shared, DOM-free person/root/personality generators for M2 Life Loop (Phase 30/31, task 2.2).
// Global `Persons` object — MUST use Math.random() (sim determinism: the sim swaps Math.random for a
// seeded RNG before any of this runs). Load order: after assets/data/* (needs names.js/personalities.js),
// before game-state.js — see index.html and scripts/sim/loader.js LOGIC_FILES.
//
// GameState._rollRoot/_rollSpecificRoot/_rollPersonality delegate to these one-for-one (identical draws,
// same call order) so `_newGame()`'s Math.random() sequence is unchanged — see docs/systems/life-loop.md §10.
//
// Person schema (life-loop.md §2.4). NOTE: `s.self` (the player's own record) does NOT fill root/
// personality/stageIndex/maxStage — those stay live on s.root/s.personality/s.stageIndex and are only
// snapshotted into a full Person by _endLife() (task 2.6). Persons.make() always fills every schema key
// with a safe default so the shape is uniform for every OTHER role (spouse/child/cousin/new_soul/ancestor).

const Persons = {
  rollRoot() {
    const roll     = Math.random()
    const elements = ['fire', 'water', 'earth', 'wood', 'metal']
    const rnd      = () => elements[Math.floor(Math.random() * elements.length)]
    if (roll < 0.01) return { type: 'heavenly', name: '天灵根 Heavenly Root', mult: 3.0 }   // cjk-ok: root name data; UI strips it with latinOnly()
    if (roll < 0.05) return { type: 'pure',     name: `纯灵根 Pure ${rnd()} Root`, mult: 1.8 }   // cjk-ok: root name data; UI strips it with latinOnly()
    if (roll < 0.25) return { type: 'dual',     name: '双灵根 Dual Root', mult: 1.4 }   // cjk-ok: root name data; UI strips it with latinOnly()
    return                   { type: 'mixed',   name: '杂灵根 Mixed Root', mult: 1.0 }   // cjk-ok: root name data; UI strips it with latinOnly()
  },

  specificRoot(type) {
    const elements = ['fire', 'water', 'earth', 'wood', 'metal']
    const rnd = () => elements[Math.floor(Math.random() * elements.length)]
    switch (type) {
      case 'heavenly': return { type: 'heavenly', name: '天灵根 Heavenly Root', mult: 3.0 }   // cjk-ok: root name data; UI strips it with latinOnly()
      case 'pure':     return { type: 'pure',     name: `纯灵根 Pure ${rnd()} Root`, mult: 1.8 }   // cjk-ok: root name data; UI strips it with latinOnly()
      case 'dual':     return { type: 'dual',     name: '双灵根 Dual Root', mult: 1.4 }   // cjk-ok: root name data; UI strips it with latinOnly()
      default:         return { type: 'mixed',    name: '杂灵根 Mixed Root', mult: 1.0 }   // cjk-ok: root name data; UI strips it with latinOnly()
    }
  },

  // 16C rule (task 2.5+): 40% chance of each parent's root type, 20% chance of a fresh roll — keeps the
  // element flavor text fresh (blendRoot never reuses a parent's `name` string verbatim for pure roots).
  blendRoot(a, b) {
    const roll = Math.random()
    if (roll < 0.4) return this.specificRoot(a.type)
    if (roll < 0.8) return this.specificRoot(b.type)
    return this.rollRoot()
  },

  // Phase 42 (arts.md): a root's elements, for root affinity + the starter art. No Math.random (sim seeds stay put):
  // pure → the element in its name; heavenly → all five; dual → 2 and mixed → 3, picked by a hash of `seed`.
  rootElements(root, seed = '') {
    const ALL = ['metal', 'wood', 'water', 'fire', 'earth']
    if (Array.isArray(root?.elements)) return root.elements
    if (root?.type === 'heavenly') return [...ALL]
    const named = ALL.find(e => new RegExp('\\b' + e + '\\b', 'i').test(root?.name || ''))
    if (root?.type === 'pure' && named) return [named]
    let h = 2166136261
    for (const ch of `${seed}|${root?.type}|${root?.name}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    const order = [...ALL].sort((a, b) => ((Math.imul(h, a.charCodeAt(0) * 31 + a.length) >>> 0) % 997) - ((Math.imul(h, b.charCodeAt(0) * 31 + b.length) >>> 0) % 997))
    return order.slice(0, root?.type === 'dual' ? 2 : root?.type === 'pure' ? 1 : 3)
  },

  rollPersonality() {
    return PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].id
  },

  rollGiven()   { return GIVEN_NAMES[Math.floor(Math.random() * GIVEN_NAMES.length)] },
  rollSurname() { return SURNAMES[Math.floor(Math.random() * SURNAMES.length)] },

  // Fills every Person schema key (life-loop.md §2.4) with a safe default, then overrides with `fields`.
  // Callers pass `id` explicitly (GameState owns id assignment via clan.nextId, see _newPersonId()).
  make(fields = {}) {
    return {
      v:          2,
      id:         fields.id ?? null,
      given:      fields.given ?? '',
      family:     fields.family ?? '',
      bornYear:   fields.bornYear ?? 0,
      root:       fields.root ?? null,
      personality:fields.personality ?? null,
      stageIndex: fields.stageIndex ?? 0,
      maxStage:   fields.maxStage ?? 0,
      bodyTier:   fields.bodyTier ?? 0,       // Phase 14 (body-constitution.md): 0 = F … 6 = S
      alive:      fields.alive ?? true,
      diedYear:   fields.diedYear ?? null,
      cause:      fields.cause ?? null,
      role:       fields.role ?? 'new_soul',
      parents:    fields.parents ?? [],
      spouseIds:  fields.spouseIds ?? [],
      ...Persons.v2Defaults(fields),
    }
  },

  // Phase 28 (living-world.md §4): the living-world keys every person carries. A record missing any of them is
  // filled by stampV2 (migration) — existing keys are never overwritten.
  v2Defaults(f = {}) {
    return {
      gender:  f.gender ?? null,          // filled by Phase 36 (crates/courtship); null = unspecified
      sectId:  f.sectId ?? null,          // a world-sect record id, 'own' (your founded sect) or null
      sectRole:f.sectRole ?? null,        // 'master' | 'elder' | 'disciple' | null
      cohort:  f.cohort ?? null,          // 4.3: the life they awakened with, or an awakening wave
      tier:    f.tier ?? 'light',         // 4.4/4.5: 'heavy' | 'light'
      fam:     f.fam ?? 0,                // familiarity: how often the player has seen the name
      pin:     f.pin ?? false,
      rel:     f.rel ?? 0,                // toward the player, −100..100 (4.10)
      mem:     f.mem ?? [],               // [{ y, k, w }] ≤ 6 (4.10)
      ties:    f.ties ?? {},              // { [pid]: −100..100 } (4.4)
      owner:   f.owner ?? 'world',        // who runs their relationship state: 'world' | 'family' | 'arena' | 'sect'
    }
  },
  stampV2(p) {
    if (!p) return p
    const d = Persons.v2Defaults()
    for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k]
    p.v = Math.max(p.v || 1, 2)
    return p
  },

  // Display name: 'Lin Mei', or just 'Mei' while the clan has no surname yet (clan.name is '' until 2.6).
  fullName(p) { return p ? (p.family ? `${p.family} ${p.given}` : p.given) : '' },

  // 28J extends this (encounter/ranking power). p.root may be null (e.g. `s.self`, which reads root live
  // off s.root instead) — treat that as 0 root bonus rather than throwing.
  powerScore(p) {
    const body = typeof BODY_TIERS !== "undefined" ? (BODY_TIERS[p.bodyTier || 0]?.power || 0) : 0   // Phase 14
    return p.stageIndex * 100 + Math.round((p.root?.mult ?? 0) * 10) + body
  },
}
