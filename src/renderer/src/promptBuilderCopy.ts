import type { Locale } from '../../shared/domain.js';
import { PROMPT_BUILDER_TEMPLATE_FILES, type PromptBuilderTemplateKey } from '../../shared/promptBuilder.js';

export const PROMPT_BUILDER_TEMPLATE_META: Record<
  PromptBuilderTemplateKey,
  { fileName: string; title: Record<Locale, string>; description: Record<Locale, string> }
> = {
  projectContext: {
    fileName: PROMPT_BUILDER_TEMPLATE_FILES.projectContext,
    title: { en: 'Project context', zh: '项目上下文' },
    description: {
      en: 'Shared repository background and current architecture notes.',
      zh: '沉淀项目定位、架构边界和当前工作背景。',
    },
  },
  engineeringRules: {
    fileName: PROMPT_BUILDER_TEMPLATE_FILES.engineeringRules,
    title: { en: 'Engineering rules', zh: '工程规则' },
    description: {
      en: 'Hard constraints for maintainability, layering, and change scope.',
      zh: '沉淀工程约束、可维护性要求和改造边界。',
    },
  },
  outputFormat: {
    fileName: PROMPT_BUILDER_TEMPLATE_FILES.outputFormat,
    title: { en: 'Output format', zh: '输出格式' },
    description: {
      en: 'Defines the expected answer structure for the downstream command.',
      zh: '定义下游命令必须遵守的输出结构。',
    },
  },
};

export const PROMPT_BUILDER_COPY = {
  en: {
    configSectionEyebrow: 'Prompt builder',
    configSectionTitle: 'Command templates & engineering context',
    configSectionCopy: 'Edit the fixed template files stored in config/prompt-builder. Work uses these templates directly when generating the final engineering command.',
    configSave: 'Save prompt builder templates',
    configSaving: 'Saving templates...',
    configSaved: 'Prompt builder templates saved.',
    configLoadFailed: 'Unable to load prompt builder templates.',
    configSaveFailed: 'Unable to save prompt builder templates.',
    workPanelEyebrow: 'Split command builder',
    workPanelTitle: 'Generate a full engineering command from the project templates',
    workPanelCopy: 'Enter the task once, optionally add materials and boundaries, then preview the full command assembled from the repository templates.',
    taskLabel: 'Task',
    taskPlaceholder: 'Describe the implementation or refactor task that should be handed off.',
    materialsLabel: 'Materials',
    materialsPlaceholder: 'Optional: add links, notes, error messages, file paths, or pasted context.',
    boundariesLabel: 'Boundaries',
    boundariesPlaceholder: 'Optional: add constraints, non-goals, validation requirements, or files not to touch.',
    previewLabel: 'Generated command preview',
    copyResult: 'Copy result',
    copied: 'Copied.',
    copyFailed: 'Unable to copy automatically. Copy the preview manually.',
    applyToPrompt: 'Write into prompt',
    clearApplied: 'Clear from prompt',
    applied: 'The generated command has been written into the current prompt flow.',
    sourceTemplates: 'Source templates',
    emptyPreview: 'Enter a task to preview the generated engineering command.',
  },
  zh: {
    configSectionEyebrow: '命令模板',
    configSectionTitle: '命令模板与工程上下文',
    configSectionCopy: '直接编辑保存在 config/prompt-builder 下的固定模板文件。Work 页面会基于这些模板生成最终工程命令。',
    configSave: '保存命令模板',
    configSaving: '保存中...',
    configSaved: '命令模板已保存。',
    configLoadFailed: '无法读取命令模板。',
    configSaveFailed: '无法保存命令模板。',
    workPanelEyebrow: '拆分命令生成器',
    workPanelTitle: '基于项目模板生成完整工程命令',
    workPanelCopy: '输入任务，并按需补充资料与边界，即可预览由仓库模板拼接出的完整工程命令。',
    taskLabel: '任务',
    taskPlaceholder: '描述需要拆分和交接的实现 / 重构任务。',
    materialsLabel: '资料',
    materialsPlaceholder: '可选：补充链接、笔记、错误信息、文件路径或粘贴的上下文。',
    boundariesLabel: '边界',
    boundariesPlaceholder: '可选：补充约束、非目标、验证要求或禁止修改的文件。',
    previewLabel: '最终生成命令预览',
    copyResult: '复制结果',
    copied: '已复制。',
    copyFailed: '自动复制失败，请手动复制预览内容。',
    applyToPrompt: '写入当前提示词',
    clearApplied: '从提示词移除',
    applied: '当前生成命令已写入提示词流程。',
    sourceTemplates: '来源模板',
    emptyPreview: '先填写任务，再预览最终工程命令。',
  },
} as const;
