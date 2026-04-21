import { useState } from 'react';
import type { Locale, WorkbenchState } from '../../../shared/domain.js';
import { createWorkbenchTask, toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchTaskBoardInput {
  locale: Locale;
  workbench: WorkbenchState;
  persistWorkbench: (nextWorkbench: WorkbenchState) => Promise<void>;
}

interface UseWorkbenchTaskBoardResult {
  newTaskTitle: string;
  newTaskDetail: string;
  isGeneratingTasks: boolean;
  taskStatusMessage: string | null;
  setNewTaskTitle: (value: string) => void;
  setNewTaskDetail: (value: string) => void;
  setTaskStatusMessage: (value: string | null) => void;
  handleGenerateChecklist: () => Promise<void>;
  handleSaveObjective: (objective: string) => void;
  handleToggleTask: (taskId: string) => void;
  handleAddTask: () => void;
}

export function useWorkbenchTaskBoard(input: UseWorkbenchTaskBoardInput): UseWorkbenchTaskBoardResult {
  const { locale, workbench, persistWorkbench } = input;
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDetail, setNewTaskDetail] = useState('');
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [taskStatusMessage, setTaskStatusMessage] = useState<string | null>(null);

  const handleGenerateChecklist = async (): Promise<void> => {
    const objective = workbench.objective.trim();
    if (!objective) {
      setTaskStatusMessage(locale === 'zh' ? '请先填写工作目标。' : 'Enter the work objective first.');
      return;
    }

    setIsGeneratingTasks(true);
    setTaskStatusMessage(null);

    try {
      const result = await window.desktopApi.createPlanDraft({ rawInput: objective });
      const draftTasks = result.draft.plannedTasks.length > 0 ? result.draft.plannedTasks : [result.draft];
      const nextTasks = draftTasks.map((task) =>
        createWorkbenchTask(task.taskTitle, task.cleanedPrompt || task.rationale || task.classificationReason, 'planner'),
      );

      await persistWorkbench({
        ...workbench,
        tasks: nextTasks,
        generatedAt: new Date().toISOString(),
      });
      setTaskStatusMessage(locale === 'zh' ? '已根据当前目标生成任务清单。' : 'Generated a shared task list from the current objective.');
    } catch (error: unknown) {
      setTaskStatusMessage(toErrorMessage(error, locale === 'zh' ? '无法生成任务清单。' : 'Unable to generate the shared checklist.'));
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  const handleSaveObjective = (objective: string): void => {
    void persistWorkbench({ ...workbench, objective });
  };

  const handleToggleTask = (taskId: string): void => {
    const nextTasks = workbench.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
      const now = new Date().toISOString();
      return {
        ...task,
        status: nextStatus as typeof task.status,
        source: 'manual' as const,
        updatedAt: now,
        completedAt: nextStatus === 'completed' ? now : null,
      };
    });

    void persistWorkbench({ ...workbench, tasks: nextTasks });
  };

  const handleAddTask = (): void => {
    const title = newTaskTitle.trim();
    if (!title) {
      return;
    }

    void persistWorkbench({
      ...workbench,
      tasks: [...workbench.tasks, createWorkbenchTask(title, newTaskDetail.trim(), 'manual')],
    });
    setNewTaskTitle('');
    setNewTaskDetail('');
  };

  return {
    newTaskTitle,
    newTaskDetail,
    isGeneratingTasks,
    taskStatusMessage,
    setNewTaskTitle,
    setNewTaskDetail,
    setTaskStatusMessage,
    handleGenerateChecklist,
    handleSaveObjective,
    handleToggleTask,
    handleAddTask,
  };
}
