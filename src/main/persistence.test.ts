import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { AppState, RendererContinuityState, RoutingSettings } from '../shared/domain.js';
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
            createdAt: '2026-03-20T10:00:00.000Z'
          }
        ]
      }
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
        runId: 'run-pending'
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
        runId: 'run-running'
      }
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
        transcript: []
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
        transcript: []
      }
    ],
    agentProfiles: [],
    skills: [],
    mcpServers: [],
    orchestrationRuns: [],
    orchestrationNodes: []
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
      timeoutMs: '5000'
    },
    selectedRunId: 'run-running',
    selectedConversationId: 'conv-1',
    locale: 'zh'
  };
};

const createRoutingSettings = (): RoutingSettings => {
  return {
    adapterSettings: {
      'adapter-1': {
        enabled: false,
        defaultModel: 'gpt-5.4',
        customCommand: ''
      }
    },
    taskTypeRules: {
      general: { adapterId: null, model: '' },
      planning: { adapterId: 'adapter-1', model: 'gpt-5.4' },
      code: { adapterId: 'adapter-1', model: 'codex-latest' },
      frontend: { adapterId: null, model: '' },
      research: { adapterId: 'adapter-1', model: 'gpt-5.4' },
      git: { adapterId: null, model: '' },
      ops: { adapterId: null, model: '' }
    },
    taskProfiles: [
      {
        id: 'profile-planning',
        label: 'Planning',
        taskType: 'planning',
        adapterId: 'adapter-1',
        model: 'gpt-5.4',
        enabled: true
      },
      {
        id: 'profile-code',
        label: 'Code',
        taskType: 'code',
        adapterId: 'adapter-1',
        model: 'codex-latest',
        enabled: true
      }
    ]
  };
};

test('LocalPersistenceStore recovers stale runs and preserves continuity', () => {
  const rootDir = createRootDir('persistence-test-recovery');

  try {
    const initialStore = new LocalPersistenceStore(rootDir);
    initialStore.saveAppState(createState());
    initialStore.saveContinuityState(createContinuity());

    const recovered = new LocalPersistenceStore(rootDir).load();
    const pendingRun = recovered.appData?.runs.find((run) => run.id === 'run-pending');
    const runningRun = recovered.appData?.runs.find((run) => run.id === 'run-running');
    const pendingTask = recovered.appData?.tasks.find((task) => task.id === 'task-pending');
    const runningTask = recovered.appData?.tasks.find((task) => task.id === 'task-running');

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
    assert.match(
      pendingRun.events.at(-1)?.message ?? '',
      /Restart recovery marked this pending run as interrupted/
    );
    assert.match(
      runningRun.events.at(-1)?.message ?? '',
      /Restart recovery marked this running run as interrupted/
    );
    assert.deepEqual(recovered.continuity, createContinuity());
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('LocalPersistenceStore falls back to the backup envelope when the primary file is invalid', () => {
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
    assert.equal(recovered.appData?.runs.find((run) => run.id === 'run-pending')?.status, 'interrupted');
    assert.equal(recovered.appData?.runs.find((run) => run.id === 'run-running')?.status, 'interrupted');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('LocalPersistenceStore persists routing settings', () => {
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
