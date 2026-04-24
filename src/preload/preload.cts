const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

import type {
  AgentProfile,
  ApplyWorkspaceFileInput,
  ApplyWorkspaceFileResult,
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
  SelectWorkspaceFolderResult,
  SkillDefinition,
  StartOrchestrationInput,
  StartRunInput,
  TaskType,
  UpdateRoutingSettingsInput,
  WriteWorkspaceFileInput,
  WriteWorkspaceFileResult,
} from '../shared/domain.js';
import type { DesktopApi } from '../shared/ipc.js';
import type { SaveAiConfigInput } from '../shared/ipc.js';
import type { PromptBuilderConfig, SavePromptBuilderConfigInput } from '../shared/promptBuilder.js';

const IPC_CHANNELS = {
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
  startOrchestration: 'orchestration:start',
  cancelOrchestration: 'orchestration:cancel',
  getOrchestrationRun: 'orchestration:get-run',
  getAgentProfiles: 'agent:get-profiles',
  saveAgentProfile: 'agent:save-profile',
  deleteAgentProfile: 'agent:delete-profile',
  getSkills: 'skill:get-all',
  saveSkill: 'skill:save',
  deleteSkill: 'skill:delete',
  getMcpServers: 'mcp:get-servers',
  saveMcpServer: 'mcp:save-server',
  deleteMcpServer: 'mcp:delete-server',
  browseWorkspace: 'workspace:browse',
  selectProjectFolder: 'project:select-folder',
  selectWorkspaceFolder: 'workspace:select-folder',
  readWorkspaceFile: 'workspace:read-file',
  writeWorkspaceFile: 'workspace:write-file',
  applyWorkspaceFile: 'workspace:apply-to-file',
} as const;

const desktopApi: DesktopApi = {
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
  loadAiConfig: (): Promise<Record<string, unknown> | null> => ipcRenderer.invoke(IPC_CHANNELS.loadAiConfig),
  saveAiConfig: (input: SaveAiConfigInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.saveAiConfig, input),
  getNextClaudeTask: (): Promise<GetNextClaudeTaskResult> => ipcRenderer.invoke(IPC_CHANNELS.getNextClaudeTask),
  createDraftConversation: (input: CreateDraftConversationInput) => ipcRenderer.invoke(IPC_CHANNELS.createDraftConversation, input),
  createPlanDraft: (input: PlanDraftInput): Promise<PlanDraftResult> => ipcRenderer.invoke(IPC_CHANNELS.createPlanDraft, input),
  startRun: (input: StartRunInput) => ipcRenderer.invoke(IPC_CHANNELS.startRun, input),
  cancelRun: (input: CancelRunInput) => ipcRenderer.invoke(IPC_CHANNELS.cancelRun, input),
  getRecentRunsByCategory: (input: { taskType: TaskType; limit?: number }): Promise<CategoryRunSummary> =>
    ipcRenderer.invoke(IPC_CHANNELS.getRecentRunsByCategory, input),
  onAppStateChanged: (listener: (statePatch: Partial<AppState>) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, statePatch: Partial<AppState>): void => {
      listener(statePatch);
    };
    ipcRenderer.on(IPC_CHANNELS.appStateUpdated, wrapped);
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.appStateUpdated, wrapped);
    };
  },
  onRunEvent: (listener: (event: RunEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, event: RunEvent): void => {
      listener(event);
    };
    ipcRenderer.on(IPC_CHANNELS.runEvent, wrapped);
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.runEvent, wrapped);
    };
  },
  startOrchestration: (input: StartOrchestrationInput) => ipcRenderer.invoke(IPC_CHANNELS.startOrchestration, input),
  cancelOrchestration: (input: CancelOrchestrationInput) => ipcRenderer.invoke(IPC_CHANNELS.cancelOrchestration, input),
  getOrchestrationRun: (input: GetOrchestrationRunInput): Promise<GetOrchestrationRunResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.getOrchestrationRun, input),
  getAgentProfiles: (): Promise<AgentProfile[]> => ipcRenderer.invoke(IPC_CHANNELS.getAgentProfiles),
  saveAgentProfile: (input: SaveAgentProfileInput): Promise<AgentProfile> => ipcRenderer.invoke(IPC_CHANNELS.saveAgentProfile, input),
  deleteAgentProfile: (input: DeleteAgentProfileInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteAgentProfile, input),
  getSkills: (): Promise<SkillDefinition[]> => ipcRenderer.invoke(IPC_CHANNELS.getSkills),
  saveSkill: (input: SaveSkillInput): Promise<SkillDefinition> => ipcRenderer.invoke(IPC_CHANNELS.saveSkill, input),
  deleteSkill: (input: DeleteSkillInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteSkill, input),
  getMcpServers: (): Promise<McpServerDefinition[]> => ipcRenderer.invoke(IPC_CHANNELS.getMcpServers),
  saveMcpServer: (input: SaveMcpServerInput): Promise<McpServerDefinition> => ipcRenderer.invoke(IPC_CHANNELS.saveMcpServer, input),
  deleteMcpServer: (input: DeleteMcpServerInput): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.deleteMcpServer, input),
  browseWorkspace: (input: BrowseWorkspaceInput): Promise<BrowseWorkspaceResult> => ipcRenderer.invoke(IPC_CHANNELS.browseWorkspace, input),
  selectProjectFolder: (): Promise<SelectWorkspaceFolderResult> => ipcRenderer.invoke(IPC_CHANNELS.selectProjectFolder),
  selectWorkspaceFolder: (): Promise<SelectWorkspaceFolderResult> => ipcRenderer.invoke(IPC_CHANNELS.selectWorkspaceFolder),
  readWorkspaceFile: (input: ReadWorkspaceFileInput): Promise<ReadWorkspaceFileResult> => ipcRenderer.invoke(IPC_CHANNELS.readWorkspaceFile, input),
  writeWorkspaceFile: (input: WriteWorkspaceFileInput): Promise<WriteWorkspaceFileResult> => ipcRenderer.invoke(IPC_CHANNELS.writeWorkspaceFile, input),
  applyWorkspaceFile: (input: ApplyWorkspaceFileInput): Promise<ApplyWorkspaceFileResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.applyWorkspaceFile, input),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
