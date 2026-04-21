import type { Locale, ReadWorkspaceFileResult } from '../../../shared/domain.js';

interface FilePreviewProps {
  locale: Locale;
  file: ReadWorkspaceFileResult | null;
  isLoading: boolean;
  errorMessage: string | null;
}

export function FilePreview({ locale, file, isLoading, errorMessage }: FilePreviewProps): React.JSX.Element {
  return (
    <section className="section-panel inlay-card preview-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '预览' : 'Preview'}</p>
          <h3>{file?.relativePath ?? (locale === 'zh' ? '选择一个文本文件' : 'Select a text file')}</h3>
        </div>
        {file ? <span className="status-pill">{file.truncated ? (locale === 'zh' ? '截断预览' : 'Trimmed preview') : (locale === 'zh' ? '完整预览' : 'Full preview')}</span> : null}
      </div>

      {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}
      {isLoading ? <p className="empty-state">{locale === 'zh' ? '预览加载中...' : 'Loading preview...'}</p> : null}
      {!isLoading && !errorMessage && !file ? (
        <p className="empty-state tall">{locale === 'zh' ? '先在浏览器中选择文件，再在这里查看内容。' : 'Choose a file in the explorer to inspect it here before chatting.'}</p>
      ) : null}

      {!isLoading && file ? (
        <>
          <div className="preview-meta-row">
            <span className="mini-meta">{file.totalBytes.toLocaleString()} bytes</span>
            {file.truncated ? <span className="mini-meta">{locale === 'zh' ? '这里只显示文件的前半部分。' : 'Only the first part of the file is shown.'}</span> : null}
          </div>
          <pre className="preview-code"><code>{file.content}</code></pre>
        </>
      ) : null}
    </section>
  );
}
