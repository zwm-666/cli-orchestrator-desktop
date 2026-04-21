import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { AppState, RoutingSettings } from '../shared/domain.js';
import { LocalPersistenceStore } from './persistence.js';
import { OrchestratorService } from './orchestratorService.js';

const createRootDir = (name: string): string => {
  const rootDir = path.resolve('tmp', name);
  rmSync(rootDir, { recursive: true, force: true });
  mkdirSync(rootDir, { recursive: true });
  return rootDir;
};

const createRoutingSettings = (): RoutingSettings => {
  return {
    adapterSettings: {
      'fake-ai': {
        enabled: true,
        defaultModel: 'demo-model',
        customCommand: '',
      },
      opencode: {
        enabled: true,
        defaultModel: 'anthropic/claude-sonnet-4-20250514',
        customCommand: '',
      },
      'missing-ai': {
        enabled: true,
        defaultModel: 'missing-model',
        customCommand: '',
      },
    },
    taskTypeRules: {
      general: { adapterId: null, model: '' },
      planning: { adapterId: null, model: '' },
      code: { adapterId: 'missing-ai', model: 'missing-model' },
      frontend: { adapterId: null, model: '' },
      research: { adapterId: null, model: '' },
      git: { adapterId: null, model: '' },
      ops: { adapterId: null, model: '' },
    },
    taskProfiles: [
      {
        id: 'profile-planning',
        label: 'Planning',
        taskType: 'planning',
        adapterId: 'fake-ai',
        model: 'demo-model',
        enabled: true,
      },
      {
        id: 'profile-code',
        label: 'Code',
        taskType: 'code',
        adapterId: 'missing-ai',
        model: 'missing-model',
        enabled: true,
      },
    ],
  };
};

const writeAdaptersConfig = (rootDir: string): void => {
  mkdirSync(path.resolve(rootDir, 'config'), { recursive: true });
  writeFileSync(
    path.resolve(rootDir, 'config', 'adapters.json'),
    `${JSON.stringify(
      [
        {
          id: 'node-success',
          displayName: 'Node Success',
          visibility: 'internal',
          requiresDiscovery: false,
          launchMode: 'cli',
          command: '$NODE_EXEC_PATH',
          args: ['-e', "setTimeout(() => { console.log('ok'); process.exit(0); }, 20);", '{{prompt}}'],
          description: 'Internal deterministic adapter.',
          capabilities: ['verification'],
          health: 'healthy',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: '',
          supportedModels: [],
        },
        {
          id: 'claude',
          displayName: 'Claude Code',
          visibility: 'user',
          requiresDiscovery: true,
          launchMode: 'cli',
          command: 'wsl.exe',
          args: ['-d', 'Ubuntu-24.04', '--', 'claude', '-p', '{{prompt}}'],
          description: 'WSL Claude fixture.',
          capabilities: ['planning'],
          health: 'idle',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: 'sonnet',
          supportedModels: ['sonnet'],
        },
        {
          id: 'codex',
          displayName: 'Codex CLI',
          visibility: 'user',
          requiresDiscovery: true,
          launchMode: 'cli',
          command: 'codex',
          args: ['exec', '--model', '{{model}}', '--json', '--', '{{prompt}}'],
          description: 'Codex fixture.',
          capabilities: ['code'],
          health: 'idle',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: 'gpt-5.4',
          supportedModels: ['gpt-5.4'],
        },
        {
          id: 'fake-ai',
          displayName: 'Fake AI',
          visibility: 'user',
          requiresDiscovery: true,
          launchMode: 'cli',
          command: 'fake-ai',
          args: ['{{prompt}}'],
          description: 'Discovered user-facing adapter.',
          capabilities: ['planning'],
          health: 'idle',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: 'demo-model',
          supportedModels: ['demo-model'],
        },
        {
          id: 'missing-ai',
          displayName: 'Missing AI',
          visibility: 'user',
          requiresDiscovery: true,
          launchMode: 'cli',
          command: 'missing-ai',
          args: ['{{prompt}}'],
          description: 'Undiscovered user-facing adapter.',
          capabilities: ['planning'],
          health: 'idle',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: 'missing-model',
          supportedModels: ['missing-model'],
        },
        {
          id: 'opencode',
          displayName: 'OpenCode CLI',
          visibility: 'user',
          requiresDiscovery: true,
          launchMode: 'cli',
          command: 'opencode',
          args: ['run', '--model', '{{model}}', '--format', 'json', '--title', '{{title}}', '{{prompt}}'],
          description: 'OpenCode regression fixture.',
          capabilities: ['implementation', 'verification'],
          health: 'idle',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: 'anthropic/claude-sonnet-4-20250514',
          supportedModels: ['anthropic/claude-sonnet-4-20250514'],
        },
        {
          id: 'blocked-ai',
          displayName: 'Blocked AI',
          visibility: 'user',
          requiresDiscovery: true,
          launchMode: 'cli',
          command: 'blocked-ai',
          args: ['{{prompt}}'],
          description: 'Available adapter whose most recent run showed an environment block.',
          capabilities: ['verification'],
          health: 'idle',
          enabled: true,
          defaultTimeoutMs: null,
          defaultModel: 'blocked-model',
          supportedModels: ['blocked-model'],
        },
      ],
      null,
      2,
    )}\n`,
    'utf8',
  );
};

