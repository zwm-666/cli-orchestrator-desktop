import { useState } from 'react';
import type { Locale, ReadWorkspaceFileResult, SkillDefinition, TaskThreadMessage, WorkbenchState } from '../../../shared/domain.js';
import type { AiConfig, AiProviderDefinition } from '../aiConfig.js';
import { isProviderReady } from '../aiConfig.js';
import { localizeProviderRuntimeMessage } from '../providerRuntimeLocalization.js';
import { sendProviderChat } from '../providerApi.js';
import {
  appendActivityToThread,
  appendMessagesToThread,
  applyTaskUpdates,
  createProviderActivitySummary,
  extractTaskUpdates,
  stripTaskUpdateBlock,
} from '../workbench.js';
import { FILE_CONTEXT_LIMIT, toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchProviderFlowInput {
  locale: Locale;
  workbench: WorkbenchState;
  persistWorkbench: (nextWorkbench: WorkbenchState) => Promise<void>;
  activeThreadId: string | null;
  threadMessages: TaskThreadMessage[];
  selectedProviderId: string;
  selectedProviderDefinition: AiProviderDefinition | null;
  selectedProviderConfig: AiConfig['providers'][keyof AiConfig['providers']] | null;
  targetModel: string;
  targetPrompt: string;
  boundSkills: SkillDefinition[];
  selectedFile: ReadWorkspaceFileResult | null;
}

interface UseWorkbenchProviderFlowResult {
  chatError: string | null;
  isSending: boolean;
  handleProviderSend: () => Promise<void>;
}

export function useWorkbenchProviderFlow(input: UseWorkbenchProviderFlowInput): UseWorkbenchProviderFlowResult {
  const {
    locale,
    workbench,
    persistWorkbench,
    activeThreadId,
    threadMessages,
    selectedProviderId,
    selectedProviderDefinition,
    selectedProviderConfig,
    targetModel,
    targetPrompt,
    boundSkills,
    selectedFile,
  } = input;
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleProviderSend = async (): Promise<void> => {
    if (!selectedProviderId || !selectedProviderConfig || !selectedProviderDefinition || !activeThreadId) {
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

    const createdAt = new Date().toISOString();
    const userMessage: TaskThreadMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedPrompt,
      providerId: null,
      adapterId: null,
      createdAt,
    };

    const nextWorkbenchWithUserMessage = appendMessagesToThread({
      locale,
      workbench,
      threadId: activeThreadId,
      messages: [userMessage],
    });

    setIsSending(true);
    setChatError(null);

    try {
      await persistWorkbench(nextWorkbenchWithUserMessage);

      const skillPrompt = boundSkills.map((skill) => skill.promptTemplate.trim()).filter((entry) => entry.length > 0).join('\n\n');
      const selectedFileContext = selectedFile ? `\n\nSelected file: ${selectedFile.relativePath}\n${selectedFile.content.slice(0, FILE_CONTEXT_LIMIT)}` : '';
      const historyMessages = threadMessages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role, content: message.content }));

      const response = await sendProviderChat(selectedProviderDefinition.id, selectedProviderConfig, targetModel, [
        {
          role: 'system',
          content:
            locale === 'zh'
              ? `你正在一个统一工作台中协作，请沿用共享任务清单继续推进，不要从头开始。${skillPrompt ? `\n\n已绑定技能：\n${skillPrompt}` : ''}`
              : `You are collaborating inside a unified workbench. Continue from the shared checklist instead of restarting analysis.${skillPrompt ? `\n\nSkills:\n${skillPrompt}` : ''}`,
        },
        ...historyMessages,
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
      const assistantMessage: TaskThreadMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanedResponse || response,
        providerId: selectedProviderDefinition.id,
        adapterId: null,
        createdAt: providerActivity.recordedAt,
      };

      let nextWorkbench = appendMessagesToThread({
        locale,
        workbench: nextWorkbenchWithUserMessage,
        threadId: activeThreadId,
        messages: [assistantMessage],
      });
      nextWorkbench = appendActivityToThread(nextWorkbench, activeThreadId, providerActivity);
      nextWorkbench = {
        ...nextWorkbench,
        latestProviderActivity: providerActivity,
      };

      if (updates) {
        nextWorkbench = {
          ...nextWorkbench,
          tasks: applyTaskUpdates(nextWorkbench.tasks, updates, 'assistant'),
        };
      }

      await persistWorkbench(nextWorkbench);
    } catch (error: unknown) {
      const fallbackMessage = locale === 'zh' ? '模型服务请求失败。' : 'The provider request failed.';
      setChatError(localizeProviderRuntimeMessage(toErrorMessage(error, fallbackMessage), locale));
    } finally {
      setIsSending(false);
    }
  };

  return {
    chatError,
    isSending,
    handleProviderSend,
  };
}
