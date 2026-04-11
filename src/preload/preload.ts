import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProfile,
  AppState,
  CancelOrchestrationInput,
  CancelRunInput,
  CategoryRunSummary,
  CreateDraftConversationInput,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  GetOrchestrationRunResult,
  McpServerDefinition,
  PlanDraftInput,
  PlanDraftResult,
  RendererContinuityState,
  RoutingSettings,
  RunEvent,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveSkillInput,
  SkillDefinition,
  StartOrchestrationInput,
  StartRunInput,
  TaskType,
  UpdateRoutingSettingsInput
} from '../shared/domain.js';
import { type DesktopApi, IPC_CHANNELS } from '../shared/ipc.js';

const subscribe = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => {
    listener(payload);
  };

  ipcRenderer.on(channel, wrapped);

  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
};

const desktopApi: DesktopApi = {
  // Existing methods
  getAppState: () => ipcRenderer.invoke(IPC_CHANNELS.getAppState),
  refreshAdapters: (): Promise<AppState> => ipcRenderer.invoke(IPC_CHANNELS.refreshAdapters),
  getContinuityState: (): Promise<RendererContinuityState> =>
    ipcRenderer.invoke(IPC_CHANNELS.getContinuityState),
  saveContinuityState: (state: RendererContinuityState): Promise<RendererContinuityState> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveContinuityState, state),
  getRoutingSettings: (): Promise<RoutingSettings> => ipcRenderer.invoke(IPC_CHANNELS.getRoutingSettings),
  saveRoutingSettings: (input: UpdateRoutingSettingsInput): Promise<RoutingSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveRoutingSettings, input),
  createDraftConversation: (input: CreateDraftConversationInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.createDraftConversation, input),
  createPlanDraft: (input: PlanDraftInput): Promise<PlanDraftResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.createPlanDraft, input),
  startRun: (input: StartRunInput) => ipcRenderer.invoke(IPC_CHANNELS.startRun, input),
  cancelRun: (input: CancelRunInput) => ipcRenderer.invoke(IPC_CHANNELS.cancelRun, input),
  getRecentRunsByCategory: (input: { taskType: TaskType; limit?: number }): Promise<CategoryRunSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.getRecentRunsByCategory, input),
  onAppStateChanged: (listener: (state: AppState) => void) =>
    subscribe<AppState>(IPC_CHANNELS.appStateUpdated, listener),
  onRunEvent: (listener: (event: RunEvent) => void) => subscribe<RunEvent>(IPC_CHANNELS.runEvent, listener),

  // Orchestration methods
  startOrchestration: (input: StartOrchestrationInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.startOrchestration, input),
  cancelOrchestration: (input: CancelOrchestrationInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelOrchestration, input),
  getOrchestrationRun: (input: GetOrchestrationRunInput): Promise<GetOrchestrationRunResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.getOrchestrationRun, input),

  // Agent profile methods
  getAgentProfiles: (): Promise<AgentProfile[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getAgentProfiles),
  saveAgentProfile: (input: SaveAgentProfileInput): Promise<AgentProfile> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAgentProfile, input),
  deleteAgentProfile: (input: DeleteAgentProfileInput): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteAgentProfile, input),

  // Skill methods
  getSkills: (): Promise<SkillDefinition[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getSkills),
  saveSkill: (input: SaveSkillInput): Promise<SkillDefinition> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveSkill, input),
  deleteSkill: (input: DeleteSkillInput): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteSkill, input),

  // MCP server methods
  getMcpServers: (): Promise<McpServerDefinition[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getMcpServers),
  saveMcpServer: (input: SaveMcpServerInput): Promise<McpServerDefinition> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveMcpServer, input),
  deleteMcpServer: (input: DeleteMcpServerInput): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteMcpServer, input)
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