const writeNamedExecutable = (targetPath: string, contents: string): string => {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, contents, 'utf8');
  return targetPath;
};

const writeFakeExecutable = (rootDir: string): string => {
  const binDir = path.resolve(rootDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const executablePath = path.resolve(binDir, 'fake-ai.cmd');
  writeFileSync(executablePath, '@echo off\r\necho fake-ai\r\n', 'utf8');
  const blockedExecutablePath = path.resolve(binDir, 'blocked-ai.cmd');
  writeFileSync(blockedExecutablePath, '@echo off\r\necho blocked-ai\r\n', 'utf8');
  const opencodeExecutablePath = path.resolve(binDir, 'opencode.cmd');
  writeFileSync(opencodeExecutablePath, '@echo off\r\n1>&2 echo Error: Session not found\r\nexit /b 1\r\n', 'utf8');
  return binDir;
};

const createPersistedAppStateForReadiness = (): AppState => {
  const conversationId = 'conv-readiness';

  return {
    adapters: [],
    conversations: [
      {
        id: conversationId,
        title: 'Readiness fixture',
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:06:00.000Z',
        draftInput: 'readiness check',
        messages: [
          {
            id: 'msg-readiness',
            role: 'customer',
            content: 'Check adapter readiness.',
            createdAt: '2026-03-20T10:00:00.000Z',
          },
        ],
      },
    ],
    tasks: [
      {
        id: 'task-fake-ready',
        title: 'Ready adapter task',
        summary: 'Successful readiness fixture.',
        status: 'completed',
        taskType: 'planning',
        profileId: null,
        adapterId: 'fake-ai',
        requestedBy: 'Test harness',
        sourceConversationId: conversationId,
        cliMention: '@fake-ai',
        runId: 'run-fake-ready',
      },
      {
        id: 'task-fake-nonblocking-failure',
        title: 'Ready adapter latest failed task',
        summary: 'Latest fake-ai run failed, but not due to an environment block.',
        status: 'failed',
        taskType: 'code',
        profileId: null,
        adapterId: 'fake-ai',
        requestedBy: 'Test harness',
        sourceConversationId: conversationId,
        cliMention: '@fake-ai',
        runId: 'run-fake-nonblocking-failure',
      },
      {
        id: 'task-opencode-session-missing',
        title: 'OpenCode session missing task',
        summary: 'Most recent OpenCode run failed due to missing session context.',
        status: 'failed',
        taskType: 'code',
        profileId: null,
        adapterId: 'opencode',
        requestedBy: 'Test harness',
        sourceConversationId: conversationId,
        cliMention: '@opencode',
        runId: 'run-opencode-session-missing',
      },
      {
        id: 'task-blocked-env',
        title: 'Blocked adapter task',
        summary: 'Environment blocked readiness fixture.',
        status: 'failed',
        taskType: 'code',
        profileId: null,
        adapterId: 'blocked-ai',
        requestedBy: 'Test harness',
        sourceConversationId: conversationId,
        cliMention: '@blocked-ai',
        runId: 'run-blocked-env',
      },
    ],
    runs: [
      {
        id: 'run-opencode-session-missing',
        taskId: 'task-opencode-session-missing',
        adapterId: 'opencode',
        model: 'anthropic/claude-sonnet-4-20250514',
        status: 'failed',
        startedAt: '2026-03-20T10:06:30.000Z',
        activeConversationId: conversationId,
        commandPreview: 'opencode run readiness check',
        pid: null,
        timeoutMs: null,
        cancelRequestedAt: null,
        exitCode: 1,
        endedAt: '2026-03-20T10:06:35.000Z',
        events: [
          {
            id: 'evt-opencode-session-missing-terminal',
            runId: 'run-opencode-session-missing',
            level: 'error',
            timestamp: '2026-03-20T10:06:35.000Z',
            message: 'Process exited with code 1. Error: Session not found',
          },
        ],
        transcript: [],
      },
      {
        id: 'run-blocked-env',
        taskId: 'task-blocked-env',
        adapterId: 'blocked-ai',
        model: 'blocked-model',
        status: 'failed',
        startedAt: '2026-03-20T10:06:00.000Z',
        activeConversationId: conversationId,
        commandPreview: 'blocked-ai environment check',
        pid: null,
        timeoutMs: null,
        cancelRequestedAt: null,
        exitCode: 1,
        endedAt: '2026-03-20T10:06:10.000Z',
        events: [
          {
            id: 'evt-blocked-env',
            runId: 'run-blocked-env',
            level: 'error',
            timestamp: '2026-03-20T10:06:10.000Z',
            message:
              'Process exited with code 1. OpenCode is installed, but this environment is currently missing a usable local session/server context.',
          },
        ],
        transcript: [],
      },
      {
        id: 'run-fake-ready',
        taskId: 'task-fake-ready',
        adapterId: 'fake-ai',
        model: 'demo-model',
        status: 'succeeded',
        startedAt: '2026-03-20T10:05:00.000Z',
        activeConversationId: conversationId,
        commandPreview: 'fake-ai readiness check',
        pid: null,
        timeoutMs: null,
        cancelRequestedAt: null,
        exitCode: 0,
        endedAt: '2026-03-20T10:05:05.000Z',
        events: [
          {
            id: 'evt-fake-ready',
            runId: 'run-fake-ready',
            level: 'success',
            timestamp: '2026-03-20T10:05:05.000Z',
            message: 'Process completed successfully.',
          },
        ],
        transcript: [],
      },
      {
        id: 'run-fake-nonblocking-failure',
        taskId: 'task-fake-nonblocking-failure',
        adapterId: 'fake-ai',
        model: 'demo-model',
        status: 'failed',
        startedAt: '2026-03-20T10:05:30.000Z',
        activeConversationId: conversationId,
        commandPreview: 'fake-ai noisy failure check',
        pid: null,
        timeoutMs: null,
        cancelRequestedAt: null,
        exitCode: 1,
        endedAt: '2026-03-20T10:05:35.000Z',
        events: [
          {
            id: 'evt-fake-nonblocking-stderr',
            runId: 'run-fake-nonblocking-failure',
            level: 'stderr',
            timestamp: '2026-03-20T10:05:34.000Z',
            message: 'TTY handshake failed while rendering a progress frame.',
          },
          {
            id: 'evt-fake-nonblocking-terminal',
            runId: 'run-fake-nonblocking-failure',
            level: 'error',
            timestamp: '2026-03-20T10:05:35.000Z',
            message: 'Process exited with code 1. Check the stderr output above for details.',
          },
        ],
        transcript: [],
      },
    ],
    projectContext: { summary: '', updatedAt: null },
    nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
    agentProfiles: [],
    skills: [],
    mcpServers: [],
    orchestrationRuns: [],
    orchestrationNodes: [],
  };
};

const waitForRunToFinish = async (service: OrchestratorService, runId: string): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = service.getAppState().runs.find((entry) => entry.id === runId);

    if (run && run.status !== 'pending' && run.status !== 'running') {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error(`Run ${runId} did not finish in time.`);
};

void test('OrchestratorService discovers local user adapters and keeps internal smoke adapters hidden', async () => {
  const rootDir = createRootDir('orchestrator-service-discovery');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = writeFakeExecutable(rootDir);
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const persistenceStore = new LocalPersistenceStore(rootDir);
    persistenceStore.saveRoutingSettings(createRoutingSettings());
    const service = new OrchestratorService(rootDir, persistenceStore);
    const state = service.getAppState();
    const routingSettings = service.getRoutingSettings();
    const fakeAdapter = state.adapters.find((adapter) => adapter.id === 'fake-ai');
    const missingAdapter = state.adapters.find((adapter) => adapter.id === 'missing-ai');
    const internalAdapter = state.adapters.find((adapter) => adapter.id === 'node-success');

    assert.ok(fakeAdapter);
    assert.ok(missingAdapter);
    assert.ok(internalAdapter);
    assert.equal(fakeAdapter.visibility, 'user');
    assert.equal(fakeAdapter.availability, 'available');
    assert.equal(fakeAdapter.enabled, true);
    assert.equal(missingAdapter.visibility, 'user');
    assert.equal(missingAdapter.availability, 'unavailable');
    assert.equal(missingAdapter.enabled, false);
    assert.equal(internalAdapter.visibility, 'internal');
    assert.equal(internalAdapter.availability, 'available');
    assert.equal(internalAdapter.enabled, false);
    assert.equal(routingSettings.taskTypeRules.code.adapterId, null);

    const plan = service.createPlanDraft({ rawInput: 'Implement the planner routing change.' });

    assert.equal(plan.draft.recommendedAdapterId, 'fake-ai');

    const started = service.startRun({
      title: 'Internal verification run',
      prompt: 'verify internal adapter launch',
      adapterId: 'node-success',
    });

    await waitForRunToFinish(service, started.run.id);

    const completedRun = service.getAppState().runs.find((run) => run.id === started.run.id);
    const completedTask = service.getAppState().tasks.find((task) => task.id === started.task.id);

    assert.equal(completedRun?.status, 'succeeded');
    assert.equal(completedTask?.status, 'completed');
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService discovery honors customCommand overrides when routing settings change', () => {
  const rootDir = createRootDir('orchestrator-service-custom-command-discovery');

  try {
    writeAdaptersConfig(rootDir);
    const persistenceStore = new LocalPersistenceStore(rootDir);
    persistenceStore.saveRoutingSettings(createRoutingSettings());
    const service = new OrchestratorService(rootDir, persistenceStore);

    const before = service.getAppState().adapters.find((adapter) => adapter.id === 'missing-ai');
    assert.ok(before);
    assert.equal(before.availability, 'unavailable');

    const customExecutablePath = writeNamedExecutable(path.resolve(rootDir, 'custom-bin', 'missing-ai.cmd'), '@echo off\r\necho custom missing ai\r\n');
    const nextRouting = service.getRoutingSettings();
    nextRouting.adapterSettings['missing-ai'] = {
      enabled: true,
      defaultModel: 'missing-model',
      customCommand: customExecutablePath,
    };
    nextRouting.taskTypeRules.code = {
      adapterId: 'missing-ai',
      model: 'missing-model',
    };

    service.updateRoutingSettings(nextRouting);

    const after = service.getAppState().adapters.find((adapter) => adapter.id === 'missing-ai');
    assert.ok(after);
    assert.equal(after.availability, 'available');
    assert.equal(after.enabled, true);
    assert.equal(service.getRoutingSettings().taskTypeRules.code.adapterId, 'missing-ai');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService discovers Windows shims from APPDATA npm fallback directories', () => {
  const rootDir = createRootDir('orchestrator-service-appdata-fallback');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;
  const previousAppData = process.env.APPDATA;

  try {
    writeAdaptersConfig(rootDir);
    process.env.PATH = '';
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    process.env.APPDATA = path.resolve(rootDir, 'AppData', 'Roaming');
    writeNamedExecutable(path.resolve(process.env.APPDATA, 'npm', 'codex.cmd'), '@echo off\r\necho codex shim\r\n');

    const persistenceStore = new LocalPersistenceStore(rootDir);
    const service = new OrchestratorService(rootDir, persistenceStore);
    const codexAdapter = service.getAppState().adapters.find((adapter) => adapter.id === 'codex');

    assert.ok(codexAdapter);
    assert.equal(codexAdapter.availability, 'available');
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    process.env.APPDATA = previousAppData;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService does not treat wsl.exe alone as proof that Claude is available', () => {
  const rootDir = createRootDir('orchestrator-service-claude-wsl-probe');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = path.resolve(rootDir, 'bin');
    mkdirSync(binDir, { recursive: true });
    writeNamedExecutable(path.resolve(binDir, 'wsl.exe'), 'not-a-real-exe');
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const persistenceStore = new LocalPersistenceStore(rootDir);
    const service = new OrchestratorService(rootDir, persistenceStore);
    const claudeAdapter = service.getAppState().adapters.find((adapter) => adapter.id === 'claude');

    assert.ok(claudeAdapter);
    assert.equal(claudeAdapter.availability, 'unavailable');
    assert.match(claudeAdapter.discoveryReason, /inside WSL could not be verified/i);
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService records a persisted transcript for each run lifecycle', async () => {
  const rootDir = createRootDir('orchestrator-service-transcript');

  try {
    writeAdaptersConfig(rootDir);
    const persistenceStore = new LocalPersistenceStore(rootDir);
    const service = new OrchestratorService(rootDir, persistenceStore);

    const started = service.startRun({
      title: 'Transcript verification run',
      prompt: 'show transcript output',
      adapterId: 'node-success',
    });

    await waitForRunToFinish(service, started.run.id);

    const completedRun = service.getAppState().runs.find((run) => run.id === started.run.id);

    assert.ok(completedRun);
    assert.equal(completedRun.status, 'succeeded');
    assert.deepEqual(
      completedRun.transcript.map((entry) => entry.kind),
      ['run_started', 'step_started', 'step_output', 'step_output', 'step_completed', 'run_completed'],
    );
    assert.equal(completedRun.transcript[0]?.summary, 'Queued task for Node Success.');
    assert.match(completedRun.transcript[2]?.summary ?? '', /Process started/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService derives adapter readiness from availability and recent run outcomes', () => {
  const rootDir = createRootDir('orchestrator-service-readiness');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = writeFakeExecutable(rootDir);
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const persistenceStore = new LocalPersistenceStore(rootDir);
    persistenceStore.saveRoutingSettings(createRoutingSettings());
    persistenceStore.saveAppState(createPersistedAppStateForReadiness());

    const service = new OrchestratorService(rootDir, persistenceStore);
    const state = service.getAppState();
    const readyAdapter = state.adapters.find((adapter) => adapter.id === 'fake-ai');
    const blockedAdapter = state.adapters.find((adapter) => adapter.id === 'blocked-ai');
    const missingAdapter = state.adapters.find((adapter) => adapter.id === 'missing-ai');
    const openCodeAdapter = state.adapters.find((adapter) => adapter.id === 'opencode');

    assert.ok(readyAdapter);
    assert.ok(blockedAdapter);
    assert.ok(missingAdapter);
    assert.ok(openCodeAdapter);
    assert.equal(readyAdapter.readiness, 'ready');
    assert.equal(readyAdapter.readinessReason, 'Process completed successfully.');
    assert.equal(blockedAdapter.readiness, 'blocked_by_environment');
    assert.match(blockedAdapter.readinessReason, /missing a usable local session\/server context/i);
    assert.equal(openCodeAdapter.readiness, 'blocked_by_environment');
    assert.match(openCodeAdapter.readinessReason, /Session not found/i);
    assert.equal(missingAdapter.readiness, 'unavailable');
    assert.equal(missingAdapter.readinessReason, missingAdapter.discoveryReason);
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService surfaces concrete OpenCode stderr details for failed runs', async () => {
  const rootDir = createRootDir('orchestrator-service-opencode-failure-detail');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = writeFakeExecutable(rootDir);
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const persistenceStore = new LocalPersistenceStore(rootDir);
    persistenceStore.saveRoutingSettings(createRoutingSettings());
    const service = new OrchestratorService(rootDir, persistenceStore);

    const started = service.startRun({
      title: 'OpenCode failure detail run',
      prompt: 'Reply with OK.',
      adapterId: 'opencode',
    });

    await waitForRunToFinish(service, started.run.id);

    const completedRun = service.getAppState().runs.find((run) => run.id === started.run.id);

    assert.ok(completedRun);
    assert.equal(completedRun.status, 'failed');
    assert.match(completedRun.events.map((event) => event.message).join('\n'), /Error: Session not found/);
    assert.match(completedRun.events.at(-1)?.message ?? '', /Session not found/);
    assert.doesNotMatch(completedRun.events.at(-1)?.message ?? '', /missing a usable local session\/server context/i);
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService blocks repeat OpenCode launches after session-missing readiness', async () => {
  const rootDir = createRootDir('orchestrator-service-opencode-repeat-launch-guard');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;
  let service: OrchestratorService | null = null;
  let launchedRunId: string | null = null;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = writeFakeExecutable(rootDir);
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const persistenceStore = new LocalPersistenceStore(rootDir);
    persistenceStore.saveRoutingSettings(createRoutingSettings());
    persistenceStore.saveAppState(createPersistedAppStateForReadiness());

    service = new OrchestratorService(rootDir, persistenceStore);
    const beforeState = service.getAppState();
    let thrown: Error | null = null;

    try {
      const started = service.startRun({
        title: 'Blocked OpenCode retry',
        prompt: 'Retry the OpenCode run.',
        adapterId: 'opencode',
      });

      launchedRunId = started.run.id;
    } catch (error) {
      thrown = error as Error;
    }

    assert.ok(thrown, 'Expected startRun() to reject the repeat OpenCode launch.');
    assert.match(
      thrown.message,
      /OpenCode CLI cannot launch because the local OpenCode session context is currently blocked/i,
    );

    const afterState = service.getAppState();

    assert.equal(afterState.tasks.length, beforeState.tasks.length);
    assert.equal(afterState.runs.length, beforeState.runs.length);
  } finally {
    if (service && launchedRunId) {
      await waitForRunToFinish(service, launchedRunId);
    }

    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('OrchestratorService runs an orchestration end-to-end with node-success adapter', async () => {
  const rootDir = createRootDir('orchestrator-service-orchestration-e2e');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = writeFakeExecutable(rootDir);
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const persistenceStore = new LocalPersistenceStore(rootDir);
    persistenceStore.saveRoutingSettings(createRoutingSettings());
    const service = new OrchestratorService(rootDir, persistenceStore);

    // Save an agent profile that targets the node-success internal adapter
    service.saveAgentProfile({
      profile: {
        id: 'profile-node-success',
        name: 'Node Success Agent',
        role: 'coder',
        adapterId: 'node-success',
        model: '',
        systemPrompt: 'You are a test agent.',
        enabledSkillIds: [],
        enabledMcpServerIds: [],
        maxParallelChildren: 3,
        retryPolicy: { maxRetries: 0, delayMs: 1000, backoffMultiplier: 1 },
        timeoutMs: null,
        enabled: true,
      },
    });

    // Start orchestration with a simple prompt
    const result = service.startOrchestration({
      prompt: 'Implement a simple greeting function.',
    });

    assert.ok(result.orchestrationRun, 'Orchestration run should be created.');
    assert.ok(result.nodes.length > 0, 'Orchestration should have at least one node.');
    assert.equal(result.orchestrationRun.status, 'executing', 'Orchestration should be in executing state.');

    // Wait for all node runs to finish
    const runningNodes = result.nodes.filter((n) => n.runId);
    for (const node of runningNodes) {
      if (node.runId) {
        await waitForRunToFinish(service, node.runId);
      }
    }

    // Give the orchestration state machine a moment to advance
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Check final orchestration state
    const finalState = service.getOrchestrationRun({ orchestrationRunId: result.orchestrationRun.id });
    assert.ok(finalState.orchestrationRun, 'Final orchestration run should exist.');

    // Verify the orchestration completed (or at least advanced past executing)
    const terminalStatuses = ['completed', 'failed'];
    assert.ok(
      terminalStatuses.includes(finalState.orchestrationRun.status),
      `Orchestration should reach a terminal state, got: ${finalState.orchestrationRun.status}`,
    );

    // Verify at least one node completed
    const completedNodes = finalState.nodes.filter((n) => n.status === 'completed');
    assert.ok(completedNodes.length > 0, 'At least one node should have completed successfully.');

    // Verify the run appeared in AppState
    const appState = service.getAppState();
    assert.ok(
      appState.orchestrationRuns.some((r) => r.id === result.orchestrationRun.id),
      'Orchestration run should be in AppState.',
    );
    assert.ok(
      appState.orchestrationNodes.some((n) => n.orchestrationRunId === result.orchestrationRun.id),
      'Orchestration nodes should be in AppState.',
    );
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
    try {
      rmSync(rootDir, { recursive: true, force: true });
    } catch {
      /* sandbox EPERM */
    }
  }
});
