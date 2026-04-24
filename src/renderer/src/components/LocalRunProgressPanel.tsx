import type { AppState, Locale, RunSession } from '../../../shared/domain.js';
import { RUN_STATUS_LABELS } from '../copy.js';

interface LocalRunProgressPanelProps {
  locale: Locale;
  runs: AppState['runs'];
}

const formatRunTitle = (run: RunSession): string => {
  return run.model ? `${run.adapterId} · ${run.model}` : run.adapterId;
};

const getRecentLines = (run: RunSession): { id: string; label: string; detail: string }[] => {
  const transcriptLines = run.transcript.slice(-4).map((entry) => ({
    id: entry.id,
    label: entry.label,
    detail: entry.detail ?? entry.summary,
  }));

  if (transcriptLines.length > 0) {
    return transcriptLines;
  }

  return run.events.slice(-4).map((event) => ({
    id: event.id,
    label: event.level,
    detail: event.message,
  }));
};

export function LocalRunProgressPanel({ locale, runs }: LocalRunProgressPanelProps): React.JSX.Element {
  const activeRun = runs.find((run) => run.status === 'running' || run.status === 'pending') ?? runs[0] ?? null;

  return (
    <section className="section-panel inlay-card local-run-progress-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '本地 Agent 执行' : 'Local agent execution'}</p>
          <h3>{locale === 'zh' ? '当前线程运行过程' : 'Current thread run process'}</h3>
        </div>
        <span className="status-pill">{runs.length}</span>
      </div>

      {!activeRun ? (
        <p className="empty-state">{locale === 'zh' ? '这个线程还没有本地工具运行。' : 'No local adapter runs in this thread yet.'}</p>
      ) : (
        <div className="stack-list">
          <article className="list-card">
            <div className="list-topline">
              <strong>{formatRunTitle(activeRun)}</strong>
              <span className="status-pill">{RUN_STATUS_LABELS[locale][activeRun.status]}</span>
            </div>
            <p className="mini-meta">
              {activeRun.pid ? `pid ${activeRun.pid} · ` : ''}{activeRun.startedAt}
            </p>
            <p className="mini-meta">{locale === 'zh' ? '会话' : 'Conversation'}: {activeRun.activeConversationId}</p>
          </article>

          <div className="stack-list compact-list">
            {getRecentLines(activeRun).map((line) => (
              <article key={line.id} className="list-card subtle-card">
                <div className="list-topline">
                  <strong>{line.label}</strong>
                </div>
                <p className="mini-meta">{line.detail}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
