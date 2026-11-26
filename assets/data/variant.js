// APP_VARIANT — build-time edition flag (docs/systems/monetization.md).
//   'free' = optional rewarded ads (mobile only; the Electron/desktop build never shows ads)
//   'paid' = ad-free
// scripts/build-ios-web.js rewrites this file in www/ from the APP_VARIANT env var; the committed value is
// the free edition so a plain `npm run build:web` is the free build.
const APP_VARIANT = 'free'
