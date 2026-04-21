import type {
  AgentProfile,
  AppState,
  CancelOrchestrationInput,
  CancelOrchestrationResult,
  CancelRunInput,
  CancelRunResult,
  CreateDraftConversationInput,
  CreateDraftConversationResult,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  GetOrchestrationRunResult,
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
} from '../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../shared/domain.js';
import type { LocalPersistenceStore } from './persistence.js';
import { AgentRegistryService } from './services/agentRegistryService.js';
import { AdapterManager } from './services/adapterManager.js';
import { McpRegistryService } from './services/mcpRegistryService.js';
import { OrchestrationExecutionService } from './services/orchestrationExecutionService.js';
import { RunManager } from './services/runManager.js';
import { SkillRegistryService } from './services/skillRegistryService.js';
import { StateManager } from './services/stateManager.js';
import { buildExecutionPlan, createPlanDraft as createPlanDraftFromService } from './services/plannerService.js';

type StateListener = (state: AppState) => void;
type RunEventListener = (event: RunEvent) => void;

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
  private readonly orchestrationExecution: OrchestrationExecutionService;
  private readonly stateManager: StateManager;
  private readonly adapterManager: AdapterManager;
  private readonly runManager: RunManager;

  public constructor(
    rootDir: string,
    private readonly persistenceStore: LocalPersistenceStore,
  ) {
    const persisted = this.persistenceStore.load();
    const persistedState = persisted.appData;

    this.agentRegistry = new AgentRegistryService(rootDir);
    this.skillRegistry = new SkillRegistryService(rootDir);
    this.mcpRegistry = new McpRegistryService(rootDir);
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
      (updater) => this.stateManager.updateState(updater),
      this.skillRegistry,
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

  public onStateChanged(listener: StateListener): () => void {
    return this.stateManager.onStateChanged(listener);
  }

  public onRunEvent(listener: RunEventListener): () => void {
    return this.stateManager.onRunEvent(listener);
  }
}
