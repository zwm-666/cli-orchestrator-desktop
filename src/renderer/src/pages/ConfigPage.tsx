import type { AppState, Locale, RoutingSettings, SkillDefinition, WorkbenchState } from '../../../shared/domain.js';
import type { PromptBuilderConfig } from '../../../shared/promptBuilder.js';
import type { AiConfig } from '../aiConfig.js';
import { AgentProfilesConfigSection } from '../components/AgentProfilesConfigSection.js';
import { ConfigIndexRail } from '../components/ConfigIndexRail.js';
import { ConfigSaveActionsSection } from '../components/ConfigSaveActionsSection.js';
import { LocalToolsSection } from '../components/LocalToolsSection.js';
import { PromptBuilderConfigSection } from '../components/PromptBuilderConfigSection.js';
import { ProviderConfigSection } from '../components/ProviderConfigSection.js';
import { SkillBindingsSection } from '../components/SkillBindingsSection.js';
import { useConfigPageController } from '../hooks/useConfigPageController.js';
import { usePromptBuilderConfigController } from '../hooks/usePromptBuilderConfigController.js';

interface ConfigPageProps {
  locale: Locale;
  aiConfig: AiConfig;
  appState: AppState;
  routingSettings: RoutingSettings;
  onSaveAiConfig: (config: AiConfig) => void | Promise<void>;
  onSaveRoutingSettings: (settings: RoutingSettings) => void | Promise<void>;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
  onSaveSkill: (skill: SkillDefinition) => void | Promise<void>;
  onSavePromptBuilderConfig: (config: PromptBuilderConfig) => void;
}

export function ConfigPage(props: ConfigPageProps): React.JSX.Element {
  const { locale, aiConfig, appState, routingSettings, onSaveAiConfig, onSaveRoutingSettings, onSaveWorkbenchState, onSaveSkill, onSavePromptBuilderConfig } = props;
  const controller = useConfigPageController({
    locale,
    aiConfig,
    appState,
    routingSettings,
    onSaveAiConfig,
    onSaveRoutingSettings,
    onSaveWorkbenchState,
    onSaveSkill,
  });
  const promptBuilderController = usePromptBuilderConfigController(locale, onSavePromptBuilderConfig);

  return (
    <section className="page-stack config-page">
      <div className="config-layout">
        <ConfigIndexRail
          locale={locale}
          providerItems={controller.providerOptions}
          adapterItems={controller.adapterOptions}
        />

        <div className="config-main-stack">
          <ProviderConfigSection
            locale={locale}
            draftConfig={controller.draftConfig}
            providerStatuses={controller.providerStatuses}
            showSecrets={controller.showSecrets}
            activeProviderDefinition={controller.activeProviderDefinition}
            saveProviderConfig={controller.saveProviderConfig}
            toggleProviderSecretVisibility={controller.toggleProviderSecretVisibility}
            setActiveProvider={controller.setActiveProvider}
            setActiveModel={controller.setActiveModel}
            addCustomProvider={controller.addCustomProvider}
            removeCustomProvider={controller.removeCustomProvider}
            handleFetchProviderModels={controller.handleFetchProviderModels}
            handleTestProvider={controller.handleTestProvider}
          />

          <LocalToolsSection
            locale={locale}
            userFacingAdapters={controller.userFacingAdapters}
            draftRoutingSettings={controller.draftRoutingSettings}
            updateAdapterSetting={controller.updateAdapterSetting}
          />

          <AgentProfilesConfigSection
            locale={locale}
            agentProfiles={appState.agentProfiles}
            adapters={appState.adapters}
            aiConfig={controller.draftConfig}
            onSaveAgentProfile={controller.handleSaveAgentProfile}
          />

          <SkillBindingsSection
            locale={locale}
            skills={appState.skills}
            bindings={controller.draftWorkbench.skillBindings}
            onSaveSkill={controller.handleSaveSkill}
            addBinding={controller.addBinding}
            updateBinding={controller.updateBinding}
            removeBinding={controller.removeBinding}
            toggleBindingSkill={controller.toggleBindingSkill}
            getTargetOptions={controller.getTargetOptions}
          />

          <PromptBuilderConfigSection
            locale={locale}
            draftConfig={promptBuilderController.draftConfig}
            isLoading={promptBuilderController.isLoading}
            loadError={promptBuilderController.loadError}
            saveStatus={promptBuilderController.saveStatus}
            updateTemplate={promptBuilderController.updateTemplate}
            onSave={promptBuilderController.handleSave}
          />

          <ConfigSaveActionsSection
            locale={locale}
            saveStatus={controller.saveStatus}
            testStatus={controller.testStatus}
            adapterStatus={controller.adapterStatus}
            onSave={controller.handleSave}
            onTestActiveProvider={controller.handleTestActiveProvider}
            onRefreshAdapters={controller.handleRefreshAdapters}
          />
        </div>
      </div>
    </section>
  );
}
