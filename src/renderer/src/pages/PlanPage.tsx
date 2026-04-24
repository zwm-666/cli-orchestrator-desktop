import { useNavigate } from 'react-router-dom';
import type { AppState, Locale, RendererContinuityState, WorkbenchState, WorkbenchTaskStatus } from '../../../shared/domain.js';
import { getAgentProfileDisplayName } from '../../../shared/agentProfiles.js';
import { usePlanPageController } from '../hooks/usePlanPageController.js';
import { WORKBENCH_TASK_STATUS_LABELS } from '../workConfigCopy.js';

interface PlanPageProps {
  locale: Locale;
  appState: AppState;
  continuityState: RendererContinuityState;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
  onSaveContinuityState: (state: RendererContinuityState) => Promise<void>;
}

const TASK_STATUSES: WorkbenchTaskStatus[] = ['pending', 'in_progress', 'completed'];

export function PlanPage(props: PlanPageProps): React.JSX.Element {
  const { locale, appState, continuityState, onSaveWorkbenchState, onSaveContinuityState } = props;
  const navigate = useNavigate();
  const controller = usePlanPageController({
    locale,
    appState,
    continuityState,
    onSaveWorkbenchState,
    onSaveContinuityState,
  });

  return (
    <section className="page-stack plan-page">
      <div className="section-panel inlay-card plan-page-hero">
        <div>
          <p className="section-label">{locale === 'zh' ? '创建任务' : 'Create task'}</p>
          <h1>{locale === 'zh' ? '先把目标转成可执行计划' : 'Turn the objective into an executable plan'}</h1>
          <p className="muted">
            {locale === 'zh'
              ? '确认清单后再进入工作区，右侧任务板和所有 agent 都会围绕这份计划继续。'
              : 'Review the checklist before entering the workspace; the task board and agents will continue from it.'}
          </p>
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void navigate('/work');
            }}
          >
            {locale === 'zh' ? '跳过计划' : 'Skip to workspace'}
          </button>
        </div>
      </div>

      <section className="section-panel inlay-card plan-page-form">
        <label className="field">
          <span>{locale === 'zh' ? '这次想完成什么？' : 'What do you want to accomplish?'}</span>
          <textarea
            rows={5}
            value={controller.objective}
            onChange={(event) => {
              controller.setObjective(event.target.value);
            }}
            placeholder={locale === 'zh' ? '例如：优化工作台，让本地 agent 执行过程可见...' : 'Example: Improve the workspace so local agent execution is visible...'}
          />
        </label>
        <div className="card-actions">
          <button type="button" className="primary-button" onClick={() => { void controller.handleGeneratePlan(); }} disabled={controller.isGeneratingPlan}>
            {controller.isGeneratingPlan ? (locale === 'zh' ? '生成中...' : 'Generating...') : locale === 'zh' ? '生成计划' : 'Generate Plan'}
          </button>
          <button type="button" className="secondary-button" onClick={controller.handleAddTask}>
            {locale === 'zh' ? '手动添加任务' : 'Add task manually'}
          </button>
        </div>
        {controller.errorMessage ? <p className="error-message">{controller.errorMessage}</p> : null}
        {controller.statusMessage ? <p className="mini-meta">{controller.statusMessage}</p> : null}
      </section>

      <section className="section-panel inlay-card plan-review-panel">
        <div className="section-heading workspace-pane-heading">
          <div>
            <p className="section-label">{locale === 'zh' ? '计划清单' : 'Plan checklist'}</p>
            <h3>{locale === 'zh' ? '编辑、排序并分配 Agent' : 'Edit, reorder, and assign agents'}</h3>
          </div>
          <span className="status-pill">{controller.planTasks.length}</span>
        </div>

        {controller.planTasks.length === 0 ? (
          <p className="empty-state">{locale === 'zh' ? '生成计划或手动添加第一项任务。' : 'Generate a plan or add the first task manually.'}</p>
        ) : (
          <div className="plan-task-list">
            {controller.planTasks.map((task, index) => (
              <article key={task.id} className="list-card plan-task-card">
                <div className="plan-task-grid">
                  <label className="field">
                    <span>{locale === 'zh' ? '标题' : 'Title'}</span>
                    <input
                      value={task.title}
                      onChange={(event) => {
                        controller.handleUpdateTask(task.id, { title: event.target.value });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{locale === 'zh' ? '状态' : 'Status'}</span>
                    <select
                      value={task.status}
                      onChange={(event) => {
                        controller.handleUpdateTask(task.id, { status: event.target.value as WorkbenchTaskStatus });
                      }}
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>{WORKBENCH_TASK_STATUS_LABELS[locale][status]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{locale === 'zh' ? 'Agent' : 'Agent'}</span>
                    <select
                      value={task.agentProfileId ?? ''}
                      onChange={(event) => {
                        controller.handleUpdateTask(task.id, { agentProfileId: event.target.value || null });
                      }}
                    >
                      <option value="">{locale === 'zh' ? '自动分配' : 'Auto assign'}</option>
                      {appState.agentProfiles.filter((profile) => profile.enabled).map((profile) => (
                        <option key={profile.id} value={profile.id}>{getAgentProfileDisplayName(profile)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>{locale === 'zh' ? '说明' : 'Detail'}</span>
                  <textarea
                    rows={3}
                    value={task.detail}
                    onChange={(event) => {
                      controller.handleUpdateTask(task.id, { detail: event.target.value });
                    }}
                  />
                </label>

                <div className="card-actions">
                  <button type="button" className="secondary-button secondary-button-compact" onClick={() => { controller.handleMoveTask(task.id, 'up'); }} disabled={index === 0}>
                    ↑
                  </button>
                  <button type="button" className="secondary-button secondary-button-compact" onClick={() => { controller.handleMoveTask(task.id, 'down'); }} disabled={index === controller.planTasks.length - 1}>
                    ↓
                  </button>
                  <button type="button" className="danger-button secondary-button-compact" onClick={() => { controller.handleRemoveTask(task.id); }}>
                    {locale === 'zh' ? '移除' : 'Remove'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="card-actions plan-enter-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              void (async () => {
                await controller.handleEnterWorkspace();
                void navigate('/work');
              })();
            }}
          >
            {locale === 'zh' ? '进入工作区' : 'Enter Workspace'}
          </button>
        </div>
      </section>
    </section>
  );
}
