# Monetization — Free & Paid Editions + Optional Rewarded Ads (Phase 53)

_Last updated: 2026-11-26 · Data: `assets/data/monetization.js`, `assets/data/variant.js` · UI: `renderer/game/ads.js` · Engine: `game-state.js`._

**Model (user 2026-11-26):** two editions — a **free** app with **optional** rewarded ads, and a **$2 paid** app
with no ads. Non-predatory rules: never forced, never blocking, no shop/currency, no timers on the reward. Declining
is free and simply re-asks after another interval.

## Editions

| Edition | `APP_VARIANT` | Ads | Store package (suggested) |
|---|---|---|---|
| Free | `'free'` (default) | Optional rewarded ad every 30 min of **active** play | `com.cultivator.idle` |
| Paid ($2) | `'paid'` | None | `com.cultivator.idle.paid` |

The committed `assets/data/variant.js` is `free`. `scripts/build-ios-web.js` rewrites it in `www/` from
`APP_VARIANT`, so the same source builds either edition:

```powershell
$env:APP_VARIANT="paid"; npm run cap:sync:android   # paid, ad-free
$env:APP_VARIANT="free"; npm run cap:sync:android   # free (optional ads)
```

The desktop/Electron build is always ad-free in practice: `adsEnabled()` requires a **native Capacitor platform**
(or the dev simulation), so the shared renderer never shows ads on PC.

## The optional ad (free edition only)

- **Cadence:** every `AD_PROMPT_ACTIVE_SECONDS` (1800 s) of **foreground/active** play (the tick only counts while
  `setPresent(true)` — not while hidden to the tray or backgrounded). Declining or "no ad available" schedules the
  next ask `AD_NEXT_AFTER_DECLINE_SECONDS` (1800 s) later. State: `s.ad = { sec, next }`, in the normal save.
- **Prompt:** a calm card ("A wandering merchant — watch a short ad for a small boon?"). Watch / Not now. It never
  covers another popup (it waits for overlays to close) and never blocks the game.
- **Reward (`AD_REWARD`):** 10 minutes of the current active Qi rate (clamped to the Qi cap) + 25 Spirit Stones.
  Deliberately small, so watching is never required and never feels like a tax on refusing.
- **No SDK:** if no AdMob plugin is present, the prompt is suppressed (no free rewards without an ad).

## Ad SDK one-time setup (human)

1. Create an **AdMob** account + app (free edition only), and a **Rewarded** ad unit for Android and one for iOS.
   Put the ids in `AD_UNIT_IDS` (`assets/data/monetization.js`).
2. Install a Capacitor AdMob plugin — e.g. `npm install --include=dev @capacitor-community/admob` — and add its
   native config (app ids in `AndroidManifest.xml` / `Info.plist`). `RewardedAd.show()` feature-detects several
   plugin APIs (`AdMob.showRewardVideoAd`, `AdMob.showRewardAd`, `AdMobPlus.show`, `RewardAd.show`); adjust the
   wrapper to your chosen plugin's exact call.
3. **Consent & privacy:** run Google's UMP/GDPR consent flow before requesting ads; on iOS add the ATT prompt and
   the `NSUserTrackingUsageDescription` string. Every store listing needs a **privacy policy** and a **data-safety**
   declaration covering the ad SDK.
4. Test with a test ad unit id before switching to production ids.

## Store packaging

- **Two apps** = two package/bundle ids, two store listings, two review cycles, and **separate save storage** —
  progress does not move between free and paid. The paid build is the same code with `APP_VARIANT=paid`.
  - Android: change `applicationId`/`namespace` in `android/app/build.gradle` for the paid build (or ship two
    product flavors); separate Play Console app; separate upload keystore/signing is fine.
  - iOS: a second App ID + App Store Connect record; `codemagic.yaml` can take a second workflow with the paid
    bundle id, or build the paid variant by hand from Xcode.
- **Candid alternative:** a single app with a **one-time "Remove ads" in-app purchase** is usually better — one
  listing, one review stream, one install base, and the purchase keeps the same save. The game-side variant flag
  already supports this: keep one app, set `APP_VARIANT` from the purchase state (paid → ad-free) instead of from
  the build. Worth considering before creating two store records.

## Where it lives

| Piece | File |
|---|---|
| Cadence + reward + `adsEnabled()` | `game-state.js` (`_tickAds`, `adPromptDue`, `adMarkShown`, `grantAdReward`, `_ensureAdFields`) |
| Prompt UI + plugin wrapper | `renderer/game/ads.js` (`AdPromptUI`, `RewardedAd`) |
| Tuning | `assets/data/monetization.js` |
| Edition flag | `assets/data/variant.js` (build rewrites it) |
| Build injection | `scripts/build-ios-web.js` |

## Rules & invariants

1. **Paid edition never shows an ad prompt** (`adsEnabled()` is false when `APP_VARIANT !== 'free'`).
2. **Desktop never shows ads** (requires a native Capacitor platform or the explicit dev simulation).
3. **Declining costs nothing** and re-asks only after another full interval.
4. **No reward without a completed ad** — if the plugin is missing/fails, no boon is granted.
5. The reward is small (10 min of Qi + 25 stones) and clamps to the Qi cap.

## Not done yet (prep)

- The AdMob plugin is not installed and the real ad-unit ids are placeholders — the free build suppresses the
  prompt until they are. Consent/UMP, iOS ATT, privacy policy and data-safety forms are store-console work.
- Two-app packaging (second applicationId/bundle id, second listing) is documented but not scaffolded.
- The ad prompt has no smoke screenshot yet; a real-device trial is needed.
