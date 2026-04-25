import { describe, expect, it } from 'vitest';
import type { AiConfig } from '../aiConfig.js';
import { applyActiveProviderModel, applyProviderConfigUpdate } from './useConfigPageController.js';

const createConfig = (): AiConfig => ({
  active_provider: 'openai',
  active_model: 'gpt-5.4',
  providers: {
    openai: {
      api_key: 'secret',
      enabled: true,
      base_url: 'https://api.openai.com/v1',
      default_model: 'gpt-5.4',
      models: ['gpt-5.4'],
      api_style: 'openai',
    },
  },
});

describe('provider model config updates', () => {
  it('does not persist transient active model edits into the saved model list', () => {
    const current = createConfig();
    const next = applyActiveProviderModel(current, 'gpt-5.4g');

    expect(next.active_model).toBe('gpt-5.4g');
    expect(next.providers.openai?.default_model).toBe('gpt-5.4g');
    expect(next.providers.openai?.models).toEqual(['gpt-5.4']);
  });

  it('does not persist transient provider default model edits into the saved model list', () => {
    const current = { ...createConfig(), active_provider: null, active_model: '' };
    const next = applyProviderConfigUpdate(current, 'openai', { default_model: 'gpt-5.4p' });

    expect(next.providers.openai?.default_model).toBe('gpt-5.4p');
    expect(next.providers.openai?.models).toEqual(['gpt-5.4']);
  });

  it('keeps explicit saved model edits normalized and deduplicated', () => {
    const current = createConfig();
    const next = applyProviderConfigUpdate(current, 'openai', { models: [' gpt-5.4 ', 'gpt-4.1', 'gpt-5.4', ''] });

    expect(next.providers.openai?.models).toEqual(['gpt-5.4', 'gpt-4.1']);
  });

  it('keeps fetched provider models separate from saved models', () => {
    const current = createConfig();
    const next = applyProviderConfigUpdate(current, 'openai', { fetched_models: [' gpt-4.1 ', 'gpt-5.4', 'gpt-4.1'] });

    expect(next.providers.openai?.models).toEqual(['gpt-5.4']);
    expect(next.providers.openai?.fetched_models).toEqual(['gpt-4.1', 'gpt-5.4']);
  });
});
