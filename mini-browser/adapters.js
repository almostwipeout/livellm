/**
 * AI Platform Adapters
 *
 * 各AIサービス専用のDOM操作ロジックを定義。
 *
 * 思想：
 * - 汎用セレクタに逃げない
 * - 各プラットフォームの構造を理解して専用化
 * - 新しいAIを追加する時はAdapterを追加するだけ
 *
 * @example
 * const adapter = getAdapter('ChatGPT');
 * const content = adapter.extractResponse(document);
 */

const ADAPTERS = {
  /**
   * ChatGPT (chatgpt.com)
   * - 回答は [data-message-author-role="assistant"] 内
   * - 入力は #prompt-textarea
   */
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
    ],
    extractResponse: function(doc) {
      for (const selector of this.responseSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          // 最後の回答を取得
          const last = elements[elements.length - 1];
          return last.innerText || last.textContent || '';
        }
      }
      return null;
    },
    inputPrompt: function(doc, prompt) {
      for (const selector of this.inputSelectors) {
        const el = doc.querySelector(selector);
        if (el) {
          el.value = prompt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    }
  },

  /**
   * Gemini (gemini.google.com)
   * - 回答は .model-response-text または .response-content 内
   * - 入力は rich-textarea または [contenteditable]
   */
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
    ],
    extractResponse: function(doc) {
      for (const selector of this.responseSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          return last.innerText || last.textContent || '';
        }
      }
      return null;
    },
    inputPrompt: function(doc, prompt) {
      for (const selector of this.inputSelectors) {
        const el = doc.querySelector(selector);
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
    }
  },

  /**
   * Claude (claude.ai)
   * - 回答は [data-is-streaming] 内、または .prose
   * - 入力は [contenteditable] の ProseMirror エディタ
   */
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
    ],
    extractResponse: function(doc) {
      for (const selector of this.responseSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          return last.innerText || last.textContent || '';
        }
      }
      return null;
    },
    inputPrompt: function(doc, prompt) {
      for (const selector of this.inputSelectors) {
        const el = doc.querySelector(selector);
        if (el) {
          if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            el.value = prompt;
          } else {
            // ProseMirror は innerText で入力
            el.innerText = prompt;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    }
  },

  /**
   * Grok (grok.com / x.com/i/grok)
   * - 回答は .message-bubble 内、または article 内
   * - 入力は textarea
   */
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
    ],
    extractResponse: function(doc) {
      for (const selector of this.responseSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          return last.innerText || last.textContent || '';
        }
      }
      return null;
    },
    inputPrompt: function(doc, prompt) {
      for (const selector of this.inputSelectors) {
        const el = doc.querySelector(selector);
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
    }
  }
};

/**
 * フォールバックAdapter
 * 未知のサイト用。汎用セレクタで最善を尽くす。
 */
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
  ],
  extractResponse: function(doc) {
    for (const selector of this.responseSelectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        const last = elements[elements.length - 1];
        return last.innerText || last.textContent || '';
      }
    }
    // 最終手段：body全体（切り詰め）
    return (doc.body.innerText || '').substring(0, 5000);
  },
  inputPrompt: function(doc, prompt) {
    for (const selector of this.inputSelectors) {
      const el = doc.querySelector(selector);
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
  }
};

/**
 * ソース名からAdapterを取得
 * @param {string} source - AI名（ChatGPT, Gemini, Claude, Grok）
 * @returns {Object} Adapter
 */
function getAdapter(source) {
  return ADAPTERS[source] || FALLBACK_ADAPTER;
}

// Node.js環境用のエクスポート（main.jsから使う場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ADAPTERS, FALLBACK_ADAPTER, getAdapter };
}
