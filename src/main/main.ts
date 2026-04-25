import { mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type {
  ApplyWorkspaceFileInput,
  ApplyWorkspaceFileResult,
  BrowseWorkspaceInput,
  BrowseWorkspaceResult,
  CliAgentStreamEvent,
  GetNextClaudeTaskResult,
  ReadWorkspaceFileInput,
  ReadWorkspaceFileResult,
  SelectWorkspaceFolderResult,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveSkillInput,
  StartTerminalInput,
  StartTerminalResult,
  StopTerminalInput,
  TerminalEvent,
  WriteTerminalInput,
  WriteWorkspaceFileInput,
  WriteWorkspaceFileResult,
} from '../shared/domain.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import {
  formatIpcErrorMessage,
  validateApplyWorkspaceFileInput,
  validateBrowseWorkspaceInput,
  validateCallCliAgentInput,
  validateCancelOrchestrationInput,
  validateCliAgentRouteInput,
  validateCancelRunInput,
  validateDeleteAgentProfileInput,
  validateDeleteMcpServerInput,
  validateDeleteSkillInput,
  validateDraftConversationInput,
  validateGetOrchestrationRunInput,
  validateLocalToolCallInput,
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
  validateStartTerminalInput,
  validateStopTerminalInput,
  validateWriteTerminalInput,
  validateWorkbenchStateInput,
  validateWriteWorkspaceFileInput,
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
const WORKSPACE_WRITE_BYTE_LIMIT = 10 * 1024 * 1024;
const WORKSPACE_WRITE_LIMIT_LABEL = '10MB';

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
    'subagentStatuses',
    'localToolRegistry',
    'localToolCallLogs',
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

interface TerminalSession {
  id: string;
  shell: string;
  cwd: string;
  process: ChildProcessWithoutNullStreams;
}

const terminalSessions = new Map<string, TerminalSession>();

const createTerminalEvent = (
  sessionId: string,
  kind: TerminalEvent['kind'],
  stream: TerminalEvent['stream'],
  data: string,
  exitDetails: Pick<TerminalEvent, 'exitCode' | 'signal'> = {},
): TerminalEvent => ({
  sessionId,
  kind,
  stream,
  data,
  timestamp: new Date().toISOString(),
  ...exitDetails,
});

const broadcastTerminalEvent = (terminalEvent: TerminalEvent): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.terminalEvent, terminalEvent);
  });
};

const broadcastCliAgentEvent = (event: CliAgentStreamEvent): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC_CHANNELS.cliAgentEvent, event);
  });
};

const resolveTerminalShell = (): { shell: string; args: string[] } => {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: ['-NoLogo', '-NoExit'] };
  }

  return { shell: process.env.SHELL || '/bin/sh', args: ['-i'] };
};

const resolveTerminalCwd = async (cwd: string | null | undefined): Promise<string> => {
  const candidate = cwd?.trim() ? path.resolve(cwd) : rootDir;
  const candidateStat = await stat(candidate);
  if (!candidateStat.isDirectory()) {
    throw new Error('Terminal working directory must be a directory.');
  }

  return candidate;
};

const startTerminalSession = async (input: StartTerminalInput): Promise<StartTerminalResult> => {
  const cwd = await resolveTerminalCwd(input.cwd);
  const { shell, args } = resolveTerminalShell();
  const sessionId = `terminal-${Date.now()}-${randomUUID()}`;
  const child = spawn(shell, args, {
    cwd,
    env: process.env,
    detached: process.platform !== 'win32',
    shell: false,
    windowsHide: true,
  });

  const session: TerminalSession = { id: sessionId, shell, cwd, process: child };
  terminalSessions.set(sessionId, session);

  child.stdout.on('data', (chunk: Buffer) => {
    broadcastTerminalEvent(createTerminalEvent(sessionId, 'output', 'stdout', chunk.toString('utf8')));
  });

  child.stderr.on('data', (chunk: Buffer) => {
    broadcastTerminalEvent(createTerminalEvent(sessionId, 'output', 'stderr', chunk.toString('utf8')));
  });

  child.on('error', (error) => {
    broadcastTerminalEvent(createTerminalEvent(sessionId, 'error', 'system', error.message));
  });

  child.on('exit', (code, signal) => {
    terminalSessions.delete(sessionId);
    broadcastTerminalEvent(createTerminalEvent(
      sessionId,
      'exit',
      'system',
      `\n[terminal exited${typeof code === 'number' ? ` with code ${code}` : ''}${signal ? ` by ${signal}` : ''}]\n`,
      { exitCode: code, signal },
    ));
  });

  broadcastTerminalEvent(createTerminalEvent(sessionId, 'started', 'system', `[started ${shell} in ${cwd}]\n`));

  return { sessionId, shell, cwd };
};

