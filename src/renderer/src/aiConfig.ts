export type BuiltinAiProviderId =
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'gemini'
  | 'deepseek'
  | 'sambanova'
  | 'cerebras'
  | 'huggingface';

export type AiProviderId = BuiltinAiProviderId | 'custom' | `custom-${string}`;

export type ProviderApiStyle = 'openai' | 'anthropic' | 'gemini';

export interface AiProviderConfig {
  api_key: string;
  enabled: boolean;
  base_url: string;
  label?: string | undefined;
  default_model?: string | undefined;
  models?: string[] | undefined;
  api_style?: ProviderApiStyle | undefined;
}

export interface AiProviderDefinition {
  id: string;
  label: string;
  description: string;
  apiStyle: ProviderApiStyle;
  defaultBaseUrl: string;
  modelSuggestions: readonly string[];
}

export interface AiConfig {
  active_provider: string | null;
  active_model: string;
  providers: Record<string, AiProviderConfig>;
}

export const AI_CONFIG_STORAGE_KEY = 'ai_config';

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude via the Anthropic Messages API.',
    apiStyle: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    modelSuggestions: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models through the OpenAI chat completions API.',
    apiStyle: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelSuggestions: ['gpt-5.4', 'gpt-5.1', 'gpt-4.1'],
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Fast hosted inference with an OpenAI-compatible API.',
    apiStyle: 'openai',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    modelSuggestions: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini generateContent models.',
    apiStyle: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelSuggestions: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek hosted chat via OpenAI-compatible endpoints.',
    apiStyle: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    modelSuggestions: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'sambanova',
    label: 'SambaNova',
    description: 'SambaNova Cloud with OpenAI-compatible chat completions.',
    apiStyle: 'openai',
    defaultBaseUrl: 'https://api.sambanova.ai/v1',
    modelSuggestions: ['Meta-Llama-3.1-70B-Instruct', 'Qwen2.5-72B-Instruct'],
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    description: 'Cerebras inference with OpenAI-compatible chat endpoints.',
    apiStyle: 'openai',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    modelSuggestions: ['llama3.1-70b', 'qwen-3-32b'],
  },
  {
    id: 'huggingface',
    label: 'HuggingFace',
    description: 'Hosted routing through Hugging Face OpenAI-compatible endpoints.',
    apiStyle: 'openai',
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    modelSuggestions: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-Coder-32B-Instruct'],
  },
] as const;

const EMPTY_PROVIDER_CONFIG: AiProviderConfig = {
  api_key: '',
  enabled: false,
  base_url: '',
  default_model: '',
  api_style: 'openai',
};

const BUILTIN_PROVIDER_IDS = AI_PROVIDERS.map((provider) => provider.id as BuiltinAiProviderId);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const normalizeString = (value: unknown, fallback: string): string => {
  return typeof value === 'string' ? value : fallback;
};

const normalizeOptionalString = (value: unknown, fallback?: string): string | undefined => {
  return typeof value === 'string' ? value : fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  return typeof value === 'boolean' ? value : fallback;
};

export const normalizeProviderModelList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueModels = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }

    const normalizedEntry = entry.trim();
    if (normalizedEntry.length > 0) {
      uniqueModels.add(normalizedEntry);
    }
  });

  return [...uniqueModels];
};

export const mergeProviderModelLists = (...lists: (string[] | undefined)[]): string[] => {
  const merged = new Set<string>();

  lists.forEach((list) => {
    (list ?? []).forEach((entry) => {
      const normalizedEntry = entry.trim();
      if (normalizedEntry.length > 0) {
        merged.add(normalizedEntry);
      }
    });
  });

  return [...merged];
};

const normalizeProviderApiStyle = (value: unknown, fallback: ProviderApiStyle): ProviderApiStyle => {
  return value === 'anthropic' || value === 'gemini' || value === 'openai' ? value : fallback;
};

export const isBuiltinAiProviderId = (value: string): value is BuiltinAiProviderId => {
  return BUILTIN_PROVIDER_IDS.includes(value as BuiltinAiProviderId);
};

export const isCustomProviderId = (value: string): value is AiProviderId => {
  return value === 'custom' || value.startsWith('custom-');
};

export const isAiProviderId = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

export function getProviderDefinition(providerId: string, config?: AiProviderConfig): AiProviderDefinition {
  const provider = AI_PROVIDERS.find((entry) => entry.id === providerId);
  const configuredModels = mergeProviderModelLists(config?.models, config?.default_model ? [config.default_model] : []);

  if (provider) {
    return {
      ...provider,
      modelSuggestions: mergeProviderModelLists([...provider.modelSuggestions], configuredModels),
    };
  }

  return {
    id: providerId,
    label: config?.label?.trim() || providerId,
    description: 'Bring your own compatible base URL and credential.',
    apiStyle: config?.api_style ?? 'openai',
    defaultBaseUrl: config?.base_url ?? '',
    modelSuggestions: configuredModels,
  };
}

export function createProviderConfig(providerId: BuiltinAiProviderId): AiProviderConfig {
  const definition = getProviderDefinition(providerId);

  return {
    ...EMPTY_PROVIDER_CONFIG,
    base_url: definition.defaultBaseUrl,
    default_model: definition.modelSuggestions[0] ?? '',
    models: [...definition.modelSuggestions],
    api_style: definition.apiStyle,
  };
}

export function createDefaultAiConfig(): AiConfig {
  return {
    active_provider: null,
    active_model: '',
    providers: Object.fromEntries(BUILTIN_PROVIDER_IDS.map((providerId) => [providerId, createProviderConfig(providerId)])),
  };
}

