import { useEffect, useMemo } from 'react';
import type { Locale, OrchestrationRun, TaskThreadMessage } from '../../../shared/domain.js';
import type { ComposerTargetOption } from '../hooks/useWorkbenchController.js';
import type { WorkbenchOption } from '../hooks/workbenchControllerShared.js';

interface ChatPanelProps {
  locale: Locale;
  messages: TaskThreadMessage[];
  inputValue: string;
  isSending: boolean;
  canSend: boolean;
  errorMessage: string | null;
  selectedFilePath: string | null;
  selectedTargetOptionId: string;
  targetOptions: ComposerTargetOption[];
  selectedAgentProfileId: string;
  agentProfileOptions: WorkbenchOption[];
  targetModel: string;
  targetModelOptions: string[];
  activeOrchestrationRun: OrchestrationRun | null;
  isApplyingFile: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onTargetOptionChange: (value: string) => void;
  onAgentProfileChange: (value: string) => void;
  onTargetModelChange: (value: string) => void;
  onSubmit: () => void;
  onNewThread: () => void;
  onDropFile: (absolutePath: string) => void;
  onApplyCodeToFile: (code: string) => void;
  onRetryMessage: (message: TaskThreadMessage) => void;
}

interface ParsedChunk {
  type: 'text' | 'code';
  value: string;
  language: string | null;
}

const COMMAND_OPTIONS = ['/orchestrate', '/discuss', '/clear', '/switchProvider'] as const;

