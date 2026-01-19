const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

let mainWindow;
let exportWindow;
let httpServer;

const HTTP_PORT = 19850;

// =============================================================================
// Electron Window
// =============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// =============================================================================
// Export Window (掲示板風表示)
// =============================================================================

function createExportWindow(exportData) {
  // 既存ウィンドウがあれば再利用
  if (exportWindow && !exportWindow.isDestroyed()) {
    exportWindow.webContents.send('export-data', exportData);
    exportWindow.focus();
    return;
  }

  // 新規作成
  exportWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Quad Browser - Export View',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-export.js')
    }
  });

  exportWindow.loadFile('export-view.html');

  // データを渡す
  exportWindow.webContents.on('did-finish-load', () => {
    exportWindow.webContents.send('export-data', exportData);
  });

  exportWindow.on('closed', () => {
    exportWindow = null;
  });
}

// =============================================================================
// File Save (Desktop)
// =============================================================================

function saveExportToDesktop(exportData) {
  const desktop = path.join(os.homedir(), 'Desktop');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `quad-export_${timestamp}.json`;
  const filepath = path.join(desktop, filename);

  fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf8');

  return { filepath, filename };
}

// =============================================================================
// IPC: Export Snapshot (ボタンから呼ばれる)
// =============================================================================

ipcMain.on('export-snapshot', (event, exportData) => {
  // 1. デスクトップにJSON保存
  const { filepath, filename } = saveExportToDesktop(exportData);

  // 2. 別ウィンドウで表示
  createExportWindow(exportData);

  // 結果を返す
  event.reply('export-snapshot-result', { success: true, filepath, filename });
});

// =============================================================================
// HTTP Server for MCP Integration
// =============================================================================

function startHTTPServer() {
  httpServer = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      let params = {};
      try {
        if (body) params = JSON.parse(body);
      } catch (e) {}

      const url = req.url;
      let result;

      try {
        switch (url) {
          case '/api/get-responses':
            result = await handleGetResponses();
            break;
          case '/api/send-prompt':
            result = await handleSendPrompt(params.prompt);
            break;
          case '/api/export':
            result = await handleExport(params.context);
            break;
          case '/api/navigate':
            result = await handleNavigate(params.pane, params.url);
            break;
          case '/api/status':
            result = await handleStatus();
            break;
          case '/api/execute-send':
            result = await handleExecuteSend();
            break;
          case '/api/refresh-pane':
            result = await handleRefreshPane(params.pane);
            break;
          default:
            result = { error: `Unknown endpoint: ${url}` };
        }
      } catch (error) {
        result = { error: error.message };
      }

      res.writeHead(200);
      res.end(JSON.stringify(result));
    });
  });

  httpServer.listen(HTTP_PORT, () => {
    console.log(`Quad Browser API listening on http://localhost:${HTTP_PORT}`);
  });
}

// =============================================================================
// API Handlers (IPC to Renderer)
// =============================================================================

function sendToRenderer(channel, data) {
  return new Promise((resolve, reject) => {
    if (!mainWindow) {
      reject(new Error('Window not ready'));
      return;
    }

    const responseChannel = `${channel}-response-${Date.now()}`;

    ipcMain.once(responseChannel, (event, result) => {
      resolve(result);
    });

    mainWindow.webContents.send(channel, { ...data, responseChannel });

    setTimeout(() => {
      reject(new Error('IPC timeout'));
    }, 30000);
  });
}

async function handleGetResponses() {
  return await sendToRenderer('get-responses', {});
}

async function handleSendPrompt(prompt) {
  if (!prompt) {
    return { error: 'prompt is required' };
  }
  return await sendToRenderer('send-prompt', { prompt });
}

async function handleExport(context) {
  return await sendToRenderer('export-json', { context });
}

async function handleNavigate(pane, url) {
  if (!pane || !url) {
    return { error: 'pane and url are required' };
  }
  return await sendToRenderer('navigate-pane', { pane, url });
}

async function handleStatus() {
  return await sendToRenderer('get-status', {});
}

async function handleExecuteSend() {
  return await sendToRenderer('execute-send', {});
}

async function handleRefreshPane(pane) {
  return await sendToRenderer('refresh-pane', { pane });
}

// =============================================================================
// App Lifecycle
// =============================================================================

app.whenReady().then(() => {
  createWindow();
  startHTTPServer();

  // カスタムメニュー（ズーム機能付き）
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In (All Panes)',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('zoom-command', 'in')
        },
        {
          label: 'Zoom Out (All Panes)',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('zoom-command', 'out')
        },
        {
          label: 'Reset Zoom (All Panes)',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('zoom-command', 'reset')
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
        { role: 'reload', label: 'Reload' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
  if (httpServer) {
    httpServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
