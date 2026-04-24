import type { Locale, PlanDraft, TaskType } from '../../../shared/domain.js';
import {
  PROMPT_BUILDER_TEMPLATE_FILES,
  PROMPT_BUILDER_TEMPLATE_ORDER,
  type PromptBuilderConfig,
} from '../../../shared/promptBuilder.js';

interface BuildPromptBuilderCommandInput {
  locale: Locale;
  config: PromptBuilderConfig;
  task: string;
  materials: string;
  boundaries: string;
  planDraft: PlanDraft | null;
}

const normalizeBlock = (value: string): string => value.trim();

const TASK_TYPE_LABELS: Record<Locale, Record<TaskType, string>> = {
  en: {
    general: 'General',
    planning: 'Planning',
    code: 'Code',
    frontend: 'Frontend',
    research: 'Research',
    git: 'Git',
    ops: 'Ops',
  },
  zh: {
    general: '通用',
    planning: '规划',
    code: '代码',
    frontend: '前端',
    research: '调研',
    git: 'Git',
    ops: '运维',
  },
};

const CONFIDENCE_LABELS: Record<Locale, Record<'high' | 'medium' | 'low', string>> = {
  en: {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  },
  zh: {
    high: '高',
    medium: '中',
    low: '低',
  },
};

const TASK_TYPE_GUIDANCE: Record<Locale, Record<TaskType, string[]>> = {
  en: {
    general: [
      'Restate the task in executable steps before acting.',
      'Keep output concise and action-oriented.',
    ],
    planning: [
      'Focus on requirements analysis, decomposition, and clear execution planning.',
      'Prefer structured plans, assumptions, and validation checkpoints over implementation details.',
    ],
    code: [
      'Inspect relevant files first, then implement directly with narrow diffs.',
      'Run the most relevant verification commands after changes.',
    ],
    frontend: [
      'Pay attention to layout, UX states, naming, and renderer-side consistency.',
      'Describe visual/interaction changes clearly and verify edge states.',
    ],
    research: [
      'Gather evidence before concluding and separate findings from recommendations.',
      'Prefer source-backed comparisons and concrete tradeoffs.',
    ],
    git: [
      'Be explicit about repository state, proposed git actions, and safety constraints.',
      'Avoid destructive git operations unless explicitly requested.',
    ],
    ops: [
      'Prioritize environment safety, reproducible commands, and rollback awareness.',
      'Highlight operational risks before applying changes.',
    ],
  },
  zh: {
    general: [
      '先把任务重述为可执行步骤，再开始行动。',
      '输出保持简洁，优先可执行结论。',
    ],
    planning: [
      '聚焦需求分析、任务拆解与执行规划。',
      '优先给出结构化计划、假设与验证节点，而不是直接实现细节。',
    ],
    code: [
      '先检查相关文件，再做窄范围实现。',
      '修改后执行最相关的验证命令。',
    ],
    frontend: [
      '重点关注布局、交互状态、命名一致性与 renderer 侧体验。',
      '清楚描述视觉与交互变化，并检查边界状态。',
    ],
    research: [
      '先收集证据再下结论，明确区分事实与建议。',
      '优先引用来源、比较方案并写清取舍。',
    ],
    git: [
      '明确仓库状态、拟执行的 git 操作和安全边界。',
      '除非明确要求，不要执行破坏性 git 操作。',
    ],
    ops: [
      '优先考虑环境安全、命令可复现性与回滚路径。',
      '执行前先指出运维风险。',
    ],
  },
};

const getTemplateSummary = (content: string, locale: Locale): string => {
  const lines = normalizeBlock(content)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return locale === 'zh' ? '使用仓库中的模板文件原文。' : 'Use the full file content from the repository template.';
  }

  return lines.find((line) => !line.startsWith('#')) ?? lines[0] ?? '';
};

