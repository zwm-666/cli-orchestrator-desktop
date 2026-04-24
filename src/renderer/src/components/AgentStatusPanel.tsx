import type { AppState, Locale } from '../../../shared/domain.js';
import { getAgentProfileDisplayName, resolveAgentProfileModel } from '../../../shared/agentProfiles.js';
import type { AiConfig } from '../aiConfig.js';
import { getProviderDefinition } from '../aiConfig.js';

interface AgentStatusPanelProps {
  locale: Locale;
  agentProfiles: AppState['agentProfiles'];
  adapters: AppState['adapters'];
  aiConfig: AiConfig;
}

export function AgentStatusPanel({ locale, agentProfiles, adapters, aiConfig }: AgentStatusPanelProps): React.JSX.Element {
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
            return (
              <article key={profile.id} className="list-card">
                <div className="list-topline">
                  <strong>{getAgentProfileDisplayName(profile)}</strong>
                  <span className="status-pill">{profile.role}</span>
                </div>
                <p className="mini-meta">{targetLabel} · {resolveAgentProfileModel(profile, adapter ?? providerSource)}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