function normalizeProviderConfig(value: unknown, fallback: AiProviderConfig): AiProviderConfig {
  if (!isRecord(value)) {
    return fallback;
  }

  const apiKey = normalizeString(value.api_key, normalizeString(value.apiKey, fallback.api_key));
  const baseUrl = normalizeString(value.base_url, normalizeString(value.baseUrl, fallback.base_url));
  const enabledFallback = fallback.enabled || (apiKey.trim().length > 0 && baseUrl.trim().length > 0);
  const models = mergeProviderModelLists(
    fallback.models,
    normalizeProviderModelList(value.models),
    normalizeProviderModelList(value.saved_models),
    normalizeProviderModelList(value.modelSuggestions),
  );
  const defaultModel = normalizeString(value.default_model, normalizeString(value.defaultModel, normalizeString(value.model, fallback.default_model ?? ''))).trim();
  const resolvedModels = mergeProviderModelLists(models, defaultModel ? [defaultModel] : []);

  return {
    api_key: apiKey,
    enabled: normalizeBoolean(value.enabled, enabledFallback),
    base_url: baseUrl,
    label: normalizeOptionalString(value.label, fallback.label),
    default_model: defaultModel || resolvedModels[0] || fallback.default_model,
    models: resolvedModels,
    api_style: normalizeProviderApiStyle(value.api_style, normalizeProviderApiStyle(value.apiStyle, fallback.api_style ?? 'openai')),
  };
}

function migrateLegacyActiveProvider(value: Record<string, unknown>): string | null {
  if (isAiProviderId(value.active_provider)) {
    return value.active_provider.trim();
  }

  if (isAiProviderId(value.activeProviderId)) {
    return value.activeProviderId.trim();
  }

  return null;
}

function migrateLegacyActiveModel(value: Record<string, unknown>, activeProvider: string | null): string {
  if (typeof value.active_model === 'string') {
    return value.active_model;
  }

  if (typeof value.activeModel === 'string') {
    return value.activeModel;
  }

  if (!activeProvider) {
    return '';
  }

  const providers = isRecord(value.providers) ? value.providers : {};
  const activeProviderValue = providers[activeProvider];
  if (isRecord(activeProviderValue)) {
    return normalizeString(activeProviderValue.default_model, normalizeString(activeProviderValue.model, ''));
  }

  return '';
}

export function normalizeAiConfig(value: unknown): AiConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const defaults = createDefaultAiConfig();
  const providers = isRecord(value.providers) ? value.providers : {};
  const activeProvider = migrateLegacyActiveProvider(value);
  const activeModel = migrateLegacyActiveModel(value, activeProvider);
  const normalizedProviders: Record<string, AiProviderConfig> = {};

  for (const providerId of BUILTIN_PROVIDER_IDS) {
    const aliasValue = providerId === 'gemini' ? providers.gemini ?? providers.google : providers[providerId];
    normalizedProviders[providerId] = normalizeProviderConfig(aliasValue, defaults.providers[providerId] ?? createProviderConfig(providerId));
  }

  for (const [providerId, providerValue] of Object.entries(providers)) {
    if (isBuiltinAiProviderId(providerId) || providerId === 'google') {
      continue;
    }

    normalizedProviders[providerId] = normalizeProviderConfig(providerValue, {
      ...EMPTY_PROVIDER_CONFIG,
      enabled: true,
      label: providerId === 'custom' ? 'Custom' : providerId,
      default_model: '',
      api_style: 'openai',
    });
  }

  const resolvedActiveModel =
    activeModel || (activeProvider ? normalizedProviders[activeProvider]?.default_model?.trim() ?? '' : '');

  return {
    active_provider: activeProvider,
    active_model: resolvedActiveModel,
    providers: normalizedProviders,
  };
}

function loadAiConfigFromLocalStorage(): AiConfig | null {
  if (typeof window === 'undefined') {
    return createDefaultAiConfig();
  }

  const storedValue = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY);
  if (!storedValue) {
    return null;
  }

  try {
    return normalizeAiConfig(JSON.parse(storedValue));
  } catch {
    return null;
  }
}

export function loadAiConfig(): AiConfig {
  return loadAiConfigFromLocalStorage() ?? createDefaultAiConfig();
}

export async function loadAiConfigFromPersistence(): Promise<AiConfig> {
  if (typeof window === 'undefined') {
    return createDefaultAiConfig();
  }

  try {
    const fileValue = await window.desktopApi.loadAiConfig();
    const normalized = normalizeAiConfig(fileValue);
    if (normalized) {
      window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }
  } catch {
    // fall through to localStorage fallback
  }

  const localConfig = loadAiConfigFromLocalStorage();
  if (localConfig) {
    return localConfig;
  }

  return createDefaultAiConfig();
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeAiConfig(config) ?? createDefaultAiConfig();
  window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  await window.desktopApi.saveAiConfig({ config: normalized as unknown as Record<string, unknown> });
}

export function getActiveProviderDetails(
  config: AiConfig,
): { definition: AiProviderDefinition; config: AiProviderConfig; model: string } | null {
  if (!config.active_provider) {
    return null;
  }

  const providerConfig = config.providers[config.active_provider];
  if (!providerConfig) {
    return null;
  }

  return {
    definition: getProviderDefinition(config.active_provider, providerConfig),
    config: providerConfig,
    model: config.active_model,
  };
}

export function isProviderReady(providerConfig: AiProviderConfig, model: string): boolean {
  return (
    providerConfig.enabled &&
    providerConfig.api_key.trim().length > 0 &&
    providerConfig.base_url.trim().length > 0 &&
    model.trim().length > 0
  );
}
