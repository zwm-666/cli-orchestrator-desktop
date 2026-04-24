import type { Locale } from '../../../shared/domain.js';

interface FolderSelectPageProps {
  locale: Locale;
  currentWorkspaceRoot: string | null;
  recentWorkspaceRoots: string[];
  isSelecting: boolean;
  onOpenFolder: () => void;
  onOpenRecentWorkspace: (workspaceRoot: string) => void;
  onRemoveRecentWorkspace: (workspaceRoot: string) => void;
}

const getFolderLabel = (workspaceRoot: string): string => {
  return workspaceRoot.split(/[/\\]/).filter(Boolean).at(-1) ?? workspaceRoot;
};

export function FolderSelectPage(props: FolderSelectPageProps): React.JSX.Element {
  const {
    locale,
    currentWorkspaceRoot,
    recentWorkspaceRoots,
    isSelecting,
    onOpenFolder,
    onOpenRecentWorkspace,
    onRemoveRecentWorkspace,
  } = props;

  return (
    <main className="project-select-page folder-select-page">
      <section className="project-select-card card">
        <div className="project-select-hero">
          <div className="brand-mark">CO</div>
          <div>
            <p className="section-label">{locale === 'zh' ? '选择项目' : 'Select folder'}</p>
            <h1>{locale === 'zh' ? '打开项目文件夹开始任务规划' : 'Open a project folder to start planning'}</h1>
            <p className="muted">
              {locale === 'zh'
                ? '流程会从文件夹开始，然后创建任务计划，最后进入 Cursor 风格工作区。'
                : 'The flow starts with a folder, then a task plan, then the Cursor-like workspace.'}
            </p>
          </div>
        </div>

        <div className="card-actions">
          <button type="button" className="primary-button" onClick={onOpenFolder} disabled={isSelecting}>
            {isSelecting ? (locale === 'zh' ? '正在打开...' : 'Opening...') : locale === 'zh' ? '打开项目文件夹' : 'Open Project Folder'}
          </button>
        </div>

        <section className="project-select-recent-list">
          <div className="section-heading workspace-pane-heading">
            <div>
              <p className="section-label">{locale === 'zh' ? '最近文件夹' : 'Recent folders'}</p>
              <h3>{locale === 'zh' ? '选择一个已有项目继续' : 'Continue from a recent project'}</h3>
            </div>
            <span className="status-pill">{recentWorkspaceRoots.length}</span>
          </div>

          {recentWorkspaceRoots.length === 0 ? (
            <p className="empty-state">{locale === 'zh' ? '还没有最近项目。' : 'No recent folders yet.'}</p>
          ) : (
            <div className="stack-list">
              {recentWorkspaceRoots.map((workspaceRoot) => {
                const isCurrent = workspaceRoot === currentWorkspaceRoot;
                return (
                  <article key={workspaceRoot} className="list-card project-select-recent-card folder-select-recent-card">
                    <button
                      type="button"
                      className="project-select-recent-main"
                      onClick={() => {
                        onOpenRecentWorkspace(workspaceRoot);
                      }}
                    >
                      <strong>{getFolderLabel(workspaceRoot)}</strong>
                      <span className="mini-meta">{workspaceRoot}</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-button secondary-button-compact"
                      onClick={() => {
                        onRemoveRecentWorkspace(workspaceRoot);
                      }}
                      disabled={isCurrent}
                      title={isCurrent ? (locale === 'zh' ? '当前项目不能从最近列表移除' : 'The current project stays in recent folders') : undefined}
                    >
                      {locale === 'zh' ? '移除' : 'Remove'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
