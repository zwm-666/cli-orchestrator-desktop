import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type {
  BrowseWorkspaceInput,
  BrowseWorkspaceResult,
  CancelOrchestrationInput,
  CancelRunInput,
  CreateDraftConversationInput,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  GetNextClaudeTaskResult,
  PlanDraftInput,
  ReadWorkspaceFileInput,
  ReadWorkspaceFileResult,
  RendererContinuityState,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveProjectContextInput,
  SaveSkillInput,
  SaveWorkbenchStateInput,
  StartOrchestrationInput,
  UpdateRoutingSettingsInput,
  StartRunInput,
} from '../shared/domain.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import type { SavePromptBuilderConfigInput } from '../shared/promptBuilder.js';
import { LocalPersistenceStore } from './persistence.js';
import { OrchestratorService } from './orchestratorService.js';
import { PromptBuilderConfigService } from './services/promptBuilderConfigService.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..', '..');
const electronDataDir = path.resolve(rootDir, '.cli-orchestrator', 'electron-data');
const preloadPath = path.resolve(rootDir, 'dist/preload/preload.js');
const rendererHtmlPath = path.resolve(rootDir, 'dist/renderer/index.html');
const WORKSPACE_IGNORED_NAMES = new Set(['.cli-orchestrator', '.git', 'dist', 'node_modules', 'release']);
const WORKSPACE_PREVIEW_BYTE_LIMIT = 256 * 1024;

app.setPath('userData', electronDataDir);
app.setPath('sessionData', path.resolve(electronDataDir, 'session'));

const persistenceStore = new LocalPersistenceStore(rootDir);
const orchestratorService = new OrchestratorService(rootDir, persistenceStore);
const promptBuilderConfigService = new PromptBuilderConfigService(rootDir);

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

const normalizeWorkspaceRelativePath = (relativePath: string | null | undefined): string => {
  const candidatePath = (relativePath ?? '').replace(/\\/g, '/').trim();

  if (!candidatePath) {
    return '';
  }

  const normalizedPath = path.posix.normalize(candidatePath).replace(/^\.\//, '');

  if (normalizedPath === '.' || normalizedPath === '') {
    return '';
  }

  if (normalizedPath === '..' || normalizedPath.startsWith('../')) {
    throw new Error('Workspace browsing is restricted to the repository root.');
  }

  return normalizedPath;
};

const resolveWorkspacePath = (relativePath: string): string => {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  const absolutePath = path.resolve(rootDir, normalizedPath);

  if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error('Workspace browsing is restricted to the repository root.');
  }

  return absolutePath;
};

const getParentWorkspacePath = (relativePath: string): string | null => {
  if (!relativePath) {
    return null;
  }

  const parentPath = path.posix.dirname(relativePath);

  return parentPath === '.' ? null : parentPath;
};

const browseWorkspace = async (input: BrowseWorkspaceInput): Promise<BrowseWorkspaceResult> => {
  const currentPath = normalizeWorkspaceRelativePath(input.relativePath);
  const absolutePath = resolveWorkspacePath(currentPath);
  const currentStats = await stat(absolutePath);

  if (!currentStats.isDirectory()) {
    throw new Error('Only directories can be browsed in the workbench explorer.');
  }

  const directoryEntries = await readdir(absolutePath, { withFileTypes: true });
  const entries = directoryEntries
    .filter((entry) => !WORKSPACE_IGNORED_NAMES.has(entry.name))
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => {
      const relativeEntryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      const extension = entry.isFile() ? path.extname(entry.name) || null : null;

      return {
        name: entry.name,
        relativePath: relativeEntryPath,
        type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
        extension,
      };
    })
    .sort((leftEntry, rightEntry) => {
      if (leftEntry.type !== rightEntry.type) {
        return leftEntry.type === 'directory' ? -1 : 1;
      }

      return leftEntry.name.localeCompare(rightEntry.name);
    });

  return {
    rootLabel: path.basename(rootDir),
    currentPath,
    parentPath: getParentWorkspacePath(currentPath),
    entries,
  };
};

