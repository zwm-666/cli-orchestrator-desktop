import { execFileSync, spawn, type ChildProcessByStdio } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type {
  AdapterRoutingSettings,
  AgentProfile,
  AppState,
  CancelOrchestrationInput,
  CancelOrchestrationResult,
  CancelRunInput,
  CancelRunResult,
  CliAdapter,
  CliAdapterLaunchMode,
  Conversation,
  CreateDraftConversationInput,
  CreateDraftConversationResult,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  ExecutionTranscriptEntry,
  GetOrchestrationRunInput,
  GetOrchestrationRunResult,
  McpServerDefinition,
  PlanDraftInput,
  PlanDraftResult,
  RoutingSettings,
  RunEvent,
  RunSession,
  RunStatus,
  RunTerminalStatus,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveProjectContextInput,
  SaveSkillInput,
  SkillDefinition,
  StartOrchestrationInput,
  StartOrchestrationResult,
  StartRunInput,
  StartRunResult,
  Task,
  TaskStatus,
} from '../shared/domain.js';
import { stripAnsi } from '../shared/stripAnsi.js';
import type { LocalPersistenceStore } from './persistence.js';
import { AgentRegistryService } from './services/agentRegistryService.js';
import { McpRegistryService } from './services/mcpRegistryService.js';
import { OrchestrationExecutionService } from './services/orchestrationExecutionService.js';

import { SkillRegistryService } from './services/skillRegistryService.js';
import { buildExecutionPlan, createPlanDraft as createPlanDraftFromService } from './services/plannerService.js';

const ADAPTER_HEALTHS = new Set<CliAdapter['health']>(['healthy', 'idle', 'attention']);
const ADAPTER_VISIBILITIES = new Set<CliAdapter['visibility']>(['user', 'internal']);
const EXECUTABLE_TOKENS = {
  nodeExecPath: '$NODE_EXEC_PATH',
} as const;
const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;
const EXECUTABLE_PATTERN = /^(?:[A-Za-z]:)?[A-Za-z0-9_./\\:() -]+$/;
const WINDOWS_PATH_PATTERN = /^(?:[A-Za-z]:)?[\\/]/;
const WINDOWS_PATHEXT_FALLBACK = ['.com', '.exe', '.bat', '.cmd'];
const hasControlCharacters = (value: string): boolean => {
  return Array.from(value).some((character) => character < ' ');
};

interface CliAdapterConfig {
  id: string;
  displayName: string;
  visibility: CliAdapter['visibility'];
  requiresDiscovery: boolean;
  launchMode: CliAdapterLaunchMode;
  command: string;
  args: string[];
  promptTransport: 'arg' | 'stdin';
  description: string;
  capabilities: string[];
  health: CliAdapter['health'];
  enabled: boolean;
  defaultTimeoutMs: number | null;
  defaultModel: string | null;
  supportedModels: string[];
}

type JsonObject = Record<string, unknown>;

interface TemplateContext {
  adapterId: string;
  conversationId: string;
  model: string;
  prompt: string;
  runId: string;
  taskId: string;
  title: string;
}

type StateListener = (state: AppState) => void;
type RunEventListener = (event: RunEvent) => void;
type ManagedChildProcess = ChildProcessByStdio<Writable | null, Readable | null, Readable | null>;
type MutableRunPhase = 'pending' | 'running' | 'terminating';
type RequestedTerminalStatus = Extract<RunTerminalStatus, 'cancelled' | 'timed_out'>;

interface RunExecution {
  child: ManagedChildProcess;
  phase: MutableRunPhase;
  requestedTerminalStatus: RequestedTerminalStatus | null;
  spawnError: string | null;
  timeoutId: NodeJS.Timeout | null;
  timeoutMs: number | null;
}

interface AppendTranscriptInput {
  actor: ExecutionTranscriptEntry['actor'];
  kind: ExecutionTranscriptEntry['kind'];
  status: ExecutionTranscriptEntry['status'];
  label: string;
  summary: string;
  detail?: string | null;
  stepId?: string | null;
}

const getPrimaryStepId = (runId: string): string => {
  return `step-${runId}-primary`;
};

interface ParsedCodexEvent {
  type?: string;
  item?: {
    type?: string;
    command?: string;
    text?: string;
    aggregated_output?: string;
    status?: string;
  };
}

const shouldUseShell = (command: string): boolean => {
  if (process.platform !== 'win32') {
    return false;
  }

  if (command === process.execPath) {
    return false;
  }

  const extension = path.extname(command).toLowerCase();
  return extension !== '.exe' && extension !== '.com';
};

const quoteShellArgument = (value: string): string => {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
};

const buildShellCommand = (command: string, args: string[]): string => {
  return [quoteShellArgument(command), ...args.map((arg) => quoteShellArgument(arg))].join(' ');
};

const getAdapterDiscoveryReason = (adapterId: string, command: string, available: boolean): string => {
  if (!available) {
    return `"${command}" was not found in PATH. Ensure it is installed globally (e.g. npm install -g ${adapterId}).`;
  }

  switch (adapterId) {
    case 'claude':
      return `Found "${command}" in PATH. Current Windows non-interactive runs may still depend on terminal/TTY behavior even when auth is valid.`;
    case 'codex':
      return `Found "${command}" in PATH. Non-interactive JSON mode is available and currently the most reliable integration path.`;
    case 'opencode':
      return `Found "${command}" in PATH. Non-interactive run mode may still depend on local session/server state in this environment.`;
    default:
      return `Found "${command}" in PATH.`;
  }
};

const TERMINAL_STATUS_MESSAGE_PATTERNS = [
  /^Process completed successfully\.$/i,
  /^Process was interrupted by an application restart and cannot be resumed\.$/i,
  /^Process failed to start\./i,
  /^Process exited with code /i,
  /^Process cancelled by user/i,
  /^Process timed out after /i,
];

const BLOCKED_ENVIRONMENT_PATTERNS = [
  /not completing the current non-interactive run path reliably/i,
  /missing a usable local session\/server context/i,
  /session not found/i,
];

const isTerminalStatusMessage = (message: string): boolean => {
  return TERMINAL_STATUS_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
};

const isEnvironmentBlockedMessage = (message: string): boolean => {
  return BLOCKED_ENVIRONMENT_PATTERNS.some((pattern) => pattern.test(message));
};

const terminateProcessTree = (child: ManagedChildProcess): void => {
  if (process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // fall back to child.kill below
    }
  }

  if (!child.killed) {
    child.kill();
  }
};

const tryParseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const now = new Date('2026-03-20T10:15:00.000Z');

const isoMinutesAgo = (minutesAgo: number): string => {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString();
};

const seedConversations = (): Conversation[] => {
  return [
    {
      id: 'conv-customer-onboarding',
      title: 'Customer onboarding orchestration',
      createdAt: isoMinutesAgo(180),
      updatedAt: isoMinutesAgo(8),
      draftInput: '@cli split this request into setup and QA tasks',
      messages: [
        {
          id: 'msg-1',
          role: 'customer',
          content: 'We need a desktop shell that can route customer requests to local CLIs.',
          createdAt: isoMinutesAgo(180),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'I can parse the request, detect @cli mentions, and stage execution tasks.',
          createdAt: isoMinutesAgo(170),
        },
        {
          id: 'msg-3',
          role: 'customer',
          content: 'Great. Show adapters, active runs, and the draft workflow in one place.',
          createdAt: isoMinutesAgo(12),
        },
      ],
    },
  ];
};

