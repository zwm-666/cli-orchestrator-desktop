import { useEffect, useState } from 'react';
import { DEFAULT_PROMPT_BUILDER_CONFIG, type PromptBuilderConfig } from '../../../shared/promptBuilder.js';

interface UsePromptBuilderConfigLoaderResult {
  config: PromptBuilderConfig;
  isLoading: boolean;
  loadError: string | null;
  reloadConfig: () => Promise<PromptBuilderConfig>;
  setConfig: (config: PromptBuilderConfig) => void;
}

export function usePromptBuilderConfigLoader(): UsePromptBuilderConfigLoaderResult {
  const [config, setConfig] = useState<PromptBuilderConfig>(DEFAULT_PROMPT_BUILDER_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadConfig = async (): Promise<PromptBuilderConfig> => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextConfig = await window.desktopApi.getPromptBuilderConfig();
      setConfig(nextConfig);
      return nextConfig;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to load prompt builder config.';
      setLoadError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    void window.desktopApi.getPromptBuilderConfig()
      .then((nextConfig) => {
        if (!isActive) {
          return;
        }

        setConfig(nextConfig);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'Unable to load prompt builder config.');
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  return {
    config,
    isLoading,
    loadError,
    reloadConfig,
    setConfig,
  };
}