const parseMessageContent = (content: string): ParsedChunk[] => {
  const pattern = /```([\w-]+)?\n([\s\S]*?)```/g;
  const chunks: ParsedChunk[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      chunks.push({ type: 'text', value: content.slice(lastIndex, matchIndex), language: null });
    }

    chunks.push({
      type: 'code',
      value: match[2] ?? '',
      language: match[1] ?? null,
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    chunks.push({ type: 'text', value: content.slice(lastIndex), language: null });
  }

  return chunks.length > 0 ? chunks : [{ type: 'text', value: content, language: null }];
};

const getMessageRoleLabel = (locale: Locale, message: TaskThreadMessage): string => {
  if (message.role === 'user') {
    return locale === 'zh' ? '你' : 'You';
  }

  if (message.role === 'system') {
    return locale === 'zh' ? '系统' : 'System';
  }

  return locale === 'zh' ? '助手' : 'Assistant';
};

const getMessageKindLabel = (locale: Locale, message: TaskThreadMessage): string | null => {
  if (message.messageKind === 'discussion_final') {
    return locale === 'zh' ? '最终方案' : 'Final plan';
  }

  if (message.messageKind === 'orchestration_event') {
    return locale === 'zh' ? '实时输出' : 'Live output';
  }

  if (message.messageKind === 'orchestration_result') {
    return locale === 'zh' ? 'Agent 结论' : 'Agent result';
  }

  return null;
};

export function ChatPanel(props: ChatPanelProps): React.JSX.Element {
  const {
    locale,
    messages,
    inputValue,
    isSending,
    canSend,
    errorMessage,
    selectedFilePath,
    selectedTargetOptionId,
    targetOptions,
    selectedAgentProfileId,
    agentProfileOptions,
    targetModel,
    targetModelOptions,
    activeOrchestrationRun,
    isApplyingFile,
    inputRef,
    onInputChange,
    onTargetOptionChange,
    onAgentProfileChange,
    onTargetModelChange,
    onSubmit,
    onNewThread,
    onDropFile,
    onApplyCodeToFile,
    onRetryMessage,
  } = props;

  const textareaRef = inputRef;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 96)}px`;
  }, [inputValue, textareaRef]);

  const showCommandMenu = inputValue.trimStart().startsWith('/');
  const activeMentionQuery = useMemo(() => {
    const matched = /(?:^|\s)@([^\s]*)$/u.exec(inputValue);
    return matched?.[1]?.toLowerCase() ?? null;
  }, [inputValue]);
  const filteredAgentOptions = useMemo(() => {
    if (activeMentionQuery === null) {
      return [];
    }

    return agentProfileOptions.filter((option) => option.label.toLowerCase().includes(activeMentionQuery));
  }, [activeMentionQuery, agentProfileOptions]);

  return (
    <section className="section-panel inlay-card chat-panel cursor-chat-panel">
      <div className="section-heading workspace-pane-heading chat-panel-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '对话工作流' : 'Conversational workflow'}</p>
          <h3>{locale === 'zh' ? '统一消息流' : 'Unified message stream'}</h3>
        </div>
        <div className="card-actions">
          <button type="button" className="secondary-button secondary-button-compact" onClick={onNewThread}>
            {locale === 'zh' ? '新对话' : 'New chat'}
          </button>
        </div>
      </div>

      {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}

      {activeOrchestrationRun?.status === 'executing' ? (
        <div className="status-banner status-info">
          <p>
            {activeOrchestrationRun.automationMode === 'discussion'
              ? locale === 'zh'
                ? '讨论进行中… 你仍可继续输入意见或发起新的操作。'
                : 'Discussion in progress… you can still add guidance or start new actions.'
              : locale === 'zh'
                ? '编排执行中… Agent 输出会实时进入消息流。'
                : 'Orchestration running… agent output will stream into the chat timeline.'}
          </p>
        </div>
      ) : null}

      <div className="chat-thread cursor-chat-thread">
        {messages.length === 0 ? (
          <p className="empty-state tall">
            {locale === 'zh' ? '从一个问题、实现请求或 /orchestrate 命令开始。' : 'Start with a question, implementation request, or /orchestrate command.'}
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`chat-message is-${message.role} is-source-${message.sourceKind ?? 'none'} is-${message.messageKind ?? 'default'}`}
              data-orchestration-node-id={message.orchestrationNodeId ?? ''}
              data-message-id={message.id}
            >
              <div className="chat-message-topline">
                <span className="status-pill">{getMessageRoleLabel(locale, message)}</span>
                {getMessageKindLabel(locale, message) ? <span className="status-pill">{getMessageKindLabel(locale, message)}</span> : null}
                {message.agentLabel ? <span className="status-pill">@{message.agentLabel}</span> : null}
                {message.sourceLabel ? <span className="status-pill">{locale === 'zh' ? '经由' : 'via'} {message.sourceLabel}</span> : null}
                {message.modelLabel ? <span className="status-pill">{message.modelLabel}</span> : null}
                {message.discussionRound ? <span className="status-pill">{locale === 'zh' ? `第 ${message.discussionRound} 轮` : `Round ${message.discussionRound}`}</span> : null}
                <span className="chat-message-actions">
                  <button
                    type="button"
                    className="secondary-button secondary-button-compact"
                    onClick={() => {
                      void navigator.clipboard.writeText(message.content);
                    }}
                  >
                    {locale === 'zh' ? '复制' : 'Copy'}
                  </button>
                  {message.role === 'assistant' ? (
                    <button
                      type="button"
                      className="secondary-button secondary-button-compact"
                      onClick={() => {
                        onRetryMessage(message);
                      }}
                    >
                      {locale === 'zh' ? '重试' : 'Retry'}
                    </button>
                  ) : null}
                </span>
              </div>

              <div className="chat-message-body">
                {parseMessageContent(message.content).map((chunk, index) => (
                  chunk.type === 'text' ? (
                    <pre key={`${message.id}-text-${index}`} className="chat-message-text"><code>{chunk.value}</code></pre>
                  ) : (
                    <div key={`${message.id}-code-${index}`} className="chat-code-block">
                      <div className="chat-code-block-topline">
                        <span className="status-pill">{chunk.language ?? 'code'}</span>
                        <button
                          type="button"
                          className="secondary-button secondary-button-compact"
                          disabled={!selectedFilePath || isApplyingFile}
                          onClick={() => {
                            onApplyCodeToFile(chunk.value);
                          }}
                        >
                          {isApplyingFile
                            ? locale === 'zh'
                              ? '写入中...'
                              : 'Applying...'
                            : locale === 'zh'
                              ? 'Apply to file'
                              : 'Apply to file'}
                        </button>
                      </div>
                      <pre className="preview-code"><code>{chunk.value}</code></pre>
                    </div>
                  )
                ))}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="chat-composer cursor-chat-composer">
        <div className="chat-composer-toolbar">
          <label className="field compact-field">
            <span>{locale === 'zh' ? '目标' : 'Target'}</span>
            <select value={selectedTargetOptionId} onChange={(event) => { onTargetOptionChange(event.target.value); }}>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="field compact-field">
            <span>{locale === 'zh' ? 'Agent' : 'Agent'}</span>
            <select value={selectedAgentProfileId} onChange={(event) => { onAgentProfileChange(event.target.value); }}>
              <option value="">{locale === 'zh' ? '默认' : 'Default'}</option>
              {agentProfileOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="field compact-field">
            <span>{locale === 'zh' ? '模型' : 'Model'}</span>
            <input list="chat-model-options" value={targetModel} onChange={(event) => { onTargetModelChange(event.target.value); }} />
            <datalist id="chat-model-options">
              {targetModelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="field chat-input-field">
          <span>{locale === 'zh' ? '输入' : 'Prompt'}</span>
          <textarea
            ref={textareaRef}
            value={inputValue}
            rows={4}
            placeholder={locale === 'zh' ? '输入消息，或使用 /orchestrate、/discuss、/clear、/switchProvider。' : 'Type a message, or use /orchestrate, /discuss, /clear, /switchProvider.'}
            onChange={(event) => {
              onInputChange(event.target.value);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const [droppedFile] = Array.from(event.dataTransfer.files) as (File & { path?: string })[];
              if (typeof droppedFile?.path === 'string' && droppedFile.path.length > 0) {
                onDropFile(droppedFile.path);
              }
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

        {showCommandMenu ? (
          <div className="chat-inline-menu">
            {COMMAND_OPTIONS.map((command) => (
              <button
                key={command}
                type="button"
                className="secondary-button secondary-button-compact"
                onClick={() => {
                  onInputChange(`${command} `);
                }}
              >
                {command}
              </button>
            ))}
          </div>
        ) : null}

        {filteredAgentOptions.length > 0 ? (
          <div className="chat-inline-menu">
            {filteredAgentOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="secondary-button secondary-button-compact"
                onClick={() => {
                  onAgentProfileChange(option.id);
                  onInputChange(inputValue.replace(/(?:^|\s)@([^\s]*)$/, ' ').trimStart());
                }}
              >
                @{option.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="chat-composer-footer">
          <span className="mini-meta">
            {selectedFilePath
              ? locale === 'zh'
                ? `当前文件上下文：${selectedFilePath}`
                : `Current file context: ${selectedFilePath}`
              : locale === 'zh'
                ? '拖入一个工作区文件即可加入上下文。'
                : 'Drop a workspace file to load it into context.'}
          </span>

          <button type="button" className="primary-button chat-send-button" disabled={!canSend || isSending} onClick={onSubmit}>
            {isSending ? (locale === 'zh' ? '处理中...' : 'Working...') : locale === 'zh' ? '发送' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  );
}
