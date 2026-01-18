#!/usr/bin/env node
/**
 * 赤兎馬ラウザー MCP Server
 * Quad BrowserをClaudeから操作するためのMCPサーバー
 */

const http = require('http');

// Quad BrowserのHTTP API（localhost:19850）
const QUAD_API_HOST = 'localhost';
const QUAD_API_PORT = 19850;

// MCPサーバー定義
const SERVER_INFO = {
  name: "quad-browser",
  version: "1.2.0",
  description: "赤兎馬ラウザー - Quad BrowserをClaudeから操作"
};

// ツール定義
const TOOLS = [
  {
    name: "get_responses",
    description: "4つのLLM（ChatGPT, Gemini, Claude, Grok）の現在の回答を取得する",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "send_prompt",
    description: "4つのLLMに同時にプロンプトを送信する（注意：各サイトの入力欄にテキストを入力するだけで、送信ボタンは押さない）",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "送信するプロンプト"
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "export_json",
    description: "現在の4LLMの回答をJSONファイルとしてエクスポートする",
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "エクスポートのコンテキスト説明（オプション）"
        }
      },
      required: []
    }
  },
  {
    name: "navigate",
    description: "指定したペインのURLを変更する",
    inputSchema: {
      type: "object",
      properties: {
        pane: {
          type: "number",
          description: "ペイン番号（1-4）"
        },
        url: {
          type: "string",
          description: "移動先URL"
        }
      },
      required: ["pane", "url"]
    }
  },
  {
    name: "get_status",
    description: "Quad Browserの現在の状態を取得する（各ペインのURL、分割モードなど）",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// Quad Browser APIへのリクエスト
function callQuadAPI(endpoint, data = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: QUAD_API_HOST,
      port: QUAD_API_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
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
      reject(new Error(`Quad Browser接続エラー: ${e.message}。Quad Browserが起動していることを確認してください。`));
    });

    req.write(postData);
    req.end();
  });
}

// ツール実行
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'get_responses':
        return await callQuadAPI('/api/get-responses');

      case 'send_prompt':
        return await callQuadAPI('/api/send-prompt', { prompt: args.prompt });

      case 'export_json':
        return await callQuadAPI('/api/export', { context: args.context || 'Quad Browser export' });

      case 'navigate':
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

// stdio JSON-RPC処理
let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;

  // 改行区切りでメッセージを処理
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 最後の不完全な行を保持

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const message = JSON.parse(line);
      const response = await handleMessage(message);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      process.stderr.write(`Parse error: ${e.message}\n`);
    }
  }
});

async function handleMessage(message) {
  const { jsonrpc, id, method, params } = message;

  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } };
  }

  switch (method) {
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

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };

    case 'tools/call':
      const { name, arguments: args } = params;
      const result = await executeTool(name, args || {});
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

    case 'notifications/initialized':
      // 初期化完了通知（応答不要）
      return null;

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

// 起動メッセージ
process.stderr.write('赤兎馬ラウザー MCP Server started\n');
