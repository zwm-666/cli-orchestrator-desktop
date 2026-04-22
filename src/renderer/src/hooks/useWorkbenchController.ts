import { useEffect, useMemo, useState } from 'react';
import type { AppState, Locale, WorkbenchState, WorkbenchTargetKind, WorkspaceEntry } from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import type { AiConfig, AiProviderDefinition } from '../aiConfig.js';
import { getProviderDefinition } from '../aiConfig.js';
import { buildContinuityPrompt, formatWorkbenchActivitySummary, resolveBoundSkills } from '../workbench.js';
import { useWorkbenchAdapterFlow } from './useWorkbenchAdapterFlow.js';
import { type ChatMessage, type WorkbenchOption } from './workbenchControllerShared.js';
import { FILE_CONTEXT_LIMIT } from './workbenchControllerShared.js';
import { useWorkbenchProviderFlow } from './useWorkbenchProviderFlow.js';
import { useWorkbenchTaskBoard } from './useWorkbenchTaskBoard.js';
import { useWorkbenchWorkspace } from './useWorkbenchWorkspace.js';

interface UseWorkbenchControllerInput {
  locale: Locale;
  aiConfig: AiConfig;
  appState: AppState;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
}

export interface UseWorkbenchControllerResult {
  workbench: WorkbenchState;
  browseResult: ReturnType<typeof useWorkbenchWorkspace>['browseResult'];
  browseError: string | null;
  isBrowsing: boolean;
  selectedFile: ReturnType<typeof useWorkbenchWorkspace>['selectedFile'];
  previewError: string | null;
  isPreviewLoading: boolean;
  chatMessages: ChatMessage[];
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

export function useWorkbenchController(input: UseWorkbenchControllerInput): UseWorkbenchControllerResult {
  const { locale, aiConfig, appState, onSaveWorkbenchState } = input;
  const workbench = appState.workbench ?? DEFAULT_WORKBENCH_STATE;
  const [selectedTargetKind, setSelectedTargetKind] = useState<WorkbenchTargetKind>('provider');
  const [selectedProviderId, setSelectedProviderId] = useState(aiConfig.active_provider ?? '');
  const [selectedAdapterId, setSelectedAdapterId] = useState('');
  const [targetModel, setTargetModel] = useState(aiConfig.active_model);
  const [targetPrompt, setTargetPrompt] = useState('');

  const workspace = useWorkbenchWorkspace({ locale });

  const persistWorkbench = async (nextWorkbench: WorkbenchState): Promise<void> => {
    await onSaveWorkbenchState({
      ...nextWorkbench,
      updatedAt: new Date().toISOString(),
    });
  };

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

  const recentProviderSummary = useMemo(
    () => (workbench.latestProviderActivity ? formatWorkbenchActivitySummary(locale, workbench.latestProviderActivity) : null),
    [locale, workbench.latestProviderActivity],
  );
  const recentLocalRunSummary = useMemo(
    () => (workbench.latestAdapterActivity ? formatWorkbenchActivitySummary(locale, workbench.latestAdapterActivity) : null),
    [locale, workbench.latestAdapterActivity],
  );

  const continuityPrompt = useMemo(
    () =>
      buildContinuityPrompt({
        locale,
        workbench,
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
      }),
    [
      appState.projectContext.summary,
      boundSkills,
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
    setTargetPrompt(continuityPrompt);
  }, [continuityPrompt]);

  const providerFlow = useWorkbenchProviderFlow({
    locale,
    workbench,
    persistWorkbench,
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
    browseResult: workspace.browseResult,
    browseError: workspace.browseError,
    isBrowsing: workspace.isBrowsing,
    selectedFile: workspace.selectedFile,
    previewError: workspace.previewError,
    isPreviewLoading: workspace.isPreviewLoading,
    chatMessages: providerFlow.chatMessages,
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
