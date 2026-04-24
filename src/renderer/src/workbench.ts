import type {
  AppLocale,
  RunSession,
  SkillDefinition,
  TaskThread,
  TaskThreadContinuation,
  TaskThreadMessage,
  WorkbenchActivitySummary,
  WorkbenchOrchestrationBinding,
  WorkbenchSkillBinding,
  WorkbenchState,
  WorkbenchTargetKind,
  WorkbenchTaskItem,
} from '../../shared/domain.js';
import type { AiProviderDefinition } from './aiConfig.js';
import { RUN_STATUS_LABELS } from './copy.js';
import { TARGET_KIND_LABELS, WORKBENCH_TASK_STATUS_LABELS } from './workConfigCopy.js';

export interface WorkbenchTaskUpdates {
  completeTaskIds: string[];
  inProgressTaskIds: string[];
  newTasks: { title: string; detail: string }[];
}

const TASK_UPDATE_PATTERN = /<TASK_UPDATES>([\s\S]*?)<\/TASK_UPDATES>/gi;
const CONTINUITY_PLACEHOLDER_PATTERN = /{{\s*([\w.]+)\s*}}/g;
const THREAD_ACTIVITY_LOG_LIMIT = 25;
export const MAX_TASK_THREAD_MESSAGES = 50;

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const clipDetail = (detail: string, limit = 500): string => {
  const normalizedDetail = detail.trim();
  return normalizedDetail.length > limit ? `${normalizedDetail.slice(0, limit)}…` : normalizedDetail;
};

const stringifyTaskList = (locale: AppLocale, tasks: WorkbenchTaskItem[], emptyLabel: string): string => {
  return tasks.length > 0
    ? tasks
        .map((task, index) => `${index + 1}. [${WORKBENCH_TASK_STATUS_LABELS[locale][task.status]}] ${task.title}${task.detail ? ` — ${task.detail}` : ''}`)
        .join('\n')
    : emptyLabel;
};

const buildFullPromptTemplate = (locale: AppLocale): string => {
  if (locale === 'zh') {
    return [
      '# 连续工作交接',
      '',
      '## 当前目标',
      '{{objective}}',
      '',
      '## 即将切换到',
      '- 工具类型：{{targetTypeLabel}}',
      '- 目标：{{targetLabel}}',
      '- 模型：{{modelLabel}}',
      '',
      '## 项目上下文',
      '{{projectContext}}',
      '',
      '{{promptBuilderSection}}',
      '{{recentProviderSection}}',
      '{{recentLocalRunSection}}',
      '## 已完成任务',
      '{{completedTasks}}',
      '',
      '## 当前待推进任务',
      '{{remainingTasks}}',
      '',
      '## 当前文件上下文',
      '{{currentFileContext}}',
      '',
      '{{boundSkillsSection}}',
      '## 下一步要求',
      '- 不要从头重新分析。先延续当前线程和任务清单。',
      '- 完成任务时勾完成；发现新任务时追加。',
      '- 回复要简洁，优先给出下一步可执行动作。',
      '',
      '{{checklistInstruction}}',
    ].join('\n');
  }

  return [
    '# Continuity Handoff',
    '',
    '## Current Objective',
    '{{objective}}',
    '',
    '## Switching To',
    '- Tool type: {{targetTypeLabel}}',
    '- Target: {{targetLabel}}',
    '- Model: {{modelLabel}}',
    '',
    '## Project Context',
    '{{projectContext}}',
    '',
    '{{promptBuilderSection}}',
    '{{recentProviderSection}}',
    '{{recentLocalRunSection}}',
    '## Completed Tasks',
    '{{completedTasks}}',
    '',
    '## Remaining Tasks',
    '{{remainingTasks}}',
    '',
    '## Current File Context',
    '{{currentFileContext}}',
    '',
    '{{boundSkillsSection}}',
    '## Next-Step Instructions',
    '- Continue from the current thread and checklist instead of restarting analysis.',
    '- Mark tasks complete when done and add newly discovered tasks.',
    '- Keep the answer concise and action-oriented.',
    '',
    '{{checklistInstruction}}',
  ].join('\n');
};

