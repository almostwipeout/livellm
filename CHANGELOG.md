# Quad Browser - Changelog

## [V1.2.1] - 2026-01-18

### コードリファクタリング - 4LLMレビュー反映

**背景:**
GPT-5 Pro、Gemini Ultra、Claude、Grok の4LLMからコードレビューを受けた。
共通指摘: 「思想は良い、実装が追いついてない」（70点評価）

**4LLMからの主な指摘:**
| 指摘 | 問題 | 解決策 |
|------|------|--------|
| DRY違反 | getResponses/exportJSONで重複 | 取得・構造化・保存を分離 |
| 汎用セレクタ | 各AI専用化されていない | Adapterパターン導入 |
| if文連打 | 抽象化不足 | Strategy/Adapterで統一 |
| 意図不明 | コメント不足 | 思想をコードに載せる |

**変更内容:**

1. **adapters.js 新規追加**
   - 各AI専用のセレクタとロジックを分離
   - ChatGPT, Gemini, Claude, Grok それぞれ専用Adapter
   - フォールバック用のUnknown Adapter

2. **main.js リファクタリング**
   - セクション分け（Window / API / Core / Helper / IPC / Lifecycle）
   - `getAllResponses()` - 取得のみ
   - `exportToJSON()` - 構造化のみ（getAllResponsesを呼ぶ）
   - 重複コード排除

3. **mcp-server.js 改善**
   - アーキテクチャ図をコメントに追加
   - タイムアウト設定追加
   - エラーメッセージの詳細化
   - 起動時バナー追加

**ファイル構造:**
```
mini-browser/
├── adapters.js     ← NEW: 各AI専用Adapter
├── main.js         ← リファクタリング済
├── mcp-server.js   ← 改善済
├── preload.js
├── index.html
└── package.json
```

**設計思想:**
```
「汎用セレクタに逃げない」
「各AIの構造を理解して専用化」
「取得・構造化・保存を明確に分離」
```

---

## [V1.2] - 2026-01-18

### 赤兎馬ラウザー - MCP対応

**コンセプト:**
ClaudeがQuad Browserを「乗りこなす」ためのMCPサーバー実装。
関羽が赤兎馬に乗るように、Claudeが4LLMを操縦できるようになった。

**新機能:**
- **MCPサーバー** (`mcp-server.js`) - Claude Desktop/Claude Codeから接続可能
- **HTTP API** (port 19850) - MCPサーバーとElectronアプリの連携用

**MCPツール:**
| ツール | 説明 |
|--------|------|
| `get_responses` | 4LLMの回答を一括取得 |
| `send_prompt` | 4LLMに同時にプロンプト入力 |
| `export_json` | JSON形式でエクスポート |
| `navigate` | 指定ペインのURL変更 |
| `get_status` | 現在の状態を取得 |

**使い方:**
```bash
# Quad Browserを起動
npm start

# Claude Desktopの設定に追加
# ~/.config/claude/claude_desktop_config.json (Mac/Linux)
# %APPDATA%\Claude\claude_desktop_config.json (Windows)
```

```json
{
  "mcpServers": {
    "quad-browser": {
      "command": "node",
      "args": ["C:\\Users\\s\\livellm\\mini-browser\\mcp-server.js"]
    }
  }
}
```

**アーキテクチャ:**
```
Claude（関羽）
    ↓ MCP (stdio)
mcp-server.js
    ↓ HTTP (localhost:19850)
Quad Browser（赤兎馬）
    ↓ webview
ChatGPT / Gemini / Claude / Grok
```

---

## [V1.1] - 2026-01-18

### JSONエクスポート機能追加

**新機能:**
- **EXPORTボタン** - 4つのLLMの回答をJSON形式で一括保存
- 各webviewから最後の応答テキストを自動抽出
- デスクトップにタイムスタンプ付きJSONファイルを保存

**出力フォーマット:**
```json
{
  "context": "Quad Browser export",
  "timestamp": "2026-01-18T...",
  "items": [
    { "source": "ChatGPT", "url": "...", "content": "...", "note": "" },
    { "source": "Gemini", "url": "...", "content": "...", "note": "" },
    { "source": "Claude", "url": "...", "content": "...", "note": "" },
    { "source": "Grok", "url": "...", "content": "...", "note": "" }
  ]
}
```

**設計思想（GPT-5 Pro との議論より）:**
- n8n: 使わない（今は）
- API: 使わない
- 自動化: 最小
- 思考の摩擦が一番小さい構造を選択

---

## [V1.0] - 2026-01-18

### Initial Release - 4分割AIブラウザ

**概要:**
4つのAI（ChatGPT, Gemini, Claude, Grok）を同時に表示・操作できるElectronベースのデスクトップブラウザ

**機能:**
- 4分割レイアウト（1/2/4画面切り替え対応）
- 各パネルにURLバー + GOボタン
- SETTINGS画面
- シアン/パープルのサイバーなUIテーマ
- 各パネルの座標・サイズ表示（デバッグ用）

**技術スタック:**
- Electron
- HTML/CSS/JavaScript
- preload.js（セキュリティ用）

**ローカル開発パス:**
```
C:\Users\s\livellm\mini-browser
```

---

## バージョン管理ルール

- 機能追加: V1.0 → V1.1 → V1.2...
- 大きな変更: V1.x → V2.0
- バグ修正のみ: V1.0.1 など（必要に応じて）

---

## 開発ノート

### 2026-01-18
- V1.0 初回リリース
- 4LLM同時運用でプロンプト投入 → 手動コピー → Gemini Ultraでまとめ → GPT-5 Proと設計相談というワークフローで使用中
