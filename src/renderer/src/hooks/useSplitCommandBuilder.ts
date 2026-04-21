import { useMemo, useState } from 'react';
import type { Locale } from '../../../shared/domain.js';
import { buildPromptBuilderCommand } from '../services/promptBuilderComposer.js';
import { PROMPT_BUILDER_COPY } from '../promptBuilderCopy.js';
import { usePromptBuilderConfigLoader } from './usePromptBuilderConfigLoader.js';

interface UseSplitCommandBuilderInput {
  locale: Locale;
  onApplyToPrompt: (command: string) => void;
}

interface UseSplitCommandBuilderResult {
  task: string;
  materials: string;
  boundaries: string;
  generatedCommand: string;
  isLoading: boolean;
  loadError: string | null;
  copyStatus: string | null;
  setTask: (value: string) => void;
  setMaterials: (value: string) => void;
  setBoundaries: (value: string) => void;
  handleCopy: () => Promise<void>;
  handleApplyToPrompt: () => void;
}

export function useSplitCommandBuilder(input: UseSplitCommandBuilderInput): UseSplitCommandBuilderResult {
  const { locale, onApplyToPrompt } = input;
  const copy = PROMPT_BUILDER_COPY[locale];
  const { config, isLoading, loadError } = usePromptBuilderConfigLoader();
  const [task, setTask] = useState('');
  const [materials, setMaterials] = useState('');
  const [boundaries, setBoundaries] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const generatedCommand = useMemo(() => buildPromptBuilderCommand({ locale, config, task, materials, boundaries }), [boundaries, config, locale, materials, task]);

  const handleCopy = async (): Promise<void> => {
    if (!generatedCommand) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedCommand);
      setCopyStatus(copy.copied);
    } catch {
      setCopyStatus(copy.copyFailed);
    }
  };

  const handleApplyToPrompt = (): void => {
    if (!generatedCommand) {
      return;
    }

    onApplyToPrompt(generatedCommand);
  };

  return {
    task,
    materials,
    boundaries,
    generatedCommand,
    isLoading,
    loadError,
    copyStatus,
    setTask,
    setMaterials,
    setBoundaries,
    handleCopy,
    handleApplyToPrompt,
  };
}
