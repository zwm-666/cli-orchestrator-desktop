import type {
  AgentProfile,
  AppState,
  CancelOrchestrationInput,
  CancelOrchestrationResult,
  CancelRunInput,
  CancelRunResult,
  CallCliAgentInput,
  CliAgentCallResult,
  CliAgentContext,
  CliAgentDecision,
  CliAgentStreamEvent,
  CreateDraftConversationInput,
  CreateDraftConversationResult,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  GetOrchestrationRunResult,
  LocalToolCallInput,
  LocalToolCallResult,
  LocalToolRegistry,
  McpServerDefinition,
  PlanDraftInput,
  PlanDraftResult,
  SaveAgentProfileInput,
  SaveMcpServerInput,
  SaveProjectContextInput,
  SaveSkillInput,
  SaveWorkbenchStateInput,
  SkillDefinition,
  StartOrchestrationInput,
  StartOrchestrationResult,
  StartRunInput,
  StartRunResult,
  RunEvent,
  SubagentStatusEntry,
  SubagentWorkStatus,
} from '../shared/domain.js';
import { DEFAULT_LOCAL_TOOL_REGISTRY, DEFAULT_WORKBENCH_STATE } from '../shared/domain.js';
import { getAgentProfileDisplayName } from '../shared/agentProfiles.js';
import type { LocalPersistenceStore } from './persistence.js';
import { AgentRegistryService } from './services/agentRegistryService.js';
import { AdapterManager } from './services/adapterManager.js';
import { CliAgentRouterService } from './services/cliAgentRouterService.js';
import { McpRegistryService } from './services/mcpRegistryService.js';
import { LocalToolRegistryService } from './services/localToolRegistryService.js';
import { OrchestrationExecutionService } from './services/orchestrationExecutionService.js';
import { RunManager } from './services/runManager.js';
import { SkillRegistryService } from './services/skillRegistryService.js';
import { StateManager } from './services/stateManager.js';
import { buildExecutionPlan, createPlanDraft as createPlanDraftFromService } from './services/plannerService.js';

type StateListener = (state: AppState) => void;
type RunEventListener = (event: RunEvent) => void;
type CliAgentEventListener = (event: CliAgentStreamEvent) => void;

const now = new Date('2026-03-20T10:15:00.000Z');

const isoMinutesAgo = (minutesAgo: number): string => {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString();
};

const seedConversations = () => {
  return [
    {
      id: 'conv-customer-onboarding',
      title: 'Customer onboarding orchestration',
      createdAt: isoMinutesAgo(180),
      updatedAt: isoMinutesAgo(8),
      draftInput: '@cli split this request into setup and QA tasks',
      messages: [
        {
          id: 'msg-1',
          role: 'customer' as const,
          content: 'We need a desktop shell that can route customer requests to local CLIs.',
          createdAt: isoMinutesAgo(180),
        },
        {
          id: 'msg-2',
          role: 'assistant' as const,
          content: 'I can parse the request, detect @cli mentions, and stage execution tasks.',
          createdAt: isoMinutesAgo(170),
        },
        {
          id: 'msg-3',
          role: 'customer' as const,
          content: 'Great. Show adapters, active runs, and the draft workflow in one place.',
          createdAt: isoMinutesAgo(12),
        },
      ],
    },
  ];
};

const createId = (prefix: string): string => {
  return `${prefix}-${crypto.randomUUID()}`;
};

const buildInitialState = (
  persistedState: ReturnType<LocalPersistenceStore['load']>['appData'],
  agentProfiles: AgentProfile[],
  skills: SkillDefinition[],
  mcpServers: McpServerDefinition[],
): AppState => {
  return {
    adapters: [],
    conversations: persistedState?.conversations ?? seedConversations(),
    tasks: persistedState?.tasks ?? [],
    runs: persistedState?.runs ?? [],
    subagentStatuses: persistedState?.subagentStatuses ?? [],
    localToolRegistry: persistedState?.localToolRegistry ?? structuredClone(DEFAULT_LOCAL_TOOL_REGISTRY),
    localToolCallLogs: persistedState?.localToolCallLogs ?? [],
    nextClaudeTask: persistedState?.nextClaudeTask ?? {
      prompt: '',
      sourceOrchestrationRunId: null,
      generatedAt: null,
      status: 'idle',
    },
    agentProfiles,
    skills,
    mcpServers,
    projectContext: persistedState?.projectContext ?? { summary: '', updatedAt: null },
    orchestrationRuns: persistedState?.orchestrationRuns ?? [],
    orchestrationNodes: persistedState?.orchestrationNodes ?? [],
    workbench: persistedState?.workbench ?? structuredClone(DEFAULT_WORKBENCH_STATE),
  };
};

