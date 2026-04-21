import { useEffect, useMemo, useState } from 'react';
import type {
  AppState,
  Locale,
  RoutingSettings,
  SkillDefinition,
  WorkbenchSkillBinding,
  WorkbenchState,
  WorkbenchTargetKind,
} from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import type { AiConfig, AiProviderId } from '../aiConfig.js';
import { AI_CONFIG_STORAGE_KEY, AI_PROVIDERS, getProviderDefinition } from '../aiConfig.js';
import { localizeProviderRuntimeMessage } from '../providerRuntimeLocalization.js';
import { testProviderConnection } from '../providerApi.js';
import {
  type InlineStatus,
  type ProviderStatusMap,
  type VisibilityMap,
  createProviderStatusMap,
  createSkillBinding,
  createVisibilityMap,
  getActiveProviderConnectionStatus,
  getActiveProviderRequiredStatus,
  getAdapterRefreshLoadingStatus,
  getAdapterRefreshSuccessStatus,
  getConfigSaveStatusMessage,
  getDraftAdapterSetting,
  getProviderConnectionLoadingStatus,
} from '../configPageShared.js';
import { localizeCliMessage } from '../../../shared/localizeCliMessage.js';

interface UseConfigPageControllerInput {
  locale: Locale;
  aiConfig: AiConfig;
  appState: AppState;
  routingSettings: RoutingSettings;
  onSaveAiConfig: (config: AiConfig) => void;
  onSaveRoutingSettings: (settings: RoutingSettings) => void | Promise<void>;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
  onSaveSkill: (skill: SkillDefinition) => void | Promise<void>;
}

export interface UseConfigPageControllerResult {
  draftConfig: AiConfig;
  draftRoutingSettings: RoutingSettings;
  draftWorkbench: WorkbenchState;
  saveStatus: InlineStatus | null;
  testStatus: InlineStatus | null;
  adapterStatus: InlineStatus | null;
  providerStatuses: ProviderStatusMap;
  showSecrets: VisibilityMap;
  activeProviderDefinition: ReturnType<typeof getProviderDefinition> | null;
  userFacingAdapters: AppState['adapters'];
  providerOptions: Array<{ id: string; label: string }>;
  adapterOptions: Array<{ id: string; label: string }>;
  getTargetOptions: (targetKind: WorkbenchTargetKind) => Array<{ id: string; label: string }>;
  updateProvider: (providerId: AiProviderId, updates: Partial<AiConfig['providers'][AiProviderId]>) => void;
  toggleProviderSecretVisibility: (providerId: AiProviderId) => void;
  setActiveProvider: (providerId: AiProviderId | null) => void;
  setActiveModel: (model: string) => void;
  updateAdapterSetting: (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>) => void;
  addBinding: () => void;
  updateBinding: (bindingId: string, updates: Partial<WorkbenchSkillBinding>) => void;
  removeBinding: (bindingId: string) => void;
  toggleBindingSkill: (bindingId: string, skillId: string, enabled: boolean) => void;
  handleSave: () => Promise<void>;
  handleTestProvider: (providerId: AiProviderId) => Promise<void>;
  handleTestActiveProvider: () => Promise<void>;
  handleRefreshAdapters: () => Promise<void>;
  handleSaveSkill: (skill: SkillDefinition) => void;
}

