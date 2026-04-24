import type { Locale, OrchestrationNode, OrchestrationRun, ReadWorkspaceFileResult, RunSession, TaskThread, WorkbenchState } from '../../../shared/domain.js';
import { RUN_STATUS_LABELS } from '../copy.js';

interface WorkbenchProgressRailProps {
  locale: Locale;
  workbench: WorkbenchState;
  activeThread: TaskThread | null;
  workspaceLabel: string | null;
  selectedFile: ReadWorkspaceFileResult | null;
  activeOrchestrationRun: OrchestrationRun | null;
  activeOrchestrationNodes: OrchestrationNode[];
  recentAdapterRuns: RunSession[];
}

const getNodeCount = (nodes: OrchestrationNode[], status: OrchestrationNode['status']): number => nodes.filter((node) => node.status === status).length;

export function WorkbenchProgressRail(props: WorkbenchProgressRailProps): React.JSX.Element {
  const { locale, workbench, activeThread, workspaceLabel, selectedFile, activeOrchestrationRun, activeOrchestrationNodes, recentAdapterRuns } = props;
  const completedTasks = workbench.tasks.filter((task) => task.status === 'completed').length;

  return (
    <aside className="workbench-progress-rail">
      <section className="section-panel inlay-card workbench-summary-panel">
        <div className="section-heading workspace-pane-heading">
          <div>
            <p className="section-label">{locale === 'zh' ? '会话摘要' : 'Session summary'}</p>
            <h3>{activeThread?.title ?? (locale === 'zh' ? '当前线程' : 'Current thread')}</h3>
          </div>
        </div>

        <div className="badge-pair">
          <span className="status-pill">{workspaceLabel ?? (locale === 'zh' ? '未选择项目' : 'No project')}</span>
          <span className="status-pill">{locale === 'zh' ? `${completedTasks}/${workbench.tasks.length} 已完成` : `${completedTasks}/${workbench.tasks.length} done`}</span>
          <span className="status-pill">{locale === 'zh' ? `${workbench.threads.length} 个线程` : `${workbench.threads.length} threads`}</span>
        </div>

        <p className="mini-meta">{selectedFile?.relativePath ?? (locale === 'zh' ? '尚未选中文件' : 'No file selected yet')}</p>
      </section>

      <section className="section-panel inlay-card workbench-orchestration-rail-panel">
        <div className="section-heading workspace-pane-heading">
          <div>
            <p className="section-label">{locale === 'zh' ? '编排进度' : 'Orchestration progress'}</p>
            <h3>{activeOrchestrationRun ? activeOrchestrationRun.id : locale === 'zh' ? '尚未启动编排' : 'No orchestration yet'}</h3>
          </div>
          {activeOrchestrationRun ? <span className={`state-badge state-${activeOrchestrationRun.status}`}>{activeOrchestrationRun.status}</span> : null}
        </div>

        {activeOrchestrationRun ? (
          <>
            <div className="badge-pair">
              <span className="status-pill">{locale === 'zh' ? `运行中 ${getNodeCount(activeOrchestrationNodes, 'running')}` : `Running ${getNodeCount(activeOrchestrationNodes, 'running')}`}</span>
              <span className="status-pill">{locale === 'zh' ? `已完成 ${getNodeCount(activeOrchestrationNodes, 'completed')}` : `Done ${getNodeCount(activeOrchestrationNodes, 'completed')}`}</span>
              <span className="status-pill">{locale === 'zh' ? `待处理 ${getNodeCount(activeOrchestrationNodes, 'pending') + getNodeCount(activeOrchestrationNodes, 'ready')}` : `Queued ${getNodeCount(activeOrchestrationNodes, 'pending') + getNodeCount(activeOrchestrationNodes, 'ready')}`}</span>
            </div>

            <div className="workbench-node-list">
              {activeOrchestrationNodes.slice(0, 6).map((node) => (
                <article key={node.id} className="list-card workbench-node-card">
                  <div className="list-topline">
                    <strong>{node.title}</strong>
                    <span className={`state-badge state-${node.status}`}>{node.status}</span>
                  </div>
                  <p className="mini-meta">{node.agentProfileId ?? (locale === 'zh' ? '未指定代理' : 'No agent selected')}</p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">{locale === 'zh' ? '通过 /orchestrate 或右侧按钮启动多代理执行。' : 'Use /orchestrate or the orchestration action to start a multi-agent run.'}</p>
        )}
      </section>

      <section className="section-panel inlay-card workbench-runs-rail-panel">
        <div className="section-heading workspace-pane-heading">
          <div>
            <p className="section-label">{locale === 'zh' ? '本地工具回执' : 'Local tool receipts'}</p>
            <h3>{locale === 'zh' ? '最近运行' : 'Recent runs'}</h3>
          </div>
        </div>

        {recentAdapterRuns.length > 0 ? (
          <div className="workbench-node-list">
            {recentAdapterRuns.map((run) => (
              <article key={run.id} className="list-card workbench-node-card">
                <div className="list-topline">
                  <strong>{run.id}</strong>
                  <span className={`state-badge state-${run.status}`}>{RUN_STATUS_LABELS[locale][run.status]}</span>
                </div>
                <p className="mini-meta">{run.commandPreview}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">{locale === 'zh' ? '还没有本地工具运行记录。' : 'No local tool runs yet.'}</p>
        )}
      </section>
    </aside>
  );
}
