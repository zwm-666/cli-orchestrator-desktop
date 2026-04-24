import type {
  AgentProfile,
  ApplyWorkspaceFileInput,
  ApplyWorkspaceFileResult,
  AppState,
  BrowseWorkspaceInput,
  BrowseWorkspaceResult,
  CancelOrchestrationInput,
  CancelOrchestrationResult,
  CancelRunInput,
  CancelRunResult,
  CategoryRunSummary,
  CreateDraftConversationInput,
  CreateDraftConversationResult,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  GetOrchestrationRunResult,
  GetNextClaudeTaskResult,
  McpServerDefinition,
  PlanDraftInput,
  PlanDraftResult,
  ProjectContextState,
  ReadWorkspaceFileInput,
  ReadWorkspaceFileResult,
  RendererContinuityState,
  RoutingSettings,
  RunEvent,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveProjectContextInput,
  SaveSkillInput,
  SaveWorkbenchStateInput,
  SelectWorkspaceFolderResult,
  SkillDefinition,
  StartOrchestrationInput,
  StartOrchestrationResult,
  StartRunInput,
  StartRunResult,
  TaskType,
  UpdateRoutingSettingsInput,
} from './domain.js';
import type { PromptBuilderConfig, SavePromptBuilderConfigInput } from './promptBuilder.js';

export interface SaveAiConfigInput {
  config: Record<string, unknown>;
}

export const IPC_CHANNELS = {
  // Existing channels
  getAppState: 'app:get-state',
  refreshAdapters: 'app:refresh-adapters',
  getContinuityState: 'app:get-continuity-state',
  saveContinuityState: 'app:save-continuity-state',
  getRoutingSettings: 'routing:get-settings',
  saveRoutingSettings: 'routing:save-settings',
  getProjectContext: 'project:get-context',
  saveProjectContext: 'project:save-context',
  saveWorkbenchState: 'workbench:save-state',
  getPromptBuilderConfig: 'prompt-builder:get-config',
  savePromptBuilderConfig: 'prompt-builder:save-config',
  loadAiConfig: 'config:load-ai-config',
  saveAiConfig: 'config:save-ai-config',
  getNextClaudeTask: 'project:get-next-claude-task',
  createDraftConversation: 'conversation:create-draft',
  createPlanDraft: 'plan:create-draft',
  startRun: 'run:start',
  cancelRun: 'run:cancel',
  getRecentRunsByCategory: 'run:recent-by-category',
  appStateUpdated: 'app:state-updated',
  runEvent: 'run:event',

  // Orchestration channels
  startOrchestration: 'orchestration:start',
  cancelOrchestration: 'orchestration:cancel',
  getOrchestrationRun: 'orchestration:get-run',

  // Agent profile channels
  getAgentProfiles: 'agent:get-profiles',
  saveAgentProfile: 'agent:save-profile',
  deleteAgentProfile: 'agent:delete-profile',

  // Skill channels
  getSkills: 'skill:get-all',
  saveSkill: 'skill:save',
  deleteSkill: 'skill:delete',

  // MCP server channels
  getMcpServers: 'mcp:get-servers',
  saveMcpServer: 'mcp:save-server',
  deleteMcpServer: 'mcp:delete-server',
  browseWorkspace: 'workspace:browse',
  selectWorkspaceFolder: 'workspace:select-folder',
  readWorkspaceFile: 'workspace:read-file',
  applyWorkspaceFile: 'workspace:apply-to-file',
} as const;