const killTerminalProcessTree = (session: TerminalSession): void => {
  const pid = session.process.pid;
  if (typeof pid !== 'number') {
    session.process.kill();
    return;
  }

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    taskkill.on('error', () => {
      session.process.kill();
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    session.process.kill();
  }
};

const writeTerminalSession = (input: WriteTerminalInput): void => {
  const session = terminalSessions.get(input.sessionId);
  if (!session) {
    throw new Error('Terminal session is no longer running.');
  }

  session.process.stdin.write(input.data);
};

const stopTerminalSession = (input: StopTerminalInput): void => {
  const session = terminalSessions.get(input.sessionId);
  if (!session) {
    return;
  }

  terminalSessions.delete(input.sessionId);
  killTerminalProcessTree(session);
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
    throw new Error('Workspace access is restricted to the selected workspace root.');
  }

  return normalizedPath;
};

const resolveWorkspacePath = (workspaceRoot: string, relativePath: string): string => {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  const absolutePath = path.resolve(workspaceRoot, normalizedPath);

  if (absolutePath !== workspaceRoot && !absolutePath.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error('Workspace access is restricted to the selected workspace root.');
  }

  return absolutePath;
};

const getActiveWorkspaceRoot = async (preferredRoot?: string | null): Promise<string> => {
  const persistedRoot = preferredRoot?.trim() || orchestratorService.getWorkbenchWorkspaceRoot();
  const candidateRoot = persistedRoot ?? rootDir;

  try {
    const candidateStats = await stat(candidateRoot);
    if (candidateStats.isDirectory()) {
      return candidateRoot;
    }
  } catch {
    // fall through to rootDir fallback
  }

  if (persistedRoot) {
    orchestratorService.setWorkbenchWorkspaceRoot(null);
  }

  return rootDir;
};

const getParentWorkspacePath = (relativePath: string): string | null => {
  if (!relativePath) {
    return null;
  }

  const parentPath = path.posix.dirname(relativePath);

  return parentPath === '.' ? null : parentPath;
};

const browseWorkspace = async (input: BrowseWorkspaceInput): Promise<BrowseWorkspaceResult> => {
  const workspaceRoot = await getActiveWorkspaceRoot(input.workspaceRoot);
  const currentPath = normalizeWorkspaceRelativePath(input.relativePath);
  const absolutePath = resolveWorkspacePath(workspaceRoot, currentPath);
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
    rootLabel: path.basename(workspaceRoot),
    workspaceRoot,
    currentPath,
    parentPath: getParentWorkspacePath(currentPath),
    entries,
  };
};

const readWorkspaceFile = async (input: ReadWorkspaceFileInput): Promise<ReadWorkspaceFileResult> => {
  const workspaceRoot = await getActiveWorkspaceRoot(input.workspaceRoot);
  const relativePath = normalizeWorkspaceRelativePath(input.relativePath);

  if (!relativePath) {
    throw new Error('Select a file inside the workspace root to preview it.');
  }

  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
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
      rootLabel: path.basename(workspaceRoot),
      workspaceRoot,
      relativePath,
      content: buffer.toString('utf8'),
      truncated: fileStats.size > WORKSPACE_PREVIEW_BYTE_LIMIT,
      totalBytes: fileStats.size,
    };
  } finally {
    await fileHandle.close();
  }
};

