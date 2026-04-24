import type { AgentProfile, AppState, Locale, WorkbenchTargetKind } from '../../../shared/domain.js';
import { getAgentProfileDisplayName, resolveAgentProfileModel, resolveAgentProfileModelOptions } from '../../../shared/agentProfiles.js';
import type { AiConfig } from '../aiConfig.js';
import { getProviderDefinition } from '../aiConfig.js';

interface AgentProfilesConfigSectionProps {
  locale: Locale;
  agentProfiles: AgentProfile[];
  adapters: AppState['adapters'];
  aiConfig: AiConfig;
  onSaveAgentProfile: (profile: AgentProfile) => void;
}

const getProviderModelSource = (providerId: string, aiConfig: AiConfig): { defaultModel: string | null; supportedModels: string[] } | null => {
  const providerConfig = aiConfig.providers[providerId];
  if (!providerConfig) {
    return null;
  }
  const definition = getProviderDefinition(providerId, providerConfig);
  const models = [...new Set([providerConfig.default_model ?? '', ...(providerConfig.models ?? []), ...definition.modelSuggestions].map((model) => model.trim()).filter((model) => model.length > 0))];
  return {
    defaultModel: providerConfig.default_model?.trim() || models[0] || null,
    supportedModels: models,
  };
};

export function AgentProfilesConfigSection({ locale, agentProfiles, adapters, aiConfig, onSaveAgentProfile }: AgentProfilesConfigSectionProps): React.JSX.Element {
  const userFacingAdapters = adapters.filter((adapter) => adapter.visibility === 'user');
  const providerOptions = Object.entries(aiConfig.providers).map(([providerId, providerConfig]) => ({
    id: providerId,
    label: providerConfig.label?.trim() || getProviderDefinition(providerId, providerConfig).label,
  }));

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
            const targetKind: WorkbenchTargetKind = profile.targetKind ?? 'adapter';
            const targetId = profile.targetId ?? profile.adapterId;
            const adapter = targetKind === 'adapter' ? adapters.find((entry) => entry.id === targetId) ?? null : null;
            const providerModelSource = targetKind === 'provider' ? getProviderModelSource(targetId, aiConfig) : null;
            const modelSource = adapter ?? providerModelSource;
            const displayName = getAgentProfileDisplayName(profile);
            const modelOptions = resolveAgentProfileModelOptions(profile, modelSource);
            const resolvedModel = resolveAgentProfileModel(profile, modelSource);
            const saveProfile = (updates: Partial<AgentProfile>): void => {
              onSaveAgentProfile({
                ...profile,
                name: displayName,
                targetKind,
                targetId,
                adapterId: targetKind === 'adapter' ? targetId : profile.adapterId,
                model: resolvedModel,
                modelOptions,
                ...updates,
              });
            };

            return (
              <article key={profile.id} id={`config-agent-${profile.id}`} className="section-panel inlay-card provider-card">
                <div className="section-heading provider-card-heading">
                  <div>
                    <p className="section-label">{profile.role}</p>
                    <h3>{displayName}</h3>
                  </div>
                  <label className="toggle-field provider-toggle-row">
                    <input
                      type="checkbox"
                      checked={profile.enabled}
                      onChange={(event) => {
                        saveProfile({ enabled: event.target.checked });
                      }}
                    />
                    <span>{profile.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : locale === 'zh' ? '已禁用' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="settings-grid compact-settings-grid">
                  <label className="field">
                    <span>{locale === 'zh' ? 'Agent 目标' : 'Agent target'}</span>
                    <select
                      value={`${targetKind}:${targetId}`}
                      onChange={(event) => {
                        const [nextKindRaw, nextId = ''] = event.target.value.split(':');
                        const nextKind: WorkbenchTargetKind = nextKindRaw === 'provider' ? 'provider' : 'adapter';
                        const nextAdapter = nextKind === 'adapter' ? adapters.find((entry) => entry.id === nextId) ?? null : null;
                        const nextProviderSource = nextKind === 'provider' ? getProviderModelSource(nextId, aiConfig) : null;
                        const nextSource = nextAdapter ?? nextProviderSource;
                        const nextModelOptions = resolveAgentProfileModelOptions(profile, nextSource);
                        saveProfile({
                          targetKind: nextKind,
                          targetId: nextId,
                          adapterId: nextKind === 'adapter' ? nextId : profile.adapterId,
                          model: resolveAgentProfileModel({ ...profile, modelOptions: nextModelOptions }, nextSource),
                          modelOptions: nextModelOptions,
                        });
                      }}
                    >
                      <option value="adapter:">{locale === 'zh' ? '选择目标' : 'Choose target'}</option>
                      <optgroup label={locale === 'zh' ? 'Provider' : 'Providers'}>
                        {providerOptions.map((entry) => (
                          <option key={entry.id} value={`provider:${entry.id}`}>{entry.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label={locale === 'zh' ? '本地工具' : 'Local tools'}>
                      {userFacingAdapters.map((entry) => (
                        <option key={entry.id} value={`adapter:${entry.id}`}>{entry.displayName}</option>
                      ))}
                      </optgroup>
                    </select>
                  </label>

                  <label className="field">
                    <span>{locale === 'zh' ? 'Agent 模型' : 'Agent model'}</span>
                    <select
                      value={resolvedModel}
                      onChange={(event) => {
                        const nextModel = event.target.value;
                        saveProfile({
                          model: nextModel,
                          modelOptions: resolveAgentProfileModelOptions({ ...profile, model: nextModel }, modelSource),
                        });
                      }}
                    >
                      <option value="">{locale === 'zh' ? '自动选择模型' : 'Auto select model'}</option>
                      {modelOptions.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>{locale === 'zh' ? '系统提示词' : 'System prompt'}</span>
                  <textarea
                    rows={4}
                    value={profile.systemPrompt}
                    onChange={(event) => {
                        saveProfile({ systemPrompt: event.target.value });
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
