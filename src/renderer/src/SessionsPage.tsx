import type {
  AppState,
  CliAdapter,
  Conversation,
  Locale,
  RunSession,
  Task
} from '../../shared/domain.js';
import {
  COPY,
  EVENT_LEVEL_LABELS,
  RUN_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TRANSCRIPT_KIND_LABELS
} from './copy.js';
import {
  formatTime,
  formatTimeoutValue,
  getRunInvocationStateCopy,
  getRunStatusCopy
} from './helpers.js';

interface SessionsPageProps {
  locale: Locale;
  state: AppState;
  selectedRunId: string | null;
  selectedRun: RunSession | null;
  selectedTask: Task | null;
  selectedConversation: Conversation | null;
  selectedAdapter: CliAdapter | null;
  selectedRunIsMutable: boolean;
  selectedRunCancelPending: boolean;
  selectedRunTimeoutLabel: string;
  selectedRunCancelLabel: string;
  taskByRunId: Map<string, Task>;
  adapterById: Map<string, CliAdapter>;
  isCancelling: boolean;
  onSelectRun: (runId: string) => void;
  onCancelRun: () => Promise<void>;
}

export function SessionsPage(props: SessionsPageProps): React.JSX.Element {
  const {
    locale,
    state,
    selectedRunId,
    selectedRun,
    selectedTask,
    selectedConversation,
    selectedAdapter,
    selectedRunIsMutable,
    selectedRunCancelPending,
    selectedRunTimeoutLabel,
    selectedRunCancelLabel,
    taskByRunId,
    adapterById,
    isCancelling,
    onSelectRun,
    onCancelRun
  } = props;

  const copy = COPY[locale];

  return (
    <section className="page-layout sessions-page-layout">
      <aside className="page-sidebar session-sidebar">
        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.runListTitle}</h3>
            <span className="mini-meta">{state.runs.length}</span>
          </div>

          {state.runs.length === 0 ? (
            <p className="empty-state">{copy.runListEmpty}</p>
          ) : (
            <div className="run-list">
              {state.runs.map((run) => {
                const task = taskByRunId.get(run.id);
                const adapter = adapterById.get(run.adapterId);

                return (
                  <button
                    key={run.id}
                    type="button"
                    className={`run-button ${selectedRunId === run.id ? 'is-active' : ''}`}
                    onClick={() => onSelectRun(run.id)}
                  >
                    <div className="run-button-topline">
                      <span className={`state-badge state-${run.status}`}>{RUN_STATUS_LABELS[locale][run.status]}</span>
                      <span className="mini-meta">{formatTime(locale, run.startedAt)}</span>
                    </div>
                    <h3>{task?.title ?? run.id}</h3>
                    <p>{adapter?.displayName ?? run.adapterId}</p>
                    <div className="mini-meta-row">
                      <span>{run.id}</span>
                      <span>
                        {run.events.length} {copy.eventCount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.tasksTitle}</h3>
            <span className="mini-meta">{state.tasks.length}</span>
          </div>

          <div className="stack-list rail-scroll compact-scroll">
            {state.tasks.length === 0 ? (
              <p className="empty-state compact">{copy.tasksEmpty}</p>
            ) : (
              state.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className={`list-card task-button ${task.runId === selectedRunId ? 'is-selected' : ''}`}
                  onClick={() => onSelectRun(task.runId)}
                >
                  <div className="list-topline">
                    <h3>{task.title}</h3>
                    <span className={`state-badge state-${task.status}`}>{TASK_STATUS_LABELS[locale][task.status]}</span>
                  </div>
                  <p>{task.summary}</p>
                  <div className="mini-meta-row">
                    <span>{task.requestedBy}</span>
                    <span>{task.cliMention}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <div className="page-column session-detail-column">
        {selectedRun ? (
          <>
            <section className="section-panel inlay-card">
              <div className="detail-header">
                <div>
                  <p className="section-label">{copy.sessionInspector}</p>
                  <h3>{selectedTask?.title ?? selectedRun.id}</h3>
                  <p className="muted">{selectedAdapter?.displayName ?? selectedRun.adapterId}</p>
                  <p className="detail-status-copy">{getRunStatusCopy(locale, selectedRun)}</p>
                </div>
                <div className="detail-actions">
                  <span className={`state-badge state-${selectedRun.status}`}>
                    {RUN_STATUS_LABELS[locale][selectedRun.status]}
                  </span>
                  {selectedRunIsMutable ? (
                    <button
                      type="button"
                      className="secondary-button secondary-button-danger"
                      onClick={onCancelRun}
                      disabled={isCancelling || selectedRunCancelPending}
                    >
                      {selectedRunCancelPending
                        ? copy.cancelRequestedAction
                        : isCancelling
                          ? copy.cancellingRun
                          : copy.cancelRun}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="execution-summary">
                <div className="output-header execution-summary-header">
                  <div>
                    <p className="section-label">{copy.executionSummary}</p>
                    <p className="muted">{selectedRun.id}</p>
                  </div>
                  <div className="badge-pair">
                    <span className="status-pill">
                      {selectedRun.transcript.length} {copy.timelineEntries}
                    </span>
                    <span className="status-pill">
                      {selectedRun.events.length} {copy.rawEvents}
                    </span>
                  </div>
                </div>

                <div className="execution-summary-grid">
                  <section className="info-card">
                    <span>{copy.invocationState}</span>
                    <strong>{getRunInvocationStateCopy(locale, selectedRun)}</strong>
                  </section>
                  <section className="info-card">
                    <span>{copy.targetTool}</span>
                    <strong>{selectedAdapter?.displayName ?? selectedRun.adapterId}</strong>
                  </section>
                  <section className="info-card">
                    <span>{copy.processId}</span>
                    <strong>{selectedRun.pid === null ? copy.emptyValue : selectedRun.pid}</strong>
                  </section>
                  <section className="info-card">
                    <span>{copy.startedAt}</span>
                    <strong>{formatTime(locale, selectedRun.startedAt)}</strong>
                  </section>
                  <section className="info-card">
                    <span>{copy.endedAt}</span>
                    <strong>{selectedRun.endedAt ? formatTime(locale, selectedRun.endedAt) : copy.emptyValue}</strong>
                  </section>
                  <section className="info-card">
                    <span>{copy.exitCode}</span>
                    <strong>{selectedRun.exitCode === null ? copy.emptyValue : selectedRun.exitCode}</strong>
                  </section>
                  <section className="info-card">
                    <span>{copy.cancellationState}</span>
                    <strong>{selectedRunCancelLabel}</strong>
                  </section>
                </div>

                <section className="detail-card brief-block execution-summary-command">
                  <p className="eyebrow">{copy.commandPreview}</p>
                  <code>{selectedRun.commandPreview || copy.emptyValue}</code>
                </section>
              </div>

              <div className="output-panel">
                <div className="output-header">
                  <div>
                    <p className="section-label">{copy.executionTimeline}</p>
                    <p className="muted">{selectedTask?.title ?? selectedRun.id}</p>
                  </div>
                  <span className="status-pill">{selectedRun.transcript.length}</span>
                </div>

                <div className="timeline-list elevated-stream-list">
                  {selectedRun.transcript.length === 0 ? (
                    <p className="empty-state compact">{copy.executionTimelineEmpty}</p>
                  ) : (
                    selectedRun.transcript.map((entry) => (
                      <section key={entry.id} className={`timeline-entry timeline-${entry.status}`}>
                        <div className="stream-label">
                          <span className={`stream-chip stream-chip-${entry.status === 'failed' ? 'stderr' : entry.status === 'completed' ? 'success' : 'info'}`}>
                            {TRANSCRIPT_KIND_LABELS[locale][entry.kind]}
                          </span>
                          <span className="mini-meta">{formatTime(locale, entry.timestamp)}</span>
                        </div>
                        <strong>{entry.label}</strong>
                        <p>{entry.summary}</p>
                        {entry.detail ? <code>{entry.detail}</code> : null}
                      </section>
                    ))
                  )}
                </div>

                <div className="output-header">
                  <div>
                    <p className="section-label">{copy.liveOutput}</p>
                    <p className="muted">{selectedRun.id}</p>
                  </div>
                  <span className="status-pill">
                    {selectedRun.events.length} {copy.eventCount}
                  </span>
                </div>

                <div className="stream-list elevated-stream-list">
                  {selectedRun.events.length === 0 ? (
                    <p className="empty-state compact">{copy.liveOutputEmpty}</p>
                  ) : (
                    selectedRun.events.map((event) => (
                      <section key={event.id} className={`stream-entry stream-${event.level}`}>
                        <div className="stream-label">
                          <span className={`stream-chip stream-chip-${event.level}`}>
                            {EVENT_LEVEL_LABELS[locale][event.level]}
                          </span>
                          <span className="mini-meta">{formatTime(locale, event.timestamp)}</span>
                        </div>
                        <p>{event.message}</p>
                      </section>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="section-panel inlay-card">
              <div className="section-heading">
                <h3>{copy.detailsTitle}</h3>
              </div>

              <div className="meta-grid compact-meta-grid">
                <section className="info-card">
                  <span>{copy.adapter}</span>
                  <strong>{selectedAdapter?.displayName ?? selectedRun.adapterId}</strong>
                </section>
                <section className="info-card">
                  <span>{copy.conversation}</span>
                  <strong>{selectedConversation?.title ?? copy.emptyValue}</strong>
                </section>
                <section className="info-card">
                  <span>{copy.modelLabel}</span>
                  <strong>{selectedRun.model ?? copy.useAdapterDefault}</strong>
                </section>
                <section className="info-card">
                  <span>{copy.timeoutWindow}</span>
                  <strong>{selectedRunTimeoutLabel}</strong>
                </section>
              </div>

              <div className="detail-grid detail-grid-single">
                <section className="detail-card brief-block">
                  <p className="eyebrow">{copy.task}</p>
                  <div className="stack-meta">
                    <div>
                      <span>{copy.status}</span>
                      <strong>{selectedTask ? TASK_STATUS_LABELS[locale][selectedTask.status] : copy.emptyValue}</strong>
                    </div>
                    <div>
                      <span>{copy.requestedBy}</span>
                      <strong>{selectedTask?.requestedBy ?? copy.emptyValue}</strong>
                    </div>
                    <div>
                      <span>{copy.cliMention}</span>
                      <strong>{selectedTask?.cliMention ?? copy.emptyValue}</strong>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state tall">{copy.noRunSelected}</div>
        )}
      </div>
    </section>
  );
}