const createId = (prefix: string): string => {
  return `${prefix}-${crypto.randomUUID()}`;
};

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isAdapterHealth = (value: unknown): value is CliAdapter['health'] => {
  return typeof value === 'string' && ADAPTER_HEALTHS.has(value as CliAdapter['health']);
};

const isAdapterVisibility = (value: unknown): value is CliAdapter['visibility'] => {
  return typeof value === 'string' && ADAPTER_VISIBILITIES.has(value as CliAdapter['visibility']);
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const validateExecutable = (command: string, index: number): string => {
  if (
    Object.values(EXECUTABLE_TOKENS).includes(command as (typeof EXECUTABLE_TOKENS)[keyof typeof EXECUTABLE_TOKENS])
  ) {
    return command;
  }

  if (!isNonEmptyString(command)) {
    throw new Error(`Adapter config entry ${index} command must be a non-empty string.`);
  }

  if (command.trim() !== command) {
    throw new Error(`Adapter config entry ${index} command must not have surrounding whitespace.`);
  }

  if (hasControlCharacters(command) || command.includes('{{') || !EXECUTABLE_PATTERN.test(command)) {
    throw new Error(`Adapter config entry ${index} command is not a valid executable string.`);
  }

  return command;
};

const validateTemplateString = (value: string, index: number, field: string): string => {
  PLACEHOLDER_PATTERN.lastIndex = 0;

  const allowedKeys = new Set<keyof TemplateContext>([
    'adapterId',
    'conversationId',
    'model',
    'prompt',
    'runId',
    'taskId',
    'title',
  ]);

  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1] as keyof TemplateContext;

    if (!allowedKeys.has(key)) {
      throw new Error(`Adapter config entry ${index} ${field} uses unsupported placeholder {{${match[1]}}}.`);
    }
  }

  const residual = value.replaceAll(PLACEHOLDER_PATTERN, '');

  if (residual.includes('{{') || residual.includes('}}')) {
    throw new Error(`Adapter config entry ${index} ${field} has malformed placeholder syntax.`);
  }

  return value;
};

