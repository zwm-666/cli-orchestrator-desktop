import type { Locale } from '../../../shared/domain.js';
import type { AiConfig, AiProviderConfig, AiProviderDefinition, ProviderApiStyle } from '../aiConfig.js';
import { ActiveProviderPanel } from './ActiveProviderPanel.js';
import { ProviderCardsPanel } from './ProviderCardsPanel.js';
import type { ProviderStatusMap, VisibilityMap } from '../configPageShared.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';

interface ProviderConfigSectionProps {
  locale: Locale;
  draftConfig: AiConfig;
  providerStatuses: ProviderStatusMap;
  showSecrets: VisibilityMap;
  activeProviderDefinition: AiProviderDefinition | null;
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

export function ProviderConfigSection(props: ProviderConfigSectionProps): React.JSX.Element {
  const {
    locale,
    draftConfig,
    providerStatuses,
    showSecrets,
    activeProviderDefinition,
    updateProvider,
    toggleProviderSecretVisibility,
    setActiveProvider,
    setActiveModel,
    addCustomProvider,
    removeCustomProvider,
    handleTestProvider,
  } = props;

  const copy = CONFIG_PAGE_COPY[locale];

  return (
    <section id="config-providers" className="section-panel inlay-card config-section-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.providerSectionEyebrow}</p>
          <h3>{copy.providerSectionTitle}</h3>
        </div>
        <span className="status-pill">{Object.keys(draftConfig.providers).length}</span>
      </div>

      <ProviderCardsPanel
        locale={locale}
        draftConfig={draftConfig}
        providerStatuses={providerStatuses}
        showSecrets={showSecrets}
        updateProvider={updateProvider}
        toggleProviderSecretVisibility={toggleProviderSecretVisibility}
        setActiveProvider={setActiveProvider}
        setActiveModel={setActiveModel}
        addCustomProvider={addCustomProvider}
        removeCustomProvider={removeCustomProvider}
        handleTestProvider={handleTestProvider}
      />

      <ActiveProviderPanel
        locale={locale}
        draftConfig={draftConfig}
        activeProviderDefinition={activeProviderDefinition}
        setActiveProvider={setActiveProvider}
        setActiveModel={setActiveModel}
      />
    </section>
  );
}
