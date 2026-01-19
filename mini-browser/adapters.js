/**
 * AI Platform Adapters
 *
 * 各AIサービス専用のDOM操作ロジックを定義。
 *
 * 思想：
 * - 汎用セレクタに逃げない
 * - 各プラットフォームの構造を理解して専用化
 * - 新しいAIを追加する時はAdapterを追加するだけ
 */

const ADAPTERS = {
  ChatGPT: {
    name: 'ChatGPT',
    responseSelectors: [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
      '.agent-turn .markdown'
    ],
    inputSelectors: [
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'textarea'
    ]
  },

  Gemini: {
    name: 'Gemini',
    responseSelectors: [
      '.model-response-text .markdown-main-panel',
      '.model-response-text',
      '.response-content',
      'message-content[class*="model"]'
    ],
    inputSelectors: [
      'rich-textarea .ql-editor',
      'rich-textarea',
      '[contenteditable="true"]',
      'textarea'
    ]
  },

  Claude: {
    name: 'Claude',
    responseSelectors: [
      '.font-claude-message .prose',
      '[data-is-streaming="false"] .prose',
      '.prose',
      '.message-content'
    ],
    inputSelectors: [
      '.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea'
    ]
  },

  Grok: {
    name: 'Grok',
    responseSelectors: [
      '[data-testid="grok-message"]',
      '.message-bubble.assistant',
      '.grok-response',
      'article .prose'
    ],
    inputSelectors: [
      'textarea[placeholder*="Ask"]',
      'textarea',
      '[contenteditable="true"]'
    ]
  }
};

const FALLBACK_ADAPTER = {
  name: 'Unknown',
  responseSelectors: [
    '.markdown-body',
    '.prose',
    'article',
    '.message-content',
    '.response'
  ],
  inputSelectors: [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]'
  ]
};

function getAdapter(source) {
  return ADAPTERS[source] || FALLBACK_ADAPTER;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ADAPTERS, FALLBACK_ADAPTER, getAdapter };
}

