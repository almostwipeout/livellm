const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: 'Quad Browser',
    icon: path.join(__dirname, 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile('index.html');

  // F12でDevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

// JSONエクスポート処理
ipcMain.handle('export-json', async (event, data) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultPath = path.join(app.getPath('desktop'), `quad-export-${timestamp}.json`);

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export JSON',
    defaultPath: defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (filePath) {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf-8');
    return { success: true, path: filePath };
  }
  return { success: false };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
