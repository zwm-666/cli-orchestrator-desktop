export type AiProviderId =
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'gemini'
  | 'deepseek'
  | 'sambanova'
  | 'cerebras'
  | 'huggingface'
  | 'custom';

export type ProviderApiStyle = 'openai' | 'anthropic' | 'gemini';

export interface AiProviderConfig {
  api_key: string;
  enabled: boolean;
  base_url: string;
}

export interface AiProviderDefinition {
  id: AiProviderId;
  label: string;
  description: string;
  apiStyle: ProviderApiStyle;
  defaultBaseUrl: string;
  modelSuggestions: readonly string[];
 }

export interface AiConfig {
  active_provider: AiProviderId | null;
  active_model: string;
  providers: Record<AiProviderId, AiProviderConfig>;
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
  {
    id: 'custom',
    label: 'Custom',
    description: 'Bring your own OpenAI-compatible base URL and credential.',
    apiStyle: 'openai',
    defaultBaseUrl: '',
    modelSuggestions: [''],
  },
] as const;

const EMPTY_PROVIDER_CONFIG: AiProviderConfig = {
  api_key: '',
  enabled: false,
  base_url: '',
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const normalizeString = (value: unknown, fallback: string): string => {
  return typeof value === 'string' ? value : fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  return typeof value === 'boolean' ? value : fallback;
};

export const isAiProviderId = (value: unknown): value is AiProviderId => {
  return AI_PROVIDERS.some((provider) => provider.id === value);
};

export function getProviderDefinition(providerId: AiProviderId): AiProviderDefinition {
  const provider = AI_PROVIDERS.find((entry) => entry.id === providerId);

  if (!provider) {
    throw new Error(`Unknown AI provider: ${providerId}`);
  }

  return provider;
}

export function createProviderConfig(providerId: AiProviderId): AiProviderConfig {
  const definition = getProviderDefinition(providerId);

  return {
    ...EMPTY_PROVIDER_CONFIG,
    base_url: definition.defaultBaseUrl,
  };
}

export function createDefaultAiConfig(): AiConfig {
  return {
    active_provider: null,
    active_model: '',
    providers: {
      anthropic: createProviderConfig('anthropic'),
      openai: createProviderConfig('openai'),
      groq: createProviderConfig('groq'),
      gemini: createProviderConfig('gemini'),
      deepseek: createProviderConfig('deepseek'),
      sambanova: createProviderConfig('sambanova'),
      cerebras: createProviderConfig('cerebras'),
      huggingface: createProviderConfig('huggingface'),
      custom: createProviderConfig('custom'),
    },
  };
}

function normalizeProviderConfig(value: unknown, fallback: AiProviderConfig): AiProviderConfig {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    api_key: normalizeString(value.api_key, normalizeString(value.apiKey, fallback.api_key)),
    enabled: normalizeBoolean(value.enabled, fallback.enabled),
    base_url: normalizeString(value.base_url, normalizeString(value.baseUrl, fallback.base_url)),
  };
}

function migrateLegacyActiveProvider(value: Record<string, unknown>): AiProviderId | null {
  if (isAiProviderId(value.active_provider)) {
    return value.active_provider;
  }

  if (isAiProviderId(value.activeProviderId)) {
    return value.activeProviderId;
  }

  return null;
}

function migrateLegacyActiveModel(value: Record<string, unknown>, activeProvider: AiProviderId | null): string {
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
    return normalizeString(activeProviderValue.model, '');
  }

  return '';
}

export function loadAiConfig(): AiConfig {
  if (typeof window === 'undefined') {
    return createDefaultAiConfig();
  }

  const storedValue = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY);
  const defaults = createDefaultAiConfig();

  if (!storedValue) {
    return defaults;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (!isRecord(parsedValue)) {
      return defaults;
    }

    const providers = isRecord(parsedValue.providers) ? parsedValue.providers : {};
    const activeProvider = migrateLegacyActiveProvider(parsedValue);
    const activeModel = migrateLegacyActiveModel(parsedValue, activeProvider);

    return {
      active_provider: activeProvider,
      active_model: activeModel,
      providers: {
        anthropic: normalizeProviderConfig(providers.anthropic, defaults.providers.anthropic),
        openai: normalizeProviderConfig(providers.openai, defaults.providers.openai),
        groq: normalizeProviderConfig(providers.groq, defaults.providers.groq),
        gemini: normalizeProviderConfig(providers.gemini ?? providers.google, defaults.providers.gemini),
        deepseek: normalizeProviderConfig(providers.deepseek, defaults.providers.deepseek),
        sambanova: normalizeProviderConfig(providers.sambanova, defaults.providers.sambanova),
        cerebras: normalizeProviderConfig(providers.cerebras, defaults.providers.cerebras),
        huggingface: normalizeProviderConfig(providers.huggingface, defaults.providers.huggingface),
        custom: normalizeProviderConfig(providers.custom, defaults.providers.custom),
      },
    };
  } catch {
    return defaults;
  }
}

export function saveAiConfig(config: AiConfig): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function getActiveProviderDetails(
  config: AiConfig,
): { definition: AiProviderDefinition; config: AiProviderConfig; model: string } | null {
  if (!config.active_provider) {
    return null;
  }

  return {
    definition: getProviderDefinition(config.active_provider),
    config: config.providers[config.active_provider],
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
