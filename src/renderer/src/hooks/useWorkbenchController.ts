import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  DiscussionAutomationConfigInput,
  Locale,
  OrchestrationExecutionStyle,
  TaskThread,
  WorkbenchState,
  WorkbenchTargetKind,
  WorkspaceEntry,
} from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import type { PromptBuilderConfig } from '../../../shared/promptBuilder.js';
import type { AiConfig, AiProviderConfig, AiProviderDefinition } from '../aiConfig.js';
import { getProviderDefinition, isProviderReady } from '../aiConfig.js';
import {
  buildContinuityPrompt,
  createTaskThread,
  getActiveTaskThread,
  resolveBoundSkills,
} from '../workbench.js';
import { useWorkbenchAdapterFlow } from './useWorkbenchAdapterFlow.js';
import { useQueuedWorkbenchPersist } from './useQueuedWorkbenchPersist.js';
import { type WorkbenchOption, FILE_CONTEXT_LIMIT, resolveWorkbenchEntryCommand } from './workbenchControllerShared.js';
import { useWorkbenchOrchestrationFlow } from './useWorkbenchOrchestrationFlow.js';
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

export interface ComposerTargetOption extends WorkbenchOption {
  kind: WorkbenchTargetKind;
  meta: string;
}

export interface UseWorkbenchControllerResult {
  workbench: WorkbenchState;
  activeThread: TaskThread | null;
  chatMessages: TaskThread['messages'];
  threadOptions: WorkbenchOption[];
  targetOptions: ComposerTargetOption[];
  providerOptions: WorkbenchOption[];
  adapterOptions: WorkbenchOption[];
  agentProfileOptions: WorkbenchOption[];
  browseResult: ReturnType<typeof useWorkbenchWorkspace>['browseResult'];
  browseError: string | null;
  isBrowsing: boolean;
  workspaceRoot: string | null;
  workspaceLabel: string | null;
  workspaceStatusMessage: string | null;
  selectedFile: ReturnType<typeof useWorkbenchWorkspace>['selectedFile'];
  previewError: string | null;
  isPreviewLoading: boolean;
  isApplyingFile: boolean;
  isSavingFile: boolean;
  chatError: string | null;
  isSending: boolean;
  canSend: boolean;
  selectedTargetKind: WorkbenchTargetKind;
  selectedProviderId: string;
  selectedAdapterId: string;
  selectedTargetOptionId: string;
  selectedAgentProfileId: string;
  targetModel: string;
  targetModelOptions: string[];
  targetPrompt: string;
  runTitle: string;
  newTaskTitle: string;
  newTaskDetail: string;
  isGeneratingTasks: boolean;
  taskStatusMessage: string | null;
  selectedProviderDefinition: AiProviderDefinition | null;
  selectedProviderConfig: AiProviderConfig | null;
  selectedAdapter: AppState['adapters'][number] | null;
  boundSkills: AppState['skills'];
  recentAdapterRuns: AppState['runs'];
  activeThreadRuns: AppState['runs'];
  isOrchestrationPanelOpen: boolean;
  orchestrationMode: 'standard' | 'discussion';
  orchestrationExecutionStyle: OrchestrationExecutionStyle;
  orchestrationPrompt: string;
  selectedOrchestrationParticipantIds: string[];
  activeOrchestrationRun: ReturnType<typeof useWorkbenchOrchestrationFlow>['activeOrchestrationRun'];
  activeOrchestrationNodes: ReturnType<typeof useWorkbenchOrchestrationFlow>['activeOrchestrationNodes'];
  orchestrationError: string | null;
  isStartingOrchestration: boolean;
  handleGenerateChecklist: () => Promise<void>;
  handleSaveObjective: (objective: string) => void;
  handleTargetOptionChange: (nextTargetOptionId: string) => void;
  handleAgentProfileChange: (nextProfileId: string) => void;
  handleThreadChange: (nextThreadId: string) => void;
  handleCreateThread: () => void;
  handleNewThread: () => void;
  handleToggleTask: (taskId: string) => void;
  handleAddTask: () => void;
  handleSendEntry: () => Promise<void>;
  handleOpenOrchestrationPanel: (mode: 'standard' | 'discussion', prompt?: string) => void;
  handleCloseOrchestrationPanel: () => void;
  handleStartOrchestration: (discussionConfig?: DiscussionAutomationConfigInput | null) => Promise<void>;
  handleSetActiveOrchestrationRunId: (runId: string | null) => Promise<void>;
  setTargetModel: (value: string) => void;
  setTargetPrompt: (value: string) => void;
  setRunTitle: (value: string) => void;
  setNewTaskTitle: (value: string) => void;
  setNewTaskDetail: (value: string) => void;
  setOrchestrationMode: (value: 'standard' | 'discussion') => void;
  setOrchestrationExecutionStyle: (value: OrchestrationExecutionStyle) => void;
  setOrchestrationPrompt: (value: string) => void;
  setSelectedOrchestrationParticipantIds: (value: string[]) => void;
  selectWorkspaceFolder: () => Promise<void>;
  loadDirectory: (relativePath: string | null) => Promise<void>;
  loadDirectoryEntries: (relativePath: string | null) => Promise<WorkspaceEntry[]>;
  loadFilePreview: (entry: WorkspaceEntry) => Promise<void>;
  loadFilePreviewByPath: (relativePath: string) => Promise<void>;
  applyToSelectedFile: (content: string) => Promise<void>;
  saveSelectedFile: (content: string) => Promise<void>;
}

