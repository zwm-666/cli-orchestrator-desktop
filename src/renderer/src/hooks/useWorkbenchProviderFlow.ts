import { useState } from 'react';
import type { Locale, ReadWorkspaceFileResult, SkillDefinition, WorkbenchState } from '../../../shared/domain.js';
import type { AiConfig, AiProviderDefinition } from '../aiConfig.js';
import { isProviderReady } from '../aiConfig.js';
import { localizeProviderRuntimeMessage } from '../providerRuntimeLocalization.js';
import { sendProviderChat } from '../providerApi.js';
import {
  applyTaskUpdates,
  createProviderActivitySummary,
  extractTaskUpdates,
  stripTaskUpdateBlock,
} from '../workbench.js';
import type { ChatMessage } from './workbenchControllerShared.js';
import { FILE_CONTEXT_LIMIT, toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchProviderFlowInput {
  locale: Locale;
  workbench: WorkbenchState;
  persistWorkbench: (nextWorkbench: WorkbenchState) => Promise<void>;
  selectedProviderId: string;
  selectedProviderDefinition: AiProviderDefinition | null;
  selectedProviderConfig: AiConfig['providers'][keyof AiConfig['providers']] | null;
  targetModel: string;
  targetPrompt: string;
  boundSkills: SkillDefinition[];
  selectedFile: ReadWorkspaceFileResult | null;
}

interface UseWorkbenchProviderFlowResult {
  chatMessages: ChatMessage[];
  chatError: string | null;
  isSending: boolean;
  handleProviderSend: () => Promise<void>;
}

export function useWorkbenchProviderFlow(input: UseWorkbenchProviderFlowInput): UseWorkbenchProviderFlowResult {
  const {
    locale,
    workbench,
    persistWorkbench,
    selectedProviderId,
    selectedProviderDefinition,
    selectedProviderConfig,
    targetModel,
    targetPrompt,
    boundSkills,
    selectedFile,
  } = input;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleProviderSend = async (): Promise<void> => {
    if (!selectedProviderId || !selectedProviderConfig || !selectedProviderDefinition) {
      return;
    }

    if (!isProviderReady(selectedProviderConfig, targetModel)) {
      setChatError(locale === 'zh' ? '当前模型服务配置不完整，请先前往配置页补全。' : 'The current provider is not fully configured yet.');
      return;
    }

    const trimmedPrompt = targetPrompt.trim();
    if (!trimmedPrompt) {
      setChatError(locale === 'zh' ? '请先生成或填写连续工作提示词。' : 'Generate or edit the continuity prompt before sending.');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedPrompt,
    };

    setChatMessages((current) => [...current, userMessage]);
    setIsSending(true);
    setChatError(null);

    try {
      const skillPrompt = boundSkills.map((skill) => skill.promptTemplate.trim()).filter((entry) => entry.length > 0).join('\n\n');
      const selectedFileContext = selectedFile ? `\n\nSelected file: ${selectedFile.relativePath}\n${selectedFile.content.slice(0, FILE_CONTEXT_LIMIT)}` : '';

      const response = await sendProviderChat(selectedProviderDefinition.id, selectedProviderConfig, targetModel, [
        {
          role: 'system',
          content:
            locale === 'zh'
              ? `你正在一个统一工作台中协作，请沿用共享任务清单继续推进，不要从头开始。${skillPrompt ? `\n\n已绑定技能：\n${skillPrompt}` : ''}`
              : `You are collaborating inside a unified workbench. Continue from the shared checklist instead of restarting analysis.${skillPrompt ? `\n\nSkills:\n${skillPrompt}` : ''}`,
        },
        ...chatMessages.map((message) => ({ role: message.role, content: message.content })),
        {
          role: 'user',
          content: `${trimmedPrompt}${selectedFileContext}`,
        },
      ]);

      const updates = extractTaskUpdates(response);
      const cleanedResponse = stripTaskUpdateBlock(response);
      const providerActivity = createProviderActivitySummary({
        locale,
        providerId: selectedProviderDefinition.id,
        providerLabel: selectedProviderDefinition.label,
        modelLabel: targetModel,
        responseText: response,
      });

      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: cleanedResponse || response,
        },
      ]);

      if (updates) {
        const nextTasks = applyTaskUpdates(workbench.tasks, updates, 'assistant');
        await persistWorkbench({
          ...workbench,
          tasks: nextTasks,
          latestProviderActivity: providerActivity,
        });
      } else {
        await persistWorkbench({
          ...workbench,
          latestProviderActivity: providerActivity,
        });
      }
    } catch (error: unknown) {
      const fallbackMessage = locale === 'zh' ? '模型服务请求失败。' : 'The provider request failed.';
      setChatError(localizeProviderRuntimeMessage(toErrorMessage(error, fallbackMessage), locale));
    } finally {
      setIsSending(false);
    }
  };

  return {
    chatMessages,
    chatError,
    isSending,
    handleProviderSend,
  };
}
