const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  loadAllSlots:      ()        => ipcRenderer.invoke('load-all-slots'),
  loadSlot:          (i)       => ipcRenderer.invoke('load-slot', i),
  saveSlot:          (i, data) => ipcRenderer.invoke('save-slot', i, data),
  deleteSlot:        (i)       => ipcRenderer.invoke('delete-slot', i),
  quit:              ()        => ipcRenderer.send('quit-app'),
  toggleAlwaysOnTop: ()        => ipcRenderer.send('toggle-always-on-top'),
})