export interface DesktopApi {
  // Existing methods
  getAppState: () => Promise<AppState>;
  refreshAdapters: () => Promise<AppState>;
  getContinuityState: () => Promise<RendererContinuityState>;
  saveContinuityState: (state: RendererContinuityState) => Promise<RendererContinuityState>;
  getRoutingSettings: () => Promise<RoutingSettings>;
  saveRoutingSettings: (input: UpdateRoutingSettingsInput) => Promise<RoutingSettings>;
  getProjectContext: () => Promise<ProjectContextState>;
  saveProjectContext: (input: SaveProjectContextInput) => Promise<ProjectContextState>;
  saveWorkbenchState: (input: SaveWorkbenchStateInput) => Promise<AppState>;
  getPromptBuilderConfig: () => Promise<PromptBuilderConfig>;
  savePromptBuilderConfig: (input: SavePromptBuilderConfigInput) => Promise<PromptBuilderConfig>;
  loadAiConfig: () => Promise<Record<string, unknown> | null>;
  saveAiConfig: (input: SaveAiConfigInput) => Promise<void>;
  getNextClaudeTask: () => Promise<GetNextClaudeTaskResult>;
  createDraftConversation: (input: CreateDraftConversationInput) => Promise<CreateDraftConversationResult>;
  createPlanDraft: (input: PlanDraftInput) => Promise<PlanDraftResult>;
  startRun: (input: StartRunInput) => Promise<StartRunResult>;
  cancelRun: (input: CancelRunInput) => Promise<CancelRunResult>;
  getRecentRunsByCategory: (input: { taskType: TaskType; limit?: number }) => Promise<CategoryRunSummary>;
  onAppStateChanged: (listener: (statePatch: Partial<AppState>) => void) => () => void;
  onRunEvent: (listener: (event: RunEvent) => void) => () => void;

  // Orchestration methods
  startOrchestration: (input: StartOrchestrationInput) => Promise<StartOrchestrationResult>;
  cancelOrchestration: (input: CancelOrchestrationInput) => Promise<CancelOrchestrationResult>;
  getOrchestrationRun: (input: GetOrchestrationRunInput) => Promise<GetOrchestrationRunResult>;

  // Agent profile methods
  getAgentProfiles: () => Promise<AgentProfile[]>;
  saveAgentProfile: (input: SaveAgentProfileInput) => Promise<AgentProfile>;
  deleteAgentProfile: (input: DeleteAgentProfileInput) => Promise<void>;

  // Skill methods
  getSkills: () => Promise<SkillDefinition[]>;
  saveSkill: (input: SaveSkillInput) => Promise<SkillDefinition>;
  deleteSkill: (input: DeleteSkillInput) => Promise<void>;

  // MCP server methods
  getMcpServers: () => Promise<McpServerDefinition[]>;
  saveMcpServer: (input: SaveMcpServerInput) => Promise<McpServerDefinition>;
  deleteMcpServer: (input: DeleteMcpServerInput) => Promise<void>;
  browseWorkspace: (input: BrowseWorkspaceInput) => Promise<BrowseWorkspaceResult>;
  selectWorkspaceFolder: () => Promise<SelectWorkspaceFolderResult>;
  readWorkspaceFile: (input: ReadWorkspaceFileInput) => Promise<ReadWorkspaceFileResult>;
  applyWorkspaceFile: (input: ApplyWorkspaceFileInput) => Promise<ApplyWorkspaceFileResult>;
}

export interface IpcRequestMap {
  [IPC_CHANNELS.getAppState]: undefined;
  [IPC_CHANNELS.refreshAdapters]: undefined;
  [IPC_CHANNELS.getContinuityState]: undefined;
  [IPC_CHANNELS.saveContinuityState]: RendererContinuityState;
  [IPC_CHANNELS.getRoutingSettings]: undefined;
  [IPC_CHANNELS.saveRoutingSettings]: UpdateRoutingSettingsInput;
  [IPC_CHANNELS.getProjectContext]: undefined;
  [IPC_CHANNELS.saveProjectContext]: SaveProjectContextInput;
  [IPC_CHANNELS.saveWorkbenchState]: SaveWorkbenchStateInput;
  [IPC_CHANNELS.getPromptBuilderConfig]: undefined;
  [IPC_CHANNELS.savePromptBuilderConfig]: SavePromptBuilderConfigInput;
  [IPC_CHANNELS.loadAiConfig]: undefined;
  [IPC_CHANNELS.saveAiConfig]: SaveAiConfigInput;
  [IPC_CHANNELS.getNextClaudeTask]: undefined;
  [IPC_CHANNELS.createDraftConversation]: CreateDraftConversationInput;
  [IPC_CHANNELS.createPlanDraft]: PlanDraftInput;
  [IPC_CHANNELS.startRun]: StartRunInput;
  [IPC_CHANNELS.cancelRun]: CancelRunInput;
  [IPC_CHANNELS.getRecentRunsByCategory]: { taskType: TaskType; limit?: number };

