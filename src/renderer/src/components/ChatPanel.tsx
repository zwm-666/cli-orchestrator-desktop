import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Locale } from '../../../shared/domain.js';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  locale: Locale;
  messages: ChatMessage[];
  inputValue: string;
  isSending: boolean;
  canSend: boolean;
  isProviderReady: boolean;
  includeSelection: boolean;
  errorMessage: string | null;
  selectedFilePath: string | null;
  providerLabel: string | null;
  modelLabel: string | null;
  onInputChange: (value: string) => void;
  onIncludeSelectionChange: (value: boolean) => void;
  onSubmit: () => void;
}

export function ChatPanel(props: ChatPanelProps): React.JSX.Element {
  const {
    locale,
    messages,
    inputValue,
    isSending,
    canSend,
    isProviderReady,
    includeSelection,
    errorMessage,
    selectedFilePath,
    providerLabel,
    modelLabel,
    onInputChange,
    onIncludeSelectionChange,
    onSubmit,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 60)}px`;
  }, [inputValue]);

  return (
    <section className="section-panel inlay-card chat-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '模型服务对话' : 'Direct provider chat'}</p>
          <h3>{locale === 'zh' ? '基于仓库上下文继续工作' : 'Continue with repo context'}</h3>
        </div>
      </div>

      {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}

      <div className="chat-thread">
        {messages.length === 0 ? (
          <p className="empty-state tall">{locale === 'zh' ? '先发出一个问题、修改请求或实现说明，继续当前工作。' : 'Start with a question, rewrite request, or implementation brief for the current work.'}</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`chat-message is-${message.role}`}>
              <div className="chat-message-topline">
                <span className="status-pill">{message.role === 'user' ? (locale === 'zh' ? '你' : 'You') : (locale === 'zh' ? '助手' : 'Assistant')}</span>
              </div>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>

      <div className="chat-composer">
        <div className="chat-badge-row">
          <span className="status-pill">{providerLabel ?? (locale === 'zh' ? '未选择模型服务' : 'No provider')}</span>
          <span className="status-pill">{modelLabel ?? (locale === 'zh' ? '未指定模型' : 'No model')}</span>
        </div>

        {!isProviderReady ? (
          <p className="mini-meta chat-readiness-note">
            {locale === 'zh' ? (
              <>
                <span>先通过“切换工作台”选择模型服务；若仍不可用，请前往 </span>
                <Link to="/config">配置页</Link>
                <span> 保存 API 密钥、服务地址与模型。</span>
              </>
            ) : (
              <>
                <span>Choose a provider from “Switch workbench”; if chat is still unavailable, save the API key, base URL, and model in </span>
                <Link to="/config">Config</Link>
                <span>.</span>
              </>
            )}
          </p>
        ) : null}

        <label className="field">
          <span>{locale === 'zh' ? '提示词' : 'Prompt'}</span>
          <textarea
            ref={textareaRef}
            value={inputValue}
            rows={3}
            placeholder={locale === 'zh' ? '可继续编辑自动生成的连续工作提示词，或补充新的要求。' : 'Edit the generated continuity prompt or append the next instruction.'}
            onChange={(event) => {
              onInputChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();

                if (!canSend || isSending) {
                  return;
                }

                onSubmit();
              }
            }}
          />
        </label>

        <label className="toggle-field include-toggle">
          <input
            type="checkbox"
            checked={includeSelection}
            disabled={!selectedFilePath}
            onChange={(event) => {
              onIncludeSelectionChange(event.target.checked);
            }}
          />
          <span>{selectedFilePath ? (locale === 'zh' ? `下一条消息包含 ${selectedFilePath}` : `Include ${selectedFilePath} in the next message`) : (locale === 'zh' ? '先选择文件，文件上下文会自动加入' : 'Select a file to include it in chat')}</span>
        </label>

        <div className="form-actions">
          <button type="button" className="primary-button chat-send-button" disabled={!canSend || isSending} onClick={onSubmit}>
            {isSending ? (locale === 'zh' ? '发送中...' : 'Sending...') : locale === 'zh' ? '发送' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  );
}
