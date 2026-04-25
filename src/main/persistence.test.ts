import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { AppState, RendererContinuityState, RoutingSettings } from '../shared/domain.js';
import { DEFAULT_LOCAL_TOOL_REGISTRY, DEFAULT_WORKBENCH_STATE } from '../shared/domain.js';
import { LocalPersistenceStore } from './persistence.js';

const createRootDir = (name: string): string => {
  const rootDir = path.resolve('tmp', name);
  rmSync(rootDir, { recursive: true, force: true });
  mkdirSync(rootDir, { recursive: true });
  return rootDir;
};

const createState = (): AppState => {
  return {
    adapters: [],
    conversations: [
      {
        id: 'conv-1',
        title: 'Recovered conversation',
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
        draftInput: 'draft',
        messages: [
          {
            id: 'msg-1',
            role: 'customer',
            content: 'hello',
            createdAt: '2026-03-20T10:00:00.000Z',
          },
        ],
      },
    ],
    tasks: [
      {
        id: 'task-pending',
        title: 'Pending task',
        summary: 'queued',
        status: 'running',
        taskType: 'general',
        profileId: null,
        adapterId: 'adapter-1',
        requestedBy: 'Desktop Operator',
        sourceConversationId: 'conv-1',
        cliMention: '@adapter-1',
        runId: 'run-pending',
      },
      {
        id: 'task-running',
        title: 'Running task',
        summary: 'live',
        status: 'running',
        taskType: 'code',
        profileId: null,
        adapterId: 'adapter-1',
        requestedBy: 'Desktop Operator',
        sourceConversationId: 'conv-1',
        cliMention: '@adapter-1',
        runId: 'run-running',
      },
    ],
    runs: [
      {
        id: 'run-pending',
        taskId: 'task-pending',
        adapterId: 'adapter-1',
        model: 'gpt-5.4',
        status: 'pending',
        startedAt: '2026-03-20T10:01:00.000Z',
        activeConversationId: 'conv-1',
        commandPreview: 'cmd pending',
        pid: 111,
        timeoutMs: null,
        cancelRequestedAt: null,
        exitCode: null,
        endedAt: null,
        events: [],
        transcript: [],
      },
      {
        id: 'run-running',
        taskId: 'task-running',
        adapterId: 'adapter-1',
        model: 'gpt-5.4',
        status: 'running',
        startedAt: '2026-03-20T10:02:00.000Z',
        activeConversationId: 'conv-1',
        commandPreview: 'cmd running',
        pid: 222,
        timeoutMs: null,
        cancelRequestedAt: null,
        exitCode: null,
        endedAt: null,
        events: [],
        transcript: [],
      },
    ],
    subagentStatuses: [],
    localToolRegistry: DEFAULT_LOCAL_TOOL_REGISTRY,
    localToolCallLogs: [],
    projectContext: { summary: '', updatedAt: null },
    nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
    agentProfiles: [],
    skills: [],
    mcpServers: [],
    orchestrationRuns: [],
    orchestrationNodes: [],
    workbench: {
      ...structuredClone(DEFAULT_WORKBENCH_STATE),
      activeThreadId: 'thread-1',
      threads: [
        {
          id: 'thread-1',
          title: 'Continuation thread',
          continuation: {
            conversationId: 'conv-1',
            lastRunId: 'run-running',
            updatedAt: '2026-03-20T10:02:00.000Z',
          },
          messages: [],
          activityLog: [],
          createdAt: '2026-03-20T10:00:00.000Z',
          updatedAt: '2026-03-20T10:02:00.000Z',
        },
      ],
    },
  };
};

const createContinuity = (): RendererContinuityState => {
  return {
    planDraft: null,
    selectedPlannedTaskIndex: 2,
    launchForm: {
      title: 'Draft title',
      prompt: 'Draft prompt',
      adapterId: 'adapter-1',
      model: 'gpt-5.4',
      conversationId: 'conv-1',
      timeoutMs: '5000',
    },
    selectedRunId: 'run-running',
    selectedConversationId: 'conv-1',
    locale: 'zh',
    lastRoute: '/config',
  };
};