const selectWorkspaceFolder = async (): Promise<SelectWorkspaceFolderResult> => {
  const currentRoot = orchestratorService.getWorkbenchWorkspaceRoot();
  const defaultPath = currentRoot ?? rootDir;
  const selection = await dialog.showOpenDialog({
    title: 'Select workspace root',
    defaultPath,
    properties: ['openDirectory'],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return {
      workspaceRoot: currentRoot,
      rootLabel: currentRoot ? path.basename(currentRoot) : null,
      wasChanged: false,
    };
  }

  const selectedPath = selection.filePaths[0] ?? null;
  if (!selectedPath) {
    return {
      workspaceRoot: currentRoot,
      rootLabel: currentRoot ? path.basename(currentRoot) : null,
      wasChanged: false,
    };
  }

  const wasChanged = selectedPath !== currentRoot;
  if (wasChanged) {
    orchestratorService.setWorkbenchWorkspaceRoot(selectedPath);
  }

  return {
    workspaceRoot: selectedPath,
    rootLabel: path.basename(selectedPath),
    wasChanged,
  };
};

const writeWorkspaceTextFile = async (
  input: WriteWorkspaceFileInput & { createIfMissing?: boolean },
  missingFileMessage: string,
): Promise<WriteWorkspaceFileResult> => {
  const workspaceRoot = await getActiveWorkspaceRoot(input.workspaceRoot);
  const relativePath = normalizeWorkspaceRelativePath(input.relativePath);

  if (!relativePath) {
    throw new Error('Select a file path inside the workspace root to save content.');
  }

  const byteLength = Buffer.byteLength(input.content, 'utf8');
  if (byteLength > WORKSPACE_WRITE_BYTE_LIMIT) {
    throw new Error(`File too large to write (limit: ${WORKSPACE_WRITE_LIMIT_LABEL})`);
  }

  const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);

  try {
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
      throw new Error('Only files can be updated by workspace apply.');
    }
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      if (!input.createIfMissing) {
        throw new Error(missingFileMessage);
      }
      await mkdir(path.dirname(absolutePath), { recursive: true });
    } else {
      throw error;
    }
  }

  await writeFile(absolutePath, input.content, 'utf8');

  return {
    rootLabel: path.basename(workspaceRoot),
    workspaceRoot,
    relativePath,
    bytesWritten: byteLength,
    savedAt: new Date().toISOString(),
  };
};

const writeWorkspaceFile = async (input: WriteWorkspaceFileInput): Promise<WriteWorkspaceFileResult> => {
  return writeWorkspaceTextFile(input, 'Target file does not exist.');
};

const applyWorkspaceFile = async (input: ApplyWorkspaceFileInput): Promise<ApplyWorkspaceFileResult> => {
  return writeWorkspaceTextFile(input, 'Target file does not exist. Enable createIfMissing to create it.');
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

  orchestratorService.onCliAgentEvent((event) => {
    broadcastCliAgentEvent(event);
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

  ipcMain.handle(IPC_CHANNELS.terminalStart, safeHandle(validateStartTerminalInput, (input) => {
    return startTerminalSession(input);
  }));

  ipcMain.handle(IPC_CHANNELS.terminalWrite, safeHandle(validateWriteTerminalInput, (input) => {
    writeTerminalSession(input);
  }));

  ipcMain.handle(IPC_CHANNELS.terminalStop, safeHandle(validateStopTerminalInput, (input) => {
    stopTerminalSession(input);
  }));

  ipcMain.handle(IPC_CHANNELS.refreshLocalTools, safeNoInputHandle(() => {
    return orchestratorService.refreshLocalTools();
  }));

  ipcMain.handle(IPC_CHANNELS.callLocalTool, safeHandle(validateLocalToolCallInput, (input) => {
    return orchestratorService.callLocalTool(input);
  }));

  ipcMain.handle(IPC_CHANNELS.decideCliAgentRoute, safeHandle(validateCliAgentRouteInput, (input) => {
    return orchestratorService.decideCliAgentRoute(input.prompt, input.context);
  }));

  ipcMain.handle(IPC_CHANNELS.callCliAgent, safeHandle(validateCallCliAgentInput, (input) => {
    return orchestratorService.callCliAgent(input);
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

  ipcMain.handle(IPC_CHANNELS.selectProjectFolder, safeNoInputHandle(() => {
    return selectWorkspaceFolder();
  }));

  ipcMain.handle(IPC_CHANNELS.selectWorkspaceFolder, safeNoInputHandle(() => {
    return selectWorkspaceFolder();
  }));

  ipcMain.handle(IPC_CHANNELS.readWorkspaceFile, safeHandle(validateReadWorkspaceFileInput, (input) => {
    return readWorkspaceFile(input);
  }));

  ipcMain.handle(IPC_CHANNELS.writeWorkspaceFile, safeHandle(validateWriteWorkspaceFileInput, (input) => {
    return writeWorkspaceFile(input);
  }));

  ipcMain.handle(IPC_CHANNELS.applyWorkspaceFile, safeHandle(validateApplyWorkspaceFileInput, (input) => {
    return applyWorkspaceFile(input);
  }));
};

void app.whenReady().then(async () => {
  registerIpc();
  await promptBuilderConfigService.loadConfig();
  await createMainWindow();
  void orchestratorService.refreshLocalTools().catch((error: unknown) => {
    console.warn('[main] Local tool registry refresh failed:', error);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  terminalSessions.forEach((session) => {
    killTerminalProcessTree(session);
  });
  terminalSessions.clear();

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
