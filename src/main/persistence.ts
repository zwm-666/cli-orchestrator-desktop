import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AdapterRoutingSettings,
  AgentProfile,
  AgentRoleType,
  AppState,
  CustomCliAdapterDefinition,
  ExecutionTranscriptEntry,
  HandoffArtifact,
  LaunchFormDraft,
  LocalToolCallLogEntry,
  LocalToolDefinition,
  LocalToolKind,
  LocalToolRegistry,
  LocalToolSource,
  McpHealthStatus,
  McpServerDefinition,
  McpTransport,
  OrchestrationNode,
  OrchestrationNodeStatus,
  OrchestrationRun,
  OrchestrationRunStatus,
  PlanDraft,
  RendererContinuityState,
  RetryPolicy,
  RoutingSettings,
  RunEvent,
  RunSession,
  RunStatus,
  SkillDefinition,
  SubagentStatusEntry,
  SubagentWorkStatus,
  TaskThread,
  TaskThreadContinuation,
  TaskThreadMessage,
  Task,
  TaskRoutingProfile,
  TaskRoutingRule,
  TaskType,
  WorkbenchOrchestrationBinding,
  WorkbenchSkillBinding,
  WorkbenchActivitySummary,
  WorkbenchState,
  WorkbenchTaskItem,
} from '../shared/domain.js';
import {
  DEFAULT_WORKBENCH_STATE,
  DEFAULT_LOCAL_TOOL_REGISTRY,
  DEFAULT_RETRY_POLICY,
  DEFAULT_ROUTING_SETTINGS,
  DEFAULT_TASK_ROUTING_PROFILES,
  TASK_TYPES,
} from '../shared/domain.js';
const PERSISTENCE_VERSION = 1;
const PERSISTENCE_DIRECTORY = '.cli-orchestrator';
const PERSISTENCE_FILENAME = 'desktop-state.v1.json';
const BACKUP_FILENAME_SUFFIX = '.bak';
type JsonObject = Record<string, unknown>;
interface PersistedAppData {
  conversations: AppState['conversations'];
  tasks: Task[];
  runs: RunSession[];
  subagentStatuses: SubagentStatusEntry[];
  localToolRegistry: LocalToolRegistry;
  localToolCallLogs: LocalToolCallLogEntry[];
  nextClaudeTask: AppState['nextClaudeTask'];
  agentProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  orchestrationRuns: OrchestrationRun[];
  orchestrationNodes: OrchestrationNode[];
  projectContext: { summary: string; updatedAt: string | null };
  workbench?: WorkbenchState;
}
interface PersistedEnvelopeV1 {
  version: typeof PERSISTENCE_VERSION;
  projectRoot: string;
  savedAt: string;
  appState: PersistedAppData;
  continuity: RendererContinuityState;
  routing: RoutingSettings;
}
interface LoadedEnvelope {
  appData: PersistedAppData | null;
  continuity: RendererContinuityState;
  routing: RoutingSettings;
}
const DEFAULT_LAUNCH_FORM: LaunchFormDraft = {
  title: '',
  prompt: '',
  adapterId: '',
  model: '',
  conversationId: '',
  timeoutMs: '',
};
const DEFAULT_CONTINUITY_STATE: RendererContinuityState = {
  planDraft: null,
  selectedPlannedTaskIndex: 0,
  launchForm: DEFAULT_LAUNCH_FORM,
  selectedRunId: null,
  selectedConversationId: null,
  locale: 'en',
  lastRoute: null,
};
const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
const isNonNegativeInteger = (value: unknown): value is number => {
  return Number.isInteger(value) && (value as number) >= 0;
};
const normalizeNullableString = (value: unknown): string | null => {
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const normalizeWorkbenchTargetKind = (value: unknown): WorkbenchState['selectedTargetKind'] => {
  return value === 'adapter' ? 'adapter' : 'provider';
};

const normalizeProjectContext = (value: unknown): AppState['projectContext'] => {
  if (!isJsonObject(value)) {
    return { summary: '', updatedAt: null };
  }

  return {
    summary: typeof value.summary === 'string' ? value.summary : '',
    updatedAt: normalizeNullableString(value.updatedAt),
  };
};
const normalizeLaunchForm = (value: unknown, selectedConversationId: string | null): LaunchFormDraft => {
  if (!isJsonObject(value)) {
    return {
      ...DEFAULT_LAUNCH_FORM,
      conversationId: selectedConversationId ?? '',
    };
  }
  const conversationId =
    typeof value.conversationId === 'string' ? value.conversationId : (selectedConversationId ?? '');
  return {
    title: typeof value.title === 'string' ? value.title : '',
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    adapterId: typeof value.adapterId === 'string' ? value.adapterId : '',
    model: typeof value.model === 'string' ? value.model : '',
    conversationId,
    timeoutMs: typeof value.timeoutMs === 'string' ? value.timeoutMs : '',
  };
};
const normalizePlanDraft = (value: unknown): PlanDraft | null => {
  if (!isJsonObject(value)) {
    return null;
  }
  if (
    typeof value.rawInput !== 'string' ||
    typeof value.plannerVersion !== 'string' ||
    !Array.isArray(value.plannedTasks) ||
    typeof value.cleanedPrompt !== 'string' ||
    typeof value.taskTitle !== 'string' ||
    !Array.isArray(value.mentions) ||
    typeof value.routingSource !== 'string' ||
    typeof value.confidence !== 'string' ||
    typeof value.rationale !== 'string' ||
    typeof value.segmentationSource !== 'string'
  ) {
    return null;
  }
  return {
    rawInput: value.rawInput,
    plannerVersion: value.plannerVersion,
    segmentationSource: value.segmentationSource as PlanDraft['segmentationSource'],
    plannedTasks: value.plannedTasks as PlanDraft['plannedTasks'],
    cleanedPrompt: value.cleanedPrompt,
    taskTitle: value.taskTitle,
    taskType: (typeof value.taskType === 'string' ? value.taskType : 'general') as PlanDraft['taskType'],
    displayCategory:
      typeof value.displayCategory === 'string'
        ? value.displayCategory
        : typeof value.taskType === 'string'
          ? value.taskType
          : 'general',
    matchedProfileId: typeof value.matchedProfileId === 'string' ? value.matchedProfileId : null,
    classificationReason:
      typeof value.classificationReason === 'string' ? value.classificationReason : 'Recovered persisted draft.',
    mentions: value.mentions as PlanDraft['mentions'],
    recommendedAdapterId: typeof value.recommendedAdapterId === 'string' ? value.recommendedAdapterId : null,
    recommendedModel: typeof value.recommendedModel === 'string' ? value.recommendedModel : null,
    routingSource: value.routingSource as PlanDraft['routingSource'],
    confidence: value.confidence as PlanDraft['confidence'],
    rationale: value.rationale,
  };
};
const normalizeAdapterRoutingSettings = (value: unknown): AdapterRoutingSettings => {
  if (!isJsonObject(value)) {
    return {
      enabled: true,
      defaultModel: '',
      modelOptions: [],
      customCommand: '',
    };
  }
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    defaultModel: typeof value.defaultModel === 'string' ? value.defaultModel : '',
    modelOptions: Array.isArray(value.modelOptions)
      ? (value.modelOptions as unknown[]).filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
      : [],
    customCommand: typeof value.customCommand === 'string' ? value.customCommand : '',
  };
};
const normalizeStringList = (value: unknown): string[] => {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
    : [];
};
const normalizeCustomCliAdapterDefinition = (value: unknown): CustomCliAdapterDefinition | null => {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : '';
  const command = typeof value.command === 'string' ? value.command.trim() : '';
  if (!id || !displayName || !command) {
    return null;
  }

  const defaultModel = typeof value.defaultModel === 'string' ? value.defaultModel.trim() : '';
  const supportedModels = normalizeStringList(value.supportedModels);
  return {
    id,
    displayName,
    command,
    args: normalizeStringList(value.args),
    promptTransport: value.promptTransport === 'stdin' ? 'stdin' : 'arg',
    description: typeof value.description === 'string' && value.description.trim().length > 0 ? value.description.trim() : `Custom local tool ${displayName}`,
    capabilities: normalizeStringList(value.capabilities),
    defaultTimeoutMs: typeof value.defaultTimeoutMs === 'number' && Number.isFinite(value.defaultTimeoutMs) && value.defaultTimeoutMs > 0 ? Math.round(value.defaultTimeoutMs) : null,
    defaultModel,
    supportedModels: supportedModels.includes(defaultModel) || !defaultModel ? supportedModels : [defaultModel, ...supportedModels],
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
  };
};
const normalizeTaskRoutingRule = (value: unknown): TaskRoutingRule => {
  if (!isJsonObject(value)) {
    return {
      adapterId: null,
      model: '',
    };
  }
  return {
    adapterId: normalizeNullableString(value.adapterId),
    model: typeof value.model === 'string' ? value.model : '',
  };
};
const normalizeTaskRoutingProfile = (value: unknown): TaskRoutingProfile | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  const taskType =
    typeof value.taskType === 'string' && TASK_TYPES.includes(value.taskType as TaskType)
      ? (value.taskType as TaskType)
      : 'general';
  return {
    id: value.id.trim(),
    label: typeof value.label === 'string' && value.label.trim().length > 0 ? value.label.trim() : taskType,
    taskType,
    adapterId: normalizeNullableString(value.adapterId),
    model: typeof value.model === 'string' ? value.model : '',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
  };
};
const normalizeRoutingSettings = (value: unknown): RoutingSettings => {
  if (!isJsonObject(value)) {
    return structuredClone(DEFAULT_ROUTING_SETTINGS);
  }
  const rawAdapterSettings = isJsonObject(value.adapterSettings) ? value.adapterSettings : {};
  const rawTaskTypeRules = isJsonObject(value.taskTypeRules) ? value.taskTypeRules : {};
  const adapterSettings = Object.fromEntries(
    Object.entries(rawAdapterSettings).map(([adapterId, adapterValue]) => {
      return [adapterId, normalizeAdapterRoutingSettings(adapterValue)];
    }),
  );
  const taskTypeRules = Object.fromEntries(
    TASK_TYPES.map((taskType) => {
      const rawRule = rawTaskTypeRules[taskType];
      return [taskType, normalizeTaskRoutingRule(rawRule)];
    }),
  ) as Record<TaskType, TaskRoutingRule>;
  const rawProfiles = Array.isArray(value.taskProfiles) ? value.taskProfiles : [];
  const normalizedProfiles = rawProfiles
    .map((profile) => normalizeTaskRoutingProfile(profile))
    .filter((profile): profile is TaskRoutingProfile => Boolean(profile));
  const taskProfiles =
    normalizedProfiles.length > 0
      ? normalizedProfiles
      : DEFAULT_TASK_ROUTING_PROFILES.map((profile) => ({
          ...profile,
          adapterId: taskTypeRules[profile.taskType].adapterId,
          model: taskTypeRules[profile.taskType].model,
        }));
  return {
    adapterSettings,
    discoveryRoots: normalizeStringList(value.discoveryRoots).length > 0 ? normalizeStringList(value.discoveryRoots) : [...DEFAULT_ROUTING_SETTINGS.discoveryRoots],
    customAdapters: (Array.isArray(value.customAdapters) ? value.customAdapters : [])
      .map((adapter) => normalizeCustomCliAdapterDefinition(adapter))
      .filter((adapter): adapter is CustomCliAdapterDefinition => Boolean(adapter)),
    taskTypeRules,
    taskProfiles,
  };
};
const normalizeContinuityState = (value: unknown): RendererContinuityState => {
  if (!isJsonObject(value)) {
    return structuredClone(DEFAULT_CONTINUITY_STATE);
  }
  const selectedConversationId = normalizeNullableString(value.selectedConversationId);
  return {
    planDraft: normalizePlanDraft(value.planDraft),
    selectedPlannedTaskIndex: isNonNegativeInteger(value.selectedPlannedTaskIndex) ? value.selectedPlannedTaskIndex : 0,
    launchForm: normalizeLaunchForm(value.launchForm, selectedConversationId),
    selectedRunId: normalizeNullableString(value.selectedRunId),
    selectedConversationId,
    locale: value.locale === 'zh' ? 'zh' : 'en',
    lastRoute: value.lastRoute === '/plan' || value.lastRoute === '/work' || value.lastRoute === '/config' ? value.lastRoute : null,
  };
};

