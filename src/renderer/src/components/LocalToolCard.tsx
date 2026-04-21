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
  const localizedDiscoveryReason = getLocalizedCliMessage(locale, adapter.discoveryReason);
  const localizedReadinessReason = getLocalizedCliMessage(locale, adapter.readinessReason);

  return (
    <article id={`config-adapter-${adapter.id}`} className="section-panel inlay-card provider-card">
      <div className="section-heading provider-card-heading">
        <div>
          <p className="section-label">{adapter.displayName}</p>
          <h3>{getAdapterDescription(adapter.id, adapter.description, locale)}</h3>
        </div>
        <div className="badge-pair">
          <span className="state-badge state-succeeded">{getLaunchModeLabel(adapter.launchMode, locale)}</span>
          <span className={`state-badge ${adapter.availability === 'available' ? 'state-succeeded' : 'state-cancelled'}`}>
            {getAvailabilityLabel(adapter.availability, locale)}
          </span>
          <span className={`state-badge ${READINESS_BADGE_CLASSES[adapter.readiness]}`}>
            {READINESS_LABELS[locale][adapter.readiness]}
          </span>
        </div>
      </div>

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
        <input
          value={adapterSetting.defaultModel}
          placeholder={adapter.defaultModel ?? (locale === 'zh' ? '为该工具设置默认模型' : '')}
          onChange={(event) => {
            updateAdapterSetting(adapter.id, { defaultModel: event.target.value });
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
    </article>
  );
}