const normalizeThreadedWorkbench = (workbench: WorkbenchState, locale: Locale, bootstrapThread: TaskThread): WorkbenchState => {
  const nextWorkbench = {
    ...DEFAULT_WORKBENCH_STATE,
    ...workbench,
    recentWorkspaceRoots: workbench.recentWorkspaceRoots ?? [],
    processedOrchestrationNodeIds: workbench.processedOrchestrationNodeIds ?? [],
    orchestrationThreadBindings: workbench.orchestrationThreadBindings ?? [],
    activeOrchestrationRunId: workbench.activeOrchestrationRunId ?? null,
  };

  if (nextWorkbench.threads.length === 0) {
    return {
      ...nextWorkbench,
      activeThreadId: bootstrapThread.id,
      threads: [bootstrapThread],
    };
  }

  if (nextWorkbench.activeThreadId && nextWorkbench.threads.some((thread) => thread.id === nextWorkbench.activeThreadId)) {
    return nextWorkbench;
  }

  return {
    ...nextWorkbench,
    activeThreadId: nextWorkbench.threads[0]?.id ?? null,
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
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [targetModel, setTargetModel] = useState(aiConfig.active_model);
  const [targetPrompt, setTargetPrompt] = useState('');
  const [isOrchestrationPanelOpen, setIsOrchestrationPanelOpen] = useState(false);
  const [orchestrationMode, setOrchestrationMode] = useState<'standard' | 'discussion'>('standard');
  const [orchestrationExecutionStyle, setOrchestrationExecutionStyle] = useState<OrchestrationExecutionStyle>('parallel');
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('');
  const [selectedOrchestrationParticipantIds, setSelectedOrchestrationParticipantIds] = useState<string[]>([]);

  bootstrapThreadRef.current ??= createTaskThread({ locale, objective: persistedWorkbench.objective });

  const workbench = useMemo(
    () => normalizeThreadedWorkbench(persistedWorkbench, locale, bootstrapThreadRef.current ?? createTaskThread({ locale, objective: persistedWorkbench.objective })),
    [locale, persistedWorkbench],
  );
  const activeThread = useMemo(() => getActiveTaskThread(workbench), [workbench]);
  const threadOptions = useMemo<WorkbenchOption[]>(() => workbench.threads.map((thread) => ({ id: thread.id, label: thread.title })), [workbench.threads]);

  const persistWorkbench = async (nextWorkbench: WorkbenchState): Promise<void> => {
    await onSaveWorkbenchState({
      ...normalizeThreadedWorkbench(nextWorkbench, locale, bootstrapThreadRef.current ?? createTaskThread({ locale, objective: nextWorkbench.objective })),
      updatedAt: new Date().toISOString(),
    });
  };

  const { getLatestWorkbench, queueWorkbenchPersist } = useQueuedWorkbenchPersist({
    workbench,
    persistWorkbench,
  });

  const handleWorkspaceRootChange = async (workspaceRoot: string | null): Promise<void> => {
    await queueWorkbenchPersist((currentWorkbench) => ({
      ...currentWorkbench,
      workspaceRoot,
    }));
  };

  const workspace = useWorkbenchWorkspace({
    locale,
    workspaceRoot: workbench.workspaceRoot,
    onWorkspaceRootChange: handleWorkspaceRootChange,
  });

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
      Object.entries(aiConfig.providers).map(([providerId, providerConfig]) => ({
        id: providerId,
        label: providerConfig.label?.trim() || getProviderDefinition(providerId, providerConfig).label,
      })),
    [aiConfig.providers],
  );
  const adapterOptions = useMemo<WorkbenchOption[]>(
    () => availableAdapters.map((adapter) => ({ id: adapter.id, label: adapter.displayName })),
    [availableAdapters],
  );
  const agentProfileOptions = useMemo<WorkbenchOption[]>(
    () => appState.agentProfiles.filter((profile) => profile.enabled).map((profile) => ({ id: profile.id, label: profile.name })),
    [appState.agentProfiles],
  );

  useEffect(() => {
    if (!selectedAdapterId && availableAdapters[0]) {
      setSelectedAdapterId(availableAdapters[0].id);
      if (selectedTargetKind === 'adapter') {
        setTargetModel(availableAdapters[0].defaultModel ?? '');
      }
    }
  }, [availableAdapters, selectedAdapterId, selectedTargetKind]);

  useEffect(() => {
    if (!selectedAgentProfileId && agentProfileOptions[0]) {
      setSelectedAgentProfileId(agentProfileOptions[0].id);
    }
  }, [agentProfileOptions, selectedAgentProfileId]);

  useEffect(() => {
    if (selectedTargetKind === 'provider') {
      setSelectedProviderId(aiConfig.active_provider ?? selectedProviderId);
      setTargetModel(aiConfig.active_model);
    }
  }, [aiConfig.active_model, aiConfig.active_provider, selectedProviderId, selectedTargetKind]);

  const selectedProviderDefinition = useMemo(
    () => (selectedProviderId ? getProviderDefinition(selectedProviderId, aiConfig.providers[selectedProviderId]) : null),
    [aiConfig.providers, selectedProviderId],
  );
  const selectedProviderConfig = selectedProviderId ? aiConfig.providers[selectedProviderId] ?? null : null;
  const selectedAdapter = availableAdapters.find((adapter) => adapter.id === selectedAdapterId) ?? null;
  const selectedAgentProfile = appState.agentProfiles.find((profile) => profile.id === selectedAgentProfileId) ?? null;

  const targetOptions = useMemo<ComposerTargetOption[]>(
    () => [
      ...providerOptions.map((option) => ({ id: `provider:${option.id}`, label: option.label, kind: 'provider' as const, meta: locale === 'zh' ? 'Provider' : 'Provider' })),
      ...adapterOptions.map((option) => ({ id: `adapter:${option.id}`, label: option.label, kind: 'adapter' as const, meta: locale === 'zh' ? 'Adapter' : 'Adapter' })),
    ],
    [adapterOptions, locale, providerOptions],
  );

  const selectedTargetOptionId = selectedTargetKind === 'provider' ? `provider:${selectedProviderId}` : `adapter:${selectedAdapterId}`;

  const targetModelOptions = useMemo(() => {
    const models = new Set<string>();
    if (selectedTargetKind === 'provider') {
      (selectedProviderDefinition?.modelSuggestions ?? []).forEach((model) => {
        if (model.trim()) models.add(model.trim());
      });
    } else {
      (selectedAdapter?.supportedModels ?? []).forEach((model) => {
        if (model.trim()) models.add(model.trim());
      });
      const defaultAdapterModel = selectedAdapter?.defaultModel?.trim();
      if (defaultAdapterModel) models.add(defaultAdapterModel);
    }
    if (targetModel.trim()) models.add(targetModel.trim());
    return [...models];
  }, [selectedAdapter, selectedProviderDefinition, selectedTargetKind, targetModel]);

  const boundSkills = useMemo(() => {
    const targetId = selectedTargetKind === 'provider' ? selectedProviderId : selectedAdapterId;
    return resolveBoundSkills(appState.skills, workbench.skillBindings, selectedTargetKind, targetId, targetModel);
  }, [appState.skills, selectedAdapterId, selectedProviderId, selectedTargetKind, targetModel, workbench.skillBindings]);

  const taskBoard = useWorkbenchTaskBoard({
    locale,
    workbench,
    persistWorkbench,
  });

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
        recentProviderSummary: null,
        recentLocalRunSummary: null,
        continuityTemplate,
      }),
    [
      activeThread,
      appState.projectContext.summary,
      boundSkills,
      continuityTemplate,
      locale,
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
    const activeThreadMessageCount = activeThread ? activeThread.messages.length : 0;

    if (threadChanged || activeThreadMessageCount === 0) {
      setTargetPrompt(continuityPrompt);
    }
  }, [activeThread, continuityPrompt]);

  const providerFlow = useWorkbenchProviderFlow({
    locale,
    activeThreadId: activeThread?.id ?? null,
    selectedProviderId,
    selectedProviderDefinition,
    selectedProviderConfig,
    targetModel,
    targetPrompt,
    boundSkills,
    selectedFile: workspace.selectedFile,
    selectedAgentLabel: selectedAgentProfile?.name ?? null,
    selectedAgentPrompt: selectedAgentProfile?.systemPrompt ?? null,
    getLatestWorkbench,
    queueWorkbenchPersist,
  });

  const adapterFlow = useWorkbenchAdapterFlow({
    locale,
    appState,
    workbench,
    selectedAdapter,
    activeThread,
    activeThreadId: activeThread?.id ?? null,
    targetPrompt,
    targetModel,
    setTaskStatusMessage: taskBoard.setTaskStatusMessage,
    selectedAgentLabel: selectedAgentProfile?.name ?? null,
    selectedAgentPrompt: selectedAgentProfile?.systemPrompt ?? null,
    getLatestWorkbench,
    queueWorkbenchPersist,
  });

  const orchestrationFlow = useWorkbenchOrchestrationFlow({
    locale,
    appState,
    workbench,
    activeThreadId: activeThread?.id ?? null,
    queueWorkbenchPersist,
  });

  const handleTargetOptionChange = (nextTargetOptionId: string): void => {
    if (nextTargetOptionId.startsWith('provider:')) {
      const providerId = nextTargetOptionId.replace(/^provider:/, '');
      const providerConfig = aiConfig.providers[providerId];
      const providerDefinition = providerConfig ? getProviderDefinition(providerId, providerConfig) : null;
      setSelectedTargetKind('provider');
      setSelectedProviderId(providerId);
      setTargetModel(providerConfig?.default_model?.trim() || aiConfig.active_model || providerDefinition?.modelSuggestions[0] || '');
      return;
    }

    const adapterId = nextTargetOptionId.replace(/^adapter:/, '');
    const nextAdapter = availableAdapters.find((adapter) => adapter.id === adapterId) ?? null;
    setSelectedTargetKind('adapter');
    setSelectedAdapterId(adapterId);
    setTargetModel(nextAdapter?.defaultModel ?? '');
  };

  const handleThreadChange = (nextThreadId: string): void => {
    void queueWorkbenchPersist((currentWorkbench) => ({
      ...currentWorkbench,
      activeThreadId: nextThreadId,
    }));
  };

  const handleCreateThread = (): void => {
    void queueWorkbenchPersist((currentWorkbench) => {
      const nextThread = createTaskThread({ locale, objective: currentWorkbench.objective });
      return {
        ...currentWorkbench,
        activeThreadId: nextThread.id,
        threads: [...currentWorkbench.threads, nextThread],
      };
    });
  };

  const handleNewThread = (): void => {
    handleCreateThread();
  };

  const handleOpenOrchestrationPanel = (mode: 'standard' | 'discussion', prompt?: string): void => {
    setOrchestrationMode(mode);
    setOrchestrationExecutionStyle(mode === 'discussion' ? 'sequential' : 'parallel');
    setOrchestrationPrompt(prompt?.trim() || targetPrompt.trim());
    setSelectedOrchestrationParticipantIds((current) => current.length > 0 ? current : agentProfileOptions.slice(0, mode === 'discussion' ? 2 : 3).map((option) => option.id));
    setIsOrchestrationPanelOpen(true);
  };

  const handleCloseOrchestrationPanel = (): void => {
    setIsOrchestrationPanelOpen(false);
  };

  const handleStartOrchestration = async (discussionConfig?: DiscussionAutomationConfigInput | null): Promise<void> => {
    await orchestrationFlow.handleStartOrchestration({
      prompt: orchestrationPrompt,
      automationMode: orchestrationMode,
      executionStyle: orchestrationMode === 'discussion' ? 'sequential' : orchestrationExecutionStyle,
      participantProfileIds: selectedOrchestrationParticipantIds,
      masterAgentProfileId: selectedAgentProfile?.id ?? null,
      discussionConfig: orchestrationMode === 'discussion'
        ? {
            participantsPerRound: Math.max(selectedOrchestrationParticipantIds.length, discussionConfig?.participantsPerRound ?? 2),
            participantProfileIds: selectedOrchestrationParticipantIds,
            ...discussionConfig,
          }
        : null,
    });
    setIsOrchestrationPanelOpen(false);
  };

  const handleSendEntry = async (): Promise<void> => {
    const trimmedPrompt = targetPrompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    if (trimmedPrompt.startsWith('@multi')) {
      const orchestrationPromptText = trimmedPrompt.replace(/^@multi\s*/, '').trim();
      handleOpenOrchestrationPanel('standard', orchestrationPromptText);
      return;
    }

    const parsedEntry = resolveWorkbenchEntryCommand(trimmedPrompt);
    if (parsedEntry.command === 'clear') {
      setTargetPrompt('');
      return;
    }
    if (parsedEntry.command === 'switchProvider') {
      const currentIndex = providerOptions.findIndex((option) => option.id === selectedProviderId);
      const nextOption = providerOptions[(currentIndex + 1) % Math.max(providerOptions.length, 1)];
      if (nextOption) {
        handleTargetOptionChange(`provider:${nextOption.id}`);
      }
      return;
    }
    if (parsedEntry.command === 'orchestrate') {
      handleOpenOrchestrationPanel('standard', parsedEntry.prompt || targetPrompt);
      return;
    }
    if (parsedEntry.command === 'discuss') {
      handleOpenOrchestrationPanel('discussion', parsedEntry.prompt || targetPrompt);
      return;
    }

    if (selectedTargetKind === 'provider') {
      await providerFlow.handleProviderSend(parsedEntry.prompt || targetPrompt);
      return;
    }

    await adapterFlow.handleStartAdapterRun(parsedEntry.prompt || targetPrompt);
  };

  const canSend = selectedTargetKind === 'provider'
    ? Boolean(selectedProviderId && selectedProviderConfig && isProviderReady(selectedProviderConfig, targetModel))
    : Boolean(selectedAdapter);

  const activeThreadRuns = useMemo(() => {
    const threadId = activeThread?.id ?? null;
    if (!threadId) {
      return [];
    }

    return appState.runs
      .filter((run) => run.workbenchThreadId === threadId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 5);
  }, [activeThread?.id, appState.runs]);

  return {
    workbench,
    activeThread,
    chatMessages: activeThread?.messages ?? [],
    threadOptions,
    targetOptions,
    providerOptions,
    adapterOptions,
    agentProfileOptions,
    browseResult: workspace.browseResult,
    browseError: workspace.browseError,
    isBrowsing: workspace.isBrowsing,
    workspaceRoot: workspace.workspaceRoot,
    workspaceLabel: workspace.workspaceLabel,
    workspaceStatusMessage: workspace.workspaceStatusMessage,
    selectedFile: workspace.selectedFile,
    previewError: workspace.previewError,
    isPreviewLoading: workspace.isPreviewLoading,
    isApplyingFile: workspace.isApplyingFile,
    isSavingFile: workspace.isSavingFile,
    chatError: selectedTargetKind === 'provider' ? providerFlow.chatError : adapterFlow.runError,
    isSending: selectedTargetKind === 'provider' ? providerFlow.isSending : adapterFlow.isStartingRun,
    canSend,
    selectedTargetKind,
    selectedProviderId,
    selectedAdapterId,
    selectedTargetOptionId,
    selectedAgentProfileId,
    targetModel,
    targetModelOptions,
    targetPrompt,
    runTitle: adapterFlow.runTitle,
    newTaskTitle: taskBoard.newTaskTitle,
    newTaskDetail: taskBoard.newTaskDetail,
    isGeneratingTasks: taskBoard.isGeneratingTasks,
    taskStatusMessage: taskBoard.taskStatusMessage,
    selectedProviderDefinition,
    selectedProviderConfig,
    selectedAdapter,
    boundSkills,
    recentAdapterRuns: adapterFlow.recentAdapterRuns,
    activeThreadRuns,
    isOrchestrationPanelOpen,
    orchestrationMode,
    orchestrationExecutionStyle,
    orchestrationPrompt,
    selectedOrchestrationParticipantIds,
    activeOrchestrationRun: orchestrationFlow.activeOrchestrationRun,
    activeOrchestrationNodes: orchestrationFlow.activeOrchestrationNodes,
    orchestrationError: orchestrationFlow.orchestrationError,
    isStartingOrchestration: orchestrationFlow.isStartingOrchestration,
    handleGenerateChecklist: taskBoard.handleGenerateChecklist,
    handleSaveObjective: taskBoard.handleSaveObjective,
    handleTargetOptionChange,
    handleAgentProfileChange: setSelectedAgentProfileId,
    handleThreadChange,
    handleCreateThread,
    handleNewThread,
    handleToggleTask: taskBoard.handleToggleTask,
    handleAddTask: taskBoard.handleAddTask,
    handleSendEntry,
    handleOpenOrchestrationPanel,
    handleCloseOrchestrationPanel,
    handleStartOrchestration,
    handleSetActiveOrchestrationRunId: orchestrationFlow.setActiveOrchestrationRunId,
    setTargetModel,
    setTargetPrompt,
    setRunTitle: adapterFlow.setRunTitle,
    setNewTaskTitle: taskBoard.setNewTaskTitle,
    setNewTaskDetail: taskBoard.setNewTaskDetail,
    setOrchestrationMode,
    setOrchestrationExecutionStyle,
    setOrchestrationPrompt,
    setSelectedOrchestrationParticipantIds,
    selectWorkspaceFolder: workspace.selectWorkspaceFolder,
    loadDirectory: workspace.loadDirectory,
    loadDirectoryEntries: workspace.loadDirectoryEntries,
    loadFilePreview: workspace.loadFilePreview,
    loadFilePreviewByPath: workspace.loadFilePreviewByPath,
    applyToSelectedFile: workspace.applyToSelectedFile,
    saveSelectedFile: workspace.saveSelectedFile,
  };
}