const normalizeWorkbenchTaskItem = (value: unknown): WorkbenchTaskItem | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }

  const status = value.status === 'in_progress' || value.status === 'completed' ? value.status : 'pending';
  const source = value.source === 'assistant' || value.source === 'manual' ? value.source : 'planner';

  return {
    id: value.id.trim(),
    title: typeof value.title === 'string' ? value.title : '',
    detail: typeof value.detail === 'string' ? value.detail : '',
    status,
    source,
    agentProfileId: normalizeNullableString(value.agentProfileId),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    completedAt: normalizeNullableString(value.completedAt),
  };
};

const normalizeWorkbenchSkillBinding = (value: unknown): WorkbenchSkillBinding | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }

  return {
    id: value.id.trim(),
    targetKind: value.targetKind === 'adapter' ? 'adapter' : 'provider',
    targetId: typeof value.targetId === 'string' ? value.targetId : '',
    modelPattern: typeof value.modelPattern === 'string' ? value.modelPattern : '',
    enabledSkillIds: Array.isArray(value.enabledSkillIds)
      ? (value.enabledSkillIds as string[]).filter((entry) => typeof entry === 'string')
      : [],
  };
};

const normalizeWorkbenchActivitySummary = (value: unknown): WorkbenchActivitySummary | null => {
  if (!isJsonObject(value)) {
    return null;
  }

  const sourceId = typeof value.sourceId === 'string' ? value.sourceId : '';
  const sourceLabel = typeof value.sourceLabel === 'string' ? value.sourceLabel : '';

  if (!sourceId || !sourceLabel) {
    return null;
  }

  return {
    sourceKind: value.sourceKind === 'adapter' ? 'adapter' : 'provider',
    sourceId,
    sourceLabel,
    modelLabel: typeof value.modelLabel === 'string' ? value.modelLabel : '',
    status: typeof value.status === 'string' ? value.status : '',
    detail: typeof value.detail === 'string' ? value.detail : '',
    taskUpdateSummary: typeof value.taskUpdateSummary === 'string' ? value.taskUpdateSummary : '',
    recordedAt: typeof value.recordedAt === 'string' ? value.recordedAt : new Date().toISOString(),
  };
};

