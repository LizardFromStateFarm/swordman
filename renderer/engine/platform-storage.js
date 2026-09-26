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

    // Dev tools (charselect late-game presets) are Electron-dev only — never on iOS / plain browser.
    isDev: async () => false,

    // No desktop window to manage on iOS — safe no-ops.
    quit: () => {},
    toggleAlwaysOnTop: () => {},
  }
}