export const buildPromptBuilderCommand = (input: BuildPromptBuilderCommandInput): string => {
  const { locale, config, task, materials, boundaries, planDraft } = input;
  const normalizedTask = normalizeBlock(task);

  if (!normalizedTask) {
    return '';
  }

  const normalizedMaterials = normalizeBlock(materials);
  const normalizedBoundaries = normalizeBlock(boundaries);
  const primaryTask = planDraft?.plannedTasks[0] ?? null;
  const taskType = primaryTask?.taskType ?? planDraft?.taskType ?? 'general';
  const cleanedPrompt = (primaryTask ? primaryTask.cleanedPrompt.trim() : '') || (planDraft ? planDraft.cleanedPrompt.trim() : '') || normalizedTask;
  const rationale = (primaryTask ? primaryTask.rationale.trim() : '') || (planDraft ? planDraft.rationale.trim() : '');
  const recommendedAdapter = primaryTask?.recommendedAdapterId ?? planDraft?.recommendedAdapterId ?? null;
  const recommendedModel = primaryTask?.recommendedModel ?? planDraft?.recommendedModel ?? null;
  const confidence = primaryTask?.confidence ?? planDraft?.confidence ?? 'low';
  const plannedTasks = planDraft?.plannedTasks ?? [];
  const taskTypeLabel = TASK_TYPE_LABELS[locale][taskType];
  const confidenceLabel = CONFIDENCE_LABELS[locale][confidence];
  const taskAnalysisHeader = locale === 'zh' ? '## 任务分析' : '## Task analysis';
  const templateHeader = locale === 'zh' ? '## 需要遵守的模板文件' : '## Required project templates';
  const guidanceHeader = locale === 'zh' ? '## 本次执行要求' : '## Execution guidance';
  const taskHeader = locale === 'zh' ? '## 最终任务输入' : '## Final task input';
  const materialsHeader = locale === 'zh' ? '## 资料' : '## Materials';
  const boundariesHeader = locale === 'zh' ? '## 边界' : '## Boundaries';
  const plannedTasksHeader = locale === 'zh' ? '## 拆分后的执行项' : '## Segmented execution items';
  const emptyMaterials = locale === 'zh' ? '- 无' : '- None';
  const emptyBoundaries = locale === 'zh' ? '- 无' : '- None';
  const templateBlocks = PROMPT_BUILDER_TEMPLATE_ORDER.map((key) => {
    const fileName = PROMPT_BUILDER_TEMPLATE_FILES[key];
    const summary = getTemplateSummary(config[key], locale);
    return `- config/prompt-builder/${fileName} — ${summary}`;
  });
  const guidance = TASK_TYPE_GUIDANCE[locale][taskType].map((entry) => `- ${entry}`);
  const plannedTaskLines = plannedTasks.length > 1
    ? plannedTasks.map((entry, index) => `${index + 1}. [${TASK_TYPE_LABELS[locale][entry.taskType]}] ${entry.taskTitle} — ${entry.cleanedPrompt || entry.rationale || entry.classificationReason}`)
    : [];

  return [
    locale === 'zh'
      ? '请先基于任务分析执行本次工作，并在执行前阅读仓库中的模板文件。'
      : 'Execute this task using the analyzed intent below, and read the project template files before acting.',
    '',
    templateHeader,
    ...templateBlocks,
    '',
    taskAnalysisHeader,
    `- ${locale === 'zh' ? '任务类型' : 'Task type'}：${taskTypeLabel}`,
    `- ${locale === 'zh' ? '置信度' : 'Confidence'}：${confidenceLabel}`,
    recommendedAdapter ? `- ${locale === 'zh' ? '建议适配器' : 'Recommended adapter'}：${recommendedAdapter}` : '',
    recommendedModel ? `- ${locale === 'zh' ? '建议模型' : 'Recommended model'}：${recommendedModel}` : '',
    rationale ? `- ${locale === 'zh' ? '分析原因' : 'Rationale'}：${rationale}` : '',
    '',
    plannedTaskLines.length > 0 ? plannedTasksHeader : '',
    ...plannedTaskLines,
    plannedTaskLines.length > 0 ? '' : '',
    guidanceHeader,
    ...guidance,
    '',
    taskHeader,
    cleanedPrompt,
    '',
    materialsHeader,
    normalizedMaterials || emptyMaterials,
    '',
    boundariesHeader,
    normalizedBoundaries || emptyBoundaries,
  ]
    .filter((entry) => entry.length > 0)
    .join('\n');
};
