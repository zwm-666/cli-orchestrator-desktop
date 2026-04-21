import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  AppState,
  BrowseWorkspaceInput,
  BrowseWorkspaceResult,
  CancelOrchestrationInput,
  CancelRunInput,
  CategoryRunSummary,
  CreateDraftConversationInput,
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
  SkillDefinition,
  StartOrchestrationInput,
  StartRunInput,
  TaskType,
  UpdateRoutingSettingsInput,
} from '../shared/domain.js';
import { type DesktopApi, IPC_CHANNELS } from '../shared/ipc.js';
import type { PromptBuilderConfig, SavePromptBuilderConfigInput } from '../shared/promptBuilder.js';

const desktopApi: DesktopApi = {
  // Existing methods
  getAppState: () => ipcRenderer.invoke(IPC_CHANNELS.getAppState),
  refreshAdapters: (): Promise<AppState> => ipcRenderer.invoke(IPC_CHANNELS.refreshAdapters),
  getContinuityState: (): Promise<RendererContinuityState> => ipcRenderer.invoke(IPC_CHANNELS.getContinuityState),
  saveContinuityState: (state: RendererContinuityState): Promise<RendererContinuityState> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveContinuityState, state),
  getRoutingSettings: (): Promise<RoutingSettings> => ipcRenderer.invoke(IPC_CHANNELS.getRoutingSettings),
  saveRoutingSettings: (input: UpdateRoutingSettingsInput): Promise<RoutingSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveRoutingSettings, input),
  getProjectContext: (): Promise<ProjectContextState> => ipcRenderer.invoke(IPC_CHANNELS.getProjectContext),
  saveProjectContext: (input: SaveProjectContextInput): Promise<ProjectContextState> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProjectContext, input),
  saveWorkbenchState: (input: SaveWorkbenchStateInput): Promise<AppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveWorkbenchState, input),
  getPromptBuilderConfig: (): Promise<PromptBuilderConfig> => ipcRenderer.invoke(IPC_CHANNELS.getPromptBuilderConfig),
  savePromptBuilderConfig: (input: SavePromptBuilderConfigInput): Promise<PromptBuilderConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.savePromptBuilderConfig, input),
  getNextClaudeTask: (): Promise<GetNextClaudeTaskResult> => ipcRenderer.invoke(IPC_CHANNELS.getNextClaudeTask),
  createDraftConversation: (input: CreateDraftConversationInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createDraftConversation, input),
  createPlanDraft: (input: PlanDraftInput): Promise<PlanDraftResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.createPlanDraft, input),
  startRun: (input: StartRunInput) => ipcRenderer.invoke(IPC_CHANNELS.startRun, input),
  cancelRun: (input: CancelRunInput) => ipcRenderer.invoke(IPC_CHANNELS.cancelRun, input),
  getRecentRunsByCategory: (input: { taskType: TaskType; limit?: number }): Promise<CategoryRunSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.getRecentRunsByCategory, input),
  onAppStateChanged: (listener: (state: AppState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: AppState): void => { listener(state); };
    ipcRenderer.on(IPC_CHANNELS.appStateUpdated, wrapped);
    return (): void => { ipcRenderer.removeListener(IPC_CHANNELS.appStateUpdated, wrapped); };
  },
  onRunEvent: (listener: (event: RunEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, event: RunEvent): void => { listener(event); };
    ipcRenderer.on(IPC_CHANNELS.runEvent, wrapped);
    return (): void => { ipcRenderer.removeListener(IPC_CHANNELS.runEvent, wrapped); };
  },

  // Orchestration methods
  startOrchestration: (input: StartOrchestrationInput) => ipcRenderer.invoke(IPC_CHANNELS.startOrchestration, input),
  cancelOrchestration: (input: CancelOrchestrationInput) => ipcRenderer.invoke(IPC_CHANNELS.cancelOrchestration, input),
  getOrchestrationRun: (input: GetOrchestrationRunInput): Promise<GetOrchestrationRunResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.getOrchestrationRun, input),

  // Agent profile methods
  getAgentProfiles: (): Promise<AgentProfile[]> => ipcRenderer.invoke(IPC_CHANNELS.getAgentProfiles),
  saveAgentProfile: (input: SaveAgentProfileInput): Promise<AgentProfile> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAgentProfile, input),
  deleteAgentProfile: (input: DeleteAgentProfileInput): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteAgentProfile, input),

  // Skill methods
  getSkills: (): Promise<SkillDefinition[]> => ipcRenderer.invoke(IPC_CHANNELS.getSkills),
  saveSkill: (input: SaveSkillInput): Promise<SkillDefinition> => ipcRenderer.invoke(IPC_CHANNELS.saveSkill, input),
  deleteSkill: (input: DeleteSkillInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteSkill, input),

  // MCP server methods
  getMcpServers: (): Promise<McpServerDefinition[]> => ipcRenderer.invoke(IPC_CHANNELS.getMcpServers),
  saveMcpServer: (input: SaveMcpServerInput): Promise<McpServerDefinition> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveMcpServer, input),
  deleteMcpServer: (input: DeleteMcpServerInput): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteMcpServer, input),
  browseWorkspace: (input: BrowseWorkspaceInput): Promise<BrowseWorkspaceResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.browseWorkspace, input),
  readWorkspaceFile: (input: ReadWorkspaceFileInput): Promise<ReadWorkspaceFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.readWorkspaceFile, input),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