const renderTemplate = (template: string, values: Record<string, string>): string => {
  return template.replace(CONTINUITY_PLACEHOLDER_PATTERN, (_matched, key: string) => values[key] ?? '');
};

const buildThreadTitle = (locale: AppLocale, objective: string, explicitTitle?: string): string => {
  const preferredTitle = explicitTitle?.trim() ?? '';
  if (preferredTitle) {
    return preferredTitle;
  }

  const normalizedObjective = objective.trim();
  if (!normalizedObjective) {
    return locale === 'zh' ? '新线程' : 'New thread';
  }

  return normalizedObjective.length > 72 ? `${normalizedObjective.slice(0, 72).trimEnd()}…` : normalizedObjective;
};

const buildTaskUpdateSummary = (locale: AppLocale, updates: WorkbenchTaskUpdates | null): string => {
  if (locale === 'zh') {
    return updates
      ? `任务更新：完成 ${updates.completeTaskIds.length} 项，推进 ${updates.inProgressTaskIds.length} 项，新增 ${updates.newTasks.length} 项。`
      : '任务更新：本次交互没有返回结构化任务更新块（TASK_UPDATES）。';
  }

  return updates
    ? `Task updates: completed ${updates.completeTaskIds.length}, moved ${updates.inProgressTaskIds.length} in progress, added ${updates.newTasks.length}.`
    : 'Task updates: this interaction did not return a structured TASK_UPDATES block.';
};

const updateThread = (
  workbench: WorkbenchState,
  threadId: string | null,
  updater: (thread: TaskThread) => TaskThread,
): WorkbenchState => {
  if (!threadId) {
    return workbench;
  }

  const threadIndex = workbench.threads.findIndex((thread) => thread.id === threadId);
  if (threadIndex < 0) {
    return workbench;
  }

  const threads = [...workbench.threads];
  const targetThread = threads[threadIndex];
  if (!targetThread) {
    return workbench;
  }

  threads[threadIndex] = updater(targetThread);
  return { ...workbench, threads };
};

const summarizeOverflowMessages = (locale: AppLocale, threadId: string, messages: TaskThreadMessage[]): WorkbenchActivitySummary => {
  const lastMessage = messages.at(-1) ?? null;
  const sourceKind = lastMessage?.adapterId ? 'adapter' : 'provider';
  const sourceId = lastMessage?.adapterId ?? lastMessage?.providerId ?? threadId;
  const sourceLabel = lastMessage?.adapterId ?? lastMessage?.providerId ?? (locale === 'zh' ? '线程记忆' : 'Thread memory');
  const detail = messages
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .filter((entry) => entry.length > 0)
    .join('\n\n');

  return {
    sourceKind,
    sourceId,
    sourceLabel,
    modelLabel: '',
    status: 'compressed',
    detail: clipDetail(detail, 1200),
    taskUpdateSummary:
      locale === 'zh' ? `线程历史已压缩 ${messages.length} 条较早消息。` : `Compressed ${messages.length} older thread messages into memory.`,
    recordedAt: lastMessage?.createdAt ?? new Date().toISOString(),
  };
};

const formatFileContext = (locale: AppLocale, selectedFilePath: string | null, selectedFileContent: string | null): string => {
  if (!selectedFilePath) {
    return locale === 'zh' ? '- 当前没有选中文件。' : '- No file is currently selected.';
  }

  return locale === 'zh'
    ? `- 文件：${selectedFilePath}\n- 片段：\n${selectedFileContent ?? '当前未加载文件内容。'}`
    : `- File: ${selectedFilePath}\n- Snippet:\n${selectedFileContent ?? 'The file content is not loaded yet.'}`;
};

