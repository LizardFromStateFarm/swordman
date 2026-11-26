// Progressive disclosure (Phase 50, docs/systems/unlocks.md) — decides which nav views a save may see.
// Data: assets/data/unlocks.js (UNLOCK_GROUPS / UNLOCK_VIEWS / UNLOCK_RULES). DOM-free, so the sim/checks
// can load it too. A view is offered when ANY condition on its rule passes; existing state (in a sect, a
// family) always re-opens a gate, so old saves and scripted tests are never blinded.

function _unlockHasFamily(s) {
  const f = s && s.family
  if (!f) return false
  return !!(f.proposal || f.spouse || f.childWish || f.tournament ||
    (f.children && f.children.length) || (f.lovers && f.lovers.length))
}

function _unlockMatch(rule, s) {
  if (!rule || rule.always) return true
  if (!s) return false
  if (rule.awaken && s.awakened) return true
  if (rule.stage != null && (s.stageIndex || 0) >= rule.stage) return true
  if (rule.anySect && ((s.sect && s.sect.id) || (s.ownSect && s.ownSect.founded))) return true
  if (rule.founded && s.ownSect && s.ownSect.founded) return true
  if (rule.family && _unlockHasFamily(s)) return true
  return false
}

function viewUnlocked(view, s) {
  if (typeof UNLOCK_RULES === 'undefined') return true
  return _unlockMatch(UNLOCK_RULES[view] || { always: true }, s)
}

// Every view the save may open, in UNLOCK_VIEWS order. Pass a view list to test an arbitrary set
// (the sim's NAV_GROUPS is not loaded in the headless harness).
function availableViews(s, views) {
  const list = (views && views.length) ? views
    : (typeof UNLOCK_VIEWS !== 'undefined' ? UNLOCK_VIEWS.map(v => v.view) : [])
  return list.filter(v => viewUnlocked(v, s))
}

function _stageUnlockLabel(n) {
  if (typeof CULTIVATION_STAGES === 'undefined' || !CULTIVATION_STAGES[n]) return `At stage ${n}`
  const st = CULTIVATION_STAGES[n]
  if (st.realm === 'Qi Condensation') return `At Qi Condensation · Layer ${n}`
  return `At ${st.realm} · ${st.layer}`
}

// Why a view is still closed, in the player's words (the Guide's "Still locked" list).
function unlockReason(view) {
  const rule = (typeof UNLOCK_RULES !== 'undefined' && UNLOCK_RULES[view]) || { always: true }
  if (rule.always) return 'Open from the start'
  if (rule.awaken) return 'When you Awaken'
  if (rule.stage != null) return _stageUnlockLabel(rule.stage)
  if (rule.anySect) return 'After you join or found a sect'
  if (rule.founded) return 'After you found a sect'
  if (rule.family) return 'When you have a family'
  return 'Not open yet'
}

// Human-readable "why" for a whole nav group still closed: its soonest gate.
const _UNLOCK_RANK = { always: 0, awaken: 1, stage: 2, anySect: 3, founded: 4, family: 5 }
function _unlockOrder(view) {
  const rule = (typeof UNLOCK_RULES !== 'undefined' && UNLOCK_RULES[view]) || { always: true }
  if (rule.always) return [0, 0]
  if (rule.awaken) return [1, 0]
  if (rule.stage != null) return [2, rule.stage]
  if (rule.anySect) return [3, 0]
  if (rule.founded) return [4, 0]
  if (rule.family) return [5, 0]
  return [9, 0]
}

// The groups with no view open yet, each with the reason for its soonest view.
function lockedGroups(s) {
  if (typeof UNLOCK_GROUPS === 'undefined' || typeof UNLOCK_VIEWS === 'undefined') return []
  return UNLOCK_GROUPS.map(g => {
    const views = UNLOCK_VIEWS.filter(v => v.group === g.id)
    if (!views.length || views.some(v => viewUnlocked(v.view, s))) return null
    let soonest = views[0]
    for (const v of views) {
      const a = _unlockOrder(v.view), b = _unlockOrder(soonest.view)
      if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) soonest = v
    }
    return { group: g.id, name: g.name, reason: unlockReason(soonest.view) }
  }).filter(Boolean)
}
