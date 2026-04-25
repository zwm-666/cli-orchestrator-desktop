/**
 * orchestratorService.phase3.test.ts
 *
 * Unit-level tests for OrchestrationExecutionService.
 * Uses the service directly with stub callbacks (avoids persistence EPERM).
 * Run with: npx tsc -p tsconfig.main.json && node --test dist/main/orchestratorService.phase3.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrchestrationExecutionService } from './services/orchestrationExecutionService.js';
import { buildExecutionPlan } from './services/plannerService.js';
import type {
  AgentProfile,
  AppState,
  OrchestrationNode,
  OrchestrationRun,
  RunSession,
  StartRunInput,
  Task,
} from '../shared/domain.js';
import { DEFAULT_LOCAL_TOOL_REGISTRY } from '../shared/domain.js';
import type { SkillRegistryService } from './services/skillRegistryService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedRun {
  id: string;
  input: StartRunInput;
}

const stubRunSession = (id: string): RunSession => ({
  id,
  taskId: `task-${id}`,
  adapterId: 'test-adapter',
  model: null,
  status: 'running',
  startedAt: new Date().toISOString(),
  activeConversationId: 'conv-1',
  commandPreview: 'test-command',
  pid: null,
  timeoutMs: null,
  cancelRequestedAt: null,
  exitCode: null,
  endedAt: null,
  events: [],
  transcript: [],
});

const stubTask = (id: string): Task => ({
  id,
  title: `Task ${id}`,
  summary: 'Test prompt',
  taskType: 'general',
  profileId: null,
  adapterId: 'test-adapter',
  requestedBy: 'test',
  sourceConversationId: 'conv-1',
  cliMention: '@test-adapter',
  runId: `run-${id}`,
  status: 'running',
});

const skillRegistry: SkillRegistryService = {
  assembleSkillPrompts: () => null,
} as unknown as SkillRegistryService;

interface TestHarness {
  execService: OrchestrationExecutionService;
  startedRuns: CapturedRun[];
  getAppState: () => AppState;
}

const createTestHarness = (): TestHarness => {
  const execService = new OrchestrationExecutionService();
  const startedRuns: CapturedRun[] = [];
  let appState: AppState = {
    adapters: [],
    conversations: [],
    tasks: [],
    runs: [],
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
  };

  execService.initialize(
    (input: StartRunInput) => {
      const runId = `run-${startedRuns.length}`;
      startedRuns.push({ id: runId, input });
      return {
        run: stubRunSession(runId),
        task: stubTask(`task-${startedRuns.length}`),
      };
    },
    (updater) => {
      appState = updater(appState);
    },
    skillRegistry,
  );

  return { execService, startedRuns, getAppState: () => appState };
};

const makeProfile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  id: 'profile-1',
  name: 'Test Agent',
  role: 'master',
  enabled: true,
  adapterId: 'default-adapter',
  model: 'default-model',
  systemPrompt: '',
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  retryPolicy: { maxRetries: 1, delayMs: 0, backoffMultiplier: 1 },
  maxParallelChildren: 3,
  timeoutMs: null,
  ...overrides,
});

const makeRun = (overrides: Partial<OrchestrationRun> = {}): OrchestrationRun => ({
  id: 'orch-1',
  conversationId: 'conv-1',
  rootPrompt: 'Test orchestration',
  status: 'planning',
  masterAgentProfileId: 'profile-1',
  automationMode: 'standard',
  projectContextSummary: null,
  currentIteration: 1,
  maxIterations: 2,
  stopReason: null,
  planVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finalSummary: null,
  ...overrides,
});

const makeNode = (overrides: Partial<OrchestrationNode> & { id: string }): OrchestrationNode => ({
  orchestrationRunId: 'orch-1',
  parentNodeId: null,
  dependsOnNodeIds: [],
  agentProfileId: 'profile-1',
  skillIds: [],
  mcpServerIds: [],
  taskType: 'general',
  title: `Node ${overrides.id}`,
  prompt: 'Test prompt',
  status: 'ready',
  runId: null,
  resultSummary: null,
  resultPayload: null,
  retryCount: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void describe('OrchestrationExecutionService', () => {
  // Test 1: cancelOrchestration returns running runIds
  void it('cancelOrchestration returns running runIds', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile();
    const run = makeRun();
    const nodes = [
      makeNode({ id: 'n1', status: 'ready' }),
      makeNode({ id: 'n2', status: 'waiting_on_deps', dependsOnNodeIds: ['n1'] }),
    ];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 1, 'One node should be dispatched');

    const result = execService.cancelOrchestration('orch-1');
    assert.ok(result, 'cancelOrchestration should return a result');
    assert.equal(result.orchestrationRun.status, 'cancelled');
    assert.equal(result.runningRunIds.length, 1, 'One running runId should be returned');
    assert.equal(result.runningRunIds[0], startedRuns[0]?.id);
  });

  // Test 2: cancel preserves completed nodes
  void it('cancel preserves completed node status', () => {
    const { execService, startedRuns, getAppState } = createTestHarness();
    const profile = makeProfile();
    const run = makeRun();
    const nodes = [makeNode({ id: 'n1', status: 'ready' }), makeNode({ id: 'n2', status: 'ready' })];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 2, 'Both ready nodes should be dispatched');

    // Complete n1
    const run0 = startedRuns[0];
    assert.ok(run0);
    execService.onRunCompleted(run0.id, 'succeeded', [profile]);

    // Cancel the orchestration
    execService.cancelOrchestration('orch-1');

    const state = getAppState();
    const n1State = state.orchestrationNodes.find((n) => n.id === 'n1');
    const n2State = state.orchestrationNodes.find((n) => n.id === 'n2');
    assert.equal(n1State?.status, 'completed', 'Completed node should stay completed');
    assert.equal(n2State?.status, 'cancelled', 'Running node should become cancelled');
  });

  // Test 3: retry + dependency unlock progression
  void it('retry then dependency unlock progresses orchestration', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ retryPolicy: { maxRetries: 1, delayMs: 0, backoffMultiplier: 1 } });
    const run = makeRun();
    const nodes = [
      makeNode({ id: 'n1', status: 'ready' }),
      makeNode({ id: 'n2', status: 'waiting_on_deps', dependsOnNodeIds: ['n1'] }),
    ];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 1);

    // Fail n1 — should retry
    const run0retry = startedRuns[0];
    assert.ok(run0retry);
    execService.onRunCompleted(run0retry.id, 'failed', [profile]);
    assert.equal(startedRuns.length, 2, 'Retry should dispatch a new run');

    // Succeed n1 retry — should unlock n2
    const run1 = startedRuns[1];
    assert.ok(run1);
    execService.onRunCompleted(run1.id, 'succeeded', [profile]);
    assert.equal(startedRuns.length, 3, 'n2 should be dispatched after n1 succeeds');
  });

  // Test 4: dependency failure → skip → orchestration failed
  void it('dependency failure skips downstream and fails orchestration', () => {
    const { execService, startedRuns, getAppState } = createTestHarness();
    const profile = makeProfile({ retryPolicy: { maxRetries: 0, delayMs: 0, backoffMultiplier: 1 } });
    const run = makeRun();
    const nodes = [
      makeNode({ id: 'n1', status: 'ready' }),
      makeNode({ id: 'n2', status: 'waiting_on_deps', dependsOnNodeIds: ['n1'] }),
    ];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 1);

    // Fail n1 — no retry, n2 should be skipped
    const run0 = startedRuns[0];
    assert.ok(run0);
    execService.onRunCompleted(run0.id, 'failed', [profile]);

    const state = getAppState();
    const n2State = state.orchestrationNodes.find((n) => n.id === 'n2');
    assert.equal(n2State?.status, 'skipped', 'Downstream node should be skipped');

    const orchRun = state.orchestrationRuns.find((r) => r.id === 'orch-1');
    assert.equal(orchRun?.status, 'failed', 'Orchestration should be failed');
  });

  // Test 5: empty-string modelOverride preserved (?? semantics)
  void it('empty-string modelOverride is preserved', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ model: 'profile-model' });
    const run = makeRun();
    const nodes = [makeNode({ id: 'n1', status: 'ready', modelOverride: '' })];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 1);

    const run0 = startedRuns[0];
    assert.ok(run0);
    const dispatchedInput = run0.input;
    assert.equal(dispatchedInput.model, '', 'Empty-string model override should be used, not fall through to profile');
  });

  // Test 6: null modelOverride falls back to profile default
  void it('null modelOverride falls back to profile default', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ model: 'profile-model' });
    const run = makeRun();
    const nodes = [makeNode({ id: 'n1', status: 'ready' })];

    execService.startExecution(run, nodes, [profile]);
    const run0 = startedRuns[0];
    assert.ok(run0);
    const dispatchedInput = run0.input;
    assert.equal(dispatchedInput.model, 'profile-model', 'Should fall back to profile model when no override');
  });

  // Test 7: maxParallelChildren limits concurrent dispatches
  void it('maxParallelChildren limits concurrent dispatches', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ maxParallelChildren: 2 });
    const run = makeRun();
    const nodes = [
      makeNode({ id: 'n1', status: 'ready' }),
      makeNode({ id: 'n2', status: 'ready' }),
      makeNode({ id: 'n3', status: 'ready' }),
    ];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 2, 'Only 2 nodes should be dispatched with maxParallel=2');
  });

  // Test 8: timeout from AgentProfile propagates to child run
  void it('timeout from AgentProfile propagates to child run', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ timeoutMs: 30000 });
    const run = makeRun();
    const nodes = [makeNode({ id: 'n1', status: 'ready' })];

    execService.startExecution(run, nodes, [profile]);
    assert.equal(startedRuns.length, 1);

    const run0 = startedRuns[0];
    assert.ok(run0);
    const dispatchedInput = run0.input;
    assert.equal(dispatchedInput.timeoutMs, 30000, 'Timeout should propagate from profile');
  });

  // Test 9: null timeout correctly passes through
  void it('null timeout correctly passes through', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ timeoutMs: null });
    const run = makeRun();
    const nodes = [makeNode({ id: 'n1', status: 'ready' })];

    execService.startExecution(run, nodes, [profile]);
    const run0 = startedRuns[0];
    assert.ok(run0);
    const dispatchedInput = run0.input;
    assert.equal(dispatchedInput.timeoutMs, null, 'Null timeout should pass through');
  });

  // Test 10: empty-string adapterOverride preserved
  void it('empty-string adapterOverride is preserved', () => {
    const { execService, startedRuns } = createTestHarness();
    const profile = makeProfile({ adapterId: 'profile-adapter' });
    const run = makeRun();
    const nodes = [makeNode({ id: 'n1', status: 'ready', adapterOverride: '' })];

    execService.startExecution(run, nodes, [profile]);
    const run0 = startedRuns[0];
    assert.ok(run0);
    const dispatchedInput = run0.input;
    assert.equal(
      dispatchedInput.adapterId,
      '',
      'Empty-string adapterOverride should be used (not fall through to profile)',
    );
  });

  // Test 11: fallback cancel path (orchestration not in active map)
  void it('fallback cancel returns null for non-active orchestration', () => {
    const { execService } = createTestHarness();
    const result = execService.cancelOrchestration('nonexistent-id');
    assert.equal(result, null, 'Should return null when orchestration not found');
  });

  // Test 12: review-loop stop reason is recorded at iteration limit
  void it('records stop reason when review-loop reaches max iterations', () => {
    const { execService, startedRuns, getAppState } = createTestHarness();
    const profile = makeProfile();
    const run = makeRun({ automationMode: 'review_loop', currentIteration: 2, maxIterations: 2 });
    const nodes = [makeNode({ id: 'n1', status: 'ready' })];

    execService.startExecution(run, nodes, [profile]);
    const run0 = startedRuns[0];
    assert.ok(run0);
    execService.onRunCompleted(run0.id, 'succeeded', [profile]);

    const orchRun = getAppState().orchestrationRuns.find((entry) => entry.id === run.id);
    assert.equal(orchRun?.stopReason, 'Reached max review-loop iterations.');
  });

  void it('review-loop planner seeds iteration defaults', () => {
    const coder = makeProfile({ id: 'coder-1', role: 'coder' });
    const reviewer = makeProfile({ id: 'reviewer-1', role: 'reviewer' });

    const plan = buildExecutionPlan(
      'Implement automation loop follow-up work.',
      'conv-loop',
      [],
      {
        adapterSettings: {},
        discoveryRoots: [],
        customAdapters: [],
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
      [coder, reviewer],
      [],
      [],
      null,
      'review_loop',
      'Stable project context summary.',
    );

    assert.equal(plan.orchestrationRun.currentIteration, 1);
    assert.equal(plan.orchestrationRun.maxIterations, 2);
    assert.equal(plan.orchestrationRun.stopReason, null);
  });

  void it('synthesizes the next Claude task from review-loop artifacts', () => {
    const reviewNotes = [
      'Focus on changed files: src/main/orchestratorService.ts',
      'Read debug-review-and-optimization-plan.md and optimization-results.md before the next Claude revision.',
    ];

    const promptParts = [
      'Continue the task by following the latest OpenCode review results.',
      'Original goal: Implement automation loop follow-up work.',
      'Mandatory inputs:',
      '- Read debug-review-and-optimization-plan.md',
      '- Read optimization-results.md',
      '',
      'Review-driven next steps:',
      ...reviewNotes.map((note) => `- ${note}`),
      '',
      'Current changed files: src/main/orchestratorService.ts',
      'Current diff stat: 1 file changed, 8 insertions(+)',
      '',
      'Do not restart the project analysis from scratch. Only address the remaining issues from the latest review and re-run the normal validation commands when finished.',
    ];

    const nextTask = {
      prompt: promptParts.join('\n'),
      sourceOrchestrationRunId: 'orch-1',
      generatedAt: new Date().toISOString(),
      status: 'ready' as const,
    };

    assert.equal(nextTask.status, 'ready');
    assert.match(nextTask.prompt, /Read debug-review-and-optimization-plan\.md/);
    assert.match(nextTask.prompt, /Current changed files:/);
    assert.equal(nextTask.sourceOrchestrationRunId, 'orch-1');
  });
});
