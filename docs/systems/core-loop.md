# Core Loop — Reference
_Covers: game-state.js · stages.js · techniques.js · cultivation.js · events.js · Phase: 1 · Updated: 2026-09-24_

## State
```
stageIndex:     number   — index into CULTIVATION_STAGES (0 = mortal, 22 = ascension)
qi:             number   — current Qi (never exceeds derived.qiCap)
spiritStones:   number   — currency; spent on techniques, earned from expeditions
karma:          number   — 0–100; small BT bonus (÷1000), regained on BT success, lost on failure
root:           object   — { type, name, mult } — rolled once at new game, rerollable via elixirs
techniques:     string[] — array of learned technique ids; always includes 'qi_breathing'
meditating:     bool     — true while meditation boost is active
meditationEnds: ms       — Date.now() timestamp when meditation expires
derived:        object   — computed by _recalc(); NEVER write directly
```

## Derived (computed by _recalc every tick)
```
qiPerSecond              — base Qi/s (stage × root × technique × equipment mults)
qiPerSecondBoosted       — qiPerSecond × meditBonus (1 or 3)
qiCap                    — stage cap × capMult techniques × artifact cap mult
breakthroughChance       — stage base + technique BT bonuses + equipment + karma/1000, capped 0.98
breakthroughChanceDisplay — breakthroughChance + activePill preview (UI display only, not used in roll)
canBreakthrough          — qi >= qiCap * 0.90
meditBonus               — 1 or 3
meditSecondsLeft         — seconds until meditation expires
lootMult                 — 1.5 if void_blade weapon equipped, else 1
hiddenLocations          — true if artifact_void_compass equipped
```

## API (game-state.js)
```
tick(dt)                    — advance qi, karma, save timer; calls _recalc + _notify every frame
attemptBreakthrough()       — consumes activePill, rolls BT chance; returns { success, reason/newStage }
startMeditation(duration)   — sets meditating=true, meditationEnds; false if already meditating
learnTechnique(id)          — deducts spiritStones, pushes to techniques; returns { ok, reason }
addEvent({ text, type, ts}) — prepends to s.events (max 25), notifies
setName(name)               — trims to 24 chars
forceSave()                 — immediate save (called on back/quit)
```

## Data Shape (stages.js)
Each stage in CULTIVATION_STAGES:
```
id, realm, realmCN, layer, layerCN, desc
baseQps          — base Qi/s before root/technique/equipment multipliers
qiCap            — raw cap before multipliers
breakthroughChance — raw base (never call with karma/technique bonus already baked in — _recalc does that)
spriteState      — key into CULTIVATOR_SPRITES; must exist before stage is reachable
color            — hex string for UI tinting
```

## Wiring
- `game.js` calls `gameState.tick(dt)` every frame via rAF loop
- `cultSys.tick(dt)` (cultivation.js) runs the random event scheduler on its own timer
- `gameState.subscribe(fn)` → `fn(s)` called after every `_notify()` → triggers `updateHUD`

## Invariants
1. `_recalc()` is always called before `_notify()` — derived is never stale at notify time
2. Breakthrough chance is capped at 0.98 inside `_recalc`; do not apply it elsewhere
3. Spirit stones live in `s.spiritStones`, not inventory — expedition drops of `spirit_stone` are routed there
4. `s.meditating` is auto-cleared in `_recalc` when `meditationEnds` passes; don't clear it anywhere else

## Gotchas
- Root multiplier is applied at qps calculation, not at qiCap — Heavenly Root makes you gain faster, not cap more
- `breakthroughChanceDisplay` includes queued pill bonus and is used only for the button label; `breakthroughChance` is the actual roll input
- `stageIndex >= CULTIVATION_STAGES.length - 1` guard in `attemptBreakthrough` prevents advancing past ascension
- `_ensurePhase2Fields()` is called at the top of every `_recalc` for save-migration safety; add Phase N fields there when new phases are implemented
