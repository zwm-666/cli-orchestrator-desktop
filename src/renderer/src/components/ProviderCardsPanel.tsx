import { useMemo, useState } from 'react';
import type { Locale } from '../../../shared/domain.js';
import type { AiConfig, AiProviderConfig, ProviderApiStyle } from '../aiConfig.js';
import { AI_PROVIDERS, getProviderDefinition, isCustomProviderId } from '../aiConfig.js';
import type { ProviderStatusMap, VisibilityMap } from '../configPageShared.js';
import { getProviderDescription } from '../configLocalization.js';

interface ProviderCardsPanelProps {
  locale: Locale;
  draftConfig: AiConfig;
  providerStatuses: ProviderStatusMap;
  showSecrets: VisibilityMap;
  updateProvider: (providerId: string, updates: Partial<AiProviderConfig>) => void;
  toggleProviderSecretVisibility: (providerId: string) => void;
  setActiveProvider: (providerId: string | null) => void;
  setActiveModel: (model: string) => void;
  addCustomProvider: (input: {
    label: string;
    base_url: string;
    api_key: string;
    default_model: string;
    api_style: ProviderApiStyle;
    enabled: boolean;
  }) => void;
  removeCustomProvider: (providerId: string) => void;
  handleTestProvider: (providerId: string) => Promise<void>;
}

const BUILTIN_PROVIDER_ORDER = new Map(AI_PROVIDERS.map((provider, index) => [provider.id, index]));

