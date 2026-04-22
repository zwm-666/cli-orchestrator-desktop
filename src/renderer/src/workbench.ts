import type {
  AppLocale,
  RunSession,
  SkillDefinition,
  WorkbenchActivitySummary,
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

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

const clipDetail = (detail: string, limit = 500): string => {
  const normalizedDetail = detail.trim();
  return normalizedDetail.length > limit ? `${normalizedDetail.slice(0, limit)}…` : normalizedDetail;
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
}): string => {
  const {
    locale,
    workbench,
    selectedFilePath,
    selectedFileContent,
    targetKind,
    targetLabel,
    modelLabel,
    projectContextSummary,
    boundSkills,
    recentProviderSummary,
    recentLocalRunSummary,
  } = input;

  const completedTasks = workbench.tasks.filter((task) => task.status === 'completed');
  const activeTasks = workbench.tasks.filter((task) => task.status !== 'completed');
  const skillText = assembleSkillPromptText(boundSkills);
  const promptBuilderCommand = workbench.promptBuilderCommand?.trim() ?? '';

  if (locale === 'zh') {
    return [
      '# 连续工作交接',
      '',
      '## 当前目标',
      workbench.objective || '尚未填写工作目标。',
      '',
      `## 即将切换到`,
      `- 工具类型：${TARGET_KIND_LABELS[locale][targetKind]}`,
      `- 目标：${targetLabel || '未选择'}`,
      `- 模型：${modelLabel || '未指定'}`,
      '',
      '## 项目上下文',
      projectContextSummary || '暂无项目上下文摘要。',
      '',
      promptBuilderCommand ? `## 拆分命令生成器输出\n${promptBuilderCommand}\n` : '',
      recentProviderSummary ? `## 最近一次模型服务交互\n${recentProviderSummary}\n` : '',
      recentLocalRunSummary ? `## 最近一次本地工具运行\n${recentLocalRunSummary}\n` : '',
      '## 已完成任务',
      completedTasks.length > 0 ? completedTasks.map((task) => `- ${task.title}`).join('\n') : '- 暂无',
      '',
      '## 当前待推进任务',
      activeTasks.length > 0
        ? activeTasks
            .map((task, index) => `${index + 1}. [${WORKBENCH_TASK_STATUS_LABELS[locale][task.status]}] ${task.title}${task.detail ? ` — ${task.detail}` : ''}`)
            .join('\n')
        : '1. 先基于目标生成任务清单。',
      '',
      '## 当前文件上下文',
      selectedFilePath
        ? `- 文件：${selectedFilePath}\n- 片段：\n${selectedFileContent ?? '当前未加载文件内容。'}`
        : '- 当前没有选中文件。',
      '',
      boundSkills.length > 0 ? `## 已绑定技能\n${boundSkills.map((skill) => `- ${skill.name}`).join('\n')}\n\n${skillText}\n` : '',
      '## 下一步要求',
      '- 不要从头重新分析。先延续当前任务清单。',
      '- 完成任务时勾完成；发现新任务时追加。',
      '- 回复要简洁，优先给出下一步可执行动作。',
      '',
      buildChecklistInstruction(locale),
    ]
      .filter((entry) => entry.length > 0)
      .join('\n');
  }

  return [
    '# Continuity Handoff',
    '',
    '## Current Objective',
    workbench.objective || 'No work objective has been defined yet.',
    '',
    '## Switching To',
    `- Tool type: ${targetKind === 'provider' ? 'Hosted Provider' : 'Local Adapter'}`,
    `- Target: ${targetLabel || 'Not selected'}`,
    `- Model: ${modelLabel || 'Not specified'}`,
    '',
    '## Project Context',
    projectContextSummary || 'No project context summary yet.',
    '',
    promptBuilderCommand ? `## Split command builder output\n${promptBuilderCommand}\n` : '',
    recentProviderSummary ? `## Latest Provider Interaction\n${recentProviderSummary}\n` : '',
    recentLocalRunSummary ? `## Latest Local Tool Run\n${recentLocalRunSummary}\n` : '',
    '## Completed Tasks',
    completedTasks.length > 0 ? completedTasks.map((task) => `- ${task.title}`).join('\n') : '- None yet',
    '',
    '## Remaining Tasks',
      activeTasks.length > 0
        ? activeTasks
            .map((task, index) => `${index + 1}. [${WORKBENCH_TASK_STATUS_LABELS[locale][task.status]}] ${task.title}${task.detail ? ` — ${task.detail}` : ''}`)
            .join('\n')
        : '1. Generate an initial task list from the objective.',
    '',
    '## Current File Context',
    selectedFilePath
      ? `- File: ${selectedFilePath}\n- Snippet:\n${selectedFileContent ?? 'The file content is not loaded yet.'}`
      : '- No file is currently selected.',
    '',
    boundSkills.length > 0 ? `## Bound Skills\n${boundSkills.map((skill) => `- ${skill.name}`).join('\n')}\n\n${skillText}\n` : '',
    '## Next-Step Instructions',
    '- Continue from the current checklist instead of restarting analysis.',
    '- Mark tasks complete when done and add newly discovered tasks.',
    '- Keep the answer concise and action-oriented.',
    '',
    buildChecklistInstruction(locale),
  ]
    .filter((entry) => entry.length > 0)
    .join('\n');
};
