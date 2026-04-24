import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  DiscussionAutomationConfigInput,
  Locale,
  OrchestrationExecutionStyle,
  OrchestrationNode,
  OrchestrationNodeStatus,
  OrchestrationRun,
  WorkbenchState,
} from '../../../shared/domain.js';
import {
  appendMessagesToThread,
  createTaskThreadMessage,
  upsertMessagesToThread,
  upsertOrchestrationThreadBinding,
} from '../workbench.js';
import { toErrorMessage } from './workbenchControllerShared.js';

interface StartWorkbenchOrchestrationInput {
  prompt: string;
  automationMode: OrchestrationRun['automationMode'];
  executionStyle?: OrchestrationExecutionStyle;
  participantProfileIds?: string[];
  masterAgentProfileId?: string | null;
  discussionConfig?: DiscussionAutomationConfigInput | null;
}

interface UseWorkbenchOrchestrationFlowInput {
  locale: Locale;
  appState: AppState;
  workbench: WorkbenchState;
  activeThreadId: string | null;
  queueWorkbenchPersist: (updater: (currentWorkbench: WorkbenchState) => WorkbenchState) => Promise<WorkbenchState>;
}

interface UseWorkbenchOrchestrationFlowResult {
  orchestrationError: string | null;
  isStartingOrchestration: boolean;
  activeOrchestrationRun: OrchestrationRun | null;
  activeOrchestrationNodes: OrchestrationNode[];
  handleStartOrchestration: (input: StartWorkbenchOrchestrationInput) => Promise<void>;
  setActiveOrchestrationRunId: (runId: string | null) => Promise<void>;
}

const TERMINAL_ORCHESTRATION_NODE_STATUSES = new Set<OrchestrationNodeStatus>(['completed', 'failed', 'skipped', 'cancelled']);

