import type { Locale } from '../../../shared/domain.js';
import type { InlineStatus } from '../configPageShared.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';

interface ConfigSaveActionsSectionProps {
  locale: Locale;
  saveStatus: InlineStatus | null;
  testStatus: InlineStatus | null;
  adapterStatus: InlineStatus | null;
  onSave: () => Promise<void>;
  onTestActiveProvider: () => Promise<void>;
  onRefreshAdapters: () => Promise<void>;
}

export function ConfigSaveActionsSection(props: ConfigSaveActionsSectionProps): React.JSX.Element {
  const { locale, saveStatus, testStatus, adapterStatus, onSave, onTestActiveProvider, onRefreshAdapters } = props;
  const copy = CONFIG_PAGE_COPY[locale];

  return (
    <section id="config-actions" className="section-panel inlay-card config-section-card config-section-card-narrow">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.actionsSectionEyebrow}</p>
          <h3>{copy.actionsSectionTitle}</h3>
        </div>
      </div>

      <div className="card-actions save-test-actions">
        <button type="button" className="primary-button" onClick={() => { void onSave(); }}>
          {copy.saveAllLabel}
        </button>
        <button type="button" className="secondary-button" onClick={() => { void onTestActiveProvider(); }}>
          {copy.testActiveProviderLabel}
        </button>
        <button type="button" className="secondary-button" onClick={() => { void onRefreshAdapters(); }}>
          {copy.refreshLocalToolsLabel}
        </button>
      </div>

      {saveStatus ? <div className={`status-banner status-${saveStatus.tone}`}><p>{saveStatus.message}</p></div> : null}
      {testStatus ? <div className={`status-banner status-${testStatus.tone}`}><p>{testStatus.message}</p></div> : null}
      {adapterStatus ? <div className={`status-banner status-${adapterStatus.tone}`}><p>{adapterStatus.message}</p></div> : null}
    </section>
  );
}
