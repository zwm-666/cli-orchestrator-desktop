import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  AdapterRoutingSettings,
  AgentProfile,
  AgentRoleType,
  AppState,
  ExecutionTranscriptEntry,
  HandoffArtifact,
  LaunchFormDraft,
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
  Task,
  TaskRoutingProfile,
  TaskRoutingRule,
  TaskType,
} from '../shared/domain.js';
import {
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
  nextClaudeTask: AppState['nextClaudeTask'];
  agentProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  orchestrationRuns: OrchestrationRun[];
  orchestrationNodes: OrchestrationNode[];
  projectContext: { summary: string; updatedAt: string | null };
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
      customCommand: '',
    };
  }
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    defaultModel: typeof value.defaultModel === 'string' ? value.defaultModel : '',
    customCommand: typeof value.customCommand === 'string' ? value.customCommand : '',
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
  return {
    id: value.id.trim(),
    name: typeof value.name === 'string' ? value.name : value.id.trim(),
    role,
    adapterId: typeof value.adapterId === 'string' ? value.adapterId : '',
    model: typeof value.model === 'string' ? value.model : '',
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
    automationMode: value.automationMode === 'review_loop' ? ('review_loop' as const) : ('standard' as const),
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
  };
};
// ---------------------------------------------------------------------------
// Persistence Store
// ---------------------------------------------------------------------------
export class LocalPersistenceStore {
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
    this.writeEnvelope();
    return this.getContinuityState();
  }
  public getRoutingSettings(): RoutingSettings {
    return structuredClone(this.routingSettings);
  }
  public saveRoutingSettings(value: RoutingSettings): RoutingSettings {
    this.routingSettings = normalizeRoutingSettings(value);
    this.writeEnvelope();
    return this.getRoutingSettings();
  }
  public saveAppState(state: AppState): void {
    this.appData = {
      conversations: structuredClone(state.conversations),
      tasks: structuredClone(state.tasks),
      runs: structuredClone(state.runs),
      nextClaudeTask: structuredClone(state.nextClaudeTask),
      agentProfiles: structuredClone(state.agentProfiles),
      skills: structuredClone(state.skills),
      mcpServers: structuredClone(state.mcpServers),
      orchestrationRuns: structuredClone(state.orchestrationRuns),
      projectContext: state.projectContext,
      orchestrationNodes: structuredClone(state.orchestrationNodes),
    };
    this.writeEnvelope();
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
  private writeEnvelope(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const envelope: PersistedEnvelopeV1 = {
      version: PERSISTENCE_VERSION,
      projectRoot: this.rootDir,
      savedAt: new Date().toISOString(),
      appState: this.appData ?? {
        conversations: [],
        tasks: [],
        runs: [],
        nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
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
}
