import { useEffect, useMemo, useState } from 'react';
import type { Locale, ReadWorkspaceFileResult } from '../../../shared/domain.js';

interface FileEditorProps {
  locale: Locale;
  file: ReadWorkspaceFileResult | null;
  isLoading: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  onSave: (content: string) => void;
}

const getLanguageLabel = (relativePath: string): string => {
  const extension = relativePath.split('.').at(-1)?.toLowerCase() ?? '';
  if (!extension || extension === relativePath.toLowerCase()) {
    return 'text';
  }

  return extension;
};

export function FileEditor({ locale, file, isLoading, isSaving, errorMessage, onSave }: FileEditorProps): React.JSX.Element {
  const [draftContent, setDraftContent] = useState(file?.content ?? '');

  useEffect(() => {
    setDraftContent(file?.content ?? '');
  }, [file?.content, file?.relativePath]);

  const isDirty = Boolean(file && draftContent !== file.content);
  const isReadOnly = Boolean(file?.truncated);
  const lineNumbers = useMemo(() => {
    const lineCount = Math.max(draftContent.split('\n').length, 1);
    return Array.from({ length: lineCount }, (_entry, index) => index + 1).join('\n');
  }, [draftContent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!isPrimaryModifier || event.key.toLowerCase() !== 's') {
        return;
      }

      if (!file || isReadOnly) {
        return;
      }

      event.preventDefault();
      onSave(draftContent);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [draftContent, file, isReadOnly, onSave]);

  return (
    <section className="section-panel inlay-card file-editor-panel">
      <div className="section-heading workspace-pane-heading file-editor-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '文件编辑器' : 'File editor'}</p>
          <h3>{file?.relativePath ?? (locale === 'zh' ? '选择一个文本文件' : 'Select a text file')}</h3>
          {file ? (
            <p className="mini-meta">
              {file.totalBytes.toLocaleString()} bytes · {getLanguageLabel(file.relativePath)}
              {isDirty ? ` · ${locale === 'zh' ? '未保存' : 'Unsaved'}` : ''}
            </p>
          ) : null}
        </div>
        <div className="card-actions">
          {file ? <span className={`status-pill ${isDirty ? 'file-editor-dirty-indicator' : ''}`}>{isDirty ? (locale === 'zh' ? '已修改' : 'Dirty') : (locale === 'zh' ? '已保存' : 'Saved')}</span> : null}
          <button type="button" className="primary-button" onClick={() => { onSave(draftContent); }} disabled={!file || !isDirty || isSaving || isReadOnly}>
            {isSaving ? (locale === 'zh' ? '保存中...' : 'Saving...') : locale === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </div>

      {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}
      {file?.truncated ? (
        <div className="status-banner status-warning">
          <p>{locale === 'zh' ? '文件在 256KB 处截断；为避免误写，当前为只读。' : 'File truncated at 256KB — editing is disabled to avoid partial writes.'}</p>
        </div>
      ) : null}
      {isLoading ? <p className="empty-state">{locale === 'zh' ? '文件加载中...' : 'Loading file...'}</p> : null}
      {!isLoading && !errorMessage && !file ? (
        <p className="empty-state tall">{locale === 'zh' ? '从左侧文件树选择文件，在这里查看和编辑。' : 'Choose a file from the tree to view and edit it here.'}</p>
      ) : null}

      {file ? (
        <div className="file-editor-shell">
          <pre className="file-editor-line-numbers" aria-hidden="true">{lineNumbers}</pre>
          <textarea
            className="file-editor-textarea"
            value={draftContent}
            readOnly={isReadOnly || isSaving}
            spellCheck={false}
            onChange={(event) => {
              setDraftContent(event.target.value);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
