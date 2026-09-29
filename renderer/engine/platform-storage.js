// Platform storage shim — provides window.electron on non-Electron shells (Capacitor iOS, plain
// browser). Electron's preload.js sets window.electron via contextBridge before any renderer
// script runs, so this only installs a fallback when that object isn't already present. Every
// consumer (game.js, game-state.js) keeps calling window.electron.* exactly as before — nothing
// else in the renderer needs to know or care which shell it's running in.
//
// Backed by localStorage: small JSON blobs, persists fine inside a Capacitor WKWebView and in any
// regular browser (handy for testing the game outside a native shell entirely). If a more robust
// native-backed store is wanted later, swap the bodies below for @capacitor/preferences calls —
// the window.electron.* call sites elsewhere in the renderer don't change either way.

if (!window.electron) {
  const KEY = (i) => `cultivator-idle:slot_${i}`

  const readSlot = (i) => {
    try {
      const raw = localStorage.getItem(KEY(i))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  window.electron = {
    loadAllSlots: async () => [0, 1, 2].map(readSlot),

    loadSlot: async (i) => readSlot(i),

    saveSlot: async (i, data) => {
      try { localStorage.setItem(KEY(i), JSON.stringify(data)) } catch {}
    },

    deleteSlot: async (i) => {
      try { localStorage.removeItem(KEY(i)) } catch {}
    },

    // Phase 40: the cross-save Soul record (docs/systems/soul-points.md), its own key so a slot delete never touches it.
    loadSoul: async () => {
      try { const raw = localStorage.getItem('ci_soul'); return raw ? JSON.parse(raw) : null } catch { return null }
    },
    saveSoul: async (data) => {
      try { localStorage.setItem('ci_soul', JSON.stringify(data)) } catch {}
    },

    // Dev tools (charselect late-game presets) are Electron-dev only — never on iOS / plain browser.
    isDev: async () => false,

    // No desktop window to manage on iOS — safe no-ops. toggleAlwaysOnTop resolves
    // `true` (matches Electron's default pinned-on-boot state) since there's no
    // real window to pin/unpin here, and the pin button reads this to show state.
    quit: () => {},
    toggleAlwaysOnTop: async () => true,

    // Phase 9A/B: no system tray, no native OS notifications, and no quit flow to protect with a
    // save flush on iOS/browser — all safe no-ops (see docs/systems/notifications.md). Nothing else
    // in the renderer needs to branch on platform to call these.
    hideToTray: () => {},
    setCloseToTray: () => {},   // 1.8b-1: no window/tray on iOS/browser
    updateTrayInfo: () => {},
    notify: () => {},
    onRequestSave: () => {},

    // Phase 6E layout modes: a phone/browser has no window to resize or pin, so it always uses the full-screen
    // 'desktop' layout (which reflows to one column when narrow) and the mode picker hides itself
    // (supported: false). See docs/systems/ui-layout.md → "Layout modes".
    getLayout: async () => ({ mode: 'desktop', current: 'desktop', bannerEdge: 'top', supported: false }),
    setLayout: async () => ({ mode: 'desktop', bannerEdge: 'top', pinned: true }),
    resizeWindow: () => {},
    bannerMenu: () => {},
  }
}
