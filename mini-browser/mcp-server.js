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
const https = require('https');

// =============================================================================
// xAI Grok API Configuration
// =============================================================================

const XAI_API = {
  baseUrl: 'api.x.ai',
  apiKey: process.env.XAI_API_KEY || '',
  model: 'grok-3',
  timeout: 60000
};

// Grok API fallback configuration
let grokFallbackCount = 0;
const GROK_FALLBACK_MAX = 2; // 1セッションあたり最大2回
const GROK_RETRY_DELAY_MS = 1000; // リトライ間のディレイ（1秒）
let lastSentPrompt = null; // 最後に送信されたプロンプトを保存

// ディレイ用ヘルパー関数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  version: '1.6.0',
  description: '赤兎馬ラウザー - Grok API fallback (2回リトライ) + refresh機能'
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
  },
  {
    name: 'execute_send',
    description: '【要確認】4つのLLMに入力済みのプロンプトを送信する（Enterキー押下）。send_promptで入力した後に使用。このアクションは取り消せないため、実行前にユーザーの確認が必要。',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'ユーザーが送信を確認したかどうか。trueの場合のみ実行。'
        }
      },
      required: ['confirm']
    }
  },
  {
    name: 'refresh_pane',
    description: '指定したペインをリフレッシュする（同じURLのままリロード）。Geminiが応答しない時などに使用。',
    inputSchema: {
      type: 'object',
      properties: {
        pane: {
          type: 'number',
          description: 'ペイン番号（1=ChatGPT, 2=Gemini, 3=Claude, 4=Grok）。省略で全ペインリフレッシュ。',
          minimum: 1,
          maximum: 4
        }
      },
      required: []
    }
  },
  {
    name: 'grok_api_call',
    description: 'xAI Grok APIを直接呼び出してレスポンスを取得。ブラウザスクレイピングではなくAPI経由で高速・確実に回答を得られる。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Grokに送信するプロンプト'
        },
        systemPrompt: {
          type: 'string',
          description: 'システムプロンプト（オプション）'
        },
        maxTokens: {
          type: 'number',
          description: '最大トークン数（デフォルト: 1000）'
        }
      },
      required: ['prompt']
    }
  }
];

// =============================================================================
// HTTP Client for Quad Browser API
// =============================================================================

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
// xAI Grok API Client
// =============================================================================

function callGrokAPI(prompt, systemPrompt = 'You are a helpful assistant.', maxTokens = 1000) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: XAI_API.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      stream: false
    });

    const options = {
      hostname: XAI_API.baseUrl,
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: XAI_API.timeout
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.error) {
            reject(new Error(`xAI API Error: ${data.error.message}`));
          } else {
            resolve({
              text: data.choices[0].message.content,
              model: data.model,
              usage: data.usage,
              id: data.id
            });
          }
        } catch (e) {
          reject(new Error(`xAI API Response Parse Error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`xAI API Connection Error: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`xAI API Timeout (${XAI_API.timeout}ms)`));
    });

    req.write(requestBody);
    req.end();
  });
}

// =============================================================================
// Tool Execution
// =============================================================================

async function executeTool(name, args = {}) {
  try {
    switch (name) {
      case 'get_responses':
        const responses = await callQuadAPI('/api/get-responses');

        // Grokが空でfallback可能ならAPI経由で取得（最大2回、ディレイ付きリトライ）
        if (responses.responses && lastSentPrompt && grokFallbackCount < GROK_FALLBACK_MAX) {
          const grokIdx = responses.responses.findIndex(r => r.name === 'Grok');
          if (grokIdx >= 0 && (!responses.responses[grokIdx].response || responses.responses[grokIdx].response === '')) {
            let retryAttempt = 0;
            let lastError = null;

            while (retryAttempt < 2 && grokFallbackCount < GROK_FALLBACK_MAX) {
              try {
                if (retryAttempt > 0) {
                  await sleep(GROK_RETRY_DELAY_MS);
                }
                grokFallbackCount++;
                retryAttempt++;
                const apiResult = await callGrokAPI(lastSentPrompt);
                responses.responses[grokIdx].response = apiResult.text;
                responses.responses[grokIdx].source = 'api-fallback';
                responses.responses[grokIdx].fallbackCount = grokFallbackCount;
                responses.responses[grokIdx].retryAttempt = retryAttempt;
                lastError = null;
                break; // 成功したらループ終了
              } catch (e) {
                lastError = e.message;
              }
            }

            if (lastError) {
              responses.responses[grokIdx].fallbackError = lastError;
              responses.responses[grokIdx].retryAttempts = retryAttempt;
            }
          }
        }

        return responses;

      case 'send_prompt':
        if (!args.prompt) {
          return { error: 'prompt は必須パラメータです' };
        }
        lastSentPrompt = args.prompt; // プロンプトを保存
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

      case 'execute_send':
        if (!args.confirm) {
          return { error: '送信がキャンセルされました。confirm: true で再度呼び出してください。' };
        }
        return await callQuadAPI('/api/execute-send');

      case 'refresh_pane':
        return await callQuadAPI('/api/refresh-pane', { pane: args.pane || null });

      case 'grok_api_call':
        if (!args.prompt) {
          return { error: 'prompt は必須パラメータです' };
        }
        return await callGrokAPI(
          args.prompt,
          args.systemPrompt || 'You are a helpful assistant.',
          args.maxTokens || 1000
        );

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

  const lines = inputBuffer.split('\n');
  inputBuffer = lines.pop() || '';

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

async function handleMCPMessage(message) {
  const { jsonrpc, id, method, params } = message;

  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }
    };
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

    case 'notifications/initialized':
      return null;

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
║  xAI Grok API: Enabled ✓                                 ║
║  Tools: get_responses, send_prompt, export_json,         ║
║         navigate, get_status, execute_send, grok_api_call║
╚══════════════════════════════════════════════════════════╝
`);
