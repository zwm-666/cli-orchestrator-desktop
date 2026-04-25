import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentProfile, AppState, WorkbenchState } from '../../../shared/domain.js';
import { DEFAULT_LOCAL_TOOL_REGISTRY, DEFAULT_RETRY_POLICY, DEFAULT_WORKBENCH_STATE } from '../../../shared/domain.js';
import { DEFAULT_PROMPT_BUILDER_CONFIG } from '../../../shared/promptBuilder.js';
import type { AiConfig } from '../aiConfig.js';
import { useWorkbenchController } from './useWorkbenchController.js';

const createAiConfig = (): AiConfig => ({
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
    anthropic: {
      api_key: 'secret',
      enabled: true,
      base_url: 'https://api.anthropic.com/v1',
      default_model: 'claude-sonnet-4-5',
      models: ['claude-sonnet-4-5'],
      api_style: 'anthropic',
    },
  },
});

const createAgentProfile = (): AgentProfile => ({
  id: 'profile-anthropic',
  name: 'Anthropic profile',
  role: 'coder',
  targetKind: 'provider',
  targetId: 'anthropic',
  adapterId: '',
  model: 'claude-sonnet-4-5',
  systemPrompt: '',
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  maxParallelChildren: 1,
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: null,
  enabled: true,
});

const createAppState = (workbench: WorkbenchState): AppState => ({
  adapters: [],
  conversations: [],
  tasks: [],
  runs: [],
  subagentStatuses: [],
  localToolRegistry: DEFAULT_LOCAL_TOOL_REGISTRY,
  localToolCallLogs: [],
  projectContext: { summary: '', updatedAt: null },
  nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
  agentProfiles: [createAgentProfile()],
  skills: [],
  mcpServers: [],
  orchestrationRuns: [],
  orchestrationNodes: [],
  workbench,
});

describe('useWorkbenchController', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        onRunEvent: () => () => undefined,
      },
    });
  });

  it('restores explicit provider selection after the work page remounts', async () => {
    let savedWorkbench: WorkbenchState = structuredClone(DEFAULT_WORKBENCH_STATE);
    const aiConfig = createAiConfig();

    const renderController = () => renderHook(() => useWorkbenchController({
      locale: 'en',
      aiConfig,
      appState: createAppState(savedWorkbench),
      promptBuilderConfig: DEFAULT_PROMPT_BUILDER_CONFIG,
      onSaveWorkbenchState: (nextWorkbench) => {
        savedWorkbench = nextWorkbench;
      },
    }));

    const firstRender = renderController();

    await waitFor(() => {
      expect(firstRender.result.current.selectedProviderId).toBe('anthropic');
    });

    act(() => {
      firstRender.result.current.handleTargetOptionChange('provider:openai');
    });

    await waitFor(() => {
      expect(savedWorkbench.selectedProviderId).toBe('openai');
    });

    firstRender.unmount();

    const secondRender = renderController();

    expect(secondRender.result.current.selectedProviderId).toBe('openai');
    expect(secondRender.result.current.selectedTargetKind).toBe('provider');
    expect(secondRender.result.current.targetModel).toBe('gpt-5.4');

    secondRender.unmount();
  });
});
