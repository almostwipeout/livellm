const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportJSON: (data) => ipcRenderer.invoke('export-json', data)
});
