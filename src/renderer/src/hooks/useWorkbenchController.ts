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
import { getAgentProfileDisplayName, resolveAgentProfileModel, resolveAgentProfileModelOptions } from '../../../shared/agentProfiles.js';
import type { PromptBuilderConfig } from '../../../shared/promptBuilder.js';
import type { AiConfig, AiProviderConfig, AiProviderDefinition } from '../aiConfig.js';
import { getProviderDefinition, getProviderModelOptions } from '../aiConfig.js';
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
  userInput: string;
  continuityPrompt: string;
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
  handleArchiveThread: (threadId?: string) => void;
  handleDeleteThread: (threadId?: string) => void;
  handleCancelRun: (runId: string) => Promise<void>;
  handleToggleTask: (taskId: string) => void;
  handleAddTask: () => void;
  handleSendEntry: () => Promise<void>;
  handleOpenOrchestrationPanel: (mode: 'standard' | 'discussion', prompt?: string) => void;
  handleCloseOrchestrationPanel: () => void;
  handleStartOrchestration: (discussionConfig?: DiscussionAutomationConfigInput | null) => Promise<void>;
  handleSetActiveOrchestrationRunId: (runId: string | null) => Promise<void>;
  setTargetModel: (value: string) => void;
  setUserInput: (value: string) => void;
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

const getProfileTarget = (profile: AppState['agentProfiles'][number] | null): { kind: WorkbenchTargetKind; id: string } => ({
  kind: profile?.targetKind ?? 'adapter',
  id: profile?.targetId ?? profile?.adapterId ?? '',
});

const getProviderModelSource = (providerId: string, aiConfig: AiConfig): { defaultModel: string | null; supportedModels: string[] } | null => {
  const providerConfig = aiConfig.providers[providerId];
  if (!providerConfig) {
    return null;
  }
  const supportedModels = getProviderModelOptions(providerId, providerConfig);
  return {
    defaultModel: providerConfig.default_model?.trim() || supportedModels[0] || null,
    supportedModels,
  };
};

const getProviderDefinitionModelSource = (definition: AiProviderDefinition | null): { defaultModel: string | null; supportedModels: string[] } | null => {
  if (!definition) {
    return null;
  }

  const supportedModels = [...definition.modelSuggestions];
  return {
    defaultModel: supportedModels[0] ?? null,
    supportedModels,
  };
};

const decodeFileMentionPath = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractFileMentionPaths = (prompt: string): string[] => {
  const mentionedPaths: string[] = [];
  const pattern = /@file:(?:"([^"]+)"|([^\s]+))/gu;

  for (const match of prompt.matchAll(pattern)) {
    const rawPath = match[1] ?? match[2] ?? '';
    const relativePath = decodeFileMentionPath(rawPath.trim());
    if (relativePath) {
      mentionedPaths.push(relativePath);
    }
  }

  return [...new Set(mentionedPaths)];
};

