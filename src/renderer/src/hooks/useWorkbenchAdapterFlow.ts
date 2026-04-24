import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Locale, TaskThreadMessage, WorkbenchState } from '../../../shared/domain.js';
import {
  appendActivityToThread,
  appendMessagesToThread,
  applyTaskUpdates,
  collectRunOutputText,
  createAdapterActivitySummary,
  extractTaskUpdates,
} from '../workbench.js';
import { TERMINAL_RUN_STATUSES, toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchAdapterFlowInput {
  locale: Locale;
  appState: AppState;
  workbench: WorkbenchState;
  selectedAdapter: AppState['adapters'][number] | null;
  activeThreadId: string | null;
  targetPrompt: string;
  targetModel: string;
  setTaskStatusMessage: (value: string | null) => void;
  selectedAgentLabel?: string | null;
  selectedAgentPrompt?: string | null;
  getLatestWorkbench: () => WorkbenchState;
  queueWorkbenchPersist: (updater: (currentWorkbench: WorkbenchState) => WorkbenchState) => Promise<WorkbenchState>;
}

interface UseWorkbenchAdapterFlowResult {
  runTitle: string;
  runError: string | null;
  isStartingRun: boolean;
  recentAdapterRuns: AppState['runs'];
  setRunTitle: (value: string) => void;
  handleStartAdapterRun: (promptOverride?: string) => Promise<void>;
}

export function useWorkbenchAdapterFlow(input: UseWorkbenchAdapterFlowInput): UseWorkbenchAdapterFlowResult {
  const {
    locale,
    appState,
    workbench,
    selectedAdapter,
    activeThreadId,
    targetPrompt,
    targetModel,
    setTaskStatusMessage,
    selectedAgentLabel,
    selectedAgentPrompt,
    getLatestWorkbench,
    queueWorkbenchPersist,
  } = input;
  const [runTitle, setRunTitle] = useState('');
  const [runError, setRunError] = useState<string | null>(null);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const processingRunIdsRef = useRef(new Set());

  useEffect(() => {
    if (!runTitle.trim()) {
      setRunTitle(workbench.objective ? workbench.objective.slice(0, 72) : locale === 'zh' ? '统一工作台任务' : 'Unified workbench task');
    }
  }, [locale, runTitle, workbench.objective]);

  useEffect(() => {
    const cliAdapterById = new Map(
      appState.adapters
        .filter((adapter) => adapter.visibility === 'user' && adapter.launchMode === 'cli')
        .map((adapter) => [adapter.id, adapter]),
    );

    const processedRunIds = new Set(workbench.processedRunIds);
    const candidateRuns = appState.runs
      .filter((run) => cliAdapterById.has(run.adapterId) && TERMINAL_RUN_STATUSES.has(run.status) && !processedRunIds.has(run.id))
      .sort((left, right) => (left.endedAt ?? left.startedAt).localeCompare(right.endedAt ?? right.startedAt));

    if (candidateRuns.length === 0) {
      return;
    }

    const syncChecklistFromRuns = async (): Promise<void> => {
      let syncedCount = 0;

      for (const run of candidateRuns) {
        if (processingRunIdsRef.current.has(run.id)) {
          continue;
        }

        processingRunIdsRef.current.add(run.id);
        try {
          const outputText = collectRunOutputText(run);
          const updates = extractTaskUpdates(outputText);
          const nextActivity = createAdapterActivitySummary(locale, run, cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId, outputText);
          const targetThreadId = run.workbenchThreadId ?? getLatestWorkbench().activeThreadId ?? activeThreadId;
          let wasProcessed = false;

          await queueWorkbenchPersist((currentWorkbench) => {
            const processedIds = new Set(currentWorkbench.processedRunIds);
            if (processedIds.has(run.id)) {
              return currentWorkbench;
            }

            processedIds.add(run.id);
            let nextWorkbench = updates
              ? appendActivityToThread({
                  ...currentWorkbench,
                  tasks: applyTaskUpdates(currentWorkbench.tasks, updates, 'assistant'),
                  processedRunIds: [...processedIds],
                  latestAdapterActivity: nextActivity,
                }, targetThreadId, nextActivity)
              : appendActivityToThread({
                  ...currentWorkbench,
                  processedRunIds: [...processedIds],
                  latestAdapterActivity: nextActivity,
                }, targetThreadId, nextActivity);

            const completionMessage: TaskThreadMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content:
                run.status === 'succeeded'
                  ? locale === 'zh'
                    ? `本地工具 ${cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId} 已完成。`
                    : `Local tool ${cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId} completed.`
                  : locale === 'zh'
                    ? `本地工具 ${cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId} 以 ${run.status} 结束。`
                    : `Local tool ${cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId} finished with ${run.status}.`,
              providerId: null,
              adapterId: run.adapterId,
              sourceKind: 'adapter',
              sourceLabel: cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId,
              modelLabel: run.model ?? null,
              agentLabel: selectedAgentLabel ?? null,
              orchestrationRunId: null,
              createdAt: nextActivity.recordedAt,
            };
            nextWorkbench = appendMessagesToThread({
              locale,
              workbench: nextWorkbench,
              threadId: targetThreadId,
              messages: [completionMessage],
            });

            wasProcessed = true;
            return nextWorkbench;
          });

          if (wasProcessed && updates) {
            syncedCount += 1;
          }
        } finally {
          processingRunIdsRef.current.delete(run.id);
        }
      }

      if (syncedCount > 0) {
        setTaskStatusMessage(
          locale === 'zh'
            ? `已根据 ${syncedCount} 个本地工具运行结果自动同步任务清单。`
            : `Synced the shared checklist from ${syncedCount} local adapter run${syncedCount === 1 ? '' : 's'}.`,
        );
      }
    };

    void syncChecklistFromRuns();
  }, [activeThreadId, appState.adapters, appState.runs, locale, queueWorkbenchPersist, setTaskStatusMessage, selectedAgentLabel, workbench]);

  const handleStartAdapterRun = async (promptOverride?: string): Promise<void> => {
    if (!selectedAdapter) {
      setRunError(locale === 'zh' ? '请先选择一个本地工具。' : 'Choose a local adapter first.');
      return;
    }

    const trimmedPrompt = (promptOverride ?? targetPrompt).trim();

    if (!trimmedPrompt) {
      setRunError(locale === 'zh' ? '请先生成连续工作提示词。' : 'Generate the continuity prompt before starting a run.');
      return;
    }

    setIsStartingRun(true);
    setRunError(null);

    try {
      const createdAt = new Date().toISOString();
      const requestMessage: TaskThreadMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmedPrompt,
        providerId: null,
        adapterId: selectedAdapter.id,
        sourceKind: 'adapter',
        sourceLabel: selectedAdapter.displayName,
        modelLabel: targetModel || null,
        agentLabel: selectedAgentLabel ?? null,
        orchestrationRunId: null,
        createdAt,
      };
      const launchMessage: TaskThreadMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: locale === 'zh' ? `已启动本地工具 ${selectedAdapter.displayName}。` : `Started local tool ${selectedAdapter.displayName}.`,
        providerId: null,
        adapterId: selectedAdapter.id,
        sourceKind: 'adapter',
        sourceLabel: selectedAdapter.displayName,
        modelLabel: targetModel || null,
        agentLabel: selectedAgentLabel ?? null,
        orchestrationRunId: null,
        createdAt,
      };

      await queueWorkbenchPersist((currentWorkbench) => {
        return appendMessagesToThread({
          locale,
          workbench: currentWorkbench,
          threadId: activeThreadId,
          messages: [requestMessage, launchMessage],
        });
      });

      const effectivePrompt = selectedAgentPrompt
        ? `${locale === 'zh' ? 'Agent 角色要求' : 'Agent persona requirements'}: ${selectedAgentLabel ?? 'Agent'}\n${selectedAgentPrompt}\n\n${trimmedPrompt}`
        : trimmedPrompt;

      await window.desktopApi.startRun({
        title: runTitle.trim() || (locale === 'zh' ? '统一工作台任务' : 'Unified workbench task'),
        prompt: effectivePrompt,
        adapterId: selectedAdapter.id,
        model: targetModel || null,
        workbenchThreadId: activeThreadId,
        taskType: 'code',
      });
    } catch (error: unknown) {
      setRunError(toErrorMessage(error, locale === 'zh' ? '无法启动本地工具。' : 'Unable to start the local adapter run.'));
    } finally {
      setIsStartingRun(false);
    }
  };

  const recentAdapterRuns = useMemo(() => {
    return selectedAdapter ? appState.runs.filter((run) => run.adapterId === selectedAdapter.id).slice(0, 3) : [];
  }, [appState.runs, selectedAdapter]);

  return {
    runTitle,
    runError,
    isStartingRun,
    recentAdapterRuns,
    setRunTitle,
    handleStartAdapterRun,
  };
}