const normalizeTaskThreadMessage = (value: unknown): TaskThreadMessage | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }

  return {
    id: value.id.trim(),
    role: value.role === 'assistant' || value.role === 'system' ? value.role : 'user',
    content: typeof value.content === 'string' ? value.content : '',
    messageKind:
      value.messageKind === 'orchestration_event'
      || value.messageKind === 'orchestration_result'
      || value.messageKind === 'discussion_final'
        ? value.messageKind
        : null,
    providerId: normalizeNullableString(value.providerId),
    adapterId: normalizeNullableString(value.adapterId),
    sourceKind:
      value.sourceKind === 'provider' || value.sourceKind === 'adapter' || value.sourceKind === 'orchestration'
        ? value.sourceKind
        : null,
    sourceLabel: normalizeNullableString(value.sourceLabel),
    modelLabel: normalizeNullableString(value.modelLabel),
    agentLabel: normalizeNullableString(value.agentLabel),
    orchestrationRunId: normalizeNullableString(value.orchestrationRunId),
    orchestrationNodeId: normalizeNullableString(value.orchestrationNodeId),
    discussionRound: typeof value.discussionRound === 'number' && value.discussionRound >= 1 ? value.discussionRound : null,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
};

const normalizeTaskThreadContinuation = (value: unknown): TaskThreadContinuation | null => {
  if (!isJsonObject(value) || typeof value.conversationId !== 'string' || value.conversationId.trim().length === 0) {
    return null;
  }

  return {
    conversationId: value.conversationId.trim(),
    lastRunId: normalizeNullableString(value.lastRunId),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
};

const normalizeWorkbenchOrchestrationBinding = (value: unknown): WorkbenchOrchestrationBinding | null => {
  if (!isJsonObject(value) || typeof value.orchestrationRunId !== 'string' || typeof value.threadId !== 'string') {
    return null;
  }

  const orchestrationRunId = value.orchestrationRunId.trim();
  const threadId = value.threadId.trim();
  if (orchestrationRunId.length === 0 || threadId.length === 0) {
    return null;
  }

  return {
    orchestrationRunId,
    threadId,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
  };
};

const normalizeTaskThread = (value: unknown): TaskThread | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }

  return {
    id: value.id.trim(),
    title: typeof value.title === 'string' && value.title.trim().length > 0 ? value.title.trim() : 'Thread',
    continuation: normalizeTaskThreadContinuation(value.continuation),
    ...(typeof value.archivedAt === 'string' && value.archivedAt.trim().length > 0 ? { archivedAt: value.archivedAt } : {}),
    messages: Array.isArray(value.messages)
      ? (value.messages as unknown[]).map(normalizeTaskThreadMessage).filter((entry): entry is TaskThreadMessage => entry !== null)
      : [],
    activityLog: Array.isArray(value.activityLog)
      ? (value.activityLog as unknown[])
          .map(normalizeWorkbenchActivitySummary)
          .filter((entry): entry is WorkbenchActivitySummary => entry !== null)
      : [],
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
};

