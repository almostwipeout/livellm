# Quad Browser - Changelog

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
