import type { Locale } from '../../../shared/domain.js';

interface WorkbenchProjectPanelProps {
  locale: Locale;
  workspaceRoot: string | null;
  workspaceLabel: string | null;
  statusMessage: string | null;
  onChooseWorkspace: () => void;
}

export function WorkbenchProjectPanel({ locale, workspaceRoot, workspaceLabel, statusMessage, onChooseWorkspace }: WorkbenchProjectPanelProps): React.JSX.Element {
  const hasWorkspace = Boolean(workspaceRoot);

  return (
    <section className="section-panel inlay-card workbench-project-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '项目工作区' : 'Project workspace'}</p>
          <h3>{hasWorkspace ? workspaceLabel ?? workspaceRoot : locale === 'zh' ? '先选择要协作的项目文件夹' : 'Pick the project folder first'}</h3>
          <p className="mini-meta workbench-project-copy">
            {hasWorkspace
              ? workspaceRoot
              : locale === 'zh'
                ? '首次进入时先选择项目目录，然后在左侧浏览文件、拖入上下文，并把代码块回写到当前文件。'
                : 'On first run, select a project directory, then browse files, drag context into chat, and apply code blocks back to the current file.'}
          </p>
        </div>

        <button type="button" className="secondary-button secondary-button-compact" onClick={onChooseWorkspace}>
          {hasWorkspace ? (locale === 'zh' ? '切换项目' : 'Switch project') : locale === 'zh' ? '选择项目' : 'Choose project'}
        </button>
      </div>

      {statusMessage ? <p className="mini-meta workbench-project-status">{statusMessage}</p> : null}
    </section>
  );
}
