import type {
  Conversation,
  Locale,
  PlanDraft,
  PlanTaskDraft,
  RunSession
} from '../../shared/domain.js';
import { localizeCliMessage } from '../../shared/localizeCliMessage.js';
import { COPY, type Notice } from './copy.js';

export const getLocalizedCliMessage = (locale: Locale, message: string): string => {
  return localizeCliMessage(message, locale);
};

export const getPlanDraftTasks = (draft: PlanDraft): PlanTaskDraft[] => {
  if (draft.plannedTasks.length > 0) {
    return draft.plannedTasks;
  }

  return [
    {
      rawInput: draft.rawInput,
      cleanedPrompt: draft.cleanedPrompt,
      taskTitle: draft.taskTitle,
      taskType: draft.taskType,
      displayCategory: draft.displayCategory,
      matchedProfileId: draft.matchedProfileId ?? null,
      classificationReason: draft.classificationReason,
      mentions: draft.mentions,
      recommendedAdapterId: draft.recommendedAdapterId,
      recommendedModel: draft.recommendedModel,
      routingSource: draft.routingSource,
      confidence: draft.confidence,
      rationale: draft.rationale
    }
  ];
};

export const formatTime = (locale: Locale, value: string): string => {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

export const countEvents = (runs: RunSession[]): number => {
  return runs.reduce((total, run) => total + run.events.length, 0);
};

export const getLatestConversationMessage = (conversation: Conversation): string => {
  return conversation.messages[conversation.messages.length - 1]?.content ?? '';
};

export const formatTimeoutValue = (locale: Locale, value: number | null, noTimeoutLabel: string): string => {
  if (value === null) {
    return noTimeoutLabel;
  }

  return `${new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(value)} ms`;
};

export const renderTimeoutHint = (locale: Locale, defaultTimeoutLabel: string): string => {
  return locale === 'zh'
    ? `留空时使用适配器默认超时：${defaultTimeoutLabel}。`
    : `Leave blank to use the adapter default timeout: ${defaultTimeoutLabel}.`;
};

export const getRunStatusCopy = (locale: Locale, run: RunSession): string => {
  const hasCancelRequest = Boolean(run.cancelRequestedAt);

  if (locale === 'zh') {
    switch (run.status) {
      case 'pending':
        return hasCancelRequest
          ? '运行仍在等待启动，但已收到取消请求。'
          : '运行已进入队列，正在等待 CLI 进程启动。';
      case 'running':
        return hasCancelRequest
          ? '取消请求已发出，正在等待 CLI 进程停止。'
          : 'CLI 进程正在运行，实时事件会持续显示在下方。';
      case 'succeeded':
        return 'CLI 进程已正常完成，运行以成功状态结束。';
      case 'interrupted':
        return '应用重启后，该运行被恢复为中断状态，旧进程不会继续附着。';
      case 'spawn_failed':
        return 'CLI 进程在真正开始执行前就启动失败。';
      case 'failed':
        return 'CLI 进程已结束，但返回了失败结果。';
      case 'cancelled':
        return '该运行已被取消，CLI 进程已停止。';
      case 'timed_out':
        return '该运行超过配置的超时时间，系统已终止进程。';
      default:
        return '';
    }
  }

  switch (run.status) {
    case 'pending':
      return hasCancelRequest
        ? 'The run is still queued, but a cancellation request is already pending.'
        : 'The run is queued and waiting for the CLI process to spawn.';
    case 'running':
      return hasCancelRequest
        ? 'A cancellation request has been sent and the CLI process is winding down.'
        : 'The CLI process is active and live events continue below.';
    case 'succeeded':
      return 'The CLI process finished normally and the run completed successfully.';
    case 'interrupted':
      return 'The app restarted, so this run was restored as interrupted and is no longer attached to a live process.';
    case 'spawn_failed':
      return 'The CLI process failed before execution could fully begin.';
    case 'failed':
      return 'The CLI process exited with a failure result.';
    case 'cancelled':
      return 'This run was cancelled and the CLI process has stopped.';
    case 'timed_out':
      return 'This run exceeded its configured timeout and was terminated.';
    default:
      return '';
  }
};

export const getRunInvocationStateCopy = (locale: Locale, run: RunSession): string => {
  const copy = COPY[locale];

  if (run.endedAt !== null || run.exitCode !== null) {
    return copy.invocationEnded;
  }

  if (run.cancelRequestedAt !== null) {
    return copy.invocationCancelRequested;
  }

  if (run.pid !== null) {
    return copy.invocationObservedProcess;
  }

  if (run.transcript.length > 0 || run.events.length > 0) {
    return copy.invocationObservedActivity;
  }

  return copy.invocationNoEvidence;
};

export const renderNotice = (locale: Locale, notice: Notice): string => {
  const copy = COPY[locale];

  switch (notice.type) {
    case 'loading':
      return locale === 'zh' ? '正在加载渲染层状态...' : 'Loading renderer state...';
    case 'ready':
      return locale === 'zh'
        ? `已载入 ${notice.adapters} 个适配器和 ${notice.runs} 个运行会话。`
        : `Loaded ${notice.adapters} adapters and ${notice.runs} run sessions.`;
    case 'settingsSaved':
      return copy.settingsSaved;
    case 'toolsRefreshed':
      return locale === 'zh' ? `已刷新 ${notice.adapters} 个本地工具。` : `Refreshed ${notice.adapters} local tools.`;
    case 'planReady':
      return locale === 'zh'
        ? `规划草案已生成，当前推荐适配器为 ${notice.adapterName}。`
        : `Plan draft is ready. Current recommendation: ${notice.adapterName}.`;
    case 'planApplied':
      return locale === 'zh'
        ? `已将规划结果应用到表单：${notice.title} / ${notice.adapterName}。`
        : `Applied the plan to the form: ${notice.title} / ${notice.adapterName}.`;
    case 'runStarted':
      return locale === 'zh'
        ? `已通过 ${notice.adapterName} 启动"${notice.title}"。`
        : `Started "${notice.title}" with ${notice.adapterName}.`;
    case 'cancelRequested':
      return locale === 'zh' ? `已请求取消"${notice.title}"。` : `Cancellation requested for "${notice.title}".`;
    case 'cancelFailed':
      return locale === 'zh'
        ? `无法取消"${notice.title}"：${notice.message}`
        : `Unable to cancel "${notice.title}": ${notice.message}`;
    case 'runEvent':
      return locale === 'zh'
        ? `实时事件 ${notice.runId}: ${notice.message}`
        : `Live event ${notice.runId}: ${notice.message}`;
    case 'error': {
      const localizedMessage = getLocalizedCliMessage(locale, notice.message);
      return locale === 'zh' ? `错误：${localizedMessage}` : `Error: ${localizedMessage}`;
    }
    default:
      return copy.loadError;
  }
};

export const renderAdapterMetaLine = (label: string, value: string): React.JSX.Element | null => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return (
    <p className="adapter-meta-copy">
      <span className="meta-label">{label}</span>
      <span>{trimmedValue}</span>
    </p>
  );
};
