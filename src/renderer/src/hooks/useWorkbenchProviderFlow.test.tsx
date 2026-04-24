import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskThread, WorkbenchState } from '../../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import type { AiProviderConfig, AiProviderDefinition } from '../aiConfig.js';
import { sendProviderChat } from '../providerApi.js';
import { useWorkbenchProviderFlow } from './useWorkbenchProviderFlow.js';

vi.mock('../providerApi.js', () => ({
  sendProviderChat: vi.fn(),
}));

const providerDefinition: AiProviderDefinition = {
  id: 'openai',
  label: 'OpenAI',
  description: 'OpenAI-compatible provider',
  apiStyle: 'openai',
  defaultBaseUrl: 'https://api.openai.com/v1',
  modelSuggestions: ['gpt-5.4'],
};

const providerConfig: AiProviderConfig = {
  api_key: 'secret',
  enabled: true,
  base_url: 'https://api.openai.com/v1',
  default_model: 'gpt-5.4',
  models: ['gpt-5.4'],
  api_style: 'openai',
};

const createThread = (): TaskThread => ({
  id: 'thread-1',
  title: 'Chat',
  messages: [],
  activityLog: [],
  createdAt: '2026-04-24T10:00:00.000Z',
  updatedAt: '2026-04-24T10:00:00.000Z',
});

const createWorkbench = (): WorkbenchState => {
  const thread = createThread();
  return {
    ...DEFAULT_WORKBENCH_STATE,
    activeThreadId: thread.id,
    threads: [thread],
  };
};

describe('useWorkbenchProviderFlow', () => {
  beforeEach(() => {
    vi.mocked(sendProviderChat).mockReset();
  });

  it('injects continuity as system context and displays only user input', async () => {
    let workbench = createWorkbench();
    const setUserInput = vi.fn();
    vi.mocked(sendProviderChat).mockResolvedValue('assistant reply');

    const { result } = renderHook(() => useWorkbenchProviderFlow({
      locale: 'en',
      activeThreadId: 'thread-1',
      selectedProviderId: 'openai',
      selectedProviderDefinition: providerDefinition,
      selectedProviderConfig: providerConfig,
      targetModel: 'gpt-5.4',
      userInput: 'hello provider',
      continuityPrompt: 'continuity context',
      setUserInput,
      boundSkills: [],
      selectedFile: null,
      selectedAgentLabel: null,
      selectedAgentPrompt: null,
      getLatestWorkbench: () => workbench,
      queueWorkbenchPersist: (updater) => {
        workbench = updater(workbench);
        return Promise.resolve(workbench);
      },
    }));

    await act(async () => {
      await result.current.handleProviderSend();
    });

    expect(sendProviderChat).toHaveBeenCalledWith('openai', providerConfig, 'gpt-5.4', [
      { role: 'system', content: 'continuity context' },
      { role: 'user', content: 'hello provider' },
    ]);
    expect(workbench.threads[0]?.messages.map((message) => message.content)).toEqual(['hello provider', 'assistant reply']);
    expect(setUserInput).toHaveBeenCalledWith('');
  });

  it('shows an error instead of silently returning when no provider is selected', async () => {
    let workbench = createWorkbench();
    const { result } = renderHook(() => useWorkbenchProviderFlow({
      locale: 'en',
      activeThreadId: 'thread-1',
      selectedProviderId: '',
      selectedProviderDefinition: null,
      selectedProviderConfig: null,
      targetModel: 'gpt-5.4',
      userInput: 'hello provider',
      continuityPrompt: 'continuity context',
      setUserInput: vi.fn(),
      boundSkills: [],
      selectedFile: null,
      selectedAgentLabel: null,
      selectedAgentPrompt: null,
      getLatestWorkbench: () => workbench,
      queueWorkbenchPersist: (updater) => {
        workbench = updater(workbench);
        return Promise.resolve(workbench);
      },
    }));

    await act(async () => {
      await result.current.handleProviderSend();
    });

    await waitFor(() => {
      expect(result.current.chatError).toBe('Please select a provider first.');
    });
    expect(sendProviderChat).not.toHaveBeenCalled();
  });
});