export class OrchestratorService {
  private readonly agentRegistry: AgentRegistryService;
  private readonly skillRegistry: SkillRegistryService;
  private readonly mcpRegistry: McpRegistryService;
  private readonly localToolRegistry: LocalToolRegistryService;
  private readonly cliAgentRouter: CliAgentRouterService;
  private readonly orchestrationExecution: OrchestrationExecutionService;
  private readonly stateManager: StateManager;
  private readonly adapterManager: AdapterManager;
  private readonly runManager: RunManager;
  private readonly cliAgentEventListeners = new Set<CliAgentEventListener>();

  public constructor(
    rootDir: string,
    private readonly persistenceStore: LocalPersistenceStore,
  ) {
    const persisted = this.persistenceStore.load();
    const persistedState = persisted.appData;

    this.agentRegistry = new AgentRegistryService(rootDir);
    this.skillRegistry = new SkillRegistryService(rootDir);
    this.mcpRegistry = new McpRegistryService(rootDir);
    this.localToolRegistry = new LocalToolRegistryService(rootDir);
    this.cliAgentRouter = new CliAgentRouterService(rootDir, this.localToolRegistry);
    this.orchestrationExecution = new OrchestrationExecutionService();

    this.agentRegistry.loadFromConfig();
    this.skillRegistry.loadFromConfig();
    this.mcpRegistry.loadFromConfig();

    if (persistedState?.agentProfiles) {
      this.agentRegistry.mergePersistedProfiles(persistedState.agentProfiles);
    }
    if (persistedState?.skills) {
      this.skillRegistry.mergePersistedSkills(persistedState.skills);
    }
    if (persistedState?.mcpServers) {
      this.mcpRegistry.mergePersistedServers(persistedState.mcpServers);
    }

    const initialState = buildInitialState(
      persistedState,
      this.agentRegistry.getAll(),
      this.skillRegistry.getAll(),
      this.mcpRegistry.getAll(),
    );

    this.stateManager = new StateManager(initialState, this.persistenceStore);
    this.adapterManager = new AdapterManager(rootDir, this.persistenceStore, persisted.routing, () => this.stateManager.getState().runs);
    this.stateManager.setAdaptersProvider(() => this.adapterManager.getAdapters());
    this.runManager = new RunManager(rootDir, this.stateManager, this.adapterManager, this.agentRegistry, this.orchestrationExecution);

    this.orchestrationExecution.initialize(
      (input) => this.runManager.startRun(input),
      (updater) => {
        this.stateManager.updateState(updater);
      },
      this.skillRegistry,
      () => this.stateManager.getAppState(),
    );

    this.stateManager.refreshDerivedState();
    this.persistenceStore.saveAppState(this.stateManager.getAppState());
  }

  public getAppState(): AppState {
    return this.stateManager.getAppState();
  }

  public refreshAdapters(): AppState {
    this.adapterManager.refreshAdapters();
    this.stateManager.refreshDerivedState();
    return this.stateManager.getAppState();
  }

  public async refreshLocalTools(): Promise<LocalToolRegistry> {
    const registry = await this.localToolRegistry.refreshRegistry(this.adapterManager.getRoutingSettings());
    this.stateManager.updateState((state) => ({
      ...state,
      localToolRegistry: registry,
    }));
    return registry;
  }

  public async callLocalTool(input: LocalToolCallInput): Promise<LocalToolCallResult> {
    const result = await this.localToolRegistry.callLocalTool(input, {
      onStatus: (status, detail, callId) => {
        this.upsertLocalToolSubagentStatus(input, status, detail, callId);
      },
    });
    this.stateManager.updateState((state) => ({
      ...state,
      localToolCallLogs: this.localToolRegistry.trimCallLogs([result.logEntry, ...state.localToolCallLogs]),
    }));
    return result;
  }

  public decideCliAgentRoute(prompt: string, context: CliAgentContext = {}): CliAgentDecision {
    return this.cliAgentRouter.decideRoute(prompt, context);
  }

