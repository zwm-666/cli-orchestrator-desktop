import { describe, expect, it } from 'vitest';
import { getProviderModelOptions, normalizeAiConfig } from './aiConfig.js';

describe('AI config normalization', () => {
  it('keeps default and fetched provider models separate from saved models', () => {
    const normalized = normalizeAiConfig({
      active_provider: 'openai',
      active_model: 'gpt-5.4p',
      providers: {
        openai: {
          api_key: 'secret',
          enabled: true,
          base_url: 'https://api.openai.com/v1',
          default_model: 'gpt-5.4p',
          models: ['gpt-5.4'],
          fetched_models: ['gpt-4.1', 'gpt-5.1'],
          api_style: 'openai',
        },
      },
    });

    const openaiConfig = normalized?.providers.openai;

    expect(openaiConfig?.default_model).toBe('gpt-5.4p');
    expect(openaiConfig?.models).toEqual(['gpt-5.4']);
    expect(openaiConfig?.fetched_models).toEqual(['gpt-4.1', 'gpt-5.1']);
    expect(openaiConfig ? getProviderModelOptions('openai', openaiConfig).slice(0, 4) : []).toEqual([
      'gpt-5.4p',
      'gpt-5.4',
      'gpt-4.1',
      'gpt-5.1',
    ]);
  });
});
