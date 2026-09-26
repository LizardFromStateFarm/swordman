const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  loadAllSlots:      ()        => ipcRenderer.invoke('load-all-slots'),
  loadSlot:          (i)       => ipcRenderer.invoke('load-slot', i),
  saveSlot:          (i, data) => ipcRenderer.invoke('save-slot', i, data),
  deleteSlot:        (i)       => ipcRenderer.invoke('delete-slot', i),
  isDev:             ()        => ipcRenderer.invoke('is-dev'),
  quit:              ()        => ipcRenderer.send('quit-app'),
  toggleAlwaysOnTop: ()        => ipcRenderer.invoke('toggle-always-on-top'),
})
