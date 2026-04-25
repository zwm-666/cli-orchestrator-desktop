export type ConversationRole = 'customer' | 'assistant' | 'system';
export type AppLocale = 'en' | 'zh';
export type TaskType = 'general' | 'planning' | 'code' | 'frontend' | 'research' | 'git' | 'ops';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
  draftInput: string;
}

export type TaskStatus =
  | 'queued'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled'
  | 'timed_out'
  | 'spawn_failed';
export type RunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'interrupted'
  | 'spawn_failed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';
export type RunTerminalStatus = Exclude<RunStatus, 'pending' | 'running'>;
export type RunEventLevel = 'info' | 'warning' | 'success' | 'stdout' | 'stderr' | 'error';
export type ExecutionTranscriptKind =
  | 'run_started'
  | 'step_started'
  | 'step_output'
  | 'step_completed'
  | 'step_failed'
  | 'run_completed'
  | 'run_failed';
export type ExecutionTranscriptActor = 'system' | 'tool' | 'assistant';
export type ExecutionTranscriptStatus = 'info' | 'running' | 'completed' | 'failed';
export type CliAdapterHealth = 'healthy' | 'idle' | 'attention';
export type CliAdapterVisibility = 'user' | 'internal';
export type CliAdapterAvailability = 'available' | 'unavailable';
export type CliAdapterReadiness = 'ready' | 'blocked_by_environment' | 'unavailable';
export type CliAdapterLaunchMode = 'cli' | 'manual_handoff';

export interface CliAdapter {
  id: string;
  displayName: string;
  command: string;
  launchMode: CliAdapterLaunchMode;
  description: string;
  capabilities: string[];
  health: CliAdapterHealth;
  visibility: CliAdapterVisibility;
  availability: CliAdapterAvailability;
  readiness: CliAdapterReadiness;
  readinessReason: string;
  discoveryReason: string;
  enabled: boolean;
  defaultTimeoutMs: number | null;
  defaultModel: string | null;
  supportedModels: string[];
}

export interface Task {
  id: string;
  title: string;
  summary: string;
  status: TaskStatus;
  taskType: TaskType;
  profileId: string | null;
  adapterId: string;
  requestedBy: string;
  sourceConversationId: string;
  cliMention: string;
  runId: string;
}

export interface RunEvent {
  id: string;
  runId: string;
  level: RunEventLevel;
  timestamp: string;
  message: string;
}

export interface ExecutionTranscriptEntry {
  id: string;
  runId: string;
  stepId: string | null;
  actor: ExecutionTranscriptActor;
  kind: ExecutionTranscriptKind;
  status: ExecutionTranscriptStatus;
  timestamp: string;
  label: string;
  summary: string;
  detail: string | null;
}

export interface RunSession {
  id: string;
  taskId: string;
  adapterId: string;
  model: string | null;
  workbenchThreadId?: string | null;
  status: RunStatus;
  startedAt: string;
  activeConversationId: string;
  commandPreview: string;
  pid: number | null;
  timeoutMs: number | null;
  cancelRequestedAt: string | null;
  exitCode: number | null;
  endedAt: string | null;
  events: RunEvent[];
  transcript: ExecutionTranscriptEntry[];
}

export type TerminalEventStream = 'stdout' | 'stderr' | 'system';
export type TerminalEventKind = 'output' | 'started' | 'exit' | 'error';

export interface TerminalEvent {
  sessionId: string;
  kind: TerminalEventKind;
  stream: TerminalEventStream;
  data: string;
  timestamp: string;
  exitCode?: number | null;
  signal?: string | null;
}

export interface StartTerminalInput {
  cwd?: string | null;
}

export interface StartTerminalResult {
  sessionId: string;
  shell: string;
  cwd: string;
}

export interface WriteTerminalInput {
  sessionId: string;
  data: string;
}

export interface StopTerminalInput {
  sessionId: string;
}

export interface ProjectContextState {
  summary: string;
  updatedAt: string | null;
}

