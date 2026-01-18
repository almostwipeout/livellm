#!/usr/bin/env node
/**
 * 赤兎馬ラウザー MCP Server
 *
 * ClaudeがQuad Browserを「乗りこなす」ためのMCPサーバー。
 * 関羽が赤兎馬に乗るように、4LLMを同時に操縦できる。
 *
 * アーキテクチャ:
 * ┌──────────────────────────────────────────────────────────┐
 * │  Claude Desktop / Claude Code                            │
 * │       ↓ MCP Protocol (stdio, JSON-RPC 2.0)               │
 * │  [このファイル: mcp-server.js]                            │
 * │       ↓ HTTP (localhost:19850)                           │
 * │  Quad Browser (Electron)                                 │
 * │       ↓ webview.executeJavaScript                        │
 * │  4 LLMs (ChatGPT / Gemini / Claude / Grok)               │
 * └──────────────────────────────────────────────────────────┘
 *
 * 使い方:
 * 1. Quad Browserを起動 (npm start)
 * 2. Claude Desktop設定にこのサーバーを追加
 * 3. Claudeに「4LLMの回答を取得して」と言う
 */

const http = require('http');

// =============================================================================
// Configuration
// =============================================================================

const QUAD_API = {
  host: 'localhost',
  port: 19850,
  timeout: 30000  // 30秒タイムアウト
};

const SERVER_INFO = {
  name: 'quad-browser',
  version: '1.2.1',
  description: '赤兎馬ラウザー - ClaudeがQuad Browserを操縦するためのMCPサーバー'
};

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS = [
  {
    name: 'get_responses',
    description: '4つのLLM（ChatGPT, Gemini, Claude, Grok）の現在の回答を一括取得する。各AIの最後の応答テキストが返される。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'send_prompt',
    description: '4つのLLMの入力欄に同時にプロンプトを入力する。注意：テキストを入力するだけで、送信ボタンは押さない。ユーザーが確認後に送信する想定。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '入力するプロンプトテキスト'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'export_json',
    description: '現在の4LLMの回答をJSON形式で取得する。ファイル保存はせず、構造化されたデータを返す。',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'エクスポートのコンテキスト説明（例：「API設計についての比較」）'
        }
      },
      required: []
    }
  },
  {
    name: 'navigate',
    description: '指定したペインのURLを変更する。ペイン番号は1-4。',
    inputSchema: {
      type: 'object',
      properties: {
        pane: {
          type: 'number',
          description: 'ペイン番号（1=ChatGPT, 2=Gemini, 3=Claude, 4=Grok）',
          minimum: 1,
          maximum: 4
        },
        url: {
          type: 'string',
          description: '移動先URL'
        }
      },
      required: ['pane', 'url']
    }
  },
  {
    name: 'get_status',
    description: 'Quad Browserの現在の状態を取得する。各ペインのURL、分割モード、APIポート番号などが返される。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// =============================================================================
// HTTP Client for Quad Browser API
// =============================================================================

/**
 * Quad BrowserのHTTP APIを呼び出す
 * @param {string} endpoint - APIエンドポイント（例：'/api/get-responses'）
 * @param {Object} data - POSTするデータ
 * @returns {Promise<Object>} - APIレスポンス
 */
function callQuadAPI(endpoint, data = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const options = {
      hostname: QUAD_API.host,
      port: QUAD_API.port,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: QUAD_API.timeout
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ raw: body });
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(
        `Quad Browser接続エラー: ${e.message}\n` +
        `Quad Browserが起動していることを確認してください。\n` +
        `期待するAPIエンドポイント: http://${QUAD_API.host}:${QUAD_API.port}${endpoint}`
      ));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Quad Browser APIタイムアウト (${QUAD_API.timeout}ms)`));
    });

    req.write(postData);
    req.end();
  });
}

// =============================================================================
// Tool Execution
// =============================================================================

/**
 * ツールを実行
 * @param {string} name - ツール名
 * @param {Object} args - 引数
 * @returns {Promise<Object>} - 実行結果
 */
async function executeTool(name, args = {}) {
  try {
    switch (name) {
      case 'get_responses':
        return await callQuadAPI('/api/get-responses');

      case 'send_prompt':
        if (!args.prompt) {
          return { error: 'prompt は必須パラメータです' };
        }
        return await callQuadAPI('/api/send-prompt', { prompt: args.prompt });

      case 'export_json':
        return await callQuadAPI('/api/export', { context: args.context });

      case 'navigate':
        if (!args.pane || !args.url) {
          return { error: 'pane と url は必須パラメータです' };
        }
        if (args.pane < 1 || args.pane > 4) {
          return { error: 'pane は 1-4 の範囲で指定してください' };
        }
        return await callQuadAPI('/api/navigate', { pane: args.pane, url: args.url });

      case 'get_status':
        return await callQuadAPI('/api/status');

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// =============================================================================
// MCP Protocol Handler (JSON-RPC 2.0 over stdio)
// =============================================================================

let inputBuffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  inputBuffer += chunk;

  // 改行区切りでメッセージを処理
  const lines = inputBuffer.split('\n');
  inputBuffer = lines.pop() || '';  // 最後の不完全な行を保持

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const message = JSON.parse(line);
      const response = await handleMCPMessage(message);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      process.stderr.write(`JSON parse error: ${e.message}\n`);
    }
  }
});

/**
 * MCPメッセージを処理
 * @param {Object} message - JSON-RPCメッセージ
 * @returns {Object|null} - レスポンス（通知の場合はnull）
 */
async function handleMCPMessage(message) {
  const { jsonrpc, id, method, params } = message;

  // JSON-RPC 2.0バリデーション
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }
    };
  }

  switch (method) {
    // 初期化
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: SERVER_INFO,
          capabilities: {
            tools: {}
          }
        }
      };

    // ツール一覧
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };

    // ツール実行
    case 'tools/call':
      const { name, arguments: toolArgs } = params || {};
      const result = await executeTool(name, toolArgs || {});

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        }
      };

    // 初期化完了通知（応答不要）
    case 'notifications/initialized':
      return null;

    // 未知のメソッド
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

// =============================================================================
// Startup
// =============================================================================

process.stderr.write(`
╔══════════════════════════════════════════════════════════╗
║  赤兎馬ラウザー MCP Server v${SERVER_INFO.version}                     ║
║  Quad Browser を Claude から操縦するための MCP サーバー   ║
╠══════════════════════════════════════════════════════════╣
║  Quad Browser API: http://${QUAD_API.host}:${QUAD_API.port}              ║
║  Tools: get_responses, send_prompt, export_json,         ║
║         navigate, get_status                             ║
╚══════════════════════════════════════════════════════════╝
`);