  public async callCliAgent(input: CallCliAgentInput): Promise<CliAgentCallResult> {
    const result = await this.cliAgentRouter.callCliAgent(input, (event) => {
      this.cliAgentEventListeners.forEach((listener) => {
        listener(structuredClone(event));
      });
    });
    this.stateManager.updateState((state) => ({
      ...state,
      localToolCallLogs: this.localToolRegistry.trimCallLogs([result.logEntry, ...state.localToolCallLogs]),
    }));
    return result;
  }

  public getRoutingSettings() {
    return this.adapterManager.getRoutingSettings();
  }

  public getProjectContext(): AppState['projectContext'] {
    return this.stateManager.getProjectContext();
  }

  public saveProjectContext(input: SaveProjectContextInput): AppState['projectContext'] {
    return this.stateManager.saveProjectContext(input);
  }

  public saveWorkbenchState(input: SaveWorkbenchStateInput): AppState {
    return this.stateManager.saveWorkbenchState(input);
  }

  public getNextClaudeTask(): AppState['nextClaudeTask'] {
    return this.stateManager.getNextClaudeTask();
  }

  public getWorkbenchWorkspaceRoot(): string | null {
    return this.stateManager.getWorkbenchWorkspaceRoot();
  }

  public setWorkbenchWorkspaceRoot(workspaceRoot: string | null): AppState {
    return this.stateManager.setWorkbenchWorkspaceRoot(workspaceRoot);
  }

  public updateRoutingSettings(settings: ReturnType<AdapterManager['getRoutingSettings']>): ReturnType<AdapterManager['getRoutingSettings']> {
    const nextSettings = this.adapterManager.updateRoutingSettings(settings);
    this.stateManager.refreshDerivedState();
    return nextSettings;
  }

  public createDraftConversation(input: CreateDraftConversationInput): CreateDraftConversationResult {
    return this.runManager.createDraftConversation(input);
  }

  public createPlanDraft(input: PlanDraftInput): PlanDraftResult {
    return createPlanDraftFromService(input, this.adapterManager.getEnabledUserFacingAdapters(), this.adapterManager.getRoutingSettings());
  }

  public startOrchestration(input: StartOrchestrationInput): StartOrchestrationResult {
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new Error('Orchestration prompt is required.');
    }

    const plan = buildExecutionPlan(
      prompt,
      input.conversationId ?? createId('conv'),
      this.adapterManager.getEnabledUserFacingAdapters(),
      this.adapterManager.getRoutingSettings(),
      this.agentRegistry.getAll(),
      this.skillRegistry.getAll(),
      this.mcpRegistry.getAll(),
      input.masterAgentProfileId ?? null,
      input.automationMode ?? 'standard',
      this.stateManager.getState().projectContext.summary || null,
      input.maxIterations ?? null,
      input.discussionConfig ?? null,
      input.executionStyle ?? 'planner',
      input.participantProfileIds ?? [],
    );

    const hasAdapterOverride = input.adapterOverride != null;
    const hasModelOverride = input.modelOverride != null;
    if (hasAdapterOverride || hasModelOverride) {
      for (let i = 0; i < plan.nodes.length; i++) {
        const node = plan.nodes[i];
        if (!node) continue;
        plan.nodes[i] = {
          ...node,
          ...(hasAdapterOverride ? { adapterOverride: input.adapterOverride } : {}),
          ...(hasModelOverride ? { modelOverride: input.modelOverride } : {}),
        };
      }
    }

