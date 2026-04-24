import { useEffect, useMemo, useState } from 'react';
import type {
  AppState,
  AgentProfile,
  Locale,
  RoutingSettings,
  SkillDefinition,
  WorkbenchSkillBinding,
  WorkbenchState,
  WorkbenchTargetKind,
} from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import type { AiConfig, AiProviderConfig, ProviderApiStyle } from '../aiConfig.js';
import { AI_CONFIG_STORAGE_KEY, getProviderDefinition, isCustomProviderId, mergeProviderModelLists } from '../aiConfig.js';
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
  onSaveAiConfig: (config: AiConfig) => void | Promise<void>;
  onSaveRoutingSettings: (settings: RoutingSettings) => void | Promise<void>;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
  onSaveSkill: (skill: SkillDefinition) => void | Promise<void>;
}

interface CustomProviderInput {
  label: string;
  base_url: string;
  api_key: string;
  default_model: string;
  api_style: ProviderApiStyle;
  enabled: boolean;
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
  providerOptions: { id: string; label: string }[];
  adapterOptions: { id: string; label: string }[];
  getTargetOptions: (targetKind: WorkbenchTargetKind) => { id: string; label: string }[];
  updateProvider: (providerId: string, updates: Partial<AiProviderConfig>) => void;
  toggleProviderSecretVisibility: (providerId: string) => void;
  setActiveProvider: (providerId: string | null) => void;
  setActiveModel: (model: string) => void;
  addCustomProvider: (input: CustomProviderInput) => void;
  removeCustomProvider: (providerId: string) => void;
  updateAdapterSetting: (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>) => void;
  addBinding: () => void;
  updateBinding: (bindingId: string, updates: Partial<WorkbenchSkillBinding>) => void;
  removeBinding: (bindingId: string) => void;
  toggleBindingSkill: (bindingId: string, skillId: string, enabled: boolean) => void;
  handleSave: () => Promise<void>;
  handleTestProvider: (providerId: string) => Promise<void>;
  handleTestActiveProvider: () => Promise<void>;
  handleRefreshAdapters: () => Promise<void>;
  handleSaveSkill: (skill: SkillDefinition) => void;
  handleSaveAgentProfile: (profile: AgentProfile) => void;
}

const omitRecordKey = <TValue,>(record: Record<string, TValue>, keyToOmit: string): Record<string, TValue> => {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== keyToOmit));
};

export const applyProviderConfigUpdate = (current: AiConfig, providerId: string, updates: Partial<AiProviderConfig>): AiConfig => {
  const currentProvider = current.providers[providerId];
  if (!currentProvider) {
    return current;
  }

  const nextProvider: AiProviderConfig = {
    ...currentProvider,
    ...updates,
  };

  if ('models' in updates) {
    nextProvider.models = mergeProviderModelLists(updates.models);
  } else {
    nextProvider.models = mergeProviderModelLists(nextProvider.models);
  }

  if (typeof nextProvider.default_model === 'string' && nextProvider.default_model.trim().length === 0) {
    nextProvider.default_model = nextProvider.models[0] ?? '';
  }

  if (
    (typeof updates.api_key === 'string' && updates.api_key.trim().length > 0) ||
    (typeof updates.base_url === 'string' && updates.base_url.trim().length > 0)
  ) {
    nextProvider.enabled = true;
  }

  return {
    ...current,
    active_model:
      current.active_provider === providerId && typeof updates.default_model === 'string'
        ? nextProvider.default_model ?? updates.default_model
        : current.active_model,
    providers: {
      ...current.providers,
      [providerId]: nextProvider,
    },
  };
};