export function useConfigPageController(input: UseConfigPageControllerInput): UseConfigPageControllerResult {
  const { locale, aiConfig, appState, routingSettings, onSaveAiConfig, onSaveRoutingSettings, onSaveWorkbenchState, onSaveSkill } = input;
  const [draftConfig, setDraftConfig] = useState(aiConfig);
  const [draftRoutingSettings, setDraftRoutingSettings] = useState(routingSettings);
  const [draftWorkbench, setDraftWorkbench] = useState(appState.workbench ?? DEFAULT_WORKBENCH_STATE);
  const [saveStatus, setSaveStatus] = useState<InlineStatus | null>(null);
  const [testStatus, setTestStatus] = useState<InlineStatus | null>(null);
  const [adapterStatus, setAdapterStatus] = useState<InlineStatus | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatusMap>(() => createProviderStatusMap());
  const [showSecrets, setShowSecrets] = useState<VisibilityMap>(() => createVisibilityMap());

  useEffect(() => {
    setDraftConfig(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    setDraftRoutingSettings(routingSettings);
  }, [routingSettings]);

  useEffect(() => {
    setDraftWorkbench(appState.workbench ?? DEFAULT_WORKBENCH_STATE);
  }, [appState.workbench]);

  const activeProviderDefinition = useMemo(
    () => (draftConfig.active_provider ? getProviderDefinition(draftConfig.active_provider) : null),
    [draftConfig.active_provider],
  );
  const providerOptions = useMemo(
    () => AI_PROVIDERS.map((provider) => ({
      id: provider.id,
      label: locale === 'zh' && provider.id === 'custom' ? '自定义兼容服务' : provider.label,
    })),
    [locale],
  );

  const userFacingAdapters = useMemo(
    () => appState.adapters.filter((adapter) => adapter.visibility === 'user'),
    [appState.adapters],
  );
  const adapterOptions = useMemo(
    () => userFacingAdapters.map((adapter) => ({ id: adapter.id, label: adapter.displayName })),
    [userFacingAdapters],
  );

  const getTargetOptions = (targetKind: WorkbenchTargetKind): Array<{ id: string; label: string }> => {
    if (targetKind === 'provider') {
      return providerOptions;
    }

    return adapterOptions;
  };

  const updateProvider = (providerId: AiProviderId, updates: Partial<AiConfig['providers'][AiProviderId]>): void => {
    setDraftConfig((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [providerId]: {
          ...current.providers[providerId],
          ...updates,
        },
      },
    }));
  };

  const toggleProviderSecretVisibility = (providerId: AiProviderId): void => {
    setShowSecrets((current) => ({ ...current, [providerId]: !current[providerId] }));
  };

  const setActiveProvider = (providerId: AiProviderId | null): void => {
    if (!providerId) {
      setDraftConfig((current) => ({ ...current, active_provider: null, active_model: '' }));
      return;
    }

    const providerDefinition = getProviderDefinition(providerId);
    setDraftConfig((current) => ({
      ...current,
      active_provider: providerId,
      active_model: current.active_provider === providerId && current.active_model ? current.active_model : providerDefinition.modelSuggestions[0] ?? '',
    }));
  };

  const setActiveModel = (model: string): void => {
    setDraftConfig((current) => ({ ...current, active_model: model }));
  };

  const updateAdapterSetting = (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>): void => {
    const adapter = userFacingAdapters.find((entry) => entry.id === adapterId);
    const fallback = adapter
      ? getDraftAdapterSetting(adapter, draftRoutingSettings.adapterSettings[adapterId])
      : (draftRoutingSettings.adapterSettings[adapterId] ?? {
          enabled: true,
          defaultModel: '',
          customCommand: '',
        });

    setDraftRoutingSettings((current) => ({
      ...current,
      adapterSettings: {
        ...current.adapterSettings,
        [adapterId]: {
          ...fallback,
          ...updates,
        },
      },
    }));
  };

  const addBinding = (): void => {
    setDraftWorkbench((current) => ({
      ...current,
      skillBindings: [...current.skillBindings, createSkillBinding()],
    }));
  };

  const updateBinding = (bindingId: string, updates: Partial<WorkbenchSkillBinding>): void => {
    setDraftWorkbench((current) => ({
      ...current,
      skillBindings: current.skillBindings.map((binding) => (binding.id === bindingId ? { ...binding, ...updates } : binding)),
    }));
  };

  const removeBinding = (bindingId: string): void => {
    setDraftWorkbench((current) => ({
      ...current,
      skillBindings: current.skillBindings.filter((binding) => binding.id !== bindingId),
    }));
  };

  const toggleBindingSkill = (bindingId: string, skillId: string, enabled: boolean): void => {
    setDraftWorkbench((current) => ({
      ...current,
      skillBindings: current.skillBindings.map((binding) => {
        if (binding.id !== bindingId) {
          return binding;
        }

        return {
          ...binding,
          enabledSkillIds: enabled
            ? [...binding.enabledSkillIds, skillId]
            : binding.enabledSkillIds.filter((entry) => entry !== skillId),
        };
      }),
    }));
  };

  const handleSave = async (): Promise<void> => {
    onSaveAiConfig(draftConfig);
    await onSaveRoutingSettings(draftRoutingSettings);
    await onSaveWorkbenchState(draftWorkbench);
    setSaveStatus(getConfigSaveStatusMessage(locale, AI_CONFIG_STORAGE_KEY));
  };

  const handleTestProvider = async (providerId: AiProviderId): Promise<void> => {
    const providerConfig = draftConfig.providers[providerId];
    const startedAt = performance.now();

    setProviderStatuses((current) => ({
      ...current,
      [providerId]: getProviderConnectionLoadingStatus(locale),
    }));

    try {
      const result = await testProviderConnection(providerId, providerConfig);
      const latency = Math.round(performance.now() - startedAt);
      const message = `${localizeProviderRuntimeMessage(result, locale)} · ${latency} ms`;
      setProviderStatuses((current) => ({
        ...current,
        [providerId]: { tone: 'success', message },
      }));

      if (draftConfig.active_provider === providerId) {
        setTestStatus(getActiveProviderConnectionStatus(locale, latency));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? localizeProviderRuntimeMessage(error.message, locale) : locale === 'zh' ? '无法连接当前服务。' : 'Unable to reach the provider.';
      setProviderStatuses((current) => ({
        ...current,
        [providerId]: { tone: 'error', message },
      }));

      if (draftConfig.active_provider === providerId) {
        setTestStatus({ tone: 'error', message });
      }
    }
  };

  const handleTestActiveProvider = async (): Promise<void> => {
    if (!draftConfig.active_provider) {
      setTestStatus(getActiveProviderRequiredStatus(locale));
      return;
    }

    await handleTestProvider(draftConfig.active_provider);
  };

  const handleSaveSkill = (skill: SkillDefinition): void => {
    void onSaveSkill(skill);
  };

  const handleRefreshAdapters = async (): Promise<void> => {
    setAdapterStatus(getAdapterRefreshLoadingStatus(locale));

    try {
      await onSaveRoutingSettings(draftRoutingSettings);
      const nextState = await window.desktopApi.refreshAdapters();
      const availableCount = nextState.adapters.filter((adapter) => adapter.visibility === 'user' && adapter.availability === 'available').length;
      setAdapterStatus(getAdapterRefreshSuccessStatus(locale, availableCount));
    } catch (error: unknown) {
      setAdapterStatus({
        tone: 'error',
        message: error instanceof Error ? localizeCliMessage(error.message, locale) : locale === 'zh' ? '刷新本地工具检测失败。' : 'Failed to refresh local tool detection.',
      });
    }
  };

  return {
    draftConfig,
    draftRoutingSettings,
    draftWorkbench,
    saveStatus,
    testStatus,
    adapterStatus,
    providerStatuses,
    showSecrets,
    activeProviderDefinition,
    userFacingAdapters,
    providerOptions,
    adapterOptions,
    getTargetOptions,
    updateProvider,
    toggleProviderSecretVisibility,
    setActiveProvider,
    setActiveModel,
    updateAdapterSetting,
    addBinding,
    updateBinding,
    removeBinding,
    toggleBindingSkill,
    handleSave,
    handleTestProvider,
    handleTestActiveProvider,
    handleRefreshAdapters,
    handleSaveSkill,
  };
}
