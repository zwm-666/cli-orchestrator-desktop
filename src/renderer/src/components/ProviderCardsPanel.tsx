import { useMemo, useState } from 'react';
import type { Locale } from '../../../shared/domain.js';
import type { AiConfig, AiProviderConfig, AiProviderDefinition, ProviderApiStyle } from '../aiConfig.js';
import { AI_PROVIDERS, getProviderDefinition, isCustomProviderId } from '../aiConfig.js';
import type { ProviderStatusMap, VisibilityMap } from '../configPageShared.js';
import { getProviderDescription } from '../configLocalization.js';

const parseModelEditorValue = (value: string): string[] => {
  const uniqueModels = new Set<string>();
  value
    .split(/\r?\n|,/) 
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .forEach((entry) => {
      uniqueModels.add(entry);
    });

  return [...uniqueModels];
};

interface ProviderCardsPanelProps {
  locale: Locale;
  draftConfig: AiConfig;
  providerStatuses: ProviderStatusMap;
  showSecrets: VisibilityMap;
  saveProviderConfig: (providerKey: string, configData: Partial<AiProviderConfig>) => void;
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

const getProviderStateBadge = (locale: Locale, providerStatus: ProviderStatusMap[string], hasKey: boolean): { tone: string; label: string } => {
  if (providerStatus?.tone === 'error') {
    return { tone: 'error', label: locale === 'zh' ? '错误' : 'Error' };
  }

  if (providerStatus?.tone === 'success') {
    return { tone: 'success', label: locale === 'zh' ? '已连接' : 'Connected' };
  }

  return hasKey
    ? { tone: 'loading', label: locale === 'zh' ? '已保存密钥' : 'Key saved' }
    : { tone: 'neutral', label: locale === 'zh' ? '未配置' : 'Not configured' };
};

interface ProviderFieldProps {
  label: string;
  children: React.ReactNode;
}

function ProviderField({ label, children }: ProviderFieldProps): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const renderProviderIdentityConfig = (
  locale: Locale,
  providerConfig: AiProviderConfig,
  saveConfig: (updates: Partial<AiProviderConfig>) => void,
): React.JSX.Element => (
  <>
    <ProviderField label={locale === 'zh' ? '显示名称' : 'Display name'}>
      <input
        value={providerConfig.label ?? ''}
        placeholder={locale === 'zh' ? '例如 OpenRouter / Ollama' : 'For example: OpenRouter / Ollama'}
        onChange={(event) => {
          saveConfig({ label: event.target.value });
        }}
      />
    </ProviderField>

    <ProviderField label={locale === 'zh' ? 'API 风格' : 'API style'}>
      <select
        value={providerConfig.api_style ?? 'openai'}
        onChange={(event) => {
          saveConfig({ api_style: event.target.value as ProviderApiStyle });
        }}
      >
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="gemini">Gemini</option>
      </select>
    </ProviderField>
  </>
);

const renderProviderConnectionConfig = (input: {
  locale: Locale;
  providerId: string;
  providerConfig: AiProviderConfig;
  providerDefinition: AiProviderDefinition;
  showSecrets: VisibilityMap;
  toggleProviderSecretVisibility: (providerId: string) => void;
  saveConfig: (updates: Partial<AiProviderConfig>) => void;
}): React.JSX.Element => {
  const { locale, providerId, providerConfig, providerDefinition, showSecrets, toggleProviderSecretVisibility, saveConfig } = input;

  return (
    <>
      <label className="field provider-secret-field">
        <span>{locale === 'zh' ? 'API 密钥' : 'API key'}</span>
        <div className="provider-secret-row">
          <input
            type={showSecrets[providerId] ? 'text' : 'password'}
            value={providerConfig.api_key}
            placeholder={locale === 'zh' ? '填入当前模型服务的凭据' : 'Paste the credential used for this provider'}
            onChange={(event) => {
              saveConfig({ api_key: event.target.value });
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

      <ProviderField label={locale === 'zh' ? '服务地址' : 'Base URL'}>
        <input
          value={providerConfig.base_url}
          placeholder={providerDefinition.defaultBaseUrl || 'https://'}
          onChange={(event) => {
            saveConfig({ base_url: event.target.value });
          }}
        />
      </ProviderField>
    </>
  );
};

const renderProviderModelConfig = (input: {
  locale: Locale;
  providerId: string;
  providerDefinition: AiProviderDefinition;
  currentModel: string;
  modelEditorValue: string;
  isActiveProvider: boolean;
  saveConfig: (updates: Partial<AiProviderConfig>) => void;
  setActiveModel: (model: string) => void;
}): React.JSX.Element => {
  const { locale, providerDefinition, currentModel, modelEditorValue, isActiveProvider, saveConfig, setActiveModel } = input;
  const setProviderModel = (model: string): void => {
    if (isActiveProvider) {
      setActiveModel(model);
      return;
    }

    saveConfig({ default_model: model });
  };

  return (
    <>
      <ProviderField label={locale === 'zh' ? '已保存模型（每行一个）' : 'Saved models (one per line)'}>
        <textarea
          className="model-list-textarea"
          wrap="off"
          rows={4}
          value={modelEditorValue}
          placeholder={locale === 'zh' ? '例如：\ngpt-4.1\ngpt-5.4' : 'For example:\ngpt-4.1\ngpt-5.4'}
          onChange={(event) => {
            saveConfig({ models: parseModelEditorValue(event.target.value) });
          }}
        />
      </ProviderField>

      <ProviderField label={locale === 'zh' ? '当前默认模型' : 'Current default model'}>
        {providerDefinition.modelSuggestions.length > 0 ? (
          <select
            value={currentModel}
            onChange={(event) => {
              setProviderModel(event.target.value);
            }}
          >
            <option value="">{locale === 'zh' ? '选择模型' : 'Choose a model'}</option>
            {providerDefinition.modelSuggestions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        ) : null}
        <input
          value={currentModel}
          placeholder={locale === 'zh' ? '输入要使用的模型名' : 'Enter the model name to use'}
          onChange={(event) => {
            setProviderModel(event.target.value);
          }}
        />
      </ProviderField>

      {providerDefinition.modelSuggestions.length > 0 ? (
        <div className="badge-pair">
          {providerDefinition.modelSuggestions.map((model) => (
            <button
              key={model}
              type="button"
              className={`secondary-button secondary-button-compact ${currentModel === model ? 'is-active' : ''}`}
              onClick={() => {
                setProviderModel(model);
              }}
            >
              {model}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
};

export function ProviderCardsPanel(props: ProviderCardsPanelProps): React.JSX.Element {
  const {
    locale,
    draftConfig,
    providerStatuses,
    showSecrets,
    saveProviderConfig,
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
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(() => new Set());

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
        const providerStatus = providerStatuses[providerId] ?? null;
        const providerLabel = providerConfig.label?.trim() || providerDefinition.label;
        const isCustom = isCustomProviderId(providerId);
        const hasKey = providerConfig.api_key.trim().length > 0;
        const providerStateBadge = getProviderStateBadge(locale, providerStatus, hasKey);
        const currentModel = draftConfig.active_provider === providerId ? draftConfig.active_model : (providerConfig.default_model ?? '');
        const modelEditorValue = (providerConfig.models ?? []).join('\n');
        const saveConfig = (updates: Partial<AiProviderConfig>): void => {
          saveProviderConfig(providerId, updates);
        };
        const isExpanded = expandedProviderIds.has(providerId);
        const toggleExpanded = (): void => {
          setExpandedProviderIds((current) => {
            const next = new Set(current);
            if (next.has(providerId)) {
              next.delete(providerId);
            } else {
              next.add(providerId);
            }
            return next;
          });
        };

        return (
          <article id={`config-provider-${providerId}`} key={providerId} className={`section-panel inlay-card provider-card provider-card-collapsible ${draftConfig.active_provider === providerId ? 'is-active' : ''} ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
            <div className="section-heading provider-card-heading">
              <div>
                <p className="section-label">{providerLabel}</p>
                <h3>{getProviderDescription(providerId, providerDefinition.description, locale)}</h3>
              </div>
              <div className="provider-card-heading-actions">
                <span className={`state-badge provider-state provider-state-${providerStateBadge.tone}`}>{providerStateBadge.label}</span>
                {draftConfig.active_provider === providerId ? <span className="status-pill">{locale === 'zh' ? '当前' : 'Active'}</span> : null}
                <button type="button" className="secondary-button secondary-button-compact" onClick={toggleExpanded}>
                  {isExpanded ? (locale === 'zh' ? '收起' : 'Collapse') : locale === 'zh' ? '展开' : 'Expand'}
                </button>
              </div>
            </div>

            {isExpanded ? (
              <>
                {isCustom ? renderProviderIdentityConfig(locale, providerConfig, saveConfig) : null}

                {renderProviderConnectionConfig({
                  locale,
                  providerId,
                  providerConfig,
                  providerDefinition,
                  showSecrets,
                  toggleProviderSecretVisibility,
                  saveConfig,
                })}

                {renderProviderModelConfig({
                  locale,
                  providerId,
                  providerDefinition,
                  currentModel,
                  modelEditorValue,
                  isActiveProvider: draftConfig.active_provider === providerId,
                  saveConfig,
                  setActiveModel,
                })}

                <label className="toggle-field provider-toggle-row">
                  <input
                    type="checkbox"
                  checked={providerConfig.enabled}
                  onChange={(event) => {
                    saveConfig({ enabled: event.target.checked });
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
              </>
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