const readWorkspaceFile = async (input: ReadWorkspaceFileInput): Promise<ReadWorkspaceFileResult> => {
  const relativePath = normalizeWorkspaceRelativePath(input.relativePath);

  if (!relativePath) {
    throw new Error('Select a file inside the repository to preview it.');
  }

  const absolutePath = resolveWorkspacePath(relativePath);
  const fileStats = await stat(absolutePath);

  if (!fileStats.isFile()) {
    throw new Error('Only text files can be previewed in the workbench.');
  }

  const byteLength = Math.min(fileStats.size, WORKSPACE_PREVIEW_BYTE_LIMIT);
  const fileHandle = await open(absolutePath, 'r');

  try {
    const buffer = Buffer.alloc(byteLength);
    await fileHandle.read(buffer, 0, byteLength, 0);

    if (buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)) {
      throw new Error('Binary files cannot be previewed in the workbench.');
    }

    return {
      rootLabel: path.basename(rootDir),
      relativePath,
      content: buffer.toString('utf8'),
      truncated: fileStats.size > WORKSPACE_PREVIEW_BYTE_LIMIT,
      totalBytes: fileStats.size,
    };
  } finally {
    await fileHandle.close();
  }
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
      sandbox: false,
    },
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

  ipcMain.handle(IPC_CHANNELS.getProjectContext, () => {
    return orchestratorService.getProjectContext();
  });

  ipcMain.handle(IPC_CHANNELS.saveProjectContext, (_event, input: SaveProjectContextInput) => {
    return orchestratorService.saveProjectContext(input);
  });

  ipcMain.handle(IPC_CHANNELS.saveWorkbenchState, (_event, input: SaveWorkbenchStateInput) => {
    return orchestratorService.saveWorkbenchState(input);
  });

  ipcMain.handle(IPC_CHANNELS.getPromptBuilderConfig, () => {
    return promptBuilderConfigService.loadConfig();
  });

  ipcMain.handle(IPC_CHANNELS.savePromptBuilderConfig, (_event, input: SavePromptBuilderConfigInput) => {
    return promptBuilderConfigService.saveConfig(input.config);
  });

  ipcMain.handle(IPC_CHANNELS.getNextClaudeTask, (): GetNextClaudeTaskResult => {
    return { nextTask: orchestratorService.getNextClaudeTask() };
  });

  ipcMain.handle(IPC_CHANNELS.createDraftConversation, (_event, input: CreateDraftConversationInput) => {
    return orchestratorService.createDraftConversation(input);
  });

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
    orchestratorService.deleteAgentProfile(input);
  });

  // --- Skill channels ---

  ipcMain.handle(IPC_CHANNELS.getSkills, () => {
    return orchestratorService.getSkills();
  });

  ipcMain.handle(IPC_CHANNELS.saveSkill, (_event, input: SaveSkillInput) => {
    return orchestratorService.saveSkill(input);
  });

  ipcMain.handle(IPC_CHANNELS.deleteSkill, (_event, input: DeleteSkillInput) => {
    orchestratorService.deleteSkill(input);
  });

  // --- MCP server channels ---

  ipcMain.handle(IPC_CHANNELS.getMcpServers, () => {
    return orchestratorService.getMcpServers();
  });

  ipcMain.handle(IPC_CHANNELS.saveMcpServer, (_event, input: SaveMcpServerInput) => {
    return orchestratorService.saveMcpServer(input);
  });

  ipcMain.handle(IPC_CHANNELS.deleteMcpServer, (_event, input: DeleteMcpServerInput) => {
    orchestratorService.deleteMcpServer(input);
  });

  ipcMain.handle(IPC_CHANNELS.browseWorkspace, (_event, input: BrowseWorkspaceInput) => {
    return browseWorkspace(input);
  });

  ipcMain.handle(IPC_CHANNELS.readWorkspaceFile, (_event, input: ReadWorkspaceFileInput) => {
    return readWorkspaceFile(input);
  });
};

void app.whenReady().then(async () => {
  registerIpc();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
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
    `The application encountered an unexpected error.\n\n${error.message}\n\nThe app may need to be restarted.`,
  );
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('[main] Unhandled promise rejection:', reason);
  dialog.showErrorBox(
    'CLI Orchestrator — Unhandled Rejection',
    `An async operation failed unexpectedly.\n\n${message}`,
  );
});
