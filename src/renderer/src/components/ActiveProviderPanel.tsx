import type { Locale } from '../../../shared/domain.js';
import type { AiConfig, AiProviderDefinition, AiProviderId } from '../aiConfig.js';
import { AI_PROVIDERS, getProviderDefinition, isProviderReady } from '../aiConfig.js';

interface ActiveProviderPanelProps {
  locale: Locale;
  draftConfig: AiConfig;
  activeProviderDefinition: AiProviderDefinition | null;
  setActiveProvider: (providerId: AiProviderId | null) => void;
  setActiveModel: (model: string) => void;
}

export function ActiveProviderPanel({ locale, draftConfig, activeProviderDefinition, setActiveProvider, setActiveModel }: ActiveProviderPanelProps): React.JSX.Element {
  return (
    <div className="config-provider-summary subdued-row">
      <div className="selector-strip">
        <label className="field">
          <span>{locale === 'zh' ? '当前模型服务' : 'Active provider'}</span>
          <select
            value={draftConfig.active_provider ?? ''}
            onChange={(event) => {
              const providerId = event.target.value;
              setActiveProvider(providerId ? (providerId as AiProviderId) : null);
            }}
          >
            <option value="">{locale === 'zh' ? '选择模型服务' : 'Choose a provider'}</option>
            {AI_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {locale === 'zh' && provider.id === 'custom' ? '自定义兼容服务' : provider.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{locale === 'zh' ? '默认模型' : 'Active model'}</span>
          <input
            list={activeProviderDefinition ? `${activeProviderDefinition.id}-model-list` : undefined}
            value={draftConfig.active_model}
            placeholder={locale === 'zh' ? '工作台默认使用的模型' : 'Model used by the Work page'}
            disabled={!draftConfig.active_provider}
            onChange={(event) => {
              setActiveModel(event.target.value);
            }}
          />
          {activeProviderDefinition ? (
            <datalist id={`${activeProviderDefinition.id}-model-list`}>
              {activeProviderDefinition.modelSuggestions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          ) : null}
        </label>
      </div>

      {draftConfig.active_provider ? (
        <p className="muted config-provider-summary-copy">
          {locale === 'zh'
            ? `工作台当前会使用 ${getProviderDefinition(draftConfig.active_provider).label} / ${draftConfig.active_model || '未指定模型'}。${isProviderReady(draftConfig.providers[draftConfig.active_provider], draftConfig.active_model) ? '当前可直接使用。' : '请补全凭据或模型后再使用。'}`
            : `The Work page currently uses ${getProviderDefinition(draftConfig.active_provider).label} / ${draftConfig.active_model || 'no model selected'}. ${isProviderReady(draftConfig.providers[draftConfig.active_provider], draftConfig.active_model) ? 'It is ready to use.' : 'Finish the credentials or model before using it.'}`}
        </p>
      ) : null}
    </div>
  );
}
