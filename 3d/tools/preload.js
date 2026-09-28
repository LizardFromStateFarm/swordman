// Preload for the 3D rig editor — the only bridge between the editor page and the host's Node/fs.
// The page cannot touch the filesystem directly; it asks the host to lint/save a rig.
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('editor', {
  getJob: () => ipcRenderer.invoke('editor:job'),
  lint: rig => ipcRenderer.invoke('editor:lint', rig),
  save: rig => ipcRenderer.invoke('editor:save', rig),
})