const normalizeWorkbenchState = (value: unknown): WorkbenchState => {
  if (!isJsonObject(value)) {
    return structuredClone(DEFAULT_WORKBENCH_STATE);
  }

  return {
    objective: typeof value.objective === 'string' ? value.objective : '',
    workspaceRoot: normalizeNullableString(value.workspaceRoot),
    recentWorkspaceRoots: Array.isArray(value.recentWorkspaceRoots)
      ? (value.recentWorkspaceRoots as string[]).filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
          .slice(0, 5)
      : [],
    selectedTargetKind: normalizeWorkbenchTargetKind(value.selectedTargetKind),
    selectedProviderId: typeof value.selectedProviderId === 'string' ? value.selectedProviderId : '',
    selectedAdapterId: typeof value.selectedAdapterId === 'string' ? value.selectedAdapterId : '',
    selectedAgentProfileId: typeof value.selectedAgentProfileId === 'string' ? value.selectedAgentProfileId : '',
    targetModel: typeof value.targetModel === 'string' ? value.targetModel : '',
    tasks: Array.isArray(value.tasks)
      ? (value.tasks as unknown[]).map(normalizeWorkbenchTaskItem).filter((entry): entry is WorkbenchTaskItem => entry !== null)
      : [],
    skillBindings: Array.isArray(value.skillBindings)
      ? (value.skillBindings as unknown[])
          .map(normalizeWorkbenchSkillBinding)
          .filter((entry): entry is WorkbenchSkillBinding => entry !== null)
      : [],
    promptBuilderCommand: normalizeNullableString(value.promptBuilderCommand),
    processedRunIds: Array.isArray(value.processedRunIds)
      ? (value.processedRunIds as string[]).filter((entry) => typeof entry === 'string')
      : [],
    processedOrchestrationNodeIds: Array.isArray(value.processedOrchestrationNodeIds)
      ? (value.processedOrchestrationNodeIds as string[]).filter((entry) => typeof entry === 'string')
      : [],
    orchestrationThreadBindings: Array.isArray(value.orchestrationThreadBindings)
      ? (value.orchestrationThreadBindings as unknown[])
          .map(normalizeWorkbenchOrchestrationBinding)
          .filter((entry): entry is WorkbenchOrchestrationBinding => entry !== null)
      : [],
    activeOrchestrationRunId: normalizeNullableString(value.activeOrchestrationRunId),
    activeThreadId: normalizeNullableString(value.activeThreadId),
    threads: Array.isArray(value.threads)
      ? (value.threads as unknown[]).map(normalizeTaskThread).filter((entry): entry is TaskThread => entry !== null)
      : [],
    latestProviderActivity: normalizeWorkbenchActivitySummary(value.latestProviderActivity),
    latestAdapterActivity: normalizeWorkbenchActivitySummary(value.latestAdapterActivity),
    generatedAt: normalizeNullableString(value.generatedAt),
    updatedAt: normalizeNullableString(value.updatedAt),
  };
};
const createRecoveryEvent = (runId: string, message: string): RunEvent => {
  return {
    id: `evt-${crypto.randomUUID()}`,
    runId,
    level: 'warning',
    timestamp: new Date().toISOString(),
    message,
  };
};
const createRecoveryTranscriptEntry = (runId: string, message: string): ExecutionTranscriptEntry => {
  return {
    id: `tx-${crypto.randomUUID()}`,
    runId,
    stepId: null,
    actor: 'system',
    kind: 'run_failed',
    status: 'failed',
    timestamp: new Date().toISOString(),
    label: 'Run interrupted',
    summary: message,
    detail: null,
  };
};
const recoverRunsAfterRestart = (appState: PersistedAppData): PersistedAppData => {
  const recoveredTaskStatuses = new Map<string, Task['status']>();
  const runs = appState.runs.map((run) => {
    if (run.status !== 'pending' && run.status !== 'running') {
      return run;
    }
    const recoveredStatus = 'interrupted' as const;
    const recoveredMessage =
      run.status === 'pending'
        ? 'Restart recovery marked this pending run as interrupted because the app restarted before launch could finish.'
        : 'Restart recovery marked this running run as interrupted because child process reattachment is not supported after app restart.';
    recoveredTaskStatuses.set(run.taskId, recoveredStatus);
    return {
      ...run,
      status: recoveredStatus,
      pid: null,
      exitCode: null,
      endedAt: new Date().toISOString(),
      events: [...run.events, createRecoveryEvent(run.id, recoveredMessage)],
      transcript: [...run.transcript, createRecoveryTranscriptEntry(run.id, recoveredMessage)],
    };
  });
  const orchestrationRuns = appState.orchestrationRuns.map((orchRun) => {
    if (orchRun.status === 'planning' || orchRun.status === 'executing' || orchRun.status === 'aggregating') {
      return {
        ...orchRun,
        status: 'failed' as OrchestrationRunStatus,
        updatedAt: new Date().toISOString(),
        finalSummary: orchRun.finalSummary ?? 'Interrupted by app restart.',
      };
    }
    return orchRun;
  });
  // Recover orchestration nodes that were in-progress
  const orchestrationNodes = appState.orchestrationNodes.map((node) => {
    if (node.status === 'running' || node.status === 'ready' || node.status === 'waiting_on_deps') {
      return {
        ...node,
        status: 'cancelled' as OrchestrationNodeStatus,
        resultSummary: node.resultSummary ?? 'Cancelled by app restart recovery.',
      };
    }
    return node;
  });
  const subagentStatuses = appState.subagentStatuses.map((entry) => {
    if (entry.status !== 'thinking' && entry.status !== 'tool_calling' && entry.status !== 'waiting') {
      return entry;
    }

    return {
      ...entry,
      status: 'error' as const,
      detail: 'Interrupted by app restart recovery.',
      updatedAt: new Date().toISOString(),
    };
  });
  return {
    ...appState,
    runs,
    tasks: appState.tasks.map((task) => {
      const recoveredStatus = recoveredTaskStatuses.get(task.id);
      if (!recoveredStatus) {
        return task;
      }
      return {
        ...task,
        status: recoveredStatus,
      };
    }),
    orchestrationRuns,
    orchestrationNodes,
    subagentStatuses,
  };
};
// ---------------------------------------------------------------------------
// Normalization for new multi-agent types
// ---------------------------------------------------------------------------
const VALID_AGENT_ROLES: AgentRoleType[] = ['master', 'planner', 'researcher', 'coder', 'reviewer', 'tester', 'custom'];
const VALID_MCP_TRANSPORTS: McpTransport[] = ['stdio', 'sse', 'streamable-http'];
const VALID_MCP_HEALTH: McpHealthStatus[] = ['healthy', 'unhealthy', 'unknown'];
const VALID_ORCH_RUN_STATUSES: OrchestrationRunStatus[] = [
  'planning',
  'executing',
  'aggregating',
  'completed',
  'failed',
  'cancelled',
];
const VALID_ORCH_NODE_STATUSES: OrchestrationNodeStatus[] = [
  'pending',
  'waiting_on_deps',
  'ready',
  'running',
  'completed',
  'failed',
  'skipped',
  'cancelled',
];

const normalizeDiscussionConfig = (value: unknown): NonNullable<OrchestrationRun['discussionConfig']> | null => {
  if (!isJsonObject(value)) {
    return null;
  }

  return {
    maxRounds: typeof value.maxRounds === 'number' && value.maxRounds >= 1 ? value.maxRounds : 3,
    participantsPerRound:
      typeof value.participantsPerRound === 'number' && value.participantsPerRound >= 1 ? value.participantsPerRound : 2,
    participantProfileIds: Array.isArray(value.participantProfileIds)
      ? (value.participantProfileIds as string[]).filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    consensusStrategy: value.consensusStrategy === 'summary_match' ? 'summary_match' : 'keyword',
    consensusKeyword: typeof value.consensusKeyword === 'string' && value.consensusKeyword.trim().length > 0
      ? value.consensusKeyword
      : '<CONSENSUS>',
    requireFinalSynthesis: typeof value.requireFinalSynthesis === 'boolean' ? value.requireFinalSynthesis : true,
  };
};
const VALID_RUN_STATUSES: RunStatus[] = [
  'pending',
  'running',
  'succeeded',
  'interrupted',
  'spawn_failed',
  'failed',
  'cancelled',
  'timed_out',
];
const VALID_SUBAGENT_WORK_STATUSES: SubagentWorkStatus[] = ['idle', 'thinking', 'tool_calling', 'waiting', 'completed', 'error'];
const VALID_LOCAL_TOOL_SOURCES: LocalToolSource[] = ['windows_path', 'posix_path', 'wsl_path', 'adapter_config', 'custom_root', 'custom_adapter', 'node_runtime'];
const VALID_LOCAL_TOOL_KINDS: LocalToolKind[] = ['ai_agent', 'cli', 'editor', 'package_manager', 'runtime', 'search', 'system', 'unknown'];

