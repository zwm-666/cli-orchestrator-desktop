/**
 * ResultAggregationService – Aggregates outputs from child agents,
 * produces final summary output, and handles partial-failure-but-continue policies.
 */

import type { OrchestrationNode, OrchestrationRun } from '../../shared/domain.js';

export interface AggregationResult {
  finalSummary: string;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  nodeResults: {
    nodeId: string;
    title: string;
    status: OrchestrationNode['status'];
    summary: string | null;
  }[];
}

export class ResultAggregationService {
  /**
   * Aggregate results from all nodes in an orchestration run.
   * Gathers node summaries, marks success/failure/skipped states,
   * produces a final answer, and lists unfinished items and risks.
   */
  public aggregate(
    orchestrationRun: OrchestrationRun,
    nodes: OrchestrationNode[]
  ): AggregationResult {
    const nodeResults = nodes.map((node) => ({
      nodeId: node.id,
      title: node.title,
      status: node.status,
      summary: node.resultSummary
    }));

    const successCount = nodes.filter((n) => n.status === 'completed').length;
    const failedCount = nodes.filter((n) => n.status === 'failed').length;
    const skippedCount = nodes.filter((n) => n.status === 'skipped').length;
    const cancelledCount = nodes.filter((n) => n.status === 'cancelled').length;

    const parts: string[] = [];

    // Header
    parts.push(`Orchestration "${orchestrationRun.rootPrompt.slice(0, 80)}${orchestrationRun.rootPrompt.length > 80 ? '...' : ''}" completed.`);
    parts.push(`Status: ${successCount} succeeded, ${failedCount} failed, ${skippedCount} skipped, ${cancelledCount} cancelled.`);

    // Success summaries
    const completedNodes = nodes.filter((n) => n.status === 'completed' && n.resultSummary);
    if (completedNodes.length > 0) {
      parts.push('\nCompleted:');
      for (const node of completedNodes) {
        parts.push(`  - ${node.title}: ${node.resultSummary}`);
      }
    }

    // Failed summaries
    const failedNodes = nodes.filter((n) => n.status === 'failed');
    if (failedNodes.length > 0) {
      parts.push('\nFailed:');
      for (const node of failedNodes) {
        parts.push(`  - ${node.title}: ${node.resultSummary ?? 'No details available.'}`);
      }
    }

    // Skipped summaries
    const skippedNodes = nodes.filter((n) => n.status === 'skipped');
    if (skippedNodes.length > 0) {
      parts.push('\nSkipped:');
      for (const node of skippedNodes) {
        parts.push(`  - ${node.title}: ${node.resultSummary ?? 'Dependency not met.'}`);
      }
    }

    // Risks / unfinished items
    const pendingNodes = nodes.filter((n) => n.status === 'pending' || n.status === 'waiting_on_deps' || n.status === 'ready');
    if (pendingNodes.length > 0) {
      parts.push('\nUnfinished:');
      for (const node of pendingNodes) {
        parts.push(`  - ${node.title}: Still in ${node.status} state.`);
      }
    }

    return {
      finalSummary: parts.join('\n'),
      successCount,
      failedCount,
      skippedCount,
      nodeResults
    };
  }

  /**
   * Determine if a partial-failure orchestration should continue or halt.
   * Default policy: continue as long as at least one path to the aggregation node
   * still has viable nodes.
   */
  public shouldContinueOnPartialFailure(nodes: OrchestrationNode[]): boolean {
    // Check if any non-terminal nodes exist that don't depend on failed nodes
    const failedIds = new Set(nodes.filter((n) => n.status === 'failed').map((n) => n.id));

    return nodes.some((node) => {
      if (node.status !== 'pending' && node.status !== 'waiting_on_deps' && node.status !== 'ready') {
        return false;
      }
      // Check if all of this node's dependencies are either completed or not yet failed
      return node.dependsOnNodeIds.every((depId) => !failedIds.has(depId));
    });
  }
}
