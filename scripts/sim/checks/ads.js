// Scenario checks — monetization (docs/systems/monetization.md): the free edition's optional rewarded-ad cadence,
// the reward, the paid edition's silence, and the no-SDK suppression. Run: npm run checks · node scripts/sim/checks/ads.js
const { createSim } = require('../loader.js')
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }

;(async () => {
  const sim = await createSim({ seed: 1 }); await sim.boot(0); const gs = sim.gs, s = gs.get()
  sim.ctx.window.__ADS_SIMULATE = true
  sim.ctx.APP_VARIANT = 'free'

  // ── Free edition cadence ──
  assert(gs.adsEnabled(), 'free edition + a native/simulated platform enables ads')
  s.ad = { sec: 0, next: sim.ctx.AD_PROMPT_ACTIVE_SECONDS }
  assert(!gs.adPromptDue(), 'no prompt at the start')
  gs._tickAds(sim.ctx.AD_PROMPT_ACTIVE_SECONDS - 1)
  assert(!gs.adPromptDue(), 'no prompt before the interval elapses')
  gs._tickAds(1)
  assert(gs.adPromptDue(), 'the prompt is due after 30 minutes of active play')
  gs.adMarkShown()
  assert(!gs.adPromptDue(), 'declining/answering schedules the next ask')
  assert(s.ad.next > s.ad.sec, 'the next ask is in the future')

  // ── Reward ──
  s.stageIndex = 10; s.awakened = true; s.qi = 0; gs._recalc()
  const stones0 = s.spiritStones
  const r = gs.grantAdReward()
  assert(r.ok && s.qi > 0 && s.spiritStones === stones0 + r.stones, 'watching grants Qi and the stones')
  assert(s.qi <= s.derived.qiCap, 'the reward never exceeds the Qi cap')

  // ── Paid edition: silent ──
  sim.ctx.APP_VARIANT = 'paid'
  s.ad = { sec: 0, next: 0 }
  assert(!gs.adsEnabled(), 'paid edition disables ads')
  assert(!gs.adPromptDue(), 'paid edition never prompts')
  const sec0 = s.ad.sec
  gs._tickAds(1000)
  assert(s.ad.sec === sec0, 'paid edition does not count ad-active time')

  // ── No SDK (production free build without the plugin): no nag ──
  sim.ctx.APP_VARIANT = 'free'; sim.ctx.window.__ADS_SIMULATE = false
  assert(!gs.adsEnabled(), 'free edition without a native platform/SDK stays silent')
  sim.ctx.window.__ADS_SIMULATE = true

  // ── Migration ──
  delete s.ad
  gs._ensureAdFields()
  assert(s.ad && s.ad.sec === 0 && s.ad.next > 0, 'migration fills the ad cadence')
})()
