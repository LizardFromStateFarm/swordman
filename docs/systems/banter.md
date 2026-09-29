# Banter — Reference
_Covers: assets/data/personalities.js · assets/data/banter-lines.js · renderer/game/banter.js · game-state.js (personality, banter state, onGameEvent) · game.js (bubble, Stats log, charselect) · Phase: 29 (roadmap M1 1.2) · Updated: 2026-09-25_

Writers: see `banter-writing-guide.md` (voice, tokens, triggers, the 14 personalities).

## State
- `s.personality: { id }` is rolled in `_newGame()`. Old saves roll one in `_ensurePhase29Fields()`.
  A new life after `_die()` rolls a fresh personality (a new soul).
- `s.banter: { lastAt, recent: string[≤20], log: [{text, trigger, ts}] ≤50 newest-first, last: {text, trigger, ts}|null, failStreak, todSaid }`
  - `recent` is the no-repeat buffer (line texts).
  - `last` drives the bubble: game.js diffs `last.ts`, the same pattern the death overlay uses.
  - `failStreak` is the number of consecutive breakthrough failures; a success resets it.
  - `todSaid` is `'YYYY-MM-DD:morning|night'`, so each time-of-day line fires at most once per window per day.
- Settings (`SETTINGS_DEFS`): `banterFreq` off/rare/normal/chatty (default normal), `profanity` uncensored/masked (default uncensored).

## API (game-state.js)
- `onGameEvent(fn) → unsubscribe` calls `fn(type, ctx)` for game moments. This is a listener list, not state.
  Types: `bt_success` · `bt_fail {streak}` · `expedition_return {rareItem?}` · `war_call {enemy, sect}` ·
  `war_won {enemy, sect}` · `war_lost {enemy, sect}` · `reborn` · `welcome_back {hours}` ·
  `beast_tamed {name}` · `death {cause, maxStage}` (Phase 9B, notifications.md; banter doesn't
  currently have lines for these two, only `NotificationSystem` consumes them).
  Emitted only on live play, except `welcome_back`, which fires from `initSlot()`'s offline catch-up.
  War events only fire if `w.seen`. `death` fires at the top of `_die()`, immediately before `reborn`
  (the state reset happens in between — `reborn`'s listener sees the new life, `death`'s doesn't).
- `recordBanter(text, trigger)` pushes to `recent`/`log`, sets `last`/`lastAt`, then notifies. It's the only writer of `s.banter`.
- `markTimeOfDay(key)` sets `todSaid`.

## Engine (renderer/game/banter.js → BanterSystem, DOM-free, loaded by the sim)
- `tick(dt)` does three things:
  1. Drains the queued contextual line after `BANTER_CONTEXT_DELAY` s (so it lands after the toast).
  2. Detects low health crossing below `BANTER_LOW_HEALTH`.
  3. Fires idle chatter on a random interval from `BANTER_FREQ[freq]` (min–max seconds), and skips idle while `isBlocked()` is true (an overlay is open; game.js supplies it).
- Idle picks `morning`/`night` instead of `idle` once per window per day when the local hour matches.
- Contextual events queue **one** pending line; a newer event replaces an older one. The line pool is looked up as
  personality[trigger] → fallback to BANTER_LINES.generic[trigger]. It picks a line not in `recent`, then fills tokens.
- `say(trigger, ctx)` is public (game.js uses it for `ascension_trial` when the overlay opens, and `soul_remembers` when the next life begins after a Trial granted Soul Points).
- `BanterSystem.mask(text)` is the profanity mask, applied at *display* time so the log follows the setting.
- A rare drop is any expedition drop whose drop-table weight is ≤ `BANTER_RARE_WEIGHT_FRAC` of the table total.

## Data Shape
- `PERSONALITIES = [{ id, name, nameCN, blurb }]`, 14 entries.
- `BANTER_LINES = { generic: {trigger: [..]}, <personalityId>: {trigger: [..]} }`, with
  `BANTER_TRIGGERS = [..18 ids..]` (`soul_remembers` added in Phase 40a, said by game.js when the death card after an Ascension Trial closes; `married`/`child_born` added in M2 2.5; `twilight` was added in 2.3 and removed with
  old age on 2026-09-26) and `BANTER_MIN_LINES = { idle: 25, other: 4, genericIdle: 20, genericOther: 2 }`.

## Wiring
- game.js creates `BanterSystem(gameState, () => overlayOpen())`, ticks it in the loop, and renders `#banter-bubble`
  (fixed, above overlays, z 210) on `s.banter.last` change. It fades after `BANTER_BUBBLE_SECONDS`. Tapping it dismisses it.
- Stats tab: a Personality row plus a "Banter" log section (last 50). Charselect cards show the personality name.

## Invariants
1. Every personality has ≥ min lines for every trigger, and generic has ≥ its min (sim `banter_pool_holes`, checked once at load).
2. `s.banter.recent.length ≤ 20`, `log.length ≤ 50`, `s.personality.id` ∈ PERSONALITIES (sim invariants).
3. Banter never touches gameplay numbers.

## Gotchas
- A personality rolled by migration is saved immediately in `initSlot()`. Otherwise closing before the first autosave re-rolls it. `awayH` is computed *before* that `_save()`, because `_save()` bumps `lastSave` on the same object.
- The writing agents under-swore, so a swearing pass was appended. Keep the voice: ~10% of lines, in character (niceguy apologizes, stoic says "Fuck." flatly).
- `_die()` replaces `this._s`; the `reborn` emit happens after the new state exists, so `recordBanter` writes to the new life.
- Tokens are only filled for the triggers that supply them (see the writing guide). An unfilled token is stripped to "someone"/"something" as a safety net.
  `{spouse}`/`{child}` (M2 2.5) are given names from the `married`/`child_born` event ctx, falling back to the live
  `s.family` and then to "my spouse"/"the little one".
- `married`/`child_born` blocks must go **inside each personality's own object**. In M2 2.5 all 15 blocks were first pasted
  into `generic` (duplicate keys, so JS silently kept only the last) — the sim's `banter_pool_holes` caught it (756 hits).
- Offline war resolution doesn't emit, which keeps a 20-line flood from firing on reopen.
