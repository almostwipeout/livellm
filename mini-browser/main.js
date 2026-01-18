/**
 * Quad Browser - Main Process
 *
 * 赤兎馬ラウザー：ClaudeがMCP経由で4LLMを操縦するためのElectronアプリ
 *
 * アーキテクチャ:
 * Claude（関羽）→ MCP → mcp-server.js → HTTP API → ここ → webview → 4 LLMs
 *
 * 設計思想:
 * - 取得・構造化・保存を明確に分離
 * - 各AI専用のAdapterパターンで抽象化（adapters.js）
 * - 汎用セレクタに逃げない
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { ADAPTERS, FALLBACK_ADAPTER, getAdapter } = require('./adapters');

let mainWindow;
const API_PORT = 19850;

// =============================================================================
// Window Management
// =============================================================================

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

// =============================================================================
// HTTP API Server（MCP連携用）
// =============================================================================

/**
 * MCPサーバーからのリクエストを受け付けるHTTPサーバー
 * ポート19850でlocalhostのみリッスン（セキュリティ考慮）
 */
function startAPIServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // POSTボディをパース
    const params = await parseRequestBody(req);

    try {
      const result = await handleAPIRequest(req.url, params);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('API Error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`赤兎馬ラウザー API Server: http://127.0.0.1:${API_PORT}`);
  });

  server.on('error', (e) => {
    console.error('API Server error:', e.message);
  });
}

/**
 * リクエストボディをJSONとしてパース
 */
function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

/**
 * APIエンドポイントのルーティング
 */
async function handleAPIRequest(url, params) {
  switch (url) {
    case '/api/get-responses':
      return await getAllResponses();
    case '/api/send-prompt':
      return await sendPromptToAll(params.prompt);
    case '/api/export':
      return await exportToJSON(params.context);
    case '/api/navigate':
      return await navigatePane(params.pane, params.url);
    case '/api/status':
      return await getStatus();
    default:
      return { error: 'Unknown endpoint', endpoint: url };
  }
}

// =============================================================================
// Core Operations（取得・構造化・保存の分離）
// =============================================================================

/**
 * 全ペインから回答を取得
 * 責務: 取得のみ
 */
async function getAllResponses() {
  const adaptersCode = generateAdaptersCode();

  return mainWindow.webContents.executeJavaScript(`
    (async function() {
      ${adaptersCode}

      const panes = document.querySelectorAll('.browser-pane');
      const items = [];

      for (const pane of panes) {
        const source = pane.dataset.source;
        const urlInput = pane.querySelector('.url-input');
        const webview = pane.querySelector('webview');

        let content = '';
        let error = null;

        try {
          const adapter = getAdapter(source);
          content = await webview.executeJavaScript(\`
            (function() {
              const selectors = \${JSON.stringify(adapter.responseSelectors)};
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
          error = e.message;
          content = '';
        }

        items.push({
          source,
          url: urlInput.value,
          content: content.trim(),
          error
        });
      }

      return {
        items,
        timestamp: new Date().toISOString()
      };
    })()
  `);
}

/**
 * 全ペインにプロンプトを入力
 * 責務: 入力のみ（送信ボタンは押さない）
 */
async function sendPromptToAll(prompt) {
  const adaptersCode = generateAdaptersCode();
  const promptStr = JSON.stringify(prompt || '');

  return mainWindow.webContents.executeJavaScript(`
    (async function() {
      ${adaptersCode}

      const panes = document.querySelectorAll('.browser-pane');
      const results = [];
      const prompt = ${promptStr};

      for (const pane of panes) {
        const source = pane.dataset.source;
        const webview = pane.querySelector('webview');
        const adapter = getAdapter(source);

        try {
          const success = await webview.executeJavaScript(\`
            (function() {
              const selectors = \${JSON.stringify(adapter.inputSelectors)};
              const prompt = \${promptStr};

              for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                    el.value = prompt;
                  } else {
                    el.innerText = prompt;
                  }
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  return true;
                }
              }
              return false;
            })()
          \`);
          results.push({ source, success });
        } catch (e) {
          results.push({ source, success: false, error: e.message });
        }
      }

      return { results, prompt };
    })()
  `);
}

/**
 * JSON形式でエクスポート
 * 責務: 構造化と返却（保存はUI側 or 呼び出し側）
 */
async function exportToJSON(context) {
  const responses = await getAllResponses();

  return {
    context: context || 'Quad Browser export',
    timestamp: responses.timestamp,
    items: responses.items.map(item => ({
      source: item.source,
      url: item.url,
      content: item.content,
      note: ''  // 拡張用の空フィールド
    }))
  };
}

/**
 * 指定ペインのURLを変更
 */
async function navigatePane(paneNumber, url) {
  const urlStr = JSON.stringify(url || '');

  return mainWindow.webContents.executeJavaScript(`
    (function() {
      const panes = document.querySelectorAll('.browser-pane');
      const targetPane = panes[${paneNumber - 1}];

      if (targetPane) {
        const urlInput = targetPane.querySelector('.url-input');
        const webview = targetPane.querySelector('webview');

        let navUrl = ${urlStr};
        if (!navUrl.startsWith('http://') && !navUrl.startsWith('https://')) {
          navUrl = 'https://' + navUrl;
        }

        urlInput.value = navUrl;
        webview.src = navUrl;
        return { success: true, pane: ${paneNumber}, url: navUrl };
      }
      return { success: false, error: 'Pane not found' };
    })()
  `);
}

/**
 * 現在のステータスを取得
 */
async function getStatus() {
  return mainWindow.webContents.executeJavaScript(`
    (function() {
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

      return {
        splitMode,
        panes: panesInfo,
        apiPort: ${API_PORT},
        timestamp: new Date().toISOString()
      };
    })()
  `);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Adaptersのコードをレンダラープロセス用に生成
 * webview内で実行するためにはコードを文字列として渡す必要がある
 */
function generateAdaptersCode() {
  return `
    const ADAPTERS = ${JSON.stringify(ADAPTERS, (key, value) => {
      // 関数はセレクタ配列だけ使うので、関数は除外
      if (typeof value === 'function') return undefined;
      return value;
    })};

    const FALLBACK_ADAPTER = ${JSON.stringify({
      name: 'Unknown',
      responseSelectors: FALLBACK_ADAPTER.responseSelectors,
      inputSelectors: FALLBACK_ADAPTER.inputSelectors
    })};

    function getAdapter(source) {
      return ADAPTERS[source] || FALLBACK_ADAPTER;
    }
  `;
}

// =============================================================================
// IPC Handlers（UI用）
// =============================================================================

/**
 * UIのEXPORTボタン用のハンドラ
 */
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

// =============================================================================
// App Lifecycle
// =============================================================================

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
