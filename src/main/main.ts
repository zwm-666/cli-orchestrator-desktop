import { mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type {
  BrowseWorkspaceInput,
  BrowseWorkspaceResult,
  GetNextClaudeTaskResult,
  ReadWorkspaceFileInput,
  ReadWorkspaceFileResult,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveSkillInput,
} from '../shared/domain.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  formatIpcErrorMessage,
  validateBrowseWorkspaceInput,
  validateCancelOrchestrationInput,
  validateCancelRunInput,
  validateDeleteAgentProfileInput,
  validateDeleteMcpServerInput,
  validateDeleteSkillInput,
  validateDraftConversationInput,
  validateGetOrchestrationRunInput,
  validateObjectInput,
  validatePlanDraftInput,
  validateProjectContextInput,
  validateSaveAiConfigInput,
  validatePromptBuilderSaveInput,
  validateReadWorkspaceFileInput,
  validateRecentRunsInput,
  validateRoutingSettingsInput,
  validateSaveContinuityStateInput,
  validateStartOrchestrationInput,
  validateStartRunInput,
  validateWorkbenchStateInput,
} from './ipcValidation.js';
import { LocalPersistenceStore } from './persistence.js';
import { OrchestratorService } from './orchestratorService.js';
import { PromptBuilderConfigService } from './services/promptBuilderConfigService.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '..', '..');
const electronDataDir = path.resolve(rootDir, '.cli-orchestrator', 'electron-data');
const preloadPath = path.resolve(rootDir, 'dist/preload/preload.cjs');
const rendererHtmlPath = path.resolve(rootDir, 'dist/renderer/index.html');
const WORKSPACE_IGNORED_NAMES = new Set(['.cli-orchestrator', '.git', 'dist', 'node_modules', 'release']);
const WORKSPACE_PREVIEW_BYTE_LIMIT = 256 * 1024;

app.setPath('userData', electronDataDir);
app.setPath('sessionData', path.resolve(electronDataDir, 'session'));

const persistenceStore = new LocalPersistenceStore(rootDir);
const orchestratorService = new OrchestratorService(rootDir, persistenceStore);
const promptBuilderConfigService = new PromptBuilderConfigService(rootDir);
const aiConfigFilePath = path.resolve(app.getPath('userData'), 'ai-config.json');
let lastBroadcastState = orchestratorService.getAppState();

const isJsonObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const loadPersistedAiConfig = async (): Promise<Record<string, unknown> | null> => {
  try {
    const content = await readFile(aiConfigFilePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    return isJsonObject(parsed) ? parsed : null;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const savePersistedAiConfig = async (config: Record<string, unknown>): Promise<void> => {
  await mkdir(path.dirname(aiConfigFilePath), { recursive: true });
  await writeFile(aiConfigFilePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
};

const hasMeaningfulChange = (left: unknown, right: unknown): boolean => {
  return JSON.stringify(left) !== JSON.stringify(right);
};

const createAppStatePatch = (previousState: import('../shared/domain.js').AppState, nextState: import('../shared/domain.js').AppState): Partial<import('../shared/domain.js').AppState> => {
  const patch = {} as Partial<import('../shared/domain.js').AppState>;
  const mutablePatch = patch as Record<string, unknown>;
  const entries = [
    'adapters',
    'conversations',
    'tasks',
    'runs',
    'projectContext',
    'nextClaudeTask',
    'agentProfiles',
    'skills',
    'mcpServers',
    'orchestrationRuns',
    'orchestrationNodes',
    'workbench',
  ] as (keyof import('../shared/domain.js').AppState)[];

  for (const key of entries) {
    if (hasMeaningfulChange(previousState[key], nextState[key])) {
      mutablePatch[key] = nextState[key];
    }
  }

  return patch;
};

const broadcastState = (): void => {
  const snapshot = orchestratorService.getAppState();
  const patch = createAppStatePatch(lastBroadcastState, snapshot);
  lastBroadcastState = snapshot;

  if (Object.keys(patch).length === 0) {
    return;
  }

  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.appStateUpdated, patch);
  });
};

const safeHandle = <TInput, TResult>(
  validator: (value: unknown) => TInput,
  handler: (input: TInput) => TResult | Promise<TResult>,
): ((event: Electron.IpcMainInvokeEvent, input: unknown) => Promise<TResult>) => {
  return async (_event, input) => {
    try {
      return await handler(validator(input));
    } catch (error: unknown) {
      throw new Error(formatIpcErrorMessage(error), { cause: error });
    }
  };
};

const safeNoInputHandle = <TResult>(handler: () => TResult | Promise<TResult>): (() => Promise<TResult>) => {
  return async () => {
    try {
      return await handler();
    } catch (error: unknown) {
      throw new Error(formatIpcErrorMessage(error), { cause: error });
    }
  };
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
      sandbox: true,
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

  ipcMain.handle(IPC_CHANNELS.getAppState, safeNoInputHandle(() => {
    return orchestratorService.getAppState();
  }));

  ipcMain.handle(IPC_CHANNELS.refreshAdapters, safeNoInputHandle(() => {
    return orchestratorService.refreshAdapters();
  }));

  ipcMain.handle(IPC_CHANNELS.getContinuityState, safeNoInputHandle(() => {
    return persistenceStore.getContinuityState();
  }));

  ipcMain.handle(IPC_CHANNELS.saveContinuityState, safeHandle(validateSaveContinuityStateInput, (state) => {
    return persistenceStore.saveContinuityState(state);
  }));

  ipcMain.handle(IPC_CHANNELS.getRoutingSettings, safeNoInputHandle(() => {
    return orchestratorService.getRoutingSettings();
  }));

  ipcMain.handle(IPC_CHANNELS.saveRoutingSettings, safeHandle(validateRoutingSettingsInput, (input) => {
    return orchestratorService.updateRoutingSettings(input.settings);
  }));

  ipcMain.handle(IPC_CHANNELS.getProjectContext, safeNoInputHandle(() => {
    return orchestratorService.getProjectContext();
  }));

  ipcMain.handle(IPC_CHANNELS.saveProjectContext, safeHandle(validateProjectContextInput, (input) => {
    return orchestratorService.saveProjectContext(input);
  }));

  ipcMain.handle(IPC_CHANNELS.saveWorkbenchState, safeHandle(validateWorkbenchStateInput, (input) => {
    return orchestratorService.saveWorkbenchState(input);
  }));

  ipcMain.handle(IPC_CHANNELS.getPromptBuilderConfig, safeNoInputHandle(() => {
    return promptBuilderConfigService.loadConfig();
  }));

  ipcMain.handle(IPC_CHANNELS.savePromptBuilderConfig, safeHandle(validatePromptBuilderSaveInput, (input) => {
    return promptBuilderConfigService.saveConfig(input.config);
  }));

  ipcMain.handle(IPC_CHANNELS.loadAiConfig, safeNoInputHandle(() => {
    return loadPersistedAiConfig();
  }));

  ipcMain.handle(IPC_CHANNELS.saveAiConfig, safeHandle(validateSaveAiConfigInput, async (input) => {
    await savePersistedAiConfig(input.config);
  }));

  ipcMain.handle(IPC_CHANNELS.getNextClaudeTask, safeNoInputHandle((): GetNextClaudeTaskResult => {
    return { nextTask: orchestratorService.getNextClaudeTask() };
  }));

  ipcMain.handle(IPC_CHANNELS.createDraftConversation, safeHandle(validateDraftConversationInput, (input) => {
    return orchestratorService.createDraftConversation(input);
  }));

  ipcMain.handle(IPC_CHANNELS.createPlanDraft, safeHandle(validatePlanDraftInput, (input) => {
    return orchestratorService.createPlanDraft(input);
  }));

  ipcMain.handle(IPC_CHANNELS.startRun, safeHandle(validateStartRunInput, (input) => {
    return orchestratorService.startRun(input);
  }));

  ipcMain.handle(IPC_CHANNELS.cancelRun, safeHandle(validateCancelRunInput, (input) => {
    return orchestratorService.cancelRun(input);
  }));

  ipcMain.handle(IPC_CHANNELS.getRecentRunsByCategory, safeHandle(validateRecentRunsInput, (input) => {
    return orchestratorService.getRecentRunsByCategory(input.taskType, input.limit);
  }));

  // --- Orchestration channels ---

  ipcMain.handle(IPC_CHANNELS.startOrchestration, safeHandle(validateStartOrchestrationInput, (input) => {
    return orchestratorService.startOrchestration(input);
  }));

  ipcMain.handle(IPC_CHANNELS.cancelOrchestration, safeHandle(validateCancelOrchestrationInput, (input) => {
    return orchestratorService.cancelOrchestration(input);
  }));

  ipcMain.handle(IPC_CHANNELS.getOrchestrationRun, safeHandle(validateGetOrchestrationRunInput, (input) => {
    return orchestratorService.getOrchestrationRun(input);
  }));

  // --- Agent profile channels ---

  ipcMain.handle(IPC_CHANNELS.getAgentProfiles, safeNoInputHandle(() => {
    return orchestratorService.getAgentProfiles();
  }));

  ipcMain.handle(IPC_CHANNELS.saveAgentProfile, safeHandle((value) => validateObjectInput(value, 'save agent profile input') as unknown as SaveAgentProfileInput, (input) => {
    return orchestratorService.saveAgentProfile(input);
  }));

  ipcMain.handle(IPC_CHANNELS.deleteAgentProfile, safeHandle(validateDeleteAgentProfileInput, (input) => {
    orchestratorService.deleteAgentProfile(input);
  }));

  // --- Skill channels ---

  ipcMain.handle(IPC_CHANNELS.getSkills, safeNoInputHandle(() => {
    return orchestratorService.getSkills();
  }));

  ipcMain.handle(IPC_CHANNELS.saveSkill, safeHandle((value) => validateObjectInput(value, 'save skill input') as unknown as SaveSkillInput, (input) => {
    return orchestratorService.saveSkill(input);
  }));

  ipcMain.handle(IPC_CHANNELS.deleteSkill, safeHandle(validateDeleteSkillInput, (input) => {
    orchestratorService.deleteSkill(input);
  }));

  // --- MCP server channels ---

  ipcMain.handle(IPC_CHANNELS.getMcpServers, safeNoInputHandle(() => {
    return orchestratorService.getMcpServers();
  }));

  ipcMain.handle(IPC_CHANNELS.saveMcpServer, safeHandle((value) => validateObjectInput(value, 'save mcp server input') as unknown as SaveMcpServerInput, (input) => {
    return orchestratorService.saveMcpServer(input);
  }));

  ipcMain.handle(IPC_CHANNELS.deleteMcpServer, safeHandle(validateDeleteMcpServerInput, (input) => {
    orchestratorService.deleteMcpServer(input);
  }));

  ipcMain.handle(IPC_CHANNELS.browseWorkspace, safeHandle(validateBrowseWorkspaceInput, (input) => {
    return browseWorkspace(input);
  }));

  ipcMain.handle(IPC_CHANNELS.readWorkspaceFile, safeHandle(validateReadWorkspaceFileInput, (input) => {
    return readWorkspaceFile(input);
  }));
};

void app.whenReady().then(async () => {
  registerIpc();
  await promptBuilderConfigService.loadConfig();
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
