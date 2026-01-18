const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
const API_PORT = 19850;

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

  // HTTP APIサーバー起動（MCP連携用）
  startAPIServer();
}

// HTTP APIサーバー（赤兎馬ラウザー用）
function startAPIServer() {
  const server = http.createServer(async (req, res) => {
    // CORSヘッダー
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // POSTボディを読む
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      let params = {};
      try {
        if (body) params = JSON.parse(body);
      } catch (e) {}

      try {
        const result = await handleAPIRequest(req.url, params);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`赤兎馬ラウザー API Server running on port ${API_PORT}`);
  });

  server.on('error', (e) => {
    console.error('API Server error:', e.message);
  });
}

// APIリクエスト処理
async function handleAPIRequest(url, params) {
  switch (url) {
    case '/api/get-responses':
      return await executeInRenderer('getResponses');

    case '/api/send-prompt':
      return await executeInRenderer('sendPrompt', params.prompt);

    case '/api/export':
      return await executeInRenderer('exportJSON', params.context);

    case '/api/navigate':
      return await executeInRenderer('navigate', params.pane, params.url);

    case '/api/status':
      return await executeInRenderer('getStatus');

    default:
      return { error: 'Unknown endpoint', endpoint: url };
  }
}

// レンダラープロセスでJavaScript実行
function executeInRenderer(action, ...args) {
  return mainWindow.webContents.executeJavaScript(`
    (async function() {
      ${getRendererCode(action, args)}
    })()
  `);
}

// レンダラー用コード生成
function getRendererCode(action, args) {
  switch (action) {
    case 'getResponses':
      return `
        const panes = document.querySelectorAll('.browser-pane');
        const items = [];
        for (const pane of panes) {
          const source = pane.dataset.source;
          const urlInput = pane.querySelector('.url-input');
          const webview = pane.querySelector('webview');
          let content = '';
          try {
            content = await webview.executeJavaScript(\`
              (function() {
                const selectors = [
                  '[data-message-author-role="assistant"]',
                  '.message-content',
                  '.response-content',
                  '.markdown-body',
                  '.prose',
                  'article',
                  '.chat-message'
                ];
                for (const selector of selectors) {
                  const elements = document.querySelectorAll(selector);
                  if (elements.length > 0) {
                    const last = elements[elements.length - 1];
                    return last.innerText || last.textContent || '';
                  }
                }
                return document.body.innerText.substring(0, 5000);
              })()
            \`);
          } catch (e) {
            content = '[Error: ' + e.message + ']';
          }
          items.push({ source, url: urlInput.value, content: content.trim() });
        }
        return { items, timestamp: new Date().toISOString() };
      `;

    case 'sendPrompt':
      const prompt = JSON.stringify(args[0] || '');
      return `
        const panes = document.querySelectorAll('.browser-pane');
        const results = [];
        for (const pane of panes) {
          const source = pane.dataset.source;
          const webview = pane.querySelector('webview');
          try {
            await webview.executeJavaScript(\`
              (function() {
                const prompt = ${prompt};
                const selectors = [
                  'textarea[placeholder*="Message"]',
                  'textarea[placeholder*="prompt"]',
                  'textarea',
                  '[contenteditable="true"]',
                  'input[type="text"]'
                ];
                for (const selector of selectors) {
                  const el = document.querySelector(selector);
                  if (el) {
                    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                      el.value = prompt;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                      el.innerText = prompt;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    return true;
                  }
                }
                return false;
              })()
            \`);
            results.push({ source, success: true });
          } catch (e) {
            results.push({ source, success: false, error: e.message });
          }
        }
        return { results, prompt: ${prompt} };
      `;

    case 'exportJSON':
      const context = JSON.stringify(args[0] || 'Quad Browser export');
      return `
        const panes = document.querySelectorAll('.browser-pane');
        const items = [];
        for (const pane of panes) {
          const source = pane.dataset.source;
          const urlInput = pane.querySelector('.url-input');
          const webview = pane.querySelector('webview');
          let content = '';
          try {
            content = await webview.executeJavaScript(\`
              (function() {
                const selectors = [
                  '[data-message-author-role="assistant"]',
                  '.message-content',
                  '.response-content',
                  '.markdown-body',
                  '.prose',
                  'article',
                  '.chat-message'
                ];
                for (const selector of selectors) {
                  const elements = document.querySelectorAll(selector);
                  if (elements.length > 0) {
                    const last = elements[elements.length - 1];
                    return last.innerText || last.textContent || '';
                  }
                }
                return document.body.innerText.substring(0, 5000);
              })()
            \`);
          } catch (e) {
            content = '[Error: ' + e.message + ']';
          }
          items.push({ source, url: urlInput.value, content: content.trim(), note: '' });
        }
        return {
          context: ${context},
          timestamp: new Date().toISOString(),
          items
        };
      `;

    case 'navigate':
      const pane = args[0];
      const url = JSON.stringify(args[1] || '');
      return `
        const panes = document.querySelectorAll('.browser-pane');
        const targetPane = panes[${pane - 1}];
        if (targetPane) {
          const urlInput = targetPane.querySelector('.url-input');
          const webview = targetPane.querySelector('webview');
          let navUrl = ${url};
          if (!navUrl.startsWith('http://') && !navUrl.startsWith('https://')) {
            navUrl = 'https://' + navUrl;
          }
          urlInput.value = navUrl;
          webview.src = navUrl;
          return { success: true, pane: ${pane}, url: navUrl };
        }
        return { success: false, error: 'Pane not found' };
      `;

    case 'getStatus':
      return `
        const panes = document.querySelectorAll('.browser-pane');
        const grid = document.getElementById('browserGrid');
        const splitMode = grid.className.includes('split-1') ? 1 :
                         grid.className.includes('split-2') ? 2 : 4;
        const panesInfo = [];
        panes.forEach((pane, i) => {
          const urlInput = pane.querySelector('.url-input');
          panesInfo.push({
            number: i + 1,
            source: pane.dataset.source,
            url: urlInput.value
          });
        });
        return { splitMode, panes: panesInfo, timestamp: new Date().toISOString() };
      `;

    default:
      return 'return { error: "Unknown action" };';
  }
}

// JSONエクスポート処理（UIボタン用）
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