export function useWorkbenchOrchestrationFlow(input: UseWorkbenchOrchestrationFlowInput): UseWorkbenchOrchestrationFlowResult {
  const { locale, appState, workbench, activeThreadId, queueWorkbenchPersist } = input;
  const [orchestrationError, setOrchestrationError] = useState<string | null>(null);
  const [isStartingOrchestration, setIsStartingOrchestration] = useState(false);
  const orchestrationNodesRef = useRef(appState.orchestrationNodes);
  const runsRef = useRef(appState.runs);
  const agentProfilesRef = useRef(appState.agentProfiles);
  const bindingsRef = useRef(new Map((workbench.orchestrationThreadBindings ?? []).map((binding) => [binding.orchestrationRunId, binding.threadId])));

  const activeOrchestrationRunId =
    workbench.activeOrchestrationRunId ??
    appState.orchestrationRuns.find((run) => run.status === 'executing')?.id ??
    appState.orchestrationRuns[0]?.id ??
    null;

  const activeOrchestrationRun = useMemo(
    () => (activeOrchestrationRunId ? appState.orchestrationRuns.find((run) => run.id === activeOrchestrationRunId) ?? null : null),
    [activeOrchestrationRunId, appState.orchestrationRuns],
  );

  const activeOrchestrationNodes = useMemo(() => {
    if (!activeOrchestrationRunId) {
      return [];
    }

    return appState.orchestrationNodes
      .filter((node) => node.orchestrationRunId === activeOrchestrationRunId)
      .sort((left, right) => {
        const leftRound = left.discussionRound ?? 0;
        const rightRound = right.discussionRound ?? 0;
        if (leftRound !== rightRound) {
          return leftRound - rightRound;
        }

        return left.title.localeCompare(right.title);
      });
  }, [activeOrchestrationRunId, appState.orchestrationNodes]);

  useEffect(() => {
    bindingsRef.current = new Map((workbench.orchestrationThreadBindings ?? []).map((binding) => [binding.orchestrationRunId, binding.threadId]));
  }, [workbench]);

  useEffect(() => {
    orchestrationNodesRef.current = appState.orchestrationNodes;
    runsRef.current = appState.runs;
    agentProfilesRef.current = appState.agentProfiles;
  }, [appState.agentProfiles, appState.orchestrationNodes, appState.runs]);

  useEffect(() => {
    const processedNodeIds = new Set(workbench.processedOrchestrationNodeIds ?? []);
    const bindings = new Map((workbench.orchestrationThreadBindings ?? []).map((binding) => [binding.orchestrationRunId, binding.threadId]));
    const candidateNodes = appState.orchestrationNodes.filter((node) => {
      return bindings.has(node.orchestrationRunId) && TERMINAL_ORCHESTRATION_NODE_STATUSES.has(node.status) && !processedNodeIds.has(node.id);
    });

    if (candidateNodes.length === 0) {
      return;
    }

    const syncNodeMessages = async (): Promise<void> => {
      for (const node of candidateNodes) {
        const threadId = bindings.get(node.orchestrationRunId) ?? null;
        const run = node.runId ? appState.runs.find((entry) => entry.id === node.runId) ?? null : null;
        const profile = node.agentProfileId ? appState.agentProfiles.find((entry) => entry.id === node.agentProfileId) ?? null : null;
        const summary = node.resultSummary?.trim() || node.resultPayload?.transcriptSummary?.trim() || '';
        if (!threadId || summary.length === 0) {
          await queueWorkbenchPersist((currentWorkbench) => {
            const nextProcessedNodeIds = new Set(currentWorkbench.processedOrchestrationNodeIds ?? []);
            if (nextProcessedNodeIds.has(node.id)) {
              return currentWorkbench;
            }

            nextProcessedNodeIds.add(node.id);
            return {
              ...currentWorkbench,
              processedOrchestrationNodeIds: [...nextProcessedNodeIds],
            };
          });
          continue;
        }

        await queueWorkbenchPersist((currentWorkbench) => {
          const nextProcessedNodeIds = new Set(currentWorkbench.processedOrchestrationNodeIds ?? []);
          if (nextProcessedNodeIds.has(node.id)) {
            return currentWorkbench;
          }

          nextProcessedNodeIds.add(node.id);
          return {
            ...upsertMessagesToThread({
              locale,
              workbench: currentWorkbench,
              threadId,
              messages: [
                createTaskThreadMessage({
                  id: `orch-node-result-${node.id}`,
                  role: 'assistant',
                  content: summary,
                  messageKind: node.discussionRole === 'synthesizer' ? 'discussion_final' : 'orchestration_result',
                  adapterId: run?.adapterId ?? null,
                  sourceKind: 'orchestration',
                  sourceLabel: node.discussionRole === 'synthesizer'
                    ? (locale === 'zh' ? '最终方案' : 'Final synthesis')
                    : node.title,
                  modelLabel: run?.model ?? null,
                  agentLabel: profile?.name ?? null,
                  orchestrationRunId: node.orchestrationRunId,
                  orchestrationNodeId: node.id,
                  discussionRound: node.discussionRound ?? null,
                  createdAt: run?.endedAt ?? new Date().toISOString(),
                }),
              ],
            }),
            processedOrchestrationNodeIds: [...nextProcessedNodeIds],
          };
        });
      }
    };

    void syncNodeMessages();
  }, [appState.agentProfiles, appState.orchestrationNodes, appState.runs, locale, queueWorkbenchPersist, workbench]);

  useEffect(() => {
    const unsubscribe = window.desktopApi.onRunEvent((event) => {
      if (event.level !== 'stdout' && event.level !== 'stderr' && event.level !== 'warning' && event.level !== 'error') {
        return;
      }

      const node = orchestrationNodesRef.current.find((entry) => entry.runId === event.runId);
      if (!node) {
        return;
      }

      const threadId = bindingsRef.current.get(node.orchestrationRunId) ?? null;
      if (!threadId) {
        return;
      }

      const run = runsRef.current.find((entry) => entry.id === event.runId) ?? null;
      const profile = node.agentProfileId ? agentProfilesRef.current.find((entry) => entry.id === node.agentProfileId) ?? null : null;
      const normalizedMessage = event.level === 'stderr'
        ? `${locale === 'zh' ? '错误输出' : 'stderr'}: ${event.message}`
        : event.message;

      queueWorkbenchPersist((currentWorkbench) => {
        return appendMessagesToThread({
          locale,
          workbench: currentWorkbench,
          threadId,
          messages: [
            createTaskThreadMessage({
              id: `orch-event-${event.id}`,
              role: 'system',
              content: normalizedMessage,
              messageKind: 'orchestration_event',
              adapterId: run?.adapterId ?? null,
              sourceKind: 'orchestration',
              sourceLabel: node.title,
              modelLabel: run?.model ?? null,
              agentLabel: profile?.name ?? null,
              orchestrationRunId: node.orchestrationRunId,
              orchestrationNodeId: node.id,
              discussionRound: node.discussionRound ?? null,
              createdAt: event.timestamp,
            }),
          ],
        });
      });
    });

    return () => {
      unsubscribe();
    };
  }, [locale, queueWorkbenchPersist]);

  useEffect(() => {
    const bindings = new Map((workbench.orchestrationThreadBindings ?? []).map((binding) => [binding.orchestrationRunId, binding.threadId]));
    const runningNodes = appState.orchestrationNodes.filter((node) => bindings.has(node.orchestrationRunId) && node.status === 'running');
    if (runningNodes.length === 0) {
      return;
    }

    queueWorkbenchPersist((currentWorkbench) => {
      let nextWorkbench = currentWorkbench;

      runningNodes.forEach((node) => {
        const threadId = bindings.get(node.orchestrationRunId) ?? null;
        const run = node.runId ? appState.runs.find((entry) => entry.id === node.runId) ?? null : null;
        const profile = node.agentProfileId ? appState.agentProfiles.find((entry) => entry.id === node.agentProfileId) ?? null : null;
        if (!threadId) {
          return;
        }

        nextWorkbench = upsertMessagesToThread({
          locale,
          workbench: nextWorkbench,
          threadId,
          messages: [
            createTaskThreadMessage({
              id: `orch-node-running-${node.id}`,
              role: 'system',
              content: locale === 'zh'
                ? `${profile?.name ?? node.title} 正在处理：${node.title}`
                : `${profile?.name ?? node.title} is working on ${node.title}.`,
              messageKind: 'orchestration_event',
              adapterId: run?.adapterId ?? null,
              sourceKind: 'orchestration',
              sourceLabel: node.title,
              modelLabel: run?.model ?? null,
              agentLabel: profile?.name ?? null,
              orchestrationRunId: node.orchestrationRunId,
              orchestrationNodeId: node.id,
              discussionRound: node.discussionRound ?? null,
              createdAt: run?.startedAt ?? new Date().toISOString(),
            }),
          ],
        });
      });

      return nextWorkbench;
    });
  }, [appState.agentProfiles, appState.orchestrationNodes, appState.runs, locale, queueWorkbenchPersist, workbench.orchestrationThreadBindings]);

  const handleStartOrchestration = async (startInput: StartWorkbenchOrchestrationInput): Promise<void> => {
    if (!activeThreadId) {
      setOrchestrationError(locale === 'zh' ? '请先创建或选择一个对话线程。' : 'Create or select a thread before starting orchestration.');
      return;
    }

    const prompt = startInput.prompt.trim();
    if (!prompt) {
      setOrchestrationError(locale === 'zh' ? '请先填写编排任务描述。' : 'Enter an orchestration task prompt first.');
      return;
    }

    setIsStartingOrchestration(true);
    setOrchestrationError(null);

    try {
      const result = await window.desktopApi.startOrchestration({
        prompt,
        automationMode: startInput.automationMode,
        masterAgentProfileId: startInput.masterAgentProfileId ?? null,
        discussionConfig: startInput.discussionConfig ?? null,
        ...(startInput.executionStyle ? { executionStyle: startInput.executionStyle } : {}),
        ...(startInput.participantProfileIds ? { participantProfileIds: startInput.participantProfileIds } : {}),
      });

      bindingsRef.current.set(result.orchestrationRun.id, activeThreadId);

      const startedMessage = createTaskThreadMessage({
        role: 'system',
        content:
          startInput.automationMode === 'discussion'
            ? locale === 'zh'
              ? '已启动多 Agent 讨论模式。'
              : 'Started multi-agent discussion mode.'
            : locale === 'zh'
              ? '已启动多 Agent 编排。'
              : 'Started multi-agent orchestration.',
        sourceKind: 'orchestration',
        sourceLabel: result.orchestrationRun.automationMode === 'discussion' ? 'Discussion' : 'Orchestration',
        orchestrationRunId: result.orchestrationRun.id,
      });

      await queueWorkbenchPersist((currentWorkbench) => {
        return upsertOrchestrationThreadBinding(
          appendMessagesToThread({
            locale,
            workbench: currentWorkbench,
            threadId: activeThreadId,
            messages: [startedMessage],
          }),
          {
            orchestrationRunId: result.orchestrationRun.id,
            threadId: activeThreadId,
            createdAt: new Date().toISOString(),
          },
        );
      });
    } catch (error: unknown) {
      setOrchestrationError(toErrorMessage(error, locale === 'zh' ? '无法启动编排。' : 'Unable to start orchestration.'));
    } finally {
      setIsStartingOrchestration(false);
    }
  };

  const setActiveOrchestrationRunId = async (runId: string | null): Promise<void> => {
    await queueWorkbenchPersist((currentWorkbench) => ({
      ...currentWorkbench,
      activeOrchestrationRunId: runId,
    }));
  };

  return {
    orchestrationError,
    isStartingOrchestration,
    activeOrchestrationRun,
    activeOrchestrationNodes,
    handleStartOrchestration,
    setActiveOrchestrationRunId,
  };
}