const createRoutingSettings = (): RoutingSettings => {
  return {
    adapterSettings: {
      'adapter-1': {
        enabled: false,
        defaultModel: 'gpt-5.4',
        modelOptions: [],
        customCommand: '',
      },
    },
    discoveryRoots: [],
    customAdapters: [],
    taskTypeRules: {
      general: { adapterId: null, model: '' },
      planning: { adapterId: 'adapter-1', model: 'gpt-5.4' },
      code: { adapterId: 'adapter-1', model: 'codex-latest' },
      frontend: { adapterId: null, model: '' },
      research: { adapterId: 'adapter-1', model: 'gpt-5.4' },
      git: { adapterId: null, model: '' },
      ops: { adapterId: null, model: '' },
    },
    taskProfiles: [
      {
        id: 'profile-planning',
        label: 'Planning',
        taskType: 'planning',
        adapterId: 'adapter-1',
        model: 'gpt-5.4',
        enabled: true,
      },
      {
        id: 'profile-code',
        label: 'Code',
        taskType: 'code',
        adapterId: 'adapter-1',
        model: 'codex-latest',
        enabled: true,
      },
    ],
  };
};

void test('LocalPersistenceStore recovers stale runs and preserves continuity', () => {
  const rootDir = createRootDir('persistence-test-recovery');

  try {
    const initialStore = new LocalPersistenceStore(rootDir);
    initialStore.saveAppState(createState());
    initialStore.saveContinuityState(createContinuity());

    const recovered = new LocalPersistenceStore(rootDir).load();
    const recoveredAppData = recovered.appData;
    assert.ok(recoveredAppData);
    const pendingRun = recoveredAppData.runs.find((run) => run.id === 'run-pending');
    const runningRun = recoveredAppData.runs.find((run) => run.id === 'run-running');
    const pendingTask = recoveredAppData.tasks.find((task) => task.id === 'task-pending');
    const runningTask = recoveredAppData.tasks.find((task) => task.id === 'task-running');

    assert.ok(pendingRun);
    assert.ok(runningRun);
    assert.ok(pendingTask);
    assert.ok(runningTask);
    assert.equal(pendingRun.status, 'interrupted');
    assert.equal(runningRun.status, 'interrupted');
    assert.equal(pendingTask.status, 'interrupted');
    assert.equal(runningTask.status, 'interrupted');
    assert.equal(pendingRun.pid, null);
    assert.equal(runningRun.pid, null);
    assert.equal(typeof pendingRun.endedAt, 'string');
    assert.equal(typeof runningRun.endedAt, 'string');
    assert.match(pendingRun.events.at(-1)?.message ?? '', /Restart recovery marked this pending run as interrupted/);
    assert.match(runningRun.events.at(-1)?.message ?? '', /Restart recovery marked this running run as interrupted/);
    const recoveredWorkbench = recoveredAppData.workbench;
    assert.ok(recoveredWorkbench);
    const recoveredThread = recoveredWorkbench.threads[0];
    assert.ok(recoveredThread);
    assert.ok(recoveredThread.continuation);
    assert.equal(recoveredThread.continuation.conversationId, 'conv-1');
    assert.equal(recoveredThread.continuation.lastRunId, 'run-running');
    assert.deepEqual(recovered.continuity, createContinuity());
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore falls back to the backup envelope when the primary file is invalid', () => {
  const rootDir = createRootDir('persistence-test-backup-fallback');
  const persistenceDir = path.resolve(rootDir, '.cli-orchestrator');
  const primaryPath = path.resolve(persistenceDir, 'desktop-state.v1.json');
  const backupPath = `${primaryPath}.bak`;

  try {
    const initialStore = new LocalPersistenceStore(rootDir);
    const continuity = createContinuity();
    initialStore.saveAppState(createState());
    initialStore.saveContinuityState(continuity);

    mkdirSync(persistenceDir, { recursive: true });
    writeFileSync(backupPath, readFileSync(primaryPath, 'utf8'), 'utf8');
    writeFileSync(primaryPath, '{"version":1,"broken":', 'utf8');

    const recovered = new LocalPersistenceStore(rootDir).load();

    assert.deepEqual(recovered.continuity, continuity);
    assert.ok(recovered.appData);
    assert.equal(recovered.appData.runs.find((run) => run.id === 'run-pending')?.status, 'interrupted');
    assert.equal(recovered.appData.runs.find((run) => run.id === 'run-running')?.status, 'interrupted');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore preserves handoff artifact (resultPayload) through save/load', () => {
  const rootDir = createRootDir('persistence-test-handoff-artifact');

  try {
    const stateWithArtifact = createState();
    stateWithArtifact.orchestrationRuns = [
      {
        id: 'orch-1',
        conversationId: 'conv-1',
        rootPrompt: 'Implement feature X',
        status: 'completed',
        masterAgentProfileId: null,
        automationMode: 'review_loop',
        projectContextSummary: 'Project summary here',
        currentIteration: 1,
        maxIterations: 2,
        stopReason: null,
        planVersion: 1,
        createdAt: '2026-04-10T10:00:00.000Z',
        updatedAt: '2026-04-10T10:05:00.000Z',
        finalSummary: 'Completed successfully.',
      },
    ];
    stateWithArtifact.orchestrationNodes = [
      {
        id: 'node-1',
        orchestrationRunId: 'orch-1',
        parentNodeId: null,
        dependsOnNodeIds: [],
        agentProfileId: null,
        skillIds: [],
        mcpServerIds: [],
        taskType: 'code',
        title: 'Implement requested changes',
        prompt: 'Implement feature X',
        status: 'completed',
        runId: 'run-abc',
        resultSummary: 'Node completed successfully.',
        resultPayload: {
          kind: 'run_handoff',
          runId: 'run-abc',
          adapterId: 'claude-wsl',
          model: 'sonnet',
          status: 'succeeded',
          changedFiles: ['src/main/persistence.ts', 'src/shared/domain.ts'],
          diffStat: '2 files changed, 45 insertions(+), 3 deletions(-)',
          transcriptSummary: 'Implemented the feature and ran tests.',
          reviewNotes: ['Focus on changed files: src/main/persistence.ts'],
          generatedAt: '2026-04-10T10:04:00.000Z',
        },
        retryCount: 0,
      },
    ];

    const initialStore = new LocalPersistenceStore(rootDir);
    initialStore.saveAppState(stateWithArtifact);

    const recovered = new LocalPersistenceStore(rootDir).load();
    const recoveredNode = recovered.appData?.orchestrationNodes.find((n) => n.id === 'node-1');

    assert.ok(recoveredNode, 'Node should be recovered');
    assert.ok(recoveredNode.resultPayload, 'resultPayload should be preserved');
    assert.equal(recoveredNode.resultPayload.kind, 'run_handoff');
    assert.equal(recoveredNode.resultPayload.runId, 'run-abc');
    assert.equal(recoveredNode.resultPayload.adapterId, 'claude-wsl');
    assert.equal(recoveredNode.resultPayload.model, 'sonnet');
    assert.equal(recoveredNode.resultPayload.status, 'succeeded');
    assert.deepEqual(recoveredNode.resultPayload.changedFiles, ['src/main/persistence.ts', 'src/shared/domain.ts']);
    assert.equal(recoveredNode.resultPayload.diffStat, '2 files changed, 45 insertions(+), 3 deletions(-)');
    assert.equal(recoveredNode.resultPayload.transcriptSummary, 'Implemented the feature and ran tests.');
    assert.deepEqual(recoveredNode.resultPayload.reviewNotes, ['Focus on changed files: src/main/persistence.ts']);
    assert.equal(recoveredNode.resultPayload.generatedAt, '2026-04-10T10:04:00.000Z');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore normalizes malformed resultPayload to null', () => {
  const rootDir = createRootDir('persistence-test-malformed-artifact');
  const persistenceDir = path.resolve(rootDir, '.cli-orchestrator');
  const primaryPath = path.resolve(persistenceDir, 'desktop-state.v1.json');

  try {
    // Write an envelope with a malformed resultPayload directly
    mkdirSync(persistenceDir, { recursive: true });
    const envelope = {
      version: 1,
      projectRoot: rootDir,
      savedAt: new Date().toISOString(),
      appState: {
        conversations: [],
        tasks: [],
        runs: [],
        nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
        agentProfiles: [],
        skills: [],
        mcpServers: [],
        orchestrationRuns: [
          {
            id: 'orch-2',
            conversationId: 'conv-1',
            rootPrompt: 'test',
            status: 'completed',
            masterAgentProfileId: null,
            automationMode: 'standard',
            projectContextSummary: null,
            currentIteration: 1,
            maxIterations: 1,
            stopReason: null,
            planVersion: 1,
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:00:00.000Z',
            finalSummary: null,
          },
        ],
        orchestrationNodes: [
          {
            id: 'node-bad',
            orchestrationRunId: 'orch-2',
            parentNodeId: null,
            dependsOnNodeIds: [],
            agentProfileId: null,
            skillIds: [],
            mcpServerIds: [],
            taskType: 'general',
            title: 'Bad node',
            prompt: 'test',
            status: 'completed',
            runId: 'run-bad',
            resultSummary: 'Done',
            resultPayload: { kind: 'unknown_kind', garbage: true },
            retryCount: 0,
          },
        ],
        projectContext: { summary: '', updatedAt: null },
      },
      continuity: {
        planDraft: null,
        selectedPlannedTaskIndex: 0,
        launchForm: { title: '', prompt: '', adapterId: '', model: '', conversationId: '', timeoutMs: '' },
        selectedRunId: null,
        selectedConversationId: null,
        locale: 'en',
        lastRoute: null,
      },
      routing: {
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
        taskProfiles: [],
      },
    };
    writeFileSync(primaryPath, JSON.stringify(envelope, null, 2), 'utf8');

    const recovered = new LocalPersistenceStore(rootDir).load();
    const recoveredNode = recovered.appData?.orchestrationNodes.find((n) => n.id === 'node-bad');

    assert.ok(recoveredNode, 'Node should be recovered');
    assert.equal(recoveredNode.resultPayload, null, 'Malformed resultPayload should normalize to null');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore defaults thread fields for legacy workbench state', () => {
  const rootDir = createRootDir('persistence-test-workbench-threads');
  const persistenceDir = path.resolve(rootDir, '.cli-orchestrator');
  const primaryPath = path.resolve(persistenceDir, 'desktop-state.v1.json');

  try {
    mkdirSync(persistenceDir, { recursive: true });
    const envelope = {
      version: 1,
      projectRoot: rootDir,
      savedAt: new Date().toISOString(),
      appState: {
        ...createState(),
        workbench: {
          ...DEFAULT_WORKBENCH_STATE,
          objective: 'Legacy workbench state',
        },
      },
      continuity: createContinuity(),
      routing: createRoutingSettings(),
    };

    writeFileSync(primaryPath, JSON.stringify(envelope, null, 2), 'utf8');

    const recovered = new LocalPersistenceStore(rootDir).load();
    const recoveredAppData = recovered.appData;
    assert.ok(recoveredAppData);

    const recoveredWorkbench = recoveredAppData.workbench;
    assert.ok(recoveredWorkbench);
    assert.equal(recoveredWorkbench.objective, 'Legacy workbench state');
    assert.equal(recoveredWorkbench.activeThreadId, null);
    assert.deepEqual(recoveredWorkbench.threads, []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore preserves plan route and caps recent workspace roots', () => {
  const rootDir = createRootDir('persistence-test-plan-route-recent-roots');

  try {
    const state = createState();
    state.workbench = {
      ...structuredClone(DEFAULT_WORKBENCH_STATE),
      workspaceRoot: 'D:/projects/current',
      recentWorkspaceRoots: [
        'D:/projects/current',
        'D:/projects/one',
        'D:/projects/two',
        'D:/projects/three',
        'D:/projects/four',
        'D:/projects/five',
      ],
      tasks: [
        {
          id: 'task-with-agent',
          title: 'Agent task',
          detail: 'Use a chosen profile',
          status: 'pending',
          source: 'planner',
          agentProfileId: 'profile-code',
          createdAt: '2026-03-20T10:00:00.000Z',
          updatedAt: '2026-03-20T10:00:00.000Z',
          completedAt: null,
        },
      ],
    };
    const store = new LocalPersistenceStore(rootDir);
    store.saveAppState(state);
    store.saveContinuityState({ ...createContinuity(), lastRoute: '/plan' });

    const recovered = new LocalPersistenceStore(rootDir).load();

    assert.equal(recovered.continuity.lastRoute, '/plan');
    assert.deepEqual(recovered.appData?.workbench?.recentWorkspaceRoots, [
      'D:/projects/current',
      'D:/projects/one',
      'D:/projects/two',
      'D:/projects/three',
      'D:/projects/four',
    ]);
    const recoveredTask = recovered.appData.workbench.tasks[0];
    assert.ok(recoveredTask);
    assert.equal(recoveredTask.agentProfileId, 'profile-code');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore preserves adapterOverride and modelOverride on orchestration nodes', () => {
  const rootDir = createRootDir('persistence-test-node-overrides');

  try {
    const stateWithOverrides = createState();
    stateWithOverrides.orchestrationRuns = [
      {
        id: 'orch-o1',
        conversationId: 'conv-1',
        rootPrompt: 'Test overrides',
        status: 'completed',
        masterAgentProfileId: null,
        automationMode: 'standard',
        projectContextSummary: null,
        currentIteration: 1,
        maxIterations: 1,
        stopReason: null,
        planVersion: 1,
        createdAt: '2026-04-11T10:00:00.000Z',
        updatedAt: '2026-04-11T10:01:00.000Z',
        finalSummary: 'Done.',
      },
    ];
    stateWithOverrides.orchestrationNodes = [
      {
        id: 'node-with-overrides',
        orchestrationRunId: 'orch-o1',
        parentNodeId: null,
        dependsOnNodeIds: [],
        agentProfileId: null,
        skillIds: [],
        mcpServerIds: [],
        taskType: 'code',
        title: 'Node with overrides',
        prompt: 'Test prompt',
        status: 'completed',
        runId: 'run-ovr',
        resultSummary: 'Completed.',
        resultPayload: null,
        retryCount: 0,
        adapterOverride: 'claude-wsl',
        modelOverride: 'sonnet',
      },
      {
        id: 'node-without-overrides',
        orchestrationRunId: 'orch-o1',
        parentNodeId: null,
        dependsOnNodeIds: [],
        agentProfileId: null,
        skillIds: [],
        mcpServerIds: [],
        taskType: 'general',
        title: 'Node without overrides',
        prompt: 'Test prompt 2',
        status: 'completed',
        runId: 'run-no-ovr',
        resultSummary: 'Also completed.',
        resultPayload: null,
        retryCount: 0,
      },
    ];

    const initialStore = new LocalPersistenceStore(rootDir);
    initialStore.saveAppState(stateWithOverrides);

    const recovered = new LocalPersistenceStore(rootDir).load();
    const nodeWith = recovered.appData?.orchestrationNodes.find((n) => n.id === 'node-with-overrides');
    const nodeWithout = recovered.appData?.orchestrationNodes.find((n) => n.id === 'node-without-overrides');

    assert.ok(nodeWith, 'Node with overrides should be recovered');
    assert.equal(nodeWith.adapterOverride, 'claude-wsl');
    assert.equal(nodeWith.modelOverride, 'sonnet');

    assert.ok(nodeWithout, 'Node without overrides should be recovered');
    assert.equal(nodeWithout.adapterOverride, undefined);
    assert.equal(nodeWithout.modelOverride, undefined);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

void test('LocalPersistenceStore persists routing settings', () => {
  const rootDir = createRootDir('persistence-test-routing-settings');

  try {
    const initialStore = new LocalPersistenceStore(rootDir);
    const routingSettings = createRoutingSettings();
    initialStore.saveRoutingSettings(routingSettings);

    const recovered = new LocalPersistenceStore(rootDir).load();

    assert.deepEqual(recovered.routing, routingSettings);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
