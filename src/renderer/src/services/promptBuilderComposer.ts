import type { Locale } from '../../../shared/domain.js';
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
}

const normalizeBlock = (value: string): string => value.trim();

export const buildPromptBuilderCommand = (input: BuildPromptBuilderCommandInput): string => {
  const { locale, config, task, materials, boundaries } = input;
  const normalizedTask = normalizeBlock(task);

  if (!normalizedTask) {
    return '';
  }

  const normalizedMaterials = normalizeBlock(materials);
  const normalizedBoundaries = normalizeBlock(boundaries);

  const templateReferenceHeader = locale === 'zh' ? '读取并严格遵守以下项目模板（内容已内联）:' : 'Read and strictly follow these project templates (inlined below):';
  const taskHeader = locale === 'zh' ? '## 本次任务' : '## Current task';
  const materialsHeader = locale === 'zh' ? '## 资料' : '## Materials';
  const boundariesHeader = locale === 'zh' ? '## 边界' : '## Boundaries';
  const emptyMaterials = locale === 'zh' ? '- 无' : '- None';
  const emptyBoundaries = locale === 'zh' ? '- 无' : '- None';

  const templateBlocks = PROMPT_BUILDER_TEMPLATE_ORDER.flatMap((key) => {
    const fileName = PROMPT_BUILDER_TEMPLATE_FILES[key];
    const content = normalizeBlock(config[key]);
    return [`[config/prompt-builder/${fileName}]`, content];
  });

  return [
    templateReferenceHeader,
    ...PROMPT_BUILDER_TEMPLATE_ORDER.map((key) => `- config/prompt-builder/${PROMPT_BUILDER_TEMPLATE_FILES[key]}`),
    '',
    ...templateBlocks,
    '',
    taskHeader,
    normalizedTask,
    '',
    materialsHeader,
    normalizedMaterials || emptyMaterials,
    '',
    boundariesHeader,
    normalizedBoundaries || emptyBoundaries,
  ]
    .filter((entry) => entry.length > 0)
    .join('\n\n');
};