const normalizeTimeoutMs = (value: unknown, fieldName: string): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${fieldName} must be a positive integer when provided.`);
  }

  return value as number;
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isPathLikeExecutable = (command: string): boolean => {
  if (path.isAbsolute(command)) {
    return true;
  }

  return command.includes('/') || command.includes('\\') || WINDOWS_PATH_PATTERN.test(command);
};

const getExecutableExtensions = (): string[] => {
  if (process.platform !== 'win32') {
    return [''];
  }

  const configuredExtensions = (process.env.PATHEXT ?? '')
    .split(';')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return configuredExtensions.length > 0 ? configuredExtensions : WINDOWS_PATHEXT_FALLBACK;
};

const canAccessExecutablePath = (candidatePath: string): boolean => {
  try {
    accessSync(candidatePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const isExecutableAvailable = (command: string): boolean => {
  if (!command) {
    return false;
  }

  const resolvedCommand = Object.values(EXECUTABLE_TOKENS).includes(
    command as (typeof EXECUTABLE_TOKENS)[keyof typeof EXECUTABLE_TOKENS],
  )
    ? process.execPath
    : command;

  const hasKnownExtension = path.extname(resolvedCommand).length > 0;
  const executableExtensions = getExecutableExtensions();
  const candidateSuffixes = hasKnownExtension || process.platform !== 'win32' ? [''] : executableExtensions;
  const candidateDirectories = isPathLikeExecutable(resolvedCommand)
    ? ['']
    : (process.env.PATH ?? '')
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

  for (const directory of candidateDirectories) {
    const basePath = directory ? path.join(directory, resolvedCommand) : resolvedCommand;

    for (const suffix of candidateSuffixes) {
      const candidatePath = suffix && !basePath.toLowerCase().endsWith(suffix) ? `${basePath}${suffix}` : basePath;

      if (canAccessExecutablePath(candidatePath)) {
        return true;
      }
    }
  }

  return false;
};

const parseAdapterConfig = (value: unknown): CliAdapterConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error('Adapter config must be an array.');
  }

  return value.map((entry, index) => {
    if (!isJsonObject(entry)) {
      throw new Error(`Adapter config entry ${index} must be an object.`);
    }

    if (
      !isNonEmptyString(entry.id) ||
      !isNonEmptyString(entry.displayName) ||
      !isNonEmptyString(entry.description) ||
      !isAdapterVisibility(entry.visibility) ||
      typeof entry.requiresDiscovery !== 'boolean' ||
      (entry.launchMode !== 'cli' && entry.launchMode !== 'manual_handoff') ||
      typeof entry.enabled !== 'boolean' ||
      !isStringArray(entry.args) ||
      !isStringArray(entry.capabilities) ||
      !isAdapterHealth(entry.health) ||
      typeof entry.command !== 'string'
    ) {
      throw new Error(`Adapter config entry ${index} is missing required fields.`);
    }

    const command = validateExecutable(entry.command, index);
    const args = entry.args.map((arg, argIndex) => {
      return validateTemplateString(arg, index, `args[${argIndex}]`);
    });
    const defaultTimeoutMs = normalizeTimeoutMs(entry.defaultTimeoutMs, `Adapter ${entry.id} defaultTimeoutMs`);
    const defaultModel = normalizeOptionalString(entry.defaultModel);

    return {
      id: entry.id.trim(),
      displayName: entry.displayName.trim(),
      visibility: entry.visibility,
      requiresDiscovery: entry.requiresDiscovery,
      launchMode: entry.launchMode,
      command,
      args,
      promptTransport: entry.promptTransport === 'stdin' ? 'stdin' : 'arg',
      description: entry.description.trim(),
      capabilities: entry.capabilities
        .map((capability) => capability.trim())
        .filter((capability) => capability.length > 0),
      health: entry.health,
      enabled: entry.enabled,
      defaultTimeoutMs,
      defaultModel,
      supportedModels: Array.isArray(entry.supportedModels)
        ? entry.supportedModels.filter((model): model is string => typeof model === 'string')
        : [],
    };
  });
};

const renderTemplateString = (value: string, context: TemplateContext): string => {
  return value.replaceAll(PLACEHOLDER_PATTERN, (_match, key: keyof TemplateContext) => {
    return context[key];
  });
};

/**
 * Remove flag–value pairs (e.g. `--model`, `<value>`) when the template value
 * resolved to an empty string.  This prevents passing `--model ""` to CLIs
 * that treat an empty model as an error.
 */
const stripEmptyFlagValuePairs = (args: string[]): string[] => {
  const result: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === undefined) {
      continue;
    }
    const next: string | undefined = args[i + 1];

    // If current is a flag (starts with -) and next arg is empty string, skip both
    if (current.startsWith('-') && next?.trim() === '') {
      i++; // skip the empty value too
      continue;
    }

    // Skip standalone empty strings (e.g. an empty {{prompt}})
    if (current.trim() === '') {
      continue;
    }

    result.push(current);
  }

  return result;
};

const formatCommandPreview = (command: string, args: string[]): string => {
  return [command, ...args]
    .map((part) => {
      if (part === '') {
        return '""';
      }

      return /\s/.test(part) ? JSON.stringify(part) : part;
    })
    .join(' ');
};

const getAdapterSetting = (
  routingSettings: RoutingSettings,
  adapterConfig: Pick<CliAdapterConfig, 'id' | 'enabled' | 'defaultModel'>,
): AdapterRoutingSettings => {
  const override = routingSettings.adapterSettings[adapterConfig.id];

  return {
    enabled: override?.enabled ?? adapterConfig.enabled,
    defaultModel: override?.defaultModel ?? adapterConfig.defaultModel ?? '',
    customCommand: override?.customCommand ?? '',
  };
};

const isUserFacingAdapter = (adapter: Pick<CliAdapter, 'visibility'>): boolean => {
  return adapter.visibility === 'user';
};

const isAvailableAdapter = (adapter: Pick<CliAdapter, 'availability'>): boolean => {
  return adapter.availability === 'available';
};

export class OrchestratorService {
  private readonly rootDir: string;

  private readonly stateListeners = new Set<StateListener>();

  private readonly runEventListeners = new Set<RunEventListener>();

  private readonly executions = new Map<string, RunExecution>();

  private readonly adapterConfigs: CliAdapterConfig[];

  private readonly discoveredAdapterIds: Set<string>;

  private readonly discoveryReasons = new Map<string, { available: boolean; reason: string }>();

  // New service instances for multi-agent orchestration
  private readonly agentRegistry: AgentRegistryService;
  private readonly skillRegistry: SkillRegistryService;
  private readonly mcpRegistry: McpRegistryService;
  private readonly orchestrationExecution: OrchestrationExecutionService;

  private state: AppState;

  private routingSettings: RoutingSettings;

  public constructor(
    rootDir: string,
    private readonly persistenceStore: LocalPersistenceStore,
  ) {
    this.rootDir = rootDir;
    this.adapterConfigs = this.loadAdapters();
    this.discoveredAdapterIds = this.discoverAvailableAdapters(this.adapterConfigs);
    const persisted = this.persistenceStore.load();
    const persistedState = persisted.appData;
    this.routingSettings = this.sanitizeRoutingSettings(persisted.routing);

    // Initialize new registries
    this.agentRegistry = new AgentRegistryService(rootDir);
    this.skillRegistry = new SkillRegistryService(rootDir);
    this.mcpRegistry = new McpRegistryService(rootDir);
    this.orchestrationExecution = new OrchestrationExecutionService();

    // Load agent profiles, skills, and MCP from config files
    this.agentRegistry.loadFromConfig();
    this.skillRegistry.loadFromConfig();
    this.mcpRegistry.loadFromConfig();

    // Merge persisted state (user overrides take precedence)
    if (persistedState?.agentProfiles) {
      this.agentRegistry.mergePersistedProfiles(persistedState.agentProfiles);
    }
    if (persistedState?.skills) {
      this.skillRegistry.mergePersistedSkills(persistedState.skills);
    }
    if (persistedState?.mcpServers) {
      this.mcpRegistry.mergePersistedServers(persistedState.mcpServers);
    }

    this.state = {
      adapters: [],
      conversations: persistedState?.conversations ?? seedConversations(),
      tasks: persistedState?.tasks ?? [],
      runs: persistedState?.runs ?? [],
      nextClaudeTask: persistedState?.nextClaudeTask ?? {
        prompt: '',
        sourceOrchestrationRunId: null,
        generatedAt: null,
        status: 'idle',
      },
      agentProfiles: this.agentRegistry.getAll(),
      skills: this.skillRegistry.getAll(),
      mcpServers: this.mcpRegistry.getAll(),
      projectContext: persistedState?.projectContext ?? { summary: '', updatedAt: null },
      orchestrationRuns: persistedState?.orchestrationRuns ?? [],
      orchestrationNodes: persistedState?.orchestrationNodes ?? [],
    };
    this.state = {
      ...this.state,
      adapters: this.adapterConfigs.map((adapter) => this.toAdapter(adapter)),
    };

    // Wire up orchestration execution callbacks
    this.orchestrationExecution.initialize(
      (input) => this.startRun(input),
      (updater) => {
        this.state = updater(this.state);
        this.emitStateChanged();
      },
      this.skillRegistry,
    );

    this.persistenceStore.saveAppState(this.state);
  }

  public getAppState(): AppState {
    return structuredClone(this.state);
  }

  public refreshAdapters(): AppState {
    this.discoveredAdapterIds.clear();

    for (const adapterId of this.discoverAvailableAdapters(this.adapterConfigs)) {
      this.discoveredAdapterIds.add(adapterId);
    }

    this.routingSettings = this.persistenceStore.saveRoutingSettings(
      this.sanitizeRoutingSettings(this.routingSettings),
    );
    this.state = {
      ...this.state,
      adapters: this.adapterConfigs.map((adapter) => this.toAdapter(adapter)),
    };
    this.emitStateChanged();

    return this.getAppState();
  }

  public getRoutingSettings(): RoutingSettings {
    return structuredClone(this.routingSettings);
  }

  public getProjectContext(): AppState['projectContext'] {
    return structuredClone(this.state.projectContext);
  }

  public saveProjectContext(input: SaveProjectContextInput): AppState['projectContext'] {
    this.state = {
      ...this.state,
      projectContext: {
        summary: input.summary.trim(),
        updatedAt: new Date().toISOString(),
      },
    };
    this.emitStateChanged();
    return this.getProjectContext();
  }

  public getNextClaudeTask(): AppState['nextClaudeTask'] {
    return structuredClone(this.state.nextClaudeTask);
  }

  public updateRoutingSettings(settings: RoutingSettings): RoutingSettings {
    this.routingSettings = this.persistenceStore.saveRoutingSettings(this.sanitizeRoutingSettings(settings));
    this.state = {
      ...this.state,
      adapters: this.adapterConfigs.map((adapter) => this.toAdapter(adapter)),
    };
    this.emitStateChanged();

    return this.getRoutingSettings();
  }

  public createDraftConversation(input: CreateDraftConversationInput): CreateDraftConversationResult {
    const conversation = this.buildConversation(input);

    this.state = {
      ...this.state,
      conversations: [conversation, ...this.state.conversations],
    };

    this.emitStateChanged();

    return { conversation: structuredClone(conversation) };
  }

  public createPlanDraft(input: PlanDraftInput): PlanDraftResult {
    const enabledAdapters = this.getEnabledUserFacingAdapters();
    return createPlanDraftFromService(input, enabledAdapters, this.routingSettings);
  }

  // Orchestration methods (Phase 3)

  public startOrchestration(input: StartOrchestrationInput): StartOrchestrationResult {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error('Orchestration prompt is required.');

    const enabledAdapters = this.getEnabledUserFacingAdapters();
    const conversationId =
      input.conversationId ?? this.buildConversation({ title: prompt.slice(0, 72), message: prompt }).id;

    // Phase 2: Build the execution plan
    const plan = buildExecutionPlan(
      prompt,
      conversationId,
      enabledAdapters,
      this.routingSettings,
      this.agentRegistry.getAll(),
      this.skillRegistry.getAll(),
      this.mcpRegistry.getAll(),
      input.masterAgentProfileId ?? null,
      input.automationMode ?? 'standard',
      this.state.projectContext.summary || null,
    );

    // Apply per-orchestration overrides to all nodes
    const hasAdapterOverride = input.adapterOverride != null;
    const hasModelOverride = input.modelOverride != null;
    if (hasAdapterOverride || hasModelOverride) {
      for (let i = 0; i < plan.nodes.length; i++) {
        const node = plan.nodes[i];
        if (!node) continue;
        plan.nodes[i] = {
          ...node,
          ...(hasAdapterOverride ? { adapterOverride: input.adapterOverride } : {}),
          ...(hasModelOverride ? { modelOverride: input.modelOverride } : {}),
        };
      }
    }

    // Phase 3: Start executing the plan
    const result = this.orchestrationExecution.startExecution(
      plan.orchestrationRun,
      plan.nodes,
      this.agentRegistry.getAll(),
    );

    return {
      orchestrationRun: result.orchestrationRun,
      nodes: result.nodes,
    };
  }

  public cancelOrchestration(input: CancelOrchestrationInput): CancelOrchestrationResult {
    const orchRun = this.orchestrationExecution.cancelOrchestration(input.orchestrationRunId);
    if (!orchRun) {
      // Try to cancel from persisted state
      const run = this.state.orchestrationRuns.find((r) => r.id === input.orchestrationRunId);
      if (!run) throw new Error(`Orchestration run ${input.orchestrationRunId} not found.`);
      const cancelled = { ...run, status: 'cancelled' as const, updatedAt: new Date().toISOString() };
      const terminalStatuses = new Set(['completed', 'failed', 'skipped', 'cancelled']);
      this.state = {
        ...this.state,
        orchestrationRuns: this.state.orchestrationRuns.map((r) => (r.id === cancelled.id ? cancelled : r)),
        orchestrationNodes: this.state.orchestrationNodes.map((node) => {
          if (node.orchestrationRunId !== cancelled.id || terminalStatuses.has(node.status)) {
            return node;
          }
          return { ...node, status: 'cancelled' as const };
        }),
      };
      this.emitStateChanged();
      return { orchestrationRun: structuredClone(cancelled) };
    }

    for (const runId of orchRun.runningRunIds) {
      this.requestTermination(runId, 'cancelled', 'Parent orchestration was cancelled.');
    }

    return { orchestrationRun: orchRun.orchestrationRun };
  }

  public getOrchestrationRun(input: GetOrchestrationRunInput): GetOrchestrationRunResult {
    // Try active orchestration first
    const active = this.orchestrationExecution.getOrchestration(input.orchestrationRunId);
    if (active) return active;

    // Fall back to persisted state
    const run = this.state.orchestrationRuns.find((r) => r.id === input.orchestrationRunId);
    if (!run) throw new Error(`Orchestration run ${input.orchestrationRunId} not found.`);
    const nodes = this.state.orchestrationNodes.filter((n) => n.orchestrationRunId === run.id);
    return { orchestrationRun: structuredClone(run), nodes: structuredClone(nodes) };
  }

  // ---------------------------------------------------------------------------
  // Agent Profile CRUD (Phase 2)
  // ---------------------------------------------------------------------------

  public getAgentProfiles(): AgentProfile[] {
    return this.agentRegistry.getAll();
  }

  public saveAgentProfile(input: SaveAgentProfileInput): AgentProfile {
    const saved = this.agentRegistry.save(input.profile);
    this.state = { ...this.state, agentProfiles: this.agentRegistry.getAll() };
    this.emitStateChanged();
    return saved;
  }

  public deleteAgentProfile(input: DeleteAgentProfileInput): void {
    this.agentRegistry.delete(input.profileId);
    this.state = { ...this.state, agentProfiles: this.agentRegistry.getAll() };
    this.emitStateChanged();
  }

  // ---------------------------------------------------------------------------
  // Skill CRUD (Phase 4)
  // ---------------------------------------------------------------------------

  public getSkills(): SkillDefinition[] {
    return this.skillRegistry.getAll();
  }

  public saveSkill(input: SaveSkillInput): SkillDefinition {
    const saved = this.skillRegistry.save(input.skill);
    this.state = { ...this.state, skills: this.skillRegistry.getAll() };
    this.emitStateChanged();
    return saved;
  }

  public deleteSkill(input: DeleteSkillInput): void {
    this.skillRegistry.delete(input.skillId);
    this.state = { ...this.state, skills: this.skillRegistry.getAll() };
    this.emitStateChanged();
  }

  // ---------------------------------------------------------------------------
  // MCP Server CRUD (Phase 5)
  // ---------------------------------------------------------------------------

  public getMcpServers(): McpServerDefinition[] {
    return this.mcpRegistry.getAll();
  }

  public saveMcpServer(input: SaveMcpServerInput): McpServerDefinition {
    const saved = this.mcpRegistry.save(input.server);
    this.state = { ...this.state, mcpServers: this.mcpRegistry.getAll() };
    this.emitStateChanged();
    return saved;
  }

  public deleteMcpServer(input: DeleteMcpServerInput): void {
    this.mcpRegistry.delete(input.serverId);
    this.state = { ...this.state, mcpServers: this.mcpRegistry.getAll() };
    this.emitStateChanged();
  }

  public startRun(input: StartRunInput): StartRunResult {
    const prompt = input.prompt.trim();
    const title = input.title.trim();

    if (!prompt) {
      throw new Error('Run prompt is required.');
    }

    if (!title) {
      throw new Error('Run title is required.');
    }

    const adapterConfig = this.adapterConfigs.find((entry) => entry.id === input.adapterId);

    if (!adapterConfig) {
      throw new Error(`Adapter ${input.adapterId} is not configured.`);
    }

    const adapter = this.toAdapter(adapterConfig);

    if (!this.canLaunchAdapter(adapter)) {
      const reason = !isAvailableAdapter(adapter)
        ? 'is not available on this machine.'
        : adapter.visibility === 'internal'
          ? 'is reserved for internal verification only.'
          : 'is disabled in routing settings.';
      throw new Error(`Adapter ${adapterConfig.displayName} ${reason}`);
    }

    if (
      adapter.id === 'opencode' &&
      adapter.readiness === 'blocked_by_environment' &&
      /session not found/i.test(adapter.readinessReason)
    ) {
      throw new Error(
        'Adapter OpenCode CLI cannot launch because the local OpenCode session context is currently blocked. Resolve the `Session not found` environment issue before retrying.',
      );
    }

    const timeoutMs = normalizeTimeoutMs(input.timeoutMs ?? adapterConfig.defaultTimeoutMs, 'Run timeoutMs');
    const conversation = this.resolveConversation(input, title, prompt);
    const createdAt = new Date().toISOString();
    const taskId = createId('task');
    const runId = createId('run');
    const templateContext: TemplateContext = {
      adapterId: adapter.id,
      conversationId: conversation.id,
      model: normalizeOptionalString(input.model) ?? this.toAdapter(adapterConfig).defaultModel ?? '',
      prompt,
      runId,
      taskId,
      title,
    };
    const args = stripEmptyFlagValuePairs(
      adapterConfig.args.map((value) => renderTemplateString(value, templateContext)),
    );
    const task: Task = {
      id: taskId,
      title,
      summary: prompt,
      status: 'running',
      taskType: input.taskType ?? 'general',
      profileId: input.profileId ?? null,
      adapterId: adapter.id,
      requestedBy: 'Desktop Operator',
      sourceConversationId: conversation.id,
      cliMention: `@${adapter.id}`,
      runId,
    };
    const run: RunSession = {
      id: runId,
      taskId,
      adapterId: adapter.id,
      model: normalizeOptionalString(templateContext.model),
      status: 'pending',
      startedAt: createdAt,
      activeConversationId: conversation.id,
      commandPreview: formatCommandPreview(adapter.command, args),
      pid: null,
      timeoutMs,
      cancelRequestedAt: null,
      exitCode: null,
      endedAt: null,
      events: [],
      transcript: [],
    };

    this.state = {
      ...this.state,
      tasks: [task, ...this.state.tasks],
      runs: [run, ...this.state.runs],
      conversations: this.state.conversations.map((entry) => {
        if (entry.id !== conversation.id) {
          return entry;
        }

        return {
          ...entry,
          updatedAt: createdAt,
          draftInput: prompt,
        };
      }),
    };

    this.emitStateChanged();
    this.appendRunEvent(runId, 'info', `Starting ${adapter.displayName}.`);
    this.appendTranscriptEntry(runId, {
      actor: 'system',
      kind: 'run_started',
      status: 'completed',
      label: title,
      summary: `Queued task for ${adapter.displayName}.`,
      detail: prompt,
    });
    this.appendTranscriptEntry(runId, {
      actor: 'tool',
      kind: 'step_started',
      status: 'running',
      label: adapter.displayName,
      summary: `Launching ${adapter.displayName}${templateContext.model ? ` with model ${templateContext.model}` : ''}.`,
      detail: formatCommandPreview(adapter.command, args),
      stepId: getPrimaryStepId(runId),
    });
    this.spawnRun(runId, taskId, adapterConfig, templateContext, timeoutMs);

    return {
      run: this.getRun(runId),
      task: this.getTask(taskId),
    };
  }

  public cancelRun(input: CancelRunInput): CancelRunResult {
    const run = this.getRun(input.runId);
    const task = this.getTask(run.taskId);

    if (!this.isRunMutable(run.status)) {
      throw new Error(`Run ${run.id} is already ${run.status}.`);
    }

    this.requestTermination(run.id, 'cancelled', 'Cancellation requested by renderer.');

    return {
      run: this.getRun(run.id),
      task: this.getTask(task.id),
    };
  }

  public getRecentRunsByCategory(
    taskType: string,
    limit = 5,
  ): {
    taskType: string;
    recentRuns: { runId: string; adapterId: string; model: string | null; status: string; startedAt: string }[];
  } {
    const matchingTasks = this.state.tasks.filter((task) => task.taskType === taskType);
    const taskRunIds = new Set(matchingTasks.map((task) => task.runId));
    const matchingRuns = this.state.runs
      .filter((run) => taskRunIds.has(run.id))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);

    return {
      taskType,
      recentRuns: matchingRuns.map((run) => ({
        runId: run.id,
        adapterId: run.adapterId,
        model: run.model,
        status: run.status,
        startedAt: run.startedAt,
      })),
    };
  }

  public onStateChanged(listener: StateListener): () => void {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onRunEvent(listener: RunEventListener): () => void {
    this.runEventListeners.add(listener);

    return () => {
      this.runEventListeners.delete(listener);
    };
  }

  private loadAdapters(): CliAdapterConfig[] {
    const configPath = path.resolve(this.rootDir, 'config/adapters.json');
    const file = readFileSync(configPath, 'utf8');

    return parseAdapterConfig(JSON.parse(file) as unknown);
  }

  private toAdapter(config: CliAdapterConfig): CliAdapter {
    const routingOverride = getAdapterSetting(this.routingSettings, config);
    const command = normalizeOptionalString(routingOverride.customCommand) ?? this.resolveExecutable(config.command);
    const discoveryInfo = this.discoveryReasons.get(config.id);
    const availability: CliAdapter['availability'] = this.discoveredAdapterIds.has(config.id)
      ? 'available'
      : 'unavailable';
    const discoveryReason = discoveryInfo?.reason ?? (availability === 'available' ? 'Found in PATH.' : 'Not checked.');
    const enabled = config.visibility === 'user' && availability === 'available' && routingOverride.enabled;
    const readiness = this.deriveAdapterReadiness(config.id, availability, discoveryReason);

    return {
      id: config.id,
      displayName: config.displayName,
      command,
      launchMode: config.launchMode,
      description: config.description,
      capabilities: config.capabilities,
      health: config.health,
      visibility: config.visibility,
      availability,
      readiness: readiness.state,
      readinessReason: readiness.reason,
      discoveryReason,
      enabled,
      defaultTimeoutMs: config.defaultTimeoutMs,
      defaultModel: normalizeOptionalString(routingOverride.defaultModel) ?? config.defaultModel,
      supportedModels: config.supportedModels,
    };
  }

  private discoverAvailableAdapters(configs: CliAdapterConfig[]): Set<string> {
    const available = new Set<string>();

    for (const config of configs) {
      const command = this.resolveExecutable(config.command);

      if (!config.requiresDiscovery || config.launchMode === 'manual_handoff') {
        available.add(config.id);
        this.discoveryReasons.set(config.id, {
          available: true,
          reason:
            config.launchMode === 'manual_handoff'
              ? 'Manual handoff adapter is always available for copy/paste workflows.'
              : 'Discovery not required (internal adapter).',
        });
      } else if (isExecutableAvailable(command)) {
        available.add(config.id);
        this.discoveryReasons.set(config.id, {
          available: true,
          reason: getAdapterDiscoveryReason(config.id, command, true),
        });
      } else {
        this.discoveryReasons.set(config.id, {
          available: false,
          reason: getAdapterDiscoveryReason(config.id, command, false),
        });
      }
    }

    return available;
  }

  private getEnabledUserFacingAdapters(): CliAdapter[] {
    return this.state.adapters.filter(
      (adapter) => isUserFacingAdapter(adapter) && adapter.enabled && isAvailableAdapter(adapter),
    );
  }

  private deriveAdapterReadiness(
    adapterId: string,
    availability: CliAdapter['availability'],
    discoveryReason: string,
  ): { state: CliAdapter['readiness']; reason: string } {
    if (availability === 'unavailable') {
      return {
        state: 'unavailable',
        reason: discoveryReason,
      };
    }

    const recentRuns = this.state.runs
      .filter((run) => run.adapterId === adapterId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

    for (const run of recentRuns) {
      const terminalMessages = [...run.events]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .filter((event) => isTerminalStatusMessage(event.message))
        .map((event) => event.message);

      const latestTerminalMessage = terminalMessages[0];

      if (!latestTerminalMessage) {
        continue;
      }

      if (isEnvironmentBlockedMessage(latestTerminalMessage)) {
        return {
          state: 'blocked_by_environment',
          reason: latestTerminalMessage,
        };
      }

      if (run.status === 'succeeded') {
        return {
          state: 'ready',
          reason: latestTerminalMessage,
        };
      }
    }

    return {
      state: 'ready',
      reason: discoveryReason,
    };
  }

  private sanitizeRoutingSettings(settings: RoutingSettings): RoutingSettings {
    const availableUserFacingAdapterIds = new Set(
      this.adapterConfigs
        .filter((config) => config.visibility === 'user' && this.discoveredAdapterIds.has(config.id))
        .map((config) => config.id),
    );

    return {
      adapterSettings: { ...settings.adapterSettings },
      taskTypeRules: Object.fromEntries(
        Object.entries(settings.taskTypeRules).map(([taskType, rule]) => {
          const nextAdapterId =
            rule.adapterId && availableUserFacingAdapterIds.has(rule.adapterId) ? rule.adapterId : null;

          return [
            taskType,
            {
              adapterId: nextAdapterId,
              model: rule.model,
            },
          ];
        }),
      ) as RoutingSettings['taskTypeRules'],
      taskProfiles: settings.taskProfiles
        .filter((profile) => profile.id.trim().length > 0)
        .map((profile) => ({
          ...profile,
          adapterId:
            profile.adapterId && availableUserFacingAdapterIds.has(profile.adapterId) ? profile.adapterId : null,
          model: profile.model,
        })),
    };
  }

  private canLaunchAdapter(adapter: CliAdapter): boolean {
    if (!isAvailableAdapter(adapter)) {
      return false;
    }

    return adapter.visibility === 'internal' || adapter.enabled;
  }

  private resolveConversation(input: StartRunInput, title: string, prompt: string): Conversation {
    if (input.conversationId) {
      const existing = this.state.conversations.find((entry) => entry.id === input.conversationId);

      if (existing) {
        return existing;
      }
    }

    const conversation = this.buildConversation({ title, message: prompt });

    this.state = {
      ...this.state,
      conversations: [conversation, ...this.state.conversations],
    };

    return conversation;
  }

  private resolveExecutable(command: string): string {
    if (command === EXECUTABLE_TOKENS.nodeExecPath) {
      return process.execPath;
    }

    return command;
  }

  private buildConversation(input: CreateDraftConversationInput): Conversation {
    const trimmedTitle = input.title.trim();
    const trimmedMessage = input.message.trim();

    if (!trimmedTitle) {
      throw new Error('Draft title is required.');
    }

    if (!trimmedMessage) {
      throw new Error('Draft message is required.');
    }

    const createdAt = new Date().toISOString();

    return {
      id: createId('conv'),
      title: trimmedTitle,
      createdAt,
      updatedAt: createdAt,
      draftInput: trimmedMessage,
      messages: [
        {
          id: createId('msg'),
          role: 'customer',
          content: trimmedMessage,
          createdAt,
        },
      ],
    };
  }

  private pipeRunOutput(
    runId: string,
    stream: NodeJS.ReadableStream,
    level: Extract<RunEvent['level'], 'stdout' | 'stderr'>,
  ): void {
    let pending = '';

    stream.on('data', (chunk: Buffer | string) => {
      pending += chunk.toString();
      const normalized = pending.replaceAll('\r\n', '\n');
      const lines = normalized.split('\n');
      pending = lines.pop() ?? '';

      lines.forEach((line) => {
        const message = stripAnsi(line.trim());

        if (message) {
          this.appendRunEvent(runId, level, message);
          this.appendTranscriptFromOutput(runId, level, message);
        }
      });
    });

    stream.on('end', () => {
      const message = stripAnsi(pending.trim());

      if (message) {
        this.appendRunEvent(runId, level, message);
        this.appendTranscriptFromOutput(runId, level, message);
      }
    });
  }

  private spawnRun(
    runId: string,
    taskId: string,
    adapterConfig: CliAdapterConfig,
    templateContext: TemplateContext,
    timeoutMs: number | null,
  ): void {
    const routingOverride = getAdapterSetting(this.routingSettings, adapterConfig);
    const command =
      normalizeOptionalString(routingOverride.customCommand) ?? this.resolveExecutable(adapterConfig.command);
    const args = stripEmptyFlagValuePairs(
      adapterConfig.args.map((value) => renderTemplateString(value, templateContext)),
    );
    const useShell = shouldUseShell(command);
    const child = spawn(useShell ? buildShellCommand(command, args) : command, useShell ? [] : args, {
      cwd: this.rootDir,
      env: process.env,
      shell: useShell,
      windowsHide: true,
      stdio: [adapterConfig.promptTransport === 'stdin' ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const execution: RunExecution = {
      child,
      phase: 'pending',
      requestedTerminalStatus: null,
      spawnError: null,
      timeoutId: null,
      timeoutMs,
    };

    this.executions.set(runId, execution);

    if (adapterConfig.promptTransport === 'stdin' && child.stdin) {
      child.stdin.write(`${templateContext.prompt}\n`);
      child.stdin.end();
    }

    if (child.stdout) {
      this.pipeRunOutput(runId, child.stdout, 'stdout');
    }

    if (child.stderr) {
      this.pipeRunOutput(runId, child.stderr, 'stderr');
    }

    child.once('spawn', () => {
      const current = this.executions.get(runId);

      if (!current) {
        return;
      }

      current.phase = current.requestedTerminalStatus ? 'terminating' : 'running';
      this.updateRun(runId, (run) => ({
        ...run,
        status: 'running',
        pid: child.pid ?? null,
      }));
      this.appendRunEvent(runId, 'success', `Process started${child.pid ? ` with pid ${child.pid}` : ''}.`);
      this.appendTranscriptEntry(runId, {
        actor: 'tool',
        kind: 'step_output',
        status: 'info',
        label: adapterConfig.displayName,
        summary: `Process started${child.pid ? ` with pid ${child.pid}` : ''}.`,
        stepId: getPrimaryStepId(runId),
      });
    });

    child.on('error', (error) => {
      const current = this.executions.get(runId);

      if (!current) {
        return;
      }

      current.spawnError = error.message;
      this.appendRunEvent(runId, 'error', error.message);
      this.appendTranscriptEntry(runId, {
        actor: 'tool',
        kind: 'step_failed',
        status: 'failed',
        label: adapterConfig.displayName,
        summary: error.message,
        stepId: getPrimaryStepId(runId),
      });
    });

    child.on('close', (code, signal) => {
      this.finalizeRunOnClose(runId, taskId, code, signal);
    });

    if (timeoutMs !== null) {
      execution.timeoutId = setTimeout(() => {
        this.requestTermination(runId, 'timed_out', `Run exceeded timeout of ${timeoutMs} ms.`);
      }, timeoutMs);
    }
  }

  private requestTermination(runId: string, status: RequestedTerminalStatus, message: string): void {
    const execution = this.executions.get(runId);

    if (!execution) {
      return;
    }

    if (execution.requestedTerminalStatus) {
      return;
    }

    execution.requestedTerminalStatus = status;
    execution.phase = 'terminating';

    if (status === 'cancelled') {
      const cancelRequestedAt = new Date().toISOString();
      this.updateRun(runId, (run) => ({
        ...run,
        cancelRequestedAt,
      }));
    }

    this.appendRunEvent(runId, status === 'timed_out' ? 'warning' : 'info', message);
    this.appendTranscriptEntry(runId, {
      actor: 'system',
      kind: 'step_output',
      status: status === 'timed_out' ? 'failed' : 'info',
      label: status === 'timed_out' ? 'Timeout requested' : 'Cancellation requested',
      summary: message,
      stepId: getPrimaryStepId(runId),
    });

    terminateProcessTree(execution.child);
  }

  private finalizeRunOnClose(runId: string, taskId: string, code: number | null, signal: NodeJS.Signals | null): void {
    const execution = this.executions.get(runId);
    const existingRun = this.state.runs.find((run) => run.id === runId);

    if (!execution || !existingRun || !this.isRunMutable(existingRun.status)) {
      return;
    }

    if (execution.timeoutId) {
      clearTimeout(execution.timeoutId);
    }

    const status = this.resolveTerminalStatus(execution, code);
    const endedAt = new Date().toISOString();
    const exitCode = code;
    const taskStatus = this.mapTaskStatus(status);
    const terminalMessage = this.getTerminalMessage(existingRun, status, code, signal, execution.timeoutMs);

    this.appendRunEvent(runId, this.getTerminalLevel(status), terminalMessage);
    this.appendTranscriptEntry(runId, {
      actor: 'tool',
      kind: status === 'succeeded' ? 'step_completed' : 'step_failed',
      status: status === 'succeeded' ? 'completed' : 'failed',
      label: existingRun.model ? `${existingRun.adapterId} (${existingRun.model})` : existingRun.adapterId,
      summary: terminalMessage,
      stepId: getPrimaryStepId(runId),
    });
    this.appendTranscriptEntry(runId, {
      actor: 'system',
      kind: status === 'succeeded' ? 'run_completed' : 'run_failed',
      status: status === 'succeeded' ? 'completed' : 'failed',
      label: existingRun.taskId,
      summary: terminalMessage,
      detail: existingRun.commandPreview,
    });

    this.state = {
      ...this.state,
      runs: this.state.runs.map((run) => {
        if (run.id !== runId) {
          return run;
        }

        return {
          ...run,
          status,
          exitCode,
          endedAt,
        };
      }),
      tasks: this.state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        return {
          ...task,
          status: taskStatus,
        };
      }),
    };

    this.captureHandoffArtifact(runId, status);

    this.executions.delete(runId);
    this.emitStateChanged();

    // Notify orchestration execution service that this run completed
    this.orchestrationExecution.onRunCompleted(runId, status, this.agentRegistry.getAll());
  }

  private resolveTerminalStatus(execution: RunExecution, code: number | null): RunTerminalStatus {
    if (execution.spawnError) {
      return 'spawn_failed';
    }

    if (execution.requestedTerminalStatus) {
      return execution.requestedTerminalStatus;
    }

    return code === 0 ? 'succeeded' : 'failed';
  }

  private mapTaskStatus(status: RunTerminalStatus): TaskStatus {
    switch (status) {
      case 'succeeded':
        return 'completed';
      case 'interrupted':
        return 'interrupted';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'timed_out':
        return 'timed_out';
      case 'spawn_failed':
        return 'spawn_failed';
    }
  }

  private getTerminalLevel(status: RunTerminalStatus): RunEvent['level'] {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'interrupted':
      case 'timed_out':
        return 'warning';
      case 'failed':
      case 'cancelled':
      case 'spawn_failed':
        return status === 'cancelled' ? 'info' : 'error';
    }
  }

  private getTerminalMessage(
    run: RunSession,
    status: RunTerminalStatus,
    code: number | null,
    signal: NodeJS.Signals | null,
    timeoutMs: number | null,
  ): string {
    switch (status) {
      case 'succeeded':
        return 'Process completed successfully.';
      case 'interrupted':
        return 'Process was interrupted by an application restart and cannot be resumed.';
      case 'spawn_failed':
        return 'Process failed to start. Check that the CLI tool is installed and accessible in your PATH.';
      case 'failed':
        if (run.adapterId === 'opencode') {
          const stderrDetail = this.getLatestStderrDetail(run);

          if (stderrDetail) {
            return `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal: ${signal})` : ''}. ${stderrDetail}`;
          }

          return `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal: ${signal})` : ''}. OpenCode is installed, but this environment is currently missing a usable local session/server context.`;
        }
        return `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal: ${signal})` : ''}. Check the stderr output above for details.`;
      case 'cancelled':
        return `Process cancelled by user${signal ? ` (signal: ${signal})` : ''}.`;
      case 'timed_out':
        if (run.adapterId === 'claude') {
          return `Process timed out after ${timeoutMs ? `${Math.round(timeoutMs / 1000)}s` : 'unknown duration'}. Claude Code is installed and authenticated, but this environment is not completing the current non-interactive run path reliably.`;
        }
        return `Process timed out after ${timeoutMs ? `${Math.round(timeoutMs / 1000)}s` : 'unknown duration'}. Consider increasing the timeout or simplifying the prompt.`;
    }
  }

  private getLatestStderrDetail(run: RunSession): string | null {
    const latestStderrEvent = [...run.events]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .find((event) => event.level === 'stderr');

    return latestStderrEvent?.message ?? null;
  }

  private isRunMutable(status: RunStatus): boolean {
    return status === 'pending' || status === 'running';
  }

  private updateRun(runId: string, updater: (run: RunSession) => RunSession): void {
    this.state = {
      ...this.state,
      runs: this.state.runs.map((run) => (run.id === runId ? updater(run) : run)),
    };
    this.emitStateChanged();
  }

  private appendRunEvent(runId: string, level: RunEvent['level'], message: string): void {
    const event: RunEvent = {
      id: createId('evt'),
      runId,
      level,
      timestamp: new Date().toISOString(),
      message,
    };

    this.state = {
      ...this.state,
      runs: this.state.runs.map((run) => {
        if (run.id !== runId) {
          return run;
        }

        return {
          ...run,
          events: [...run.events, event],
        };
      }),
    };

    this.runEventListeners.forEach((listener) => {
      listener(structuredClone(event));
    });
    this.emitStateChanged();
  }

  private appendTranscriptEntry(runId: string, input: AppendTranscriptInput): void {
    const entry: ExecutionTranscriptEntry = {
      id: createId('tx'),
      runId,
      stepId: input.stepId ?? null,
      actor: input.actor,
      kind: input.kind,
      status: input.status,
      timestamp: new Date().toISOString(),
      label: input.label,
      summary: input.summary,
      detail: input.detail ?? null,
    };

    this.state = {
      ...this.state,
      runs: this.state.runs.map((run) => {
        if (run.id !== runId) {
          return run;
        }

        return {
          ...run,
          transcript: [...run.transcript, entry],
        };
      }),
    };
    this.emitStateChanged();
  }

  private appendTranscriptFromOutput(
    runId: string,
    level: Extract<RunEvent['level'], 'stdout' | 'stderr'>,
    message: string,
  ): void {
    const run = this.state.runs.find((entry) => entry.id === runId);
    const parsed = level === 'stdout' ? (tryParseJsonObject(message) as ParsedCodexEvent | null) : null;

    if (run?.adapterId === 'codex' && parsed?.type === 'item.completed' && parsed.item?.type === 'agent_message') {
      this.appendTranscriptEntry(runId, {
        actor: 'assistant',
        kind: 'step_output',
        status: 'info',
        label: 'Codex response',
        summary: parsed.item.text ?? message,
        stepId: getPrimaryStepId(runId),
      });
      return;
    }

    if (run?.adapterId === 'codex' && parsed?.type === 'item.started' && parsed.item?.type === 'command_execution') {
      this.appendTranscriptEntry(runId, {
        actor: 'tool',
        kind: 'step_output',
        status: 'running',
        label: 'Codex command',
        summary: parsed.item.command ?? 'Executing command',
        stepId: getPrimaryStepId(runId),
      });
      return;
    }

    if (run?.adapterId === 'codex' && parsed?.type === 'item.completed' && parsed.item?.type === 'command_execution') {
      this.appendTranscriptEntry(runId, {
        actor: 'tool',
        kind: parsed.item.status === 'failed' ? 'step_failed' : 'step_completed',
        status: parsed.item.status === 'failed' ? 'failed' : 'completed',
        label: 'Codex command',
        summary: parsed.item.aggregated_output || parsed.item.command || 'Command completed',
        detail: parsed.item.command ?? null,
        stepId: getPrimaryStepId(runId),
      });
      return;
    }

    this.appendTranscriptEntry(runId, {
      actor: 'tool',
      kind: 'step_output',
      status: level === 'stderr' ? 'failed' : 'info',
      label: level === 'stderr' ? 'Stderr' : 'Stdout',
      summary: message,
      stepId: getPrimaryStepId(runId),
    });
  }

  private captureHandoffArtifact(runId: string, status: RunTerminalStatus): void {
    const run = this.state.runs.find((entry) => entry.id === runId);
    if (!run) {
      return;
    }

    const currentNode = this.state.orchestrationNodes.find((entry) => entry.runId === runId) ?? null;
    const currentOrchestrationRun = currentNode
      ? (this.state.orchestrationRuns.find((entry) => entry.id === currentNode.orchestrationRunId) ?? null)
      : null;

    const changedFiles = this.getChangedFiles();
    const diffStat = this.getDiffStat();
    const transcriptSummary = run.transcript
      .slice(-6)
      .map((entry) => entry.summary)
      .filter((summary) => summary.trim().length > 0)
      .join(' | ');
    const reviewNotes = this.deriveReviewNotes(
      run,
      currentNode,
      currentOrchestrationRun,
      changedFiles,
      diffStat,
      transcriptSummary,
    );
    const nextClaudeTask = this.deriveNextClaudeTask(
      currentNode,
      currentOrchestrationRun,
      reviewNotes,
      changedFiles,
      diffStat,
    );

    this.state = {
      ...this.state,
      nextClaudeTask,
      orchestrationNodes: this.state.orchestrationNodes.map((node) => {
        if (node.runId !== runId) {
          return node;
        }

        return {
          ...node,
          resultPayload: {
            kind: 'run_handoff',
            runId,
            adapterId: run.adapterId,
            model: run.model,
            status,
            changedFiles,
            diffStat,
            transcriptSummary: transcriptSummary.length > 0 ? transcriptSummary : null,
            reviewNotes,
            generatedAt: new Date().toISOString(),
          },
        };
      }),
    };
  }

  private deriveReviewNotes(
    run: RunSession,
    node: AppState['orchestrationNodes'][number] | null,
    orchestrationRun: AppState['orchestrationRuns'][number] | null,
    changedFiles: string[],
    diffStat: string | null,
    transcriptSummary: string,
  ): string[] {
    if (!node || !orchestrationRun || node.title !== 'Review and write handoff') {
      return [];
    }

    const notes: string[] = [];
    if (changedFiles.length > 0) {
      notes.push(`Focus on changed files: ${changedFiles.join(', ')}`);
    }
    if (diffStat) {
      notes.push(`Diff stat: ${diffStat}`);
    }
    if (transcriptSummary.trim().length > 0) {
      notes.push(`Latest review transcript summary: ${transcriptSummary}`);
    }
    if (run.status !== 'succeeded') {
      notes.push(`Reviewer run ended with status ${run.status}; inspect repository artifacts before continuing.`);
    }
    notes.push(
      'Read debug-review-and-optimization-plan.md and optimization-results.md before the next Claude revision.',
    );

    return notes;
  }

  private deriveNextClaudeTask(
    node: AppState['orchestrationNodes'][number] | null,
    orchestrationRun: AppState['orchestrationRuns'][number] | null,
    reviewNotes: string[],
    changedFiles: string[],
    diffStat: string | null,
  ): AppState['nextClaudeTask'] {
    if (!node || !orchestrationRun || node.title !== 'Review and write handoff' || reviewNotes.length === 0) {
      return this.state.nextClaudeTask;
    }

    const promptParts = [
      'Continue the task by following the latest OpenCode review results.',
      `Original goal: ${orchestrationRun.rootPrompt}`,
      'Mandatory inputs:',
      '- Read debug-review-and-optimization-plan.md',
      '- Read optimization-results.md',
      '',
      'Review-driven next steps:',
      ...reviewNotes.map((note) => `- ${note}`),
    ];

    if (changedFiles.length > 0) {
      promptParts.push('', `Current changed files: ${changedFiles.join(', ')}`);
    }

    if (diffStat) {
      promptParts.push(`Current diff stat: ${diffStat}`);
    }

    promptParts.push(
      '',
      'Do not restart the project analysis from scratch. Only address the remaining issues from the latest review and re-run the normal validation commands when finished.',
    );

    return {
      prompt: promptParts.join('\n'),
      sourceOrchestrationRunId: orchestrationRun.id,
      generatedAt: new Date().toISOString(),
      status: 'ready',
    };
  }

  private getChangedFiles(): string[] {
    try {
      const output = execFileSync('git', ['status', '--short', '--untracked-files=all'], {
        cwd: this.rootDir,
        windowsHide: true,
        encoding: 'utf8',
      });

      return output
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 3)
        .map((line) => line.slice(3).trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  private getDiffStat(): string | null {
    try {
      const output = execFileSync('git', ['diff', '--stat'], {
        cwd: this.rootDir,
        windowsHide: true,
        encoding: 'utf8',
      }).trim();

      return output.length > 0 ? output : null;
    } catch {
      return null;
    }
  }

  private getRun(runId: string): RunSession {
    const run = this.state.runs.find((entry) => entry.id === runId);

    if (!run) {
      throw new Error(`Run ${runId} was not found.`);
    }

    return structuredClone(run);
  }

  private getTask(taskId: string): Task {
    const task = this.state.tasks.find((entry) => entry.id === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} was not found.`);
    }

    return structuredClone(task);
  }

  private emitStateChanged(): void {
    this.state = {
      ...this.state,
      adapters: this.adapterConfigs.map((adapter) => this.toAdapter(adapter)),
    };

    const snapshot = this.getAppState();

    this.persistenceStore.saveAppState(snapshot);

    this.stateListeners.forEach((listener) => {
      listener(snapshot);
    });
  }
}
