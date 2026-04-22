import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Locale, TaskThread, WorkbenchState, WorkbenchTargetKind, WorkspaceEntry } from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import type { PromptBuilderConfig } from '../../../shared/promptBuilder.js';
import type { AiConfig, AiProviderDefinition } from '../aiConfig.js';
import { getProviderDefinition } from '../aiConfig.js';
import {
  buildContinuityPrompt,
  createTaskThread,
  formatWorkbenchActivitySummary,
  getActiveTaskThread,
  resolveBoundSkills,
} from '../workbench.js';
import { useWorkbenchAdapterFlow } from './useWorkbenchAdapterFlow.js';
import { type WorkbenchOption } from './workbenchControllerShared.js';
import { FILE_CONTEXT_LIMIT } from './workbenchControllerShared.js';
import { useWorkbenchProviderFlow } from './useWorkbenchProviderFlow.js';
import { useWorkbenchTaskBoard } from './useWorkbenchTaskBoard.js';
import { useWorkbenchWorkspace } from './useWorkbenchWorkspace.js';

interface UseWorkbenchControllerInput {
  locale: Locale;
  aiConfig: AiConfig;
  appState: AppState;
  promptBuilderConfig: PromptBuilderConfig;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
}

export interface UseWorkbenchControllerResult {
  workbench: WorkbenchState;
  activeThread: TaskThread | null;
  chatMessages: TaskThread['messages'];
  threadOptions: WorkbenchOption[];
  browseResult: ReturnType<typeof useWorkbenchWorkspace>['browseResult'];
  browseError: string | null;
  isBrowsing: boolean;
  selectedFile: ReturnType<typeof useWorkbenchWorkspace>['selectedFile'];
  previewError: string | null;
  isPreviewLoading: boolean;
  chatError: string | null;
  isSending: boolean;
  selectedTargetKind: WorkbenchTargetKind;
  selectedProviderId: string;
  selectedAdapterId: string;
  targetModel: string;
  targetPrompt: string;
  runTitle: string;
  runError: string | null;
  isStartingRun: boolean;
  newTaskTitle: string;
  newTaskDetail: string;
  isGeneratingTasks: boolean;
  taskStatusMessage: string | null;
  promptBuilderCommand: string | null;
  providerOptions: WorkbenchOption[];
  adapterOptions: WorkbenchOption[];
  selectedProviderDefinition: AiProviderDefinition | null;
  selectedProviderConfig: AiConfig['providers'][keyof AiConfig['providers']] | null;
  selectedAdapter: AppState['adapters'][number] | null;
  boundSkills: AppState['skills'];
  recentAdapterRuns: AppState['runs'];
  handleGenerateChecklist: () => Promise<void>;
  handleSaveObjective: (objective: string) => void;
  handleTargetKindChange: (nextKind: WorkbenchTargetKind) => void;
  handleProviderChange: (nextProviderId: string) => void;
  handleAdapterChange: (nextAdapterId: string) => void;
  handleThreadChange: (nextThreadId: string) => void;
  handleCreateThread: () => void;
  handleToggleTask: (taskId: string) => void;
  handleAddTask: () => void;
  handleProviderSend: () => Promise<void>;
  handleStartAdapterRun: () => Promise<void>;
  handleApplyPromptBuilderCommand: (command: string) => void;
  handleClearPromptBuilderCommand: () => void;
  setTargetModel: (value: string) => void;
  setTargetPrompt: (value: string) => void;
  setRunTitle: (value: string) => void;
  setNewTaskTitle: (value: string) => void;
  setNewTaskDetail: (value: string) => void;
  loadDirectory: (relativePath: string | null) => Promise<void>;
  loadFilePreview: (entry: WorkspaceEntry) => Promise<void>;
}

const normalizeThreadedWorkbench = (workbench: WorkbenchState, locale: Locale, bootstrapThread: TaskThread): WorkbenchState => {
  if (workbench.threads.length === 0) {
    return {
      ...workbench,
      activeThreadId: bootstrapThread.id,
      threads: [bootstrapThread],
    };
  }

  if (workbench.activeThreadId && workbench.threads.some((thread) => thread.id === workbench.activeThreadId)) {
    return workbench;
  }

  return {
    ...workbench,
    activeThreadId: workbench.threads[0]?.id ?? null,
  };
};

