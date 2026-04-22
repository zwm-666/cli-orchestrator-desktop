import { useEffect, useState } from 'react';
import type { Locale } from '../../../shared/domain.js';
import type { InlineStatus } from '../configPageShared.js';
import { type PromptBuilderConfig, type PromptBuilderTemplateKey } from '../../../shared/promptBuilder.js';
import { usePromptBuilderConfigLoader } from './usePromptBuilderConfigLoader.js';
import { PROMPT_BUILDER_COPY } from '../promptBuilderCopy.js';

interface UsePromptBuilderConfigControllerResult {
  draftConfig: PromptBuilderConfig;
  isLoading: boolean;
  loadError: string | null;
  saveStatus: InlineStatus | null;
  updateTemplate: (key: PromptBuilderTemplateKey, value: string) => void;
  handleSave: () => Promise<void>;
}

export function usePromptBuilderConfigController(
  locale: Locale,
  onSavePromptBuilderConfig?: (config: PromptBuilderConfig) => void,
): UsePromptBuilderConfigControllerResult {
  const copy = PROMPT_BUILDER_COPY[locale];
  const { config, isLoading, loadError, setConfig } = usePromptBuilderConfigLoader();
  const [draftConfig, setDraftConfig] = useState(config);
  const [saveStatus, setSaveStatus] = useState<InlineStatus | null>(null);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  const updateTemplate = (key: PromptBuilderTemplateKey, value: string): void => {
    setDraftConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSave = async (): Promise<void> => {
    setSaveStatus({ tone: 'loading', message: copy.configSaving });

    try {
      const saved = await window.desktopApi.savePromptBuilderConfig({ config: draftConfig });
      setConfig(saved);
      setDraftConfig(saved);
      onSavePromptBuilderConfig?.(saved);
      setSaveStatus({ tone: 'success', message: copy.configSaved });
    } catch (error: unknown) {
      setSaveStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : copy.configSaveFailed,
      });
    }
  };

  return {
    draftConfig,
    isLoading,
    loadError,
    saveStatus,
    updateTemplate,
    handleSave,
  };
}