export function ProviderCardsPanel(props: ProviderCardsPanelProps): React.JSX.Element {
  const {
    locale,
    draftConfig,
    providerStatuses,
    showSecrets,
    updateProvider,
    toggleProviderSecretVisibility,
    setActiveProvider,
    setActiveModel,
    addCustomProvider,
    removeCustomProvider,
    handleTestProvider,
  } = props;
  const [isAddingCustomProvider, setIsAddingCustomProvider] = useState(false);
  const [customDraft, setCustomDraft] = useState({
    label: '',
    api_style: 'openai' as ProviderApiStyle,
    base_url: '',
    api_key: '',
    default_model: '',
    enabled: true,
  });

  const customProviderCount = useMemo(
    () => Object.keys(draftConfig.providers).filter((providerId) => isCustomProviderId(providerId)).length,
    [draftConfig.providers],
  );
  const providerEntries = useMemo(
    () =>
      Object.entries(draftConfig.providers).sort(([leftId], [rightId]) => {
        const leftOrder = BUILTIN_PROVIDER_ORDER.get(leftId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = BUILTIN_PROVIDER_ORDER.get(rightId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder === rightOrder) {
          return leftId.localeCompare(rightId);
        }

        return leftOrder - rightOrder;
      }),
    [draftConfig.providers],
  );

  const canSubmitCustomProvider =
    customDraft.label.trim().length > 0 &&
    customDraft.base_url.trim().length > 0 &&
    customDraft.api_key.trim().length > 0 &&
    customDraft.default_model.trim().length > 0 &&
    customProviderCount < 10;

  return (
    <div className="provider-card-grid provider-card-grid-wide">
      {providerEntries.map(([providerId, providerConfig]) => {
        const providerDefinition = getProviderDefinition(providerId, providerConfig);
        const providerStatus = providerStatuses[providerId];
        const providerLabel = providerConfig.label?.trim() || providerDefinition.label;
        const isCustom = isCustomProviderId(providerId);
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
        const showModelInput = isCustom || draftConfig.active_provider === providerId;
        const currentModel = draftConfig.active_provider === providerId ? draftConfig.active_model : (providerConfig.default_model ?? '');

        return (
          <article id={`config-provider-${providerId}`} key={providerId} className={`section-panel inlay-card provider-card ${draftConfig.active_provider === providerId ? 'is-active' : ''}`}>
            <div className="section-heading provider-card-heading">
              <div>
                <p className="section-label">{providerLabel}</p>
                <h3>{getProviderDescription(providerId, providerDefinition.description, locale)}</h3>
              </div>
              <span className={`state-badge provider-state provider-state-${readinessTone}`}>{readinessLabel}</span>
            </div>

            {isCustom ? (
              <>
                <label className="field">
                  <span>{locale === 'zh' ? '显示名称' : 'Display name'}</span>
                  <input
                    value={providerConfig.label ?? ''}
                    placeholder={locale === 'zh' ? '例如 OpenRouter / Ollama' : 'For example: OpenRouter / Ollama'}
                    onChange={(event) => {
                      updateProvider(providerId, { label: event.target.value });
                    }}
                  />
                </label>

                <label className="field">
                  <span>{locale === 'zh' ? 'API 风格' : 'API style'}</span>
                  <select
                    value={providerConfig.api_style ?? 'openai'}
                    onChange={(event) => {
                      updateProvider(providerId, { api_style: event.target.value as ProviderApiStyle });
                    }}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </label>
              </>
            ) : null}

            <label className="field provider-secret-field">
              <span>{locale === 'zh' ? 'API 密钥' : 'API key'}</span>
              <div className="provider-secret-row">
                <input
                  type={showSecrets[providerId] ? 'text' : 'password'}
                  value={providerConfig.api_key}
                  placeholder={locale === 'zh' ? '填入当前模型服务的凭据' : 'Paste the credential used for this provider'}
                  onChange={(event) => {
                    updateProvider(providerId, { api_key: event.target.value });
                  }}
                />
                <button
                  type="button"
                  className="secondary-button secondary-button-compact"
                  onClick={() => {
                    toggleProviderSecretVisibility(providerId);
                  }}
                >
                  {showSecrets[providerId] ? (locale === 'zh' ? '隐藏' : 'Hide') : locale === 'zh' ? '显示' : 'Show'}
                </button>
              </div>
            </label>

            <label className="field">
              <span>{locale === 'zh' ? '服务地址' : 'Base URL'}</span>
              <input
                value={providerConfig.base_url}
                placeholder={providerDefinition.defaultBaseUrl || 'https://'}
                onChange={(event) => {
                  updateProvider(providerId, { base_url: event.target.value });
                }}
              />
            </label>

            {showModelInput ? (
              <label className="field">
                <span>{locale === 'zh' ? '默认模型' : 'Default model'}</span>
                <input
                  list={!isCustom && providerDefinition.modelSuggestions.length > 0 ? `${providerId}-model-list` : undefined}
                  value={currentModel}
                  placeholder={locale === 'zh' ? '输入要使用的模型名' : 'Enter the model name to use'}
                  onChange={(event) => {
                    if (draftConfig.active_provider === providerId) {
                      setActiveModel(event.target.value);
                      return;
                    }

                    updateProvider(providerId, { default_model: event.target.value });
                  }}
                />
                {!isCustom && providerDefinition.modelSuggestions.length > 0 ? (
                  <datalist id={`${providerId}-model-list`}>
                    {providerDefinition.modelSuggestions.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                ) : null}
              </label>
            ) : null}

            <label className="toggle-field provider-toggle-row">
              <input
                type="checkbox"
                checked={providerConfig.enabled}
                onChange={(event) => {
                  updateProvider(providerId, { enabled: event.target.checked });
                }}
              />
              <span>{providerConfig.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : locale === 'zh' ? '已禁用' : 'Disabled'}</span>
            </label>

            <div className="card-actions provider-card-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setActiveProvider(providerId);
                }}
              >
                {draftConfig.active_provider === providerId ? (locale === 'zh' ? '当前使用中' : 'Active now') : locale === 'zh' ? '设为当前' : 'Set active'}
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void handleTestProvider(providerId);
                }}
              >
                {locale === 'zh' ? '测试连接' : 'Test'}
              </button>

              {isCustom ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const confirmed = window.confirm(locale === 'zh' ? '确认删除这个自定义服务？' : 'Delete this custom provider?');
                    if (confirmed) {
                      removeCustomProvider(providerId);
                    }
                  }}
                >
                  {locale === 'zh' ? '删除' : 'Delete'}
                </button>
              ) : null}
            </div>

            {providerStatus ? (
              <div className={`status-banner status-${providerStatus.tone}`}>
                <p>{providerStatus.message}</p>
              </div>
            ) : null}
          </article>
        );
      })}

      <article className="section-panel inlay-card provider-card provider-card-add">
        {!isAddingCustomProvider ? (
          <button
            type="button"
            className="primary-button"
            disabled={customProviderCount >= 10}
            onClick={() => {
              setIsAddingCustomProvider(true);
            }}
          >
            {customProviderCount >= 10
              ? locale === 'zh'
                ? '已达到 10 个自定义服务上限'
                : 'Custom provider limit reached (10)'
              : locale === 'zh'
                ? '+ 添加自定义服务'
                : '+ Add custom provider'}
          </button>
        ) : (
          <div className="workbench-control-panel">
            <label className="field">
              <span>{locale === 'zh' ? '显示名称' : 'Display name'}</span>
              <input
                value={customDraft.label}
                onChange={(event) => {
                  setCustomDraft((current) => ({ ...current, label: event.target.value }));
                }}
              />
            </label>

            <label className="field">
              <span>{locale === 'zh' ? 'API 风格' : 'API style'}</span>
              <select
                value={customDraft.api_style}
                onChange={(event) => {
                  setCustomDraft((current) => ({ ...current, api_style: event.target.value as ProviderApiStyle }));
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>

            <label className="field">
              <span>{locale === 'zh' ? '服务地址' : 'Base URL'}</span>
              <input
                value={customDraft.base_url}
                onChange={(event) => {
                  setCustomDraft((current) => ({ ...current, base_url: event.target.value }));
                }}
              />
            </label>

            <label className="field">
              <span>{locale === 'zh' ? 'API 密钥' : 'API key'}</span>
              <input
                type="password"
                value={customDraft.api_key}
                onChange={(event) => {
                  setCustomDraft((current) => ({ ...current, api_key: event.target.value }));
                }}
              />
            </label>

            <label className="field">
              <span>{locale === 'zh' ? '默认模型名' : 'Default model name'}</span>
              <input
                value={customDraft.default_model}
                onChange={(event) => {
                  setCustomDraft((current) => ({ ...current, default_model: event.target.value }));
                }}
              />
            </label>

            <label className="toggle-field provider-toggle-row">
              <input
                type="checkbox"
                checked={customDraft.enabled}
                onChange={(event) => {
                  setCustomDraft((current) => ({ ...current, enabled: event.target.checked }));
                }}
              />
              <span>{customDraft.enabled ? (locale === 'zh' ? '已启用' : 'Enabled') : locale === 'zh' ? '已禁用' : 'Disabled'}</span>
            </label>

            <div className="card-actions provider-card-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!canSubmitCustomProvider}
                onClick={() => {
                  if (!canSubmitCustomProvider) {
                    return;
                  }

                  addCustomProvider({
                    ...customDraft,
                    label: customDraft.label.trim(),
                    base_url: customDraft.base_url.trim(),
                    default_model: customDraft.default_model.trim(),
                  });
                  setCustomDraft({
                    label: '',
                    api_style: 'openai',
                    base_url: '',
                    api_key: '',
                    default_model: '',
                    enabled: true,
                  });
                  setIsAddingCustomProvider(false);
                }}
              >
                {locale === 'zh' ? '添加' : 'Add'}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setIsAddingCustomProvider(false);
                }}
              >
                {locale === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
