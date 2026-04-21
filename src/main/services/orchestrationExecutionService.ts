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

  /** Wire up callbacks to the main orchestrator service. */
  public initialize(
    onRunStart: RunStartCallback,
    onStateUpdate: StateUpdateCallback,
    skillRegistry: SkillRegistryService,
  ): void {
    this.onRunStart = onRunStart;
    this.onStateUpdate = onStateUpdate;
    this.skillRegistry = skillRegistry;
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

      // Update node status
      context.nodes[nodeIndex] = {
        ...node,
        status: nodeStatus,
        resultSummary: isSuccess ? 'Node completed successfully.' : `Node failed with run status: ${runStatus}.`,
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
        setTimeout(() => {
          const activeContext = this.activeOrchestrations.get(orchestrationId);
          if (!activeContext || activeContext.orchestrationRun.status !== 'executing') {
            return;
          }

          this.dispatchReadyNodes(activeContext, agentProfiles);
          this.persistContext(activeContext);
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

        const result = this.onRunStart({
          title: node.title,
          prompt: enrichedPrompt,
          adapterId: node.adapterOverride ?? agentProfile?.adapterId ?? '',
          model: node.modelOverride ?? agentProfile?.model ?? null,
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
        const reachedIterationLimit =
          context.orchestrationRun.automationMode === 'review_loop' &&
          context.orchestrationRun.currentIteration >= context.orchestrationRun.maxIterations;

        // All nodes done
        context.orchestrationRun = {
          ...context.orchestrationRun,
          status: allSucceeded ? 'completed' : 'failed',
          updatedAt: new Date().toISOString(),
          finalSummary: this.buildFinalSummary(context),
          stopReason: reachedIterationLimit
            ? 'Reached max review-loop iterations.'
            : context.orchestrationRun.stopReason,
        };
        this.activeOrchestrations.delete(context.orchestrationRun.id);
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
