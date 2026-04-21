import type { Locale, RunSession } from '../../../shared/domain.js';
import { RUN_STATUS_LABELS } from '../copy.js';

interface LocalAdapterPanelProps {
  locale: Locale;
  runTitle: string;
  targetPrompt: string;
  runError: string | null;
  isStartingRun: boolean;
  canStart: boolean;
  launchMode: string | null;
  recentRuns: RunSession[];
  adapterLabel: string | null;
  onRunTitleChange: (value: string) => void;
  onTargetPromptChange: (value: string) => void;
  onStart: () => void;
}

export function LocalAdapterPanel(props: LocalAdapterPanelProps): React.JSX.Element {
  const {
    locale,
    runTitle,
    targetPrompt,
    runError,
    isStartingRun,
    canStart,
    launchMode,
    recentRuns,
    adapterLabel,
    onRunTitleChange,
    onTargetPromptChange,
    onStart,
  } = props;

  return (
    <section className="section-panel inlay-card chat-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '本地工具运行' : 'Local adapter run'}</p>
          <h3>{locale === 'zh' ? '用当前连续工作提示词启动本地工具' : 'Launch a local adapter with the current continuity prompt'}</h3>
        </div>
      </div>

      {runError ? <div className="status-banner status-error"><p>{runError}</p></div> : null}

      <label className="field">
        <span>{locale === 'zh' ? '运行标题' : 'Run title'}</span>
        <input value={runTitle} onChange={(event) => { onRunTitleChange(event.target.value); }} />
      </label>

      <label className="field">
        <span>{locale === 'zh' ? '连续工作提示词' : 'Continuity prompt'}</span>
        <textarea rows={11} value={targetPrompt} onChange={(event) => { onTargetPromptChange(event.target.value); }} />
      </label>

      <div className="card-actions">
        <button type="button" className="primary-button" disabled={!canStart || isStartingRun} onClick={onStart}>
          {isStartingRun ? (locale === 'zh' ? '启动中...' : 'Starting...') : locale === 'zh' ? '启动本地工具' : 'Start local tool'}
        </button>
      </div>

      {launchMode === 'manual_handoff' ? (
        <p className="muted">
          {locale === 'zh'
            ? '当前工具使用手动交接模式：会生成连续工作提示词并完成交接，但不会自动回传结果更新任务清单。'
            : 'This tool uses manual handoff: the workbench prepares the continuity prompt, but it does not auto-sync checklist updates back.'}
        </p>
      ) : (
        <p className="muted">
          {locale === 'zh'
            ? 'CLI 工具若在输出中返回结构化任务更新块（<TASK_UPDATES> JSON），任务清单会在运行结束后自动同步。'
            : 'If the CLI tool returns a <TASK_UPDATES> JSON block in its output, the shared checklist will sync automatically after the run finishes.'}
        </p>
      )}

      <div className="stack-list">
        {recentRuns.map((run) => (
          <article key={run.id} className="list-card workbench-run-card">
            <div className="list-topline">
              <strong>{adapterLabel ?? run.adapterId}</strong>
              <span className="status-pill">{RUN_STATUS_LABELS[locale][run.status]}</span>
            </div>
            <p className="mini-meta">{run.commandPreview}</p>
            {run.transcript.length > 0 ? <pre className="preview-code"><code>{run.transcript[run.transcript.length - 1]?.detail ?? run.transcript[run.transcript.length - 1]?.summary}</code></pre> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
