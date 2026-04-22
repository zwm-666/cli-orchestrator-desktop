import type { Locale, WorkbenchActivitySummary } from '../../../shared/domain.js';
import { RUN_STATUS_LABELS } from '../copy.js';
import { TARGET_KIND_LABELS } from '../workConfigCopy.js';

interface WorkbenchActivityPanelProps {
  locale: Locale;
  latestProviderActivity: WorkbenchActivitySummary | null;
  latestAdapterActivity: WorkbenchActivitySummary | null;
  activityLog: WorkbenchActivitySummary[];
}

interface ActivityCardProps {
  locale: Locale;
  title: string;
  emptyLabel: string;
  activity: WorkbenchActivitySummary | null;
}

const getActivityStatusLabel = (locale: Locale, status: string): string => {
  const localizedStatuses = RUN_STATUS_LABELS[locale] as Record<string, string>;
  return localizedStatuses[status] ?? (status || (locale === 'zh' ? '未知状态' : 'Unknown status'));
};

function ActivityCard({ locale, title, emptyLabel, activity }: ActivityCardProps): React.JSX.Element {
  return (
    <article className="activity-summary-card inlay-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{title}</p>
          <h3>{activity?.sourceLabel ?? emptyLabel}</h3>
        </div>
        {activity ? <span className="status-pill">{getActivityStatusLabel(locale, activity.status)}</span> : null}
      </div>

      {activity ? (
        <>
          <div className="activity-summary-meta">
            <span className="status-pill">{TARGET_KIND_LABELS[locale][activity.sourceKind]}</span>
            <span className="mini-meta">{activity.modelLabel || (locale === 'zh' ? '未指定模型' : 'No model')}</span>
            <span className="mini-meta">{activity.recordedAt}</span>
          </div>
          <p className="muted activity-summary-task-line">{activity.taskUpdateSummary}</p>
          <pre className="preview-code activity-summary-detail"><code>{activity.detail}</code></pre>
        </>
      ) : (
        <p className="empty-state">{locale === 'zh' ? '还没有可展示的最近活动。' : 'No recent activity has been recorded yet.'}</p>
      )}
    </article>
  );
}

export function WorkbenchActivityPanel(props: WorkbenchActivityPanelProps): React.JSX.Element {
  const { locale, latestProviderActivity, latestAdapterActivity, activityLog } = props;
  const activityCount = Number(Boolean(latestProviderActivity)) + Number(Boolean(latestAdapterActivity));
  const recentEntries = activityLog.slice(-5).reverse();

  return (
    <details className="section-panel inlay-card workbench-activity-panel">
      <summary className="section-heading workspace-pane-heading workbench-activity-toggle">
        <div>
          <p className="section-label">{locale === 'zh' ? '交接记录' : 'Handoff history'}</p>
          <h3>{locale === 'zh' ? '最近活动摘要' : 'Recent activity summaries'}</h3>
          <p className="mini-meta">
            {activityCount > 0
              ? locale === 'zh'
                ? '需要时再展开查看最近的 Provider / 本地工具摘要。'
                : 'Expand only when you need the latest provider or local tool summaries.'
              : locale === 'zh'
                ? '还没有可展示的最近活动。'
                : 'No recent activity has been recorded yet.'}
          </p>
        </div>
        <div className="workbench-activity-toggle-meta">
          {activityCount > 0 ? <span className="status-pill">{activityCount}</span> : null}
          <span className="mini-meta">{locale === 'zh' ? '展开' : 'Expand'}</span>
        </div>
      </summary>

      <div className="activity-summary-grid">
        <ActivityCard
          locale={locale}
          title={locale === 'zh' ? '最近模型服务交互' : 'Latest provider interaction'}
          emptyLabel={locale === 'zh' ? '暂无模型服务摘要' : 'No provider summary yet'}
          activity={latestProviderActivity}
        />
        <ActivityCard
          locale={locale}
          title={locale === 'zh' ? '最近本地工具运行' : 'Latest local tool run'}
          emptyLabel={locale === 'zh' ? '暂无本地工具摘要' : 'No local tool summary yet'}
          activity={latestAdapterActivity}
        />
      </div>

      {recentEntries.length > 0 ? (
        <div className="activity-summary-grid">
          <article className="activity-summary-card inlay-card">
            <div className="section-heading workspace-pane-heading">
              <div>
                <p className="section-label">{locale === 'zh' ? '线程摘要' : 'Thread summaries'}</p>
                <h3>{locale === 'zh' ? '当前线程最近记录' : 'Recent entries for this thread'}</h3>
              </div>
            </div>

            <div className="workbench-task-list">
              {recentEntries.map((activity) => (
                <div key={`${activity.sourceId}-${activity.recordedAt}`} className="workbench-task-row">
                  <span className="workbench-task-copy">
                    <strong>{activity.sourceLabel}</strong>
                    <span className="mini-meta">{activity.taskUpdateSummary}</span>
                  </span>
                  <span className="status-pill">{getActivityStatusLabel(locale, activity.status)}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </details>
  );
}
