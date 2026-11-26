// Monetization tuning — docs/systems/monetization.md. Data only.
// The model (user 2026-11-26): a free edition with OPTIONAL rewarded ads and a $2 paid edition with no ads.
// Non-predatory rules: never forced, never blocking, no currency/shop, no timers on the reward. An ad is a
// small favour that pays a small boon; declining is free and just re-asks after another interval.

const AD_PROMPT_ACTIVE_SECONDS      = 1800   // ask every 30 minutes of ACTIVE (foreground) play
const AD_NEXT_AFTER_DECLINE_SECONDS = 1800   // declined / no ad available -> ask again in another 30 minutes
const AD_REWARD = {
  qiSeconds: 600,   // 10 minutes of the current active cultivation rate in Qi (clamped to the cap)
  stones: 25,       // a small handful of Spirit Stones
}
// Replace with your AdMob rewarded unit id. Android and iOS units differ; wire both in the wrapper if needed.
const AD_UNIT_IDS = { rewarded: 'ca-app-pub-000000000000/0000000000' }
