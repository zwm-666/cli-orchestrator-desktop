interface ChatMessageContentProps {
  content: string;
  canApplyToFile: boolean;
  locale: 'en' | 'zh';
  selectedFilePath: string | null;
  onApplyToFile: (content: string) => void | Promise<void>;
}

interface ChatSegment {
  type: 'text' | 'code';
  value: string;
  language: string | null;
}

const CODE_BLOCK_PATTERN = /```([\w-]+)?\n([\s\S]*?)```/g;

const parseSegments = (content: string): ChatSegment[] => {
  const segments: ChatSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(CODE_BLOCK_PATTERN)) {
    const startIndex = match.index;
    if (startIndex > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, startIndex),
        language: null,
      });
    }

    segments.push({
      type: 'code',
      value: match[2] ?? '',
      language: match[1] || null,
    });
    lastIndex = startIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
      language: null,
    });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: content, language: null }];
};

export function ChatMessageContent({ content, canApplyToFile, locale, selectedFilePath, onApplyToFile }: ChatMessageContentProps): React.JSX.Element {
  const segments = parseSegments(content);

  return (
    <div className="chat-message-content">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <p key={`text-${index}`} className="chat-message-text">
              {segment.value.trim()}
            </p>
          );
        }

        return (
          <div key={`code-${index}`} className="chat-code-block">
            <div className="chat-code-toolbar">
              <span className="status-pill">{segment.language ?? (locale === 'zh' ? '代码块' : 'Code block')}</span>
              <button
                type="button"
                className="secondary-button secondary-button-compact"
                disabled={!canApplyToFile}
                title={selectedFilePath ?? undefined}
                onClick={() => {
                  void onApplyToFile(segment.value);
                }}
              >
                {locale === 'zh' ? '应用到当前文件' : 'Apply to current file'}
              </button>
            </div>
            <pre className="preview-code"><code>{segment.value}</code></pre>
          </div>
        );
      })}
    </div>
  );
}
