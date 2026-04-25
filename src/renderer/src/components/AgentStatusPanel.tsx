import type { AppState, Locale } from '../../../shared/domain.js';
import { getAgentProfileDisplayName, resolveAgentProfileModel } from '../../../shared/agentProfiles.js';
import type { AiConfig } from '../aiConfig.js';
import { getProviderDefinition } from '../aiConfig.js';

interface AgentStatusPanelProps {
  locale: Locale;
  agentProfiles: AppState['agentProfiles'];
  adapters: AppState['adapters'];
  subagentStatuses: AppState['subagentStatuses'];
  aiConfig: AiConfig;
}

const STATUS_LABELS: Record<Locale, Record<AppState['subagentStatuses'][number]['status'], string>> = {
  en: {
    idle: 'Idle',
    thinking: 'Thinking',
    tool_calling: 'Using tools',
    waiting: 'Waiting',
    completed: 'Completed',
    error: 'Error',
  },
  zh: {
    idle: '空闲',
    thinking: '思考中',
    tool_calling: '工具调用中',
    waiting: '等待响应',
    completed: '已完成',
    error: '出错',
  },
};

const STATUS_ICONS: Record<AppState['subagentStatuses'][number]['status'], string> = {
  idle: '○',
  thinking: '◌',
  tool_calling: '⚙',
  waiting: '…',
  completed: '✓',
  error: '!',
};

export function AgentStatusPanel({ locale, agentProfiles, adapters, subagentStatuses, aiConfig }: AgentStatusPanelProps): React.JSX.Element {
  const visibleProfiles = agentProfiles.filter((profile) => profile.enabled);

  return (
    <section className="section-panel inlay-card agent-status-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? 'Agent 列表' : 'Agents'}</p>
          <h3>{locale === 'zh' ? '当前可参与协作的 Agent' : 'Agents available for collaboration'}</h3>
        </div>
        <span className="status-pill">{visibleProfiles.length}</span>
      </div>

      {visibleProfiles.length === 0 ? (
        <p className="empty-state">{locale === 'zh' ? '还没有启用的 Agent Profile。' : 'No enabled agent profiles yet.'}</p>
      ) : (
        <div className="stack-list">
          {visibleProfiles.map((profile) => {
            const targetKind = profile.targetKind ?? 'adapter';
            const targetId = profile.targetId ?? profile.adapterId;
            const adapter = targetKind === 'adapter' ? adapters.find((entry) => entry.id === targetId) ?? null : null;
            const providerConfig = targetKind === 'provider' ? aiConfig.providers[targetId] ?? null : null;
            const providerSource = providerConfig
              ? {
                  defaultModel: providerConfig.default_model?.trim() || providerConfig.models?.[0] || null,
                  supportedModels: [...new Set([providerConfig.default_model ?? '', ...(providerConfig.models ?? []), ...getProviderDefinition(targetId, providerConfig).modelSuggestions].map((model) => model.trim()).filter((model) => model.length > 0))],
                }
              : null;
            const targetLabel = targetKind === 'provider'
              ? providerConfig?.label?.trim() || (providerConfig ? getProviderDefinition(targetId, providerConfig).label : targetId)
              : adapter?.displayName ?? targetId;
            const profileStatuses = subagentStatuses
              .filter((entry) => entry.profileId === profile.id)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
            const latestStatus = profileStatuses[0] ?? null;
            const status = latestStatus?.status ?? 'idle';
            return (
              <article key={profile.id} className="list-card">
                <div className="list-topline">
                  <strong>{getAgentProfileDisplayName(profile)}</strong>
                  <span className={`status-pill subagent-status-pill is-${status}`}>{STATUS_ICONS[status]} {STATUS_LABELS[locale][status]}</span>
                </div>
                <p className="mini-meta">{targetLabel} · {resolveAgentProfileModel(profile, adapter ?? providerSource)}</p>
                <p className="mini-meta">{profile.role}</p>
                {profileStatuses.length > 0 ? (
                  <div className="subagent-status-list">
                    {profileStatuses.slice(0, 3).map((entry) => (
                      <div key={entry.id} className="subagent-status-row">
                        <span className={`status-pill subagent-status-pill is-${entry.status}`}>{STATUS_ICONS[entry.status]} {STATUS_LABELS[locale][entry.status]}</span>
                        <span className="mini-meta">{entry.detail}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mini-meta">{locale === 'zh' ? '当前没有运行中的子任务。' : 'No active subtask for this agent.'}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
