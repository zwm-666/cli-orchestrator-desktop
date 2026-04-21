import type { Locale, RoutingSettings } from '../../../shared/domain.js';
import type { AppState } from '../../../shared/domain.js';
import { LocalToolCard } from './LocalToolCard.js';
import { getDraftAdapterSetting } from '../configPageShared.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';

interface LocalToolsSectionProps {
  locale: Locale;
  userFacingAdapters: AppState['adapters'];
  draftRoutingSettings: RoutingSettings;
  updateAdapterSetting: (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>) => void;
}

export function LocalToolsSection(props: LocalToolsSectionProps): React.JSX.Element {
  const { locale, userFacingAdapters, draftRoutingSettings, updateAdapterSetting } = props;
  const copy = CONFIG_PAGE_COPY[locale];

  return (
    <section id="config-local-tools" className="section-panel inlay-card config-section-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.localToolsSectionEyebrow}</p>
          <h3>{copy.localToolsSectionTitle}</h3>
        </div>
        <span className="status-pill">{userFacingAdapters.length}</span>
      </div>

      <div className="provider-card-grid provider-card-grid-wide">
        {userFacingAdapters.map((adapter) => {
          const adapterSetting = getDraftAdapterSetting(adapter, draftRoutingSettings.adapterSettings[adapter.id]);

          return (
            <LocalToolCard
              key={adapter.id}
              locale={locale}
              adapter={adapter}
              adapterSetting={adapterSetting}
              updateAdapterSetting={updateAdapterSetting}
            />
          );
        })}
      </div>
    </section>
  );
}
