import type { Locale } from '../../../shared/domain.js';
import type { AiConfig, AiProviderId } from '../aiConfig.js';
import { AI_PROVIDERS } from '../aiConfig.js';
import type { ProviderStatusMap, VisibilityMap } from '../configPageShared.js';
import { getProviderDescription } from '../configLocalization.js';

interface ProviderCardsPanelProps {
  locale: Locale;
  draftConfig: AiConfig;
  providerStatuses: ProviderStatusMap;
  showSecrets: VisibilityMap;
  updateProvider: (providerId: AiProviderId, updates: Partial<AiConfig['providers'][AiProviderId]>) => void;
  toggleProviderSecretVisibility: (providerId: AiProviderId) => void;
  setActiveProvider: (providerId: AiProviderId | null) => void;
  handleTestProvider: (providerId: AiProviderId) => Promise<void>;
}

export function ProviderCardsPanel(props: ProviderCardsPanelProps): React.JSX.Element {
  const {
    locale,
    draftConfig,
    providerStatuses,
    showSecrets,
    updateProvider,
    toggleProviderSecretVisibility,
    setActiveProvider,
    handleTestProvider,
  } = props;

  return (
    <div className="provider-card-grid provider-card-grid-wide">
      {AI_PROVIDERS.map((provider) => {
        const providerConfig = draftConfig.providers[provider.id];
        const providerStatus = providerStatuses[provider.id];
        const providerLabel = locale === 'zh' && provider.id === 'custom' ? '自定义兼容服务' : provider.label;
        const hasKey = providerConfig.api_key.trim().length > 0;
        const readinessTone = providerStatus?.tone === 'error'
          ? 'error'
          : providerStatus?.tone === 'success'
            ? 'success'
            : hasKey
              ? 'loading'
              : 'neutral';
        const readinessLabel = providerStatus?.tone === 'error'
          ? locale === 'zh' ? '错误' : 'Error'
          : providerStatus?.tone === 'success'
            ? locale === 'zh' ? '已连接' : 'Connected'
            : hasKey
              ? locale === 'zh' ? '已保存密钥' : 'Key saved'
              : locale === 'zh' ? '未配置' : 'Not configured';

        return (
          <article id={`config-provider-${provider.id}`} key={provider.id} className={`section-panel inlay-card provider-card ${draftConfig.active_provider === provider.id ? 'is-active' : ''}`}>
            <div className="section-heading provider-card-heading">
              <div>
                <p className="section-label">{providerLabel}</p>
                <h3>{getProviderDescription(provider.id, provider.description, locale)}</h3>
              </div>
              <span className={`state-badge provider-state provider-state-${readinessTone}`}>{readinessLabel}</span>
            </div>

            <label className="field provider-secret-field">
              <span>{locale === 'zh' ? 'API 密钥' : 'API key'}</span>
              <div className="provider-secret-row">
                <input
                  type={showSecrets[provider.id] ? 'text' : 'password'}
                  value={providerConfig.api_key}
                  placeholder={locale === 'zh' ? '填入当前模型服务的凭据' : 'Paste the credential used for this provider'}
                  onChange={(event) => {
                    updateProvider(provider.id, { api_key: event.target.value });
                  }}
                />
                <button
                  type="button"
                  className="secondary-button secondary-button-compact"
                  onClick={() => {
                    toggleProviderSecretVisibility(provider.id);
                  }}
                >
                  {showSecrets[provider.id] ? (locale === 'zh' ? '隐藏' : 'Hide') : locale === 'zh' ? '显示' : 'Show'}
                </button>
              </div>
            </label>

            <label className="field">
              <span>{locale === 'zh' ? '服务地址' : 'Base URL'}</span>
              <input
                value={providerConfig.base_url}
                placeholder={provider.defaultBaseUrl || 'https://'}
                onChange={(event) => {
                  updateProvider(provider.id, { base_url: event.target.value });
                }}
              />
            </label>

            <label className="toggle-field provider-toggle-row">
              <input
                type="checkbox"
                checked={providerConfig.enabled}
                onChange={(event) => {
                  updateProvider(provider.id, { enabled: event.target.checked });
                }}
              />
              <span>{providerConfig.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : locale === 'zh' ? '已禁用' : 'Disabled'}</span>
            </label>

            <div className="card-actions provider-card-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setActiveProvider(provider.id);
                }}
              >
                {draftConfig.active_provider === provider.id ? (locale === 'zh' ? '当前使用中' : 'Active now') : locale === 'zh' ? '设为当前' : 'Set active'}
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void handleTestProvider(provider.id);
                }}
              >
                {locale === 'zh' ? '测试连接' : 'Test'}
              </button>
            </div>

            {providerStatus ? (
              <div className={`status-banner status-${providerStatus.tone}`}>
                <p>{providerStatus.message}</p>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
