const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Export snapshot (ボタンから呼ぶ)
  exportSnapshot: (data) => {
    ipcRenderer.send('export-snapshot', data);
  },

  onExportResult: (callback) => {
    ipcRenderer.on('export-snapshot-result', (event, result) => callback(result));
  },

  // IPC listeners for main process commands
  onGetResponses: (callback) => {
    ipcRenderer.on('get-responses', (event, data) => callback(data));
  },

  onSendPrompt: (callback) => {
    ipcRenderer.on('send-prompt', (event, data) => callback(data));
  },

  onExportJson: (callback) => {
    ipcRenderer.on('export-json', (event, data) => callback(data));
  },

  onNavigatePane: (callback) => {
    ipcRenderer.on('navigate-pane', (event, data) => callback(data));
  },

  onGetStatus: (callback) => {
    ipcRenderer.on('get-status', (event, data) => callback(data));
  },

  onExecuteSend: (callback) => {
    ipcRenderer.on('execute-send', (event, data) => callback(data));
  },

  onRefreshPane: (callback) => {
    ipcRenderer.on('refresh-pane', (event, data) => callback(data));
  },

  // Send response back to main process
  sendResponse: (channel, data) => {
    ipcRenderer.send(channel, data);
  }
});
