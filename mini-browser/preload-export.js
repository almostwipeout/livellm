const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onExportData: (callback) => {
    ipcRenderer.on('export-data', (event, data) => callback(data));
  }
});
