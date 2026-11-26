# Deep Sect Management — M5 (Phase 27)

_Last updated: 2026-11-26 · Data: `assets/data/sect-management.js` · Engine: `renderer/engine/game-state.js` · UI: Sect → Disciples._

Runs a founded sect with **offices**, a **recruitment policy**, **promotions**, and a **sect tier** that grows
with fame. Loyalty never decays on its own — only a direct wrong (losing an office) can sour a disciple.

## State

`s.ownSect` gains:
| Field | Meaning |
|---|---|
| `offices = { steward, trainer, warden, recruiter }` | office id → disciple id (or absent = vacant). |
| `policy = { strictness, minTalent, autoRecruit }` | the gate's standing orders. |
| `disciples[].loyalty` | starts 60; only a wrong moves it. |
| `disciples[].role` | `'disciple'` → `'inner'` (promoted). |
| `disciples[].personality` | used for office fit. |

## Data (`assets/data/sect-management.js`)

- **`SECT_OFFICES`** — Steward (income), Trainer (XP), Warden (war defense), Recruiter (candidate talent).
  A bonus scales with the holder's talent (`talent/5`) and ×1.2 when the holder's personality is in the
  office's `affinity` list.
- **`SECT_TIERS`** — Humble / Rising / Great / Heavenly, derived from `s.derived.sectFame` (never stored).
- **`RECRUIT_STRICTNESS`** — Open gate / Selective / Exacting (min talent 1/2/3, 0/3/6 rerolls, refresh
  900/1200/1800 s).
- **`DISCIPLE_LOYALTY_START` · `DISCIPLE_WRONG_REPLACED` · `DISCIPLE_LEAVE_AT` · `DISCIPLE_INNER_YIELD`**.

## API

- `sectOfficeInfo()` → each office + its holder (fit flag) + current bonus.
- `appointOffice(officeId, discipleId)` / `clearOffice(officeId)` — branch members cannot hold an office;
  replacing a holder costs them 15 loyalty and may drive them out.
- `promoteDisciple(id)` — inner disciple (+10% yield, +10 loyalty).
- `sectTierInfo()` · `recruitPolicyInfo()` · `setRecruitPolicy({ strictness, minTalent, autoRecruit })`.
- `_officeBonuses()` feeds `_recalc` (income ×, XP ×, war defense +).
- `tickOwnSect` auto-recruits the best affordable candidate when the policy's `autoRecruit` is on.

## UI

Sect → Disciples shows **Offices & discipline**: a card per office (holder + fit + bonus, or the top three
disciples to appoint), the sect tier, the recruitment strictness segment and Auto-recruit toggle. Each
disciple row gains a **raise** button (inner disciple).

## Rules & invariants

1. **No passive loyalty decay** (user rule: no upkeep chores). Only a direct wrong (−15) can cause defection.
2. Auto-recruit is a delegation the player explicitly sets; it still respects seats, stones and minTalent.
3. The default policy is **Open gate** (minTalent 1, no rerolls) so existing behaviour and seeds are unchanged.
4. Inner disciples feed +10% but do not change the disciple cap.
5. Sect tier is derived; it only biases the recruit pool through the strictness/recruiter systems for now.

## Not built (final QA / later)

- Offices have no UI cooldown or salary; the bonuses are modest by design.
- Recruit policy does not yet filter by root/element, only talent.
- The disciple lifecycle has no ranks beyond inner, no tournaments of disciples (the branch tournament covers
  the competitive beat), and no policies beyond recruiting.
- 5.5 (wars vs real NPC sects with named champions) is satisfied by Phase 43c — wars already bind the real rival
  sect and read its Might.
