import { useState } from 'react';
import type { Locale, RoutingSettings } from '../../../shared/domain.js';
import type { AppState } from '../../../shared/domain.js';
import { getAdapterDescription, getAvailabilityLabel, getLaunchModeLabel } from '../configLocalization.js';
import { COPY, READINESS_BADGE_CLASSES, READINESS_LABELS } from '../copy.js';
import { getLocalizedCliMessage, renderAdapterMetaLine } from '../helpers.js';

interface LocalToolCardProps {
  locale: Locale;
  adapter: AppState['adapters'][number];
  adapterSetting: RoutingSettings['adapterSettings'][string];
  updateAdapterSetting: (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>) => void;
}

export function LocalToolCard({ locale, adapter, adapterSetting, updateAdapterSetting }: LocalToolCardProps): React.JSX.Element {
  const copy = COPY[locale];
  const [isExpanded, setIsExpanded] = useState(false);
  const localizedDiscoveryReason = getLocalizedCliMessage(locale, adapter.discoveryReason);
  const localizedReadinessReason = getLocalizedCliMessage(locale, adapter.readinessReason);
  const modelOptions = [...new Set([adapterSetting.defaultModel, ...(adapterSetting.modelOptions ?? []), adapter.defaultModel ?? '', ...adapter.supportedModels].map((model) => model.trim()).filter((model) => model.length > 0))];

  return (
    <article id={`config-adapter-${adapter.id}`} className={`section-panel inlay-card provider-card provider-card-collapsible ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="section-heading provider-card-heading">
        <div>
          <p className="section-label">{adapter.displayName}</p>
          <h3>{getAdapterDescription(adapter.id, adapter.description, locale)}</h3>
        </div>
        <div className="provider-card-heading-actions">
          <span className="state-badge state-succeeded">{getLaunchModeLabel(adapter.launchMode, locale)}</span>
          <span className={`state-badge ${adapter.availability === 'available' ? 'state-succeeded' : 'state-cancelled'}`}>
            {getAvailabilityLabel(adapter.availability, locale)}
          </span>
          <span className={`state-badge ${READINESS_BADGE_CLASSES[adapter.readiness]}`}>
            {READINESS_LABELS[locale][adapter.readiness]}
          </span>
          <button type="button" className="secondary-button secondary-button-compact" onClick={() => { setIsExpanded((current) => !current); }}>
            {isExpanded ? (locale === 'zh' ? '收起' : 'Collapse') : locale === 'zh' ? '展开' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <>
          <div className="adapter-meta-list">
            {renderAdapterMetaLine(copy.discoveryReasonLabel, localizedDiscoveryReason)}
            {localizedReadinessReason !== localizedDiscoveryReason ? renderAdapterMetaLine(copy.readinessReasonLabel, localizedReadinessReason) : null}
          </div>

          <label className="toggle-field provider-toggle-row">
            <input
              type="checkbox"
              checked={adapterSetting.enabled}
              disabled={adapter.availability !== 'available'}
              onChange={(event) => {
                updateAdapterSetting(adapter.id, { enabled: event.target.checked });
              }}
            />
            <span>{adapterSetting.enabled ? copy.enabled : copy.disabled}</span>
          </label>

          <label className="field">
            <span>{locale === 'zh' ? '默认模型' : 'Default model'}</span>
            <select
              value={adapterSetting.defaultModel}
              onChange={(event) => {
                updateAdapterSetting(adapter.id, { defaultModel: event.target.value, modelOptions });
              }}
            >
              <option value="">{locale === 'zh' ? '自动选择模型' : 'Auto select model'}</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{locale === 'zh' ? '可选模型（每行一个）' : 'Available models (one per line)'}</span>
            <textarea
              rows={3}
              value={modelOptions.join('\n')}
              placeholder={adapter.defaultModel ?? (locale === 'zh' ? '为该工具添加多个模型' : 'Add models for this tool')}
              onChange={(event) => {
                const nextModels = [...new Set(event.target.value.split(/\r?\n|,/u).map((model) => model.trim()).filter((model) => model.length > 0))];
                updateAdapterSetting(adapter.id, { modelOptions: nextModels, defaultModel: nextModels.includes(adapterSetting.defaultModel) ? adapterSetting.defaultModel : nextModels[0] ?? '' });
              }}
            />
          </label>

          <label className="field">
            <span>{copy.customCommandLabel}</span>
            <input
              value={adapterSetting.customCommand}
              placeholder={adapter.command}
              onChange={(event) => {
                updateAdapterSetting(adapter.id, { customCommand: event.target.value });
              }}
            />
          </label>
        </>
      ) : null}
    </article>
  );
}
