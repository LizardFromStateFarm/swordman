// Phase 31 (M2 task 2.7): Ancestral Merit sources, clan firsts, legacies, catch-up, Ancestor Blessing, epitaphs.
// Data only. Numbers per docs/systems/life-loop.md §3.2; state shape + hooks per clan-succession.md §2.7 (Merit/
// firsts/legacies/bestStageIndex live on the real per-world Clan object, not a standalone s.clan).
// Used by: game-state.js (_claimFirst, _recordLifeInWorld merit credit, buyLegacy/setFamilyManual, _recalc catch-up
// + Ancestor Blessing, attemptAscension), game.js (Ancestral Hall overlay), scripts/sim/*.
// sect_continuity (life-loop.md draft) is cut — the 2.6d reign sim already hands a founded sect to the heir for
// free. longevity_blood was already cut when age stopped being able to kill (life-loop.md §15).

// ── Ancestral Merit (31C) ─────────────────────────────────────────────────────
const MERIT_STAGE          = 40    // stage term: MERIT_STAGE × (maxStage / 22)²
const MERIT_DEED_WAR_WON   = 3     // per sect-war victory (own + member), this life
const MERIT_DEED_BEAST     = 2     // per beast owned at death
const MERIT_DEED_DISCIPLE  = 1     // per own-sect disciple at death
const MERIT_DEED_CAP       = 30    // deeds total, capped per life (stage term + firsts are uncapped)

// ── Ancestral catch-up (31E) — below clan.bestStageIndex only ────────────────
const CATCHUP_QPS_MULT     = 2.5
const CATCHUP_BT_BONUS     = 0.10  // added before the existing 0.98 breakthrough-chance cap
const CATCHUP_AUTO_BT      = true  // base mechanic, not gated by Phase 22's automation unlocks

// ── Ancestor Blessing (31F — one stack per Ascended Ancestor from this clan) ──
const ANCESTOR_BLESSING_QPS     = 0.05   // +5% Qi/s per stack, unconditional (not catch-up-gated)
const ANCESTOR_BLESSING_QPS_MAX = 3      // stacks cap at 3

// Realm name (stages.js CULTIVATION_STAGES[i].realm) → the CLAN_FIRSTS id claimed on first entering it.
// Mortal has no first (everyone starts there).
const REALM_FIRST_ID = {
  'Qi Condensation': 'realm_qi', 'Foundation Building': 'realm_fb', 'Core Formation': 'realm_cf',
  'Nascent Soul': 'realm_ns', 'Spirit Severing': 'realm_ss',
}

// ── Clan firsts (each pays once per CLAN — see clan-succession.md §2.7 "per-clan, not per-world") ─
const CLAN_FIRSTS = {
  realm_qi:      { label: 'First to reach Qi Condensation',   merit: 5 },
  realm_fb:      { label: 'First to reach Foundation Building', merit: 10 },
  realm_cf:      { label: 'First to reach Core Formation',    merit: 20 },
  realm_ns:      { label: 'First to reach Nascent Soul',      merit: 35 },
  realm_ss:      { label: 'First to reach Spirit Severing',   merit: 50 },
  asc_attempt:   { label: 'First to attempt Ascension',       merit: 40 },
  ascended:      { label: 'First to survive Ascension',       merit: 150 },
  joined_sect:   { label: 'First to join a sect',              merit: 5 },
  founded_sect:  { label: 'First to found a sect',              merit: 20 },
  first_beast:   { label: 'First to tame a spirit beast',      merit: 10 },
  war_won:       { label: 'First war won',                     merit: 15 },
  married:       { label: 'First marriage',                    merit: 10 },
  first_child:   { label: 'First child born',                  merit: 5 },
}

// ── Clan legacies (bought from Ancestral Merit, any time, in the Ancestral Hall) ──
// levels: [{cost, value}], cost is cumulative Merit spent to reach that level (buyLegacy charges the delta).
const CLAN_LEGACIES = {
  ancestral_stipend: {
    group: 'Heritage', name: 'Ancestral Stipend', nameCN: '祖产',
    desc: 'The heir starts life with more spirit stones.',
    levels: [{ cost: 15, value: 50 }, { cost: 40, value: 150 }, { cost: 90, value: 400 }],
  },
  heirloom: {
    group: 'Heritage', name: 'Heirloom', nameCN: '传家宝',
    desc: 'Equipped items pass to the heir instead of being lost.',
    levels: [{ cost: 40, value: 1 }, { cost: 100, value: 2 }],   // value = number of equip slots carried
  },
  family_manual: {
    group: 'Heritage', name: 'Family Manual', nameCN: '家传功法',
    desc: 'Pick one technique the clan has learned; the heir learns it free once eligible.',
    levels: [{ cost: 30, value: 3 }, { cost: 60, value: 7 }, { cost: 120, value: 99 }],   // value = max technique minStage tier allowed
  },
  beast_lineage: {
    group: 'Heritage', name: 'Beast Lineage', nameCN: '灵兽血脉',
    desc: 'The offspring of your strongest tamed beast joins the heir.',
    requires: 'first_beast',
    levels: [{ cost: 60, value: 1 }],
  },
  refined_meridians: {
    group: 'Blood', name: 'Refined Meridians', nameCN: '洗髓',
    desc: 'Every generation cultivates a little faster, permanently.',
    levels: [{ cost: 30, value: 0.03 }, { cost: 70, value: 0.06 }, { cost: 150, value: 0.09 }],   // value = Qi/s %
  },
}

// ── Epitaphs (Ancestral Hall family tree; ≥3 per cause, {name}/{realm}/{age} tokens) ──
const EPITAPHS = {
  expedition: [
    '{name}, who fell far from home chasing one more vein of Qi.',
    '{name}, who never returned from beyond the last marker on the map.',
    '{name}, whose bones the mountain kept.',
  ],
  sect_war: [
    '{name}, who died defending a mountain gate not their own to abandon.',
    '{name}, fallen banner in hand, at {age}.',
  ],
  event: [
    '{name}, claimed by a cultivation mishap at {realm}.',
    '{name}, who reached too far, too fast.',
  ],
  ascension_failed: [
    '{name}, who broke {realm} at {age} and reached for the heavens — and fell.',
    '{name}, whose Ascension Trial the heavens refused.',
  ],
  passed_mantle: [
    '{name}, who laid down the path at {realm}, {age} years old, and let the next generation walk it.',
    '{name}, who chose to stop while still standing.',
  ],
  spouse_duel: [
    '{name}, slain by the one they married.',
    '{name}, who lost a duel no outsider ever heard of.',
  ],
  challenge_lost: [
    '{name}, who reached for the head seat and was cut down reaching.',
    '{name}, buried the day they challenged for the clan.',
  ],
  challenged: [
    '{name}, who held the head seat until someone younger wanted it more.',
    '{name}, the clan head who did not see the blow coming.',
  ],
  stepdown_tournament: [
    '{name}, who fell in the tournament that was meant to crown someone else.',
    '{name}, one of the names the succession tournament did not spare.',
  ],
  branch_war: [
    '{name}, who led their branch to war and did not lead it home.',
    '{name}, fallen at the head of a branch that would not bend.',
  ],
  ascended: [
    '{name}, who broke {realm} at {age} and rose to the Immortal Realms — an Ascended Ancestor now watches over the clan.',
    '{name}, the {clan} clan’s first to leave the mortal world behind, and not by dying.',
    '{name}, who walked the last mortal step at {age} and did not come back down the mountain.',
  ],
}