  // Orchestration
  [IPC_CHANNELS.startOrchestration]: StartOrchestrationInput;
  [IPC_CHANNELS.cancelOrchestration]: CancelOrchestrationInput;
  [IPC_CHANNELS.getOrchestrationRun]: GetOrchestrationRunInput;

  // Agent profiles
  [IPC_CHANNELS.getAgentProfiles]: undefined;
  [IPC_CHANNELS.saveAgentProfile]: SaveAgentProfileInput;
  [IPC_CHANNELS.deleteAgentProfile]: DeleteAgentProfileInput;

  // Skills
  [IPC_CHANNELS.getSkills]: undefined;
  [IPC_CHANNELS.saveSkill]: SaveSkillInput;
  [IPC_CHANNELS.deleteSkill]: DeleteSkillInput;

  // MCP servers
  [IPC_CHANNELS.getMcpServers]: undefined;
  [IPC_CHANNELS.saveMcpServer]: SaveMcpServerInput;
  [IPC_CHANNELS.deleteMcpServer]: DeleteMcpServerInput;
  [IPC_CHANNELS.browseWorkspace]: BrowseWorkspaceInput;
  [IPC_CHANNELS.selectWorkspaceFolder]: undefined;
  [IPC_CHANNELS.readWorkspaceFile]: ReadWorkspaceFileInput;
  [IPC_CHANNELS.applyWorkspaceFile]: ApplyWorkspaceFileInput;
}

export interface IpcResponseMap {
  [IPC_CHANNELS.getAppState]: AppState;
  [IPC_CHANNELS.refreshAdapters]: AppState;
  [IPC_CHANNELS.getContinuityState]: RendererContinuityState;
  [IPC_CHANNELS.saveContinuityState]: RendererContinuityState;
  [IPC_CHANNELS.getRoutingSettings]: RoutingSettings;
  [IPC_CHANNELS.saveRoutingSettings]: RoutingSettings;
  [IPC_CHANNELS.getProjectContext]: ProjectContextState;
  [IPC_CHANNELS.saveProjectContext]: ProjectContextState;
  [IPC_CHANNELS.saveWorkbenchState]: AppState;
  [IPC_CHANNELS.getPromptBuilderConfig]: PromptBuilderConfig;
  [IPC_CHANNELS.savePromptBuilderConfig]: PromptBuilderConfig;
  [IPC_CHANNELS.loadAiConfig]: Record<string, unknown> | null;
  [IPC_CHANNELS.saveAiConfig]: undefined;
  [IPC_CHANNELS.getNextClaudeTask]: GetNextClaudeTaskResult;
  [IPC_CHANNELS.createDraftConversation]: CreateDraftConversationResult;
  [IPC_CHANNELS.createPlanDraft]: PlanDraftResult;
  [IPC_CHANNELS.startRun]: StartRunResult;
  [IPC_CHANNELS.cancelRun]: CancelRunResult;
  [IPC_CHANNELS.getRecentRunsByCategory]: CategoryRunSummary;

  // Orchestration
  [IPC_CHANNELS.startOrchestration]: StartOrchestrationResult;
  [IPC_CHANNELS.cancelOrchestration]: CancelOrchestrationResult;
  [IPC_CHANNELS.getOrchestrationRun]: GetOrchestrationRunResult;

  // Agent profiles
  [IPC_CHANNELS.getAgentProfiles]: AgentProfile[];
  [IPC_CHANNELS.saveAgentProfile]: AgentProfile;
  [IPC_CHANNELS.deleteAgentProfile]: undefined;

  // Skills
  [IPC_CHANNELS.getSkills]: SkillDefinition[];
  [IPC_CHANNELS.saveSkill]: SkillDefinition;
  [IPC_CHANNELS.deleteSkill]: undefined;

  // MCP servers
  [IPC_CHANNELS.getMcpServers]: McpServerDefinition[];
  [IPC_CHANNELS.saveMcpServer]: McpServerDefinition;
  [IPC_CHANNELS.deleteMcpServer]: undefined;
  [IPC_CHANNELS.browseWorkspace]: BrowseWorkspaceResult;
  [IPC_CHANNELS.selectWorkspaceFolder]: SelectWorkspaceFolderResult;
  [IPC_CHANNELS.readWorkspaceFile]: ReadWorkspaceFileResult;
  [IPC_CHANNELS.applyWorkspaceFile]: ApplyWorkspaceFileResult;
}