export const applyActiveProviderModel = (current: AiConfig, model: string): AiConfig => {
  if (!current.active_provider) {
    return { ...current, active_model: model };
  }

  const activeProviderConfig = current.providers[current.active_provider];
  if (!activeProviderConfig) {
    return { ...current, active_model: model };
  }

  return {
    ...current,
    active_model: model,
    providers: {
      ...current.providers,
      [current.active_provider]: {
        ...activeProviderConfig,
        default_model: model,
        models: mergeProviderModelLists(activeProviderConfig.models),
      },
    },
  };
};

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
    () => (draftConfig.active_provider ? getProviderDefinition(draftConfig.active_provider, draftConfig.providers[draftConfig.active_provider]) : null),
    [draftConfig.active_provider, draftConfig.providers],
  );
  const providerOptions = useMemo(
    () =>
      Object.entries(draftConfig.providers).map(([providerId, providerConfig]) => ({
        id: providerId,
        label: providerConfig.label?.trim() || getProviderDefinition(providerId, providerConfig).label,
      })),
    [draftConfig.providers],
  );

  const userFacingAdapters = useMemo(
    () => appState.adapters.filter((adapter) => adapter.visibility === 'user'),
    [appState.adapters],
  );
  const adapterOptions = useMemo(
    () => userFacingAdapters.map((adapter) => ({ id: adapter.id, label: adapter.displayName })),
    [userFacingAdapters],
  );

  const getTargetOptions = (targetKind: WorkbenchTargetKind): { id: string; label: string }[] => {
    if (targetKind === 'provider') {
      return providerOptions;
    }

    return adapterOptions;
  };

  const updateProvider = (providerId: string, updates: Partial<AiProviderConfig>): void => {
    setDraftConfig((current) => applyProviderConfigUpdate(current, providerId, updates));
  };

  const toggleProviderSecretVisibility = (providerId: string): void => {
    setShowSecrets((current) => ({ ...current, [providerId]: !current[providerId] }));
  };

  const setActiveProvider = (providerId: string | null): void => {
    if (!providerId) {
      setDraftConfig((current) => ({ ...current, active_provider: null, active_model: '' }));
      return;
    }

    setDraftConfig((current) => {
      const providerConfig = current.providers[providerId];
      if (!providerConfig) {
        return current;
      }

      const providerDefinition = getProviderDefinition(providerId, providerConfig);
      const nextModel =
        (current.active_provider === providerId && current.active_model) ||
        providerConfig.default_model?.trim() ||
        providerDefinition.modelSuggestions[0] ||
        current.active_model ||
        '';

      return {
        ...current,
        active_provider: providerId,
        active_model: nextModel,
      };
    });
  };

  const setActiveModel = (model: string): void => {
    setDraftConfig((current) => applyActiveProviderModel(current, model));
  };

  const addCustomProvider = (input: CustomProviderInput): void => {
    setDraftConfig((current) => {
      const customProviderCount = Object.keys(current.providers).filter((providerId) => isCustomProviderId(providerId)).length;
      if (customProviderCount >= 10) {
        return current;
      }

      const providerId = `custom-${crypto.randomUUID()}`;
      return {
        ...current,
        providers: {
          ...current.providers,
          [providerId]: {
            api_key: input.api_key,
            enabled: input.enabled,
            base_url: input.base_url,
            label: input.label,
            default_model: input.default_model,
            models: input.default_model ? [input.default_model] : [],
            api_style: input.api_style,
          },
        },
      };
    });
  };

  const removeCustomProvider = (providerId: string): void => {
    if (!isCustomProviderId(providerId)) {
      return;
    }

    setDraftConfig((current) => {
      if (!current.providers[providerId]) {
        return current;
      }

      return {
        ...current,
        active_provider: current.active_provider === providerId ? null : current.active_provider,
        active_model: current.active_provider === providerId ? '' : current.active_model,
        providers: omitRecordKey(current.providers, providerId),
      };
    });

    setProviderStatuses((current) => {
      return omitRecordKey(current, providerId);
    });
    setShowSecrets((current) => {
      return omitRecordKey(current, providerId);
    });
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
    await onSaveAiConfig(draftConfig);
    await onSaveRoutingSettings(draftRoutingSettings);
    await onSaveWorkbenchState(draftWorkbench);
    setSaveStatus(getConfigSaveStatusMessage(locale, AI_CONFIG_STORAGE_KEY));
  };

  const handleTestProvider = async (providerId: string): Promise<void> => {
    const providerConfig = draftConfig.providers[providerId];
    if (!providerConfig) {
      return;
    }
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

  const handleSaveAgentProfile = (profile: AgentProfile): void => {
    void window.desktopApi.saveAgentProfile({ profile });
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
    addCustomProvider,
    removeCustomProvider,
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
    handleSaveAgentProfile,
  };
}