const normalizeSubagentStatusEntry = (value: unknown): SubagentStatusEntry | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }

  const status = typeof value.status === 'string' && VALID_SUBAGENT_WORK_STATUSES.includes(value.status as SubagentWorkStatus)
    ? (value.status as SubagentWorkStatus)
    : 'idle';

  return {
    id: value.id.trim(),
    profileId: normalizeNullableString(value.profileId),
    adapterId: normalizeNullableString(value.adapterId),
    runId: normalizeNullableString(value.runId),
    orchestrationNodeId: normalizeNullableString(value.orchestrationNodeId),
    agentLabel: typeof value.agentLabel === 'string' && value.agentLabel.trim().length > 0 ? value.agentLabel.trim() : value.id.trim(),
    status,
    detail: typeof value.detail === 'string' ? value.detail : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
};

const normalizeStringArray = (value: unknown): string[] => {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
};

const normalizeLocalToolDefinition = (value: unknown): LocalToolDefinition | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0 || typeof value.name !== 'string') {
    return null;
  }

  const source = typeof value.source === 'string' && VALID_LOCAL_TOOL_SOURCES.includes(value.source as LocalToolSource)
    ? (value.source as LocalToolSource)
    : 'adapter_config';
  const kind = typeof value.kind === 'string' && VALID_LOCAL_TOOL_KINDS.includes(value.kind as LocalToolKind)
    ? (value.kind as LocalToolKind)
    : 'unknown';

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    displayName: typeof value.displayName === 'string' && value.displayName.trim().length > 0 ? value.displayName.trim() : value.name.trim(),
    command: typeof value.command === 'string' ? value.command : value.name.trim(),
    executablePath: normalizeNullableString(value.executablePath),
    wslDistro: normalizeNullableString(value.wslDistro),
    source,
    kind,
    availability: value.availability === 'unavailable' ? 'unavailable' : 'available',
    version: normalizeNullableString(value.version),
    capabilities: normalizeStringArray(value.capabilities),
    discoveredAt: typeof value.discoveredAt === 'string' ? value.discoveredAt : new Date().toISOString(),
  };
};

const normalizeLocalToolRegistry = (value: unknown): LocalToolRegistry => {
  if (!isJsonObject(value)) {
    return structuredClone(DEFAULT_LOCAL_TOOL_REGISTRY);
  }

  return {
    tools: Array.isArray(value.tools)
      ? (value.tools as unknown[]).map(normalizeLocalToolDefinition).filter((entry): entry is LocalToolDefinition => entry !== null)
      : [],
    scannedAt: normalizeNullableString(value.scannedAt),
    scanRoots: normalizeStringArray(value.scanRoots),
  };
};