export interface HandoffArtifact {
  kind: 'run_handoff';
  runId: string;
  adapterId: string;
  model: string | null;
  status: RunStatus;
  changedFiles: string[];
  diffStat: string | null;
  transcriptSummary: string | null;
  reviewNotes: string[];
  generatedAt: string;
}

export interface NextClaudeTaskState {
  prompt: string;
  sourceOrchestrationRunId: string | null;
  generatedAt: string | null;
  status: 'idle' | 'ready';
}

export type WorkbenchTaskStatus = 'pending' | 'in_progress' | 'completed';
export type WorkbenchTaskSource = 'planner' | 'assistant' | 'manual';
export type WorkbenchTargetKind = 'provider' | 'adapter';

export interface WorkbenchTaskItem {
  id: string;
  title: string;
  detail: string;
  status: WorkbenchTaskStatus;
  source: WorkbenchTaskSource;
  agentProfileId?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkbenchSkillBinding {
  id: string;
  targetKind: WorkbenchTargetKind;
  targetId: string;
  modelPattern: string;
  enabledSkillIds: string[];
}

export interface WorkbenchActivitySummary {
  sourceKind: WorkbenchTargetKind;
  sourceId: string;
  sourceLabel: string;
  modelLabel: string;
  status: string;
  detail: string;
  taskUpdateSummary: string;
  recordedAt: string;
}

export interface TaskThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageKind?: 'default' | 'orchestration_event' | 'orchestration_result' | 'discussion_final' | null;
  providerId: string | null;
  adapterId: string | null;
  sourceKind: 'provider' | 'adapter' | 'orchestration' | null;
  sourceLabel: string | null;
  modelLabel: string | null;
  agentLabel: string | null;
  orchestrationRunId: string | null;
  orchestrationNodeId?: string | null;
  discussionRound?: number | null;
  createdAt: string;
}

export interface TaskThreadContinuation {
  conversationId: string;
  lastRunId: string | null;
  updatedAt: string;
}

