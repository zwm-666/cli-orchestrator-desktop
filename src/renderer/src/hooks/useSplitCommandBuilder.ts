import { useEffect, useMemo, useState } from 'react';
import type { Locale, PlanDraft } from '../../../shared/domain.js';
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
  analysisDraft: PlanDraft | null;
  setTask: (value: string) => void;
  setMaterials: (value: string) => void;
  setBoundaries: (value: string) => void;
  handleCopy: () => Promise<void>;
  handleApplyToPrompt: () => void;
}

export function useSplitCommandBuilder(input: UseSplitCommandBuilderInput): UseSplitCommandBuilderResult {
  const { locale, onApplyToPrompt } = input;
  const copy = PROMPT_BUILDER_COPY[locale];
  const { config, isLoading: isTemplateLoading, loadError: templateLoadError } = usePromptBuilderConfigLoader();
  const [task, setTask] = useState('');
  const [materials, setMaterials] = useState('');
  const [boundaries, setBoundaries] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [analysisDraft, setAnalysisDraft] = useState<PlanDraft | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedTask = task.trim();
    if (!normalizedTask) {
      setAnalysisDraft(null);
      setAnalysisError(null);
      setIsAnalyzing(false);
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(() => {
      setIsAnalyzing(true);
      setAnalysisError(null);

      void window.desktopApi.createPlanDraft({ rawInput: normalizedTask })
        .then((result) => {
          if (!isActive) {
            return;
          }

          setAnalysisDraft(result.draft);
        })
        .catch((error: unknown) => {
          if (!isActive) {
            return;
          }

          setAnalysisError(error instanceof Error ? error.message : copy.configLoadFailed);
          setAnalysisDraft(null);
        })
        .finally(() => {
          if (isActive) {
            setIsAnalyzing(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [copy.configLoadFailed, task]);

  const generatedCommand = useMemo(
    () => buildPromptBuilderCommand({ locale, config, task, materials, boundaries, planDraft: analysisDraft }),
    [analysisDraft, boundaries, config, locale, materials, task],
  );

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
    isLoading: isTemplateLoading || isAnalyzing,
    loadError: templateLoadError ?? analysisError,
    copyStatus,
    analysisDraft,
    setTask,
    setMaterials,
    setBoundaries,
    handleCopy,
    handleApplyToPrompt,
  };
}
