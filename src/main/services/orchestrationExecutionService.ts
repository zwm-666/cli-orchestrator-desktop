/**
 * OrchestrationExecutionService – Phase 3: Schedules nodes, maintains
 * dependency state, starts/cancels/retries nodes, reacts to node completion
 * and unlocks downstream nodes.
 *
 * The orchestration state machine:
 * 1. planning  -> executing  (nodes created, first nodes dispatched)
 * 2. executing -> aggregating (all work nodes done, aggregation node starts)
 * 3. aggregating -> completed | failed
 * 4. Any state -> cancelled (user cancellation)
 * 5. Any state -> failed (unrecoverable error)
 */

import type {
  AgentProfile,
  AppState,
  OrchestrationNode,
  OrchestrationNodeStatus,
  OrchestrationRun,
  RunSession,
  StartRunInput,
  StartRunResult,
} from '../../shared/domain.js';
import { getAgentProfileDisplayName, resolveAgentProfileModel } from '../../shared/agentProfiles.js';
import type { SkillRegistryService } from './skillRegistryService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeCompletionCallback = (node: OrchestrationNode) => void;
export type RunStartCallback = (input: StartRunInput) => StartRunResult;
export type StateUpdateCallback = (updater: (state: AppState) => AppState) => void;

interface OrchestrationContext {
  orchestrationRun: OrchestrationRun;
  nodes: OrchestrationNode[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OrchestrationExecutionService {
  private readonly activeOrchestrations = new Map<string, OrchestrationContext>();
  private onRunStart: RunStartCallback | null = null;
  private onStateUpdate: StateUpdateCallback | null = null;
  private skillRegistry: SkillRegistryService | null = null;
  private getStateSnapshot: (() => AppState) | null = null;

  /** Wire up callbacks to the main orchestrator service. */
  public initialize(
    onRunStart: RunStartCallback,
    onStateUpdate: StateUpdateCallback,
    skillRegistry: SkillRegistryService,
    getStateSnapshot?: () => AppState,
  ): void {
    this.onRunStart = onRunStart;
    this.onStateUpdate = onStateUpdate;
    this.skillRegistry = skillRegistry;
    this.getStateSnapshot = getStateSnapshot ?? null;
  }

  /**
   * Begin executing an orchestration plan.
   * Transitions the orchestration run from 'planning' to 'executing'
   * and dispatches all initially-ready nodes.
   */
  public startExecution(
    orchestrationRun: OrchestrationRun,
    nodes: OrchestrationNode[],
    agentProfiles: AgentProfile[],
  ): { orchestrationRun: OrchestrationRun; nodes: OrchestrationNode[] } {
    const context: OrchestrationContext = {
      orchestrationRun: {
        ...orchestrationRun,
        status: 'executing',
        updatedAt: new Date().toISOString(),
      },
      nodes: [...nodes],
    };

    this.activeOrchestrations.set(orchestrationRun.id, context);

    // Dispatch all initially-ready nodes
    this.dispatchReadyNodes(context, agentProfiles);

    // Update AppState
    this.persistContext(context);

    return {
      orchestrationRun: structuredClone(context.orchestrationRun),
      nodes: structuredClone(context.nodes),
    };
  }

  /**
   * Called when a RunSession completes (from the finalizeRunOnClose flow).
   * Updates the corresponding orchestration node and potentially unlocks
   * downstream nodes.
   */
  public onRunCompleted(runId: string, runStatus: RunSession['status'], agentProfiles: AgentProfile[]): void {
    // Find which orchestration context owns this runId
    for (const [, context] of this.activeOrchestrations) {
      const nodeIndex = context.nodes.findIndex((n) => n.runId === runId);
      if (nodeIndex < 0) continue;

      const node = context.nodes[nodeIndex];
      if (!node) continue;
      const isSuccess = runStatus === 'succeeded';
      const nodeStatus: OrchestrationNodeStatus = isSuccess ? 'completed' : 'failed';
      const profile = node.agentProfileId ? (agentProfiles.find((p) => p.id === node.agentProfileId) ?? null) : null;
      const persistedNode = this.getStateSnapshot?.().orchestrationNodes.find((entry) => entry.id === node.id) ?? null;
      const resultPayload = persistedNode?.resultPayload ?? node.resultPayload ?? null;
      const transcriptSummary = resultPayload?.transcriptSummary?.trim() ?? '';
      const resultSummary = transcriptSummary.length > 0
        ? transcriptSummary
        : isSuccess
          ? 'Node completed successfully.'
          : `Node failed with run status: ${runStatus}.`;

      // Update node status
      context.nodes[nodeIndex] = {
        ...node,
        status: nodeStatus,
        resultPayload,
        resultSummary,
      };

      // Check if we should retry on failure
      if (!isSuccess && this.shouldRetry(node, agentProfiles)) {
        const retryDelayMs = profile?.retryPolicy.delayMs ?? 0;
        context.nodes[nodeIndex] = {
          ...node,
          status: 'ready',
          retryCount: node.retryCount + 1,
          runId: null,
          resultSummary: null,
        };

        this.persistContext(context);

        const orchestrationId = context.orchestrationRun.id;
        const retryDispatch = (): void => {
          const activeContext = this.activeOrchestrations.get(orchestrationId);
          if (activeContext?.orchestrationRun.status !== 'executing') {
            return;
          }

          this.dispatchReadyNodes(activeContext, agentProfiles);
          this.persistContext(activeContext);
        };

        if (retryDelayMs <= 0) {
          retryDispatch();
          return;
        }

        setTimeout(() => {
          retryDispatch();
        }, retryDelayMs);

        return;
      }

      // Update orchestration state
      this.advanceOrchestration(context, agentProfiles);
      this.persistContext(context);
      return;
    }
  }

  /**
   * Cancel an entire orchestration run.
   * All non-terminal nodes are marked as cancelled.
   * Returns the IDs of runs that were currently running when cancellation was requested.
   */
  public cancelOrchestration(
    orchestrationRunId: string,
  ): { orchestrationRun: OrchestrationRun; runningRunIds: string[] } | null {
    const context = this.activeOrchestrations.get(orchestrationRunId);
    if (!context) return null;

    // Collect IDs of currently running nodes
    const runningRunIds = context.nodes.flatMap((node) => {
      return node.status === 'running' && node.runId ? [node.runId] : [];
    });

    context.orchestrationRun = {
      ...context.orchestrationRun,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };

    context.nodes = context.nodes.map((node) => {
      if (this.isNodeTerminal(node.status)) return node;
      return { ...node, status: 'cancelled' as OrchestrationNodeStatus };
    });

    this.persistContext(context);
    this.activeOrchestrations.delete(orchestrationRunId);

    return { orchestrationRun: structuredClone(context.orchestrationRun), runningRunIds };
  }

  /** Get the current state of an orchestration. */
  public getOrchestration(orchestrationRunId: string): OrchestrationContext | null {
    const context = this.activeOrchestrations.get(orchestrationRunId);
    return context
      ? { orchestrationRun: structuredClone(context.orchestrationRun), nodes: structuredClone(context.nodes) }
      : null;
  }

  // ---------------------------------------------------------------------------
  // Internal scheduling logic
  // ---------------------------------------------------------------------------

  /**
   * Dispatch all nodes whose dependencies are satisfied and that are in 'ready' state.
   * Respects maxParallelChildren from the master agent profile.
   */
  private dispatchReadyNodes(context: OrchestrationContext, agentProfiles: AgentProfile[]): void {
    if (!this.onRunStart) return;

    const masterProfile = context.orchestrationRun.masterAgentProfileId
      ? (agentProfiles.find((p) => p.id === context.orchestrationRun.masterAgentProfileId) ?? null)
      : null;
    const maxParallel = masterProfile?.maxParallelChildren ?? 3;

    // Count currently running nodes
    const runningCount = context.nodes.filter((n) => n.status === 'running').length;
    let availableSlots = maxParallel - runningCount;

    // Unlock waiting_on_deps nodes whose dependencies are all completed
    for (let i = 0; i < context.nodes.length; i++) {
      const node = context.nodes[i];
      if (node?.status !== 'waiting_on_deps') continue;
      const allDepsComplete = node.dependsOnNodeIds.every((depId) => {
        const dep = context.nodes.find((n) => n.id === depId);
        return dep?.status === 'completed';
      });
      // Check if any dependency failed (node should be skipped)
      const anyDepFailed = node.dependsOnNodeIds.some((depId) => {
        const dep = context.nodes.find((n) => n.id === depId);
        return dep?.status === 'failed' || dep?.status === 'cancelled';
      });

      if (anyDepFailed) {
        context.nodes[i] = {
          ...node,
          status: 'skipped',
          resultSummary: 'Skipped because a dependency failed or was cancelled.',
        };
      } else if (allDepsComplete) {
        context.nodes[i] = { ...node, status: 'ready' };
      }
    }

    // Dispatch ready nodes up to available slots
    for (let i = 0; i < context.nodes.length && availableSlots > 0; i++) {
      const node = context.nodes[i];
      if (node?.status !== 'ready') continue;

      try {
        // Build the enriched prompt with skill injection
        const enrichedPrompt = this.buildNodePrompt(node, context, agentProfiles);

        const agentProfile = node.agentProfileId
          ? (agentProfiles.find((p) => p.id === node.agentProfileId) ?? null)
          : null;
        const adapter = agentProfile
          ? this.getStateSnapshot?.().adapters.find((entry) => entry.id === agentProfile.adapterId) ?? null
          : null;

        const result = this.onRunStart({
          title: node.title,
          prompt: enrichedPrompt,
          adapterId: node.adapterOverride ?? agentProfile?.adapterId ?? '',
          model: node.modelOverride ?? (agentProfile ? resolveAgentProfileModel(agentProfile, adapter) : null),
          taskType: node.taskType,
          profileId: node.agentProfileId,
          timeoutMs: agentProfile?.timeoutMs ?? null,
        });

        context.nodes[i] = {
          ...node,
          status: 'running',
          runId: result.run.id,
        };

        availableSlots--;
      } catch (error) {
        context.nodes[i] = {
          ...node,
          status: 'failed',
          resultSummary: `Failed to dispatch: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  /**
   * Build the final prompt for a node following the prompt assembly order:
   * 1. Global system instruction (omitted here, handled by adapter)
   * 2. AgentProfile.systemPrompt
   * 3. SkillDefinition.promptTemplate
   * 4. Original user task segment
   * 5. Upstream node result summaries
   * 6. MCP tool instructions (passed via adapter config)
   * 7. Output format constraints
   */
  private buildNodePrompt(
    node: OrchestrationNode,
    context: OrchestrationContext,
    agentProfiles: AgentProfile[],
  ): string {
    const parts: string[] = [];

    // 2. Agent profile system prompt
    const profile = node.agentProfileId ? (agentProfiles.find((p) => p.id === node.agentProfileId) ?? null) : null;
    if (profile?.systemPrompt) {
      parts.push(profile.systemPrompt);
    }

    // 3. Skill prompt injection
    if (this.skillRegistry && node.skillIds.length > 0) {
      const skillPrompt = this.skillRegistry.assembleSkillPrompts(node.skillIds);
      if (skillPrompt) parts.push(skillPrompt);
    }

    // 4. Original task prompt
    parts.push(node.prompt);

    // 5. Upstream node result summaries
    const upstreamSummaries = node.dependsOnNodeIds
      .map((depId) => context.nodes.find((n) => n.id === depId))
      .filter((n): n is OrchestrationNode => n !== undefined && n.resultSummary !== null)
      .map((n) => `[${n.title}]: ${n.resultSummary}`)
      .join('\n');
    if (upstreamSummaries) {
      parts.push(`\n--- Upstream Results ---\n${upstreamSummaries}`);
    }

    const upstreamArtifacts = node.dependsOnNodeIds
      .map((depId) => context.nodes.find((n) => n.id === depId)?.resultPayload)
      .filter((artifact): artifact is NonNullable<OrchestrationNode['resultPayload']> => artifact !== null)
      .map((artifact) => {
        const lines = [
          artifact.transcriptSummary ? `Transcript summary: ${artifact.transcriptSummary}` : null,
          artifact.diffStat ? `Diff stat: ${artifact.diffStat}` : null,
          artifact.changedFiles.length > 0 ? `Changed files: ${artifact.changedFiles.join(', ')}` : null,
          artifact.reviewNotes.length > 0 ? `Review notes: ${artifact.reviewNotes.join(' | ')}` : null,
        ].filter((entry): entry is string => entry !== null);

        return lines.length > 0 ? lines.join('\n') : null;
      })
      .filter((entry): entry is string => entry !== null)
      .join('\n\n');

    if (upstreamArtifacts) {
      parts.push(`\n--- Upstream Handoff Artifacts ---\n${upstreamArtifacts}`);
    }

    return parts.join('\n\n');
  }

  private getDiscussionNodes(context: OrchestrationContext): OrchestrationNode[] {
    return context.nodes.filter((node) => typeof node.discussionRound === 'number');
  }

  private getDiscussionParticipantIds(context: OrchestrationContext, agentProfiles: AgentProfile[]): (string | null)[] {
    const configuredIds = context.orchestrationRun.discussionConfig?.participantProfileIds ?? [];
    const enabledIdSet = new Set(agentProfiles.filter((profile) => profile.enabled).map((profile) => profile.id));
    const configuredParticipants = configuredIds.filter((entry) => enabledIdSet.has(entry));
    if (configuredParticipants.length > 0) {
      return configuredParticipants;
    }

    const initialParticipants = this.getDiscussionNodes(context)
      .filter((node) => node.discussionRound === 1)
      .map((node) => node.agentProfileId ?? null);

    return initialParticipants.length > 0 ? initialParticipants : [null];
  }

  private getDiscussionKeyword(context: OrchestrationContext): string {
    return context.orchestrationRun.discussionConfig?.consensusKeyword.trim() || '<CONSENSUS>';
  }

  private hasDiscussionConsensus(context: OrchestrationContext): boolean {
    const discussionConfig = context.orchestrationRun.discussionConfig;
    const latestRound = Math.max(...this.getDiscussionNodes(context).map((node) => node.discussionRound ?? 0), 0);
    if (!discussionConfig || latestRound < 1) {
      return false;
    }

    const latestRoundNodes = this.getDiscussionNodes(context).filter((node) => node.discussionRound === latestRound);
    if (latestRoundNodes.length === 0) {
      return false;
    }

    if (discussionConfig.consensusStrategy === 'summary_match') {
      const normalizedSummaries = latestRoundNodes
        .map((node) => node.resultSummary?.trim().toLowerCase() ?? '')
        .filter((entry) => entry.length > 0);
      return normalizedSummaries.length > 1 && normalizedSummaries.every((entry) => entry === normalizedSummaries[0]);
    }

    const keyword = this.getDiscussionKeyword(context).toLowerCase();
    return latestRoundNodes.some((node) => {
      const haystacks = [node.resultSummary, node.resultPayload?.transcriptSummary, node.resultPayload?.reviewNotes.join(' | ') ?? ''];
      return haystacks.some((entry) => entry?.toLowerCase().includes(keyword));
    });
  }

  private createDiscussionRoundNodes(context: OrchestrationContext, agentProfiles: AgentProfile[], nextRound: number): void {
    const participantIds = this.getDiscussionParticipantIds(context, agentProfiles);
    const previousRoundNodes = this.getDiscussionNodes(context).filter((node) => node.discussionRound === nextRound - 1);
    const previousRoundIds = previousRoundNodes.map((node) => node.id);
    const conversationTranscript = this.getDiscussionNodes(context)
      .filter((node) => this.isNodeTerminal(node.status))
      .map((node) => {
        const profile = node.agentProfileId ? agentProfiles.find((entry) => entry.id === node.agentProfileId) ?? null : null;
        const profileName = profile ? getAgentProfileDisplayName(profile) : node.title;
        return `- ${profileName} [Round ${node.discussionRound ?? 1}]: ${node.resultSummary ?? 'No summary recorded.'}`;
      })
      .join('\n');
    const keyword = this.getDiscussionKeyword(context);
    let previousNodeId: string | null = previousRoundIds.at(-1) ?? null;

    participantIds.forEach((participantId, index) => {
      const nodeId = `orch-node-${crypto.randomUUID()}`;
      const dependsOnNodeIds = [
        ...previousRoundIds,
        ...(previousNodeId && !previousRoundIds.includes(previousNodeId) ? [previousNodeId] : []),
      ];

      context.nodes.push({
        id: nodeId,
        orchestrationRunId: context.orchestrationRun.id,
        parentNodeId: previousNodeId,
        dependsOnNodeIds,
        agentProfileId: participantId,
        skillIds: [],
        mcpServerIds: [],
        taskType: 'research',
        title: `Discussion round ${nextRound} · perspective ${index + 1}`,
        prompt: [
          `Round ${nextRound} discussion. Continue the same topic with all prior discussion context below.`,
          `Only include ${keyword} if the group has actually converged.`,
          '',
          `Topic:\n${context.orchestrationRun.rootPrompt}`,
          '',
          'Discussion so far:',
          conversationTranscript || '- No prior discussion summaries recorded.',
          '',
          'Respond with your updated position, what changed, and concrete next steps.',
        ].join('\n'),
        status: dependsOnNodeIds.length > 0 ? 'waiting_on_deps' : 'ready',
        runId: null,
        resultSummary: null,
        resultPayload: null,
        retryCount: 0,
        discussionRound: nextRound,
        discussionRole: 'speaker',
      });

      previousNodeId = nodeId;
    });

    context.orchestrationRun = {
      ...context.orchestrationRun,
      currentIteration: nextRound,
      updatedAt: new Date().toISOString(),
    };
  }

  private createDiscussionSynthesisNode(context: OrchestrationContext, agentProfiles: AgentProfile[]): boolean {
    const synthesisExists = this.getDiscussionNodes(context).some((node) => node.discussionRole === 'synthesizer');
    if (synthesisExists) {
      return false;
    }

    const participantIds = this.getDiscussionParticipantIds(context, agentProfiles).filter((entry): entry is string => entry !== null);
    const synthesisProfile =
      (context.orchestrationRun.masterAgentProfileId
        ? (agentProfiles.find((profile) => profile.id === context.orchestrationRun.masterAgentProfileId) ?? null)
        : null) ??
      (participantIds.length > 0 ? (agentProfiles.find((profile) => profile.id === participantIds[0]) ?? null) : null);
    const discussionNodeIds = this.getDiscussionNodes(context).map((node) => node.id);
    if (discussionNodeIds.length === 0) {
      return false;
    }

    context.nodes.push({
      id: `orch-node-${crypto.randomUUID()}`,
      orchestrationRunId: context.orchestrationRun.id,
      parentNodeId: discussionNodeIds.at(-1) ?? null,
      dependsOnNodeIds: discussionNodeIds,
      agentProfileId: synthesisProfile?.id ?? null,
      skillIds: [],
      mcpServerIds: [],
      taskType: 'planning',
      title: 'Discussion final synthesis',
      prompt: [
        'Synthesize the full discussion into one final answer.',
        `Topic:\n${context.orchestrationRun.rootPrompt}`,
        '',
        'Use the upstream discussion results to produce a final recommendation, trade-offs, and next-step plan.',
      ].join('\n'),
      status: 'waiting_on_deps',
      runId: null,
      resultSummary: null,
      resultPayload: null,
      retryCount: 0,
      discussionRound: context.orchestrationRun.currentIteration,
      discussionRole: 'synthesizer',
    });

    context.orchestrationRun = {
      ...context.orchestrationRun,
      stopReason: this.hasDiscussionConsensus(context)
        ? `Consensus keyword detected: ${this.getDiscussionKeyword(context)}`
        : 'Reached maximum discussion rounds.',
      updatedAt: new Date().toISOString(),
    };

    return true;
  }

  private finalizeContext(context: OrchestrationContext, status: OrchestrationRun['status'], stopReason: string | null = null): void {
    context.orchestrationRun = {
      ...context.orchestrationRun,
      status,
      updatedAt: new Date().toISOString(),
      finalSummary: this.buildFinalSummary(context),
      stopReason: stopReason ?? context.orchestrationRun.stopReason,
    };
    this.activeOrchestrations.delete(context.orchestrationRun.id);
  }

  /**
   * After a node completes, advance the orchestration state machine.
   * Loops to dispatch multiple ready nodes and reach terminal state.
   */
  private advanceOrchestration(context: OrchestrationContext, agentProfiles: AgentProfile[]): void {
    for (let iteration = 0; iteration < context.nodes.length + 1; iteration++) {
      const allTerminal = context.nodes.every((n) => this.isNodeTerminal(n.status));
      const anyRunning = context.nodes.some((n) => n.status === 'running');
      const allSucceeded = context.nodes.every((n) => n.status === 'completed' || n.status === 'skipped');

      if (allTerminal) {
        if (context.orchestrationRun.automationMode === 'discussion') {
          const consensusReached = this.hasDiscussionConsensus(context);
          const discussionConfig = context.orchestrationRun.discussionConfig;
          const synthesisCompleted = this.getDiscussionNodes(context).some((node) => node.discussionRole === 'synthesizer');
          const canAdvanceRound =
            !consensusReached &&
            Boolean(discussionConfig) &&
            context.orchestrationRun.currentIteration < context.orchestrationRun.maxIterations &&
            !synthesisCompleted;

          if (canAdvanceRound) {
            this.createDiscussionRoundNodes(context, agentProfiles, context.orchestrationRun.currentIteration + 1);
            this.dispatchReadyNodes(context, agentProfiles);
            continue;
          }

          if ((discussionConfig?.requireFinalSynthesis ?? false) && !synthesisCompleted) {
            const createdSynthesis = this.createDiscussionSynthesisNode(context, agentProfiles);
            if (createdSynthesis) {
              this.dispatchReadyNodes(context, agentProfiles);
              continue;
            }
          }

          this.finalizeContext(
            context,
            allSucceeded ? 'completed' : 'failed',
            consensusReached
              ? `Consensus keyword detected: ${this.getDiscussionKeyword(context)}`
              : context.orchestrationRun.currentIteration >= context.orchestrationRun.maxIterations
                ? 'Reached max discussion rounds.'
                : context.orchestrationRun.stopReason,
          );
          return;
        }

        const reachedIterationLimit =
          context.orchestrationRun.automationMode === 'review_loop' &&
          context.orchestrationRun.currentIteration >= context.orchestrationRun.maxIterations;

        this.finalizeContext(
          context,
          allSucceeded ? 'completed' : 'failed',
          reachedIterationLimit ? 'Reached max review-loop iterations.' : context.orchestrationRun.stopReason,
        );
        return;
      }

      if (anyRunning) {
        // Nodes are running, wait for them to complete
        return;
      }

      const beforeSkipCount = context.nodes.filter((n) => this.isNodeTerminal(n.status)).length;
      this.dispatchReadyNodes(context, agentProfiles);
      const afterSkipCount = context.nodes.filter((n) => this.isNodeTerminal(n.status)).length;

      if (afterSkipCount === beforeSkipCount && !context.nodes.some((n) => n.status === 'running')) {
        // No progress was made; exit the loop
        return;
      }
    }
  }

  /** Build a final summary from all node results. */
  private buildFinalSummary(context: OrchestrationContext): string {
    const synthesisSummary = context.nodes.find((node) => node.discussionRole === 'synthesizer' && node.resultSummary)?.resultSummary;
    if (synthesisSummary) {
      return synthesisSummary;
    }

    const summaries = context.nodes.filter((n) => n.resultSummary).map((n) => `• ${n.title}: ${n.resultSummary}`);
    if (summaries.length === 0) return 'Orchestration completed with no node summaries.';
    return summaries.join('\n');
  }

  /** Check if a node should be retried based on its agent profile retry policy. */
  private shouldRetry(node: OrchestrationNode, agentProfiles: AgentProfile[]): boolean {
    const profile = node.agentProfileId ? (agentProfiles.find((p) => p.id === node.agentProfileId) ?? null) : null;
    if (!profile) return false;
    return node.retryCount < profile.retryPolicy.maxRetries;
  }

  /** Check if a node status is terminal. */
  private isNodeTerminal(status: OrchestrationNodeStatus): boolean {
    return status === 'completed' || status === 'failed' || status === 'skipped' || status === 'cancelled';
  }

  /** Persist the current orchestration context into AppState. */
  private persistContext(context: OrchestrationContext): void {
    if (!this.onStateUpdate) return;

    this.onStateUpdate((state) => ({
      ...state,
      orchestrationRuns: [
        context.orchestrationRun,
        ...state.orchestrationRuns.filter((r) => r.id !== context.orchestrationRun.id),
      ],
      orchestrationNodes: [
        ...context.nodes,
        ...state.orchestrationNodes.filter((n) => n.orchestrationRunId !== context.orchestrationRun.id),
      ],
    }));
  }
}
