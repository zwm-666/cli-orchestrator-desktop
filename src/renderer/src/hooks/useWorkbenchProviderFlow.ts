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
  getTaskThreadById,
  stripTaskUpdateBlock,
} from '../workbench.js';
import { FILE_CONTEXT_LIMIT, toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchProviderFlowInput {
  locale: Locale;
  activeThreadId: string | null;
  selectedProviderId: string;
  selectedProviderDefinition: AiProviderDefinition | null;
  selectedProviderConfig: AiConfig['providers'][keyof AiConfig['providers']] | null;
  targetModel: string;
  targetPrompt: string;
  boundSkills: SkillDefinition[];
  selectedFile: ReadWorkspaceFileResult | null;
  selectedAgentLabel?: string | null;
  selectedAgentPrompt?: string | null;
  getLatestWorkbench: () => WorkbenchState;
  queueWorkbenchPersist: (updater: (currentWorkbench: WorkbenchState) => WorkbenchState) => Promise<WorkbenchState>;
}

interface UseWorkbenchProviderFlowResult {
  chatError: string | null;
  isSending: boolean;
  handleProviderSend: (promptOverride?: string) => Promise<void>;
}

export function useWorkbenchProviderFlow(input: UseWorkbenchProviderFlowInput): UseWorkbenchProviderFlowResult {
  const {
    locale,
    activeThreadId,
    selectedProviderId,
    selectedProviderDefinition,
    selectedProviderConfig,
    targetModel,
    targetPrompt,
    boundSkills,
    selectedFile,
    selectedAgentLabel,
    selectedAgentPrompt,
    getLatestWorkbench,
    queueWorkbenchPersist,
  } = input;
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleProviderSend = async (promptOverride?: string): Promise<void> => {
    if (!selectedProviderId || !selectedProviderConfig || !selectedProviderDefinition || !activeThreadId) {
      return;
    }

    if (!isProviderReady(selectedProviderConfig, targetModel)) {
      setChatError(locale === 'zh' ? '当前模型服务配置不完整，请先前往配置页补全。' : 'The current provider is not fully configured yet.');
      return;
    }

    const trimmedPrompt = (promptOverride ?? targetPrompt).trim();
    if (!trimmedPrompt) {
      setChatError(locale === 'zh' ? '请先生成或填写连续工作提示词。' : 'Generate or edit the continuity prompt before sending.');
      return;
    }

    const createdAt = new Date().toISOString();
    const userMessage: TaskThreadMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedPrompt,
      providerId: selectedProviderDefinition.id,
      adapterId: null,
      sourceKind: 'provider',
      sourceLabel: selectedProviderDefinition.label,
      modelLabel: targetModel || null,
      agentLabel: selectedAgentLabel ?? null,
      orchestrationRunId: null,
      createdAt,
    };

    setIsSending(true);
    setChatError(null);

    try {
      await queueWorkbenchPersist((currentWorkbench) => {
        return appendMessagesToThread({
          locale,
          workbench: currentWorkbench,
          threadId: activeThreadId,
          messages: [userMessage],
        });
      });

      const skillPrompt = boundSkills.map((skill) => skill.promptTemplate.trim()).filter((entry) => entry.length > 0).join('\n\n');
      const selectedFileContext = selectedFile ? `\n\nSelected file: ${selectedFile.relativePath}\n${selectedFile.content.slice(0, FILE_CONTEXT_LIMIT)}` : '';
      const latestThread = getTaskThreadById(getLatestWorkbench(), activeThreadId);
      const historyMessages = (latestThread?.messages ?? [])
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role, content: message.content }));

      const response = await sendProviderChat(selectedProviderDefinition.id, selectedProviderConfig, targetModel, [
        {
          role: 'system',
          content:
            locale === 'zh'
              ? `你正在一个统一工作台中协作，请沿用共享任务清单继续推进，不要从头开始。${selectedAgentPrompt ? `\n\n当前以 Agent 角色协作：${selectedAgentLabel ?? 'Agent'}\n${selectedAgentPrompt}` : ''}${skillPrompt ? `\n\n已绑定技能：\n${skillPrompt}` : ''}`
              : `You are collaborating inside a unified workbench. Continue from the shared checklist instead of restarting analysis.${selectedAgentPrompt ? `\n\nCurrent agent persona: ${selectedAgentLabel ?? 'Agent'}\n${selectedAgentPrompt}` : ''}${skillPrompt ? `\n\nSkills:\n${skillPrompt}` : ''}`,
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
        sourceKind: 'provider',
        sourceLabel: selectedProviderDefinition.label,
        modelLabel: targetModel || null,
        agentLabel: selectedAgentLabel ?? null,
        orchestrationRunId: null,
        createdAt: providerActivity.recordedAt,
      };

      await queueWorkbenchPersist((currentWorkbench) => {
        let nextWorkbench = appendMessagesToThread({
          locale,
          workbench: currentWorkbench,
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

        return nextWorkbench;
      });
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