const normalizeLocalToolCallLogEntry = (value: unknown): LocalToolCallLogEntry | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || typeof value.toolName !== 'string') {
    return null;
  }

  return {
    id: value.id,
    toolName: value.toolName,
    command: typeof value.command === 'string' ? value.command : value.toolName,
    args: normalizeStringArray(value.args),
    cwd: typeof value.cwd === 'string' ? value.cwd : '',
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : new Date().toISOString(),
    endedAt: typeof value.endedAt === 'string' ? value.endedAt : new Date().toISOString(),
    success: typeof value.success === 'boolean' ? value.success : false,
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : null,
    signal: normalizeNullableString(value.signal),
    error: normalizeNullableString(value.error),
    stdoutPreview: typeof value.stdoutPreview === 'string' ? value.stdoutPreview : '',
    stderrPreview: typeof value.stderrPreview === 'string' ? value.stderrPreview : '',
    profileId: normalizeNullableString(value.profileId),
    runId: normalizeNullableString(value.runId),
    orchestrationNodeId: normalizeNullableString(value.orchestrationNodeId),
  };
};
const normalizeHandoffArtifact = (value: unknown): HandoffArtifact | null => {
  if (!isJsonObject(value)) return null;
  if (value.kind !== 'run_handoff') return null;
  if (typeof value.runId !== 'string' || value.runId.length === 0) return null;
  if (typeof value.adapterId !== 'string') return null;

  const status =
    typeof value.status === 'string' && VALID_RUN_STATUSES.includes(value.status as RunStatus)
      ? (value.status as RunStatus)
      : 'failed';

  return {
    kind: 'run_handoff',
    runId: value.runId,
    adapterId: value.adapterId,
    model: typeof value.model === 'string' ? value.model : null,
    status,
    changedFiles: Array.isArray(value.changedFiles)
      ? (value.changedFiles as string[]).filter((s) => typeof s === 'string')
      : [],
    diffStat: normalizeNullableString(value.diffStat),
    transcriptSummary: normalizeNullableString(value.transcriptSummary),
    reviewNotes: Array.isArray(value.reviewNotes)
      ? (value.reviewNotes as string[]).filter((s) => typeof s === 'string')
      : [],
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date().toISOString(),
  };
};
const normalizeRetryPolicy = (value: unknown): RetryPolicy => {
  if (!isJsonObject(value)) {
    return structuredClone(DEFAULT_RETRY_POLICY);
  }
  return {
    maxRetries:
      typeof value.maxRetries === 'number' && value.maxRetries >= 0
        ? value.maxRetries
        : DEFAULT_RETRY_POLICY.maxRetries,
    delayMs: typeof value.delayMs === 'number' && value.delayMs >= 0 ? value.delayMs : DEFAULT_RETRY_POLICY.delayMs,
    backoffMultiplier:
      typeof value.backoffMultiplier === 'number' && value.backoffMultiplier >= 1
        ? value.backoffMultiplier
        : DEFAULT_RETRY_POLICY.backoffMultiplier,
  };
};
const normalizeAgentProfile = (value: unknown): AgentProfile | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  const role =
    typeof value.role === 'string' && VALID_AGENT_ROLES.includes(value.role as AgentRoleType)
      ? (value.role as AgentRoleType)
      : 'custom';
  const adapterId = typeof value.adapterId === 'string' ? value.adapterId : '';
  const targetKind = value.targetKind === 'provider' || value.targetKind === 'adapter' ? value.targetKind : 'adapter';
  const targetId = typeof value.targetId === 'string' && value.targetId.trim().length > 0 ? value.targetId : adapterId;
  return {
    id: value.id.trim(),
    name: typeof value.name === 'string' ? value.name : value.id.trim(),
    role,
    targetKind,
    targetId,
    adapterId,
    model: typeof value.model === 'string' ? value.model : '',
    modelOptions: Array.isArray(value.modelOptions)
      ? (value.modelOptions as string[]).filter((model) => typeof model === 'string' && model.trim().length > 0)
      : [],
    systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt : '',
    enabledSkillIds: Array.isArray(value.enabledSkillIds)
      ? (value.enabledSkillIds as string[]).filter((s) => typeof s === 'string')
      : [],
    enabledMcpServerIds: Array.isArray(value.enabledMcpServerIds)
      ? (value.enabledMcpServerIds as string[]).filter((s) => typeof s === 'string')
      : [],
    maxParallelChildren:
      typeof value.maxParallelChildren === 'number' && value.maxParallelChildren >= 1 ? value.maxParallelChildren : 3,
    retryPolicy: normalizeRetryPolicy(value.retryPolicy),
    timeoutMs: typeof value.timeoutMs === 'number' && value.timeoutMs > 0 ? value.timeoutMs : null,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
  };
};
const normalizeSkillDefinition = (value: unknown): SkillDefinition | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  const trigger = isJsonObject(value.trigger)
    ? {
        keywords: Array.isArray(value.trigger.keywords)
          ? (value.trigger.keywords as string[]).filter((s) => typeof s === 'string')
          : [],
        taskTypes: Array.isArray(value.trigger.taskTypes)
          ? ((value.trigger.taskTypes as string[]).filter((s) => TASK_TYPES.includes(s as TaskType)) as TaskType[])
          : [],
      }
    : { keywords: [], taskTypes: [] };
  const recommendedRole =
    typeof value.recommendedAgentRole === 'string' &&
    VALID_AGENT_ROLES.includes(value.recommendedAgentRole as AgentRoleType)
      ? (value.recommendedAgentRole as AgentRoleType)
      : null;
  return {
    id: value.id.trim(),
    name: typeof value.name === 'string' ? value.name : value.id.trim(),
    description: typeof value.description === 'string' ? value.description : '',
    trigger,
    promptTemplate: typeof value.promptTemplate === 'string' ? value.promptTemplate : '',
    allowedTaskTypes: Array.isArray(value.allowedTaskTypes)
      ? ((value.allowedTaskTypes as string[]).filter((s) => TASK_TYPES.includes(s as TaskType)) as TaskType[])
      : [],
    recommendedAgentRole: recommendedRole,
    requiredMcpServerIds: Array.isArray(value.requiredMcpServerIds)
      ? (value.requiredMcpServerIds as string[]).filter((s) => typeof s === 'string')
      : [],
    inputSchema: isJsonObject(value.inputSchema) ? (value.inputSchema as Record<string, unknown>) : null,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    version: typeof value.version === 'string' ? value.version : '1.0.0',
  };
};
const normalizeMcpServerDefinition = (value: unknown): McpServerDefinition | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  const transport =
    typeof value.transport === 'string' && VALID_MCP_TRANSPORTS.includes(value.transport as McpTransport)
      ? (value.transport as McpTransport)
      : 'stdio';
  const healthStatus =
    typeof value.healthStatus === 'string' && VALID_MCP_HEALTH.includes(value.healthStatus as McpHealthStatus)
      ? (value.healthStatus as McpHealthStatus)
      : 'unknown';
  return {
    id: value.id.trim(),
    name: typeof value.name === 'string' ? value.name : value.id.trim(),
    transport,
    command: typeof value.command === 'string' ? value.command : '',
    args: Array.isArray(value.args) ? (value.args as string[]).filter((s) => typeof s === 'string') : [],
    env: isJsonObject(value.env)
      ? Object.fromEntries(
          Object.entries(value.env)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, v as string]),
        )
      : {},
    toolAllowlist: Array.isArray(value.toolAllowlist)
      ? (value.toolAllowlist as string[]).filter((s) => typeof s === 'string')
      : [],
    healthStatus,
    healthReason: typeof value.healthReason === 'string' ? value.healthReason : '',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
  };
};
const normalizeOrchestrationRun = (value: unknown): OrchestrationRun | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  const status =
    typeof value.status === 'string' && VALID_ORCH_RUN_STATUSES.includes(value.status as OrchestrationRunStatus)
      ? (value.status as OrchestrationRunStatus)
      : 'failed';
  return {
    id: value.id.trim(),
    conversationId: typeof value.conversationId === 'string' ? value.conversationId : '',
    rootPrompt: typeof value.rootPrompt === 'string' ? value.rootPrompt : '',
    status,
    masterAgentProfileId: normalizeNullableString(value.masterAgentProfileId),
    planVersion: typeof value.planVersion === 'number' ? value.planVersion : 1,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    finalSummary: normalizeNullableString(value.finalSummary),
    automationMode:
      value.automationMode === 'review_loop'
        ? ('review_loop' as const)
        : value.automationMode === 'discussion'
          ? ('discussion' as const)
          : ('standard' as const),
    executionStyle:
      value.executionStyle === 'sequential'
        ? ('sequential' as const)
        : value.executionStyle === 'parallel'
          ? ('parallel' as const)
          : ('planner' as const),
    discussionConfig: normalizeDiscussionConfig(value.discussionConfig),
    projectContextSummary: normalizeNullableString(value.projectContextSummary),
    currentIteration:
      typeof value.currentIteration === 'number' && value.currentIteration >= 1 ? value.currentIteration : 1,
    maxIterations: typeof value.maxIterations === 'number' && value.maxIterations >= 1 ? value.maxIterations : 1,
    stopReason: normalizeNullableString(value.stopReason),
  };
};
const normalizeOrchestrationNode = (value: unknown): OrchestrationNode | null => {
  if (!isJsonObject(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    return null;
  }
  const status =
    typeof value.status === 'string' && VALID_ORCH_NODE_STATUSES.includes(value.status as OrchestrationNodeStatus)
      ? (value.status as OrchestrationNodeStatus)
      : 'pending';
  const taskType =
    typeof value.taskType === 'string' && TASK_TYPES.includes(value.taskType as TaskType)
      ? (value.taskType as TaskType)
      : 'general';
  return {
    id: value.id.trim(),
    orchestrationRunId: typeof value.orchestrationRunId === 'string' ? value.orchestrationRunId : '',
    parentNodeId: normalizeNullableString(value.parentNodeId),
    dependsOnNodeIds: Array.isArray(value.dependsOnNodeIds)
      ? (value.dependsOnNodeIds as string[]).filter((s) => typeof s === 'string')
      : [],
    agentProfileId: normalizeNullableString(value.agentProfileId),
    skillIds: Array.isArray(value.skillIds) ? (value.skillIds as string[]).filter((s) => typeof s === 'string') : [],
    mcpServerIds: Array.isArray(value.mcpServerIds)
      ? (value.mcpServerIds as string[]).filter((s) => typeof s === 'string')
      : [],
    taskType,
    title: typeof value.title === 'string' ? value.title : '',
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    status,
    runId: normalizeNullableString(value.runId),
    resultSummary: normalizeNullableString(value.resultSummary),
    resultPayload: normalizeHandoffArtifact(value.resultPayload),
    retryCount: typeof value.retryCount === 'number' && value.retryCount >= 0 ? value.retryCount : 0,
    ...(typeof value.adapterOverride === 'string' ? { adapterOverride: value.adapterOverride } : {}),
    ...(typeof value.modelOverride === 'string' ? { modelOverride: value.modelOverride } : {}),
    ...(typeof value.discussionRound === 'number' && value.discussionRound >= 1 ? { discussionRound: value.discussionRound } : {}),
    ...(
      value.discussionRole === 'speaker' || value.discussionRole === 'critic' || value.discussionRole === 'synthesizer'
        ? { discussionRole: value.discussionRole }
        : {}
    ),
  };
};
// ---------------------------------------------------------------------------
// Main app data normalization
// ---------------------------------------------------------------------------
const normalizePersistedAppData = (value: unknown): PersistedAppData | null => {
  if (!isJsonObject(value)) {
    return null;
  }
  if (!Array.isArray(value.conversations) || !Array.isArray(value.tasks) || !Array.isArray(value.runs)) {
    return null;
  }
  return {
    conversations: value.conversations as AppState['conversations'],
    tasks: (value.tasks as Record<string, unknown>[]).map((task) => ({
      ...task,
      taskType: typeof task.taskType === 'string' ? task.taskType : 'general',
      profileId: typeof task.profileId === 'string' ? task.profileId : null,
    })) as Task[],
    runs: (value.runs as Record<string, unknown>[]).map((run) => ({
      ...run,
      transcript: Array.isArray(run.transcript) ? run.transcript : [],
    })) as RunSession[],
    subagentStatuses: Array.isArray(value.subagentStatuses)
      ? (value.subagentStatuses as unknown[])
          .map(normalizeSubagentStatusEntry)
          .filter((entry): entry is SubagentStatusEntry => entry !== null)
      : [],
    localToolRegistry: normalizeLocalToolRegistry(value.localToolRegistry),
    localToolCallLogs: Array.isArray(value.localToolCallLogs)
      ? (value.localToolCallLogs as unknown[])
          .map(normalizeLocalToolCallLogEntry)
          .filter((entry): entry is LocalToolCallLogEntry => entry !== null)
      : [],
    agentProfiles: Array.isArray(value.agentProfiles)
      ? (value.agentProfiles as unknown[]).map(normalizeAgentProfile).filter((p): p is AgentProfile => p !== null)
      : [],
    skills: Array.isArray(value.skills)
      ? (value.skills as unknown[]).map(normalizeSkillDefinition).filter((s): s is SkillDefinition => s !== null)
      : [],
    mcpServers: Array.isArray(value.mcpServers)
      ? (value.mcpServers as unknown[])
          .map(normalizeMcpServerDefinition)
          .filter((s): s is McpServerDefinition => s !== null)
      : [],
    orchestrationRuns: Array.isArray(value.orchestrationRuns)
      ? (value.orchestrationRuns as unknown[])
          .map(normalizeOrchestrationRun)
          .filter((r): r is OrchestrationRun => r !== null)
      : [],
    orchestrationNodes: Array.isArray(value.orchestrationNodes)
      ? (value.orchestrationNodes as unknown[])
          .map(normalizeOrchestrationNode)
          .filter((n): n is OrchestrationNode => n !== null)
      : [],
    projectContext: normalizeProjectContext(value.projectContext),
    nextClaudeTask: isJsonObject(value.nextClaudeTask)
      ? {
          prompt: typeof value.nextClaudeTask.prompt === 'string' ? value.nextClaudeTask.prompt : '',
          sourceOrchestrationRunId: normalizeNullableString(value.nextClaudeTask.sourceOrchestrationRunId),
          generatedAt: normalizeNullableString(value.nextClaudeTask.generatedAt),
          status: value.nextClaudeTask.status === 'ready' ? 'ready' : 'idle',
        }
      : { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
    workbench: normalizeWorkbenchState(value.workbench),
  };
};
// ---------------------------------------------------------------------------
// Persistence Store
// ---------------------------------------------------------------------------
export class LocalPersistenceStore {
  private saveTimer: NodeJS.Timeout | null = null;
  private pendingSave: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly backupFilePath: string;
  private appData: PersistedAppData | null = null;
  private continuityState: RendererContinuityState = structuredClone(DEFAULT_CONTINUITY_STATE);
  private routingSettings: RoutingSettings = structuredClone(DEFAULT_ROUTING_SETTINGS);
  public constructor(private readonly rootDir: string) {
    this.filePath = path.resolve(rootDir, PERSISTENCE_DIRECTORY, PERSISTENCE_FILENAME);
    this.backupFilePath = `${this.filePath}${BACKUP_FILENAME_SUFFIX}`;
  }
  public load(): LoadedEnvelope {
    try {
      const loadedEnvelope = this.readEnvelope(this.filePath) ?? this.readEnvelope(this.backupFilePath);
      if (!loadedEnvelope) {
        return this.snapshot();
      }
      this.appData = loadedEnvelope.appData ? recoverRunsAfterRestart(loadedEnvelope.appData) : null;
      this.continuityState = loadedEnvelope.continuity;
      this.routingSettings = loadedEnvelope.routing;
      return this.snapshot();
    } catch {
      return this.snapshot();
    }
  }
  public getContinuityState(): RendererContinuityState {
    return structuredClone(this.continuityState);
  }
  public saveContinuityState(value: RendererContinuityState): RendererContinuityState {
    this.continuityState = normalizeContinuityState(value);
    this.writeEnvelopeSync();
    return this.getContinuityState();
  }
  public getRoutingSettings(): RoutingSettings {
    return structuredClone(this.routingSettings);
  }
  public saveRoutingSettings(value: RoutingSettings): RoutingSettings {
    this.routingSettings = normalizeRoutingSettings(value);
    this.writeEnvelopeSync();
    return this.getRoutingSettings();
  }
  public saveAppState(state: AppState): void {
    this.appData = {
      conversations: structuredClone(state.conversations),
      tasks: structuredClone(state.tasks),
      runs: structuredClone(state.runs),
      subagentStatuses: structuredClone(state.subagentStatuses),
      localToolRegistry: structuredClone(state.localToolRegistry),
      localToolCallLogs: structuredClone(state.localToolCallLogs),
      nextClaudeTask: structuredClone(state.nextClaudeTask),
      workbench: structuredClone(state.workbench ?? DEFAULT_WORKBENCH_STATE),
      agentProfiles: structuredClone(state.agentProfiles),
      skills: structuredClone(state.skills),
      mcpServers: structuredClone(state.mcpServers),
      orchestrationRuns: structuredClone(state.orchestrationRuns),
      projectContext: state.projectContext,
      orchestrationNodes: structuredClone(state.orchestrationNodes),
    };
    this.writeEnvelopeSync();
  }
  public queueAppStateSave(state: AppState): void {
    this.appData = {
      conversations: structuredClone(state.conversations),
      tasks: structuredClone(state.tasks),
      runs: structuredClone(state.runs),
      subagentStatuses: structuredClone(state.subagentStatuses),
      localToolRegistry: structuredClone(state.localToolRegistry),
      localToolCallLogs: structuredClone(state.localToolCallLogs),
      nextClaudeTask: structuredClone(state.nextClaudeTask),
      workbench: structuredClone(state.workbench ?? DEFAULT_WORKBENCH_STATE),
      agentProfiles: structuredClone(state.agentProfiles),
      skills: structuredClone(state.skills),
      mcpServers: structuredClone(state.mcpServers),
      orchestrationRuns: structuredClone(state.orchestrationRuns),
      projectContext: state.projectContext,
      orchestrationNodes: structuredClone(state.orchestrationNodes),
    };
    this.scheduleWriteEnvelope();
  }
  private snapshot(): LoadedEnvelope {
    return {
      appData: this.appData ? structuredClone(this.appData) : null,
      continuity: this.getContinuityState(),
      routing: this.getRoutingSettings(),
    };
  }
  private readEnvelope(filePath: string): LoadedEnvelope | null {
    try {
      const rawFile = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(rawFile) as unknown;
      if (!isJsonObject(parsed) || parsed.version !== PERSISTENCE_VERSION) {
        return null;
      }
      return {
        appData: normalizePersistedAppData(parsed.appState),
        continuity: normalizeContinuityState(parsed.continuity),
        routing: normalizeRoutingSettings(parsed.routing),
      };
    } catch {
      return null;
    }
  }
  private scheduleWriteEnvelope(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.pendingSave = this.pendingSave
        .then(() => this.writeEnvelopeAsync())
        .catch(() => this.writeEnvelopeAsync());
    }, 500);
  }

  private writeEnvelopeSync(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const envelope: PersistedEnvelopeV1 = {
      version: PERSISTENCE_VERSION,
      projectRoot: this.rootDir,
      savedAt: new Date().toISOString(),
      appState: this.appData ?? {
        conversations: [],
        tasks: [],
        runs: [],
        subagentStatuses: [],
        localToolRegistry: structuredClone(DEFAULT_LOCAL_TOOL_REGISTRY),
        localToolCallLogs: [],
        nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
        workbench: structuredClone(DEFAULT_WORKBENCH_STATE),
        agentProfiles: [],
        skills: [],
        mcpServers: [],
        orchestrationRuns: [],
        orchestrationNodes: [],
        projectContext: { summary: '', updatedAt: null },
      },
      continuity: this.getContinuityState(),
      routing: this.getRoutingSettings(),
    };
    const nextPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const backupPath = this.backupFilePath;
    writeFileSync(nextPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    if (existsSync(this.filePath)) {
      rmSync(backupPath, { force: true });
      renameSync(this.filePath, backupPath);
    }
    try {
      renameSync(nextPath, this.filePath);
      rmSync(backupPath, { force: true });
    } catch (error) {
      if (existsSync(backupPath) && !existsSync(this.filePath)) {
        renameSync(backupPath, this.filePath);
      }
      rmSync(nextPath, { force: true });
      throw error;
    }
  }

  private async writeEnvelopeAsync(): Promise<void> {
    const envelope: PersistedEnvelopeV1 = {
      version: PERSISTENCE_VERSION,
      projectRoot: this.rootDir,
      savedAt: new Date().toISOString(),
      appState: this.appData ?? {
        conversations: [],
        tasks: [],
        runs: [],
        subagentStatuses: [],
        localToolRegistry: structuredClone(DEFAULT_LOCAL_TOOL_REGISTRY),
        localToolCallLogs: [],
        nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
        workbench: structuredClone(DEFAULT_WORKBENCH_STATE),
        agentProfiles: [],
        skills: [],
        mcpServers: [],
        orchestrationRuns: [],
        orchestrationNodes: [],
        projectContext: { summary: '', updatedAt: null },
      },
      continuity: this.getContinuityState(),
      routing: this.getRoutingSettings(),
    };
    const nextPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const backupPath = this.backupFilePath;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(nextPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    if (existsSync(this.filePath)) {
      await rm(backupPath, { force: true });
      await rename(this.filePath, backupPath);
    }
    try {
      await rename(nextPath, this.filePath);
      await rm(backupPath, { force: true });
    } catch (error) {
      if (existsSync(backupPath) && !existsSync(this.filePath)) {
        await rename(backupPath, this.filePath);
      }
      await rm(nextPath, { force: true });
      throw error;
    }
  }
}