export interface TaskThread {
  id: string;
  title: string;
  continuation?: TaskThreadContinuation | null;
  archivedAt?: string | null;
  messages: TaskThreadMessage[];
  activityLog: WorkbenchActivitySummary[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkbenchOrchestrationBinding {
  orchestrationRunId: string;
  threadId: string;
  createdAt: string;
}

export interface WorkbenchState {
  objective: string;
  workspaceRoot: string | null;
  recentWorkspaceRoots?: string[];
  tasks: WorkbenchTaskItem[];
  skillBindings: WorkbenchSkillBinding[];
  promptBuilderCommand: string | null;
  processedRunIds: string[];
  processedOrchestrationNodeIds?: string[];
  orchestrationThreadBindings?: WorkbenchOrchestrationBinding[];
  activeOrchestrationRunId?: string | null;
  activeThreadId: string | null;
  threads: TaskThread[];
  /** @deprecated Prefer per-thread activityLog. */
  latestProviderActivity: WorkbenchActivitySummary | null;
  /** @deprecated Prefer per-thread activityLog. */
  latestAdapterActivity: WorkbenchActivitySummary | null;
  generatedAt: string | null;
  updatedAt: string | null;
}

export const DEFAULT_WORKBENCH_STATE: WorkbenchState = {
  objective: '',
  workspaceRoot: null,
  recentWorkspaceRoots: [],
  tasks: [],
  skillBindings: [],
  promptBuilderCommand: null,
  processedRunIds: [],
  processedOrchestrationNodeIds: [],
  orchestrationThreadBindings: [],
  activeOrchestrationRunId: null,
  activeThreadId: null,
  threads: [],
  latestProviderActivity: null,
  latestAdapterActivity: null,
  generatedAt: null,
  updatedAt: null,
};

export interface LaunchFormDraft {
  title: string;
  prompt: string;
  adapterId: string;
  model: string;
  conversationId: string;
  timeoutMs: string;
}

export const DEFAULT_LAUNCH_FORM_DRAFT: LaunchFormDraft = {
  title: '',
  prompt: '',
  adapterId: '',
  model: '',
  conversationId: '',
  timeoutMs: '',
};

export type Locale = AppLocale;

export type PersistedRoute = '/plan' | '/work' | '/config';

export interface RendererContinuityState {
  planDraft: PlanDraft | null;
  selectedPlannedTaskIndex: number;
  launchForm: LaunchFormDraft;
  selectedRunId: string | null;
  selectedConversationId: string | null;
  locale: Locale;
  lastRoute: PersistedRoute | null;
}

export interface CreateDraftConversationInput {
  title: string;
  message: string;
}

export interface CreateDraftConversationResult {
  conversation: Conversation;
}

export type PlanRoutingSource = 'explicit_mention' | 'task_type_rule' | 'first_enabled_adapter' | 'no_enabled_adapter';
export type PlanConfidence = 'high' | 'medium' | 'low';
export type PlanSegmentationSource = 'single_fallback' | 'bullets' | 'lines' | 'sentences' | 'conjunctions';

export interface PlanDraftMention {
  token: string;
  adapterId: string;
  recognized: boolean;
}

export interface PlanTaskDraft {
  rawInput: string;
  cleanedPrompt: string;
  taskTitle: string;
  taskType: TaskType;
  displayCategory: string;
  matchedProfileId: string | null;
  classificationReason: string;
  mentions: PlanDraftMention[];
  recommendedAdapterId: string | null;
  recommendedModel: string | null;
  routingSource: PlanRoutingSource;
  confidence: PlanConfidence;
  rationale: string;
}

export interface PlanDraft {
  rawInput: string;
  plannerVersion: string;
  segmentationSource: PlanSegmentationSource;
  plannedTasks: PlanTaskDraft[];
  cleanedPrompt: string;
  taskTitle: string;
  taskType: TaskType;
  displayCategory: string;
  matchedProfileId: string | null;
  classificationReason: string;
  mentions: PlanDraftMention[];
  recommendedAdapterId: string | null;
  recommendedModel: string | null;
  routingSource: PlanRoutingSource;
  confidence: PlanConfidence;
  rationale: string;
}

export interface PlanDraftInput {
  rawInput: string;
}

export interface PlanDraftResult {
  draft: PlanDraft;
}

export type UiContinuityState = RendererContinuityState;

export const DEFAULT_UI_CONTINUITY_STATE: UiContinuityState = {
  locale: 'en',
  selectedRunId: null,
  selectedConversationId: null,
  selectedPlannedTaskIndex: 0,
  launchForm: DEFAULT_LAUNCH_FORM_DRAFT,
  planDraft: null,
  lastRoute: null,
};

export interface UpdateUiContinuityInput {
  locale?: AppLocale;
  selectedRunId?: string | null;
  selectedConversationId?: string | null;
  selectedPlannedTaskIndex?: number;
  launchForm?: LaunchFormDraft;
  planDraft?: PlanDraft | null;
  lastRoute?: PersistedRoute | null;
}

export interface AdapterRoutingSettings {
  enabled: boolean;
  defaultModel: string;
  modelOptions?: string[];
  customCommand: string;
}

export interface TaskRoutingRule {
  adapterId: string | null;
  model: string;
}

export interface TaskRoutingProfile {
  id: string;
  label: string;
  taskType: TaskType;
  adapterId: string | null;
  model: string;
  enabled: boolean;
}

export interface RoutingSettings {
  adapterSettings: Record<string, AdapterRoutingSettings>;
  taskTypeRules: Record<TaskType, TaskRoutingRule>;
  taskProfiles: TaskRoutingProfile[];
}

export const TASK_TYPES: TaskType[] = ['general', 'planning', 'code', 'frontend', 'research', 'git', 'ops'];

export const DEFAULT_TASK_ROUTING_PROFILES: TaskRoutingProfile[] = [
  { id: 'profile-general', label: 'General', taskType: 'general', adapterId: null, model: '', enabled: true },
  { id: 'profile-planning', label: 'Planning', taskType: 'planning', adapterId: null, model: '', enabled: true },
  { id: 'profile-code', label: 'Code', taskType: 'code', adapterId: null, model: '', enabled: true },
  { id: 'profile-frontend', label: 'Frontend', taskType: 'frontend', adapterId: null, model: '', enabled: true },
  { id: 'profile-research', label: 'Research', taskType: 'research', adapterId: null, model: '', enabled: true },
  { id: 'profile-git', label: 'Git', taskType: 'git', adapterId: null, model: '', enabled: true },
  { id: 'profile-ops', label: 'Ops', taskType: 'ops', adapterId: null, model: '', enabled: true },
];

export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = {
  adapterSettings: {},
  taskTypeRules: {
    general: { adapterId: null, model: '' },
    planning: { adapterId: null, model: '' },
    code: { adapterId: null, model: '' },
    frontend: { adapterId: null, model: '' },
    research: { adapterId: null, model: '' },
    git: { adapterId: null, model: '' },
    ops: { adapterId: null, model: '' },
  },
  taskProfiles: DEFAULT_TASK_ROUTING_PROFILES,
};

export interface UpdateRoutingSettingsInput {
  settings: RoutingSettings;
}

export interface StartRunInput {
  title: string;
  prompt: string;
  adapterId: string;
  model?: string | null;
  workbenchThreadId?: string | null;
  conversationId?: string;
  timeoutMs?: number | null;
  taskType?: TaskType;
  profileId?: string | null;
}

export interface StartRunResult {
  run: RunSession;
  task: Task;
}

export interface CancelRunInput {
  runId: string;
}

export interface CancelRunResult {
  run: RunSession;
  task: Task;
}

export interface CategoryRunSummaryEntry {
  runId: string;
  adapterId: string;
  model: string | null;
  status: RunStatus;
  startedAt: string;
}

export interface CategoryRunSummary {
  taskType: TaskType;
  recentRuns: CategoryRunSummaryEntry[];
}

export interface GetRecentRunsByCategoryInput {
  taskType: TaskType;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Multi-Agent / Orchestration Domain Types
// ---------------------------------------------------------------------------

/** Agent role determines the behavioral archetype of an agent node. */
export type AgentRoleType = 'master' | 'planner' | 'researcher' | 'coder' | 'reviewer' | 'tester' | 'custom';

/** Retry policy controls how failed nodes are retried. */
export interface RetryPolicy {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 1,
  delayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * AgentProfile defines a reusable agent configuration that combines
 * a provider or local adapter with a role, skills, MCP bindings, and execution constraints.
 */
export interface AgentProfile {
  id: string;
  name: string;
  role: AgentRoleType;
  targetKind?: WorkbenchTargetKind;
  targetId?: string;
  /** Legacy adapter target kept for existing persisted profiles and adapter orchestration. */
  adapterId: string;
  model: string;
  modelOptions?: string[];
  systemPrompt: string;
  enabledSkillIds: string[];
  enabledMcpServerIds: string[];
  maxParallelChildren: number;
  retryPolicy: RetryPolicy;
  timeoutMs: number | null;
  enabled: boolean;
}

/**
 * SkillDefinition is a reusable task-handling template.
 * It defines when to trigger, how to enrich the prompt, and what tools it needs.
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  trigger: SkillTrigger;
  promptTemplate: string;
  allowedTaskTypes: TaskType[];
  recommendedAgentRole: AgentRoleType | null;
  requiredMcpServerIds: string[];
  inputSchema: Record<string, unknown> | null;
  enabled: boolean;
  version: string;
}

export interface SkillTrigger {
  keywords: string[];
  taskTypes: TaskType[];
}

/** Transport protocol for MCP server connections. */
export type McpTransport = 'stdio' | 'sse' | 'streamable-http';
export type McpHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

/**
 * McpServerDefinition represents an MCP server that provides tools to agents.
 * MCP answers "which tools are accessible during execution."
 */
export interface McpServerDefinition {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  toolAllowlist: string[];
  healthStatus: McpHealthStatus;
  healthReason: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Orchestration Run Types
// ---------------------------------------------------------------------------

export type OrchestrationRunStatus = 'planning' | 'executing' | 'aggregating' | 'completed' | 'failed' | 'cancelled';
export type OrchestrationAutomationMode = 'standard' | 'review_loop' | 'discussion';
export type OrchestrationExecutionStyle = 'planner' | 'sequential' | 'parallel';
export type DiscussionConsensusStrategy = 'keyword' | 'summary_match';

export interface DiscussionAutomationConfig {
  maxRounds: number;
  participantsPerRound: number;
  participantProfileIds?: string[];
  consensusStrategy: DiscussionConsensusStrategy;
  consensusKeyword: string;
  requireFinalSynthesis: boolean;
}

export interface DiscussionAutomationConfigInput {
  maxRounds?: number | null;
  participantsPerRound?: number | null;
  participantProfileIds?: string[];
  consensusStrategy?: DiscussionConsensusStrategy;
  consensusKeyword?: string | null;
  requireFinalSynthesis?: boolean;
}

export type OrchestrationNodeStatus =
  | 'pending'
  | 'waiting_on_deps'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/**
 * OrchestrationRun is the top-level container for a multi-agent execution.
 * One user request produces one OrchestrationRun containing multiple OrchestrationNodes.
 */
export interface OrchestrationRun {
  id: string;
  conversationId: string;
  rootPrompt: string;
  status: OrchestrationRunStatus;
  masterAgentProfileId: string | null;
  automationMode: OrchestrationAutomationMode;
  executionStyle?: OrchestrationExecutionStyle;
  discussionConfig?: DiscussionAutomationConfig | null;
  projectContextSummary: string | null;
  currentIteration: number;
  maxIterations: number;
  stopReason: string | null;
  planVersion: number;
  createdAt: string;
  updatedAt: string;
  finalSummary: string | null;
}

/**
 * OrchestrationNode represents a single unit of work within an orchestration run.
 * Each node maps to one agent executing one task segment, ultimately producing one RunSession.
 */
export interface OrchestrationNode {
  id: string;
  orchestrationRunId: string;
  parentNodeId: string | null;
  dependsOnNodeIds: string[];
  agentProfileId: string | null;
  skillIds: string[];
  mcpServerIds: string[];
  taskType: TaskType;
  title: string;
  prompt: string;
  status: OrchestrationNodeStatus;
  runId: string | null;
  resultSummary: string | null;
  resultPayload: HandoffArtifact | null;
  retryCount: number;
  /** Per-orchestration adapter override (takes precedence over profile). */
  adapterOverride?: string | null;
  /** Per-orchestration model override (takes precedence over profile). */
  modelOverride?: string | null;
  /** Dynamic discussion iteration index (1-based). */
  discussionRound?: number;
  /** Discussion role hint (speaker, critic, synthesizer). */
  discussionRole?: 'speaker' | 'critic' | 'synthesizer';
}

// ---------------------------------------------------------------------------
// Extended AppState for Orchestration
// ---------------------------------------------------------------------------

export interface AppState {
  conversations: Conversation[];
  adapters: CliAdapter[];
  tasks: Task[];
  runs: RunSession[];
  projectContext: ProjectContextState;
  nextClaudeTask: NextClaudeTaskState;
  agentProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  orchestrationRuns: OrchestrationRun[];
  orchestrationNodes: OrchestrationNode[];
  workbench?: WorkbenchState;
}

// ---------------------------------------------------------------------------
// Orchestration IPC Input/Result Types
// ---------------------------------------------------------------------------

export interface StartOrchestrationInput {
  prompt: string;
  conversationId?: string;
  masterAgentProfileId?: string | null;
  automationMode?: OrchestrationAutomationMode;
  executionStyle?: OrchestrationExecutionStyle;
  participantProfileIds?: string[];
  discussionConfig?: DiscussionAutomationConfigInput | null;
  maxIterations?: number | null;
  /** Override the model used by all nodes (takes precedence over profile defaults). */
  modelOverride?: string | null;
  /** Override the adapter used by all nodes (takes precedence over profile defaults). */
  adapterOverride?: string | null;
}

export interface StartOrchestrationResult {
  orchestrationRun: OrchestrationRun;
  nodes: OrchestrationNode[];
}

export interface CancelOrchestrationInput {
  orchestrationRunId: string;
}

export interface CancelOrchestrationResult {
  orchestrationRun: OrchestrationRun;
}

export interface GetOrchestrationRunInput {
  orchestrationRunId: string;
}

export interface GetOrchestrationRunResult {
  orchestrationRun: OrchestrationRun;
  nodes: OrchestrationNode[];
}

// ---------------------------------------------------------------------------
// Agent Profile CRUD Types
// ---------------------------------------------------------------------------

export interface SaveAgentProfileInput {
  profile: AgentProfile;
}

export interface DeleteAgentProfileInput {
  profileId: string;
}

// ---------------------------------------------------------------------------
// Skill CRUD Types
// ---------------------------------------------------------------------------

export interface SaveSkillInput {
  skill: SkillDefinition;
}

export interface DeleteSkillInput {
  skillId: string;
}

// ---------------------------------------------------------------------------
// MCP Server CRUD Types
// ---------------------------------------------------------------------------

export interface SaveMcpServerInput {
  server: McpServerDefinition;
}

export interface DeleteMcpServerInput {
  serverId: string;
}

export interface SaveProjectContextInput {
  summary: string;
}

export interface SaveWorkbenchStateInput {
  state: WorkbenchState;
}

export interface GetNextClaudeTaskResult {
  nextTask: NextClaudeTaskState;
}

export type WorkspaceEntryType = 'directory' | 'file';

export interface WorkspaceEntry {
  name: string;
  relativePath: string;
  type: WorkspaceEntryType;
  extension: string | null;
}

export interface BrowseWorkspaceInput {
  relativePath: string | null;
  workspaceRoot?: string | null;
}

export interface BrowseWorkspaceResult {
  rootLabel: string;
  workspaceRoot: string;
  currentPath: string;
  parentPath: string | null;
  entries: WorkspaceEntry[];
}

export interface SelectWorkspaceFolderResult {
  workspaceRoot: string | null;
  rootLabel: string | null;
  wasChanged: boolean;
}

export interface ReadWorkspaceFileInput {
  relativePath: string;
  workspaceRoot?: string | null;
}

export interface ReadWorkspaceFileResult {
  rootLabel: string;
  workspaceRoot: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  totalBytes: number;
}

export interface ApplyWorkspaceFileInput {
  relativePath: string;
  content: string;
  workspaceRoot?: string | null;
  createIfMissing?: boolean;
}

export interface ApplyWorkspaceFileResult {
  rootLabel: string;
  workspaceRoot: string;
  relativePath: string;
  bytesWritten: number;
  savedAt: string;
}

export interface WriteWorkspaceFileInput {
  relativePath: string;
  content: string;
  workspaceRoot?: string | null;
}

export interface WriteWorkspaceFileResult {
  rootLabel: string;
  workspaceRoot: string;
  relativePath: string;
  bytesWritten: number;
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Extended Persisted State
// ---------------------------------------------------------------------------

export interface PersistedAppState {
  conversations: Conversation[];
  tasks: Task[];
  runs: RunSession[];
  projectContext: ProjectContextState;
  agentProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  orchestrationRuns: OrchestrationRun[];
  orchestrationNodes: OrchestrationNode[];
  workbench?: WorkbenchState;
}

export interface PersistedAppEnvelope {
  schemaVersion: 1;
  savedAt: string;
  appState: PersistedAppState;
  continuity: UiContinuityState;
}
