import { useEffect, useMemo, useRef } from 'react';
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
  activeThreadId: string | null;
  threadOptions: WorkbenchOption[];
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
  onThreadChange: (threadId: string) => void;
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
    activeThreadId,
    threadOptions,
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
    onThreadChange,
    onSubmit,
    onNewThread,
    onDropFile,
    onApplyCodeToFile,
    onRetryMessage,
  } = props;

  const textareaRef = inputRef;
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 72)}px`;
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
  const activeThreadLabel = threadOptions.find((option) => option.id === activeThreadId)?.label ?? (locale === 'zh' ? '当前对话' : 'Current chat');

  return (
    <section className="section-panel inlay-card chat-panel cursor-chat-panel">
      <div className="cursor-chat-topbar" aria-label={locale === 'zh' ? '对话工具栏' : 'Chat toolbar'}>
        <button type="button" className="chat-icon-button" onClick={() => { textareaRef.current?.focus(); }} aria-label={locale === 'zh' ? '聚焦对话输入框' : 'Focus chat input'} title={locale === 'zh' ? '聚焦对话输入框' : 'Focus chat input'}>
          💬
        </button>

        <label className="chat-thread-picker">
          <span className="sr-only">{locale === 'zh' ? '查看之前的对话' : 'View previous conversations'}</span>
          <select value={activeThreadId ?? ''} onChange={(event) => { onThreadChange(event.target.value); }}>
            {threadOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <span className="chat-thread-title" aria-hidden="true">{activeThreadLabel}</span>
        </label>

        <div className="cursor-chat-topbar-actions">
          <button type="button" className="chat-icon-button" onClick={onNewThread} aria-label={locale === 'zh' ? '创建新对话' : 'Create new chat'} title={locale === 'zh' ? '创建新对话' : 'Create new chat'}>
            ✎
          </button>
        </div>
      </div>

      <div className="cursor-chat-entry-banner">
        <span>{locale === 'zh' ? '对话入口' : 'Chat entry'}</span>
        <button type="button" onClick={() => { textareaRef.current?.focus(); }}>
          {locale === 'zh' ? '点击这里开始对话' : 'Click here to start chatting'}
        </button>
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
                        <span className="status-pill">{chunk.language ?? 'text'}</span>
                        <button
                          type="button"
                          className="secondary-button secondary-button-compact"
                          onClick={() => {
                            void navigator.clipboard.writeText(chunk.value);
                          }}
                        >
                          ⧉
                        </button>
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
                              ? '写入'
                              : 'Apply'}
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
        <label className="chat-input-field cursor-composer-input-shell">
          <span className="sr-only">{locale === 'zh' ? '输入' : 'Prompt'}</span>
          <textarea
            ref={textareaRef}
            value={inputValue}
            rows={3}
            placeholder={locale === 'zh' ? '在这里输入对话内容，按 Enter 发送' : 'Type your message here, press Enter to send'}
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

        <div className="cursor-composer-control-row">
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const [selectedFile] = Array.from(event.target.files ?? []) as (File & { path?: string })[];
              if (typeof selectedFile?.path === 'string' && selectedFile.path.length > 0) {
                onDropFile(selectedFile.path);
              }
              event.target.value = '';
            }}
          />
          <button type="button" className="composer-plus-button" onClick={() => { fileInputRef.current?.click(); }} aria-label={locale === 'zh' ? '上传文件' : 'Upload file'} title={locale === 'zh' ? '上传文件作为上下文' : 'Upload a file as context'}>
            +
          </button>

          <label className="composer-control-chip">
            <span className="sr-only">{locale === 'zh' ? '目标' : 'Target'}</span>
            <select value={selectedTargetOptionId} onChange={(event) => { onTargetOptionChange(event.target.value); }}>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="composer-control-chip">
            <span className="sr-only">{locale === 'zh' ? 'Agent' : 'Agent'}</span>
            <select value={selectedAgentProfileId} onChange={(event) => { onAgentProfileChange(event.target.value); }}>
              <option value="">{locale === 'zh' ? '默认 Agent' : 'Default agent'}</option>
              {agentProfileOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="composer-model-chip">
            <span className="sr-only">{locale === 'zh' ? '模型' : 'Model'}</span>
            <input list="chat-model-options" value={targetModel} onChange={(event) => { onTargetModelChange(event.target.value); }} />
            <datalist id="chat-model-options">
              {targetModelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>

          <button type="button" className="chat-send-button cursor-send-button" disabled={!canSend || isSending} onClick={onSubmit} aria-label={isSending ? (locale === 'zh' ? '处理中' : 'Working') : locale === 'zh' ? '发送' : 'Send'}>
            {isSending ? '…' : '↑'}
          </button>
        </div>

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

        </div>
      </div>
    </section>
  );
}
