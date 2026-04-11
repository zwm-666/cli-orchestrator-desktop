import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type {
  CancelOrchestrationInput,
  CancelRunInput,
  CreateDraftConversationInput,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  PlanDraftInput,
  RendererContinuityState,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveSkillInput,
  StartOrchestrationInput,
  UpdateRoutingSettingsInput,
  StartRunInput
} from '../shared/domain.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { LocalPersistenceStore } from './persistence.js';
import { OrchestratorService } from './orchestratorService.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..', '..');
const electronDataDir = path.resolve(rootDir, '.cli-orchestrator', 'electron-data');
const preloadPath = path.resolve(rootDir, 'dist/preload/preload.js');
const rendererHtmlPath = path.resolve(rootDir, 'dist/renderer/index.html');

app.setPath('userData', electronDataDir);
app.setPath('sessionData', path.resolve(electronDataDir, 'session'));

const persistenceStore = new LocalPersistenceStore(rootDir);
const orchestratorService = new OrchestratorService(rootDir, persistenceStore);

const broadcastState = (): void => {
  const snapshot = orchestratorService.getAppState();

  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.appStateUpdated, snapshot);
  });
};

const broadcastRunEvent = (runEvent: import('../shared/domain.js').RunEvent): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.runEvent, runEvent);
  });
};

const createMainWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0f172a',
    title: 'CLI Orchestrator',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return window;
  }

  await window.loadFile(rendererHtmlPath);
  return window;
};

const registerIpc = (): void => {
  orchestratorService.onStateChanged(() => {
    broadcastState();
  });

  orchestratorService.onRunEvent((runEvent) => {
    broadcastRunEvent(runEvent);
  });

  // --- Existing channels ---

  ipcMain.handle(IPC_CHANNELS.getAppState, () => {
    return orchestratorService.getAppState();
  });

  ipcMain.handle(IPC_CHANNELS.refreshAdapters, () => {
    return orchestratorService.refreshAdapters();
  });

  ipcMain.handle(IPC_CHANNELS.getContinuityState, () => {
    return persistenceStore.getContinuityState();
  });

  ipcMain.handle(IPC_CHANNELS.saveContinuityState, (_event, state: RendererContinuityState) => {
    return persistenceStore.saveContinuityState(state);
  });

  ipcMain.handle(IPC_CHANNELS.getRoutingSettings, () => {
    return orchestratorService.getRoutingSettings();
  });

  ipcMain.handle(IPC_CHANNELS.saveRoutingSettings, (_event, input: UpdateRoutingSettingsInput) => {
    return orchestratorService.updateRoutingSettings(input.settings);
  });

  ipcMain.handle(
    IPC_CHANNELS.createDraftConversation,
    (_event, input: CreateDraftConversationInput) => {
      return orchestratorService.createDraftConversation(input);
    }
  );

  ipcMain.handle(IPC_CHANNELS.createPlanDraft, (_event, input: PlanDraftInput) => {
    return orchestratorService.createPlanDraft(input);
  });

  ipcMain.handle(IPC_CHANNELS.startRun, (_event, input: StartRunInput) => {
    return orchestratorService.startRun(input);
  });

  ipcMain.handle(IPC_CHANNELS.cancelRun, (_event, input: CancelRunInput) => {
    return orchestratorService.cancelRun(input);
  });

  ipcMain.handle(IPC_CHANNELS.getRecentRunsByCategory, (_event, input: { taskType: string; limit?: number }) => {
    return orchestratorService.getRecentRunsByCategory(input.taskType, input.limit);
  });

  // --- Orchestration channels ---

  ipcMain.handle(IPC_CHANNELS.startOrchestration, (_event, input: StartOrchestrationInput) => {
    return orchestratorService.startOrchestration(input);
  });

  ipcMain.handle(IPC_CHANNELS.cancelOrchestration, (_event, input: CancelOrchestrationInput) => {
    return orchestratorService.cancelOrchestration(input);
  });

  ipcMain.handle(IPC_CHANNELS.getOrchestrationRun, (_event, input: GetOrchestrationRunInput) => {
    return orchestratorService.getOrchestrationRun(input);
  });

  // --- Agent profile channels ---

  ipcMain.handle(IPC_CHANNELS.getAgentProfiles, () => {
    return orchestratorService.getAgentProfiles();
  });

  ipcMain.handle(IPC_CHANNELS.saveAgentProfile, (_event, input: SaveAgentProfileInput) => {
    return orchestratorService.saveAgentProfile(input);
  });

  ipcMain.handle(IPC_CHANNELS.deleteAgentProfile, (_event, input: DeleteAgentProfileInput) => {
    return orchestratorService.deleteAgentProfile(input);
  });

  // --- Skill channels ---

  ipcMain.handle(IPC_CHANNELS.getSkills, () => {
    return orchestratorService.getSkills();
  });

  ipcMain.handle(IPC_CHANNELS.saveSkill, (_event, input: SaveSkillInput) => {
    return orchestratorService.saveSkill(input);
  });

  ipcMain.handle(IPC_CHANNELS.deleteSkill, (_event, input: DeleteSkillInput) => {
    return orchestratorService.deleteSkill(input);
  });

  // --- MCP server channels ---

  ipcMain.handle(IPC_CHANNELS.getMcpServers, () => {
    return orchestratorService.getMcpServers();
  });

  ipcMain.handle(IPC_CHANNELS.saveMcpServer, (_event, input: SaveMcpServerInput) => {
    return orchestratorService.saveMcpServer(input);
  });

  ipcMain.handle(IPC_CHANNELS.deleteMcpServer, (_event, input: DeleteMcpServerInput) => {
    return orchestratorService.deleteMcpServer(input);
  });
};

app.whenReady().then(async () => {
  registerIpc();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error);
  dialog.showErrorBox(
    'CLI Orchestrator — Unexpected Error',
    `The application encountered an unexpected error.\n\n${error.message}\n\nThe app may need to be restarted.`
  );
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('[main] Unhandled promise rejection:', reason);
  dialog.showErrorBox(
    'CLI Orchestrator — Unhandled Rejection',
    `An async operation failed unexpectedly.\n\n${message}`
  );
});
