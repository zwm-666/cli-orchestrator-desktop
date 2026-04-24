import type { Locale } from '../../../shared/domain.js';
import type { AiConfig, AiProviderDefinition } from '../aiConfig.js';
import { getProviderDefinition, isProviderReady } from '../aiConfig.js';

interface ActiveProviderPanelProps {
  locale: Locale;
  draftConfig: AiConfig;
  activeProviderDefinition: AiProviderDefinition | null;
  setActiveProvider: (providerId: string | null) => void;
  setActiveModel: (model: string) => void;
}

export function ActiveProviderPanel({ locale, draftConfig, activeProviderDefinition, setActiveProvider, setActiveModel }: ActiveProviderPanelProps): React.JSX.Element {
  const activeProviderConfig = draftConfig.active_provider ? draftConfig.providers[draftConfig.active_provider] : null;
  const modelOptions = activeProviderDefinition?.modelSuggestions ?? [];

  return (
    <div className="config-provider-summary subdued-row">
      <div className="selector-strip">
        <label className="field">
          <span>{locale === 'zh' ? '当前模型服务' : 'Active provider'}</span>
          <select
            value={draftConfig.active_provider ?? ''}
            onChange={(event) => {
              const providerId = event.target.value;
              setActiveProvider(providerId || null);
            }}
          >
            <option value="">{locale === 'zh' ? '选择模型服务' : 'Choose a provider'}</option>
            {Object.entries(draftConfig.providers).map(([providerId, providerConfig]) => (
              <option key={providerId} value={providerId}>
                {providerConfig.label?.trim() || getProviderDefinition(providerId, providerConfig).label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{locale === 'zh' ? '默认模型' : 'Active model'}</span>
          {modelOptions.length > 0 ? (
            <select
              value={draftConfig.active_model}
              disabled={!draftConfig.active_provider}
              onChange={(event) => {
                setActiveModel(event.target.value);
              }}
            >
              <option value="">{locale === 'zh' ? '选择已保存模型' : 'Choose a saved model'}</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : null}
          <input
            list={activeProviderDefinition ? `${activeProviderDefinition.id}-model-list` : undefined}
            value={draftConfig.active_model}
            placeholder={locale === 'zh' ? '工作台默认使用的模型，可手输新模型' : 'Model used by the Work page, or type a new one'}
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

      {draftConfig.active_provider && activeProviderConfig ? (
        <p className="muted config-provider-summary-copy">
          {locale === 'zh'
            ? `工作台当前会使用 ${getProviderDefinition(draftConfig.active_provider, activeProviderConfig).label} / ${draftConfig.active_model || '未指定模型'}。${isProviderReady(activeProviderConfig, draftConfig.active_model) ? '当前可直接使用。' : '请补全凭据或模型后再使用。'}`
            : `The Work page currently uses ${getProviderDefinition(draftConfig.active_provider, activeProviderConfig).label} / ${draftConfig.active_model || 'no model selected'}. ${isProviderReady(activeProviderConfig, draftConfig.active_model) ? 'It is ready to use.' : 'Finish the credentials or model before using it.'}`}
        </p>
      ) : null}
    </div>
  );
}