const buildBoundSkillsSection = (boundSkills: SkillDefinition[], skillText: string, locale: AppLocale): string => {
  if (boundSkills.length === 0) {
    return '';
  }

  return locale === 'zh'
    ? `## 已绑定技能\n${boundSkills.map((skill) => `- ${skill.name}`).join('\n')}\n\n${skillText}`
    : `## Bound Skills\n${boundSkills.map((skill) => `- ${skill.name}`).join('\n')}\n\n${skillText}`;
};

export const createTaskThread = (input: { locale: AppLocale; objective: string; title?: string }): TaskThread => {
  const now = new Date().toISOString();

  return {
    id: `wb-thread-${crypto.randomUUID()}`,
    title: buildThreadTitle(input.locale, input.objective, input.title),
    continuation: null,
    messages: [],
    activityLog: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const createTaskThreadMessage = (input: {
  id?: string;
  role: TaskThreadMessage['role'];
  content: string;
  messageKind?: TaskThreadMessage['messageKind'];
  providerId?: string | null;
  adapterId?: string | null;
  sourceKind?: TaskThreadMessage['sourceKind'];
  sourceLabel?: string | null;
  modelLabel?: string | null;
  agentLabel?: string | null;
  orchestrationRunId?: string | null;
  orchestrationNodeId?: string | null;
  discussionRound?: number | null;
  createdAt?: string;
}): TaskThreadMessage => {
  return {
    id: input.id ?? crypto.randomUUID(),
    role: input.role,
    content: input.content,
    messageKind: input.messageKind ?? 'default',
    providerId: input.providerId ?? null,
    adapterId: input.adapterId ?? null,
    sourceKind: input.sourceKind ?? null,
    sourceLabel: input.sourceLabel ?? null,
    modelLabel: input.modelLabel ?? null,
    agentLabel: input.agentLabel ?? null,
    orchestrationRunId: input.orchestrationRunId ?? null,
    orchestrationNodeId: input.orchestrationNodeId ?? null,
    discussionRound: input.discussionRound ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
};

const areTaskThreadMessagesEqual = (left: TaskThreadMessage, right: TaskThreadMessage): boolean => {
  return left.id === right.id
    && left.role === right.role
    && left.content === right.content
    && left.messageKind === right.messageKind
    && left.providerId === right.providerId
    && left.adapterId === right.adapterId
    && left.sourceKind === right.sourceKind
    && left.sourceLabel === right.sourceLabel
    && left.modelLabel === right.modelLabel
    && left.agentLabel === right.agentLabel
    && left.orchestrationRunId === right.orchestrationRunId
    && left.orchestrationNodeId === right.orchestrationNodeId
    && left.discussionRound === right.discussionRound
    && left.createdAt === right.createdAt;
};

const applyThreadMessageLimit = (
  locale: AppLocale,
  thread: TaskThread,
  nextMessages: TaskThreadMessage[],
  fallbackUpdatedAt: string,
): TaskThread => {
  if (nextMessages.length <= MAX_TASK_THREAD_MESSAGES) {
    return {
      ...thread,
      messages: nextMessages,
      updatedAt: fallbackUpdatedAt,
    };
  }

  const overflowCount = nextMessages.length - MAX_TASK_THREAD_MESSAGES;
  const overflowMessages = nextMessages.slice(0, overflowCount);
  const retainedMessages = nextMessages.slice(-MAX_TASK_THREAD_MESSAGES);
  const overflowSummary = summarizeOverflowMessages(locale, thread.id, overflowMessages);

  return {
    ...thread,
    messages: retainedMessages,
    activityLog: [...thread.activityLog, overflowSummary].slice(-THREAD_ACTIVITY_LOG_LIMIT),
    updatedAt: retainedMessages.at(-1)?.createdAt ?? overflowSummary.recordedAt,
  };
};

export const upsertOrchestrationThreadBinding = (
  workbench: WorkbenchState,
  binding: WorkbenchOrchestrationBinding,
): WorkbenchState => {
  const existingBindings = workbench.orchestrationThreadBindings ?? [];
  return {
    ...workbench,
    activeOrchestrationRunId: binding.orchestrationRunId,
    orchestrationThreadBindings: [
      binding,
      ...existingBindings.filter((entry) => entry.orchestrationRunId !== binding.orchestrationRunId),
    ],
  };
};

export const bindContinuationToThread = (
  workbench: WorkbenchState,
  threadId: string | null,
  continuation: TaskThreadContinuation,
): WorkbenchState => {
  return updateThread(workbench, threadId, (thread) => ({
    ...thread,
    continuation,
    updatedAt: continuation.updatedAt,
  }));
};

export const getActiveTaskThread = (workbench: WorkbenchState): TaskThread | null => {
  if (!workbench.activeThreadId) {
    return workbench.threads[0] ?? null;
  }

  return workbench.threads.find((thread) => thread.id === workbench.activeThreadId) ?? workbench.threads[0] ?? null;
};

export const getTaskThreadById = (workbench: WorkbenchState, threadId: string | null): TaskThread | null => {
  if (!threadId) {
    return null;
  }

  return workbench.threads.find((thread) => thread.id === threadId) ?? null;
};

export const appendActivityToThread = (
  workbench: WorkbenchState,
  threadId: string | null,
  activity: WorkbenchActivitySummary,
): WorkbenchState => {
  return updateThread(workbench, threadId, (thread) => ({
    ...thread,
    activityLog: [...thread.activityLog, activity].slice(-THREAD_ACTIVITY_LOG_LIMIT),
    updatedAt: activity.recordedAt,
  }));
};

export const appendMessagesToThread = (input: {
  locale: AppLocale;
  workbench: WorkbenchState;
  threadId: string | null;
  messages: TaskThreadMessage[];
}): WorkbenchState => {
  const { locale, workbench, threadId, messages } = input;
  if (!threadId || messages.length === 0) {
    return workbench;
  }

  return updateThread(workbench, threadId, (thread) => {
    const nextMessages = [...thread.messages, ...messages];
    return applyThreadMessageLimit(locale, thread, nextMessages, messages.at(-1)?.createdAt ?? new Date().toISOString());
  });
};

export const upsertMessagesToThread = (input: {
  locale: AppLocale;
  workbench: WorkbenchState;
  threadId: string | null;
  messages: TaskThreadMessage[];
}): WorkbenchState => {
  const { locale, workbench, threadId, messages } = input;
  if (!threadId || messages.length === 0) {
    return workbench;
  }

  return updateThread(workbench, threadId, (thread) => {
    const nextMessages = [...thread.messages];
    const indexById = new Map(nextMessages.map((message, index) => [message.id, index]));
    const changedMessageIds = new Set<string>();

    messages.forEach((message) => {
      const existingIndex = indexById.get(message.id);
      if (existingIndex === undefined) {
        nextMessages.push(message);
        indexById.set(message.id, nextMessages.length - 1);
        changedMessageIds.add(message.id);
        return;
      }

      const existingMessage = nextMessages[existingIndex];
      if (!existingMessage || areTaskThreadMessagesEqual(existingMessage, message)) {
        return;
      }

      nextMessages[existingIndex] = message;
      changedMessageIds.add(message.id);
    });

    if (changedMessageIds.size === 0) {
      return thread;
    }

    return applyThreadMessageLimit(locale, thread, nextMessages, messages.at(-1)?.createdAt ?? thread.updatedAt);
  });
};

export const applyTaskUpdates = (
  tasks: WorkbenchTaskItem[],
  updates: WorkbenchTaskUpdates,
  actor: 'assistant' | 'manual',
): WorkbenchTaskItem[] => {
  const now = new Date().toISOString();
  const completedIds = new Set(updates.completeTaskIds);
  const inProgressIds = new Set(updates.inProgressTaskIds);

  const nextTasks = tasks.map((task) => {
    if (completedIds.has(task.id)) {
      return {
        ...task,
        status: 'completed' as const,
        source: actor,
        updatedAt: now,
        completedAt: now,
      };
    }

    if (inProgressIds.has(task.id)) {
      return {
        ...task,
        status: 'in_progress' as const,
        source: actor,
        updatedAt: now,
      };
    }

    return task;
  });

  const appendedTasks = updates.newTasks
    .filter((task) => task.title.trim().length > 0)
    .map((task) => ({
      id: `wb-task-${crypto.randomUUID()}`,
      title: task.title.trim(),
      detail: task.detail.trim(),
      status: 'pending' as const,
      source: actor,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }));

  return [...nextTasks, ...appendedTasks];
};

export const extractTaskUpdates = (content: string): WorkbenchTaskUpdates | null => {
  const matches = Array.from(content.matchAll(TASK_UPDATE_PATTERN));
  if (matches.length === 0) {
    return null;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const matched = matches[index];

    try {
      const parsed = JSON.parse(matched?.[1] ?? '') as unknown;
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const value = parsed as Record<string, unknown>;
      const completeTaskIds = Array.isArray(value.completeTaskIds)
        ? value.completeTaskIds.filter((entry): entry is string => typeof entry === 'string')
        : [];
      const inProgressTaskIds = Array.isArray(value.inProgressTaskIds)
        ? value.inProgressTaskIds.filter((entry): entry is string => typeof entry === 'string')
        : [];
      const newTasks = Array.isArray(value.newTasks)
        ? value.newTasks
            .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
            .map((entry) => ({
              title: typeof entry.title === 'string' ? entry.title : '',
              detail: typeof entry.detail === 'string' ? entry.detail : '',
            }))
        : [];

      return {
        completeTaskIds,
        inProgressTaskIds,
        newTasks,
      };
    } catch {
      continue;
    }
  }

  return null;
};

export const stripTaskUpdateBlock = (content: string): string => {
  return content.replace(TASK_UPDATE_PATTERN, '').trim();
};

export const resolveBoundSkills = (
  skills: SkillDefinition[],
  bindings: WorkbenchSkillBinding[],
  targetKind: WorkbenchTargetKind,
  targetId: string,
  model: string,
): SkillDefinition[] => {
  const matchedBindingIds = bindings
    .filter((binding) => {
      if (binding.targetKind !== targetKind || binding.targetId !== targetId) {
        return false;
      }

      const pattern = binding.modelPattern.trim();
      if (!pattern || pattern === '*') {
        return true;
      }

      const matcher = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`, 'i');
      return matcher.test(model || '');
    })
    .flatMap((binding) => binding.enabledSkillIds);

  const idSet = new Set(matchedBindingIds);
  return skills.filter((skill) => skill.enabled && idSet.has(skill.id));
};

export const assembleSkillPromptText = (skills: SkillDefinition[]): string => {
  return skills
    .map((skill) => skill.promptTemplate.trim())
    .filter((entry) => entry.length > 0)
    .join('\n\n');
};

export const buildChecklistInstruction = (locale: AppLocale): string => {
  if (locale === 'zh') {
    return [
      '在回复末尾附上一个 <TASK_UPDATES> JSON 块，用于同步任务清单。',
      '格式：',
      '<TASK_UPDATES>{"completeTaskIds":[],"inProgressTaskIds":[],"newTasks":[{"title":"","detail":""}]}</TASK_UPDATES>',
      '如果没有更新，也请返回空数组。',
    ].join('\n');
  }

  return [
    'At the end of your reply, include a <TASK_UPDATES> JSON block to sync the shared checklist.',
    'Format:',
    '<TASK_UPDATES>{"completeTaskIds":[],"inProgressTaskIds":[],"newTasks":[{"title":"","detail":""}]}</TASK_UPDATES>',
    'Return empty arrays when there are no checklist changes.',
  ].join('\n');
};

export const collectRunOutputText = (run: RunSession): string => {
  return [
    ...run.events.map((event) => event.message),
    ...run.transcript.flatMap((entry) => [entry.summary, entry.detail ?? '']),
  ]
    .filter((entry) => entry.trim().length > 0)
    .join('\n');
};

const RUN_LIFECYCLE_OUTPUT_PATTERNS = [
  /^Process started(?: with pid \d+)?\.?$/,
  /^Process completed successfully\.?$/,
  /^Process exited with code .+$/,
  /^Process cancelled by user.*$/,
  /^Process timed out after .+$/,
  /^Manual handoff is ready\..*$/,
];

const cleanAdapterReplyText = (content: string): string => {
  return stripTaskUpdateBlock(content)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const normalizedLine = line.trim();
      return normalizedLine.length > 0 && !RUN_LIFECYCLE_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalizedLine));
    })
    .join('\n')
    .trim();
};

export const buildAdapterReplyContent = (locale: AppLocale, run: RunSession, outputText: string): string => {
  const assistantTranscript = run.transcript
    .filter((entry) => entry.actor === 'assistant')
    .map((entry) => entry.detail ?? entry.summary)
    .join('\n');
  const stdoutTranscript = run.transcript
    .filter((entry) => entry.label === 'Stdout')
    .map((entry) => entry.detail ?? entry.summary)
    .join('\n');
  const stderrTranscript = run.transcript
    .filter((entry) => entry.label === 'Stderr')
    .map((entry) => entry.detail ?? entry.summary)
    .join('\n');

  for (const candidate of [assistantTranscript, stdoutTranscript, outputText, stderrTranscript]) {
    const cleaned = cleanAdapterReplyText(candidate);
    if (cleaned.length > 0) {
      return clipDetail(cleaned, 4000);
    }
  }

  if (run.status === 'succeeded') {
    return locale === 'zh'
      ? '本地工具已完成，但没有返回可显示的回复内容。'
      : 'The local tool completed, but did not return displayable reply content.';
  }

  return locale === 'zh'
    ? `本地工具以 ${run.status} 结束，但没有返回可显示的回复内容。`
    : `The local tool finished with ${run.status}, but did not return displayable reply content.`;
};

export const formatWorkbenchActivitySummary = (locale: AppLocale, activity: WorkbenchActivitySummary): string => {
  const localizedStatuses = RUN_STATUS_LABELS[locale] as Record<string, string>;
  const localizedStatus = localizedStatuses[activity.status] ?? (activity.status || (locale === 'zh' ? '未知状态' : 'unknown'));

  if (locale === 'zh') {
    return [
      `- 最近${TARGET_KIND_LABELS[locale][activity.sourceKind]}：${activity.sourceLabel} / ${activity.modelLabel || '未指定模型'} / 状态 ${localizedStatus}`,
      `- 记录时间：${activity.recordedAt}`,
      `- 摘要：${activity.detail || '没有更多输出摘要。'}`,
      `- ${activity.taskUpdateSummary || '任务更新：本次交互没有返回结构化 TASK_UPDATES。'}`,
    ].join('\n');
  }

  return [
    `- Latest ${TARGET_KIND_LABELS[locale][activity.sourceKind].toLowerCase()}: ${activity.sourceLabel} / ${activity.modelLabel || 'no model'} / status ${localizedStatus}`,
    `- Recorded at: ${activity.recordedAt}`,
    `- Summary: ${activity.detail || 'No additional output summary was recorded.'}`,
    `- ${activity.taskUpdateSummary || 'Task updates: this interaction did not return a structured TASK_UPDATES block.'}`,
  ].join('\n');
};

export const createAdapterActivitySummary = (
  locale: AppLocale,
  run: RunSession,
  adapterLabel: string,
  outputText: string,
): WorkbenchActivitySummary => {
  const updates = extractTaskUpdates(outputText);
  const meaningfulTranscript = [...run.transcript]
    .reverse()
    .find((entry) => entry.kind === 'step_completed' || entry.kind === 'run_completed' || entry.kind === 'step_failed' || entry.kind === 'run_failed' || entry.kind === 'step_output');
  const fallbackEvent = [...run.events].reverse().find((event) => event.level === 'stdout' || event.level === 'stderr' || event.level === 'success' || event.level === 'error');
  const detail = meaningfulTranscript?.detail ?? meaningfulTranscript?.summary ?? fallbackEvent?.message ?? run.commandPreview;

  return {
    sourceKind: 'adapter',
    sourceId: run.adapterId,
    sourceLabel: adapterLabel,
    modelLabel: run.model ?? '',
    status: run.status,
    detail: clipDetail(detail || ''),
    taskUpdateSummary: buildTaskUpdateSummary(locale, updates),
    recordedAt: run.endedAt ?? run.startedAt,
  };
};

export const createProviderActivitySummary = (input: {
  locale: AppLocale;
  providerId: string;
  providerLabel: string;
  modelLabel: string;
  responseText: string;
}): WorkbenchActivitySummary => {
  const updates = extractTaskUpdates(input.responseText);
  const cleaned = clipDetail(stripTaskUpdateBlock(input.responseText) || input.responseText);

  return {
    sourceKind: 'provider',
    sourceId: input.providerId,
    sourceLabel: input.providerLabel,
    modelLabel: input.modelLabel,
    status: 'succeeded',
    detail: cleaned,
    taskUpdateSummary: buildTaskUpdateSummary(input.locale, updates),
    recordedAt: new Date().toISOString(),
  };
};

export const summarizeRecentLocalRun = (
  locale: AppLocale,
  run: RunSession,
  adapterLabel: string,
  outputText: string,
): string => {
  return formatWorkbenchActivitySummary(locale, createAdapterActivitySummary(locale, run, adapterLabel, outputText));
};

export const buildContinuityPrompt = (input: {
  locale: AppLocale;
  workbench: WorkbenchState;
  activeThread: TaskThread | null;
  selectedFilePath: string | null;
  selectedFileContent: string | null;
  targetKind: WorkbenchTargetKind;
  targetLabel: string;
  modelLabel: string;
  projectContextSummary: string;
  providerDefinition?: AiProviderDefinition | null;
  boundSkills: SkillDefinition[];
  recentProviderSummary?: string | null;
  recentLocalRunSummary?: string | null;
  continuityTemplate?: string | null;
}): string => {
  const {
    locale,
    workbench,
    activeThread,
    selectedFilePath,
    selectedFileContent,
    targetKind,
    targetLabel,
    modelLabel,
    projectContextSummary,
    boundSkills,
    recentProviderSummary,
    recentLocalRunSummary,
    continuityTemplate,
  } = input;

  const completedTasks = workbench.tasks.filter((task) => task.status === 'completed');
  const activeTasks = workbench.tasks.filter((task) => task.status !== 'completed');
  const skillText = assembleSkillPromptText(boundSkills);
  const promptBuilderCommand = workbench.promptBuilderCommand?.trim() ?? '';
  const fileContext = formatFileContext(locale, selectedFilePath, selectedFileContent);
  const checklistInstruction = buildChecklistInstruction(locale);
  const hasThreadHistory = Boolean(activeThread && (activeThread.messages.length > 0 || activeThread.activityLog.length > 0));

  if (hasThreadHistory) {
    const recentThreadActivities = activeThread?.activityLog.slice(-3).map((activity) => formatWorkbenchActivitySummary(locale, activity)).join('\n\n');

    return [
      locale === 'zh' ? '# 当前线程增量交接' : '# Incremental Thread Handoff',
      '',
      locale === 'zh' ? '## 继续使用当前线程' : '## Continue In The Current Thread',
      locale === 'zh'
        ? `- 线程：${activeThread?.title ?? '未命名线程'}\n- 保留消息：${activeThread?.messages.length ?? 0} 条\n- 历史摘要：${activeThread?.activityLog.length ?? 0} 条`
        : `- Thread: ${activeThread?.title ?? 'Untitled thread'}\n- Retained messages: ${activeThread?.messages.length ?? 0}\n- History summaries: ${activeThread?.activityLog.length ?? 0}`,
      '',
      locale === 'zh' ? '## 当前目标' : '## Current Objective',
      workbench.objective || (locale === 'zh' ? '尚未填写工作目标。' : 'No work objective has been defined yet.'),
      '',
      locale === 'zh' ? '## 当前待推进任务' : '## Remaining Tasks',
      stringifyTaskList(locale, activeTasks, locale === 'zh' ? '1. 先基于目标生成任务清单。' : '1. Generate an initial task list from the objective.'),
      '',
      recentThreadActivities ? `${locale === 'zh' ? '## 线程最近摘要' : '## Recent Thread Summaries'}\n${recentThreadActivities}\n` : '',
      recentProviderSummary ? `${locale === 'zh' ? '## 最近一次模型服务交互' : '## Latest Provider Interaction'}\n${recentProviderSummary}\n` : '',
      recentLocalRunSummary ? `${locale === 'zh' ? '## 最近一次本地工具运行' : '## Latest Local Tool Run'}\n${recentLocalRunSummary}\n` : '',
      locale === 'zh' ? '## 当前文件上下文' : '## Current File Context',
      fileContext,
      '',
      buildBoundSkillsSection(boundSkills, skillText, locale),
      '',
      locale === 'zh'
        ? '仅补充自上次线程消息以来新增的关键信息，不要重复完整交接模板。'
        : 'Only add delta context since the last thread message. Do not repeat the full handoff template.',
      '',
      checklistInstruction,
    ]
      .filter((entry) => entry.length > 0)
      .join('\n');
  }

  const template = continuityTemplate?.trim() || buildFullPromptTemplate(locale);

  return renderTemplate(template, {
    objective: workbench.objective || (locale === 'zh' ? '尚未填写工作目标。' : 'No work objective has been defined yet.'),
    targetTypeLabel: TARGET_KIND_LABELS[locale][targetKind],
    targetLabel: targetLabel || (locale === 'zh' ? '未选择' : 'Not selected'),
    modelLabel: modelLabel || (locale === 'zh' ? '未指定' : 'Not specified'),
    projectContext: projectContextSummary || (locale === 'zh' ? '暂无项目上下文摘要。' : 'No project context summary yet.'),
    promptBuilderSection: promptBuilderCommand
      ? `${locale === 'zh' ? '## 拆分命令生成器输出' : '## Split Command Builder Output'}\n${promptBuilderCommand}\n`
      : '',
    recentProviderSection: recentProviderSummary
      ? `${locale === 'zh' ? '## 最近一次模型服务交互' : '## Latest Provider Interaction'}\n${recentProviderSummary}\n`
      : '',
    recentLocalRunSection: recentLocalRunSummary
      ? `${locale === 'zh' ? '## 最近一次本地工具运行' : '## Latest Local Tool Run'}\n${recentLocalRunSummary}\n`
      : '',
    completedTasks: completedTasks.length > 0 ? completedTasks.map((task) => `- ${task.title}`).join('\n') : locale === 'zh' ? '- 暂无' : '- None yet',
    remainingTasks: stringifyTaskList(locale, activeTasks, locale === 'zh' ? '1. 先基于目标生成任务清单。' : '1. Generate an initial task list from the objective.'),
    currentFileContext: fileContext,
    boundSkillsSection: buildBoundSkillsSection(boundSkills, skillText, locale),
    checklistInstruction,
  })
    .split('\n')
    .filter((line, index, allLines) => line.trim().length > 0 || (index > 0 && (allLines[index - 1] ?? '').trim().length > 0))
    .join('\n');
};
