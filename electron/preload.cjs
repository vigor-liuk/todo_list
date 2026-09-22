const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('littleDay', {
  load: () => ipcRenderer.invoke('tasks:load'),
  command: command => ipcRenderer.invoke('tasks:command', command),
  exportFile: backup => ipcRenderer.invoke('tasks:export', backup),
  storageInfo: () => ipcRenderer.invoke('tasks:storage-info'),
  openDataFolder: () => ipcRenderer.invoke('tasks:open-data-folder'),
  onChange: callback => {
    const listener = (_event, snapshot) => callback(snapshot)
    ipcRenderer.on('tasks:changed', listener)
    return () => ipcRenderer.removeListener('tasks:changed', listener)
  },
  onError: callback => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('tasks:error', listener)
    return () => ipcRenderer.removeListener('tasks:error', listener)
  },
})
