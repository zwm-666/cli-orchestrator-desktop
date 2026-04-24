import type { AppState, Locale, OrchestrationNode, OrchestrationRun } from '../../../shared/domain.js';
import { getAgentProfileDisplayName } from '../../../shared/agentProfiles.js';

interface OrchestrationProgressPanelProps {
  locale: Locale;
  run: OrchestrationRun | null;
  nodes: OrchestrationNode[];
  runs: AppState['runs'];
  agentProfiles: AppState['agentProfiles'];
  onSelectRun: (runId: string | null) => void;
  onJumpToNode: (nodeId: string) => void;
}

const STATUS_ICONS: Record<OrchestrationNode['status'], string> = {
  pending: '⏳',
  waiting_on_deps: '⏳',
  ready: '🟡',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  skipped: '⏭️',
  cancelled: '⛔',
};

const buildDepth = (node: OrchestrationNode, nodeMap: Map<string, OrchestrationNode>): number => {
  if (node.dependsOnNodeIds.length === 0) {
    return 0;
  }

  return Math.max(
    ...node.dependsOnNodeIds.map((dependencyId) => {
      const dependency = nodeMap.get(dependencyId);
      return dependency ? buildDepth(dependency, nodeMap) + 1 : 1;
    }),
  );
};

const getOrderedNodes = (nodes: OrchestrationNode[]): OrchestrationNode[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const orderedNodes: OrchestrationNode[] = [];
  const visited = new Set<string>();

  const visit = (node: OrchestrationNode): void => {
    if (visited.has(node.id)) {
      return;
    }

    visited.add(node.id);
    node.dependsOnNodeIds
      .map((dependencyId) => nodeMap.get(dependencyId))
      .filter((dependency): dependency is OrchestrationNode => dependency !== undefined)
      .sort((left, right) => left.title.localeCompare(right.title))
      .forEach(visit);
    orderedNodes.push(node);
  };

  [...nodes]
    .sort((left, right) => {
      const leftRound = left.discussionRound ?? 0;
      const rightRound = right.discussionRound ?? 0;
      if (leftRound !== rightRound) {
        return leftRound - rightRound;
      }

      return left.title.localeCompare(right.title);
    })
    .forEach(visit);

  return orderedNodes;
};

export function OrchestrationProgressPanel(props: OrchestrationProgressPanelProps): React.JSX.Element {
  const { locale, run, nodes, runs, agentProfiles, onSelectRun, onJumpToNode } = props;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const orderedNodes = getOrderedNodes(nodes);

  return (
    <section className="section-panel inlay-card orchestration-progress-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '编排进度' : 'Orchestration progress'}</p>
          <h3>{run ? run.rootPrompt.slice(0, 56) : (locale === 'zh' ? '暂无活动编排' : 'No active orchestration')}</h3>
        </div>
        {run ? <span className="status-pill">{run.status}</span> : null}
      </div>

      {run ? (
        <div className="stack-list">
          <button type="button" className="secondary-button secondary-button-compact" onClick={() => { onSelectRun(run.id); }}>
            {locale === 'zh' ? '锁定当前运行' : 'Pin current run'}
          </button>

          {orderedNodes.map((node) => {
            const nodeRun = node.runId ? runs.find((entry) => entry.id === node.runId) ?? null : null;
            const profile = node.agentProfileId ? agentProfiles.find((entry) => entry.id === node.agentProfileId) ?? null : null;
            const agentLabel = profile ? getAgentProfileDisplayName(profile) : node.agentProfileId ?? (locale === 'zh' ? '未分配 Agent' : 'Unassigned agent');
            const depth = buildDepth(node, nodeMap);
            const dependencyTitles = node.dependsOnNodeIds.map((dependencyId) => nodeMap.get(dependencyId)?.title ?? dependencyId);
            const blockingDependencyTitles = node.dependsOnNodeIds
              .map((dependencyId) => nodeMap.get(dependencyId))
              .filter((dependency): dependency is OrchestrationNode => dependency !== undefined && dependency.status !== 'completed' && dependency.status !== 'skipped')
              .map((dependency) => dependency.title);
            const downstreamCount = nodes.filter((candidate) => candidate.dependsOnNodeIds.includes(node.id)).length;
            const durationLabel = nodeRun?.endedAt && nodeRun.startedAt
              ? `${Math.max(1, Math.round((new Date(nodeRun.endedAt).getTime() - new Date(nodeRun.startedAt).getTime()) / 1000))}s`
              : nodeRun?.status === 'running' && nodeRun.startedAt
                ? `${Math.max(1, Math.round((Date.now() - new Date(nodeRun.startedAt).getTime()) / 1000))}s`
                : '—';

            return (
              <button
                key={node.id}
                type="button"
                className="list-card orchestration-node-row"
                style={{ paddingInlineStart: `${1 + depth * 1.1}rem` }}
                onClick={() => {
                  onJumpToNode(node.id);
                }}
                >
                  <div className="list-topline">
                    <strong>{STATUS_ICONS[node.status]} {agentLabel}</strong>
                    <span className="status-pill">{durationLabel}</span>
                  </div>
                  <p>{node.title}</p>
                  {node.discussionRound ? <span className="mini-meta">Round {node.discussionRound}</span> : null}
                  {dependencyTitles.length > 0 ? (
                    <span className="mini-meta">
                      {locale === 'zh' ? `依赖：${dependencyTitles.join('、')}` : `Depends on: ${dependencyTitles.join(', ')}`}
                    </span>
                  ) : null}
                  {blockingDependencyTitles.length > 0 ? (
                    <span className="mini-meta">
                      {locale === 'zh' ? `等待：${blockingDependencyTitles.join('、')}` : `Waiting on: ${blockingDependencyTitles.join(', ')}`}
                    </span>
                  ) : null}
                  {downstreamCount > 0 ? (
                    <span className="mini-meta">
                      {locale === 'zh'
                        ? `解锁 ${downstreamCount} 个后续节点`
                        : `Unblocks ${downstreamCount} downstream node${downstreamCount === 1 ? '' : 's'}`}
                    </span>
                  ) : null}
                </button>
              );
            })}
        </div>
      ) : (
        <p className="empty-state">{locale === 'zh' ? '发起一次 /orchestrate 或 /discuss 后，这里会显示节点进度。' : 'Start /orchestrate or /discuss to see node progress here.'}</p>
      )}
    </section>
  );
}
