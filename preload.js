const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  loadAllSlots:      ()        => ipcRenderer.invoke('load-all-slots'),
  loadSlot:          (i)       => ipcRenderer.invoke('load-slot', i),
  saveSlot:          (i, data) => ipcRenderer.invoke('save-slot', i, data),
  deleteSlot:        (i)       => ipcRenderer.invoke('delete-slot', i),
  isDev:             ()        => ipcRenderer.invoke('is-dev'),
  quit:              ()        => ipcRenderer.send('quit-app'),
  toggleAlwaysOnTop: ()        => ipcRenderer.invoke('toggle-always-on-top'),
  // Phase 9A/B: system tray + opt-in desktop notifications (see docs/systems/notifications.md).
  hideToTray:        ()             => ipcRenderer.send('hide-to-tray'),
  updateTrayInfo:    (name, stage)  => ipcRenderer.send('update-tray-info', name, stage),
  notify:            (title, body) => ipcRenderer.send('show-notification', title, body),
  onRequestSave:     (cb)          => ipcRenderer.on('request-save', () => cb()),
  // Phase 6E layout modes (docs/systems/ui-layout.md → "Layout modes"); iOS shim in platform-storage.js.
  getLayout:         ()             => ipcRenderer.invoke('get-layout'),
  setLayout:         (mode, opts)   => ipcRenderer.invoke('set-layout', mode, opts),
  resizeWindow:      (w, h)         => ipcRenderer.send('resize-window', w, h),
  bannerMenu:        (extra)        => ipcRenderer.send('banner-menu', extra),
})