export function useWorkbenchController(input: UseWorkbenchControllerInput): UseWorkbenchControllerResult {
  const { locale, aiConfig, appState, promptBuilderConfig, onSaveWorkbenchState } = input;
  const persistedWorkbench = appState.workbench ?? DEFAULT_WORKBENCH_STATE;
  const bootstrapThreadRef = useRef<TaskThread | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const [selectedTargetKind, setSelectedTargetKind] = useState<WorkbenchTargetKind>('provider');
  const [selectedProviderId, setSelectedProviderId] = useState(aiConfig.active_provider ?? '');
  const [selectedAdapterId, setSelectedAdapterId] = useState('');
  const [targetModel, setTargetModel] = useState(aiConfig.active_model);
  const [targetPrompt, setTargetPrompt] = useState('');

  if (!bootstrapThreadRef.current) {
    bootstrapThreadRef.current = createTaskThread({ locale, objective: persistedWorkbench.objective });
  }

  const workbench = useMemo(
    () => normalizeThreadedWorkbench(persistedWorkbench, locale, bootstrapThreadRef.current ?? createTaskThread({ locale, objective: persistedWorkbench.objective })),
    [locale, persistedWorkbench],
  );
  const activeThread = useMemo(() => getActiveTaskThread(workbench), [workbench]);
  const threadOptions = useMemo<WorkbenchOption[]>(() => workbench.threads.map((thread) => ({ id: thread.id, label: thread.title })), [workbench.threads]);

  const workspace = useWorkbenchWorkspace({ locale });

  const persistWorkbench = async (nextWorkbench: WorkbenchState): Promise<void> => {
    const normalized = normalizeThreadedWorkbench(nextWorkbench, locale, bootstrapThreadRef.current ?? createTaskThread({ locale, objective: nextWorkbench.objective }));
    await onSaveWorkbenchState({
      ...normalized,
      updatedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    const persistedActiveThreadId = persistedWorkbench.activeThreadId;
    const persistedThreadCount = persistedWorkbench.threads.length;
    const activeThreadValid = persistedActiveThreadId ? persistedWorkbench.threads.some((thread) => thread.id === persistedActiveThreadId) : false;

    if (persistedThreadCount === 0 || !activeThreadValid) {
      void persistWorkbench(workbench);
    }
  }, [persistedWorkbench.activeThreadId, persistedWorkbench.threads, workbench]);

  const availableAdapters = useMemo(
    () => appState.adapters.filter((adapter) => adapter.visibility === 'user' && adapter.enabled && adapter.availability === 'available'),
    [appState.adapters],
  );
  const providerOptions = useMemo<WorkbenchOption[]>(
    () =>
      Object.keys(aiConfig.providers).map((providerId) => ({
        id: providerId,
        label: getProviderDefinition(providerId as Parameters<typeof getProviderDefinition>[0]).label,
      })),
    [aiConfig.providers],
  );
  const adapterOptions = useMemo<WorkbenchOption[]>(
    () => availableAdapters.map((adapter) => ({ id: adapter.id, label: adapter.displayName })),
    [availableAdapters],
  );

  useEffect(() => {
    if (!selectedAdapterId && availableAdapters[0]) {
      setSelectedAdapterId(availableAdapters[0].id);
      setTargetModel(availableAdapters[0].defaultModel ?? '');
    }
  }, [availableAdapters, selectedAdapterId]);

  useEffect(() => {
    if (selectedTargetKind === 'provider') {
      setSelectedProviderId(aiConfig.active_provider ?? selectedProviderId);
      setTargetModel(aiConfig.active_model);
    }
  }, [aiConfig.active_model, aiConfig.active_provider, selectedProviderId, selectedTargetKind]);

  const selectedProviderDefinition = useMemo(
    () => (selectedProviderId ? getProviderDefinition(selectedProviderId as Parameters<typeof getProviderDefinition>[0]) : null),
    [selectedProviderId],
  );
  const selectedProviderConfig = selectedProviderId ? aiConfig.providers[selectedProviderId as keyof AiConfig['providers']] : null;
  const selectedAdapter = availableAdapters.find((adapter) => adapter.id === selectedAdapterId) ?? null;

  const boundSkills = useMemo(() => {
    const targetId = selectedTargetKind === 'provider' ? selectedProviderId : selectedAdapterId;
    return resolveBoundSkills(appState.skills, workbench.skillBindings, selectedTargetKind, targetId, targetModel);
  }, [appState.skills, selectedAdapterId, selectedProviderId, selectedTargetKind, targetModel, workbench.skillBindings]);

  const taskBoard = useWorkbenchTaskBoard({
    locale,
    workbench,
    persistWorkbench,
  });

  const latestProviderActivity = useMemo(
    () => [...(activeThread?.activityLog ?? [])].reverse().find((activity) => activity.sourceKind === 'provider') ?? workbench.latestProviderActivity,
    [activeThread?.activityLog, workbench.latestProviderActivity],
  );
  const latestAdapterActivity = useMemo(
    () => [...(activeThread?.activityLog ?? [])].reverse().find((activity) => activity.sourceKind === 'adapter') ?? workbench.latestAdapterActivity,
    [activeThread?.activityLog, workbench.latestAdapterActivity],
  );
  const recentProviderSummary = useMemo(
    () => (latestProviderActivity ? formatWorkbenchActivitySummary(locale, latestProviderActivity) : null),
    [latestProviderActivity, locale],
  );
  const recentLocalRunSummary = useMemo(
    () => (latestAdapterActivity ? formatWorkbenchActivitySummary(locale, latestAdapterActivity) : null),
    [latestAdapterActivity, locale],
  );

  const continuityTemplate = locale === 'zh' ? promptBuilderConfig.continuityTemplates?.zh ?? '' : promptBuilderConfig.continuityTemplates?.en ?? '';
  const continuityPrompt = useMemo(
    () =>
      buildContinuityPrompt({
        locale,
        workbench,
        activeThread,
        selectedFilePath: workspace.selectedFile?.relativePath ?? null,
        selectedFileContent: workspace.selectedFile?.content.slice(0, FILE_CONTEXT_LIMIT) ?? null,
        targetKind: selectedTargetKind,
        targetLabel: selectedTargetKind === 'provider' ? (selectedProviderDefinition?.label ?? '') : (selectedAdapter?.displayName ?? ''),
        modelLabel: targetModel,
        projectContextSummary: appState.projectContext.summary,
        providerDefinition: selectedProviderDefinition,
        boundSkills,
        recentProviderSummary,
        recentLocalRunSummary,
        continuityTemplate,
      }),
    [
      activeThread,
      appState.projectContext.summary,
      boundSkills,
      continuityTemplate,
      locale,
      recentLocalRunSummary,
      recentProviderSummary,
      selectedAdapter?.displayName,
      selectedProviderDefinition,
      selectedTargetKind,
      targetModel,
      workbench,
      workspace.selectedFile?.content,
      workspace.selectedFile?.relativePath,
    ],
  );

  useEffect(() => {
    const threadChanged = activeThreadIdRef.current !== activeThread?.id;
    activeThreadIdRef.current = activeThread?.id ?? null;

    if (threadChanged || (activeThread?.messages.length ?? 0) === 0) {
      setTargetPrompt(continuityPrompt);
    }
  }, [continuityPrompt, activeThread?.id, activeThread?.messages.length]);

  const providerFlow = useWorkbenchProviderFlow({
    locale,
    workbench,
    persistWorkbench,
    activeThreadId: activeThread?.id ?? null,
    threadMessages: activeThread?.messages ?? [],
    selectedProviderId,
    selectedProviderDefinition,
    selectedProviderConfig,
    targetModel,
    targetPrompt,
    boundSkills,
    selectedFile: workspace.selectedFile,
  });

  const adapterFlow = useWorkbenchAdapterFlow({
    locale,
    appState,
    workbench,
    selectedAdapter,
    activeThreadId: activeThread?.id ?? null,
    targetPrompt,
    targetModel,
    persistWorkbench,
    setTaskStatusMessage: taskBoard.setTaskStatusMessage,
  });

  const handleTargetKindChange = (nextKind: WorkbenchTargetKind): void => {
    setSelectedTargetKind(nextKind);
    if (nextKind === 'provider') {
      setSelectedProviderId(aiConfig.active_provider ?? selectedProviderId);
      setTargetModel(aiConfig.active_model);
      return;
    }

    if (availableAdapters[0]) {
      setSelectedAdapterId((current) => current || availableAdapters[0]?.id || '');
      setTargetModel(selectedAdapter?.defaultModel ?? availableAdapters[0].defaultModel ?? '');
    }
  };

  const handleProviderChange = (nextProviderId: string): void => {
    setSelectedProviderId(nextProviderId);
    setTargetModel(
      nextProviderId ? aiConfig.active_model || getProviderDefinition(nextProviderId as Parameters<typeof getProviderDefinition>[0]).modelSuggestions[0] || '' : '',
    );
  };

  const handleAdapterChange = (nextAdapterId: string): void => {
    const nextAdapter = availableAdapters.find((adapter) => adapter.id === nextAdapterId) ?? null;
    setSelectedAdapterId(nextAdapterId);
    setTargetModel(nextAdapter?.defaultModel ?? '');
  };

  const handleThreadChange = (nextThreadId: string): void => {
    void persistWorkbench({
      ...workbench,
      activeThreadId: nextThreadId,
    });
  };

  const handleCreateThread = (): void => {
    const nextThread = createTaskThread({ locale, objective: workbench.objective });
    void persistWorkbench({
      ...workbench,
      activeThreadId: nextThread.id,
      threads: [...workbench.threads, nextThread],
    });
  };

  const handleApplyPromptBuilderCommand = (command: string): void => {
    void persistWorkbench({
      ...workbench,
      promptBuilderCommand: command.trim() || null,
    });
  };

  const handleClearPromptBuilderCommand = (): void => {
    void persistWorkbench({
      ...workbench,
      promptBuilderCommand: null,
    });
  };

  return {
    workbench,
    activeThread,
    chatMessages: activeThread?.messages ?? [],
    threadOptions,
    browseResult: workspace.browseResult,
    browseError: workspace.browseError,
    isBrowsing: workspace.isBrowsing,
    selectedFile: workspace.selectedFile,
    previewError: workspace.previewError,
    isPreviewLoading: workspace.isPreviewLoading,
    chatError: providerFlow.chatError,
    isSending: providerFlow.isSending,
    selectedTargetKind,
    selectedProviderId,
    selectedAdapterId,
    targetModel,
    targetPrompt,
    runTitle: adapterFlow.runTitle,
    runError: adapterFlow.runError,
    isStartingRun: adapterFlow.isStartingRun,
    newTaskTitle: taskBoard.newTaskTitle,
    newTaskDetail: taskBoard.newTaskDetail,
    isGeneratingTasks: taskBoard.isGeneratingTasks,
    taskStatusMessage: taskBoard.taskStatusMessage,
    promptBuilderCommand: workbench.promptBuilderCommand,
    providerOptions,
    adapterOptions,
    selectedProviderDefinition,
    selectedProviderConfig,
    selectedAdapter,
    boundSkills,
    recentAdapterRuns: adapterFlow.recentAdapterRuns,
    handleGenerateChecklist: taskBoard.handleGenerateChecklist,
    handleSaveObjective: taskBoard.handleSaveObjective,
    handleTargetKindChange,
    handleProviderChange,
    handleAdapterChange,
    handleThreadChange,
    handleCreateThread,
    handleToggleTask: taskBoard.handleToggleTask,
    handleAddTask: taskBoard.handleAddTask,
    handleProviderSend: providerFlow.handleProviderSend,
    handleStartAdapterRun: adapterFlow.handleStartAdapterRun,
    handleApplyPromptBuilderCommand,
    handleClearPromptBuilderCommand,
    setTargetModel,
    setTargetPrompt,
    setRunTitle: adapterFlow.setRunTitle,
    setNewTaskTitle: taskBoard.setNewTaskTitle,
    setNewTaskDetail: taskBoard.setNewTaskDetail,
    loadDirectory: workspace.loadDirectory,
    loadFilePreview: workspace.loadFilePreview,
  };
}