export function useWorkbenchController(input: UseWorkbenchControllerInput): UseWorkbenchControllerResult {
  const { locale, aiConfig, appState, promptBuilderConfig, onSaveWorkbenchState } = input;
  const persistedWorkbench = appState.workbench ?? DEFAULT_WORKBENCH_STATE;
  const bootstrapThreadRef = useRef<TaskThread | null>(null);
  const [selectedTargetKind, setSelectedTargetKind] = useState<WorkbenchTargetKind>('provider');
  const [selectedProviderId, setSelectedProviderId] = useState(aiConfig.active_provider ?? '');
  const [selectedAdapterId, setSelectedAdapterId] = useState('');
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [targetModel, setTargetModel] = useState(aiConfig.active_model);
  const [userInput, setUserInput] = useState('');
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
  const threadOptions = useMemo<WorkbenchOption[]>(() => workbench.threads.filter((thread) => !thread.archivedAt).map((thread) => ({ id: thread.id, label: thread.title })), [workbench.threads]);

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
    () => appState.agentProfiles.filter((profile) => profile.enabled).map((profile) => ({ id: profile.id, label: getAgentProfileDisplayName(profile) })),
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
      const firstProfile = appState.agentProfiles.find((profile) => profile.id === agentProfileOptions[0]?.id) ?? null;
      const firstProfileTarget = getProfileTarget(firstProfile);
      const firstProfileAdapter = firstProfileTarget.kind === 'adapter' ? appState.adapters.find((adapter) => adapter.id === firstProfileTarget.id) ?? null : null;
      const firstProfileProvider = firstProfileTarget.kind === 'provider' ? getProviderModelSource(firstProfileTarget.id, aiConfig) : null;
      const firstProfileModel = firstProfile ? resolveAgentProfileModel(firstProfile, firstProfileAdapter ?? firstProfileProvider) : '';
      if (firstProfileTarget.id) {
        setSelectedTargetKind(firstProfileTarget.kind);
        if (firstProfileTarget.kind === 'provider') {
          setSelectedProviderId(firstProfileTarget.id);
        } else {
          setSelectedAdapterId(firstProfileTarget.id);
        }
      }
      if (firstProfileModel) {
        setTargetModel(firstProfileModel);
      }
    }
  }, [agentProfileOptions, aiConfig, appState.adapters, appState.agentProfiles, selectedAgentProfileId]);

  const selectedProviderDefinition = useMemo(
    () => (selectedProviderId ? getProviderDefinition(selectedProviderId, aiConfig.providers[selectedProviderId]) : null),
    [aiConfig.providers, selectedProviderId],
  );
  const selectedProviderConfig = selectedProviderId ? aiConfig.providers[selectedProviderId] ?? null : null;
  const selectedAdapter = availableAdapters.find((adapter) => adapter.id === selectedAdapterId) ?? null;
  const selectedAgentProfile = appState.agentProfiles.find((profile) => profile.id === selectedAgentProfileId) ?? null;
  const selectedTargetModelSource = useMemo(() => {
    if (selectedTargetKind === 'provider') {
      return selectedProviderConfig && selectedProviderId
        ? getProviderModelSource(selectedProviderId, aiConfig)
        : getProviderDefinitionModelSource(selectedProviderDefinition);
    }

    if (!selectedAdapter) {
      return null;
    }

    return {
      defaultModel: selectedAdapter.defaultModel,
      supportedModels: selectedAdapter.supportedModels,
    };
  }, [aiConfig, selectedAdapter, selectedProviderConfig, selectedProviderDefinition, selectedProviderId, selectedTargetKind]);

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
    if (selectedAgentProfile) {
      resolveAgentProfileModelOptions(selectedAgentProfile, selectedTargetModelSource).forEach((model) => {
        if (model.trim()) models.add(model.trim());
      });
    } else if (selectedTargetModelSource) {
      const defaultModel = selectedTargetModelSource.defaultModel?.trim();
      if (defaultModel) models.add(defaultModel);
      selectedTargetModelSource.supportedModels.forEach((model) => {
        const normalizedModel = model.trim();
        if (normalizedModel) models.add(normalizedModel);
      });
    }
    if (targetModel.trim()) models.add(targetModel.trim());
    return [...models];
  }, [selectedAgentProfile, selectedTargetModelSource, targetModel]);

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
        selectedFilePath: null,
        selectedFileContent: null,
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
    ],
  );

  const providerFlow = useWorkbenchProviderFlow({
    locale,
    activeThreadId: activeThread?.id ?? null,
    selectedProviderId,
    selectedProviderDefinition,
    selectedProviderConfig,
    targetModel,
    userInput,
    continuityPrompt,
    setUserInput,
    boundSkills,
    selectedAgentLabel: selectedAgentProfile ? getAgentProfileDisplayName(selectedAgentProfile) : null,
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
    targetPrompt: userInput,
    targetModel,
    setTaskStatusMessage: taskBoard.setTaskStatusMessage,
    selectedAgentLabel: selectedAgentProfile ? getAgentProfileDisplayName(selectedAgentProfile) : null,
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
      const providerSource = providerConfig ? getProviderModelSource(providerId, aiConfig) : getProviderDefinitionModelSource(providerDefinition);
      setSelectedTargetKind('provider');
      setSelectedProviderId(providerId);
      setTargetModel(
        selectedAgentProfile
          ? resolveAgentProfileModel(selectedAgentProfile, providerSource)
          : providerSource?.defaultModel ?? providerSource?.supportedModels[0] ?? '',
      );
      return;
    }

    const adapterId = nextTargetOptionId.replace(/^adapter:/, '');
    const nextAdapter = availableAdapters.find((adapter) => adapter.id === adapterId) ?? null;
    const adapterSource = nextAdapter
      ? {
          defaultModel: nextAdapter.defaultModel,
          supportedModels: nextAdapter.supportedModels,
        }
      : null;
    setSelectedTargetKind('adapter');
    setSelectedAdapterId(adapterId);
    setTargetModel(
      selectedAgentProfile
        ? resolveAgentProfileModel(selectedAgentProfile, adapterSource)
        : adapterSource?.defaultModel ?? adapterSource?.supportedModels[0] ?? '',
    );
  };

  const handleThreadChange = (nextThreadId: string): void => {
    void queueWorkbenchPersist((currentWorkbench) => ({
      ...currentWorkbench,
      activeThreadId: nextThreadId,
    }));
  };

  const handleAgentProfileChange = (nextProfileId: string): void => {
    setSelectedAgentProfileId(nextProfileId);
    const nextProfile = appState.agentProfiles.find((profile) => profile.id === nextProfileId) ?? null;
    const nextProfileTarget = getProfileTarget(nextProfile);
    const nextProfileAdapter = nextProfileTarget.kind === 'adapter' ? appState.adapters.find((adapter) => adapter.id === nextProfileTarget.id) ?? null : null;
    const nextProfileProvider = nextProfileTarget.kind === 'provider' ? getProviderModelSource(nextProfileTarget.id, aiConfig) : null;
    const nextProfileModel = nextProfile ? resolveAgentProfileModel(nextProfile, nextProfileAdapter ?? nextProfileProvider) : '';
    if (nextProfileTarget.id) {
      setSelectedTargetKind(nextProfileTarget.kind);
      if (nextProfileTarget.kind === 'provider') {
        setSelectedProviderId(nextProfileTarget.id);
      } else {
        setSelectedAdapterId(nextProfileTarget.id);
      }
    }
    if (nextProfileModel) {
      setTargetModel(nextProfileModel);
    }
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

  const handleArchiveThread = (threadIdOverride?: string): void => {
    const threadId = threadIdOverride ?? activeThread?.id ?? null;
    if (!threadId) {
      return;
    }

    void queueWorkbenchPersist((currentWorkbench) => {
      const archivedAt = new Date().toISOString();
      const targetExists = currentWorkbench.threads.some((thread) => thread.id === threadId);
      if (!targetExists) {
        return currentWorkbench;
      }

      const visibleThreads = currentWorkbench.threads.filter((thread) => !thread.archivedAt && thread.id !== threadId);
      const fallbackThread = visibleThreads[0] ?? createTaskThread({ locale, objective: currentWorkbench.objective });
      const hasFallbackThread = currentWorkbench.threads.some((thread) => thread.id === fallbackThread.id);
      return {
        ...currentWorkbench,
        activeThreadId: currentWorkbench.activeThreadId === threadId ? fallbackThread.id : currentWorkbench.activeThreadId,
        threads: [
          ...currentWorkbench.threads.map((thread) => (thread.id === threadId ? { ...thread, archivedAt, updatedAt: archivedAt } : thread)),
          ...(currentWorkbench.activeThreadId === threadId && !hasFallbackThread ? [fallbackThread] : []),
        ],
      };
    });
  };

  const handleDeleteThread = (threadIdOverride?: string): void => {
    const threadId = threadIdOverride ?? activeThread?.id ?? null;
    if (!threadId) {
      return;
    }

    void queueWorkbenchPersist((currentWorkbench) => {
      const remainingThreads = currentWorkbench.threads.filter((thread) => thread.id !== threadId);
      if (remainingThreads.length === currentWorkbench.threads.length) {
        return currentWorkbench;
      }
      const fallbackThread = remainingThreads.find((thread) => !thread.archivedAt) ?? createTaskThread({ locale, objective: currentWorkbench.objective });
      const hasFallbackThread = remainingThreads.some((thread) => thread.id === fallbackThread.id);
      return {
        ...currentWorkbench,
        activeThreadId: currentWorkbench.activeThreadId === threadId ? fallbackThread.id : currentWorkbench.activeThreadId,
        threads: currentWorkbench.activeThreadId === threadId && !hasFallbackThread ? [...remainingThreads, fallbackThread] : remainingThreads,
      };
    });
  };

  const handleOpenOrchestrationPanel = (mode: 'standard' | 'discussion', prompt?: string): void => {
    setOrchestrationMode(mode);
    setOrchestrationExecutionStyle(mode === 'discussion' ? 'sequential' : 'parallel');
    setOrchestrationPrompt(prompt?.trim() || userInput.trim());
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

  const handleCancelRun = async (runId: string): Promise<void> => {
    await window.desktopApi.cancelRun({ runId });
  };

  const expandFileMentions = async (prompt: string): Promise<string> => {
    const workspaceRoot = workspace.workspaceRoot;
    if (!workspaceRoot) {
      return prompt;
    }

    const uniquePaths = extractFileMentionPaths(prompt);
    if (uniquePaths.length === 0) {
      return prompt;
    }

    const fileContexts = await Promise.all(uniquePaths.map(async (relativePath) => {
      try {
        const file = await window.desktopApi.readWorkspaceFile({ relativePath, workspaceRoot });
        return `File: ${file.relativePath}\n${file.content.slice(0, FILE_CONTEXT_LIMIT)}`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to read file.';
        return `File: ${relativePath}\n${message}`;
      }
    }));

    return `${prompt}\n\nExplicit file context (@file):\n${fileContexts.join('\n\n')}`;
  };

  const handleSendEntry = async (): Promise<void> => {
    const trimmedPrompt = userInput.trim();
    if (!trimmedPrompt) {
      return;
    }

    if (trimmedPrompt.startsWith('@multi')) {
      const orchestrationPromptText = trimmedPrompt.replace(/^@multi\s*/, '').trim();
      handleOpenOrchestrationPanel('standard', await expandFileMentions(orchestrationPromptText));
      return;
    }

    const parsedEntry = resolveWorkbenchEntryCommand(trimmedPrompt);
    if (parsedEntry.command === 'clear') {
      setUserInput('');
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
      handleOpenOrchestrationPanel('standard', await expandFileMentions(parsedEntry.prompt || userInput));
      return;
    }
    if (parsedEntry.command === 'discuss') {
      handleOpenOrchestrationPanel('discussion', await expandFileMentions(parsedEntry.prompt || userInput));
      return;
    }

    const promptWithExplicitFiles = await expandFileMentions(parsedEntry.prompt || userInput);

    if (selectedTargetKind === 'provider') {
      await providerFlow.handleProviderSend(promptWithExplicitFiles);
      return;
    }

    await adapterFlow.handleStartAdapterRun(promptWithExplicitFiles);
    setUserInput('');
  };

  const canSend = selectedTargetKind === 'provider'
    ? Boolean(selectedProviderId && selectedProviderConfig)
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
    userInput,
    continuityPrompt,
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
    handleAgentProfileChange,
    handleThreadChange,
    handleCreateThread,
    handleNewThread,
    handleArchiveThread,
    handleDeleteThread,
    handleCancelRun,
    handleToggleTask: taskBoard.handleToggleTask,
    handleAddTask: taskBoard.handleAddTask,
    handleSendEntry,
    handleOpenOrchestrationPanel,
    handleCloseOrchestrationPanel,
    handleStartOrchestration,
    handleSetActiveOrchestrationRunId: orchestrationFlow.setActiveOrchestrationRunId,
    setTargetModel,
    setUserInput,
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
