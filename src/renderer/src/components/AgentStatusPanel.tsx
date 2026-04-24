import type { AppState, Locale } from '../../../shared/domain.js';

interface AgentStatusPanelProps {
  locale: Locale;
  agentProfiles: AppState['agentProfiles'];
}

export function AgentStatusPanel({ locale, agentProfiles }: AgentStatusPanelProps): React.JSX.Element {
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
          {visibleProfiles.map((profile) => (
            <article key={profile.id} className="list-card">
              <div className="list-topline">
                <strong>{profile.name}</strong>
                <span className="status-pill">{profile.role}</span>
              </div>
              <p className="mini-meta">{profile.adapterId} · {profile.model}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
