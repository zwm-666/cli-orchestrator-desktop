import type { Locale, WorkbenchTaskItem } from '../../../shared/domain.js';
import { WORKBENCH_TASK_STATUS_LABELS } from '../workConfigCopy.js';

interface WorkbenchTaskPanelProps {
  locale: Locale;
  objective: string;
  tasks: WorkbenchTaskItem[];
  isGeneratingTasks: boolean;
  taskStatusMessage: string | null;
  newTaskTitle: string;
  newTaskDetail: string;
  onGenerateChecklist: () => void;
  onToggleTask: (taskId: string) => void;
  onNewTaskTitleChange: (value: string) => void;
  onNewTaskDetailChange: (value: string) => void;
  onAddTask: () => void;
}

const getObjectiveSummary = (locale: Locale, objective: string): string => {
  const trimmedObjective = objective.trim();

  if (!trimmedObjective) {
    return locale === 'zh' ? '先在工作台设置中写下这次工作的整体目标。' : 'Add the overall objective in workbench settings before generating the checklist.';
  }

  if (trimmedObjective.length <= 140) {
    return trimmedObjective;
  }

  return `${trimmedObjective.slice(0, 140).trimEnd()}…`;
};

export function WorkbenchTaskPanel(props: WorkbenchTaskPanelProps): React.JSX.Element {
  const {
    locale,
    objective,
    tasks,
    isGeneratingTasks,
    taskStatusMessage,
    newTaskTitle,
    newTaskDetail,
    onGenerateChecklist,
    onToggleTask,
    onNewTaskTitleChange,
    onNewTaskDetailChange,
    onAddTask,
  } = props;

  const objectiveSummary = getObjectiveSummary(locale, objective);

  return (
    <section className="section-panel inlay-card workbench-tasks-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '共享任务清单' : 'Shared checklist'}</p>
          <h3>{locale === 'zh' ? '所有模型 / 工具都围绕这份清单继续' : 'Every tool continues from this checklist'}</h3>
          <p className="mini-meta workbench-task-objective">{objectiveSummary}</p>
        </div>
        <div className="workbench-task-heading-meta">
          <span className="status-pill">{tasks.length}</span>
          <button type="button" className="secondary-button secondary-button-compact" onClick={onGenerateChecklist} disabled={isGeneratingTasks}>
            {isGeneratingTasks ? (locale === 'zh' ? '生成中...' : 'Generating...') : locale === 'zh' ? '生成任务清单' : 'Generate task list'}
          </button>
        </div>
      </div>

      {taskStatusMessage ? <p className="mini-meta workbench-task-status">{taskStatusMessage}</p> : null}

      {tasks.length === 0 ? (
        <p className="empty-state">{locale === 'zh' ? '先生成任务清单，或手动添加第一项任务。' : 'Generate a task list first, or add the first task manually.'}</p>
      ) : (
        <div className="workbench-task-list">
          {tasks.map((task) => (
            <label key={task.id} className={`workbench-task-row ${task.status === 'completed' ? 'is-complete' : ''}`}>
              <input
                type="checkbox"
                checked={task.status === 'completed'}
                onChange={() => {
                  onToggleTask(task.id);
                }}
              />
              <span className="workbench-task-copy">
                <strong>{task.title}</strong>
                {task.detail ? <span className="mini-meta">{task.detail}</span> : null}
              </span>
              <span className="status-pill">{WORKBENCH_TASK_STATUS_LABELS[locale][task.status]}</span>
            </label>
          ))}
        </div>
      )}

      <div className="settings-grid compact-settings-grid">
        <label className="field">
          <span>{locale === 'zh' ? '新增任务标题' : 'New task title'}</span>
          <input value={newTaskTitle} onChange={(event) => { onNewTaskTitleChange(event.target.value); }} />
        </label>
        <label className="field">
          <span>{locale === 'zh' ? '补充说明' : 'Notes'}</span>
          <input value={newTaskDetail} onChange={(event) => { onNewTaskDetailChange(event.target.value); }} />
        </label>
      </div>

      <div className="card-actions">
        <button type="button" className="secondary-button" onClick={onAddTask}>
          {locale === 'zh' ? '添加任务' : 'Add task'}
        </button>
      </div>
    </section>
  );
}
