import { useEffect, useState } from 'react';
import type { AppState, Locale, PlanDraft, PlanTaskDraft, RendererContinuityState, WorkbenchState, WorkbenchTaskStatus } from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import { createWorkbenchTask, toErrorMessage } from './workbenchControllerShared.js';

export interface EditablePlanTask {
  id: string;
  title: string;
  detail: string;
  status: WorkbenchTaskStatus;
  agentProfileId: string | null;
}

interface UsePlanPageControllerInput {
  locale: Locale;
  appState: AppState;
  continuityState: RendererContinuityState;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
  onSaveContinuityState: (state: RendererContinuityState) => Promise<void>;
}

interface UsePlanPageControllerResult {
  objective: string;
  planTasks: EditablePlanTask[];
  errorMessage: string | null;
  statusMessage: string | null;
  isGeneratingPlan: boolean;
  setObjective: (value: string) => void;
  handleGeneratePlan: () => Promise<void>;
  handleUpdateTask: (taskId: string, patch: Partial<Omit<EditablePlanTask, 'id'>>) => void;
  handleMoveTask: (taskId: string, direction: 'up' | 'down') => void;
  handleAddTask: () => void;
  handleRemoveTask: (taskId: string) => void;
  handleEnterWorkspace: () => Promise<void>;
}

const toEditableTask = (task: Pick<PlanDraft | PlanTaskDraft, 'taskTitle' | 'cleanedPrompt' | 'rationale' | 'classificationReason' | 'matchedProfileId'>): EditablePlanTask => {
  return {
    id: `plan-task-${crypto.randomUUID()}`,
    title: task.taskTitle,
    detail: task.cleanedPrompt || task.rationale || task.classificationReason,
    status: 'pending',
    agentProfileId: task.matchedProfileId ?? null,
  };
};

const createFallbackTask = (locale: Locale): EditablePlanTask => ({
  id: `plan-task-${crypto.randomUUID()}`,
  title: locale === 'zh' ? '新的计划任务' : 'New plan task',
  detail: '',
  status: 'pending',
  agentProfileId: null,
});

const moveItem = <TItem>(items: TItem[], index: number, nextIndex: number): TItem[] => {
  if (index < 0 || nextIndex < 0 || index >= items.length || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  if (item === undefined) {
    return items;
  }
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
};

export function usePlanPageController(input: UsePlanPageControllerInput): UsePlanPageControllerResult {
  const { locale, appState, continuityState, onSaveWorkbenchState, onSaveContinuityState } = input;
  const workbench = appState.workbench;
  const [objective, setObjective] = useState(workbench?.objective ?? '');
  const [planTasks, setPlanTasks] = useState<EditablePlanTask[]>(() => {
    return (workbench?.tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      detail: task.detail,
      status: task.status,
      agentProfileId: task.agentProfileId ?? null,
    }));
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  useEffect(() => {
    setObjective(workbench?.objective ?? '');
  }, [workbench?.objective]);

  const handleGeneratePlan = async (): Promise<void> => {
    const trimmedObjective = objective.trim();
    if (!trimmedObjective) {
      setErrorMessage(locale === 'zh' ? '请先填写任务目标。' : 'Enter the task objective first.');
      return;
    }

    setIsGeneratingPlan(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await window.desktopApi.createPlanDraft({ rawInput: trimmedObjective });
      const draftTasks = result.draft.plannedTasks.length > 0 ? result.draft.plannedTasks : [result.draft];
      setPlanTasks(draftTasks.map(toEditableTask));
      await onSaveContinuityState({
        ...continuityState,
        planDraft: result.draft,
        lastRoute: '/plan',
      });
      setStatusMessage(locale === 'zh' ? '计划已生成，可以继续编辑清单。' : 'Plan generated. Review and edit the checklist before entering the workspace.');
    } catch (error: unknown) {
      setErrorMessage(toErrorMessage(error, locale === 'zh' ? '无法生成计划。' : 'Unable to generate the plan.'));
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleUpdateTask = (taskId: string, patch: Partial<Omit<EditablePlanTask, 'id'>>): void => {
    setPlanTasks((currentTasks) => currentTasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
  };

  const handleMoveTask = (taskId: string, direction: 'up' | 'down'): void => {
    setPlanTasks((currentTasks) => {
      const index = currentTasks.findIndex((task) => task.id === taskId);
      return moveItem(currentTasks, index, direction === 'up' ? index - 1 : index + 1);
    });
  };

  const handleAddTask = (): void => {
    setPlanTasks((currentTasks) => [...currentTasks, createFallbackTask(locale)]);
  };

  const handleRemoveTask = (taskId: string): void => {
    setPlanTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
  };

  const handleEnterWorkspace = async (): Promise<void> => {
    const trimmedObjective = objective.trim();
    const nextTasks = planTasks
      .filter((task) => task.title.trim().length > 0)
      .map((task) => {
        const nextTask = createWorkbenchTask(task.title.trim(), task.detail.trim(), 'planner', task.agentProfileId);
        const completedAt = task.status === 'completed' ? new Date().toISOString() : null;
        return {
          ...nextTask,
          id: task.id.startsWith('wb-task-') ? task.id : nextTask.id,
          status: task.status,
          completedAt,
        };
      });

    if (!trimmedObjective) {
      setErrorMessage(locale === 'zh' ? '进入工作区前需要填写任务目标。' : 'Enter an objective before opening the workspace.');
      return;
    }

    await onSaveWorkbenchState({
      ...(workbench ?? DEFAULT_WORKBENCH_STATE),
      objective: trimmedObjective,
      tasks: nextTasks,
      generatedAt: new Date().toISOString(),
    });
    await onSaveContinuityState({
      ...continuityState,
      lastRoute: '/work',
    });
  };

  return {
    objective,
    planTasks,
    errorMessage,
    statusMessage,
    isGeneratingPlan,
    setObjective,
    handleGeneratePlan,
    handleUpdateTask,
    handleMoveTask,
    handleAddTask,
    handleRemoveTask,
    handleEnterWorkspace,
  };
}
