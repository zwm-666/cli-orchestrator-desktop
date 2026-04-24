import type { AgentProfile, AppState, Locale } from '../../../shared/domain.js';

interface AgentProfilesConfigSectionProps {
  locale: Locale;
  agentProfiles: AgentProfile[];
  adapters: AppState['adapters'];
  onSaveAgentProfile: (profile: AgentProfile) => void;
}

export function AgentProfilesConfigSection({ locale, agentProfiles, adapters, onSaveAgentProfile }: AgentProfilesConfigSectionProps): React.JSX.Element {
  const userFacingAdapters = adapters.filter((adapter) => adapter.visibility === 'user');

  return (
    <section id="config-agents" className="section-panel inlay-card config-section-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? 'Agent 配置' : 'Agent config'}</p>
          <h3>{locale === 'zh' ? '设置 Agent 使用的工具和模型' : 'Configure each agent tool and model'}</h3>
        </div>
        <span className="status-pill">{agentProfiles.length}</span>
      </div>

      {agentProfiles.length === 0 ? (
        <p className="empty-state">{locale === 'zh' ? '还没有 Agent Profile。' : 'No agent profiles yet.'}</p>
      ) : (
        <div className="provider-card-grid provider-card-grid-wide">
          {agentProfiles.map((profile) => {
            const adapter = adapters.find((entry) => entry.id === profile.adapterId) ?? null;
            const modelOptions = adapter?.supportedModels ?? [];

            return (
              <article key={profile.id} id={`config-agent-${profile.id}`} className="section-panel inlay-card provider-card">
                <div className="section-heading provider-card-heading">
                  <div>
                    <p className="section-label">{profile.role}</p>
                    <h3>{profile.name}</h3>
                  </div>
                  <label className="toggle-field provider-toggle-row">
                    <input
                      type="checkbox"
                      checked={profile.enabled}
                      onChange={(event) => {
                        onSaveAgentProfile({ ...profile, enabled: event.target.checked });
                      }}
                    />
                    <span>{profile.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : locale === 'zh' ? '已禁用' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="settings-grid compact-settings-grid">
                  <label className="field">
                    <span>{locale === 'zh' ? '本地工具' : 'Adapter'}</span>
                    <select
                      value={profile.adapterId}
                      onChange={(event) => {
                        const nextAdapter = adapters.find((entry) => entry.id === event.target.value) ?? null;
                        onSaveAgentProfile({
                          ...profile,
                          adapterId: event.target.value,
                          model: nextAdapter?.defaultModel ?? profile.model,
                        });
                      }}
                    >
                      <option value="">{locale === 'zh' ? '选择工具' : 'Choose adapter'}</option>
                      {userFacingAdapters.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.displayName}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>{locale === 'zh' ? 'Agent 模型' : 'Agent model'}</span>
                    <input
                      list={`${profile.id}-agent-model-list`}
                      value={profile.model}
                      placeholder={adapter?.defaultModel ?? (locale === 'zh' ? '输入模型名' : 'Enter model name')}
                      onChange={(event) => {
                        onSaveAgentProfile({ ...profile, model: event.target.value });
                      }}
                    />
                    <datalist id={`${profile.id}-agent-model-list`}>
                      {modelOptions.map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="field">
                  <span>{locale === 'zh' ? '系统提示词' : 'System prompt'}</span>
                  <textarea
                    rows={4}
                    value={profile.systemPrompt}
                    onChange={(event) => {
                      onSaveAgentProfile({ ...profile, systemPrompt: event.target.value });
                    }}
                  />
                </label>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