    const result = this.orchestrationExecution.startExecution(plan.orchestrationRun, plan.nodes, this.agentRegistry.getAll());
    return { orchestrationRun: result.orchestrationRun, nodes: result.nodes };
  }

  public cancelOrchestration(input: CancelOrchestrationInput): CancelOrchestrationResult {
    const orchestration = this.orchestrationExecution.cancelOrchestration(input.orchestrationRunId);
    if (!orchestration) {
      const currentState = this.stateManager.getState();
      const existingRun = currentState.orchestrationRuns.find((entry) => entry.id === input.orchestrationRunId);
      if (!existingRun) {
        throw new Error(`Orchestration run ${input.orchestrationRunId} not found.`);
      }

      const cancelled = { ...existingRun, status: 'cancelled' as const, updatedAt: new Date().toISOString() };
      const terminalStatuses = new Set(['completed', 'failed', 'skipped', 'cancelled']);

      this.stateManager.updateState((state) => ({
        ...state,
        orchestrationRuns: state.orchestrationRuns.map((entry) => (entry.id === cancelled.id ? cancelled : entry)),
        orchestrationNodes: state.orchestrationNodes.map((node) => {
          if (node.orchestrationRunId !== cancelled.id || terminalStatuses.has(node.status)) {
            return node;
          }
          return { ...node, status: 'cancelled' as const };
        }),
      }));

      return { orchestrationRun: structuredClone(cancelled) };
    }

    for (const runId of orchestration.runningRunIds) {
      this.runManager.requestRunTermination(runId, 'cancelled', 'Parent orchestration was cancelled.');
    }

    return { orchestrationRun: orchestration.orchestrationRun };
  }

  public getOrchestrationRun(input: GetOrchestrationRunInput): GetOrchestrationRunResult {
    const active = this.orchestrationExecution.getOrchestration(input.orchestrationRunId);
    if (active) {
      return active;
    }

    const currentState = this.stateManager.getState();
    const run = currentState.orchestrationRuns.find((entry) => entry.id === input.orchestrationRunId);
    if (!run) {
      throw new Error(`Orchestration run ${input.orchestrationRunId} not found.`);
    }

    return {
      orchestrationRun: structuredClone(run),
      nodes: structuredClone(currentState.orchestrationNodes.filter((node) => node.orchestrationRunId === run.id)),
    };
  }

  public getAgentProfiles(): AgentProfile[] {
    return this.agentRegistry.getAll();
  }

  public saveAgentProfile(input: SaveAgentProfileInput): AgentProfile {
    const saved = this.agentRegistry.save(input.profile);
    this.stateManager.updateState((state) => ({ ...state, agentProfiles: this.agentRegistry.getAll() }));
    return saved;
  }

  public deleteAgentProfile(input: DeleteAgentProfileInput): void {
    this.agentRegistry.delete(input.profileId);
    this.stateManager.updateState((state) => ({ ...state, agentProfiles: this.agentRegistry.getAll() }));
  }

  public getSkills(): SkillDefinition[] {
    return this.skillRegistry.getAll();
  }

  public saveSkill(input: SaveSkillInput): SkillDefinition {
    const saved = this.skillRegistry.save(input.skill);
    this.stateManager.updateState((state) => ({ ...state, skills: this.skillRegistry.getAll() }));
    return saved;
  }

  public deleteSkill(input: DeleteSkillInput): void {
    this.skillRegistry.delete(input.skillId);
    this.stateManager.updateState((state) => ({ ...state, skills: this.skillRegistry.getAll() }));
  }

  public getMcpServers(): McpServerDefinition[] {
    return this.mcpRegistry.getAll();
  }

  public saveMcpServer(input: SaveMcpServerInput): McpServerDefinition {
    const saved = this.mcpRegistry.save(input.server);
    this.stateManager.updateState((state) => ({ ...state, mcpServers: this.mcpRegistry.getAll() }));
    return saved;
  }

  public deleteMcpServer(input: DeleteMcpServerInput): void {
    this.mcpRegistry.delete(input.serverId);
    this.stateManager.updateState((state) => ({ ...state, mcpServers: this.mcpRegistry.getAll() }));
  }

  public startRun(input: StartRunInput): StartRunResult {
    return this.runManager.startRun(input);
  }

  public cancelRun(input: CancelRunInput): CancelRunResult {
    return this.runManager.cancelRun(input);
  }

  public getRecentRunsByCategory(taskType: string, limit = 5) {
    return this.runManager.getRecentRunsByCategory(taskType, limit);
  }

  private upsertLocalToolSubagentStatus(input: LocalToolCallInput, status: SubagentWorkStatus, detail: string, callId: string): void {
    const profile = input.profileId ? this.agentRegistry.getAll().find((entry) => entry.id === input.profileId) ?? null : null;
    const entry: SubagentStatusEntry = {
      id: callId,
      profileId: input.profileId ?? null,
      adapterId: null,
      runId: input.runId ?? null,
      orchestrationNodeId: input.orchestrationNodeId ?? null,
      agentLabel: profile ? getAgentProfileDisplayName(profile) : input.toolName,
      status,
      detail,
      updatedAt: new Date().toISOString(),
    };

    this.stateManager.upsertSubagentStatus(entry);
  }

  public onStateChanged(listener: StateListener): () => void {
    return this.stateManager.onStateChanged(listener);
  }

  public onRunEvent(listener: RunEventListener): () => void {
    return this.stateManager.onRunEvent(listener);
  }

  public onCliAgentEvent(listener: CliAgentEventListener): () => void {
    this.cliAgentEventListeners.add(listener);

    return () => {
      this.cliAgentEventListeners.delete(listener);
    };
  }
}
