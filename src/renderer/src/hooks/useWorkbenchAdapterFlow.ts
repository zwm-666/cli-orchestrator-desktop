import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Locale, WorkbenchState } from '../../../shared/domain.js';
import {
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
  targetPrompt: string;
  targetModel: string;
  persistWorkbench: (nextWorkbench: WorkbenchState) => Promise<void>;
  setTaskStatusMessage: (value: string | null) => void;
}

interface UseWorkbenchAdapterFlowResult {
  runTitle: string;
  runError: string | null;
  isStartingRun: boolean;
  recentAdapterRuns: AppState['runs'];
  setRunTitle: (value: string) => void;
  handleStartAdapterRun: () => Promise<void>;
}

export function useWorkbenchAdapterFlow(input: UseWorkbenchAdapterFlowInput): UseWorkbenchAdapterFlowResult {
  const { locale, appState, workbench, selectedAdapter, targetPrompt, targetModel, persistWorkbench, setTaskStatusMessage } = input;
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
      let nextWorkbench = workbench;
      let syncedCount = 0;
      let touched = false;

      for (const run of candidateRuns) {
        if (processingRunIdsRef.current.has(run.id)) {
          continue;
        }

        processingRunIdsRef.current.add(run.id);
        try {
          const outputText = collectRunOutputText(run);
          const updates = extractTaskUpdates(outputText);
          const processedIds = new Set(nextWorkbench.processedRunIds);
          processedIds.add(run.id);
          const nextActivity = createAdapterActivitySummary(locale, run, cliAdapterById.get(run.adapterId)?.displayName ?? run.adapterId, outputText);

          if (updates) {
            nextWorkbench = {
              ...nextWorkbench,
              tasks: applyTaskUpdates(nextWorkbench.tasks, updates, 'assistant'),
              processedRunIds: [...processedIds],
              latestAdapterActivity: nextActivity,
            };
            syncedCount += 1;
          } else {
            nextWorkbench = {
              ...nextWorkbench,
              processedRunIds: [...processedIds],
              latestAdapterActivity: nextActivity,
            };
          }

          touched = true;
        } finally {
          processingRunIdsRef.current.delete(run.id);
        }
      }

      if (!touched) {
        return;
      }

      await persistWorkbench(nextWorkbench);
      if (syncedCount > 0) {
        setTaskStatusMessage(
          locale === 'zh'
            ? `已根据 ${syncedCount} 个本地工具运行结果自动同步任务清单。`
            : `Synced the shared checklist from ${syncedCount} local adapter run${syncedCount === 1 ? '' : 's'}.`,
        );
      }
    };

    void syncChecklistFromRuns();
  }, [appState.adapters, appState.runs, locale, persistWorkbench, setTaskStatusMessage, workbench]);

  const handleStartAdapterRun = async (): Promise<void> => {
    if (!selectedAdapter) {
      setRunError(locale === 'zh' ? '请先选择一个本地工具。' : 'Choose a local adapter first.');
      return;
    }

    if (!targetPrompt.trim()) {
      setRunError(locale === 'zh' ? '请先生成连续工作提示词。' : 'Generate the continuity prompt before starting a run.');
      return;
    }

    setIsStartingRun(true);
    setRunError(null);

    try {
      await window.desktopApi.startRun({
        title: runTitle.trim() || (locale === 'zh' ? '统一工作台任务' : 'Unified workbench task'),
        prompt: targetPrompt,
        adapterId: selectedAdapter.id,
        model: targetModel || null,
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
