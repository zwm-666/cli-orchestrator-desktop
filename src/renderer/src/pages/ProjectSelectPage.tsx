import type { Locale } from '../../../shared/domain.js';

interface ProjectSelectPageProps {
  locale: Locale;
  recentWorkspaceRoots: string[];
  onOpenFolder: () => void;
  onOpenRecentWorkspace: (workspaceRoot: string) => void;
}

export function ProjectSelectPage({ locale, recentWorkspaceRoots, onOpenFolder, onOpenRecentWorkspace }: ProjectSelectPageProps): React.JSX.Element {
  return (
    <main className="project-select-page">
      <section className="project-select-card card">
        <div className="project-select-hero">
          <div className="brand-mark">CO</div>
          <div>
            <p className="section-label">{locale === 'zh' ? '项目启动' : 'Project startup'}</p>
            <h1>{locale === 'zh' ? '选择一个项目文件夹开始协作' : 'Choose a project folder to start collaborating'}</h1>
            <p className="muted">
              {locale === 'zh'
                ? '首次进入先选择工作目录，之后就会直接进入对话式工作台。'
                : 'Pick the active workspace root once, then return directly to the conversational workbench next time.'}
            </p>
          </div>
        </div>

        <div className="card-actions">
          <button type="button" className="primary-button" onClick={onOpenFolder}>
            {locale === 'zh' ? '打开文件夹' : 'Open folder'}
          </button>
        </div>

        <section className="project-select-recent-list">
          <div className="section-heading workspace-pane-heading">
            <div>
              <p className="section-label">{locale === 'zh' ? '最近项目' : 'Recent projects'}</p>
              <h3>{locale === 'zh' ? '快速恢复最近的工作空间' : 'Jump back into a recent workspace'}</h3>
            </div>
          </div>

          {recentWorkspaceRoots.length === 0 ? (
            <p className="empty-state">{locale === 'zh' ? '还没有保存过最近项目。' : 'No recent projects have been saved yet.'}</p>
          ) : (
            <div className="stack-list">
              {recentWorkspaceRoots.map((workspaceRoot) => (
                <button
                  key={workspaceRoot}
                  type="button"
                  className="list-card project-select-recent-card"
                  onClick={() => {
                    onOpenRecentWorkspace(workspaceRoot);
                  }}
                >
                  <strong>{workspaceRoot.split(/[/\\]/).filter(Boolean).at(-1) ?? workspaceRoot}</strong>
                  <span className="mini-meta">{workspaceRoot}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
