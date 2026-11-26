// Rewarded ads + the optional 30-minute prompt (free edition only). docs/systems/monetization.md.
// Feature-detected: uses a Capacitor AdMob plugin when one is installed (several package APIs are tried),
// and a dev simulation only when window.__ADS_SIMULATE is set. The paid edition (APP_VARIANT='paid') and the
// desktop/Electron build never show anything. UI only — the cadence + reward live in game-state.js.

const RewardedAd = {
  available() {
    if (typeof APP_VARIANT !== 'undefined' && APP_VARIANT !== 'free') return false
    if (typeof window === 'undefined') return false
    if (window.__ADS_SIMULATE) return true
    const P = window.Capacitor?.Plugins
    return !!(P?.AdMob || P?.AdMobPlus || P?.RewardAd)
  },
  async show() {
    if (typeof window !== 'undefined' && window.__ADS_SIMULATE) {
      await new Promise(r => setTimeout(r, 900))
      return { ok: true, simulated: true }
    }
    const P = window.Capacitor?.Plugins
    const adId = (typeof AD_UNIT_IDS !== 'undefined' && AD_UNIT_IDS) ? AD_UNIT_IDS.rewarded : undefined
    try {
      if (P?.AdMob?.showRewardVideoAd) { await P.AdMob.showRewardVideoAd(); return { ok: true } }
      if (P?.AdMob?.showRewardAd)      { await P.AdMob.showRewardAd({ adId }); return { ok: true } }
      if (P?.AdMobPlus?.show)          { await P.AdMobPlus.show({ adId }); return { ok: true } }
      if (P?.RewardAd?.show)           { await P.RewardAd.show(); return { ok: true } }
    } catch (e) { return { ok: false, reason: 'failed' } }
    return { ok: false, reason: 'unavailable' }
  },
}

const AdPromptUI = {
  el: null, busy: false, lastCheck: 0,
  tick(gs) {
    if (this.busy || this.el) return
    const now = Date.now()
    if (now - this.lastCheck < 1000) return
    this.lastCheck = now
    if (!gs.adPromptDue?.()) return
    if (!RewardedAd.available()) { gs.adMarkShown?.(); return }   // no SDK on this build: don't nag
    if (typeof document !== 'undefined' && document.querySelector('body > [id$="-overlay"]:not(.hidden)')) return   // let other popups finish
    this.show(gs)
  },
  show(gs) {
    if (this.el || typeof document === 'undefined') return
    const wrap = document.createElement('div')
    wrap.id = 'ad-overlay'
    wrap.className = 'ad-overlay'
    wrap.innerHTML = `<div class="ad-card">
      <div class="ad-k">A wandering merchant</div>
      <div class="ad-t">Watch a short ad for a small boon?</div>
      <div class="ad-s">A few minutes of Qi and a handful of Spirit Stones. Declining costs nothing.</div>
      <div class="ad-acts"><button class="ad-watch">Watch</button><button class="ad-no">Not now</button></div>
    </div>`
    document.body.appendChild(wrap)
    this.el = wrap
    wrap.querySelector('.ad-no').addEventListener('click', () => { gs.adMarkShown?.(); this.close() })
    wrap.querySelector('.ad-watch').addEventListener('click', async () => {
      if (this.busy) return
      this.busy = true
      const w = wrap.querySelector('.ad-watch')
      w.textContent = 'Loading…'; w.disabled = true
      const r = await RewardedAd.show()
      this.busy = false
      if (r.ok) gs.grantAdReward?.()
      gs.adMarkShown?.()
      this.close()
    })
  },
  close() { if (this.el) { this.el.remove(); this.el = null } },
}
